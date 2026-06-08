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
import { PageHero } from "@/components/ui/page-hero";
import { Sparkles } from "lucide-react";
import { useLang } from "@/hooks/use-language";

import { seoHead } from "@/lib/seo-head";

export const Route = createFileRoute("/_authenticated/expert")({
  head: () => ({
    ...seoHead({
      path: "/expert",
      title: "Expert Tools — Quanta Terminal",
      description: "Advanced quantitative tools for IDX traders: factor analysis, regime detection, and strategy diagnostics.",
      noindex: true,
    }),
  }),
  component: ExpertPage,
});

function ExpertPage() {
  const { L } = useLang();
  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHero
        eyebrow={L.hero.expert.eyebrow}
        icon={Sparkles}
        title={L.hero.expert.title}
        subtitle={L.hero.expert.subtitle}
      />

      <Tabs defaultValue="mtf">
        <TabsList>
          <TabsTrigger value="mtf"><Layers className="size-4 mr-1" /> {L.tools.expert.tabMtf}</TabsTrigger>
          <TabsTrigger value="size"><Calculator className="size-4 mr-1" /> {L.tools.expert.tabSizer}</TabsTrigger>
          <TabsTrigger value="corr"><Network className="size-4 mr-1" /> {L.tools.expert.tabCorr}</TabsTrigger>
        </TabsList>
        <TabsContent value="mtf"><MTF /></TabsContent>
        <TabsContent value="size"><Sizer /></TabsContent>
        <TabsContent value="corr"><Corr /></TabsContent>
      </Tabs>
    </div>
  );
}

function MTF() {
  const { L } = useLang();
  const [s, setS] = useState("AAPL");
  const q = useQuery({ queryKey: ["mtf", s], queryFn: () => multiTimeframeSignal({ data: { symbol: s.toUpperCase() } }) });
  return (
    <div className="space-y-3">
      <div className="panel p-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">{L.tools.expert.symbolSearch}</label>
          <TickerSearch initialValue={s} placeholder="AAPL, NVDA, BBCA.JK…" onPick={(sym) => setS(sym)} />
        </div>
        <Button onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? L.tools.expert.computing : L.tools.expert.analyze}</Button>
      </div>
      {q.data && (
        <div className="panel p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xl font-semibold ${q.data.composite >= 25 ? "text-bull" : q.data.composite <= -25 ? "text-bear" : "text-muted-foreground"}`}>{q.data.label}</span>
            <span className="text-xs text-muted-foreground">{L.tools.expert.composite} {q.data.composite}</span>
            {q.data.alignmentLabel && (
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                q.data.alignmentTone === "bull" ? "bg-bull-soft text-bull" :
                q.data.alignmentTone === "bear" ? "bg-bear-soft text-bear" :
                q.data.alignmentTone === "warn" ? "bg-yellow-500/20 text-yellow-500" :
                "bg-accent/40 text-muted-foreground"
              }`}>{q.data.alignmentLabel}</span>
            )}
          </div>
          {q.data.recommendation && (
            <p className="mt-2 text-xs text-muted-foreground">{q.data.recommendation}</p>
          )}
          <table className="w-full text-sm mt-3">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">{L.tools.expert.thTimeframe}</th><th className="text-left p-2">{L.tools.expert.thLabel}</th><th className="text-right p-2">{L.tools.expert.thScore}</th><th className="text-right p-2">{L.tools.expert.thConfidence}</th></tr></thead>
            <tbody>
              {q.data.byTimeframe.map((r: any) => (
                <tr key={r.tf} className="border-t border-border">
                  <td className="p-2 font-mono">{r.tf}</td>
                  <td className={`p-2 font-semibold ${r.score >= 25 ? "text-bull" : r.score <= -25 ? "text-bear" : ""}`}>{r.valid === false ? "—" : r.label}</td>
                  <td className="p-2 text-right font-mono">{r.valid === false ? "—" : r.score}</td>
                  <td className="p-2 text-right font-mono">{r.valid === false ? "—" : r.confidence?.toFixed(0) + "%"}</td>
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
  const { L } = useLang();
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
        <div className="md:col-span-1"><label className="text-xs text-muted-foreground">{L.tools.expert.symbolSearchShort}</label><TickerSearch initialValue={symbol} placeholder="AAPL…" onPick={(sym) => setSymbol(sym)} /></div>
        <div><label className="text-xs text-muted-foreground">{L.tools.expert.account}</label><Input value={account} onChange={e => setAccount(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">{L.tools.expert.riskPct}</label><Input value={risk} onChange={e => setRisk(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">{L.tools.expert.entryOptional}</label><Input value={entry} onChange={e => setEntry(e.target.value)} placeholder={L.tools.expert.entryPh} /></div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "…" : L.tools.expert.calculate}</Button>
      </div>
      {m.data && (
        <div className="grid md:grid-cols-4 gap-2">
          <Stat label={L.tools.expert.statEntry} value={formatPrice(m.data.entry)} />
          <Stat label={L.tools.expert.statAtr} value={m.data.atr.toFixed(2)} />
          <Stat label={L.tools.expert.statStopLong} value={formatPrice(m.data.suggestedStopLong)} tone="bear" />
          <Stat label={L.tools.expert.statStopShort} value={formatPrice(m.data.suggestedStopShort)} tone="bear" />
          <Stat label={L.tools.expert.statT1} value={formatPrice(m.data.target1)} tone="bull" />
          <Stat label={L.tools.expert.statT2} value={formatPrice(m.data.target2)} tone="bull" />
          <Stat label={L.tools.expert.statRiskDollar} value={"$" + m.data.riskDollar.toFixed(0)} />
          <Stat label={L.tools.expert.statPerShare} value={"$" + m.data.perShareRisk.toFixed(2)} />
          <Stat label={L.tools.expert.statShares} value={m.data.shares + " sh"} />
          <Stat label={L.tools.expert.statNotional} value={"$" + m.data.notional.toFixed(0)} />
          <Stat label={L.tools.expert.statRR1} value={m.data.rr1.toFixed(2) + "R"} />
          <Stat label={L.tools.expert.statRR2} value={m.data.rr2.toFixed(2) + "R"} />
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
  const { L } = useLang();
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
        <div className="flex-1"><label className="text-xs text-muted-foreground">{L.tools.expert.symbolsLabel}</label><Input value={raw} onChange={e => setRaw(e.target.value)} /></div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "…" : L.tools.expert.compute}</Button>
      </div>
      {m.data && (
        <div className="panel p-3 overflow-auto">
          <div className="text-xs text-muted-foreground mb-2">{L.tools.expert.pearson.replace("{n}", String(m.data.lookback))}</div>
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
