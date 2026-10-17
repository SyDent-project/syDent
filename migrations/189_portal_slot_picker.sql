-- ════════════════════════════════════════════════════════════════════
-- Migration 189 — بوابةُ المريض: يختار المريض وقتاً متاحاً حقيقياً لطلب التغيير، والطبيبُ يعتمده (v630)
-- Date: 13 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, after testing v629 live): «لما يكبس تعديل الموعد يختار هو الوقت والتاريخ، ويبقى طلب يؤكّده الطبيب».
-- Not via book.html (no name/phone in a URL; book.html untouched): a slot picker inside the portal, fed by the
-- SAME clinic hours as online booking (booking_clinic_info: work days/hours, slot grid, max days ahead).
--   • _portal_free_slots(owner, appt, dur, from, to) — internal (not callable by anon/authenticated): grid slots on
--     work days that fit the appointment's own duration before closing time, ≥2h from now, not the current slot,
--     overlapping nothing busy: other appointments · pending booking requests · OTHER patients' open portal
--     change requests (two patients cannot ask for the same slot) · schedule blocks.
--   • portal_slots(token, appt) — STABLE read, same gates as the write: free slots for the next min(max_days_ahead, 60)
--     days, times only (no names). No booking hours ⇒ {days:[]} ⇒ the page falls back to morning/evening.
--   • portal_appt_change(+ p_date, p_time) — the old 6-arg signature is dropped (one function, defaults keep old
--     callers working); a chosen slot is re-validated against _portal_free_slots under a per-clinic-and-day
--     advisory lock (two simultaneous requests for one slot ⇒ the second gets «slot_taken»), stored on the request.
--   • portal_info: + open_request_at (the slot asked for) · changes.slots (picker available).
--   • clinic_settings.portal_msg_moved — the WhatsApp text the clinic sends after approving (NULL ⇒ default;
--     MIRROR settings.html ↔ appt-portal.js).
-- ROLLBACK: re-apply portal_info / portal_appt_change from Migration 187; DROP FUNCTION public.portal_slots(text, uuid),
--   public._portal_free_slots(uuid, uuid, int, date, date); ALTER TABLE public.portal_requests DROP COLUMN requested_date,
--   DROP COLUMN requested_time; ALTER TABLE public.clinic_settings DROP COLUMN portal_msg_moved.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.portal_requests
  ADD COLUMN IF NOT EXISTS requested_date DATE,
  ADD COLUMN IF NOT EXISTS requested_time TIME;
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS portal_msg_moved TEXT;
ALTER TABLE public.clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_portal_msg_moved_len;
ALTER TABLE public.clinic_settings ADD CONSTRAINT clinic_settings_portal_msg_moved_len CHECK (portal_msg_moved IS NULL OR char_length(portal_msg_moved) <= 1000);
COMMENT ON COLUMN public.clinic_settings.portal_msg_moved IS 'البوابة: رسالةُ واتساب للمريض بعد اعتماد الوقت الذي طلبه (M189).';

-- ── free slots for moving one appointment (internal) ──
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
  )
  SELECT f.d, f.t FROM fits f
   WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.d = f.d AND b.t IS NOT NULL
                       AND b.t::interval < f.t::interval + make_interval(mins => p_dur)
                       AND f.t::interval < b.t::interval + make_interval(mins => b.dur))
     AND NOT EXISTS (SELECT 1 FROM public.appointments c WHERE c.id = p_appt AND c.date = f.d AND c.time = f.t)
   ORDER BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public._portal_free_slots(uuid, uuid, int, date, date) FROM anon, authenticated, public;

-- ── portal_slots: what the picker shows (read-only) ──
CREATE OR REPLACE FUNCTION public.portal_slots(p_token TEXT, p_appt UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.portal_slots(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_slots(text, uuid) TO anon, authenticated;

-- ── portal_info: + open_request_at · changes.slots ──
CREATE OR REPLACE FUNCTION public.portal_info(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
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
         c.portal_msg_cancelled AS msg_cancelled, c.portal_msg_requested AS msg_requested, c.portal_msg_too_late AS msg_too_late
    INTO cs FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF NOT FOUND THEN
    SELECT NULL::text AS clinic_name, NULL::text AS clinic_phone,
           true AS show_appts, true AS show_plan, false AS show_balance, true AS show_notes,
           true AS show_history, false AS allow_changes, 'direct'::text AS cancel_mode, 24 AS cutoff_hours,
           NULL::text AS msg_cancelled, NULL::text AS msg_requested, NULL::text AS msg_too_late INTO cs;
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
      'tpl', jsonb_build_object('cancelled', cs.msg_cancelled, 'requested', cs.msg_requested, 'too_late', cs.msg_too_late)));
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
END; $$;

REVOKE ALL ON FUNCTION public.portal_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_info(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.portal_appt_change(text, uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.portal_appt_change(p_token TEXT, p_appt UUID, p_kind TEXT, p_reason TEXT, p_pref TEXT, p_note TEXT,
                                                     p_date DATE DEFAULT NULL, p_time TIME DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.portal_appt_change(text, uuid, text, text, text, text, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_appt_change(text, uuid, text, text, text, text, date, time) TO anon, authenticated;

COMMIT;
