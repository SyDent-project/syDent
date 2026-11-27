-- ═════════════════════════════════════════════════════════════════════
-- Migration 230 — نوعُ موظفٍ «محاسب» (accountant employee type)
-- Date: 27 November 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, 27/11): a secretary who was given «الرواتب والدفعات» saw
-- everyone's payouts. Rule: any non-owner employee sees only their own
-- payouts; only the ACCOUNTANT sees all payouts and the accounting page.
-- The accountant was hidden inside «آخر (محاسب/عامل/إلخ)» — it becomes its
-- own employee type so the client can tell it apart.
--
-- Model: clinic_employees.provider_type gains 'accountant'. Like 'other' it
-- is non-clinical: role stays 'secretary', no clinic_doctors row (so the
-- clinic_doctors CHECK and trg_clinic_doctors_clinical_only are untouched).
-- No data changes: existing rows keep their type; the owner picks «محاسب»
-- for the person himself.
--
-- ROLLBACK (only while no row uses 'accountant' — else set those rows to 'other' first):
--   ALTER TABLE public.clinic_employees DROP CONSTRAINT IF EXISTS ce_provider_type_valid;
--   ALTER TABLE public.clinic_employees ADD CONSTRAINT ce_provider_type_valid
--     CHECK (provider_type IS NULL OR provider_type IN ('doctor','hygienist','assistant','secretary','other'));
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clinic_employees DROP CONSTRAINT IF EXISTS ce_provider_type_valid;
ALTER TABLE public.clinic_employees ADD CONSTRAINT ce_provider_type_valid
  CHECK (provider_type IS NULL OR provider_type IN ('doctor','hygienist','assistant','secretary','other','accountant'));

COMMIT;
