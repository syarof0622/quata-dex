// System Health aggregator — pulls worker, data freshness, source, audit,
// and consistency signals into a single payload for the Health Dashboard.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type HealthStatus = "healthy" | "partial" | "degraded" | "failed" | "unknown";

export type HealthCard = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  lastUpdatedAt: string | null;
  metrics?: Record<string, string | number | null>;
};

export type AuditRow = {
  id: string;
  module: string;
  action: string;
  status: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type SystemHealthPayload = {
  generatedAt: string;
  cards: HealthCard[];
  consistency: { ok: boolean; warnings: string[] };
  audit: AuditRow[];
};

function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

function freshnessStatus(mins: number | null, healthyMax: number, partialMax: number): HealthStatus {
  if (mins == null) return "unknown";
  if (mins <= healthyMax) return "healthy";
  if (mins <= partialMax) return "partial";
  return "degraded";
}

export const getSystemHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemHealthPayload> => {
    const cards: HealthCard[] = [];
    const warnings: string[] = [];

    // 1) AI Worker
    const { data: agent } = await supabaseAdmin
      .from("ai_trade_agents")
      .select(
        "id, status, automation_enabled, last_worker_run_at, last_worker_status, last_worker_message, worker_error_count, next_expected_worker_run_at, last_error",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const workerMins = minutesAgo(agent?.last_worker_run_at ?? null);
    const workerStatus: HealthStatus = !agent
      ? "unknown"
      : (agent.worker_error_count ?? 0) >= 5
      ? "failed"
      : agent.last_worker_status === "error"
      ? "degraded"
      : workerMins != null && workerMins > 30
      ? "partial"
      : workerMins != null
      ? "healthy"
      : "unknown";
    cards.push({
      key: "ai_worker",
      label: "AI Worker",
      status: workerStatus,
      detail:
        workerMins == null
          ? "Belum ada catatan run."
          : `Run terakhir ${workerMins} menit lalu — ${agent?.last_worker_status ?? "unknown"}.`,
      lastUpdatedAt: agent?.last_worker_run_at ?? null,
      metrics: {
        errorCount: agent?.worker_error_count ?? 0,
        automationEnabled: agent?.automation_enabled ? "yes" : "no",
        lastMessage: agent?.last_worker_message ?? null,
      },
    });

    // 2) News Pipeline (latest article fetch)
    const { data: news } = await supabaseAdmin
      .from("news_articles")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newsMins = minutesAgo(news?.fetched_at ?? null);
    cards.push({
      key: "news_pipeline",
      label: "News Pipeline",
      status: freshnessStatus(newsMins, 30, 120),
      detail: newsMins == null ? "Belum ada berita." : `Artikel terakhir ${newsMins} menit lalu.`,
      lastUpdatedAt: news?.fetched_at ?? null,
    });

    // 3) Market Data (data_quality_snapshots most recent)
    const { data: dq } = await supabaseAdmin
      .from("data_quality_snapshots")
      .select("created_at, overall_data_quality_score, price_quality")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dqMins = minutesAgo(dq?.created_at ?? null);
    const dqStatus: HealthStatus = !dq
      ? "unknown"
      : (dq.overall_data_quality_score ?? 0) >= 70
      ? "healthy"
      : (dq.overall_data_quality_score ?? 0) >= 40
      ? "partial"
      : "degraded";
    cards.push({
      key: "market_data",
      label: "Market Data",
      status: dqStatus,
      detail: !dq
        ? "Belum ada snapshot kualitas data."
        : `Skor kualitas ${Math.round(dq.overall_data_quality_score ?? 0)} (price: ${dq.price_quality ?? "?"}). ${dqMins ?? "?"} menit lalu.`,
      lastUpdatedAt: dq?.created_at ?? null,
    });

    // 4) Source Health
    const { data: sources } = await supabaseAdmin
      .from("news_sources")
      .select("id, status, fail_count, enabled, last_success_at, last_failed_at");
    const enabled = (sources ?? []).filter((s: any) => s.enabled);
    const failing = enabled.filter((s: any) => s.status === "error" || (s.fail_count ?? 0) >= 3);
    const srcStatus: HealthStatus = enabled.length === 0
      ? "unknown"
      : failing.length === 0
      ? "healthy"
      : failing.length / enabled.length < 0.4
      ? "partial"
      : "degraded";
    cards.push({
      key: "source_health",
      label: "Source Health",
      status: srcStatus,
      detail: enabled.length === 0
        ? "Tidak ada source aktif."
        : `${failing.length}/${enabled.length} source bermasalah.`,
      lastUpdatedAt: null,
      metrics: { enabled: enabled.length, failing: failing.length },
    });

    // 5) Portfolio Sync (latest equity snapshot vs computed equity)
    const { data: acc } = await supabaseAdmin
      .from("paper_accounts")
      .select("id, cash, equity")
      .limit(1)
      .maybeSingle();
    const { data: snap } = await supabaseAdmin
      .from("portfolio_equity_snapshots")
      .select("created_at, equity, cash, holdings_value")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const snapMins = minutesAgo(snap?.created_at ?? null);
    let portfolioStatus: HealthStatus = "unknown";
    if (snap && acc) {
      const computed = Number(snap.cash ?? 0) + Number(snap.holdings_value ?? 0);
      const drift = Math.abs(computed - Number(snap.equity ?? 0));
      if (drift > 1) {
        warnings.push(`Equity snapshot drift Rp ${Math.round(drift).toLocaleString("id-ID")} (cash+holdings ≠ equity).`);
      }
      portfolioStatus = snapMins != null && snapMins > 60 ? "partial" : "healthy";
    }
    cards.push({
      key: "portfolio_sync",
      label: "Portfolio Sync",
      status: portfolioStatus,
      detail: snap
        ? `Snapshot terakhir ${snapMins} menit lalu.`
        : "Belum ada snapshot ekuitas.",
      lastUpdatedAt: snap?.created_at ?? null,
    });

    // 6) AI App Context proxy (most recent decision = context was built)
    const { data: lastDec } = await supabaseAdmin
      .from("ai_agent_decisions")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const decMins = minutesAgo(lastDec?.created_at ?? null);
    cards.push({
      key: "ai_app_context",
      label: "AI App Context",
      status: freshnessStatus(decMins, 60, 240),
      detail: lastDec ? `Keputusan AI terakhir ${decMins} menit lalu.` : "Belum ada keputusan AI.",
      lastUpdatedAt: lastDec?.created_at ?? null,
    });

    // 7) Cron Status — read audit logs
    const { data: cronAudit } = await supabaseAdmin
      .from("system_audit_logs")
      .select("created_at, status, message")
      .eq("module", "cron")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cronMins = minutesAgo(cronAudit?.created_at ?? null);
    cards.push({
      key: "cron",
      label: "Cron Status",
      status: cronAudit
        ? cronAudit.status === "error"
          ? "degraded"
          : freshnessStatus(cronMins, 15, 60)
        : "unknown",
      detail: cronAudit
        ? `Run ${cronMins} menit lalu — ${cronAudit.status}.`
        : "Belum ada log cron (set CRON_SECRET & jadwal cron).",
      lastUpdatedAt: cronAudit?.created_at ?? null,
    });

    // 8) Database Consistency (basic checks)
    const { data: positions } = await supabaseAdmin
      .from("paper_positions")
      .select("id, qty, avg_price");
    let invalidPos = 0;
    for (const p of (positions ?? []) as any[]) {
      if (!Number.isFinite(Number(p.qty)) || !Number.isFinite(Number(p.avg_price))) invalidPos++;
      if (Number(p.qty) <= 0) invalidPos++;
    }
    if (invalidPos > 0) warnings.push(`${invalidPos} posisi paper tidak valid (qty/avg_price NaN atau ≤0).`);

    const { data: orphanOrders } = await supabaseAdmin
      .from("paper_orders")
      .select("id, price, qty, status")
      .eq("status", "filled");
    let invalidOrders = 0;
    for (const o of (orphanOrders ?? []) as any[]) {
      const px = Number(o.price);
      const qty = Number(o.qty);
      if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) invalidOrders++;
    }
    if (invalidOrders > 0) warnings.push(`${invalidOrders} order filled dengan price/qty tidak valid.`);

    cards.push({
      key: "db_consistency",
      label: "Database Consistency",
      status: warnings.length === 0 ? "healthy" : warnings.length <= 2 ? "partial" : "degraded",
      detail: warnings.length === 0 ? "Tidak ada drift terdeteksi." : `${warnings.length} peringatan.`,
      lastUpdatedAt: new Date().toISOString(),
    });

    // 9) Last Error from audit log
    const { data: lastError } = await supabaseAdmin
      .from("system_audit_logs")
      .select("created_at, module, action, message")
      .in("status", ["error", "warning"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cards.push({
      key: "last_error",
      label: "Last Error",
      status: lastError
        ? minutesAgo(lastError.created_at)! < 60
          ? "degraded"
          : "partial"
        : "healthy",
      detail: lastError
        ? `[${lastError.module}/${lastError.action}] ${lastError.message ?? "(no message)"}`
        : "Tidak ada error tercatat.",
      lastUpdatedAt: lastError?.created_at ?? null,
    });

    // Recent audit feed
    const { data: auditFeed } = await supabaseAdmin
      .from("system_audit_logs")
      .select("id, module, action, status, message, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    return {
      generatedAt: new Date().toISOString(),
      cards,
      consistency: { ok: warnings.length === 0, warnings },
      audit: (auditFeed ?? []) as AuditRow[],
    };
  },
);

export type DecisionReplayRow = {
  id: string;
  symbol: string;
  action: string;
  confidence: number | null;
  decision_status: string | null;
  reasoning: string | null;
  created_at: string;
  data_snapshot: Record<string, unknown> | null;
  technical_snapshot: Record<string, unknown> | null;
  sentiment_snapshot: Record<string, unknown> | null;
  portfolio_snapshot: Record<string, unknown> | null;
  risk_snapshot: Record<string, unknown> | null;
  strategy_context: Record<string, unknown> | null;
  decision_replay_snapshot: Record<string, unknown> | null;
};

export const getDecisionReplays = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecisionReplayRow[]> => {
    const { data } = await supabaseAdmin
      .from("ai_agent_decisions")
      .select(
        "id, symbol, action, confidence, decision_status, reasoning, created_at, data_snapshot, technical_snapshot, sentiment_snapshot, portfolio_snapshot, risk_snapshot, strategy_context, decision_replay_snapshot",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as DecisionReplayRow[];
  },
);
