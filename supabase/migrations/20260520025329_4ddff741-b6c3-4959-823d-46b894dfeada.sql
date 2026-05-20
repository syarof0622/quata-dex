
-- Phase B: Market Regime + Sector Rotation + Portfolio Risk
CREATE TABLE IF NOT EXISTS public.market_regime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_trend text NOT NULL DEFAULT 'unknown',
  regime_volatility text NOT NULL DEFAULT 'unknown',
  regime_breadth text NOT NULL DEFAULT 'unknown',
  regime_classification text NOT NULL DEFAULT 'neutral',
  idx_level numeric,
  idx_change_pct numeric,
  breadth_pct numeric,
  advancers integer,
  decliners integer,
  reasoning text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_regime_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_market_regime ON public.market_regime_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_market_regime ON public.market_regime_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_market_regime_created_at ON public.market_regime_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS public.sector_strength_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL,
  relative_strength numeric NOT NULL DEFAULT 0,
  momentum_score numeric NOT NULL DEFAULT 0,
  breadth_score numeric NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'neutral',
  top_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sector_strength_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_sector_strength ON public.sector_strength_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_sector_strength ON public.sector_strength_snapshots FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_sector_strength_sector_created ON public.sector_strength_snapshots(sector, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_risk_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_account_id uuid NOT NULL,
  agent_id uuid,
  gross_exposure numeric NOT NULL DEFAULT 0,
  net_exposure numeric NOT NULL DEFAULT 0,
  cash_pct numeric NOT NULL DEFAULT 0,
  concentration_hhi numeric NOT NULL DEFAULT 0,
  max_position_weight numeric NOT NULL DEFAULT 0,
  sector_concentration jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_drawdown numeric NOT NULL DEFAULT 0,
  daily_pnl numeric NOT NULL DEFAULT 0,
  daily_pnl_pct numeric NOT NULL DEFAULT 0,
  trades_today integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portfolio_risk_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_portfolio_risk ON public.portfolio_risk_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY own_portfolio_risk_all ON public.portfolio_risk_snapshots FOR ALL TO public
  USING (paper_account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid))
  WITH CHECK (paper_account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid));
CREATE INDEX IF NOT EXISTS idx_portfolio_risk_account_created ON public.portfolio_risk_snapshots(paper_account_id, created_at DESC);

-- Phase C: Post-Trade Review
CREATE TABLE IF NOT EXISTS public.ai_trade_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  paper_account_id uuid NOT NULL,
  symbol text NOT NULL,
  decision_id uuid,
  training_event_id uuid,
  entry_price numeric,
  exit_price numeric,
  qty numeric,
  pnl numeric,
  pnl_pct numeric,
  holding_minutes integer,
  outcome text NOT NULL DEFAULT 'unknown',
  lesson_label text,
  what_went_right text,
  what_went_wrong text,
  ai_review text,
  entry_context jsonb,
  exit_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_trade_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_ai_trade_reviews ON public.ai_trade_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_ai_trade_reviews ON public.ai_trade_reviews FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_ai_trade_reviews_agent_created ON public.ai_trade_reviews(agent_id, created_at DESC);

ALTER TABLE public.ai_agent_scan_candidates
  ADD COLUMN IF NOT EXISTS fundamental_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS undervalue_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regime_fit_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sector_fit_score numeric NOT NULL DEFAULT 0;

-- Phase D: Backtest + Alerts intelligence
ALTER TABLE public.backtests
  ADD COLUMN IF NOT EXISTS regime text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS strategy_version text,
  ADD COLUMN IF NOT EXISTS drift_score numeric;

CREATE TABLE IF NOT EXISTS public.ai_alerts_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  default_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_alerts_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_ai_alerts_def ON public.ai_alerts_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY deny_public_write_ai_alerts_def ON public.ai_alerts_definitions FOR ALL TO public USING (false) WITH CHECK (false);

INSERT INTO public.ai_alerts_definitions (alert_type, name, description, category, severity, default_rule) VALUES
  ('value_trap_warning', 'Value Trap Warning', 'Stock cheap on PER/PBV but quality/health weak', 'fundamental', 'warning', '{"min_value_trap_risk": 60}'),
  ('undervalue_signal', 'Undervalue Signal', 'High fundamental undervalue score with good quality', 'fundamental', 'info', '{"min_undervalue_score": 75}'),
  ('regime_shift', 'Market Regime Shift', 'Overall market regime changed (e.g. risk-on -> risk-off)', 'macro', 'warning', '{}'),
  ('sector_rotation_in', 'Sector Rotating In', 'Sector showing strong relative strength', 'macro', 'info', '{}'),
  ('sector_rotation_out', 'Sector Rotating Out', 'Sector showing weakening relative strength', 'macro', 'warning', '{}'),
  ('breakout_volume', 'Breakout with Volume', 'Price breaks resistance with above-average volume', 'technical', 'info', '{"volume_mult": 1.5}'),
  ('breakdown_volume', 'Breakdown with Volume', 'Price breaks support with above-average volume', 'technical', 'warning', '{"volume_mult": 1.5}'),
  ('sentiment_spike_positive', 'Positive Sentiment Spike', 'Sudden surge in positive news sentiment', 'sentiment', 'info', '{"min_score": 0.6}'),
  ('sentiment_spike_negative', 'Negative Sentiment Spike', 'Sudden surge in negative news sentiment', 'sentiment', 'warning', '{"max_score": -0.6}'),
  ('high_impact_disclosure', 'High Impact Disclosure', 'Material IDX disclosure detected', 'disclosure', 'warning', '{}'),
  ('drawdown_limit', 'Portfolio Drawdown Limit', 'Portfolio drawdown approaching max threshold', 'risk', 'critical', '{"threshold_pct": 5}'),
  ('concentration_risk', 'Concentration Risk', 'Single position or sector exceeds concentration cap', 'risk', 'warning', '{"max_weight_pct": 25}'),
  ('confidence_drift', 'AI Confidence Drift', 'Calibrated confidence diverging from historical win rate', 'ai', 'info', '{}'),
  ('data_quality_degraded', 'Data Quality Degraded', 'Multiple data sources stale or missing', 'data', 'warning', '{"min_score": 60}'),
  ('autonomous_top_pick', 'New Autonomous Top Pick', 'AI autonomous scanner promoted a new top candidate', 'ai', 'info', '{}')
ON CONFLICT (alert_type) DO NOTHING;

-- Phase E: Demo / Onboarding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
