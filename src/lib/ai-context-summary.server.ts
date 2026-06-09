// Server-side AI context summary. Uses supabaseAdmin so RLS / client-key
// permission issues never make the AI Analyst header drift from reality.
// Shares the same `computeContextSummary` helper as the client header used
// before, but now feeds it data through the service role.
// (no createServerFn here — the wrapper lives in ai-context-summary.functions.ts)
import { currentUserId } from "@/lib/current-user.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeContextSummary, type AIContextSummary } from "./ai-context-summary";


/**
 * Single source-of-truth resolver for the "currently active" AI Trade Agent.
 *
 * Selection priority:
 *  1. automation_enabled = true
 *  2. status in (active_market_open, active, running)
 *  3. agent_runtime_state in (auto_running, active_market_open)
 *  4. last_worker_run_at most recent
 *  5. last_auto_decision_at most recent
 *  6. updated_at most recent
 */
export async function getActiveAIAgent() {
  const { data: agents } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("*")
    .eq("user_id", currentUserId());
  const list = (agents ?? []) as any[];
  if (!list.length) return null;

  const ACTIVE_STATUS = new Set(["active_market_open", "active", "running"]);
  const ACTIVE_RUNTIME = new Set(["auto_running", "active_market_open"]);

  const score = (a: any) => {
    let s = 0;
    if (a.automation_enabled) s += 4_000_000;
    if (ACTIVE_STATUS.has(a.status)) s += 2_000_000;
    if (ACTIVE_RUNTIME.has(a.agent_runtime_state ?? "")) s += 1_000_000;
    const t = Math.max(
      a.last_worker_run_at ? new Date(a.last_worker_run_at).getTime() : 0,
      a.last_auto_decision_at ? new Date(a.last_auto_decision_at).getTime() : 0,
      a.updated_at ? new Date(a.updated_at).getTime() : 0,
    );
    s += t / 1000;
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

/** Count `ai_agent_decisions` rows in the last `minutes`. Always scoped to a specific agent — returns 0 when no agent is provided to avoid leaking cross-user counts. */
export async function getRecentAgentDecisionCount(agentId: string | null, minutes = 5) {
  if (!agentId) return 0;
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("ai_agent_decisions")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", since);
  return count ?? 0;
}


export type AIContextSummaryWithMeta = AIContextSummary & {
  lastUpdateLabel: string;
  recentAgentDecisionCount: number;
};

export async function getAIContextSummaryServerImpl(): Promise<AIContextSummaryWithMeta> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: account }, agent] = await Promise.all([
      supabaseAdmin
        .from("paper_accounts")
        .select("id")
        .eq("user_id", currentUserId())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getActiveAIAgent(),
    ]);
    const accountId = (account as any)?.id ?? null;

    const positionsQ = accountId
      ? supabaseAdmin.from("paper_positions").select("id").eq("account_id", accountId)
      : Promise.resolve({ data: [] as any[] });
    const ordersQ = accountId
      ? supabaseAdmin
          .from("paper_orders")
          .select("id, status, side, realized_pnl")
          .eq("account_id", accountId)
          .eq("status", "filled")
          .limit(1000)
      : Promise.resolve({ data: [] as any[] });

    const [
      { data: news },
      { data: regime },
      { data: sources },
      { data: positions },
      { data: orders },
      recentDecisionCount,
    ] = await Promise.all([
      supabaseAdmin
        .from("news_articles")
        .select("sentiment, sentiment_score, published_at")
        .gte("published_at", since24h)
        .eq("is_duplicate", false)
        .order("published_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("market_regime_snapshots")
        .select("regime_classification, idx_change_pct, created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("news_sources")
        .select("id, name, status, enabled, last_success_at, last_failed_at, last_error, fail_count"),
      positionsQ as any,
      ordersQ as any,
      getRecentAgentDecisionCount((agent as any)?.id ?? null, 5),
    ]);

    // Merge unified data_sources registry (Batch 1/2) so the header chip
    // counts market/disclosure/fundamental sources too — and honest enums
    // (market_closed/quota_protected/etc.) are not surfaced as failures.
    const { data: unifiedSources } = await supabaseAdmin
      .from("data_sources")
      .select("source_key, source_name, health_status, is_enabled, last_success_at, last_failure_at, last_message");
    const mergedSources = [
      ...((sources ?? []) as any[]),
      ...((unifiedSources ?? []) as any[]).map((r: any) => ({
        id: r.source_key,
        name: r.source_name,
        status: r.health_status,
        enabled: r.is_enabled,
        last_success_at: r.last_success_at,
        last_failed_at: r.last_failure_at,
        last_error: r.last_message,
        fail_count: null,
      })),
    ];

    // Closed trade = filled SELL with realized_pnl. Matches ai-app-context.server.ts.
    const closedTrades = (orders ?? []).filter(
      (o: any) =>
        o.status === "filled" &&
        o.side === "sell" &&
        o.realized_pnl !== null &&
        o.realized_pnl !== undefined,
    ).length;

    const summary = computeContextSummary({
      news: (news ?? []) as any,
      regime: (regime ?? []) as any,
      sources: mergedSources as any,
      agent: (agent ?? null) as any,
      portfolio: { openPositions: positions?.length ?? 0 },
      paperTrading: { openPositions: positions?.length ?? 0, closedTrades },
      recentAgentDecisionCount: recentDecisionCount,
    });

    const now = new Date();
    const lastUpdateLabel =
      now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Jakarta",
      }) + " WIB";

    return {
      ...summary,
      lastUpdateLabel,
      recentAgentDecisionCount: recentDecisionCount,
    };
}
