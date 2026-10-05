-- Migration 76: teeth_status change history (Feature E — chart time-travel)
-- Append-only log of every INSERT / UPDATE / DELETE on teeth_status, written
-- by a trigger. The patient chart can then be reconstructed exactly as it
-- looked on any date >= the baseline seeded below. Read-only feature: the
-- history table accepts NO direct writes from clients (deny-all RLS; the
-- SECURITY DEFINER trigger is the only writer).

CREATE TABLE IF NOT EXISTS teeth_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL,
  patient_id    uuid NOT NULL,
  tooth_num     text NOT NULL,
  surface       text NOT NULL,
  treatment_key text,
  status        text,
  provider_id   uuid,
  review_at     date,
  op            char(1) NOT NULL CHECK (op IN ('I','U','D')),
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsh_patient_time ON teeth_status_history (patient_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_tsh_doctor ON teeth_status_history (doctor_id);

ALTER TABLE teeth_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tsh_select_own ON teeth_status_history;
CREATE POLICY tsh_select_own ON teeth_status_history
  FOR SELECT USING (doctor_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies on purpose: deny-all for clients.

CREATE OR REPLACE FUNCTION fn_teeth_status_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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

DROP TRIGGER IF EXISTS trg_teeth_status_history ON teeth_status;
CREATE TRIGGER trg_teeth_status_history
  AFTER INSERT OR UPDATE OR DELETE ON teeth_status
  FOR EACH ROW EXECUTE FUNCTION fn_teeth_status_history();

-- Baseline seed: snapshot the CURRENT chart of every patient as op='I' rows,
-- so reconstruction is exact for any date from today onward.
INSERT INTO teeth_status_history
  (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, op)
SELECT doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, 'I'
FROM teeth_status;

COMMENT ON TABLE teeth_status_history IS
  'Append-only audit of teeth_status (trigger-written). Powers the read-only historical chart view; clients may only SELECT their own rows.';
