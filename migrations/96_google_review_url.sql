-- Migration 96: Google review link (Backlog #7 — last competitive-backlog item)
-- clinic_settings.google_review_url TEXT (nullable). Manual WhatsApp
-- click-to-chat "review request" via the profile WA hub — Syria model:
-- no SMS/email automation, doctor decides when to ask. ADDITIVE + idempotent.
-- 🔒 معزول عن المالية.

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'clinic_settings' AND column_name = 'google_review_url'
       AND is_nullable = 'YES')
    AS review_col_ok,                                     -- expected: 1
  (SELECT count(*) FROM pg_policies WHERE tablename = 'clinic_settings')
    AS cs_policies;                                       -- expected: unchanged from your baseline
