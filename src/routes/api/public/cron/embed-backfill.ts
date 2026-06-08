// Historical backfill endpoint for the knowledge base / RAG index.
//
// Two modes via query params (cron-secret protected):
//   - ?reset=1           : reset ALL source cursors back to epoch (re-embed all history on next runs)
//   - ?reset=news_articles,stock_fundamentals  : reset a comma list of source tables only
//   - ?passes=N          : run the embed worker N times back-to-back in this request (default 5, max 20)
//
// Each pass processes up to BATCH_LIMIT (50) rows per source, so a single
// request with passes=20 can embed up to ~6,000 rows. Call repeatedly until
// per_source.fetched goes to 0 across the board.

import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { runKnowledgeEmbedWorker } from "@/lib/knowledge-embed-worker.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALL_SOURCES = [
  "news_articles",
  "official_disclosures",
  "stock_fundamentals",
  "market_data_snapshots",
  "ai_agent_decisions",
  "ai_trade_reviews",
];

async function resetCursors(sources: string[]) {
  const epoch = new Date(0).toISOString();
  const rows = sources.map((s) => ({
    source_table: s,
    last_processed_at: epoch,
    last_run_at: new Date().toISOString(),
    last_inserted: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from("knowledge_embed_cursors")
    .upsert(rows as any, { onConflict: "source_table" });
  if (error) throw new Error(error.message);
  return sources;
}

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const resetParam = url.searchParams.get("reset");
    const passes = Math.max(1, Math.min(20, Number(url.searchParams.get("passes")) || 5));

    let resetDone: string[] = [];
    if (resetParam) {
      const list = resetParam === "1" || resetParam === "all"
        ? ALL_SOURCES
        : resetParam.split(",").map((s) => s.trim()).filter((s) => ALL_SOURCES.includes(s));
      if (list.length > 0) resetDone = await resetCursors(list);
    }

    const runs: Array<{ pass: number; total_inserted: number; duration_ms: number }> = [];
    let totalInserted = 0;
    let lastResult: any = null;
    for (let i = 0; i < passes; i++) {
      const r = await runKnowledgeEmbedWorker();
      lastResult = r;
      totalInserted += r.total_inserted;
      runs.push({ pass: i + 1, total_inserted: r.total_inserted, duration_ms: r.duration_ms });
      // Early stop: no source returned new rows → all caught up
      const fetched = r.per_source.reduce((a, s) => a + s.fetched, 0);
      if (fetched === 0) break;
    }
    return Response.json({
      ok: true,
      reset: resetDone,
      passes_run: runs.length,
      total_inserted: totalInserted,
      runs,
      last_per_source: lastResult?.per_source ?? [],
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/embed-backfill")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
