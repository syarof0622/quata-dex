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

async function executePaperFill(opts: {
  agentId: string; paperAccountId: string; symbol: string; side: "buy" | "sell";
  shares: number; price: number; existing?: Position; reason: string;
}) {
  const { agentId, paperAccountId, symbol, side, shares, price, existing, reason } = opts;
  const slip = 0.0005 * (side === "buy" ? 1 : -1);
  const fillPrice = price * (1 + slip);
  const notional = fillPrice * shares;
  const fee = notional * 0.001;

  const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", paperAccountId).single();
  if (!account) throw new Error("paper account missing");

  let realizedPnl = 0;
  if (side === "buy") {
    if (Number(account.cash) < notional + fee) throw new Error("Insufficient cash");
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
    await supabaseAdmin.from("paper_accounts").update({ cash: Number(account.cash) - notional - fee }).eq("id", paperAccountId);
  } else {
    if (!existing || Number(existing.qty) < shares) throw new Error("Position insufficient for sell");
    realizedPnl = (fillPrice - Number(existing.avg_price)) * shares - fee;
    const remaining = Number(existing.qty) - shares;
    if (remaining === 0) await supabaseAdmin.from("paper_positions").delete().eq("user_id", USER_ID).eq("symbol", symbol);
    else await supabaseAdmin.from("paper_positions").update({ qty: remaining }).eq("user_id", USER_ID).eq("symbol", symbol);
    await supabaseAdmin.from("paper_accounts").update({ cash: Number(account.cash) + notional - fee }).eq("id", paperAccountId);
  }

  const { data: order } = await supabaseAdmin.from("paper_orders").insert({
    account_id: paperAccountId, user_id: USER_ID, symbol, side, type: "market", qty: shares,
    price, filled_price: fillPrice, status: "filled", filled_at: new Date().toISOString(),
    realized_pnl: realizedPnl,
  }).select("*").single();

  await supabaseAdmin.from("ai_agent_training_events").insert({
    agent_id: agentId, order_id: order?.id, symbol,
    decision_output: { side, shares, fillPrice, reason },
    actual_outcome: { realizedPnl, fee },
    pnl: realizedPnl, model_version: "agent-v1.0",
  });

  return { order, realizedPnl, fillPrice };
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
                existing, reason: decision.reasoning,
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
        strategy: decision.strategy, allocation_amount: decision.allocationAmount,
        suggested_lot: decision.suggestedLot, suggested_shares: decision.suggestedShares,
        entry_price: decision.entryPrice, stop_loss: decision.stopLoss, take_profit: decision.takeProfit,
        risk_reward_ratio: decision.riskRewardRatio, reasoning: decision.reasoning,
        data_snapshot: decision.dataSnapshot, technical_snapshot: decision.technicalSnapshot,
        sentiment_snapshot: decision.sentimentSnapshot, portfolio_snapshot: decision.portfolioSnapshot,
        risk_snapshot: decision.riskSnapshot, decision_status: decisionStatus,
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

  // Recompute performance summary
  await recomputePerformance(agent.id, agent.paper_account_id);

  return { decisions, executed };
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
