// SerpApi service — backend only. Never import from client code.
// Provides Google News + Google Finance adapters with caching & usage tracking.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://serpapi.com/search";
const TIMEOUT_MS = 15_000;

// In-memory cache (per worker instance). Persisted cache is in DB tables.
type CacheEntry = { at: number; ttlMs: number; data: any };
const memCache = new Map<string, CacheEntry>();

const NEWS_TTL_MS = 20 * 60_000;     // 20 min
const FINANCE_TTL_MS = 10 * 60_000;  // 10 min

// Soft monthly cap to protect quota. Override with env SERPAPI_MONTHLY_LIMIT.
const MONTHLY_LIMIT = Number(process.env.SERPAPI_MONTHLY_LIMIT ?? 200);

export class SerpApiError extends Error {
  constructor(message: string, public code: "NO_KEY" | "QUOTA" | "TIMEOUT" | "UPSTREAM" | "EMPTY") {
    super(message);
  }
}

function getKey(): string {
  const k = process.env.SERPAPI_API_KEY;
  if (!k) throw new SerpApiError("SERPAPI_API_KEY not configured", "NO_KEY");
  return k;
}

export function convertYahooSymbolToGoogleFinance(symbol: string): string {
  // BBCA.JK -> BBCA:IDX
  if (symbol.endsWith(".JK")) return symbol.replace(".JK", ":IDX");
  return symbol;
}

async function logUsage(row: {
  engine: string; query?: string | null; symbol?: string | null;
  status: "success" | "failed" | "cache_hit" | "quota_blocked";
  credits_used: number; response_time_ms?: number; error_message?: string | null;
}) {
  try {
    await supabaseAdmin.from("serpapi_usage_logs").insert(row as any);
    // Daily summary upsert
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabaseAdmin
      .from("serpapi_usage_summary")
      .select("*")
      .eq("date", today)
      .eq("engine", row.engine)
      .maybeSingle();
    const success = row.status === "success" ? 1 : 0;
    const failed = row.status === "failed" ? 1 : 0;
    const credits = row.status === "success" ? row.credits_used : 0;
    if (existing) {
      await supabaseAdmin.from("serpapi_usage_summary").update({
        total_requests: (existing as any).total_requests + 1,
        success_requests: (existing as any).success_requests + success,
        failed_requests: (existing as any).failed_requests + failed,
        estimated_credits_used: (existing as any).estimated_credits_used + credits,
        updated_at: new Date().toISOString(),
      }).eq("id", (existing as any).id);
    } else {
      await supabaseAdmin.from("serpapi_usage_summary").insert({
        date: today, engine: row.engine,
        total_requests: 1, success_requests: success, failed_requests: failed,
        estimated_credits_used: credits,
      } as any);
    }
  } catch (e) {
    console.warn("[serpapi] logUsage error:", e);
  }
}

export async function getMonthlyUsage(): Promise<{ used: number; limit: number; remaining: number; quotaBlocked: boolean }> {
  const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("serpapi_usage_summary")
    .select("estimated_credits_used")
    .gte("date", from.toISOString().slice(0, 10));
  const used = (data ?? []).reduce((s: number, r: any) => s + (r.estimated_credits_used ?? 0), 0);
  return { used, limit: MONTHLY_LIMIT, remaining: Math.max(0, MONTHLY_LIMIT - used), quotaBlocked: used >= MONTHLY_LIMIT };
}

async function fetchJson(params: Record<string, string>, engine: string, meta: { query?: string; symbol?: string }) {
  const cacheKey = engine + ":" + new URLSearchParams(params).toString();
  const ttl = engine === "google_finance" ? FINANCE_TTL_MS : NEWS_TTL_MS;
  const hit = memCache.get(cacheKey);
  if (hit && Date.now() - hit.at < hit.ttlMs) {
    logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "cache_hit", credits_used: 0 });
    return hit.data;
  }
  // Quota guard
  const usage = await getMonthlyUsage();
  if (usage.quotaBlocked) {
    logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "quota_blocked", credits_used: 0, error_message: "monthly cap reached" });
    throw new SerpApiError("SerpApi monthly quota protection enabled", "QUOTA");
  }

  const key = getKey();
  const url = `${BASE}?${new URLSearchParams({ ...params, api_key: key }).toString()}`;
  const started = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ms = Date.now() - started;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const code = res.status === 429 ? "QUOTA" : "UPSTREAM";
      logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "failed", credits_used: 0, response_time_ms: ms, error_message: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
      throw new SerpApiError(`SerpApi HTTP ${res.status}`, code as any);
    }
    const data = await res.json();
    if (data?.error) {
      logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "failed", credits_used: 0, response_time_ms: ms, error_message: String(data.error).slice(0, 300) });
      throw new SerpApiError(String(data.error), "UPSTREAM");
    }
    memCache.set(cacheKey, { at: Date.now(), ttlMs: ttl, data });
    logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "success", credits_used: 1, response_time_ms: ms });
    return data;
  } catch (e: any) {
    if (e instanceof SerpApiError) throw e;
    const ms = Date.now() - started;
    const isAbort = e?.name === "AbortError";
    logUsage({ engine, query: meta.query ?? null, symbol: meta.symbol ?? null, status: "failed", credits_used: 0, response_time_ms: ms, error_message: String(e?.message ?? e).slice(0, 300) });
    throw new SerpApiError(isAbort ? "SerpApi timeout" : String(e?.message ?? e), isAbort ? "TIMEOUT" : "UPSTREAM");
  } finally {
    clearTimeout(to);
  }
}

// ---------- Google News adapter ----------

const POS = ["naik","menguat","melonjak","positif","untung","cuan","tumbuh","laba","bullish","beli","gain","upgrade","rekor"];
const NEG = ["turun","melemah","anjlok","jatuh","negatif","rugi","loss","koreksi","bearish","jual","downgrade","default","pailit","suspensi"];

function scoreSentiment(text: string): { sentiment: "positive"|"neutral"|"negative"; score: number } {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of POS) if (t.includes(w)) s += 1;
  for (const w of NEG) if (t.includes(w)) s -= 1;
  const norm = Math.max(-1, Math.min(1, s / 4));
  const sentiment = norm > 0.1 ? "positive" : norm < -0.1 ? "negative" : "neutral";
  return { sentiment, score: Math.round(norm * 100) / 100 };
}

function extractTickers(text: string): string[] {
  const found = new Set<string>();
  const re = /\b([A-Z]{4})(\.JK)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(`${m[1]}.JK`);
  return [...found].slice(0, 6);
}

export type SerpApiNewsItem = {
  id: string; source: string; originalSource: string; title: string; summary: string;
  url: string; publishedAt: string; fetchedAt: string; query: string; category: string;
  tickers: string[]; sectors: string[]; sentiment: "positive"|"neutral"|"negative"; sentimentScore: number;
  confidence: number; impactLevel: "low"|"medium"|"high"; relatedSymbols: string[]; rawPayload: any;
};

function normalizeNews(raw: any, query: string, light: boolean): SerpApiNewsItem[] {
  const items: any[] = raw?.news_results ?? [];
  const flat: any[] = [];
  for (const it of items) {
    if (Array.isArray(it?.stories)) for (const s of it.stories) flat.push(s);
    else flat.push(it);
  }
  const fetchedAt = new Date().toISOString();
  return flat.map((n) => {
    const title = String(n.title ?? "").trim();
    const snippet = String(n.snippet ?? n.source?.name ?? "").trim();
    const url = String(n.link ?? n.url ?? "");
    const publishedAt = n.date ? tryParseDate(n.date) : fetchedAt;
    const originalSource = String(n.source?.name ?? n.source ?? "Google News");
    const { sentiment, score } = scoreSentiment(`${title} ${snippet}`);
    const tickers = extractTickers(`${title} ${snippet}`);
    return {
      id: hashId(url || title),
      source: light ? "SerpApi Google News Light" : "SerpApi Google News",
      originalSource, title, summary: snippet, url,
      publishedAt, fetchedAt, query, category: "news",
      tickers, sectors: [], sentiment, sentimentScore: score,
      confidence: 0.6, impactLevel: Math.abs(score) > 0.4 ? "high" : Math.abs(score) > 0.2 ? "medium" : "low",
      relatedSymbols: tickers, rawPayload: n,
    };
  });
}

function tryParseDate(s: string): string {
  const d = new Date(s); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function hashId(s: string): string {
  let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return `sa_${Math.abs(h).toString(36)}`;
}

export async function fetchSerpApiGoogleNews(opts: { query?: string; ticker?: string; limit?: number; light?: boolean }) {
  const light = !!opts.light;
  const engine = light ? "google_news_light" : "google_news";
  const q = opts.query?.trim() || (opts.ticker ? `${opts.ticker.replace(".JK", "")} saham` : "IHSG saham Indonesia");
  const raw = await fetchJson({ engine, q, gl: "id", hl: "id" }, engine, { query: q });
  const items = normalizeNews(raw, q, light);
  return items.slice(0, Math.min(opts.limit ?? 12, 30));
}

// ---------- Google Finance adapter ----------

export type SerpApiFinanceQuote = {
  source: string; symbol: string; googleFinanceSymbol: string;
  companyName: string | null; exchange: string;
  price: number | null; currency: string;
  change: number | null; changePercent: number | null;
  previousClose: number | null; open: number | null;
  dayHigh: number | null; dayLow: number | null;
  yearHigh: number | null; yearLow: number | null;
  marketCap: number | null; volume: number | null; avgVolume: number | null;
  peRatio: number | null; dividendYield: number | null;
  relatedNews: any[]; relatedStocks: any[]; financials: any | null;
  lastUpdatedAt: string; rawPayload: any;
};

function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
}

export async function fetchSerpApiGoogleFinance(symbol: string): Promise<SerpApiFinanceQuote> {
  const gf = convertYahooSymbolToGoogleFinance(symbol);
  const raw = await fetchJson({ engine: "google_finance", q: gf }, "google_finance", { symbol });
  const summary = raw?.summary ?? {};
  const kp = raw?.key_events ?? raw?.knowledge_graph ?? {};
  const stats: any = {};
  for (const s of raw?.key_stats?.stats ?? []) stats[String(s.label ?? "").toLowerCase()] = s.value;
  return {
    source: "SerpApi Google Finance",
    symbol,
    googleFinanceSymbol: gf,
    companyName: summary?.title ?? null,
    exchange: "IDX",
    price: num(summary?.extracted_price ?? summary?.price),
    currency: summary?.currency ?? "IDR",
    change: num(summary?.price_movement?.value),
    changePercent: num(summary?.price_movement?.percentage),
    previousClose: num(stats["previous close"]),
    open: num(stats["open"]),
    dayHigh: num(stats["high"]),
    dayLow: num(stats["low"]),
    yearHigh: num(stats["52-wk high"] ?? stats["year high"]),
    yearLow: num(stats["52-wk low"] ?? stats["year low"]),
    marketCap: num(stats["market cap"]),
    volume: num(stats["avg volume"] ?? stats["volume"]),
    avgVolume: num(stats["avg volume"]),
    peRatio: num(stats["p/e ratio"]),
    dividendYield: num(stats["dividend yield"]),
    relatedNews: raw?.news_results ?? [],
    relatedStocks: raw?.discover_more ?? raw?.related_stocks ?? [],
    financials: raw?.financials ?? null,
    lastUpdatedAt: new Date().toISOString(),
    rawPayload: raw,
  };
}

// ---------- News / Price alignment ----------

export async function computeAlignment(symbol: string) {
  const [news, quote] = await Promise.allSettled([
    fetchSerpApiGoogleNews({ ticker: symbol, limit: 12 }),
    fetchSerpApiGoogleFinance(symbol),
  ]);
  if (news.status !== "fulfilled" || quote.status !== "fulfilled") {
    throw new SerpApiError("market context unavailable", "EMPTY");
  }
  const avg = news.value.length
    ? news.value.reduce((s, n) => s + n.sentimentScore, 0) / news.value.length
    : 0;
  const newsSentiment: "positive"|"neutral"|"negative" = avg > 0.1 ? "positive" : avg < -0.1 ? "negative" : "neutral";
  const ch = quote.value.changePercent ?? 0;
  const priceDirection: "up"|"down"|"flat" = ch > 0.1 ? "up" : ch < -0.1 ? "down" : "flat";
  const aligned =
    (newsSentiment === "positive" && priceDirection === "up") ||
    (newsSentiment === "negative" && priceDirection === "down") ||
    (newsSentiment === "neutral" && priceDirection === "flat");
  const alignment = aligned ? "aligned" : "divergent";
  const confidence = Math.min(0.95, 0.4 + Math.abs(avg) * 0.4 + Math.min(0.3, Math.abs(ch) / 10));
  const reasoning = `Sentimen berita ${newsSentiment} (skor rata-rata ${avg.toFixed(2)}) ` +
    `dan harga bergerak ${priceDirection === "up" ? "naik" : priceDirection === "down" ? "turun" : "datar"} ${ch.toFixed(2)}% — ${alignment === "aligned" ? "sejalan" : "divergen"}.`;

  const row = {
    symbol,
    news_sentiment: newsSentiment,
    price_direction: priceDirection,
    alignment,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    computed_at: new Date().toISOString(),
  };
  try { await supabaseAdmin.from("news_price_alignment").upsert(row as any, { onConflict: "symbol" }); } catch {}
  return { ...row, news: news.value.slice(0, 8), quote: quote.value };
}
