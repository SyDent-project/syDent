-- Migration 126 — سعر صرف التقارير للعيادة (دولار → ليرة) — عرض/جرد فقط
-- ═══════════════════════════════════════════════════════════════════
-- الهدف: يضبط الطبيبُ سعراً يدوياً يُستخدم حصراً بصفحة المحاسبة لعرض
-- «توحيد بالليرة» أسفل طبقتَي العملة عند نشاطهما معاً — نمطُ الأدمن نفسه
-- (platform_settings.usd_report_rate · Migration 105) منقولاً لطبقة المستأجر.
--
-- ما لا تفعله هذه الهجرة:
--   · لا تمسّ أي جدول مالي (payments/expenses/splits/…) ولا أي سعر مخزَّن.
--   · لا تحويل بيانات — القيمة عرضٌ بحت، والأرقام الأصلية تبقى بعملتها.
--   · لا تغيير RLS: المالك يكتب صفَّه في clinic_settings منذ Migration 62،
--     والقراءة عبر السياسات القائمة نفسها.
--
-- idempotent: قابلة للتشغيل أكثر من مرة.
-- طُبّقت على الإنتاج: 9 آب 2026 (متحقَّق: العمود numeric nullable + قيد CHECK).

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS usd_report_rate numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_settings_usd_report_rate_chk'
      AND conrelid = 'public.clinic_settings'::regclass
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_usd_report_rate_chk
      CHECK (usd_report_rate IS NULL OR usd_report_rate > 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.clinic_settings.usd_report_rate IS
  'سعر صرف التقارير (1$ = كم ل.س) — يُستخدم حصراً لعرض التوحيد بالليرة بصفحة المحاسبة عند نشاط العملتين. عرض فقط: لا يمسّ أي مبلغ مخزَّن. NULL = غير مضبوط.';

-- ── تحقّق ─────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='usd_report_rate';
