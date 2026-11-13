-- ============================================================================
-- Migration 203 — تصنيفُ «تعويضات متحركة» لعلاجات الجهاز الأربعة
-- ----------------------------------------------------------------------------
-- بلاغُ المالك (13 تشرين الثاني 2026، بعد تجربة ج1 حيّاً): علاجاتُ الجهاز لازم تكون بفئةٍ لحالها —
-- «تعويضات ثابتة» = التيجان والجسور · «تعويضات متحركة» = الجهاز الكامل والجزئي.
-- التصنيفُ نصٌّ حرّ بلا قيد (treatments.category): المفتاحُ القائم 'prosthodontics' يبقى للتيجان والجسور
-- (اسمُه بالواجهة يصير «تعويضات ثابتة» — صفرُ مساسٍ ببياناتها)، ومفتاحٌ جديد 'prosth_removable' للجهاز.
--   [1] تصحيح: صفوفُ الجهاز الأربعة التي زُرعت بـM202 تحت 'prosthodontics' تنتقل للفئة الجديدة.
--       محصورٌ بالمفاتيح الافتراضية الأربعة وهي ما زالت على فئتها الافتراضية — علاجٌ غيّر الطبيبُ فئتَه لا يُمسّ.
--   [2] handle_new_doctor: الصفوف 30..33 بفئة 'prosth_removable' (الباقي مطابقٌ لـM202 حرفياً).
-- الأثر: additive · idempotent · صفر قيد · صفر عمود · صفر أثر مالي.
-- ============================================================================

BEGIN;

-- [1] الصفوفُ المزروعة منذ M202
UPDATE public.treatments
   SET category = 'prosth_removable'
 WHERE treatment_key IN ('denture-full', 'denture-partial-acrylic', 'denture-partial-metal', 'denture-partial-flex')
   AND target_part IN ('denture_full', 'denture_partial')
   AND category = 'prosthodontics';

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

  -- زرع الكتالوج المرجعي (33 علاجاً · كل الأسعار 0)
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
    (NEW.id, 'fluoride', 'تطبيق فلورايد', 'ف', '#0ea5e9', '#0369a1', 0, false, false, 'mouth', 'preventive', 29, false, false, true, '', 'all'),
    (NEW.id, 'denture-full', 'جهاز متحرك كامل', 'ك', '#e11d74', '#9d174d', 0, false, true, 'denture_full', 'prosth_removable', 30, false, false, true, 'طقم أسنان كامل', 'permanent'),
    (NEW.id, 'denture-partial-acrylic', 'جهاز متحرك جزئي (أكريل)', 'ج', '#f4728f', '#be123c', 0, false, true, 'denture_partial', 'prosth_removable', 31, false, false, true, 'طقم أسنان جزئي', 'permanent'),
    (NEW.id, 'denture-partial-metal', 'جهاز متحرك جزئي (هيكل معدني)', 'ج', '#9aa8bd', '#56657b', 0, false, true, 'denture_partial', 'prosth_removable', 32, false, false, true, 'طقم أسنان جزئي بهيكل معدني', 'permanent'),
    (NEW.id, 'denture-partial-flex', 'جهاز متحرك جزئي (مرن)', 'ج', '#b45309', '#78350f', 0, false, true, 'denture_partial', 'prosth_removable', 33, false, false, true, 'طقم أسنان جزئي مرن', 'permanent')
  ON CONFLICT (doctor_id, treatment_key) DO NOTHING;
  -- CATALOG-PARITY-END

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- نسجّل الخطأ لكن لا نمنع التسجيل
  RAISE WARNING 'handle_new_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT category, count(*) FROM public.treatments WHERE target_part IN ('denture_full','denture_partial') GROUP BY 1;   -- prosth_removable فقط
-- SELECT (pg_get_functiondef('public.handle_new_doctor'::regproc) LIKE '%''denture_full'', ''prosth_removable''%') AS fn_ok;
