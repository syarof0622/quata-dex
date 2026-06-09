
-- ============================================================
-- AI Learning Engine Upgrade
-- Adds: decision context columns, paper linkage, closed_trades,
-- memory tables, learning events, outcome evaluators, daily runs.
-- All new tables: user-scoped RLS; admin bypass via is_admin().
-- ============================================================

-- 1. Extend ai_agent_decisions (all nullable)
ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS decision_type text,
  ADD COLUMN IF NOT EXISTS strategy_mode text,
  ADD COLUMN IF NOT EXISTS agent_mode text,
  ADD COLUMN IF NOT EXISTS agent_version text,
  ADD COLUMN IF NOT EXISTS entry_engine text,
  ADD COLUMN IF NOT EXISTS exit_engine text,
  ADD COLUMN IF NOT EXISTS market_session text,
  ADD COLUMN IF NOT EXISTS price_at_decision numeric,
  ADD COLUMN IF NOT EXISTS reference_price numeric,
  ADD COLUMN IF NOT EXISTS scanner_score numeric,
  ADD COLUMN IF NOT EXISTS technical_score numeric,
  ADD COLUMN IF NOT EXISTS fundamental_score numeric,
  ADD COLUMN IF NOT EXISTS news_score numeric,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS disclosure_score numeric,
  ADD COLUMN IF NOT EXISTS liquidity_score numeric,
  ADD COLUMN IF NOT EXISTS volatility_score numeric,
  ADD COLUMN IF NOT EXISTS risk_reward_score numeric,
  ADD COLUMN IF NOT EXISTS data_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS calibration_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS execution_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS final_decision_score numeric,
  ADD COLUMN IF NOT EXISTS calibration_state text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS position_weight_pct numeric,
  ADD COLUMN IF NOT EXISTS target_allocation_value numeric,
  ADD COLUMN IF NOT EXISTS calculated_lot integer,
  ADD COLUMN IF NOT EXISTS take_profit_1 numeric,
  ADD COLUMN IF NOT EXISTS take_profit_2 numeric,
  ADD COLUMN IF NOT EXISTS trailing_stop_rule text,
  ADD COLUMN IF NOT EXISTS invalidation_level numeric,
  ADD COLUMN IF NOT EXISTS max_holding_days integer,
  ADD COLUMN IF NOT EXISTS min_holding_until timestamptz,
  ADD COLUMN IF NOT EXISTS time_stop_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_freshness jsonb,
  ADD COLUMN IF NOT EXISTS source_confidence jsonb,
  ADD COLUMN IF NOT EXISTS blocking_factors jsonb,
  ADD COLUMN IF NOT EXISTS allowing_factors jsonb,
  ADD COLUMN IF NOT EXISTS required_action text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS sector text;

CREATE INDEX IF NOT EXISTS idx_ai_agent_decisions_user_symbol ON public.ai_agent_decisions(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ai_agent_decisions_user_created ON public.ai_agent_decisions(user_id, created_at DESC);

-- 2. paper_orders linkage
ALTER TABLE public.paper_orders
  ADD COLUMN IF NOT EXISTS ai_decision_id uuid,
  ADD COLUMN IF NOT EXISTS strategy_mode text,
  ADD COLUMN IF NOT EXISTS agent_mode text,
  ADD COLUMN IF NOT EXISTS entry_engine text,
  ADD COLUMN IF NOT EXISTS decision_score numeric,
  ADD COLUMN IF NOT EXISTS risk_reward_ratio numeric,
  ADD COLUMN IF NOT EXISTS source_confidence jsonb;

-- 3. paper_positions linkage
ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS ai_decision_id uuid,
  ADD COLUMN IF NOT EXISTS entry_decision_id uuid,
  ADD COLUMN IF NOT EXISTS strategy_mode text,
  ADD COLUMN IF NOT EXISTS agent_mode text,
  ADD COLUMN IF NOT EXISTS entry_engine text,
  ADD COLUMN IF NOT EXISTS exit_engine text,
  ADD COLUMN IF NOT EXISTS planned_stop_loss numeric,
  ADD COLUMN IF NOT EXISTS planned_take_profit_1 numeric,
  ADD COLUMN IF NOT EXISTS planned_take_profit_2 numeric,
  ADD COLUMN IF NOT EXISTS planned_time_stop_at timestamptz,
  ADD COLUMN IF NOT EXISTS planned_max_holding_days integer,
  ADD COLUMN IF NOT EXISTS current_trade_state text;

-- 4. closed_trades (new)
CREATE TABLE IF NOT EXISTS public.closed_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paper_account_id uuid,
  ai_decision_id uuid,
  entry_decision_id uuid,
  exit_decision_id uuid,
  entry_order_id uuid,
  exit_order_id uuid,
  paper_position_id uuid,
  symbol text NOT NULL,
  sector text,
  strategy_mode text,
  agent_mode text,
  entry_engine text,
  exit_engine text,
  entry_reason text,
  exit_reason text,
  entry_price numeric,
  exit_price numeric,
  qty numeric,
  opened_at timestamptz,
  closed_at timestamptz DEFAULT now(),
  holding_days numeric,
  planned_stop_loss numeric,
  planned_take_profit_1 numeric,
  planned_take_profit_2 numeric,
  planned_risk_pct numeric,
  realized_pnl numeric,
  realized_return_pct numeric,
  realized_r_multiple numeric,
  max_favorable_excursion_pct numeric,
  max_adverse_excursion_pct numeric,
  outcome_label text,
  setup_label text,
  mistake_label text,
  result_quality text,
  market_regime_at_entry text,
  market_regime_at_exit text,
  notes text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closed_trades TO authenticated;
GRANT ALL ON public.closed_trades TO service_role;
ALTER TABLE public.closed_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "closed_trades_user_rw" ON public.closed_trades FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_closed_trades_user_symbol ON public.closed_trades(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_closed_trades_user_closed ON public.closed_trades(user_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_closed_trades_user_strategy ON public.closed_trades(user_id, strategy_mode);

-- 5. trade_memory_by_symbol
CREATE TABLE IF NOT EXISTS public.trade_memory_by_symbol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  win_count integer NOT NULL DEFAULT 0,
  loss_count integer NOT NULL DEFAULT 0,
  breakeven_count integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_return_pct numeric,
  avg_win_pct numeric,
  avg_loss_pct numeric,
  profit_factor numeric,
  expectancy_pct numeric,
  avg_holding_days numeric,
  best_strategy_mode text,
  worst_strategy_mode text,
  last_outcome_label text,
  last_trade_at timestamptz,
  cooldown_until timestamptz,
  symbol_risk_score numeric,
  confidence_adjustment numeric NOT NULL DEFAULT 0,
  allocation_adjustment numeric NOT NULL DEFAULT 0,
  notes text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_memory_by_symbol TO authenticated;
GRANT ALL ON public.trade_memory_by_symbol TO service_role;
ALTER TABLE public.trade_memory_by_symbol ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_memory_user_rw" ON public.trade_memory_by_symbol FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 6. strategy_performance_memory
CREATE TABLE IF NOT EXISTS public.strategy_performance_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strategy_mode text NOT NULL,
  agent_mode text,
  sample_count integer NOT NULL DEFAULT 0,
  win_count integer NOT NULL DEFAULT 0,
  loss_count integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_return_pct numeric,
  avg_win_pct numeric,
  avg_loss_pct numeric,
  profit_factor numeric,
  expectancy_pct numeric,
  max_drawdown_pct numeric,
  avg_holding_days numeric,
  last_10_win_rate numeric,
  last_10_return_pct numeric,
  confidence_adjustment numeric NOT NULL DEFAULT 0,
  allocation_multiplier numeric NOT NULL DEFAULT 1,
  is_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  cooldown_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, strategy_mode, agent_mode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_performance_memory TO authenticated;
GRANT ALL ON public.strategy_performance_memory TO service_role;
ALTER TABLE public.strategy_performance_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strategy_mem_user_rw" ON public.strategy_performance_memory FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 7. sector_performance_memory
CREATE TABLE IF NOT EXISTS public.sector_performance_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sector text NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_return_pct numeric,
  profit_factor numeric,
  expectancy_pct numeric,
  best_strategy_mode text,
  worst_strategy_mode text,
  sector_confidence_adjustment numeric NOT NULL DEFAULT 0,
  sector_allocation_adjustment numeric NOT NULL DEFAULT 0,
  last_trade_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, sector)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sector_performance_memory TO authenticated;
GRANT ALL ON public.sector_performance_memory TO service_role;
ALTER TABLE public.sector_performance_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sector_mem_user_rw" ON public.sector_performance_memory FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 8. market_regime_performance_memory
CREATE TABLE IF NOT EXISTS public.market_regime_performance_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  market_regime text NOT NULL,
  strategy_mode text NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_return_pct numeric,
  profit_factor numeric,
  expectancy_pct numeric,
  confidence_adjustment numeric NOT NULL DEFAULT 0,
  allocation_multiplier numeric NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, market_regime, strategy_mode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_regime_performance_memory TO authenticated;
GRANT ALL ON public.market_regime_performance_memory TO service_role;
ALTER TABLE public.market_regime_performance_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regime_mem_user_rw" ON public.market_regime_performance_memory FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 9. learning_events
CREATE TABLE IF NOT EXISTS public.learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  symbol text,
  strategy_mode text,
  event_type text NOT NULL,
  event_title text,
  event_summary text,
  confidence_delta numeric,
  allocation_delta numeric,
  cooldown_until timestamptz,
  related_trade_id uuid,
  related_decision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_events TO authenticated;
GRANT ALL ON public.learning_events TO service_role;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_events_user_r" ON public.learning_events FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "learning_events_user_w" ON public.learning_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_learning_events_user_created ON public.learning_events(user_id, created_at DESC);

-- 10. blocked_decision_outcomes
CREATE TABLE IF NOT EXISTS public.blocked_decision_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  decision_id uuid,
  symbol text NOT NULL,
  blocked_at timestamptz NOT NULL,
  reference_price numeric,
  price_after_1h numeric,
  price_eod numeric,
  price_after_3d numeric,
  price_after_5d numeric,
  max_upside_after_block_pct numeric,
  max_drawdown_after_block_pct numeric,
  was_good_block boolean,
  missed_opportunity boolean,
  notes text[],
  evaluated_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_decision_outcomes TO authenticated;
GRANT ALL ON public.blocked_decision_outcomes TO service_role;
ALTER TABLE public.blocked_decision_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_outcomes_user_rw" ON public.blocked_decision_outcomes FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 11. watch_research_outcomes
CREATE TABLE IF NOT EXISTS public.watch_research_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  decision_id uuid,
  symbol text NOT NULL,
  decision_type text,
  reference_price numeric,
  price_after_1d numeric,
  price_after_3d numeric,
  price_after_5d numeric,
  max_upside_pct numeric,
  max_drawdown_pct numeric,
  should_have_been_starter boolean,
  notes text[],
  evaluated_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_research_outcomes TO authenticated;
GRANT ALL ON public.watch_research_outcomes TO service_role;
ALTER TABLE public.watch_research_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watch_outcomes_user_rw" ON public.watch_research_outcomes FOR ALL
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 12. daily_learning_runs
CREATE TABLE IF NOT EXISTS public.daily_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at timestamptz NOT NULL DEFAULT now(),
  run_finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  users_processed integer NOT NULL DEFAULT 0,
  trades_processed integer NOT NULL DEFAULT 0,
  symbols_updated integer NOT NULL DEFAULT 0,
  strategies_updated integer NOT NULL DEFAULT 0,
  sectors_updated integer NOT NULL DEFAULT 0,
  regimes_updated integer NOT NULL DEFAULT 0,
  cooldowns_created integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  summary text,
  error_detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.daily_learning_runs TO authenticated;
GRANT ALL ON public.daily_learning_runs TO service_role;
ALTER TABLE public.daily_learning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_runs_authenticated_r" ON public.daily_learning_runs FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "daily_runs_admin_w" ON public.daily_learning_runs FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "daily_runs_admin_u" ON public.daily_learning_runs FOR UPDATE
  USING (public.is_admin(auth.uid()));
