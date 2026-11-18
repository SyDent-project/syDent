-- ============================================================================
-- Migration 213 — «الزيارة التالية» (ج2-ب): متابعةٌ مخطّطة لعلاجٍ قيد الإنجاز
-- ----------------------------------------------------------------------------
-- الطلب (المالك، خطة ج1–ج3 المعتمدة 17/11/2026): لعلاجٍ يمتدّ على زيارات، تُحجز الزيارةُ التالية من بطاقة المريض
--   مربوطةً بالعلاج نفسه، وحين يُكمَل موعدُها تصير جلسةَ متابعة — بلا فاتورةٍ جديدة.
-- النموذج: صفُّ متابعةٍ «مخطّط» (status = 'planned') — شكلُه شكلُ M210 حرفياً (cost = 0 · بلا موضع · parent_id ثابت)،
--   يُربط بموعدٍ بالمسار القائم (appointment_id — «العلاجات المخطّطة» بنافذة الموعد)، و«إكمال الموعد» أو «إكمال»
--   بجدول الجلسات يقلبه منجزاً بالمسار القائم نفسه. قيدُ الشكل وحارسُ M210 يقبلانه كما هما (completed | planned).
-- session_followup_plan(parent, date, provider, step, notes):
--   الأساسيةُ: منجزةٌ وليست متابعة ولنفس العيادة (doctor_id = auth.uid()) — قواعدُ session_followup_add نفسُها.
--   التاريخ: من اليوم (توقيت دمشق) إلى سنتين، ولا قبل تاريخ الأساسية ⇒ followup_date_invalid.
--   النصّ: خطوةٌ ≤ 80 · ملاحظات ≤ 2000 ⇒ followup_text_too_long. الطبيب: من أطباء العيادة ⇒ followup_provider_invalid.
--   الأساسيةُ تصير «قيد الإنجاز» (followup_state = 'open') — زيارةٌ قادمة تعني أن العلاج لم يكتمل.
-- SECURITY INVOKER (RLS وبوابةُ الاشتراك كما هما) · لـauthenticated وحدها · صفر لمسٍ مالي (cost = 0). additive · idempotent.
-- الرجوع: DROP FUNCTION public.session_followup_plan(uuid, date, uuid, text, text) — الصفوفُ المخطّطة تبقى صحيحةً بقيد M210.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.session_followup_plan(
  p_parent uuid, p_date date, p_provider uuid DEFAULT NULL, p_step text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b       public.ledger_sessions;
  c       public.ledger_sessions;
  v_step  text := NULLIF(btrim(regexp_replace(COALESCE(p_step, ''), '\s+', ' ', 'g')), '');
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
BEGIN
  SELECT * INTO b FROM public.ledger_sessions
   WHERE id = p_parent AND doctor_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR b.parent_id IS NOT NULL OR COALESCE(b.status, 'completed') <> 'completed' THEN
    RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_date IS NULL OR p_date < v_today OR p_date > v_today + 730 OR (b.date IS NOT NULL AND p_date < b.date) THEN
    RAISE EXCEPTION 'followup_date_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(COALESCE(v_step, '')) > 80 OR char_length(COALESCE(v_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'followup_text_too_long' USING ERRCODE = 'P0001';
  END IF;
  IF p_provider IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.clinic_doctors d WHERE d.id = p_provider AND d.owner_id = b.doctor_id) THEN
    RAISE EXCEPTION 'followup_provider_invalid' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ledger_sessions
    (doctor_id, patient_id, type, description, cost, date, notes, status, provider_id, currency, parent_id)
  VALUES
    (b.doctor_id, b.patient_id,
     left('متابعة — ' || COALESCE(NULLIF(btrim(b.type), ''), 'علاج'), 200),
     v_step, 0, p_date, v_notes, 'planned', COALESCE(p_provider, b.provider_id), b.currency, b.id)
  RETURNING * INTO c;

  UPDATE public.ledger_sessions SET followup_state = 'open' WHERE id = b.id AND followup_state IS DISTINCT FROM 'open';

  RETURN jsonb_build_object('session', to_jsonb(c), 'state', 'open');
END $$;

REVOKE ALL ON FUNCTION public.session_followup_plan(uuid, date, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_followup_plan(uuid, date, uuid, text, text) TO authenticated;

COMMIT;

-- التحقق (يدوياً):
-- SELECT has_function_privilege('anon','public.session_followup_plan(uuid,date,uuid,text,text)','EXECUTE');            -- false
-- SELECT has_function_privilege('authenticated','public.session_followup_plan(uuid,date,uuid,text,text)','EXECUTE');   -- true
