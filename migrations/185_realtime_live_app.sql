-- ════════════════════════════════════════════════════════════════════
-- Migration 185 — التطبيقُ لحظيٌّ بلا تحديث (SyLive · v623)
-- Date: 12 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner): «أي شي بدو تحديث صلحه وخليه لحظي» — after a patient confirmed from the portal the open
-- calendar stayed stale. Only patient_intakes (M178) and staff_messages (M175) were in the realtime
-- publication. This adds every operational table a page watches through SyLive (supabase-init.js).
-- Isolation: Realtime authorises each subscriber against the table's RLS (all of these have it), and
-- SyLive filters INSERT/UPDATE by the tenant column. DELETE events carry only the primary key and are
-- acted on only when that id is on the subscriber's screen.
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE <each table below>;
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','patients','booking_requests','ledger_sessions','ledger_payments','payment_splits',
                           'account_adjustments','payment_plans','teeth_status','lab_orders','lab_payments','labs',
                           'patient_portals','inventory_items','inventory_movements','expenses','provider_payouts']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
