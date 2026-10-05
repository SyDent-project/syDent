-- ============================================================================
-- Migration 81 — clinic_settings.staff_msg_presets (editable quick buttons)
-- ============================================================================
-- WHY:
--   OpenDental's Message Elements come preset AND are owner-customizable
--   (Setup > Manage > Messaging). SyDent adopts the same: the four built-in
--   quick buttons of the internal-messaging widget (Migration 80) become
--   editable from settings.html.
--
-- DESIGN:
--   - JSONB array of strings, e.g. ["المريض التالي جاهز","المريض وصل"].
--   - NULL = use the built-in defaults (grandfather: zero behavior change
--     for existing tenants until the owner customizes).
--   - Sanitize rules live client-side in ONE place (sidebar.js:
--     SyDentMsgs._sanitizePresets — max 6 buttons, 60 chars each, deduped);
--     settings.html reuses it. No mirrors.
--   - Editing surface is settings.html, which is structurally owner-only
--     (BLOCKED map) — same gate as OpenDental's "Setup" permission.
--
-- SAFETY:
--   - Additive nullable column on an existing owner-RLS table. The existing
--     clinic_settings owner policy covers it — no policy changes.
--   - Zero financial contact.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS staff_msg_presets JSONB;

COMMIT;

-- ============================================================================
-- Verification (run after COMMIT):
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='clinic_settings'
       AND column_name='staff_msg_presets')                        AS col_added,
  (SELECT COUNT(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='clinic_settings')    AS policies;
-- Expected: col_added = 1 · policies = نفس العدد قبل الميغريشن (بلا تغيير، ≥ 1)
-- (درس حادثة M80: عدّاد pg_policies إلزامي بذيل كل migration)
