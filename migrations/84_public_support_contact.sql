-- ════════════════════════════════════════════════════════════════════════
-- Migration 84 — Public support contact (anon read for 2 whitelisted keys)
-- ════════════════════════════════════════════════════════════════════════
-- Goal: landing.html footer + privacy.html (both anon public pages) display
-- the platform support email + WhatsApp phone. Both values already live in
-- platform_settings and are editable from admin.html (Phase X11 Section H).
-- What was missing: anon SELECT access — RLS on platform_settings is
-- admin-only (M33) + tenant-read for 2 keys (M42). This migration adds a
-- third, strictly-whitelisted anon read policy (pattern copied from
-- p_platform_settings_tenant_read in M42) + seeds support_email so the row
-- exists before the admin ever saves it (ON CONFLICT DO NOTHING — an
-- already-saved admin value is never overwritten).
--
-- Zero schema changes. Zero financial surface. Reversible: DROP POLICY.

-- 1) Seed support_email (support_phone seeded since M33 — untouched here).
INSERT INTO public.platform_settings (key, value)
VALUES ('support_email', 'drayhamghnaim@gmail.com')
ON CONFLICT (key) DO NOTHING;

-- 2) Anon read policy — ONLY the two public contact keys. Every other
--    platform_settings row (payment instructions, platform_name, renewal
--    message, …) remains invisible to anon.
DROP POLICY IF EXISTS p_platform_settings_anon_public_read ON public.platform_settings;

CREATE POLICY p_platform_settings_anon_public_read
  ON public.platform_settings
  FOR SELECT TO anon
  USING (key IN ('support_phone', 'support_email'));

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run AFTER apply)
-- ════════════════════════════════════════════════════════════════════════
-- 1) Seed row exists (value shown only to admin session; count works anywhere):
--    SELECT count(*) FROM public.platform_settings
--    WHERE key IN ('support_phone','support_email');
--    Expected: 2
--
-- 2) Policy count on platform_settings (rule #238 — MANDATORY):
--    SELECT count(*) FROM pg_policies
--    WHERE schemaname='public' AND tablename='platform_settings';
--    Expected: 4
--    (admin_read + admin_write [M33] + tenant_read [M42] + anon_public_read [M84])
--
-- 3) Policy names sanity:
--    SELECT policyname, roles, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='platform_settings'
--    ORDER BY policyname;
