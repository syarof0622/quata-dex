// Shared "AI App Context summary" used by BOTH the AI Analyst header cards
// AND the AI Chat APP CONTEXT block. This guarantees the badges in the
// AI Analyst page render exactly the same status the AI itself sees.
//
// Pure / isomorphic: takes raw rows in, returns the summary object. Both
// the client header (src/routes/_authenticated/ai.tsx) and the server-side
// context builder (src/lib/ai-app-context.server.ts) call this helper.

import { summarizeSourceHealth, overallStatusLabel, overallStatusTone, type SourceHealthSummary } from "./source-health";
import { getIDXMarketSession, type IDXSessionState } from "./idx-market-session";

export type Tone = "emerald" | "teal" | "sky" | "amber" | "rose" | "slate";

export interface AIContextSummary {
  idxSession: { label: string; tone: Tone };
  ihsgBias: { label: string; tone: Tone };
  sentiment: { label: string; tone: Tone };
  dataQuality: { label: string; tone: Tone };
  sourceHealth: { label: string; tone: Tone; subtext: string; raw: SourceHealthSummary };
  aiAgent: { label: string; tone: Tone };
  badges: BadgeStatus[];
  lastUpdated: string;
}

export interface BadgeStatus {
  label: string;
  status: string; // human label e.g. "Connected", "Empty", "Stale"
  tone: Tone;
}

export interface SummaryInput {
  news?: { sentiment: string | null; sentiment_score: number | null; published_at: string }[] | null;
  regime?: { regime_classification: string | null; idx_change_pct: number | null; created_at: string }[] | null;
  sources?: any[] | null;
  agent?: {
    automation_enabled?: boolean | null;
    last_worker_run_at?: string | null;
    last_worker_status?: string | null;
    worker_error_count?: number | null;
    status?: string | null;
  } | null;
  portfolio?: { openPositions?: number; equity?: number | null } | null;
  paperTrading?: { closedTrades?: number; openPositions?: number } | null;
  autonomousScan?: { lastRunAt?: string | null; candidates?: number } | null;
  undervalue?: { ranked?: number } | null;
  /** Count of `ai_agent_decisions` in the last 5 minutes. If > 0 and the
   * agent row reads as Inactive, the agent badge is downgraded to a
   * "Sync Warning" instead of falsely showing "Inactive". */
  recentAgentDecisionCount?: number;
  now?: Date;
}

export const ACTIVE_AGENT_STATUSES = new Set(["active_market_open", "active", "running"]);
export const WORKER_STALE_MINUTES = 30;


export function computeContextSummary(input: SummaryInput): AIContextSummary {
  const now = input.now ?? new Date();

  // IDX session (WIB) — single source of truth via getIDXMarketSession.
  const sess = getIDXMarketSession(now);
  const SESSION_TONE: Record<IDXSessionState, Tone> = {
    open_session_1: "emerald",
    open_session_2: "emerald",
    lunch_break: "amber",
    pre_open: "slate",
    post_close: "slate",
    weekend: "slate",
    holiday: "slate",
  };
  const SESSION_LABEL: Record<IDXSessionState, string> = {
    open_session_1: "Session I",
    open_session_2: "Session II",
    lunch_break: "Lunch break",
    pre_open: "Pre-open",
    post_close: "Closed",
    weekend: "Weekend",
    holiday: "Holiday",
  };
  const idxSession: AIContextSummary["idxSession"] = {
    label: SESSION_LABEL[sess.state],
    tone: SESSION_TONE[sess.state],
  };

  // Bias
  const news = input.news ?? [];
  const reg = (input.regime ?? [])[0];
  let ihsgBias: AIContextSummary["ihsgBias"] = { label: "Neutral", tone: "slate" };
  if (reg?.regime_classification) {
    const r = String(reg.regime_classification).toLowerCase();
    if (r.includes("bull")) ihsgBias = { label: "Bullish", tone: "emerald" };
    else if (r.includes("bear")) ihsgBias = { label: "Bearish", tone: "rose" };
    else if (r.includes("neutral")) ihsgBias = { label: "Neutral", tone: "slate" };
  } else if (news.length > 0) {
    let pos = 0, neg = 0;
    for (const n of news) { if (n.sentiment === "positive") pos++; else if (n.sentiment === "negative") neg++; }
    if (pos > neg * 1.4) ihsgBias = { label: "Mildly Bullish", tone: "emerald" };
    else if (neg > pos * 1.4) ihsgBias = { label: "Mildly Bearish", tone: "rose" };
  } else {
    ihsgBias = { label: "Partial Data", tone: "amber" };
  }

  // Sentiment
  let sentiment: AIContextSummary["sentiment"] = { label: "Partial Data", tone: "amber" };
  if (news.length > 0) {
    let sum = 0, n = 0;
    for (const r of news) { sum += Number(r.sentiment_score ?? 0); n++; }
    const avg = n ? sum / n : 0;
    if (avg > 0.15) sentiment = { label: "Positive", tone: "emerald" };
    else if (avg < -0.15) sentiment = { label: "Negative", tone: "rose" };
    else sentiment = { label: "Neutral", tone: "slate" };
  }

  // Source Health (computed first so Data Quality can incorporate it).
  const shRaw = summarizeSourceHealth(input.sources as any);
  const sourceHealth: AIContextSummary["sourceHealth"] = {
    label: overallStatusLabel(shRaw.overallStatus),
    tone: overallStatusTone(shRaw.overallStatus),
    subtext: summarySubtextLocal(shRaw),
    raw: shRaw,
  };

  // Data Quality — aggregate of news freshness, regime freshness, and source
  // health usability. Do NOT mark stale solely because news count is low or
  // fundamental data is insufficient; core market signals (price/news/regime)
  // dominate. Fundamental/undervalue gaps only affect their own badges.
  const newsCount = news.length;
  const latestNewsAt = news[0]?.published_at ? new Date(news[0].published_at).getTime() : 0;
  const newsRecent = newsCount > 0 && Date.now() - latestNewsAt < 6 * 3600_000;
  const newsFresh = newsCount > 20 && newsRecent;
  const regimeRecent = !!(reg?.created_at && Date.now() - new Date(reg.created_at).getTime() < 6 * 3600_000);
  const sourcesUsable = shRaw.totalUsable > 0;
  const freshSignals = [newsFresh, regimeRecent, sourcesUsable].filter(Boolean).length;
  const anySignal = newsRecent || regimeRecent || sourcesUsable || newsCount > 0;

  let dataQuality: AIContextSummary["dataQuality"];
  if (freshSignals >= 3) dataQuality = { label: "Fresh", tone: "emerald" };
  else if (freshSignals >= 1 || anySignal) dataQuality = { label: "Partial", tone: "amber" };
  else dataQuality = { label: "Stale", tone: "rose" };

  // AI Agent (worker liveness) — mirrors src/lib/ai-app-context.server.ts so
  // the header badge and the AI Chat see the SAME status. If the agent row
  // reads inactive but `recentAgentDecisionCount > 0`, surface a Sync Warning
  // rather than falsely claiming the agent is off.
  const agent = input.agent;
  const recentDecisions = Number(input.recentAgentDecisionCount ?? 0);
  let aiAgent: AIContextSummary["aiAgent"] = { label: "Inactive", tone: "slate" };
  if (agent) {
    const lastRun = agent.last_worker_run_at ? new Date(agent.last_worker_run_at).getTime() : 0;
    const ageMin = lastRun ? (Date.now() - lastRun) / 60_000 : Infinity;
    const workerFresh = ageMin <= WORKER_STALE_MINUTES;
    const workerOk = !agent.last_worker_status || agent.last_worker_status === "success" || agent.last_worker_status === "running";
    const statusActive = ACTIVE_AGENT_STATUSES.has(String(agent.status ?? ""));
    const isAutoRunning = Boolean(agent.automation_enabled && workerFresh && statusActive && workerOk);

    if (isAutoRunning) aiAgent = { label: "Auto Running", tone: "emerald" };
    else if (agent.automation_enabled && agent.last_worker_status === "error") aiAgent = { label: "Worker Error", tone: "rose" };
    else if (agent.automation_enabled && statusActive && !workerFresh) aiAgent = { label: "Worker Stale", tone: "amber" };
    else if (agent.automation_enabled && !lastRun) aiAgent = { label: "Worker Not Started", tone: "amber" };
    else if (agent.automation_enabled === false && statusActive) aiAgent = { label: "Manual Only", tone: "slate" };
    else aiAgent = { label: "Inactive", tone: "slate" };
  }

  // Sync warning override: recent decisions exist but the agent row reads as
  // non-running. Don't lie to the user — show that something IS happening.
  if (recentDecisions > 0 && aiAgent.tone !== "emerald") {
    aiAgent = { label: "Sync Warning", tone: "amber" };
  }


  // Per-badge statuses for the App Context strip
  const badges: BadgeStatus[] = [
    badgeFromCount("Portfolio", input.portfolio?.openPositions, input.portfolio == null),
    badgeFromCount("Paper Trading",
      (input.paperTrading?.openPositions ?? 0) + (input.paperTrading?.closedTrades ?? 0),
      input.paperTrading == null),
    { label: "AI Trade Agent", status: aiAgent.label, tone: aiAgent.tone },
    badgeFromScanner("Autonomous Scanner", input.autonomousScan),
    badgeFreshness("News & Sentiment", newsCount, news[0]?.published_at),
    badgeFromCount("Undervalue", input.undervalue?.ranked, input.undervalue == null,
      { empty: "Insufficient Data" }),
    { label: "Source Health", status: sourceHealth.label, tone: sourceHealth.tone },
    { label: "Market Regime", status: reg ? "Connected" : "Stale", tone: reg ? "emerald" : "amber" },
    { label: "Data Quality", status: dataQuality.label, tone: dataQuality.tone },
  ];

  return {
    idxSession, ihsgBias, sentiment, dataQuality, sourceHealth, aiAgent, badges,
    lastUpdated: now.toISOString(),
  };
}

function summarySubtextLocal(sum: SourceHealthSummary): string {
  if (sum.sources.length === 0) return "no source data";
  const parts: string[] = [];
  if (sum.activeCount) parts.push(`${sum.activeCount} active`);
  if (sum.fallbackCount) parts.push(`${sum.fallbackCount} fallback`);
  if (sum.quotaProtectedCount) parts.push(`${sum.quotaProtectedCount} quota protected`);
  if (sum.degradedCount) parts.push(`${sum.degradedCount} degraded`);
  if (sum.failedCount) parts.push(`${sum.failedCount} failed`);
  if (sum.disabledCount) parts.push(`${sum.disabledCount} disabled`);
  return parts.join(" · ") || "no signal";
}

function badgeFromCount(
  label: string,
  count: number | undefined | null,
  missing: boolean,
  opts: { empty?: string } = {},
): BadgeStatus {
  if (missing) return { label, status: "Unknown", tone: "slate" };
  const n = Number(count ?? 0);
  if (n <= 0) return { label, status: opts.empty ?? "Empty", tone: "slate" };
  return { label, status: "Connected", tone: "emerald" };
}

function badgeFromScanner(label: string, scan: SummaryInput["autonomousScan"]): BadgeStatus {
  if (!scan) return { label, status: "Unknown", tone: "slate" };
  if (!scan.lastRunAt) return { label, status: "Empty", tone: "slate" };
  const age = Date.now() - new Date(scan.lastRunAt).getTime();
  if (age > 6 * 60 * 60 * 1000) return { label, status: "Stale", tone: "amber" };
  if ((scan.candidates ?? 0) <= 0) return { label, status: "No Candidates", tone: "amber" };
  return { label, status: "Connected", tone: "emerald" };
}

function badgeFreshness(label: string, count: number, latestPublishedAt?: string): BadgeStatus {
  if (count === 0) return { label, status: "Stale", tone: "rose" };
  if (latestPublishedAt) {
    const age = Date.now() - new Date(latestPublishedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) return { label, status: "Stale", tone: "amber" };
  }
  if (count > 30) return { label, status: "Fresh", tone: "emerald" };
  return { label, status: "Partial", tone: "amber" };
}
