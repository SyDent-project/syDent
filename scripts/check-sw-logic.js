/* SyDent — check-sw-logic.js: الحارس التاسع — منطق الأوفلاين بـ sw.js.
   يشغّل sw.js «الحي» داخل sandbox بمحاكاة Cache API كاملة ويثبت 21 توكيداً:
   ترحيل الكاش عبر الإصدارات (أونلاين/أوفلاين + استئناف /__page_set)، خانق
   REFRESH_PAGES، تسخين CORE_PAGES وvendor عند install، اتّباع 308 وغسل علم
   redirected، فتح بطاقة المريض من الكاش أوفلاين، و504 الصامت عند الغياب.
   محايد النسخ: يقرأ SW_VERSION وVENDOR_WARM وCORE_PAGES من sw.js ديناميكياً —
   لا ينكسر زوراً عند رفع الإصدار أو ترقية vendor. الاستخدام: node scripts/check-sw-logic.js */
'use strict';
const fs = require('fs'), vm = require('vm'), cp = require('child_process');
const ROOT = cp.execSync('git rev-parse --show-toplevel').toString().trim();
const SW_PATH = ROOT + '/sw.js';

/* ── محاكاة Cache API ── */
const store = new Map(); // cacheName -> Map(url -> body)
function normUrl(k) {
  const u = (k && k.url) ? k.url : String(k);
  return u.startsWith('http') ? u : 'https://sydent.app' + u;
}
class MockCache {
  constructor(name) { this.name = name; if (!store.has(name)) store.set(name, new Map()); }
  get m() { return store.get(this.name); }
  match(k) { const u = normUrl(k); const v = this.m.get(u);
    return Promise.resolve(v === undefined ? undefined : mkResp(v)); }
  put(k, res) { this.m.set(normUrl(k), res.__body); return Promise.resolve(); }
  delete(k) { return Promise.resolve(this.m.delete(normUrl(k))); }
  keys() { return Promise.resolve([...this.m.keys()].map(u => ({ url: u }))); }
}
function mkResp(body, opts) {
  opts = opts || {};
  return { __body: body, ok: opts.ok !== false, type: opts.type || 'basic',
    redirected: !!opts.redirected, url: opts.url || '',
    status: opts.status || 200, statusText: opts.statusText || '',
    headers: {},
    clone() { return mkResp(body, opts); },
    blob() { return Promise.resolve(body); },
    text() { return Promise.resolve(String(body)); },
    json() { return Promise.resolve(JSON.parse(body)); } };
}
const caches = {
  open: (n) => Promise.resolve(new MockCache(n)),
  keys: () => Promise.resolve([...store.keys()]),
  delete: (n) => Promise.resolve(store.delete(n)),
  match: (k) => { for (const [, m] of store) { const v = m.get(normUrl(k)); if (v !== undefined) return Promise.resolve(mkResp(v)); } return Promise.resolve(undefined); }
};

/* ── الشبكة الوهمية ── */
let ONLINE = true;
const fetched = [];
function fetchMock(req) {
  const u = normUrl(req);
  fetched.push(u);
  if (!ONLINE) return Promise.reject(new Error('net down'));
  if (u.indexOf('fonts.gstatic') !== -1 || u.indexOf('fonts.googleapis') !== -1) {
    return Promise.resolve(mkResp('FONT:' + u, { url: u, type: 'cors' }));
  }
  /* محاكاة 308 الـpretty URL لأي مسار .html — مع أو بلا query (تُحفَظ كما
     يفعل Cloudflare؛ navKey بالكود الحي يقصّها عند التخزين) */
  var mh = u.match(/^([^?]*)\.html(\?.*)?$/);
  if (mh) {
    var prettyPath = mh[1].replace(/\/index$/, '/');
    var finalUrl = prettyPath + (mh[2] || '');
    return Promise.resolve(mkResp('FRESH:' + prettyPath, { url: finalUrl, redirected: true }));
  }
  return Promise.resolve(mkResp('FRESH:' + u, { url: u }));
}

/* ── sandbox وتحميل sw.js الحي ── */
const listeners = {};
const sandbox = {
  console, caches, fetch: fetchMock, Request: function (u, o) { this.url = normUrl(u); this.opts = o; },
  Response: function (b, o) { const r = mkResp(String(b), o || {}); Object.assign(this, r); },
  URL, setTimeout, clearTimeout,
  self: null, location: { origin: 'https://sydent.app' },
};
sandbox.self = {
  location: { origin: 'https://sydent.app' },
  addEventListener: (t, fn) => { listeners[t] = fn; },
  skipWaiting: () => Promise.resolve(),
  clients: { claim: () => { sandbox.__claimed = true; return Promise.resolve(); } },
  registration: {}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SW_PATH, 'utf8'), sandbox);
const V = sandbox.SW_VERSION;
const CUR = { pages: 'sydent-pages-' + V, assets: 'sydent-assets-' + V, fonts: 'sydent-fonts-' + V, pre: 'sydent-precache-' + V };
const VENDOR0 = (sandbox.VENDOR_WARM && sandbox.VENDOR_WARM[0]) || '/vendor/';
const CORE = sandbox.CORE_PAGES || [];

const VERBOSE = process.argv.indexOf('--verbose') !== -1;
const A = (cond, msg) => { if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; } else if (VERBOSE) console.log('✓ ' + msg); };
const fire = (type, data) => new Promise(res => {
  const waits = [];
  listeners[type]({ waitUntil: p => waits.push(p), data, request: null });
  Promise.all(waits).then(res);
});
const O = 'https://sydent.app';

(async () => {
  /* ═ الحالة قبل الترحيل: كاشات v18 مأهولة ═ */
  store.set('sydent-pages-v0', new Map([
    [O + '/index.html', 'OLD-index'],
    [O + '/patients.html', 'OLD-patients'],
    [O + '/patient-profile.html', 'OLD-pp'],
  ]));
  store.set('sydent-assets-v0', new Map([
    [O + '/supabase-init.js?v=20260719d', 'INIT-BODY'],
    [O + '/sidebar.js?v=20260719d', 'SIDEBAR-BODY'],
  ]));
  store.set('sydent-fonts-v0', new Map([
    ['https://fonts.gstatic.com/s/ibmplex.woff2', 'FONT-BODY'],
  ]));
  /* الكاش الحالي فيه نسخة أحدث من أصل واحد — يجب ألا تُداس */
  store.set(CUR.assets, new Map([[O + '/sidebar.js?v=20260719d', 'NEWER-SIDEBAR']]));

  /* ═ سيناريو 1: ترحيل أونلاين ═ */
  await fire('activate', {});
  A(sandbox.__claimed, 'claim() نُفِّذ');
  A(!store.has('sydent-pages-v0') && !store.has('sydent-assets-v0') && !store.has('sydent-fonts-v0'),
    'كاشات الإصدار السابق حُذفت بعد الترحيل');
  A(store.get(CUR.assets).get(O + '/supabase-init.js?v=20260719d') === 'INIT-BODY',
    'ASSETS: supabase-init نُسخ كما هو (نفس الوسم = نفس المحتوى)');
  A(store.get(CUR.assets).get(O + '/sidebar.js?v=20260719d') === 'NEWER-SIDEBAR',
    'ASSETS: المدخل الأحدث الموجود لم يُدَس بالنسخ');
  A(store.get(CUR.fonts).get('https://fonts.gstatic.com/s/ibmplex.woff2') === 'FONT-BODY',
    'FONTS: الخط رُحِّل');
  const pg = store.get(CUR.pages);
  A(pg && pg.get(O + '/') === 'FRESH:' + O + '/' &&
    pg.get(O + '/patient-profile') === 'FRESH:' + O + '/patient-profile',
    'PAGES: الصفحات أُعيد جلبها طازجة بمفاتيح pretty النهائية — لا أجسام قديمة');
  A(![...pg.values()].some(v => String(v).startsWith('OLD')), 'PAGES: صفر HTML قديم بالكاش الجديد');
  const setBody = store.get(CUR.pre).get(O + '/__page_set');
  A(setBody && JSON.parse(setBody).length === 3, '/__page_set حُفظ بقائمة الصفحات الثلاث');

  /* ═ سيناريو 2: ترحيل بلا اتصال — القائمة تنجو ويستأنف REFRESH_PAGES ═ */
  store.clear(); sandbox.__claimed = false; fetched.length = 0;
  store.set('sydent-pages-v0', new Map([[O + '/appointments.html', 'OLD-appt']]));
  ONLINE = false;
  await fire('activate', {});
  A(sandbox.__claimed, 'offline: claim() نُفِّذ رغم فشل إعادة الجلب');
  const pg2 = store.get(CUR.pages);
  A(!pg2 || !pg2.has(O + '/appointments.html'), 'offline: لا جسم قديم نُسخ ولا طازج (الشبكة مقطوعة)');
  A(JSON.parse(store.get(CUR.pre).get(O + '/__page_set'))[0] === O + '/appointments.html',
    'offline: /__page_set نجا بقائمة الصفحة');
  ONLINE = true;
  await fire('message', { type: 'REFRESH_PAGES' });
  const pg3 = store.get(CUR.pages);
  A(pg3 && pg3.get(O + '/appointments') === 'FRESH:' + O + '/appointments',
    'REFRESH_PAGES استأنف من /__page_set وجلب الصفحة طازجة رغم كاش صفحات فارغ');

  /* ═ سيناريو 3: الخانق — نداء ثانٍ خلال 6 ساعات لا يجلب شيئاً ═ */
  fetched.length = 0;
  await fire('message', { type: 'REFRESH_PAGES' });
  A(fetched.length === 0, 'خانق الـ6 ساعات يعمل (صفر جلب بالنداء الثاني)');

  /* ═ سيناريو 4: install يسخّن CORE_PAGES متّبعاً 308 وبعلم مغسول ═ */
  store.clear(); ONLINE = true; fetched.length = 0;
  await fire('install', {});
  const pgc = store.get(CUR.pages);
  var coreOk = CORE.length >= 3 && CORE.every(function (p) {
    var pretty = p.replace(/\.html$/, '').replace(/\/index$/, '/');
    return pgc && pgc.has(O + pretty);
  });
  A(coreOk, 'install: جوهر العيادة (' + CORE.length + ' صفحات) مكاش بمفاتيح pretty النهائية');
  A(pgc.get(O + '/patient-profile') === 'FRESH:' + O + '/patient-profile',
    'install: بطاقة المريض (القالب) موجودة حتمياً — لا حظ زيارات');
  A(store.get(CUR.assets).has(O + VENDOR0),
    'install: vendor supabase مسخّن بجانب الصفحات');

  /* ═ سيناريو 5: تنقّل أونلاين لبطاقة .html?id → يُكاش النهائي بعلم نظيف ═ */
  let served = null; const waits5 = [];
  fetched.length = 0;
  listeners['fetch']({
    request: { url: O + '/labs.html?tab=1', mode: 'navigate', method: 'GET',
               headers: { has: () => false, get: () => '' }, destination: 'document' },
    respondWith: p => { served = p; }, waitUntil: p => waits5.push(p)
  });
  await served; await Promise.all(waits5);
  /* labs خارج CORE عمداً: الطريق الوحيد لدخولها الكاش = كاش التنقّل نفسه —
     فالتوكيد يعضّ فعلاً لو عاد رفضُ redirected (باغ ما-قبل-v21) */
  A(fetched.length === 1 && pgc.has(O + '/labs'),
    'تنقّل .html: النهائي بعد 308 كُوّش تحت مفتاح pretty لصفحة خارج CORE (كان يُرفض قبل v21)');

  /* ═ سيناريو 6: أوفلاين — التنقّل لبطاقة .html?id يُخدَم من الكاش ═ */
  ONLINE = false; served = null; const waits6 = [];
  listeners['fetch']({
    request: { url: O + '/patient-profile.html?id=xyz', mode: 'navigate', method: 'GET',
               headers: { has: () => false, get: () => '' }, destination: 'document' },
    respondWith: p => { served = p; }, waitUntil: p => waits6.push(p)
  });
  const hit = await served;
  A(hit && String(hit.__body).indexOf('FRESH:') === 0,
    'أوفلاين: بطاقة المريض تُفتح من الكاش (الهدف الأصلي للجلسة)');

  /* ═ سيناريو 7: handleSWR غياب+أوفلاين → 504 صناعي لا throw ═ */
  served = null;
  listeners['fetch']({
    request: { url: 'https://fonts.gstatic.com/s/some.woff2', mode: 'no-cors', method: 'GET',
               headers: { has: () => false, get: () => '' }, destination: 'font' },
    respondWith: p => { served = p; }, waitUntil: () => {}
  });
  const r504 = await served;
  A(r504 && r504.status === 504, 'SWR غياب+أوفلاين = 504 صامت بدل Uncaught throw');

  /* ═ سيناريو 8: خطوط CORS — تُكاش أونلاين (النوع cors) وتُخدَم أوفلاين ═ */
  ONLINE = true; served = null; const waits8 = [];
  listeners['fetch']({
    request: { url: 'https://fonts.gstatic.com/s/plex.woff2', mode: 'cors', method: 'GET',
               headers: { has: () => false, get: () => '' }, destination: 'font' },
    respondWith: p => { served = p; }, waitUntil: p => waits8.push(p)
  });
  await served; await Promise.all(waits8);
  A(store.get(CUR.fonts) && store.get(CUR.fonts).has('https://fonts.gstatic.com/s/plex.woff2'),
    'خطوط: استجابة CORS تُكاش بـFONTS (كانت تُستبعد فلا تُكاش قط)');
  ONLINE = false; served = null;
  listeners['fetch']({
    request: { url: 'https://fonts.gstatic.com/s/plex.woff2', mode: 'cors', method: 'GET',
               headers: { has: () => false, get: () => '' }, destination: 'font' },
    respondWith: p => { served = p; }, waitUntil: () => {}
  });
  const fhit = await served;
  A(fhit && String(fhit.__body).indexOf('FONT:') === 0,
    'خطوط: تُخدَم من الكاش أوفلاين (نهاية أسطر 504 للخطوط)');

  if (process.exitCode) { console.error('⛔ حارس SW: توكيد فاشل واحد على الأقل'); }
  else { console.log('✅ حارس SW: منطق الأوفلاين كامل (21 توكيداً — ترحيل ×2 · خانق · تسخين CORE+vendor · 308+غسل العلم · بطاقة offline · 504 صامت · خطوط CORS) على ' + V); }
})().catch(e => { console.error('⛔ حارس SW: استثناء:', e); process.exit(1); });
