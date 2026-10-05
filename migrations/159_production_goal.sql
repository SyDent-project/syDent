-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 159 — هدفُ الإنتاج الشهري لكل عملة (28 أيلول 2026 — جولة مقارنة اللوحة، البند 3)
-- ---------------------------------------------------------------------------
-- (Dentrix Daily Huddle «scheduled production vs monthly goal» · Open Dental «Production Goal»)
-- هدفٌ شهري واحد للعيادة بكل عملة (لا ساعي لكل طبيب كما في Open Dental — العيادةُ السورية غالباً
-- طبيبٌ واحد). اليوميّ يُشتقّ باللوحة = الشهري ÷ عددِ أيام العمل بالشهر (booking_work_days).
-- كيسٌ لكل عملة (#481): لا جمعَ عابر — عمودان مستقلان بالاسم الصريح للعملة. NULL = لا هدف.
-- قراءةٌ وعرضٌ بحت: لا يمسّ أيَّ معادلةٍ مالية. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS production_goal_syp numeric;
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS production_goal_usd numeric;
ALTER TABLE public.clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_goal_syp_nonneg;
ALTER TABLE public.clinic_settings ADD CONSTRAINT clinic_settings_goal_syp_nonneg CHECK (production_goal_syp IS NULL OR production_goal_syp >= 0);
ALTER TABLE public.clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_goal_usd_nonneg;
ALTER TABLE public.clinic_settings ADD CONSTRAINT clinic_settings_goal_usd_nonneg CHECK (production_goal_usd IS NULL OR production_goal_usd >= 0);
COMMENT ON COLUMN public.clinic_settings.production_goal_syp IS 'M159: هدف الإنتاج الشهري بالليرة (NULL = لا هدف) — اللوحة تشتق اليومي من أيام العمل.';
COMMENT ON COLUMN public.clinic_settings.production_goal_usd IS 'M159: هدف الإنتاج الشهري بالدولار (NULL = لا هدف).';
