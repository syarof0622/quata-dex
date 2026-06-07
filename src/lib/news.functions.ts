import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function prepareNewsArticleForWrite(article: any) {
  return {
    ...article,
    tickers: article.tickers ?? [],
    sectors: article.sectors ?? [],
    keywords: article.keywords ?? [],
    related_symbols: article.related_symbols ?? [],
    duplicate_sources: article.duplicate_sources ?? [],
    raw_payload: article.raw_payload ?? {},
  };
}

const FilterSchema = z.object({
  limit: z.number().int().min(1).max(100).default(15),
  offset: z.number().int().min(0).max(1000).default(0),
  source: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  ticker: z.string().optional(),
  impactLevel: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().max(100).regex(/^[\p{L}\p{N}\s.\-_'"&]+$/u, "Invalid characters in search").optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  relevanceClass: z.enum([
    "direct_ticker_news","company_name_match","sector_news","macro_news","global_context","irrelevant_noise",
  ]).optional(),
  impactCategory: z.string().max(40).optional(),
  hideNoise: z.boolean().optional(),
  hideDuplicates: z.boolean().optional(),
  language: z.enum(["id", "en"]).optional(),
});

// Simple heuristic patterns used to filter news language at the SQL level.
const LANG_PATTERNS = {
  id: ["%saham%","%rupiah%","%bursa%","%emiten%","%miliar%","%persen%","% yang %","% dan %","% dari %","% untuk %","%laba%","%harga%"],
  en: ["%stocks%","%shares%","%earnings%","%billion%","%percent%","% the %","% and %","% of %","%profit%","%market%","%price%"],
} as const;

export const listNews = createServerFn({ method: "POST" })
  .inputValidator((d) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const from = data.offset;
    const to = data.offset + data.limit - 1;
    let q = supabaseAdmin
      .from("news_articles")
      .select(
        "id, source, title, summary, url, image_url, published_at, sentiment, sentiment_score, impact_level, impact_score, tickers, sectors, ticker_relevance_score, relevance_class, impact_category, event_cluster_id, source_reliability_weight, is_noise, primary_ticker",
        { count: "exact" },
      )
      .order("published_at", { ascending: false })
      .range(from, to);

    if (data.hideDuplicates !== false) q = q.eq("is_duplicate", false);
    if (data.hideNoise) q = q.eq("is_noise", false);
    if (data.source) q = q.eq("source", data.source);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    if (data.impactLevel) q = q.eq("impact_level", data.impactLevel);
    if (data.relevanceClass) q = q.eq("relevance_class", data.relevanceClass);
    if (data.impactCategory) q = q.eq("impact_category", data.impactCategory);
    if (data.ticker) q = q.contains("tickers", [data.ticker.toUpperCase()]);
    if (data.search) {
      const safe = data.search.trim()
        .replace(/[,()%_*\\]/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 80);
      if (safe) q = q.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`);
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

    // Fallback to last persisted snapshot when 24h is empty (worker failure / off-hours).
    if (total === 0) {
      const { data: snap } = await supabaseAdmin
        .from("news_sentiment_snapshots")
        .select("*")
        .eq("window_key", "24h")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snap) {
        const s = snap as any;
        return {
          counts: {
            positive: s.positive_count ?? 0,
            neutral: s.neutral_count ?? 0,
            negative: s.negative_count ?? 0,
            total: (s.positive_count ?? 0) + (s.neutral_count ?? 0) + (s.negative_count ?? 0),
          },
          sentimentScore: Math.round(Number(s.sentiment_score ?? 0)),
          label: (s.label as string) ?? "Stale",
          highImpactCount: s.high_impact_count ?? 0,
          topPositive: (s.top_bullish ?? []) as { symbol: string; score: number; count: number }[],
          topNegative: (s.top_bearish ?? []) as { symbol: string; score: number; count: number }[],
          stale: true as const,
          snapshotAt: s.created_at as string,
        };
      }
    }

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
      stale: false as const,
    };
  });

/** Compact news context for AI Analyst — explains freshness & worker health. */
export const getNewsContextForAI = createServerFn({ method: "POST" })
  .handler(async () => {
    const [{ data: lastRun }, { data: sources }, { data: snap }] = await Promise.all([
      supabaseAdmin.from("news_pipeline_runs").select("status, finished_at, inserted_count, failed_sources, successful_sources, error_message").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("news_source_health").select("source_key, status, last_success_at, last_error, http_status").order("source_key"),
      supabaseAdmin.from("news_sentiment_snapshots").select("created_at, sentiment_score, label, positive_count, neutral_count, negative_count, high_impact_count").eq("window_key", "24h").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const lr = lastRun as any;
    const srcs = (sources ?? []) as any[];
    const failing = srcs.filter((s) => s.status !== "ok" && s.status !== "active");
    const lastSuccessAt = srcs.reduce<string | null>((m, s) => (s.last_success_at && (!m || s.last_success_at > m) ? s.last_success_at : m), null);
    const minSince = lastSuccessAt ? Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 60000) : null;
    return {
      lastRun: lr ?? null,
      lastRunStatus: lr?.status ?? "unknown",
      lastSuccessAt,
      minutesSinceLastSuccess: minSince,
      activeSources: srcs.filter((s) => s.status === "ok" || s.status === "active").map((s) => s.source_key),
      failingSources: failing.map((s) => ({ key: s.source_key, error: s.last_error, http: s.http_status })),
      snapshot: snap ?? null,
      freshness:
        minSince == null ? "unknown" :
        minSince < 60 ? "fresh" :
        minSince < 6 * 60 ? "recent" :
        minSince < 24 * 60 ? "aging" : "stale",
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
    const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
    try {
      // Heavy pipeline: cap to 2/min and 10/hr per IP.
      enforceRateLimit("refresh_news_min", 2, 60_000);
      enforceRateLimit("refresh_news_hr", 10, 60 * 60_000);
    } catch (e) {
      if (e instanceof RateLimitError) {
        return {
          ok: false, total: 0, deduped: 0, inserted: 0, duplicates: 0,
          statuses: [], pipelineStatus: "rate_limited", errorMessage: e.message,
        };
      }
      throw e;
    }
    const { runNewsIngest } = await import("@/lib/news-pipeline-runner.server");
    const result = await runNewsIngest({ trigger: "manual" });
    return {
      ok: result.status !== "failed",
      total: result.fetched_count,
      deduped: result.fetched_count - result.duplicate_count,
      inserted: result.inserted_count,
      duplicates: result.duplicate_count,
      statuses: result.source_results,
      pipelineStatus: result.status,
      errorMessage: result.error_message,
    };
  });

export const getNewsPipelineState = createServerFn({ method: "POST" })
  .handler(async () => {
    const [{ data: state }, { data: lastRun }, { data: sources }, { data: snap }] =
      await Promise.all([
        supabaseAdmin.from("news_worker_state").select("*").eq("singleton", true).maybeSingle(),
        supabaseAdmin.from("news_pipeline_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from("news_source_health").select("*").order("source_key"),
        supabaseAdmin.from("news_sentiment_snapshots").select("*").eq("window_key", "24h").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
    return {
      worker: state ?? null,
      lastRun: lastRun ?? null,
      sources: sources ?? [],
      snapshot: snap ?? null,
    };
  });

// Per-ticker SerpApi enrichment: fetches Google News + Finance for one symbol,
// stores articles + price alignment, and refreshes the ticker's sentiment summary.
export const ingestTickerSerpApi = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    if (!process.env.SERPAPI_API_KEY) {
      return { ok: false, reason: "no_key" as const, inserted: 0 };
    }
    const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
    try {
      enforceRateLimit("serpapi_ticker_min", 5, 60_000);
      enforceRateLimit("serpapi_ticker_hr", 30, 60 * 60_000);
    } catch (e) {
      if (e instanceof RateLimitError) {
        return { ok: false, reason: "rate_limited" as const, inserted: 0, error: e.message };
      }
      throw e;
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
        const { error } = await supabaseAdmin.from("news_articles").upsert(deduped.map(prepareNewsArticleForWrite) as any, { onConflict: "source,source_id", ignoreDuplicates: true });
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

/** Per-ticker news freshness summary used by AI Agent + Analyst. */
export const getTickerNewsFreshness = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase().endsWith(".JK")
      ? data.symbol.toUpperCase()
      : `${data.symbol.toUpperCase()}.JK`;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("news_articles")
      .select("title, source, published_at, sentiment, sentiment_score, impact_level, impact_category, relevance_class, ticker_relevance_score, source_reliability_weight, is_noise, event_cluster_id")
      .or(`tickers.cs.{${sym}},tickers.cs.{${sym.replace(/\.JK$/i, "")}}`)
      .gte("published_at", since)
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(40);
    const list = (rows ?? []) as any[];
    const fresh = list.filter((r) => !r.is_noise && r.relevance_class !== "irrelevant_noise");
    const highImpact = fresh.filter((r) => r.impact_level === "high");
    // Dedup sentiment by event cluster (one vote per cluster, weighted by source reliability)
    const clusters = new Map<string, { sum: number; weight: number; src: string }>();
    for (const r of fresh) {
      const key = r.event_cluster_id ?? `${r.source}-${r.title}`;
      const w = Number(r.source_reliability_weight ?? 0.65);
      const cur = clusters.get(key) ?? { sum: 0, weight: 0, src: r.source };
      cur.sum += Number(r.sentiment_score ?? 0) * w;
      cur.weight += w;
      clusters.set(key, cur);
    }
    let sumW = 0, wtot = 0;
    for (const c of clusters.values()) { sumW += c.sum; wtot += c.weight; }
    const sentimentScore24h = wtot > 0 ? Math.round((sumW / wtot) * 100) / 100 : 0;
    const reliabilities = fresh.map((r) => Number(r.source_reliability_weight ?? 0.65));
    const reliabilityAvg = reliabilities.length
      ? Math.round((reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length) * 100) / 100
      : 0;
    const latest = fresh[0]?.published_at ?? null;
    const ageMin = latest ? Math.round((Date.now() - new Date(latest).getTime()) / 60000) : null;
    const dataFreshness =
      ageMin == null ? "stale" :
      ageMin < 60 ? "fresh" :
      ageMin < 6 * 60 ? "recent" :
      ageMin < 24 * 60 ? "aging" : "stale";
    return {
      symbol: sym,
      latestNewsAt: latest,
      freshNewsCount24h: fresh.length,
      highImpactNewsCount24h: highImpact.length,
      eventClusterCount: clusters.size,
      sentimentScore24h,
      sourceReliabilityAvg: reliabilityAvg,
      dataFreshness,
      topClusters: [...clusters.entries()].slice(0, 5).map(([id, v]) => ({ id, weight: Math.round(v.weight * 100) / 100 })),
    };
  });
