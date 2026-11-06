-- 198 — Restore the API-role grants the bootstrap dump lost (6 Nov 2026 review)
--
-- db/schema.sql (pg_dump) expresses each function's ACL as
--   REVOKE ALL ON FUNCTION f FROM PUBLIC;  GRANT ... TO <roles>;
-- That is correct on a bare Postgres, but a Supabase project ships with
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- so every CREATE FUNCTION in the dump was granted to anon + authenticated *explicitly* the moment it
-- was created, and "REVOKE … FROM PUBLIC" does not touch those explicit grants. Result on dental-prod:
-- 36 SECURITY DEFINER functions callable by anon (Supabase security advisor), among them
-- _login_resolve_bump (rate-limit buckets could be flooded by anyone → login-by-phone lock-out) and
-- tenant_access_level(uuid) (subscription state of any user id). Functions created by the numbered
-- migrations that ran *after* the dump (inventory_*, bridge_*, portal_xray_list …) are fine, because
-- those migrations revoke from anon/authenticated by name.
--
-- Every function below is SECURITY DEFINER-guarded by auth.uid() or is only called from other
-- SECURITY DEFINER functions (owned by postgres), so no app path loses access; this only restores
-- what migrations 137/141/… had already decided and what the old production ran for months.
-- my_access_level() (260 RLS policies) and is_platform_admin() (15 policies) keep `authenticated`.
-- service_role is never touched. Idempotent; each statement is skipped if the function is absent.

DO $$
DECLARE r record; r2 record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('_login_resolve_bump', 'anon, authenticated'),   -- keep: service_role
    ('_sub_guard_table', 'anon, authenticated'),   -- keep: service_role
    ('begin_account_wipe', 'anon'),   -- keep: authenticated, service_role
    ('delete_my_account', 'anon'),   -- keep: authenticated, service_role
    ('detect_audit_alerts', 'anon, authenticated'),   -- keep: service_role
    ('enforce_employee_limit', 'anon, authenticated'),   -- keep: service_role
    ('enforce_patient_limit', 'anon, authenticated'),   -- keep: service_role
    ('fn_teeth_status_history', 'anon, authenticated'),   -- keep: service_role
    ('handle_new_doctor', 'anon, authenticated'),   -- keep: service_role
    ('handle_new_owner_doctor', 'anon, authenticated'),   -- keep: service_role
    ('my_access_level', 'anon'),   -- keep: authenticated, service_role
    ('my_storage_object_count', 'anon'),   -- keep: authenticated, service_role
    ('my_subscription_state', 'anon'),   -- keep: authenticated, service_role
    ('my_wipe_open', 'anon'),   -- keep: authenticated, service_role
    ('realloc_patient_splits', 'anon'),   -- keep: authenticated, service_role
    ('sydent_clinic_name_source_maint', 'anon, authenticated'),   -- keep: service_role
    ('sydent_currency_guard', 'anon, authenticated'),   -- keep: service_role
    ('sydent_log_clinic_name_change', 'anon, authenticated'),   -- keep: service_role
    ('sydent_log_owner_name_change', 'anon, authenticated'),   -- keep: service_role
    ('sydent_split_currency_guard', 'anon, authenticated'),   -- keep: service_role
    ('sydent_split_identity_check', 'anon, authenticated'),   -- keep: service_role
    ('sync_doctor_card_active', 'anon, authenticated'),   -- keep: service_role
    ('tenant_access_level', 'anon, authenticated'),   -- keep: service_role
    ('touch_presence', 'anon')   -- keep: authenticated, service_role
  ) AS t(fn, roles)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = r.fn) THEN
      RAISE NOTICE '198: public.% not found — skipped', r.fn;
    END IF;
    FOR r2 IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = r.fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', r2.sig, r.roles);
    END LOOP;
  END LOOP;
END $$;

-- Verification (expect 0 rows):
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN ('_login_resolve_bump','tenant_access_level','_sub_guard_table')
--    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
