
-- 1. New columns on ai_trade_agents
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS symbol_selection_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS autonomous_universe text NOT NULL DEFAULT 'idx_liquid',
  ADD COLUMN IF NOT EXISTS max_autonomous_symbols integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_active_positions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_new_entries_per_day integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_autonomous_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS min_liquidity_score numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS min_data_quality_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS allow_autonomous_rotation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autonomous_rescan_interval_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS autonomous_allocation_mode text NOT NULL DEFAULT 'dynamic_ai',
  ADD COLUMN IF NOT EXISTS autonomous_mode_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paper_trading_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_autonomous_scan_at timestamptz;

-- 2. New columns on ai_agent_decisions
ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS autonomous_scan_id uuid,
  ADD COLUMN IF NOT EXISTS autonomous_rank integer,
  ADD COLUMN IF NOT EXISTS autonomous_score numeric,
  ADD COLUMN IF NOT EXISTS selection_reason text;

-- 3. New columns on ai_agent_training_events
ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS selection_mode text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS autonomous_scan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS candidate_scores jsonb,
  ADD COLUMN IF NOT EXISTS selection_outcome jsonb;

-- 4. ai_agent_scans table
CREATE TABLE IF NOT EXISTS public.ai_agent_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  scan_time timestamptz NOT NULL DEFAULT now(),
  selection_mode text NOT NULL DEFAULT 'autonomous',
  universe text NOT NULL,
  symbols_scanned_count integer NOT NULL DEFAULT 0,
  valid_candidates_count integer NOT NULL DEFAULT 0,
  selected_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  scan_status text NOT NULL DEFAULT 'completed',
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_scans_agent_time
  ON public.ai_agent_scans (agent_id, scan_time DESC);

ALTER TABLE public.ai_agent_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_ai_scans ON public.ai_agent_scans;
CREATE POLICY auth_read_ai_scans ON public.ai_agent_scans
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_scans ON public.ai_agent_scans;
CREATE POLICY deny_public_write_scans ON public.ai_agent_scans
  FOR ALL TO public USING (false) WITH CHECK (false);

-- 5. ai_agent_scan_candidates table
CREATE TABLE IF NOT EXISTS public.ai_agent_scan_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  symbol text NOT NULL,
  rank integer,
  autonomous_score numeric NOT NULL DEFAULT 0,
  data_quality_score numeric NOT NULL DEFAULT 0,
  liquidity_score numeric NOT NULL DEFAULT 0,
  technical_score numeric NOT NULL DEFAULT 0,
  sentiment_score numeric NOT NULL DEFAULT 0,
  disclosure_score numeric NOT NULL DEFAULT 0,
  market_context_score numeric NOT NULL DEFAULT 0,
  risk_score numeric NOT NULL DEFAULT 0,
  trade_setup_score numeric NOT NULL DEFAULT 0,
  recommendation text,
  reason text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed_filters boolean NOT NULL DEFAULT false,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_scan_candidates_scan
  ON public.ai_agent_scan_candidates (scan_id, rank);
CREATE INDEX IF NOT EXISTS idx_ai_scan_candidates_agent_sym
  ON public.ai_agent_scan_candidates (agent_id, symbol);

ALTER TABLE public.ai_agent_scan_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_ai_scan_candidates ON public.ai_agent_scan_candidates;
CREATE POLICY auth_read_ai_scan_candidates ON public.ai_agent_scan_candidates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS deny_public_write_scan_candidates ON public.ai_agent_scan_candidates;
CREATE POLICY deny_public_write_scan_candidates ON public.ai_agent_scan_candidates
  FOR ALL TO public USING (false) WITH CHECK (false);
