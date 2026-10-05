-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 143 — نوعُ حدثٍ مستقل لـ«إعادة التجربة»
-- ═══════════════════════════════════════════════════════════════════════════
-- v357 فصل «إعادة التجربة» (تجربةٌ منتهية ⇒ فترةُ تجربةٍ جديدة) عن «إعادة التفعيل»
-- (استئنافُ الموقوف كما كان)، لكنّ قيدَ event_type لم يعرف نوعاً جديداً فسُجّلت
-- الأولى 'reactivate' + ملاحظة (نقطة المراقبة #133). يُضاف هنا 'restart_trial'
-- فيُفرَّق بينهما بالنوع لا بالنص. الصفوفُ التاريخية بهذا الشكل: صفر (مقيس قبل
-- الهجرة) — فلا ترحيل.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.subscription_events DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;
ALTER TABLE public.subscription_events ADD CONSTRAINT subscription_events_event_type_check CHECK (event_type = ANY (ARRAY[
  'accept', 'convert_monthly', 'convert_yearly', 'renew', 'extend', 'shorten', 'enter_grace',
  'reactivate', 'suspend', 'delete', 'activate_permanent', 'convert_permanent_yearly', 'reject',
  'promote_to_admin', 'demote_from_admin', 'plan_updated', 'template_updated', 'convert_plan',
  'plan_created', 'plan_deleted', 'ai_override_set', 'clinic_name_changed', 'owner_name_changed',
  'restart_trial'
]::text[]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_events'::regclass
      AND conname = 'subscription_events_event_type_check'
      AND pg_get_constraintdef(oid) LIKE '%restart_trial%'
      AND pg_get_constraintdef(oid) LIKE '%owner_name_changed%'
  ) THEN
    RAISE EXCEPTION 'M143: event_type check missing restart_trial or an existing type';
  END IF;
END $$;

COMMIT;
