// Shared source-health summary used by AI App Context and AI Analyst header card.
// Normalizes the many raw status values in `news_sources` into a small,
// well-defined vocabulary, and computes an overall status that treats
// fallback_active / quota_protected as PARTIAL (not failed).

export type NormalizedStatus =
  | "active"
  | "fallback_active"
  | "quota_protected"
  | "degraded"
  | "failed"
  | "disabled_by_config"
  | "unknown";

export type OverallStatus =
  | "active"
  | "partial"
  | "degraded"
  | "failed"
  | "unknown";

export interface RawSourceRow {
  id?: string | number;
  name: string;
  status?: string | null;
  enabled?: boolean | null;
  last_success_at?: string | null;
  last_failed_at?: string | null;
  last_error?: string | null;
  fail_count?: number | null;
}

export interface NormalizedSource {
  name: string;
  status: NormalizedStatus;
  severity: "ok" | "info" | "warning" | "error" | "neutral";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  message: string | null;
}

export interface SourceHealthSummary {
  overallStatus: OverallStatus;
  activeCount: number;
  fallbackCount: number;
  quotaProtectedCount: number;
  degradedCount: number;
  failedCount: number;
  disabledCount: number;
  totalUsable: number;
  lastUpdated: string | null;
  sources: NormalizedSource[];
}

function normalizeStatus(row: RawSourceRow): NormalizedStatus {
  const raw = (row.status ?? "").toString().toLowerCase().trim();
  const enabled = row.enabled !== false;
  const err = (row.last_error ?? "").toLowerCase();

  if (!enabled) {
    if (raw.includes("quota")) return "quota_protected";
    return "disabled_by_config";
  }
  if (raw === "active" || raw === "ok" || raw === "success" || raw === "idle" || raw === "healthy") return "active";
  if (raw.includes("fallback")) return "fallback_active";
  if (raw.includes("quota") || err.includes("quota")) return "quota_protected";
  if (raw === "degraded" || raw === "partial" || raw === "warning") return "degraded";
  if (raw === "failed" || raw === "error" || raw === "unhealthy" || raw === "down") return "failed";
  if (!raw) return "unknown";
  return "degraded";
}

function severityFor(s: NormalizedStatus): NormalizedSource["severity"] {
  switch (s) {
    case "active": return "ok";
    case "fallback_active": return "warning";
    case "quota_protected": return "info";
    case "degraded": return "warning";
    case "failed": return "error";
    case "disabled_by_config": return "neutral";
    default: return "neutral";
  }
}

export function summarizeSourceHealth(rows: RawSourceRow[] | null | undefined): SourceHealthSummary {
  const list = Array.isArray(rows) ? rows : [];
  const sources: NormalizedSource[] = list.map((r) => {
    const status = normalizeStatus(r);
    return {
      name: r.name,
      status,
      severity: severityFor(status),
      lastSuccessAt: r.last_success_at ?? null,
      lastErrorAt: r.last_failed_at ?? null,
      message: r.last_error ?? null,
    };
  });

  let activeCount = 0, fallbackCount = 0, quotaProtectedCount = 0,
    degradedCount = 0, failedCount = 0, disabledCount = 0;
  for (const s of sources) {
    switch (s.status) {
      case "active": activeCount++; break;
      case "fallback_active": fallbackCount++; break;
      case "quota_protected": quotaProtectedCount++; break;
      case "degraded": degradedCount++; break;
      case "failed": failedCount++; break;
      case "disabled_by_config": disabledCount++; break;
    }
  }

  const usable = activeCount + fallbackCount + quotaProtectedCount;
  const totalSignaling = usable + degradedCount + failedCount;

  let overallStatus: OverallStatus;
  if (totalSignaling === 0 && disabledCount === 0 && sources.length === 0) {
    overallStatus = "unknown";
  } else if (totalSignaling === 0) {
    overallStatus = "unknown";
  } else if (activeCount > 0 && failedCount === 0 && fallbackCount === 0 && quotaProtectedCount === 0 && degradedCount === 0) {
    overallStatus = "active";
  } else if (usable > 0 && failedCount <= usable) {
    overallStatus = "partial";
  } else if (failedCount > usable && usable > 0) {
    overallStatus = "degraded";
  } else if (usable === 0) {
    overallStatus = "failed";
  } else {
    overallStatus = "partial";
  }

  let lastUpdated: string | null = null;
  for (const s of sources) {
    const t = s.lastSuccessAt ?? s.lastErrorAt;
    if (!t) continue;
    if (!lastUpdated || new Date(t).getTime() > new Date(lastUpdated).getTime()) lastUpdated = t;
  }

  return {
    overallStatus,
    activeCount,
    fallbackCount,
    quotaProtectedCount,
    degradedCount,
    failedCount,
    disabledCount,
    totalUsable: usable,
    lastUpdated,
    sources,
  };
}

export function overallStatusLabel(s: OverallStatus): string {
  switch (s) {
    case "active": return "Active";
    case "partial": return "Partial";
    case "degraded": return "Degraded";
    case "failed": return "Failed";
    default: return "Unknown";
  }
}

export function overallStatusTone(s: OverallStatus): "emerald" | "amber" | "rose" | "slate" {
  switch (s) {
    case "active": return "emerald";
    case "partial": return "amber";
    case "degraded": return "amber";
    case "failed": return "rose";
    default: return "slate";
  }
}

export function summarySubtext(sum: SourceHealthSummary): string {
  if (sum.sources.length === 0) return "no source data";
  const parts: string[] = [];
  if (sum.activeCount) parts.push(`${sum.activeCount} active`);
  if (sum.fallbackCount) parts.push(`${sum.fallbackCount} fallback`);
  if (sum.quotaProtectedCount) parts.push(`${sum.quotaProtectedCount} quota protected`);
  if (sum.degradedCount) parts.push(`${sum.degradedCount} degraded`);
  if (sum.failedCount) parts.push(`${sum.failedCount} failed`);
  if (sum.disabledCount) parts.push(`${sum.disabledCount} disabled`);
  return parts.join(" · ") || "no signal";
}
