-- ═══════════════════════════════════════════════════════════════
-- Migration 104 — quarterly billing cycle (third cadence)
-- ─────────────────────────────────────────────────────────────
-- WHY: the platform offered exactly two cadences — monthly (30d) and
-- yearly (365d). Yearly is priced at ~10× monthly, which in a cash
-- market with no payment gateway means ONE large up-front handover
-- (e.g. Max yearly = 50,000 SYP-equivalent). That is a real adoption
-- barrier: "monthly = admin overhead" vs "yearly = too much cash at
-- once", with nothing in between. Quarterly (90d) is that middle rung.
--
-- ARCHITECTURE (Rule #116 — unchanged, this migration only widens it):
-- A tier (subscription_plans row) is a CATALOG row carrying several
-- prices (Stripe Product→Prices). The billing CYCLE lives on the
-- SUBSCRIPTION (trial_requests.billing_cycle / subscription_requests
-- .billing_cycle), not on the tier. Cycle day-counts stay in the app
-- layer (CYCLE_DAYS = {monthly:30, quarterly:90, yearly:365}) — this
-- migration adds NO duration column.
--
-- WHAT:
--   1) subscription_plans.price_quarterly    (NUMERIC, nullable)
--   2) subscription_plans.subtitle_quarterly (TEXT,    nullable)
--   3) widen the THREE billing_cycle CHECKs from ('monthly','yearly') to
--      ('monthly','quarterly','yearly'):
--        • trial_requests_billing_cycle_chk        (Migration 46 step 7)
--        • subscription_requests_billing_cycle_chk (Migration 46 step 7)
--        • the inline CHECK on subscription_payments.billing_cycle
--          (Migration 47) — NOT optional: admin.html recordPayment() writes
--          billing_cycle on every payment row, so leaving it at two values
--          means a quarterly subscription can be ACTIVATED but its payment
--          INSERT is rejected by the DB. The constraint is anonymous in 47
--          (inline column CHECK ⇒ auto-named), so it is located by scanning
--          pg_constraint for the table rather than by a fixed name.
--
-- NULL SEMANTICS (the backward-compatibility contract):
--   price_quarterly IS NULL  ⇒ the tier does NOT offer a quarterly
--   cycle. Every reader (landing / subscription / admin plan picker)
--   already treats a null cycle price as "غير متاح بهذه الدورة" —
--   this is the exact pre-existing behaviour for a tier with no
--   price_yearly, so shipping the columns EMPTY changes nothing that
--   a user can see. The owner fills the prices from the admin plan
--   editor afterwards, at which point the cycle appears by itself.
--   subtitle_quarterly IS NULL/'' ⇒ falls back to the base subtitle
--   (mirrors the Migration 83 subtitle_yearly contract exactly).
--
-- NO BACKFILL — intentionally. No subscription can be quarterly yet
-- (the CHECK forbade it until this migration), and inferring a
-- quarterly price from `price` would be guesswork. Existing monthly
-- and yearly subscribers are untouched: their billing_cycle values
-- still satisfy the widened CHECK, which is a strict superset.
--
-- NO PRORATION — SyDent bills manually with admin confirmation; there
-- is no mid-cycle proration anywhere in the platform and none is
-- introduced here.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK swap (the swap
-- is skipped entirely when the constraint already permits 'quarterly').
--
-- ROLLBACK:
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS price_quarterly;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS subtitle_quarterly;
--   -- then re-narrow the CHECKs after first clearing any quarterly rows:
--   -- UPDATE trial_requests         SET billing_cycle='monthly' WHERE billing_cycle='quarterly';
--   -- UPDATE subscription_requests  SET billing_cycle='monthly' WHERE billing_cycle='quarterly';
--   -- UPDATE subscription_payments  SET billing_cycle='monthly' WHERE billing_cycle='quarterly';
-- ═══════════════════════════════════════════════════════════════

-- ---- 1. Catalog columns (price + cycle-aware subtitle) ----
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_quarterly NUMERIC;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS subtitle_quarterly TEXT;

COMMENT ON COLUMN public.subscription_plans.price_quarterly IS
  'Migration 104: price for the 90-day quarterly cycle. NULL = tier does not offer a quarterly cycle (readers render «غير متاح بهذه الدورة»).';
COMMENT ON COLUMN public.subscription_plans.subtitle_quarterly IS
  'Migration 104: subtitle shown when the quarterly cycle is selected. NULL/blank falls back to subscription_plans.subtitle (same contract as subtitle_yearly, Migration 83).';

-- ---- 2. trial is free on every cycle (matches Migration 46 step 3) ----
UPDATE public.subscription_plans
   SET price_quarterly = COALESCE(price_quarterly, 0)
 WHERE code = 'trial';

-- ---- 3. Widen the billing_cycle CHECKs to include 'quarterly' ----
-- Migration 46 step 7 created these as ('monthly','yearly'). Swap them
-- only when they don't already allow 'quarterly', so re-running is a
-- no-op. The new set is a strict SUPERSET → no existing row can fail.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  -- trial_requests
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'trial_requests_billing_cycle_chk';
  IF v_def IS NULL THEN
    ALTER TABLE public.trial_requests ADD CONSTRAINT trial_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','yearly'));
    RAISE NOTICE 'Migration 104: created trial_requests_billing_cycle_chk';
  ELSIF v_def NOT LIKE '%quarterly%' THEN
    ALTER TABLE public.trial_requests DROP CONSTRAINT trial_requests_billing_cycle_chk;
    ALTER TABLE public.trial_requests ADD CONSTRAINT trial_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','yearly'));
    RAISE NOTICE 'Migration 104: widened trial_requests_billing_cycle_chk';
  ELSE
    RAISE NOTICE 'Migration 104: trial_requests_billing_cycle_chk already allows quarterly — skipped';
  END IF;

  -- subscription_requests
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'subscription_requests_billing_cycle_chk';
  IF v_def IS NULL THEN
    ALTER TABLE public.subscription_requests ADD CONSTRAINT subscription_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','yearly'));
    RAISE NOTICE 'Migration 104: created subscription_requests_billing_cycle_chk';
  ELSIF v_def NOT LIKE '%quarterly%' THEN
    ALTER TABLE public.subscription_requests DROP CONSTRAINT subscription_requests_billing_cycle_chk;
    ALTER TABLE public.subscription_requests ADD CONSTRAINT subscription_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','yearly'));
    RAISE NOTICE 'Migration 104: widened subscription_requests_billing_cycle_chk';
  ELSE
    RAISE NOTICE 'Migration 104: subscription_requests_billing_cycle_chk already allows quarterly — skipped';
  END IF;
END $$;

-- ---- 4. Widen the subscription_payments.billing_cycle CHECK (Migration 47) ----
-- This one was declared INLINE on the column, so PostgreSQL auto-named it
-- (typically subscription_payments_billing_cycle_check). Never hardcode that
-- name: find the constraint by what it constrains. We look for a CHECK on the
-- table whose definition mentions billing_cycle but NOT yet 'quarterly', drop
-- it, and re-add a named one so any future migration can address it directly.
DO $$
DECLARE r RECORD;
  v_found BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel    ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid  = rel.relnamespace
     WHERE con.contype = 'c'
       AND ns.nspname  = 'public'
       AND rel.relname = 'subscription_payments'
       AND pg_get_constraintdef(con.oid) LIKE '%billing_cycle%'
       AND pg_get_constraintdef(con.oid) NOT LIKE '%quarterly%'
  LOOP
    EXECUTE format('ALTER TABLE public.subscription_payments DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Migration 104: dropped narrow payments CHECK %', r.conname;
  END LOOP;

  SELECT TRUE INTO v_found FROM pg_constraint
   WHERE conname = 'subscription_payments_billing_cycle_chk';
  IF v_found IS NOT TRUE THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','yearly'));
    RAISE NOTICE 'Migration 104: added subscription_payments_billing_cycle_chk';
  ELSE
    RAISE NOTICE 'Migration 104: subscription_payments_billing_cycle_chk already present — skipped';
  END IF;
END $$;

-- ── Verification (run after apply — Rule #238 tail) ──
-- expect: price_quarterly_col = 1, subtitle_quarterly_col = 1,
--         tr_chk_quarterly = true, sr_chk_quarterly = true,
--         sp_chk_quarterly = true, sp_narrow_left = 0,
--         policies_total unchanged vs. pre-migration (no policy touched).
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_plans'
       AND column_name = 'price_quarterly')                          AS price_quarterly_col,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_plans'
       AND column_name = 'subtitle_quarterly')                       AS subtitle_quarterly_col,
  (SELECT pg_get_constraintdef(oid) LIKE '%quarterly%' FROM pg_constraint
     WHERE conname = 'trial_requests_billing_cycle_chk')             AS tr_chk_quarterly,
  (SELECT pg_get_constraintdef(oid) LIKE '%quarterly%' FROM pg_constraint
     WHERE conname = 'subscription_requests_billing_cycle_chk')      AS sr_chk_quarterly,
  (SELECT pg_get_constraintdef(oid) LIKE '%quarterly%' FROM pg_constraint
     WHERE conname = 'subscription_payments_billing_cycle_chk')      AS sp_chk_quarterly,
  (SELECT COUNT(*) FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'subscription_payments'
      AND pg_get_constraintdef(con.oid) LIKE '%billing_cycle%'
      AND pg_get_constraintdef(con.oid) NOT LIKE '%quarterly%')      AS sp_narrow_left,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')     AS policies_total;

-- Catalog sanity — every tier's three prices side by side (quarterly is
-- expected to be NULL for all paid tiers until the owner fills it in):
-- SELECT code, display_name, price_monthly, price_quarterly, price_yearly,
--        subtitle, subtitle_quarterly, subtitle_yearly, sort_order, is_active
--   FROM public.subscription_plans ORDER BY sort_order;
