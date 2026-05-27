-- Update 12 Patch 1-6: Extend fundamental tables with missing columns + indexes/uniques.
-- Additive only; preserves all existing rows.

-- ============================================================
-- fundamental_snapshots: add company_name, sector, missing cashflows, data_quality
-- ============================================================
ALTER TABLE public.fundamental_snapshots
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS investing_cashflow numeric,
  ADD COLUMN IF NOT EXISTS financing_cashflow numeric,
  ADD COLUMN IF NOT EXISTS data_quality text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fundamental_snapshots_symbol_year_quarter_source_uq'
  ) THEN
    ALTER TABLE public.fundamental_snapshots
      ADD CONSTRAINT fundamental_snapshots_symbol_year_quarter_source_uq
      UNIQUE (symbol, fiscal_year, fiscal_quarter, source);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS fundamental_snapshots_symbol_idx ON public.fundamental_snapshots (symbol);
CREATE INDEX IF NOT EXISTS fundamental_snapshots_report_date_idx ON public.fundamental_snapshots (report_date DESC);

-- ============================================================
-- valuation_metrics: add sector, source_url, growth/dividend/cashflow extras, raw_payload, calculation_method
-- ============================================================
ALTER TABLE public.valuation_metrics
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS shares_outstanding numeric,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS dividend_per_share numeric,
  ADD COLUMN IF NOT EXISTS equity_growth_yoy numeric,
  ADD COLUMN IF NOT EXISTS book_value_growth_yoy_v2 numeric,
  ADD COLUMN IF NOT EXISTS operating_cashflow_margin numeric,
  ADD COLUMN IF NOT EXISTS dividend_consistency_score numeric,
  ADD COLUMN IF NOT EXISTS calculation_method text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valuation_metrics_symbol_asof_source_uq'
  ) THEN
    ALTER TABLE public.valuation_metrics
      ADD CONSTRAINT valuation_metrics_symbol_asof_source_uq
      UNIQUE (symbol, as_of, source);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS valuation_metrics_symbol_idx ON public.valuation_metrics (symbol);
CREATE INDEX IF NOT EXISTS valuation_metrics_sector_idx ON public.valuation_metrics (sector);
CREATE INDEX IF NOT EXISTS valuation_metrics_as_of_idx ON public.valuation_metrics (as_of DESC);

-- ============================================================
-- sector_fundamental_benchmarks: add avg_* + median_net_income_growth_yoy + included/excluded symbols
-- ============================================================
ALTER TABLE public.sector_fundamental_benchmarks
  ADD COLUMN IF NOT EXISTS avg_per numeric,
  ADD COLUMN IF NOT EXISTS avg_pbv numeric,
  ADD COLUMN IF NOT EXISTS avg_roe numeric,
  ADD COLUMN IF NOT EXISTS avg_der numeric,
  ADD COLUMN IF NOT EXISTS median_net_income_growth_yoy numeric,
  ADD COLUMN IF NOT EXISTS included_symbols text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_symbols text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS sector_benchmarks_sector_idx ON public.sector_fundamental_benchmarks (sector);
CREATE INDEX IF NOT EXISTS sector_benchmarks_as_of_idx ON public.sector_fundamental_benchmarks (as_of DESC);

-- ============================================================
-- fundamental_quality_scores: add source_score, blocking_reasons, freshness metadata
-- ============================================================
ALTER TABLE public.fundamental_quality_scores
  ADD COLUMN IF NOT EXISTS source_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocking_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_report_period text,
  ADD COLUMN IF NOT EXISTS latest_report_date timestamptz,
  ADD COLUMN IF NOT EXISTS days_since_report integer,
  ADD COLUMN IF NOT EXISTS fundamental_freshness text NOT NULL DEFAULT 'unavailable';

CREATE INDEX IF NOT EXISTS fundamental_quality_symbol_idx ON public.fundamental_quality_scores (symbol);
CREATE INDEX IF NOT EXISTS fundamental_quality_as_of_idx ON public.fundamental_quality_scores (as_of DESC);

-- ============================================================
-- fundamental_signal_snapshots: add explicit metric columns + sector context + source url
-- ============================================================
ALTER TABLE public.fundamental_signal_snapshots
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS valuation_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS negative_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_data_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS per numeric,
  ADD COLUMN IF NOT EXISTS pbv numeric,
  ADD COLUMN IF NOT EXISTS roe numeric,
  ADD COLUMN IF NOT EXISTS der numeric,
  ADD COLUMN IF NOT EXISTS dividend_yield numeric,
  ADD COLUMN IF NOT EXISTS sector_median_per numeric,
  ADD COLUMN IF NOT EXISTS sector_median_pbv numeric,
  ADD COLUMN IF NOT EXISTS sector_median_roe numeric,
  ADD COLUMN IF NOT EXISTS sector_median_der numeric,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS fundamental_signal_symbol_idx ON public.fundamental_signal_snapshots (symbol);
CREATE INDEX IF NOT EXISTS fundamental_signal_as_of_idx ON public.fundamental_signal_snapshots (as_of DESC);
CREATE INDEX IF NOT EXISTS fundamental_signal_label_idx ON public.fundamental_signal_snapshots (final_fundamental_label);
CREATE INDEX IF NOT EXISTS fundamental_signal_confidence_idx ON public.fundamental_signal_snapshots (confidence DESC);

-- ============================================================
-- Backfill GRANTs in case the new columns need them (defensive — tables already had RLS).
-- ============================================================
GRANT SELECT ON public.fundamental_snapshots TO authenticated;
GRANT SELECT ON public.valuation_metrics TO authenticated;
GRANT SELECT ON public.sector_fundamental_benchmarks TO authenticated;
GRANT SELECT ON public.fundamental_quality_scores TO authenticated;
GRANT SELECT ON public.fundamental_signal_snapshots TO authenticated;
GRANT ALL ON public.fundamental_snapshots TO service_role;
GRANT ALL ON public.valuation_metrics TO service_role;
GRANT ALL ON public.sector_fundamental_benchmarks TO service_role;
GRANT ALL ON public.fundamental_quality_scores TO service_role;
GRANT ALL ON public.fundamental_signal_snapshots TO service_role;
