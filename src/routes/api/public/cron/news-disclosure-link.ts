// PATCH 9 — Cron endpoint to run news↔disclosure linker.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { runNewsDisclosureLinker } from "@/lib/news-disclosure-linker.server";

export const Route = createFileRoute("/api/public/cron/news-disclosure-link")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const hours = Number(url.searchParams.get("hours") ?? 48);
    const result = await runNewsDisclosureLinker({ hours });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
