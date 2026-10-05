// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — session-utils.mjs · دوال نقية لسكّ جلسة الاختبار
// ════════════════════════════════════════════════════════════════════════
// لماذا هذا الملف منفصل عن global-setup.ts:
//   الدوال هنا نقية (بلا شبكة، بلا Playwright) فتُبرهَن بـ node مباشرة
//   (منهجية «برهان Node على الكود الحي») بينما global-setup يتولّى الشبكة.
//
// عقد التخزين (المصدر: supabase-init.js سطر ~721-727 + currentUid ~133):
//   createClient({ auth: { storage: localStorage, storageKey: 'sydent.auth' } })
//   supabase-js v2 يخزّن كائن الجلسة *مباشرة* تحت المفتاح:
//     { access_token, token_type, expires_in, expires_at, refresh_token, user }
//   وقارئا الجلسة بالمنصة (currentUid / sydentLocalSessionUser) يقبلان
//   الشكل المباشر (s.user) أولاً — فهذا الشكل الكانوني الذي نُركّبه.
// ════════════════════════════════════════════════════════════════════════

export const STORAGE_KEY = 'sydent.auth';

// ── سياسة إعادة المحاولة (تصليب بعد رصد تقطّع حي) ──────────────────────
// السياق: بجلسة ب١ فشلت المحاولة #3 من ثلاث تشغيلات بنفس الكومِت والسرّ
// بـ 403 bad_jwt («unrecognized JWT kid <nil> for algorithm ES256») على
// /admin/generate_link، بينما #1 و#2 نجحتا. رفضٌ من طرف Supabase لا انهيار
// بكودنا. النتيجة غير حتمية ⇒ إعادة محاولة قصيرة مبرَّرة.
//
// ⚠️ صراحةً: هذا **إصلاح مرجَّح + مسبار تشخيصي** لا حلٌّ مؤكَّد. إن ثبت أن
// التقطّع يدوم دقائق (لا لحظات) فلن تنقذه الإعادة، ويُنتقل لمسار آخر
// (مفتاح سرّي مخصص للاختبار أو مراجعة إعدادات JWT للمشروع). لذلك
// global-setup يسجّل كل محاولة بصوت عالٍ: حتى الفشل يورّث معلومة حاسمة.

/**
 * هل يستحق رمز الحالة إعادة محاولة؟
 * 403 (التقطّع المرصود) · 5xx (خلل مؤقت) · 0 (فشل شبكة) فقط.
 * 401 (سرّ خاطئ) و404 (مستخدم غير موجود) و422 أخطاء حقيقية — لا تُعاد
 * كي لا نُخفي خطأ إعداد وراء تأخير.
 */
export function shouldRetryAuth(status) {
  // حارس صريح: Number(null) === 0، فبلا هذا السطر تُصنَّف null «فشل شبكة»
  // وتُعاد المحاولة على قيمة غير معروفة (أمسكه المثبت).
  if (status === null || status === undefined || status === '') return false;
  const s = Number(status);
  if (!Number.isFinite(s)) return false;
  if (s === 0 || s === 403) return true;
  return s >= 500 && s <= 599;
}

/** فترات الانتظار بين المحاولات (ms). الطول+1 = أقصى عدد محاولات. */
export function backoffDelays() {
  return [1000, 3000];
}

/** إخفاء السرّ بالسجلات: يُبقي البادئة فقط للتشخيص. */
export function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '(empty)';
  const cut = v.indexOf('_', v.indexOf('_') + 1);
  const prefix = cut > 0 ? v.slice(0, cut + 1) : v.slice(0, 4);
  return prefix + '…(' + v.length + ' chars)';
}

/**
 * يفكّك access_token/refresh_token من عنوان redirect الذي يرجعه
 * GET action_link (نمط «نقرة رابط الإيميل»): التوكنات تصل بالـ #fragment
 * (النمط الضمني implicit). يقبل أيضاً صيغة query كاحتياط دفاعي.
 * يرجّع { access_token, refresh_token, expires_in } أو null.
 */
export function parseTokensFromLocation(location) {
  if (!location || typeof location !== 'string') return null;
  const hashIdx = location.indexOf('#');
  const qIdx = location.indexOf('?');
  const raw = hashIdx >= 0 ? location.slice(hashIdx + 1)
            : qIdx >= 0 ? location.slice(qIdx + 1)
            : '';
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  const expires_in = parseInt(params.get('expires_in') || '3600', 10) || 3600;
  return { access_token, refresh_token, expires_in };
}

/**
 * يركّب كائن الجلسة بالصيغة التي يتوقعها supabase-js v2 تحت storageKey.
 * expires_at يُشتق من الساعة الحالية إن لم يصل صريحاً — الكلاينت يجدّد
 * تلقائياً عبر refresh_token (غير محكوم بالكابتشا) فالدقة الثانوية تكفي.
 */
export function composeStoredSession(tokens, user, nowMs) {
  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    throw new Error('composeStoredSession: missing tokens');
  }
  if (!user || !user.id) {
    throw new Error('composeStoredSession: missing user');
  }
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const expires_in = tokens.expires_in || 3600;
  const expires_at = tokens.expires_at || Math.floor(now / 1000) + expires_in;
  return {
    access_token: tokens.access_token,
    token_type: 'bearer',
    expires_in,
    expires_at,
    refresh_token: tokens.refresh_token,
    user
  };
}

/**
 * يبني كائن storageState بصيغة Playwright الرسمية:
 * { cookies: [], origins: [{ origin, localStorage: [{name,value}] }] }
 * الجلسة تُزرع بـ localStorage للأصل المحلي فيقرؤها العميل عند الإقلاع.
 */
export function buildStorageState(origin, session) {
  if (!origin || !/^https?:\/\//.test(origin)) {
    throw new Error('buildStorageState: origin must be an http(s) URL');
  }
  if (!session || !session.access_token || !session.user) {
    throw new Error('buildStorageState: invalid session');
  }
  return {
    cookies: [],
    origins: [
      {
        origin: origin.replace(/\/+$/, ''),
        localStorage: [
          { name: STORAGE_KEY, value: JSON.stringify(session) }
        ]
      }
    ]
  };
}
