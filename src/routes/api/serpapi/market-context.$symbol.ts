import { createFileRoute } from "@tanstack/react-router";
import { computeAlignment, SerpApiError } from "@/lib/serpapi.server";

export const Route = createFileRoute("/api/serpapi/market-context/$symbol")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const ctx = await computeAlignment(params.symbol);
          return Response.json({ ok: true, ...ctx });
        } catch (e: any) {
          const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
          return Response.json({ ok: false, error: String(e?.message ?? e), code }, { status: code === "NO_KEY" ? 503 : 502 });
        }
      },
    },
  },
});
