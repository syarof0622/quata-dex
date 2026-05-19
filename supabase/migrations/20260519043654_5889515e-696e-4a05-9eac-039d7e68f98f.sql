
ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS real_market_data jsonb,
  ADD COLUMN IF NOT EXISTS real_technical_data jsonb,
  ADD COLUMN IF NOT EXISTS real_news_data jsonb,
  ADD COLUMN IF NOT EXISTS real_disclosure_data jsonb,
  ADD COLUMN IF NOT EXISTS real_market_context jsonb,
  ADD COLUMN IF NOT EXISTS ai_decision jsonb,
  ADD COLUMN IF NOT EXISTS paper_execution jsonb,
  ADD COLUMN IF NOT EXISTS outcome_15m jsonb,
  ADD COLUMN IF NOT EXISTS outcome_1h jsonb,
  ADD COLUMN IF NOT EXISTS outcome_eod jsonb,
  ADD COLUMN IF NOT EXISTS final_outcome jsonb,
  ADD COLUMN IF NOT EXISTS paper_pnl_percent numeric,
  ADD COLUMN IF NOT EXISTS strategy_version text,
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz;

ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS raw_confidence numeric,
  ADD COLUMN IF NOT EXISTS calibrated_confidence numeric,
  ADD COLUMN IF NOT EXISTS calibration_reason text,
  ADD COLUMN IF NOT EXISTS data_freshness_seconds integer,
  ADD COLUMN IF NOT EXISTS data_source text;

ALTER TABLE public.paper_orders
  ADD COLUMN IF NOT EXISTS slippage_pct numeric,
  ADD COLUMN IF NOT EXISTS fee numeric;

CREATE INDEX IF NOT EXISTS idx_training_events_agent_symbol_eval
  ON public.ai_agent_training_events(agent_id, symbol, evaluated_at);
CREATE INDEX IF NOT EXISTS idx_training_events_lesson
  ON public.ai_agent_training_events(lesson_label);
