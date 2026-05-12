import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getIndices, getMovers, getNews } from "@/lib/market.functions";
import { motion } from "framer-motion";
import { formatCompact, formatPct, formatPrice, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { ArrowDownRight, ArrowUpRight, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Quanta Terminal" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [market, setMarket] = useState<"idx" | "us" | "global">("idx");
  const indices = useQuery({ queryKey: ["indices"], queryFn: () => getIndices(), refetchInterval: 15000 });
  const movers = useQuery({
    queryKey: ["movers", market],
    queryFn: () => getMovers({ data: { market } }),
    refetchInterval: 30000,
  });
  const news = useQuery({ queryKey: ["news", "_"], queryFn: () => getNews({ data: {} }), refetchInterval: 60000 });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Market Dashboard</h1>
          <p className="text-sm text-muted-foreground">Realtime overview · IDX, indices, movers, news</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["idx", "us", "global"] as const).map(m => (
            <Button key={m} size="sm" variant={market === m ? "default" : "ghost"} onClick={() => setMarket(m)} className="h-7 px-3">
              {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Indices */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(indices.data ?? Array.from({ length: 6 })).map((q: any, i: number) => (
          <Link key={q?.symbol ?? i} to={q ? "/chart/$symbol" : "/dashboard"} params={q ? { symbol: q.symbol } : undefined as any}
                className="panel p-3 hover:border-primary/40 transition-colors">
            <div className="text-xs text-muted-foreground">{q?.shortName ?? "—"}</div>
            <div className="font-mono text-lg mt-1">{q ? formatPrice(q.price) : "—"}</div>
            <div className={`text-xs font-mono ${colorForChange(q?.changePercent)}`}>{q ? formatPct(q.changePercent) : "—"}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Gainers */}
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><ArrowUpRight className="size-4 text-bull" /><h3 className="font-semibold">Top Gainers</h3></div>
          <ul className="divide-y divide-border">
            {(movers.data?.gainers ?? []).map(q => (
              <li key={q.symbol}>
                <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-2 hover:bg-accent/40 rounded px-1">
                  <div>
                    <div className="font-medium">{q.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[16ch]">{q.shortName}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>{formatLocalPrice(q.symbol, q.price)}</div>
                    <div className={colorForChange(q.changePercent) + " text-xs"}>{formatPct(q.changePercent)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Losers */}
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><ArrowDownRight className="size-4 text-bear" /><h3 className="font-semibold">Top Losers</h3></div>
          <ul className="divide-y divide-border">
            {(movers.data?.losers ?? []).map(q => (
              <li key={q.symbol}>
                <Link to="/chart/$symbol" params={{ symbol: q.symbol }} className="flex items-center justify-between py-2 hover:bg-accent/40 rounded px-1">
                  <div>
                    <div className="font-medium">{q.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[16ch]">{q.shortName}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>{formatLocalPrice(q.symbol, q.price)}</div>
                    <div className={colorForChange(q.changePercent) + " text-xs"}>{formatPct(q.changePercent)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* News */}
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><Newspaper className="size-4 text-primary" /><h3 className="font-semibold">Latest News</h3></div>
          <ul className="space-y-3">
            {(news.data ?? []).slice(0, 6).map((n: any, i: number) => (
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

      {/* Heatmap mini */}
      <div className="panel p-4">
        <h3 className="font-semibold mb-3">Market Heatmap</h3>
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-1.5">
          {(movers.data?.all ?? []).map(q => {
            const pct = q.changePercent ?? 0;
            const intensity = Math.min(1, Math.abs(pct) / 5);
            const bg = pct >= 0
              ? `oklch(0.74 0.18 150 / ${0.15 + intensity * 0.55})`
              : `oklch(0.65 0.23 27 / ${0.15 + intensity * 0.55})`;
            return (
              <Link key={q.symbol} to="/chart/$symbol" params={{ symbol: q.symbol }}
                    style={{ backgroundColor: bg }}
                    className="rounded p-2 text-xs hover:ring-1 hover:ring-primary transition">
                <div className="font-semibold">{q.symbol}</div>
                <div className="font-mono">{formatPct(pct)}</div>
                <div className="text-[10px] opacity-70 font-mono">{formatCompact(q.marketCap ?? undefined)}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
