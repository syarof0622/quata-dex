-- ============================================================================
-- MULTI-USER MIGRATION: drop single-tenant model, add real auth + RBAC + RLS
-- ============================================================================

-- --- 0. Cleanup placeholder rows that block FK creation ---------------------
DELETE FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.profiles   WHERE id      = '00000000-0000-0000-0000-000000000001'::uuid;

-- --- 1. Extend profiles -----------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email                  text,
  ADD COLUMN IF NOT EXISTS username                text,
  ADD COLUMN IF NOT EXISTS full_name               text,
  ADD COLUMN IF NOT EXISTS avatar_url              text,
  ADD COLUMN IF NOT EXISTS status                  text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS must_change_password    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at              timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check CHECK (status IN ('active','suspended','pending'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles ((lower(username))) WHERE username IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fk_auth_users
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN invalid_foreign_key THEN NULL; END $$;

-- --- 2. user_roles FK to auth.users -----------------------------------------
DO $$ BEGIN
  ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_id_fk_auth_users
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN invalid_foreign_key THEN NULL; END $$;

-- Add 'suspended' to app_role enum if missing
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'suspended';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- 3. New tables ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  language      text NOT NULL DEFAULT 'id',
  theme         text NOT NULL DEFAULT 'dark',
  timezone      text NOT NULL DEFAULT 'Asia/Jakarta',
  currency      text NOT NULL DEFAULT 'IDR',
  risk_profile  text NOT NULL DEFAULT 'balanced',
  ai_agent_mode text NOT NULL DEFAULT 'swing_max',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid,
  target_user_id  uuid,
  action          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_audit_logs_target_idx ON public.user_audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_audit_logs_actor_idx  ON public.user_audit_logs(actor_user_id, created_at DESC);
GRANT SELECT ON public.user_audit_logs TO authenticated;
GRANT ALL ON public.user_audit_logs TO service_role;
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
  registration_enabled     boolean NOT NULL DEFAULT true,
  default_starting_balance numeric NOT NULL DEFAULT 100000000,
  default_currency         text    NOT NULL DEFAULT 'IDR',
  default_ai_agent_mode    text    NOT NULL DEFAULT 'swing_max',
  default_language         text    NOT NULL DEFAULT 'id',
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL    ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- --- 4. Helper functions (SECURITY DEFINER to avoid recursive RLS) ---------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_suspended(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'suspended'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_suspended(uuid)              TO anon, authenticated, service_role;

-- --- 5. Trigger: on new auth.users → create profile + role + settings + paper account ---
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_starting_balance numeric;
  v_currency text;
  v_lang text;
  v_mode text;
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
    'active',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_settings (user_id, language, currency, ai_agent_mode)
  VALUES (NEW.id, COALESCE(v_lang,'id'), COALESCE(v_currency,'IDR'), COALESCE(v_mode,'swing_max'))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.paper_accounts (user_id, starting_balance, cash, currency, account_name)
  SELECT NEW.id, COALESCE(v_starting_balance, 100000000), COALESCE(v_starting_balance, 100000000), COALESCE(v_currency,'IDR'), 'Akun Paper Trading Utama'
  WHERE NOT EXISTS (SELECT 1 FROM public.paper_accounts WHERE user_id = NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --- 6. Trigger: block users from changing role/status via profile update ---
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role bypasses RLS but trigger still runs. Admins (via app code) use service path.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.status               := OLD.status;
    NEW.must_change_password := OLD.must_change_password;
    NEW.email                := OLD.email;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_priv_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_priv_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- 7. Drop ALL old single-tenant policies ---------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'own_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- --- 8. Profiles: new policies ---------------------------------------------
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()))
                              WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));
-- INSERT/DELETE only via trigger / service role.

-- --- 9. user_roles: new policies -------------------------------------------
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY user_roles_read_self ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY user_roles_super_admin_manage ON public.user_roles
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
                           WITH CHECK (public.is_super_admin(auth.uid()));

-- --- 10. User-scoped tables (user_id column) -------------------------------
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'ai_trade_agents','alerts','backtests','paper_accounts','paper_orders','paper_positions',
  'portfolio_holdings','portfolio_intelligence_snapshots','portfolio_scenario_results',
  'position_attribution_snapshots','recent_searches','strategies','trade_journal','watchlist',
  'strategy_health','symbol_trade_cooldowns'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()))',
                   t || '_owner_or_admin_all', t);
  END LOOP;
END $$;

-- --- 11. Tables owned via paper_account_id ---------------------------------
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY['portfolio_equity_snapshots','portfolio_risk_snapshots'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (paper_account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
      WITH CHECK (paper_account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))$f$,
      t || '_owner_or_admin_all', t);
  END LOOP;
END $$;

-- --- 12. Tables owned via agent_id (ai_trade_agents) -----------------------
-- Drop existing auth_read_* read-all-authenticated policies and replace with per-owner.
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'ai_agent_decisions','ai_agent_performance','ai_agent_risk_logs',
  'ai_agent_scans','ai_agent_scan_candidates','ai_agent_trade_memory',
  'ai_agent_training_events','swing_trade_plans','position_exit_plans'
];
DECLARE owner_col text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop old auth_read_*/deny_public_* policies on this table
    EXECUTE format('DO $i$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname=%L AND tablename=%L LOOP EXECUTE format(%L, p.policyname, %L, %L); END LOOP; END $i$',
      'public', t, 'DROP POLICY IF EXISTS %I ON %I.%I', 'public', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- owned via agent_id if present, else (position_exit_plans has account_id too — agent_id preferred)
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
      WITH CHECK (agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))$f$,
      t || '_owner_or_admin_all', t);
  END LOOP;
END $$;

-- --- 13. user_settings policies --------------------------------------------
CREATE POLICY user_settings_owner_or_admin ON public.user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- --- 14. user_audit_logs policies (admin read; service writes) -------------
CREATE POLICY audit_logs_admin_read ON public.user_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- --- 15. app_settings: everyone reads (used on signup page); super_admin writes ---
CREATE POLICY app_settings_read_all ON public.app_settings
  FOR SELECT USING (true);
CREATE POLICY app_settings_super_admin_update ON public.app_settings
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()))
                              WITH CHECK (public.is_super_admin(auth.uid()));

-- --- 16. profile updated_at trigger ----------------------------------------
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- 17. app_settings updated_at trigger -----------------------------------
DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
