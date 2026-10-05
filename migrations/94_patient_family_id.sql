-- Migration 94: family/household linking v1 (Backlog #6)
-- patients.family_id = free-grouping uuid (nullable). Navigation layer ONLY:
-- finances stay 100% individual — the financial guarantor concept is
-- deliberately deferred (it touches FIFO). No FK, no RLS change, additive
-- and idempotent.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS family_id uuid;

-- Fast member lookups (partial: most patients are unlinked)
CREATE INDEX IF NOT EXISTS idx_patients_family
  ON patients (doctor_id, family_id) WHERE family_id IS NOT NULL;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'patients' AND column_name = 'family_id'
       AND data_type = 'uuid' AND is_nullable = 'YES')
    AS family_col_ok,                                     -- expected: 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'patients' AND indexname = 'idx_patients_family')
    AS family_idx,                                        -- expected: 1
  (SELECT count(*) FROM pg_policies WHERE tablename = 'patients')
    AS patients_policies;                                 -- expected: unchanged from your baseline (1)
