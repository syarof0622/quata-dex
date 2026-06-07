// User-scoped paper account management (set balance, reset, new account).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SetBalanceSchema = z.object({
  starting_balance: z.number().positive().max(1e15),
  account_name: z.string().min(1).max(80).optional(),
  currency: z.enum(["IDR", "USD"]).optional(),
});

const ResetSchema = z.object({
  mode: z.enum(["balance_only", "reset_account", "new_account"]),
  starting_balance: z.number().positive().max(1e15).optional(),
  reason: z.string().max(200).optional(),
});

export const getMyPaperAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("paper_accounts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const active = data?.find((a: any) => a.status === "active" && a.is_default) ?? data?.[0] ?? null;
    return { accounts: data ?? [], active };
  });

export const setMyPaperBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetBalanceSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle();
    const oldBalance = existing?.cash ?? 0;
    const oldEquity = existing?.equity ?? 0;
    const payload: any = {
      starting_balance: data.starting_balance,
      cash: data.starting_balance,
      equity: data.starting_balance,
    };
    if (data.account_name) payload.account_name = data.account_name;
    if (data.currency) payload.currency = data.currency;

    if (existing) {
      const { error } = await supabase.from("paper_accounts").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("paper_accounts").insert({
        user_id: userId, ...payload, status: "active", is_default: true,
        account_name: data.account_name ?? "Akun Paper Trading Utama",
        currency: data.currency ?? "IDR",
      } as any);
      if (error) throw new Error(error.message);
    }

    await supabase.from("paper_balance_events").insert({
      user_id: userId,
      paper_account_id: existing?.id ?? null,
      event_type: "balance_set",
      old_balance: oldBalance, new_balance: data.starting_balance,
      old_equity: oldEquity, new_equity: data.starting_balance,
      reason: "Pengguna mengatur saldo paper trading",
      created_by: userId,
    } as any);
    return { ok: true };
  });

export const resetMyPaperAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResetSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const newBalance = data.starting_balance ?? 100_000_000;
    const { data: existing } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle();

    if (data.mode === "balance_only") {
      if (!existing) throw new Error("Akun paper tidak ditemukan");
      const { error } = await supabase.from("paper_accounts").update({
        cash: newBalance, equity: newBalance, starting_balance: newBalance,
        realized_pnl: 0, unrealized_pnl: 0,
      } as any).eq("id", existing.id);
      if (error) throw new Error(error.message);
      await supabase.from("paper_balance_events").insert({
        user_id: userId, paper_account_id: existing.id, event_type: "new_baseline",
        old_balance: existing.cash, new_balance: newBalance,
        old_equity: existing.equity, new_equity: newBalance,
        reason: data.reason ?? "Reset saldo (baseline baru, histori dipertahankan)", created_by: userId,
      } as any);
      return { ok: true };
    }

    if (data.mode === "reset_account") {
      // Archive existing, then create fresh default
      if (existing) {
        await supabase.from("paper_accounts").update({ status: "archived", is_default: false } as any).eq("id", existing.id);
        await supabase.from("paper_balance_events").insert({
          user_id: userId, paper_account_id: existing.id, event_type: "account_archived",
          old_balance: existing.cash, new_balance: existing.cash,
          old_equity: existing.equity, new_equity: existing.equity,
          reason: "Diarsipkan untuk reset akun", created_by: userId,
        } as any);
      }
      // Clear current positions/orders for this user (history preserved in trade_journal/closed_trades if any)
      await supabase.from("paper_positions").delete().eq("user_id", userId);
      await supabase.from("paper_orders").delete().eq("user_id", userId);

      const { data: created, error } = await supabase.from("paper_accounts").insert({
        user_id: userId, starting_balance: newBalance, cash: newBalance, equity: newBalance,
        currency: existing?.currency ?? "IDR",
        account_name: existing?.account_name ?? "Akun Paper Trading Utama",
        status: "active", is_default: true,
      } as any).select("id").single();
      if (error) throw new Error(error.message);

      await supabase.from("paper_balance_events").insert({
        user_id: userId, paper_account_id: created.id, event_type: "balance_reset",
        new_balance: newBalance, new_equity: newBalance,
        reason: data.reason ?? "Akun paper di-reset penuh", created_by: userId,
      } as any);
      return { ok: true };
    }

    // new_account
    if (existing) {
      await supabase.from("paper_accounts").update({ is_default: false } as any).eq("id", existing.id);
    }
    const { data: created, error } = await supabase.from("paper_accounts").insert({
      user_id: userId, starting_balance: newBalance, cash: newBalance, equity: newBalance,
      currency: existing?.currency ?? "IDR",
      account_name: `Akun Paper Trading (${new Date().toISOString().slice(0,10)})`,
      status: "active", is_default: true,
    } as any).select("id").single();
    if (error) throw new Error(error.message);
    await supabase.from("paper_balance_events").insert({
      user_id: userId, paper_account_id: created.id, event_type: "initial_created",
      new_balance: newBalance, new_equity: newBalance,
      reason: data.reason ?? "Akun paper baru dibuat", created_by: userId,
    } as any);
    return { ok: true };
  });

export const getMyBalanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("paper_balance_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    return { events: data ?? [] };
  });
