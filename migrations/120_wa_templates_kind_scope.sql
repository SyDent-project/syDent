-- ============================================================================
-- Migration 120 — نطاق للقوالب: عمود kind على wa_message_templates
-- ----------------------------------------------------------------------------
-- الموجة 2 بند #1 (تحسين): قوالب سبب كتاب الإحالة تشارك جدول قوالب الرسائل
-- الحرة (M109) بعمود نطاق بدل جدول جديد. الافتراضي 'wa_free' = كل الصفوف
-- القائمة تُصنَّف تلقائياً كما كانت ⇒ صفر انحدار. RLS القائمة (per owner)
-- تغطي النطاقين بلا تعديل. idempotent · صفر مساس مالي.
-- ✅ طُبّقت حياً 2 آب 2026 (عبر MCP) وتحقّقت: صفّان قائمان كلاهما wa_free.
-- ============================================================================

ALTER TABLE public.wa_message_templates
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'wa_free';

ALTER TABLE public.wa_message_templates
  DROP CONSTRAINT IF EXISTS wa_message_templates_kind_check;

ALTER TABLE public.wa_message_templates
  ADD CONSTRAINT wa_message_templates_kind_check CHECK (kind IN ('wa_free','referral'));
