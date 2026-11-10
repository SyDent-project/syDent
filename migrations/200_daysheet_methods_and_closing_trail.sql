-- ============================================================================
-- Migration 200 — كشف اليوم: طريقةُ الدفع لدفعات المخابر والاستردادات + أثرُ تعديل إقفال الصندوق
-- ----------------------------------------------------------------------------
-- (أ) دفعاتُ المخابر واستردادُ المريض كانت بلا طريقة دفع ⇒ كشفُ اليوم يحسبها «نقداً من الدرج» دائماً،
--     فدفعةُ مخبرٍ بتحويل/شام كاش كانت تُنقص «صافي الدرج نقداً» وتُظهر عجزاً وهمياً عند الإقفال.
--     • lab_payments.payment_method        (فارغ = الصفوف القديمة ⇒ تُقرأ نقداً كما كانت)
--     • account_adjustments.payment_method (للاسترداد فقط؛ فارغ = نقداً كما كان)
--     • cash_source بالمخابر يبقى للنقد فقط (مرآةُ قيد M165 على المصروفات والرواتب).
-- (ب) «تعديل الإقفال» كان يكتب فوق الإقفال الأول بلا أثر (وقتُ الإقفال والمعدودُ يتبدّلان).
--     • closed_at = وقتُ الإقفال الأول، لا يتحرّك بعد اليوم.
--     • edited_at / edit_count / first_counted / first_expected تُملأ من القاعدة (تريغر) لا من العميل.
-- لا تغيير على أيِّ رقمٍ محاسبي: الأعمدةُ يقرؤها كشفُ اليوم وحده.
-- ============================================================================

-- (أ) طريقةُ الدفع -----------------------------------------------------------
ALTER TABLE public.lab_payments ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.lab_payments DROP CONSTRAINT IF EXISTS lab_payments_payment_method_valid;
ALTER TABLE public.lab_payments ADD CONSTRAINT lab_payments_payment_method_valid
  CHECK (payment_method IS NULL OR payment_method IN ('cash','bank','check','other','shamcash','syriatel','mtn','online'));
ALTER TABLE public.lab_payments DROP CONSTRAINT IF EXISTS lab_payments_cash_source_valid;
ALTER TABLE public.lab_payments ADD CONSTRAINT lab_payments_cash_source_valid
  CHECK (cash_source IS NULL OR (cash_source IN ('drawer','outside') AND (payment_method IS NULL OR payment_method = 'cash')));

ALTER TABLE public.account_adjustments ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.account_adjustments DROP CONSTRAINT IF EXISTS account_adjustments_payment_method_valid;
ALTER TABLE public.account_adjustments ADD CONSTRAINT account_adjustments_payment_method_valid
  CHECK (payment_method IS NULL OR (kind = 'refund' AND payment_method IN ('cash','bank','check','other','shamcash','syriatel','mtn','online')));

COMMENT ON COLUMN public.lab_payments.payment_method IS 'M200: طريقة دفع دفعة المخبر (مفاتيح pay-methods.js). NULL = صف قديم ⇒ يُقرأ نقداً.';
COMMENT ON COLUMN public.account_adjustments.payment_method IS 'M200: طريقة إعادة المبلغ للمريض (للاسترداد فقط). NULL = صف قديم ⇒ يُقرأ نقداً.';

-- (ب) أثرُ تعديل الإقفال -----------------------------------------------------
ALTER TABLE public.day_closings
  ADD COLUMN IF NOT EXISTS edited_at      timestamptz,
  ADD COLUMN IF NOT EXISTS edit_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_counted  numeric,
  ADD COLUMN IF NOT EXISTS first_expected numeric;

CREATE OR REPLACE FUNCTION public.day_closings_keep_trail()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.edited_at := NULL; NEW.edit_count := 0; NEW.first_counted := NULL; NEW.first_expected := NULL;
    RETURN NEW;
  END IF;
  NEW.closed_at := OLD.closed_at;                                   -- وقتُ الإقفال الأول ثابت
  IF NEW.counted IS DISTINCT FROM OLD.counted
     OR NEW.expected IS DISTINCT FROM OLD.expected
     OR NEW.note IS DISTINCT FROM OLD.note THEN
    NEW.edited_at      := now();
    NEW.edit_count     := OLD.edit_count + 1;
    NEW.first_counted  := COALESCE(OLD.first_counted, OLD.counted);
    NEW.first_expected := COALESCE(OLD.first_expected, OLD.expected);
  ELSE
    NEW.edited_at := OLD.edited_at; NEW.edit_count := OLD.edit_count;
    NEW.first_counted := OLD.first_counted; NEW.first_expected := OLD.first_expected;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.day_closings_keep_trail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_day_closings_trail ON public.day_closings;
CREATE TRIGGER trg_day_closings_trail
  BEFORE INSERT OR UPDATE ON public.day_closings
  FOR EACH ROW EXECUTE FUNCTION public.day_closings_keep_trail();

COMMENT ON COLUMN public.day_closings.closed_at IS 'وقتُ الإقفال الأول — لا يتغيّر بالتعديل (M200).';
COMMENT ON COLUMN public.day_closings.edited_at IS 'M200: آخرُ تعديلٍ على الإقفال (NULL = لم يُعدَّل).';
