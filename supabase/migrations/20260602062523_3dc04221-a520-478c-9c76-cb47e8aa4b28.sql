-- 1) Extend stock_fundamentals with status/freshness/missing/source metadata
ALTER TABLE public.stock_fundamentals
  ADD COLUMN IF NOT EXISTS price_last numeric,
  ADD COLUMN IF NOT EXISTS volume numeric,
  ADD COLUMN IF NOT EXISTS average_volume numeric,
  ADD COLUMN IF NOT EXISTS reporting_period text,
  ADD COLUMN IF NOT EXISTS source_primary text,
  ADD COLUMN IF NOT EXISTS source_payload_id text,
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_confidence numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text,
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS freshness_status text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS last_market_fetch_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fundamental_fetch_at timestamptz,
  ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_notes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IDR';

CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_data_status
  ON public.stock_fundamentals (data_status);
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_freshness_status
  ON public.stock_fundamentals (freshness_status);
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_updated_at
  ON public.stock_fundamentals (updated_at DESC);

-- 2) Extend fundamental_source_logs with richer audit fields
ALTER TABLE public.fundamental_source_logs
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS fetch_status text,
  ADD COLUMN IF NOT EXISTS available_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_fsl_type_time
  ON public.fundamental_source_logs (source_type, attempt_time DESC);

-- 3) New fundamental_news_links table
CREATE TABLE IF NOT EXISTS public.fundamental_news_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  news_article_id uuid,
  disclosure_id uuid,
  link_type text NOT NULL,
  relevance_score numeric NOT NULL DEFAULT 0,
  validation_effect text NOT NULL DEFAULT 'no_direct_effect',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnl_symbol_created
  ON public.fundamental_news_links (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fnl_link_type
  ON public.fundamental_news_links (link_type);
CREATE INDEX IF NOT EXISTS idx_fnl_news_article
  ON public.fundamental_news_links (news_article_id);

GRANT SELECT ON public.fundamental_news_links TO authenticated;
GRANT ALL ON public.fundamental_news_links TO service_role;

ALTER TABLE public.fundamental_news_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_fundamental_news_links
  ON public.fundamental_news_links
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY deny_public_write_fundamental_news_links
  ON public.fundamental_news_links
  FOR ALL TO public
  USING (false) WITH CHECK (false);
