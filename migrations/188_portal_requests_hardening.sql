-- ════════════════════════════════════════════════════════════════════
-- Migration 188 — بوابةُ المريض: تحصينُ ما أضافته M187 (مراجعةُ المالك للبند ② · v629)
-- Date: 13 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (Supabase security + performance advisors on the live DB after v628):
--   1) _portal_requests_close() — a trigger function — was EXECUTE-able by anon/authenticated through
--      /rest/v1/rpc: «REVOKE … FROM PUBLIC» does not remove Supabase's default direct grants to those roles.
--      Not exploitable (a trigger function cannot run outside a trigger) but it must not be exposed —
--      same treatment as _login_resolve_bump / sydent_split_identity_check.
--   2) portal_requests.patient_id (FK, ON DELETE CASCADE) had no covering index ⇒ deleting a patient scans
--      the table; appointment_id (FK, ON DELETE SET NULL) only had a PARTIAL index (open rows) ⇒ same.
-- ROLLBACK: DROP INDEX IF EXISTS public.idx_portal_requests_patient, public.idx_portal_requests_appt;
--           GRANT EXECUTE ON FUNCTION public._portal_requests_close() TO anon, authenticated;
-- ════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public._portal_requests_close() FROM anon, authenticated, public;

CREATE INDEX IF NOT EXISTS idx_portal_requests_patient ON public.portal_requests (patient_id);
CREATE INDEX IF NOT EXISTS idx_portal_requests_appt    ON public.portal_requests (appointment_id);
