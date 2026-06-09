import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getLearningOverview,
  getSymbolMemory,
  getStrategyMemory,
  getSectorMemory,
  getRegimeMemory,
  getLearningEvents,
  getMissedOpportunities,
  runDailyLearningNow,
} from "@/lib/learning.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, PlayCircle, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHero } from "@/components/ui/page-hero";
import { seoHead } from "@/lib/seo-head";

export const Route = createFileRoute("/_authenticated/learning")({
  component: LearningPage,
  head: () => ({
    ...seoHead({
      path: "/learning",
      title: "Pusat Pembelajaran AI · Quanta Terminal",
      description: "Pantau bagaimana AI belajar dari riwayat trading paper Anda — memori per emiten, strategi, sektor, dan market regime.",
      noindex: true,
    }),
  }),
});

function pct(v: any, digits = 1) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function num(v: any, digits = 2) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}

function LearningPage() {
  const fOverview = useServerFn(getLearningOverview);
  const fSym = useServerFn(getSymbolMemory);
  const fStrat = useServerFn(getStrategyMemory);
  const fSec = useServerFn(getSectorMemory);
  const fReg = useServerFn(getRegimeMemory);
  const fEv = useServerFn(getLearningEvents);
  const fMiss = useServerFn(getMissedOpportunities);
  const fRun = useServerFn(runDailyLearningNow);
  const qc = useQueryClient();

  const overview = useQuery({ queryKey: ["learning-overview"], queryFn: () => fOverview() });
  const symbols = useQuery({ queryKey: ["learning-symbols"], queryFn: () => fSym() });
  const strategies = useQuery({ queryKey: ["learning-strategies"], queryFn: () => fStrat() });
  const sectors = useQuery({ queryKey: ["learning-sectors"], queryFn: () => fSec() });
  const regimes = useQuery({ queryKey: ["learning-regimes"], queryFn: () => fReg() });
  const events = useQuery({ queryKey: ["learning-events"], queryFn: () => fEv() });
  const missed = useQuery({ queryKey: ["learning-missed"], queryFn: () => fMiss() });

  const runMut = useMutation({
    mutationFn: () => fRun(),
    onSuccess: (r: any) => {
      toast.success(`Pembelajaran selesai: ${r?.summary ?? "ok"}`);
      qc.invalidateQueries({ queryKey: ["learning-overview"] });
      qc.invalidateQueries({ queryKey: ["learning-symbols"] });
      qc.invalidateQueries({ queryKey: ["learning-strategies"] });
      qc.invalidateQueries({ queryKey: ["learning-sectors"] });
      qc.invalidateQueries({ queryKey: ["learning-regimes"] });
      qc.invalidateQueries({ queryKey: ["learning-events"] });
    },
    onError: (e: any) => toast.error(`Gagal menjalankan pembelajaran: ${e?.message ?? "unknown"}`),
  });

  const ov = overview.data as any;
  const last = ov?.lastRun;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHero
        icon={Brain}
        title="Pusat Pembelajaran AI"
        description="AI Quanta Terminal belajar dari riwayat keputusan dan trade paper Anda. Halaman ini menampilkan memori per emiten, strategi, sektor, dan kondisi pasar."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ringkasan Pembelajaran</CardTitle>
          <Button size="sm" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            {runMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Jalankan Pembelajaran Sekarang
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Run terakhir" value={last?.run_finished_at ? new Date(last.run_finished_at).toLocaleString("id-ID") : "—"} />
          <Stat label="Status" value={last?.status ?? "—"} />
          <Stat label="Trade diproses" value={String(last?.trades_processed ?? 0)} />
          <Stat label="Emiten terlacak" value={String(ov?.totals?.symbolsTracked ?? 0)} />
          <Stat label="Strategi terlacak" value={String(ov?.totals?.strategiesTracked ?? 0)} />
          <Stat label="Cooldown aktif" value={String(ov?.totals?.activeCooldowns ?? 0)} />
          <Stat label="Strategi dipause" value={String(ov?.totals?.pausedStrategies ?? 0)} />
          <Stat label="Ringkasan" value={last?.summary ? truncate(last.summary, 80) : "Belum ada"} />
        </CardContent>
      </Card>

      <Tabs defaultValue="symbols">
        <TabsList className="flex-wrap">
          <TabsTrigger value="symbols">Per Emiten</TabsTrigger>
          <TabsTrigger value="strategies">Per Strategi</TabsTrigger>
          <TabsTrigger value="sectors">Per Sektor</TabsTrigger>
          <TabsTrigger value="regimes">Market Regime</TabsTrigger>
          <TabsTrigger value="missed">Missed Opportunity</TabsTrigger>
          <TabsTrigger value="events">Jurnal Pembelajaran</TabsTrigger>
        </TabsList>

        <TabsContent value="symbols">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Emiten</TableHead><TableHead>Sampel</TableHead><TableHead>Win Rate</TableHead>
                <TableHead>Avg Return</TableHead><TableHead>Profit Factor</TableHead>
                <TableHead>Adj. Confidence</TableHead><TableHead>Cooldown</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(symbols.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.symbol}</TableCell>
                    <TableCell>{s.sample_count}</TableCell>
                    <TableCell>{pct(s.win_rate)}</TableCell>
                    <TableCell>{num(s.avg_return_pct)}%</TableCell>
                    <TableCell>{num(s.profit_factor)}</TableCell>
                    <TableCell>{num(s.confidence_adjustment)}</TableCell>
                    <TableCell>{s.cooldown_until && new Date(s.cooldown_until) > new Date() ? <Badge variant="destructive">Aktif</Badge> : "—"}</TableCell>
                  </TableRow>
                ))}
                {(!symbols.data || symbols.data.length === 0) && <EmptyRow cols={7} />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="strategies">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Strategi</TableHead><TableHead>Mode</TableHead><TableHead>Sampel</TableHead>
                <TableHead>Win Rate</TableHead><TableHead>PF</TableHead>
                <TableHead>Allocation ×</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(strategies.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.strategy_mode}</TableCell>
                    <TableCell>{s.agent_mode ?? "—"}</TableCell>
                    <TableCell>{s.sample_count}</TableCell>
                    <TableCell>{pct(s.win_rate)}</TableCell>
                    <TableCell>{num(s.profit_factor)}</TableCell>
                    <TableCell>{num(s.allocation_multiplier)}</TableCell>
                    <TableCell>{s.is_paused ? <Badge variant="destructive">Pause: {s.pause_reason ?? "—"}</Badge> : <Badge variant="secondary">Aktif</Badge>}</TableCell>
                  </TableRow>
                ))}
                {(!strategies.data || strategies.data.length === 0) && <EmptyRow cols={7} />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sectors">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sektor</TableHead><TableHead>Sampel</TableHead><TableHead>Win Rate</TableHead>
                <TableHead>Avg Return</TableHead><TableHead>PF</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(sectors.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sector}</TableCell>
                    <TableCell>{s.sample_count}</TableCell>
                    <TableCell>{pct(s.win_rate)}</TableCell>
                    <TableCell>{num(s.avg_return_pct)}%</TableCell>
                    <TableCell>{num(s.profit_factor)}</TableCell>
                  </TableRow>
                ))}
                {(!sectors.data || sectors.data.length === 0) && <EmptyRow cols={5} />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="regimes">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Regime</TableHead><TableHead>Strategi</TableHead><TableHead>Sampel</TableHead>
                <TableHead>Win Rate</TableHead><TableHead>Allocation ×</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(regimes.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.market_regime}</TableCell>
                    <TableCell>{s.strategy_mode}</TableCell>
                    <TableCell>{s.sample_count}</TableCell>
                    <TableCell>{pct(s.win_rate)}</TableCell>
                    <TableCell>{num(s.allocation_multiplier)}</TableCell>
                  </TableRow>
                ))}
                {(!regimes.data || regimes.data.length === 0) && <EmptyRow cols={5} />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="missed">
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal Block</TableHead><TableHead>Emiten</TableHead>
                <TableHead>Harga Ref.</TableHead><TableHead>Max Upside</TableHead>
                <TableHead>Max Drawdown</TableHead><TableHead>Penilaian</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(missed.data ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{new Date(m.blocked_at).toLocaleString("id-ID")}</TableCell>
                    <TableCell className="font-medium">{m.symbol}</TableCell>
                    <TableCell>{num(m.reference_price)}</TableCell>
                    <TableCell>{num(m.max_upside_after_block_pct)}%</TableCell>
                    <TableCell>{num(m.max_drawdown_after_block_pct)}%</TableCell>
                    <TableCell>
                      {m.missed_opportunity ? <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Missed</Badge>
                        : m.was_good_block ? <Badge variant="secondary"><CheckCircle2 className="w-3 h-3 mr-1" />Block tepat</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {(!missed.data || missed.data.length === 0) && <EmptyRow cols={6} />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="events">
          <Card><CardContent className="pt-4 space-y-3">
            {(events.data ?? []).map((e: any) => (
              <div key={e.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{e.event_title ?? e.event_type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("id-ID")}</span>
                </div>
                <div className="text-muted-foreground">{e.event_summary ?? "—"}</div>
                <div className="mt-1 flex gap-2 text-xs">
                  {e.symbol && <Badge variant="outline">{e.symbol}</Badge>}
                  {e.strategy_mode && <Badge variant="outline">{e.strategy_mode}</Badge>}
                  {e.confidence_delta != null && <Badge variant="outline">Δ conf {num(e.confidence_delta)}</Badge>}
                </div>
              </div>
            ))}
            {(!events.data || events.data.length === 0) && <p className="text-sm text-muted-foreground">Belum ada peristiwa pembelajaran.</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
function EmptyRow({ cols }: { cols: number }) {
  return <TableRow><TableCell colSpan={cols} className="text-center text-muted-foreground py-6">Belum ada data. Jalankan pembelajaran setelah ada trade paper tertutup.</TableCell></TableRow>;
}
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
