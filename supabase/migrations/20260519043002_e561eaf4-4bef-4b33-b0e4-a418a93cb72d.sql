
-- AI Trade Agent tables. Single super-admin user pattern (user_id = '00000000-0000-0000-0000-000000000001').

CREATE TABLE IF NOT EXISTS public.ai_trade_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paper_account_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'AI Trade Agent',
  status text NOT NULL DEFAULT 'stopped',
  mode text NOT NULL DEFAULT 'paper_trading',
  selected_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  strategy_mode text NOT NULL DEFAULT 'hybrid',
  risk_level text NOT NULL DEFAULT 'balanced',
  allocation_mode text NOT NULL DEFAULT 'fixed_nominal',
  allocation_amount numeric DEFAULT 1000000,
  allocation_percent numeric,
  max_position_per_symbol numeric DEFAULT 0.25,
  max_daily_trades integer DEFAULT 5,
  max_daily_loss numeric DEFAULT 0.02,
  max_drawdown numeric DEFAULT 0.05,
  allow_buy boolean DEFAULT true,
  allow_sell boolean DEFAULT true,
  allow_short_sell boolean DEFAULT false,
  allow_average_down boolean DEFAULT false,
  allow_pyramiding boolean DEFAULT false,
  auto_stop_loss boolean DEFAULT true,
  auto_take_profit boolean DEFAULT true,
  trailing_stop boolean DEFAULT false,
  trading_hours_only boolean DEFAULT true,
  require_fresh_data boolean DEFAULT true,
  min_confidence_to_trade numeric DEFAULT 0.70,
  trading_enabled boolean DEFAULT true,
  started_at timestamptz,
  paused_at timestamptz,
  stopped_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_trade_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_ai_agents_all ON public.ai_trade_agents FOR ALL
  USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE TABLE IF NOT EXISTS public.ai_agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  paper_account_id uuid NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL,
  confidence numeric,
  strategy text,
  allocation_amount numeric,
  suggested_lot integer,
  suggested_shares numeric,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_reward_ratio numeric,
  reasoning text,
  data_snapshot jsonb,
  technical_snapshot jsonb,
  sentiment_snapshot jsonb,
  portfolio_snapshot jsonb,
  risk_snapshot jsonb,
  decision_status text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_agent ON public.ai_agent_decisions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_idem ON public.ai_agent_decisions(idempotency_key);
ALTER TABLE public.ai_agent_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_ai_decisions ON public.ai_agent_decisions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_agent_training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  decision_id uuid,
  order_id uuid,
  position_id uuid,
  symbol text NOT NULL,
  input_features jsonb,
  decision_output jsonb,
  actual_outcome jsonb,
  pnl numeric,
  pnl_percent numeric,
  holding_period_minutes integer,
  max_favorable_excursion numeric,
  max_adverse_excursion numeric,
  was_correct boolean,
  lesson_label text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_training_agent ON public.ai_agent_training_events(agent_id, created_at DESC);
ALTER TABLE public.ai_agent_training_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_ai_training ON public.ai_agent_training_events FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_agent_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE,
  paper_account_id uuid NOT NULL,
  total_trades integer DEFAULT 0,
  win_rate numeric DEFAULT 0,
  loss_rate numeric DEFAULT 0,
  avg_win numeric DEFAULT 0,
  avg_loss numeric DEFAULT 0,
  profit_factor numeric DEFAULT 0,
  max_drawdown numeric DEFAULT 0,
  total_return numeric DEFAULT 0,
  daily_return numeric DEFAULT 0,
  best_trade numeric DEFAULT 0,
  worst_trade numeric DEFAULT 0,
  avg_holding_time numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_agent_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_ai_perf ON public.ai_agent_performance FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_agent_risk_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  symbol text,
  risk_type text,
  risk_level text,
  message text,
  action_taken text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_risk_agent ON public.ai_agent_risk_logs(agent_id, created_at DESC);
ALTER TABLE public.ai_agent_risk_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_ai_risk ON public.ai_agent_risk_logs FOR SELECT USING (true);
