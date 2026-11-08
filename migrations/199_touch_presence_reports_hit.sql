-- 199 — touch_presence() تُبلغ هل وجدت صفّاً تختمه (8 تشرين الثاني 2026)
--
-- الفجوة (فحص لوحة الأدمن على نسخة المطور): حسابٌ جديد يفتح الداشبورد أول مرة —
-- نبضةُ التواجد تُطلَق من autoInit قبل أن يزرع onboarding صفَّ clinic_settings،
-- فتطابق UPDATE صفرَ صفوف بصمت، والعميلُ يختم localStorage على أنها نجحت ويسكت
-- 10 دقائق: الطبيبُ يبدو «غير متصل · آخر ظهور = لحظة التسجيل» وهو يتصفّح.
--
-- القرار: لا INSERT من هنا — زرعُ الصف يبقى مكاناً واحداً (onboarding بـsupabase-init.js:
-- اسمُ العيادة والعملة والفرع والرقم النقابي من user_metadata)، وصفٌّ عارٍ من الـDB
-- كان سيُسقط ذلك الزرع كلَّه. بدلاً منه: الدالة تُرجع true عند ختم صفّ وfalse عند
-- غيابه، والعميلُ يمسح ختمَ المهلة عند false فتُعاد النبضةُ بأول نبضةٍ تالية
-- (بعد الزرع بثوانٍ). متوافقٌ رجعياً: العميلُ القديم يتجاهل القيمة المعادة.
-- الصلاحيات كما بـM141 (authenticated فقط؛ anon ممنوع بالاسم فتصلح بعد M198).

-- تغييرُ نوع الإرجاع يستلزم DROP (لا تعتمد عليها سياسة RLS ولا دالةٌ أخرى — مُتحقَّق).
DROP FUNCTION IF EXISTS public.touch_presence();
CREATE FUNCTION public.touch_presence()
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE public.clinic_settings SET last_seen_at = now()
    WHERE owner_id = auth.uid()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;
REVOKE EXECUTE ON FUNCTION public.touch_presence() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_presence() TO authenticated, service_role;
