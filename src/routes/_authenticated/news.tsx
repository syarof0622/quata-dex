import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { newsImpact } from "@/lib/news-impact.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Newspaper, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/news")({
  head: () => ({
    meta: [
      { title: "News & Impact — Quanta Terminal" },
      { name: "description", content: "Headline sentiment + event impact scoring with measured price reactions." },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  const [symbol, setSymbol] = useState("");
  const [active, setActive] = useState<string | undefined>(undefined);

  const news = useQuery({
    queryKey: ["news-impact", active ?? "_"],
    queryFn: () => newsImpact({ data: { symbol: active } }),
    refetchInterval: 60_000,
  });

  const apply = () => setActive(symbol.trim().toUpperCase() || undefined);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Newspaper className="size-5 text-primary" /> News &amp; Impact
          </h1>
          <p className="text-sm text-muted-foreground">
            Sentiment + event impact scoring{active ? <> for <span className="text-foreground font-mono">{active}</span></> : null}.
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="flex gap-2">
          <Input
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            placeholder="Filter by ticker (e.g. NVDA, BBCA.JK)"
            className="w-64"
          />
          <Button type="submit" variant="outline">Apply</Button>
          {active && <Button type="button" variant="ghost" onClick={() => { setSymbol(""); setActive(undefined); }}>Clear</Button>}
        </form>
      </div>

      {/* Score gauges */}
      <div className="grid md:grid-cols-3 gap-3">
        <ScoreCard
          title="Sentiment"
          value={news.data?.sentimentScore ?? 0}
          label={news.data?.label ?? "—"}
          range={[-100, 100]}
          tone={news.data ? (news.data.sentimentScore > 10 ? "bull" : news.data.sentimentScore < -10 ? "bear" : "neutral") : "neutral"}
        />
        <ScoreCard
          title="Impact Index"
          value={news.data?.impactIndex ?? 0}
          label={news.data?.impactLabel ?? "—"}
          range={[0, 100]}
          tone={news.data ? (news.data.impactIndex >= 60 ? "bull" : news.data.impactIndex >= 35 ? "neutral" : "muted") : "muted"}
        />
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground">Distribution</div>
          <div className="mt-3 space-y-2 text-sm">
            <Row icon={<TrendingUp className="size-4 text-bull" />} label="Positive" v={news.data?.counts.positive ?? 0} />
            <Row icon={<Minus className="size-4 text-muted-foreground" />} label="Neutral" v={news.data?.counts.neutral ?? 0} />
            <Row icon={<TrendingDown className="size-4 text-bear" />} label="Negative" v={news.data?.counts.negative ?? 0} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="grid md:grid-cols-2 gap-3">
        {news.isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel p-4 animate-pulse h-28" />
        ))}
        {(news.data?.items ?? []).map((n, i) => (
          <a
            key={n.link ?? i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="panel p-4 hover:border-primary/40 transition-colors block"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium leading-snug">{n.title}</div>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                n.sentiment === "positive" ? "bg-bull-soft text-bull" :
                n.sentiment === "negative" ? "bg-bear-soft text-bear" :
                "bg-accent/40 text-muted-foreground"
              }`}>{n.sentiment.toUpperCase()}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {n.publisher}{n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleString()}` : ""}
            </div>
            <div className="mt-2 flex items-center flex-wrap gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                <Activity className="inline size-3 mr-0.5" />impact {n.impact}
              </span>
              {n.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-muted-foreground capitalize">{t}</span>
              ))}
              {n.priceReactionPct !== null && n.priceReactionPct !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  n.priceReactionPct > 0 ? "bg-bull-soft text-bull" :
                  n.priceReactionPct < 0 ? "bg-bear-soft text-bear" :
                  "bg-accent/40 text-muted-foreground"
                }`}>
                  next-bar {n.priceReactionPct > 0 ? "+" : ""}{n.priceReactionPct}%
                </span>
              )}
            </div>
          </a>
        ))}
        {!news.isLoading && (news.data?.items?.length ?? 0) === 0 && (
          <div className="panel p-8 text-center text-muted-foreground md:col-span-2">No news found.</div>
        )}
      </div>

      {active && (
        <div className="text-xs text-muted-foreground">
          <Link to="/chart/$symbol" params={{ symbol: active }} className="text-primary hover:underline">
            Open {active} chart →
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, v }: { icon: React.ReactNode; label: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="font-mono">{v}</div>
    </div>
  );
}

function ScoreCard({ title, value, label, range, tone }: {
  title: string; value: number; label: string; range: [number, number]; tone: "bull" | "bear" | "neutral" | "muted";
}) {
  const [min, max] = range;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const barColor = tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : "bg-primary";
  const tagColor =
    tone === "bull" ? "bg-bull-soft text-bull" :
    tone === "bear" ? "bg-bear-soft text-bear" :
    tone === "muted" ? "bg-accent/40 text-muted-foreground" :
    "bg-primary/10 text-primary";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{title}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${tagColor}`}>{label}</span>
      </div>
      <div className="mt-2 font-mono text-3xl">{value}</div>
      <div className="mt-3 h-1.5 rounded bg-accent/40 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}
