
CREATE TABLE IF NOT EXISTS public.market_data_quality_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'unknown',
  latest_price_at timestamptz,
  symbols_checked int NOT NULL DEFAULT 0,
  symbols_with_price int NOT NULL DEFAULT 0,
  symbols_missing_price int NOT NULL DEFAULT 0,
  stale_symbols int NOT NULL DEFAULT 0,
  fresh_symbols int NOT NULL DEFAULT 0,
  market_session text,
  ihsg_value numeric,
  ihsg_updated_at timestamptz,
  data_quality_score numeric NOT NULL DEFAULT 0,
  source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings text[] NOT NULL DEFAULT '{}'::text[],
  errors text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_data_quality_snapshots TO authenticated;
GRANT ALL  ON public.market_data_quality_snapshots TO service_role;
ALTER TABLE public.market_data_quality_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_market_data_quality ON public.market_data_quality_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_market_data_quality ON public.market_data_quality_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_mdq_snapshots_created_at ON public.market_data_quality_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS public.disclosure_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'unknown',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  fetched_count int NOT NULL DEFAULT 0,
  inserted_count int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  official_count int NOT NULL DEFAULT 0,
  corporate_action_count int NOT NULL DEFAULT 0,
  regulatory_event_count int NOT NULL DEFAULT 0,
  high_impact_count int NOT NULL DEFAULT 0,
  source_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  trigger_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.disclosure_pipeline_runs TO authenticated;
GRANT ALL  ON public.disclosure_pipeline_runs TO service_role;
ALTER TABLE public.disclosure_pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_disclosure_runs ON public.disclosure_pipeline_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_disclosure_runs ON public.disclosure_pipeline_runs FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_disclosure_runs_started_at ON public.disclosure_pipeline_runs(started_at DESC);
