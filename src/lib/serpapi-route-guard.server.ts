// Restricts public SerpApi HTTP routes to same-origin browser calls or a shared
// CRON_SECRET header. Prevents external abuse of the paid SerpApi quota.
export function checkSerpApiAccess(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided =
      request.headers.get("x-cron-secret") ??
      new URL(request.url).searchParams.get("secret");
    if (provided === cronSecret) return null;
  }

  // Same-origin enforcement: require Origin or Referer matching the Host header.
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!host) return new Response("Forbidden", { status: 403 });

  const matches = (val: string | null) => {
    if (!val) return false;
    try {
      return new URL(val).host === host;
    } catch {
      return false;
    }
  };

  if (matches(origin) || matches(referer)) return null;
  return new Response("Forbidden", { status: 403 });
}
