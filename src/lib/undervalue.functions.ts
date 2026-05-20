// Server functions for the AI Undervalued Stock Scanner.
// Note: the implementation lives in *.server.ts modules; this file only
// exposes the createServerFn surface (client-safe to import).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getFundamentals, getSectorBenchmarks } from "./fundamentals-fetcher.server";
import { scoreUndervalue, type UndervalueResult } from "./undervalue-scorer.server";
import { IDX_LQ45 } from "./symbols";
import { getTradeSetup } from "./signals.functions";

async function buildTechCtx(symbol: string) {
  try {
    const setup: any = await getTradeSetup({ data: { symbol, timeframe: "1d" } });
    const sig = setup?.signal;
    return {
      score: sig?.score ?? null,
      trend: (sig?.score ?? 0) > 15 ? "bullish" as const
           : (sig?.score ?? 0) < -15 ? "bearish" as const : "neutral" as const,
      rsi: setup?.indicators?.rsi ?? null,
      nearSupport: !!setup?.setup?.support && !!setup?.signal?.label && setup.signal.label !== "SELL",
    };
  } catch { return undefined; }
}

async function buildNewsCtx(symbol: string) {
  const base = symbol.replace(/\.JK$/i, "");
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("news_articles")
    .select("sentiment, impact_level")
    .or(`tickers.cs.{${base}},tickers.cs.{${symbol}}`)
    .eq("is_duplicate", false)
    .gte("published_at", since)
    .limit(50);
  const list = data ?? [];
  return {
    negativeCount: list.filter((a: any) => a.sentiment === "negative").length,
    highImpactNegative: list.filter((a: any) => a.sentiment === "negative" && a.impact_level === "high").length,
  };
}

async function persistScore(result: UndervalueResult, coverage: number) {
  await supabaseAdmin.from("ai_undervalue_scores").insert({
    symbol: result.symbol,
    valuation_score: result.valuationScore,
    quality_score: result.qualityScore,
    growth_score: result.growthScore,
    financial_health_score: result.financialHealthScore,
    dividend_score: result.dividendScore,
    sector_relative_score: result.sectorRelativeScore,
    technical_timing_score: result.technicalTimingScore,
    value_trap_risk_score: result.valueTrapRiskScore,
    final_undervalue_score: result.finalUndervalueScore,
    classification: result.classification,
    reasoning: result.reasoning,
    warnings: result.warnings as any,
    data_coverage: coverage,
  });
}

/** Compute & persist undervalue score for one symbol. */
export const getUndervalueScore = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ symbol: z.string().min(1).max(20), forceRefresh: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase();
    const f = await getFundamentals(sym, { forceRefresh: !!data.forceRefresh });
    if (!f) {
      const placeholder: UndervalueResult = {
        symbol: sym,
        classification: "insufficient_data",
        finalUndervalueScore: 0,
        valuationScore: 0, qualityScore: 0, growthScore: 0, financialHealthScore: 0,
        dividendScore: 0, sectorRelativeScore: 0, technicalTimingScore: 0,
        valueTrapRiskScore: 0,
        reasoning: "Data fundamental tidak tersedia (Yahoo Finance tidak merespons).",
        warnings: ["Fundamental data unavailable"],
        dataCoverage: 0,
      };
      await persistScore(placeholder, 0);
      return placeholder;
    }
    const sectorAvg = await getSectorBenchmarks(f.sector);
    const [tech, news] = await Promise.all([buildTechCtx(sym), buildNewsCtx(sym)]);
    const result = scoreUndervalue(f, { tech, news, sectorAvg });
    await persistScore(result, result.dataCoverage);
    return result;
  });

/** Scan a universe → return ranked undervalue scores. */
export const scanUndervalueUniverse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      universe: z.enum([
        "idx_lq45",
        "undervalued_candidates",
        "quality_undervalued",
        "dividend_undervalued",
        "sector_discount",
        "hybrid_trading_and_value",
        "watchlist",
        "custom",
      ]).default("idx_lq45"),
      symbols: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(30).default(15),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    let symbols: string[] = [];
    if (data.universe === "custom" && data.symbols?.length) {
      symbols = data.symbols.map((s) => s.toUpperCase());
    } else if (data.universe === "watchlist") {
      const { data: wl } = await supabaseAdmin.from("watchlist").select("symbol").limit(30);
      symbols = (wl ?? []).map((w: any) => String(w.symbol).toUpperCase());
    } else {
      symbols = IDX_LQ45.slice(0, data.limit);
    }
    symbols = Array.from(new Set(symbols)).slice(0, data.limit);

    const results: UndervalueResult[] = [];
    const batchSize = 3;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const part = await Promise.all(
        batch.map(async (sym) => {
          try {
            const f = await getFundamentals(sym);
            if (!f) return null;
            const sectorAvg = await getSectorBenchmarks(f.sector);
            const [tech, news] = await Promise.all([buildTechCtx(sym), buildNewsCtx(sym)]);
            const r = scoreUndervalue(f, { tech, news, sectorAvg });
            await persistScore(r, r.dataCoverage);
            return r;
          } catch { return null; }
        }),
      );
      for (const r of part) if (r) results.push(r);
    }

    // Apply universe-specific filtering
    let ranked = [...results];
    if (data.universe === "undervalued_candidates") {
      ranked = ranked.filter((r) => r.classification === "undervalued" || r.classification === "strong_undervalued");
    } else if (data.universe === "quality_undervalued") {
      ranked = ranked.filter((r) => r.finalUndervalueScore >= 65 && r.qualityScore >= 65);
    } else if (data.universe === "dividend_undervalued") {
      ranked = ranked.filter((r) => r.dividendScore >= 65 && r.finalUndervalueScore >= 55);
    } else if (data.universe === "sector_discount") {
      ranked = ranked.filter((r) => r.sectorRelativeScore >= 70);
    } else if (data.universe === "hybrid_trading_and_value") {
      ranked = ranked.filter((r) => r.finalUndervalueScore >= 55 && r.technicalTimingScore >= 60);
    }
    ranked.sort((a, b) => b.finalUndervalueScore - a.finalUndervalueScore);

    return { scanned: results.length, candidates: ranked };
  });

/** Latest score per symbol (most recent row). */
export const getLatestUndervalueScores = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({
      classification: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("ai_undervalue_scores")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.classification) q = q.eq("classification", data.classification);
    const { data: rows } = await q;
    // Dedupe per symbol (keep latest).
    const seen = new Set<string>();
    const latest: any[] = [];
    for (const r of rows ?? []) {
      const sym = (r as any).symbol;
      if (seen.has(sym)) continue;
      seen.add(sym);
      latest.push(r);
      if (latest.length >= data.limit) break;
    }
    return latest;
  });

export const listFundamentals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ symbol: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("stock_fundamentals").select("*").eq("symbol", data.symbol.toUpperCase()).maybeSingle();
    return row;
  });
