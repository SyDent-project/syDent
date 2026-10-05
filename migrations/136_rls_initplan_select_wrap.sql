-- Migration 136: RLS auth_rls_initplan fix — wrap auth.<fn>() in (select …) so Postgres
-- evaluates it once per statement (InitPlan) instead of once per row. Semantics identical.
-- Generated from live pg_policies (2026-09-02); each policy re-stated with its own USING/WITH CHECK.
-- Roles/commands untouched (ALTER POLICY without TO/FOR keeps them).

ALTER POLICY "account_adjustments_owner_all" ON public.account_adjustments
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "ai_usage_log_owner_read" ON public.ai_usage_log
  USING (owner_id = (select auth.uid()));
ALTER POLICY "appointment_types_doctor_all" ON public.appointment_types
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "doctor owns appointments" ON public.appointments
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "audit_log_owner_all" ON public.audit_log
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "booking_owner_all" ON public.booking_requests
  USING (clinic_id = (select auth.uid()))
  WITH CHECK (clinic_id = (select auth.uid()));
ALTER POLICY "clinic_doctors_owner_all" ON public.clinic_doctors
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "clinic_employees_owner_all" ON public.clinic_employees
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "clinic_settings_owner_all" ON public.clinic_settings
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "clinical_note_templates_owner_all" ON public.clinical_note_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "Doctors insert own profile" ON public.doctors
  WITH CHECK ((select auth.uid()) = id);
ALTER POLICY "Doctors read own profile" ON public.doctors
  USING ((select auth.uid()) = id);
ALTER POLICY "Doctors update own profile" ON public.doctors
  USING ((select auth.uid()) = id);
ALTER POLICY "doctors_self_read" ON public.doctors
  USING (id = (select auth.uid()));
ALTER POLICY "expense_categories_owner_all" ON public.expense_categories
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "expenses_owner_all" ON public.expenses
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "implant_log_owner_all" ON public.implant_log
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "implant_templates_owner_all" ON public.implant_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "batch_owner_all" ON public.inventory_batches
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "inv_items_owner_all" ON public.inventory_items
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "inv_mov_owner_all" ON public.inventory_movements
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "lab_order_templates_owner_all" ON public.lab_order_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "doctor sees own lab orders" ON public.lab_orders
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "doctor manages own lab payments" ON public.lab_payments
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "doctor manages own labs" ON public.labs
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "doctor owns ledger_payments" ON public.ledger_payments
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "doctor owns ledger_sessions" ON public.ledger_sessions
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "operatories_owner_all" ON public.operatories
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "pd_all_own" ON public.patient_documents
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "patient_recalls_owner_all" ON public.patient_recalls
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "patient_seq_owner_all" ON public.patient_seq
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "doctor owns patients" ON public.patients
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "payment_plans_owner_all" ON public.payment_plans
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "payment_splits_doctor_all" ON public.payment_splits
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "perio_exams_own" ON public.perio_exams
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "perio_meas_own" ON public.perio_measurements
  USING (doctor_id = (select auth.uid()))
  WITH CHECK (doctor_id = (select auth.uid()));
ALTER POLICY "platform_admins_self_read" ON public.platform_admins
  USING (user_id = (select auth.uid()));
ALTER POLICY "post_op_notes_owner_all" ON public.post_op_notes
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "post_op_tmpl_owner_all" ON public.post_op_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "rx_items_owner_all" ON public.prescription_items
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "rx_tmpl_owner_all" ON public.prescription_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "rx_owner_all" ON public.prescriptions
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "provider_payouts_owner_all" ON public.provider_payouts
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "reminder_logs_owner_all" ON public.reminder_logs
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "staff_messages_owner_all" ON public.staff_messages
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "subpay_tenant_read" ON public.subscription_payments
  USING (tenant_user_id = (select auth.uid()));
ALTER POLICY "p_sub_requests_tenant_insert" ON public.subscription_requests
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "p_sub_requests_tenant_select" ON public.subscription_requests
  USING (user_id = (select auth.uid()));
ALTER POLICY "p_sub_requests_tenant_update" ON public.subscription_requests
  USING ((user_id = (select auth.uid())) AND (status = 'pending'::text))
  WITH CHECK ((user_id = (select auth.uid())) AND (status = 'cancelled'::text));
ALTER POLICY "doctor owns teeth_status" ON public.teeth_status
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "tsh_select_own" ON public.teeth_status_history
  USING (doctor_id = (select auth.uid()));
ALTER POLICY "treatment_bundles_owner_all" ON public.treatment_bundles
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "tmat_owner_all" ON public.treatment_materials
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "price_history_owner_all" ON public.treatment_price_history
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "Doctors manage own treatments" ON public.treatments
  USING ((select auth.uid()) = doctor_id)
  WITH CHECK ((select auth.uid()) = doctor_id);
ALTER POLICY "User can delete own trial" ON public.trial_requests
  USING (user_id = (select auth.uid()));
ALTER POLICY "User can delete own trial by email" ON public.trial_requests
  USING (email = ((select auth.jwt()) ->> 'email'::text));
ALTER POLICY "User read own trial" ON public.trial_requests
  USING (email = ((select auth.jwt()) ->> 'email'::text));
ALTER POLICY "trial_requests_self_select_by_uid" ON public.trial_requests
  USING (user_id = (select auth.uid()));
ALTER POLICY "wa_message_templates_owner_all" ON public.wa_message_templates
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
