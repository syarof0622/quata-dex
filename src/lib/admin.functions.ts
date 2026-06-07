// Admin-only server functions. All calls require an authenticated user that
// has the `admin` or `super_admin` role. Service-role client is used to bypass
// RLS for administrative operations after the role check passes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Forbidden: admin role required");
  }
  return { isSuperAdmin: roles.includes("super_admin") };
}

export const listUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, display_name, status, must_change_password, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    let roleMap = new Map<string, string[]>();
    let accountMap = new Map<string, { cash: number; equity: number; currency: string }>();
    if (ids.length) {
      const [{ data: roles }, { data: accounts }] = await Promise.all([
        supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
        supabaseAdmin.from("paper_accounts").select("user_id, cash, equity, currency").in("user_id", ids),
      ]);
      for (const r of roles ?? []) {
        const list = roleMap.get((r as any).user_id) ?? [];
        list.push((r as any).role);
        roleMap.set((r as any).user_id, list);
      }
      for (const a of accounts ?? []) {
        accountMap.set((a as any).user_id, {
          cash: Number((a as any).cash ?? 0),
          equity: Number((a as any).equity ?? 0),
          currency: (a as any).currency ?? "IDR",
        });
      }
    }
    return {
      users: (profiles ?? []).map((p: any) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
        paper: accountMap.get(p.id) ?? null,
      })),
    };
  });

export const setUserStatusAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; status: "active" | "suspended" | "pending" }) =>
    z.object({
      userId: z.string().uuid(),
      status: z.enum(["active", "suspended", "pending"]),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && data.status === "suspended") {
      throw new Error("Tidak dapat men-suspend akun Anda sendiri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles")
      .update({ status: data.status }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRoleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "user" | "admin"; grant: boolean }) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["user", "admin"]),
      grant: z.boolean(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.userId);
    if (data.role === "admin" && !isSuperAdmin) {
      throw new Error("Hanya Super Admin yang dapat menetapkan peran admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin.from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin.from("user_roles")
        .delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const resetUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; newPassword: string }) =>
    z.object({
      userId: z.string().uuid(),
      newPassword: z.string().min(8).max(128),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles")
      .update({ must_change_password: true }).eq("id", data.userId);
    return { ok: true };
  });

export const getAppSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: data };
  });

export const updateAppSettingsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    registration_enabled?: boolean;
    default_starting_balance?: number;
    default_currency?: string;
    default_language?: string;
    default_ai_agent_mode?: string;
  }) => z.object({
    registration_enabled: z.boolean().optional(),
    default_starting_balance: z.number().positive().max(1e15).optional(),
    default_currency: z.string().min(3).max(8).optional(),
    default_language: z.string().min(2).max(8).optional(),
    default_ai_agent_mode: z.string().min(2).max(64).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings").update(data).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
