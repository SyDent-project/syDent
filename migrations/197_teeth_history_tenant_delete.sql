-- 197 — Deleting a clinic with tooth-chart data failed (admin «🗑️ حذف»)
--
-- auth.admin.deleteUser cascades every clinic table from auth.users. On the way, an
-- ON DELETE SET NULL foreign key UPDATEs teeth_status rows (e.g. provider_id), and
-- trg_teeth_status_history inserted a history row for that UPDATE with the owner's
-- doctor_id — an owner already deleted in the same transaction — so the insert hit
-- teeth_status_history_doctor_fk and the whole delete rolled back
-- ("insert or update on table teeth_status_history violates foreign key constraint").
-- The DELETE branch already skipped history when the owner is gone; the INSERT/UPDATE
-- branch now does the same. Nothing else changes. Idempotent.
--
-- (Was 179, then 195, on dental-dev/prod. After merging upstream v642 it runs after 179_teeth_status_dx,
-- so the body below is that migration's function — dx_key carried into history — plus the guard.)

CREATE OR REPLACE FUNCTION public.fn_teeth_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.doctor_id) THEN
      RETURN OLD;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (OLD.doctor_id, OLD.patient_id, OLD.tooth_num, OLD.surface, OLD.treatment_key, OLD.status, OLD.provider_id, OLD.review_at, OLD.dx_key, 'D');
    RETURN OLD;
  ELSE
    -- the owner is being deleted (tenant wipe cascade): no history for a row about to go
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.doctor_id) THEN
      RETURN NEW;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (NEW.doctor_id, NEW.patient_id, NEW.tooth_num, NEW.surface, NEW.treatment_key, NEW.status, NEW.provider_id, NEW.review_at, NEW.dx_key,
       CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
  END IF;
END; $function$;
