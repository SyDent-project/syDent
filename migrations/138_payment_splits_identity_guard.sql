-- Migration 138: هويةُ التوزيعات مفروضةٌ بالقاعدة لا بالعميل وحده.
-- Why: محرّك التوزيع (FIFO) يعمل بالمتصفح، والقاعدة كانت تحمي العملة فقط (Migration 125)
-- ولا تفرض «مجموع توزيعات الدفعة = مبلغها». فحص 13 أيلول 2026 وجد دفعتين بلا توزيع
-- (شُفيتا بالعميل v262)، والادّعاء «نظيف» بقي موصوفاً لا مُراقَباً. هذا القيد يجعل أي
-- حالة تخالف الهوية مرفوضةً عند الإيداع (COMMIT)، أياً كان كاتبها (عميل قديم، SQL يدوي، RPC).
--
-- ما يُفرض (لكل دفعة تأثّرت توزيعاتها، عند الإيداع):
--   • إن وُجد توزيعٌ واحد على الأقل ⇒ مجموع التوزيعات = مبلغ الدفعة (±0.005)
--   • عملة كل توزيع = عملة الدفعة، ومريضه وطبيبه = مريض الدفعة وطبيبها
--   • لا مبلغ سالب، ولا رصيد مقدّم (is_unearned) مربوط بجلسة
-- ما لا يُفرض هنا عمداً (تكسره مسارات العميل الشرعية لأنها تنفَّذ على معاملتين):
--   • «صفر توزيعات» مسموح — حالة الحفظ بلا اتصال/المسار القديم، ويشفيها العميل عند فتح البطاقة
--   • ربط التوزيع بجلسة مكتملة بعملته وضمن كلفتها — يُحرس ليلياً بـfinance-integrity (CI)
--     لأن حذف الجلسة يصفّر session_id (FK SET NULL) قبل إعادة التوزيع بمعاملةٍ ثانية.
-- لماذا DEFERRABLE INITIALLY DEFERRED: realloc_patient_splits تحذف ثم تُدرج بمعاملة
-- واحدة؛ الفحص عند الإيداع يرى الحالة النهائية لا الوسطى. المسار القديم (DELETE ثم
-- INSERT بمعاملتين) يمرّ أيضاً: بعد الحذف صفرُ توزيعات (مسموح)، وبعد الإدراج المجموعُ كامل.
-- تحقّق حي قبل التطبيق (13 أيلول 2026): صفر صفوف تخالف أياً من البنود أعلاه.

CREATE OR REPLACE FUNCTION public.sydent_split_identity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pid  uuid := COALESCE(NEW.payment_id, OLD.payment_id);
  v_pay  public.ledger_payments%ROWTYPE;
  v_n    integer;
  v_sum  numeric;
  v_bad  text;
BEGIN
  IF v_pid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_pay FROM public.ledger_payments WHERE id = v_pid;
  IF NOT FOUND THEN RETURN NULL; END IF;          -- الدفعة حُذفت (CASCADE) — لا شيء يُفحص

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_n, v_sum
  FROM public.payment_splits WHERE payment_id = v_pid;
  IF v_n = 0 THEN RETURN NULL; END IF;            -- حالة «بلا توزيع» مسموحة (تُشفى بالعميل)

  IF abs(v_sum - v_pay.amount) > 0.005 THEN
    RAISE EXCEPTION 'split_sum_mismatch: payment % splits=% amount=%', v_pid, v_sum, v_pay.amount
      USING ERRCODE = '23514';
  END IF;

  SELECT s.id::text INTO v_bad FROM public.payment_splits s
  WHERE s.payment_id = v_pid
    AND (COALESCE(s.currency, 'SYP') <> COALESCE(v_pay.currency, 'SYP')
      OR s.patient_id IS DISTINCT FROM v_pay.patient_id
      OR s.doctor_id  IS DISTINCT FROM v_pay.doctor_id
      OR s.amount < 0
      OR (s.is_unearned = true AND s.session_id IS NOT NULL))
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'split_identity_mismatch: split % of payment %', v_bad, v_pid
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sydent_split_identity_check() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_split_identity ON public.payment_splits;
CREATE CONSTRAINT TRIGGER trg_split_identity
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.sydent_split_identity_check();
