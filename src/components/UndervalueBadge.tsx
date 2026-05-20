// Classification is one of: strong_undervalued | undervalued | fair_value | overvalued | value_trap_risk | insufficient_data
type Classification = string;

const MAP: Record<string, { label: string; cls: string }> = {
  strong_undervalued: { label: "STRONG UNDERVALUED", cls: "bg-bull text-primary-foreground" },
  undervalued:        { label: "UNDERVALUED",        cls: "bg-bull-soft text-bull" },
  fair_value:         { label: "FAIR VALUE",         cls: "bg-accent/40 text-muted-foreground" },
  overvalued:         { label: "OVERVALUED",         cls: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  value_trap_risk:    { label: "VALUE TRAP RISK",    cls: "bg-bear text-primary-foreground" },
  insufficient_data:  { label: "INSUFFICIENT DATA",  cls: "bg-muted text-muted-foreground" },
};

export function UndervalueBadge({ classification }: { classification: Classification | string }) {
  const m = MAP[classification] ?? MAP.insufficient_data;
  return (
    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  );
}
