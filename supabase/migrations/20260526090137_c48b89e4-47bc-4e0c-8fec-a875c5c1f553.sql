
-- News intelligence quality upgrade: relevance, impact category, event clustering, source reliability, price alignment.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS ticker_relevance_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevance_class text NOT NULL DEFAULT 'irrelevant_noise',
  ADD COLUMN IF NOT EXISTS impact_category text NOT NULL DEFAULT 'generic_market_news',
  ADD COLUMN IF NOT EXISTS event_cluster_id text,
  ADD COLUMN IF NOT EXISTS duplicate_group_id text,
  ADD COLUMN IF NOT EXISTS canonical_article_id uuid,
  ADD COLUMN IF NOT EXISTS source_reliability_weight numeric NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS is_noise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_ticker text;

CREATE INDEX IF NOT EXISTS idx_news_articles_event_cluster ON public.news_articles(event_cluster_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance ON public.news_articles(relevance_class, ticker_relevance_score);
CREATE INDEX IF NOT EXISTS idx_news_articles_impact_category ON public.news_articles(impact_category);
CREATE INDEX IF NOT EXISTS idx_news_articles_primary_ticker ON public.news_articles(primary_ticker);

ALTER TABLE public.news_price_alignment
  ADD COLUMN IF NOT EXISTS price_at_publish numeric,
  ADD COLUMN IF NOT EXISTS price_after_15m numeric,
  ADD COLUMN IF NOT EXISTS price_after_1h numeric,
  ADD COLUMN IF NOT EXISTS price_at_eod numeric,
  ADD COLUMN IF NOT EXISTS price_next_day numeric,
  ADD COLUMN IF NOT EXISTS return_15m numeric,
  ADD COLUMN IF NOT EXISTS return_1h numeric,
  ADD COLUMN IF NOT EXISTS return_eod numeric,
  ADD COLUMN IF NOT EXISTS return_next_day numeric,
  ADD COLUMN IF NOT EXISTS volume_reaction numeric,
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS impact_category text,
  ADD COLUMN IF NOT EXISTS event_cluster_id text,
  ADD COLUMN IF NOT EXISTS news_article_id uuid;

CREATE INDEX IF NOT EXISTS idx_npa_event_cluster ON public.news_price_alignment(event_cluster_id);
CREATE INDEX IF NOT EXISTS idx_npa_symbol_time ON public.news_price_alignment(symbol, computed_at DESC);
