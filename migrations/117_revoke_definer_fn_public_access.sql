-- Migration 117 — سحب صلاحيات EXECUTE غير الضرورية عن دوال SECURITY DEFINER
-- ملاحظات التصميم:
--   * authenticated + service_role يحتفظان بمنحهما الصريح (proacl) — لا تغيير بالسلوك
--   * is_platform_admin غير مشمولة عمداً: مستعملة بـ14 سياسة RLS منها 3 على {public}
--   * booking_busy_slots / booking_clinic_info / booking_create_request / resolve_login_email
--     تبقى مفتوحة لـ anon عمداً (بوابة الحجز العامة + صفحة الدخول) — by design
-- idempotent: REVOKE آمن للتكرار

-- (أ) دوال RPC لا يحتاجها الزائر المجهول
REVOKE EXECUTE ON FUNCTION public.realloc_patient_splits(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_account()                 FROM PUBLIC, anon;

-- (ب) دوال trigger — لا تُستدعى عبر REST أصلاً؛ صلاحية التنفيذ تُفحص وقت إنشاء الـtrigger لا وقت إطلاقه
REVOKE EXECUTE ON FUNCTION public.detect_audit_alerts()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_employee_limit()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_patient_limit()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_teeth_status_history()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_doctor()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_owner_doctor()  FROM PUBLIC, anon, authenticated;

-- تحقّق: يجب ألا يظهر anon ولا =X (PUBLIC) في أي proacl من الثمانية
SELECT p.proname, p.proacl::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'realloc_patient_splits','delete_my_account','detect_audit_alerts',
 'enforce_employee_limit','enforce_patient_limit','fn_teeth_status_history',
 'handle_new_doctor','handle_new_owner_doctor')
ORDER BY p.proname;
