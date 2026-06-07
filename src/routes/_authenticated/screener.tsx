import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { screenStocks } from "@/lib/screener.functions";
import { scanUndervalueUniverse, getLatestUndervalueScores } from "@/lib/undervalue.functions";
import { listOfficialDisclosures } from "@/lib/disclosures.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UndervalueBadge } from "@/components/UndervalueBadge";
import { formatPct, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { displaySymbol } from "@/lib/display-symbol";
import { ALL_SECTORS, type Sector } from "@/lib/sectors";
import { Filter, Gem, ShieldAlert } from "lucide-react";
import { listDisclosureIntel } from "@/lib/disclosure-intel.functions";
import { DisclosureBadge } from "@/components/DisclosureBadge";
import { toast } from "sonner";
import { PageHero } from "@/components/ui/page-hero";
import { useLang } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/screener")({
  head: () => ({ meta: [{ title: "Screener — Quanta Terminal" }] }),
  component: Screener,
});

const LABELS = ["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"] as const;

type Filters = {
  market: "idx" | "us" | "global";
  labels: Set<string>;
  minScore: number;
  maxScore: number;
  minRsi: number;
  maxRsi: number;
  minVolRel: number;
  minTrend: number;
  sector: Sector | "all";
  sortBy: "score" | "changePct" | "rsi" | "volRel" | "trendStrength";
};

const DEFAULT: Filters = {
  market: "idx",
  labels: new Set(["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"]),
  minScore: -100,
  maxScore: 100,
  minRsi: 0,
  maxRsi: 100,
  minVolRel: 0,
  minTrend: 0,
  sector: "all",
  sortBy: "score",
};

const PRESETS: { name: string; apply: (f: Filters) => Filters }[] = [
  { name: "🚀 Strong Buy", apply: f => ({ ...f, labels: new Set(["STRONG_BUY"]), minScore: 50 }) },
  { name: "📈 Bullish + Volume", apply: f => ({ ...f, labels: new Set(["STRONG_BUY", "BUY"]), minVolRel: 1.5, minTrend: 25 }) },
  { name: "💎 Oversold Bounce", apply: f => ({ ...f, maxRsi: 35, labels: new Set(["BUY", "HOLD"]) }) },
  { name: "⚠️ Overbought Risk", apply: f => ({ ...f, minRsi: 70, labels: new Set(["SELL", "STRONG_SELL", "HOLD"]) }) },
  { name: "🔥 Trending Strong", apply: f => ({ ...f, minTrend: 40, minScore: 30 }) },
  { name: "📉 Strong Sell", apply: f => ({ ...f, labels: new Set(["STRONG_SELL"]), maxScore: -50 }) },
  { name: "🌊 Reset", apply: () => DEFAULT },
];

function Screener() {
  const { L } = useLang();
  const [f, setF] = useState<Filters>(DEFAULT);
  const data = useQuery({
    queryKey: ["screen", f.market],
    queryFn: () => screenStocks({ data: { market: f.market } }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const r = (data.data ?? []).filter(x => {
      if (!f.labels.has(x.label)) return false;
      if (x.score < f.minScore || x.score > f.maxScore) return false;
      if (x.rsi < f.minRsi || x.rsi > f.maxRsi) return false;
      if (x.volRel < f.minVolRel) return false;
      if (x.trendStrength < f.minTrend) return false;
      if (f.sector !== "all" && x.sector !== f.sector) return false;
      return true;
    });
    return r.sort((a, b) => {
      const av = (a as any)[f.sortBy] ?? 0, bv = (b as any)[f.sortBy] ?? 0;
      return bv - av;
    });
  }, [data.data, f]);

  const toggleLabel = (l: string) => {
    const s = new Set(f.labels);
    s.has(l) ? s.delete(l) : s.add(l);
    setF({ ...f, labels: s });
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden p-3 sm:p-4 md:p-6">
      <PageHero
        eyebrow={L.hero.screener.eyebrow}
        icon={Filter}
        title={L.hero.screener.title}
        subtitle={L.hero.screener.subtitle}
      />


      <Tabs defaultValue="technical" className="min-w-0 max-w-full">
        <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto overflow-y-hidden rounded-xl p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="technical" className="h-8 shrink-0"><Filter className="size-3.5 mr-1" /> {L.tools.screener.tabTechnical}</TabsTrigger>
          <TabsTrigger value="undervalued" className="h-8 shrink-0"><Gem className="size-3.5 mr-1" /> {L.tools.screener.tabUndervalued}</TabsTrigger>
          <TabsTrigger value="disclosure" className="h-8 shrink-0"><ShieldAlert className="size-3.5 mr-1" /> {L.tools.screener.tabDisclosure}</TabsTrigger>
        </TabsList>

        <TabsContent value="technical" className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-end justify-start gap-3 sm:justify-end">
        <div className="flex w-full min-w-0 overflow-x-auto rounded-md border border-border p-0.5 sm:w-auto">
          {(["idx", "us", "global"] as const).map(m => (
            <Button key={m} size="sm" variant={f.market === m ? "default" : "ghost"} onClick={() => setF({ ...f, market: m })} className="h-7 flex-1 shrink-0 px-3 sm:flex-none">
              {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
            </Button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="flex min-w-0 flex-wrap gap-2">
        {PRESETS.map(p => (
          <Button key={p.name} size="sm" variant="outline" onClick={() => setF(p.apply(f))} className="min-w-0 whitespace-normal text-left leading-tight sm:whitespace-nowrap">{p.name}</Button>
        ))}
      </div>

      {/* Filters */}
      <div className="panel grid min-w-0 grid-cols-1 gap-3 p-3 sm:grid-cols-2 md:p-4 lg:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-2">
          <label className="text-xs text-muted-foreground">{L.tools.screener.labelSignal}</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {LABELS.map(l => (
              <Button key={l} size="sm" variant={f.labels.has(l) ? "default" : "outline"} className="h-7 min-w-0 text-[11px]" onClick={() => toggleLabel(l)}>
                {l.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>
        <NumPair label={L.tools.screener.thScore} min={f.minScore} max={f.maxScore} setMin={v => setF({ ...f, minScore: v })} setMax={v => setF({ ...f, maxScore: v })} />
        <NumPair label={L.tools.screener.thRsi} min={f.minRsi} max={f.maxRsi} setMin={v => setF({ ...f, minRsi: v })} setMax={v => setF({ ...f, maxRsi: v })} />
        <div className="min-w-0">
          <label className="text-xs text-muted-foreground" title={L.tools.screener.rvolTooltip}>
            {L.tools.screener.minRvol} <span className="opacity-60">(RVOL)</span>
          </label>
          <Input type="number" step="0.1" value={f.minVolRel} onChange={e => setF({ ...f, minVolRel: parseFloat(e.target.value || "0") })} />
        </div>
        <div className="min-w-0">
          <label className="text-xs text-muted-foreground">{L.tools.screener.minTrend}</label>
          <Input type="number" value={f.minTrend} onChange={e => setF({ ...f, minTrend: parseFloat(e.target.value || "0") })} />
        </div>
        <div className="min-w-0">
          <label className="text-xs text-muted-foreground">{L.tools.screener.sector}</label>
          <select value={f.sector} onChange={e => setF({ ...f, sector: e.target.value as any })} className="w-full h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="all">{L.tools.screener.all}</option>
            {ALL_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="text-xs text-muted-foreground">{L.tools.screener.sortBy}</label>
          <select value={f.sortBy} onChange={e => setF({ ...f, sortBy: e.target.value as any })} className="w-full h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="score">{L.tools.screener.sortScore}</option>
            <option value="changePct">{L.tools.screener.sortChangePct}</option>
            <option value="rsi">{L.tools.screener.sortRsi}</option>
            <option value="volRel">{L.tools.screener.sortRvol}</option>
            <option value="trendStrength">{L.tools.screener.sortTrend}</option>
          </select>
        </div>
        <div className="flex min-w-0 items-end justify-start text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-6 xl:justify-end">
          {data.isFetching ? L.tools.screener.computing : L.tools.screener.matchCount.replace("{n}", String(rows.length)).replace("{total}", String(data.data?.length ?? 0))}
        </div>
      </div>

      {/* Results */}
      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">{L.tools.screener.thSymbol}</th>
              <th className="text-left p-2">{L.tools.screener.thSector}</th>
              <th className="text-right p-2">{L.tools.screener.thPrice}</th>
              <th className="text-right p-2">{L.tools.screener.thChange}</th>
              <th className="text-center p-2" title={L.tools.screener.thBiasTip}>{L.tools.screener.thBias}</th>
              <th className="text-center p-2" title={L.tools.screener.thActionTip}>{L.tools.screener.thAction}</th>
              <th className="text-center p-2" title={L.tools.screener.thSetupTip}>{L.tools.screener.thSetup}</th>
              <th className="text-center p-2">{L.tools.screener.thRisk}</th>
              <th className="text-right p-2">{L.tools.screener.thScore}</th>
              <th className="text-right p-2">{L.tools.screener.thConf}</th>
              <th className="text-right p-2">{L.tools.screener.thRsi}</th>
              <th className="text-right p-2">{L.tools.screener.thAdx}</th>
              <th className="text-right p-2" title={L.tools.screener.rvolTooltip}>{L.tools.screener.thRvol}</th>
              <th className="text-left p-2">{L.tools.screener.thTrend}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(q => (
              <tr key={q.symbol} className="border-t border-border hover:bg-accent/30">
                <td className="p-2 font-medium">
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }}>{displaySymbol(q.symbol)}</Link>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[16ch]">{q.shortName}</div>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{q.sector}</td>
                <td className="p-2 text-right font-mono">{formatLocalPrice(q.symbol, q.price)}</td>
                <td className={`p-2 text-right font-mono ${colorForChange(q.changePct)}`}>{formatPct(q.changePct)}</td>
                <td className="p-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    (q as any).bias === "BUY" ? "bg-bull-soft text-bull" :
                    (q as any).bias === "SELL" ? "bg-bear-soft text-bear" :
                    "bg-accent/40 text-muted-foreground"
                  }`}>{(q as any).bias ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    (q as any).action === "READY" ? "bg-bull text-primary-foreground" :
                    (q as any).action === "NO TRADE" ? "bg-accent/40 text-muted-foreground" :
                    "bg-yellow-500/20 text-yellow-500"
                  }`}>{(q as any).action ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    (q as any).setupGrade === "Excellent" ? "bg-bull text-primary-foreground" :
                    (q as any).setupGrade === "Good" ? "bg-bull-soft text-bull" :
                    (q as any).setupGrade === "Fair" ? "bg-yellow-500/20 text-yellow-500" :
                    (q as any).setupGrade === "Poor" ? "bg-bear-soft text-bear" :
                    "bg-accent/40 text-muted-foreground"
                  }`}>{(q as any).setupGrade ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  <span className={`text-[10px] ${
                    (q as any).riskLabel === "Low" ? "text-bull" :
                    (q as any).riskLabel === "Extreme" ? "text-bear" :
                    (q as any).riskLabel === "High" ? "text-yellow-500" :
                    "text-muted-foreground"
                  }`}>{(q as any).riskLabel ?? "—"}</span>
                </td>
                <td className={`p-2 text-right font-mono ${q.score > 0 ? "text-bull" : q.score < 0 ? "text-bear" : ""}`}>{q.score}</td>
                <td className="p-2 text-right font-mono">{q.confidence}</td>
                <td className={`p-2 text-right font-mono ${q.rsi > 70 ? "text-bear" : q.rsi < 30 ? "text-bull" : ""}`}>{q.rsi}</td>
                <td className="p-2 text-right font-mono">{q.trendStrength}</td>
                <td className={`p-2 text-right font-mono ${q.volRel > 1.5 ? "text-bull" : ""}`} title={`Relative Volume: ${q.volRel.toFixed(2)}× 20D avg`}>{q.volRel.toFixed(2)}×</td>
                <td className="p-2"><Sparkline values={q.sparkline} bull={q.score > 0} /></td>
              </tr>
            ))}
            {rows.length === 0 && !data.isFetching && (
              <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">{L.tools.screener.noMatch}</td></tr>
            )}
          </tbody>
        </table>
      </div>
        </TabsContent>


        <TabsContent value="undervalued" className="space-y-4">
          <UndervaluedPanel />
        </TabsContent>

        <TabsContent value="disclosure" className="space-y-4">
          <DisclosurePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UndervaluedPanel() {
  const { L } = useLang();
  const [universe, setUniverse] = useState<"idx_lq45" | "undervalued_candidates" | "quality_undervalued" | "dividend_undervalued" | "sector_discount" | "hybrid_trading_and_value" | "watchlist">("idx_lq45");
  const [limit, setLimit] = useState(15);
  const [classFilter, setClassFilter] = useState<"all" | "strong_undervalued" | "undervalued" | "fair_value" | "overvalued" | "value_trap_risk" | "insufficient_data">("all");
  const latest = useQuery({
    queryKey: ["undervalue-latest"],
    queryFn: () => getLatestUndervalueScores({ data: { limit: 50 } }),
    refetchInterval: 60_000,
  });
  const disclosures = useQuery({
    queryKey: ["official-disclosures-recent"],
    queryFn: () => listOfficialDisclosures({ data: { limit: 100 } }),
    refetchInterval: 120_000,
  });
  const disclosureBySymbol = useMemo(() => {
    const map: Record<string, any> = {};
    for (const d of (disclosures.data ?? [])) {
      const base = d.symbol.replace(/\.JK$/i, "");
      if (!map[base]) map[base] = d;
    }
    return map;
  }, [disclosures.data]);
  const scan = useMutation({
    mutationFn: () => scanUndervalueUniverse({ data: { universe, limit } }),
    onSuccess: (r: any) => { toast.success(L.tools.screener.scanDone.replace("{scanned}", String(r.scanned)).replace("{n}", String(r.candidates.length))); latest.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? L.tools.screener.scanFailed),
  });
  const baseRows: any[] = (scan.data as any)?.candidates?.length
    ? (scan.data as any).candidates
    : (latest.data ?? []).map((r: any) => ({
        symbol: r.symbol,
        classification: r.classification,
        finalUndervalueScore: r.final_undervalue_score,
        valuationScore: r.valuation_score,
        qualityScore: r.quality_score,
        financialHealthScore: r.financial_health_score,
        growthScore: r.growth_score,
        dividendScore: r.dividend_score,
        sectorRelativeScore: r.sector_relative_score,
        technicalTimingScore: r.technical_timing_score,
        valueTrapRiskScore: r.value_trap_risk_score,
        reasoning: r.reasoning,
      }));
  const rows = classFilter === "all" ? baseRows : baseRows.filter((r: any) => r.classification === classFilter);

  // Summary tally for the cards.
  const tally = baseRows.reduce((acc: Record<string, number>, r: any) => {
    const k = String(r.classification ?? "insufficient_data");
    acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);

  const cards: { key: typeof classFilter; label: string; cls: string }[] = [
    { key: "strong_undervalued", label: L.tools.screener.uvClassStrong, cls: "text-bull" },
    { key: "undervalued",        label: L.tools.screener.uvClassUnder,  cls: "text-bull" },
    { key: "fair_value",         label: L.tools.screener.uvClassFair,   cls: "" },
    { key: "overvalued",         label: L.tools.screener.uvClassOver,   cls: "text-amber-500" },
    { key: "value_trap_risk",    label: L.tools.screener.uvClassTrap,   cls: "text-bear" },
    { key: "insufficient_data",  label: L.tools.screener.uvClassInsufficient, cls: "text-muted-foreground" },
  ];


  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {cards.map(c => (
          <button
            key={c.key}
            onClick={() => setClassFilter(classFilter === c.key ? "all" : c.key)}
            className={`panel p-3 text-left hover:border-primary/40 transition-colors ${classFilter === c.key ? "ring-1 ring-primary" : ""}`}
          >
            <div className={`text-xs ${c.cls}`}>{c.label}</div>
            <div className="text-lg font-semibold font-mono">{tally[c.key] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="panel p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">{L.tools.screener.universe}</label>
          <select value={universe} onChange={e => setUniverse(e.target.value as any)} className="h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="idx_lq45">IDX LQ45</option>
            <option value="undervalued_candidates">Undervalued candidates</option>
            <option value="quality_undervalued">Quality + undervalued</option>
            <option value="dividend_undervalued">Dividend + undervalued</option>
            <option value="sector_discount">Sector discount</option>
            <option value="hybrid_trading_and_value">Hybrid trading + value</option>
            <option value="watchlist">Watchlist</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{L.tools.screener.classification}</label>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value as any)} className="h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="all">{L.tools.screener.all}</option>
            <option value="strong_undervalued">{L.tools.screener.uvClassStrong}</option>
            <option value="undervalued">{L.tools.screener.uvClassUnder}</option>
            <option value="fair_value">{L.tools.screener.uvClassFair}</option>
            <option value="overvalued">{L.tools.screener.uvClassOver}</option>
            <option value="value_trap_risk">{L.tools.screener.uvClassTrap}</option>
            <option value="insufficient_data">{L.tools.screener.classInsufficient}</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{L.tools.screener.limit}</label>
          <Input type="number" min={1} max={30} value={limit} onChange={e => setLimit(parseInt(e.target.value || "10", 10))} className="w-24" />
        </div>
        <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
          {scan.isPending ? L.tools.screener.scanning : L.tools.screener.runFundamental}
        </Button>
        <div className="text-[11px] text-muted-foreground ml-auto">
          {L.tools.screener.fundamentalFootnote}
        </div>
      </div>


      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">{L.tools.screener.thSymbol}</th>
              <th className="text-left p-2">{L.tools.screener.classification}</th>
              <th className="text-right p-2" title="Final undervalue score (0-100)">{L.tools.screener.thScore}</th>
              <th className="text-right p-2" title="Valuation (PER/PBV)">{L.tools.screener.thVal}</th>
              <th className="text-right p-2" title="Quality (ROE/ROA/margin)">{L.tools.screener.thQual}</th>
              <th className="text-right p-2" title="Financial health (DER/FCF)">{L.tools.screener.thHealth}</th>
              <th className="text-right p-2" title="Growth (revenue/profit YoY)">{L.tools.screener.thGrowth}</th>
              <th className="text-right p-2" title="Dividend yield + payout">{L.tools.screener.thDiv}</th>
              <th className="text-right p-2" title="Sector relative">{L.tools.screener.thSectorRel}</th>
              <th className="text-right p-2" title="Technical timing">{L.tools.screener.thTiming}</th>
              <th className="text-right p-2" title="Value-trap risk (lower=better)">{L.tools.screener.thTrap}</th>
              <th className="text-left p-2" title="Latest official IDX/BEI disclosure">{L.tools.screener.thDisclosure}</th>
              <th className="text-left p-2">{L.tools.screener.thReason}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.symbol} className="border-t border-border hover:bg-accent/30 align-top">
                <td className="p-2 font-mono font-medium">
                  <Link to="/chart/$symbol" params={{ symbol: r.symbol }}>{displaySymbol(r.symbol)}</Link>
                </td>
                <td className="p-2"><UndervalueBadge classification={r.classification} /></td>
                <td className={`p-2 text-right font-mono ${r.finalUndervalueScore >= 65 ? "text-bull" : r.finalUndervalueScore < 50 ? "text-bear" : ""}`}>{Number(r.finalUndervalueScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.valuationScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.qualityScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.financialHealthScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.growthScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.dividendScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.sectorRelativeScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-right font-mono">{Number(r.technicalTimingScore ?? 0).toFixed(0)}</td>
                <td className={`p-2 text-right font-mono ${Number(r.valueTrapRiskScore ?? 0) >= 60 ? "text-bear" : ""}`}>{Number(r.valueTrapRiskScore ?? 0).toFixed(0)}</td>
                <td className="p-2 text-xs">
                  {(() => {
                    const base = String(r.symbol ?? "").replace(/\.JK$/i, "");
                    const d = disclosureBySymbol[base];
                    if (!d) return <span className="text-muted-foreground">—</span>;
                    const tone = d.impact_level === "high" && d.sentiment === "negative" ? "text-bear"
                      : d.disclosure_type === "suspension" || d.disclosure_type === "uma" ? "text-bear"
                      : d.sentiment === "positive" ? "text-bull" : "text-muted-foreground";
                    return (
                      <span className={tone} title={`${d.disclosure_type} · ${d.impact_level}/${d.sentiment} · ${new Date(d.published_at).toLocaleString()}`}>
                        {d.disclosure_type}
                      </span>
                    );
                  })()}
                </td>
                <td className="p-2 text-xs text-muted-foreground max-w-[420px]">{r.reasoning ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && !scan.isPending && (
              <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">{L.tools.screener.noUndervalued}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NumPair({ label, min, max, setMin, setMax }: { label: string; min: number; max: number; setMin: (v: number) => void; setMax: (v: number) => void }) {
  return (
    <div className="min-w-0">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="grid min-w-0 grid-cols-2 gap-1">
        <Input className="min-w-0" type="number" value={min} onChange={e => setMin(parseFloat(e.target.value || "0"))} />
        <Input className="min-w-0" type="number" value={max} onChange={e => setMax(parseFloat(e.target.value || "0"))} />
      </div>
    </div>
  );
}

function labelColor(l: string) {
  if (l === "STRONG_BUY") return "bg-bull text-primary-foreground";
  if (l === "BUY") return "bg-bull-soft text-bull";
  if (l === "STRONG_SELL") return "bg-bear text-primary-foreground";
  if (l === "SELL") return "bg-bear-soft text-bear";
  return "bg-accent/40 text-muted-foreground";
}

export function Sparkline({ values, bull, width = 80, height = 24 }: { values: number[]; bull?: boolean; width?: number; height?: number }) {
  if (!values?.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1 || 1);
  const points = values.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(" ");
  const color = bull ? "stroke-bull" : "stroke-bear";
  return (
    <svg width={width} height={height} className={`inline-block ${color}`}>
      <polyline fill="none" strokeWidth="1.5" points={points} />
    </svg>
  );
}

function DisclosurePanel() {
  const [filter, setFilter] = useState<"all" | "high_impact" | "uma_suspension" | "dividend_buyback" | "rights_issue">("all");
  const q = useQuery({
    queryKey: ["disclosure-screener"],
    queryFn: () => listDisclosureIntel({ data: { limit: 60 } }),
    refetchInterval: 5 * 60_000,
  });
  const data = q.data ?? { disclosures: [], corporateActions: [], regulatoryEvents: [] };
  const all = [
    ...data.disclosures.map((d: any) => ({ ...d, _bucket: "official" })),
    ...data.corporateActions.map((d: any) => ({ ...d, _bucket: "corporate_action" })),
    ...data.regulatoryEvents.map((d: any) => ({ ...d, _bucket: "regulatory" })),
  ];
  const rows = all.filter((d: any) => {
    if (filter === "all") return true;
    const kind = (d.disclosure_type || d.action_type || d.event_type || "").toLowerCase();
    if (filter === "high_impact") return d.is_high_impact || (d.impact_score ?? 0) >= 70;
    if (filter === "uma_suspension") return /uma|suspen|delist/.test(kind);
    if (filter === "dividend_buyback") return /dividend|dividen|buyback/.test(kind);
    if (filter === "rights_issue") return /right|dilut/.test(kind);
    return true;
  }).sort((a: any, b: any) => {
    const ad = a.published_at || a.announcement_date || "";
    const bd = b.published_at || b.announcement_date || "";
    return bd.localeCompare(ad);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {([
          ["all", "Semua"],
          ["high_impact", "Dampak Tinggi"],
          ["uma_suspension", "UMA / Suspension"],
          ["dividend_buyback", "Dividend / Buyback"],
          ["rights_issue", "Rights Issue"],
        ] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
            {label}
          </Button>
        ))}
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Memuat…</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="panel p-6 text-center text-sm text-muted-foreground">
          Tidak ada disclosure / corporate action / regulatory event yang cocok.
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((d: any) => (
          <div key={`${d._bucket}-${d.id}`} className="panel p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-sm">{displaySymbol(d.symbol)}</div>
              <DisclosureBadge disclosure={d} compact />
            </div>
            <div className="text-sm font-medium line-clamp-2">{d.title}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
              <span>{d._bucket}</span>
              <span>·</span>
              <span>{(d.published_at || d.announcement_date || "").slice(0, 10)}</span>
              {d.source ? (<><span>·</span><span>{d.source}</span></>) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
