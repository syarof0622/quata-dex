// Pure technical-analysis helpers. Safe to use in server functions.

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (prev == null) {
      if (i + 1 >= period) {
        const seed = values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period;
        prev = seed;
      }
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev ?? NaN);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [NaN];
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const g = Math.max(change, 0), l = Math.max(-change, 0);
    if (i <= period) {
      gains += g; losses += l;
      if (i === period) {
        const avgG = gains / period, avgL = losses / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out.push(100 - 100 / (1 + rs));
      } else out.push(NaN);
    } else {
      const prev = out[out.length - 1];
      const avgG = ((gains / period) * (period - 1) + g) / period;
      const avgL = ((losses / period) * (period - 1) + l) / period;
      gains = avgG * period; losses = avgL * period;
      const rs = avgL === 0 ? 100 : avgG / avgL;
      out.push(isNaN(prev) ? NaN : 100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => ef[i] - es[i]);
  const signal = ema(line.map(v => isNaN(v) ? 0 : v), signalP);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: number[] = [], lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i];
    const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const sd = Math.sqrt(v);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

export function atr(c: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { tr.push(c[i].high - c[i].low); continue; }
    const prev = c[i - 1].close;
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - prev), Math.abs(c[i].low - prev)));
  }
  return ema(tr, period);
}

export function vwap(c: Candle[]): number[] {
  let cumPV = 0, cumV = 0;
  return c.map(b => {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume; cumV += b.volume;
    return cumV ? cumPV / cumV : NaN;
  });
}

export function obv(c: Candle[]): number[] {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    const prev = out[i - 1];
    if (c[i].close > c[i - 1].close) out.push(prev + c[i].volume);
    else if (c[i].close < c[i - 1].close) out.push(prev - c[i].volume);
    else out.push(prev);
  }
  return out;
}

// Simple support/resistance via fractal pivots
export function findPivots(c: Candle[], lookback = 5) {
  const supports: { time: number; price: number }[] = [];
  const resistances: { time: number; price: number }[] = [];
  for (let i = lookback; i < c.length - lookback; i++) {
    const window = c.slice(i - lookback, i + lookback + 1);
    const isHigh = window.every(b => b.high <= c[i].high);
    const isLow = window.every(b => b.low >= c[i].low);
    if (isHigh) resistances.push({ time: c[i].time, price: c[i].high });
    if (isLow) supports.push({ time: c[i].time, price: c[i].low });
  }
  return { supports, resistances };
}

export type SignalLabel = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export function scoreSignal(c: Candle[]): {
  score: number; label: SignalLabel; reasons: string[]; confidence: number;
  trendStrength: number; risk: "low" | "medium" | "high";
} {
  const closes = c.map(x => x.close);
  if (closes.length < 60) {
    return { score: 0, label: "HOLD", reasons: ["Not enough data"], confidence: 30, trendStrength: 0, risk: "high" };
  }
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const last = closes.length - 1;

  const reasons: string[] = [];
  let score = 0;

  // Trend
  if (e20[last] > e50[last]) { score += 15; reasons.push("EMA20 above EMA50 (bullish trend)"); }
  else { score -= 15; reasons.push("EMA20 below EMA50 (bearish trend)"); }
  if (!isNaN(e200[last]) && closes[last] > e200[last]) { score += 10; reasons.push("Price above EMA200 (long-term up)"); }
  else if (!isNaN(e200[last])) { score -= 10; reasons.push("Price below EMA200 (long-term down)"); }

  // Momentum (RSI)
  const rsiNow = r[last];
  if (!isNaN(rsiNow)) {
    if (rsiNow < 30) { score += 12; reasons.push(`RSI oversold (${rsiNow.toFixed(1)})`); }
    else if (rsiNow > 70) { score -= 12; reasons.push(`RSI overbought (${rsiNow.toFixed(1)})`); }
    else if (rsiNow > 55) { score += 6; reasons.push(`RSI bullish (${rsiNow.toFixed(1)})`); }
    else if (rsiNow < 45) { score -= 6; reasons.push(`RSI bearish (${rsiNow.toFixed(1)})`); }
  }

  // MACD
  if (m.hist[last] > 0 && m.hist[last - 1] <= 0) { score += 12; reasons.push("MACD bullish crossover"); }
  else if (m.hist[last] < 0 && m.hist[last - 1] >= 0) { score -= 12; reasons.push("MACD bearish crossover"); }
  else if (m.hist[last] > 0) { score += 4; }
  else if (m.hist[last] < 0) { score -= 4; }

  // Volume spike
  const vols = c.slice(-21, -1).map(x => x.volume);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastVol = c[last].volume;
  if (lastVol > avgVol * 1.5) {
    const dir = closes[last] > closes[last - 1] ? 1 : -1;
    score += 8 * dir;
    reasons.push(`Volume spike ${(((lastVol / avgVol) - 1) * 100).toFixed(0)}% (${dir > 0 ? "buying" : "selling"})`);
  }

  // Volatility / risk
  const atrSeries = atr(c);
  const atrPct = (atrSeries[last] / closes[last]) * 100;
  const risk: "low" | "medium" | "high" = atrPct < 1.5 ? "low" : atrPct < 3 ? "medium" : "high";

  // Trend strength = |EMA20 - EMA50| / price
  const trendStrength = Math.min(100, Math.abs(e20[last] - e50[last]) / closes[last] * 1000);

  // Clamp score to -100..100
  score = Math.max(-100, Math.min(100, score));
  const label: SignalLabel =
    score >= 60 ? "STRONG BUY" :
    score >= 25 ? "BUY" :
    score <= -60 ? "STRONG SELL" :
    score <= -25 ? "SELL" : "HOLD";

  const confidence = Math.min(95, 50 + Math.abs(score) / 2);
  return { score, label, reasons, confidence, trendStrength, risk };
}
