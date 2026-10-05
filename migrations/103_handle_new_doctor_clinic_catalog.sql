-- Migration 103 — handle_new_doctor: seed the reference clinic catalogue (24 rows, price 0)
-- ═══════════════════════════════════════════════════════════════════════════════
-- المشكلة: الـtrigger `handle_new_doctor` كان يزرع 9 علاجات قديمة **بأسعار** لحظة
-- إنشاء الحساب. فالحساب الجديد يفتح على قائمة قديمة ليست قائمة العيادة المرجعية،
-- كما أن الزرع التلقائي في `treatments.html` يتخطّى نفسه (شرطه `treatments.length===0`)
-- ⇒ المالك مضطرّ لضغط «استعادة الافتراضي» يدوياً.
--
-- الحل: استبدال قائمة الزرع داخل الدالة بـ«الكتالوج المرجعي» نفسه الموجود في
-- `CLINIC_CATALOG` (treatments.html) — 24 علاجاً، **كل الأسعار 0**، بكل الحقول
-- (لون/تسمية/فئة/يطبّق-على/مخبر/مفضلة/اسم مبسّط/ترتيب صريح 1..24).
--
-- ما لم يُمسّ: إنشاء صف الطبيب · ON CONFLICT DO NOTHING · معالج الاستثناء
-- (عدم منع التسجيل) · SECURITY DEFINER · search_path · الـtrigger نفسه على auth.users.
--
-- تماثل مضمون: الحارس العاشر `scripts/check-catalog-parity.js` يقارن جدول القيم
-- أدناه بـ`CLINIC_CATALOG` حقلاً بحقل في كل تشغيل لـ`validate.sh`.
--
-- idempotent: CREATE OR REPLACE — يمكن تشغيلها أكثر من مرة بلا أثر جانبي.
-- ═══════════════════════════════════════════════════════════════════════════════

-- [0] تأكيد وجود كل الأعمدة قبل الاستبدال.
-- ضروري لأن جسم plpgsql لا يُتحقَّق منه وقت الإنشاء: عمود ناقص يفشل **وقت التشغيل**
-- ويبتلعه معالج الاستثناء بصمت ⇒ طبيب جديد بصفر علاجات. هذا الفحص يمنع ذلك مسبقاً.
DO $guard$
DECLARE missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['doctor_id','treatment_key','name','label','fill','stroke','price',
                    'builtin','needs_lab','target_part','category','sort_order',
                    'post_extraction','is_favorite','is_active','layman_name']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'treatments' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 103 aborted — missing columns in public.treatments: %', missing;
  END IF;
END
$guard$;

-- [1] استبدال الدالة.
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

  -- زرع الكتالوج المرجعي (24 علاجاً · كل الأسعار 0)
  -- CATALOG-PARITY-START
  INSERT INTO public.treatments
    (doctor_id, treatment_key, name, label, fill, stroke, price, builtin, needs_lab,
     target_part, category, sort_order, post_extraction, is_favorite, is_active, layman_name)
  VALUES
    (NEW.id, 'treated', 'حشوة املغم', 'ح', '#312f27', '#22211b', 0, true, false, 'crown', 'restorative', 1, false, true, true, 'حشوة معدنية'),
    (NEW.id, 'custom_1781292854422', 'حشوة كومبوزت', 'ح', '#0f6b99', '#0b4b6b', 0, false, false, 'crown', 'restorative', 2, false, true, true, 'حشوة تجميلية'),
    (NEW.id, 'root-canal', 'معالجة لبية', 'ق', '#a78bfa', '#7c5cbf', 0, true, false, 'root', 'endodontics', 3, false, true, true, 'سحب عصب'),
    (NEW.id, 'custom_1784310641369', 'حشوة عصب', 'ح', '#ff4d6a', '#b3364a', 0, false, false, 'root', 'endodontics', 4, false, true, true, ''),
    (NEW.id, 'custom_1783204794478', 'اعادة معالجة', 'ا', '#00f2a1', '#00a971', 0, false, false, 'root', 'endodontics', 5, false, true, true, ''),
    (NEW.id, 'custom_1783255139568', 'وتد فايبر', 'و', '#999999', '#6b6b6b', 0, false, false, 'root', 'endodontics', 6, false, true, true, ''),
    (NEW.id, 'custom_1784742823602', 'تحضير', 'ت', '#218800', '#175f00', 0, false, true, 'crown_full', 'prosthodontics', 7, false, true, true, 'تحضير الاسنان للتلبيس'),
    (NEW.id, 'crown', 'تاج خزف على معدن', 'ت', '#ff6b00', '#b34b00', 0, true, true, 'crown_full', 'prosthodontics', 8, false, true, true, 'تاج خزف'),
    (NEW.id, 'custom_1784821896689', 'تاج زركون', 'ت', '#e5e5f4', '#a0a0ab', 0, false, true, 'crown_full', 'prosthodontics', 9, false, true, true, 'تاج زركونيا'),
    (NEW.id, 'bridge', 'جسر', 'ج', '#dc2626', '#991b1b', 0, true, true, 'bridge', 'prosthodontics', 10, false, true, true, ''),
    (NEW.id, 'custom_1784316215415', 'جسر (زركون)', 'ج', '#c44dff', '#8936b3', 0, false, true, 'bridge', 'prosth_cosmetic', 11, false, true, true, ''),
    (NEW.id, 'extracted', 'قلع', '✕', '#ef5350', '#c62828', 0, true, false, 'extraction', 'surgical', 12, false, true, true, ''),
    (NEW.id, 'implant', 'زراعة', 'ز', '#b5e0ff', '#7f9db3', 0, true, true, 'implant', 'implantology', 13, false, false, true, ''),
    (NEW.id, 'socket-graft', 'طعم عظمي (حفاظ سنخ)', 'ط', '#f97316', '#c2410c', 0, false, false, 'whole', 'surgical', 14, true, false, true, ''),
    (NEW.id, 'socket-dressing', 'ضماد سنخ', 'ض', '#fbbf24', '#b45309', 0, false, false, 'whole', 'surgical', 15, true, false, true, ''),
    (NEW.id, 'ortho-fixed', 'تقويم ثابت', '⚓', '#f25100', '#a93900', 0, false, true, 'arch', 'orthodontics', 16, false, false, true, ''),
    (NEW.id, 'ortho-removable', 'تقويم متحرك', '⚙', '#22d3ee', '#0e90a8', 0, false, true, 'arch', 'orthodontics', 17, false, false, true, ''),
    (NEW.id, 'ortho-retainer', 'مثبّت تقويم', 'ث', '#5eead4', '#2bb3a3', 0, false, true, 'arch', 'orthodontics', 18, false, false, true, ''),
    (NEW.id, 'cleaning', 'تنظيف', 'ن', '#06b6d4', '#0a809a', 0, false, false, 'mouth', 'preventive', 19, false, false, true, ''),
    (NEW.id, 'consult', 'استشارة', 'س', '#fb923c', '#c2691f', 0, false, false, 'mouth', 'diagnostic', 20, false, false, true, ''),
    (NEW.id, 'xray', 'أشعة', 'أ', '#a3a3a3', '#6b6b6b', 0, false, false, 'whole', 'diagnostic', 21, false, false, true, ''),
    (NEW.id, 'whitening', 'تبييض', 'ب', '#84cc16', '#5a9410', 0, false, false, 'arch', 'cosmetic', 22, false, false, true, ''),
    (NEW.id, 'perio-scaling', 'تقليح', 'ت', '#f2f200', '#a9a900', 0, false, false, 'mouth', 'periodontics', 23, false, false, true, ''),
    (NEW.id, 'pedo-spacer', 'حافظ مسافة', 'م', '#d946ef', '#86198f', 0, false, true, 'arch', 'pediatric', 24, false, false, true, '')
  ON CONFLICT (doctor_id, treatment_key) DO NOTHING;
  -- CATALOG-PARITY-END

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- نسجّل الخطأ لكن لا نمنع التسجيل
  RAISE WARNING 'handle_new_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- [2] استعلامات التحقق (تُشغَّل بعد التطبيق).
-- (أ) عدد صفوف الزرع داخل الدالة = 24، والأسعار كلها 0:
--     SELECT (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '(NEW.id, ', ''))) / length('(NEW.id, ') AS seed_rows
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname='public' AND p.proname='handle_new_doctor';
--     -- المتوقع: 24
--
-- (ب) الـtrigger ما زال مربوطاً على auth.users:
--     SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
--     -- المتوقع: يتضمن on_auth_user_created (أو الاسم المستخدم لديك)
