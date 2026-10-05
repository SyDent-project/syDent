-- ============================================================================
-- Migration 132 — per-plan AI monthly call caps (entitlements.ai_monthly_calls)
-- ----------------------------------------------------------------------------
-- WHY  : watch-point #70 — the ai-assist Edge Function enforced a single
--        hardcoded MONTHLY_CALL_CAP=1000 for every clinic. Before the first
--        paying customer the cap must become a per-plan catalog value so the
--        Pro tier (code='monthly') and the trial carry a tighter cost guard
--        than Max (code='yearly').
-- WHAT : seeds an integer key `ai_monthly_calls` INSIDE subscription_plans.
--        entitlements (jsonb) — same column the plan gate already reads, so
--        ai-assist fetches gate + cap in the one existing query. No schema
--        change: additive jsonb key only.
--          monthly (Pro) → 300     trial → 300     yearly (Max) → 1000
-- READS: ai-assist gate 4 (fallback MONTHLY_CALL_CAP=1000 when the key is
--        absent/invalid — grandfather philosophy: plans without the key keep
--        the legacy cap). admin-plans.js exposes the key as a numeric field.
-- IDEMPOTENT: the seed only fires when the key is ABSENT, so re-running never
--        overwrites a value the owner later tuned from the admin editor.
-- ============================================================================

-- Guard: the entitlements column must exist (Migration 35). A plain UPDATE on
-- a missing column would abort anyway, but we fail loudly with a clear reason.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscription_plans'
      AND column_name  = 'entitlements'
  ) THEN
    RAISE EXCEPTION 'Migration 132: subscription_plans.entitlements missing — Migration 35 not applied';
  END IF;
END $$;

-- Seed Pro + trial at 300 calls / calendar month (only when absent).
UPDATE subscription_plans
SET entitlements = jsonb_set(COALESCE(entitlements, '{}'::jsonb),
                             '{ai_monthly_calls}', '300'::jsonb, true)
WHERE code IN ('monthly', 'trial')
  AND NOT (COALESCE(entitlements, '{}'::jsonb) ? 'ai_monthly_calls');

-- Seed Max at 1000 calls / calendar month (only when absent).
UPDATE subscription_plans
SET entitlements = jsonb_set(COALESCE(entitlements, '{}'::jsonb),
                             '{ai_monthly_calls}', '1000'::jsonb, true)
WHERE code = 'yearly'
  AND NOT (COALESCE(entitlements, '{}'::jsonb) ? 'ai_monthly_calls');
