-- Backfill any null source_id with canonical_url or url so we can make the column NOT NULL
UPDATE public.news_articles
SET source_id = COALESCE(source_id, canonical_url, url)
WHERE source_id IS NULL;

ALTER TABLE public.news_articles
  ALTER COLUMN source_id SET NOT NULL;

DROP INDEX IF EXISTS public.news_articles_source_uniq;

CREATE UNIQUE INDEX news_articles_source_uniq
  ON public.news_articles (source, source_id);
