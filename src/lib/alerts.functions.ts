import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuote, getCandles } from "./market.functions";
import { rsi, ema, type Candle } from "./indicators";
import { compositeSignal } from "@/features/signals/composite-engine";

const USER_ID = "00000000-0000-0000-0000-000000000001";

const RuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("price_above"), value: z.number() }),
  z.object({ kind: z.literal("price_below"), value: z.number() }),
  z.object({ kind: z.literal("rsi_above"), value: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("rsi_below"), value: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("ema_cross"), fast: z.number().int().positive(), slow: z.number().int().positive() }),
  z.object({ kind: z.literal("volume_spike"), multiplier: z.number().positive() }),
  z.object({ kind: z.literal("breakout"), lookback: z.number().int().min(5).max(252) }),
  z.object({ kind: z.literal("breakdown"), lookback: z.number().int().min(5).max(252) }),
  z.object({ kind: z.literal("score_above"), value: z.number().min(-100).max(100) }),
  z.object({ kind: z.literal("score_below"), value: z.number().min(-100).max(100) }),
  // Setup-based: fire when the AI engine considers a trade actionable.
  z.object({ kind: z.literal("setup_long_ready") }),
  z.object({ kind: z.literal("setup_short_ready") }),
  z.object({ kind: z.literal("pullback_to_support"), tolerancePct: z.number().min(0.1).max(10).optional() }),
  z.object({ kind: z.literal("breakout_confirmed") }),
]);
export type AlertRule = z.infer<typeof RuleSchema>;

export const listAlerts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("alerts").select("*")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createAlert = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; rule: AlertRule }) =>
    z.object({ symbol: z.string().min(1).toUpperCase(), rule: RuleSchema }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin.from("alerts").insert({
      user_id: USER_ID, symbol: data.symbol, rule_json: data.rule, active: true,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAlert = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("alerts").delete().eq("id", data.id).eq("user_id", USER_ID);
    return { ok: true };
  });

export const toggleAlert = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const update = data.active
      ? { active: true, triggered_at: null as string | null }
      : { active: false };
    await supabaseAdmin.from("alerts").update(update)
      .eq("id", data.id).eq("user_id", USER_ID);
    return { ok: true };
  });


// Evaluate a rule against fresh market data; return { hit, current, target, reason }
async function evaluateRule(symbol: string, rule: AlertRule) {
  if (rule.kind === "price_above" || rule.kind === "price_below") {
    const q = await getQuote({ data: { symbol } });
    if (!q?.price) return null;
    const hit = rule.kind === "price_above" ? q.price > rule.value : q.price < rule.value;
    return { hit, current: q.price, target: rule.value, unit: "price" as const,
      reason: hit ? `Price ${q.price.toFixed(2)} ${rule.kind === "price_above" ? ">" : "<"} ${rule.value}` : null };
  }
  const candles = (await getCandles({ data: { symbol, timeframe: "1d" } })) as Candle[];
  if (candles.length < 30) return null;
  const closes = candles.map(c => c.close);
  const last = candles.length - 1;

  if (rule.kind === "rsi_above" || rule.kind === "rsi_below") {
    const r = rsi(closes, 14);
    const cur = r[r.length - 1];
    const hit = rule.kind === "rsi_above" ? cur > rule.value : cur < rule.value;
    return { hit, current: +cur.toFixed(1), target: rule.value, unit: "rsi" as const,
      reason: hit ? `RSI ${cur.toFixed(1)} ${rule.kind === "rsi_above" ? ">" : "<"} ${rule.value}` : null };
  }
  if (rule.kind === "ema_cross") {
    const f = ema(closes, rule.fast), s = ema(closes, rule.slow);
    const i = closes.length - 1;
    const up = f[i] > s[i] && f[i - 1] <= s[i - 1];
    const dn = f[i] < s[i] && f[i - 1] >= s[i - 1];
    const hit = up || dn;
    return { hit, current: +(f[i] - s[i]).toFixed(2), target: 0, unit: "ema-spread" as const,
      reason: up ? `EMA${rule.fast} crossed above EMA${rule.slow}` : dn ? `EMA${rule.fast} crossed below EMA${rule.slow}` : null };
  }
  if (rule.kind === "volume_spike") {
    const vols = candles.slice(-21, -1).map(c => c.volume);
    const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
    const cur = candles[last].volume;
    const ratio = cur / Math.max(1, avg);
    const hit = ratio > rule.multiplier;
    return { hit, current: +ratio.toFixed(2), target: rule.multiplier, unit: "vol-mult" as const,
      reason: hit ? `Volume ${ratio.toFixed(2)}× avg` : null };
  }
  if (rule.kind === "breakout" || rule.kind === "breakdown") {
    const window = candles.slice(-(rule.lookback + 1), -1); // exclude current bar
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const cur = candles[last].close;
    const hit = rule.kind === "breakout" ? cur > high : cur < low;
    return {
      hit,
      current: +cur.toFixed(2),
      target: +(rule.kind === "breakout" ? high : low).toFixed(2),
      unit: "price" as const,
      reason: hit ? `${rule.kind === "breakout" ? "Breakout above" : "Breakdown below"} ${rule.lookback}-day ${rule.kind === "breakout" ? "high" : "low"} (${(rule.kind === "breakout" ? high : low).toFixed(2)})` : null,
    };
  }
  if (rule.kind === "score_above" || rule.kind === "score_below") {
    const sig = compositeSignal(candles, symbol, "1d");
    const hit = rule.kind === "score_above" ? sig.score > rule.value : sig.score < rule.value;
    return { hit, current: sig.score, target: rule.value, unit: "score" as const,
      reason: hit ? `AI Signal score ${sig.score} ${rule.kind === "score_above" ? ">" : "<"} ${rule.value} (${sig.label})` : null };
  }
  if (rule.kind === "setup_long_ready" || rule.kind === "setup_short_ready") {
    const sig = compositeSignal(candles, symbol, "1d");
    const wantLong = rule.kind === "setup_long_ready";
    const dir = wantLong ? "BUY" : "SELL";
    const hit = sig.label === dir && sig.executionStatus === "Ready to Trade";
    return {
      hit, current: `${sig.label}/${sig.executionStatus}`, target: `${dir}/Ready`, unit: "setup" as const,
      reason: hit ? `${dir} setup is Ready to Trade — score ${sig.score}` : null,
    };
  }
  if (rule.kind === "pullback_to_support") {
    const sig = compositeSignal(candles, symbol, "1d");
    const tol = rule.tolerancePct ?? 1.5;
    const last = candles[candles.length - 1].close;
    // Use 20-day low as a robust support proxy (shared with breakout alert).
    const window = candles.slice(-21, -1);
    const support = window.length ? Math.min(...window.map((c) => c.low)) : null;
    if (support == null) return { hit: false, current: last, target: null, unit: "price" as const, reason: null };
    const distPct = ((last - support) / support) * 100;
    const hit = sig.label === "BUY" && distPct >= 0 && distPct <= tol;
    return {
      hit, current: +last.toFixed(2), target: +support.toFixed(2), unit: "price" as const,
      reason: hit ? `Price within ${tol}% of 20d support ${support.toFixed(2)} with BUY bias` : null,
    };
  }
  if (rule.kind === "breakout_confirmed") {
    const sig = compositeSignal(candles, symbol, "1d");
    const last = candles[candles.length - 1];
    const prev = candles.slice(-21, -1);
    const high20 = Math.max(...prev.map((c) => c.high));
    const avgVol = prev.reduce((a, c) => a + c.volume, 0) / Math.max(1, prev.length);
    const volOk = last.volume > avgVol * 1.3;
    const hit =
      sig.label === "BUY" &&
      sig.executionStatus !== "No Trade" &&
      last.close > high20 &&
      volOk;
    return {
      hit, current: +last.close.toFixed(2), target: +high20.toFixed(2), unit: "price" as const,
      reason: hit ? `Breakout above 20d high ${high20.toFixed(2)} on ${(last.volume / avgVol).toFixed(2)}× avg volume + BUY bias` : null,
    };
  }
  return null;
}

export const evaluateAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { symbol: string; rule: AlertRule }) =>
    z.object({ symbol: z.string().min(1).toUpperCase(), rule: RuleSchema }).parse(d))
  .handler(async ({ data }) => {
    return (await evaluateRule(data.symbol, data.rule)) ?? { hit: false, current: null, target: null, unit: null, reason: null };
  });

export const checkAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: alerts } = await context.supabase.from("alerts")
      .select("*").eq("user_id", context.userId).eq("active", true).is("triggered_at", null);
    if (!alerts?.length) return { triggered: [] };
    const triggered: { id: string; symbol: string; reason: string }[] = [];
    for (const a of alerts) {
      try {
        const result = await evaluateRule(a.symbol, a.rule_json as AlertRule);
        if (result?.hit && result.reason) triggered.push({ id: a.id, symbol: a.symbol, reason: result.reason });
      } catch (e) { console.error("alert check err", a.id, e); }
    }
    if (triggered.length) {
      await context.supabase.from("alerts").update({ triggered_at: new Date().toISOString() })
        .in("id", triggered.map(t => t.id));
    }
    return { triggered };
  });
