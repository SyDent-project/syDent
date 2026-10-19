-- ════════════════════════════════════════════════════════════════════
-- Migration 194 — SyDent Bridge (ربط الأجهزة ٢): الاقتران · طلباتُ الالتقاط · الواردُ غير المصنّف (v643)
-- Date: 16 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, device plan session 2 «ابدا»): a sensor's image must land on the chosen patient and tooth within
-- seconds, from a small Windows agent («SyDent Bridge») on the clinic PC that has NO user session. So:
--   • bridge_pairings: an 8-char code the owner mints in Settings (10 min, one use). The agent exchanges it ONCE
--     through the Edge Function `bridge` for a device key; only the key's SHA-256 is stored (bridge_devices.key_hash).
--     Revoking a device = one click; a revoked key is refused everywhere.
--   • capture_requests: the doctor's intent — patient · teeth · type · optional session — open 15 minutes. The agent
--     polls its clinic's open requests; the next image it captures fulfils the oldest open one ⇒ patient_documents
--     row (through the SAME guards as any upload — M192 trigger) and the request turns `done`. Live via Realtime.
--   • bridge_inbox: an image that arrived with no open request (or was captured on the wrong moment) waits here,
--     under {owner}/_inbox/… — still the owner's folder, so storage RLS and the quota are unchanged; the orphan
--     detector learns to skip it. The doctor assigns it to a patient (storage move + row) or dismisses it.
--   • Every bridge_* function below is executable by service_role ONLY (the Edge Function); the clinic reads its
--     own rows through owner RLS + the subscription gate. The agent's uploads are gated here too: tenant 'full',
--     storage quota, mime list, path inside the owner's folder.
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE public.capture_requests, public.bridge_inbox, public.bridge_devices;
--   DROP FUNCTION IF EXISTS public.bridge_pairing_code(text), public.bridge_pair(text,text,text,text), public.bridge_auth(uuid,text),
--     public.bridge_open_requests(uuid), public.bridge_upload_path(uuid,uuid,text,text), public.bridge_complete(uuid,uuid,uuid,text,text,text,bigint),
--     public.capture_requests_guard();
--   DROP TABLE IF EXISTS public.bridge_inbox, public.capture_requests, public.bridge_pairings, public.bridge_devices;
--   (then restore my_storage_usage/my_storage_orphans from migration 192)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) الأجهزة المقترنة ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bridge_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  key_hash      TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  mode          TEXT NOT NULL DEFAULT 'folder' CHECK (mode IN ('folder', 'twain', 'dicom', 'manual')),
  version       TEXT CHECK (version IS NULL OR char_length(version) <= 40),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bridge_devices_owner ON public.bridge_devices (owner_id, revoked_at);
ALTER TABLE public.bridge_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bridge_devices_owner_select ON public.bridge_devices;
CREATE POLICY bridge_devices_owner_select ON public.bridge_devices FOR SELECT USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS bridge_devices_owner_update ON public.bridge_devices;
CREATE POLICY bridge_devices_owner_update ON public.bridge_devices FOR UPDATE
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS bridge_devices_owner_delete ON public.bridge_devices;
CREATE POLICY bridge_devices_owner_delete ON public.bridge_devices FOR DELETE USING (owner_id = (SELECT auth.uid()));
-- لا INSERT من العميل: الجهازُ يُنشأ بالاقتران فقط (bridge_pair بمفتاح الخدمة)
SELECT public._sub_guard_table('public.bridge_devices');
-- المالكُ يغيّر الاسم والإيقاف فقط — المفتاحُ والمالكُ لا يُمسّان من العميل
CREATE OR REPLACE FUNCTION public._bridge_devices_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('sydent.bridge', true) = '1' THEN RETURN NEW; END IF;   -- الخادمُ (مفتاحُ الخدمة أو دوالُّ الجسر) يمرّ؛ العميلُ لا
  NEW.key_hash := OLD.key_hash; NEW.owner_id := OLD.owner_id; NEW.created_at := OLD.created_at;
  NEW.last_seen_at := OLD.last_seen_at; NEW.version := OLD.version; NEW.mode := OLD.mode;
  IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;   -- الإيقافُ لا يُلغى: اقرن من جديد
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._bridge_devices_lock() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_bridge_devices_lock ON public.bridge_devices;
CREATE TRIGGER trg_bridge_devices_lock BEFORE UPDATE ON public.bridge_devices FOR EACH ROW EXECUTE FUNCTION public._bridge_devices_lock();
COMMENT ON TABLE public.bridge_devices IS 'SyDent Bridge (M194): أجهزةُ العيادة المقترنة — يُخزَّن SHA-256 لمفتاح الجهاز فقط؛ الإيقافُ نهائي.';

-- ── 2) رموزُ الاقتران ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bridge_pairings (
  code        TEXT PRIMARY KEY CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL CHECK (char_length(device_name) BETWEEN 1 AND 80),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bridge_pairings_owner ON public.bridge_pairings (owner_id, created_at DESC);
ALTER TABLE public.bridge_pairings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bridge_pairings_owner_select ON public.bridge_pairings;
CREATE POLICY bridge_pairings_owner_select ON public.bridge_pairings FOR SELECT USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS bridge_pairings_owner_delete ON public.bridge_pairings;
CREATE POLICY bridge_pairings_owner_delete ON public.bridge_pairings FOR DELETE USING (owner_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.bridge_pairings');

-- المالكُ يسكّ رمزاً (RPC مصادَق): 8 أحرف من أبجديةٍ لا لبسَ فيها (بلا 0/O/1/I) · 10 دقائق · رمزٌ واحد مفتوح لكل عيادة
CREATE OR REPLACE FUNCTION public.bridge_pairing_code(p_device_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_code text; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; v_name text; v_exp timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF public.tenant_access_level(v_uid) <> 'full' THEN RAISE EXCEPTION 'subscription_read_only' USING ERRCODE = '42501'; END IF;
  v_name := left(btrim(COALESCE(p_device_name, '')), 80);
  IF v_name = '' THEN v_name := 'كمبيوتر العيادة'; END IF;
  DELETE FROM public.bridge_pairings WHERE owner_id = v_uid;   -- رمزٌ واحد مفتوح لكل عيادة (القديمُ يُلغى)
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bridge_pairings WHERE code = v_code);
  END LOOP;
  INSERT INTO public.bridge_pairings(code, owner_id, device_name) VALUES (v_code, v_uid, v_name) RETURNING expires_at INTO v_exp;
  RETURN jsonb_build_object('code', v_code, 'expires_at', v_exp, 'device_name', v_name);
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_pairing_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_pairing_code(text) TO authenticated;

-- الجهازُ يستبدل الرمزَ بمفتاح (مفتاحُ الخدمة فقط — الدالةُ الطرفية تولّد المفتاحَ وتمرّر تجزئته)
CREATE OR REPLACE FUNCTION public.bridge_pair(p_code text, p_key_hash text, p_version text, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD; v_id uuid;
BEGIN
  IF p_code IS NULL OR upper(p_code) !~ '^[A-HJ-NP-Z2-9]{8}$' OR p_key_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_code'); END IF;
  SELECT * INTO v FROM public.bridge_pairings WHERE code = upper(p_code) FOR UPDATE;
  IF NOT FOUND OR v.used_at IS NOT NULL OR v.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_code'); END IF;
  IF public.tenant_access_level(v.owner_id) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  INSERT INTO public.bridge_devices(owner_id, name, key_hash, version, mode)
    VALUES (v.owner_id, v.device_name, p_key_hash, left(p_version, 40), CASE WHEN p_mode IN ('folder','twain','dicom','manual') THEN p_mode ELSE 'folder' END)
    RETURNING id INTO v_id;
  UPDATE public.bridge_pairings SET used_at = now() WHERE code = v.code;
  RETURN jsonb_build_object('ok', true, 'device_id', v_id, 'owner_id', v.owner_id, 'device_name', v.device_name);
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_pair(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_pair(text, text, text, text) TO service_role;

-- مصادقةُ جهاز: المعرّف + تجزئةُ المفتاح ⇒ المالك (ويُختم last_seen) · موقوفٌ أو مجهول ⇒ NULL
CREATE OR REPLACE FUNCTION public.bridge_auth(p_device uuid, p_key_hash text, p_version text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  IF p_device IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  PERFORM set_config('sydent.bridge', '1', true);
  UPDATE public.bridge_devices SET last_seen_at = now(), version = COALESCE(left(p_version, 40), version)
   WHERE id = p_device AND key_hash = p_key_hash AND revoked_at IS NULL RETURNING owner_id INTO v_owner;
  RETURN v_owner;
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_auth(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_auth(uuid, text, text) TO service_role;

-- ── 3) طلباتُ الالتقاط ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capture_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id    UUID REFERENCES public.bridge_devices(id) ON DELETE SET NULL,
  category     TEXT NOT NULL DEFAULT 'xray' CHECK (category IN ('xray', 'clinical_photo')),
  xray_type    TEXT CHECK (xray_type IS NULL OR xray_type IN ('periapical','bitewing','panoramic','cephalometric','other')),
  teeth        TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(teeth) <= 52 AND array_to_string(teeth, ',') ~ '^(([1-4][1-8]|[5-8][1-5])(,([1-4][1-8]|[5-8][1-5]))*)?$'),
  session_id   UUID REFERENCES public.ledger_sessions(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  done_at      TIMESTAMPTZ,
  document_id  UUID REFERENCES public.patient_documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_capture_requests_open ON public.capture_requests (owner_id, created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_capture_requests_patient ON public.capture_requests (patient_id, created_at DESC);
ALTER TABLE public.capture_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capture_requests_owner_all ON public.capture_requests;
CREATE POLICY capture_requests_owner_all ON public.capture_requests
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.capture_requests');
-- حارسُ الملكية (#694): المريضُ والجلسةُ للعيادة؛ العميلُ لا يكتب done/document_id (الخادمُ وحده)
CREATE OR REPLACE FUNCTION public.capture_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.teeth := ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(NEW.teeth, '{}'::text[])) AS t WHERE t IS NOT NULL AND t <> '' ORDER BY t);
  IF NEW.category <> 'xray' THEN NEW.xray_type := NULL; END IF;
  IF TG_OP = 'INSERT' OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'capture_requests: patient not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.session_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.session_id IS DISTINCT FROM OLD.session_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.ledger_sessions s WHERE s.id = NEW.session_id AND s.doctor_id = NEW.owner_id AND s.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'capture_requests: session not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.device_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.device_id IS DISTINCT FROM OLD.device_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.bridge_devices d WHERE d.id = NEW.device_id AND d.owner_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'capture_requests: device not owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND current_setting('sydent.bridge', true) IS DISTINCT FROM '1' THEN   -- عميلٌ (دوالُّ الجسر ترفع العلمَ المحليّ)
    IF TG_OP = 'INSERT' THEN NEW.status := 'open'; NEW.done_at := NULL; NEW.document_id := NULL; NEW.created_at := now(); NEW.expires_at := now() + interval '15 minutes';
    ELSE
      IF NEW.status NOT IN ('open', 'cancelled') OR OLD.status <> 'open' THEN NEW.status := OLD.status; END IF;   -- العميلُ يلغي طلباً مفتوحاً فقط
      NEW.done_at := OLD.done_at; NEW.document_id := OLD.document_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_requests_guard() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_capture_requests_guard ON public.capture_requests;
CREATE TRIGGER trg_capture_requests_guard BEFORE INSERT OR UPDATE ON public.capture_requests FOR EACH ROW EXECUTE FUNCTION public.capture_requests_guard();
COMMENT ON TABLE public.capture_requests IS 'SyDent Bridge (M194): طلبُ التقاطٍ مفتوح 15 دقيقة — المريضُ والأسنانُ والنوع؛ الجهازُ يملؤه بأول صورةٍ تصل.';

-- ── 4) الواردُ غير المصنّف ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bridge_inbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     UUID REFERENCES public.bridge_devices(id) ON DELETE SET NULL,
  storage_path  TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL CHECK (char_length(file_name) <= 200),
  mime_type     TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/dicom')),
  size_bytes    BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bridge_inbox_path_check CHECK (storage_path LIKE (owner_id::text || '/_inbox/%'))
);
CREATE INDEX IF NOT EXISTS idx_bridge_inbox_owner ON public.bridge_inbox (owner_id, captured_at DESC);
ALTER TABLE public.bridge_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bridge_inbox_owner_select ON public.bridge_inbox;
CREATE POLICY bridge_inbox_owner_select ON public.bridge_inbox FOR SELECT USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS bridge_inbox_owner_delete ON public.bridge_inbox;
CREATE POLICY bridge_inbox_owner_delete ON public.bridge_inbox FOR DELETE USING (owner_id = (SELECT auth.uid()));
SELECT public._sub_guard_table('public.bridge_inbox');
COMMENT ON TABLE public.bridge_inbox IS 'SyDent Bridge (M194): صورةٌ وصلت من جهازٍ بلا طلبٍ مفتوح — تنتظر إسنادَها لمريض (نقلُ الملف + صف) أو تجاهلَها.';

-- ── 5) خدمةُ الجهاز (مفتاحُ الخدمة فقط) ─────────────────────────────
-- الطلباتُ المفتوحة لعيادةٍ (وتُطوى المنتهية)
CREATE OR REPLACE FUNCTION public.bridge_open_requests(p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('sydent.bridge', '1', true);
  UPDATE public.capture_requests SET status = 'expired' WHERE owner_id = p_owner AND status = 'open' AND expires_at < now();
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'patient_id', r.patient_id, 'patient_name', p.name, 'teeth', to_jsonb(r.teeth),
                                   'category', r.category, 'xray_type', r.xray_type, 'device_id', r.device_id, 'created_at', r.created_at, 'expires_at', r.expires_at)
                                   ORDER BY r.created_at)
                     FROM public.capture_requests r JOIN public.patients p ON p.id = r.patient_id
                    WHERE r.owner_id = p_owner AND r.status = 'open'), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_open_requests(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_open_requests(uuid) TO service_role;

-- مسارُ الرفع للجهاز: بوابةُ الاشتراك + الحصّة + الصيغة ⇒ المسارُ المسموح (مجلدُ المريض لطلبٍ مفتوح، وإلا _inbox)
CREATE OR REPLACE FUNCTION public.bridge_upload_path(p_owner uuid, p_request uuid, p_mime text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_req RECORD; v_used bigint; v_cap bigint; v_clean text;
BEGIN
  IF public.tenant_access_level(p_owner) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  IF p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/dicom') THEN RETURN jsonb_build_object('ok', false, 'reason', 'type'); END IF;
  v_used := public._pf_used_bytes(p_owner); v_cap := public._pf_cap_bytes(p_owner);
  IF v_cap IS NOT NULL AND v_used >= v_cap THEN RETURN jsonb_build_object('ok', false, 'reason', 'quota'); END IF;
  v_clean := regexp_replace(COALESCE(p_name, 'capture'), '[^A-Za-z0-9._-]+', '-', 'g');
  v_clean := left(btrim(v_clean, '-.'), 80); IF v_clean = '' THEN v_clean := 'capture'; END IF;
  IF p_request IS NOT NULL THEN
    SELECT * INTO v_req FROM public.capture_requests WHERE id = p_request AND owner_id = p_owner AND status = 'open' AND expires_at >= now();
    IF FOUND THEN RETURN jsonb_build_object('ok', true, 'path', p_owner::text || '/' || v_req.patient_id::text || '/' || gen_random_uuid()::text || '-' || v_clean, 'request_id', v_req.id); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'path', p_owner::text || '/_inbox/' || gen_random_uuid()::text || '-' || v_clean, 'request_id', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_upload_path(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_upload_path(uuid, uuid, text, text) TO service_role;

-- إتمامُ الرفع: صفُّ المريض (عبر حرّاس M192) وإغلاقُ الطلب، أو صفُّ الوارد
CREATE OR REPLACE FUNCTION public.bridge_complete(p_owner uuid, p_device uuid, p_request uuid, p_path text, p_name text, p_mime text, p_size bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_req RECORD; v_doc uuid; v_inbox uuid;
BEGIN
  PERFORM set_config('sydent.bridge', '1', true);
  IF public.tenant_access_level(p_owner) <> 'full' THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription'); END IF;
  IF p_path IS NULL OR p_path NOT LIKE (p_owner::text || '/%') THEN RETURN jsonb_build_object('ok', false, 'reason', 'path'); END IF;
  IF p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/dicom') THEN RETURN jsonb_build_object('ok', false, 'reason', 'type'); END IF;
  IF p_request IS NOT NULL THEN
    SELECT * INTO v_req FROM public.capture_requests WHERE id = p_request AND owner_id = p_owner AND status = 'open' FOR UPDATE;
    IF FOUND AND p_path LIKE (p_owner::text || '/' || v_req.patient_id::text || '/%') THEN
      INSERT INTO public.patient_documents(owner_id, patient_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by,
                                           teeth, xray_type, taken_at, source, session_id, note)
        VALUES (p_owner, v_req.patient_id, p_path, left(COALESCE(p_name, 'capture'), 200), p_mime, p_size, v_req.category, p_owner,
                v_req.teeth, v_req.xray_type, (now() AT TIME ZONE 'Asia/Damascus')::date, 'clinic', v_req.session_id, 'التقاطٌ من الجهاز (SyDent Bridge)')
        RETURNING id INTO v_doc;
      UPDATE public.capture_requests SET status = 'done', done_at = now(), document_id = v_doc, device_id = COALESCE(device_id, p_device) WHERE id = v_req.id;
      RETURN jsonb_build_object('ok', true, 'document_id', v_doc, 'patient_id', v_req.patient_id);
    END IF;
  END IF;
  IF p_path NOT LIKE (p_owner::text || '/_inbox/%') THEN RETURN jsonb_build_object('ok', false, 'reason', 'path'); END IF;
  INSERT INTO public.bridge_inbox(owner_id, device_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (p_owner, p_device, p_path, left(COALESCE(p_name, 'capture'), 200), p_mime, p_size) RETURNING id INTO v_inbox;
  RETURN jsonb_build_object('ok', true, 'inbox_id', v_inbox);
END;
$$;
REVOKE ALL ON FUNCTION public.bridge_complete(uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_complete(uuid, uuid, uuid, text, text, text, bigint) TO service_role;

-- ── 6) الواردُ ليس يتيماً (M192) ─────────────────────────────────────
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
                     AND NOT EXISTS (SELECT 1 FROM public.patient_documents d WHERE d.storage_path = o.name)
                     AND NOT EXISTS (SELECT 1 FROM public.bridge_inbox b WHERE b.storage_path = o.name)),
    'inbox',      (SELECT count(*) FROM public.bridge_inbox b WHERE b.owner_id = auth.uid())
  ) END;
$$;
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
     AND NOT EXISTS (SELECT 1 FROM public.bridge_inbox b WHERE b.storage_path = o.name)
   ORDER BY o.name
   LIMIT 1000;
$$;

-- ── 7) Realtime ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'capture_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.capture_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bridge_inbox') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bridge_inbox;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bridge_devices') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bridge_devices;
  END IF;
END $$;

COMMIT;
