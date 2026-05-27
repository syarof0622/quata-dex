// Server-only helper: aggregates app state into a compact JSON context for the AI Trading Analyst.
// Read-only. Per-section try/catch so a single failing query never breaks the chat.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIDXMarketSession, canExecutePaperTrade } from "@/lib/idx-market-session";
import { buildStrategyIntelligence } from "@/lib/strategy-intelligence.functions";
import { summarizeSourceHealth } from "@/lib/source-health";
import { getPortfolioAnalytics } from "@/lib/analytics.functions";

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

    // Latest BUY decision per symbol → exit plan (stop loss / take profit).
    // Patch 7: every open position must have an exit plan for AI Analyst.
    const openSymbols = positions.map((p: any) => p.symbol);
    let decisionPlans: Record<string, any> = {};
    if (openSymbols.length > 0) {
      const { data: lastBuyDec } = await supabaseAdmin
        .from("ai_agent_decisions")
        .select("symbol, entry_price, stop_loss, take_profit, risk_reward_ratio, strategy_name, market_regime, created_at, id")
        .in("symbol", openSymbols)
        .eq("action", "BUY")
        .order("created_at", { ascending: false })
        .limit(50);
      for (const d of (lastBuyDec ?? []) as any[]) {
        if (!decisionPlans[d.symbol]) decisionPlans[d.symbol] = d;
      }
    }

    openPositions = positions.map((p: any) => {
      const lastBuy = latestBuyBySymbol[p.symbol];
      const plan = decisionPlans[p.symbol] ?? null;
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
        currentStatus: "HOLDING_POSITION",
        exitPlan: plan ? {
          stopLoss: plan.stop_loss ?? null,
          takeProfit: plan.take_profit ?? null,
          riskRewardRatio: plan.risk_reward_ratio ?? null,
          strategyName: plan.strategy_name ?? null,
          marketRegime: plan.market_regime ?? null,
          plannedAt: plan.created_at ?? null,
          source: "last_ai_buy_decision",
        } : { source: "no_plan_recorded", note: "Posisi belum punya stop/TP terdokumentasi — AI Analyst harus rekomendasikan plan baru." },
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
    // Single source of truth for "currently active" agent.
    const { getActiveAIAgent } = await import("./ai-context-summary.server");
    const agent = await getActiveAIAgent();
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

    // Derive isAutoRunning + statusLabel from worker freshness, status, automation flag,
    // AND market session. Worker stale / market closed are NOT "Inactive".
    const activeStatuses = new Set(["active_market_open", "active", "running"]);
    const lwrTs = agent.last_worker_run_at ? new Date(agent.last_worker_run_at).getTime() : 0;
    const workerFreshMins = lwrTs ? (Date.now() - lwrTs) / 60000 : Infinity;
    const workerFresh = workerFreshMins <= 30;
    const workerOk = !agent.last_worker_status || agent.last_worker_status === "success" || agent.last_worker_status === "running";
    const isAutoRunning = Boolean(agent.automation_enabled && workerFresh && activeStatuses.has(agent.status) && workerOk);
    const sessionNow = getIDXMarketSession();
    const marketClosedNow = !sessionNow.isOpen;
    const everRan = lwrTs > 0 || decisions.length > 0;
    let statusLabel: string;
    if (isAutoRunning && !marketClosedNow) statusLabel = "Auto Running";
    else if (isAutoRunning && marketClosedNow) statusLabel = "Market Closed";
    else if (agent.automation_enabled && agent.last_worker_status === "error") statusLabel = "Error";
    else if (agent.automation_enabled && activeStatuses.has(agent.status) && !workerFresh && marketClosedNow && everRan) statusLabel = "Worker Idle";
    else if (agent.automation_enabled && activeStatuses.has(agent.status) && !workerFresh) statusLabel = "Worker Stale";
    else if (agent.automation_enabled === false && activeStatuses.has(agent.status)) statusLabel = "Manual Only";
    else if (agent.automation_enabled && !activeStatuses.has(agent.status) && everRan) statusLabel = "Paused";
    else if (!everRan && agent.automation_enabled === false) statusLabel = "Inactive";
    else if (!everRan) statusLabel = "Worker Not Started";
    else statusLabel = "Inactive";

    // Human-readable worker warning the AI must echo verbatim when relevant.
    let workerWarningMessage: string;
    if (isAutoRunning && marketClosedNow) {
      workerWarningMessage = "Agent tidak membuka order baru karena market closed.";
    } else if (isAutoRunning) {
      workerWarningMessage = "Worker active — autonomous decisions run automatically.";
    } else if (agent.automation_enabled && !lwrTs) {
      workerWarningMessage = "Worker has not run yet. Configure scheduler to call /api/public/cron/ai-agent every 1 minute.";
    } else if (statusLabel === "Worker Idle") {
      workerWarningMessage = `Worker idle — market closed, last run ${Math.round(workerFreshMins)} min ago. Agent akan resume saat market open.`;
    } else if (agent.automation_enabled && !workerFresh) {
      workerWarningMessage = `Worker terakhir berjalan ${Math.round(workerFreshMins)} menit lalu, sehingga status saat ini Worker Stale.`;
    } else if (agent.automation_enabled && agent.last_worker_status === "error") {
      workerWarningMessage = `Worker error — ${agent.last_worker_message ?? "unknown error"}.`;
    } else if (statusLabel === "Paused") {
      workerWarningMessage = "Agent paused — automation enabled tetapi status bukan active.";
    } else {
      workerWarningMessage = "Automation disabled — AI Agent will not act autonomously.";
    }

    // ---- Blocked reason priority resolver (Patch 3 + 4) ----
    // Priority: latest decision blockedReason → replay snapshot final reason →
    // risk guard result → fallback scanner → global data quality.
    // Also normalize legacy `limit_reached` → `max_active_positions_reached`
    // when activePositions >= max_active_positions.
    const REASON_ALIAS: Record<string, string> = {
      limit_reached: "max_active_positions_reached",
      risk_limit_reached: "max_active_positions_reached",
      exposure_cap_reached: "max_position_weight_reached",
      low_liquidity: "liquidity_too_low",
      insufficient_balance: "insufficient_cash",
      risk_pause_active: "pause_active",
      sector_exposure_limit: "max_sector_exposure_reached",
    };
    const REASON_LABEL: Record<string, string> = {
      max_active_positions_reached: "Slot posisi penuh / max active positions reached",
      max_position_weight_reached: "Bobot posisi melebihi limit",
      max_sector_exposure_reached: "Eksposur sektor melebihi limit",
      cash_buffer_required: "Cash buffer kurang",
      insufficient_cash: "Cash tidak cukup",
      confidence_below_threshold: "Confidence di bawah threshold",
      strategy_incompatible_with_regime: "Strategi tidak cocok dengan regime",
      risk_reward_invalid: "Risk/Reward tidak valid",
      lot_below_minimum: "Lot di bawah minimum",
      market_closed: "Pasar tutup",
      data_quality_stale: "Data tidak fresh",
      source_health_degraded: "Source health degraded",
      negative_disclosure_detected: "Disclosure negatif",
      news_shock_risk: "News shock risk",
      liquidity_too_low: "Likuiditas terlalu rendah",
      volatility_too_high: "Volatilitas terlalu tinggi",
      daily_loss_limit_reached: "Daily loss limit tercapai",
      drawdown_limit_reached: "Drawdown limit tercapai",
      max_losses_per_day_reached: "Loss harian limit tercapai",
      consecutive_losses_limit: "Loss beruntun limit tercapai",
      pause_active: "Risk pause aktif",
      cooldown_active: "Cooldown aktif",
      risk_guard_blocked: "Risk guard memblokir",
    };
    const activePositions = openPositions.length;
    const maxActive = Number((agent as any).max_active_positions ?? 0);
    const normalizeReason = (raw?: string | null): string | null => {
      if (!raw) return null;
      let key = REASON_ALIAS[raw] ?? raw;
      if (raw === "limit_reached" && maxActive > 0 && activePositions < maxActive) {
        // Generic limit but slots NOT full — leave as-is so it's not misleading.
        key = "risk_guard_blocked";
      }
      return key;
    };
    const latestBlocked = blocked[0] ?? null;
    const latestReplaySnap = (decisions[0] as any)?.decision_replay_snapshot ?? null;
    const replayReason = latestReplaySnap?.finalDecision?.blockedReason
      ?? latestReplaySnap?.finalDecision?.reason
      ?? latestReplaySnap?.riskGuard?.reason
      ?? null;
    const candidateScannerReason = (() => {
      const cand = (agentRes.ok ? agentRes.data.candidates : [])?.[0] as any;
      return cand?.blocked_reason ?? cand?.rejection_reason ?? null;
    })();
    const rawPrimary =
      (latestBlocked as any)?.calibration_reason
      ?? (latestBlocked as any)?.selection_reason
      ?? replayReason
      ?? agent.last_blocked_reason
      ?? candidateScannerReason
      ?? null;
    const canonicalPrimary = normalizeReason(rawPrimary);
    const primarySource =
      latestBlocked ? "latest_decision"
      : replayReason ? "decision_replay"
      : agent.last_blocked_reason ? "agent_state"
      : candidateScannerReason ? "scanner"
      : null;
    const latestBlockedReasonPriority = canonicalPrimary ? {
      raw: rawPrimary,
      canonical: canonicalPrimary,
      friendly: REASON_LABEL[canonicalPrimary] ?? canonicalPrimary.replace(/_/g, " "),
      source: primarySource,
      symbol: (latestBlocked as any)?.symbol ?? null,
      at: (latestBlocked as any)?.created_at ?? null,
      activePositions,
      maxActivePositions: maxActive || null,
      slotsFull: maxActive > 0 && activePositions >= maxActive,
    } : null;

    aiTradeAgent = {
      status: agent.status,
      statusLabel,
      isAutoRunning,
      marketClosed: marketClosedNow,
      workerWarningMessage,
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
      latestBlockedReasonPriority,
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
      recentBlockedDecisions: blocked.slice(0, 10).map((d: any) => {
        const raw = d.calibration_reason || d.selection_reason || agent.last_blocked_reason;
        const canonical = normalizeReason(raw);
        return {
          time: d.created_at,
          symbol: d.symbol,
          blockedReason: raw,
          canonicalReason: canonical,
          friendlyReason: canonical ? (REASON_LABEL[canonical] ?? canonical.replace(/_/g, " ")) : null,
        };
      }),
      recentWatchSnapshots: watch.slice(0, 5).map((d: any) => ({ time: d.created_at, symbol: d.symbol })),
      recentResearchSnapshots: research.slice(0, 5).map((d: any) => ({ time: d.created_at, symbol: d.symbol })),
      whyNoBuySummary: executedBuys.length === 0
        ? (latestBlockedReasonPriority?.friendly
            ?? agent.last_blocked_reason
            ?? "No executed paper buys recently. Check market session, candidate scores, risk limits, and data freshness.")
        : null,
      performanceSummary: perf ? (() => {
        const tt = Number(perf.total_trades ?? 0);
        return {
          totalTrades: tt,
          winRate: tt > 0 ? perf.win_rate : null,
          profitFactor: tt > 0 ? perf.profit_factor : null,
          totalReturn: perf.total_return,
          maxDrawdown: perf.max_drawdown,
          note: tt === 0 ? "No closed AI trades yet — win rate / profit factor must be rendered as N/A." : null,
        };
      })() : null,
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
      .select("title, source, sentiment, sentiment_score, impact_level, impact_score, published_at, tickers, ticker_relevance_score, relevance_class, impact_category, event_cluster_id, source_reliability_weight, is_noise, primary_ticker")
      .gte("published_at", since).eq("is_duplicate", false)
      .order("published_at", { ascending: false }).limit(80);
    return news ?? [];
  });
  let newsSentiment: any = { status: "unavailable" as Status };
  if (newsRes.ok) {
    const rawNews = newsRes.data as any[];
    // Filter noise out of sentiment math; weight by source reliability; dedupe by event cluster.
    const signalNews = rawNews.filter((n) => !n.is_noise && n.relevance_class !== "irrelevant_noise");
    const clusters = new Map<string, { score: number; weight: number; sentiment: string; sample: any }>();
    let pos = 0, neg = 0, neu = 0, high = 0;
    for (const n of signalNews) {
      if (n.sentiment === "positive") pos++; else if (n.sentiment === "negative") neg++; else neu++;
      if (n.impact_level === "high") high++;
      const w = Number(n.source_reliability_weight ?? 0.65);
      const key = n.event_cluster_id ?? `${n.source}-${n.title}`;
      const cur = clusters.get(key) ?? { score: 0, weight: 0, sentiment: n.sentiment, sample: n };
      cur.score += Number(n.sentiment_score ?? 0) * w;
      cur.weight += w;
      clusters.set(key, cur);
    }
    let sumW = 0, wtot = 0;
    for (const c of clusters.values()) { sumW += c.score; wtot += c.weight; }
    const avg = wtot > 0 ? sumW / wtot : 0;
    const directTickerCount = signalNews.filter((n) => n.relevance_class === "direct_ticker_news").length;
    const sectorCount = signalNews.filter((n) => n.relevance_class === "sector_news").length;
    const macroCount = signalNews.filter((n) => n.relevance_class === "macro_news").length;
    const noiseCount = rawNews.length - signalNews.length;
    newsSentiment = {
      marketSentiment: avg > 0.15 ? "Positive" : avg < -0.15 ? "Negative" : "Neutral",
      avgSentimentScore: Math.round(avg * 100) / 100,
      positiveCount: pos, negativeCount: neg, neutralCount: neu,
      highImpactNewsCount: high,
      uniqueEventClusters: clusters.size,
      classBreakdown: { directTicker: directTickerCount, sector: sectorCount, macro: macroCount, noise: noiseCount },
      latestHeadlines: signalNews.slice(0, 10).map((n: any) => ({
        title: String(n.title).slice(0, 160), source: n.source, publishedAt: n.published_at,
        sentiment: n.sentiment, impactLevel: n.impact_level, impactScore: n.impact_score,
        relevanceClass: n.relevance_class, impactCategory: n.impact_category,
        sourceReliability: Number(n.source_reliability_weight ?? 0.65),
        primaryTicker: n.primary_ticker ?? null,
        eventClusterId: n.event_cluster_id ?? null,
        relatedTickers: (n.tickers ?? []).slice(0, 5),
      })),
      noiseFilteredOut: noiseCount,
    };
    contextStatus.news = signalNews.length > 20 ? "fresh" : signalNews.length > 5 ? "partial" : "stale";
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

  // ---------- OFFICIAL DISCLOSURES (IDX/BEI) ----------
  const disclosureRes = await safe("officialDisclosures", async () => {
    const symbolsOfInterest = Array.from(new Set<string>([
      ...intent.tickers.flatMap(t => [t, t.replace(/\.JK$/i, "")]),
      ...openPositions.flatMap(p => [p.symbol, p.symbol.replace(/\.JK$/i, "")]),
      ...(watchlist.symbols ?? []).flatMap((s: string) => [s, s.replace(/\.JK$/i, "")]),
    ]));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("official_disclosures")
      .select("symbol, source, disclosure_type, title, url, published_at, impact_level, sentiment, risk_flag, extracted_summary")
      .gte("published_at", sevenDaysAgo)
      .order("published_at", { ascending: false })
      .limit(30);
    let focused: any[] = [];
    if (symbolsOfInterest.length) {
      const { data: f } = await supabaseAdmin
        .from("official_disclosures")
        .select("symbol, source, disclosure_type, title, url, published_at, impact_level, sentiment, risk_flag, extracted_summary")
        .in("symbol", symbolsOfInterest)
        .order("published_at", { ascending: false })
        .limit(20);
      focused = f ?? [];
    }
    return { recent: recent ?? [], focused };
  });
  const officialDisclosures: any = disclosureRes.ok ? {
    status: (disclosureRes.data.recent.length || disclosureRes.data.focused.length) ? "available" : "empty",
    recent: disclosureRes.data.recent.slice(0, 15),
    focusedSymbols: disclosureRes.data.focused,
    highImpactNegativeCount: disclosureRes.data.recent.filter((d: any) => d.impact_level === "high" && d.sentiment === "negative").length,
    suspensionOrUmaCount: disclosureRes.data.recent.filter((d: any) => d.disclosure_type === "suspension" || d.disclosure_type === "uma").length,
  } : { status: "error" as Status, error: disclosureRes.error };


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
  // Patch 2: distinguish Data Freshness (Fresh/Partial/Stale label shown in
  // header) from Execution Quality Score (numeric 0–100 used as the AI Agent
  // execution gate). The two are independent — fresh data can still fail the
  // execution score threshold.
  const dqRes = await safe("dq", async () => {
    const { data } = await supabaseAdmin
      .from("data_quality_snapshots").select("*").order("created_at", { ascending: false }).limit(5);
    return data ?? [];
  });
  const dataQuality: any = dqRes.ok && dqRes.data.length ? (() => {
    const top = dqRes.data[0];
    const score = Number(top.overall_data_quality_score ?? 0);
    const freshLevels = new Set(["fresh", "available"]);
    const partialLevels = new Set(["moderate", "partial"]);
    const fields = [top.price_quality, top.technical_quality, top.news_quality, top.sentiment_quality];
    const freshCount = fields.filter((f: string) => freshLevels.has(f)).length;
    const partialCount = fields.filter((f: string) => partialLevels.has(f)).length;
    let dataFreshnessStatus: "Fresh" | "Partial" | "Stale" | "Unavailable" = "Unavailable";
    if (freshCount >= 3) dataFreshnessStatus = "Fresh";
    else if (freshCount + partialCount >= 2) dataFreshnessStatus = "Partial";
    else if (freshCount + partialCount >= 1) dataFreshnessStatus = "Stale";
    const MIN_EXECUTION_SCORE = 70;
    return {
      overallScore: top.overall_data_quality_score,
      dataFreshnessStatus,
      executionQualityScore: score,
      minExecutionScore: MIN_EXECUTION_SCORE,
      executionEligible: score >= MIN_EXECUTION_SCORE,
      priceFreshness: top.price_quality,
      technicalFreshness: top.technical_quality,
      newsFreshness: top.news_quality,
      sentimentFreshness: top.sentiment_quality,
      fundamentalFreshness: top.fundamental_quality,
      disclosureFreshness: top.disclosure_quality,
      warnings: top.warnings,
      note: "dataFreshnessStatus describes data recency; executionQualityScore (0-100) is the AI execution gate. Both can disagree — fresh data may still score below minExecutionScore.",
    };
  })() : { status: "unavailable", dataFreshnessStatus: "Unavailable", executionQualityScore: null, error: dqRes.ok ? null : dqRes.error };

  const shRes = await safe("sourceHealth", async () => {
    const { data } = await supabaseAdmin
      .from("news_sources").select("id, name, status, enabled, last_success_at, last_failed_at, last_error, fail_count");
    return data ?? [];
  });
  const sourceHealth: any = shRes.ok
    ? (() => {
        const sum = summarizeSourceHealth(shRes.data as any);
        return {
          overallStatus: sum.overallStatus,
          activeCount: sum.activeCount,
          fallbackCount: sum.fallbackCount,
          quotaProtectedCount: sum.quotaProtectedCount,
          degradedCount: sum.degradedCount,
          failedCount: sum.failedCount,
          disabledCount: sum.disabledCount,
          lastUpdated: sum.lastUpdated,
          sources: sum.sources.slice(0, 12),
        };
      })()
    : { overallStatus: "unknown", sources: [], error: shRes.error };

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

  // ---------- STRATEGY INTELLIGENCE (Update 9) ----------
  let strategyIntelligence: any = { status: "unavailable" as Status };
  try {
    const si = await buildStrategyIntelligence();
    strategyIntelligence = {
      status: "available" as Status,
      marketRegime: si.marketRegime,
      // Trim each score to the fields the AI Analyst actually uses, to keep
      // the JSON payload small.
      bestForThisRegime: si.bestForThisRegime.map(s => ({
        strategy: s.strategyName, score: s.strategyScore, classification: s.classification,
        sampleSize: s.sampleSize, sampleQuality: s.sampleQuality,
        backtestWinRate: s.backtestWinRate, forwardWinRate: s.forwardWinRate,
        avgReturn: s.avgReturn, profitFactor: s.profitFactor, maxDrawdown: s.maxDrawdown,
      })),
      avoidForThisRegime: si.avoidForThisRegime.map(s => ({
        strategy: s.strategyName, score: s.strategyScore, classification: s.classification,
        sampleSize: s.sampleSize, sampleQuality: s.sampleQuality,
        warnings: s.warnings,
      })),
      proven: si.proven.map(s => s.strategyName),
      promising: si.promising.map(s => s.strategyName),
      insufficient: si.insufficient.map(s => s.strategyName),
      generatedAt: si.generatedAt,
    };
  } catch (e: any) {
    strategyIntelligence = { status: "error", error: String(e?.message ?? e) };
  }

  // ---------- PORTFOLIO ATTRIBUTION (best-effort; reuses analytics serverFn) ----------
  let portfolioAttribution: any = { status: "empty" as Status };
  try {
    const a: any = await getPortfolioAnalytics();
    if (a?.attribution) {
      portfolioAttribution = {
        status: "connected" as Status,
        baselineForContribution: a.attribution.baselineForContribution,
        topContributor: a.attribution.topContributor,
        worstContributor: a.attribution.worstContributor,
        betaCoverage: a.attribution.betaCoverage,
        positions: (a.attribution.positions ?? []).map((p: any) => ({
          symbol: p.symbol,
          sector: p.sector,
          weight: Number(p.weight?.toFixed?.(2) ?? p.weight),
          unrealizedPnl: p.unrealizedPnl,
          contributionToReturn: Number(p.contributionToReturn?.toFixed?.(2) ?? p.contributionToReturn),
          contributionToRisk: Number(p.contributionToRisk?.toFixed?.(2) ?? p.contributionToRisk),
          beta: p.beta,
          betaSource: p.betaSource,
          volatility: p.volatility,
        })),
        sectors: a.attribution.sectors,
        cashDrag: a.cashDrag,
        scenarios: a.scenarios,
      };
    }
  } catch (e: any) {
    portfolioAttribution = { status: "error" as Status, error: String(e?.message ?? e).slice(0, 200) };
  }

  return {
    intent,
    contextStatus,
    portfolio,
    paperTrading,
    portfolioAttribution,
    aiTradeAgent,
    autonomousScanner,
    watchlist,
    market,
    newsSentiment,
    undervalue,
    officialDisclosures,
    alerts,
    backtest,
    journal,
    dataQuality,
    sourceHealth,
    aiInsights,
    aiAlerts,
    strategyIntelligence,
    paperTradingOnly: true,
    generatedAt: new Date().toISOString(),
  };
}
