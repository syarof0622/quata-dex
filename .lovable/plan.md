# Fix AI Agent Over-Blocking — Controlled Paper Execution Patch

## Goal
Stop the calibration deadlock where the AI needs completed paper trades to calibrate, but calibration blocks new trades. Keep all safety guards. Stay paper-trading only.

## Approach
Introduce a tiered decision pipeline (`BLOCKED / WATCH / RESEARCH / STARTER_BUY / SWING_BUY / HOLD / EXIT`) and a calibration bootstrap that falls back from ticker → sector → strategy → global, allowing small starter paper orders when ticker sample is low but setup is valid.

## Files to touch

### Decision engine (core logic)
- `src/lib/ai-agent-decision-engine.ts`
  - Add `DecisionOutcome` enum and `decideOutcome()` returning one of the tiers
  - Add `calibrationState()` resolver: `no_sample | low_sample | calibrating | calibrated | degraded`
  - Replace single confidence gate with composite: `scanner / trade_quality / data_confidence / calibration_confidence / execution_confidence → final_decision_score`
  - Encode dynamic thresholds per `agent_mode` (conservative / balanced / progressive / expert / swing_max / recovery_swing_max)
  - Emit structured `blockingFactors[]`, `allowingFactors[]`, `requiredAction`
- `src/lib/agent-aggression-modes.ts` — add per-mode thresholds and starter size caps
- `src/lib/lot-sizing.ts` — return `{ lot, reason }`; downgrade STARTER_BUY → WATCH when lot=0
- `src/lib/loss-protection.server.ts` — segment perf by `strategy_mode`, do not let legacy losses freeze swing_max
- `src/lib/data-quality.ts` — treat disclosure `no_event` as valid; news stale only lowers confidence

### Execution path
- `src/lib/ai-trade-agent.functions.ts` and `src/lib/ai-autonomous-scanner.server.ts`
  - Persist all tiers (not just BLOCKED/BUY) into `ai_agent_decisions` with `decision_status`, scores, factors
  - For STARTER_BUY / SWING_BUY: create paper order via existing `paper.functions.ts` with strategy_mode tag
  - For WATCH / RESEARCH / BLOCKED: do not place order; still log reason
  - Enforce hard safety re-check before order: SL, TP, RR, exposure, cooldown, AI enabled, critical staleness, negative disclosure

### Database
- Migration adds nullable columns to `ai_agent_decisions`:
  `outcome` (text), `calibration_state` (text), `scanner_score`, `trade_quality_score`, `data_confidence_score`, `calibration_confidence_score`, `execution_confidence_score`, `final_decision_score`, `blocking_factors` (jsonb), `allowing_factors` (jsonb), `required_action` (text), `strategy_mode` (text)
  Existing rows keep working; new rows populate the fields.

### UI (Bahasa Indonesia)
- `src/components/AutonomousAgentPanel.tsx` and decision list in `src/routes/_authenticated/ai.tsx`
  - Replace single "BLOCKED" badge with tier badge: Diblokir / Pantau / Riset / Beli Starter / Beli Swing / Menahan / Keluar
  - Add "Mengapa diblokir / Mengapa diizinkan" panel showing all 6 scores, calibration state, blocking factors, allowing factors, required action
  - Surface starter explanation: "Kalibrasi ticker belum cukup. Menggunakan kalibrasi sektor/strategi dan ukuran starter."
- Locale strings in `src/lib/i18n/id.ts` (and `en.ts` parity)

## Safety guards kept
- Paper only — no broker code touched
- BUY still requires SL, TP, valid RR, lot > 0, exposure cap, no cooldown, AI enabled, no critical staleness, no strong negative disclosure
- 3-loss-in-a-row pause/size-down per strategy_mode
- Starter sizing capped: exploration 0.5–1.5%, starter 2–4%, swing 5–10%, never above user max exposure

## Out of scope
- No new scanners, no new data sources, no real-money path
- No removal of existing risk modules
- No fabricated trade history

## Acceptance
- AI emits non-BLOCKED tiers when setup partially valid
- STARTER_BUY creates a paper order with lot > 0 and full plan
- Calibration low_sample → starter with reduced size, not permanent block
- UI shows score breakdown + blocking/allowing factors in Bahasa Indonesia
- Build passes; existing decision rows still render
