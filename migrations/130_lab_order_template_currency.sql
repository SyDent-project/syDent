-- Migration 130 — عملة التكلفة بقوالب طلب المخبر.
--
-- البلاغ: قالبٌ حُفظ بالدولار يُطبَّق فتظهر التكلفة بالليرة.
-- الجذر مقيسٌ لا مُخمَّن: مسحُ المخطّط كاملاً أظهر أن lab_order_templates هو
-- **الجدول الوحيد** الحامل لعمود مبلغ (cost) بلا عمود عملة — التسعة عشر
-- الباقية كلها موسومة منذ M125. فالحفظ كان يكتب الرقم بلا وحدته، والتطبيق
-- يملأ الحقل ويترك المبدّل على عملة العيادة: رقمٌ صحيح تحت وحدةٍ كاذبة.
-- وحارس وسم العملة (الخامس عشر) لا يراه بنيوياً لأنه يشتقّ جدوله من
-- الجداول الحاملة لعمود عملة — وهذا لا يحمله. (وُسّع الحارس بنفس النشرة.)
--
-- additive + idempotent:
--   • صفر UPDATE وصفر backfill وصفر تغيير RLS.
--   • بلا DEFAULT وبلا trigger اشتقاق عمداً: NULL يعني «قالبٌ ما قبل M130»
--     أي سلوك ما قبل الهجرة حرفياً — واشتقاقُ عملة العيادة كان سيدّعي على
--     القوالب القائمة وحدةً لم يقصدها أحد، وهو ادّعاءٌ لا معلومة.

ALTER TABLE public.lab_order_templates
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lab_order_templates'::regclass
      AND conname  = 'lab_order_templates_currency_check'
  ) THEN
    ALTER TABLE public.lab_order_templates
      ADD CONSTRAINT lab_order_templates_currency_check
      CHECK (currency IS NULL OR currency IN ('SYP','USD'));
  END IF;
END $$;

COMMENT ON COLUMN public.lab_order_templates.currency IS
  'عملة cost. NULL = قالب ما قبل M130 (بلا عملة مخزَّنة) — يُطبَّق بعملة العيادة مع تنبيه.';
