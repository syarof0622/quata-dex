## Tujuan

Tambah **Progressive / Expert Research Mode** ke Autonomous Scanner existing — UPDATE, bukan rebuild. Semua fitur existing (Conservative/Balanced logic, risk management, paper trading, no-trade filter, autonomous scanner, trade memory, decision feed) tetap utuh. Tidak ada real-money execution.

## 1. Database Migration

Extend tabel existing (semua nullable atau default supaya backward compatible):

**`ai_trade_agents`** — kolom baru:
- `autonomous_risk_mode text default 'balanced'` (conservative | balanced | progressive | expert_research)
- `allow_watch_candidates bool default true`
- `allow_research_candidates bool default true`
- `allow_small_lot_exploration bool default true`
- `min_watch_candidate_score numeric default 60`
- `min_research_candidate_score numeric default 50`
- `progressive_max_allocation_pct numeric default 0.05`
- `expert_research_max_allocation_pct numeric default 0.02`
- `allow_premarket_planning bool default true`
- `allow_outcome_tracking_without_trade bool default true`
- `max_research_trades_per_day int default 2`

**`ai_agent_scan_candidates`** — kolom baru:
- `candidate_classification text default 'rejected'`
- `execution_eligibility text default 'blocked'`
- `blocked_reason text`
- `research_trade_allowed bool default false`
- `hypothetical_tracking_enabled bool default false`
- `scan_price numeric`
- `outcome_15m jsonb`, `outcome_1h jsonb`, `outcome_eod jsonb`
- `hypothetical_return_15m numeric`, `hypothetical_return_1h numeric`, `hypothetical_return_eod numeric`
- `risk_mode text`

**`ai_agent_decisions`** — kolom baru:
- `autonomous_risk_mode text`
- `candidate_classification text`
- `research_trade bool default false`
- `exploration_trade bool default false`

**`ai_agent_training_events`** — kolom baru:
- `candidate_classification text`
- `hypothetical_tracking jsonb`
- `missed_opportunity_score numeric`

RLS sudah ada (auth read / public deny) — tetap dipakai.

## 2. Scanner Update (`ai-autonomous-scanner.server.ts`)

Tambah logika tanpa menghapus yang ada:

- **Mode thresholds** — derive `minTradeScore`, `minWatchScore`, `minResearchScore` dari `agent.autonomous_risk_mode`:

```text
conservative:   trade>=70, watch>=65, research>=60
balanced:       trade>=70, watch>=60, research>=50
progressive:    trade>=65, watch>=55, research>=50
expert_research:trade>=60, watch>=52, research>=48
```

- **`classifyCandidate(c, agent, session)`** → klasifikasi `trade_candidate | watch_candidate | research_candidate | rejected | premarket_watch | risk_blocked | data_blocked`:
  - jika `suspended/UMA` atau `disclosure negatif high-impact` → `risk_blocked`
  - jika `dataQuality < min_data_quality_score` atau price tidak siap → `data_blocked`
  - jika `score < minResearchScore` → `rejected`
  - jika `score in [minResearchScore, minWatchScore)` → `research_candidate`
  - jika `score in [minWatchScore, minTradeScore)` → `watch_candidate`
  - jika `score >= minTradeScore` dan setup OK → `trade_candidate`
  - kalau market closed/pre-open: `trade_candidate` di-downgrade ke `premarket_watch` untuk execution, tetapi classification tetap dipertahankan dan `execution_eligibility = blocked_pre_open / blocked_market_closed`.

- `execution_eligibility` per kandidat: `eligible | blocked_pre_open | blocked_market_closed | blocked_risk | blocked_data | blocked_low_score`.

- `applyFilters` lama tetap dijalankan tapi sekarang `passedFilters = classification === "trade_candidate" && execution_eligibility === "eligible"`. Watch & research candidates **tidak lagi dimasukkan ke `rejected`** — disimpan dengan classification masing-masing.

- `runAutonomousScan` return tambahan `summary` (`trade`, `watch`, `research`, `rejected`, `blocked` counts) + classification per candidate.

- Persist `scan_price`, `candidate_classification`, `execution_eligibility`, `blocked_reason`, `risk_mode`, `research_trade_allowed`, `hypothetical_tracking_enabled` ke `ai_agent_scan_candidates`.

## 3. Agent Runner (`ai-trade-agent.functions.ts`)

- `runAgentOnce` tetap hanya feed **trade_candidate + eligible** ke `evaluateSymbol`.
- Untuk `watch_candidate` & `research_candidate` (dan trade candidate yang `blocked_pre_open`), **catat decision-style snapshot** dengan `action = "HOLD"`, `candidate_classification`, `research_trade=false`, dan `decision_status = "watch_only" | "research_only" | "premarket_plan"` ke `ai_agent_decisions` — tanpa paper order.
- **Progressive/Expert exploration trade**: jika `autonomous_risk_mode === "progressive"` dan candidate jadi `trade_candidate` tapi score di bawah Conservative threshold (65–69), tetap dibolehkan trade dengan `allocation = balance × progressive_max_allocation_pct`, `exploration_trade=true`. Untuk `expert_research` allocation ≤ 2% dan dibatasi `max_research_trades_per_day` (cek count harian dulu).
- Risk gate yang sudah ada (cash, suspended, stale data, market session, max active, max daily loss/drawdown) **tidak dikurangi** — exploration trade harus tetap lulus.

## 4. Outcome Tracking Without Trade

Tambah `backfillScanCandidateOutcomes(agentId)` di `ai-trade-agent.functions.ts` (dipanggil setelah `backfillTrainingOutcomes`):

- Ambil `ai_agent_scan_candidates` agent ini, ≤48 jam, dengan `hypothetical_tracking_enabled = true` dan outcome belum lengkap.
- Hitung umur snapshot. Untuk umur ≥15m / ≥1h / ≥360m: fetch quote dan tulis `outcome_15m`, `outcome_1h`, `outcome_eod` + `hypothetical_return_*` dari `scan_price`.
- Label `wasMissedOpportunity` (>2% return EOD untuk watch/research yang tidak ditradekan) dan derive `lesson_label`: `correct_watch_candidate | missed_trade_opportunity | correctly_rejected | bad_research_candidate | good_research_candidate | premarket_plan_valid | premarket_plan_failed`.

## 5. UI Update (`lab.tsx`)

`AutonomousScannerPanel`:

- **Risk Mode Selector** di header — 4 tombol: Conservative / Balanced / Progressive / Expert Research, panggil server fn `setAutonomousRiskMode({id, mode})`.
- **Candidate Summary** — 5 chip count: TRADE / WATCH / RESEARCH / REJECTED / BLOCKED.
- Kolom Status di tabel kandidat memakai badge berwarna:
  - `TRADE CANDIDATE` (bull), `WATCH` (amber), `RESEARCH` (slate), `REJECTED` (muted), `PRE-MARKET WATCH` (sky), `RISK BLOCKED` (rose).
- **Explainer banner** statis:
  > "Score di bawah 70 tidak otomatis ditolak. 60–69 → Watch Candidate, 50–59 → Research Candidate. Progressive/Expert mode mengizinkan eksplorasi paper trade dengan alokasi kecil."
- **Empty-state copy** kondisional:
  - jika `trade_candidate_count === 0` & watch/research > 0: "Tidak ada kandidat siap eksekusi. Namun ada N kandidat di watch/research."
  - jika market closed: "Market sedang tutup. AI membuat pre-market watchlist, bukan order."
- Tambah server fn `setAutonomousRiskMode`.

Trade Plan / Decision Feed (jika tampilkan classification): row HOLD dari watch/research snapshot otomatis muncul karena `ai_agent_decisions` dapat baris baru — UI existing yang render decisions tinggal menampilkan `candidate_classification` ketika ada.

## 6. Risk Safety (tidak berubah)

Semua larangan existing tetap berlaku dan diuji ulang setelah perubahan:
- no real-money trading
- no trading di luar market open (paper order tetap diblok saat market closed; pre-market plan hanya snapshot)
- no buy jika saldo kurang, data stale, suspended, high-impact negative disclosure
- max active positions, max daily loss, max drawdown, cooldown
- Progressive/Expert hanya melonggarkan **candidate threshold** & memperkenalkan **alokasi eksplorasi kecil** — tidak mengubah gate risk lain.

## 7. Acceptance Criteria Mapping

| # | Test |
|---|---|
| 1 | Top score 65 dengan min trade 70 → muncul sebagai `watch_candidate`, bukan rejected |
| 2 | Score 60–69 → `watch_candidate` |
| 3 | Score 50–59 → `research_candidate` |
| 4 | Market closed → classification tetap, `execution_eligibility = blocked_market_closed` |
| 5 | Market closed → pre-market watchlist tersimpan & ditampilkan |
| 6 | Progressive mode → eksplorasi paper trade dengan alokasi ≤5% |
| 7 | Expert research → bisa kumpulkan snapshot tanpa trade (`hypothetical_tracking`) |
| 8 | Saat market closed → tidak ada paper order baru |
| 9 | Semua execution tetap paper trading |
| 10 | Watch/research disimpan + outcome di-backfill |
| 11 | UI menampilkan summary lengkap, bukan hanya "0 valid" |

## Files Yang Disentuh

```text
supabase/migrations/<new>.sql           (new)
src/lib/ai-autonomous-scanner.server.ts (edit: classification, mode thresholds, persist)
src/lib/ai-trade-agent.functions.ts     (edit: feed only trade_candidate eligible,
                                          snapshot watch/research, exploration trade,
                                          backfillScanCandidateOutcomes,
                                          new setAutonomousRiskMode fn)
src/routes/_authenticated/lab.tsx       (edit: mode selector, summary chips,
                                          status badges, explainer, empty states)
```

Tidak ada file existing yang dihapus.
