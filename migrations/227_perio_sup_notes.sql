-- ════════════════════════════════════════════════════════════════════
-- Migration 227 — ملاحظة السن الزائد بفحص اللثة (supernumerary note on a perio exam · ج3)
-- Date: 25 November 2026 | Idempotent: yes | Applied via Supabase MCP (rollback-tested first)
--
-- WHY: the owner's revised decision for release 3 (25/11/2026, docs/SUPERNUMERARY.md): a
-- supernumerary tooth does NOT get a column in the perio chart (like Open Dental and Dentrix);
-- when the patient has one, the perio page shows a «أسنان زائدة» box with one note per tooth.
--
-- WHAT:
--   1. perio_exams.sup_notes JSONB — { "<code>": "<note>" }, the code being a supernumerary code
--      of a PERMANENT host (host × 10 + place: hosts 11–48, place 1–4 — the set M226 allowed in
--      perio_measurements). Validated by _perio_sup_notes_ok: an object, ≤ 40 keys, each value a
--      non-empty string of ≤ 300 characters. NULL = no notes.
--   2. perio_measurements.tooth_num back to the FDI permanent teeth (11–48): M226 widened it for
--      supernumerary columns that are no longer built. Guarded: aborts if any such row exists.
--
-- Security: RLS on perio_exams unchanged (owner-only + subscription gate). The validator is
-- EXECUTE for authenticated/service_role only (the CHECK runs as the writing role), not anon.
--
-- ROLLBACK:
--   ALTER TABLE public.perio_exams DROP CONSTRAINT IF EXISTS perio_exams_sup_notes_ok;
--   ALTER TABLE public.perio_exams DROP COLUMN IF EXISTS sup_notes;
--   DROP FUNCTION IF EXISTS public._perio_sup_notes_ok(jsonb);
--   (and re-apply the perio check from migrations/226_supernumerary_tooth.sql if wanted)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) validator ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._perio_sup_notes_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE k TEXT; v JSONB; n INT := 0;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    n := n + 1;
    IF n > 40 THEN RETURN false; END IF;
    IF k !~ '^[1-4][1-8][1-4]$' THEN RETURN false; END IF;
    IF jsonb_typeof(v) <> 'string' THEN RETURN false; END IF;
    IF length(btrim(v #>> '{}')) = 0 OR length(v #>> '{}') > 300 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;

-- The CHECK below runs it as the writing role: the clinic's own session needs EXECUTE, nobody else does.
REVOKE ALL ON FUNCTION public._perio_sup_notes_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._perio_sup_notes_ok(jsonb) TO authenticated, service_role;

-- ── 2) the column ─────────────────────────────────────────────────────
ALTER TABLE public.perio_exams ADD COLUMN IF NOT EXISTS sup_notes JSONB;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perio_exams_sup_notes_ok') THEN
    ALTER TABLE public.perio_exams
      ADD CONSTRAINT perio_exams_sup_notes_ok CHECK (public._perio_sup_notes_ok(sup_notes));
  END IF;
END $$;

-- ── 3) perio_measurements back to 11–48 ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.perio_measurements WHERE tooth_num < 11 OR tooth_num > 48) THEN
    RAISE EXCEPTION 'M227: perio_measurements holds supernumerary rows — resolve them first';
  END IF;
END $$;
ALTER TABLE public.perio_measurements DROP CONSTRAINT IF EXISTS perio_measurements_tooth_num_check;
ALTER TABLE public.perio_measurements ADD CONSTRAINT perio_measurements_tooth_num_check
  CHECK (tooth_num >= 11 AND tooth_num <= 48);

COMMIT;
