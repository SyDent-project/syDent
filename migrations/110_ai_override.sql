-- ============================================================================
-- Migration 110 — تجاوز الأدمن للذكاء الاصطناعي لكل حساب (per-account override)
-- ============================================================================
-- الطبقة الثالثة من بوابة الـAI، فوق:
--   (1) بوابة الخطة   : subscription_plans.entitlements.ai_features
--   (2) opt-in العيادة: clinic_settings.ai_features_enabled  ← غير قابلة للتجاوز
--   (3) هذا البند     : trial_requests.ai_override           ← تجاوز إداري فردي
--
-- المنطق المعتمد (ثلاثي الحالة):
--   NULL  → اتبع الخطة (السلوك الحالي حرفياً — وهو وضع كل الصفوف القائمة)
--   TRUE  → مفعّل دائماً (يتجاوز الخطة فقط، ولا يتجاوز opt-in العيادة)
--   FALSE → مطفأ دائماً (يغلب على الخطة حتى لو كانت تتضمّن الميزة)
--
-- نمط المنافسين (Stripe Entitlements + Schematic): الخطة تُعرِّف، والتجاوز
-- per-account مفهوم من الدرجة الأولى يُخزَّن على صف الحساب ويُقيَّم runtime
-- ويُفرَض سيرفر-سايد ويُدقَّق (من منح، متى).
--
-- additive/idempotent · معزول عن المالية · صفر تسريب anon
-- (trial_requests بلا أي سياسة anon — تحقُّق حيّ pg_policy قبل الكتابة).
-- ============================================================================

-- ── 1) العمود ───────────────────────────────────────────────────────────────
ALTER TABLE public.trial_requests
  ADD COLUMN IF NOT EXISTS ai_override BOOLEAN;

COMMENT ON COLUMN public.trial_requests.ai_override IS
  'تجاوز الأدمن لميزات الـAI لهذا الحساب: NULL=اتبع الخطة · TRUE=مفعّل (يتجاوز الخطة) · FALSE=مطفأ. لا يتجاوز opt-in العيادة (clinic_settings.ai_features_enabled) — الخصوصية غير قابلة للتجاوز.';

-- ── 2) توسيع قيد نوع الحدث للتدقيق (نمط M26/M27/M39: drop + re-add) ────────
-- كل القيم السابقة محفوظة حرفياً؛ القيمة الجديدة فقط: ai_override_set
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check CHECK (event_type IN (
    'accept','convert_monthly','convert_yearly','renew','extend',
    'shorten','enter_grace','reactivate','suspend','delete',
    'activate_permanent','convert_permanent_yearly','reject',
    'promote_to_admin','demote_from_admin',
    'plan_updated','template_updated',
    'convert_plan','plan_created','plan_deleted',
    'ai_override_set'  -- ⭐ Migration 110 (جديد)
  ));

-- ── 3) تحصين: المستأجر لا يمنح نفسه التجاوز عند التسجيل ────────────────────
-- سياسة الإدراج الذاتية القائمة تسمح للمستخدم بإنشاء صف طلبه (status='new').
-- بدون هذا القيد يستطيع مستأجر مُسيء إدراج صف بـ ai_override=true.
-- التحديث محصور أصلاً بسياسة "Admin all access" (is_platform_admin) — فلا
-- يوجد مسار تعديل للمستأجر. مسار التسجيل الحيّ (auth.html) لا يرسل العمود
-- إطلاقاً ⇒ القيمة NULL ⇒ يمرّ بلا أي تغيير سلوكي.
DROP POLICY IF EXISTS trial_requests_self_insert ON public.trial_requests;

CREATE POLICY trial_requests_self_insert
  ON public.trial_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    AND (status = 'new'::text)
    AND (ai_override IS NULL)
  );

-- ============================================================================
-- تحقّق (يُتوقَّع: t · 1 · t · t)
-- ============================================================================
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns
--           WHERE table_schema='public' AND table_name='trial_requests'
--             AND column_name='ai_override' AND data_type='boolean')      AS col_ok,
--   (SELECT count(*) FROM public.trial_requests WHERE ai_override IS NOT NULL) AS overrides_set,
--   (SELECT pg_get_constraintdef(oid) LIKE '%ai_override_set%'
--      FROM pg_constraint
--     WHERE conrelid='public.subscription_events'::regclass
--       AND conname='subscription_events_event_type_check')               AS ev_ok,
--   (SELECT pg_get_expr(polwithcheck, polrelid) LIKE '%ai_override IS NULL%'
--      FROM pg_policy
--     WHERE polrelid='public.trial_requests'::regclass
--       AND polname='trial_requests_self_insert')                         AS policy_ok;
-- ============================================================================
