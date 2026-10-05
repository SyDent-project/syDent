-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 153 — وقتُ المصروف (طلب المالك 21 أيلول 2026: «لازم نضيف وقت مو بس تاريخ»)
-- ---------------------------------------------------------------------------
-- expenses.date يبقى مفتاحَ المحاسبة (DATE، كل فلاتر الفترات والتقارير عليه — بلا مساس).
-- يُضاف expense_time (TIME، nullable) = وقتُ المصروف بتوقيت العيادة المحلي، يُعبّأ من النموذج
-- (افتراضياً وقتُ الإدخال) ويُعرض بجانب التاريخ. لا قيود، لا RLS جديدة (سياسةُ المالك تغطّي).
-- تعبئةٌ رجعية آمنة: فقط للصفوف المُدخلة بيومها نفسه (created_at بتوقيت دمشق = date)؛
-- المُدخلُ بتاريخٍ سابق يبقى بلا وقت (يُعرض التاريخ وحده) — لا نخترع وقتاً لم يُسجَّل.
-- idempotent: IF NOT EXISTS + WHERE expense_time IS NULL.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_time time(0) without time zone;

COMMENT ON COLUMN public.expenses.expense_time IS
  'M153: وقت المصروف المحلي (العرض فقط). المحاسبة على expenses.date حصراً.';

UPDATE public.expenses
   SET expense_time = (created_at AT TIME ZONE 'Asia/Damascus')::time(0)
 WHERE expense_time IS NULL
   AND (created_at AT TIME ZONE 'Asia/Damascus')::date = date;

-- تحقق: العمود موجود nullable + عدد الصفوف المعبّأة + السياسات بلا تغيير (#238)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='expenses' AND column_name='expense_time' AND is_nullable='YES') AS expense_time_col,
  (SELECT count(*) FROM public.expenses WHERE expense_time IS NOT NULL) AS rows_with_time,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='expenses') AS expenses_policies;
