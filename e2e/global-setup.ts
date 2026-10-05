// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — global-setup.ts · سكّ جلسة مستأجر الاختبار (بلا Turnstile)
// ════════════════════════════════════════════════════════════════════════
// لماذا هذا المسار (القرار الموثّق بـ e2e/README.md):
//   حماية الكابتشا بـ Supabase «عامة» — تطال /token?grant_type=password —
//   فالدخول بكلمة السر برمجياً محجوب. مساران معفيان من الكابتشا:
//     1) POST /auth/v1/admin/generate_link  (magiclink، بمفتاح السرّ)
//     2) استهلاك الرابط: POST /verify (token_hash) أو GET action_link
//        (redirect يحمل التوكنات بالـ #fragment — مسار «نقرة الإيميل»)
//   ثم refresh_token يجدّد الجلسة بلا كابتشا طوال التشغيلة.
//   صفر تعديل على كود الإنتاج، وصفر كلمة سر بالأسرار (E2E_EMAIL يكفي).
//
// الأسرار (env فقط — لا قيمة في أي ملف):
//   E2E_EMAIL                 إيميل «عيادة E2E الآلية» (tenant الاختبار)
//   E2E_SUPABASE_SECRET_KEY   المفتاح السري للمشروع (admin API)
// ════════════════════════════════════════════════════════════════════════
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTokensFromLocation,
  composeStoredSession,
  buildStorageState,
  shouldRetryAuth,
  backoffDelays,
  maskSecret
} from './lib/session-utils.mjs';

const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL || 'https://rycqzpdhxabpqrdgtdzg.supabase.co';
// المفتاح العلني (publishable) — علني بالتصميم، نفس قيمة supabase-init.js
const ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY || 'sb_publishable_7LjceYIlrRrHt86sLpCwPg_TlMO8VJu';
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8080';
// مهلة كل محاولة fetch بالإعداد — مرآة API_TIMEOUT_MS بـapi.mjs (عقد #310)
const SETUP_FETCH_TIMEOUT_MS = 10_000;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(HERE, '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'state.json');
const CTX_PATH = path.join(AUTH_DIR, 'ctx.json');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`E2E: secret ${name} is not set (GitHub Secrets / env)`);
  return v;
}

async function jsonOrThrow(res: Response, ctx: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) throw new Error(`E2E ${ctx}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch مع إعادة محاولة **صاخبة**: كل محاولة تُسجَّل بحالتها، وإن أنقذت
 * الإعادةُ الطلبَ فذلك يُقال صراحةً. الصخب مقصود — لو عاد التقطّع، السجل
 * وحده يحسم: هل الإعادة كافية أم يلزم مسار آخر (راجع تعليق session-utils).
 */
async function fetchWithRetry(url: string, init: RequestInit, ctx: string): Promise<Response> {
  const delays = backoffDelays();
  let last: Response | null = null;
  for (let i = 0; i <= delays.length; i++) {
    let res: Response;
    try {
      /* مهلة لكل محاولة (درس #310 — نفس عقد api.mjs): سوكيت يقبل الاتصال
         ويعلق بلا ردّ لا يُرفض أبداً، فبلا مهلة يتحوّل التعليق الخارجي إلى
         تعليقٍ أبديّ يقتله سقف الـjob (15m) بلا أي تشخيص — وهذا ما وقع
         فعلاً مرتين (19 آب 2026). بالمهلة يصير TimeoutError ⇒ يمسكه
         الـcatch أدناه كخطأ شبكة ⇒ الإعادة القائمة تنقذه أو يفشل باسمه. */
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(SETUP_FETCH_TIMEOUT_MS) });
    } catch (e: any) {
      // فشل شبكة = status 0 بسياستنا
      console.log(`E2E: ${ctx} attempt ${i + 1} → network error (${e?.message || e})`);
      if (i < delays.length && shouldRetryAuth(0)) { await sleep(delays[i]); continue; }
      throw e;
    }
    if (res.ok) {
      if (i > 0) console.log(`E2E: ${ctx} attempt ${i + 1} → HTTP ${res.status} ✓ (rescued by retry)`);
      else console.log(`E2E: ${ctx} attempt 1 → HTTP ${res.status} ✓`);
      return res;
    }
    last = res;
    const retryable = shouldRetryAuth(res.status) && i < delays.length;
    console.log(
      `E2E: ${ctx} attempt ${i + 1} → HTTP ${res.status}` +
      (retryable ? `, retrying in ${delays[i]}ms…` : ' (not retryable / attempts exhausted)')
    );
    if (!retryable) return res;
    await sleep(delays[i]);
  }
  return last as Response;
}

export default async function globalSetup(): Promise<void> {
  const EMAIL = requireEnv('E2E_EMAIL');
  const SECRET = requireEnv('E2E_SUPABASE_SECRET_KEY');
  const adminHeaders = {
    apikey: SECRET,
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json'
  };

  // بصمة تشخيصية (بلا كشف السرّ) — تحسم فوراً أي التباس بشكل المفتاح
  console.log(`E2E: key format = ${maskSecret(SECRET)} · project = ${SUPABASE_URL}`);

  // 1) رابط دخول لمستأجر الاختبار (magiclink — معفى من الكابتشا)
  const linkRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email: EMAIL })
  }, 'generate_link');
  const link = await jsonOrThrow(linkRes, 'generate_link');
  const props = link.properties || link; // GoTrue يرجّع الحقول تحت properties (وأشكال أقدم مسطّحة)
  const tokenHash: string | undefined = props.hashed_token;
  const actionLink: string | undefined = props.action_link || link.action_link;

  // 2) استهلاك الرابط → توكنات جلسة
  let tokens: { access_token: string; refresh_token: string; expires_in: number } | null = null;

  if (tokenHash) {
    // المسار الأساسي: POST /verify يرجّع الجلسة JSON مباشرة
    const vRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash })
    }, 'verify');
    if (vRes.ok) {
      const v = await vRes.json();
      if (v && v.access_token && v.refresh_token) {
        tokens = {
          access_token: v.access_token,
          refresh_token: v.refresh_token,
          expires_in: v.expires_in || 3600
        };
      }
    }
  }

  if (!tokens && actionLink) {
    // الاحتياط: مسار «نقرة الإيميل» — redirect يحمل التوكنات بالـ fragment
    const aRes = await fetch(actionLink, { redirect: 'manual', signal: AbortSignal.timeout(SETUP_FETCH_TIMEOUT_MS) });
    const loc = aRes.headers.get('location') || '';
    tokens = parseTokensFromLocation(loc);
  }

  if (!tokens) throw new Error('E2E: could not obtain session tokens from magic link');

  // 3) كائن المستخدم (يلزم للشكل المخزَّن — قارئا الجلسة بالمنصة يقرآن s.user)
  const uRes = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${tokens.access_token}` }
  }, 'get user');
  const user = await jsonOrThrow(uRes, 'get user');
  if (!user || !user.id) throw new Error('E2E: /user returned no id');

  // 4) تركيب الجلسة بصيغة sydent.auth + كتابة storageState
  const session = composeStoredSession(tokens, user);
  const state = buildStorageState(BASE_URL, session);
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  // 5) سياق للاختبارات: التنظيف يمرّ بجلسة المستأجر نفسها (لا service_role)
  //    فتبقى RLS هي الحارس وصلاحية الاختبار = صلاحية العيادة بالضبط.
  fs.writeFileSync(CTX_PATH, JSON.stringify({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    accessToken: tokens.access_token,
    ownerId: user.id
  }, null, 2));

  console.log(`E2E: session minted for tenant ${user.id.slice(0, 8)}… → ${STATE_PATH}`);
}
