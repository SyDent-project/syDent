-- Migration 129 — عملة الإجمالي الموحّد بصفحة المحاسبة (طبقة المستأجر).
-- عرضٌ لا تحويل (قاعدة #467): لا يُكتب أيُّ مبلغٍ محوَّلٍ بالقاعدة أبداً — كلُّ صفٍّ
-- يبقى بعملته، وهذا العمود يقول بأي وحدةٍ يُعرض المجموعُ الموحّد وحده.
--   · NULL = اتبع عملة العيادة الافتراضية (clinic_settings.currency) — الافتراضُ الآمن
--     ويعني أن الصفوف القائمة كلها بلا تغييرٍ سلوكيّ إلا للأفضل: عيادةُ الدولار كانت
--     مقفولةً على الليرة بلا سبب.
--   · additive وidempotent: صفر UPDATE · صفر backfill · صفر تغيير RLS · صفر لمس مالي.

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS report_unify_currency TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_settings'::regclass
      AND conname  = 'clinic_settings_report_unify_currency_chk'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_report_unify_currency_chk
      CHECK (report_unify_currency IS NULL OR report_unify_currency IN ('SYP','USD'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.report_unify_currency IS
  'M129: عملة عرض الإجمالي الموحّد بصفحة المحاسبة (NULL = عملة العيادة). عرض فقط — لا يمسّ أي مبلغ مخزَّن.';
