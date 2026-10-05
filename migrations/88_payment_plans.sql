-- Migration 88 — Payment Plans (خطط الأقساط — Backlog #3)
-- =========================================================================
-- Scheduling/reminder layer ON TOP of the financial system with ZERO contact
-- with it (competitive parity: Dentrix Ascend Payment Plans / CareStack
-- Payment Plans — minus Auto-Debit, which needs a card gateway that doesn't
-- exist in the Syrian manual-payment market → WhatsApp reminder instead).
--
-- ARCHITECTURE (fully-derived model — stronger isolation than a stored
-- next_due):
--   * NO next_due column and NO hooks on the payment path. Everything is
--     derived client-side at render time:
--       covered  = SUM(ledger_payments.amount) for the patient since
--                  start_date, capped at total
--       k        = FLOOR(covered / installment_amount)   (installments paid)
--       next due = start_date + k * period               (weekly/biweekly/
--                  monthly with end-of-month clamping)
--   * Recording a payment through the EXISTING payment path (FIFO untouched)
--     therefore moves the due date automatically — with zero writes here.
--     Offline-proof and self-healing by construction.
--   * The down payment is just a normal payment recorded on/after start_date.
--
-- Owner column is `doctor_id` to match ledger_sessions / ledger_payments /
-- payment_splits / account_adjustments (RLS: doctor_id = auth.uid()).
-- `amount`-family columns are BIGINT like account_adjustments (SYP integers).
-- status: active → completed (covered >= total, closed by the user with one
-- tap) | cancelled (plan abandoned; history kept).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.payment_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title              TEXT,                                   -- e.g. «تقويم»
  total              BIGINT NOT NULL CHECK (total > 0),
  installment_amount BIGINT NOT NULL CHECK (installment_amount > 0),
  frequency          TEXT NOT NULL DEFAULT 'monthly'
                     CHECK (frequency IN ('weekly','biweekly','monthly')),
  start_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','cancelled')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

-- Owner-scoped full access (same shape as account_adjustments_owner_all).
DROP POLICY IF EXISTS "payment_plans_owner_all" ON public.payment_plans;
CREATE POLICY "payment_plans_owner_all" ON public.payment_plans
  FOR ALL USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- Hot query paths: patient card (by patient) + PRM due list (owner + status).
CREATE INDEX IF NOT EXISTS idx_payment_plans_patient
  ON public.payment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_owner_status
  ON public.payment_plans(doctor_id, status);

-- WhatsApp installment-reminder template (clinic-customizable; empty/NULL →
-- the byte-identical DEFAULT_INSTALLMENT_TEMPLATE mirrored across
-- settings.html / patients.html / patient-profile.html — guarded by
-- scripts/check-mirrors.js). Additive + idempotent.
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS whatsapp_installment_template TEXT;

-- ── Verification (run tail — Rule #238) ─────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'payment_plans')  AS payment_plans_policies,   -- expect 1
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'clinic_settings'
      AND column_name = 'whatsapp_installment_template')                AS inst_tpl_col,             -- expect text
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'payment_plans')                                 AS payment_plans_cols;       -- expect 11
