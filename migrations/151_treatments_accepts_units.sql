-- ============================================================
-- Migration 151 — treatments.accepts_units (يقبل عدد وحدات)
-- ------------------------------------------------------------
-- الهدف: مفتاحٌ **صريح** بتعريف العلاج يقرّر ظهور حقل «عدد الوحدات» بمودال العلاج،
--        بدل استنتاجه من `category` (v425–v427).
-- المراجعة: Open Dental — «Unit Quantity» حقلٌ على مستوى الإجراء ورسمُه يُضرب به
--        (وبـ21.1 صارت خصوماتُ الخطط تراعيه)؛ Denticon — تبويب Charting بمفاتيح
--        صريحة لكل إجراء (Require Quadrant · Requires 1 or More Teeth)؛ Dentrix
--        Ascend وOrtho2 — «Treatment area» بتعريف الإجراء يحكم خيارات الإدخال.
--        الإجماع: سلوكُ الإدخال يُضبط للإجراء نفسه لا يُستنتج من تصنيفه.
-- لماذا: `category` يخدم التقارير والألوان؛ تحميلُه سلوكَ الإدخال يجبر الطبيب على
--        تغيير تصنيفٍ لإظهار حقل (فيفسد تقاريره)، ويحجب الحقل عن علاجاتٍ تحتاجه
--        فعلاً (تقليحٌ بأربعة أرباع · معالجةٌ لبية متعددة الجذور).
-- الترحيل: تُشغَّل الراية للتصنيفات الأربعة التي كانت تُظهر الحقل ⇒ صفر تغيير
--        محسوس بالعيادات القائمة، وحرّيةٌ كاملة بعدها.
-- الأثر: additive · NOT NULL DEFAULT false · idempotent · صفر RLS · صفر أثر مالي
--        (`units` نفسه عرضيٌّ بحت — M150).
-- ============================================================

BEGIN;

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS accepts_units boolean NOT NULL DEFAULT false;

-- ترحيلٌ لمرّة واحدة: سلوكُ v425–v427 يُحفظ كرايةٍ صريحة.
UPDATE public.treatments SET accepts_units = true
 WHERE accepts_units = false
   AND category = ANY (ARRAY['diagnostic','preventive','cosmetic','other']);

COMMENT ON COLUMN public.treatments.accepts_units IS
  'يقبل عدد وحدات: يُظهر حقل «عدد الوحدات» بمودال العلاج (أشعة ×4، تقليح ×4 أرباع…). مفتاحٌ صريح بتعريف العلاج — لا يُستنتج من التصنيف (نمط Open Dental Unit Quantity · Denticon Charting flags). عرضيٌّ بحت: cost يبقى الإجمالي المخزَّن.';

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='treatments' AND column_name='accepts_units') AS col,   -- 1
  (SELECT count(*) FROM public.treatments WHERE accepts_units)                                                                              AS on_,   -- = عدد صفوف التصنيفات الأربعة
  (SELECT count(*) FROM public.treatments WHERE accepts_units AND category NOT IN ('diagnostic','preventive','cosmetic','other'))           AS stray; -- 0 مباشرةً بعد الهجرة
