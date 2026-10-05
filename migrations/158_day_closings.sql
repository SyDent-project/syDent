-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 158 — إقفالُ الصندوق المسجَّل + طرقُ الدفع الإلكترونية للرواتب (28 أيلول 2026 — جولة مقارنة المالية، البند 4)
-- ---------------------------------------------------------------------------
-- (١) day_closings: سجلُّ إقفال درج النقد ليومٍ وعملة (TOPS «close the day» · Dentrix «Deposit Slip»):
--     expected = صافي الدرج نقداً كما حسبه كشفُ اليوم لحظةَ الإقفال (لقطةٌ للمساءلة — الكشفُ
--     يُعاد حسابه دائماً من الدفتر، أما الإقفالُ فيحفظ ما رآه المالك وقتها)، counted = النقدُ
--     المعدود/المسلَّم فعلاً، variance = المعدود − المتوقّع (مولَّد). صفٌّ واحد لكلِّ (مالك، يوم، عملة).
--     RLS: المالك فقط + بوابة الاشتراك (_sub_guard_table — M141).
-- (٢) provider_payouts.payment_method: يقبل المحافظَ الإلكترونية والدفعَ الإلكتروني
--     (shamcash · syriatel · mtn · online) بجانب cash/bank/check/other — مفاتيحُ pay-methods.js.
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.day_closings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  currency    text NOT NULL DEFAULT 'SYP',
  expected    numeric NOT NULL,
  counted     numeric NOT NULL,
  variance    numeric GENERATED ALWAYS AS (counted - expected) STORED,
  note        text,
  closed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_closings_currency_valid CHECK (currency IN ('SYP','USD')),
  CONSTRAINT day_closings_counted_nonneg CHECK (counted >= 0),
  CONSTRAINT day_closings_note_len       CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT day_closings_one_per_day    UNIQUE (owner_id, day, currency)
);

ALTER TABLE public.day_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS day_closings_owner_all ON public.day_closings;
CREATE POLICY day_closings_owner_all ON public.day_closings
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.day_closings');

COMMENT ON TABLE public.day_closings IS 'M158: إقفال درج النقد ليوم وعملة — expected لقطة كشف اليوم لحظة الإقفال، counted المعدود، variance مولَّد.';

-- ── الرواتب: المحافظُ الإلكترونية ────────────────────────────────────────
ALTER TABLE public.provider_payouts DROP CONSTRAINT IF EXISTS payment_method_valid;
ALTER TABLE public.provider_payouts ADD CONSTRAINT payment_method_valid
  CHECK (payment_method IS NULL OR payment_method IN ('cash','bank','check','other','shamcash','syriatel','mtn','online'));
