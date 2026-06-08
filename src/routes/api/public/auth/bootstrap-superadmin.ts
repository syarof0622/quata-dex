// POST /api/public/auth/bootstrap-superadmin
// Idempotently provisions the Super Admin user (assist@uinws.or.id),
// promotes them to super_admin, and reassigns legacy single-tenant data
// (rows owned by the old hardcoded UUID) to the Super Admin's real auth.uid.
//
// SECURITY:
// - Requires CRON_SECRET via `x-cron-secret` header or `Authorization: Bearer`.
//   Without it, anyone could call this endpoint and seize the admin account.
// - The initial password must be supplied via SUPER_ADMIN_BOOTSTRAP_PASSWORD
//   secret (used ONLY when creating the user for the first time). The
//   password is NEVER reset on subsequent calls — once the user exists,
//   manage credentials through normal account-recovery flows.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { randomBytes } from "node:crypto";

const SUPER_EMAIL = "assist@uinws.or.id";
const LEGACY_UID = "00000000-0000-0000-0000-000000000001";

const LEGACY_USER_TABLES = [
  "paper_accounts", "paper_orders", "paper_positions", "watchlist", "alerts",
  "ai_trade_agents", "trade_journal", "trading_journal",
  "portfolio_equity_snapshots", "portfolio_risk_snapshots",
  "strategy_mode_performance_snapshots",
];

export const Route = createFileRoute("/api/public/auth/bootstrap-superadmin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = checkCronSecret(request);
        if (guard) return guard;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Find or create the user via Admin API
        let userId: string | null = null;
        let created = false;
        try {
          const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const found = list.data.users.find((u: any) => (u.email ?? "").toLowerCase() === SUPER_EMAIL);
          if (found) userId = found.id;
        } catch (e) {
          console.error("[bootstrap] listUsers failed", e);
        }

        if (!userId) {
          // Use configured bootstrap password if provided, else generate a strong random one.
          // We do NOT log or return generated passwords.
          const initialPassword =
            process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD ??
            randomBytes(24).toString("base64url");
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: SUPER_EMAIL,
            password: initialPassword,
            email_confirm: true,
            user_metadata: { full_name: "Super Admin", display_name: "Super Admin" },
          });
          if (error || !data.user) {
            return new Response(JSON.stringify({ ok: false, step: "create_user", error: error?.message }), { status: 500, headers: { "content-type": "application/json" }});
          }
          userId = data.user.id;
          created = true;
        }
        // NOTE: We intentionally do NOT reset the password on existing users.
        // Use Supabase's password-recovery flow if credentials are lost.

        // 2) Ensure profile + super_admin role + must_change_password=true
        await supabaseAdmin.from("profiles").upsert({
          id: userId, email: SUPER_EMAIL,
          full_name: "Super Admin", display_name: "Super Admin",
          status: "active", must_change_password: true,
        } as any, { onConflict: "id" });

        await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "super_admin" } as any, { onConflict: "user_id,role" });

        // 3) Reassign legacy data
        const reassigned: Record<string, number> = {};
        for (const t of LEGACY_USER_TABLES) {
          try {
            const { error, count } = await (supabaseAdmin.from(t as any) as any).update({ user_id: userId }, { count: "exact" }).eq("user_id", LEGACY_UID);
            reassigned[t] = error ? -1 : (count ?? 0);
          } catch { reassigned[t] = -1; }
        }

        // 4) Ensure paper_accounts row for super admin
        const { data: pa } = await supabaseAdmin.from("paper_accounts").select("id").eq("user_id", userId).maybeSingle();
        if (!pa) {
          await supabaseAdmin.from("paper_accounts").insert({
            user_id: userId, starting_balance: 100000000, cash: 100000000, equity: 100000000,
            currency: "IDR", account_name: "Akun Paper Trading Utama", status: "active", is_default: true,
          } as any);
        }

        // 5) Ensure user_ai_settings + user_settings
        await supabaseAdmin.from("user_ai_settings").upsert({ user_id: userId } as any, { onConflict: "user_id" });
        await supabaseAdmin.from("user_settings").upsert({ user_id: userId, language: "id", currency: "IDR" } as any, { onConflict: "user_id" });

        return new Response(JSON.stringify({ ok: true, userId, created, reassigned }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
