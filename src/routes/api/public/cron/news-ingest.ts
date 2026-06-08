// Public cron endpoint: news ingestion with full instrumentation.
// Schedulers should call every 5–15 minutes with header `x-cron-secret: $CRON_SECRET`.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import {
  runNewsIngest,
  recordUnauthorizedRun,
} from "@/lib/news-pipeline-runner.server";
import {
  logSourceHealthBatch,
  type HonestSourceStatus,
} from "@/lib/data-source-health.server";

// Map the news-runner's per-source status vocabulary into the unified
// honest enum used by data_sources / source_health_logs.
function mapNewsStatus(s: string): HonestSourceStatus {
  switch (s) {
    case "healthy": return "active";
    case "fallback": return "fallback_active";
    case "quota_protected": return "quota_protected";
    case "rate_limited": return "rate_limited";
    case "disabled": return "not_configured";
    case "stale": return "degraded";
    case "failed": return "failed";
    default: return "degraded";
  }
}

async function mirrorRunToRegistry(result: any) {
  const sources = (result?.sources ?? result?.source_results ?? []) as any[];
  if (!Array.isArray(sources) || sources.length === 0) return;
  await logSourceHealthBatch(
    sources.map((r) => ({
      source_key: r.id ?? r.source_key ?? "unknown",
      pipeline_name: "news",
      status: mapNewsStatus(String(r.status ?? "")),
      duration_ms: r.duration_ms ?? null,
      items_fetched: r.count ?? r.items_fetched ?? 0,
      message: r.message ?? r.reason ?? r.error ?? null,
    })),
  );
}

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) {
    try {
      const body = await denied.clone().text();
      const parsed = JSON.parse(body);
      await recordUnauthorizedRun("cron", parsed?.message ?? parsed?.error ?? "unauthorized_cron");
    } catch {
      await recordUnauthorizedRun("cron", "unauthorized_cron");
    }
    return denied;
  }
  try {
    const result = await runNewsIngest({ trigger: "cron" });
    // Best-effort mirror into the unified registry (Batch 1 tables).
    await mirrorRunToRegistry(result).catch(() => undefined);
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/cron/news-ingest")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
