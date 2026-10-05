-- Migration 112: lab order templates (قوالب طلب المخبر)
-- نظير حرفي لـ post_op_templates (M56) / clinical_note_templates (M95) /
-- implant_templates (M99): قوالب المالك مشتركة عبر كل المرضى.
-- ADDITIVE + idempotent. 🔒 معزول عن المالية: هذا الجدول لا يُقرأ من أي طبقة
-- محاسبية إطلاقاً؛ التكلفة هنا قيمة افتراضية تُعبَّأ بحقل مرئي قابل للتعديل،
-- والكتابة تبقى حصراً عبر مسار lab_orders القائم بلا أي تغيير.
--
-- الحمولة = الجزء القابل لإعادة الاستخدام فقط:
--   treatment_key · lab_id · shade · cost · due_days · notes
-- المستثنى عمداً (خاص بكل حالة):
--   رقم السن · ربط الموعد · الطبيب المعالج · تاريخ الإرسال.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lab_order_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  treatment_key TEXT,
  lab_id        UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  shade         TEXT,
  cost          NUMERIC,
  due_days      INTEGER,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lab_order_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_order_templates_owner_all" ON public.lab_order_templates;
CREATE POLICY "lab_order_templates_owner_all" ON public.lab_order_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_lab_order_templates_owner
  ON public.lab_order_templates(owner_id, created_at DESC);

COMMIT;

-- ── التحقق (قاعدة #238) ──
SELECT
  (SELECT to_regclass('public.lab_order_templates') IS NOT NULL)::int
    AS table_ok,                                          -- المتوقع: 1
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'lab_order_templates')
    AS policies,                                          -- المتوقع: 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'lab_order_templates'
       AND indexname = 'idx_lab_order_templates_owner')
    AS idx,                                               -- المتوقع: 1
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'lab_order_templates' AND 'anon' = ANY(roles))
    AS anon_leak;                                         -- المتوقع: 0
