import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatPanel } from "@/components/ChatPanel";
import { RiskEnginePanel } from "@/components/RiskEnginePanel";
import { DecisionReplayPanel } from "@/components/DecisionReplay";
import { AutonomousAgentPanel } from "@/components/AutonomousAgentPanel";
import { getAIContextSummaryServer } from "@/lib/ai-context-summary.server";
import { Activity, Database, Newspaper, BarChart3, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Trading Analyst — Quanta Terminal" }] }),
  component: AIAnalystPage,
});

function AIAnalystPage() {
  const { L } = useLang();
  const T = L.tools.ai;
  const fetchSummary = useServerFn(getAIContextSummaryServer);
  const { data: ctx } = useQuery({
    queryKey: ["ai-context-summary"],
    queryFn: () => fetchSummary(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="p-3 sm:p-5 space-y-3">
      {/* Mobile: compact chat-first header. Desktop: full hero. */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 px-1">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md shrink-0">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold leading-tight truncate">{T.title}</h1>
            <p className="text-[11.5px] text-muted-foreground truncate">{T.subtitleMobile}</p>
          </div>
        </div>
        {/* Compact status chip strip */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1 pb-1">
          <Chip tone={ctx?.idxSession.tone ?? "slate"} label={`${T.idxPrefix}: ${ctx?.idxSession.label ?? "—"}`} />
          <Chip tone={ctx?.sentiment.tone ?? "slate"} label={`${T.sentimentPrefix}: ${ctx?.sentiment.label ?? "—"}`} />
          <Chip tone={ctx?.dataQuality.tone ?? "amber"} label={`${T.dataPrefix}: ${ctx?.dataQuality.label ?? "—"}`} />
          <Chip tone={ctx?.sourceHealth.tone ?? "slate"} label={`${T.sourcePrefix}: ${ctx?.sourceHealth.label ?? "—"}`} />
          <Chip tone="amber" label={T.paperOnly} />
        </div>
        <details className="mt-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
          <summary className="cursor-pointer list-none text-[11.5px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>{T.viewContext}</span>
            <span className="text-primary text-[11px]">{T.tapToExpand}</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
        </details>
      </div>

      {/* Desktop hero */}
      <div className="hidden md:block rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
                <Activity className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold">{T.title}</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {T.subtitleDesktop}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CapBadge icon={Database} label={T.capRealData} tone="emerald" />
            <CapBadge icon={Newspaper} label={T.capSentiment} tone="teal" />
            <CapBadge icon={BarChart3} label={T.capTechnical} tone="sky" />
            <CapBadge icon={ShieldCheck} label={T.capPaperOnly} tone="amber" />
            <CapBadge icon={Clock} label={T.lastUpdate.replace("{t}", ctx?.lastUpdateLabel ?? "—")} tone="slate" />
          </div>
        </div>
      </div>

      {/* Desktop market context bar */}
      <div className="hidden md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <ContextCard title={T.idxSession} value={ctx?.idxSession.label ?? "—"} tone={ctx?.idxSession.tone ?? "slate"} />
        <ContextCard title={T.ihsgBias} value={ctx?.ihsgBias.label ?? T.partialData} tone={ctx?.ihsgBias.tone ?? "slate"} />
        <ContextCard title={T.sentiment} value={ctx?.sentiment.label ?? T.partialData} tone={ctx?.sentiment.tone ?? "slate"} />
        <ContextCard title={T.dataQuality} value={ctx?.dataQuality.label ?? T.partial} tone={ctx?.dataQuality.tone ?? "amber"} />
        <ContextCard title={T.sourceHealth} value={ctx?.sourceHealth.label ?? T.unknown} tone={ctx?.sourceHealth.tone ?? "slate"} subtext={ctx?.sourceHealth.subtext} />
      </div>

      {/* Desktop App Context status */}
      <div className="hidden md:block rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{T.appContextRO}</div>
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


      {/* Autonomous Agent Status — primary panel for automation visibility. */}
      <AutonomousAgentPanel />

      {/* Chat is the primary surface — render before audit / risk panels so the
          composer is visible without scrolling past Decision Replay. */}
      <ChatPanel />
      {/* Risk + replay collapsed on mobile to keep AI chat as the focus. */}
      <details className="md:hidden rounded-xl border border-border/60 bg-card/40">
        <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-medium text-muted-foreground">{T.replayAndRisk}</summary>
        <div className="p-2 space-y-3">
          <DecisionReplayPanel defaultOpen={false} />
          <RiskEnginePanel />
        </div>
      </details>
      <div className="hidden md:block space-y-3">
        <DecisionReplayPanel defaultOpen={false} />
        <RiskEnginePanel />
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: string }) {
  const cls = TONE_BADGE[tone] ?? TONE_BADGE.slate;
  return (
    <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full border text-[10.5px] px-2 py-0.5 whitespace-nowrap", cls)}>
      {label}
    </span>
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
