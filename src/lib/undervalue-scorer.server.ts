// Undervalue scoring engine — pure deterministic function.
// Toleran terhadap field null. Tidak memanggil LLM. Bahasa reasoning: Indonesia.

import type { FundamentalsRow } from "./fundamentals-fetcher.server";

export type Classification =
  | "strong_undervalued"
  | "undervalued"
  | "fair_value"
  | "overvalued"
  | "value_trap_risk"
  | "insufficient_data";

export type UndervalueResult = {
  symbol: string;
  classification: Classification;
  finalUndervalueScore: number;
  valuationScore: number;
  qualityScore: number;
  growthScore: number;
  financialHealthScore: number;
  dividendScore: number;
  sectorRelativeScore: number;
  technicalTimingScore: number;
  valueTrapRiskScore: number;
  reasoning: string;
  warnings: string[];
  dataCoverage: number; // 0..1
};

export type TechSnapshot = {
  trend?: "bullish" | "bearish" | "neutral";
  rsi?: number | null;
  nearSupport?: boolean;
  score?: number | null; // -100..100
};

export type NewsSnapshot = {
  negativeCount?: number;
  highImpactNegative?: number;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function fieldsCovered(f: FundamentalsRow): number {
  const fields = [
    f.per, f.pbv, f.eps, f.roe, f.roa, f.der,
    f.revenue, f.revenue_growth_yoy, f.net_profit, f.net_profit_growth_yoy,
    f.gross_margin, f.net_margin, f.operating_cash_flow, f.free_cash_flow,
    f.dividend_yield, f.sector_per_avg, f.sector_pbv_avg,
  ];
  const ok = fields.filter((v) => v != null && Number.isFinite(Number(v))).length;
  return ok / fields.length;
}

export function scoreUndervalue(
  f: FundamentalsRow,
  ctx: {
    tech?: TechSnapshot;
    news?: NewsSnapshot;
    sectorAvg?: { per: number | null; pbv: number | null; roe: number | null };
  } = {},
): UndervalueResult {
  const warnings: string[] = [];
  const sector = ctx.sectorAvg ?? {
    per: f.sector_per_avg,
    pbv: f.sector_pbv_avg,
    roe: f.sector_roe_avg,
  };

  // --- 1. Valuation Score (PER, PBV vs sector & historis) ---
  const valParts: number[] = [];
  if (f.per != null && sector.per && sector.per > 0) {
    const ratio = f.per / sector.per; // <1 => murah
    valParts.push(clamp(100 - (ratio - 1) * 100));
  }
  if (f.pbv != null && sector.pbv && sector.pbv > 0) {
    const ratio = f.pbv / sector.pbv;
    valParts.push(clamp(100 - (ratio - 1) * 100));
  }
  if (f.per != null && f.historical_per_avg && f.historical_per_avg > 0) {
    const ratio = f.per / f.historical_per_avg;
    valParts.push(clamp(100 - (ratio - 1) * 80));
  }
  if (f.pbv != null && f.historical_pbv_avg && f.historical_pbv_avg > 0) {
    const ratio = f.pbv / f.historical_pbv_avg;
    valParts.push(clamp(100 - (ratio - 1) * 80));
  }
  // Fallback: standalone PER / PBV absolute heuristic
  if (valParts.length === 0 && f.per != null) {
    valParts.push(f.per < 8 ? 85 : f.per < 15 ? 65 : f.per < 25 ? 45 : 25);
  }
  if (valParts.length === 0 && f.pbv != null) {
    valParts.push(f.pbv < 0.8 ? 85 : f.pbv < 1.5 ? 65 : f.pbv < 3 ? 45 : 25);
  }
  const valuationScore = valParts.length
    ? +(valParts.reduce((s, n) => s + n, 0) / valParts.length).toFixed(1)
    : 50;

  // --- 2. Quality Score (ROE, ROA, margin) ---
  const qParts: number[] = [];
  if (f.roe != null) qParts.push(clamp(f.roe * 100 * 5)); // 20% ROE ~ 100
  if (f.roa != null) qParts.push(clamp(f.roa * 100 * 10));
  if (f.net_margin != null) qParts.push(clamp(f.net_margin * 100 * 5));
  if (f.gross_margin != null) qParts.push(clamp(f.gross_margin * 100 * 2));
  const qualityScore = qParts.length
    ? +(qParts.reduce((s, n) => s + n, 0) / qParts.length).toFixed(1)
    : 50;

  // --- 3. Growth Score ---
  const gParts: number[] = [];
  if (f.revenue_growth_yoy != null) gParts.push(clamp(50 + f.revenue_growth_yoy * 100));
  if (f.net_profit_growth_yoy != null) gParts.push(clamp(50 + f.net_profit_growth_yoy * 100));
  const growthScore = gParts.length
    ? +(gParts.reduce((s, n) => s + n, 0) / gParts.length).toFixed(1)
    : 50;

  // --- 4. Financial Health ---
  const fhParts: number[] = [];
  if (f.der != null) {
    fhParts.push(f.der < 0.5 ? 95 : f.der < 1 ? 80 : f.der < 2 ? 55 : 25);
    if (f.der > 2) warnings.push("DER tinggi (>2)");
  }
  if (f.operating_cash_flow != null) fhParts.push(f.operating_cash_flow > 0 ? 85 : 25);
  if (f.free_cash_flow != null) fhParts.push(f.free_cash_flow > 0 ? 85 : 30);
  if (f.net_profit != null) {
    fhParts.push(f.net_profit > 0 ? 80 : 20);
    if (f.net_profit < 0) warnings.push("Net profit negatif");
  }
  const financialHealthScore = fhParts.length
    ? +(fhParts.reduce((s, n) => s + n, 0) / fhParts.length).toFixed(1)
    : 50;

  // --- 5. Dividend ---
  const dParts: number[] = [];
  if (f.dividend_yield != null) {
    const dy = f.dividend_yield;
    dParts.push(dy > 0.06 ? 95 : dy > 0.04 ? 80 : dy > 0.02 ? 65 : dy > 0 ? 50 : 30);
  }
  if (f.dividend_payout_ratio != null) {
    const pr = f.dividend_payout_ratio;
    dParts.push(pr > 0 && pr < 0.7 ? 85 : pr >= 0.7 && pr <= 1 ? 60 : 30);
  }
  const dividendScore = dParts.length
    ? +(dParts.reduce((s, n) => s + n, 0) / dParts.length).toFixed(1)
    : 50;

  // --- 6. Sector Relative ---
  const srParts: number[] = [];
  if (f.per != null && sector.per && sector.per > 0) {
    srParts.push(clamp(100 - (f.per / sector.per - 1) * 80));
  }
  if (f.pbv != null && sector.pbv && sector.pbv > 0) {
    srParts.push(clamp(100 - (f.pbv / sector.pbv - 1) * 80));
  }
  if (f.roe != null && sector.roe && sector.roe > 0) {
    srParts.push(clamp(50 + (f.roe / sector.roe - 1) * 50));
  }
  const sectorRelativeScore = srParts.length
    ? +(srParts.reduce((s, n) => s + n, 0) / srParts.length).toFixed(1)
    : 50;

  // --- 7. Technical Timing ---
  let technicalTimingScore = 50;
  if (ctx.tech) {
    const t = ctx.tech;
    let s = 50;
    if (t.score != null) s = clamp(50 + Number(t.score) * 0.4);
    if (t.trend === "bullish") s = Math.min(95, s + 10);
    if (t.trend === "bearish") s = Math.max(15, s - 15);
    if (t.nearSupport) s = Math.min(95, s + 10);
    if (t.rsi != null && t.rsi < 35) s = Math.min(95, s + 10);
    if (t.rsi != null && t.rsi > 75) s = Math.max(20, s - 10);
    technicalTimingScore = +s.toFixed(1);
  }

  // --- 8. Value Trap Risk ---
  let trap = 0;
  const trapNotes: string[] = [];
  if (f.revenue_growth_yoy != null && f.revenue_growth_yoy < -0.2) {
    trap += 20; trapNotes.push("Revenue turun >20% YoY");
  }
  if (f.net_profit_growth_yoy != null && f.net_profit_growth_yoy < -0.2) {
    trap += 25; trapNotes.push("Laba turun >20% YoY");
  }
  if (f.net_profit != null && f.net_profit < 0) {
    trap += 20; trapNotes.push("Rugi bersih");
  }
  if (f.der != null && f.der > 2) {
    trap += 15; trapNotes.push("Utang tinggi");
  }
  if (f.free_cash_flow != null && f.free_cash_flow < 0) {
    trap += 10; trapNotes.push("FCF negatif");
  }
  if (f.operating_cash_flow != null && f.operating_cash_flow < 0) {
    trap += 10; trapNotes.push("OCF negatif");
  }
  if (ctx.news?.highImpactNegative && ctx.news.highImpactNegative > 1) {
    trap += 10; trapNotes.push("Banyak berita negatif berdampak tinggi");
  }
  if (ctx.tech?.trend === "bearish" && ctx.tech?.score != null && ctx.tech.score < -30) {
    trap += 10; trapNotes.push("Downtrend kuat tanpa reversal");
  }
  // Murah ekstrim + sinyal lemah → kemungkinan trap meningkat
  if (valuationScore > 80 && qualityScore < 40) {
    trap += 10; trapNotes.push("Valuasi sangat murah dengan kualitas rendah");
  }
  const valueTrapRiskScore = clamp(trap);

  // --- Composite ---
  const weights = {
    valuation: 0.25,
    quality: 0.20,
    financialHealth: 0.15,
    growth: 0.10,
    dividend: 0.05,
    sectorRelative: 0.15,
    technicalTiming: 0.10,
  };
  const weighted =
    valuationScore * weights.valuation +
    qualityScore * weights.quality +
    financialHealthScore * weights.financialHealth +
    growthScore * weights.growth +
    dividendScore * weights.dividend +
    sectorRelativeScore * weights.sectorRelative +
    technicalTimingScore * weights.technicalTiming;
  const trapPenalty = valueTrapRiskScore * 0.3; // up to -30
  const final = clamp(weighted - trapPenalty);
  const finalUndervalueScore = +final.toFixed(1);

  const coverage = fieldsCovered(f);

  // --- Classification ---
  let classification: Classification;
  if (coverage < 0.4) classification = "insufficient_data";
  else if (valueTrapRiskScore >= 60) classification = "value_trap_risk";
  else if (finalUndervalueScore >= 80) classification = "strong_undervalued";
  else if (finalUndervalueScore >= 65) classification = "undervalued";
  else if (finalUndervalueScore >= 50) classification = "fair_value";
  else classification = "overvalued";

  // --- Reasoning ---
  const parts: string[] = [];
  if (classification === "insufficient_data") {
    parts.push(`Data fundamental hanya terisi ${(coverage * 100).toFixed(0)}% — tidak cukup untuk menilai.`);
  } else if (classification === "value_trap_risk") {
    parts.push(`Saham terlihat murah tetapi terdeteksi sinyal value trap (skor risk ${valueTrapRiskScore.toFixed(0)}).`);
    if (trapNotes.length) parts.push(trapNotes.join("; ") + ".");
  } else {
    if (valuationScore >= 70) parts.push(`Valuasi murah (PER/PBV di bawah sektor/historis, skor ${valuationScore.toFixed(0)}).`);
    else if (valuationScore <= 40) parts.push(`Valuasi mahal dibanding sektor (skor ${valuationScore.toFixed(0)}).`);
    if (qualityScore >= 70) parts.push(`Kualitas fundamental kuat (ROE/margin sehat, skor ${qualityScore.toFixed(0)}).`);
    else if (qualityScore <= 40) parts.push(`Kualitas fundamental lemah (skor ${qualityScore.toFixed(0)}).`);
    if (growthScore >= 65) parts.push(`Pertumbuhan revenue & laba positif.`);
    else if (growthScore <= 35) parts.push(`Pertumbuhan melemah.`);
    if (financialHealthScore <= 40) parts.push(`Kesehatan keuangan perlu diperhatikan.`);
    if (technicalTimingScore >= 65) parts.push(`Timing teknikal mendukung.`);
    else if (technicalTimingScore <= 35) parts.push(`Timing teknikal kurang ideal.`);
  }
  const reasoning = parts.join(" ");

  warnings.push(...trapNotes);
  if (coverage < 0.6) warnings.push(`Coverage data ${(coverage * 100).toFixed(0)}%`);

  return {
    symbol: f.symbol,
    classification,
    finalUndervalueScore,
    valuationScore,
    qualityScore,
    growthScore,
    financialHealthScore,
    dividendScore,
    sectorRelativeScore,
    technicalTimingScore,
    valueTrapRiskScore,
    reasoning,
    warnings: Array.from(new Set(warnings)),
    dataCoverage: +coverage.toFixed(2),
  };
}
