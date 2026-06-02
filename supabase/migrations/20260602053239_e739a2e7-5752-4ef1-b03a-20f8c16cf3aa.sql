-- Aggression mode + cash deployment knobs for AI Trade Agent.
-- Backwards-compatible: defaults map to current "balanced" behavior.
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS aggression_mode text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS target_exposure_pct numeric,
  ADD COLUMN IF NOT EXISTS min_position_weight_pct numeric,
  ADD COLUMN IF NOT EXISTS market_break_dedup_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_profit_diagnostic jsonb;

-- Constrain to allowed modes (drop+add for idempotency).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_trade_agents_aggression_mode_check'
  ) THEN
    ALTER TABLE public.ai_trade_agents DROP CONSTRAINT ai_trade_agents_aggression_mode_check;
  END IF;
END$$;

ALTER TABLE public.ai_trade_agents
  ADD CONSTRAINT ai_trade_agents_aggression_mode_check
  CHECK (aggression_mode IN ('conservative','balanced','progressive','expert_paper','research_max'));

-- Backfill: map legacy autonomous_risk_mode -> aggression_mode where meaningful.
UPDATE public.ai_trade_agents
SET aggression_mode = CASE
  WHEN autonomous_risk_mode = 'progressive' THEN 'progressive'
  WHEN autonomous_risk_mode = 'expert_research' THEN 'expert_paper'
  WHEN autonomous_risk_mode = 'conservative' THEN 'conservative'
  ELSE 'balanced'
END
WHERE aggression_mode = 'balanced';