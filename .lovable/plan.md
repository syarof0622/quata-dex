## Update 15 — Portfolio Intelligence + What-If Scenario Engine

This is a large, mostly additive update on top of existing Portfolio / AI Agent / AI Analyst / System Health. Nothing existing gets removed. Paper-trading-only. No broker, no order execution from What-If.

### 1. Database (single migration)

Two new tables + indexes:

- `portfolio_intelligence_snapshots` — health score, risk level, cash/invested ratio, concentration / diversification / cash drag / sector / fundamental / disclosure exposure scores.
- `position_attribution_snapshots` — per-position weight, contribution to return, contribution to risk, volatility/beta estimate, fundamental + disclosure context.
- `portfolio_scenario_results` — stores every scenario the user runs (IHSG ±%, close / reduce / add / deploy cash, custom move).

All three:
- GRANT SELECT to `authenticated`, GRANT ALL to `service_role` (no anon).
- RLS enabled. Read policy scoped to hardcoded user UUID (matches existing single-tenant pattern). All writes server-side via service role.
- Standard `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, indexes on `account_id`, `symbol`, `created_at`.

### 2. Server-side engine (`src/lib/portfolio-intelligence.server.ts`)

Pure server module, never imported by client. Functions:

- `calculatePortfolioHealth(accountId)` — 10-component scoring → score 0-100 + level (Healthy / Stable / Caution / Risky / Critical). Cash-high logic is regime-aware (defensive vs cash drag).
- `calculatePositionAttribution(accountId)` — weight, contributionToReturn = unrealizedPnl/equity, riskContribution = weight × volatility (fallback to sector risk factor with `confidence: low`).
- `calculateSectorAttribution(accountId)` — sector roll-up with risk + fundamental confidence + disclosure risk count.
- `calculateCashDrag(accountId, marketRegime)` — regime-aware status + opportunity cost estimate + recommendation.
- `generatePortfolioInsights(accountId)` — summary, top risks, top opportunities, suggested actions, monitor list, what-if highlights.
- `snapshotPortfolioIntelligence(accountId)` — persists into the two snapshot tables.

Scenario engine (`src/lib/portfolio-scenarios.server.ts`):

- `runPortfolioScenario(accountId, scenario)` dispatcher for: `IHSG_DOWN_2 / 5 / 10`, `IHSG_UP_2`, `SECTOR_DROP`, `CLOSE_POSITION`, `REDUCE_POSITION`, `ADD_POSITION`, `DEPLOY_CASH`, `CASH_TO_50`, `CUSTOM_PRICE_MOVE`.
- IHSG sims use per-position beta if available, else sector sensitivity fallback (confidence low + caveat).
- `simulateClosePosition / simulateReducePosition / simulateAddPosition / simulateDeployCash` — all return before/after equity, cash, exposure, sector exposure, risk level, pros/cons, recommendation. **All read-only — never insert paper orders.**
- Every run persists into `portfolio_scenario_results`.

### 3. Server functions (`src/lib/portfolio-intelligence.functions.ts`)

Thin `createServerFn` wrappers for the UI + AI:

- `getPortfolioIntelligence` — latest snapshot + live recompute.
- `getPositionAttribution`, `getSectorAttribution`, `getCashDragAnalysis`.
- `runScenario` (input-validated discriminated union for the 10 scenario types).
- `getScenarioHistory`.
- `getPortfolioInsights`.

All called from components via `useServerFn` + `useQuery` (never from public-route loaders).

### 4. AI integration

- Extend `src/lib/ai-app-context.server.ts` to inject portfolio health + attribution + sector + cash-drag + latest scenarios into the AI context, so AI Analyst can answer all 10 acceptance questions.
- Add a `run_portfolio_scenario` tool to `src/routes/api/chat.ts` so AI Analyst can simulate ad-hoc "what if I close KAEF" / "what if IHSG drops 5%" directly.
- Extend AI Trade Agent's pre-BUY guard (in the existing agent worker) to call `calculatePortfolioHealth` + add-position scenario; if health/concentration/sector/cash-buffer fails, block with `blockedReason`: `portfolio_risk_too_high` / `sector_concentration_risk` / `cash_buffer_required` / `scenario_risk_too_high`.

### 5. UI — Portfolio page

Extend the existing portfolio route (no rebuild). Add sections in order:

1. **Portfolio Health** card — score, risk level, summary, top positive, top warning.
2. **Equity Curve** — responsive area chart (mobile 220–260px, desktop 320–380px) with empty state.
3. **Allocation Visual** — cash vs invested bar + sector donut + position weight bars.
4. **Attribution** — top contributor, worst contributor, highest risk, largest weight, sector contribution.
5. **Scenario Analysis** — preset cards (IHSG -2/-5/-10, Close, Add, Deploy Cash).
6. **What-If Analysis** — scenario chips + controls (bottom sheet on mobile) + before/after comparison cards + chart.
7. **Open Positions** — kept from existing UI, augmented with attribution + risk badge + fundamental/disclosure context.

Reusable chart components in `src/components/portfolio/charts/`:
`PortfolioEquityCurve`, `AllocationDonut`, `SectorExposureBars`, `PositionContributionBars`, `ScenarioComparisonChart`, `CashVsInvestedBar`, `DrawdownChart`. All width:100%, responsive, mobile tooltips, elegant empty states.

What-If is **simulation only** — explicit "This is a simulation, no order is placed" note + "Open Paper Trade" CTA that just deep-links into the existing manual paper-order flow (still paper).

### 6. System Health

Add a `Portfolio Intelligence Engine` card to `src/routes/_authenticated/health.tsx` + extend `src/lib/system-health.functions.ts` and `src/lib/system-audit.server.ts` with:
- latest snapshot time
- positions analyzed
- scenario engine status (last run / errors)
- attribution status
- chart data status
- error list

Status mapped to Healthy / Partial / Stale / Error (same convention as other cards).

### 7. Mobile

- Hero compact, KPI grid 2 columns
- What-If controls in bottom sheet
- Scenario result cards stacked
- No table overflow (cards on mobile)
- Bottom nav clearance preserved

### Safety guardrails (explicit in code + UI)

- No code path in scenario engine inserts into `paper_orders` / `paper_positions`.
- `CRON_SECRET`, `SERVICE_ROLE_KEY`, etc. never read client-side.
- All scenario writes happen via service-role server functions.
- Paper-trading-only banner unchanged.

### Files to create

- `supabase/migrations/<ts>_portfolio_intelligence.sql`
- `src/lib/portfolio-intelligence.server.ts`
- `src/lib/portfolio-scenarios.server.ts`
- `src/lib/portfolio-intelligence.functions.ts`
- `src/components/portfolio/PortfolioHealthCard.tsx`
- `src/components/portfolio/AttributionSection.tsx`
- `src/components/portfolio/ScenarioPresets.tsx`
- `src/components/portfolio/WhatIfPanel.tsx`
- `src/components/portfolio/charts/{PortfolioEquityCurve,AllocationDonut,SectorExposureBars,PositionContributionBars,ScenarioComparisonChart,CashVsInvestedBar,DrawdownChart}.tsx`

### Files to edit (surgical)

- `src/routes/_authenticated/portfolio.tsx` (or current portfolio route) — add sections, keep existing.
- `src/lib/ai-app-context.server.ts` — inject intelligence + scenarios.
- `src/routes/api/chat.ts` — add `run_portfolio_scenario` tool.
- AI Trade Agent worker file — add portfolio-risk pre-BUY guard.
- `src/lib/system-health.functions.ts` + `src/routes/_authenticated/health.tsx` + `src/lib/system-audit.server.ts` — add Portfolio Intelligence Engine card.

### Out of scope

- No broker integration.
- No real-money execution.
- No removal of AI Agent / Analyst / Risk Engine / Position Management / Decision Replay / Fundamental Guard / Disclosure / Strategy Intelligence.
- No rebuild of existing portfolio code — only additive sections + lightweight integrations.

Approve to proceed and I'll start with the migration, then engine, then UI, then AI + health wiring.
