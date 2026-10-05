-- Migration 95: clinical note templates (Backlog #9)
-- Reusable quick-note templates for the session notes field — literal clone of
-- the proven post_op_templates pattern (M56), minus treatment_key (not needed).
-- OpenDental "Quick Notes" parity. ADDITIVE + idempotent. 🔒 معزول عن المالية.

BEGIN;

CREATE TABLE IF NOT EXISTS public.clinical_note_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clinical_note_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinical_note_templates_owner_all" ON public.clinical_note_templates;
CREATE POLICY "clinical_note_templates_owner_all" ON public.clinical_note_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_note_templates_owner
  ON public.clinical_note_templates(owner_id, created_at DESC);

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT to_regclass('public.clinical_note_templates') IS NOT NULL)::int
    AS table_ok,                                          -- expected: 1
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'clinical_note_templates')
    AS tpl_policies,                                      -- expected: 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'clinical_note_templates'
       AND indexname = 'idx_note_templates_owner')
    AS tpl_idx;                                           -- expected: 1
