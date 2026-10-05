-- ============================================================
-- Migration 86: Atomic per-tenant patient numbering (no-reuse)
-- Standard: OpenDental PatNum / AHIMA MRN — the identifier is
-- unique, immutable, and NEVER reissued after deletion.
-- 1) patient_seq: high-water-mark counter per tenant (never decreases)
-- 2) next_patient_seq(n): atomic allocator RPC (row-lock via upsert)
-- 3) backfill counter from current live max per tenant
-- 4) unique safety-net index on (doctor_id, local_id)
-- Idempotent. Zero changes to existing local_id values or format.
-- ============================================================

-- 1) Counter table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_seq (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seq      integer NOT NULL DEFAULT 0
);

ALTER TABLE public.patient_seq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_seq_owner_all ON public.patient_seq;
CREATE POLICY patient_seq_owner_all ON public.patient_seq
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 2) Atomic allocator ----------------------------------------------
-- Returns the LAST allocated sequence number; the caller's first
-- number is (returned - n + 1). Self-healing: GREATEST against the
-- live max covers any row inserted via the legacy client path during
-- the deploy window. Concurrency-safe: concurrent calls serialize on
-- the tenant's row lock inside ON CONFLICT DO UPDATE.
CREATE OR REPLACE FUNCTION public.next_patient_seq(n integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  live_max integer;
  new_seq  integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF n IS NULL OR n < 1 OR n > 1000 THEN
    RAISE EXCEPTION 'invalid batch size %', n;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(local_id, '\D', '', 'g'), '')::integer), 0)
    INTO live_max
    FROM public.patients
   WHERE doctor_id = auth.uid();

  INSERT INTO public.patient_seq (owner_id, seq)
       VALUES (auth.uid(), live_max + n)
  ON CONFLICT (owner_id) DO UPDATE
       SET seq = GREATEST(patient_seq.seq + n, EXCLUDED.seq)
  RETURNING seq INTO new_seq;

  RETURN new_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_patient_seq(integer) TO authenticated;

-- 3) Backfill counters from current live max -----------------------
INSERT INTO public.patient_seq (owner_id, seq)
SELECT doctor_id,
       COALESCE(MAX(NULLIF(regexp_replace(local_id, '\D', '', 'g'), '')::integer), 0)
  FROM public.patients
 GROUP BY doctor_id
ON CONFLICT (owner_id) DO UPDATE
  SET seq = GREATEST(patient_seq.seq, EXCLUDED.seq);

-- 4) Duplicate pre-check — MUST return 0 rows.
-- If any rows appear, resolve them manually before the index below
-- (a duplicate would also make CREATE UNIQUE INDEX fail loudly).
SELECT doctor_id, local_id, count(*) AS dups
  FROM public.patients
 GROUP BY doctor_id, local_id
HAVING count(*) > 1;

-- Safety-net unique index (protects the legacy fallback path too)
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_local_id_uniq
  ON public.patients (doctor_id, local_id);

-- ============================================================
-- Verification tail (Rule #238)
-- ============================================================
-- (a) expect exactly 1 policy on patient_seq
SELECT count(*) AS patient_seq_policies
  FROM pg_policies
 WHERE tablename = 'patient_seq';

-- (b) expect seq >= live_max for every tenant row
SELECT ps.owner_id,
       ps.seq,
       (SELECT COALESCE(MAX(NULLIF(regexp_replace(p.local_id, '\D', '', 'g'), '')::integer), 0)
          FROM public.patients p
         WHERE p.doctor_id = ps.owner_id) AS live_max
  FROM public.patient_seq ps
 ORDER BY ps.seq DESC;

-- (c) expect 1 row
SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'patients'
   AND indexname = 'patients_doctor_local_id_uniq';
