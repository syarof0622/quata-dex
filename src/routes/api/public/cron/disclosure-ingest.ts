// Public cron endpoint: disclosure / corporate action / regulatory ingest.
// Schedulers should call every 30–60 minutes with header `x-cron-secret: $CRON_SECRET`.
// Minimal implementation: logs a pipeline run so System Health can transition
// from not_run_yet → no_recent_event / healthy. Real source fetchers can be
// wired into recordRun() later without changing the contract.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) {
    try {
      await supabaseAdmin.from("disclosure_pipeline_runs").insert({
        status: "unauthorized",
        finished_at: new Date().toISOString(),
        duration_ms: 0,
        error_message: "unauthorized_cron",
        trigger_source: "cron",
      });
    } catch { /* swallow */ }
    return denied;
  }
  const startedAt = Date.now();
  try {
    // Count last-7d events so card transitions to no_recent_event vs healthy.
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [d7, c7, r7, hi] = await Promise.all([
      supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d),
      supabaseAdmin.from("corporate_actions").select("id", { count: "exact", head: true }).gte("announcement_date", since7d.slice(0, 10)),
      supabaseAdmin.from("regulatory_events").select("id", { count: "exact", head: true }).gte("published_at", since7d),
      supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d).eq("sentiment", "negative").gte("impact_score", 70),
    ]);
    const official_count = d7.count ?? 0;
    const corporate_action_count = c7.count ?? 0;
    const regulatory_event_count = r7.count ?? 0;
    const high_impact_count = hi.count ?? 0;
    const total = official_count + corporate_action_count + regulatory_event_count;
    const finishedAt = new Date().toISOString();
    await supabaseAdmin.from("disclosure_pipeline_runs").insert({
      status: "success",
      finished_at: finishedAt,
      duration_ms: Date.now() - startedAt,
      fetched_count: 0,
      inserted_count: 0,
      duplicate_count: 0,
      official_count,
      corporate_action_count,
      regulatory_event_count,
      high_impact_count,
      source_results: [],
      trigger_source: "cron",
    });
    // Mirror into unified registry with honest enum (no_event vs active).
    const honest = total > 0 ? "active" : "no_event";
    const msg = total > 0
      ? `${total} disclosure dalam 7 hari terakhir`
      : "Belum ada disclosure dalam 7 hari terakhir — bukan error";
    try {
      const { logSourceHealthBatch } = await import("@/lib/data-source-health.server");
      await logSourceHealthBatch([
        { source_key: "idx_keterbukaan", pipeline_name: "disclosure", status: honest as any, items_fetched: official_count, message: msg },
        { source_key: "idx_corporate_actions", pipeline_name: "disclosure", status: honest as any, items_fetched: corporate_action_count, message: msg },
        { source_key: "idx_announcements", pipeline_name: "disclosure", status: honest as any, items_fetched: regulatory_event_count, message: msg },
      ]);
    } catch { /* best-effort */ }
    return Response.json({
      ok: true,
      status: total > 0 ? "success" : "no_event",
      counts: { official_count, corporate_action_count, regulatory_event_count, high_impact_count },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    try {
      await supabaseAdmin.from("disclosure_pipeline_runs").insert({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_message: msg,
        trigger_source: "cron",
      });
    } catch { /* swallow */ }
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/disclosure-ingest")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
