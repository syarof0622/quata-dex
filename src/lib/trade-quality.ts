// Trade Quality Scoring (pure, no DB). 0–100, with reason codes.
// Used by the loss-protection guard before allowing a BUY. Inputs are computed
// upstream in the decision engine from real market data; this module just
// translates them into a transparent score + label + reason codes.

export type TradeQualityInputs = {
  // Trend / technicals
  techScore: number | null;            // -100..100
  techLabel?: string | null;            // BUY/HOLD/SELL
  trend?: "bullish" | "bearish" | "neutral" | null;
  aboveShortMA?: boolean | null;
  aboveMediumMA?: boolean | null;
  breakout?: boolean | null;
  // Volume / liquidity
  volumeConfirmed?: boolean | null;
  valueTradedIDR?: number | null;
  // Relative strength / sector rotation
  sectorRotation?: string | null;       // leading|rotating_in|neutral|rotating_out|lagging
  // Market regime
  marketRegime?: string | null;
  ihsgBias?: "bullish" | "bearish" | "neutral" | null;
  // Volatility / risk fit
  volatilityLabel?: "low" | "medium" | "high" | null;
  // News / sentiment
  newsBias?: number | null;             // -∞..∞ (reliability-weighted)
  negativeDisclosure?: boolean | null;
  sentScore?: number | null;            // -1..1
  // Risk/reward
  riskRewardRatio?: number | null;
  stopDistancePct?: number | null;      // %
  // Loss history / cooldown
  symbolLossStreak?: number | null;
  symbolCooldownActive?: boolean | null;
  recentSymbolWinRate?: number | null;  // 0..1
  // Data freshness
  dataFreshnessSeconds?: number | null;
  dataQualityScore?: number | null;     // 0..100
};

export type TradeQualityResult = {
  score: number;                        // 0..100
  label: "excellent" | "strong" | "ok" | "weak" | "avoid";
  reasonCodes: string[];                // positive / negative tags
};

export function calculateTradeQualityScore(i: TradeQualityInputs): TradeQualityResult {
  let score = 50;
  const codes: string[] = [];

  // Trend & technicals (max ±20)
  const tech = Number(i.techScore ?? 0);
  if (tech >= 40) { score += 14; codes.push("strong_uptrend"); }
  else if (tech >= 15) { score += 8; codes.push("uptrend"); }
  else if (tech <= -40) { score -= 16; codes.push("strong_downtrend"); }
  else if (tech <= -15) { score -= 10; codes.push("downtrend"); }
  if (i.aboveShortMA) { score += 3; codes.push("above_short_ma"); } else if (i.aboveShortMA === false) { score -= 4; codes.push("below_short_ma"); }
  if (i.aboveMediumMA) { score += 3; codes.push("above_medium_ma"); } else if (i.aboveMediumMA === false) { score -= 5; codes.push("below_medium_ma"); }
  if (i.breakout) { score += 5; codes.push("breakout_confirmed"); }

  // Volume / liquidity (max +6 / -10)
  if (i.volumeConfirmed) { score += 5; codes.push("volume_confirmed"); }
  else if (i.volumeConfirmed === false) { score -= 3; codes.push("weak_volume"); }
  const vIDR = Number(i.valueTradedIDR ?? 0);
  if (vIDR > 0 && vIDR < 1e9) { score -= 7; codes.push("low_liquidity"); }

  // Sector rotation
  switch (i.sectorRotation) {
    case "leading": score += 6; codes.push("sector_leading"); break;
    case "rotating_in": score += 4; codes.push("sector_rotating_in"); break;
    case "rotating_out": score -= 6; codes.push("sector_rotating_out"); break;
    case "lagging": score -= 4; codes.push("sector_lagging"); break;
  }

  // Market regime (risk-off gates)
  const regime = String(i.marketRegime ?? "").toLowerCase();
  const riskOff = /risk_off|bear|defensive|crash/.test(regime);
  if (riskOff) {
    score -= 8; codes.push("regime_risk_off");
    if (tech < 25) { score -= 5; codes.push("weak_setup_in_risk_off"); }
  }
  if (i.ihsgBias === "bearish") { score -= 3; codes.push("ihsg_bearish"); }
  else if (i.ihsgBias === "bullish") { score += 3; codes.push("ihsg_bullish"); }

  // Volatility fit
  if (i.volatilityLabel === "high") { score -= 5; codes.push("high_volatility"); }
  else if (i.volatilityLabel === "low") { score += 2; codes.push("calm_volatility"); }

  // News / sentiment
  const nb = Number(i.newsBias ?? 0);
  if (nb >= 1.5) { score += 5; codes.push("positive_news_bias"); }
  else if (nb <= -1.5) { score -= 8; codes.push("negative_news_bias"); }
  if (i.negativeDisclosure) { score -= 12; codes.push("negative_disclosure"); }
  const ss = Number(i.sentScore ?? 0);
  if (ss <= -0.3) { score -= 4; codes.push("bearish_sentiment"); }
  else if (ss >= 0.3) { score += 3; codes.push("bullish_sentiment"); }

  // Risk / reward
  const rr = Number(i.riskRewardRatio ?? 0);
  if (rr >= 2.5) { score += 8; codes.push("excellent_rr"); }
  else if (rr >= 2.0) { score += 5; codes.push("good_rr"); }
  else if (rr > 0 && rr < 1.2) { score -= 10; codes.push("poor_rr"); }
  const sd = Number(i.stopDistancePct ?? 0);
  if (sd > 0 && sd < 1.0) { score -= 6; codes.push("stop_too_tight"); }
  if (sd > 8) { score -= 4; codes.push("stop_too_wide"); }

  // Loss history / cooldown for this symbol
  const streak = Number(i.symbolLossStreak ?? 0);
  if (streak >= 3) { score -= 15; codes.push("symbol_loss_streak_3"); }
  else if (streak >= 2) { score -= 8; codes.push("symbol_loss_streak_2"); }
  else if (streak >= 1) { score -= 3; codes.push("symbol_recent_loss"); }
  if (i.symbolCooldownActive) { score -= 20; codes.push("symbol_cooldown_active"); }
  const wr = Number(i.recentSymbolWinRate ?? -1);
  if (wr >= 0) {
    if (wr >= 0.55) { score += 5; codes.push("symbol_wr_good"); }
    else if (wr <= 0.30) { score -= 6; codes.push("symbol_wr_poor"); }
  }

  // Data freshness / quality
  const fr = Number(i.dataFreshnessSeconds ?? 0);
  if (fr > 900) { score -= 6; codes.push("data_stale"); }
  const dq = Number(i.dataQualityScore ?? 100);
  if (dq < 60) { score -= 8; codes.push("low_data_quality"); }

  // Clamp & label
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label: TradeQualityResult["label"] =
    score >= 85 ? "excellent" :
    score >= 75 ? "strong" :
    score >= 65 ? "ok" :
    score >= 50 ? "weak" : "avoid";

  return { score, label, reasonCodes: codes };
}

/** Per aggression-mode quality threshold floor (per patch spec). */
export const QUALITY_THRESHOLDS: Record<string, number> = {
  conservative: 80,
  balanced: 75,
  progressive: 72,
  expert_paper: 70,
  research_max: 68,
  expert_research: 70,
  swing_max: 78,
};

export function qualityThresholdFor(mode: string | null | undefined): number {
  const key = String(mode ?? "balanced").toLowerCase();
  return QUALITY_THRESHOLDS[key] ?? 75;
}
