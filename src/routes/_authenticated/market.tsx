import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { getMovers, getNews, getSparklines } from "@/lib/market.functions";
import { sectorPerformance, marketBreadth } from "@/lib/screener.functions";
import { formatPct, formatCompact, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { displaySymbol } from "@/lib/display-symbol";
import { Button } from "@/components/ui/button";
import { Activity, ArrowDownRight, ArrowUpRight, Newspaper } from "lucide-react";
import { MobileEmptyState, MobileSkeletonRows } from "@/components/mobile-ui";
import { PageHero } from "@/components/ui/page-hero";
import { Sparkline } from "@/components/Sparkline";

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

  const fetchSparks = useServerFn(getSparklines);
  const heatSymbols = useMemo(
    () => (movers.data?.all ?? []).map((q: any) => q.symbol).slice(0, 120),
    [movers.data],
  );
  const sparks = useQuery({
    queryKey: ["mkt-heatmap-sparks", market, heatSymbols.join(",")],
    queryFn: () => fetchSparks({ data: { symbols: heatSymbols, range: "1d" } }),
    enabled: heatSymbols.length > 0,
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <PageHero
        eyebrow="Intelijen Pasar Langsung"
        live
        icon={Activity}
        title="Denyut Pasar"
        subtitle="Rotasi sektor, keluasan pasar, dan rezim risiko"
        actions={
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-card/40">
            {(["idx", "us", "global"] as const).map(m => (
              <Button key={m} size="sm" variant={market === m ? "default" : "ghost"} onClick={() => setMarket(m)} className="h-7 px-2.5 text-[11.5px]">
                {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
              </Button>
            ))}
          </div>
        }
      />


      {/* Breadth */}
      {breadth.data ? (
        <div className="panel p-3 md:p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
          <div>
            <div className="text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground">Regime</div>
            <div className={`text-base md:text-lg font-semibold ${breadth.data.tone === "Risk-On" ? "text-bull" : breadth.data.tone === "Risk-Off" ? "text-bear" : ""}`}>
              {breadth.data.tone}
            </div>
          </div>
          <Stat label="Advancing" value={breadth.data.up} tone="bull" />
          <Stat label="Declining" value={breadth.data.down} tone="bear" />
          <Stat label="Flat" value={breadth.data.flat} />
          <div>
            <div className="text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground">A/D ratio</div>
            <div className="font-mono text-base md:text-lg">{(breadth.data.up / Math.max(1, breadth.data.down)).toFixed(2)}</div>
          </div>
          <div className="col-span-2 md:col-span-5">
            <div className="h-1.5 md:h-2 rounded-full bg-accent/40 overflow-hidden flex">
              <div className="h-full bg-bull" style={{ width: `${(breadth.data.up / Math.max(1, breadth.data.total)) * 100}%` }} />
              <div className="h-full bg-muted-foreground/30" style={{ width: `${(breadth.data.flat / Math.max(1, breadth.data.total)) * 100}%` }} />
              <div className="h-full bg-bear" style={{ width: `${(breadth.data.down / Math.max(1, breadth.data.total)) * 100}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="panel p-3 md:p-4"><MobileSkeletonRows rows={2} height={22} /></div>
      )}

      {/* Sector performance — horizontal scroll on mobile */}
      <div className="panel p-3 md:p-4">
        <h3 className="font-semibold text-[13.5px] md:text-base mb-2 md:mb-3">Sector Rotation</h3>
        {sectors.isLoading ? (
          <MobileSkeletonRows rows={3} height={72} />
        ) : (sectors.data ?? []).length === 0 ? (
          <MobileEmptyState title="Sector data unavailable" hint="Awaiting breadth calculation." />
        ) : (
          <div className="-mx-1 px-1 md:mx-0 md:px-0">
            <div className="flex md:grid md:grid-cols-3 lg:grid-cols-5 gap-2 overflow-x-auto no-scrollbar">
              {(sectors.data ?? []).map(s => {
                const intensity = Math.min(1, Math.abs(s.avgPct) / 3);
                const bg = s.avgPct >= 0
                  ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.6})`
                  : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.6})`;
                return (
                  <div key={s.sector} style={{ backgroundColor: bg }} className="rounded-lg p-2.5 md:p-3 shrink-0 min-w-[44vw] md:min-w-0">
                    <div className="font-semibold text-[12.5px] md:text-sm truncate">{s.sector}</div>
                    <div className="font-mono text-[15px] md:text-base mt-0.5">{formatPct(s.avgPct)}</div>
                    <div className="text-[10px] mt-0.5 opacity-80">
                      {s.count} stocks · breadth {(s.breadth * 100).toFixed(0)}%
                    </div>
                    {s.topGainer && (
                      <div className="text-[10px] mt-0.5 opacity-80 truncate">▲ {displaySymbol(s.topGainer.symbol)} {formatPct(s.topGainer.pct)}</div>
                    )}
                    {s.topLoser && s.topLoser.symbol !== s.topGainer?.symbol && (
                      <div className="text-[10px] opacity-80 truncate">▼ {displaySymbol(s.topLoser.symbol)} {formatPct(s.topLoser.pct)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="panel p-3 md:p-4">
        <h3 className="font-semibold text-[13.5px] md:text-base mb-2 md:mb-3">Stock Heatmap</h3>
        {(movers.data?.all ?? []).length === 0 ? (
          <MobileEmptyState title="Heatmap data unavailable" hint="Awaiting market feed." />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-1.5">
            {(movers.data?.all ?? []).map(q => {
              const pct = q.changePercent ?? 0;
              const intensity = Math.min(1, Math.abs(pct) / 5);
              const bg = pct >= 0
                ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.6})`
                : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.6})`;
              const closes = sparks.data?.[q.symbol] ?? [];
              return (
                <Link key={q.symbol} to="/chart/$symbol" params={{ symbol: q.symbol }}
                      style={{ backgroundColor: bg }}
                      className="group rounded-md p-1.5 md:p-2 text-[10.5px] md:text-xs hover:ring-1 hover:ring-primary transition flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <div className="font-semibold truncate">{displaySymbol(q.symbol)}</div>
                    <div className="font-mono shrink-0 text-[10px] md:text-[11px]">{formatPct(pct)}</div>
                  </div>
                  <div className="-mx-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                    <Sparkline values={closes} positive={pct >= 0} height={22} />
                  </div>
                  <div className="text-[9.5px] md:text-[10px] opacity-70 font-mono truncate">{formatCompact(q.marketCap ?? undefined)}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Top gainers/losers + news */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="panel p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight className="size-4 text-bull" /><h3 className="font-semibold text-[13.5px] md:text-base">Top Gainers</h3></div>
          {(movers.data?.gainers ?? []).length === 0 ? (
            <MobileSkeletonRows rows={4} />
          ) : (
            <ul className="divide-y divide-border/60">
              {(movers.data?.gainers ?? []).slice(0, 6).map(q => (
                <li key={q.symbol}>
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-1.5 hover:bg-accent/40 rounded px-1 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] md:text-sm truncate">{displaySymbol(q.symbol)}</div>
                      <div className="text-[10.5px] md:text-xs text-muted-foreground truncate">{q.shortName}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-[12px] md:text-sm">{formatLocalPrice(q.symbol, q.price)}</div>
                      <div className={`text-[10.5px] md:text-xs ${colorForChange(q.changePercent)}`}>{formatPct(q.changePercent)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowDownRight className="size-4 text-bear" /><h3 className="font-semibold text-[13.5px] md:text-base">Top Losers</h3></div>
          {(movers.data?.losers ?? []).length === 0 ? (
            <MobileSkeletonRows rows={4} />
          ) : (
            <ul className="divide-y divide-border/60">
              {(movers.data?.losers ?? []).slice(0, 6).map(q => (
                <li key={q.symbol}>
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-1.5 hover:bg-accent/40 rounded px-1 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] md:text-sm truncate">{displaySymbol(q.symbol)}</div>
                      <div className="text-[10.5px] md:text-xs text-muted-foreground truncate">{q.shortName}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-[12px] md:text-sm">{formatLocalPrice(q.symbol, q.price)}</div>
                      <div className={`text-[10.5px] md:text-xs ${colorForChange(q.changePercent)}`}>{formatPct(q.changePercent)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-3 md:p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2"><Newspaper className="size-4 text-primary" /><h3 className="font-semibold text-[13.5px] md:text-base">Latest News</h3></div>
          {(news.data ?? []).length === 0 ? (
            <MobileSkeletonRows rows={4} height={32} />
          ) : (
            <ul className="space-y-2.5">
              {(news.data ?? []).slice(0, 8).map((n: any, i: number) => (
                <li key={i}>
                  <a href={n.link} target="_blank" rel="noreferrer" className="block hover:opacity-80">
                    <div className="text-[12.5px] md:text-sm leading-snug line-clamp-2">{n.title}</div>
                    <div className="text-[10.5px] md:text-xs text-muted-foreground mt-0.5">{n.publisher}</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "bull" | "bear" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "";
  return (
    <div>
      <div className="text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-base md:text-lg ${cls}`}>{value}</div>
    </div>
  );
}
