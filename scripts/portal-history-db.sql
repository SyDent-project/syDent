-- ════════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/portal-history-db.sql · behaviour test of M217 (portal history marks completed follow-up visits)
-- LOCAL THROWAWAY DATABASE ONLY (see scripts/lab-stages-db.sql for how to build it); everything is rolled back,
-- including the test-only stub of _intake_clinic_open.
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/portal-history-db.sql
-- A patient with a completed USD implant and a completed follow-up visit of it: the portal history carries 'fu': true on
-- the follow-up row only (the implant row keeps its exact M215 key set), and the order stays newest first.
-- With the balance switch off, no row carries cost/currency (the flag carries no money). On M215 'fu' is absent (fails).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE OR REPLACE FUNCTION public._intake_clinic_open(p_clinic uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;   -- test only, rolled back
DO $t$
DECLARE d uuid := '00000000-0000-0000-0000-0000000000e1'; p uuid := '00000000-0000-0000-0000-0000000000e2'; b uuid := '00000000-0000-0000-0000-0000000000e3';
  tok text := md5('c') || md5('d'); j jsonb; r text := '';
BEGIN
  INSERT INTO auth.users(id,email) VALUES (d,'e1@x') ON CONFLICT DO NOTHING;
  INSERT INTO public.patients(id, doctor_id, name) VALUES (p, d, 'P');
  INSERT INTO public.ledger_sessions(id, doctor_id, patient_id, type, cost, currency, status, date) VALUES (b, d, p, 'Implant', 500, 'USD', 'completed', current_date - 9);
  INSERT INTO public.ledger_sessions(doctor_id, patient_id, type, cost, currency, status, date, parent_id) VALUES (d, p, 'متابعة — Implant', 0, 'USD', 'completed', current_date - 2, b);
  INSERT INTO public.patient_portals(owner_id, patient_id, token) VALUES (d, p, tok);
  INSERT INTO public.clinic_settings(owner_id, portal_show_history, portal_show_balance) VALUES (d, true, true)
    ON CONFLICT (owner_id) DO UPDATE SET portal_show_history = true, portal_show_balance = true;
  j := public.portal_info(tok);
  r := r || ' status=' || COALESCE(j->>'status', 'null');
  r := r || ' rows=' || COALESCE((SELECT string_agg((x->>'type') || ':' || COALESCE(x->>'fu', '-') || ':' || COALESCE(x->>'cost', '-'), ',' ORDER BY o)
                                    FROM jsonb_array_elements(j->'history'->'items') WITH ORDINALITY e(x, o)), 'none');
  r := r || ' keys=' || COALESCE((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j->'history'->'items'->1) k), 'none');
  UPDATE public.clinic_settings SET portal_show_balance = false WHERE owner_id = d;
  IF NOT FOUND THEN RAISE EXCEPTION 'portal-history-db FAILED: no clinic_settings row'; END IF;
  j := public.portal_info(tok);
  r := r || ' nobal=' || COALESCE((SELECT string_agg(COALESCE(x->>'fu', '-') || ':' || COALESCE(x->>'cost', '-') || ':' || COALESCE(x->>'currency', '-'), ',' ORDER BY o)
                                     FROM jsonb_array_elements(j->'history'->'items') WITH ORDINALITY e(x, o)), 'none');
  IF r IS NULL OR r <> ' status=ok rows=متابعة — Implant:true:0,Implant:-:500 keys=cost,currency,date,type nobal=true:-:-,-:-:-' THEN
    RAISE EXCEPTION 'portal-history-db FAILED:%', r;
  END IF;
  RAISE NOTICE 'portal-history-db: ok —%', r;
END $t$;
ROLLBACK;
