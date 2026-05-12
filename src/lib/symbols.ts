// Symbol universes — heavy on Indonesian (IDX) coverage.

export type MarketKey = "idx" | "us" | "global";

// LQ45 + popular IDX names (Yahoo suffix .JK)
export const IDX_LQ45 = [
  "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "BRIS.JK",
  "TLKM.JK", "ASII.JK", "UNVR.JK", "ICBP.JK", "INDF.JK",
  "GOTO.JK", "ARTO.JK", "BUKA.JK", "EMTK.JK", "MDKA.JK",
  "ADRO.JK", "PTBA.JK", "ITMG.JK", "INCO.JK", "ANTM.JK",
  "TINS.JK", "MEDC.JK", "PGAS.JK", "AKRA.JK", "UNTR.JK",
  "SMGR.JK", "INTP.JK", "JPFA.JK", "CPIN.JK", "MAPI.JK",
  "ACES.JK", "ERAA.JK", "MNCN.JK", "SCMA.JK", "TBIG.JK",
  "TOWR.JK", "EXCL.JK", "ISAT.JK", "FREN.JK", "BSDE.JK",
  "PWON.JK", "CTRA.JK", "SMRA.JK", "KLBF.JK", "KAEF.JK",
];

export const IDX_INDICES = [
  "^JKSE",      // IHSG
  "^JKLQ45",    // LQ45
];

export const GLOBAL_INDICES = [
  "^GSPC", "^IXIC", "^DJI", "^N225", "^HSI", "^STI",
];

export const ALL_INDICES = [...IDX_INDICES, ...GLOBAL_INDICES, "^VIX"];

export const US_TOP = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "NFLX", "AVGO",
];

export function symbolMarket(sym: string): MarketKey {
  if (sym.endsWith(".JK") || sym.startsWith("^JK")) return "idx";
  return "us";
}

export function priceCurrency(sym: string): "IDR" | "USD" | string {
  if (symbolMarket(sym) === "idx") return "IDR";
  return "USD";
}

export function formatLocalPrice(sym: string, n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return "—";
  if (symbolMarket(sym) === "idx") {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
