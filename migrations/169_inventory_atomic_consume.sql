-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 169 — خصمُ المواد ذرّياً بالقاعدة، مربوطاً بالجلسة، وFEFO على الدفعات
-- (2 تشرين الأول 2026 — جولة المخزون، البند 1)
-- ---------------------------------------------------------------------------
-- قبلها: الخصمُ قراءةٌ-ثم-كتابةٌ من المتصفح (سباقٌ بين شاشتين) · الدفعاتُ لا تنقص بالاستهلاك
-- (صنفٌ حيّ كميتُه 192 ودفعاتُه المفتوحة 237) · حركةُ الاستهلاك بلا جلسة/مريض/طبيب/دفعة.
--
-- الثابت (#693 — يُفرض بالقاعدة لا بالواجهة): مجموعُ الدفعات المفتوحة ≤ كميةِ الصنف.
--   الفرقُ (الكمية − الدفعات) = رصيدٌ بلا تاريخ صلاحية (أصنافٌ لا تُتتبَّع صلاحيتُها كالكفوف).
--   batch.quantity صار «المتبقّي»، وreceived_qty = «المستلَم» (يُحفظ عند الإدراج).
--
-- ترتيبُ الخصم (FEFO — الأقربُ انتهاءً أولاً، والمنتهي آخراً لأنه للإتلاف لا للاستعمال):
--   ١) الدفعاتُ السارية (والتي بلا تاريخ) بالأقرب انتهاءً · ٢) الرصيدُ بلا دفعة · ٣) الدفعاتُ المنتهية.
--
-- • inventory_consume(lines, note): خطوةٌ واحدة لكل التأكيد (كلُّها أو لا شيء)، قفلُ صفّ الصنف
--   (FOR UPDATE بترتيب item_id ⇒ لا تشابك)، حركةٌ لكل شريحة دفعة تحمل الجلسةَ والمريضَ والطبيبَ
--   والدفعة (المريضُ والطبيبُ يُشتقّان من الجلسة بالقاعدة — لا يُمرَّران من الواجهة).
-- • inventory_finish_batch(batch): «انتهت» = يخرج متبقّيها من الكمية بحركة تعديل (إتلاف) بخطوةٍ واحدة.
-- • تريغر الصنف: أي إنقاصٍ للكمية من مسارٍ آخر (نسخةٌ مخزّنة قديمة · تعديلٌ يدوي) يقصّ الدفعات بنفس
--   الترتيب ⇒ الثابتُ يصمد بلا كسر العملاء القدامى. تريغر الدفعة: لا دفعةَ تتجاوز الكمية + ملكيةُ الصنف.
-- • حرّاسُ ملكية (#694 — FK لا يمرّ بـRLS) على كل أعمدة الربط: الحركات · الدفعات · موادّ العلاج.
-- • تسويةُ البيانات القائمة مرةً واحدة: الفائضُ يُقصّ من الأقدم انتهاءً (تاريخياً) بحركة «تعديل» موثّقة
--   بتغيير 0 (الكميةُ نفسها لا تتغيّر).
-- صفرُ لمسٍ مالي: كلفةُ المواد بالمحاسبة = Σ حركات consume × السعر — المجموعُ لا يتغيّر بتقسيم الشرائح.
-- SECURITY INVOKER في كل شيء ⇒ RLS + بوّابة الاشتراك تبقيان سارية. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ١) الأعمدة ─────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS session_id  uuid REFERENCES public.ledger_sessions(id)   ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS patient_id  uuid REFERENCES public.patients(id)          ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.clinic_doctors(id)    ON DELETE SET NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS batch_id    uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_batches   ADD COLUMN IF NOT EXISTS received_qty numeric;
UPDATE public.inventory_batches SET received_qty = quantity WHERE received_qty IS NULL AND quantity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_mov_session ON public.inventory_movements (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_patient ON public.inventory_movements (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_batch   ON public.inventory_movements (batch_id)   WHERE batch_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_batch_item_open ON public.inventory_batches (item_id) WHERE is_finished = false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_quantity_nonneg') THEN
    ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_quantity_nonneg CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batches_quantity_nonneg') THEN
    ALTER TABLE public.inventory_batches ADD CONSTRAINT inventory_batches_quantity_nonneg CHECK (quantity IS NULL OR quantity >= 0);
  END IF;
END $$;

-- ── ٢) حرّاسُ الملكية (#694) ───────────────────────────────────────────────
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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_movements_guard ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_guard
  BEFORE INSERT OR UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_guard();

CREATE OR REPLACE FUNCTION public.treatment_materials_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'material_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treatments t WHERE t.id = NEW.treatment_id AND t.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'material_treatment_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_treatment_materials_guard ON public.treatment_materials;
CREATE TRIGGER trg_treatment_materials_guard
  BEFORE INSERT OR UPDATE OF owner_id, item_id, treatment_id ON public.treatment_materials
  FOR EACH ROW EXECUTE FUNCTION public.treatment_materials_guard();

-- ── ٣) الأخذُ بترتيب FEFO (مشترك: الخصم والقصّ) ────────────────────────────
-- يُنقص الدفعات ويُرجع الشرائح (batch_id NULL = الرصيد بلا دفعة). لا يلمس كميةَ الصنف ولا يكتب حركات.
-- p_batches_only: للقصّ — الفائضُ دفعاتٌ حصراً فلا شريحةَ للرصيد.
CREATE OR REPLACE FUNCTION public.inventory_fefo_take(p_item uuid, p_qty numeric, p_today date, p_batches_only boolean DEFAULT false)
RETURNS TABLE(batch_id uuid, took numeric)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_need numeric := coalesce(p_qty, 0);
  v_itemq numeric; v_open numeric; v_rem numeric; t numeric; b record;
BEGIN
  IF v_need <= 0 THEN RETURN; END IF;
  SELECT i.quantity INTO v_itemq FROM public.inventory_items i WHERE i.id = p_item;
  SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_open
    FROM public.inventory_batches x WHERE x.item_id = p_item AND x.is_finished = false;
  v_rem := greatest(coalesce(v_itemq, 0) - v_open, 0);

  -- ١) السارية والتي بلا تاريخ — الأقربُ انتهاءً أولاً
  FOR b IN SELECT x.id, x.quantity FROM public.inventory_batches x
            WHERE x.item_id = p_item AND x.is_finished = false AND coalesce(x.quantity, 0) > 0
              AND (x.expiry_date IS NULL OR x.expiry_date >= p_today)
            ORDER BY x.expiry_date NULLS LAST, x.created_at, x.id
            FOR UPDATE LOOP
    EXIT WHEN v_need <= 0;
    t := least(v_need, b.quantity);
    UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = b.id;
    batch_id := b.id; took := t; RETURN NEXT;
    v_need := v_need - t;
  END LOOP;

  -- ٢) الرصيدُ بلا دفعة
  IF v_need > 0 AND NOT p_batches_only AND v_rem > 0 THEN
    t := least(v_need, v_rem);
    batch_id := NULL; took := t; RETURN NEXT;
    v_need := v_need - t;
  END IF;

  -- ٣) المنتهية — آخراً
  FOR b IN SELECT x.id, x.quantity FROM public.inventory_batches x
            WHERE x.item_id = p_item AND x.is_finished = false AND coalesce(x.quantity, 0) > 0
              AND x.expiry_date < p_today
            ORDER BY x.expiry_date, x.created_at, x.id
            FOR UPDATE LOOP
    EXIT WHEN v_need <= 0;
    t := least(v_need, b.quantity);
    UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = b.id;
    batch_id := b.id; took := t; RETURN NEXT;
    v_need := v_need - t;
  END LOOP;

  IF v_need > 0 AND NOT p_batches_only THEN
    batch_id := NULL; took := v_need; RETURN NEXT;
  END IF;
END $$;

-- ── ٤) تسويةُ البيانات القائمة (قبل تريغر الدفعة) ───────────────────────────
-- الاستهلاكُ قبل M169 لم يُنقص الدفعات ⇒ الفائضُ يُقصّ من الأقدم انتهاءً (هو ما صُرف حينها).
DO $$
DECLARE it record; b record; v_ex numeric; t numeric;
BEGIN
  FOR it IN
    SELECT i.id, i.owner_id, i.quantity, s.open
      FROM public.inventory_items i
      JOIN (SELECT item_id, sum(coalesce(quantity, 0)) AS open
              FROM public.inventory_batches WHERE is_finished = false GROUP BY item_id) s ON s.item_id = i.id
     WHERE s.open > i.quantity
  LOOP
    v_ex := it.open - it.quantity;
    FOR b IN SELECT id, quantity FROM public.inventory_batches
              WHERE item_id = it.id AND is_finished = false AND coalesce(quantity, 0) > 0
              ORDER BY expiry_date NULLS LAST, created_at, id LOOP
      EXIT WHEN v_ex <= 0;
      t := least(v_ex, b.quantity);
      UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = b.id;
      INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id)
      VALUES (it.owner_id, it.id, 0, 'adjust',
              '📦 تسوية: الدفعة نقصت ' || trim(to_char(t, 'FM999999990.##')) || ' لتطابق الكمية (الاستهلاك قبل 2/10/2026 ما كان ينقّص الدفعات)',
              b.id);
      v_ex := v_ex - t;
    END LOOP;
  END LOOP;
END $$;

-- ── ٥) الثابت: تريغر الدفعة (لا تتجاوز الكمية) + تريغر الصنف (يقصّ عند الإنقاص) ─────
CREATE OR REPLACE FUNCTION public.inventory_batches_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_itemq numeric; v_owner uuid; v_other numeric; v_grow boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.received_qty IS NULL THEN NEW.received_qty := NEW.quantity; END IF;
  SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'batch_item_not_owned' USING ERRCODE = '42501';
  END IF;
  v_grow := NOT NEW.is_finished AND (
              TG_OP = 'INSERT'
              OR NEW.item_id IS DISTINCT FROM OLD.item_id
              OR OLD.is_finished
              OR coalesce(NEW.quantity, 0) > coalesce(OLD.quantity, 0));
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
DROP TRIGGER IF EXISTS trg_inventory_batches_guard ON public.inventory_batches;
CREATE TRIGGER trg_inventory_batches_guard
  BEFORE INSERT OR UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.inventory_batches_guard();

CREATE OR REPLACE FUNCTION public.inventory_items_trim_batches()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_open numeric;
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_open
      FROM public.inventory_batches x WHERE x.item_id = NEW.id AND x.is_finished = false;
    IF v_open > NEW.quantity THEN
      PERFORM public.inventory_fefo_take(NEW.id, v_open - NEW.quantity,
                                         (now() AT TIME ZONE 'Asia/Damascus')::date, true);
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_items_trim_batches ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_trim_batches
  AFTER UPDATE OF quantity ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_items_trim_batches();

-- ── ٦) الخصمُ الذرّي ────────────────────────────────────────────────────────
-- p_lines: [{item_id, qty, session_id?}] (≤ 200). يُرجع {lines:[{item_id, session_id, requested, deducted, remaining, skipped?}]}.
-- الكميةُ تُقصّ عند المتوفّر (لا سالب)، والنقصُ يعود للواجهة لتعلنه (#689).
CREATE OR REPLACE FUNCTION public.inventory_consume(p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_active boolean; v_pat uuid; v_prov uuid; v_take numeric;
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
           o AS ord
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o)
     ORDER BY 1, 4                         -- قفلُ الأصناف بترتيبٍ ثابت ⇒ لا تشابك بين شاشتين
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
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, v_take, v_today, false) LOOP
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

-- ── ٧) «انتهت» = متبقّي الدفعة يخرج من الكمية (إتلاف) بخطوةٍ واحدة ──────────
CREATE OR REPLACE FUNCTION public.inventory_finish_batch(p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item uuid; v_left numeric; v_exp date; v_fin boolean; v_q numeric; v_out numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  SELECT b.item_id INTO v_item FROM public.inventory_batches b WHERE b.id = p_batch AND b.owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_owned' USING ERRCODE = '42501'; END IF;
  SELECT i.quantity INTO v_q FROM public.inventory_items i WHERE i.id = v_item AND i.owner_id = v_uid FOR UPDATE;
  SELECT coalesce(b.quantity, 0), b.expiry_date, b.is_finished INTO v_left, v_exp, v_fin
    FROM public.inventory_batches b WHERE b.id = p_batch FOR UPDATE;
  IF v_fin THEN RETURN jsonb_build_object('item_id', v_item, 'removed', 0, 'already', true); END IF;
  v_out := least(v_left, greatest(v_q, 0));
  UPDATE public.inventory_batches SET quantity = 0, is_finished = true WHERE id = p_batch;
  IF v_out > 0 THEN
    UPDATE public.inventory_items SET quantity = quantity - v_out WHERE id = v_item;
  END IF;
  INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id)
  VALUES (v_uid, v_item, -v_out, 'adjust',
          '📦 دفعة انتهت' || CASE WHEN v_out > 0 THEN ' — أُخرج متبقّيها من المخزون' ELSE '' END
          || ' (صلاحية ' || coalesce(to_char(v_exp, 'DD/MM/YYYY'), 'بلا تاريخ') || ')',
          p_batch);
  RETURN jsonb_build_object('item_id', v_item, 'removed', v_out, 'already', false);
END $$;

REVOKE ALL ON FUNCTION public.inventory_consume(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_finish_batch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_fefo_take(uuid, numeric, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_consume(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_finish_batch(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_fefo_take(uuid, numeric, date, boolean) TO authenticated, service_role;

COMMENT ON COLUMN public.inventory_movements.session_id  IS 'M169: الجلسة التي استُهلكت لها المادة (ملكية: trg_inventory_movements_guard)';
COMMENT ON COLUMN public.inventory_movements.patient_id  IS 'M169: مريضُ الجلسة — يُشتقّ بالقاعدة داخل inventory_consume';
COMMENT ON COLUMN public.inventory_movements.provider_id IS 'M169: طبيبُ الجلسة — يُشتقّ بالقاعدة داخل inventory_consume';
COMMENT ON COLUMN public.inventory_movements.batch_id    IS 'M169: الدفعة التي خرجت منها الشريحة (NULL = رصيدٌ بلا دفعة)';
COMMENT ON COLUMN public.inventory_batches.received_qty  IS 'M169: الكمية المستلمة (quantity صارت المتبقّي)';
COMMENT ON FUNCTION public.inventory_consume(jsonb, text) IS 'M169: خصمُ موادٍ ذرّي — قفلُ الصنف · FEFO على الدفعات · حركةٌ لكل شريحة بالجلسة والمريض والطبيب والدفعة';
