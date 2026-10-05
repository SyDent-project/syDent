-- ============================================================
-- Migration 92 — patients.medical_flags_other (تحذير طبي حر)
-- ------------------------------------------------------------
-- الهدف: حقل نصي حر يكتبه الطبيب لتحذير طبي غير مغطّى بالأعلام
--        الثابتة (MEDICAL_FLAGS_DEFS) — مكمِّل لفصل الحساسيات عن
--        التحذيرات بمودال بيانات المريض (قرار المالك 19/07/2026).
-- ملاحظة: مفتاحا الحساسية (penicillin_allergy/drug_allergy) يبقيان
--        مخزَّنين داخل medical_flags نفسها — صفر ترحيل بيانات؛
--        الفصل يتم بطبقة العرض فقط (ALLERGY_FLAGS_DEFS بالعميل).
-- الأثر: nullable · additive · صفر RLS (سياسات patients القائمة تغطي
--        القراءة/الكتابة) · صفر أثر مالي · idempotent (يُعاد بأمان).
-- التوافق الرجعي: العميل يتعامل مع غياب العمود بـstrip-and-retry
--        (42703/PGRST204 على /medical_flags_other/) + توست مرة/جلسة
--        (نمط #250) — والريجكس القديم لـM87 شُدِّد بـnegative lookahead
--        كي لا يبتلع خطأ M92.
-- ============================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS medical_flags_other TEXT;

COMMENT ON COLUMN public.patients.medical_flags_other IS
  'تحذير طبي حر يكتبه الطبيب (مكمِّل لأعلام medical_flags الثابتة). NULL أو فارغ = لا يوجد. يُعرض ضمن كل مواضع التحذير الطبي (بطاقة/طباعة/روشتة/مواعيد) عبر warnParts بالعميل. M92.';

-- ============================================================
-- تحقّق (شغّلها بعد التطبيق — Rule #238)
-- ============================================================
-- (a) expect 1 row: العمود موجود text nullable
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'patients'
   AND column_name  = 'medical_flags_other';

-- (b) عدّ سياسات patients — يجب أن يطابق العدّ قبل التطبيق (بلا تغيير)
SELECT count(*) AS patients_policies
  FROM pg_policies
 WHERE tablename = 'patients';
