
CREATE TABLE IF NOT EXISTS public.ai_agent_trade_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  symbol text NOT NULL,
  recent_win_rate numeric NOT NULL DEFAULT 0,
  recent_avg_return numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  last_trade_result text,
  last_entry_reason text,
  recent_mistake text,
  best_strategy text,
  worst_strategy text,
  strategy_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ticker_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  sector_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_ai_trade_memory_agent_symbol
  ON public.ai_agent_trade_memory (agent_id, symbol);

ALTER TABLE public.ai_agent_trade_memory ENABLE ROW LEVEL SECURITY;

-- Read for authenticated users (single-tenant super-admin model).
CREATE POLICY auth_read_ai_trade_memory
  ON public.ai_agent_trade_memory FOR SELECT
  TO authenticated USING (true);

-- Deny public role writes; service-role admin client bypasses RLS for upserts.
CREATE POLICY deny_public_insert
  ON public.ai_agent_trade_memory FOR INSERT
  TO public WITH CHECK (false);
CREATE POLICY deny_public_update
  ON public.ai_agent_trade_memory FOR UPDATE
  TO public USING (false) WITH CHECK (false);
CREATE POLICY deny_public_delete
  ON public.ai_agent_trade_memory FOR DELETE
  TO public USING (false);
