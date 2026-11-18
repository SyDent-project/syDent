-- ════════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/portal-plan-db.sql · behaviour test of M215 (portal plan without planned follow-up visits)
-- LOCAL THROWAWAY DATABASE ONLY (see scripts/lab-stages-db.sql for how to build it); everything is rolled back,
-- including the test-only stub of _intake_clinic_open.
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/portal-plan-db.sql
-- A patient with a planned filling (SYP) and a planned follow-up visit of a USD implant: the portal plan lists the
-- filling only, and no «0 $» total. On M205 the same data lists both and a USD total of 0 (the check fails).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE OR REPLACE FUNCTION public._intake_clinic_open(p_clinic uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;   -- test only, rolled back
DO $t$
DECLARE d uuid := '00000000-0000-0000-0000-0000000000f1'; p uuid := '00000000-0000-0000-0000-0000000000f2'; b uuid := '00000000-0000-0000-0000-0000000000f3';
  tok text := md5('a') || md5('b'); j jsonb; r text := '';
BEGIN
  INSERT INTO auth.users(id,email) VALUES (d,'f1@x') ON CONFLICT DO NOTHING;
  INSERT INTO public.patients(id, doctor_id, name) VALUES (p, d, 'P');
  INSERT INTO public.ledger_sessions(id, doctor_id, patient_id, type, cost, currency, status, date) VALUES (b, d, p, 'Implant', 500, 'USD', 'completed', current_date - 2);
  INSERT INTO public.ledger_sessions(doctor_id, patient_id, type, cost, currency, status, date) VALUES (d, p, 'Filling', 30000, 'SYP', 'planned', current_date);
  INSERT INTO public.ledger_sessions(doctor_id, patient_id, type, cost, currency, status, date, parent_id) VALUES (d, p, 'متابعة — Implant', 0, 'USD', 'planned', current_date + 7, b);
  INSERT INTO public.patient_portals(owner_id, patient_id, token) VALUES (d, p, tok);
  UPDATE public.clinic_settings SET portal_show_plan = true WHERE owner_id = d;
  j := public.portal_info(tok);
  r := r || ' status=' || COALESCE(j->>'status', 'null');
  r := r || ' items=' || COALESCE(jsonb_array_length(j->'plan'->'items')::text, 'null');
  r := r || ' types=' || COALESCE((SELECT string_agg(x->>'type', ',') FROM jsonb_array_elements(j->'plan'->'items') x), '');
  r := r || ' totals=' || COALESCE((j->'plan'->'totals')::text, 'null');
  IF r IS NULL OR r <> ' status=ok items=1 types=Filling totals=[{"total": 30000, "currency": "SYP"}]' THEN RAISE EXCEPTION 'portal-plan-db FAILED:%', r; END IF;
  RAISE NOTICE 'portal-plan-db: ok —%', r;
END $t$;
ROLLBACK;
