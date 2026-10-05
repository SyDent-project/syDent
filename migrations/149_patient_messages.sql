-- ============================================================
-- Migration 149 — patient_messages (سجلّ المراسلات الموحّد للمريض)
-- ------------------------------------------------------------
-- الهدف: خيطٌ واحد بتاريخه لكل ما أُرسل للمريض من النظام (روشتة · تعليمات · خطة ·
--        رسالة حرة · استدعاء · تقييم · قسط …). التذكيرات تبقى بـreminder_logs
--        (appointment_id NOT NULL هناك) ويجمعهما تبويب «المراسلات» عرضاً — لا ترحيل
--        بيانات ولا تسجيل مزدوج.
-- النمط: Curve Hero «Correspondence» · Open Dental «Commlog».
-- الصدق: الإرسال click-to-chat (wa.me) — السجلّ يوثّق «فُتح واتساب بهذا النص» لا «سُلِّم».
-- الأثر: جدول جديد · RLS مالك (نمط post_op_notes) + بوابة الاشتراك (_sub_guard_table — M141)
--        · حذف المريض/الحساب يُسقط صفوفه (CASCADE) · صفر أثر مالي · idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id)  ON DELETE CASCADE,
  kind            text NOT NULL,
  channel         text NOT NULL DEFAULT 'whatsapp_link',
  body            text NOT NULL,
  recipient_phone text,
  sent_by         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_messages_kind_check CHECK (kind = ANY (ARRAY[
    'prescription','instructions','plan','installment','recall','birthday','review','referral','free','other'])),
  CONSTRAINT patient_messages_channel_check CHECK (channel = ANY (ARRAY['whatsapp_link','copy','print'])),
  CONSTRAINT patient_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 6000),
  CONSTRAINT patient_messages_sent_by_len CHECK (sent_by IS NULL OR char_length(sent_by) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_patient_messages_patient
  ON public.patient_messages USING btree (owner_id, patient_id, created_at DESC);

ALTER TABLE public.patient_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_messages_owner_all ON public.patient_messages;
CREATE POLICY patient_messages_owner_all ON public.patient_messages
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- بوابة الاشتراك (M141): قراءة لغير «none» · كتابة لـ«full» فقط.
SELECT public._sub_guard_table('public.patient_messages');

COMMENT ON TABLE public.patient_messages IS
  'سجلّ مراسلات المريض (غير التذكيرات): ما فُتح به واتساب/نُسخ/طُبع من النظام. توثيقي بحت — لا يدخل أي حساب.';

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_messages') AS tbl,            -- 1
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.patient_messages'::regclass)                             AS rls_on,         -- true
  (SELECT count(*) FROM pg_policies WHERE tablename='patient_messages')                                          AS policies,       -- 5
  (SELECT count(*) FROM pg_policies WHERE tablename='patient_messages' AND permissive='RESTRICTIVE')             AS gate_policies;  -- 4
