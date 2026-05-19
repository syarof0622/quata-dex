// AI Trade Agent server functions. Start/pause/stop/status/decisions/perf + a
// runOnce primitive shared by the cron worker. Single super-admin user pattern.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evaluateSymbol, type AgentConfig, type AgentDecision, type Position } from "./ai-agent-decision-engine";
import { isIDXSymbol, convertSharesToLot } from "./lot-sizing";
import { getQuote } from "./market.functions";
import { canExecutePaperTrade, getIDXMarketSession } from "./idx-market-session";

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
  selectedSymbols: z.array(z.string().min(1).max(20)).min(1).max(20),
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
});

export const startAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StartSchema.parse(d))
  .handler(async ({ data }) => {
    const acct = await ensurePaperAccount();
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
    }).select("*").single();
    if (error) throw new Error(error.message);
    return agent;
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
}) {
  const { agentId, paperAccountId, symbol, side, shares, price, existing, reason, decision, decisionId } = opts;
  const slipPct = slippagePctFor(symbol);
  const fillPrice = +(price * (1 + slipPct * (side === "buy" ? 1 : -1))).toFixed(4);
  const notional = fillPrice * shares;
  const feePct = side === "buy" ? BUY_FEE_PCT : SELL_FEE_PCT;
  const fee = +(notional * feePct).toFixed(2);

  const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", paperAccountId).single();
  if (!account) throw new Error("paper account missing");
  const cashBefore = Number(account.cash);

  let realizedPnl = 0;
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
    realizedPnl = +((fillPrice - Number(existing.avg_price)) * shares - fee).toFixed(2);
    const remaining = Number(existing.qty) - shares;
    if (remaining === 0) await supabaseAdmin.from("paper_positions").delete().eq("user_id", USER_ID).eq("symbol", symbol);
    else await supabaseAdmin.from("paper_positions").update({ qty: remaining }).eq("user_id", USER_ID).eq("symbol", symbol);
    cashAfter = cashBefore + notional - fee;
    await supabaseAdmin.from("paper_accounts").update({ cash: cashAfter }).eq("id", paperAccountId);
  }

  const { data: order } = await supabaseAdmin.from("paper_orders").insert({
    account_id: paperAccountId, user_id: USER_ID, symbol, side, type: "market", qty: shares,
    price, filled_price: fillPrice, status: "filled", filled_at: new Date().toISOString(),
    realized_pnl: realizedPnl, slippage_pct: slipPct, fee,
  }).select("*").single();

  const paperExecution = {
    executed: true, orderId: order?.id ?? null,
    paperBalanceBefore: cashBefore, paperBalanceAfter: cashAfter,
    requestedPrice: price, simulatedFillPrice: fillPrice,
    slippagePercent: slipPct, fee, feePercent: feePct,
    realisticFill: true, rejectionReason: null,
  };

  await supabaseAdmin.from("ai_agent_training_events").insert({
    agent_id: agentId, order_id: order?.id, decision_id: decisionId ?? null, symbol,
    real_market_data: (decision?.realMarketData ?? null) as any,
    real_technical_data: (decision?.realTechnicalData ?? null) as any,
    real_news_data: (decision?.realNewsData ?? null) as any,
    real_disclosure_data: (decision?.realDisclosureData ?? null) as any,
    real_market_context: (decision?.realMarketContext ?? null) as any,
    ai_decision: decision ? ({
      action: decision.action, confidence: decision.confidence,
      rawConfidence: decision.rawConfidence, calibrationReason: decision.calibrationReason,
      strategy: decision.strategy, allocationAmount: decision.allocationAmount,
      lot: decision.suggestedLot, shares: decision.suggestedShares,
      entryPrice: decision.entryPrice, stopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit, riskRewardRatio: decision.riskRewardRatio,
      reasoning: decision.reasoning,
    } as any) : ({ side, shares, fillPrice, reason } as any),
    paper_execution: paperExecution as any,
    decision_output: { side, shares, fillPrice, reason } as any,
    actual_outcome: { realizedPnl, fee } as any,
    pnl: realizedPnl, model_version: "agent-v1.1", strategy_version: "real-data-v1",
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

  // Reflect market session into agent.status (advisory)
  const session = getIDXMarketSession();
  const hasIdx = (agent.selected_symbols as string[]).some(isIDXSymbol);
  let nextStatus = agent.status;
  if (agent.status !== "paused") {
    if (hasIdx) {
      nextStatus = session.isOpen ? "active_market_open"
                 : session.isBreak ? "active_market_break" : "active_market_closed";
    } else nextStatus = "active_market_open";
  }
  await supabaseAdmin.from("ai_trade_agents").update({ status: nextStatus, last_run_at: new Date().toISOString() })
    .eq("id", agentId);

  if (agent.status === "paused") return { decisions: [], executed: 0 };

  // Daily trades cap
  const sinceDay = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: todayCount } = await supabaseAdmin.from("paper_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID).gte("created_at", sinceDay);
  const dailyTradesLeft = Math.max(0, Number(agent.max_daily_trades) - (todayCount ?? 0));

  const { data: acct } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", agent.paper_account_id).single();
  const { data: positions } = await supabaseAdmin.from("paper_positions").select("*").eq("user_id", USER_ID);
  const posList: Position[] = (positions ?? []).map((p: any) => ({ symbol: p.symbol, qty: Number(p.qty), avg_price: Number(p.avg_price) }));
  const account = { cash: Number(acct!.cash), equity: Number(acct!.equity ?? acct!.cash) };

  const cfg: AgentConfig = {
    id: agent.id, riskLevel: agent.risk_level, strategyMode: agent.strategy_mode,
    allocationAmount: Number(agent.allocation_amount ?? 1_000_000),
    maxPositionPerSymbol: Number(agent.max_position_per_symbol ?? 0.25),
    minConfidenceToTrade: Number(agent.min_confidence_to_trade ?? 0.7),
    autoStopLoss: !!agent.auto_stop_loss, autoTakeProfit: !!agent.auto_take_profit,
    allowBuy: !!agent.allow_buy, allowSell: !!agent.allow_sell,
    tradingHoursOnly: !!agent.trading_hours_only, requireFreshData: !!agent.require_fresh_data,
  };

  const decisions: AgentDecision[] = [];
  let executed = 0;
  let tradesUsed = 0;

  for (const sym of (agent.selected_symbols as string[])) {
    try {
      const decision = await evaluateSymbol(cfg, sym, account, posList);
      decisions.push(decision);

      let decisionStatus: "executed" | "rejected" | "hold" | "cooldown" | "limit_reached" = "hold";
      let orderId: string | null = null;

      const isTrade = decision.action === "BUY" || decision.action === "EXIT";
      if (isTrade && tradesUsed >= dailyTradesLeft) {
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
        decision_status: decisionStatus,
        idempotency_key: idemKey(agent.id, sym, decision.action),
      });
    } catch (e: any) {
      await supabaseAdmin.from("ai_agent_risk_logs").insert({
        agent_id: agent.id, symbol: sym, risk_type: "engine_error",
        risk_level: "warning", message: e?.message ?? "engine error", action_taken: "skip",
      });
    }
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

  // Recompute performance summary
  await recomputePerformance(agent.id, agent.paper_account_id);

  return { decisions, executed };
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
      const ageMin = (Date.now() - new Date(ev.created_at).getTime()) / 60000;
      const px = await fetchPx(ev.symbol);
      if (!px) continue;

      const pnlPctRaw = ((px - entry) / entry) * 100 * (isLong ? 1 : (isExit ? -1 : 1));
      const patch: any = { evaluated_at: new Date().toISOString() };

      if (!ev.outcome_15m && ageMin >= 15) {
        patch.outcome_15m = { priceAfter15m: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      if (!ev.outcome_1h && ageMin >= 60) {
        patch.outcome_1h = { priceAfter1h: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      // End-of-day (≥ 6 hours since decision = same trading day window)
      if (!ev.outcome_eod && ageMin >= 360) {
        patch.outcome_eod = { endOfDayPrice: px, pnlPercent: +pnlPctRaw.toFixed(3) };
      }
      // Finalize: realized exit OR > 24h elapsed
      if (!ev.final_outcome && (Number(ev.pnl ?? 0) !== 0 || ageMin >= 1440)) {
        const realized = Number(ev.pnl ?? 0);
        const pnlPercent = realized !== 0
          ? +((realized / Math.max(1, entry * (dec.shares ?? 1))) * 100).toFixed(3)
          : +pnlPctRaw.toFixed(3);
        const wasCorrect = isLong ? pnlPercent > 0 : isExit ? pnlPercent < 0 : null;
        let lesson = "data_stale_hold_correct";
        if (isLong && pnlPercent >= 2) lesson = "take_profit_success";
        else if (isLong && pnlPercent <= -1.5) lesson = "stop_loss_too_tight";
        else if (isLong && pnlPercent > 0) lesson = "good_entry";
        else if (isLong && pnlPercent <= 0) lesson = "false_positive_signal";
        else if (isExit && pnlPercent < 0) lesson = "good_exit";
        else if (isExit && pnlPercent >= 0) lesson = "bad_exit";

        patch.final_outcome = {
          exitPrice: px, paperPnL: realized, paperPnLPercent: pnlPercent,
          wasDirectionCorrect: wasCorrect,
        };
        patch.paper_pnl_percent = pnlPercent;
        patch.was_correct = wasCorrect;
        patch.lesson_label = lesson;
      }

      if (Object.keys(patch).length > 1) {
        await supabaseAdmin.from("ai_agent_training_events").update(patch).eq("id", ev.id);
      }
    } catch { /* tolerate per-row */ }
  }
}

async function recomputePerformance(agentId: string, paperAccountId: string) {
  const { data: events } = await supabaseAdmin.from("ai_agent_training_events")
    .select("pnl").eq("agent_id", agentId);
  const arr = (events ?? []).map(e => Number(e.pnl ?? 0)).filter(n => !Number.isNaN(n));
  const trades = arr.length;
  const wins = arr.filter(n => n > 0);
  const losses = arr.filter(n => n < 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const total = sum(arr);
  const profitFactor = losses.length ? sum(wins) / Math.abs(sum(losses)) : (wins.length ? 99 : 0);
  const perf = {
    agent_id: agentId, paper_account_id: paperAccountId, total_trades: trades,
    win_rate: trades ? (wins.length / trades) * 100 : 0,
    loss_rate: trades ? (losses.length / trades) * 100 : 0,
    avg_win: wins.length ? sum(wins) / wins.length : 0,
    avg_loss: losses.length ? sum(losses) / losses.length : 0,
    profit_factor: Number.isFinite(profitFactor) ? profitFactor : 0,
    total_return: total,
    best_trade: arr.length ? Math.max(...arr) : 0,
    worst_trade: arr.length ? Math.min(...arr) : 0,
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
