// System Health aggregator — pulls worker, data freshness, source, audit,
// and consistency signals into a single payload for the Health Dashboard.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { summarizeSourceHealth, overallStatusLabel, type OverallStatus } from "./source-health";
import { formatWIB } from "./idx-market-session";

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
  // JSON columns — typed as any so server fn payloads stay serializable.
  metadata: any;
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
        lastRunWIB: formatWIB(agent?.last_worker_run_at ?? null),
      },
    });

    // 1c) News Pipeline
    const [{ data: newsState }, { data: newsLastRun }, { data: newsSnap }, { data: newsSources }] = await Promise.all([
      supabaseAdmin.from("news_worker_state").select("*").eq("singleton", true).maybeSingle(),
      supabaseAdmin.from("news_pipeline_runs").select("status,started_at,finished_at,fetched_count,inserted_count,successful_sources,failed_sources,quota_protected_sources,fallback_sources,error_message").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("news_sentiment_snapshots").select("freshness,article_count,sentiment_score,created_at").eq("window_key","24h").order("created_at",{ascending:false}).limit(1).maybeSingle(),
      supabaseAdmin.from("news_source_health").select("source_key,status,quota_protected"),
    ]);
    const newsRunMins = minutesAgo((newsState as any)?.last_news_worker_run_at ?? null);
    const allSources = (newsSources ?? []) as any[];
    const activeSources = allSources.filter((s) => s.status === "healthy" || s.status === "fallback").length;
    const failedSourcesCount = allSources.filter((s) => s.status === "failed").length;
    const quotaSourcesCount = allSources.filter((s) => s.quota_protected).length;
    let newsStatus: HealthStatus;
    const lastStatus = (newsState as any)?.news_worker_status;
    if (!newsState || newsRunMins == null) newsStatus = "unknown";
    else if (lastStatus === "unauthorized") newsStatus = "failed";
    else if (newsRunMins > 60) newsStatus = "partial";
    else if (lastStatus === "failed") newsStatus = "failed";
    else if (lastStatus === "partial" || lastStatus === "no_new_articles") newsStatus = "partial";
    else newsStatus = "healthy";
    cards.push({
      key: "news_pipeline",
      label: "News Pipeline",
      status: newsStatus,
      detail:
        newsRunMins == null
          ? "News worker belum pernah dijalankan. Konfigurasikan scheduler untuk memanggil /api/public/cron/news-ingest setiap 5–15 menit dengan header x-cron-secret."
          : `Run terakhir ${newsRunMins} menit lalu — status ${lastStatus ?? "unknown"}. ${activeSources}/${allSources.length} sumber aktif${quotaSourcesCount ? `, ${quotaSourcesCount} quota-protected` : ""}${failedSourcesCount ? `, ${failedSourcesCount} gagal` : ""}.`,
      lastUpdatedAt: (newsState as any)?.last_news_worker_run_at ?? null,
      metrics: {
        lastRunWIB: formatWIB((newsState as any)?.last_news_worker_run_at ?? null),
        lastSuccessfulRunWIB: formatWIB((newsState as any)?.last_successful_news_run_at ?? null),
        nextExpectedWIB: formatWIB((newsState as any)?.next_expected_news_worker_run_at ?? null),
        fetchedLastRun: (newsLastRun as any)?.fetched_count ?? 0,
        insertedLastRun: (newsLastRun as any)?.inserted_count ?? 0,
        activeSources,
        failedSources: failedSourcesCount,
        quotaProtectedSources: quotaSourcesCount,
        aggregateFreshness: (newsSnap as any)?.freshness ?? "unavailable",
        articleCount24h: (newsSnap as any)?.article_count ?? 0,
        sentimentScore24h: (newsSnap as any)?.sentiment_score ?? 0,
        lastError: (newsLastRun as any)?.error_message ?? null,
      },
    });

    // 1b) Next expected worker run / last auto decision / last auto execution
    const nextRunMins = minutesAgo((agent as any)?.next_expected_worker_run_at ?? null);
    cards.push({
      key: "next_worker_run",
      label: "Next Expected Worker Run",
      status: (agent as any)?.next_expected_worker_run_at
        ? (nextRunMins != null && nextRunMins > 0 ? "partial" : "healthy")
        : "unknown",
      detail: (agent as any)?.next_expected_worker_run_at
        ? `Dijadwalkan: ${formatWIB((agent as any).next_expected_worker_run_at)}`
        : "Jadwal next run belum tercatat.",
      lastUpdatedAt: (agent as any)?.next_expected_worker_run_at ?? null,
    });

    const { data: agentTimes } = await supabaseAdmin
      .from("ai_trade_agents")
      .select("last_auto_decision_at, last_auto_execution_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const decMinsAuto = minutesAgo(agentTimes?.last_auto_decision_at ?? null);
    cards.push({
      key: "last_auto_decision",
      label: "Last Auto Decision",
      status: agentTimes?.last_auto_decision_at ? freshnessStatus(decMinsAuto, 60, 240) : "unknown",
      detail: agentTimes?.last_auto_decision_at
        ? `${formatWIB(agentTimes.last_auto_decision_at)} (${decMinsAuto} menit lalu)`
        : "Belum ada keputusan otomatis.",
      lastUpdatedAt: agentTimes?.last_auto_decision_at ?? null,
    });
    const exMinsAuto = minutesAgo(agentTimes?.last_auto_execution_at ?? null);
    cards.push({
      key: "last_auto_execution",
      label: "Last Auto Execution",
      status: agentTimes?.last_auto_execution_at ? freshnessStatus(exMinsAuto, 240, 1440) : "unknown",
      detail: agentTimes?.last_auto_execution_at
        ? `${formatWIB(agentTimes.last_auto_execution_at)} (${exMinsAuto} menit lalu)`
        : "Belum ada eksekusi otomatis.",
      lastUpdatedAt: agentTimes?.last_auto_execution_at ?? null,
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

    // 4) Source Health — normalized via summarizeSourceHealth so the Health
    // Dashboard matches the AI Analyst header (fallback / quota-protected
    // are partial, not failed total).
    const { data: sources } = await supabaseAdmin
      .from("news_sources")
      .select("id, name, status, enabled, fail_count, last_success_at, last_failed_at, last_error");
    const summary = summarizeSourceHealth((sources ?? []) as any);
    const overallMap: Record<OverallStatus, HealthStatus> = {
      active: "healthy",
      partial: "partial",
      degraded: "degraded",
      failed: "failed",
      unknown: "unknown",
    };
    const detailParts: string[] = [];
    if (summary.activeCount) detailParts.push(`${summary.activeCount} active`);
    if (summary.fallbackCount) detailParts.push(`${summary.fallbackCount} fallback`);
    if (summary.quotaProtectedCount) detailParts.push(`${summary.quotaProtectedCount} quota protected`);
    if (summary.degradedCount) detailParts.push(`${summary.degradedCount} degraded`);
    if (summary.failedCount) detailParts.push(`${summary.failedCount} failed`);
    if (summary.disabledCount) detailParts.push(`${summary.disabledCount} disabled`);
    cards.push({
      key: "source_health",
      label: "Source Health",
      status: overallMap[summary.overallStatus],
      detail: summary.sources.length === 0
        ? "Tidak ada data source."
        : `${overallStatusLabel(summary.overallStatus)} · ${detailParts.join(" · ") || "no signal"}`,
      lastUpdatedAt: summary.lastUpdated,
      metrics: {
        active: summary.activeCount,
        fallback: summary.fallbackCount,
        quotaProtected: summary.quotaProtectedCount,
        degraded: summary.degradedCount,
        failed: summary.failedCount,
        disabled: summary.disabledCount,
      },
    });

    // 5) Portfolio Sync — scoped to the active paper account for USER_ID.
    const USER_ID = "00000000-0000-0000-0000-000000000001";
    const { data: acc } = await supabaseAdmin
      .from("paper_accounts")
      .select("id, cash, equity")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: snap } = acc?.id
      ? await supabaseAdmin
          .from("portfolio_equity_snapshots")
          .select("created_at, equity, cash, holdings_value")
          .eq("paper_account_id", acc.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null as any };
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

    // 8) Database Consistency — scoped to active account.
    const positionsQ = acc?.id
      ? supabaseAdmin.from("paper_positions").select("id, qty, avg_price").eq("account_id", acc.id)
      : supabaseAdmin.from("paper_positions").select("id, qty, avg_price").eq("user_id", USER_ID);
    const { data: positions } = await positionsQ;
    let invalidPos = 0;
    for (const p of (positions ?? []) as any[]) {
      if (!Number.isFinite(Number(p.qty)) || !Number.isFinite(Number(p.avg_price))) invalidPos++;
      if (Number(p.qty) <= 0) invalidPos++;
    }
    if (invalidPos > 0) warnings.push(`${invalidPos} posisi paper tidak valid (qty/avg_price NaN atau ≤0).`);

    const ordersQ = acc?.id
      ? supabaseAdmin.from("paper_orders").select("id, price, qty, status").eq("account_id", acc.id).eq("status", "filled")
      : supabaseAdmin.from("paper_orders").select("id, price, qty, status").eq("user_id", USER_ID).eq("status", "filled");
    const { data: orphanOrders } = await ordersQ;
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

    // 10) Disclosure / Corporate Action / Regulatory pipeline (PATCH 19)
    try {
      const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const [d24, d7, c7, r7, hiNeg] = await Promise.all([
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since24),
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d),
        supabaseAdmin.from("corporate_actions").select("id", { count: "exact", head: true }).gte("announcement_date", since7d.slice(0, 10)),
        supabaseAdmin.from("regulatory_events").select("id", { count: "exact", head: true }).gte("published_at", since7d),
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d).eq("sentiment", "negative").gte("impact_score", 70),
      ]);
      const d24Count = d24.count ?? 0;
      const d7Count = d7.count ?? 0;
      const c7Count = c7.count ?? 0;
      const r7Count = r7.count ?? 0;
      const noSources = d7Count + c7Count + r7Count === 0;
      const status: HealthStatus = noSources
        ? "degraded"
        : d24Count > 0 ? "healthy" : "partial";
      cards.push({
        key: "disclosure_pipeline",
        label: "Disclosure / Corporate Action Pipeline",
        status,
        detail: noSources
          ? "Belum ada disclosure / corporate action / regulatory event terdeteksi dalam 7 hari terakhir."
          : `${d24Count} disclosure (24h) · ${d7Count + c7Count + r7Count} event (7d) · ${hiNeg.count ?? 0} high-impact negatif.`,
        lastUpdatedAt: new Date().toISOString(),
        metrics: {
          official_24h: d24Count,
          official_7d: d7Count,
          corporate_actions_7d: c7Count,
          regulatory_events_7d: r7Count,
          high_impact_negative_7d: hiNeg.count ?? 0,
        },
      });
    } catch (e: any) {
      cards.push({
        key: "disclosure_pipeline",
        label: "Disclosure / Corporate Action Pipeline",
        status: "unknown",
        detail: `Tidak bisa membaca disclosure pipeline: ${e?.message ?? String(e)}`,
        lastUpdatedAt: new Date().toISOString(),
      });
    }

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
  data_snapshot: any;
  technical_snapshot: any;
  sentiment_snapshot: any;
  portfolio_snapshot: any;
  risk_snapshot: any;
  strategy_context: any;
  decision_replay_snapshot: any;
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
