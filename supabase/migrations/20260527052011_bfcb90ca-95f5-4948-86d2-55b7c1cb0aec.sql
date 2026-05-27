-- ============================================================
-- PHASE A (retry): idempotent + extends existing benchmark table
-- ============================================================

-- ---------- 1. fundamental_snapshots ----------
CREATE TABLE IF NOT EXISTS public.fundamental_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  period TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER,
  report_date DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  currency TEXT NOT NULL DEFAULT 'IDR',
  revenue NUMERIC,
  gross_profit NUMERIC,
  operating_profit NUMERIC,
  net_income NUMERIC,
  eps NUMERIC,
  book_value_per_share NUMERIC,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  total_equity NUMERIC,
  total_debt NUMERIC,
  cash NUMERIC,
  operating_cashflow NUMERIC,
  capex NUMERIC,
  free_cashflow NUMERIC,
  shares_outstanding NUMERIC,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, fiscal_year, period, source)
);
CREATE INDEX IF NOT EXISTS idx_fundamental_snapshots_symbol_period ON public.fundamental_snapshots (symbol, fiscal_year DESC, fiscal_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_fundamental_snapshots_report_date ON public.fundamental_snapshots (report_date DESC);
GRANT SELECT ON public.fundamental_snapshots TO authenticated;
GRANT ALL ON public.fundamental_snapshots TO service_role;
ALTER TABLE public.fundamental_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_fundamental_snapshots ON public.fundamental_snapshots;
CREATE POLICY auth_read_fundamental_snapshots ON public.fundamental_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_fundamental_snapshots ON public.fundamental_snapshots;
CREATE POLICY deny_public_write_fundamental_snapshots ON public.fundamental_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_fundamental_snapshots_updated_at ON public.fundamental_snapshots;
CREATE TRIGGER trg_fundamental_snapshots_updated_at BEFORE UPDATE ON public.fundamental_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. valuation_metrics ----------
CREATE TABLE IF NOT EXISTS public.valuation_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  price NUMERIC,
  market_cap NUMERIC,
  per NUMERIC,
  pbv NUMERIC,
  ps NUMERIC,
  ev_ebitda NUMERIC,
  dividend_yield NUMERIC,
  roe NUMERIC,
  roa NUMERIC,
  npm NUMERIC,
  gpm NUMERIC,
  opm NUMERIC,
  der NUMERIC,
  debt_to_assets NUMERIC,
  current_ratio NUMERIC,
  quick_ratio NUMERIC,
  eps_growth_yoy NUMERIC,
  revenue_growth_yoy NUMERIC,
  net_income_growth_yoy NUMERIC,
  book_value_growth_yoy NUMERIC,
  fcf_yield NUMERIC,
  payout_ratio NUMERIC,
  source TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_valuation_metrics_symbol_as_of ON public.valuation_metrics (symbol, as_of DESC);
GRANT SELECT ON public.valuation_metrics TO authenticated;
GRANT ALL ON public.valuation_metrics TO service_role;
ALTER TABLE public.valuation_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_valuation_metrics ON public.valuation_metrics;
CREATE POLICY auth_read_valuation_metrics ON public.valuation_metrics FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_valuation_metrics ON public.valuation_metrics;
CREATE POLICY deny_public_write_valuation_metrics ON public.valuation_metrics FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_valuation_metrics_updated_at ON public.valuation_metrics;
CREATE TRIGGER trg_valuation_metrics_updated_at BEFORE UPDATE ON public.valuation_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. sector_fundamental_benchmarks (EXTEND existing) ----------
ALTER TABLE public.sector_fundamental_benchmarks
  ADD COLUMN IF NOT EXISTS median_eps_growth_yoy NUMERIC,
  ADD COLUMN IF NOT EXISTS median_revenue_growth_yoy NUMERIC,
  ADD COLUMN IF NOT EXISTS as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_sector_benchmarks_sector_as_of ON public.sector_fundamental_benchmarks (sector, as_of DESC);
GRANT SELECT ON public.sector_fundamental_benchmarks TO authenticated;
GRANT ALL ON public.sector_fundamental_benchmarks TO service_role;
ALTER TABLE public.sector_fundamental_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_sector_benchmarks ON public.sector_fundamental_benchmarks;
CREATE POLICY auth_read_sector_benchmarks ON public.sector_fundamental_benchmarks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_sector_benchmarks ON public.sector_fundamental_benchmarks;
CREATE POLICY deny_public_write_sector_benchmarks ON public.sector_fundamental_benchmarks FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_sector_benchmarks_updated_at ON public.sector_fundamental_benchmarks;
CREATE TRIGGER trg_sector_benchmarks_updated_at BEFORE UPDATE ON public.sector_fundamental_benchmarks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. fundamental_quality_scores ----------
CREATE TABLE IF NOT EXISTS public.fundamental_quality_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  completeness_score NUMERIC NOT NULL DEFAULT 0,
  freshness_score NUMERIC NOT NULL DEFAULT 0,
  consistency_score NUMERIC NOT NULL DEFAULT 0,
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'insufficient',
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  stale_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fundamental_quality_symbol_as_of ON public.fundamental_quality_scores (symbol, as_of DESC);
GRANT SELECT ON public.fundamental_quality_scores TO authenticated;
GRANT ALL ON public.fundamental_quality_scores TO service_role;
ALTER TABLE public.fundamental_quality_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_fundamental_quality ON public.fundamental_quality_scores;
CREATE POLICY auth_read_fundamental_quality ON public.fundamental_quality_scores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_fundamental_quality ON public.fundamental_quality_scores;
CREATE POLICY deny_public_write_fundamental_quality ON public.fundamental_quality_scores FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_fundamental_quality_updated_at ON public.fundamental_quality_scores;
CREATE TRIGGER trg_fundamental_quality_updated_at BEFORE UPDATE ON public.fundamental_quality_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. fundamental_signal_snapshots ----------
CREATE TABLE IF NOT EXISTS public.fundamental_signal_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  valuation_status TEXT NOT NULL DEFAULT 'unknown',
  undervalue_score NUMERIC NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 0,
  growth_score NUMERIC NOT NULL DEFAULT 0,
  profitability_score NUMERIC NOT NULL DEFAULT 0,
  solvency_score NUMERIC NOT NULL DEFAULT 0,
  dividend_score NUMERIC NOT NULL DEFAULT 0,
  value_trap_risk NUMERIC NOT NULL DEFAULT 0,
  value_trap_level TEXT NOT NULL DEFAULT 'unknown',
  value_trap_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_fundamental_label TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
  confidence NUMERIC NOT NULL DEFAULT 0,
  explanation TEXT,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fundamental_signal_symbol_as_of ON public.fundamental_signal_snapshots (symbol, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_fundamental_signal_label ON public.fundamental_signal_snapshots (final_fundamental_label, as_of DESC);
GRANT SELECT ON public.fundamental_signal_snapshots TO authenticated;
GRANT ALL ON public.fundamental_signal_snapshots TO service_role;
ALTER TABLE public.fundamental_signal_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_fundamental_signal ON public.fundamental_signal_snapshots;
CREATE POLICY auth_read_fundamental_signal ON public.fundamental_signal_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_fundamental_signal ON public.fundamental_signal_snapshots;
CREATE POLICY deny_public_write_fundamental_signal ON public.fundamental_signal_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_fundamental_signal_updated_at ON public.fundamental_signal_snapshots;
CREATE TRIGGER trg_fundamental_signal_updated_at BEFORE UPDATE ON public.fundamental_signal_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 6. corporate_actions ----------
CREATE TABLE IF NOT EXISTS public.corporate_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  announcement_date DATE,
  cum_date DATE,
  ex_date DATE,
  recording_date DATE,
  payment_date DATE,
  ratio TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'IDR',
  source TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'announced',
  impact_score NUMERIC NOT NULL DEFAULT 0,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol ON public.corporate_actions (symbol, announcement_date DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON public.corporate_actions (action_type, announcement_date DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ex_date ON public.corporate_actions (ex_date) WHERE ex_date IS NOT NULL;
GRANT SELECT ON public.corporate_actions TO authenticated;
GRANT ALL ON public.corporate_actions TO service_role;
ALTER TABLE public.corporate_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_corporate_actions ON public.corporate_actions;
CREATE POLICY auth_read_corporate_actions ON public.corporate_actions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_corporate_actions ON public.corporate_actions;
CREATE POLICY deny_public_write_corporate_actions ON public.corporate_actions FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_corporate_actions_updated_at ON public.corporate_actions;
CREATE TRIGGER trg_corporate_actions_updated_at BEFORE UPDATE ON public.corporate_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 7. regulatory_events ----------
CREATE TABLE IF NOT EXISTS public.regulatory_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  source_url TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  impact_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regulatory_events_symbol ON public.regulatory_events (symbol, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_events_type ON public.regulatory_events (event_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_events_active ON public.regulatory_events (symbol, status) WHERE status = 'active';
GRANT SELECT ON public.regulatory_events TO authenticated;
GRANT ALL ON public.regulatory_events TO service_role;
ALTER TABLE public.regulatory_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_regulatory_events ON public.regulatory_events;
CREATE POLICY auth_read_regulatory_events ON public.regulatory_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_regulatory_events ON public.regulatory_events;
CREATE POLICY deny_public_write_regulatory_events ON public.regulatory_events FOR ALL TO public USING (false) WITH CHECK (false);
DROP TRIGGER IF EXISTS trg_regulatory_events_updated_at ON public.regulatory_events;
CREATE TRIGGER trg_regulatory_events_updated_at BEFORE UPDATE ON public.regulatory_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 8. Extend official_disclosures ----------
ALTER TABLE public.official_disclosures
  ADD COLUMN IF NOT EXISTS directness TEXT,
  ADD COLUMN IF NOT EXISTS trading_relevance TEXT,
  ADD COLUMN IF NOT EXISTS impact_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS official_disclosure_linked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS source_priority INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS news_article_id UUID;

CREATE INDEX IF NOT EXISTS idx_official_disclosures_symbol_published
  ON public.official_disclosures (symbol, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_disclosures_cluster
  ON public.official_disclosures (duplicate_cluster_id) WHERE duplicate_cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_official_disclosures_high_impact
  ON public.official_disclosures (symbol, impact_score DESC, published_at DESC) WHERE impact_score >= 60;