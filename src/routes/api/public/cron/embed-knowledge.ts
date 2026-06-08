// Cron endpoint: incrementally embed new rows from news, disclosures,
// fundamentals, market snapshots, agent decisions, and trade reviews into
// public.knowledge_chunks for AI Chatbot + AI Agent retrieval.
//
// Trigger every 15 minutes via pg_cron with header `x-cron-secret: $CRON_SECRET`.
// Bounded per run (50 rows per source) so cost stays predictable.

import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { runKnowledgeEmbedWorker } from "@/lib/knowledge-embed-worker.server";

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  try {
    const result = await runKnowledgeEmbedWorker();
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/cron/embed-knowledge")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
