-- ════════════════════════════════════════════════════════════════════
-- Migration 222 — دوامُ كل شخص وإجازاتُه (per-person working hours + leaves)
-- Date: 21 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: competitor review (Open Dental schedule setup: provider AND employee
-- time blocks, holidays and staff vacations in one schedule · Dental
-- Intelligence provider availability). SyDent knew only the clinic's hours.
--
-- Model:
--   • clinic_employees.work_schedule — NULL = follows the clinic's hours.
--     Otherwise a map weekday → [start, end], weekday '0'..'6' with 0 = Sunday
--     (the schedule_blocks convention, JS getDay). A day that is absent is a
--     day off. Validated by _work_schedule_ok so the booking functions can
--     cast the values safely (M223).
--   • clinic_employees.annual_leave_days — the yearly paid-leave allowance
--     (NULL = not tracked).
--   • staff_leaves — one row per leave/absence of any staff member (doctor or
--     not): kind · date range · note. A doctor's leave also closes his
--     calendar through an ordinary schedule_blocks row (kind 'leave', his
--     provider_id) whose id is kept in block_id; deleting the leave removes
--     that block (the client does both; ON DELETE SET NULL keeps the leave
--     if the block is removed from the calendar window).
--     Documentation only — it writes nothing to payroll. The payouts page
--     reads it to SUGGEST a deduction line (never a silent deduction).
--
-- Security: RLS owner-only + subscription gate (M141); no anon access (the validator is not anon-callable either).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.staff_leaves;
--   ALTER TABLE public.clinic_employees DROP CONSTRAINT IF EXISTS clinic_employees_work_schedule_ok;
--   ALTER TABLE public.clinic_employees DROP COLUMN IF EXISTS work_schedule, DROP COLUMN IF EXISTS annual_leave_days;
--   DROP FUNCTION IF EXISTS public._work_schedule_ok(jsonb);
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) validator: {"0".."6": ["HH:MM","HH:MM"]} with end > start ───────
CREATE OR REPLACE FUNCTION public._work_schedule_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE k TEXT; v JSONB; a TEXT; b TEXT;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k !~ '^[0-6]$' OR jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) <> 2 THEN RETURN false; END IF;
    a := v ->> 0; b := v ->> 1;
    IF a IS NULL OR b IS NULL OR a !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR b !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
    IF b <= a THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;

-- The CHECK below runs it as the writing role: the clinic's own session needs EXECUTE, nobody else does.
REVOKE ALL ON FUNCTION public._work_schedule_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._work_schedule_ok(jsonb) TO authenticated, service_role;

-- ── 2) clinic_employees — schedule + yearly allowance ──────────────────
ALTER TABLE public.clinic_employees
  ADD COLUMN IF NOT EXISTS work_schedule     JSONB,
  ADD COLUMN IF NOT EXISTS annual_leave_days SMALLINT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_employees_work_schedule_ok') THEN
    ALTER TABLE public.clinic_employees
      ADD CONSTRAINT clinic_employees_work_schedule_ok CHECK (public._work_schedule_ok(work_schedule));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_employees_annual_leave_ok') THEN
    ALTER TABLE public.clinic_employees
      ADD CONSTRAINT clinic_employees_annual_leave_ok CHECK (annual_leave_days IS NULL OR annual_leave_days BETWEEN 0 AND 365);
  END IF;
END $$;
COMMENT ON COLUMN public.clinic_employees.work_schedule IS
  'دوامُ الشخص (M222): NULL = دوامُ العيادة · خريطة يوم الأسبوع ''0''..''6'' (0 = الأحد) ⇒ [بداية, نهاية] بصيغة HH:MM · اليومُ الغائب عطلة.';
COMMENT ON COLUMN public.clinic_employees.annual_leave_days IS
  'رصيدُ الإجازة المدفوعة السنوي بالأيام (M222): NULL = لا يُتابَع.';

-- ── 3) staff_leaves ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_leaves (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.clinic_employees(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('paid', 'unpaid', 'sick', 'absence')),
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  block_id     UUID REFERENCES public.schedule_blocks(id) ON DELETE SET NULL,
  created_by   TEXT CHECK (created_by IS NULL OR char_length(created_by) <= 80),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_leaves_range_chk CHECK (date_to >= date_from AND (date_to - date_from) <= 366)
);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_owner_dates ON public.staff_leaves (owner_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_employee    ON public.staff_leaves (employee_id, date_from DESC);

ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_leaves' AND policyname = 'staff_leaves_owner_all') THEN
    CREATE POLICY staff_leaves_owner_all ON public.staff_leaves
      USING (owner_id = (SELECT auth.uid()))
      WITH CHECK (owner_id = (SELECT auth.uid())
                  AND EXISTS (SELECT 1 FROM public.clinic_employees e WHERE e.id = employee_id AND e.owner_id = (SELECT auth.uid())));
  END IF;
END $$;
SELECT public._sub_guard_table('public.staff_leaves');

COMMENT ON TABLE public.staff_leaves IS
  'إجازاتُ وغياباتُ الموظفين والأطباء (M222): توثيقٌ فقط — لا يكتب بالرواتب. إجازةُ الطبيب تُغلق تقويمَه بصفّ schedule_blocks (block_id).';

COMMIT;

-- Verification (Rule #238):
-- SELECT public._work_schedule_ok('{"0":["09:00","17:00"]}'), public._work_schedule_ok('{"7":["09:00","17:00"]}'), public._work_schedule_ok('{"1":["17:00","09:00"]}');  -- t f f
-- SELECT count(*) FROM pg_policies WHERE tablename = 'staff_leaves';   -- owner + sub-guard policies
