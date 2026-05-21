// AI Trade Agent server functions. Start/pause/stop/status/decisions/perf + a
// runOnce primitive shared by the cron worker. Single super-admin user pattern.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evaluateSymbol, type AgentConfig, type AgentDecision, type Position } from "./ai-agent-decision-engine";
import { isIDXSymbol, convertSharesToLot } from "./lot-sizing";
import { getQuote } from "./market.functions";
import { canExecutePaperTrade, getIDXMarketSession } from "./idx-market-session";
import { runAutonomousScan } from "./ai-autonomous-scanner.server";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const COOLDOWN_MS = { BUY: 15 * 60_000, SELL: 10 * 60_000, EXIT: 10 * 60_000 };

async function ensurePaperAccount() {
  const { data } = await supabaseAdmin.from("paper_accounts").select("*").eq("user_id", USER_ID).maybeSingle();
  if (data) return data;
  const { data: created } = await supabaseAdmin
    .from("paper_accounts").insert({ user_id: USER_ID, cash: 100_000_000, equity: 100_000_000 })
    .select("*").single();
  return created!;
}

const StartSchema = z.object({
  selectedSymbols: z.array(z.string().min(1).max(20)).max(20).default([]),
  allocationAmount: z.number().positive().max(1e10).default(1_000_000),
  strategyMode: z.string().default("hybrid"),
  riskLevel: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  minConfidenceToTrade: z.number().min(0).max(1).default(0.7),
  maxPositionPerSymbol: z.number().min(0).max(1).default(0.25),
  maxDailyTrades: z.number().int().min(0).max(100).default(5),
  maxDailyLoss: z.number().min(0).max(1).default(0.02),
  maxDrawdown: z.number().min(0).max(1).default(0.05),
  autoStopLoss: z.boolean().default(true),
  autoTakeProfit: z.boolean().default(true),
  trailingStop: z.boolean().default(false),
  tradingHoursOnly: z.boolean().default(true),
  requireFreshData: z.boolean().default(true),
  allowBuy: z.boolean().default(true),
  allowSell: z.boolean().default(true),
  // Autonomous mode (all optional with safe defaults).
  symbolSelectionMode: z.enum(["manual", "autonomous"]).default("manual"),
  autonomousUniverse: z.enum(["idx_liquid", "watchlist_plus", "bluechip", "custom_universe", "all_supported", "undervalued_candidates", "quality_undervalued", "dividend_undervalued", "sector_discount", "hybrid_trading_and_value"]).default("idx_liquid"),
  maxAutonomousSymbols: z.number().int().min(1).max(10).default(5),
  maxActivePositions: z.number().int().min(1).max(10).default(3),
  maxNewEntriesPerDay: z.number().int().min(0).max(20).default(3),
  minAutonomousScore: z.number().min(0).max(100).default(70),
  minLiquidityScore: z.number().min(0).max(100).default(60),
  minDataQualityScore: z.number().min(0).max(100).default(70),
  allowAutonomousRotation: z.boolean().default(true),
  autonomousRescanIntervalMinutes: z.number().int().min(1).max(240).default(15),
  autonomousAllocationMode: z.enum(["equal_weight", "confidence_weighted", "risk_weighted", "dynamic_ai"]).default("dynamic_ai"),
});

export const startAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StartSchema.parse(d))
  .handler(async ({ data }) => {
    const acct = await ensurePaperAccount();
    if (data.symbolSelectionMode === "manual" && data.selectedSymbols.length === 0) {
      throw new Error("Pilih minimal 1 emiten untuk mode Manual.");
    }
    // Single active agent: deactivate any other running agent for this user
    await supabaseAdmin.from("ai_trade_agents").update({ status: "stopped", stopped_at: new Date().toISOString() })
      .eq("user_id", USER_ID).neq("status", "stopped");
    const { data: agent, error } = await supabaseAdmin.from("ai_trade_agents").insert({
      user_id: USER_ID, paper_account_id: acct.id,
      status: "active_market_open",
      mode: "paper_trading",
      selected_symbols: data.selectedSymbols.map(s => s.toUpperCase()),
      strategy_mode: data.strategyMode,
      risk_level: data.riskLevel,
      allocation_amount: data.allocationAmount,
      max_position_per_symbol: data.maxPositionPerSymbol,
      max_daily_trades: data.maxDailyTrades,
      max_daily_loss: data.maxDailyLoss,
      max_drawdown: data.maxDrawdown,
      auto_stop_loss: data.autoStopLoss,
      auto_take_profit: data.autoTakeProfit,
      trailing_stop: data.trailingStop,
      trading_hours_only: data.tradingHoursOnly,
      require_fresh_data: data.requireFreshData,
      allow_buy: data.allowBuy,
      allow_sell: data.allowSell,
      min_confidence_to_trade: data.minConfidenceToTrade,
      trading_enabled: true,
      started_at: new Date().toISOString(),
      // Autonomous fields:
      symbol_selection_mode: data.symbolSelectionMode,
      autonomous_universe: data.autonomousUniverse,
      max_autonomous_symbols: data.maxAutonomousSymbols,
      max_active_positions: data.maxActivePositions,
      max_new_entries_per_day: data.maxNewEntriesPerDay,
      min_autonomous_score: data.minAutonomousScore,
      min_liquidity_score: data.minLiquidityScore,
      min_data_quality_score: data.minDataQualityScore,
      allow_autonomous_rotation: data.allowAutonomousRotation,
      autonomous_rescan_interval_minutes: data.autonomousRescanIntervalMinutes,
      autonomous_allocation_mode: data.autonomousAllocationMode,
      paper_trading_only: true,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return agent;
  });

export const updateAgentSymbols = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    selectedSymbols: z.array(z.string().min(1).max(20)).min(1).max(20),
  }).parse(d))
  .handler(async ({ data }) => {
    const symbols = Array.from(new Set(data.selectedSymbols.map(s => s.toUpperCase()))).slice(0, 20);
    const { error } = await supabaseAdmin.from("ai_trade_agents")
      .update({ selected_symbols: symbols })
      .eq("id", data.id).eq("user_id", USER_ID);
    if (error) throw new Error(error.message);
    return { ok: true, symbols };
  });

export const pauseAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("ai_trade_agents")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", USER_ID);
    return { ok: true };
  });

export const stopAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; closeAll?: boolean }) =>
    z.object({ id: z.string().uuid(), closeAll: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("ai_trade_agents")
      .update({ status: "stopped", stopped_at: new Date().toISOString(), trading_enabled: false })
      .eq("id", data.id).eq("user_id", USER_ID);
    await supabaseAdmin.from("ai_agent_risk_logs").insert({
      agent_id: data.id, risk_type: "lifecycle", risk_level: "info",
      message: data.closeAll ? "Agent stopped (close-all requested by user)" : "Agent stopped by user",
      action_taken: "stop",
    });
    return { ok: true };
  });

export const emergencyStop = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("ai_trade_agents")
      .update({ status: "error", trading_enabled: false, stopped_at: new Date().toISOString(),
                last_error: "Emergency stop by user" })
      .eq("id", data.id).eq("user_id", USER_ID);
    // Cancel pending paper orders
    await supabaseAdmin.from("paper_orders").update({ status: "cancelled" })
      .eq("user_id", USER_ID).eq("status", "pending");
    await supabaseAdmin.from("ai_agent_risk_logs").insert({
      agent_id: data.id, risk_type: "emergency_stop", risk_level: "critical",
      message: "Emergency stop triggered; pending paper orders cancelled.",
      action_taken: "emergency_stop",
    });
    return { ok: true };
  });

export const getAgentStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data: agent } = await supabaseAdmin.from("ai_trade_agents")
    .select("*").eq("user_id", USER_ID).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!agent) return { agent: null, session: getIDXMarketSession(), decisions: [], risks: [], performance: null };
  const [{ data: decisions }, { data: risks }, { data: performance }] = await Promise.all([
    supabaseAdmin.from("ai_agent_decisions").select("*").eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("ai_agent_risk_logs").select("*").eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("ai_agent_performance").select("*").eq("agent_id", agent.id).maybeSingle(),
  ]);
  return {
    agent, session: getIDXMarketSession(),
    decisions: decisions ?? [], risks: risks ?? [], performance: performance ?? null,
  };
});

// ---- Worker primitive (used by cron and manual "Run once" button) ----

function idemKey(agentId: string, symbol: string, action: string) {
  // Round to 5-minute bucket so two ticks within 5 minutes can't double-fire
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  return `${agentId}:${symbol}:${action}:${bucket}`;
}

async function recentCooldownActive(agentId: string, symbol: string, action: string) {
  const cd = (COOLDOWN_MS as any)[action] ?? 0;
  if (!cd) return false;
  const since = new Date(Date.now() - cd).toISOString();
  const { count } = await supabaseAdmin.from("ai_agent_decisions")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId).eq("symbol", symbol).eq("action", action)
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

// Realistic slippage by cap proxy (LQ45 list approximated by ticker prefix).
const LARGE_CAP_IDX = new Set([
  "BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "UNVR", "HMSP", "GGRM",
  "ICBP", "INDF", "KLBF", "SMGR", "INTP", "PGAS", "ADRO", "PTBA", "ITMG",
  "ANTM", "MEDC", "MDKA", "INKP", "TKIM", "GOTO", "ARTO", "BRIS", "BRPT",
  "EMTK", "EXCL", "INCO", "PWON", "TPIA", "UNTR", "BUKA", "MAPA", "MAPI",
]);

function slippagePctFor(symbol: string): number {
  const base = symbol.replace(/\.JK$/i, "").toUpperCase();
  if (LARGE_CAP_IDX.has(base)) return 0.0008;   // ~0.08% large-cap
  if (isIDXSymbol(symbol)) return 0.0025;       // mid/small IDX
  return 0.0005;                                 // US/global large
}
const BUY_FEE_PCT  = 0.0015; // 0.15%
const SELL_FEE_PCT = 0.0025; // 0.25%

async function executePaperFill(opts: {
  agentId: string; paperAccountId: string; symbol: string; side: "buy" | "sell";
  shares: number; price: number; existing?: Position; reason: string;
  decision?: AgentDecision; decisionId?: string | null;
  closeReason?: "stop_loss_triggered" | "take_profit_triggered" | null;
  explorationTrade?: boolean; researchTrade?: boolean;
}) {
  const { agentId, paperAccountId, symbol, side, shares, price, existing, reason, decision, decisionId, closeReason } = opts;
  const slipPct = slippagePctFor(symbol);
  const fillPrice = +(price * (1 + slipPct * (side === "buy" ? 1 : -1))).toFixed(4);
  const notional = fillPrice * shares;
  const feePct = side === "buy" ? BUY_FEE_PCT : SELL_FEE_PCT;
  const fee = +(notional * feePct).toFixed(2);

  const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", paperAccountId).single();
  if (!account) throw new Error("paper account missing");
  const cashBefore = Number(account.cash);

  let realizedPnl = 0;
  let entryAvgPrice: number | null = null;
  let cashAfter = cashBefore;
  if (side === "buy") {
    if (cashBefore < notional + fee) throw new Error("Insufficient cash");
    if (existing) {
      const newQty = Number(existing.qty) + shares;
      const newAvg = (Number(existing.avg_price) * Number(existing.qty) + fillPrice * shares) / newQty;
      await supabaseAdmin.from("paper_positions").update({ qty: newQty, avg_price: newAvg })
        .eq("user_id", USER_ID).eq("symbol", symbol);
    } else {
      await supabaseAdmin.from("paper_positions").insert({
        account_id: paperAccountId, user_id: USER_ID, symbol, qty: shares, avg_price: fillPrice,
      });
    }
    cashAfter = cashBefore - notional - fee;
    await supabaseAdmin.from("paper_accounts").update({ cash: cashAfter }).eq("id", paperAccountId);
  } else {
    if (!existing || Number(existing.qty) < shares) throw new Error("Position insufficient for sell");
    entryAvgPrice = Number(existing.avg_price);
    realizedPnl = +((fillPrice - entryAvgPrice) * shares - fee).toFixed(2);
    const remaining = Number(existing.qty) - shares;
    if (remaining === 0) await supabaseAdmin.from("paper_positions").delete().eq("user_id", USER_ID).eq("symbol", symbol);
    else await supabaseAdmin.from("paper_positions").update({ qty: remaining }).eq("user_id", USER_ID).eq("symbol", symbol);
    cashAfter = cashBefore + notional - fee;
    await supabaseAdmin.from("paper_accounts").update({ cash: cashAfter }).eq("id", paperAccountId);
  }

  const { data: order } = await supabaseAdmin.from("paper_orders").insert({
    account_id: paperAccountId, user_id: USER_ID, agent_id: agentId,
    symbol, side, type: "market", qty: shares,
    price, filled_price: fillPrice, status: "filled", filled_at: new Date().toISOString(),
    realized_pnl: realizedPnl, slippage_pct: slipPct, fee,
  }).select("*").single();

  const paperExecution = {
    executed: true, orderId: order?.id ?? null,
    paperBalanceBefore: cashBefore, paperBalanceAfter: cashAfter,
    requestedPrice: price, simulatedFillPrice: fillPrice,
    slippagePercent: slipPct, fee, feePercent: feePct,
    realisticFill: true, rejectionReason: null,
    side, shares,
  };

  // Distinguish open-trade BUY snapshots from completed-trade SELL/EXIT events.
  const isOpenTrade = side === "buy";
  const eventType = isOpenTrade ? "open_trade_snapshot" : "completed_trade";

  // Synthetic decision wrapper for risk exits without an upstream AgentDecision.
  const decisionPayload: any = decision ? {
    action: decision.action, confidence: decision.confidence,
    rawConfidence: decision.rawConfidence, calibrationReason: decision.calibrationReason,
    strategy: decision.strategy, allocationAmount: decision.allocationAmount,
    lot: decision.suggestedLot, shares: decision.suggestedShares,
    entryPrice: decision.entryPrice, stopLoss: decision.stopLoss,
    takeProfit: decision.takeProfit, riskRewardRatio: decision.riskRewardRatio,
    reasoning: decision.reasoning,
  } : closeReason ? {
    // Risk-guard synthetic decision (SL/TP).
    action: "EXIT",
    strategy: "risk_guard",
    closeReason,
    entryPrice: entryAvgPrice,
    exitPrice: fillPrice,
    shares,
    reasoning: closeReason === "stop_loss_triggered"
      ? "Stop loss triggered"
      : "Take profit triggered",
  } : { side, shares, fillPrice, reason };

  if (closeReason) decisionPayload.closeReason = closeReason;

  // Pre-compute realized return % so completed-trade events can be aggregated
  // without depending on a delayed backfill pass.
  let paperPnlPercent: number | null = null;
  if (!isOpenTrade && entryAvgPrice && entryAvgPrice > 0) {
    paperPnlPercent = +(((fillPrice - entryAvgPrice) / entryAvgPrice) * 100).toFixed(3);
  }

  const finalOutcome = isOpenTrade ? {
    eventType,
    entryPrice: fillPrice,
    shares,
    paperPnL: 0,
    paperPnLPercent: null,
    tradeResult: null, // not closed yet
  } : {
    eventType,
    closeReason: closeReason ?? null,
    entryPrice: entryAvgPrice,
    exitPrice: fillPrice,
    paperPnL: realizedPnl,
    paperPnLPercent: paperPnlPercent,
    tradeResult: realizedPnl > 0 ? "win" : realizedPnl < 0 ? "loss" : "breakeven",
  };

  await supabaseAdmin.from("ai_agent_training_events").insert({
    agent_id: agentId, order_id: order?.id, decision_id: decisionId ?? null, symbol,
    real_market_data: (decision?.realMarketData ?? null) as any,
    real_technical_data: (decision?.realTechnicalData ?? null) as any,
    real_news_data: (decision?.realNewsData ?? null) as any,
    real_disclosure_data: (decision?.realDisclosureData ?? null) as any,
    real_market_context: (decision?.realMarketContext ?? null) as any,
    ai_decision: decisionPayload as any,
    paper_execution: paperExecution as any,
    decision_output: { side, shares, fillPrice, reason, closeReason: closeReason ?? null } as any,
    actual_outcome: { realizedPnl, fee, closeReason: closeReason ?? null } as any,
    final_outcome: finalOutcome as any,
    event_type: eventType,
    close_reason: closeReason ?? null,
    paper_pnl_percent: paperPnlPercent,
    pnl: realizedPnl, model_version: "agent-v1.2", strategy_version: "real-data-v2",
  });

  return { order, realizedPnl, fillPrice, slipPct, fee, cashBefore, cashAfter };
}

async function loadActivePosition(symbol: string): Promise<Position | undefined> {
  const { data } = await supabaseAdmin.from("paper_positions").select("*")
    .eq("user_id", USER_ID).eq("symbol", symbol).maybeSingle();
  return data ? { symbol: data.symbol, qty: Number(data.qty), avg_price: Number(data.avg_price) } : undefined;
}

/**
 * Runs one decision cycle for one agent. Used by the cron route and by manual triggers.
 * Returns the list of decisions taken (executed or held) this tick.
 */
export async function runAgentOnce(agentId: string): Promise<{ decisions: AgentDecision[]; executed: number }> {
  const { data: agent } = await supabaseAdmin.from("ai_trade_agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) throw new Error("agent not found");
  if (agent.status === "stopped" || agent.status === "error") return { decisions: [], executed: 0 };

  // Reflect market session into agent.status — autonomous mode follows IDX session
  // even when selected_symbols is empty (avoids false "active_market_open").
  const session = getIDXMarketSession();
  const isAutonomousMode = (agent.symbol_selection_mode ?? "manual") === "autonomous";
  const universeIsIdx = isAutonomousMode
    ? String(agent.autonomous_universe ?? "idx_liquid").startsWith("idx")
      || ["idx_liquid", "bluechip", "watchlist_plus", "undervalued_candidates",
          "quality_undervalued", "dividend_undervalued", "sector_discount",
          "hybrid_trading_and_value"].includes(String(agent.autonomous_universe ?? ""))
    : (agent.selected_symbols as string[]).some(isIDXSymbol);
  let nextStatus = agent.status;
  if (agent.status !== "paused") {
    if (universeIsIdx) {
      nextStatus = session.isOpen ? "active_market_open"
                 : session.isBreak ? "active_market_break" : "active_market_closed";
    } else nextStatus = "active_market_open";
  }
  // Session-change detection → force autonomous rescan on transition.
  const lastSession = (agent as any).last_market_session_state as string | null;
  const sessionChanged = lastSession && lastSession !== session.state;
  await supabaseAdmin.from("ai_trade_agents").update({
    status: nextStatus,
    last_run_at: new Date().toISOString(),
    last_market_session_state: session.state,
  }).eq("id", agentId);

  if (agent.status === "paused") return { decisions: [], executed: 0 };

  // Daily trades cap — per-agent only (not all user orders).
  const sinceDay = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: todayCount } = await supabaseAdmin.from("ai_agent_decisions")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId).eq("decision_status", "executed")
    .gte("created_at", sinceDay);
  const dailyTradesLeft = Math.max(0, Number(agent.max_daily_trades) - (todayCount ?? 0));

  const { data: acct } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", agent.paper_account_id).single();
  const { data: positions } = await supabaseAdmin.from("paper_positions").select("*").eq("user_id", USER_ID);
  const posList: Position[] = (positions ?? []).map((p: any) => ({ symbol: p.symbol, qty: Number(p.qty), avg_price: Number(p.avg_price) }));

  // Mark-to-market equity: cash + sum(qty * latest price) instead of stale DB equity.
  let holdingsValue = 0;
  for (const p of posList) {
    try {
      const q: any = await getQuote({ data: { symbol: p.symbol } });
      const px = Number(q?.price);
      if (Number.isFinite(px) && px > 0) holdingsValue += p.qty * px;
      else holdingsValue += p.qty * p.avg_price;
    } catch { holdingsValue += p.qty * p.avg_price; }
  }
  const mtmEquity = Number(acct!.cash) + holdingsValue;
  // Persist refreshed equity (best-effort).
  await supabaseAdmin.from("paper_accounts")
    .update({ equity: mtmEquity }).eq("id", agent.paper_account_id);
  const account = { cash: Number(acct!.cash), equity: mtmEquity };

  const cfg: AgentConfig = {
    id: agent.id, riskLevel: agent.risk_level, strategyMode: agent.strategy_mode,
    allocationAmount: Number(agent.allocation_amount ?? 1_000_000),
    maxPositionPerSymbol: Number(agent.max_position_per_symbol ?? 0.25),
    minConfidenceToTrade: Number(agent.min_confidence_to_trade ?? 0.7),
    autoStopLoss: !!agent.auto_stop_loss, autoTakeProfit: !!agent.auto_take_profit,
    allowBuy: !!agent.allow_buy, allowSell: !!agent.allow_sell,
    tradingHoursOnly: !!agent.trading_hours_only, requireFreshData: !!agent.require_fresh_data,
    minUndervalueScore: Number(agent.min_undervalue_score ?? 65),
    maxValueTrapRisk: Number(agent.max_value_trap_risk ?? 40),
  };

  const decisions: AgentDecision[] = [];
  let executed = 0;
  let tradesUsed = 0;

  // ---- Resolve symbol set: manual = stored list, autonomous = scanner output.
  const isAutonomous = (agent.symbol_selection_mode ?? "manual") === "autonomous";
  let symbolsToEvaluate: string[] = (agent.selected_symbols as string[]) ?? [];
  let autonomousScanId: string | null = null;
  const autonomousMeta = new Map<string, { rank: number; score: number; reason: string; classification?: string; eligibility?: string; researchTradeAllowed?: boolean }>();
  const watchSnapshots: Array<{ symbol: string; rank: number; score: number; classification: string; eligibility: string; reason: string; scanPrice: number | null }> = [];

  if (isAutonomous) {
    const intervalMs = Number(agent.autonomous_rescan_interval_minutes ?? 15) * 60_000;
    const lastScanAt = agent.last_autonomous_scan_at ? new Date(agent.last_autonomous_scan_at).getTime() : 0;
    const rescanDue = Date.now() - lastScanAt >= intervalMs;

    let scan = null as Awaited<ReturnType<typeof runAutonomousScan>> | null;
    if (rescanDue) {
      try { scan = await runAutonomousScan(agent); } catch (e: any) {
        await supabaseAdmin.from("ai_agent_risk_logs").insert({
          agent_id: agent.id, risk_type: "scanner_error", risk_level: "warning",
          message: e?.message ?? "scanner failed", action_taken: "skip",
        });
      }
    } else {
      // Reuse last scan's selected_symbols when interval not yet elapsed.
      const { data: last } = await supabaseAdmin
        .from("ai_agent_scans").select("*")
        .eq("agent_id", agent.id).order("scan_time", { ascending: false }).limit(1).maybeSingle();
      if (last) {
        scan = {
          scanId: (last as any).id, agentId: agent.id, universe: (last as any).universe,
          scannedCount: (last as any).symbols_scanned_count,
          validCount: (last as any).valid_candidates_count,
          selected: ((last as any).selected_symbols ?? []) as string[],
          topCandidates: ((last as any).top_candidates ?? []) as any[],
          rejected: ((last as any).rejected_candidates ?? []) as any[],
          reasoning: (last as any).reasoning ?? "",
          riskMode: (agent.autonomous_risk_mode ?? "balanced") as any,
          summary: { trade: 0, watch: 0, research: 0, rejected: 0, blocked: 0, total: 0, marketSession: "closed" as any },
        };
      }
    }

    if (scan) {
      autonomousScanId = scan.scanId;
      symbolsToEvaluate = scan.selected;
      for (const c of scan.topCandidates) {
        autonomousMeta.set(c.symbol, {
          rank: c.rank ?? 0, score: c.autonomousScore, reason: c.reason,
          classification: (c as any).classification ?? "trade_candidate",
          eligibility: (c as any).executionEligibility ?? "eligible",
          researchTradeAllowed: (c as any).researchTradeAllowed ?? false,
        });
      }
      // Collect watch / research / premarket candidates for HOLD snapshots.
      const { data: extraCands } = await supabaseAdmin
        .from("ai_agent_scan_candidates")
        .select("symbol, rank, autonomous_score, candidate_classification, execution_eligibility, blocked_reason, scan_price")
        .eq("scan_id", scan.scanId)
        .in("candidate_classification", ["watch_candidate", "research_candidate", "premarket_watch"])
        .order("rank", { ascending: true })
        .limit(10);
      for (const c of extraCands ?? []) {
        const sym = (c as any).symbol as string;
        if (symbolsToEvaluate.includes(sym)) continue;
        watchSnapshots.push({
          symbol: sym,
          rank: Number((c as any).rank ?? 0),
          score: Number((c as any).autonomous_score ?? 0),
          classification: String((c as any).candidate_classification ?? ""),
          eligibility: String((c as any).execution_eligibility ?? ""),
          reason: String((c as any).blocked_reason ?? "Monitoring candidate."),
          scanPrice: (c as any).scan_price != null ? Number((c as any).scan_price) : null,
        });
      }
      // Keep agent.selected_symbols in sync with current AI pick for the UI.
      await supabaseAdmin.from("ai_trade_agents")
        .update({ selected_symbols: symbolsToEvaluate })
        .eq("id", agent.id);
    } else {
      symbolsToEvaluate = [];
    }
  }

  // Respect maxActivePositions for autonomous (existing positions count first).
  const maxActive = Number(agent.max_active_positions ?? 3);
  const openSymbols = new Set(posList.map(p => p.symbol));
  const slotsLeft = isAutonomous ? Math.max(0, maxActive - openSymbols.size) : Number.MAX_SAFE_INTEGER;
  let newEntriesUsed = 0;
  const maxNew = Number(agent.max_new_entries_per_day ?? 3);

  for (const sym of symbolsToEvaluate) {
    try {
      const decision = await evaluateSymbol(cfg, sym, account, posList);
      decisions.push(decision);

      let decisionStatus: "executed" | "rejected" | "hold" | "cooldown" | "limit_reached" = "hold";
      let orderId: string | null = null;

      const isTrade = decision.action === "BUY" || decision.action === "EXIT";
      const isNewEntry = decision.action === "BUY" && !openSymbols.has(sym);

      if (isTrade && tradesUsed >= dailyTradesLeft) {
        decisionStatus = "limit_reached";
      } else if (isAutonomous && isNewEntry && slotsLeft - newEntriesUsed <= 0) {
        decisionStatus = "limit_reached";
      } else if (isAutonomous && isNewEntry && newEntriesUsed >= maxNew) {
        decisionStatus = "limit_reached";
      } else if (isTrade) {
        const action = decision.action;
        if (await recentCooldownActive(agent.id, sym, action)) decisionStatus = "cooldown";
        else if (!cfg.tradingHoursOnly || !isIDXSymbol(sym) || canExecutePaperTrade().ok) {
          try {
            const existing = await loadActivePosition(sym);
            const side: "buy" | "sell" = action === "BUY" ? "buy" : "sell";
            const shares = side === "sell" ? (existing?.qty ?? decision.suggestedShares) : decision.suggestedShares;
            if (shares > 0 && decision.entryPrice) {
              const res = await executePaperFill({
                agentId: agent.id, paperAccountId: agent.paper_account_id,
                symbol: sym, side, shares, price: decision.entryPrice,
                existing, reason: decision.reasoning, decision,
              });
              orderId = res.order?.id ?? null;
              decisionStatus = "executed";
              tradesUsed += 1;
              if (isNewEntry) newEntriesUsed += 1;
              executed += 1;
            } else decisionStatus = "rejected";
          } catch (e: any) {
            decisionStatus = "rejected";
            await supabaseAdmin.from("ai_agent_risk_logs").insert({
              agent_id: agent.id, symbol: sym, risk_type: "execution_error",
              risk_level: "warning", message: e?.message ?? "exec failed", action_taken: "skip",
            });
          }
        } else decisionStatus = "rejected";
      }

      const meta = autonomousMeta.get(sym);
      const isExplorationTrade = !!meta?.researchTradeAllowed
        && (decision.action === "BUY" || decision.action === "EXIT")
        && decisionStatus === "executed";
      await supabaseAdmin.from("ai_agent_decisions").insert({
        agent_id: agent.id, paper_account_id: agent.paper_account_id,
        symbol: sym, action: decision.action, confidence: decision.confidence,
        raw_confidence: decision.rawConfidence,
        calibrated_confidence: decision.confidence,
        calibration_reason: decision.calibrationReason,
        data_freshness_seconds: decision.dataFreshnessSeconds,
        data_source: decision.dataSource,
        strategy: decision.strategy, allocation_amount: decision.allocationAmount,
        suggested_lot: decision.suggestedLot, suggested_shares: decision.suggestedShares,
        entry_price: decision.entryPrice, stop_loss: decision.stopLoss, take_profit: decision.takeProfit,
        risk_reward_ratio: decision.riskRewardRatio, reasoning: decision.reasoning,
        data_snapshot: decision.realMarketData as any,
        technical_snapshot: decision.realTechnicalData as any,
        sentiment_snapshot: { news: decision.realNewsData, disclosure: decision.realDisclosureData } as any,
        portfolio_snapshot: decision.portfolioSnapshot as any,
        risk_snapshot: { ...decision.riskSnapshot, marketContext: decision.realMarketContext } as any,
        data_quality_snapshot: decision.dataQuality as any,
        decision_status: decisionStatus,
        idempotency_key: idemKey(agent.id, sym, decision.action),
        selection_mode: isAutonomous ? "autonomous" : "manual",
        autonomous_scan_id: autonomousScanId,
        autonomous_rank: meta?.rank ?? null,
        autonomous_score: meta?.score ?? null,
        selection_reason: meta?.reason ?? null,
        autonomous_risk_mode: (agent.autonomous_risk_mode ?? "balanced"),
        candidate_classification: meta?.classification ?? null,
        exploration_trade: isExplorationTrade && (agent.autonomous_risk_mode === "progressive"),
        research_trade: isExplorationTrade && (agent.autonomous_risk_mode === "expert_research"),
      });
    } catch (e: any) {
      await supabaseAdmin.from("ai_agent_risk_logs").insert({
        agent_id: agent.id, symbol: sym, risk_type: "engine_error",
        risk_level: "warning", message: e?.message ?? "engine error", action_taken: "skip",
      });
    }
  }



  // Record HOLD snapshots for watch / research / pre-market candidates so the
  // Decision Feed / Trade Plan shows them as monitored (no paper order placed).
  if (isAutonomous && watchSnapshots.length > 0) {
    const riskMode = (agent.autonomous_risk_mode ?? "balanced") as string;
    const rows = watchSnapshots.map(w => {
      const statusMap: Record<string, string> = {
        watch_candidate: "watch_only",
        research_candidate: "research_only",
        premarket_watch: "premarket_plan",
      };
      const status = statusMap[w.classification] ?? "watch_only";
      const reasoning = w.classification === "premarket_watch"
        ? `Pre-market plan: ${w.symbol} (score ${w.score.toFixed(0)}). Monitor saat market open.`
        : w.classification === "watch_candidate"
        ? `Watch candidate: score ${w.score.toFixed(0)} layak dipantau, belum cukup untuk trade.`
        : `Research candidate: score ${w.score.toFixed(0)} disimpan untuk training/outcome tracking.`;
      return {
        agent_id: agent.id, paper_account_id: agent.paper_account_id,
        symbol: w.symbol, action: "HOLD", confidence: 0,
        raw_confidence: 0, calibrated_confidence: 0,
        calibration_reason: "Watch/research snapshot — no trade executed.",
        strategy: "monitoring", allocation_amount: 0,
        suggested_lot: 0, suggested_shares: 0,
        entry_price: w.scanPrice, stop_loss: null, take_profit: null,
        risk_reward_ratio: null,
        reasoning,
        data_snapshot: { scanPrice: w.scanPrice } as any,
        decision_status: status,
        selection_mode: "autonomous",
        autonomous_scan_id: autonomousScanId,
        autonomous_rank: w.rank, autonomous_score: w.score,
        selection_reason: w.reason,
        autonomous_risk_mode: riskMode,
        candidate_classification: w.classification,
        exploration_trade: false, research_trade: false,
        idempotency_key: idemKey(agent.id, w.symbol, `WATCH_${w.classification}`),
      };
    });
    await supabaseAdmin.from("ai_agent_decisions").insert(rows);
  }


  // Stop-loss / take-profit guard on open positions (only when IDX market open)
  if (session.isOpen) {
    for (const pos of posList) {
      try {
        // find the most recent BUY decision for this symbol to know SL/TP
        const { data: lastBuy } = await supabaseAdmin.from("ai_agent_decisions")
          .select("stop_loss, take_profit").eq("agent_id", agent.id)
          .eq("symbol", pos.symbol).eq("action", "BUY")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!lastBuy) continue;
        const q: any = await getQuote({ data: { symbol: pos.symbol } });
        const px = Number(q?.price);
        if (!px) continue;
        const sl = lastBuy.stop_loss ? Number(lastBuy.stop_loss) : null;
        const tp = lastBuy.take_profit ? Number(lastBuy.take_profit) : null;
        let trigger: "stop_loss_triggered" | "take_profit_triggered" | null = null;
        if (sl && px <= sl) trigger = "stop_loss_triggered";
        else if (tp && px >= tp) trigger = "take_profit_triggered";
        if (!trigger) continue;
        await executePaperFill({
          agentId: agent.id, paperAccountId: agent.paper_account_id,
          symbol: pos.symbol, side: "sell", shares: pos.qty, price: px,
          existing: pos, reason: trigger,
        });
        await supabaseAdmin.from("ai_agent_risk_logs").insert({
          agent_id: agent.id, symbol: pos.symbol, risk_type: trigger,
          risk_level: "info", message: `Triggered at ${px}`, action_taken: "close_position",
        });
        executed += 1;
      } catch { /* tolerate */ }
    }
  }

  // Outcome backfill + lesson labeling based on real price movement
  await backfillTrainingOutcomes(agent.id);

  // Recompute performance summary + per-ticker trade memory
  await recomputePerformance(agent.id, agent.paper_account_id);
  await recomputeTradeMemory(agent.id);

  return { decisions, executed };
}

/** Extract realized return % from a finalized training event. Prefers paper_pnl_percent. */
function getEventReturnPct(event: any): number {
  const direct = Number(event?.paper_pnl_percent);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const fromOutcome1 = Number(event?.final_outcome?.paperPnLPercent);
  if (Number.isFinite(fromOutcome1) && fromOutcome1 !== 0) return fromOutcome1;
  const fromOutcome2 = Number(event?.final_outcome?.paper_pnl_percent);
  if (Number.isFinite(fromOutcome2) && fromOutcome2 !== 0) return fromOutcome2;
  if (Number.isFinite(direct)) return direct;
  if (Number.isFinite(fromOutcome1)) return fromOutcome1;
  if (Number.isFinite(fromOutcome2)) return fromOutcome2;
  return 0;
}

function getTradeResultFromReturn(returnPct: number): "win" | "loss" | "breakeven" {
  if (returnPct > 0) return "win";
  if (returnPct < 0) return "loss";
  return "breakeven";
}

/** Is this training event a completed/closed trade (not HOLD, not open)? */
function isCompletedTradeEvent(event: any): boolean {
  if (!event?.final_outcome) return false;
  const action = String(event?.ai_decision?.action ?? "").toUpperCase();
  if (action === "HOLD" || action === "" || action === "NO_TRADE") return false;
  if (!["BUY", "SELL", "EXIT"].includes(action)) return false;
  // Reject explicit passive_analysis snapshots even if action mislabeled.
  if (event?.final_outcome?.eventType === "passive_analysis") return false;
  const exec = event?.paper_execution;
  const executed = exec?.executed === true || exec?.status === "filled";
  const hasRealizedPnl = Number.isFinite(Number(event?.paper_pnl_percent))
    || Number.isFinite(Number(event?.final_outcome?.paperPnLPercent))
    || Number.isFinite(Number(event?.final_outcome?.paper_pnl_percent))
    || (Number.isFinite(Number(event?.pnl)) && Number(event?.pnl) !== 0);
  return executed || hasRealizedPnl;
}

/** Aggregate finalized training events per symbol into ai_agent_trade_memory.
 *  Trade win/loss is derived from realized P/L, NOT from was_correct. */
async function recomputeTradeMemory(agentId: string) {
  const { data: events } = await supabaseAdmin
    .from("ai_agent_training_events")
    .select("symbol, was_correct, paper_pnl_percent, pnl, lesson_label, ai_decision, paper_execution, final_outcome, created_at")
    .eq("agent_id", agentId)
    .not("final_outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!events?.length) return;

  // Filter to completed trades only (exclude HOLD / passive snapshots / open).
  const completed = events.filter(isCompletedTradeEvent);
  if (!completed.length) return;

  // Bucket by symbol → keep last 30 finalized per symbol.
  const bySym = new Map<string, typeof completed>();
  for (const e of completed) {
    if (!e.symbol) continue;
    const arr = bySym.get(e.symbol) ?? [];
    if (arr.length < 30) { arr.push(e); bySym.set(e.symbol, arr); }
  }

  for (const [symbol, list] of bySym) {
    const n = list.length;
    const returns = list.map(getEventReturnPct);
    const wins = returns.filter(r => r > 0).length;
    const losses = returns.filter(r => r < 0).length;
    const winRatePct = n ? (wins / n) * 100 : 0;
    const avgRet = n ? returns.reduce((s, r) => s + r, 0) / n : 0;

    // Strategy stats: win attribution from realized P/L, not was_correct.
    const stratStats: Record<string, { n: number; wins: number; pnl: number }> = {};
    list.forEach((e, i) => {
      const strat = (e.ai_decision as any)?.strategy ?? "unknown";
      const s = (stratStats[strat] ||= { n: 0, wins: 0, pnl: 0 });
      s.n += 1;
      if (returns[i] > 0) s.wins += 1;
      s.pnl += returns[i];
    });
    let best: string | null = null, worst: string | null = null;
    let bestScore = -Infinity, worstScore = Infinity;
    for (const [k, v] of Object.entries(stratStats)) {
      if (v.n < 2) continue;
      const score = (v.wins / v.n) + v.pnl / 100;
      if (score > bestScore) { bestScore = score; best = k; }
      if (score < worstScore) { worstScore = score; worst = k; }
    }
    if (best === worst) worst = null;

    const latestRet = returns[0];
    const lastResult = getTradeResultFromReturn(latestRet);
    const totalRet = returns.reduce((s, r) => s + r, 0);
    // Consistency guard (acceptance #1, #2, #7): if aggregate avg or total
    // return is negative, memory row must not advertise "win" as last result.
    const safeLastResult =
      (lastResult === "win" && (avgRet < 0 || totalRet < 0)) ? "loss" : lastResult;

    const lossIdx = returns.findIndex(r => r < 0);
    const recentMistake = lossIdx >= 0 ? (list[lossIdx].lesson_label ?? null) : null;
    const lastEntryReason = (list[0].ai_decision as any)?.reasoning ?? null;

    await supabaseAdmin.from("ai_agent_trade_memory").upsert({
      agent_id: agentId, symbol,
      recent_win_rate: +winRatePct.toFixed(2),
      recent_avg_return: +avgRet.toFixed(4),
      sample_size: n,
      last_trade_result: safeLastResult,
      last_entry_reason: lastEntryReason ? String(lastEntryReason).slice(0, 500) : null,
      recent_mistake: recentMistake,
      best_strategy: best,
      worst_strategy: worst,
      strategy_stats: stratStats as any,
      ticker_stats: { winRatePct, avgReturn: avgRet, n, wins, losses } as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "agent_id,symbol" });
  }
}

/** Evaluate open training events with real price ticks; fill 15m/1h/eod/final. */
async function backfillTrainingOutcomes(agentId: string) {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: events } = await supabaseAdmin
    .from("ai_agent_training_events")
    .select("id, symbol, ai_decision, paper_execution, outcome_15m, outcome_1h, outcome_eod, final_outcome, created_at, pnl")
    .eq("agent_id", agentId).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(50);
  if (!events?.length) return;

  const quoteCache = new Map<string, number | null>();
  const fetchPx = async (sym: string) => {
    if (quoteCache.has(sym)) return quoteCache.get(sym)!;
    try {
      const q: any = await getQuote({ data: { symbol: sym } });
      const px = q?.price ? Number(q.price) : null;
      quoteCache.set(sym, px);
      return px;
    } catch { quoteCache.set(sym, null); return null; }
  };

  for (const ev of events) {
    try {
      const dec: any = ev.ai_decision ?? {};
      const exec: any = ev.paper_execution ?? {};
      const entry = Number(exec.simulatedFillPrice ?? dec.entryPrice);
      if (!entry || !ev.symbol) continue;
      const side = (dec.action ?? "").toUpperCase();
      const isLong = side === "BUY";
      const isExit = side === "EXIT" || side === "SELL";
      const isHold = side === "HOLD";
      const ageMin = (Date.now() - new Date(ev.created_at).getTime()) / 60000;
      const px = await fetchPx(ev.symbol);
      if (!px) continue;

      // Price direction movement (independent of trade exec). Sign flips for short/exit.
      const priceMovePct = ((px - entry) / entry) * 100;
      const pnlPctRaw = priceMovePct * (isLong || isHold ? 1 : (isExit ? -1 : 1));
      const patch: any = { evaluated_at: new Date().toISOString() };

      if (!ev.outcome_15m && ageMin >= 15) {
        patch.outcome_15m = { priceAfter15m: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      if (!ev.outcome_1h && ageMin >= 60) {
        patch.outcome_1h = { priceAfter1h: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      if (!ev.outcome_eod && ageMin >= 360) {
        patch.outcome_eod = { endOfDayPrice: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      // Finalize: realized exit OR > 24h elapsed
      if (!ev.final_outcome && (Number(ev.pnl ?? 0) !== 0 || ageMin >= 1440)) {
        const realized = Number(ev.pnl ?? 0);
        const directionCorrect = isLong ? priceMovePct > 0
          : isExit ? priceMovePct < 0
          : isHold ? null
          : null;

        if (isHold) {
          // Passive analysis snapshot — NOT a trade. No P/L, not counted in performance/memory.
          patch.final_outcome = {
            eventType: "passive_analysis",
            priceAtFinalize: px,
            priceMovePercent: +priceMovePct.toFixed(3),
            paperPnL: 0,
            paperPnLPercent: null,
            wasDirectionCorrect: directionCorrect,
            tradeResult: null,
          };
          patch.was_correct = directionCorrect;
          // Intentionally do NOT set paper_pnl_percent for HOLD.
          patch.lesson_label = "hold_no_trade";
        } else {
          // Trade decision → realized P/L drives win/loss.
          const pnlPercent = realized !== 0
            ? +((realized / Math.max(1, entry * (dec.shares ?? 1))) * 100).toFixed(3)
            : +pnlPctRaw.toFixed(3);
          const tradeResult = getTradeResultFromReturn(pnlPercent);

          let lesson = "data_stale";
          if (isLong && pnlPercent >= 2) lesson = "take_profit_success";
          else if (isLong && pnlPercent <= -1.5) lesson = "stop_loss_too_tight";
          else if (isLong && pnlPercent > 0) lesson = "good_entry";
          else if (isLong && pnlPercent <= 0) lesson = "false_positive_signal";
          else if (isExit && pnlPercent < 0) lesson = "good_exit";
          else if (isExit && pnlPercent >= 0) lesson = "bad_exit";

          patch.final_outcome = {
            eventType: "trade_decision",
            exitPrice: px,
            paperPnL: realized,
            paperPnLPercent: pnlPercent,
            wasDirectionCorrect: directionCorrect,
            tradeResult,
          };
          patch.paper_pnl_percent = pnlPercent;
          patch.was_correct = directionCorrect;
          patch.lesson_label = lesson;
        }
      }

      if (Object.keys(patch).length > 1) {
        await supabaseAdmin.from("ai_agent_training_events").update(patch).eq("id", ev.id);
      }
    } catch { /* tolerate per-row */ }
  }
}

async function recomputePerformance(agentId: string, paperAccountId: string) {
  // Only finalized events; HOLD/passive/open are excluded by isCompletedTradeEvent.
  const { data: events } = await supabaseAdmin.from("ai_agent_training_events")
    .select("ai_decision, paper_execution, paper_pnl_percent, pnl, final_outcome")
    .eq("agent_id", agentId)
    .not("final_outcome", "is", null);

  const completed = (events ?? []).filter(isCompletedTradeEvent);

  // Signed pnl per trade for win/loss + magnitude. Prefer realized pnl; fall back to %.
  const signed = completed.map(e => {
    const realized = Number(e.pnl ?? 0);
    if (Number.isFinite(realized) && realized !== 0) return realized;
    return getEventReturnPct(e);
  });

  const trades = completed.length;
  const wins = signed.filter(n => n > 0);
  const losses = signed.filter(n => n < 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const total = sum(signed);
  const profitFactor = losses.length ? sum(wins) / Math.abs(sum(losses)) : (wins.length ? 99 : 0);
  const perf = {
    agent_id: agentId, paper_account_id: paperAccountId, total_trades: trades,
    win_rate: trades ? (wins.length / trades) * 100 : 0,
    loss_rate: trades ? (losses.length / trades) * 100 : 0,
    avg_win: wins.length ? sum(wins) / wins.length : 0,
    avg_loss: losses.length ? sum(losses) / losses.length : 0,
    profit_factor: Number.isFinite(profitFactor) ? profitFactor : 0,
    total_return: total,
    best_trade: signed.length ? Math.max(...signed) : 0,
    worst_trade: signed.length ? Math.min(...signed) : 0,
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin.from("ai_agent_performance").upsert(perf, { onConflict: "agent_id" });
}

export const runAgentNow = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const out = await runAgentOnce(data.id);
    return { ok: true, executed: out.executed, count: out.decisions.length };
  });

export const listTradeMemory = createServerFn({ method: "GET" })
  .inputValidator((d: { agentId: string }) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("ai_agent_trade_memory")
      .select("*")
      .eq("agent_id", data.agentId)
      .order("updated_at", { ascending: false });
    return rows ?? [];
  });

// ---- Autonomous mode server fns ----

export const setSelectionMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    mode: z.enum(["manual", "autonomous"]),
    autonomousUniverse: z.enum(["idx_liquid", "watchlist_plus", "bluechip", "custom_universe", "all_supported", "undervalued_candidates", "quality_undervalued", "dividend_undervalued", "sector_discount", "hybrid_trading_and_value"]).optional(),
    acknowledge: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const patch: any = { symbol_selection_mode: data.mode };
    if (data.autonomousUniverse) patch.autonomous_universe = data.autonomousUniverse;
    if (data.acknowledge) patch.autonomous_mode_acknowledged = true;
    const { error } = await supabaseAdmin.from("ai_trade_agents")
      .update(patch).eq("id", data.id).eq("user_id", USER_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runAutonomousScanNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: agent } = await supabaseAdmin.from("ai_trade_agents")
      .select("*").eq("id", data.id).eq("user_id", USER_ID).maybeSingle();
    if (!agent) throw new Error("agent not found");
    // Force immediate rescan by clearing the timestamp guard.
    await supabaseAdmin.from("ai_trade_agents")
      .update({ last_autonomous_scan_at: null }).eq("id", data.id);
    const scan = await runAutonomousScan(agent);
    return scan;
  });

export const getLatestScan = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: scan } = await supabaseAdmin
      .from("ai_agent_scans").select("*")
      .eq("agent_id", data.agentId)
      .order("scan_time", { ascending: false }).limit(1).maybeSingle();
    if (!scan) return { scan: null, candidates: [] };
    const { data: cands } = await supabaseAdmin
      .from("ai_agent_scan_candidates").select("*")
      .eq("scan_id", (scan as any).id).order("rank", { ascending: true });
    return { scan, candidates: cands ?? [] };
  });

// ---------------- Autonomous Risk Mode ----------------
const RiskModeSchema = z.object({
  id: z.string().uuid(),
  riskMode: z.enum(["conservative", "balanced", "progressive", "expert_research"]),
  allowWatchCandidates: z.boolean().optional(),
  allowResearchCandidates: z.boolean().optional(),
  allowSmallLotExploration: z.boolean().optional(),
  allowOutcomeTrackingWithoutTrade: z.boolean().optional(),
  allowPremarketPlanning: z.boolean().optional(),
  acknowledge: z.boolean().optional(),
});

export const setAutonomousRiskMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RiskModeSchema.parse(d))
  .handler(async ({ data }) => {
    const patch: any = { autonomous_risk_mode: data.riskMode };
    // Sensible defaults per mode if the user has not explicitly chosen toggles.
    if (data.riskMode === "conservative") {
      patch.allow_watch_candidates = data.allowWatchCandidates ?? true;
      patch.allow_research_candidates = data.allowResearchCandidates ?? false;
      patch.allow_small_lot_exploration = data.allowSmallLotExploration ?? false;
    } else if (data.riskMode === "balanced") {
      patch.allow_watch_candidates = data.allowWatchCandidates ?? true;
      patch.allow_research_candidates = data.allowResearchCandidates ?? true;
      patch.allow_small_lot_exploration = data.allowSmallLotExploration ?? false;
    } else if (data.riskMode === "progressive") {
      patch.allow_watch_candidates = data.allowWatchCandidates ?? true;
      patch.allow_research_candidates = data.allowResearchCandidates ?? true;
      patch.allow_small_lot_exploration = data.allowSmallLotExploration ?? true;
    } else if (data.riskMode === "expert_research") {
      patch.allow_watch_candidates = data.allowWatchCandidates ?? true;
      patch.allow_research_candidates = data.allowResearchCandidates ?? true;
      patch.allow_small_lot_exploration = data.allowSmallLotExploration ?? true;
    }
    if (typeof data.allowOutcomeTrackingWithoutTrade === "boolean")
      patch.allow_outcome_tracking_without_trade = data.allowOutcomeTrackingWithoutTrade;
    if (typeof data.allowPremarketPlanning === "boolean")
      patch.allow_premarket_planning = data.allowPremarketPlanning;
    if (data.acknowledge) patch.autonomous_mode_acknowledged = true;

    const { error } = await supabaseAdmin.from("ai_trade_agents")
      .update(patch).eq("id", data.id).eq("user_id", USER_ID);
    if (error) throw new Error(error.message);
    return { ok: true, riskMode: data.riskMode };
  });

// ---------------- Backfill Hypothetical Outcomes ----------------
// Computes hypothetical returns (15m / 1h / EOD) for watch/research candidates
// that opted into outcome tracking. Pure observation — does NOT touch
// paper_orders or paper_positions. Used to learn whether candidates the agent
// skipped or only watched would have been profitable.
const BackfillSchema = z.object({
  agentId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const backfillScanCandidateOutcomes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BackfillSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const now = Date.now();
    let q = supabaseAdmin.from("ai_agent_scan_candidates")
      .select("id, agent_id, symbol, scan_price, created_at, outcome_15m, outcome_1h, outcome_eod, hypothetical_tracking_enabled, candidate_classification")
      .eq("hypothetical_tracking_enabled", true)
      .not("scan_price", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let processed = 0, updated = 0, skipped = 0;
    for (const row of (rows ?? []) as any[]) {
      processed++;
      const ageMs = now - new Date(row.created_at).getTime();
      const need15m = !row.outcome_15m && ageMs >= 15 * 60_000;
      const need1h  = !row.outcome_1h  && ageMs >= 60 * 60_000;
      const needEod = !row.outcome_eod && ageMs >= 6 * 60 * 60_000;
      if (!need15m && !need1h && !needEod) { skipped++; continue; }

      let quote: any = null;
      try { quote = await getQuote({ data: { symbol: row.symbol } }); } catch { /* tolerate */ }
      const price = Number(quote?.price ?? quote?.regularMarketPrice ?? NaN);
      if (!Number.isFinite(price) || price <= 0) { skipped++; continue; }

      const entry = Number(row.scan_price);
      const ret = entry > 0 ? ((price - entry) / entry) * 100 : 0;
      const stamp = new Date().toISOString();
      const outcome = (label: string) => ({
        observed_at: stamp,
        price_now: price,
        return_pct: Number(ret.toFixed(4)),
        label,
      });

      const patch: any = {};
      if (need15m) { patch.outcome_15m = outcome("15m"); patch.hypothetical_return_15m = Number(ret.toFixed(4)); }
      if (need1h)  { patch.outcome_1h  = outcome("1h");  patch.hypothetical_return_1h  = Number(ret.toFixed(4)); }
      if (needEod) { patch.outcome_eod = outcome("eod"); patch.hypothetical_return_eod = Number(ret.toFixed(4)); }

      const { error: upErr } = await supabaseAdmin
        .from("ai_agent_scan_candidates").update(patch).eq("id", row.id);
      if (!upErr) updated++;
    }

    return { processed, updated, skipped };
  });

