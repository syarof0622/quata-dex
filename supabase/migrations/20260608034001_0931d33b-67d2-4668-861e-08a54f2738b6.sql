
-- ============ data_sources registry ============
CREATE TABLE IF NOT EXISTS public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  region text NOT NULL DEFAULT 'indonesia',
  asset_scope text NOT NULL DEFAULT 'mixed',
  priority int NOT NULL DEFAULT 5,
  is_enabled boolean NOT NULL DEFAULT true,
  requires_api_key boolean NOT NULL DEFAULT false,
  quota_protected boolean NOT NULL DEFAULT false,
  fallback_source_key text,
  health_status text NOT NULL DEFAULT 'not_run',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_message text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.data_sources TO authenticated;
GRANT ALL ON public.data_sources TO service_role;

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read data_sources" ON public.data_sources
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_data_sources_type ON public.data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_region ON public.data_sources(region);
CREATE INDEX IF NOT EXISTS idx_data_sources_health ON public.data_sources(health_status);

-- ============ market_data_snapshots ============
CREATE TABLE IF NOT EXISTS public.market_data_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  session_status text NOT NULL DEFAULT 'unknown',
  market_status text NOT NULL DEFAULT 'unknown',
  source_primary text,
  source_count int NOT NULL DEFAULT 0,
  idx_composite numeric,
  idx_composite_change_pct numeric,
  advancing_count int NOT NULL DEFAULT 0,
  declining_count int NOT NULL DEFAULT 0,
  flat_count int NOT NULL DEFAULT 0,
  ad_ratio numeric,
  data_quality_score numeric NOT NULL DEFAULT 0,
  freshness_status text NOT NULL DEFAULT 'unavailable',
  source_status text NOT NULL DEFAULT 'unknown',
  message text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_data_snapshots TO authenticated;
GRANT ALL ON public.market_data_snapshots TO service_role;

ALTER TABLE public.market_data_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read market_data_snapshots" ON public.market_data_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mds_snapshot_at ON public.market_data_snapshots(snapshot_at DESC);

-- ============ source_health_logs (generic per-source per-run) ============
CREATE TABLE IF NOT EXISTS public.source_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  pipeline_name text NOT NULL,
  status text NOT NULL,
  duration_ms int,
  items_fetched int NOT NULL DEFAULT 0,
  message text,
  error_detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.source_health_logs TO authenticated;
GRANT ALL ON public.source_health_logs TO service_role;

ALTER TABLE public.source_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read source_health_logs" ON public.source_health_logs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shl_source_created ON public.source_health_logs(source_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shl_pipeline_created ON public.source_health_logs(pipeline_name, created_at DESC);

-- ============ internal_audit_runs ============
CREATE TABLE IF NOT EXISTS public.internal_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type text NOT NULL,
  triggered_by uuid,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  checks_total int NOT NULL DEFAULT 0,
  checks_passed int NOT NULL DEFAULT 0,
  checks_failed int NOT NULL DEFAULT 0,
  fixes_applied int NOT NULL DEFAULT 0,
  summary text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.internal_audit_runs TO authenticated;
GRANT ALL ON public.internal_audit_runs TO service_role;

ALTER TABLE public.internal_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read internal_audit_runs" ON public.internal_audit_runs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_iar_started ON public.internal_audit_runs(started_at DESC);

-- ============ Seed data_sources registry ============
INSERT INTO public.data_sources
  (source_key, source_name, source_type, region, asset_scope, priority, requires_api_key, quota_protected, fallback_source_key, health_status, last_message)
VALUES
  -- Indonesian news
  ('cnbc_id_market',    'CNBC Indonesia Market',    'news', 'indonesia', 'idx_stock', 1, false, false, 'google_news_id',    'not_run', 'Belum dijalankan'),
  ('kontan',            'Kontan',                    'news', 'indonesia', 'idx_stock', 2, false, false, 'google_news_id',    'not_run', 'Belum dijalankan'),
  ('investor_id',       'Investor.id',               'news', 'indonesia', 'idx_stock', 2, false, false, 'google_news_id',    'not_run', 'Belum dijalankan'),
  ('antara_news',       'ANTARA News',               'news', 'indonesia', 'mixed',    3, false, false, NULL,                'not_run', 'Belum dijalankan'),
  ('bisnis_com',        'Bisnis.com Market',         'news', 'indonesia', 'idx_stock', 3, false, false, 'google_news_id',    'not_run', 'Belum dijalankan'),
  ('detik_finance',     'DetikFinance',              'news', 'indonesia', 'mixed',    3, false, false, 'google_news_id',    'not_run', 'Belum dijalankan'),
  ('katadata',          'Katadata',                  'news', 'indonesia', 'mixed',    4, false, false, NULL,                'not_run', 'Belum dijalankan'),
  ('pasardana',         'Pasardana',                 'news', 'indonesia', 'idx_stock', 4, false, false, NULL,                'not_run', 'Belum dijalankan'),
  ('emiten_news',       'EmitenNews',                'news', 'indonesia', 'idx_stock', 4, false, false, NULL,                'not_run', 'Belum dijalankan'),
  ('google_news_id',    'Google News Indonesia',     'news', 'indonesia', 'mixed',    5, false, false, NULL,                'not_run', 'Sumber cadangan'),
  ('serpapi_news',      'SerpApi Google News',       'news', 'indonesia', 'mixed',    2, true,  true,  'serpapi_news_light','not_run', 'Kuota dilindungi'),
  ('serpapi_news_light','SerpApi Google News Light', 'news', 'indonesia', 'mixed',    3, true,  true,  'google_news_id',    'not_run', 'Kuota dilindungi'),
  -- Global news
  ('yahoo_finance_news','Yahoo Finance News',        'news', 'global',    'global_stock', 2, false, false, NULL,             'not_run', 'Belum dijalankan'),
  ('nasdaq_news',       'Nasdaq News',               'news', 'us',        'global_stock', 3, false, false, NULL,             'not_run', 'Belum dijalankan'),
  ('marketwatch',       'MarketWatch',               'news', 'us',        'global_stock', 3, false, false, NULL,             'not_run', 'Belum dijalankan'),
  ('cnbc_global',       'CNBC Global',               'news', 'global',    'global_stock', 3, false, false, NULL,             'not_run', 'Belum dijalankan'),
  ('investing_com',     'Investing.com',             'news', 'global',    'mixed',        4, false, false, NULL,             'not_run', 'Belum dijalankan'),
  ('finnhub_news',      'Finnhub News',              'news', 'global',    'global_stock', 4, true,  false, NULL,             'not_configured', 'Belum dikonfigurasi (perlu API key)'),
  ('alpha_vantage_news','Alpha Vantage News',        'news', 'global',    'global_stock', 4, true,  false, NULL,             'not_configured', 'Belum dikonfigurasi (perlu API key)'),
  ('marketaux_news',    'MarketAux News',            'news', 'global',    'mixed',        2, true,  false, NULL,             'not_run', 'Belum dijalankan'),
  -- Disclosure
  ('idx_keterbukaan',   'IDX Keterbukaan Informasi', 'disclosure', 'indonesia', 'idx_stock', 1, false, false, NULL,           'not_run', 'Belum dijalankan'),
  ('idx_announcements', 'IDX Announcements',         'disclosure', 'indonesia', 'idx_stock', 1, false, false, NULL,           'not_run', 'Belum dijalankan'),
  ('idx_financial_reports','IDX Financial Reports',  'disclosure', 'indonesia', 'idx_stock', 2, false, false, NULL,           'not_run', 'Belum dijalankan'),
  ('idx_corporate_actions','IDX Corporate Actions',  'disclosure', 'indonesia', 'idx_stock', 2, false, false, NULL,           'not_run', 'Belum dijalankan'),
  -- IDX market price
  ('serpapi_google_finance','SerpApi Google Finance','market_price','indonesia','idx_stock', 1, true,  true,  'yahoo_finance_jk','not_run','Kuota dilindungi'),
  ('yahoo_finance_jk',  'Yahoo Finance .JK',         'market_price','indonesia','idx_stock', 2, false, false, 'google_finance',  'not_run','Sumber cadangan'),
  ('google_finance',    'Google Finance',            'market_price','indonesia','idx_stock', 3, false, false, NULL,              'not_run','Sumber cadangan'),
  ('idx_public_data',   'IDX Public Data',           'market_price','indonesia','idx_stock', 2, false, false, NULL,              'not_configured','Belum diintegrasikan'),
  -- Global market price
  ('twelve_data',       'Twelve Data',               'market_price','global','global_stock', 2, true,  false, 'stooq',           'not_run','Belum dijalankan'),
  ('alpha_vantage',     'Alpha Vantage',             'market_price','global','global_stock', 3, true,  false, 'stooq',           'not_configured','Belum dikonfigurasi (perlu API key)'),
  ('finnhub',           'Finnhub',                   'market_price','global','global_stock', 3, true,  false, NULL,              'not_configured','Belum dikonfigurasi (perlu API key)'),
  ('fmp',               'Financial Modeling Prep',   'market_price','global','global_stock', 4, true,  false, NULL,              'not_configured','Belum dikonfigurasi (perlu API key)'),
  ('tiingo',            'Tiingo',                    'market_price','global','global_stock', 4, true,  false, NULL,              'not_configured','Belum dikonfigurasi (perlu API key)'),
  ('stooq',             'Stooq EOD',                 'market_price','global','global_stock', 5, false, false, NULL,              'not_run','Sumber cadangan'),
  ('yahoo_finance',     'Yahoo Finance (global)',    'market_price','global','global_stock', 4, false, false, NULL,              'not_run','Sumber cadangan'),
  -- Market index
  ('idx_composite_serpapi','IHSG via SerpApi',       'market_index','indonesia','index', 1, true,  true,  'idx_composite_yahoo','not_run','Kuota dilindungi'),
  ('idx_composite_yahoo','IHSG via Yahoo Finance',   'market_index','indonesia','index', 2, false, false, NULL,                  'not_run','Sumber cadangan'),
  -- Fundamental
  ('serpapi_fundamental','SerpApi Google Finance Fundamental','fundamental','indonesia','idx_stock',1,true,true,NULL,           'not_run','Hanya menyediakan PER/Market Cap/Dividend Yield'),
  ('idx_financial_data','IDX Financial Statements',  'fundamental','indonesia','idx_stock',1,false,false,NULL,                  'not_configured','Belum diintegrasikan — PBV/ROE/DER butuh sumber ini')
ON CONFLICT (source_key) DO NOTHING;
