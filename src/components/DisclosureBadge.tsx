/**
 * PATCH 21 — Reusable DisclosureBadge.
 *
 * Renders a compact badge for an official disclosure / corporate action /
 * regulatory event. Used by Portfolio, Watchlist, Screener, News, AI Agent.
 *
 * NEVER fabricates: caller must pass a record sourced from
 * official_disclosures / corporate_actions / regulatory_events. If
 * `disclosure` is null/undefined the component returns null.
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, Megaphone, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-language";

export type DisclosureBadgeRecord = {
  id?: string;
  symbol?: string;
  title?: string | null;
  disclosure_type?: string | null;
  action_type?: string | null;
  event_type?: string | null;
  source?: string | null;
  published_at?: string | null;
  announcement_date?: string | null;
  impact_score?: number | null;
  impact_level?: string | null;
  sentiment?: string | null;
  is_high_impact?: boolean | null;
};

function eventKind(d: DisclosureBadgeRecord): string {
  return (
    d.disclosure_type?.toLowerCase() ||
    d.action_type?.toLowerCase() ||
    d.event_type?.toLowerCase() ||
    "disclosure"
  );
}

function severity(d: DisclosureBadgeRecord): "high" | "medium" | "low" {
  if (d.is_high_impact) return "high";
  if (typeof d.impact_score === "number") {
    if (d.impact_score >= 70) return "high";
    if (d.impact_score >= 40) return "medium";
    return "low";
  }
  const lvl = (d.impact_level ?? "").toLowerCase();
  if (lvl === "high" || lvl === "critical") return "high";
  if (lvl === "medium") return "medium";
  return "low";
}

export function DisclosureBadge({
  disclosure,
  className,
  compact = false,
}: {
  disclosure: DisclosureBadgeRecord | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!disclosure) return null;
  const kind = eventKind(disclosure);
  const sev = severity(disclosure);
  const sentiment = (disclosure.sentiment ?? "neutral").toLowerCase();

  const Icon =
    kind.includes("uma") || kind.includes("suspen") || kind.includes("delist")
      ? ShieldAlert
      : kind.includes("dividen") || kind.includes("buyback")
        ? TrendingUp
        : kind.includes("rights") || kind.includes("dilut")
          ? TrendingDown
          : kind.includes("announce") || kind.includes("rups")
            ? Megaphone
            : sev === "high"
              ? AlertTriangle
              : FileText;

  const variantClass =
    sev === "high"
      ? "border-destructive/60 bg-destructive/10 text-destructive"
      : sev === "medium"
        ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : sentiment === "positive"
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-muted-foreground/40 bg-muted text-muted-foreground";

  const label = compact
    ? kind.replace(/_/g, " ").toUpperCase()
    : `${kind.replace(/_/g, " ").toUpperCase()} · ${sev.toUpperCase()}`;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", variantClass, className)}
      title={disclosure.title ?? ""}
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[160px]">{label}</span>
    </Badge>
  );
}
