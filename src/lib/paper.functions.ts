import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getQuote } from "./market.functions";

export const getPaperAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data: account } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).maybeSingle();
    if (!account) {
      const ins = await supabase.from("paper_accounts").insert({ user_id: userId, cash: 100000, equity: 100000 }).select().single();
      account = ins.data!;
    }
    const [{ data: positions }, { data: orders }, { data: pending }] = await Promise.all([
      supabase.from("paper_positions").select("*").eq("account_id", account.id),
      supabase.from("paper_orders").select("*").eq("account_id", account.id).eq("status", "filled").order("filled_at", { ascending: false }).limit(50),
      supabase.from("paper_orders").select("*").eq("account_id", account.id).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    return { account, positions: positions ?? [], orders: orders ?? [], pending: pending ?? [] };
  });

async function executeFill(supabase: any, userId: string, account: any, params: {
  symbol: string; side: "buy" | "sell"; qty: number; price: number; orderRow?: any;
  type?: string; takeProfit?: number | null; stopLoss?: number | null;
}) {
  const { symbol, side, qty, price } = params;
  const slip = 0.0005 * (side === "buy" ? 1 : -1);
  const fillPrice = price * (1 + slip);
  const notional = fillPrice * qty;
  const fee = notional * 0.001;

  if (side === "buy" && Number(account.cash) < notional + fee) throw new Error("Insufficient cash");

  const { data: existing } = await supabase.from("paper_positions").select("*")
    .eq("account_id", account.id).eq("symbol", symbol).maybeSingle();

  if (side === "buy") {
    const newQty = Number(existing?.qty ?? 0) + qty;
    const newAvg = existing
      ? ((Number(existing.avg_price) * Number(existing.qty)) + (fillPrice * qty)) / newQty
      : fillPrice;
    if (existing) {
      await supabase.from("paper_positions").update({ qty: newQty, avg_price: newAvg }).eq("id", existing.id);
    } else {
      await supabase.from("paper_positions").insert({
        account_id: account.id, user_id: userId, symbol, qty, avg_price: fillPrice,
      });
    }
    await supabase.from("paper_accounts").update({ cash: Number(account.cash) - notional - fee }).eq("id", account.id);
  } else {
    if (!existing || Number(existing.qty) < qty) throw new Error("Insufficient position to sell");
    const newQty = Number(existing.qty) - qty;
    if (newQty === 0) await supabase.from("paper_positions").delete().eq("id", existing.id);
    else await supabase.from("paper_positions").update({ qty: newQty }).eq("id", existing.id);
    await supabase.from("paper_accounts").update({ cash: Number(account.cash) + notional - fee }).eq("id", account.id);
  }

  if (params.orderRow) {
    await supabase.from("paper_orders").update({
      status: "filled", filled_price: fillPrice, filled_at: new Date().toISOString(),
    }).eq("id", params.orderRow.id);
  } else {
    await supabase.from("paper_orders").insert({
      account_id: account.id, user_id: userId, symbol, side,
      type: params.type ?? "market", qty, price, filled_price: fillPrice,
      status: "filled", filled_at: new Date().toISOString(),
      take_profit: params.takeProfit ?? null, stop_loss: params.stopLoss ?? null,
    });
  }

  return { fillPrice, fee };
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { symbol: string; side: "buy" | "sell"; qty: number; takeProfit?: number; stopLoss?: number }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().positive().max(1_000_000),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const quote = await getQuote({ data: { symbol: data.symbol } });
    if (!quote?.price) throw new Error("Could not get price for " + data.symbol);
    const { data: account } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).single();
    if (!account) throw new Error("No paper account");
    const r = await executeFill(supabase, userId, account, {
      symbol: data.symbol, side: data.side, qty: data.qty, price: quote.price,
      takeProfit: data.takeProfit, stopLoss: data.stopLoss,
    });
    return { ok: true, ...r };
  });

export const placeAdvancedOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    symbol: string; side: "buy" | "sell"; qty: number;
    type: "limit" | "stop" | "stop_limit" | "trailing_stop";
    limitPrice?: number; stopPrice?: number; trailingPct?: number;
    takeProfit?: number; stopLoss?: number;
  }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().positive().max(1_000_000),
    type: z.enum(["limit", "stop", "stop_limit", "trailing_stop"]),
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    trailingPct: z.number().positive().max(50).optional(),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.type === "limit" && !data.limitPrice) throw new Error("limit price required");
    if ((data.type === "stop" || data.type === "stop_limit") && !data.stopPrice) throw new Error("stop price required");
    if (data.type === "stop_limit" && !data.limitPrice) throw new Error("limit price required");
    if (data.type === "trailing_stop" && !data.trailingPct) throw new Error("trailing % required");
    const { data: account } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).single();
    if (!account) throw new Error("No paper account");
    const quote = await getQuote({ data: { symbol: data.symbol } });
    const trailAnchor = data.type === "trailing_stop" && quote?.price ? quote.price : null;
    const { data: row, error } = await supabase.from("paper_orders").insert({
      account_id: account.id, user_id: userId, symbol: data.symbol, side: data.side,
      type: data.type, qty: data.qty,
      price: quote?.price ?? null,
      limit_price: data.limitPrice ?? null,
      stop_price: data.stopPrice ?? null,
      trailing_pct: data.trailingPct ?? null,
      trail_anchor: trailAnchor,
      take_profit: data.takeProfit ?? null,
      stop_loss: data.stopLoss ?? null,
      status: "pending",
    }).select().single();
    if (error) throw error;
    return row;
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("paper_orders")
      .update({ status: "cancelled" }).eq("id", data.id).eq("user_id", context.userId).eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });

export const resetPaperAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: account } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).single();
    if (!account) return { ok: false };
    await supabase.from("paper_orders").delete().eq("account_id", account.id);
    await supabase.from("paper_positions").delete().eq("account_id", account.id);
    await supabase.from("trade_journal").delete().eq("user_id", userId);
    await supabase.from("paper_accounts").update({ cash: 100000, equity: 100000 }).eq("id", account.id);
    return { ok: true };
  });

// Internal: used by cron worker
export { executeFill };
