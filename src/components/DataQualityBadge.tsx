import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { qualityBadgeLabel, type DataQualityReport } from "@/lib/data-quality";
import { useLang } from "@/hooks/use-language";

const ROW_COLORS: Record<string, string> = {
  fresh: "text-emerald-500",
  available: "text-emerald-500",
  moderate: "text-amber-500",
  stale: "text-orange-500",
  insufficient: "text-rose-500",
  unavailable: "text-muted-foreground",
};

const VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "DATA READY": "default",
  "PARTIAL DATA": "secondary",
  "DATA STALE": "outline",
  "INSUFFICIENT DATA": "destructive",
};

export function DataQualityBadge({ report }: { report: DataQualityReport | null | undefined }) {
  const { L } = useLang();
  const T = L.body.badge.dataQuality;
  if (!report) {
    return <Badge variant="outline">{T.noData}</Badge>;
  }
  const label = qualityBadgeLabel(report);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={VARIANTS[label]} className="cursor-help">
            {label} · {report.overallDataQualityScore}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1 text-xs">
            <div className="font-semibold">{T.title} {report.symbol}</div>
            <Row label={T.rows.price}       v={report.priceDataQuality} />
            <Row label={T.rows.technical}   v={report.technicalDataQuality} />
            <Row label={T.rows.news}        v={report.newsDataQuality} />
            <Row label={T.rows.sentiment}   v={report.sentimentDataQuality} />
            <Row label={T.rows.disclosure}  v={report.disclosureDataQuality} />
            <Row label={T.rows.fundamental} v={report.fundamentalDataQuality} />
            <div className="pt-1 border-t border-border/50 text-muted-foreground">
              {T.sourceReliability} {report.sourceReliabilityScore}
              {" · "}
              {report.decisionAllowed ? T.decisionAllowed : T.decisionBlocked}
            </div>
            {report.warnings.length > 0 && (
              <ul className="list-disc list-inside text-amber-500">
                {report.warnings.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={ROW_COLORS[v] ?? ""}>{v}</span>
    </div>
  );
}

