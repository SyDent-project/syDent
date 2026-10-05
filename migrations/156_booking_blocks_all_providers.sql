-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 156 — الحجزُ الإلكتروني: فتراتُ الأطباء/الكراسي تُغلق البوابة حين تشملهم جميعاً
-- (27 أيلول 2026 — قرار المالك على اقتراح الجولة)
-- ---------------------------------------------------------------------------
-- قبلها: البوابةُ ترى الفتراتِ العامّة فقط (بلا كرسي ولا طبيب). الآن، على شبكة
-- فترات البوابة (work_start..work_end بخطوة slot_minutes)، تُعدّ الفترةُ مغلقةً إذا:
--   • غطّتها فترةٌ عامّة مانعة، أو
--   • غطّت كلَّ طبيبٍ نشطٍ فتراتٌ مانعة خاصّة بالأطباء (عيادةٌ بطبيبٍ واحد تحجز إجازته باسمه)، أو
--   • غطّت كلَّ كرسيٍّ نشطٍ فتراتٌ مانعة خاصّة بالكراسي.
-- الفتراتُ الخاصّة التي لا تشمل الجميع لا تؤثّر على البوابة (المريض لا يختار كرسياً ولا طبيباً).
-- booking_busy_slots و booking_create_request يستدعيان booking_blocked_slots كما هما (M154).
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.booking_blocked_slots(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE(d date, t time without time zone, dur integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH info AS (SELECT * FROM public.booking_clinic_info(p_clinic)),
  days AS (
    SELECT g.d::date AS d FROM info i
    CROSS JOIN LATERAL generate_series(p_from, p_to, interval '1 day') AS g(d)
  ),
  slots AS (   -- شبكةُ فترات البوابة لكل يوم
    SELECT dd.d, (i.work_start + (n * i.slot_minutes) * interval '1 minute')::time AS t, i.slot_minutes AS dur
    FROM days dd CROSS JOIN info i
    CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60 / i.slot_minutes)::int - 1)) AS n
  ),
  inst AS (   -- حالاتُ الفترات المانعة، موسّعةً يوماً يوماً، مع مدى وقتها (اليومُ الكامل = 00:00..24:00)
    SELECT dd.d, b.operatory_id, b.provider_id,
           COALESCE(b.start_time, '00:00'::time) AS s,
           CASE WHEN b.end_time IS NULL THEN '24:00'::interval ELSE b.end_time::interval END AS e
    FROM public.schedule_blocks b
    JOIN days dd ON dd.d >= b.date_from AND (b.date_to IS NULL OR dd.d <= b.date_to)
    WHERE b.doctor_id = p_clinic AND b.blocks_scheduling
      AND (b.weekdays IS NULL OR EXTRACT(DOW FROM dd.d)::smallint = ANY (b.weekdays))
  ),
  provs AS (SELECT id FROM public.clinic_doctors WHERE owner_id = p_clinic AND is_active IS NOT FALSE),
  ops   AS (SELECT id FROM public.operatories  WHERE doctor_id = p_clinic AND is_active IS NOT FALSE)
  SELECT s.d, s.t, s.dur
  FROM slots s
  WHERE
    -- عامّة
    EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id IS NULL AND i.provider_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)
    -- كلُّ الأطباء النشطين
    OR ((SELECT count(*) FROM provs) > 0 AND NOT EXISTS (
          SELECT 1 FROM provs p WHERE NOT EXISTS (
            SELECT 1 FROM inst i WHERE i.d = s.d AND i.provider_id = p.id AND i.operatory_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)))
    -- كلُّ الكراسي النشطة
    OR ((SELECT count(*) FROM ops) > 0 AND NOT EXISTS (
          SELECT 1 FROM ops o WHERE NOT EXISTS (
            SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id = o.id AND i.provider_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)));
$$;

-- تحقّق (#238)
SELECT position('provs' in pg_get_functiondef('public.booking_blocked_slots(uuid,date,date)'::regprocedure)) > 0 AS all_providers_rule;
