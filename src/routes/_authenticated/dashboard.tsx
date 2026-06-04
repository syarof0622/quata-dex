import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { getIndices, getMovers, getNews, getSparklines } from "@/lib/market.functions";
import { motion } from "framer-motion";
import { formatCompact, formatPct, formatPrice, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { displaySymbol } from "@/lib/display-symbol";
import { ArrowDownRight, ArrowUpRight, Newspaper, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileEmptyState, MobileSkeletonRows } from "@/components/mobile-ui";
import { PageHero } from "@/components/ui/page-hero";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Quanta Terminal" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [market, setMarket] = useState<"idx" | "us" | "global">("idx");
  const indices = useQuery({ queryKey: ["indices"], queryFn: () => getIndices(), refetchInterval: 5000, refetchIntervalInBackground: false });
  const movers = useQuery({
    queryKey: ["movers", market],
    queryFn: () => getMovers({ data: { market } }),
    refetchInterval: 30000,
  });
  const news = useQuery({ queryKey: ["news", market], queryFn: () => getNews({ data: { market } }), refetchInterval: 60000 });

  const gainers = movers.data?.gainers ?? [];
  const losers = movers.data?.losers ?? [];
  const newsItems = news.data ?? [];

  // Live mini-chart per symbol in the heatmap. Batched server fn so we don't
  // fan out one request per ticker. Refreshes alongside the heatmap movers.
  const fetchSparks = useServerFn(getSparklines);
  const heatSymbols = useMemo(
    () => (movers.data?.all ?? []).map((q: any) => q.symbol).slice(0, 120),
    [movers.data],
  );
  const sparks = useQuery({
    queryKey: ["heatmap-sparks", market, heatSymbols.join(",")],
    queryFn: () => fetchSparks({ data: { symbols: heatSymbols, range: "1d" } }),
    enabled: heatSymbols.length > 0,
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  // Live sparklines for the top indices row.
  const indexSymbols = useMemo(
    () => (indices.data ?? []).map((q: any) => q.symbol).filter(Boolean),
    [indices.data],
  );
  const indexSparks = useQuery({
    queryKey: ["index-sparks", indexSymbols.join(",")],
    queryFn: () => fetchSparks({ data: { symbols: indexSymbols, range: "1d" } }),
    enabled: indexSymbols.length > 0,
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const marketToggle = (
    <div className="inline-flex rounded-lg border border-border p-0.5 bg-card/40">
      {(["idx", "us", "global"] as const).map(m => (
        <Button key={m} size="sm" variant={market === m ? "default" : "ghost"} onClick={() => setMarket(m)} className="h-7 px-2.5 text-[11.5px]">
          {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <PageHero
        eyebrow="Pusat Kendali"
        live
        icon={TrendingUp}
        title="Dasbor Pasar"
        subtitle="Ringkasan real-time · IDX, indeks, mover, dan berita"
        actions={marketToggle}
      />

      {/* Indices — horizontal scroll on mobile, grid on md+ */}
      <div className="-mx-3 md:mx-0 px-3 md:px-0">
        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3 overflow-x-auto no-scrollbar pb-1">
          {(indices.data ?? Array.from({ length: 6 })).map((q: any, i: number) => {
            const closes = q ? indexSparks.data?.[q.symbol] ?? [] : [];
            return (
              <Link key={q?.symbol ?? i} to={q ? "/chart/$symbol" : "/dashboard"} params={q ? { symbol: q.symbol } : undefined as any}
                    className="panel p-3 hover:border-primary/40 transition-colors shrink-0 min-w-[44vw] md:min-w-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10.5px] md:text-xs text-muted-foreground uppercase tracking-wider truncate">{q?.shortName ?? "—"}</div>
                    <div className="font-mono text-[15px] md:text-lg mt-1">{q ? formatPrice(q.price) : "—"}</div>
                    <div className={`text-[11px] md:text-xs font-mono ${colorForChange(q?.changePercent)}`}>{q ? formatPct(q.changePercent) : "—"}</div>
                  </div>
                  <div className="shrink-0 self-stretch flex items-center w-[72px] md:w-[84px]">
                    <Sparkline values={closes} positive={(q?.changePercent ?? 0) >= 0} height={34} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Movers + News */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {/* Gainers */}
        <div className="panel p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight className="size-4 text-bull" /><h3 className="font-semibold text-[13.5px] md:text-base">Top Gainers</h3></div>
          {movers.isLoading ? (
            <MobileSkeletonRows rows={4} />
          ) : gainers.length === 0 ? (
            <MobileEmptyState icon={<TrendingUp className="size-5" />} title="No movers yet" hint="Data will load once the market feed updates." />
          ) : (
            <ul className="divide-y divide-border/60">
              {gainers.slice(0, 6).map(q => (
                <li key={q.symbol}>
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-1.5 hover:bg-accent/40 rounded px-1 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] md:text-sm truncate">{displaySymbol(q.symbol)}</div>
                      <div className="text-[10.5px] md:text-xs text-muted-foreground truncate">{q.shortName}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-[12px] md:text-sm">{formatLocalPrice(q.symbol, q.price)}</div>
                      <div className={colorForChange(q.changePercent) + " text-[10.5px] md:text-xs"}>{formatPct(q.changePercent)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Losers */}
        <div className="panel p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowDownRight className="size-4 text-bear" /><h3 className="font-semibold text-[13.5px] md:text-base">Top Losers</h3></div>
          {movers.isLoading ? (
            <MobileSkeletonRows rows={4} />
          ) : losers.length === 0 ? (
            <MobileEmptyState icon={<TrendingUp className="size-5 rotate-180" />} title="No movers yet" hint="Data will load once the market feed updates." />
          ) : (
            <ul className="divide-y divide-border/60">
              {losers.slice(0, 6).map(q => (
                <li key={q.symbol}>
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-1.5 hover:bg-accent/40 rounded px-1 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] md:text-sm truncate">{displaySymbol(q.symbol)}</div>
                      <div className="text-[10.5px] md:text-xs text-muted-foreground truncate">{q.shortName}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-[12px] md:text-sm">{formatLocalPrice(q.symbol, q.price)}</div>
                      <div className={colorForChange(q.changePercent) + " text-[10.5px] md:text-xs"}>{formatPct(q.changePercent)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* News — full width on mobile (spans 2 cols), single col at lg */}
        <div className="panel p-3 md:p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2"><Newspaper className="size-4 text-primary" /><h3 className="font-semibold text-[13.5px] md:text-base">Latest News</h3></div>
          {news.isLoading ? (
            <MobileSkeletonRows rows={4} height={32} />
          ) : newsItems.length === 0 ? (
            <MobileEmptyState icon={<Newspaper className="size-5" />} title="No news yet" />
          ) : (
            <ul className="space-y-2.5">
              {newsItems.slice(0, 6).map((n: any, i: number) => (
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

      {/* Heatmap mini */}
      <div className="panel p-3 md:p-4">
        <div className="flex items-center justify-between mb-2 md:mb-3 gap-2">
          <h3 className="font-semibold text-[13.5px] md:text-base">Market Heatmap</h3>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Live · intraday
          </div>
        </div>
        {(movers.data?.all ?? []).length === 0 ? (
          <MobileEmptyState title="Heatmap data unavailable" hint="Awaiting market feed." />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-1.5">
            {(movers.data?.all ?? []).map(q => {
              const pct = q.changePercent ?? 0;
              const intensity = Math.min(1, Math.abs(pct) / 5);
              const bg = pct >= 0
                ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.55})`
                : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.55})`;
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
    </div>
  );
}
