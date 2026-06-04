// Loss-Protection Engine for the AI Trade Agent.
// PAPER TRADING ONLY. Layers above existing risk-engine + position management:
//   - Symbol cooldown after losing trades (tiered 1 / 3 / 10 sessions)
//   - Strategy kill switch (auto-pause after sample≥5 with poor stats)
//   - Global guards: max trades / symbol / day, daily loss caps, consec losses
//   - Minimum holding period for SELL (bypassed by SL/TP/disclosure/emergency)
//   - Trade-quality gate (min score per aggression mode)
//   - Post-trade outcome recorder → updates cooldowns + strategy_health + state
//   - Account diagnostic snapshot for the UI / chat
//
// Reads/writes the new tables: symbol_trade_cooldowns, strategy_health, plus
// new columns on ai_trade_agents (diagnostic_status, protection_mode_active).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { qualityThresholdFor } from "./trade-quality";

// One IDX trading "session" ≈ 1 calendar day for cooldown purposes.
const SESSION_MS = 24 * 3600_000;
const SEVEN_DAYS_MS = 7 * SESSION_MS;
const FOURTEEN_DAYS_MS = 14 * SESSION_MS;

export type GuardReason =
  | "loss_protection_active"
  | "protection_mode_active"
  | "observation_mode_active"
  | "daily_loss_cap_reached"
  | "consecutive_losses_cap_reached"
  | "max_trades_per_day_reached"
  | "max_trades_per_symbol_per_day_reached"
  | "max_drawdown_reached"
  | "overtrading_guard_active"
  | "symbol_cooldown_active"
  | "strategy_paused_due_to_poor_performance"
  | "quality_score_too_low"
  | "min_rr_not_met"
  | "min_stop_distance_invalid"
  | "regime_risk_off_setup_too_weak"
  | "min_hold_not_reached";

export type BuyGuardInput = {
  agent: any;                          // full ai_trade_agents row
  symbol: string;
  strategy: string;
  qualityScore: number;
  riskRewardRatio: number | null;
  stopDistancePct: number | null;
  marketRegime?: string | null;
};

export type BuyGuardResult = {
  allow: boolean;
  reasons: GuardReason[];
  diagnostics: Record<string, unknown>;
};

export type SellGuardInput = {
  agent: any;
  symbol: string;
  positionOpenedAt: string | Date | null;
  exitReason: string | null;           // stop_loss_triggered / take_profit_triggered / trailing_stop_triggered / disclosure_exit / risk_exit / null
};

export type SellGuardResult = {
  allow: boolean;
  reasons: GuardReason[];
  minHoldMinutes: number;
};

// ────────────────────────────────────────────────────────────────────────────
// READ: cooldowns / strategy health
// ────────────────────────────────────────────────────────────────────────────

export async function getSymbolCooldown(agentId: string, symbol: string) {
  const { data } = await supabaseAdmin
    .from("symbol_trade_cooldowns")
    .select("*").eq("agent_id", agentId).eq("symbol", symbol).maybeSingle();
  return data as any | null;
}

export async function getStrategyHealth(agentId: string, strategy: string) {
  const { data } = await supabaseAdmin
    .from("strategy_health")
    .select("*").eq("agent_id", agentId).eq("strategy", strategy).maybeSingle();
  return data as any | null;
}

// ────────────────────────────────────────────────────────────────────────────
// BUY guard
// ────────────────────────────────────────────────────────────────────────────

export async function evaluateBuyGuards(input: BuyGuardInput): Promise<BuyGuardResult> {
  const { agent, symbol, strategy, qualityScore, riskRewardRatio, stopDistancePct, marketRegime } = input;
  const reasons: GuardReason[] = [];
  const diag: Record<string, unknown> = {};

  // Mode-level lockouts
  const status = String(agent.diagnostic_status ?? "NORMAL");
  if (status === "LOSS_PROTECTION_ACTIVE") reasons.push("loss_protection_active");
  if (status === "PROTECTION_MODE" || agent.protection_mode_active) reasons.push("protection_mode_active");
  if (status === "OBSERVATION_MODE") reasons.push("observation_mode_active");

  // Aggregate daily stats (per agent)
  const sinceDay = new Date(Date.now() - SESSION_MS).toISOString();
  const { data: dayOrders } = await supabaseAdmin
    .from("paper_orders")
    .select("symbol, side, realized_pnl, filled_at, status")
    .eq("agent_id", agent.id).eq("status", "filled")
    .gte("filled_at", sinceDay);
  const orders = (dayOrders ?? []) as any[];
  const trades = orders.filter(o => o.side === "buy").length;
  const sells = orders.filter(o => o.side === "sell");
  const realizedToday = sells.reduce((s, o) => s + Number(o.realized_pnl ?? 0), 0);
  const lossesToday = sells.filter(o => Number(o.realized_pnl) < 0).length;
  const symbolTradesToday = orders.filter(o => o.symbol === symbol && o.side === "buy").length;

  const maxTradesPerDay = Number(agent.max_trades_per_day ?? agent.max_daily_trades ?? 5);
  const maxTradesPerSymbolPerDay = Number(agent.max_trades_per_symbol_per_day ?? 1);
  const equity = Number(agent.equity ?? 0);
  const maxDailyLossPct = Number(agent.max_daily_loss_pct ?? agent.max_daily_loss ?? 0.01);
  const maxConsec = Number(agent.max_consecutive_losses ?? agent.max_losses_per_day ?? 3);

  diag.tradesToday = trades;
  diag.symbolTradesToday = symbolTradesToday;
  diag.realizedToday = realizedToday;
  diag.lossesToday = lossesToday;

  if (trades >= maxTradesPerDay && agent.overtrading_guard_enabled !== false) {
    reasons.push("max_trades_per_day_reached");
  }
  if (symbolTradesToday >= maxTradesPerSymbolPerDay && agent.overtrading_guard_enabled !== false) {
    reasons.push("max_trades_per_symbol_per_day_reached");
  }
  if (Number(agent.consecutive_losses ?? 0) >= maxConsec) {
    reasons.push("consecutive_losses_cap_reached");
  }
  // Estimate equity for daily-loss % cap
  if (equity > 0 && realizedToday < 0) {
    const pct = Math.abs(realizedToday) / equity;
    diag.dailyLossPct = pct;
    if (pct >= maxDailyLossPct) reasons.push("daily_loss_cap_reached");
  }

  // Symbol cooldown
  if (agent.symbol_cooldown_enabled !== false) {
    const cd = await getSymbolCooldown(agent.id, symbol);
    if (cd?.cooldown_until && new Date(cd.cooldown_until).getTime() > Date.now()) {
      diag.cooldown = cd;
      reasons.push("symbol_cooldown_active");
    }
  }

  // Strategy kill switch
  if (agent.strategy_kill_switch_enabled !== false && strategy) {
    const sh = await getStrategyHealth(agent.id, strategy);
    if (sh && sh.status === "PAUSED_FOR_REVIEW") {
      diag.strategyHealth = sh;
      reasons.push("strategy_paused_due_to_poor_performance");
    }
  }

  // Quality threshold (aggression-mode aware)
  const aggression = String(agent.aggression_mode ?? "balanced");
  const minQ = Number(agent.min_trade_quality_score ?? qualityThresholdFor(aggression));
  diag.qualityScore = qualityScore;
  diag.minQualityScore = minQ;
  if (qualityScore < minQ) reasons.push("quality_score_too_low");

  // Min RR
  const minRR = Number(agent.min_risk_reward ?? 2.0);
  diag.riskRewardRatio = riskRewardRatio;
  diag.minRR = minRR;
  if (riskRewardRatio == null || riskRewardRatio < minRR) reasons.push("min_rr_not_met");

  // Min stop distance (≥1.2x ATR proxy → enforce ≥1% sane floor) — block if invalid
  if (stopDistancePct == null || stopDistancePct <= 0 || stopDistancePct < 1.0) {
    reasons.push("min_stop_distance_invalid");
    diag.stopDistancePct = stopDistancePct;
  }

  // Risk-off regime requires stronger quality + RR
  const regime = String(marketRegime ?? "").toLowerCase();
  const riskOff = /risk_off|bear|defensive|crash/.test(regime);
  if (agent.risk_off_filter_enabled !== false && riskOff) {
    diag.regime = regime;
    if (qualityScore < 80 || (riskRewardRatio ?? 0) < 2.0) {
      reasons.push("regime_risk_off_setup_too_weak");
    }
  }

  return { allow: reasons.length === 0, reasons, diagnostics: diag };
}

// ────────────────────────────────────────────────────────────────────────────
// SELL guard (minimum holding period)
// ────────────────────────────────────────────────────────────────────────────

const SAFE_EXIT_REASONS = new Set([
  "stop_loss_triggered",
  "take_profit_triggered",
  "trailing_stop_triggered",
  "disclosure_exit",
  "risk_exit",
  "circuit_breaker_exit",
  "regime_emergency",
  "data_invalidation",
]);

export function evaluateSellGuards(input: SellGuardInput): SellGuardResult {
  const minHold = Math.max(0, Number(input.agent.min_hold_minutes ?? 30));
  if (!input.positionOpenedAt) return { allow: true, reasons: [], minHoldMinutes: minHold };
  if (input.exitReason && SAFE_EXIT_REASONS.has(input.exitReason)) {
    return { allow: true, reasons: [], minHoldMinutes: minHold };
  }
  const openedMs = new Date(input.positionOpenedAt).getTime();
  const ageMin = (Date.now() - openedMs) / 60_000;
  if (ageMin < minHold) {
    return { allow: false, reasons: ["min_hold_not_reached"], minHoldMinutes: minHold };
  }
  return { allow: true, reasons: [], minHoldMinutes: minHold };
}

// ────────────────────────────────────────────────────────────────────────────
// POST-TRADE: record outcome → update cooldowns, strategy health, agent state
// ────────────────────────────────────────────────────────────────────────────

function cooldownTierMs(loss_count: number): number {
  if (loss_count >= 3) return 10 * SESSION_MS;
  if (loss_count >= 2) return 3 * SESSION_MS;
  return SESSION_MS;
}

export async function recordTradeOutcome(opts: {
  agentId: string;
  userId: string;
  symbol: string;
  strategy: string | null;
  realizedPnl: number;
  realizedPnlPct: number | null;
  marketRegime?: string | null;
}) {
  const { agentId, userId, symbol, strategy, realizedPnl, realizedPnlPct } = opts;
  const isLoss = realizedPnl < 0;
  const isWin = realizedPnl > 0;
  const pct = Number(realizedPnlPct ?? 0);

  // 1) Symbol cooldown — only on loss
  if (isLoss) {
    const existing = await getSymbolCooldown(agentId, symbol);
    const now = Date.now();
    const recent = existing?.last_loss_at ? new Date(existing.last_loss_at).getTime() : 0;
    let count = 1;
    if (existing) {
      if (now - recent <= FOURTEEN_DAYS_MS) count = Math.min(10, Number(existing.loss_count ?? 0) + 1);
    }
    // Tier mapping per patch spec
    let cooldownMs = SESSION_MS;
    if (count >= 3 && now - recent <= FOURTEEN_DAYS_MS) cooldownMs = 10 * SESSION_MS;
    else if (count >= 2 && now - recent <= SEVEN_DAYS_MS) cooldownMs = 3 * SESSION_MS;
    else cooldownMs = cooldownTierMs(1);
    const cooldownUntil = new Date(now + cooldownMs).toISOString();

    const payload = {
      agent_id: agentId, user_id: userId, symbol,
      reason: `loss_${count}_in_window`,
      loss_count: count,
      last_loss_at: new Date(now).toISOString(),
      cooldown_until: cooldownUntil,
      updated_at: new Date(now).toISOString(),
    };
    if (existing) {
      await supabaseAdmin.from("symbol_trade_cooldowns").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("symbol_trade_cooldowns").insert(payload);
    }
  } else if (isWin) {
    // Decay cooldown on win
    const existing = await getSymbolCooldown(agentId, symbol);
    if (existing) {
      const decay = Math.max(0, Number(existing.loss_count ?? 0) - 1);
      await supabaseAdmin.from("symbol_trade_cooldowns")
        .update({ loss_count: decay, cooldown_until: null, reason: "win_decay" })
        .eq("id", existing.id);
    }
  }

  // 2) Strategy health
  if (strategy) {
    const sh = await getStrategyHealth(agentId, strategy);
    const trades = Number(sh?.trades ?? 0) + 1;
    const wins = Number(sh?.wins ?? 0) + (isWin ? 1 : 0);
    const losses = Number(sh?.losses ?? 0) + (isLoss ? 1 : 0);
    const grossProfit = Number(sh?.gross_profit ?? 0) + (isWin ? realizedPnl : 0);
    const grossLoss = Number(sh?.gross_loss ?? 0) + (isLoss ? Math.abs(realizedPnl) : 0);
    const consec = isLoss ? Number(sh?.consec_losses ?? 0) + 1 : 0;
    const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(3) : (grossProfit > 0 ? 999 : 0);
    const avgReturn = trades > 0
      ? +(((Number(sh?.avg_return ?? 0) * (trades - 1)) + pct) / trades).toFixed(3)
      : pct;

    // Kill switch logic
    let status = String(sh?.status ?? "ACTIVE");
    let pausedReason: string | null = sh?.paused_reason ?? null;
    if (trades >= 5) {
      const winRate = wins / trades;
      if (winRate < 0.30) { status = "PAUSED_FOR_REVIEW"; pausedReason = "win_rate<30%"; }
      else if (profitFactor < 0.7) { status = "PAUSED_FOR_REVIEW"; pausedReason = "profit_factor<0.7"; }
      else if (avgReturn < -1.5) { status = "PAUSED_FOR_REVIEW"; pausedReason = "avg_return<-1.5%"; }
      else if (consec >= 3) { status = "PAUSED_FOR_REVIEW"; pausedReason = "consec_losses>=3"; }
    }

    const payload = {
      agent_id: agentId, user_id: userId, strategy,
      trades, wins, losses, consec_losses: consec,
      gross_profit: grossProfit, gross_loss: grossLoss,
      avg_return: avgReturn, profit_factor: profitFactor,
      status, paused_reason: pausedReason,
      paused_at: status === "PAUSED_FOR_REVIEW" && !sh?.paused_at ? new Date().toISOString() : sh?.paused_at ?? null,
      last_trade_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (sh) await supabaseAdmin.from("strategy_health").update(payload).eq("id", sh.id);
    else await supabaseAdmin.from("strategy_health").insert(payload);
  }

  // 3) Re-evaluate agent diagnostic / protection mode
  await refreshAgentDiagnostic(agentId);
}

// ────────────────────────────────────────────────────────────────────────────
// Account diagnostic refresh — sets diagnostic_status + summary
// ────────────────────────────────────────────────────────────────────────────

export async function refreshAgentDiagnostic(agentId: string) {
  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) return null;

  // Last 50 sells
  const { data: sells } = await supabaseAdmin
    .from("paper_orders")
    .select("symbol, realized_pnl, filled_at")
    .eq("agent_id", agentId).eq("side", "sell").eq("status", "filled")
    .order("filled_at", { ascending: false }).limit(50);
  const list = (sells ?? []) as any[];
  const closed = list.length;
  const wins = list.filter(o => Number(o.realized_pnl) > 0).length;
  const losses = list.filter(o => Number(o.realized_pnl) < 0).length;
  const grossProfit = list.filter(o => Number(o.realized_pnl) > 0)
    .reduce((s, o) => s + Number(o.realized_pnl), 0);
  const grossLoss = Math.abs(list.filter(o => Number(o.realized_pnl) < 0)
    .reduce((s, o) => s + Number(o.realized_pnl), 0));
  const winRate = closed > 0 ? wins / closed : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

  // Worst symbol & strategy
  const bySym = new Map<string, { pnl: number; n: number; losses: number }>();
  for (const o of list) {
    const e = bySym.get(o.symbol) ?? { pnl: 0, n: 0, losses: 0 };
    e.pnl += Number(o.realized_pnl); e.n += 1;
    if (Number(o.realized_pnl) < 0) e.losses += 1;
    bySym.set(o.symbol, e);
  }
  const worstSymbols = [...bySym.entries()]
    .sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 3)
    .map(([sym, v]) => ({ symbol: sym, pnl: +v.pnl.toFixed(2), trades: v.n, losses: v.losses }));

  const { data: strategies } = await supabaseAdmin
    .from("strategy_health").select("*").eq("agent_id", agentId);
  const worstStrategy = (strategies ?? []).slice().sort((a: any, b: any) =>
    Number(a.profit_factor) - Number(b.profit_factor))[0] ?? null;
  const pausedStrategies = (strategies ?? []).filter((s: any) => s.status === "PAUSED_FOR_REVIEW").length;

  const { data: cooldowns } = await supabaseAdmin
    .from("symbol_trade_cooldowns").select("symbol, cooldown_until")
    .eq("agent_id", agentId).gt("cooldown_until", new Date().toISOString());
  const activeCooldowns = (cooldowns ?? []).length;

  // Determine mode
  const maxConsec = Number(agent.max_consecutive_losses ?? 3);
  const minPF = Number(agent.min_profit_factor_threshold ?? 0.8);
  const minWR = Number(agent.min_win_rate_threshold ?? 0.35);
  let mode: string = "NORMAL";
  let reason: string | null = null;
  let protectionActive = false;

  if (Number(agent.consecutive_losses ?? 0) >= maxConsec) {
    mode = "LOSS_PROTECTION_ACTIVE";
    reason = `Consecutive losses ${agent.consecutive_losses} >= ${maxConsec}`;
  } else if (closed >= 10 && (winRate < minWR || profitFactor < minPF)) {
    mode = "PROTECTION_MODE";
    protectionActive = true;
    reason = `WR ${(winRate * 100).toFixed(0)}% / PF ${profitFactor.toFixed(2)} below threshold (n=${closed})`;
  } else if (closed >= 5 && winRate < 0.30) {
    mode = "OBSERVATION_MODE";
    reason = `Win rate ${(winRate * 100).toFixed(0)}% — observation only (n=${closed})`;
  } else if (pausedStrategies > 0) {
    mode = "STRATEGY_PAUSED";
    reason = `${pausedStrategies} strategi dipause oleh kill-switch`;
  } else if (activeCooldowns > 0 || losses >= 3) {
    mode = "CAUTION";
    reason = `${activeCooldowns} cooldown aktif · ${losses} loss recent`;
  }

  const summary = {
    closedTrades: closed, wins, losses,
    winRate: +winRate.toFixed(3),
    profitFactor: +Number(profitFactor).toFixed(3),
    grossProfit: +grossProfit.toFixed(2),
    grossLoss: +grossLoss.toFixed(2),
    worstSymbols,
    worstStrategy: worstStrategy ? {
      strategy: worstStrategy.strategy,
      trades: worstStrategy.trades,
      winRate: worstStrategy.trades > 0 ? +(worstStrategy.wins / worstStrategy.trades).toFixed(3) : 0,
      profitFactor: Number(worstStrategy.profit_factor),
      status: worstStrategy.status,
    } : null,
    pausedStrategies,
    activeCooldowns,
    cooldownSymbols: (cooldowns ?? []).map((c: any) => c.symbol),
    mode, reason,
    generatedAt: new Date().toISOString(),
  };

  await supabaseAdmin.from("ai_trade_agents").update({
    diagnostic_status: mode,
    diagnostic_summary: summary as any,
    diagnostic_updated_at: new Date().toISOString(),
    protection_mode_active: protectionActive,
    protection_mode_reason: protectionActive ? reason : null,
  }).eq("id", agentId);

  return summary;
}
