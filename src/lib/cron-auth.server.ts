// Shared guard for /api/public/cron/* endpoints. Closes the previous
// fall-through behavior (when CRON_SECRET was missing, anyone could hit
// the endpoint). Now: if CRON_SECRET is unset → 503; if set and not
// matched → 401.
export function checkCronSecret(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "cron_secret_not_configured",
        hint: "Set CRON_SECRET in project secrets before invoking cron endpoints.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (provided !== cronSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized", reason: "cron_secret_mismatch" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
