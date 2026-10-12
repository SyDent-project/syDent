-- 177 — Batch number (LOT) and tracing to the patient (task C3, part 2)
--
-- Implants, membranes and bone grafts carry a manufacturer LOT; a recall names
-- the LOT, and the clinic must find every patient who received it.
--   • inventory_batches.lot / inventory_receipt_lines.lot — free text, ≤ 60.
--   • inventory_receive: each line may carry a lot; a batch opens when the line
--     has an expiry OR a lot (a batch without either stays plain stock).
--   • inventory_consume: each line may name batch_id (the «الدفعة (LOT)» picker
--     in the patient card and appointments windows). That batch is taken first;
--     anything left goes through FEFO as before. The item quantity drops with
--     each step so the FEFO pass never sees a phantom unbatched remainder.
--     A batch that is not open, not this item's or not this owner's is ignored
--     (FEFO takes it all) — never an error that blocks the session.
-- Tracing needs no new table: consume movements already carry patient_id,
-- session_id and batch_id (M169). Same SECURITY INVOKER rights, read-only
-- refused, RLS and the subscription gate unchanged. Idempotent.

ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS lot text;
ALTER TABLE public.inventory_receipt_lines ADD COLUMN IF NOT EXISTS lot text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batches_lot_len') THEN
    ALTER TABLE public.inventory_batches ADD CONSTRAINT inventory_batches_lot_len CHECK (lot IS NULL OR char_length(lot) BETWEEN 1 AND 60);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_receipt_lines_lot_len') THEN
    ALTER TABLE public.inventory_receipt_lines ADD CONSTRAINT inventory_receipt_lines_lot_len CHECK (lot IS NULL OR char_length(lot) BETWEEN 1 AND 60);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_inv_batches_lot ON public.inventory_batches (owner_id, lot) WHERE lot IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_batch_patient ON public.inventory_movements (batch_id, patient_id) WHERE batch_id IS NOT NULL AND reason = 'consume';

-- ── Receive: the line may carry a lot ─────────────────────────────────────
-- p_lines: [{line_id, qty, expiry?, price?, lot?}]
CREATE OR REPLACE FUNCTION public.inventory_receive(p_order uuid, p_lines jsonb, p_note text DEFAULT NULL, p_allow_over boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text; v_supplier uuid; v_receipt uuid; v_batch uuid; v_new text;
  v_syp numeric := 0; v_usd numeric := 0; v_unpriced int := 0;
  r record; l record; v_price numeric; v_cur text; v_active boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'line_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_line' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.supplier_id INTO v_status, v_supplier
    FROM public.inventory_orders o WHERE o.id = p_order AND o.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_owned' USING ERRCODE = '42501'; END IF;
  IF v_status NOT IN ('open', 'partial') THEN RAISE EXCEPTION 'order_not_open' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.inventory_receipts (owner_id, order_id, supplier_id, note)
  VALUES (v_uid, p_order, v_supplier, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_receipt;

  FOR r IN
    SELECT l2.id AS line_id, l2.item_id, l2.qty_ordered, l2.qty_received, l2.unit_price AS line_price, l2.currency AS line_cur,
           (e->>'qty')::numeric AS qty,
           nullif(e->>'expiry', '')::date AS expiry,
           nullif(e->>'price', '')::numeric AS price,
           left(nullif(btrim(coalesce(e->>'lot', '')), ''), 60) AS lot
      FROM jsonb_array_elements(p_lines) e
      LEFT JOIN public.inventory_order_lines l2
        ON l2.id = nullif(e->>'line_id', '')::uuid AND l2.order_id = p_order AND l2.owner_id = v_uid
     ORDER BY 2, 1                          -- items locked in a fixed order ⇒ no deadlock between two screens
  LOOP
    IF r.line_id IS NULL THEN RAISE EXCEPTION 'line_not_in_order' USING ERRCODE = '42501'; END IF;
    IF r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 OR (r.price IS NOT NULL AND r.price < 0) THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    IF r.qty_received + r.qty > r.qty_ordered AND NOT coalesce(p_allow_over, false) THEN
      RAISE EXCEPTION 'over_ordered' USING ERRCODE = '22023';
    END IF;
    SELECT i.is_active, i.currency INTO v_active, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND OR NOT v_active THEN RAISE EXCEPTION 'item_inactive' USING ERRCODE = '22023'; END IF;
    v_cur := coalesce(r.line_cur, v_cur);
    v_price := coalesce(r.price, r.line_price);

    -- quantity first, then the batch (batch guard: open batches ≤ quantity)
    UPDATE public.inventory_items SET quantity = quantity + r.qty WHERE id = r.item_id;
    v_batch := NULL;
    IF r.expiry IS NOT NULL OR r.lot IS NOT NULL THEN
      INSERT INTO public.inventory_batches (owner_id, item_id, quantity, received_qty, expiry_date, lot, note)
      VALUES (v_uid, r.item_id, r.qty, r.qty, r.expiry, r.lot, 'استلام طلبية') RETURNING id INTO v_batch;
    END IF;
    INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, receipt_id)
    VALUES (v_uid, r.item_id, r.qty, 'purchase', 'استلام طلبية', v_batch, v_receipt);
    INSERT INTO public.inventory_receipt_lines (owner_id, receipt_id, order_line_id, item_id, qty, unit_price, currency, expiry_date, lot, batch_id)
    VALUES (v_uid, v_receipt, r.line_id, r.item_id, r.qty, v_price, v_cur, r.expiry, r.lot, v_batch);
    UPDATE public.inventory_order_lines SET qty_received = qty_received + r.qty WHERE id = r.line_id;
    IF r.price IS NOT NULL THEN
      UPDATE public.inventory_items SET purchase_price = r.price WHERE id = r.item_id;
    END IF;

    IF v_price IS NULL THEN v_unpriced := v_unpriced + 1;
    ELSIF v_cur = 'USD' THEN v_usd := v_usd + r.qty * v_price;
    ELSE v_syp := v_syp + r.qty * v_price;
    END IF;
  END LOOP;

  v_new := CASE WHEN EXISTS (SELECT 1 FROM public.inventory_order_lines x
                              WHERE x.order_id = p_order AND x.qty_received < x.qty_ordered)
                THEN 'partial' ELSE 'received' END;
  UPDATE public.inventory_orders SET status = v_new,
         closed_at = CASE WHEN v_new = 'received' THEN now() ELSE NULL END
   WHERE id = p_order;

  RETURN jsonb_build_object('receipt_id', v_receipt, 'status', v_new,
                            'totals', jsonb_build_object('SYP', round(v_syp, 2), 'USD', round(v_usd, 2)),
                            'unpriced', v_unpriced);
END $$;

-- ── Consume: the picked batch first, then FEFO ────────────────────────────
-- p_lines: [{item_id, qty, session_id?, batch_id?}] (≤ 200)
CREATE OR REPLACE FUNCTION public.inventory_consume(p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_active boolean; v_pat uuid; v_prov uuid; v_take numeric; v_left numeric; v_bq numeric; t numeric;
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
           o AS ord,
           nullif(e->>'batch_id', '')::uuid AS batch_id
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS x(e, o)
     ORDER BY 1, 4                         -- items locked in a fixed order (rank 4 is still ord — #719)
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
    v_left := v_take;
    -- the batch picked in the window (LOT) goes first; the item drops with it so the
    -- FEFO pass below never sees a phantom unbatched remainder
    IF v_left > 0 AND r.batch_id IS NOT NULL THEN
      SELECT b.quantity INTO v_bq FROM public.inventory_batches b
       WHERE b.id = r.batch_id AND b.item_id = r.item_id AND b.owner_id = v_uid AND b.is_finished = false FOR UPDATE;
      IF FOUND AND coalesce(v_bq, 0) > 0 THEN
        t := least(v_left, v_bq);
        UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = r.batch_id;
        INSERT INTO public.inventory_movements
          (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
        VALUES (v_uid, r.item_id, -t, 'consume', coalesce(v_note, 'استهلاك'),
                r.session_id, v_pat, v_prov, r.batch_id);
        UPDATE public.inventory_items SET quantity = quantity - t WHERE id = r.item_id;
        v_left := v_left - t;
      END IF;
    END IF;
    IF v_left > 0 THEN
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, v_left, v_today, false) LOOP
        INSERT INTO public.inventory_movements
          (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
        VALUES (v_uid, r.item_id, -s.took, 'consume', coalesce(v_note, 'استهلاك'),
                r.session_id, v_pat, v_prov, s.batch_id);
      END LOOP;
      UPDATE public.inventory_items SET quantity = quantity - v_left WHERE id = r.item_id;
    END IF;
    v_out := v_out || jsonb_build_object('item_id', r.item_id, 'session_id', r.session_id,
               'requested', r.qty, 'deducted', v_take, 'remaining', v_q - v_take);
  END LOOP;
  RETURN jsonb_build_object('lines', v_out);
END $$;

REVOKE ALL ON FUNCTION public.inventory_receive(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_consume(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid, jsonb, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_consume(jsonb, text) TO authenticated, service_role;

COMMENT ON COLUMN public.inventory_batches.lot IS 'M177: manufacturer batch number (LOT) — recall tracing through consume movements';
COMMENT ON COLUMN public.inventory_receipt_lines.lot IS 'M177: LOT as written at receiving';
