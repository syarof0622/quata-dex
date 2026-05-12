// Symbol universes — heavy on Indonesian (IDX) coverage.

export type MarketKey = "idx" | "us" | "global";

// LQ45 + popular IDX names (Yahoo suffix .JK) — broadened toward IDX80.
export const IDX_LQ45 = [
  // Banks / financials
  "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "BRIS.JK", "ARTO.JK", "BTPS.JK", "BNGA.JK",
  // Telecom & towers
  "TLKM.JK", "EXCL.JK", "ISAT.JK", "FREN.JK", "TBIG.JK", "TOWR.JK", "MTEL.JK",
  // Consumer / retail / staples
  "UNVR.JK", "ICBP.JK", "INDF.JK", "JPFA.JK", "CPIN.JK", "MAPI.JK", "MAPA.JK",
  "ACES.JK", "ERAA.JK", "AMRT.JK", "MYOR.JK", "GGRM.JK", "HMSP.JK",
  // Energy / coal / oil-gas
  "ADRO.JK", "PTBA.JK", "ITMG.JK", "MEDC.JK", "PGAS.JK", "AKRA.JK", "HRUM.JK",
  "INDY.JK", "ADMR.JK", "BUMI.JK",
  // Mining / materials
  "INCO.JK", "ANTM.JK", "TINS.JK", "MDKA.JK", "SMGR.JK", "INTP.JK", "NCKL.JK",
  // Industrials
  "ASII.JK", "UNTR.JK", "SMRA.JK",
  // Tech / internet
  "GOTO.JK", "BUKA.JK", "EMTK.JK", "MNCN.JK", "SCMA.JK", "BREN.JK",
  // Healthcare
  "KLBF.JK", "KAEF.JK", "MIKA.JK",
  // Property / real estate
  "BSDE.JK", "PWON.JK", "CTRA.JK",
];

export const IDX_INDICES = [
  "^JKSE",      // IHSG
  "^JKLQ45",    // LQ45
];

export const GLOBAL_INDICES = [
  "^GSPC", "^IXIC", "^DJI", "^N225", "^HSI", "^STI",
];

export const ALL_INDICES = [...IDX_INDICES, ...GLOBAL_INDICES, "^VIX"];

// Broad US universe — S&P 100-style heavyweights across sectors.
export const US_TOP = [
  // Mega-cap tech
  "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "ORCL",
  "AMD", "NFLX", "CRM", "ADBE", "INTC", "CSCO", "QCOM", "TXN", "IBM", "INTU",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "BLK", "SCHW", "USB", "BRK-B",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY", "AMGN",
  // Consumer
  "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "DIS", "TGT", "LOW", "BKNG",
  "PG", "KO", "PEP", "PM", "MO", "MDLZ", "CL",
  // Industrials & energy
  "BA", "CAT", "GE", "HON", "UPS", "RTX", "LMT", "DE", "MMM",
  "XOM", "CVX", "COP", "SLB", "OXY", "PSX",
  // Communication / media
  "T", "VZ", "TMUS", "CMCSA",
  // Utilities & materials
  "NEE", "DUK", "SO", "LIN", "FCX", "NUE",
  // Real estate
  "AMT", "PLD", "CCI",
  // Payments / fintech
  "V", "MA", "PYPL", "SQ",
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
