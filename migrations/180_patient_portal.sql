-- ════════════════════════════════════════════════════════════════════
-- Migration 180 — بوابةُ المريض الخفيفة (Patient Portal-lite)
-- Date: 12 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: competitor review 12 Oct 2026 (Dentrix Ascend Patient Portal · Curve GRO ·
-- Dentally Portal · CareStack Patient Portal) — the patient opens a per-patient
-- tokenised link (portal.html?t=…) and READS: upcoming/past appointments, the
-- adopted treatment plan, the balance (clinic-controlled, off by default as
-- CareStack), post-op instructions + prescriptions, and a pending intake link.
-- book.html / intake.html are NOT touched (repo rule).
--
-- Security model (mirrors Migration 177):
--   • patient_portals is RLS owner-only + subscription gate (M141). NO anon
--     policy at all → anon's sole door = ONE read-only SECURITY DEFINER RPC.
--   • Token = 64 hex chars (two uuid4 → 2^244 entropy); link holder = patient.
--     The clinic renews (expires_at) or revokes (revoked_at) from the card.
--   • portal_info is STABLE and writes nothing — zero writes from the visitor.
--   • Every section is gated by its clinic_settings switch server-side; the
--     page only shapes what it receives.
--   • Gate chain: account status → subscription 'full' → plan entitlement
--     'booking' (public patient-facing surface key) — _intake_clinic_open (M177).
--   • Financial figures use the SAME literal formula as computeFinancials
--     (patient-profile.html) and ppPlanCalc (pp-plan.js) — guarded by
--     scripts/prove-portal.js on random samples (rule #684: no second formula).
--
-- ROLLBACK (only if reverting the whole feature):
--   DROP FUNCTION IF EXISTS public.portal_info(text);
--   DROP TABLE IF EXISTS public.patient_portals;
--   ALTER TABLE public.clinic_settings
--     DROP COLUMN IF EXISTS portal_show_appts, DROP COLUMN IF EXISTS portal_show_plan,
--     DROP COLUMN IF EXISTS portal_show_balance, DROP COLUMN IF EXISTS portal_show_notes,
--     DROP COLUMN IF EXISTS whatsapp_portal_template;
--   -- patient_messages kind check: re-run the M177 constraint without 'portal'.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) clinic_settings — what the portal shows + the message template ────
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS portal_show_appts    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_plan     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_balance  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_show_notes    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_portal_template TEXT;
COMMENT ON COLUMN public.clinic_settings.portal_show_appts   IS 'البوابة: عرضُ المواعيد القادمة والسابقة للمريض (M180).';
COMMENT ON COLUMN public.clinic_settings.portal_show_plan    IS 'البوابة: عرضُ خطة العلاج المعتمدة (البنود · المراحل · الإجمالي) (M180).';
COMMENT ON COLUMN public.clinic_settings.portal_show_balance IS 'البوابة: عرضُ الرصيد (إجمالي · مدفوع · متبقٍّ · القسط القادم) — مطفأ افتراضياً كـCareStack (M180).';
COMMENT ON COLUMN public.clinic_settings.portal_show_notes   IS 'البوابة: عرضُ تعليمات ما بعد العلاج والروشتات (M180).';
COMMENT ON COLUMN public.clinic_settings.whatsapp_portal_template IS 'قالبُ رسالة بوابة المريض ({patient_first_name} {patient_name} {clinic_name} {clinic_phone} {portal_link}). NULL = الافتراضي. M180.';

-- ── 2) patient_portals — the per-patient link (owner writes, anon reads via RPC)
CREATE TABLE IF NOT EXISTS public.patient_portals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE
                DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at    TIMESTAMPTZ,
  created_by    TEXT CHECK (created_by IS NULL OR char_length(created_by) <= 80),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  renewed_at    TIMESTAMPTZ,
  CONSTRAINT patient_portals_token_hex CHECK (token ~ '^[0-9a-f]{64}$')
);

-- one live link per patient: resend/renew reuses it instead of multiplying rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_portals_live
  ON public.patient_portals (patient_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patient_portals_patient
  ON public.patient_portals (owner_id, patient_id, created_at DESC);

ALTER TABLE public.patient_portals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_portals_owner_all ON public.patient_portals;
CREATE POLICY patient_portals_owner_all ON public.patient_portals
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
-- بوابة الاشتراك (M141): قراءة لغير «none» · كتابة لـ«full» فقط.
SELECT public._sub_guard_table('public.patient_portals');

COMMENT ON TABLE public.patient_portals IS
  'بوابة المريض الخفيفة (M180): رابطٌ مرمَّز لكل مريض · قراءةٌ فقط عبر portal_info · تجديدٌ وإيقافٌ بيد العيادة. توثيقي — لا أثر مالي.';

-- ── 3) patient_messages — the send is logged under its own kind ────────
ALTER TABLE public.patient_messages DROP CONSTRAINT IF EXISTS patient_messages_kind_check;
ALTER TABLE public.patient_messages ADD CONSTRAINT patient_messages_kind_check CHECK (kind = ANY (ARRAY[
  'prescription','instructions','plan','installment','recall','birthday','review','referral','free','other','intake','portal']));

-- ── 4) RPC — portal_info: the ONLY anon surface, read-only ─────────────
-- NULL  = link unknown / clinic unavailable (page shows «غير متاح»).
-- {status:'expired'|'revoked'} = link known but dead (page says which, no data).
-- {status:'ok', …} = sections present only when their switch is on.
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
  v_opts   INT;
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
         COALESCE(c.portal_show_notes, true)    AS show_notes
    INTO cs FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF NOT FOUND THEN
    SELECT NULL::text AS clinic_name, NULL::text AS clinic_phone,
           true AS show_appts, true AS show_plan, false AS show_balance, true AS show_notes INTO cs;
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
    'show', jsonb_build_object('appts', cs.show_appts, 'plan', cs.show_plan, 'balance', cs.show_balance, 'notes', cs.show_notes)
  );

  -- ── appointments: upcoming (today onward, still live) + past 12 months ──
  IF cs.show_appts THEN
    SELECT jsonb_build_object(
      'upcoming', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'date', a.date, 'time', to_char(a.time, 'HH24:MI'), 'duration', a.duration,
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

  -- ── pending intake link (M177): only while still fillable ──────────────
  SELECT i.token INTO v_intake FROM public.patient_intakes i
   WHERE i.owner_id = v.owner_id AND i.patient_id = v.patient_id
     AND i.status = 'pending' AND i.expires_at > now()
   ORDER BY i.created_at DESC LIMIT 1;
  IF v_intake IS NOT NULL THEN v_out := v_out || jsonb_build_object('intake_token', v_intake); END IF;

  RETURN v_out;
END; $$;

-- ── 5) Permissions: the RPC is the only anon surface ───────────────────
REVOKE ALL ON FUNCTION public.portal_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_info(text) TO anon, authenticated;

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.patient_portals'::regclass) rls_on,          -- true
--        (SELECT count(*) FROM pg_policies WHERE tablename='patient_portals') policies,                       -- 5 (1 owner + 4 gate)
--        (SELECT provolatile FROM pg_proc WHERE proname='portal_info') volatility,                            -- s (STABLE)
--        (SELECT count(*) FROM information_schema.columns WHERE table_name='clinic_settings' AND column_name LIKE 'portal%') cols;  -- 4
