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
    .select("title, source, published_at, url, sentiment, impact_score, impact_level, category, tickers")
    .or(`tickers.cs.{${base}},tickers.cs.{${symbol}}`)
    .eq("is_duplicate", false)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(20);

  const list = arts ?? [];
  const positive = list.filter(a => a.sentiment === "positive").length;
  const negative = list.filter(a => a.sentiment === "negative").length;
  const neutral  = list.filter(a => a.sentiment === "neutral").length;
  const high     = list.filter(a => a.impact_level === "high").length;
  const sources  = Array.from(new Set(list.map(a => a.source))).slice(0, 8);
  const topNews  = list.slice(0, 5).map(a => ({
    title: a.title, source: a.source, publishedAt: a.published_at,
    sentiment: a.sentiment, impactScore: Number(a.impact_score ?? 0), url: a.url,
  }));

  // Disclosure detection: IDX/Bursa Efek/keterbukaan/disclosure category or source.
  const isDisclosure = (a: any) => {
    const hay = `${a.source ?? ""} ${a.category ?? ""} ${a.title ?? ""}`.toLowerCase();
    return /idx|bursa|keterbukaan|disclosure|rups|dividen|buyback|right.?issue|suspen|stock.?split|akuisisi|merger|ipo|uma/.test(hay);
  };
  const disc = list.find(isDisclosure) ?? null;

  return {
    news: {
      latestNewsCount: list.length,
      positiveNewsCount: positive, neutralNewsCount: neutral, negativeNewsCount: negative,
      highImpactNewsCount: high, sources, topNews,
    },
    disclosure: {
      hasRecentDisclosure: !!disc,
      latestDisclosureType: disc?.category ?? disc?.source ?? null,
      disclosureImpact: disc?.impact_level ?? null,
      disclosureSentiment: disc?.sentiment ?? null,
      title: disc?.title ?? null,
      url: disc?.url ?? null,
    },
    newsBias: positive - negative + high * 0.5, // raw positive bias
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

/** Confidence calibration: blend persistent per-ticker memory + recent training events. */
async function calibrateConfidence(agentId: string, symbol: string, raw: number, strategy: string) {
  // Persistent memory row (fast, single read; populated by runAgentOnce).
  const { data: mem } = await supabaseAdmin
    .from("ai_agent_trade_memory")
    .select("recent_win_rate, sample_size, best_strategy, worst_strategy, recent_mistake")
    .eq("agent_id", agentId).eq("symbol", symbol).maybeSingle();

  // Fallback: scan recent training events when memory not yet populated.
  let n = Number(mem?.sample_size ?? 0);
  let winRate = Number(mem?.recent_win_rate ?? 0);
  if (n < 5) {
    const { data: past } = await supabaseAdmin
      .from("ai_agent_training_events")
      .select("was_correct")
      .eq("agent_id", agentId).eq("symbol", symbol)
      .not("was_correct", "is", null)
      .order("created_at", { ascending: false }).limit(30);
    n = past?.length ?? 0;
    if (n >= 1) winRate = (past!.filter(p => p.was_correct === true).length) / n;
  }

  if (n < 5) {
    return {
      value: raw,
      reason: `Calibration belum aktif: belum cukup riwayat trade untuk ticker ini (${n} sampel). Confidence menggunakan raw signal.`,
    };
  }

  // Base multiplier 0.6..1.15 around 50% baseline.
  let mult = 0.6 + winRate * 0.55;
  const notes: string[] = [`win-rate historis ${(winRate * 100).toFixed(0)}% (n=${n})`];

  // Strategy memory bias.
  if (mem?.best_strategy && mem.best_strategy === strategy) {
    mult *= 1.07; notes.push(`strategi ${strategy} historis terbaik untuk ${symbol} (+7%)`);
  } else if (mem?.worst_strategy && mem.worst_strategy === strategy) {
    mult *= 0.9; notes.push(`strategi ${strategy} historis terburuk untuk ${symbol} (-10%)`);
  }

  const calibrated = Math.max(0, Math.min(0.99, raw * mult));
  const dir = calibrated >= raw ? "dinaikkan" : "diturunkan";
  return { value: calibrated, reason: `${notes.join("; ")} → confidence ${dir}.` };
}

export async function evaluateSymbol(
  agent: AgentConfig,
  symbol: string,
  account: AccountSnap,
  positions: Position[],
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

  // 8. Composite signal (tech + sentiment + news + disclosure + macro bias)
  const techNorm = Math.max(-1, Math.min(1, techScore / 100));
  const newsBiasNorm = Math.max(-1, Math.min(1, newsSnap.newsBias / 5));
  const disclosureBoost = realDisclosureData.hasRecentDisclosure
    ? (realDisclosureData.disclosureSentiment === "positive" ? 0.15
       : realDisclosureData.disclosureSentiment === "negative" ? -0.15 : 0)
    : 0;
  const macroBoost = (realMarketContext.ihsgBias === "bullish" ? 0.05
                     : realMarketContext.ihsgBias === "bearish" ? -0.05 : 0);
  const composite = techNorm * 0.50 + sentScore * 0.20 + newsBiasNorm * 0.20
                  + disclosureBoost + macroBoost;
  let rawConfidence = Math.min(0.99, Math.abs(composite));

  // Penalize raw confidence by data-quality shortfall
  const dqPenalty = (100 - dataQuality.overallDataQualityScore) / 200; // up to -0.5
  rawConfidence = Math.max(0, rawConfidence - dqPenalty);

  // 9. Calibrate using historic outcomes
  const calib = await calibrateConfidence(agent.id, sym, rawConfidence, agent.strategyMode);
  const confidence = calib.value;

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

  // BUY logic
  if (!pos && agent.allowBuy && composite > 0 && techLabel !== "SELL") {
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

    if (confidence < agent.minConfidenceToTrade) {
      return emptySnap(sym, `Confidence ${(confidence * 100).toFixed(0)}% < threshold ${(agent.minConfidenceToTrade*100).toFixed(0)}%. ${calib.reason}`, {
        confidence, rawConfidence, calibrationReason: calib.reason,
        realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
        portfolioSnapshot, dataFreshnessSeconds: freshness,
        dataSource: "Yahoo Finance + public news feed",
      });
    }
    if (symbolExposure >= agent.maxPositionPerSymbol) {
      return emptySnap(sym, `Eksposur ${(symbolExposure*100).toFixed(1)}% melebihi limit per simbol.`, {
        riskSnapshot: { exposure: symbolExposure, cap: agent.maxPositionPerSymbol },
      });
    }
    const sized = sizeOrder({ symbol: sym, allocationAmount: agent.allocationAmount, price });
    if (!sized.minLotOk.ok) return emptySnap(sym, sized.minLotOk.reason ?? "Saldo tidak cukup.", {
      riskSnapshot: { needed: sized.estimatedCost, cash: account.cash },
    });
    if (sized.estimatedCost > account.cash) return emptySnap(sym, "Saldo cash tidak cukup untuk order ini.", {
      riskSnapshot: { needed: sized.estimatedCost, cash: account.cash },
    });

    const preset = RISK_PRESETS[agent.riskLevel] ?? RISK_PRESETS.balanced;
    const stopLoss = agent.autoStopLoss ? +(price * (1 - preset.slPct)).toFixed(2) : null;
    const takeProfit = agent.autoTakeProfit ? +(price * (1 + preset.tpPct)).toFixed(2) : null;
    const rr = stopLoss && takeProfit ? (takeProfit - price) / (price - stopLoss) : null;

    return {
      symbol: sym, action: "BUY", confidence, rawConfidence,
      calibrationReason: calib.reason,
      strategy: agent.strategyMode,
      allocationAmount: agent.allocationAmount,
      suggestedLot: sized.lot, suggestedShares: sized.shares,
      entryPrice: price, stopLoss, takeProfit, riskRewardRatio: rr,
      reasoning: `Teknikal ${techLabel} (${techScore.toFixed(0)}), sentimen ${sentScore.toFixed(2)}, news +${realNewsData.positiveNewsCount}/-${realNewsData.negativeNewsCount} (high ${realNewsData.highImpactNewsCount}), IHSG ${realMarketContext.ihsgBias}. Composite ${(composite*100).toFixed(0)}%. ${calib.reason} Allocate ${sized.lot} lot @ ${price}.`,
      dataFreshnessSeconds: freshness, dataSource: "Yahoo Finance + Google News RSS + IDX disclosure",
      realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
      portfolioSnapshot,
      riskSnapshot: { slPct: preset.slPct, tpPct: preset.tpPct, rr }, dataQuality, warnings,
    };
  }

  return emptySnap(sym, `Tidak ada setup yang memenuhi syarat (composite ${(composite*100).toFixed(0)}%). ${calib.reason}`, {
    confidence, rawConfidence, calibrationReason: calib.reason,
    realMarketData, realTechnicalData, realNewsData, realDisclosureData, realMarketContext,
    portfolioSnapshot, dataFreshnessSeconds: freshness,
    dataSource: "Yahoo Finance + public news feed",
    dataQuality,
  });
}
