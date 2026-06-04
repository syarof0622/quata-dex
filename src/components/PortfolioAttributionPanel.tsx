import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { simulatePortfolioWhatIf } from "@/lib/analytics.functions";
import { formatPct, formatMoneyByCurrency, colorForChange } from "@/lib/format";
import { displaySymbol } from "@/lib/display-symbol";
import { TrendingUp, TrendingDown, AlertTriangle, Layers, Wallet, FlaskConical } from "lucide-react";

type Props = {
  data: any; // getPortfolioAnalytics return shape
};

export function PortfolioAttributionPanel({ data }: Props) {
  const currency = (data?.currency ?? "IDR") as "IDR" | "USD";
  const money = (n: number | null | undefined) => formatMoneyByCurrency(currency, n);
  const attribution = data?.attribution;
  const cashDrag = data?.cashDrag;
  const scenarios: any[] = data?.scenarios ?? [];
  const positions: any[] = attribution?.positions ?? [];

  if (!attribution) return null;

  return (
    <div className="space-y-3">
      {/* Top / worst contributor + cash drag */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="size-3 text-bull" /> Top Contributor
          </div>
          {attribution.topContributor ? (
            <>
              <div className="font-mono text-lg">{attribution.topContributor.symbol}</div>
              <div className={`text-sm font-mono ${colorForChange(attribution.topContributor.contributionToReturn)}`}>
                {formatPct(attribution.topContributor.contributionToReturn)} of baseline
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{money(attribution.topContributor.unrealizedPnl)} unrealized</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No positions.</div>
          )}
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingDown className="size-3 text-bear" /> Worst Contributor
          </div>
          {attribution.worstContributor ? (
            <>
              <div className="font-mono text-lg">{attribution.worstContributor.symbol}</div>
              <div className={`text-sm font-mono ${colorForChange(attribution.worstContributor.contributionToReturn)}`}>
                {formatPct(attribution.worstContributor.contributionToReturn)} of baseline
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{money(attribution.worstContributor.unrealizedPnl)} unrealized</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No drag yet.</div>
          )}
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Wallet className="size-3" /> Cash Drag (60d)
          </div>
          <div className="font-mono text-lg">
            {cashDrag?.benchmarkPeriodReturnPct == null ? "—" : formatPct(cashDrag.benchmarkPeriodReturnPct)}
            <span className="text-[11px] text-muted-foreground ml-1">IHSG</span>
          </div>
          <div className={`text-sm font-mono ${cashDrag?.cashDragEstimate >= 0 ? "text-bull" : "text-bear"}`}>
            {money(cashDrag?.cashDragEstimate ?? 0)} hypothetical
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{cashDrag?.note ?? "—"}</div>
        </div>
      </div>

      {/* Per-position attribution table */}
      <div className="panel p-2">
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <h3 className="font-semibold">Position Attribution</h3>
          <span className="text-[10px] text-muted-foreground">Beta coverage: {attribution.betaCoverage}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-left p-2">Sector</th>
                <th className="text-right p-2">Weight</th>
                <th className="text-right p-2">Unrealized</th>
                <th className="text-right p-2">Contrib. Return</th>
                <th className="text-right p-2">Contrib. Risk</th>
                <th className="text-right p-2">Beta</th>
                <th className="text-right p-2">Vol (ann.)</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No open positions.</td></tr>
              )}
              {positions.map((p) => (
                <tr key={p.symbol} className="border-t border-border">
                  <td className="p-2 font-medium">{p.symbol}</td>
                  <td className="p-2 text-xs text-muted-foreground">{p.sector}</td>
                  <td className="p-2 text-right font-mono text-xs">{p.weight.toFixed(1)}%</td>
                  <td className={`p-2 text-right font-mono text-xs ${colorForChange(p.unrealizedPnl)}`}>{money(p.unrealizedPnl)}</td>
                  <td className={`p-2 text-right font-mono text-xs ${colorForChange(p.contributionToReturn)}`}>{formatPct(p.contributionToReturn)}</td>
                  <td className="p-2 text-right font-mono text-xs">{p.contributionToRisk.toFixed(1)}%</td>
                  <td className="p-2 text-right font-mono text-xs">
                    {p.beta == null ? "—" : p.beta.toFixed(2)}
                    {p.betaSource === "sector_prior" && <span className="text-[9px] text-amber-400 ml-1">prior</span>}
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{p.volatility == null ? "—" : p.volatility.toFixed(1) + "%"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector contribution chart */}
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-2"><Layers className="size-4" /><h3 className="font-semibold">Sector Contribution</h3></div>
        {attribution.sectors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sector exposure.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {attribution.sectors.map((s: any) => (
              <li key={s.sector}>
                <div className="flex justify-between text-xs">
                  <span>{s.sector} <span className="text-muted-foreground">({s.positionCount}) · {s.sectorRiskLevel}</span></span>
                  <span className="font-mono">
                    <span className="text-muted-foreground">{s.sectorWeight.toFixed(1)}%</span>
                    <span className={`ml-3 ${colorForChange(s.sectorContribution)}`}>{formatPct(s.sectorContribution)}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded bg-accent/40 mt-1 overflow-hidden flex">
                  <div className={`h-full ${s.sectorContribution >= 0 ? "bg-bull" : "bg-bear"}`}
                       style={{ width: `${Math.min(100, Math.abs(s.sectorWeight))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Scenarios */}
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="size-4 text-amber-400" /> Scenario Analysis</h3>
          {scenarios[0]?.confidence && (
            <span className="text-[10px] text-muted-foreground">
              Confidence: <span className="text-foreground">{scenarios[0].confidence}</span>
            </span>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {scenarios.map((s: any) => (
            <div key={s.scenario} className="rounded border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">{s.scenario}</div>
              <div className={`font-mono text-xl ${s.estimatedPortfolioChange >= 0 ? "text-bull" : "text-bear"}`}>
                {formatPct(s.estimatedPortfolioChangePct)}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                Est. equity {money(s.estimatedEquity)}
              </div>
              <div className="text-[11px] font-mono mt-1">
                {s.estimatedPortfolioChange >= 0 ? "+" : ""}{money(s.estimatedPortfolioChange)}
              </div>
              {s.worstContributor && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Worst: <span className="text-bear font-mono">{s.worstContributor.symbol}</span> ({money(s.worstContributor.impact)})
                </div>
              )}
              {s.riskNotes?.length > 0 && (
                <ul className="mt-1 text-[10px] text-amber-400/90 space-y-0.5">
                  {s.riskNotes.map((n: string, i: number) => <li key={i}>• {n}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-3">
          Estimasi memakai beta × bobot posisi. Paper trading only — bukan rekomendasi eksekusi.
        </div>
      </div>

      <WhatIfPanel positions={positions} cash={data.cash} currency={currency} />
    </div>
  );
}

function WhatIfPanel({ positions, cash, currency }: { positions: any[]; cash: number; currency: "IDR" | "USD" }) {
  const money = (n: number | null | undefined) => formatMoneyByCurrency(currency, n);
  const sim = useServerFn(simulatePortfolioWhatIf);
  const [closeSym, setCloseSym] = useState<string>(positions[0]?.symbol ?? "");
  const [addSym, setAddSym] = useState<string>("");
  const [addLot, setAddLot] = useState<number>(1);
  const [addPrice, setAddPrice] = useState<string>("");

  const closeMut = useMutation({
    mutationFn: (symbol: string) => sim({ data: { action: "close", symbol } }),
  });
  const addMut = useMutation({
    mutationFn: (input: { symbol: string; lot: number; price?: number }) =>
      sim({ data: { action: "add", ...input } }),
  });

  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="size-4" />
        <h3 className="font-semibold">What-If Analysis</h3>
        <span className="text-[10px] text-muted-foreground ml-2">read-only simulation</span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Close */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Close Position</div>
          <div className="flex gap-2">
            <select
              value={closeSym}
              onChange={(e) => setCloseSym(e.target.value)}
              className="text-xs px-2 py-1.5 rounded bg-accent/40 border border-border/40 flex-1"
              disabled={symbols.length === 0}
            >
              {symbols.length === 0 && <option>— no positions —</option>}
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={() => closeSym && closeMut.mutate(closeSym)}
              disabled={!closeSym || closeMut.isPending}
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              Simulate
            </button>
          </div>
          {closeMut.data && "error" in closeMut.data && (
            <div className="text-xs text-bear">{closeMut.data.error}</div>
          )}
          {closeMut.data && !("error" in closeMut.data) && (
            <div className="text-xs space-y-1 font-mono">
              <div>Realized: <span className={colorForChange((closeMut.data as any).realizedPnlIfClosedNow)}>{money((closeMut.data as any).realizedPnlIfClosedNow)}</span></div>
              <div>New cash: {money((closeMut.data as any).newCash)}</div>
              <div>New exposure: {(closeMut.data as any).newExposurePct.toFixed(1)}%</div>
              {(closeMut.data as any).notes?.map((n: string, i: number) => (
                <div key={i} className="text-amber-400 text-[10px]">• {n}</div>
              ))}
            </div>
          )}
        </div>
        {/* Add */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Add Simulated Position</div>
          <div className="flex gap-2">
            <input
              placeholder="Symbol (e.g. MAPI.JK)"
              value={addSym}
              onChange={(e) => setAddSym(e.target.value.toUpperCase())}
              className="text-xs px-2 py-1.5 rounded bg-accent/40 border border-border/40 flex-1"
            />
            <input
              type="number" min="1"
              placeholder="Lot"
              value={addLot}
              onChange={(e) => setAddLot(Number(e.target.value))}
              className="text-xs px-2 py-1.5 rounded bg-accent/40 border border-border/40 w-16"
            />
            <input
              type="number"
              placeholder="Price (auto)"
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              className="text-xs px-2 py-1.5 rounded bg-accent/40 border border-border/40 w-24"
            />
            <button
              onClick={() => addSym && addMut.mutate({ symbol: addSym, lot: addLot, price: addPrice ? Number(addPrice) : undefined })}
              disabled={!addSym || addMut.isPending}
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              Simulate
            </button>
          </div>
          {addMut.data && "error" in addMut.data && (
            <div className="text-xs text-bear">{addMut.data.error}</div>
          )}
          {addMut.data && !("error" in addMut.data) && (
            <div className="text-xs space-y-1 font-mono">
              <div>Est. cost: {money((addMut.data as any).estCost)} <span className="text-muted-foreground">({(addMut.data as any).sector})</span></div>
              <div>New cash: {money((addMut.data as any).newCash)}</div>
              <div>New exposure: {(addMut.data as any).newExposurePct.toFixed(1)}%</div>
              {!(addMut.data as any).affordable && (
                <div className="text-bear text-[10px]">• Cash tidak mencukupi.</div>
              )}
              {(addMut.data as any).notes?.map((n: string, i: number) => (
                <div key={i} className="text-amber-400 text-[10px]">• {n}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-3">
        Simulation tidak mengubah portfolio. Cash {money(cash)} tersedia.
      </div>
    </div>
  );
}
