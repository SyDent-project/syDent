/* SyDent — prove-sw-instant.js: مثبت سلوكي لمسار الصفحات بـsw.js الحي (فتح فوري + تحديث بالخلفية)
   ولمستقبِل PAGE_UPDATED بـtheme.js الحي. محاكاة Cache API بترتيب إدراج حقيقي (put يعيد المفتاح
   للنهاية)، شبكة مكتوبة السيناريو، وعملاء (تبويبات) يسجّلون ما يصلهم.
   الاستخدام: node scripts/prove-sw-instant.js [--self-test] */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const O = 'https://sydent.app';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function mkResp(body, o) {
  o = o || {};
  return { __body: String(body), ok: o.ok !== false, status: o.status || 200, statusText: '', type: o.type || 'basic',
    redirected: !!o.redirected, url: o.url || '', headers: {},
    clone() { return mkResp(body, o); }, text() { return Promise.resolve(String(body)); },
    blob() { return Promise.resolve(String(body)); }, json() { return Promise.resolve(JSON.parse(body)); },
    arrayBuffer() { const b = Buffer.from(String(body), 'utf8'); return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); } };
}
function world(swSrc, opt) {
  opt = opt || {};
  const store = new Map();
  const norm = k => { const u = (k && k.url) ? k.url : String(k); return u.startsWith('http') ? u : O + u; };
  class C { constructor(n) { this.n = n; if (!store.has(n)) store.set(n, new Map()); }
    get m() { return store.get(this.n); }
    match(k) { const v = this.m.get(norm(k)); return Promise.resolve(v === undefined ? undefined : mkResp(v)); }
    put(k, r) { const u = norm(k); this.m.delete(u); this.m.set(u, r.__body); return Promise.resolve(); }
    delete(k) { return Promise.resolve(this.m.delete(norm(k))); }
    keys() { return Promise.resolve([...this.m.keys()].map(u => ({ url: u }))); } }
  const caches = { open: n => Promise.resolve(new C(n)), keys: () => Promise.resolve([...store.keys()]),
    delete: n => Promise.resolve(store.delete(n)),
    match: k => { for (const [, m] of store) { const v = m.get(norm(k)); if (v !== undefined) return Promise.resolve(mkResp(v)); } return Promise.resolve(undefined); } };
  const W = { store, net: {}, redirect: {}, fetched: [], mode: 'ok', clients: [], listeners: {} };
  const fetchMock = req => {
    const u = norm(req); W.fetched.push(u);
    if (W.mode === 'down') return Promise.reject(new TypeError('Failed to fetch'));
    if (W.mode === 'hang') return new Promise(() => {});
    if (W.mode === '500') return Promise.resolve(mkResp('ERR', { ok: false, status: 500, url: u }));
    const p = u.replace(O, '').split('?')[0];
    if (W.hangPath && W.hangPath[p]) return new Promise(() => {});
    if (W.downPath && W.downPath[p]) return Promise.reject(new TypeError('Failed to fetch'));
    if (W.status && W.status[p]) return Promise.resolve(mkResp(W.statusBody && W.statusBody[p] !== undefined ? W.statusBody[p] : 'ERR', { ok: false, status: W.status[p], url: u }));
    if (W.failAfter !== undefined && W.fetched.length > W.failAfter) return Promise.reject(new TypeError('Failed to fetch'));
    if (W.redirect[p]) return Promise.resolve(mkResp(W.net[p] !== undefined ? W.net[p] : 'NET:' + p, { url: O + W.redirect[p], redirected: true }));
    const body = W.net[p] !== undefined ? W.net[p] : (W.site && /\.html$/.test(p) ? W.site(p) : 'NET:' + p);
    return Promise.resolve(mkResp(body, { url: u }));
  };
  const sb = { console, caches, fetch: fetchMock, URL, setTimeout, clearTimeout, Promise,
    Request: function (u, o) { this.url = norm(u); this.opts = o; },
    Response: function (b, o) { Object.assign(this, mkResp(b == null ? '' : b, o || {})); } };
  sb.self = { location: { origin: O }, addEventListener: (t, fn) => { W.listeners[t] = fn; }, skipWaiting: () => Promise.resolve(),
    registration: {}, navigator: {},
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve(W.clients.filter(c => c.ready)),
      get: id => Promise.resolve(W.clients.find(c => c.id === id && c.ready)) } };
  sb.location = sb.self.location; sb.navigator = sb.self.navigator;
  if (opt.crypto) sb.self.crypto = require('crypto').webcrypto;   /* v803: بلا crypto (العوالم الأقدم) يبقى العاملُ على سلوكه السابق */
  vm.createContext(sb); vm.runInContext(swSrc, sb);
  W.sb = sb; W.V = sb.SW_VERSION;
  W.pages = () => store.get('sydent-pages-' + W.V) || new Map();
  W.assets = () => store.get('sydent-assets-' + W.V) || new Map();
  W.client = (url, id, ready) => { const c = { url, id: id || '', ready: ready !== false, got: [], postMessage(m) { c.got.push(m); } }; W.clients.push(c); return c; };
  W.nav = async (p, resultingClientId) => { let served = null; const waits = [];
    W.listeners.fetch({ resultingClientId: resultingClientId || '',
      request: { url: O + p, mode: 'navigate', method: 'GET', headers: { has: () => false, get: () => '' }, destination: 'document' },
      respondWith: x => { served = x; }, waitUntil: x => waits.push(x) });
    return { served, done: () => Promise.all(waits.map(w => Promise.resolve(w).catch(() => {}))) }; };
  W.fire = (type, data) => new Promise(res => { const waits = []; W.listeners[type]({ waitUntil: x => waits.push(x), data });
    Promise.all(waits.map(w => Promise.resolve(w).catch(() => {}))).then(res); });
  W.asset = async (p) => { let served = null;
    W.listeners.fetch({ request: { url: O + p, mode: 'no-cors', method: 'GET', headers: { has: () => false, get: () => '' }, destination: 'script' },
      respondWith: x => { served = x; }, waitUntil: x => { W.pending.push(x); } });
    return served; };
  /* v803: عملُ الخلفية لطلبات الأصول (فحصُ البيان · التصحيح) — يُنتظر صراحةً حيث يهمّ التوقيت */
  W.pending = []; W.idle = async () => { while (W.pending.length) await Promise.all(W.pending.splice(0).map(x => Promise.resolve(x).catch(() => {}))); };
  W.seed = async (p, body) => { const c = await caches.open('sydent-pages-' + W.V); await c.put(O + p, mkResp(body)); };
  return W;
}
const race = (p, ms) => Promise.race([Promise.resolve(p).then(v => ({ v })), sleep(ms).then(() => ({ timeout: true }))]);

async function runAll(SW, THEME, only, HDSRC) {
  const fails = [];
  const ok = (n, c, x) => { if (!c) fails.push(n + (x !== undefined ? ' [' + String(x).slice(0, 200) + ']' : '')); };

  if (!only || only === 'i1') {
    /* ══ البند 1: فتح فوري من الكاش + تحديث بالخلفية ══ */
    let W = world(SW);
    await W.seed('/patients.html', 'OLD');
    W.mode = 'hang';
    let n = await W.nav('/patients.html');
    let r = await race(n.served, 300);
    ok('i1: a cached page is served at once even when the network never answers', !r.timeout && r.v && r.v.__body === 'OLD');
    /* نسخة أحدث على الخادم ⇒ الكاش يُحدَّث والتبويب المعنيّ وحده يُبلَّغ */
    W = world(SW); await W.seed('/patients.html', 'OLD'); W.net['/patients.html'] = 'NEW';
    const mine = W.client(O + '/patients?x=1'), other = W.client(O + '/appointments.html');
    n = await W.nav('/patients.html'); r = await n.served; await n.done();
    ok('i1: the cached copy is what is shown first', r.__body === 'OLD');
    ok('i1: the fresh copy replaces it in the cache', W.pages().get(O + '/patients.html') === 'NEW');
    ok('i1: the tab showing that page is told a newer version arrived', mine.got.length === 1 && mine.got[0].type === 'PAGE_UPDATED', JSON.stringify(mine.got));
    ok('i1: other tabs are not told', other.got.length === 0);
    /* التبويب الناتج لم يجهز بعد لحظة المقارنة ⇒ تُعاد المحاولة حتى يجهز، وإليه وحده */
    {
      const W2 = world(SW); await W2.seed('/patients.html', 'OLD'); W2.net['/patients.html'] = 'NEW';
      const dying = W2.client(O + '/patients.html', 'old-doc'), fresh = W2.client(O + '/patients.html', 'new-doc', false);
      const n2 = await W2.nav('/patients.html', 'new-doc'); await n2.served;
      setTimeout(() => { fresh.ready = true; }, 700);
      await n2.done();
      ok('i1: the message waits for the new tab to be ready and goes to it alone', fresh.got.length === 1 && dying.got.length === 0, fresh.got.length + '/' + dying.got.length);
    }
    /* لا تغيير ⇒ لا رسالة */
    n = await W.nav('/patients.html'); r = await n.served; await n.done();
    ok('i1: next open shows the new copy and sends no message', r.__body === 'NEW' && mine.got.length === 1);
    /* الخادم يردّ 500 أو الشبكة مقطوعة ⇒ الكاش سليم وبلا رسالة */
    W.mode = '500'; n = await W.nav('/patients.html'); await n.served; await n.done();
    W.mode = 'down'; n = await W.nav('/patients.html'); r = await n.served; await n.done();
    ok('i1: a server error or no network leaves the cached page intact', W.pages().get(O + '/patients.html') === 'NEW' && r.__body === 'NEW' && mine.got.length === 1);
    /* بلا نسخة بالكاش ⇒ شبكة أولاً ثم تُكاش */
    W = world(SW); n = await W.nav('/labs.html'); r = await n.served; await n.done();
    ok('i1: a page with no cached copy still comes from the network and is cached', r.__body === 'NET:/labs.html' && W.pages().get(O + '/labs.html') === 'NET:/labs.html');
    W.mode = 'down'; n = await W.nav('/never.html'); r = await n.served;
    ok('i1: offline with nothing cached still ends on the offline page or a 503', !!r && (r.status === 503 || typeof r.__body === 'string'));
    /* صفحات المريض: شبكة أولاً ولو كانت مكاشة */
    for (const p of ['/book.html', '/intake', '/portal.html']) {
      W = world(SW); await W.seed(p, 'OLD'); W.net[p] = 'NEW';
      n = await W.nav(p + '?t=abc'); r = await n.served; await n.done();
      ok('i1: patient-facing ' + p + ' is always fetched from the network first', r.__body === 'NEW', r.__body);
    }
    /* المسار النظيف يجد نسخة .html والعكس */
    W = world(SW); await W.seed('/patient-profile.html', 'SHELL'); W.mode = 'hang';
    n = await W.nav('/patient-profile?id=7'); r = await race(n.served, 300);
    ok('i1: the clean URL opens instantly from the .html copy', !r.timeout && r.v.__body === 'SHELL');

    /* مستقبِل الصفحة بـtheme.js الحي */
    const a = THEME.indexOf('var syTouched = false'), b = THEME.indexOf("window.addEventListener('load', function () {", a);
    ok('i1: page-side receiver present in theme.js', a > 0 && b > a);
    const page = (opts) => { const ev = {}, ss = new Map(); let onmsg = null; const st = { reloads: 0, toasts: [] };
      const win = { addEventListener: (t, fn) => { ev[t] = fn; }, sessionStorage: { getItem: k => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, v) },
        location: { reload: () => { st.reloads++; } }, showToast: m => st.toasts.push(m) };
      let now = 1e12;
      const ctx = vm.createContext({ window: win, navigator: { serviceWorker: { addEventListener: (t, fn) => { onmsg = fn; } } }, Date: { now: () => now }, parseInt, String });
      vm.runInContext(THEME.slice(a, b), ctx);
      st.msg = () => onmsg({ data: { type: 'PAGE_UPDATED', path: '/x' } }); st.touch = () => ev.pointerdown({}); st.tick = ms => { now += ms; };
      st.other = () => onmsg({ data: { type: 'SOMETHING_ELSE' } });
      return st; };
    let pg = page(); pg.tick(1000); pg.msg();
    ok('i1: an untouched, just-opened page reloads itself once', pg.reloads === 1 && pg.toasts.length === 0);
    pg.tick(2000); pg.msg();
    ok('i1: no reload loop — a second message within a minute only notifies', pg.reloads === 1 && pg.toasts.length === 1);
    pg = page(); pg.tick(500); pg.touch(); pg.msg();
    ok('i1: a page the user already touched is never reloaded under them', pg.reloads === 0 && pg.toasts.length === 1);
    pg = page(); pg.tick(20000); pg.msg();
    ok('i1: a page open for a while is not reloaded', pg.reloads === 0 && pg.toasts.length === 1);
    pg = page(); pg.other();
    ok('i1: unrelated worker messages are ignored', pg.reloads === 0 && pg.toasts.length === 0);
  }

  if (!only || only === 'i2') {
    /* ══ البند 2: كل صفحات المنصة وأصولها تُحمَّل مرةً واحدة · الصفحات تبقى عبر النشرات ══ */
    const site = tok => p => '<html><head><link rel="stylesheet" href="theme.css?v=' + tok + '"><script src="supabase-init.js?v=' + tok + '"></script>' +
      '<script src="/vendor/lib-1.0.min.js"></script><script src="https://cdn.example.com/x.js"></script><script src="/sw.js"></script></head>' +
      '<body><img src="pic' + p.replace(/[/.]/g, '-') + '.png"></body></html>';
    let W = world(SW); W.site = site('T1');
    const ALL = W.sb.ALL_PAGES;
    await W.fire('install', {}); await W.fire('activate', {});
    const pk = [...W.pages().keys()], ak = [...W.assets().keys()];
    ok('i2: after install every platform page is in the cache', ALL.every(p => pk.indexOf(O + p) !== -1), ALL.filter(p => pk.indexOf(O + p) === -1).join(','));
    ok('i2: … with the shared assets under the exact URL the pages ask for', ak.indexOf(O + '/theme.css?v=T1') !== -1 && ak.indexOf(O + '/supabase-init.js?v=T1') !== -1 && ak.indexOf(O + '/vendor/lib-1.0.min.js') !== -1);
    ok('i2: … and each page\'s own files', ALL.every(p => ak.indexOf(O + '/pic' + p.replace(/[/.]/g, '-') + '.png') !== -1));
    ok('i2: code-loaded files are included', ak.indexOf(O + '/tour.js') !== -1 && ak.indexOf(O + '/guides.js') !== -1);
    ok('i2: nothing from another origin and never sw.js', !W.fetched.some(u => u.indexOf('cdn.example.com') !== -1) && ak.indexOf(O + '/sw.js') === -1);
    /* صفحة لم تُفتح قط تعمل بلا اتصال: الـHTML وأصوله من الكاش */
    W.mode = 'down';
    let n = await W.nav('/inventory.html'); let r = await n.served; await n.done();
    const a1 = await W.asset('/supabase-init.js?v=T1');
    ok('i2: a page never opened before works offline (page + its script from the cache)', /pic-inventory-html/.test(r.__body) && a1 && a1.__body === 'NET:/supabase-init.js', a1 && a1.__body);
    await W.idle();   /* v803: تصحيحُ الخلفية لذلك الطلب ينتهي (فاشلاً — بلا اتصال) قبل عودة الشبكة */
    W.mode = 'ok';
    /* تشغيل ثانٍ: لا شيء ناقص ⇒ صفر جلب */
    W.fetched.length = 0;
    ok('i2: a second run downloads nothing', (await W.sb.fillMissing()) === 0 && W.fetched.length === 0, W.fetched.length);
    /* نشرة تدوّر التوكن: الأصول لا تُعاد (المسار موجود) · ملفٌ جديد فعلاً يُجلب وحده */
    await W.seed('/labs.html', site('T2')('/labs.html').replace('</body>', '<script src="brand-new.js?v=T2"></script></body>'));
    W.fetched.length = 0;
    const got = await W.sb.fillMissing();
    ok('i2: a token rotation re-downloads nothing; only a genuinely new file is fetched', got === 1 && W.fetched.length === 1 && W.fetched[0] === O + '/brand-new.js?v=T2', W.fetched.join(' , '));
    /* توفير البيانات / 2G: لا تحميل */
    W = world(SW); W.site = site('T1'); W.sb.self.navigator.connection = { saveData: true };
    ok('i2: nothing is preloaded when the device asks to save data', (await W.sb.fillMissing()) === 0 && W.fetched.length === 0);
    W.sb.self.navigator.connection = { effectiveType: '2g' };
    ok('i2: nothing is preloaded on a 2G connection', (await W.sb.fillMissing()) === 0 && W.fetched.length === 0);
    /* انقطاع أثناء التحميل: يتوقف بعد 3 إخفاقات ويُستأنف لاحقاً */
    W = world(SW); W.site = site('T1'); W.failAfter = 5;
    await W.sb.fillMissing();
    ok('i2: a dropped connection stops the preload after three failures', W.fetched.length === 8, W.fetched.length);
    W.failAfter = undefined; await W.sb.fillMissing();
    ok('i2: … and the next run completes it', ALL.every(p => W.pages().has(O + p)));
    /* الترحيل: كل الصفحات السابقة تبقى (كانت 15 فقط) ولو بلا اتصال */
    W = world(SW); W.mode = 'down';
    const old = new Map(); for (let i = 0; i < 20; i++) old.set(O + '/p' + i + '.html', 'OLDPAGE' + i);
    W.store.set('sydent-pages-v0', old);
    await W.fire('activate', {});
    ok('i2: an update keeps every page that was cached, even with no connection', [...old.keys()].every(k => W.pages().get(k) && W.pages().get(k).indexOf('OLDPAGE') === 0) && !W.store.has('sydent-pages-v0'), W.pages().size);
    /* مضيف يحوّل .html: النسخة الطازجة تُكتب أيضاً بالمفتاح الذي خُدمت منه */
    W = world(SW); await W.seed('/patients.html', 'OLD'); W.net['/patients.html'] = 'NEW'; W.redirect['/patients.html'] = '/patients';
    n = await W.nav('/patients.html'); await n.served; await n.done();
    ok('i2: on a host that redirects .html, the key the page was served from is refreshed too', W.pages().get(O + '/patients.html') === 'NEW' && W.pages().get(O + '/patients') === 'NEW', [...W.pages()].join('|'));
    /* تعداد: كل ملف صفحة إمّا بالقائمة أو مستثنى بقرار معلن */
    const EXCLUDED = ['admin.html', 'landing.html', 'privacy.html', 'ui-kit.html', 'book.html', 'intake.html', 'portal.html', 'offline.html'];
    const files = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
    ok('i2: every listed page exists', ALL.every(p => files.indexOf(p.slice(1)) !== -1));
    const stray = files.filter(f => ALL.indexOf('/' + f) === -1 && EXCLUDED.indexOf(f) === -1);
    ok('i2: every page file is either preloaded or explicitly excluded', stray.length === 0, stray.join(','));
    /* الصفحات الحقيقية: المستخرِج يلتقط أصولها الموسومة */
    const real = fs.readFileSync(path.join(ROOT, 'patient-profile.html'), 'utf8');
    const refs = W.sb.assetRefs(real);
    ok('i2: the extractor finds the real patient card\'s tokenised assets', refs.length >= 30 && refs.some(u => /\/supabase-init\.js\?v=/.test(u)) && refs.every(u => u.indexOf(O) === 0), refs.length);
  }

  if (!only || only === 'i3') {
    /* ══ البند 3 (v803): بيانُ الأصول — ملفٌ لم يتغيّر محتواه لا يُنزَّل بعد النشرة ══ */
    const sha = b => require('crypto').createHash('sha256').update(String(b), 'utf8').digest('hex');
    const man = (tok, files) => JSON.stringify({ v: 1, token: tok, files });
    const mk = o => world(SW.replace('MAN_WAIT_MS = 2500', 'MAN_WAIT_MS = 60'), Object.assign({ crypto: true }, o || {}));
    const put = async (W, p, body) => { const c = await W.sb.caches.open('sydent-assets-' + W.V); await c.put(O + p, mkResp(body)); };
    const got = (W, re) => W.fetched.filter(u => re.test(u));
    const pre = W => W.store.get('sydent-precache-' + W.V) || new Map();
    ok('i3: the test reaches the real constants', SW.indexOf('MAN_WAIT_MS = 2500') !== -1 && SW.indexOf("MANIFEST_URL = '/asset-manifest.json'") !== -1);
    /* (أ) نشرةٌ دوّرت التوكن: الملفُ نفسُه يُخدَم من الجهاز، والمتغيّرُ وحده يُنزَّل */
    let W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); await put(W, '/y.js?v=T1', 'OLD-Y'); await put(W, '/z.css?v=T1', 'BODY-Z');
    W.net['/asset-manifest.json'] = man('T2', { 'x.js': sha('BODY-X'), 'y.js': sha('NEW-Y'), 'z.css': sha('BODY-Z') }); W.net['/x.js'] = 'BODY-X'; W.net['/y.js'] = 'NEW-Y'; W.net['/z.css'] = 'BODY-Z';
    const rs = await Promise.all([W.asset('/x.js?v=T2'), W.asset('/y.js?v=T2'), W.asset('/z.css?v=T2')]); await W.idle();
    ok('i3: a file whose content did not change is served from the device under the new token — nothing downloaded', rs[0] && rs[0].__body === 'BODY-X' && rs[2] && rs[2].__body === 'BODY-Z' && got(W, /\/x\.js|\/z\.css/).length === 0, W.fetched.join(' , '));
    ok('i3: … and kept under the new URL (the old one stays for a page still on the old token)', W.assets().get(O + '/x.js?v=T2') === 'BODY-X' && W.assets().get(O + '/x.js?v=T1') === 'BODY-X');
    ok('i3: a file that did change is downloaded, once', rs[1] && rs[1].__body === 'NEW-Y' && got(W, /\/y\.js\?v=T2$/).length === 1 && W.assets().get(O + '/y.js?v=T2') === 'NEW-Y');
    ok('i3: three files asked together ⇒ the manifest is fetched once, uncached', got(W, /asset-manifest/).length === 1);
    ok('i3: the manifest is kept on the device for this token', [...pre(W).keys()].some(k => /__asset_manifest-T2$/.test(k)));
    /* (ب) الفتحاتُ التالية: نسخةٌ مثبتة لا تُصحَّح من الشبكة */
    W.fetched.length = 0;
    const r2 = await Promise.all([W.asset('/x.js?v=T2'), W.asset('/y.js?v=T2')]); await W.idle();
    ok('i3: later page loads touch the network for none of them (proven copies need no background refresh)', r2[0].__body === 'BODY-X' && r2[1].__body === 'NEW-Y' && W.fetched.length === 0, W.fetched.join(' , '));
    /* (ج) بيانُ نشرةٍ أخرى لا يقول شيئاً عن هذه */
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); W.net['/asset-manifest.json'] = man('T9', { 'x.js': sha('BODY-X') }); W.net['/x.js'] = 'FRESH-X';
    let r = await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: a manifest carrying another release\'s token is not trusted — the file comes from the network', r.__body === 'FRESH-X' && W.assets().get(O + '/x.js?v=T2') === 'FRESH-X');
    /* (د) بلا بيان / بيانٌ تالف / ملفٌ غير مذكور / تجزئةٌ بغير نصّ */
    for (const [label, body] of [['no manifest on the server', null], ['a broken manifest', '{"token":"T2","files":'], ['a manifest without the file', man('T2', { 'other.js': sha('BODY-X') })],
      ['a manifest whose files is not a map', JSON.stringify({ token: 'T2', files: 'x' })], ['a hash that is not a string', JSON.stringify({ token: 'T2', files: { 'x.js': true } })]]) {
      W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); if (body !== null) W.net['/asset-manifest.json'] = body; else W.status = { '/asset-manifest.json': 404 }; W.net['/x.js'] = 'FRESH-X';
      r = await W.asset('/x.js?v=T2'); await W.idle();
      ok('i3: ' + label + ' ⇒ the network, as before', r.__body === 'FRESH-X', r.__body);
    }
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); W.status = { '/asset-manifest.json': 500 }; W.statusBody = { '/asset-manifest.json': man('T2', { 'x.js': sha('BODY-X') }) }; W.net['/x.js'] = 'FRESH-X';
    r = await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: an error response is never read as a manifest, whatever its body', r.__body === 'FRESH-X');
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); await put(W, '/y.js?v=T1', 'BODY-Y'); W.status = { '/asset-manifest.json': 404 };
    await W.asset('/x.js?v=T2'); await W.asset('/y.js?v=T2'); await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: a missing manifest is not asked for again on every file', got(W, /asset-manifest/).length === 1, got(W, /asset-manifest/).length);
    /* (هـ) بيانٌ لا يصل: المهلةُ ثم الشبكة — الصفحةُ لا تعلق */
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); W.hangPath = { '/asset-manifest.json': true }; W.net['/x.js'] = 'FRESH-X';
    const slow = await race(W.asset('/x.js?v=T2'), 1500);
    ok('i3: a manifest that never arrives does not hold the page — the file is fetched after a short wait', !slow.timeout && slow.v && slow.v.__body === 'FRESH-X');
    /* (و) نسخةٌ مسمومة تحت التوكن المطلوب: تُخدَم فوراً وتُشفى من الشبكة (درسُ v131 قائم) */
    W = mk(); await put(W, '/x.js?v=T2', 'STALE-X'); W.net['/asset-manifest.json'] = man('T2', { 'x.js': sha('GOOD-X') }); W.net['/x.js'] = 'GOOD-X';
    r = await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: a copy that does not match its manifest is still corrected in the background', r.__body === 'STALE-X' && W.assets().get(O + '/x.js?v=T2') === 'GOOD-X' && got(W, /\/x\.js\?v=T2$/).length === 1);
    /* (ز) بلا اتصال وبلا بيان: نسخةُ المسار تُخدَم ولا تُكتب تحت المفتاح الجديد */
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); W.mode = 'down';
    r = await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: offline with no manifest the old copy is served but never stored under the new token', r.__body === 'BODY-X' && !W.assets().has(O + '/x.js?v=T2'));
    /* (ح) بلا اتصال والبيانُ محفوظٌ من قبل: الإثباتُ ممكن بلا شبكة */
    W = mk(); await put(W, '/x.js?v=T1', 'BODY-X'); await put(W, '/y.js?v=T1', 'BODY-Y'); W.net['/asset-manifest.json'] = man('T2', { 'x.js': sha('BODY-X'), 'y.js': sha('BODY-Y') });
    await W.asset('/x.js?v=T2'); await W.idle(); W.mode = 'down'; W.fetched.length = 0;
    r = await W.asset('/y.js?v=T2'); await W.idle();
    ok('i3: with the manifest already on the device an unchanged file is proven and kept even offline', r.__body === 'BODY-Y' && W.assets().get(O + '/y.js?v=T2') === 'BODY-Y' && got(W, /asset-manifest/).length === 0);
    /* (ط) متصفحٌ بلا crypto: السلوكُ السابق */
    W = world(SW.replace('MAN_WAIT_MS = 2500', 'MAN_WAIT_MS = 60')); await put(W, '/x.js?v=T1', 'BODY-X'); W.net['/asset-manifest.json'] = man('T2', { 'x.js': sha('BODY-X') }); W.net['/x.js'] = 'FRESH-X';
    r = await W.asset('/x.js?v=T2'); await W.idle();
    ok('i3: without crypto nothing is assumed — the file comes from the network', r.__body === 'FRESH-X');
    /* (ي) أصلٌ بلا توكن وملفٌ لم يُرَ قط: لا بيان يُطلب */
    W = mk(); W.net['/new.js'] = 'NEW';
    r = await W.asset('/new.js?v=T2'); await W.idle();
    ok('i3: a file the device never had is simply downloaded — no manifest needed to decide', r.__body === 'NEW' && got(W, /\/new\.js\?v=T2$/).length === 1);
    /* (ك) البناء: hash-dist يكتب البيانَ الذي يفهمه العامل */
    const os = require('os'), HD = (() => { const m = { exports: {} }; new Function('require', 'module', 'exports', HDSRC || fs.readFileSync(path.join(ROOT, 'scripts', 'hash-dist.js'), 'utf8'))(require, m, m.exports); return m.exports; })();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sydist-'));
    const wr = (n, b) => fs.writeFileSync(path.join(tmp, n), b);
    wr('a.js', 'AAA'); wr('b.css', 'BBB'); wr('sw.js', 'SW'); wr('note.txt', 'x'); fs.mkdirSync(path.join(tmp, 'vendor')); fs.writeFileSync(path.join(tmp, 'vendor', 'lib.js'), 'LIB');
    wr('index.html', '<link rel="stylesheet" href="b.css?v=T7"><script src="a.js?v=T7"></script><script src="/vendor/lib.js"></script><link rel="icon" href="favicon.svg?v=5"><script src="https://cdn.x/a.js?v=ZZ"></script><script src="ghost.js?v=T9"></script>');
    wr('other.html', "<script src='a.js?v=T7'></script>");
    let hb = HD.build(tmp);
    ok('i3: the build lists every root .js/.css by content hash, never sw.js / vendor / other files', JSON.stringify(hb.out.files) === JSON.stringify({ 'a.js': sha('AAA'), 'b.css': sha('BBB') }) && hb.out.v === 1);
    ok('i3: the build takes the fleet token from the pages (the icon\'s own counter, other origins and files it does not ship are not tokens)', hb.out.token === 'T7', hb.out.token);
    wr('third.html', '<script src="a.js?v=T8"></script>'); hb = HD.build(tmp);
    ok('i3: pages carrying two tokens ⇒ a manifest with no token (the worker will not use it)', hb.out.token === null && hb.tokens.length === 2);
    W = mk(); await put(W, '/a.js?v=T6', 'AAA'); W.net['/asset-manifest.json'] = JSON.stringify(hb.out); W.net['/a.js'] = 'AAA-NET';
    r = await W.asset('/a.js?v=T7'); await W.idle();
    ok('i3: … and the worker indeed ignores a token-less manifest', r.__body === 'AAA-NET');
    fs.unlinkSync(path.join(tmp, 'third.html')); hb = HD.build(tmp);
    W = mk(); await put(W, '/a.js?v=T6', 'AAA'); W.net['/asset-manifest.json'] = JSON.stringify(hb.out); W.net['/a.js'] = 'AAA-NET';
    r = await W.asset('/a.js?v=T7'); await W.idle();
    ok('i3: the worker accepts the manifest exactly as the build writes it', r.__body === 'AAA' && got(W, /\/a\.js/).length === 0);
    fs.rmSync(tmp, { recursive: true, force: true });
    const live = HD.build(ROOT);
    ok('i3: on the real tree the pages carry exactly one fleet token and the shared files are listed', /^[0-9]{8}[a-z]$/.test(String(live.out.token)) && !!live.out.files['supabase-init.js'] && !!live.out.files['pp-dental.js'] && !!live.out.files['theme.css'] && !live.out.files['sw.js'], live.tokens.join(' '));
    ok('i3: the build script writes the manifest after minifying', /minify-dist\.js[\s\S]*node scripts\/hash-dist\.js "\$DIST"/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'build-dist.sh'), 'utf8')));
  }

  return fails;
}

const MUTATIONS = [
  ['i3: any same-path copy reused without proof', s => s.replace("return sha256Hex(res).then(function (h) { return !!h && h === want; });", "return Promise.resolve(true);")],
  ['i3: another release\'s manifest trusted', s => s.replace("return !!(m && tok && m.token === tok && m.files && typeof m.files === 'object');", "return !!(m && m.files && typeof m.files === 'object');")],
  ['i3: an unverified manifest body accepted', s => s.replace("          if (!manifestOk(j, tok)) return null;\n", "")],
  ['i3: the page waits for a manifest forever', s => s.replace("return Promise.race([provenCurrent(old.clone(), url), late]).then(function (ok) {", "return provenCurrent(old.clone(), url).then(function (ok) {")],
  ['i3: proven copies still refetched on every load', s => s.replace("if (ok) { _provenMem[req.url] = 1; return null; } return refresh(); });", "return refresh(); });")],
  ['i3: a poisoned copy is never corrected', s => s.replace("if (ok) { _provenMem[req.url] = 1; return null; } return refresh(); });", "if (ok) { _provenMem[req.url] = 1; } return null; });")],
  ['i3: the reused copy is not kept under the new token', s => s.replace("      return putSafe(ASSETS, url, old.clone(), MAX_ASSETS).then(function () { return old; });\n    });\n  }).catch(function () { return null; });\n}", "      return old;\n    });\n  }).catch(function () { return null; });\n}")],
  ['i3: the manifest is not kept on the device', s => s.replace("          return pc.put(key, new Response(t, { status: 200, headers: { 'Content-Type': 'application/json' } }))\n            .then(function () { return j; }, function () { return j; });", "          return j;")],
  ['i3: a missing manifest is asked for on every file', s => s.replace("    if (!m) { _manFailAt[tok] = Date.now(); delete _manMem[tok]; }", "    if (!m) { delete _manMem[tok]; }")],
  ['i3: an error page parsed as a manifest', s => s.replace("        if (!(net && net.ok)) return null;\n        return net.text().then(function (t) {\n          var j = null;", "        return net.text().then(function (t) {\n          var j = null;")],
  ['i3: unproven old copy stored under the new token', s => s.replace("      if (!ok) return null;\n      _provenMem[url] = 1;", "      _provenMem[url] = 1;")],
  ['i3: build hashes sw.js too', null, null, h => h.replace("&& n !== 'sw.js'", "")],
  ['i3: build guesses a token when pages disagree', null, null, h => h.replace("token: tokens.size === 1 ? [...tokens][0] : null", "token: tokens.size ? [...tokens][0] : null")],
  ['i3: build counts the token of a file it does not ship', null, null, h => h.replace("if (Object.prototype.hasOwnProperty.call(files, m[1])) tokens.add(m[2]);", "tokens.add(m[2]);")],
  ['i2: token rotation re-downloads everything', s => s.replace("if (stop() || have[assetPathKey(u)]) return;", 'if (stop()) return;')],
  ['i2: data-saver ignored', s => s.replace("if (c && (c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g')) return false;", '')],
  ['i2: preload never gives up on a dead connection', s => s.replace("var stop = function () { return failRun >= 3; };", 'var stop = function () { return false; };')],
  ['i2: update drops the cached pages again', s => s.replace(".then(function () { return copyCacheEntries(oldPages, PAGES, MAX_PAGES); })", '')],
  ['i2: served key left stale on a redirecting host', s => s.replace("var copy = (servedKey && servedKey !== navKey(net.url || url.href))", 'var copy = (false)')],
  ['i2: preload not run after install', s => s.replace(".then(function () { return fillMissing(); });\n      }).catch(function () {});", ";\n      }).catch(function () {});")],
  ['i2: cross-origin assets preloaded', s => s.replace("if (u.origin !== self.location.origin || u.pathname === '/sw.js') continue;", '')],
  ['i2: a platform page left out of the list', s => s.replace("'/treatments.html', ", '')],
  ['i1: cached page waits for the network again', s => s.replace("if (!f) return handleNavigationNetworkFirst(event, url);\n    var p = revalidatePage", "return handleNavigationNetworkFirst(event, url);\n    var p = revalidatePage")],
  ['i1: background copy not written', s => s.replace("return copy.then(function () { return putPageSafe(net.url || url.href, net); }).then(function () {", "return Promise.resolve().then(function () {")],
  ['i1: tab never told about a newer page', s => s.replace("if (t[0] !== t[1]) return notifyPageUpdated(url, clientId, 0);", '')],
  ['i1: tab told on every open', s => s.replace("if (t[0] !== t[1]) return notifyPageUpdated(url, clientId, 0);", 'return notifyPageUpdated(url, clientId, 0);')],
  ['i1: every tab told', s => s.replace("return (list || []).filter(function (c) { return samePage(c.url, url.href); });", 'return list || [];')],
  ['i1: no retry while the new tab is not ready yet', s => s.replace("if ((tries || 0) >= 12) return;", 'return;')],
  ['i1: a 500 overwrites the cached page', s => s.replace("if (!(net && net.ok && net.type === 'basic')) return;\n    return Promise.all([net.clone().text(), shown.text()])", "return Promise.all([net.clone().text(), shown.text()])")],
  ['i1: patient pages served from cache first', s => s.replace("if (isNetworkFirstPath(url.pathname)) return handleNavigationNetworkFirst(event, url);", '')],
  ['i1: page reloads under a user who touched it', null, t => t.replace("if (!syTouched && Date.now() - syOpenedAt < 15000", 'if (Date.now() - syOpenedAt < 15000')],
  ['i1: reload loop guard removed', null, t => t.replace(" && Date.now() - last > 60000) {", ') {')]
];

let FINISHED = false;
process.on('exit', code => { if (!FINISHED && code === 0) { console.log('⛔ مثبت الصفحات: توقّف قبل الاكتمال'); process.exitCode = 1; } });
const finish = c => { FINISHED = true; process.exit(c); };
(async () => {
  const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), THEME = fs.readFileSync(path.join(ROOT, 'theme.js'), 'utf8');
  const fails = await runAll(SW, THEME);
  if (fails.length) { console.log('⛔ مثبت الصفحات: ' + fails.length + ' فشل'); fails.forEach(f => console.log('   ✗ ' + f)); finish(1); }
  if (process.argv.indexOf('--self-test') !== -1) {
    const HDS = fs.readFileSync(path.join(ROOT, 'scripts', 'hash-dist.js'), 'utf8');
    for (const [name, mSw, mTheme, mHd] of MUTATIONS) {
      const s2 = mSw ? mSw(SW) : SW, t2 = mTheme ? mTheme(THEME) : THEME, h2 = mHd ? mHd(HDS) : HDS;
      if (s2 === SW && t2 === THEME && h2 === HDS) { console.log('⛔ طفرة لم تُطبَّق: ' + name); finish(1); }
      let f; try { f = await runAll(s2, t2, name.slice(0, 2), h2); } catch (e) { f = ['threw ' + e.message]; }
      if (!f.length) { console.log('⛔ طفرة لم تُكشف: ' + name); finish(1); }
    }
    console.log('✅ مثبت الصفحات: كل التوكيدات خضراء + ' + MUTATIONS.length + ' طفرات مكشوفة');
  } else console.log('✅ مثبت الصفحات: كل التوكيدات خضراء');
  finish(0);
})().catch(e => { console.error('⛔ مثبت الصفحات: خطأ بالحامل', e); finish(2); });
