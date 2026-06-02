// Update 15 — Confidence + status engine for the unified fundamental row.
// Pure, deterministic, no DB calls — caller passes in what was actually
// fetched/preserved and the function decides:
//   - data_status: full | partial | insufficient | unavailable | stale
//   - freshness_status: fresh | acceptable | stale | unavailable
//   - source_confidence: 0..100
//   - confidence_label: HIGH | MEDIUM | LOW | PARTIAL | NONE
//   - missing_fields: text[]
//   - missing_reason: { field -> reason_code }
//
// Spec rule (PART 6):
//   If only PER + Market Cap + Dividend Yield are available -> status=partial,
//   confidence_label cannot exceed LOW/PARTIAL, score capped at 50.

export type ReasonCode =
  | "provider_not_available_for_idx"
  | "source_missing_field"
  | "stale_source"
  | "invalid_value"
  | "denominator_missing"
  | "denominator_zero"
  | "not_yet_fetched"
  | "requires_financial_statement_provider"
  | "source_failed"
  | "no_validated_source";

export type ConfidenceInput = {
  // metrics that survived merge (number or null)
  metrics: Record<string, number | null | undefined>;
  // primary source used for the latest row (twelve_data, serpapi_google_finance, news_mined, manual_import)
  sourcePrimary: string | null;
  // ISO timestamp of latest fetch (or null if never)
  lastFundamentalFetchAt: string | null;
  // additional source name list (e.g. ['serpapi_google_finance','news_mined'])
  sourcesUsed: string[];
  // count of related news articles linked to this symbol
  relatedNewsCount?: number;
  // explicit per-field reasons known by caller (overrides defaults)
  knownReasons?: Partial<Record<string, ReasonCode>>;
};

export type ConfidenceOutput = {
  dataStatus: "full" | "partial" | "insufficient" | "unavailable" | "stale";
  freshnessStatus: "fresh" | "acceptable" | "stale" | "unavailable";
  sourceConfidence: number; // 0..100
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW" | "PARTIAL" | "NONE";
  missingFields: string[];
  missingReason: Record<string, ReasonCode>;
  validationNotes: string[];
};

// Field groups
const MARKET_FIELDS = ["per", "market_cap", "dividend_yield", "price"] as const;
const STATEMENT_FIELDS = [
  "pbv",
  "roe",
  "der",
  "eps_growth_yoy",
  "revenue_growth_yoy",
  "net_profit_growth_yoy",
  "eps",
  "revenue",
  "net_profit",
  "total_equity",
  "total_debt",
  "book_value_per_share",
] as const;

const SOURCE_BASE_CONFIDENCE: Record<string, number> = {
  manual_import: 95,
  twelve_data: 90,
  serpapi_google_finance: 55,
  news_mined: 35,
};

function hasValue(v: unknown): boolean {
  return v != null && Number.isFinite(Number(v));
}

function freshnessOf(iso: string | null): ConfidenceOutput["freshnessStatus"] {
  if (!iso) return "unavailable";
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH <= 24) return "fresh";
  if (ageH <= 24 * 7) return "acceptable";
  return "stale";
}

export function calculateFundamentalConfidence(
  input: ConfidenceInput,
): ConfidenceOutput {
  const { metrics, sourcePrimary, sourcesUsed, lastFundamentalFetchAt } = input;

  const presentMarket = MARKET_FIELDS.filter((f) => hasValue(metrics[f]));
  const presentStatement = STATEMENT_FIELDS.filter((f) => hasValue(metrics[f]));
  const missingMarket = MARKET_FIELDS.filter((f) => !hasValue(metrics[f]));
  const missingStatement = STATEMENT_FIELDS.filter((f) => !hasValue(metrics[f]));
  const allMissing = [...missingMarket, ...missingStatement];

  // Build per-field missing_reason
  const reasons: Record<string, ReasonCode> = {};
  for (const f of missingStatement) {
    reasons[f] = input.knownReasons?.[f] ?? "requires_financial_statement_provider";
  }
  for (const f of missingMarket) {
    reasons[f] = input.knownReasons?.[f] ?? (sourcePrimary ? "source_missing_field" : "not_yet_fetched");
  }

  // Decide data_status
  let dataStatus: ConfidenceOutput["dataStatus"];
  if (!sourcePrimary && presentMarket.length === 0 && presentStatement.length === 0) {
    dataStatus = "unavailable";
  } else if (presentStatement.length >= 4 && hasValue(metrics.pbv) && hasValue(metrics.roe)) {
    dataStatus = "full";
  } else if (presentMarket.length > 0 || presentStatement.length > 0) {
    dataStatus = "partial";
  } else {
    dataStatus = "insufficient";
  }

  // Freshness
  let freshnessStatus = freshnessOf(lastFundamentalFetchAt);
  if (freshnessStatus === "stale" && dataStatus !== "unavailable") {
    // Preserve "partial" semantics but caller may still surface "stale"
  }

  // Score
  let score = 0;
  if (sourcePrimary) {
    score = SOURCE_BASE_CONFIDENCE[sourcePrimary] ?? 40;
  }
  // Penalize partial coverage
  if (dataStatus === "partial") score = Math.min(score, 50);
  if (dataStatus === "insufficient") score = Math.min(score, 25);
  if (dataStatus === "unavailable") score = 0;
  // Freshness penalty
  if (freshnessStatus === "acceptable") score = Math.round(score * 0.9);
  if (freshnessStatus === "stale") score = Math.round(score * 0.6);
  if (freshnessStatus === "unavailable" && dataStatus !== "unavailable") {
    score = Math.round(score * 0.5);
  }
  // Multi-source corroboration bonus (+ up to 10)
  const distinctSources = new Set(sourcesUsed.filter(Boolean)).size;
  if (distinctSources >= 2) score = Math.min(100, score + 5);
  if (distinctSources >= 3) score = Math.min(100, score + 5);

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Label
  let confidenceLabel: ConfidenceOutput["confidenceLabel"];
  if (dataStatus === "unavailable") confidenceLabel = "NONE";
  else if (dataStatus === "partial") confidenceLabel = score >= 45 ? "PARTIAL" : "LOW";
  else if (dataStatus === "insufficient") confidenceLabel = "LOW";
  else if (score >= 80) confidenceLabel = "HIGH";
  else if (score >= 60) confidenceLabel = "MEDIUM";
  else confidenceLabel = "LOW";

  // Validation notes
  const notes: string[] = [];
  if (dataStatus === "partial") {
    notes.push(
      "Partial market fundamental data available. Financial statement metrics (PBV, ROE, DER, growth) require a validated provider.",
    );
  }
  if (dataStatus === "unavailable") {
    notes.push("No validated source returned data for this symbol yet.");
  }
  if (sourcePrimary === "news_mined") {
    notes.push(
      "Metrics extracted from stored news as a fallback. Verify against an official disclosure before treating as authoritative.",
    );
  }
  if (freshnessStatus === "stale") {
    notes.push("Latest fetch is older than 7 days. Re-run fundamentals ingest to refresh.");
  }

  return {
    dataStatus,
    freshnessStatus,
    sourceConfidence: score,
    confidenceLabel,
    missingFields: allMissing,
    missingReason: reasons,
    validationNotes: notes,
  };
}
