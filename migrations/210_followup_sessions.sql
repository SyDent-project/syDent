-- ============================================================================
-- Migration 210 — جلساتُ المتابعة (ج1): جلسةٌ تكمل علاجاً سابقاً على حسابه نفسه
-- ----------------------------------------------------------------------------
-- الطلب (المالك، 13/11/2026): علاجٌ يمتدّ على زيارات (غسلُ أقنيةٍ لخرّاج · تحضيرٌ ثم تركيب) تُسجَّل زياراتُه اللاحقة
--   مربوطةً بجلسته الأساسية، بلا فاتورةٍ جديدة.
-- المراجعة: Open Dental («Group for Multiple Visits» — المنجزُ من المجموعة «Complete (In Process)»، والرسمُ على زيارةٍ
--   واحدة والباقي بكودٍ سعرُه صفر) · axiUm (مخطّط ← In Process ← منجز، وكلُّ زيارةٍ تُوثَّق) · Dentolize (قيد الإنجاز لكل سن)
--   · CareStack (Clinical Case يجمع المواعيد والعلاجات — أثقل من الحاجة) · البرنامجُ المعروض (متابعةٌ مربوطة بأساسية،
--   مستوى واحد، على الفاتورة نفسها).
-- النموذج:
--   ledger_sessions.parent_id       — الجلسةُ الأساسية التي تكملها هذه المتابعة. NULL = جلسةٌ عادية (كلُّ القائم).
--   ledger_sessions.followup_state  — على الأساسية وحدها: 'open' (قيد الإنجاز) · 'closed' (اكتمل) · NULL (بلا متابعات).
--   treatments.multi_visit          — هل العلاجُ متعدّدُ الجلسات: true/false قرارُ العيادة · NULL = الافتراضيُّ حسب التصنيف
--                                     (لبية · تعويضات ثابتة ومتحركة · زرع · تقويم) يحسبه العميل — فالحساباتُ القائمة والجديدة
--                                     سواء بلا تعبئةٍ ولا مساسٍ بكتالوج التسجيل (قرار المالك 17/11/2026).
-- الثوابت (بالقاعدة لا بالعميل — نسخةٌ قديمة بالكاش لا تخرقها):
--   • المتابعةُ بلا مال: cost = 0 دائماً (أيُّ رسمٍ إضافي جلسةٌ جديدة — قرار المالك).
--   • المتابعةُ بلا موضع: لا سنّ ولا سطح ولا مفتاح علاج ولا ربع/فك/وحدة — تقرأها الواجهةُ من أساسيتها. محرّكُ المخطط
--     يطابق الجلسات بالسن والسطح والمفتاح؛ متابعةٌ تحملها كانت تُبقي رسمَ السن بعد حذف أساسيته (stillUsed بـdelSession).
--   • مستوى واحد: الأساسيةُ ليست متابعة، ومنجزة، ولنفس العيادة والمريض وبعملتها. الربطُ لا يتغيّر بعد الإنشاء.
--   • الأساسيةُ ذاتُ المتابعات لا تعود «مخطّطة» ولا تنتقل لمريضٍ آخر. حذفُها يحذف متابعاتها (ON DELETE CASCADE).
--   • حذفُ آخر متابعةٍ يعيد الأساسية جلسةً عادية (followup_state = NULL).
-- الدالتان (SECURITY INVOKER ⇒ RLS وبوابةُ الاشتراك كما هما):
--   session_followup_add(parent, date, provider, step, notes, close) — إدراجُ المتابعة وضبطُ حالة الأساسية بعمليةٍ واحدة.
--   session_followup_set_state(session, state)                        — إغلاقُ العلاج أو إعادةُ فتحه.
-- صفر لمسٍ مالي: لا تغييرَ بأي دالةٍ قائمة (realloc_patient_splits · sydent_split_currency_guard · portal_info كما هي)؛
--   صفُّ المتابعة cost = 0 فيمرّ بكل جمعٍ قائم بلا أثر. additive · idempotent.
-- ============================================================================

BEGIN;

-- [1] الأعمدة
ALTER TABLE public.ledger_sessions ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.ledger_sessions ADD COLUMN IF NOT EXISTS followup_state text;
ALTER TABLE public.treatments      ADD COLUMN IF NOT EXISTS multi_visit boolean;

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_parent_id_fkey;
ALTER TABLE public.ledger_sessions
  ADD CONSTRAINT ledger_sessions_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.ledger_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sessions_parent ON public.ledger_sessions USING btree (parent_id) WHERE (parent_id IS NOT NULL);

-- [2] شكلُ صفّ المتابعة وحالةُ الأساسية
ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_followup_shape;
ALTER TABLE public.ledger_sessions
  ADD CONSTRAINT ledger_sessions_followup_shape
  CHECK (parent_id IS NULL
      OR (parent_id <> id
          AND cost IS NOT NULL AND cost = 0
          AND status = ANY (ARRAY['completed'::text, 'planned'::text])
          AND tooth_num IS NULL AND surface IS NULL AND treatment_key IS NULL
          AND quadrant IS NULL AND arch IS NULL AND unit_teeth IS NULL
          AND denture_unit IS NULL AND denture_add IS NULL
          AND plan_option IS NULL AND phase IS NULL AND units IS NULL
          AND ortho_start IS NULL AND ortho_months IS NULL
          AND followup_state IS NULL));

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_followup_state_valid;
ALTER TABLE public.ledger_sessions
  ADD CONSTRAINT ledger_sessions_followup_state_valid
  CHECK (followup_state IS NULL
      OR (followup_state = ANY (ARRAY['open'::text, 'closed'::text]) AND parent_id IS NULL AND status = 'completed'));

COMMENT ON COLUMN public.ledger_sessions.parent_id IS
  'M210: الجلسةُ الأساسية التي تكملها جلسةُ المتابعة هذه (مستوى واحد). NULL = جلسةٌ عادية. صفُّ المتابعة cost = 0 وبلا سنّ/سطح/مفتاح — عرضيٌّ: لا يدخل أي حساب مالي.';
COMMENT ON COLUMN public.ledger_sessions.followup_state IS
  'M210: على الجلسة الأساسية وحدها — open (قيد الإنجاز) · closed (اكتمل العلاج) · NULL (بلا متابعات). عرضيٌّ: لا يدخل أي حساب مالي.';
COMMENT ON COLUMN public.treatments.multi_visit IS
  'M210: علاجٌ متعدّد الجلسات — true/false قرارُ العيادة · NULL = الافتراضي حسب التصنيف (يحسبه العميل). عرضيٌّ.';

-- [3] الحارس: الربطُ ثابت، الأساسيةُ صالحة، والأساسيةُ ذاتُ المتابعات لا تُنقَض
--     الاسمُ بعد trg_currency_ledger_sessions أبجدياً ⇒ العملةُ مشتقّةٌ قبل المقارنة.
CREATE OR REPLACE FUNCTION public.ledger_sessions_followup_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE b RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'followup_link_fixed' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
       OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      SELECT s.doctor_id, s.patient_id, s.parent_id, s.status, s.currency INTO b
        FROM public.ledger_sessions s WHERE s.id = NEW.parent_id;
      IF NOT FOUND
         OR b.doctor_id IS DISTINCT FROM NEW.doctor_id
         OR b.patient_id IS DISTINCT FROM NEW.patient_id
         OR b.parent_id IS NOT NULL
         OR COALESCE(b.status, 'completed') <> 'completed'
         OR b.currency IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  /* جلسةٌ عادية أو أساسية */
  IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status
                        OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
                        OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id) THEN
    IF EXISTS (SELECT 1 FROM public.ledger_sessions c WHERE c.parent_id = NEW.id) THEN
      IF COALESCE(NEW.status, 'completed') <> 'completed'
         OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
         OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
        RAISE EXCEPTION 'followup_base_has_children' USING ERRCODE = 'P0001';
      END IF;
    ELSIF COALESCE(NEW.status, 'completed') <> 'completed' THEN
      NEW.followup_state := NULL;   /* لا متابعات والجلسةُ لم تعد منجزة ⇒ لا حالة */
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_followup_guard ON public.ledger_sessions;
CREATE TRIGGER trg_followup_guard BEFORE INSERT OR UPDATE ON public.ledger_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ledger_sessions_followup_guard();

-- [4] حذفُ آخر متابعةٍ يعيد الأساسية جلسةً عادية (والأساسيةُ المحذوفة نفسُها: صفر صفوف، لا أثر)
CREATE OR REPLACE FUNCTION public.ledger_sessions_followup_after_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.parent_id IS NOT NULL THEN
    UPDATE public.ledger_sessions b SET followup_state = NULL
     WHERE b.id = OLD.parent_id AND b.followup_state IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ledger_sessions c WHERE c.parent_id = OLD.parent_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_followup_after_delete ON public.ledger_sessions;
CREATE TRIGGER trg_followup_after_delete AFTER DELETE ON public.ledger_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ledger_sessions_followup_after_delete();

-- [5] تسجيلُ متابعة: الإدراجُ وحالةُ الأساسية بعمليةٍ واحدة
CREATE OR REPLACE FUNCTION public.session_followup_add(
  p_parent uuid, p_date date, p_provider uuid DEFAULT NULL, p_step text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_close boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b       public.ledger_sessions;
  c       public.ledger_sessions;
  v_step  text := NULLIF(btrim(regexp_replace(COALESCE(p_step, ''), '\s+', ' ', 'g')), '');
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_state text := CASE WHEN p_close THEN 'closed' ELSE 'open' END;
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
BEGIN
  SELECT * INTO b FROM public.ledger_sessions
   WHERE id = p_parent AND doctor_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR b.parent_id IS NOT NULL OR COALESCE(b.status, 'completed') <> 'completed' THEN
    RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_date IS NULL OR p_date > v_today + 1 OR (b.date IS NOT NULL AND p_date < b.date) THEN
    RAISE EXCEPTION 'followup_date_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(COALESCE(v_step, '')) > 80 OR char_length(COALESCE(v_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'followup_text_too_long' USING ERRCODE = 'P0001';
  END IF;
  /* فحصُ FK لا يمرّ بـRLS — الطبيبُ المعالج من أطباء العيادة نفسها */
  IF p_provider IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.clinic_doctors d WHERE d.id = p_provider AND d.owner_id = b.doctor_id) THEN
    RAISE EXCEPTION 'followup_provider_invalid' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ledger_sessions
    (doctor_id, patient_id, type, description, cost, date, notes, status, provider_id, currency, parent_id)
  VALUES
    (b.doctor_id, b.patient_id,
     left('متابعة — ' || COALESCE(NULLIF(btrim(b.type), ''), 'علاج'), 200),
     v_step, 0, p_date, v_notes, 'completed', COALESCE(p_provider, b.provider_id), b.currency, b.id)
  RETURNING * INTO c;

  UPDATE public.ledger_sessions SET followup_state = v_state WHERE id = b.id;

  RETURN jsonb_build_object('session', to_jsonb(c), 'state', v_state);
END $$;

REVOKE ALL ON FUNCTION public.session_followup_add(uuid, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_followup_add(uuid, date, uuid, text, text, boolean) TO authenticated;

-- [6] إغلاقُ العلاج أو إعادةُ فتحه (على أساسيةٍ لها متابعات)
CREATE OR REPLACE FUNCTION public.session_followup_set_state(p_session uuid, p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE b public.ledger_sessions;
BEGIN
  IF p_state IS NULL OR NOT (p_state = ANY (ARRAY['open'::text, 'closed'::text])) THEN
    RAISE EXCEPTION 'followup_state_invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.ledger_sessions
   WHERE id = p_session AND doctor_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR b.parent_id IS NOT NULL OR COALESCE(b.status, 'completed') <> 'completed'
     OR NOT EXISTS (SELECT 1 FROM public.ledger_sessions c WHERE c.parent_id = b.id) THEN
    RAISE EXCEPTION 'followup_base_invalid' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.ledger_sessions SET followup_state = p_state WHERE id = b.id RETURNING * INTO b;
  RETURN jsonb_build_object('id', b.id, 'state', b.followup_state);
END $$;

REVOKE ALL ON FUNCTION public.session_followup_set_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_followup_set_state(uuid, text) TO authenticated;

COMMIT;

-- التحقق (يدوياً):
-- SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ledger_sessions' AND column_name IN ('parent_id','followup_state');
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.ledger_sessions'::regclass AND NOT tgisinternal ORDER BY 1;
-- SELECT has_function_privilege('anon','public.session_followup_add(uuid,date,uuid,text,text,boolean)','EXECUTE');   -- false
