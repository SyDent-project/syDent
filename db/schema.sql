


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_bridge_devices_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('sydent.bridge', true) = '1' THEN RETURN NEW; END IF;
  NEW.key_hash := OLD.key_hash; NEW.owner_id := OLD.owner_id; NEW.created_at := OLD.created_at;
  NEW.last_seen_at := OLD.last_seen_at; NEW.version := OLD.version; NEW.mode := OLD.mode;
  IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."_bridge_devices_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_intake_clinic_open"("p_clinic" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."_intake_clinic_open"("p_clinic" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_login_resolve_bump"("p_bucket" "text", "p_limit" integer, "p_window" interval) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.login_resolve_hits (bucket, window_start, hits)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET hits         = CASE WHEN login_resolve_hits.window_start < now() - p_window THEN 1 ELSE login_resolve_hits.hits + 1 END,
        window_start = CASE WHEN login_resolve_hits.window_start < now() - p_window THEN now() ELSE login_resolve_hits.window_start END
  RETURNING hits INTO v_hits;
  IF v_hits > p_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', HINT = 'too many login lookups; retry in a few minutes';
  END IF;
  IF random() < 0.02 THEN
    DELETE FROM public.login_resolve_hits WHERE window_start < now() - interval '1 hour';
  END IF;
END $$;


ALTER FUNCTION "public"."_login_resolve_bump"("p_bucket" "text", "p_limit" integer, "p_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_patient_documents_share_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.portal_shared AND (TG_OP = 'INSERT' OR OLD.portal_shared IS DISTINCT FROM true) THEN NEW.portal_shared_at := now();
  ELSIF NOT NEW.portal_shared THEN NEW.portal_shared_at := NULL;
  ELSE NEW.portal_shared_at := OLD.portal_shared_at; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."_patient_documents_share_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pf_cap_bytes"("p_uid" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_uid) THEN NULL
              WHEN jsonb_typeof(sp.entitlements->'storage_mb') = 'number' AND (sp.entitlements->>'storage_mb')::numeric > 0
              THEN floor((sp.entitlements->>'storage_mb')::numeric * 1048576)::bigint
              ELSE NULL END
    FROM (SELECT 1) AS one
    LEFT JOIN public.trial_requests tr ON tr.user_id = p_uid
    LEFT JOIN public.subscription_plans sp ON sp.code = COALESCE(tr.plan, 'trial');
$$;


ALTER FUNCTION "public"."_pf_cap_bytes"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pf_used_bytes"("p_uid" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0)::bigint
    FROM storage.objects o
   WHERE o.bucket_id = 'patient-files'
     AND o.name LIKE (p_uid::text || '/%')
     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false;
$$;


ALTER FUNCTION "public"."_pf_used_bytes"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_portal_free_slots"("p_owner" "uuid", "p_appt" "uuid", "p_dur" integer, "p_from" "date", "p_to" "date") RETURNS TABLE("d" "date", "t" time without time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  WITH info AS (SELECT * FROM public.booking_clinic_info(p_owner)),
  wd AS (SELECT ARRAY(SELECT btrim(x)::int FROM info i, unnest(string_to_array(COALESCE(i.work_days, ''), ',')) x
                       WHERE btrim(x) ~ '^[0-6]$') AS days),
  days AS (
    SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') g, wd
     WHERE EXTRACT(DOW FROM g)::int = ANY (wd.days)
  ),
  slots AS (
    SELECT dd.d, (i.work_start + (n * i.slot_minutes) * interval '1 minute')::time AS t
      FROM days dd CROSS JOIN info i
      CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60 / i.slot_minutes)::int - 1)) AS n
  ),
  fits AS (
    SELECT s.d, s.t FROM slots s CROSS JOIN info i
     WHERE s.t::interval + make_interval(mins => p_dur) <= i.work_end::interval
       AND ((s.d + s.t) AT TIME ZONE 'Asia/Damascus') > now() + interval '2 hours'
  ),
  busy AS (
    SELECT a.date AS d, a.time AS t, COALESCE(a.duration, 30) AS dur FROM public.appointments a
     WHERE a.doctor_id = p_owner AND a.id <> p_appt AND a.is_planned IS NOT TRUE AND a.date BETWEEN p_from AND p_to
       AND a.time IS NOT NULL AND COALESCE(a.status, 'pending') NOT IN ('cancelled', 'broken', 'no_show')
    UNION ALL
    SELECT br.requested_date, br.requested_time, COALESCE(br.duration, 30) FROM public.booking_requests br
     WHERE br.clinic_id = p_owner AND br.status = 'pending' AND br.requested_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT r.requested_date, r.requested_time, COALESCE(x.duration, 30) FROM public.portal_requests r
      LEFT JOIN public.appointments x ON x.id = r.appointment_id
     WHERE r.owner_id = p_owner AND r.status = 'new' AND r.applied = false AND r.kind = 'change'
       AND r.requested_date BETWEEN p_from AND p_to AND r.requested_time IS NOT NULL
       AND r.appointment_id IS DISTINCT FROM p_appt
    UNION ALL
    SELECT b.d, b.t, b.dur FROM public.booking_blocked_slots(p_owner, p_from, p_to) b
  )
  SELECT f.d, f.t FROM fits f
   WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.d = f.d AND b.t IS NOT NULL
                       AND b.t::interval < f.t::interval + make_interval(mins => p_dur)
                       AND f.t::interval < b.t::interval + make_interval(mins => b.dur))
     AND NOT EXISTS (SELECT 1 FROM public.appointments c WHERE c.id = p_appt AND c.date = f.d AND c.time = f.t)
   ORDER BY 1, 2;
$_$;


ALTER FUNCTION "public"."_portal_free_slots"("p_owner" "uuid", "p_appt" "uuid", "p_dur" integer, "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_portal_requests_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.portal_requests
     SET status = 'handled', handled_at = now()
   WHERE appointment_id = NEW.id AND owner_id = NEW.doctor_id AND status = 'new' AND applied = false;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_portal_requests_close"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sub_guard_table"("p_table" "regclass", "p_read_open" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_select ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_delete ON %s', p_table);
  IF NOT p_read_open THEN
    EXECUTE format('CREATE POLICY sub_gate_select ON %s AS RESTRICTIVE FOR SELECT TO authenticated '
                || 'USING ((SELECT public.my_access_level()) <> ''none'')', p_table);
  END IF;
  EXECUTE format('CREATE POLICY sub_gate_insert ON %s AS RESTRICTIVE FOR INSERT TO authenticated '
              || 'WITH CHECK ((SELECT public.my_access_level()) = ''full'')', p_table);
  EXECUTE format('CREATE POLICY sub_gate_update ON %s AS RESTRICTIVE FOR UPDATE TO authenticated '
              || 'USING ((SELECT public.my_access_level()) = ''full'') '
              || 'WITH CHECK ((SELECT public.my_access_level()) = ''full'')', p_table);
  EXECUTE format('CREATE POLICY sub_gate_delete ON %s AS RESTRICTIVE FOR DELETE TO authenticated '
              || 'USING ((SELECT public.my_access_level()) = ''full'')', p_table);
END;
$$;


ALTER FUNCTION "public"."_sub_guard_table"("p_table" "regclass", "p_read_open" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_account_wipe"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.trial_requests SET wipe_started_at = v_now WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_account' USING ERRCODE = '42501';
  END IF;
  RETURN v_now;
END;
$$;


ALTER FUNCTION "public"."begin_account_wipe"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("d" "date", "t" time without time zone, "dur" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH info AS (SELECT * FROM public.booking_clinic_info(p_clinic)),
  days AS (
    SELECT g.d::date AS d FROM info i
    CROSS JOIN LATERAL generate_series(p_from, p_to, interval '1 day') AS g(d)
  ),
  slots AS (
    SELECT dd.d, (i.work_start + (n * i.slot_minutes) * interval '1 minute')::time AS t, i.slot_minutes AS dur
    FROM days dd CROSS JOIN info i
    CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60 / i.slot_minutes)::int - 1)) AS n
  ),
  inst AS (
    SELECT dd.d, b.operatory_id, b.provider_id,
           COALESCE(b.start_time, '00:00'::time) AS s,
           CASE WHEN b.end_time IS NULL THEN '24:00'::interval ELSE b.end_time::interval END AS e
    FROM public.schedule_blocks b
    JOIN days dd ON dd.d >= b.date_from AND (b.date_to IS NULL OR dd.d <= b.date_to)
    WHERE b.doctor_id = p_clinic AND b.blocks_scheduling
      AND (b.weekdays IS NULL OR EXTRACT(DOW FROM dd.d)::smallint = ANY (b.weekdays))
  ),
  provs AS (SELECT id FROM public.clinic_doctors WHERE owner_id = p_clinic AND is_active IS NOT FALSE),
  ops   AS (SELECT id FROM public.operatories  WHERE doctor_id = p_clinic AND is_active IS NOT FALSE)
  SELECT s.d, s.t, s.dur
  FROM slots s
  WHERE
    EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id IS NULL AND i.provider_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)
    OR ((SELECT count(*) FROM provs) > 0 AND NOT EXISTS (
          SELECT 1 FROM provs p WHERE NOT EXISTS (
            SELECT 1 FROM inst i WHERE i.d = s.d AND i.provider_id = p.id AND i.operatory_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)))
    OR ((SELECT count(*) FROM ops) > 0 AND NOT EXISTS (
          SELECT 1 FROM ops o WHERE NOT EXISTS (
            SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id = o.id AND i.provider_id IS NULL
              AND i.s::interval < s.t::interval + (s.dur * interval '1 minute') AND s.t::interval < i.e)));
$$;


ALTER FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("d" "date", "t" time without time zone, "dur" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_max INTEGER;
BEGIN
  SELECT i.max_days_ahead INTO v_max
  FROM public.booking_clinic_info(p_clinic) i;
  IF v_max IS NULL THEN RETURN; END IF;
  v_max := LEAST(GREATEST(v_max, 1), 365);

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from
     OR (p_to - p_from) > v_max THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.date, a.time, COALESCE(a.duration, 30)
  FROM public.appointments a
  WHERE a.doctor_id = p_clinic
    AND a.is_planned IS NOT TRUE
    AND a.date BETWEEN p_from AND p_to
    AND a.time IS NOT NULL
    AND a.status NOT IN ('cancelled','broken','no_show')
  UNION ALL
  SELECT br.requested_date, br.requested_time, br.duration
  FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.status = 'pending'
    AND br.requested_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT bs.d, bs.t, bs.dur
  FROM public.booking_blocked_slots(p_clinic, p_from, p_to) bs;
END; $$;


ALTER FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") RETURNS TABLE("clinic_name" "text", "clinic_phone" "text", "slot_minutes" integer, "work_days" "text", "work_start" time without time zone, "work_end" time without time zone, "max_days_ahead" integer, "booking_note" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status  TEXT;
  v_plan    TEXT;
  v_allowed BOOLEAN;
BEGIN
  -- account gate: mirrors ensureAccountAccessible (fail-open on missing row)
  SELECT tr.status, tr.plan INTO v_status, v_plan FROM public.trial_requests tr
  WHERE tr.user_id = p_clinic LIMIT 1;
  IF v_status IN ('new','rejected','suspended') THEN RETURN; END IF;
  -- M141: subscription gate — expired (trial or paid) / missing row ⇒ booking closed.
  IF public.tenant_access_level(p_clinic) <> 'full' THEN RETURN; END IF;

  -- Migration 83 — per-plan module gate (server twin of SyDentPlan.can('booking')):
  -- blocked ONLY when the plan's entitlements JSONB carries an explicit
  -- booking=false. Everything else is fail-open (grandfather), matching the
  -- client contract exactly. v_allowed stays NULL when the plan row is
  -- missing → `IS FALSE` is false → allowed.
  IF v_plan IS NOT NULL THEN
    SELECT (COALESCE(sp.entitlements->>'booking', 'true') <> 'false')
      INTO v_allowed
      FROM public.subscription_plans sp
     WHERE sp.code = v_plan;
    IF v_allowed IS FALSE THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT cs.clinic_name, cs.clinic_phone, cs.booking_slot_minutes,
         cs.booking_work_days, cs.booking_work_start, cs.booking_work_end,
         cs.booking_max_days_ahead, cs.booking_note
  FROM public.clinic_settings cs
  WHERE cs.owner_id = p_clinic
    AND cs.booking_enabled = true
    -- Δ5 hardening: insane slot config (e.g. 0 → division by zero in the
    -- grid check) renders the clinic unavailable rather than erroring.
    AND cs.booking_slot_minutes BETWEEN 10 AND 240;
END; $$;


ALTER FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_info    RECORD;
  v_now_dam TIMESTAMP;
  v_phone   TEXT;
  v_name    TEXT;
  v_days    INT[];
  v_new_id  UUID;
BEGIN
  SELECT * INTO v_info FROM public.booking_clinic_info(p_clinic);
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_disabled'; END IF;

  v_name  := btrim(COALESCE(p_name, ''));
  -- M184 (v622): Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Latin before stripping; an Arabic keyboard's default
  -- digits were stripped as non-digits ⇒ bad_phone, so the patient could not book.
  v_phone := regexp_replace(translate(COALESCE(p_phone,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g');
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'bad_name'; END IF;
  IF v_phone !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'bad_phone'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 300 THEN RAISE EXCEPTION 'bad_note'; END IF;
  IF p_date IS NULL OR p_time IS NULL THEN RAISE EXCEPTION 'bad_slot'; END IF;

  SELECT br.id INTO v_new_id FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.phone = v_phone
    AND br.requested_date = p_date AND br.requested_time = p_time
    AND br.status = 'pending' LIMIT 1;
  IF v_new_id IS NOT NULL THEN RETURN v_new_id; END IF;

  v_now_dam := (now() AT TIME ZONE 'Asia/Damascus');
  IF p_date < v_now_dam::date
     OR p_date > v_now_dam::date + v_info.max_days_ahead THEN
    RAISE EXCEPTION 'date_out_of_range';
  END IF;
  IF p_date = v_now_dam::date AND p_time <= v_now_dam::time THEN
    RAISE EXCEPTION 'past_time';
  END IF;

  v_days := string_to_array(regexp_replace(v_info.work_days, '\s', '', 'g'), ',')::int[];
  IF NOT (EXTRACT(DOW FROM p_date)::int = ANY (v_days)) THEN
    RAISE EXCEPTION 'closed_day';
  END IF;
  IF p_time < v_info.work_start OR p_time >= v_info.work_end THEN
    RAISE EXCEPTION 'outside_hours';
  END IF;
  IF (v_info.work_end - p_time) < make_interval(mins => v_info.slot_minutes) THEN
    RAISE EXCEPTION 'outside_hours';
  END IF;
  IF (EXTRACT(EPOCH FROM (p_time - v_info.work_start))::int
      % (v_info.slot_minutes * 60)) <> 0 THEN
    RAISE EXCEPTION 'off_grid';
  END IF;

  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic AND br.phone = v_phone
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 3 THEN
    RAISE EXCEPTION 'rate_phone';
  END IF;
  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 40 THEN
    RAISE EXCEPTION 'rate_clinic';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.doctor_id = p_clinic
      AND a.is_planned IS NOT TRUE
      AND a.date = p_date AND a.time IS NOT NULL
      AND a.status NOT IN ('cancelled','broken','no_show')
      AND a.time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < a.time + make_interval(mins => COALESCE(a.duration, 30))
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_requests br
    WHERE br.clinic_id = p_clinic AND br.status = 'pending'
      AND br.requested_date = p_date
      AND br.requested_time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < br.requested_time + make_interval(mins => br.duration)
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_blocked_slots(p_clinic, p_date, p_date) bs
    WHERE bs.d = p_date
      AND bs.t < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < bs.t + make_interval(mins => bs.dur)
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  BEGIN
    INSERT INTO public.booking_requests
      (clinic_id, patient_name, phone, requested_date, requested_time, duration, note)
    VALUES
      (p_clinic, v_name, v_phone, p_date, p_time, v_info.slot_minutes,
       NULLIF(btrim(COALESCE(p_note,'')), ''))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken';
  END;

  RETURN v_new_id;
END; $_$;


ALTER FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_auth"("p_device" "uuid", "p_key_hash" "text", "p_version" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE v_owner uuid;
BEGIN
  IF p_device IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  PERFORM set_config('sydent.bridge', '1', true);
  UPDATE public.bridge_devices SET last_seen_at = now(), version = COALESCE(left(p_version, 40), version)
   WHERE id = p_device AND key_hash = p_key_hash AND revoked_at IS NULL RETURNING owner_id INTO v_owner;
  RETURN v_owner;
END;
$_$;


ALTER FUNCTION "public"."bridge_auth"("p_device" "uuid", "p_key_hash" "text", "p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_complete"("p_owner" "uuid", "p_device" "uuid", "p_request" "uuid", "p_path" "text", "p_name" "text", "p_mime" "text", "p_size" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_req RECORD; v_doc uuid; v_inbox uuid;
BEGIN
  PERFORM set_config('sydent.bridge', '1', true);
  IF public.tenant_access_level(p_owner) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  IF p_path IS NULL OR p_path NOT LIKE (p_owner::text || '/%') THEN RETURN jsonb_build_object('ok', false, 'reason', 'path'); END IF;
  IF p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/dicom') THEN RETURN jsonb_build_object('ok', false, 'reason', 'type'); END IF;
  IF p_request IS NOT NULL THEN
    SELECT * INTO v_req FROM public.capture_requests WHERE id = p_request AND owner_id = p_owner AND status = 'open' FOR UPDATE;
    IF FOUND AND p_path LIKE (p_owner::text || '/' || v_req.patient_id::text || '/%') THEN
      INSERT INTO public.patient_documents(owner_id, patient_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by,
                                           teeth, xray_type, taken_at, source, session_id, note)
        VALUES (p_owner, v_req.patient_id, p_path, left(COALESCE(p_name, 'capture'), 200), p_mime, p_size, v_req.category, p_owner,
                v_req.teeth, v_req.xray_type, (now() AT TIME ZONE 'Asia/Damascus')::date, 'clinic', v_req.session_id, 'التقاطٌ من الجهاز (SyDent Bridge)')
        RETURNING id INTO v_doc;
      UPDATE public.capture_requests SET status = 'done', done_at = now(), document_id = v_doc, device_id = COALESCE(device_id, p_device) WHERE id = v_req.id;
      RETURN jsonb_build_object('ok', true, 'document_id', v_doc, 'patient_id', v_req.patient_id);
    END IF;
  END IF;
  IF p_path NOT LIKE (p_owner::text || '/_inbox/%') THEN RETURN jsonb_build_object('ok', false, 'reason', 'path'); END IF;
  INSERT INTO public.bridge_inbox(owner_id, device_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (p_owner, p_device, p_path, left(COALESCE(p_name, 'capture'), 200), p_mime, p_size) RETURNING id INTO v_inbox;
  RETURN jsonb_build_object('ok', true, 'inbox_id', v_inbox);
END;
$$;


ALTER FUNCTION "public"."bridge_complete"("p_owner" "uuid", "p_device" "uuid", "p_request" "uuid", "p_path" "text", "p_name" "text", "p_mime" "text", "p_size" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_open_requests"("p_owner" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM set_config('sydent.bridge', '1', true);
  UPDATE public.capture_requests SET status = 'expired' WHERE owner_id = p_owner AND status = 'open' AND expires_at < now();
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'patient_id', r.patient_id, 'patient_name', p.name, 'teeth', to_jsonb(r.teeth),
                                   'category', r.category, 'xray_type', r.xray_type, 'device_id', r.device_id, 'created_at', r.created_at, 'expires_at', r.expires_at)
                                   ORDER BY r.created_at)
                     FROM public.capture_requests r JOIN public.patients p ON p.id = r.patient_id
                    WHERE r.owner_id = p_owner AND r.status = 'open'), '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."bridge_open_requests"("p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_pair"("p_code" "text", "p_key_hash" "text", "p_version" "text", "p_mode" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE v RECORD; v_id uuid;
BEGIN
  IF p_code IS NULL OR upper(p_code) !~ '^[A-HJ-NP-Z2-9]{8}$' OR p_key_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_code'); END IF;
  SELECT * INTO v FROM public.bridge_pairings WHERE code = upper(p_code) FOR UPDATE;
  IF NOT FOUND OR v.used_at IS NOT NULL OR v.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_code'); END IF;
  IF public.tenant_access_level(v.owner_id) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  INSERT INTO public.bridge_devices(owner_id, name, key_hash, version, mode)
    VALUES (v.owner_id, v.device_name, p_key_hash, left(p_version, 40), CASE WHEN p_mode IN ('folder','twain','dicom','manual') THEN p_mode ELSE 'folder' END)
    RETURNING id INTO v_id;
  UPDATE public.bridge_pairings SET used_at = now() WHERE code = v.code;
  RETURN jsonb_build_object('ok', true, 'device_id', v_id, 'owner_id', v.owner_id, 'device_name', v.device_name);
END;
$_$;


ALTER FUNCTION "public"."bridge_pair"("p_code" "text", "p_key_hash" "text", "p_version" "text", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_pairing_code"("p_device_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_code text; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; v_name text; v_exp timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF public.tenant_access_level(v_uid) <> 'full' THEN RAISE EXCEPTION 'subscription_read_only' USING ERRCODE = '42501'; END IF;
  v_name := left(btrim(COALESCE(p_device_name, '')), 80);
  IF v_name = '' THEN v_name := 'كمبيوتر العيادة'; END IF;
  DELETE FROM public.bridge_pairings WHERE owner_id = v_uid;
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bridge_pairings WHERE code = v_code);
  END LOOP;
  INSERT INTO public.bridge_pairings(code, owner_id, device_name) VALUES (v_code, v_uid, v_name) RETURNING expires_at INTO v_exp;
  RETURN jsonb_build_object('code', v_code, 'expires_at', v_exp, 'device_name', v_name);
END;
$$;


ALTER FUNCTION "public"."bridge_pairing_code"("p_device_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bridge_upload_path"("p_owner" "uuid", "p_request" "uuid", "p_mime" "text", "p_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_req RECORD; v_used bigint; v_cap bigint; v_clean text;
BEGIN
  IF public.tenant_access_level(p_owner) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  IF p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/dicom') THEN RETURN jsonb_build_object('ok', false, 'reason', 'type'); END IF;
  v_used := public._pf_used_bytes(p_owner); v_cap := public._pf_cap_bytes(p_owner);
  IF v_cap IS NOT NULL AND v_used >= v_cap THEN RETURN jsonb_build_object('ok', false, 'reason', 'quota'); END IF;
  v_clean := regexp_replace(COALESCE(p_name, 'capture'), '[^A-Za-z0-9._-]+', '-', 'g');
  v_clean := left(btrim(v_clean, '-.'), 80); IF v_clean = '' THEN v_clean := 'capture'; END IF;
  IF p_request IS NOT NULL THEN
    SELECT * INTO v_req FROM public.capture_requests WHERE id = p_request AND owner_id = p_owner AND status = 'open' AND expires_at >= now();
    IF FOUND THEN RETURN jsonb_build_object('ok', true, 'path', p_owner::text || '/' || v_req.patient_id::text || '/' || gen_random_uuid()::text || '-' || v_clean, 'request_id', v_req.id); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'path', p_owner::text || '/_inbox/' || gen_random_uuid()::text || '-' || v_clean, 'request_id', NULL);
END;
$$;


ALTER FUNCTION "public"."bridge_upload_path"("p_owner" "uuid", "p_request" "uuid", "p_mime" "text", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_requests_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.teeth := ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(NEW.teeth, '{}'::text[])) AS t WHERE t IS NOT NULL AND t <> '' ORDER BY t);
  IF NEW.category <> 'xray' THEN NEW.xray_type := NULL; END IF;
  IF TG_OP = 'INSERT' OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'capture_requests: patient not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.session_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.session_id IS DISTINCT FROM OLD.session_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id AND s.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'capture_requests: session not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.device_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.device_id IS DISTINCT FROM OLD.device_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.bridge_devices d WHERE d.id = NEW.device_id AND d.owner_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'capture_requests: device not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND current_setting('sydent.bridge', true) IS DISTINCT FROM '1' THEN
    IF TG_OP = 'INSERT' THEN NEW.status := 'open'; NEW.done_at := NULL; NEW.document_id := NULL; NEW.created_at := now(); NEW.expires_at := now() + interval '15 minutes';
    ELSE
      IF NEW.status NOT IN ('open', 'cancelled') OR OLD.status <> 'open' THEN NEW.status := OLD.status; END IF;
      NEW.done_at := OLD.done_at; NEW.document_id := OLD.document_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."capture_requests_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- حذف auth.user للمستخدم الحالي
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_audit_alerts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_price NUMERIC;
  v_new_price NUMERIC;
  v_pct_change NUMERIC;
  v_recent_count INT;
  v_payment_age_minutes NUMERIC;
  v_original_creation TIMESTAMPTZ;
  v_is_owner BOOLEAN := COALESCE(NEW.employee_role_snapshot, 'owner') = 'owner';
BEGIN
  IF NOT v_is_owner AND NEW.action_type = 'payment.delete' AND NEW.old_value IS NOT NULL THEN
    BEGIN
      v_original_creation := (NEW.old_value->>'created_at')::TIMESTAMPTZ;
      IF v_original_creation IS NOT NULL THEN
        v_payment_age_minutes := EXTRACT(EPOCH FROM (now() - v_original_creation)) / 60;
        IF v_payment_age_minutes < 60 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := 'حذف دفعة بعد ' || ROUND(v_payment_age_minutes)::TEXT
                              || ' دقيقة فقط من إنشائها';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NOT v_is_owner AND NEW.action_type = 'session.edit_price'
     AND NEW.old_value IS NOT NULL AND NEW.new_value IS NOT NULL THEN
    BEGIN
      v_old_price := (NEW.old_value->>'cost')::NUMERIC;
      v_new_price := (NEW.new_value->>'cost')::NUMERIC;
      IF v_old_price IS NOT NULL AND v_old_price > 0 AND v_new_price IS NOT NULL THEN
        v_pct_change := ABS(v_new_price - v_old_price) / v_old_price * 100;
        IF v_pct_change >= 50 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                              || 'تعديل سعر بنسبة ' || ROUND(v_pct_change)::TEXT || '%';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NOT v_is_owner AND NEW.patient_id IS NOT NULL AND NEW.employee_id IS NOT NULL
     AND (NEW.action_type LIKE '%.delete' OR NEW.action_type LIKE '%.edit%') THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.audit_log
    WHERE owner_id = NEW.owner_id
      AND employee_id = NEW.employee_id
      AND patient_id = NEW.patient_id
      AND (action_type LIKE '%.delete' OR action_type LIKE '%.edit%')
      AND created_at >= date_trunc('day', now())
      AND created_at < NEW.created_at;
    IF v_recent_count >= 4 AND NOT EXISTS (
         SELECT 1 FROM public.audit_log
          WHERE owner_id = NEW.owner_id AND employee_id = NEW.employee_id AND patient_id = NEW.patient_id
            AND is_alert AND alert_reason LIKE '%تعديلات أو أكثر من نفس الموظف%'
            AND created_at >= date_trunc('day', now())) THEN
      NEW.is_alert := TRUE;
      NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                          || '5 تعديلات أو أكثر من نفس الموظف على نفس المريض اليوم';
    END IF;
  END IF;

  IF NEW.action_type IN ('payment.delete', 'session.delete')
     AND NEW.employee_role_snapshot IN ('doctor', 'secretary') THEN
    NEW.is_alert := TRUE;
    IF NEW.alert_reason IS NULL THEN
      NEW.alert_reason :=
        (CASE WHEN NEW.action_type = 'payment.delete' THEN 'حذف دفعة' ELSE 'حذف جلسة' END)
        || ' بواسطة '
        || (CASE NEW.employee_role_snapshot
              WHEN 'doctor'    THEN 'الطبيب'
              WHEN 'secretary' THEN 'السكرتيرة'
              ELSE 'موظف'
            END);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."detect_audit_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_clinical_provider_type"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only enforce when provider_type is explicitly non-clinical.
  -- NULL/legacy values are allowed (treated as 'doctor' by frontend).
  IF NEW.provider_type IN ('secretary', 'other') THEN
    RAISE EXCEPTION
      'clinic_doctors is for CLINICAL staff only (doctor/hygienist/assistant). '
      'Cannot insert row with provider_type=%. '
      'Use clinic_employees for non-clinical staff.', NEW.provider_type
      USING
        HINT = 'Phase 7.2 (Migration 19): secretary + other roles live in clinic_employees, not clinic_doctors',
        ERRCODE = '23514';  -- check_violation — matches frontend graceful fallback handlers
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_clinical_provider_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_employee_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan text; v_limit integer; v_count integer;
  new_counts boolean; old_counts boolean;
BEGIN
  new_counts := (NEW.is_active IS NOT FALSE) AND (COALESCE(NEW.role, '') <> 'owner');
  IF NOT new_counts THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    old_counts := (OLD.is_active IS NOT FALSE) AND (COALESCE(OLD.role, '') <> 'owner');
    IF old_counts THEN RETURN NEW; END IF;
  END IF;

  SELECT plan INTO v_plan FROM trial_requests WHERE user_id = NEW.owner_id LIMIT 1;
  IF v_plan IS NULL THEN RETURN NEW; END IF;
  SELECT max_employees INTO v_limit FROM subscription_plans WHERE code = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count FROM clinic_employees
  WHERE owner_id = NEW.owner_id AND is_active IS NOT FALSE
    AND COALESCE(role, '') <> 'owner' AND id <> NEW.id;
  v_count := v_count + 1;

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EMPLOYEES: reached plan limit of % employees', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."enforce_employee_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_patient_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_plan text; v_limit integer; v_count integer;
BEGIN
  SELECT plan INTO v_plan FROM trial_requests WHERE user_id = NEW.doctor_id LIMIT 1;
  IF v_plan IS NULL THEN RETURN NEW; END IF;
  SELECT max_patients INTO v_limit FROM subscription_plans WHERE code = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM patients WHERE doctor_id = NEW.doctor_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_PATIENTS: reached plan limit of % patients', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."enforce_patient_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_teeth_status_dx"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'condition' THEN
    NEW.dx_key := NULL;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'condition'
        AND OLD.treatment_key LIKE 'cond-%'
        AND NEW.treatment_key IS DISTINCT FROM OLD.treatment_key
        AND NEW.dx_key IS NULL THEN
    NEW.dx_key := OLD.surface || ':' || OLD.treatment_key;
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_teeth_status_dx"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_teeth_status_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.doctor_id) THEN
      RETURN OLD;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (OLD.doctor_id, OLD.patient_id, OLD.tooth_num, OLD.surface, OLD.treatment_key, OLD.status, OLD.provider_id, OLD.review_at, OLD.dx_key, 'D');
    RETURN OLD;
  ELSE
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (NEW.doctor_id, NEW.patient_id, NEW.tooth_num, NEW.surface, NEW.treatment_key, NEW.status, NEW.provider_id, NEW.review_at, NEW.dx_key,
       CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
  END IF;
END; $$;


ALTER FUNCTION "public"."fn_teeth_status_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_doctor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- إنشاء صف الدكتور
  INSERT INTO public.doctors (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- زرع الكتالوج المرجعي (29 علاجاً · كل الأسعار 0)
  -- CATALOG-PARITY-START
  INSERT INTO public.treatments
    (doctor_id, treatment_key, name, label, fill, stroke, price, builtin, needs_lab,
     target_part, category, sort_order, post_extraction, is_favorite, is_active, layman_name, dentition_scope)
  VALUES
    (NEW.id, 'treated', 'حشوة املغم', 'ح', '#312f27', '#22211b', 0, true, false, 'crown', 'restorative', 1, false, true, true, 'حشوة معدنية', 'all'),
    (NEW.id, 'custom_1781292854422', 'حشوة كومبوزت', 'ح', '#0f6b99', '#0b4b6b', 0, false, false, 'crown', 'restorative', 2, false, true, true, 'حشوة تجميلية', 'all'),
    (NEW.id, 'root-canal', 'معالجة لبية', 'ق', '#a78bfa', '#7c5cbf', 0, true, false, 'root', 'endodontics', 3, false, true, true, 'سحب عصب', 'all'),
    (NEW.id, 'custom_1784310641369', 'حشوة عصب', 'ح', '#ff4d6a', '#b3364a', 0, false, false, 'root', 'endodontics', 4, false, true, true, '', 'all'),
    (NEW.id, 'custom_1783204794478', 'اعادة معالجة', 'ا', '#00f2a1', '#00a971', 0, false, false, 'root', 'endodontics', 5, false, true, true, '', 'all'),
    (NEW.id, 'custom_1783255139568', 'وتد فايبر', 'و', '#999999', '#6b6b6b', 0, false, false, 'root', 'endodontics', 6, false, true, true, '', 'all'),
    (NEW.id, 'custom_1784742823602', 'تحضير', 'ت', '#218800', '#175f00', 0, false, true, 'crown_full', 'prosthodontics', 7, false, true, true, 'تحضير الاسنان للتلبيس', 'all'),
    (NEW.id, 'crown', 'تاج خزف على معدن', 'ت', '#ff6b00', '#b34b00', 0, true, true, 'crown_full', 'prosthodontics', 8, false, true, true, 'تاج خزف', 'all'),
    (NEW.id, 'custom_1784821896689', 'تاج زركون', 'ت', '#e5e5f4', '#a0a0ab', 0, false, true, 'crown_full', 'prosthodontics', 9, false, true, true, 'تاج زركونيا', 'all'),
    (NEW.id, 'bridge', 'جسر', 'ج', '#dc2626', '#991b1b', 0, true, true, 'bridge', 'prosthodontics', 10, false, true, true, '', 'all'),
    (NEW.id, 'custom_1784316215415', 'جسر (زركون)', 'ج', '#c44dff', '#8936b3', 0, false, true, 'bridge', 'prosth_cosmetic', 11, false, true, true, '', 'all'),
    (NEW.id, 'extracted', 'قلع', '✕', '#ef5350', '#c62828', 0, true, false, 'extraction', 'surgical', 12, false, true, true, '', 'all'),
    (NEW.id, 'implant', 'زراعة', 'ز', '#b5e0ff', '#7f9db3', 0, true, true, 'implant', 'implantology', 13, false, false, true, '', 'all'),
    (NEW.id, 'socket-graft', 'طعم عظمي (حفاظ سنخ)', 'ط', '#f97316', '#c2410c', 0, false, false, 'whole', 'surgical', 14, true, false, true, '', 'all'),
    (NEW.id, 'socket-dressing', 'ضماد سنخ', 'ض', '#fbbf24', '#b45309', 0, false, false, 'whole', 'surgical', 15, true, false, true, '', 'all'),
    (NEW.id, 'ortho-fixed', 'تقويم ثابت', '⚓', '#f25100', '#a93900', 0, false, true, 'arch', 'orthodontics', 16, false, false, true, '', 'all'),
    (NEW.id, 'ortho-removable', 'تقويم متحرك', '⚙', '#22d3ee', '#0e90a8', 0, false, true, 'arch', 'orthodontics', 17, false, false, true, '', 'all'),
    (NEW.id, 'ortho-retainer', 'مثبّت تقويم', 'ث', '#5eead4', '#2bb3a3', 0, false, true, 'arch', 'orthodontics', 18, false, false, true, '', 'all'),
    (NEW.id, 'cleaning', 'تنظيف', 'ن', '#06b6d4', '#0a809a', 0, false, false, 'mouth', 'preventive', 19, false, false, true, '', 'all'),
    (NEW.id, 'consult', 'استشارة', 'س', '#fb923c', '#c2691f', 0, false, false, 'mouth', 'diagnostic', 20, false, false, true, '', 'all'),
    (NEW.id, 'xray', 'أشعة', 'أ', '#a3a3a3', '#6b6b6b', 0, false, false, 'whole', 'diagnostic', 21, false, false, true, '', 'all'),
    (NEW.id, 'whitening', 'تبييض', 'ب', '#84cc16', '#5a9410', 0, false, false, 'arch', 'cosmetic', 22, false, false, true, '', 'all'),
    (NEW.id, 'perio-scaling', 'تقليح', 'ت', '#f2f200', '#a9a900', 0, false, false, 'mouth', 'periodontics', 23, false, false, true, '', 'all'),
    (NEW.id, 'pedo-spacer', 'حافظ مسافة', 'م', '#d946ef', '#86198f', 0, false, true, 'arch', 'pediatric', 24, false, false, true, '', 'all'),
    (NEW.id, 'pedo-pulpotomy', 'بتر لب', 'ب', '#f472b6', '#be185d', 0, false, false, 'whole', 'pediatric', 25, false, false, true, 'علاج عصب السن اللبني', 'primary'),
    (NEW.id, 'pedo-pulpectomy', 'استئصال لب لبني', 'ا', '#be185d', '#831843', 0, false, false, 'root', 'pediatric', 26, false, false, true, 'سحب عصب السن اللبني', 'primary'),
    (NEW.id, 'pedo-ssc', 'تاج ستانلس ستيل', 'ت', '#94a3b8', '#475569', 0, false, false, 'crown_full', 'pediatric', 27, false, false, true, 'تاج معدني جاهز', 'primary'),
    (NEW.id, 'fissure-sealant', 'سادّ شقوق', 'س', '#2563eb', '#1e40af', 0, false, false, 'crown', 'preventive', 28, false, false, true, 'طبقة حماية من التسوّس', 'all'),
    (NEW.id, 'fluoride', 'تطبيق فلورايد', 'ف', '#0ea5e9', '#0369a1', 0, false, false, 'mouth', 'preventive', 29, false, false, true, '', 'all')
  ON CONFLICT (doctor_id, treatment_key) DO NOTHING;
  -- CATALOG-PARITY-END

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- نسجّل الخطأ لكن لا نمنع التسجيل
  RAISE WARNING 'handle_new_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_doctor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_owner_doctor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.clinic_doctors
    (owner_id, user_id, name, role, color, is_owner, is_active)
  SELECT
    NEW.id,
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'الطبيب الرئيسي'
    ),
    'طبيب أسنان',
    'var(--green)',
    true,
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_doctors
    WHERE owner_id = NEW.id AND is_owner = true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_owner_doctor error: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_owner_doctor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."intake_info"("p_token" "text") RETURNS TABLE("clinic_name" "text", "clinic_phone" "text", "patient_name" "text", "patient_dob" "date", "status" "text", "expired" boolean, "submitted_at" timestamp with time zone, "intake_note" "text", "ask_signature" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
END; $_$;


ALTER FUNCTION "public"."intake_info"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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

  v_now_dam := (now() AT TIME ZONE 'Asia/Damascus');
  IF (SELECT count(*) FROM public.patient_intakes i
      WHERE i.owner_id = v.owner_id AND i.submitted_at IS NOT NULL
        AND (i.submitted_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 300 THEN
    RAISE EXCEPTION 'rate_clinic';
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_med
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'med')='array' THEN p_answers->'med' END, '[]'::jsonb)) x
   WHERE x = ANY (v_med);
  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_alg
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'alg')='array' THEN p_answers->'alg' END, '[]'::jsonb)) x
   WHERE x = ANY (v_alg);
  SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO f_ex
    FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p_answers->'extra')='array' THEN p_answers->'extra' END, '[]'::jsonb)) x
   WHERE x = ANY (v_extra);

  IF char_length(COALESCE(p_answers->>'med_other','')) > 500 OR char_length(COALESCE(p_answers->>'alg_other','')) > 300
     OR char_length(COALESCE(p_answers->>'meds','')) > 500 OR char_length(COALESCE(p_answers->>'complaint','')) > 500 THEN
    RAISE EXCEPTION 'bad_answers';
  END IF;

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
END; $_$;


ALTER FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_apply_count"("p_lines" "jsonb", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_count uuid; v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_price numeric; v_cur text; v_var numeric; v_new numeric; v_take numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 500 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'item_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_counts (owner_id, note)
  VALUES (v_uid, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_count;

  FOR r IN
    SELECT (e->>'item_id')::uuid AS item_id, (e->>'seen')::numeric AS seen, (e->>'counted')::numeric AS counted
      FROM jsonb_array_elements(p_lines) e
     ORDER BY 1
  LOOP
    IF r.item_id IS NULL OR r.seen IS NULL OR r.counted IS NULL OR r.counted < 0 OR r.counted > 1000000 OR r.seen < 0 THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.quantity, i.purchase_price, i.currency INTO v_q, v_price, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid AND i.is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;

    v_var := r.counted - r.seen;
    v_new := greatest(v_q + v_var, 0);
    v_var := v_new - v_q;

    IF v_var < 0 THEN
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, -v_var, v_today, false) LOOP
        INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, count_id)
        VALUES (v_uid, r.item_id, -s.took, 'count', 'جرد: نقص', s.batch_id, v_count);
      END LOOP;
      UPDATE public.inventory_items SET quantity = v_new WHERE id = r.item_id;
    ELSIF v_var > 0 THEN
      UPDATE public.inventory_items SET quantity = v_new WHERE id = r.item_id;
      INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, count_id)
      VALUES (v_uid, r.item_id, v_var, 'count', 'جرد: زيادة', v_count);
    END IF;

    INSERT INTO public.inventory_count_lines (owner_id, count_id, item_id, expected, counted, variance, unit_price, currency)
    VALUES (v_uid, v_count, r.item_id, r.seen, r.counted, v_var, v_price, v_cur);
    v_out := v_out || jsonb_build_object('item_id', r.item_id, 'expected', r.seen, 'counted', r.counted,
                                         'variance', v_var, 'quantity', v_new);
  END LOOP;
  RETURN jsonb_build_object('count_id', v_count, 'lines', v_out);
END $$;


ALTER FUNCTION "public"."inventory_apply_count"("p_lines" "jsonb", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_batches_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE v_itemq numeric; v_owner uuid; v_other numeric; v_grow boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.received_qty IS NULL THEN NEW.received_qty := NEW.quantity; END IF;
  v_grow := NOT NEW.is_finished AND (
              TG_OP = 'INSERT'
              OR NEW.item_id IS DISTINCT FROM OLD.item_id
              OR OLD.is_finished
              OR coalesce(NEW.quantity, 0) > coalesce(OLD.quantity, 0));
  IF v_grow THEN
    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id FOR UPDATE;
  ELSE
    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id;
  END IF;
  IF NOT FOUND OR v_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'batch_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF v_grow THEN
    SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_other
      FROM public.inventory_batches x
     WHERE x.item_id = NEW.item_id AND x.is_finished = false AND x.id IS DISTINCT FROM NEW.id;
    IF v_other + coalesce(NEW.quantity, 0) > coalesce(v_itemq, 0) THEN
      RAISE EXCEPTION 'batch_exceeds_stock' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_batches_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_out jsonb := '[]'::jsonb;
  r record; s record;
  v_q numeric; v_active boolean; v_pat uuid; v_prov uuid; v_take numeric; v_bq numeric; v_t numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT (e->>'item_id')::uuid AS item_id,
           (e->>'qty')::numeric AS qty,
           nullif(e->>'session_id', '')::uuid AS session_id,
           nullif(e->>'batch_id', '')::uuid AS batch_id,
           o AS ord
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o)
     ORDER BY 1, 5
  LOOP
    IF r.item_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.quantity, i.is_active INTO v_q, v_active
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;

    v_pat := NULL; v_prov := NULL;
    IF r.session_id IS NOT NULL THEN
      SELECT ls.patient_id, ls.provider_id INTO v_pat, v_prov
        FROM public.ledger_sessions ls WHERE ls.id = r.session_id AND ls.doctor_id = v_uid;
      IF NOT FOUND THEN RAISE EXCEPTION 'session_not_owned' USING ERRCODE = '42501'; END IF;
    END IF;

    IF NOT v_active THEN
      v_out := v_out || jsonb_build_object('item_id', r.item_id, 'session_id', r.session_id,
                 'requested', r.qty, 'deducted', 0, 'remaining', v_q, 'skipped', 'inactive');
      CONTINUE;
    END IF;

    v_take := least(r.qty, greatest(v_q, 0));
    IF v_take > 0 THEN
      v_t := 0;
      IF r.batch_id IS NOT NULL THEN
        SELECT b.quantity INTO v_bq FROM public.inventory_batches b
         WHERE b.id = r.batch_id AND b.item_id = r.item_id AND b.owner_id = v_uid AND b.is_finished = false FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_available' USING ERRCODE = '22023'; END IF;
        v_t := least(v_take, coalesce(v_bq, 0));
        IF v_t > 0 THEN
          UPDATE public.inventory_batches SET quantity = quantity - v_t, is_finished = (quantity - v_t) <= 0 WHERE id = r.batch_id;
          INSERT INTO public.inventory_movements
            (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
          VALUES (v_uid, r.item_id, -v_t, 'consume', coalesce(v_note, 'استهلاك'), r.session_id, v_pat, v_prov, r.batch_id);
        END IF;
      END IF;
      FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, v_take - v_t, v_today, false) LOOP
        INSERT INTO public.inventory_movements
          (owner_id, item_id, change, reason, note, session_id, patient_id, provider_id, batch_id)
        VALUES (v_uid, r.item_id, -s.took, 'consume', coalesce(v_note, 'استهلاك'),
                r.session_id, v_pat, v_prov, s.batch_id);
      END LOOP;
      UPDATE public.inventory_items SET quantity = quantity - v_take WHERE id = r.item_id;
    END IF;
    v_out := v_out || jsonb_build_object('item_id', r.item_id, 'session_id', r.session_id,
               'requested', r.qty, 'deducted', v_take, 'remaining', v_q - v_take);
  END LOOP;
  RETURN jsonb_build_object('lines', v_out);
END $$;


ALTER FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text") IS 'M169: خصمُ موادٍ ذرّي — قفلُ الصنف · FEFO على الدفعات · حركةٌ لكل شريحة بالجلسة والمريض والطبيب والدفعة';



CREATE OR REPLACE FUNCTION "public"."inventory_count_lines_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_counts k WHERE k.id = NEW.count_id AND k.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'count_line_count_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'count_line_item_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_count_lines_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_create_order"("p_supplier" "uuid", "p_note" "text", "p_lines" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid(); v_order uuid; r record; v_price numeric; v_cur text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.inventory_orders (owner_id, supplier_id, note)
  VALUES (v_uid, p_supplier, left(nullif(btrim(coalesce(p_note, '')), ''), 300)) RETURNING id INTO v_order;
  FOR r IN SELECT (e->>'item_id')::uuid AS item_id, (e->>'qty')::numeric AS qty,
                  nullif(e->>'unit_price', '')::numeric AS price
             FROM jsonb_array_elements(p_lines) e ORDER BY 1
  LOOP
    IF r.item_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR (r.price IS NOT NULL AND r.price < 0) THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT i.purchase_price, i.currency INTO v_price, v_cur
      FROM public.inventory_items i WHERE i.id = r.item_id AND i.owner_id = v_uid AND i.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.inventory_order_lines (owner_id, order_id, item_id, qty_ordered, unit_price, currency)
    VALUES (v_uid, v_order, r.item_id, r.qty, coalesce(r.price, v_price), coalesce(v_cur, 'SYP'));
  END LOOP;
  RETURN jsonb_build_object('order_id', v_order);
END $$;


ALTER FUNCTION "public"."inventory_create_order"("p_supplier" "uuid", "p_note" "text", "p_lines" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_fefo_take"("p_item" "uuid", "p_qty" numeric, "p_today" "date", "p_batches_only" boolean DEFAULT false) RETURNS TABLE("batch_id" "uuid", "took" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_need numeric := coalesce(p_qty, 0);
  v_itemq numeric; v_open numeric; v_rem numeric; t numeric; b record;
BEGIN
  IF v_need <= 0 THEN RETURN; END IF;
  SELECT i.quantity INTO v_itemq FROM public.inventory_items i WHERE i.id = p_item;
  SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_open
    FROM public.inventory_batches x WHERE x.item_id = p_item AND x.is_finished = false;
  v_rem := greatest(coalesce(v_itemq, 0) - v_open, 0);

  FOR b IN SELECT x.id, x.quantity FROM public.inventory_batches x
            WHERE x.item_id = p_item AND x.is_finished = false AND coalesce(x.quantity, 0) > 0
              AND (x.expiry_date IS NULL OR x.expiry_date >= p_today)
            ORDER BY x.expiry_date NULLS LAST, x.created_at, x.id
            FOR UPDATE LOOP
    EXIT WHEN v_need <= 0;
    t := least(v_need, b.quantity);
    UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = b.id;
    batch_id := b.id; took := t; RETURN NEXT;
    v_need := v_need - t;
  END LOOP;

  IF v_need > 0 AND NOT p_batches_only AND v_rem > 0 THEN
    t := least(v_need, v_rem);
    batch_id := NULL; took := t; RETURN NEXT;
    v_need := v_need - t;
  END IF;

  FOR b IN SELECT x.id, x.quantity FROM public.inventory_batches x
            WHERE x.item_id = p_item AND x.is_finished = false AND coalesce(x.quantity, 0) > 0
              AND x.expiry_date < p_today
            ORDER BY x.expiry_date, x.created_at, x.id
            FOR UPDATE LOOP
    EXIT WHEN v_need <= 0;
    t := least(v_need, b.quantity);
    UPDATE public.inventory_batches SET quantity = quantity - t, is_finished = (quantity - t) <= 0 WHERE id = b.id;
    batch_id := b.id; took := t; RETURN NEXT;
    v_need := v_need - t;
  END LOOP;

  IF v_need > 0 AND NOT p_batches_only THEN
    batch_id := NULL; took := v_need; RETURN NEXT;
  END IF;
END $$;


ALTER FUNCTION "public"."inventory_fefo_take"("p_item" "uuid", "p_qty" numeric, "p_today" "date", "p_batches_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_finish_batch"("p_batch" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item uuid; v_left numeric; v_exp date; v_fin boolean; v_q numeric; v_out numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  SELECT b.item_id INTO v_item FROM public.inventory_batches b WHERE b.id = p_batch AND b.owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_owned' USING ERRCODE = '42501'; END IF;
  SELECT i.quantity INTO v_q FROM public.inventory_items i WHERE i.id = v_item AND i.owner_id = v_uid FOR UPDATE;
  SELECT coalesce(b.quantity, 0), b.expiry_date, b.is_finished INTO v_left, v_exp, v_fin
    FROM public.inventory_batches b WHERE b.id = p_batch FOR UPDATE;
  IF v_fin THEN RETURN jsonb_build_object('item_id', v_item, 'removed', 0, 'already', true); END IF;
  v_out := least(v_left, greatest(v_q, 0));
  UPDATE public.inventory_batches SET quantity = 0, is_finished = true WHERE id = p_batch;
  IF v_out > 0 THEN
    UPDATE public.inventory_items SET quantity = quantity - v_out WHERE id = v_item;
  END IF;
  INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id)
  VALUES (v_uid, v_item, -v_out, 'adjust',
          '📦 دفعة انتهت' || CASE WHEN v_out > 0 THEN ' — أُخرج متبقّيها من المخزون' ELSE '' END
          || ' (صلاحية ' || coalesce(to_char(v_exp, 'DD/MM/YYYY'), 'بلا تاريخ') || ')',
          p_batch);
  RETURN jsonb_build_object('item_id', v_item, 'removed', v_out, 'already', false);
END $$;


ALTER FUNCTION "public"."inventory_finish_batch"("p_batch" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_items_trim_batches"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE v_open numeric;
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    SELECT coalesce(sum(coalesce(x.quantity, 0)), 0) INTO v_open
      FROM public.inventory_batches x WHERE x.item_id = NEW.id AND x.is_finished = false;
    IF v_open > NEW.quantity THEN
      PERFORM public.inventory_fefo_take(NEW.id, v_open - NEW.quantity,
                                         (now() AT TIME ZONE 'Asia/Damascus')::date, true);
    END IF;
  END IF;
  RETURN NULL;
END $$;


ALTER FUNCTION "public"."inventory_items_trim_batches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_movements_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.session_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_session_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.patient_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_patient_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.provider_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.clinic_doctors c WHERE c.id = NEW.provider_id AND c.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_provider_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_batches b WHERE b.id = NEW.batch_id AND b.owner_id = NEW.owner_id AND b.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'movement_batch_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.count_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_counts k WHERE k.id = NEW.count_id AND k.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_count_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.order_line_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_order_lines l WHERE l.id = NEW.order_line_id AND l.owner_id = NEW.owner_id AND l.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'movement_order_line_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_receipts r WHERE r.id = NEW.receipt_id AND r.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'movement_receipt_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_movements_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_order_lines_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_orders o WHERE o.id = NEW.order_id AND o.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_line_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_line_item_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_order_lines_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_orders_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.inventory_suppliers s WHERE s.id = NEW.supplier_id AND s.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'order_supplier_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_orders_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_receipts_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_orders o WHERE o.id = NEW.order_id AND o.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_syp_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_syp_id AND e.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NEW.expense_usd_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_usd_id AND e.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'receipt_expense_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."inventory_receipts_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_receive"("p_order" "uuid", "p_lines" "jsonb", "p_allow_over" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text; v_sup text; v_receipt uuid; v_batch uuid;
  r record; l record;
  v_price numeric; v_syp numeric := 0; v_usd numeric := 0; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;
  SELECT o.status, s.name INTO v_status, v_sup
    FROM public.inventory_orders o LEFT JOIN public.inventory_suppliers s ON s.id = o.supplier_id
   WHERE o.id = p_order AND o.owner_id = v_uid FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_owned' USING ERRCODE = '42501'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled' USING ERRCODE = '22023'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e->>'line_id') FROM jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'duplicate_line' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_receipts (owner_id, order_id) VALUES (v_uid, p_order) RETURNING id INTO v_receipt;

  FOR r IN SELECT (e->>'line_id')::uuid AS line_id, (e->>'qty')::numeric AS qty,
                  nullif(e->>'expiry', '')::date AS expiry, nullif(e->>'unit_price', '')::numeric AS price,
                  left(nullif(btrim(coalesce(e->>'lot', '')), ''), 60) AS lot
             FROM jsonb_array_elements(p_lines) e
             LEFT JOIN public.inventory_order_lines ol0 ON ol0.id = (e->>'line_id')::uuid
            ORDER BY ol0.item_id NULLS LAST, 1
  LOOP
    IF r.line_id IS NULL OR r.qty IS NULL OR NOT (r.qty > 0) OR r.qty > 1000000 OR (r.price IS NOT NULL AND r.price < 0) THEN
      RAISE EXCEPTION 'bad_line' USING ERRCODE = '22023';
    END IF;
    SELECT ol.item_id, ol.qty_ordered, ol.qty_received, ol.unit_price, ol.currency INTO l
      FROM public.inventory_order_lines ol WHERE ol.id = r.line_id AND ol.order_id = p_order AND ol.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'line_not_in_order' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = l.item_id AND i.is_active) THEN
      RAISE EXCEPTION 'item_inactive' USING ERRCODE = '22023';
    END IF;
    IF l.qty_received + r.qty > l.qty_ordered AND NOT coalesce(p_allow_over, false) THEN
      RAISE EXCEPTION 'over_receive' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.inventory_items i WHERE i.id = l.item_id AND i.owner_id = v_uid FOR UPDATE;

    v_price := coalesce(r.price, l.unit_price);
    UPDATE public.inventory_items SET quantity = quantity + r.qty,
           purchase_price = CASE WHEN r.price IS NOT NULL THEN r.price ELSE purchase_price END
     WHERE id = l.item_id;
    v_batch := NULL;
    IF r.expiry IS NOT NULL OR r.lot IS NOT NULL THEN
      INSERT INTO public.inventory_batches (owner_id, item_id, quantity, expiry_date, lot_no, note)
      VALUES (v_uid, l.item_id, r.qty, r.expiry, r.lot, left('📦 طلبية' || coalesce(' — ' || v_sup, ''), 120)) RETURNING id INTO v_batch;
    END IF;
    INSERT INTO public.inventory_movements (owner_id, item_id, change, reason, note, batch_id, order_line_id, receipt_id)
    VALUES (v_uid, l.item_id, r.qty, 'purchase', left('🚚 استلام طلبية' || coalesce(' — ' || v_sup, ''), 200), v_batch, r.line_id, v_receipt);
    UPDATE public.inventory_order_lines SET qty_received = qty_received + r.qty,
           unit_price = CASE WHEN r.price IS NOT NULL THEN r.price ELSE unit_price END
     WHERE id = r.line_id;

    IF v_price IS NOT NULL THEN
      IF l.currency = 'USD' THEN v_usd := v_usd + r.qty * v_price; ELSE v_syp := v_syp + r.qty * v_price; END IF;
    END IF;
    v_out := v_out || jsonb_build_object('line_id', r.line_id, 'item_id', l.item_id, 'qty', r.qty,
               'unit_price', v_price, 'currency', l.currency, 'priced', v_price IS NOT NULL);
  END LOOP;

  UPDATE public.inventory_receipts SET amount_syp = round(v_syp, 2), amount_usd = round(v_usd, 2) WHERE id = v_receipt;
  RETURN jsonb_build_object('receipt_id', v_receipt, 'amount_syp', round(v_syp, 2), 'amount_usd', round(v_usd, 2), 'lines', v_out);
END $$;


ALTER FUNCTION "public"."inventory_receive"("p_order" "uuid", "p_lines" "jsonb", "p_allow_over" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lab_order_redo"("p_order" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_new_due" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE o public.lab_orders; r public.lab_order_redos;
BEGIN
  UPDATE public.lab_orders
     SET status = 'redo', date_due = COALESCE(p_new_due, date_due)
   WHERE id = p_order AND status IN ('received', 'checked')
  RETURNING * INTO o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lab_redo_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lab_order_redos
     SET reason = NULLIF(btrim(left(COALESCE(p_reason, ''), 300)), '')
   WHERE id = (SELECT id FROM public.lab_order_redos
                WHERE lab_order_id = p_order AND resent_at IS NULL
                ORDER BY redo_at DESC LIMIT 1)
  RETURNING * INTO r;
  RETURN jsonb_build_object('order', to_jsonb(o), 'redo', to_jsonb(r));
END $$;


ALTER FUNCTION "public"."lab_order_redo"("p_order" "uuid", "p_reason" "text", "p_new_due" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lab_order_redos_owner_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = NEW.lab_order_id AND o.doctor_id = NEW.doctor_id) THEN
    RAISE EXCEPTION 'lab_order_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."lab_order_redos_owner_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lab_orders_redo_cycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'redo' AND OLD.status IS DISTINCT FROM 'redo' THEN
    INSERT INTO public.lab_order_redos
      (doctor_id, lab_order_id, prev_status, prev_date_received, prev_date_checked, prev_date_due, new_date_due)
    VALUES
      (OLD.doctor_id, OLD.id, OLD.status, OLD.date_received, OLD.date_checked, OLD.date_due, NEW.date_due);
  ELSIF OLD.status = 'redo' AND NEW.status = 'sent' THEN
    NEW.date_sent      := COALESCE(OLD.date_sent, NEW.date_sent);
    NEW.date_received  := NULL;
    NEW.date_checked   := NULL;
    NEW.date_delivered := NULL;
    UPDATE public.lab_order_redos SET resent_at = now()
     WHERE lab_order_id = OLD.id AND resent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."lab_orders_redo_cycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_access_level"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()) THEN 'full'
    ELSE public.tenant_access_level(auth.uid())
  END;
$$;


ALTER FUNCTION "public"."my_access_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_storage_object_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT count(*)::int
  FROM storage.objects o
  WHERE o.bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(o.name))[1] = auth.uid()::text;
$$;


ALTER FUNCTION "public"."my_storage_object_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_storage_orphans"() RETURNS SETOF "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT o.name FROM storage.objects o
   WHERE auth.uid() IS NOT NULL
     AND o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false
     AND o.created_at < now() - interval '1 hour'
     AND NOT EXISTS (SELECT 1 FROM public.patient_documents d WHERE d.storage_path = o.name)
     AND NOT EXISTS (SELECT 1 FROM public.bridge_inbox b WHERE b.storage_path = o.name)
   ORDER BY o.name
   LIMIT 1000;
$$;


ALTER FUNCTION "public"."my_storage_orphans"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_storage_usage"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'used_bytes', public._pf_used_bytes(auth.uid()),
    'cap_bytes',  public._pf_cap_bytes(auth.uid()),
    'files',      (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
                     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false),
    'orphans',    (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
                     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false
                     AND o.created_at < now() - interval '1 hour'
                     AND NOT EXISTS (SELECT 1 FROM public.patient_documents d WHERE d.storage_path = o.name)
                     AND NOT EXISTS (SELECT 1 FROM public.bridge_inbox b WHERE b.storage_path = o.name)),
    'inbox',      (SELECT count(*) FROM public.bridge_inbox b WHERE b.owner_id = auth.uid())
  ) END;
$$;


ALTER FUNCTION "public"."my_storage_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_subscription_state"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'level',         public.my_access_level(),
    'status',        tr.status,
    'plan',          tr.plan,
    'billing_cycle', tr.billing_cycle,
    'trial_end',     tr.trial_end,
    'grace_until',   tr.grace_until
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.trial_requests tr ON tr.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."my_subscription_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_wipe_open"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trial_requests
    WHERE user_id = auth.uid()
      AND wipe_started_at IS NOT NULL
      AND wipe_started_at > now() - interval '15 minutes'
  );
$$;


ALTER FUNCTION "public"."my_wipe_open"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_patient_seq"("n" integer DEFAULT 1) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  live_max integer;
  new_seq  integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF n IS NULL OR n < 1 OR n > 1000 THEN
    RAISE EXCEPTION 'invalid batch size %', n;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(local_id, '\D', '', 'g'), '')::integer), 0)
    INTO live_max
    FROM public.patients
   WHERE doctor_id = auth.uid();

  INSERT INTO public.patient_seq (owner_id, seq)
       VALUES (auth.uid(), live_max + n)
  ON CONFLICT (owner_id) DO UPDATE
       SET seq = GREATEST(patient_seq.seq + n, EXCLUDED.seq)
  RETURNING seq INTO new_seq;

  RETURN new_seq;
END;
$$;


ALTER FUNCTION "public"."next_patient_seq"("n" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT regexp_replace(                                   -- 4) drop trunk leading 0
           regexp_replace(                                 -- 3) drop Syria country code 963
             regexp_replace(                               -- 2) drop intl 00 prefix
               regexp_replace(coalesce(p,''), '\D', '', 'g'), -- 1) keep digits only
               '^00', ''),
             '^963', ''),
           '^0', '')
$$;


ALTER FUNCTION "public"."normalize_phone"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patient_documents_lab_order_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.lab_order_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.lab_orders o
        WHERE o.id = NEW.lab_order_id AND o.doctor_id = NEW.owner_id AND o.patient_id = NEW.patient_id) THEN
    RAISE EXCEPTION 'lab_order_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."patient_documents_lab_order_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patient_documents_xray_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF cardinality(COALESCE(NEW.teeth, '{}')) = 0 AND NEW.tooth_num IS NOT NULL AND NEW.tooth_num <> '' THEN
      NEW.teeth := ARRAY[NEW.tooth_num];
    END IF;
  ELSIF NEW.teeth IS NOT DISTINCT FROM OLD.teeth AND NEW.tooth_num IS DISTINCT FROM OLD.tooth_num THEN
    NEW.teeth := CASE WHEN NEW.tooth_num IS NULL OR NEW.tooth_num = '' THEN '{}'::text[] ELSE ARRAY[NEW.tooth_num] END;
  END IF;
  NEW.teeth := ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(NEW.teeth, '{}'::text[])) AS t WHERE t IS NOT NULL AND t <> '' ORDER BY t);
  NEW.tooth_num := NEW.teeth[1];
  IF NEW.category IS DISTINCT FROM 'xray' THEN NEW.xray_type := NULL; END IF;
  IF NEW.source IS DISTINCT FROM 'center' THEN NEW.source_name := NULL; END IF;
  IF NEW.taken_at IS NOT NULL AND NEW.taken_at > (now() AT TIME ZONE 'Asia/Damascus')::date THEN
    RAISE EXCEPTION 'xray_taken_in_future' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'patient_documents: patient not owned' USING ERRCODE = '42501';
    END IF;
    IF NEW.storage_path NOT LIKE (NEW.owner_id::text || '/' || NEW.patient_id::text || '/%') THEN
      RAISE EXCEPTION 'patient_documents: storage path outside the patient folder' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.session_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id AND s.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'patient_documents: session not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.appointment_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = NEW.appointment_id AND a.doctor_id = NEW.owner_id AND a.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'patient_documents: appointment not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."patient_documents_xray_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patients_referrer_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.referred_by_patient_id IS NOT NULL THEN
    IF NEW.referred_by_patient_id = NEW.id THEN
      RAISE EXCEPTION 'referrer_self' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.patients p
                    WHERE p.id = NEW.referred_by_patient_id AND p.doctor_id = NEW.doctor_id) THEN
      RAISE EXCEPTION 'referrer_not_owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."patients_referrer_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pf_quota_ok"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
              ELSE COALESCE(public._pf_used_bytes(auth.uid()) < public._pf_cap_bytes(auth.uid()), true) END;
$$;


ALTER FUNCTION "public"."pf_quota_ok"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date" DEFAULT NULL::"date", "p_time" time without time zone DEFAULT NULL::time without time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v        RECORD;
  a        RECORD;
  cs       RECORD;
  v_start  TIMESTAMPTZ;
  v_reason TEXT;
  v_note   TEXT;
  v_pref   TEXT;
  v_n      INT;
  v_when   TEXT;
  v_direct BOOLEAN;
  v_body   TEXT;
  bi       RECORD;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_rd     DATE;
  v_rt     TIME;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_appt IS NULL OR p_kind IS NULL OR p_kind NOT IN ('cancel', 'change') THEN
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
  SELECT COALESCE(c.portal_show_appts, true) AS show_appts, COALESCE(c.portal_allow_changes, false) AS allow_changes,
         COALESCE(c.portal_cancel_mode, 'direct') AS cancel_mode, COALESCE(c.portal_cutoff_hours, 24) AS cutoff_hours
    INTO cs FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF NOT FOUND OR cs.allow_changes IS DISTINCT FROM true OR cs.show_appts IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  SELECT x.id, x.status, x.confirmation_status, x.date, x.time, x.duration INTO a
    FROM public.appointments x
   WHERE x.id = p_appt AND x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF p_kind = 'cancel' AND (a.status = 'cancelled' OR a.confirmation_status = 'cancelled_by_pt') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already', 'applied', true);
  END IF;
  IF COALESCE(a.status, 'pending') IN ('cancelled', 'completed', 'broken', 'no_show') OR a.confirmation_status = 'cancelled_by_pt' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_changeable');
  END IF;
  v_start := (a.date + COALESCE(a.time, '00:00'::time)) AT TIME ZONE 'Asia/Damascus';
  IF v_start - now() < make_interval(hours => cs.cutoff_hours) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late', 'cutoff_hours', cs.cutoff_hours);
  END IF;
  v_direct := (p_kind = 'cancel' AND cs.cancel_mode = 'direct');
  IF NOT v_direct AND EXISTS (SELECT 1 FROM public.portal_requests r
                               WHERE r.appointment_id = a.id AND r.kind = p_kind AND r.status = 'new' AND r.applied = false) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already', 'applied', false);
  END IF;
  SELECT count(*) INTO v_n FROM public.portal_requests r
   WHERE r.owner_id = v.owner_id AND r.patient_id = v.patient_id AND r.created_at > now() - interval '24 hours';
  IF v_n >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  -- free text: control characters out, trimmed, ≤300; empty ⇒ NULL
  v_reason := NULLIF(left(btrim(regexp_replace(COALESCE(p_reason, ''), '[[:cntrl:]]+', ' ', 'g')), 300), '');
  v_note   := NULLIF(left(btrim(regexp_replace(COALESCE(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), 300), '');
  -- v630: a chosen slot makes a time-of-day preference meaningless; no preference ⇒ no «يفضّل» (was «أي وقت» on NULL)
  v_pref   := CASE WHEN p_kind = 'change' AND p_date IS NULL AND p_pref IN ('any', 'morning', 'evening') THEN p_pref END;
  v_when   := to_char(a.date, 'DD/MM/YYYY') || COALESCE(' ' || to_char(a.time, 'HH24:MI'), '');

  -- M189: a chosen slot (change only) — both or neither; re-validated against the live free slots under a
  -- per-clinic-and-day lock, so two patients asking for one slot at the same moment cannot both get it
  IF (p_date IS NULL) <> (p_time IS NULL) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  IF p_kind = 'change' AND p_date IS NOT NULL THEN
    SELECT * INTO bi FROM public.booking_clinic_info(v.owner_id) LIMIT 1;
    IF NOT FOUND OR p_date < v_today OR p_date > v_today + LEAST(GREATEST(COALESCE(bi.max_days_ahead, 30), 1), 60) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('portal-slot:' || v.owner_id::text || ':' || p_date::text));
    IF NOT EXISTS (SELECT 1 FROM public._portal_free_slots(v.owner_id, a.id, COALESCE(a.duration, bi.slot_minutes, 30), p_date, p_date) f
                    WHERE f.d = p_date AND f.t = p_time) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken');
    END IF;
    v_rd := p_date; v_rt := p_time;
  END IF;

  IF v_direct THEN
    UPDATE public.appointments
       SET status = 'cancelled',
           confirmation_status = 'cancelled_by_pt',
           notes = concat_ws(E'\n', NULLIF(notes, ''), '[أُلغي من بوابة المريض' || COALESCE(' — السبب: ' || v_reason, '') || ']')
     WHERE id = a.id;
  END IF;

  INSERT INTO public.portal_requests (owner_id, patient_id, appointment_id, kind, applied, reason, preference, note, appt_date, appt_time, patient_name_snapshot,
                                      requested_date, requested_time)
  VALUES (v.owner_id, v.patient_id, a.id, p_kind, v_direct, v_reason, v_pref, v_note, a.date, a.time, v.patient_name, v_rd, v_rt);

  v_body := CASE
    WHEN v_direct          THEN 'ألغى المريض موعده من بوابة المريض — ' || v_when
    WHEN p_kind = 'cancel' THEN 'طلب المريض إلغاء موعده من بوابة المريض — ' || v_when
    ELSE                        'طلب المريض تغيير موعده من بوابة المريض — ' || v_when
                                || COALESCE(' — يطلب نقله إلى ' || to_char(v_rd, 'DD/MM/YYYY') || ' ' || to_char(v_rt, 'HH24:MI'), '')
                                || COALESCE(' — يفضّل: ' || CASE v_pref WHEN 'morning' THEN 'صباحاً' WHEN 'evening' THEN 'مساءً' WHEN 'any' THEN 'أي وقت' END, '')
  END || COALESCE(' — السبب: ' || v_reason, '') || COALESCE(' — ملاحظة: ' || v_note, '');

  INSERT INTO public.audit_log (owner_id, employee_id, employee_name_snapshot, employee_role_snapshot, action_type, entity_type, entity_id,
                                patient_id, patient_name_snapshot, description, old_value, new_value)
  VALUES (v.owner_id, NULL, 'المريض (بوابة المريض)', 'patient',
          CASE WHEN v_direct THEN 'appointment.status_change' ELSE 'appointment.portal_request' END, 'appointment', a.id,
          v.patient_id, v.patient_name, v_body,
          jsonb_build_object('status', a.status, 'confirmation_status', a.confirmation_status),
          jsonb_build_object('source', 'portal', 'kind', p_kind, 'applied', v_direct)
            || CASE WHEN v_direct THEN jsonb_build_object('status', 'cancelled', 'confirmation_status', 'cancelled_by_pt') ELSE '{}'::jsonb END);

  INSERT INTO public.patient_messages (owner_id, patient_id, kind, channel, body, sent_by)
  VALUES (v.owner_id, v.patient_id, 'portal', 'portal', v_body, 'المريض (البوابة)');

  RETURN jsonb_build_object('ok', true, 'applied', v_direct, 'kind', p_kind);
END; $_$;


ALTER FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date", "p_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v       RECORD;
  a       RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_show  BOOLEAN;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_appt IS NULL THEN
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
  SELECT COALESCE(c.portal_show_appts, true) INTO v_show FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF v_show IS DISTINCT FROM true AND FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  SELECT x.id, x.status, x.confirmation_status, x.confirmed_at, x.date, x.time INTO a
    FROM public.appointments x
   WHERE x.id = p_appt AND x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF a.status = 'confirmed' OR a.confirmation_status = 'confirmed' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already');
  END IF;
  IF a.date < v_today OR COALESCE(a.status, 'pending') NOT IN ('scheduled', 'pending')
     OR a.confirmation_status = 'cancelled_by_pt' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_confirmable');
  END IF;

  UPDATE public.appointments
     SET status = 'confirmed',
         confirmation_status = 'confirmed',
         confirmed_at = COALESCE(confirmed_at, now())
   WHERE id = a.id;

  INSERT INTO public.audit_log (owner_id, employee_id, employee_name_snapshot, employee_role_snapshot, action_type, entity_type, entity_id,
                                patient_id, patient_name_snapshot, description, old_value, new_value)
  VALUES (v.owner_id, NULL, 'المريض (بوابة المريض)', 'patient', 'appointment.status_change', 'appointment', a.id,
          v.patient_id, v.patient_name,
          'أكّد المريض موعده من بوابة المريض — ' || to_char(a.date, 'DD/MM/YYYY') || ' ' || COALESCE(to_char(a.time, 'HH24:MI'), ''),
          jsonb_build_object('status', a.status, 'confirmation_status', a.confirmation_status),
          jsonb_build_object('status', 'confirmed', 'confirmation_status', 'confirmed', 'source', 'portal'));

  RETURN jsonb_build_object('ok', true);
END; $_$;


ALTER FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_info"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v        RECORD;
  cs       RECORD;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_out    JSONB;
  v_appts  JSONB;
  v_plan   JSONB;
  v_bal    JSONB;
  v_notes  JSONB;
  v_intake TEXT;
  v_ik     JSONB;
  v_opts   INT;
  v_hist   JSONB;
  v_htot   INT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT pp.id, pp.owner_id, pp.patient_id, pp.expires_at, pp.revoked_at, p.name AS patient_name
    INTO v
    FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public._intake_clinic_open(v.owner_id) THEN RETURN NULL; END IF;

  SELECT c.clinic_name, c.clinic_phone,
         COALESCE(c.portal_show_appts, true)    AS show_appts,
         COALESCE(c.portal_show_plan, true)     AS show_plan,
         COALESCE(c.portal_show_balance, false) AS show_balance,
         COALESCE(c.portal_show_notes, true)    AS show_notes,
         COALESCE(c.portal_show_history, true)  AS show_history,
         COALESCE(c.portal_allow_changes, false) AS allow_changes,
         COALESCE(c.portal_cancel_mode, 'direct') AS cancel_mode,
         COALESCE(c.portal_cutoff_hours, 24)    AS cutoff_hours,
         c.portal_msg_cancelled AS msg_cancelled, c.portal_msg_requested AS msg_requested, c.portal_msg_too_late AS msg_too_late,
         c.portal_msg_rejected AS msg_rejected
    INTO cs FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF NOT FOUND THEN
    SELECT NULL::text AS clinic_name, NULL::text AS clinic_phone,
           true AS show_appts, true AS show_plan, false AS show_balance, true AS show_notes,
           true AS show_history, false AS allow_changes, 'direct'::text AS cancel_mode, 24 AS cutoff_hours,
           NULL::text AS msg_cancelled, NULL::text AS msg_requested, NULL::text AS msg_too_late, NULL::text AS msg_rejected INTO cs;
  END IF;

  IF v.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked', 'clinic_name', cs.clinic_name, 'clinic_phone', cs.clinic_phone);
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired', 'clinic_name', cs.clinic_name, 'clinic_phone', cs.clinic_phone);
  END IF;

  v_out := jsonb_build_object(
    'status', 'ok',
    'clinic_name', cs.clinic_name, 'clinic_phone', cs.clinic_phone,
    'patient_name', v.patient_name,
    'expires_at', v.expires_at,
    'show', jsonb_build_object('appts', cs.show_appts, 'plan', cs.show_plan, 'balance', cs.show_balance, 'notes', cs.show_notes,
                               'history', cs.show_history, 'changes', (cs.allow_changes AND cs.show_appts))
  );

  -- ── appointments: upcoming (today onward, still live) + past 12 months ──
  IF cs.show_appts THEN
    SELECT jsonb_build_object(
      'upcoming', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'date', a.date, 'time', to_char(a.time, 'HH24:MI'), 'duration', a.duration,
                 -- M187: the cutoff is decided here (clinic clock · Asia/Damascus); portal_appt_change re-checks it on write
                 'can_change', (((a.date + COALESCE(a.time, '00:00'::time)) AT TIME ZONE 'Asia/Damascus') - now()) >= make_interval(hours => cs.cutoff_hours),
                 'open_request', (SELECT r.kind FROM public.portal_requests r
                                   WHERE r.appointment_id = a.id AND r.owner_id = v.owner_id AND r.status = 'new' AND r.applied = false
                                   ORDER BY r.created_at DESC LIMIT 1),
                 -- M189: the slot the patient asked for (shown back to him as «طلبك نقله إلى …»)
                 'open_request_at', (SELECT to_char(r.requested_date, 'YYYY-MM-DD') || ' ' || to_char(r.requested_time, 'HH24:MI')
                                       FROM public.portal_requests r
                                      WHERE r.appointment_id = a.id AND r.owner_id = v.owner_id AND r.status = 'new' AND r.applied = false
                                        AND r.kind = 'change' AND r.requested_date IS NOT NULL AND r.requested_time IS NOT NULL
                                      ORDER BY r.created_at DESC LIMIT 1),
                 -- M191: the clinic rejected his latest request on this appointment (last 7 days, nothing open now) ⇒ the page says so
                 'last_rejected', (SELECT r.kind FROM public.portal_requests r
                                    WHERE r.appointment_id = a.id AND r.owner_id = v.owner_id AND r.status = 'dismissed'
                                      AND r.handled_at > now() - interval '7 days'
                                      AND NOT EXISTS (SELECT 1 FROM public.portal_requests q
                                                       WHERE q.appointment_id = a.id AND q.status = 'new' AND q.applied = false)
                                      AND NOT EXISTS (SELECT 1 FROM public.portal_requests q2
                                                       WHERE q2.appointment_id = a.id AND q2.created_at > r.created_at)
                                    ORDER BY r.created_at DESC LIMIT 1),
                 'type', a.type, 'status', a.status, 'confirmation', a.confirmation_status,
                 'doctor', d.name) ORDER BY a.date, a.time)
          FROM (SELECT * FROM public.appointments x
                 WHERE x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
                   AND x.date >= v_today AND COALESCE(x.status, 'pending') NOT IN ('cancelled','broken','completed','no_show')
                 ORDER BY x.date, x.time LIMIT 20) a
          LEFT JOIN public.clinic_doctors d ON d.id = a.provider_id AND d.owner_id = v.owner_id), '[]'::jsonb),
      'past', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'date', a.date, 'time', to_char(a.time, 'HH24:MI'), 'duration', a.duration,
                 'type', a.type, 'status', a.status, 'confirmation', a.confirmation_status,
                 'doctor', d.name) ORDER BY a.date DESC, a.time DESC)
          FROM (SELECT * FROM public.appointments x
                 WHERE x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false
                   AND x.date < v_today AND x.date >= v_today - 365
                 ORDER BY x.date DESC, x.time DESC LIMIT 20) a
          LEFT JOIN public.clinic_doctors d ON d.id = a.provider_id AND d.owner_id = v.owner_id), '[]'::jsonb)
    ) INTO v_appts;
    v_out := v_out || jsonb_build_object('appts', v_appts);
  END IF;

  -- ── M187: cancel / change requests — config only when the clinic switched it on (and appointments are shown) ──
  IF cs.allow_changes AND cs.show_appts THEN
    v_out := v_out || jsonb_build_object('changes', jsonb_build_object(
      'mode', cs.cancel_mode, 'cutoff_hours', cs.cutoff_hours,
      -- M189: the clinic's online-booking hours exist ⇒ the patient picks a real free slot (else morning/evening)
      'slots', EXISTS (SELECT 1 FROM public.booking_clinic_info(v.owner_id)),
      'tpl', jsonb_build_object('cancelled', cs.msg_cancelled, 'requested', cs.msg_requested, 'too_late', cs.msg_too_late, 'rejected', cs.msg_rejected)));
  END IF;

  -- ── M187: past treatments (CareStack «Past Treatment») — completed sessions only, last 24 months, 60 rows;
  --    amounts ride ONLY with the balance switch (no money leaks through history); internal notes never leave ──
  IF cs.show_history THEN
    SELECT count(*) INTO v_htot FROM public.ledger_sessions s
     WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id AND COALESCE(s.status, 'completed') = 'completed';
    SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'date', h.d, 'type', h.type, 'tooth', h.tooth_num, 'units', h.units, 'doctor', d.name,
             'cost', CASE WHEN cs.show_balance THEN h.cost END,
             'currency', CASE WHEN cs.show_balance THEN (CASE WHEN h.currency = 'USD' THEN 'USD' ELSE 'SYP' END) END))
             ORDER BY h.d DESC, h.created_at DESC), '[]'::jsonb)
      INTO v_hist
      FROM (SELECT s.type, s.tooth_num, s.units, s.cost, s.currency, s.provider_id, s.created_at,
                   COALESCE(s.date, (s.created_at AT TIME ZONE 'Asia/Damascus')::date) AS d
              FROM public.ledger_sessions s
             WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id
               AND COALESCE(s.status, 'completed') = 'completed'
               AND COALESCE(s.date, (s.created_at AT TIME ZONE 'Asia/Damascus')::date) >= v_today - 730
             ORDER BY 8 DESC, s.created_at DESC LIMIT 60) h
      LEFT JOIN public.clinic_doctors d ON d.id = h.provider_id AND d.owner_id = v.owner_id;
    v_out := v_out || jsonb_build_object('history', jsonb_build_object('items', v_hist, 'more', v_htot > jsonb_array_length(v_hist)));
  END IF;

  -- ── plan: the ADOPTED plan only (planned rows). >1 alternative option
  --    still open ⇒ no items, just the pending flag (M145 semantics). ──
  IF cs.show_plan THEN
    SELECT count(DISTINCT s.plan_option) INTO v_opts
      FROM public.ledger_sessions s
     WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id
       AND COALESCE(s.status, 'completed') = 'planned' AND s.plan_option BETWEEN 1 AND 3;
    IF v_opts > 1 THEN
      v_plan := jsonb_build_object('pending_options', true, 'items', '[]'::jsonb, 'totals', '[]'::jsonb);
    ELSE
      SELECT jsonb_build_object(
        'pending_options', false,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'type', s.type, 'tooth', s.tooth_num, 'phase', s.phase, 'units', s.units,
                   'cost', s.cost, 'currency', CASE WHEN s.currency = 'USD' THEN 'USD' ELSE 'SYP' END)
                 ORDER BY COALESCE(s.phase, 9), s.date NULLS LAST, s.created_at)
            FROM public.ledger_sessions s
           WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id
             AND COALESCE(s.status, 'completed') = 'planned'), '[]'::jsonb),
        'totals', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('currency', t.cur, 'total', t.tot) ORDER BY t.cur DESC)
            FROM (SELECT CASE WHEN s.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur, sum(COALESCE(s.cost, 0)) tot
                    FROM public.ledger_sessions s
                   WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id
                     AND COALESCE(s.status, 'completed') = 'planned'
                   GROUP BY 1) t), '[]'::jsonb)
      ) INTO v_plan;
    END IF;
    v_out := v_out || jsonb_build_object('plan', v_plan);
  END IF;

  -- ── balance: computeFinancials per currency layer, literally ──────────
  --   completed = Σ cost of every non-planned session · paid = Σ payments
  --   a split is EARNED only if is_unearned=false AND it sits on a session whose
  --   status is exactly 'completed'; otherwise it is mobile credit (unearned).
  --   no splits in a layer ⇒ allocated = paid (legacy). refund eats unearned
  --   credit first, the rest re-opens earned balance. discount/write_off reduce.
  --   A layer is reported only when it carries money (bagMoney — v337).
  IF cs.show_balance THEN
    WITH ses AS (
      SELECT s.id, CASE WHEN s.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur, COALESCE(s.cost, 0) cost,
             COALESCE(s.status, 'completed') st
        FROM public.ledger_sessions s WHERE s.doctor_id = v.owner_id AND s.patient_id = v.patient_id
    ), pay AS (
      SELECT CASE WHEN p.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur, COALESCE(p.amount, 0) amount
        FROM public.ledger_payments p WHERE p.doctor_id = v.owner_id AND p.patient_id = v.patient_id
    ), spl AS (
      SELECT CASE WHEN sp.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur, COALESCE(sp.amount, 0) amount,
             (COALESCE(sp.is_unearned, false) OR sp.session_id IS NULL OR COALESCE(se.st, '') <> 'completed') AS mobile
        FROM public.payment_splits sp
        LEFT JOIN ses se ON se.id = sp.session_id
       WHERE sp.doctor_id = v.owner_id AND sp.patient_id = v.patient_id
    ), adj AS (
      SELECT CASE WHEN a.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur, a.kind, a.amount
        FROM public.account_adjustments a
       WHERE a.doctor_id = v.owner_id AND a.patient_id = v.patient_id AND a.amount > 0
    ), layers AS (
      SELECT c.cur,
        COALESCE((SELECT sum(cost) FROM ses WHERE cur = c.cur AND st <> 'planned'), 0) completed,
        COALESCE((SELECT sum(amount) FROM pay WHERE cur = c.cur), 0) paid,
        EXISTS (SELECT 1 FROM spl WHERE cur = c.cur) has_splits,
        COALESCE((SELECT sum(amount) FROM spl WHERE cur = c.cur AND NOT mobile), 0) allocated_raw,
        COALESCE((SELECT sum(amount) FROM spl WHERE cur = c.cur AND mobile), 0) unearned_raw,
        COALESCE((SELECT sum(amount) FROM adj WHERE cur = c.cur AND kind = 'refund'), 0) refunds,
        COALESCE((SELECT sum(amount) FROM adj WHERE cur = c.cur AND kind IN ('discount','write_off')), 0) reductions
      FROM (VALUES ('SYP'), ('USD')) c(cur)
    ), fin AS (
      SELECT l.cur, l.completed, l.paid, l.refunds, l.reductions, l.has_splits,
             CASE WHEN l.has_splits THEN l.allocated_raw ELSE l.paid END AS allocated,
             l.unearned_raw - LEAST(l.refunds, l.unearned_raw) AS unearned,
             (l.completed - l.reductions) - (CASE WHEN l.has_splits THEN l.allocated_raw ELSE l.paid END)
               + (l.refunds - LEAST(l.refunds, l.unearned_raw)) AS true_balance
        FROM layers l
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'currency', f.cur, 'completed', f.completed, 'paid', f.paid, 'reductions', f.reductions,
             'refunds', f.refunds, 'unearned', f.unearned, 'true_balance', f.true_balance) ORDER BY f.cur DESC), '[]'::jsonb)
      INTO v_bal
      FROM fin f
     WHERE f.completed <> 0 OR f.paid <> 0 OR f.allocated <> 0 OR f.unearned <> 0 OR f.reductions <> 0 OR f.refunds <> 0 OR f.has_splits;

    -- installment plans (ppPlanCalc, literally): covered = Σ same-currency
    -- payments dated on/after start_date, capped at total; k = floor(covered/inst);
    -- next due = start + k periods (monthly clamps to month end; weekly 7·k; biweekly 14·k).
    v_out := v_out || jsonb_build_object('balance', v_bal, 'installments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'title', q.title, 'currency', q.cur, 'total', q.total, 'installment', q.inst, 'frequency', q.frequency,
               'covered', q.covered, 'remaining', GREATEST(0, q.total - q.covered),
               'count', CASE WHEN q.inst > 0 THEN ceil(q.total / q.inst) ELSE 0 END,
               'done', (q.covered >= q.total - 0.5),
               'next_due', CASE WHEN q.covered >= q.total - 0.5 OR q.inst <= 0 THEN NULL
                                WHEN q.frequency = 'weekly'   THEN q.start_date + (7  * floor(q.covered / q.inst))::int
                                WHEN q.frequency = 'biweekly' THEN q.start_date + (14 * floor(q.covered / q.inst))::int
                                ELSE (q.start_date + (floor(q.covered / q.inst)::int || ' months')::interval)::date END,
               'today', v_today) ORDER BY q.created_at)
        FROM (SELECT pl.title, pl.frequency, pl.start_date, pl.created_at,
                     CASE WHEN pl.currency = 'USD' THEN 'USD' ELSE 'SYP' END cur,
                     pl.total::numeric total, pl.installment_amount::numeric inst,
                     LEAST(pl.total::numeric, COALESCE((
                       SELECT sum(p.amount) FROM public.ledger_payments p
                        WHERE p.doctor_id = v.owner_id AND p.patient_id = v.patient_id
                          AND (CASE WHEN p.currency = 'USD' THEN 'USD' ELSE 'SYP' END) = (CASE WHEN pl.currency = 'USD' THEN 'USD' ELSE 'SYP' END)
                          AND COALESCE(p.date, (p.created_at AT TIME ZONE 'UTC')::date) >= pl.start_date), 0)) covered
                FROM public.payment_plans pl
               WHERE pl.doctor_id = v.owner_id AND pl.patient_id = v.patient_id AND pl.status = 'active') q), '[]'::jsonb));
  END IF;

  -- ── post-op instructions + prescriptions (what the two tabs hold) ──────
  IF cs.show_notes THEN
    SELECT jsonb_build_object(
      'postop', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at) ORDER BY n.created_at DESC)
          FROM (SELECT * FROM public.post_op_notes x WHERE x.owner_id = v.owner_id AND x.patient_id = v.patient_id
                 ORDER BY x.created_at DESC LIMIT 20) n), '[]'::jsonb),
      'rx', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('created_at', r.created_at, 'notes', r.notes, 'doctor', d.name,
                 'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('drug', i.drug_name, 'dosage', i.dosage, 'frequency', i.frequency,
                                      'duration', i.duration, 'instructions', i.instructions) ORDER BY i.sort_order, i.id)
                                      FROM public.prescription_items i WHERE i.prescription_id = r.id AND i.owner_id = v.owner_id), '[]'::jsonb))
               ORDER BY r.created_at DESC)
          FROM (SELECT * FROM public.prescriptions x WHERE x.owner_id = v.owner_id AND x.patient_id = v.patient_id
                 ORDER BY x.created_at DESC LIMIT 20) r
          LEFT JOIN public.clinic_doctors d ON d.id = r.provider_id AND d.owner_id = v.owner_id), '[]'::jsonb)
    ) INTO v_notes;
    v_out := v_out || jsonb_build_object('notes', v_notes);
  END IF;

  -- ── intake (M177) in three states (M181): a live pending link ⇒ fill it; the latest
  --    submitted/reviewed one ⇒ «received ✓» (no answers are exposed); otherwise nothing ──
  SELECT i.token INTO v_intake FROM public.patient_intakes i
   WHERE i.owner_id = v.owner_id AND i.patient_id = v.patient_id
     AND i.status = 'pending' AND i.expires_at > now()
   ORDER BY i.created_at DESC LIMIT 1;
  IF v_intake IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('intake_token', v_intake, 'intake', jsonb_build_object('status', 'pending', 'token', v_intake));
  ELSE
    SELECT jsonb_build_object('status', 'submitted', 'submitted_at', i.submitted_at) INTO v_ik
      FROM public.patient_intakes i
     WHERE i.owner_id = v.owner_id AND i.patient_id = v.patient_id AND i.status IN ('submitted', 'reviewed')
     ORDER BY COALESCE(i.submitted_at, i.created_at) DESC LIMIT 1;
    IF FOUND THEN v_out := v_out || jsonb_build_object('intake', v_ik); END IF;
  END IF;

  RETURN v_out;
END; $_$;


ALTER FUNCTION "public"."portal_info"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_request_cancel_approve"("p_req" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r RECORD;
  a RECORD;
BEGIN
  IF p_req IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT * INTO r FROM public.portal_requests
   WHERE id = p_req AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF r.kind <> 'cancel' OR r.applied THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_a_request'); END IF;
  IF r.status <> 'new' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', r.status); END IF;
  SELECT id, status, confirmation_status, date, time INTO a FROM public.appointments
   WHERE id = r.appointment_id AND doctor_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'appointment_gone'); END IF;
  IF COALESCE(a.status, 'pending') IN ('cancelled', 'completed', 'broken', 'no_show') THEN
    UPDATE public.portal_requests SET status = 'handled', handled_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_live', 'status', a.status);
  END IF;
  UPDATE public.appointments
     SET status = 'cancelled',
         confirmation_status = 'cancelled_by_pt',
         notes = concat_ws(E'\n', NULLIF(notes, ''), '[أُلغي بطلب المريض من البوابة' || COALESCE(' — السبب: ' || r.reason, '') || ']')
   WHERE id = a.id;
  -- the M187 trigger closed the request (status change to cancelled); make it explicit and idempotent
  UPDATE public.portal_requests SET status = 'handled', handled_at = COALESCE(handled_at, now()) WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'appointment_id', a.id, 'patient_id', r.patient_id, 'patient_name', r.patient_name_snapshot,
                            'date', a.date, 'time', to_char(a.time, 'HH24:MI'), 'prev_status', a.status, 'reason', r.reason);
END; $$;


ALTER FUNCTION "public"."portal_request_cancel_approve"("p_req" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v       RECORD;
  a       RECORD;
  cs      RECORD;
  bi      RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Damascus')::date;
  v_dur   INT;
  v_days  JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_appt IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT pp.owner_id, pp.patient_id INTO v FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT COALESCE(c.portal_show_appts, true) AS show_appts, COALESCE(c.portal_allow_changes, false) AS allow_changes,
         COALESCE(c.portal_cutoff_hours, 24) AS cutoff_hours
    INTO cs FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF NOT FOUND OR cs.allow_changes IS DISTINCT FROM true OR cs.show_appts IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;
  SELECT x.id, x.status, x.confirmation_status, x.date, x.time, x.duration INTO a FROM public.appointments x
   WHERE x.id = p_appt AND x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF COALESCE(a.status, 'pending') IN ('cancelled', 'completed', 'broken', 'no_show') OR a.confirmation_status = 'cancelled_by_pt' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_changeable');
  END IF;
  IF ((a.date + COALESCE(a.time, '00:00'::time)) AT TIME ZONE 'Asia/Damascus') - now() < make_interval(hours => cs.cutoff_hours) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late', 'cutoff_hours', cs.cutoff_hours);
  END IF;
  SELECT * INTO bi FROM public.booking_clinic_info(v.owner_id) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'days', '[]'::jsonb); END IF;
  v_dur := COALESCE(a.duration, bi.slot_minutes, 30);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('d', q.d, 'times', q.times) ORDER BY q.d), '[]'::jsonb) INTO v_days
    FROM (SELECT f.d, jsonb_agg(to_char(f.t, 'HH24:MI') ORDER BY f.t) AS times
            FROM public._portal_free_slots(v.owner_id, a.id, v_dur, v_today, v_today + LEAST(GREATEST(COALESCE(bi.max_days_ahead, 30), 1), 60)) f
           GROUP BY f.d) q;
  RETURN jsonb_build_object('ok', true, 'dur', v_dur, 'days', v_days);
END; $_$;


ALTER FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_xray_list"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v RECORD;
  v_on BOOLEAN;
  v_items JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT pp.owner_id, pp.patient_id INTO v FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT COALESCE(c.portal_show_xrays, false) INTO v_on FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF v_on IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'path', d.storage_path, 'kind', CASE WHEN d.category = 'xray' THEN 'xray' ELSE 'photo' END,
           'type', d.xray_type, 'date', COALESCE(d.taken_at, (d.created_at AT TIME ZONE 'Asia/Damascus')::date),
           'teeth', COALESCE(to_jsonb(d.teeth), '[]'::jsonb)
         ) ORDER BY COALESCE(d.taken_at, (d.created_at AT TIME ZONE 'Asia/Damascus')::date) DESC, d.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (SELECT * FROM public.patient_documents x
           WHERE x.owner_id = v.owner_id AND x.patient_id = v.patient_id AND x.portal_shared
             AND x.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND x.storage_path LIKE (v.owner_id::text || '/' || v.patient_id::text || '/%')
           ORDER BY COALESCE(x.taken_at, (x.created_at AT TIME ZONE 'Asia/Damascus')::date) DESC, x.created_at DESC
           LIMIT 40) d;
  RETURN jsonb_build_object('ok', true, 'items', v_items);
END;
$_$;


ALTER FUNCTION "public"."portal_xray_list"("p_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."payment_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "session_id" "uuid",
    "provider_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "is_unearned" boolean DEFAULT false NOT NULL,
    "payment_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    CONSTRAINT "payment_splits_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payment_splits_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."payment_splits" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."realloc_patient_splits"("p_patient_id" "uuid", "p_splits" "jsonb" DEFAULT '[]'::"jsonb") RETURNS SETOF "public"."payment_splits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_bad   text;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- M141: expired subscription (read-only) — no reallocation.
  IF public.my_access_level() <> 'full' THEN
    RAISE EXCEPTION 'subscription_read_only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND doctor_id = v_owner
  ) THEN
    RAISE EXCEPTION 'patient_not_owned' USING ERRCODE = '42501';
  END IF;

  DROP TABLE IF EXISTS _rps;
  CREATE TEMP TABLE _rps ON COMMIT DROP AS
  SELECT
    (s->>'payment_id')::uuid                       AS payment_id,
    NULLIF(s->>'session_id',  '')::uuid            AS session_id,
    NULLIF(s->>'provider_id', '')::uuid            AS provider_id,
    COALESCE((s->>'amount')::numeric, 0)           AS amount,
    COALESCE((s->>'is_unearned')::boolean, false)  AS is_unearned
  FROM jsonb_array_elements(COALESCE(p_splits, '[]'::jsonb)) AS s
  WHERE (s->>'payment_id') IS NOT NULL;

  SELECT r.payment_id::text INTO v_bad FROM _rps r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ledger_payments lp
    WHERE lp.id = r.payment_id AND lp.patient_id = p_patient_id AND lp.doctor_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_payment_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  SELECT r.session_id::text INTO v_bad FROM _rps r
  WHERE r.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ledger_sessions ls
    WHERE ls.id = r.session_id AND ls.patient_id = p_patient_id
      AND ls.doctor_id = v_owner AND ls.status = 'completed'
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_session_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  SELECT r.provider_id::text INTO v_bad FROM _rps r
  WHERE r.provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinic_doctors cd
    WHERE cd.id = r.provider_id AND cd.owner_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_provider_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  SELECT r.payment_id::text INTO v_bad
  FROM _rps r JOIN public.ledger_payments lp ON lp.id = r.payment_id
  GROUP BY r.payment_id, lp.amount
  HAVING SUM(r.amount) > lp.amount + 0.005
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_exceeds_payment: %', v_bad USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.payment_splits
  WHERE patient_id = p_patient_id
    AND doctor_id  = v_owner;

  RETURN QUERY
  INSERT INTO public.payment_splits
    (doctor_id, patient_id, payment_id, session_id, provider_id, amount, is_unearned, payment_date)
  SELECT
    v_owner, p_patient_id, r.payment_id, r.session_id, r.provider_id,
    r.amount, r.is_unearned, lp.date
  FROM _rps r JOIN public.ledger_payments lp ON lp.id = r.payment_id
  RETURNING *;
END;
$$;


ALTER FUNCTION "public"."realloc_patient_splits"("p_patient_id" "uuid", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_login_email"("p_input" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_in     text := btrim(coalesce(p_input, ''));
  v_digits text;
  v_uid    uuid;
  v_email  text;
  v_hdr    json;
  v_ip     text;
BEGIN
  IF v_in = '' THEN
    RETURN v_in;
  END IF;

  BEGIN
    v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_hdr := NULL;
  END;
  v_ip := coalesce(nullif(btrim(split_part(v_hdr->>'x-forwarded-for', ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'noip');
  PERFORM public._login_resolve_bump('ip:' || v_ip, 30, interval '10 minutes');
  PERFORM public._login_resolve_bump('in:' || md5(lower(regexp_replace(v_in, '\s', '', 'g'))), 10, interval '10 minutes');

  IF position('@' in v_in) = 0 AND v_in ~ '^[0-9+()\-\s]+$' THEN
    v_digits := regexp_replace(v_in, '\D', '', 'g');
    IF length(v_digits) = 0 THEN
      RETURN v_in;
    END IF;

    SELECT user_id INTO v_uid
    FROM public.trial_requests
    WHERE phone IS NOT NULL
      AND public.normalize_phone(phone) = public.normalize_phone(v_in)
      AND status <> 'rejected'
      AND user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      IF v_email IS NOT NULL AND v_email <> '' THEN
        RETURN v_email;
      END IF;
    END IF;

    RETURN v_digits || '@sydent.com';
  END IF;

  v_email := lower(v_in);

  PERFORM 1 FROM auth.users WHERE lower(email) = v_email;
  IF FOUND THEN
    RETURN v_email;
  END IF;

  SELECT user_id INTO v_uid
  FROM public.trial_requests
  WHERE email IS NOT NULL
    AND lower(btrim(email)) = v_email
    AND status <> 'rejected'
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NOT NULL AND v_email <> '' THEN
      RETURN v_email;
    END IF;
  END IF;

  RETURN lower(v_in);
END$_$;


ALTER FUNCTION "public"."resolve_login_email"("p_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_clinic_employees_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_clinic_employees_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_notification_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_notification_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_operatories_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_operatories_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_platform_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_phone       text := btrim(coalesce(p_phone, ''));
  v_email       text := lower(btrim(coalesce(p_email, '')));
  v_digits      text;
  v_phone_taken boolean := false;
  v_email_taken boolean := false;
  v_hdr         json;
  v_ip          text;
BEGIN
  BEGIN
    v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_hdr := NULL;
  END;
  v_ip := coalesce(nullif(btrim(split_part(v_hdr->>'x-forwarded-for', ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'noip');
  PERFORM public._login_resolve_bump('su-ip:' || v_ip, 20, interval '10 minutes');
  PERFORM public._login_resolve_bump('su-in:' || md5(lower(regexp_replace(v_phone || '|' || v_email, '\s', '', 'g'))), 10, interval '10 minutes');

  IF v_phone <> '' THEN
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    IF v_digits <> '' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.trial_requests
        WHERE phone IS NOT NULL AND phone <> ''
          AND status <> 'rejected'
          AND public.normalize_phone(phone) = public.normalize_phone(v_phone)
      ) INTO v_phone_taken;
    END IF;
  END IF;

  IF v_email <> '' THEN
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) INTO v_email_taken;
    IF NOT v_email_taken THEN
      SELECT EXISTS (
        SELECT 1 FROM public.trial_requests
        WHERE email IS NOT NULL AND email <> ''
          AND status <> 'rejected'
          AND lower(btrim(email)) = v_email
      ) INTO v_email_taken;
    END IF;
  END IF;

  RETURN jsonb_build_object('phone_taken', v_phone_taken, 'email_taken', v_email_taken);
END
$$;


ALTER FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") IS 'M139: pre-signUp availability check (phone via normalize_phone on active trial_requests; email via auth.users + active trial_requests). Rate-limited per M137 buckets. Existence is already exposed by signUp/23505 paths.';



CREATE OR REPLACE FUNCTION "public"."sydent_clinic_name_source_maint"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_owner_name text;
BEGIN
  IF nullif(btrim(coalesce(NEW.clinic_name, '')), '') IS NULL THEN
    NEW.clinic_name_source := 'derived';
    RETURN NEW;
  END IF;

  SELECT nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name',
                               u.raw_user_meta_data ->> 'name', '')), '')
    INTO v_owner_name
  FROM auth.users u
  WHERE u.id = NEW.owner_id;

  IF v_owner_name IS NULL THEN
    NEW.clinic_name_source := 'custom';
    RETURN NEW;
  END IF;

  IF public.sydent_norm_name(NEW.clinic_name)
     = public.sydent_norm_name('عيادة ' || v_owner_name) THEN
    NEW.clinic_name_source := 'derived';
  ELSE
    NEW.clinic_name_source := 'custom';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sydent_clinic_name_source_maint"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sydent_currency_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_owner_col text := TG_ARGV[0];
  v_cur_col   text := TG_ARGV[1];
  v_lock      boolean := (TG_ARGV[2] = 'lock');
  v_owner     uuid;
  v_new_cur   text;
  v_old_cur   text;
  v_derived   boolean := false;
BEGIN
  v_new_cur := upper(NULLIF(btrim(COALESCE(to_jsonb(NEW)->>v_cur_col, '')), ''));

  IF TG_OP = 'UPDATE' THEN
    v_old_cur := upper(COALESCE(to_jsonb(OLD)->>v_cur_col, ''));
    IF v_lock AND v_new_cur IS NOT NULL AND v_old_cur <> ''
       AND v_new_cur <> v_old_cur THEN
      RAISE EXCEPTION 'currency_locked: % keeps its recorded currency (delete & re-create to correct)', TG_TABLE_NAME
        USING ERRCODE = '23514';
    END IF;
    IF v_new_cur IS NULL AND v_old_cur <> '' THEN
      v_new_cur := v_old_cur;   -- تحديث بلا عملة → إبقاء المسجَّلة (اجتازت الفحص سابقاً)
    END IF;
  END IF;

  IF v_new_cur IS NULL THEN
    -- إدراج بلا عملة → سلسلة اشتقاق ثلاثية:
    --   1) clinic_settings.currency (الحالة الاعتيادية)
    --   2) auth.users.raw_user_meta_data->>'currency' — نافذة التسجيل: بذر
    --      handle_new_doctor/handle_new_owner_doctor يسبق خلق صف clinic_settings
    --      الكسول (درس v181)، والعملة موجودة بالميتاداتا منذ M107.
    --   3) 'SYP'
    v_derived := true;
    v_owner := NULLIF(to_jsonb(NEW)->>v_owner_col, '')::uuid;
    SELECT upper(cs.currency) INTO v_new_cur
      FROM public.clinic_settings cs WHERE cs.owner_id = v_owner;
    IF v_new_cur IS NULL THEN
      SELECT upper(NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'currency','')), ''))
        INTO v_new_cur
        FROM auth.users u WHERE u.id = v_owner;
    END IF;
    v_new_cur := COALESCE(v_new_cur, 'SYP');
  END IF;

  IF v_new_cur NOT IN ('SYP','USD') THEN
    IF v_derived THEN
      v_new_cur := 'SYP';  -- ميتاداتا فاسدة لا تكسر التسجيل أبداً — fail-safe
    ELSE
      RAISE EXCEPTION 'currency_invalid: %', v_new_cur USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object(v_cur_col, v_new_cur));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sydent_currency_guard"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sydent_currency_guard"() IS 'M124: يشتق عملة الصف من عملة العيادة عند غيابها ويقفلها حيث يوجد صفٌّ مشتقّ منها. args: owner_col, currency_col, lock|nolock — وM128: القفل محصورٌ بجداول الدفتر ذات الأبناء (ledger_sessions · ledger_payments · account_adjustments · payment_splits · lab_payments)، وهي نفسها بلا مسار تعديلٍ للمبلغ بالعميل.';



CREATE OR REPLACE FUNCTION "public"."sydent_log_clinic_name_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_tr          uuid;
  v_actor       uuid;
  v_owner_email text;
  v_actor_email text;
  v_by          text;
BEGIN
  BEGIN
    SELECT t.id INTO v_tr
    FROM public.trial_requests t
    WHERE t.user_id = NEW.owner_id
    ORDER BY t.created_at DESC
    LIMIT 1;

    SELECT u.email INTO v_owner_email FROM auth.users u WHERE u.id = NEW.owner_id;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      v_by := 'system';
    ELSIF v_actor = NEW.owner_id THEN
      v_by := 'tenant:' || coalesce(v_owner_email, NEW.owner_id::text);
    ELSE
      SELECT u.email INTO v_actor_email FROM auth.users u WHERE u.id = v_actor;
      v_by := 'other:' || coalesce(v_actor_email, v_actor::text);
    END IF;

    INSERT INTO public.subscription_events
      (trial_request_id, user_id, event_type, from_value, to_value, notes, performed_by)
    VALUES
      (v_tr, NEW.owner_id, 'clinic_name_changed',
       OLD.clinic_name, NEW.clinic_name,
       'غيّر العميل اسم العيادة من صفحة الإعدادات', v_by);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sydent_log_clinic_name_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sydent_log_owner_name_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_tr          uuid;
  v_actor       uuid;
  v_owner_email text;
  v_actor_email text;
  v_by          text;
BEGIN
  BEGIN
    SELECT t.id INTO v_tr
    FROM public.trial_requests t
    WHERE t.user_id = NEW.owner_id
    ORDER BY t.created_at DESC
    LIMIT 1;

    SELECT u.email INTO v_owner_email FROM auth.users u WHERE u.id = NEW.owner_id;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      v_by := 'system';
    ELSIF v_actor = NEW.owner_id THEN
      v_by := 'tenant:' || coalesce(v_owner_email, NEW.owner_id::text);
    ELSE
      SELECT u.email INTO v_actor_email FROM auth.users u WHERE u.id = v_actor;
      v_by := 'other:' || coalesce(v_actor_email, v_actor::text);
    END IF;

    INSERT INTO public.subscription_events
      (trial_request_id, user_id, event_type, from_value, to_value, notes, performed_by)
    VALUES
      (v_tr, NEW.owner_id, 'owner_name_changed',
       OLD.name, NEW.name,
       'غيّر العميل اسمه الشخصي من صفحة الإعدادات', v_by);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sydent_log_owner_name_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sydent_norm_name"("p_txt" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT btrim(regexp_replace(
           translate(
             translate(lower(coalesce(p_txt, '')), 'أإآٱةىؤئ', 'ااااهيوي'),
             'ـ.،', ''),
           '\s+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."sydent_norm_name"("p_txt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sydent_split_currency_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cur      text;
  v_sess_cur text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'currency_locked: payment_splits keep their recorded currency'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: العملة تُشتق دائماً من دفعة الـsplit — المصدر الموثوق الوحيد
  -- (يغطي الكلاينت القديم وRPC realloc_patient_splits بلا تعديلهما).
  SELECT upper(lp.currency) INTO v_cur
    FROM public.ledger_payments lp WHERE lp.id = NEW.payment_id;
  IF v_cur IS NULL THEN
    SELECT upper(cs.currency) INTO v_cur
      FROM public.clinic_settings cs WHERE cs.owner_id = NEW.doctor_id;
    v_cur := COALESCE(v_cur, 'SYP');
  END IF;
  NEW.currency := v_cur;

  -- جدار الخلط: split على جلسة بعملة مخالفة = خطأ محاسبي يُرفض من الجذر.
  IF NEW.session_id IS NOT NULL THEN
    SELECT upper(ls.currency) INTO v_sess_cur
      FROM public.ledger_sessions ls WHERE ls.id = NEW.session_id;
    IF v_sess_cur IS NOT NULL AND v_sess_cur <> v_cur THEN
      RAISE EXCEPTION 'split_currency_mismatch: payment % cannot settle a % session', v_cur, v_sess_cur
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sydent_split_currency_guard"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sydent_split_currency_guard"() IS 'M124: عملة الـsplit تُشتق من دفعته دائماً؛ يُرفض تخصيصها لجلسة بعملة مخالفة (جدار منع الخلط).';



CREATE OR REPLACE FUNCTION "public"."sydent_split_identity_check"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pid  uuid := COALESCE(NEW.payment_id, OLD.payment_id);
  v_pay  public.ledger_payments%ROWTYPE;
  v_n    integer;
  v_sum  numeric;
  v_bad  text;
BEGIN
  IF v_pid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_pay FROM public.ledger_payments WHERE id = v_pid;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_n, v_sum
  FROM public.payment_splits WHERE payment_id = v_pid;
  IF v_n = 0 THEN RETURN NULL; END IF;

  IF abs(v_sum - v_pay.amount) > 0.005 THEN
    RAISE EXCEPTION 'split_sum_mismatch: payment % splits=% amount=%', v_pid, v_sum, v_pay.amount
      USING ERRCODE = '23514';
  END IF;

  SELECT s.id::text INTO v_bad FROM public.payment_splits s
  WHERE s.payment_id = v_pid
    AND (COALESCE(s.currency, 'SYP') <> COALESCE(v_pay.currency, 'SYP')
      OR s.patient_id IS DISTINCT FROM v_pay.patient_id
      OR s.doctor_id  IS DISTINCT FROM v_pay.doctor_id
      OR s.amount < 0
      OR (s.is_unearned = true AND s.session_id IS NOT NULL))
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_identity_mismatch: split % of payment %', v_bad, v_pid
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;


ALTER FUNCTION "public"."sydent_split_identity_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_doctor_card_active"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.doctor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.clinic_doctors cd
     SET is_active  = COALESCE(NEW.is_active, true),
         updated_at = now()
   WHERE cd.id = NEW.doctor_id
     AND cd.owner_id = NEW.owner_id
     AND cd.is_owner IS NOT TRUE
     AND cd.is_active IS DISTINCT FROM COALESCE(NEW.is_active, true);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_doctor_card_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tenant_access_level"("p_uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN tr.status IS DISTINCT FROM 'accepted'                 THEN 'none'
      WHEN tr.trial_end IS NULL OR tr.trial_end > now()          THEN 'full'
      WHEN tr.grace_until IS NOT NULL AND tr.grace_until > now() THEN 'full'
      WHEN COALESCE(tr.plan, 'trial') = 'trial'                  THEN 'none'
      ELSE 'read'
    END
    FROM public.trial_requests tr
    WHERE tr.user_id = p_uid
  ), 'none');
$$;


ALTER FUNCTION "public"."tenant_access_level"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_presence"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.clinic_settings SET last_seen_at = now() WHERE owner_id = auth.uid();
$$;


ALTER FUNCTION "public"."touch_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_subscription_plans_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_subscription_plans_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."treatment_materials_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = NEW.item_id AND i.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'material_item_not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treatments t WHERE t.id = NEW.treatment_id AND t.doctor_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'material_treatment_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."treatment_materials_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_clinic_settings_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_clinic_settings_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "session_id" "uuid",
    "provider_id" "uuid",
    "note" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    CONSTRAINT "account_adjustments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "account_adjustments_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "account_adjustments_kind_check" CHECK (("kind" = ANY (ARRAY['discount'::"text", 'write_off'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."account_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "feature" "text" NOT NULL,
    "model" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_usage_log_feature_check" CHECK (("feature" = ANY (ARRAY['session_note'::"text", 'patient_summary'::"text", 'booking_chat'::"text", 'treatment_plan_explanation'::"text", 'followup_message'::"text", 'whatsapp_draft'::"text", 'postop_instructions'::"text", 'monthly_digest'::"text", 'referral_report'::"text", 'review_reply'::"text", 'daily_digest'::"text", 'preop_instructions'::"text", 'patient_reply_draft'::"text", 'lab_order_draft'::"text", 'treatment_sequencing'::"text", 'health_content'::"text", 'tenant_health_narrative'::"text", 'nl_analytics'::"text"])))
);


ALTER TABLE "public"."ai_usage_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_duration_min" integer DEFAULT 30 NOT NULL,
    "default_treatment_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_provider_id" "uuid",
    "default_lab_id" "uuid",
    "default_notes" "text",
    "default_operatory_id" "uuid",
    CONSTRAINT "appointment_types_default_duration_min_check" CHECK ((("default_duration_min" > 0) AND ("default_duration_min" <= 480))),
    CONSTRAINT "appointment_types_notes_len" CHECK ((("default_notes" IS NULL) OR ("char_length"("default_notes") <= 500)))
);


ALTER TABLE "public"."appointment_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "patient_id" "uuid",
    "patient_name" "text",
    "date" "date",
    "time" time without time zone,
    "duration" integer,
    "type" "text",
    "treatment_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "color" "text",
    "stroke" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "provider_id" "uuid",
    "is_planned" boolean DEFAULT false NOT NULL,
    "confirmation_status" "text" DEFAULT 'pending'::"text",
    "confirmed_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "seated_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "appointment_type_id" "uuid",
    "operatory_id" "uuid",
    "asap" boolean DEFAULT false NOT NULL,
    "series_id" "uuid",
    "series_index" smallint,
    "series_total" smallint,
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'pending'::"text", 'completed'::"text", 'cancelled'::"text", 'broken'::"text", 'no_show'::"text"]))),
    CONSTRAINT "confirmation_valid" CHECK (("confirmation_status" = ANY (ARRAY['pending'::"text", 'called'::"text", 'confirmed'::"text", 'not_reached'::"text", 'cancelled_by_pt'::"text"]))),
    CONSTRAINT "scheduled_has_date" CHECK ((("is_planned" = true) OR (("date" IS NOT NULL) AND ("time" IS NOT NULL))))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."series_id" IS 'M157: معرّفُ سلسلة التكرار (المواعيدُ الأخوة تتشاركه)';



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "employee_name_snapshot" "text",
    "employee_role_snapshot" "text",
    "action_type" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "patient_id" "uuid",
    "patient_name_snapshot" "text",
    "description" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "is_alert" boolean DEFAULT false NOT NULL,
    "alert_reason" "text",
    "is_archived" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "requested_date" "date" NOT NULL,
    "requested_time" time without time zone NOT NULL,
    "duration" integer DEFAULT 30 NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "appointment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "booking_requests_duration_check" CHECK ((("duration" >= 10) AND ("duration" <= 240))),
    CONSTRAINT "booking_requests_note_check" CHECK (("char_length"("note") <= 300)),
    CONSTRAINT "booking_requests_patient_name_check" CHECK ((("char_length"("btrim"("patient_name")) >= 2) AND ("char_length"("btrim"("patient_name")) <= 80))),
    CONSTRAINT "booking_requests_phone_check" CHECK (("phone" ~ '^\+?[0-9]{8,15}$'::"text")),
    CONSTRAINT "booking_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."booking_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bridge_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "mode" "text" DEFAULT 'folder'::"text" NOT NULL,
    "version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "bridge_devices_key_hash_check" CHECK (("key_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "bridge_devices_mode_check" CHECK (("mode" = ANY (ARRAY['folder'::"text", 'twain'::"text", 'dicom'::"text", 'manual'::"text"]))),
    CONSTRAINT "bridge_devices_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80))),
    CONSTRAINT "bridge_devices_version_check" CHECK ((("version" IS NULL) OR ("char_length"("version") <= 40)))
);


ALTER TABLE "public"."bridge_devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."bridge_devices" IS 'SyDent Bridge (M194): أجهزةُ العيادة المقترنة — يُخزَّن SHA-256 لمفتاح الجهاز فقط؛ الإيقافُ نهائي.';



CREATE TABLE IF NOT EXISTS "public"."bridge_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "device_id" "uuid",
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bridge_inbox_file_name_check" CHECK (("char_length"("file_name") <= 200)),
    CONSTRAINT "bridge_inbox_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text", 'application/dicom'::"text"]))),
    CONSTRAINT "bridge_inbox_path_check" CHECK (("storage_path" ~~ (("owner_id")::"text" || '/_inbox/%'::"text"))),
    CONSTRAINT "bridge_inbox_size_bytes_check" CHECK ((("size_bytes" IS NULL) OR ("size_bytes" >= 0)))
);


ALTER TABLE "public"."bridge_inbox" OWNER TO "postgres";


COMMENT ON TABLE "public"."bridge_inbox" IS 'SyDent Bridge (M194): صورةٌ وصلت من جهازٍ بلا طلبٍ مفتوح — تنتظر إسنادَها لمريض (نقلُ الملف + صف) أو تجاهلَها.';



CREATE TABLE IF NOT EXISTS "public"."bridge_pairings" (
    "code" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "device_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    CONSTRAINT "bridge_pairings_code_check" CHECK (("code" ~ '^[A-HJ-NP-Z2-9]{8}$'::"text")),
    CONSTRAINT "bridge_pairings_device_name_check" CHECK ((("char_length"("device_name") >= 1) AND ("char_length"("device_name") <= 80)))
);


ALTER TABLE "public"."bridge_pairings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capture_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "device_id" "uuid",
    "category" "text" DEFAULT 'xray'::"text" NOT NULL,
    "xray_type" "text",
    "teeth" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "session_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "done_at" timestamp with time zone,
    "document_id" "uuid",
    CONSTRAINT "capture_requests_category_check" CHECK (("category" = ANY (ARRAY['xray'::"text", 'clinical_photo'::"text"]))),
    CONSTRAINT "capture_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "capture_requests_teeth_check" CHECK ((("cardinality"("teeth") <= 52) AND ("array_to_string"("teeth", ','::"text") ~ '^(([1-4][1-8]|[5-8][1-5])(,([1-4][1-8]|[5-8][1-5]))*)?$'::"text"))),
    CONSTRAINT "capture_requests_xray_type_check" CHECK ((("xray_type" IS NULL) OR ("xray_type" = ANY (ARRAY['periapical'::"text", 'bitewing'::"text", 'panoramic'::"text", 'cephalometric'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."capture_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."capture_requests" IS 'SyDent Bridge (M194): طلبُ التقاطٍ مفتوح 15 دقيقة — المريضُ والأسنانُ والنوع؛ الجهازُ يملؤه بأول صورةٍ تصل.';



CREATE TABLE IF NOT EXISTS "public"."clinic_doctors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "role" "text",
    "phone" "text",
    "color" "text" DEFAULT '#2ee89e'::"text",
    "share_percent" numeric,
    "weekly_hours" numeric,
    "notes" "text",
    "is_owner" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_type" "text" DEFAULT 'doctor'::"text" NOT NULL,
    "compensation_model" "text" DEFAULT 'percentage'::"text" NOT NULL,
    "monthly_salary" numeric(14,2),
    "salary_currency" "text" NOT NULL,
    "share_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "clinic_doctors_salary_currency_valid" CHECK (("salary_currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "clinic_doctors_share_history_array" CHECK (("jsonb_typeof"("share_history") = 'array'::"text")),
    CONSTRAINT "compensation_model_valid" CHECK (("compensation_model" = ANY (ARRAY['percentage'::"text", 'salary'::"text", 'hybrid'::"text", 'none'::"text"]))),
    CONSTRAINT "monthly_salary_nonneg" CHECK ((("monthly_salary" IS NULL) OR ("monthly_salary" >= (0)::numeric))),
    CONSTRAINT "provider_type_valid" CHECK (("provider_type" = ANY (ARRAY['doctor'::"text", 'hygienist'::"text", 'assistant'::"text", 'secretary'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."clinic_doctors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "doctor_id" "uuid",
    "pin_hash" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "color" "text",
    "notes" "text",
    "weekly_hours" numeric,
    "monthly_salary" numeric(14,2),
    "share_percent" numeric,
    "provider_type" "text",
    "compensation_model" "text",
    "has_system_access" boolean DEFAULT false NOT NULL,
    "sort_order" integer,
    "salary_currency" "text" NOT NULL,
    CONSTRAINT "ce_compensation_model_valid" CHECK ((("compensation_model" IS NULL) OR ("compensation_model" = ANY (ARRAY['salary'::"text", 'percentage'::"text", 'hybrid'::"text", 'none'::"text"])))),
    CONSTRAINT "ce_provider_type_valid" CHECK ((("provider_type" IS NULL) OR ("provider_type" = ANY (ARRAY['doctor'::"text", 'hygienist'::"text", 'assistant'::"text", 'secretary'::"text", 'other'::"text"])))),
    CONSTRAINT "clinic_employees_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'doctor'::"text", 'secretary'::"text"]))),
    CONSTRAINT "clinic_employees_salary_currency_valid" CHECK (("salary_currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."clinic_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "whatsapp_reminders_enabled" boolean DEFAULT true NOT NULL,
    "whatsapp_reminder_template" "text" DEFAULT 'مرحباً {patient_name} 👋

تذكير بموعدك في عيادة {clinic_name}:
📅 التاريخ: {date} ({day_of_week})
🕐 الساعة: {time}
👨‍⚕️ الطبيب: {doctor_name}

الرجاء تأكيد الحضور 🙏'::"text" NOT NULL,
    "whatsapp_reminder_hours_before" integer DEFAULT 24 NOT NULL,
    "clinic_name" "text",
    "clinic_phone" "text",
    "default_appointment_duration_min" integer DEFAULT 30,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "no_show_fee_enabled" boolean DEFAULT false NOT NULL,
    "no_show_fee_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "lock_pin_hash" "text",
    "onboarding_dismissed_at" timestamp with time zone,
    "clinic_name_confirmed_at" timestamp with time zone,
    "license_no" "text",
    "recall_interval_months" integer DEFAULT 6,
    "whatsapp_recall_template" "text",
    "whatsapp_birthday_template" "text",
    "booking_enabled" boolean DEFAULT false NOT NULL,
    "booking_slot_minutes" integer DEFAULT 30 NOT NULL,
    "booking_work_days" "text" DEFAULT '0,1,2,3,4,6'::"text" NOT NULL,
    "booking_work_start" time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    "booking_work_end" time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    "booking_max_days_ahead" integer DEFAULT 30 NOT NULL,
    "booking_note" "text",
    "contact_phone" "text",
    "treatments_seeded" boolean DEFAULT false NOT NULL,
    "staff_msg_presets" "jsonb",
    "last_seen_at" timestamp with time zone,
    "whatsapp_installment_template" "text",
    "google_review_url" "text",
    "whatsapp_review_template" "text",
    "ai_features_enabled" boolean DEFAULT false NOT NULL,
    "ai_consent_accepted_at" timestamp with time zone,
    "currency" "text" DEFAULT 'SYP'::"text" NOT NULL,
    "syndicate_branch" "text",
    "license_no_on_rx" boolean DEFAULT true NOT NULL,
    "clinic_name_source" "text" DEFAULT 'derived'::"text" NOT NULL,
    "multi_currency_enabled" boolean DEFAULT false NOT NULL,
    "usd_report_rate" numeric,
    "report_unify_currency" "text",
    "no_show_fee_currency" "text",
    "patient_flag_defs" "jsonb",
    "production_goal_syp" numeric,
    "production_goal_usd" numeric,
    "intake_note" "text",
    "intake_signature" boolean DEFAULT true NOT NULL,
    "intake_on_booking" boolean DEFAULT true NOT NULL,
    "whatsapp_intake_template" "text",
    "portal_show_appts" boolean DEFAULT true NOT NULL,
    "portal_show_plan" boolean DEFAULT true NOT NULL,
    "portal_show_balance" boolean DEFAULT false NOT NULL,
    "portal_show_notes" boolean DEFAULT true NOT NULL,
    "whatsapp_portal_template" "text",
    "portal_show_history" boolean DEFAULT true NOT NULL,
    "portal_allow_changes" boolean DEFAULT false NOT NULL,
    "portal_cancel_mode" "text" DEFAULT 'direct'::"text" NOT NULL,
    "portal_cutoff_hours" integer DEFAULT 24 NOT NULL,
    "portal_msg_cancelled" "text",
    "portal_msg_requested" "text",
    "portal_msg_too_late" "text",
    "portal_msg_moved" "text",
    "portal_msg_cancel_ok" "text",
    "portal_msg_rejected" "text",
    "portal_show_xrays" boolean DEFAULT false NOT NULL,
    CONSTRAINT "clinic_settings_clinic_name_source_check" CHECK (("clinic_name_source" = ANY (ARRAY['derived'::"text", 'custom'::"text"]))),
    CONSTRAINT "clinic_settings_currency_chk" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "clinic_settings_goal_syp_nonneg" CHECK ((("production_goal_syp" IS NULL) OR ("production_goal_syp" >= (0)::numeric))),
    CONSTRAINT "clinic_settings_goal_usd_nonneg" CHECK ((("production_goal_usd" IS NULL) OR ("production_goal_usd" >= (0)::numeric))),
    CONSTRAINT "clinic_settings_no_show_fee_currency_check" CHECK ((("no_show_fee_currency" IS NULL) OR ("no_show_fee_currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))),
    CONSTRAINT "clinic_settings_patient_flag_defs_array" CHECK ((("patient_flag_defs" IS NULL) OR (("jsonb_typeof"("patient_flag_defs") = 'array'::"text") AND ("jsonb_array_length"("patient_flag_defs") <= 8)))),
    CONSTRAINT "clinic_settings_portal_cancel_mode_check" CHECK (("portal_cancel_mode" = ANY (ARRAY['direct'::"text", 'request'::"text"]))),
    CONSTRAINT "clinic_settings_portal_cutoff_check" CHECK (("portal_cutoff_hours" = ANY (ARRAY[12, 24, 48, 72]))),
    CONSTRAINT "clinic_settings_portal_msg_cancel_ok_len" CHECK ((("portal_msg_cancel_ok" IS NULL) OR ("char_length"("portal_msg_cancel_ok") <= 1000))),
    CONSTRAINT "clinic_settings_portal_msg_moved_len" CHECK ((("portal_msg_moved" IS NULL) OR ("char_length"("portal_msg_moved") <= 1000))),
    CONSTRAINT "clinic_settings_portal_msg_rejected_len" CHECK ((("portal_msg_rejected" IS NULL) OR ("char_length"("portal_msg_rejected") <= 600))),
    CONSTRAINT "clinic_settings_portal_msgs_len" CHECK (((("portal_msg_cancelled" IS NULL) OR ("char_length"("portal_msg_cancelled") <= 600)) AND (("portal_msg_requested" IS NULL) OR ("char_length"("portal_msg_requested") <= 600)) AND (("portal_msg_too_late" IS NULL) OR ("char_length"("portal_msg_too_late") <= 600)))),
    CONSTRAINT "clinic_settings_report_unify_currency_chk" CHECK ((("report_unify_currency" IS NULL) OR ("report_unify_currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))),
    CONSTRAINT "clinic_settings_syndicate_branch_len" CHECK ((("syndicate_branch" IS NULL) OR ("char_length"("syndicate_branch") <= 40))),
    CONSTRAINT "clinic_settings_usd_report_rate_chk" CHECK ((("usd_report_rate" IS NULL) OR ("usd_report_rate" > (0)::numeric))),
    CONSTRAINT "lock_pin_hash_format" CHECK ((("lock_pin_hash" IS NULL) OR ("char_length"("lock_pin_hash") = 64)))
);


ALTER TABLE "public"."clinic_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinic_settings"."onboarding_dismissed_at" IS 'Phase 7.6G: timestamp when the owner dismissed the welcome banner.';



COMMENT ON COLUMN "public"."clinic_settings"."clinic_name_confirmed_at" IS 'Phase 7.6G: timestamp when the owner confirmed the clinic_name.';



COMMENT ON COLUMN "public"."clinic_settings"."license_no" IS 'الرقم النقابي للطبيب (يظهر على رأس الروشتة المطبوعة). يُبذر من user_metadata عند التسجيل — نظير trial_requests.syndicate_no بطبقة المنصة.';



COMMENT ON COLUMN "public"."clinic_settings"."last_seen_at" IS 'Presence heartbeat: last time any staff member had a tenant page open (throttled ~10 min). Written by supabase-init.js; read by admin-ops Edge Function.';



COMMENT ON COLUMN "public"."clinic_settings"."currency" IS 'عملة عرض العيادة (SYP|USD) — تُختار عند التسجيل ولا تُغيَّر. رمز فقط، بلا تحويل. ليست عملة الاشتراك (trial_requests.currency).';



COMMENT ON COLUMN "public"."clinic_settings"."syndicate_branch" IS 'فرع نقابة أطباء الأسنان للعيادة. يُبذر من user_metadata عند إنشاء الصف، وقابل للتعديل من صفحة الإعدادات.';



COMMENT ON COLUMN "public"."clinic_settings"."license_no_on_rx" IS 'هل يظهر رقم النقابة على رأس الروشتة المطبوعة؟ الافتراضي true = سلوك ما قبل M115. الرقم يبقى محفوظاً عند الإطفاء — الإخفاء عرضٌ لا حذف.';



COMMENT ON COLUMN "public"."clinic_settings"."clinic_name_source" IS 'derived = اسم العيادة مشتقّ من اسم الطبيب ويتبع تغييره · custom = اسم تجاري اختاره الطبيب فلا يُلمس تلقائياً أبداً. يُصان بتريغر BEFORE.';



COMMENT ON COLUMN "public"."clinic_settings"."multi_currency_enabled" IS 'M124: يحكم إظهار مبدّلات العملة بالواجهة فقط — لا يدخل أي معادلة محاسبية.';



COMMENT ON COLUMN "public"."clinic_settings"."usd_report_rate" IS 'سعر صرف التقارير (1$ = كم ل.س) — يُستخدم حصراً لعرض التوحيد بالليرة بصفحة المحاسبة عند نشاط العملتين. عرض فقط: لا يمسّ أي مبلغ مخزَّن. NULL = غير مضبوط.';



COMMENT ON COLUMN "public"."clinic_settings"."report_unify_currency" IS 'M129: عملة عرض الإجمالي الموحّد بصفحة المحاسبة (NULL = عملة العيادة). عرض فقط — لا يمسّ أي مبلغ مخزَّن.';



COMMENT ON COLUMN "public"."clinic_settings"."no_show_fee_currency" IS 'عملة no_show_fee_amount. NULL = ما قبل M131 (بلا عملة مخزَّنة) — يتبع عملة العيادة الافتراضية.';



COMMENT ON COLUMN "public"."clinic_settings"."patient_flag_defs" IS 'تعريف أعلام المريض [{k,label,tone}] ≤ 8. NULL = الافتراضي المعرّف بالعميل (SyDentFlags.DEFAULTS).';



COMMENT ON COLUMN "public"."clinic_settings"."production_goal_syp" IS 'M159: هدف الإنتاج الشهري بالليرة (NULL = لا هدف) — اللوحة تشتق اليومي من أيام العمل.';



COMMENT ON COLUMN "public"."clinic_settings"."production_goal_usd" IS 'M159: هدف الإنتاج الشهري بالدولار (NULL = لا هدف).';



COMMENT ON COLUMN "public"."clinic_settings"."intake_note" IS 'نصٌّ يظهر للمريض أعلى الاستمارة (اختياري، ≤300 حرف).';



COMMENT ON COLUMN "public"."clinic_settings"."intake_signature" IS 'إظهار حقل التوقيع (اختياريٌّ للمريض دائماً — قرار المالك 10/10/2026).';



COMMENT ON COLUMN "public"."clinic_settings"."intake_on_booking" IS 'إرفاقُ رابط الاستمارة برسالة تأكيد الحجز الإلكتروني (المريض بلا استمارة حديثة).';



COMMENT ON COLUMN "public"."clinic_settings"."whatsapp_intake_template" IS 'قالبُ رسالة استمارة المريض ({patient_first_name} {patient_name} {clinic_name} {clinic_phone} {intake_link}). NULL = الافتراضي. M178.';



COMMENT ON COLUMN "public"."clinic_settings"."portal_show_appts" IS 'البوابة: عرضُ المواعيد القادمة والسابقة للمريض (M180).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_show_plan" IS 'البوابة: عرضُ خطة العلاج المعتمدة (البنود · المراحل · الإجمالي) (M180).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_show_balance" IS 'البوابة: عرضُ الرصيد (إجمالي · مدفوع · متبقٍّ · القسط القادم) — مطفأ افتراضياً كـCareStack (M180).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_show_notes" IS 'البوابة: عرضُ تعليمات ما بعد العلاج والروشتات (M180).';



COMMENT ON COLUMN "public"."clinic_settings"."whatsapp_portal_template" IS 'قالبُ رسالة بوابة المريض ({patient_first_name} {patient_name} {clinic_name} {clinic_phone} {portal_link}). NULL = الافتراضي. M180.';



COMMENT ON COLUMN "public"."clinic_settings"."portal_show_history" IS 'البوابة: العلاجاتُ المنجزة سابقاً (آخر 24 شهراً · المبالغُ فقط مع مفتاح الرصيد) (M187).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_allow_changes" IS 'البوابة: السماحُ للمريض بإلغاء موعده أو طلب تغييره — مطفأ افتراضياً (M187).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_cancel_mode" IS 'البوابة: direct = الإلغاءُ يسري فوراً · request = يصل طلباً تقرّره العيادة (M187).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_cutoff_hours" IS 'البوابة: أقلُّ مهلةٍ (ساعات) قبل الموعد يُسمح فيها بالإلغاء/الطلب من البوابة (M187).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_msg_moved" IS 'البوابة: رسالةُ واتساب للمريض بعد اعتماد الوقت الذي طلبه (M189).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_msg_cancel_ok" IS 'البوابة: رسالةُ واتساب للمريض بعد اعتماد طلب إلغائه (M190).';



COMMENT ON COLUMN "public"."clinic_settings"."portal_msg_rejected" IS 'البوابة: رسالةٌ للمريض حين ترفض العيادةُ طلبه الأخير (M191).';



CREATE TABLE IF NOT EXISTS "public"."clinical_note_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinical_note_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."day_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "currency" "text" DEFAULT 'SYP'::"text" NOT NULL,
    "expected" numeric NOT NULL,
    "counted" numeric NOT NULL,
    "variance" numeric GENERATED ALWAYS AS (("counted" - "expected")) STORED,
    "note" "text",
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "day_closings_counted_nonneg" CHECK (("counted" >= (0)::numeric)),
    CONSTRAINT "day_closings_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "day_closings_note_len" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300)))
);


ALTER TABLE "public"."day_closings" OWNER TO "postgres";


COMMENT ON TABLE "public"."day_closings" IS 'M158: إقفال درج النقد ليوم وعملة — expected لقطة كشف اليوم لحظة الإقفال، counted المعدود، variance مولَّد.';



CREATE TABLE IF NOT EXISTS "public"."doctors" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "clinic_name" "text",
    "phone" "text",
    "plan" "text" DEFAULT 'free'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'doctor'::"text",
    CONSTRAINT "doctors_role_check" CHECK (("role" = ANY (ARRAY['doctor'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."doctors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "vendor" "text",
    "description" "text",
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    "expense_time" time(0) without time zone,
    "cash_source" "text",
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "expenses_cash_source_valid" CHECK ((("cash_source" IS NULL) OR (("cash_source" = ANY (ARRAY['drawer'::"text", 'outside'::"text"])) AND ("payment_method" = 'cash'::"text")))),
    CONSTRAINT "expenses_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."expenses"."expense_time" IS 'M153: وقت المصروف المحلي (العرض فقط). المحاسبة على expenses.date حصراً.';



COMMENT ON COLUMN "public"."expenses"."cash_source" IS 'M165: مصدرُ النقد — drawer (درج العيادة) | outside (خزنة/جيب الطبيب) | NULL = drawer. نقداً فقط.';



CREATE TABLE IF NOT EXISTS "public"."implant_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "tooth_num" "text" NOT NULL,
    "brand" "text",
    "ref_no" "text",
    "lot_no" "text",
    "diameter" numeric,
    "length" numeric,
    "placed_at" "date",
    "loaded_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."implant_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."implant_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "ref_no" "text",
    "diameter" numeric,
    "length" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."implant_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric,
    "expiry_date" "date",
    "note" "text",
    "is_finished" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_qty" numeric,
    "lot_no" "text",
    CONSTRAINT "inventory_batches_lot_len" CHECK ((("lot_no" IS NULL) OR (("char_length"("btrim"("lot_no")) >= 1) AND ("char_length"("btrim"("lot_no")) <= 60)))),
    CONSTRAINT "inventory_batches_quantity_nonneg" CHECK ((("quantity" IS NULL) OR ("quantity" >= (0)::numeric)))
);


ALTER TABLE "public"."inventory_batches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_batches"."received_qty" IS 'M169: الكمية المستلمة (quantity صارت المتبقّي)';



COMMENT ON COLUMN "public"."inventory_batches"."lot_no" IS 'M173: رقمُ الدفعة (LOT) من العلبة — يُتتبَّع للمريض عبر حركات الاستهلاك';



CREATE TABLE IF NOT EXISTS "public"."inventory_count_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "count_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "expected" numeric NOT NULL,
    "counted" numeric NOT NULL,
    "variance" numeric NOT NULL,
    "unit_price" numeric,
    "currency" "text",
    CONSTRAINT "inventory_count_lines_counted_nonneg" CHECK (("counted" >= (0)::numeric)),
    CONSTRAINT "inventory_count_lines_currency_valid" CHECK ((("currency" IS NULL) OR ("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))))
);


ALTER TABLE "public"."inventory_count_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_count_lines" IS 'M171: سطرُ جرد — المتوقَّع (ما رآه العادّ) · المعدود · الفرقُ المطبَّق · السعرُ والعملةُ لحظةَ الجرد';



CREATE TABLE IF NOT EXISTS "public"."inventory_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_counts_note_len" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300)))
);


ALTER TABLE "public"."inventory_counts" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_counts" IS 'M171: رأسُ جردٍ دوري';



CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "reorder_level" numeric DEFAULT 0 NOT NULL,
    "purchase_price" numeric(14,2),
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expiry_date" "date",
    "currency" "text" NOT NULL,
    "reorder_qty" numeric,
    CONSTRAINT "inventory_items_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "inventory_items_quantity_nonneg" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "inventory_items_reorder_qty_pos" CHECK ((("reorder_qty" IS NULL) OR (("reorder_qty" > (0)::numeric) AND ("reorder_qty" <= (1000000)::numeric))))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_items"."reorder_qty" IS 'M170: كمية الطلب المعتادة (Order Qty) — «جهّز الطلبية» يقترح مضاعفاتها؛ NULL = غير محدّدة';



CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "change" numeric NOT NULL,
    "reason" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "uuid",
    "patient_id" "uuid",
    "provider_id" "uuid",
    "batch_id" "uuid",
    "count_id" "uuid",
    "order_line_id" "uuid",
    "receipt_id" "uuid",
    CONSTRAINT "inv_reason_valid" CHECK (("reason" = ANY (ARRAY['purchase'::"text", 'consume'::"text", 'adjust'::"text", 'return'::"text", 'count'::"text", 'return_supplier'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_movements"."session_id" IS 'M169: الجلسة التي استُهلكت لها المادة (ملكية: trg_inventory_movements_guard)';



COMMENT ON COLUMN "public"."inventory_movements"."patient_id" IS 'M169: مريضُ الجلسة — يُشتقّ بالقاعدة داخل inventory_consume';



COMMENT ON COLUMN "public"."inventory_movements"."provider_id" IS 'M169: طبيبُ الجلسة — يُشتقّ بالقاعدة داخل inventory_consume';



COMMENT ON COLUMN "public"."inventory_movements"."batch_id" IS 'M169: الدفعة التي خرجت منها الشريحة (NULL = رصيدٌ بلا دفعة)';



COMMENT ON COLUMN "public"."inventory_movements"."count_id" IS 'M171: الجردُ الذي سجّل هذا الفرق (reason = count)';



CREATE TABLE IF NOT EXISTS "public"."inventory_order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "qty_ordered" numeric NOT NULL,
    "qty_received" numeric DEFAULT 0 NOT NULL,
    "unit_price" numeric,
    "currency" "text" DEFAULT 'SYP'::"text" NOT NULL,
    CONSTRAINT "inventory_order_lines_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "inventory_order_lines_price_nonneg" CHECK ((("unit_price" IS NULL) OR ("unit_price" >= (0)::numeric))),
    CONSTRAINT "inventory_order_lines_qty_pos" CHECK ((("qty_ordered" > (0)::numeric) AND ("qty_ordered" <= (1000000)::numeric))),
    CONSTRAINT "inventory_order_lines_recv_nonneg" CHECK (("qty_received" >= (0)::numeric))
);


ALTER TABLE "public"."inventory_order_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_order_lines" IS 'M172: سطرُ طلبية — المطلوب والمستلَم والسعرُ بعملة الصنف';



CREATE TABLE IF NOT EXISTS "public"."inventory_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "note" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_orders_note_len" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300))),
    CONSTRAINT "inventory_orders_status_valid" CHECK (("status" = ANY (ARRAY['open'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."inventory_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_orders" IS 'M172: طلبيةُ شراء — status ∈ open/cancelled، والحالةُ المعروضة تُشتقّ من الأسطر';



CREATE TABLE IF NOT EXISTS "public"."inventory_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount_syp" numeric DEFAULT 0 NOT NULL,
    "amount_usd" numeric DEFAULT 0 NOT NULL,
    "expense_syp_id" "uuid",
    "expense_usd_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_receipts_amounts_nonneg" CHECK ((("amount_syp" >= (0)::numeric) AND ("amount_usd" >= (0)::numeric)))
);


ALTER TABLE "public"."inventory_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_receipts" IS 'M172: استلامٌ واحد — مجموعُه لكل عملة وربطُ مصروفه (لا تُسجَّل الفاتورةُ مرتين)';



CREATE TABLE IF NOT EXISTS "public"."inventory_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_suppliers_name_len" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "inventory_suppliers_note_len" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300))),
    CONSTRAINT "inventory_suppliers_phone_len" CHECK ((("phone" IS NULL) OR ("char_length"("phone") <= 30)))
);


ALTER TABLE "public"."inventory_suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_suppliers" IS 'M172: موردو المواد';



CREATE TABLE IF NOT EXISTS "public"."lab_order_redos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "lab_order_id" "uuid" NOT NULL,
    "reason" "text",
    "prev_status" "text" NOT NULL,
    "prev_date_received" timestamp with time zone,
    "prev_date_checked" timestamp with time zone,
    "prev_date_due" timestamp with time zone,
    "new_date_due" timestamp with time zone,
    "redo_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resent_at" timestamp with time zone,
    CONSTRAINT "lab_order_redos_reason_len" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 300)))
);


ALTER TABLE "public"."lab_order_redos" OWNER TO "postgres";


COMMENT ON TABLE "public"."lab_order_redos" IS 'M160: دورات إعادة العمل للمخبر — لقطة الدورة المنتهية + السبب + الاستحقاق الجديد + وقت إعادة الإرسال.';



CREATE TABLE IF NOT EXISTS "public"."lab_order_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "treatment_key" "text",
    "lab_id" "uuid",
    "shade" "text",
    "cost" numeric,
    "due_days" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_order_text" "text",
    "currency" "text",
    CONSTRAINT "lab_order_templates_currency_check" CHECK ((("currency" IS NULL) OR ("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))))
);


ALTER TABLE "public"."lab_order_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lab_order_templates"."currency" IS 'عملة cost. NULL = قالب ما قبل M130 (بلا عملة مخزَّنة) — يُطبَّق بعملة العيادة مع تنبيه.';



CREATE TABLE IF NOT EXISTS "public"."lab_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "patient_id" "uuid",
    "appointment_id" "uuid",
    "tooth_num" integer,
    "treatment_key" "text",
    "lab_name" "text" NOT NULL,
    "work_type" "text" NOT NULL,
    "shade" "text",
    "notes" "text",
    "cost" numeric(14,2) DEFAULT 0,
    "status" "text" DEFAULT 'sent'::"text",
    "date_sent" timestamp with time zone DEFAULT "now"(),
    "date_due" timestamp with time zone,
    "date_received" timestamp with time zone,
    "date_checked" timestamp with time zone,
    "date_delivered" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lab_id" "uuid",
    "provider_id" "uuid",
    "session_id" "uuid",
    "currency" "text" NOT NULL,
    CONSTRAINT "lab_orders_cost_nonneg" CHECK ((("cost" IS NULL) OR ("cost" >= (0)::numeric))),
    CONSTRAINT "lab_orders_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "lab_orders_draft_no_date_sent" CHECK (((("status" = 'draft'::"text") AND ("date_sent" IS NULL)) OR (("status" <> 'draft'::"text") AND ("date_sent" IS NOT NULL)))),
    CONSTRAINT "lab_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'received'::"text", 'checked'::"text", 'delivered'::"text", 'redo'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."lab_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "lab_id" "uuid",
    "amount" numeric NOT NULL,
    "pay_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    "cash_source" "text",
    CONSTRAINT "lab_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "lab_payments_cash_source_valid" CHECK ((("cash_source" IS NULL) OR ("cash_source" = ANY (ARRAY['drawer'::"text", 'outside'::"text"])))),
    CONSTRAINT "lab_payments_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."lab_payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lab_payments"."cash_source" IS 'M165: مصدرُ النقد — drawer | outside | NULL = drawer.';



CREATE TABLE IF NOT EXISTS "public"."labs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "name" "text" NOT NULL,
    "phone" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."labs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ledger_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "patient_id" "uuid",
    "amount" numeric NOT NULL,
    "method" "text",
    "date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "manual_allocation" boolean DEFAULT false NOT NULL,
    "currency" "text" NOT NULL,
    CONSTRAINT "ledger_payments_amount_positive" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "ledger_payments_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."ledger_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ledger_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "patient_id" "uuid",
    "type" "text",
    "treatment_key" "text",
    "description" "text",
    "cost" numeric DEFAULT 0,
    "date" "date",
    "notes" "text",
    "tooth_num" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "surface" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "provider_id" "uuid",
    "appointment_id" "uuid",
    "quadrant" "text",
    "arch" "text",
    "ortho_start" "date",
    "ortho_months" integer,
    "phase" smallint,
    "currency" "text" NOT NULL,
    "plan_option" smallint,
    "units" smallint,
    CONSTRAINT "ledger_sessions_arch_valid" CHECK ((("arch" IS NULL) OR ("arch" = ANY (ARRAY['U'::"text", 'L'::"text"])))),
    CONSTRAINT "ledger_sessions_cost_nonneg" CHECK ((("cost" IS NULL) OR ("cost" >= (0)::numeric))),
    CONSTRAINT "ledger_sessions_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "ledger_sessions_phase_check" CHECK ((("phase" IS NULL) OR (("phase" >= 1) AND ("phase" <= 3)))),
    CONSTRAINT "ledger_sessions_plan_option_check" CHECK ((("plan_option" IS NULL) OR (("plan_option" >= 1) AND ("plan_option" <= 3)))),
    CONSTRAINT "ledger_sessions_quadrant_valid" CHECK ((("quadrant" IS NULL) OR ("quadrant" = ANY (ARRAY['UR'::"text", 'UL'::"text", 'LR'::"text", 'LL'::"text"])))),
    CONSTRAINT "ledger_sessions_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'completed'::"text", 'existing_current'::"text", 'existing_other'::"text", 'referred'::"text", 'condition'::"text"]))),
    CONSTRAINT "ledger_sessions_surface_check" CHECK ((("surface" IS NULL) OR (("surface" ~ '^M?[OI]?D?B?L?V?$'::"text") AND ("surface" <> ''::"text")) OR ("surface" = ANY (ARRAY['WHOLE'::"text", 'PONTIC'::"text", 'CROWN_FULL'::"text", 'BRIDGE'::"text", 'SPACER'::"text", 'SOCKET'::"text", 'SXM'::"text", 'SXD'::"text", 'R1'::"text", 'R2'::"text", 'R3'::"text", 'R1R2'::"text", 'R1R3'::"text", 'R2R3'::"text", 'R1R2R3'::"text"])))),
    CONSTRAINT "ledger_sessions_units_range" CHECK ((("units" IS NULL) OR (("units" >= 1) AND ("units" <= 99))))
);


ALTER TABLE "public"."ledger_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ledger_sessions"."phase" IS 'Treatment-plan stage (1..3) for planned sessions; presentation-only, excluded from all financial logic.';



COMMENT ON COLUMN "public"."ledger_sessions"."plan_option" IS 'Alternative treatment-plan option (1..3 = أ/ب/ج) for planned sessions; NULL = shared by all options. Presentation-only, excluded from all financial logic.';



COMMENT ON COLUMN "public"."ledger_sessions"."units" IS 'عدد وحدات البند (أشعة ×4، جلسات تبييض ×3…). عرضيٌّ بحت: cost يبقى الإجمالي المخزَّن، فلا يدخل units أي حساب مالي (FIFO/computeFinancials). NULL أو 1 = وحدة واحدة.';



CREATE TABLE IF NOT EXISTS "public"."login_resolve_hits" (
    "bucket" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "hits" integer NOT NULL
);


ALTER TABLE "public"."login_resolve_hits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "description" "text",
    "body" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" smallint DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    CONSTRAINT "notification_templates_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"]))),
    CONSTRAINT "notification_templates_code_check" CHECK (("code" = ANY (ARRAY['wa_reminder'::"text", 'wa_welcome'::"text", 'wa_suspended'::"text", 'wa_renewed'::"text"])))
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operatories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#2ee89e'::"text",
    "default_provider_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operatories_name_len" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 50)))
);


ALTER TABLE "public"."operatories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "category" "text" DEFAULT 'other'::"text",
    "note" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tooth_num" "text",
    "session_id" "uuid",
    "lab_order_id" "uuid",
    "xray_type" "text",
    "teeth" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "taken_at" "date",
    "source" "text",
    "source_name" "text",
    "calib_mm_per_px" numeric,
    "annotations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cbct_url" "text",
    "portal_shared" boolean DEFAULT false NOT NULL,
    "portal_shared_at" timestamp with time zone,
    CONSTRAINT "patient_documents_annotations_check" CHECK ((("jsonb_typeof"("annotations") = 'array'::"text") AND ("pg_column_size"("annotations") <= 65536))),
    CONSTRAINT "patient_documents_calib_check" CHECK ((("calib_mm_per_px" IS NULL) OR (("calib_mm_per_px" > (0)::numeric) AND ("calib_mm_per_px" < (10)::numeric)))),
    CONSTRAINT "patient_documents_category_check" CHECK (("category" = ANY (ARRAY['xray'::"text", 'clinical_photo'::"text", 'document'::"text", 'receipt'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_documents_cbct_url_check" CHECK ((("cbct_url" IS NULL) OR (("cbct_url" ~ '^https://[^\s<>"]+$'::"text") AND ("char_length"("cbct_url") <= 2000)))),
    CONSTRAINT "patient_documents_portal_shared_check" CHECK ((("portal_shared" = false) OR ("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text"])))),
    CONSTRAINT "patient_documents_source_check" CHECK (((("source" IS NULL) OR ("source" = ANY (ARRAY['clinic'::"text", 'center'::"text"]))) AND (("source_name" IS NULL) OR (("source" = 'center'::"text") AND ("char_length"("source_name") <= 120))))),
    CONSTRAINT "patient_documents_teeth_check" CHECK ((("cardinality"("teeth") <= 52) AND ("array_to_string"("teeth", ','::"text") ~ '^(([1-4][1-8]|[5-8][1-5])(,([1-4][1-8]|[5-8][1-5]))*)?$'::"text"))),
    CONSTRAINT "patient_documents_xray_type_check" CHECK ((("xray_type" IS NULL) OR (("category" = 'xray'::"text") AND ("xray_type" = ANY (ARRAY['periapical'::"text", 'bitewing'::"text", 'panoramic'::"text", 'cephalometric'::"text", 'other'::"text"])))))
);


ALTER TABLE "public"."patient_documents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."patient_documents"."lab_order_id" IS 'M162: مرفقُ طلب مخبر (صورة اللون/الحالة/المسح) — يبقى ملفاً للمريض إن حُذف الطلب.';



COMMENT ON COLUMN "public"."patient_documents"."teeth" IS 'M192: أسنانُ الصورة (FDI) — المصدر؛ tooth_num مرآةٌ لأولها للقرّاء القدامى (تريغر).';



COMMENT ON COLUMN "public"."patient_documents"."taken_at" IS 'M192: تاريخُ التقاط الأشعة (لا تاريخ الرفع) — ترتيبُ الخط الزمني.';



COMMENT ON COLUMN "public"."patient_documents"."annotations" IS 'M192: تعليقاتُ العارض المرسومة بإحداثيات الصورة — منفصلةٌ عن الأصل الذي لا يُعاد كتابته.';



COMMENT ON COLUMN "public"."patient_documents"."cbct_url" IS 'M192: رابطُ عارض CBCT لدى الشركة/المركز (https فقط) — الحجمُ ثلاثيُّ الأبعاد خارج المنصة.';



COMMENT ON COLUMN "public"."patient_documents"."portal_shared" IS 'M193: الطبيب شارك هذه الصورة مع المريض ببوابته (تظهر فقط إن كان portal_show_xrays مفعّلاً) — الأصل وحده بلا تعليقات.';



CREATE TABLE IF NOT EXISTS "public"."patient_intakes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "replace"((("gen_random_uuid"())::"text" || ("gen_random_uuid"())::"text"), '-'::"text", ''::"text") NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "answers" "jsonb",
    "signature" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    CONSTRAINT "patient_intakes_created_by_check" CHECK ((("created_by" IS NULL) OR ("char_length"("created_by") <= 80))),
    CONSTRAINT "patient_intakes_reviewed_by_check" CHECK ((("reviewed_by" IS NULL) OR ("char_length"("reviewed_by") <= 80))),
    CONSTRAINT "patient_intakes_signature_check" CHECK ((("signature" IS NULL) OR (("char_length"("signature") <= 120000) AND ("signature" ~~ 'data:image/png;base64,%'::"text")))),
    CONSTRAINT "patient_intakes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'reviewed'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "patient_intakes_token_hex" CHECK (("token" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."patient_intakes" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_intakes" IS 'استمارة المريض الرقمية (M177): رابطٌ مرمَّز لكل مريض · إجاباتٌ مبيَّضة بالقاعدة · مراجعةٌ ودمجٌ بيد العيادة. توثيقي — لا أثر مالي.';



CREATE TABLE IF NOT EXISTS "public"."patient_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp_link'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "recipient_phone" "text",
    "sent_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_messages_body_len" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 6000))),
    CONSTRAINT "patient_messages_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp_link'::"text", 'copy'::"text", 'print'::"text", 'portal'::"text"]))),
    CONSTRAINT "patient_messages_kind_check" CHECK (("kind" = ANY (ARRAY['prescription'::"text", 'instructions'::"text", 'plan'::"text", 'installment'::"text", 'recall'::"text", 'birthday'::"text", 'review'::"text", 'referral'::"text", 'free'::"text", 'other'::"text", 'intake'::"text", 'portal'::"text"]))),
    CONSTRAINT "patient_messages_sent_by_len" CHECK ((("sent_by" IS NULL) OR ("char_length"("sent_by") <= 80)))
);


ALTER TABLE "public"."patient_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_messages" IS 'سجلّ مراسلات المريض (غير التذكيرات): ما فُتح به واتساب/نُسخ/طُبع من النظام. توثيقي بحت — لا يدخل أي حساب.';



CREATE TABLE IF NOT EXISTS "public"."patient_portals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "replace"((("gen_random_uuid"())::"text" || ("gen_random_uuid"())::"text"), '-'::"text", ''::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "renewed_at" timestamp with time zone,
    CONSTRAINT "patient_portals_created_by_check" CHECK ((("created_by" IS NULL) OR ("char_length"("created_by") <= 80))),
    CONSTRAINT "patient_portals_token_hex" CHECK (("token" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."patient_portals" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_portals" IS 'بوابة المريض الخفيفة (M180): رابطٌ مرمَّز لكل مريض · قراءةٌ فقط عبر portal_info · تجديدٌ وإيقافٌ بيد العيادة. توثيقي — لا أثر مالي.';



CREATE TABLE IF NOT EXISTS "public"."patient_recalls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "recalled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "note" "text",
    CONSTRAINT "patient_recalls_channel_chk" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'call'::"text", 'sms'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."patient_recalls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_seq" (
    "owner_id" "uuid" NOT NULL,
    "seq" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."patient_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid",
    "local_id" "text",
    "name" "text" NOT NULL,
    "phone" "text",
    "dob" "date",
    "gender" "text",
    "payment" "text" DEFAULT 'متبقي'::"text",
    "payment_manual" boolean DEFAULT false,
    "status" "text" DEFAULT 'جديد'::"text",
    "last_visit" "date",
    "allergies" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "dentition_mode" "text",
    "primary_teeth" "text",
    "medical_flags" "jsonb",
    "referral_source" "text",
    "medical_flags_other" "text",
    "family_id" "uuid",
    "flags" "jsonb",
    "referred_by_patient_id" "uuid",
    "referrer_name" "text",
    CONSTRAINT "patients_flags_array" CHECK ((("flags" IS NULL) OR (("jsonb_typeof"("flags") = 'array'::"text") AND ("jsonb_array_length"("flags") <= 8)))),
    CONSTRAINT "patients_referral_source_check" CHECK ((("referral_source" IS NULL) OR ("referral_source" = ANY (ARRAY['friend'::"text", 'search'::"text", 'social'::"text", 'walk_in'::"text", 'doctor_referral'::"text", 'booking'::"text", 'other'::"text"])))),
    CONSTRAINT "patients_referrer_name_len" CHECK ((("referrer_name" IS NULL) OR ("char_length"("referrer_name") <= 120)))
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."patients"."medical_flags" IS 'مصفوفة JSONB من مفاتيح تحذيرات طبية ثابتة (MEDICAL_FLAGS_DEFS ×4 + الحساسيات): diabetes/hypertension/cardiac/anticoagulants/pregnancy/asthma/bisphosphonates/bleeding/infectious/epilepsy/thyroid/kidney_liver/smoker + penicillin_allergy/latex_allergy/anesthetic_allergy/nsaid_allergy. التسمياتُ بالواجهة وحدها (M87 · v621/M183).';



COMMENT ON COLUMN "public"."patients"."flags" IS 'أعلام إدارية ملوّنة: مصفوفة مفاتيح من clinic_settings.patient_flag_defs. عرضية بحتة — لا تدخل أي حساب.';



COMMENT ON COLUMN "public"."patients"."referred_by_patient_id" IS 'M164: المريض الذي عرّف هذا المريض على العيادة (للمالك نفسه — trg_patients_referrer_guard)';



COMMENT ON COLUMN "public"."patients"."referrer_name" IS 'M164: اسم المُحيل الحرّ — الطبيب المحوِّل أو مُعرِّف ليس مريضاً (≤120)';



CREATE TABLE IF NOT EXISTS "public"."payment_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "title" "text",
    "total" numeric(14,2) NOT NULL,
    "installment_amount" numeric(14,2) NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    CONSTRAINT "payment_plans_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "payment_plans_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "payment_plans_installment_amount_check" CHECK (("installment_amount" > (0)::numeric)),
    CONSTRAINT "payment_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "payment_plans_total_check" CHECK (("total" > (0)::numeric))
);


ALTER TABLE "public"."payment_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perio_exams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "provider_id" "uuid",
    "exam_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."perio_exams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perio_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "exam_id" "uuid" NOT NULL,
    "tooth_num" smallint NOT NULL,
    "pd_mb" smallint,
    "pd_b" smallint,
    "pd_db" smallint,
    "pd_ml" smallint,
    "pd_l" smallint,
    "pd_dl" smallint,
    "bop_mb" boolean DEFAULT false NOT NULL,
    "bop_b" boolean DEFAULT false NOT NULL,
    "bop_db" boolean DEFAULT false NOT NULL,
    "bop_ml" boolean DEFAULT false NOT NULL,
    "bop_l" boolean DEFAULT false NOT NULL,
    "bop_dl" boolean DEFAULT false NOT NULL,
    "mobility" smallint,
    "rec_mb" smallint,
    "rec_b" smallint,
    "rec_db" smallint,
    "rec_ml" smallint,
    "rec_l" smallint,
    "rec_dl" smallint,
    "furcation" smallint,
    CONSTRAINT "perio_measurements_furcation_check" CHECK ((("furcation" >= 0) AND ("furcation" <= 3))),
    CONSTRAINT "perio_measurements_mobility_check" CHECK ((("mobility" >= 0) AND ("mobility" <= 3))),
    CONSTRAINT "perio_measurements_pd_b_check" CHECK ((("pd_b" >= 0) AND ("pd_b" <= 19))),
    CONSTRAINT "perio_measurements_pd_db_check" CHECK ((("pd_db" >= 0) AND ("pd_db" <= 19))),
    CONSTRAINT "perio_measurements_pd_dl_check" CHECK ((("pd_dl" >= 0) AND ("pd_dl" <= 19))),
    CONSTRAINT "perio_measurements_pd_l_check" CHECK ((("pd_l" >= 0) AND ("pd_l" <= 19))),
    CONSTRAINT "perio_measurements_pd_mb_check" CHECK ((("pd_mb" >= 0) AND ("pd_mb" <= 19))),
    CONSTRAINT "perio_measurements_pd_ml_check" CHECK ((("pd_ml" >= 0) AND ("pd_ml" <= 19))),
    CONSTRAINT "perio_measurements_rec_b_check" CHECK ((("rec_b" >= 0) AND ("rec_b" <= 19))),
    CONSTRAINT "perio_measurements_rec_db_check" CHECK ((("rec_db" >= 0) AND ("rec_db" <= 19))),
    CONSTRAINT "perio_measurements_rec_dl_check" CHECK ((("rec_dl" >= 0) AND ("rec_dl" <= 19))),
    CONSTRAINT "perio_measurements_rec_l_check" CHECK ((("rec_l" >= 0) AND ("rec_l" <= 19))),
    CONSTRAINT "perio_measurements_rec_mb_check" CHECK ((("rec_mb" >= 0) AND ("rec_mb" <= 19))),
    CONSTRAINT "perio_measurements_rec_ml_check" CHECK ((("rec_ml" >= 0) AND ("rec_ml" <= 19))),
    CONSTRAINT "perio_measurements_tooth_num_check" CHECK ((("tooth_num" >= 11) AND ("tooth_num" <= 48)))
);


ALTER TABLE "public"."perio_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."platform_admins" IS 'Phase F — platform-level admin role table. Replaces legacy doctors.role=admin flag. Users in this table have access to admin.html (platform control panel). They are NOT tenants — they have no clinic_employees/clinic_doctors row by design. However, they DO have a doctors row (created by handle_new_doctor trigger on signup) — that row carries tenant identity; this table marks them as additionally being a platform admin.';



COMMENT ON COLUMN "public"."platform_admins"."user_id" IS 'auth.users.id — also matches doctors.id (same canonical user ID across SyDent).';



COMMENT ON COLUMN "public"."platform_admins"."granted_at" IS 'When this user was granted platform admin role.';



COMMENT ON COLUMN "public"."platform_admins"."granted_by" IS 'The platform admin who granted this role, OR NULL for system/migration backfill.';



COMMENT ON COLUMN "public"."platform_admins"."notes" IS 'Optional human-readable context (e.g. "Granted via admin.html UI", "Manual recovery").';



CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text"
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_settings_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "kind" "text" NOT NULL,
    "applied" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "reason" "text",
    "preference" "text",
    "note" "text",
    "appt_date" "date",
    "appt_time" time without time zone,
    "patient_name_snapshot" "text",
    "handled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requested_date" "date",
    "requested_time" time without time zone,
    CONSTRAINT "portal_requests_kind_check" CHECK (("kind" = ANY (ARRAY['cancel'::"text", 'change'::"text"]))),
    CONSTRAINT "portal_requests_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300))),
    CONSTRAINT "portal_requests_preference_check" CHECK ((("preference" IS NULL) OR ("preference" = ANY (ARRAY['any'::"text", 'morning'::"text", 'evening'::"text"])))),
    CONSTRAINT "portal_requests_reason_check" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 300))),
    CONSTRAINT "portal_requests_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'handled'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."portal_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_requests" IS 'بوابة المريض (M187): إلغاءٌ/طلبُ تغيير موعد أرسله المريض من بوابته — صندوقُ العيادة بصفحة المواعيد وتنبيهٌ لحظي باسم المريض. توثيقي — لا أثر مالي.';



CREATE TABLE IF NOT EXISTS "public"."post_op_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "treatment_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_op_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_op_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "treatment_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_op_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "prescription_id" "uuid" NOT NULL,
    "drug_name" "text" NOT NULL,
    "dosage" "text",
    "frequency" "text",
    "duration" "text",
    "instructions" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."prescription_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prescription_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "provider_id" "uuid",
    "appointment_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "provider_id" "uuid",
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "notes" "text",
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text",
    "breakdown_salary" numeric(14,2) DEFAULT 0,
    "breakdown_share" numeric(14,2) DEFAULT 0,
    "breakdown_bonus" numeric(14,2) DEFAULT 0,
    "employee_id" "uuid",
    "currency" "text" NOT NULL,
    "cash_source" "text",
    CONSTRAINT "breakdown_nonneg" CHECK (((("breakdown_salary" IS NULL) OR ("breakdown_salary" >= (0)::numeric)) AND (("breakdown_share" IS NULL) OR ("breakdown_share" >= (0)::numeric)) AND (("breakdown_bonus" IS NULL) OR ("breakdown_bonus" >= (0)::numeric)))),
    CONSTRAINT "payment_method_valid" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['cash'::"text", 'bank'::"text", 'check'::"text", 'other'::"text", 'shamcash'::"text", 'syriatel'::"text", 'mtn'::"text", 'online'::"text"])))),
    CONSTRAINT "payouts_has_target" CHECK ((("provider_id" IS NOT NULL) OR ("employee_id" IS NOT NULL))),
    CONSTRAINT "provider_payouts_amount_positive" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "provider_payouts_cash_source_valid" CHECK ((("cash_source" IS NULL) OR (("cash_source" = ANY (ARRAY['drawer'::"text", 'outside'::"text"])) AND ("payment_method" = 'cash'::"text")))),
    CONSTRAINT "provider_payouts_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."provider_payouts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."provider_payouts"."cash_source" IS 'M165: مصدرُ النقد — drawer | outside | NULL = drawer. نقداً فقط.';



CREATE TABLE IF NOT EXISTS "public"."reminder_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp_link'::"text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "message_text" "text" NOT NULL,
    "recipient_phone" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reminder_logs_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp_link'::"text", 'whatsapp_api'::"text", 'sms'::"text", 'manual'::"text"]))),
    CONSTRAINT "reminder_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'opened'::"text"])))
);


ALTER TABLE "public"."reminder_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "date_from" "date" NOT NULL,
    "date_to" "date",
    "weekdays" smallint[],
    "start_time" time(0) without time zone,
    "end_time" time(0) without time zone,
    "operatory_id" "uuid",
    "provider_id" "uuid",
    "blocks_scheduling" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_blocks_kind_chk" CHECK (("kind" = ANY (ARRAY['break'::"text", 'leave'::"text", 'meeting'::"text", 'power'::"text", 'reserved'::"text", 'other'::"text"]))),
    CONSTRAINT "schedule_blocks_range_chk" CHECK ((("date_to" IS NULL) OR (("date_to" >= "date_from") AND (("date_to" - "date_from") <= 366)))),
    CONSTRAINT "schedule_blocks_time_chk" CHECK (((("start_time" IS NULL) AND ("end_time" IS NULL)) OR (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("end_time" > "start_time")))),
    CONSTRAINT "schedule_blocks_title_len" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 60))),
    CONSTRAINT "schedule_blocks_weekdays_chk" CHECK ((("weekdays" IS NULL) OR ((("cardinality"("weekdays") >= 1) AND ("cardinality"("weekdays") <= 7)) AND ("weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))))
);


ALTER TABLE "public"."schedule_blocks" OWNER TO "postgres";


COMMENT ON TABLE "public"."schedule_blocks" IS 'M154: الحجوزات المغلقة على التقويم (استراحة/إجازة/اجتماع/انقطاع/محجوز لنوع). NULL operatory+provider = كل العيادة.';



COMMENT ON COLUMN "public"."schedule_blocks"."date_to" IS 'M155: NULL = بلا نهاية (حجزٌ دائم)';



CREATE TABLE IF NOT EXISTS "public"."staff_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "sender_employee_id" "uuid",
    "sender_name" "text" NOT NULL,
    "sender_role" "text",
    "target_role" "text",
    "body" "text" NOT NULL,
    "patient_id" "uuid",
    "patient_name" "text",
    "acked_at" timestamp with time zone,
    "acked_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_messages_body_check" CHECK (("char_length"("body") <= 300)),
    CONSTRAINT "staff_messages_target_role_check" CHECK (("target_role" = ANY (ARRAY['owner'::"text", 'doctor'::"text", 'secretary'::"text"])))
);


ALTER TABLE "public"."staff_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trial_request_id" "uuid",
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "from_plan" "text",
    "to_plan" "text",
    "from_status" "text",
    "to_status" "text",
    "from_trial_end" timestamp with time zone,
    "to_trial_end" timestamp with time zone,
    "amount" numeric(12,2),
    "currency" "text" DEFAULT 'SYP'::"text",
    "notes" "text",
    "performed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "from_value" "text",
    "to_value" "text",
    CONSTRAINT "subscription_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['accept'::"text", 'convert_monthly'::"text", 'convert_yearly'::"text", 'renew'::"text", 'extend'::"text", 'shorten'::"text", 'enter_grace'::"text", 'reactivate'::"text", 'suspend'::"text", 'delete'::"text", 'activate_permanent'::"text", 'convert_permanent_yearly'::"text", 'reject'::"text", 'promote_to_admin'::"text", 'demote_from_admin'::"text", 'plan_updated'::"text", 'template_updated'::"text", 'convert_plan'::"text", 'plan_created'::"text", 'plan_deleted'::"text", 'ai_override_set'::"text", 'clinic_name_changed'::"text", 'owner_name_changed'::"text", 'restart_trial'::"text"])))
);


ALTER TABLE "public"."subscription_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_user_id" "uuid" NOT NULL,
    "doctor_id" "uuid",
    "amount" bigint NOT NULL,
    "currency" "text" DEFAULT 'SYP'::"text" NOT NULL,
    "method" "text" NOT NULL,
    "reference" "text",
    "paid_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "plan_code" "text",
    "billing_cycle" "text",
    "covers_from" "date",
    "covers_to" "date",
    "event_id" "uuid",
    "note" "text",
    "recorded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "void_reason" "text",
    CONSTRAINT "subscription_payments_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "subscription_payments_billing_cycle_chk" CHECK ((("billing_cycle" IS NULL) OR ("billing_cycle" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'yearly'::"text"])))),
    CONSTRAINT "subscription_payments_method_check" CHECK (("method" = ANY (ARRAY['sham_cash'::"text", 'transfer'::"text", 'bank_card'::"text", 'cash'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "duration_days" integer NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'SYP'::"text" NOT NULL,
    "features" "jsonb",
    "max_employees" integer,
    "max_patients" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    "entitlements" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "icon" "text",
    "subtitle" "text",
    "price_period_label" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    "featured_label" "text",
    "price_monthly" numeric,
    "price_yearly" numeric,
    "subtitle_yearly" "text",
    "price_quarterly" numeric,
    "subtitle_quarterly" "text",
    "price_monthly_usd" numeric,
    "price_quarterly_usd" numeric,
    "price_yearly_usd" numeric,
    "features_all" "jsonb"
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_plans"."features" IS 'Visible feature lines only, plain JSON strings, in display order. Never store objects here.';



COMMENT ON COLUMN "public"."subscription_plans"."price_quarterly" IS 'Migration 104: price for the 90-day quarterly cycle. NULL = tier does not offer a quarterly cycle.';



COMMENT ON COLUMN "public"."subscription_plans"."subtitle_quarterly" IS 'Migration 104: subtitle shown when the quarterly cycle is selected. NULL/blank falls back to subtitle (same contract as subtitle_yearly).';



COMMENT ON COLUMN "public"."subscription_plans"."price_monthly_usd" IS 'Migration 105: hand-set USD price for the monthly cycle. NULL = (monthly × USD) not offered. Never derived from SYP by a rate.';



COMMENT ON COLUMN "public"."subscription_plans"."price_quarterly_usd" IS 'Migration 105: hand-set USD price for the quarterly cycle. NULL = not offered.';



COMMENT ON COLUMN "public"."subscription_plans"."price_yearly_usd" IS 'Migration 105: hand-set USD price for the yearly cycle. NULL = not offered.';



COMMENT ON COLUMN "public"."subscription_plans"."features_all" IS 'Migration 106: full ordered feature list for the admin editor. Item = plain string (visible) or {"t":"text","h":true} (hidden).';



CREATE TABLE IF NOT EXISTS "public"."subscription_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trial_request_id" "uuid",
    "request_kind" "text" NOT NULL,
    "requested_plan" "text" NOT NULL,
    "current_plan" "text",
    "payment_method" "text" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    "billing_cycle" "text",
    "currency" "text",
    "payment_ref" "text",
    "receipt_path" "text",
    CONSTRAINT "subscription_requests_billing_cycle_chk" CHECK ((("billing_cycle" IS NULL) OR ("billing_cycle" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'yearly'::"text"])))),
    CONSTRAINT "subscription_requests_currency_chk" CHECK ((("currency" IS NULL) OR ("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))),
    CONSTRAINT "subscription_requests_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['sham_cash'::"text", 'transfer'::"text", 'bank_card'::"text", 'cash'::"text"]))),
    CONSTRAINT "subscription_requests_request_kind_check" CHECK (("request_kind" = ANY (ARRAY['upgrade'::"text", 'renew'::"text"]))),
    CONSTRAINT "subscription_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."subscription_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_requests"."currency" IS 'Migration 105: currency the doctor chose at request time (SYP/USD). NULL = legacy request (treated as SYP).';



CREATE TABLE IF NOT EXISTS "public"."teeth_status" (
    "doctor_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "tooth_num" "text" NOT NULL,
    "treatment_key" "text",
    "surface" "text" DEFAULT 'O'::"text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "provider_id" "uuid",
    "review_at" "date",
    "unit_id" "uuid",
    "dx_key" "text",
    CONSTRAINT "teeth_status_dx_key_check" CHECK ((("dx_key" IS NULL) OR (("length"("dx_key") <= 400) AND ("dx_key" ~ '^[A-Z0-9]+:cond-[a-z-]+(,[A-Z0-9]+:cond-[a-z-]+)*$'::"text")))),
    CONSTRAINT "teeth_status_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'completed'::"text", 'existing_current'::"text", 'existing_other'::"text", 'referred'::"text", 'condition'::"text"]))),
    CONSTRAINT "teeth_status_surface_check" CHECK (((("surface" ~ '^M?[OI]?D?B?L?V?$'::"text") AND ("surface" <> ''::"text")) OR ("surface" = ANY (ARRAY['WHOLE'::"text", 'PONTIC'::"text", 'CROWN_FULL'::"text", 'BRIDGE'::"text", 'SPACER'::"text", 'SOCKET'::"text", 'COND'::"text", 'SXM'::"text", 'SXD'::"text", 'R1'::"text", 'R2'::"text", 'R3'::"text", 'R1R2'::"text", 'R1R3'::"text", 'R2R3'::"text", 'R1R2R3'::"text"]))))
);


ALTER TABLE "public"."teeth_status" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teeth_status"."review_at" IS 'Scheduled follow-up date for status=''condition'' rows (مراقبة). Cleared (null) when the surface is re-saved with any other status.';



COMMENT ON COLUMN "public"."teeth_status"."unit_id" IS 'Explicit prosthetic-unit membership (bridge v1): all rows written for one bridge share one uuid. NULL = legacy row, unit inferred by adjacency.';



COMMENT ON COLUMN "public"."teeth_status"."dx_key" IS 'M179: diagnosis(es) this treatment row replaced on the same surface — "SURF:cond-key[,SURF:cond-key]". Kept through planned→completed; NULL on condition rows. Set by trg_teeth_status_dx; the client sends it only for composite saves that subsume component condition rows.';



CREATE TABLE IF NOT EXISTS "public"."teeth_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "tooth_num" "text" NOT NULL,
    "surface" "text" NOT NULL,
    "treatment_key" "text",
    "status" "text",
    "provider_id" "uuid",
    "review_at" "date",
    "op" character(1) NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dx_key" "text",
    CONSTRAINT "teeth_status_history_op_check" CHECK (("op" = ANY (ARRAY['I'::"bpchar", 'U'::"bpchar", 'D'::"bpchar"])))
);


ALTER TABLE "public"."teeth_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."treatment_bundles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "qty_per_use" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."treatment_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "old_price" numeric,
    "new_price" numeric,
    "doctor_id_override" "uuid",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    CONSTRAINT "treatment_price_history_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."treatment_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "treatment_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "label" "text",
    "fill" "text",
    "stroke" "text",
    "price" numeric DEFAULT 0,
    "builtin" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "needs_lab" boolean DEFAULT false,
    "target_part" "text" DEFAULT 'crown'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "default_note" "text",
    "completion_note" "text",
    "price_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_bundle" boolean DEFAULT false NOT NULL,
    "layman_name" "text",
    "is_favorite" boolean DEFAULT false,
    "post_extraction" boolean DEFAULT false NOT NULL,
    "currency" "text" NOT NULL,
    "dentition_scope" "text" DEFAULT 'all'::"text" NOT NULL,
    "accepts_units" boolean DEFAULT false NOT NULL,
    "lab_days" smallint,
    CONSTRAINT "treatments_currency_valid" CHECK (("currency" = ANY (ARRAY['SYP'::"text", 'USD'::"text"]))),
    CONSTRAINT "treatments_dentition_scope_check" CHECK (("dentition_scope" = ANY (ARRAY['all'::"text", 'primary'::"text", 'permanent'::"text"]))),
    CONSTRAINT "treatments_lab_days_range" CHECK ((("lab_days" IS NULL) OR (("lab_days" >= 1) AND ("lab_days" <= 60)))),
    CONSTRAINT "treatments_layman_name_length" CHECK ((("layman_name" IS NULL) OR ("char_length"("layman_name") <= 100))),
    CONSTRAINT "treatments_target_part_check" CHECK (("target_part" = ANY (ARRAY['crown'::"text", 'root'::"text", 'whole'::"text", 'crown_full'::"text", 'bridge'::"text", 'extraction'::"text", 'implant'::"text", 'quadrant'::"text", 'arch'::"text", 'mouth'::"text"])))
);


ALTER TABLE "public"."treatments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."treatments"."dentition_scope" IS 'Which dentition the treatment is offered on in the tooth pickers: all | primary | permanent. Presentation-only filter; excluded from all financial logic.';



COMMENT ON COLUMN "public"."treatments"."accepts_units" IS 'يقبل عدد وحدات: يُظهر حقل «عدد الوحدات» بمودال العلاج (أشعة ×4، تقليح ×4 أرباع…). مفتاحٌ صريح بتعريف العلاج — لا يُستنتج من التصنيف (نمط Open Dental Unit Quantity · Denticon Charting flags). عرضيٌّ بحت: cost يبقى الإجمالي المخزَّن.';



COMMENT ON COLUMN "public"."treatments"."lab_days" IS 'M161: أيام الدوام المعتادة لتصنيع هذا العلاج بالمخبر — مصدر الاستحقاق التلقائي بطلب المخبر.';



CREATE TABLE IF NOT EXISTS "public"."trial_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "city" "text",
    "notes" "text",
    "status" "text" DEFAULT 'new'::"text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trial_end" timestamp with time zone,
    "user_id" "uuid",
    "plan" "text" DEFAULT 'trial'::"text" NOT NULL,
    "grace_until" timestamp with time zone,
    "price_paid" numeric(12,2),
    "converted_at" timestamp with time zone,
    "currency" "text" DEFAULT 'SYP'::"text",
    "billing_cycle" "text",
    "ai_override" boolean,
    "syndicate_no" "text",
    "wipe_started_at" timestamp with time zone,
    CONSTRAINT "trial_requests_billing_cycle_chk" CHECK ((("billing_cycle" IS NULL) OR ("billing_cycle" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'yearly'::"text"])))),
    CONSTRAINT "trial_requests_syndicate_no_len" CHECK ((("syndicate_no" IS NULL) OR ("char_length"("syndicate_no") <= 30)))
);


ALTER TABLE "public"."trial_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."trial_requests"."city" IS 'فرع نقابة أطباء الأسنان (اسم المحافظة). الاسم التاريخي city محفوظ عمداً — مقروء بسبعة مواضع بطبقة الأدمن.';



COMMENT ON COLUMN "public"."trial_requests"."ai_override" IS 'تجاوز الأدمن لميزات الـAI لهذا الحساب: NULL=اتبع الخطة · TRUE=مفعّل (يتجاوز الخطة) · FALSE=مطفأ. لا يتجاوز opt-in العيادة (clinic_settings.ai_features_enabled).';



COMMENT ON COLUMN "public"."trial_requests"."syndicate_no" IS 'الرقم النقابي للطبيب (اختياري، يُدخل عند التسجيل) — للتحقق اليدوي عند التفعيل.';



COMMENT ON COLUMN "public"."trial_requests"."wipe_started_at" IS 'M142 — بداية نافذة محو الحساب (15 دقيقة): يضبطها begin_account_wipe() وحدها.';



CREATE TABLE IF NOT EXISTS "public"."wa_message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'wa_free'::"text" NOT NULL,
    CONSTRAINT "wa_message_templates_kind_check" CHECK (("kind" = ANY (ARRAY['wa_free'::"text", 'referral'::"text", 'health_post'::"text"])))
);


ALTER TABLE "public"."wa_message_templates" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_adjustments"
    ADD CONSTRAINT "account_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bridge_devices"
    ADD CONSTRAINT "bridge_devices_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."bridge_devices"
    ADD CONSTRAINT "bridge_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bridge_inbox"
    ADD CONSTRAINT "bridge_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bridge_inbox"
    ADD CONSTRAINT "bridge_inbox_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."bridge_pairings"
    ADD CONSTRAINT "bridge_pairings_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_doctors"
    ADD CONSTRAINT "clinic_doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_employees"
    ADD CONSTRAINT "clinic_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_owner_id_key" UNIQUE ("owner_id");



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_note_templates"
    ADD CONSTRAINT "clinical_note_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."day_closings"
    ADD CONSTRAINT "day_closings_one_per_day" UNIQUE ("owner_id", "day", "currency");



ALTER TABLE ONLY "public"."day_closings"
    ADD CONSTRAINT "day_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."implant_log"
    ADD CONSTRAINT "implant_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."implant_templates"
    ADD CONSTRAINT "implant_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_one_per_item" UNIQUE ("count_id", "item_id");



ALTER TABLE ONLY "public"."inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_counts"
    ADD CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_order_lines"
    ADD CONSTRAINT "inventory_order_lines_one_per_item" UNIQUE ("order_id", "item_id");



ALTER TABLE ONLY "public"."inventory_order_lines"
    ADD CONSTRAINT "inventory_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_orders"
    ADD CONSTRAINT "inventory_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_suppliers"
    ADD CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_order_redos"
    ADD CONSTRAINT "lab_order_redos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_order_templates"
    ADD CONSTRAINT "lab_order_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_payments"
    ADD CONSTRAINT "lab_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labs"
    ADD CONSTRAINT "labs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_payments"
    ADD CONSTRAINT "ledger_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_sessions"
    ADD CONSTRAINT "ledger_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_resolve_hits"
    ADD CONSTRAINT "login_resolve_hits_pkey" PRIMARY KEY ("bucket");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operatories"
    ADD CONSTRAINT "operatories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_intakes"
    ADD CONSTRAINT "patient_intakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_intakes"
    ADD CONSTRAINT "patient_intakes_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."patient_messages"
    ADD CONSTRAINT "patient_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_portals"
    ADD CONSTRAINT "patient_portals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_portals"
    ADD CONSTRAINT "patient_portals_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."patient_recalls"
    ADD CONSTRAINT "patient_recalls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_seq"
    ADD CONSTRAINT "patient_seq_pkey" PRIMARY KEY ("owner_id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perio_exams"
    ADD CONSTRAINT "perio_exams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perio_measurements"
    ADD CONSTRAINT "perio_measurements_exam_id_tooth_num_key" UNIQUE ("exam_id", "tooth_num");



ALTER TABLE ONLY "public"."perio_measurements"
    ADD CONSTRAINT "perio_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."platform_settings_audit"
    ADD CONSTRAINT "platform_settings_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."portal_requests"
    ADD CONSTRAINT "portal_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_op_notes"
    ADD CONSTRAINT "post_op_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_op_templates"
    ADD CONSTRAINT "post_op_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_templates"
    ADD CONSTRAINT "prescription_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_payouts"
    ADD CONSTRAINT "provider_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."subscription_requests"
    ADD CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."subscription_requests"
    ADD CONSTRAINT "subscription_requests_receipt_own_folder" CHECK ((("receipt_path" IS NULL) OR ("split_part"("receipt_path", '/'::"text", 1) = ("user_id")::"text"))) NOT VALID;



ALTER TABLE "public"."subscription_requests"
    ADD CONSTRAINT "subscription_requests_shamcash_proof" CHECK ((("payment_method" IS DISTINCT FROM 'sham_cash'::"text") OR ("receipt_path" IS NOT NULL) OR (NULLIF("btrim"("payment_ref"), ''::"text") IS NOT NULL))) NOT VALID;



ALTER TABLE ONLY "public"."teeth_status_history"
    ADD CONSTRAINT "teeth_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teeth_status"
    ADD CONSTRAINT "teeth_status_pkey" PRIMARY KEY ("doctor_id", "patient_id", "tooth_num", "surface");



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_materials"
    ADD CONSTRAINT "treatment_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_price_history"
    ADD CONSTRAINT "treatment_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_doctor_id_treatment_key_key" UNIQUE ("doctor_id", "treatment_key");



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trial_requests"
    ADD CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trial_requests"
    ADD CONSTRAINT "trial_requests_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."wa_message_templates"
    ADD CONSTRAINT "wa_message_templates_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_account_adjustments_provider_id" ON "public"."account_adjustments" USING "btree" ("provider_id");



CREATE INDEX "idx_adjustments_owner_date" ON "public"."account_adjustments" USING "btree" ("doctor_id", "date");



CREATE INDEX "idx_adjustments_patient" ON "public"."account_adjustments" USING "btree" ("patient_id");



CREATE INDEX "idx_adjustments_session" ON "public"."account_adjustments" USING "btree" ("session_id");



CREATE INDEX "idx_ai_usage_log_owner" ON "public"."ai_usage_log" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_appointment_types_default_lab_id" ON "public"."appointment_types" USING "btree" ("default_lab_id");



CREATE INDEX "idx_appointment_types_default_operatory_id" ON "public"."appointment_types" USING "btree" ("default_operatory_id");



CREATE INDEX "idx_appointment_types_default_provider_id" ON "public"."appointment_types" USING "btree" ("default_provider_id");



CREATE INDEX "idx_appointment_types_default_treatment_id" ON "public"."appointment_types" USING "btree" ("default_treatment_id");



CREATE INDEX "idx_appointments_asap" ON "public"."appointments" USING "btree" ("doctor_id") WHERE "asap";



CREATE INDEX "idx_appointments_operatory" ON "public"."appointments" USING "btree" ("operatory_id", "date");



CREATE INDEX "idx_appointments_planned" ON "public"."appointments" USING "btree" ("patient_id") WHERE ("is_planned" = true);



CREATE INDEX "idx_appointments_provider" ON "public"."appointments" USING "btree" ("provider_id", "date");



CREATE INDEX "idx_appointments_series" ON "public"."appointments" USING "btree" ("doctor_id", "series_id") WHERE ("series_id" IS NOT NULL);



CREATE INDEX "idx_appointments_treatment_id" ON "public"."appointments" USING "btree" ("treatment_id");



CREATE INDEX "idx_appt_types_doctor_active" ON "public"."appointment_types" USING "btree" ("doctor_id", "is_active", "sort_order");



CREATE INDEX "idx_appts_type" ON "public"."appointments" USING "btree" ("appointment_type_id") WHERE ("appointment_type_id" IS NOT NULL);



CREATE INDEX "idx_appts_waiting_room" ON "public"."appointments" USING "btree" ("doctor_id", "date", "arrived_at", "seated_at") WHERE (("arrived_at" IS NOT NULL) AND ("seated_at" IS NULL));



CREATE INDEX "idx_audit_log_action_type" ON "public"."audit_log" USING "btree" ("owner_id", "action_type", "created_at" DESC);



CREATE INDEX "idx_audit_log_alerts" ON "public"."audit_log" USING "btree" ("owner_id", "created_at" DESC) WHERE (("is_alert" = true) AND ("is_archived" = false));



CREATE INDEX "idx_audit_log_employee" ON "public"."audit_log" USING "btree" ("owner_id", "employee_id", "created_at" DESC) WHERE ("is_archived" = false);



CREATE INDEX "idx_audit_log_employee_id" ON "public"."audit_log" USING "btree" ("employee_id");



CREATE INDEX "idx_audit_log_owner_date" ON "public"."audit_log" USING "btree" ("owner_id", "created_at" DESC) WHERE ("is_archived" = false);



CREATE INDEX "idx_audit_log_patient" ON "public"."audit_log" USING "btree" ("owner_id", "patient_id", "created_at" DESC) WHERE (("patient_id" IS NOT NULL) AND ("is_archived" = false));



CREATE INDEX "idx_audit_log_patient_id" ON "public"."audit_log" USING "btree" ("patient_id");



CREATE INDEX "idx_booking_clinic_status" ON "public"."booking_requests" USING "btree" ("clinic_id", "status", "requested_date", "requested_time");



CREATE INDEX "idx_booking_requests_appointment_id" ON "public"."booking_requests" USING "btree" ("appointment_id");



CREATE INDEX "idx_bridge_devices_owner" ON "public"."bridge_devices" USING "btree" ("owner_id", "revoked_at");



CREATE INDEX "idx_bridge_inbox_owner" ON "public"."bridge_inbox" USING "btree" ("owner_id", "captured_at" DESC);



CREATE INDEX "idx_bridge_pairings_owner" ON "public"."bridge_pairings" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_bundles_parent" ON "public"."treatment_bundles" USING "btree" ("parent_id", "sort_order");



CREATE INDEX "idx_capture_requests_open" ON "public"."capture_requests" USING "btree" ("owner_id", "created_at") WHERE ("status" = 'open'::"text");



CREATE INDEX "idx_capture_requests_patient" ON "public"."capture_requests" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_clinic_doctors_owner" ON "public"."clinic_doctors" USING "btree" ("owner_id");



CREATE INDEX "idx_clinic_doctors_provider_type" ON "public"."clinic_doctors" USING "btree" ("provider_type") WHERE ("is_active" = true);



CREATE INDEX "idx_clinic_doctors_user_id" ON "public"."clinic_doctors" USING "btree" ("user_id");



CREATE INDEX "idx_clinic_employees_doctor" ON "public"."clinic_employees" USING "btree" ("doctor_id");



CREATE INDEX "idx_clinic_employees_owner" ON "public"."clinic_employees" USING "btree" ("owner_id", "is_active");



CREATE INDEX "idx_clinic_employees_provider_type" ON "public"."clinic_employees" USING "btree" ("owner_id", "provider_type") WHERE ("is_active" = true);



CREATE INDEX "idx_clinic_employees_system_access" ON "public"."clinic_employees" USING "btree" ("owner_id", "has_system_access") WHERE ("is_active" = true);



CREATE INDEX "idx_clinic_settings_owner" ON "public"."clinic_settings" USING "btree" ("owner_id");



CREATE INDEX "idx_expense_categories_owner_sort" ON "public"."expense_categories" USING "btree" ("owner_id", "sort_order", "name");



CREATE INDEX "idx_expenses_category_date" ON "public"."expenses" USING "btree" ("category_id", "date" DESC);



CREATE INDEX "idx_expenses_owner_date" ON "public"."expenses" USING "btree" ("owner_id", "date" DESC);



CREATE INDEX "idx_implant_log_patient" ON "public"."implant_log" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_implant_templates_owner" ON "public"."implant_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_inv_batch_item_open" ON "public"."inventory_batches" USING "btree" ("item_id") WHERE ("is_finished" = false);



CREATE INDEX "idx_inv_batches_item" ON "public"."inventory_batches" USING "btree" ("owner_id", "item_id", "is_finished");



CREATE INDEX "idx_inv_batches_lot" ON "public"."inventory_batches" USING "btree" ("owner_id", "lot_no") WHERE ("lot_no" IS NOT NULL);



CREATE INDEX "idx_inv_count_lines_count" ON "public"."inventory_count_lines" USING "btree" ("count_id");



CREATE INDEX "idx_inv_count_lines_item" ON "public"."inventory_count_lines" USING "btree" ("item_id");



CREATE INDEX "idx_inv_counts_owner" ON "public"."inventory_counts" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_inv_items_owner" ON "public"."inventory_items" USING "btree" ("owner_id", "is_active", "name");



CREATE INDEX "idx_inv_mov_batch" ON "public"."inventory_movements" USING "btree" ("batch_id") WHERE ("batch_id" IS NOT NULL);



CREATE INDEX "idx_inv_mov_count" ON "public"."inventory_movements" USING "btree" ("count_id") WHERE ("count_id" IS NOT NULL);



CREATE INDEX "idx_inv_mov_item" ON "public"."inventory_movements" USING "btree" ("item_id", "created_at" DESC);



CREATE INDEX "idx_inv_mov_order_line" ON "public"."inventory_movements" USING "btree" ("order_line_id") WHERE ("order_line_id" IS NOT NULL);



CREATE INDEX "idx_inv_mov_owner" ON "public"."inventory_movements" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_inv_mov_patient" ON "public"."inventory_movements" USING "btree" ("patient_id") WHERE ("patient_id" IS NOT NULL);



CREATE INDEX "idx_inv_mov_patient_consume" ON "public"."inventory_movements" USING "btree" ("patient_id", "created_at" DESC) WHERE (("patient_id" IS NOT NULL) AND ("reason" = 'consume'::"text"));



CREATE INDEX "idx_inv_mov_receipt" ON "public"."inventory_movements" USING "btree" ("receipt_id") WHERE ("receipt_id" IS NOT NULL);



CREATE INDEX "idx_inv_mov_session" ON "public"."inventory_movements" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_inv_order_lines_item" ON "public"."inventory_order_lines" USING "btree" ("item_id");



CREATE INDEX "idx_inv_order_lines_order" ON "public"."inventory_order_lines" USING "btree" ("order_id");



CREATE INDEX "idx_inv_orders_owner" ON "public"."inventory_orders" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_inv_orders_supplier" ON "public"."inventory_orders" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);



CREATE INDEX "idx_inv_receipts_exp_syp" ON "public"."inventory_receipts" USING "btree" ("expense_syp_id") WHERE ("expense_syp_id" IS NOT NULL);



CREATE INDEX "idx_inv_receipts_exp_usd" ON "public"."inventory_receipts" USING "btree" ("expense_usd_id") WHERE ("expense_usd_id" IS NOT NULL);



CREATE INDEX "idx_inv_receipts_order" ON "public"."inventory_receipts" USING "btree" ("order_id");



CREATE INDEX "idx_inv_suppliers_owner" ON "public"."inventory_suppliers" USING "btree" ("owner_id");



CREATE INDEX "idx_inventory_batches_item_id" ON "public"."inventory_batches" USING "btree" ("item_id");



CREATE INDEX "idx_lab_order_redos_doctor" ON "public"."lab_order_redos" USING "btree" ("doctor_id");



CREATE INDEX "idx_lab_order_redos_order" ON "public"."lab_order_redos" USING "btree" ("lab_order_id", "redo_at");



CREATE INDEX "idx_lab_order_templates_lab_id" ON "public"."lab_order_templates" USING "btree" ("lab_id");



CREATE INDEX "idx_lab_order_templates_owner" ON "public"."lab_order_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_lab_orders_appointment" ON "public"."lab_orders" USING "btree" ("appointment_id");



CREATE INDEX "idx_lab_orders_doctor" ON "public"."lab_orders" USING "btree" ("doctor_id");



CREATE INDEX "idx_lab_orders_draft" ON "public"."lab_orders" USING "btree" ("doctor_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "idx_lab_orders_lab" ON "public"."lab_orders" USING "btree" ("lab_id");



CREATE INDEX "idx_lab_orders_patient" ON "public"."lab_orders" USING "btree" ("patient_id");



CREATE INDEX "idx_lab_orders_provider_id" ON "public"."lab_orders" USING "btree" ("provider_id");



CREATE INDEX "idx_lab_orders_session_id" ON "public"."lab_orders" USING "btree" ("session_id");



CREATE INDEX "idx_lab_orders_status" ON "public"."lab_orders" USING "btree" ("doctor_id", "status");



CREATE INDEX "idx_lab_payments_doctor" ON "public"."lab_payments" USING "btree" ("doctor_id");



CREATE INDEX "idx_lab_payments_lab" ON "public"."lab_payments" USING "btree" ("lab_id");



CREATE INDEX "idx_labs_doctor" ON "public"."labs" USING "btree" ("doctor_id");



CREATE INDEX "idx_ledger_payments_doctor_id" ON "public"."ledger_payments" USING "btree" ("doctor_id");



CREATE INDEX "idx_ledger_provider" ON "public"."ledger_sessions" USING "btree" ("provider_id");



CREATE INDEX "idx_ledger_sessions_doctor_id" ON "public"."ledger_sessions" USING "btree" ("doctor_id");



CREATE INDEX "idx_note_templates_owner" ON "public"."clinical_note_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_notif_templates_active_sort" ON "public"."notification_templates" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_operatories_default_provider_id" ON "public"."operatories" USING "btree" ("default_provider_id");



CREATE INDEX "idx_operatories_doctor" ON "public"."operatories" USING "btree" ("doctor_id", "is_active", "sort_order");



CREATE INDEX "idx_patient_documents_appt" ON "public"."patient_documents" USING "btree" ("appointment_id");



CREATE INDEX "idx_patient_documents_lab_order" ON "public"."patient_documents" USING "btree" ("lab_order_id") WHERE ("lab_order_id" IS NOT NULL);



CREATE INDEX "idx_patient_documents_patient" ON "public"."patient_documents" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_patient_documents_portal_shared" ON "public"."patient_documents" USING "btree" ("patient_id") WHERE "portal_shared";



CREATE INDEX "idx_patient_documents_session_id" ON "public"."patient_documents" USING "btree" ("session_id");



CREATE INDEX "idx_patient_documents_storage_path" ON "public"."patient_documents" USING "btree" ("storage_path");



CREATE INDEX "idx_patient_intakes_owner_status" ON "public"."patient_intakes" USING "btree" ("owner_id", "status", "submitted_at" DESC);



CREATE INDEX "idx_patient_intakes_patient" ON "public"."patient_intakes" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_patient_messages_patient" ON "public"."patient_messages" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_patient_portals_patient" ON "public"."patient_portals" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_patients_family" ON "public"."patients" USING "btree" ("doctor_id", "family_id") WHERE ("family_id" IS NOT NULL);



CREATE INDEX "idx_patients_referred_by" ON "public"."patients" USING "btree" ("referred_by_patient_id") WHERE ("referred_by_patient_id" IS NOT NULL);



CREATE INDEX "idx_payment_plans_owner_status" ON "public"."payment_plans" USING "btree" ("doctor_id", "status");



CREATE INDEX "idx_payment_plans_patient" ON "public"."payment_plans" USING "btree" ("patient_id");



CREATE INDEX "idx_payments_manual_alloc" ON "public"."ledger_payments" USING "btree" ("patient_id", "manual_allocation");



CREATE INDEX "idx_payouts_provider" ON "public"."provider_payouts" USING "btree" ("provider_id", "period_end" DESC);



CREATE INDEX "idx_paysplits_doctor" ON "public"."payment_splits" USING "btree" ("doctor_id", "payment_date" DESC);



CREATE INDEX "idx_paysplits_patient" ON "public"."payment_splits" USING "btree" ("patient_id", "payment_date" DESC);



CREATE INDEX "idx_paysplits_payment" ON "public"."payment_splits" USING "btree" ("payment_id");



CREATE INDEX "idx_paysplits_provider" ON "public"."payment_splits" USING "btree" ("provider_id", "payment_date" DESC);



CREATE INDEX "idx_paysplits_session" ON "public"."payment_splits" USING "btree" ("session_id");



CREATE INDEX "idx_pdocs_patient_tooth" ON "public"."patient_documents" USING "btree" ("patient_id", "tooth_num");



CREATE INDEX "idx_perio_exams_patient" ON "public"."perio_exams" USING "btree" ("doctor_id", "patient_id", "exam_date" DESC);



CREATE INDEX "idx_perio_meas_exam" ON "public"."perio_measurements" USING "btree" ("exam_id");



CREATE INDEX "idx_platform_admins_granted_by" ON "public"."platform_admins" USING "btree" ("granted_by");



CREATE INDEX "idx_portal_requests_appt" ON "public"."portal_requests" USING "btree" ("appointment_id");



CREATE INDEX "idx_portal_requests_inbox" ON "public"."portal_requests" USING "btree" ("owner_id", "status", "created_at" DESC);



CREATE INDEX "idx_portal_requests_patient" ON "public"."portal_requests" USING "btree" ("patient_id");



CREATE INDEX "idx_portal_requests_rate" ON "public"."portal_requests" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_postop_notes_patient" ON "public"."post_op_notes" USING "btree" ("owner_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_postop_owner" ON "public"."post_op_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_prescription_items_owner_id" ON "public"."prescription_items" USING "btree" ("owner_id");



CREATE INDEX "idx_prescriptions_appointment_id" ON "public"."prescriptions" USING "btree" ("appointment_id");



CREATE INDEX "idx_prescriptions_provider_id" ON "public"."prescriptions" USING "btree" ("provider_id");



CREATE INDEX "idx_price_history_treatment" ON "public"."treatment_price_history" USING "btree" ("treatment_id", "changed_at" DESC);



CREATE INDEX "idx_provider_payouts_employee" ON "public"."provider_payouts" USING "btree" ("employee_id", "paid_at" DESC);



CREATE INDEX "idx_provider_payouts_paid_at" ON "public"."provider_payouts" USING "btree" ("owner_id", "paid_at" DESC);



CREATE INDEX "idx_provider_payouts_provider" ON "public"."provider_payouts" USING "btree" ("provider_id", "paid_at" DESC);



CREATE INDEX "idx_psa_changed_at" ON "public"."platform_settings_audit" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_psa_key" ON "public"."platform_settings_audit" USING "btree" ("setting_key", "changed_at" DESC);



CREATE INDEX "idx_recalls_patient" ON "public"."patient_recalls" USING "btree" ("owner_id", "patient_id", "recalled_at" DESC);



CREATE INDEX "idx_reminders_appointment" ON "public"."reminder_logs" USING "btree" ("appointment_id", "sent_at" DESC);



CREATE INDEX "idx_reminders_owner_date" ON "public"."reminder_logs" USING "btree" ("owner_id", "sent_at" DESC);



CREATE INDEX "idx_reminders_patient" ON "public"."reminder_logs" USING "btree" ("patient_id", "sent_at" DESC);



CREATE INDEX "idx_rx_items_rx" ON "public"."prescription_items" USING "btree" ("prescription_id", "sort_order");



CREATE INDEX "idx_rx_owner" ON "public"."prescriptions" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_rx_patient" ON "public"."prescriptions" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_rx_tmpl_owner" ON "public"."prescription_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_schedule_blocks_doctor_range" ON "public"."schedule_blocks" USING "btree" ("doctor_id", "date_from", "date_to");



CREATE INDEX "idx_sessions_appointment" ON "public"."ledger_sessions" USING "btree" ("appointment_id");



CREATE INDEX "idx_sessions_arch" ON "public"."ledger_sessions" USING "btree" ("patient_id", "arch") WHERE ("arch" IS NOT NULL);



CREATE INDEX "idx_sessions_quadrant" ON "public"."ledger_sessions" USING "btree" ("patient_id", "quadrant") WHERE ("quadrant" IS NOT NULL);



CREATE INDEX "idx_staff_messages_owner_created" ON "public"."staff_messages" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_staff_messages_patient_id" ON "public"."staff_messages" USING "btree" ("patient_id");



CREATE INDEX "idx_staff_messages_unacked" ON "public"."staff_messages" USING "btree" ("owner_id") WHERE ("acked_at" IS NULL);



CREATE INDEX "idx_sub_events_request" ON "public"."subscription_events" USING "btree" ("trial_request_id");



CREATE INDEX "idx_sub_events_type_date" ON "public"."subscription_events" USING "btree" ("event_type", "created_at");



CREATE INDEX "idx_sub_events_user" ON "public"."subscription_events" USING "btree" ("user_id");



CREATE INDEX "idx_sub_requests_status_created" ON "public"."subscription_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_sub_requests_user" ON "public"."subscription_requests" USING "btree" ("user_id");



CREATE INDEX "idx_subpay_event" ON "public"."subscription_payments" USING "btree" ("event_id");



CREATE INDEX "idx_subpay_paid_at" ON "public"."subscription_payments" USING "btree" ("paid_at" DESC);



CREATE INDEX "idx_subpay_tenant" ON "public"."subscription_payments" USING "btree" ("tenant_user_id", "paid_at" DESC);



CREATE INDEX "idx_subscription_requests_trial_request_id" ON "public"."subscription_requests" USING "btree" ("trial_request_id");



CREATE INDEX "idx_teeth_status_provider_id" ON "public"."teeth_status" USING "btree" ("provider_id");



CREATE INDEX "idx_teeth_status_tooth_surface" ON "public"."teeth_status" USING "btree" ("patient_id", "tooth_num", "surface");



CREATE INDEX "idx_tmat_owner" ON "public"."treatment_materials" USING "btree" ("owner_id");



CREATE INDEX "idx_tmat_treatment" ON "public"."treatment_materials" USING "btree" ("treatment_id");



CREATE INDEX "idx_treatment_bundles_child_id" ON "public"."treatment_bundles" USING "btree" ("child_id");



CREATE INDEX "idx_treatment_bundles_owner_id" ON "public"."treatment_bundles" USING "btree" ("owner_id");



CREATE INDEX "idx_treatment_materials_item_id" ON "public"."treatment_materials" USING "btree" ("item_id");



CREATE INDEX "idx_treatment_price_history_changed_by" ON "public"."treatment_price_history" USING "btree" ("changed_by");



CREATE INDEX "idx_treatment_price_history_doctor_id_override" ON "public"."treatment_price_history" USING "btree" ("doctor_id_override");



CREATE INDEX "idx_treatment_price_history_owner_id" ON "public"."treatment_price_history" USING "btree" ("owner_id");



CREATE INDEX "idx_tsh_doctor" ON "public"."teeth_status_history" USING "btree" ("doctor_id");



CREATE INDEX "idx_tsh_patient_time" ON "public"."teeth_status_history" USING "btree" ("patient_id", "changed_at");



CREATE INDEX "idx_wa_msg_templates_owner" ON "public"."wa_message_templates" USING "btree" ("owner_id", "created_at" DESC);



CREATE UNIQUE INDEX "patients_doctor_local_id_uniq" ON "public"."patients" USING "btree" ("doctor_id", "local_id");



CREATE UNIQUE INDEX "trial_requests_email_norm_active_uidx" ON "public"."trial_requests" USING "btree" ("lower"("btrim"("email"))) WHERE (("email" IS NOT NULL) AND ("email" <> ''::"text") AND ("status" <> 'rejected'::"text"));



CREATE UNIQUE INDEX "trial_requests_phone_canon_active_uidx" ON "public"."trial_requests" USING "btree" ("public"."normalize_phone"("phone")) WHERE (("phone" IS NOT NULL) AND ("phone" <> ''::"text") AND ("status" <> 'rejected'::"text"));



CREATE UNIQUE INDEX "uq_booking_pending_slot" ON "public"."booking_requests" USING "btree" ("clinic_id", "requested_date", "requested_time") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uq_clinic_employees_doctor_link" ON "public"."clinic_employees" USING "btree" ("doctor_id") WHERE ("doctor_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_clinic_employees_one_owner" ON "public"."clinic_employees" USING "btree" ("owner_id") WHERE ("role" = 'owner'::"text");



CREATE UNIQUE INDEX "uq_patient_intakes_pending" ON "public"."patient_intakes" USING "btree" ("patient_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uq_patient_portals_live" ON "public"."patient_portals" USING "btree" ("patient_id") WHERE ("revoked_at" IS NULL);



CREATE UNIQUE INDEX "uq_portal_requests_open" ON "public"."portal_requests" USING "btree" ("appointment_id", "kind") WHERE (("status" = 'new'::"text") AND ("applied" = false));



CREATE UNIQUE INDEX "uq_sub_requests_one_pending" ON "public"."subscription_requests" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "trg_bridge_devices_lock" BEFORE UPDATE ON "public"."bridge_devices" FOR EACH ROW EXECUTE FUNCTION "public"."_bridge_devices_lock"();



CREATE OR REPLACE TRIGGER "trg_capture_requests_guard" BEFORE INSERT OR UPDATE ON "public"."capture_requests" FOR EACH ROW EXECUTE FUNCTION "public"."capture_requests_guard"();



CREATE OR REPLACE TRIGGER "trg_clinic_doctors_clinical_only" BEFORE INSERT OR UPDATE OF "provider_type" ON "public"."clinic_doctors" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_clinical_provider_type"();



CREATE OR REPLACE TRIGGER "trg_clinic_employees_owner_name_audit" AFTER UPDATE ON "public"."clinic_employees" FOR EACH ROW WHEN ((("new"."role" = 'owner'::"text") AND ("old"."name" IS DISTINCT FROM "new"."name") AND (NULLIF("btrim"(COALESCE("old"."name", ''::"text")), ''::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."sydent_log_owner_name_change"();



CREATE OR REPLACE TRIGGER "trg_clinic_employees_updated_at" BEFORE UPDATE ON "public"."clinic_employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_clinic_employees_updated_at"();



CREATE OR REPLACE TRIGGER "trg_clinic_settings_name_audit" AFTER UPDATE ON "public"."clinic_settings" FOR EACH ROW WHEN ((("old"."clinic_name" IS DISTINCT FROM "new"."clinic_name") AND (NULLIF("btrim"(COALESCE("old"."clinic_name", ''::"text")), ''::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."sydent_log_clinic_name_change"();



CREATE OR REPLACE TRIGGER "trg_clinic_settings_name_source" BEFORE INSERT OR UPDATE OF "clinic_name" ON "public"."clinic_settings" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_clinic_name_source_maint"();



CREATE OR REPLACE TRIGGER "trg_clinic_settings_updated" BEFORE UPDATE ON "public"."clinic_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_clinic_settings_timestamp"();



CREATE OR REPLACE TRIGGER "trg_currency_account_adjustments" BEFORE INSERT OR UPDATE ON "public"."account_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'lock');



CREATE OR REPLACE TRIGGER "trg_currency_clinic_doctors" BEFORE INSERT OR UPDATE ON "public"."clinic_doctors" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'salary_currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_clinic_employees" BEFORE INSERT OR UPDATE ON "public"."clinic_employees" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'salary_currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_expenses" BEFORE INSERT OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_inventory_items" BEFORE INSERT OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_lab_orders" BEFORE INSERT OR UPDATE ON "public"."lab_orders" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_lab_payments" BEFORE INSERT OR UPDATE ON "public"."lab_payments" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'lock');



CREATE OR REPLACE TRIGGER "trg_currency_ledger_payments" BEFORE INSERT OR UPDATE ON "public"."ledger_payments" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'lock');



CREATE OR REPLACE TRIGGER "trg_currency_ledger_sessions" BEFORE INSERT OR UPDATE ON "public"."ledger_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'lock');



CREATE OR REPLACE TRIGGER "trg_currency_payment_plans" BEFORE INSERT OR UPDATE ON "public"."payment_plans" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_payment_splits" BEFORE INSERT OR UPDATE ON "public"."payment_splits" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_split_currency_guard"();



CREATE OR REPLACE TRIGGER "trg_currency_provider_payouts" BEFORE INSERT OR UPDATE ON "public"."provider_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_treatment_price_history" BEFORE INSERT OR UPDATE ON "public"."treatment_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('owner_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_currency_treatments" BEFORE INSERT OR UPDATE ON "public"."treatments" FOR EACH ROW EXECUTE FUNCTION "public"."sydent_currency_guard"('doctor_id', 'currency', 'nolock');



CREATE OR REPLACE TRIGGER "trg_detect_audit_alerts" BEFORE INSERT ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."detect_audit_alerts"();



CREATE OR REPLACE TRIGGER "trg_enforce_employee_limit" BEFORE INSERT OR UPDATE ON "public"."clinic_employees" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_employee_limit"();



CREATE OR REPLACE TRIGGER "trg_enforce_patient_limit" BEFORE INSERT ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_patient_limit"();



CREATE OR REPLACE TRIGGER "trg_expense_categories_updated_at" BEFORE UPDATE ON "public"."expense_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_inventory_batches_guard" BEFORE INSERT OR UPDATE ON "public"."inventory_batches" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_batches_guard"();



CREATE OR REPLACE TRIGGER "trg_inventory_count_lines_guard" BEFORE INSERT OR UPDATE OF "owner_id", "count_id", "item_id" ON "public"."inventory_count_lines" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_count_lines_guard"();



CREATE OR REPLACE TRIGGER "trg_inventory_items_trim_batches" AFTER UPDATE OF "quantity" ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_items_trim_batches"();



CREATE OR REPLACE TRIGGER "trg_inventory_movements_guard" BEFORE INSERT OR UPDATE OF "owner_id", "item_id", "session_id", "patient_id", "provider_id", "batch_id", "count_id", "order_line_id", "receipt_id" ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_movements_guard"();



CREATE OR REPLACE TRIGGER "trg_inventory_order_lines_guard" BEFORE INSERT OR UPDATE OF "owner_id", "order_id", "item_id" ON "public"."inventory_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_order_lines_guard"();



CREATE OR REPLACE TRIGGER "trg_inventory_orders_guard" BEFORE INSERT OR UPDATE OF "owner_id", "supplier_id" ON "public"."inventory_orders" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_orders_guard"();



CREATE OR REPLACE TRIGGER "trg_inventory_receipts_guard" BEFORE INSERT OR UPDATE OF "owner_id", "order_id", "expense_syp_id", "expense_usd_id" ON "public"."inventory_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_receipts_guard"();



CREATE OR REPLACE TRIGGER "trg_lab_order_redos_owner_guard" BEFORE INSERT OR UPDATE OF "lab_order_id", "doctor_id" ON "public"."lab_order_redos" FOR EACH ROW EXECUTE FUNCTION "public"."lab_order_redos_owner_guard"();



CREATE OR REPLACE TRIGGER "trg_lab_orders_redo_cycle" BEFORE UPDATE OF "status" ON "public"."lab_orders" FOR EACH ROW EXECUTE FUNCTION "public"."lab_orders_redo_cycle"();



CREATE OR REPLACE TRIGGER "trg_notification_templates_updated_at" BEFORE UPDATE ON "public"."notification_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_notification_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trg_operatories_updated_at" BEFORE UPDATE ON "public"."operatories" FOR EACH ROW EXECUTE FUNCTION "public"."set_operatories_updated_at"();



CREATE OR REPLACE TRIGGER "trg_patient_documents_lab_order_guard" BEFORE INSERT OR UPDATE OF "lab_order_id", "owner_id", "patient_id" ON "public"."patient_documents" FOR EACH ROW EXECUTE FUNCTION "public"."patient_documents_lab_order_guard"();



CREATE OR REPLACE TRIGGER "trg_patient_documents_share_stamp" BEFORE INSERT OR UPDATE OF "portal_shared", "portal_shared_at" ON "public"."patient_documents" FOR EACH ROW EXECUTE FUNCTION "public"."_patient_documents_share_stamp"();



CREATE OR REPLACE TRIGGER "trg_patient_documents_xray_guard" BEFORE INSERT OR UPDATE ON "public"."patient_documents" FOR EACH ROW EXECUTE FUNCTION "public"."patient_documents_xray_guard"();



CREATE OR REPLACE TRIGGER "trg_patients_referrer_guard" BEFORE INSERT OR UPDATE OF "referred_by_patient_id", "doctor_id" ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."patients_referrer_guard"();



CREATE OR REPLACE TRIGGER "trg_platform_settings_updated_at" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_platform_settings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_portal_requests_close" AFTER UPDATE OF "date", "time", "status" ON "public"."appointments" FOR EACH ROW WHEN ((("old"."date" IS DISTINCT FROM "new"."date") OR ("old"."time" IS DISTINCT FROM "new"."time") OR (("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = ANY (ARRAY['cancelled'::"text", 'completed'::"text", 'broken'::"text", 'no_show'::"text"]))))) EXECUTE FUNCTION "public"."_portal_requests_close"();



CREATE CONSTRAINT TRIGGER "trg_split_identity" AFTER INSERT OR DELETE OR UPDATE ON "public"."payment_splits" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."sydent_split_identity_check"();



CREATE OR REPLACE TRIGGER "trg_subscription_plans_updated_at" BEFORE UPDATE ON "public"."subscription_plans" FOR EACH ROW EXECUTE FUNCTION "public"."touch_subscription_plans_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_doctor_card_active" AFTER INSERT OR UPDATE OF "is_active", "doctor_id" ON "public"."clinic_employees" FOR EACH ROW EXECUTE FUNCTION "public"."sync_doctor_card_active"();



CREATE OR REPLACE TRIGGER "trg_teeth_status_dx" BEFORE INSERT OR UPDATE ON "public"."teeth_status" FOR EACH ROW EXECUTE FUNCTION "public"."fn_teeth_status_dx"();



CREATE OR REPLACE TRIGGER "trg_teeth_status_history" AFTER INSERT OR DELETE OR UPDATE ON "public"."teeth_status" FOR EACH ROW EXECUTE FUNCTION "public"."fn_teeth_status_history"();



CREATE OR REPLACE TRIGGER "trg_treatment_materials_guard" BEFORE INSERT OR UPDATE OF "owner_id", "item_id", "treatment_id" ON "public"."treatment_materials" FOR EACH ROW EXECUTE FUNCTION "public"."treatment_materials_guard"();



ALTER TABLE ONLY "public"."account_adjustments"
    ADD CONSTRAINT "account_adjustments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_adjustments"
    ADD CONSTRAINT "account_adjustments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_adjustments"
    ADD CONSTRAINT "account_adjustments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."account_adjustments"
    ADD CONSTRAINT "account_adjustments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_default_lab_id_fkey" FOREIGN KEY ("default_lab_id") REFERENCES "public"."labs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_default_operatory_id_fkey" FOREIGN KEY ("default_operatory_id") REFERENCES "public"."operatories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_default_provider_id_fkey" FOREIGN KEY ("default_provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_default_treatment_id_fkey" FOREIGN KEY ("default_treatment_id") REFERENCES "public"."treatments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_types"
    ADD CONSTRAINT "appointment_types_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_appointment_type_id_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "public"."appointment_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "public"."operatories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."clinic_employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_clinic_fk" FOREIGN KEY ("clinic_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bridge_devices"
    ADD CONSTRAINT "bridge_devices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bridge_inbox"
    ADD CONSTRAINT "bridge_inbox_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."bridge_devices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bridge_inbox"
    ADD CONSTRAINT "bridge_inbox_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bridge_pairings"
    ADD CONSTRAINT "bridge_pairings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."bridge_devices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."patient_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capture_requests"
    ADD CONSTRAINT "capture_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_doctors"
    ADD CONSTRAINT "clinic_doctors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_doctors"
    ADD CONSTRAINT "clinic_doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_employees"
    ADD CONSTRAINT "clinic_employees_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_employees"
    ADD CONSTRAINT "clinic_employees_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_note_templates"
    ADD CONSTRAINT "clinical_note_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_closings"
    ADD CONSTRAINT "day_closings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."implant_log"
    ADD CONSTRAINT "implant_log_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."implant_templates"
    ADD CONSTRAINT "implant_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_counts"
    ADD CONSTRAINT "inventory_counts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."inventory_order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_order_lines"
    ADD CONSTRAINT "inventory_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_order_lines"
    ADD CONSTRAINT "inventory_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."inventory_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_order_lines"
    ADD CONSTRAINT "inventory_order_lines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_orders"
    ADD CONSTRAINT "inventory_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_orders"
    ADD CONSTRAINT "inventory_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."inventory_suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_expense_syp_id_fkey" FOREIGN KEY ("expense_syp_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_expense_usd_id_fkey" FOREIGN KEY ("expense_usd_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."inventory_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_suppliers"
    ADD CONSTRAINT "inventory_suppliers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_order_redos"
    ADD CONSTRAINT "lab_order_redos_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_order_redos"
    ADD CONSTRAINT "lab_order_redos_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_order_templates"
    ADD CONSTRAINT "lab_order_templates_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_order_templates"
    ADD CONSTRAINT "lab_order_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_payments"
    ADD CONSTRAINT "lab_payments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_payments"
    ADD CONSTRAINT "lab_payments_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labs"
    ADD CONSTRAINT "labs_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_payments"
    ADD CONSTRAINT "ledger_payments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_payments"
    ADD CONSTRAINT "ledger_payments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_sessions"
    ADD CONSTRAINT "ledger_sessions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_sessions"
    ADD CONSTRAINT "ledger_sessions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_sessions"
    ADD CONSTRAINT "ledger_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_sessions"
    ADD CONSTRAINT "ledger_sessions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operatories"
    ADD CONSTRAINT "operatories_default_provider_id_fkey" FOREIGN KEY ("default_provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operatories"
    ADD CONSTRAINT "operatories_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_intakes"
    ADD CONSTRAINT "patient_intakes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_intakes"
    ADD CONSTRAINT "patient_intakes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_messages"
    ADD CONSTRAINT "patient_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_messages"
    ADD CONSTRAINT "patient_messages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_portals"
    ADD CONSTRAINT "patient_portals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_portals"
    ADD CONSTRAINT "patient_portals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_recalls"
    ADD CONSTRAINT "patient_recalls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_seq"
    ADD CONSTRAINT "patient_seq_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_referred_by_patient_id_fkey" FOREIGN KEY ("referred_by_patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."ledger_payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ledger_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perio_exams"
    ADD CONSTRAINT "perio_exams_doctor_fk" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perio_measurements"
    ADD CONSTRAINT "perio_measurements_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."perio_exams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_requests"
    ADD CONSTRAINT "portal_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_requests"
    ADD CONSTRAINT "portal_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_requests"
    ADD CONSTRAINT "portal_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_op_notes"
    ADD CONSTRAINT "post_op_notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_op_templates"
    ADD CONSTRAINT "post_op_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_templates"
    ADD CONSTRAINT "prescription_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_payouts"
    ADD CONSTRAINT "provider_payouts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."clinic_employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_payouts"
    ADD CONSTRAINT "provider_payouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_payouts"
    ADD CONSTRAINT "provider_payouts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "public"."operatories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_trial_request_id_fkey" FOREIGN KEY ("trial_request_id") REFERENCES "public"."trial_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."subscription_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_requests"
    ADD CONSTRAINT "subscription_requests_trial_request_id_fkey" FOREIGN KEY ("trial_request_id") REFERENCES "public"."trial_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_requests"
    ADD CONSTRAINT "subscription_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teeth_status"
    ADD CONSTRAINT "teeth_status_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teeth_status_history"
    ADD CONSTRAINT "teeth_status_history_doctor_fk" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teeth_status"
    ADD CONSTRAINT "teeth_status_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teeth_status"
    ADD CONSTRAINT "teeth_status_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_bundles"
    ADD CONSTRAINT "treatment_bundles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_materials"
    ADD CONSTRAINT "treatment_materials_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_materials"
    ADD CONSTRAINT "treatment_materials_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_materials"
    ADD CONSTRAINT "treatment_materials_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_price_history"
    ADD CONSTRAINT "treatment_price_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_price_history"
    ADD CONSTRAINT "treatment_price_history_doctor_id_override_fkey" FOREIGN KEY ("doctor_id_override") REFERENCES "public"."clinic_doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_price_history"
    ADD CONSTRAINT "treatment_price_history_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_price_history"
    ADD CONSTRAINT "treatment_price_history_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trial_requests"
    ADD CONSTRAINT "trial_requests_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wa_message_templates"
    ADD CONSTRAINT "wa_message_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin all access" ON "public"."trial_requests" TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "Doctors insert own profile" ON "public"."doctors" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Doctors manage own treatments" ON "public"."treatments" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "Doctors read own profile" ON "public"."doctors" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Doctors update own profile" ON "public"."doctors" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User read own trial" ON "public"."trial_requests" FOR SELECT TO "authenticated" USING (("email" = (( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text")));



ALTER TABLE "public"."account_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "account_adjustments_owner_all" ON "public"."account_adjustments" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."ai_usage_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_usage_log_owner_read" ON "public"."ai_usage_log" FOR SELECT USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."appointment_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointment_types_doctor_all" ON "public"."appointment_types" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_owner_all" ON "public"."audit_log" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "batch_owner_all" ON "public"."inventory_batches" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "booking_owner_all" ON "public"."booking_requests" USING (("clinic_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("clinic_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."booking_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bridge_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bridge_devices_owner_delete" ON "public"."bridge_devices" FOR DELETE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "bridge_devices_owner_select" ON "public"."bridge_devices" FOR SELECT USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "bridge_devices_owner_update" ON "public"."bridge_devices" FOR UPDATE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."bridge_inbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bridge_inbox_owner_delete" ON "public"."bridge_inbox" FOR DELETE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "bridge_inbox_owner_select" ON "public"."bridge_inbox" FOR SELECT USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."bridge_pairings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bridge_pairings_owner_delete" ON "public"."bridge_pairings" FOR DELETE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "bridge_pairings_owner_select" ON "public"."bridge_pairings" FOR SELECT USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."capture_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "capture_requests_owner_all" ON "public"."capture_requests" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."clinic_doctors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinic_doctors_owner_all" ON "public"."clinic_doctors" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."clinic_employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinic_employees_owner_all" ON "public"."clinic_employees" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."clinic_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinic_settings_owner_all" ON "public"."clinic_settings" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."clinical_note_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinical_note_templates_owner_all" ON "public"."clinical_note_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."day_closings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "day_closings_owner_all" ON "public"."day_closings" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "doctor manages own lab payments" ON "public"."lab_payments" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "doctor manages own labs" ON "public"."labs" TO "authenticated" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "doctor owns appointments" ON "public"."appointments" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "doctor owns ledger_payments" ON "public"."ledger_payments" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "doctor owns ledger_sessions" ON "public"."ledger_sessions" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "doctor owns patients" ON "public"."patients" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "doctor owns teeth_status" ON "public"."teeth_status" USING ((( SELECT "auth"."uid"() AS "uid") = "doctor_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "doctor_id"));



CREATE POLICY "doctor sees own lab orders" ON "public"."lab_orders" TO "authenticated" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."doctors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doctors_self_read" ON "public"."doctors" FOR SELECT USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_owner_all" ON "public"."expense_categories" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_owner_all" ON "public"."expenses" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."implant_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "implant_log_owner_all" ON "public"."implant_log" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."implant_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "implant_templates_owner_all" ON "public"."implant_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "inv_items_owner_all" ON "public"."inventory_items" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "inv_mov_owner_all" ON "public"."inventory_movements" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_count_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_count_lines_owner_all" ON "public"."inventory_count_lines" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_counts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_counts_owner_all" ON "public"."inventory_counts" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_order_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_order_lines_owner_all" ON "public"."inventory_order_lines" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_orders_owner_all" ON "public"."inventory_orders" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_receipts_owner_all" ON "public"."inventory_receipts" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."inventory_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_suppliers_owner_all" ON "public"."inventory_suppliers" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."lab_order_redos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_order_redos_owner_all" ON "public"."lab_order_redos" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."lab_order_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_order_templates_owner_all" ON "public"."lab_order_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."lab_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lab_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."labs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_resolve_hits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operatories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operatories_owner_all" ON "public"."operatories" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "p_clinic_settings_admin_read" ON "public"."clinic_settings" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "p_notif_templates_admin_write" ON "public"."notification_templates" TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_notif_templates_read" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "p_platform_settings_admin_read" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_platform_settings_admin_write" ON "public"."platform_settings" TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_platform_settings_anon_public_read" ON "public"."platform_settings" FOR SELECT TO "anon" USING (("key" = ANY (ARRAY['support_phone'::"text", 'support_email'::"text"])));



CREATE POLICY "p_platform_settings_tenant_read" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (("key" = ANY (ARRAY['support_phone'::"text", 'support_email'::"text", 'payment_instructions_ar'::"text", 'shamcash_account'::"text"])));



CREATE POLICY "p_sub_events_admin_insert" ON "public"."subscription_events" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_sub_events_admin_select" ON "public"."subscription_events" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_sub_plans_admin_write" ON "public"."subscription_plans" TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_sub_plans_read" ON "public"."subscription_plans" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "p_sub_requests_admin_select" ON "public"."subscription_requests" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_sub_requests_admin_update" ON "public"."subscription_requests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "p_sub_requests_tenant_insert" ON "public"."subscription_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "p_sub_requests_tenant_select" ON "public"."subscription_requests" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "p_sub_requests_tenant_update" ON "public"."subscription_requests" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'cancelled'::"text")));



ALTER TABLE "public"."patient_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_intakes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_intakes_owner_all" ON "public"."patient_intakes" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."patient_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_messages_owner_all" ON "public"."patient_messages" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."patient_portals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_portals_owner_all" ON "public"."patient_portals" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."patient_recalls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_recalls_owner_all" ON "public"."patient_recalls" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."patient_seq" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_seq_owner_all" ON "public"."patient_seq" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_plans_owner_all" ON "public"."payment_plans" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."payment_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_splits_doctor_all" ON "public"."payment_splits" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pd_all_own" ON "public"."patient_documents" TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."perio_exams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "perio_exams_own" ON "public"."perio_exams" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "perio_meas_own" ON "public"."perio_measurements" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."perio_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_admins_admin_all" ON "public"."platform_admins" TO "authenticated" USING (( SELECT "public"."is_platform_admin"() AS "is_platform_admin")) WITH CHECK (( SELECT "public"."is_platform_admin"() AS "is_platform_admin"));



CREATE POLICY "platform_admins_self_read" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portal_requests_owner_all" ON "public"."portal_requests" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."post_op_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_op_notes_owner_all" ON "public"."post_op_notes" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."post_op_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_op_tmpl_owner_all" ON "public"."post_op_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."prescription_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescription_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_history_owner_all" ON "public"."treatment_price_history" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."provider_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_payouts_owner_all" ON "public"."provider_payouts" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "psa_admin_insert" ON "public"."platform_settings_audit" FOR INSERT WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "psa_admin_read" ON "public"."platform_settings_audit" FOR SELECT USING ("public"."is_platform_admin"());



ALTER TABLE "public"."reminder_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminder_logs_owner_all" ON "public"."reminder_logs" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rx_items_owner_all" ON "public"."prescription_items" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rx_owner_all" ON "public"."prescriptions" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rx_tmpl_owner_all" ON "public"."prescription_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."schedule_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_blocks_owner_all" ON "public"."schedule_blocks" USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."staff_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_messages_owner_all" ON "public"."staff_messages" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "sub_gate_delete" ON "public"."account_adjustments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."ai_usage_log" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."appointment_types" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."appointments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."audit_log" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."booking_requests" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."bridge_devices" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."bridge_inbox" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."bridge_pairings" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."capture_requests" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."clinic_doctors" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."clinic_employees" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."clinic_settings" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."clinical_note_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."day_closings" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."doctors" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."expense_categories" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."expenses" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."implant_log" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."implant_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_batches" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_count_lines" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_counts" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_items" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_movements" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_order_lines" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_orders" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_receipts" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."inventory_suppliers" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."lab_order_redos" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."lab_order_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."lab_orders" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."lab_payments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."labs" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."ledger_payments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."ledger_sessions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."operatories" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_documents" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_intakes" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_messages" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_portals" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_recalls" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patient_seq" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."patients" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."payment_plans" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."payment_splits" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."perio_exams" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."perio_measurements" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."portal_requests" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."post_op_notes" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."post_op_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."prescription_items" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."prescription_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."prescriptions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."provider_payouts" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."reminder_logs" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."schedule_blocks" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."staff_messages" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."teeth_status" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."teeth_status_history" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."treatment_bundles" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."treatment_materials" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."treatment_price_history" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."treatments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_delete" ON "public"."wa_message_templates" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."account_adjustments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."ai_usage_log" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."appointment_types" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."appointments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."audit_log" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."booking_requests" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."bridge_devices" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."bridge_inbox" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."bridge_pairings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."capture_requests" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."clinic_doctors" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."clinic_employees" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."clinic_settings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."clinical_note_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."day_closings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."doctors" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."expense_categories" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."expenses" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."implant_log" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."implant_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_batches" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_count_lines" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_counts" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_items" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_movements" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_order_lines" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_orders" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_receipts" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."inventory_suppliers" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."lab_order_redos" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."lab_order_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."lab_orders" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."lab_payments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."labs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."ledger_payments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."ledger_sessions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."operatories" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_documents" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_intakes" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_portals" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_recalls" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patient_seq" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."patients" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."payment_plans" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."payment_splits" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."perio_exams" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."perio_measurements" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."portal_requests" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."post_op_notes" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."post_op_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."prescription_items" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."prescription_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."prescriptions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."provider_payouts" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."reminder_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."schedule_blocks" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."staff_messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."teeth_status" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."teeth_status_history" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."treatment_bundles" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."treatment_materials" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."treatment_price_history" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."treatments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_insert" ON "public"."wa_message_templates" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."account_adjustments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."ai_usage_log" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."appointment_types" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."appointments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."audit_log" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."booking_requests" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."bridge_devices" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."bridge_inbox" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."bridge_pairings" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."capture_requests" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."clinical_note_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."day_closings" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."expense_categories" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."expenses" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."implant_log" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."implant_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_batches" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_count_lines" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_counts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_items" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_movements" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_order_lines" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_orders" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_receipts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."inventory_suppliers" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."lab_order_redos" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."lab_order_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."lab_orders" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."lab_payments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."labs" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."ledger_payments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."ledger_sessions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."operatories" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_documents" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_intakes" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_portals" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_recalls" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patient_seq" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."patients" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."payment_plans" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."payment_splits" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."perio_exams" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."perio_measurements" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."portal_requests" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."post_op_notes" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."post_op_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."prescription_items" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."prescription_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."prescriptions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."provider_payouts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."reminder_logs" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."schedule_blocks" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."staff_messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."teeth_status" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."teeth_status_history" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."treatment_bundles" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."treatment_materials" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."treatment_price_history" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."treatments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_select" ON "public"."wa_message_templates" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") <> 'none'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."account_adjustments" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."ai_usage_log" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."appointment_types" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."appointments" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."audit_log" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."booking_requests" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."bridge_devices" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."bridge_inbox" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."bridge_pairings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."capture_requests" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."clinic_doctors" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."clinic_employees" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."clinic_settings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."clinical_note_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."day_closings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."doctors" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."expense_categories" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."expenses" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."implant_log" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."implant_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_batches" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_count_lines" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_counts" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_items" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_movements" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_order_lines" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_orders" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_receipts" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."inventory_suppliers" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."lab_order_redos" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."lab_order_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."lab_orders" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."lab_payments" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."labs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."ledger_payments" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."ledger_sessions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."operatories" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_documents" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_intakes" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_messages" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_portals" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_recalls" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patient_seq" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."patients" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."payment_plans" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."payment_splits" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."perio_exams" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."perio_measurements" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."portal_requests" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."post_op_notes" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."post_op_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."prescription_items" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."prescription_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."prescriptions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."provider_payouts" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."reminder_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."schedule_blocks" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."staff_messages" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."teeth_status" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."teeth_status_history" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."treatment_bundles" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."treatment_materials" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."treatment_price_history" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."treatments" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "sub_gate_update" ON "public"."wa_message_templates" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text")) WITH CHECK ((( SELECT "public"."my_access_level"() AS "my_access_level") = 'full'::"text"));



CREATE POLICY "subpay_admin_all" ON "public"."subscription_payments" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "subpay_tenant_read" ON "public"."subscription_payments" FOR SELECT USING (("tenant_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."subscription_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teeth_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teeth_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tmat_owner_all" ON "public"."treatment_materials" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."treatment_bundles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "treatment_bundles_owner_all" ON "public"."treatment_bundles" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."treatment_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trial_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trial_requests_self_insert" ON "public"."trial_requests" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("status" = 'new'::"text") AND ("ai_override" IS NULL)));



CREATE POLICY "trial_requests_self_select_by_uid" ON "public"."trial_requests" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tsh_select_own" ON "public"."teeth_status_history" FOR SELECT USING (("doctor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."wa_message_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wa_message_templates_owner_all" ON "public"."wa_message_templates" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "wipe_insert_guard" ON "public"."trial_requests" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((("wipe_started_at" IS NULL) OR ( SELECT "public"."is_platform_admin"() AS "is_platform_admin")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."account_adjustments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."appointments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_log";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."booking_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bridge_devices";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bridge_inbox";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."capture_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clinic_doctors";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clinic_employees";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."expenses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_movements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."lab_orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."lab_payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."labs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ledger_payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ledger_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."patient_documents";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."patient_intakes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."patient_portals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."patients";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payment_plans";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payment_splits";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."portal_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."provider_payouts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."staff_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."subscription_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."teeth_status";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trial_requests";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."_bridge_devices_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_bridge_devices_lock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_bridge_devices_lock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_intake_clinic_open"("p_clinic" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_intake_clinic_open"("p_clinic" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_login_resolve_bump"("p_bucket" "text", "p_limit" integer, "p_window" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_login_resolve_bump"("p_bucket" "text", "p_limit" integer, "p_window" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."_patient_documents_share_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_patient_documents_share_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_patient_documents_share_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pf_cap_bytes"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pf_cap_bytes"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_pf_used_bytes"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_pf_used_bytes"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_portal_free_slots"("p_owner" "uuid", "p_appt" "uuid", "p_dur" integer, "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_portal_free_slots"("p_owner" "uuid", "p_appt" "uuid", "p_dur" integer, "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_portal_requests_close"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_portal_requests_close"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sub_guard_table"("p_table" "regclass", "p_read_open" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sub_guard_table"("p_table" "regclass", "p_read_open" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_account_wipe"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_account_wipe"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_account_wipe"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_blocked_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_busy_slots"("p_clinic" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_clinic_info"("p_clinic" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_create_request"("p_clinic" "uuid", "p_name" "text", "p_phone" "text", "p_date" "date", "p_time" time without time zone, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_auth"("p_device" "uuid", "p_key_hash" "text", "p_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_auth"("p_device" "uuid", "p_key_hash" "text", "p_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_complete"("p_owner" "uuid", "p_device" "uuid", "p_request" "uuid", "p_path" "text", "p_name" "text", "p_mime" "text", "p_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_complete"("p_owner" "uuid", "p_device" "uuid", "p_request" "uuid", "p_path" "text", "p_name" "text", "p_mime" "text", "p_size" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_open_requests"("p_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_open_requests"("p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_pair"("p_code" "text", "p_key_hash" "text", "p_version" "text", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_pair"("p_code" "text", "p_key_hash" "text", "p_version" "text", "p_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_pairing_code"("p_device_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_pairing_code"("p_device_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bridge_pairing_code"("p_device_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bridge_upload_path"("p_owner" "uuid", "p_request" "uuid", "p_mime" "text", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bridge_upload_path"("p_owner" "uuid", "p_request" "uuid", "p_mime" "text", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."capture_requests_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."capture_requests_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_requests_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."detect_audit_alerts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."detect_audit_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_clinical_provider_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_clinical_provider_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_clinical_provider_type"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_employee_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_employee_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_patient_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_patient_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_teeth_status_dx"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_teeth_status_dx"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_teeth_status_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_teeth_status_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_doctor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_doctor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_owner_doctor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_owner_doctor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."intake_info"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."intake_info"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."intake_info"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."intake_info"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."intake_submit"("p_token" "text", "p_answers" "jsonb", "p_signature" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_apply_count"("p_lines" "jsonb", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_apply_count"("p_lines" "jsonb", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_apply_count"("p_lines" "jsonb", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_batches_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_batches_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_batches_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_consume"("p_lines" "jsonb", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_count_lines_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_count_lines_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_count_lines_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_create_order"("p_supplier" "uuid", "p_note" "text", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_create_order"("p_supplier" "uuid", "p_note" "text", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_create_order"("p_supplier" "uuid", "p_note" "text", "p_lines" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_fefo_take"("p_item" "uuid", "p_qty" numeric, "p_today" "date", "p_batches_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_fefo_take"("p_item" "uuid", "p_qty" numeric, "p_today" "date", "p_batches_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_fefo_take"("p_item" "uuid", "p_qty" numeric, "p_today" "date", "p_batches_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_finish_batch"("p_batch" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_finish_batch"("p_batch" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_finish_batch"("p_batch" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_items_trim_batches"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_items_trim_batches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_items_trim_batches"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_movements_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_movements_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_movements_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_order_lines_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_order_lines_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_order_lines_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_orders_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_orders_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_orders_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_receipts_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_receipts_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_receipts_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_receive"("p_order" "uuid", "p_lines" "jsonb", "p_allow_over" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_receive"("p_order" "uuid", "p_lines" "jsonb", "p_allow_over" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_receive"("p_order" "uuid", "p_lines" "jsonb", "p_allow_over" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lab_order_redo"("p_order" "uuid", "p_reason" "text", "p_new_due" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lab_order_redo"("p_order" "uuid", "p_reason" "text", "p_new_due" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lab_order_redo"("p_order" "uuid", "p_reason" "text", "p_new_due" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lab_order_redos_owner_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."lab_order_redos_owner_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lab_order_redos_owner_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lab_orders_redo_cycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."lab_orders_redo_cycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lab_orders_redo_cycle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_access_level"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_access_level"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_access_level"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_storage_object_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_storage_object_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_storage_object_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_storage_orphans"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_storage_orphans"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_storage_orphans"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_storage_usage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_storage_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_storage_usage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_subscription_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_subscription_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_subscription_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_wipe_open"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_wipe_open"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_wipe_open"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_patient_seq"("n" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."next_patient_seq"("n" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_patient_seq"("n" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."patient_documents_lab_order_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."patient_documents_lab_order_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."patient_documents_lab_order_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."patient_documents_xray_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patient_documents_xray_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."patient_documents_xray_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."patients_referrer_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."patients_referrer_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."patients_referrer_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pf_quota_ok"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pf_quota_ok"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pf_quota_ok"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date", "p_time" time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date", "p_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date", "p_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_appt_change"("p_token" "text", "p_appt" "uuid", "p_kind" "text", "p_reason" "text", "p_pref" "text", "p_note" "text", "p_date" "date", "p_time" time without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_confirm"("p_token" "text", "p_appt" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_info"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_info"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_info"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_info"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_request_cancel_approve"("p_req" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_request_cancel_approve"("p_req" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_request_cancel_approve"("p_req" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_slots"("p_token" "text", "p_appt" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_xray_list"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_xray_list"("p_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."payment_splits" TO "anon";
GRANT ALL ON TABLE "public"."payment_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_splits" TO "service_role";



REVOKE ALL ON FUNCTION "public"."realloc_patient_splits"("p_patient_id" "uuid", "p_splits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."realloc_patient_splits"("p_patient_id" "uuid", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."realloc_patient_splits"("p_patient_id" "uuid", "p_splits" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_login_email"("p_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_login_email"("p_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_login_email"("p_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_clinic_employees_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_clinic_employees_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_clinic_employees_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_notification_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_notification_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_notification_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_operatories_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_operatories_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_operatories_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_platform_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_platform_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_platform_settings_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."signup_identity_available"("p_phone" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_clinic_name_source_maint"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_clinic_name_source_maint"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_currency_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_currency_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_log_clinic_name_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_log_clinic_name_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_log_owner_name_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_log_owner_name_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sydent_norm_name"("p_txt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sydent_norm_name"("p_txt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sydent_norm_name"("p_txt" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_split_currency_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_split_currency_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sydent_split_identity_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sydent_split_identity_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_doctor_card_active"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_doctor_card_active"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tenant_access_level"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_access_level"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_presence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_subscription_plans_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_subscription_plans_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_subscription_plans_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."treatment_materials_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."treatment_materials_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."treatment_materials_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_clinic_settings_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_clinic_settings_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_clinic_settings_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."account_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."account_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."account_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_log" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_types" TO "anon";
GRANT ALL ON TABLE "public"."appointment_types" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_types" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."booking_requests" TO "anon";
GRANT ALL ON TABLE "public"."booking_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_requests" TO "service_role";



GRANT ALL ON TABLE "public"."bridge_devices" TO "anon";
GRANT ALL ON TABLE "public"."bridge_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."bridge_devices" TO "service_role";



GRANT ALL ON TABLE "public"."bridge_inbox" TO "anon";
GRANT ALL ON TABLE "public"."bridge_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."bridge_inbox" TO "service_role";



GRANT ALL ON TABLE "public"."bridge_pairings" TO "anon";
GRANT ALL ON TABLE "public"."bridge_pairings" TO "authenticated";
GRANT ALL ON TABLE "public"."bridge_pairings" TO "service_role";



GRANT ALL ON TABLE "public"."capture_requests" TO "anon";
GRANT ALL ON TABLE "public"."capture_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."capture_requests" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_doctors" TO "anon";
GRANT ALL ON TABLE "public"."clinic_doctors" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_doctors" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_employees" TO "anon";
GRANT ALL ON TABLE "public"."clinic_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_employees" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_settings" TO "anon";
GRANT ALL ON TABLE "public"."clinic_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_settings" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_note_templates" TO "anon";
GRANT ALL ON TABLE "public"."clinical_note_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_note_templates" TO "service_role";



GRANT ALL ON TABLE "public"."day_closings" TO "anon";
GRANT ALL ON TABLE "public"."day_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."day_closings" TO "service_role";



GRANT ALL ON TABLE "public"."doctors" TO "anon";
GRANT ALL ON TABLE "public"."doctors" TO "authenticated";
GRANT ALL ON TABLE "public"."doctors" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."implant_log" TO "anon";
GRANT ALL ON TABLE "public"."implant_log" TO "authenticated";
GRANT ALL ON TABLE "public"."implant_log" TO "service_role";



GRANT ALL ON TABLE "public"."implant_templates" TO "anon";
GRANT ALL ON TABLE "public"."implant_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."implant_templates" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_batches" TO "anon";
GRANT ALL ON TABLE "public"."inventory_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_batches" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_count_lines" TO "anon";
GRANT ALL ON TABLE "public"."inventory_count_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_count_lines" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_counts" TO "anon";
GRANT ALL ON TABLE "public"."inventory_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_counts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_order_lines" TO "anon";
GRANT ALL ON TABLE "public"."inventory_order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_order_lines" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_orders" TO "anon";
GRANT ALL ON TABLE "public"."inventory_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_orders" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_receipts" TO "anon";
GRANT ALL ON TABLE "public"."inventory_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."inventory_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."lab_order_redos" TO "anon";
GRANT ALL ON TABLE "public"."lab_order_redos" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_order_redos" TO "service_role";



GRANT ALL ON TABLE "public"."lab_order_templates" TO "anon";
GRANT ALL ON TABLE "public"."lab_order_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_order_templates" TO "service_role";



GRANT ALL ON TABLE "public"."lab_orders" TO "anon";
GRANT ALL ON TABLE "public"."lab_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_orders" TO "service_role";



GRANT ALL ON TABLE "public"."lab_payments" TO "anon";
GRANT ALL ON TABLE "public"."lab_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_payments" TO "service_role";



GRANT ALL ON TABLE "public"."labs" TO "anon";
GRANT ALL ON TABLE "public"."labs" TO "authenticated";
GRANT ALL ON TABLE "public"."labs" TO "service_role";



GRANT ALL ON TABLE "public"."ledger_payments" TO "anon";
GRANT ALL ON TABLE "public"."ledger_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."ledger_payments" TO "service_role";



GRANT ALL ON TABLE "public"."ledger_sessions" TO "anon";
GRANT ALL ON TABLE "public"."ledger_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."ledger_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."login_resolve_hits" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."operatories" TO "anon";
GRANT ALL ON TABLE "public"."operatories" TO "authenticated";
GRANT ALL ON TABLE "public"."operatories" TO "service_role";



GRANT ALL ON TABLE "public"."patient_documents" TO "anon";
GRANT ALL ON TABLE "public"."patient_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_documents" TO "service_role";



GRANT ALL ON TABLE "public"."patient_intakes" TO "anon";
GRANT ALL ON TABLE "public"."patient_intakes" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_intakes" TO "service_role";



GRANT ALL ON TABLE "public"."patient_messages" TO "anon";
GRANT ALL ON TABLE "public"."patient_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_messages" TO "service_role";



GRANT ALL ON TABLE "public"."patient_portals" TO "anon";
GRANT ALL ON TABLE "public"."patient_portals" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_portals" TO "service_role";



GRANT ALL ON TABLE "public"."patient_recalls" TO "anon";
GRANT ALL ON TABLE "public"."patient_recalls" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_recalls" TO "service_role";



GRANT ALL ON TABLE "public"."patient_seq" TO "anon";
GRANT ALL ON TABLE "public"."patient_seq" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_seq" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."payment_plans" TO "anon";
GRANT ALL ON TABLE "public"."payment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_plans" TO "service_role";



GRANT ALL ON TABLE "public"."perio_exams" TO "anon";
GRANT ALL ON TABLE "public"."perio_exams" TO "authenticated";
GRANT ALL ON TABLE "public"."perio_exams" TO "service_role";



GRANT ALL ON TABLE "public"."perio_measurements" TO "anon";
GRANT ALL ON TABLE "public"."perio_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."perio_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings_audit" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings_audit" TO "service_role";



GRANT ALL ON TABLE "public"."portal_requests" TO "anon";
GRANT ALL ON TABLE "public"."portal_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_requests" TO "service_role";



GRANT ALL ON TABLE "public"."post_op_notes" TO "anon";
GRANT ALL ON TABLE "public"."post_op_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_op_notes" TO "service_role";



GRANT ALL ON TABLE "public"."post_op_templates" TO "anon";
GRANT ALL ON TABLE "public"."post_op_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."post_op_templates" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_items" TO "anon";
GRANT ALL ON TABLE "public"."prescription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_items" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_templates" TO "anon";
GRANT ALL ON TABLE "public"."prescription_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_templates" TO "service_role";



GRANT ALL ON TABLE "public"."prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."provider_payouts" TO "anon";
GRANT ALL ON TABLE "public"."provider_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_logs" TO "anon";
GRANT ALL ON TABLE "public"."reminder_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_logs" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_blocks" TO "anon";
GRANT ALL ON TABLE "public"."schedule_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."staff_messages" TO "anon";
GRANT ALL ON TABLE "public"."staff_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_messages" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_events" TO "anon";
GRANT ALL ON TABLE "public"."subscription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_requests" TO "anon";
GRANT ALL ON TABLE "public"."subscription_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_requests" TO "service_role";



GRANT ALL ON TABLE "public"."teeth_status" TO "anon";
GRANT ALL ON TABLE "public"."teeth_status" TO "authenticated";
GRANT ALL ON TABLE "public"."teeth_status" TO "service_role";



GRANT ALL ON TABLE "public"."teeth_status_history" TO "anon";
GRANT ALL ON TABLE "public"."teeth_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."teeth_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_bundles" TO "anon";
GRANT ALL ON TABLE "public"."treatment_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_materials" TO "anon";
GRANT ALL ON TABLE "public"."treatment_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_materials" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_price_history" TO "anon";
GRANT ALL ON TABLE "public"."treatment_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."treatments" TO "anon";
GRANT ALL ON TABLE "public"."treatments" TO "authenticated";
GRANT ALL ON TABLE "public"."treatments" TO "service_role";



GRANT ALL ON TABLE "public"."trial_requests" TO "anon";
GRANT ALL ON TABLE "public"."trial_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."trial_requests" TO "service_role";



GRANT ALL ON TABLE "public"."wa_message_templates" TO "anon";
GRANT ALL ON TABLE "public"."wa_message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."wa_message_templates" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































