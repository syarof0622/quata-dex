import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { qualityBadgeLabel, type DataQualityReport } from "@/lib/data-quality";

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
  if (!report) {
    return <Badge variant="outline">No Quality Data</Badge>;
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
            <div className="font-semibold">Data Quality — {report.symbol}</div>
            <Row label="Price"        v={report.priceDataQuality} />
            <Row label="Technical"    v={report.technicalDataQuality} />
            <Row label="News"         v={report.newsDataQuality} />
            <Row label="Sentiment"    v={report.sentimentDataQuality} />
            <Row label="Disclosure"   v={report.disclosureDataQuality} />
            <Row label="Fundamental"  v={report.fundamentalDataQuality} />
            <div className="pt-1 border-t border-border/50 text-muted-foreground">
              Source reliability: {report.sourceReliabilityScore}
              {" · "}
              {report.decisionAllowed ? "decision allowed" : "decision blocked"}
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
