// Static config for the news aggregator. Safe to import from anywhere.

export type NewsSourceCfg = {
  id: string;
  name: string;
  type: "rss" | "rss_or_light_scrape" | "special_source";
  url: string;
  fallbackUrls?: string[];
  priority: number;
  category: string;
  enabled: boolean;
  // Special handling (Kontan, Investor.id) — direct + Google News site-query fallback
  special?: {
    siteDomain: string; // e.g. "kontan.co.id"
    directUrls: string[]; // RSS or public page candidates tried in order
    fallbackQueries: string[]; // queries appended to "site:<siteDomain> "
    fallbackPriority: number;
  };
};

export const SPECIAL_HANDLING_SOURCES = [
  "kontan", "investor_id",
  "bisnis_market", "detikfinance", "katadata", "pasardana", "emitennews",
  "idx_channel", "kompas_money", "cnn_indonesia_ekonomi", "tempo_bisnis",
  "beritasatu_ekonomi", "republika_ekonomi", "liputan6_saham",
] as const;

export function buildGoogleNewsSiteFallbackUrl(site: string, query: string): string {
  const finalQuery = `site:${site} ${query}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(finalQuery)}&hl=id&gl=ID&ceid=ID:id`;
}

// Shared fallback query set for Indonesian stock/market news. Reused by all
// new Indonesian news sources so each one falls back to a Google News
// site:<domain> aggregation when the direct RSS endpoint is blocked or empty.
const ID_STOCK_FALLBACK_QUERIES = [
  "saham", "IHSG", "emiten", "pasar modal", "dividen saham",
  "rekomendasi saham", "IPO", "right issue", "buyback",
  "laporan keuangan emiten",
  "BBCA saham", "BBRI saham", "BMRI saham", "TLKM saham", "GOTO saham",
  "ANTM saham", "MDKA saham", "ADRO saham", "BREN saham", "AMMN saham",
];

function idNewsSource(
  id: string,
  name: string,
  siteDomain: string,
  directUrls: string[],
  priority: number,
  category = "stock_market",
): NewsSourceCfg {
  return {
    id,
    name,
    type: "special_source",
    url: directUrls[0],
    fallbackUrls: directUrls.slice(1),
    priority,
    category,
    enabled: true,
    special: {
      siteDomain,
      directUrls,
      fallbackPriority: Math.max(2, priority - 1),
      fallbackQueries: ID_STOCK_FALLBACK_QUERIES,
    },
  };
}

export const NEWS_SOURCES: NewsSourceCfg[] = [
  {
    id: "kontan",
    name: "Kontan",
    type: "special_source",
    // Direct RSS (often CloudFront-blocked). Special handler will fall back to Google News site queries.
    url: "https://www.kontan.co.id/feed",
    fallbackUrls: ["https://investasi.kontan.co.id/"],
    priority: 3,
    category: "stock_market",
    enabled: true,
    special: {
      siteDomain: "kontan.co.id",
      directUrls: ["https://www.kontan.co.id/feed", "https://investasi.kontan.co.id/"],
      fallbackPriority: 2,
      fallbackQueries: [
        "saham", "IHSG", "emiten", "pasar modal", "dividen saham",
        "rekomendasi saham", "IPO", "right issue", "buyback",
        "laporan keuangan emiten",
        "BBCA saham", "BBRI saham", "BMRI saham", "TLKM saham", "GOTO saham",
        "ANTM saham", "MDKA saham", "ADRO saham", "BREN saham", "AMMN saham",
      ],
    },
  },
  {
    id: "cnbc_market",
    name: "CNBC Indonesia Market",
    type: "rss",
    url: "https://www.cnbcindonesia.com/market/rss",
    fallbackUrls: ["https://www.cnbcindonesia.com/rss"],
    priority: 2,
    category: "market",
    enabled: true,
  },
  {
    id: "antara",
    name: "ANTARA News",
    type: "rss",
    url: "https://www.antaranews.com/rss/ekonomi.xml",
    fallbackUrls: ["https://www.antaranews.com/rss"],
    priority: 3,
    category: "macro_economy",
    enabled: true,
  },
  {
    id: "investor_id",
    name: "Investor.id",
    type: "special_source",
    url: "https://investor.id/market",
    fallbackUrls: ["https://investor.id/rss", "https://investor.id/market/rss", "https://investor.id/feed"],
    priority: 3,
    category: "investment",
    enabled: true,
    special: {
      siteDomain: "investor.id",
      directUrls: [
        "https://investor.id/rss",
        "https://investor.id/market/rss",
        "https://investor.id/feed",
        "https://investor.id/market",
      ],
      fallbackPriority: 2,
      fallbackQueries: [
        "saham", "IHSG", "emiten", "pasar modal", "dividen saham",
        "rekomendasi saham", "IPO", "right issue", "buyback",
        "laporan keuangan emiten",
        "BBCA saham", "BBRI saham", "BMRI saham", "TLKM saham", "GOTO saham",
        "ANTM saham", "MDKA saham", "ADRO saham", "BREN saham", "AMMN saham",
      ],
    },
  },
  {
    id: "google_news",
    name: "Google News",
    type: "rss",
    url: "https://news.google.com/rss/search?q=IHSG%20OR%20saham%20OR%20emiten&hl=id&gl=ID&ceid=ID:id",
    priority: 5,
    category: "aggregator",
    enabled: true,
  },
];

// IDX tickers worth recognising in headlines (most-traded blue chips + popular tickers)
export const IDX_TICKERS = [
  "BBCA","BBRI","BMRI","BBNI","TLKM","ASII","UNVR","ICBP","INDF","GOTO",
  "BREN","AMMN","ANTM","MDKA","ADRO","ITMG","PTBA","PGAS","BRIS","ARTO",
  "EXCL","ISAT","CPIN","JPFA","KLBF","MAPI","ACES","ERAA","MEDC","TPIA",
  "UNTR","HRUM","INCO","SMGR","INTP","WIKA","WSKT","PTPP","JSMR","KAEF",
  "SIDO","HMSP","GGRM","AKRA","BUKA","EMTK","TOWR","TBIG","MNCN","SCMA",
] as const;

// Filter keywords to keep only stock/market relevant news.
export const STOCK_KEYWORDS = [
  "saham","ihsg","emiten","bei","bursa efek","investor","pasar modal",
  "dividen","ipo","right issue","rights issue","buyback","akuisisi","merger",
  "laba bersih","pendapatan","laporan keuangan","target harga","rekomendasi",
  "analis","rupiah","bi rate","inflasi","suku bunga","the fed","komoditas",
  "minyak","batu bara","emas","nikel","obligasi","reksadana","kripto","valas",
];

// Sector mapping (rule-based)
export const SECTOR_MAP: Record<string, string[]> = {
  Banking: ["BBCA","BBRI","BMRI","BBNI","BRIS","ARTO","bank","perbankan","kredit","nim","casa"],
  Technology: ["GOTO","BUKA","EMTK","teknologi","startup","digital"],
  Energy: ["MEDC","PGAS","AKRA","minyak","gas","energi"],
  Coal: ["ADRO","ITMG","PTBA","HRUM","batu bara","batubara","coal"],
  Nickel: ["ANTM","MDKA","INCO","nikel","nickel"],
  Consumer: ["UNVR","ICBP","INDF","HMSP","GGRM","SIDO","CPIN","JPFA","consumer","konsumen"],
  Retail: ["MAPI","ACES","ERAA","ramayana","retail","ritel"],
  Telco: ["TLKM","EXCL","ISAT","TOWR","TBIG","telekomunikasi","telco"],
  Healthcare: ["KLBF","KAEF","SIDO","kesehatan","farmasi"],
  Property: ["BSDE","CTRA","PWON","property","properti"],
  Infrastructure: ["JSMR","WIKA","WSKT","PTPP","SMGR","INTP","infrastruktur","konstruksi","semen"],
  Mining: ["ANTM","MDKA","INCO","HRUM","BREN","AMMN","tambang","mining"],
};

export const POSITIVE_LEXICON = [
  "naik","menguat","melonjak","melesat","positif","untung","cuan","tumbuh",
  "ekspansi","akuisisi","kontrak","kerjasama","dividen","buyback","rekor",
  "laba","optimis","bullish","rekomendasi beli","target harga naik","beli",
  "ipo","right issue","mengalahkan","melampaui","strong","gain","upgrade",
];
export const NEGATIVE_LEXICON = [
  "turun","melemah","anjlok","jatuh","negatif","rugi","loss","koreksi",
  "merosot","tertekan","bearish","jual","downgrade","gagal bayar","default",
  "utang","pailit","suspensi","delisting","auditor","fraud","penyelidikan",
  "investigasi","kebakaran","mogok","phk","layoff","menurun","resesi","inflasi tinggi",
];

export const HIGH_IMPACT_TERMS: { re: RegExp; weight: number; label: string }[] = [
  { re: /\b(laba bersih|laporan keuangan|kinerja|q[1-4])\b/i, weight: 28, label: "earnings" },
  { re: /\b(merger|akuisisi|takeover|caplok)\b/i, weight: 30, label: "M&A" },
  { re: /\b(ipo|right ?issue|buyback|stock split)\b/i, weight: 24, label: "corporate-action" },
  { re: /\b(suspensi|delisting|gagal bayar|pailit|default)\b/i, weight: 32, label: "distress" },
  { re: /\b(dividen|cum date|ex date)\b/i, weight: 18, label: "dividend" },
  { re: /\b(bi rate|the fed|fomc|inflasi|gdp|cpi)\b/i, weight: 16, label: "macro" },
  { re: /\b(rekomendasi|target harga|upgrade|downgrade)\b/i, weight: 14, label: "analyst" },
  { re: /\b(kontrak baru|proyek|tender)\b/i, weight: 12, label: "contract" },
];
