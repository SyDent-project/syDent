-- Migration 107 — عملة العيادة (تُختار مرة واحدة عند التسجيل، غير قابلة للتغيير)
-- ═══════════════════════════════════════════════════════════════════
-- الهدف: رمز العملة المعروض بطبقة العيادة (ل.س / $) — عرض فقط.
-- ما لا تفعله هذه الهجرة: لا تحويل أسعار، لا لمس أي جدول مالي،
-- لا لمس trial_requests.currency (تلك عملة الاشتراك — معنى مختلف تماماً)،
-- لا لمس handle_new_doctor() (محروسة بـcheck-catalog-parity.js).
--
-- القيمة تصل من auth.html عبر user_metadata.currency، ويبذرها المسار
-- الكسول لإنشاء صف clinic_settings في supabase-init.js. لا توجد واجهة
-- تغيير في settings.html عمداً: تبديل العملة يقلب رمز كل التاريخ المالي
-- بلا تحويل، فالخيار مقفول بعد التسجيل.
--
-- idempotent: قابلة للتشغيل أكثر من مرة.
-- طُبّقت على الإنتاج: 27 تموز 2026 (6 صفوف، كلها SYP).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SYP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_settings_currency_chk'
      AND conrelid = 'public.clinic_settings'::regclass
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_currency_chk
      CHECK (currency IN ('SYP','USD'));
  END IF;
END
$$;

-- كل العيادات القائمة تبقى ليرة (الـDEFAULT يغطّي الصفوف الموجودة تلقائياً،
-- وهذا السطر يضمنها صراحةً لو كان العمود موجوداً مسبقاً بقيم فارغة).
UPDATE public.clinic_settings SET currency = 'SYP' WHERE currency IS NULL;

COMMENT ON COLUMN public.clinic_settings.currency IS
  'عملة عرض العيادة (SYP|USD) — تُختار عند التسجيل ولا تُغيَّر. رمز فقط، بلا تحويل. ليست عملة الاشتراك (trial_requests.currency).';

-- ── تحقّق ─────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='currency';

SELECT currency, COUNT(*) FROM public.clinic_settings GROUP BY currency;
