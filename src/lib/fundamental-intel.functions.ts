// Phase B+D wiring: compute & persist new fundamental signal, expose to AI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getFundamentals } from "./fundamentals.functions";
import {
  computeFundamentalSignal,
  type FundamentalSignal,
  type SectorBenchmark,
  canClaimUndervalue,
} from "./fundamental-signal.server";

async function loadSectorBenchmark(sector: string | null): Promise<SectorBenchmark> {
  if (!sector) return {};
  const { data } = await supabaseAdmin
    .from("sector_fundamental_benchmarks")
    .select("median_per, median_pbv, median_roe, median_net_margin")
    .eq("sector", sector)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return {};
  return {
    per: data.median_per as number | null,
    pbv: data.median_pbv as number | null,
    roe: data.median_roe as number | null,
    netMargin: data.median_net_margin as number | null,
  };
}

async function persistSignal(sig: FundamentalSignal) {
  try {
    await supabaseAdmin.from("fundamental_quality_scores").insert({
      symbol: sig.symbol,
      status: sig.quality.status,
      completeness_score: sig.quality.completenessScore,
      freshness_score: sig.quality.freshnessScore,
      consistency_score: sig.quality.consistencyScore,
      confidence_score: sig.quality.confidenceScore,
      missing_fields: sig.quality.missingFields,
      stale_fields: sig.quality.staleFields,
      warnings: sig.quality.warnings,
      as_of: sig.quality.asOf,
    });
    await supabaseAdmin.from("fundamental_signal_snapshots").insert({
      symbol: sig.symbol,
      final_fundamental_label: sig.label,
      confidence: sig.confidence,
      undervalue_score: sig.undervalueScore,
      value_trap_risk: sig.valueTrapRisk,
      value_trap_level: sig.valueTrapLevel,
      value_trap_reasons: sig.valueTrapReasons,
      valuation_status: sig.valuationStatus,
      solvency_score: sig.scores.solvency,
      profitability_score: sig.scores.profitability,
      growth_score: sig.scores.growth,
      quality_score: sig.scores.quality,
      dividend_score: sig.scores.dividend,
      key_metrics: sig.keyMetrics,
      reasons: sig.reasons,
      warnings: sig.warnings,
      explanation: sig.explanation,
      as_of: sig.asOf,
    });
  } catch (e) {
    console.error("persistSignal failed", sig.symbol, e);
  }
}

export const computeAndPersistFundamentalSignal = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const f = await getFundamentals({ data: { symbol: data.symbol } });
    const sector = await loadSectorBenchmark(f?.profile?.sector ?? null);
    const sig = computeFundamentalSignal(data.symbol, f, sector);
    await persistSignal(sig);
    return { signal: sig, canClaimUndervalue: canClaimUndervalue(sig) };
  });

export const getLatestFundamentalSignal = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("fundamental_signal_snapshots")
      .select("*")
      .eq("symbol", data.symbol)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { row: row ?? null };
  });
