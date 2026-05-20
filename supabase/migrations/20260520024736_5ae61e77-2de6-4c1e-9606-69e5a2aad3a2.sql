
-- Data quality snapshots
CREATE TABLE IF NOT EXISTS public.data_quality_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  overall_data_quality_score numeric NOT NULL DEFAULT 0,
  price_quality text NOT NULL DEFAULT 'unavailable',
  technical_quality text NOT NULL DEFAULT 'unavailable',
  news_quality text NOT NULL DEFAULT 'unavailable',
  sentiment_quality text NOT NULL DEFAULT 'unavailable',
  disclosure_quality text NOT NULL DEFAULT 'unavailable',
  fundamental_quality text NOT NULL DEFAULT 'unavailable',
  source_reliability_score numeric NOT NULL DEFAULT 0,
  decision_allowed boolean NOT NULL DEFAULT false,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_quality_snapshots_symbol_created
  ON public.data_quality_snapshots (symbol, created_at DESC);

ALTER TABLE public.data_quality_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY auth_read_data_quality_snapshots
    ON public.data_quality_snapshots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY deny_public_write_data_quality_snapshots
    ON public.data_quality_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Confidence calibration logs
CREATE TABLE IF NOT EXISTS public.ai_confidence_calibration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  symbol text NOT NULL,
  strategy text,
  raw_confidence numeric NOT NULL DEFAULT 0,
  calibrated_confidence numeric NOT NULL DEFAULT 0,
  adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  calibration_reason text,
  sample_size integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conf_cal_logs_agent_symbol_created
  ON public.ai_confidence_calibration_logs (agent_id, symbol, created_at DESC);

ALTER TABLE public.ai_confidence_calibration_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY auth_read_ai_conf_cal_logs
    ON public.ai_confidence_calibration_logs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY deny_public_write_ai_conf_cal_logs
    ON public.ai_confidence_calibration_logs FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Augment ai_agent_decisions
ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS data_quality_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS confidence_adjustments jsonb;

-- Augment training events
ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS data_quality_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS confidence_calibration_snapshot jsonb;
