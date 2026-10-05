-- ============================================================================
-- Migration 79 — lab_orders.session_id (link lab orders to a ledger session)
-- ============================================================================
-- WHY:
--   Orthodontic treatments (تقويم ثابت/متحرك/مثبّت) are saved as REGIONAL
--   ledger_sessions rows (tooth_num = NULL, arch scope). Every existing
--   lab-order path is tooth-anchored, so ortho had NO way to create a lab
--   order from its session — and therefore no way to record the ortho lab
--   cost. Linking by patient_id + tooth_num is impossible for regional rows
--   (tooth_num NULL, and a patient can have two arch appliances at once).
--
-- FIX (matches OpenDental: a lab case is anchored to the procedure):
--   Store session_id directly on lab_orders, populated at creation time by
--   the new "حفظ + إرسال لمخبر" button in the regional (ortho) flow — and,
--   as a bonus, by the existing tooth+lab flow (prostheses / spacer), which
--   now also passes the freshly created session's id.
--
-- SAFETY (verified against Accounting Reference v1.2 + live code):
--   - Clinic accounting UNAFFECTED: labsTotal = Σ lab_orders.cost filtered by
--     date_sent, and per-provider attribution reads provider_id (M73).
--     session_id is a clinical/navigation link only — no report reads it.
--     Identity Tests A–E untouched.
--   - Column nullable; ON DELETE SET NULL mirrors patient_media.session_id
--     (M50) and inventory_movements.session_id (M52). No RLS change
--     (lab_orders row policy already scopes by doctor_id).
--   - labs.html update payload uses named columns (PATCH semantics) and does
--     not include session_id → edits from labs.html never clear the link.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================================

BEGIN;

-- 1) Column ---------------------------------------------------------------
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS session_id UUID
  REFERENCES public.ledger_sessions(id) ON DELETE SET NULL;

-- 2) Index (patient-profile looks up lab orders by session) ----------------
CREATE INDEX IF NOT EXISTS idx_lab_orders_session_id
  ON public.lab_orders (session_id);

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — run after the migration):
-- ============================================================================
SELECT
  COUNT(*)                                        AS total_lab_orders,
  COUNT(session_id)                               AS linked_to_session,
  COUNT(*) FILTER (WHERE session_id IS NULL)      AS unlinked
FROM public.lab_orders;
