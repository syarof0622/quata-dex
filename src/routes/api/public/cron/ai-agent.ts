// AI Trade Agent cron worker. Runs one full autonomous decision cycle per active
// agent. This is the SERVER-SIDE automation entry-point — the UI "Manual run now"
// button is only a debug shortcut. Real autonomous trading depends on an external
// scheduler (pg_cron, platform cron) hitting this endpoint periodically.
//
// Frequency: every 1 minute is recommended. The handler itself checks IDX market
// session and only executes orders during open sessions; off-hours ticks are
// cheap heartbeats (passive analysis).
//
// Idempotency: runAgentOnce uses 5-minute idem keys and cooldowns, so calling
// this endpoint more frequently than needed is safe.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentOnce } from "@/lib/ai-trade-agent.functions";
import { getIDXMarketSession } from "@/lib/idx-market-session";

type AgentResult = {
  id: string;
  decisionsCreated: number;
  paperBuysExecuted: number;
  blockedDecisions: number;
  topBlockedReasons: string[];
  lastBlockedReason: string | null;
  candidatesScanned: number;
  candidatesSelected: number;
  buyEvaluations: number;
  openPositionsMonitored: number;
  stopLossTriggered: number;
  takeProfitTriggered: number;
  error?: string;
};

async function handler(request: Request) {
  const startedAt = new Date();

  // Optional shared secret. Accept via header or ?secret= query string.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret")
      ?? new URL(request.url).searchParams.get("secret");
    if (provided !== cronSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized", reason: "cron_secret_mismatch" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const session = getIDXMarketSession();

  // Select agents that are active AND have automation enabled.
  const { data: agents, error } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("id, status, trading_enabled, automation_enabled")
    .in("status", ["active_market_open", "active_market_break", "active_market_closed"])
    .eq("trading_enabled", true);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const activeAgents = (agents ?? []).filter((a: any) => a.automation_enabled !== false);
  const results: AgentResult[] = [];
  const errors: string[] = [];

  for (const a of activeAgents) {
    const agentId = a.id as string;
    const runStart = new Date();
    // Mark "running" up-front so UI can show a fresh heartbeat even on long ticks.
    await supabaseAdmin.from("ai_trade_agents").update({
      last_worker_run_at: runStart.toISOString(),
      last_worker_status: "running",
      last_worker_message: `cycle started (session=${session.state})`,
      next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
    }).eq("id", agentId);

    try {
      const r = await runAgentOnce(agentId);
      const decisions = r.decisions ?? [];
      const executedCount = r.executed ?? 0;
      const blocked = decisions.filter((d: any) =>
        d?.decision_status === "blocked" || d?.action === "BLOCKED" || d?.action === "NO_TRADE");
      const reasons = blocked
        .map((d: any) => d?.blocked_reason ?? d?.blockedReason ?? d?.reason ?? d?.action ?? "unknown")
        .filter(Boolean) as string[];
      const reasonCounts = new Map<string, number>();
      for (const r of reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
      const topBlockedReasons = [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      const lastBlockedReason = reasons[0] ?? null;

      const nowIso = new Date().toISOString();
      const patch: any = {
        last_worker_run_at: nowIso,
        last_worker_status: "success",
        last_worker_message: `decisions=${decisions.length} executed=${executedCount} blocked=${blocked.length} session=${session.state}`,
        next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
        worker_error_count: 0,
        last_blocked_reason: lastBlockedReason,
      };
      if (decisions.length > 0) patch.last_auto_decision_at = nowIso;
      if (executedCount > 0) patch.last_auto_execution_at = nowIso;
      await supabaseAdmin.from("ai_trade_agents").update(patch).eq("id", agentId);

      const m = (r as any).metrics ?? {};
      results.push({
        id: agentId,
        decisionsCreated: decisions.length,
        paperBuysExecuted: executedCount,
        blockedDecisions: blocked.length,
        topBlockedReasons,
        lastBlockedReason,
        candidatesScanned: Number(m.candidatesScanned ?? 0),
        candidatesSelected: Number(m.candidatesSelected ?? 0),
        buyEvaluations: Number(m.buyEvaluations ?? 0),
        openPositionsMonitored: Number(m.openPositionsMonitored ?? 0),
        stopLossTriggered: Number(m.stopLossTriggered ?? 0),
        takeProfitTriggered: Number(m.takeProfitTriggered ?? 0),
      });
    } catch (e: any) {
      const msg = e?.message ?? "unknown error";
      errors.push(`${agentId}: ${msg}`);
      await supabaseAdmin.rpc as any; // noop hint for TS
      await supabaseAdmin.from("ai_trade_agents").update({
        last_worker_run_at: new Date().toISOString(),
        last_worker_status: "error",
        last_worker_message: msg.slice(0, 500),
        next_expected_worker_run_at: new Date(Date.now() + 60_000).toISOString(),
      }).eq("id", agentId);
      // Best-effort increment
      const { data: row } = await supabaseAdmin
        .from("ai_trade_agents").select("worker_error_count").eq("id", agentId).maybeSingle();
      await supabaseAdmin.from("ai_trade_agents")
        .update({ worker_error_count: Number((row as any)?.worker_error_count ?? 0) + 1 })
        .eq("id", agentId);
      results.push({
        id: agentId, decisionsCreated: 0, paperBuysExecuted: 0,
        blockedDecisions: 0, topBlockedReasons: [], lastBlockedReason: null, error: msg,
      });
    }
  }

  const finishedAt = new Date();
  const totals = results.reduce((acc, r) => ({
    decisionsCreated: acc.decisionsCreated + r.decisionsCreated,
    paperBuysExecuted: acc.paperBuysExecuted + r.paperBuysExecuted,
    blockedDecisions: acc.blockedDecisions + r.blockedDecisions,
  }), { decisionsCreated: 0, paperBuysExecuted: 0, blockedDecisions: 0 });

  return Response.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    marketSession: session.state,
    marketOpen: session.isOpen,
    agentsChecked: agents?.length ?? 0,
    agentsActive: activeAgents.length,
    ...totals,
    results,
    errors,
  });
}

export const Route = createFileRoute("/api/public/cron/ai-agent")({
  server: {
    handlers: {
      GET: async ({ request }) => handler(request),
      POST: async ({ request }) => handler(request),
    },
  },
});
