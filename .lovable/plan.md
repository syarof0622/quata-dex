# AI Trade Agent — Aggression, Deployment & Profit Patch

Scope: paper trading only. No broker, no real money. No rebuild — surgical edits to the existing agent engine, decision pipeline, UI, and a small schema extension.

## 1. Aggression Modes (Patch 1, 2, 10, 16)

Extend `ai_trade_agents` with a single source of truth for mode tuning. Add column `aggression_mode` (`conservative | balanced | progressive | expert_paper | research_max`, default `balanced`) plus `target_exposure_pct`, `min_position_weight_pct`, and rename usage of existing `max_position_per_symbol` as max cap per mode.

Mode preset table (applied in engine, overridable in UI):

```text
mode            target_exp  min_pos  max_pos  max_active  min_conf  min_RR
conservative    0.20        0.015    0.04     5           0.75      1.5
balanced        0.40        0.030    0.07     8           0.65      1.8
progressive     0.60        0.050    0.10     12          0.55      2.0
expert_paper    0.75        0.060    0.12     15          0.50      2.2
research_max    0.85        0.070    0.15     20          0.45      2.5
```

UI: Settings page + AutonomousAgentPanel gets a mode selector + sliders for the six knobs above, plus toggles for `allow_rotation`, `allow_trailing_stop`, `allow_partial_tp`, `allow_technical_without_fundamental`, `watch_spam_dedup`. Banner: "Paper trading only — no real money."

## 2. Cash Deployment Engine (Patch 2, 3)

In `ai-trade-agent.functions.ts` decision loop:
1. Compute `equity`, `cashRatio`, `currentExposurePct`.
2. `deploymentGap = target_exposure_pct - currentExposurePct`.
3. If `deploymentGap > 0` and session valid, raise BUY priority and allow up to `min(deploymentGap, max_position_weight_pct)` per candidate.
4. Round to IDX lot via existing `sizeOrder`. If lot < min meaningful, bump to `min_position_weight_pct` when cash allows; otherwise downgrade to WATCH with reason `cash_insufficient_for_min_lot` (not generic block).
5. Surface `cashUnderDeployed` diagnostic on agent state.

## 3. Decision Hierarchy (Patch 4, 5)

Rewrite final action selector in `ai-agent-decision-engine.ts`:

```text
hardBlocks  → BLOCKED   (market closed/break, no cash, lot<1, max positions,
                         suspension, UMA high, no price, no SL, no TP,
                         daily loss / drawdown limit hit)
softWarnings → reduce confidence, do NOT block in expert_paper / research_max
passes all gates + confidence ≥ mode buy threshold → BUY
confidence between watch and buy threshold → WATCH
data insufficient / not actionable → RESEARCH
```

Remove the current bias that defaults passing candidates to WATCH.

## 4. Market-Break Dedup + Pending Queue (Patch 6, 7, 13)

- Add table `ai_agent_pending_executions` (agent_id, symbol, plan jsonb, created_at, expires_at, status). One row per symbol per session.
- In cron: when session is `lunch_break | pre_open | post_close | closed`, do NOT insert per-symbol `BLOCKED` rows. Instead upsert a single session-level decision row `MARKET_PAUSED` per agent (dedup window 10 min) and stash top candidates in `ai_agent_pending_executions` with `PENDING_REVALIDATION_AFTER_BREAK`.
- On first tick where `session.isOpen` flips true: load pending rows, revalidate price + risk + lot, execute BUY if still valid, else mark `expired`.

## 5. Profit-Oriented Exits (Patch 8, 14)

Every BUY decision must populate `stop_loss`, `take_profit`, `risk_reward_ratio`, plus a new `exit_plan` jsonb: `{ sl, tp1, tp2, trailing_activate_pct, trailing_distance_pct, partial_tp_enabled }`. Reject the candidate if RR < mode min.

Open-position manager (`position-management-engine.ts`): every tick, for each open paper position with missing SL/TP, synthesize from ATR (1.5× for SL, mode RR for TP) and persist. Compute `distance_to_sl_pct`, `distance_to_tp_pct`, `management_status` (`hold | trail | tp1_hit | sl_pending | exit_now`). Portfolio + AutonomousAgentPanel render these.

Risk-pause guard: pause blocks BUY/ROTATION_ENTRY only — SELL / EXIT / TP / SL always allowed.

## 6. Profit Optimization Score (Patch 9)

In scanner, after candidate scoring:

```text
executionScore = candidateScore
  + momentumBonus + sectorRotationBonus + liquidityBonus + cashDeploymentBonus
  - downsideRiskPenalty - concentrationPenalty - staleDataPenalty
```

Persist into `ai_agent_scan_candidates.execution_score` (new column). Rank executable candidates by it.

## 7. Rotation (Patch 11)

When `openPositions ≥ max_active` and a new candidate's `executionScore` exceeds weakest open position's live score by ≥ 15 and that position's unrealized loss is within `-1R`, emit `ROTATION_EXIT` then `ROTATION_ENTRY` decisions. Modes `progressive | expert_paper | research_max` only. Always log reason.

## 8. Trade Memory Feedback (Patch 12)

Extend `ai_agent_trade_memory` usage: when computing confidence, multiply by symbol/sector/strategy win-rate factor (clamped 0.7–1.15). If `sample_size < 10`, attach `low_sample_size` warning but still apply a damped factor (0.9–1.05).

## 9. "Why Profit Is Low" Diagnostic (Patch 15)

New server fn `getProfitDiagnostics(agentId)` returns checks + recommended fixes (cash too high, positions too small, watch spam, market break, slot saturated, RR too tight, stale data, etc.). Renders in AutonomousAgentPanel as a new card.

## 10. Acceptance Verification

After implementation: run `bunx tsc --noEmit`, trigger one manual cron tick during open session via existing "Manual run" button, confirm decisions are BUY (not WATCH spam), one `MARKET_PAUSED` row during break instead of per-minute blocks, every BUY has SL/TP/RR, Expert Paper visibly deploys more cash than Conservative.

---

## Files touched (estimate)

- `supabase/migrations/<new>.sql` — add columns + pending table
- `src/lib/ai-trade-agent.functions.ts` — deployment loop, rotation, pending queue
- `src/lib/ai-agent-decision-engine.ts` — new decision hierarchy, soft/hard split
- `src/lib/ai-autonomous-scanner.server.ts` — execution score
- `src/lib/position-management-engine.ts` — SL/TP synth + distances
- `src/routes/api/public/cron/ai-agent.ts` — break dedup + resume hook
- `src/lib/autonomous-status.functions.ts` — profit diagnostics fn
- `src/components/AutonomousAgentPanel.tsx` — mode selector, diagnostics card, exit-plan display
- `src/routes/_authenticated/portfolio.tsx` — SL/TP/trailing columns
- `src/routes/_authenticated/settings.tsx` — full mode config UI

## Out of scope (explicit)

- No broker integration. No real-money path. No removal of existing features. No new auth. No schema deletions.
