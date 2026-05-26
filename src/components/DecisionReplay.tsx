import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDecisionReplays, type DecisionReplayRow } from "@/lib/system-health.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eye } from "lucide-react";

function fmtWIB(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }) + " WIB";
  } catch { return iso; }
}

const ACTION_CLS: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  SELL: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  EXIT: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  HOLD: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  WATCH: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  BLOCKED: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  NO_TRADE: "bg-muted text-muted-foreground border-border",
};

export function DecisionReplayPanel() {
  const fetchRows = useServerFn(getDecisionReplays);
  const { data, isLoading } = useQuery({
    queryKey: ["decision-replays"],
    queryFn: () => fetchRows(),
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<DecisionReplayRow | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Decision Replay</CardTitle>
        <p className="text-xs text-muted-foreground">
          Audit setiap keputusan AI Agent dengan snapshot data yang dipakai saat itu.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Memuat keputusan…</div>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            Belum ada keputusan AI tercatat.
          </div>
        )}
        {!isLoading && (data?.length ?? 0) > 0 && (
          <div className="divide-y divide-border">
            {data!.map((row) => (
              <div key={row.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums w-32">{fmtWIB(row.created_at)}</span>
                <span className="font-mono font-medium w-20">{row.symbol}</span>
                <Badge variant="outline" className={ACTION_CLS[row.action] ?? ACTION_CLS.NO_TRADE}>
                  {row.action}
                </Badge>
                <span className="text-muted-foreground">
                  {row.decision_status ?? "—"} · conf {row.confidence != null ? Math.round(row.confidence * 100) : "—"}%
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2"
                  onClick={() => setSelected(row)}
                >
                  <Eye className="size-3.5 mr-1" /> Replay
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selected?.symbol} <Badge variant="outline" className={ACTION_CLS[selected?.action ?? "NO_TRADE"]}>{selected?.action}</Badge>
            </SheetTitle>
            <p className="text-xs text-muted-foreground">{selected && fmtWIB(selected.created_at)}</p>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4 text-sm">
              <Section title="Reasoning">
                <p className="whitespace-pre-wrap text-muted-foreground">{selected.reasoning ?? "—"}</p>
              </Section>
              <Section title="Final Decision">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.decision_replay_snapshot?.finalDecision ?? { action: selected.action, status: selected.decision_status }, null, 2)}
                </pre>
              </Section>
              <Section title="Risk Guard">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.decision_replay_snapshot?.riskGuard ?? selected.risk_snapshot ?? {}, null, 2)}
                </pre>
              </Section>
              <Section title="Strategy Context">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.strategy_context ?? selected.decision_replay_snapshot?.strategyContext ?? {}, null, 2)}
                </pre>
              </Section>
              <Section title="Technical">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.technical_snapshot ?? {}, null, 2)}
                </pre>
              </Section>
              <Section title="News & Sentiment">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.sentiment_snapshot ?? {}, null, 2)}
                </pre>
              </Section>
              <Section title="Portfolio Snapshot">
                <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto">
                  {JSON.stringify(selected.portfolio_snapshot ?? {}, null, 2)}
                </pre>
              </Section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {children}
    </div>
  );
}
