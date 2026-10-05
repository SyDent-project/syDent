-- Migration 78 — أكواد الجذور المركّبة (R1R2 / R1R3 / R2R3 / R1R2R3) لعلاجات العصب متعددة الجذور
-- ⚠️ خُذ snapshot منطقي أولاً (Free tier: لا backup تلقائي).
-- ⚠️ ترتيب التشغيل: snapshot → هذا الميغريشن → ثم انشر كود العميل المطابق.
--    هذا الميغريشن SUPERSET صارم لقيود Migration 63: يوسّع فقط مجموعة surface المسموحة
--    بإضافة الأكواد المركّبة للجذور. كل صف teeth_status / ledger_sessions موجود يبقى صالحاً؛
--    لا تُقرأ بيانات ولا تتغيّر ولا يُعاد التحقق منها. تطبيقه غير مرئي حتى يكتب العميل كوداً
--    مركّباً، فهو آمن قبل شحن الكود.
--
--   الغرض: قناة جذر الرحى (مثلاً) إجراء سريري واحد يشمل عدة جذور — يُخزَّن ككود مركّب واحد
--   ('R1R2R3') على صف واحد بسعر واحد، تماماً كنمط الأسطح المركّبة MOD (Migration 54).
--   surface يبقى تسمية سريرية بحتة: صفر أثر مالي (FIFO, splitIsEarned, اختبارات الهوية
--   A–E لا تقرأ surface). ملاحظة: teeth_status_history (M76) بلا CHECK على surface —
--   لا حاجة لتعديلها.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD → آمن لإعادة التشغيل.

BEGIN;

ALTER TABLE public.teeth_status   DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status   ADD  CONSTRAINT teeth_status_surface_check CHECK (
  (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','SOCKET',
                 'R1','R2','R3','R1R2','R1R3','R2R3','R1R2R3')
);

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.ledger_sessions ADD  CONSTRAINT ledger_sessions_surface_check CHECK (
  surface IS NULL
  OR (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','SOCKET',
                 'R1','R2','R3','R1R2','R1R3','R2R3','R1R2R3')
);

COMMIT;

-- تحقّق بعد التشغيل (لازم 'R1R2R3' تظهر بقائمة IN لكلا القيدين):
--   SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN ('teeth_status_surface_check','ledger_sessions_surface_check');
