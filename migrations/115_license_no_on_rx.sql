-- ============================================================================
-- Migration 115 — إظهار رقم النقابة على المطبوعات: قرار الطبيب
-- ----------------------------------------------------------------------------
-- رقم النقابة (license_no، M51) كان يُطبع دائماً متى وُجد، بلا خيار. بعض
-- الأطباء لا يريدونه على المطبوعات مع رغبتهم بحفظه بالنظام.
--
-- الافتراضي true = السلوك الحالي حرفياً ⇒ صفر انحدار على أي حساب قائم
-- (7 صفوف كلها true عند التطبيق). الطبيب وحده يُطفئه من إعداداته.
--
-- الإطفاء إخفاءُ عرضٍ لا حذف: القيمة تبقى محفوظة بـ license_no، فإعادة
-- التفعيل لا تتطلب إعادة الكتابة.
--
-- idempotent · صفر لمس RLS · صفر لمس مالي · صفر تعديل بيانات.
-- ============================================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS license_no_on_rx BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clinic_settings.license_no_on_rx IS
  'هل يظهر رقم النقابة على رأس الروشتة المطبوعة؟ الافتراضي true = سلوك ما قبل M115. الرقم يبقى محفوظاً عند الإطفاء — الإخفاء عرضٌ لا حذف.';

-- ── تحقّق (طُبّق على الإنتاج: t · NO · true · 7 · 0) ───────────────────────
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns
--           WHERE table_schema='public' AND table_name='clinic_settings'
--             AND column_name='license_no_on_rx')                     AS col_ok,
--   (SELECT count(*) FROM public.clinic_settings WHERE license_no_on_rx IS TRUE)  AS rows_on,
--   (SELECT count(*) FROM public.clinic_settings WHERE license_no_on_rx IS FALSE) AS rows_off;
-- ============================================================================
