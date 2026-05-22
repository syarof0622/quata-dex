
# AI Momentum Hunter / Top Gainer Capture

Update existing AI Trade Agent supaya bisa menangkap saham yang naik signifikan hari berjalan. Semua tetap Paper Trading. Tidak menghapus fitur apapun.

Karena scope-nya besar (12 modul), saya minta konfirmasi plan dulu sebelum mulai mengubah file. Setelah disetujui, eksekusi dilakukan dalam 1 batch (banyak file).

## File yang akan diubah / ditambah

**Baru**
- `src/lib/momentum-hunter.server.ts` — scoring + classification engine (helpers server-only)
- `src/lib/momentum-hunter.functions.ts` — `scanMomentumCandidates()` serverFn (untuk panel UI + scanner)

**Diubah**
- `src/lib/ai-autonomous-scanner.server.ts` — tambah universe baru, integrasi momentum score
- `src/lib/ai-trade-agent.functions.ts` — universe enum, momentum entry rule, allocation cap, action semantics (WATCH vs HOLD), training events
- `src/lib/ai-agent-decision-engine.ts` — confidence calibration: tidak auto-reject jika momentumScore tinggi
- `src/routes/_authenticated/lab.tsx` — panel "AI Momentum Hunter" + badge baru
- `supabase/migrations/<ts>_momentum_hunter.sql` — kolom baru di `ai_trade_agents` + tabel snapshot kandidat

## Detail per modul

### M1 — Market Mover Universe
Tambah enum universe: `top_gainers_today`, `high_volume_movers`, `momentum_breakout`, `hybrid_liquid_momentum`, `lq45`, `idx80`. Implementasi awal:
- `top_gainers_today` & `high_volume_movers`: derive dari `market.functions.ts` (sudah ada quote bulk) + universe `all_supported` di-rank by `changePercent` / `relativeVolume`. Tidak butuh API baru.
- `hybrid_liquid_momentum`: union dari `idx_liquid` + top 20 movers.
- Fallback aman ke `idx_liquid` jika data tidak tersedia.

### M2 — Momentum Score (`momentum-hunter.server.ts`)
Fungsi `computeMomentumScore(symbol, quote, history?, news?)` → `{ momentumScore, breakoutScore, catalystScore, liquidityScore, riskPenalty, classification, reason }`. Bobot dan threshold sesuai spec user.

### M3 — Classification
Enum: `strong_momentum_candidate | early_momentum_candidate | extended_momentum_risk | failed_momentum | watch_only`.

### M4 — Entry rule (di `ai-trade-agent.functions.ts` executor)
Gate sebelum eksekusi paper BUY: market open, fresh price/tech, liquidity ok, change≥3%, RVOL≥1.5, score≥70, risk OK, no duplicate, dst. Jika change>20% → force micro allocation + status `momentum_high_risk`.

### M5 — Allocation
Cap baru: conservative 2%, balanced 3%, progressive 5%, expert 2%. Extended momentum (>20%) selalu max 1–2%. Diterapkan sebelum `sizeOrder()`.

### M6 — SL/TP
Default SL 2–4%, TP 4–8%. Untuk extended: SL ketat 2%, TP 4%, trailing optional flag.

### M7 — No-trade rule
Centralised reason codes: `momentum_market_closed`, `momentum_price_stale`, `momentum_extended_no_support`, `momentum_low_liquidity`, `momentum_duplicate_position`, dst. Disimpan di `data_snapshot.blockReason` agar Decision Feed bisa render.

### M8 — Scanner priority
Final Autonomous Score sekarang menjumlahkan `momentumScore + catalystScore - riskPenalty`. Threshold rejection diturunkan: 60–69 → `watch`, ≥70 dgn momentum valid → `trade_candidate`. Tidak menghapus filter existing — hanya menambah bypass khusus momentum.

### M9 — Action semantics
Helper baru `resolveAction({ hasPosition, decision })`:
- belum punya posisi, tidak entry → `WATCH` / `NO_TRADE` / `BLOCKED` (bukan HOLD lagi)
- punya posisi → `HOLD`
- entry valid → `BUY`
Diterapkan di executor + UI badge.

### M10 — UI panel `AI Momentum Hunter` (`lab.tsx`)
Section baru di tab AI Trade Agent, di atas Decision Feed. Tabel kolom: Rank, Symbol, Change%, RVOL, MomentumScore, Liquidity, Catalyst, Risk, AI Action, Reason. Badge: STRONG/EARLY/WATCH/EXTENDED RISK/MOMENTUM BUY/BLOCKED RISK. Data dari `scanMomentumCandidates()` via `useQuery` (refetch 60s saat market open).

### M11 — Reasoning copy
String builder di `momentum-hunter.server.ts` menghasilkan kalimat ID seperti contoh user.

### M12 — Training data
Insert `ai_agent_training_events`:
- entry → `event_type = 'executed_momentum_trade'`
- watch/blocked → `event_type = 'momentum_watch_snapshot'`
- `lesson_label` di-set saat post-trade review (reuse pipeline existing). Outcome 15m/1h/EOD pakai infrastruktur hypothetical tracking yang sudah ada di `ai_agent_scan_candidates` (sudah ada kolomnya).

### Migration (aman: hanya ADD COLUMN IF NOT EXISTS)
```sql
ALTER TABLE ai_trade_agents
  ADD COLUMN IF NOT EXISTS momentum_hunter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS momentum_min_change_pct numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS momentum_min_rvol numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS momentum_min_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS momentum_max_allocation_pct numeric NOT NULL DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS momentum_extended_allocation_pct numeric NOT NULL DEFAULT 0.015;
```
Tidak drop, tidak hapus data.

## Yang TIDAK diubah
- Real-money flow (tetap paper only)
- Portfolio Risk, Holdings, Equity Curve, Paper Trading executor, Training Events table, Autonomous Scanner inti, Decision Feed structure
- File `client.ts`, `types.ts`, `.env` (auto-generated)

## Acceptance check setelah implementasi
Akan saya verifikasi 10 acceptance criteria user satu per satu di pesan penutup.

---

**Mohon konfirmasi**: lanjut implementasi semua modul di atas, atau ada yang ingin di-trim / di-prioritaskan dulu (misal M1–M4 + UI dulu, M12 belakangan)?
