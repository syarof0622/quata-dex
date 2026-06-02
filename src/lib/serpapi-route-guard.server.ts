// Restricts public SerpApi HTTP routes to authorized server-to-server callers
// (cron/webhooks). Origin/Referer headers are trivially spoofed by non-browser
// clients, so we require a shared CRON_SECRET. Browser-side code must use the
// server functions in serpapi.functions.ts instead of these HTTP routes.
export function checkSerpApiAccess(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "cron_secret_not_configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const provided =
    request.headers.get("x-cron-secret") ??
    bearer ??
    new URL(request.url).searchParams.get("secret");
  if (provided === cronSecret) return null;
  return new Response("Forbidden", { status: 403 });
}
