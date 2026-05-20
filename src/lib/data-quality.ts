// Pure data-quality computer. No DB/network — operates only on snapshots
// already built by the decision engine. Safe to import from anywhere.

export type QualityLevel = "fresh" | "moderate" | "stale" | "available" | "insufficient" | "unavailable";

export type DataQualityReport = {
  symbol: string;
  overallDataQualityScore: number;     // 0..100
  priceDataQuality: QualityLevel;
  technicalDataQuality: QualityLevel;
  newsDataQuality: QualityLevel;
  sentimentDataQuality: QualityLevel;
  disclosureDataQuality: QualityLevel;
  fundamentalDataQuality: QualityLevel;
  sourceReliabilityScore: number;      // 0..100
  decisionAllowed: boolean;
  warnings: string[];
};

type Inputs = {
  symbol: string;
  price?: { value: number | null | undefined; freshnessSeconds: number | null | undefined } | null;
  technical?: { hasData: boolean; score?: number | null } | null;
  news?: { count: number; sources: number; highImpact: number } | null;
  sentiment?: { score: number | null | undefined; sampleCount: number } | null;
  disclosure?: { hasRecent: boolean; ageHours?: number | null } | null;
  fundamental?: { hasCoreRatios: boolean; reportAgeDays?: number | null } | null;
};

const score = (lvl: QualityLevel): number => {
  switch (lvl) {
    case "fresh":
    case "available":
      return 100;
    case "moderate":
      return 65;
    case "stale":
      return 35;
    case "insufficient":
      return 20;
    default:
      return 0;
  }
};

export function computeDataQuality(input: Inputs): DataQualityReport {
  const warnings: string[] = [];

  // Price
  let priceQ: QualityLevel = "unavailable";
  const p = input.price;
  if (p && p.value != null && Number.isFinite(Number(p.value))) {
    const fs = Number(p.freshnessSeconds ?? 999999);
    priceQ = fs <= 15 * 60 ? "fresh" : fs <= 60 * 60 ? "moderate" : "stale";
    if (priceQ !== "fresh") warnings.push(`Price data is ${priceQ}`);
  } else {
    warnings.push("Price unavailable");
  }

  // Technical
  let techQ: QualityLevel = "unavailable";
  if (input.technical?.hasData) {
    techQ = Number.isFinite(Number(input.technical.score)) ? "fresh" : "moderate";
  } else {
    warnings.push("Technical indicators unavailable");
  }

  // News
  let newsQ: QualityLevel = "unavailable";
  const n = input.news;
  if (n && n.count > 0) {
    newsQ = n.count >= 5 && n.sources >= 2 ? "fresh" : n.count >= 2 ? "moderate" : "insufficient";
    if (newsQ === "insufficient") warnings.push("News volume low");
  } else {
    warnings.push("News unavailable");
  }

  // Sentiment
  let sentQ: QualityLevel = "unavailable";
  const s = input.sentiment;
  if (s && Number.isFinite(Number(s.score))) {
    sentQ = s.sampleCount >= 5 ? "fresh" : s.sampleCount >= 2 ? "moderate" : "insufficient";
    if (sentQ === "insufficient") warnings.push("Sentiment based on few samples");
  } else {
    warnings.push("Sentiment unavailable");
  }

  // Disclosure
  let discQ: QualityLevel = "unavailable";
  if (input.disclosure?.hasRecent) {
    const ageH = Number(input.disclosure.ageHours ?? 999);
    discQ = ageH <= 24 ? "fresh" : ageH <= 24 * 7 ? "moderate" : "stale";
    if (discQ === "stale") warnings.push("Disclosure data is stale");
  } else {
    discQ = "insufficient";
  }

  // Fundamental
  let fundQ: QualityLevel = "unavailable";
  if (input.fundamental?.hasCoreRatios) {
    const ageD = Number(input.fundamental.reportAgeDays ?? 999);
    fundQ = ageD <= 120 ? "available" : ageD <= 365 ? "moderate" : "stale";
    if (fundQ === "stale") warnings.push("Fundamental report outdated");
  } else {
    fundQ = "insufficient";
  }

  // Weighted overall (price + technical are dominant for trading decisions).
  const weights = { price: 0.25, tech: 0.20, news: 0.15, sent: 0.15, disc: 0.10, fund: 0.15 };
  const overall =
    score(priceQ) * weights.price +
    score(techQ) * weights.tech +
    score(newsQ) * weights.news +
    score(sentQ) * weights.sent +
    score(discQ) * weights.disc +
    score(fundQ) * weights.fund;

  // Source reliability proxy: average of price + news quality (the two ingestion-heavy paths)
  const sourceReliability = (score(priceQ) + score(newsQ)) / 2;

  // Gate: must have at least price + (technical OR news) usable.
  const decisionAllowed =
    priceQ === "fresh" || priceQ === "moderate"
      ? techQ !== "unavailable" || newsQ === "fresh" || newsQ === "moderate"
      : false;

  if (!decisionAllowed && !warnings.includes("Price unavailable") && priceQ === "stale") {
    warnings.push("Decision blocked: price data is stale");
  }

  return {
    symbol: input.symbol,
    overallDataQualityScore: Math.round(overall),
    priceDataQuality: priceQ,
    technicalDataQuality: techQ,
    newsDataQuality: newsQ,
    sentimentDataQuality: sentQ,
    disclosureDataQuality: discQ,
    fundamentalDataQuality: fundQ,
    sourceReliabilityScore: Math.round(sourceReliability),
    decisionAllowed,
    warnings,
  };
}

export function qualityBadgeLabel(report: DataQualityReport): "DATA READY" | "PARTIAL DATA" | "DATA STALE" | "INSUFFICIENT DATA" {
  const s = report.overallDataQualityScore;
  if (s >= 75) return "DATA READY";
  if (s >= 50) return "PARTIAL DATA";
  if (s >= 30) return "DATA STALE";
  return "INSUFFICIENT DATA";
}
