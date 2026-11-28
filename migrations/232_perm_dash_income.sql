-- ═════════════════════════════════════════════════════════════════════
-- Migration 232 — صلاحيةُ «إيراد اليوم» بلوحة التحكم (dash.income permission key)
-- Date: 28 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, 28/11): the dashboard showed «إيراد اليوم» to every employee.
-- It becomes a per-employee permission, OFF by default for staff (on for the
-- owner and, by default, the accountant).
--
-- Change: the closed key list of clinic_employees.permissions (M228) gains
-- 'dash.income'. Function replaced in place — same signature, grants and
-- CHECK constraint; no data change.
--
-- ROLLBACK: re-run the function body from migrations/228_staff_permissions.sql
--   (after removing the key from any row: UPDATE public.clinic_employees
--    SET permissions = NULLIF(permissions - 'dash.income', '{}'::jsonb) WHERE permissions ? 'dash.income';)
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._staff_permissions_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE k TEXT; v JSONB;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('patients','appointments','treatments','doctors','labs','radiology',
                 'accounting','expenses','payouts','provider-reports','inventory',
                 'audit-log','act.delete-patient','dash.income') THEN RETURN false; END IF;
    IF jsonb_typeof(v) <> 'boolean' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public._staff_permissions_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._staff_permissions_ok(jsonb) TO authenticated, service_role;

COMMIT;
