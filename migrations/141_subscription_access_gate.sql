-- Migration 141: بوابةُ الاشتراك بالقاعدة — التجربةُ المنتهية محجوبة، والمشتركُ المنتهي للقراءة فقط.
--
-- البلاغ (17 أيلول 2026، المالك بسبع صور): حسابٌ تجريبيٌّ منتهٍ أضاف مريضاً.
-- الفحصُ الحيّ: فحصُ الانتهاء كان بـindex.html وحده (عميلياً)، والبوابةُ المشتركة
-- وsidebar.js يفحصان الحالةَ فقط، وسياساتُ RLS الـ58 كلها «auth.uid() = المالك» بلا
-- أي نظرٍ للانتهاء — فالكونسول وحده يكفي للقراءة والكتابة. ولا الحجزُ العام ولا
-- ai-assist يعرفان الانتهاء، وزرُّ «منح فترة سماح» يكتب grace_until لا يقرؤه أحد.
--
-- القرار (المالك، بعد دراسة Cliniko/Jane/SimplePractice/Bluebeam/Zoho):
--   • تجربةٌ منتهية بلا سماح  ⇒ 'none' : لا قراءة ولا كتابة (عدا جداول المنصة).
--   • مدفوعٌ منتهٍ بلا سماح    ⇒ 'read' : قراءةٌ فقط.
--   • نشط / دائم / ضمن السماح ⇒ 'full'.
--   • جديد / موقوف / بلا صفّ   ⇒ 'none'.   أدمن المنصة ⇒ 'full'.
-- مصدرُ الحقيقة الوحيد: tenant_access_level() — مرآةُ computeAccountState بـadmin.html
-- (grace يسبق expired). العميلُ لا يعيد الحساب: يقرأ my_subscription_state().
--
-- التنفيذ: سياساتٌ RESTRICTIVE تُضاف فوق السياسات القائمة (صفر إعادة كتابة) على
-- 48 جدول عيادة عبر _sub_guard_table() — وكلُّ جدولٍ مستقبليّ يُمرَّر لها بهجرته
-- (حارس V10 بـcheck-mirrors يقارن جداول RLS بالقائمتين). أربعةُ جداول هوية
-- (clinic_settings · clinic_doctors · clinic_employees · doctors) تبقى مقروءة عند
-- 'none' كي تعمل صفحةُ الاشتراك والشريط والقفل، وكتابتُها محروسة ككل الجداول.
-- التخزين (patient-files): القراءة ≠ none · الرفع/التعديل = full · الحذف ≠ none
-- (مسارُ حذف الحساب من الإعدادات يمسح الملفات أولاً — حقُّ المحو يبقى للقراءة).
--
-- المستثنى عمداً (جداول المنصة — القائمة نفسها بـSyDentSub.OPEN_TABLES):
--   trial_requests · subscription_requests · subscription_plans · subscription_events ·
--   subscription_payments · platform_settings · platform_settings_audit ·
--   platform_admins · notification_templates · login_resolve_hits
--
-- أيضاً: الحجزُ العام يتوقف لغير 'full' · realloc_patient_splits (SECURITY DEFINER
-- تتجاوز RLS) ترفض لغير 'full' — سطرُ حارسٍ واحد بموافقة المالك الصريحة (لمسٌ مالي) ·
-- نبضةُ التواجد صارت RPC كي تبقى لوحةُ الأدمن ترى الحساب المنتهي متصلاً ·
-- سياستا حذف trial_requests الذاتيتان تُزالان (نقطة المراقبة #92؛ CASCADE منذ M140
-- يكفي، وsettings.html لم يعد يحذف الصف بالكومِت نفسه) — كانتا تسمحان لحسابٍ
-- منتهٍ بمحو صفّه فيعود «جديداً» ويُقبل بتجربةٍ ثانية.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) مستوى الوصول
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_access_level(p_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN tr.status IS DISTINCT FROM 'accepted'                 THEN 'none'
      WHEN tr.trial_end IS NULL OR tr.trial_end > now()          THEN 'full'
      WHEN tr.grace_until IS NOT NULL AND tr.grace_until > now() THEN 'full'
      WHEN COALESCE(tr.plan, 'trial') = 'trial'                  THEN 'none'
      ELSE 'read'
    END
    FROM public.trial_requests tr
    WHERE tr.user_id = p_uid
  ), 'none');
$$;
REVOKE EXECUTE ON FUNCTION public.tenant_access_level(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tenant_access_level(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_access_level()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()) THEN 'full'
    ELSE public.tenant_access_level(auth.uid())
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_access_level() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_access_level() TO authenticated, service_role;

-- ما تقرؤه الواجهة (SyDentSub.load): المستوى + الحقول اللازمة للبانرات فقط.
CREATE OR REPLACE FUNCTION public.my_subscription_state()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'level',         public.my_access_level(),
    'status',        tr.status,
    'plan',          tr.plan,
    'billing_cycle', tr.billing_cycle,
    'trial_end',     tr.trial_end,
    'grace_until',   tr.grace_until
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.trial_requests tr ON tr.user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_subscription_state() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_subscription_state() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) المُطبِّق — idempotent، ويُستدعى من أي هجرةٍ تنشئ جدول عيادة جديداً
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sub_guard_table(p_table regclass, p_read_open boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_select ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS sub_gate_delete ON %s', p_table);
  IF NOT p_read_open THEN
    EXECUTE format('CREATE POLICY sub_gate_select ON %s AS RESTRICTIVE FOR SELECT TO authenticated '
                || 'USING ((SELECT public.my_access_level()) <> ''none'')', p_table);
  END IF;
  EXECUTE format('CREATE POLICY sub_gate_insert ON %s AS RESTRICTIVE FOR INSERT TO authenticated '
              || 'WITH CHECK ((SELECT public.my_access_level()) = ''full'')', p_table);
  EXECUTE format('CREATE POLICY sub_gate_update ON %s AS RESTRICTIVE FOR UPDATE TO authenticated '
              || 'USING ((SELECT public.my_access_level()) = ''full'') '
              || 'WITH CHECK ((SELECT public.my_access_level()) = ''full'')', p_table);
  EXECUTE format('CREATE POLICY sub_gate_delete ON %s AS RESTRICTIVE FOR DELETE TO authenticated '
              || 'USING ((SELECT public.my_access_level()) = ''full'')', p_table);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._sub_guard_table(regclass, boolean) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) جداول العيادة (48) — القائمة صريحة؛ الحارس V10 يقرأ النداءات نفسها
-- ─────────────────────────────────────────────────────────────────────────────
-- جداول الهوية: مقروءة عند 'none' (صفحة الاشتراك + الشريط + قفل الأدوار)
SELECT public._sub_guard_table('public.clinic_settings',  true);
SELECT public._sub_guard_table('public.clinic_doctors',   true);
SELECT public._sub_guard_table('public.clinic_employees', true);
SELECT public._sub_guard_table('public.doctors',          true);
-- بقية جداول العيادة
SELECT public._sub_guard_table('public.account_adjustments');
SELECT public._sub_guard_table('public.ai_usage_log');
SELECT public._sub_guard_table('public.appointment_types');
SELECT public._sub_guard_table('public.appointments');
SELECT public._sub_guard_table('public.audit_log');
SELECT public._sub_guard_table('public.booking_requests');
SELECT public._sub_guard_table('public.clinical_note_templates');
SELECT public._sub_guard_table('public.expense_categories');
SELECT public._sub_guard_table('public.expenses');
SELECT public._sub_guard_table('public.implant_log');
SELECT public._sub_guard_table('public.implant_templates');
SELECT public._sub_guard_table('public.inventory_batches');
SELECT public._sub_guard_table('public.inventory_items');
SELECT public._sub_guard_table('public.inventory_movements');
SELECT public._sub_guard_table('public.lab_order_templates');
SELECT public._sub_guard_table('public.lab_orders');
SELECT public._sub_guard_table('public.lab_payments');
SELECT public._sub_guard_table('public.labs');
SELECT public._sub_guard_table('public.ledger_payments');
SELECT public._sub_guard_table('public.ledger_sessions');
SELECT public._sub_guard_table('public.operatories');
SELECT public._sub_guard_table('public.patient_documents');
SELECT public._sub_guard_table('public.patient_recalls');
SELECT public._sub_guard_table('public.patient_seq');
SELECT public._sub_guard_table('public.patients');
SELECT public._sub_guard_table('public.payment_plans');
SELECT public._sub_guard_table('public.payment_splits');
SELECT public._sub_guard_table('public.perio_exams');
SELECT public._sub_guard_table('public.perio_measurements');
SELECT public._sub_guard_table('public.post_op_notes');
SELECT public._sub_guard_table('public.post_op_templates');
SELECT public._sub_guard_table('public.prescription_items');
SELECT public._sub_guard_table('public.prescription_templates');
SELECT public._sub_guard_table('public.prescriptions');
SELECT public._sub_guard_table('public.provider_payouts');
SELECT public._sub_guard_table('public.reminder_logs');
SELECT public._sub_guard_table('public.staff_messages');
SELECT public._sub_guard_table('public.teeth_status');
SELECT public._sub_guard_table('public.teeth_status_history');
SELECT public._sub_guard_table('public.treatment_bundles');
SELECT public._sub_guard_table('public.treatment_materials');
SELECT public._sub_guard_table('public.treatment_price_history');
SELECT public._sub_guard_table('public.treatments');
SELECT public._sub_guard_table('public.wa_message_templates');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ملفات المرضى بالتخزين
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sub_gate_pf_select ON storage.objects;
DROP POLICY IF EXISTS sub_gate_pf_insert ON storage.objects;
DROP POLICY IF EXISTS sub_gate_pf_update ON storage.objects;
DROP POLICY IF EXISTS sub_gate_pf_delete ON storage.objects;
CREATE POLICY sub_gate_pf_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) <> 'none');
CREATE POLICY sub_gate_pf_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full');
CREATE POLICY sub_gate_pf_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full')
  WITH CHECK (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full');
CREATE POLICY sub_gate_pf_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) <> 'none');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) الحجز العام — لا حجوزات لعيادةٍ غير 'full' (السطر المضاف: M141)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.booking_clinic_info(p_clinic uuid)
RETURNS TABLE(clinic_name text, clinic_phone text, slot_minutes integer, work_days text, work_start time without time zone, work_end time without time zone, max_days_ahead integer, booking_note text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status  TEXT;
  v_plan    TEXT;
  v_allowed BOOLEAN;
BEGIN
  -- account gate: mirrors ensureAccountAccessible (fail-open on missing row)
  SELECT tr.status, tr.plan INTO v_status, v_plan FROM public.trial_requests tr
  WHERE tr.user_id = p_clinic LIMIT 1;
  IF v_status IN ('new','rejected','suspended') THEN RETURN; END IF;
  -- M141: subscription gate — expired (trial or paid) / missing row ⇒ booking closed.
  IF public.tenant_access_level(p_clinic) <> 'full' THEN RETURN; END IF;

  -- Migration 83 — per-plan module gate (server twin of SyDentPlan.can('booking')):
  -- blocked ONLY when the plan's entitlements JSONB carries an explicit
  -- booking=false. Everything else is fail-open (grandfather), matching the
  -- client contract exactly. v_allowed stays NULL when the plan row is
  -- missing → `IS FALSE` is false → allowed.
  IF v_plan IS NOT NULL THEN
    SELECT (COALESCE(sp.entitlements->>'booking', 'true') <> 'false')
      INTO v_allowed
      FROM public.subscription_plans sp
     WHERE sp.code = v_plan;
    IF v_allowed IS FALSE THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT cs.clinic_name, cs.clinic_phone, cs.booking_slot_minutes,
         cs.booking_work_days, cs.booking_work_start, cs.booking_work_end,
         cs.booking_max_days_ahead, cs.booking_note
  FROM public.clinic_settings cs
  WHERE cs.owner_id = p_clinic
    AND cs.booking_enabled = true
    -- Δ5 hardening: insane slot config (e.g. 0 → division by zero in the
    -- grid check) renders the clinic unavailable rather than erroring.
    AND cs.booking_slot_minutes BETWEEN 10 AND 240;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) realloc_patient_splits — حارسُ سطرٍ واحد (لمسٌ مالي بموافقة المالك الصريحة)
--    الجسمُ بعد الحارس حرفيٌّ كما كان (مُتحقَّقٌ بمقارنة النصّ المطبَّع قبل التطبيق)
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- M141: expired subscription (read-only) — no reallocation.
  IF public.my_access_level() <> 'full' THEN
    RAISE EXCEPTION 'subscription_read_only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND doctor_id = v_owner
  ) THEN
    RAISE EXCEPTION 'patient_not_owned' USING ERRCODE = '42501';
  END IF;

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

  SELECT r.payment_id::text INTO v_bad FROM _rps r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ledger_payments lp
    WHERE lp.id = r.payment_id AND lp.patient_id = p_patient_id AND lp.doctor_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_payment_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  SELECT r.session_id::text INTO v_bad FROM _rps r
  WHERE r.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ledger_sessions ls
    WHERE ls.id = r.session_id AND ls.patient_id = p_patient_id
      AND ls.doctor_id = v_owner AND ls.status = 'completed'
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_session_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

  SELECT r.provider_id::text INTO v_bad FROM _rps r
  WHERE r.provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinic_doctors cd
    WHERE cd.id = r.provider_id AND cd.owner_id = v_owner
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_provider_invalid: %', v_bad USING ERRCODE = '23514';
  END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) نبضة التواجد — تبقى تعمل بأي مستوى (last_seen_at وحده)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.clinic_settings SET last_seen_at = now() WHERE owner_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.touch_presence() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) إزالة حذف الطلب الذاتي (نقطة المراقبة #92)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "User can delete own trial" ON public.trial_requests;
DROP POLICY IF EXISTS "User can delete own trial by email" ON public.trial_requests;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) توكيد: كلُّ جدول RLS بـpublic إمّا محروسٌ بالكامل أو من جداول المنصة
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_exempt text[] := ARRAY['trial_requests','subscription_requests','subscription_plans',
    'subscription_events','subscription_payments','platform_settings','platform_settings_audit',
    'platform_admins','notification_templates','login_resolve_hits'];
  v_read_open text[] := ARRAY['clinic_settings','clinic_doctors','clinic_employees','doctors'];
  r record;
  v_need int;
  v_have int;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    SELECT count(*) INTO v_have FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = r.relname
      AND p.policyname LIKE 'sub_gate_%' AND p.permissive = 'RESTRICTIVE';
    IF r.relname = ANY (v_exempt) THEN
      IF v_have <> 0 THEN RAISE EXCEPTION 'M141: platform table % must not be gated', r.relname; END IF;
    ELSE
      v_need := CASE WHEN r.relname = ANY (v_read_open) THEN 3 ELSE 4 END;
      IF v_have <> v_need THEN
        RAISE EXCEPTION 'M141: table % has % sub_gate policies (need %)', r.relname, v_have, v_need;
      END IF;
    END IF;
  END LOOP;
END $$;
