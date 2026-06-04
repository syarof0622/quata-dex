import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAutonomousAgentStatus } from "@/lib/autonomous-status.functions";
import { setAgentAggressionMode, getProfitDiagnostics } from "@/lib/ai-trade-agent.functions";
import { getLossDiagnostics } from "@/lib/loss-diagnostics.functions";
import { AGGRESSION_PRESETS, type AggressionMode } from "@/lib/agent-aggression-modes";
import { cn } from "@/lib/utils";
import { Bot, ShieldCheck, AlertTriangle, Activity, Target, TrendingDown, TrendingUp, Pause, Zap, ShieldAlert, Clock } from "lucide-react";

const TONE: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  slate: "bg-slate-500/10 text-slate-300 border-slate-500/30",
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function rel(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function AutonomousAgentPanel() {
  const fetchStatus = useServerFn(getAutonomousAgentStatus);
  const fetchDiag = useServerFn(getProfitDiagnostics);
  const setMode = useServerFn(setAgentAggressionMode);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["autonomous-agent-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const { data: diag } = useQuery({
    queryKey: ["agent-profit-diagnostics"],
    queryFn: () => fetchDiag(),
    refetchInterval: 60_000,
  });
  const fetchLoss = useServerFn(getLossDiagnostics);
  const { data: loss } = useQuery({
    queryKey: ["agent-loss-diagnostics"],
    queryFn: () => fetchLoss(),
    refetchInterval: 45_000,
  });
  const modeMutation = useMutation({
    mutationFn: async (mode: AggressionMode) => {
      const agentId = (data as any)?.agent?.id;
      if (!agentId) throw new Error("Agent belum aktif.");
      return setMode({ data: { id: agentId, mode } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autonomous-agent-status"] });
      qc.invalidateQueries({ queryKey: ["agent-profit-diagnostics"] });
    },
  });

  if (isLoading || !data) {
    return <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">Loading autonomous agent status…</div>;
  }

  const a = data.agent;
  const tone = a?.worker.tone ?? "slate";
  const currentMode = (diag?.mode ?? "balanced") as AggressionMode;

  return (
    <div className="space-y-3">
      {/* Worker status header */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", TONE[tone])}>
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{a?.name ?? "AI Trade Agent"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                Risk mode: <span className="font-mono">{a?.riskMode ?? "—"}</span> · Session: {data.session.state}
              </div>
            </div>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", TONE[tone])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", `bg-${tone === "emerald" ? "emerald" : tone}-400`)} />
            {a?.worker.label ?? "Unknown"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <Heart label="Last run" value={rel(a?.heartbeat.lastRunAt)} />
          <Heart label="Last status" value={a?.heartbeat.lastStatus ?? "—"} />
          <Heart label="Last auto decision" value={rel(a?.heartbeat.lastAutoDecisionAt)} />
          <Heart label="Last auto execution" value={rel(a?.heartbeat.lastAutoExecutionAt)} />
        </div>
        {a?.heartbeat.lastMessage && (
          <div className="mt-2 text-[11.5px] text-muted-foreground border-t border-border/40 pt-2 break-words">
            {a.heartbeat.lastMessage}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <SumCard icon={Activity} label="Monitored" value={data.summary.monitored} />
        <SumCard icon={ShieldCheck} label="With Plan" value={data.summary.withPlan} tone="emerald" />
        <SumCard icon={TrendingDown} label="Near Stop" value={data.summary.nearStopLoss} tone="rose" />
        <SumCard icon={Target} label="Near TP" value={data.summary.nearTakeProfit} tone="emerald" />
        <SumCard icon={TrendingUp} label="Trailing" value={data.summary.trailingActive} tone="sky" />
        <SumCard icon={Pause} label="Exit Pending" value={data.summary.exitPending} tone="amber" />
      </div>

      {/* Aggression mode selector — paper trading only */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Aggression Mode</h3>
          <span className="text-[10.5px] text-muted-foreground">Paper trading only — no real money</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {(Object.keys(AGGRESSION_PRESETS) as AggressionMode[]).map((m) => {
            const p = AGGRESSION_PRESETS[m];
            const active = currentMode === m;
            return (
              <button key={m} disabled={modeMutation.isPending}
                onClick={() => modeMutation.mutate(m)}
                className={cn("rounded-lg border px-2.5 py-2 text-left text-[11px] transition",
                  active ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-border/40 bg-card/40 hover:border-border")}>
                <div className="font-semibold">{p.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Exp {(p.targetExposurePct*100).toFixed(0)}% · Pos {(p.maxPositionWeightPct*100).toFixed(0)}% · {p.maxActivePositions} slots
                </div>
              </button>
            );
          })}
        </div>
        {diag?.recommendation && (
          <div className="mt-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2">{diag.recommendation}</div>
        )}
      </div>

      {/* Why AI Did Not Trade + profit diagnostics */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Why Profit Is Low</h3>
          <span className="text-[10.5px] text-muted-foreground">
            24h: {data.decisions.executed24h} exec · {data.decisions.blocked24h} blocked
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {(diag?.checks ?? data.diagnostic).map((d: any) => (
            <div key={d.key} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5">
              <span className="text-[11.5px] text-muted-foreground">{d.label}</span>
              <span className={cn("text-[11.5px] font-mono truncate ml-2", d.ok ? "text-emerald-400" : "text-amber-400")}>{d.value}</span>
            </div>
          ))}
        </div>
        {data.decisions.topBlockedReasons.length > 0 && (
          <div className="mt-3">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">Top blocked reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {data.decisions.topBlockedReasons.map((r) => (
                <span key={r.reason} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[10.5px]">
                  {r.reason} <span className="opacity-70">×{r.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Open Position Management */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Open Position Management</h3>
          <span className="text-[10.5px] text-muted-foreground">Paper trading only · auto SL/TP/Trailing</span>
        </div>
        {data.positions.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-6 text-center">No open positions.</div>
        ) : (
          <div className="space-y-1.5">
            {data.positions.map((p) => (
              <div key={p.symbol} className="rounded-xl border border-border/40 bg-card/40 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm">{p.symbol}</span>
                    <span className="text-[10.5px] text-muted-foreground">{p.qty} sh · avg {fmt(p.avgEntry)}</span>
                  </div>
                  <span className={cn("text-[11.5px] font-mono", p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {p.unrealizedPnl >= 0 ? "+" : ""}{fmt(p.unrealizedPnl, 0)} ({fmt(p.unrealizedPnlPct)}%)
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10.5px]">
                  <Cell label="Last" value={fmt(p.lastPrice)} />
                  <Cell label="Stop" value={p.stopLoss != null ? fmt(p.stopLoss) : "—"} tone={p.stopLoss != null ? "rose" : "slate"} sub={p.distanceToStopPct != null ? `${fmt(p.distanceToStopPct)}%` : undefined} />
                  <Cell label="TP" value={p.takeProfit != null ? fmt(p.takeProfit) : "—"} tone={p.takeProfit != null ? "emerald" : "slate"} sub={p.distanceToTakeProfitPct != null ? `${fmt(p.distanceToTakeProfitPct)}%` : undefined} />
                  <Cell label="Trailing" value={p.trailingStop != null ? fmt(p.trailingStop) : "—"} tone="sky" />
                  <Cell label="Status" value={p.managementStatus} tone={/EXIT|TRIGGER/i.test(p.managementStatus) ? "rose" : /TRAILING/i.test(p.managementStatus) ? "sky" : /NEAR/i.test(p.managementStatus) ? "amber" : "emerald"} />
                </div>
                {!p.hasPlan && (
                  <div className="mt-1.5 text-[10.5px] text-amber-400">No exit plan — will be generated on next worker run.</div>
                )}
                {p.reason && (
                  <div className="mt-1 text-[10.5px] text-muted-foreground truncate">{p.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Heart({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[11.5px] font-mono mt-0.5 truncate">{value}</div>
    </div>
  );
}

function SumCard({ icon: Icon, label, value, tone = "slate" }: { icon: any; label: string; value: number; tone?: string }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", TONE[tone] ?? TONE.slate)}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="h-3.5 w-3.5 opacity-80" />
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Cell({ label, value, tone = "slate", sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded border border-border/40 bg-background/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono truncate", `text-${tone === "emerald" ? "emerald" : tone === "rose" ? "rose" : tone === "sky" ? "sky" : tone === "amber" ? "amber" : "foreground"}-400`)}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
