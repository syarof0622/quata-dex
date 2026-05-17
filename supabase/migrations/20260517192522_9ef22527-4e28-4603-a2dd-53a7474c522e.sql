
CREATE TABLE IF NOT EXISTS public.serpapi_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine text NOT NULL,
  query text,
  symbol text,
  status text NOT NULL,
  credits_used integer NOT NULL DEFAULT 1,
  response_time_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_serpapi_logs_created ON public.serpapi_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_serpapi_logs_engine ON public.serpapi_usage_logs(engine);

CREATE TABLE IF NOT EXISTS public.serpapi_usage_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  engine text NOT NULL,
  total_requests integer NOT NULL DEFAULT 0,
  success_requests integer NOT NULL DEFAULT 0,
  failed_requests integer NOT NULL DEFAULT 0,
  estimated_credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, engine)
);

CREATE TABLE IF NOT EXISTS public.news_price_alignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  news_sentiment text NOT NULL,
  price_direction text NOT NULL,
  alignment text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  reasoning text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol)
);
CREATE INDEX IF NOT EXISTS idx_npa_symbol ON public.news_price_alignment(symbol);

ALTER TABLE public.serpapi_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serpapi_usage_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_price_alignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_serpapi_logs" ON public.serpapi_usage_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_serpapi_summary" ON public.serpapi_usage_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_news_price_alignment" ON public.news_price_alignment FOR SELECT TO authenticated USING (true);

INSERT INTO public.news_sources (id, name, type, url, priority, category, enabled, status)
VALUES
  ('serpapi_google_news', 'SerpApi Google News', 'third_party_api', 'https://serpapi.com/search?engine=google_news', 3, 'premium_news', false, 'idle'),
  ('serpapi_google_news_light', 'SerpApi Google News Light', 'third_party_api', 'https://serpapi.com/search?engine=google_news_light', 4, 'premium_news', false, 'idle'),
  ('serpapi_google_finance', 'SerpApi Google Finance', 'third_party_api', 'https://serpapi.com/search?engine=google_finance', 2, 'premium_finance', false, 'idle')
ON CONFLICT (id) DO NOTHING;
