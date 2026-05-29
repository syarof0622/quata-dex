import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRiskEngineSnapshot, clearRiskPause } from "@/lib/ai-trade-agent.functions";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const BLOCKED_REASON_LABELS: Record<string, string> = {
  risk_pause_active: "Risk pause aktif",
  lot_below_minimum: "Saldo < 1 lot",
  insufficient_balance: "Saldo tidak cukup",
  max_active_positions_reached: "Max active positions tercapai",
  max_position_weight_reached: "Max position weight tercapai",
  sector_exposure_limit: "Sector exposure limit",
  cash_buffer_required: "Cash buffer minimum tidak terpenuhi",
  low_liquidity: "Likuiditas rendah",
  risk_reward_invalid: "Risk/reward tidak memenuhi",
  negative_disclosure_detected: "Disclosure negatif terdeteksi",
  news_shock_risk: "News shock risk",
  daily_loss_limit_reached: "Daily loss limit tercapai",
  drawdown_limit_reached: "Drawdown limit tercapai",
  max_losses_per_day_reached: "Max losses per day tercapai",
  consecutive_losses_limit: "Consecutive losses limit",
};

export function RiskEnginePanel() {
  const fetchSnap = useServerFn(getRiskEngineSnapshot);
  const clearPause = useServerFn(clearRiskPause);
  const { data, refetch } = useQuery({
    queryKey: ["risk-engine-snapshot"],
    queryFn: () => fetchSnap(),
    refetchInterval: 30_000,
  });

  if (!data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
        Risk Engine: memuat status…
      </div>
    );
  }

  // No active agent row. Surface sync warning if recent decisions are firing.
  if (!data.agent) {
    const recent = (data as any).recentDecisionCount ?? 0;
    const sync = (data as any).syncWarning as string | null;
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn("h-4 w-4", recent > 0 ? "text-amber-400" : "text-slate-400")} />
          <h3 className="text-sm font-semibold">Risk Engine</h3>
        </div>
        {recent > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
            <div className="font-semibold">Agent sync warning</div>
            <div className="text-[11px] opacity-90">
              {sync ?? `Recent AI decisions detected (${recent} in last 5 min) but no active agent row found.`}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Belum ada agent aktif dan tidak ada keputusan AI baru.</div>
        )}
      </div>
    );
  }

  const { config, state, agent } = data;
  const pause = state.riskPauseActive;
  const Icon = pause ? ShieldAlert : ShieldCheck;
  const tone = pause ? "rose" : "emerald";

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", pause ? "text-rose-400" : "text-emerald-400")} />
          <h3 className="text-sm font-semibold">Risk Engine</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Mode: {agent.mode} · Paper only
          </span>
        </div>
        {pause && (
          <button
            onClick={async () => { await clearPause(); refetch(); }}
            className="text-[10px] rounded-md border border-border/60 px-2 py-1 hover:bg-card/80"
          >Clear pause</button>
        )}
      </div>

      {(data as any).syncWarning && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
          <div className="font-semibold">Agent sync warning</div>
          <div className="text-[11px] opacity-90">{(data as any).syncWarning}</div>
        </div>
      )}

      {pause && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-300">
          <div className="font-semibold">Risk pause active</div>
          <div className="text-[11px] opacity-90">
            {BLOCKED_REASON_LABELS[state.riskPauseReason ?? ""] ?? state.riskPauseReason ?? "—"} ·
            {" "}berlaku hingga {(() => {
              if (!state.riskPauseUntil) return "—";
              const d = new Date(state.riskPauseUntil);
              return isNaN(d.getTime()) ? "—" : d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
            })()}
          </div>
          <div className="text-[10px] opacity-75 mt-1">SL/TP exits tetap aktif. Hanya BUY baru yang diblokir.</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Cell label="Active positions" value={`${state.activePositions} / ${config.maxActivePositions}`} />
        <Cell label="Top sector" value={state.topSector ? `${state.topSector.sector} ${state.topSector.pct}%` : "—"} sub={`Cap ${(config.maxSectorExposurePct*100).toFixed(0)}%`} />
        <Cell label="Cash buffer" value={`${state.cashPct.toFixed(1)}%`} sub={`Min ${(config.minCashBufferPct*100).toFixed(0)}%`} tone={state.cashPct < config.minCashBufferPct*100 ? "rose" : "slate"} />
        <Cell label="Daily P/L" value={`${state.dailyPnlPct.toFixed(2)}%`} tone={state.dailyPnlPct < 0 ? "rose" : "emerald"} sub={`Limit ${(-config.maxDailyLossPct*100).toFixed(1)}%`} />
        <Cell label="Drawdown" value={`${state.drawdownPct.toFixed(2)}%`} tone={Math.abs(state.drawdownPct) >= config.maxDrawdownPct*100 ? "rose" : "slate"} sub={`Limit ${(-config.maxDrawdownPct*100).toFixed(0)}%`} />
        <Cell label="Risk / trade" value={`${(config.riskPerTradePct*100).toFixed(2)}%`} sub={config.atrStopEnabled ? `ATR×${config.atrStopMultiplier}` : "Percent stop"} />
      </div>

      {state.lastBlockedReason && (
        <div className="text-[11px] text-muted-foreground">
          Last blocked reason: <span className="font-semibold text-amber-400">{BLOCKED_REASON_LABELS[state.lastBlockedReason] ?? state.lastBlockedReason}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <Toggle on={config.atrStopEnabled} label="ATR stop" />
        <Toggle on={config.volatilitySizingEnabled} label="Vol sizing" />
        <Toggle on={config.correlationRiskEnabled} label="Sector / correlation" />
        <Toggle on={config.liquidityRiskEnabled} label="Liquidity" />
        <Toggle on={config.newsShockRiskEnabled} label="News shock" />
        <Toggle on={config.circuitBreakerEnabled} label="Circuit breaker" />
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

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
      on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
         : "border-slate-500/30 bg-slate-500/10 text-slate-400"
    )}>
      <Shield className="h-2.5 w-2.5" />
      {label}: {on ? "on" : "off"}
    </span>
  );
}
