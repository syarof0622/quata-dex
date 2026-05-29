import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getSystemHealth, type HealthStatus } from "@/lib/system-health.functions";
import { triggerWorker, type WorkerKey } from "@/lib/worker-test.functions";
import { formatDateTimeShortWIB } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, CircleSlash, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health")({
  component: HealthPage,
  head: () => ({ meta: [{ title: "System Health · Quanta Terminal" }] }),
});

type RunResult = { ok: boolean; status: number; message?: string; ranAt?: string; durationMs?: number };

const WORKERS: { key: WorkerKey; label: string; hint: string }[] = [
  { key: "news-ingest", label: "News Ingest", hint: "Fetch + dedupe artikel berita." },
  { key: "disclosure-ingest", label: "Disclosure Ingest", hint: "Snapshot disclosure, corp action, regulatory." },
  { key: "fundamentals", label: "Fundamentals Backfill", hint: "Refresh fundamental & sektor benchmark." },
  { key: "ai-agent", label: "AI Agent Worker", hint: "Jalankan auto-decision engine 1 siklus." },
  { key: "alerts", label: "Alerts Engine", hint: "Evaluasi semua rule alerts aktif." },
  { key: "news-disclosure-link", label: "News ↔ Disclosure", hint: "Linker korelasi berita & disclosure." },
  { key: "orders", label: "Orders Queue", hint: "Proses queued paper-trade orders." },
];

const STATUS_STYLES: Record<HealthStatus, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  partial: { label: "Partial", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  stale: { label: "Stale", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  degraded: { label: "Degraded", cls: "bg-orange-500/15 text-orange-300 border-orange-500/40" },
  failed: { label: "Failed", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
  unauthorized: { label: "Unauthorized", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
  not_configured: { label: "Not Configured", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  not_run_yet: { label: "Not Run Yet", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  no_recent_event: { label: "No Recent Event", cls: "bg-muted text-muted-foreground border-border" },
  no_new_data: { label: "No New Data", cls: "bg-muted text-muted-foreground border-border" },
  unknown: { label: "Unknown", cls: "bg-muted text-muted-foreground border-border" },
};

function fmtWIB(iso: string | null | undefined): string {
  return formatDateTimeShortWIB(iso);
}


function HealthPage() {
  const fetchHealth = useServerFn(getSystemHealth);
  const runWorker = useServerFn(triggerWorker);
  const [running, setRunning] = useState<WorkerKey | null>(null);
  const [results, setResults] = useState<Partial<Record<WorkerKey, RunResult>>>({});
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
  });

  async function handleRun(key: WorkerKey) {
    setRunning(key);
    try {
      const r = await runWorker({ data: { worker: key } });
      setResults((prev) => ({
        ...prev,
        [key]: { ok: r.ok, status: r.status, message: r.message, ranAt: r.ranAt, durationMs: (r as any).durationMs },
      }));
      if (r.ok) toast.success(`${key}: ${r.message ?? "ok"}`);
      else toast.error(`${key}: ${r.message ?? r.error ?? "failed"}`);
      refetch();
    } catch (e: any) {
      toast.error(`${key}: ${e?.message ?? "error"}`);
      setResults((prev) => ({ ...prev, [key]: { ok: false, status: 0, message: e?.message ?? "error" } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="size-5 text-primary" /> System Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Worker, data freshness, source health & audit trail. Diperbarui setiap 30 detik.
            {data ? ` Last updated: ${fmtWIB(data.generatedAt)}` : ""}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat status sistem…
        </div>
      )}
      {isError && (
        <Card className="border-rose-500/40">
          <CardContent className="p-4 text-sm text-rose-300 flex items-center gap-2">
            <AlertTriangle className="size-4" /> Gagal memuat system health. Coba refresh.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.cards.map((c) => {
              const s = STATUS_STYLES[c.status];
              return (
                <Card key={c.key} className="border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
                      <Badge variant="outline" className={s.cls}>{s.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm text-foreground">{c.detail}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Last updated: {fmtWIB(c.lastUpdatedAt)}
                    </p>
                    {c.metrics && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                        {Object.entries(c.metrics).map(([k, v]) => (
                          <span key={k}><span className="opacity-70">{k}:</span> {String(v ?? "—")}</span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PlayCircle className="size-4 text-primary" /> Test Workers
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Trigger pipeline manual untuk verifikasi. CRON_SECRET dipakai server-side dan tidak pernah dikirim ke browser.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {WORKERS.map((w) => {
                  const r = results[w.key];
                  const busy = running === w.key;
                  return (
                    <div key={w.key} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{w.label}</div>
                          <div className="text-[11px] text-muted-foreground">{w.hint}</div>
                        </div>
                        <button
                          onClick={() => handleRun(w.key)}
                          disabled={busy || running !== null}
                          className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-1 shrink-0"
                        >
                          {busy ? <Loader2 className="size-3 animate-spin" /> : <PlayCircle className="size-3" />}
                          {busy ? "Running…" : "Run"}
                        </button>
                      </div>
                      {r && (
                        <div className="text-[11px] flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={r.ok
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/40"}
                          >
                            {r.ok ? "OK" : "Failed"} · {r.status || "—"}
                          </Badge>
                          {typeof r.durationMs === "number" && (
                            <span className="text-muted-foreground">{r.durationMs}ms</span>
                          )}
                          <span className="text-muted-foreground">{fmtWIB(r.ranAt)}</span>
                          {r.message && (
                            <span className="text-muted-foreground basis-full truncate" title={r.message}>
                              {r.message}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>



          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                {data.consistency.ok ? (
                  <><CheckCircle2 className="size-4 text-emerald-400" /> Data Consistency OK</>
                ) : (
                  <><AlertTriangle className="size-4 text-amber-400" /> Data Consistency Warnings</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.consistency.ok ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada drift terdeteksi antara cash + holdings ↔ equity, order, dan posisi.
                </p>
              ) : (
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {data.consistency.warnings.map((w, i) => (
                    <li key={i} className="text-amber-300">{w}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Audit Trail (40 terakhir)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.audit.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <CircleSlash className="size-4" /> Belum ada audit log. Trigger worker / cron untuk
                  mulai mencatat.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.audit.map((row) => (
                    <div key={row.id} className="px-4 py-2 text-xs flex flex-wrap items-baseline gap-x-3">
                      <span className="text-muted-foreground tabular-nums">{fmtWIB(row.created_at)}</span>
                      <Badge variant="outline" className="text-[10px]">{row.module}</Badge>
                      <span className="font-medium">{row.action}</span>
                      <Badge variant="outline" className={STATUS_STYLES[(row.status as HealthStatus) ?? "unknown"]?.cls ?? STATUS_STYLES.unknown.cls}>
                        {row.status}
                      </Badge>
                      {row.message && <span className="text-muted-foreground">{row.message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
