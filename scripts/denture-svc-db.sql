-- ════════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/denture-svc-db.sql · behaviour test of M208 (denture after-services)
-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL THROWAWAY DATABASE ONLY (see scripts/lab-stages-db.sql for how to build it). It refuses to run when
-- `patients` has rows, and everything is rolled back.
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/denture-svc-db.sql
-- 16 checks: the signup catalog (40 rows, 7 services) · the catalog marker · the session link shape + 3 RLS checks.
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.patients) > 0 THEN RAISE EXCEPTION 'denture-svc-db: empty local database only'; END IF; END $$;
-- the real signup trigger seeds each new doctor's catalog
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000d1','d1@x'),('00000000-0000-0000-0000-0000000000d2','d2@x') ON CONFLICT DO NOTHING;
INSERT INTO public.platform_admins(user_id) VALUES ('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000d2');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);

DO $t$
DECLARE d uuid := '00000000-0000-0000-0000-0000000000d1'; p uuid := gen_random_uuid(); u uuid := gen_random_uuid(); r text := ''; n int; m int; k int;
BEGIN
  -- signup catalog: 40 treatments, the first 33 untouched by the marker, 7 jaw services (one adds a tooth)
  SELECT count(*), count(*) FILTER (WHERE denture_svc IS NOT NULL), count(*) FILTER (WHERE denture_svc = 'add') INTO n, m, k FROM public.treatments WHERE doctor_id = d;
  r := r || ' c1=' || (n = 40 AND m = 7 AND k = 1);
  r := r || ' c2=' || ((SELECT bool_and(target_part = 'arch' AND category = 'prosth_removable' AND price = 0 AND builtin = false AND is_active AND sort_order BETWEEN 34 AND 40 AND dentition_scope = 'permanent')
                         FROM public.treatments WHERE doctor_id = d AND denture_svc IS NOT NULL));
  r := r || ' c3=' || ((SELECT count(*) = 33 AND bool_and(denture_svc IS NULL) FROM public.treatments WHERE doctor_id = d AND sort_order <= 33));
  r := r || ' c4=' || ((SELECT treatment_key FROM public.treatments WHERE doctor_id = d AND denture_svc = 'add') = 'denture-add-tooth');
  -- the marker is closed and lives on jaw treatments only
  BEGIN UPDATE public.treatments SET denture_svc = 'service' WHERE doctor_id = d AND treatment_key = 'crown'; r := r || ' c5=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c5=true'; END;
  BEGIN UPDATE public.treatments SET denture_svc = 'reline' WHERE doctor_id = d AND treatment_key = 'whitening'; r := r || ' c6=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c6=true'; END;
  UPDATE public.treatments SET denture_svc = 'service' WHERE doctor_id = d AND treatment_key = 'whitening';
  r := r || ' c7=' || ((SELECT denture_svc FROM public.treatments WHERE doctor_id = d AND treatment_key = 'whitening') = 'service');
  BEGIN UPDATE public.treatments SET target_part = 'mouth' WHERE doctor_id = d AND treatment_key = 'whitening'; r := r || ' c8=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c8=true'; END;   -- a marked treatment cannot leave the jaw target

  INSERT INTO public.patients (id, doctor_id, name) VALUES (p, d, 'P');
  -- a service session: a jaw session linked to its denture unit
  INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_unit) VALUES (d, p, 'Reline', 5, 'USD', 'completed', 'U', u);
  INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_unit, denture_add) VALUES (d, p, 'Add', 5, 'USD', 'planned', 'U', u, '16,26');
  r := r || ' c9=' || ((SELECT count(*) FROM public.ledger_sessions WHERE patient_id = p AND denture_unit = u) = 2);
  -- the link needs a jaw and no tooth
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, tooth_num, denture_unit) VALUES (d, p, 'X', 1, 'USD', 'completed', '16', u); r := r || ' c10=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c10=true'; END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, denture_unit) VALUES (d, p, 'X', 1, 'USD', 'completed', u); r := r || ' c11=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c11=true'; END;
  -- a service is never a denture session: unit_teeth and the link exclude each other
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_unit, unit_teeth) VALUES (d, p, 'X', 1, 'USD', 'completed', 'U', u, '14,15'); r := r || ' c12=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c12=true'; END;
  -- added teeth need the link and a valid FDI list
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_add) VALUES (d, p, 'X', 1, 'USD', 'completed', 'U', '16'); r := r || ' c13=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c13=true'; END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_unit, denture_add) VALUES (d, p, 'X', 1, 'USD', 'completed', 'U', u, '16, 26'); r := r || ' c14=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c14=true'; END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, denture_unit, denture_add) VALUES (d, p, 'X', 1, 'USD', 'completed', 'U', u, '19'); r := r || ' c15=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c15=true'; END;
  -- a denture session (M204) and a plain jaw session are unaffected
  INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch, unit_teeth) VALUES (d, p, 'Denture', 5, 'USD', 'planned', 'L', '34,35');
  INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, arch) VALUES (d, p, 'Whitening', 5, 'USD', 'completed', 'U');
  r := r || ' c16=' || ((SELECT count(*) FROM public.ledger_sessions WHERE patient_id = p) = 4);

  IF r IS NULL OR r ~ 'FAIL|=false' OR r !~ 'c16=true' THEN RAISE EXCEPTION 'denture-svc-db FAILED:%', r; END IF;
  RAISE NOTICE 'denture-svc-db:%', r;
END $t$;

-- RLS: the new columns ride the existing row policies — the owner writes and reads them, another tenant sees nothing, anon nothing
INSERT INTO public.patients (id, doctor_id, name) VALUES ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000d1','R');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, arch, denture_unit, denture_add)
  VALUES ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a001','Add',1,'USD','completed','U','00000000-0000-0000-0000-00000000c001','16');
DO $$ BEGIN IF (SELECT denture_add FROM public.ledger_sessions WHERE id = '00000000-0000-0000-0000-00000000b001') IS DISTINCT FROM '16' THEN RAISE EXCEPTION 'RLSFAIL owner cannot read its link'; END IF;
  IF (SELECT count(*) FROM public.treatments WHERE denture_svc IS NOT NULL) < 7 THEN RAISE EXCEPTION 'RLSFAIL owner cannot read the marker'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ledger_sessions WHERE id = '00000000-0000-0000-0000-00000000b001';
  IF n <> 0 THEN RAISE EXCEPTION 'RLSFAIL other tenant reads the session'; END IF;
  UPDATE public.ledger_sessions SET denture_add = '17' WHERE id = '00000000-0000-0000-0000-00000000b001'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'RLSFAIL other tenant updated the session'; END IF; END $$;
RESET ROLE; SET LOCAL ROLE anon;
DO $$ DECLARE n int; BEGIN
  BEGIN SELECT count(*) INTO n FROM public.ledger_sessions; EXCEPTION WHEN insufficient_privilege THEN n := 0; END;
  IF n <> 0 THEN RAISE EXCEPTION 'RLSFAIL anon reads sessions'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'denture-svc-db RLS: owner writes and reads · other tenant sees and changes nothing · anon nothing'; END $$;
ROLLBACK;
