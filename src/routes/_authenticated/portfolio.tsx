import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolioAnalytics } from "@/lib/analytics.functions";
import { colorForChange, formatPct, formatMoneyByCurrency, formatMoneyCompact } from "@/lib/format";
import { formatLocalPrice, symbolMarket } from "@/lib/symbols";
import { Link } from "@tanstack/react-router";
import { Sparkline } from "@/routes/_authenticated/screener";
import { ShieldAlert, TrendingUp, Layers, Activity, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Quanta Terminal" }] }),
  component: Portfolio,
});

/** Per-symbol share-price formatter. Uses local price units (IDR for IDX,
 *  USD-like for others) — distinct from account currency formatting. */
function priceFmt(symbol: string, n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  return symbolMarket(symbol) === "idx"
    ? formatLocalPrice(symbol, n)
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const currency = (d.currency ?? "IDR") as "IDR" | "USD";
  const money = (n: number | null | undefined) => formatMoneyByCurrency(currency, n);
  const moneyCompact = (n: number | null | undefined) => formatMoneyCompact(currency, n);

  const exposure = num(d.exposure);
  const concentration = num(d.concentration);
  const beta = d.beta == null ? null : num(d.beta, 0);
  const winRate = num(d.winRate);
  const totalTrades = num(d.totalTrades);
  const pnlPct = num(d.pnlPct);
  const totalReturnAmount = num(d.totalReturnAmount);
  const initialBalance = num(d.initialBalance);
  const equity = num(d.equity);
  const positions = Array.isArray(d.positions) ? d.positions : [];
  const sectorBreakdown = Array.isArray(d.sectorBreakdown) ? d.sectorBreakdown : [];
  const curve = Array.isArray(d.curve) ? d.curve : [];

  const hasPositions = positions.length > 0;
  const hasActivity = hasPositions || totalTrades > 0;
  const hasBaseline = initialBalance > 0;

  // Smarter concentration label
  const concentrationHint =
    positions.length === 0 ? "No positions"
      : positions.length === 1 ? "Single holding — concentrated by definition"
      : concentration > 35 ? "Single position dominates equity"
      : positions.length <= 3 ? "Concentrated across few names"
      : concentration > 25 ? "Moderate concentration"
      : "Diversified across holdings";
  const concentrationTone: "bull" | "bear" | "warn" =
    positions.length === 0 ? "warn"
      : positions.length === 1 ? "warn"
      : concentration > 35 ? "bear"
      : concentration > 25 ? "warn"
      : "bull";

  const exposureHint = !hasPositions
    ? "No positions"
    : exposure > 60 ? "High exposure — low cash buffer"
    : exposure >= 20 ? "Moderate exposure"
    : "Low exposure";

  const betaConfidenceOK = hasPositions && beta != null && (d.betaSamples ?? 0) >= 30;
  const betaHint = !hasPositions
    ? "Beta requires holdings"
    : !betaConfidenceOK ? "Not enough history for reliable beta"
    : beta! > 1.3 ? "Aggressive — moves more than market"
    : beta! < 0.7 ? "Defensive vs market"
    : "Tracks market";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Risk Analytics</h1>
          <p className="text-sm text-muted-foreground">Real-time exposure, P&amp;L breakdown &amp; risk metrics</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Currency <span className="font-mono text-foreground">{currency}</span></span>
          <span>·</span>
          <span>{positions.length} position{positions.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{totalTrades} closed trade{totalTrades === 1 ? "" : "s"}</span>
        </div>
      </div>

      {!hasActivity && (
        <div className="panel p-8 text-center space-y-3">
          <div className="text-lg font-semibold">No holdings yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Mulai dengan membuat paper trade dari halaman chart, atau gunakan screener untuk mencari kandidat saham.
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Link to="/screener" className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">Open Screener</Link>
            <Link to="/lab" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">Simulation Lab</Link>
            <Link to="/watchlist" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">Add Watchlist</Link>
          </div>
        </div>
      )}

      {/* Top stats — all use account currency */}
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Equity" value={money(equity)} title="Cash + current holdings value" />
        <Stat label="Cash" value={money(num(d.cash))} />
        <Stat label="Market Value" value={hasPositions ? money(num(d.totalValue)) : "—"} title="Current mark-to-market value of holdings" />
        <Stat
          label="Unrealized P/L"
          value={hasPositions ? money(num(d.unrealized)) : "—"}
          tone={hasPositions ? (num(d.unrealized) >= 0 ? "bull" : "bear") : undefined}
          title="P/L from positions still open"
        />
        <Stat
          label="Realized P/L"
          value={hasActivity ? money(num(d.realized)) : "—"}
          tone={hasActivity ? (num(d.realized) >= 0 ? "bull" : "bear") : undefined}
          title="P/L from positions already closed"
        />
        <Stat
          label="Total Return"
          value={hasBaseline ? formatPct(pnlPct) : "—"}
          sub={hasBaseline ? money(totalReturnAmount) : `Baseline: ${money(initialBalance)}`}
          tone={hasBaseline ? (pnlPct >= 0 ? "bull" : "bear") : undefined}
          title="Equity change vs initial balance"
        />
      </div>

      {/* Risk metrics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        <RiskCard icon={<Layers className="size-4" />} label="Exposure"
          value={hasPositions ? exposure.toFixed(1) + "%" : "N/A"}
          tone={!hasPositions ? "warn" : exposure > 60 ? "bear" : exposure >= 20 ? "warn" : "bull"}
          hint={exposureHint}
        />
        <RiskCard icon={<Target className="size-4" />} label="Top Concentration"
          value={hasPositions ? concentration.toFixed(1) + "%" : "N/A"}
          tone={concentrationTone}
          hint={concentrationHint}
          subhint="Largest position weight vs total equity"
        />
        <RiskCard icon={<Activity className="size-4" />} label="Beta vs JKSE"
          value={betaConfidenceOK ? beta!.toFixed(2) : "N/A"}
          tone={!betaConfidenceOK ? "warn" : Math.abs((beta ?? 1) - 1) < 0.3 ? "warn" : (beta ?? 1) > 1.3 ? "bear" : "bull"}
          hint={betaHint}
        />
        <RiskCard icon={<TrendingUp className="size-4" />} label="Win Rate"
          value={totalTrades > 0 ? winRate.toFixed(0) + "%" : "N/A"}
          tone={totalTrades === 0 ? "warn" : winRate >= 55 ? "bull" : winRate >= 45 ? "warn" : "bear"}
          hint={totalTrades > 0 ? `${totalTrades} closed trade${totalTrades === 1 ? "" : "s"}` : "No closed trades yet"}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        {/* Equity curve */}
        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold">Equity Curve</h3>
              <div className="text-[11px] text-muted-foreground">
                Baseline {money(initialBalance)} · Now {money(equity)}
              </div>
            </div>
            {hasBaseline && (
              <span className={`font-mono text-sm ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                {formatPct(pnlPct)} <span className="text-muted-foreground">({moneyCompact(totalReturnAmount)})</span>
              </span>
            )}
          </div>
          {curve.length > 1 ? (
            <Sparkline values={curve.map((c: any) => num(c.equity))} bull={pnlPct >= 0} width={600} height={140} />
          ) : (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Belum cukup histori untuk menampilkan equity curve.
            </div>
          )}
        </div>

        {/* Sector exposure */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3">Sector Exposure</h3>
          {sectorBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">No positions.</div>
          ) : (
            <>
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
              {sectorBreakdown.length === 1 && (
                <div className="text-[10px] text-amber-400 mt-2">Hanya 1 sektor — eksposur belum terdiversifikasi.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Holdings table */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <h3 className="font-semibold">Holdings</h3>
          {positions.length > 1 && concentration > 35 && (
            <span className="text-xs text-bear flex items-center gap-1"><ShieldAlert className="size-3" /> Concentration risk</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-left p-2">Sector</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Avg Cost</th>
                <th className="text-right p-2">Last Price</th>
                <th className="text-right p-2">Market Value</th>
                <th className="text-right p-2">Unrealized P/L</th>
                <th className="text-right p-2">Weight</th>
                <th className="text-right p-2">Realized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p: any) => {
                const weight = equity ? (num(p.value) / equity) * 100 : 0;
                const realized = d.perSymbol?.[p.symbol]?.realized ?? 0;
                return (
                  <tr key={p.symbol} className="border-t border-border">
                    <td className="p-2 font-medium">
                      <Link to="/chart/$symbol" params={{ symbol: p.symbol }} className="hover:text-primary">{p.symbol}</Link>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p.sector}</td>
                    <td className="p-2 text-right font-mono">{p.qty}</td>
                    <td className="p-2 text-right font-mono">{priceFmt(p.symbol, p.avg)}</td>
                    <td className="p-2 text-right font-mono">{priceFmt(p.symbol, p.last)}</td>
                    <td className="p-2 text-right font-mono">{money(p.value)}</td>
                    <td className={`p-2 text-right font-mono ${colorForChange(p.pnl)}`}>
                      <div>{money(p.pnl)}</div>
                      <div className="text-[10px] opacity-80">{formatPct(p.pnlPct)}</div>
                    </td>
                    <td className="p-2 text-right font-mono text-xs text-muted-foreground">{weight.toFixed(1)}%</td>
                    <td className={`p-2 text-right font-mono text-xs ${colorForChange(realized)}`}>{money(realized)}</td>
                  </tr>
                );
              })}
              {positions.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No holdings yet. Buy a paper position from any chart.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone, title }: { label: string; value: string; sub?: string; tone?: "bull" | "bear"; title?: string }) {
  return (
    <div className="panel p-4" title={title}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-xl md:text-2xl ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}

function RiskCard({ icon, label, value, tone, hint, subhint }: { icon: React.ReactNode; label: string; value: string; tone: "bull" | "bear" | "warn"; hint: string; subhint?: string }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-amber-400";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">{icon} {label}</span>
      </div>
      <div className={`font-mono text-2xl mt-1 ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
      {subhint && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{subhint}</div>}
    </div>
  );
}
