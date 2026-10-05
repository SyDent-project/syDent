-- Migration 90 — ASAP / Waitlist flag (قائمة الانتظار — Backlog #5)
-- =========================================================================
-- OpenDental "ASAP List" / Dentrix Ascend ASAP-option parity: a boolean flag
-- on the appointment marking "patient wants an EARLIER slot". Display/reminder
-- layer only — zero scheduling automation:
--   * «⚡ الانتظار» topbar list = active appointments (scheduled OR planned)
--     with asap = true, planned-first then by date ascending.
--   * Freed-slot nudge: cancelling/deleting a dated active appointment shows
--     a toast with the count of candidates (planned, or dated later than the
--     freed slot) — filling the gap stays a human decision via WhatsApp.
-- Works for both scheduled and planned (undated) appointments.
-- NOT NULL DEFAULT false → all existing rows are simply "not on the list".
-- Additive + idempotent. Exposing an ASAP option on the public booking
-- portal touches book.html (never modified — hard rule) → out of scope.
-- =========================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS asap BOOLEAN NOT NULL DEFAULT false;

-- Hot query path: the waitlist button counts/lists per owner; partial index
-- keeps it free (flagged rows are a tiny fraction of all appointments).
CREATE INDEX IF NOT EXISTS idx_appointments_asap
  ON public.appointments(doctor_id) WHERE asap;

-- ── Verification (run tail — Rule #238) ─────────────────────────────────
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'asap')          AS asap_col,           -- expect boolean
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'appointments'
      AND indexname = 'idx_appointments_asap')                           AS asap_index,         -- expect 1
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'appointments')    AS appointments_policies;  -- expect unchanged
