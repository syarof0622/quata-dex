import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChatPanel } from "@/components/ChatPanel";
import { RiskEnginePanel } from "@/components/RiskEnginePanel";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Database, Newspaper, BarChart3, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeContextSummary, type BadgeStatus, type Tone } from "@/lib/ai-context-summary";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Trading Analyst — Quanta Terminal" }] }),
  component: AIAnalystPage,
});

function AIAnalystPage() {
  const { data: ctx } = useQuery({
    queryKey: ["ai-analyst-context"],
    queryFn: fetchMarketContext,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="p-3 sm:p-5 space-y-3">
      {/* Header */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
                <Activity className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold">AI Trading Analyst</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Real-time market assistant grounded in live price, news, sentiment, technicals, and paper trading context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CapBadge icon={Database} label="Real Market Data" tone="emerald" />
            <CapBadge icon={Newspaper} label="Sentiment" tone="teal" />
            <CapBadge icon={BarChart3} label="Technical" tone="sky" />
            <CapBadge icon={ShieldCheck} label="Paper Trading Only" tone="amber" />
            <CapBadge icon={Clock} label={`Last update: ${ctx?.lastUpdateLabel ?? "—"}`} tone="slate" />
          </div>
        </div>
      </div>

      {/* Market context bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <ContextCard title="IDX Session" value={ctx?.sessionLabel ?? "—"} tone={ctx?.sessionTone ?? "slate"} />
        <ContextCard title="IHSG Bias" value={ctx?.biasLabel ?? "PARTIAL DATA"} tone={ctx?.biasTone ?? "slate"} />
        <ContextCard title="Sentiment" value={ctx?.sentimentLabel ?? "PARTIAL DATA"} tone={ctx?.sentimentTone ?? "slate"} />
        <ContextCard title="Data Quality" value={ctx?.dataQualityLabel ?? "PARTIAL"} tone={ctx?.dataQualityTone ?? "amber"} />
        <ContextCard title="Source Health" value={ctx?.sourceHealthLabel ?? "Unknown"} tone={ctx?.sourceHealthTone ?? "slate"} subtext={ctx?.sourceHealthSubtext} />
      </div>

      {/* App Context status — reflects ACTUAL data status, not always green */}
      <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">AI App Context (read-only)</div>
        <div className="flex flex-wrap gap-1.5">
          {(ctx?.badges ?? []).map(b => {
            const cls = TONE_BADGE[b.tone] ?? TONE_BADGE.slate;
            const dot = TONE_DOT[b.tone] ?? TONE_DOT.slate;
            return (
              <span key={b.label} className={cn("inline-flex items-center gap-1 rounded-full border text-[10px] px-2 py-0.5", cls)} title={b.status}>
                <span className={cn("h-1 w-1 rounded-full", dot)} />
                {b.label}: <span className="font-semibold">{b.status}</span>
              </span>
            );
          })}
        </div>
      </div>


      <RiskEnginePanel />
      <ChatPanel />
    </div>
  );
}

const TONE_BADGE: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  teal:    "bg-teal-500/10 text-teal-400 border-teal-500/30",
  sky:     "bg-sky-500/10 text-sky-400 border-sky-500/30",
  amber:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  rose:    "bg-rose-500/10 text-rose-400 border-rose-500/30",
  slate:   "bg-slate-500/10 text-slate-300 border-slate-500/30",
};

function CapBadge({ icon: Icon, label, tone }: { icon: any; label: string; tone: keyof typeof TONE_BADGE }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wider", TONE_BADGE[tone])}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

const TONE_DOT: Record<string, string> = {
  emerald: "bg-emerald-400",
  teal:    "bg-teal-400",
  sky:     "bg-sky-400",
  amber:   "bg-amber-400",
  rose:    "bg-rose-400",
  slate:   "bg-slate-400",
};

function ContextCard({ title, value, tone, subtext }: { title: string; value: string; tone: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 hover:border-primary/30 transition-colors" title={subtext}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone] ?? "bg-slate-400")} />
        {title}
      </div>
      <div className="mt-1 text-sm font-semibold truncate">{value}</div>
      {subtext && <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{subtext}</div>}
    </div>
  );
}

type CtxData = {
  sessionLabel: string; sessionTone: Tone;
  biasLabel: string; biasTone: Tone;
  sentimentLabel: string; sentimentTone: Tone;
  dataQualityLabel: string; dataQualityTone: Tone;
  sourceHealthLabel: string; sourceHealthTone: Tone; sourceHealthSubtext: string;
  lastUpdateLabel: string;
  badges: BadgeStatus[];
};

async function fetchMarketContext(): Promise<CtxData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: news }, { data: regime }, { data: sources }, { data: agents }, { data: positions }, { data: orders }] = await Promise.all([
    supabase.from("news_articles").select("sentiment, sentiment_score, published_at").gte("published_at", since).eq("is_duplicate", false).limit(500),
    supabase.from("market_regime_snapshots").select("regime_classification, idx_change_pct, created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("news_sources").select("id, name, status, enabled, last_success_at, last_failed_at, last_error, fail_count"),
    supabase.from("ai_trade_agents").select("automation_enabled, last_worker_run_at, last_worker_status, worker_error_count, status").order("created_at", { ascending: false }).limit(1),
    supabase.from("paper_positions").select("id").limit(50),
    supabase.from("paper_orders").select("id, status").eq("status", "filled").limit(200),
  ]);

  const sum = computeContextSummary({
    news: (news ?? []) as any,
    regime: (regime ?? []) as any,
    sources: sources ?? [],
    agent: (agents ?? [])[0] as any,
    portfolio: { openPositions: positions?.length ?? 0 },
    paperTrading: {
      openPositions: positions?.length ?? 0,
      closedTrades: (orders ?? []).filter((o: any) => o.status === "filled").length,
    },
  });

  const now = new Date();
  const lastUpdateLabel = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";

  return {
    sessionLabel: sum.idxSession.label, sessionTone: sum.idxSession.tone,
    biasLabel: sum.ihsgBias.label, biasTone: sum.ihsgBias.tone,
    sentimentLabel: sum.sentiment.label, sentimentTone: sum.sentiment.tone,
    dataQualityLabel: sum.dataQuality.label, dataQualityTone: sum.dataQuality.tone,
    sourceHealthLabel: sum.sourceHealth.label, sourceHealthTone: sum.sourceHealth.tone,
    sourceHealthSubtext: sum.sourceHealth.subtext,
    lastUpdateLabel,
    badges: sum.badges,
  };
}
