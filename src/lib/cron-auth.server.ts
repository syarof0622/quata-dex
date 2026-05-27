// Shared guard for /api/public/cron/* endpoints. Accepts the secret via
// `x-cron-secret` header, `Authorization: Bearer <secret>`, or `?secret=` query.
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
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const provided =
    request.headers.get("x-cron-secret") ??
    bearer ??
    new URL(request.url).searchParams.get("secret");
  if (provided !== cronSecret) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "unauthorized_cron",
        message: "Missing or invalid x-cron-secret header.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
