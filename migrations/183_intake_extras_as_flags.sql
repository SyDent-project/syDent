-- ════════════════════════════════════════════════════════════════════
-- Migration 183 — الحالاتُ السبع الإضافية بالاستمارة صارت أعلاماً طبية (M87) — v621
-- Date: 12 October 2026 | Idempotent: yes | Applied via Supabase MCP
--
-- WHY (owner, from his phone): the intake asks about seven conditions the patient card did not
-- know (bisphosphonates · bleeding · infectious · epilepsy · thyroid · kidney_liver · smoker);
-- merging an intake wrote them into medical_flags_other as free text («مدخّن»). From v621 they are
-- MEDICAL_FLAGS_DEFS keys (ticked chips, badges, huddle) and the merge writes them as flags.
-- This migration moves the text already written by earlier merges: a part of medical_flags_other
-- (split on «،») that EXACTLY equals one of the seven labels becomes its key in medical_flags and
-- leaves the text; any other text stays untouched. No schema change (medical_flags is a JSONB array
-- with no key constraint) — the column comment is updated to the full key list.
-- ROLLBACK: not needed for safety (exact-label moves only); to reverse, append the labels back.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

WITH labels(k, l) AS (VALUES
  ('bisphosphonates','أدوية هشاشة العظام (بيسفوسفونات)'), ('bleeding','نزيف يصعب إيقافه'),
  ('infectious','مرض معدٍ (التهاب كبد وغيره)'), ('epilepsy','صرع'), ('thyroid','غدة درقية'),
  ('kidney_liver','أمراض كلى / كبد'), ('smoker','مدخّن')),
parts AS (
  SELECT p.id, t.ord, btrim(t.part) AS part, l.k
    FROM public.patients p
    CROSS JOIN LATERAL regexp_split_to_table(p.medical_flags_other, '،') WITH ORDINALITY AS t(part, ord)
    LEFT JOIN labels l ON l.l = btrim(t.part)
   WHERE COALESCE(p.medical_flags_other, '') <> ''
),
hit AS (SELECT DISTINCT id FROM parts WHERE k IS NOT NULL),
calc AS (
  SELECT h.id,
         (SELECT string_agg(part, '، ' ORDER BY ord) FROM parts x WHERE x.id = h.id AND x.k IS NULL AND x.part <> '') AS rest,
         (SELECT jsonb_agg(DISTINCT k) FROM parts x WHERE x.id = h.id AND x.k IS NOT NULL) AS add_keys
    FROM hit h
)
UPDATE public.patients p
   SET medical_flags = (
         SELECT COALESCE(jsonb_agg(DISTINCT v), '[]'::jsonb)
           FROM jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(p.medical_flags) = 'array' THEN p.medical_flags END, '[]'::jsonb) || c.add_keys) v),
       medical_flags_other = NULLIF(c.rest, '')
  FROM calc c
 WHERE p.id = c.id;

COMMENT ON COLUMN public.patients.medical_flags IS
  'مصفوفة JSONB من مفاتيح تحذيرات طبية ثابتة (MEDICAL_FLAGS_DEFS ×4 + الحساسيات): diabetes/hypertension/cardiac/anticoagulants/pregnancy/asthma/bisphosphonates/bleeding/infectious/epilepsy/thyroid/kidney_liver/smoker + penicillin_allergy/latex_allergy/anesthetic_allergy/nsaid_allergy. التسمياتُ بالواجهة وحدها (M87 · v621/M183).';

COMMIT;
