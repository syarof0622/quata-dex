ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS realized_pnl numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_paper_orders_user_status ON public.paper_orders(user_id, status);
