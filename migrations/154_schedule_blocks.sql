-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 154 — الحجوزات المغلقة على التقويم (26 أيلول 2026 — جولة مقارنة المواعيد، البند 3)
-- ---------------------------------------------------------------------------
-- Open Dental «Blockouts» · Dentrix Ascend «Calendar events» · Curve «block times»:
-- فترات لا تُحجز (استراحة · إجازة · انقطاع كهرباء · اجتماع) أو تُحجز لنوعٍ محدّد
-- (reserved — بصري فقط). كل صف: مدى تواريخ (يوم واحد = date_from = date_to)،
-- اختيارياً أيام أسبوعٍ للتكرار (0=الأحد … 6=السبت — اصطلاح JS getDay)، وقت بداية
-- ونهاية أو يومٌ كامل (كلاهما NULL)، ونطاق: كل العيادة (operatory_id و provider_id NULL)
-- أو كرسي بعينه أو طبيب بعينه.
-- RLS: المالك فقط (كـoperatories) + بوابة الاشتراك (_sub_guard_table — M141).
-- الحجز الإلكتروني: booking_busy_slots تُعيد الفترات المغلقة على مستوى العيادة
-- كأوقاتٍ مشغولة، وbooking_create_request ترفضها بـslot_taken (نفس الخطأ الذي
-- تفهمه book.html — صفر تعديل بالواجهة العامة).
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text NOT NULL,
  kind              text NOT NULL DEFAULT 'other',
  date_from         date NOT NULL,
  date_to           date NOT NULL,
  weekdays          smallint[],
  start_time        time(0) without time zone,
  end_time          time(0) without time zone,
  operatory_id      uuid REFERENCES public.operatories(id) ON DELETE CASCADE,
  provider_id       uuid REFERENCES public.clinic_doctors(id) ON DELETE CASCADE,
  blocks_scheduling boolean NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_blocks_title_len  CHECK (char_length(title) BETWEEN 1 AND 60),
  CONSTRAINT schedule_blocks_kind_chk   CHECK (kind IN ('break','leave','meeting','power','reserved','other')),
  CONSTRAINT schedule_blocks_range_chk  CHECK (date_to >= date_from AND (date_to - date_from) <= 366),
  CONSTRAINT schedule_blocks_time_chk   CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)),
  CONSTRAINT schedule_blocks_weekdays_chk CHECK (weekdays IS NULL OR (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]))
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_doctor_range ON public.schedule_blocks (doctor_id, date_from, date_to);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_blocks_owner_all ON public.schedule_blocks;
CREATE POLICY schedule_blocks_owner_all ON public.schedule_blocks
  USING (doctor_id = (SELECT auth.uid())) WITH CHECK (doctor_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.schedule_blocks');

COMMENT ON TABLE public.schedule_blocks IS 'M154: الحجوزات المغلقة على التقويم (استراحة/إجازة/اجتماع/انقطاع/محجوز لنوع). NULL operatory+provider = كل العيادة.';

-- ── الحجز الإلكتروني: الفترات المغلقة على مستوى العيادة مشغولة ─────────────
-- تُوسَّع الفترات المتكرّرة يوماً يوماً داخل [p_from, p_to]. اليوم الكامل = ساعات العمل كلها
-- (تُعطى كفترةٍ واحدة من work_start بمدة تغطي اليوم).
CREATE OR REPLACE FUNCTION public.booking_blocked_slots(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE(d date, t time without time zone, dur integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.d::date,
         COALESCE(b.start_time, i.work_start) AS t,
         CASE WHEN b.start_time IS NULL
              THEN GREATEST(1, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60)::int)
              ELSE GREATEST(1, (EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::int) END AS dur
  FROM public.schedule_blocks b
  CROSS JOIN public.booking_clinic_info(p_clinic) i
  CROSS JOIN LATERAL generate_series(GREATEST(b.date_from, p_from), LEAST(b.date_to, p_to), interval '1 day') AS g(d)
  WHERE b.doctor_id = p_clinic
    AND b.blocks_scheduling
    AND b.operatory_id IS NULL AND b.provider_id IS NULL
    AND b.date_from <= p_to AND b.date_to >= p_from
    AND (b.weekdays IS NULL OR EXTRACT(DOW FROM g.d)::smallint = ANY (b.weekdays));
$$;
REVOKE ALL ON FUNCTION public.booking_blocked_slots(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_blocked_slots(uuid, date, date) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_busy_slots(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE(d date, t time without time zone, dur integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INTEGER;
BEGIN
  SELECT i.max_days_ahead INTO v_max
  FROM public.booking_clinic_info(p_clinic) i;
  IF v_max IS NULL THEN RETURN; END IF;
  v_max := LEAST(GREATEST(v_max, 1), 365);

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from
     OR (p_to - p_from) > v_max THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.date, a.time, COALESCE(a.duration, 30)
  FROM public.appointments a
  WHERE a.doctor_id = p_clinic
    AND a.is_planned IS NOT TRUE
    AND a.date BETWEEN p_from AND p_to
    AND a.time IS NOT NULL
    AND a.status NOT IN ('cancelled','broken','no_show')
  UNION ALL
  SELECT br.requested_date, br.requested_time, br.duration
  FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.status = 'pending'
    AND br.requested_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT bs.d, bs.t, bs.dur
  FROM public.booking_blocked_slots(p_clinic, p_from, p_to) bs;   -- M154
END; $$;

-- ── booking_create_request: رفضُ الفترات المغلقة (نفس خطأ slot_taken) — الجسمُ الحيّ + فحصٌ واحد ──
CREATE OR REPLACE FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  v_phone := regexp_replace(COALESCE(p_phone,''), '[^0-9+]', '', 'g');
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

  -- M154: فترةٌ مغلقة على مستوى العيادة (blocks_scheduling، بلا كرسي ولا طبيب) ⇒ slot_taken
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
END; $_$;

-- تحقّق (#238)
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='schedule_blocks') AS policies,
  (SELECT count(*) FROM pg_proc WHERE proname='booking_blocked_slots') AS blocked_fn,
  (SELECT position('booking_blocked_slots' in pg_get_functiondef('public.booking_create_request(uuid,text,text,date,time,text)'::regprocedure)) > 0) AS create_request_checks_blocks;
