-- ════════════════════════════════════════════════════════════════════
-- Migration 225 — الموافقةُ للعلاج «المخطّط» وحده (consent is for a PLANNED treatment only)
-- Date: 21 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: the owner's correction, the same day as Migration 224. A consent is signed BEFORE a
-- treatment; one that is already performed cannot be consented to afterwards. Migration 224's
-- «recorded as done today ⇒ gets a consent» was a misreading of his report (what he missed was
-- any visible sign of the consent at the chart — fixed in the patient card, not in the database).
--   • the add branch (b) goes back to PLANNED rows of the adopted plan only (as Migrations 219/221);
--   • Migration 224's other change stays: a CANCELLED consent still covers its sessions, so it is
--     never generated again.
--   • the prune branch (a) is untouched (Migration 221): a consent that was pending when its
--     treatment got done stays visible as missing until it is signed or cancelled.
-- Same signature, same grants.
--
-- ROLLBACK: re-run the _consent_sync definition from migrations/224_consent_done_today.sql.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._consent_sync(p_owner UUID, p_patient UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_opts   INT;
  v_n      INT := 0;
  t        RECORD;
  c        RECORD;
  v_ids    UUID[];
  v_new    UUID[];
  v_keep   UUID[];
  v_teeth  TEXT;
  v_name   TEXT;
  v_cid    UUID;
BEGIN
  IF p_owner IS NULL OR p_patient IS NULL THEN RETURN 0; END IF;
  PERFORM 1 FROM public.patients p WHERE p.id = p_patient AND p.doctor_id = p_owner;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- serialise per patient: two tabs / the portal and the clinic never double-insert
  PERFORM pg_advisory_xact_lock(hashtextextended('consent_sync:' || p_patient::text, 0));

  SELECT count(DISTINCT s.plan_option) INTO v_opts
    FROM public.ledger_sessions s
   WHERE s.doctor_id = p_owner AND s.patient_id = p_patient
     AND COALESCE(s.status, 'completed') = 'planned' AND s.plan_option BETWEEN 1 AND 3;

  -- (a) drop from auto pending consents the treatments that left the plan (deleted, or an unadopted alternative)
  FOR c IN
    SELECT pc.id, pc.session_ids, pc.treatment_key FROM public.patient_consents pc
     WHERE pc.owner_id = p_owner AND pc.patient_id = p_patient AND pc.status = 'pending' AND pc.auto
     FOR UPDATE
  LOOP
    SELECT COALESCE(array_agg(s.id ORDER BY s.created_at, s.id), '{}') INTO v_keep
      FROM public.ledger_sessions s
     WHERE s.id = ANY (c.session_ids) AND s.doctor_id = p_owner AND s.patient_id = p_patient
       AND s.parent_id IS NULL
       AND s.treatment_key = c.treatment_key
       -- M221: a treatment done before its consent was signed keeps the consent pending (the clinic sees
       -- it is missing); only a planned row of an unadopted alternative, or a deleted row, drops out.
       AND (COALESCE(s.status, 'completed') = 'completed'
            OR (COALESCE(s.status, 'completed') = 'planned'
                AND (v_opts <= 1 OR s.plan_option IS NULL OR s.plan_option NOT BETWEEN 1 AND 3)))
       AND EXISTS (SELECT 1 FROM public.consent_templates ct
                    WHERE ct.owner_id = p_owner AND ct.treatment_key = s.treatment_key);
    IF cardinality(v_keep) = 0 THEN
      DELETE FROM public.patient_consents WHERE id = c.id;
      v_n := v_n + 1;
    ELSIF cardinality(v_keep) <> cardinality(c.session_ids) THEN
      SELECT string_agg(x.tn, '، ' ORDER BY x.tn) INTO v_teeth
        FROM (SELECT DISTINCT NULLIF(btrim(s.tooth_num), '') tn FROM public.ledger_sessions s WHERE s.id = ANY (v_keep)) x
       WHERE x.tn IS NOT NULL;
      UPDATE public.patient_consents SET session_ids = v_keep, teeth = left(v_teeth, 300) WHERE id = c.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- (b) add what is planned, has a template, and is not covered by a consent of any status —
  --     a consent the clinic cancelled is never generated again for the same sessions (kept from M224)
  FOR t IN
    SELECT ct.treatment_key, ct.title, ct.body FROM public.consent_templates ct WHERE ct.owner_id = p_owner
  LOOP
    SELECT COALESCE(array_agg(s.id ORDER BY s.created_at, s.id), '{}') INTO v_ids
      FROM public.ledger_sessions s
     WHERE s.doctor_id = p_owner AND s.patient_id = p_patient
       AND COALESCE(s.status, 'completed') = 'planned' AND s.parent_id IS NULL
       AND s.treatment_key = t.treatment_key
       AND (v_opts <= 1 OR s.plan_option IS NULL OR s.plan_option NOT BETWEEN 1 AND 3);
    IF cardinality(v_ids) = 0 THEN CONTINUE; END IF;

    SELECT COALESCE(array_agg(x), '{}') INTO v_new
      FROM unnest(v_ids) x
     WHERE NOT EXISTS (SELECT 1 FROM public.patient_consents pc
                        WHERE pc.owner_id = p_owner AND pc.patient_id = p_patient
                          AND pc.status IN ('pending','signed','void') AND x = ANY (pc.session_ids));   -- void covers too (M224)
    IF cardinality(v_new) = 0 THEN CONTINUE; END IF;

    v_cid := NULL;
    SELECT pc.id, pc.session_ids || v_new INTO v_cid, v_keep FROM public.patient_consents pc
     WHERE pc.owner_id = p_owner AND pc.patient_id = p_patient AND pc.treatment_key = t.treatment_key
       AND pc.status = 'pending' AND pc.auto LIMIT 1;
    IF v_cid IS NULL THEN v_keep := v_new; END IF;

    SELECT string_agg(x.tn, '، ' ORDER BY x.tn) INTO v_teeth
      FROM (SELECT DISTINCT NULLIF(btrim(s.tooth_num), '') tn FROM public.ledger_sessions s WHERE s.id = ANY (v_keep)) x
     WHERE x.tn IS NOT NULL;
    SELECT tr.name INTO v_name FROM public.treatments tr
     WHERE tr.doctor_id = p_owner AND tr.treatment_key = t.treatment_key LIMIT 1;

    IF v_cid IS NOT NULL THEN
      UPDATE public.patient_consents SET session_ids = v_keep, teeth = left(v_teeth, 300) WHERE id = v_cid;
    ELSE
      INSERT INTO public.patient_consents (owner_id, patient_id, treatment_key, treatment_name, title, body, teeth, session_ids, auto)
      VALUES (p_owner, p_patient, t.treatment_key, left(v_name, 120), t.title, t.body, left(v_teeth, 300), v_keep, true);
    END IF;
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public._consent_sync(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
