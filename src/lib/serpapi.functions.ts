// Server functions for SerpApi. Safe to import from components/loaders — bodies execute server-side only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchSerpApiGoogleNews,
  fetchSerpApiGoogleFinance,
  computeAlignment,
  getMonthlyUsage,
  SerpApiError,
} from "./serpapi.server";

const tickerSchema = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.:_-]+$/);

export const serpapiNews = createServerFn({ method: "POST" })
  .inputValidator((d: { query?: string; ticker?: string; limit?: number; light?: boolean }) =>
    z.object({
      query: z.string().trim().min(1).max(120).optional(),
      ticker: tickerSchema.optional(),
      limit: z.number().int().min(1).max(30).optional(),
      light: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    try {
      const items = await fetchSerpApiGoogleNews(data);
      return { ok: true as const, items };
    } catch (e: any) {
      const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
      return { ok: false as const, error: String(e?.message ?? e), code, items: [] };
    }
  });

export const serpapiGoogleFinance = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: tickerSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      const quote = await fetchSerpApiGoogleFinance(data.symbol);
      return { ok: true as const, quote };
    } catch (e: any) {
      const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
      return { ok: false as const, error: String(e?.message ?? e), code, quote: null };
    }
  });

export const serpapiMarketContext = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: tickerSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      const ctx = await computeAlignment(data.symbol);
      return { ok: true as const, ...ctx };
    } catch (e: any) {
      const code = e instanceof SerpApiError ? e.code : "UPSTREAM";
      return { ok: false as const, error: String(e?.message ?? e), code };
    }
  });

export const serpapiStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const enabled = !!process.env.SERPAPI_API_KEY;
    let usage = { used: 0, limit: 0, remaining: 0, quotaBlocked: false };
    try { if (enabled) usage = await getMonthlyUsage(); } catch {}
    return { enabled, ...usage };
  });
