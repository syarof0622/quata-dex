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
import { randomBytes } from "node:crypto";
import { checkCronSecret } from "@/lib/cron-auth.server";

const SUPER_EMAIL = "assist@uinws.or.id";
const LEGACY_UID = "00000000-0000-0000-0000-000000000001";

const LEGACY_USER_TABLES = [
  "paper_orders",
  "paper_positions",
  "watchlist",
  "alerts",
  "backtests",
  "ai_trade_agents",
  "paper_balance_events",
  "trade_journal",
  "trading_journal",
  "portfolio_equity_snapshots",
  "portfolio_risk_snapshots",
  "strategy_mode_performance_snapshots",
  "portfolio_holdings",
  "portfolio_intelligence_snapshots",
  "portfolio_scenario_results",
  "position_attribution_snapshots",
  "recent_searches",
  "strategies",
  "strategy_health",
  "symbol_trade_cooldowns",
] as const;

const LEGACY_ACCOUNT_REFS = [
  { table: "paper_orders", column: "account_id" },
  { table: "paper_positions", column: "account_id" },
  { table: "ai_trade_agents", column: "paper_account_id" },
  { table: "ai_agent_decisions", column: "paper_account_id" },
  { table: "ai_agent_performance", column: "paper_account_id" },
  { table: "ai_trade_reviews", column: "paper_account_id" },
  { table: "paper_balance_events", column: "paper_account_id" },
  { table: "portfolio_equity_snapshots", column: "paper_account_id" },
  { table: "portfolio_risk_snapshots", column: "paper_account_id" },
  { table: "swing_trade_plans", column: "paper_account_id" },
  { table: "user_ai_settings", column: "paper_account_id" },
] as const;

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type DynamicMutationResult = PromiseLike<{
  error: { message: string } | null;
  count: number | null;
}>;

type DynamicMutationBuilder = {
  eq: (column: string, value: string) => DynamicMutationResult;
};

type DynamicTable = {
  update: (
    values: Record<string, unknown>,
    options?: { count?: "exact" },
  ) => DynamicMutationBuilder;
};

function dynamicTable(supabaseAdmin: AdminClient, table: string): DynamicTable {
  return (supabaseAdmin as unknown as { from: (name: string) => DynamicTable }).from(table);
}

async function firstUserId(supabaseAdmin: AdminClient): Promise<string | null> {
  const list = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const found = list.data.users.find((user) => (user.email ?? "").toLowerCase() === SUPER_EMAIL);
  return found?.id ?? null;
}

async function mergeLegacyAccount(supabaseAdmin: AdminClient, userId: string): Promise<number> {
  const { data: legacyAccount } = await supabaseAdmin
    .from("paper_accounts")
    .select("id")
    .eq("user_id", LEGACY_UID)
    .order("created_at", { ascending: true })
    .maybeSingle();
  const { data: currentAccount } = await supabaseAdmin
    .from("paper_accounts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .maybeSingle();

  if (legacyAccount?.id && currentAccount?.id && legacyAccount.id !== currentAccount.id) {
    for (const ref of LEGACY_ACCOUNT_REFS) {
      try {
        await dynamicTable(supabaseAdmin, ref.table)
          .update({ [ref.column]: legacyAccount.id })
          .eq(ref.column, currentAccount.id);
      } catch (error) {
        console.warn(`[bootstrap] account ref merge skipped for ${ref.table}.${ref.column}`, error);
      }
    }
    const { error } = await supabaseAdmin
      .from("paper_accounts")
      .delete()
      .eq("id", currentAccount.id);
    if (error) {
      console.warn("[bootstrap] empty current paper account delete skipped", error.message);
    }
  }

  const { error, count } = await supabaseAdmin
    .from("paper_accounts")
    .update({ user_id: userId, is_default: true }, { count: "exact" })
    .eq("user_id", LEGACY_UID);
  return error ? -1 : (count ?? 0);
}

export const Route = createFileRoute("/api/public/auth/bootstrap-superadmin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = checkCronSecret(request);
        if (guard) return guard;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let userId = await firstUserId(supabaseAdmin);
        let created = false;

        if (!userId) {
          const initialPassword =
            process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD ?? randomBytes(24).toString("base64url");
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: SUPER_EMAIL,
            password: initialPassword,
            email_confirm: true,
            user_metadata: {
              full_name: "Super Admin",
              display_name: "Super Admin",
            },
          });
          if (error || !data.user) {
            return new Response(
              JSON.stringify({ ok: false, step: "create_user", error: error?.message }),
              { status: 500, headers: { "content-type": "application/json" } },
            );
          }
          userId = data.user.id;
          created = true;
        }

        await supabaseAdmin.from("profiles").upsert(
          {
            id: userId,
            email: SUPER_EMAIL,
            full_name: "Super Admin",
            display_name: "Super Admin",
            status: "active",
            must_change_password: created,
          },
          { onConflict: "id" },
        );

        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });

        const reassigned: Record<string, number> = {
          paper_accounts: await mergeLegacyAccount(supabaseAdmin, userId),
        };

        for (const table of LEGACY_USER_TABLES) {
          try {
            const { error, count } = await dynamicTable(supabaseAdmin, table)
              .update({ user_id: userId }, { count: "exact" })
              .eq("user_id", LEGACY_UID);
            reassigned[table] = error ? -1 : (count ?? 0);
          } catch {
            reassigned[table] = -1;
          }
        }

        const { data: paperAccount } = await supabaseAdmin
          .from("paper_accounts")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!paperAccount) {
          await supabaseAdmin.from("paper_accounts").insert({
            user_id: userId,
            starting_balance: 100000000,
            cash: 100000000,
            equity: 100000000,
            currency: "IDR",
            account_name: "Akun Paper Trading Utama",
            status: "active",
            is_default: true,
          });
        }

        await supabaseAdmin
          .from("user_ai_settings")
          .upsert({ user_id: userId }, { onConflict: "user_id" });
        await supabaseAdmin
          .from("user_settings")
          .upsert({ user_id: userId, language: "id", currency: "IDR" }, { onConflict: "user_id" });

        return new Response(JSON.stringify({ ok: true, userId, created, reassigned }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
