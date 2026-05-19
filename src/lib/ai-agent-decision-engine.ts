// AI Trade Agent decision engine. Pure server-side logic, no DB writes.
// Combines price freshness, technical setup, news sentiment, and risk caps
// to produce a single decision per (agent, symbol) call.

import { getQuote } from "./market.functions";
import { getTradeSetup } from "./signals.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sizeOrder, isIDXSymbol, convertSharesToLot } from "./lot-sizing";
import { canExecutePaperTrade, getIDXMarketSession } from "./idx-market-session";

export type AgentAction = "BUY" | "SELL" | "HOLD" | "EXIT";

export type AgentDecision = {
  symbol: string;
  action: AgentAction;
  confidence: number;
  strategy: string;
  allocationAmount: number;
  suggestedLot: number;
  suggestedShares: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  reasoning: string;
  dataSnapshot: Record<string, unknown>;
  technicalSnapshot: Record<string, unknown>;
  sentimentSnapshot: Record<string, unknown>;
  portfolioSnapshot: Record<string, unknown>;
  riskSnapshot: Record<string, unknown>;
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
};

export type Position = { symbol: string; qty: number; avg_price: number };
export type AccountSnap = { cash: number; equity: number };

const RISK_PRESETS: Record<string, { slPct: number; tpPct: number }> = {
  conservative: { slPct: 0.015, tpPct: 0.035 },
  balanced:     { slPct: 0.025, tpPct: 0.05 },
  aggressive:   { slPct: 0.04,  tpPct: 0.08 },
};

function hold(symbol: string, reason: string, extra: Partial<AgentDecision> = {}): AgentDecision {
  return {
    symbol, action: "HOLD", confidence: 0, strategy: "guard",
    allocationAmount: 0, suggestedLot: 0, suggestedShares: 0,
    entryPrice: null, stopLoss: null, takeProfit: null, riskRewardRatio: null,
    reasoning: reason,
    dataSnapshot: {}, technicalSnapshot: {}, sentimentSnapshot: {},
    portfolioSnapshot: {}, riskSnapshot: {}, warnings: [reason],
    ...extra,
  };
}

export async function evaluateSymbol(
  agent: AgentConfig,
  symbol: string,
  account: AccountSnap,
  positions: Position[],
): Promise<AgentDecision> {
  const sym = symbol.trim().toUpperCase();

  // 1. Market session guard for IDX symbols
  if (agent.tradingHoursOnly && isIDXSymbol(sym)) {
    const guard = canExecutePaperTrade();
    if (!guard.ok) return hold(sym, guard.reason ?? "Market closed", {
      riskSnapshot: { session: getIDXMarketSession().state },
    });
  }

  // 2. Price + freshness
  let quote: any;
  try { quote = await getQuote({ data: { symbol: sym } }); }
  catch (e: any) { return hold(sym, `Quote unavailable: ${e?.message ?? "error"}`); }
  if (!quote?.price) return hold(sym, "Harga tidak tersedia.");
  const price = Number(quote.price);

  // 3. Technical setup (composite signal + setup quality)
  let setup: any = null;
  try { setup = await getTradeSetup({ data: { symbol: sym, timeframe: "1d" } }); }
  catch { /* tolerate */ }

  // 4. Sentiment (from scraped table)
  const { data: sentRow } = await supabaseAdmin
    .from("ticker_sentiment_summary").select("*").eq("symbol", sym).maybeSingle();

  // 5. Portfolio context
  const pos = positions.find(p => p.symbol === sym);
  const totalEquity = Math.max(1, account.equity);
  const symbolExposure = pos ? (pos.qty * price) / totalEquity : 0;

  // ---- compute composite confidence ----
  const sig = setup?.signal;
  const techScore: number = sig?.score ?? 0; // -100..100 ish
  const techLabel: string = sig?.label ?? "HOLD";
  const sentScore = Number(sentRow?.average_sentiment_score ?? 0); // -1..1
  const techNorm = Math.max(-1, Math.min(1, techScore / 100));
  const composite = techNorm * 0.65 + sentScore * 0.35;
  const confidence = Math.min(0.99, Math.abs(composite));

  const warnings: string[] = [];
  const portfolioSnapshot = { hasPosition: !!pos, exposure: symbolExposure, cash: account.cash };
  const technicalSnapshot = {
    label: techLabel, score: techScore,
    grade: setup?.setup?.quality?.grade ?? null,
    executionStatus: sig?.executionStatus ?? null,
    stopDistancePct: setup?.setup?.stopDistancePct ?? null,
  };
  const sentimentSnapshot = sentRow ? {
    score: sentScore, positive: sentRow.positive_count, negative: sentRow.negative_count,
    summary: sentRow.summary, latest: sentRow.latest_news_at,
  } : { score: 0 };

  // EXIT logic if already holding and tech turns bearish
  if (pos && (composite < -0.2 || techLabel === "SELL")) {
    if (!agent.allowSell) return hold(sym, "Sell disabled untuk agent ini.");
    return {
      symbol: sym, action: "EXIT", confidence,
      strategy: agent.strategyMode,
      allocationAmount: pos.qty * price,
      suggestedLot: convertSharesToLot(pos.qty),
      suggestedShares: pos.qty,
      entryPrice: price, stopLoss: null, takeProfit: null, riskRewardRatio: null,
      reasoning: `Posisi existing dilepas: teknikal ${techLabel} (${techScore.toFixed(0)}), sentimen ${sentScore.toFixed(2)}.`,
      dataSnapshot: { price, prevClose: quote.prevClose },
      technicalSnapshot, sentimentSnapshot, portfolioSnapshot,
      riskSnapshot: { exposure: symbolExposure }, warnings,
    };
  }

  // BUY logic
  if (!pos && agent.allowBuy && composite > 0 && techLabel !== "SELL") {
    if (confidence < agent.minConfidenceToTrade) {
      return hold(sym, `Confidence ${(confidence * 100).toFixed(0)}% < threshold ${(agent.minConfidenceToTrade*100).toFixed(0)}%.`, {
        confidence, technicalSnapshot, sentimentSnapshot, portfolioSnapshot,
      });
    }
    if (symbolExposure >= agent.maxPositionPerSymbol) {
      return hold(sym, `Eksposur ${(symbolExposure*100).toFixed(1)}% melebihi limit per simbol.`, {
        riskSnapshot: { exposure: symbolExposure, cap: agent.maxPositionPerSymbol },
      });
    }
    const sized = sizeOrder({ symbol: sym, allocationAmount: agent.allocationAmount, price });
    if (!sized.minLotOk.ok) return hold(sym, sized.minLotOk.reason ?? "Saldo tidak cukup.", {
      riskSnapshot: { needed: sized.estimatedCost, cash: account.cash },
    });
    if (sized.estimatedCost > account.cash) return hold(sym, "Saldo cash tidak cukup untuk order ini.", {
      riskSnapshot: { needed: sized.estimatedCost, cash: account.cash },
    });

    const preset = RISK_PRESETS[agent.riskLevel] ?? RISK_PRESETS.balanced;
    const stopLoss = agent.autoStopLoss ? +(price * (1 - preset.slPct)).toFixed(2) : null;
    const takeProfit = agent.autoTakeProfit ? +(price * (1 + preset.tpPct)).toFixed(2) : null;
    const rr = stopLoss && takeProfit ? (takeProfit - price) / (price - stopLoss) : null;

    return {
      symbol: sym, action: "BUY", confidence,
      strategy: agent.strategyMode,
      allocationAmount: agent.allocationAmount,
      suggestedLot: sized.lot, suggestedShares: sized.shares,
      entryPrice: price, stopLoss, takeProfit, riskRewardRatio: rr,
      reasoning: `Teknikal ${techLabel} (skor ${techScore.toFixed(0)}), sentimen ${sentScore.toFixed(2)}, composite ${(composite*100).toFixed(0)}%. Allocate ${sized.lot} lot @ ${price}.`,
      dataSnapshot: { price, change: quote.change, changePercent: quote.changePercent, volume: quote.volume },
      technicalSnapshot, sentimentSnapshot, portfolioSnapshot,
      riskSnapshot: { slPct: preset.slPct, tpPct: preset.tpPct, rr },
      warnings,
    };
  }

  return hold(sym, `Tidak ada setup yang memenuhi syarat (composite ${(composite*100).toFixed(0)}%).`, {
    confidence, technicalSnapshot, sentimentSnapshot, portfolioSnapshot,
  });
}
