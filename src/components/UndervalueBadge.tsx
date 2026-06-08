import { useLang } from "@/hooks/use-language";

type Classification = string;

const CLS: Record<string, string> = {
  strong_undervalued: "bg-bull text-primary-foreground",
  undervalued:        "bg-bull-soft text-bull",
  fair_value:         "bg-accent/40 text-muted-foreground",
  overvalued:         "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  value_trap_risk:    "bg-bear text-primary-foreground",
  insufficient_data:  "bg-muted text-muted-foreground",
};

export function UndervalueBadge({ classification }: { classification: Classification }) {
  const { L } = useLang();
  const key = CLS[classification] ? classification : "insufficient_data";
  const label = L.body.badge.undervalue[key] ?? L.body.badge.undervalue.insufficient_data;
  return (
    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${CLS[key]}`}>
      {label}
    </span>
  );
}
