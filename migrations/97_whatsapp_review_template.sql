-- Migration 97: editable Google-review WhatsApp template (Backlog #7 follow-up)
-- clinic_settings.whatsapp_review_template TEXT (nullable) — mirrors the other
-- four editable WA templates. Empty/NULL → the app falls back to the built-in
-- default. ADDITIVE + idempotent. 🔒 معزول عن المالية.

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS whatsapp_review_template TEXT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'clinic_settings' AND column_name = 'whatsapp_review_template'
       AND is_nullable = 'YES')
    AS review_tpl_col_ok,                                 -- expected: 1
  (SELECT count(*) FROM pg_policies WHERE tablename = 'clinic_settings')
    AS cs_policies;                                       -- expected: unchanged
