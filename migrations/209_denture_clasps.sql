-- ============================================================
-- Migration 209 — teeth_status.denture_clasps (ضمّاتُ الجهاز المتحرك الجزئي)
-- ------------------------------------------------------------
-- الهدف (v739 — قرارُ المالك 16–17/11/2026): الجهازُ الجزئي يُرسم بضمّاته. الضمّاتُ **مقترحةٌ تلقائياً** على الأسنان القائمة
--   المجاورة للفراغ (رباعي بحدٍّ أقصى 4 — الواجهةُ تحسبه من المخطط الحيّ)، والطبيبُ يضيف ضمّةً أو يلغيها من نافذة الجهاز.
--   قائمةُ الطبيب تُحفظ على صفوف الجهاز نفسها (teeth_status · surface = 'DENTURE')، بالقيمة نفسها على كل صفوف الوحدة:
--     NULL        = لا قائمة ⇒ الاقتراحُ التلقائي (كلُّ جهازٍ قائم اليوم يأخذه بلا ترحيل بيانات)
--     ''          = قائمةٌ صريحة فارغة (الطبيبُ ألغى الضمّات كلَّها)
--     '13,17,23'  = أسنانُ الضمّات بترقيم FDI تصاعدياً
--   لا صفَّ على السن الداعم نفسه ⇒ لا تزاحمَ مع محوِ صفوف السن (قلع · تاج · زرعة) ولا مع أي حلقةٍ تقرأ أسطحه.
-- الحدّ الحاسم: **عرضيٌّ بحت** — لا جلسة ولا تكلفة ولا أي مسارٍ مالي. خدمةُ «ضمّة» المدفوعة (M208) بندٌ مستقل لا علاقة له بهذا العمود.
-- الأثر: عمودٌ nullable · additive · idempotent · صفر RLS جديدة (سياساتُ الجدول تحكمه) · زنادُ التاريخ fn_teeth_status_history
--   يسمّي أعمدته صراحةً فلا يتأثر · لا دالة ولا منحة. لا تعبئة: كلُّ الصفوف القائمة NULL.
-- التراجع: ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_denture_clasps_format;
--          ALTER TABLE public.teeth_status DROP COLUMN IF EXISTS denture_clasps;
-- ============================================================

BEGIN;

ALTER TABLE public.teeth_status
  ADD COLUMN IF NOT EXISTS denture_clasps text;

ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_denture_clasps_format;
ALTER TABLE public.teeth_status
  ADD CONSTRAINT teeth_status_denture_clasps_format
  CHECK (denture_clasps IS NULL OR (surface = 'DENTURE' AND denture_clasps ~ '^([1-4][1-8](,[1-4][1-8]){0,15})?$'));

COMMENT ON COLUMN public.teeth_status.denture_clasps IS
  'ضمّات الجهاز المتحرك الجزئي على صفوف وحدته (surface = DENTURE): NULL = اقتراح تلقائي من المخطط · نص فارغ = بلا ضمّات · «13,17» = أسنان الضمّات (FDI تصاعدياً). عرضيٌّ بحت: لا يدخل أي حساب مالي.';

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='teeth_status' AND column_name='denture_clasps') AS col,   -- 1
  (SELECT count(*) FROM pg_constraint WHERE conname='teeth_status_denture_clasps_format')                                                       AS chk,   -- 1
  (SELECT count(*) FROM public.teeth_status WHERE denture_clasps IS NOT NULL)                                                                   AS filled; -- 0
