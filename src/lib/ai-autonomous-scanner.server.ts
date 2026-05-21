// Autonomous Universe Scanner for AI Trade Agent.
// Server-only: imports supabaseAdmin. Naming convention `.server.ts` so the
// bundler blocks any accidental client import.
//
// Responsibility: given an agent + universe mode, build a candidate list,
// score each candidate across 8 dimensions, filter and rank them, persist
// scan + per-candidate rows, and return the top-N symbols the agent should
// evaluate this tick. Heavy market analysis (entry/SL/TP/order sizing) stays
// in `evaluateSymbol`; the scanner only decides WHICH symbols to look at.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuote } from "./market.functions";
import { getTradeSetup } from "./signals.functions";
import { IDX_LQ45, US_TOP } from "./symbols";
import { isIDXSymbol } from "./lot-sizing";
import { getIDXMarketSession } from "./idx-market-session";

export type UniverseKey =
  | "idx_liquid" | "watchlist_plus" | "bluechip" | "custom_universe" | "all_supported"
  | "undervalued_candidates" | "quality_undervalued" | "dividend_undervalued"
  | "sector_discount" | "hybrid_trading_and_value";

export type RiskMode = "conservative" | "balanced" | "progressive" | "expert_research";

export type CandidateClassification =
  | "trade_candidate" | "watch_candidate" | "research_candidate"
  | "rejected" | "premarket_watch" | "risk_blocked" | "data_blocked";

export type ExecutionEligibility =
  | "eligible" | "blocked_pre_open" | "blocked_market_closed"
  | "blocked_risk" | "blocked_data" | "blocked_low_score";

export type ScanCandidate = {
  symbol: string;
  rank: number | null;
  autonomousScore: number;
  dataQualityScore: number;
  liquidityScore: number;
  technicalScore: number;
  sentimentScore: number;
  disclosureScore: number;
  marketContextScore: number;
  riskScore: number;
  tradeSetupScore: number;
  recommendation: "candidate_buy" | "watch" | "skip";
  reason: string;
  warnings: string[];
  passedFilters: boolean;
  rejectionReason: string | null;
  // New classification fields (Progressive / Expert Research mode)
  classification: CandidateClassification;
  executionEligibility: ExecutionEligibility;
  blockedReason: string | null;
  researchTradeAllowed: boolean;
  hypotheticalTrackingEnabled: boolean;
  scanPrice: number | null;
  riskMode: RiskMode;
};

export type ScanSummary = {
  trade: number; watch: number; research: number;
  rejected: number; blocked: number; total: number;
  marketSession: "open" | "pre_open" | "closed" | "break";
};

export type ScanResult = {
  scanId: string;
  agentId: string;
  universe: UniverseKey;
  scannedCount: number;
  validCount: number;
  selected: string[];
  topCandidates: ScanCandidate[];
  rejected: ScanCandidate[];
  reasoning: string;
  riskMode: RiskMode;
  summary: ScanSummary;
};

function thresholdsForMode(mode: RiskMode) {
  switch (mode) {
    case "conservative":     return { trade: 70, watch: 65, research: 60 };
    case "progressive":      return { trade: 65, watch: 55, research: 50 };
    case "expert_research":  return { trade: 60, watch: 52, research: 48 };
    case "balanced":
    default:                 return { trade: 70, watch: 60, research: 50 };
  }
}


const BLUECHIP_PREFIXES = new Set([
  "BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "UNVR", "ICBP", "INDF",
  "KLBF", "SMGR", "INTP", "ADRO", "PTBA", "GOTO",
]);

async function buildUniverse(
  agentId: string,
  mode: UniverseKey,
  fallbackSymbols: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const push = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (s) seen.add(s);
  };

  if (mode === "bluechip") {
    for (const s of IDX_LQ45) if (BLUECHIP_PREFIXES.has(s.replace(/\.JK$/, ""))) push(s);
  } else if (mode === "idx_liquid") {
    for (const s of IDX_LQ45) push(s);
  } else if (mode === "all_supported") {
    for (const s of IDX_LQ45) push(s);
    for (const s of US_TOP.slice(0, 25)) push(s);
  } else if (mode === "watchlist_plus") {
    for (const s of IDX_LQ45.slice(0, 20)) push(s);
    const { data: wl } = await supabaseAdmin
      .from("watchlist").select("symbol").limit(40);
    for (const w of wl ?? []) push((w as any).symbol);
  } else if (mode === "custom_universe") {
    for (const s of fallbackSymbols) push(s);
    if (seen.size === 0) for (const s of IDX_LQ45.slice(0, 15)) push(s);
  } else if (
    mode === "undervalued_candidates" ||
    mode === "quality_undervalued" ||
    mode === "dividend_undervalued" ||
    mode === "sector_discount" ||
    mode === "hybrid_trading_and_value"
  ) {
    // Pull from latest undervalue scores filtered per mode; fall back to LQ45.
    const { data: rows } = await supabaseAdmin
      .from("ai_undervalue_scores")
      .select("symbol, classification, final_undervalue_score, quality_score, dividend_score, sector_relative_score, technical_timing_score, value_trap_risk_score, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    const seenSym = new Set<string>();
    const latest: any[] = [];
    for (const r of rows ?? []) {
      const s = (r as any).symbol;
      if (seenSym.has(s)) continue;
      seenSym.add(s);
      latest.push(r);
    }
    const pred = (r: any) => {
      if (r.value_trap_risk_score >= 60 || r.classification === "insufficient_data") return false;
      if (mode === "undervalued_candidates")
        return r.classification === "undervalued" || r.classification === "strong_undervalued";
      if (mode === "quality_undervalued")
        return r.final_undervalue_score >= 65 && r.quality_score >= 65;
      if (mode === "dividend_undervalued")
        return r.dividend_score >= 65 && r.final_undervalue_score >= 55;
      if (mode === "sector_discount") return r.sector_relative_score >= 70;
      if (mode === "hybrid_trading_and_value")
        return r.final_undervalue_score >= 55 && r.technical_timing_score >= 60;
      return false;
    };
    for (const r of latest.filter(pred).slice(0, 25)) push((r as any).symbol);
    // Fallback: if no scored data yet, seed with LQ45 so scanner still has work
    // (the agent will populate scores over time).
    if (seen.size === 0) for (const s of IDX_LQ45.slice(0, 15)) push(s);
  }

  // Always merge trending tickers from last-24h news so AI can react to news flow.
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: news } = await supabaseAdmin
      .from("news_articles")
      .select("tickers, impact_level")
      .gte("published_at", since)
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(80);
    for (const n of news ?? []) {
      for (const t of ((n as any).tickers ?? []) as string[]) {
        const sym = t.includes(".") ? t : `${t}.JK`;
        push(sym);
      }
    }
  } catch { /* tolerate */ }

  // Hard cap to keep scan fast under cron budget.
  return Array.from(seen).slice(0, 30);
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

async function scoreSymbol(symbol: string): Promise<ScanCandidate & { _priceAtScan: number | null }> {
  const warnings: string[] = [];
  let dataQuality = 0, liquidity = 0, technical = 50, sentiment = 50;
  let disclosure = 50, marketContext = 50, risk = 50, tradeSetup = 50;
  let priceOk = false, techOk = false, volume = 0;
  let priceAtScan: number | null = null;

  // 1. Price + liquidity (single quote per symbol — keeps scanner cheap).
  try {
    const q: any = await getQuote({ data: { symbol } });
    if (q?.price) {
      priceOk = true;
      priceAtScan = Number(q.price);
      const session = getIDXMarketSession();
      const fresh = session.isOpen && isIDXSymbol(symbol) ? 5 : 600;
      dataQuality = fresh < 30 ? 95 : fresh < 300 ? 80 : 60;
      volume = Number(q.volume ?? 0);
      if (volume > 5_000_000) liquidity = 95;
      else if (volume > 1_000_000) liquidity = 80;
      else if (volume > 250_000) liquidity = 65;
      else if (volume > 50_000) liquidity = 50;
      else { liquidity = 25; warnings.push("Volume rendah"); }
      const ch = Number(q.changePercent ?? 0);
      // Risk: prefer moderate volatility; penalize extreme moves.
      const absCh = Math.abs(ch);
      risk = absCh > 8 ? 30 : absCh > 4 ? 55 : 80;
      if (absCh > 8) warnings.push("Pergerakan harga ekstrim");
    } else {
      warnings.push("Harga tidak tersedia");
    }
  } catch (e: any) {
    warnings.push(`Quote error: ${e?.message ?? "fetch failed"}`);
  }

  // 2. Technical from cached/live setup.
  try {
    const setup: any = await getTradeSetup({ data: { symbol, timeframe: "1d" } });
    const score = Number(setup?.signal?.score ?? 0); // -100..100
    const label: string = setup?.signal?.label ?? "HOLD";
    techOk = setup?.signal != null;
    // Map -100..100 to 0..100 (bullish bias rewarded).
    technical = clamp(50 + score * 0.5);
    if (setup?.setup?.stopDistancePct != null) {
      const sd = Number(setup.setup.stopDistancePct);
      // 1–4% stop is healthy; tighter = whippy; wider = bad RR.
      const setupScore = sd > 0 && sd < 0.05 ? 80 : sd >= 0.05 && sd < 0.1 ? 65 : 45;
      tradeSetup = label === "BUY" ? Math.min(95, setupScore + 10)
                  : label === "SELL" ? 35 : setupScore;
    } else {
      tradeSetup = label === "BUY" ? 70 : label === "SELL" ? 35 : 50;
    }
  } catch { /* technical stays default */ }

  // 3. Sentiment (cached aggregate).
  try {
    const { data: s } = await supabaseAdmin
      .from("ticker_sentiment_summary").select("*").eq("symbol", symbol).maybeSingle();
    if (s) {
      const avg = Number((s as any).average_sentiment_score ?? 0); // -1..1
      sentiment = clamp(50 + avg * 50);
      const hi = Number((s as any).high_impact_news_count ?? 0);
      if (hi > 3) warnings.push("Banyak berita high-impact");
    }
  } catch { /* default */ }

  // 4. Disclosure scan from last 24h news_articles.
  try {
    const base = symbol.replace(/\.JK$/i, "");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: arts } = await supabaseAdmin
      .from("news_articles")
      .select("sentiment, impact_level, category, source, title")
      .or(`tickers.cs.{${base}},tickers.cs.{${symbol}}`)
      .eq("is_duplicate", false)
      .gte("published_at", since)
      .limit(20);
    const list = arts ?? [];
    const isDisc = (a: any) =>
      /idx|bursa|keterbukaan|disclosure|rups|dividen|buyback|right.?issue|suspen|stock.?split|akuisisi|merger|ipo|uma/
        .test(`${a.source ?? ""} ${a.category ?? ""} ${a.title ?? ""}`.toLowerCase());
    const disc = list.find(isDisc);
    if (disc) {
      const sent = (disc as any).sentiment;
      const high = (disc as any).impact_level === "high";
      disclosure = sent === "positive" ? (high ? 90 : 75)
                 : sent === "negative" ? (high ? 20 : 40) : 60;
      if (sent === "negative" && high) warnings.push("Disclosure negatif high-impact");
      const titleLower = String((disc as any).title ?? "").toLowerCase();
      if (/suspen|uma/.test(titleLower)) {
        warnings.push("Saham terkait suspensi/UMA");
        risk = Math.min(risk, 20);
      }
    } else {
      disclosure = 55;
    }
  } catch { /* default */ }

  // 5. Market context: IHSG bias proxy from any recent index quote we can read.
  try {
    const idxQuote: any = await getQuote({ data: { symbol: "^JKSE" } });
    const ch = Number(idxQuote?.changePercent ?? 0);
    marketContext = clamp(50 + ch * 8);
  } catch { /* default */ }

  // Composite score: technical/setup heaviest, then data/liquidity gates.
  const composite =
    dataQuality * 0.15 +
    liquidity   * 0.15 +
    technical   * 0.20 +
    sentiment   * 0.10 +
    disclosure  * 0.10 +
    marketContext * 0.05 +
    risk        * 0.10 +
    tradeSetup  * 0.15;

  const autonomousScore = +clamp(composite).toFixed(2);

  let recommendation: ScanCandidate["recommendation"] = "skip";
  if (autonomousScore >= 70 && tradeSetup >= 60 && technical >= 55) recommendation = "candidate_buy";
  else if (autonomousScore >= 55) recommendation = "watch";

  if (!priceOk) warnings.push("Data harga tidak siap");
  if (!techOk) warnings.push("Technical signal belum tersedia");

  const reason = !priceOk
    ? "Harga tidak tersedia untuk scoring."
    : `Tech ${technical.toFixed(0)}, Setup ${tradeSetup.toFixed(0)}, Sentimen ${sentiment.toFixed(0)}, Liquidity ${liquidity.toFixed(0)}, Risk ${risk.toFixed(0)}.`;

  return {
    symbol, rank: null, autonomousScore,
    dataQualityScore: +dataQuality.toFixed(2),
    liquidityScore: +liquidity.toFixed(2),
    technicalScore: +technical.toFixed(2),
    sentimentScore: +sentiment.toFixed(2),
    disclosureScore: +disclosure.toFixed(2),
    marketContextScore: +marketContext.toFixed(2),
    riskScore: +risk.toFixed(2),
    tradeSetupScore: +tradeSetup.toFixed(2),
    recommendation, reason, warnings,
    passedFilters: false, rejectionReason: null,
    // Defaults filled by classifyCandidate during runAutonomousScan.
    classification: "rejected",
    executionEligibility: "blocked_low_score",
    blockedReason: null,
    researchTradeAllowed: false,
    hypotheticalTrackingEnabled: false,
    scanPrice: priceAtScan,
    riskMode: "balanced",
    _priceAtScan: priceAtScan,
  };
}

/** Assign classification + execution eligibility based on score thresholds,
 *  data quality, liquidity, risk, and market session. Watch & research
 *  candidates are NOT rejected — they are stored for monitoring. */
function classifyCandidate(
  c: ScanCandidate,
  agent: {
    autonomous_risk_mode?: string;
    min_data_quality_score?: number;
    min_liquidity_score?: number;
    allow_watch_candidates?: boolean;
    allow_research_candidates?: boolean;
    allow_small_lot_exploration?: boolean;
  },
  session: ReturnType<typeof getIDXMarketSession>,
  isIDX: boolean,
): ScanCandidate {
  const mode = (agent.autonomous_risk_mode ?? "balanced") as RiskMode;
  const th = thresholdsForMode(mode);

  // Hard blocks first (data / risk).
  const isRiskBlocked = c.warnings.some(w => /suspen|UMA/i.test(w));
  const isDataBlocked = !c.scanPrice
    || c.dataQualityScore < Number(agent.min_data_quality_score ?? 50);
  const liquidityBad = c.liquidityScore < Number(agent.min_liquidity_score ?? 40);

  let classification: CandidateClassification;
  let executionEligibility: ExecutionEligibility = "eligible";
  let blockedReason: string | null = null;

  if (isRiskBlocked) {
    classification = "risk_blocked";
    executionEligibility = "blocked_risk";
    blockedReason = "Suspensi / UMA / disclosure negatif high-impact.";
  } else if (isDataBlocked) {
    classification = "data_blocked";
    executionEligibility = "blocked_data";
    blockedReason = `Data quality ${c.dataQualityScore.toFixed(0)} < min ${agent.min_data_quality_score ?? 50}.`;
  } else if (c.autonomousScore < th.research) {
    classification = "rejected";
    executionEligibility = "blocked_low_score";
    blockedReason = `Score ${c.autonomousScore.toFixed(0)} di bawah research threshold (${th.research}).`;
  } else if (c.autonomousScore < th.watch) {
    classification = "research_candidate";
    executionEligibility = "blocked_low_score";
  } else if (c.autonomousScore < th.trade) {
    classification = "watch_candidate";
    executionEligibility = "blocked_low_score";
  } else if (liquidityBad) {
    classification = "watch_candidate";
    executionEligibility = "blocked_risk";
    blockedReason = `Liquidity ${c.liquidityScore.toFixed(0)} di bawah minimum.`;
  } else {
    classification = "trade_candidate";
  }

  // Market session gating only affects IDX trade candidates.
  if (classification === "trade_candidate" && isIDX) {
    if (session.state === "pre_open") {
      executionEligibility = "blocked_pre_open";
      blockedReason = "Market pre-open — pre-market watchlist saja.";
      classification = "premarket_watch";
    } else if (!session.isOpen) {
      executionEligibility = "blocked_market_closed";
      blockedReason = `Market ${session.label.toLowerCase()} — execution blocked.`;
      classification = "premarket_watch";
    }
  }

  // Honor agent toggles: disabled classifications collapse to rejected (for
  // visibility) but with explicit reason — they still appear in the table.
  if (classification === "watch_candidate" && agent.allow_watch_candidates === false) {
    classification = "rejected";
    blockedReason = "Watch candidates disabled untuk agent ini.";
  }
  if (classification === "research_candidate" && agent.allow_research_candidates === false) {
    classification = "rejected";
    blockedReason = "Research candidates disabled untuk agent ini.";
  }

  // Research/exploration trade allowance — Progressive/Expert only; even then
  // execution still requires market open + eligible.
  const researchTradeAllowed = !!agent.allow_small_lot_exploration
    && (mode === "progressive" || mode === "expert_research")
    && (classification === "trade_candidate")
    && executionEligibility === "eligible";

  // Track outcomes for everything except hard data blocks (we have no price).
  const hypotheticalTrackingEnabled = classification !== "data_blocked"
    && classification !== "rejected"
    && c.scanPrice != null;

  const passedFilters = classification === "trade_candidate"
    && executionEligibility === "eligible";

  return {
    ...c,
    classification,
    executionEligibility,
    blockedReason,
    researchTradeAllowed,
    hypotheticalTrackingEnabled,
    riskMode: mode,
    passedFilters,
    rejectionReason: blockedReason,
  };
}

export async function runAutonomousScan(agent: any): Promise<ScanResult> {
  const mode = (agent.autonomous_universe ?? "idx_liquid") as UniverseKey;
  const riskMode = (agent.autonomous_risk_mode ?? "balanced") as RiskMode;
  const session = getIDXMarketSession();
  const universe = await buildUniverse(
    agent.id, mode, (agent.selected_symbols ?? []) as string[],
  );

  // Score in parallel but capped concurrency via Promise.all on a sliced batch.
  const candidates: ScanCandidate[] = [];
  const batchSize = 5;
  for (let i = 0; i < universe.length; i += batchSize) {
    const batch = universe.slice(i, i + batchSize);
    const scored = await Promise.all(batch.map(sym => scoreSymbol(sym).catch(() => null)));
    for (const c of scored) if (c) candidates.push(c);
  }

  const classified = candidates
    .map(c => classifyCandidate(c, agent, session, isIDXSymbol(c.symbol)))
    .sort((a, b) => b.autonomousScore - a.autonomousScore);
  classified.forEach((c, i) => { c.rank = i + 1; });

  const passed = classified.filter(c => c.passedFilters);
  const watch = classified.filter(c => c.classification === "watch_candidate" || c.classification === "premarket_watch");
  const research = classified.filter(c => c.classification === "research_candidate");
  const rejected = classified.filter(c => c.classification === "rejected");
  const blocked = classified.filter(c => c.classification === "risk_blocked" || c.classification === "data_blocked");

  const topN = Math.max(1, Math.min(10, Number(agent.max_autonomous_symbols ?? 5)));
  const selected = passed.slice(0, topN).map(c => c.symbol);

  const summary: ScanSummary = {
    trade: passed.length,
    watch: watch.length,
    research: research.length,
    rejected: rejected.length,
    blocked: blocked.length,
    total: classified.length,
    marketSession: session.state === "pre_open" ? "pre_open"
      : session.isOpen ? "open"
      : session.isBreak ? "break" : "closed",
  };

  const reasoning = selected.length > 0
    ? `Scan ${universe.length} symbol [${riskMode}]; ${passed.length} trade-ready (top ${selected.length}: ${selected.join(", ")}), ${watch.length} watch, ${research.length} research.`
    : summary.marketSession !== "open"
    ? `Scan ${universe.length} symbol [${riskMode}]; market ${summary.marketSession}. ${watch.length} pre-market watch, ${research.length} research candidate.`
    : `Scan ${universe.length} symbol [${riskMode}]; tidak ada trade candidate. ${watch.length} watch, ${research.length} research untuk dipantau.`;

  // Persist scan + candidate rows.
  const { data: scanRow, error: scanErr } = await supabaseAdmin
    .from("ai_agent_scans").insert({
      agent_id: agent.id,
      selection_mode: "autonomous",
      universe: mode,
      symbols_scanned_count: universe.length,
      valid_candidates_count: passed.length,
      selected_symbols: selected as any,
      top_candidates: passed.slice(0, 10) as any,
      rejected_candidates: rejected.slice(0, 20) as any,
      scan_status: "completed",
      reasoning,
    }).select("*").single();
  if (scanErr) throw new Error(scanErr.message);

  const scanId = (scanRow as any).id as string;

  if (classified.length > 0) {
    await supabaseAdmin.from("ai_agent_scan_candidates").insert(
      classified.slice(0, 50).map(c => ({
        scan_id: scanId, agent_id: agent.id, symbol: c.symbol, rank: c.rank,
        autonomous_score: c.autonomousScore,
        data_quality_score: c.dataQualityScore,
        liquidity_score: c.liquidityScore,
        technical_score: c.technicalScore,
        sentiment_score: c.sentimentScore,
        disclosure_score: c.disclosureScore,
        market_context_score: c.marketContextScore,
        risk_score: c.riskScore,
        trade_setup_score: c.tradeSetupScore,
        recommendation: c.recommendation,
        reason: c.reason,
        warnings: c.warnings as any,
        passed_filters: c.passedFilters,
        rejection_reason: c.rejectionReason,
        candidate_classification: c.classification,
        execution_eligibility: c.executionEligibility,
        blocked_reason: c.blockedReason,
        research_trade_allowed: c.researchTradeAllowed,
        hypothetical_tracking_enabled: c.hypotheticalTrackingEnabled,
        scan_price: c.scanPrice,
        risk_mode: c.riskMode,
      })),
    );
  }

  await supabaseAdmin.from("ai_trade_agents")
    .update({ last_autonomous_scan_at: new Date().toISOString() })
    .eq("id", agent.id);

  return {
    scanId, agentId: agent.id, universe: mode,
    scannedCount: universe.length, validCount: passed.length,
    selected, topCandidates: passed.slice(0, 10),
    rejected: [...rejected, ...blocked].slice(0, 20),
    reasoning, riskMode, summary,
  };
}
