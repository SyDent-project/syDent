-- ════════════════════════════════════════════════════════════════════
-- Migration 219 — موافقاتُ العلاج (Treatment consent forms) — الأساس
-- Date: 21 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: competitor review (Dentrix Ascend procedure-specific consent messages ·
-- Dentally consent templates sent to the Portal · Open Dental consent sheets).
-- A treatment can carry a consent text; when that treatment is planned for a
-- patient a consent is generated for them, to be read and signed from the
-- patient portal (the signing door itself is Migration 220).
--
-- Model:
--   • consent_templates — one text per (clinic, treatment_key). A row = «this
--     treatment needs the patient's consent». No row = nothing changes.
--   • patient_consents  — the patient's own copy: title/body are a SNAPSHOT
--     taken when the consent is generated, so what is signed is exactly what
--     was shown, and later template edits never rewrite a signed consent
--     (Dentrix Ascend rule).
--   • Signing is NOT writable through the table API: a trigger refuses any
--     insert that is not 'pending', any change to a signed row, and any move
--     to 'signed' that does not come from the signing function (M220 sets a
--     transaction-local flag). A clinic cannot forge a signature through
--     PostgREST; the patient cannot alter the text (it never leaves the DB).
--   • consent_sync(patient) — idempotent. Adds a pending consent for every
--     planned treatment that has a template and is not covered yet, and
--     removes auto-generated pending consents whose treatments are no longer
--     planned. Reads ledger_sessions only (no write to the financial layer).
--     Alternatives still open (plan_option 1..3, >1 distinct) are skipped:
--     only the adopted plan is consented (same rule as portal_info, M145).
--     Follow-up visits (parent_id, M210) never need their own consent.
--
-- Security: RLS owner-only + subscription gate (M141) on both tables; no anon
-- policy. _consent_sync is internal (EXECUTE revoked from everyone).
--
-- ROLLBACK (only if reverting the whole feature):
--   DROP FUNCTION IF EXISTS public.consent_sync(uuid);
--   DROP FUNCTION IF EXISTS public._consent_sync(uuid, uuid);
--   DROP TABLE IF EXISTS public.patient_consents;
--   DROP TABLE IF EXISTS public.consent_templates;
--   DROP FUNCTION IF EXISTS public._patient_consents_guard();
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) consent_templates — the clinic's consent text per treatment ─────
CREATE TABLE IF NOT EXISTS public.consent_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  treatment_key TEXT NOT NULL CHECK (char_length(treatment_key) BETWEEN 1 AND 80),
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body          TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 6000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consent_templates_owner_key UNIQUE (owner_id, treatment_key)
);

ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_templates_owner_all ON public.consent_templates;
CREATE POLICY consent_templates_owner_all ON public.consent_templates
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.consent_templates');

DROP TRIGGER IF EXISTS trg_consent_templates_updated ON public.consent_templates;
CREATE TRIGGER trg_consent_templates_updated BEFORE UPDATE ON public.consent_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.consent_templates IS
  'نصُّ موافقة المريض لكل علاج (M219): صفٌّ = «هذا العلاج يحتاج موافقة». توثيقي — لا أثر مالي.';

-- ── 2) patient_consents — the patient's copy (snapshot) + its signature ─
CREATE TABLE IF NOT EXISTS public.patient_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  treatment_key   TEXT CHECK (treatment_key IS NULL OR char_length(treatment_key) BETWEEN 1 AND 80),
  treatment_name  TEXT CHECK (treatment_name IS NULL OR char_length(treatment_name) <= 120),
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body            TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 6000),
  teeth           TEXT CHECK (teeth IS NULL OR char_length(teeth) <= 300),
  session_ids     UUID[] NOT NULL DEFAULT '{}',
  auto            BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','void')),
  created_by      TEXT CHECK (created_by IS NULL OR char_length(created_by) <= 80),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at       TIMESTAMPTZ,
  signature       TEXT CHECK (signature IS NULL OR
                              (char_length(signature) <= 120000 AND signature LIKE 'data:image/png;base64,%')),
  signer_name     TEXT CHECK (signer_name IS NULL OR char_length(signer_name) <= 80),
  signer_relation TEXT CHECK (signer_relation IS NULL OR char_length(signer_relation) <= 40),
  signed_ua       TEXT CHECK (signed_ua IS NULL OR char_length(signed_ua) <= 300),
  voided_at       TIMESTAMPTZ,
  CONSTRAINT patient_consents_signed_shape CHECK (
    (status = 'signed' AND signed_at IS NOT NULL AND signature IS NOT NULL AND signer_name IS NOT NULL)
    OR (status <> 'signed' AND signed_at IS NULL AND signature IS NULL))
);

-- one open auto consent per (patient, treatment): the sync appends to it instead of multiplying rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_consents_auto_pending
  ON public.patient_consents (patient_id, treatment_key) WHERE status = 'pending' AND auto;
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient
  ON public.patient_consents (owner_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_consents_owner_status
  ON public.patient_consents (owner_id, status, signed_at DESC);

ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_consents_owner_select ON public.patient_consents;
DROP POLICY IF EXISTS patient_consents_owner_insert ON public.patient_consents;
DROP POLICY IF EXISTS patient_consents_owner_update ON public.patient_consents;
DROP POLICY IF EXISTS patient_consents_owner_delete ON public.patient_consents;
CREATE POLICY patient_consents_owner_select ON public.patient_consents FOR SELECT
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY patient_consents_owner_insert ON public.patient_consents FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY patient_consents_owner_update ON public.patient_consents FOR UPDATE
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
-- a signed consent is a record: it cannot be deleted through the API (patient/account cascade still removes it)
CREATE POLICY patient_consents_owner_delete ON public.patient_consents FOR DELETE
  USING (owner_id = (SELECT auth.uid()) AND status <> 'signed');
SELECT public._sub_guard_table('public.patient_consents');

COMMENT ON TABLE public.patient_consents IS
  'موافقاتُ المريض على العلاج (M219): نسخةُ النص المجمّدة + التوقيع. الموقَّع لا يُعدَّل ولا يُحذف عبر الواجهة. توثيقي — لا أثر مالي.';

-- ── 3) Guard trigger: signing only through the signing function ────────
CREATE OR REPLACE FUNCTION public._patient_consents_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE v_door BOOLEAN := COALESCE(current_setting('sydent.consent_sign', true) = '1', false);   -- unset ⇒ NULL ⇒ must read as closed
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.signed_at IS NOT NULL OR NEW.signature IS NOT NULL
       OR NEW.signer_name IS NOT NULL OR NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'consent_insert_pending_only';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'consent_signed_immutable';
  END IF;
  IF NEW.status = 'signed' AND NOT v_door THEN
    RAISE EXCEPTION 'consent_sign_door_only';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    RAISE EXCEPTION 'consent_owner_fixed';
  END IF;
  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    NEW.voided_at := COALESCE(NEW.voided_at, now());
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._patient_consents_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_patient_consents_guard ON public.patient_consents;
CREATE TRIGGER trg_patient_consents_guard BEFORE INSERT OR UPDATE ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public._patient_consents_guard();

-- ── 4) _consent_sync — internal, idempotent ────────────────────────────
-- Returns the number of rows it inserted, extended or removed.
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

  -- (a) drop from auto pending consents the treatments that are no longer planned
  FOR c IN
    SELECT pc.id, pc.session_ids, pc.treatment_key FROM public.patient_consents pc
     WHERE pc.owner_id = p_owner AND pc.patient_id = p_patient AND pc.status = 'pending' AND pc.auto
     FOR UPDATE
  LOOP
    SELECT COALESCE(array_agg(s.id ORDER BY s.created_at, s.id), '{}') INTO v_keep
      FROM public.ledger_sessions s
     WHERE s.id = ANY (c.session_ids) AND s.doctor_id = p_owner AND s.patient_id = p_patient
       AND COALESCE(s.status, 'completed') = 'planned' AND s.parent_id IS NULL
       AND s.treatment_key = c.treatment_key
       AND (v_opts <= 1 OR s.plan_option IS NULL OR s.plan_option NOT BETWEEN 1 AND 3)
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

  -- (b) add what is planned, has a template, and is not covered by a pending/signed consent
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
                          AND pc.status IN ('pending','signed') AND x = ANY (pc.session_ids));
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

-- ── 5) consent_sync — the clinic's door (authenticated owner, full access only) ─
CREATE OR REPLACE FUNCTION public.consent_sync(p_patient UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_patient IS NULL THEN RETURN 0; END IF;
  IF public.tenant_access_level(v_uid) <> 'full' THEN RETURN 0; END IF;
  RETURN public._consent_sync(v_uid, p_patient);
END; $$;
REVOKE ALL ON FUNCTION public.consent_sync(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consent_sync(uuid) TO authenticated;

COMMIT;

-- Verification (Rule #238):
-- SELECT to_regclass('public.consent_templates') IS NOT NULL, to_regclass('public.patient_consents') IS NOT NULL;
-- SELECT count(*) FROM pg_policies WHERE tablename IN ('consent_templates','patient_consents');   -- owner + sub-guard policies
-- SELECT has_function_privilege('anon', 'public.consent_sync(uuid)', 'execute');                 -- false
