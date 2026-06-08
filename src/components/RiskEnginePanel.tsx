import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRiskEngineSnapshot, clearRiskPause } from "@/lib/ai-trade-agent.functions";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-language";

export function RiskEnginePanel() {
  const { L, lang } = useLang();
  const T = L.body.riskEngine;
  const fetchSnap = useServerFn(getRiskEngineSnapshot);
  const clearPause = useServerFn(clearRiskPause);
  const { data, refetch } = useQuery({
    queryKey: ["risk-engine-snapshot"],
    queryFn: () => fetchSnap(),
    refetchInterval: 30_000,
  });

  const reasonLabel = (key: string | null | undefined) =>
    (key && (T.reasons as Record<string, string>)[key]) || key || "—";

  if (!data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
        {T.loading}
      </div>
    );
  }

  if (!data.agent) {
    const recent = (data as any).recentDecisionCount ?? 0;
    const sync = (data as any).syncWarning as string | null;
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn("h-4 w-4", recent > 0 ? "text-amber-400" : "text-slate-400")} />
          <h3 className="text-sm font-semibold">{T.title}</h3>
        </div>
        {recent > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
            <div className="font-semibold">{T.syncWarning}</div>
            <div className="text-[11px] opacity-90">
              {sync ?? T.recentDecisionsFallback.replace("{n}", String(recent))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{T.noAgent}</div>
        )}
      </div>
    );
  }

  const { config, state, agent } = data;
  const pause = state.riskPauseActive;
  const Icon = pause ? ShieldAlert : ShieldCheck;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", pause ? "text-rose-400" : "text-emerald-400")} />
          <h3 className="text-sm font-semibold">{T.title}</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {T.modeLabel.replace("{mode}", agent.mode)}
          </span>
        </div>
        {pause && (
          <button
            onClick={async () => { await clearPause(); refetch(); }}
            className="text-[10px] rounded-md border border-border/60 px-2 py-1 hover:bg-card/80"
          >{T.clearPause}</button>
        )}
      </div>

      {(data as any).syncWarning && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
          <div className="font-semibold">{T.syncWarning}</div>
          <div className="text-[11px] opacity-90">{(data as any).syncWarning}</div>
        </div>
      )}

      {pause && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-300">
          <div className="font-semibold">{T.pauseActive}</div>
          <div className="text-[11px] opacity-90">
            {reasonLabel(state.riskPauseReason)} ·{" "}
            {T.pauseUntil.replace("{time}", (() => {
              if (!state.riskPauseUntil) return "—";
              const d = new Date(state.riskPauseUntil);
              if (isNaN(d.getTime())) return "—";
              return d.toLocaleString(lang === "en" ? "en-US" : "id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
            })())}
          </div>
          <div className="text-[10px] opacity-75 mt-1">{T.pauseNote}</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Cell label={T.cells.activePos} value={`${state.activePositions} / ${config.maxActivePositions}`} />
        <Cell label={T.cells.topSector} value={state.topSector ? `${state.topSector.sector} ${state.topSector.pct}%` : "—"} sub={T.cells.capPct.replace("{pct}", (config.maxSectorExposurePct*100).toFixed(0))} />
        <Cell label={T.cells.cashBuffer} value={`${state.cashPct.toFixed(1)}%`} sub={T.cells.minPct.replace("{pct}", (config.minCashBufferPct*100).toFixed(0))} tone={state.cashPct < config.minCashBufferPct*100 ? "rose" : "slate"} />
        <Cell label={T.cells.dailyPnl} value={`${state.dailyPnlPct.toFixed(2)}%`} tone={state.dailyPnlPct < 0 ? "rose" : "emerald"} sub={T.cells.limitPct.replace("{pct}", (-config.maxDailyLossPct*100).toFixed(1))} />
        <Cell label={T.cells.drawdown} value={`${state.drawdownPct.toFixed(2)}%`} tone={Math.abs(state.drawdownPct) >= config.maxDrawdownPct*100 ? "rose" : "slate"} sub={T.cells.limitPct.replace("{pct}", (-config.maxDrawdownPct*100).toFixed(0))} />
        <Cell label={T.cells.riskPerTrade} value={`${(config.riskPerTradePct*100).toFixed(2)}%`} sub={config.atrStopEnabled ? T.cells.atrMult.replace("{n}", String(config.atrStopMultiplier)) : T.cells.percentStop} />
      </div>

      {state.lastBlockedReason && (
        <div className="text-[11px] text-muted-foreground">
          {T.lastBlockedReason} <span className="font-semibold text-amber-400">{reasonLabel(state.lastBlockedReason)}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <Toggle on={config.atrStopEnabled} label={T.toggles.atr} onTxt={T.toggles.on} offTxt={T.toggles.off} />
        <Toggle on={config.volatilitySizingEnabled} label={T.toggles.vol} onTxt={T.toggles.on} offTxt={T.toggles.off} />
        <Toggle on={config.correlationRiskEnabled} label={T.toggles.corr} onTxt={T.toggles.on} offTxt={T.toggles.off} />
        <Toggle on={config.liquidityRiskEnabled} label={T.toggles.liq} onTxt={T.toggles.on} offTxt={T.toggles.off} />
        <Toggle on={config.newsShockRiskEnabled} label={T.toggles.news} onTxt={T.toggles.on} offTxt={T.toggles.off} />
        <Toggle on={config.circuitBreakerEnabled} label={T.toggles.cb} onTxt={T.toggles.on} offTxt={T.toggles.off} />
      </div>
    </div>
  );
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-card/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold",
        tone === "rose" && "text-rose-400",
        tone === "emerald" && "text-emerald-400",
      )}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Toggle({ on, label, onTxt, offTxt }: { on: boolean; label: string; onTxt: string; offTxt: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
      on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
         : "border-slate-500/30 bg-slate-500/10 text-slate-400"
    )}>
      <Shield className="h-2.5 w-2.5" />
      {label}: {on ? onTxt : offTxt}
    </span>
  );
}
