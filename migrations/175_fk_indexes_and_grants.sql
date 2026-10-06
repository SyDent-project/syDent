-- 175 — Supabase advisor follow-ups (task B3)
--
-- Performance: cover the five foreign keys the advisor reports without an
-- index, so deletes on the parent rows and joins on these columns don't
-- scan the child tables.
--
-- Security: rls_auto_enable() is the event-trigger function Supabase adds
-- when a project is created with "Enable automatic RLS". It is not part of
-- SyDent's schema and has no business being reachable through
-- /rest/v1/rpc, so revoke it from the API roles (guarded: the function
-- only exists on projects created with that option).
--
-- The remaining advisor findings were reviewed and are intentional:
--   • SECURITY DEFINER callable by anon: booking_* (public booking portal),
--     resolve_login_email (pre-login, rate-limited via login_resolve_hits),
--     signup_identity_available (pre-signup check), is_platform_admin
--     (referenced by policies that anon evaluates).
--   • SECURITY DEFINER callable by authenticated: each function checks
--     auth.uid() and ownership itself (e.g. realloc_patient_splits,
--     begin_account_wipe, delete_my_account, my_*).
--   • login_resolve_hits has RLS with no policy on purpose: only the
--     SECURITY DEFINER rate limiter touches it.
--   • "Unused index" findings are an artefact of an empty dev database.
-- Idempotent: safe to re-run.

CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_owner_id ON public.inventory_count_lines (owner_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_provider_id ON public.inventory_movements (provider_id);
CREATE INDEX IF NOT EXISTS idx_patient_messages_patient_id    ON public.patient_messages (patient_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_operatory_id   ON public.schedule_blocks (operatory_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_provider_id    ON public.schedule_blocks (provider_id);

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
