import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getDecisionReplays, type DecisionReplayRow } from "@/lib/system-health.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronDown, ChevronUp, Eye, History } from "lucide-react";
import { cn } from "@/lib/utils";

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
  RESEARCH: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  BLOCKED: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  NO_TRADE: "bg-muted text-muted-foreground border-border",
};

// Reasons that mean: AI wanted to act, but a guard/limit prevented execution.
// These must surface as BLOCKED in the final status while keeping the original
// action as the intent.
const BLOCKING_REASONS = new Set([
  "limit_reached",
  "max_active_positions_reached",
  "risk_limit_reached",
  "confidence_below_threshold",
  "market_closed",
  "insufficient_cash",
  "sector_exposure_limit",
  "risk_reward_invalid",
  "daily_loss_limit",
  "pause_active",
  "cooldown_active",
]);

type Derived = {
  intent: string;            // original AI intent (BUY/SELL/HOLD/WATCH/…)
  finalStatus: string;       // BUY only if executed; otherwise BLOCKED/HOLD/WATCH/NO_TRADE
  reason: string | null;
  blocked: boolean;
};

function deriveStatus(row: DecisionReplayRow): Derived {
  const intent = (row.action || "NO_TRADE").toUpperCase();
  const status = (row.decision_status ?? "").toLowerCase().trim();
  const snap = row.decision_replay_snapshot?.finalDecision ?? {};
  const executed = Boolean(
    snap?.executed ||
    snap?.paperOrderId ||
    snap?.orderId ||
    status === "executed" ||
    status === "filled",
  );

  // Anything that maps to a blocking reason ⇒ BLOCKED
  const isBlocked =
    !executed &&
    (BLOCKING_REASONS.has(status) ||
      status.startsWith("blocked") ||
      status.includes("limit") ||
      status.includes("reject"));

  let finalStatus = intent;
  if (intent === "BUY" || intent === "SELL" || intent === "EXIT") {
    if (executed) finalStatus = intent;
    else if (isBlocked) finalStatus = "BLOCKED";
    else finalStatus = intent === "BUY" ? "WATCH" : intent; // intent not executed & no clear block ⇒ research/watch
  }
  // HOLD / WATCH / RESEARCH stay as-is
  return {
    intent,
    finalStatus,
    reason: row.decision_status ?? null,
    blocked: isBlocked,
  };
}

export function DecisionReplayPanel({ defaultOpen = false, compactCount = 5 }: { defaultOpen?: boolean; compactCount?: number }) {
  const fetchRows = useServerFn(getDecisionReplays);
  const { data, isLoading } = useQuery({
    queryKey: ["decision-replays"],
    queryFn: () => fetchRows(),
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<DecisionReplayRow | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);

  const rows = data ?? [];
  const visible = useMemo(() => (expanded ? rows : rows.slice(0, compactCount)), [rows, expanded, compactCount]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Decision Replay
              {rows.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rows.length}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Audit keputusan AI Agent — snapshot data, risk guard, dan paper order status.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs shrink-0"
            onClick={() => setExpanded((v) => !v)}
            disabled={rows.length === 0}
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Collapse</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Expand{rows.length > compactCount ? ` (${rows.length})` : ""}</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Memuat keputusan…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Belum ada keputusan AI tercatat.</div>
        )}
        {!isLoading && rows.length > 0 && (
          <div className={cn("divide-y divide-border", expanded && "max-h-[420px] overflow-y-auto")}>
            {visible.map((row) => {
              const d = deriveStatus(row);
              return (
                <div key={row.id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground tabular-nums w-28 shrink-0">{fmtWIB(row.created_at)}</span>
                  <span className="font-mono font-medium w-20 shrink-0">{row.symbol}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase">Intent</span>
                    <Badge variant="outline" className={cn("text-[10px] py-0", ACTION_CLS[d.intent] ?? ACTION_CLS.NO_TRADE)}>
                      {d.intent}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase">Final</span>
                    <Badge variant="outline" className={cn("text-[10px] py-0", ACTION_CLS[d.finalStatus] ?? ACTION_CLS.NO_TRADE)}>
                      {d.finalStatus}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground truncate">
                    {d.reason ?? "—"} · conf {row.confidence != null ? Math.round(row.confidence * 100) : "—"}%
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
              );
            })}
            {!expanded && rows.length > compactCount && (
              <div className="px-4 py-2 text-[11px] text-muted-foreground text-center">
                +{rows.length - compactCount} keputusan lainnya — klik Expand untuk melihat semua.
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              <span>{selected?.symbol}</span>
              {selected && (() => {
                const d = deriveStatus(selected);
                return (
                  <>
                    <Badge variant="outline" className={cn("text-[10px]", ACTION_CLS[d.intent] ?? ACTION_CLS.NO_TRADE)}>Intent: {d.intent}</Badge>
                    <Badge variant="outline" className={cn("text-[10px]", ACTION_CLS[d.finalStatus] ?? ACTION_CLS.NO_TRADE)}>Final: {d.finalStatus}</Badge>
                  </>
                );
              })()}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {selected && fmtWIB(selected.created_at)}
              {selected?.decision_status && <> · reason: {selected.decision_status}</>}
              {selected?.confidence != null && <> · conf {Math.round(selected.confidence * 100)}%</>}
            </p>
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
