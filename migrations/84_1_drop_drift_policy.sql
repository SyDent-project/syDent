-- ════════════════════════════════════════════════════════════════════════
-- Migration 84.1 — Drop out-of-tree duplicate policy (schema-drift cleanup)
-- ════════════════════════════════════════════════════════════════════════
-- Discovered during M84 verification: pg_policies counted 5 on
-- platform_settings while the migration tree defines 4. The extra policy —
-- p_platform_settings_public_support_phone (TO authenticated, SELECT,
-- key='support_phone') — exists only in the live DB (created manually via
-- dashboard at some point, never entered the tree).
--
-- Security assessment: harmless. Not anon; a strict subset of
-- p_platform_settings_tenant_read (M42: support_phone +
-- payment_instructions_ar). Dropping it has ZERO behavioral change —
-- authenticated reads of support_phone remain covered by tenant_read.
-- Purpose of this migration: restore tree == live-DB parity so rule #238
-- policy counts stay meaningful.

DROP POLICY IF EXISTS p_platform_settings_public_support_phone
  ON public.platform_settings;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run AFTER apply) — rule #238
-- ════════════════════════════════════════════════════════════════════════
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname='public' AND tablename='platform_settings';
-- Expected: 4
-- (admin_read + admin_write [M33] + tenant_read [M42] + anon_public_read [M84])
