-- ============================================================================
-- Migration 113 — الرقم النقابي بطلب التسجيل
-- ----------------------------------------------------------------------------
-- السياق: صفحة التسجيل صار عندها بُعد مهني — «فرع النقابة» بدل «المدينة»،
-- ومعه رقم نقابي اختياري للتحقّق اليدوي عند التفعيل.
--
-- قرار معماري: العمود city **لا يُعاد تسميته**. قيمه الحالية أصلاً أسماء
-- محافظات = أسماء الفروع حرفياً، وهو مقروء بسبعة مواضع حيّة بطبقة الأدمن
-- (admin.html ×3 · admin-render.js ×3 · admin-wa.js ×1). إعادة التسمية =
-- سبع نقاط كسر مقابل صفر مكسب. التغيير تسمية واجهة فقط + COMMENT توثيقي.
--
-- idempotent · صفر لمس لأي سياسة RLS · صفر لمس مالي · صفر تعديل بيانات.
-- ============================================================================

ALTER TABLE public.trial_requests
  ADD COLUMN IF NOT EXISTS syndicate_no TEXT;

-- حارس طول: الحقل يُملأ من العميل عبر سياسة الإدراج الذاتية
-- (trial_requests_self_insert) فلا يُترك بلا سقف. مطابق للتحقق بـ auth.html.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.trial_requests'::regclass
       AND conname  = 'trial_requests_syndicate_no_len'
  ) THEN
    ALTER TABLE public.trial_requests
      ADD CONSTRAINT trial_requests_syndicate_no_len
      CHECK (syndicate_no IS NULL OR char_length(syndicate_no) <= 30);
  END IF;
END $$;

COMMENT ON COLUMN public.trial_requests.syndicate_no IS
  'الرقم النقابي للطبيب (اختياري، يُدخل عند التسجيل) — للتحقق اليدوي عند التفعيل.';
COMMENT ON COLUMN public.trial_requests.city IS
  'فرع نقابة أطباء الأسنان (اسم المحافظة). الاسم التاريخي city محفوظ عمداً — مقروء بسبعة مواضع بطبقة الأدمن.';

-- ملاحظة: سياسة trial_requests_self_insert لا تُمسّ — الـ WITH CHECK تبعها
-- تقيّد user_id و status و ai_override حصراً، فالعمود الجديد يمرّ بالإدراج
-- الذاتي كما هو مقصود (الطبيب هو من يكتبه عند التسجيل).

-- ── تحقّق (المتوقَّع: t · t · 0) ────────────────────────────────────────────
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns
--           WHERE table_schema='public' AND table_name='trial_requests'
--             AND column_name='syndicate_no')                       AS col_ok,
--   EXISTS (SELECT 1 FROM pg_constraint
--           WHERE conrelid='public.trial_requests'::regclass
--             AND conname='trial_requests_syndicate_no_len')        AS chk_ok,
--   (SELECT count(*) FROM public.trial_requests
--     WHERE syndicate_no IS NOT NULL)                               AS filled_rows;
-- ============================================================================
