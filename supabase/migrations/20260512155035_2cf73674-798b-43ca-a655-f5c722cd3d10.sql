-- Allow ad-hoc backtests without strategy
ALTER TABLE public.backtests ALTER COLUMN strategy_id DROP NOT NULL;

-- Advanced order columns
ALTER TABLE public.paper_orders DROP CONSTRAINT IF EXISTS paper_orders_type_check;
ALTER TABLE public.paper_orders ADD CONSTRAINT paper_orders_type_check
  CHECK (type IN ('market','limit','stop','stop_limit','trailing_stop'));
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS limit_price NUMERIC;
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS stop_price NUMERIC;
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS trailing_pct NUMERIC;
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS trail_anchor NUMERIC;
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS take_profit NUMERIC;
ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS stop_loss NUMERIC;

-- Trade journal table
CREATE TABLE IF NOT EXISTS public.trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.paper_orders(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  setup TEXT,
  emotion TEXT,
  notes TEXT,
  ai_review TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_journal_all" ON public.trade_journal FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_journal_user_created ON public.trade_journal (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_symbol ON public.trade_journal (user_id, symbol);

-- Auto-create journal entry on fill
CREATE OR REPLACE FUNCTION public.log_filled_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'filled' AND (TG_OP = 'INSERT' OR OLD.status <> 'filled') THEN
    INSERT INTO public.trade_journal (user_id, order_id, symbol, side, qty, price)
    VALUES (NEW.user_id, NEW.id, NEW.symbol, NEW.side, NEW.qty, COALESCE(NEW.filled_price, NEW.price));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_filled_order ON public.paper_orders;
CREATE TRIGGER trg_log_filled_order
AFTER INSERT OR UPDATE OF status ON public.paper_orders
FOR EACH ROW EXECUTE FUNCTION public.log_filled_order();

REVOKE EXECUTE ON FUNCTION public.log_filled_order() FROM PUBLIC, anon, authenticated;