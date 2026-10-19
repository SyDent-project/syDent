-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 195 — مرتجعٌ للمورّد: حركةُ خصمٍ باسمها (19 تشرين الأول 2026 — من سؤال المالك على نافذة الحركة)
-- Date: 19 October 2026 | Idempotent: yes | Applied via Supabase MCP
-- ---------------------------------------------------------------------------
-- قبلها: «مرتجع» (reason = return) حركةُ **إضافة** — مادةٌ رجعت إلى المخزون (علبةٌ لم تُفتح) — والتسميةُ وحدها
-- أوحت بالخصم. إرجاعُ مادةٍ **للمورّد** (تنقص من عندنا) لم يكن له نوع؛ كان يُسجَّل «استهلاكاً» فيدخل كلفةَ المواد
-- بالمحاسبة وتقرير «🧪 المواد» (كلاهما يقرأ reason = consume فقط) وهو ليس استهلاكاً.
--   • reason جديد 'return_supplier' بقيد الحركات. التسميةُ القديمة 'return' تبقى كما هي (إضافة) ولا تُمسّ صفوفُها.
--   • inventory_return_supplier(item, qty, note, batch): الطريقُ الذرّي نفسُه (#718): قفلُ الصنف · لا يتجاوز المتوفّر
--     (يُرفض لا يُقصّ — المرتجعُ كميةٌ محدَّدة بفاتورة لا تقدير) · الدفعةُ المختارة أولاً (LOT الفعلي الذي يُعاد)
--     والباقي FEFO (inventory_fefo_take) · حركةٌ لكل شريحة دفعة بالسالب · الثابتُ (#693) صامدٌ بالتريغرين.
--   • كلفةُ المواد لا تتأثّر (mat-cost.js والمحاسبة والتقارير تقرأ consume وحده) — صفرُ لمسٍ مالي.
-- SECURITY INVOKER ⇒ RLS + بوّابة الاشتراك (my_access_level) تبقيان سارية.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ١) القيد ────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inv_reason_valid;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inv_reason_valid
  CHECK (reason = ANY (ARRAY['purchase', 'consume', 'adjust', 'return', 'count', 'return_supplier']));

-- ── ٢) الدالّة ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_return_supplier(p_item uuid, p_qty numeric, p_note text DEFAULT NULL, p_batch uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_q numeric; v_active boolean; v_bq numeric; v_t numeric := 0; s record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_item IS NULL OR p_qty IS NULL OR NOT (p_qty > 0) OR p_qty > 1000000 THEN
    RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
  END IF;

  SELECT i.quantity, i.is_active INTO v_q, v_active
    FROM public.inventory_items i WHERE i.id = p_item AND i.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'item_inactive' USING ERRCODE = '22023'; END IF;
  -- المرتجعُ للمورّد كميةٌ محدَّدة: لا يُقصّ إلى المتوفّر بل يُرفض (المتوفّر يُعاد بالرسالة)
  IF p_qty > coalesce(v_q, 0) THEN
    RAISE EXCEPTION 'insufficient_stock:%', trim(to_char(coalesce(v_q, 0), 'FM999999990.##')) USING ERRCODE = '22023';
  END IF;

  -- الدفعةُ المختارة أولاً (LOT الذي يُعاد فعلاً للمورّد)
  IF p_batch IS NOT NULL THEN
    SELECT b.quantity INTO v_bq FROM public.inventory_batches b
     WHERE b.id = p_batch AND b.item_id = p_item AND b.owner_id = v_uid AND b.is_finished = false FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_available' USING ERRCODE = '22023'; END IF;
    v_t := least(p_qty, coalesce(v_bq, 0));
    IF v_t > 0 THEN
      UPDATE public.inventory_batches SET quantity = quantity - v_t, is_finished = (quantity - v_t) <= 0 WHERE id = p_batch;
      INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id)
      VALUES (v_uid, p_item, -v_t, 'return_supplier', coalesce(v_note, 'مرتجع للمورّد'), p_batch);
    END IF;
  END IF;
  -- الباقي بـFEFO (الأقربُ انتهاءً أولاً · الرصيدُ بلا دفعة · المنتهي آخراً)
  FOR s IN SELECT * FROM public.inventory_fefo_take(p_item, p_qty - v_t, v_today, false) LOOP
    INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id)
    VALUES (v_uid, p_item, -s.took, 'return_supplier', coalesce(v_note, 'مرتجع للمورّد'), s.batch_id);
  END LOOP;
  UPDATE public.inventory_items SET quantity = quantity - p_qty WHERE id = p_item;

  RETURN jsonb_build_object('item_id', p_item, 'returned', p_qty, 'remaining', v_q - p_qty);
END $$;

REVOKE ALL ON FUNCTION public.inventory_return_supplier(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_return_supplier(uuid, numeric, text, uuid) TO authenticated, service_role;

COMMENT ON CONSTRAINT inv_reason_valid ON public.inventory_movements IS
  'M195: purchase · consume · adjust · return (مرتجعٌ إلى المخزون = إضافة) · count · return_supplier (مرتجعٌ للمورّد = خصم، خارج كلفة المواد)';
COMMENT ON FUNCTION public.inventory_return_supplier(uuid, numeric, text, uuid) IS
  'M195: إرجاعُ كميةٍ للمورّد ذرّياً — لا يتجاوز المتوفّر (يُرفض) · الدفعةُ المختارة أولاً ثم FEFO · لا يدخل كلفةَ المواد';
