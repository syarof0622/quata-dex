
-- Strategy intelligence: backtest + forward-test results tables, plus strategy
-- attribution columns on ai_agent_decisions. Idempotent / additive only.

CREATE TABLE IF NOT EXISTS public.strategy_backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name text NOT NULL,
  symbol text NOT NULL,
  sector text,
  market_regime text,
  timeframe text,
  total_trades integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  avg_return numeric NOT NULL DEFAULT 0,
  median_return numeric,
  profit_factor numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  avg_holding_period numeric,
  best_trade numeric,
  worst_trade numeric,
  sharpe_like_score numeric,
  sample_quality text NOT NULL DEFAULT 'insufficient_sample',
  tested_from timestamptz,
  tested_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbt_strategy ON public.strategy_backtest_results(strategy_name);
CREATE INDEX IF NOT EXISTS idx_sbt_symbol ON public.strategy_backtest_results(symbol);
CREATE INDEX IF NOT EXISTS idx_sbt_regime ON public.strategy_backtest_results(market_regime);

ALTER TABLE public.strategy_backtest_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_strategy_backtest ON public.strategy_backtest_results;
CREATE POLICY auth_read_strategy_backtest ON public.strategy_backtest_results
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_strategy_backtest ON public.strategy_backtest_results;
CREATE POLICY deny_public_write_strategy_backtest ON public.strategy_backtest_results
  FOR ALL TO public USING (false) WITH CHECK (false);


CREATE TABLE IF NOT EXISTS public.strategy_forward_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name text NOT NULL,
  symbol text NOT NULL,
  sector text,
  market_regime text,
  paper_order_id uuid,
  training_event_id uuid,
  realized_pnl numeric,
  realized_pnl_pct numeric,
  holding_duration_minutes integer,
  result text NOT NULL DEFAULT 'unknown',
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sft_strategy ON public.strategy_forward_test_results(strategy_name);
CREATE INDEX IF NOT EXISTS idx_sft_symbol ON public.strategy_forward_test_results(symbol);
CREATE INDEX IF NOT EXISTS idx_sft_regime ON public.strategy_forward_test_results(market_regime);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sft_paper_order ON public.strategy_forward_test_results(paper_order_id)
  WHERE paper_order_id IS NOT NULL;

ALTER TABLE public.strategy_forward_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_strategy_forward ON public.strategy_forward_test_results;
CREATE POLICY auth_read_strategy_forward ON public.strategy_forward_test_results
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_strategy_forward ON public.strategy_forward_test_results;
CREATE POLICY deny_public_write_strategy_forward ON public.strategy_forward_test_results
  FOR ALL TO public USING (false) WITH CHECK (false);


-- Strategy attribution on every AI decision.
ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS strategy_name text,
  ADD COLUMN IF NOT EXISTS setup_type text,
  ADD COLUMN IF NOT EXISTS market_regime text,
  ADD COLUMN IF NOT EXISTS signal_source text,
  ADD COLUMN IF NOT EXISTS strategy_context jsonb;
