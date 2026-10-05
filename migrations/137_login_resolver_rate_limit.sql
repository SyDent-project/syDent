-- Migration 137: rate-limit public.resolve_login_email (anon-callable SECURITY DEFINER).
-- Why: the resolver maps phone → the account's real auth email. It already answers a
-- synthesized {digits}@sydent.com for unknown phones (anti-existence-probe), but nothing
-- stopped bulk harvesting of real emails by iterating phone numbers. Turnstile guards
-- signInWithPassword, not this RPC. This adds a server-side sliding window:
--   • 30 calls / 10 min per client IP  (x-forwarded-for, first hop — set by the Supabase gateway)
--   • 10 calls / 10 min per input        (md5 of the normalized identifier)
-- On breach the function RAISES SQLSTATE 'P0001' (message 'rate_limited'). auth.html already
-- degrades on any RPC error: login → legacyTransform(), forgot-password → support hint.
-- Resolver logic itself is byte-identical to Migration 67; only the guard prelude is new.
-- STABLE → VOLATILE because the function now writes the counter table.

CREATE TABLE IF NOT EXISTS public.login_resolve_hits (
  bucket       text PRIMARY KEY,          -- 'ip:<addr>' | 'in:<md5>'
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL
);
ALTER TABLE public.login_resolve_hits ENABLE ROW LEVEL SECURITY;   -- no policies on purpose
REVOKE ALL ON public.login_resolve_hits FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public._login_resolve_bump(p_bucket text, p_limit integer, p_window interval)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.login_resolve_hits (bucket, window_start, hits)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET hits         = CASE WHEN login_resolve_hits.window_start < now() - p_window THEN 1 ELSE login_resolve_hits.hits + 1 END,
        window_start = CASE WHEN login_resolve_hits.window_start < now() - p_window THEN now() ELSE login_resolve_hits.window_start END
  RETURNING hits INTO v_hits;
  IF v_hits > p_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', HINT = 'too many login lookups; retry in a few minutes';
  END IF;
  IF random() < 0.02 THEN
    DELETE FROM public.login_resolve_hits WHERE window_start < now() - interval '1 hour';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._login_resolve_bump(text, integer, interval) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_input text)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_in     text := btrim(coalesce(p_input, ''));
  v_digits text;
  v_uid    uuid;
  v_email  text;
  v_hdr    json;
  v_ip     text;
BEGIN
  IF v_in = '' THEN
    RETURN v_in;
  END IF;

  -- ── M137 guard: per-IP and per-input sliding windows ───────────────────────
  BEGIN
    v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_hdr := NULL;
  END;
  v_ip := coalesce(nullif(btrim(split_part(v_hdr->>'x-forwarded-for', ',', 1)), ''), v_hdr->>'cf-connecting-ip', 'noip');
  PERFORM public._login_resolve_bump('ip:' || v_ip, 30, interval '10 minutes');
  PERFORM public._login_resolve_bump('in:' || md5(lower(regexp_replace(v_in, '\s', '', 'g'))), 10, interval '10 minutes');

  -- ── Phone-shaped input: digits + optional separators, and no '@' ──────────
  IF position('@' in v_in) = 0 AND v_in ~ '^[0-9+()\-\s]+$' THEN
    v_digits := regexp_replace(v_in, '\D', '', 'g');
    IF length(v_digits) = 0 THEN
      RETURN v_in;
    END IF;

    -- Format-agnostic match (Migration 67): normalize both stored + entered phone.
    SELECT user_id INTO v_uid
    FROM public.trial_requests
    WHERE phone IS NOT NULL
      AND public.normalize_phone(phone) = public.normalize_phone(v_in)
      AND status <> 'rejected'
      AND user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      IF v_email IS NOT NULL AND v_email <> '' THEN
        RETURN v_email;
      END IF;
    END IF;

    -- Fallback: synthesized identifier (anti-enumeration; signIn fails generically
    -- afterwards if the account does not actually exist).
    RETURN v_digits || '@sydent.com';
  END IF;

  -- ── Email-shaped input: authoritative canonical via auth.users ────────────
  v_email := lower(v_in);

  PERFORM 1 FROM auth.users WHERE lower(email) = v_email;
  IF FOUND THEN
    RETURN v_email;
  END IF;

  -- Indirect: trial_requests.email → user_id → auth.users.email
  -- (covers legacy rows where the two stores disagree).
  SELECT user_id INTO v_uid
  FROM public.trial_requests
  WHERE email IS NOT NULL
    AND lower(btrim(email)) = v_email
    AND status <> 'rejected'
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NOT NULL AND v_email <> '' THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Fallback: echo the lowercased input (signIn fails generically if not real).
  RETURN lower(v_in);
END$function$;
