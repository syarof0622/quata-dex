import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FilterSchema = z.object({
  limit: z.number().int().min(1).max(100).default(15),
  offset: z.number().int().min(0).max(1000).default(0),
  source: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  ticker: z.string().optional(),
  impactLevel: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const listNews = createServerFn({ method: "POST" })
  .inputValidator((d) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const from = data.offset;
    const to = data.offset + data.limit - 1;
    let q = supabaseAdmin
      .from("news_articles")
      .select(
        "id, source, title, summary, url, image_url, published_at, sentiment, sentiment_score, impact_level, impact_score, tickers, sectors",
        { count: "exact" },
      )
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .range(from, to);

    if (data.source) q = q.eq("source", data.source);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    if (data.impactLevel) q = q.eq("impact_level", data.impactLevel);
    if (data.ticker) q = q.contains("tickers", [data.ticker.toUpperCase()]);
    if (data.search) {
      const term = data.search.trim().replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
    }
    if (data.fromDate) q = q.gte("published_at", data.fromDate);
    if (data.toDate) q = q.lte("published_at", data.toDate);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getMarketSentiment = createServerFn({ method: "POST" })
  .handler(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("news_articles")
      .select("sentiment, sentiment_score, impact_level, impact_score, tickers")
      .gte("published_at", since)
      .eq("is_duplicate", false);
    if (error) throw new Error(error.message);

    let pos = 0, neg = 0, neu = 0, sumScore = 0, highImpact = 0;
    const byTicker = new Map<string, { score: number; n: number }>();
    for (const r of (data ?? []) as any[]) {
      if (r.sentiment === "positive") pos++;
      else if (r.sentiment === "negative") neg++;
      else neu++;
      sumScore += Number(r.sentiment_score ?? 0);
      if (r.impact_level === "high") highImpact++;
      for (const t of (r.tickers ?? []) as string[]) {
        const cur = byTicker.get(t) ?? { score: 0, n: 0 };
        cur.score += Number(r.sentiment_score ?? 0);
        cur.n += 1;
        byTicker.set(t, cur);
      }
    }
    const total = pos + neg + neu;
    const avg = total ? sumScore / total : 0;
    const scaled = Math.round(avg * 100);
    const label = scaled > 30 ? "Bullish" : scaled > 10 ? "Mildly Bullish" : scaled < -30 ? "Bearish" : scaled < -10 ? "Mildly Bearish" : "Neutral";

    const tickerRanked = [...byTicker.entries()]
      .map(([symbol, v]) => ({ symbol, score: Math.round((v.score / Math.max(1, v.n)) * 100) / 100, count: v.n }))
      .filter((t) => t.count >= 2);
    const topPositive = [...tickerRanked].sort((a, b) => b.score - a.score).slice(0, 5);
    const topNegative = [...tickerRanked].sort((a, b) => a.score - b.score).slice(0, 5);

    return {
      counts: { positive: pos, neutral: neu, negative: neg, total },
      sentimentScore: scaled,
      label,
      highImpactCount: highImpact,
      topPositive,
      topNegative,
    };
  });

export const getTickerNews = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string(), limit: z.number().int().min(1).max(50).default(20) }).parse(d))
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase().endsWith(".JK") ? data.symbol.toUpperCase() : `${data.symbol.toUpperCase()}.JK`;
    const { data: rows, error } = await supabaseAdmin
      .from("news_articles")
      .select("id, source, title, summary, url, image_url, published_at, sentiment, sentiment_score, impact_level, impact_score, tickers")
      .contains("tickers", [sym])
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTickerSentiment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase().endsWith(".JK") ? data.symbol.toUpperCase() : `${data.symbol.toUpperCase()}.JK`;
    const { data: row } = await supabaseAdmin
      .from("ticker_sentiment_summary")
      .select("*")
      .eq("symbol", sym)
      .maybeSingle();
    return row ?? null;
  });

export const getSourcesStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("news_sources")
      .select("id, name, status, priority, last_success_at, last_failed_at, last_error, articles_today, enabled")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const refreshNewsNow = createServerFn({ method: "POST" })
  .handler(async () => {
    const { NEWS_SOURCES } = await import("@/lib/news-sources");
    const { fetchRssWithFallback } = await import("@/lib/news-rss.server");
    const { normalize, normalizeSerpApiItem, dedupeBatch } = await import("@/lib/news-pipeline.server");
    const { fetchSerpApiGoogleNews } = await import("@/lib/serpapi.server");

    const all: any[] = [];
    const statuses: any[] = [];
    for (const src of NEWS_SOURCES.filter((s) => s.enabled)) {
      try {
        const { url, items } = await fetchRssWithFallback(src.url, src.fallbackUrls ?? []);
        const normalized = items.map((it) => normalize(it, { id: src.id, priority: src.priority, category: src.category })).filter(Boolean) as any[];
        all.push(...normalized);
        statuses.push({ id: src.id, ok: true, count: normalized.length, used_url: url });
      } catch (e: any) {
        statuses.push({ id: src.id, ok: false, error: String(e?.message ?? e) });
      }
    }

    if (process.env.SERPAPI_API_KEY) {
      const SERP_QUERY = "IHSG OR saham OR emiten OR BEI";
      for (const job of [
        { id: "serpapi_google_news", priority: 2, light: false },
        { id: "serpapi_google_news_light", priority: 3, light: true },
      ]) {
        try {
          const items = await fetchSerpApiGoogleNews({ query: SERP_QUERY, light: job.light, limit: 20 });
          const normalized = items
            .map((it) => normalizeSerpApiItem(it, { id: job.id, priority: job.priority, category: "serpapi" }))
            .filter(Boolean) as any[];
          all.push(...normalized);
          statuses.push({ id: job.id, ok: true, count: normalized.length });
        } catch (e: any) {
          statuses.push({ id: job.id, ok: false, error: String(e?.message ?? e) });
        }
      }
      statuses.push({ id: "serpapi_google_finance", ok: true, count: 0 });
    }

    const deduped = dedupeBatch(all);
    const now = new Date().toISOString();
    let upsertErrors: string[] = [];
    for (let i = 0; i < deduped.length; i += 100) {
      const chunk = deduped.slice(i, i + 100);
      const { error } = await supabaseAdmin
        .from("news_articles")
        .upsert(chunk as any, { onConflict: "source,source_id", ignoreDuplicates: true });
      if (error) {
        console.error("[news] upsert error:", error.message);
        upsertErrors.push(error.message);
      }
    }
    for (const s of statuses) {
      await supabaseAdmin.from("news_sources").update(
        s.ok
          ? { last_success_at: now, status: "active", fail_count: 0, last_error: null, articles_today: s.count, updated_at: now }
          : { last_failed_at: now, status: "failed", last_error: s.error, updated_at: now }
      ).eq("id", s.id);
    }
    return { ok: upsertErrors.length === 0, total: all.length, deduped: deduped.length, statuses, upsertErrors };
  });

// Per-ticker SerpApi enrichment: fetches Google News + Finance for one symbol,
// stores articles + price alignment, and refreshes the ticker's sentiment summary.
export const ingestTickerSerpApi = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    if (!process.env.SERPAPI_API_KEY) {
      return { ok: false, reason: "no_key" as const, inserted: 0 };
    }
    const sym = data.symbol.toUpperCase();
    const sqlSym = sym.endsWith(".JK") ? sym : `${sym}.JK`;
    const { fetchSerpApiGoogleNews, computeAlignment, SerpApiError } = await import("@/lib/serpapi.server");
    const { normalizeSerpApiItem, dedupeBatch } = await import("@/lib/news-pipeline.server");

    let inserted = 0;
    let alignmentOk = false;
    let errors: string[] = [];

    // 1) News ingest
    try {
      const items = await fetchSerpApiGoogleNews({ ticker: sqlSym, limit: 12 });
      const normalized = items
        .map((it) => normalizeSerpApiItem(it, { id: "serpapi_google_news", priority: 2, category: "serpapi" }))
        .filter(Boolean) as any[];
      // Force ticker association even if regex missed it
      for (const a of normalized) {
        if (!a.tickers.includes(sqlSym)) a.tickers = [...a.tickers, sqlSym];
        if (!a.related_symbols.includes(sqlSym)) a.related_symbols = [...a.related_symbols, sqlSym];
      }
      const deduped = dedupeBatch(normalized);
      if (deduped.length) {
        const { error } = await supabaseAdmin.from("news_articles").upsert(deduped as any, { onConflict: "source,source_id", ignoreDuplicates: true });
        if (error) errors.push(error.message);
        else inserted = deduped.length;
      }
    } catch (e: any) {
      errors.push(`news: ${e?.message ?? e}`);
    }

    // 2) Price alignment + finance snapshot
    try {
      await computeAlignment(sqlSym);
      alignmentOk = true;
    } catch (e: any) {
      errors.push(`alignment: ${e?.message ?? e}`);
    }

    // 3) Refresh just this ticker's 24h sentiment summary
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("news_articles")
      .select("sentiment, sentiment_score, impact_level, published_at")
      .contains("tickers", [sqlSym])
      .gte("published_at", since)
      .eq("is_duplicate", false);
    if (rows && rows.length) {
      let pos = 0, neu = 0, neg = 0, sum = 0, high = 0, latest = since;
      for (const r of rows as any[]) {
        if (r.sentiment === "positive") pos++;
        else if (r.sentiment === "negative") neg++;
        else neu++;
        sum += Number(r.sentiment_score ?? 0);
        if (r.impact_level === "high") high++;
        if (r.published_at > latest) latest = r.published_at;
      }
      await supabaseAdmin.from("ticker_sentiment_summary").upsert({
        symbol: sqlSym,
        positive_count: pos,
        neutral_count: neu,
        negative_count: neg,
        average_sentiment_score: Math.round((sum / rows.length) * 100) / 100,
        high_impact_news_count: high,
        latest_news_at: latest,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "symbol" });
    }

    return { ok: errors.length === 0, inserted, alignmentOk, errors, symbol: sqlSym };
  });
