-- ============================================================
-- Migration 204 — ledger_sessions.unit_teeth (أسنان الجهاز المتحرك على جلسته)
-- ------------------------------------------------------------
-- الهدف (ج2-ب): جلسةُ الجهاز المتحرك جلسةُ فكٍّ (tooth_num NULL) وأسنانُها كانت تُعرف من صفوف المخطط
--   وحدها (teeth_status · surface='DENTURE' · unit_id = معرّف الجلسة). جهازٌ بديل عن جهازٍ مرسوم على
--   الأسنان نفسها، أو جهازٌ جديد مخطّط فوق جهازٍ قائم، لا صفوفَ له على المخطط (صفٌّ واحد لكل سن)
--   ⇒ أسنانُه تُحفظ على الجلسة نفسها: «14,15,16» بترقيم FDI تصاعدياً.
-- الحدّ الحاسم: **عرضيٌّ بحت** — لا يدخل FIFO ولا computeFinancials ولا أي جمعٍ مالي (قاعدة المالك #5،
--   نفسها المطبَّقة على plan_option/phase/units).
-- التعبئة: جلساتُ الأجهزة القائمة تأخذ أسنانَها من صفوف وحدتها — محصورةٌ بجلسات الفك التي لها صفوفُ
--   جهازٍ بمعرّفها، والعمودُ فارغ. لا مساس بأي جلسةٍ أخرى ولا بأي حقلٍ مالي.
-- الأثر: nullable · additive · idempotent · صفر RLS.
-- ============================================================

BEGIN;

ALTER TABLE public.ledger_sessions
  ADD COLUMN IF NOT EXISTS unit_teeth text;

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_unit_teeth_format;
ALTER TABLE public.ledger_sessions
  ADD CONSTRAINT ledger_sessions_unit_teeth_format
  CHECK (unit_teeth IS NULL OR (unit_teeth ~ '^[1-4][1-8](,[1-4][1-8]){0,15}$' AND tooth_num IS NULL));

COMMENT ON COLUMN public.ledger_sessions.unit_teeth IS
  'أسنان الجهاز المتحرك الذي تمثّله جلسةُ الفك (FDI تصاعدياً، «14,15,16»). عرضيٌّ بحت: لا يدخل أي حساب مالي. NULL لكل جلسةٍ ليست جهازاً متحركاً.';

UPDATE public.ledger_sessions s
   SET unit_teeth = d.teeth
  FROM (
    SELECT t.unit_id, string_agg(t.tooth_num, ',' ORDER BY t.tooth_num::int) AS teeth
      FROM public.teeth_status t
     WHERE t.surface = 'DENTURE' AND t.unit_id IS NOT NULL AND t.tooth_num ~ '^[1-4][1-8]$'
     GROUP BY t.unit_id
  ) d
 WHERE s.id = d.unit_id
   AND s.tooth_num IS NULL
   AND s.unit_teeth IS NULL;

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ledger_sessions' AND column_name='unit_teeth') AS col,   -- 1
  (SELECT count(*) FROM pg_constraint WHERE conname='ledger_sessions_unit_teeth_format')                                                         AS chk,   -- 1
  (SELECT count(*) FROM public.ledger_sessions WHERE unit_teeth IS NOT NULL)                                                                     AS filled; -- = جلسات الأجهزة القائمة
