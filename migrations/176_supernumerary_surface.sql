-- ============================================================
-- Migration 176 — سطحان محجوزان 'SXM' / 'SXD' للسن الزائد (v580)
-- ------------------------------------------------------------
-- الهدف: «سن زائد» يُسجَّل حالةً سريرية على السن المجاور بجهته (إنسي/وحشي)، ويُقلع
--        بجلسةٍ حقيقية على السن المجاور نفسه بالسطح SX<الجهة> ⇒ الخطة والزيارات والمالية
--        والتقارير كأي قلع (treatment_key = علاجُ القلع بالكتالوج).
-- لماذا سطحٌ محجوز: على M/D كان المفتاحُ سيُقرأ تعبئةَ سطحٍ ويزاحم حشوةً إنسية؛ وعلى COND
--        كان سيحتلّ حالةَ السن (انطمار/خراج) ولا يسمح بزائدين على جهتيه. نفسُ سابقة
--        'SPACER' (M61) · 'SOCKET' (M63) · 'COND' (M152).
-- المراجعة: Dentrix/Open Dental يرقّمان السنَّ الزائد 51–82 كسنٍّ مستقل (خيار ب المؤجَّل)؛
--        هنا مرساةٌ على الجار بقرار المالك (5 ت١ 2026).
-- الأثر: additive · idempotent · صفر عمود · صفر صف · صفر RLS · صفر أثر مالي (السطحُ وسمٌ).
-- ============================================================

BEGIN;

ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_surface_check
  CHECK (
    ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SXM'::text, 'SXD'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.ledger_sessions ADD CONSTRAINT ledger_sessions_surface_check
  CHECK (
    surface IS NULL
    OR ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text, 'SXM'::text, 'SXD'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) LIKE '%''SXM''%' AS has_sx
--   FROM pg_constraint WHERE conname IN ('teeth_status_surface_check','ledger_sessions_surface_check');
