import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCandles, getQuotes } from "./market.functions";
import { compositeSignal } from "@/features/signals/composite-engine";
import { sectorOf, ALL_SECTORS, type Sector } from "./sectors";
import { IDX_LQ45, US_TOP } from "./symbols";
import type { Candle } from "./indicators";

type ScreenRow = {
  symbol: string;
  shortName?: string;
  sector: Sector;
  price: number;
  changePct: number | null;
  score: number;
  label: string;
  confidence: number;
  rsi: number;
  trendStrength: number;
  volRel: number; // relative volume
  factors: { trend: number; momentum: number; volume: number; priceAction: number; volatility: number };
  sparkline: number[];
};

const UNIVERSES: Record<"idx" | "us" | "global", string[]> = {
  idx: IDX_LQ45,
  us: US_TOP,
  global: [...IDX_LQ45.slice(0, 25), ...US_TOP],
};

async function buildRow(symbol: string, quote: any): Promise<ScreenRow | null> {
  try {
    const c = (await getCandles({ data: { symbol, timeframe: "1d" } })) as Candle[];
    if (c.length < 60) return null;
    const sig = compositeSignal(c, symbol, "1d");
    const closes = c.slice(-30).map(x => x.close);
    const last = c.length - 1;
    const gains: number[] = [], losses: number[] = [];
    for (let i = 1; i < c.length; i++) {
      const d = c[i].close - c[i - 1].close;
      gains.push(d > 0 ? d : 0); losses.push(d < 0 ? -d : 0);
    }
    const avgG = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const avgL = (losses.slice(-14).reduce((a, b) => a + b, 0) / 14) || 1;
    const rsi = 100 - 100 / (1 + (avgG / avgL));
    const avgVol20 = c.slice(-20).reduce((a, x) => a + x.volume, 0) / 20;
    const volRel = avgVol20 > 0 ? c[last].volume / avgVol20 : 1;

    return {
      symbol,
      shortName: quote?.shortName,
      sector: sectorOf(symbol),
      price: c[last].close,
      changePct: quote?.changePercent ?? null,
      score: sig.score,
      label: sig.label,
      confidence: sig.confidence,
      rsi: isFinite(rsi) ? Math.round(rsi) : 50,
      trendStrength: sig.trendStrength ?? 0,
      volRel: +volRel.toFixed(2),
      factors: sig.factors,
      sparkline: closes,
    };
  } catch { return null; }
}

export const screenStocks = createServerFn({ method: "POST" })
  .inputValidator((d: { market?: "idx" | "us" | "global" } | undefined) =>
    z.object({ market: z.enum(["idx", "us", "global"]).optional().default("idx") }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const universe = UNIVERSES[data.market];
    const quotes = await getQuotes({ data: { symbols: universe } });
    const qMap = new Map(quotes.map(q => [q.symbol, q]));
    const rows = await Promise.all(universe.map(s => buildRow(s, qMap.get(s))));
    return rows.filter((r): r is ScreenRow => !!r);
  });

export const rankWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[] }) =>
    z.object({ symbols: z.array(z.string().min(1)).max(60) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.symbols.length === 0) return [];
    const quotes = await getQuotes({ data: { symbols: data.symbols } });
    const qMap = new Map(quotes.map(q => [q.symbol, q]));
    const rows = await Promise.all(data.symbols.map(s => buildRow(s, qMap.get(s))));
    return rows.filter((r): r is ScreenRow => !!r).sort((a, b) => b.score - a.score);
  });

export const sectorPerformance = createServerFn({ method: "POST" })
  .inputValidator((d: { market?: "idx" | "us" | "global" } | undefined) =>
    z.object({ market: z.enum(["idx", "us", "global"]).optional().default("idx") }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const universe = UNIVERSES[data.market];
    const quotes = await getQuotes({ data: { symbols: universe } });
    const bySec = new Map<Sector, { sum: number; n: number; up: number; down: number; symbols: { symbol: string; pct: number }[] }>();
    for (const q of quotes) {
      const sec = sectorOf(q.symbol);
      const pct = q.changePercent ?? 0;
      if (!bySec.has(sec)) bySec.set(sec, { sum: 0, n: 0, up: 0, down: 0, symbols: [] });
      const e = bySec.get(sec)!;
      e.sum += pct; e.n += 1;
      if (pct > 0) e.up += 1; else if (pct < 0) e.down += 1;
      e.symbols.push({ symbol: q.symbol, pct });
    }
    return ALL_SECTORS
      .filter(s => bySec.has(s))
      .map(s => {
        const e = bySec.get(s)!;
        return {
          sector: s,
          avgPct: +(e.sum / e.n).toFixed(2),
          count: e.n,
          breadth: e.n ? +((e.up - e.down) / e.n).toFixed(2) : 0, // -1..1
          topGainer: [...e.symbols].sort((a, b) => b.pct - a.pct)[0],
          topLoser: [...e.symbols].sort((a, b) => a.pct - b.pct)[0],
        };
      })
      .sort((a, b) => b.avgPct - a.avgPct);
  });

export const marketBreadth = createServerFn({ method: "POST" })
  .inputValidator((d: { market?: "idx" | "us" | "global" } | undefined) =>
    z.object({ market: z.enum(["idx", "us", "global"]).optional().default("idx") }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const universe = UNIVERSES[data.market];
    const quotes = await getQuotes({ data: { symbols: universe } });
    let up = 0, down = 0, flat = 0;
    for (const q of quotes) {
      const p = q.changePercent ?? 0;
      if (p > 0.1) up++; else if (p < -0.1) down++; else flat++;
    }
    const tone =
      up > down * 1.5 ? "Risk-On"
      : down > up * 1.5 ? "Risk-Off"
      : "Mixed";
    return { up, down, flat, total: quotes.length, tone };
  });
