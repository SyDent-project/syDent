-- ============================================================
-- Migration 148 — أعلام المريض الملوّنة (patients.flags + clinic_settings.patient_flag_defs)
-- ------------------------------------------------------------
-- الهدف: وسمٌ إداريٌّ حرّ يعرّفه الطبيب (VIP · يتأخّر · عناية خاصة…) — منفصلٌ
--        عمداً عن medical_flags (M87): تلك سريريةٌ بمفاتيح ثابتة وتحذيرِ روشتة،
--        وهذه إداريةٌ بتسمياتٍ يملكها صاحب العيادة.
-- النمط: Curve Hero (أعلام ملوّنة بجانب الحساسية بالـSidekick والمواعيد) ·
--        Software of Excellence (تعريف الأعلام بالإعدادات ثم إسنادها للمريض).
-- التخزين:
--   clinic_settings.patient_flag_defs  JSONB — مصفوفة [{k, label, tone}] (≤ 8).
--        NULL = الأعلام الافتراضية المعرّفة بالعميل (نمط staff_msg_presets · M81).
--   patients.flags                     JSONB — مصفوفة مفاتيح k. NULL/[] = بلا أعلام.
--        مفتاحٌ حُذف تعريفُه يُتجاهَل عرضاً (لا ترحيل بيانات عند حذف علم).
-- الأثر: nullable · additive · idempotent · صفر RLS جديد (سياسات الجدولين القائمة
--        تغطي العمودين) · صفر أثر مالي.
-- التوافق الرجعي: العميل strip-and-retry عند 42703/PGRST204 (نمط #250).
-- ============================================================

BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS flags JSONB;

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_flags_array;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_flags_array
  CHECK (flags IS NULL OR (jsonb_typeof(flags) = 'array' AND jsonb_array_length(flags) <= 8));

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS patient_flag_defs JSONB;

ALTER TABLE public.clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_patient_flag_defs_array;
ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_patient_flag_defs_array
  CHECK (patient_flag_defs IS NULL OR (jsonb_typeof(patient_flag_defs) = 'array' AND jsonb_array_length(patient_flag_defs) <= 8));

COMMENT ON COLUMN public.patients.flags IS
  'أعلام إدارية ملوّنة: مصفوفة مفاتيح من clinic_settings.patient_flag_defs. عرضية بحتة — لا تدخل أي حساب.';
COMMENT ON COLUMN public.clinic_settings.patient_flag_defs IS
  'تعريف أعلام المريض [{k,label,tone}] ≤ 8. NULL = الافتراضي المعرّف بالعميل (SyDentFlags.DEFAULTS).';

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'        AND column_name='flags')             AS patients_col,        -- 1
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='patient_flag_defs') AS settings_col,        -- 1
  (SELECT count(*) FROM pg_constraint WHERE conname IN ('patients_flags_array','clinic_settings_patient_flag_defs_array'))                          AS checks,              -- 2
  (SELECT count(*) FROM pg_policies  WHERE tablename='patients')                                                                                     AS patients_policies;   -- بلا تغيير
