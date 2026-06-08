import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAutonomousAgentStatus } from "@/lib/autonomous-status.functions";
import { setAgentAggressionMode, getProfitDiagnostics } from "@/lib/ai-trade-agent.functions";
import { getLossDiagnostics } from "@/lib/loss-diagnostics.functions";
import { getSwingMaxStatus } from "@/lib/swing-status.functions";
import { AGGRESSION_PRESETS, type AggressionMode } from "@/lib/agent-aggression-modes";
import { cn } from "@/lib/utils";
import { displaySymbol } from "@/lib/display-symbol";
import { Bot, ShieldCheck, AlertTriangle, Activity, Target, TrendingDown, TrendingUp, Pause, Zap, ShieldAlert, Clock, Waves } from "lucide-react";
import { useLang } from "@/hooks/use-language";


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
  const { L } = useLang();
  const T = L.body.agentPanel;
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
  const fetchSwing = useServerFn(getSwingMaxStatus);
  const { data: swing } = useQuery({
    queryKey: ["agent-swing-max-status"],
    queryFn: () => fetchSwing(),
    refetchInterval: 30_000,
  });
  const modeMutation = useMutation({
    mutationFn: async (mode: AggressionMode) => {
      const agentId = (data as any)?.agent?.id;
      if (!agentId) throw new Error(T.aggression.agentNotActive);
      return setMode({ data: { id: agentId, mode } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autonomous-agent-status"] });
      qc.invalidateQueries({ queryKey: ["agent-profit-diagnostics"] });
      qc.invalidateQueries({ queryKey: ["agent-swing-max-status"] });
    },
  });

  if (isLoading || !data) {
    return <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">{T.loading}</div>;
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
              <div className="text-sm font-semibold truncate">{a?.name ?? T.defaultName}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {T.riskMode} <span className="font-mono">{a?.riskMode ?? "—"}</span> · {T.session} {data.session.state}
              </div>
            </div>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", TONE[tone])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", `bg-${tone === "emerald" ? "emerald" : tone}-400`)} />
            {a?.worker.label ?? "—"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <Heart label={T.heart.lastRun} value={rel(a?.heartbeat.lastRunAt)} />
          <Heart label={T.heart.lastStatus} value={a?.heartbeat.lastStatus ?? "—"} />
          <Heart label={T.heart.lastAutoDecision} value={rel(a?.heartbeat.lastAutoDecisionAt)} />
          <Heart label={T.heart.lastAutoExec} value={rel(a?.heartbeat.lastAutoExecutionAt)} />
        </div>
        {a?.heartbeat.lastMessage && (
          <div className="mt-2 text-[11.5px] text-muted-foreground border-t border-border/40 pt-2 break-words">
            {a.heartbeat.lastMessage}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <SumCard icon={Activity} label={T.summary.monitored} value={data.summary.monitored} />
        <SumCard icon={ShieldCheck} label={T.summary.withPlan} value={data.summary.withPlan} tone="emerald" />
        <SumCard icon={TrendingDown} label={T.summary.nearStop} value={data.summary.nearStopLoss} tone="rose" />
        <SumCard icon={Target} label={T.summary.nearTp} value={data.summary.nearTakeProfit} tone="emerald" />
        <SumCard icon={TrendingUp} label={T.summary.trailing} value={data.summary.trailingActive} tone="sky" />
        <SumCard icon={Pause} label={T.summary.exitPending} value={data.summary.exitPending} tone="amber" />
      </div>

      {/* Aggression mode selector — paper trading only */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> {T.aggression.title}</h3>
          <span className="text-[10.5px] text-muted-foreground">{T.aggression.paperOnly}</span>
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
                  {T.aggression.expShort
                    .replace("{exp}", (p.targetExposurePct*100).toFixed(0))
                    .replace("{pos}", (p.maxPositionWeightPct*100).toFixed(0))
                    .replace("{slots}", String(p.maxActivePositions))}
                </div>
              </button>
            );
          })}
        </div>
        {diag?.recommendation && (
          <div className="mt-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2">{diag.recommendation}</div>
        )}
      </div>




      {/* Swing Max panel */}
      {swing?.agent && (
        <div className={cn("rounded-2xl border p-3 sm:p-4",
          swing.agent.swing_mode_active ? "border-sky-500/40 bg-sky-500/5" : "border-border/60 bg-card/50")}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Waves className="h-4 w-4 text-sky-400" /> {T.swing.title}
              <span className={cn("ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono",
                swing.agent.swing_mode_active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-500/30 bg-slate-500/10 text-slate-300")}>
                {swing.agent.swing_mode_active ? T.swing.active : T.swing.inactive}
              </span>
              {swing.agent.swing_protection_active && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10px] font-mono">
                  {T.swing.protection}
                </span>
              )}
            </h3>
            <span className="text-[10.5px] text-muted-foreground font-mono">
              {T.swing.thresholds
                .replace("{q}", String(swing.agent.swing_quality_threshold ?? 78))
                .replace("{min}", String(swing.agent.target_holding_days ?? 3))
                .replace("{max}", String(swing.agent.max_holding_days ?? 7))
                .replace("{wk}", String(swing.agent.max_trades_per_symbol_per_week ?? 1))}
            </span>
          </div>
          {swing.agent.swing_protection_reason && (
            <div className="text-[11.5px] text-amber-300 mb-2">{swing.agent.swing_protection_reason}</div>
          )}
          {swing.stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] mb-2">
              <Heart label={T.swing.openPlans} value={String(swing.stats.openCount)} />
              <Heart label={T.swing.closed} value={String(swing.stats.closedCount)} />
              <Heart label={T.swing.winRate} value={`${(swing.stats.winRate * 100).toFixed(0)}%`} />
              <Heart label={T.swing.avgHold} value={`${swing.stats.avgHoldDays.toFixed(1)}d`} />
            </div>
          )}
          {(swing.plans?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{T.swing.recentPlans}</div>
              <div className="flex flex-col gap-1">
                {swing.plans.slice(0, 6).map((p: any) => {
                  const closed = !!p.closed_at;
                  const pnl = Number(p.realized_pnl_pct ?? 0);
                  const tone = closed ? (pnl >= 0 ? "emerald" : "rose") : "sky";
                  return (
                    <div key={`${p.symbol}-${p.created_at}`} className={cn("rounded-lg border px-2 py-1.5 text-[11px] flex flex-wrap items-center gap-2", TONE[tone])}>
                      <span className="font-mono font-semibold">{displaySymbol(p.symbol)}</span>
                      <span className="opacity-70">{p.entry_type}</span>
                      <span className="opacity-70">Q{Number(p.swing_quality_score ?? 0).toFixed(0)}</span>
                      <span className="opacity-70">RR {Number(p.risk_reward_ratio ?? 0).toFixed(2)}</span>
                      <span className="opacity-70">SL {fmt(p.stop_loss, 0)} / TP {fmt(p.take_profit_2, 0)}</span>
                      <span className="ml-auto opacity-80">{closed ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · ${p.exit_reason ?? "closed"}` : p.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {((swing as any)?.allocationDecisions?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{T.swing.allocationDecisions}</div>

              <div className="flex flex-col gap-1">
                {(swing as any).allocationDecisions.map((d: any, i: number) => {
                  const tier = d.tier ?? 0;
                  const tone = d.action === "BUY"
                    ? (tier >= 3 ? "emerald" : tier === 2 ? "sky" : "amber")
                    : "rose";
                  const pct = d.allocationPct != null ? `${(d.allocationPct * 100).toFixed(1)}%` : "0%";
                  const label = d.tierLabel ?? (d.action === "BUY" ? "STARTER" : "REJECTED");
                  return (
                    <div key={i} className={cn("rounded-lg border px-2 py-1.5 text-[11px] flex flex-wrap items-center gap-2", TONE[tone])}>
                      <span className="font-mono font-semibold">{displaySymbol(d.symbol)}</span>
                      <span className="rounded-full border border-current/40 px-1.5 py-px text-[10px] font-mono">{label} · T{tier}</span>
                      <span className="opacity-80">Q{Number(d.qualityScore ?? 0).toFixed(0)}</span>
                      <span className="opacity-80">RR {Number(d.rr ?? 0).toFixed(2)}</span>
                      <span className="opacity-80">{pct} ({d.allocationIDR ? d.allocationIDR.toLocaleString() : 0} IDR)</span>
                      <span className="opacity-70">{d.lot} lot</span>
                      {d.capWinner && <span className="opacity-60">cap:{d.capWinner}</span>}
                      <span className="basis-full text-[10.5px] opacity-70 leading-tight">
                        {d.allocationReason ?? d.reasoningShort}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}



      {/* Loss-Protection diagnostics — "Why the AI is losing" */}
      {loss?.agent && (
        <div className={cn("rounded-2xl border p-3 sm:p-4",
          loss.agent.mode === "LOSS_PROTECTION_ACTIVE" || loss.agent.mode === "PROTECTION_MODE"
            ? "border-rose-500/40 bg-rose-500/5"
            : loss.agent.mode === "OBSERVATION_MODE" || loss.agent.mode === "CAUTION"
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-border/60 bg-card/50")}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" /> {T.loss.title} · {loss.agent.mode}
            </h3>
            <span className="text-[10.5px] text-muted-foreground font-mono">
              {T.loss.streak.replace("{n}", String(loss.agent.consecutiveLosses)).replace("{max}", String(loss.agent.maxConsecutiveLosses))}
            </span>
          </div>
          {loss.agent.protectionReason && (
            <div className="text-[11.5px] text-rose-300 mb-2">{loss.agent.protectionReason}</div>
          )}
          {loss.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
              <Heart label={T.loss.closed50} value={String(loss.summary.closedTrades ?? 0)} />
              <Heart label={T.loss.winRate} value={`${((loss.summary.winRate ?? 0) * 100).toFixed(0)}%`} />
              <Heart label={T.loss.profitFactor} value={fmt(loss.summary.profitFactor, 2)} />
              <Heart label={T.loss.wl} value={`${loss.summary.wins ?? 0} / ${loss.summary.losses ?? 0}`} />
            </div>
          )}
          {(loss.summary?.worstSymbols?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">{T.loss.worstSymbols}</div>
              <div className="flex flex-wrap gap-1.5">
                {loss.summary.worstSymbols.map((s: any) => (
                  <span key={s.symbol} className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 px-2 py-0.5 text-[10.5px] font-mono">
                    {displaySymbol(s.symbol)} {s.pnl >= 0 ? "+" : ""}{fmt(s.pnl, 0)} ({s.losses}L/{s.trades})
                  </span>
                ))}
              </div>
            </div>
          )}
          {loss.summary?.worstStrategy && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {T.loss.worstStrategy} <span className="font-mono text-foreground">{loss.summary.worstStrategy.strategy}</span>
              {" · PF "}{fmt(loss.summary.worstStrategy.profitFactor, 2)}
              {" · WR "}{((loss.summary.worstStrategy.winRate ?? 0) * 100).toFixed(0)}%
              {loss.summary.worstStrategy.status === "PAUSED_FOR_REVIEW" && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 px-1.5 text-[10px]">
                  <Pause className="h-3 w-3" /> {T.loss.paused}
                </span>
              )}
            </div>
          )}
          {(loss.cooldowns?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {T.loss.cooldowns}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {loss.cooldowns.map((c: any) => (
                  <span key={c.symbol} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10.5px] font-mono">
                    {displaySymbol(c.symbol)} ×{c.loss_count} · until {new Date(c.cooldown_until).toLocaleDateString()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(loss.pausedStrategies?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">{T.loss.pausedStrategies}</div>
              <div className="flex flex-wrap gap-1.5">
                {loss.pausedStrategies.map((s: any) => (
                  <span key={s.strategy} className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 px-2 py-0.5 text-[10.5px]">
                    {s.strategy} · {s.paused_reason ?? "poor stats"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 text-[10.5px] text-muted-foreground border-t border-border/40 pt-2">
            {T.loss.guards
              .replace("{q}", String(loss.agent.minTradeQualityScore))
              .replace("{rr}", loss.agent.minRiskReward.toFixed(1))
              .replace("{hold}", String(loss.agent.minHoldMinutes))
              .replace("{dl}", (loss.agent.maxDailyLossPct * 100).toFixed(1))}
          </div>

        </div>
      )}

      {/* Why AI Did Not Trade + profit diagnostics */}
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> {T.diag.title}</h3>
          <span className="text-[10.5px] text-muted-foreground">
            {T.diag.exec24h.replace("{exec}", String(data.decisions.executed24h)).replace("{blocked}", String(data.decisions.blocked24h))}
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
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">{T.diag.topBlocked}</div>
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
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> {T.open.title}</h3>
          <span className="text-[10.5px] text-muted-foreground">{T.open.paperOnlyAuto}</span>
        </div>
        {data.positions.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-6 text-center">{T.open.noOpen}</div>
        ) : (
          <div className="space-y-1.5">
            {data.positions.map((p) => (
              <div key={p.symbol} className="rounded-xl border border-border/40 bg-card/40 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm">{displaySymbol(p.symbol)}</span>
                    <span className="text-[10.5px] text-muted-foreground">{p.qty} {T.open.sh.replace("{price}", fmt(p.avgEntry))}</span>
                  </div>
                  <span className={cn("text-[11.5px] font-mono", p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {p.unrealizedPnl >= 0 ? "+" : ""}{fmt(p.unrealizedPnl, 0)} ({fmt(p.unrealizedPnlPct)}%)
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10.5px]">
                  <Cell label={T.open.cells.last} value={fmt(p.lastPrice)} />
                  <Cell label={T.open.cells.stop} value={p.stopLoss != null ? fmt(p.stopLoss) : "—"} tone={p.stopLoss != null ? "rose" : "slate"} sub={p.distanceToStopPct != null ? `${fmt(p.distanceToStopPct)}%` : undefined} />
                  <Cell label={T.open.cells.tp} value={p.takeProfit != null ? fmt(p.takeProfit) : "—"} tone={p.takeProfit != null ? "emerald" : "slate"} sub={p.distanceToTakeProfitPct != null ? `${fmt(p.distanceToTakeProfitPct)}%` : undefined} />
                  <Cell label={T.open.cells.trailing} value={p.trailingStop != null ? fmt(p.trailingStop) : "—"} tone="sky" />
                  <Cell label={T.open.cells.status} value={p.managementStatus} tone={/EXIT|TRIGGER/i.test(p.managementStatus) ? "rose" : /TRAILING/i.test(p.managementStatus) ? "sky" : /NEAR/i.test(p.managementStatus) ? "amber" : "emerald"} />
                </div>
                {!p.hasPlan && (
                  <div className="mt-1.5 text-[10.5px] text-amber-400">{T.open.noPlan}</div>
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
