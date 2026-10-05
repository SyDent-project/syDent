-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 155 — حجوزاتٌ مفتوحة النهاية (26 أيلول 2026 — قرار المالك بعد اختبار M154)
-- ---------------------------------------------------------------------------
-- «استراحة الغداء كل يوم» لا تحتاج تاريخَ نهاية: date_to صار NULL = بلا نهاية،
-- وسقفُ الـ366 يوماً يبقى للمدى المغلق فقط. date_from يبقى إلزامياً (الواجهة تضع
-- اليومَ عند تركه فارغاً). booking_blocked_slots تُوسّع المفتوحَ حتى p_to.
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.schedule_blocks ALTER COLUMN date_to DROP NOT NULL;
ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_range_chk;
ALTER TABLE public.schedule_blocks ADD CONSTRAINT schedule_blocks_range_chk
  CHECK (date_to IS NULL OR (date_to >= date_from AND (date_to - date_from) <= 366));
COMMENT ON COLUMN public.schedule_blocks.date_to IS 'M155: NULL = بلا نهاية (حجزٌ دائم)';

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
  CROSS JOIN LATERAL generate_series(GREATEST(b.date_from, p_from), LEAST(COALESCE(b.date_to, p_to), p_to), interval '1 day') AS g(d)
  WHERE b.doctor_id = p_clinic
    AND b.blocks_scheduling
    AND b.operatory_id IS NULL AND b.provider_id IS NULL
    AND b.date_from <= p_to AND (b.date_to IS NULL OR b.date_to >= p_from)
    AND (b.weekdays IS NULL OR EXTRACT(DOW FROM g.d)::smallint = ANY (b.weekdays));
$$;

-- تحقّق (#238)
SELECT
  (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='schedule_blocks' AND column_name='date_to') AS date_to_nullable,
  (SELECT position('COALESCE(b.date_to, p_to)' in pg_get_functiondef('public.booking_blocked_slots(uuid,date,date)'::regprocedure)) > 0) AS open_ended_expansion;
