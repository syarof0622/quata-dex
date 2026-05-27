// Phase B — Fundamental Signal Engine
// Pure deterministic. No LLM. Outputs the new label schema:
//   STRONG_UNDERVALUE | UNDERVALUED | FAIR_VALUE | OVERVALUED | VALUE_TRAP | INSUFFICIENT_DATA
// Plus quality status (sufficient | partial | insufficient) and confidence (0..100).
// Hallucination guard: any caller that wants to say "undervalue" MUST require
// label ∈ {STRONG_UNDERVALUE, UNDERVALUED} AND confidence >= 70 AND
// quality.status !== "insufficient".

import type { FundamentalDTO } from "./fundamentals.functions";

export type FundamentalLabel =
  | "STRONG_UNDERVALUE"
  | "UNDERVALUED"
  | "FAIR_VALUE"
  | "OVERVALUED"
  | "VALUE_TRAP"
  | "INSUFFICIENT_DATA";

export type FundamentalQualityStatus = "sufficient" | "partial" | "insufficient";
export type ValuationStatus = "cheap" | "fair" | "expensive" | "unknown";
export type ValueTrapLevel = "none" | "low" | "medium" | "high" | "unknown";

export type FundamentalQuality = {
  status: FundamentalQualityStatus;
  completenessScore: number;
  freshnessScore: number;
  consistencyScore: number;
  confidenceScore: number;
  missingFields: string[];
  staleFields: string[];
  warnings: string[];
  asOf: string;
};

export type FundamentalSignal = {
  symbol: string;
  label: FundamentalLabel;
  confidence: number; // 0..100
  undervalueScore: number; // 0..100
  valueTrapRisk: number; // 0..100
  valueTrapLevel: ValueTrapLevel;
  valueTrapReasons: string[];
  valuationStatus: ValuationStatus;
  scores: {
    valuation: number;
    quality: number;
    growth: number;
    profitability: number;
    solvency: number;
    dividend: number;
  };
  keyMetrics: Record<string, number | string | null>;
  reasons: string[];
  warnings: string[];
  explanation: string;
  quality: FundamentalQuality;
  asOf: string;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 50);
const num = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

export type SectorBenchmark = {
  per?: number | null;
  pbv?: number | null;
  roe?: number | null;
  netMargin?: number | null;
};

export function computeFundamentalQuality(
  f: FundamentalDTO | null,
  opts: { asOf?: string } = {},
): FundamentalQuality {
  const asOf = opts.asOf ?? new Date().toISOString();
  if (!f) {
    return {
      status: "insufficient",
      completenessScore: 0,
      freshnessScore: 0,
      consistencyScore: 0,
      confidenceScore: 0,
      missingFields: ["*"],
      staleFields: [],
      warnings: ["fundamental_payload_missing"],
      asOf,
    };
  }
  const required: Array<[string, number | null]> = [
    ["valuation.trailingPE", num(f.valuation.trailingPE)],
    ["valuation.priceToBook", num(f.valuation.priceToBook)],
    ["profitability.returnOnEquity", num(f.profitability.returnOnEquity)],
    ["profitability.returnOnAssets", num(f.profitability.returnOnAssets)],
    ["profitability.profitMargin", num(f.profitability.profitMargin)],
    ["growth.revenueGrowth", num(f.growth.revenueGrowth)],
    ["growth.earningsGrowth", num(f.growth.earningsGrowth)],
    ["health.debtToEquity", num(f.health.debtToEquity)],
    ["health.freeCashflow", num(f.health.freeCashflow)],
    ["health.operatingCashflow", num(f.health.operatingCashflow)],
    ["dividends.dividendYield", num(f.dividends.dividendYield)],
  ];
  const missing = required.filter(([, v]) => v == null).map(([k]) => k);
  const completeness = ((required.length - missing.length) / required.length) * 100;

  // Freshness: based on latest income statement date
  let freshness = 50;
  const stale: string[] = [];
  const latestIncome = f.statements.income?.[0]?.date;
  if (latestIncome) {
    const t = Date.parse(latestIncome);
    if (Number.isFinite(t)) {
      const months = (Date.now() - t) / (1000 * 60 * 60 * 24 * 30);
      if (months <= 3) freshness = 100;
      else if (months <= 6) freshness = 85;
      else if (months <= 12) freshness = 65;
      else if (months <= 18) freshness = 40;
      else {
        freshness = 15;
        stale.push("statements.income.latest");
      }
    }
  } else {
    freshness = 25;
    stale.push("statements.income");
  }

  // Consistency: cross-check valuation positivity, profit vs margin
  const warnings: string[] = [];
  let consistency = 100;
  if (num(f.valuation.trailingPE) != null && num(f.valuation.trailingPE)! < 0) {
    consistency -= 25;
    warnings.push("trailingPE_negative");
  }
  if (num(f.profitability.profitMargin) != null && num(f.profitability.returnOnEquity) != null) {
    const pm = num(f.profitability.profitMargin)!;
    const roe = num(f.profitability.returnOnEquity)!;
    if (pm < 0 && roe > 0) {
      consistency -= 15;
      warnings.push("profit_margin_roe_mismatch");
    }
  }
  consistency = clamp(consistency);

  const confidence = clamp(completeness * 0.55 + freshness * 0.3 + consistency * 0.15);
  const status: FundamentalQualityStatus =
    confidence >= 75 ? "sufficient" : confidence >= 50 ? "partial" : "insufficient";

  return {
    status,
    completenessScore: +completeness.toFixed(1),
    freshnessScore: +freshness.toFixed(1),
    consistencyScore: +consistency.toFixed(1),
    confidenceScore: +confidence.toFixed(1),
    missingFields: missing,
    staleFields: stale,
    warnings,
    asOf,
  };
}

export function computeFundamentalSignal(
  symbol: string,
  f: FundamentalDTO | null,
  sector: SectorBenchmark = {},
): FundamentalSignal {
  const asOf = new Date().toISOString();
  const quality = computeFundamentalQuality(f, { asOf });

  if (!f || quality.status === "insufficient") {
    return {
      symbol,
      label: "INSUFFICIENT_DATA",
      confidence: 0,
      undervalueScore: 0,
      valueTrapRisk: 0,
      valueTrapLevel: "unknown",
      valueTrapReasons: [],
      valuationStatus: "unknown",
      scores: { valuation: 0, quality: 0, growth: 0, profitability: 0, solvency: 0, dividend: 0 },
      keyMetrics: {},
      reasons: ["Data fundamental belum cukup untuk menilai."],
      warnings: quality.warnings,
      explanation: "Tidak cukup data fundamental yang fresh & lengkap untuk membuat verdict.",
      quality,
      asOf,
    };
  }

  const per = num(f.valuation.trailingPE);
  const pbv = num(f.valuation.priceToBook);
  const roe = num(f.profitability.returnOnEquity);
  const roa = num(f.profitability.returnOnAssets);
  const margin = num(f.profitability.profitMargin);
  const grossMargin = num(f.profitability.grossMargin);
  const revGrowth = num(f.growth.revenueGrowth);
  const earnGrowth = num(f.growth.earningsGrowth);
  const der = num(f.health.debtToEquity);
  const fcf = num(f.health.freeCashflow);
  const ocf = num(f.health.operatingCashflow);
  const dy = num(f.dividends.dividendYield);
  const payout = num(f.dividends.payoutRatio);

  // Valuation
  const valParts: number[] = [];
  if (per != null && sector.per && sector.per > 0) valParts.push(clamp(100 - (per / sector.per - 1) * 100));
  if (pbv != null && sector.pbv && sector.pbv > 0) valParts.push(clamp(100 - (pbv / sector.pbv - 1) * 100));
  if (valParts.length === 0 && per != null) valParts.push(per < 0 ? 20 : per < 8 ? 85 : per < 15 ? 65 : per < 25 ? 45 : 25);
  if (valParts.length === 0 && pbv != null) valParts.push(pbv < 0.8 ? 85 : pbv < 1.5 ? 65 : pbv < 3 ? 45 : 25);
  const valuation = +avg(valParts).toFixed(1);

  // Profitability
  const pParts: number[] = [];
  if (roe != null) pParts.push(clamp(roe * 100 * 5));
  if (roa != null) pParts.push(clamp(roa * 100 * 10));
  if (margin != null) pParts.push(clamp(margin * 100 * 5));
  if (grossMargin != null) pParts.push(clamp(grossMargin * 100 * 2));
  const profitability = +avg(pParts).toFixed(1);

  // Growth
  const gParts: number[] = [];
  if (revGrowth != null) gParts.push(clamp(50 + revGrowth * 100));
  if (earnGrowth != null) gParts.push(clamp(50 + earnGrowth * 100));
  const growth = +avg(gParts).toFixed(1);

  // Solvency
  const sParts: number[] = [];
  if (der != null) sParts.push(der < 0.5 ? 95 : der < 1 ? 80 : der < 2 ? 55 : 25);
  if (ocf != null) sParts.push(ocf > 0 ? 85 : 25);
  if (fcf != null) sParts.push(fcf > 0 ? 85 : 30);
  const solvency = +avg(sParts).toFixed(1);

  // Dividend
  const dParts: number[] = [];
  if (dy != null) dParts.push(dy > 0.06 ? 95 : dy > 0.04 ? 80 : dy > 0.02 ? 65 : dy > 0 ? 50 : 30);
  if (payout != null) dParts.push(payout > 0 && payout < 0.7 ? 85 : payout >= 0.7 && payout <= 1 ? 60 : 30);
  const dividend = +avg(dParts).toFixed(1);

  // Quality composite (profitability + solvency)
  const qualityScore = +((profitability * 0.6 + solvency * 0.4)).toFixed(1);

  // Composite undervalue
  const weighted =
    valuation * 0.3 +
    qualityScore * 0.25 +
    growth * 0.15 +
    profitability * 0.15 +
    solvency * 0.1 +
    dividend * 0.05;

  // Value trap detection
  let trap = 0;
  const trapReasons: string[] = [];
  if (revGrowth != null && revGrowth < -0.2) { trap += 20; trapReasons.push("Revenue turun >20% YoY"); }
  if (earnGrowth != null && earnGrowth < -0.2) { trap += 25; trapReasons.push("Laba turun >20% YoY"); }
  if (margin != null && margin < 0) { trap += 20; trapReasons.push("Net margin negatif"); }
  if (der != null && der > 2) { trap += 15; trapReasons.push("DER > 2"); }
  if (fcf != null && fcf < 0) { trap += 10; trapReasons.push("FCF negatif"); }
  if (ocf != null && ocf < 0) { trap += 10; trapReasons.push("OCF negatif"); }
  if (valuation > 80 && qualityScore < 40) { trap += 10; trapReasons.push("Valuasi murah ekstrim + kualitas rendah"); }
  const valueTrapRisk = clamp(trap);
  const valueTrapLevel: ValueTrapLevel =
    valueTrapRisk >= 60 ? "high" : valueTrapRisk >= 35 ? "medium" : valueTrapRisk > 0 ? "low" : "none";

  const trapPenalty = valueTrapRisk * 0.3;
  const undervalueScore = +clamp(weighted - trapPenalty).toFixed(1);

  // Valuation status
  let valuationStatus: ValuationStatus = "unknown";
  if (valuation >= 65) valuationStatus = "cheap";
  else if (valuation >= 45) valuationStatus = "fair";
  else if (valParts.length) valuationStatus = "expensive";

  // Label
  let label: FundamentalLabel;
  if (valueTrapRisk >= 60) label = "VALUE_TRAP";
  else if (undervalueScore >= 80) label = "STRONG_UNDERVALUE";
  else if (undervalueScore >= 65) label = "UNDERVALUED";
  else if (undervalueScore >= 45) label = "FAIR_VALUE";
  else label = "OVERVALUED";

  // Confidence — combines score margin + quality
  const margin1 =
    label === "STRONG_UNDERVALUE" ? undervalueScore - 80 :
    label === "UNDERVALUED" ? undervalueScore - 65 :
    label === "FAIR_VALUE" ? Math.min(undervalueScore - 45, 80 - undervalueScore) :
    label === "OVERVALUED" ? 45 - undervalueScore :
    label === "VALUE_TRAP" ? valueTrapRisk - 60 : 0;
  const marginBoost = clamp(50 + margin1 * 2, 0, 100);
  const confidence = +clamp(marginBoost * 0.5 + quality.confidenceScore * 0.5).toFixed(1);

  const reasons: string[] = [];
  if (valuation >= 70) reasons.push(`Valuasi murah (skor ${valuation}).`);
  else if (valuation <= 40) reasons.push(`Valuasi mahal (skor ${valuation}).`);
  if (qualityScore >= 70) reasons.push(`Kualitas fundamental kuat (skor ${qualityScore}).`);
  else if (qualityScore <= 40) reasons.push(`Kualitas fundamental lemah (skor ${qualityScore}).`);
  if (growth >= 65) reasons.push(`Pertumbuhan positif.`);
  else if (growth <= 35) reasons.push(`Pertumbuhan melemah.`);
  if (solvency <= 40) reasons.push(`Solvabilitas perlu diperhatikan.`);
  if (trapReasons.length) reasons.push(`Sinyal value trap: ${trapReasons.join("; ")}.`);

  const warnings = [...quality.warnings];
  if (quality.status === "partial") warnings.push("fundamental_quality_partial");

  return {
    symbol,
    label,
    confidence,
    undervalueScore,
    valueTrapRisk,
    valueTrapLevel,
    valueTrapReasons: trapReasons,
    valuationStatus,
    scores: { valuation, quality: qualityScore, growth, profitability, solvency, dividend },
    keyMetrics: {
      per, pbv, roe, roa, profitMargin: margin, revenueGrowth: revGrowth,
      earningsGrowth: earnGrowth, debtToEquity: der, freeCashflow: fcf,
      operatingCashflow: ocf, dividendYield: dy, payoutRatio: payout,
    },
    reasons,
    warnings,
    explanation: reasons.join(" ") || "Analisis fundamental selesai.",
    quality,
    asOf,
  };
}

// Hallucination guard helper. Use this in any code path that claims undervalue.
export function canClaimUndervalue(sig: Pick<FundamentalSignal, "label" | "confidence" | "quality">): boolean {
  return (
    (sig.label === "STRONG_UNDERVALUE" || sig.label === "UNDERVALUED") &&
    sig.confidence >= 70 &&
    sig.quality.status !== "insufficient"
  );
}
