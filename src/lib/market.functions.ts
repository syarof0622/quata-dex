import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    // Use 1m interval to get the freshest regularMarketPrice tick available from Yahoo.
    const r = await yfFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`,
    );
    const meta = r?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const q = quoteFromChartMeta(meta);
    q.marketState = meta?.marketState ?? null;
    return q;
  } catch (e) {
    console.error("fetchQuoteOne", symbol, e);
    return null;
  }
}

async function fetchInChunks<T>(items: string[], chunk: number, fn: (s: string) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += chunk) {
    const slice = items.slice(i, i + chunk);
    const r = await Promise.all(slice.map(fn));
    out.push(...r);
  }
  return out;
}

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[] }) =>
    z.object({ symbols: z.array(z.string()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = `q:${data.symbols.slice().sort().join(",")}`;
    return cached<Quote[]>(key, 3_000, async () => {
      const results = await fetchInChunks(data.symbols, 20, fetchQuoteOne);
      return results.filter((q): q is Quote => !!q);
    });
  });

// ===== Twelve Data realtime provider (optional opt-in) =====
function tdSymbol(symbol: string): { symbol: string; exchange?: string } {
  if (symbol.endsWith(".JK")) return { symbol: symbol.replace(/\.JK$/, ""), exchange: "IDX" };
  return { symbol };
}

async function fetchQuoteTwelveData(symbol: string): Promise<Quote | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY not configured");
  const { symbol: s, exchange } = tdSymbol(symbol);
  const params = new URLSearchParams({ symbol: s, apikey: apiKey });
  if (exchange) params.set("exchange", exchange);
  try {
    const r = await fetch(`https://api.twelvedata.com/quote?${params.toString()}`);
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.status === "error" || !j.close) return null;
    const price = Number(j.close);
    const prev = Number(j.previous_close);
    const change = isFinite(price - prev) ? price - prev : null;
    const pct = prev ? (change! / prev) * 100 : null;
    return {
      symbol,
      shortName: j.name ?? symbol,
      price: isFinite(price) ? price : null,
      change,
      changePercent: pct,
      open: Number(j.open) || null,
      high: Number(j.high) || null,
      low: Number(j.low) || null,
      prevClose: isFinite(prev) ? prev : null,
      volume: Number(j.volume) || null,
      marketCap: null,
      currency: j.currency ?? null,
      exchange: j.exchange ?? exchange ?? null,
      marketState: j.is_market_open ? "REGULAR" : "CLOSED",
    };
  } catch (e) {
    console.error("twelvedata quote error", symbol, e);
    return null;
  }
}

export const getQuoteRealtime = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; provider?: "twelvedata" | "yahoo" }) =>
    z.object({ symbol: z.string().min(1), provider: z.enum(["twelvedata", "yahoo"]).optional().default("twelvedata") }).parse(d))
  .handler(async ({ data }) => {
    if (data.provider === "twelvedata") {
      // Twelve Data is paid; cap direct RPC calls per IP. Cached results bypass
      // the limiter implicitly (cached() short-circuits before this).
      const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
      try {
        enforceRateLimit("td_quote", 60, 60_000);
      } catch (e) {
        if (e instanceof RateLimitError) return null;
        throw e;
      }
      const key = `td:${data.symbol}`;
      return cached<Quote | null>(key, 2_000, () => fetchQuoteTwelveData(data.symbol));
    }
    return cached<Quote | null>(`q1:${data.symbol}`, 2_000, () => fetchQuoteOne(data.symbol));
  });

export const getQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const key = `q1:${data.symbol}`;
    return cached<Quote | null>(key, 2_000, () => fetchQuoteOne(data.symbol));
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
    // Intraday TFs cache very briefly so charts stay near-realtime (TradingView-like).
    const ttl = ["1m", "5m"].includes(data.timeframe)
      ? 1_500
      : ["15m"].includes(data.timeframe)
      ? 3_000
      : ["1h", "4h"].includes(data.timeframe)
      ? 10_000
      : 60_000;
    return cached<CandleDTO[]>(key, ttl, async () => {
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
      } catch (e: any) {
        // Yahoo 404 = symbol not listed there (common for some IDX tickers); log quietly.
        const msg = String(e?.message ?? e);
        if (/Yahoo 404/.test(msg)) {
          console.warn(`getCandles: symbol unavailable on Yahoo: ${data.symbol}`);
        } else {
          console.error("getCandles error", e);
        }
        return [];
      }
    });
  });

// Batched intraday sparkline closes for many symbols at once.
// Used by the Market Heatmap to render a tiny live mini-chart per ticker
// without firing N independent serverFn calls from the client.
// Each symbol is fetched in parallel (chunked), cached briefly so the
// dashboard's 30s heatmap refetch interval stays near-realtime.
export const getSparklines = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[]; range?: "1d" | "5d" }) =>
    z.object({
      symbols: z.array(z.string().min(1).max(20)).min(1).max(150),
      range: z.enum(["1d", "5d"]).optional().default("1d"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const interval = data.range === "5d" ? "30m" : "5m";
    const range = data.range;
    async function one(symbol: string): Promise<{ symbol: string; closes: number[] }> {
      const key = `spark:${symbol}:${range}`;
      return cached(key, 30_000, async () => {
        try {
          const r = await yfFetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
          );
          const result = r?.chart?.result?.[0];
          const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? [])
            .filter((v: any) => typeof v === "number" && isFinite(v));
          // Down-sample to at most 40 points so payload stays small.
          const max = 40;
          if (closes.length <= max) return { symbol, closes };
          const step = closes.length / max;
          const ds: number[] = [];
          for (let i = 0; i < max; i++) ds.push(closes[Math.floor(i * step)]);
          ds.push(closes[closes.length - 1]);
          return { symbol, closes: ds };
        } catch {
          return { symbol, closes: [] };
        }
      });
    }
    const out = await fetchInChunks(data.symbols, 12, one);
    const map: Record<string, number[]> = {};
    for (const r of out) map[r.symbol] = r.closes;
    return map;
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
  const arr = (await fetchInChunks(symbols, 20, fetchQuoteOne)).filter(
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
  return cached("indices:idx-first", 5_000, async () => {
    const symbols = [...IDX_INDICES, ...GLOBAL_INDICES, "^VIX"];
    const arr = (await Promise.all(symbols.map((s) => fetchQuoteOne(s)))).filter(
      (q): q is Quote => !!q,
    );
    return arr;
  });
});

type MarketScope = "idx" | "us" | "global";

async function fetchMarketauxNews(symbol?: string, market: MarketScope = "global"): Promise<any[]> {
  const token = process.env.MARKETAUX_API_TOKEN;
  if (!token) return [];
  const params = new URLSearchParams({
    filter_entities: "true",
    language: "en",
    limit: "12",
    api_token: token,
  });
  if (symbol) {
    // Marketaux uses base symbols; strip .JK suffix for matching
    const base = symbol.replace(/\.[A-Z]+$/, "");
    params.set("symbols", `${symbol},${base}`);
  } else {
    const countries = market === "idx" ? "id" : market === "us" ? "us" : "id,us,gb,jp,cn,hk,sg";
    params.set("countries", countries);
  }
  const res = await fetch(`https://api.marketaux.com/v1/news/all?${params.toString()}`);
  if (!res.ok) throw new Error(`Marketaux ${res.status}`);
  const j: any = await res.json();
  return (j?.data ?? []).map((n: any) => {
    const ents: any[] = Array.isArray(n.entities) ? n.entities : [];
    const scores = ents.map(e => Number(e.sentiment_score)).filter(v => Number.isFinite(v));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return {
      title: n.title,
      link: n.url,
      publisher: n.source,
      publishedAt: n.published_at ?? null,
      thumbnail: n.image_url ?? null,
      description: n.description ?? null,
      sentimentScore: avg, // -1..1
      entities: ents.map(e => ({ symbol: e.symbol, name: e.name, sentiment: Number(e.sentiment_score) || 0 })),
      source: "marketaux" as const,
    };
  });
}

async function fetchYahooNews(symbol?: string, market: MarketScope = "global"): Promise<any[]> {
  const q = symbol
    ? symbol
    : market === "idx"
      ? "IHSG OR indonesia stock market"
      : market === "us"
        ? "S&P 500 OR US stock market"
        : "global stock market";
  const r = await yfFetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=12`,
  );
  return (r?.news ?? []).map((n: any) => ({
    title: n.title,
    link: n.link,
    publisher: n.publisher,
    publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
    thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
    description: null,
    sentimentScore: null,
    entities: [],
    source: "yahoo" as const,
  }));
}

// Pull stored Indonesia news + sentiment from news_articles table.
async function fetchStoredIdxNews(limit = 15): Promise<any[]> {
  try {
    const { data } = await supabaseAdmin
      .from("news_articles")
      .select("title,url,source,published_at,image_url,summary,sentiment,sentiment_score,tickers")
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((n: any) => ({
      title: n.title,
      link: n.url,
      publisher: n.source,
      publishedAt: n.published_at,
      thumbnail: n.image_url ?? null,
      description: n.summary ?? null,
      sentimentScore: typeof n.sentiment_score === "number" ? n.sentiment_score : null,
      sentiment: n.sentiment ?? null,
      entities: (n.tickers ?? []).map((s: string) => ({ symbol: s, name: s, sentiment: 0 })),
      source: "news_articles" as const,
    }));
  } catch (e) {
    console.error("stored idx news error", e);
    return [];
  }
}

function dedupeByTitle(items: any[], cap = 12): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const k = (it.title ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= cap) break;
  }
  return out;
}

export const getNews = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string; market?: MarketScope }) =>
    z.object({
      symbol: z.string().optional(),
      market: z.enum(["idx", "us", "global"]).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const market: MarketScope = data.market ?? "global";
    const key = `n:${data.symbol ?? "_"}:${market}`;
    return cached(key, 60_000, async () => {
      // Symbol-specific fetch: for IDX (.JK) tickers, merge stored DB news (tickers array)
      // first so the per-emiten panel uses the same scraped corpus as News & Sentiment.
      if (data.symbol) {
        const sym = data.symbol.toUpperCase();
        let stored: any[] = [];
        if (sym.endsWith(".JK")) {
          try {
            const { data: rows } = await supabaseAdmin
              .from("news_articles")
              .select("title,url,source,published_at,image_url,summary,sentiment,sentiment_score,tickers")
              .contains("tickers", [sym])
              .eq("is_duplicate", false)
              .order("published_at", { ascending: false })
              .limit(15);
            stored = (rows ?? []).map((n: any) => ({
              title: n.title, link: n.url, publisher: n.source,
              publishedAt: n.published_at, thumbnail: n.image_url ?? null,
              description: n.summary ?? null,
              sentimentScore: typeof n.sentiment_score === "number" ? n.sentiment_score : null,
              sentiment: n.sentiment ?? null,
              entities: (n.tickers ?? []).map((s: string) => ({ symbol: s, name: s, sentiment: 0 })),
              source: "news_articles" as const,
            }));
          } catch (e) { console.error("stored ticker news", e); }
        }
        let mx: any[] = [];
        try { mx = await fetchMarketauxNews(sym, market); } catch (e) { console.error("marketaux", e); }
        let yh: any[] = [];
        if (stored.length + mx.length < 6) {
          try { yh = await fetchYahooNews(sym, market); } catch (e) { console.error("yahoo", e); }
        }
        return dedupeByTitle([...stored, ...mx, ...yh], 20);
      }

      // IDX: prioritize Indonesia-only sources (scraped DB + Marketaux country=id).
      // Skip Yahoo since its keyword search returns noisy global headlines.
      if (market === "idx") {
        const stored = await fetchStoredIdxNews(20);
        let mx: any[] = [];
        try { mx = await fetchMarketauxNews(undefined, "idx"); } catch (e) { console.error("marketaux", e); }
        return dedupeByTitle([...stored, ...mx], 15);
      }

      let mx: any[] = [];
      try { mx = await fetchMarketauxNews(undefined, market); } catch (e) { console.error("marketaux", e); }
      let yh: any[] = [];
      try { yh = await fetchYahooNews(undefined, market); } catch (e) { console.error("yahoo", e); }

      const ordered = market === "us"
        ? [...mx, ...yh]
        : [...(await fetchStoredIdxNews(4)), ...mx, ...yh]; // global mix

      return dedupeByTitle(ordered, 12);
    });
  });

export const getMarketauxSentiment = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string; country?: string }) =>
    z.object({ symbol: z.string().optional(), country: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const token = process.env.MARKETAUX_API_TOKEN;
    if (!token) return { available: false as const, data: [] };
    const key = `mxs:${data.symbol ?? ""}:${data.country ?? "id"}`;
    return cached(key, 120_000, async () => {
      const params = new URLSearchParams({
        group_by: data.symbol ? "symbol" : "country",
        limit: "10",
        api_token: token,
      });
      if (data.symbol) {
        const base = data.symbol.replace(/\.[A-Z]+$/, "");
        params.set("symbols", `${data.symbol},${base}`);
      } else {
        params.set("countries", data.country ?? "id,us");
      }
      try {
        const res = await fetch(`https://api.marketaux.com/v1/entity/stats/aggregation?${params.toString()}`);
        if (!res.ok) throw new Error(`Marketaux stats ${res.status}`);
        const j: any = await res.json();
        return { available: true as const, data: j?.data ?? [] };
      } catch (e) {
        console.error("marketaux sentiment error", e);
        return { available: false as const, data: [] };
      }
    });
  });
