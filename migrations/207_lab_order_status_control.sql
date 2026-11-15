-- ============================================================
-- Migration 207 — حالةُ طلب المخبر من نافذته: إلغاءٌ واستعادة وتصحيحُ خطوة
-- ------------------------------------------------------------
-- العيب (ملاحظة المالك على برنامجٍ آخر، 15/11/2026): لا «طلبٌ ملغى»، ولا تُحدَّد الحالةُ من نافذة الطلب.
--   نقرةٌ خاطئة على «تم الاستلام» لا رجعةَ عنها إلا بحذف الطلب، وطلبٌ أُلغي يُحذف فيضيع سجلُّه.
-- المراجعة: Dentally (حالةُ المخبر قائمةٌ منسدلة تُغيَّر بحرّية) · Open Dental (الحالةُ من تواريخ التتبّع — تُصحَّح
--   بتعديل التاريخ) · البرنامجُ المعروض (مسودة · مُرسلة · قيد التحضير · مُستلمة · سُلّمت · ملغاة).
-- النموذج:
--   • الإلغاء = الحالةُ القائمة 'rejected' (تُعرض «ملغى»). هي مستثناةٌ أصلاً من كلفة المخابر وذمّتها وأدائها وتقاريرها
--     بكل موضع (accounting · labs · provider-reports) — فصفر لمسٍ مالي: طلبٌ ملغى لا تُحتسب كلفتُه.
--   • cancel_prev_status / cancel_reason / date_cancelled — لتُستعاد الحالةُ السابقة كما كانت.
--   • lab_order_set_status(order, status, reason): الانتقالُ الوحيد من النافذة، ذرّيٌّ ويضبط التواريخ:
--       بين (أُرسل · استُلم · فُحص · رُكِّب) بالاتجاهين — الرجوعُ يفرّغ تواريخَ ما بعده، والتقدّمُ يختم ما ينقص؛
--       إلى «ملغى» من (أُرسل · استُلم · فُحص · إعادة) — المسودّةُ لم تُرسَل فتُحذف، والمركَّبُ يُرجَع خطوةً أولاً؛
--       ومن «ملغى» إلى حالته السابقة وحدها.
--     حدُّ المسودّة يبقى لتاريخ الإرسال (M127)، و«إعادة» لحوارها (M160: سببٌ واستحقاق) — كلاهما خارج هذه الدالة.
--   • المراحل (M206): «رُكِّب» للمرحلة الأخيرة وحدها يفرضه تريغرها كما هو؛ والتراجعُ عن مرحلةٍ له دالتُه.
--   • استعادةُ طلبٍ أُلغي وهو «إعادة» لا تفتح دورةَ إعادةٍ جديدة: lab_orders_redo_cycle تتجاهل القدومَ من 'rejected'
--     (سطرٌ واحد أُضيف لشرطها — باقيها حرفيٌّ من M160).
-- SECURITY INVOKER ⇒ RLS وبوابةُ الاشتراك كما هما. idempotent.
-- ============================================================

BEGIN;

ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS cancel_prev_status text;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS date_cancelled timestamptz;

ALTER TABLE public.lab_orders DROP CONSTRAINT IF EXISTS lab_orders_cancel_shape;
ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_cancel_shape
  CHECK ((cancel_reason IS NULL OR char_length(cancel_reason) <= 300)
     AND (cancel_prev_status IS NULL OR cancel_prev_status IN ('sent', 'received', 'checked', 'redo')));

COMMENT ON COLUMN public.lab_orders.cancel_prev_status IS 'M207: حالةُ الطلب قبل إلغائه — تُستعاد بها. NULL لطلبٍ غير ملغى.';
COMMENT ON COLUMN public.lab_orders.cancel_reason IS 'M207: سببُ الإلغاء (اختياري، ≤300).';
COMMENT ON COLUMN public.lab_orders.date_cancelled IS 'M207: وقتُ الإلغاء.';

/* M160 حرفياً + شرطٌ واحد: القدومُ من «ملغى» استعادةٌ لا إعادةٌ جديدة */
CREATE OR REPLACE FUNCTION public.lab_orders_redo_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'redo' AND OLD.status IS DISTINCT FROM 'redo' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    INSERT INTO public.lab_order_redos
      (doctor_id, lab_order_id, prev_status, prev_date_received, prev_date_checked, prev_date_due, new_date_due)
    VALUES
      (OLD.doctor_id, OLD.id, OLD.status, OLD.date_received, OLD.date_checked, OLD.date_due, NEW.date_due);
  ELSIF OLD.status = 'redo' AND NEW.status = 'sent' THEN
    NEW.date_sent      := COALESCE(OLD.date_sent, NEW.date_sent);
    NEW.date_received  := NULL;
    NEW.date_checked   := NULL;
    NEW.date_delivered := NULL;
    UPDATE public.lab_order_redos SET resent_at = now()
     WHERE lab_order_id = OLD.id AND resent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.lab_order_set_status(p_order uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.lab_orders; prev text;
BEGIN
  SELECT * INTO o FROM public.lab_orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab_status_not_allowed' USING ERRCODE = 'P0001'; END IF;
  IF p_status IS NOT DISTINCT FROM o.status THEN RETURN to_jsonb(o); END IF;

  IF p_status = 'rejected' THEN
    /* إلغاء: مسودّةٌ لم تُرسَل تُحذف (ولا تاريخَ إرسالٍ لها — lab_orders_draft_no_date_sent) · عملٌ رُكِّب يُرجَع خطوةً أولاً */
    IF o.status NOT IN ('sent', 'received', 'checked', 'redo') THEN
      RAISE EXCEPTION 'lab_status_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.lab_orders
       SET status = 'rejected', cancel_prev_status = o.status,
           cancel_reason = NULLIF(btrim(left(COALESCE(p_reason, ''), 300)), ''), date_cancelled = now()
     WHERE id = p_order RETURNING * INTO o;

  ELSIF o.status = 'rejected' THEN
    /* استعادة: إلى الحالة التي أُلغي منها وحدها — تواريخُها لم تُمسّ */
    prev := COALESCE(o.cancel_prev_status, 'sent');
    IF p_status IS DISTINCT FROM prev THEN RAISE EXCEPTION 'lab_status_not_allowed' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.lab_orders
       SET status = prev, cancel_prev_status = NULL, cancel_reason = NULL, date_cancelled = NULL
     WHERE id = p_order RETURNING * INTO o;

  ELSIF o.status IN ('sent', 'received', 'checked', 'delivered') AND p_status IN ('sent', 'received', 'checked', 'delivered') THEN
    /* تصحيحُ الحالة: الرجوعُ يفرّغ تواريخَ ما بعده، والتقدّمُ يختم ما ينقص. date_sent لا يُمسّ. */
    UPDATE public.lab_orders
       SET status = p_status,
           date_received  = CASE WHEN p_status = 'sent' THEN NULL
                                 WHEN p_status IN ('received', 'checked') THEN COALESCE(date_received, now())
                                 ELSE date_received END,
           date_checked   = CASE WHEN p_status IN ('sent', 'received') THEN NULL
                                 WHEN p_status = 'checked' THEN COALESCE(date_checked, now())
                                 ELSE date_checked END,
           date_delivered = CASE WHEN p_status = 'delivered' THEN COALESCE(date_delivered, now()) ELSE NULL END
     WHERE id = p_order RETURNING * INTO o;

  ELSE
    /* مسودّة ⇄ مُرسل لتاريخ الإرسال (M127) · «إعادة» لحوارها (M160) · أيُّ قيمةٍ أخرى مرفوضة */
    RAISE EXCEPTION 'lab_status_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(o);
END $$;

REVOKE ALL ON FUNCTION public.lab_order_set_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_order_set_status(uuid, text, text) TO authenticated;

COMMIT;
