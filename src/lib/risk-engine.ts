// Advanced Risk Engine — position sizing, ATR stops, RR validation, exposure
// limits, sector concentration, cash buffer, news shock, and risk-pause state.
// Pure functions where possible; the orchestrator `finalRiskGuard` is async
// because it pulls fresh portfolio context from the DB.
//
// PAPER TRADING ONLY. This engine never authorises real-money execution.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sectorOf } from "./sectors";
import { isIDXSymbol, calculateEstimatedCost, LOT_SIZE_IDX } from "./lot-sizing";

export type RiskMode = "conservative" | "balanced" | "progressive" | "expert_research";

export type RiskConfig = {
  mode: RiskMode;
  riskPerTradePct: number;       // % of equity put at risk per trade
  maxDailyLossPct: number;       // |daily P&L|/equity threshold → risk pause
  maxDrawdownPct: number;        // |drawdown| threshold → risk pause
  maxActivePositions: number;
  maxPositionWeightPct: number;  // single position cap (% of equity)
  maxSectorExposurePct: number;  // sector cap (% of equity)
  minCashBufferPct: number;      // cash floor after entry (% of equity)
  maxTradesPerDay: number;
  maxLossesPerDay: number;
  atrStopEnabled: boolean;
  atrStopMultiplier: number;
  volatilitySizingEnabled: boolean;
  correlationRiskEnabled: boolean;
  liquidityRiskEnabled: boolean;
  newsShockRiskEnabled: boolean;
  circuitBreakerEnabled: boolean;
};

export const RISK_PROFILES: Record<RiskMode, { atrMult: number; minRR: number; rrPenaltyHighVol: number }> = {
  conservative:    { atrMult: 1.5, minRR: 1.8, rrPenaltyHighVol: 0.3 },
  balanced:        { atrMult: 1.8, minRR: 1.5, rrPenaltyHighVol: 0.25 },
  progressive:     { atrMult: 1.3, minRR: 1.2, rrPenaltyHighVol: 0.2 },
  expert_research: { atrMult: 1.0, minRR: 1.0, rrPenaltyHighVol: 0.15 },
};

export type RiskInput = {
  agent: any;                    // ai_trade_agents row
  symbol: string;
  entryPrice: number;
  /** Optional ATR % (volatility) — preferred for stop placement */
  atrPct?: number | null;
  /** Optional structural stop distance % already computed (eg from signals) */
  structuralStopPct?: number | null;
  /** Volatility label (low|medium|high) */
  volatilityLabel?: "low" | "medium" | "high" | null;
  /** Average value traded (IDR) — liquidity proxy */
  valueTradedIDR?: number | null;
  /** News snapshot (negative count, high impact, disclosure) */
  newsSnapshot?: {
    negativeNewsCount?: number;
    highImpactNewsCount?: number;
    hasNegativeDisclosure?: boolean;
    disclosureTitle?: string | null;
  } | null;
  /** Market regime label */
  marketRegime?: string | null;
};

export type RiskGuardResult = {
  allowed: boolean;
  blockedReason: string | null;
  riskLevel: "low" | "moderate" | "elevated" | "high";
  positionSize: number;       // notional IDR
  lot: number;
  shares: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  riskAmount: number;
  stopDistancePct: number | null;
  stopMode: "atr" | "structural" | "percent" | "none";
  warnings: string[];
  guards: {
    activePositions: { current: number; max: number; ok: boolean };
    positionWeight: { projectedPct: number; max: number; ok: boolean };
    sectorExposure: { sector: string; projectedPct: number; max: number; ok: boolean };
    cashBuffer: { projectedPct: number; min: number; ok: boolean };
    riskReward: { rr: number | null; min: number; ok: boolean };
    liquidity: { valueTradedIDR: number | null; ok: boolean };
    newsShock: { ok: boolean; reason?: string };
    riskPause: { active: boolean; until?: string | null; reason?: string | null };
  };
};

export function readRiskConfig(agent: any): RiskConfig {
  const mode = (agent?.autonomous_risk_mode ?? "balanced") as RiskMode;
  return {
    mode,
    riskPerTradePct: Number(agent?.risk_per_trade_pct ?? 0.01),
    maxDailyLossPct: Number(agent?.max_daily_loss ?? 0.02),
    maxDrawdownPct: Number(agent?.max_drawdown ?? 0.05),
    maxActivePositions: Number(agent?.max_active_positions ?? 3),
    maxPositionWeightPct: Number(agent?.max_position_weight_pct ?? agent?.max_position_per_symbol ?? 0.25),
    maxSectorExposurePct: Number(agent?.max_sector_exposure_pct ?? 0.40),
    minCashBufferPct: Number(agent?.min_cash_buffer_pct ?? 0.05),
    maxTradesPerDay: Number(agent?.max_daily_trades ?? 5),
    maxLossesPerDay: Number(agent?.max_losses_per_day ?? 3),
    atrStopEnabled: agent?.atr_stop_enabled !== false,
    atrStopMultiplier: Number(agent?.atr_stop_multiplier ?? RISK_PROFILES[mode]?.atrMult ?? 1.5),
    volatilitySizingEnabled: agent?.volatility_sizing_enabled !== false,
    correlationRiskEnabled: agent?.correlation_risk_enabled !== false,
    liquidityRiskEnabled: agent?.liquidity_risk_enabled !== false,
    newsShockRiskEnabled: agent?.news_shock_risk_enabled !== false,
    circuitBreakerEnabled: agent?.circuit_breaker_enabled !== false,
  };
}

/** Volatility-adjusted multiplier for risk-per-trade. */
export function volatilityFactor(label?: string | null): number {
  if (label === "high") return 0.6;
  if (label === "medium") return 0.85;
  return 1.0;
}

/** Regime multiplier. risk_off cuts allocation. */
export function regimeFactor(regime?: string | null): number {
  const r = (regime ?? "").toLowerCase();
  if (r.includes("risk_off") || r.includes("bearish") || r.includes("crash")) return 0.5;
  if (r.includes("volatile") || r.includes("choppy") || r.includes("neutral")) return 0.85;
  if (r.includes("bullish") || r.includes("risk_on") || r.includes("trending_up")) return 1.0;
  return 0.9;
}

/** Computes a stop distance % using ATR if available, else structural, else preset fallback. */
function computeStopDistance(
  cfg: RiskConfig,
  input: RiskInput,
): { stopDistancePct: number; stopMode: RiskGuardResult["stopMode"] } {
  if (cfg.atrStopEnabled && Number.isFinite(input.atrPct ?? NaN) && (input.atrPct ?? 0) > 0) {
    return {
      stopDistancePct: Math.min(0.15, (input.atrPct as number) * cfg.atrStopMultiplier / 100),
      stopMode: "atr",
    };
  }
  if (Number.isFinite(input.structuralStopPct ?? NaN) && (input.structuralStopPct ?? 0) > 0) {
    return {
      stopDistancePct: Math.min(0.15, (input.structuralStopPct as number) / 100),
      stopMode: "structural",
    };
  }
  // Fallback per mode
  const fallback: Record<RiskMode, number> = {
    conservative: 0.015, balanced: 0.025, progressive: 0.035, expert_research: 0.045,
  };
  return { stopDistancePct: fallback[cfg.mode] ?? 0.025, stopMode: "percent" };
}

/** Round shares to IDX lot multiples. */
function roundToLot(shares: number, symbol: string): { shares: number; lot: number } {
  if (!isIDXSymbol(symbol)) {
    const s = Math.max(0, Math.floor(shares));
    return { shares: s, lot: s };
  }
  const lot = Math.max(0, Math.floor(shares / LOT_SIZE_IDX));
  return { shares: lot * LOT_SIZE_IDX, lot };
}

/** Main entry point. Async because it loads portfolio + account snapshots. */
export async function finalRiskGuard(input: RiskInput): Promise<RiskGuardResult> {
  const cfg = readRiskConfig(input.agent);
  const warnings: string[] = [];

  // ----- Risk pause check (BUY-only block) -----
  const pausedUntil = input.agent?.risk_paused_until
    ? new Date(input.agent.risk_paused_until).getTime()
    : 0;
  const pauseActive = pausedUntil > Date.now();

  // ----- Portfolio snapshot -----
  const USER_ID = "00000000-0000-0000-0000-000000000001";
  const { data: account } = await supabaseAdmin
    .from("paper_accounts")
    .select("cash, equity, initial_balance")
    .eq("user_id", USER_ID).maybeSingle();
  const { data: positions } = await supabaseAdmin
    .from("paper_positions").select("symbol, qty, avg_price")
    .eq("user_id", USER_ID);

  const cash = Number(account?.cash ?? 0);
  const posList = (positions ?? []) as Array<{ symbol: string; qty: number; avg_price: number }>;
  // Approximate holdings at cost basis (avoids extra quote fan-out).
  let holdingsValue = 0;
  const valueBySector: Record<string, number> = {};
  for (const p of posList) {
    const v = Number(p.qty) * Number(p.avg_price);
    holdingsValue += v;
    const sec = sectorOf(p.symbol) ?? "Unknown";
    valueBySector[sec] = (valueBySector[sec] ?? 0) + v;
  }
  const equity = Math.max(1, cash + holdingsValue);

  // ----- Stop loss + risk-based shares -----
  const { stopDistancePct, stopMode } = computeStopDistance(cfg, input);
  const stopLoss = +(input.entryPrice * (1 - stopDistancePct)).toFixed(2);

  // Volatility-adjusted risk per trade
  const volFactor = cfg.volatilitySizingEnabled ? volatilityFactor(input.volatilityLabel) : 1;
  const regFactor = regimeFactor(input.marketRegime);
  const effectiveRiskPct = cfg.riskPerTradePct * volFactor * regFactor;
  const riskAmount = Math.max(0, equity * effectiveRiskPct);
  const perShareRisk = Math.max(0.01, input.entryPrice - stopLoss);
  const rawShares = riskAmount / perShareRisk;

  const { shares, lot } = roundToLot(rawShares, input.symbol);
  const notional = shares * input.entryPrice;
  const estCost = calculateEstimatedCost(shares, input.entryPrice);

  // Take profit & RR (target = entry + min RR * risk)
  const minRR = RISK_PROFILES[cfg.mode]?.minRR ?? 1.5;
  // Volatility penalty for RR on choppy markets
  const rrPenalty = volFactor < 1 ? RISK_PROFILES[cfg.mode].rrPenaltyHighVol : 0;
  const targetRR = minRR + rrPenalty;
  const takeProfit = +(input.entryPrice + perShareRisk * targetRR).toFixed(2);
  const rr = (takeProfit - input.entryPrice) / perShareRisk;

  // ----- Guards -----
  const sector = sectorOf(input.symbol) ?? "Unknown";
  const sectorCurrent = valueBySector[sector] ?? 0;
  const sectorProjected = (sectorCurrent + notional) / equity;
  const sectorOk = sectorProjected <= cfg.maxSectorExposurePct;

  const positionWeight = notional / equity;
  const weightOk = positionWeight <= cfg.maxPositionWeightPct;

  const projectedCash = cash - estCost;
  const cashPct = projectedCash / equity;
  const cashOk = cashPct >= cfg.minCashBufferPct;

  const activeCurrent = posList.length;
  const alreadyHolding = posList.some((p) => p.symbol === input.symbol);
  const activeMax = cfg.maxActivePositions;
  const activeOk = alreadyHolding || activeCurrent < activeMax;

  const rrOk = rr >= minRR;

  // Liquidity check (best-effort, only when data provided)
  const minValueTraded = 2_000_000_000; // 2bn IDR/day floor
  const liquidityOk = !cfg.liquidityRiskEnabled
    || input.valueTradedIDR == null
    || input.valueTradedIDR >= minValueTraded;

  // News shock check
  const news = input.newsSnapshot ?? {};
  const newsShockReason =
    cfg.newsShockRiskEnabled && news.hasNegativeDisclosure
      ? "negative_disclosure_detected"
      : cfg.newsShockRiskEnabled
        && (news.negativeNewsCount ?? 0) >= 3
        && (news.highImpactNewsCount ?? 0) >= 1
      ? "news_shock_risk"
      : undefined;
  const newsOk = !newsShockReason;

  // ----- Decide blocked reason (ordered by severity) -----
  let blockedReason: string | null = null;
  if (pauseActive) blockedReason = "risk_pause_active";
  else if (lot < 1) blockedReason = "lot_below_minimum";
  else if (estCost > cash) blockedReason = "insufficient_balance";
  else if (!activeOk) blockedReason = "max_active_positions_reached";
  else if (!weightOk) blockedReason = "max_position_weight_reached";
  else if (cfg.correlationRiskEnabled && !sectorOk) blockedReason = "sector_exposure_limit";
  else if (!cashOk) blockedReason = "cash_buffer_required";
  else if (!liquidityOk) blockedReason = "low_liquidity";
  else if (!rrOk) blockedReason = "risk_reward_invalid";
  else if (newsShockReason) blockedReason = newsShockReason;

  // Warnings collected even when allowed
  if (volFactor < 1) warnings.push(`Volatility ${input.volatilityLabel ?? "elevated"} — risk per trade dikurangi ke ${(effectiveRiskPct * 100).toFixed(2)}%.`);
  if (regFactor < 1) warnings.push(`Market regime ${input.marketRegime ?? "neutral"} — allocation factor ${regFactor.toFixed(2)}×.`);
  if (sectorProjected > cfg.maxSectorExposurePct * 0.8) warnings.push(`Sector ${sector} mendekati limit (${(sectorProjected*100).toFixed(1)}% vs cap ${(cfg.maxSectorExposurePct*100).toFixed(0)}%).`);
  if (cashPct < cfg.minCashBufferPct * 1.5) warnings.push(`Cash buffer projeksi ${(cashPct*100).toFixed(1)}% mendekati floor ${(cfg.minCashBufferPct*100).toFixed(0)}%.`);

  // Risk level summary
  const severeFlags = [!activeOk, !weightOk, !sectorOk, !cashOk, !rrOk, !newsOk, !liquidityOk].filter(Boolean).length;
  const riskLevel: RiskGuardResult["riskLevel"] =
    severeFlags >= 3 ? "high" : severeFlags === 2 ? "elevated" : severeFlags === 1 ? "moderate" : "low";

  return {
    allowed: !blockedReason,
    blockedReason,
    riskLevel,
    positionSize: +notional.toFixed(2),
    lot,
    shares,
    stopLoss,
    takeProfit,
    riskRewardRatio: +rr.toFixed(2),
    riskAmount: +riskAmount.toFixed(2),
    stopDistancePct: +(stopDistancePct * 100).toFixed(2),
    stopMode,
    warnings,
    guards: {
      activePositions: { current: activeCurrent, max: activeMax, ok: activeOk },
      positionWeight: { projectedPct: +(positionWeight * 100).toFixed(2), max: +(cfg.maxPositionWeightPct * 100).toFixed(2), ok: weightOk },
      sectorExposure: { sector, projectedPct: +(sectorProjected * 100).toFixed(2), max: +(cfg.maxSectorExposurePct * 100).toFixed(2), ok: sectorOk },
      cashBuffer: { projectedPct: +(cashPct * 100).toFixed(2), min: +(cfg.minCashBufferPct * 100).toFixed(2), ok: cashOk },
      riskReward: { rr: +rr.toFixed(2), min: minRR, ok: rrOk },
      liquidity: { valueTradedIDR: input.valueTradedIDR ?? null, ok: liquidityOk },
      newsShock: { ok: newsOk, reason: newsShockReason },
      riskPause: {
        active: pauseActive,
        until: input.agent?.risk_paused_until ?? null,
        reason: input.agent?.risk_pause_reason ?? null,
      },
    },
  };
}

/**
 * Evaluate post-fill / post-loss state and persist a risk pause if any
 * circuit-breaker is tripped. Returns the pause that was applied (or null).
 */
export async function evaluateCircuitBreaker(agentId: string): Promise<
  { paused: true; reason: string; untilISO: string } | { paused: false }
> {
  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("*")
    .eq("id", agentId).maybeSingle();
  if (!agent || agent.circuit_breaker_enabled === false) return { paused: false };

  const cfg = readRiskConfig(agent);

  // Daily P&L
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data: todayOrders } = await supabaseAdmin
    .from("paper_orders")
    .select("realized_pnl, side")
    .eq("agent_id", agentId)
    .eq("status", "filled")
    .gte("created_at", since.toISOString());
  const dailyPnl = (todayOrders ?? []).reduce((s, o: any) => s + Number(o.realized_pnl ?? 0), 0);
  const lossesToday = (todayOrders ?? []).filter((o: any) => Number(o.realized_pnl) < 0).length;

  const { data: acct } = await supabaseAdmin
    .from("paper_accounts").select("equity").eq("id", agent.paper_account_id).maybeSingle();
  const equity = Number(acct?.equity ?? 0);
  const dailyPnlPct = equity > 0 ? dailyPnl / equity : 0;

  // Latest drawdown from risk snapshots
  const { data: lastSnap } = await supabaseAdmin
    .from("portfolio_risk_snapshots")
    .select("current_drawdown")
    .eq("paper_account_id", agent.paper_account_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const drawdownPct = Math.abs(Number(lastSnap?.current_drawdown ?? 0)) / 100;

  let reason: string | null = null;
  if (dailyPnlPct <= -cfg.maxDailyLossPct) reason = "daily_loss_limit_reached";
  else if (drawdownPct >= cfg.maxDrawdownPct) reason = "drawdown_limit_reached";
  else if (lossesToday >= cfg.maxLossesPerDay) reason = "max_losses_per_day_reached";
  else if (Number(agent.consecutive_losses ?? 0) >= 4) reason = "consecutive_losses_limit";

  if (!reason) return { paused: false };

  const until = new Date();
  // Pause until end of trading day (UTC midnight is safe + simple).
  until.setUTCHours(23, 59, 59, 999);
  const untilISO = until.toISOString();

  await supabaseAdmin
    .from("ai_trade_agents")
    .update({
      risk_paused_until: untilISO,
      risk_pause_reason: reason,
      last_blocked_reason: reason,
    })
    .eq("id", agentId);

  await supabaseAdmin.from("ai_agent_risk_logs").insert({
    agent_id: agentId, risk_type: "circuit_breaker", risk_level: "critical",
    message: `Risk pause until ${untilISO}: ${reason}`, action_taken: "block_new_buys",
  });

  return { paused: true, reason, untilISO };
}
