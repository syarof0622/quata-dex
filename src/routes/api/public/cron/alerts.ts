import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getQuote, getCandles } from "@/lib/market.functions";
import { rsi, ema, type Candle } from "@/lib/indicators";

// Public cron endpoint. Iterates ALL active alerts across users and triggers
// any that match. Designed to be hit by an external scheduler every 1-5 min.
// Lives under /api/public/* — no auth header required.

export const Route = createFileRoute("/api/public/cron/alerts")({
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

        const { data: alerts, error } = await admin.from("alerts").select("*").eq("active", true).is("triggered_at", null).limit(500);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        const triggered: { id: string; symbol: string; reason: string; user_id: string }[] = [];
        for (const a of alerts ?? []) {
          try {
            const rule: any = a.rule_json;
            if (rule.kind === "price_above" || rule.kind === "price_below") {
              const q = await getQuote({ data: { symbol: a.symbol } });
              if (!q?.price) continue;
              if (rule.kind === "price_above" && q.price > rule.value) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `Price ${q.price} > ${rule.value}` });
              if (rule.kind === "price_below" && q.price < rule.value) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `Price ${q.price} < ${rule.value}` });
            } else {
              const candles = (await getCandles({ data: { symbol: a.symbol, timeframe: "1d" } })) as Candle[];
              if (candles.length < 30) continue;
              const closes = candles.map(c => c.close);
              if (rule.kind === "rsi_above" || rule.kind === "rsi_below") {
                const r = rsi(closes, 14); const last = r[r.length - 1];
                if (rule.kind === "rsi_above" && last > rule.value) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `RSI ${last.toFixed(1)} > ${rule.value}` });
                if (rule.kind === "rsi_below" && last < rule.value) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `RSI ${last.toFixed(1)} < ${rule.value}` });
              } else if (rule.kind === "ema_cross") {
                const f = ema(closes, rule.fast), s = ema(closes, rule.slow);
                const i = closes.length - 1;
                if (f[i] > s[i] && f[i - 1] <= s[i - 1]) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `EMA${rule.fast} crossed above EMA${rule.slow}` });
                if (f[i] < s[i] && f[i - 1] >= s[i - 1]) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `EMA${rule.fast} crossed below EMA${rule.slow}` });
              } else if (rule.kind === "volume_spike") {
                const vols = candles.slice(-21, -1).map(c => c.volume);
                const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
                const last = candles[candles.length - 1].volume;
                if (last > avg * rule.multiplier) triggered.push({ id: a.id, symbol: a.symbol, user_id: a.user_id, reason: `Volume ${(last / avg).toFixed(1)}x avg` });
              }
            }
          } catch (e) { console.error("cron alert err", a.id, e); }
        }

        if (triggered.length) {
          await admin.from("alerts").update({ triggered_at: new Date().toISOString() })
            .in("id", triggered.map(t => t.id));
        }
        return Response.json({ scanned: alerts?.length ?? 0, triggered: triggered.length, items: triggered });
      },
    },
  },
});
