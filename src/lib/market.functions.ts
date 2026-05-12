import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Worker-safe Yahoo Finance access via direct fetch (no CommonJS deps).
// Uses the public chart + search endpoints that don't require a crumb.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type CacheEntry<T> = { data: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await fn();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

async function yfFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  return res.json();
}

export type Quote = {
  symbol: string;
  shortName?: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
  marketCap?: number | null;
  currency?: string | null;
  exchange?: string | null;
  marketState?: string | null;
};

function quoteFromChartMeta(meta: any): Quote {
  const price = meta?.regularMarketPrice ?? null;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
  const change = price != null && prev != null ? price - prev : null;
  const changePct = change != null && prev ? (change / prev) * 100 : null;
  return {
    symbol: meta?.symbol,
    shortName: meta?.shortName ?? meta?.longName ?? meta?.symbol,
    price,
    change,
    changePercent: changePct,
    open: meta?.regularMarketOpen ?? null,
    high: meta?.regularMarketDayHigh ?? null,
    low: meta?.regularMarketDayLow ?? null,
    prevClose: prev,
    volume: meta?.regularMarketVolume ?? null,
    marketCap: null,
    currency: meta?.currency ?? null,
    exchange: meta?.fullExchangeName ?? meta?.exchangeName ?? null,
    marketState: null,
  };
}

async function fetchQuoteOne(symbol: string): Promise<Quote | null> {
  try {
    const r = await yfFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    );
    const meta = r?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return quoteFromChartMeta(meta);
  } catch (e) {
    console.error("fetchQuoteOne", symbol, e);
    return null;
  }
}

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[] }) =>
    z.object({ symbols: z.array(z.string()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = `q:${data.symbols.slice().sort().join(",")}`;
    return cached<Quote[]>(key, 8_000, async () => {
      const results = await Promise.all(data.symbols.map((s) => fetchQuoteOne(s)));
      return results.filter((q): q is Quote => !!q);
    });
  });

export const getQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const key = `q1:${data.symbol}`;
    return cached<Quote | null>(key, 8_000, () => fetchQuoteOne(data.symbol));
  });

const TFMap: Record<string, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "3mo" },
  "4h": { interval: "60m", range: "6mo" },
  "1d": { interval: "1d", range: "2y" },
  "1wk": { interval: "1wk", range: "5y" },
};

export type CandleDTO = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const getCandles = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string }) =>
    z
      .object({ symbol: z.string().min(1), timeframe: z.string().optional().default("1d") })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const tf = TFMap[data.timeframe] ?? TFMap["1d"];
    const key = `c:${data.symbol}:${data.timeframe}`;
    return cached<CandleDTO[]>(key, 30_000, async () => {
      try {
        const r = await yfFetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            data.symbol,
          )}?interval=${tf.interval}&range=${tf.range}`,
        );
        const result = r?.chart?.result?.[0];
        if (!result) return [];
        const ts: number[] = result.timestamp ?? [];
        const q = result.indicators?.quote?.[0] ?? {};
        const out: CandleDTO[] = [];
        for (let i = 0; i < ts.length; i++) {
          const o = q.open?.[i],
            h = q.high?.[i],
            l = q.low?.[i],
            c = q.close?.[i],
            v = q.volume?.[i];
          if (o == null || c == null || h == null || l == null) continue;
          out.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: v ?? 0 });
        }
        return out;
      } catch (e) {
        console.error("getCandles error", e);
        return [];
      }
    });
  });

export const searchTicker = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => z.object({ q: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    return cached(`s:${data.q}`, 60_000, async () => {
      try {
        const r = await yfFetch(
          `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
            data.q,
          )}&quotesCount=10&newsCount=0`,
        );
        return (r?.quotes ?? [])
          .map((x: any) => ({
            symbol: x.symbol,
            name: x.shortname ?? x.longname,
            exchange: x.exchDisp,
            type: x.typeDisp,
          }))
          .filter((x: any) => x.symbol);
      } catch (e) {
        console.error("searchTicker error", e);
        return [];
      }
    });
  });

import { IDX_LQ45, US_TOP, IDX_INDICES, GLOBAL_INDICES } from "./symbols";

const MOVER_UNIVERSE: Record<"idx" | "us" | "global", string[]> = {
  idx: IDX_LQ45,
  us: [
    ...US_TOP,
    "JPM", "V", "BRK-B", "UNH", "XOM", "WMT", "JNJ", "PG", "MA", "HD",
    "COST", "ORCL", "CRM", "ADBE", "INTC", "BAC", "DIS", "KO", "PEP", "CVX",
  ],
  global: [...IDX_LQ45.slice(0, 25), ...US_TOP],
};

async function buildMovers(symbols: string[]) {
  const arr = (await Promise.all(symbols.map((s) => fetchQuoteOne(s)))).filter(
    (q): q is Quote => !!q,
  );
  const sorted = [...arr].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return {
    gainers: sorted.slice(0, 8),
    losers: sorted.slice(-8).reverse(),
    all: arr,
  };
}

export const getMovers = createServerFn({ method: "POST" })
  .inputValidator((d: { market?: "idx" | "us" | "global" } | undefined) =>
    z.object({ market: z.enum(["idx", "us", "global"]).optional().default("idx") }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    return cached(`movers:${data.market}`, 30_000, () => buildMovers(MOVER_UNIVERSE[data.market]));
  });

export const getIndices = createServerFn({ method: "GET" }).handler(async () => {
  return cached("indices:idx-first", 15_000, async () => {
    const symbols = [...IDX_INDICES, ...GLOBAL_INDICES, "^VIX"];
    const arr = (await Promise.all(symbols.map((s) => fetchQuoteOne(s)))).filter(
      (q): q is Quote => !!q,
    );
    return arr;
  });
});

export const getNews = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string }) => z.object({ symbol: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const key = `n:${data.symbol ?? "_"}`;
    return cached(key, 60_000, async () => {
      try {
        const r = await yfFetch(
          `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
            data.symbol ?? "stock market",
          )}&quotesCount=0&newsCount=12`,
        );
        return (r?.news ?? []).map((n: any) => ({
          title: n.title,
          link: n.link,
          publisher: n.publisher,
          publishedAt: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toISOString()
            : null,
          thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
        }));
      } catch (e) {
        console.error("getNews error", e);
        return [];
      }
    });
  });
