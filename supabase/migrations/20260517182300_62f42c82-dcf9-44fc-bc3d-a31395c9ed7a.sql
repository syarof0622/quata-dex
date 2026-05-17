-- Recreate core application schema for single-tenant terminal usage
-- user_id columns kept as plain UUID (no FK to auth.users) to support hardcoded super-admin pattern

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

CREATE TABLE public.recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.portfolio_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.paper_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  cash NUMERIC NOT NULL DEFAULT 100000000,
  equity NUMERIC NOT NULL DEFAULT 100000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  type TEXT NOT NULL DEFAULT 'market' CHECK (type IN ('market','limit','stop','stop_limit','trailing_stop')),
  qty NUMERIC NOT NULL,
  price NUMERIC,
  filled_price NUMERIC,
  limit_price NUMERIC,
  stop_price NUMERIC,
  trailing_pct NUMERIC,
  trail_anchor NUMERIC,
  take_profit NUMERIC,
  stop_loss NUMERIC,
  status TEXT NOT NULL DEFAULT 'filled' CHECK (status IN ('pending','filled','cancelled','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ
);

CREATE TABLE public.paper_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, symbol)
);

CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.backtests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  equity_curve_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  rule_json JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.signals_cache (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  score NUMERIC NOT NULL,
  label TEXT NOT NULL,
  reasoning_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, timeframe)
);

CREATE TABLE public.news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT,
  headline TEXT NOT NULL,
  url TEXT,
  source TEXT,
  sentiment TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
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

CREATE INDEX idx_journal_user_created ON public.trade_journal (user_id, created_at DESC);
CREATE INDEX idx_journal_symbol ON public.trade_journal (user_id, symbol);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;

-- Policies (scoped to hardcoded super-admin user for single-tenant usage)
CREATE POLICY "own_profile_all" ON public.profiles FOR ALL USING (id = '00000000-0000-0000-0000-000000000001') WITH CHECK (id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_roles_all" ON public.user_roles FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_watchlist_all" ON public.watchlist FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_recent_all" ON public.recent_searches FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_holdings_all" ON public.portfolio_holdings FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_paper_account_all" ON public.paper_accounts FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_paper_orders_all" ON public.paper_orders FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_paper_positions_all" ON public.paper_positions FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_strategies_all" ON public.strategies FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_backtests_all" ON public.backtests FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_alerts_all" ON public.alerts FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "own_journal_all" ON public.trade_journal FOR ALL USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "auth_read_signals" ON public.signals_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_news" ON public.news_cache FOR SELECT TO authenticated USING (true);

-- Insert hardcoded super-admin profile and role
INSERT INTO public.profiles (id, display_name) VALUES ('00000000-0000-0000-0000-000000000001', 'Super Admin');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-000000000001', 'super_admin');

-- Insert default paper account for super admin
INSERT INTO public.paper_accounts (user_id, cash, equity) VALUES ('00000000-0000-0000-0000-000000000001', 100000000, 100000000);
