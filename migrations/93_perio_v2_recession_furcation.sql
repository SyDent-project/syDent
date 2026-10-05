-- Migration 93: Perio v2 — gingival recession (6-site) + furcation grade (molars)
-- Purely additive on perio_measurements (M77). CAL (= PD + recession) is DERIVED
-- in the UI and intentionally NOT stored. RLS untouched. Clinical layer only —
-- fully isolated from the financial system.

ALTER TABLE perio_measurements
  ADD COLUMN IF NOT EXISTS rec_mb smallint CHECK (rec_mb BETWEEN 0 AND 19),
  ADD COLUMN IF NOT EXISTS rec_b  smallint CHECK (rec_b  BETWEEN 0 AND 19),
  ADD COLUMN IF NOT EXISTS rec_db smallint CHECK (rec_db BETWEEN 0 AND 19),
  ADD COLUMN IF NOT EXISTS rec_ml smallint CHECK (rec_ml BETWEEN 0 AND 19),
  ADD COLUMN IF NOT EXISTS rec_l  smallint CHECK (rec_l  BETWEEN 0 AND 19),
  ADD COLUMN IF NOT EXISTS rec_dl smallint CHECK (rec_dl BETWEEN 0 AND 19),
  -- furcation grade: NULL = not assessed · 0 = assessed, none · 1..3 = Glickman-style I/II/III
  ADD COLUMN IF NOT EXISTS furcation smallint CHECK (furcation BETWEEN 0 AND 3);

-- ── Verification (run in the same SQL editor session; expected values noted) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'perio_measurements'
       AND column_name IN ('rec_mb','rec_b','rec_db','rec_ml','rec_l','rec_dl','furcation'))
    AS v2_cols_added,                                     -- expected: 7
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'perio_measurements')             -- expected: 24 (17 pre-M92 + 7)
    AS total_cols,
  (SELECT count(*) FROM pg_policies
     WHERE tablename IN ('perio_exams','perio_measurements'))
    AS perio_policies;                                    -- expected: 2 (unchanged — Rule #238)
