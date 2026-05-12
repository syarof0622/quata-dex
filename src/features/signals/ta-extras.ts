// Additional technical-analysis primitives used by the multi-factor signal engine.
// Pure functions, safe to call from any server function.

import type { Candle } from "@/lib/indicators";
import { ema, rsi, macd, atr } from "@/lib/indicators";

// ---------- Wilder smoothing for ADX ----------
function wilder(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      out.push(i === period - 1 ? sum / period : NaN);
    } else {
      const prev = out[i - 1];
      out.push(prev - prev / period + values[i]);
    }
  }
  return out;
}

export function adx(c: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const len = c.length;
  const tr: number[] = new Array(len).fill(0);
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = c[i].high - c[i - 1].high;
    const down = c[i - 1].low - c[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    const t1 = c[i].high - c[i].low;
    const t2 = Math.abs(c[i].high - c[i - 1].close);
    const t3 = Math.abs(c[i].low - c[i - 1].close);
    tr[i] = Math.max(t1, t2, t3);
  }
  const trS = wilder(tr.slice(1), period);
  const pS = wilder(plusDM.slice(1), period);
  const mS = wilder(minusDM.slice(1), period);
  const plusDI: number[] = [NaN];
  const minusDI: number[] = [NaN];
  const dx: number[] = [NaN];
  for (let i = 0; i < trS.length; i++) {
    const t = trS[i];
    const p = t ? (pS[i] / t) * 100 : NaN;
    const m = t ? (mS[i] / t) * 100 : NaN;
    plusDI.push(p);
    minusDI.push(m);
    const sum = p + m;
    dx.push(sum ? (Math.abs(p - m) / sum) * 100 : NaN);
  }
  // ADX = wilder smoothed DX
  const adxArr = wilder(dx.slice(1).map(v => isNaN(v) ? 0 : v), period);
  const adxOut = [NaN, ...adxArr];
  return { adx: adxOut, plusDI, minusDI };
}

// ---------- Stochastic ----------
export function stochastic(c: Candle[], kPeriod = 14, dPeriod = 3) {
  const k: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i < kPeriod - 1) { k.push(NaN); continue; }
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (c[j].high > hh) hh = c[j].high;
      if (c[j].low < ll) ll = c[j].low;
    }
    const denom = hh - ll;
    k.push(denom ? ((c[i].close - ll) / denom) * 100 : 50);
  }
  const d: number[] = [];
  for (let i = 0; i < k.length; i++) {
    if (i < dPeriod - 1) { d.push(NaN); continue; }
    let s = 0; for (let j = i - dPeriod + 1; j <= i; j++) s += k[j];
    d.push(s / dPeriod);
  }
  return { k, d };
}

// ---------- Bollinger Band squeeze (BB width relative to N-bar low) ----------
export function bbSqueeze(closes: number[], period = 20, lookback = 100): { width: number[]; squeezing: boolean } {
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / period;
    const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const sd = Math.sqrt(v);
    out.push(m ? (4 * sd) / m : NaN); // total width as % of price
  }
  const last = out[out.length - 1];
  const ref = out.slice(-lookback).filter(v => !isNaN(v));
  const min = Math.min(...ref);
  const squeezing = !isNaN(last) && last <= min * 1.05;
  return { width: out, squeezing };
}

// ---------- Swing pivots (fractal) ----------
export type Pivot = { idx: number; time: number; price: number; kind: "high" | "low" };
export function swingPivots(c: Candle[], left = 3, right = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i < c.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isHigh = false;
      if (c[j].low <= c[i].low) isLow = false;
    }
    if (isHigh) out.push({ idx: i, time: c[i].time, price: c[i].high, kind: "high" });
    if (isLow) out.push({ idx: i, time: c[i].time, price: c[i].low, kind: "low" });
  }
  return out;
}

// HH/HL/LL/LH detection
export function trendStructure(pivots: Pivot[]): "uptrend" | "downtrend" | "sideways" {
  const highs = pivots.filter(p => p.kind === "high").slice(-3);
  const lows = pivots.filter(p => p.kind === "low").slice(-3);
  if (highs.length < 2 || lows.length < 2) return "sideways";
  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;
  if (hh && hl) return "uptrend";
  if (lh && ll) return "downtrend";
  return "sideways";
}

// ---------- Divergence: price vs RSI on last two pivots ----------
export function rsiDivergence(c: Candle[]): "bullish" | "bearish" | null {
  const closes = c.map(x => x.close);
  const rsiArr = rsi(closes, 14);
  const piv = swingPivots(c, 3, 3);
  const lows = piv.filter(p => p.kind === "low").slice(-2);
  const highs = piv.filter(p => p.kind === "high").slice(-2);
  if (lows.length === 2) {
    const [a, b] = lows;
    if (b.price < a.price && rsiArr[b.idx] > rsiArr[a.idx]) return "bullish";
  }
  if (highs.length === 2) {
    const [a, b] = highs;
    if (b.price > a.price && rsiArr[b.idx] < rsiArr[a.idx]) return "bearish";
  }
  return null;
}

// ---------- Candlestick patterns (single + 2-bar) ----------
export type CandlePattern = {
  name: string;
  bias: "bullish" | "bearish" | "neutral";
  strength: "low" | "medium" | "high";
  index: number;
};

function bodyOf(b: Candle) { return Math.abs(b.close - b.open); }
function rangeOf(b: Candle) { return b.high - b.low; }
function upperWick(b: Candle) { return b.high - Math.max(b.open, b.close); }
function lowerWick(b: Candle) { return Math.min(b.open, b.close) - b.low; }

export function detectPatterns(c: Candle[]): CandlePattern[] {
  const out: CandlePattern[] = [];
  for (let i = 1; i < c.length; i++) {
    const b = c[i], p = c[i - 1];
    const body = bodyOf(b), rng = rangeOf(b) || 1;
    const upper = upperWick(b), lower = lowerWick(b);
    const bullish = b.close > b.open;
    const bearish = b.close < b.open;

    // Doji
    if (body / rng < 0.1) out.push({ name: "Doji", bias: "neutral", strength: "low", index: i });
    // Hammer
    if (lower > body * 2 && upper < body * 0.5 && bullish)
      out.push({ name: "Hammer", bias: "bullish", strength: "medium", index: i });
    // Shooting star
    if (upper > body * 2 && lower < body * 0.5 && bearish)
      out.push({ name: "Shooting Star", bias: "bearish", strength: "medium", index: i });
    // Marubozu
    if (body / rng > 0.9 && bullish) out.push({ name: "Bullish Marubozu", bias: "bullish", strength: "high", index: i });
    if (body / rng > 0.9 && bearish) out.push({ name: "Bearish Marubozu", bias: "bearish", strength: "high", index: i });
    // Spinning top
    if (body / rng < 0.3 && upper > body && lower > body)
      out.push({ name: "Spinning Top", bias: "neutral", strength: "low", index: i });
    // Engulfing
    if (bullish && p.close < p.open && b.open <= p.close && b.close >= p.open)
      out.push({ name: "Bullish Engulfing", bias: "bullish", strength: "high", index: i });
    if (bearish && p.close > p.open && b.open >= p.close && b.close <= p.open)
      out.push({ name: "Bearish Engulfing", bias: "bearish", strength: "high", index: i });
    // Piercing line
    if (bullish && p.close < p.open && b.open < p.low && b.close > (p.open + p.close) / 2 && b.close < p.open)
      out.push({ name: "Piercing Line", bias: "bullish", strength: "medium", index: i });
    // Dark cloud cover
    if (bearish && p.close > p.open && b.open > p.high && b.close < (p.open + p.close) / 2 && b.close > p.open)
      out.push({ name: "Dark Cloud Cover", bias: "bearish", strength: "medium", index: i });
    // Inside bar
    if (b.high <= p.high && b.low >= p.low)
      out.push({ name: "Inside Bar", bias: "neutral", strength: "low", index: i });
    // Pin bar (long wick, small body, opposite direction)
    if (lower > rng * 0.6 && body < rng * 0.3)
      out.push({ name: "Bullish Pin Bar", bias: "bullish", strength: "medium", index: i });
    if (upper > rng * 0.6 && body < rng * 0.3)
      out.push({ name: "Bearish Pin Bar", bias: "bearish", strength: "medium", index: i });
  }
  // 3-bar morning/evening star
  for (let i = 2; i < c.length; i++) {
    const a = c[i - 2], b = c[i - 1], d = c[i];
    const aBear = a.close < a.open, dBull = d.close > d.open;
    const aBull = a.close > a.open, dBear = d.close < d.open;
    const bSmall = bodyOf(b) / (rangeOf(b) || 1) < 0.4;
    if (aBear && bSmall && dBull && d.close > (a.open + a.close) / 2)
      out.push({ name: "Morning Star", bias: "bullish", strength: "high", index: i });
    if (aBull && bSmall && dBear && d.close < (a.open + a.close) / 2)
      out.push({ name: "Evening Star", bias: "bearish", strength: "high", index: i });
  }
  return out;
}

// ---------- Volume helpers ----------
export function relativeVolume(c: Candle[], lookback = 20): number {
  if (c.length < lookback + 1) return 1;
  const last = c[c.length - 1].volume;
  const avg = c.slice(-lookback - 1, -1).reduce((a, b) => a + b.volume, 0) / lookback;
  return avg ? last / avg : 1;
}

export function obvTrend(c: Candle[], window = 20): "up" | "down" | "flat" {
  if (c.length < window + 2) return "flat";
  const obv: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const prev = obv[i - 1];
    if (c[i].close > c[i - 1].close) obv.push(prev + c[i].volume);
    else if (c[i].close < c[i - 1].close) obv.push(prev - c[i].volume);
    else obv.push(prev);
  }
  const a = obv[obv.length - 1 - window];
  const b = obv[obv.length - 1];
  const diffPct = a ? ((b - a) / Math.abs(a)) * 100 : 0;
  if (diffPct > 5) return "up";
  if (diffPct < -5) return "down";
  return "flat";
}

// Re-export commonly used to avoid double imports in engine
export { ema, rsi, macd, atr };
export type { Candle };
