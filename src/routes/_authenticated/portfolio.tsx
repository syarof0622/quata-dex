import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPortfolioAnalytics } from "@/lib/analytics.functions";
import { colorForChange, formatPct, formatMoneyByCurrency, formatMoneyCompact, formatTimeWIB, formatDateTimeWIB } from "@/lib/format";
import { formatLocalPrice, symbolMarket } from "@/lib/symbols";
import { displaySymbol } from "@/lib/display-symbol";
import { Link } from "@tanstack/react-router";
import { Sparkline } from "@/components/Sparkline";
import { ShieldAlert, TrendingUp, Layers, Activity, Target, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PortfolioAttributionPanel } from "@/components/PortfolioAttributionPanel";
import { PortfolioIntelligencePanel } from "@/components/PortfolioIntelligencePanel";
import { PageHero } from "@/components/ui/page-hero";
import { useLang } from "@/hooks/use-language";

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
  const { L } = useLang();
  const a = useQuery({
    queryKey: ["portfolio-analytics"],
    queryFn: () => getPortfolioAnalytics(),
    refetchInterval: 15000,
  });

  if (a.isLoading) return <div className="p-6 text-muted-foreground">{L.body.portfolio.loading}</div>;
  const d = a.data;
  if (!d) return <div className="p-6 text-muted-foreground">{L.body.portfolio.noPaperAccount}</div>;


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
    positions.length === 0 ? L.body.portfolio.noPositionsHint
      : positions.length === 1 ? L.body.portfolio.singleHolding
      : concentration > 35 ? L.body.portfolio.highConcentration
      : concentration > 20 ? L.body.portfolio.moderateConcentration
      : L.body.portfolio.diversified;
  const concentrationTone: "bull" | "bear" | "warn" =
    positions.length <= 1 ? "warn"
      : concentration > 35 ? "bear"
      : concentration > 20 ? "warn"
      : "bull";

  const exposureHint = !hasPositions
    ? L.body.portfolio.noPositions
    : exposure > 60 ? L.body.portfolio.highExposure
    : exposure >= 20 ? L.body.portfolio.moderateExposure
    : L.body.portfolio.lowExposure;

  const riskTone =
    riskLevel === "high" ? "bear"
      : riskLevel === "elevated" ? "bear"
      : riskLevel === "moderate" ? "warn"
      : "bull";


  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <PageHero
        eyebrow={L.hero.portfolio.eyebrow}
        icon={Wallet}
        title={L.hero.portfolio.title}
        subtitle={L.hero.portfolio.subtitle}
        actions={
          <div className="flex items-center gap-x-2 gap-y-1 text-[10.5px] md:text-[11px] text-muted-foreground flex-wrap">
            <span>{L.body.portfolio.currency} <span className="font-mono text-foreground">{currency}</span></span>
            <span>·</span>
            <span>{openPositionsCount} {L.body.portfolio.opened}</span>
            <span>·</span>
            <span>{executedOrders} {L.body.portfolio.executed}</span>
            <span>·</span>
            <span>{closedTrades} {L.body.portfolio.closed}</span>
            <span>·</span>
            <span>{L.body.portfolio.updated} {formatTimeWIB(d.lastUpdated)}</span>
          </div>
        }
      />


      {!hasActivity && (
        <div className="panel p-8 text-center space-y-3">
          <div className="text-lg font-semibold">{L.body.portfolio.noActivityTitle}</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {L.body.portfolio.noActivityDesc}
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Link to="/screener" className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">{L.body.portfolio.goScreener}</Link>
            <Link to="/lab" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">{L.body.portfolio.goAiAgent}</Link>
            <Link to="/watchlist" className="text-xs px-3 py-1.5 rounded bg-accent/40 hover:bg-accent/60">{L.body.portfolio.goWatchlist}</Link>
          </div>
        </div>
      )}


      {/* Row 1: P&L / equity stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
        <Stat label={L.body.portfolio.equity} value={money(equity)} title={L.body.portfolio.tipEquity} />
        <Stat label={L.body.portfolio.cash} value={money(num(d.cash))} />
        <Stat label={L.body.portfolio.marketValue} value={hasPositions ? money(num(d.totalValue)) : "—"} title={L.body.portfolio.tipMarketValue} />
        <Stat
          label={L.body.portfolio.unrealizedPL}
          value={hasPositions ? money(num(d.unrealized)) : "—"}
          tone={hasPositions ? (num(d.unrealized) >= 0 ? "bull" : "bear") : undefined}
          title={L.body.portfolio.tipUnrealized}
        />
        <Stat
          label={L.body.portfolio.realizedGain}
          value={hasClosed ? money(num((d as any).realizedGain)) : "—"}
          tone={hasClosed && num((d as any).realizedGain) > 0 ? "bull" : undefined}
          title={L.body.portfolio.tipRealizedGain}
        />
        <Stat
          label={L.body.portfolio.realizedLoss}
          value={hasClosed ? money(num((d as any).realizedLoss)) : "—"}
          tone={hasClosed && num((d as any).realizedLoss) < 0 ? "bear" : undefined}
          title={L.body.portfolio.tipRealizedLoss}
        />
        <Stat
          label={L.body.portfolio.realizedNet}
          value={hasClosed ? money(num(d.realized)) : "—"}
          tone={hasClosed ? (num(d.realized) >= 0 ? "bull" : "bear") : undefined}
          title={L.body.portfolio.tipRealizedNet}
        />
        <Stat
          label={L.body.portfolio.totalReturn}
          value={hasBaseline ? formatPct(pnlPct) : "—"}
          sub={hasBaseline ? money(totalReturnAmount) : `${L.body.portfolio.baseline}: ${money(initialBalance)}`}
          tone={hasBaseline ? (pnlPct >= 0 ? "bull" : "bear") : undefined}
          title={`${L.body.portfolio.tipTotalReturn} (${money(initialBalance)})`}
        />
      </div>

      {/* Row 2: trade counts + perf */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        <Stat label={L.body.portfolio.executedOrders} value={String(executedOrders)} sub={L.body.portfolio.paperFills} />
        <Stat label={L.body.portfolio.openPositions} value={String(openPositionsCount)} sub={L.body.portfolio.fromPositions} />
        <Stat label={L.body.portfolio.closedTrades} value={String(closedTrades)} sub={L.body.portfolio.sellFifo} />
        <Stat
          label={L.body.portfolio.winRate}
          value={hasClosed ? winRate.toFixed(0) + "%" : "N/A"}
          sub={hasClosed ? (closedTrades < 5 ? L.body.portfolio.lowSample : `${closedTrades} ${L.body.portfolio.closedSuffix}`) : L.body.portfolio.noClosedYet}
          tone={!hasClosed ? undefined : winRate >= 55 ? "bull" : winRate >= 45 ? undefined : "bear"}
        />
        <Stat
          label={L.body.portfolio.profitFactor}
          value={!hasClosed ? "N/A" : profitFactor == null ? "∞" : profitFactor.toFixed(2)}
          sub={hasClosed ? L.body.portfolio.grossProfitOverLoss : L.body.portfolio.needsClosed}
          tone={!hasClosed || profitFactor == null ? undefined : profitFactor >= 1.5 ? "bull" : profitFactor >= 1 ? undefined : "bear"}
        />
        <Stat
          label={L.body.portfolio.riskLevel}
          value={riskLevel.toUpperCase()}
          sub={warnings.length ? `${warnings.length} ${warnings.length === 1 ? L.body.portfolio.warningOne : L.body.portfolio.warningMany}` : L.body.portfolio.noWarnings}
          tone={riskTone === "bull" ? "bull" : riskTone === "bear" ? "bear" : undefined}
        />
      </div>


      {/* Risk cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        <RiskCard icon={<Layers className="size-4" />} label={L.body.portfolio.exposure}
          value={hasPositions ? exposure.toFixed(1) + "%" : "N/A"}
          tone={!hasPositions ? "warn" : exposure > 60 ? "bear" : exposure >= 20 ? "warn" : "bull"}
          hint={exposureHint}
        />
        <RiskCard icon={<Wallet className="size-4" />} label={L.body.portfolio.cashRatio}
          value={cashRatio.toFixed(1) + "%"}
          tone={cashRatio < 10 && hasPositions ? "bear" : cashRatio < 25 ? "warn" : "bull"}
          hint={cashRatio < 10 ? L.body.portfolio.lowCashBuffer : cashRatio < 25 ? L.body.portfolio.moderateCash : L.body.portfolio.healthyCash}
        />
        <RiskCard icon={<Target className="size-4" />} label={L.body.portfolio.topConcentration}
          value={hasPositions ? concentration.toFixed(1) + "%" : "N/A"}
          tone={concentrationTone}
          hint={concentrationHint}
        />
        <RiskCard icon={<Layers className="size-4" />} label={L.body.portfolio.sectorExposure}
          value={hasPositions ? largestSectorPct.toFixed(1) + "%" : "N/A"}
          tone={!hasPositions ? "warn" : largestSectorPct > 40 ? "bear" : largestSectorPct > 25 ? "warn" : "bull"}
          hint={hasPositions ? L.body.portfolio.largestSector : "—"}
        />
        <RiskCard icon={<Activity className="size-4" />} label={L.body.portfolio.drawdown}
          value={drawdown < 0 ? drawdown.toFixed(2) + "%" : "0.00%"}
          tone={drawdown < -8 ? "bear" : drawdown < -5 ? "warn" : "bull"}
          hint={drawdown < -5 ? L.body.portfolio.belowPeak : L.body.portfolio.nearPeak}
        />
        <RiskCard icon={<TrendingUp className="size-4" />} label={L.body.portfolio.dailyPL}
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
            <h3 className="font-semibold text-sm">{L.body.portfolio.riskWarnings}</h3>
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
          {L.body.portfolio.noRiskWarnings}
        </div>
      )}


      <div className="grid lg:grid-cols-3 gap-3">
        {/* Equity curve */}
        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold">{L.body.portfolio.equityCurve}</h3>
              <div className="text-[11px] text-muted-foreground">
                {L.body.portfolio.baseline} {money(initialBalance)} · {L.body.portfolio.now} {money(equity)}
              </div>
            </div>
            {hasBaseline && (
              <span className={`font-mono text-sm ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                {formatPct(pnlPct)} <span className="text-muted-foreground">({moneyCompact(totalReturnAmount)})</span>
              </span>
            )}
          </div>
          {curve.length > 1 ? (
            <div className="w-full" style={{ height: 160 }}>
              <Sparkline values={curve.map((c: any) => num(c.equity))} positive={pnlPct >= 0} height={160} strokeWidth={1.6} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-12 text-center">
              {L.body.portfolio.noEquityHistory}
            </div>
          )}

        </div>

        {/* Sector exposure */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3">{L.body.portfolio.sectorExposure}</h3>
          {sectorBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">{L.body.portfolio.sectorBreakdownNoPos}</div>
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
                <div className="text-[10px] text-amber-400 mt-2">{L.body.portfolio.onlyOneSector}</div>
              )}
            </>
          )}

        </div>
      </div>
      {/* Portfolio Intelligence — health, insights, scenarios */}
      <PortfolioIntelligencePanel />

      {/* Attribution, Scenarios, What-If */}
      {hasActivity && <PortfolioAttributionPanel data={d} />}


      {/* Open Positions table */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <h3 className="font-semibold">{L.body.portfolio.openPositionsTitle}</h3>
          {positions.length > 1 && concentration > 35 && (
            <span className="text-xs text-bear flex items-center gap-1"><ShieldAlert className="size-3" /> {L.body.portfolio.concentrationRisk}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">{L.body.watchlist.thSymbol}</th>
                <th className="text-left p-2">{L.body.portfolio.thSector}</th>
                <th className="text-right p-2">{L.body.portfolio.thLot}</th>
                <th className="text-right p-2">{L.body.portfolio.thAvgEntry}</th>
                <th className="text-right p-2">{L.body.portfolio.thLast}</th>
                <th className="text-right p-2">{L.body.portfolio.unrealizedPL}</th>
                <th className="text-right p-2">{L.body.portfolio.thStopLoss}</th>
                <th className="text-right p-2">{L.body.portfolio.thTakeProfit}</th>
                <th className="text-right p-2">{L.body.portfolio.thTrailing}</th>
                <th className="text-left p-2">{L.body.portfolio.thAiStatus}</th>
                <th className="text-right p-2">{L.body.portfolio.thWeight}</th>
              </tr>
            </thead>

            <tbody>
              {positions.map((p: any) => {
                const weight = equity ? (num(p.value) / equity) * 100 : 0;
                const sl = p.stopLoss;
                const tp = p.takeProfit;
                const trailing = p.trailingStop;
                const ms = p.managementStatus ?? null;
                const msTone =
                  ms == null ? "text-amber-400"
                  : /EXIT|TRIGGER/i.test(ms) ? "text-rose-400"
                  : /TRAILING/i.test(ms) ? "text-sky-400"
                  : /NEAR/i.test(ms) ? "text-amber-400"
                  : "text-emerald-400";
                return (
                  <tr key={p.symbol} className="border-t border-border align-top">
                    <td className="p-2 font-medium">
                      <Link to="/chart/$symbol" params={{ symbol: p.symbol }} className="hover:text-primary">{displaySymbol(p.symbol)}</Link>
                      {p.stale && <span className="ml-1 text-[9px] text-amber-400">{L.body.portfolio.stale}</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p.sector}</td>
                    <td className="p-2 text-right font-mono text-xs">{num(p.lot).toFixed(0)}</td>
                    <td className="p-2 text-right font-mono">{priceFmt(p.symbol, p.avg)}</td>
                    <td className="p-2 text-right font-mono">{priceFmt(p.symbol, p.last)}</td>
                    <td className={`p-2 text-right font-mono ${colorForChange(p.pnl)}`}>
                      <div>{money(p.pnl)}</div>
                      <div className="text-[10px] opacity-80">{formatPct(p.pnlPct)}</div>
                    </td>
                    <td className="p-2 text-right font-mono text-xs">
                      {sl != null ? (
                        <>
                          <div className="text-rose-400">{priceFmt(p.symbol, sl)}</div>
                          {p.distanceToStopPct != null && (
                            <div className="text-[10px] text-muted-foreground">{p.distanceToStopPct.toFixed(1)}%</div>
                          )}
                        </>
                      ) : <span className="text-amber-400">—</span>}
                    </td>
                    <td className="p-2 text-right font-mono text-xs">
                      {tp != null ? (
                        <>
                          <div className="text-emerald-400">{priceFmt(p.symbol, tp)}</div>
                          {p.distanceToTakeProfitPct != null && (
                            <div className="text-[10px] text-muted-foreground">{p.distanceToTakeProfitPct.toFixed(1)}%</div>
                          )}
                        </>
                      ) : <span className="text-amber-400">—</span>}
                    </td>
                    <td className="p-2 text-right font-mono text-xs">
                      {trailing != null ? (
                        <div className="text-sky-400">{priceFmt(p.symbol, trailing)}</div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`p-2 text-xs ${msTone}`}>
                      {ms ?? L.body.portfolio.noPlan}
                      {!p.hasExitPlan && (
                        <div className="text-[10px] text-amber-400 mt-0.5">{L.body.portfolio.noExitPlan}</div>
                      )}
                      {p.exitPlanReason && p.hasExitPlan && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]" title={p.exitPlanReason}>{p.exitPlanReason}</div>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono text-xs text-muted-foreground">{weight.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {positions.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">
                  {L.body.portfolio.noOpenPosition}
                </td></tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Closed Trades */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1">
          <h3 className="font-semibold">{L.body.portfolio.recentClosedTitle}</h3>
          <div className="text-[11px] text-muted-foreground">{L.body.portfolio.realizedNote}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">{L.body.watchlist.thSymbol}</th>
                <th className="text-right p-2">{L.body.portfolio.thEntry}</th>
                <th className="text-right p-2">{L.body.portfolio.thExit}</th>
                <th className="text-right p-2">{L.body.portfolio.thQty}</th>
                <th className="text-right p-2">{L.body.portfolio.thRealized}</th>
                <th className="text-right p-2">{L.body.portfolio.thReturnPct}</th>
                <th className="text-left p-2">{L.body.portfolio.thReason}</th>
                <th className="text-right p-2">{L.body.portfolio.thClosed}</th>
              </tr>
            </thead>
            <tbody>
              {recentClosed.map((t: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2 font-medium">{displaySymbol(t.symbol)}</td>
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
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{L.body.portfolio.noClosedTrades}</td></tr>
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
