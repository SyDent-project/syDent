-- ═══════════════════════════════════════════════════════════════
-- Migration 105 — USD pricing (second display/settlement currency)
-- ─────────────────────────────────────────────────────────────
-- WHY: SYP is volatile; many clinics prefer committing in a stable
-- currency. Competitor model (Chargebee/Stripe/Zuora): a currency is
-- just another PRICE POINT dimension on the catalog row — static,
-- hand-set, psychological prices per currency ("market-based
-- pricing"), NEVER an automatic exchange-rate conversion (that yields
-- ugly drifting numbers and re-bills subscribers different amounts).
--
-- ARCHITECTURE (extends Rule #116 + Migration 104 unchanged):
--   subscription_plans row = catalog carrying prices per (cycle ×
--   currency). Existing price_monthly/quarterly/yearly stay SYP.
--   Three new *_usd columns hold the USD price points. The chosen
--   currency is LOCKED onto the subscription at request time
--   (trial_requests.currency — column already exists and is written
--   by transitionAccount; subscription_payments.currency — Migration
--   47). subscription_requests lacked the column → added here so the
--   admin queue knows which currency the doctor asked for.
--
-- NULL SEMANTICS (same contract as Migration 104):
--   price_*_usd IS NULL ⇒ that (cycle × USD) point is not offered.
--   A tier with all three USD columns NULL simply never appears in
--   the USD view. Shipping the columns empty is a user-visible no-op.
--
-- usd_report_rate (platform_settings): a MANUAL, admin-set rate used
-- EXCLUSIVELY to normalize mixed-currency MRR in the admin reports
-- layer. It never prices anything, never converts a charge, never
-- reaches tenant pages. Empty value ⇒ reports show USD rows as
-- "unset" instead of silently mixing units.
--
-- NO backfill · NO proration · NO CHECK on trial_requests/payments
-- currency text (free-text-by-app-contract, matching the existing
-- rows) — the CHECK below is only on the NEW subscription_requests
-- column where no legacy rows exist.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK + ON CONFLICT
-- DO NOTHING seed.
--
-- ROLLBACK:
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS price_monthly_usd;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS price_quarterly_usd;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS price_yearly_usd;
--   ALTER TABLE public.subscription_requests DROP COLUMN IF EXISTS currency;
--   DELETE FROM public.platform_settings WHERE key = 'usd_report_rate';
-- ═══════════════════════════════════════════════════════════════

-- ---- 1. USD price points on the catalog ----
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_monthly_usd   NUMERIC;
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_quarterly_usd NUMERIC;
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_yearly_usd    NUMERIC;

COMMENT ON COLUMN public.subscription_plans.price_monthly_usd IS
  'Migration 105: hand-set USD price for the monthly cycle. NULL = (monthly × USD) not offered. Never derived from SYP by a rate.';
COMMENT ON COLUMN public.subscription_plans.price_quarterly_usd IS
  'Migration 105: hand-set USD price for the quarterly cycle. NULL = not offered.';
COMMENT ON COLUMN public.subscription_plans.price_yearly_usd IS
  'Migration 105: hand-set USD price for the yearly cycle. NULL = not offered.';

-- trial is free on every (cycle × currency)
UPDATE public.subscription_plans
   SET price_monthly_usd   = COALESCE(price_monthly_usd,   0),
       price_quarterly_usd = COALESCE(price_quarterly_usd, 0),
       price_yearly_usd    = COALESCE(price_yearly_usd,    0)
 WHERE code = 'trial';

-- ---- 2. Requested currency on the upgrade/renew queue ----
ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN public.subscription_requests.currency IS
  'Migration 105: currency the doctor chose at request time (SYP/USD). NULL = legacy request (treated as SYP).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'subscription_requests_currency_chk') THEN
    ALTER TABLE public.subscription_requests
      ADD CONSTRAINT subscription_requests_currency_chk
      CHECK (currency IS NULL OR currency IN ('SYP','USD'));
    RAISE NOTICE 'Migration 105: added subscription_requests_currency_chk';
  ELSE
    RAISE NOTICE 'Migration 105: subscription_requests_currency_chk already present — skipped';
  END IF;
END $$;

-- ---- 3. Reports-only USD normalization rate (admin-set, manual) ----
-- Seeded EMPTY on purpose: the admin fills it from إعدادات المنصة. The
-- reports layer treats empty/invalid as "rate unset" and refuses to mix.
INSERT INTO public.platform_settings (key, value)
VALUES ('usd_report_rate', '')
ON CONFLICT (key) DO NOTHING;

-- ── Verification (run after apply — Rule #238 tail) ──
-- expect: usd_cols = 3, sr_currency_col = 1, sr_curr_chk = true,
--         rate_row = 1, trial_usd_zeroed = 1 (the trial row),
--         policies_total unchanged vs. pre-migration.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_plans'
       AND column_name IN ('price_monthly_usd','price_quarterly_usd','price_yearly_usd'))
                                                                     AS usd_cols,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_requests'
       AND column_name = 'currency')                                 AS sr_currency_col,
  (SELECT pg_get_constraintdef(oid) LIKE '%USD%' FROM pg_constraint
     WHERE conname = 'subscription_requests_currency_chk')           AS sr_curr_chk,
  (SELECT COUNT(*) FROM public.platform_settings
     WHERE key = 'usd_report_rate')                                  AS rate_row,
  (SELECT COUNT(*) FROM public.subscription_plans
     WHERE code = 'trial' AND price_monthly_usd = 0
       AND price_quarterly_usd = 0 AND price_yearly_usd = 0)         AS trial_usd_zeroed,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')     AS policies_total;

-- Catalog sanity (all *_usd expected NULL for paid tiers until filled):
-- SELECT code, price_monthly, price_monthly_usd, price_quarterly,
--        price_quarterly_usd, price_yearly, price_yearly_usd
--   FROM public.subscription_plans ORDER BY sort_order;
