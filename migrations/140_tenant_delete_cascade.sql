-- Migration 140: حذفُ الحساب صار حذفاً كاملاً بالقاعدة (CASCADE من auth.users) بلا بقايا يتيمة.
--
-- الفحصُ الحيّ (13 أيلول 2026، بعد سؤال المالك «هل يُحذف نهائياً؟»): كل جداول
-- العيادة تتسلسل من auth.users (مباشرةً أو عبر doctors/patients) عدا أربعة بلا
-- FK أصلاً، فتبقى صفوفها يتيمةً بعد حذف الحساب (لا يقرؤها أحد — RLS بمعرّفٍ
-- ميّت — لكنها تخالف وعد الحذف بـprivacy.html وتتراكم):
--   • teeth_status_history.doctor_id  — 14 صفاً يتيماً حيّاً
--   • booking_requests.clinic_id      — 3 صفوف يتيمة حيّة
--   • perio_exams.doctor_id           — 0 اليوم، بلا حارس
--   • trial_requests.user_id          — يُحذف يدوياً من الأدمن/الإعدادات؛ بلا حارس
-- ما يُبقى عمداً: subscription_events / subscription_payments (أثرُ تدقيقٍ مالي
-- بمعرّفٍ لقطة، بالتصميم).
--
-- الفخّ المُثبَت حيّاً (داخل معاملة أُلغيت): إضافةُ FK على teeth_status_history
-- وحدها تُفشل الحذفَ كله — تريغرُ M76 يسجّل صفَّ 'D' لكل teeth_status يُمسح
-- بالتسلسل، ومالكُه قد حُذف لحظتها ⇒ 23503 ⇒ الحذف يرتدّ. فالتريغر صار يتخطّى
-- التسجيل حين يكون الحساب غائباً (مسحُ مستأجر) — والتسجيلُ الطبيعي (I/U/D
-- لحسابٍ حيّ) بلا مساس، مُثبَت: تعديلٌ قبل الحذف سُجِّل، ثم الحذف صفّر كل شيء.
--
-- الشفاءُ الذاتي: يُنظَّف اليتيم القائم قبل إضافة القيود (وإلا فشلت الإضافة).

-- 1) تريغر التاريخ: لا تسجيل عند مسح المالك (السطر الوحيد المضاف: حارس auth.users)
CREATE OR REPLACE FUNCTION public.fn_teeth_status_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- M140: cascade wipe of a deleted owner — no owner, no history.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.doctor_id) THEN
      RETURN OLD;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, op)
    VALUES
      (OLD.doctor_id, OLD.patient_id, OLD.tooth_num, OLD.surface, OLD.treatment_key, OLD.status, OLD.provider_id, OLD.review_at, 'D');
    RETURN OLD;
  ELSE
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, op)
    VALUES
      (NEW.doctor_id, NEW.patient_id, NEW.tooth_num, NEW.surface, NEW.treatment_key, NEW.status, NEW.provider_id, NEW.review_at,
       CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_teeth_status_history() FROM PUBLIC, anon, authenticated;

-- 2) تنظيف اليتيم القائم (idempotent)
DELETE FROM public.teeth_status_history h WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = h.doctor_id);
DELETE FROM public.booking_requests     b WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.clinic_id);
DELETE FROM public.perio_exams          p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.doctor_id);
DELETE FROM public.trial_requests       t WHERE t.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id);

-- 3) القيود (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teeth_status_history_doctor_fk') THEN
    ALTER TABLE public.teeth_status_history ADD CONSTRAINT teeth_status_history_doctor_fk
      FOREIGN KEY (doctor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_requests_clinic_fk') THEN
    ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_clinic_fk
      FOREIGN KEY (clinic_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perio_exams_doctor_fk') THEN
    ALTER TABLE public.perio_exams ADD CONSTRAINT perio_exams_doctor_fk
      FOREIGN KEY (doctor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_requests_user_fk') THEN
    ALTER TABLE public.trial_requests ADD CONSTRAINT trial_requests_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── تحقّق ─────────────────────────────────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conname IN ('teeth_status_history_doctor_fk','booking_requests_clinic_fk','perio_exams_doctor_fk','trial_requests_user_fk'); -- 4
-- SELECT count(*) FROM teeth_status_history h WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=h.doctor_id); -- 0
-- SELECT count(*) FROM pg_policies WHERE tablename IN ('trial_requests','teeth_status_history','booking_requests','perio_exams'); -- بلا تغيير
-- ملاحظة: ملفات التخزين (patient-files/<uid>/…) خارج القاعدة — تُمسح من admin-ops
-- (delete_auth_user) ومن الإعدادات (SyDentFiles.purgeOwner) قبل حذف الحساب.
