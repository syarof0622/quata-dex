import type { Candle } from "@/lib/indicators";
import { ema, rsi, macd, atr } from "@/lib/indicators";
import {
  adx, stochastic, bbSqueeze, rsiDivergence, detectPatterns,
  relativeVolume, obvTrend, swingPivots, trendStructure,
} from "./ta-extras";
import { detectSRZones, nearestZones } from "./sr-engine";
import { detectRegime, type MarketRegime } from "./regime";

export type SignalLabelV2 = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
export type TradingStyle = "scalping" | "intraday" | "swing" | "position";

export type FactorScores = {
  trend: number;       // -100..100
  momentum: number;
  volume: number;
  priceAction: number;
  volatility: number;  // negative = unfavorable conditions
};

export type DataQuality = "high" | "medium" | "low";

export type CompositeSignal = {
  symbol: string;
  timeframe: string;
  price: number;
  label: SignalLabelV2;
  score: number;            // -100..100
  confidence: number;       // 0..100
  risk: number;             // 0..100
  trendStrength: number | null;    // 0..100 (raw ADX) or null when insufficient data
  trendStrengthLabel: "Weak" | "Developing" | "Strong" | "Very Strong" | "Extreme" | "N/A";
  trendStrengthWarning?: string;
  riskLabel: "Low" | "Medium" | "High" | "Extreme";
  confidenceLabel: "Low" | "Moderate" | "High" | "Very High";
  volatilityLevel: "low" | "medium" | "high";
  recommendedStyle: TradingStyle;
  probContinuation: number | null; // 0..100
  probReversal: number | null;     // 0..100
  factors: FactorScores;
  bullishFactors: string[];
  bearishFactors: string[];
  neutralFactors: string[];
  invalidations: string[];
  regime: MarketRegime;
  patterns: { name: string; bias: string; strength: string }[];
  dataQuality: DataQuality;
  dataNotes: string[];
  riskDrivers: string[];
  rebound: { active: boolean; reason: string | null };
  dailyChangePct: number;
  extendedRally: boolean;
  executionStatus: "Ready to Trade" | "Wait for Pullback" | "Wait for Breakout" | "Wait for Confirmation" | "No Trade";
  executionReason: string;
  computedAt: string;
};

function clampScore(n: number) { return Math.max(-100, Math.min(100, n)); }

function computeFactors(c: Candle[]) {
  const closes = c.map(x => x.close);
  const last = closes.length - 1;
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = adx(c, 14);
  const st = stochastic(c, 14, 3);
  const sq = bbSqueeze(closes, 20, 100);
  const div = rsiDivergence(c);
  const piv = swingPivots(c, 3, 3);
  const struct = trendStructure(piv);
  const patterns = detectPatterns(c).filter(p => p.index >= last - 2);
  const relVol = relativeVolume(c, 20);
  const obv = obvTrend(c, 20);
  const atrSeries = atr(c, 14);
  const atrPct = (atrSeries[last] / closes[last]) * 100;

  const bullish: string[] = [], bearish: string[] = [], neutral: string[] = [], invalid: string[] = [];

  // ---- Trend ----
  let trend = 0;
  if (e20[last] > e50[last]) { trend += 25; bullish.push("EMA20 > EMA50"); }
  else { trend -= 25; bearish.push("EMA20 < EMA50"); }
  if (!isNaN(e200[last])) {
    if (closes[last] > e200[last]) { trend += 15; bullish.push("Price above EMA200"); }
    else { trend -= 15; bearish.push("Price below EMA200"); }
  }
  if (struct === "uptrend") { trend += 20; bullish.push("Higher highs & higher lows"); }
  else if (struct === "downtrend") { trend -= 20; bearish.push("Lower highs & lower lows"); }
  else neutral.push("No clear swing structure");
  const adxRaw = a.adx[a.adx.length - 1];
  const adxNow = (typeof adxRaw === "number" && isFinite(adxRaw) && adxRaw >= 0 && adxRaw <= 100) ? adxRaw : NaN;
  if (!isNaN(adxNow)) {
    if (adxNow > 25) {
      const dir = a.plusDI[a.plusDI.length - 1] > a.minusDI[a.minusDI.length - 1] ? 1 : -1;
      trend += dir * 15;
      (dir > 0 ? bullish : bearish).push(`ADX ${adxNow.toFixed(0)} (${dir > 0 ? "+DI" : "-DI"} dominant)`);
    } else neutral.push(`ADX ${adxNow.toFixed(0)} (weak trend)`);
  } else {
    neutral.push("ADX unavailable");
  }
  trend = clampScore(trend);

  // ---- Momentum ----
  let mom = 0;
  const rsiNow = r[last];
  if (!isNaN(rsiNow)) {
    if (rsiNow < 30) { mom += 18; bullish.push(`RSI oversold ${rsiNow.toFixed(0)}`); }
    else if (rsiNow > 70) { mom -= 18; bearish.push(`RSI overbought ${rsiNow.toFixed(0)}`); invalid.push("RSI > 75"); }
    else if (rsiNow > 55) { mom += 8; bullish.push(`RSI bullish ${rsiNow.toFixed(0)}`); }
    else if (rsiNow < 45) { mom -= 8; bearish.push(`RSI bearish ${rsiNow.toFixed(0)}`); }
  }
  if (m.hist[last] > 0 && m.hist[last - 1] <= 0) { mom += 20; bullish.push("MACD bullish crossover"); }
  else if (m.hist[last] < 0 && m.hist[last - 1] >= 0) { mom -= 20; bearish.push("MACD bearish crossover"); }
  else if (m.hist[last] > m.hist[last - 1]) mom += 5;
  else mom -= 5;
  const kNow = st.k[st.k.length - 1];
  if (!isNaN(kNow)) {
    if (kNow < 20) { mom += 6; bullish.push(`Stoch %K oversold ${kNow.toFixed(0)}`); }
    else if (kNow > 80) { mom -= 6; bearish.push(`Stoch %K overbought ${kNow.toFixed(0)}`); }
  }
  if (div === "bullish") { mom += 18; bullish.push("Bullish RSI divergence"); }
  if (div === "bearish") { mom -= 18; bearish.push("Bearish RSI divergence"); }
  mom = clampScore(mom);

  // ---- Volume ----
  let vol = 0;
  const lastBull = closes[last] > closes[last - 1];
  if (relVol > 2) { vol += (lastBull ? 25 : -25); (lastBull ? bullish : bearish).push(`Volume ${relVol.toFixed(1)}x avg`); }
  else if (relVol > 1.5) { vol += (lastBull ? 15 : -15); (lastBull ? bullish : bearish).push(`Volume ${relVol.toFixed(1)}x avg`); }
  else if (relVol < 0.6) { vol -= 5; neutral.push(`Volume thin (${relVol.toFixed(1)}x)`); }
  if (obv === "up") { vol += 15; bullish.push("OBV trending up"); }
  else if (obv === "down") { vol -= 15; bearish.push("OBV trending down"); }
  vol = clampScore(vol);

  // ---- Price action (patterns + S/R reaction) ----
  let pa = 0;
  for (const p of patterns) {
    const w = p.strength === "high" ? 18 : p.strength === "medium" ? 10 : 4;
    if (p.bias === "bullish") { pa += w; bullish.push(`${p.name}`); }
    else if (p.bias === "bearish") { pa -= w; bearish.push(`${p.name}`); }
    else neutral.push(p.name);
  }
  pa = clampScore(pa);

  // ---- Volatility (modifier; high vol reduces confidence) ----
  let volat = 0;
  if (atrPct > 5) { volat -= 30; bearish.push(`Extreme volatility ATR% ${atrPct.toFixed(1)}`); invalid.push("Volatility expanding > 6%"); }
  else if (atrPct > 3) { volat -= 10; neutral.push(`Elevated volatility ATR% ${atrPct.toFixed(1)}`); }
  else if (atrPct < 0.8) { volat -= 5; neutral.push(`Compressed volatility ATR% ${atrPct.toFixed(1)}`); }
  if (sq.squeezing) { volat += 10; neutral.push("BB squeeze — breakout pending"); }

  // ADX raw value (0..~60 typical, 100 theoretical max). Don't multiply.
  const adxValue = isNaN(adxNow) ? null : Math.max(0, Math.min(100, adxNow));

  return {
    factors: { trend, momentum: mom, volume: vol, priceAction: pa, volatility: volat },
    bullish, bearish, neutral, invalid, patterns,
    adxValue,
    atrPct,
    relVol,
  };
}

function pickStyle(timeframe: string, regime: MarketRegime): TradingStyle {
  const tf = timeframe.toLowerCase();
  if (tf.includes("m") && !tf.includes("mo")) return "scalping";
  if (tf === "1h" || tf === "4h") return regime.phase === "trending" ? "intraday" : "scalping";
  if (tf === "1d") return regime.trend === "sideways" ? "swing" : "swing";
  return "position";
}

export function compositeSignal(
  c: Candle[],
  symbol: string,
  timeframe: string,
  mtfBias?: number, // -100..100 from higher timeframes
): CompositeSignal {
  const last = c[c.length - 1];
  const f = computeFactors(c);
  const regime = detectRegime(c);

  // ---- Data quality assessment ----
  const dataNotes: string[] = [];
  let dq: DataQuality = "high";
  if (c.length < 60) { dq = "low"; dataNotes.push(`Only ${c.length} candles available`); }
  else if (c.length < 120) { dq = "medium"; dataNotes.push(`${c.length} candles (limited history)`); }
  const volsKnown = c.slice(-30).filter(x => (x.volume ?? 0) > 0).length;
  if (volsKnown < 15) {
    dq = dq === "high" ? "medium" : "low";
    dataNotes.push("Volume data sparse");
  }
  if (!isFinite(f.atrPct) || f.atrPct === 0) {
    dq = "low";
    dataNotes.push("Volatility unavailable");
  }

  // Weighted composite
  const weights = { trend: 0.30, momentum: 0.25, volume: 0.18, priceAction: 0.17, volatility: 0.10 };
  let score =
    f.factors.trend * weights.trend +
    f.factors.momentum * weights.momentum +
    f.factors.volume * weights.volume +
    f.factors.priceAction * weights.priceAction +
    f.factors.volatility * weights.volatility;

  // MTF alignment bonus/penalty
  if (mtfBias !== undefined) {
    if (Math.sign(mtfBias) === Math.sign(score)) score += Math.sign(score) * 8;
    else score *= 0.7;
  }
  score = clampScore(score);

  // Regime modifier
  if (regime.trend === "sideways" && Math.abs(score) > 25) {
    score *= 0.7; f.neutral.push("Sideways regime dampens directional signal");
  }

  const label: SignalLabelV2 =
    score >= 55 ? "STRONG_BUY" :
    score >= 22 ? "BUY" :
    score <= -55 ? "STRONG_SELL" :
    score <= -22 ? "SELL" : "HOLD";

  // Confidence: magnitude + factor agreement - volatility penalty - data-quality penalty
  const factorVals = Object.values(f.factors);
  const sameSign = factorVals.filter(v => Math.sign(v) === Math.sign(score)).length;
  const agreement = (sameSign / factorVals.length) * 100;
  const volPenalty = f.atrPct > 4 ? 15 : f.atrPct > 3 ? 8 : 0;
  const dqPenalty = dq === "low" ? 25 : dq === "medium" ? 10 : 0;
  const rawConf = 35 + Math.abs(score) * 0.4 + agreement * 0.3 - volPenalty - dqPenalty;
  const confidence = Math.max(15, Math.min(95, rawConf));

  // ---- Risk score: components-based, with explicit drivers ----
  const riskDrivers: string[] = [];
  let baseRisk = 0;
  // ATR / volatility component
  const atrComponent = Math.min(35, f.atrPct * 6);
  baseRisk += atrComponent;
  if (f.atrPct > 4) riskDrivers.push(`Volatility tinggi (ATR ${f.atrPct.toFixed(1)}%)`);
  else if (f.atrPct > 2.5) riskDrivers.push(`Volatility menengah (ATR ${f.atrPct.toFixed(1)}%)`);
  // Regime
  if (regime.volatility === "high") { baseRisk += 18; riskDrivers.push("Regime volatil"); }
  else if (regime.volatility === "medium") { baseRisk += 8; }
  // Choppy / weak conviction
  if (Math.abs(score) < 25) { baseRisk += 8; riskDrivers.push("Sinyal lemah / mixed"); }
  // Volume spike
  if (f.relVol > 3) { baseRisk += 10; riskDrivers.push(`Volume spike ${f.relVol.toFixed(1)}× rata-rata`); }
  // Data quality
  if (dq === "low") { baseRisk += 18; riskDrivers.push("Data quality rendah"); }
  else if (dq === "medium") { baseRisk += 6; riskDrivers.push("Data quality menengah"); }
  // Trend confusion (signal vs trend factor)
  if (f.factors.trend !== 0 && Math.sign(f.factors.trend) !== Math.sign(score)) {
    baseRisk += 6;
    riskDrivers.push("Trend struktur tidak align dengan sinyal");
  }
  // Bear regime + long signal or vice-versa flagged later via setup
  const risk = Math.min(95, Math.max(5, Math.round(baseRisk)));

  // ---- Trend strength: raw ADX value, null when missing or low data ----
  const trendStrength: number | null =
    (dq === "low" || f.adxValue == null) ? null : Math.round(f.adxValue);

  let trendStrengthLabel: CompositeSignal["trendStrengthLabel"];
  let trendStrengthWarning: string | undefined;
  if (trendStrength == null) trendStrengthLabel = "N/A";
  else if (trendStrength <= 20) trendStrengthLabel = "Weak";
  else if (trendStrength <= 40) trendStrengthLabel = "Developing";
  else if (trendStrength <= 60) trendStrengthLabel = "Strong";
  else if (trendStrength <= 80) trendStrengthLabel = "Very Strong";
  else { trendStrengthLabel = "Extreme"; trendStrengthWarning = "Extreme trend reading — verify data quality."; }

  // ---- Rebound detection: SELL signal but price is rebounding intraday/last bars ----
  const c2 = c[c.length - 2];
  const c1 = c[c.length - 1];
  const todayPct = c2 ? ((c1.close - c2.close) / c2.close) * 100 : 0;
  const intradayPct = ((c1.close - c1.open) / c1.open) * 100;
  const last3Bull = c.slice(-3).every(x => x.close >= x.open);
  let reboundActive = false;
  let reboundReason: string | null = null;
  if (label === "SELL" || label === "STRONG_SELL") {
    if (todayPct > 1.5) { reboundActive = true; reboundReason = `Harga rebound +${todayPct.toFixed(1)}% hari ini`; }
    else if (intradayPct > 1.2 && c1.close > c1.open) { reboundActive = true; reboundReason = `Candle hari ini bullish (+${intradayPct.toFixed(1)}% intraday)`; }
    else if (last3Bull && todayPct > 0.5) { reboundActive = true; reboundReason = "3 candle terakhir bullish"; }
  }
  if (label === "BUY" || label === "STRONG_BUY") {
    const last3Bear = c.slice(-3).every(x => x.close <= x.open);
    if (todayPct < -1.5) { reboundActive = true; reboundReason = `Harga turun ${todayPct.toFixed(1)}% hari ini`; }
    else if (intradayPct < -1.2 && c1.close < c1.open) { reboundActive = true; reboundReason = `Candle hari ini bearish (${intradayPct.toFixed(1)}% intraday)`; }
    else if (last3Bear && todayPct < -0.5) { reboundActive = true; reboundReason = "3 candle terakhir bearish"; }
  }

  // Continuation vs reversal probabilities — N/A on HOLD or low-quality
  let probContinuation: number | null;
  let probReversal: number | null;
  if (label === "HOLD" || dq === "low") {
    probContinuation = null;
    probReversal = null;
  } else {
    let pc = 35 + Math.abs(score) * 0.4 + (regime.phase === "trending" ? 15 : 0);
    if (reboundActive) pc -= 15; // rebound lowers continuation
    probContinuation = Math.min(85, Math.max(15, Math.round(pc)));
    probReversal = Math.max(5, 100 - probContinuation - 5);
  }

  const riskLabel: CompositeSignal["riskLabel"] =
    risk <= 30 ? "Low" : risk <= 60 ? "Medium" : risk <= 80 ? "High" : "Extreme";

  const confidenceLabel: CompositeSignal["confidenceLabel"] =
    confidence <= 40 ? "Low" : confidence <= 65 ? "Moderate" : confidence <= 80 ? "High" : "Very High";

  // ---- Daily change & extended-rally / extended-decline detection ----
  const dailyChangePct = c2 ? +(((c1.close - c2.close) / c2.close) * 100).toFixed(2) : 0;
  const extendedRally =
    (label === "BUY" || label === "STRONG_BUY") && dailyChangePct > 5;
  const extendedDecline =
    (label === "SELL" || label === "STRONG_SELL") && dailyChangePct < -5;

  // ---- Execution status (separate from market bias) ----
  let executionStatus: CompositeSignal["executionStatus"];
  let executionReason = "";
  if (label === "HOLD") {
    executionStatus = "No Trade";
    executionReason = "Sinyal arah tidak cukup kuat. Pantau breakout / breakdown.";
  } else if (extendedRally) {
    executionStatus = "Wait for Pullback";
    executionReason = `Harga sudah naik +${dailyChangePct.toFixed(1)}% hari ini — hindari chasing.`;
  } else if (extendedDecline) {
    executionStatus = "Wait for Pullback";
    executionReason = `Harga sudah turun ${dailyChangePct.toFixed(1)}% hari ini — hindari short late.`;
  } else if (reboundActive) {
    executionStatus = "Wait for Confirmation";
    executionReason = reboundReason || "Counter-move sedang berlangsung.";
  } else if (regime.phase === "ranging" || regime.phase === "accumulation" || regime.phase === "distribution") {
    executionStatus = "Wait for Breakout";
    executionReason = `Regime ${regime.phase} — tunggu breakout dengan volume.`;
  } else if (confidence < 60 || (trendStrength != null && trendStrength < 20)) {
    executionStatus = "Wait for Confirmation";
    executionReason = "Confidence/trend belum cukup kuat untuk entry agresif.";
  } else {
    executionStatus = "Ready to Trade";
    executionReason = "Bias dan trigger selaras — eksekusi per plan.";
  }

  return {
    symbol,
    timeframe,
    price: last.close,
    label,
    score: Math.round(score),
    confidence: Math.round(confidence),
    risk,
    trendStrength,
    trendStrengthLabel,
    trendStrengthWarning,
    riskLabel,
    confidenceLabel,
    volatilityLevel: regime.volatility,
    recommendedStyle: pickStyle(timeframe, regime),
    probContinuation,
    probReversal,
    factors: f.factors,
    bullishFactors: f.bullish,
    bearishFactors: f.bearish,
    neutralFactors: f.neutral,
    invalidations: f.invalid,
    regime,
    patterns: f.patterns.map(p => ({ name: p.name, bias: p.bias, strength: p.strength })),
    dataQuality: dq,
    dataNotes,
    riskDrivers,
    rebound: { active: reboundActive, reason: reboundReason },
    dailyChangePct,
    extendedRally: extendedRally || extendedDecline,
    executionStatus,
    executionReason,
    computedAt: new Date().toISOString(),
  };
}

// ---------- Smart Trade Setup ----------
export type TradeSetup = {
  bias: "long" | "short" | "neutral";
  entryAggressive: number | null;
  entryConservative: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  invalidation: number | null;
  trailingStop: string;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  rrTp1: number | null;
  rrTp2: number | null;
  rrTp3: number | null;
  riskPerTradePct: number;
  suggestedAllocationPct: number;
  notes: string[];
  quality: TradeSetupQuality;
  stopDistancePct: number;
  conditional: boolean;
  conditionalReason: string | null;
  microcopy: string | null;
  riskDrivers: string[];
};

export type TradeSetupGrade = "Poor" | "Fair" | "Good" | "Excellent";
export type TradeSetupQuality = {
  grade: TradeSetupGrade;
  score: number; // 0..100
  reasons: { label: string; ok: boolean; detail: string }[];
  summary: string;
};

function gradeTradeSetup(args: {
  signal: CompositeSignal;
  rrTp1: number | null;
  rrTp2: number | null;
  riskPct: number; // risk/price *100
  hasSupport: boolean;
  hasResistance: boolean;
  long: boolean;
  atrPct: number; // atr/price *100
}): TradeSetupQuality {
  const { signal, rrTp1, rrTp2, riskPct, hasSupport, hasResistance, long, atrPct } = args;
  const reasons: { label: string; ok: boolean; detail: string }[] = [];
  let score = 0;

  // 1. Risk/Reward (max 25)
  const rr1 = rrTp1 ?? 0;
  if (rr1 >= 2) { score += 25; reasons.push({ label: "Risk/Reward", ok: true, detail: `TP1 R:R ${rr1.toFixed(2)} ≥ 2.0 (excellent)` }); }
  else if (rr1 >= 1.5) { score += 18; reasons.push({ label: "Risk/Reward", ok: true, detail: `TP1 R:R ${rr1.toFixed(2)} ≥ 1.5 (acceptable)` }); }
  else if (rr1 >= 1) { score += 8; reasons.push({ label: "Risk/Reward", ok: false, detail: `TP1 R:R ${rr1.toFixed(2)} < 1.5 (weak edge)` }); }
  else { reasons.push({ label: "Risk/Reward", ok: false, detail: `TP1 R:R ${rr1.toFixed(2)} < 1.0 (negative edge)` }); }

  // 2. Confidence (max 20)
  const conf = signal.confidence;
  if (conf >= 75) { score += 20; reasons.push({ label: "Confidence", ok: true, detail: `${conf}/100 — strong factor agreement` }); }
  else if (conf >= 60) { score += 14; reasons.push({ label: "Confidence", ok: true, detail: `${conf}/100 — moderate agreement` }); }
  else if (conf >= 45) { score += 7; reasons.push({ label: "Confidence", ok: false, detail: `${conf}/100 — low conviction` }); }
  else { reasons.push({ label: "Confidence", ok: false, detail: `${conf}/100 — factors conflict` }); }

  // 3. Trend alignment (max 15)
  const ts = signal.trendStrength ?? 0;
  if (ts >= 25) { score += 15; reasons.push({ label: "Trend strength", ok: true, detail: `ADX ${ts.toFixed(0)} — trending market` }); }
  else if (ts >= 18) { score += 9; reasons.push({ label: "Trend strength", ok: true, detail: `ADX ${ts.toFixed(0)} — developing trend` }); }
  else { reasons.push({ label: "Trend strength", ok: false, detail: `ADX ${ts.toFixed(0)} — choppy/ranging` }); }

  // 4. Regime fit (max 10)
  const reg = signal.regime;
  const regOk = (long && reg.trend === "bullish") || (!long && reg.trend === "bearish");
  if (regOk && reg.phase === "trending") { score += 10; reasons.push({ label: "Regime", ok: true, detail: `${reg.trend} & trending — supports ${long ? "long" : "short"}` }); }
  else if (regOk) { score += 7; reasons.push({ label: "Regime", ok: true, detail: `${reg.trend} ${reg.phase} — aligned with ${long ? "long" : "short"}` }); }
  else if (reg.phase === "ranging" || reg.phase === "accumulation" || reg.phase === "distribution") { score += 4; reasons.push({ label: "Regime", ok: false, detail: `${reg.phase} — wait for confirmation` }); }
  else { reasons.push({ label: "Regime", ok: false, detail: `${reg.trend}/${reg.phase} conflicts with ${long ? "long" : "short"} bias` }); }

  // 5. Data quality (max 10)
  if (signal.dataQuality === "high") { score += 10; reasons.push({ label: "Data quality", ok: true, detail: "Sufficient history & sources" }); }
  else if (signal.dataQuality === "medium") { score += 5; reasons.push({ label: "Data quality", ok: false, detail: "Partial data — treat with caution" }); }
  else { reasons.push({ label: "Data quality", ok: false, detail: "Low — not enough history" }); }

  // 6. S/R structure (max 10)
  const srOk = long ? hasSupport : hasResistance;
  if (srOk && (long ? hasResistance : hasSupport)) { score += 10; reasons.push({ label: "S/R structure", ok: true, detail: "Clear invalidation & target levels" }); }
  else if (srOk) { score += 6; reasons.push({ label: "S/R structure", ok: true, detail: long ? "Support found, no clean resistance" : "Resistance found, no clean support" }); }
  else { reasons.push({ label: "S/R structure", ok: false, detail: "No clear S/R — using ATR fallback" }); }

  // 7. Risk size sanity (max 10) — risk should be 0.5%–4% of price
  if (riskPct > 0 && riskPct <= 2) { score += 10; reasons.push({ label: "Stop distance", ok: true, detail: `Risk ${riskPct.toFixed(2)}% of price — tight & efficient` }); }
  else if (riskPct <= 4) { score += 6; reasons.push({ label: "Stop distance", ok: true, detail: `Risk ${riskPct.toFixed(2)}% — acceptable` }); }
  else if (riskPct <= 7) { score += 2; reasons.push({ label: "Stop distance", ok: false, detail: `Risk ${riskPct.toFixed(2)}% — wide stop, reduce size` }); }
  else { reasons.push({ label: "Stop distance", ok: false, detail: `Risk ${riskPct.toFixed(2)}% — too wide, poor R:R math` }); }

  // Penalties
  if (signal.volatilityLevel === "high" && atrPct > 5) {
    score -= 5;
    reasons.push({ label: "Volatility", ok: false, detail: `ATR ${atrPct.toFixed(2)}% — expect whipsaws` });
  }
  if ((signal.probReversal ?? 0) > 60) {
    score -= 5;
    reasons.push({ label: "Reversal risk", ok: false, detail: `Reversal probability ${signal.probReversal}% — late in move` });
  }
  if (signal.rebound?.active) {
    score -= 8;
    reasons.push({ label: "Counter-move", ok: false, detail: signal.rebound.reason || "Price moving against signal direction" });
  }
  if (signal.trendStrength == null) {
    score -= 5;
    reasons.push({ label: "Trend strength", ok: false, detail: "ADX tidak tersedia — trend invalid" });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---- HARD CAPS ----
  // Stop distance > 10% → max Fair (cap 59); > 20% → max Poor (cap 39)
  if (riskPct > 20) score = Math.min(score, 39);
  else if (riskPct > 10) score = Math.min(score, 59);
  // R:R < 1.5 → max Fair
  if (rr1 < 1.5) score = Math.min(score, 59);
  // Confidence < 60 → cannot be Excellent (cap 79)
  if (signal.confidence < 60) score = Math.min(score, 79);
  // Rebound active → cannot be Good/Excellent
  if (signal.rebound?.active) score = Math.min(score, 49);
  // Low data quality → cap Fair
  if (signal.dataQuality === "low") score = Math.min(score, 49);

  let grade: TradeSetupGrade;
  if (score >= 80) grade = "Excellent";
  else if (score >= 60) grade = "Good";
  else if (score >= 40) grade = "Fair";
  else grade = "Poor";

  const summary = grade === "Excellent" ? "High-conviction setup — execute per plan."
    : grade === "Good" ? "Tradeable setup — respect stop & sizing."
    : grade === "Fair" ? "Marginal setup — wait for confirmation or reduce size significantly."
    : "Low-quality setup — skip or watch only, do not execute.";

  return { grade, score, reasons, summary };
}

export function buildTradeSetup(c: Candle[], signal: CompositeSignal): TradeSetup {
  const price = signal.price;
  const atrSeries = atr(c, 14);
  const atrNow = atrSeries[atrSeries.length - 1];
  const zones = detectSRZones(c);
  const { support, resistance } = nearestZones(zones, price);
  const notes: string[] = [];

  if (signal.label === "HOLD") {
    const holdQuality: TradeSetupQuality = {
      grade: "Poor", score: 0,
      reasons: [{ label: "Signal", ok: false, detail: "Composite signal is HOLD — no actionable bias" }],
      summary: "No setup to grade. Wait for BUY/SELL trigger.",
    };
    return {
      bias: "neutral", entryAggressive: null, entryConservative: null, entryZone: null,
      stopLoss: null, invalidation: null, trailingStop: "—",
      tp1: null, tp2: null, tp3: null, rrTp1: null, rrTp2: null, rrTp3: null,
      riskPerTradePct: 0, suggestedAllocationPct: 0,
      notes: ["No actionable setup — wait for clearer signal"],
      quality: holdQuality,
      stopDistancePct: 0, conditional: false, conditionalReason: null,
      microcopy: null, riskDrivers: signal.riskDrivers ?? [],
    };
  }

  const long = signal.label === "BUY" || signal.label === "STRONG_BUY";
  const bias: "long" | "short" = long ? "long" : "short";

  // Entries
  const entryAggressive = price;
  const entryConservative = long
    ? (support ? Math.max(support.high, price - atrNow * 0.5) : price - atrNow * 0.5)
    : (resistance ? Math.min(resistance.low, price + atrNow * 0.5) : price + atrNow * 0.5);
  const entryZone: [number, number] = long
    ? [Math.min(entryAggressive, entryConservative), Math.max(entryAggressive, entryConservative)]
    : [Math.min(entryAggressive, entryConservative), Math.max(entryAggressive, entryConservative)];

  // Stop loss: 1.5 ATR beyond invalidation level (S/R or swing)
  const slBuffer = atrNow * 1.5;
  let invalidation: number;
  if (long) invalidation = support ? support.low - atrNow * 0.3 : price - slBuffer;
  else invalidation = resistance ? resistance.high + atrNow * 0.3 : price + slBuffer;
  const stopLoss = invalidation;

  const risk = Math.abs(entryAggressive - stopLoss);
  if (risk <= 0) {
    notes.push("Cannot derive stop — risk = 0");
  }

  // Take profits via R-multiples + S/R clamping
  const tp1 = long ? entryAggressive + risk * 1.5 : entryAggressive - risk * 1.5;
  let tp2 = long ? entryAggressive + risk * 2.5 : entryAggressive - risk * 2.5;
  let tp3 = long ? entryAggressive + risk * 4 : entryAggressive - risk * 4;
  if (long && resistance && resistance.price < tp2) { tp2 = resistance.price; notes.push("TP2 clamped to nearest resistance"); }
  if (!long && support && support.price > tp2) { tp2 = support.price; notes.push("TP2 clamped to nearest support"); }

  const rr = (target: number) => risk > 0 ? +(Math.abs(target - entryAggressive) / risk).toFixed(2) : null;

  // Position sizing
  // Default 1% account risk; scale with confidence
  const riskPerTradePct = signal.confidence > 75 ? 1.5 : signal.confidence > 60 ? 1 : 0.5;
  const suggestedAllocationPct = Math.min(25, Math.round((riskPerTradePct / (risk / price * 100)) * 100) / 100);

  const rrTp1 = rr(tp1);
  const rrTp2 = rr(tp2);
  const rrTp3 = rr(tp3);
  const riskPct = price > 0 ? (risk / price) * 100 : 0;
  const atrPct = price > 0 ? (atrNow / price) * 100 : 0;

  const quality = gradeTradeSetup({
    signal, rrTp1, rrTp2, riskPct, atrPct, long,
    hasSupport: !!support, hasResistance: !!resistance,
  });

  // ---- Conditional setup detection ----
  const conditional =
    signal.rebound?.active === true ||
    signal.extendedRally === true ||
    quality.grade === "Fair" ||
    quality.grade === "Poor" ||
    riskPct > 10;
  let conditionalReason: string | null = null;
  let microcopy: string | null = null;
  if (signal.extendedRally && (signal.label === "BUY" || signal.label === "STRONG_BUY")) {
    conditionalReason = `Harga sudah naik +${signal.dailyChangePct.toFixed(1)}% hari ini`;
    microcopy = "Price already extended today. Avoid chasing. Wait for pullback to EMA20/EMA50 or breakout confirmation with volume.";
  } else if (signal.extendedRally && (signal.label === "SELL" || signal.label === "STRONG_SELL")) {
    conditionalReason = `Harga sudah turun ${signal.dailyChangePct.toFixed(1)}% hari ini`;
    microcopy = "Price already broken down today. Avoid late short. Wait for pullback to resistance or rejection candle.";
  } else if (signal.rebound?.active && (signal.label === "SELL" || signal.label === "STRONG_SELL")) {
    conditionalReason = signal.rebound.reason;
    microcopy = "Daily trend remains bearish, but price is currently rebounding. Avoid aggressive short entry. Wait for rejection near resistance or breakdown below support.";
  } else if (signal.rebound?.active && (signal.label === "BUY" || signal.label === "STRONG_BUY")) {
    conditionalReason = signal.rebound.reason;
    microcopy = "Daily trend bullish, but price sedang turun. Hindari long agresif. Tunggu reclaim support atau bullish reversal candle.";
  } else if (riskPct > 20) {
    microcopy = `Stop distance ${riskPct.toFixed(1)}% terlalu lebar — execute hanya dengan size sangat kecil atau tunggu setup yang lebih ketat.`;
  } else if (quality.grade === "Poor") {
    microcopy = "Setup quality Poor — disarankan No Trade.";
  } else if (quality.grade === "Fair") {
    microcopy = "Setup quality Fair — pertimbangkan watch trigger / set alert dulu.";
  }

  // Risk drivers from signal + setup-specific
  const riskDrivers = [...(signal.riskDrivers ?? [])];
  if (riskPct > 30) riskDrivers.unshift(`Stop distance sangat lebar (${riskPct.toFixed(1)}%) — risk meningkat`);
  else if (riskPct > 20) riskDrivers.unshift(`Stop distance lebar (${riskPct.toFixed(1)}%)`);
  else if (riskPct > 10) riskDrivers.unshift(`Stop distance di atas normal (${riskPct.toFixed(1)}%)`);
  if ((rrTp1 ?? 0) < 1.5) riskDrivers.push(`R:R lemah (${(rrTp1 ?? 0).toFixed(2)})`);
  if (signal.confidence < 60) riskDrivers.push(`Confidence rendah (${signal.confidence})`);
  if (signal.rebound?.active) riskDrivers.push(`Counter-move aktif: ${signal.rebound.reason ?? "rebound"}`);
  if (signal.extendedRally) riskDrivers.push(`Extended ${signal.dailyChangePct > 0 ? "rally" : "decline"} ${signal.dailyChangePct.toFixed(1)}% hari ini — risiko chase`);

  // Reduce allocation more aggressively when |dailyChangePct| > 10
  const extreme = Math.abs(signal.dailyChangePct ?? 0) > 10;
  const allocCap = extreme ? 1.5 : conditional ? 3 : 25;
  const riskCap = extreme ? 0.25 : conditional ? 0.5 : riskPerTradePct;

  return {
    bias,
    entryAggressive: +entryAggressive.toFixed(2),
    entryConservative: +entryConservative.toFixed(2),
    entryZone: [+entryZone[0].toFixed(2), +entryZone[1].toFixed(2)],
    stopLoss: +stopLoss.toFixed(2),
    invalidation: +invalidation.toFixed(2),
    trailingStop: `Trail by 1.5×ATR (~${(atrNow * 1.5).toFixed(2)}) once price reaches TP1`,
    tp1: +tp1.toFixed(2),
    tp2: +tp2.toFixed(2),
    tp3: +tp3.toFixed(2),
    rrTp1, rrTp2, rrTp3,
    riskPerTradePct: conditional ? Math.min(riskPerTradePct, 0.5) : riskPerTradePct,
    suggestedAllocationPct: Math.max(1, conditional ? Math.min(suggestedAllocationPct, 3) : suggestedAllocationPct),
    notes,
    quality,
    stopDistancePct: +riskPct.toFixed(2),
    conditional,
    conditionalReason,
    microcopy,
    riskDrivers,
  };
}
