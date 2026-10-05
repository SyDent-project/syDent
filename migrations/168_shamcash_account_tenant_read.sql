-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 168 — مراجعةُ Deep Code (2 تشرين الأول 2026): رقمُ حساب شام كاش مقروءٌ للعيادة
-- ---------------------------------------------------------------------------
-- M167 أضافت المفتاح platform_settings.shamcash_account لكن سياسةَ قراءة المستأجر كانت تحصر المفاتيحَ المقروءة
-- بثلاثة (support_phone · support_email · payment_instructions_ar) — فكانت نافذةُ الاشتراك لن تعرض رقمَ الحساب أبداً.
-- السياسةُ نفسُها + المفتاحُ الرابع. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS p_platform_settings_tenant_read ON public.platform_settings;
CREATE POLICY p_platform_settings_tenant_read ON public.platform_settings FOR SELECT TO authenticated
  USING (key = ANY (ARRAY['support_phone'::text, 'support_email'::text, 'payment_instructions_ar'::text, 'shamcash_account'::text]));
