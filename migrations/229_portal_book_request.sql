-- ═════════════════════════════════════════════════════════════════════
-- Migration 229 — حجزُ موعدٍ من بوابة المريض (portal booking request)
-- Date: 27 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: the owner asked (27/11) that a patient with no upcoming appointment can
-- request one from his portal, and that the request reaches the clinic «the
-- same way as the booking link» — i.e. into booking_requests, where the
-- appointments page already confirms / edits / rejects it (P5).
--
-- Model:
--   • booking_requests.source  — 'web' (book.html, every existing row) | 'portal'.
--   • booking_requests.patient_id — the portal patient's card (ON DELETE SET NULL);
--     the reception side links the confirmed appointment to it without asking.
--   • phone may be '' for a portal row only (a card may have no phone — the
--     clinic knows who he is); book.html rows keep the strict phone CHECK.
--   • portal_book_slots(token)  — STABLE read: is booking open for him, his
--     pending request (if any), a rejection in the last 7 days, and the free
--     slots (the same _portal_free_slots grid the change picker uses, M189/M223).
--   • portal_book_request(token, date, time, note) — the portal's fourth narrow
--     write: only with no upcoming appointment and no pending request, a live
--     link, an open clinic, appointments shown and online booking enabled; the
--     slot re-validated under the same per-clinic-and-day lock as M189;
--     3 requests / patient / 24 h and the clinic's 40 / day cap of book.html.
--   • Every request is logged (audit_log + patient_messages «المراسلات»).
--   book.html and booking_create_request are untouched.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.portal_book_request(text, date, time, text);
--   DROP FUNCTION IF EXISTS public.portal_book_slots(text);
--   ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_phone_check;
--   DELETE FROM public.booking_requests WHERE source = 'portal' AND phone = '';
--   ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_phone_check CHECK (phone ~ '^\+?[0-9]{8,15}$');
--   ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_source_check;
--   ALTER TABLE public.booking_requests DROP COLUMN IF EXISTS patient_id, DROP COLUMN IF EXISTS source;
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) columns ──────────────────────────────────────────────────────────
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_source_check;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_source_check CHECK (source IN ('web', 'portal'));
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_phone_check;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_phone_check
  CHECK (phone ~ '^\+?[0-9]{8,15}$' OR (source = 'portal' AND phone = ''));
CREATE INDEX IF NOT EXISTS idx_booking_requests_patient ON public.booking_requests (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;

-- ── 2) the read: open? pending? rejected? free slots ────────────────────
CREATE OR REPLACE FUNCTION public.portal_book_slots(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v       RECORD;
  bi      RECORD;
  r       RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_days  JSONB;
  v_rej   BOOLEAN := false;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT pp.owner_id, pp.patient_id INTO v FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  IF NOT COALESCE((SELECT c.portal_show_appts FROM public.clinic_settings c WHERE c.owner_id = v.owner_id), true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;
  SELECT * INTO bi FROM public.booking_clinic_info(v.owner_id) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;

  IF EXISTS (SELECT 1 FROM public.appointments x
              WHERE x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
                AND x.date >= v_today AND COALESCE(x.status, 'pending') NOT IN ('cancelled', 'broken', 'completed', 'no_show')) THEN
    RETURN jsonb_build_object('ok', true, 'has_appt', true);
  END IF;

  SELECT br.requested_date AS d, br.requested_time AS t INTO r FROM public.booking_requests br
   WHERE br.clinic_id = v.owner_id AND br.patient_id = v.patient_id AND br.status = 'pending'
   ORDER BY br.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'pending', jsonb_build_object('d', r.d, 't', to_char(r.t, 'HH24:MI')));
  END IF;

  -- the clinic rejected his latest portal request in the last 7 days ⇒ the page says so (like M191)
  SELECT (br.status = 'rejected' AND br.reviewed_at > now() - interval '7 days') AS rej INTO r FROM public.booking_requests br
   WHERE br.clinic_id = v.owner_id AND br.patient_id = v.patient_id
   ORDER BY br.created_at DESC LIMIT 1;
  IF FOUND THEN v_rej := COALESCE(r.rej, false); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('d', q.d, 'times', q.times) ORDER BY q.d), '[]'::jsonb) INTO v_days
    FROM (SELECT f.d, jsonb_agg(to_char(f.t, 'HH24:MI') ORDER BY f.t) AS times
            FROM public._portal_free_slots(v.owner_id, '00000000-0000-0000-0000-000000000000'::uuid, bi.slot_minutes,
                                           v_today, v_today + LEAST(GREATEST(COALESCE(bi.max_days_ahead, 30), 1), 60)) f
           GROUP BY f.d) q;
  RETURN jsonb_build_object('ok', true, 'dur', bi.slot_minutes, 'rejected', v_rej, 'days', v_days);
END; $$;

REVOKE ALL ON FUNCTION public.portal_book_slots(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_book_slots(text) TO anon, authenticated;

-- ── 3) the write: one request into booking_requests ────────────────────
CREATE OR REPLACE FUNCTION public.portal_book_request(p_token TEXT, p_date DATE, p_time TIME, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v       RECORD;
  bi      RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note  TEXT;
  v_name  TEXT;
  v_phone TEXT;
  v_id    UUID;
  v_body  TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_date IS NULL OR p_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  SELECT pp.owner_id, pp.patient_id, p.name AS patient_name, p.phone AS patient_phone INTO v
    FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  IF NOT COALESCE((SELECT c.portal_show_appts FROM public.clinic_settings c WHERE c.owner_id = v.owner_id), true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;
  SELECT * INTO bi FROM public.booking_clinic_info(v.owner_id) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;

  -- one patient = one request at a time; only without an upcoming appointment
  PERFORM pg_advisory_xact_lock(hashtext('portal-book:' || v.owner_id::text || ':' || v.patient_id::text));
  IF EXISTS (SELECT 1 FROM public.appointments x
              WHERE x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
                AND x.date >= v_today AND COALESCE(x.status, 'pending') NOT IN ('cancelled', 'broken', 'completed', 'no_show')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'has_appt');
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_requests br
              WHERE br.clinic_id = v.owner_id AND br.patient_id = v.patient_id AND br.status = 'pending') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already');
  END IF;
  IF (SELECT count(*) FROM public.booking_requests br
       WHERE br.clinic_id = v.owner_id AND br.patient_id = v.patient_id AND br.created_at > now() - interval '24 hours') >= 3
     OR (SELECT count(*) FROM public.booking_requests br
          WHERE br.clinic_id = v.owner_id AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_today) >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  -- the slot: inside the window and still free (same grid and lock as the change picker, M189)
  IF p_date < v_today OR p_date > v_today + LEAST(GREATEST(COALESCE(bi.max_days_ahead, 30), 1), 60) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('portal-slot:' || v.owner_id::text || ':' || p_date::text));
  IF NOT EXISTS (SELECT 1 FROM public._portal_free_slots(v.owner_id, '00000000-0000-0000-0000-000000000000'::uuid, bi.slot_minutes, p_date, p_date) f
                  WHERE f.d = p_date AND f.t = p_time) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken');
  END IF;

  v_note  := NULLIF(left(btrim(regexp_replace(COALESCE(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), 300), '');
  v_name  := left(btrim(COALESCE(v.patient_name, '')), 80);
  IF char_length(v_name) < 2 THEN v_name := 'مريض'; END IF;
  v_phone := regexp_replace(translate(COALESCE(v.patient_phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g');
  IF v_phone !~ '^\+?[0-9]{8,15}$' THEN v_phone := ''; END IF;

  BEGIN
    INSERT INTO public.booking_requests (clinic_id, patient_name, phone, requested_date, requested_time, duration, note, source, patient_id)
    VALUES (v.owner_id, v_name, v_phone, p_date, p_time, bi.slot_minutes, v_note, 'portal', v.patient_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken');
  END;

  v_body := 'طلب المريض موعداً من بوابة المريض — ' || to_char(p_date, 'DD/MM/YYYY') || ' ' || to_char(p_time, 'HH24:MI')
            || COALESCE(' — ملاحظة: ' || v_note, '');
  INSERT INTO public.audit_log (owner_id, employee_id, employee_name_snapshot, employee_role_snapshot, action_type, entity_type, entity_id,
                                patient_id, patient_name_snapshot, description, old_value, new_value)
  VALUES (v.owner_id, NULL, 'المريض (بوابة المريض)', 'patient', 'appointment.portal_request', 'booking_request', v_id,
          v.patient_id, v.patient_name, v_body, NULL,
          jsonb_build_object('source', 'portal', 'kind', 'book', 'date', p_date, 'time', to_char(p_time, 'HH24:MI')));
  INSERT INTO public.patient_messages (owner_id, patient_id, kind, channel, body, sent_by)
  VALUES (v.owner_id, v.patient_id, 'portal', 'portal', v_body, 'المريض (البوابة)');

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

REVOKE ALL ON FUNCTION public.portal_book_request(text, date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_book_request(text, date, time, text) TO anon, authenticated;

COMMIT;
