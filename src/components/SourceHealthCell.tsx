// Honest, color-correct cell for a single news/data source row.
// Maps the unified status enum (active / fallback_active / quota_protected /
// degraded / failed / disabled_by_config) to info/neutral/warning/error tones —
// fallback and quota-protection are NOT failures, so they must not show red.
import { CheckCircle2, AlertTriangle, ShieldCheck, GitBranch, MinusCircle, HelpCircle, XCircle } from "lucide-react";
import { normalizeSourceRow, sourceStatusLabel, type RawSourceRow, type NormalizedStatus } from "@/lib/source-health";

type Tone = {
  ring: string;   // border + bg
  fg: string;     // text color
  Icon: typeof CheckCircle2;
};

const TONES: Record<NormalizedStatus, Tone> = {
  active:             { ring: "border-bull/40 bg-bull/5",                      fg: "text-bull",              Icon: CheckCircle2 },
  fallback_active:    { ring: "border-amber-500/40 bg-amber-500/5",            fg: "text-amber-500",         Icon: GitBranch },
  quota_protected:    { ring: "border-sky-500/40 bg-sky-500/5",                fg: "text-sky-500",           Icon: ShieldCheck },
  degraded:           { ring: "border-amber-500/40 bg-amber-500/5",            fg: "text-amber-500",         Icon: AlertTriangle },
  failed:             { ring: "border-bear/40 bg-bear/5",                      fg: "text-bear",              Icon: XCircle },
  disabled_by_config: { ring: "border-border bg-muted/30",                     fg: "text-muted-foreground",  Icon: MinusCircle },
  unknown:            { ring: "border-border bg-muted/20",                     fg: "text-muted-foreground",  Icon: HelpCircle },
};

export function SourceHealthCell({
  row,
  articlesToday,
  lastLabel,
  formatTime,
  noDataLabel = "no data",
}: {
  row: RawSourceRow;
  articlesToday?: number | null;
  lastLabel: string;
  formatTime: (iso: string) => string;
  noDataLabel?: string;
}) {
  const n = normalizeSourceRow(row);
  const tone = TONES[n.status];
  const Icon = tone.Icon;
  const detail =
    n.status === "active"
      ? `${articlesToday ?? 0} today`
      : n.status === "fallback_active"
      ? "Using fallback source"
      : n.status === "quota_protected"
      ? "Quota protected"
      : n.status === "disabled_by_config"
      ? "Disabled"
      : (n.message?.slice(0, 60) ?? noDataLabel);

  return (
    <div className={`rounded border ${tone.ring} p-2 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate" title={row.name}>{row.name}</span>
        <span className={`inline-flex items-center gap-1 ${tone.fg}`} title={sourceStatusLabel(n.status)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className={`text-[10px] mt-1 ${tone.fg}`}>{sourceStatusLabel(n.status)}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={detail}>{detail}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {n.lastSuccessAt ? `${lastLabel} ${formatTime(n.lastSuccessAt)}` : "—"}
      </div>
    </div>
  );
}
