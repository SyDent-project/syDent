-- ═══════════════════════════════════════════════════════════════════
-- Migration 82 — Presence heartbeat column (last_seen_at)
-- ═══════════════════════════════════════════════════════════════════
-- WHY
--   auth.users.last_sign_in_at only moves on a fresh password sign-in;
--   long-lived refresh-token sessions keep it frozen for weeks, and
--   audit_log only captures mutations (pure browsing leaves no trace).
--   The admin console needs a truthful "online now / last seen" signal.
--
-- WHAT
--   One nullable timestamptz on the per-tenant singleton clinic_settings.
--   Written by a throttled fire-and-forget heartbeat in supabase-init.js
--   (max once per 10 minutes per tenant, online only). Read server-side
--   by the admin-ops Edge Function (tenant_activity → lastSeenAt).
--
-- SAFETY
--   • No RLS changes: the existing owner ALL policy on clinic_settings
--     already covers this UPDATE (auth.uid() = owner_id — single-login
--     model means every staff member writes as the owner).
--   • Nullable + no default → zero impact on existing rows/inserts.
--   • No trigger on clinic_settings touches updated_at, so heartbeats
--     churn nothing else.
--   • Idempotent (IF NOT EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.clinic_settings.last_seen_at IS
  'Presence heartbeat: last time any staff member had a tenant page open (throttled ~10 min). Written by supabase-init.js; read by admin-ops Edge Function.';

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICATION (run after apply — Rule #238)
-- Expected: 1 row for the column · policy count UNCHANGED from before
--           this migration (we add none).
-- ═══════════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'clinic_settings'
   AND column_name  = 'last_seen_at';

SELECT count(*) AS clinic_settings_policy_count
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'clinic_settings';
