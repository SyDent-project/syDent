-- ════════════════════════════════════════════════════════════════════
-- Migration 190 — بوابةُ المريض: «اعتماد الإلغاء» يلغي الموعد فعلاً (v632)
-- Date: 13 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner's live test): cancel mode «يصل كطلب — أنت تقرّر». The patient asked to cancel, the doctor tapped
-- «✓ تمّ» — which only closed the request — and the appointment stayed. One ambiguous button in front of a real
-- decision. Now the inbox offers «✅ اعتماد الإلغاء» / «✖ رفض الطلب».
--   • portal_request_cancel_approve(req) — SECURITY INVOKER: runs as the clinic user, so owner RLS + the
--     subscription gate apply (read-only accounts cannot). Atomic: the request must still be an open, not-applied
--     cancel request of this clinic, and its appointment still live; it writes exactly the clinic's cancel pair
--     (cancelled · cancelled_by_pt) and tags the note; the M187 trigger then closes the request. Returns what the
--     page needs for the activity log and the WhatsApp confirmation.
--   • clinic_settings.portal_msg_cancel_ok — the WhatsApp text after approving (NULL ⇒ default;
--     MIRROR settings.html ↔ appt-portal.js).
-- ROLLBACK: DROP FUNCTION public.portal_request_cancel_approve(uuid); ALTER TABLE public.clinic_settings DROP COLUMN portal_msg_cancel_ok;
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS portal_msg_cancel_ok TEXT;
ALTER TABLE public.clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_portal_msg_cancel_ok_len;
ALTER TABLE public.clinic_settings ADD CONSTRAINT clinic_settings_portal_msg_cancel_ok_len CHECK (portal_msg_cancel_ok IS NULL OR char_length(portal_msg_cancel_ok) <= 1000);
COMMENT ON COLUMN public.clinic_settings.portal_msg_cancel_ok IS 'البوابة: رسالةُ واتساب للمريض بعد اعتماد طلب إلغائه (M190).';

CREATE OR REPLACE FUNCTION public.portal_request_cancel_approve(p_req UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  r RECORD;
  a RECORD;
BEGIN
  IF p_req IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT * INTO r FROM public.portal_requests
   WHERE id = p_req AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF r.kind <> 'cancel' OR r.applied THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_a_request'); END IF;
  IF r.status <> 'new' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', r.status); END IF;
  SELECT id, status, confirmation_status, date, time INTO a FROM public.appointments
   WHERE id = r.appointment_id AND doctor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'appointment_gone'); END IF;
  IF COALESCE(a.status, 'pending') IN ('cancelled', 'completed', 'broken', 'no_show') THEN
    UPDATE public.portal_requests SET status = 'handled', handled_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_live', 'status', a.status);
  END IF;
  UPDATE public.appointments
     SET status = 'cancelled',
         confirmation_status = 'cancelled_by_pt',
         notes = concat_ws(E'\n', NULLIF(notes, ''), '[أُلغي بطلب المريض من البوابة' || COALESCE(' — السبب: ' || r.reason, '') || ']')
   WHERE id = a.id;
  -- the M187 trigger closed the request (status change to cancelled); make it explicit and idempotent
  UPDATE public.portal_requests SET status = 'handled', handled_at = COALESCE(handled_at, now()) WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'appointment_id', a.id, 'patient_id', r.patient_id, 'patient_name', r.patient_name_snapshot,
                            'date', a.date, 'time', to_char(a.time, 'HH24:MI'), 'prev_status', a.status, 'reason', r.reason);
END; $$;
REVOKE ALL ON FUNCTION public.portal_request_cancel_approve(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.portal_request_cancel_approve(uuid) TO authenticated;

COMMIT;
