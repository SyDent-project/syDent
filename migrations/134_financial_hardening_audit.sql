-- Migration 134 — financial-layer hardening (comprehensive accounting audit, 2 Sep 2026).
--
-- D1) realloc_patient_splits (Migration 64, SECURITY DEFINER) trusted its JSON
--     payload blindly: payment_id / session_id / provider_id were never checked
--     against the caller's tenant or the target patient, a split could land on a
--     non-completed session (Accounting Reference §2.1.1 was client-only), and the
--     per-payment sum could exceed the payment. All four invariants are now
--     enforced server-side; a violation aborts the whole call (the transaction
--     rolls back, so the patient never loses their previous split set).
--     payment_date is derived from the payment row (single source of truth) —
--     live data already agrees (0 mismatches on 35 payments).
--
-- D2) Positive-amount CHECKs the client already enforces (defense in depth):
--     ledger_payments.amount > 0 · ledger_sessions.cost >= 0 ·
--     lab_orders.cost >= 0 · provider_payouts.amount > 0.
--     Verified live before applying: 0 violating rows in all four tables.
--
-- D2b) lab_orders.paid_to_lab — dead column (0 reads in code, 0 non-zero rows;
--     lab settlement lives in lab_payments since Migration 118). Dropped.
--
-- Zero data change. Zero RLS change.

CREATE OR REPLACE FUNCTION public.realloc_patient_splits(p_patient_id uuid, p_splits jsonb DEFAULT '[]'::jsonb)
 RETURNS SETOF payment_splits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_bad   text;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND doctor_id = v_owner
  ) THEN
    RAISE EXCEPTION 'patient_not_owned' USING ERRCODE = '42501';
  END IF;

  -- Materialise the payload once (typed), then validate before touching rows.
  -- (DROP first: a failed earlier call inside the same transaction — or a test
  --  harness calling twice — would otherwise hit "relation already exists".)
  DROP TABLE IF EXISTS _rps;
  CREATE TEMP TABLE _rps ON COMMIT DROP AS
  SELECT
    (s->>'payment_id')::uuid                       AS payment_id,
    NULLIF(s->>'session_id',  '')::uuid            AS session_id,
    NULLIF(s->>'provider_id', '')::uuid            AS provider_id,
    COALESCE((s->>'amount')::numeric, 0)           AS amount,
    COALESCE((s->>'is_unearned')::boolean, false)  AS is_unearned
  FROM jsonb_array_elements(COALESCE(p_splits, '[]'::jsonb)) AS s
  WHERE (s->>'payment_id') IS NOT NULL;

  -- 1) every payment belongs to this patient and this tenant
  SELECT r.payment_id::text INTO v_bad FROM _rps r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ledger_payments lp
    WHERE lp.id = r.payment_id AND lp.patient_id = p_patient_id AND lp.doctor_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_payment_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  -- 2) every session belongs to this patient/tenant AND is completed (§2.1.1)
  SELECT r.session_id::text INTO v_bad FROM _rps r
  WHERE r.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ledger_sessions ls
    WHERE ls.id = r.session_id AND ls.patient_id = p_patient_id
      AND ls.doctor_id = v_owner AND ls.status = 'completed'
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_session_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  -- 3) every provider belongs to this tenant
  SELECT r.provider_id::text INTO v_bad FROM _rps r
  WHERE r.provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinic_doctors cd
    WHERE cd.id = r.provider_id AND cd.owner_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_provider_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  -- 4) per-payment conservation: splits never exceed the payment
  SELECT r.payment_id::text INTO v_bad
  FROM _rps r JOIN public.ledger_payments lp ON lp.id = r.payment_id
  GROUP BY r.payment_id, lp.amount
  HAVING SUM(r.amount) > lp.amount + 0.005
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_exceeds_payment: %', v_bad USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.payment_splits
  WHERE patient_id = p_patient_id
    AND doctor_id  = v_owner;

  RETURN QUERY
  INSERT INTO public.payment_splits
    (doctor_id, patient_id, payment_id, session_id, provider_id, amount, is_unearned, payment_date)
  SELECT
    v_owner, p_patient_id, r.payment_id, r.session_id, r.provider_id,
    r.amount, r.is_unearned, lp.date
  FROM _rps r JOIN public.ledger_payments lp ON lp.id = r.payment_id
  RETURNING *;
END;
$function$;

-- D2 — positive-amount CHECKs (NOT VALID would be pointless: 0 violating rows verified live)
ALTER TABLE public.ledger_payments  DROP CONSTRAINT IF EXISTS ledger_payments_amount_positive;
ALTER TABLE public.ledger_payments  ADD  CONSTRAINT ledger_payments_amount_positive  CHECK (amount > 0);
ALTER TABLE public.ledger_sessions  DROP CONSTRAINT IF EXISTS ledger_sessions_cost_nonneg;
ALTER TABLE public.ledger_sessions  ADD  CONSTRAINT ledger_sessions_cost_nonneg      CHECK (cost IS NULL OR cost >= 0);
ALTER TABLE public.lab_orders       DROP CONSTRAINT IF EXISTS lab_orders_cost_nonneg;
ALTER TABLE public.lab_orders       ADD  CONSTRAINT lab_orders_cost_nonneg           CHECK (cost IS NULL OR cost >= 0);
ALTER TABLE public.provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_amount_positive;
ALTER TABLE public.provider_payouts ADD  CONSTRAINT provider_payouts_amount_positive CHECK (amount > 0);

-- D2b — dead column
ALTER TABLE public.lab_orders DROP COLUMN IF EXISTS paid_to_lab;
