-- ============================================================================
-- Migration 216 — زيارةُ المتابعة المخطّطة تتبع يومَ موعدها (مراجعة ج2-ب)
-- ----------------------------------------------------------------------------
-- منذ M213: «الزيارة التالية» صفٌّ مخطّط مربوطٌ بموعد. حين يُربط يأخذ يومَ الموعد (fuLinkDate — بالعميل)، لكن الموعدَ
--   يُنقل بعدها من مساراتٍ كثيرة (نافذة الموعد · السحب بالتقويم · طلبُ المريض بالبوابة) فيبقى تاريخُ الزيارة قديماً
--   (البيانات الحية: زيارةٌ 25/11 وموعدُها 05/12). مصدرٌ واحدٌ للحقيقة: يومُ الموعد.
-- trg_appt_followup_date (AFTER UPDATE OF date ON appointments): الموعدُ انتقل إلى يومٍ (اليوم أو بعده، توقيت دمشق) ⇒
--   زياراتُ المتابعة **المخطّطة** المربوطةُ به تأخذ يومَه. لا يمسّ: علاجاً مخطّطاً عادياً (ليس متابعة) · متابعةً منجزة ·
--   موعداً صار بلا تاريخ أو بيومٍ مضى (الإكمالُ يضبط التاريخ — v756).
-- SECURITY INVOKER (RLS كما هي: من نقل الموعد يكتب جلساتِ عيادته فقط) · صفر لمسٍ مالي (cost = 0) · additive · idempotent.
-- تسويةٌ لمرةٍ واحدة بالنطاق نفسه: زيارةٌ مخطّطة مربوطةٌ بموعدٍ قادم بيومٍ آخر تأخذ يومه.
-- الرجوع: DROP TRIGGER trg_appt_followup_date ON public.appointments; DROP FUNCTION public.appointments_followup_date_sync();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.appointments_followup_date_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date IS NOT NULL AND NEW.date IS DISTINCT FROM OLD.date
     AND NEW.date >= (now() AT TIME ZONE 'Asia/Damascus')::date THEN
    UPDATE public.ledger_sessions s SET date = NEW.date
     WHERE s.appointment_id = NEW.id AND s.parent_id IS NOT NULL
       AND COALESCE(s.status, 'completed') = 'planned' AND s.date IS DISTINCT FROM NEW.date;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_appt_followup_date ON public.appointments;
CREATE TRIGGER trg_appt_followup_date AFTER UPDATE OF date ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_followup_date_sync();

UPDATE public.ledger_sessions s SET date = a.date
  FROM public.appointments a
 WHERE s.appointment_id = a.id AND s.parent_id IS NOT NULL AND COALESCE(s.status, 'completed') = 'planned'
   AND a.date IS NOT NULL AND a.date >= (now() AT TIME ZONE 'Asia/Damascus')::date AND s.date IS DISTINCT FROM a.date;

COMMIT;
