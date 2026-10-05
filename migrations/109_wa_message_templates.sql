-- Migration 109: WhatsApp free-message templates
-- مكتبة قوالب قابلة لإعادة الاستخدام للرسائل الحرة بمركز الواتساب —
-- استنساخ حرفي لنمط clinical_note_templates (M95) / post_op_templates (M56).
-- القوالب تُخزَّن بنصّها الخام (بما فيه العناصر النائبة) وتُحلّ عند التطبيق
-- بطبقة العرض عبر ppApplyPlaceholders. ADDITIVE + idempotent. 🔒 معزول عن المالية.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_message_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_message_templates_owner_all" ON public.wa_message_templates;
CREATE POLICY "wa_message_templates_owner_all" ON public.wa_message_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wa_msg_templates_owner
  ON public.wa_message_templates(owner_id, created_at DESC);

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT to_regclass('public.wa_message_templates') IS NOT NULL)::int
    AS table_ok,                                          -- expected: 1
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'wa_message_templates')
    AS tpl_policies,                                      -- expected: 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'wa_message_templates'
       AND indexname = 'idx_wa_msg_templates_owner')
    AS tpl_idx;                                           -- expected: 1
