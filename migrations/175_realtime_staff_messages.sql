-- Migration 175 — staff_messages joins the supabase_realtime publication (5 تشرين الأول 2026).
--
-- Why: the internal staff messages widget (sidebar.js, Migration 80) only polled
-- every 30s, so a message took 0–30s to arrive (owner measured ~22s). With the
-- table published, each clinic's browser subscribes to INSERT/UPDATE events and
-- a message (and its «تم ✓») arrives in under a second; polling stays as a fallback.
--
-- Tenant isolation: Realtime postgres_changes respects RLS — a subscriber only
-- receives rows its SELECT policies allow (staff_messages_owner_all:
-- owner_id = auth.uid(), plus the shared subscription gate). The client also
-- filters owner_id=eq.<uid>. No RLS change, zero data change, zero financial surface.
-- Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
  END IF;
END $$;
