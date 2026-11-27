-- ═════════════════════════════════════════════════════════════════
-- Migration 231 — dx_key accepts the «!» note marker (teeth_status_dx_key_check)
-- Date: 27 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY: v610 writes a finding recorded ON TOP of a completed restoration as a
-- note on that restoration's row — dx_key 'O:!cond-fracture' («ملاحظة على
-- العلاج»). The M179 check only allowed 'SURF:cond-key', so the database
-- refused that write (23514) and the note never saved. Found during the
-- 27/11 «التشخيص ← العلاج» review (owner: «ابدا»). Live data at the time:
-- one row carries dx_key, none carries «!» — nothing to backfill.
--
-- Change: the same check, each pair may carry an optional «!» right before
-- 'cond-'. Every value valid before stays valid; nothing else is touched —
-- the column, the trigger fn_teeth_status_dx and teeth_status_history (which
-- has no check on dx_key) stay as they are. No RLS change · no financial effect.
--
-- The diagnosis → treatment round needs no schema change of its own: a
-- diagnosis is linked to its treatment through this same column
-- ('COND:cond-pulp-necrosis,R1:cond-apical' on the treatment row).
--
-- Rollback-tested on dental-prod inside a transaction that rolled back:
-- 4 valid shapes accepted · 6 malformed shapes rejected · a real row took a
-- «!» note and refused a malformed one.
--
-- ROLLBACK (only while no row carries «!» — otherwise the old check fails to add):
--   ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_dx_key_check;
--   ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_dx_key_check
--     CHECK (dx_key IS NULL OR (length(dx_key) <= 400 AND dx_key ~ '^[A-Z0-9]+:cond-[a-z-]+(,[A-Z0-9]+:cond-[a-z-]+)*$'));
-- ═════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_dx_key_check;
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_dx_key_check
  CHECK (dx_key IS NULL OR (length(dx_key) <= 400 AND dx_key ~ '^[A-Z0-9]+:!?cond-[a-z-]+(,[A-Z0-9]+:!?cond-[a-z-]+)*$'));
COMMENT ON COLUMN public.teeth_status.dx_key IS 'M179/M231: diagnosis(es) carried by this treatment row — "SURF:cond-key[,SURF:cond-key]"; a pair written "SURF:!cond-key" is a note on a completed treatment (v610). Kept through planned→completed; NULL on condition rows.';

COMMIT;
