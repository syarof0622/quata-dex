// System Health aggregator — pulls worker, data freshness, source, audit,
// and consistency signals into a single payload for the Health Dashboard.
import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { summarizeSourceHealth, overallStatusLabel, type OverallStatus } from "./source-health";
import { formatWIB, getIDXMarketSession } from "./idx-market-session";

export type HealthStatus =
  | "healthy"
  | "partial"
  | "stale"
  | "degraded"
  | "failed"
  | "unauthorized"
  | "not_configured"
  | "not_run_yet"
  | "no_recent_event"
  | "no_new_data"
  | "unknown";

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
    const marketSession = getIDXMarketSession();
    const marketClosed = !marketSession.isOpen;


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
    const cronSecretSet = !!process.env.CRON_SECRET;
    let newsStatus: HealthStatus;
    let newsDetail: string;
    const lastStatus = (newsState as any)?.news_worker_status;
    const nextNewsAt = (newsState as any)?.next_expected_news_worker_run_at as string | null;
    const nextNewsMins = minutesAgo(nextNewsAt);
    if (!newsState || newsRunMins == null) {
      newsStatus = cronSecretSet ? "not_run_yet" : "not_configured";
      newsDetail = cronSecretSet
        ? "News worker belum pernah menerima panggilan scheduler. Konfigurasikan scheduler /api/public/cron/news-ingest setiap 5–15 menit dengan header x-cron-secret."
        : "CRON_SECRET belum dikonfigurasi — news worker tidak dapat dipanggil scheduler.";
    } else if (lastStatus === "unauthorized") {
      newsStatus = "unauthorized";
      newsDetail = "Scheduler memanggil /api/public/cron/news-ingest tanpa x-cron-secret yang valid.";
    } else if (lastStatus === "failed" && allSources.length > 0 && activeSources === 0) {
      newsStatus = "failed";
      newsDetail = `Semua ${allSources.length} sumber gagal pada run terakhir.`;
    } else if (nextNewsMins != null && nextNewsMins < -15) {
      // expected run > 15 menit lewat
      newsStatus = "stale";
      newsDetail = `Worker terlambat ${Math.abs(nextNewsMins)} menit dari jadwal berikutnya.`;
    } else if (failedSourcesCount > 0 || quotaSourcesCount > 0 || lastStatus === "partial" || lastStatus === "no_new_articles") {
      newsStatus = "partial";
      newsDetail = `Run terakhir ${newsRunMins} menit lalu — ${activeSources}/${allSources.length} sumber aktif${quotaSourcesCount ? `, ${quotaSourcesCount} quota-protected` : ""}${failedSourcesCount ? `, ${failedSourcesCount} gagal` : ""}.`;
    } else {
      newsStatus = "healthy";
      newsDetail = `Run terakhir ${newsRunMins} menit lalu — ${activeSources}/${allSources.length} sumber aktif.`;
    }
    cards.push({
      key: "news_pipeline",
      label: "News Pipeline",
      status: newsStatus,
      detail: newsDetail,
      lastUpdatedAt: (newsState as any)?.last_news_worker_run_at ?? null,
      metrics: {
        lastRunWIB: formatWIB((newsState as any)?.last_news_worker_run_at ?? null),
        lastSuccessfulRunWIB: formatWIB((newsState as any)?.last_successful_news_run_at ?? null),
        nextExpectedWIB: formatWIB(nextNewsAt),
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
        ? (nextRunMins != null && nextRunMins > 0 ? "stale" : "healthy")
        : (cronSecretSet ? "not_run_yet" : "not_configured"),
      detail: (agent as any)?.next_expected_worker_run_at
        ? `Dijadwalkan: ${formatWIB((agent as any).next_expected_worker_run_at)}`
        : (cronSecretSet
            ? "AI worker belum dijadwalkan ulang oleh scheduler."
            : "CRON_SECRET belum dikonfigurasi."),
      lastUpdatedAt: (agent as any)?.next_expected_worker_run_at ?? null,
    });

    const { data: agentTimes } = await supabaseAdmin
      .from("ai_trade_agents")
      .select("last_auto_decision_at, last_auto_execution_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const decMinsAuto = minutesAgo(agentTimes?.last_auto_decision_at ?? null);
    const autoDecisionFreshness = agentTimes?.last_auto_decision_at
      ? freshnessStatus(decMinsAuto, 60, 240)
      : (workerMins != null ? "no_recent_event" : (cronSecretSet ? "not_run_yet" : "not_configured"));
    // When IDX is closed/break, agent is designed to skip new decisions —
    // downgrade "stale/partial" to "healthy" so the dashboard reflects expected idle state.
    const autoDecisionStatus: HealthStatus =
      marketClosed && (autoDecisionFreshness === "stale" || autoDecisionFreshness === "partial" || autoDecisionFreshness === "no_recent_event")
        ? "healthy"
        : autoDecisionFreshness;
    cards.push({
      key: "last_auto_decision",
      label: "Last Auto Decision",
      status: autoDecisionStatus,
      detail: agentTimes?.last_auto_decision_at
        ? `${formatWIB(agentTimes.last_auto_decision_at)} (${decMinsAuto} menit lalu)${marketClosed ? ` — IDX ${marketSession.isBreak ? "break" : "closed"}, worker idle by design.` : ""}`
        : (workerMins != null
            ? (marketClosed
              ? `AI worker aktif — IDX ${marketSession.isBreak ? "break" : "closed"}, tidak ada keputusan baru sesuai desain.`
              : "AI worker aktif, namun belum menghasilkan keputusan otomatis.")
            : "AI worker belum pernah berjalan."),
      lastUpdatedAt: agentTimes?.last_auto_decision_at ?? null,
    });

    const exMinsAuto = minutesAgo(agentTimes?.last_auto_execution_at ?? null);
    cards.push({
      key: "last_auto_execution",
      label: "Last Auto Execution",
      status: agentTimes?.last_auto_execution_at
        ? freshnessStatus(exMinsAuto, 240, 1440)
        : (workerMins != null ? "no_recent_event" : (cronSecretSet ? "not_run_yet" : "not_configured")),
      detail: agentTimes?.last_auto_execution_at
        ? `${formatWIB(agentTimes.last_auto_execution_at)} (${exMinsAuto} menit lalu)`
        : (workerMins != null
            ? "Belum ada paper order otomatis yang dieksekusi. AI worker tetap aktif dan mengevaluasi kandidat."
            : "AI worker belum pernah berjalan."),
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
      key: "news_freshness",
      label: "News Freshness",
      status: freshnessStatus(newsMins, 30, 120),
      detail: newsMins == null ? "Belum ada berita." : `Artikel terakhir ${newsMins} menit lalu.`,
      lastUpdatedAt: news?.fetched_at ?? null,
    });

    // 3) Market Data — prefer the new market_data_snapshots registry
    // (Batch 2), fall back to market_data_quality_snapshots, then
    // data_quality_snapshots. Honor the honest enums: market_closed,
    // fallback_active, quota_protected are NOT errors.
    const { data: mds } = await supabaseAdmin
      .from("market_data_snapshots")
      .select("snapshot_at, session_status, market_status, source_primary, source_count, idx_composite, idx_composite_change_pct, ad_ratio, data_quality_score, freshness_status, source_status, message")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: mdq } = await supabaseAdmin
      .from("market_data_quality_snapshots")
      .select("created_at, status, data_quality_score, latest_price_at, symbols_checked, symbols_with_price, symbols_missing_price, stale_symbols, fresh_symbols, market_session, ihsg_value, ihsg_updated_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: dq } = await supabaseAdmin
      .from("data_quality_snapshots")
      .select("created_at, overall_data_quality_score, price_quality")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const mdsMins = minutesAgo((mds as any)?.snapshot_at ?? null);
    const mdqMins = minutesAgo((mdq as any)?.created_at ?? null);
    const dqMins = minutesAgo(dq?.created_at ?? null);
    let mdStatus: HealthStatus;
    let mdDetail: string;
    let mdLastAt: string | null = null;
    let mdMetrics: Record<string, string | number | null> | undefined;
    if (mds) {
      const ss = String((mds as any).source_status ?? "unknown");
      const qScore = Number((mds as any).data_quality_score ?? 0) * 100;
      mdStatus =
        ss === "active" ? "healthy" :
        ss === "fallback_active" ? "partial" :
        ss === "quota_protected" ? "partial" :
        ss === "market_closed" ? "no_recent_event" :
        ss === "rate_limited" ? "degraded" :
        ss === "degraded" ? "degraded" :
        ss === "failed" ? "failed" :
        "unknown";
      const sessLabel = (mds as any).session_status ?? "—";
      mdDetail = ss === "market_closed"
        ? `Pasar tutup (${sessLabel}). ${(mds as any).message ?? "Tidak ada error."}`
        : `${ss} · IHSG ${(mds as any).idx_composite ?? "—"} · skor ${Math.round(qScore)} · ${mdsMins ?? "?"} mnt lalu`;
      mdLastAt = (mds as any).snapshot_at;
      mdMetrics = {
        sourceStatus: ss,
        session: sessLabel,
        ihsg: (mds as any).idx_composite ?? null,
        changePct: (mds as any).idx_composite_change_pct ?? null,
        freshness: (mds as any).freshness_status ?? "—",
        primarySource: (mds as any).source_primary ?? "—",
        qualityScore: Math.round(qScore),
      };
    } else if (mdq) {
      const score = Number((mdq as any).data_quality_score ?? 0);
      mdStatus = score >= 70 ? "healthy" : score >= 40 ? "partial" : "degraded";
      mdDetail = `Skor ${Math.round(score)} · ${(mdq as any).fresh_symbols}/${(mdq as any).symbols_checked} fresh${(mdq as any).market_session ? ` · ${(mdq as any).market_session}` : ""}. ${mdqMins ?? "?"} menit lalu.`;
      mdLastAt = (mdq as any).created_at;
      mdMetrics = {
        score: Math.round(score),
        symbolsChecked: (mdq as any).symbols_checked ?? 0,
        fresh: (mdq as any).fresh_symbols ?? 0,
        stale: (mdq as any).stale_symbols ?? 0,
        missing: (mdq as any).symbols_missing_price ?? 0,
        session: (mdq as any).market_session ?? "—",
        ihsg: (mdq as any).ihsg_value ?? null,
        latestPriceWIB: formatWIB((mdq as any).latest_price_at ?? null),
      };
    } else if (dq) {
      const score = Number(dq.overall_data_quality_score ?? 0);
      mdStatus = score >= 70 ? "healthy" : score >= 40 ? "partial" : "degraded";
      mdDetail = `Skor kualitas ${Math.round(score)} (price: ${dq.price_quality ?? "?"}). ${dqMins ?? "?"} menit lalu.`;
      mdLastAt = dq.created_at;
    } else {
      mdStatus = "not_run_yet";
      mdDetail = "Snapshot kualitas market data belum pernah dibuat. Jalankan Test Market Snapshot atau tunggu worker berikutnya.";
    }
    cards.push({
      key: "market_data",
      label: "Market Data",
      status: mdStatus,
      detail: mdDetail,
      lastUpdatedAt: mdLastAt,
      metrics: mdMetrics,
    });

    // 4) Source Health — normalized via summarizeSourceHealth so the Health
    // Dashboard matches the AI Analyst header (fallback / quota-protected
    // are partial, not failed total).
    const { data: sources } = await supabaseAdmin
      .from("news_sources")
      .select("id, name, status, enabled, fail_count, last_success_at, last_failed_at, last_error");
    // Merge unified registry rows (Batch 1) so non-news sources (market,
    // disclosure, fundamental) are counted in the Source Health summary.
    const { data: unifiedSources } = await supabaseAdmin
      .from("data_sources")
      .select("source_key, source_name, source_type, health_status, is_enabled, last_success_at, last_failure_at, last_message");
    const unifiedAdapted = (unifiedSources ?? []).map((r: any) => ({
      id: r.source_key,
      name: `${r.source_name} (${r.source_type})`,
      status: r.health_status,
      enabled: r.is_enabled,
      fail_count: null,
      last_success_at: r.last_success_at,
      last_failed_at: r.last_failure_at,
      last_error: r.last_message,
    }));
    const summary = summarizeSourceHealth(
      [...((sources ?? []) as any), ...unifiedAdapted] as any,
    );
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
        totalSources: summary.sources.length,
      },
    });

    // 5) Portfolio Sync — scoped to the active paper account for currentUserId().
    const { data: acc } = await supabaseAdmin
      .from("paper_accounts")
      .select("id, cash, equity")
      .eq("user_id", currentUserId())
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
    const aiCtxFreshness = freshnessStatus(decMins, 60, 240);
    const aiCtxStatus: HealthStatus =
      marketClosed && (aiCtxFreshness === "stale" || aiCtxFreshness === "partial")
        ? "healthy"
        : aiCtxFreshness;
    cards.push({
      key: "ai_app_context",
      label: "AI App Context",
      status: aiCtxStatus,
      detail: lastDec
        ? `Keputusan AI terakhir ${decMins} menit lalu.${marketClosed ? ` IDX ${marketSession.isBreak ? "break" : "closed"} — konteks tetap aktif (read-only).` : ""}`
        : "Belum ada keputusan AI.",
      lastUpdatedAt: lastDec?.created_at ?? null,
    });


    // 7) Cron Status — derive from CRON_SECRET presence + worker run signals + audit logs
    const { data: cronAudit } = await supabaseAdmin
      .from("system_audit_logs")
      .select("created_at, status, message")
      .eq("module", "cron")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: cronUnauth } = await supabaseAdmin
      .from("system_audit_logs")
      .select("created_at, message")
      .eq("module", "cron")
      .eq("status", "unauthorized")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cronMins = minutesAgo(cronAudit?.created_at ?? null);
    const aiWorkerRan = workerMins != null;
    const newsWorkerRan = newsRunMins != null;
    let cronStatus: HealthStatus;
    let cronDetail: string;
    if (!cronSecretSet) {
      cronStatus = "not_configured";
      cronDetail = "CRON_SECRET belum dikonfigurasi.";
    } else if (cronUnauth && (!cronAudit || cronUnauth.created_at >= cronAudit.created_at)) {
      cronStatus = "unauthorized";
      cronDetail = "Scheduler memanggil endpoint tanpa x-cron-secret yang valid.";
    } else if (!aiWorkerRan && !newsWorkerRan && !cronAudit) {
      cronStatus = "not_run_yet";
      cronDetail = "CRON_SECRET tersedia, tetapi belum ada scheduler yang memanggil endpoint.";
    } else if (aiWorkerRan && !newsWorkerRan) {
      cronStatus = "partial";
      cronDetail = "AI worker aktif, tetapi news worker belum berjalan.";
    } else if (cronAudit) {
      cronStatus = cronAudit.status === "error" ? "degraded" : freshnessStatus(cronMins, 15, 60);
      cronDetail = `Run ${cronMins} menit lalu — ${cronAudit.status}.`;
    } else {
      cronStatus = "healthy";
      cronDetail = "Worker aktif sesuai jadwal.";
    }
    cards.push({
      key: "cron",
      label: "Cron Status",
      status: cronStatus,
      detail: cronDetail,
      lastUpdatedAt: cronAudit?.created_at ?? null,
      metrics: {
        aiAgentCronStatus: aiWorkerRan ? "active" : "not_run_yet",
        newsCronStatus: newsWorkerRan ? "active" : "not_run_yet",
        marketDataCronStatus: mdq ? "active" : "not_run_yet",
        disclosureCronStatus: "not_configured",
        lastCronCall: formatWIB(cronAudit?.created_at ?? null),
        lastUnauthorizedCall: formatWIB(cronUnauth?.created_at ?? null),
        configuredEndpoints:
          "/api/public/cron/ai-agent (1m) · /api/public/cron/news-ingest (5–15m) · /api/public/cron/disclosure-ingest (30–60m)",
      },
    });

    // 8) Database Consistency — scoped to active account.
    const positionsQ = acc?.id
      ? supabaseAdmin.from("paper_positions").select("id, qty, avg_price").eq("account_id", acc.id)
      : supabaseAdmin.from("paper_positions").select("id, qty, avg_price").eq("user_id", currentUserId());
    const { data: positions } = await positionsQ;
    let invalidPos = 0;
    for (const p of (positions ?? []) as any[]) {
      if (!Number.isFinite(Number(p.qty)) || !Number.isFinite(Number(p.avg_price))) invalidPos++;
      if (Number(p.qty) <= 0) invalidPos++;
    }
    if (invalidPos > 0) warnings.push(`${invalidPos} posisi paper tidak valid (qty/avg_price NaN atau ≤0).`);

    const ordersQ = acc?.id
      ? supabaseAdmin.from("paper_orders").select("id, price, qty, status").eq("account_id", acc.id).eq("status", "filled")
      : supabaseAdmin.from("paper_orders").select("id, price, qty, status").eq("user_id", currentUserId()).eq("status", "filled");
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

    // 10) Disclosure / Corporate Action / Regulatory pipeline
    try {
      const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const [d24, d7, c7, r7, hiNeg, lastRun, lastSuccessRun] = await Promise.all([
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since24),
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d),
        supabaseAdmin.from("corporate_actions").select("id", { count: "exact", head: true }).gte("announcement_date", since7d.slice(0, 10)),
        supabaseAdmin.from("regulatory_events").select("id", { count: "exact", head: true }).gte("published_at", since7d),
        supabaseAdmin.from("official_disclosures").select("id", { count: "exact", head: true }).gte("published_at", since7d).eq("sentiment", "negative").gte("impact_score", 70),
        supabaseAdmin.from("disclosure_pipeline_runs").select("status,started_at,finished_at,error_message,fetched_count,inserted_count").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from("disclosure_pipeline_runs").select("started_at").eq("status", "success").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const d24Count = d24.count ?? 0;
      const d7Count = d7.count ?? 0;
      const c7Count = c7.count ?? 0;
      const r7Count = r7.count ?? 0;
      const noEvents7d = d7Count + c7Count + r7Count === 0;
      const run = lastRun.data as any;
      let status: HealthStatus;
      let detail: string;
      if (!run) {
        status = cronSecretSet ? "not_run_yet" : "not_configured";
        detail = cronSecretSet
          ? "Disclosure worker belum pernah dijalankan. Konfigurasikan scheduler /api/public/cron/disclosure-ingest setiap 30–60 menit."
          : "CRON_SECRET belum dikonfigurasi — disclosure worker tidak dapat dipanggil scheduler.";
      } else if (run.status === "failed") {
        status = "failed";
        detail = `Run terakhir gagal: ${run.error_message ?? "unknown error"}.`;
      } else if (run.status === "partial") {
        status = "partial";
        detail = `Run terakhir partial — ${run.inserted_count ?? 0} inserted dari ${run.fetched_count ?? 0} fetched.`;
      } else if (noEvents7d) {
        status = "no_recent_event";
        detail = "Tidak ada official disclosure / corporate action / regulatory event yang terdeteksi dalam 7 hari terakhir.";
      } else {
        status = d24Count > 0 ? "healthy" : "partial";
        detail = `${d24Count} disclosure (24h) · ${d7Count + c7Count + r7Count} event (7d) · ${hiNeg.count ?? 0} high-impact negatif.`;
      }
      cards.push({
        key: "disclosure_pipeline",
        label: "Disclosure / Corporate Action Pipeline",
        status,
        detail,
        lastUpdatedAt: run?.started_at ?? new Date().toISOString(),
        metrics: {
          official_24h: d24Count,
          official_7d: d7Count,
          corporate_actions_7d: c7Count,
          regulatory_events_7d: r7Count,
          high_impact_negative_7d: hiNeg.count ?? 0,
          lastRunWIB: formatWIB(run?.started_at ?? null),
          lastSuccessfulRunWIB: formatWIB((lastSuccessRun.data as any)?.started_at ?? null),
          lastError: run?.error_message ?? null,
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


    // Portfolio Intelligence Engine card — surfaces health score + snapshot freshness.
    try {
      const { data: lastSnap } = await supabaseAdmin
        .from("portfolio_intelligence_snapshots")
        .select("created_at, portfolio_health_score, risk_level")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastAt = lastSnap?.created_at ? new Date(lastSnap.created_at).getTime() : 0;
      const ageH = lastAt ? (Date.now() - lastAt) / 3_600_000 : Infinity;
      const status: HealthStatus = !lastSnap ? "not_run_yet" : ageH > 24 ? "stale" : "healthy";
      cards.push({
        key: "portfolio_intelligence",
        label: "Portfolio Intelligence Engine",
        status,
        detail: lastSnap
          ? `Last health score ${lastSnap.portfolio_health_score} (${lastSnap.risk_level}). Snapshot age ${ageH.toFixed(1)}h.`
          : "Belum ada snapshot portfolio intelligence. Buka Portfolio untuk men-trigger pertama kali.",
        lastUpdatedAt: lastSnap?.created_at ?? new Date().toISOString(),
        metrics: lastSnap
          ? { healthScore: lastSnap.portfolio_health_score, riskLevel: lastSnap.risk_level, snapshotAgeH: Number(ageH.toFixed(1)) }
          : undefined,
      });
    } catch (e: any) {
      cards.push({
        key: "portfolio_intelligence",
        label: "Portfolio Intelligence Engine",
        status: "unknown",
        detail: `Tidak bisa membaca portfolio intelligence: ${e?.message ?? String(e)}`,
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
