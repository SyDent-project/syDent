-- Migration 99: implant templates (قوالب سجل الزرعات)
-- Reusable implant fixture-spec templates for the implant-log modal — literal
-- clone of the proven post_op_templates (M56) / clinical_note_templates (M95)
-- pattern, with implant fields instead of a free-text body.
-- CareStack implant-catalog parity. ADDITIVE + idempotent. 🔒 معزول عن المالية.
--
-- Template payload = the reusable fixture spec ONLY:
--   brand · ref_no (catalog id) · diameter · length · default notes.
-- Deliberately EXCLUDED (per-record, never templated):
--   lot_no  → unique per physical fixture box.
--   placed_at / loaded_at → per-procedure dates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.implant_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  brand         TEXT,
  ref_no        TEXT,
  diameter      NUMERIC,
  length        NUMERIC,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.implant_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "implant_templates_owner_all" ON public.implant_templates;
CREATE POLICY "implant_templates_owner_all" ON public.implant_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_implant_templates_owner
  ON public.implant_templates(owner_id, created_at DESC);

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT to_regclass('public.implant_templates') IS NOT NULL)::int
    AS table_ok,                                          -- expected: 1
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'implant_templates')
    AS tpl_policies,                                      -- expected: 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'implant_templates'
       AND indexname = 'idx_implant_templates_owner')
    AS tpl_idx;                                           -- expected: 1
