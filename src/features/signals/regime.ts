import type { Candle } from "@/lib/indicators";
import { ema, atr } from "@/lib/indicators";
import { adx, swingPivots, trendStructure, obvTrend } from "./ta-extras";

export type MarketRegime = {
  trend: "bullish" | "bearish" | "sideways";
  strength: number;          // 0..100
  volatility: "low" | "medium" | "high";
  atrPct: number;
  phase: "accumulation" | "distribution" | "trending" | "ranging";
  bestStrategy: string;
  notes: string[];
};

export function detectRegime(c: Candle[]): MarketRegime {
  const notes: string[] = [];
  if (c.length < 60) {
    return {
      trend: "sideways", strength: 0, volatility: "high", atrPct: 0,
      phase: "ranging", bestStrategy: "Wait for clearer setup",
      notes: ["Not enough data"],
    };
  }
  const closes = c.map(x => x.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const last = closes.length - 1;

  const piv = swingPivots(c, 3, 3);
  const struct = trendStructure(piv);
  const adxRes = adx(c, 14);
  const adxNow = adxRes.adx[adxRes.adx.length - 1];
  const adxStrength = isNaN(adxNow) ? 0 : Math.min(100, adxNow * 2);

  const aboveStack = e20[last] > e50[last] && closes[last] > e20[last];
  const belowStack = e20[last] < e50[last] && closes[last] < e20[last];

  let trend: MarketRegime["trend"] = "sideways";
  if (aboveStack && struct === "uptrend") { trend = "bullish"; notes.push("Higher highs & higher lows"); }
  else if (belowStack && struct === "downtrend") { trend = "bearish"; notes.push("Lower highs & lower lows"); }
  else if (adxNow < 20) { trend = "sideways"; notes.push(`ADX ${adxNow.toFixed(1)} indicates range`); }
  else if (aboveStack) trend = "bullish";
  else if (belowStack) trend = "bearish";

  const atrSeries = atr(c, 14);
  const atrPct = (atrSeries[last] / closes[last]) * 100;
  const volLevel: "low" | "medium" | "high" = atrPct < 1.5 ? "low" : atrPct < 3.5 ? "medium" : "high";

  // Phase: combine OBV trend + price action
  const obv = obvTrend(c, 20);
  let phase: MarketRegime["phase"] = "ranging";
  if (trend === "sideways" && obv === "up") phase = "accumulation";
  else if (trend === "sideways" && obv === "down") phase = "distribution";
  else if (adxNow > 25) phase = "trending";

  let bestStrategy = "Wait for confirmation";
  if (trend === "bullish" && phase === "trending") bestStrategy = "Buy on pullback to EMA20/50";
  else if (trend === "bearish" && phase === "trending") bestStrategy = "Short on rally to EMA20/50";
  else if (phase === "accumulation") bestStrategy = "Watch for breakout — accumulation in progress";
  else if (phase === "distribution") bestStrategy = "Defensive — distribution detected";
  else if (volLevel === "high") bestStrategy = "Reduce size — extreme volatility";
  else if (trend === "sideways") bestStrategy = "Range-trade between S/R, avoid breakouts";

  return {
    trend,
    strength: Math.round(adxStrength),
    volatility: volLevel,
    atrPct,
    phase,
    bestStrategy,
    notes,
  };
}
