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
  const report = await runFundamentalBackfill({ limit, symbols });
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
