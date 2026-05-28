
-- Portfolio Intelligence snapshots ---------------------------------------
CREATE TABLE public.portfolio_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  equity numeric NOT NULL DEFAULT 0,
  cash numeric NOT NULL DEFAULT 0,
  holdings_value numeric NOT NULL DEFAULT 0,
  cash_ratio numeric NOT NULL DEFAULT 0,
  invested_ratio numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  total_return_pct numeric NOT NULL DEFAULT 0,
  daily_pnl numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  portfolio_health_score numeric NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'unknown',
  concentration_score numeric NOT NULL DEFAULT 0,
  diversification_score numeric NOT NULL DEFAULT 0,
  cash_drag_score numeric NOT NULL DEFAULT 0,
  exposure_score numeric NOT NULL DEFAULT 0,
  sector_risk_score numeric NOT NULL DEFAULT 0,
  value_trap_exposure_pct numeric NOT NULL DEFAULT 0,
  insufficient_fundamental_exposure_pct numeric NOT NULL DEFAULT 0,
  disclosure_risk_exposure_pct numeric NOT NULL DEFAULT 0,
  market_regime text,
  positives jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_intelligence_snapshots TO authenticated;
GRANT ALL ON public.portfolio_intelligence_snapshots TO service_role;

ALTER TABLE public.portfolio_intelligence_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_portfolio_intel_read ON public.portfolio_intelligence_snapshots
  FOR SELECT USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY deny_public_write_portfolio_intel ON public.portfolio_intelligence_snapshots
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_pi_snap_account_created ON public.portfolio_intelligence_snapshots(account_id, created_at DESC);
CREATE INDEX idx_pi_snap_user_created ON public.portfolio_intelligence_snapshots(user_id, created_at DESC);


-- Position attribution snapshots ----------------------------------------
CREATE TABLE public.position_attribution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position_id uuid,
  symbol text NOT NULL,
  sector text,
  quantity numeric NOT NULL DEFAULT 0,
  avg_entry numeric NOT NULL DEFAULT 0,
  last_price numeric NOT NULL DEFAULT 0,
  market_value numeric NOT NULL DEFAULT 0,
  position_weight_pct numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  unrealized_pnl_pct numeric NOT NULL DEFAULT 0,
  contribution_to_return numeric NOT NULL DEFAULT 0,
  contribution_to_risk numeric NOT NULL DEFAULT 0,
  volatility_estimate numeric,
  beta_estimate numeric,
  beta_source text,
  risk_level text NOT NULL DEFAULT 'moderate',
  fundamental_label text,
  value_trap_risk text,
  disclosure_risk_flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.position_attribution_snapshots TO authenticated;
GRANT ALL ON public.position_attribution_snapshots TO service_role;

ALTER TABLE public.position_attribution_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_pos_attrib_read ON public.position_attribution_snapshots
  FOR SELECT USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY deny_public_write_pos_attrib ON public.position_attribution_snapshots
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_pos_attrib_account_created ON public.position_attribution_snapshots(account_id, created_at DESC);
CREATE INDEX idx_pos_attrib_symbol ON public.position_attribution_snapshots(symbol);


-- Portfolio scenario results --------------------------------------------
CREATE TABLE public.portfolio_scenario_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scenario_type text NOT NULL,
  scenario_name text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_equity numeric,
  estimated_pnl numeric,
  estimated_pnl_pct numeric,
  risk_level_before text,
  risk_level_after text,
  confidence text NOT NULL DEFAULT 'medium',
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_scenario_results TO authenticated;
GRANT ALL ON public.portfolio_scenario_results TO service_role;

ALTER TABLE public.portfolio_scenario_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_scenario_read ON public.portfolio_scenario_results
  FOR SELECT USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY deny_public_write_scenario ON public.portfolio_scenario_results
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_scenario_account_created ON public.portfolio_scenario_results(account_id, created_at DESC);
CREATE INDEX idx_scenario_type ON public.portfolio_scenario_results(scenario_type);
