import { useQuery } from "@tanstack/react-query";
import { getFundamentals, type FundamentalDTO } from "@/lib/fundamentals.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink, Globe, Users, TrendingUp, ShieldCheck, Coins, CalendarClock, BarChart3 } from "lucide-react";
import { formatDateWIB, formatTimeWIB } from "@/lib/format";

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
  // Yahoo: profit/operating margins are decimals (0.23 => 23%)
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

function Section({ icon: Icon, title, children, empty }: { icon: any; title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">Tidak ada data tersedia.</div>
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

function StatementsTable<T extends { date: string }>({ rows, cols }: { rows: T[]; cols: { key: keyof T; label: string }[] }) {
  if (!rows.length) return <div className="text-xs text-muted-foreground italic">Tidak ada data laporan.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] text-muted-foreground uppercase">
          <tr>
            <th className="text-left p-1.5">Periode</th>
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
        Gagal memuat data fundamental. {String((q.error as any)?.message ?? "")}
      </div>
    );
  }

  const f: FundamentalDTO | null = q.data ?? null;

  if (!f) {
    return (
      <div className="panel p-4 mt-3 text-sm text-muted-foreground">
        Data fundamental tidak tersedia untuk <span className="font-mono">{symbol}</span>. Coba symbol lain (saham individual biasanya tersedia, indeks/ETF terbatas).
      </div>
    );
  }

  const cur = f.price.currency ?? "";

  return (
    <div className="space-y-3 mt-3">
      {/* Company Profile */}
      <Section icon={Building2} title="Company Profile">
        <div className="space-y-2">
          {f.profile.longName && (
            <div className="font-semibold text-base">{f.profile.longName}</div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {f.profile.sector && <span><Globe className="size-3 inline -mt-0.5 mr-1" />{f.profile.sector}</span>}
            {f.profile.industry && <span>· {f.profile.industry}</span>}
            {f.profile.country && <span>· {f.profile.country}</span>}
            {f.profile.fullTimeEmployees && (
              <span><Users className="size-3 inline -mt-0.5 mr-1" />{f.profile.fullTimeEmployees.toLocaleString()} employees</span>
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
            <Stat label="Market Cap" value={compactNumber(f.price.marketCap, cur)} />
            <Stat label="Currency" value={cur || "—"} />
            <Stat label="Last Price" value={f.price.regularMarketPrice != null ? f.price.regularMarketPrice.toLocaleString() : "—"} />
          </div>
        </div>
      </Section>

      {/* Valuation */}
      <Section icon={BarChart3} title="Valuation" empty={Object.values(f.valuation).every(v => v == null)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Stat label="P/E (TTM)" value={ratio(f.valuation.trailingPE)} />
          <Stat label="P/E Forward" value={ratio(f.valuation.forwardPE)} />
          <Stat label="PEG" value={ratio(f.valuation.pegRatio)} />
          <Stat label="P/B" value={ratio(f.valuation.priceToBook)} />
          <Stat label="P/S" value={ratio(f.valuation.priceToSales)} />
          <Stat label="EV/EBITDA" value={ratio(f.valuation.enterpriseToEbitda)} />
          <Stat label="EV/Revenue" value={ratio(f.valuation.enterpriseToRevenue)} />
        </div>
      </Section>

      {/* Profitability */}
      <Section icon={TrendingUp} title="Profitability" empty={Object.values(f.profitability).every(v => v == null)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2">
          <Stat label="Gross Margin" value={pct(f.profitability.grossMargin)} tone={(f.profitability.grossMargin ?? 0) > 0.3 ? "bull" : undefined} />
          <Stat label="Operating Margin" value={pct(f.profitability.operatingMargin)} tone={(f.profitability.operatingMargin ?? 0) > 0.15 ? "bull" : undefined} />
          <Stat label="Profit Margin" value={pct(f.profitability.profitMargin)} tone={(f.profitability.profitMargin ?? 0) > 0.1 ? "bull" : (f.profitability.profitMargin ?? 0) < 0 ? "bear" : undefined} />
          <Stat label="ROE" value={pct(f.profitability.returnOnEquity)} tone={(f.profitability.returnOnEquity ?? 0) > 0.15 ? "bull" : undefined} />
          <Stat label="ROA" value={pct(f.profitability.returnOnAssets)} />
          <Stat label="EBITDA Margin" value={pct(f.profitability.ebitdaMargin)} />
        </div>
      </Section>

      {/* Growth */}
      <Section icon={TrendingUp} title="Growth (YoY)" empty={Object.values(f.growth).every(v => v == null)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label="Revenue Growth" value={pct(f.growth.revenueGrowth)} tone={(f.growth.revenueGrowth ?? 0) > 0.1 ? "bull" : (f.growth.revenueGrowth ?? 0) < 0 ? "bear" : undefined} />
          <Stat label="Earnings Growth" value={pct(f.growth.earningsGrowth)} tone={(f.growth.earningsGrowth ?? 0) > 0.1 ? "bull" : (f.growth.earningsGrowth ?? 0) < 0 ? "bear" : undefined} />
          <Stat label="EPS Q-Growth" value={pct(f.growth.earningsQuarterlyGrowth)} tone={(f.growth.earningsQuarterlyGrowth ?? 0) > 0 ? "bull" : "bear"} />
        </div>
      </Section>

      {/* Financial Health */}
      <Section icon={ShieldCheck} title="Financial Health" empty={Object.values(f.health).every(v => v == null)}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Stat label="Total Cash" value={compactNumber(f.health.totalCash, cur)} />
          <Stat label="Total Debt" value={compactNumber(f.health.totalDebt, cur)} />
          <Stat label="Debt / Equity" value={ratio(f.health.debtToEquity)} hint="< 100 sehat" tone={(f.health.debtToEquity ?? 0) < 100 ? "bull" : (f.health.debtToEquity ?? 0) > 200 ? "bear" : undefined} />
          <Stat label="Current Ratio" value={ratio(f.health.currentRatio)} hint="> 1.5 sehat" tone={(f.health.currentRatio ?? 0) > 1.5 ? "bull" : (f.health.currentRatio ?? 0) < 1 ? "bear" : undefined} />
          <Stat label="Quick Ratio" value={ratio(f.health.quickRatio)} />
          <Stat label="Operating CF" value={compactNumber(f.health.operatingCashflow, cur)} />
          <Stat label="Free CF" value={compactNumber(f.health.freeCashflow, cur)} tone={(f.health.freeCashflow ?? 0) > 0 ? "bull" : "bear"} />
        </div>
      </Section>

      {/* Dividends & Earnings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section icon={Coins} title="Dividends" empty={f.dividends.dividendRate == null && f.dividends.dividendYield == null}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Dividend Rate" value={f.dividends.dividendRate != null ? f.dividends.dividendRate.toFixed(2) : "—"} />
            <Stat label="Dividend Yield" value={pct(f.dividends.dividendYield)} />
            <Stat label="Payout Ratio" value={pct(f.dividends.payoutRatio)} />
            <Stat label="Ex-Dividend" value={fmtDate(f.dividends.exDividendDate)} />
          </div>
        </Section>

        <Section icon={CalendarClock} title="Earnings & Analyst">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Next Earnings" value={fmtDate(f.earnings.nextEarningsDate)} />
            <Stat label="EPS (TTM)" value={ratio(f.earnings.epsTrailing)} />
            <Stat label="EPS Forward" value={ratio(f.earnings.epsForward)} />
            <Stat label="Analysts" value={f.recommendation.numAnalysts != null ? String(f.recommendation.numAnalysts) : "—"} />
            <Stat label="Recommendation" value={(f.recommendation.key ?? "—").replace("_", " ")} hint={`mean ${ratio(f.recommendation.mean)}`} />
            <Stat label="Target Price" value={f.recommendation.targetMean != null ? `${f.recommendation.targetMean.toFixed(2)}` : "—"} hint={f.recommendation.targetLow != null && f.recommendation.targetHigh != null ? `${f.recommendation.targetLow.toFixed(0)}–${f.recommendation.targetHigh.toFixed(0)}` : undefined} tone={recColor(f.recommendation.key) === "text-bull" ? "bull" : recColor(f.recommendation.key) === "text-bear" ? "bear" : undefined} />
          </div>
        </Section>
      </div>

      {/* Income Statement */}
      <Section icon={BarChart3} title="Income Statement (Annual)">
        <StatementsTable
          rows={f.statements.income}
          cols={[
            { key: "revenue", label: "Revenue" },
            { key: "grossProfit", label: "Gross Profit" },
            { key: "operatingIncome", label: "Operating Inc." },
            { key: "netIncome", label: "Net Income" },
          ]}
        />
      </Section>

      {/* Balance Sheet */}
      <Section icon={ShieldCheck} title="Balance Sheet (Annual)">
        <StatementsTable
          rows={f.statements.balance}
          cols={[
            { key: "totalAssets", label: "Assets" },
            { key: "totalLiab", label: "Liabilities" },
            { key: "totalEquity", label: "Equity" },
            { key: "cash", label: "Cash" },
          ]}
        />
      </Section>

      {/* Cashflow */}
      <Section icon={Coins} title="Cashflow (Annual)">
        <StatementsTable
          rows={f.statements.cashflow}
          cols={[
            { key: "operating", label: "Operating" },
            { key: "investing", label: "Investing" },
            { key: "financing", label: "Financing" },
            { key: "capex", label: "CapEx" },
          ]}
        />
      </Section>

      <div className="text-[10px] text-muted-foreground text-right">
        Data: Yahoo Finance · diperbarui {new Date(f.asOf).toLocaleTimeString()}
      </div>
    </div>
  );
}
