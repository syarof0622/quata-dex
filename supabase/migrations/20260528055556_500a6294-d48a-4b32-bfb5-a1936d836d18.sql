
-- Extend official_disclosures
ALTER TABLE public.official_disclosures
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS is_high_impact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_news_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_official_disclosures_is_high_impact
  ON public.official_disclosures (is_high_impact, published_at DESC)
  WHERE is_high_impact = true;
CREATE INDEX IF NOT EXISTS idx_official_disclosures_impact_score
  ON public.official_disclosures (impact_score DESC, published_at DESC);

DROP TRIGGER IF EXISTS trg_official_disclosures_updated_at ON public.official_disclosures;
CREATE TRIGGER trg_official_disclosures_updated_at
  BEFORE UPDATE ON public.official_disclosures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend corporate_actions
ALTER TABLE public.corporate_actions
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS sentiment text NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}';

-- Extend regulatory_events
ALTER TABLE public.regulatory_events
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}';
