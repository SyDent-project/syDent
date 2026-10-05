-- ═══════════════════════════════════════════════════════════════
-- Migration 106 — features_all (operator list) + heal corrupted rows
-- ─────────────────────────────────────────────────────────────
-- WHY: the plan editor gained reorder + hide/show controls. Hidden rows
-- were encoded INSIDE the existing `features` column as objects
-- ({t,h:true}). That was a design error: `features` is read by every
-- client, including browsers still serving an older cached bundle, and
-- those render an object as the literal text '[object Object]'. A
-- pre-existing save-time trim (String(s).trim() over the array) also
-- stringified hidden items, persisting '[object Object]' as a REAL
-- feature line on the public pricing page.
--
-- FIX — separate the two audiences into two columns:
--   features      (existing) → VISIBLE rows only, plain strings, in
--                  display order. Every reader keeps using it unchanged,
--                  old and new, so it can never carry an object again.
--   features_all  (new)      → the operator's FULL ordered list, hidden
--                  rows included, read ONLY by the admin plan editor.
--
-- This migration also HEALS rows already written by the buggy path:
--   • backfills features_all from the current features (objects kept, so
--     a hide that did survive is preserved)
--   • rewrites features to visible, non-blank plain strings
--   • drops '[object Object]' entries from BOTH columns — their original
--     text was overwritten by the stringify and cannot be recovered; the
--     operator simply retypes those lines.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + the backfill only fills NULLs +
-- the cleanup is a no-op once the arrays are already plain strings.
--
-- ROLLBACK:
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS features_all;
--   (features itself needs no rollback — visible-only plain strings is
--    exactly the shape it had before the feature shipped.)
-- ═══════════════════════════════════════════════════════════════

-- ---- 1. The operator-facing column ----
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS features_all JSONB;

COMMENT ON COLUMN public.subscription_plans.features_all IS
  'Migration 106: full ordered feature list for the admin editor. Item = plain string (visible) or {"t":"text","h":true} (hidden). NULL = never edited since the migration; the editor then falls back to features. Public pages must read `features`, never this column.';

COMMENT ON COLUMN public.subscription_plans.features IS
  'Visible feature lines only, plain JSON strings, in display order. Read by landing.html + subscription.html + the admin preview. Never store objects here: an older cached client renders them as [object Object].';

-- ---- 2. Backfill the full list from whatever features holds today ----
UPDATE public.subscription_plans
   SET features_all = features
 WHERE features_all IS NULL
   AND jsonb_typeof(features) = 'array';

-- ---- 3. Heal features_all: drop blanks and the unrecoverable placeholder ----
UPDATE public.subscription_plans p
   SET features_all = COALESCE((
         SELECT jsonb_agg(e ORDER BY ord)
           FROM jsonb_array_elements(p.features_all) WITH ORDINALITY AS x(e, ord)
          WHERE btrim(COALESCE(
                  CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'t' ELSE e #>> '{}' END, '')) NOT IN ('', '[object Object]')
       ), '[]'::jsonb)
 WHERE jsonb_typeof(features_all) = 'array';

-- ---- 4. Rebuild features as the VISIBLE projection, plain strings ----
UPDATE public.subscription_plans p
   SET features = COALESCE((
         SELECT jsonb_agg(to_jsonb(btrim(txt)) ORDER BY ord)
           FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'t' ELSE e #>> '{}' END AS txt,
                    (jsonb_typeof(e) = 'object' AND (e->>'h') = 'true')                    AS hidden,
                    ord
               FROM jsonb_array_elements(p.features_all) WITH ORDINALITY AS x(e, ord)
           ) q
          WHERE NOT hidden
            AND btrim(COALESCE(txt, '')) NOT IN ('', '[object Object]')
       ), '[]'::jsonb)
 WHERE jsonb_typeof(features_all) = 'array';

-- ── Verification (run after apply — Rule #238 tail) ──
-- expect: features_all_col = 1
--         rows_with_objects_in_features = 0   ← no client can print [object Object]
--         rows_with_placeholder          = 0   ← corrupted lines cleared
--         plans_total = plans_with_all         ← every row has its operator list
--         policies_total unchanged vs. pre-migration
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_plans'
       AND column_name = 'features_all')                                AS features_all_col,
  (SELECT COUNT(*) FROM public.subscription_plans p
     WHERE jsonb_typeof(p.features) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.features) e
                    WHERE jsonb_typeof(e) <> 'string'))                 AS rows_with_objects_in_features,
  (SELECT COUNT(*) FROM public.subscription_plans p
     WHERE jsonb_typeof(p.features) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.features) t
                    WHERE btrim(t) = '[object Object]'))                AS rows_with_placeholder,
  (SELECT COUNT(*) FROM public.subscription_plans)                      AS plans_total,
  (SELECT COUNT(*) FROM public.subscription_plans
     WHERE jsonb_typeof(features_all) = 'array')                        AS plans_with_all,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')        AS policies_total;

-- Eyeball the result (features = what visitors see, features_all = editor):
-- SELECT code, features, features_all
--   FROM public.subscription_plans ORDER BY sort_order;
