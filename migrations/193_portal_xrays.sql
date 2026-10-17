-- ════════════════════════════════════════════════════════════════════
-- Migration 193 — الأشعة ج4: صورُ الأشعة ببوابة المريض (مطفأةٌ افتراضياً · مشاركةٌ صورةً صورة) (v638)
-- Date: 14 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, X-ray plan session 4 «ابدا»): the patient may see his radiographs in portal.html — but radiographs need
-- interpretation and can carry incidental findings, so NOTHING is shown automatically:
--   • clinic_settings.portal_show_xrays (OFF by default) — the clinic switch, like every portal section;
--   • patient_documents.portal_shared (false by default) — the doctor shares ONE image at a time from the card.
--     Only browser images (jpeg/png/webp): the portal carries no DICOM reader. The ORIGINAL only — the drawn
--     annotations (doctor's clinical notes) and the calibration never leave the clinic.
--   • The portal is anonymous and Storage signs URLs only for an authenticated owner — so the list + signing go
--     through the Edge Function `portal-xray` (service role). It calls `portal_xray_list(token)` below, which is
--     executable by service_role ONLY and applies the same gates as portal_info / portal_slots (valid, unrevoked,
--     unexpired token whose patient belongs to the owner · clinic open (subscription gate) · the switch on), then
--     returns the shared images' paths; the function signs each for 15 minutes and returns URLs + safe metadata.
--   • Zero writes from the portal. Sharing / unsharing is the doctor's write (owner RLS + subscription gate, audited).
-- ROLLBACK: DROP FUNCTION IF EXISTS public.portal_xray_list(text);
--   ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_portal_shared_check,
--     DROP COLUMN IF EXISTS portal_shared, DROP COLUMN IF EXISTS portal_shared_at;
--   ALTER TABLE public.clinic_settings DROP COLUMN IF EXISTS portal_show_xrays;
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS portal_show_xrays BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS portal_shared    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_shared_at TIMESTAMPTZ;
ALTER TABLE public.patient_documents DROP CONSTRAINT IF EXISTS patient_documents_portal_shared_check;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_portal_shared_check
  CHECK (portal_shared = false OR mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
COMMENT ON COLUMN public.patient_documents.portal_shared IS 'M193: الطبيب شارك هذه الصورة مع المريض ببوابته (تظهر فقط إن كان portal_show_xrays مفعّلاً) — الأصل وحده بلا تعليقات.';

CREATE INDEX IF NOT EXISTS idx_patient_documents_portal_shared ON public.patient_documents (patient_id) WHERE portal_shared;

-- وقتُ المشاركة يُختم بالخادم (لا يكتبه العميل)
CREATE OR REPLACE FUNCTION public._patient_documents_share_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.portal_shared AND (TG_OP = 'INSERT' OR OLD.portal_shared IS DISTINCT FROM true) THEN NEW.portal_shared_at := now();
  ELSIF NOT NEW.portal_shared THEN NEW.portal_shared_at := NULL;
  ELSE NEW.portal_shared_at := OLD.portal_shared_at; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._patient_documents_share_stamp() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_patient_documents_share_stamp ON public.patient_documents;
CREATE TRIGGER trg_patient_documents_share_stamp
  BEFORE INSERT OR UPDATE OF portal_shared, portal_shared_at ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public._patient_documents_share_stamp();

-- للخادم وحده (Edge Function portal-xray بمفتاح الخدمة): نفسُ بوابات portal_info/portal_slots + المفتاح + المشاركة.
CREATE OR REPLACE FUNCTION public.portal_xray_list(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  v_on BOOLEAN;
  v_items JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT pp.owner_id, pp.patient_id INTO v FROM public.patient_portals pp
    JOIN public.patients p ON p.id = pp.patient_id AND p.doctor_id = pp.owner_id
   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;
  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'unavailable'); END IF;
  SELECT COALESCE(c.portal_show_xrays, false) INTO v_on FROM public.clinic_settings c WHERE c.owner_id = v.owner_id;
  IF v_on IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'path', d.storage_path, 'kind', CASE WHEN d.category = 'xray' THEN 'xray' ELSE 'photo' END,
           'type', d.xray_type, 'date', COALESCE(d.taken_at, (d.created_at AT TIME ZONE 'Asia/Damascus')::date),
           'teeth', COALESCE(to_jsonb(d.teeth), '[]'::jsonb)
         ) ORDER BY COALESCE(d.taken_at, (d.created_at AT TIME ZONE 'Asia/Damascus')::date) DESC, d.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (SELECT * FROM public.patient_documents x
           WHERE x.owner_id = v.owner_id AND x.patient_id = v.patient_id AND x.portal_shared
             AND x.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND x.storage_path LIKE (v.owner_id::text || '/' || v.patient_id::text || '/%')
           ORDER BY COALESCE(x.taken_at, (x.created_at AT TIME ZONE 'Asia/Damascus')::date) DESC, x.created_at DESC
           LIMIT 40) d;
  RETURN jsonb_build_object('ok', true, 'items', v_items);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_xray_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_xray_list(text) TO service_role;

COMMIT;

-- التحقّق:
-- SELECT has_function_privilege('anon', 'public.portal_xray_list(text)', 'EXECUTE');            -- false
-- SELECT has_function_privilege('authenticated', 'public.portal_xray_list(text)', 'EXECUTE');   -- false
-- SELECT has_function_privilege('service_role', 'public.portal_xray_list(text)', 'EXECUTE');    -- true
