-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 173 — رقمُ الدفعة (LOT) وتتبّعُه للمريض (2 تشرين الأول 2026 — جولة المخزون، البند 5)
-- ---------------------------------------------------------------------------
-- MedRestock وأدواتُ التتبّع: الدفعةُ تحمل رقمَها، والاستهلاكُ يعرف دفعته ومريضه (M169 أصلاً: batch_id + patient_id
-- على حركة الاستهلاك) ⇒ بطاقةُ المريض تعرض «المواد ورقم الدفعة» (الزرعاتُ أولاً)، والدفعةُ تعرض مرضاها (استدعاءُ الشركة).
--   • inventory_batches.lot_no (≤ 60 حرفاً بعد التشذيب، NULL = بلا رقم).
--   • inventory_consume (M169): السطرُ يقبل batch_id اختيارياً — الدفعةُ التي اختارها الطبيب بنافذة الخصم (LOT الزرعة
--     الفعلي) تُؤخذ أولاً والباقي بـFEFO؛ دفعةٌ لصنفٍ آخر أو منتهية أو غريبة تُرفض (batch_not_available).
--   • inventory_receive: يقبل lot لكل سطر، ودفعةٌ تُنشأ إن كُتبت صلاحيةٌ **أو** رقمُ دفعة (تتبّعٌ بلا صلاحية ممكن).
--     الثابتُ (M169) صامد: الكميةُ قبل الدفعة كما كانت. صفرُ لمسٍ مالي. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS lot_no text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batches_lot_len') THEN
    ALTER TABLE public.inventory_batches ADD CONSTRAINT inventory_batches_lot_len
      CHECK (lot_no IS NULL OR char_length(btrim(lot_no)) BETWEEN 1 AND 60);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_inv_batches_lot ON public.inventory_batches (owner_id, lot_no) WHERE lot_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_patient_consume ON public.inventory_movements (patient_id, created_at DESC) WHERE patient_id IS NOT NULL AND reason = 'consume';

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

CREATE OR REPLACE FUNCTION public.inventory_consume(p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_active boolean; v_pat uuid; v_prov uuid; v_take numeric; v_bq numeric; v_t numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT (e->>'item_id')::uuid AS item_id,
           (e->>'qty')::numeric AS qty,
           nullif(e->>'session_id', '')::uuid AS session_id,
           nullif(e->>'batch_id', '')::uuid AS batch_id,
           o AS ord
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o)
     ORDER BY 1, 5                         -- قفلُ الأصناف بترتيبٍ ثابت ⇒ لا تشابك بين شاشتين
  LOOP
    IF r.item_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.quantity, i.is_active INTO v_q, v_active
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;

    v_pat := NULL; v_prov := NULL;
    IF r.session_id IS NOT NULL THEN
      SELECT ls.patient_id, ls.provider_id INTO v_pat, v_prov
        FROM public.ledger_sessions ls WHERE ls.id = r.session_id AND ls.doctor_id = v_uid;
      IF NOT FOUND THEN RAISE EXCEPTION 'session_not_owned' USING ERRCODE = '42501'; END IF;
    END IF;

    IF NOT v_active THEN
      v_out := v_out || jsonb_build_object('item_id', r.item_id, 'session_id', r.session_id,
                 'requested', r.qty, 'deducted', 0, 'remaining', v_q, 'skipped', 'inactive');
      CONTINUE;
    END IF;

    v_take := least(r.qty, greatest(v_q, 0));
    IF v_take > 0 THEN
      v_t := 0;
      -- M173: الدفعةُ التي اختارها الطبيب (رقمُ LOT الزرعة الفعلي) تُؤخذ أولاً، والباقي بـFEFO
      IF r.batch_id IS NOT NULL THEN
        SELECT b.quantity INTO v_bq FROM public.inventory_batches b
         WHERE b.id = r.batch_id AND b.item_id = r.item_id AND b.owner_id = v_uid AND b.is_finished = false FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_available' USING ERRCODE = '22023'; END IF;
        v_t := least(v_take, coalesce(v_bq, 0));
        IF v_t > 0 THEN
          UPDATE public.inventory_batches SET quantity = quantity - v_t, is_finished = (quantity - v_t) <= 0 WHERE id = r.batch_id;
          INSERT INTO public.inventory_movements
            (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
          VALUES (v_uid, r.item_id, -v_t, 'consume', coalesce(v_note, 'استهلاك'), r.session_id, v_pat, v_prov, r.batch_id);
        END IF;
      END IF;
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, v_take - v_t, v_today, false) LOOP
        INSERT INTO public.inventory_movements
          (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
        VALUES (v_uid, r.item_id, -s.took, 'consume', coalesce(v_note, 'استهلاك'),
                r.session_id, v_pat, v_prov, s.batch_id);
      END LOOP;
      UPDATE public.inventory_items SET quantity = quantity - v_take WHERE id = r.item_id;
    END IF;
    v_out := v_out || jsonb_build_object('item_id', r.item_id, 'session_id', r.session_id,
               'requested', r.qty, 'deducted', v_take, 'remaining', v_q - v_take);
  END LOOP;
  RETURN jsonb_build_object('lines', v_out);
END $$;

REVOKE ALL ON FUNCTION public.inventory_consume(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_consume(jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) TO authenticated, service_role;
COMMENT ON COLUMN public.inventory_batches.lot_no IS 'M173: رقمُ الدفعة (LOT) من العلبة — يُتتبَّع للمريض عبر حركات الاستهلاك';
