-- ════════════════════════════════════════════════════════════════════
-- Migration 192 — الأشعة داخل المنصة (ج1): وسمُ الصور · حصّةُ التخزين لكل خطة · Realtime (v635)
-- Date: 14 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, X-ray tier 1 «ابدا»): radiographs live in the existing files tab (bucket patient-files ·
-- path {owner_id}/{patient_id}/… · RLS by the first folder) — no new bucket, no new isolation path. A radiograph
-- needs: its type, the teeth it shows (several — a bitewing shows 8), the date it was TAKEN (not uploaded), and its
-- source (the clinic / an imaging centre). The viewer (ج2) stores a calibration and drawn annotations SEPARATE
-- from the original image (jsonb on the row — the object is never rewritten). CBCT stays outside: a link only.
--   • teeth text[] is the source of truth; tooth_num (M55) mirrors its first tooth so every older reader
--     (labs · appointments · filters) keeps working. A trigger keeps the two in step on every write path.
--   • #694: every link column is guarded by ownership — patient (doctor_id = owner) · session/appointment of the
--     same patient · and the object path must be the row's own folder {owner}/{patient}/.
--   • Storage cap per plan: entitlements.storage_mb (inside the column the plan gate already reads — #2015 pattern),
--     seeded only where absent. Enforced on the SERVER: a RESTRICTIVE INSERT policy on storage.objects refuses a new
--     patient-files object once the tenant's real usage (sum of its current objects, orphans included) has reached the
--     cap; the client pre-checks used + size for an exact message. Absent/invalid cap ⇒ unlimited (declared).
--   • Orphans (objects with no row — e.g. a patient deleted before v635 removed his folder first) are listed to their
--     owner (older than 1 hour, so an in-flight upload is never one) so the client can delete them.
--   • Bucket: 30 MB and application/dicom (single-file .dcm; the client sniffs the DICM magic at byte 128).
--   • patient_documents joins the Realtime publication (the chart badge and files tab update live — SyLive).
-- ROLLBACK: DROP POLICY pf_quota_insert ON storage.objects; DROP FUNCTION public.pf_quota_ok(), public.my_storage_usage(),
--   public.my_storage_orphans(), public._pf_used_bytes(uuid), public._pf_cap_bytes(uuid);
--   DROP TRIGGER trg_patient_documents_xray_guard ON public.patient_documents; DROP FUNCTION public.patient_documents_xray_guard();
--   ALTER TABLE public.patient_documents DROP COLUMN xray_type, teeth, taken_at, source, source_name, calib_mm_per_px, annotations, cbct_url;
--   UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = '{image/jpeg,image/png,image/webp,application/pdf}' WHERE id = 'patient-files';
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.patient_documents;
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) الأعمدة ──────────────────────────────────────────────────────
ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS xray_type        TEXT,
  ADD COLUMN IF NOT EXISTS teeth            TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS taken_at         DATE,
  ADD COLUMN IF NOT EXISTS source           TEXT,
  ADD COLUMN IF NOT EXISTS source_name      TEXT,
  ADD COLUMN IF NOT EXISTS calib_mm_per_px  NUMERIC,
  ADD COLUMN IF NOT EXISTS annotations      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cbct_url         TEXT;

ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_xray_type_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_xray_type_check
  CHECK (xray_type IS NULL OR (category = 'xray' AND xray_type IN ('periapical','bitewing','panoramic','cephalometric','other')));
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_teeth_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_teeth_check
  CHECK (cardinality(teeth) <= 52 AND array_to_string(teeth, ',') ~ '^(([1-4][1-8]|[5-8][1-5])(,([1-4][1-8]|[5-8][1-5]))*)?$');
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_source_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_source_check
  CHECK ((source IS NULL OR source IN ('clinic','center'))
     AND (source_name IS NULL OR (source = 'center' AND char_length(source_name) <= 120)));
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_calib_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_calib_check
  CHECK (calib_mm_per_px IS NULL OR (calib_mm_per_px > 0 AND calib_mm_per_px < 10));
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_annotations_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_annotations_check
  CHECK (jsonb_typeof(annotations) = 'array' AND pg_column_size(annotations) <= 65536);
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_cbct_url_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_cbct_url_check
  CHECK (cbct_url IS NULL OR (cbct_url ~ '^https://[^\s<>"]+$' AND char_length(cbct_url) <= 2000));

COMMENT ON COLUMN public.patient_documents.teeth IS 'M192: أسنانُ الصورة (FDI) — المصدر؛ tooth_num مرآةٌ لأولها للقرّاء القدامى (تريغر).';
COMMENT ON COLUMN public.patient_documents.taken_at IS 'M192: تاريخُ التقاط الأشعة (لا تاريخ الرفع) — ترتيبُ الخط الزمني.';
COMMENT ON COLUMN public.patient_documents.annotations IS 'M192: تعليقاتُ العارض المرسومة بإحداثيات الصورة — منفصلةٌ عن الأصل الذي لا يُعاد كتابته.';
COMMENT ON COLUMN public.patient_documents.cbct_url IS 'M192: رابطُ عارض CBCT لدى الشركة/المركز (https فقط) — الحجمُ ثلاثيُّ الأبعاد خارج المنصة.';

UPDATE public.patient_documents SET teeth = ARRAY[tooth_num]
 WHERE cardinality(teeth) = 0 AND tooth_num ~ '^([1-4][1-8]|[5-8][1-5])$';

CREATE INDEX IF NOT EXISTS idx_patient_documents_storage_path ON public.patient_documents (storage_path);

-- ── 2) التريغر: teeth ⇄ tooth_num · التاريخ · حرّاسُ الملكية (#694) — invoker: RLS تخفي صفوفَ الغير ─────
CREATE OR REPLACE FUNCTION public.patient_documents_xray_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF cardinality(COALESCE(NEW.teeth, '{}')) = 0 AND NEW.tooth_num IS NOT NULL AND NEW.tooth_num <> '' THEN
      NEW.teeth := ARRAY[NEW.tooth_num];
    END IF;
  ELSIF NEW.teeth IS NOT DISTINCT FROM OLD.teeth AND NEW.tooth_num IS DISTINCT FROM OLD.tooth_num THEN
    NEW.teeth := CASE WHEN NEW.tooth_num IS NULL OR NEW.tooth_num = '' THEN '{}'::text[] ELSE ARRAY[NEW.tooth_num] END;
  END IF;
  NEW.teeth := ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(NEW.teeth, '{}'::text[])) AS t WHERE t IS NOT NULL AND t <> '' ORDER BY t);
  NEW.tooth_num := NEW.teeth[1];
  IF NEW.category IS DISTINCT FROM 'xray' THEN NEW.xray_type := NULL; END IF;
  IF NEW.source IS DISTINCT FROM 'center' THEN NEW.source_name := NULL; END IF;
  IF NEW.taken_at IS NOT NULL AND NEW.taken_at > (now() AT TIME ZONE 'Asia/Damascus')::date THEN
    RAISE EXCEPTION 'xray_taken_in_future' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'patient_documents: patient not owned' USING ERRCODE = '42501';
    END IF;
    IF NEW.storage_path NOT LIKE (NEW.owner_id::text || '/' || NEW.patient_id::text || '/%') THEN
      RAISE EXCEPTION 'patient_documents: storage path outside the patient folder' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.session_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id AND s.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'patient_documents: session not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.appointment_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = NEW.appointment_id AND a.doctor_id = NEW.owner_id AND a.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'patient_documents: appointment not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.patient_documents_xray_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_patient_documents_xray_guard ON public.patient_documents;
CREATE TRIGGER trg_patient_documents_xray_guard
  BEFORE INSERT OR UPDATE ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.patient_documents_xray_guard();

-- ── 3) حصّةُ التخزين لكل خطة ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pf_used_bytes(p_uid uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0)::bigint
    FROM storage.objects o
   WHERE o.bucket_id = 'patient-files'
     AND o.name LIKE (p_uid::text || '/%')
     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false;
$$;

CREATE OR REPLACE FUNCTION public._pf_cap_bytes(p_uid uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_uid) THEN NULL
              WHEN jsonb_typeof(sp.entitlements->'storage_mb') = 'number' AND (sp.entitlements->>'storage_mb')::numeric > 0
              THEN floor((sp.entitlements->>'storage_mb')::numeric * 1048576)::bigint
              ELSE NULL END
    FROM (SELECT 1) AS one
    LEFT JOIN public.trial_requests tr ON tr.user_id = p_uid
    LEFT JOIN public.subscription_plans sp ON sp.code = COALESCE(tr.plan, 'trial');
$$;
REVOKE ALL ON FUNCTION public._pf_used_bytes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pf_cap_bytes(uuid)  FROM PUBLIC, anon, authenticated;

-- الخادمُ هو الحدّ: الاستهلاكُ الحاليُّ بلغ السقف ⇒ لا كائنَ جديد (تجاوزٌ أقصاه ملفٌّ واحد ≤ حدّ الحاوية).
CREATE OR REPLACE FUNCTION public.pf_quota_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
              ELSE COALESCE(public._pf_used_bytes(auth.uid()) < public._pf_cap_bytes(auth.uid()), true) END;
$$;
REVOKE ALL ON FUNCTION public.pf_quota_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pf_quota_ok() TO authenticated;

DROP POLICY IF EXISTS pf_quota_insert ON storage.objects;
CREATE POLICY pf_quota_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'patient-files' OR (SELECT public.pf_quota_ok()));

CREATE OR REPLACE FUNCTION public.my_storage_usage()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'used_bytes', public._pf_used_bytes(auth.uid()),
    'cap_bytes',  public._pf_cap_bytes(auth.uid()),
    'files',      (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
                     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false),
    'orphans',    (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
                     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false
                     AND o.created_at < now() - interval '1 hour'
                     AND NOT EXISTS (SELECT 1 FROM public.patient_documents d WHERE d.storage_path = o.name))
  ) END;
$$;
REVOKE ALL ON FUNCTION public.my_storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_usage() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_storage_orphans()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name FROM storage.objects o
   WHERE auth.uid() IS NOT NULL
     AND o.bucket_id = 'patient-files' AND o.name LIKE (auth.uid()::text || '/%')
     AND o.archived_at IS NULL AND COALESCE(o.is_delete_marker, false) = false
     AND o.created_at < now() - interval '1 hour'
     AND NOT EXISTS (SELECT 1 FROM public.patient_documents d WHERE d.storage_path = o.name)
   ORDER BY o.name
   LIMIT 1000;
$$;
REVOKE ALL ON FUNCTION public.my_storage_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_orphans() TO authenticated;

-- السقفُ يُزرع عند الغياب فقط (لا يدهس قيمةَ المالك عند إعادة التشغيل).
UPDATE public.subscription_plans
   SET entitlements = COALESCE(entitlements, '{}'::jsonb) || jsonb_build_object('storage_mb',
         CASE code WHEN 'trial' THEN 1024 WHEN 'monthly' THEN 5120 WHEN 'yearly' THEN 20480 WHEN 'pro' THEN 20480 ELSE 5120 END)
 WHERE NOT (COALESCE(entitlements, '{}'::jsonb) ? 'storage_mb');

-- ── 4) الحاوية: 30MB + DICOM ────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit = 31457280,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/dicom']
 WHERE id = 'patient-files';

-- ── 5) Realtime ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'patient_documents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_documents;
  END IF;
END $$;

COMMIT;

-- التحقّق:
-- SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND policyname='pf_quota_insert';   -- 1
-- SELECT code, entitlements->'storage_mb' FROM subscription_plans;                                   -- كلُّ خطةٍ بسقف
-- SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='patient-files';          -- 31457280 · +dicom
