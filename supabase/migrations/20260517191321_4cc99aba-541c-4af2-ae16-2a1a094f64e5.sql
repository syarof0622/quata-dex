
-- news_articles
CREATE TABLE public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  title text not null,
  summary text,
  url text not null,
  canonical_url text,
  image_url text,
  published_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  category text,
  tickers text[] not null default '{}',
  sectors text[] not null default '{}',
  keywords text[] not null default '{}',
  sentiment text not null default 'neutral',
  sentiment_score numeric not null default 0,
  confidence numeric not null default 0,
  impact_level text not null default 'low',
  impact_score numeric not null default 0,
  related_symbols text[] not null default '{}',
  is_duplicate boolean not null default false,
  duplicate_of uuid,
  duplicate_sources text[] not null default '{}',
  title_hash text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE UNIQUE INDEX news_articles_source_uniq ON public.news_articles(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX news_articles_published_idx ON public.news_articles(published_at DESC);
CREATE INDEX news_articles_tickers_idx ON public.news_articles USING GIN(tickers);
CREATE INDEX news_articles_title_hash_idx ON public.news_articles(title_hash);

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_news_articles" ON public.news_articles FOR SELECT TO authenticated USING (true);

-- news_sources
CREATE TABLE public.news_sources (
  id text primary key,
  name text not null,
  type text not null,
  url text not null,
  fallback_url text,
  priority int not null default 99,
  category text,
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  status text not null default 'idle',
  fail_count int not null default 0,
  articles_today int not null default 0,
  updated_at timestamptz not null default now()
);
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_news_sources" ON public.news_sources FOR SELECT TO authenticated USING (true);

-- ticker_sentiment_summary
CREATE TABLE public.ticker_sentiment_summary (
  symbol text primary key,
  positive_count int not null default 0,
  neutral_count int not null default 0,
  negative_count int not null default 0,
  average_sentiment_score numeric not null default 0,
  high_impact_news_count int not null default 0,
  latest_news_at timestamptz,
  summary text,
  updated_at timestamptz not null default now()
);
ALTER TABLE public.ticker_sentiment_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_ticker_sentiment" ON public.ticker_sentiment_summary FOR SELECT TO authenticated USING (true);

-- Seed sources
INSERT INTO public.news_sources (id, name, type, url, fallback_url, priority, category) VALUES
('kontan',       'Kontan',                'rss',                  'https://www.kontan.co.id/feed', NULL, 1, 'stock_market'),
('cnbc_market',  'CNBC Indonesia Market', 'rss',                  'https://www.cnbcindonesia.com/market/rss', 'https://www.cnbcindonesia.com/rss', 2, 'market'),
('antara',       'ANTARA News',           'rss',                  'https://www.antaranews.com/rss/ekonomi.xml', 'https://www.antaranews.com/rss', 3, 'macro_economy'),
('investor_id',  'Investor.id',           'rss_or_light_scrape',  'https://investor.id/rss', 'https://investor.id/feed', 4, 'investment'),
('google_news',  'Google News',           'rss',                  'https://news.google.com/rss/search?q=IHSG%20OR%20saham%20OR%20emiten&hl=id&gl=ID&ceid=ID:id', NULL, 5, 'aggregator');
