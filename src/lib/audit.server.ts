// Append-only structured audit trail. Writes are server-only (uses
// supabaseAdmin). Never throws — logging is best-effort.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditStatus = "info" | "success" | "warning" | "error" | "blocked";

export type AuditEntry = {
  module: string; // "ai_agent" | "news_pipeline" | "cron" | "risk_engine" | ...
  action: string; // "run" | "decision" | "blocked_buy" | "source_failure" | ...
  status?: AuditStatus;
  entityType?: string | null;
  entityId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("system_audit_logs").insert({
      module: entry.module,
      action: entry.action,
      status: entry.status ?? "info",
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      message: entry.message ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
  } catch {
    // Audit must never break the calling worker.
  }
}
