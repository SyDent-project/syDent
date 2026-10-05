-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 162 — مرفقاتُ طلب المخبر (29 أيلول 2026 — جولة مقارنة المخابر، البند 6)
-- ---------------------------------------------------------------------------
-- صورةُ اللون والحالة والمسح تُرسَل للمخبر مع الطلب (CareStack «Lab case attachments» · Dentrix «Lab Rx»
-- مع الصور). بدل جدولٍ ثانٍ ومسارِ تخزينٍ ثانٍ: ملفاتُ المريض نفسُها (bucket patient-files · RLS المالك ·
-- الضغط · الحذف المتّسق) تكسب رابطاً اختيارياً للطلب — فالمرفقُ يظهر بتبويب ملفات المريض أيضاً.
-- lab_order_id ON DELETE SET NULL: حذفُ الطلب لا يحذف صورةَ المريض (نمطُ appointment_id/session_id).
-- صفرُ لمسٍ مالي. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.patient_documents ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public.lab_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patient_documents_lab_order ON public.patient_documents(lab_order_id) WHERE lab_order_id IS NOT NULL;
COMMENT ON COLUMN public.patient_documents.lab_order_id IS 'M162: مرفقُ طلب مخبر (صورة اللون/الحالة/المسح) — يبقى ملفاً للمريض إن حُذف الطلب.';
