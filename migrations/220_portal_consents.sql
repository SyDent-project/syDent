-- ════════════════════════════════════════════════════════════════════
-- Migration 220 — موافقاتُ العلاج من بوابة المريض (portal consent signing)
-- Date: 21 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: step 3 of the consent round (M219). The owner's decision: the patient
-- signs from the SAME portal link — no new page, no new link. A patient with
-- no phone signs on the clinic's device by opening his own portal there.
--
-- Two doors, both SECURITY DEFINER behind the live-link + open-clinic chain of
-- portal_confirm (M182) and their own clinic switch (portal_show_consents):
--   • portal_consents(token)  — what the patient must sign and what he signed.
--     It first runs _consent_sync (M219) so a treatment planned after the link
--     was sent still shows. That sync is the system's own derived write (no
--     visitor input reaches it); it is NOT a visitor write.
--   • portal_consent_sign(token, consent, signature, name, relation)
--     — the portal's third NAMED visitor write (after portal_confirm, M182,
--     and portal_appt_change, M187), walled by named constraints (rule #739):
--       live link · clinic open · switch on · the consent is this patient's
--       and still pending · a real PNG signature within the size cap · a
--       signer name · a daily cap per patient.
--     It writes ONE row (status/signature/signer/time/browser), through the
--     trigger door of M219, and one activity-log row. The text signed is the
--     snapshot already stored — the visitor never sends text.
--
-- Realtime: patient_consents joins the publication so the clinic hears the
-- signature at once (sidebar toast naming the patient + the open patient card).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.portal_consent_sign(text, uuid, text, text, text);
--   DROP FUNCTION IF EXISTS public.portal_consents(text);
--   ALTER TABLE public.clinic_settings DROP COLUMN IF EXISTS portal_show_consents;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.patient_consents;
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) clinic switch ──────────────────────────────────────────────────
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS portal_show_consents BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.clinic_settings.portal_show_consents IS
  'البوابة: عرضُ موافقات العلاج وتوقيعُها (M220). لا أثر له ما دامت العيادة بلا نصوص موافقة.';

-- ── 2) portal_consents — list (after a derived sync) ───────────────────
CREATE OR REPLACE FUNCTION public.portal_consents(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v      RECORD;
  v_show BOOLEAN;
  v_out  JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  SELECT pp.owner_id, pp.patient_id INTO v
    FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now()
   LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  SELECT COALESCE(c.portal_show_consents, true) INTO v_show FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF v_show IS DISTINCT FROM true AND FOUND THEN
    RETURN jsonb_build_object('ok', true, 'items', '[]'::jsonb);
  END IF;

  PERFORM public._consent_sync(v.owner_id, v.patient_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', pc.id, 'title', pc.title, 'body', pc.body, 'treatment', pc.treatment_name, 'teeth', pc.teeth,
           'status', pc.status, 'signed_at', pc.signed_at, 'signer', pc.signer_name)
         ORDER BY (pc.status = 'pending') DESC, COALESCE(pc.signed_at, pc.created_at) DESC), '[]'::jsonb)
    INTO v_out
    FROM (SELECT * FROM public.patient_consents x
           WHERE x.owner_id = v.owner_id AND x.patient_id = v.patient_id AND x.status IN ('pending', 'signed')
           ORDER BY (x.status = 'pending') DESC, COALESCE(x.signed_at, x.created_at) DESC
           LIMIT 40) pc;
  RETURN jsonb_build_object('ok', true, 'items', v_out);
END; $$;

REVOKE ALL ON FUNCTION public.portal_consents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_consents(text) TO anon, authenticated;

-- ── 3) portal_consent_sign — the named visitor write ───────────────────
CREATE OR REPLACE FUNCTION public.portal_consent_sign(p_token TEXT, p_consent UUID, p_signature TEXT, p_name TEXT, p_relation TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v       RECORD;
  c       RECORD;
  v_show  BOOLEAN;
  v_name  TEXT := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  v_rel   TEXT := NULLIF(btrim(regexp_replace(COALESCE(p_relation, ''), '\s+', ' ', 'g')), '');
  v_ua    TEXT;
  v_now   TIMESTAMPTZ := now();
  v_day   DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_consent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  SELECT pp.owner_id, pp.patient_id, p.name AS patient_name INTO v
    FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now()
   LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  SELECT COALESCE(cs.portal_show_consents, true) INTO v_show FROM public.clinic_settings cs WHERE cs.owner_id = v.owner_id;
  IF v_show IS DISTINCT FROM true AND FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  -- the signature: a real PNG data URL within the table cap, nothing else
  IF p_signature IS NULL OR char_length(p_signature) < 200 OR char_length(p_signature) > 120000
     OR p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_signature');
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 OR v_name ~ '[<>]' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_name');
  END IF;
  IF v_rel IS NOT NULL AND (char_length(v_rel) > 40 OR v_rel ~ '[<>]') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_name');
  END IF;

  SELECT x.id, x.status, x.title, x.teeth, x.signed_at INTO c
    FROM public.patient_consents x
   WHERE x.id = p_consent AND x.owner_id = v.owner_id AND x.patient_id = v.patient_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF c.status = 'signed' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already', 'signed_at', c.signed_at);
  END IF;
  IF c.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_signable'); END IF;

  -- a leaked link cannot flood: a patient signs a handful of consents a day at most
  IF (SELECT count(*) FROM public.patient_consents y
       WHERE y.owner_id = v.owner_id AND y.patient_id = v.patient_id AND y.signed_at IS NOT NULL
         AND (y.signed_at AT TIME ZONE 'Asia/Damascus')::date = v_day) >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate');
  END IF;

  BEGIN
    v_ua := left(NULLIF(current_setting('request.headers', true), '')::json ->> 'user-agent', 300);
  EXCEPTION WHEN others THEN v_ua := NULL; END;

  PERFORM set_config('sydent.consent_sign', '1', true);
  UPDATE public.patient_consents
     SET status = 'signed', signed_at = v_now, signature = p_signature,
         signer_name = v_name, signer_relation = v_rel, signed_ua = v_ua
   WHERE id = c.id;
  PERFORM set_config('sydent.consent_sign', '', true);

  INSERT INTO public.audit_log (owner_id, employee_id, employee_name_snapshot, employee_role_snapshot, action_type, entity_type, entity_id,
                                patient_id, patient_name_snapshot, description, old_value, new_value)
  VALUES (v.owner_id, NULL, 'المريض (بوابة المريض)', 'patient', 'patient.consent_sign', 'patient', v.patient_id,
          v.patient_id, v.patient_name,
          'وقّع ' || v_name || COALESCE(' (' || v_rel || ')', '') || ' موافقة «' || c.title || '»' || COALESCE(' — السن ' || c.teeth, '') || ' من بوابة المريض',
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'signed', 'consent_id', c.id, 'signer', v_name, 'relation', v_rel, 'source', 'portal'));

  RETURN jsonb_build_object('ok', true, 'signed_at', v_now);
END; $$;

REVOKE ALL ON FUNCTION public.portal_consent_sign(text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_consent_sign(text, uuid, text, text, text) TO anon, authenticated;

-- ── 4) Realtime — the clinic hears a signature at once ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'patient_consents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_consents;
  END IF;
END $$;

COMMIT;

-- Verification (Rule #238):
-- SELECT provolatile, prosecdef FROM pg_proc WHERE proname IN ('portal_consents','portal_consent_sign');   -- v, true ×2
-- SELECT has_function_privilege('anon', 'public.portal_consent_sign(text,uuid,text,text,text)', 'execute');  -- true (the door)
-- SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='patient_consents';
