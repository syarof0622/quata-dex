
-- Make array columns tolerant: keep DEFAULT '{}' but drop NOT NULL,
-- and add a BEFORE INSERT/UPDATE trigger to coerce nulls to empty arrays.
ALTER TABLE public.news_articles
  ALTER COLUMN duplicate_sources DROP NOT NULL,
  ALTER COLUMN tickers DROP NOT NULL,
  ALTER COLUMN sectors DROP NOT NULL,
  ALTER COLUMN keywords DROP NOT NULL,
  ALTER COLUMN related_symbols DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.news_articles_coerce_array_nulls()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.duplicate_sources IS NULL THEN NEW.duplicate_sources := '{}'::text[]; END IF;
  IF NEW.tickers IS NULL THEN NEW.tickers := '{}'::text[]; END IF;
  IF NEW.sectors IS NULL THEN NEW.sectors := '{}'::text[]; END IF;
  IF NEW.keywords IS NULL THEN NEW.keywords := '{}'::text[]; END IF;
  IF NEW.related_symbols IS NULL THEN NEW.related_symbols := '{}'::text[]; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_articles_coerce_arrays ON public.news_articles;
CREATE TRIGGER trg_news_articles_coerce_arrays
  BEFORE INSERT OR UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.news_articles_coerce_array_nulls();

-- Backfill any nulls just in case
UPDATE public.news_articles SET duplicate_sources = '{}' WHERE duplicate_sources IS NULL;

-- Clear the stale worker error so the dashboard recovers on the next successful run.
UPDATE public.news_worker_state
SET last_news_worker_message = 'reset: schema fix applied; awaiting next cron tick',
    news_worker_status = 'idle',
    news_worker_error_count = 0,
    updated_at = now()
WHERE singleton = true;
