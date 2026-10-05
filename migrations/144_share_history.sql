-- Migration 144: سجلُّ نسب الطبيب بتاريخ سريان (share_history)
-- تغييرُ share_percent كان ينسحب على كل تاريخ الطبيب: رفعُ النسبة من 30٪ إلى 40٪
-- في أيلول يُعيد حسابَ إنتاج آب وما قبله بـ40٪ فيظهر «رصيدٌ سابق» لا وجود له
-- (أو يختفي رصيدٌ حقيقي عند خفضها). نمطُ Personio/Gusto: تعويضٌ بتاريخ سريان.
--
-- share_history: JSONB مصفوفةٌ من {"from": "YYYY-MM-DD", "pct": <0..100>} مرتّبة
-- تصاعدياً بالتاريخ. النسبةُ السارية على تاريخٍ ما = آخرُ مدخلٍ from ≤ التاريخ،
-- وإن سبق التاريخُ أولَ مدخل ⇒ أولُ مدخل (تعبئةُ الترحيل = «منذ البداية»).
-- share_percent يبقى «النسبة الحالية» للعرض والتوافق؛ الحسابُ يقرأ السجل.
-- ADDITIVE + idempotent. 🔒 القراءةُ بصفحتي الرواتب وتقارير الأطباء فقط.

BEGIN;

ALTER TABLE public.clinic_doctors
  ADD COLUMN IF NOT EXISTS share_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- مصفوفةٌ دائماً — يمنع كائناً أو نصّاً بالخطأ.
ALTER TABLE public.clinic_doctors DROP CONSTRAINT IF EXISTS clinic_doctors_share_history_array;
ALTER TABLE public.clinic_doctors
  ADD CONSTRAINT clinic_doctors_share_history_array CHECK (jsonb_typeof(share_history) = 'array');

-- تعبئةٌ لمرةٍ واحدة: كل طبيبٍ له نسبةٌ حالية وسجلُّه فارغ ⇒ مدخلٌ واحد «منذ البداية».
UPDATE public.clinic_doctors
   SET share_history = jsonb_build_array(jsonb_build_object('from', '2000-01-01', 'pct', share_percent))
 WHERE share_percent IS NOT NULL
   AND share_history = '[]'::jsonb;

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinic_doctors' AND column_name = 'share_history') AS col_present,
  (SELECT count(*) FROM public.clinic_doctors WHERE share_percent IS NOT NULL AND share_history = '[]'::jsonb) AS unfilled_should_be_0,
  (SELECT count(*) FROM public.clinic_doctors WHERE jsonb_typeof(share_history) <> 'array') AS non_array_should_be_0;
