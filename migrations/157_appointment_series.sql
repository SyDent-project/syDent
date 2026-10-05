-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 157 — المواعيدُ المتكرّرة (سلسلة) — 27 أيلول 2026، جولة مقارنة المواعيد البند 6
-- ---------------------------------------------------------------------------
-- Curve/Dentrix Ascend: التكرارُ يُنشئ مواعيدَ فعليةً منفصلة (كلُّ موعدٍ صفٌّ يُعدَّل ويُنقل
-- ويُلغى وحدَه) تجمعها series_id. لا جدولَ للقاعدة (rule) — القاعدةُ تُطبَّق مرةً عند الإنشاء
-- (أسبوعي · كل أسبوعين · شهري بقصّ نهاية الشهر) والصفوفُ هي الحقيقة. series_index/total
-- للشارة «🔁 3/12» ولإلغاء بقية السلسلة من الواجهة. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS series_id    uuid;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS series_index smallint;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS series_total smallint;
CREATE INDEX IF NOT EXISTS idx_appointments_series ON public.appointments (doctor_id, series_id) WHERE series_id IS NOT NULL;
COMMENT ON COLUMN public.appointments.series_id IS 'M157: معرّفُ سلسلة التكرار (المواعيدُ الأخوة تتشاركه)';

-- تحقّق (#238)
SELECT count(*) = 3 AS series_cols FROM information_schema.columns
 WHERE table_schema='public' AND table_name='appointments' AND column_name IN ('series_id','series_index','series_total');
