// Update 12 — daily fundamental backfill endpoint.
// Auth: shared CRON_SECRET guard (matches other cron routes in this project).
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { runFundamentalBackfill } from "@/lib/fundamental-backfill.server";

async function run(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25)));
  const symbolsParam = url.searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const startedAt = Date.now();
  const report = await runFundamentalBackfill({ limit, symbols });
  // Mirror into unified registry with honest enums.
  try {
    const { logSourceHealth } = await import("@/lib/data-source-health.server");
    const r: any = report;
    const processed = Number(r?.processed ?? r?.updated ?? 0);
    const failed = Number(r?.failed ?? r?.errors ?? 0);
    const idxStatus = processed > 0
      ? (failed > 0 ? "degraded" : "active")
      : (failed > 0 ? "failed" : "no_event");
    await logSourceHealth({
      source_key: "idx_financial_data",
      pipeline_name: "fundamental",
      status: idxStatus as any,
      duration_ms: Date.now() - startedAt,
      items_fetched: processed,
      message: `processed=${processed} failed=${failed}`,
    });
    await logSourceHealth({
      source_key: "serpapi_fundamental",
      pipeline_name: "fundamental",
      status: process.env.SERPAPI_API_KEY ? "quota_protected" : "not_configured",
      message: process.env.SERPAPI_API_KEY
        ? "Dilindungi kuota bulanan — dipakai hanya untuk gap fundamental"
        : "SERPAPI_API_KEY belum dikonfigurasi",
    });
  } catch { /* best-effort */ }
  return Response.json(report);
}

export const Route = createFileRoute("/api/public/cron/fundamentals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkCronSecret(request);
        if (denied) return denied;
        return run(request);
      },
      POST: async ({ request }) => {
        const denied = checkCronSecret(request);
        if (denied) return denied;
        return run(request);
      },
    },
  },
});
