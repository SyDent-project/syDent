-- ═══════════════════════════════════════════════════════════════
-- Migration 83 — P5 booking portal as a gateable plan module
--                + cycle-aware plan subtitle (subtitle_yearly)
-- ─────────────────────────────────────────────────────────────
-- WHY (part 1 — booking gate): the admin plan editor gates 11 sidebar
-- modules via subscription_plans.entitlements, but the P5 booking portal
-- (Migration 59) was outside that system. This migration makes
-- entitlements->>'booking' = false actually block the PUBLIC portal at
-- the server, because book.html is an anon page — a client-only gate
-- would be decorative. All three booking RPCs funnel through
-- booking_clinic_info (busy_slots + create_request both start with a
-- SELECT from it — Migration 60 folded the availability gate in), so
-- hardening this ONE function gates the entire portal. book.html itself
-- is NOT modified (repo rule): zero rows ⇒ it already renders the
-- existing «الحجز الإلكتروني غير متاح حالياً» state.
--
-- Gate contract (mirrors SyDentPlan.can() client-side, default-allow /
-- grandfather): blocked ONLY when entitlements->>'booking' is the
-- explicit string 'false'. NULL plan, missing subscription_plans row,
-- NULL entitlements, or a missing 'booking' key ⇒ allowed.
--
-- WHY (part 2 — subtitle_yearly): pricing cards show one static
-- subtitle regardless of the billing-cycle toggle, so «دفعة شهرية
-- مرنة…» appeared under yearly prices (owner screenshot, 16 Jul 2026).
-- New nullable column: shown when the yearly cycle is selected;
-- NULL/blank ⇒ falls back to the base subtitle. Rendered by
-- landing.html + subscription.html; edited in admin.html plan editor
-- (own sentinel guard, same pattern as Migrations 37/38 display fields).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + re-asserted
-- grants. No RLS policy changes (verification asserts the count).
--
-- ROLLBACK:
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS subtitle_yearly;
--   -- re-run the booking_clinic_info block of Migration 59 to restore
--   -- the pre-gate function body.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) subscription_plans — cycle-aware subtitle (display layer only)
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS subtitle_yearly TEXT;

-- ── 2) booking_clinic_info — add the per-plan module gate.
-- Body is Migration 59's verbatim, plus the plan-entitlement check.
CREATE OR REPLACE FUNCTION public.booking_clinic_info(p_clinic UUID)
RETURNS TABLE (
  clinic_name TEXT, clinic_phone TEXT, slot_minutes INTEGER,
  work_days TEXT, work_start TIME, work_end TIME,
  max_days_ahead INTEGER, booking_note TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
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

-- CREATE OR REPLACE preserves the function ACL, but re-assert anyway
-- (belt-and-suspenders; idempotent — matches Migration 59/60 grants).
REVOKE ALL ON FUNCTION public.booking_clinic_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_clinic_info(uuid) TO anon, authenticated;

-- ── Verification (run after apply — Rule #238 tail) ──
-- expect: subtitle_yearly_col = 1, fn_has_plan_gate = true,
--         policies_total unchanged vs. pre-migration (no policy touched).
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_plans'
       AND column_name = 'subtitle_yearly')                        AS subtitle_yearly_col,
  (SELECT p.prosrc LIKE '%subscription_plans%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'booking_clinic_info') AS fn_has_plan_gate,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')   AS policies_total;
