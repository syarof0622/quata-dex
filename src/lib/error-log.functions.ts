import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logError, type ErrorLogLevel, type ErrorLogSource } from "@/lib/error-logger.server";

const SourceSchema = z.enum(["browser", "server", "api", "server_function", "worker", "database", "ai_gateway", "unknown"]);
const LevelSchema = z.enum(["debug", "info", "warning", "error", "fatal"]);

const ClientErrorSchema = z.object({
  level: LevelSchema.default("error"),
  source: SourceSchema.default("browser"),
  module: z.string().max(120).optional().nullable(),
  action: z.string().max(160).optional().nullable(),
  message: z.string().min(1).max(4000),
  stack: z.string().max(12000).optional().nullable(),
  path: z.string().max(1000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  fingerprint: z.string().max(200).optional().nullable(),
  handled: z.boolean().optional(),
  occurredAt: z.string().datetime().optional(),
});

export type ErrorLogRow = {
  id: string;
  level: ErrorLogLevel;
  source: ErrorLogSource;
  module: string | null;
  action: string | null;
  message: string;
  stack: string | null;
  path: string | null;
  user_agent: string | null;
  metadata: any;
  fingerprint: string | null;
  handled: boolean;
  occurred_at: string;
  created_at: string;
};

export const reportClientError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ClientErrorSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    await logError({
      userId: context.userId,
      level: data.level,
      source: data.source,
      module: data.module,
      action: data.action,
      message: data.message,
      stack: data.stack,
      path: data.path,
      userAgent: getRequestHeader("user-agent"),
      metadata: data.metadata,
      fingerprint: data.fingerprint,
      handled: data.handled,
      occurredAt: data.occurredAt,
    });
    return { ok: true };
  });

export const getErrorLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ErrorLogRow[]> => {
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"]);
    const isAdmin = (roleRows ?? []).length > 0;
    let query = supabaseAdmin
      .from("error_logs")
      .select("id, level, source, module, action, message, stack, path, user_agent, metadata, fingerprint, handled, occurred_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!isAdmin) query = query.or(`user_id.eq.${context.userId},user_id.is.null`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ErrorLogRow[];
  });