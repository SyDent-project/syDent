-- ============================================================
-- Migration 152 — teeth_status: سطحٌ محجوز 'COND' للحالات السريرية
-- ------------------------------------------------------------
-- الهدف: مكتبةُ «الحالات السريرية» (كسر · حساسية · قلح · ارتداد لثوي · جذر متبقٍ ·
--        انطمار · خراج) تُسجَّل على مستوى السن بلا أن تزاحم صفَّ علاجٍ قائم.
-- المشكلة: مفتاحُ teeth_status الأساسي = (doctor, patient, tooth_num, **surface**)
--        ⇒ حالةٌ على السن كاملاً كانت ستحتلّ 'WHOLE' فتدهس القلع/الزرع/الأشعة،
--        و'CROWN_FULL' محجوزٌ للتيجان.
-- الحل: سطحٌ محجوزٌ خاصٌّ بها — نفس سابقة 'SPACER' (M61) و'SOCKET' (M63):
--        السطحُ وسمٌ سريريٌّ بحت، صفر أثرٍ مالي (صفُّ الحالة لا يُنشئ سطراً بالسجل
--        إطلاقاً — الحالة تُحفظ بـstatus='condition' وبتكلفةٍ صفرية مقفلة).
-- المراجعة: Dentrix — أكوادُ الحالات «تعمل مثل بقية الأكواد لكنها لا تظهر بدفتر
--        الحسابات»؛ Curve/SoftDent — «الحالات السريرية لا تُرحَّل كحركات مالية»؛
--        Dentrix Ascend — مفرداتُ رموزٍ مستقلة للحالات (نخر · قلح · خراج · انطمار…).
-- الأسطحُ السنّية (بقعة بيضاء · تماس مفتوح) تبقى على سطحها الحقيقي (M/O/D…) كما هي.
-- الأثر: additive · idempotent · صفر عمود · صفر صف · صفر RLS · صفر أثر مالي.
-- ============================================================

BEGIN;

ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_surface_check
  CHECK (
    ((surface ~ '^M?[OI]?D?B?L?V?$'::text) AND (surface <> ''::text))
    OR (surface = ANY (ARRAY[
      'WHOLE'::text, 'PONTIC'::text, 'CROWN_FULL'::text, 'BRIDGE'::text,
      'SPACER'::text, 'SOCKET'::text, 'COND'::text,
      'R1'::text, 'R2'::text, 'R3'::text,
      'R1R2'::text, 'R1R3'::text, 'R2R3'::text, 'R1R2R3'::text
    ]))
  );

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT pg_get_constraintdef(oid) LIKE '%''COND''%' AS has_cond      -- true
--   FROM pg_constraint
--  WHERE conrelid = 'public.teeth_status'::regclass
--    AND conname  = 'teeth_status_surface_check';
--
-- SELECT count(*) AS cond_rows FROM public.teeth_status WHERE surface = 'COND';   -- 0 مباشرةً بعد الهجرة

-- ── Rollback ──
-- الصفوفُ ذات surface='COND' تُحذف أولاً، ثم يُعاد القيد بلا 'COND'.
