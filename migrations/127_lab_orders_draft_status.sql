-- ═══════════════════════════════════════════════════════════════════════
-- Migration 127 — حالة «مسودة» لطلب المخبر (لم يُرسَل بعد)
-- ═══════════════════════════════════════════════════════════════════════
-- الفجوة: القيد الحالي يسمح بستّ حالات أوّلها 'sent'، والافتراضي 'sent' —
-- أي أن أوّل لحظة وجودٍ للطلب هي «تم التسليم للمخبر». فطلبٌ يُنشأ على علاجٍ
-- ما زال **مخطَّطاً** (الطبعة لم تُؤخذ بعد ولا شيء عند المخبر فعلياً) يُعدّ
-- فوراً «قيد العمل» ويصنع **ذمّةً حقيقية** للمخبر — التزامٌ على عيادةٍ لم
-- تُرسِل شيئاً.
--
-- المرجع المهني (بحث المنافسين): كلُّهم يملكون حالةً قبل الإرسال —
--   · Carestream/Sensei: الحالة الافتراضية «Lab Not Ready» وتُعدَّل يدوياً
--   · OpenDental: تاريخ الإرسال حقلٌ منفصل يُملأ، والتكلفة للتتبّع لا للحساب
--   · Dentrix: يسوّقون للمنتج على هذا الوجع حرفياً — «طلبٌ حسبتَه انبعت وما انبعت»
-- ولا واحدٌ منهم يقلب الحالة تلقائياً عند إنجاز العلاج، ولذلك الإرسال هنا
-- **فعلٌ صريح بيد الطبيب** لا كتابةٌ مالية تنفجر من فعلٍ سريري.
--
-- النموذج: 'draft' ⇔ date_sent IS NULL. والعمود nullable أصلاً ⇒ صفر ALTER
-- عليه، والمحاسبة تفلتر بـ date_sent بمدى الفترة فالـNULL يسقط منها بالبناء
-- (المقارنة مع NULL لا تصحّ أبداً) ⇒ **صفر لمسٍ للطبقة المالية**.
--
-- additive + idempotent: القيمة الجديدة تُضاف ولا تُحذف قيمة، والافتراضي يبقى
-- 'sent' حرفياً فكل مسارٍ قائم بلا تغيير سلوكي، وصفر صفٍّ يحتاج ترحيلاً.
-- صفر تغيير RLS (سياسة doctor_id قائمة منذ نشأة الجدول).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_status_check;

ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,      -- جديد: أُنشئ ولم يُرسَل بعد (date_sent IS NULL)
    'sent'::text,
    'received'::text,
    'checked'::text,
    'delivered'::text,
    'redo'::text,
    'rejected'::text
  ]));

-- الثابت الذي يمنع الحالتين من الانحراف: مسوّدةٌ بتاريخ إرسال تناقضٌ صريح،
-- وطلبٌ مُرسَل بلا تاريخ يُفقِد المحاسبة نافذتها. يُفرَض بالقاعدة لا بالنيّة.
ALTER TABLE public.lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_draft_no_date_sent;

ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_draft_no_date_sent
  CHECK (
    (status = 'draft' AND date_sent IS NULL)
    OR (status <> 'draft' AND date_sent IS NOT NULL)
  );

-- فهرس جزئي: المسودّات قِلّة بطبيعتها وتُستعلَم كشريحةٍ مستقلة.
CREATE INDEX IF NOT EXISTS idx_lab_orders_draft
  ON public.lab_orders (doctor_id)
  WHERE status = 'draft';

-- ── تقرير تحقّق ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad   integer;
  v_draft integer;
BEGIN
  SELECT count(*) INTO v_bad   FROM public.lab_orders WHERE date_sent IS NULL;
  SELECT count(*) INTO v_draft FROM public.lab_orders WHERE status = 'draft';
  RAISE NOTICE 'M127 ✓ القيد وُسّع · صفوف بلا تاريخ إرسال: % · مسودّات: %', v_bad, v_draft;
END $$;
