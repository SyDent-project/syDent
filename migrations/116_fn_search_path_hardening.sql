-- Migration 116 — تحصين search_path لدوال الـ triggers والمساعدة
-- يغلق تحذيرات Supabase Advisor: function_search_path_mutable (9 دوال)
-- idempotent: ALTER FUNCTION ... SET آمن للتكرار

ALTER FUNCTION public.set_notification_templates_updated_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_clinic_settings_timestamp()       SET search_path = public, pg_temp;
ALTER FUNCTION public.set_clinic_employees_updated_at()        SET search_path = public, pg_temp;
ALTER FUNCTION public.set_operatories_updated_at()             SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()               SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_clinical_provider_type()         SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_subscription_plans_updated_at()    SET search_path = public, pg_temp;
ALTER FUNCTION public.set_platform_settings_updated_at()       SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_phone(p text)                  SET search_path = public, pg_temp;

-- تحقّق: يجب أن يرجع 9 صفوف وكلها proconfig يحتوي search_path
SELECT p.proname,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_notification_templates_updated_at','update_clinic_settings_timestamp',
    'set_clinic_employees_updated_at','set_operatories_updated_at',
    'update_updated_at_column','enforce_clinical_provider_type',
    'touch_subscription_plans_updated_at','set_platform_settings_updated_at',
    'normalize_phone')
ORDER BY p.proname;
