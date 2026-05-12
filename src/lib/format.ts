export const formatPrice = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatPct = (n: number | null | undefined, digits = 2) => {
  if (n == null || isNaN(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
};

export const formatCompact = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "—";
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
};

export const colorForChange = (n: number | null | undefined) =>
  n == null ? "text-muted-foreground" : n >= 0 ? "text-bull" : "text-bear";
