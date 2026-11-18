-- ============================================================================
-- Migration 214 — حذفُ «الزيارة التالية» لا يُخرج العلاج من «قيد الإنجاز» (مراجعة ج2-ب)
-- ----------------------------------------------------------------------------
-- منذ M210: حذفُ آخر متابعة يعيد الأساسية جلسةً عادية (followup_state = NULL). كان صحيحاً حين كانت «قيد الإنجاز»
--   لا تقوم إلا بمتابعة. بعد M211 («يحتاج جلسات متابعة» بلا متابعات) وM213 (الزيارة التالية المخطّطة) صار الحذفُ الأشيع
--   إلغاءَ زيارةٍ مخطّطة — والعلاجُ ما زال قيد الإنجاز. فحذفُها وهي آخرُ متابعة كان يمحو الحالة بصمت.
-- الآن: آخرُ متابعةٍ **مخطّطة** حُذفت والعلاجُ «قيد الإنجاز» ⇒ يبقى «قيد الإنجاز» (open بلا متابعات مسموحةٌ منذ M211،
--   ويُلغيها الطبيب من الشارة «لا يحتاج متابعة»). كلُّ ما عداها كما في M210 حرفياً (آخرُ متابعةٍ منجزة · حالةٌ «اكتمل»).
-- صفر لمسٍ مالي ولا تغييرَ بالجداول. نفسُ التوقيع ⇒ CREATE OR REPLACE والمشغّلُ كما هو. idempotent.
-- الرجوع: إعادةُ تنفيذ تعريف الدالة من 210_followup_sessions.sql ([4]).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ledger_sessions_followup_after_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.parent_id IS NOT NULL THEN
    UPDATE public.ledger_sessions b SET followup_state = NULL
     WHERE b.id = OLD.parent_id AND b.followup_state IS NOT NULL
       AND NOT (COALESCE(OLD.status, 'completed') = 'planned' AND b.followup_state = 'open')
       AND NOT EXISTS (SELECT 1 FROM public.ledger_sessions c WHERE c.parent_id = OLD.parent_id);
  END IF;
  RETURN NULL;
END $$;

COMMIT;
