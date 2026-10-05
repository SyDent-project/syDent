-- Migration 77: periodontal charting v1 (Feature D)
-- Dated exams, each a full-mouth snapshot: 6-site probing depths (0-19mm),
-- 6-site bleeding on probing, mobility (0-3) per tooth. Presentation/clinical
-- layer only — fully isolated from the financial system.

CREATE TABLE IF NOT EXISTS perio_exams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid NOT NULL,
  patient_id  uuid NOT NULL,
  provider_id uuid,
  exam_date   date NOT NULL DEFAULT current_date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perio_measurements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  uuid NOT NULL,
  exam_id    uuid NOT NULL REFERENCES perio_exams(id) ON DELETE CASCADE,
  tooth_num  smallint NOT NULL CHECK (tooth_num BETWEEN 11 AND 48),
  pd_mb smallint CHECK (pd_mb BETWEEN 0 AND 19),
  pd_b  smallint CHECK (pd_b  BETWEEN 0 AND 19),
  pd_db smallint CHECK (pd_db BETWEEN 0 AND 19),
  pd_ml smallint CHECK (pd_ml BETWEEN 0 AND 19),
  pd_l  smallint CHECK (pd_l  BETWEEN 0 AND 19),
  pd_dl smallint CHECK (pd_dl BETWEEN 0 AND 19),
  bop_mb boolean NOT NULL DEFAULT false,
  bop_b  boolean NOT NULL DEFAULT false,
  bop_db boolean NOT NULL DEFAULT false,
  bop_ml boolean NOT NULL DEFAULT false,
  bop_l  boolean NOT NULL DEFAULT false,
  bop_dl boolean NOT NULL DEFAULT false,
  mobility smallint CHECK (mobility BETWEEN 0 AND 3),
  UNIQUE (exam_id, tooth_num)
);

CREATE INDEX IF NOT EXISTS idx_perio_exams_patient ON perio_exams (doctor_id, patient_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_perio_meas_exam ON perio_measurements (exam_id);

ALTER TABLE perio_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE perio_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perio_exams_own ON perio_exams;
CREATE POLICY perio_exams_own ON perio_exams
  FOR ALL USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS perio_meas_own ON perio_measurements;
CREATE POLICY perio_meas_own ON perio_measurements
  FOR ALL USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
