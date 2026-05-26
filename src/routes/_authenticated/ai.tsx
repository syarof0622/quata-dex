import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChatPanel } from "@/components/ChatPanel";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Database, Newspaper, BarChart3, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeSourceHealth, overallStatusLabel, overallStatusTone, summarySubtext } from "@/lib/source-health";

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

      {/* App Context status — tells user what the AI can read */}
      <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">AI App Context (read-only)</div>
        <div className="flex flex-wrap gap-1.5">
          {["Portfolio","Paper Trading","AI Trade Agent","Autonomous Scanner","Watchlist","News & Sentiment","Undervalue","Alerts","Backtest","Journal","Market Regime","Data Quality","Source Health"].map(label => (
            <span key={label} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5">
              <span className="h-1 w-1 rounded-full bg-emerald-400" />{label}
            </span>
          ))}
        </div>
      </div>

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
  sessionLabel: string; sessionTone: string;
  biasLabel: string; biasTone: string;
  sentimentLabel: string; sentimentTone: string;
  dataQualityLabel: string; dataQualityTone: string;
  sourceHealthLabel: string; sourceHealthTone: string; sourceHealthSubtext: string;
  lastUpdateLabel: string;
};


async function fetchMarketContext(): Promise<CtxData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: news }, { data: regime }, { data: sources }] = await Promise.all([
    supabase.from("news_articles").select("sentiment, sentiment_score, published_at").gte("published_at", since).eq("is_duplicate", false).limit(500),
    supabase.from("market_regime_snapshots").select("regime_classification, idx_change_pct, created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("news_sources").select("status, enabled"),
  ]);

  // Session
  const now = new Date();
  const wibH = (now.getUTCHours() + 7) % 24;
  const wibM = now.getUTCMinutes();
  const t = wibH * 60 + wibM;
  const dow = (now.getUTCDay() + (now.getUTCHours() + 7 >= 24 ? 1 : 0)) % 7;
  const weekend = dow === 0 || dow === 6;
  let sessionLabel = "Closed", sessionTone = "slate";
  if (!weekend) {
    if (t >= 9 * 60 && t < 11 * 60 + 30) { sessionLabel = "Session I"; sessionTone = "emerald"; }
    else if (t >= 11 * 60 + 30 && t < 13 * 60 + 30) { sessionLabel = "Break"; sessionTone = "amber"; }
    else if (t >= 13 * 60 + 30 && t < 15 * 60) { sessionLabel = "Session II"; sessionTone = "emerald"; }
    else if (t >= 15 * 60 && t < 15 * 60 + 30) { sessionLabel = "Closing Auction"; sessionTone = "teal"; }
  }

  // Bias from regime + news
  const reg = (regime ?? [])[0];
  let biasLabel = "Neutral", biasTone = "slate";
  if (reg?.regime_classification) {
    const r = String(reg.regime_classification).toLowerCase();
    if (r.includes("bull")) { biasLabel = "Bullish"; biasTone = "emerald"; }
    else if (r.includes("bear")) { biasLabel = "Bearish"; biasTone = "rose"; }
    else if (r.includes("neutral")) { biasLabel = "Neutral"; biasTone = "slate"; }
  } else if (news && news.length > 0) {
    let pos = 0, neg = 0;
    for (const n of news as any[]) { if (n.sentiment === "positive") pos++; else if (n.sentiment === "negative") neg++; }
    if (pos > neg * 1.4) { biasLabel = "Mildly Bullish"; biasTone = "emerald"; }
    else if (neg > pos * 1.4) { biasLabel = "Mildly Bearish"; biasTone = "rose"; }
  } else {
    biasLabel = "PARTIAL DATA"; biasTone = "amber";
  }

  // Sentiment
  let sentimentLabel = "PARTIAL DATA", sentimentTone = "amber";
  if (news && news.length > 0) {
    let sum = 0, n = 0;
    for (const r of news as any[]) { sum += Number(r.sentiment_score ?? 0); n++; }
    const avg = n ? sum / n : 0;
    if (avg > 0.15) { sentimentLabel = "Positive"; sentimentTone = "emerald"; }
    else if (avg < -0.15) { sentimentLabel = "Negative"; sentimentTone = "rose"; }
    else { sentimentLabel = "Neutral"; sentimentTone = "slate"; }
  }

  // Data quality
  const newsCount = news?.length ?? 0;
  let dataQualityLabel = "Stale", dataQualityTone = "rose";
  if (newsCount > 30) { dataQualityLabel = "Fresh"; dataQualityTone = "emerald"; }
  else if (newsCount > 5) { dataQualityLabel = "Partial"; dataQualityTone = "amber"; }

  // Source health
  const enabled = (sources ?? []).filter((s: any) => s.enabled);
  const active = enabled.filter((s: any) => s.status === "ok" || s.status === "idle" || s.status === "success").length;
  const total = enabled.length;
  let sourceHealthLabel = total === 0 ? "—" : `${active}/${total} active`;
  let sourceHealthTone = total === 0 ? "slate" : active === total ? "emerald" : active >= total * 0.6 ? "amber" : "rose";

  const lastUpdateLabel = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";

  return { sessionLabel, sessionTone, biasLabel, biasTone, sentimentLabel, sentimentTone, dataQualityLabel, dataQualityTone, sourceHealthLabel, sourceHealthTone, lastUpdateLabel };
}
