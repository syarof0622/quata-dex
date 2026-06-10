// AI Trade Agent decision engine. Pure server-side logic, no DB writes.
// Combines REAL public market data (price/technical/news/disclosure/market
// context) into a single decision per (agent, symbol) call. All snapshots are
// returned for persistence as training data. If real data is missing → HOLD.

import { getQuote, getIndices } from "./market.functions";
import { getTradeSetup } from "./signals.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sizeOrder, isIDXSymbol, convertSharesToLot } from "./lot-sizing";
import { canExecutePaperTrade, getIDXMarketSession } from "./idx-market-session";
import { computeDataQuality, type DataQualityReport } from "./data-quality";
import { sectorOf } from "./sectors";
import { getStrategyContextFor } from "./strategy-intelligence.functions";
import { finalRiskGuard } from "./risk-engine.server";
import { calculateTradeQualityScore } from "./trade-quality";
import { evaluateBuyGuards, getSymbolCooldown } from "./loss-protection.server";

export type AgentAction = "BUY" | "SELL" | "HOLD" | "EXIT";

export type AgentDecision = {
  symbol: string;
  action: AgentAction;
  confidence: number;            // calibrated (final) confidence used for gating
  rawConfidence: number;         // pre-calibration
  calibrationReason: string;
  strategy: string;
  allocationAmount: number;
  suggestedLot: number;
  suggestedShares: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  reasoning: string;
  dataFreshnessSeconds: number | null;
  dataSource: string;
  // Execution gating (passive analysis vs executable)
  executionAllowed: boolean;
  analysisOnly: boolean;
  blockedReason?: string | null;
  // snapshots (persisted as training data)
  realMarketData: Record<string, unknown>;
  realTechnicalData: Record<string, unknown>;
  realNewsData: Record<string, unknown>;
  realDisclosureData: Record<string, unknown>;
  realMarketContext: Record<string, unknown>;
  portfolioSnapshot: Record<string, unknown>;
  riskSnapshot: Record<string, unknown>;
  dataQuality: DataQualityReport | null;
  warnings: string[];
  // Strategy attribution + intelligence (persisted to ai_agent_decisions).
  strategyName?: string | null;
  setupType?: string | null;
  marketRegime?: string | null;
  signalSource?: string | null;
  strategyContext?: Record<string, unknown> | null;
};

export type AgentConfig = {
  id: string;
  riskLevel: "conservative" | "balanced" | "aggressive" | string;
  strategyMode: string;
  allocationAmount: number;
  maxPositionPerSymbol: number;
  minConfidenceToTrade: number;
  autoStopLoss: boolean;
  autoTakeProfit: boolean;
  allowBuy: boolean;
  allowSell: boolean;
  tradingHoursOnly: boolean;
  requireFreshData: boolean;
  // Undervalued strategy gating (only enforced when strategyMode contains "undervalued")
  minUndervalueScore?: number;
  maxValueTrapRisk?: number;
  // Autonomous risk mode — relaxes confidence threshold for scanner-selected trade candidates.
  autonomousRiskMode?: "conservative" | "balanced" | "progressive" | "expert_research" | string;
  // Raw agent row — required by the advanced risk engine.
  agentRow?: Record<string, unknown> | null;
};

export type AutonomousContext = {
  score: number;
  classification: string;
  eligibility?: string;
  researchTradeAllowed?: boolean;
};

// Per risk-mode autonomous BUY gating (used only when AutonomousContext provided
// and classification looks like a trade candidate). Scanner already filtered DQ
// + liquidity, so we accept a lower confidence floor than manual mode.
// Aggression modes (expert_paper, research_max) get the most generous gates so
// they actually deploy cash on valid setups instead of defaulting to WATCH.
const AUTO_GATES: Record<string, { minScore: number; minConfidence: number; minRR: number }> = {
  conservative:    { minScore: 75, minConfidence: 0.55, minRR: 1.5 },
  balanced:        { minScore: 70, minConfidence: 0.45, minRR: 1.5 },
  progressive:     { minScore: 60, minConfidence: 0.35, minRR: 1.2 },
  expert_research: { minScore: 55, minConfidence: 0.30, minRR: 1.0 },
  expert_paper:    { minScore: 55, minConfidence: 0.28, minRR: 1.0 },
  research_max:    { minScore: 50, minConfidence: 0.22, minRR: 0.9 },
};

export type Position = { symbol: string; qty: number; avg_price: number };
export type AccountSnap = { cash: number; equity: number };

const RISK_PRESETS: Record<string, { slPct: number; tpPct: number }> = {
  conservative: { slPct: 0.015, tpPct: 0.035 },
  balanced:     { slPct: 0.025, tpPct: 0.05 },
  aggressive:   { slPct: 0.04,  tpPct: 0.08 },
};

// Max age (seconds) before quote is considered stale for trading.
const FRESHNESS_LIMIT_S = 15 * 60;

function emptySnap(symbol: string, reason: string, extra: Partial<AgentDecision> = {}): AgentDecision {
  return {
    symbol, action: "HOLD",
    confidence: 0, rawConfidence: 0, calibrationReason: "No data",
    strategy: "guard",
    allocationAmount: 0, suggestedLot: 0, suggestedShares: 0,
    entryPrice: null, stopLoss: null, takeProfit: null, riskRewardRatio: null,
    reasoning: reason,
    dataFreshnessSeconds: null, dataSource: "none",
    executionAllowed: false, analysisOnly: true, blockedReason: reason,
    realMarketData: {}, realTechnicalData: {}, realNewsData: {},
    realDisclosureData: {}, realMarketContext: {},
    portfolioSnapshot: {}, riskSnapshot: {},
    dataQuality: null,
    warnings: [reason],
    ...extra,
  };
}

/** Fetch real news + disclosure snapshot from scraped DB (no synthetic data). */
async function buildNewsSnapshot(symbol: string) {
  // Pull last-24h articles tagged with this ticker (with or without ".JK").
  const base = symbol.replace(/\.JK$/i, "");
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: arts } = await supabaseAdmin
    .from("news_articles")
    .select("title, source, published_at, url, sentiment, sentiment_score, impact_score, impact_level, category, tickers, ticker_relevance_score, relevance_class, impact_category, event_cluster_id, source_reliability_weight, is_noise")
    .or(`tickers.cs.{${base}},tickers.cs.{${symbol}}`)
    .eq("is_duplicate", false)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(30);

  const all = (arts ?? []) as any[];
  // Strip noise + irrelevant; require at least sector-level relevance for agent decisions.
  const list = all.filter((a) =>
    !a.is_noise &&
    a.relevance_class !== "irrelevant_noise" &&
    a.relevance_class !== "global_context"
  );
  // Dedupe by event cluster so the same event from 5 sources doesn't multiply the signal.
  const byCluster = new Map<string, any>();
  for (const a of list) {
    const key = a.event_cluster_id ?? `${a.source}-${a.title}`;
    const prev = byCluster.get(key);
    // Prefer the article with higher source reliability inside the same cluster.
    if (!prev || Number(a.source_reliability_weight ?? 0) > Number(prev.source_reliability_weight ?? 0)) {
      byCluster.set(key, a);
    }
  }
  const uniqueEvents = [...byCluster.values()];

  const positive = uniqueEvents.filter((a) => a.sentiment === "positive").length;
  const negative = uniqueEvents.filter((a) => a.sentiment === "negative").length;
  const neutral  = uniqueEvents.filter((a) => a.sentiment === "neutral").length;
  const high     = uniqueEvents.filter((a) => a.impact_level === "high").length;
  const sources  = Array.from(new Set(uniqueEvents.map((a) => a.source))).slice(0, 8);
  const topNews  = uniqueEvents.slice(0, 5).map((a) => ({
    title: a.title, source: a.source, publishedAt: a.published_at,
    sentiment: a.sentiment, impactScore: Number(a.impact_score ?? 0),
    impactCategory: a.impact_category, relevanceClass: a.relevance_class,
    sourceReliability: Number(a.source_reliability_weight ?? 0.65), url: a.url,
  }));

  // Reliability-weighted sentiment bias (positive minus negative, weighted).
  let weightedBias = 0;
  for (const a of uniqueEvents) {
    const w = Number(a.source_reliability_weight ?? 0.65);
    const s = a.sentiment === "positive" ? 1 : a.sentiment === "negative" ? -1 : 0;
    const impactBoost = a.impact_level === "high" ? 1.5 : 1.0;
    weightedBias += s * w * impactBoost;
  }

  // Disclosure detection: prefer impact_category or IDX/disclosure markers.
  const isDisclosure = (a: any) => {
    if (a.impact_category && /uma_suspension|merger_acquisition|rights_issue|buyback|dividend|corporate_action|governance_risk/.test(a.impact_category)) return true;
    const hay = `${a.source ?? ""} ${a.category ?? ""} ${a.title ?? ""}`.toLowerCase();
    return /idx|bursa|keterbukaan|disclosure|rups|dividen|buyback|right.?issue|suspen|stock.?split|akuisisi|merger|ipo|uma/.test(hay);
  };
  const disc = uniqueEvents.find(isDisclosure) ?? null;

  return {
    news: {
      latestNewsCount: uniqueEvents.length,
      rawArticleCount: all.length,
      noiseFilteredOut: all.length - uniqueEvents.length,
      positiveNewsCount: positive, neutralNewsCount: neutral, negativeNewsCount: negative,
      highImpactNewsCount: high, sources, topNews,
    },
    disclosure: {
      hasRecentDisclosure: !!disc,
      latestDisclosureType: disc?.impact_category ?? disc?.category ?? disc?.source ?? null,
      disclosureImpact: disc?.impact_level ?? null,
      disclosureSentiment: disc?.sentiment ?? null,
      title: disc?.title ?? null,
      url: disc?.url ?? null,
    },
    newsBias: weightedBias, // reliability + impact-weighted bias
  };
}

/** Macro/IHSG bias from getIndices (real public data). */
async function buildMarketContext(symbol: string) {
  try {
    const idx: any = await (getIndices as any)({ data: { market: isIDXSymbol(symbol) ? "idx" : "global" } });
    const ihsg = (idx?.indices ?? []).find((i: any) => /JKSE|IHSG/i.test(i.symbol)) ?? null;
    const sp = (idx?.indices ?? []).find((i: any) => /GSPC|S&P/i.test(i.symbol)) ?? null;
    const ihsgChg = Number(ihsg?.changePercent ?? 0);
    const spChg = Number(sp?.changePercent ?? 0);
    const bias = (v: number) => v > 0.25 ? "bullish" : v < -0.25 ? "bearish" : "neutral";
    return {
      ihsgBias: bias(ihsgChg), ihsgChangePct: ihsgChg,
      globalBias: bias(spChg), spChangePct: spChg,
      sectorBias: "neutral", macroBias: "neutral", commodityBias: "neutral",
      source: "Yahoo Finance (public)",
    };
  } catch {
    return { ihsgBias: "neutral", globalBias: "neutral", sectorBias: "neutral",
             macroBias: "neutral", commodityBias: "neutral", source: "unavailable" };
  }
}

/** Confidence calibration: blend persistent per-ticker memory + recent training events.
 *  Distinguishes tradeWinRate (realized P/L from completed trades) vs
 *  directionAccuracy (was_correct from any snapshot, including HOLD). */
async function calibrateConfidence(agentId: string, symbol: string, raw: number, strategy: string) {
  // Trade win rate: persistent memory row (populated from realized P/L).
  const { data: mem } = await supabaseAdmin
    .from("ai_agent_trade_memory")
    .select("recent_win_rate, sample_size, best_strategy, worst_strategy, recent_mistake")
    .eq("agent_id", agentId).eq("symbol", symbol).maybeSingle();

  const tradeN = Number(mem?.sample_size ?? 0);
  const tradeWinRate = Number(mem?.recent_win_rate ?? 0) / 100; // memory stores %, normalize to 0..1

  // Direction accuracy (separate signal): includes HOLD/passive snapshots.
  let dirN = 0;
  let directionAccuracy = 0;
  {
    const { data: past } = await supabaseAdmin
      .from("ai_agent_training_events")
      .select("was_correct")
      .eq("agent_id", agentId).eq("symbol", symbol)
      .not("was_correct", "is", null)
      .order("created_at", { ascending: false }).limit(50);
    dirN = past?.length ?? 0;
    if (dirN >= 1) directionAccuracy = (past!.filter(p => p.was_correct === true).length) / dirN;
  }

  // Case A: no completed trades yet — bootstrap calibration so the agent is not
  // locked in a deadlock (no completed trades → no calibration → no new trades).
  // We blend the raw signal with direction accuracy (when available) and a
  // conservative prior (0.5). The result is tagged `bootstrap_calibration` so
  // downstream gating can size starter trades smaller instead of hard-blocking.
  if (tradeN < 5) {
    const prior = 0.5;
    // Direction accuracy weight grows with sample size, capped at 0.4.
    const dirWeight = dirN >= 5 ? Math.min(0.4, dirN / 50) : 0;
    const rawWeight = 0.6 - dirWeight * 0.5; // keep raw signal dominant
    const priorWeight = 1 - rawWeight - dirWeight;
    const bootstrap = raw * rawWeight + directionAccuracy * dirWeight + prior * priorWeight;
    // Never let bootstrap drop the raw signal by more than 25% — we want to
    // allow STARTER_BUY when the technical setup is genuinely strong.
    const floor = raw * 0.75;
    const value = Math.max(floor, Math.min(0.95, bootstrap));
    const reasonParts = [
      `Kalibrasi ticker belum cukup (trade n=${tradeN})`,
      dirN >= 5 ? `direction accuracy ${(directionAccuracy*100).toFixed(0)}% (n=${dirN})` : `direction sample minim (n=${dirN})`,
      `mode bootstrap aktif — confidence menggunakan sinyal mentah + prior sektor/strategi`,
    ];
    return { value, reason: reasonParts.join("; ") + ".", bootstrap: true };
  }



  // Case B: use trade win rate as primary calibration source.
  let mult = 0.6 + tradeWinRate * 0.55;
  const notes: string[] = [`trade win-rate ${(tradeWinRate * 100).toFixed(0)}% (n=${tradeN} completed)`];
  if (dirN >= 5) notes.push(`direction accuracy ${(directionAccuracy*100).toFixed(0)}% (n=${dirN})`);

  // Strategy memory bias.
  if (mem?.best_strategy && mem.best_strategy === strategy) {
    mult *= 1.07; notes.push(`strategi ${strategy} historis terbaik untuk ${symbol} (+7%)`);
  } else if (mem?.worst_strategy && mem.worst_strategy === strategy) {
    mult *= 0.9; notes.push(`strategi ${strategy} historis terburuk untuk ${symbol} (-10%)`);
  }

  const calibrated = Math.max(0, Math.min(0.99, raw * mult));
  const dir = calibrated >= raw ? "dinaikkan" : "diturunkan";
  return { value: calibrated, reason: `${notes.join("; ")} → confidence ${dir}.`, bootstrap: false };

}

export async function evaluateSymbol(
  agent: AgentConfig,
  symbol: string,
  account: AccountSnap,
  positions: Position[],
  autonomousContext?: AutonomousContext,
): Promise<AgentDecision> {
  const sym = symbol.trim().toUpperCase();

  // 1. Market session guard for IDX symbols — execution-only.
  // Passive analysis (snapshots, technical, news) still proceeds so the
  // agent can build training data outside trading hours.
  let executionAllowed = true;
  let executionBlockedReason: string | null = null;
  if (agent.tradingHoursOnly && isIDXSymbol(sym)) {
    const guard = canExecutePaperTrade();
    if (!guard.ok) {
      executionAllowed = false;
      executionBlockedReason = `${guard.reason ?? "Market closed"} — passive analysis only.`;
    }
  }

  // 2. REAL price (Yahoo Finance public)
  let quote: any;
  try { quote = await getQuote({ data: { symbol: sym } }); }
  catch (e: any) { return emptySnap(sym, `Quote unavailable: ${e?.message ?? "error"}`); }
  if (!quote?.price) return emptySnap(sym, "Harga aktual tidak tersedia — HOLD.");

  const price = Number(quote.price);
  // Quote freshness heuristic: market open ⇒ very fresh; otherwise unknown.
  const session = getIDXMarketSession();
  const freshness = session.isOpen && isIDXSymbol(sym) ? 5 : 600;

  if (agent.requireFreshData && freshness > FRESHNESS_LIMIT_S) {
    return emptySnap(sym, `Data harga tidak fresh (${freshness}s) — HOLD.`);
  }

  const realMarketData = {
    price, open: quote.open ?? null, high: quote.high ?? null, low: quote.low ?? null,
    previousClose: quote.prevClose ?? null,
    change: quote.change ?? null, changePercent: quote.changePercent ?? null,
    volume: quote.volume ?? null,
    marketStatus: quote.marketState ?? (session.isOpen ? "open" : "closed"),
    dataSource: "Yahoo Finance (public)",
    dataFreshnessSeconds: freshness,
    capturedAt: new Date().toISOString(),
  };

  // 3. REAL technicals
  let setup: any = null;
  try { setup = await getTradeSetup({ data: { symbol: sym, timeframe: "1d" } }); }
  catch { /* tolerate */ }
  const sig = setup?.signal;
  const techScore: number = sig?.score ?? 0; // -100..100 ish
  const techLabel: string = sig?.label ?? "HOLD";

  const realTechnicalData = {
    timeframe: "1d",
    trend: techScore > 15 ? "bullish" : techScore < -15 ? "bearish" : "neutral",
    score: techScore,
    label: techLabel,
    grade: setup?.setup?.quality?.grade ?? null,
    executionStatus: sig?.executionStatus ?? null,
    stopDistancePct: setup?.setup?.stopDistancePct ?? null,
    rsi: setup?.indicators?.rsi ?? null,
    macdSignal: setup?.indicators?.macd?.signal ?? null,
    movingAverageSignal: setup?.indicators?.ma?.signal ?? null,
    support: setup?.setup?.support ?? null,
    resistance: setup?.setup?.resistance ?? null,
    breakoutSignal: !!setup?.setup?.breakout,
  };

  // 4. REAL news + disclosure (scraped table)
  const newsSnap = await buildNewsSnapshot(sym);
  const realNewsData = newsSnap.news;
  const realDisclosureData = newsSnap.disclosure;

  // 5. REAL market context (IHSG/global from public sources)
  const realMarketContext = await buildMarketContext(sym);

  // 6. Sentiment summary (aggregated table)
  const { data: sentRow } = await supabaseAdmin
    .from("ticker_sentiment_summary").select("*").eq("symbol", sym).maybeSingle();
  const sentScore = Number(sentRow?.average_sentiment_score ?? 0); // -1..1
  const sentSamples = Number(sentRow?.positive_count ?? 0)
                    + Number(sentRow?.negative_count ?? 0)
                    + Number(sentRow?.neutral_count ?? 0);

  // 6b. Fundamental availability for data-quality scoring
  const { data: fundRow } = await supabaseAdmin
    .from("stock_fundamentals")
    .select("per, pbv, roe, der, financial_report_date")
    .eq("symbol", sym).maybeSingle();
  const hasCoreRatios = !!fundRow && [fundRow.per, fundRow.pbv, fundRow.roe, fundRow.der]
    .filter(v => v != null).length >= 2;
  const reportAgeDays = fundRow?.financial_report_date
    ? Math.round((Date.now() - new Date(fundRow.financial_report_date).getTime()) / 86400_000)
    : null;

  // 6c. Compute data quality from snapshots already in hand
  const dataQuality = computeDataQuality({
    symbol: sym,
    price: { value: price, freshnessSeconds: freshness },
    technical: { hasData: !!setup, score: techScore },
    news: {
      count: realNewsData.latestNewsCount,
      sources: realNewsData.sources?.length ?? 0,
      highImpact: realNewsData.highImpactNewsCount,
    },
    sentiment: { score: sentScore, sampleCount: sentSamples },
    disclosure: { hasRecent: !!realDisclosureData.hasRecentDisclosure },
    fundamental: { hasCoreRatios, reportAgeDays },
  });

  // 7. Portfolio context
  const pos = positions.find(p => p.symbol === sym);
  const totalEquity = Math.max(1, account.equity);
  const symbolExposure = pos ? (pos.qty * price) / totalEquity : 0;

  // 8. Composite signal (tech + sentiment + news + disclosure + macro + sector rotation)
  const techNorm = Math.max(-1, Math.min(1, techScore / 100));
  const newsBiasNorm = Math.max(-1, Math.min(1, newsSnap.newsBias / 5));
  const disclosureBoost = realDisclosureData.hasRecentDisclosure
    ? (realDisclosureData.disclosureSentiment === "positive" ? 0.15
       : realDisclosureData.disclosureSentiment === "negative" ? -0.15 : 0)
    : 0;
  const macroBoost = (realMarketContext.ihsgBias === "bullish" ? 0.05
                     : realMarketContext.ihsgBias === "bearish" ? -0.05 : 0);

  // Sector rotation input — bonus for rotating_in / leading, penalty for rotating_out / lagging.
  let sectorRotationBoost = 0;
  let sectorRotationLabel: string = "neutral";
  let sectorRotationScore = 0;
  try {
    const sec = sectorOf(sym);
    const { data: secRow } = await supabaseAdmin
      .from("sector_strength_snapshots")
      .select("classification, relative_strength")
      .eq("sector", sec)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (secRow) {
      sectorRotationLabel = String((secRow as any).classification ?? "neutral");
      sectorRotationScore = Number((secRow as any).relative_strength ?? 0);
      if (sectorRotationLabel === "leading") sectorRotationBoost = 0.12;
      else if (sectorRotationLabel === "rotating_in") sectorRotationBoost = 0.08;
      else if (sectorRotationLabel === "rotating_out") sectorRotationBoost = -0.10;
      else if (sectorRotationLabel === "lagging") sectorRotationBoost = -0.07;
    }
  } catch { /* tolerate */ }

  // Cross-strategy fundamental / undervalue boost.
  // STRONG_UNDERVALUE => +bonus, VALUE_TRAP => -penalty, INSUFFICIENT_DATA => neutral.
  // Hard undervalued gate (below) still applies for "undervalued" strategy modes.
  let fundamentalBoost = 0;
  let fundamentalContext: any = { classification: "unknown", undervalueScore: null, valueTrapRisk: null, fundamentalConfidence: "low", fundamentalReasons: [] as string[] };
  try {
    const { data: uvRow } = await supabaseAdmin
      .from("ai_undervalue_scores")
      .select("final_undervalue_score, value_trap_risk_score, classification, reasoning, data_coverage")
      .eq("symbol", sym)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (uvRow) {
      const fscore = Number((uvRow as any).final_undervalue_score ?? 0);
      const ftrap = Number((uvRow as any).value_trap_risk_score ?? 0);
      const fcls = String((uvRow as any).classification ?? "insufficient_data");
      const cov = Number((uvRow as any).data_coverage ?? 0);
      if (fcls === "strong_undervalued" && ftrap <= 35) fundamentalBoost = 0.12;
      else if (fcls === "undervalued" && ftrap <= 50) fundamentalBoost = 0.07;
      else if (fcls === "value_trap_risk") fundamentalBoost = -0.15;
      else if (fcls === "overvalued") fundamentalBoost = -0.05;
      else fundamentalBoost = 0; // fair_value / insufficient_data => neutral
      fundamentalContext = {
        classification: fcls,
        undervalueScore: fscore,
        valueTrapRisk: ftrap,
        fundamentalConfidence: cov >= 0.6 ? "high" : cov >= 0.4 ? "medium" : "low",
        fundamentalReasons: (uvRow as any).reasoning ? [String((uvRow as any).reasoning)] : [],
      };
    }
  } catch { /* tolerate */ }

  // 7b. Official disclosure context (IDX/BEI) — supersedes news-derived disclosure when present.
  let officialDisclosure: any = null;
  let disclosureRiskFlags: string[] = [];
  try {
    const { getLatestDisclosureFor, deriveRiskFlags } = await import("./disclosures.functions");
    const od = await getLatestDisclosureFor(sym, 24 * 7);
    if (od) {
      disclosureRiskFlags = deriveRiskFlags(od);
      officialDisclosure = {
        type: od.disclosure_type, title: od.title, source: od.source,
        publishedAt: od.published_at, impact: od.impact_level,
        sentiment: od.sentiment, url: od.url, riskFlags: disclosureRiskFlags,
      };
    }
  } catch { /* tolerate */ }
  fundamentalContext = { ...fundamentalContext, latestDisclosure: officialDisclosure, disclosureRiskFlags };




  // 8.5 Strategy intelligence — fetch latest regime + score for this strategy.
  let marketRegimeLabel: string = "unknown";
  try {
    const { data: regRow } = await supabaseAdmin
      .from("market_regime_snapshots")
      .select("regime_classification")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (regRow) marketRegimeLabel = String((regRow as any).regime_classification ?? "unknown");
  } catch { /* tolerate */ }
  const symbolSector = sectorOf(sym) ?? "Unknown";
  const strategyName: string = String(agent.strategyMode || "trend_following");
  let strategyContext: any = null;
  let strategyBoost = 0;
  try {
    strategyContext = await getStrategyContextFor({
      strategyName, sector: symbolSector, regime: marketRegimeLabel,
    });
    const cls = strategyContext.classification;
    const compat = Number(strategyContext.regimeCompatibility ?? 0.5);
    if (cls === "proven" && compat >= 0.7) strategyBoost = 0.10;
    else if (cls === "promising" && compat >= 0.6) strategyBoost = 0.05;
    else if (cls === "underperforming") strategyBoost = -0.10;
    else if (cls === "unstable") strategyBoost = -0.07;
    else if (cls === "avoid") strategyBoost = -0.12;
    // Regime mismatch — hard reduce.
    if (compat < 0.35) strategyBoost -= 0.08;
  } catch { /* tolerate */ }

  const composite = techNorm * 0.45 + sentScore * 0.18 + newsBiasNorm * 0.18
                  + disclosureBoost + macroBoost + sectorRotationBoost + fundamentalBoost + strategyBoost;
  let rawConfidence = Math.min(0.99, Math.abs(composite));

  // Autonomous scanner already gated DQ + liquidity. For trade-classified
  // candidates we soften the DQ penalty and apply a confidence floor derived
  // from the scanner score so high-score picks aren't blocked by sample=0.
  const autoIsTradeCandidate = !!autonomousContext
    && /trade/i.test(String(autonomousContext.classification ?? ""));
  const dqShortfall = (100 - dataQuality.overallDataQualityScore) / 200; // up to -0.5
  const dqPenalty = autoIsTradeCandidate ? dqShortfall * 0.3 : dqShortfall;
  rawConfidence = Math.max(0, rawConfidence - dqPenalty);
  if (autoIsTradeCandidate) {
    const floor = Math.min(0.85, Number(autonomousContext!.score) / 120);
    if (floor > rawConfidence) rawConfidence = floor;
  }

  // 9. Calibrate using historic outcomes
  const calib = await calibrateConfidence(agent.id, sym, rawConfidence, agent.strategyMode);
  let confidence = calib.value;

  // 9b. Learning-engine adjustments (symbol/strategy/sector/regime memory).
  // Nudges confidence + allocation. Hard guards below still apply.
  let learningAdj: any = null;
  let learningAllocMultiplier = 1;
  try {
    const { calculateLearningAdjustments } = await import("./learning-calibration.server");
    learningAdj = await calculateLearningAdjustments({
      userId: (agent.agentRow as any)?.user_id ?? "",
      symbol: sym,
      strategyMode: agent.strategyMode,
      agentMode: agent.autonomousRiskMode ?? null,
      sector: sectorOf(sym) ?? null,
      marketRegime: marketRegimeLabel,
    });
    if (learningAdj) {
      confidence = Math.max(0, Math.min(0.99, confidence + (learningAdj.finalConfidenceAdj ?? 0) / 100));
      learningAllocMultiplier = Math.max(0.1, Math.min(1.5, Number(learningAdj.allocationMultiplier ?? 1)));
      if (learningAdj.cooldownActive) {
        return emptySnap(sym, `Learning cooldown aktif untuk ${sym} sampai ${learningAdj.cooldownUntil}. ${learningAdj.notes.join("; ")}`, {
          confidence, rawConfidence, calibrationReason: calib.reason,
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          dataQuality, blockedReason: "learning_cooldown",
          warnings: [...(learningAdj.cautionFlags ?? [])],
          riskSnapshot: { learning: learningAdj } as any,
        });
      }
      if (learningAdj.strategyPaused) {
        return emptySnap(sym, `Strategi ${agent.strategyMode} dijeda oleh learning engine (performa lemah). ${learningAdj.notes.join("; ")}`, {
          confidence, rawConfidence, calibrationReason: calib.reason,
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          dataQuality, blockedReason: "strategy_paused_by_learning",
          riskSnapshot: { learning: learningAdj } as any,
        });
      }
    }
  } catch { /* tolerate — learning is advisory */ }

  const warnings: string[] = [];
  const portfolioSnapshot = { hasPosition: !!pos, exposure: symbolExposure, cash: account.cash };

  // EXIT logic
  if (pos && (composite < -0.2 || techLabel === "SELL")) {
    if (!agent.allowSell) return emptySnap(sym, "Sell disabled untuk agent ini.");
    if (!executionAllowed) {
      return emptySnap(sym, executionBlockedReason ?? "Execution blocked", {
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness, dataQuality,
        blockedReason: executionBlockedReason,
      });
    }
    return {
      symbol: sym, action: "EXIT", confidence, rawConfidence,
      calibrationReason: calib.reason,
      strategy: agent.strategyMode,
      allocationAmount: pos.qty * price,
      suggestedLot: convertSharesToLot(pos.qty),
      suggestedShares: pos.qty,
      entryPrice: price, stopLoss: null, takeProfit: null, riskRewardRatio: null,
      reasoning: `Posisi existing dilepas: teknikal ${techLabel} (${techScore.toFixed(0)}), sentimen ${sentScore.toFixed(2)}, news bias ${newsBiasNorm.toFixed(2)}.`,
      dataFreshnessSeconds: freshness, dataSource: "Yahoo Finance + public news feed",
      executionAllowed: true, analysisOnly: false,
      realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
      portfolioSnapshot,
      riskSnapshot: { exposure: symbolExposure }, dataQuality, warnings,
    };
  }

  // BUY logic — allow when composite is positive OR scanner pre-classified as trade candidate.
  const autoGate = autoIsTradeCandidate
    ? (AUTO_GATES[String(agent.autonomousRiskMode ?? "balanced")] ?? AUTO_GATES.balanced)
    : null;
  const autoBuyAllowed = !!autoGate
    && Number(autonomousContext!.score) >= autoGate.minScore
    && techLabel !== "SELL";
  if (!pos && agent.allowBuy && techLabel !== "SELL" && (composite > 0 || autoBuyAllowed)) {
    // Undervalue gate: only when strategyMode signals an undervalued strategy.
    const isUndervaluedStrategy = /undervalu/i.test(agent.strategyMode);
    if (isUndervaluedStrategy) {
      const { data: uv } = await supabaseAdmin
        .from("ai_undervalue_scores")
        .select("final_undervalue_score, value_trap_risk_score, classification, reasoning")
        .eq("symbol", sym)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      const minScore = Number(agent.minUndervalueScore ?? 65);
      const maxTrap = Number(agent.maxValueTrapRisk ?? 40);
      if (!uv) {
        return emptySnap(sym, "Strategi undervalued aktif tetapi belum ada skor fundamental — HOLD.", {
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot,
        });
      }
      const score = Number(uv.final_undervalue_score ?? 0);
      const trap = Number(uv.value_trap_risk_score ?? 0);
      const cls = String(uv.classification ?? "");
      if (cls === "value_trap_risk" || cls === "overvalued" || cls === "insufficient_data") {
        return emptySnap(sym, `Tidak memenuhi undervalued criteria: classification=${cls}. ${uv.reasoning ?? ""}`, {
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, riskSnapshot: { undervalueScore: score, valueTrapRisk: trap, classification: cls },
        });
      }
      if (trap > maxTrap) {
        return emptySnap(sym, `Value-trap risk ${trap.toFixed(0)} > limit ${maxTrap}. HOLD.`, {
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, riskSnapshot: { undervalueScore: score, valueTrapRisk: trap, classification: cls },
        });
      }
      if (score < minScore) {
        return emptySnap(sym, `Undervalue score ${score.toFixed(0)} < threshold ${minScore}. HOLD.`, {
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, riskSnapshot: { undervalueScore: score, valueTrapRisk: trap, classification: cls },
        });
      }
      // Blend undervalue score into raw confidence (40% weight) to bias toward true bargains.
      // (rawConfidence already calibrated below; we adjust calib floor instead.)
    }

    const effectiveMinConfidence = autoGate
      ? Math.min(agent.minConfidenceToTrade, autoGate.minConfidence)
      : agent.minConfidenceToTrade;
    // STARTER tier: when calibration is bootstrapping OR confidence sits in the
    // 60–100% band of the normal threshold, allow a reduced-size paper trade so
    // the agent generates learning data instead of freezing. Safety guards
    // (SL/TP/RR, exposure cap, swing gate, lot sizing, cooldown, disclosure)
    // continue to apply downstream — they will still convert this into HOLD if
    // the setup is actually unsafe.
    const starterFloor = effectiveMinConfidence * 0.6;
    const isStarter = confidence < effectiveMinConfidence && (calib.bootstrap || confidence >= starterFloor);
    if (confidence < effectiveMinConfidence && !isStarter) {
      return emptySnap(sym, `Confidence ${(confidence * 100).toFixed(0)}% < threshold ${(effectiveMinConfidence*100).toFixed(0)}%. ${calib.reason}`, {
        confidence, rawConfidence, calibrationReason: calib.reason,
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness,
        dataSource: "Yahoo Finance + public news feed",
        blockedReason: "confidence_below_threshold",
      });
    }
    // Tag starter trades so the executor can apply a 40% size reduction and the
    // UI can show "Beli Starter" instead of "Beli Swing".
    const starterSizeMultiplier = isStarter ? 0.4 : 1;
    const starterReason = isStarter
      ? (calib.bootstrap
          ? "Kalibrasi ticker belum cukup — masuk mode STARTER paper trade dengan ukuran posisi diturunkan ke 40% untuk membangun sample kalibrasi."
          : `Confidence ${(confidence*100).toFixed(0)}% di zona starter (${(starterFloor*100).toFixed(0)}–${(effectiveMinConfidence*100).toFixed(0)}%) — ukuran posisi diturunkan ke 40%.`)
      : null;

    if (symbolExposure >= agent.maxPositionPerSymbol) {
      return emptySnap(sym, `Eksposur ${(symbolExposure*100).toFixed(1)}% melebihi limit per simbol.`, {
        riskSnapshot: { exposure: symbolExposure, cap: agent.maxPositionPerSymbol },
        blockedReason: "max_position_weight_reached",
      });
    }

    // ===== SWING MAX gate (Patches 2-10/16/20) =====
    // When swing_mode_active, every BUY must pass the swing-trade engine:
    // quality threshold, structural stop, RR≥2, weekly per-symbol cap, and
    // session/regime/overextension guards. Plan is attached to riskSnapshot
    // and persisted by the caller after a successful fill.
    const agentRowSwing: any = (agent.agentRow ?? {}) as any;
    const swingActive = !!agentRowSwing.swing_mode_active;
    let swingPlan: any = null;
    let swingQuality: any = null;
    if (swingActive) {
      const weeklyCap = Number(agentRowSwing.max_trades_per_symbol_per_week ?? 1);
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { count: weekCnt } = await supabaseAdmin
        .from("swing_trade_plans")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id).eq("symbol", sym)
        .gte("created_at", weekAgo);
      if ((weekCnt ?? 0) >= weeklyCap) {
        return emptySnap(sym, `Swing cap: ${weekCnt}/${weeklyCap} entries for ${sym} in last 7d.`, {
          confidence, rawConfidence, calibrationReason: calib.reason,
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, dataQuality,
          blockedReason: "swing_weekly_symbol_cap",
        });
      }
      const { evaluateSwingEntry } = await import("./swing-trade-engine");
      const cdSw = await getSymbolCooldown(agent.id, sym).catch(() => null);
      const volLabelSw = ((setup as any)?.signal?.riskLabel ?? "").toLowerCase().includes("high")
        ? "high" : ((setup as any)?.signal?.riskLabel ?? "").toLowerCase().includes("medium") ? "medium" : "low";
      const sessLabel = session.state === "open_session_1" ? "session_1"
        : session.state === "open_session_2" ? "session_2"
        : session.state === "lunch_break" ? "lunch"
        : session.state === "pre_open" ? "pre_open" : "post_close";
      const minutesSinceOpen = session.state === "open_session_1" ? Math.max(0, (session.minutesNow ?? 999) - 9*60) : 999;
      const sEval = evaluateSwingEntry({
        symbol: sym, price,
        techScore, techLabel,
        aboveEMA20: (setup as any)?.signal?.aboveShortMA ?? null,
        aboveEMA50: (setup as any)?.signal?.aboveMediumMA ?? null,
        ema20: (setup as any)?.indicators?.ma?.short ?? null,
        ema50: (setup as any)?.indicators?.ma?.medium ?? null,
        recentSwingLow: (setup as any)?.setup?.support ?? null,
        supportLevel: (setup as any)?.setup?.support ?? null,
        resistanceLevel: (setup as any)?.setup?.resistance ?? null,
        nearestResistance: (setup as any)?.setup?.resistance ?? null,
        atrPct: typeof (setup as any)?.setup?.stopDistancePct === "number" ? (setup as any).setup.stopDistancePct : null,
        rsi: (setup as any)?.indicators?.rsi ?? null,
        breakout: !!setup?.setup?.breakout,
        breakoutLevel: (setup as any)?.setup?.resistance ?? null,
        weeklyTrend: null,
        rvol: (setup as any)?.signal?.rvol ?? null,
        valueTradedIDR: quote?.volume && quote?.price ? Number(quote.volume) * Number(quote.price) : null,
        volumeConfirmed: (setup as any)?.signal?.volumeConfirmed ?? null,
        rsVsIHSG: null,
        rsVsSector: sectorRotationScore,
        sectorRotation: (sectorRotationLabel as any) || "neutral",
        marketRegime: marketRegimeLabel,
        ihsgBias: (realMarketContext as any).ihsgBias ?? null,
        volatilityLabel: volLabelSw as any,
        highImpactNegativeDisclosure: !!(officialDisclosure && officialDisclosure.impact === "high" && officialDisclosure.sentiment === "negative"),
        newsBias: Number(newsSnap.newsBias ?? 0),
        sentScore,
        newsStale: false,
        intradayChangePct: Number(quote.changePercent ?? 0),
        intradayCloseLocation: null,
        symbolCooldownActive: !!(cdSw?.cooldown_until && new Date(cdSw.cooldown_until).getTime() > Date.now()),
        symbolLossStreak: Number(cdSw?.loss_count ?? 0),
        strategyPaused: false,
        marketSessionLabel: sessLabel,
        minutesSinceOpen,
      }, {
        agentEquity: account.equity,
        cashAvailable: account.cash,
        symbolRecentLossCount: Number(cdSw?.loss_count ?? 0),
        recoveryLevel: (agentRowSwing.protection_mode_active || agentRowSwing.diagnostic_status === "PROTECTION_MODE" || agentRowSwing.diagnostic_status === "LOSS_PROTECTION_ACTIVE")
          ? "L0"
          : Number(agentRowSwing.consecutive_losses ?? 0) >= 2
            ? "L1"
            : Number(agentRowSwing.consecutive_losses ?? 0) === 1
              ? "L2"
              : "normal",
        highConvictionMode: agentRowSwing.high_conviction_allocation !== false, // default ON
        riskPerTradePct: Number(agentRowSwing.risk_per_trade_pct ?? 0.0075),
        minPositionWeightPct: Number(agentRowSwing.min_position_weight_pct ?? 0.04),
        maxPositionWeightPct: Math.max(0.18, Number(agentRowSwing.max_position_weight_pct ?? 0.18)),
        qualityThreshold: Math.max(85, Number(agentRowSwing.swing_quality_threshold ?? 85)),
        minRR: Math.max(2.5, Number(agentRowSwing.min_risk_reward ?? 2.5)),
        targetHoldingDays: Number(agentRowSwing.target_holding_days ?? 3),
        maxHoldingDays: Number(agentRowSwing.max_holding_days ?? 7),
        timeStopWarningDays: Number(agentRowSwing.time_stop_warning_days ?? 3),
        swingProtectionActive: !!agentRowSwing.swing_protection_active,
      });
      swingQuality = sEval.quality;
      if (!sEval.allowed || !sEval.plan) {
        return emptySnap(sym, `Swing Max block: ${sEval.blockedReasons.join(", ")} (quality ${sEval.quality.score}/${agentRowSwing.swing_quality_threshold ?? 78}).`, {
          confidence, rawConfidence, calibrationReason: calib.reason,
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, dataQuality,
          blockedReason: `swing_${sEval.blockedReasons[0] ?? "blocked"}`,
          warnings: [...warnings, ...sEval.blockedReasons.map(r => `swing:${r}`), ...sEval.warnings],
          riskSnapshot: { swingQuality: sEval.quality } as any,
        });
      }
      swingPlan = sEval.plan;
    }
    // ===== Advanced Risk Engine =====
    // Compute structural stop distance, ATR-equivalent volatility label, news
    // shock, sector exposure, cash buffer, RR — single canonical guard.
    const volLabel = (setup?.signal?.riskLabel ?? "").toLowerCase().includes("high")
      ? "high"
      : (setup?.signal?.riskLabel ?? "").toLowerCase().includes("medium") ? "medium" : "low";
    const structuralStopPct = typeof setup?.setup?.stopDistancePct === "number"
      ? setup.setup.stopDistancePct : null;
    // Approx ATR % from structural stop distance when available (signals already factors ATR).
    const atrPct = structuralStopPct ?? null;
    const negativeDisclosure = !!(realDisclosureData?.hasRecentDisclosure
      && realDisclosureData?.disclosureSentiment === "negative");

    // 9b. Hard-block on official high-impact negative disclosure or suspension/UMA.
    if (officialDisclosure) {
      const hardBlock =
        (officialDisclosure.sentiment === "negative" && officialDisclosure.impact === "high")
        || officialDisclosure.type === "suspension"
        || officialDisclosure.type === "uma";
      if (hardBlock) {
        return emptySnap(sym, `Disclosure block: ${officialDisclosure.type} (${officialDisclosure.impact}/${officialDisclosure.sentiment}) — "${officialDisclosure.title}".`, {
          confidence, rawConfidence, calibrationReason: calib.reason,
          realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
          portfolioSnapshot, dataFreshnessSeconds: freshness, dataQuality,
          riskSnapshot: { fundamentalContext } as any,
          blockedReason: `disclosure_${officialDisclosure.type}`,
          warnings: [...warnings, ...disclosureRiskFlags.map(f => `disclosure:${f}`)],
        });
      }
    }


    const guard = await finalRiskGuard({
      agent: { ...(agent.agentRow ?? {}), ...agent },
      symbol: sym,
      entryPrice: price,
      atrPct,
      structuralStopPct,
      volatilityLabel: volLabel as any,
      valueTradedIDR: quote?.volume && quote?.price ? Number(quote.volume) * Number(quote.price) : null,
      newsSnapshot: {
        negativeNewsCount: Number(realNewsData.negativeNewsCount ?? 0),
        highImpactNewsCount: Number(realNewsData.highImpactNewsCount ?? 0),
        hasNegativeDisclosure: negativeDisclosure,
        disclosureTitle: realDisclosureData?.title ?? null,
      },
      marketRegime: marketRegimeLabel,
    });

    if (!guard.allowed) {
      return emptySnap(sym, `Risk guard blocked: ${guard.blockedReason}. ${guard.warnings.join(" ")}`, {
        confidence, rawConfidence, calibrationReason: calib.reason,
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness, dataQuality,
        riskSnapshot: { riskGuard: guard, marketContext: realMarketContext } as any,
        blockedReason: guard.blockedReason ?? "risk_guard_blocked",
        warnings: [...warnings, ...guard.warnings],
      });
    }

    if (!executionAllowed) {
      return emptySnap(sym, executionBlockedReason ?? "Market closed — passive analysis only.", {
        confidence, rawConfidence, calibrationReason: calib.reason,
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness, dataQuality,
        blockedReason: "market_closed",
      });
    }

    const stopLoss = agent.autoStopLoss ? guard.stopLoss : null;
    const takeProfit = agent.autoTakeProfit ? guard.takeProfit : null;
    const rr = guard.riskRewardRatio;

    // ===== Loss-Protection BUY guard (Phase 3) =====
    // Cooldown info for quality scoring
    const agentRowAny = (agent.agentRow ?? {}) as any;
    const cd = await getSymbolCooldown(agent.id, sym).catch(() => null);
    const cooldownActive = !!(cd?.cooldown_until && new Date(cd.cooldown_until).getTime() > Date.now());
    const lossStreak = Number(cd?.loss_count ?? 0);

    const quality = calculateTradeQualityScore({
      techScore, techLabel,
      trend: techScore > 15 ? "bullish" : techScore < -15 ? "bearish" : "neutral",
      aboveShortMA: (setup as any)?.signal?.aboveShortMA ?? null,
      aboveMediumMA: (setup as any)?.signal?.aboveMediumMA ?? null,
      breakout: !!setup?.setup?.breakout,
      volumeConfirmed: (setup as any)?.signal?.volumeConfirmed ?? null,
      valueTradedIDR: quote?.volume && quote?.price ? Number(quote.volume) * Number(quote.price) : null,
      sectorRotation: sectorRotationLabel as any,
      marketRegime: marketRegimeLabel,
      ihsgBias: (realMarketContext as any).ihsgBias ?? null,
      volatilityLabel: volLabel as any,
      newsBias: Number((realNewsData as any).newsBias ?? 0),
      negativeDisclosure,
      sentScore,
      riskRewardRatio: rr,
      stopDistancePct: guard.stopDistancePct,
      symbolLossStreak: lossStreak,
      symbolCooldownActive: cooldownActive,
      dataFreshnessSeconds: freshness,
      dataQualityScore: (dataQuality as any)?.score ?? null,
    });

    const buyGuard = await evaluateBuyGuards({
      agent: { ...agentRowAny, id: agent.id, aggression_mode: agentRowAny.aggression_mode ?? agent.autonomousRiskMode },
      symbol: sym,
      strategy: String(agent.strategyMode ?? "trend_following"),
      qualityScore: quality.score,
      riskRewardRatio: rr,
      stopDistancePct: guard.stopDistancePct,
      marketRegime: marketRegimeLabel,
    });

    if (!buyGuard.allow) {
      return emptySnap(sym, `Loss-protection block: ${buyGuard.reasons.join(", ")}. Quality ${quality.score}/${quality.label}.`, {
        confidence, rawConfidence, calibrationReason: calib.reason,
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness, dataQuality,
        riskSnapshot: { riskGuard: guard, lossProtection: { ...buyGuard, quality } } as any,
        blockedReason: buyGuard.reasons[0],
        warnings: [...warnings, ...buyGuard.reasons.map(r => `loss_protection:${r}`)],
        strategyName, marketRegime: marketRegimeLabel, strategyContext,
      });
    }

    const autoReasonTag = autoGate
      ? ` [autonomous:${agent.autonomousRiskMode} score=${autonomousContext!.score.toFixed(0)}]`
      : "";
    // Swing Max overrides for SL/TP/RR/sizing when active.
    const finalStopLoss = swingPlan ? swingPlan.stopLoss : stopLoss;
    const finalTakeProfit = swingPlan ? swingPlan.takeProfit2 : takeProfit;
    const finalRR = swingPlan ? swingPlan.riskRewardRatio : rr;
    const baseAllocation = swingPlan ? swingPlan.positionSizeIDR : guard.positionSize;
    const baseShares = swingPlan && swingPlan.shares ? swingPlan.shares
      : swingPlan && price > 0
        ? Math.max(100, Math.floor(swingPlan.positionSizeIDR / price / 100) * 100)
        : guard.shares;
    // Apply starter multiplier (40% of normal) when this is a STARTER tier
    // entry, plus learning-derived allocation multiplier. Round shares down to
    // the IDX lot of 100 so we never break lot rules.
    const combinedMultiplier = starterSizeMultiplier * learningAllocMultiplier;
    const finalAllocation = Math.round(baseAllocation * combinedMultiplier);
    const finalShares = Math.max(100, Math.floor((baseShares * combinedMultiplier) / 100) * 100);
    const finalLot = Math.max(1, Math.round(finalShares / 100));
    const swingTag = swingPlan
      ? ` [SwingMax:${swingPlan.entryType} score=${swingPlan.swingQualityScore} RR=${swingPlan.riskRewardRatio} tier=${swingPlan.allocationTier ?? "n/a"}(${swingPlan.allocationTierLabel ?? "—"}) alloc=${((swingPlan.allocationPct ?? 0) * 100).toFixed(1)}% cap=${swingPlan.allocationCapWinner ?? "n/a"} hold=${swingPlan.targetHoldingDays}-${swingPlan.maxHoldingDays}d]`
      : "";
    const starterTag = isStarter ? " [STARTER paper trade — ukuran 40%]" : "";
    const learningTag = learningAdj && (learningAdj.finalConfidenceAdj !== 0 || learningAllocMultiplier !== 1)
      ? ` [Learning: conf ${learningAdj.finalConfidenceAdj >= 0 ? "+" : ""}${learningAdj.finalConfidenceAdj}%, alloc ×${learningAllocMultiplier.toFixed(2)}${learningAdj.cautionFlags?.length ? ` flags=${learningAdj.cautionFlags.join("/")}` : ""}]`
      : "";
    return {
      symbol: sym, action: "BUY", confidence, rawConfidence,
      calibrationReason: calib.reason,
      strategy: isStarter
        ? (swingPlan ? "swing_max_starter" : "controlled_paper_exploration")
        : swingPlan
        ? "swing_max"
        : autoGate
        ? (agent.autonomousRiskMode === "expert_research" ? "expert_research_micro_entry"
          : agent.autonomousRiskMode === "progressive" ? "progressive_small_entry"
          : "autonomous_entry")
        : agent.strategyMode,
      allocationAmount: finalAllocation,
      suggestedLot: finalLot, suggestedShares: finalShares,
      entryPrice: price, stopLoss: finalStopLoss, takeProfit: finalTakeProfit, riskRewardRatio: finalRR,
      reasoning: `Teknikal ${techLabel} (${techScore.toFixed(0)}), sentimen ${sentScore.toFixed(2)}, news +${realNewsData.positiveNewsCount}/-${realNewsData.negativeNewsCount} (high ${realNewsData.highImpactNewsCount}), IHSG ${realMarketContext.ihsgBias}, sektor ${sectorRotationLabel}, fundamental ${fundamentalContext.classification}, strategi ${strategyName} (regime ${marketRegimeLabel}). Risk engine: stop ${guard.stopMode} ${guard.stopDistancePct}%, RR ${rr}, size ${finalLot} lot (risk ${guard.riskAmount.toLocaleString()} IDR).${starterTag}${starterReason ? " " + starterReason : ""}${learningTag} ${calib.reason}${autoReasonTag}${swingTag}`,
      dataFreshnessSeconds: freshness, dataSource: "Yahoo Finance + Google News RSS + IDX disclosure",
      executionAllowed: true, analysisOnly: false,
      realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
      portfolioSnapshot,
      riskSnapshot: { riskGuard: guard, fundamentalContext, strategyContext, swingPlan, swingQuality, starter: isStarter, starterReason, starterSizeMultiplier, learning: learningAdj, learningAllocMultiplier } as any,
      dataQuality, warnings: [...warnings, ...guard.warnings, ...(isStarter ? ["starter_paper_trade"] : []), ...((learningAdj?.cautionFlags as string[]) ?? [])],
      strategyName: isStarter ? (swingPlan ? "swing_max_starter" : "controlled_paper_exploration") : (swingPlan ? "swing_max" : strategyName),
      setupType: swingPlan ? swingPlan.entryType : strategyName,
      marketRegime: marketRegimeLabel,
      signalSource: swingPlan ? "swing_max_engine" : (autoGate ? "autonomous_scanner" : "manual_strategy_mode"),
      strategyContext,
    };
  }


  return emptySnap(sym, `Tidak ada setup yang memenuhi syarat (composite ${(composite*100).toFixed(0)}%). ${calib.reason}`, {
    confidence, rawConfidence, calibrationReason: calib.reason,
    realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
    portfolioSnapshot, dataFreshnessSeconds: freshness,
    dataSource: "Yahoo Finance + public news feed",
    dataQuality,
    strategyName, marketRegime: marketRegimeLabel, strategyContext,
  });
}
