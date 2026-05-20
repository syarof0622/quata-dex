# Plan: Full Autonomous AI Trade Agent (Paper Only)

Update existing AI Trade Agent in Simulation Lab to support a new
`symbolSelectionMode = "manual" | "autonomous"`. Manual mode keeps current
behavior. Autonomous mode lets the agent scan a universe, score candidates,
rank them, allocate paper capital, and execute paper trades — with strict
no-trade and risk guards. Nothing existing is removed.

## 1. Database (migration)

New tables:
- `ai_agent_scans` — one row per scan run (agent_id, scan_time, universe,
  symbols_scanned_count, valid_candidates_count, selected_symbols jsonb,
  top_candidates jsonb, rejected_candidates jsonb, scan_status, reasoning).
- `ai_agent_scan_candidates` — one row per candidate per scan (all 8 sub-scores,
  autonomous_score, rank, recommendation, reason, warnings, passed_filters,
  rejection_reason).

New columns:
- `ai_trade_agents`: `symbol_selection_mode`, `autonomous_universe`,
  `max_autonomous_symbols`, `max_active_positions`, `max_new_entries_per_day`,
  `min_autonomous_score`, `min_liquidity_score`, `min_data_quality_score`,
  `allow_autonomous_rotation`, `autonomous_rescan_interval_minutes`,
  `autonomous_allocation_mode`, `autonomous_mode_acknowledged`,
  `paper_trading_only` (default true).
- `ai_agent_decisions`: `selection_mode`, `autonomous_scan_id`,
  `autonomous_rank`, `autonomous_score`, `selection_reason`.
- `ai_agent_training_events`: `selection_mode`, `autonomous_scan_snapshot`,
  `candidate_scores`, `selection_outcome`.

RLS: same pattern as existing tables (hardcoded super-admin UUID for write
policies; authenticated read for scans/candidates).

## 2. Backend logic

New file `src/lib/ai-autonomous-scanner.ts`:
- `buildUniverse(mode)` — assembles candidate symbols from watchlist, trending
  news tickers, recent disclosures, and a curated IDX-liquid list.
- `scoreCandidate(agent, symbol, account, positions)` — reuses
  `evaluateSymbol` data fetchers (price, technical, news, disclosure, sentiment,
  market context) and computes 8 sub-scores + composite `autonomousScore` (0-100).
- `passesAutonomousFilters(candidate, agent)` — applies min score / liquidity
  / data-quality thresholds, freshness, suspended/UMA guard, RR ≥ 1.5.
- `allocateAutonomous(candidates, agent, account, mode)` — equal/confidence/
  risk/dynamic weighting; respects `max_position_per_symbol`, cash, min lot.

Update `src/lib/ai-trade-agent.functions.ts`:
- In `runAgentOnce(agentId)`, branch on `symbol_selection_mode`:
  - `manual` → existing path unchanged.
  - `autonomous` → run scanner → persist `ai_agent_scans` + candidates →
    pick top N → call `evaluateSymbol` per chosen symbol (now passed
    `autonomous_scan_id/rank/score/selection_reason` via context) → execute
    paper orders with existing guards → write training events with new
    `autonomous_scan_snapshot` + `candidate_scores`.
- New server fns: `listAgentScans`, `getLatestScan`,
  `acknowledgeAutonomousMode`, `updateAgentSelectionMode`.

Reuse existing market-session guard, cooldown, idempotency, freshness,
risk-pause, and daily-trade-limit logic — no duplication.

## 3. UI (src/routes/_authenticated/lab.tsx)

Inside existing AI Trade Agent card:
- **Mode toggle**: `Manual | Autonomous AI`. Switching to Autonomous the first
  time shows a confirmation dialog with the safety copy from the brief and
  sets `autonomous_mode_acknowledged = true`.
- **Manual ticker picker**: hidden/disabled when mode = autonomous.
- **Autonomous Scanner Panel** (new, shown only in autonomous mode):
  universe label, scanned count, valid candidates, selected symbols,
  last/next scan time, scan status, manual "Rescan now" button.
- **Autonomous Ranking Table**: rank, symbol, autonomous score, sub-scores
  (Data/Liquidity/Technical/Sentiment/Risk), action, reason.
- **Trade Plan cards**: add badges `AUTO SELECTED`, `AI RANK #N`,
  `PASSED RISK CHECK`, `WAITING SETUP`, `NO VALID ENTRY`. Show
  selection_mode/rank/score/selection_reason when present.
- **Decision Feed**: add Mode (Manual/Auto) + Rank + Score columns.
- Empty state when scanner finds nothing: "No valid autonomous setup found".

All existing panels (Data Readiness, Decision Feed, Trade Plan, Trade Memory,
Performance, Risk, Source Health) are kept intact; only additions.

## 4. Settings panel additions

In the agent settings form: selection mode, autonomous universe dropdown,
max autonomous symbols, max active positions, max new entries/day, min
scores (autonomous/liquidity/data-quality), allocation mode, rescan
interval, allow rotation toggle. Defaults match the brief.

## 5. Safety invariants kept

- Paper-trading only (`paper_trading_only = true`, server-enforced).
- Market session guard, freshness, suspended/UMA filter, daily loss limit,
  cooldown, idempotency, max position — all unchanged and applied to
  autonomous decisions too.
- If sample size < 20 OR autonomous win rate < 45%, scanner halves
  allocation (conservative mode).
- HOLD when no valid setup; never force entry.

## 6. Cron

Existing `/api/public/cron/ai-agent` already iterates active agents and
calls `runAgentOnce`. No new cron needed — autonomous runs piggyback on it.
Scanner respects `autonomous_rescan_interval_minutes` (skip if last scan is
fresher than interval).

## Files touched

- `supabase/migrations/<new>.sql` (new tables + columns + RLS)
- `src/lib/ai-autonomous-scanner.ts` (new)
- `src/lib/ai-trade-agent.functions.ts` (branch on mode, persist scans, new fns)
- `src/lib/ai-agent-decision-engine.ts` (accept optional autonomous context to
  stamp on decision row)
- `src/routes/_authenticated/lab.tsx` (mode toggle, scanner panel, ranking
  table, badges, decision feed columns, settings additions, confirm dialog)
- `src/integrations/supabase/types.ts` (auto-regenerated after migration)

No existing file/route/table/function is removed.
