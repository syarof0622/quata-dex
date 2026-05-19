import { createFileRoute } from "@tanstack/react-router";
import { fetchSerpApiGoogleFinance, SerpApiError } from "@/lib/serpapi.server";
import { checkSerpApiAccess } from "@/lib/serpapi-route-guard.server";

const SYMBOL_RE = /^[A-Za-z0-9.:_-]{1,20}$/;

export const Route = createFileRoute("/api/serpapi/google-finance/$symbol")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = checkSerpApiAccess(request);
        if (denied) return denied;
        if (!SYMBOL_RE.test(params.symbol)) {
          return Response.json({ ok: false, error: "Invalid symbol" }, { status: 400 });
        }
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
