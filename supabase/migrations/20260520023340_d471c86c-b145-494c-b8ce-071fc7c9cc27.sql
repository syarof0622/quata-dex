-- 1. stock_fundamentals
CREATE TABLE IF NOT EXISTS public.stock_fundamentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  company_name text,
  sector text,
  industry text,
  market_cap numeric,
  per numeric,
  pbv numeric,
  eps numeric,
  book_value_per_share numeric,
  roe numeric,
  roa numeric,
  der numeric,
  revenue numeric,
  revenue_growth_yoy numeric,
  net_profit numeric,
  net_profit_growth_yoy numeric,
  gross_margin numeric,
  net_margin numeric,
  operating_cash_flow numeric,
  free_cash_flow numeric,
  dividend_yield numeric,
  dividend_payout_ratio numeric,
  historical_per_avg numeric,
  historical_pbv_avg numeric,
  sector_per_avg numeric,
  sector_pbv_avg numeric,
  sector_roe_avg numeric,
  financial_report_date date,
  data_source text,
  data_freshness timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_sector ON public.stock_fundamentals(sector);

ALTER TABLE public.stock_fundamentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_stock_fundamentals ON public.stock_fundamentals FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_stock_fundamentals ON public.stock_fundamentals FOR ALL TO public USING (false) WITH CHECK (false);

-- 2. ai_undervalue_scores
CREATE TABLE IF NOT EXISTS public.ai_undervalue_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  valuation_score numeric NOT NULL DEFAULT 0,
  quality_score numeric NOT NULL DEFAULT 0,
  growth_score numeric NOT NULL DEFAULT 0,
  financial_health_score numeric NOT NULL DEFAULT 0,
  dividend_score numeric NOT NULL DEFAULT 0,
  sector_relative_score numeric NOT NULL DEFAULT 0,
  technical_timing_score numeric NOT NULL DEFAULT 0,
  value_trap_risk_score numeric NOT NULL DEFAULT 0,
  final_undervalue_score numeric NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'insufficient_data',
  reasoning text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_coverage numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_undervalue_scores_symbol_created
  ON public.ai_undervalue_scores(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_undervalue_scores_classification
  ON public.ai_undervalue_scores(classification);

ALTER TABLE public.ai_undervalue_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_ai_undervalue_scores ON public.ai_undervalue_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_ai_undervalue_scores ON public.ai_undervalue_scores FOR ALL TO public USING (false) WITH CHECK (false);

-- 3. Extend ai_agent_training_events
ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS fundamental_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS undervalue_score_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS valuation_classification text,
  ADD COLUMN IF NOT EXISTS value_trap_risk_score numeric,
  ADD COLUMN IF NOT EXISTS sector_comparison_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS paper_return numeric;
-- outcome_1d/1w/1m: outcome_15m/1h/eod already exist; add 1d/1w/1m for swing/value horizon
ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS outcome_1d jsonb,
  ADD COLUMN IF NOT EXISTS outcome_1w jsonb,
  ADD COLUMN IF NOT EXISTS outcome_1m jsonb;

-- 4. Extend ai_trade_agents config for undervalued mode
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS min_undervalue_score numeric NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS max_value_trap_risk numeric NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS require_fundamental_data boolean NOT NULL DEFAULT true;

-- 5. updated_at triggers (reuse generic function)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_stock_fundamentals_updated_at ON public.stock_fundamentals;
CREATE TRIGGER trg_stock_fundamentals_updated_at
  BEFORE UPDATE ON public.stock_fundamentals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ai_undervalue_scores_updated_at ON public.ai_undervalue_scores;
CREATE TRIGGER trg_ai_undervalue_scores_updated_at
  BEFORE UPDATE ON public.ai_undervalue_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();