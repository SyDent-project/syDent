-- Migration 123: توحيد هوية اسم العيادة + سجل تغيير الاسم بطبقة المنصة
--
-- المشكلة (مُشخَّصة حيّاً): clinic_settings.clinic_name يُشتقّ مرّةً واحدة عند
-- بذر الصف ('عيادة ' || user_metadata.full_name) ثم يتجمّد إلى الأبد. فحين
-- يغيّر الطبيب اسمه الشخصي (auth metadata + مرايا clinic_employees/clinic_doctors)
-- يبقى اسم العيادة حاملاً الاسم القديم — ويظهر كذلك على الروشتة وخطة العلاج
-- وكشف الحساب وتعليمات ما بعد العلاج وقوالب الواتساب وصفحة الحجز والمنشور
-- التوعوي. حساب حيّ فعلي: clinic_name='عيادة د. احمد غنيم' بينما
-- full_name='د. ايهم غنيم'.
--
-- الحل (نمط Stripe: derived-until-overridden — الاسم العام يُشتقّ تلقائياً من
-- اسم الحساب ما دام غير مضبوط صراحةً؛ ونمط Open Dental: بالعيادة الفردية اسم
-- الطبيب هو عنوان العيادة):
--   1) عمود clinic_name_source ('derived' | 'custom') — يُصان **سيرفر-سايد**
--      بتريغر BEFORE فلا يمكن لأي مسار عميل أن يخالفه أو ينساه.
--   2) سجل تغيير الاسم بـsubscription_events (نمط سجل تدقيق Slack: مَن غيّر،
--      ماذا كانت القيمة، وماذا صارت) — بتريغر AFTER لأن سياسة الجدول
--      admin-only بالكتابة فلا يستطيع المستأجر الإدراج بنفسه.
--
-- ما لا تلمسه هذه الهجرة إطلاقاً: trial_requests.name (لقطة التسجيل تبقى
-- مجمّدة عمداً — الفصل بين اسم السجل والاسم المعروض)، وأي جدول مالي، وأي RLS.
--
-- مطبَّقة حيّاً عبر MCP ومؤكَّدة بالاستعلامات في 3 آب 2026.

BEGIN;

-- ═══ 1) مطبّع عربي للمقارنة فقط (لا يغيّر أي قيمة مخزّنة) ═══
-- يوحّد أ/إ/آ/ٱ→ا و ة→ه و ى→ي و ؤ→و و ئ→ي، ويحذف التطويل والنقطة والفاصلة
-- العربية، ويضغط المسافات. بدونه يفشل التصنيف على فرق نقطة واحدة:
-- «عيادة د. احمد غنيم» مقابل «عيادة د احمد غنيم».
CREATE OR REPLACE FUNCTION public.sydent_norm_name(p_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT btrim(regexp_replace(
           translate(
             translate(lower(coalesce(p_txt, '')), 'أإآٱةىؤئ', 'ااااهيوي'),
             'ـ.،', ''),
           '\s+', ' ', 'g'));
$fn$;

-- ═══ 2) عمود مصدر اسم العيادة ═══
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS clinic_name_source text NOT NULL DEFAULT 'derived';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_settings'::regclass
      AND conname  = 'clinic_settings_clinic_name_source_check'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_clinic_name_source_check
      CHECK (clinic_name_source IN ('derived', 'custom'));
  END IF;
END
$do$;

COMMENT ON COLUMN public.clinic_settings.clinic_name_source IS
  'derived = اسم العيادة مشتقّ من اسم الطبيب ويتبع تغييره · custom = اسم تجاري اختاره الطبيب فلا يُلمس تلقائياً أبداً. يُصان بتريغر BEFORE — لا يُكتب من العميل إلا بقرار «احتفظ بالاسم الحالي».';

-- ═══ 3) Backfill — أحادي الاتجاه (يرقّي إلى custom فقط، ولا يُنزل أبداً) ═══
-- المقارنة مع **اسم التسجيل المجمّد** (trial_requests.name) لا مع الاسم الحالي
-- بالـmetadata: الاسم الحالي قد يكون انحرف بالفعل (وهذا هو البغ نفسه)، بينما
-- اسم التسجيل هو ما بُذر منه clinic_name أصلاً. الاتجاه الأحادي يجعل إعادة
-- التشغيل آمنة: قرار «custom» لا يُداس أبداً.
UPDATE public.clinic_settings cs
SET clinic_name_source = 'custom'
FROM (
  SELECT c.owner_id,
         public.sydent_norm_name(c.clinic_name) AS cur,
         public.sydent_norm_name(
           'عيادة ' || coalesce(
             nullif(btrim(coalesce(tr.name, u.raw_user_meta_data ->> 'full_name',
                                              u.raw_user_meta_data ->> 'name')), ''),
             '~~no-reference~~')
         ) AS der
  FROM public.clinic_settings c
  LEFT JOIN auth.users u ON u.id = c.owner_id
  LEFT JOIN LATERAL (
    SELECT t.name
    FROM public.trial_requests t
    WHERE t.user_id = c.owner_id
    ORDER BY t.created_at DESC
    LIMIT 1
  ) tr ON TRUE
  WHERE nullif(btrim(coalesce(c.clinic_name, '')), '') IS NOT NULL
) x
WHERE cs.owner_id = x.owner_id
  AND cs.clinic_name_source = 'derived'
  AND x.cur <> x.der;

-- ═══ 4) صيانة العلم سيرفر-سايد (BEFORE) ═══
-- يعيد الحساب عند كل كتابة لـclinic_name أياً كان مصدرها (مسار الإعدادات ·
-- upsert الواتساب · أي مسار مستقبلي)، فيستحيل أن ينحرف العلم عن الواقع.
-- اسم فارغ ⇒ derived (لا شيء يُحمى). لا مرجع للاشتقاق ⇒ custom (الاتجاه الآمن:
-- لا نلمس اسماً لا نعرف أصله).
CREATE OR REPLACE FUNCTION public.sydent_clinic_name_source_maint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_owner_name text;
BEGIN
  IF nullif(btrim(coalesce(NEW.clinic_name, '')), '') IS NULL THEN
    NEW.clinic_name_source := 'derived';
    RETURN NEW;
  END IF;

  SELECT nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name',
                               u.raw_user_meta_data ->> 'name', '')), '')
    INTO v_owner_name
  FROM auth.users u
  WHERE u.id = NEW.owner_id;

  IF v_owner_name IS NULL THEN
    NEW.clinic_name_source := 'custom';
    RETURN NEW;
  END IF;

  IF public.sydent_norm_name(NEW.clinic_name)
     = public.sydent_norm_name('عيادة ' || v_owner_name) THEN
    NEW.clinic_name_source := 'derived';
  ELSE
    NEW.clinic_name_source := 'custom';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_clinic_settings_name_source ON public.clinic_settings;
CREATE TRIGGER trg_clinic_settings_name_source
BEFORE INSERT OR UPDATE OF clinic_name ON public.clinic_settings
FOR EACH ROW
EXECUTE FUNCTION public.sydent_clinic_name_source_maint();

-- ═══ 5) subscription_events: عمودا القيمة + توسيع قيد نوع الحدث ═══
-- from_value/to_value عامّان عمداً (نمط previous_attributes عند Stripe): أي حدث
-- «تغيّرت قيمة» مستقبلي يستعملهما بلا عمود جديد.
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS from_value text;
ALTER TABLE public.subscription_events ADD COLUMN IF NOT EXISTS to_value   text;

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;
ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'accept', 'convert_monthly', 'convert_yearly', 'renew', 'extend', 'shorten',
    'enter_grace', 'reactivate', 'suspend', 'delete', 'activate_permanent',
    'convert_permanent_yearly', 'reject', 'promote_to_admin', 'demote_from_admin',
    'plan_updated', 'template_updated', 'convert_plan', 'plan_created',
    'plan_deleted', 'ai_override_set',
    'clinic_name_changed', 'owner_name_changed'
  ]));

-- ═══ 6) سجل تغيير اسم العيادة (AFTER) ═══
-- التدقيق **لا يُفشل حفظ الطبيب أبداً**: أي خطأ هنا يُبتلع (سابقة logAudit
-- غير القاتل). الكتابة تمرّ رغم سياسة admin-only لأن الدالة SECURITY DEFINER
-- ومالكها مالك الجدول (relforcerowsecurity = false — متحقَّق حيّاً).
CREATE OR REPLACE FUNCTION public.sydent_log_clinic_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tr          uuid;
  v_actor       uuid;
  v_owner_email text;
  v_actor_email text;
  v_by          text;
BEGIN
  BEGIN
    SELECT t.id INTO v_tr
    FROM public.trial_requests t
    WHERE t.user_id = NEW.owner_id
    ORDER BY t.created_at DESC
    LIMIT 1;

    SELECT u.email INTO v_owner_email FROM auth.users u WHERE u.id = NEW.owner_id;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      v_by := 'system';
    ELSIF v_actor = NEW.owner_id THEN
      v_by := 'tenant:' || coalesce(v_owner_email, NEW.owner_id::text);
    ELSE
      SELECT u.email INTO v_actor_email FROM auth.users u WHERE u.id = v_actor;
      v_by := 'other:' || coalesce(v_actor_email, v_actor::text);
    END IF;

    INSERT INTO public.subscription_events
      (trial_request_id, user_id, event_type, from_value, to_value, notes, performed_by)
    VALUES
      (v_tr, NEW.owner_id, 'clinic_name_changed',
       OLD.clinic_name, NEW.clinic_name,
       'غيّر العميل اسم العيادة من صفحة الإعدادات', v_by);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_clinic_settings_name_audit ON public.clinic_settings;
CREATE TRIGGER trg_clinic_settings_name_audit
AFTER UPDATE ON public.clinic_settings
FOR EACH ROW
WHEN (OLD.clinic_name IS DISTINCT FROM NEW.clinic_name
      AND nullif(btrim(coalesce(OLD.clinic_name, '')), '') IS NOT NULL)
EXECUTE FUNCTION public.sydent_log_clinic_name_change();

-- ═══ 7) سجل تغيير اسم الطبيب المالك (AFTER) ═══
-- الاسم الشخصي مصدرُه auth.users.user_metadata (لا تريغر على مخطّط auth)، لكن
-- settings.html يعكسه فوراً على clinic_employees لصفّ المالك — فنلتقطه من
-- المرآة القائمة: صفر عمود جديد وصفر مساس بمخطّط auth.
CREATE OR REPLACE FUNCTION public.sydent_log_owner_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tr          uuid;
  v_actor       uuid;
  v_owner_email text;
  v_actor_email text;
  v_by          text;
BEGIN
  BEGIN
    SELECT t.id INTO v_tr
    FROM public.trial_requests t
    WHERE t.user_id = NEW.owner_id
    ORDER BY t.created_at DESC
    LIMIT 1;

    SELECT u.email INTO v_owner_email FROM auth.users u WHERE u.id = NEW.owner_id;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      v_by := 'system';
    ELSIF v_actor = NEW.owner_id THEN
      v_by := 'tenant:' || coalesce(v_owner_email, NEW.owner_id::text);
    ELSE
      SELECT u.email INTO v_actor_email FROM auth.users u WHERE u.id = v_actor;
      v_by := 'other:' || coalesce(v_actor_email, v_actor::text);
    END IF;

    INSERT INTO public.subscription_events
      (trial_request_id, user_id, event_type, from_value, to_value, notes, performed_by)
    VALUES
      (v_tr, NEW.owner_id, 'owner_name_changed',
       OLD.name, NEW.name,
       'غيّر العميل اسمه الشخصي من صفحة الإعدادات', v_by);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_clinic_employees_owner_name_audit ON public.clinic_employees;
CREATE TRIGGER trg_clinic_employees_owner_name_audit
AFTER UPDATE ON public.clinic_employees
FOR EACH ROW
WHEN (NEW.role = 'owner'
      AND OLD.name IS DISTINCT FROM NEW.name
      AND nullif(btrim(coalesce(OLD.name, '')), '') IS NOT NULL)
EXECUTE FUNCTION public.sydent_log_owner_name_change();

-- ═══ 8) تضييق الصلاحيات على دوال التريغر الثلاث ═══
-- دوال التريغر لا تُنادى من الواجهة إطلاقاً — تُنادى من محرّك Postgres وحده.
-- بلا هذا السحب يُبقيها منح PUBLIC الافتراضي ظاهرةً بجرد مدقّق Supabase
-- الأمني كدوال SECURITY DEFINER قابلة للتنفيذ من anon/authenticated.
-- (مطبَّق حيّاً؛ التحذيرات الثلاثة اختفت من المدقّق بعده.)
REVOKE ALL ON FUNCTION public.sydent_clinic_name_source_maint() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sydent_log_clinic_name_change()   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sydent_log_owner_name_change()    FROM public, anon, authenticated;

COMMIT;

-- ═══ تحقق (يُتوقَّع كله t) ═══
-- SELECT count(*) = 1 AS col_ok FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='clinic_name_source';
-- SELECT pg_get_constraintdef(oid) LIKE '%clinic_name_changed%' AS check_ok
--   FROM pg_constraint WHERE conname='subscription_events_event_type_check';
-- SELECT count(*) = 3 AS trg_ok FROM pg_trigger
--   WHERE tgname IN ('trg_clinic_settings_name_source','trg_clinic_settings_name_audit','trg_clinic_employees_owner_name_audit');
-- SELECT clinic_name, clinic_name_source FROM public.clinic_settings ORDER BY clinic_name_source;
