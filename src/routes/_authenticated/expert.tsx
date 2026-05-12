import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { multiTimeframeSignal, positionSizer, correlationMatrix } from "@/lib/expert.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calculator, Layers, Network } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { TickerSearch } from "@/components/TickerSearch";

export const Route = createFileRoute("/_authenticated/expert")({
  head: () => ({ meta: [{ title: "Expert Tools — Quanta Terminal" }] }),
  component: ExpertPage,
});

function ExpertPage() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Expert Tools</h1>
        <p className="text-sm text-muted-foreground">Multi-timeframe analysis · risk-managed position sizing · cross-asset correlation.</p>
      </div>
      <Tabs defaultValue="mtf">
        <TabsList>
          <TabsTrigger value="mtf"><Layers className="size-4 mr-1" /> Multi-Timeframe</TabsTrigger>
          <TabsTrigger value="size"><Calculator className="size-4 mr-1" /> Position Sizer</TabsTrigger>
          <TabsTrigger value="corr"><Network className="size-4 mr-1" /> Correlation</TabsTrigger>
        </TabsList>
        <TabsContent value="mtf"><MTF /></TabsContent>
        <TabsContent value="size"><Sizer /></TabsContent>
        <TabsContent value="corr"><Corr /></TabsContent>
      </Tabs>
    </div>
  );
}

function MTF() {
  const [s, setS] = useState("AAPL");
  const q = useQuery({ queryKey: ["mtf", s], queryFn: () => multiTimeframeSignal({ data: { symbol: s.toUpperCase() } }) });
  return (
    <div className="space-y-3">
      <div className="panel p-4 flex gap-2 items-end">
        <div className="flex-1"><label className="text-xs text-muted-foreground">Symbol</label><Input value={s} onChange={e => setS(e.target.value)} /></div>
        <Button onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Computing…" : "Analyze"}</Button>
      </div>
      {q.data && (
        <div className="panel p-4">
          <div className="flex items-center gap-3">
            <span className={`text-xl font-semibold ${q.data.composite >= 25 ? "text-bull" : q.data.composite <= -25 ? "text-bear" : "text-muted-foreground"}`}>{q.data.label}</span>
            <span className="text-xs text-muted-foreground">composite {q.data.composite}</span>
            {q.data.aligned && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary">All aligned</span>}
          </div>
          <table className="w-full text-sm mt-3">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Timeframe</th><th className="text-left p-2">Label</th><th className="text-right p-2">Score</th><th className="text-right p-2">Confidence</th></tr></thead>
            <tbody>
              {q.data.byTimeframe.map((r: any) => (
                <tr key={r.tf} className="border-t border-border">
                  <td className="p-2 font-mono">{r.tf}</td>
                  <td className={`p-2 font-semibold ${r.score >= 25 ? "text-bull" : r.score <= -25 ? "text-bear" : ""}`}>{r.label}</td>
                  <td className="p-2 text-right font-mono">{r.score}</td>
                  <td className="p-2 text-right font-mono">{r.confidence?.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Sizer() {
  const [symbol, setSymbol] = useState("AAPL");
  const [account, setAccount] = useState("100000");
  const [risk, setRisk] = useState("1");
  const [entry, setEntry] = useState("");
  const m = useMutation({
    mutationFn: () => positionSizer({ data: { symbol: symbol.toUpperCase(), accountSize: Number(account), riskPct: Number(risk), entry: entry ? Number(entry) : undefined } }),
  });
  return (
    <div className="space-y-3">
      <div className="panel p-4 grid md:grid-cols-5 gap-2 items-end">
        <div><label className="text-xs text-muted-foreground">Symbol</label><Input value={symbol} onChange={e => setSymbol(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Account $</label><Input value={account} onChange={e => setAccount(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Risk %</label><Input value={risk} onChange={e => setRisk(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Entry (optional)</label><Input value={entry} onChange={e => setEntry(e.target.value)} placeholder="last close" /></div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "…" : "Calculate"}</Button>
      </div>
      {m.data && (
        <div className="grid md:grid-cols-4 gap-2">
          <Stat label="Entry" value={formatPrice(m.data.entry)} />
          <Stat label="ATR(14)" value={m.data.atr.toFixed(2)} />
          <Stat label="Stop (long)" value={formatPrice(m.data.suggestedStopLong)} tone="bear" />
          <Stat label="Stop (short)" value={formatPrice(m.data.suggestedStopShort)} tone="bear" />
          <Stat label="Target 1 (2× ATR)" value={formatPrice(m.data.target1)} tone="bull" />
          <Stat label="Target 2 (3.5× ATR)" value={formatPrice(m.data.target2)} tone="bull" />
          <Stat label="Risk $" value={"$" + m.data.riskDollar.toFixed(0)} />
          <Stat label="Risk / share" value={"$" + m.data.perShareRisk.toFixed(2)} />
          <Stat label="Position size" value={m.data.shares + " sh"} />
          <Stat label="Notional" value={"$" + m.data.notional.toFixed(0)} />
          <Stat label="R:R to T1" value={m.data.rr1.toFixed(2) + "R"} />
          <Stat label="R:R to T2" value={m.data.rr2.toFixed(2) + "R"} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-base ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function Corr() {
  const [raw, setRaw] = useState("AAPL,MSFT,NVDA,TSLA,SPY,QQQ");
  const m = useMutation({
    mutationFn: () => correlationMatrix({ data: { symbols: raw.split(",").map(s => s.trim()).filter(Boolean) } }),
  });
  const cellColor = (v: number) => {
    const intensity = Math.min(1, Math.abs(v));
    return v > 0
      ? `oklch(0.7 ${0.18 * intensity} 145 / ${0.15 + intensity * 0.6})`
      : `oklch(0.6 ${0.2 * intensity} 25 / ${0.15 + intensity * 0.6})`;
  };
  return (
    <div className="space-y-3">
      <div className="panel p-4 flex gap-2 items-end">
        <div className="flex-1"><label className="text-xs text-muted-foreground">Symbols (comma separated, 2–12)</label><Input value={raw} onChange={e => setRaw(e.target.value)} /></div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "…" : "Compute"}</Button>
      </div>
      {m.data && (
        <div className="panel p-3 overflow-auto">
          <div className="text-xs text-muted-foreground mb-2">Pearson correlation, last {m.data.lookback} daily returns</div>
          <table className="text-xs font-mono">
            <thead><tr><th className="p-2"></th>{m.data.symbols.map((s: string) => <th key={s} className="p-2">{s}</th>)}</tr></thead>
            <tbody>
              {m.data.symbols.map((s: string, i: number) => (
                <tr key={s}>
                  <th className="p-2 text-right">{s}</th>
                  {m.data!.matrix[i].map((v: number, j: number) => (
                    <td key={j} className="p-2 text-center min-w-[52px]" style={{ background: cellColor(v) }}>{v.toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
