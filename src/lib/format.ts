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

export const formatIDR = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "Rp —";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
};

export const formatIDRCompact = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "Rp —";
  const abs = Math.abs(n);
  if (abs >= 1e12) return "Rp " + (n / 1e12).toFixed(2) + " T";
  if (abs >= 1e9) return "Rp " + (n / 1e9).toFixed(2) + " M";
  if (abs >= 1e6) return "Rp " + (n / 1e6).toFixed(2) + " jt";
  if (abs >= 1e3) return "Rp " + (n / 1e3).toFixed(1) + " rb";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
};

export const formatUSD = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "$—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatUSDCompact = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
};

export type AccountCurrency = "IDR" | "USD";

/**
 * Single-source money formatter aware of account currency. Use this for any
 * value that represents an account-denominated amount (equity, cash, P/L,
 * holdings market value). Do NOT use it for per-symbol last/avg prices on
 * IDX stocks — those should keep formatLocalPrice() for share-price units.
 */
export const formatMoneyByCurrency = (
  currency: AccountCurrency | string | null | undefined,
  amount: number | null | undefined,
) => {
  const c = (currency ?? "IDR").toUpperCase();
  return c === "USD" ? formatUSD(amount) : formatIDR(amount);
};

export const formatMoneyCompact = (
  currency: AccountCurrency | string | null | undefined,
  amount: number | null | undefined,
) => {
  const c = (currency ?? "IDR").toUpperCase();
  return c === "USD" ? formatUSDCompact(amount) : formatIDRCompact(amount);
};

export const colorForChange = (n: number | null | undefined) =>
  n == null ? "text-muted-foreground" : n >= 0 ? "text-bull" : "text-bear";

