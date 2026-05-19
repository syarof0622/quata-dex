import { createFileRoute } from "@tanstack/react-router";
import { fetchSerpApiGoogleNews, SerpApiError } from "@/lib/serpapi.server";
import { checkSerpApiAccess } from "@/lib/serpapi-route-guard.server";

const SYMBOL_RE = /^[A-Za-z0-9.:_-]{1,20}$/;

export const Route = createFileRoute("/api/serpapi/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkSerpApiAccess(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? undefined;
        const ticker = url.searchParams.get("ticker") ?? undefined;
        const light = url.searchParams.get("light") === "1";
        const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") ?? 12) || 12));
        if (q && (q.length < 1 || q.length > 120)) {
          return Response.json({ ok: false, error: "Invalid query" }, { status: 400 });
        }
        if (ticker && !SYMBOL_RE.test(ticker)) {
          return Response.json({ ok: false, error: "Invalid ticker" }, { status: 400 });
        }
        try {
          const items = await fetchSerpApiGoogleNews({ query: q, ticker, light, limit });
          return Response.json({ ok: true, count: items.length, items });
        } catch (e: any) {
          const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
          return Response.json({ ok: false, error: String(e?.message ?? e), code }, { status: code === "NO_KEY" ? 503 : 502 });
        }
      },
    },
  },
});
