-- ============================================================================
-- Migration 208 — خدماتُ ما بعد تسليم الجهاز المتحرك (ج4-أ)
-- ----------------------------------------------------------------------------
-- تبطين · إصلاح · تبديل سن مكسور · إضافة سن · ضمّة · تعديل. المراجعة (CDT D5410–D5761، وهو ترميز كتالوجات
-- Open Dental / Dentrix / Sensei): الخدماتُ بنودٌ مستقلة تُسجَّل على الفك. هنا تبقى الخدمةُ «علاجَ فكّ»
-- (target_part = 'arch') فكلُّ شاشةٍ قائمة تعاملها جلسةَ فكٍّ عادية بلا تعديل، ويُضاف فوقها ربطٌ بالجهاز:
--   [1] treatments.denture_svc: 'service' (خدمةٌ على جهازٍ قائم) · 'add' (إضافةُ سنٍّ لجهازٍ جزئي) · NULL لغيرهما.
--       لا قيمةَ جديدة بـtarget_part: نوعٌ جديد كان سيسقط بكل تفريعٍ يعامل المجهول «سطحَ تاج».
--   [2] ledger_sessions.denture_unit: معرّفُ وحدة الجهاز على المخطط (teeth_status.unit_id) التي تخصّها الخدمة ⇒ سجلُّ الجهاز.
--       ledger_sessions.denture_add: الأسنانُ التي تضيفها الجلسة للجهاز. عمودٌ مستقل عن unit_teeth عمداً: unit_teeth يعني
--       «هذه الجلسةُ جهازٌ بهذه الأسنان» ومرآةُ إنجاز الموعد (_apptDrawPendingDenture) ترسم منه جهازاً جديداً.
--   [3] handle_new_doctor: الكتالوج 33 → 40 (سبعُ خدمات بفئة «تعويضات متحركة») + العمود الجديد. الباقي مطابقٌ لـM203 حرفياً.
--       الحساباتُ القائمة لا تُمسّ (قرار المالك منذ M202): الخدماتُ تُضاف بزرّ «الافتراضي».
-- الأثر: additive · idempotent · عمودان nullable على ledger_sessions بلا أي مسارٍ مالي (FIFO · payment_splits · realloc لا تُمسّ)
--        · صفر RPC · صفر سياسة (سياساتُ الصفوف القائمة تغطّي الأعمدة الجديدة).
-- ============================================================================

BEGIN;

-- [1] وسمُ خدمة الجهاز بالكتالوج
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS denture_svc text;
ALTER TABLE public.treatments DROP CONSTRAINT IF EXISTS treatments_denture_svc_check;
ALTER TABLE public.treatments ADD CONSTRAINT treatments_denture_svc_check
  CHECK (denture_svc IS NULL OR (denture_svc = ANY (ARRAY['service'::text, 'add'::text]) AND target_part = 'arch'));

-- [2] ربطُ جلسة الخدمة بجهازها
ALTER TABLE public.ledger_sessions ADD COLUMN IF NOT EXISTS denture_unit uuid;
ALTER TABLE public.ledger_sessions ADD COLUMN IF NOT EXISTS denture_add text;
ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_denture_unit_shape;
ALTER TABLE public.ledger_sessions ADD CONSTRAINT ledger_sessions_denture_unit_shape
  CHECK (denture_unit IS NULL OR (tooth_num IS NULL AND arch IS NOT NULL AND unit_teeth IS NULL));
ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_denture_add_format;
ALTER TABLE public.ledger_sessions ADD CONSTRAINT ledger_sessions_denture_add_format
  CHECK (denture_add IS NULL OR (denture_add ~ '^[1-4][1-8](,[1-4][1-8]){0,13}$' AND denture_unit IS NOT NULL));

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

  -- زرع الكتالوج المرجعي (40 علاجاً · كل الأسعار 0)
  -- CATALOG-PARITY-START
  INSERT INTO public.treatments
    (doctor_id, treatment_key, name, label, fill, stroke, price, builtin, needs_lab,
     target_part, category, sort_order, post_extraction, is_favorite, is_active, layman_name, dentition_scope, denture_svc)
  VALUES
    (NEW.id, 'treated', 'حشوة املغم', 'ح', '#312f27', '#22211b', 0, true, false, 'crown', 'restorative', 1, false, true, true, 'حشوة معدنية', 'all', NULL),
    (NEW.id, 'custom_1781292854422', 'حشوة كومبوزت', 'ح', '#0f6b99', '#0b4b6b', 0, false, false, 'crown', 'restorative', 2, false, true, true, 'حشوة تجميلية', 'all', NULL),
    (NEW.id, 'root-canal', 'معالجة لبية', 'ق', '#a78bfa', '#7c5cbf', 0, true, false, 'root', 'endodontics', 3, false, true, true, 'سحب عصب', 'all', NULL),
    (NEW.id, 'custom_1784310641369', 'حشوة عصب', 'ح', '#ff4d6a', '#b3364a', 0, false, false, 'root', 'endodontics', 4, false, true, true, '', 'all', NULL),
    (NEW.id, 'custom_1783204794478', 'اعادة معالجة', 'ا', '#00f2a1', '#00a971', 0, false, false, 'root', 'endodontics', 5, false, true, true, '', 'all', NULL),
    (NEW.id, 'custom_1783255139568', 'وتد فايبر', 'و', '#999999', '#6b6b6b', 0, false, false, 'root', 'endodontics', 6, false, true, true, '', 'all', NULL),
    (NEW.id, 'custom_1784742823602', 'تحضير', 'ت', '#218800', '#175f00', 0, false, true, 'crown_full', 'prosthodontics', 7, false, true, true, 'تحضير الاسنان للتلبيس', 'all', NULL),
    (NEW.id, 'crown', 'تاج خزف على معدن', 'ت', '#ff6b00', '#b34b00', 0, true, true, 'crown_full', 'prosthodontics', 8, false, true, true, 'تاج خزف', 'all', NULL),
    (NEW.id, 'custom_1784821896689', 'تاج زركون', 'ت', '#e5e5f4', '#a0a0ab', 0, false, true, 'crown_full', 'prosthodontics', 9, false, true, true, 'تاج زركونيا', 'all', NULL),
    (NEW.id, 'bridge', 'جسر', 'ج', '#dc2626', '#991b1b', 0, true, true, 'bridge', 'prosthodontics', 10, false, true, true, '', 'all', NULL),
    (NEW.id, 'custom_1784316215415', 'جسر (زركون)', 'ج', '#c44dff', '#8936b3', 0, false, true, 'bridge', 'prosth_cosmetic', 11, false, true, true, '', 'all', NULL),
    (NEW.id, 'extracted', 'قلع', '✕', '#ef5350', '#c62828', 0, true, false, 'extraction', 'surgical', 12, false, true, true, '', 'all', NULL),
    (NEW.id, 'implant', 'زراعة', 'ز', '#b5e0ff', '#7f9db3', 0, true, true, 'implant', 'implantology', 13, false, false, true, '', 'all', NULL),
    (NEW.id, 'socket-graft', 'طعم عظمي (حفاظ سنخ)', 'ط', '#f97316', '#c2410c', 0, false, false, 'whole', 'surgical', 14, true, false, true, '', 'all', NULL),
    (NEW.id, 'socket-dressing', 'ضماد سنخ', 'ض', '#fbbf24', '#b45309', 0, false, false, 'whole', 'surgical', 15, true, false, true, '', 'all', NULL),
    (NEW.id, 'ortho-fixed', 'تقويم ثابت', '⚓', '#f25100', '#a93900', 0, false, true, 'arch', 'orthodontics', 16, false, false, true, '', 'all', NULL),
    (NEW.id, 'ortho-removable', 'تقويم متحرك', '⚙', '#22d3ee', '#0e90a8', 0, false, true, 'arch', 'orthodontics', 17, false, false, true, '', 'all', NULL),
    (NEW.id, 'ortho-retainer', 'مثبّت تقويم', 'ث', '#5eead4', '#2bb3a3', 0, false, true, 'arch', 'orthodontics', 18, false, false, true, '', 'all', NULL),
    (NEW.id, 'cleaning', 'تنظيف', 'ن', '#06b6d4', '#0a809a', 0, false, false, 'mouth', 'preventive', 19, false, false, true, '', 'all', NULL),
    (NEW.id, 'consult', 'استشارة', 'س', '#fb923c', '#c2691f', 0, false, false, 'mouth', 'diagnostic', 20, false, false, true, '', 'all', NULL),
    (NEW.id, 'xray', 'أشعة', 'أ', '#a3a3a3', '#6b6b6b', 0, false, false, 'whole', 'diagnostic', 21, false, false, true, '', 'all', NULL),
    (NEW.id, 'whitening', 'تبييض', 'ب', '#84cc16', '#5a9410', 0, false, false, 'arch', 'cosmetic', 22, false, false, true, '', 'all', NULL),
    (NEW.id, 'perio-scaling', 'تقليح', 'ت', '#f2f200', '#a9a900', 0, false, false, 'mouth', 'periodontics', 23, false, false, true, '', 'all', NULL),
    (NEW.id, 'pedo-spacer', 'حافظ مسافة', 'م', '#d946ef', '#86198f', 0, false, true, 'arch', 'pediatric', 24, false, false, true, '', 'all', NULL),
    (NEW.id, 'pedo-pulpotomy', 'بتر لب', 'ب', '#f472b6', '#be185d', 0, false, false, 'whole', 'pediatric', 25, false, false, true, 'علاج عصب السن اللبني', 'primary', NULL),
    (NEW.id, 'pedo-pulpectomy', 'استئصال لب لبني', 'ا', '#be185d', '#831843', 0, false, false, 'root', 'pediatric', 26, false, false, true, 'سحب عصب السن اللبني', 'primary', NULL),
    (NEW.id, 'pedo-ssc', 'تاج ستانلس ستيل', 'ت', '#94a3b8', '#475569', 0, false, false, 'crown_full', 'pediatric', 27, false, false, true, 'تاج معدني جاهز', 'primary', NULL),
    (NEW.id, 'fissure-sealant', 'سادّ شقوق', 'س', '#2563eb', '#1e40af', 0, false, false, 'crown', 'preventive', 28, false, false, true, 'طبقة حماية من التسوّس', 'all', NULL),
    (NEW.id, 'fluoride', 'تطبيق فلورايد', 'ف', '#0ea5e9', '#0369a1', 0, false, false, 'mouth', 'preventive', 29, false, false, true, '', 'all', NULL),
    (NEW.id, 'denture-full', 'جهاز متحرك كامل', 'ك', '#e11d74', '#9d174d', 0, false, true, 'denture_full', 'prosth_removable', 30, false, false, true, 'طقم أسنان كامل', 'permanent', NULL),
    (NEW.id, 'denture-partial-acrylic', 'جهاز متحرك جزئي (أكريل)', 'ج', '#f4728f', '#be123c', 0, false, true, 'denture_partial', 'prosth_removable', 31, false, false, true, 'طقم أسنان جزئي', 'permanent', NULL),
    (NEW.id, 'denture-partial-metal', 'جهاز متحرك جزئي (هيكل معدني)', 'ج', '#9aa8bd', '#56657b', 0, false, true, 'denture_partial', 'prosth_removable', 32, false, false, true, 'طقم أسنان جزئي بهيكل معدني', 'permanent', NULL),
    (NEW.id, 'denture-partial-flex', 'جهاز متحرك جزئي (مرن)', 'ج', '#b45309', '#78350f', 0, false, true, 'denture_partial', 'prosth_removable', 33, false, false, true, 'طقم أسنان جزئي مرن', 'permanent', NULL),
    (NEW.id, 'denture-reline-chair', 'تبطين جهاز (بالعيادة)', 'ط', '#f9a8d4', '#be185d', 0, false, false, 'arch', 'prosth_removable', 34, false, false, true, 'تعديل قاعدة الطقم لتثبت أكثر', 'permanent', 'service'),
    (NEW.id, 'denture-reline-lab', 'تبطين جهاز (مخبري)', 'ط', '#f472b6', '#9d174d', 0, false, true, 'arch', 'prosth_removable', 35, false, false, true, 'تجديد قاعدة الطقم بالمخبر', 'permanent', 'service'),
    (NEW.id, 'denture-repair', 'إصلاح كسر جهاز', 'ص', '#e2607a', '#9f1239', 0, false, true, 'arch', 'prosth_removable', 36, false, false, true, 'إصلاح كسر بالطقم', 'permanent', 'service'),
    (NEW.id, 'denture-tooth-replace', 'تبديل سن مكسور بالجهاز', 'س', '#fda4af', '#be123c', 0, false, true, 'arch', 'prosth_removable', 37, false, false, true, 'تبديل سن مكسور بالطقم', 'permanent', 'service'),
    (NEW.id, 'denture-add-tooth', 'إضافة سن لجهاز جزئي', '+', '#e879f9', '#86198f', 0, false, true, 'arch', 'prosth_removable', 38, false, false, true, 'إضافة سن للطقم الجزئي', 'permanent', 'add'),
    (NEW.id, 'denture-clasp', 'إضافة أو إصلاح ضمة', 'ض', '#94a3b8', '#475569', 0, false, true, 'arch', 'prosth_removable', 39, false, false, true, 'إضافة أو إصلاح مشبك الطقم', 'permanent', 'service'),
    (NEW.id, 'denture-adjust', 'تعديل جهاز', 'ع', '#fbcfe8', '#be185d', 0, false, false, 'arch', 'prosth_removable', 40, false, false, true, 'تعديل الطقم لإزالة نقاط الضغط', 'permanent', 'service')
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

-- التحقق (يدوياً):
-- SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ledger_sessions' AND column_name IN ('denture_unit','denture_add');
-- SELECT (pg_get_functiondef('public.handle_new_doctor'::regproc) LIKE '%denture-adjust%') AS catalog_40;
