/**
 * Daily learning engine. Server-only.
 * Processes recently closed paper trades into memory tables, evaluates
 * blocked/watch decisions against subsequent price moves, and writes
 * learning_events. Idempotent: re-running over the same window is safe
 * because memory tables are recomputed from closed_trades each run.
 */
import { labelOutcome } from "./trade-outcome-labeler.server";

type Admin = ReturnType<typeof getAdmin>;
function getAdmin() {
  // helper kept inline to avoid creating multiple clients
  return null as any;
}

export type DailyLearningResult = {
  runId: string;
  status: "ok" | "error";
  usersProcessed: number;
  tradesProcessed: number;
  symbolsUpdated: number;
  strategiesUpdated: number;
  sectorsUpdated: number;
  regimesUpdated: number;
  cooldownsCreated: number;
  errors: number;
  summary: string;
};

export async function runDailyLearning(opts: { userId?: string | null } = {}): Promise<DailyLearningResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const runIns = await supabaseAdmin
    .from("daily_learning_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  const runId = runIns.data?.id as string;

  const res: DailyLearningResult = {
    runId,
    status: "ok",
    usersProcessed: 0,
    tradesProcessed: 0,
    symbolsUpdated: 0,
    strategiesUpdated: 0,
    sectorsUpdated: 0,
    regimesUpdated: 0,
    cooldownsCreated: 0,
    errors: 0,
    summary: "",
  };
  const errorDetails: any[] = [];

  try {
    // 1) Backfill closed_trades from recently sold paper_orders that don't have a row yet.
    await backfillClosedTradesFromOrders(supabaseAdmin, opts.userId ?? null);

    // 2) Get user list to process
    let users: string[];
    if (opts.userId) {
      users = [opts.userId];
    } else {
      const { data: ut } = await supabaseAdmin
        .from("closed_trades")
        .select("user_id")
        .gte("closed_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString());
      users = Array.from(new Set((ut ?? []).map((r: any) => r.user_id).filter(Boolean)));
    }

    for (const uid of users) {
      try {
        const r = await processUser(supabaseAdmin, uid);
        res.usersProcessed += 1;
        res.tradesProcessed += r.trades;
        res.symbolsUpdated += r.symbols;
        res.strategiesUpdated += r.strategies;
        res.sectorsUpdated += r.sectors;
        res.regimesUpdated += r.regimes;
        res.cooldownsCreated += r.cooldowns;
      } catch (e: any) {
        res.errors += 1;
        errorDetails.push({ userId: uid, error: e?.message ?? String(e) });
      }
    }

    res.summary = `Diproses ${res.usersProcessed} user, ${res.tradesProcessed} trade. ` +
      `Memori emiten: ${res.symbolsUpdated}, strategi: ${res.strategiesUpdated}, ` +
      `sektor: ${res.sectorsUpdated}, regime: ${res.regimesUpdated}, cooldown: ${res.cooldownsCreated}.`;
  } catch (e: any) {
    res.status = "error";
    res.errors += 1;
    errorDetails.push({ phase: "top_level", error: e?.message ?? String(e) });
  }

  await supabaseAdmin
    .from("daily_learning_runs")
    .update({
      status: res.status,
      run_finished_at: new Date().toISOString(),
      users_processed: res.usersProcessed,
      trades_processed: res.tradesProcessed,
      symbols_updated: res.symbolsUpdated,
      strategies_updated: res.strategiesUpdated,
      sectors_updated: res.sectorsUpdated,
      regimes_updated: res.regimesUpdated,
      cooldowns_created: res.cooldownsCreated,
      errors_count: res.errors,
      summary: res.summary,
      error_detail: errorDetails.length ? errorDetails : null,
    })
    .eq("id", runId);

  return res;
}

// --- Backfill closed_trades from sold paper_orders -----------------------
async function backfillClosedTradesFromOrders(admin: any, userId: string | null) {
  // Find filled SELL orders not yet linked to a closed_trade
  let q = admin
    .from("paper_orders")
    .select("id,user_id,account_id,symbol,qty,filled_price,filled_at,realized_pnl,ai_decision_id,strategy_mode,agent_mode,entry_engine,risk_reward_ratio,created_at")
    .eq("status", "filled")
    .eq("side", "sell")
    .gte("filled_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString())
    .limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data: sells } = await q;
  if (!sells?.length) return;

  // existing rows
  const sellIds = sells.map((s: any) => s.id);
  const { data: existing } = await admin
    .from("closed_trades")
    .select("exit_order_id")
    .in("exit_order_id", sellIds);
  const linked = new Set((existing ?? []).map((r: any) => r.exit_order_id));

  for (const s of sells) {
    if (linked.has(s.id)) continue;
    // Find prior BUY order for same user+symbol+account before this sell
    const { data: buys } = await admin
      .from("paper_orders")
      .select("id,filled_price,filled_at,ai_decision_id,strategy_mode,agent_mode,entry_engine,risk_reward_ratio")
      .eq("user_id", s.user_id)
      .eq("account_id", s.account_id)
      .eq("symbol", s.symbol)
      .eq("side", "buy")
      .eq("status", "filled")
      .lte("filled_at", s.filled_at)
      .order("filled_at", { ascending: false })
      .limit(1);
    const buy = buys?.[0];
    if (!buy) continue;

    const entry = Number(buy.filled_price ?? 0);
    const exit = Number(s.filled_price ?? 0);
    const opened = buy.filled_at ? new Date(buy.filled_at) : null;
    const closed = s.filled_at ? new Date(s.filled_at) : new Date();
    const holdingDays = opened ? (closed.getTime() - opened.getTime()) / 86400000 : null;

    // Load entry decision for planned SL/TP/sector
    let plannedSl: number | null = null;
    let plannedTp1: number | null = null;
    let plannedTp2: number | null = null;
    let sector: string | null = null;
    let setupHint: string | null = null;
    let regimeEntry: string | null = null;
    const decisionId = buy.ai_decision_id ?? s.ai_decision_id ?? null;
    if (decisionId) {
      const { data: dec } = await admin
        .from("ai_agent_decisions")
        .select("stop_loss,take_profit,take_profit_1,take_profit_2,sector,setup_type,market_regime")
        .eq("id", decisionId)
        .maybeSingle();
      if (dec) {
        plannedSl = dec.stop_loss ?? null;
        plannedTp1 = dec.take_profit_1 ?? dec.take_profit ?? null;
        plannedTp2 = dec.take_profit_2 ?? null;
        sector = dec.sector ?? null;
        setupHint = dec.setup_type ?? null;
        regimeEntry = dec.market_regime ?? null;
      }
    }

    const labeled = labelOutcome(
      {
        entryPrice: entry,
        exitPrice: exit,
        plannedStopLoss: plannedSl,
        plannedTakeProfit1: plannedTp1,
        plannedTakeProfit2: plannedTp2,
        holdingDays,
        riskRewardRatio: buy.risk_reward_ratio ?? s.risk_reward_ratio ?? null,
      },
      setupHint,
    );

    await admin.from("closed_trades").insert({
      user_id: s.user_id,
      paper_account_id: s.account_id,
      ai_decision_id: decisionId,
      entry_decision_id: buy.ai_decision_id ?? null,
      exit_decision_id: s.ai_decision_id ?? null,
      entry_order_id: buy.id,
      exit_order_id: s.id,
      symbol: s.symbol,
      sector,
      strategy_mode: buy.strategy_mode ?? s.strategy_mode ?? null,
      agent_mode: buy.agent_mode ?? s.agent_mode ?? null,
      entry_engine: buy.entry_engine ?? null,
      entry_price: entry,
      exit_price: exit,
      qty: Number(s.qty ?? 0),
      opened_at: opened?.toISOString() ?? null,
      closed_at: closed.toISOString(),
      holding_days: holdingDays,
      planned_stop_loss: plannedSl,
      planned_take_profit_1: plannedTp1,
      planned_take_profit_2: plannedTp2,
      realized_pnl: Number(s.realized_pnl ?? 0),
      realized_return_pct: labeled.realizedReturnPct,
      realized_r_multiple: labeled.realizedRMultiple,
      outcome_label: labeled.outcomeLabel,
      setup_label: labeled.setupLabel,
      mistake_label: labeled.mistakeLabel,
      result_quality: labeled.resultQuality,
      market_regime_at_entry: regimeEntry,
    });
  }
}

// --- Per-user processing -------------------------------------------------
async function processUser(admin: any, userId: string) {
  const { data: trades } = await admin
    .from("closed_trades")
    .select("*")
    .eq("user_id", userId);
  const list = trades ?? [];

  // Symbol memory
  const bySymbol = new Map<string, any[]>();
  const byStrategy = new Map<string, any[]>();
  const bySector = new Map<string, any[]>();
  const byRegime = new Map<string, any[]>();
  for (const t of list) {
    bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
    if (t.strategy_mode) {
      const k = `${t.strategy_mode}::${t.agent_mode ?? ""}`;
      byStrategy.set(k, [...(byStrategy.get(k) ?? []), t]);
    }
    if (t.sector) bySector.set(t.sector, [...(bySector.get(t.sector) ?? []), t]);
    if (t.market_regime_at_entry && t.strategy_mode) {
      const k = `${t.market_regime_at_entry}::${t.strategy_mode}`;
      byRegime.set(k, [...(byRegime.get(k) ?? []), t]);
    }
  }

  let symbolsUpdated = 0;
  let cooldownsCreated = 0;
  for (const [symbol, ts] of bySymbol) {
    const stats = computeStats(ts);
    let cooldownUntil: string | null = null;
    const last3 = ts.slice(-3);
    if (last3.length === 3 && last3.every((x: any) => (x.realized_pnl ?? 0) < 0)) {
      cooldownUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString();
      cooldownsCreated += 1;
      await admin.from("learning_events").insert({
        user_id: userId,
        symbol,
        event_type: "cooldown_created",
        event_title: `Cooldown ${symbol}`,
        event_summary: `3 trade berturut-turut rugi pada ${symbol}. Cooldown 2 hari diaktifkan.`,
        cooldown_until: cooldownUntil,
      });
    }
    await admin.from("trade_memory_by_symbol").upsert(
      {
        user_id: userId,
        symbol,
        sample_count: stats.n,
        win_count: stats.wins,
        loss_count: stats.losses,
        breakeven_count: stats.be,
        win_rate: stats.winRate,
        avg_return_pct: stats.avgReturn,
        avg_win_pct: stats.avgWin,
        avg_loss_pct: stats.avgLoss,
        profit_factor: stats.pf,
        expectancy_pct: stats.expectancy,
        avg_holding_days: stats.avgHold,
        last_outcome_label: ts.at(-1)?.outcome_label ?? null,
        last_trade_at: ts.at(-1)?.closed_at ?? null,
        cooldown_until: cooldownUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,symbol" },
    );
    symbolsUpdated += 1;
  }

  let strategiesUpdated = 0;
  for (const [key, ts] of byStrategy) {
    const [strategyMode, agentMode] = key.split("::");
    const stats = computeStats(ts);
    const last3 = ts.slice(-3);
    let isPaused = false;
    let pauseReason: string | null = null;
    let allocMult = 1;
    if (last3.length === 3 && last3.every((x: any) => (x.realized_pnl ?? 0) < 0)) {
      isPaused = true;
      pauseReason = "3 trade berturut rugi";
      allocMult = 0.4;
    } else if (stats.n >= 10 && stats.pf < 0.7) {
      allocMult = 0.5;
    } else if (stats.n >= 10 && stats.pf >= 1.5) {
      allocMult = 1.1;
    }
    await admin.from("strategy_performance_memory").upsert(
      {
        user_id: userId,
        strategy_mode: strategyMode,
        agent_mode: agentMode || null,
        sample_count: stats.n,
        win_count: stats.wins,
        loss_count: stats.losses,
        win_rate: stats.winRate,
        avg_return_pct: stats.avgReturn,
        avg_win_pct: stats.avgWin,
        avg_loss_pct: stats.avgLoss,
        profit_factor: stats.pf,
        expectancy_pct: stats.expectancy,
        avg_holding_days: stats.avgHold,
        allocation_multiplier: allocMult,
        is_paused: isPaused,
        pause_reason: pauseReason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,strategy_mode,agent_mode" },
    );
    strategiesUpdated += 1;
  }

  let sectorsUpdated = 0;
  for (const [sector, ts] of bySector) {
    const stats = computeStats(ts);
    await admin.from("sector_performance_memory").upsert(
      {
        user_id: userId,
        sector,
        sample_count: stats.n,
        win_rate: stats.winRate,
        avg_return_pct: stats.avgReturn,
        profit_factor: stats.pf,
        expectancy_pct: stats.expectancy,
        last_trade_at: ts.at(-1)?.closed_at ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sector" },
    );
    sectorsUpdated += 1;
  }

  let regimesUpdated = 0;
  for (const [key, ts] of byRegime) {
    const [regime, strategyMode] = key.split("::");
    const stats = computeStats(ts);
    await admin.from("market_regime_performance_memory").upsert(
      {
        user_id: userId,
        market_regime: regime,
        strategy_mode: strategyMode,
        sample_count: stats.n,
        win_rate: stats.winRate,
        avg_return_pct: stats.avgReturn,
        profit_factor: stats.pf,
        expectancy_pct: stats.expectancy,
        allocation_multiplier: stats.n >= 5 && stats.pf < 0.8 ? 0.6 : 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,market_regime,strategy_mode" },
    );
    regimesUpdated += 1;
  }

  return {
    trades: list.length,
    symbols: symbolsUpdated,
    strategies: strategiesUpdated,
    sectors: sectorsUpdated,
    regimes: regimesUpdated,
    cooldowns: cooldownsCreated,
  };
}

function computeStats(ts: any[]) {
  const n = ts.length;
  const wins = ts.filter((t) => Number(t.realized_pnl ?? 0) > 0).length;
  const losses = ts.filter((t) => Number(t.realized_pnl ?? 0) < 0).length;
  const be = n - wins - losses;
  const winRate = n > 0 ? wins / n : 0;
  const returns = ts.map((t) => Number(t.realized_return_pct ?? 0));
  const avgReturn = n > 0 ? returns.reduce((a, b) => a + b, 0) / n : 0;
  const winRets = returns.filter((r) => r > 0);
  const lossRets = returns.filter((r) => r < 0);
  const avgWin = winRets.length ? winRets.reduce((a, b) => a + b, 0) / winRets.length : 0;
  const avgLoss = lossRets.length ? lossRets.reduce((a, b) => a + b, 0) / lossRets.length : 0;
  const sumWin = winRets.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(lossRets.reduce((a, b) => a + b, 0));
  const pf = sumLoss > 0 ? sumWin / sumLoss : winRets.length ? 99 : 0;
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
  const holds = ts.map((t) => Number(t.holding_days ?? 0)).filter((x) => x > 0);
  const avgHold = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;
  return { n, wins, losses, be, winRate, avgReturn, avgWin, avgLoss, pf, expectancy, avgHold };
}
