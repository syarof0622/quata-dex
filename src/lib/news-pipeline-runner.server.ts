// Shared news ingestion runner. Used by both the cron endpoint and the
// manual refresh server fn. Instruments every run into news_pipeline_runs,
// news_source_health, news_sentiment_snapshots, and news_worker_state.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { fetchRssWithFallback } from "@/lib/news-rss.server";
import {
  normalize,
  normalizeSerpApiItem,
  dedupeBatch,
  type NormalizedArticle,
} from "@/lib/news-pipeline.server";
import { fetchSerpApiGoogleNews, SerpApiError } from "@/lib/serpapi.server";
import { fetchSpecialSource } from "@/lib/news-special-sources.server";

export type SourceResult = {
  source_key: string;
  source_name: string;
  source_type: string;
  ok: boolean;
  status: string;            // healthy | partial | fallback | quota_protected | rate_limited | failed | disabled | stale
  fetched: number;
  inserted: number;
  used_url?: string | null;
  mode?: string | null;
  message?: string | null;
  error?: string | null;
  http_status?: number | null;
  fallback_active: boolean;
  quota_protected: boolean;
};

export type PipelineRunResult = {
  status:
    | "success"
    | "partial"
    | "failed"
    | "no_new_articles"
    | "skipped_quota_protection";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  total_sources: number;
  successful_sources: number;
  failed_sources: number;
  fallback_sources: number;
  quota_protected_sources: number;
  fetched_count: number;
  inserted_count: number;
  duplicate_count: number;
  skipped_count: number;
  failed_count: number;
  error_message: string | null;
  source_results: SourceResult[];
  snapshot: SnapshotResult | null;
};

export type SnapshotResult = {
  window_key: "24h";
  freshness: "fresh" | "partial" | "stale" | "unavailable";
  article_count: number;
  sentiment_score: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  high_impact_count: number;
  top_bullish: { symbol: string; score: number }[];
  top_bearish: { symbol: string; score: number }[];
  source_breakdown: Record<string, number>;
  latest_article_at: string | null;
};

const NEXT_RUN_GAP_MIN = 15;

function prepareArticleForWrite(article: NormalizedArticle): NormalizedArticle {
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

export async function runNewsIngest(opts?: {
  trigger?: "cron" | "manual";
}): Promise<PipelineRunResult> {
  const trigger = opts?.trigger ?? "cron";
  const started = Date.now();
  const startedIso = new Date(started).toISOString();

  const collected: NormalizedArticle[] = [];
  const results: SourceResult[] = [];

  // 1) Standard configured sources — run in parallel so total time ≈ slowest source.
  const sourceTasks: Promise<{ items: NormalizedArticle[]; result: SourceResult }>[] =
    NEWS_SOURCES.filter((s) => s.enabled).map(async (src) => {
      const base = {
        source_key: src.id,
        source_name: src.name,
        source_type: src.type,
        fallback_active: false,
        quota_protected: false,
        inserted: 0,
      };
      try {
        if (src.type === "special_source" && src.special) {
          const res = await fetchSpecialSource(src);
          const ok = res.items.length > 0;
          const usedFallback = res.mode === "fallback";
          return {
            items: res.items,
            result: {
              ...base,
              ok,
              status: ok ? (usedFallback ? "fallback" : "healthy") : "failed",
              fetched: res.items.length,
              used_url: res.usedUrl ?? null,
              mode: res.mode ?? null,
              message: res.reason ?? null,
              error: ok ? null : (res.fallbackError ?? res.directError ?? "no items"),
              fallback_active: usedFallback,
              quota_protected: false,
            } as SourceResult,
          };
        }
        const { url, items } = await fetchRssWithFallback(
          src.url,
          src.fallbackUrls ?? [],
        );
        const normalized = items
          .map((it) =>
            normalize(it, {
              id: src.id,
              priority: src.priority,
              category: src.category,
            }),
          )
          .filter((x): x is NormalizedArticle => x !== null);
        const usedFallback = url !== src.url;
        return {
          items: normalized,
          result: {
            ...base,
            ok: true,
            status: usedFallback ? "fallback" : "healthy",
            fetched: normalized.length,
            used_url: url,
            mode: usedFallback ? "fallback" : "direct",
            message: null,
            error: null,
            fallback_active: usedFallback,
            quota_protected: false,
          } as SourceResult,
        };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const httpMatch = msg.match(/HTTP\s+(\d{3})/i);
        const httpStatus = httpMatch ? Number(httpMatch[1]) : null;
        return {
          items: [],
          result: {
            ...base,
            ok: false,
            status: httpStatus === 429 ? "rate_limited" : "failed",
            fetched: 0,
            message: null,
            error: msg.slice(0, 400),
            http_status: httpStatus,
            fallback_active: false,
            quota_protected: false,
          } as SourceResult,
        };
      }
    });

  // 2) SerpApi enrichment — in parallel with the standard sources.
  const serpTasks: Promise<{ items: NormalizedArticle[]; result: SourceResult }>[] = [];
  if (process.env.SERPAPI_API_KEY) {
    const SERP_QUERY = "IHSG OR saham OR emiten OR BEI";
    const jobs: { id: string; name: string; priority: number; light: boolean }[] = [
      { id: "serpapi_google_news", name: "SerpApi Google News", priority: 2, light: false },
      { id: "serpapi_google_news_light", name: "SerpApi Google News (light)", priority: 3, light: true },
    ];
    for (const job of jobs) {
      serpTasks.push(
        (async () => {
          try {
            const items = await fetchSerpApiGoogleNews({
              query: SERP_QUERY,
              light: job.light,
              limit: 20,
            });
            const normalized = items
              .map((it) =>
                normalizeSerpApiItem(it, {
                  id: job.id,
                  priority: job.priority,
                  category: "serpapi",
                }),
              )
              .filter((x): x is NormalizedArticle => x !== null);
            return {
              items: normalized,
              result: {
                source_key: job.id,
                source_name: job.name,
                source_type: "serpapi",
                ok: true,
                status: "healthy",
                fetched: normalized.length,
                inserted: 0,
                fallback_active: false,
                quota_protected: false,
              } as SourceResult,
            };
          } catch (e: any) {
            const isQuota = e instanceof SerpApiError && e.code === "QUOTA";
            return {
              items: [],
              result: {
                source_key: job.id,
                source_name: job.name,
                source_type: "serpapi",
                ok: isQuota,
                status: isQuota ? "quota_protected" : "failed",
                fetched: 0,
                inserted: 0,
                message: isQuota ? "Skipped by quota protection" : null,
                error: isQuota ? null : String(e?.message ?? e).slice(0, 400),
                fallback_active: false,
                quota_protected: isQuota,
              } as SourceResult,
            };
          }
        })(),
      );
    }
  }

  const settled = await Promise.allSettled([...sourceTasks, ...serpTasks]);
  for (const s of settled) {
    if (s.status === "fulfilled") {
      collected.push(...s.value.items);
      results.push(s.value.result);
    }
  }

  // 3) Dedup + upsert
  const deduped = dedupeBatch(collected);
  const duplicateCount = Math.max(0, collected.length - deduped.length);
  let insertedCount = 0;
  const upsertErrors: string[] = [];

  for (let i = 0; i < deduped.length; i += 100) {
    const chunk = deduped.slice(i, i + 100).map(prepareArticleForWrite);
    const { error, count } = await supabaseAdmin
      .from("news_articles")
      .upsert(chunk as any, {
        onConflict: "source,source_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) {
      console.error("[news-ingest] upsert error:", error.message);
      upsertErrors.push(error.message);
    } else {
      insertedCount += count ?? 0;
    }
  }

  // 4) Distribute inserted estimate by source share of fetched
  const totalFetched = results.reduce((a, r) => a + r.fetched, 0);
  if (totalFetched > 0) {
    for (const r of results) {
      r.inserted = Math.round((r.fetched / totalFetched) * insertedCount);
    }
  }

  // 5) Update news_source_health
  await persistSourceHealth(results);

  // Refresh 24h counts on health records
  await refresh24hSourceCounts();

  // 6) Compute + persist 24h snapshot
  const snapshot = await computeAndPersistSnapshot();

  // 7) Aggregate run status
  const successfulSources = results.filter((r) => r.ok && r.status === "healthy").length;
  const fallbackSources = results.filter((r) => r.fallback_active).length;
  const quotaSources = results.filter((r) => r.quota_protected).length;
  const failedSources = results.filter((r) => !r.ok).length;
  const activeOk = results.filter((r) => r.ok).length;

  let status: PipelineRunResult["status"];
  if (activeOk === 0) status = "failed";
  else if (failedSources > 0 || fallbackSources > 0 || quotaSources > 0)
    status = "partial";
  else if (insertedCount === 0 && deduped.length === 0) status = "no_new_articles";
  else status = "success";

  const finished = Date.now();
  const finishedIso = new Date(finished).toISOString();
  const errorMessage = upsertErrors.length
    ? `upsert: ${upsertErrors.join("; ")}`.slice(0, 600)
    : failedSources > 0
      ? results.filter((r) => !r.ok).map((r) => `${r.source_key}: ${r.error ?? ""}`).join(" | ").slice(0, 600)
      : null;

  // 8) Persist run row
  await supabaseAdmin.from("news_pipeline_runs").insert({
    run_type: trigger,
    status,
    started_at: startedIso,
    finished_at: finishedIso,
    duration_ms: finished - started,
    total_sources: results.length,
    successful_sources: successfulSources,
    failed_sources: failedSources,
    fallback_sources: fallbackSources,
    quota_protected_sources: quotaSources,
    fetched_count: totalFetched,
    inserted_count: insertedCount,
    duplicate_count: duplicateCount,
    skipped_count: 0,
    failed_count: failedSources,
    error_message: errorMessage,
    source_results: results as any,
    trigger_source: trigger,
  } as any);

  // 9) Update singleton heartbeat
  await upsertWorkerState({
    runIso: finishedIso,
    status,
    message: errorMessage ?? (status === "success" ? "ok" : status),
    success: status === "success" || status === "partial" || status === "no_new_articles",
  });

  return {
    status,
    started_at: startedIso,
    finished_at: finishedIso,
    duration_ms: finished - started,
    total_sources: results.length,
    successful_sources: successfulSources,
    failed_sources: failedSources,
    fallback_sources: fallbackSources,
    quota_protected_sources: quotaSources,
    fetched_count: totalFetched,
    inserted_count: insertedCount,
    duplicate_count: duplicateCount,
    skipped_count: 0,
    failed_count: failedSources,
    error_message: errorMessage,
    source_results: results,
    snapshot,
  };
}

async function persistSourceHealth(results: SourceResult[]) {
  const now = new Date().toISOString();
  for (const r of results) {
    // Read existing to preserve consecutive_failures and historical timestamps
    const { data: existing } = await supabaseAdmin
      .from("news_source_health")
      .select("consecutive_failures, last_success_at, last_failed_at")
      .eq("source_key", r.source_key)
      .maybeSingle();
    const prevFails = (existing as any)?.consecutive_failures ?? 0;
    const consecutive_failures = r.ok ? 0 : prevFails + 1;

    const row = {
      source_key: r.source_key,
      source_name: r.source_name,
      source_type: r.source_type,
      status: r.status,
      last_attempt_at: now,
      last_success_at: r.ok ? now : (existing as any)?.last_success_at ?? null,
      last_failed_at: r.ok ? (existing as any)?.last_failed_at ?? null : now,
      last_message: r.message ?? null,
      last_error: r.ok ? null : r.error ?? null,
      http_status: r.http_status ?? null,
      fallback_active: r.fallback_active,
      quota_protected: r.quota_protected,
      consecutive_failures,
      updated_at: now,
    };
    await supabaseAdmin.from("news_source_health").upsert(row as any, {
      onConflict: "source_key",
    });

    // Mirror into legacy news_sources for backward compat
    await supabaseAdmin.from("news_sources").update(
      r.ok
        ? {
            last_success_at: now,
            status: r.status === "fallback" ? "fallback" : r.status === "quota_protected" ? "quota_protected" : "active",
            fail_count: 0,
            last_error: r.message ?? null,
            articles_today: r.fetched,
            updated_at: now,
          }
        : {
            last_failed_at: now,
            status: r.status,
            last_error: (r.error ?? "unknown").slice(0, 300),
            updated_at: now,
          },
    ).eq("id", r.source_key);
  }
}

async function refresh24hSourceCounts() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("news_articles")
    .select("source")
    .gte("published_at", since)
    .eq("is_duplicate", false)
    .limit(5000);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
  }
  const now = new Date().toISOString();
  for (const [source_key, n] of counts.entries()) {
    await supabaseAdmin
      .from("news_source_health")
      .update({ fetched_count_24h: n, inserted_count_24h: n, updated_at: now })
      .eq("source_key", source_key);
  }
}

async function computeAndPersistSnapshot(): Promise<SnapshotResult> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("news_articles")
    .select("source, sentiment, sentiment_score, impact_level, tickers, published_at")
    .gte("published_at", since)
    .eq("is_duplicate", false)
    .order("published_at", { ascending: false })
    .limit(2000);

  const rows = (data ?? []) as any[];
  let pos = 0, neg = 0, neu = 0, high = 0, sum = 0;
  const byTicker = new Map<string, { score: number; n: number }>();
  const breakdown: Record<string, number> = {};
  let latest: string | null = null;
  for (const r of rows) {
    if (r.sentiment === "positive") pos++;
    else if (r.sentiment === "negative") neg++;
    else neu++;
    sum += Number(r.sentiment_score ?? 0);
    if (r.impact_level === "high") high++;
    breakdown[r.source] = (breakdown[r.source] ?? 0) + 1;
    if (!latest || r.published_at > latest) latest = r.published_at;
    for (const t of (r.tickers ?? []) as string[]) {
      const cur = byTicker.get(t) ?? { score: 0, n: 0 };
      cur.score += Number(r.sentiment_score ?? 0);
      cur.n += 1;
      byTicker.set(t, cur);
    }
  }
  const total = pos + neg + neu;
  const sentimentScore = total
    ? Math.round((sum / total) * 100)
    : 0;
  const ranked = [...byTicker.entries()]
    .map(([symbol, v]) => ({
      symbol,
      score: Math.round((v.score / Math.max(1, v.n)) * 100) / 100,
      count: v.n,
    }))
    .filter((t) => t.count >= 2);
  const top_bullish = [...ranked].sort((a, b) => b.score - a.score).slice(0, 5);
  const top_bearish = [...ranked].sort((a, b) => a.score - b.score).slice(0, 5);

  const ageMin = latest
    ? Math.round((Date.now() - new Date(latest).getTime()) / 60000)
    : null;
  let freshness: SnapshotResult["freshness"];
  if (total === 0) freshness = "unavailable";
  else if (ageMin == null) freshness = "stale";
  else if (ageMin < 90) freshness = "fresh";
  else if (ageMin < 360) freshness = "partial";
  else freshness = "stale";

  const snap: SnapshotResult = {
    window_key: "24h",
    freshness,
    article_count: total,
    sentiment_score: sentimentScore,
    positive_count: pos,
    neutral_count: neu,
    negative_count: neg,
    high_impact_count: high,
    top_bullish,
    top_bearish,
    source_breakdown: breakdown,
    latest_article_at: latest,
  };

  // Only persist non-empty snapshots — preserves the last successful aggregate
  // when this run produced no fresh data.
  if (total > 0) {
    await supabaseAdmin.from("news_sentiment_snapshots").insert({
      window_key: "24h",
      freshness,
      article_count: total,
      sentiment_score: sentimentScore,
      positive_count: pos,
      neutral_count: neu,
      negative_count: neg,
      high_impact_count: high,
      top_bullish: top_bullish as any,
      top_bearish: top_bearish as any,
      source_breakdown: breakdown as any,
    } as any);
  }
  return snap;
}

async function upsertWorkerState(p: {
  runIso: string;
  status: string;
  message: string;
  success: boolean;
}) {
  const next = new Date(Date.now() + NEXT_RUN_GAP_MIN * 60_000).toISOString();
  const { data: existing } = await supabaseAdmin
    .from("news_worker_state")
    .select("news_worker_error_count, last_successful_news_run_at")
    .eq("singleton", true)
    .maybeSingle();
  const errCount = p.success
    ? 0
    : ((existing as any)?.news_worker_error_count ?? 0) + 1;
  await supabaseAdmin
    .from("news_worker_state")
    .update({
      last_news_worker_run_at: p.runIso,
      last_successful_news_run_at: p.success
        ? p.runIso
        : (existing as any)?.last_successful_news_run_at ?? null,
      next_expected_news_worker_run_at: next,
      news_worker_status: p.status,
      last_news_worker_message: p.message.slice(0, 400),
      news_worker_error_count: errCount,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton", true);
}

export async function recordUnauthorizedRun(trigger: string, message: string) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("news_pipeline_runs").insert({
    run_type: trigger,
    status: "unauthorized",
    started_at: now,
    finished_at: now,
    duration_ms: 0,
    error_message: message,
    trigger_source: trigger,
  } as any);
  const { data: existing } = await supabaseAdmin
    .from("news_worker_state")
    .select("news_worker_error_count")
    .eq("singleton", true)
    .maybeSingle();
  await supabaseAdmin
    .from("news_worker_state")
    .update({
      last_news_worker_run_at: now,
      news_worker_status: "unauthorized",
      last_news_worker_message: message.slice(0, 400),
      news_worker_error_count:
        ((existing as any)?.news_worker_error_count ?? 0) + 1,
      updated_at: now,
    })
    .eq("singleton", true);
}
