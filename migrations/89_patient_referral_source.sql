-- Migration 89 — Patient Referral Source (مصدر المريض — Backlog #4)
-- =========================================================================
-- Universal standard ("How did you hear about us?" — OpenDental Referrals /
-- Dentrix referral source category): the doctor's first real marketing tool.
-- Structured dropdowns capture ~70% attribution vs ~40% for verbal asking
-- (ADA research) — hence FIXED keys, not free text.
--
-- Keys are stable English identifiers in the DB; Arabic labels live in the
-- display layer (REFERRAL_SOURCE_DEFS — 2-copy byte-parity mirror across
-- patients.html ↔ patient-profile.html, guarded by scripts/check-mirrors.js).
-- Same philosophy as subscription tier codes: opaque stable IDs + display
-- names in the app layer.
--
-- NULL = source not recorded (all existing patients + optional field).
-- Additive + idempotent. 'booking' exists in the list for manual selection;
-- auto-tagging booking-portal patients touches the server-side booking RPC
-- and is deliberately deferred to a separate decision.
-- =========================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

-- CHECK on the fixed key set (guarded by name so re-runs are no-ops).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patients_referral_source_check'
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_referral_source_check
      CHECK (referral_source IS NULL OR referral_source IN
        ('friend','search','social','walk_in','doctor_referral','booking','other'));
  END IF;
END $$;

-- ── Verification (run tail — Rule #238) ─────────────────────────────────
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'patients'
      AND column_name = 'referral_source')                              AS referral_source_col,   -- expect text
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conname = 'patients_referral_source_check')                   AS source_check,          -- expect 1
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'patients')       AS patients_policies;     -- expect unchanged (same count as before this migration)
