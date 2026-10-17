-- ════════════════════════════════════════════════════════════════════
-- Migration 184 — الحجزُ العام يقبل الأرقامَ العربية بالهاتف (v622)
-- Date: 12 October 2026 | Idempotent: yes (CREATE OR REPLACE) | Applied via Supabase MCP
--
-- WHY: found while auditing for non-obvious bugs. A patient typing the phone on an Arabic keyboard
-- (٠٩٣٣…, the default digits on many Syrian phones) could not book: the server stripped every
-- character outside 0-9 ⇒ empty ⇒ bad_phone. translate() maps Arabic-Indic and Persian digits first.
-- The page converts too (book.html toLatinDigits, v622); this layer also covers a stale cached page.
-- One line changed versus the live definition; signature, grants and behaviour otherwise identical.
-- ROLLBACK: drop the translate() wrapper on the v_phone line.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.booking_create_request(p_clinic uuid, p_name text, p_phone text, p_date date, p_time time without time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_info    RECORD;
  v_now_dam TIMESTAMP;
  v_phone   TEXT;
  v_name    TEXT;
  v_days    INT[];
  v_new_id  UUID;
BEGIN
  SELECT * INTO v_info FROM public.booking_clinic_info(p_clinic);
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_disabled'; END IF;

  v_name  := btrim(COALESCE(p_name, ''));
  -- M184 (v622): Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Latin before stripping; an Arabic keyboard's default
  -- digits were stripped as non-digits ⇒ bad_phone, so the patient could not book.
  v_phone := regexp_replace(translate(COALESCE(p_phone,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g');
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'bad_name'; END IF;
  IF v_phone !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'bad_phone'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 300 THEN RAISE EXCEPTION 'bad_note'; END IF;
  IF p_date IS NULL OR p_time IS NULL THEN RAISE EXCEPTION 'bad_slot'; END IF;

  SELECT br.id INTO v_new_id FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.phone = v_phone
    AND br.requested_date = p_date AND br.requested_time = p_time
    AND br.status = 'pending' LIMIT 1;
  IF v_new_id IS NOT NULL THEN RETURN v_new_id; END IF;

  v_now_dam := (now() AT TIME ZONE 'Asia/Damascus');
  IF p_date < v_now_dam::date
     OR p_date > v_now_dam::date + v_info.max_days_ahead THEN
    RAISE EXCEPTION 'date_out_of_range';
  END IF;
  IF p_date = v_now_dam::date AND p_time <= v_now_dam::time THEN
    RAISE EXCEPTION 'past_time';
  END IF;

  v_days := string_to_array(regexp_replace(v_info.work_days, '\s', '', 'g'), ',')::int[];
  IF NOT (EXTRACT(DOW FROM p_date)::int = ANY (v_days)) THEN
    RAISE EXCEPTION 'closed_day';
  END IF;
  IF p_time < v_info.work_start OR p_time >= v_info.work_end THEN
    RAISE EXCEPTION 'outside_hours';
  END IF;
  IF (v_info.work_end - p_time) < make_interval(mins => v_info.slot_minutes) THEN
    RAISE EXCEPTION 'outside_hours';
  END IF;
  IF (EXTRACT(EPOCH FROM (p_time - v_info.work_start))::int
      % (v_info.slot_minutes * 60)) <> 0 THEN
    RAISE EXCEPTION 'off_grid';
  END IF;

  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic AND br.phone = v_phone
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 3 THEN
    RAISE EXCEPTION 'rate_phone';
  END IF;
  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 40 THEN
    RAISE EXCEPTION 'rate_clinic';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.doctor_id = p_clinic
      AND a.is_planned IS NOT TRUE
      AND a.date = p_date AND a.time IS NOT NULL
      AND a.status NOT IN ('cancelled','broken','no_show')
      AND a.time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < a.time + make_interval(mins => COALESCE(a.duration, 30))
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_requests br
    WHERE br.clinic_id = p_clinic AND br.status = 'pending'
      AND br.requested_date = p_date
      AND br.requested_time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < br.requested_time + make_interval(mins => br.duration)
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_blocked_slots(p_clinic, p_date, p_date) bs
    WHERE bs.d = p_date
      AND bs.t < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < bs.t + make_interval(mins => bs.dur)
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  BEGIN
    INSERT INTO public.booking_requests
      (clinic_id, patient_name, phone, requested_date, requested_time, duration, note)
    VALUES
      (p_clinic, v_name, v_phone, p_date, p_time, v_info.slot_minutes,
       NULLIF(btrim(COALESCE(p_note,'')), ''))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken';
  END;

  RETURN v_new_id;
END; $function$;
