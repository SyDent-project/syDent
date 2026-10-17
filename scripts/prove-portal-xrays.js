/* v638 — مثبتُ الأشعة ج4: صورُ الأشعة ببوابة المريض (M193 + Edge Function portal-xray).
   (١) القاعدة: المفتاحُ والمشاركةُ مطفآن افتراضياً · المشاركةُ لصور المتصفح فقط · الدالةُ لمفتاح الخدمة وحده وبنفس
       بوابات البوابة (توكن · إيقاف · انتهاء · العيادةُ مفتوحة · المفتاح) · مسارُ المريض نفسه · لا تعليقات ولا معايرة · صفرُ كتابة;
   (٢) الدالةُ الطرفية تُشغَّل فعلاً (أنواعُ TS مُجرَّدة بـNode): توكنٌ تالف لا يلمس القاعدة · «مطفأ» يُنقل كما هو ·
       التوقيعُ دفعةٌ واحدة 15 دقيقة على حاوية patient-files · المسارُ الداخلي لا يُعاد · صورةٌ فشل توقيعها تُسقط ·
       المفتاحُ من البيئة لا من الكود · verify_jwt مصرَّحٌ false والتوكنُ هو الهوية;
   (٣) الصفحة: قسمٌ يظهر فقط بصورٍ مشارَكة · روابطُ https فقط ومهرَّبة · رابطٌ قارب الانتهاء ⇒ «عرض الصور» يجدّده ·
       الطلبُ بمهلة · لا RPC جديدة (السطحُ المجهول كما هو) · لا مستمعاتٍ عامة;
   (٤) العيادة: مفتاحُ الإعدادات يُقرأ «=== true» ويُحفظ · تلميحُ البطاقة · زرُّ المشاركة لصور المتصفح فقط، محروسٌ أولَ سطر
       ومخفيٌّ بالقراءة · updateMeta يقبل portal_shared.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const { stripTypeScriptTypes } = require('node:module');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function runEdge(src, { body, method, rpc, sign }) {
  const calls = { rpc: [], sign: [] };
  let handler = null;
  const js = stripTypeScriptTypes(src.replace(/^import \{ createClient \} from "[^"]+";$/m, ''));
  const ctx = {
    console, JSON, Array, String, Object, Number, Promise, Response, Headers,
    Deno: { serve: h => { handler = h; }, env: { get: k => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] } },
    createClient: (u, k) => ({
      _k: k,
      rpc: async (n, a) => { calls.rpc.push([n, a, k]); return rpc ? rpc(n, a) : { data: null }; },
      storage: { from: b => ({ createSignedUrls: async (paths, ttl) => { calls.sign.push([b, paths, ttl]); return sign ? sign(paths, ttl) : { data: paths.map(p => ({ path: p, signedUrl: 'https://x.supabase.co/storage/v1/object/sign/' + p + '?token=t', error: null })) }; } }) }
    })
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const req = new Request('https://x/functions/v1/portal-xray', { method: method || 'POST', body: method && method !== 'POST' ? undefined : JSON.stringify(body || {}), headers: { 'content-type': 'application/json' } });
  const res = await handler(req);
  let out = null; try { out = await res.json(); } catch (e) { out = null; }
  return { res, out, calls };
}

async function suite(F) {
  /* (١) القاعدة */
  const M = F['migrations/193_portal_xrays.sql'];
  ok(/ADD COLUMN IF NOT EXISTS portal_show_xrays BOOLEAN NOT NULL DEFAULT false;/.test(M) && /ADD COLUMN IF NOT EXISTS portal_shared    BOOLEAN NOT NULL DEFAULT false,/.test(M), 'M193: the clinic switch and the per-image share both start OFF');
  ok(/CHECK \(portal_shared = false OR mime_type IN \('image\/jpeg', 'image\/png', 'image\/webp'\)\)/.test(M), 'M193: only browser images can be shared (no DICOM in the portal)');
  ok(/REVOKE ALL ON FUNCTION public\.portal_xray_list\(text\) FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public\.portal_xray_list\(text\) TO service_role;/.test(M), 'M193: the list is callable by the service role only (the Edge Function) — never by the anonymous page or a tenant');
  const fn = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.portal_xray_list'), M.indexOf('REVOKE ALL ON FUNCTION public.portal_xray_list'));
  ok(/p_token !~ '\^\[0-9a-f\]\{64\}\$'/.test(fn) && /pp\.revoked_at IS NULL AND pp\.expires_at >= now\(\)/.test(fn) && /JOIN public\.patients p ON p\.id = pp\.patient_id AND p\.doctor_id = pp\.owner_id/.test(fn)
     && /NOT public\._intake_clinic_open\(v\.owner_id\)/.test(fn) && /IF v_on IS DISTINCT FROM true THEN RETURN jsonb_build_object\('ok', false, 'reason', 'disabled'\);/.test(fn), 'M193: the portal gates — valid · unrevoked · unexpired token · the clinic open · the switch on');
  ok(/x\.owner_id = v\.owner_id AND x\.patient_id = v\.patient_id AND x\.portal_shared/.test(fn) && /x\.storage_path LIKE \(v\.owner_id::text \|\| '\/' \|\| v\.patient_id::text \|\| '\/%'\)/.test(fn) && /LIMIT 40/.test(fn)
     && !/annotations|calib_mm_per_px|file_name|note/.test(fn) && !/\b(INSERT|UPDATE|DELETE)\b/.test(fn) && /STABLE SECURITY DEFINER/.test(fn), 'M193: only this patient\'s shared images in his own folder · no annotations/calibration/names · read-only');
  /* (٢) الدالةُ الطرفية */
  const E = F['supabase/functions/portal-xray/index.ts'];
  const T = 'ab'.repeat(32);
  let r = await runEdge(E, { body: { t: 'x' } });
  ok(r.out && r.out.ok === false && r.out.reason === 'unavailable' && r.calls.rpc.length === 0, 'edge: a malformed token never reaches the database');
  r = await runEdge(E, { body: { t: T }, rpc: () => ({ data: { ok: false, reason: 'disabled' } }) });
  ok(r.out.reason === 'disabled' && r.calls.rpc[0][0] === 'portal_xray_list' && r.calls.rpc[0][1].p_token === T && r.calls.rpc[0][2] === 'svc' && r.calls.sign.length === 0, 'edge: the service-role list decides; «disabled» passes through, nothing signed');
  r = await runEdge(E, { body: { t: T.toUpperCase() }, rpc: () => ({ data: { ok: false, reason: 'whatever' } }) });
  ok(r.out.reason === 'unavailable' && r.calls.rpc[0][1].p_token === T, 'edge: token normalised to lowercase; any other refusal ⇒ «unavailable» (no detail leaks)');
  const items = [{ id: 'd1', path: 'O/P/a.png', kind: 'xray', type: 'bitewing', date: '2026-09-01', teeth: ['36', '46'] }, { id: 'd2', path: 'O/P/b.png', kind: 'photo', type: null, date: '2026-08-01', teeth: [] }];
  r = await runEdge(E, { body: { t: T }, rpc: () => ({ data: { ok: true, items } }) });
  ok(r.out.ok && r.out.items.length === 2 && r.calls.sign.length === 1 && r.calls.sign[0][0] === 'patient-files' && r.calls.sign[0][2] === 900 && JSON.stringify(r.calls.sign[0][1]) === '["O/P/a.png","O/P/b.png"]',
     'edge: one batch signature, 15 minutes, on the patient-files bucket');
  ok(r.out.items.every(i => !('path' in i) && Object.keys(i).sort().join() === 'date,id,kind,teeth,type,url'), 'edge: the internal path is never returned as a field (only inside the signed URL) — exactly id/url/kind/type/date/teeth');
  ok(r.out.items[0].url.indexOf('https://') === 0 && r.out.items[0].type === 'bitewing' && JSON.stringify(r.out.items[0].teeth) === '["36","46"]' && r.out.items[1].kind === 'photo' && r.out.expires_in === 900, 'edge: URL + type/date/teeth only');
  r = await runEdge(E, { body: { t: T }, rpc: () => ({ data: { ok: true, items } }), sign: p => ({ data: [{ path: p[0], signedUrl: 'https://s/1', error: null }, { path: p[1], signedUrl: '', error: 'not found' }] }) });
  ok(r.out.items.length === 1 && r.out.items[0].id === 'd1', 'edge: an image whose signature failed (object gone) is dropped');
  r = await runEdge(E, { method: 'GET' });
  ok(r.res.status === 405, 'edge: POST only');
  ok(!/eyJ|service_role_key\s*=|sb_secret/.test(E) && /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(E) && /\[functions\.portal-xray\]\nverify_jwt = false/.test(F['supabase/config.toml']),
     'edge: service key from the environment only · verify_jwt=false declared (the token is the identity)');
  /* (٣) الصفحة */
  const P = F['portal.html'];
  const rpcs = [...P.matchAll(/sb\.rpc\('([a-z_]+)'/g)].map(m => m[1]).sort().join();
  ok(rpcs === 'portal_appt_change,portal_confirm,portal_info,portal_slots' && /var res = await withTimeout\(sb\.functions\.invoke\('portal-xray', \{ body: \{ t: TOKEN \} \}\), 20000\);/.test(P) && /if \(!sb \|\| !sb\.functions \|\| !TOKEN\) return;/.test(P),
     'page: no new RPC — one timed Edge call, guarded');
  ok(/screenPortal\(\);\n    loadXrays\(\);   \/\* M193/.test(P) && !/^document\.addEventListener/m.test(P), 'page: X-rays load after the page (never delay it) · no global listeners');
  const sx = fnSrc(P, 'function sectionXrays(){'), xrf = fnSrc(P, 'function xrFresh(){');
  const c = { esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), fmtYmd: s => s, Date, String, Array, XR: null, XR_TYPES: { bitewing: 'مجنّحة' } };
  vm.createContext(c); vm.runInContext(xrf + sx, c);
  const sec = xr => { c.XR = xr; return vm.runInContext('sectionXrays()', c); };
  const now = Date.now();
  ok(sec(null) === '' && sec({ loading: true }) === '' && sec({ off: true }) === '' && sec({ err: true }) === '' && sec({ items: [], at: now, ttl: 900000 }) === '', 'page: no section unless images were shared');
  const h = sec({ items: [{ url: 'https://s/a?x=1&y="2"', kind: 'xray', type: 'bitewing', date: '2026-09-01', teeth: ['46'] }, { url: 'javascript:alert(1)', kind: 'photo', date: '2026-01-01' }], at: now, ttl: 900000 });
  ok(/صور الأشعة/.test(h) && /src="https:\/\/s\/a\?x=1&amp;y=&quot;2&quot;"/.test(h) && !/javascript:/.test(h) && /مجنّحة/.test(h) && /سن 46/.test(h), 'page: https URLs only, escaped; type and tooth shown');
  ok(/onclick="loadXrays\(\)">عرض الصور/.test(sec({ items: [{ url: 'https://s/a' }], at: now - 900000, ttl: 900000 })), 'page: an expiring link list asks to refresh instead of showing dead images');
  ok(/if \(!xrFresh\(\)\) \{ loadXrays\(\); return; \}/.test(fnSrc(P, 'function openXray(i){')) && /referrerpolicy="no-referrer"/.test(P), 'page: opening a stale image renews the links first · no referrer');
  /* (٤) العيادة */
  const S = F['settings.html'];
  ok(/document\.getElementById\('ptShowXrays'\)\.checked    = row \? row\.portal_show_xrays === true : false;/.test(S) && /portal_show_xrays:    document\.getElementById\('ptShowXrays'\)\.checked,/.test(S) && /id="ptShowXrays" class="bk-switch"/.test(S),
     'settings: the switch reads OFF unless explicitly on, and is saved');
  ok(/if \(cs\.portal_show_xrays === true\)    on\.push\('صور الأشعة المشارَكة'\);/.test(F['pp-portal.js']), 'patient card: the portal hint names the shared X-rays when on');
  const tg = fnSrc(F['pp-extras.js'], 'async function pfToggleShare(id){');
  ok(/^async function pfToggleShare\(id\)\{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(tg) && /if \(!f \|\| !pfShareable\(f\)\) return;/.test(tg) && /updateMeta\(id, \{ portal_shared: to \}\)/.test(tg)
     && /\(pfShareable\(f\) \? '<button class="sy-act/.test(F['pp-extras.js']) && /\[onclick\*="pfToggleShare\("\]/.test(F['patient-profile.css']), 'card: share button for browser images only — guarded first line, hidden in read-only');
  ok(/'cbct_url', 'portal_shared'\];/.test(F['supabase-init.js']), 'files API: portal_shared is an allowed meta field');
}

const FILES = ['migrations/193_portal_xrays.sql', 'supabase/functions/portal-xray/index.ts', 'supabase/config.toml', 'portal.html', 'settings.html', 'pp-portal.js', 'pp-extras.js', 'patient-profile.css', 'supabase-init.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['switch on by default', rep('migrations/193_portal_xrays.sql', 'portal_show_xrays BOOLEAN NOT NULL DEFAULT false', 'portal_show_xrays BOOLEAN NOT NULL DEFAULT true')],
  ['anon may call the list', rep('migrations/193_portal_xrays.sql', 'FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.portal_xray_list(text) TO service_role;', 'FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.portal_xray_list(text) TO service_role;')],
  ['revoked links work', rep('migrations/193_portal_xrays.sql', 'pp.revoked_at IS NULL AND pp.expires_at >= now() LIMIT 1;\n  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object(\'ok\', false, \'reason\', \'unavailable\'); END IF;\n  SELECT COALESCE(c.portal_show_xrays', 'pp.expires_at >= now() LIMIT 1;\n  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN RETURN jsonb_build_object(\'ok\', false, \'reason\', \'unavailable\'); END IF;\n  SELECT COALESCE(c.portal_show_xrays')],
  ['unshared images listed', rep('migrations/193_portal_xrays.sql', 'x.patient_id = v.patient_id AND x.portal_shared', 'x.patient_id = v.patient_id')],
  ['bad token hits the db', rep('supabase/functions/portal-xray/index.ts', 'if (!/^[0-9a-f]{64}$/.test(token)) return json(200, { ok: false, reason: "unavailable" });', '')],
  ['path returned', rep('supabase/functions/portal-xray/index.ts', 'id: i.id, url: byPath[String(i.path)],', 'id: i.id, path: i.path, url: byPath[String(i.path)],')],
  ['long-lived links', rep('supabase/functions/portal-xray/index.ts', 'const SIGN_SECONDS = 900;', 'const SIGN_SECONDS = 604800;')],
  ['failed signatures kept', rep('supabase/functions/portal-xray/index.ts', 'items: items.filter((i) => byPath[String(i.path)]).map(', 'items: items.map(')],
  ['non-https URL rendered', rep('portal.html', "    if (!/^https:\\/\\//.test(String(it.url || ''))) return '';\n", '')],
  ['page blocked on X-rays', rep('portal.html', '    screenPortal();\n    loadXrays();', '    await loadXrays();\n    screenPortal();')],
  ['settings default on', rep('settings.html', "row ? row.portal_show_xrays === true : false;", "row ? row.portal_show_xrays !== false : true;")],
  ['share without guard', rep('pp-extras.js', "async function pfToggleShare(id){\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", 'async function pfToggleShare(id){')]
];
(async () => {
  await suite(base);
  const bp = [pass, fail];
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    [pass, fail] = bp;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-portal-xrays: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-portal-xrays: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
