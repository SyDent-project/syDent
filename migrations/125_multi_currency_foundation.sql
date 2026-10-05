-- Migration 125 — أساس تعدد العملات (ل.س / $) — الطبقة الصامتة (دفعة 0)
-- ═══════════════════════════════════════════════════════════════════════════
-- العقد الدلالي (من خطة الجلسة):
--   1) كل صف مالي يحمل عملته ('SYP' أو 'USD')، وتُقفل لحظة التسجيل بجداول الدفتر.
--   2) الدفعة تسوّي ذمّة بنفس عملتها حصراً — الجدار مفروض بتريغر payment_splits.
--   3) صفر جمع عابر للعملات — العملة بُعد قسمة (partition) فوق كل المعادلات.
--   4) بلا سعر صرف وبلا تحويل — المبالغ تُخزَّن بوحدة عملتها كما هي.
--
-- تصميم «الاشتقاق لا الرفض»: العمود بلا DEFAULT ثابت؛ تريغر BEFORE يشتق العملة
--   من clinic_settings.currency للمالك عند غيابها (الكلاينت القديم صحيح بالبناء
--   — بما فيه طابور الأوفلاين وRPC إعادة التوزيع). BEFORE triggers تعمل قبل فحص
--   NOT NULL فالتركيبة (تريغر + NOT NULL بلا default) آمنة ومقصودة.
-- payment_splits: العملة تُشتق دائماً من دفعة الـsplit (المصدر الموثوق)، ويُرفض
--   أي تخصيص لجلسة بعملة مخالفة (split_currency_mismatch) — جدار الخلط بالـDB.
-- التوسيع bigint→NUMERIC(14,2): تمهيد كسور الدولار (يبقى المخزون الحالي أعداداً
--   صحيحة حتى دفعة 3، فقارئ parseInt القديم سليم بنافذة الانتقال).
-- الحالة الحيّة وقت الصياغة: 9 عيادات (7 SYP + 2 USD؛ إحدى الدولاريتين لديها
--   10 جلسات + 3 دفعات + 10 splits) — الـbackfill يورّثها USD بالمِلكية لا بالافتراض.
-- idempotent: IF NOT EXISTS / DROP..IF EXISTS / CREATE OR REPLACE بكل البنود.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (أ) الأعمدة ─────────────────────────────────────────────────────────────
-- جداول الدفتر (حركات — العملة تُقفل):
ALTER TABLE public.ledger_sessions     ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.ledger_payments     ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.payment_splits      ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.account_adjustments ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.payment_plans       ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.expenses            ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.provider_payouts    ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.lab_orders          ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.lab_payments        ADD COLUMN IF NOT EXISTS currency TEXT;
-- جداول إعدادية (العملة صفة قابلة للتعديل — لا قفل):
ALTER TABLE public.inventory_items         ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.treatments              ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.treatment_price_history ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.clinic_doctors    ADD COLUMN IF NOT EXISTS salary_currency TEXT;
ALTER TABLE public.clinic_employees  ADD COLUMN IF NOT EXISTS salary_currency TEXT;
-- مفتاح الميزة (يحكم إظهار مبدّلات الإدخال فقط — لا يدخل أي معادلة):
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS multi_currency_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── (ب) Backfill: كل صف قائم يرث عملة عيادة مالكه (fallback SYP) ────────────
UPDATE public.ledger_sessions t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.ledger_payments t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.payment_splits t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.account_adjustments t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.payment_plans t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.lab_orders t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.lab_payments t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.treatments t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.doctor_id AND t.currency IS NULL;
UPDATE public.expenses t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.currency IS NULL;
UPDATE public.provider_payouts t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.currency IS NULL;
UPDATE public.inventory_items t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.currency IS NULL;
UPDATE public.treatment_price_history t SET currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.currency IS NULL;
UPDATE public.clinic_doctors t SET salary_currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.salary_currency IS NULL;
UPDATE public.clinic_employees t SET salary_currency = upper(cs.currency)
  FROM public.clinic_settings cs WHERE cs.owner_id = t.owner_id AND t.salary_currency IS NULL;
-- مالك بلا صف clinic_settings (المسار الكسول لم يزره بعد) → SYP:
UPDATE public.ledger_sessions     SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.ledger_payments     SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.payment_splits      SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.account_adjustments SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.payment_plans       SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.expenses            SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.provider_payouts    SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.lab_orders          SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.lab_payments        SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.inventory_items         SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.treatments              SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.treatment_price_history SET currency = 'SYP' WHERE currency IS NULL;
UPDATE public.clinic_doctors   SET salary_currency = 'SYP' WHERE salary_currency IS NULL;
UPDATE public.clinic_employees SET salary_currency = 'SYP' WHERE salary_currency IS NULL;

-- ── (ج) NOT NULL + CHECK ───────────────────────────────────────────────────
ALTER TABLE public.ledger_sessions     ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.ledger_payments     ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payment_splits      ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.account_adjustments ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payment_plans       ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.expenses            ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.provider_payouts    ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.lab_orders          ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.lab_payments        ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.inventory_items         ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.treatments              ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.treatment_price_history ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.clinic_doctors    ALTER COLUMN salary_currency SET NOT NULL;
ALTER TABLE public.clinic_employees  ALTER COLUMN salary_currency SET NOT NULL;

ALTER TABLE public.ledger_sessions     DROP CONSTRAINT IF EXISTS ledger_sessions_currency_valid;
ALTER TABLE public.ledger_sessions     ADD  CONSTRAINT ledger_sessions_currency_valid     CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.ledger_payments     DROP CONSTRAINT IF EXISTS ledger_payments_currency_valid;
ALTER TABLE public.ledger_payments     ADD  CONSTRAINT ledger_payments_currency_valid     CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.payment_splits      DROP CONSTRAINT IF EXISTS payment_splits_currency_valid;
ALTER TABLE public.payment_splits      ADD  CONSTRAINT payment_splits_currency_valid      CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.account_adjustments DROP CONSTRAINT IF EXISTS account_adjustments_currency_valid;
ALTER TABLE public.account_adjustments ADD  CONSTRAINT account_adjustments_currency_valid CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.payment_plans       DROP CONSTRAINT IF EXISTS payment_plans_currency_valid;
ALTER TABLE public.payment_plans       ADD  CONSTRAINT payment_plans_currency_valid       CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.expenses            DROP CONSTRAINT IF EXISTS expenses_currency_valid;
ALTER TABLE public.expenses            ADD  CONSTRAINT expenses_currency_valid            CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.provider_payouts    DROP CONSTRAINT IF EXISTS provider_payouts_currency_valid;
ALTER TABLE public.provider_payouts    ADD  CONSTRAINT provider_payouts_currency_valid    CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.lab_orders          DROP CONSTRAINT IF EXISTS lab_orders_currency_valid;
ALTER TABLE public.lab_orders          ADD  CONSTRAINT lab_orders_currency_valid          CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.lab_payments        DROP CONSTRAINT IF EXISTS lab_payments_currency_valid;
ALTER TABLE public.lab_payments        ADD  CONSTRAINT lab_payments_currency_valid        CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.inventory_items         DROP CONSTRAINT IF EXISTS inventory_items_currency_valid;
ALTER TABLE public.inventory_items         ADD  CONSTRAINT inventory_items_currency_valid         CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.treatments              DROP CONSTRAINT IF EXISTS treatments_currency_valid;
ALTER TABLE public.treatments              ADD  CONSTRAINT treatments_currency_valid              CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.treatment_price_history DROP CONSTRAINT IF EXISTS treatment_price_history_currency_valid;
ALTER TABLE public.treatment_price_history ADD  CONSTRAINT treatment_price_history_currency_valid CHECK (currency IN ('SYP','USD'));
ALTER TABLE public.clinic_doctors    DROP CONSTRAINT IF EXISTS clinic_doctors_salary_currency_valid;
ALTER TABLE public.clinic_doctors    ADD  CONSTRAINT clinic_doctors_salary_currency_valid   CHECK (salary_currency IN ('SYP','USD'));
ALTER TABLE public.clinic_employees  DROP CONSTRAINT IF EXISTS clinic_employees_salary_currency_valid;
ALTER TABLE public.clinic_employees  ADD  CONSTRAINT clinic_employees_salary_currency_valid CHECK (salary_currency IN ('SYP','USD'));

-- ── (د) توسيع الأنواع bigint → NUMERIC(14,2) (تمهيد كسور الدولار؛ بلا فقد) ──
ALTER TABLE public.payment_splits   ALTER COLUMN amount             TYPE numeric(14,2) USING amount::numeric;
ALTER TABLE public.expenses         ALTER COLUMN amount             TYPE numeric(14,2) USING amount::numeric;
ALTER TABLE public.provider_payouts ALTER COLUMN amount             TYPE numeric(14,2) USING amount::numeric;
ALTER TABLE public.provider_payouts ALTER COLUMN breakdown_salary   TYPE numeric(14,2) USING breakdown_salary::numeric;
ALTER TABLE public.provider_payouts ALTER COLUMN breakdown_share    TYPE numeric(14,2) USING breakdown_share::numeric;
ALTER TABLE public.provider_payouts ALTER COLUMN breakdown_bonus    TYPE numeric(14,2) USING breakdown_bonus::numeric;
ALTER TABLE public.lab_orders       ALTER COLUMN cost               TYPE numeric(14,2) USING cost::numeric;
ALTER TABLE public.lab_orders       ALTER COLUMN paid_to_lab        TYPE numeric(14,2) USING paid_to_lab::numeric;
ALTER TABLE public.inventory_items  ALTER COLUMN purchase_price     TYPE numeric(14,2) USING purchase_price::numeric;
ALTER TABLE public.payment_plans    ALTER COLUMN total              TYPE numeric(14,2) USING total::numeric;
ALTER TABLE public.payment_plans    ALTER COLUMN installment_amount TYPE numeric(14,2) USING installment_amount::numeric;
ALTER TABLE public.clinic_doctors   ALTER COLUMN monthly_salary     TYPE numeric(14,2) USING monthly_salary::numeric;
ALTER TABLE public.clinic_employees ALTER COLUMN monthly_salary     TYPE numeric(14,2) USING monthly_salary::numeric;
ALTER TABLE public.account_adjustments ALTER COLUMN amount          TYPE numeric(14,2) USING amount::numeric;
ALTER TABLE public.clinic_settings  ALTER COLUMN no_show_fee_amount TYPE numeric(14,2) USING no_show_fee_amount::numeric;

-- ── (هـ) تريغر الاشتقاق/القفل العام ─────────────────────────────────────────
-- TG_ARGV[0]=عمود المالك · TG_ARGV[1]=عمود العملة · TG_ARGV[2]='lock'|'nolock'
-- SECURITY DEFINER + search_path مثبَّت (نمط M116): قراءة clinic_settings تتجاوز
-- RLS عمداً كي لا يفشل الاشتقاق أبداً. الوصول الديناميكي للأعمدة عبر to_jsonb
-- والكتابة عبر jsonb_populate_record (لا وصول ديناميكياً مباشراً بـplpgsql).
CREATE OR REPLACE FUNCTION public.sydent_currency_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_col text := TG_ARGV[0];
  v_cur_col   text := TG_ARGV[1];
  v_lock      boolean := (TG_ARGV[2] = 'lock');
  v_owner     uuid;
  v_new_cur   text;
  v_old_cur   text;
  v_derived   boolean := false;
BEGIN
  v_new_cur := upper(NULLIF(btrim(COALESCE(to_jsonb(NEW)->>v_cur_col, '')), ''));

  IF TG_OP = 'UPDATE' THEN
    v_old_cur := upper(COALESCE(to_jsonb(OLD)->>v_cur_col, ''));
    IF v_lock AND v_new_cur IS NOT NULL AND v_old_cur <> ''
       AND v_new_cur <> v_old_cur THEN
      RAISE EXCEPTION 'currency_locked: % keeps its recorded currency (delete & re-create to correct)', TG_TABLE_NAME
        USING ERRCODE = '23514';
    END IF;
    IF v_new_cur IS NULL AND v_old_cur <> '' THEN
      v_new_cur := v_old_cur;   -- تحديث بلا عملة → إبقاء المسجَّلة (اجتازت الفحص سابقاً)
    END IF;
  END IF;

  IF v_new_cur IS NULL THEN
    -- إدراج بلا عملة → سلسلة اشتقاق ثلاثية:
    --   1) clinic_settings.currency (الحالة الاعتيادية)
    --   2) auth.users.raw_user_meta_data->>'currency' — نافذة التسجيل: بذر
    --      handle_new_doctor/handle_new_owner_doctor يسبق خلق صف clinic_settings
    --      الكسول (درس v181)، والعملة موجودة بالميتاداتا منذ M107.
    --   3) 'SYP'
    v_derived := true;
    v_owner := NULLIF(to_jsonb(NEW)->>v_owner_col, '')::uuid;
    SELECT upper(cs.currency) INTO v_new_cur
      FROM public.clinic_settings cs WHERE cs.owner_id = v_owner;
    IF v_new_cur IS NULL THEN
      SELECT upper(NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'currency','')), ''))
        INTO v_new_cur
        FROM auth.users u WHERE u.id = v_owner;
    END IF;
    v_new_cur := COALESCE(v_new_cur, 'SYP');
  END IF;

  IF v_new_cur NOT IN ('SYP','USD') THEN
    IF v_derived THEN
      v_new_cur := 'SYP';  -- ميتاداتا فاسدة لا تكسر التسجيل أبداً — fail-safe
    ELSE
      RAISE EXCEPTION 'currency_invalid: %', v_new_cur USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object(v_cur_col, v_new_cur));
  RETURN NEW;
END;
$$;

-- ── (و) تريغر payment_splits الخاص: اشتقاق من الدفعة + جدار تطابق الجلسة ────
CREATE OR REPLACE FUNCTION public.sydent_split_currency_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur      text;
  v_sess_cur text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'currency_locked: payment_splits keep their recorded currency'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: العملة تُشتق دائماً من دفعة الـsplit — المصدر الموثوق الوحيد
  -- (يغطي الكلاينت القديم وRPC realloc_patient_splits بلا تعديلهما).
  SELECT upper(lp.currency) INTO v_cur
    FROM public.ledger_payments lp WHERE lp.id = NEW.payment_id;
  IF v_cur IS NULL THEN
    SELECT upper(cs.currency) INTO v_cur
      FROM public.clinic_settings cs WHERE cs.owner_id = NEW.doctor_id;
    v_cur := COALESCE(v_cur, 'SYP');
  END IF;
  NEW.currency := v_cur;

  -- جدار الخلط: split على جلسة بعملة مخالفة = خطأ محاسبي يُرفض من الجذر.
  IF NEW.session_id IS NOT NULL THEN
    SELECT upper(ls.currency) INTO v_sess_cur
      FROM public.ledger_sessions ls WHERE ls.id = NEW.session_id;
    IF v_sess_cur IS NOT NULL AND v_sess_cur <> v_cur THEN
      RAISE EXCEPTION 'split_currency_mismatch: payment % cannot settle a % session', v_cur, v_sess_cur
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── (ز) تركيب التريغرات ─────────────────────────────────────────────────────
-- دفتر (lock):
DROP TRIGGER IF EXISTS trg_currency_ledger_sessions ON public.ledger_sessions;
CREATE TRIGGER trg_currency_ledger_sessions BEFORE INSERT OR UPDATE ON public.ledger_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_ledger_payments ON public.ledger_payments;
CREATE TRIGGER trg_currency_ledger_payments BEFORE INSERT OR UPDATE ON public.ledger_payments
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_account_adjustments ON public.account_adjustments;
CREATE TRIGGER trg_currency_account_adjustments BEFORE INSERT OR UPDATE ON public.account_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_payment_plans ON public.payment_plans;
CREATE TRIGGER trg_currency_payment_plans BEFORE INSERT OR UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_expenses ON public.expenses;
CREATE TRIGGER trg_currency_expenses BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_provider_payouts ON public.provider_payouts;
CREATE TRIGGER trg_currency_provider_payouts BEFORE INSERT OR UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_lab_orders ON public.lab_orders;
CREATE TRIGGER trg_currency_lab_orders BEFORE INSERT OR UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
DROP TRIGGER IF EXISTS trg_currency_lab_payments ON public.lab_payments;
CREATE TRIGGER trg_currency_lab_payments BEFORE INSERT OR UPDATE ON public.lab_payments
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','lock');
-- الدفتر الخاص (اشتقاق من الدفعة + جدار الجلسة):
DROP TRIGGER IF EXISTS trg_currency_payment_splits ON public.payment_splits;
CREATE TRIGGER trg_currency_payment_splits BEFORE INSERT OR UPDATE ON public.payment_splits
  FOR EACH ROW EXECUTE FUNCTION public.sydent_split_currency_guard();
-- إعدادي (nolock):
DROP TRIGGER IF EXISTS trg_currency_inventory_items ON public.inventory_items;
CREATE TRIGGER trg_currency_inventory_items BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','nolock');
DROP TRIGGER IF EXISTS trg_currency_treatments ON public.treatments;
CREATE TRIGGER trg_currency_treatments BEFORE INSERT OR UPDATE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','nolock');
DROP TRIGGER IF EXISTS trg_currency_treatment_price_history ON public.treatment_price_history;
CREATE TRIGGER trg_currency_treatment_price_history BEFORE INSERT OR UPDATE ON public.treatment_price_history
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','nolock');
DROP TRIGGER IF EXISTS trg_currency_clinic_doctors ON public.clinic_doctors;
CREATE TRIGGER trg_currency_clinic_doctors BEFORE INSERT OR UPDATE ON public.clinic_doctors
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','salary_currency','nolock');
DROP TRIGGER IF EXISTS trg_currency_clinic_employees ON public.clinic_employees;
CREATE TRIGGER trg_currency_clinic_employees BEFORE INSERT OR UPDATE ON public.clinic_employees
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','salary_currency','nolock');

-- ── (ح) realloc_patient_splits: الكاست الوحيد ::bigint → ::numeric ──────────
-- (وإلا كسور الدولار من دفعة 3 كانت سترفض بـinvalid input syntax.)
-- بلا عمود currency بقائمة الأعمدة عمداً: تريغر الاشتقاق يملؤه من الدفعة —
-- أوثق من الثقة بأي JSON قادم من الكلاينت. الدالة بذلك بلا أي تغيير آخر.
CREATE OR REPLACE FUNCTION public.realloc_patient_splits(p_patient_id uuid, p_splits jsonb DEFAULT '[]'::jsonb)
RETURNS SETOF public.payment_splits
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND doctor_id = v_owner
  ) THEN
    RAISE EXCEPTION 'patient_not_owned' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.payment_splits
  WHERE patient_id = p_patient_id
    AND doctor_id  = v_owner;

  RETURN QUERY
  INSERT INTO public.payment_splits
    (doctor_id, patient_id, payment_id, session_id, provider_id, amount, is_unearned, payment_date)
  SELECT
    v_owner,
    p_patient_id,
    (s->>'payment_id')::uuid,
    NULLIF(s->>'session_id',   '')::uuid,
    NULLIF(s->>'provider_id',  '')::uuid,
    COALESCE((s->>'amount')::numeric, 0),
    COALESCE((s->>'is_unearned')::boolean, false),
    NULLIF(s->>'payment_date', '')::date
  FROM jsonb_array_elements(COALESCE(p_splits, '[]'::jsonb)) AS s
  WHERE (s->>'payment_id') IS NOT NULL
  RETURNING *;
END;
$$;

-- ── (ط) تحصين (نمط M117): دوال التريغر لا تُستدعى عبر REST ──────────────────
REVOKE EXECUTE ON FUNCTION public.sydent_currency_guard()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sydent_split_currency_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.realloc_patient_splits(uuid, jsonb) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.sydent_currency_guard() IS
  'M125: يشتق عملة الصف من عملة العيادة عند غيابها ويقفلها بجداول الدفتر. args: owner_col, currency_col, lock|nolock';
COMMENT ON FUNCTION public.sydent_split_currency_guard() IS
  'M125: عملة الـsplit تُشتق من دفعته دائماً؛ يُرفض تخصيصها لجلسة بعملة مخالفة (جدار منع الخلط).';
COMMENT ON COLUMN public.clinic_settings.multi_currency_enabled IS
  'M125: يحكم إظهار مبدّلات العملة بالواجهة فقط — لا يدخل أي معادلة محاسبية.';

-- ── تحقّق (يُشغَّل بعد التطبيق عبر execute_sql) ─────────────────────────────
-- 1) صفر NULL بكل الأعمدة الأربعة عشر.
-- 2) توزيع العملات يطابق ملكية العيادتين الدولاريتين (sess=10 · pays=3 · splits=10).
-- 3) التريغرات الـ14 قائمة.
-- 4) بروبة BEGIN..ROLLBACK: إدراج بلا عملة → تُملأ من عملة العيادة؛
--    split على جلسة بعملة مخالفة → يُرفض بـsplit_currency_mismatch.
