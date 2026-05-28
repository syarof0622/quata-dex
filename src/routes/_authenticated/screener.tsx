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
import { ALL_SECTORS, type Sector } from "@/lib/sectors";
import { Filter, Gem, ShieldAlert } from "lucide-react";
import { listDisclosureIntel } from "@/lib/disclosure-intel.functions";
import { DisclosureBadge } from "@/components/DisclosureBadge";
import { toast } from "sonner";

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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Filter className="size-5" /> Stock Screener</h1>
        <p className="text-sm text-muted-foreground">Technical + fundamental screening untuk peluang trade & undervalued</p>
      </div>

      <Tabs defaultValue="technical">
        <TabsList>
          <TabsTrigger value="technical"><Filter className="size-3.5 mr-1" /> Technical</TabsTrigger>
          <TabsTrigger value="undervalued"><Gem className="size-3.5 mr-1" /> Undervalued (Fundamental)</TabsTrigger>
          <TabsTrigger value="disclosure"><ShieldAlert className="size-3.5 mr-1" /> Disclosure / Corporate Action</TabsTrigger>
        </TabsList>

        <TabsContent value="technical" className="space-y-4">
      <div className="flex items-end justify-end flex-wrap gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["idx", "us", "global"] as const).map(m => (
            <Button key={m} size="sm" variant={f.market === m ? "default" : "ghost"} onClick={() => setF({ ...f, market: m })} className="h-7 px-3">
              {m === "idx" ? "🇮🇩 IDX" : m === "us" ? "🇺🇸 US" : "🌐 Global"}
            </Button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <Button key={p.name} size="sm" variant="outline" onClick={() => setF(p.apply(f))}>{p.name}</Button>
        ))}
      </div>

      {/* Filters */}
      <div className="panel p-4 grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="md:col-span-3">
          <label className="text-xs text-muted-foreground">Signal labels</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {LABELS.map(l => (
              <Button key={l} size="sm" variant={f.labels.has(l) ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => toggleLabel(l)}>
                {l.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>
        <NumPair label="Score" min={f.minScore} max={f.maxScore} setMin={v => setF({ ...f, minScore: v })} setMax={v => setF({ ...f, maxScore: v })} />
        <NumPair label="RSI" min={f.minRsi} max={f.maxRsi} setMin={v => setF({ ...f, minRsi: v })} setMax={v => setF({ ...f, maxRsi: v })} />
        <div>
          <label className="text-xs text-muted-foreground" title="Relative Volume = volume hari ini ÷ rata-rata 20 hari. >1.5× menandakan partisipasi di atas normal.">
            Min Relative Volume <span className="opacity-60">(RVOL)</span>
          </label>
          <Input type="number" step="0.1" value={f.minVolRel} onChange={e => setF({ ...f, minVolRel: parseFloat(e.target.value || "0") })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Min Trend (ADX)</label>
          <Input type="number" value={f.minTrend} onChange={e => setF({ ...f, minTrend: parseFloat(e.target.value || "0") })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sector</label>
          <select value={f.sector} onChange={e => setF({ ...f, sector: e.target.value as any })} className="w-full h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="all">All</option>
            {ALL_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sort by</label>
          <select value={f.sortBy} onChange={e => setF({ ...f, sortBy: e.target.value as any })} className="w-full h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="score">AI Score</option>
            <option value="changePct">% Change</option>
            <option value="rsi">RSI</option>
            <option value="volRel">Relative Volume (RVOL)</option>
            <option value="trendStrength">Trend</option>
          </select>
        </div>
        <div className="flex items-end justify-end text-xs text-muted-foreground md:col-span-6">
          {data.isFetching ? "Computing…" : `${rows.length} / ${data.data?.length ?? 0} match`}
        </div>
      </div>

      {/* Results */}
      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Sector</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Chg%</th>
              <th className="text-center p-2" title="Market direction bias — bukan instruksi entry langsung">Bias</th>
              <th className="text-center p-2" title="Apakah setup sudah valid untuk eksekusi">Action</th>
              <th className="text-center p-2" title="Trade setup quality grade">Setup</th>
              <th className="text-center p-2">Risk</th>
              <th className="text-right p-2">Score</th>
              <th className="text-right p-2">Conf</th>
              <th className="text-right p-2">RSI</th>
              <th className="text-right p-2">ADX</th>
              <th className="text-right p-2" title="Relative Volume = volume hari ini ÷ rata-rata 20 hari">RVOL</th>
              <th className="text-left p-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(q => (
              <tr key={q.symbol} className="border-t border-border hover:bg-accent/30">
                <td className="p-2 font-medium">
                  <Link to="/chart/$symbol" params={{ symbol: q.symbol }}>{q.symbol}</Link>
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
                <td className={`p-2 text-right font-mono ${q.volRel > 1.5 ? "text-bull" : ""}`} title={`Relative Volume: ${q.volRel.toFixed(2)}× rata-rata 20D`}>{q.volRel.toFixed(2)}×</td>
                <td className="p-2"><Sparkline values={q.sparkline} bull={q.score > 0} /></td>
              </tr>
            ))}
            {rows.length === 0 && !data.isFetching && (
              <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">Tidak ada saham yang cocok dengan filter.</td></tr>
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
    onSuccess: (r: any) => { toast.success(`Scan selesai: ${r.scanned} dianalisis, ${r.candidates.length} kandidat`); latest.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Scan gagal"),
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
    { key: "strong_undervalued", label: "Strong Undervalue", cls: "text-bull" },
    { key: "undervalued",        label: "Undervalued",       cls: "text-bull" },
    { key: "fair_value",         label: "Fair Value",        cls: "" },
    { key: "overvalued",         label: "Overvalued",        cls: "text-amber-500" },
    { key: "value_trap_risk",    label: "Value Trap",        cls: "text-bear" },
    { key: "insufficient_data",  label: "Insufficient Data", cls: "text-muted-foreground" },
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
          <label className="text-xs text-muted-foreground">Universe</label>
          <select value={universe} onChange={e => setUniverse(e.target.value as any)} className="h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="idx_lq45">IDX LQ45 (semua)</option>
            <option value="undervalued_candidates">Undervalued candidates</option>
            <option value="quality_undervalued">Quality + undervalued</option>
            <option value="dividend_undervalued">Dividend + undervalued</option>
            <option value="sector_discount">Sector discount</option>
            <option value="hybrid_trading_and_value">Hybrid trading + value</option>
            <option value="watchlist">Watchlist</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Classification</label>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value as any)} className="h-9 px-2 rounded-md bg-background border border-border text-sm">
            <option value="all">All</option>
            <option value="strong_undervalued">Strong Undervalue</option>
            <option value="undervalued">Undervalued</option>
            <option value="fair_value">Fair Value</option>
            <option value="overvalued">Overvalued</option>
            <option value="value_trap_risk">Value Trap</option>
            <option value="insufficient_data">Insufficient Data</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Limit</label>
          <Input type="number" min={1} max={30} value={limit} onChange={e => setLimit(parseInt(e.target.value || "10", 10))} className="w-24" />
        </div>
        <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
          {scan.isPending ? "Scanning…" : "Run Fundamental Scan"}
        </Button>
        <div className="text-[11px] text-muted-foreground ml-auto">
          Fundamental scan menggunakan data publik Yahoo Finance · skor dievaluasi 8 dimensi · saham dengan data tidak cukup ditandai INSUFFICIENT DATA, bukan undervalued.
        </div>
      </div>


      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Classification</th>
              <th className="text-right p-2" title="Final undervalue score (0-100)">Score</th>
              <th className="text-right p-2" title="Valuation (PER/PBV)">Val</th>
              <th className="text-right p-2" title="Quality (ROE/ROA/margin)">Qual</th>
              <th className="text-right p-2" title="Financial health (DER/FCF)">Health</th>
              <th className="text-right p-2" title="Growth (revenue/profit YoY)">Growth</th>
              <th className="text-right p-2" title="Dividend yield + payout">Div</th>
              <th className="text-right p-2" title="Sector relative">Sector</th>
              <th className="text-right p-2" title="Technical timing">Timing</th>
              <th className="text-right p-2" title="Value-trap risk (lower=better)">Trap</th>
              <th className="text-left p-2" title="Latest official IDX/BEI disclosure">Disclosure</th>
              <th className="text-left p-2">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.symbol} className="border-t border-border hover:bg-accent/30 align-top">
                <td className="p-2 font-mono font-medium">
                  <Link to="/chart/$symbol" params={{ symbol: r.symbol }}>{r.symbol}</Link>
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
                      <span className={tone} title={`${d.disclosure_type} · ${d.impact_level}/${d.sentiment} · ${new Date(d.published_at).toLocaleString("id-ID")}`}>
                        {d.disclosure_type}
                      </span>
                    );
                  })()}
                </td>
                <td className="p-2 text-xs text-muted-foreground max-w-[420px]">{r.reasoning ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && !scan.isPending && (
              <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">Belum ada skor undervalued. Klik <em>Run Fundamental Scan</em> untuk memulai.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NumPair({ label, min, max, setMin, setMax }: { label: string; min: number; max: number; setMin: (v: number) => void; setMax: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <Input type="number" value={min} onChange={e => setMin(parseFloat(e.target.value || "0"))} />
        <Input type="number" value={max} onChange={e => setMax(parseFloat(e.target.value || "0"))} />
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
          ["all", "All"],
          ["high_impact", "High Impact"],
          ["uma_suspension", "UMA / Suspension"],
          ["dividend_buyback", "Dividend / Buyback"],
          ["rights_issue", "Rights Issue"],
        ] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
            {label}
          </Button>
        ))}
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="panel p-6 text-center text-sm text-muted-foreground">
          Tidak ada disclosure / corporate action / regulatory event yang cocok.
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((d: any) => (
          <div key={`${d._bucket}-${d.id}`} className="panel p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-sm">{d.symbol}</div>
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
