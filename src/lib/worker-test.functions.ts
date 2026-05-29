// Test triggers for cron-protected workers. The CRON_SECRET check stays
// server-side, but manual tests call the same worker runners directly instead
// of doing a same-origin fetch from the worker runtime.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runNewsIngest } from "./news-pipeline-runner.server";
import { runFundamentalBackfill } from "./fundamental-backfill.server";
import { runNewsDisclosureLinker } from "./news-disclosure-linker.server";
import { runAgentOnce } from "./ai-trade-agent.functions";
import { getIDXMarketSession } from "./idx-market-session";
import { getQuote, getCandles } from "./market.functions";
import { ema, rsi, type Candle } from "./indicators";

export type WorkerKey =
  | "news-ingest"
  | "disclosure-ingest"
  | "fundamentals"
  | "ai-agent"
  | "alerts"
  | "news-disclosure-link"
  | "orders";

const InputSchema = z.object({
  worker: z.enum([
    "news-ingest",
    "disclosure-ingest",
    "fundamentals",
    "ai-agent",
    "alerts",
    "news-disclosure-link",
    "orders",
  ]),
});

type WorkerRunOutput = {
  ok: boolean;
  status: number;
  message: string;
  payload: any;
};

async function runDisclosureIngest(): Promise<WorkerRunOutput> {
  const startedAt = Date.now();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [d7, c7, r7, hi] = await Promise.all([
    supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d),
    supabaseAdmin.from("corporate_actions").select("id", { count: "exact", head: true }).gte("announcement_date", since7d.slice(0, 10)),
    supabaseAdmin.from("regulatory_events").select("id", { count: "exact", head: true }).gte("published_at", since7d),
    supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d).eq("sentiment", "negative").gte("impact_score", 70),
  ]);
  const payload = {
    ok: true,
    status: ((d7.count ?? 0) + (c7.count ?? 0) + (r7.count ?? 0)) > 0 ? "success" : "success_no_events",
    counts: {
      official_count: d7.count ?? 0,
      corporate_action_count: c7.count ?? 0,
      regulatory_event_count: r7.count ?? 0,
      high_impact_count: hi.count ?? 0,
    },
  };
  await supabaseAdmin.from("disclosure_pipeline_runs").insert({
    status: "success",
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    fetched_count: 0,
    inserted_count: 0,
    duplicate_count: 0,
    official_count: payload.counts.official_count,
    corporate_action_count: payload.counts.corporate_action_count,
    regulatory_event_count: payload.counts.regulatory_event_count,
    high_impact_count: payload.counts.high_impact_count,
    source_results: [],
    trigger_source: "manual",
  });
  return { ok: true, status: 200, message: "Disclosure worker completed.", payload };
}

async function runAiAgentWorker(): Promise<WorkerRunOutput> {
  const startedAt = new Date();
  const session = getIDXMarketSession();
  const { data: agents, error } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("id, status, trading_enabled, automation_enabled")
    .in("status", ["active_market_open", "active_market_break", "active_market_closed"])
    .eq("trading_enabled", true);
  if (error) throw new Error(error.message);

  const activeAgents = (agents ?? []).filter((a: any) => a.automation_enabled !== false);
  const results: any[] = [];
  const errors: string[] = [];
  for (const a of activeAgents) {
    const agentId = String((a as any).id);
    await supabaseAdmin.from("ai_trade_agents").update({
      last_worker_run_at: new Date().toISOString(),
      last_worker_status: "running",
      last_worker_message: `manual cycle started (session=${session.state})`,
      next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
    }).eq("id", agentId);
    try {
      const r = await runAgentOnce(agentId);
      const decisions = r.decisions ?? [];
      const executed = r.executed ?? 0;
      const nowIso = new Date().toISOString();
      const patch: any = {
        last_worker_run_at: nowIso,
        last_worker_status: "success",
        last_worker_message: !session.isOpen
          ? `Worker active — market ${session.isBreak ? "break" : "closed"}, no new paper order.`
          : `Worker active — decisions=${decisions.length} executed=${executed}.`,
        next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
        worker_error_count: 0,
      };
      if (decisions.length > 0) patch.last_auto_decision_at = nowIso;
      if (executed > 0) patch.last_auto_execution_at = nowIso;
      await supabaseAdmin.from("ai_trade_agents").update(patch).eq("id", agentId);
      results.push({ id: agentId, decisionsCreated: decisions.length, paperBuysExecuted: executed, metrics: r.metrics ?? {} });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      errors.push(`${agentId}: ${msg}`);
      await supabaseAdmin.from("ai_trade_agents").update({
        last_worker_run_at: new Date().toISOString(),
        last_worker_status: "error",
        last_worker_message: msg.slice(0, 500),
        next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
      }).eq("id", agentId);
      results.push({ id: agentId, error: msg });
    }
  }

  const payload = {
    ok: errors.length === 0,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    session: session.state,
    agentsChecked: agents?.length ?? 0,
    agentsActive: activeAgents.length,
    results,
    errors,
  };
  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? 200 : 500,
    message: errors.length ? `AI worker completed with ${errors.length} error(s).` : "AI worker completed.",
    payload,
  };
}

async function runAlertsEngine(): Promise<WorkerRunOutput> {
  const { data: alerts, error } = await supabaseAdmin
    .from("alerts")
    .select("*")
    .eq("active", true)
    .is("triggered_at", null)
    .limit(500);
  if (error) throw new Error(error.message);

  const triggered: { id: string; symbol: string; reason: string }[] = [];
  for (const a of alerts ?? []) {
    try {
      const rule: any = (a as any).rule_json;
      if (!rule) continue;
      if (rule.kind === "price_above" || rule.kind === "price_below") {
        const q = await getQuote({ data: { symbol: (a as any).symbol } });
        if (!q?.price) continue;
        if (rule.kind === "price_above" && q.price > rule.value) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `Price ${q.price} > ${rule.value}` });
        if (rule.kind === "price_below" && q.price < rule.value) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `Price ${q.price} < ${rule.value}` });
      } else {
        const candles = (await getCandles({ data: { symbol: (a as any).symbol, timeframe: "1d" } })) as Candle[];
        if (candles.length < 30) continue;
        const closes = candles.map((c) => c.close);
        if (rule.kind === "rsi_above" || rule.kind === "rsi_below") {
          const last = rsi(closes, 14).at(-1);
          if (last == null || !Number.isFinite(last)) continue;
          if (rule.kind === "rsi_above" && last > rule.value) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `RSI ${last.toFixed(1)} > ${rule.value}` });
          if (rule.kind === "rsi_below" && last < rule.value) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `RSI ${last.toFixed(1)} < ${rule.value}` });
        } else if (rule.kind === "ema_cross") {
          const f = ema(closes, rule.fast), s = ema(closes, rule.slow);
          const i = closes.length - 1;
          if (f[i] > s[i] && f[i - 1] <= s[i - 1]) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `EMA${rule.fast} crossed above EMA${rule.slow}` });
          if (f[i] < s[i] && f[i - 1] >= s[i - 1]) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `EMA${rule.fast} crossed below EMA${rule.slow}` });
        } else if (rule.kind === "volume_spike") {
          const vols = candles.slice(-21, -1).map((c) => c.volume);
          const avg = vols.reduce((sum, v) => sum + v, 0) / Math.max(1, vols.length);
          const last = candles.at(-1)?.volume ?? 0;
          if (avg > 0 && last > avg * rule.multiplier) triggered.push({ id: (a as any).id, symbol: (a as any).symbol, reason: `Volume ${(last / avg).toFixed(1)}x avg` });
        }
      }
    } catch { /* tolerate per-alert errors */ }
  }

  if (triggered.length) {
    await supabaseAdmin.from("alerts").update({ triggered_at: new Date().toISOString() }).in("id", triggered.map((t) => t.id));
  }
  const payload = { scanned: alerts?.length ?? 0, triggered: triggered.length, items: triggered };
  return { ok: true, status: 200, message: "Alerts engine completed.", payload };
}

async function runOrdersQueue(): Promise<WorkerRunOutput> {
  const { data: pending, error } = await supabaseAdmin.from("paper_orders").select("*").eq("status", "pending").limit(500);
  if (error) throw new Error(error.message);
  const symbols = Array.from(new Set((pending ?? []).map((o: any) => String(o.symbol))));
  const quotes: Record<string, number> = {};
  for (const symbol of symbols) {
    const q = await getQuote({ data: { symbol } }).catch(() => null);
    if (q?.price) quotes[symbol] = q.price;
  }

  let filled = 0;
  for (const o of pending ?? []) {
    const px = quotes[(o as any).symbol];
    if (!px) continue;
    let trigger = false;
    let executePrice = px;
    if ((o as any).type === "limit") {
      if ((o as any).side === "buy" && px <= Number((o as any).limit_price)) { trigger = true; executePrice = Number((o as any).limit_price); }
      if ((o as any).side === "sell" && px >= Number((o as any).limit_price)) { trigger = true; executePrice = Number((o as any).limit_price); }
    } else if ((o as any).type === "stop") {
      if ((o as any).side === "buy" && px >= Number((o as any).stop_price)) { trigger = true; executePrice = px; }
      if ((o as any).side === "sell" && px <= Number((o as any).stop_price)) { trigger = true; executePrice = px; }
    } else if ((o as any).type === "stop_limit") {
      if ((o as any).side === "buy" && px >= Number((o as any).stop_price) && px <= Number((o as any).limit_price)) { trigger = true; executePrice = Number((o as any).limit_price); }
      if ((o as any).side === "sell" && px <= Number((o as any).stop_price) && px >= Number((o as any).limit_price)) { trigger = true; executePrice = Number((o as any).limit_price); }
    } else if ((o as any).type === "trailing_stop" && (o as any).side === "sell") {
      const pct = Number((o as any).trailing_pct) / 100;
      const anchor = Number((o as any).trail_anchor);
      const newAnchor = Math.max(anchor, px);
      if (newAnchor > anchor) await supabaseAdmin.from("paper_orders").update({ trail_anchor: newAnchor }).eq("id", (o as any).id);
      if (px <= newAnchor * (1 - pct)) { trigger = true; executePrice = px; }
    }
    if (!trigger) continue;

    const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("id", (o as any).account_id).single();
    if (!account) continue;
    const slip = 0.0005 * ((o as any).side === "buy" ? 1 : -1);
    const fillPrice = executePrice * (1 + slip);
    const qty = Number((o as any).qty);
    const notional = fillPrice * qty;
    const fee = notional * 0.001;
    const { data: existing } = await supabaseAdmin.from("paper_positions").select("*").eq("account_id", (account as any).id).eq("symbol", (o as any).symbol).maybeSingle();
    let realizedPnl = 0;
    if ((o as any).side === "buy") {
      if (Number((account as any).cash) < notional + fee) {
        await supabaseAdmin.from("paper_orders").update({ status: "rejected" }).eq("id", (o as any).id);
        continue;
      }
      const newQty = Number((existing as any)?.qty ?? 0) + qty;
      const newAvg = existing ? (Number((existing as any).avg_price) * Number((existing as any).qty) + fillPrice * qty) / newQty : fillPrice;
      if (existing) await supabaseAdmin.from("paper_positions").update({ qty: newQty, avg_price: newAvg }).eq("id", (existing as any).id);
      else await supabaseAdmin.from("paper_positions").insert({ account_id: (account as any).id, user_id: (o as any).user_id, symbol: (o as any).symbol, qty, avg_price: fillPrice });
      await supabaseAdmin.from("paper_accounts").update({ cash: Number((account as any).cash) - notional - fee }).eq("id", (account as any).id);
    } else {
      if (!existing || Number((existing as any).qty) < qty) {
        await supabaseAdmin.from("paper_orders").update({ status: "rejected" }).eq("id", (o as any).id);
        continue;
      }
      realizedPnl = (fillPrice - Number((existing as any).avg_price)) * qty - fee;
      const newQty = Number((existing as any).qty) - qty;
      if (newQty === 0) await supabaseAdmin.from("paper_positions").delete().eq("id", (existing as any).id);
      else await supabaseAdmin.from("paper_positions").update({ qty: newQty }).eq("id", (existing as any).id);
      await supabaseAdmin.from("paper_accounts").update({ cash: Number((account as any).cash) + notional - fee }).eq("id", (account as any).id);
    }
    await supabaseAdmin.from("paper_orders").update({ status: "filled", filled_price: fillPrice, filled_at: new Date().toISOString(), realized_pnl: realizedPnl }).eq("id", (o as any).id);
    filled++;
  }
  const payload = { scanned: pending?.length ?? 0, filled };
  return { ok: true, status: 200, message: "Orders queue completed.", payload };
}

async function runWorkerDirect(worker: WorkerKey): Promise<WorkerRunOutput> {
  if (worker === "news-ingest") {
    const payload = await runNewsIngest({ trigger: "manual" });
    return { ok: payload.status !== "failed", status: payload.status === "failed" ? 500 : 200, message: "News ingest completed.", payload };
  }
  if (worker === "disclosure-ingest") return runDisclosureIngest();
  if (worker === "fundamentals") {
    const payload = await runFundamentalBackfill({ limit: 25 });
    return { ok: payload.errors.length === 0, status: payload.errors.length ? 500 : 200, message: "Fundamentals backfill completed.", payload };
  }
  if (worker === "ai-agent") return runAiAgentWorker();
  if (worker === "alerts") return runAlertsEngine();
  if (worker === "news-disclosure-link") {
    const payload = await runNewsDisclosureLinker({ hours: 48 });
    return { ok: payload.errors.length === 0, status: payload.errors.length ? 500 : 200, message: "News ↔ Disclosure linker completed.", payload };
  }
  return runOrdersQueue();
}

export const triggerWorker = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const ranAt = new Date().toISOString();
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return {
        ok: false,
        worker: data.worker,
        status: 503,
        error: "cron_secret_not_configured",
        message:
          "CRON_SECRET is not set. Add it in project secrets before testing workers.",
        ranAt,
        payload: null as any,
      };
    }

    const startedAt = Date.now();
    try {
      const result = await runWorkerDirect(data.worker);
      const durationMs = Date.now() - startedAt;
      if (!result.ok) {
        return {
          ok: false,
          worker: data.worker,
          status: result.status,
          error: result.payload?.error ?? "worker_failed",
          message: result.message,
          ranAt,
          durationMs,
          payload: result.payload,
        };
      }
      return {
        ok: true,
        worker: data.worker,
        status: result.status,
        message: result.message,
        ranAt,
        durationMs,
        payload: result.payload,
      };
    } catch (e: any) {
      return {
        ok: false,
        worker: data.worker,
        status: 0,
        error: "network_error",
        message: `Worker unreachable: ${e?.message ?? "network error"}`,
        ranAt,
        durationMs: Date.now() - startedAt,
        payload: null as any,
      };
    }
  });
