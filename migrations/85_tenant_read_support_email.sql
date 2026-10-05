-- ════════════════════════════════════════════════════════════════════════
-- Migration 85 — tenant read for support_email
-- ════════════════════════════════════════════════════════════════════════
-- subscription.html (authenticated tenant page) shows a support card with
-- WhatsApp + email. Anon pages already read both contact keys (M84), but
-- the tenant whitelist (M42) only allowed support_phone +
-- payment_instructions_ar → the support_email row was silently filtered
-- by RLS for logged-in clinics and the email button never appeared.
--
-- Fix: recreate p_platform_settings_tenant_read with support_email added.
-- Zero schema changes. Admins unaffected (they read via admin_read, M33).
-- Reversible: recreate the policy with the previous 2-key list.

DROP POLICY IF EXISTS p_platform_settings_tenant_read ON public.platform_settings;

CREATE POLICY p_platform_settings_tenant_read
  ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key IN ('support_phone', 'support_email', 'payment_instructions_ar'));

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run AFTER apply)
-- ════════════════════════════════════════════════════════════════════════
-- 1) Policy count on platform_settings (rule #238 — MANDATORY):
--    SELECT count(*) FROM pg_policies
--    WHERE schemaname='public' AND tablename='platform_settings';
--    Expected: 4
--    (admin_read + admin_write [M33] + tenant_read [M42→M85] + anon_public_read [M84])
--
-- 2) USING clause now includes support_email:
--    SELECT policyname, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='platform_settings'
--      AND policyname = 'p_platform_settings_tenant_read';
