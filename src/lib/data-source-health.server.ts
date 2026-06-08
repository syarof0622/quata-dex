// Shared mirror helper for the unified data_sources / source_health_logs registry
// (created in Batch 1). Cron endpoints call these helpers so that the AI Agent,
// AI Analyst, and System Health UI all read from a single source of truth with
// honest status enums:
//   active | fallback_active | quota_protected | rate_limited | degraded |
//   failed | market_closed | no_event | not_configured | not_run | unauthorized
//
// IMPORTANT: market_closed, no_event, quota_protected, not_configured, not_run
// are NOT errors. Do not raise alerts on these.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type HonestSourceStatus =
  | "active"
  | "fallback_active"
  | "quota_protected"
  | "rate_limited"
  | "degraded"
  | "failed"
  | "market_closed"
  | "no_event"
  | "not_configured"
  | "not_run"
  | "unauthorized";

/** Non-failure statuses — UI should render these as info/neutral, never red. */
export const NON_FAILURE_STATUSES: HonestSourceStatus[] = [
  "active",
  "fallback_active",
  "quota_protected",
  "market_closed",
  "no_event",
  "not_configured",
  "not_run",
];

export interface SourceHealthInput {
  source_key: string;
  pipeline_name: string; // "news" | "market" | "disclosure" | "fundamental" | ...
  status: HonestSourceStatus;
  duration_ms?: number;
  items_fetched?: number;
  message?: string | null;
  error_detail?: Record<string, unknown> | null;
}

/** Insert a per-run row into source_health_logs AND upsert the rollup on data_sources. */
export async function logSourceHealth(input: SourceHealthInput): Promise<void> {
  const now = new Date().toISOString();
  const isSuccess = NON_FAILURE_STATUSES.includes(input.status) || input.status === "active";

  try {
    await supabaseAdmin.from("source_health_logs").insert({
      source_key: input.source_key,
      pipeline_name: input.pipeline_name,
      status: input.status,
      duration_ms: input.duration_ms ?? null,
      items_fetched: input.items_fetched ?? 0,
      message: input.message ?? null,
      error_detail: input.error_detail ?? null,
    } as any);
  } catch {
    /* best-effort */
  }

  try {
    const patch: Record<string, unknown> = {
      health_status: input.status,
      last_message: input.message ?? null,
      updated_at: now,
    };
    if (input.status === "active" || input.status === "fallback_active") {
      patch.last_success_at = now;
    } else if (input.status === "failed" || input.status === "degraded" || input.status === "rate_limited") {
      patch.last_failure_at = now;
    }
    // market_closed / no_event / quota_protected / not_configured / not_run:
    // touch updated_at + last_message only — neither success nor failure.
    void isSuccess;
    await supabaseAdmin.from("data_sources").update(patch as any).eq("source_key", input.source_key);
  } catch {
    /* best-effort */
  }
}

/** Bulk variant — single round-trip per pipeline. */
export async function logSourceHealthBatch(entries: SourceHealthInput[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await supabaseAdmin.from("source_health_logs").insert(
      entries.map((e) => ({
        source_key: e.source_key,
        pipeline_name: e.pipeline_name,
        status: e.status,
        duration_ms: e.duration_ms ?? null,
        items_fetched: e.items_fetched ?? 0,
        message: e.message ?? null,
        error_detail: e.error_detail ?? null,
      })) as any,
    );
  } catch {
    /* best-effort */
  }
  // Rollups: update each affected source row (small N, sequential is fine).
  for (const e of entries) {
    await logSourceHealthRollupOnly(e);
  }
}

async function logSourceHealthRollupOnly(input: SourceHealthInput): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    health_status: input.status,
    last_message: input.message ?? null,
    updated_at: now,
  };
  if (input.status === "active" || input.status === "fallback_active") patch.last_success_at = now;
  else if (input.status === "failed" || input.status === "degraded" || input.status === "rate_limited") {
    patch.last_failure_at = now;
  }
  try {
    await supabaseAdmin.from("data_sources").update(patch as any).eq("source_key", input.source_key);
  } catch {
    /* best-effort */
  }
}
