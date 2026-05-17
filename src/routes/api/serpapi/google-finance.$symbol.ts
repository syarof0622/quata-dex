import { createFileRoute } from "@tanstack/react-router";
import { fetchSerpApiGoogleFinance, SerpApiError } from "@/lib/serpapi.server";

export const Route = createFileRoute("/api/serpapi/google-finance/$symbol")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const quote = await fetchSerpApiGoogleFinance(params.symbol);
          return Response.json({ ok: true, quote });
        } catch (e: any) {
          const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
          return Response.json({ ok: false, error: String(e?.message ?? e), code }, { status: code === "NO_KEY" ? 503 : 502 });
        }
      },
    },
  },
});
