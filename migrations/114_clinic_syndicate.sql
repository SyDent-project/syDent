-- ============================================================================
-- Migration 114 — المعلومات النقابية على طبقة العيادة
-- ----------------------------------------------------------------------------
-- السياق: Migration 113 التقطت فرع النقابة والرقم النقابي عند التسجيل، لكنهما
-- بقيا على طبقة المنصة (trial_requests) — لا يراهما الطبيب ولا يعدّلهما.
--
-- 🔴 قرار معماري (بعد جرد الكود الحيّ): عمود clinic_settings.license_no موجود
-- منذ Migration 51، اسمه عند الطبيب «رقم النقابة»، ومطبوع على خمسة أسطح
-- (pp-clinical.js ×2 · pp-dental.js · pp-plan.js ×2). إضافة عمود syndicate_no
-- ثانٍ هنا = حقلان متنافسان لنفس المفهوم على نفس الصف ⇒ الطبيب يعدّل واحداً
-- والروشتة تطبع الآخر. لذلك:
--   • الرقم النقابي  → يُعاد استخدام license_no القائم (صفر عمود جديد).
--   • فرع النقابة    → لا نظير له ⇒ عمود جديد syndicate_branch.
--
-- idempotent · صفر لمس RLS · صفر لمس مالي · الردم لا يدهس أي قيمة قائمة.
-- ============================================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS syndicate_branch TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clinic_settings'::regclass
       AND conname  = 'clinic_settings_syndicate_branch_len'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_syndicate_branch_len
      CHECK (syndicate_branch IS NULL OR char_length(syndicate_branch) <= 40);
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.syndicate_branch IS
  'فرع نقابة أطباء الأسنان للعيادة. يُبذر من user_metadata عند إنشاء الصف، وقابل للتعديل من صفحة الإعدادات.';
COMMENT ON COLUMN public.clinic_settings.license_no IS
  'الرقم النقابي للطبيب (يظهر على رأس الروشتة المطبوعة). يُبذر من user_metadata عند التسجيل — نظير trial_requests.syndicate_no بطبقة المنصة.';

-- ردم للحسابات القائمة: النسخ من طلب التسجيل، وللفارغ حصراً (لا يدهس أي
-- قيمة كتبها الطبيب بنفسه). trial_requests.user_id فريد ⇒ صفر تكاثر صفوف.
UPDATE public.clinic_settings cs
   SET syndicate_branch = tr.city
  FROM public.trial_requests tr
 WHERE tr.user_id = cs.owner_id
   AND cs.syndicate_branch IS NULL
   AND tr.city IS NOT NULL
   AND char_length(tr.city) <= 40;

UPDATE public.clinic_settings cs
   SET license_no = tr.syndicate_no
  FROM public.trial_requests tr
 WHERE tr.user_id = cs.owner_id
   AND cs.license_no IS NULL
   AND tr.syndicate_no IS NOT NULL;

-- ── تحقّق (طُبّق على الإنتاج: t · t · 7 صفوف · 4 فروع مردومة) ──────────────
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns
--           WHERE table_schema='public' AND table_name='clinic_settings'
--             AND column_name='syndicate_branch')                     AS col_ok,
--   EXISTS (SELECT 1 FROM pg_constraint
--           WHERE conrelid='public.clinic_settings'::regclass
--             AND conname='clinic_settings_syndicate_branch_len')     AS chk_ok,
--   (SELECT count(*) FROM public.clinic_settings)                     AS total_rows,
--   (SELECT count(*) FROM public.clinic_settings
--     WHERE syndicate_branch IS NOT NULL)                             AS branch_filled;
-- ============================================================================
