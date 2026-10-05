-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 170 — كميةُ الطلب لكل صنف (2 تشرين الأول 2026 — جولة المخزون، البند 2)
-- ---------------------------------------------------------------------------
-- Open Dental «Order Qty» · الممارسةُ المعتمدة: نقطةُ طلب (reorder_level — قائم) + كميةُ طلب.
-- reorder_qty = الكميةُ التي يُطلب بها الصنف عادةً (علبة · كرتونة). «جهّز الطلبية» يقترح أصغرَ
-- مضاعفٍ لها يرفع المتوفّر فوق حدّ التنبيه. NULL = لم تُحدَّد ⇒ يُكتب يدوياً بالطلبية.
-- صفرُ لمسٍ مالي ولا عمودَ ربط (لا حارسَ ملكية لازم). idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS reorder_qty numeric;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_reorder_qty_pos') THEN
    ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_reorder_qty_pos
      CHECK (reorder_qty IS NULL OR (reorder_qty > 0 AND reorder_qty <= 1000000));
  END IF;
END $$;
COMMENT ON COLUMN public.inventory_items.reorder_qty IS 'M170: كمية الطلب المعتادة (Order Qty) — «جهّز الطلبية» يقترح مضاعفاتها؛ NULL = غير محدّدة';
