-- ============================================================
-- Migration 87 — patients.medical_flags (التحذيرات الطبية المنظّمة)
-- ------------------------------------------------------------
-- الهدف: تخزين أعلام الحالة الطبية للمريض (سكري/ضغط/قلب/مميعات دم/
--        حمل/ربو/حساسية بنسلين/حساسية أدوية) كمصفوفة JSONB من مفاتيح
--        ثابتة يعرّفها العميل (MEDICAL_FLAGS_DEFS — مرآة ×3 محروسة).
-- النمط: OpenDental Medical tab (Problems/Allergies) + Popup automation
--        + Rx alerts — مكيَّف KISS: أعلام ثابتة + شارة دائمة + تحذير
--        بمودال الروشتة. التفاصيل الحرة تبقى بحقلَي allergies/notes.
-- الأثر: nullable · additive · صفر RLS (سياسات patients القائمة تغطي
--        القراءة/الكتابة) · صفر أثر مالي · idempotent (يُعاد بأمان).
-- التوافق الرجعي: العميل يتعامل مع غياب العمود بـstrip-and-retry
--        (42703/PGRST204) + توست مرة/جلسة (نمط #250).
-- ============================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS medical_flags JSONB;

COMMENT ON COLUMN public.patients.medical_flags IS
  'مصفوفة JSONB من مفاتيح تحذيرات طبية ثابتة (diabetes/hypertension/cardiac/anticoagulants/pregnancy/asthma/penicillin_allergy/drug_allergy). المصدر الوحيد للتسميات = MEDICAL_FLAGS_DEFS بالعميل (مرآة ×3). NULL أو [] = لا تحذيرات. M87.';

-- ============================================================
-- تحقّق (شغّلها بعد التطبيق — Rule #238)
-- ============================================================
-- (a) expect 1 row: العمود موجود jsonb nullable
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'patients'
   AND column_name  = 'medical_flags';

-- (b) عدّ سياسات patients — يجب أن يطابق العدّ قبل التطبيق (بلا تغيير)
SELECT count(*) AS patients_policies
  FROM pg_policies
 WHERE tablename = 'patients';
