ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.paper_positions ADD COLUMN IF NOT EXISTS opened_by_agent_id UUID;
ALTER TABLE public.paper_positions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.ai_agent_decisions ADD COLUMN IF NOT EXISTS paper_order_id UUID;
CREATE INDEX IF NOT EXISTS idx_paper_positions_opened_by_agent_id ON public.paper_positions(opened_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_decisions_paper_order_id ON public.ai_agent_decisions(paper_order_id);