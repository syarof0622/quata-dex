
-- Add baseline tracking to paper_accounts
ALTER TABLE public.paper_accounts
  ADD COLUMN IF NOT EXISTS initial_balance numeric,
  ADD COLUMN IF NOT EXISTS reset_at timestamptz;

-- Backfill initial_balance for existing accounts
UPDATE public.paper_accounts
SET initial_balance = COALESCE(initial_balance, equity, cash, 100000000)
WHERE initial_balance IS NULL;

-- Portfolio equity snapshots for accurate equity curve
CREATE TABLE IF NOT EXISTS public.portfolio_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_account_id uuid NOT NULL,
  equity numeric NOT NULL DEFAULT 0,
  cash numeric NOT NULL DEFAULT 0,
  holdings_value numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_equity_snapshots_account_time
  ON public.portfolio_equity_snapshots (paper_account_id, created_at DESC);

ALTER TABLE public.portfolio_equity_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "own_equity_snapshots_all" ON public.portfolio_equity_snapshots
    FOR ALL TO public
    USING (paper_account_id IN (
      SELECT id FROM public.paper_accounts
      WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid
    ))
    WITH CHECK (paper_account_id IN (
      SELECT id FROM public.paper_accounts
      WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Real equity-based fields on risk snapshots
ALTER TABLE public.portfolio_risk_snapshots
  ADD COLUMN IF NOT EXISTS equity_snapshot numeric,
  ADD COLUMN IF NOT EXISTS cash_snapshot numeric,
  ADD COLUMN IF NOT EXISTS holdings_value_snapshot numeric,
  ADD COLUMN IF NOT EXISTS realized_pnl_snapshot numeric,
  ADD COLUMN IF NOT EXISTS unrealized_pnl_snapshot numeric;
