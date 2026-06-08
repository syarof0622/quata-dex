// Shared guard for /api/public/cron/* endpoints. Accepts the secret via
// `x-cron-secret` header or `Authorization: Bearer <secret>` only.
// Query-string secrets are rejected to avoid leakage in proxy/CDN/server logs.
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Run a same-length comparison to keep timing flat.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

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
  const provided = request.headers.get("x-cron-secret") ?? bearer;
  if (!provided || !safeEqual(provided, cronSecret)) {
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
