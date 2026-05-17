import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listNews, getMarketSentiment, getSourcesStatus, refreshNewsNow } from "@/lib/news.functions";
import { serpapiStatus } from "@/lib/serpapi.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Newspaper, TrendingUp, TrendingDown, Minus, Activity, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/news")({
  head: () => ({
    meta: [
      { title: "News & Sentiment — Quanta Terminal" },
      { name: "description", content: "Indonesian stock market news aggregator with sentiment & impact scoring from multiple sources." },
    ],
  }),
  component: NewsHub,
});

const SOURCES = [
  { id: "", label: "All sources" },
  { id: "kontan", label: "Kontan" },
  { id: "cnbc_market", label: "CNBC" },
  { id: "antara", label: "ANTARA" },
  { id: "investor_id", label: "Investor.id" },
  { id: "google_news", label: "Google News" },
];

function NewsHub() {
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [sentiment, setSentiment] = useState<"" | "positive" | "neutral" | "negative">("");
  const [impact, setImpact] = useState<"" | "low" | "medium" | "high">("");
  const [ticker, setTicker] = useState("");
  const [search, setSearch] = useState("");

  const filterArgs = {
    limit: 60,
    source: source || undefined,
    sentiment: (sentiment || undefined) as any,
    impactLevel: (impact || undefined) as any,
    ticker: ticker.trim() || undefined,
    search: search.trim() || undefined,
  };

  const news = useQuery({
    queryKey: ["news-list", filterArgs],
    queryFn: () => listNews({ data: filterArgs }),
    refetchInterval: 60_000,
  });
  const sentimentQ = useQuery({
    queryKey: ["market-sentiment"],
    queryFn: () => getMarketSentiment({ data: undefined as any }),
    refetchInterval: 60_000,
  });
  const sources = useQuery({
    queryKey: ["news-sources-status"],
    queryFn: () => getSourcesStatus({ data: undefined as any }),
    refetchInterval: 60_000,
  });

  const serpStatus = useQuery({
    queryKey: ["serpapi-status"],
    queryFn: () => serpapiStatus({ data: undefined as any }),
    refetchInterval: 120_000,
  });

  const refreshFn = useServerFn(refreshNewsNow);
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news-list"] });
      qc.invalidateQueries({ queryKey: ["market-sentiment"] });
      qc.invalidateQueries({ queryKey: ["news-sources-status"] });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Newspaper className="size-5 text-primary" /> News &amp; Market Sentiment
          </h1>
          <p className="text-sm text-muted-foreground">
            Berita saham IDX dari Kontan, CNBC, ANTARA, Investor.id, dan Google News — auto-deduplicate, sentiment &amp; impact scoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {serpStatus.data && (
            <span className={`text-[10px] px-2 py-1 rounded font-medium border ${
              !serpStatus.data.enabled ? "border-border text-muted-foreground" :
              serpStatus.data.quotaBlocked ? "border-bear/40 bg-bear-soft text-bear" :
              "border-primary/40 bg-primary/10 text-primary"
            }`} title={serpStatus.data.enabled ? `SerpApi credits used ${serpStatus.data.used}/${serpStatus.data.limit}` : "SerpApi disabled"}>
              {!serpStatus.data.enabled
                ? "SerpApi: off"
                : serpStatus.data.quotaBlocked
                ? "SerpApi quota protection"
                : `Enhanced by SerpApi · ${serpStatus.data.remaining} left`}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh now
          </Button>
        </div>
      </div>

      {/* Sentiment overview */}
      <div className="grid md:grid-cols-3 gap-3">
        <ScoreCard
          title="Market Sentiment (24h)"
          value={sentimentQ.data?.sentimentScore ?? 0}
          label={sentimentQ.data?.label ?? "—"}
          range={[-100, 100]}
          tone={(sentimentQ.data?.sentimentScore ?? 0) > 10 ? "bull" : (sentimentQ.data?.sentimentScore ?? 0) < -10 ? "bear" : "neutral"}
        />
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground">Distribusi (24h)</div>
          <div className="mt-3 space-y-2 text-sm">
            <Row icon={<TrendingUp className="size-4 text-bull" />} label="Positive" v={sentimentQ.data?.counts.positive ?? 0} />
            <Row icon={<Minus className="size-4 text-muted-foreground" />} label="Neutral" v={sentimentQ.data?.counts.neutral ?? 0} />
            <Row icon={<TrendingDown className="size-4 text-bear" />} label="Negative" v={sentimentQ.data?.counts.negative ?? 0} />
            <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Activity className="size-3" /> High impact</span>
              <span className="font-mono">{sentimentQ.data?.highImpactCount ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground mb-2">Top tickers (24h)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-bull mb-1">Bullish</div>
              <ul className="space-y-1 text-sm">
                {(sentimentQ.data?.topPositive ?? []).map(t => (
                  <li key={t.symbol} className="flex items-center justify-between">
                    <Link to="/chart/$symbol" params={{ symbol: t.symbol }} className="font-mono text-xs hover:text-primary">{t.symbol}</Link>
                    <span className="text-bull font-mono text-xs">+{t.score.toFixed(2)}</span>
                  </li>
                ))}
                {(sentimentQ.data?.topPositive ?? []).length === 0 && <li className="text-xs text-muted-foreground">—</li>}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-bear mb-1">Bearish</div>
              <ul className="space-y-1 text-sm">
                {(sentimentQ.data?.topNegative ?? []).map(t => (
                  <li key={t.symbol} className="flex items-center justify-between">
                    <Link to="/chart/$symbol" params={{ symbol: t.symbol }} className="font-mono text-xs hover:text-primary">{t.symbol}</Link>
                    <span className="text-bear font-mono text-xs">{t.score.toFixed(2)}</span>
                  </li>
                ))}
                {(sentimentQ.data?.topNegative ?? []).length === 0 && <li className="text-xs text-muted-foreground">—</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Source health */}
      <div className="panel p-4">
        <div className="text-xs text-muted-foreground mb-3">Source health</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(sources.data ?? []).map(s => {
            const ok = s.status === "active";
            return (
              <div key={s.id} className="rounded border border-border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  {ok ? <CheckCircle2 className="size-3.5 text-bull" /> : <AlertTriangle className="size-3.5 text-bear" />}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {ok ? `${s.articles_today ?? 0} hari ini` : (s.last_error?.slice(0, 40) ?? "no data")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {s.last_success_at ? `Last: ${new Date(s.last_success_at).toLocaleTimeString()}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <select value={source} onChange={e => setSource(e.target.value)} className="text-xs bg-background border border-border rounded px-2 py-1.5">
          {SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={sentiment} onChange={e => setSentiment(e.target.value as any)} className="text-xs bg-background border border-border rounded px-2 py-1.5">
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <select value={impact} onChange={e => setImpact(e.target.value as any)} className="text-xs bg-background border border-border rounded px-2 py-1.5">
          <option value="">All impact</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <Input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="Ticker e.g. BBCA.JK" className="w-44 h-8 text-xs" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title…" className="flex-1 min-w-[180px] h-8 text-xs" />
        {(source || sentiment || impact || ticker || search) && (
          <Button size="sm" variant="ghost" onClick={() => { setSource(""); setSentiment(""); setImpact(""); setTicker(""); setSearch(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Feed */}
      <div className="grid md:grid-cols-2 gap-3">
        {news.isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel p-4 animate-pulse h-28" />
        ))}
        {!news.isLoading && (news.data ?? []).length === 0 && (
          <div className="panel p-8 text-center text-muted-foreground md:col-span-2">
            Belum ada berita. Klik <span className="font-medium">Refresh now</span> untuk mengambil data dari sumber.
          </div>
        )}
        {(news.data ?? []).map((n: any) => (
          <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
             className="panel p-4 hover:border-primary/40 transition-colors block">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium leading-snug">{n.title}</div>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                n.sentiment === "positive" ? "bg-bull-soft text-bull" :
                n.sentiment === "negative" ? "bg-bear-soft text-bear" :
                "bg-accent/40 text-muted-foreground"
              }`}>{n.sentiment.toUpperCase()}</span>
            </div>
            {n.summary && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.summary}</div>}
            <div className="text-[10px] text-muted-foreground mt-2">
              {n.source} · {new Date(n.published_at).toLocaleString()}
            </div>
            <div className="mt-2 flex items-center flex-wrap gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                n.impact_level === "high" ? "bg-primary/15 text-primary" :
                n.impact_level === "medium" ? "bg-accent/40 text-foreground" :
                "bg-accent/30 text-muted-foreground"
              }`}>
                <Activity className="inline size-3 mr-0.5" />impact {Math.round(n.impact_score)}
              </span>
              {(n.tickers ?? []).slice(0, 4).map((t: string) => (
                <Link key={t} to="/chart/$symbol" params={{ symbol: t }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono hover:bg-primary/20">
                  {t}
                </Link>
              ))}
              {(n.sectors ?? []).slice(0, 2).map((s: string) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-muted-foreground">{s}</span>
              ))}
            </div>
          </a>
        ))}
      </div>
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
  title: string; value: number; label: string; range: [number, number]; tone: "bull" | "bear" | "neutral";
}) {
  const [min, max] = range;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const barColor = tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : "bg-primary";
  const tagColor = tone === "bull" ? "bg-bull-soft text-bull" : tone === "bear" ? "bg-bear-soft text-bear" : "bg-primary/10 text-primary";
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
