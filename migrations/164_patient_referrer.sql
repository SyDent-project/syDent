-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 164 — «مين حوّل المريض؟» (30 أيلول 2026 — جولة مقارنة التقارير، البند 5)
-- ---------------------------------------------------------------------------
-- Dentrix «Referred By» (مريض أو مصدر) · Open Dental «Referral From» (مريض أو طبيب من قائمة المُحيلين) ·
-- Curve «Referral Source». مصدرُ المريض (referral_source — M89) يقول **كيف** سمع عنّا؛ هذان يقولان **مين**:
--   • referred_by_patient_id — مريضٌ موجود عرّفه علينا («صديق / قريب»).
--   • referrer_name           — اسمٌ حرّ: الطبيبُ المحوِّل، أو مُعرِّفٌ ليس مريضاً بالعيادة (≤120 حرفاً).
-- حارسُ الملكية (#694): المفتاحُ الأجنبي لا يمرّ بـRLS، فالمُعرِّفُ يجب أن يكون مريضاً **للمالك نفسه**، ولا يُحيل
-- المريضُ نفسَه. SECURITY INVOKER ⇒ المريضُ غير المرئي بـRLS يُعامَل غيرَ موجود. حذفُ المُعرِّف ⇒ SET NULL.
-- صفرُ لمسٍ مالي. idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS referred_by_patient_id uuid
  REFERENCES public.patients(id) ON DELETE SET NULL;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS referrer_name text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_referrer_name_len') THEN
    ALTER TABLE public.patients ADD CONSTRAINT patients_referrer_name_len
      CHECK (referrer_name IS NULL OR char_length(referrer_name) <= 120);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patients_referred_by
  ON public.patients (referred_by_patient_id) WHERE referred_by_patient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.patients_referrer_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.referred_by_patient_id IS NOT NULL THEN
    IF NEW.referred_by_patient_id = NEW.id THEN
      RAISE EXCEPTION 'referrer_self' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.patients p
                    WHERE p.id = NEW.referred_by_patient_id AND p.doctor_id = NEW.doctor_id) THEN
      RAISE EXCEPTION 'referrer_not_owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_patients_referrer_guard ON public.patients;
CREATE TRIGGER trg_patients_referrer_guard
  BEFORE INSERT OR UPDATE OF referred_by_patient_id, doctor_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_referrer_guard();

COMMENT ON COLUMN public.patients.referred_by_patient_id IS 'M164: المريض الذي عرّف هذا المريض على العيادة (للمالك نفسه — trg_patients_referrer_guard)';
COMMENT ON COLUMN public.patients.referrer_name IS 'M164: اسم المُحيل الحرّ — الطبيب المحوِّل أو مُعرِّف ليس مريضاً (≤120)';
