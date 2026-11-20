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
    blob() { return Promise.resolve(String(body)); }, json() { return Promise.resolve(JSON.parse(body)); } };
}
function world(swSrc) {
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
  const W = { store, net: {}, fetched: [], mode: 'ok', clients: [], listeners: {} };
  const fetchMock = req => {
    const u = norm(req); W.fetched.push(u);
    if (W.mode === 'down') return Promise.reject(new TypeError('Failed to fetch'));
    if (W.mode === 'hang') return new Promise(() => {});
    if (W.mode === '500') return Promise.resolve(mkResp('ERR', { ok: false, status: 500, url: u }));
    const p = u.replace(O, '').split('?')[0];
    return Promise.resolve(mkResp(W.net[p] !== undefined ? W.net[p] : 'NET:' + p, { url: u }));
  };
  const sb = { console, caches, fetch: fetchMock, URL, setTimeout, clearTimeout, Promise,
    Request: function (u, o) { this.url = norm(u); this.opts = o; },
    Response: function (b, o) { Object.assign(this, mkResp(b == null ? '' : b, o || {})); } };
  sb.self = { location: { origin: O }, addEventListener: (t, fn) => { W.listeners[t] = fn; }, skipWaiting: () => Promise.resolve(),
    registration: {}, navigator: {},
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve(W.clients.filter(c => c.ready)),
      get: id => Promise.resolve(W.clients.find(c => c.id === id && c.ready)) } };
  sb.location = sb.self.location; sb.navigator = sb.self.navigator;
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
  W.seed = async (p, body) => { const c = await caches.open('sydent-pages-' + W.V); await c.put(O + p, mkResp(body)); };
  return W;
}
const race = (p, ms) => Promise.race([Promise.resolve(p).then(v => ({ v })), sleep(ms).then(() => ({ timeout: true }))]);

async function runAll(SW, THEME, only) {
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

  return fails;
}

const MUTATIONS = [
  ['i1: cached page waits for the network again', s => s.replace("if (!hit) return handleNavigationNetworkFirst(event, url);\n    var p = revalidatePage", "return handleNavigationNetworkFirst(event, url);\n    var p = revalidatePage")],
  ['i1: background copy not written', s => s.replace("return putPageSafe(net.url || url.href, net).then(function () {\n        if (t[0] !== t[1]) return notifyPageUpdated(url, clientId, 0);\n      });", "if (t[0] !== t[1]) return notifyPageUpdated(url, clientId, 0);")],
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
    for (const [name, mSw, mTheme] of MUTATIONS) {
      const s2 = mSw ? mSw(SW) : SW, t2 = mTheme ? mTheme(THEME) : THEME;
      if (s2 === SW && t2 === THEME) { console.log('⛔ طفرة لم تُطبَّق: ' + name); finish(1); }
      let f; try { f = await runAll(s2, t2, name.slice(0, 2)); } catch (e) { f = ['threw ' + e.message]; }
      if (!f.length) { console.log('⛔ طفرة لم تُكشف: ' + name); finish(1); }
    }
    console.log('✅ مثبت الصفحات: كل التوكيدات خضراء + ' + MUTATIONS.length + ' طفرات مكشوفة');
  } else console.log('✅ مثبت الصفحات: كل التوكيدات خضراء');
  finish(0);
})().catch(e => { console.error('⛔ مثبت الصفحات: خطأ بالحامل', e); finish(2); });
