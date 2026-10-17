-- 172 — Suppliers, purchase orders and partial receiving (task C3, part 1)
--
-- Open Dental «Supply Inventory» (Suppliers · Orders · receive) on top of the
-- atomic stock model of M169:
--   • inventory_suppliers      — who the clinic buys from (name · phone · note).
--   • inventory_orders         — an order to one supplier (or none):
--                                open → partial → received, or closed by hand.
--   • inventory_order_lines    — item · ordered · received so far · price and
--                                currency at order time.
--   • inventory_receipts       — one delivery against an order. Linked once per
--                                currency to the expense that pays for it.
--   • inventory_receipt_lines  — what arrived on that delivery, at what price,
--                                and the batch it created (when it has an expiry).
--   • inventory_movements.receipt_id — the «purchase» movement of each line.
--
-- RPCs (SECURITY INVOKER ⇒ RLS and the subscription gate apply; read-only
-- accounts are refused):
--   • inventory_create_order(supplier, lines, note) — prices snapshotted from
--     the item; one line per item.
--   • inventory_receive(order, lines, note, allow_over) — one step: locks the
--     order, then the items in item_id order; refuses more than ordered unless
--     allow_over; refuses inactive (deleted) items; raises the item quantity,
--     opens a batch when an expiry is given, writes one movement per line, and
--     moves the order to partial / received.
--
-- Money: a receipt is not an expense. «Record as expense» on the inventory
-- page only pre-fills the expenses form; the receipt is linked after the
-- expense is saved (expense_syp_id / expense_usd_id, only while empty), so
-- nothing is counted twice and the accounting formulas are untouched.
--
-- Every link column has an ownership guard (foreign keys skip RLS). Every
-- foreign key has an index. Idempotent.

CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_suppliers_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT inventory_suppliers_phone_len CHECK (phone IS NULL OR char_length(phone) <= 30),
  CONSTRAINT inventory_suppliers_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);

CREATE TABLE IF NOT EXISTS public.inventory_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT inventory_orders_status_valid CHECK (status IN ('open', 'partial', 'received', 'closed')),
  CONSTRAINT inventory_orders_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);

CREATE TABLE IF NOT EXISTS public.inventory_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.inventory_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_ordered numeric NOT NULL,
  qty_received numeric NOT NULL DEFAULT 0,
  unit_price numeric(14,2),
  currency text,
  CONSTRAINT inventory_order_lines_qty_pos CHECK (qty_ordered > 0 AND qty_ordered <= 1000000),
  CONSTRAINT inventory_order_lines_recv_nonneg CHECK (qty_received >= 0),
  CONSTRAINT inventory_order_lines_price_nonneg CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT inventory_order_lines_currency_valid CHECK (currency IS NULL OR currency IN ('SYP', 'USD')),
  CONSTRAINT inventory_order_lines_one_per_item UNIQUE (order_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.inventory_orders(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  expense_syp_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  expense_usd_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  CONSTRAINT inventory_receipts_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);

CREATE TABLE IF NOT EXISTS public.inventory_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.inventory_receipts(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES public.inventory_order_lines(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  unit_price numeric(14,2),
  currency text,
  expiry_date date,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  CONSTRAINT inventory_receipt_lines_qty_pos CHECK (qty > 0),
  CONSTRAINT inventory_receipt_lines_price_nonneg CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT inventory_receipt_lines_currency_valid CHECK (currency IS NULL OR currency IN ('SYP', 'USD'))
);

ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES public.inventory_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_suppliers_owner ON public.inventory_suppliers (owner_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_owner ON public.inventory_orders (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_orders_supplier ON public.inventory_orders (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_order_lines_owner ON public.inventory_order_lines (owner_id);
CREATE INDEX IF NOT EXISTS idx_inv_order_lines_item ON public.inventory_order_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_owner ON public.inventory_receipts (owner_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_order ON public.inventory_receipts (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_supplier ON public.inventory_receipts (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_receipts_exp_syp ON public.inventory_receipts (expense_syp_id) WHERE expense_syp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_receipts_exp_usd ON public.inventory_receipts (expense_usd_id) WHERE expense_usd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_owner ON public.inventory_receipt_lines (owner_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_receipt ON public.inventory_receipt_lines (receipt_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_oline ON public.inventory_receipt_lines (order_line_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_item ON public.inventory_receipt_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_batch ON public.inventory_receipt_lines (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_receipt ON public.inventory_movements (receipt_id) WHERE receipt_id IS NOT NULL;

ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipt_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_suppliers_owner_all ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_owner_all ON public.inventory_suppliers FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS inventory_orders_owner_all ON public.inventory_orders;
CREATE POLICY inventory_orders_owner_all ON public.inventory_orders FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS inventory_order_lines_owner_all ON public.inventory_order_lines;
CREATE POLICY inventory_order_lines_owner_all ON public.inventory_order_lines FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS inventory_receipts_owner_all ON public.inventory_receipts;
CREATE POLICY inventory_receipts_owner_all ON public.inventory_receipts FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS inventory_receipt_lines_owner_all ON public.inventory_receipt_lines;
CREATE POLICY inventory_receipt_lines_owner_all ON public.inventory_receipt_lines FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
-- Subscription gate (M141) through the shared helper, never a hand copy
SELECT public._sub_guard_table('public.inventory_suppliers');
SELECT public._sub_guard_table('public.inventory_orders');
SELECT public._sub_guard_table('public.inventory_order_lines');
SELECT public._sub_guard_table('public.inventory_receipts');
SELECT public._sub_guard_table('public.inventory_receipt_lines');

-- ── Ownership guards (#694): every link points at a row of the same owner ──
CREATE OR REPLACE FUNCTION public.inventory_orders_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_suppliers s WHERE s.id = NEW.supplier_id AND s.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_supplier_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_orders_guard ON public.inventory_orders;
CREATE TRIGGER trg_inventory_orders_guard
  BEFORE INSERT OR UPDATE OF owner_id, supplier_id ON public.inventory_orders
  FOR EACH ROW EXECUTE FUNCTION public.inventory_orders_guard();

CREATE OR REPLACE FUNCTION public.inventory_order_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_orders o WHERE o.id = NEW.order_id AND o.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_line_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_line_item_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_order_lines_guard ON public.inventory_order_lines;
CREATE TRIGGER trg_inventory_order_lines_guard
  BEFORE INSERT OR UPDATE OF owner_id, order_id, item_id ON public.inventory_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.inventory_order_lines_guard();

CREATE OR REPLACE FUNCTION public.inventory_receipts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_orders o WHERE o.id = NEW.order_id AND o.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_suppliers s WHERE s.id = NEW.supplier_id AND s.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_supplier_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_syp_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_syp_id AND e.owner_id = NEW.owner_id AND e.currency = 'SYP') THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_usd_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_usd_id AND e.owner_id = NEW.owner_id AND e.currency = 'USD') THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_receipts_guard ON public.inventory_receipts;
CREATE TRIGGER trg_inventory_receipts_guard
  BEFORE INSERT OR UPDATE OF owner_id, order_id, supplier_id, expense_syp_id, expense_usd_id ON public.inventory_receipts
  FOR EACH ROW EXECUTE FUNCTION public.inventory_receipts_guard();

CREATE OR REPLACE FUNCTION public.inventory_receipt_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_receipts r WHERE r.id = NEW.receipt_id AND r.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_line_receipt_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_order_lines l
                  WHERE l.id = NEW.order_line_id AND l.owner_id = NEW.owner_id AND l.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'receipt_line_order_line_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_batches b WHERE b.id = NEW.batch_id AND b.owner_id = NEW.owner_id AND b.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'receipt_line_batch_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_receipt_lines_guard ON public.inventory_receipt_lines;
CREATE TRIGGER trg_inventory_receipt_lines_guard
  BEFORE INSERT OR UPDATE OF owner_id, receipt_id, order_line_id, item_id, batch_id ON public.inventory_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.inventory_receipt_lines_guard();

-- Movement guard (M169/M171) now also covers receipt_id
CREATE OR REPLACE FUNCTION public.inventory_movements_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.session_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_session_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.patient_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_patient_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.provider_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.clinic_doctors c WHERE c.id = NEW.provider_id AND c.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_provider_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_batches b WHERE b.id = NEW.batch_id AND b.owner_id = NEW.owner_id AND b.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'movement_batch_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.count_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_counts k WHERE k.id = NEW.count_id AND k.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_count_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_receipts r WHERE r.id = NEW.receipt_id AND r.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_receipt_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_movements_guard ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_guard
  BEFORE INSERT OR UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id, receipt_id ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_guard();

-- ── Create an order ──────────────────────────────────────────────────────
-- p_lines: [{item_id, qty}] (≤ 200, one per item). Returns the order id.
CREATE OR REPLACE FUNCTION public.inventory_create_order(p_supplier uuid, p_lines jsonb, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order uuid;
  r record; v_price numeric; v_cur text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'item_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_orders (owner_id, supplier_id, note)
  VALUES (v_uid, p_supplier, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_order;

  FOR r IN
    SELECT (e->>'item_id')::uuid AS item_id, (e->>'qty')::numeric AS qty
      FROM jsonb_array_elements(p_lines) e
     ORDER BY 1
  LOOP
    IF r.item_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.purchase_price, i.currency INTO v_price, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid AND i.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.inventory_order_lines (owner_id, order_id, item_id, qty_ordered, unit_price, currency)
    VALUES (v_uid, v_order, r.item_id, r.qty, v_price, v_cur);
  END LOOP;
  RETURN v_order;
END $$;

-- ── Receive (all of it or part of it) ────────────────────────────────────
-- p_lines: [{line_id, qty, expiry?, price?}] (≤ 200, one per line).
-- Returns {receipt_id, status, totals:{SYP, USD}, unpriced}.
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
           nullif(e->>'price', '')::numeric AS price
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
    IF r.expiry IS NOT NULL THEN
      INSERT INTO public.inventory_batches (owner_id, item_id, quantity, received_qty, expiry_date, note)
      VALUES (v_uid, r.item_id, r.qty, r.qty, r.expiry, 'استلام طلبية') RETURNING id INTO v_batch;
    END IF;
    INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, receipt_id)
    VALUES (v_uid, r.item_id, r.qty, 'purchase', 'استلام طلبية', v_batch, v_receipt);
    INSERT INTO public.inventory_receipt_lines (owner_id, receipt_id, order_line_id, item_id, qty, unit_price, currency, expiry_date, batch_id)
    VALUES (v_uid, v_receipt, r.line_id, r.item_id, r.qty, v_price, v_cur, r.expiry, v_batch);
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

REVOKE ALL ON FUNCTION public.inventory_create_order(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receive(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_create_order(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid, jsonb, text, boolean) TO authenticated, service_role;

COMMENT ON TABLE public.inventory_suppliers IS 'M172: suppliers the clinic buys from';
COMMENT ON TABLE public.inventory_orders IS 'M172: purchase order — open → partial → received, or closed by hand';
COMMENT ON TABLE public.inventory_order_lines IS 'M172: ordered item · ordered and received quantities · price and currency at order time';
COMMENT ON TABLE public.inventory_receipts IS 'M172: one delivery against an order; linked once per currency to the expense that pays it';
COMMENT ON TABLE public.inventory_receipt_lines IS 'M172: what arrived on a delivery, at what price, and the batch it opened';
COMMENT ON COLUMN public.inventory_movements.receipt_id IS 'M172: the delivery behind this purchase movement';
