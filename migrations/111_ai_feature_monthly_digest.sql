-- ============================================================================
-- Migration 111 — ميزة AI جديدة: الملخّص الذكي للوحة المحاسبة (monthly_digest)
-- ============================================================================
-- باكلوغ الـAI بند #8. توسيع قيد ai_usage_log.feature فقط — صفر بنية جديدة.
-- نمط M100/M101/M102 حرفياً (drop + re-add مع حفظ كل القيم السابقة).
--
-- 🔒 قراءة فقط: الميزة لا تكتب في أيّ جدول مالي إطلاقاً — تقرأ الأرقام
--    المحسوبة deterministic بالصفحة وتُخرج نصّاً للعرض. العزل المالي مصون.
-- 🔒 صفر PII: الحمولة أرقام مجمّعة وأسماء علاجات من الكتالوج — بلا اسم مريض
--    أو طبيب أو أي معرّف.
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
    'monthly_digest'  -- ⭐ Migration 111 (جديد)
  ));

-- ============================================================================
-- تحقّق (يُتوقَّع: t)
--   SELECT pg_get_constraintdef(oid) LIKE '%monthly_digest%'
--     FROM pg_constraint
--    WHERE conrelid='public.ai_usage_log'::regclass
--      AND conname='ai_usage_log_feature_check';
-- ============================================================================
