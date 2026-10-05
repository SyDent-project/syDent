-- ============================================================
-- Migration 150 — ledger_sessions.units (عدد وحدات البند)
-- ------------------------------------------------------------
-- الهدف: تمييز «أشعة ×4» أو «جلسة تبييض ×3» عن بندٍ مفرد. عمود Curve «Units».
-- الحدّ الحاسم: **عرضيٌّ بحت** — `cost` يبقى **الإجمالي** المخزَّن كما هو اليوم،
--   فلا يدخل `units` FIFO ولا computeFinancials ولا أي جمعٍ مالي (قاعدة المالك #5
--   نفسها المطبَّقة على plan_option/phase). الضربُ يحدث بالواجهة لحظة الإدخال فقط.
-- وحدات الجسر مشتقّة من tooth_num («43,44,45» = 3) فلا تُخزَّن هنا.
-- الأثر: nullable · additive · idempotent · صفر RLS · صفر ترحيل (NULL = 1).
-- ============================================================

BEGIN;

ALTER TABLE public.ledger_sessions
  ADD COLUMN IF NOT EXISTS units smallint;

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_units_range;
ALTER TABLE public.ledger_sessions
  ADD CONSTRAINT ledger_sessions_units_range
  CHECK (units IS NULL OR (units >= 1 AND units <= 99));

COMMENT ON COLUMN public.ledger_sessions.units IS
  'عدد وحدات البند (أشعة ×4، جلسات تبييض ×3…). عرضيٌّ بحت: cost يبقى الإجمالي المخزَّن، فلا يدخل units أي حساب مالي (FIFO/computeFinancials). NULL أو 1 = وحدة واحدة.';

COMMIT;

-- ── Verification (Rule #238) ──
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ledger_sessions' AND column_name='units') AS col,     -- 1
  (SELECT count(*) FROM pg_constraint WHERE conname='ledger_sessions_units_range')                                                     AS chk,     -- 1
  (SELECT count(*) FROM public.ledger_sessions WHERE units IS NOT NULL)                                                                AS filled;  -- 0 قبل الاستخدام
