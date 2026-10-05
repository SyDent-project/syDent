-- ============================================================================
-- Migration 80 — staff_messages (internal staff messaging, message + ack)
-- ============================================================================
-- WHY:
--   SyDent uses a single-login multi-staff architecture (rule #82): one auth
--   account per clinic, staff switch roles via PIN (SyDentLock). Reception
--   and the treating doctor work on different devices under the SAME account
--   and need short in-app coordination messages ("المريض التالي جاهز",
--   "تعال للاستقبال") without leaving the system.
--
-- PATTERN (competitor research — OpenDental Messaging, NOT Tasks/chat):
--   Short directed message + acknowledge. Sender identity is a snapshot of
--   the current SyDentLock employee — exactly the audit_log convention
--   (employee_id + name/role snapshots). target_role NULL = broadcast.
--
-- SAFETY (verified against Accounting Reference v1.2 + live code):
--   - ZERO financial contact: no ledger_*, no payment columns, no reports
--     read this table. Identity Tests A–E untouched.
--   - ONLINE-ONLY v1: table is deliberately NOT added to the PWA outbox
--     whitelist (appointments|audit_log|ledger_payments). Offline writes hit
--     the existing Arabic firewall — correct by design (guard v2 untouched).
--   - RLS: single owner_all policy, byte-pattern of M58 (post_op_notes).
--   - sender_employee_id carries NO FK (snapshot model, mirrors audit_log —
--     deleting an employee must never break message history).
--   - patient_id optional, ON DELETE SET NULL (mirrors audit_log.patient_id);
--     patient_name snapshot preserves display after deletion.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

BEGIN;

-- 1) Table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_employee_id UUID,
  sender_name        TEXT NOT NULL,
  sender_role        TEXT,
  target_role        TEXT CHECK (target_role IN ('owner','doctor','secretary')),
  body               TEXT NOT NULL CHECK (char_length(body) <= 300),
  patient_id         UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name       TEXT,
  acked_at           TIMESTAMPTZ,
  acked_by_name      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) RLS (M58 pattern — owner sees/writes own tenant rows only) ----------
ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_messages_owner_all" ON public.staff_messages;
CREATE POLICY "staff_messages_owner_all" ON public.staff_messages
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 3) Indexes -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_messages_owner_created
  ON public.staff_messages (owner_id, created_at DESC);

-- Partial index feeds the unacked badge count cheaply.
CREATE INDEX IF NOT EXISTS idx_staff_messages_unacked
  ON public.staff_messages (owner_id) WHERE acked_at IS NULL;

COMMIT;

-- ============================================================================
-- Verification (run after COMMIT):
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff_messages') AS cols,
  (SELECT COUNT(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'staff_messages')    AS policies,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'staff_messages')    AS indexes;
-- Expected: cols = 12 · policies = 1 · indexes = 3 (PK + 2 above)
