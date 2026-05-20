// Phase B–E aggregated panel: Market regime, sector rotation, portfolio risk,
// trade reviews, alerts. Dropped into AI Trade Agent lab as a single tab.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  computeMarketRegime,
  getLatestMarketRegime,
} from "@/lib/market-regime.functions";
import {
  computeSectorRotation,
  getLatestSectorRotation,
} from "@/lib/sector-rotation.functions";
import {
  computePortfolioRisk,
  getLatestPortfolioRisk,
} from "@/lib/portfolio-risk.functions";
import {
  runPostTradeReview,
  listRecentTradeReviews,
  summarizeLessonsLearned,
} from "@/lib/post-trade-review.functions";
import {
  evaluateAiAlerts,
  listAlertDefinitions,
} from "@/lib/alerts-intelligence.functions";

const sevColor: Record<string, string> = {
  info: "secondary",
  warning: "outline",
  critical: "destructive",
};

const regimeColor: Record<string, string> = {
  risk_on: "default",
  risk_off: "destructive",
  neutral: "secondary",
  transition: "outline",
  insufficient_data: "outline",
};

export function AiInsightsPanel() {
  const fetchRegime = useServerFn(getLatestMarketRegime);
  const fetchSectors = useServerFn(getLatestSectorRotation);
  const fetchRisk = useServerFn(getLatestPortfolioRisk);
  const fetchReviews = useServerFn(listRecentTradeReviews);
  const fetchLessons = useServerFn(summarizeLessonsLearned);
  const fetchAlerts = useServerFn(evaluateAiAlerts);
  const fetchDefs = useServerFn(listAlertDefinitions);

  const runRegime = useServerFn(computeMarketRegime);
  const runSectors = useServerFn(computeSectorRotation);
  const runRisk = useServerFn(computePortfolioRisk);
  const runReview = useServerFn(runPostTradeReview);

  const [busy, setBusy] = useState<string | null>(null);

  const regime = useQuery({ queryKey: ["ai_regime"], queryFn: () => fetchRegime() });
  const sectors = useQuery({ queryKey: ["ai_sectors"], queryFn: () => fetchSectors() });
  const risk = useQuery({ queryKey: ["ai_risk"], queryFn: () => fetchRisk() });
  const reviews = useQuery({
    queryKey: ["ai_reviews"],
    queryFn: () => fetchReviews({ data: { limit: 10 } }),
  });
  const lessons = useQuery({ queryKey: ["ai_lessons"], queryFn: () => fetchLessons() });
  const alerts = useQuery({ queryKey: ["ai_alerts_eval"], queryFn: () => fetchAlerts() });
  const defs = useQuery({ queryKey: ["ai_alerts_def"], queryFn: () => fetchDefs() });

  async function refresh(kind: string) {
    setBusy(kind);
    try {
      if (kind === "regime") await runRegime();
      if (kind === "sectors") await runSectors();
      if (kind === "risk") await runRisk();
      if (kind === "review") await runReview({ data: { limit: 25 } });
      regime.refetch();
      sectors.refetch();
      risk.refetch();
      reviews.refetch();
      lessons.refetch();
      alerts.refetch();
    } finally {
      setBusy(null);
    }
  }

  const r: any = regime.data ?? null;
  const k: any = risk.data ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Market Regime */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Market Regime (IDX)</CardTitle>
          <Button size="sm" variant="outline" disabled={busy === "regime"} onClick={() => refresh("regime")}>
            {busy === "regime" ? "..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {r ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={(regimeColor[r.regime_classification] as any) ?? "secondary"}>
                  {r.regime_classification}
                </Badge>
                <Badge variant="outline">Trend: {r.regime_trend}</Badge>
                <Badge variant="outline">Vol: {r.regime_volatility}</Badge>
                <Badge variant="outline">Breadth: {r.regime_breadth}</Badge>
              </div>
              <div className="text-muted-foreground">{r.reasoning}</div>
              {r.idx_level && (
                <div>
                  IDX {Number(r.idx_level).toFixed(0)} · 20D{" "}
                  {Number(r.idx_change_pct ?? 0).toFixed(2)}%
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">Belum ada snapshot. Klik Refresh.</div>
          )}
        </CardContent>
      </Card>

      {/* Sector Rotation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sector Rotation</CardTitle>
          <Button size="sm" variant="outline" disabled={busy === "sectors"} onClick={() => refresh("sectors")}>
            {busy === "sectors" ? "..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Sector</th>
                  <th className="text-right">RS%</th>
                  <th className="text-right">Breadth</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {(sectors.data ?? []).map((s: any) => (
                  <tr key={s.sector} className="border-b border-border/50">
                    <td>{s.sector}</td>
                    <td className="text-right">{Number(s.relative_strength).toFixed(2)}</td>
                    <td className="text-right">{Number(s.breadth_score).toFixed(0)}%</td>
                    <td>
                      <Badge variant="outline" className="text-[10px]">
                        {s.classification}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(!sectors.data || sectors.data.length === 0) && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground py-4 text-center">
                      Tidak ada data. Klik Refresh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Portfolio Risk */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Portfolio Risk</CardTitle>
          <Button size="sm" variant="outline" disabled={busy === "risk"} onClick={() => refresh("risk")}>
            {busy === "risk" ? "..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {k ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    k.risk_level === "high"
                      ? "destructive"
                      : k.risk_level === "elevated"
                        ? "outline"
                        : "secondary"
                  }
                >
                  Risk: {k.risk_level}
                </Badge>
                <Badge variant="outline">Cash: {Number(k.cash_pct).toFixed(0)}%</Badge>
                <Badge variant="outline">Max pos: {Number(k.max_position_weight).toFixed(1)}%</Badge>
                <Badge variant="outline">DD: {Number(k.current_drawdown).toFixed(2)}%</Badge>
                <Badge variant="outline">Today: {Number(k.daily_pnl_pct).toFixed(2)}%</Badge>
              </div>
              {Array.isArray(k.warnings) && k.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-amber-500 text-xs">
                  {k.warnings.map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">Belum ada snapshot risk.</div>
          )}
        </CardContent>
      </Card>

      {/* Trade Reviews */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Post-Trade Reviews</CardTitle>
          <Button size="sm" variant="outline" disabled={busy === "review"} onClick={() => refresh("review")}>
            {busy === "review" ? "..." : "Run Review"}
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <ul className="space-y-2 text-xs">
              {(reviews.data ?? []).map((r: any) => (
                <li key={r.id} className="border-b border-border/50 pb-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{r.symbol}</span>
                    <Badge
                      variant={r.outcome === "win" ? "default" : r.outcome === "loss" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.outcome} · {Number(r.pnl_pct).toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">Lesson: {r.lesson_label}</div>
                  {r.what_went_wrong && (
                    <div className="text-amber-500">✗ {r.what_went_wrong}</div>
                  )}
                  {r.what_went_right && (
                    <div className="text-emerald-500">✓ {r.what_went_right}</div>
                  )}
                </li>
              ))}
              {(!reviews.data || reviews.data.length === 0) && (
                <li className="text-muted-foreground">Belum ada review.</li>
              )}
            </ul>
          </ScrollArea>
          {lessons.data && lessons.data.length > 0 && (
            <div className="mt-3 text-xs">
              <div className="font-semibold mb-1">Lessons Learned</div>
              <div className="flex flex-wrap gap-1">
                {lessons.data.slice(0, 6).map((l: any) => (
                  <Badge key={l.lesson} variant="outline" className="text-[10px]">
                    {l.lesson}: {l.win_rate}% × {l.total}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Alerts */}
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">AI Alerts (Evaluated)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => alerts.refetch()}>
            Re-evaluate
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <ul className="space-y-1 text-xs">
              {(alerts.data ?? []).map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-2 border-b border-border/50 pb-1">
                  <Badge variant={(sevColor[a.severity] as any) ?? "secondary"} className="text-[10px]">
                    {a.severity}
                  </Badge>
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-muted-foreground">{a.message}</div>
                  </div>
                </li>
              ))}
              {(!alerts.data || alerts.data.length === 0) && (
                <li className="text-muted-foreground">Tidak ada alert aktif saat ini.</li>
              )}
            </ul>
          </ScrollArea>
          {defs.data && defs.data.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              {defs.data.length} alert types tersedia ·{" "}
              {Array.from(new Set(defs.data.map((d: any) => d.category))).join(" · ")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
