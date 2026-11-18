-- ═══════════════════════════════════════════════════════════════════════════
-- SyDent — scripts/lab-status-db.sql · behaviour test of M207 (lab order status control)
-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL THROWAWAY DATABASE ONLY (see scripts/lab-stages-db.sql for how to build it). It refuses to run when
-- `patients` has rows, and everything is rolled back.
--     psql -v ON_ERROR_STOP=1 -d <db> -f scripts/lab-status-db.sql
-- 28 checks of lab_order_set_status with the real redo and stage triggers + 3 RLS checks.
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.patients) > 0 THEN RAISE EXCEPTION 'lab-status-db: empty local database only'; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000d1','d1@x'),('00000000-0000-0000-0000-0000000000d2','d2@x') ON CONFLICT DO NOTHING;
INSERT INTO public.platform_admins(user_id) VALUES ('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000d2');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);

DO $t$
DECLARE d uuid := '00000000-0000-0000-0000-0000000000d1'; a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  o public.lab_orders; r text := ''; ds timestamptz := now() - interval '9 days'; rc timestamptz; n int;
  st jsonb := '[{"n":"عضة"},{"n":"تجربة"},{"n":"تسليم"}]'::jsonb;
  ok constant text := 'lab_status_not_allowed';
BEGIN
  INSERT INTO public.lab_orders (id, doctor_id, lab_name, work_type, cost, currency, status, date_sent) VALUES (a, d, 'L', 'A', 5, 'USD', 'sent', ds);
  -- forward: sent → received stamps the receive date; date_sent never moves
  PERFORM public.lab_order_set_status(a, 'received'); SELECT * INTO o FROM public.lab_orders WHERE id = a; rc := o.date_received;
  r := r || ' s1=' || (o.status = 'received' AND o.date_received IS NOT NULL AND o.date_checked IS NULL AND o.date_sent = ds);
  -- same status: no-op
  PERFORM public.lab_order_set_status(a, 'received'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s2=' || (o.date_received = rc);
  -- forward two steps: checked keeps the receive date and stamps the check
  PERFORM public.lab_order_set_status(a, 'checked'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s3=' || (o.status = 'checked' AND o.date_received = rc AND o.date_checked IS NOT NULL);
  PERFORM public.lab_order_set_status(a, 'delivered'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s4=' || (o.status = 'delivered' AND o.date_delivered IS NOT NULL AND o.date_checked IS NOT NULL);
  -- delivered work cannot be cancelled
  BEGIN PERFORM public.lab_order_set_status(a, 'rejected', 'x'); r := r || ' s5=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s5=' || (SQLERRM = ok); END;
  -- back: delivered → received clears what came after
  PERFORM public.lab_order_set_status(a, 'received'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s6=' || (o.status = 'received' AND o.date_received = rc AND o.date_checked IS NULL AND o.date_delivered IS NULL);
  -- back: received → sent clears the receive date (a wrong click undone)
  PERFORM public.lab_order_set_status(a, 'sent'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s7=' || (o.status = 'sent' AND o.date_received IS NULL AND o.date_sent = ds);
  -- sent → checked directly stamps both
  PERFORM public.lab_order_set_status(a, 'checked'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s8=' || (o.status = 'checked' AND o.date_received IS NOT NULL AND o.date_checked IS NOT NULL);
  -- draft boundary and redo are not this function's
  BEGIN PERFORM public.lab_order_set_status(a, 'draft'); r := r || ' s9=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s9=' || (SQLERRM = ok); END;
  BEGIN PERFORM public.lab_order_set_status(a, 'redo'); r := r || ' s10=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s10=' || (SQLERRM = ok); END;
  BEGIN PERFORM public.lab_order_set_status(a, 'bogus'); r := r || ' s11=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s11=' || (SQLERRM = ok); END;
  BEGIN PERFORM public.lab_order_set_status(gen_random_uuid(), 'sent'); r := r || ' s12=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s12=' || (SQLERRM = ok); END;
  -- cancel: keeps every date, remembers where it came from, trims the reason
  SELECT * INTO o FROM public.lab_orders WHERE id = a; rc := o.date_received;
  PERFORM public.lab_order_set_status(a, 'rejected', '  المريض لم يعد  '); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s13=' || (o.status = 'rejected' AND o.cancel_prev_status = 'checked' AND o.cancel_reason = 'المريض لم يعد' AND o.date_cancelled IS NOT NULL AND o.date_received = rc AND o.date_sent = ds AND o.cost = 5);
  -- a cancelled order restores only to where it was
  BEGIN PERFORM public.lab_order_set_status(a, 'sent'); r := r || ' s14=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s14=' || (SQLERRM = ok); END;
  PERFORM public.lab_order_set_status(a, 'checked'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s15=' || (o.status = 'checked' AND o.cancel_prev_status IS NULL AND o.cancel_reason IS NULL AND o.date_cancelled IS NULL AND o.date_received = rc);
  -- reason longer than 300 is cut, empty reason is NULL
  PERFORM public.lab_order_set_status(a, 'rejected', repeat('س', 400)); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s16=' || (char_length(o.cancel_reason) = 300);
  PERFORM public.lab_order_set_status(a, 'checked'); PERFORM public.lab_order_set_status(a, 'rejected', '   '); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s17=' || (o.cancel_reason IS NULL);

  -- draft: nothing was sent — neither a status jump nor a cancellation (it is deleted instead); a legacy cancelled row restores to «sent»
  INSERT INTO public.lab_orders (id, doctor_id, lab_name, work_type, currency, status, date_sent) VALUES (dr, d, 'L', 'D', 'USD', 'draft', NULL);
  BEGIN PERFORM public.lab_order_set_status(dr, 'received'); r := r || ' s18=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s18=' || (SQLERRM = ok); END;
  BEGIN PERFORM public.lab_order_set_status(dr, 'rejected'); r := r || ' s19=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s19=' || (SQLERRM = ok); END;
  UPDATE public.lab_orders SET status = 'rejected', date_sent = ds WHERE id = dr;
  PERFORM public.lab_order_set_status(dr, 'sent'); SELECT * INTO o FROM public.lab_orders WHERE id = dr;
  r := r || ' s19b=' || (o.status = 'sent' AND o.date_sent = ds);

  -- redo: cancelling and restoring does not open a second redo cycle
  PERFORM public.lab_order_set_status(a, 'checked');
  PERFORM public.lab_order_redo(a, 'سبب', now() + interval '3 days');
  SELECT count(*) INTO n FROM public.lab_order_redos WHERE lab_order_id = a;
  BEGIN PERFORM public.lab_order_set_status(a, 'sent'); r := r || ' s20=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s20=' || (SQLERRM = ok); END;
  PERFORM public.lab_order_set_status(a, 'rejected', 'ألغي أثناء الإعادة'); PERFORM public.lab_order_set_status(a, 'redo'); SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s21=' || (o.status = 'redo' AND n = 1 AND (SELECT count(*) FROM public.lab_order_redos WHERE lab_order_id = a) = 1);
  -- the redo cycle itself still works after M207 (resend clears the cycle dates and closes the cycle)
  UPDATE public.lab_orders SET status = 'sent' WHERE id = a; SELECT * INTO o FROM public.lab_orders WHERE id = a;
  r := r || ' s22=' || (o.status = 'sent' AND o.date_received IS NULL AND o.date_sent = ds AND (SELECT count(*) FROM public.lab_order_redos WHERE lab_order_id = a AND resent_at IS NOT NULL) = 1);
  PERFORM public.lab_order_set_status(a, 'received'); PERFORM public.lab_order_redo(a, 'ثانية', NULL);
  r := r || ' s23=' || ((SELECT count(*) FROM public.lab_order_redos WHERE lab_order_id = a) = 2);

  -- stages: «delivered» only on the last stage, also through this function; cancel and restore keep the stage
  INSERT INTO public.lab_orders (id, doctor_id, lab_name, work_type, currency, status, date_sent, stages) VALUES (s, d, 'L', 'S', 'USD', 'sent', ds, st);
  PERFORM public.lab_order_set_status(s, 'received');
  BEGIN PERFORM public.lab_order_set_status(s, 'delivered'); r := r || ' s24=FAIL'; EXCEPTION WHEN OTHERS THEN r := r || ' s24=' || (SQLERRM = 'lab_stage_not_final'); END;
  PERFORM public.lab_order_next_stage(s, NULL, NULL);
  PERFORM public.lab_order_set_status(s, 'rejected', 'x'); PERFORM public.lab_order_set_status(s, 'sent'); SELECT * INTO o FROM public.lab_orders WHERE id = s;
  r := r || ' s25=' || (o.status = 'sent' AND o.stage_idx = 1 AND o.stages->0 ? 'received' AND o.date_sent = ds);
  PERFORM public.lab_order_set_status(s, 'received'); PERFORM public.lab_order_set_status(s, 'sent'); SELECT * INTO o FROM public.lab_orders WHERE id = s;
  r := r || ' s26=' || (o.status = 'sent' AND o.stage_idx = 1 AND o.date_received IS NULL);
  PERFORM public.lab_order_prev_stage(s); SELECT * INTO o FROM public.lab_orders WHERE id = s;
  r := r || ' s27=' || (o.stage_idx = 0 AND o.status = 'received');

  IF r IS NULL OR r ~ 'FAIL|=false' THEN RAISE EXCEPTION 'lab-status-db FAILED:%', r; END IF;
  RAISE NOTICE 'lab-status-db RPC:%', r;
END $t$;

-- RLS: another tenant cannot change the status · the owner can · anon cannot call the RPC
INSERT INTO public.lab_orders(id,doctor_id,lab_name,work_type,currency,status,date_sent)
  VALUES ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','L','R','USD','sent',now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',true);
DO $$ BEGIN PERFORM public.lab_order_set_status('00000000-0000-0000-0000-00000000c001','rejected','x'); RAISE EXCEPTION 'RLSFAIL other tenant cancelled';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'lab_status_not_allowed' THEN RAISE; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
DO $$ BEGIN IF (public.lab_order_set_status('00000000-0000-0000-0000-00000000c001','received'))->>'status' <> 'received' THEN RAISE EXCEPTION 'RLSFAIL owner could not change'; END IF; END $$;
RESET ROLE; SET LOCAL ROLE anon;
DO $$ BEGIN PERFORM public.lab_order_set_status('00000000-0000-0000-0000-00000000c001','sent'); RAISE EXCEPTION 'RLSFAIL anon executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'lab-status-db RLS: other-tenant refused · owner ok · anon refused'; END $$;
ROLLBACK;
