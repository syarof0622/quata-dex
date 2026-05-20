# Rencana Upgrade Besar: 10 Modul AI

Permintaan ini sangat besar (10 modul, banyak tabel baru, integrasi lintas fitur). Saya **tidak akan** rebuild — semua bersifat additive di atas yang sudah ada. Tapi ini **mustahil** dikerjakan dalam satu turn dengan kualitas yang dapat diverifikasi. Saya pecah jadi 5 fase yang bisa di-ship per turn.

## Status sekarang (sudah ada di project)
- ✅ Modul 3 (Fundamental/Undervalued Scanner) — **sudah ter-ship** turn sebelumnya: tabel `stock_fundamentals`, `ai_undervalue_scores`, scorer, screener tab, gate decision engine.
- ✅ Sebagian Modul 4 (Autonomous Ranking) — tabel `ai_agent_scans`, `ai_agent_scan_candidates` sudah ada; scorer sebagian.
- ✅ Sebagian Modul 7 (Portfolio basics) — `paper_accounts`, `paper_positions` ada.
- ✅ Backtest table ada (Modul 8 fondasi).
- ✅ Alerts table ada (Modul 9 fondasi).
- ✅ Training events table ada (Modul 6 fondasi).

## Pembagian fase (1 fase = 1 turn)

### Fase A — Data Quality + Confidence Calibration (Modul 1 & 2)
**Paling impactful, blocking untuk modul lain.**
- Migration: `data_quality_snapshots`, `ai_confidence_calibration_logs`, kolom `raw_confidence`/`calibrated_confidence`/`confidence_adjustments`/`calibration_reason` di `ai_agent_decisions`, kolom `data_quality_snapshot` di decisions & training events.
- `src/lib/data-quality.server.ts` — compute 6 dimensi quality + reliability score.
- `src/lib/confidence-calibrator.server.ts` — kalibrasi pakai `ai_agent_performance` + `ai_agent_trade_memory`.
- Integrasi: `ai-agent-decision-engine.ts` — gate HOLD jika `decisionAllowed=false`; pakai calibratedConfidence.
- UI: `DataQualityCard.tsx`, `ConfidenceBadge.tsx` (Raw → Cal), dipasang di AI Trade Agent + Screener + Chart Detail.

### Fase B — Market Regime + Sector Rotation + Portfolio Risk (Modul 5 & 7)
- Migration: `market_regime_snapshots`, `sector_strength_snapshots`, `portfolio_risk_snapshots`.
- `market-regime.server.ts`, `sector-rotation.server.ts`, `portfolio-risk.server.ts`.
- Integrasi decision engine: position size adj + reject jika sektor over-concentrated.
- UI: MarketRegimeCard, SectorRotationCard, PortfolioRiskCard.

### Fase C — Autonomous Ranking upgrade + Post-Trade Review (Modul 4 & 6)
- Extend `ai_agent_scan_candidates` dgn fundamental/undervalue/regime fit columns.
- `ai_trade_reviews` table + lesson labels enum.
- `post-trade-reviewer.server.ts` — trigger saat posisi close (cron/hook).
- UI: "Top AI Candidates Today" panel di Lab; "Latest Trade Review" + "Lessons Learned" di Simulation Lab.

### Fase D — Backtest/Forward Test + Alert Intelligence (Modul 8 & 9)
- Extend `backtests` table (regime, sector, strategy_version columns).
- `ai_alerts_definitions` (extend `alerts.rule_json` dgn 15 alert types).
- Backtest panel: strategy comparison, forward-test drift.
- Alert builder UI multi-factor.

### Fase E — Demo/Onboarding Mode (Modul 10)
- `demo_mode` flag di profiles / localStorage.
- Onboarding tour (`OnboardingDialog.tsx` + step-by-step).
- Default watchlist seeder.
- "DEMO DATA" / "REAL DATA" / "PARTIAL DATA" badges global.
- Empty states informatif untuk semua panel kosong.

## Prinsip dipegang setiap fase
- ✅ Additive only — no drop/rename. `IF NOT EXISTS` di semua migration.
- ✅ NO_API_MODE compatible — semua compute pakai data DB / Yahoo public yang sudah ada.
- ✅ Fail-safe — "Insufficient Data" badge, AI default HOLD.
- ✅ Paper trading only, no broker.
- ✅ RLS pakai pola existing (hardcoded UUID per security memory).
- ✅ Tidak menghapus fitur existing.

## Status

- ✅ Fase A — Data Quality + Confidence Calibration (ter-ship)
- ✅ Fase B — Market Regime + Sector Rotation + Portfolio Risk (ter-ship)
- ✅ Fase C — Post-Trade Review + Lessons Learned (ter-ship)
- ✅ Fase D — Backtest fields + AI Alerts Definitions (15 tipe) + Evaluator (ter-ship)
- ✅ Fase E — Demo Mode + Onboarding Dialog + Default Watchlist Seed (ter-ship)
