
CREATE TABLE IF NOT EXISTS public.news_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'cron',
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  total_sources integer NOT NULL DEFAULT 0,
  successful_sources integer NOT NULL DEFAULT 0,
  failed_sources integer NOT NULL DEFAULT 0,
  fallback_sources integer NOT NULL DEFAULT 0,
  quota_protected_sources integer NOT NULL DEFAULT 0,
  fetched_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  source_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  trigger_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_pipeline_runs_started_at ON public.news_pipeline_runs (started_at DESC);
GRANT SELECT ON public.news_pipeline_runs TO authenticated;
GRANT ALL ON public.news_pipeline_runs TO service_role;
ALTER TABLE public.news_pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_news_pipeline_runs ON public.news_pipeline_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_news_pipeline_runs ON public.news_pipeline_runs FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.news_source_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_name text NOT NULL,
  source_type text,
  status text NOT NULL DEFAULT 'unknown',
  last_success_at timestamptz,
  last_failed_at timestamptz,
  last_attempt_at timestamptz,
  last_message text,
  last_error text,
  http_status integer,
  fetched_count_24h integer NOT NULL DEFAULT 0,
  inserted_count_24h integer NOT NULL DEFAULT 0,
  fallback_active boolean NOT NULL DEFAULT false,
  quota_protected boolean NOT NULL DEFAULT false,
  disabled boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_source_health TO authenticated;
GRANT ALL ON public.news_source_health TO service_role;
ALTER TABLE public.news_source_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_news_source_health ON public.news_source_health FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_news_source_health ON public.news_source_health FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.news_sentiment_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_key text NOT NULL,
  sentiment_score numeric NOT NULL DEFAULT 0,
  positive_count integer NOT NULL DEFAULT 0,
  neutral_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,
  high_impact_count integer NOT NULL DEFAULT 0,
  top_bullish jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_bearish jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  article_count integer NOT NULL DEFAULT 0,
  freshness text NOT NULL DEFAULT 'unavailable',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_snapshots_window_created ON public.news_sentiment_snapshots (window_key, created_at DESC);
GRANT SELECT ON public.news_sentiment_snapshots TO authenticated;
GRANT ALL ON public.news_sentiment_snapshots TO service_role;
ALTER TABLE public.news_sentiment_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_news_sentiment_snapshots ON public.news_sentiment_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_news_sentiment_snapshots ON public.news_sentiment_snapshots FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.news_worker_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  last_news_worker_run_at timestamptz,
  last_successful_news_run_at timestamptz,
  next_expected_news_worker_run_at timestamptz,
  news_worker_status text DEFAULT 'unknown',
  last_news_worker_message text,
  news_worker_error_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_worker_state TO authenticated;
GRANT ALL ON public.news_worker_state TO service_role;
ALTER TABLE public.news_worker_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_news_worker_state ON public.news_worker_state FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_news_worker_state ON public.news_worker_state FOR ALL TO public USING (false) WITH CHECK (false);

INSERT INTO public.news_worker_state (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;
