// IDX sector classification for LQ45 + popular IDX stocks.
import { US_TOP, IDX_LQ45 } from "./symbols";

export type Sector =
  | "Financials" | "Telecom" | "Consumer" | "Energy" | "Materials"
  | "Industrials" | "Tech" | "Healthcare" | "RealEstate" | "Utilities" | "Other";

const IDX_SECTOR: Record<string, Sector> = {
  // Banks
  "BBCA.JK": "Financials", "BBRI.JK": "Financials", "BMRI.JK": "Financials",
  "BBNI.JK": "Financials", "BRIS.JK": "Financials", "ARTO.JK": "Financials",
  // Telecom
  "TLKM.JK": "Telecom", "EXCL.JK": "Telecom", "ISAT.JK": "Telecom",
  "FREN.JK": "Telecom", "TBIG.JK": "Telecom", "TOWR.JK": "Telecom",
  // Consumer
  "UNVR.JK": "Consumer", "ICBP.JK": "Consumer", "INDF.JK": "Consumer",
  "JPFA.JK": "Consumer", "CPIN.JK": "Consumer", "MAPI.JK": "Consumer",
  "ACES.JK": "Consumer", "ERAA.JK": "Consumer",
  // Energy
  "ADRO.JK": "Energy", "PTBA.JK": "Energy", "ITMG.JK": "Energy",
  "MEDC.JK": "Energy", "PGAS.JK": "Energy", "AKRA.JK": "Energy",
  // Materials / Mining
  "INCO.JK": "Materials", "ANTM.JK": "Materials", "TINS.JK": "Materials",
  "MDKA.JK": "Materials", "SMGR.JK": "Materials", "INTP.JK": "Materials",
  // Industrials
  "ASII.JK": "Industrials", "UNTR.JK": "Industrials",
  // Tech / Internet
  "GOTO.JK": "Tech", "BUKA.JK": "Tech", "EMTK.JK": "Tech",
  "MNCN.JK": "Tech", "SCMA.JK": "Tech",
  // Healthcare
  "KLBF.JK": "Healthcare", "KAEF.JK": "Healthcare",
  // Real Estate
  "BSDE.JK": "RealEstate", "PWON.JK": "RealEstate",
  "CTRA.JK": "RealEstate", "SMRA.JK": "RealEstate",
};

const US_SECTOR: Record<string, Sector> = {
  AAPL: "Tech", MSFT: "Tech", NVDA: "Tech", GOOGL: "Tech", META: "Tech",
  AMZN: "Consumer", TSLA: "Consumer", NFLX: "Consumer",
  AMD: "Tech", AVGO: "Tech",
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

export const FULL_UNIVERSE = [...IDX_LQ45, ...US_TOP];
