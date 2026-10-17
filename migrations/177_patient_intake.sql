-- ════════════════════════════════════════════════════════════════════
-- Migration 177 — استمارةُ المريض الرقمية (Digital patient intake form)
-- Date: 10 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: competitor review (Dentrix Ascend Digital Forms · Curve · CareStack ·
-- Dentally) — the patient fills the medical history / allergies / medications
-- on their phone BEFORE the visit; the clinic reviews and merges into the
-- record with one click. book.html is NOT touched (repo rule): the form is a
-- separate standalone page (intake.html) reached by a per-patient tokenised
-- link that rides on the booking-confirmation / any WhatsApp message.
--
-- Security model (mirrors Migration 59 booking portal):
--   • patient_intakes is RLS owner-only + subscription gate (M141). NO anon
--     policy at all → anon's sole door = the two SECURITY DEFINER RPCs below.
--   • The token is 64 hex chars (two uuid4 → 2^244 entropy); the link holder
--     is the patient. intake_info returns the patient's own name/DOB only.
--   • Every answer key is whitelisted server-side (unknown keys dropped),
--     every text capped, booleans coerced, DOB sanity-checked. One submit per
--     token; expiry 14 days; clinic daily submit cap.
--   • Gate chain: account status → subscription 'full' → plan entitlement
--     'booking' (the public patient-facing surface key, M83 contract).
--
-- ROLLBACK (only if reverting the whole feature):
--   DROP FUNCTION IF EXISTS public.intake_submit(text,jsonb,text);
--   DROP FUNCTION IF EXISTS public.intake_info(text);
--   DROP TABLE IF EXISTS public.patient_intakes;
--   ALTER TABLE public.clinic_settings
--     DROP COLUMN IF EXISTS intake_note, DROP COLUMN IF EXISTS intake_signature,
--     DROP COLUMN IF EXISTS intake_on_booking;
--   -- patient_messages kind check: re-run the M149 constraint without 'intake'.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) clinic_settings — intake configuration ─────────────────────────
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS intake_note        TEXT,
  ADD COLUMN IF NOT EXISTS intake_signature   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS intake_on_booking  BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.clinic_settings.intake_note IS 'نصٌّ يظهر للمريض أعلى الاستمارة (اختياري، ≤300 حرف).';
COMMENT ON COLUMN public.clinic_settings.intake_signature IS 'إظهار حقل التوقيع (اختياريٌّ للمريض دائماً — قرار المالك 10/10/2026).';
COMMENT ON COLUMN public.clinic_settings.intake_on_booking IS 'إرفاقُ رابط الاستمارة برسالة تأكيد الحجز الإلكتروني (المريض بلا استمارة حديثة).';

-- ── 2) patient_intakes — anon writes ONLY through intake_submit ────────
CREATE TABLE IF NOT EXISTS public.patient_intakes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE
                DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','submitted','reviewed','dismissed')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_by    TEXT CHECK (created_by IS NULL OR char_length(created_by) <= 80),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  answers       JSONB,
  signature     TEXT CHECK (signature IS NULL OR
                            (char_length(signature) <= 120000 AND signature LIKE 'data:image/png;base64,%')),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT CHECK (reviewed_by IS NULL OR char_length(reviewed_by) <= 80),
  CONSTRAINT patient_intakes_token_hex CHECK (token ~ '^[0-9a-f]{64}$')
);

-- one open link per patient: resend reuses it (extends expiry) instead of multiplying rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_intakes_pending
  ON public.patient_intakes (patient_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_patient_intakes_owner_status
  ON public.patient_intakes (owner_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_intakes_patient
  ON public.patient_intakes (owner_id, patient_id, created_at DESC);

ALTER TABLE public.patient_intakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_intakes_owner_all ON public.patient_intakes;
CREATE POLICY patient_intakes_owner_all ON public.patient_intakes
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
-- بوابة الاشتراك (M141): قراءة لغير «none» · كتابة لـ«full» فقط.
SELECT public._sub_guard_table('public.patient_intakes');

COMMENT ON TABLE public.patient_intakes IS
  'استمارة المريض الرقمية (M177): رابطٌ مرمَّز لكل مريض · إجاباتٌ مبيَّضة بالقاعدة · مراجعةٌ ودمجٌ بيد العيادة. توثيقي — لا أثر مالي.';

-- ── 3) patient_messages — the send is logged under its own kind ────────
ALTER TABLE public.patient_messages DROP CONSTRAINT IF EXISTS patient_messages_kind_check;
ALTER TABLE public.patient_messages ADD CONSTRAINT patient_messages_kind_check CHECK (kind = ANY (ARRAY[
  'prescription','instructions','plan','installment','recall','birthday','review','referral','free','other','intake']));

-- ── 4) Shared gate: is this clinic's patient-facing surface open? ───────
-- (status/subscription/plan — same chain as booking_clinic_info, M59/M83/M141)
CREATE OR REPLACE FUNCTION public._intake_clinic_open(p_clinic UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_status TEXT; v_plan TEXT; v_allowed BOOLEAN;
BEGIN
  SELECT tr.status, tr.plan INTO v_status, v_plan FROM public.trial_requests tr
  WHERE tr.user_id = p_clinic LIMIT 1;
  IF v_status IN ('new','rejected','suspended') THEN RETURN false; END IF;
  IF public.tenant_access_level(p_clinic) <> 'full' THEN RETURN false; END IF;
  IF v_plan IS NOT NULL THEN
    SELECT (COALESCE(sp.entitlements->>'booking', 'true') <> 'false') INTO v_allowed
      FROM public.subscription_plans sp WHERE sp.code = v_plan;
    IF v_allowed IS FALSE THEN RETURN false; END IF;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public._intake_clinic_open(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5) RPC #1 — intake_info: what the patient's page needs, nothing more ─
-- Empty result = link unknown / clinic unavailable (page shows «غير متاح»).
CREATE OR REPLACE FUNCTION public.intake_info(p_token TEXT)
RETURNS TABLE (
  clinic_name TEXT, clinic_phone TEXT, patient_name TEXT, patient_dob DATE,
  status TEXT, expired BOOLEAN, submitted_at TIMESTAMPTZ,
  intake_note TEXT, ask_signature BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v RECORD;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
  SELECT i.id, i.owner_id, i.patient_id, i.status, i.expires_at, i.submitted_at
    INTO v FROM public.patient_intakes i WHERE i.token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT public._intake_clinic_open(v.owner_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT cs.clinic_name, cs.clinic_phone, p.name, p.dob,
         v.status, (v.status = 'pending' AND v.expires_at < now()), v.submitted_at,
         cs.intake_note, COALESCE(cs.intake_signature, true)
  FROM public.patients p
  LEFT JOIN public.clinic_settings cs ON cs.owner_id = v.owner_id
  WHERE p.id = v.patient_id AND p.doctor_id = v.owner_id;
END; $$;

-- ── 6) RPC #2 — intake_submit: the ONLY write door for anon ─────────────
-- Whitelist contract (mirrored by intake.html + pp-intake.js — guarded by prove-intake.js):
--   med  : subset of MEDICAL_FLAGS_DEFS keys (M87)
--   alg  : subset of ALLERGY_FLAGS_DEFS keys
--   extra: subset of INTAKE_EXTRA keys (clinically important booleans kept as text on merge)
--   texts: med_other ≤500 · alg_other ≤300 · meds ≤500 · complaint ≤500
--   dob  : optional date, 1900..today
--   consent: must be true
CREATE OR REPLACE FUNCTION public.intake_submit(p_token TEXT, p_answers JSONB, p_signature TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v        RECORD;
  v_med    TEXT[] := ARRAY['diabetes','hypertension','cardiac','anticoagulants','pregnancy','asthma'];
  v_alg    TEXT[] := ARRAY['penicillin_allergy','latex_allergy','anesthetic_allergy','nsaid_allergy'];
  v_extra  TEXT[] := ARRAY['bisphosphonates','bleeding','infectious','epilepsy','thyroid','kidney_liver','smoker'];
  v_clean  JSONB;
  v_dob    DATE;
  v_dob_t  TEXT;
  v_now_dam TIMESTAMP;
  v_ask_sig BOOLEAN;
  v_sig    TEXT;
  f_med JSONB; f_alg JSONB; f_ex JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'bad_token'; END IF;
  SELECT i.id, i.owner_id, i.status, i.expires_at INTO v
    FROM public.patient_intakes i WHERE i.token = p_token LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bad_token'; END IF;
  IF NOT public._intake_clinic_open(v.owner_id) THEN RAISE EXCEPTION 'unavailable'; END IF;
  IF v.status <> 'pending' THEN RAISE EXCEPTION 'already_submitted'; END IF;
  IF v.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'bad_answers'; END IF;
  IF lower(COALESCE(p_answers->>'consent','')) NOT IN ('true','t','1') THEN RAISE EXCEPTION 'bad_answers'; END IF;

  -- clinic daily cap (Damascus day) — abuse of a leaked link cannot flood the clinic
  v_now_dam := (now() AT TIME ZONE 'Asia/Damascus');
  IF (SELECT count(*) FROM public.patient_intakes i
      WHERE i.owner_id = v.owner_id AND i.submitted_at IS NOT NULL
        AND (i.submitted_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 300 THEN
    RAISE EXCEPTION 'rate_clinic';
  END IF;

  -- whitelist: arrays keep only known keys (deduplicated, original order)
  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_med
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'med')='array' THEN p_answers->'med' END, '[]'::jsonb)) x
   WHERE x = ANY (v_med);
  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_alg
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'alg')='array' THEN p_answers->'alg' END, '[]'::jsonb)) x
   WHERE x = ANY (v_alg);
  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_ex
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'extra')='array' THEN p_answers->'extra' END, '[]'::jsonb)) x
   WHERE x = ANY (v_extra);

  -- texts: trimmed + capped (bad_answers only on absurd length — the page caps too)
  IF char_length(COALESCE(p_answers->>'med_other','')) > 500 OR char_length(COALESCE(p_answers->>'alg_other','')) > 300
     OR char_length(COALESCE(p_answers->>'meds','')) > 500 OR char_length(COALESCE(p_answers->>'complaint','')) > 500 THEN
    RAISE EXCEPTION 'bad_answers';
  END IF;

  -- dob: optional; must parse and be sane
  v_dob_t := NULLIF(btrim(COALESCE(p_answers->>'dob','')), '');
  IF v_dob_t IS NOT NULL THEN
    BEGIN v_dob := v_dob_t::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'bad_answers'; END;
    IF v_dob < DATE '1900-01-01' OR v_dob > v_now_dam::date THEN RAISE EXCEPTION 'bad_answers'; END IF;
  END IF;

  v_clean := jsonb_build_object(
    'v', 1,
    'med', f_med, 'alg', f_alg, 'extra', f_ex,
    'med_other', NULLIF(btrim(COALESCE(p_answers->>'med_other','')), ''),
    'alg_other', NULLIF(btrim(COALESCE(p_answers->>'alg_other','')), ''),
    'meds',      NULLIF(btrim(COALESCE(p_answers->>'meds','')), ''),
    'complaint', NULLIF(btrim(COALESCE(p_answers->>'complaint','')), ''),
    'dob', v_dob,
    'consent', true
  );

  -- signature: optional; honoured only when the clinic shows the field
  SELECT COALESCE(cs.intake_signature, true) INTO v_ask_sig FROM public.clinic_settings cs WHERE cs.owner_id = v.owner_id;
  v_sig := NULL;
  IF COALESCE(v_ask_sig, true) AND p_signature IS NOT NULL AND p_signature LIKE 'data:image/png;base64,%' THEN
    IF char_length(p_signature) > 120000 THEN RAISE EXCEPTION 'bad_answers'; END IF;
    v_sig := p_signature;
  END IF;

  UPDATE public.patient_intakes
     SET status = 'submitted', submitted_at = now(), answers = v_clean, signature = v_sig
   WHERE id = v.id AND status = 'pending';
  RETURN v.id;
END; $$;

-- ── 7) Permissions: the two RPCs are the only anon surface ─────────────
REVOKE ALL ON FUNCTION public.intake_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_submit(text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_submit(text,jsonb,text) TO anon, authenticated;

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.patient_intakes'::regclass) rls_on,          -- true
--        (SELECT count(*) FROM pg_policies WHERE tablename='patient_intakes') policies,                       -- 5 (1 owner + 4 gate)
--        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--          WHERE n.nspname='public' AND proname IN ('intake_info','intake_submit','_intake_clinic_open') AND prosecdef) fns,  -- 3
--        (SELECT count(*) FROM information_schema.columns WHERE table_name='clinic_settings' AND column_name LIKE 'intake%') cols;  -- 3
