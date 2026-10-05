-- Migration 122: توسيع نطاق قوالب wa_message_templates ليشمل المنشور التوعوي
-- (الموجة 2 بند #8 — مولّد المحتوى التوعوي). القالب يحفظ الموضوع والمنصة
-- والنبرة والنص المولَّد بحمولة JSON مُصنَّفة v:2 بعمود body القائم، فتوليدُ
-- منشورٍ ثانٍ من القالب لا يكلّف نداء AI (نفس فلسفة قوالب الإحالة).
-- التوسيع لا يكسر شيئاً: القيمتان القائمتان تبقيان صالحتين والافتراضي
-- 'wa_free' كما هو. مفتاح ai_usage_log.feature = 'health_content' مغطّى
-- بـMigration 119 سلفاً ⇒ لا حاجة لأي تعديل هناك.
-- مطبَّقة حيّاً عبر MCP ومؤكَّدة بالاستعلام في 3 آب 2026.

ALTER TABLE public.wa_message_templates
  DROP CONSTRAINT IF EXISTS wa_message_templates_kind_check;

ALTER TABLE public.wa_message_templates
  ADD CONSTRAINT wa_message_templates_kind_check
  CHECK (kind IN ('wa_free','referral','health_post'));

-- تحقق (يُتوقَّع: t)
SELECT pg_get_constraintdef(oid) LIKE '%health_post%' AS ok
FROM pg_constraint WHERE conname = 'wa_message_templates_kind_check';
