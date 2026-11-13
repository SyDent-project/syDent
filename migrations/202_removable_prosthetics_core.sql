-- ============================================================================
-- Migration 202 — التعويضات المتحركة (ج1): نوعا التطبيق + سطحُ المخطط المحجوز + الكتالوج
-- ----------------------------------------------------------------------------
-- البلاغ (المالك، 12 تشرين الثاني 2026): «كأنو ما عنا تعويضات متحركة». الكتالوج الافتراضي
-- (29 علاجاً) بلا جهازٍ كامل ولا جزئي؛ والطبيبُ الذي يضيف «طقم» على «فك كامل» يحصل على جلسةٍ
-- بلا رسمٍ ولا أسنانٍ معوَّضة ولا تسجيلٍ لجهازٍ موجود مسبقاً.
-- المراجعة: Open Dental (Paint Type «Denture» · Treatment Area Arch/Tooth Range) ·
--   Sensei Cloud (المنطقة ← كامل/جزئي ← المادة ← تأكيد الأسنان المفقودة) · Denticon.
--   [1] treatments.target_part: + 'denture_full' · 'denture_partial' (هندسةٌ خاصة بالمخطط
--       كالجسر والزرعة: الكامل = فكٌّ كامل · الجزئي = أسنانٌ مفقودة بعينها).
--   [2] teeth_status.surface: + 'DENTURE' — صفٌّ لكل سنٍّ يعوّضه الجهاز، وكلُّ صفوف الجهاز
--       الواحد تتشارك unit_id (سابقةُ الجسر M85). سطحٌ محجوز كـSPACER (M61) · SOCKET (M63) ·
--       COND (M152) · SXM/SXD (M176): لا يزاحم WHOLE (صفَّ القلع) ولا PONTIC.
--       ledger_sessions لا تتغيّر: جلسةُ الجهاز جلسةُ فكٍّ (tooth_num NULL · arch U/L) والربطُ
--       بصفوف المخطط = unit_id يساوي معرّفَ الجلسة.
--   [3] handle_new_doctor: الكتالوج 29 → 33 (جهاز متحرك كامل · جزئي أكريل · جزئي هيكل معدني ·
--       جزئي مرن — كلُّها بسعر 0 وتحتاج مخبراً). الجسمُ خارج جدول VALUES مطابقٌ لـM146 حرفياً.
--       محروسٌ بـcheck-catalog-parity.js (الذي صار يقرأ هذا الملف).
-- بلا backfill بقرار المالك (12/11/2026): العياداتُ القائمة تضيفها بزر «استعادة الافتراضي».
-- الأثر: additive · idempotent · صفر عمود · صفر صف · صفر RLS · صفر أثر مالي.
-- ============================================================================

BEGIN;

-- [1] نوعا التطبيق
ALTER TABLE public.treatments DROP CONSTRAINT IF EXISTS treatments_target_part_check;
ALTER TABLE public.treatments ADD CONSTRAINT treatments_target_part_check
  CHECK (target_part = ANY (ARRAY[
    'crown'::text, 'root'::text, 'whole'::text, 'crown_full'::text, 'bridge'::text,
    'extraction'::text, 'implant'::text, 'quadrant'::text, 'arch'::text, 'mouth'::text,
    'denture_full'::text, 'denture_partial'::text
  ]));

-- [2] سطحُ الجهاز المحجوز
ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_surface_check
  CHECK (
    ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SXM'::text, 'SXD'::text, 'DENTURE'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

-- [3] استبدال الدالة (نفس التوقيع والخصائص: SECURITY DEFINER · search_path=public)
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
    (NEW.id, 'denture-full', 'جهاز متحرك كامل', 'ك', '#e11d74', '#9d174d', 0, false, true, 'denture_full', 'prosthodontics', 30, false, false, true, 'طقم أسنان كامل', 'permanent'),
    (NEW.id, 'denture-partial-acrylic', 'جهاز متحرك جزئي (أكريل)', 'ج', '#f4728f', '#be123c', 0, false, true, 'denture_partial', 'prosthodontics', 31, false, false, true, 'طقم أسنان جزئي', 'permanent'),
    (NEW.id, 'denture-partial-metal', 'جهاز متحرك جزئي (هيكل معدني)', 'ج', '#9aa8bd', '#56657b', 0, false, true, 'denture_partial', 'prosthodontics', 32, false, false, true, 'طقم أسنان جزئي بهيكل معدني', 'permanent'),
    (NEW.id, 'denture-partial-flex', 'جهاز متحرك جزئي (مرن)', 'ج', '#b45309', '#78350f', 0, false, true, 'denture_partial', 'prosthodontics', 33, false, false, true, 'طقم أسنان جزئي مرن', 'permanent')
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
-- SELECT conname, pg_get_constraintdef(oid) LIKE '%denture_partial%' OR pg_get_constraintdef(oid) LIKE '%''DENTURE''%' AS ok
--   FROM pg_constraint WHERE conname IN ('treatments_target_part_check','teeth_status_surface_check');
-- SELECT (pg_get_functiondef('public.handle_new_doctor'::regproc) LIKE '%denture-partial-flex%') AS catalog_33;
