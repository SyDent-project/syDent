-- ════════════════════════════════════════════════════════════════════
-- Migration 186 — التحديثُ اللحظي لباقي الصفحات: الأطباء · الموظفون · المستحقّات · سجلّ النشاط (SyLive · v626)
-- Date: 13 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, competitor-gap round ①): the four owner pages still needed a manual refresh — their tables
-- were outside the realtime publication (provider_payouts and ledger_sessions were already added by M185).
-- Isolation: all three tables carry owner_id with an owner-only RLS policy (+ the subscription gate);
-- Realtime authorises each subscriber against that RLS and SyLive filters INSERT/UPDATE by owner_id.
-- clinic_employees.pin_hash is already readable by that same owner session — no new exposure.
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE public.clinic_doctors, public.clinic_employees, public.audit_log;
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinic_doctors','clinic_employees','audit_log']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
