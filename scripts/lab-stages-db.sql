-- ═══════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/lab-stages-db.sql · behaviour test of M206 (lab order stages)
-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL THROWAWAY DATABASE ONLY. It refuses to run when `patients` has rows, and
-- everything it does is rolled back. Build the database first:
--     python3 scripts/db-bootstrap.py --emit-dir DIR     (then psql each batch in order,
--     after creating the Supabase roles and an auth.uid() stub — see docs/LAB_STAGES.md)
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/lab-stages-db.sql
-- It exercises the real trigger chain (redo cycle M160 + stage cycle M206), both RPCs,
-- the appointment guard, and RLS (other tenant · anon). 30 trigger/RPC checks + 3 RLS checks.
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.patients) > 0 THEN RAISE EXCEPTION 'lab-stages-db: empty local database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000d1','d1@x'),('00000000-0000-0000-0000-0000000000d2','d2@x') ON CONFLICT DO NOTHING;
INSERT INTO public.platform_admins(user_id) VALUES ('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000d2');
ALTER TABLE public.patients DISABLE TRIGGER USER; ALTER TABLE public.appointments DISABLE TRIGGER USER;
INSERT INTO public.patients(id,doctor_id,name) VALUES ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000d1','P1'),('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-0000000000d1','P2');
INSERT INTO public.appointments(doctor_id,patient_id,date,"time",notes) VALUES
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a001',current_date+3,'10:00','AP1'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a001',current_date+9,'10:00','AP2'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a002',current_date+9,'11:00','APX');
INSERT INTO public.lab_orders(doctor_id,patient_id,lab_name,work_type,currency,status,date_sent) VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000a001','L','SEED','USD','sent',now());
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);

DO $t$
DECLARE src public.lab_orders; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); o public.lab_orders; r text := ''; ds timestamptz; rcv timestamptz; j jsonb;
  st jsonb := '[{"k":"bite","n":"عضة"},{"k":"tryin","n":"تجربة"},{"k":"fit","n":"تسليم"}]'::jsonb;
BEGIN
  SELECT * INTO src FROM public.lab_orders WHERE work_type='SEED' LIMIT 1;
  INSERT INTO public.lab_orders (id, doctor_id, patient_id, lab_id, lab_name, work_type, cost, currency, status, date_sent, date_due, stages)
    VALUES (a, src.doctor_id, src.patient_id, src.lab_id, src.lab_name, 'T', 5, src.currency, 'sent', now() - interval '10 days', now() + interval '2 days', st);
  INSERT INTO public.lab_orders (id, doctor_id, patient_id, lab_id, lab_name, work_type, cost, currency, status, date_sent)
    VALUES (b, src.doctor_id, src.patient_id, src.lab_id, src.lab_name, 'P', 5, src.currency, 'sent', now() - interval '3 days');
  SELECT * INTO o FROM public.lab_orders WHERE id = a; ds := o.date_sent;
  r := r || ' t1=' || (o.stage_idx = 0);
  BEGIN UPDATE public.lab_orders SET stages = '[{"n":"x"}]' WHERE id = a; r := r || ' t2a=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t2a=' || SQLERRM; END;
  BEGIN UPDATE public.lab_orders SET stages = '[{"k":"a"},{"n":"y"}]' WHERE id = a; r := r || ' t2b=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t2b=' || SQLERRM; END;
  BEGIN UPDATE public.lab_orders SET status = 'delivered', date_delivered = now() WHERE id = a; r := r || ' t3=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t3=' || SQLERRM; END;
  BEGIN PERFORM public.lab_order_next_stage(a, now(), NULL); r := r || ' t4=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t4=' || SQLERRM; END;
  UPDATE public.lab_orders SET status = 'received', date_received = now() - interval '1 day' WHERE id = a;
  SELECT date_received INTO rcv FROM public.lab_orders WHERE id = a;
  BEGIN UPDATE public.lab_orders SET status = 'sent', stage_idx = 2 WHERE id = a; r := r || ' t6=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t6=' || SQLERRM; END;
  BEGIN PERFORM public.lab_order_next_stage(a, now(), gen_random_uuid()); r := r || ' t5x=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t5x=' || SQLERRM; END;
  PERFORM public.lab_order_next_stage(a, now() + interval '7 days', NULL);
  SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t5=' || (o.status = 'sent' AND o.stage_idx = 1 AND o.date_sent = ds AND o.date_received IS NULL AND (o.stages->0->>'received')::timestamptz = date_trunc('second', rcv) AND o.stages->0 ? 'sent' AND o.stages->1 ? 'sent' AND o.stages->0 ? 'due' AND o.date_due > now() + interval '6 days');
  UPDATE public.lab_orders SET stages = jsonb_set(stages, '{0,n}', '"مزوّر"') WHERE id = a;
  SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t10=' || (o.stages->0->>'n' = 'عضة');
  PERFORM public.lab_order_prev_stage(a);
  SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t7=' || (o.status = 'received' AND o.stage_idx = 0 AND o.date_sent = ds AND o.date_received = date_trunc('second', rcv) AND NOT (o.stages->1 ? 'sent') AND NOT (o.stages->0 ? 'received') AND o.date_due < now() + interval '3 days');
  BEGIN PERFORM public.lab_order_prev_stage(a); r := r || ' t7b=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t7b=' || SQLERRM; END;
  UPDATE public.lab_orders SET stages = NULL WHERE id = a; SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t9a=' || (o.stages IS NULL AND o.stage_idx IS NULL);
  UPDATE public.lab_orders SET stages = st WHERE id = a; SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t9b=' || (o.stage_idx = 0);
  PERFORM public.lab_order_next_stage(a, NULL, NULL);
  BEGIN UPDATE public.lab_orders SET stages = NULL WHERE id = a; r := r || ' t9c=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t9c=' || SQLERRM; END;
  UPDATE public.lab_orders SET status = 'received', date_received = now() WHERE id = a;
  PERFORM public.lab_order_redo(a, 'سبب', now() + interval '3 days');
  UPDATE public.lab_orders SET status = 'sent' WHERE id = a; SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t11=' || (o.status = 'sent' AND o.stage_idx = 1 AND o.date_sent = ds AND o.date_received IS NULL AND (SELECT count(*) FROM public.lab_order_redos WHERE lab_order_id = a) = 1);
  UPDATE public.lab_orders SET status = 'received', date_received = now() WHERE id = a;
  PERFORM public.lab_order_next_stage(a, NULL, NULL);
  UPDATE public.lab_orders SET status = 'received', date_received = now() WHERE id = a;
  UPDATE public.lab_orders SET status = 'checked', date_checked = now() WHERE id = a;
  BEGIN PERFORM public.lab_order_next_stage(a, NULL, NULL); r := r || ' t8a=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t8a=' || SQLERRM; END;
  UPDATE public.lab_orders SET status = 'delivered', date_delivered = now() WHERE id = a; SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' t8=' || (o.status = 'delivered' AND o.stage_idx = 2 AND o.date_sent = ds AND jsonb_array_length(o.stages) = 3 AND o.stages->1 ? 'received');
  UPDATE public.lab_orders SET status = 'received', date_received = now() WHERE id = b;
  UPDATE public.lab_orders SET status = 'checked', date_checked = now() WHERE id = b;
  UPDATE public.lab_orders SET status = 'delivered', date_delivered = now() WHERE id = b; SELECT * INTO o FROM public.lab_orders WHERE id = b;
  r := r || ' t12=' || (o.status = 'delivered' AND o.stages IS NULL AND o.stage_idx IS NULL);
  BEGIN PERFORM public.lab_order_next_stage(b, NULL, NULL); r := r || ' t12b=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t12b=' || SQLERRM; END;
  r := r || ' existing_rows_ok=' || (SELECT count(*) = 0 FROM public.lab_orders WHERE id NOT IN (a, b) AND (stages IS NOT NULL OR stage_idx IS NOT NULL));

  -- appointment linking: same patient ok, other patient refused, undo restores the previous appointment
  DECLARE c uuid := gen_random_uuid(); ap1 uuid; ap2 uuid; apx uuid; BEGIN
    SELECT id INTO ap1 FROM public.appointments WHERE notes='AP1'; SELECT id INTO ap2 FROM public.appointments WHERE notes='AP2'; SELECT id INTO apx FROM public.appointments WHERE notes='APX';
    INSERT INTO public.lab_orders (id, doctor_id, patient_id, lab_name, work_type, cost, currency, status, date_sent, date_due, stages, appointment_id)
      VALUES (c, src.doctor_id, src.patient_id, 'L', 'A', 5, 'USD', 'sent', now() - interval '5 days', now() + interval '1 day', st, ap1);
    UPDATE public.lab_orders SET status='received', date_received=now() WHERE id=c;
    BEGIN PERFORM public.lab_order_next_stage(c, now()+interval '5 days', apx); r := r || ' t13x=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t13x=' || SQLERRM; END;
    PERFORM public.lab_order_next_stage(c, now()+interval '5 days', ap2); SELECT * INTO o FROM public.lab_orders WHERE id=c;
    r := r || ' t13=' || (o.appointment_id = ap2 AND (o.stages->0->>'appt')::uuid = ap1);
    PERFORM public.lab_order_prev_stage(c); SELECT * INTO o FROM public.lab_orders WHERE id=c;
    r := r || ' t14=' || (o.appointment_id = ap1 AND o.stage_idx = 0 AND o.status='received');
    -- deleted appointment: undo must not fail, link becomes NULL
    PERFORM public.lab_order_next_stage(c, NULL, ap2); DELETE FROM public.appointments WHERE id = ap1;
    PERFORM public.lab_order_prev_stage(c); SELECT * INTO o FROM public.lab_orders WHERE id=c;
    r := r || ' t15=' || (o.appointment_id IS NULL AND o.stage_idx = 0);
    -- insert with status delivered refused; insert with a wrong idx normalised to 0; 9 stages refused; draft with stages ok
    BEGIN INSERT INTO public.lab_orders (doctor_id, lab_name, work_type, currency, status, date_sent, stages, stage_idx) VALUES (src.doctor_id,'L','D','USD','delivered',now(),st,2); r := r || ' t16=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t16=' || SQLERRM; END;
    INSERT INTO public.lab_orders (id, doctor_id, lab_name, work_type, currency, status, date_sent, stages, stage_idx) VALUES (gen_random_uuid(), src.doctor_id,'L','DR','USD','draft',NULL,st,2) RETURNING * INTO o;
    r := r || ' t17=' || (o.stage_idx = 0 AND o.status='draft');
    BEGIN UPDATE public.lab_orders SET stages = (SELECT jsonb_agg(jsonb_build_object('n','s'||g)) FROM generate_series(1,9) g) WHERE id = o.id; r := r || ' t18=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t18=' || SQLERRM; END;
    BEGIN UPDATE public.lab_orders SET stage_idx = 1 WHERE id = o.id; r := r || ' t19=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t19=' || SQLERRM; END;
    -- editing the pending tail of an order (rename/add a later stage) is allowed while idx stays
    UPDATE public.lab_orders SET stages = stages || '[{"n":"تجربة ثانية"}]'::jsonb WHERE id = c; SELECT * INTO o FROM public.lab_orders WHERE id=c;
    r := r || ' t20=' || (jsonb_array_length(o.stages) = 4 AND o.stage_idx = 0);
    -- shrinking below the current stage refused
    PERFORM public.lab_order_next_stage(c, NULL, NULL); UPDATE public.lab_orders SET status='received', date_received=now() WHERE id=c; PERFORM public.lab_order_next_stage(c, NULL, NULL);
    BEGIN UPDATE public.lab_orders SET stages = '[{"n":"a"},{"n":"b"}]'::jsonb WHERE id = c; r := r || ' t21=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' t21=' || SQLERRM; END;
  END;
  IF r IS NULL OR r ~ 'FAIL|=false' THEN RAISE EXCEPTION 'lab-stages-db FAILED:%', r; END IF;
  RAISE NOTICE 'lab-stages-db trigger/RPC:%', r;
END $t$;


-- RLS: another tenant cannot advance the order · the owner can · anon cannot call the RPC
INSERT INTO public.lab_orders(id,doctor_id,lab_name,work_type,currency,status,date_sent,date_received,stages)
  VALUES ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000d1','L','R','USD','received',now(),now(),'[{"n":"a"},{"n":"b"}]');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',true);
DO $$ BEGIN PERFORM public.lab_order_next_stage('00000000-0000-0000-0000-00000000b001',NULL,NULL); RAISE EXCEPTION 'RLSFAIL other tenant advanced';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'lab_stage_not_allowed' THEN RAISE; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
DO $$ BEGIN IF (public.lab_order_next_stage('00000000-0000-0000-0000-00000000b001',NULL,NULL))->>'stage_idx' <> '1' THEN RAISE EXCEPTION 'RLSFAIL owner could not advance'; END IF; END $$;
RESET ROLE; SET LOCAL ROLE anon;
DO $$ BEGIN PERFORM public.lab_order_next_stage('00000000-0000-0000-0000-00000000b001',NULL,NULL); RAISE EXCEPTION 'RLSFAIL anon executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'lab-stages-db RLS: other-tenant refused · owner ok · anon refused'; END $$;
ROLLBACK;
