-- Migration 147 — مزامنةُ تفعيل بطاقة الطبيب مع حساب الموظف المرتبط بها
-- ─────────────────────────────────────────────────────────────────────────────
-- البلاغ (المالك بثلاث صور): د. وحيد يزبك «معطّل» بصفحة الموظفين ومخفيٌّ بصفحة أطباء
-- العيادة، لكنه ما زال يظهر بقائمة «أسعار مخصصة للأطباء» بمودال العلاج.
--
-- السبب: حالةُ الطبيب مخزّنةٌ بمكانين — clinic_employees.is_active (الحساب) و
-- clinic_doctors.is_active (البطاقة). مسارا «حذف الموظف» و«تغيير الدور لسكرتيرة»
-- يعطّلان البطاقة، أمّا زرّ «تعطيل الحساب» (toggleActive) فيقلب الأول وحده. صفحةُ
-- الأطباء تُخفي العيب لأنها تتحقّق من الموظف بنفسها؛ وكلُّ ما عداها (منتقي الطبيب
-- بالجلسات ومخطط الأسنان · المواعيد · المخابر · الإعدادات · أسعار العلاجات) يقرأ
-- clinic_doctors.is_active وحده ⇒ طبيبٌ معطّل يبقى قابلاً للاختيار لجلسةٍ جديدة.
--
-- القرار: الإصلاحُ بالمصدر لا بترقيع ستّ صفحات — تريغر يجعل البطاقة تتبع الحساب من
-- أيّ مسارٍ كان (واجهة · SQL يدوي · مسارٌ مستقبلي)، فتصحّ كلُّ القراءات القائمة لأنها
-- أصلاً تفلتر على الحقل الصحيح. التقاريرُ والمحاسبة والرواتب تجلب كلَّ البطاقات وتَسِم
-- المعطّل «(معطل)» ⇒ السجلاتُ التاريخية والمستحقّات لا تُمَسّ.
--
-- الحدود: بطاقةُ المالك (is_owner) لا تُعطَّل أبداً · البطاقةُ من العيادة نفسها فقط
-- (owner_id) · لا كتابةَ إن لم تتغيّر القيمة · علمُ التفعيل وحده — صفر مساس مالي.

CREATE OR REPLACE FUNCTION public.sync_doctor_card_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doctor_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- لا عملَ إن لم يتغيّر التفعيل ولا الربط
  IF TG_OP = 'UPDATE'
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.clinic_doctors cd
     SET is_active  = COALESCE(NEW.is_active, true),
         updated_at = now()
   WHERE cd.id = NEW.doctor_id
     AND cd.owner_id = NEW.owner_id
     AND cd.is_owner IS NOT TRUE
     AND cd.is_active IS DISTINCT FROM COALESCE(NEW.is_active, true);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_doctor_card_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_doctor_card_active ON public.clinic_employees;
CREATE TRIGGER trg_sync_doctor_card_active
  AFTER INSERT OR UPDATE OF is_active, doctor_id ON public.clinic_employees
  FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_card_active();

-- backfill: البطاقاتُ المنحرفة عن حساب موظفها المرتبط (غير المالك)
UPDATE public.clinic_doctors cd
   SET is_active = COALESCE(e.is_active, true), updated_at = now()
  FROM public.clinic_employees e
 WHERE e.doctor_id = cd.id
   AND e.owner_id  = cd.owner_id
   AND cd.is_owner IS NOT TRUE
   AND cd.is_active IS DISTINCT FROM COALESCE(e.is_active, true);

-- التحقق بعد التطبيق (= 0):
--   SELECT count(*) FROM clinic_employees e JOIN clinic_doctors cd ON cd.id = e.doctor_id
--    WHERE cd.is_owner IS NOT TRUE AND cd.is_active IS DISTINCT FROM COALESCE(e.is_active, true);
