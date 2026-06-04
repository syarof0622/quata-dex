// Centralized Indonesian UI labels for Quanta Terminal.
// Internal keys (variable names, API paths, DB fields, enums) stay in English.
// All user-facing text MUST come from here when added to UI.
//
// Add labels as needed; do NOT duplicate keys across categories.

export const UI_LABELS_ID = {
  // ---- Top-level navigation ----
  nav: {
    dashboard: "Dasbor",
    market: "Denyut Pasar",
    screener: "Penyaring Saham",
    watchlist: "Daftar Pantau",
    portfolio: "Portofolio",
    aiAnalyst: "Analis AI",
    aiAgent: "Agen Trading AI",
    simulationLab: "Lab Simulasi",
    expertTools: "Alat Ahli",
    news: "Berita & Sentimen",
    alerts: "Peringatan",
    systemHealth: "Kesehatan Sistem",
    settings: "Pengaturan",
    home: "Beranda",
    analyst: "Analis",
    agent: "Agen",
  },

  // ---- Common actions / buttons ----
  actions: {
    save: "Simpan",
    cancel: "Batal",
    confirm: "Konfirmasi",
    close: "Tutup",
    refresh: "Perbarui",
    refreshNow: "Perbarui Sekarang",
    retry: "Coba Lagi",
    run: "Jalankan",
    runNow: "Jalankan Sekarang",
    manualRun: "Jalankan Manual",
    manualRunNow: "Jalankan Manual Sekarang",
    runFullAudit: "Jalankan Audit Penuh",
    runSafeFixes: "Jalankan Perbaikan Aman",
    viewAuditHistory: "Lihat Riwayat Audit",
    pause: "Jeda",
    stop: "Hentikan",
    emergency: "Darurat",
    copyCronUrl: "Salin URL Cron",
    testCronNow: "Uji Cron Sekarang",
    testNewsWorker: "Uji Worker Berita",
    testMarketSnapshot: "Uji Snapshot Pasar",
    getStarted: "Mulai Sekarang",
    viewDemo: "Lihat Demo",
    signIn: "Masuk",
    signOut: "Keluar",
    saveProfile: "Simpan Profil",
    updatePassword: "Perbarui Kata Sandi",
    add: "Tambah",
    remove: "Hapus",
    edit: "Ubah",
    viewAll: "Lihat Semua",
    seeDetail: "Lihat Detail",
  },

  // ---- Status / state labels ----
  status: {
    healthy: "Sehat",
    partial: "Sebagian",
    stale: "Usang",
    failed: "Gagal",
    unauthorized: "Tidak Terotorisasi",
    notConfigured: "Belum Dikonfigurasi",
    notRunYet: "Belum Berjalan",
    noRecentEvent: "Tidak Ada Peristiwa Terbaru",
    noNewData: "Tidak Ada Data Baru",
    unknown: "Tidak Diketahui",
    active: "Aktif",
    inactive: "Nonaktif",
    pending: "Menunggu",
    paused: "Dijeda",
    running: "Berjalan",
    idle: "Jeda",
    online: "Online",
    offline: "Offline",
    live: "Langsung",
    fresh: "Segar",
    paperOnly: "Hanya Paper Trading",
    quotaProtected: "Kuota Dilindungi",
    fallback: "Sumber Cadangan",
  },

  // ---- Trading / portfolio metrics ----
  metrics: {
    openPositions: "Posisi Terbuka",
    closedTrades: "Transaksi Selesai",
    executedOrders: "Order Tereksekusi",
    pendingOrders: "Order Tertunda",
    orderHistory: "Riwayat Order",
    tradingJournal: "Jurnal Trading",
    backtest: "Uji Balik",
    backtestResult: "Hasil Uji Balik",
    aiCoach: "Pelatih AI",
    aiInsights: "Insight AI",

    winRate: "Rasio Menang",
    profitFactor: "Faktor Profit",
    equity: "Ekuitas",
    cash: "Kas",
    availableCash: "Saldo Tersedia",
    marketValue: "Nilai Pasar",
    unrealizedPL: "Laba/Rugi Belum Terealisasi",
    realizedPL: "Laba/Rugi Terealisasi",
    totalReturn: "Imbal Hasil Total",
    exposure: "Eksposur",
    cashRatio: "Rasio Kas",
    drawdown: "Penurunan Ekuitas",
    dailyPL: "Laba/Rugi Harian",
    riskLevel: "Level Risiko",
    riskWarnings: "Peringatan Risiko",
    equityCurve: "Kurva Ekuitas",
    sectorExposure: "Eksposur Sektor",
  },

  // ---- Market & sentiment ----
  market: {
    topGainers: "Penguat Teratas",
    topLosers: "Pelemah Teratas",
    latestNews: "Berita Terbaru",
    marketHeatmap: "Peta Panas Pasar",
    stockHeatmap: "Peta Panas Saham",
    sectorRotation: "Rotasi Sektor",
    marketPulse: "Denyut Pasar",
    regime: "Rezim Pasar",
    riskOff: "Risiko Tinggi",
    riskOn: "Risiko Rendah",
    neutral: "Netral",
    advancing: "Menguat",
    declining: "Melemah",
    flat: "Mendatar",
    adRatio: "Rasio Menguat/Melemah",
    marketSentiment: "Sentimen Pasar",
    distribution: "Distribusi",
    positive: "Positif",
    negative: "Negatif",
    highImpact: "Dampak Tinggi",
    topTickers: "Emiten Teratas",
    sourceHealth: "Kesehatan Sumber Data",
    dataQuality: "Kualitas Data",
    dataFreshness: "Kesegaran Data",
  },

  // ---- Empty states / messages ----
  empty: {
    noData: "Belum ada data",
    noResults: "Tidak ada hasil",
    noActivePosition: "Tidak ada posisi aktif",
    noRecentEvent: "Tidak ada peristiwa terbaru",
    noAuditReport: "Belum ada laporan audit",
    noSourceData: "Belum ada data sumber",
    noValidatedSource: "Belum ada sumber tervalidasi",
    noRiskWarning: "Tidak ada peringatan risiko aktif",
    loadingData: "Memuat data…",
  },

  // ---- Errors ----
  errors: {
    failedToLoad: "Gagal memuat data.",
    notAvailable: "Data belum tersedia.",
    workerNotRunning: "Worker belum berjalan.",
    schedulerNotConfigured: "Scheduler belum dikonfigurasi.",
    invalidSecret: "Endpoint dapat dijangkau, tetapi ditolak karena secret tidak valid.",
    newsFetchFallback: "Terjadi kendala saat mengambil berita. Data terakhir yang valid tetap digunakan.",
    unknown: "Terjadi kesalahan tidak diketahui.",
  },

  // ---- Page hero copy (judul + subjudul) ----
  pages: {
    dashboard: {
      title: "Dasbor Pasar",
      subtitle: "Ringkasan real-time · IDX, indeks, mover, dan berita",
      eyebrow: "Pusat Kendali",
    },
    market: {
      title: "Denyut Pasar",
      subtitle: "Rotasi sektor, keluasan pasar, dan rezim risiko",
      eyebrow: "Intelijen Pasar",
    },
    screener: {
      title: "Penyaring Saham",
      subtitle: "Filter emiten berdasarkan teknikal dan fundamental",
      eyebrow: "Riset",
    },
    watchlist: {
      title: "Daftar Pantau",
      subtitle: "Emiten yang Anda ikuti secara real-time",
      eyebrow: "Pantauan",
    },
    portfolio: {
      title: "Analisis Risiko Portofolio",
      subtitle: "Ekuitas mark-to-market, rincian laba/rugi, dan analisis risiko",
      eyebrow: "Portofolio",
    },
    ai: {
      title: "Analis Trading AI",
      subtitle: "Asisten pasar berbasis harga, berita, sentimen, dan konteks paper trading",
      eyebrow: "Asisten AI",
    },
    lab: {
      title: "Lab Simulasi",
      subtitle: "Eksperimen strategi, uji balik, dan paper trading",
      eyebrow: "Riset Strategi",
    },
    expert: {
      title: "Alat Ahli",
      subtitle: "Perangkat lanjutan untuk analisis mendalam",
      eyebrow: "Ahli",
    },
    news: {
      title: "Berita & Sentimen Pasar",
      subtitle: "Aliran berita real-time dengan analisis sentimen",
      eyebrow: "Newsroom",
    },
    alerts: {
      title: "Peringatan",
      subtitle: "Notifikasi multi-faktor berbasis AI",
      eyebrow: "Sinyal",
    },
    health: {
      title: "Kesehatan Sistem",
      subtitle: "Worker, kesegaran data, kesehatan sumber, dan jejak audit",
      eyebrow: "Operasional",
    },
    settings: {
      title: "Pengaturan",
      subtitle: "Profil, preferensi, dan konfigurasi aplikasi",
      eyebrow: "Akun",
    },
  },
} as const;

// Audit helper — daftar kata Inggris yang seharusnya sudah diterjemahkan.
// Gunakan di dev untuk mendeteksi label tersisa.
export const UI_AUDIT_FORBIDDEN_EN = [
  "Dashboard", "Open Positions", "Closed Trades", "Win Rate", "Profit Factor",
  "Source Health", "System Health", "Settings", "Run Full Audit", "Execute",
  "Failed", "Unknown", "Healthy", "Partial", "Stale", "Refresh", "Last Updated",
  "No Data",
];

// Map raw status string -> Indonesian label.
export function translateStatusID(raw: string | null | undefined): string {
  const s = String(raw ?? "").toLowerCase().trim();
  const map: Record<string, string> = {
    healthy: UI_LABELS_ID.status.healthy,
    ok: UI_LABELS_ID.status.healthy,
    partial: UI_LABELS_ID.status.partial,
    stale: UI_LABELS_ID.status.stale,
    failed: UI_LABELS_ID.status.failed,
    error: UI_LABELS_ID.status.failed,
    unauthorized: UI_LABELS_ID.status.unauthorized,
    not_configured: UI_LABELS_ID.status.notConfigured,
    not_run_yet: UI_LABELS_ID.status.notRunYet,
    no_recent_event: UI_LABELS_ID.status.noRecentEvent,
    no_new_data: UI_LABELS_ID.status.noNewData,
    unknown: UI_LABELS_ID.status.unknown,
    active: UI_LABELS_ID.status.active,
    inactive: UI_LABELS_ID.status.inactive,
    pending: UI_LABELS_ID.status.pending,
    paused: UI_LABELS_ID.status.paused,
    running: UI_LABELS_ID.status.running,
    idle: UI_LABELS_ID.status.idle,
    live: UI_LABELS_ID.status.live,
    fresh: UI_LABELS_ID.status.fresh,
    online: UI_LABELS_ID.status.online,
    offline: UI_LABELS_ID.status.offline,
    quota_protected: UI_LABELS_ID.status.quotaProtected,
    fallback: UI_LABELS_ID.status.fallback,
  };
  return map[s] ?? (raw ? String(raw) : UI_LABELS_ID.status.unknown);
}
