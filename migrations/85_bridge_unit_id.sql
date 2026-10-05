-- ============================================================
-- Migration 85 — teeth_status.unit_id (explicit prosthesis unit)
-- ============================================================
-- WHY: bridge unit membership was INFERRED by arch adjacency
-- (findPontics / undoExtraction walks). Inference cannot distinguish
-- "double abutment inside ONE unit" from "two separate units whose
-- abutments touch" (Rule #202 boundary). Long-span bridges with
-- secondary retainers (اثنتان أنسي/وحشي) therefore broke deletion:
-- the walk stopped between the two touching abutments, orphaning the
-- outer retainer — or worse, the legacy interior-pontic heuristic
-- rewrote a REAL inner abutment to WHOLE='extracted'.
--
-- FIX: rows written for one prosthetic unit now share one uuid.
-- Deletion/grouping reads the uuid exactly; adjacency walking remains
-- only as the fallback for legacy rows (unit_id IS NULL).
--
-- NAMING: generic `unit_id` (not bridge_unit) on purpose — future
-- multi-tooth appliances (splints, space maintainers backfill, group
-- surgical work) can reuse the same column.
--
-- SAFETY: nullable, no default, no constraint change, no RLS change
-- (same-table column, existing owner policies cover it). The client
-- has a column-missing fallback (upsertTeethStatusWithFallback), so
-- deploy order is safe in both directions.
--
-- ROLLBACK (safe anytime — only precision of bridge deletion is lost):
--   ALTER TABLE teeth_status DROP COLUMN IF EXISTS unit_id;
-- ============================================================

ALTER TABLE teeth_status ADD COLUMN IF NOT EXISTS unit_id uuid;

COMMENT ON COLUMN teeth_status.unit_id IS
  'Explicit prosthetic-unit membership (bridge v1): all rows written for one bridge share one uuid. NULL = legacy row, unit inferred by adjacency.';

-- ── Verification ──
-- Expected: column exists as uuid/nullable; policy count on teeth_status
-- unchanged from before this migration (Rule #238).
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'teeth_status' AND column_name = 'unit_id') AS unit_id_column,
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'teeth_status' AND column_name = 'unit_id') AS is_nullable,
  (SELECT count(*) FROM pg_policies
    WHERE tablename = 'teeth_status') AS teeth_status_policies;
