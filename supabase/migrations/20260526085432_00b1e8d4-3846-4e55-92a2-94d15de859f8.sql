
-- Extend stock_fundamentals with missing columns
ALTER TABLE public.stock_fundamentals
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS shares_outstanding numeric,
  ADD COLUMN IF NOT EXISTS dividend_per_share numeric,
  ADD COLUMN IF NOT EXISTS total_equity numeric,
  ADD COLUMN IF NOT EXISTS total_assets numeric,
  ADD COLUMN IF NOT EXISTS total_debt numeric,
  ADD COLUMN IF NOT EXISTS eps_growth_yoy numeric,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok';

-- Sector benchmark medians
CREATE TABLE IF NOT EXISTS public.sector_fundamental_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL UNIQUE,
  median_per numeric,
  median_pbv numeric,
  median_roe numeric,
  median_der numeric,
  median_revenue_growth numeric,
  median_profit_growth numeric,
  median_dividend_yield numeric,
  sample_size integer NOT NULL DEFAULT 0,
  benchmark_confidence text NOT NULL DEFAULT 'low',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sector_fundamental_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_sector_benchmarks"
  ON public.sector_fundamental_benchmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "deny_public_write_sector_benchmarks"
  ON public.sector_fundamental_benchmarks FOR ALL TO public
  USING (false) WITH CHECK (false);

-- Official disclosures (IDX/BEI)
CREATE TABLE IF NOT EXISTS public.official_disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  source text NOT NULL,
  disclosure_type text NOT NULL,
  title text NOT NULL,
  url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  impact_level text NOT NULL DEFAULT 'low',
  sentiment text NOT NULL DEFAULT 'neutral',
  extracted_summary text,
  risk_flag text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_official_disclosures_symbol_pub
  ON public.official_disclosures (symbol, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_disclosures_type
  ON public.official_disclosures (disclosure_type, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_official_disclosures_url
  ON public.official_disclosures (url) WHERE url IS NOT NULL;

ALTER TABLE public.official_disclosures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_official_disclosures"
  ON public.official_disclosures FOR SELECT TO authenticated USING (true);
CREATE POLICY "deny_public_write_official_disclosures"
  ON public.official_disclosures FOR ALL TO public
  USING (false) WITH CHECK (false);
