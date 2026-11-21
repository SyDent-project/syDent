-- ════════════════════════════════════════════════════════════════════
-- Migration 223 — الحجزُ الإلكتروني وبوابةُ المريض يحترمان دوامَ الطبيب وإجازتَه
-- Date: 21 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (M222): a doctor now has his own working hours (clinic_employees.work_schedule) and his leave is a
-- schedule block in his name. The public booking page and the portal's slot picker knew neither.
-- book.html and portal.html are NOT touched — both already read these functions.
--
--   • _provider_off_slots(clinic, from, to) — internal (no anon/authenticated). On the booking grid
--     (work_start..work_end, step slot_minutes) one row per (doctor, slot) where that ACTIVE dentist
--     (clinic_doctors.provider_type 'doctor' — trainees and chair assistants are not counted) is not
--     available: the slot is not wholly inside his own hours (a weekday missing from his schedule = day off),
--     or a blocking schedule block in his name covers it. A doctor with no schedule follows the clinic's hours.
--     The owner-doctor is matched to the owner's staff row when that row carries no doctor link.
--     Nothing to compute (no schedule, no doctor block) ⇒ zero rows without building the grid.
--   • booking_blocked_slots — the public page has no doctor to choose, so a slot closes when (a) a clinic-wide
--     block covers it, (b) EVERY active doctor is unavailable (single-doctor clinic: his hours and leave close
--     the page), or (c) every active chair is blocked. (b)/(c) are the Migration 156 rule, which the live
--     database did not carry (it still ran the Migration 155 body: clinic-wide blocks only) — this migration
--     makes it live and adds working hours to (b). Range capped at 366 days (anon-callable; the grid is per slot).
--   • _portal_free_slots — moving ONE appointment: also closes the slots where THAT appointment's doctor is
--     unavailable (exact, since the appointment names its doctor). Body = Migration 189 + one UNION branch.
--   booking_busy_slots / booking_create_request / portal_slots / portal_appt_change call these as before.
--
-- ROLLBACK: re-apply booking_blocked_slots from Migration 155 and _portal_free_slots from Migration 189;
--   DROP FUNCTION IF EXISTS public._provider_off_slots(uuid, date, date);
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._provider_off_slots(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE(provider_id uuid, d date, t time without time zone, dur integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH info AS (SELECT * FROM public.booking_clinic_info(p_clinic)),
  provs AS (
    SELECT cd.id,
           (SELECT e.work_schedule FROM public.clinic_employees e
             WHERE e.owner_id = p_clinic AND e.work_schedule IS NOT NULL
               AND (e.doctor_id = cd.id OR (cd.is_owner AND e.role = 'owner' AND e.doctor_id IS NULL))
             ORDER BY (e.doctor_id IS NOT NULL) DESC, e.created_at, e.id LIMIT 1) AS sched
      FROM public.clinic_doctors cd
     WHERE cd.owner_id = p_clinic AND cd.is_active IS NOT FALSE
       AND COALESCE(cd.provider_type, 'doctor') = 'doctor'   -- dentists only: a chair assistant never keeps the page open
  ),
  days AS (
    SELECT g.d::date AS d FROM info i
    CROSS JOIN LATERAL generate_series(p_from, p_to, interval '1 day') AS g(d)
    WHERE p_from IS NOT NULL AND p_to IS NOT NULL AND p_to >= p_from AND (p_to - p_from) <= 366
  ),
  inst AS (   -- blocking blocks in a doctor's name, one row per day (all-day = 00:00..24:00)
    SELECT dd.d, b.provider_id AS pid,
           COALESCE(b.start_time, '00:00'::time) AS s,
           CASE WHEN b.end_time IS NULL THEN '24:00'::interval ELSE b.end_time::interval END AS e
      FROM public.schedule_blocks b
      JOIN days dd ON dd.d >= b.date_from AND (b.date_to IS NULL OR dd.d <= b.date_to)
     WHERE b.doctor_id = p_clinic AND b.blocks_scheduling
       AND b.provider_id IS NOT NULL AND b.operatory_id IS NULL
       AND (b.weekdays IS NULL OR cardinality(b.weekdays) = 0 OR EXTRACT(DOW FROM dd.d)::smallint = ANY (b.weekdays))
  ),
  slots AS (
    SELECT dd.d, (i.work_start + (n * i.slot_minutes) * interval '1 minute')::time AS t, i.slot_minutes AS dur
      FROM days dd CROSS JOIN info i
      CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60 / i.slot_minutes)::int - 1)) AS n
     WHERE EXISTS (SELECT 1 FROM provs WHERE sched IS NOT NULL) OR EXISTS (SELECT 1 FROM inst)
  )
  SELECT p.id, s.d, s.t, s.dur
    FROM slots s CROSS JOIN provs p
   WHERE (p.sched IS NOT NULL AND NOT COALESCE(
            s.t::interval >= ((p.sched -> (EXTRACT(DOW FROM s.d)::int)::text ->> 0)::time)::interval
            AND s.t::interval + make_interval(mins => s.dur) <= ((p.sched -> (EXTRACT(DOW FROM s.d)::int)::text ->> 1)::time)::interval,
          false))
      OR EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.pid = p.id
                   AND i.s::interval < s.t::interval + make_interval(mins => s.dur) AND s.t::interval < i.e);
$$;
REVOKE ALL ON FUNCTION public._provider_off_slots(uuid, date, date) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.booking_blocked_slots(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE(d date, t time without time zone, dur integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH info AS (SELECT * FROM public.booking_clinic_info(p_clinic)),
  days AS (
    SELECT g.d::date AS d FROM info i
    CROSS JOIN LATERAL generate_series(p_from, p_to, interval '1 day') AS g(d)
    WHERE p_from IS NOT NULL AND p_to IS NOT NULL AND p_to >= p_from AND (p_to - p_from) <= 366
  ),
  slots AS (   -- the booking grid, per day
    SELECT dd.d, (i.work_start + (n * i.slot_minutes) * interval '1 minute')::time AS t, i.slot_minutes AS dur
      FROM days dd CROSS JOIN info i
      CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(EPOCH FROM (i.work_end - i.work_start)) / 60 / i.slot_minutes)::int - 1)) AS n
  ),
  inst AS (   -- clinic-wide and chair blocks, one row per day (a doctor's blocks live in _provider_off_slots)
    SELECT dd.d, b.operatory_id,
           COALESCE(b.start_time, '00:00'::time) AS s,
           CASE WHEN b.end_time IS NULL THEN '24:00'::interval ELSE b.end_time::interval END AS e
      FROM public.schedule_blocks b
      JOIN days dd ON dd.d >= b.date_from AND (b.date_to IS NULL OR dd.d <= b.date_to)
     WHERE b.doctor_id = p_clinic AND b.blocks_scheduling AND b.provider_id IS NULL
       AND (b.weekdays IS NULL OR cardinality(b.weekdays) = 0 OR EXTRACT(DOW FROM dd.d)::smallint = ANY (b.weekdays))
  ),
  nprov AS (SELECT count(*) AS n FROM public.clinic_doctors WHERE owner_id = p_clinic AND is_active IS NOT FALSE
               AND COALESCE(provider_type, 'doctor') = 'doctor'),
  ops   AS (SELECT id FROM public.operatories WHERE doctor_id = p_clinic AND is_active IS NOT FALSE),
  offc  AS (SELECT o.d, o.t, count(DISTINCT o.provider_id) AS n FROM public._provider_off_slots(p_clinic, p_from, p_to) o GROUP BY 1, 2)
  SELECT s.d, s.t, s.dur
    FROM slots s
    CROSS JOIN nprov
    LEFT JOIN offc ON offc.d = s.d AND offc.t = s.t
   WHERE
     -- (a) clinic-wide block
     EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id IS NULL
               AND i.s::interval < s.t::interval + make_interval(mins => s.dur) AND s.t::interval < i.e)
     -- (b) every active doctor is outside his hours or on leave
     OR (nprov.n > 0 AND COALESCE(offc.n, 0) = nprov.n)
     -- (c) every active chair is blocked
     OR ((SELECT count(*) FROM ops) > 0 AND NOT EXISTS (
           SELECT 1 FROM ops o WHERE NOT EXISTS (
             SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id = o.id
               AND i.s::interval < s.t::interval + make_interval(mins => s.dur) AND s.t::interval < i.e)));
$$;
GRANT EXECUTE ON FUNCTION public.booking_blocked_slots(uuid, date, date) TO anon, authenticated, service_role;

-- ── free slots for moving one appointment (internal) — Migration 189 + the appointment's own doctor ──
CREATE OR REPLACE FUNCTION public._portal_free_slots(p_owner UUID, p_appt UUID, p_dur INT, p_from DATE, p_to DATE)
RETURNS TABLE(d DATE, t TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    UNION ALL   -- M223: the appointment's own doctor — outside his hours or on his leave
    SELECT o.d, o.t, o.dur FROM public._provider_off_slots(p_owner, p_from, p_to) o
     WHERE o.provider_id = (SELECT a.provider_id FROM public.appointments a WHERE a.id = p_appt AND a.doctor_id = p_owner)
  )
  SELECT f.d, f.t FROM fits f
   WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.d = f.d AND b.t IS NOT NULL
                       AND b.t::interval < f.t::interval + make_interval(mins => p_dur)
                       AND f.t::interval < b.t::interval + make_interval(mins => b.dur))
     AND NOT EXISTS (SELECT 1 FROM public.appointments c WHERE c.id = p_appt AND c.date = f.d AND c.time = f.t)
   ORDER BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public._portal_free_slots(uuid, uuid, int, date, date) FROM anon, authenticated, public;

COMMIT;

-- Verification (Rule #238):
-- SELECT has_function_privilege('anon', 'public._provider_off_slots(uuid,date,date)', 'EXECUTE');   -- f
-- SELECT position('_provider_off_slots' in pg_get_functiondef('public.booking_blocked_slots(uuid,date,date)'::regprocedure)) > 0;   -- t
