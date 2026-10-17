-- ═════════════════════════════════════════════════
-- Migration 179 — التشخيصُ يبقى تحت العلاج المخطّط على السطح نفسه (11 تشرين الأول 2026)
-- Idempotent: yes | Applied via Supabase MCP
--
-- المشكلة: مفتاحُ teeth_status صفٌّ واحدٌ لكل (طبيب، مريض، سن، سطح) ⇒ تخطيطُ حشوةٍ على سطحٍ
--   يحمل «تسوس» كان يكتب فوق صفّ الحالة فيمحو التشخيص نهائياً (الحالاتُ لا تُنشئ سطراً بالسجل)،
--   وحذفُ الحشوة المخطّطة يعيد السطح «سليماً».
-- المعيار: Dentrix Ascend — الحالةُ والإجراءُ سجلّان، الإجراءُ المخطّط يُرسم فوق الحالة، وعند
--   الإنجاز تُعلَّم الحالةُ «معالَجة» وتُظهرها الملاحظاتُ السريرية؛ Open Dental بنفس المبدأ.
-- الحل (قرار المالك «ابدا»): عمودُ dx_key على صفّ العلاج يحمل الحالات التي حلّ محلّها، بصيغة
--   «سطح:مفتاح» مفصولةً بفواصل (المركّبُ MOD يجمع حالاتِ حروفه فتُستعاد كلٌّ على سطحها).
--   زنادٌ BEFORE يحفظها **بالقاعدة** فيغطي كلَّ مسارات الكتابة (مفرد · دفعة · فحص أولي · upsert):
--     • صفٌّ بحالة 'condition' ⇒ dx_key = NULL (الحالةُ تحمل مفتاحها بنفسها).
--     • تحديثُ صفِّ حالةِ مكتبةٍ (cond-*) بعلاجٍ آخر ⇒ dx_key = 'السطح:الحالة' ما لم يُرسَل غيره.
--     • غيرُ ذلك يبقى dx_key كما هو (تغيّرُ الحالة مخطّط → منجز يحمله تلقائياً).
--   المراقبةُ القديمة على مفتاح علاجٍ (ليس cond-*) خارجُ النطاق عمداً — سلوكها كما كان.
-- صفر أثر مالي · صفر RLS جديدة (العمودُ على الجدول نفسه بسياساته) · السجلُّ التاريخي يحمل العمود.
-- ROLLBACK: DROP TRIGGER IF EXISTS trg_teeth_status_dx ON public.teeth_status;
--           DROP FUNCTION IF EXISTS public.fn_teeth_status_dx();
--           ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_dx_key_check;
--           ALTER TABLE public.teeth_status DROP COLUMN IF EXISTS dx_key;
--           ALTER TABLE public.teeth_status_history DROP COLUMN IF EXISTS dx_key;  (+ إعادة fn_teeth_status_history السابقة)
-- ═════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.teeth_status ADD COLUMN IF NOT EXISTS dx_key text;
ALTER TABLE public.teeth_status DROP CONSTRAINT IF EXISTS teeth_status_dx_key_check;
ALTER TABLE public.teeth_status ADD CONSTRAINT teeth_status_dx_key_check
  CHECK (dx_key IS NULL OR (length(dx_key) <= 400 AND dx_key ~ '^[A-Z0-9]+:cond-[a-z-]+(,[A-Z0-9]+:cond-[a-z-]+)*$'));
COMMENT ON COLUMN public.teeth_status.dx_key IS 'M179: diagnosis(es) this treatment row replaced on the same surface — "SURF:cond-key[,SURF:cond-key]". Kept through planned→completed; NULL on condition rows. Set by trg_teeth_status_dx; the client sends it only for composite saves that subsume component condition rows.';

ALTER TABLE public.teeth_status_history ADD COLUMN IF NOT EXISTS dx_key text;

CREATE OR REPLACE FUNCTION public.fn_teeth_status_dx() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'condition' THEN
    NEW.dx_key := NULL;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'condition'
        AND OLD.treatment_key LIKE 'cond-%'
        AND NEW.treatment_key IS DISTINCT FROM OLD.treatment_key
        AND NEW.dx_key IS NULL THEN
    NEW.dx_key := OLD.surface || ':' || OLD.treatment_key;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_teeth_status_dx ON public.teeth_status;
CREATE TRIGGER trg_teeth_status_dx BEFORE INSERT OR UPDATE ON public.teeth_status
  FOR EACH ROW EXECUTE FUNCTION public.fn_teeth_status_dx();

CREATE OR REPLACE FUNCTION public.fn_teeth_status_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.doctor_id) THEN
      RETURN OLD;
    END IF;
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (OLD.doctor_id, OLD.patient_id, OLD.tooth_num, OLD.surface, OLD.treatment_key, OLD.status, OLD.provider_id, OLD.review_at, OLD.dx_key, 'D');
    RETURN OLD;
  ELSE
    INSERT INTO teeth_status_history
      (doctor_id, patient_id, tooth_num, surface, treatment_key, status, provider_id, review_at, dx_key, op)
    VALUES
      (NEW.doctor_id, NEW.patient_id, NEW.tooth_num, NEW.surface, NEW.treatment_key, NEW.status, NEW.provider_id, NEW.review_at, NEW.dx_key,
       CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.fn_teeth_status_dx() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verification (Rule #238) ──
-- SELECT column_name FROM information_schema.columns WHERE table_name IN ('teeth_status','teeth_status_history') AND column_name = 'dx_key';  -- 2 rows
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.teeth_status'::regclass AND tgname = 'trg_teeth_status_dx';  -- 1 row
