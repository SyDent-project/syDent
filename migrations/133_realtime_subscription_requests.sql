-- Migration 133 — subscription_requests joins the supabase_realtime publication.
--
-- Why: the admin panel subscribes to INSERT events on trial_requests (Migration 69)
-- so a fresh self-signup surfaces without a manual refresh. Tenant upgrade/renew
-- requests (subscription_requests, Migration 42) had NO realtime path at all —
-- the queue was loaded once at page open and never again unless the admin
-- refreshed by hand (owner report, 31 Aug 2026).
--
-- Idempotent: adds the table only if it is not already published. Realtime
-- respects RLS — only the platform admin's SELECT policy receives the rows.
-- Zero data change, zero RLS change, zero financial surface.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscription_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_requests;
  END IF;
END $$;
