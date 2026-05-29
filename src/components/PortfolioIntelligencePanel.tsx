import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPortfolioHealth,
  getPortfolioInsights,
  runScenario,
} from "@/lib/portfolio-intelligence.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, FlaskConical, Loader2, ShieldCheck, Sparkles } from "lucide-react";

type ScenarioBtn = { label: string; input: Parameters<typeof runScenario>[0]["data"] };

const QUICK_SCENARIOS: ScenarioBtn[] = [
  { label: "IHSG −2%", input: { type: "IHSG_DOWN_2" } },
  { label: "IHSG −5%", input: { type: "IHSG_DOWN_5" } },
  { label: "IHSG −10%", input: { type: "IHSG_DOWN_10" } },
  { label: "IHSG +2%", input: { type: "IHSG_UP_2" } },
];

const LEVEL_STYLES: Record<string, string> = {
  Healthy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Stable: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  Caution: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Risky: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  Critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n == null || !isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

export function PortfolioIntelligencePanel() {
  const fetchHealth = useServerFn(getPortfolioHealth);
  const fetchInsights = useServerFn(getPortfolioInsights);
  const runScenarioFn = useServerFn(runScenario);
  const [lastScenario, setLastScenario] = useState<any>(null);

  const health = useQuery({
    queryKey: ["portfolio-intel-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
  });
  const insights = useQuery({
    queryKey: ["portfolio-intel-insights"],
    queryFn: () => fetchInsights(),
    refetchInterval: 60_000,
  });

  const scenario = useMutation({
    mutationFn: (input: ScenarioBtn["input"]) => runScenarioFn({ data: input }),
    onSuccess: (r) => setLastScenario(r),
  });

  const h = health.data;
  const i = insights.data;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Portfolio Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Menghitung portfolio health…
            </div>
          )}
          {health.isError && (
            <div className="text-sm text-rose-300 flex items-center gap-2">
              <AlertTriangle className="size-4" /> Gagal memuat health score.
            </div>
          )}
          {h && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <div className="text-3xl font-semibold tabular-nums">{h.portfolioHealthScore}</div>
                <Badge variant="outline" className={LEVEL_STYLES[h.riskLevel] ?? ""}>
                  {h.riskLevel}
                </Badge>
                {h.marketRegime && (
                  <span className="text-[11px] text-muted-foreground">
                    Regime: <span className="text-foreground">{h.marketRegime}</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{h.summary}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <Metric label="Cash" value={fmtPct(h.cashRatio)} />
                <Metric label="Invested" value={fmtPct(h.investedRatio)} />
                <Metric label="Concentration" value={`${h.concentrationScore}/100`} />
                <Metric label="Cash Drag" value={`${h.cashDragScore}/100`} />
                <Metric label="Sector Risk" value={`${h.sectorRiskScore}/100`} />
                <Metric label="Diversif." value={`${h.diversificationScore}/100`} />
                <Metric label="Value Trap" value={fmtPct(h.valueTrapExposurePct)} />
                <Metric label="Disclosure Risk" value={fmtPct(h.disclosureRiskExposurePct)} />
              </div>

              {(h.criticalIssues.length > 0 || h.warnings.length > 0 || h.positives.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                  <IssueList title="Critical" tone="rose" items={h.criticalIssues} />
                  <IssueList title="Warnings" tone="amber" items={h.warnings} />
                  <IssueList title="Positives" tone="emerald" items={h.positives} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {i && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {i.suggestedActions.length > 0 && (
              <div>
                <div className="text-[11px] uppercase text-muted-foreground mb-1">Suggested actions</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {i.suggestedActions.map((s, idx) => <li key={idx}>{s}</li>)}
                </ul>
              </div>
            )}
            {i.monitorList.length > 0 && (
              <div>
                <div className="text-[11px] uppercase text-muted-foreground mb-1">Monitor list</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {i.monitorList.map((m, idx) => (
                    <li key={idx}><span className="font-medium">{m.symbol}</span> — <span className="text-muted-foreground">{m.reason}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" /> What-If Scenario Lab
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Simulasi read-only. Tidak ada order paper-trade yang dibuat.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_SCENARIOS.map((s) => (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                disabled={scenario.isPending}
                onClick={() => scenario.mutate(s.input)}
              >
                {scenario.isPending ? <Loader2 className="size-3 animate-spin mr-1" /> : <Activity className="size-3 mr-1" />}
                {s.label}
              </Button>
            ))}
          </div>

          {scenario.isError && (
            <div className="text-xs text-rose-300">Scenario gagal dijalankan.</div>
          )}

          {lastScenario && (
            <div className="border border-border rounded-md p-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div className="font-medium">{lastScenario.scenarioName}</div>
                <Badge variant="outline" className={LEVEL_STYLES[lastScenario.riskLevelAfter] ?? ""}>
                  {lastScenario.riskLevelBefore} → {lastScenario.riskLevelAfter}
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                <Metric label="Estimated PnL" value={`${lastScenario.estimatedPnlPct.toFixed(2)}%`} />
                <Metric label="Equity After" value={Number(lastScenario.estimatedEquity).toLocaleString("id-ID", { maximumFractionDigits: 0 })} />
                <Metric label="Confidence" value={lastScenario.confidence} />
              </div>
              {lastScenario.notes?.length > 0 && (
                <ul className="text-[11px] text-muted-foreground list-disc pl-5 space-y-0.5">
                  {lastScenario.notes.slice(0, 5).map((n: string, idx: number) => <li key={idx}>{n}</li>)}
                </ul>
              )}
              {lastScenario.recommendation && (
                <div className="text-xs"><span className="text-muted-foreground">Recommendation: </span>{lastScenario.recommendation}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/60 rounded px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function IssueList({ title, tone, items }: { title: string; tone: "rose" | "amber" | "emerald"; items: string[] }) {
  if (items.length === 0) return null;
  const cls = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-emerald-300";
  return (
    <div className="border border-border/60 rounded p-2">
      <div className={`text-[11px] uppercase ${cls} mb-1`}>{title}</div>
      <ul className="text-[12px] space-y-0.5 list-disc pl-4">
        {items.slice(0, 5).map((s, idx) => <li key={idx}>{s}</li>)}
      </ul>
    </div>
  );
}
