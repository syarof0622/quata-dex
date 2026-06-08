import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLang } from "@/hooks/use-language";

export function ConfidenceCalibrationBadge({
  raw,
  calibrated,
  reason,
}: {
  raw: number | null | undefined;
  calibrated: number | null | undefined;
  reason?: string | null;
}) {
  const { L } = useLang();
  const T = L.body.badge.confidence;
  const r = raw == null ? null : Math.round(Number(raw) * 100);
  const c = calibrated == null ? null : Math.round(Number(calibrated) * 100);
  if (r == null && c == null) return <span className="text-muted-foreground text-xs">—</span>;
  const arrow = r != null && c != null && c !== r ? (c > r ? "↑" : "↓") : "·";
  const tone = r != null && c != null
    ? c >= r ? "text-emerald-500" : "text-amber-500"
    : "text-muted-foreground";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-xs font-mono cursor-help ${tone}`}>
            {T.raw} {r ?? "—"}% {arrow} {T.cal} {c ?? "—"}%
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="font-semibold mb-1">{T.title}</div>
          <p className="text-muted-foreground">{reason || T.defaultReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
