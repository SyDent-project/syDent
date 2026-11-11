-- ============================================================================
-- Migration 201 — المصاريف: تصنيفُ «مواد سنية» أساسيٌّ لا يُحذف + ربطُ المصروف بمورّد المخزون
-- ----------------------------------------------------------------------------
-- (أ) «مواد سنية» كان تصنيفاً عادياً يُحذف، و«سجّلها مصروفاً» من استلام طلبية المخزون يجده
--     بالاسم (كلمة «مواد») ⇒ حذفُه أو تغييرُ اسمه يقطع الربط بصمت.
--     • expense_categories.system_key = 'dental_materials' علامةٌ ثابتة (واحدةٌ لكل عيادة).
--     • الحذفُ يُرفض بالقاعدة (تصونه حتى النسخُ المخزّنة القديمة بالمتصفح)، والعلامةُ لا تُنزع ولا تُبدَّل.
--     • حذفُ الحساب كاملاً يمرّ: التسلسلُ من auth.users يُعرف بغياب المالك (نمط M197).
--     • التعديل (الاسم · الأيقونة · اللون) والتعطيل يبقيان بيد المالك.
-- (ب) المورّدُ بالمصروف كان نصاً حراً بلا علاقة بمورّدي المخزون.
--     • expenses.supplier_id ربطٌ اختياري بـinventory_suppliers (حذفُ المورّد ⇒ NULL)، بحارس ملكية (#694).
--     • expenses.vendor يبقى لقطةَ الاسم نصاً ⇒ كلُّ قارئٍ قائم (القائمة · المحاسبة · التصدير) بلا تغيير.
-- لا تغيير على أيِّ رقمٍ محاسبي، ولا كتابةَ على صفوف المصاريف القائمة. Idempotent.
-- ============================================================================

-- (أ) التصنيفُ الأساسي ---------------------------------------------------------
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS system_key text;
ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_system_key_valid;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_system_key_valid
  CHECK (system_key IS NULL OR system_key IN ('dental_materials'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_owner_system_key
  ON public.expense_categories (owner_id, system_key) WHERE system_key IS NOT NULL;

COMMENT ON COLUMN public.expense_categories.system_key IS 'M201: علامةُ تصنيفٍ أساسي (dental_materials = «مواد سنية»). صفٌّ يحملها لا يُحذف ولا تُنزع عنه؛ NULL = تصنيفٌ عادي.';

-- العياداتُ القائمة: يُعلَّم «مواد سنية» الموجود (الأقدم إن تكرّر الاسم)…
UPDATE public.expense_categories c
   SET system_key = 'dental_materials'
 WHERE c.system_key IS NULL
   AND c.id = (SELECT y.id FROM public.expense_categories y
                WHERE y.owner_id = c.owner_id AND btrim(y.name) = 'مواد سنية'
                ORDER BY y.created_at, y.id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.expense_categories x
                    WHERE x.owner_id = c.owner_id AND x.system_key = 'dental_materials');

-- …وعيادةٌ لها تصنيفاتٌ وليس بينها «مواد سنية» (حُذف أو غُيّر اسمه سابقاً) يُضاف لها.
INSERT INTO public.expense_categories (owner_id, name, icon, color, sort_order, system_key)
SELECT o.owner_id, 'مواد سنية', '🦷', '#63b3ed', 1, 'dental_materials'
  FROM (SELECT DISTINCT owner_id FROM public.expense_categories) o
 WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories c
                    WHERE c.owner_id = o.owner_id AND c.system_key = 'dental_materials');

CREATE OR REPLACE FUNCTION public.expense_categories_system_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- العلامةُ تُمنح مرةً (NULL ⇒ قيمة) ولا تُنزع ولا تُبدَّل
    IF OLD.system_key IS NOT NULL AND NEW.system_key IS DISTINCT FROM OLD.system_key THEN
      RAISE EXCEPTION 'system_category_key_locked' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE: المالكُ غائب = حذفُ الحساب كاملاً يتسلسل من auth.users ⇒ يمرّ (نمط M197)
  IF OLD.system_key IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.owner_id) THEN
    RAISE EXCEPTION 'system_category_protected' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.expense_categories_system_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expense_categories_system_guard ON public.expense_categories;
CREATE TRIGGER trg_expense_categories_system_guard
  BEFORE UPDATE OF system_key OR DELETE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.expense_categories_system_guard();

-- (ب) ربطُ المصروف بمورّد المخزون ----------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON public.expenses (supplier_id) WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.supplier_id IS 'M201: مورّدُ المخزون المرتبط بالمصروف (اختياري). expenses.vendor يبقى لقطةَ الاسم نصاً.';

-- حارسُ الملكية (#694): المفتاحُ الأجنبي لا يمرّ بـRLS — المورّدُ من العيادة نفسها
CREATE OR REPLACE FUNCTION public.expenses_supplier_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_suppliers s WHERE s.id = NEW.supplier_id AND s.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'expense_supplier_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.expenses_supplier_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expenses_supplier_guard ON public.expenses;
CREATE TRIGGER trg_expenses_supplier_guard
  BEFORE INSERT OR UPDATE OF owner_id, supplier_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_supplier_guard();
