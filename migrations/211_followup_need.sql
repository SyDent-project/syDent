-- ============================================================================
-- Migration 211 — «يحتاج جلسات متابعة» (ج2-أ): العلاجُ «قيد الإنجاز» من لحظة تسجيله
-- ----------------------------------------------------------------------------
-- الطلب (المالك، 13/11/2026): بنافذة العلاج زرٌّ يقول إن الجلسة تحتاج متابعة / جلساتٍ تالية؛ وقرارُه
--   (17/11/2026): مفعّلٌ افتراضياً للّبية والتيجان والجسور والزرع والأجهزة والتقويم (treatments.multi_visit — M210).
-- قبلها (M210): الحالةُ تُضبط على أساسيةٍ لها متابعاتٌ فقط — فالعلاجُ لا يصير «قيد الإنجاز» إلا بأول متابعة.
-- الآن session_followup_set_state:
--   'open'   — مسموحةٌ بلا متابعات (المفتاحُ بنافذة العلاج يضعها عند الحفظ).
--   'closed' — تبقى مشروطةً بمتابعةٍ واحدةٍ على الأقل («اكتمل» بلا زيارةٍ لاحقة = جلسةٌ عادية).
--   NULL     — «لا يحتاج متابعة»: يعيد الأساسيةَ جلسةً عادية — بلا متابعات فقط (لها متابعات ⇒ followup_base_has_children).
-- كلُّ ما عداها كما في M210: الأساسيةُ منجزةٌ وليست متابعة ولنفس العيادة (RLS + doctor_id = auth.uid())، SECURITY INVOKER،
--   ممنوحةٌ لـauthenticated وحدها. حذفُ آخر متابعة يعيد الأساسية عادية (trg_followup_after_delete — بلا تغيير).
-- صفر لمسٍ مالي. نفسُ التوقيع (uuid, text) ⇒ CREATE OR REPLACE يحفظ الصلاحيات؛ تُعاد صراحةً للأمان. idempotent.
-- الرجوع: إعادةُ تنفيذ تعريف الدالة من 210_followup_sessions.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.session_followup_set_state(p_session uuid, p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE b public.ledger_sessions; kids boolean;
BEGIN
  IF p_state IS NOT NULL AND NOT (p_state = ANY (ARRAY['open'::text, 'closed'::text])) THEN
    RAISE EXCEPTION 'followup_state_invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.ledger_sessions
   WHERE id = p_session AND doctor_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR b.parent_id IS NOT NULL OR COALESCE(b.status, 'completed') <> 'completed' THEN
    RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
  END IF;
  kids := EXISTS (SELECT 1 FROM public.ledger_sessions c WHERE c.parent_id = b.id);
  IF p_state = 'closed' AND NOT kids THEN
    RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_state IS NULL AND kids THEN
    RAISE EXCEPTION 'followup_base_has_children' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.ledger_sessions SET followup_state = p_state WHERE id = b.id RETURNING * INTO b;
  RETURN jsonb_build_object('id', b.id, 'state', b.followup_state);
END $$;

REVOKE ALL ON FUNCTION public.session_followup_set_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_followup_set_state(uuid, text) TO authenticated;

COMMIT;

-- التحقق (يدوياً):
-- SELECT has_function_privilege('anon','public.session_followup_set_state(uuid,text)','EXECUTE');            -- false
-- SELECT has_function_privilege('authenticated','public.session_followup_set_state(uuid,text)','EXECUTE');   -- true
