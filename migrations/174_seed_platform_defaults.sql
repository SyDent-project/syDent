-- 174 — Seed platform defaults on a fresh project
--
-- db/schema.sql has no data, so the default rows that earlier migrations
-- seeded are missing on a fresh project. This file re-seeds them:
--   platform_settings keys (33, 42, 84, 105, 167) — support_email starts
--   empty instead of the previous owner's address; set it from admin.html.
--   notification_templates defaults (28_2); the login_url hint points at
--   sydent.app instead of the previous owner's GitHub Pages site.
-- Idempotent (ON CONFLICT DO NOTHING): never overwrites admin edits.

INSERT INTO public.platform_settings (key, value) VALUES
  ('support_phone', ''),
  ('support_email', ''),
  ('usd_report_rate', ''),
  ('shamcash_account', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES (
  'payment_instructions_ar',
  E'لإتمام الدفع، اختر إحدى الطرق التالية ثم تواصل معنا عبر واتساب لتأكيد التفعيل:\n\n'
  || E'• شام كاش: [أدخل رقم/معرّف المحفظة]\n'
  || E'• حوالة داخلية: [اسم المستلم + الفرع]\n'
  || E'• كرت بنك: [رقم الحساب / IBAN]\n'
  || E'• كاش: في مقر الشركة\n\n'
  || E'بعد التحويل، أرفق إشعار الدفع في رسالة الواتساب.'
)
ON CONFLICT (key) DO NOTHING;

-- ───── wa_welcome (login credentials, sent on accept) ────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_welcome',
  'whatsapp',
  'رسالة الترحيب',
  'تُرسَل بعد قبول طلب اشتراك الطبيب — تتضمّن بيانات الدخول الأوّليّة.',
  E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
  E'بيانات الدخول:\n' ||
  E'🔗 الرابط: {login_url}\n' ||
  E'👤 البريد: {email}\n' ||
  E'🔑 كلمة المرور: 0000\n\n' ||
  E'⚠️ يمكنك تغيير كلمة المرور من صفحة الإعدادات.\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب (بدون لقب — اللقب مُضمَّن في النص)"},
    {"key":"login_url","desc":"رابط الموقع (افتراضياً https://sydent.app)"},
    {"key":"email","desc":"البريد المُسجَّل أو phone@sydent.com"}
  ]'::jsonb,
  10
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_reminder (trial expiry warning) ────────────────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_reminder',
  'whatsapp',
  'تذكير انتهاء التجربة',
  'تُرسَل قبل انتهاء التجربة المجانية — لا تتضمّن بيانات الدخول (قد تكون مُعدَّلة).',
  E'مرحباً {name} 👋\n\n' ||
  E'هذه رسالة تذكير ودّية من SyDent 🦷\n\n' ||
  E'⏰ تجربتك المجانية تنتهي خلال {days_left} يوم بتاريخ {trial_end}.\n\n' ||
  E'للتمديد أو الاستفسار، يرجى التواصل معنا.\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب كما هو مسجَّل (يحتوي اللقب أصلاً)"},
    {"key":"days_left","desc":"عدد الأيام المتبقّية للتجربة"},
    {"key":"trial_end","desc":"تاريخ انتهاء التجربة بصيغة عربية طويلة"},
    {"key":"plan_name","desc":"اسم الخطة الحالية (متاح لكن غير مستخدم في النص الافتراضي)"}
  ]'::jsonb,
  20
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_suspended (placeholder — no button wired yet) ──────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_suspended',
  'whatsapp',
  'إشعار إيقاف الحساب',
  'placeholder — سيُربط بزر إشعار الإيقاف في Phase X3 محادثة 2.',
  E'مرحباً {name} 👋\n\n' ||
  E'نودّ إعلامك بأن حسابك في SyDent مُعلَّق مؤقتاً.\n\n' ||
  E'للاستفسار أو إعادة التفعيل، يرجى التواصل معنا.\n\n' ||
  E'شكراً لتفهّمك.',
  '[
    {"key":"name","desc":"اسم الطبيب كما هو مسجَّل (يحتوي اللقب أصلاً)"}
  ]'::jsonb,
  30
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_renewed (placeholder — no button wired yet) ────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_renewed',
  'whatsapp',
  'إشعار تجديد الاشتراك',
  'placeholder — سيُربط بزر إشعار التجديد في Phase X3 محادثة 2.',
  E'مرحباً د. {name} 👋\n\n' ||
  E'تم تجديد اشتراكك في SyDent ✅\n\n' ||
  E'📋 الخطة: {plan_name}\n' ||
  E'📅 صالح حتى: {trial_end}\n' ||
  E'💰 المبلغ: {price}\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب (بدون لقب — اللقب مُضمَّن في النص)"},
    {"key":"plan_name","desc":"اسم الخطة (شهري / سنوي / دائم)"},
    {"key":"trial_end","desc":"تاريخ نهاية الاشتراك الجديد"},
    {"key":"price","desc":"المبلغ المدفوع (نص حر، مثلاً ‎150,000 SYP)"}
  ]'::jsonb,
  40
) ON CONFLICT (code) DO NOTHING;

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) All 4 templates seeded:
--    SELECT code, title_ar, is_active, sort_order, length(body) AS body_len
--    FROM public.notification_templates
--    ORDER BY sort_order;
--    Expected: 4 rows (wa_welcome, wa_reminder, wa_suspended, wa_renewed)
--    All active=true, body_len 100..400 chars.
--
-- 2) Variables JSONB structure intact:
--    SELECT code, jsonb_array_length(variables) AS var_count
--    FROM public.notification_templates ORDER BY sort_order;
--    Expected: 3, 4, 1, 4 (sums to 12)
--
-- 3) Backfill detection — confirm Arabic chars not mangled:
--    SELECT code, substring(body, 1, 30) FROM public.notification_templates;
--    Expected: starts with 'مرحباً' for all 4
