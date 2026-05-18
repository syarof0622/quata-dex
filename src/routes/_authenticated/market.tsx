import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMovers, getNews } from "@/lib/market.functions";
import { sectorPerformance, marketBreadth } from "@/lib/screener.functions";
import { formatPct, formatCompact, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { Button } from "@/components/ui/button";
import { Activity, ArrowDownRight, ArrowUpRight, Newspaper } from "lucide-react";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({ meta: [{ title: "Market — Quanta Terminal" }] }),
  component: MarketPage,
});

function MarketPage() {
  const [market, setMarket] = useState<"idx" | "us" | "global">("idx");
  const movers = useQuery({
    queryKey: ["movers", market],
    queryFn: () => getMovers({ data: { market } }),
    refetchInterval: 30_000,
  });
  const sectors = useQuery({
    queryKey: ["sector-perf", market],
    queryFn: () => sectorPerformance({ data: { market } }),
    refetchInterval: 60_000,
  });
  const breadth = useQuery({
    queryKey: ["breadth", market],
    queryFn: () => marketBreadth({ data: { market } }),
    refetchInterval: 60_000,
  });
  const news = useQuery({ queryKey: ["mkt-news", market], queryFn: () => getNews({ data: { market } }), refetchInterval: 60_000 });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Activity className="size-5" /> Market Pulse</h1>
          <p className="text-sm text-muted-foreground">Sector rotation, breadth & risk regime</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["idx", "us", "global"] as const).map(m => (
            <Button key={m} size="sm" variant={market === m ? "default" : "ghost"} onClick={() => setMarket(m)} className="h-7 px-3">
              {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
            </Button>
          ))}
        </div>
      </div>

      {/* Breadth */}
      {breadth.data && (
        <div className="panel p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
          <div>
            <div className="text-xs text-muted-foreground">Regime</div>
            <div className={`text-lg font-semibold ${breadth.data.tone === "Risk-On" ? "text-bull" : breadth.data.tone === "Risk-Off" ? "text-bear" : ""}`}>
              {breadth.data.tone}
            </div>
          </div>
          <Stat label="Advancing" value={breadth.data.up} tone="bull" />
          <Stat label="Declining" value={breadth.data.down} tone="bear" />
          <Stat label="Flat" value={breadth.data.flat} />
          <div>
            <div className="text-xs text-muted-foreground">A/D ratio</div>
            <div className="font-mono text-lg">{(breadth.data.up / Math.max(1, breadth.data.down)).toFixed(2)}</div>
          </div>
          {/* breadth bar */}
          <div className="md:col-span-5">
            <div className="h-2 rounded-full bg-accent/40 overflow-hidden flex">
              <div className="h-full bg-bull" style={{ width: `${(breadth.data.up / Math.max(1, breadth.data.total)) * 100}%` }} />
              <div className="h-full bg-muted-foreground/30" style={{ width: `${(breadth.data.flat / Math.max(1, breadth.data.total)) * 100}%` }} />
              <div className="h-full bg-bear" style={{ width: `${(breadth.data.down / Math.max(1, breadth.data.total)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Sector performance */}
      <div className="panel p-4">
        <h3 className="font-semibold mb-3">Sector Rotation</h3>
        {sectors.isLoading ? (
          <div className="text-sm text-muted-foreground">Computing…</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {(sectors.data ?? []).map(s => {
              const intensity = Math.min(1, Math.abs(s.avgPct) / 3);
              const bg = s.avgPct >= 0
                ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.6})`
                : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.6})`;
              return (
                <div key={s.sector} style={{ backgroundColor: bg }} className="rounded-md p-3">
                  <div className="font-semibold text-sm">{s.sector}</div>
                  <div className="font-mono text-base mt-1">{formatPct(s.avgPct)}</div>
                  <div className="text-[10px] mt-1 opacity-80">
                    {s.count} stocks · breadth {(s.breadth * 100).toFixed(0)}%
                  </div>
                  {s.topGainer && (
                    <div className="text-[10px] mt-1 opacity-80 truncate">▲ {s.topGainer.symbol} {formatPct(s.topGainer.pct)}</div>
                  )}
                  {s.topLoser && s.topLoser.symbol !== s.topGainer?.symbol && (
                    <div className="text-[10px] opacity-80 truncate">▼ {s.topLoser.symbol} {formatPct(s.topLoser.pct)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="panel p-4">
        <h3 className="font-semibold mb-3">Stock Heatmap</h3>
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-1.5">
          {(movers.data?.all ?? []).map(q => {
            const pct = q.changePercent ?? 0;
            const intensity = Math.min(1, Math.abs(pct) / 5);
            const bg = pct >= 0
              ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.6})`
              : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.6})`;
            return (
              <Link key={q.symbol} to="/chart/$symbol" params={{ symbol: q.symbol }}
                    style={{ backgroundColor: bg }}
                    className="rounded p-2 text-xs hover:ring-1 hover:ring-primary transition">
                <div className="font-semibold">{q.symbol.replace(".JK", "")}</div>
                <div className="font-mono">{formatPct(pct)}</div>
                <div className="text-[10px] opacity-70 font-mono">{formatCompact(q.marketCap ?? undefined)}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Top gainers/losers + news */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><ArrowUpRight className="size-4 text-bull" /><h3 className="font-semibold">Top Gainers</h3></div>
          <ul className="divide-y divide-border">
            {(movers.data?.gainers ?? []).map(q => (
              <li key={q.symbol}>
                <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-2 hover:bg-accent/40 rounded px-1">
                  <div>
                    <div className="font-medium">{q.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[18ch]">{q.shortName}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>{formatLocalPrice(q.symbol, q.price)}</div>
                    <div className={`text-xs ${colorForChange(q.changePercent)}`}>{formatPct(q.changePercent)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><ArrowDownRight className="size-4 text-bear" /><h3 className="font-semibold">Top Losers</h3></div>
          <ul className="divide-y divide-border">
            {(movers.data?.losers ?? []).map(q => (
              <li key={q.symbol}>
                <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-2 hover:bg-accent/40 rounded px-1">
                  <div>
                    <div className="font-medium">{q.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[18ch]">{q.shortName}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>{formatLocalPrice(q.symbol, q.price)}</div>
                    <div className={`text-xs ${colorForChange(q.changePercent)}`}>{formatPct(q.changePercent)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><Newspaper className="size-4 text-primary" /><h3 className="font-semibold">Latest News</h3></div>
          <ul className="space-y-3">
            {(news.data ?? []).slice(0, 8).map((n: any, i: number) => (
              <li key={i}>
                <a href={n.link} target="_blank" rel="noreferrer" className="block hover:opacity-80">
                  <div className="text-sm leading-snug line-clamp-2">{n.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{n.publisher}</div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "bull" | "bear" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg ${cls}`}>{value}</div>
    </div>
  );
}
