// Server-only helper: aggregates app state into a compact JSON context for the AI Trading Analyst.
// Read-only. Per-section try/catch so a single failing query never breaks the chat.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIDXMarketSession, canExecutePaperTrade } from "@/lib/idx-market-session";

const USER_ID = "00000000-0000-0000-0000-000000000001";

type Status = "connected" | "empty" | "stale" | "error" | "inactive" | "fresh" | "partial" | "unavailable" | "available" | "insufficient_data";

function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return fn().then(data => ({ ok: true as const, data })).catch(e => {
    console.error(`[ai-app-context] ${label} failed:`, e?.message ?? e);
    return { ok: false as const, error: String(e?.message ?? e).slice(0, 200) };
  });
}

// Lightweight intent detection — drives which sections get emphasis.
function detectIntent(text: string): { focus: string[]; tickers: string[] } {
  const t = (text || "").toLowerCase();
  const focus: string[] = [];
  if (/(portfolio|posisi|saldo|risk|risiko|aman|equity|cash)/.test(t)) focus.push("portfolio");
  if (/(kenapa ai|agent|otomatis|decision|autonomous|worker|tidak buy|tidak beli|blocked)/.test(t)) focus.push("agent");
  if (/(saham apa|beli apa|rekomendasi|layak beli|pick|recommend)/.test(t)) focus.push("recommend");
  if (/(undervalue|valuasi|murah)/.test(t)) focus.push("undervalue");
  if (/(momentum|gainer|breakout|volume)/.test(t)) focus.push("momentum");
  if (/(news|berita|sentimen|sentiment)/.test(t)) focus.push("news");
  if (/(alert|notifikasi)/.test(t)) focus.push("alerts");
  if (/(backtest|strateg)/.test(t)) focus.push("backtest");
  if (/(journal|jurnal|lesson|pelajaran)/.test(t)) focus.push("journal");
  if (/(source|sumber|data quality|freshness|fresh)/.test(t)) focus.push("dataQuality");

  // Ticker extraction (IDX style)
  const tickers = new Set<string>();
  const stop = new Set(["IDX","IHSG","BEI","AI","USD","IDR","BUY","SELL","HOLD","STOP","TP","SL"]);
  const re = /\b([A-Z]{3,5})(?:\.JK)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || "")) !== null) {
    const sym = m[1];
    if (sym.length >= 3 && sym.length <= 4 && !stop.has(sym)) tickers.add(sym);
  }
  return { focus, tickers: [...tickers].slice(0, 6) };
}

export async function getAIAppContext(userText: string) {
  const intent = detectIntent(userText);
  const contextStatus: Record<string, Status> = {} as any;

  // ---------- PORTFOLIO + PAPER TRADING ----------
  const paperRes = await safe("paper", async () => {
    const { data: account } = await supabaseAdmin
      .from("paper_accounts").select("*").eq("user_id", USER_ID).maybeSingle();
    if (!account) return { account: null, positions: [], orders: [], risk: null };
    const [{ data: positions }, { data: orders }, { data: risk }] = await Promise.all([
      supabaseAdmin.from("paper_positions").select("*").eq("account_id", account.id),
      supabaseAdmin.from("paper_orders").select("*").eq("account_id", account.id).order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("portfolio_risk_snapshots").select("*").eq("paper_account_id", account.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { account, positions: positions ?? [], orders: orders ?? [], risk: risk ?? null };
  });

  let portfolio: any = { status: "empty" as Status };
  let paperTrading: any = { status: "empty" as Status };
  let openPositions: any[] = [];

  if (paperRes.ok && paperRes.data.account) {
    const { account, positions, orders, risk } = paperRes.data;
    const filledOrders = orders.filter((o: any) => o.status === "filled");
    const pendingOrders = orders.filter((o: any) => o.status !== "filled" && o.status !== "cancelled");
    // Closed trade = sell order with realized_pnl recorded (can be negative, zero, or positive).
    const closedTrades = filledOrders.filter((o: any) => o.side === "sell" && o.realized_pnl !== null && o.realized_pnl !== undefined);
    const wins = closedTrades.filter((o: any) => Number(o.realized_pnl) > 0).length;
    const losses = closedTrades.filter((o: any) => Number(o.realized_pnl) < 0).length;
    const grossWin = closedTrades.filter((o: any) => Number(o.realized_pnl) > 0).reduce((s: number, o: any) => s + Number(o.realized_pnl), 0);
    const grossLoss = Math.abs(closedTrades.filter((o: any) => Number(o.realized_pnl) < 0).reduce((s: number, o: any) => s + Number(o.realized_pnl), 0));
    const realizedPnlTotal = closedTrades.reduce((s: number, o: any) => s + Number(o.realized_pnl ?? 0), 0);

    // AI-agent-only slices (ownership = paper_orders.agent_id present)
    const agentFilledOrders = filledOrders.filter((o: any) => o.agent_id);
    const agentClosedTrades = agentFilledOrders.filter((o: any) => o.side === "sell" && o.realized_pnl !== null && o.realized_pnl !== undefined);
    const agentWins = agentClosedTrades.filter((o: any) => Number(o.realized_pnl) > 0).length;
    const agentGrossWin = agentClosedTrades.filter((o: any) => Number(o.realized_pnl) > 0).reduce((s: number, o: any) => s + Number(o.realized_pnl), 0);
    const agentGrossLoss = Math.abs(agentClosedTrades.filter((o: any) => Number(o.realized_pnl) < 0).reduce((s: number, o: any) => s + Number(o.realized_pnl), 0));
    const agentRealizedPnl = agentClosedTrades.reduce((s: number, o: any) => s + Number(o.realized_pnl ?? 0), 0);
    // Map open positions to AI agent if the latest buy for that symbol had agent_id.
    const latestBuyBySymbol: Record<string, any> = {};
    for (const o of filledOrders) {
      if (o.side === "buy" && !latestBuyBySymbol[o.symbol]) latestBuyBySymbol[o.symbol] = o;
    }

    openPositions = positions.map((p: any) => {
      const lastBuy = latestBuyBySymbol[p.symbol];
      return {
        symbol: p.symbol,
        qty: Number(p.qty),
        lot: Math.round(Number(p.qty) / 100),
        avgEntry: Number(p.avg_price),
        // NOTE: marketValueAtCost = qty × avg_entry, NOT current market value (no live price here).
        marketValueAtCost: Number(p.qty) * Number(p.avg_price),
        openedAt: p.opened_at,
        ownershipSource: lastBuy?.agent_id ? "ai_agent" : (lastBuy ? "manual_or_unknown" : "unknown"),
        openedByAgentId: lastBuy?.agent_id ?? null,
      };
    });
    const agentOpenPositionsCount = openPositions.filter((p) => p.ownershipSource === "ai_agent").length;
    const holdingsValueAtCost = openPositions.reduce((s, p) => s + (p.marketValueAtCost || 0), 0);

    portfolio = {
      currency: account.currency,
      cash: Number(account.cash),
      equity: Number(account.equity),
      holdingsValueAtCost,
      unrealizedPnl: risk?.unrealized_pnl_snapshot ?? null,
      realizedPnl: risk?.realized_pnl_snapshot ?? realizedPnlTotal,
      openPositionsCount: openPositions.length,
      closedTradesCount: closedTrades.length,
      executedOrdersCount: filledOrders.length,
      // Account-wide win rate is null when there are no closed trades — UI must render "N/A".
      winRate: closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null,
      riskLevel: risk?.risk_level ?? "unknown",
      maxPositionWeight: risk?.max_position_weight ?? null,
      sectorConcentration: risk?.sector_concentration ?? {},
      warnings: risk?.warnings ?? [],
      lastUpdated: risk?.created_at ?? null,
      openPositions,
      ownershipNote: "marketValueAtCost = qty × avg_entry. Last price not joined here; do NOT label this as 'market value at last price'.",
    };

    // Separate account-wide vs AI-agent-only performance scopes.
    const accountPerformance = {
      source: "paper_account_all",
      executedOrders: filledOrders.length,
      openPositions: openPositions.length,
      closedTrades: closedTrades.length,
      wins, losses,
      realizedPnl: realizedPnlTotal,
      unrealizedPnl: risk?.unrealized_pnl_snapshot ?? null,
      winRate: closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null,
      profitFactor: closedTrades.length && grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
      winRateLabel: closedTrades.length ? `${Math.round((wins / closedTrades.length) * 100)}% (account-wide)` : "N/A",
    };
    const agentPerformance = {
      source: "ai_agent_only",
      aiExecutedOrders: agentFilledOrders.length,
      aiOpenPositions: agentOpenPositionsCount,
      aiClosedTrades: agentClosedTrades.length,
      aiRealizedPnl: agentRealizedPnl,
      aiWinRate: agentClosedTrades.length ? Math.round((agentWins / agentClosedTrades.length) * 100) : null,
      aiProfitFactor: agentClosedTrades.length && agentGrossLoss > 0 ? Math.round((agentGrossWin / agentGrossLoss) * 100) / 100 : null,
      ownershipNote: "Slice based on paper_orders.agent_id presence. Orders without agent_id are NOT attributed to the AI Agent.",
      sampleValidity: agentClosedTrades.length >= 20 ? "valid" : agentClosedTrades.length > 0 ? "small_sample" : "no_closed_trades",
    };

    paperTrading = {
      accountCurrency: account.currency,
      availableCash: Number(account.cash),
      equity: Number(account.equity),
      pendingOrdersCount: pendingOrders.length,
      filledOrdersCount: filledOrders.length,
      openPositionsCount: openPositions.length,
      closedTradesCount: closedTrades.length,
      accountPerformance,
      agentPerformance,
      recentOrders: orders.slice(0, 10).map((o: any) => ({
        symbol: o.symbol, side: o.side, status: o.status,
        qty: Number(o.qty), lot: Math.round(Number(o.qty) / 100),
        price: o.price, filledPrice: o.filled_price,
        realizedPnl: o.realized_pnl !== null && o.realized_pnl !== undefined ? Number(o.realized_pnl) : null,
        agentId: o.agent_id ?? null,
        source: o.agent_id ? "ai_agent" : "manual_or_unknown",
        createdAt: o.created_at, filledAt: o.filled_at,
      })),
      recentExecutedOrders: filledOrders.slice(0, 10).map((o: any) => ({
        symbol: o.symbol, side: o.side, qty: Number(o.qty), filledPrice: o.filled_price, filledAt: o.filled_at,
        source: o.agent_id ? "ai_agent" : "manual_or_unknown",
      })),
      recentClosedTrades: closedTrades.slice(0, 8).map((o: any) => {
        const pnl = Number(o.realized_pnl);
        const result = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";
        return {
          symbol: o.symbol, qty: Number(o.qty), realizedPnl: pnl, result,
          filledAt: o.filled_at,
          source: o.agent_id ? "ai_agent" : "manual_or_unknown",
        };
      }),
    };
    contextStatus.portfolio = openPositions.length || filledOrders.length ? "connected" : "empty";
  } else {
    contextStatus.portfolio = paperRes.ok ? "empty" : "error";
    if (!paperRes.ok) (portfolio as any).error = paperRes.error;
  }

  // ---------- AI TRADE AGENT ----------
  const agentRes = await safe("agent", async () => {
    // Pick the most active agent (active status > automation_enabled > most recent worker activity).
    const { data: agents } = await supabaseAdmin
      .from("ai_trade_agents").select("*").eq("user_id", USER_ID);
    const list = agents ?? [];
    const activeStatuses = new Set(["active_market_open", "active", "running"]);
    const scoreAgent = (a: any) => {
      let s = 0;
      if (activeStatuses.has(a.status)) s += 1_000_000;
      if (a.automation_enabled) s += 500_000;
      const lwr = a.last_worker_run_at ? new Date(a.last_worker_run_at).getTime() : 0;
      const lad = a.last_auto_decision_at ? new Date(a.last_auto_decision_at).getTime() : 0;
      const upd = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      s += Math.max(lwr, lad, upd) / 1000;
      return s;
    };
    const agent = list.length ? [...list].sort((a, b) => scoreAgent(b) - scoreAgent(a))[0] : null;
    if (!agent) return { agent: null, decisions: [], scans: [], candidates: [], perf: null };
    const [{ data: decisions }, { data: scans }, { data: perf }] = await Promise.all([
      supabaseAdmin.from("ai_agent_decisions").select("*").eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("ai_agent_scans").select("*").eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(1),
      supabaseAdmin.from("ai_agent_performance").select("*").eq("agent_id", agent.id).maybeSingle(),
    ]);
    const latestScan = scans?.[0];
    let candidates: any[] = [];
    if (latestScan) {
      const { data: cands } = await supabaseAdmin
        .from("ai_agent_scan_candidates").select("*").eq("scan_id", latestScan.id).order("rank", { ascending: true }).limit(10);
      candidates = cands ?? [];
    }
    return { agent, decisions: decisions ?? [], scans: scans ?? [], candidates, perf };
  });

  let aiTradeAgent: any = { status: "inactive" as Status, isAutoRunning: false, statusLabel: "Inactive" };
  let autonomousScanner: any = { status: "empty" as Status };

  if (agentRes.ok && agentRes.data.agent) {
    const { agent, decisions, scans, candidates, perf } = agentRes.data;
    const executedBuys = decisions.filter((d: any) => d.action === "buy" && d.decision_status === "executed");
    const blocked = decisions.filter((d: any) => d.decision_status === "blocked" || d.decision_status === "blocked_by_risk");
    const watch = decisions.filter((d: any) => d.candidate_classification === "watch" || d.decision_status === "watch_snapshot");
    const research = decisions.filter((d: any) => d.research_trade || d.candidate_classification === "research");

    // Derive isAutoRunning + statusLabel from worker freshness, status, and automation flag.
    const activeStatuses = new Set(["active_market_open", "active", "running"]);
    const lwrTs = agent.last_worker_run_at ? new Date(agent.last_worker_run_at).getTime() : 0;
    const workerFreshMins = lwrTs ? (Date.now() - lwrTs) / 60000 : Infinity;
    const workerFresh = workerFreshMins <= 30;
    const workerOk = !agent.last_worker_status || agent.last_worker_status === "success" || agent.last_worker_status === "running";
    const isAutoRunning = Boolean(agent.automation_enabled && workerFresh && activeStatuses.has(agent.status) && workerOk);
    let statusLabel: string;
    if (isAutoRunning) statusLabel = "Auto Running";
    else if (agent.automation_enabled && activeStatuses.has(agent.status) && !workerFresh) statusLabel = "Worker Stale";
    else if (agent.automation_enabled && agent.last_worker_status === "error") statusLabel = "Error";
    else if (agent.automation_enabled === false && activeStatuses.has(agent.status)) statusLabel = "Manual Only";
    else statusLabel = "Inactive";

    aiTradeAgent = {
      status: agent.status,
      statusLabel,
      isAutoRunning,
      automationEnabled: agent.automation_enabled,
      workerFreshMinutesAgo: Number.isFinite(workerFreshMins) ? Math.round(workerFreshMins) : null,
      symbolSelectionMode: agent.symbol_selection_mode,
      autonomousRiskMode: agent.autonomous_risk_mode,
      selectedSymbols: agent.selected_symbols,
      lastWorkerRunAt: agent.last_worker_run_at,
      nextExpectedWorkerRunAt: agent.next_expected_worker_run_at,
      lastAutoDecisionAt: agent.last_auto_decision_at,
      lastAutoExecutionAt: agent.last_auto_execution_at,
      lastBlockedReason: agent.last_blocked_reason,
      workerStatus: agent.last_worker_status,
      workerMessage: agent.last_worker_message,
      recentDecisions: decisions.map((d: any) => ({
        time: d.created_at, symbol: d.symbol, action: d.action,
        decisionStatus: d.decision_status, confidence: d.confidence,
        calibratedConfidence: d.calibrated_confidence,
        lot: d.suggested_lot, entry: d.entry_price,
        stopLoss: d.stop_loss, takeProfit: d.take_profit,
        candidateClassification: d.candidate_classification,
        reasoning: typeof d.reasoning === "string" ? d.reasoning.slice(0, 220) : null,
      })),
      recentExecutedBuys: executedBuys.slice(0, 10).map((d: any) => ({
        time: d.created_at, symbol: d.symbol, lot: d.suggested_lot, entry: d.entry_price, confidence: d.calibrated_confidence ?? d.confidence,
      })),
      recentBlockedDecisions: blocked.slice(0, 10).map((d: any) => ({
        time: d.created_at, symbol: d.symbol, blockedReason: d.calibration_reason || d.selection_reason || agent.last_blocked_reason,
      })),
      recentWatchSnapshots: watch.slice(0, 5).map((d: any) => ({ time: d.created_at, symbol: d.symbol })),
      recentResearchSnapshots: research.slice(0, 5).map((d: any) => ({ time: d.created_at, symbol: d.symbol })),
      whyNoBuySummary: executedBuys.length === 0
        ? (agent.last_blocked_reason ?? blocked[0]?.calibration_reason ?? "No executed paper buys recently. Check market session, candidate scores, risk limits, and data freshness.")
        : null,
      performanceSummary: perf ? {
        totalTrades: perf.total_trades,
        winRate: perf.total_trades > 0 ? perf.win_rate : null,
        profitFactor: perf.total_trades > 0 ? perf.profit_factor : null,
        totalReturn: perf.total_return,
        maxDrawdown: perf.max_drawdown,
        note: !perf.total_trades ? "No closed AI trades yet — win rate / profit factor must be rendered as N/A." : null,
      } : null,
    };
    contextStatus.aiTradeAgent = isAutoRunning ? "connected" : (agent.automation_enabled ? "partial" : "inactive");

    const latestScan = scans[0];
    if (latestScan) {
      autonomousScanner = {
        latestScanTime: latestScan.scan_time,
        universe: latestScan.universe,
        symbolsScannedCount: latestScan.symbols_scanned_count,
        validCandidatesCount: latestScan.valid_candidates_count,
        selectedSymbols: latestScan.selected_symbols,
        topCandidates: candidates.map((c: any) => ({
          rank: c.rank, symbol: c.symbol, autonomousScore: c.autonomous_score,
          technicalScore: c.technical_score, liquidityScore: c.liquidity_score,
          sentimentScore: c.sentiment_score, riskScore: c.risk_score,
          candidateClassification: c.candidate_classification,
          executionEligibility: c.execution_eligibility,
          blockedReason: c.blocked_reason, rejectionReason: c.rejection_reason, reason: c.reason,
        })),
      };
    }
  } else if (!agentRes.ok) {
    contextStatus.aiTradeAgent = "error";
    aiTradeAgent.error = agentRes.error;
  }

  // ---------- WATCHLIST ----------
  const watchlistRes = await safe("watchlist", async () => {
    const { data } = await supabaseAdmin
      .from("watchlist").select("symbol, added_at").eq("user_id", USER_ID).order("added_at", { ascending: false }).limit(20);
    return data ?? [];
  });
  const watchlist: any = watchlistRes.ok
    ? { count: watchlistRes.data.length, symbols: watchlistRes.data.map((w: any) => w.symbol), status: watchlistRes.data.length ? "connected" : "empty" }
    : { status: "error", error: watchlistRes.error };
  contextStatus.watchlist = watchlist.status as Status;

  // ---------- NEWS & SENTIMENT ----------
  const newsRes = await safe("news", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: news } = await supabaseAdmin
      .from("news_articles")
      .select("title, source, sentiment, sentiment_score, impact_level, impact_score, published_at, tickers")
      .gte("published_at", since).eq("is_duplicate", false)
      .order("published_at", { ascending: false }).limit(50);
    return news ?? [];
  });
  let newsSentiment: any = { status: "unavailable" as Status };
  if (newsRes.ok) {
    const news = newsRes.data;
    let pos = 0, neg = 0, neu = 0, high = 0, sumScore = 0;
    for (const n of news as any[]) {
      if (n.sentiment === "positive") pos++; else if (n.sentiment === "negative") neg++; else neu++;
      if (n.impact_level === "high") high++;
      sumScore += Number(n.sentiment_score ?? 0);
    }
    const avg = news.length ? sumScore / news.length : 0;
    newsSentiment = {
      marketSentiment: avg > 0.15 ? "Positive" : avg < -0.15 ? "Negative" : "Neutral",
      avgSentimentScore: Math.round(avg * 100) / 100,
      positiveCount: pos, negativeCount: neg, neutralCount: neu,
      highImpactNewsCount: high,
      latestHeadlines: news.slice(0, 8).map((n: any) => ({
        title: String(n.title).slice(0, 160), source: n.source, publishedAt: n.published_at,
        sentiment: n.sentiment, impactLevel: n.impact_level, impactScore: n.impact_score,
        relatedTickers: (n.tickers ?? []).slice(0, 5),
      })),
    };
    contextStatus.news = news.length > 30 ? "fresh" : news.length > 5 ? "partial" : "stale";
  } else {
    contextStatus.news = "unavailable";
    newsSentiment.error = newsRes.error;
  }

  // ---------- UNDERVALUE ----------
  const undervalueRes = await safe("undervalue", async () => {
    const symbolsOfInterest = new Set<string>([
      ...intent.tickers.map(t => t.endsWith(".JK") ? t : `${t}.JK`),
      ...openPositions.map(p => p.symbol),
      ...(watchlist.symbols ?? []),
    ]);
    let q = supabaseAdmin.from("ai_undervalue_scores").select("*").order("final_undervalue_score", { ascending: false });
    const { data: top } = await q.limit(10);
    let focused: any[] = [];
    if (symbolsOfInterest.size) {
      const { data: f } = await supabaseAdmin.from("ai_undervalue_scores").select("*").in("symbol", [...symbolsOfInterest]);
      focused = f ?? [];
    }
    return { top: top ?? [], focused };
  });
  const undervalue: any = undervalueRes.ok ? {
    topUndervaluedCandidates: undervalueRes.data.top.slice(0, 10).map((u: any) => ({
      symbol: u.symbol, finalUndervalueScore: u.final_undervalue_score, classification: u.classification, valueTrapRisk: u.value_trap_risk_score,
    })),
    symbols: undervalueRes.data.focused.map((u: any) => ({
      symbol: u.symbol, classification: u.classification,
      finalUndervalueScore: u.final_undervalue_score, valuationScore: u.valuation_score,
      qualityScore: u.quality_score, growthScore: u.growth_score,
      financialHealthScore: u.financial_health_score, valueTrapRiskScore: u.value_trap_risk_score,
      warnings: u.warnings,
    })),
    status: undervalueRes.data.top.length ? "available" : "insufficient_data",
  } : { status: "insufficient_data" as Status, error: undervalueRes.error };

  // ---------- ALERTS ----------
  const alertsRes = await safe("alerts", async () => {
    const { data } = await supabaseAdmin
      .from("alerts").select("symbol, rule_json, active, triggered_at, created_at")
      .eq("user_id", USER_ID).order("created_at", { ascending: false }).limit(10);
    return data ?? [];
  });
  const alerts: any = alertsRes.ok
    ? {
      activeAlertsCount: alertsRes.data.filter((a: any) => a.active).length,
      triggeredAlerts: alertsRes.data.filter((a: any) => a.triggered_at).slice(0, 10).map((a: any) => ({
        symbol: a.symbol, triggeredAt: a.triggered_at, rule: a.rule_json,
      })),
      status: alertsRes.data.length ? "connected" : "empty",
    }
    : { status: "error", error: alertsRes.error };
  contextStatus.alerts = alerts.status as Status;

  // ---------- BACKTEST ----------
  const backtestRes = await safe("backtest", async () => {
    const { data } = await supabaseAdmin
      .from("backtests").select("symbol, timeframe, strategy_version, metrics_json, regime, ran_at")
      .eq("user_id", USER_ID).order("ran_at", { ascending: false }).limit(5);
    return data ?? [];
  });
  const backtest: any = backtestRes.ok
    ? {
      status: backtestRes.data.length ? "available" : "empty",
      recentResults: backtestRes.data.map((b: any) => ({
        symbol: b.symbol, timeframe: b.timeframe, strategy: b.strategy_version, regime: b.regime, metrics: b.metrics_json, ranAt: b.ran_at,
      })),
    }
    : { status: "empty", error: backtestRes.error };
  contextStatus.backtest = backtest.status as Status;

  // ---------- JOURNAL & TRADE REVIEWS ----------
  const journalRes = await safe("journal", async () => {
    const [{ data: reviews }] = await Promise.all([
      supabaseAdmin.from("ai_trade_reviews").select("symbol, outcome, pnl_pct, lesson_label, what_went_right, what_went_wrong, created_at")
        .order("created_at", { ascending: false }).limit(5),
    ]);
    return { reviews: reviews ?? [] };
  });
  const journal: any = journalRes.ok
    ? {
      recentTradeReviews: journalRes.data.reviews.map((r: any) => ({
        symbol: r.symbol, outcome: r.outcome, pnlPct: r.pnl_pct, lesson: r.lesson_label,
        wentRight: r.what_went_right, wentWrong: r.what_went_wrong, createdAt: r.created_at,
      })),
      status: journalRes.data.reviews.length ? "available" : "empty",
    }
    : { status: "empty", error: journalRes.error };
  contextStatus.journal = journal.status as Status;

  // ---------- MARKET CONTEXT ----------
  const marketSafe = await safe("market", async () => {
    const session = getIDXMarketSession();
    const canExec = canExecutePaperTrade();
    const { data: regime } = await supabaseAdmin
      .from("market_regime_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: sectors } = await supabaseAdmin
      .from("sector_strength_snapshots").select("sector, classification, relative_strength, momentum_score")
      .order("created_at", { ascending: false }).limit(20);
    return { session, canExec, regime, sectors: sectors ?? [] };
  });
  const market: any = marketSafe.ok ? {
    idxSession: marketSafe.data.session.label,
    idxState: marketSafe.data.session.state,
    isOpen: marketSafe.data.session.isOpen,
    executionAllowed: marketSafe.data.canExec.ok,
    executionBlockedReason: marketSafe.data.canExec.ok ? null : marketSafe.data.canExec.reason,
    ihsgLevel: marketSafe.data.regime?.idx_level ?? null,
    ihsgChangePct: marketSafe.data.regime?.idx_change_pct ?? null,
    marketRegime: marketSafe.data.regime?.regime_classification ?? "unknown",
    regimeTrend: marketSafe.data.regime?.regime_trend ?? null,
    regimeVolatility: marketSafe.data.regime?.regime_volatility ?? null,
    strongestSectors: marketSafe.data.sectors.filter((s: any) => s.classification === "leader" || (s.relative_strength ?? 0) > 0.3).slice(0, 5),
    weakestSectors: marketSafe.data.sectors.filter((s: any) => s.classification === "laggard" || (s.relative_strength ?? 0) < -0.3).slice(0, 5),
  } : { error: marketSafe.error };

  // ---------- DATA QUALITY & SOURCE HEALTH ----------
  const dqRes = await safe("dq", async () => {
    const { data } = await supabaseAdmin
      .from("data_quality_snapshots").select("*").order("created_at", { ascending: false }).limit(5);
    return data ?? [];
  });
  const dataQuality: any = dqRes.ok && dqRes.data.length ? {
    overallScore: dqRes.data[0].overall_data_quality_score,
    priceFreshness: dqRes.data[0].price_quality,
    technicalFreshness: dqRes.data[0].technical_quality,
    newsFreshness: dqRes.data[0].news_quality,
    sentimentFreshness: dqRes.data[0].sentiment_quality,
    fundamentalFreshness: dqRes.data[0].fundamental_quality,
    disclosureFreshness: dqRes.data[0].disclosure_quality,
    warnings: dqRes.data[0].warnings,
  } : { status: "unavailable", error: dqRes.ok ? null : dqRes.error };

  const shRes = await safe("sourceHealth", async () => {
    const { data } = await supabaseAdmin
      .from("news_sources").select("id, name, status, enabled, last_success_at, last_failed_at, last_error, fail_count")
      .eq("enabled", true);
    return data ?? [];
  });
  const sourceHealth: any = shRes.ok ? {
    overallStatus: (() => {
      const total = shRes.data.length;
      const ok = shRes.data.filter((s: any) => s.status === "ok" || s.status === "idle" || s.status === "success").length;
      return total === 0 ? "unknown" : ok === total ? "healthy" : ok >= total * 0.6 ? "degraded" : "unhealthy";
    })(),
    sources: shRes.data.slice(0, 12).map((s: any) => ({
      name: s.name, status: s.status, lastSuccessAt: s.last_success_at, lastErrorAt: s.last_failed_at,
      message: s.last_error,
    })),
  } : { error: shRes.error };

  // ---------- AI INSIGHTS (aggregated intelligence layer) ----------
  const insightsRes = await safe("aiInsights", async () => {
    const [
      { data: regime },
      { data: sectors },
      { data: risk },
      { data: reviews },
      { data: lessons },
    ] = await Promise.all([
      supabaseAdmin.from("market_regime_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("sector_strength_snapshots").select("sector, classification, relative_strength, breadth_score, top_symbols, created_at").order("created_at", { ascending: false }).limit(40),
      supabaseAdmin.from("portfolio_risk_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("ai_trade_reviews").select("symbol, outcome, pnl, pnl_pct, lesson_label, what_went_right, what_went_wrong, created_at, exit_context").order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("ai_trade_reviews").select("lesson_label, outcome").order("created_at", { ascending: false }).limit(200),
    ]);
    // One row per sector (latest only)
    const seen = new Set<string>();
    const latestSectors: any[] = [];
    for (const s of sectors ?? []) {
      if (seen.has((s as any).sector)) continue;
      seen.add((s as any).sector);
      latestSectors.push(s);
    }
    return { regime, sectors: latestSectors, risk, reviews: reviews ?? [], lessons: lessons ?? [] };
  });

  let aiInsights: any = { status: "unavailable" as Status };
  if (insightsRes.ok) {
    const { regime, sectors, risk, reviews, lessons } = insightsRes.data;
    const lessonCounts: Record<string, { total: number; wins: number }> = {};
    for (const l of lessons) {
      const k = (l as any).lesson_label ?? "neutral";
      lessonCounts[k] ??= { total: 0, wins: 0 };
      lessonCounts[k].total += 1;
      if ((l as any).outcome === "win") lessonCounts[k].wins += 1;
    }
    aiInsights = {
      marketRegime: regime ? {
        classification: regime.regime_classification,
        trend: regime.regime_trend,
        volatility: regime.regime_volatility,
        breadth: regime.regime_breadth,
        ihsgLevel: regime.idx_level,
        ihsgChangePct: regime.idx_change_pct,
        reasoning: regime.reasoning,
      } : null,
      sectorRotation: sectors.map((s: any) => ({
        sector: s.sector,
        classification: s.classification,
        relativeStrength: s.relative_strength,
        breadthScore: s.breadth_score,
        topSymbols: s.top_symbols,
      })),
      rotatingInSectors: sectors.filter((s: any) => s.classification === "rotating_in" || s.classification === "leading").map((s: any) => s.sector),
      rotatingOutSectors: sectors.filter((s: any) => s.classification === "rotating_out" || s.classification === "lagging").map((s: any) => s.sector),
      portfolioRisk: risk ? {
        level: risk.risk_level,
        cashPct: risk.cash_pct,
        maxPositionWeight: risk.max_position_weight,
        currentDrawdown: risk.current_drawdown,
        dailyPnlPct: risk.daily_pnl_pct,
        warnings: risk.warnings,
        explanation: `Market risk (${regime?.regime_classification ?? "n/a"}) dan portfolio risk (${risk.risk_level}) adalah dua dimensi berbeda. Portfolio Anda ${risk.risk_level} karena cash ratio ${Number(risk.cash_pct).toFixed(0)}% dan posisi terbesar ${Number(risk.max_position_weight).toFixed(1)}%.`,
      } : null,
      postTradeReviews: reviews.map((r: any) => ({
        symbol: r.symbol,
        outcome: r.outcome,
        realizedPnl: Number(r.pnl ?? 0),
        pnlPct: Number(r.pnl_pct ?? 0),
        lesson: r.lesson_label,
        wentRight: r.what_went_right,
        wentWrong: r.what_went_wrong,
        closeReason: (r.exit_context as any)?.close_reason ?? null,
        createdAt: r.created_at,
      })),
      lessonsLearned: Object.entries(lessonCounts).map(([lesson, v]) => ({
        lesson, total: v.total, winRate: v.total ? Math.round((v.wins / v.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total).slice(0, 8),
      status: regime || risk || reviews.length ? "available" : "insufficient_data",
    };
  }

  // ---------- AI ALERTS (evaluated, actionable) ----------
  let aiAlerts: any = { status: "unavailable" as Status, items: [] };
  try {
    const [u, rg, rk, sec] = await Promise.all([
      supabaseAdmin.from("ai_undervalue_scores").select("symbol, value_trap_risk_score, final_undervalue_score").order("updated_at", { ascending: false }).limit(20),
      supabaseAdmin.from("market_regime_snapshots").select("regime_classification, created_at").order("created_at", { ascending: false }).limit(2),
      supabaseAdmin.from("portfolio_risk_snapshots").select("current_drawdown, max_position_weight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("sector_strength_snapshots").select("sector, classification, relative_strength, created_at").order("created_at", { ascending: false }).limit(40),
    ]);
    const items: any[] = [];
    for (const s of u.data ?? []) {
      if ((s as any).value_trap_risk_score >= 60) items.push({ type: "value_trap_warning", severity: "warning", title: `Value Trap: ${(s as any).symbol}`, action: "Hindari entry baru; perketat stop loss jika sudah punya posisi.", affectedSymbols: [(s as any).symbol] });
      if ((s as any).final_undervalue_score >= 75) items.push({ type: "undervalue_signal", severity: "info", title: `Undervalue Signal: ${(s as any).symbol}`, action: "Tambahkan ke watchlist; validasi teknikal sebelum entry.", affectedSymbols: [(s as any).symbol] });
    }
    if (rg.data && rg.data.length >= 2 && (rg.data[0] as any).regime_classification !== (rg.data[1] as any).regime_classification) {
      items.push({ type: "regime_shift", severity: "warning", title: `Regime Shift → ${(rg.data[0] as any).regime_classification}`, action: "Turunkan ukuran posisi baru sampai regime stabil." });
    }
    if (rk.data) {
      if (Number((rk.data as any).current_drawdown) <= -5) items.push({ type: "drawdown_limit", severity: "critical", title: `Drawdown ${(rk.data as any).current_drawdown}%`, action: "Kurangi exposure, jangan tambah posisi baru." });
      if (Number((rk.data as any).max_position_weight) > 25) items.push({ type: "concentration_risk", severity: "warning", title: `Concentration ${(rk.data as any).max_position_weight}%`, action: "Diversifikasi: kurangi posisi terbesar." });
    }
    const seenSec = new Set<string>();
    for (const row of sec.data ?? []) {
      const sname = (row as any).sector;
      if (seenSec.has(sname)) continue;
      seenSec.add(sname);
      if ((row as any).classification === "rotating_in" || (row as any).classification === "leading")
        items.push({ type: "sector_rotation_in", severity: "info", title: `Sector Rotating In — ${sname}`, action: "Prioritaskan kandidat dari sektor ini.", affectedSectors: [sname] });
      else if ((row as any).classification === "rotating_out" || (row as any).classification === "lagging")
        items.push({ type: "sector_rotation_out", severity: "warning", title: `Sector Rotating Out — ${sname}`, action: "Hindari entry agresif; perketat stop pada posisi existing.", affectedSectors: [sname] });
    }
    aiAlerts = { status: items.length ? "available" : "empty", items };
  } catch (e: any) {
    aiAlerts = { status: "error", error: String(e?.message ?? e), items: [] };
  }

  return {
    intent,
    contextStatus,
    portfolio,
    paperTrading,
    aiTradeAgent,
    autonomousScanner,
    watchlist,
    market,
    newsSentiment,
    undervalue,
    alerts,
    backtest,
    journal,
    dataQuality,
    sourceHealth,
    aiInsights,
    aiAlerts,
    paperTradingOnly: true,
    generatedAt: new Date().toISOString(),
  };
}
