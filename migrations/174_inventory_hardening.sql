-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 174 — إحكامُ جولة المخزون (3 تشرين الأول 2026 — ملاحظاتُ المراجعة النهائية)
-- ---------------------------------------------------------------------------
-- (١) حارسُ الدفعة لا يقفل صفَّ الصنف إلا عند النموّ (إدراجٌ مفتوح · زيادةُ كمية · إعادةُ فتح).
--     قبلها كان يقفله بكل تحديث ⇒ نسخةٌ مخزّنة قديمة تعلّم دفعةً «منتهية» (تحديثٌ مباشر للدفعة ⇒ قفلُ الصنف)
--     بالتزامن مع خصمٍ (قفلُ الصنف ⇒ تحديثُ الدفعة) تُحدث تشابكاً تُلغيه القاعدة. بلا قفلٍ عند الإنقاص لا دورةَ أقفال.
--     القصُّ (M169) والاستهلاكُ والإنهاءُ كلُّها إنقاص ⇒ لم تعد تلمس صفَّ الصنف من داخل الحارس.
-- (٢) الدفعاتُ المنتهية قبل M169 حملت كميتَها المستلمة (quantity كان «المستلَم» قبل أن يصير «المتبقّي») ⇒ تُصفَّر
--     مرةً واحدة؛ received_qty يحفظ المستلَم. لا أثرَ على الكمية ولا على الثابت (المنتهيةُ خارج المجموع).
-- (٣) inventory_receive يرفض استلامَ صنفٍ محذوف (item_inactive) — الواجهةُ لا تعرضه، والقاعدةُ تحسم.
-- (٤) دوالُّ التريغرات لا تُنفَّذ من anon/PUBLIC (لا تُستدعى عبر RPC أصلاً — تنظيفُ صلاحيات).
-- صفرُ لمسٍ مالي. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.inventory_batches_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_itemq numeric; v_owner uuid; v_other numeric; v_grow boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.received_qty IS NULL THEN NEW.received_qty := NEW.quantity; END IF;
  v_grow := NOT NEW.is_finished AND (
              TG_OP = 'INSERT'
              OR NEW.item_id IS DISTINCT FROM OLD.item_id
              OR OLD.is_finished
              OR coalesce(NEW.quantity, 0) > coalesce(OLD.quantity, 0));
  IF v_grow THEN
    -- النموُّ وحده يقفل صفَّ الصنف (الثابتُ: الدفعاتُ المفتوحة ≤ الكمية)
    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id FOR UPDATE;
  ELSE
    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id;
  END IF;
  IF NOT FOUND OR v_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'batch_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF v_grow THEN
    SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_other
      FROM public.inventory_batches x
     WHERE x.item_id = NEW.item_id AND x.is_finished = false AND x.id IS DISTINCT FROM NEW.id;
    IF v_other + coalesce(NEW.quantity, 0) > coalesce(v_itemq, 0) THEN
      RAISE EXCEPTION 'batch_exceeds_stock' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

UPDATE public.inventory_batches SET quantity = 0 WHERE is_finished = true AND coalesce(quantity, 0) > 0;

CREATE OR REPLACE FUNCTION public.inventory_receive(p_order uuid, p_lines jsonb, p_allow_over boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text; v_sup text; v_receipt uuid; v_batch uuid;
  r record; l record;
  v_price numeric; v_syp numeric := 0; v_usd numeric := 0; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  SELECT o.status, s.name INTO v_status, v_sup
    FROM public.inventory_orders o LEFT JOIN public.inventory_suppliers s ON s.id = o.supplier_id
   WHERE o.id = p_order AND o.owner_id = v_uid FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_owned' USING ERRCODE = '42501'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled' USING ERRCODE = '22023'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'line_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_line' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_receipts (owner_id, order_id) VALUES (v_uid, p_order) RETURNING id INTO v_receipt;

  FOR r IN SELECT (e->>'line_id')::uuid AS line_id, (e->>'qty')::numeric AS qty,
                  nullif(e->>'expiry', '')::date AS expiry, nullif(e->>'unit_price', '')::numeric AS price,
                  left(nullif(btrim(coalesce(e->>'lot', '')), ''), 60) AS lot
             FROM jsonb_array_elements(p_lines) e
             LEFT JOIN public.inventory_order_lines ol0 ON ol0.id = (e->>'line_id')::uuid
            ORDER BY ol0.item_id NULLS LAST, 1          -- الأصنافُ تُقفل بترتيبها كالخصم (M169) ⇒ لا تشابك
  LOOP
    IF r.line_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 OR (r.price IS NOT NULL AND r.price < 0) THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT ol.item_id, ol.qty_ordered, ol.qty_received, ol.unit_price, ol.currency INTO l
      FROM public.inventory_order_lines ol WHERE ol.id = r.line_id AND ol.order_id = p_order AND ol.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'line_not_in_order' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = l.item_id AND i.is_active) THEN
      RAISE EXCEPTION 'item_inactive' USING ERRCODE = '22023';          -- M174: لا استلامَ لصنفٍ محذوف
    END IF;
    IF l.qty_received + r.qty > l.qty_ordered AND NOT coalesce(p_allow_over, false) THEN
      RAISE EXCEPTION 'over_receive' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.inventory_items i WHERE i.id = l.item_id AND i.owner_id = v_uid FOR UPDATE;

    v_price := coalesce(r.price, l.unit_price);
    -- الكميةُ أولاً ثم الدفعة ⇒ حارسُ الدفعة (M169) يرى المخزونَ كافياً
    UPDATE public.inventory_items SET quantity = quantity + r.qty,
           purchase_price = CASE WHEN r.price IS NOT NULL THEN r.price ELSE purchase_price END
     WHERE id = l.item_id;
    v_batch := NULL;
    IF r.expiry IS NOT NULL OR r.lot IS NOT NULL THEN       -- M173: رقمُ الدفعة وحده يكفي لدفعة (تتبّعٌ بلا صلاحية)
      INSERT INTO public.inventory_batches (owner_id, item_id, quantity, expiry_date, lot_no, note)
      VALUES (v_uid, l.item_id, r.qty, r.expiry, r.lot, left('📦 طلبية' || coalesce(' — ' || v_sup, ''), 120)) RETURNING id INTO v_batch;
    END IF;
    INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, order_line_id, receipt_id)
    VALUES (v_uid, l.item_id, r.qty, 'purchase', left('🚚 استلام طلبية' || coalesce(' — ' || v_sup, ''), 200), v_batch, r.line_id, v_receipt);
    UPDATE public.inventory_order_lines SET qty_received = qty_received + r.qty,
           unit_price = CASE WHEN r.price IS NOT NULL THEN r.price ELSE unit_price END
     WHERE id = r.line_id;

    IF v_price IS NOT NULL THEN
      IF l.currency = 'USD' THEN v_usd := v_usd + r.qty * v_price; ELSE v_syp := v_syp + r.qty * v_price; END IF;
    END IF;
    v_out := v_out || jsonb_build_object('line_id', r.line_id, 'item_id', l.item_id, 'qty', r.qty,
               'unit_price', v_price, 'currency', l.currency, 'priced', v_price IS NOT NULL);
  END LOOP;

  UPDATE public.inventory_receipts SET amount_syp = round(v_syp, 2), amount_usd = round(v_usd, 2) WHERE id = v_receipt;
  RETURN jsonb_build_object('receipt_id', v_receipt, 'amount_syp', round(v_syp, 2), 'amount_usd', round(v_usd, 2), 'lines', v_out);
END $$;

REVOKE ALL ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.inventory_batches_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_movements_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_items_trim_batches() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_count_lines_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_orders_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_order_lines_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receipts_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.treatment_materials_guard() FROM PUBLIC, anon;
