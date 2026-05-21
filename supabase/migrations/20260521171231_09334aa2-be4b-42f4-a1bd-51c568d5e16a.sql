-- Add Progressive / Expert Research Mode fields
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS autonomous_risk_mode text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS allow_watch_candidates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_research_candidates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_small_lot_exploration boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_watch_candidate_score numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS min_research_candidate_score numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS progressive_max_allocation_pct numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS expert_research_max_allocation_pct numeric NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS allow_premarket_planning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_outcome_tracking_without_trade boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_research_trades_per_day integer NOT NULL DEFAULT 2;

ALTER TABLE public.ai_agent_scan_candidates
  ADD COLUMN IF NOT EXISTS candidate_classification text NOT NULL DEFAULT 'rejected',
  ADD COLUMN IF NOT EXISTS execution_eligibility text NOT NULL DEFAULT 'blocked',
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS research_trade_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hypothetical_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scan_price numeric,
  ADD COLUMN IF NOT EXISTS outcome_15m jsonb,
  ADD COLUMN IF NOT EXISTS outcome_1h jsonb,
  ADD COLUMN IF NOT EXISTS outcome_eod jsonb,
  ADD COLUMN IF NOT EXISTS hypothetical_return_15m numeric,
  ADD COLUMN IF NOT EXISTS hypothetical_return_1h numeric,
  ADD COLUMN IF NOT EXISTS hypothetical_return_eod numeric,
  ADD COLUMN IF NOT EXISTS risk_mode text;

ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS autonomous_risk_mode text,
  ADD COLUMN IF NOT EXISTS candidate_classification text,
  ADD COLUMN IF NOT EXISTS research_trade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exploration_trade boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS candidate_classification text,
  ADD COLUMN IF NOT EXISTS hypothetical_tracking jsonb,
  ADD COLUMN IF NOT EXISTS missed_opportunity_score numeric;

CREATE INDEX IF NOT EXISTS idx_scan_candidates_classification
  ON public.ai_agent_scan_candidates (agent_id, candidate_classification, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_candidates_tracking
  ON public.ai_agent_scan_candidates (agent_id, hypothetical_tracking_enabled, created_at DESC)
  WHERE hypothetical_tracking_enabled = true;