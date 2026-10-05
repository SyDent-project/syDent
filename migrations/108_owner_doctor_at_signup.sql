-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 108 — طبيب-المالك يُزرع لحظة التسجيل (إغلاق سباق «الزيارة الأولى»)
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة (اكتُشفت 27/07/2026 بحساب اختبار الدولار):
--   صف طبيب-المالك في clinic_doctors كان يُنشأ **بكسل** عند أول زيارة
--   لصفحة doctors.html. هذا فتح نافذتين:
--     (أ) جلسات تُسجَّل قبل أول زيارة ⇒ لا طبيب افتراضي ⇒ provider_id فارغ
--         ⇒ «غير محدد» في التقارير والمحاسبة.
--     (ب) إنشاء موظف-طبيب من employees.html قبل أول زيارة ⇒ الجدول فيه صف
--         واحد (الطبيب المعيَّن) ⇒ بوابة doctors.html القديمة
--         (allRows.length===0) تتخطى إنشاء المالك ⇒ «الشفاء الذاتي» يرقّي
--         صف الطبيب المعيَّن إلى is_owner ثم توحيد الاسم يعيد تسميته باسم
--         المالك — اختطاف هوية الطبيب المعيَّن بالكامل.
--
-- الحل الجذري: زرع صف طبيب-المالك في **نفس لحظة التسجيل** عبر تريغر ثانٍ
-- معزول على auth.users. عمداً دالة+تريغر مستقلان (لا توسعة handle_new_doctor):
--   • كتالوج handle_new_doctor محروس بـcheck-catalog-parity ضد
--     migrations/103 حصراً — أي إعادة تعريف تنسخ 24 صفاً وتفتح باب انحراف
--     صامت خارج نطاق الحارس.
--   • نمط «الطبقة المعزولة» (Rule #263): مسؤولية واحدة، ملف واحد، رجوع أسهل.
-- ترتيب التريغرين على auth.users غير مهم — جدولان مستقلان.
--
-- التطابق مع طبقة العميل: نفس قيم bootstrap القائم في doctors.html
--   (name من metadata، role='طبيب أسنان'، color='var(--green)'،
--    user_id=uid، is_owner=true، is_active=true) — provider_type/compensation
--   تُترك لافتراضيات الجدول ('doctor'/'percentage')، متوافقة مع تريغر
--   Migration 19 (enforce_clinical_provider_type: 'doctor' سريري ⇒ يمرّ).
--
-- الأمان والمتانة:
--   • SECURITY DEFINER (نمط handle_new_doctor نفسه) — يتجاوز RLS لأن
--     auth.uid() غير متاح داخل تريغر التسجيل.
--   • حارس WHERE NOT EXISTS ⇒ idempotent (لا صف مالك ثانٍ أبداً).
--   • EXCEPTION WHEN OTHERS ⇒ أي فشل يسجَّل كتحذير ولا يعطّل التسجيل إطلاقاً.
--   • FK owner_id→auth.users مُرضى بطبيعة AFTER INSERT (الصف موجود).
--
-- ملاحظة موثَّقة: مدراء المنصة المستقبليون (platform_admins) سيحصلون أيضاً
-- على صف clinic_doctors عند تسجيلهم — كما يحصلون اليوم على صف doctors من
-- handle_new_doctor. الصف خامل ومعزول بعزل RLS على owner_id؛ لا أثر تشغيلي.
--
-- العزل المالي: صفر لمس لأي جدول أو رقم مالي — INSERT وحيد في جدول هوية.
-- الحسابات القائمة: لا backfill هنا — doctors.html (نفس الكومِت) يتكفّل
-- بإنشاء/ترقية صف المالك للحسابات القديمة عند أول زيارة، بمنطق مُصحَّح
-- لا يخطف صفوف الأطباء المعيَّنين.
-- ═══════════════════════════════════════════════════════════════════════════

-- [1] الدالة
CREATE OR REPLACE FUNCTION public.handle_new_owner_doctor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.clinic_doctors
    (owner_id, user_id, name, role, color, is_owner, is_active)
  SELECT
    NEW.id,
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'الطبيب الرئيسي'
    ),
    'طبيب أسنان',
    'var(--green)',
    true,
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_doctors
    WHERE owner_id = NEW.id AND is_owner = true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- نسجّل الخطأ لكن لا نمنع التسجيل (نفس فلسفة handle_new_doctor)
  RAISE WARNING 'handle_new_owner_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- [2] التريغر (idempotent: إسقاط ثم إنشاء)
DROP TRIGGER IF EXISTS on_auth_user_created_owner_doctor ON auth.users;
CREATE TRIGGER on_auth_user_created_owner_doctor
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_owner_doctor();

-- ═══════════════════════════════════════════════════════════════════════════
-- [3] استعلامات التحقق (تُشغَّل بعد التطبيق)
-- (أ) الدالة موجودة:
--     SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'handle_new_owner_doctor';
--     -- المتوقع: صف واحد
--
-- (ب) التريغران كلاهما مربوطان على auth.users:
--     SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
--     ORDER BY tgname;
--     -- المتوقع: يتضمن on_auth_user_created و on_auth_user_created_owner_doctor
--
-- (ج) اختبار حي: أنشئ حساباً تجريبياً جديداً ثم:
--     SELECT name, is_owner, user_id = owner_id AS self_linked, provider_type
--     FROM clinic_doctors WHERE owner_id = '<uid الحساب الجديد>';
--     -- المتوقع: صف واحد، is_owner=true، self_linked=true، provider_type='doctor'
-- ═══════════════════════════════════════════════════════════════════════════
