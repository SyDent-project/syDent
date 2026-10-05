-- Migration 145: alternative treatment-plan options on ledger_sessions
-- Planned sessions can be tagged as belonging to option 1..3 (أ/ب/ج) so the
-- patient-facing plan document can present alternatives side by side
-- (e.g. zirconia vs. porcelain crown) each with its own total.
-- NULL = shared item (part of every option) — and the state of every row
-- when the feature is unused. Display-only, exactly like `phase` (M75):
-- plan_option NEVER enters FIFO allocation, splitIsEarned, or any balance
-- math. Nullable, no backfill. Existing RLS covers it.

ALTER TABLE ledger_sessions ADD COLUMN IF NOT EXISTS plan_option smallint;

ALTER TABLE ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_plan_option_check;
ALTER TABLE ledger_sessions ADD CONSTRAINT ledger_sessions_plan_option_check
  CHECK (plan_option IS NULL OR plan_option BETWEEN 1 AND 3);

COMMENT ON COLUMN ledger_sessions.plan_option IS
  'Alternative treatment-plan option (1..3 = أ/ب/ج) for planned sessions; NULL = shared by all options. Presentation-only, excluded from all financial logic.';
