import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { screenStocks } from "@/lib/screener.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPct, colorForChange } from "@/lib/format";
import { formatLocalPrice } from "@/lib/symbols";
import { ALL_SECTORS, type Sector } from "@/lib/sectors";
import { TrendingUp, Filter } from "lucide-react";

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
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Filter className="size-5" /> Stock Screener</h1>
          <p className="text-sm text-muted-foreground">Multi-faktor screening dengan AI signal v2</p>
        </div>
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
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Sector</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Chg%</th>
              <th className="text-center p-2">Signal</th>
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${labelColor(q.label)}`}>{q.label.replace("_", " ")}</span>
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
              <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Tidak ada saham yang cocok dengan filter.</td></tr>
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
