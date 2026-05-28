// Disclosure / Corporate Action / Regulatory Event classification engines.
// Pure functions — server-only by convention (no client imports).
// Used by: ingestion pipelines, manual import, AI app context builder, risk engine.

export type Directness = "direct_ticker_catalyst" | "sector_context" | "macro_context" | "low_relevance" | "noise";
export type TradingRelevance = "immediate" | "watch" | "monitor" | "low" | "none";
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Severity = "low" | "medium" | "high" | "critical";

export type ClassifiedDisclosure = {
  disclosureType: string;
  category: string;
  impactScore: number;
  sentiment: Sentiment;
  directness: Directness;
  tradingRelevance: TradingRelevance;
  riskFlags: string[];
  isHighImpact: boolean;
  explanation: string;
};

const HIGH_IMPACT_TYPES = new Set([
  "financial_statement", "dividend", "rights_issue", "buyback",
  "suspension", "uma", "material_transaction", "merger_acquisition",
  "debt_restructuring", "management_change", "litigation",
  "financial_report_delay",
]);

const NEGATIVE_TYPES = new Set([
  "suspension", "uma", "litigation", "debt_restructuring",
  "financial_report_delay", "delisting_risk", "rights_issue",
]);

const POSITIVE_TYPES = new Set(["dividend", "buyback", "financial_statement"]);

/**
 * Classify a raw disclosure into impact + risk metadata.
 * Input: { disclosure_type, title, summary?, raw_text? }
 */
export function classifyDisclosureImpact(input: {
  disclosure_type: string;
  title: string;
  summary?: string | null;
  raw_text?: string | null;
}): ClassifiedDisclosure {
  const t = (input.disclosure_type || "other").toLowerCase();
  const titleLc = (input.title || "").toLowerCase();
  const bodyLc = `${input.summary ?? ""} ${input.raw_text ?? ""}`.toLowerCase();

  const isHighImpact = HIGH_IMPACT_TYPES.has(t);

  let sentiment: Sentiment = "neutral";
  if (POSITIVE_TYPES.has(t)) sentiment = "positive";
  if (NEGATIVE_TYPES.has(t)) sentiment = "negative";
  if (/rugi|loss|penurunan|delisting|gagal bayar|default|pailit/.test(bodyLc + titleLc)) sentiment = "negative";
  if (/laba naik|pertumbuhan|kenaikan laba|record high|dividen naik/.test(bodyLc + titleLc) && sentiment !== "negative") sentiment = "positive";

  // Impact score baseline
  let impactScore = 25;
  if (isHighImpact) impactScore = 65;
  if (t === "suspension" || t === "delisting_risk") impactScore = 95;
  if (t === "uma") impactScore = 85;
  if (t === "merger_acquisition" || t === "material_transaction") impactScore = 80;
  if (t === "dividend" || t === "buyback") impactScore = 70;
  if (t === "rights_issue") impactScore = 75;
  if (t === "financial_statement") impactScore = 60;
  if (sentiment === "negative" && isHighImpact) impactScore = Math.min(100, impactScore + 10);

  const directness: Directness = isHighImpact ? "direct_ticker_catalyst" : "low_relevance";
  let tradingRelevance: TradingRelevance = "low";
  if (impactScore >= 80) tradingRelevance = "immediate";
  else if (impactScore >= 60) tradingRelevance = "watch";
  else if (impactScore >= 40) tradingRelevance = "monitor";

  const riskFlags: string[] = [];
  if (t === "suspension") riskFlags.push("suspension_detected");
  if (t === "uma") riskFlags.push("uma_risk_detected");
  if (t === "delisting_risk") riskFlags.push("delisting_risk_detected");
  if (t === "rights_issue") riskFlags.push("rights_issue_dilution_risk");
  if (t === "financial_report_delay") riskFlags.push("financial_report_delay");
  if (sentiment === "negative" && isHighImpact) riskFlags.push("negative_disclosure_detected");

  return {
    disclosureType: t,
    category: isHighImpact ? "high_impact" : "general",
    impactScore,
    sentiment,
    directness,
    tradingRelevance,
    riskFlags,
    isHighImpact,
    explanation: `${t} → impact ${impactScore} (${sentiment}); relevance ${tradingRelevance}`,
  };
}

export type ClassifiedCorporateAction = {
  impactScore: number;
  sentiment: Sentiment;
  riskFlags: string[];
  tradingWindow: { cum?: string | null; ex?: string | null };
  explanation: string;
};

export function classifyCorporateActionImpact(input: {
  action_type: string;
  cum_date?: string | Date | null;
  ex_date?: string | Date | null;
  amount?: number | null;
}): ClassifiedCorporateAction {
  const t = (input.action_type || "other").toLowerCase();
  let impactScore = 30;
  let sentiment: Sentiment = "neutral";
  const riskFlags: string[] = [];

  switch (t) {
    case "cash_dividend":
    case "stock_dividend":
      impactScore = 60; sentiment = "positive";
      riskFlags.push("ex_date_price_drop_risk");
      break;
    case "rights_issue":
      impactScore = 75; sentiment = "negative";
      riskFlags.push("rights_issue_dilution_risk");
      break;
    case "buyback":
      impactScore = 65; sentiment = "positive";
      break;
    case "stock_split":
      impactScore = 45; sentiment = "neutral";
      riskFlags.push("liquidity_event");
      break;
    case "reverse_stock":
      impactScore = 60; sentiment = "negative";
      riskFlags.push("reverse_split_caution");
      break;
    case "merger":
    case "acquisition":
    case "tender_offer":
      impactScore = 80; sentiment = "mixed";
      riskFlags.push("m_and_a_event");
      break;
    case "bonus_share":
      impactScore = 50; sentiment = "positive";
      break;
    case "warrant":
      impactScore = 40; sentiment = "neutral";
      riskFlags.push("warrant_dilution_risk");
      break;
  }

  const toISO = (v: string | Date | null | undefined) =>
    v ? (v instanceof Date ? v.toISOString() : v) : null;

  return {
    impactScore,
    sentiment,
    riskFlags,
    tradingWindow: { cum: toISO(input.cum_date), ex: toISO(input.ex_date) },
    explanation: `${t}: impact ${impactScore}, ${sentiment}`,
  };
}

export type ClassifiedRegulatoryEvent = {
  severity: Severity;
  impactScore: number;
  tradeRestriction: "none" | "soft_warn" | "hard_block_buy" | "hard_block_all";
  riskFlags: string[];
};

export function classifyRegulatoryEventImpact(input: { event_type: string }): ClassifiedRegulatoryEvent {
  const t = (input.event_type || "OTHER").toUpperCase();
  switch (t) {
    case "SUSPENSION":
    case "TRADING_HALT":
      return { severity: "critical", impactScore: 100, tradeRestriction: "hard_block_all", riskFlags: ["suspension_detected"] };
    case "DELISTING_RISK":
      return { severity: "critical", impactScore: 95, tradeRestriction: "hard_block_buy", riskFlags: ["delisting_risk_detected"] };
    case "UMA":
      return { severity: "high", impactScore: 85, tradeRestriction: "hard_block_buy", riskFlags: ["uma_risk_detected"] };
    case "SPECIAL_MONITORING":
    case "WATCHLIST":
      return { severity: "high", impactScore: 70, tradeRestriction: "soft_warn", riskFlags: ["special_monitoring"] };
    case "UNSUSPENSION":
      return { severity: "medium", impactScore: 50, tradeRestriction: "none", riskFlags: [] };
    case "DISCLOSURE_DELAY":
    case "FINANCIAL_REPORT_DELAY":
      return { severity: "medium", impactScore: 55, tradeRestriction: "soft_warn", riskFlags: ["financial_report_delay"] };
    default:
      return { severity: "low", impactScore: 25, tradeRestriction: "none", riskFlags: [] };
  }
}

/**
 * Freshness classifier — works for any timestamp field.
 */
export function classifyDisclosureFreshness(lastUpdatedAt: Date | string | null | undefined): "Fresh" | "Recent" | "Partial" | "Stale" | "Unavailable" {
  if (!lastUpdatedAt) return "Unavailable";
  const ts = typeof lastUpdatedAt === "string" ? Date.parse(lastUpdatedAt) : lastUpdatedAt.getTime();
  if (!Number.isFinite(ts)) return "Unavailable";
  const ageH = (Date.now() - ts) / 3_600_000;
  if (ageH <= 24) return "Fresh";
  if (ageH <= 24 * 7) return "Recent";
  if (ageH <= 24 * 30) return "Partial";
  return "Stale";
}
