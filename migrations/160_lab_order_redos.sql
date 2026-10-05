-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 160 — دورةُ إعادة العمل للمخبر (29 أيلول 2026 — جولة مقارنة المخابر، البند 1)
-- ---------------------------------------------------------------------------
-- العيب: «إعادة» كانت تبديلَ حالةٍ فقط، ثم «📤 تم التسليم للمخبر» تختم date_sent من جديد.
--   date_sent هو مرساةُ كلفة المخبر بالمحاسبة وتقارير الأطباء (cash-basis — M73/#196)،
--   فكانت كلفةُ الطلب تقفز من شهر إرساله الأول إلى شهر الإعادة، ويضيع تاريخُ الاستلام
--   الأول، بلا سببٍ ولا استحقاقٍ جديد ولا عدّاد (Dentrix «Return Case to Lab» ·
--   Carestream «reopen for corrections» يحفظان الدورة).
-- (١) lab_order_redos: صفٌّ لكل إعادة — السبب · الحالةُ السابقة ولقطةُ تواريخ الدورة المنتهية
--     (استلام/فحص/استحقاق) · الاستحقاقُ الجديد · وقتُ الإعادة · وقتُ إعادة الإرسال.
-- (٢) تريغر lab_orders_redo_cycle (BEFORE UPDATE) — الثابتُ بالقاعدة لا بالعميل، فحتى نسخةٌ
--     قديمة مخزَّنة بالكاش تُصان:
--       · الدخولُ إلى 'redo' ⇒ يُسجَّل صفُّ الدورة من OLD (أيُّ مسارٍ كتب الحالة).
--       · 'redo' → 'sent' ⇒ date_sent يبقى الأصليّ (المرساةُ المالية لا تتحرّك)، وتواريخُ
--         الاستلام/الفحص/التركيب تُفرَّغ لدورةٍ جديدة، ويُختم resent_at على الدورة المفتوحة.
-- (٣) lab_order_redo(order, reason, new_due): الإعادةُ بفعلٍ واحد ذرّي (SECURITY INVOKER ⇒ RLS
--     والبوابة كما هي) — من «استُلم/فُحص» فقط، مرآةُ زرّ الواجهة.
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lab_order_redos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lab_order_id        uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  reason              text,
  prev_status         text NOT NULL,
  prev_date_received  timestamptz,
  prev_date_checked   timestamptz,
  prev_date_due       timestamptz,
  new_date_due        timestamptz,
  redo_at             timestamptz NOT NULL DEFAULT now(),
  resent_at           timestamptz,
  CONSTRAINT lab_order_redos_reason_len CHECK (reason IS NULL OR char_length(reason) <= 300)
);
CREATE INDEX IF NOT EXISTS idx_lab_order_redos_order  ON public.lab_order_redos(lab_order_id, redo_at);
CREATE INDEX IF NOT EXISTS idx_lab_order_redos_doctor ON public.lab_order_redos(doctor_id);

ALTER TABLE public.lab_order_redos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_order_redos_owner_all ON public.lab_order_redos;
CREATE POLICY lab_order_redos_owner_all ON public.lab_order_redos
  USING (doctor_id = (SELECT auth.uid())) WITH CHECK (doctor_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.lab_order_redos');

COMMENT ON TABLE public.lab_order_redos IS 'M160: دورات إعادة العمل للمخبر — لقطة الدورة المنتهية + السبب + الاستحقاق الجديد + وقت إعادة الإرسال.';

CREATE OR REPLACE FUNCTION public.lab_orders_redo_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'redo' AND OLD.status IS DISTINCT FROM 'redo' THEN
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

DROP TRIGGER IF EXISTS trg_lab_orders_redo_cycle ON public.lab_orders;
CREATE TRIGGER trg_lab_orders_redo_cycle
  BEFORE UPDATE OF status ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.lab_orders_redo_cycle();

CREATE OR REPLACE FUNCTION public.lab_order_redo(p_order uuid, p_reason text DEFAULT NULL, p_new_due timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.lab_orders; r public.lab_order_redos;
BEGIN
  UPDATE public.lab_orders
     SET status = 'redo', date_due = COALESCE(p_new_due, date_due)
   WHERE id = p_order AND status IN ('received', 'checked')
  RETURNING * INTO o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lab_redo_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lab_order_redos
     SET reason = NULLIF(btrim(left(COALESCE(p_reason, ''), 300)), '')
   WHERE id = (SELECT id FROM public.lab_order_redos
                WHERE lab_order_id = p_order AND resent_at IS NULL
                ORDER BY redo_at DESC LIMIT 1)
  RETURNING * INTO r;
  RETURN jsonb_build_object('order', to_jsonb(o), 'redo', to_jsonb(r));
END $$;

REVOKE ALL ON FUNCTION public.lab_order_redo(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_order_redo(uuid, text, timestamptz) TO authenticated;
