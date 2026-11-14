-- ============================================================
-- Migration 206 — مراحلُ طلب المخبر (ج3-أ)
-- ------------------------------------------------------------
-- العيب: طلبُ المخبر رحلةٌ واحدة (أُرسل ← استُلم ← فُحص ← تم التركيب). العملُ متعدّد الزيارات — جهازٌ متحرك
--   يعود من المخبر لكل زيارة (ملعقة إفرادية · ارتفاعات شمعية · صفّ الأسنان للتجربة · الجهاز النهائي) — كان
--   يُسجَّل إمّا طلباً لكل رحلة (فتتكرّر الكلفة) أو بـ«إعادة» (فتُحسب عيباً على المخبر بتقييمه).
-- المراجعة: Open Dental (حالةُ مخبرٍ لكل موعد + أربعة تواريخ) · EXACT و Dentally (حالةُ المخبر على الموعد الذي
--   يلزمه العمل) · Dentrix («Return Case to Lab» يعيد الحالة «خارجاً») · ICE Health («step set»: خطواتٌ لكلٍّ
--   منها حالةٌ وتاريخٌ وموعد). الخلاصة: المرحلةُ = الزيارةُ التي يلزمها العمل العائد من المخبر.
-- النموذج:
--   stages     jsonb     — مصفوفةُ المراحل بالترتيب: [{k, n, sent, due, received, checked, appt}]
--                          k مفتاحٌ ثابت للقوالب المبنيّة · n الاسمُ المعروض · والباقي يختمه التريغر عند إغلاق المرحلة.
--   stage_idx  smallint  — المرحلةُ الحالية. الطلبُ نفسه (status · date_due · appointment_id · date_received…)
--                          يحمل **دائماً** حالةَ المرحلة الحالية، فكلُّ سطحٍ قائم يقرأ الطلب يعمل بلا تعديل.
--   NULL للاثنين = طلبٌ بلا مراحل — السلوكُ القائم حرفياً.
-- الثوابت (بالقاعدة لا بالعميل — نسخةٌ قديمة بالكاش لا تخرقها):
--   • الانتقالُ للمرحلة التالية: من «استُلم/فُحص» إلى «أُرسل» بزيادة stage_idx واحداً فقط. date_sent لا يتحرّك
--     (مرساةُ كلفة المخبر بالمحاسبة وتقارير الأطباء — M73/#196/M160)، وتواريخُ الدورة تُفرَّغ، وتُختم المرحلةُ
--     المغلقة بتواريخها وموعدها.
--   • التراجعُ عن آخر انتقال: من «أُرسل» فقط (لا شيء استُلم بالمرحلة الجديدة) — يعيد تواريخَ المرحلة السابقة وحالتَها.
--   • «تم التركيب» للمرحلة الأخيرة وحدها.
--   • المراحلُ المغلقة تاريخٌ لا يُعدَّل، ولا تُحذف المراحلُ كلُّها بعد إغلاق أولاها.
-- صفر لمسٍ مالي: لا عمودَ مال، ولا تغييرَ بأي دالةٍ قائمة (lab_orders_redo_cycle كما هي). idempotent.
-- ============================================================

BEGIN;

ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS stages jsonb;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS stage_idx smallint;

ALTER TABLE public.lab_orders DROP CONSTRAINT IF EXISTS lab_orders_stages_shape;
ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_stages_shape
  CHECK ((stages IS NULL AND stage_idx IS NULL)
      OR (stages IS NOT NULL AND stage_idx IS NOT NULL AND jsonb_typeof(stages) = 'array'
          AND jsonb_array_length(stages) BETWEEN 2 AND 8
          AND stage_idx BETWEEN 0 AND jsonb_array_length(stages) - 1));

COMMENT ON COLUMN public.lab_orders.stages IS
  'M206: مراحل العمل متعدّد الزيارات — [{k,n,sent,due,received,checked,appt}] بالترتيب. NULL = طلبٌ برحلةٍ واحدة. عرضيٌّ: لا يدخل أي حساب مالي.';
COMMENT ON COLUMN public.lab_orders.stage_idx IS
  'M206: المرحلةُ الحالية (0..n-1). حقولُ الطلب (status/date_due/appointment_id/تواريخ الدورة) تحمل حالتَها. NULL مع stages NULL.';

CREATE OR REPLACE FUNCTION public.lab_orders_stage_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  n   int;
  i   int;
  e   jsonb;
  prv jsonb;
BEGIN
  IF NEW.stages IS NULL THEN
    /* بلا مراحل: السلوكُ القائم. حذفُ المراحل كلِّها ممنوعٌ بعد إغلاق أولاها (تاريخٌ يضيع) */
    IF TG_OP = 'UPDATE' AND OLD.stages IS NOT NULL AND COALESCE(OLD.stage_idx, 0) > 0 THEN
      RAISE EXCEPTION 'lab_stage_history_locked' USING ERRCODE = 'P0001';
    END IF;
    NEW.stage_idx := NULL;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.stages) <> 'array' THEN RAISE EXCEPTION 'lab_stage_bad' USING ERRCODE = 'P0001'; END IF;
  n := jsonb_array_length(NEW.stages);
  IF n < 2 OR n > 8 THEN RAISE EXCEPTION 'lab_stage_bad' USING ERRCODE = 'P0001'; END IF;
  FOR i IN 0 .. n - 1 LOOP
    e := NEW.stages -> i;
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'n') IS DISTINCT FROM 'string'
       OR char_length(btrim(e ->> 'n')) NOT BETWEEN 1 AND 40
       OR (e ? 'k' AND (jsonb_typeof(e -> 'k') <> 'string' OR char_length(e ->> 'k') > 20)) THEN
      RAISE EXCEPTION 'lab_stage_bad' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' OR OLD.stages IS NULL THEN
    /* طلبٌ جديد بمراحل، أو مراحلُ أُضيفت لطلبٍ قائم: يبدأ من الأولى، ولا يُولد «مُركَّباً» */
    NEW.stage_idx := 0;
    IF NEW.status = 'delivered' THEN RAISE EXCEPTION 'lab_stage_not_final' USING ERRCODE = 'P0001'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.stage_idx IS NULL THEN NEW.stage_idx := OLD.stage_idx; END IF;
  IF NEW.stage_idx > n - 1 THEN RAISE EXCEPTION 'lab_stage_bad' USING ERRCODE = 'P0001'; END IF;

  /* المراحلُ المغلقة تاريخٌ: لا يعدّلها العميل (الاسمُ والتواريخُ كما خُتمت) */
  IF OLD.stage_idx > 0 AND NEW.stage_idx >= OLD.stage_idx THEN
    FOR i IN 0 .. OLD.stage_idx - 1 LOOP
      IF (NEW.stages -> i) IS DISTINCT FROM (OLD.stages -> i) THEN
        NEW.stages := jsonb_set(NEW.stages, ARRAY[i::text], OLD.stages -> i);
      END IF;
    END LOOP;
  END IF;

  IF NEW.stage_idx = OLD.stage_idx + 1 THEN
    /* ── المرحلةُ التالية ── */
    IF OLD.status NOT IN ('received', 'checked') OR NEW.status <> 'sent' THEN
      RAISE EXCEPTION 'lab_stage_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    NEW.stages := jsonb_set(NEW.stages, ARRAY[OLD.stage_idx::text],
      ((OLD.stages -> OLD.stage_idx) - 'due' - 'received' - 'checked' - 'appt')
      || jsonb_strip_nulls(jsonb_build_object(
           'sent',     COALESCE((OLD.stages -> OLD.stage_idx) ->> 'sent', to_char(OLD.date_sent AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           'due',      to_char(OLD.date_due      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'received', to_char(OLD.date_received AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'checked',  to_char(OLD.date_checked  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'appt',     OLD.appointment_id)));
    NEW.stages := jsonb_set(NEW.stages, ARRAY[NEW.stage_idx::text],
      ((NEW.stages -> NEW.stage_idx) - 'due' - 'received' - 'checked' - 'appt')
      || jsonb_build_object('sent', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    NEW.date_sent      := OLD.date_sent;      -- المرساةُ المالية لا تتحرّك
    NEW.date_received  := NULL;
    NEW.date_checked   := NULL;
    NEW.date_delivered := NULL;

  ELSIF NEW.stage_idx = OLD.stage_idx - 1 THEN
    /* ── تراجعٌ عن آخر انتقال: لا شيء استُلم بالمرحلة الجديدة ── */
    IF OLD.status <> 'sent' THEN RAISE EXCEPTION 'lab_stage_not_allowed' USING ERRCODE = 'P0001'; END IF;
    prv := OLD.stages -> NEW.stage_idx;
    NEW.stages := jsonb_set(OLD.stages, ARRAY[OLD.stage_idx::text], (OLD.stages -> OLD.stage_idx) - 'sent' - 'due' - 'received' - 'checked' - 'appt');
    NEW.stages := jsonb_set(NEW.stages, ARRAY[NEW.stage_idx::text], prv - 'due' - 'received' - 'checked' - 'appt');
    NEW.date_sent      := OLD.date_sent;
    NEW.date_due       := (prv ->> 'due')::timestamptz;
    NEW.date_received  := (prv ->> 'received')::timestamptz;
    NEW.date_checked   := (prv ->> 'checked')::timestamptz;
    NEW.date_delivered := NULL;
    NEW.status         := CASE WHEN prv ->> 'checked' IS NOT NULL THEN 'checked' ELSE 'received' END;
    NEW.appointment_id := (SELECT a.id FROM public.appointments a WHERE a.id = (prv ->> 'appt')::uuid);   -- موعدٌ حُذف ⇒ بلا ربط

  ELSIF NEW.stage_idx <> OLD.stage_idx THEN
    RAISE EXCEPTION 'lab_stage_not_allowed' USING ERRCODE = 'P0001';

  ELSE
    /* المرحلةُ نفسها: «تم التركيب» للأخيرة وحدها (غيرُها يُنهى بحذف المراحل الباقية من التعديل) */
    IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.stage_idx < n - 1 THEN
      RAISE EXCEPTION 'lab_stage_not_final' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_orders_stage_cycle ON public.lab_orders;
CREATE TRIGGER trg_lab_orders_stage_cycle
  BEFORE INSERT OR UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.lab_orders_stage_cycle();

/* الانتقالُ بفعلٍ واحد ذرّي (SECURITY INVOKER ⇒ RLS وبوابةُ الاشتراك كما هما) — مرآةُ lab_order_redo */
CREATE OR REPLACE FUNCTION public.lab_order_next_stage(p_order uuid, p_new_due timestamptz DEFAULT NULL, p_appt uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.lab_orders;
BEGIN
  IF p_appt IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.appointments a JOIN public.lab_orders l ON l.id = p_order
        WHERE a.id = p_appt AND a.doctor_id = l.doctor_id AND a.patient_id = l.patient_id) THEN
    RAISE EXCEPTION 'lab_stage_bad_appt' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lab_orders
     SET status = 'sent', stage_idx = stage_idx + 1, date_due = p_new_due, appointment_id = p_appt
   WHERE id = p_order AND stages IS NOT NULL AND status IN ('received', 'checked')
     AND stage_idx < jsonb_array_length(stages) - 1
  RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab_stage_not_allowed' USING ERRCODE = 'P0001'; END IF;
  RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.lab_order_prev_stage(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.lab_orders;
BEGIN
  UPDATE public.lab_orders
     SET stage_idx = stage_idx - 1
   WHERE id = p_order AND stages IS NOT NULL AND status = 'sent' AND stage_idx > 0
  RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab_stage_not_allowed' USING ERRCODE = 'P0001'; END IF;
  RETURN to_jsonb(o);
END $$;

REVOKE ALL ON FUNCTION public.lab_orders_stage_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lab_order_next_stage(uuid, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_order_next_stage(uuid, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lab_order_prev_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_order_prev_stage(uuid) TO authenticated;

COMMIT;
