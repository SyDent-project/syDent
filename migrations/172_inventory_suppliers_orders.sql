-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 172 — الموردون وطلبياتُ الشراء والاستلامُ الجزئي (2 تشرين الأول 2026 — جولة المخزون، البند 4)
-- ---------------------------------------------------------------------------
-- Open Dental «Supply Inventory»: المورّدُ يُعرَّف أولاً · الطلبيةُ أسطرٌ بكمية × سعر · الاستلامُ جزئيٌّ لكل سطر.
--   • inventory_suppliers    — الاسم · الهاتف (للواتساب المباشر) · ملاحظة · نشط/مخفي.
--   • inventory_orders       — المورّد · ملاحظة · status ∈ open/cancelled (الحالةُ المعروضة تُشتقّ من الأسطر).
--   • inventory_order_lines  — الصنف · المطلوب · المستلَم حتى الآن · السعرُ وعملتُه (عملةُ الصنف).
--   • inventory_receipts     — كلُّ استلام: مجموعُه لكل عملة على حدة (لا جمعَ بين عملتين) + ربطُ مصروفه
--                              (expense_syp_id / expense_usd_id) ⇒ «✓ مسجّلة مصروف» فلا تُسجَّل الفاتورةُ مرتين.
--   • inventory_movements.order_line_id / receipt_id — حركةُ «شراء» تعرف طلبيتها واستلامها.
-- • inventory_create_order(supplier, note, lines): الطلبيةُ وأسطرُها بخطوةٍ واحدة؛ السعرُ الافتراضي = سعرُ الشراء المسجّل.
-- • inventory_receive(order, lines, allow_over): خطوةٌ واحدة لكل الاستلام — قفلُ الطلبية والأسطر والأصناف بترتيب ·
--   تزيد الكمية · دفعةٌ بصلاحيتها إن كُتبت (بعد الكمية ⇒ ثابتُ M169 يصمد) · حركةُ «شراء» مربوطة · لا استلامَ فوق
--   المطلوب إلا بتأكيدٍ صريح · السعرُ الفعلي يحدّث سطرَ الطلبية وسعرَ الشراء المسجّل للصنف.
-- المالُ: المصروفُ يُحفظ من مسار المصاريف القائم وحده (نافذتُه تُعبّأ ولا تحفظ — #690)؛ هنا مجاميعُ للعرض والتعبئة فقط.
-- حرّاسُ ملكية (#694) على كل عمود ربط · RLS المالك · بوابةُ الاشتراك بـ_sub_guard_table. SECURITY INVOKER. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
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
  note text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_orders_status_valid CHECK (status IN ('open', 'cancelled')),
  CONSTRAINT inventory_orders_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);
CREATE TABLE IF NOT EXISTS public.inventory_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.inventory_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_ordered numeric NOT NULL,
  qty_received numeric NOT NULL DEFAULT 0,
  unit_price numeric,
  currency text NOT NULL DEFAULT 'SYP',
  CONSTRAINT inventory_order_lines_qty_pos CHECK (qty_ordered > 0 AND qty_ordered <= 1000000),
  CONSTRAINT inventory_order_lines_recv_nonneg CHECK (qty_received >= 0),
  CONSTRAINT inventory_order_lines_price_nonneg CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT inventory_order_lines_currency_valid CHECK (currency IN ('SYP', 'USD')),
  CONSTRAINT inventory_order_lines_one_per_item UNIQUE (order_id, item_id)
);
CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.inventory_orders(id) ON DELETE CASCADE,
  amount_syp numeric NOT NULL DEFAULT 0,
  amount_usd numeric NOT NULL DEFAULT 0,
  expense_syp_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  expense_usd_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_receipts_amounts_nonneg CHECK (amount_syp >= 0 AND amount_usd >= 0)
);
CREATE INDEX IF NOT EXISTS idx_inv_suppliers_owner ON public.inventory_suppliers (owner_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_owner ON public.inventory_orders (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_orders_supplier ON public.inventory_orders (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_order_lines_order ON public.inventory_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_order_lines_item ON public.inventory_order_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_order ON public.inventory_receipts (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_exp_syp ON public.inventory_receipts (expense_syp_id) WHERE expense_syp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_receipts_exp_usd ON public.inventory_receipts (expense_usd_id) WHERE expense_usd_id IS NOT NULL;

ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
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
SELECT public._sub_guard_table('public.inventory_suppliers');
SELECT public._sub_guard_table('public.inventory_orders');
SELECT public._sub_guard_table('public.inventory_order_lines');
SELECT public._sub_guard_table('public.inventory_receipts');

ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS order_line_id uuid REFERENCES public.inventory_order_lines(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES public.inventory_receipts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_order_line ON public.inventory_movements (order_line_id) WHERE order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_receipt ON public.inventory_movements (receipt_id) WHERE receipt_id IS NOT NULL;

-- ── حرّاسُ الملكية (#694) ────────────────────────────────────────────────
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
  IF NEW.order_line_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_order_lines l WHERE l.id = NEW.order_line_id AND l.owner_id = NEW.owner_id AND l.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'movement_order_line_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_receipts r WHERE r.id = NEW.receipt_id AND r.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_receipt_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_movements_guard ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_guard
  BEFORE INSERT OR UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id, order_line_id, receipt_id
  ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_guard();

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
CREATE TRIGGER trg_inventory_orders_guard BEFORE INSERT OR UPDATE OF owner_id, supplier_id ON public.inventory_orders
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
CREATE TRIGGER trg_inventory_order_lines_guard BEFORE INSERT OR UPDATE OF owner_id, order_id, item_id ON public.inventory_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.inventory_order_lines_guard();

CREATE OR REPLACE FUNCTION public.inventory_receipts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_orders o WHERE o.id = NEW.order_id AND o.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_syp_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_syp_id AND e.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_usd_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_usd_id AND e.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_receipts_guard ON public.inventory_receipts;
CREATE TRIGGER trg_inventory_receipts_guard BEFORE INSERT OR UPDATE OF owner_id, order_id, expense_syp_id, expense_usd_id ON public.inventory_receipts
  FOR EACH ROW EXECUTE FUNCTION public.inventory_receipts_guard();

-- ── إنشاءُ الطلبية ─────────────────────────────────────────────────────────
-- p_lines: [{item_id, qty, unit_price?}] (≤ 200). يُرجع {order_id}.
CREATE OR REPLACE FUNCTION public.inventory_create_order(p_supplier uuid, p_note text, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_order uuid; r record; v_price numeric; v_cur text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.inventory_orders (owner_id, supplier_id, note)
  VALUES (v_uid, p_supplier, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_order;
  FOR r IN SELECT (e->>'item_id')::uuid AS item_id, (e->>'qty')::numeric AS qty,
                  nullif(e->>'unit_price', '')::numeric AS price
             FROM jsonb_array_elements(p_lines) e ORDER BY 1
  LOOP
    IF r.item_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR (r.price IS NOT NULL AND r.price < 0) THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.purchase_price, i.currency INTO v_price, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid AND i.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.inventory_order_lines (owner_id, order_id, item_id, qty_ordered, unit_price, currency)
    VALUES (v_uid, v_order, r.item_id, r.qty, coalesce(r.price, v_price), coalesce(v_cur, 'SYP'));
  END LOOP;
  RETURN jsonb_build_object('order_id', v_order);
END $$;

-- ── الاستلام (جزئيٌّ أو كامل) ─────────────────────────────────────────────
-- p_lines: [{line_id, qty, expiry?, unit_price?}] (≤ 200). يُرجع {receipt_id, amount_syp, amount_usd, lines:[…]}.
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
                  nullif(e->>'expiry', '')::date AS expiry, nullif(e->>'unit_price', '')::numeric AS price
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
    IF r.expiry IS NOT NULL THEN
      INSERT INTO public.inventory_batches (owner_id, item_id, quantity, expiry_date, note)
      VALUES (v_uid, l.item_id, r.qty, r.expiry, left('📦 طلبية' || coalesce(' — ' || v_sup, ''), 120)) RETURNING id INTO v_batch;
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

REVOKE ALL ON FUNCTION public.inventory_create_order(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_create_order(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_receive(uuid, jsonb, boolean) TO authenticated, service_role;

COMMENT ON TABLE public.inventory_suppliers IS 'M172: موردو المواد';
COMMENT ON TABLE public.inventory_orders IS 'M172: طلبيةُ شراء — status ∈ open/cancelled، والحالةُ المعروضة تُشتقّ من الأسطر';
COMMENT ON TABLE public.inventory_order_lines IS 'M172: سطرُ طلبية — المطلوب والمستلَم والسعرُ بعملة الصنف';
COMMENT ON TABLE public.inventory_receipts IS 'M172: استلامٌ واحد — مجموعُه لكل عملة وربطُ مصروفه (لا تُسجَّل الفاتورةُ مرتين)';
