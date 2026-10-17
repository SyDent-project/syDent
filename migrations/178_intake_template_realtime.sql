-- ════════════════════════════════════════════════════════════════════
-- Migration 178 — قالبُ رسالة الاستمارة + بثُّ وصولها لحظياً (11 تشرين الأول 2026)
-- Idempotent: yes | Applied via Supabase MCP
--
-- (1) clinic_settings.whatsapp_intake_template — owner rule (10 Oct 2026): every
--     patient-facing message text lives in Settings as an editable template
--     (like reminder/recall/birthday), never fixed in code. NULL = default
--     (mirrored byte-for-byte: settings · pp-intake.js · appt-booking.js).
-- (2) patient_intakes joins the supabase_realtime publication — the owner asked
--     that a submitted form appears to the clinic at once, without a refresh.
--     Realtime postgres_changes respects RLS (patient_intakes_owner_all +
--     subscription gate), and the client filters owner_id=eq.<uid>. The UPDATE
--     from intake_submit (status pending → submitted) is the event the sidebar
--     subscribes to on every page (badge + toast + page hook). Zero data change.
-- ROLLBACK: ALTER TABLE public.clinic_settings DROP COLUMN IF EXISTS whatsapp_intake_template;
--           ALTER PUBLICATION supabase_realtime DROP TABLE public.patient_intakes;
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS whatsapp_intake_template TEXT;
COMMENT ON COLUMN public.clinic_settings.whatsapp_intake_template IS 'قالبُ رسالة استمارة المريض ({patient_first_name} {patient_name} {clinic_name} {clinic_phone} {intake_link}). NULL = الافتراضي. M178.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'patient_intakes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_intakes;
  END IF;
END $$;

-- Verification:
-- SELECT (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='patient_intakes') pub,   -- 1
--        (SELECT count(*) FROM information_schema.columns WHERE table_name='clinic_settings' AND column_name='whatsapp_intake_template') col;  -- 1
