-- Migration 146 — treatments.dentition_scope + كتالوج الأطفال الافتراضي
-- ─────────────────────────────────────────────────────────────────────────────
-- البلاغ: شريحة «🧒 أطفال» لا تظهر بمودال السن. السبب ليس بالكود: الشريحة تُعرض حين يوجد
-- علاجٌ مسموحٌ للسن بهذا التصنيف، والعلاج الوحيد بتصنيف pediatric بكل القاعدة كان
-- «حافظ مسافة» — وهو محجوبٌ عمداً عن السن القائم (يرتكز على موقع قلع).
--
-- القرار (بعد مراجعة Open Dental · CDT/AAPD · Dentally/Curve): لا أحد يعتمد على تصنيفٍ
-- فارغ؛ العلاجُ نفسُه يعرف نوعَ السن (Auto Codes: شرط Primary/Permanent عند Open Dental).
--   [1] عمود `dentition_scope` ('all' | 'primary' | 'permanent') — عرضيٌّ بحت: يفلتر ما
--       يُعرض عند اختيار سنّ بالمخطط. لا يدخل أيَّ حسابٍ مالي. RLS القائمة تغطّيه.
--   [2] handle_new_doctor: الكتالوج 24 → 29 (بتر لب · استئصال لب لبني · تاج ستانلس ستيل
--       «لبنية فقط» بتصنيف أطفال · سادّ شقوق · تطبيق فلورايد بتصنيف وقائي حسب CDT).
--       الجسمُ خارج جدول VALUES مطابقٌ لـM103 حرفياً. محروسٌ بـcheck-catalog-parity.js
--       (الذي صار يقرأ هذا الملف).
--   [3] backfill إضافيٌّ بحت للعيادات القائمة: تُضاف الصفوف الخمسة الناقصة فقط (بالمفتاح
--       أو بالاسم)، بعد أقصى sort_order — مرآةُ insertMissingDefaults. لا تعديل ولا حذف.
--       العملة تُشتقّ بـtrg_currency_treatments (sydent_currency_guard).
-- بتر اللب = 'whole' عمداً: يُرسم إطاراً حول السن فيتعايش مع تاج الستانلس (CROWN_FULL)
-- على السن نفسه — وهو الثنائي السريري المعتاد؛ 'crown_full' كان سيدهسه التاج.

-- [1] العمود
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS dentition_scope text NOT NULL DEFAULT 'all';

ALTER TABLE public.treatments DROP CONSTRAINT IF EXISTS treatments_dentition_scope_check;
ALTER TABLE public.treatments ADD CONSTRAINT treatments_dentition_scope_check
  CHECK (dentition_scope IN ('all','primary','permanent'));

COMMENT ON COLUMN public.treatments.dentition_scope IS
  'Which dentition the treatment is offered on in the tooth pickers: all | primary | permanent. Presentation-only filter; excluded from all financial logic.';

-- [2] استبدال الدالة (نفس التوقيع والخصائص: SECURITY DEFINER · search_path=public)
CREATE OR REPLACE FUNCTION public.handle_new_doctor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- إنشاء صف الدكتور
  INSERT INTO public.doctors (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- زرع الكتالوج المرجعي (29 علاجاً · كل الأسعار 0)
  -- CATALOG-PARITY-START
  INSERT INTO public.treatments
    (doctor_id, treatment_key, name, label, fill, stroke, price, builtin, needs_lab,
     target_part, category, sort_order, post_extraction, is_favorite, is_active, layman_name, dentition_scope)
  VALUES
    (NEW.id, 'treated', 'حشوة املغم', 'ح', '#312f27', '#22211b', 0, true, false, 'crown', 'restorative', 1, false, true, true, 'حشوة معدنية', 'all'),
    (NEW.id, 'custom_1781292854422', 'حشوة كومبوزت', 'ح', '#0f6b99', '#0b4b6b', 0, false, false, 'crown', 'restorative', 2, false, true, true, 'حشوة تجميلية', 'all'),
    (NEW.id, 'root-canal', 'معالجة لبية', 'ق', '#a78bfa', '#7c5cbf', 0, true, false, 'root', 'endodontics', 3, false, true, true, 'سحب عصب', 'all'),
    (NEW.id, 'custom_1784310641369', 'حشوة عصب', 'ح', '#ff4d6a', '#b3364a', 0, false, false, 'root', 'endodontics', 4, false, true, true, '', 'all'),
    (NEW.id, 'custom_1783204794478', 'اعادة معالجة', 'ا', '#00f2a1', '#00a971', 0, false, false, 'root', 'endodontics', 5, false, true, true, '', 'all'),
    (NEW.id, 'custom_1783255139568', 'وتد فايبر', 'و', '#999999', '#6b6b6b', 0, false, false, 'root', 'endodontics', 6, false, true, true, '', 'all'),
    (NEW.id, 'custom_1784742823602', 'تحضير', 'ت', '#218800', '#175f00', 0, false, true, 'crown_full', 'prosthodontics', 7, false, true, true, 'تحضير الاسنان للتلبيس', 'all'),
    (NEW.id, 'crown', 'تاج خزف على معدن', 'ت', '#ff6b00', '#b34b00', 0, true, true, 'crown_full', 'prosthodontics', 8, false, true, true, 'تاج خزف', 'all'),
    (NEW.id, 'custom_1784821896689', 'تاج زركون', 'ت', '#e5e5f4', '#a0a0ab', 0, false, true, 'crown_full', 'prosthodontics', 9, false, true, true, 'تاج زركونيا', 'all'),
    (NEW.id, 'bridge', 'جسر', 'ج', '#dc2626', '#991b1b', 0, true, true, 'bridge', 'prosthodontics', 10, false, true, true, '', 'all'),
    (NEW.id, 'custom_1784316215415', 'جسر (زركون)', 'ج', '#c44dff', '#8936b3', 0, false, true, 'bridge', 'prosth_cosmetic', 11, false, true, true, '', 'all'),
    (NEW.id, 'extracted', 'قلع', '✕', '#ef5350', '#c62828', 0, true, false, 'extraction', 'surgical', 12, false, true, true, '', 'all'),
    (NEW.id, 'implant', 'زراعة', 'ز', '#b5e0ff', '#7f9db3', 0, true, true, 'implant', 'implantology', 13, false, false, true, '', 'all'),
    (NEW.id, 'socket-graft', 'طعم عظمي (حفاظ سنخ)', 'ط', '#f97316', '#c2410c', 0, false, false, 'whole', 'surgical', 14, true, false, true, '', 'all'),
    (NEW.id, 'socket-dressing', 'ضماد سنخ', 'ض', '#fbbf24', '#b45309', 0, false, false, 'whole', 'surgical', 15, true, false, true, '', 'all'),
    (NEW.id, 'ortho-fixed', 'تقويم ثابت', '⚓', '#f25100', '#a93900', 0, false, true, 'arch', 'orthodontics', 16, false, false, true, '', 'all'),
    (NEW.id, 'ortho-removable', 'تقويم متحرك', '⚙', '#22d3ee', '#0e90a8', 0, false, true, 'arch', 'orthodontics', 17, false, false, true, '', 'all'),
    (NEW.id, 'ortho-retainer', 'مثبّت تقويم', 'ث', '#5eead4', '#2bb3a3', 0, false, true, 'arch', 'orthodontics', 18, false, false, true, '', 'all'),
    (NEW.id, 'cleaning', 'تنظيف', 'ن', '#06b6d4', '#0a809a', 0, false, false, 'mouth', 'preventive', 19, false, false, true, '', 'all'),
    (NEW.id, 'consult', 'استشارة', 'س', '#fb923c', '#c2691f', 0, false, false, 'mouth', 'diagnostic', 20, false, false, true, '', 'all'),
    (NEW.id, 'xray', 'أشعة', 'أ', '#a3a3a3', '#6b6b6b', 0, false, false, 'whole', 'diagnostic', 21, false, false, true, '', 'all'),
    (NEW.id, 'whitening', 'تبييض', 'ب', '#84cc16', '#5a9410', 0, false, false, 'arch', 'cosmetic', 22, false, false, true, '', 'all'),
    (NEW.id, 'perio-scaling', 'تقليح', 'ت', '#f2f200', '#a9a900', 0, false, false, 'mouth', 'periodontics', 23, false, false, true, '', 'all'),
    (NEW.id, 'pedo-spacer', 'حافظ مسافة', 'م', '#d946ef', '#86198f', 0, false, true, 'arch', 'pediatric', 24, false, false, true, '', 'all'),
    (NEW.id, 'pedo-pulpotomy', 'بتر لب', 'ب', '#f472b6', '#be185d', 0, false, false, 'whole', 'pediatric', 25, false, false, true, 'علاج عصب السن اللبني', 'primary'),
    (NEW.id, 'pedo-pulpectomy', 'استئصال لب لبني', 'ا', '#be185d', '#831843', 0, false, false, 'root', 'pediatric', 26, false, false, true, 'سحب عصب السن اللبني', 'primary'),
    (NEW.id, 'pedo-ssc', 'تاج ستانلس ستيل', 'ت', '#94a3b8', '#475569', 0, false, false, 'crown_full', 'pediatric', 27, false, false, true, 'تاج معدني جاهز', 'primary'),
    (NEW.id, 'fissure-sealant', 'سادّ شقوق', 'س', '#2563eb', '#1e40af', 0, false, false, 'crown', 'preventive', 28, false, false, true, 'طبقة حماية من التسوّس', 'all'),
    (NEW.id, 'fluoride', 'تطبيق فلورايد', 'ف', '#0ea5e9', '#0369a1', 0, false, false, 'mouth', 'preventive', 29, false, false, true, '', 'all')
  ON CONFLICT (doctor_id, treatment_key) DO NOTHING;
  -- CATALOG-PARITY-END

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- نسجّل الخطأ لكن لا نمنع التسجيل
  RAISE WARNING 'handle_new_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- [3] backfill إضافيّ للعيادات القائمة (كلُّ doctor_id له علاجاتٌ أصلاً)
WITH cat(treatment_key, name, label, fill, stroke, needs_lab, target_part, category, ord, layman_name, dentition_scope) AS (
  VALUES
    ('pedo-pulpotomy',  'بتر لب',           'ب', '#f472b6', '#be185d', false, 'whole',      'pediatric',  1, 'علاج عصب السن اللبني', 'primary'),
    ('pedo-pulpectomy', 'استئصال لب لبني',  'ا', '#be185d', '#831843', false, 'root',       'pediatric',  2, 'سحب عصب السن اللبني', 'primary'),
    ('pedo-ssc',        'تاج ستانلس ستيل',  'ت', '#94a3b8', '#475569', false, 'crown_full', 'pediatric',  3, 'تاج معدني جاهز',       'primary'),
    ('fissure-sealant', 'سادّ شقوق',        'س', '#2563eb', '#1e40af', false, 'crown',      'preventive', 4, 'طبقة حماية من التسوّس', 'all'),
    ('fluoride',        'تطبيق فلورايد',    'ف', '#0ea5e9', '#0369a1', false, 'mouth',      'preventive', 5, '',                      'all')
),
clinics AS (
  SELECT doctor_id, COALESCE(MAX(sort_order), 0) AS mx FROM public.treatments GROUP BY doctor_id
)
INSERT INTO public.treatments
  (doctor_id, treatment_key, name, label, fill, stroke, price, builtin, needs_lab,
   target_part, category, sort_order, post_extraction, is_favorite, is_active, layman_name, dentition_scope)
SELECT c.doctor_id, cat.treatment_key, cat.name, cat.label, cat.fill, cat.stroke, 0, false, cat.needs_lab,
       cat.target_part, cat.category, c.mx + cat.ord, false, false, true, NULLIF(cat.layman_name, ''), cat.dentition_scope
FROM clinics c CROSS JOIN cat
WHERE NOT EXISTS (
  SELECT 1 FROM public.treatments t
  WHERE t.doctor_id = c.doctor_id AND (t.treatment_key = cat.treatment_key OR t.name = cat.name)
)
ON CONFLICT (doctor_id, treatment_key) DO NOTHING;

-- التحقق بعد التطبيق:
--   SELECT count(*) FROM regexp_matches((SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='handle_new_doctor'), '\(NEW\.id,', 'g');            -- = 29
--   SELECT dentition_scope, count(*) FROM public.treatments GROUP BY 1;
