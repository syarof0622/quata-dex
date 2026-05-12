// Local-only watchlist (no auth, no server). Persists in localStorage.
const KEY = "quanta:watchlist";

type Row = { symbol: string; added_at: string };

function read(): Row[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(rows: Row[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export async function getWatchlist() {
  return read();
}

export async function addToWatchlist(args: { data: { symbol: string } }) {
  const symbol = args.data.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false };
  const rows = read();
  if (!rows.some(r => r.symbol === symbol)) {
    rows.unshift({ symbol, added_at: new Date().toISOString() });
    write(rows);
  }
  return { ok: true };
}

export async function removeFromWatchlist(args: { data: { symbol: string } }) {
  const symbol = args.data.symbol.trim().toUpperCase();
  write(read().filter(r => r.symbol !== symbol));
  return { ok: true };
}
