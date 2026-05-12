import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCandles } from "./market.functions";
import { scoreSignal, atr, type Candle } from "./indicators";

// Multi-timeframe AI signal aggregation: scores 15m, 1h, 1d, 1wk and combines.
export const multiTimeframeSignal = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1).toUpperCase() }).parse(d))
  .handler(async ({ data }) => {
    const tfs = ["15m", "1h", "1d", "1wk"] as const;
    const weights: Record<string, number> = { "15m": 1, "1h": 2, "1d": 3, "1wk": 4 };
    const results = await Promise.all(tfs.map(async tf => {
      try {
        const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: tf } })) as Candle[];
        if (candles.length < 60) return { tf, score: 0, label: "HOLD", confidence: 0 };
        const s = scoreSignal(candles);
        return { tf, score: s.score, label: s.label, confidence: s.confidence };
      } catch { return { tf, score: 0, label: "HOLD", confidence: 0 }; }
    }));
    const totalW = results.reduce((a, r) => a + weights[r.tf], 0);
    const composite = results.reduce((a, r) => a + r.score * weights[r.tf], 0) / totalW;
    const aligned = results.every(r => Math.sign(r.score) === Math.sign(results[0].score) && r.score !== 0);
    const label = composite >= 60 ? "STRONG BUY" : composite >= 25 ? "BUY" : composite <= -60 ? "STRONG SELL" : composite <= -25 ? "SELL" : "HOLD";
    return { composite: Math.round(composite), label, aligned, byTimeframe: results };
  });

// Position sizer: given account size, risk %, entry & stop -> recommended shares
// Plus ATR-based stop suggestion at 1.5x ATR.
export const positionSizer = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; accountSize: number; riskPct: number; entry?: number }) =>
    z.object({
      symbol: z.string().min(1).toUpperCase(),
      accountSize: z.number().positive(),
      riskPct: z.number().min(0.1).max(10),
      entry: z.number().positive().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: "1d" } })) as Candle[];
    if (candles.length < 20) throw new Error("Insufficient data");
    const last = candles[candles.length - 1];
    const a = atr(candles)[candles.length - 1];
    const entry = data.entry ?? last.close;
    const stopLong = entry - 1.5 * a;
    const stopShort = entry + 1.5 * a;
    const target1 = entry + 2 * a;
    const target2 = entry + 3.5 * a;
    const riskDollar = data.accountSize * (data.riskPct / 100);
    const perShareRisk = entry - stopLong;
    const sharesLong = perShareRisk > 0 ? Math.floor(riskDollar / perShareRisk) : 0;
    const notional = sharesLong * entry;
    return {
      entry, atr: a,
      suggestedStopLong: stopLong, suggestedStopShort: stopShort,
      target1, target2,
      riskDollar, perShareRisk, shares: sharesLong, notional,
      rr1: (target1 - entry) / perShareRisk,
      rr2: (target2 - entry) / perShareRisk,
    };
  });

// Correlation matrix between symbols (Pearson on daily returns over last N).
export const correlationMatrix = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[]; lookback?: number }) =>
    z.object({ symbols: z.array(z.string().toUpperCase()).min(2).max(12), lookback: z.number().int().min(20).max(500).optional().default(90) }).parse(d))
  .handler(async ({ data }) => {
    const all = await Promise.all(data.symbols.map(async s => {
      const c = (await getCandles({ data: { symbol: s, timeframe: "1d" } })) as Candle[];
      const slice = c.slice(-data.lookback - 1);
      const rets: number[] = [];
      for (let i = 1; i < slice.length; i++) rets.push((slice[i].close - slice[i - 1].close) / slice[i - 1].close);
      return { symbol: s, rets };
    }));
    const minLen = Math.min(...all.map(x => x.rets.length));
    const trimmed = all.map(x => ({ symbol: x.symbol, rets: x.rets.slice(-minLen) }));
    const n = trimmed.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        matrix[i][j] = pearson(trimmed[i].rets, trimmed[j].rets);
      }
    }
    return { symbols: trimmed.map(t => t.symbol), matrix, lookback: minLen };
  });

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : num / d;
}
