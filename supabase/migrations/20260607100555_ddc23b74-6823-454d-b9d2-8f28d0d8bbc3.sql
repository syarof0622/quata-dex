
-- 1. Extend paper_accounts
ALTER TABLE public.paper_accounts
  ADD COLUMN IF NOT EXISTS starting_balance numeric NOT NULL DEFAULT 100000000,
  ADD COLUMN IF NOT EXISTS account_name text NOT NULL DEFAULT 'Akun Paper Trading Utama',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS realized_pnl numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.paper_accounts
  SET starting_balance = COALESCE(initial_balance, cash, 100000000)
  WHERE starting_balance IS NULL OR starting_balance = 0;

DROP TRIGGER IF EXISTS trg_paper_accounts_updated_at ON public.paper_accounts;
CREATE TRIGGER trg_paper_accounts_updated_at
  BEFORE UPDATE ON public.paper_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. paper_balance_events
CREATE TABLE IF NOT EXISTS public.paper_balance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_account_id uuid REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_balance numeric,
  new_balance numeric,
  old_equity numeric,
  new_equity numeric,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_balance_events_user ON public.paper_balance_events(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.paper_balance_events TO authenticated;
GRANT ALL ON public.paper_balance_events TO service_role;
ALTER TABLE public.paper_balance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paper_balance_events_select_own_or_admin" ON public.paper_balance_events;
CREATE POLICY "paper_balance_events_select_own_or_admin" ON public.paper_balance_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "paper_balance_events_insert_own" ON public.paper_balance_events;
CREATE POLICY "paper_balance_events_insert_own" ON public.paper_balance_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 3. user_ai_settings
CREATE TABLE IF NOT EXISTS public.user_ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_account_id uuid REFERENCES public.paper_accounts(id) ON DELETE SET NULL,
  ai_enabled boolean NOT NULL DEFAULT true,
  agent_mode text NOT NULL DEFAULT 'swing_max',
  allocation_mode text NOT NULL DEFAULT 'high_conviction_swing',
  risk_profile text NOT NULL DEFAULT 'balanced',
  target_exposure_pct numeric NOT NULL DEFAULT 0.45,
  max_exposure_pct numeric NOT NULL DEFAULT 0.60,
  max_active_positions int NOT NULL DEFAULT 4,
  max_new_entries_per_day int NOT NULL DEFAULT 2,
  max_trades_per_day int NOT NULL DEFAULT 4,
  max_trades_per_symbol_per_week int NOT NULL DEFAULT 1,
  min_trade_quality_score numeric NOT NULL DEFAULT 78,
  min_risk_reward numeric NOT NULL DEFAULT 2.0,
  risk_per_trade_pct numeric NOT NULL DEFAULT 0.005,
  min_position_weight_pct numeric NOT NULL DEFAULT 0.04,
  max_position_weight_pct numeric NOT NULL DEFAULT 0.08,
  use_swing_max boolean NOT NULL DEFAULT true,
  use_recovery_mode boolean NOT NULL DEFAULT true,
  use_symbol_cooldown boolean NOT NULL DEFAULT true,
  use_strategy_kill_switch boolean NOT NULL DEFAULT true,
  use_trailing_stop boolean NOT NULL DEFAULT true,
  use_partial_take_profit boolean NOT NULL DEFAULT false,
  allow_pyramiding boolean NOT NULL DEFAULT false,
  allow_average_down boolean NOT NULL DEFAULT false,
  preferred_holding_days_min int NOT NULL DEFAULT 2,
  preferred_holding_days_max int NOT NULL DEFAULT 5,
  max_holding_days int NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_ai_settings TO authenticated;
GRANT ALL ON public.user_ai_settings TO service_role;
ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ai_settings_owner_or_admin_all" ON public.user_ai_settings;
CREATE POLICY "user_ai_settings_owner_or_admin_all" ON public.user_ai_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_user_ai_settings_updated_at ON public.user_ai_settings;
CREATE TRIGGER trg_user_ai_settings_updated_at
  BEFORE UPDATE ON public.user_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Extend handle_new_user to also create user_ai_settings + initial paper_balance_events
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_starting_balance numeric;
  v_currency text;
  v_lang text;
  v_mode text;
  v_account_id uuid;
BEGIN
  SELECT default_starting_balance, default_currency, default_language, default_ai_agent_mode
    INTO v_starting_balance, v_currency, v_lang, v_mode
    FROM public.app_settings WHERE id = true;

  INSERT INTO public.profiles (id, email, full_name, display_name, status, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'active', false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_settings (user_id, language, currency, ai_agent_mode)
  VALUES (NEW.id, COALESCE(v_lang,'id'), COALESCE(v_currency,'IDR'), COALESCE(v_mode,'swing_max'))
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.paper_accounts (user_id, starting_balance, cash, equity, currency, account_name, status, is_default)
  SELECT NEW.id, COALESCE(v_starting_balance, 100000000), COALESCE(v_starting_balance, 100000000),
         COALESCE(v_starting_balance, 100000000), COALESCE(v_currency,'IDR'),
         'Akun Paper Trading Utama', 'active', true
  WHERE NOT EXISTS (SELECT 1 FROM public.paper_accounts WHERE user_id = NEW.id)
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM public.paper_accounts WHERE user_id = NEW.id LIMIT 1;
  END IF;

  INSERT INTO public.user_ai_settings (user_id, paper_account_id, agent_mode)
  VALUES (NEW.id, v_account_id, COALESCE(v_mode,'swing_max'))
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.paper_balance_events (user_id, paper_account_id, event_type, new_balance, new_equity, reason, created_by)
  VALUES (NEW.id, v_account_id, 'initial_created', COALESCE(v_starting_balance,100000000),
          COALESCE(v_starting_balance,100000000), 'Akun paper trading awal dibuat saat registrasi', NEW.id);

  RETURN NEW;
END;
$function$;

-- 5. Backfill user_ai_settings for existing auth.users that don't have one
INSERT INTO public.user_ai_settings (user_id, paper_account_id)
SELECT u.id, pa.id
FROM auth.users u
LEFT JOIN public.paper_accounts pa ON pa.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM public.user_ai_settings s WHERE s.user_id = u.id);
