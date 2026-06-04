# URGENT — AI Agent Loss Protection Patch

Tujuan: hentikan overtrading & rentetan rugi di paper trading. Semua tetap **Paper Trading Only**. Tidak menyentuh broker / real money. Tidak menghapus fitur lain.

Patch dieksekusi dalam 5 fase, satu pass migrasi DB di awal, lalu kode dilapis di atasnya.

---

## Fase 1 — Schema & Defaults (1 migrasi DB)

Tabel & kolom baru di `public` (semua dengan GRANT + RLS scoped ke super-admin UUID):

- `symbol_trade_cooldowns` — `symbol`, `reason`, `loss_count`, `last_loss_at`, `cooldown_until`
- `strategy_health` — `strategy`, `trades`, `wins`, `losses`, `consec_losses`, `avg_return`, `profit_factor`, `status` (`ACTIVE`/`PAUSED_FOR_REVIEW`), `paused_reason`, `paused_at`
- `ai_agent_state` — singleton row: `mode` (`NORMAL`/`CAUTION`/`LOSS_PROTECTION_ACTIVE`/`PROTECTION_MODE`/`OBSERVATION_MODE`), `reason`, `daily_loss_amount`, `daily_loss_pct`, `consec_losses`, `trades_today`, `updated_at`
- `post_trade_reviews` — extend existing (atau buat baru jika belum ada): `mistake_category`, `trade_quality_score`, `recommended_adjustment`, `what_went_wrong`
- `ai_risk_config` — singleton row: semua limit (max_daily_loss_pct=1.0, max_consec_losses=3, max_trades_per_day=5, max_trades_per_symbol_per_day=1, max_portfolio_drawdown_pct=5, min_profit_factor=0.8, min_win_rate=35, min_trade_quality_score=75, min_rr=2.0). User-editable.

## Fase 2 — Loss-Protection Engine (server)

File baru `src/lib/loss-protection.server.ts`:

- `evaluateGlobalGuards()` — hitung dari `paper_orders` + `ai_agent_state`; return `{ allowBuy, allowSell, mode, reasons[] }`.
- `evaluateSymbolCooldown(symbol)` — baca `symbol_trade_cooldowns`; tier 1/3/10 sesi.
- `evaluateStrategyHealth(strategy)` — baca `strategy_health`; auto-pause sample≥5 & WR<30% / PF<0.7 / avgRet<-1.5% / consec≥3.
- `recordTradeOutcome(order)` — dipanggil dari cron orders saat fill SELL: update cooldown, strategy_health, agent_state, dan tulis post_trade_review.
- `calculateTradeQualityScore(candidate)` — 0-100 dengan komponen tren/MA/volume/RS/regime/vol/liq/sentiment/loss-history/cooldown/RR/data-freshness. Output: `score`, `label`, `reasonCodes[]`.

## Fase 3 — Wire Into Decision Engine

Edit `src/lib/ai-agent-decision-engine.ts` & `src/lib/ai-trade-agent.functions.ts`:

- Sebelum BUY: jalankan `evaluateGlobalGuards`, cooldown, strategy health, quality score, regime filter, min RR, min stop distance (1.2×ATR atau 2% fallback). Tolak BUY jika gagal salah satu; catat `reasonCodes`.
- Sebelum SELL: hanya boleh karena SL/TP/trailing/strategy invalidated/regime emergency/disclosure negatif/loss-rule. Tambahkan minimum holding period (30 menit intraday) kecuali pengecualian.
- Tulis `decision_replay` dengan reason yang baru (`overtrading_guard_active`, `symbol_cooldown_active`, `strategy_paused_due_to_poor_performance`, `quality_score_too_low`, `regime_risk_off`, `min_hold_not_reached`, dst).
- Post-fill hook: panggil `recordTradeOutcome`.

## Fase 4 — Cron Integration

- `src/routes/api/public/cron/ai-agent.ts`: panggil engine baru di awal tick; skip iterasi jika `mode != NORMAL/CAUTION` untuk BUY.
- `src/routes/api/public/cron/orders.ts`: setelah SELL filled (sudah hitung `realizedPnl`), panggil `recordTradeOutcome` agar cooldown/strategy_health/agent_state ter-update real-time.

## Fase 5 — UI Diagnostics

- `AutonomousAgentPanel.tsx` — tambah section **"Why the AI is losing"**: WR, PF, avg return, worst symbols, worst strategy, mistake counts, overtrading score, avg hold, regime mismatch, recommended fix. Tampilkan badge mode (NORMAL / CAUTION / LOSS_PROTECTION_ACTIVE / STRATEGY_PAUSED / OBSERVATION_MODE).
- Tab **Trade Memory** di Lab: extend tabel — Loss streak, Cooldown status, Best/Worst strategy, Recommended action; tampilkan disclaimer "Low sample size" jika trades < 10.
- Chat (`src/routes/api/chat.ts`) — saat user tanya "kenapa rugi terus", inject ringkasan dari `evaluateAccountHealth()` baru (loss-protection.server) ke prompt.

---

## Defaults yang dipasang sekarang

```
max_trades_per_day = 5
max_trades_per_symbol_per_day = 1
max_consec_losses = 3
max_daily_loss_pct = 1.0
max_portfolio_drawdown_pct = 5
min_trade_quality_score = 75 (Balanced) / 70 (Expert) / 68 (Research Max)
min_risk_reward = 2.0
min_hold_minutes = 30
strategy_kill_switch = enabled
symbol_cooldown = enabled
overtrading_guard = enabled
risk_off_filter = enabled
```

Expert Paper / Research Max tetap dijaga: loss protection **tidak bisa dimatikan**, hanya threshold quality boleh sedikit lebih rendah.

---

## Acceptance check setelah eksekusi

- BUY ditolak saat: cooldown aktif, strategy paused, quality<threshold, RR<min, mode=LOSS_PROTECTION/PROTECTION/OBSERVATION, daily/symbol cap tercapai, regime risk-off tanpa konfirmasi kuat.
- SELL hanya dengan exitReason eksplisit; tidak boleh sebelum min-hold kecuali SL/TP/emergency.
- Setiap closed trade menulis `post_trade_review` dengan `mistake_category`.
- Panel AI Agent menampilkan diagnosa + mode badge.
- Trade Memory menampilkan loss streak & cooldown.
- AI Analyst menjelaskan penyebab rugi pakai data nyata.
- Tidak ada jalur ke broker / real money — diuji dengan grep.

---

## File yang akan disentuh

Baru: `src/lib/loss-protection.server.ts`, `src/lib/trade-quality.ts`, 1 migrasi SQL.
Edit: `ai-agent-decision-engine.ts`, `ai-trade-agent.functions.ts`, `post-trade-review.functions.ts`, `routes/api/public/cron/ai-agent.ts`, `routes/api/public/cron/orders.ts`, `AutonomousAgentPanel.tsx`, `routes/_authenticated/lab.tsx` (tab Trade Memory), `routes/api/chat.ts` (context injection).

Estimasi: ~1 migrasi DB + ~900-1100 LOC baru/edit. Saya kerjakan fase per fase setelah plan ini disetujui.