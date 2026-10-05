-- Migration 131 — عملة رسم عدم الحضور.
--
-- السؤال الذي وُلدت منه: «ليش ما في خيار تغيير العملة مثل باقي المنصة؟»
-- والجواب أنه لم يكن هناك مكانٌ يُخزَّن فيه: clinic_settings تحمل
-- no_show_fee_amount بلا عمود عملةٍ يصفه. والعمود currency بنفس الصفّ معناه
-- **عملة العيادة الافتراضية** لا عملة الرسم — عمودان بنفس الصفّ بمعنيين.
-- فكان التطبيق يختم الجلسة بعملة العيادة الحالية، والرقمُ المخزَّن يطفو معها:
-- نفس الحقل قُرئ ($) مرّةً و(ل.س) أخرى — «رقمٌ صحيح تحت وحدةٍ كاذبة».
--
-- ومسحُ المخطّط الكامل يقول إنه آخر عمود مبلغ بلا عمود عملة يصفه — نفس
-- الثغرة البنيوية التي وقع فيها lab_order_templates قبل M130 حرفياً، وحارسُ
-- وسم العملة لا يراه لأن خريطته مشتقّة من الأزواج (مبلغ ↔ عملته).
-- (وُسّع الحارس بنفس النشرة: 14 → 15 جدولاً.)
--
-- additive + idempotent:
--   • صفر UPDATE وصفر backfill وصفر تغيير RLS.
--   • بلا DEFAULT وبلا trigger اشتقاق عمداً: NULL يعني «ما قبل M131» أي
--     يتبع عملة العيادة — سلوك ما قبل الهجرة حرفياً؛ واشتقاقُ عملةٍ للصفوف
--     القائمة كان سيدّعي عليها وحدةً لم يقرّرها أحد، وهو ادّعاءٌ لا معلومة.

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS no_show_fee_currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_settings'::regclass
      AND conname  = 'clinic_settings_no_show_fee_currency_check'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_no_show_fee_currency_check
      CHECK (no_show_fee_currency IS NULL OR no_show_fee_currency IN ('SYP','USD'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.no_show_fee_currency IS
  'عملة no_show_fee_amount. NULL = ما قبل M131 (بلا عملة مخزَّنة) — يتبع عملة العيادة الافتراضية.';
