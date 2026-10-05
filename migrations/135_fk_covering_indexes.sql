-- Migration 135: covering indexes for every FK the Supabase linter reports as unindexed (29).
-- Additive & idempotent. Zero behaviour change: FK checks (DELETE/UPDATE on parent) and joins
-- switch from sequential scans to index lookups. Names follow idx_<table>_<col>.
-- Source of the list: live pg_constraint minus pg_index (2026-09-02), not memory.

CREATE INDEX IF NOT EXISTS idx_account_adjustments_provider_id ON public.account_adjustments (provider_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_default_lab_id ON public.appointment_types (default_lab_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_default_operatory_id ON public.appointment_types (default_operatory_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_default_provider_id ON public.appointment_types (default_provider_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_default_treatment_id ON public.appointment_types (default_treatment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_treatment_id ON public.appointments (treatment_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_employee_id ON public.audit_log (employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_patient_id ON public.audit_log (patient_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_appointment_id ON public.booking_requests (appointment_id);
CREATE INDEX IF NOT EXISTS idx_clinic_doctors_user_id ON public.clinic_doctors (user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_id ON public.inventory_batches (item_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_templates_lab_id ON public.lab_order_templates (lab_id);
CREATE INDEX IF NOT EXISTS idx_ledger_payments_doctor_id ON public.ledger_payments (doctor_id);
CREATE INDEX IF NOT EXISTS idx_ledger_sessions_doctor_id ON public.ledger_sessions (doctor_id);
CREATE INDEX IF NOT EXISTS idx_operatories_default_provider_id ON public.operatories (default_provider_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_session_id ON public.patient_documents (session_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_granted_by ON public.platform_admins (granted_by);
CREATE INDEX IF NOT EXISTS idx_prescription_items_owner_id ON public.prescription_items (owner_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment_id ON public.prescriptions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_provider_id ON public.prescriptions (provider_id);
CREATE INDEX IF NOT EXISTS idx_staff_messages_patient_id ON public.staff_messages (patient_id);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_trial_request_id ON public.subscription_requests (trial_request_id);
CREATE INDEX IF NOT EXISTS idx_teeth_status_provider_id ON public.teeth_status (provider_id);
CREATE INDEX IF NOT EXISTS idx_treatment_bundles_child_id ON public.treatment_bundles (child_id);
CREATE INDEX IF NOT EXISTS idx_treatment_bundles_owner_id ON public.treatment_bundles (owner_id);
CREATE INDEX IF NOT EXISTS idx_treatment_materials_item_id ON public.treatment_materials (item_id);
CREATE INDEX IF NOT EXISTS idx_treatment_price_history_changed_by ON public.treatment_price_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_treatment_price_history_doctor_id_override ON public.treatment_price_history (doctor_id_override);
CREATE INDEX IF NOT EXISTS idx_treatment_price_history_owner_id ON public.treatment_price_history (owner_id);
