-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 142 — نافذة المحو: حذفُ الحساب المحجوب يمسح ملفاته فعلاً
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة (مراجعة M141، 17 أيلول 2026): سياسةُ التخزين sub_gate_pf_select/delete
-- تمنع الحسابَ المحجوب ('none' — تجربةٌ منتهية) من قراءة ملفاته وحذفها. و«قائمة
-- الملفات» تحت RLS لا تُرجع خطأً بل قائمةً فارغة، فكان مسارُ الحذف سيظنّ ألّا ملفات
-- ويحذف الحساب تاركاً صور المرضى بالتخزين. المالك طلب زرّ الحذف بصفحة الاشتراك
-- (الصفحة الوحيدة المتاحة للمحجوب) ⇒ يجب أن يعمل المحوُ لهذه الحالة.
--
-- الحل: «نافذة محو» مدتها 15 دقيقة يفتحها مسارُ الحذف وحده (بعد إعادة التحقق من
-- كلمة المرور بالعميل): خلالها يرى الحسابُ ملفاتِه هو ويحذفها ولو كان محجوباً، ثم
-- تعود السياسة كما كانت. ملفاتُ غيره لا تُمسّ أبداً (سياساتُ المجلد الأصلية تبقى).
-- ومعها عدّادٌ من القاعدة يتحقق به العميل أن القائمة كاملة قبل المحو وأنها صفرٌ بعده.
--
-- ما لا يتغيّر: مستوى الوصول للجداول (المحجوب يبقى محجوباً)، والرفع/التعديل
-- (full وحده)، وdelete_my_account وتسلسل M140.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) عمود بداية النافذة على صفّ الحساب (جدول منصة — خارج بوابة M141)
ALTER TABLE public.trial_requests ADD COLUMN IF NOT EXISTS wipe_started_at timestamptz;
COMMENT ON COLUMN public.trial_requests.wipe_started_at IS
  'M142 — بداية نافذة محو الحساب (15 دقيقة): يضبطها begin_account_wipe() وحدها.';

-- لا يضبطه العميل بإدراجٍ ذاتي (التحديث الذاتي غير مسموح أصلاً؛ الإدراج الذاتي مسموح
-- لطلبٍ جديد) — سياسةٌ مقيِّدة تُضاف دون مساس بالسياسات القائمة.
DROP POLICY IF EXISTS wipe_insert_guard ON public.trial_requests;
CREATE POLICY wipe_insert_guard ON public.trial_requests AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (wipe_started_at IS NULL OR (SELECT public.is_platform_admin()));

-- 2) فتحُ النافذة — لصفّ المستخدم نفسه فقط
CREATE OR REPLACE FUNCTION public.begin_account_wipe()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.trial_requests SET wipe_started_at = v_now WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_account' USING ERRCODE = '42501';
  END IF;
  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_account_wipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_account_wipe() TO authenticated;

-- 3) هل النافذة مفتوحة للمستخدم الحالي؟ (تستدعيها السياسات)
CREATE OR REPLACE FUNCTION public.my_wipe_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trial_requests
    WHERE user_id = auth.uid()
      AND wipe_started_at IS NOT NULL
      AND wipe_started_at > now() - interval '15 minutes'
  );
$$;
REVOKE ALL ON FUNCTION public.my_wipe_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_wipe_open() TO authenticated;

-- 4) عددُ ملفات المستخدم بالتخزين — مرجعُ العميل للتحقق من اكتمال القائمة وصفريتها بعد المحو
CREATE OR REPLACE FUNCTION public.my_storage_object_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT count(*)::int
  FROM storage.objects o
  WHERE o.bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(o.name))[1] = auth.uid()::text;
$$;
REVOKE ALL ON FUNCTION public.my_storage_object_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_object_count() TO authenticated;

-- 5) سياستا القراءة والحذف بالتخزين: + النافذة (الرفع والتعديل بلا تغيير)
DROP POLICY IF EXISTS sub_gate_pf_select ON storage.objects;
DROP POLICY IF EXISTS sub_gate_pf_delete ON storage.objects;
CREATE POLICY sub_gate_pf_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'patient-files'
         OR (SELECT public.my_access_level()) <> 'none'
         OR (SELECT public.my_wipe_open()));
CREATE POLICY sub_gate_pf_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'patient-files'
         OR (SELECT public.my_access_level()) <> 'none'
         OR (SELECT public.my_wipe_open()));

-- 6) توكيد: أربع سياسات بوابة على التخزين، والقراءة والحذف يحملان النافذة
DO $$
DECLARE n int; s text; d text;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'sub_gate_pf_%';
  IF n <> 4 THEN RAISE EXCEPTION 'M142: expected 4 storage gate policies, found %', n; END IF;
  SELECT qual INTO s FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'sub_gate_pf_select';
  SELECT qual INTO d FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'sub_gate_pf_delete';
  IF s NOT LIKE '%my_wipe_open%' OR d NOT LIKE '%my_wipe_open%' THEN
    RAISE EXCEPTION 'M142: wipe window missing from select/delete storage gates';
  END IF;
END $$;

COMMIT;
