// Static config for the news aggregator. Safe to import from anywhere.

export type NewsSourceCfg = {
  id: string;
  name: string;
  type: "rss" | "rss_or_light_scrape";
  url: string;
  fallbackUrls?: string[];
  priority: number;
  category: string;
  enabled: boolean;
};

export const NEWS_SOURCES: NewsSourceCfg[] = [
  {
    id: "kontan",
    name: "Kontan",
    type: "rss",
    url: "https://www.kontan.co.id/feed",
    priority: 1,
    category: "stock_market",
    enabled: true,
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
    type: "rss_or_light_scrape",
    url: "https://investor.id/rss",
    fallbackUrls: ["https://investor.id/market/rss", "https://investor.id/feed"],
    priority: 4,
    category: "investment",
    enabled: true,
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
