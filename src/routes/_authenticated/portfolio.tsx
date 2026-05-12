import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolioAnalytics } from "@/lib/analytics.functions";
import { formatPrice, colorForChange, formatPct } from "@/lib/format";
import { formatLocalPrice, symbolMarket } from "@/lib/symbols";
import { Link } from "@tanstack/react-router";
import { Sparkline } from "@/routes/_authenticated/screener";
import { ShieldAlert, TrendingUp, Layers, Activity, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Quanta Terminal" }] }),
  component: Portfolio,
});

function fmt(symbol: string, n: number | null | undefined) {
  return symbolMarket(symbol) === "idx" ? formatLocalPrice(symbol, n) : "$" + formatPrice(n);
}

function Portfolio() {
  const a = useQuery({
    queryKey: ["portfolio-analytics"],
    queryFn: () => getPortfolioAnalytics(),
    refetchInterval: 15000,
  });

  if (a.isLoading) return <div className="p-6 text-muted-foreground">Loading analytics…</div>;
  const d = a.data;
  if (!d) return <div className="p-6 text-muted-foreground">No paper account yet.</div>;

  const num = (n: any, fb = 0) => (typeof n === "number" && isFinite(n) ? n : fb);
  const exposure = num(d.exposure);
  const concentration = num(d.concentration);
  const beta = num(d.beta, 1);
  const winRate = num(d.winRate);
  const totalTrades = num(d.totalTrades);
  const pnlPct = num(d.pnlPct);
  const equity = num(d.equity);
  const positions = Array.isArray(d.positions) ? d.positions : [];
  const sectorBreakdown = Array.isArray(d.sectorBreakdown) ? d.sectorBreakdown : [];
  const curve = Array.isArray(d.curve) ? d.curve : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Risk Analytics</h1>
        <p className="text-sm text-muted-foreground">Real-time exposure, P&L breakdown & risk metrics</p>
      </div>

      {/* Top stats */}
      <div className="grid md:grid-cols-6 gap-3">
        <Stat label="Equity" value={"$" + formatPrice(equity)} />
        <Stat label="Cash" value={"$" + formatPrice(num(d.cash))} />
        <Stat label="Holdings value" value={"$" + formatPrice(num(d.totalValue))} />
        <Stat label="Unrealized P/L" value={"$" + formatPrice(num(d.unrealized))} tone={num(d.unrealized) >= 0 ? "bull" : "bear"} />
        <Stat label="Realized P/L" value={"$" + formatPrice(num(d.realized))} tone={num(d.realized) >= 0 ? "bull" : "bear"} />
        <Stat label="Total return" value={formatPct(pnlPct)} tone={pnlPct >= 0 ? "bull" : "bear"} />
      </div>

      {/* Risk metrics */}
      <div className="grid md:grid-cols-4 gap-3">
        <RiskCard icon={<Layers className="size-4" />} label="Exposure" value={exposure.toFixed(1) + "%"}
          tone={exposure > 90 ? "bear" : exposure > 60 ? "warn" : "bull"}
          hint={exposure > 90 ? "Heavily invested — low cash buffer" : exposure > 60 ? "Healthy mix" : "Conservative"} />
        <RiskCard icon={<Target className="size-4" />} label="Top concentration" value={concentration.toFixed(1) + "%"}
          tone={concentration > 35 ? "bear" : concentration > 20 ? "warn" : "bull"}
          hint={concentration > 35 ? "Single position dominates equity" : "Diversified"} />
        <RiskCard icon={<Activity className="size-4" />} label="Beta vs JKSE" value={beta.toFixed(2)}
          tone={Math.abs(beta - 1) < 0.3 ? "warn" : beta > 1.3 ? "bear" : "bull"}
          hint={beta > 1.3 ? "Aggressive — moves more than market" : beta < 0.7 ? "Defensive" : "Tracks market"} />
        <RiskCard icon={<TrendingUp className="size-4" />} label="Win rate" value={winRate.toFixed(0) + "%"}
          tone={winRate >= 55 ? "bull" : winRate >= 45 ? "warn" : "bear"}
          hint={`${totalTrades} closed trades`} />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {/* Equity curve */}
        <div className="panel p-4 md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Equity curve</h3>
            <span className={`font-mono text-sm ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
              {formatPct(pnlPct)} since start
            </span>
          </div>
          {curve.length > 1 ? (
            <Sparkline values={curve.map((c: any) => num(c.equity))} bull={pnlPct >= 0} width={600} height={120} />
          ) : (
            <div className="text-sm text-muted-foreground py-10 text-center">Place a few trades to build your equity curve.</div>
          )}
        </div>

        {/* Sector exposure */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3">Sector exposure</h3>
          {sectorBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">No positions.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {sectorBreakdown.map((s: any) => (
                <li key={s.sector}>
                  <div className="flex justify-between text-xs">
                    <span>{s.sector}</span>
                    <span className="text-muted-foreground font-mono">{num(s.pct).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-accent/40 mt-1 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, num(s.pct))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Holdings table */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <h3 className="font-semibold">Holdings</h3>
          {concentration > 35 && (
            <span className="text-xs text-bear flex items-center gap-1"><ShieldAlert className="size-3" /> Concentration risk</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Sector</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-right p-2">Avg</th>
              <th className="text-right p-2">Last</th>
              <th className="text-right p-2">Value</th>
              <th className="text-right p-2">Unrealized P/L</th>
              <th className="text-right p-2">Weight</th>
              <th className="text-right p-2">Realized</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p: any) => (
              <tr key={p.symbol} className="border-t border-border">
                <td className="p-2 font-medium"><Link to="/chart/$symbol" params={{ symbol: p.symbol }} className="hover:text-primary">{p.symbol}</Link></td>
                <td className="p-2 text-xs text-muted-foreground">{p.sector}</td>
                <td className="p-2 text-right font-mono">{p.qty}</td>
                <td className="p-2 text-right font-mono">{fmt(p.symbol, p.avg)}</td>
                <td className="p-2 text-right font-mono">{fmt(p.symbol, p.last)}</td>
                <td className="p-2 text-right font-mono">${formatPrice(p.value)}</td>
                <td className={`p-2 text-right font-mono ${colorForChange(p.pnl)}`}>${formatPrice(p.pnl)} ({formatPct(p.pnlPct)})</td>
                <td className="p-2 text-right font-mono text-xs text-muted-foreground">{equity ? ((num(p.value) / equity) * 100).toFixed(1) : "0"}%</td>
                <td className="p-2 text-right font-mono text-xs">${formatPrice(d.perSymbol?.[p.symbol]?.realized ?? 0)}</td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No holdings yet. Buy a paper position from any chart.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-2xl ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function RiskCard({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: string; tone: "bull" | "bear" | "warn"; hint: string }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-amber-400";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">{icon} {label}</span>
      </div>
      <div className={`font-mono text-2xl mt-1 ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
