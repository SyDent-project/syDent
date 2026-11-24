-- ════════════════════════════════════════════════════════════════════
-- Migration 226 — السنُّ الزائد كسنٍّ مستقل (supernumerary tooth as an independent tooth · ج1)
-- Date: 23 November 2026 | Idempotent: yes | Applied via Supabase MCP (rollback-tested first)
--
-- WHY: the owner's decision (23/11/2026 «ابدا», docs/SUPERNUMERARY.md) — option ب, deferred since
-- v580. A supernumerary tooth is no longer a condition anchored on its neighbour (surfaces SXM/SXD,
-- Migration 176) but a tooth of its own: fillings, endo, crown, extraction and conditions on it
-- like any tooth, perio included (ج3).
--
-- CODE (tooth_num): host × 10 + place — three digits, never colliding with FDI (two digits; and
-- 51–85 are the PRIMARY teeth in FDI, so the Dentrix/Open Dental 51–82 scheme cannot be used):
--   1 = the host's mesial gap (between two teeth) · 2 = behind the last tooth of the quadrant
--   3 = buccal to the host · 4 = palatal/lingual to the host
--   One gap = one code: the gap between A and B in a quadrant is «mesial of B» (B farther from the
--   midline); the midline is 111 (11|21) · 411 (41|31) · 511 · 811.
--
-- WHAT:
--   1. teeth_status: new reserved surface SN — the tooth's presence row (treatment_key 'sup-present',
--      status 'existing_current' ⇒ never read as a «condition» watch). SXM/SXD removed.
--   2. ledger_sessions: SXM/SXD removed (a session on a supernumerary carries its code + a normal surface).
--   3. perio_measurements.tooth_num: also accepts the codes of permanent hosts (111–484, place 1–4).
--   4. The existing SXM/SXD rows (all test data — the owner said so) are converted to the new shape:
--      a cond-supernumerary row ⇒ the SN presence row; an extraction on SX ⇒ SN presence row + the
--      same extraction on WHOLE of the code; their sessions ⇒ the code + WHOLE; teeth_status_history
--      the same way (with the history trigger paused so the conversion does not write SX events back).
--
-- ROLLBACK: re-apply the two surface checks from migrations/209_denture_clasps.sql /
--           migrations/176_supernumerary_surface.sql and the perio check (11–48). Converted rows
--           are test data and are not converted back.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- the canonical code of the old anchors (surface SXM = the host's mesial gap · SXD = its distal side)
CREATE OR REPLACE FUNCTION pg_temp.sup226_code(p_tooth TEXT, p_surface TEXT) RETURNS INT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_surface = 'SXM' THEN
      CASE WHEN h % 10 = 1 AND (h / 10) IN (2, 3, 6, 7)
           THEN (CASE WHEN (h / 10) % 2 = 0 THEN (h / 10) - 1 ELSE (h / 10) + 1 END) * 100 + 11
           ELSE h * 10 + 1 END
    WHEN p_surface = 'SXD' THEN
      CASE WHEN ((h / 10) >= 5 AND h % 10 = 5) OR ((h / 10) <= 4 AND h % 10 = 8)
           THEN h * 10 + 2
           ELSE (h + 1) * 10 + 1 END
  END
  FROM (SELECT NULLIF(btrim(p_tooth), '')::INT AS h) x
$$;

ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.perio_measurements DROP CONSTRAINT IF EXISTS perio_measurements_tooth_num_check;

ALTER TABLE public.teeth_status DISABLE TRIGGER trg_teeth_status_history;

-- (4a) presence rows for every anchored supernumerary
INSERT INTO public.teeth_status (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at)
SELECT DISTINCT ON (t.doctor_id, t.patient_id, pg_temp.sup226_code(t.tooth_num, t.surface))
       t.doctor_id, t.patient_id, pg_temp.sup226_code(t.tooth_num, t.surface)::TEXT, 'SN', 'sup-present', 'existing_current', NULL, NULL
  FROM public.teeth_status t
 WHERE t.surface IN ('SXM', 'SXD')
ON CONFLICT (doctor_id, patient_id, tooth_num, surface) DO NOTHING;

-- (4b) an extraction (or any treatment) that was on the anchor moves to WHOLE of the code
INSERT INTO public.teeth_status (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, unit_id, dx_key)
SELECT t.doctor_id, t.patient_id, pg_temp.sup226_code(t.tooth_num, t.surface)::TEXT, 'WHOLE', t.treatment_key, t.status, t.provider_id, t.review_at, t.unit_id, t.dx_key
  FROM public.teeth_status t
 WHERE t.surface IN ('SXM', 'SXD') AND t.treatment_key IS DISTINCT FROM 'cond-supernumerary'
ON CONFLICT (doctor_id, patient_id, tooth_num, surface) DO NOTHING;

DELETE FROM public.teeth_status WHERE surface IN ('SXM', 'SXD');

-- (4c) the sessions of those extractions
UPDATE public.ledger_sessions
   SET tooth_num = pg_temp.sup226_code(tooth_num, surface)::TEXT,
       surface   = 'WHOLE',
       type      = regexp_replace(COALESCE(type, ''), ' — سن زائد (إنسي|وحشي)$', '')
 WHERE surface IN ('SXM', 'SXD');

-- (4d) the chart history, so the «historical view» draws the same tooth
UPDATE public.teeth_status_history
   SET tooth_num     = pg_temp.sup226_code(tooth_num, surface)::TEXT,
       surface       = CASE WHEN treatment_key = 'cond-supernumerary' THEN 'SN' ELSE 'WHOLE' END,
       status        = CASE WHEN treatment_key = 'cond-supernumerary' THEN 'existing_current' ELSE status END,
       treatment_key = CASE WHEN treatment_key = 'cond-supernumerary' THEN 'sup-present' ELSE treatment_key END
 WHERE surface IN ('SXM', 'SXD');

ALTER TABLE public.teeth_status ENABLE TRIGGER trg_teeth_status_history;

-- (1) SN in, SXM/SXD out
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_surface_check
  CHECK (
    ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SN'::text, 'DENTURE'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

-- (2) sessions: SXM/SXD out (SN is a presence row only — never a session)
ALTER TABLE public.ledger_sessions ADD CONSTRAINT ledger_sessions_surface_check
  CHECK (
    surface IS NULL
    OR ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

-- (3) perio: the FDI permanent teeth, or a supernumerary code of a permanent host
ALTER TABLE public.perio_measurements ADD CONSTRAINT perio_measurements_tooth_num_check
  CHECK (
    (tooth_num >= 11 AND tooth_num <= 48)
    OR (tooth_num >= 111 AND tooth_num <= 484
        AND tooth_num % 10 BETWEEN 1 AND 4
        AND (tooth_num / 10) % 10 BETWEEN 1 AND 8
        AND tooth_num / 100 BETWEEN 1 AND 4)
  );

COMMIT;
