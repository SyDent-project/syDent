-- ============================================================================
-- Migration 119 — ميزات AI الموجة الثانية: توسيع قيد ai_usage_log.feature
-- ----------------------------------------------------------------------------
-- باكلوغ الموجة 2 (v1). توسيع القيد فقط — صفر بنية جديدة، نمط M111 حرفياً
-- (drop + re-add مع حفظ كل القيم السابقة). يغطي البنود 1–10 دفعة واحدة
-- كي لا تتكرر حادثة M100 (ميزة خارج القيد = تسجيل يفشل بصمت).
-- 🔒 قراءة فقط · صفر مساس مالي · صفر PII بكل الحمولات.
-- ✅ طُبّقت حياً 2 آب 2026 (عبر MCP) وتحقّقت: has_referral=t · has_nl=t ·
--    kept_old=t. هذا الملف توثيق الريبو كمصدر حقيقة.
-- ============================================================================

ALTER TABLE public.ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;

ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_feature_check CHECK (feature IN (
    'session_note',
    'patient_summary',
    'booking_chat',
    'treatment_plan_explanation',
    'followup_message',
    'whatsapp_draft',
    'postop_instructions',
    'monthly_digest',
    -- ⭐ Migration 119 — الموجة الثانية (البنود 1–10)
    'referral_report',
    'review_reply',
    'daily_digest',
    'preop_instructions',
    'patient_reply_draft',
    'lab_order_draft',
    'treatment_sequencing',
    'health_content',
    'tenant_health_narrative',
    'nl_analytics'
  ));

-- ============================================================================
-- تحقّق (يُتوقَّع: t)
--   SELECT pg_get_constraintdef(oid) LIKE '%referral_report%'
--     FROM pg_constraint
--    WHERE conrelid='public.ai_usage_log'::regclass
--      AND conname='ai_usage_log_feature_check';
-- ============================================================================
