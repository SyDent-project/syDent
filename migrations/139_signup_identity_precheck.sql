-- Migration 139: فحصُ توفّر هوية التسجيل (هاتف/بريد) قبل إنشاء حساب auth.
--
-- المشكلة (مُشخَّصة حيّاً 13 أيلول 2026): التسجيل بـauth.html خطوتان بلا معاملة —
--   (١) auth.signUp ينشئ auth.users، ثم (٢) العميل يُدرج صفّ trial_requests.
-- حين يفشل (٢) — أشهر سببٍ فهرسُ الهاتف الفريد M65/M67 (رقمٌ مسجَّل سلفاً) — يبقى
-- حسابُ auth **يتيماً بلا طلب تجربة**، والعميل يقول «تواصل مع الدعم». والأسوأ:
-- بوابةُ الدخول (auth.html + ensureAccountAccessible) تعامل «لا صفّ» على أنه
-- حسابٌ قديم موروث ⇒ fail-open ⇒ اليتيم يدخل التطبيق كاملاً بلا موافقة الأدمن
-- ولا خطة ولا ظهورٍ بلوحة الإدارة. القاعدةُ الحيّة تحمل يتيمَين حقيقيَّين بهذا
-- الصنف (رقمٌ واحد مكرَّر على حسابَي auth).
--
-- الحل بطبقتين: هذه الدالة تُغلق الباب **قبل** signUp (رسالةٌ ودّية ولا يتيم
-- يُخلق)، والعميل (supabase-init.js `tenantGateStatus`) يغلق fail-open: لا صفّ
-- ⇒ يعيد إنشاء الطلب من user_metadata بحالة 'new' (يظهر للأدمن) أو يرفض الدخول.
--
-- ما تفحصه (مرآةٌ حرفية لما يُفشل الإدراج/التسجيل فعلاً):
--   • phone_taken : trial_requests بنفس شرط فهرس trial_requests_phone_canon_active_uidx
--                   (normalize_phone · غير-مرفوض · غير فارغ).
--   • email_taken : auth.users (حيث يفشل signUp) أو trial_requests بشرط
--                   trial_requests_email_norm_active_uidx.
-- ما لا تفحصه عمداً: حساب auth يتيم بهاتفٍ ما (لا صفّ له) — حجبُ الرقم بسببه
-- يجعل «مسجَّل مسبقاً» بلا أثرٍ يراه الأدمن؛ اليتيمُ نفسه تحجبه بوابةُ الدخول.
--
-- الكشف عن الوجود مقبولٌ هنا لأنه مكشوفٌ أصلاً: signUp يعيد «already registered»
-- وفهرسُ 23505 يُترجَم «هذا الرقم مسجَّل مسبقاً». والدالةُ محدودةُ المعدّل بنفس
-- عدّادات M137 (_login_resolve_bump) بدلاءٍ مستقلة كي لا تُنقص حصّة الدخول.
-- التجاوز يرمي P0001 rate_limited والعميلُ يتدهور: يكمل signUp (الفهرس يبقى الحارس).

CREATE OR REPLACE FUNCTION public.signup_identity_available(p_phone text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone       text := btrim(coalesce(p_phone, ''));
  v_email       text := lower(btrim(coalesce(p_email, '')));
  v_digits      text;
  v_phone_taken boolean := false;
  v_email_taken boolean := false;
  v_hdr         json;
  v_ip          text;
BEGIN
  -- ── حدُّ معدّل (M137): لكل IP ولكل مُدخَل، بدلاء 'su-' مستقلة عن الدخول ──
  BEGIN
    v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_hdr := NULL;
  END;
  v_ip := coalesce(nullif(btrim(split_part(v_hdr->>'x-forwarded-for', ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'noip');
  PERFORM public._login_resolve_bump('su-ip:' || v_ip, 20, interval '10 minutes');
  PERFORM public._login_resolve_bump('su-in:' || md5(lower(regexp_replace(v_phone || '|' || v_email, '\s', '', 'g'))), 10, interval '10 minutes');

  -- ── الهاتف: نفس شرط الفهرس الفريد الحيّ حرفياً ──
  IF v_phone <> '' THEN
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    IF v_digits <> '' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.trial_requests
        WHERE phone IS NOT NULL AND phone <> ''
          AND status <> 'rejected'
          AND public.normalize_phone(phone) = public.normalize_phone(v_phone)
      ) INTO v_phone_taken;
    END IF;
  END IF;

  -- ── البريد: حيث يفشل signUp (auth.users) ثم فهرس trial_requests ──
  IF v_email <> '' THEN
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) INTO v_email_taken;
    IF NOT v_email_taken THEN
      SELECT EXISTS (
        SELECT 1 FROM public.trial_requests
        WHERE email IS NOT NULL AND email <> ''
          AND status <> 'rejected'
          AND lower(btrim(email)) = v_email
      ) INTO v_email_taken;
    END IF;
  END IF;

  RETURN jsonb_build_object('phone_taken', v_phone_taken, 'email_taken', v_email_taken);
END
$$;

REVOKE ALL ON FUNCTION public.signup_identity_available(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_identity_available(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.signup_identity_available(text, text) IS
  'M139: pre-signUp availability check (phone via normalize_phone on active trial_requests; email via auth.users + active trial_requests). Rate-limited per M137 buckets. Existence is already exposed by signUp/23505 paths.';

-- ── تحقّق (يُشغَّل يدوياً بعد التطبيق) ─────────────────────────────────────
-- SELECT public.signup_identity_available('0933223176', '');            -- phone_taken=true
-- SELECT public.signup_identity_available('0000000000', 'nobody@x.y');  -- كلاهما false
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'signup_identity_available';
-- SELECT count(*) FROM pg_policies WHERE tablename = 'trial_requests';  -- بلا تغيير (6)
