// Helper untuk menampilkan kode emiten kepada pengguna.
// - Membuang akhiran ".JK" pada saham IDX (BBCA.JK → BBCA).
// - Memetakan simbol indeks Yahoo (^JKSE) ke nama yang dikenal pengguna ID.
const INDEX_LABELS: Record<string, string> = {
  "^JKSE": "IHSG",
  "^JKLQ45": "LQ45",
  "^GSPC": "S&P 500",
  "^IXIC": "NASDAQ",
  "^DJI": "Dow Jones",
  "^RUT": "Russell 2000",
  "^VIX": "VIX",
  "^N225": "Nikkei 225",
  "^HSI": "Hang Seng",
  "^STI": "STI",
};

export function displaySymbol(sym?: string | null): string {
  if (!sym) return "";
  const s = String(sym).toUpperCase().trim();
  if (INDEX_LABELS[s]) return INDEX_LABELS[s];
  if (s.startsWith("^")) return s.slice(1);
  if (s.endsWith(".JK")) return s.slice(0, -3);
  return s;
}
