-- ============================================================
-- Migration 212 — teeth_status_history.denture_clasps (ضمّاتُ الجهاز بسجلّ المخطط)
-- ------------------------------------------------------------
-- الهدف (v752 — مراجعةُ المالك 18/11/2026: «راجع الموضوع شوف ازا في مشكلة مخفية»): سجلُّ المخطط (M76) لا يحفظ قائمةَ ضمّات
--   الجهاز الجزئي (M209) ⇒ العرضُ التاريخي 🕰️ يرسم الاقتراحَ التلقائي دائماً — حتى بتاريخ اليوم يخالف المخططَ الحيّ — ولا أثرَ
--   لإلغاء ضمّةٍ أو إضافتها. الإصلاح: عمودٌ بالسجل بالمعنى نفسه (NULL = اقتراحٌ تلقائي)، والزنادُ يكتبه مع كل صف.
-- الحدّ الحاسم: عرضيٌّ بحت — لا جلسة ولا تكلفة ولا أي مسارٍ مالي.
-- الأثر: عمودٌ nullable · additive · idempotent · لا تعبئة (السجلُّ القديم NULL = الاقتراح، كما كان يُعرض) · الزنادُ نفسُه
--   (fn_teeth_status_history كما هو حيّاً: حارسُ auth.users + dx_key) + العمودُ الجديد فقط · صفر RLS جديدة.
-- التراجع: أعد الدالة بلا denture_clasps ثم ALTER TABLE public.teeth_status_history DROP COLUMN IF EXISTS denture_clasps;
-- ============================================================

BEGIN;

ALTER TABLE public.teeth_status_history
  ADD COLUMN IF NOT EXISTS denture_clasps text;

COMMENT ON COLUMN public.teeth_status_history.denture_clasps IS
  'ضمّات الجهاز المتحرك الجزئي كما كانت على الصف (M209): NULL = اقتراح تلقائي · نص فارغ = بلا ضمّات · «13,17» = أسنان الضمّات. عرضيٌّ بحت.';

CREATE OR REPLACE FUNCTION public.fn_teeth_status_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.doctor_id) THEN
      RETURN OLD;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, denture_clasps, op)
    VALUES
      (OLD.doctor_id, OLD.patient_id, OLD.tooth_num, OLD.surface, OLD.treatment_key, OLD.status, OLD.provider_id, OLD.review_at, OLD.dx_key, OLD.denture_clasps, 'D');
    RETURN OLD;
  ELSE
    -- the owner is being deleted (tenant wipe cascade): no history for a row about to go
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.doctor_id) THEN
      RETURN NEW;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, denture_clasps, op)
    VALUES
      (NEW.doctor_id, NEW.patient_id, NEW.tooth_num, NEW.surface, NEW.treatment_key, NEW.status, NEW.provider_id, NEW.review_at, NEW.dx_key, NEW.denture_clasps,
       CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
  END IF;
END; $function$;

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='teeth_status_history' AND column_name='denture_clasps') AS col,  -- 1
  (SELECT count(*) FROM pg_proc WHERE proname='fn_teeth_status_history' AND prosrc LIKE '%NEW.denture_clasps%')                                         AS fn;   -- 1
