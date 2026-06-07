// Supabase-backed paper trading account. Shared across devices via single super-admin user_id.
import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuote, getQuotes } from "./market.functions";

const DEFAULT_CASH = 100_000_000; // 100 juta IDR untuk default starter

async function ensureAccount() {
  const { data, error } = await supabaseAdmin
    .from("paper_accounts").select("*").eq("user_id", currentUserId()).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    // Backfill initial_balance if missing (older accounts created before this column existed).
    if ((data as any).initial_balance == null) {
      const baseline = Number((data as any).equity ?? (data as any).cash ?? DEFAULT_CASH);
      await supabaseAdmin.from("paper_accounts")
        .update({ initial_balance: baseline }).eq("id", (data as any).id);
      (data as any).initial_balance = baseline;
    }
    return data;
  }
  const { data: created, error: e2 } = await supabaseAdmin
    .from("paper_accounts")
    .insert({ user_id: currentUserId(), cash: DEFAULT_CASH, equity: DEFAULT_CASH, initial_balance: DEFAULT_CASH })
    .select("*").single();
  if (e2) throw new Error(e2.message);
  return created;
}


export const getPaperAccount = createServerFn({ method: "GET" }).handler(async () => {
  const account = await ensureAccount();
  const [posRes, filledRes, pendingRes] = await Promise.all([
    supabaseAdmin.from("paper_positions").select("*").eq("user_id", currentUserId()),
    supabaseAdmin.from("paper_orders").select("*").eq("user_id", currentUserId()).eq("status", "filled")
      .order("filled_at", { ascending: false }).limit(100),
    supabaseAdmin.from("paper_orders").select("*").eq("user_id", currentUserId()).eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  const positions = posRes.data ?? [];
  const orders = (filledRes.data ?? []) as any[];
  const pending = pendingRes.data ?? [];
  // Realized P/L is persisted on each filled SELL order.
  const realized = orders.reduce((s, o: any) => s + Number(o.realized_pnl ?? 0), 0);

  // Live P/L via quotes
  const symbols = Array.from(new Set(positions.map((p: any) => p.symbol)));
  let unrealized = 0;
  let positionsWithMark: any[] = positions;
  if (symbols.length > 0) {
    try {
      const quotes = await getQuotes({ data: { symbols } });
      const qMap = new Map(quotes.map(q => [q.symbol, q.price]));
      positionsWithMark = positions.map((p: any) => {
        const mark = qMap.get(p.symbol) ?? p.avg_price;
        const pnl = (mark - Number(p.avg_price)) * Number(p.qty);
        const pnlPct = ((mark / Number(p.avg_price)) - 1) * 100;
        unrealized += pnl;
        return { ...p, mark, pnl, pnlPct };
      });
    } catch { /* ignore quote failures */ }
  }

  const cash = Number(account.cash);
  const positionsValue = positionsWithMark.reduce(
    (s, p) => s + Number(p.mark ?? p.avg_price) * Number(p.qty), 0,
  );
  const equity = cash + positionsValue;

  // (realized computed above from persisted paper_orders.realized_pnl)

  return {
    account: { ...account, cash, equity },
    positions: positionsWithMark,
    orders,
    pending,
    pnl: { unrealized, realized, total: unrealized + realized, positionsValue },
  };
});

const OrderSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().max(1_000_000),
  takeProfit: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => OrderSchema.parse(d))
  .handler(async ({ data }) => {
    const symbol = data.symbol.trim().toUpperCase();
    const quote: any = await getQuote({ data: { symbol } });
    if (!quote?.price) throw new Error("Could not get price for " + symbol);

    const account = await ensureAccount();
    const slip = 0.0005 * (data.side === "buy" ? 1 : -1);
    const fillPrice = quote.price * (1 + slip);
    const notional = fillPrice * data.qty;
    const fee = notional * 0.001;

    // Load existing position
    const { data: existing } = await supabaseAdmin
      .from("paper_positions").select("*")
      .eq("user_id", currentUserId()).eq("symbol", symbol).maybeSingle();

    if (data.side === "buy") {
      if (Number(account.cash) < notional + fee) throw new Error("Insufficient cash");
      if (existing) {
        const newQty = Number(existing.qty) + data.qty;
        const newAvg = (Number(existing.avg_price) * Number(existing.qty) + fillPrice * data.qty) / newQty;
        await supabaseAdmin.from("paper_positions")
          .update({ qty: newQty, avg_price: newAvg })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("paper_positions").insert({
          account_id: account.id, user_id: currentUserId(), symbol,
          qty: data.qty, avg_price: fillPrice,
        });
      }
      await supabaseAdmin.from("paper_accounts")
        .update({ cash: Number(account.cash) - notional - fee })
        .eq("id", account.id);
    } else {
      if (!existing || Number(existing.qty) < data.qty) throw new Error("Insufficient position to sell");
      const remaining = Number(existing.qty) - data.qty;
      if (remaining === 0) {
        await supabaseAdmin.from("paper_positions").delete().eq("id", existing.id);
      } else {
        await supabaseAdmin.from("paper_positions").update({ qty: remaining }).eq("id", existing.id);
      }
      await supabaseAdmin.from("paper_accounts")
        .update({ cash: Number(account.cash) + notional - fee })
        .eq("id", account.id);
    }

    const realizedPnl = data.side === "sell" && existing
      ? (fillPrice - Number(existing.avg_price)) * data.qty - fee
      : 0;

    await supabaseAdmin.from("paper_orders").insert({
      account_id: account.id, user_id: currentUserId(), symbol,
      side: data.side, type: "market", qty: data.qty,
      price: quote.price, filled_price: fillPrice,
      status: "filled", filled_at: new Date().toISOString(),
      take_profit: data.takeProfit ?? null, stop_loss: data.stopLoss ?? null,
      realized_pnl: realizedPnl,
    });

    return { ok: true, fillPrice, fee };
  });

const AdvancedSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().max(1_000_000),
  type: z.enum(["limit", "stop", "stop_limit", "trailing_stop"]),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  trailingPct: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
});

export const placeAdvancedOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdvancedSchema.parse(d))
  .handler(async ({ data }) => {
    const symbol = data.symbol.trim().toUpperCase();
    if (data.type === "limit" && !data.limitPrice) throw new Error("limit price required");
    if ((data.type === "stop" || data.type === "stop_limit") && !data.stopPrice) throw new Error("stop price required");
    if (data.type === "stop_limit" && !data.limitPrice) throw new Error("limit price required");
    if (data.type === "trailing_stop" && !data.trailingPct) throw new Error("trailing % required");

    const account = await ensureAccount();
    const quote: any = await getQuote({ data: { symbol } }).catch(() => null);

    const { data: inserted, error } = await supabaseAdmin.from("paper_orders").insert({
      account_id: account.id, user_id: currentUserId(), symbol,
      side: data.side, type: data.type, qty: data.qty,
      price: quote?.price ?? null,
      limit_price: data.limitPrice ?? null,
      stop_price: data.stopPrice ?? null,
      trailing_pct: data.trailingPct ?? null,
      trail_anchor: data.type === "trailing_stop" ? (quote?.price ?? null) : null,
      take_profit: data.takeProfit ?? null,
      stop_loss: data.stopLoss ?? null,
      status: "pending",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("paper_orders")
      .update({ status: "cancelled" })
      .eq("id", data.id).eq("user_id", currentUserId()).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetPaperAccount = createServerFn({ method: "POST" })
  .inputValidator((d: { cash?: number; currency?: "IDR" | "USD" } | undefined) =>
    z.object({
      cash: z.number().nonnegative().max(1e12).optional(),
      currency: z.enum(["IDR", "USD"]).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const cash = Math.max(0, Number(data?.cash ?? DEFAULT_CASH)) || DEFAULT_CASH;
    const currency = data?.currency ?? "IDR";
    const account = await ensureAccount();
    await Promise.all([
      supabaseAdmin.from("paper_positions").delete().eq("user_id", currentUserId()),
      supabaseAdmin.from("paper_orders").delete().eq("user_id", currentUserId()),
    ]);
    await supabaseAdmin.from("paper_accounts")
      .update({ cash, equity: cash, currency, initial_balance: cash, reset_at: new Date().toISOString() })
      .eq("id", account.id);
    // Clear historical equity snapshots so the new baseline starts from this reset.
    await supabaseAdmin.from("portfolio_equity_snapshots")
      .delete().eq("paper_account_id", account.id);
    return { ok: true, cash, currency };

  });

// Update currency only without resetting balance/positions
export const updatePaperCurrency = createServerFn({ method: "POST" })
  .inputValidator((d: { currency: "IDR" | "USD" }) =>
    z.object({ currency: z.enum(["IDR", "USD"]) }).parse(d))
  .handler(async ({ data }) => {
    const account = await ensureAccount();
    const { error } = await supabaseAdmin.from("paper_accounts")
      .update({ currency: data.currency }).eq("id", account.id);
    if (error) throw new Error(error.message);
    return { ok: true, currency: data.currency };
  });
