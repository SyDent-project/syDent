-- 178 — Inventory hardening after the round review (task C3, part 4)
--
--   • inventory_batches_guard locks the item only when a batch grows. The
--     atomic RPCs lock the item first and then touch its batches; a client
--     still on an old page that updated a batch first (no growth: a date, a
--     note, a decrease) used to take the item lock second — the opposite order,
--     a deadlock waiting to happen. A shrinking or finishing batch cannot break
--     «open batches ≤ quantity», so it needs no lock; growth still does.
--   • Batches finished before M169 kept their old quantity: zero them, so a
--     finished batch never shows stock (they are not counted as open anyway).
--   • Trigger functions are not callable through the API: EXECUTE revoked from
--     PUBLIC and anon (a trigger fires whatever the caller's EXECUTE rights).
-- No money touched. Idempotent.

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

UPDATE public.inventory_batches SET quantity = 0 WHERE is_finished AND coalesce(quantity, 0) > 0;

REVOKE ALL ON FUNCTION public.inventory_batches_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_items_trim_batches() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_movements_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.treatment_materials_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_count_lines_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_orders_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_order_lines_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receipts_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_receipt_lines_guard() FROM PUBLIC, anon;
