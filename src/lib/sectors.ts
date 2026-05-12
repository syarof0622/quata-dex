// IDX sector classification for LQ45 + popular IDX stocks.
import { US_TOP, IDX_LQ45 } from "./symbols";

export type Sector =
  | "Financials" | "Telecom" | "Consumer" | "Energy" | "Materials"
  | "Industrials" | "Tech" | "Healthcare" | "RealEstate" | "Utilities" | "Other";

const IDX_SECTOR: Record<string, Sector> = {
  // Banks / financials
  "BBCA.JK": "Financials", "BBRI.JK": "Financials", "BMRI.JK": "Financials",
  "BBNI.JK": "Financials", "BRIS.JK": "Financials", "ARTO.JK": "Financials",
  "BTPS.JK": "Financials", "BNGA.JK": "Financials",
  // Telecom & towers
  "TLKM.JK": "Telecom", "EXCL.JK": "Telecom", "ISAT.JK": "Telecom",
  "FREN.JK": "Telecom", "TBIG.JK": "Telecom", "TOWR.JK": "Telecom", "MTEL.JK": "Telecom",
  // Consumer
  "UNVR.JK": "Consumer", "ICBP.JK": "Consumer", "INDF.JK": "Consumer",
  "JPFA.JK": "Consumer", "CPIN.JK": "Consumer", "MAPI.JK": "Consumer",
  "MAPA.JK": "Consumer", "ACES.JK": "Consumer", "ERAA.JK": "Consumer",
  "AMRT.JK": "Consumer", "MYOR.JK": "Consumer", "GGRM.JK": "Consumer", "HMSP.JK": "Consumer",
  // Energy
  "ADRO.JK": "Energy", "PTBA.JK": "Energy", "ITMG.JK": "Energy",
  "MEDC.JK": "Energy", "PGAS.JK": "Energy", "AKRA.JK": "Energy",
  "HRUM.JK": "Energy", "INDY.JK": "Energy", "ADMR.JK": "Energy", "BUMI.JK": "Energy",
  // Materials / Mining
  "INCO.JK": "Materials", "ANTM.JK": "Materials", "TINS.JK": "Materials",
  "MDKA.JK": "Materials", "SMGR.JK": "Materials", "INTP.JK": "Materials",
  "NCKL.JK": "Materials",
  // Industrials
  "ASII.JK": "Industrials", "UNTR.JK": "Industrials",
  // Tech / Internet
  "GOTO.JK": "Tech", "BUKA.JK": "Tech", "EMTK.JK": "Tech",
  "MNCN.JK": "Tech", "SCMA.JK": "Tech", "BREN.JK": "Tech",
  // Healthcare
  "KLBF.JK": "Healthcare", "KAEF.JK": "Healthcare", "MIKA.JK": "Healthcare",
  // Real Estate
  "BSDE.JK": "RealEstate", "PWON.JK": "RealEstate",
  "CTRA.JK": "RealEstate", "SMRA.JK": "RealEstate",
};

const US_SECTOR: Record<string, Sector> = {
  // Tech
  AAPL: "Tech", MSFT: "Tech", NVDA: "Tech", GOOGL: "Tech", GOOG: "Tech", META: "Tech",
  AMD: "Tech", AVGO: "Tech", ORCL: "Tech", CRM: "Tech", ADBE: "Tech", INTC: "Tech",
  CSCO: "Tech", QCOM: "Tech", TXN: "Tech", IBM: "Tech", INTU: "Tech",
  // Consumer
  AMZN: "Consumer", TSLA: "Consumer", NFLX: "Consumer", WMT: "Consumer", COST: "Consumer",
  HD: "Consumer", MCD: "Consumer", NKE: "Consumer", SBUX: "Consumer", DIS: "Consumer",
  TGT: "Consumer", LOW: "Consumer", BKNG: "Consumer",
  PG: "Consumer", KO: "Consumer", PEP: "Consumer", PM: "Consumer", MO: "Consumer",
  MDLZ: "Consumer", CL: "Consumer",
  // Financials
  JPM: "Financials", BAC: "Financials", WFC: "Financials", GS: "Financials",
  MS: "Financials", C: "Financials", AXP: "Financials", BLK: "Financials",
  SCHW: "Financials", USB: "Financials", "BRK-B": "Financials",
  V: "Financials", MA: "Financials", PYPL: "Financials", SQ: "Financials",
  // Healthcare
  UNH: "Healthcare", JNJ: "Healthcare", LLY: "Healthcare", PFE: "Healthcare",
  MRK: "Healthcare", ABBV: "Healthcare", TMO: "Healthcare", ABT: "Healthcare",
  DHR: "Healthcare", BMY: "Healthcare", AMGN: "Healthcare",
  // Industrials
  BA: "Industrials", CAT: "Industrials", GE: "Industrials", HON: "Industrials",
  UPS: "Industrials", RTX: "Industrials", LMT: "Industrials", DE: "Industrials",
  MMM: "Industrials",
  // Energy
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", OXY: "Energy", PSX: "Energy",
  // Telecom / communication
  T: "Telecom", VZ: "Telecom", TMUS: "Telecom", CMCSA: "Telecom",
  // Utilities
  NEE: "Utilities", DUK: "Utilities", SO: "Utilities",
  // Materials
  LIN: "Materials", FCX: "Materials", NUE: "Materials",
  // Real Estate
  AMT: "RealEstate", PLD: "RealEstate", CCI: "RealEstate",
};

export function sectorOf(symbol: string): Sector {
  return IDX_SECTOR[symbol] ?? US_SECTOR[symbol] ?? "Other";
}

export const ALL_SECTORS: Sector[] = [
  "Financials", "Telecom", "Consumer", "Energy", "Materials",
  "Industrials", "Tech", "Healthcare", "RealEstate", "Utilities",
];

export const IDX_UNIVERSE_BY_SECTOR = (() => {
  const m = new Map<Sector, string[]>();
  for (const s of IDX_LQ45) {
    const sec = sectorOf(s);
    if (!m.has(sec)) m.set(sec, []);
    m.get(sec)!.push(s);
  }
  return m;
})();

export const US_UNIVERSE_BY_SECTOR = (() => {
  const m = new Map<Sector, string[]>();
  for (const s of US_TOP) {
    const sec = sectorOf(s);
    if (!m.has(sec)) m.set(sec, []);
    m.get(sec)!.push(s);
  }
  return m;
})();

/** Return up to N sector peers for a symbol (excluding the symbol itself). */
export function peerBasket(symbol: string, n = 5): string[] {
  const sec = sectorOf(symbol);
  const isIdx = symbol.endsWith(".JK");
  const universe = isIdx ? IDX_UNIVERSE_BY_SECTOR : US_UNIVERSE_BY_SECTOR;
  const peers = (universe.get(sec) ?? []).filter((s) => s !== symbol);
  return peers.slice(0, n);
}

export const FULL_UNIVERSE = [...IDX_LQ45, ...US_TOP];
