-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 163 — حارسُ ملكية الروابط الجديدة بجولة المخابر (29 أيلول 2026 — مراجعة الجولة)
-- ---------------------------------------------------------------------------
-- فحصُ المفاتيح الأجنبية بـPostgres لا يمرّ بـRLS: مستخدمٌ يعرف معرّفَ طلبِ مخبرٍ لعيادةٍ أخرى كان يستطيع
-- إدراجَ صفِّ دورة إعادة (M160) أو ربطَ ملفّ مريضه (M162) به — لا تسريبَ بيانات (لا يقرأ الطلب)، لكنه
-- ربطٌ عابرٌ للمستأجرين يلوّث البيانات. الثابت: الرابطُ يشير لطلبٍ **للمالك نفسه** (ولملفّ المريض: **وللمريض نفسه**).
-- SECURITY INVOKER ⇒ الطلبُ غير المرئي بـRLS يُعامَل غيرَ موجود. صفرُ لمسٍ مالي. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lab_order_redos_owner_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lab_orders o WHERE o.id = NEW.lab_order_id AND o.doctor_id = NEW.doctor_id) THEN
    RAISE EXCEPTION 'lab_order_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lab_order_redos_owner_guard ON public.lab_order_redos;
CREATE TRIGGER trg_lab_order_redos_owner_guard
  BEFORE INSERT OR UPDATE OF lab_order_id, doctor_id ON public.lab_order_redos
  FOR EACH ROW EXECUTE FUNCTION public.lab_order_redos_owner_guard();

CREATE OR REPLACE FUNCTION public.patient_documents_lab_order_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.lab_order_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.lab_orders o
        WHERE o.id = NEW.lab_order_id AND o.doctor_id = NEW.owner_id AND o.patient_id = NEW.patient_id) THEN
    RAISE EXCEPTION 'lab_order_not_owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_patient_documents_lab_order_guard ON public.patient_documents;
CREATE TRIGGER trg_patient_documents_lab_order_guard
  BEFORE INSERT OR UPDATE OF lab_order_id, owner_id, patient_id ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.patient_documents_lab_order_guard();
