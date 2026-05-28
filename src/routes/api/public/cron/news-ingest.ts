// Public cron endpoint: news ingestion with full instrumentation.
// Schedulers should call every 5–15 minutes with header `x-cron-secret: $CRON_SECRET`.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import {
  runNewsIngest,
  recordUnauthorizedRun,
} from "@/lib/news-pipeline-runner.server";

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) {
    // Log unauthorized attempts so System Health can surface them.
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
