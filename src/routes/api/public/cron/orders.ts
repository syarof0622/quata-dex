import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getQuote } from "@/lib/market.functions";

// Evaluates pending paper orders (limit/stop/stop_limit/trailing_stop) and fills them
// when current quote satisfies the trigger. Inline FIFO accounting (no client SDK).

export const Route = createFileRoute("/api/public/cron/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          const provided = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
          if (provided !== cronSecret) return new Response("Unauthorized", { status: 401 });
        }
        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return new Response(JSON.stringify({ error: "missing env" }), { status: 500 });
        const admin = createClient(url, key);

        const { data: pending, error } = await admin.from("paper_orders").select("*")
          .eq("status", "pending").limit(500);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        // Group quotes by symbol
        const symbols = Array.from(new Set((pending ?? []).map((o: any) => o.symbol)));
        const quotes: Record<string, number> = {};
        for (const s of symbols) {
          try {
            const q = await getQuote({ data: { symbol: s } });
            if (q?.price) quotes[s] = q.price;
          } catch { /* */ }
        }

        let filled = 0;
        for (const o of pending ?? []) {
          const px = quotes[o.symbol];
          if (!px) continue;

          let trigger = false;
          let executePrice = px;

          if (o.type === "limit") {
            if (o.side === "buy" && px <= Number(o.limit_price)) { trigger = true; executePrice = Number(o.limit_price); }
            if (o.side === "sell" && px >= Number(o.limit_price)) { trigger = true; executePrice = Number(o.limit_price); }
          } else if (o.type === "stop") {
            if (o.side === "buy" && px >= Number(o.stop_price)) { trigger = true; executePrice = px; }
            if (o.side === "sell" && px <= Number(o.stop_price)) { trigger = true; executePrice = px; }
          } else if (o.type === "stop_limit") {
            if (o.side === "buy" && px >= Number(o.stop_price) && px <= Number(o.limit_price)) { trigger = true; executePrice = Number(o.limit_price); }
            if (o.side === "sell" && px <= Number(o.stop_price) && px >= Number(o.limit_price)) { trigger = true; executePrice = Number(o.limit_price); }
          } else if (o.type === "trailing_stop") {
            const pct = Number(o.trailing_pct) / 100;
            const anchor = Number(o.trail_anchor);
            // Only sells supported for trailing stop on long positions
            if (o.side === "sell") {
              const newAnchor = Math.max(anchor, px);
              if (newAnchor > anchor) {
                await admin.from("paper_orders").update({ trail_anchor: newAnchor }).eq("id", o.id);
              }
              if (px <= newAnchor * (1 - pct)) { trigger = true; executePrice = px; }
            }
          }

          if (!trigger) continue;

          // Inline fill (we don't import server fn here to avoid auth context)
          const { data: account } = await admin.from("paper_accounts").select("*").eq("id", o.account_id).single();
          if (!account) continue;
          const slip = 0.0005 * (o.side === "buy" ? 1 : -1);
          const fillPrice = executePrice * (1 + slip);
          const qty = Number(o.qty);
          const notional = fillPrice * qty;
          const fee = notional * 0.001;
          if (o.side === "buy" && Number(account.cash) < notional + fee) {
            await admin.from("paper_orders").update({ status: "rejected" }).eq("id", o.id);
            continue;
          }
          const { data: existing } = await admin.from("paper_positions").select("*")
            .eq("account_id", account.id).eq("symbol", o.symbol).maybeSingle();
          let realizedPnl = 0;
          if (o.side === "buy") {
            const newQty = Number(existing?.qty ?? 0) + qty;
            const newAvg = existing
              ? (Number(existing.avg_price) * Number(existing.qty) + fillPrice * qty) / newQty
              : fillPrice;
            if (existing) await admin.from("paper_positions").update({ qty: newQty, avg_price: newAvg }).eq("id", existing.id);
            else await admin.from("paper_positions").insert({ account_id: account.id, user_id: o.user_id, symbol: o.symbol, qty, avg_price: fillPrice });
            await admin.from("paper_accounts").update({ cash: Number(account.cash) - notional - fee }).eq("id", account.id);
          } else {
            if (!existing || Number(existing.qty) < qty) {
              await admin.from("paper_orders").update({ status: "rejected" }).eq("id", o.id);
              continue;
            }
            realizedPnl = (fillPrice - Number(existing.avg_price)) * qty - fee;
            const newQty = Number(existing.qty) - qty;
            if (newQty === 0) await admin.from("paper_positions").delete().eq("id", existing.id);
            else await admin.from("paper_positions").update({ qty: newQty }).eq("id", existing.id);
            await admin.from("paper_accounts").update({ cash: Number(account.cash) + notional - fee }).eq("id", account.id);
          }
          await admin.from("paper_orders").update({
            status: "filled", filled_price: fillPrice, filled_at: new Date().toISOString(),
            realized_pnl: realizedPnl,
          }).eq("id", o.id);
          filled++;
        }

        return Response.json({ scanned: pending?.length ?? 0, filled });
      },
    },
  },
});
