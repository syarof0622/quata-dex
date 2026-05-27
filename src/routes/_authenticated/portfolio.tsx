import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolioAnalytics } from "@/lib/analytics.functions";
import { colorForChange, formatPct, formatMoneyByCurrency, formatMoneyCompact, formatTimeWIB, formatDateTimeWIB } from "@/lib/format";
import { formatLocalPrice, symbolMarket } from "@/lib/symbols";
import { Link } from "@tanstack/react-router";
import { Sparkline } from "@/routes/_authenticated/screener";
import { ShieldAlert, TrendingUp, Layers, Activity, Target, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PortfolioAttributionPanel } from "@/components/PortfolioAttributionPanel";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Quanta Terminal" }] }),
  component: Portfolio,
});

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
  const concentration = num(d.maxPositionWeight ?? d.concentration);
  const cashRatio = num(d.cashRatio);
  const largestSectorPct = num(d.largestSectorPct);
  const drawdown = num(d.drawdown);
  const dailyPnl = num(d.dailyPnl);
  const dailyPnlPct = num(d.dailyPnlPct);
  const winRate = num(d.winRate);
  const closedTrades = num(d.closedTradesCount ?? d.totalTrades);
  const executedOrders = num(d.executedOrdersCount);
  const openPositionsCount = num(d.openPositionsCount);
  const profitFactor = d.profitFactor;
  const pnlPct = num(d.pnlPct);
  const totalReturnAmount = num(d.totalReturnAmount);
  const initialBalance = num(d.initialBalance);
  const equity = num(d.equity);
  const positions = Array.isArray(d.positions) ? d.positions : [];
  const sectorBreakdown = Array.isArray(d.sectorBreakdown) ? d.sectorBreakdown : [];
  const curve = Array.isArray(d.curve) ? d.curve : [];
  const recentClosed = Array.isArray(d.recentClosedTrades) ? d.recentClosedTrades : [];
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  const riskLevel = (d.riskLevel ?? "low") as "low" | "moderate" | "elevated" | "high";

  const hasPositions = positions.length > 0;
  const hasActivity = hasPositions || executedOrders > 0;
  const hasBaseline = initialBalance > 0;
  const hasClosed = closedTrades > 0;

  // Smarter concentration label
  const concentrationHint =
    positions.length === 0 ? "No positions"
      : positions.length === 1 ? "Single holding"
      : concentration > 35 ? "High concentration"
      : concentration > 20 ? "Moderate concentration"
      : "Diversified";
  const concentrationTone: "bull" | "bear" | "warn" =
    positions.length <= 1 ? "warn"
      : concentration > 35 ? "bear"
      : concentration > 20 ? "warn"
      : "bull";

  const exposureHint = !hasPositions
    ? "No positions"
    : exposure > 60 ? "High exposure"
    : exposure >= 20 ? "Moderate exposure"
    : "Low exposure";

  const riskTone =
    riskLevel === "high" ? "bear"
      : riskLevel === "elevated" ? "bear"
      : riskLevel === "moderate" ? "warn"
      : "bull";

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="hero-h1 text-2xl md:text-2xl font-semibold tracking-tight">Portfolio Risk Analytics</h1>
          <p className="text-[12.5px] md:text-sm text-muted-foreground">Mark-to-market equity, P&amp;L breakdown &amp; risk intelligence — paper trading only.</p>
        </div>
        <div className="flex items-center gap-x-2 gap-y-1 text-[10.5px] md:text-[11px] text-muted-foreground flex-wrap">
          <span>Currency <span className="font-mono text-foreground">{currency}</span></span>
          <span>·</span>
          <span>{openPositionsCount} open</span>
          <span>·</span>
          <span>{executedOrders} executed</span>
          <span>·</span>
          <span>{closedTrades} closed</span>
          <span>·</span>
          <span>Updated {formatTimeWIB(d.lastUpdated)}</span>
        </div>
      </div>

      {!hasActivity && (
        <div className="panel p-8 text-center space-y-3">
          <div className="text-lg font-semibold">Belum ada aktivitas paper trading</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Mulai dengan paper trade dari halaman chart, atau aktifkan AI Trade Agent.
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Link to="/screener" className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">Screener</Link>
            <Link to="/lab" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">AI Trade Agent</Link>
            <Link to="/watchlist" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">Watchlist</Link>
          </div>
        </div>
      )}

      {/* Row 1: P&L / equity stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        <Stat label="Equity" value={money(equity)} title="Cash + holdings (mark-to-market)" />
        <Stat label="Cash" value={money(num(d.cash))} />
        <Stat label="Market Value" value={hasPositions ? money(num(d.totalValue)) : "—"} title="Current value of holdings" />
        <Stat
          label="Unrealized P/L"
          value={hasPositions ? money(num(d.unrealized)) : "—"}
          tone={hasPositions ? (num(d.unrealized) >= 0 ? "bull" : "bear") : undefined}
          title="From positions still open"
        />
        <Stat
          label="Realized P/L"
          value={hasClosed ? money(num(d.realized)) : "—"}
          tone={hasClosed ? (num(d.realized) >= 0 ? "bull" : "bear") : undefined}
          title="From closed trades"
        />
        <Stat
          label="Total Return"
          value={hasBaseline ? formatPct(pnlPct) : "—"}
          sub={hasBaseline ? money(totalReturnAmount) : `Baseline: ${money(initialBalance)}`}
          tone={hasBaseline ? (pnlPct >= 0 ? "bull" : "bear") : undefined}
          title={`Equity vs initial balance (${money(initialBalance)})`}
        />
      </div>

      {/* Row 2: trade counts + perf */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        <Stat label="Executed Orders" value={String(executedOrders)} sub="paper fills (buy + sell)" />
        <Stat label="Open Positions" value={String(openPositionsCount)} sub="from paper_positions" />
        <Stat label="Closed Trades" value={String(closedTrades)} sub="sell fills (FIFO)" />
        <Stat
          label="Win Rate"
          value={hasClosed ? winRate.toFixed(0) + "%" : "N/A"}
          sub={hasClosed ? (closedTrades < 5 ? "Low sample size" : `${closedTrades} closed`) : "No closed trades yet"}
          tone={!hasClosed ? undefined : winRate >= 55 ? "bull" : winRate >= 45 ? undefined : "bear"}
        />
        <Stat
          label="Profit Factor"
          value={!hasClosed ? "N/A" : profitFactor == null ? "∞" : profitFactor.toFixed(2)}
          sub={hasClosed ? "gross profit ÷ |loss|" : "Needs closed trades"}
          tone={!hasClosed || profitFactor == null ? undefined : profitFactor >= 1.5 ? "bull" : profitFactor >= 1 ? undefined : "bear"}
        />
        <Stat
          label="Risk Level"
          value={riskLevel.toUpperCase()}
          sub={warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "no warnings"}
          tone={riskTone === "bull" ? "bull" : riskTone === "bear" ? "bear" : undefined}
        />
      </div>

      {/* Risk cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        <RiskCard icon={<Layers className="size-4" />} label="Exposure"
          value={hasPositions ? exposure.toFixed(1) + "%" : "N/A"}
          tone={!hasPositions ? "warn" : exposure > 60 ? "bear" : exposure >= 20 ? "warn" : "bull"}
          hint={exposureHint}
        />
        <RiskCard icon={<Wallet className="size-4" />} label="Cash Ratio"
          value={cashRatio.toFixed(1) + "%"}
          tone={cashRatio < 10 && hasPositions ? "bear" : cashRatio < 25 ? "warn" : "bull"}
          hint={cashRatio < 10 ? "Low cash buffer" : cashRatio < 25 ? "Moderate cash" : "Healthy cash"}
        />
        <RiskCard icon={<Target className="size-4" />} label="Top Concentration"
          value={hasPositions ? concentration.toFixed(1) + "%" : "N/A"}
          tone={concentrationTone}
          hint={concentrationHint}
        />
        <RiskCard icon={<Layers className="size-4" />} label="Sector Exposure"
          value={hasPositions ? largestSectorPct.toFixed(1) + "%" : "N/A"}
          tone={!hasPositions ? "warn" : largestSectorPct > 40 ? "bear" : largestSectorPct > 25 ? "warn" : "bull"}
          hint={hasPositions ? `Largest sector` : "—"}
        />
        <RiskCard icon={<Activity className="size-4" />} label="Drawdown"
          value={drawdown < 0 ? drawdown.toFixed(2) + "%" : "0.00%"}
          tone={drawdown < -8 ? "bear" : drawdown < -5 ? "warn" : "bull"}
          hint={drawdown < -5 ? "Below peak" : "Near peak equity"}
        />
        <RiskCard icon={<TrendingUp className="size-4" />} label="Daily P/L"
          value={hasActivity ? formatPct(dailyPnlPct) : "N/A"}
          tone={!hasActivity ? "warn" : dailyPnlPct >= 0 ? "bull" : dailyPnlPct > -2 ? "warn" : "bear"}
          hint={hasActivity ? money(dailyPnl) : "—"}
        />
      </div>

      {/* Risk warnings */}
      {warnings.length > 0 && (
        <div className="panel p-4 border-l-2 border-amber-500/60">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-400" />
            <h3 className="font-semibold text-sm">Risk Warnings</h3>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2"><span className="text-amber-400">•</span><span>{w}</span></li>
            ))}
          </ul>
        </div>
      )}
      {hasActivity && warnings.length === 0 && (
        <div className="panel p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-bull" />
          No active risk warnings. Portfolio within configured limits.
        </div>
      )}

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
                      <div className={`h-full ${num(s.pct) > 40 ? "bg-bear" : "bg-primary"}`} style={{ width: `${Math.min(100, num(s.pct))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {sectorBreakdown.length === 1 && (
                <div className="text-[10px] text-amber-400 mt-2">Hanya 1 sektor — belum terdiversifikasi.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Attribution, Scenarios, What-If */}
      {hasActivity && <PortfolioAttributionPanel data={d} />}

      {/* Open Positions table */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <h3 className="font-semibold">Open Positions</h3>
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
                <th className="text-right p-2">Lot</th>
                <th className="text-right p-2">Shares</th>
                <th className="text-right p-2">Avg Entry</th>
                <th className="text-right p-2">Last</th>
                <th className="text-right p-2">Market Value</th>
                <th className="text-right p-2">Unrealized P/L</th>
                <th className="text-right p-2">Weight</th>
                <th className="text-right p-2">Realized</th>
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
                      {p.stale && <span className="ml-1 text-[9px] text-amber-400">(stale)</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p.sector}</td>
                    <td className="p-2 text-right font-mono text-xs">{num(p.lot).toFixed(0)}</td>
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
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">
                  Belum ada open position. AI belum mengeksekusi paper BUY atau semua posisi sudah ditutup.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Closed Trades */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1">
          <h3 className="font-semibold">Recent Closed Trades</h3>
          <div className="text-[11px] text-muted-foreground">Realized P/L hanya dihitung dari closed trades.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-right p-2">Entry</th>
                <th className="text-right p-2">Exit</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Realized P/L</th>
                <th className="text-right p-2">Return %</th>
                <th className="text-left p-2">Reason</th>
                <th className="text-right p-2">Closed</th>
              </tr>
            </thead>
            <tbody>
              {recentClosed.map((t: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2 font-medium">{t.symbol}</td>
                  <td className="p-2 text-right font-mono text-xs">{priceFmt(t.symbol, t.entryPrice)}</td>
                  <td className="p-2 text-right font-mono text-xs">{priceFmt(t.symbol, t.exitPrice)}</td>
                  <td className="p-2 text-right font-mono text-xs">{t.qty}</td>
                  <td className={`p-2 text-right font-mono ${colorForChange(t.realized)}`}>{money(t.realized)}</td>
                  <td className={`p-2 text-right font-mono text-xs ${colorForChange(t.returnPct)}`}>{formatPct(t.returnPct)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{t.closeReason}</td>
                  <td className="p-2 text-right text-[10px] text-muted-foreground">{formatDateTimeWIB(t.closedAt)}</td>
                </tr>
              ))}
              {recentClosed.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Belum ada closed trade.</td></tr>
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
    <div className="panel p-3 md:p-4" title={title}>
      <div className="text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className={`font-mono text-[17px] md:text-2xl leading-tight mt-0.5 ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
      {sub && <div className="text-[10.5px] md:text-[11px] text-muted-foreground mt-0.5 font-mono truncate">{sub}</div>}
    </div>
  );
}

function RiskCard({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: string; tone: "bull" | "bear" | "warn"; hint: string }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-amber-400";
  return (
    <div className="panel p-3 md:p-4">
      <div className="flex items-center justify-between text-[10.5px] md:text-xs uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1 truncate">{icon} {label}</span>
      </div>
      <div className={`font-mono text-[17px] md:text-xl mt-0.5 ${cls}`}>{value}</div>
      <div className="text-[10.5px] md:text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>
    </div>
  );
}
