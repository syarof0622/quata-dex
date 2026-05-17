import { createFileRoute } from "@tanstack/react-router";
import { fetchSerpApiGoogleNews, SerpApiError } from "@/lib/serpapi.server";

export const Route = createFileRoute("/api/serpapi/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? undefined;
        const ticker = url.searchParams.get("ticker") ?? undefined;
        const light = url.searchParams.get("light") === "1";
        const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") ?? 12) || 12));
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
