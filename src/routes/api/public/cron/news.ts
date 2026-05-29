// Public cron endpoint: refresh news from all enabled sources.
// Called by pg_cron every 10 minutes.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { fetchRssWithFallback } from "@/lib/news-rss.server";
import { normalize, normalizeSerpApiItem, dedupeBatch, type NormalizedArticle } from "@/lib/news-pipeline.server";
import { fetchSerpApiGoogleNews } from "@/lib/serpapi.server";
import { fetchSpecialSource } from "@/lib/news-special-sources.server";

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

async function refreshAll() {
  const allNew: NormalizedArticle[] = [];
  const sourceStatus: { id: string; ok: boolean; count: number; error?: string; used_url?: string; mode?: string; status?: string; reason?: string }[] = [];

  for (const src of NEWS_SOURCES.filter((s) => s.enabled)) {
    try {
      if (src.type === "special_source" && src.special) {
        const res = await fetchSpecialSource(src);
        allNew.push(...res.items);
        sourceStatus.push({
          id: src.id,
          ok: res.items.length > 0,
          count: res.items.length,
          used_url: res.usedUrl,
          mode: res.mode,
          status: res.status,
          reason: res.reason,
          error: res.items.length === 0 ? (res.fallbackError ?? res.directError) : undefined,
        });
        continue;
      }
      const { url, items } = await fetchRssWithFallback(src.url, src.fallbackUrls ?? []);
      const normalized = items
        .map((it) => normalize(it, { id: src.id, priority: src.priority, category: src.category }))
        .filter((x): x is NormalizedArticle => x !== null);
      allNew.push(...normalized);
      sourceStatus.push({ id: src.id, ok: true, count: normalized.length, used_url: url, mode: "direct", status: "active" });
    } catch (e: any) {
      sourceStatus.push({ id: src.id, ok: false, count: 0, error: String(e?.message ?? e), status: "failed" });
    }
  }

  // ----- SerpApi enrichment (optional, key-gated, quota-protected) -----
  if (process.env.SERPAPI_API_KEY) {
    const SERP_QUERY = "IHSG OR saham OR emiten OR BEI";
    const serpJobs: { id: string; priority: number; light: boolean }[] = [
      { id: "serpapi_google_news", priority: 2, light: false },
      { id: "serpapi_google_news_light", priority: 3, light: true },
    ];
    for (const job of serpJobs) {
      try {
        const items = await fetchSerpApiGoogleNews({ query: SERP_QUERY, light: job.light, limit: 20 });
        const normalized = items
          .map((it) => normalizeSerpApiItem(it, { id: job.id, priority: job.priority, category: "serpapi" }))
          .filter((x): x is NormalizedArticle => x !== null);
        allNew.push(...normalized);
        sourceStatus.push({ id: job.id, ok: true, count: normalized.length });
      } catch (e: any) {
        sourceStatus.push({ id: job.id, ok: false, count: 0, error: String(e?.message ?? e) });
      }
    }
    // Finance source is per-ticker only; mark idle/skipped each cron run
    sourceStatus.push({ id: "serpapi_google_finance", ok: true, count: 0 });
  }


  // Dedupe within batch
  const deduped = dedupeBatch(allNew);

  // Upsert into DB (unique on (source, source_id))
  let inserted = 0;
  for (const chunk of chunks(deduped, 100)) {
    const { error } = await supabaseAdmin
      .from("news_articles")
      .upsert(chunk.map(prepareArticleForWrite) as any, { onConflict: "source,source_id", ignoreDuplicates: true });
    if (!error) inserted += chunk.length;
    else console.error("[news cron] upsert error:", error.message);
  }

  // Update source statuses
  const now = new Date().toISOString();
  for (const s of sourceStatus) {
    const update: any = { updated_at: now };
    if (s.ok) {
      update.last_success_at = now;
      update.status = s.status ?? "active";
      update.fail_count = 0;
      update.last_error = s.reason ?? null;
      update.articles_today = s.count;
    } else {
      update.last_failed_at = now;
      update.status = s.status ?? "failed";
      update.last_error = s.reason ? `${s.reason} | ${s.error ?? ""}` : (s.error ?? "unknown");
    }
    await supabaseAdmin.from("news_sources").update(update).eq("id", s.id);
  }

  // Refresh ticker_sentiment_summary (24h window)
  await refreshTickerSummary();

  // Worker heartbeat so System Health "News Pipeline" card stops showing Unknown.
  const okCount = sourceStatus.filter((s) => s.ok).length;
  const failCount = sourceStatus.filter((s) => !s.ok).length;
  const workerStatus = failCount === 0 ? "success" : okCount === 0 ? "failed" : "partial";
  const nowIso = new Date().toISOString();
  const nextRun = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    await supabaseAdmin.from("news_worker_state").upsert(
      {
        singleton: true,
        last_news_worker_run_at: nowIso,
        last_successful_news_run_at: workerStatus === "failed" ? undefined : nowIso,
        next_expected_news_worker_run_at: nextRun,
        news_worker_status: workerStatus,
        last_news_worker_message: `legacy cron: ${okCount}/${sourceStatus.length} sources ok · inserted ${inserted}`,
        news_worker_error_count: failCount,
        updated_at: nowIso,
      } as any,
      { onConflict: "singleton" },
    );
    await supabaseAdmin.from("news_pipeline_runs").insert({
      run_type: "cron",
      trigger_source: "legacy_cron_news",
      status: workerStatus,
      started_at: nowIso,
      finished_at: nowIso,
      total_sources: sourceStatus.length,
      successful_sources: okCount,
      failed_sources: failCount,
      fallback_sources: sourceStatus.filter((s) => s.mode === "fallback").length,
      quota_protected_sources: sourceStatus.filter((s) => s.status === "quota_protected").length,
      fetched_count: allNew.length,
      inserted_count: inserted,
      duplicate_count: Math.max(0, allNew.length - deduped.length),
      source_results: sourceStatus as any,
    } as any);
  } catch {
    /* heartbeat is best-effort */
  }

  return { sources: sourceStatus, total_normalized: allNew.length, deduped: deduped.length, inserted };
}

async function refreshTickerSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("news_articles")
    .select("tickers, sentiment, sentiment_score, impact_level, published_at")
    .gte("published_at", since)
    .eq("is_duplicate", false);
  if (error || !data) return;

  const agg = new Map<string, {
    pos: number; neu: number; neg: number; sum: number; n: number;
    high: number; latest: string;
  }>();
  for (const row of data as any[]) {
    for (const t of (row.tickers ?? []) as string[]) {
      const cur = agg.get(t) ?? { pos: 0, neu: 0, neg: 0, sum: 0, n: 0, high: 0, latest: row.published_at };
      if (row.sentiment === "positive") cur.pos++;
      else if (row.sentiment === "negative") cur.neg++;
      else cur.neu++;
      cur.sum += Number(row.sentiment_score ?? 0);
      cur.n += 1;
      if (row.impact_level === "high") cur.high++;
      if (row.published_at > cur.latest) cur.latest = row.published_at;
      agg.set(t, cur);
    }
  }

  const rows = [...agg.entries()].map(([symbol, v]) => ({
    symbol,
    positive_count: v.pos,
    neutral_count: v.neu,
    negative_count: v.neg,
    average_sentiment_score: v.n ? Math.round((v.sum / v.n) * 100) / 100 : 0,
    high_impact_news_count: v.high,
    latest_news_at: v.latest,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return;
  for (const chunk of chunks(rows, 100)) {
    await supabaseAdmin.from("ticker_sentiment_summary").upsert(chunk, { onConflict: "symbol" });
  }
}

function* chunks<T>(arr: T[], n: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}

// Re-export the shared cron guard so existing call sites keep working.
import { checkCronSecret } from "@/lib/cron-auth.server";
function checkCronAuth(request: Request): Response | null {
  return checkCronSecret(request);
}

export const Route = createFileRoute("/api/public/cron/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;
        return Response.json(await refreshAll());
      },
      POST: async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;
        return Response.json(await refreshAll());
      },
    },
  },
});
