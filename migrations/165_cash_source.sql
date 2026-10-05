-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 165 — مصدرُ النقد للمدفوعات الخارجة (30 أيلول 2026 — طلب المالك من صور الإقفال)
-- ---------------------------------------------------------------------------
-- المشكلة: راتبٌ دُفع نقداً من جيب الطبيب/الخزنة (لا من درج اليوم) كان يُخصم من «صافي الدرج
-- نقداً» فيطلع المتوقَّعُ بالسالب ويُسجَّل الإقفالُ «زيادةً» وهمية. «نقداً» يصف **شكل** المال،
-- لا **الحساب** الذي خرج منه (QuickBooks «Payment account» · Odoo cash journal · Square «Paid out»).
--
-- الحل: cash_source على الخارج الثلاثة (المصروفات · الرواتب ودفعات الأطباء · دفعات المخابر):
--   'drawer'  = من درج العيادة (يُخصم من إقفال الصندوق)
--   'outside' = من خارج الدرج — خزنة · جيب الطبيب (مصروفٌ بالحسابات، لا يمسّ الدرج)
--   NULL      = الصفوفُ القائمة ⇒ تُقرأ «من الدرج» حرفياً كما كانت (صفرُ تغيّرٍ بأي رقمٍ قائم).
-- الصافي والربح والذمم لا تتغيّر أبداً: العمودُ لا يدخل أيَّ معادلةٍ إلا «صافي الدرج نقداً».
-- ثابتٌ بالقاعدة (#693): المصدرُ لا يُحمل إلا على دفعةٍ نقدية (payment_method = 'cash')؛
-- دفعاتُ المخابر بلا طريقة (تُحتسب نقداً صراحةً) فتقبله دائماً.
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.expenses         ADD COLUMN IF NOT EXISTS cash_source text;
ALTER TABLE public.provider_payouts ADD COLUMN IF NOT EXISTS cash_source text;
ALTER TABLE public.lab_payments     ADD COLUMN IF NOT EXISTS cash_source text;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_cash_source_valid;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_cash_source_valid
  CHECK (cash_source IS NULL OR (cash_source IN ('drawer','outside') AND payment_method = 'cash'));

ALTER TABLE public.provider_payouts DROP CONSTRAINT IF EXISTS provider_payouts_cash_source_valid;
ALTER TABLE public.provider_payouts ADD CONSTRAINT provider_payouts_cash_source_valid
  CHECK (cash_source IS NULL OR (cash_source IN ('drawer','outside') AND payment_method = 'cash'));

ALTER TABLE public.lab_payments DROP CONSTRAINT IF EXISTS lab_payments_cash_source_valid;
ALTER TABLE public.lab_payments ADD CONSTRAINT lab_payments_cash_source_valid
  CHECK (cash_source IS NULL OR cash_source IN ('drawer','outside'));

COMMENT ON COLUMN public.expenses.cash_source         IS 'M165: مصدرُ النقد — drawer (درج العيادة) | outside (خزنة/جيب الطبيب) | NULL = drawer. نقداً فقط.';
COMMENT ON COLUMN public.provider_payouts.cash_source IS 'M165: مصدرُ النقد — drawer | outside | NULL = drawer. نقداً فقط.';
COMMENT ON COLUMN public.lab_payments.cash_source     IS 'M165: مصدرُ النقد — drawer | outside | NULL = drawer.';
