-- 172 — Storage rebuild (buckets + storage.objects policies)
--
-- db/schema.sql only snapshots the public schema, so the storage layer was
-- never captured in the repo (P9 was applied DB-only). This file rebuilds it
-- for a fresh Supabase project, consolidating the final state of:
--   P9   patient-files bucket + 4 owner-folder policies (pf_*_own)
--   141  restrictive subscription gate on patient-files (sub_gate_pf_*)
--   142  wipe-window exception on the select/delete gates
--   167  payment-receipts bucket + tenant/admin policies
-- Idempotent: safe to re-run.
-- Requires: public.my_access_level(), public.my_wipe_open(),
--           public.is_platform_admin() (all in db/schema.sql).

-- 1) Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-files', 'patient-files', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) patient-files: tenant isolation by first folder = owner id (P9)
DROP POLICY IF EXISTS pf_select_own ON storage.objects;
CREATE POLICY pf_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS pf_insert_own ON storage.objects;
CREATE POLICY pf_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS pf_update_own ON storage.objects;
CREATE POLICY pf_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS pf_delete_own ON storage.objects;
CREATE POLICY pf_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- 3) patient-files: restrictive subscription gate (141 + 142 wipe window)
DROP POLICY IF EXISTS sub_gate_pf_select ON storage.objects;
CREATE POLICY sub_gate_pf_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'patient-files'
         OR (SELECT public.my_access_level()) <> 'none'
         OR (SELECT public.my_wipe_open()));
DROP POLICY IF EXISTS sub_gate_pf_insert ON storage.objects;
CREATE POLICY sub_gate_pf_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full');
DROP POLICY IF EXISTS sub_gate_pf_update ON storage.objects;
CREATE POLICY sub_gate_pf_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full')
  WITH CHECK (bucket_id <> 'patient-files' OR (SELECT public.my_access_level()) = 'full');
DROP POLICY IF EXISTS sub_gate_pf_delete ON storage.objects;
CREATE POLICY sub_gate_pf_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'patient-files'
         OR (SELECT public.my_access_level()) <> 'none'
         OR (SELECT public.my_wipe_open()));

-- 4) payment-receipts (167)
DROP POLICY IF EXISTS p_receipts_tenant_insert ON storage.objects;
CREATE POLICY p_receipts_tenant_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS p_receipts_tenant_select ON storage.objects;
CREATE POLICY p_receipts_tenant_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS p_receipts_tenant_delete ON storage.objects;
CREATE POLICY p_receipts_tenant_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS p_receipts_admin_select ON storage.objects;
CREATE POLICY p_receipts_admin_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND (SELECT public.is_platform_admin()));
