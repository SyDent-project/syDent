-- Migration 101: allow 'whatsapp_draft' in ai_usage_log.feature — Smart WhatsApp draft (backlog #6)
--
-- ⚠️ RECONSTRUCTED 2026-07-26. This migration was originally applied DB-only via
-- the Supabase SQL Editor and its file was never committed (commit fa23ea8
-- documents the pattern: "98 reserved for DB-only AI migration"). The DDL below
-- is NOT guessed: it is derived from two authoritative schema snapshots in this
-- repo — db/schema.sql at 9b15522 (2026-07-21, pre-state) versus 907b5e9
-- (2026-07-26, post-state). Their only difference across the whole schema is
-- this one CHECK constraint, extended by exactly four values; migrations 98,
-- 100, 101 and 102 are those four steps in feature order.
--
-- Free-text WhatsApp messages only — prescription / post-op / review paths
-- keep their structured text and are never AI-written.
--
-- Idempotent: drops the constraint if present, then recreates it. Re-running is
-- safe, and running the four in order reproduces the live constraint byte-for-
-- byte. ADDITIVE — widens an allowed set, never narrows it.
-- 🔒 معزول عن المالية.

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_feature_check
  CHECK (feature = ANY (ARRAY[
    'session_note'::text,
    'patient_summary'::text,
    'booking_chat'::text,
    'treatment_plan_explanation'::text,
    'followup_message'::text,
    'whatsapp_draft'::text
  ]));

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM pg_constraint
     WHERE conname = 'ai_usage_log_feature_check'
       AND pg_get_constraintdef(oid) LIKE '%whatsapp_draft%')
    AS accepts_whatsapp_draft,                                     -- expected: 1
  (SELECT count(*) FROM pg_policies WHERE tablename = 'ai_usage_log')
    AS ai_usage_log_policies;                             -- expected: unchanged from your baseline
