-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 167 — إيصالُ شام كاش داخل طلب الاشتراك (DeepCode #8 · 1 تشرين الأول 2026 — قرار المالك)
-- ---------------------------------------------------------------------------
-- كان الدفعُ يُثبَت يدوياً عبر واتساب. الآن طلبُ الاشتراك نفسُه يحمل إثباتَ الدفع:
--   • payment_ref  — رقمُ العملية (نص).
--   • receipt_path — مسارُ صورة/PDF الإيصال بحاوية التخزين الخاصة payment-receipts (لا رابطٌ عام).
-- قرارُ المالك: **شام كاش يحتاج واحداً على الأقل** — الصورة أو رقم العملية (القيدُ بالقاعدة، NOT VALID
-- فلا يُعيد التحقق من الطلبات القديمة). المسارُ لا يكون إلا بمجلد صاحب الطلب نفسه.
-- الحاوية payment-receipts خاصة (5MB · صور وPDF): المستأجرُ يرفع ويقرأ مجلدَه {uid}/ فقط، ومشرفُ المنصة يقرأ الكل.
-- platform_settings.shamcash_account — رقمُ حساب شام كاش للمنصة (يعدّله المشرف؛ فارغٌ ⇒ لا يُعرض).
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.subscription_requests ADD COLUMN IF NOT EXISTS payment_ref  text;
ALTER TABLE public.subscription_requests ADD COLUMN IF NOT EXISTS receipt_path text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_shamcash_proof') THEN
    ALTER TABLE public.subscription_requests ADD CONSTRAINT subscription_requests_shamcash_proof
      CHECK (payment_method IS DISTINCT FROM 'sham_cash'
             OR receipt_path IS NOT NULL
             OR NULLIF(btrim(payment_ref), '') IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_receipt_own_folder') THEN
    ALTER TABLE public.subscription_requests ADD CONSTRAINT subscription_requests_receipt_own_folder
      CHECK (receipt_path IS NULL OR split_part(receipt_path, '/', 1) = user_id::text) NOT VALID;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

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

INSERT INTO public.platform_settings (key, value) VALUES ('shamcash_account', '')
ON CONFLICT (key) DO NOTHING;
