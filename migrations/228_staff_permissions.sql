-- ═════════════════════════════════════════════════════════════════════
-- Migration 228 — صلاحياتُ كل موظف (per-employee permissions)
-- Date: 25 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: the owner asked to grant or revoke what each employee may open,
-- on top of the existing roles (owner · doctor · secretary) — nothing about
-- the roles themselves changes.
--
-- Model:
--   • clinic_employees.permissions — NULL = the role's defaults, exactly as
--     today. Otherwise an object of overrides { "<key>": true|false } holding
--     ONLY the keys that differ from the role. Keys (closed list, mirrored in
--     supabase-init.js PERM_KEYS):
--       patients · appointments · treatments · doctors · labs · radiology ·
--       accounting · expenses · payouts · provider-reports · inventory ·
--       audit-log · act.delete-patient
--     Owner-only for good, never a key: employees · settings · subscription
--     (they hold the lock PIN and the account).
--   • The owner's own row never carries overrides (CHECK).
--
-- Security: same RLS as the table (owner-only). Enforcement is the device
-- lock (SyDentLock), the same layer as the role restrictions today.
--
-- ROLLBACK:
--   ALTER TABLE public.clinic_employees DROP CONSTRAINT IF EXISTS clinic_employees_permissions_ok;
--   ALTER TABLE public.clinic_employees DROP COLUMN IF EXISTS permissions;
--   DROP FUNCTION IF EXISTS public._staff_permissions_ok(jsonb);
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) validator: object of known keys → boolean ───────────────────────
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
                 'audit-log','act.delete-patient') THEN RETURN false; END IF;
    IF jsonb_typeof(v) <> 'boolean' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;

-- The CHECK below runs it as the writing role: the clinic's own session needs EXECUTE, nobody else does.
REVOKE ALL ON FUNCTION public._staff_permissions_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._staff_permissions_ok(jsonb) TO authenticated, service_role;

-- ── 2) the column + its rules ──────────────────────────────────────────
ALTER TABLE public.clinic_employees ADD COLUMN IF NOT EXISTS permissions JSONB;

ALTER TABLE public.clinic_employees DROP CONSTRAINT IF EXISTS clinic_employees_permissions_ok;
ALTER TABLE public.clinic_employees ADD CONSTRAINT clinic_employees_permissions_ok
  CHECK (public._staff_permissions_ok(permissions) AND (role <> 'owner' OR permissions IS NULL));

COMMENT ON COLUMN public.clinic_employees.permissions IS
  'M228: NULL = role defaults; else {key: bool} overrides of the role (closed key list, see _staff_permissions_ok).';

COMMIT;
