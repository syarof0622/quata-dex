
# AI Learning Engine Upgrade — Quanta Terminal

Tujuan: ubah AI dari "baca data → putuskan" menjadi "baca → putuskan → eksekusi paper → amati hasil → label → belajar → kalibrasi". Tetap **Paper Trading Only**, tidak menghapus data lama, tidak memalsukan data, semua UI Bahasa Indonesia.

Fokus implementasi: **Fase 2 (Trade Memory + Calibration)** dan **Fase 3 (Strategy Performance Learning)**. Fase 4 (export dataset) dibuat sebagai endpoint admin saja. Fase 5 (ML adaptif) di luar lingkup.

---

## 1. Migrasi Database (1 migration)

**Perluas tabel yang sudah ada (tambah kolom nullable, aman terhadap data lama):**
- `ai_agent_decisions` — tambah: `decision_type`, `entry_engine`, `exit_engine`, `agent_version`, `market_session`, `market_regime`, `reference_price`, `technical_score`, `fundamental_score`, `news_score`, `sentiment_score`, `disclosure_score`, `liquidity_score`, `volatility_score`, `risk_reward_score`, `raw_confidence`, `calibrated_confidence`, `risk_level`, `allocation_mode`, `position_weight_pct`, `target_allocation_value`, `calculated_lot`, `take_profit_2`, `trailing_stop_rule`, `invalidation_level`, `risk_reward_ratio`, `max_holding_days`, `min_holding_until`, `time_stop_at`, `source_freshness jsonb`, `source_confidence jsonb`, `raw_payload jsonb`. (`blocking_factors/allowing_factors/final_decision_score/scanner_score/data_confidence_score/calibration_confidence_score/execution_confidence_score/strategy_mode/outcome/calibration_state/required_action` sudah ada dari migrasi sebelumnya.)
- `paper_orders` — tambah: `ai_decision_id uuid`, `strategy_mode text`, `agent_mode text`, `entry_engine text`, `decision_score numeric`, `risk_reward_ratio numeric`, `source_confidence jsonb`.
- `paper_positions` — tambah: `ai_decision_id`, `entry_decision_id`, `strategy_mode`, `agent_mode`, `entry_engine`, `exit_engine`, `planned_stop_loss`, `planned_take_profit_1`, `planned_take_profit_2`, `planned_time_stop_at`, `planned_max_holding_days`, `current_trade_state text`.
- **Tabel `closed_trades` saat ini tidak ada** → buat tabel baru `closed_trades` (atau perluas `trade_journal` bila lebih cocok). Plan: buat tabel baru `closed_trades` dengan semua kolom outcome/setup/mistake/MFE/MAE/r_multiple agar tidak mengganggu `trade_journal` yang sudah dipakai user.

**Tabel baru:**
1. `closed_trades` — linkage decision↔order↔position, label outcome/setup/mistake, MFE/MAE, R-multiple.
2. `trade_memory_by_symbol` — agregat per (user, symbol).
3. `strategy_performance_memory` — agregat per (user, strategy_mode, agent_mode).
4. `sector_performance_memory` — agregat per (user, sector).
5. `market_regime_performance_memory` — agregat per (user, regime, strategy_mode).
6. `learning_events` — jurnal perubahan kalibrasi.
7. `blocked_decision_outcomes` — evaluasi missed-opportunity 1j/EOD/3d/5d.
8. `watch_research_outcomes` — evaluasi WATCH/RESEARCH 1d/3d/5d.
9. `daily_learning_runs` — audit job harian.

**Semua tabel baru:** GRANT ke `authenticated`+`service_role`, RLS aktif, policy `user_id = auth.uid() OR public.is_admin(auth.uid())`. Tidak ada akses anon. Index pada `(user_id, symbol)` / `(user_id, strategy_mode)` / `created_at`.

---

## 2. Decision Context Lengkap

`src/lib/ai-agent-decision-engine.ts` & `src/lib/ai-trade-agent.functions.ts`:
- Saat menyimpan `ai_agent_decisions`, isi seluruh kolom konteks baru (scores, plan, freshness, payload mentah).
- Jika `calculated_lot === 0` → paksa downgrade ke `WATCH` dengan `blocking_factors: ['lot_zero']` (sudah sebagian — perkuat).
- Setiap keputusan BUY wajib punya SL, TP1, RR, lot>0; jika tidak → downgrade + log.

---

## 3. Linkage Decision → Order → Position → Closed Trade

`src/lib/paper.functions.ts`:
- Saat membuat order dari decision: simpan `ai_decision_id`, `strategy_mode`, dll di `paper_orders`.
- Saat order fill membuka posisi: copy `ai_decision_id` → `paper_positions.entry_decision_id` + planned SL/TP/time-stop.
- Saat posisi ditutup: buat baris di `closed_trades` dengan `entry_decision_id`, `exit_decision_id`, harga entry/exit, holding_days, realized %, planned_risk_pct, `realized_r_multiple = (exit-entry)/(entry-planned_sl)`.

---

## 4. Outcome Labeling

`src/lib/trade-outcome-labeler.server.ts` (server-only helper):
- Input: closed_trade + entry decision + price path (jika ada di `market_data_snapshots`).
- Output: `outcome_label`, `setup_label` (dari decision context), `mistake_label` (heuristik: SL terlalu ketat jika MAE ≤ 0.3R lalu SL hit; late_entry jika harga sudah +X% dari reference saat entry; dst), `result_quality` (good_win/lucky_win/good_loss/bad_loss/neutral berdasarkan validitas setup vs hasil).

---

## 5. Calibration Engine

`src/lib/learning-calibration.server.ts`:
- `calculateLearningAdjustments({ userId, symbol, strategyMode, sector, marketRegime })`:
  - Hierarki sample: symbol(≥5) → sector(≥10) → strategy(≥10) → global fallback (prior netral).
  - Aturan: win_rate<30% & n≥5 → confidence -8..-15; PF<0.7 & n≥10 → alloc ×0.5; 3 loss beruntun → cooldown; low sample → alloc ×0.3-0.5 tapi izinkan starter; PF kuat → confidence +5..+8; high-vol regime → alloc ×0.7 kecuali setup tinggi.
  - Return: `{symbolAdj, strategyAdj, sectorAdj, regimeAdj, finalConfidenceAdj, allocationMultiplier, cooldownStatus, cautionFlags[]}`.
- Diintegrasikan ke `ai-agent-decision-engine` **sebelum** final tier — adjustment hanya mengubah confidence/alloc/tier, **tidak** boleh mengaktifkan BUY tanpa SL/TP/RR/lot>0 atau melampaui cap exposure user.

---

## 6. Starter Execution Terkontrol

Sudah ada `STARTER_BUY` dari batch sebelumnya. Plan: hubungkan `allocationMultiplier` dari calibration engine ke sizing — low sample → 0.5–1.5%, setup valid → 1–3%, swing-max kuat → 3–8% (selalu ≤ user max exposure). Hard guards tetap.

---

## 7. Daily Learning Job

`src/routes/api/public/cron/daily-learning.ts`:
- Header guard: `x-cron-secret` cocok `process.env.CRON_SECRET`.
- Body: empty `{}`.
- Langkah: catat run → loop user → ambil closed_trades sejak `last_run` → label outcome → upsert keempat memory table → evaluasi `blocked_decision_outcomes` & `watch_research_outcomes` (pakai `market_data_snapshots` untuk price-after) → tulis `learning_events` → tandai cooldown/pause strategi → finalize run.
- Tidak hapus data; semua upsert.

**pg_cron (via supabase--insert setelah migrasi):**
```sql
select cron.schedule('daily-learning','30 9 * * 1-5',
$$select net.http_post(
  url:='https://project--d8169012-9e91-4d10-8dff-bfee5f2eba72.lovable.app/api/public/cron/daily-learning',
  headers:='{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body:='{}'::jsonb) as request_id;$$);
```
(09:30 UTC ≈ 16:30 WIB, setelah penutupan IDX.)

---

## 8. Server Functions Baru

Semua `requireSupabaseAuth`, scope `auth.uid()`:
- `learning.functions.ts`: `getLearningOverview`, `getSymbolMemory`, `getStrategyMemory`, `getSectorMemory`, `getRegimeMemory`, `getLearningEvents`, `getMissedOpportunities`, `getWatchResearchOutcomes`, `runDailyLearningNow` (admin), `recalcTradeMemory` (admin), `recalcStrategyMemory` (admin).
- `learning-export.functions.ts`: `exportLearningDataset` (super_admin only, anonymized).

---

## 9. UI — Pusat Pembelajaran AI

Route: `src/routes/_authenticated/learning.tsx` + komponen di `src/components/learning/`:
- Ringkasan Pembelajaran (last run, trades processed, dll).
- Tab: Per Emiten / Per Strategi / Per Sektor / Per Market Regime / Missed Opportunity / Learning Events.
- Tombol manual (admin): Jalankan Pembelajaran Sekarang, Hitung Ulang Trade/Strategy Memory.
- Semua label Bahasa Indonesia. Tambah link nav di sidebar.

`src/routes/_authenticated/health.tsx` — tambah section "Pembelajaran AI" (status job + tombol uji).

---

## 10. AI Analyst Integration

`src/lib/ai-context-summary.server.ts` — tambah ringkasan: top 5 symbol bermasalah, strategy terbaik/terburuk, jumlah cooldown aktif, learning_events terakhir. Disuntik ke prompt chat agar AI bisa menjawab "Kenapa AI lebih hati-hati di X?".

`src/lib/rag-knowledge.server.ts` (jika ada `knowledge_chunks`) — setelah daily run, insert ringkasan singkat per user sebagai chunk `source_table='learning_events'`. User-scoped (`user_id` set).

---

## 11. Multi-User Isolation & Safety

- RLS pada semua tabel baru: `user_id = auth.uid()` (admin bypass via `is_admin`).
- Hard safety guards di `paper.functions.ts` tetap: no price/SL/TP, invalid RR, lot=0, market closed, AI disabled, exposure cap, source stale critical, negative disclosure kuat, cooldown — semua tetap memblokir BUY apapun adjustment kalibrasi.
- Legacy `agent_mode='expert'` performance dipisah dari `swing_max` di `strategy_performance_memory` (unique key includes both).

---

## 12. File Changes Summary

**Migrasi:** 1 file SQL besar (tabel + grants + RLS + index + alter table).

**Server-only:**
- `src/lib/learning-calibration.server.ts` (baru)
- `src/lib/trade-outcome-labeler.server.ts` (baru)
- `src/lib/daily-learning.server.ts` (baru, dipanggil oleh route public cron)

**Server functions:**
- `src/lib/learning.functions.ts` (baru)
- `src/lib/learning-export.functions.ts` (baru, admin)
- `src/lib/paper.functions.ts` (edit — linkage)
- `src/lib/ai-trade-agent.functions.ts` (edit — simpan konteks lengkap, panggil calibration)
- `src/lib/ai-agent-decision-engine.ts` (edit — terima learning adjustments)
- `src/lib/ai-context-summary.server.ts` (edit — ringkasan learning)

**Routes:**
- `src/routes/api/public/cron/daily-learning.ts` (baru)
- `src/routes/_authenticated/learning.tsx` (baru)
- `src/routes/_authenticated/health.tsx` (edit)

**Komponen:** `src/components/learning/*` (baru — 6 panel).

**pg_cron schedule:** via `supabase--insert` setelah migrasi disetujui.

---

## Out of Scope (sesuai instruksi)
- Tidak ada training ML otomatis.
- Tidak ada broker / real money.
- Tidak menghapus `trade_journal` atau histori paper trade.
- Tidak menyatukan loss legacy expert dengan baseline swing_max.
- Tidak men-seed data palsu (semua memory table mulai kosong dan diisi job harian / recalc).

---

## Urutan Eksekusi
1. **Approve plan ini.**
2. Jalankan migrasi (Anda approve di dialog migration).
3. Setelah types regen → edit server fn + UI + cron route (parallel batch).
4. Insert jadwal pg_cron.
5. Verifikasi: trigger `runDailyLearningNow` dari UI admin → cek `daily_learning_runs` & `learning_events`.

Setelah Anda menyetujui plan, saya mulai dengan migrasi database.
