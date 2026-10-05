-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 171 — الجردُ الدوري بالفروق (2 تشرين الأول 2026 — جولة المخزون، البند 3)
-- ---------------------------------------------------------------------------
-- Open Dental «Level On Hand» بالعدّ · الممارسةُ المعتمدة (Cycle count): ورقةُ عدّ، والفرقُ يُسجَّل تسويةً
-- بسببٍ مستقل، وتقريرُ فروقٍ بقيمتها. العدُّ جزئيٌّ مسموح (ما لم يُعدّ لا يُلمس).
--   • inventory_counts      — رأسُ الجرد (متى · ملاحظة).
--   • inventory_count_lines — لكل صنفٍ معدود: المتوقَّع (ما رآه العادُّ بالنظام) · المعدود · الفرقُ المطبَّق ·
--                             سعرُ الشراء وعملتُه لحظةَ الجرد (قيمةُ الفرق لا تتغيّر لو تغيّر السعر لاحقاً).
--   • reason 'count' بقيد الحركات — حركةٌ لكل فرقٍ ≠ 0 مربوطةٌ بالجرد (count_id)؛ النقصُ يخرج من الدفعات
--     بترتيب FEFO نفسه (M169) فيصمد الثابت، والزيادةُ رصيدٌ بلا دفعة.
-- • inventory_apply_count(lines, note): خطوةٌ واحدة، قفلُ الأصناف بترتيبٍ ثابت. الفرقُ = المعدود − ما رآه العادّ،
--   والكميةُ الجديدة = الحالية + الفرق ⇒ حركةٌ جرت بين فتح الورقة والاعتماد (استهلاكُ جلسة) لا تُمحى.
-- كلفةُ المواد بالمحاسبة = حركات consume وحدها ⇒ فرقُ الجرد لا يدخل أيَّ معادلةٍ مالية (يُعرض بتقريره فقط).
-- حرّاسُ ملكية (#694) على count_id وعلى سطور الجرد. SECURITY INVOKER. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_counts_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);
CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  expected numeric NOT NULL,
  counted numeric NOT NULL,
  variance numeric NOT NULL,
  unit_price numeric,
  currency text,
  CONSTRAINT inventory_count_lines_counted_nonneg CHECK (counted >= 0),
  CONSTRAINT inventory_count_lines_currency_valid CHECK (currency IS NULL OR currency IN ('SYP','USD')),
  CONSTRAINT inventory_count_lines_one_per_item UNIQUE (count_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_counts_owner ON public.inventory_counts (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_count ON public.inventory_count_lines (count_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_item ON public.inventory_count_lines (item_id);

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_counts_owner_all ON public.inventory_counts;
CREATE POLICY inventory_counts_owner_all ON public.inventory_counts FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS inventory_count_lines_owner_all ON public.inventory_count_lines;
CREATE POLICY inventory_count_lines_owner_all ON public.inventory_count_lines FOR ALL
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
-- بوابةُ الاشتراك (M141): القراءةُ لغير «none» والكتابةُ لـ«full» — بالدالّة المشتركة لا بنسخةٍ يدوية
SELECT public._sub_guard_table('public.inventory_counts');
SELECT public._sub_guard_table('public.inventory_count_lines');

-- سببُ الحركة الجديد
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inv_reason_valid;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inv_reason_valid
  CHECK (reason = ANY (ARRAY['purchase', 'consume', 'adjust', 'return', 'count']));
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS count_id uuid REFERENCES public.inventory_counts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inv_mov_count ON public.inventory_movements (count_id) WHERE count_id IS NOT NULL;

-- حارسُ الحركات (M169) يشمل الجرد
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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_movements_guard ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_guard
  BEFORE INSERT OR UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_guard();

CREATE OR REPLACE FUNCTION public.inventory_count_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_counts k WHERE k.id = NEW.count_id AND k.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'count_line_count_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'count_line_item_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_count_lines_guard ON public.inventory_count_lines;
CREATE TRIGGER trg_inventory_count_lines_guard
  BEFORE INSERT OR UPDATE OF owner_id, count_id, item_id ON public.inventory_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.inventory_count_lines_guard();

-- ── اعتمادُ الجرد ──────────────────────────────────────────────────────────
-- p_lines: [{item_id, seen, counted}] (≤ 500). يُرجع {count_id, lines:[{item_id, expected, counted, variance, quantity}]}.
CREATE OR REPLACE FUNCTION public.inventory_apply_count(p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_count uuid; v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_price numeric; v_cur text; v_var numeric; v_new numeric; v_take numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 500 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'item_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_counts (owner_id, note)
  VALUES (v_uid, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_count;

  FOR r IN
    SELECT (e->>'item_id')::uuid AS item_id, (e->>'seen')::numeric AS seen, (e->>'counted')::numeric AS counted
      FROM jsonb_array_elements(p_lines) e
     ORDER BY 1
  LOOP
    IF r.item_id IS NULL OR r.seen IS NULL OR r.counted IS NULL OR r.counted < 0 OR r.counted > 1000000 OR r.seen < 0 THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.quantity, i.purchase_price, i.currency INTO v_q, v_price, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid AND i.is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;

    v_var := r.counted - r.seen;                  -- الفرقُ كما رآه العادّ
    v_new := greatest(v_q + v_var, 0);            -- الحركاتُ بين الورقة والاعتماد تبقى
    v_var := v_new - v_q;                         -- الفرقُ المطبَّق فعلاً (بعد القصّ عند الصفر)

    IF v_var < 0 THEN
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, -v_var, v_today, false) LOOP
        INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, count_id)
        VALUES (v_uid, r.item_id, -s.took, 'count', 'جرد: نقص', s.batch_id, v_count);
      END LOOP;
      UPDATE public.inventory_items SET quantity = v_new WHERE id = r.item_id;
    ELSIF v_var > 0 THEN
      UPDATE public.inventory_items SET quantity = v_new WHERE id = r.item_id;
      INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, count_id)
      VALUES (v_uid, r.item_id, v_var, 'count', 'جرد: زيادة', v_count);
    END IF;

    INSERT INTO public.inventory_count_lines (owner_id, count_id, item_id, expected, counted, variance, unit_price, currency)
    VALUES (v_uid, v_count, r.item_id, r.seen, r.counted, v_var, v_price, v_cur);
    v_out := v_out || jsonb_build_object('item_id', r.item_id, 'expected', r.seen, 'counted', r.counted,
                                         'variance', v_var, 'quantity', v_new);
  END LOOP;
  RETURN jsonb_build_object('count_id', v_count, 'lines', v_out);
END $$;
REVOKE ALL ON FUNCTION public.inventory_apply_count(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_apply_count(jsonb, text) TO authenticated, service_role;

COMMENT ON TABLE public.inventory_counts IS 'M171: رأسُ جردٍ دوري';
COMMENT ON TABLE public.inventory_count_lines IS 'M171: سطرُ جرد — المتوقَّع (ما رآه العادّ) · المعدود · الفرقُ المطبَّق · السعرُ والعملةُ لحظةَ الجرد';
COMMENT ON COLUMN public.inventory_movements.count_id IS 'M171: الجردُ الذي سجّل هذا الفرق (reason = count)';
