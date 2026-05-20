## Tujuan

Menambahkan modul AI Fundamental Valuation Scanner ke aplikasi tanpa mengubah/menghapus fitur existing (AI Trade Agent, Autonomous Mode, Paper Trading, Technical Scanner, News Sentiment, Market Context, IDX Disclosure, Data Readiness, Trade Plan, Training Data, Performance Panel).

AI harus bisa membedakan tiga hal:
- Cheap stock (murah, tapi belum tentu bagus)
- Undervalued stock (murah, fundamental sehat)
- Value trap (murah, fundamental memburuk)

Mode `NO_API_MODE` tetap dipatuhi — tidak ada API berbayar baru; data fundamental ditarik dari Yahoo Finance public quoteSummary (sudah dipakai project untuk quotes) + optional manual entry. Jika data tidak cukup → `Insufficient Data`, bukan asumsi.

---

## 1. Database (1 migration)

Tabel baru `public.stock_fundamentals`:
- `symbol` (PK), `company_name`, `sector`, `industry`, `market_cap`
- Rasio: `per`, `pbv`, `eps`, `book_value_per_share`, `roe`, `roa`, `der`
- Income/cashflow: `revenue`, `revenue_growth_yoy`, `net_profit`, `net_profit_growth_yoy`, `gross_margin`, `net_margin`, `operating_cash_flow`, `free_cash_flow`
- Dividend: `dividend_yield`, `dividend_payout_ratio`
- Historis & sektor: `historical_per_avg`, `historical_pbv_avg`, `sector_per_avg`, `sector_pbv_avg`, `sector_roe_avg`
- Meta: `financial_report_date`, `data_source`, `data_freshness` (timestamptz), `raw_payload jsonb`, `created_at`, `updated_at`

Tabel baru `public.ai_undervalue_scores`:
- `symbol`, 8 skor (`valuation_score`, `quality_score`, `growth_score`, `financial_health_score`, `dividend_score`, `sector_relative_score`, `technical_timing_score`, `value_trap_risk_score`), `final_undervalue_score`
- `classification` text (strong_undervalued | undervalued | fair_value | overvalued | value_trap_risk | insufficient_data)
- `reasoning` text, `warnings jsonb`, timestamps
- Index `(symbol, created_at desc)`

Extend `ai_agent_training_events`:
- `fundamental_snapshot jsonb`
- `undervalue_score_snapshot jsonb`
- `valuation_classification text`
- `value_trap_risk_score numeric`
- `sector_comparison_snapshot jsonb`
- `outcome_1d jsonb`, `outcome_1w jsonb`, `outcome_1m jsonb`
- `paper_return numeric`

Extend `ai_trade_agents`:
- Allow `strategy_mode` value baru: `undervalued_swing`, `undervalued_accumulation`, `autonomous_undervalued` (kolom text, tidak perlu ALTER)
- Allow `autonomous_universe` value baru: `undervalued_candidates`, `quality_undervalued`, `dividend_undervalued`, `sector_discount`, `hybrid_trading_and_value`
- Tambah kolom config: `min_undervalue_score numeric default 65`, `max_value_trap_risk numeric default 40`, `require_fundamental_data boolean default true`

RLS: ikuti pola existing (`auth_read_*` SELECT untuk authenticated; deny public write). `stock_fundamentals` & `ai_undervalue_scores` read-only ke authenticated; ditulis lewat service role di server fn.

---

## 2. Backend modules

### `src/lib/fundamentals-fetcher.server.ts` (baru)
- `fetchFundamentalsFromYahoo(symbol)`: GET `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory` — endpoint publik, sudah digunakan pola yang sama oleh `market.functions.ts`.
- Mapping ke schema `stock_fundamentals`. Field yang missing → `null`.
- `upsertFundamentals(row)` via `supabaseAdmin`.
- `getFundamentals(symbol)`: baca DB; jika `data_freshness` > 7 hari → refetch.

### `src/lib/sector-benchmarks.server.ts` (baru)
- Hitung `sector_per_avg`, `sector_pbv_avg`, `sector_roe_avg` dari rata-rata `stock_fundamentals` per sektor.
- Cache ringan di memori (per request).

### `src/lib/undervalue-scorer.server.ts` (baru)
Pure function `scoreUndervalue(f: Fundamentals, tech?: TechSnapshot, news?: NewsSnapshot): UndervalueResult`:
- 8 sub-score 0–100, masing-masing dengan rule yang jelas dan toleran terhadap null (skip dimensi → bobot didistribusi).
- `valueTrapRiskScore` agresif: revenue/profit turun > 20% YoY, DER > 2, FCF negatif, sentiment news negatif dominan, downtrend murni → naik.
- `finalUndervalueScore = weighted(valuation 25%, quality 20%, financialHealth 15%, growth 10%, dividend 5%, sectorRelative 15%, technicalTiming 10%) − valueTrapRiskPenalty`.
- Klasifikasi: `≥80 strong_undervalued`, `65–79 undervalued`, `50–64 fair_value`, `<50 overvalued`, `valueTrapRisk ≥ 60 → value_trap_risk` (override), `coverage < 50% → insufficient_data`.
- Return `reasoning` (bahasa Indonesia, menyebut alasan utama) + `warnings[]`.

### `src/lib/undervalue.functions.ts` (baru, server fn)
- `getUndervalueScore({symbol})` — fetch fundamentals, score, upsert ke `ai_undervalue_scores`, return result.
- `scanUndervalueUniverse({universe, limit})` — loop universe (pakai `IDX_LQ45` + watchlist + tickers dari `ai_agent_scans` terakhir), batasi 30 simbol per panggilan, return ranked list.
- `getLatestUndervalueScores({limit, classification?})` — read.
- `listFundamentals({symbol})` — read untuk UI detail.

### Extend `src/lib/ai-autonomous-scanner.server.ts`
- Tambah branch: ketika `agent.autonomous_universe ∈ {undervalued_candidates, quality_undervalued, dividend_undervalued, sector_discount, hybrid_trading_and_value}` → universe = top symbol dari `ai_undervalue_scores` sesuai filter klasifikasi.
- Tambah dimensi skor `undervalueScore` ke kandidat output (untuk badge UI).

### Extend `src/lib/ai-agent-decision-engine.ts`
- Saat `strategyMode ∈ {undervalued_swing, undervalued_accumulation, autonomous_undervalued}`:
  - Ambil `getUndervalueScore(symbol)`.
  - Tolak BUY jika `classification ∈ {value_trap_risk, insufficient_data, overvalued}` atau `valueTrapRiskScore > agent.max_value_trap_risk` atau `finalUndervalueScore < agent.min_undervalue_score`.
  - Composite signal di-blend dengan `finalUndervalueScore` (bobot 0.4 untuk mode undervalued).
  - `selection_reason` di-set "Undervalued candidate — {classification}".
  - Snapshot fundamental & score dimasukkan ke `realMarketData.fundamentals` & ke `data_snapshot` untuk persist sebagai training data.

### Extend `runAgentOnce` di `ai-trade-agent.functions.ts`
- Setelah keputusan diambil, tulis ke `ai_agent_training_events`:
  - `fundamental_snapshot`, `undervalue_score_snapshot`, `valuation_classification`, `value_trap_risk_score`, `sector_comparison_snapshot`.

---

## 3. UI

### Tab baru di Screener (`src/routes/_authenticated/screener.tsx`)
- "Undervalued" tab pakai `scanUndervalueUniverse` + `getLatestUndervalueScores`.
- Kolom: Symbol, Classification badge, Final Score, Valuation, Quality, Growth, Financial Health, Value Trap Risk, Sector Compare, Reasoning (expandable).
- Tombol "Refresh fundamentals" per row → memicu `getUndervalueScore`.
- Filter dropdown: All / Strong / Undervalued / Fair / Overvalued / Value Trap Risk / Insufficient Data.

### Panel baru di `lab.tsx` (AI Trade Agent)
- Komponen `UndervalueIntegrationPanel` (ditampilkan jika `strategy_mode` mengandung "undervalued" atau autonomous universe mengandung "undervalued"):
  - Ringkasan: jumlah kandidat per klasifikasi.
  - Top 10 ranked undervalued candidates dari `ai_undervalue_scores` (klik → fill ke selected_symbols saat manual mode).
- Tambah pilihan `strategyMode` baru di config select.
- Tambah pilihan `autonomousUniverse` baru.
- Tambah 3 input numerik di settings agent: `min_undervalue_score`, `max_value_trap_risk`, `require_fundamental_data` toggle.
- Trade Plan card: jika `selection_reason` mulai dengan "Undervalued candidate" → tampilkan badge "UNDERVALUED PICK" + score.
- Decision Feed: tampilkan `valuation_classification`, `finalUndervalueScore`, `valueTrapRiskScore` (kalau ada di snapshot).

### Komponen kecil baru
- `src/components/UndervalueBadge.tsx`: maps classification → warna (strong = bull, undervalued = primary, fair = muted, overvalued = warning, value_trap_risk = bear, insufficient_data = muted).

---

## 4. Cron / refresh

- Reuse cron existing `/api/public/cron/ai-agent.ts`: setiap kali agent autonomous undervalued berjalan, fetch fundamentals untuk symbol universe yang stale (`data_freshness > 7 days`) — limit 5 simbol per cron tick supaya tidak rate-limit Yahoo.
- Tidak menambah cron job baru.

---

## 5. Safety & invariants (tidak berubah)

- Tetap paper-only, tidak ada real-money path.
- Market session guard tetap berlaku.
- Risk management & data-readiness check existing tetap dijalankan sebelum execute.
- Semua tabel ikut RLS pattern existing.

---

## Technical details (untuk reviewer)

- Tidak ada API berbayar baru. Yahoo `quoteSummary` adalah endpoint publik yang sama digunakan komponen quotes.
- Semua scoring deterministik di server (`undervalue-scorer.server.ts`), tidak memanggil LLM untuk klasifikasi — reproducible & cepat.
- Reasoning bahasa Indonesia, template-based, mencantumkan 3–5 fakta utama dari skor; tidak halusinasi.
- File baru server-only menggunakan suffix `.server.ts` agar tidak masuk client bundle. Server-fn baru di `.functions.ts`.
- Tidak menyentuh `routeTree.gen.ts`, `client.ts`, `types.ts` (akan regenerate otomatis setelah migration approval).

---

## Urutan implementasi

1. Approval migration (DB).
2. Setelah types regenerate, tambah `fundamentals-fetcher.server.ts`, `undervalue-scorer.server.ts`, `sector-benchmarks.server.ts`, `undervalue.functions.ts`.
3. Extend `ai-autonomous-scanner.server.ts` + `ai-agent-decision-engine.ts` + `ai-trade-agent.functions.ts`.
4. UI: tab Screener, panel Lab, komponen badge.
5. Smoke test: panggil `scanUndervalueUniverse` untuk LQ45 top 10 via invoke-server-function.

Estimasi: ~6 file baru, ~4 file diedit. Tidak ada perubahan struktur app.