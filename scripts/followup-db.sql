-- ════════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/followup-db.sql · behaviour test of M210 (follow-up sessions)
-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL THROWAWAY DATABASE ONLY (see scripts/lab-stages-db.sql for how to build it). It refuses to run when
-- `patients` has rows, and everything is rolled back.
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/followup-db.sql
-- 64 checks on the real trigger chain and the three RPCs (M210 + M211 + M213 + M214) (shape · one level · fixed link · base protection · state ·
-- cascade · whole-patient and whole-clinic deletes · dates · provider ownership · currency) + 6 RLS checks (owner · other tenant · anon).
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.patients) > 0 THEN RAISE EXCEPTION 'followup-db: empty local database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000d1','d1@x'),('00000000-0000-0000-0000-0000000000d2','d2@x') ON CONFLICT DO NOTHING;
INSERT INTO public.platform_admins(user_id) VALUES ('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000d2');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);

DO $t$
DECLARE d uuid := '00000000-0000-0000-0000-0000000000d1'; d2 uuid := '00000000-0000-0000-0000-0000000000d2';
  p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); px uuid := gen_random_uuid();
  b uuid := gen_random_uuid(); bp uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); bx uuid := gen_random_uuid(); n0 uuid := gen_random_uuid();
  doc uuid; docx uuid; j jsonb; c1 uuid; c2 uuid; c3 uuid; r text := ''; n int; s public.ledger_sessions; t0 numeric; t1 numeric;
BEGIN
  INSERT INTO public.patients (id, doctor_id, name) VALUES (p, d, 'P'), (p2, d, 'P2'), (px, d2, 'PX');
  INSERT INTO public.clinic_doctors (owner_id, name) VALUES (d, 'Dr A') RETURNING id INTO doc;
  INSERT INTO public.clinic_doctors (owner_id, name) VALUES (d2, 'Dr X') RETURNING id INTO docx;
  INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, treatment_key, cost, currency, status, tooth_num, surface, date, provider_id)
    VALUES (b, d, p, 'RCT', 'root-canal', 7000, 'USD', 'completed', '36', 'R1', current_date - 10, doc);
  INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, tooth_num, date) VALUES (bp, d, p, 'Crown', 9000, 'USD', 'planned', '37', current_date - 5);
  INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, date) VALUES (b2, d, p2, 'Other patient', 100, 'USD', 'completed', current_date - 5);
  INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, date) VALUES (bx, d2, px, 'Other clinic', 100, 'USD', 'completed', current_date - 5);
  INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, date) VALUES (n0, d, p, 'Plain', 50, 'USD', 'completed', current_date - 3);
  SELECT COALESCE(sum(cost), 0) INTO t0 FROM public.ledger_sessions WHERE patient_id = p;

  -- the RPC: one write inserts the follow-up and opens the base
  j := public.session_followup_add(b, current_date - 7, NULL, '  Canal   irrigation ', ' note ', false);
  c1 := (j->'session'->>'id')::uuid;
  SELECT * INTO s FROM public.ledger_sessions WHERE id = c1;
  r := r || ' c1=' || (s.parent_id = b AND s.cost = 0 AND s.status = 'completed' AND s.currency = 'USD' AND s.patient_id = p AND s.doctor_id = d);
  r := r || ' c2=' || (s.tooth_num IS NULL AND s.surface IS NULL AND s.treatment_key IS NULL AND s.arch IS NULL AND s.quadrant IS NULL AND s.followup_state IS NULL);
  r := r || ' c3=' || (s.type = 'متابعة — RCT' AND s.description = 'Canal irrigation' AND s.notes = 'note' AND s.provider_id = doc AND s.date = current_date - 7);
  r := r || ' c4=' || ((j->>'state') = 'open' AND (SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'open');
  -- «last session» closes; a later follow-up re-opens
  j := public.session_followup_add(b, current_date - 4, doc, NULL, NULL, true); c2 := (j->'session'->>'id')::uuid;
  r := r || ' c5=' || ((SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'closed' AND (SELECT description IS NULL AND notes IS NULL FROM public.ledger_sessions WHERE id = c2));
  j := public.session_followup_add(b, current_date, doc, 'Fit', NULL, false); c3 := (j->'session'->>'id')::uuid;
  r := r || ' c6=' || ((SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'open' AND (SELECT count(*) FROM public.ledger_sessions WHERE parent_id = b) = 3);
  -- no money ever: the patient's total is what it was
  SELECT COALESCE(sum(cost), 0) INTO t1 FROM public.ledger_sessions WHERE patient_id = p;
  r := r || ' c7=' || (t1 = t0);
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id) VALUES (d, p, 'X', 5, 'USD', 'completed', b); r := r || ' c8=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c8=true'; END;
  BEGIN UPDATE public.ledger_sessions SET cost = 1 WHERE id = c1; r := r || ' c9=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c9=true'; END;
  -- no place of its own: the chart engine must never see a follow-up
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id, tooth_num) VALUES (d, p, 'X', 0, 'USD', 'completed', b, '36'); r := r || ' c10=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c10=true'; END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id, treatment_key) VALUES (d, p, 'X', 0, 'USD', 'completed', b, 'root-canal'); r := r || ' c11=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c11=true'; END;
  BEGIN UPDATE public.ledger_sessions SET arch = 'U' WHERE id = c1; r := r || ' c12=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c12=true'; END;
  -- one level; the base is completed, same patient, same clinic, same currency
  BEGIN PERFORM public.session_followup_add(c1, current_date, NULL, NULL, NULL, false); r := r || ' c13=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c13=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id) VALUES (d, p, 'X', 0, 'USD', 'completed', c1); r := r || ' c14=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c14=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN PERFORM public.session_followup_add(bp, current_date, NULL, NULL, NULL, false); r := r || ' c15=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c15=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id) VALUES (d, p, 'X', 0, 'USD', 'completed', b2); r := r || ' c16=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c16=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN INSERT INTO public.ledger_sessions (doctor_id, patient_id, type, cost, currency, status, parent_id) VALUES (d, p, 'X', 0, 'SYP', 'completed', b); r := r || ' c17=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c17=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN PERFORM public.session_followup_add(bx, current_date, NULL, NULL, NULL, false); r := r || ' c18=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c18=' || (SQLERRM = 'followup_base_invalid'); END;
  -- the link never changes: no re-parenting, no ordinary session turned into a follow-up, no follow-up set free
  BEGIN UPDATE public.ledger_sessions SET parent_id = n0 WHERE id = c1; r := r || ' c19=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c19=' || (SQLERRM = 'followup_link_fixed'); END;
  BEGIN UPDATE public.ledger_sessions SET parent_id = b, cost = 0 WHERE id = n0; r := r || ' c20=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c20=' || (SQLERRM = 'followup_link_fixed'); END;
  BEGIN UPDATE public.ledger_sessions SET parent_id = NULL WHERE id = c1; r := r || ' c21=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c21=' || (SQLERRM = 'followup_link_fixed'); END;
  -- a base with follow-ups stays completed and stays with its patient; a plain session moves freely
  BEGIN UPDATE public.ledger_sessions SET status = 'planned' WHERE id = b; r := r || ' c22=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c22=' || (SQLERRM = 'followup_base_has_children'); END;
  BEGIN UPDATE public.ledger_sessions SET patient_id = p2 WHERE id = b; r := r || ' c23=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c23=' || (SQLERRM = 'followup_base_has_children'); END;
  UPDATE public.ledger_sessions SET status = 'planned' WHERE id = n0; UPDATE public.ledger_sessions SET status = 'completed', notes = 'x', cost = 60 WHERE id = n0;
  r := r || ' c24=' || ((SELECT status = 'completed' AND cost = 60 AND followup_state IS NULL FROM public.ledger_sessions WHERE id = n0));
  -- dates, text, provider
  BEGIN PERFORM public.session_followup_add(b, current_date - 11, NULL, NULL, NULL, false); r := r || ' c25=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c25=' || (SQLERRM = 'followup_date_invalid'); END;
  BEGIN PERFORM public.session_followup_add(b, NULL, NULL, NULL, NULL, false); r := r || ' c26a=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c26a=' || (SQLERRM = 'followup_date_invalid'); END;
  BEGIN PERFORM public.session_followup_add(b, current_date + 30, NULL, NULL, NULL, false); r := r || ' c26b=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c26b=' || (SQLERRM = 'followup_date_invalid'); END;
  BEGIN PERFORM public.session_followup_add(b, current_date, NULL, repeat('x', 81), NULL, false); r := r || ' c27=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c27=' || (SQLERRM = 'followup_text_too_long'); END;
  BEGIN PERFORM public.session_followup_add(b, current_date, docx, NULL, NULL, false); r := r || ' c28=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c28=' || (SQLERRM = 'followup_provider_invalid'); END;
  r := r || ' c29=' || ((SELECT count(*) FROM public.ledger_sessions WHERE parent_id = b) = 3);
  -- the state: only the two values, on a completed base, never on a follow-up ('closed' needs a follow-up — M211)
  j := public.session_followup_set_state(b, 'closed');
  r := r || ' c30=' || ((j->>'state') = 'closed' AND (SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'closed');
  j := public.session_followup_set_state(b, 'open');
  r := r || ' c31=' || ((SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'open');
  BEGIN PERFORM public.session_followup_set_state(b, 'done'); r := r || ' c32=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c32=' || (SQLERRM = 'followup_state_invalid'); END;
  -- M211: «يحتاج جلسات متابعة» — 'open' without follow-ups; 'closed' still needs one; NULL clears a childless base only
  j := public.session_followup_set_state(n0, 'open');
  r := r || ' c33=' || ((j->>'state') = 'open' AND (SELECT followup_state FROM public.ledger_sessions WHERE id = n0) = 'open');
  BEGIN PERFORM public.session_followup_set_state(n0, 'closed'); r := r || ' c33b=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c33b=' || (SQLERRM = 'followup_base_invalid'); END;
  UPDATE public.ledger_sessions SET status = 'planned' WHERE id = n0;   -- M210 guard: a childless base that is no longer completed loses its state
  r := r || ' c33c=' || ((SELECT followup_state IS NULL FROM public.ledger_sessions WHERE id = n0));
  UPDATE public.ledger_sessions SET status = 'completed' WHERE id = n0;
  PERFORM public.session_followup_set_state(n0, 'open');
  j := public.session_followup_set_state(n0, NULL);
  r := r || ' c33d=' || ((j->>'state') IS NULL AND (SELECT followup_state FROM public.ledger_sessions WHERE id = n0) IS NULL);
  BEGIN PERFORM public.session_followup_set_state(b, NULL); r := r || ' c33e=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c33e=' || (SQLERRM = 'followup_base_has_children'); END;
  r := r || ' c33f=' || ((SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'open');
  BEGIN PERFORM public.session_followup_set_state(bp, 'open'); r := r || ' c33g=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c33g=' || (SQLERRM = 'followup_base_invalid'); END;
  -- M213: «الزيارة التالية» — a planned follow-up in the M210 shape; the base becomes «قيد الإنجاز»
  j := public.session_followup_plan(n0, current_date + 7, doc, '  Next  step ', 'see you');
  SELECT * INTO s FROM public.ledger_sessions WHERE id = (j->'session'->>'id')::uuid;
  r := r || ' p1=' || (s.parent_id = n0 AND s.status = 'planned' AND s.cost = 0 AND s.tooth_num IS NULL AND s.treatment_key IS NULL AND s.date = current_date + 7
                       AND s.description = 'Next step' AND s.provider_id = doc AND s.currency = 'USD' AND s.type = 'متابعة — Plain' AND (j->>'state') = 'open'
                       AND (SELECT followup_state FROM public.ledger_sessions WHERE id = n0) = 'open');
  BEGIN PERFORM public.session_followup_plan(n0, current_date - 1, NULL, 'x', NULL); r := r || ' p2=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p2=' || (SQLERRM = 'followup_date_invalid'); END;
  BEGIN PERFORM public.session_followup_plan(n0, current_date + 731, NULL, 'x', NULL); r := r || ' p3=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p3=' || (SQLERRM = 'followup_date_invalid'); END;
  BEGIN PERFORM public.session_followup_plan(bp, current_date + 1, NULL, 'x', NULL); r := r || ' p4=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p4=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN PERFORM public.session_followup_plan(c1, current_date + 1, NULL, 'x', NULL); r := r || ' p5=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p5=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN PERFORM public.session_followup_plan(n0, current_date + 1, docx, 'x', NULL); r := r || ' p6=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p6=' || (SQLERRM = 'followup_provider_invalid'); END;
  BEGIN PERFORM public.session_followup_plan(n0, current_date + 1, NULL, repeat('x', 81), NULL); r := r || ' p7=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' p7=' || (SQLERRM = 'followup_text_too_long'); END;
  BEGIN UPDATE public.ledger_sessions SET tooth_num = '11' WHERE id = s.id; r := r || ' p8=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' p8=true'; END;
  UPDATE public.ledger_sessions SET status = 'completed' WHERE id = s.id;   -- «إكمال» / «إكمال الموعد»: the existing flip
  r := r || ' p9=' || ((SELECT status = 'completed' AND cost = 0 AND parent_id = n0 FROM public.ledger_sessions WHERE id = s.id));
  DELETE FROM public.ledger_sessions WHERE id = s.id;   -- its only follow-up ⇒ the base is plain again (M210 trigger)
  r := r || ' p10=' || ((SELECT followup_state IS NULL FROM public.ledger_sessions WHERE id = n0));
  -- M214: cancelling the only booked visit keeps the treatment «قيد الإنجاز»; its date follows its appointment
  j := public.session_followup_plan(n0, current_date + 3, NULL, 'Next', NULL);
  UPDATE public.ledger_sessions SET date = current_date + 9 WHERE id = (j->'session'->>'id')::uuid;
  r := r || ' p11=' || ((SELECT date = current_date + 9 AND status = 'planned' FROM public.ledger_sessions WHERE id = (j->'session'->>'id')::uuid));
  DELETE FROM public.ledger_sessions WHERE id = (j->'session'->>'id')::uuid;
  r := r || ' p12=' || ((SELECT COALESCE(followup_state = 'open', false) FROM public.ledger_sessions WHERE id = n0));
  j := public.session_followup_set_state(n0, NULL);
  r := r || ' p13=' || ((SELECT followup_state IS NULL FROM public.ledger_sessions WHERE id = n0));
  BEGIN PERFORM public.session_followup_set_state(c1, 'open'); r := r || ' c34=FAIL';
    EXCEPTION WHEN sqlstate 'P0001' THEN r := r || ' c34=' || (SQLERRM = 'followup_base_invalid'); END;
  BEGIN UPDATE public.ledger_sessions SET followup_state = 'open' WHERE id = c1; r := r || ' c35=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c35=true'; END;
  BEGIN UPDATE public.ledger_sessions SET followup_state = 'open' WHERE id = bp; r := r || ' c36=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c36=true'; END;
  BEGIN UPDATE public.ledger_sessions SET followup_state = 'paused' WHERE id = b; r := r || ' c37=FAIL';
    EXCEPTION WHEN check_violation THEN r := r || ' c37=true'; END;
  -- deleting follow-ups: the state survives while one remains, and the base is a plain session again after the last
  DELETE FROM public.ledger_sessions WHERE id IN (c1, c2);
  r := r || ' c38=' || ((SELECT followup_state FROM public.ledger_sessions WHERE id = b) = 'open');
  DELETE FROM public.ledger_sessions WHERE id = c3;
  r := r || ' c39=' || ((SELECT followup_state IS NULL AND cost = 7000 AND tooth_num = '36' AND treatment_key = 'root-canal' FROM public.ledger_sessions WHERE id = b));
  UPDATE public.ledger_sessions SET status = 'planned' WHERE id = b; UPDATE public.ledger_sessions SET status = 'completed' WHERE id = b;
  r := r || ' c40=' || ((SELECT status FROM public.ledger_sessions WHERE id = b) = 'completed');   -- childless again ⇒ free again
  -- deleting the base takes its follow-ups with it
  PERFORM public.session_followup_add(b, current_date, NULL, 'A', NULL, false); PERFORM public.session_followup_add(b, current_date, NULL, 'B', NULL, true);
  DELETE FROM public.ledger_sessions WHERE id = b;
  r := r || ' c41=' || ((SELECT count(*) FROM public.ledger_sessions WHERE parent_id = b OR id = b) = 0 AND (SELECT count(*) FROM public.ledger_sessions WHERE patient_id = p) = 2);
  -- whole-patient and whole-clinic deletes (FK cascade from patients · account wipe by doctor_id) pass through both triggers
  PERFORM public.session_followup_add(b2, current_date, NULL, 'A', NULL, false); PERFORM public.session_followup_add(b2, current_date, NULL, 'B', NULL, false);
  DELETE FROM public.patients WHERE id = p2;
  r := r || ' c43=' || ((SELECT count(*) FROM public.ledger_sessions WHERE patient_id = p2) = 0);
  PERFORM public.session_followup_add(n0, current_date, NULL, 'A', NULL, false); PERFORM public.session_followup_add(n0, current_date, NULL, 'B', NULL, true);
  DELETE FROM public.ledger_sessions WHERE doctor_id = d;
  r := r || ' c44=' || ((SELECT count(*) FROM public.ledger_sessions WHERE doctor_id = d) = 0 AND (SELECT count(*) FROM public.ledger_sessions WHERE doctor_id = d2) = 1);
  -- the catalog flag is a free tri-state
  r := r || ' c42=' || ((SELECT count(*) FROM public.treatments WHERE doctor_id = d AND multi_visit IS NOT NULL) = 0);

  IF r IS NULL OR r ~ 'FAIL|=false' OR r !~ 'c42=true' OR (length(r) - length(replace(r, '=true', ''))) / 5 <> 64 THEN RAISE EXCEPTION 'followup-db FAILED:%', r; END IF;
  RAISE NOTICE 'followup-db:%', r;
END $t$;

-- RLS: the RPCs are SECURITY INVOKER — the owner writes, another tenant reaches nothing, anon cannot call
INSERT INTO public.patients (id, doctor_id, name) VALUES ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000d1','R');
INSERT INTO public.ledger_sessions (id, doctor_id, patient_id, type, cost, currency, status, date)
  VALUES ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a001','Base',10,'USD','completed',current_date - 1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
DO $$ DECLARE j jsonb; BEGIN
  j := public.session_followup_add('00000000-0000-0000-0000-00000000b001', current_date, NULL, 'Owner', NULL, false);
  IF (SELECT count(*) FROM public.ledger_sessions WHERE parent_id = '00000000-0000-0000-0000-00000000b001') <> 1 THEN RAISE EXCEPTION 'RLSFAIL owner cannot add a follow-up'; END IF;
  IF (SELECT followup_state FROM public.ledger_sessions WHERE id = '00000000-0000-0000-0000-00000000b001') IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'RLSFAIL owner cannot read the state'; END IF;
  j := public.session_followup_set_state('00000000-0000-0000-0000-00000000b001', 'closed');
  IF (j->>'state') <> 'closed' THEN RAISE EXCEPTION 'RLSFAIL owner cannot close'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',true);
DO $$ DECLARE n int; ok boolean := false; BEGIN
  SELECT count(*) INTO n FROM public.ledger_sessions WHERE parent_id = '00000000-0000-0000-0000-00000000b001' OR id = '00000000-0000-0000-0000-00000000b001';
  IF n <> 0 THEN RAISE EXCEPTION 'RLSFAIL other tenant reads the sessions'; END IF;
  BEGIN PERFORM public.session_followup_add('00000000-0000-0000-0000-00000000b001', current_date, NULL, 'Intruder', NULL, false);
    EXCEPTION WHEN sqlstate 'P0001' THEN ok := (SQLERRM = 'followup_base_invalid'); END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL other tenant added a follow-up'; END IF;
  ok := false;
  BEGIN PERFORM public.session_followup_set_state('00000000-0000-0000-0000-00000000b001', 'open');
    EXCEPTION WHEN sqlstate 'P0001' THEN ok := (SQLERRM = 'followup_base_invalid'); END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL other tenant changed the state'; END IF;
  ok := false;
  BEGIN PERFORM public.session_followup_plan('00000000-0000-0000-0000-00000000b001', current_date + 3, NULL, 'Intruder', NULL);
    EXCEPTION WHEN sqlstate 'P0001' THEN ok := (SQLERRM = 'followup_base_invalid'); END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL other tenant planned a follow-up'; END IF; END $$;
RESET ROLE; SET LOCAL ROLE anon;
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM public.session_followup_add('00000000-0000-0000-0000-00000000b001', current_date, NULL, NULL, NULL, false);
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL anon can call session_followup_add'; END IF;
  ok := false;
  BEGIN PERFORM public.session_followup_set_state('00000000-0000-0000-0000-00000000b001', 'open');
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL anon can call session_followup_set_state'; END IF;
  ok := false;
  BEGIN PERFORM public.session_followup_plan('00000000-0000-0000-0000-00000000b001', current_date + 3, NULL, NULL, NULL);
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'RLSFAIL anon can call session_followup_plan'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.ledger_sessions WHERE parent_id = '00000000-0000-0000-0000-00000000b001') <> 1
          OR (SELECT followup_state FROM public.ledger_sessions WHERE id = '00000000-0000-0000-0000-00000000b001') <> 'closed' THEN RAISE EXCEPTION 'RLSFAIL the intruders changed something'; END IF;
  RAISE NOTICE 'followup-db RLS: owner adds and closes · other tenant reads, adds and changes nothing · anon cannot call any of the three RPCs'; END $$;
ROLLBACK;
