-- Migration 218 — the demo patient card is deleted for the whole account, not per browser
--
-- Purpose
--   The «🧪 مريض تجريبي» row in the patients list stays until the dentist deletes it
--   (owner's request, 19 Nov 2026). Until now «✕ حذف» only set a localStorage flag, so the
--   row came back on every other phone/laptop. The owner asked for the deletion to be final
--   for the account. This column records it once, on the clinic's settings row.
--
--   It only HIDES the row in patients.html. The demo card itself (patient-profile.html?id=demo,
--   an in-memory sandbox, no DB row) stays reachable — the «🧭 جولة مفصّلة» button on every
--   real patient card opens it directly.
--
-- Shape
--   Additive, idempotent, nullable, no default: NULL = shown, a timestamp = deleted at.
--   Existing inserts/upserts to clinic_settings omit it → NULL → nothing changes for anyone.
--
-- RLS
--   No policy change. The owner already reads + writes their own clinic_settings row
--   (clinic_settings_owner_all) and sub_gate_update keeps read-only subscriptions out.
--
-- Deploy order
--   Apply before the matching patients.html deploy. If the client runs without it, the
--   column is simply absent from the select('*') row and the page keeps the per-browser flag.
--
-- Rollback
--   ALTER TABLE public.clinic_settings DROP COLUMN IF EXISTS demo_patient_hidden_at;

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS demo_patient_hidden_at timestamptz;

COMMENT ON COLUMN public.clinic_settings.demo_patient_hidden_at IS
  'When the owner deleted the demo patient row from the patients list (NULL = still shown). Hides the row only; the demo card stays reachable from «جولة مفصّلة».';

-- ───── Verification ────────────────────────────────────────────────────────────
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='clinic_settings'
--      AND column_name='demo_patient_hidden_at';
--   → demo_patient_hidden_at | timestamp with time zone | YES | NULL
