import { useQuery } from "@tanstack/react-query";
import { getFundamentals, type FundamentalDTO } from "@/lib/fundamentals.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink, Globe, Users, TrendingUp, ShieldCheck, Coins, CalendarClock, BarChart3 } from "lucide-react";
import { formatDateWIB, formatTimeWIB } from "@/lib/format";
import { useLang } from "@/hooks/use-language";

function compactNumber(n: number | null | undefined, currency?: string | null): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [div, suf] of units) {
    if (abs >= div) {
      const c = currency ? `${currency} ` : "";
      return `${c}${sign}${(abs / div).toFixed(2)}${suf}`;
    }
  }
  return `${currency ? currency + " " : ""}${sign}${abs.toFixed(2)}`;
}
function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function ratio(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(digits);
}
function fmtDate(s: string | null | undefined): string {
  return formatDateWIB(s);
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bull" | "bear" | "muted" }) {
  const toneClass = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="panel-2 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono text-base ${toneClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Section({ icon: Icon, title, children, empty, emptyText = "—" }: { icon: any; title: string; children: React.ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <section className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">{emptyText}</div>
      ) : (
        children
      )}
    </section>
  );
}

function recColor(key: string | null): string {
  switch ((key ?? "").toLowerCase()) {
    case "strong_buy":
    case "buy":
      return "text-bull";
    case "sell":
    case "strong_sell":
    case "underperform":
      return "text-bear";
    default:
      return "text-muted-foreground";
  }
}

function StatementsTable<T extends { date: string }>({ rows, cols, periodLabel, emptyText }: { rows: T[]; cols: { key: keyof T; label: string }[]; periodLabel: string; emptyText: string }) {
  if (!rows.length) return <div className="text-xs text-muted-foreground italic">{emptyText}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] text-muted-foreground uppercase">
          <tr>
            <th className="text-left p-1.5">{periodLabel}</th>
            {cols.map(c => (
              <th key={String(c.key)} className="text-right p-1.5">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.date} className="border-t border-border">
              <td className="p-1.5 text-muted-foreground">{fmtDate(r.date)}</td>
              {cols.map(c => (
                <td key={String(c.key)} className="p-1.5 text-right font-mono">
                  {compactNumber(r[c.key] as any)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FundamentalPanel({ symbol }: { symbol: string }) {
  const { L } = useLang();
  const T = L.body.fundamental;
  const S = T.stats;
  const SE = T.sections;
  const q = useQuery({
    queryKey: ["fundamentals", symbol],
    queryFn: () => getFundamentals({ data: { symbol } }),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3 mt-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="panel p-4 mt-3 text-sm text-bear">
        {T.loadFailed} {String((q.error as any)?.message ?? "")}
      </div>
    );
  }

  const f: FundamentalDTO | null = q.data ?? null;

  if (!f) {
    const [pre, post] = T.notAvailable.split("{symbol}");
    return (
      <div className="panel p-4 mt-3 text-sm text-muted-foreground">
        {pre}<span className="font-mono">{symbol}</span>{post}
      </div>
    );
  }

  const cur = f.price.currency ?? "";

  return (
    <div className="space-y-3 mt-3">
      <Section icon={Building2} title={SE.profile} emptyText={T.noData}>
        <div className="space-y-2">
          {f.profile.longName && (
            <div className="font-semibold text-base">{f.profile.longName}</div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {f.profile.sector && <span><Globe className="size-3 inline -mt-0.5 mr-1" />{f.profile.sector}</span>}
            {f.profile.industry && <span>· {f.profile.industry}</span>}
            {f.profile.country && <span>· {f.profile.country}</span>}
            {f.profile.fullTimeEmployees && (
              <span><Users className="size-3 inline -mt-0.5 mr-1" />{f.profile.fullTimeEmployees.toLocaleString()} {T.employees}</span>
            )}
            {f.profile.website && (
              <a href={f.profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {f.profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink className="size-3 inline -mt-0.5" />
              </a>
            )}
          </div>
          {f.profile.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">{f.profile.summary}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            <Stat label={S.marketCap} value={compactNumber(f.price.marketCap, cur)} />
            <Stat label={S.currency} value={cur || "—"} />
            <Stat label={S.lastPrice} value={f.price.regularMarketPrice != null ? f.price.regularMarketPrice.toLocaleString() : "—"} />
          </div>
        </div>
      </Section>

      <Section icon={BarChart3} title={SE.valuation} empty={Object.values(f.valuation).every(v => v == null)} emptyText={T.noData}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Stat label={S.peTTM} value={ratio(f.valuation.trailingPE)} />
          <Stat label={S.peFwd} value={ratio(f.valuation.forwardPE)} />
          <Stat label={S.peg} value={ratio(f.valuation.pegRatio)} />
          <Stat label={S.pb} value={ratio(f.valuation.priceToBook)} />
          <Stat label={S.ps} value={ratio(f.valuation.priceToSales)} />
          <Stat label={S.evEbitda} value={ratio(f.valuation.enterpriseToEbitda)} />
          <Stat label={S.evRev} value={ratio(f.valuation.enterpriseToRevenue)} />
        </div>
      </Section>

      <Section icon={TrendingUp} title={SE.profitability} empty={Object.values(f.profitability).every(v => v == null)} emptyText={T.noData}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2">
          <Stat label={S.grossMargin} value={pct(f.profitability.grossMargin)} tone={(f.profitability.grossMargin ?? 0) > 0.3 ? "bull" : undefined} />
          <Stat label={S.opMargin} value={pct(f.profitability.operatingMargin)} tone={(f.profitability.operatingMargin ?? 0) > 0.15 ? "bull" : undefined} />
          <Stat label={S.profitMargin} value={pct(f.profitability.profitMargin)} tone={(f.profitability.profitMargin ?? 0) > 0.1 ? "bull" : (f.profitability.profitMargin ?? 0) < 0 ? "bear" : undefined} />
          <Stat label={S.roe} value={pct(f.profitability.returnOnEquity)} tone={(f.profitability.returnOnEquity ?? 0) > 0.15 ? "bull" : undefined} />
          <Stat label={S.roa} value={pct(f.profitability.returnOnAssets)} />
          <Stat label={S.ebitdaMargin} value={pct(f.profitability.ebitdaMargin)} />
        </div>
      </Section>

      <Section icon={TrendingUp} title={SE.growth} empty={Object.values(f.growth).every(v => v == null)} emptyText={T.noData}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label={S.revGrowth} value={pct(f.growth.revenueGrowth)} tone={(f.growth.revenueGrowth ?? 0) > 0.1 ? "bull" : (f.growth.revenueGrowth ?? 0) < 0 ? "bear" : undefined} />
          <Stat label={S.earnGrowth} value={pct(f.growth.earningsGrowth)} tone={(f.growth.earningsGrowth ?? 0) > 0.1 ? "bull" : (f.growth.earningsGrowth ?? 0) < 0 ? "bear" : undefined} />
          <Stat label={S.epsQGrowth} value={pct(f.growth.earningsQuarterlyGrowth)} tone={(f.growth.earningsQuarterlyGrowth ?? 0) > 0 ? "bull" : "bear"} />
        </div>
      </Section>

      <Section icon={ShieldCheck} title={SE.health} empty={Object.values(f.health).every(v => v == null)} emptyText={T.noData}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Stat label={S.totalCash} value={compactNumber(f.health.totalCash, cur)} />
          <Stat label={S.totalDebt} value={compactNumber(f.health.totalDebt, cur)} />
          <Stat label={S.debtEquity} value={ratio(f.health.debtToEquity)} hint={T.hints.debtHealthy} tone={(f.health.debtToEquity ?? 0) < 100 ? "bull" : (f.health.debtToEquity ?? 0) > 200 ? "bear" : undefined} />
          <Stat label={S.currentRatio} value={ratio(f.health.currentRatio)} hint={T.hints.currentHealthy} tone={(f.health.currentRatio ?? 0) > 1.5 ? "bull" : (f.health.currentRatio ?? 0) < 1 ? "bear" : undefined} />
          <Stat label={S.quickRatio} value={ratio(f.health.quickRatio)} />
          <Stat label={S.opCF} value={compactNumber(f.health.operatingCashflow, cur)} />
          <Stat label={S.freeCF} value={compactNumber(f.health.freeCashflow, cur)} tone={(f.health.freeCashflow ?? 0) > 0 ? "bull" : "bear"} />
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section icon={Coins} title={SE.dividends} empty={f.dividends.dividendRate == null && f.dividends.dividendYield == null} emptyText={T.noData}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={S.divRate} value={f.dividends.dividendRate != null ? f.dividends.dividendRate.toFixed(2) : "—"} />
            <Stat label={S.divYield} value={pct(f.dividends.dividendYield)} />
            <Stat label={S.payout} value={pct(f.dividends.payoutRatio)} />
            <Stat label={S.exDiv} value={fmtDate(f.dividends.exDividendDate)} />
          </div>
        </Section>

        <Section icon={CalendarClock} title={SE.earnings} emptyText={T.noData}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={S.nextEarn} value={fmtDate(f.earnings.nextEarningsDate)} />
            <Stat label={S.epsTTM} value={ratio(f.earnings.epsTrailing)} />
            <Stat label={S.epsFwd} value={ratio(f.earnings.epsForward)} />
            <Stat label={S.analysts} value={f.recommendation.numAnalysts != null ? String(f.recommendation.numAnalysts) : "—"} />
            <Stat label={S.rec} value={(f.recommendation.key ?? "—").replace("_", " ")} hint={T.hints.mean.replace("{v}", ratio(f.recommendation.mean))} />
            <Stat label={S.target} value={f.recommendation.targetMean != null ? `${f.recommendation.targetMean.toFixed(2)}` : "—"} hint={f.recommendation.targetLow != null && f.recommendation.targetHigh != null ? `${f.recommendation.targetLow.toFixed(0)}–${f.recommendation.targetHigh.toFixed(0)}` : undefined} tone={recColor(f.recommendation.key) === "text-bull" ? "bull" : recColor(f.recommendation.key) === "text-bear" ? "bear" : undefined} />
          </div>
        </Section>
      </div>

      <Section icon={BarChart3} title={SE.income} emptyText={T.noData}>
        <StatementsTable
          periodLabel={T.period}
          emptyText={T.noReport}
          rows={f.statements.income}
          cols={[
            { key: "revenue", label: S.revenue },
            { key: "grossProfit", label: S.grossProfit },
            { key: "operatingIncome", label: S.opIncome },
            { key: "netIncome", label: S.netIncome },
          ]}
        />
      </Section>

      <Section icon={ShieldCheck} title={SE.balance} emptyText={T.noData}>
        <StatementsTable
          periodLabel={T.period}
          emptyText={T.noReport}
          rows={f.statements.balance}
          cols={[
            { key: "totalAssets", label: S.assets },
            { key: "totalLiab", label: S.liab },
            { key: "totalEquity", label: S.equity },
            { key: "cash", label: S.cash },
          ]}
        />
      </Section>

      <Section icon={Coins} title={SE.cashflow} emptyText={T.noData}>
        <StatementsTable
          periodLabel={T.period}
          emptyText={T.noReport}
          rows={f.statements.cashflow}
          cols={[
            { key: "operating", label: S.operating },
            { key: "investing", label: S.investing },
            { key: "financing", label: S.financing },
            { key: "capex", label: S.capex },
          ]}
        />
      </Section>

      <div className="text-[10px] text-muted-foreground text-right">
        {T.footer.replace("{time}", formatTimeWIB(f.asOf))}
      </div>
    </div>
  );
}
