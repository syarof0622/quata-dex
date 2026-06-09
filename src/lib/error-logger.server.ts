import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ErrorLogSource = "browser" | "server" | "api" | "server_function" | "worker" | "database" | "ai_gateway" | "unknown";
export type ErrorLogLevel = "debug" | "info" | "warning" | "error" | "fatal";

export type ErrorLogInput = {
  userId?: string | null;
  level?: ErrorLogLevel;
  source?: ErrorLogSource;
  module?: string | null;
  action?: string | null;
  message: string;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  fingerprint?: string | null;
  handled?: boolean;
  occurredAt?: string;
};

function sanitizeText(value: unknown, max = 4000): string | null {
  if (value == null) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function fingerprintOf(input: Pick<ErrorLogInput, "source" | "module" | "action" | "message" | "stack">): string {
  const raw = [input.source ?? "unknown", input.module ?? "", input.action ?? "", input.message, input.stack?.split("\n")[0] ?? ""].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(31, hash) + raw.charCodeAt(i) | 0;
  return Math.abs(hash).toString(36);
}

export function errorToLogInput(error: unknown, fallback: Omit<ErrorLogInput, "message"> & { message?: string }): ErrorLogInput {
  const err = error instanceof Error ? error : null;
  const message = sanitizeText(err?.message ?? fallback.message ?? error, 4000) ?? "Unknown error";
  return {
    ...fallback,
    message,
    stack: sanitizeText(err?.stack ?? fallback.stack, 12000),
    metadata: {
      ...(fallback.metadata ?? {}),
      errorName: err?.name ?? typeof error,
    },
  };
}

export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const message = sanitizeText(input.message, 4000) ?? "Unknown error";
    await supabaseAdmin.from("error_logs").insert({
      user_id: input.userId ?? null,
      level: input.level ?? "error",
      source: input.source ?? "unknown",
      module: sanitizeText(input.module, 120),
      action: sanitizeText(input.action, 160),
      message,
      stack: sanitizeText(input.stack, 12000),
      path: sanitizeText(input.path, 1000),
      user_agent: sanitizeText(input.userAgent, 1000),
      metadata: (input.metadata ?? {}) as never,
      fingerprint: sanitizeText(input.fingerprint, 200) ?? fingerprintOf({ ...input, message }),
      handled: input.handled ?? false,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
  } catch {
    // Error logging must never break the original process.
  }
}