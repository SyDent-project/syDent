/* SyDent — prove-offline-outbox.js: مثبت سلوكي لطبقة الأوفلاين (كاش القراءة + طابور الكتابة).
   يشغّل موديول SyDentOffline «الحي» (بين ماركرَيه بـsupabase-init.js) ولفّة الجلسة الحية
   داخل vm مع IndexedDB بالذاكرة وشبكة مكتوبة السيناريو. بلا تبعيات: fake-indexeddb تُستعمل
   إن وُجدت، وإلا محاكاة صغيرة مضمّنة.
   الاستخدام: node scripts/prove-offline-outbox.js [--self-test]
   --self-test: يكسر الكود عمداً (طفرات) ويتأكد أن المثبت يحمرّ لكل واحدة. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LIVE = fs.readFileSync(path.join(ROOT, 'supabase-init.js'), 'utf8');

/* ── IndexedDB بالذاكرة (السطح الذي يستعمله الموديول حصراً) ── */
function miniIDB() {
  const dbs = new Map();
  const later = fn => setImmediate(fn);
  function mkReq(tx, compute) {
    const r = { result: undefined, error: null, onsuccess: null, onerror: null };
    tx._pending++;
    later(() => {
      try { r.result = compute(); if (r.onsuccess) r.onsuccess({ target: r }); }
      catch (e) { r.error = e; tx._failed = e; if (r.onerror) r.onerror({ target: r }); }
      tx._pending--; tx._settle();
    });
    return r;
  }
  function mkStore(tx, st) {
    const keyOf = v => v[st.keyPath];
    const api = {
      get: k => mkReq(tx, () => (st.rows.has(k) ? JSON.parse(st.rows.get(k)) : undefined)),
      put: v => mkReq(tx, () => { if (st.auto && v[st.keyPath] == null) v[st.keyPath] = ++st.seq; st.rows.set(keyOf(v), JSON.stringify(v)); return keyOf(v); }),
      add: v => mkReq(tx, () => { if (st.auto && v[st.keyPath] == null) v[st.keyPath] = ++st.seq; if (st.rows.has(keyOf(v))) throw new Error('ConstraintError'); st.rows.set(keyOf(v), JSON.stringify(v)); return keyOf(v); }),
      delete: k => mkReq(tx, () => { st.rows.delete(k); }),
      clear: () => mkReq(tx, () => { st.rows.clear(); }),
      count: () => mkReq(tx, () => st.rows.size),
      getAll: () => mkReq(tx, () => [...st.rows.values()].map(x => JSON.parse(x))),
      getAllKeys: () => mkReq(tx, () => [...st.rows.keys()]),
      createIndex() {},
      index: name => ({
        openCursor() {
          const r = { result: null, onsuccess: null };
          const rows = [...st.rows.values()].map(x => JSON.parse(x)).sort((a, b) => (a[name] || 0) - (b[name] || 0));
          let i = 0;
          const step = () => { tx._pending++; later(() => {
            const row = rows[i];
            r.result = row ? { value: row, delete() { st.rows.delete(keyOf(row)); }, continue() { i++; step(); } } : null;
            if (r.onsuccess) r.onsuccess({ target: r });
            tx._pending--; tx._settle(); }); };
          step();
          return r;
        }
      })
    };
    return api;
  }
  function mkDb(d) {
    return {
      objectStoreNames: { contains: n => d.stores.has(n) },
      createObjectStore(n, o) { const st = { keyPath: o.keyPath, auto: !!o.autoIncrement, seq: 0, rows: new Map() }; d.stores.set(n, st); return { createIndex() {} }; },
      transaction(names) {
        const tx = { _pending: 0, _failed: null, _done: false, oncomplete: null, onerror: null, onabort: null, error: null,
          _settle() { later(() => { if (tx._done || tx._pending > 0) return; tx._done = true;
            if (tx._failed) { tx.error = tx._failed; if (tx.onerror) tx.onerror({}); else if (tx.onabort) tx.onabort({}); }
            else if (tx.oncomplete) tx.oncomplete({}); }); },
          objectStore: n => mkStore(tx, d.stores.get(n)) };
        later(() => tx._settle());
        return tx;
      },
      close() {}
    };
  }
  return {
    open(name, ver) {
      const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      later(() => {
        let d = dbs.get(name);
        const fresh = !d || d.ver < ver;
        if (!d) { d = { ver: 0, stores: new Map() }; dbs.set(name, d); }
        req.result = mkDb(d);
        if (fresh) { d.ver = ver; if (req.onupgradeneeded) req.onupgradeneeded({}); }
        if (req.onsuccess) req.onsuccess({});
      });
      return req;
    },
    deleteDatabase(name) { dbs.delete(name); return {}; }
  };
}
function newIDB() {
  try { const { IDBFactory } = require('fake-indexeddb'); return new IDBFactory(); } catch (e) { return miniIDB(); }
}

const SB = 'https://x.supabase.co';
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = (body, status, headers) => new Response(body == null ? null : JSON.stringify(body),
  { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });

function slice(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('marker missing: ' + a); return src.slice(i, j + b.length); }

/* تبويب وهمي: يحمّل الموديول الحي ثم (اختيارياً) لفّة الجلسة الحية */
function mkTab(src, uid, net, idb, opt) {
  opt = opt || {};
  const ls = new Map();
  if (uid) ls.set('sydent.auth', JSON.stringify({ user: { id: uid }, access_token: 't' }));
  const storage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); },
    key: i => [...ls.keys()][i] || null, get length() { return ls.size; } };
  const listeners = {};
  const win = {
    indexedDB: idb, navigator: { onLine: true }, localStorage: storage, sessionStorage: storage,
    crypto: { randomUUID: () => require('crypto').randomUUID() },
    toasts: [], showToast(m) { win.toasts.push(m); },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev) { (listeners[ev] || []).forEach(fn => fn({})); },
    fetch: (input, init) => net(typeof input === 'string' ? input : input.url, init || {}),
    console: { warn() {}, info() {}, log() {}, error() {} }
  };
  win.window = win;
  if (opt.locks) win.navigator.locks = opt.locks;
  if (opt.bus) win.BroadcastChannel = opt.bus.Channel;
  const els = [];
  const el = () => { const e = { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } }; els.push(e); return e; };
  win.byId = id => els.find(e => e.id === id) || null;
  /* مؤقّتات الإقلاع الطويلة (تصريف 3ث · prefetch 8ث) تُكتم كي لا تتداخل مع السيناريو */
  /* opt.fast: الزمن مضغوط ×500 (مهلة الحفظ 25ث ← 50ms) لاختبار المهل نفسها */
  const st = opt.fast ? (fn, ms) => setTimeout(fn, ms / 500) : (fn, ms) => (ms >= 3000 ? 0 : setTimeout(fn, ms));
  const ctx = vm.createContext({ window: win, navigator: win.navigator, localStorage: storage, sessionStorage: storage,
    document: { getElementById: id => win.byId(id), createElement: el, body: el(), documentElement: el(), readyState: 'complete', addEventListener() {},
      dispatchEvent() {} },
    CustomEvent: function () {}, Response, AbortController, Promise, setTimeout: st, clearTimeout, setInterval() {}, console: win.console });
  vm.runInContext(slice(src, '/* ═══ SYDENT_OFFLINE_MODULE_START', '/* ═══ SYDENT_OFFLINE_MODULE_END ═══ */'), ctx);
  win.SyDentOffline.configureDrain(async () => ({ apikey: 'k', Authorization: 'Bearer t' }), recs => { win.synced = (win.synced || []).concat(recs); });
  if (opt.auth) {
    /* لفّة الجلسة الحية: من sydentLocalSessionUser حتى نهاية wrapGetUserForOfflineGrace */
    const authState = { signOutCalls: [], cbs: [], getUser: opt.getUser || (async () => ({ data: { user: { id: uid } }, error: null })) };
    win.sb = { auth: {
      getUser: jwt => authState.getUser(jwt),
      signOut: async opts => { authState.signOutCalls.push(opts); ls.delete('sydent.auth'); return { error: null }; },
      onAuthStateChange: cb => { authState.cbs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; }
    } };
    win.authState = authState;
    const a = src.indexOf('  function sydentLocalSessionUser() {');
    const b = src.indexOf('(function wrapGetUserForOfflineGrace() {');
    const c = src.indexOf('\n  })();\n', b);
    if (a < 0 || b < 0 || c < 0) throw new Error('auth wrapper markers missing');
    vm.runInContext('(function(){' + src.slice(a, c + 8) + '})();', ctx);
  }
  if (opt.wire) {
    /* قسم التوصيل الحي: الشارة + نافذة المراجعة + التصريف */
    if (!win.sb) win.sb = { auth: {} };
    win.sb.supabaseKey = 'k';
    win.sb.auth.getSession = async () => ({ data: { session: { access_token: 't' } } });
    win.dialogs = []; win.script = [];
    const next = (kind, o) => { win.dialogs.push({ kind, o }); return Promise.resolve(win.script.length ? win.script.shift() : (kind === 'confirm' ? false : null)); };
    win.SyDialog = { choose: o => next('choose', o), confirm: o => next('confirm', o), alert: o => next('alert', o) };
    const a = src.indexOf('(function () {\n  if (window.__sydentSyncWire) return;');
    const b = src.indexOf('\n})();\n', a);
    if (a < 0 || b < 0) throw new Error('sync wire markers missing');
    vm.runInContext(src.slice(a, b + 7), ctx);
  }
  return win;
}

/* Web Locks + BroadcastChannel مشتركان بين «تبويبات» الحامل */
function sharedLocks() {
  const held = new Set();
  return { held, request(name, o, cb) {
    if (held.has(name)) return Promise.resolve(cb(null));
    held.add(name);
    return Promise.resolve().then(() => cb({ name })).finally(() => held.delete(name));
  } };
}
function sharedBus() {
  const chans = [];
  return { Channel: function () { const me = this; me.onmessage = null; chans.push(me);
    me.postMessage = d => chans.forEach(c => { if (c !== me && c.onmessage) setImmediate(() => c.onmessage({ data: d })); }); } };
}

/* محرّك الإنجليزية الحقيقي (theme.js + i18n-en.js) — نفس تحميل prove-i18n-render */
function englishEngine() {
  const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/index.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(),
      write() {}, querySelector: () => null, getElementById: () => null, addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const theme = R('theme.js'), start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(R('i18n-en.js'), ctx);
  vm.runInContext(theme.slice(start, end), ctx);
  return t => ctx.window.SyI18n.t(t);
}
const AR = /[\u0600-\u06FF]/;

async function runAll(src, opt_sw, only) {
  const fails = [];
  const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ' [' + extra + ']' : '')); };
  const PURL = SB + '/rest/v1/patients?select=*&doctor_id=eq.' + U1;
  const G = { method: 'GET', headers: { Accept: 'application/json' } };
  const cacheKey = (uid, url) => [uid, url, 'application/json', ''].join('|');

  /* ══ أساس: كاش القراءة + العزل + الجدار ══ */
  if (!only) {
    const idb = newIDB();
    const t1 = mkTab(src, U1, async () => json([{ id: 'p1', name: 'مريض' }], 200, { 'content-range': '0-0/1' }), idb);
    let r = await t1.SyDentOffline.fetch(PURL, G);
    ok('base: online GET passes through', r.status === 200 && !r.headers.get('X-SyDent-Offline-Cache'));
    await sleep(25);
    t1.navigator.onLine = false;
    r = await t1.SyDentOffline.fetch(PURL, G);
    ok('base: offline GET served from cache', r.headers.get('X-SyDent-Offline-Cache') === '1' && r.headers.get('Content-Range') === '0-0/1');
    const t2 = mkTab(src, U2, async () => { throw new TypeError('Failed to fetch'); }, idb);
    t2.navigator.onLine = false;
    let leaked = true; try { await t2.SyDentOffline.fetch(PURL, G); } catch (e) { leaked = false; }
    ok('base: tenant isolation', !leaked);
    let threw = false; try { await t1.SyDentOffline.fetch(SB + '/rest/v1/payment_splits', { method: 'POST', body: '{}' }); } catch (e) { threw = true; }
    ok('base: non-whitelisted offline write rejected', threw);
    threw = false; try { await t1.SyDentOffline.fetch(SB + '/rest/v1/ledger_payments?id=eq.x', { method: 'PATCH', body: '{}' }); } catch (e) { threw = true; }
    ok('base: payment edit offline rejected', threw);
  }

  /* ══ الخطوة 1: كل خروج يمسح كاش القراءة ويُبقي الطابور ══ */
  if (!only || only === 's1') {
    const idb = newIDB();
    const t = mkTab(src, U1, async () => json([{ id: 'p1', name: 'مريض' }]), idb, { auth: true });
    await t.SyDentOffline.fetch(PURL, G); await sleep(25);
    t.localStorage.setItem('sydent.prefetch.' + U1, '2026-11-20');
    t.navigator.onLine = false;
    await t.SyDentOffline.fetch(SB + '/rest/v1/appointments', { method: 'POST', body: JSON.stringify({ patient_id: 'p1', date: '2026-11-21' }), headers: { 'Content-Type': 'application/json' } });
    t.navigator.onLine = true;
    ok('s1: cache populated before logout', !!(await t.SyDentOffline._get(cacheKey(U1, PURL))));
    ok('s1: wipeCache exported', typeof t.SyDentOffline.wipeCache === 'function');
    const p = t.sb.auth.signOut({ scope: 'local' });
    ok('s1: real signOut starts synchronously (not behind the wipe)', t.authState.signOutCalls.length === 1);
    const res = await p;
    ok('s1: signOut result and options pass through', res && res.error === null && t.authState.signOutCalls[0] && t.authState.signOutCalls[0].scope === 'local');
    ok('s1: patient rows gone from disk after logout', !(await t.SyDentOffline._get(cacheKey(U1, PURL))));
    ok('s1: pending offline writes survive logout', (await t.SyDentOffline._outboxAll()).length === 1);
    ok('s1: prefetch stamp cleared', t.localStorage.getItem('sydent.prefetch.' + U1) === null);

    /* خروج لم يمرّ بالزر: SIGNED_OUT */
    const idb2 = newIDB();
    const s = mkTab(src, U1, async () => json([{ id: 'p1' }]), idb2, { auth: true });
    await s.SyDentOffline.fetch(PURL, G); await sleep(25);
    ok('s1: SIGNED_OUT listener registered', s.authState.cbs.length >= 1);
    s.authState.cbs.forEach(cb => cb('TOKEN_REFRESHED', {}));
    await sleep(25);
    ok('s1: other auth events do not wipe', !!(await s.SyDentOffline._get(cacheKey(U1, PURL))));
    s.authState.cbs.forEach(cb => cb('SIGNED_OUT', null));
    await sleep(25);
    ok('s1: SIGNED_OUT wipes the read cache', !(await s.SyDentOffline._get(cacheKey(U1, PURL))));
  }

  /* ══ الخطوة 2: 409 ليس «تمّ» إلا لتكرار العملية نفسها على المفتاح الأساسي ══ */
  if (!only || only === 's2') {
    const PG = {
      fk:    { code: '23503', message: 'insert or update on table "ledger_payments" violates foreign key constraint "ledger_payments_patient_id_fkey"', details: 'Key (patient_id)=(p1) is not present in table "patients".' },
      pkey:  { code: '23505', message: 'duplicate key value violates unique constraint "ledger_payments_pkey"', details: 'Key (id)=(x) already exists.' },
      other: { code: '23505', message: 'duplicate key value violates unique constraint "appointments_slot_key"', details: 'Key (doctor_id, date, time)=(a, b, c) already exists.' }
    };
    const one = async (table, method, pg, urlTail) => {
      const idb = newIDB();
      const t = mkTab(src, U1, async () => json(pg, 409), idb);
      t.navigator.onLine = false;
      await t.SyDentOffline.fetch(SB + '/rest/v1/' + table + (urlTail || ''), { method, body: JSON.stringify({ patient_id: 'p1', amount: 5 }), headers: { 'Content-Type': 'application/json' } });
      t.navigator.onLine = true;
      const d = await t.SyDentOffline.drain();
      const ob = await t.SyDentOffline._outboxAll();
      return { d, ob, synced: (t.synced || []).length };
    };
    let x = await one('ledger_payments', 'POST', PG.fk);
    ok('s2: payment hitting a deleted patient (409 FK) is kept, not reported synced', x.d.synced === 0 && x.d.failed === 1 && x.ob.length === 1 && x.ob[0].status === 'failed' && x.synced === 0, JSON.stringify(x.d));
    ok('s2: the server reason is recorded on the op', x.ob[0] && /23503/.test(x.ob[0].lastError || '') && /foreign key/.test(x.ob[0].lastError || ''));
    x = await one('ledger_payments', 'POST', PG.pkey);
    ok('s2: replay of an already-delivered insert (409 pkey) counts as done', x.d.synced === 1 && x.ob.length === 0 && x.synced === 1);
    x = await one('appointments', 'POST', PG.other);
    ok('s2: 409 on another unique constraint is a failure', x.d.failed === 1 && x.ob.length === 1);
    x = await one('appointments', 'PATCH', PG.pkey, '?id=eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    ok('s2: 409 on an edit is a failure', x.d.failed === 1 && x.ob.length === 1);
    x = await one('audit_log', 'POST', PG.pkey);
    ok('s2: 409 on a table without injected id is a failure', x.d.failed === 1 && x.ob.length === 1);
  }

  /* ══ الخطوة 3: العمليات الفاشلة تُعرَض وتُدار — لا حذف صامت ══ */
  if (!only || only === 's3') {
    const WEEK = 8 * 24 * 3600 * 1000;
    const seed = async (t, table, method, row, urlTail) => {
      t.navigator.onLine = false;
      await t.SyDentOffline.fetch(SB + '/rest/v1/' + table + (urlTail || ''), { method, body: JSON.stringify(row), headers: { 'Content-Type': 'application/json' } });
      t.navigator.onLine = true;
    };
    const FK = { code: '23503', message: 'violates foreign key constraint "ledger_payments_patient_id_fkey"', details: '' };
    const idb = newIDB();
    let reject = true;
    const t = mkTab(src, U1, async () => (reject ? json(FK, 409) : json(null, 201)), idb, { wire: true });
    await seed(t, 'appointments', 'POST', { patient_id: 'p1', patient_name: 'سامر الأحمد', date: '2026-11-21', time: '10:30:00' });
    await seed(t, 'ledger_payments', 'POST', { patient_id: 'p1', amount: 50000, currency: 'SYP', date: '2026-11-20' });
    await seed(t, 'audit_log', 'POST', { action: 'x' });
    const other = mkTab(src, U2, async () => json(FK, 409), idb);
    await seed(other, 'appointments', 'POST', { patient_id: 'p9', patient_name: 'غريب', date: '2026-11-22', time: '09:00:00' });
    for (let i = 0; i < 5; i++) await t.SyDentOffline.drain();
    /* تقادُم كل العمليات أكثر من أسبوع ثم تصريف: الكنّاس يعمل */
    for (const r of await t.SyDentOffline._outboxAll()) { r.createdAt = Date.now() - WEEK; await t.SyDentOffline._outboxPut(r); }
    await t.SyDentOffline.drain();
    let mine = await t.SyDentOffline.outboxList();
    ok('s3: a failed appointment and payment are never dropped automatically', mine.filter(o => o.table !== 'audit_log').length === 2 && mine.every(o => o.table === 'audit_log' || o.status === 'failed'), JSON.stringify(mine.map(o => o.table + ':' + o.status)));
    ok('s3: an expired failed audit entry is still swept', !mine.some(o => o.table === 'audit_log'));
    ok('s3: the list shows only the signed-in user\'s operations, without url or headers', mine.every(o => !o.url && !o.headers && !(o.row && o.row.patient_name === 'غريب')));
    ok('s3: another user cannot discard my operation', (await other.SyDentOffline.outboxDiscard(mine[0].id)) === false && (await t.SyDentOffline.outboxList()).length === 2);

    /* الشارة: نقرها يفتح النافذة بالعمليتين */
    const badge = t.byId('sydent-sync-badge');
    ok('s3: sync badge exists and is clickable', !!badge && typeof badge.onclick === 'function');
    t.script = [null];
    badge.onclick(); await sleep(60);
    const first = t.dialogs[0];
    ok('s3: clicking the badge lists the rejected operations', !!first && first.kind === 'choose' && first.o.choices.length === 2, first ? JSON.stringify(first.o.choices) : 'no dialog');
    const flat = first ? first.o.choices.map(c => c.label.replace(/[\u2066-\u2069]/g, '').replace(/^[^\u0600-\u06FF]+/, '') + ' | ' + c.sub.replace(/[\u2066-\u2069]/g, '')) : [];
    ok('s3: appointment row shows kind, date, time and patient', flat.indexOf('موعد جديد · 2026-11-21 10:30 | سامر الأحمد') !== -1, flat.join(' ## '));
    ok('s3: payment row shows amount, currency, date and the reason', flat.indexOf('دفعة · 50000 ل.س · 2026-11-20 | السجل المرتبط بها حُذف من جهاز آخر (HTTP 409 · 23503)') !== -1, flat.join(' ## '));

    /* حذف: اختيار العملية الأولى ← «حذف» ← تأكيد */
    t.dialogs = []; t.script = [0, 1, true];
    badge.onclick(); await sleep(90);
    ok('s3: delete asks for a danger confirmation first', t.dialogs.length === 3 && t.dialogs[2].kind === 'confirm' && t.dialogs[2].o.danger === true);
    mine = await t.SyDentOffline.outboxList();
    ok('s3: confirmed delete removes exactly that operation', mine.length === 1 && mine[0].table === 'ledger_payments');
    /* إلغاء التأكيد لا يحذف */
    t.dialogs = []; t.script = [0, 1, false];
    badge.onclick(); await sleep(90);
    ok('s3: declining the confirmation deletes nothing', (await t.SyDentOffline.outboxList()).length === 1);
    /* إعادة المحاولة بعد زوال سبب الرفض */
    reject = false; t.dialogs = []; t.script = [0, 0]; t.toasts.length = 0;
    badge.onclick(); await sleep(120);
    ok('s3: retry uploads the operation and clears it', (await t.SyDentOffline.outboxList()).length === 0 && t.toasts.some(m => /تم رفع العملية/.test(m)), t.toasts.join(' | '));
    ok('s3: the other user\'s failed operation was untouched throughout', (await other.SyDentOffline.outboxList()).length === 1);

    /* الإنجليزية: كل عقدة نص من النافذتين تمرّ بالمحرّك الحقيقي بلا حرف عربي (عدا اسم المريض) */
    const tr = englishEngine();
    const d2 = { title: 'x' };
    const texts = [];
    (first ? [first.o.title, first.o.message, first.o.cancelText] : []).forEach(x => texts.push(x));
    (first ? first.o.choices : []).forEach(c => { texts.push(c.label); if (c.sub !== 'سامر الأحمد') texts.push(c.sub); });
    const t3 = mkTab(src, U1, async () => json({ code: '42501', message: 'rls' }, 403), newIDB(), { wire: true });
    await seed(t3, 'appointments', 'PATCH', { time: '11:00:00' }, '?id=eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await seed(t3, 'appointments', 'DELETE', {}, '?id=eq.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await seed(t3, 'ledger_payments', 'POST', { patient_id: 'p1', amount: 20, currency: 'USD', date: '2026-11-20' });
    await t3.SyDentOffline.drain();
    t3.script = [0, 1, false];
    t3.byId('sydent-sync-badge').onclick(); await sleep(90);
    t3.dialogs.forEach(d => {
      [d.o.title, d.o.cancelText, d.o.confirmText].forEach(x => { if (x) texts.push(x); });
      String(d.o.message || '').split('\n').forEach(x => { if (x) texts.push(x); });
      (d.o.choices || []).forEach(c => { texts.push(c.label); texts.push(c.sub); });
    });
    ['✅ تم رفع العملية', '⚠️ لم تُرفع العملية — ما زال الخادم يرفضها', 'حُذفت العملية', '⚠️ 2 عملية لم تُرفع — اضغط شارة المزامنة للمراجعة'].forEach(x => texts.push(x));
    ok('s3: enough English samples collected', texts.length >= 20, String(texts.length));
    texts.forEach(x => {
      const en = tr(x);
      const out = en == null ? x : en;
      ok('s3: English engine leaves no Arabic in «' + x.replace(/[\u2066-\u2069]/g, '') + '»', !AR.test(out), out);
      ok('s3: English keeps the numbers of «' + x.replace(/[\u2066-\u2069]/g, '') + '»', (x.match(/\d+/g) || []).join(',') === (out.match(/\d+/g) || []).join(','), out);
    });
  }

  /* ══ الخطوة 4: تبويبان مفتوحان يصرّفان الطابور مرة واحدة ══ */
  if (!only || only === 's4') {
    const run = async (locks) => {
      const idb = newIDB(), sent = [], bus = sharedBus();
      const net = async (u, i) => { sent.push((i.method || 'GET') + ' ' + u.replace(SB, '')); await sleep(30); return json(null, 201); };
      const a = mkTab(src, U1, net, idb, { locks, bus }), b = mkTab(src, U1, net, idb, { locks, bus });
      let bSeen = [];
      b.SyDentOffline.onOutboxChange((p, f) => bSeen.push(p + f));
      a.navigator.onLine = false;
      await a.SyDentOffline.fetch(SB + '/rest/v1/audit_log', { method: 'POST', body: JSON.stringify({ action: 'x' }), headers: { 'Content-Type': 'application/json' } });
      await a.SyDentOffline.fetch(SB + '/rest/v1/appointments', { method: 'POST', body: JSON.stringify({ patient_id: 'p1', date: '2026-11-21' }), headers: { 'Content-Type': 'application/json' } });
      a.navigator.onLine = true;
      await sleep(30); bSeen = [];
      const res = await Promise.all([a.SyDentOffline.drain(), b.SyDentOffline.drain()]);
      await sleep(40);
      return { sent, res, left: (await a.SyDentOffline._outboxAll()).length, bSeen, a, b, locks };
    };
    const L = sharedLocks();
    let x = await run(L);
    ok('s4: two tabs → every queued operation is sent exactly once', x.sent.length === 2 && x.sent.filter(v => v.indexOf('audit_log') !== -1).length === 1, x.sent.join(' , '));
    ok('s4: queue fully drained and the lock released', x.left === 0 && L.held.size === 0);
    ok('s4: the tab that lost the lock reports busy, not a failure', x.res.some(r => r.busy) && x.res.reduce((n, r) => n + r.synced, 0) === 2 && x.res.every(r => r.failed === 0), JSON.stringify(x.res));
    ok('s4: the other tab\'s badge is told the queue emptied', x.bSeen.length > 0 && x.bSeen[x.bSeen.length - 1] === 0, JSON.stringify(x.bSeen));
    x.b.navigator.onLine = false;
    await x.b.SyDentOffline.fetch(SB + '/rest/v1/appointments', { method: 'POST', body: JSON.stringify({ patient_id: 'p2', date: '2026-11-22' }), headers: { 'Content-Type': 'application/json' } });
    x.b.navigator.onLine = true;
    const again = await x.b.SyDentOffline.drain();
    ok('s4: the losing tab can drain later (lock is not stuck)', again.synced === 1);
    /* متصفح بلا Web Locks: السلوك السابق يعمل */
    x = await run(undefined);
    ok('s4: without Web Locks the queue still drains', x.left === 0);
    /* request يرفض (SecurityError) ⇒ لا رمي ولا ضياع */
    const broken = { request() { return Promise.reject(new Error('SecurityError')); } };
    x = await run(broken);
    ok('s4: a rejecting lock manager never throws and loses nothing', x.left === 2 && x.res.every(r => r.synced === 0 && r.failed === 0));
  }

  /* ══ الخطوة 5: الخروج لا يحذف ما لم يُرفع — يرفعه أولاً أو يسأل ══ */
  if (!only || only === 's5') {
    const q = async (t, table) => { t.navigator.onLine = false;
      await t.SyDentOffline.fetch(SB + '/rest/v1/' + table, { method: 'POST', body: JSON.stringify({ patient_id: 'p1', date: '2026-11-21', amount: 5 }), headers: { 'Content-Type': 'application/json' } });
      t.navigator.onLine = true; };
    let t = mkTab(src, U1, async () => json(null, 201), newIDB(), { wire: true });
    ok('s5: guard exported', !!t.SyDentSyncGuard && typeof t.SyDentSyncGuard.beforeLogout === 'function');
    ok('s5: nothing pending → logout proceeds without a question', (await t.SyDentSyncGuard.beforeLogout()) === true && t.dialogs.length === 0);
    await q(t, 'appointments');
    ok('s5: pending + online → uploaded first, then logout proceeds silently', (await t.SyDentSyncGuard.beforeLogout()) === true && t.dialogs.length === 0 && (await t.SyDentOffline._outboxAll()).length === 0);
    await q(t, 'audit_log'); t.navigator.onLine = false;
    ok('s5: only an audit entry pending → no question', (await t.SyDentSyncGuard.beforeLogout()) === true && t.dialogs.length === 0);

    t = mkTab(src, U1, async () => { throw new TypeError('Failed to fetch'); }, newIDB(), { wire: true });
    await q(t, 'ledger_payments'); t.navigator.onLine = false;
    t.script = [false];
    ok('s5: pending + offline → asks, and «stay» cancels the logout', (await t.SyDentSyncGuard.beforeLogout()) === false && t.dialogs.length === 1 && t.dialogs[0].kind === 'confirm');
    t.script = [true];
    ok('s5: «sign out» proceeds', (await t.SyDentSyncGuard.beforeLogout()) === true);
    ok('s5: the pending payment is still queued either way', (await t.SyDentOffline._outboxAll()).length === 1);
    const tr = englishEngine(), d = t.dialogs[0].o;
    [d.title, d.confirmText, d.cancelText].concat(String(d.message).split('\n')).forEach(x => {
      const en = tr(x); ok('s5: English engine leaves no Arabic in «' + x + '»', en != null && !AR.test(en), String(en));
    });

    /* كل زر خروج يمرّ بالحارس، و sbSignOut لم يعد يمسح الطابور */
    const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const sbso = src.slice(src.indexOf('window.sbSignOut = async function() {'), src.indexOf("window.location.href = 'auth.html';", src.indexOf('window.sbSignOut = async function() {')));
    ok('s5: sbSignOut no longer wipes the queue', sbso.length > 0 && !/SyDentOffline\.wipe\(\)/.test(sbso));
    ok('s5: sbSignOut asks the guard before signing out', /SyDentSyncGuard\.beforeLogout\(\)\)\) return;[\s\S]*auth\.signOut\(\)/.test(sbso));
    const sb = R('sidebar.js'), lo = sb.slice(sb.indexOf('window.doLogout = async function'), sb.indexOf('/* ─── Unified toast'));
    ok('s5: sidebar logout asks the guard before signing out', /SyDentSyncGuard\.beforeLogout\(\)\)\) return;[\s\S]*auth\.signOut\(/.test(lo));
    ['doctors.html', 'provider-reports.html'].forEach(f => {
      ok('s5: ' + f + ' logout asks the guard', /async function doLogout\(\) \{\s+try \{ if \(window\.SyDentSyncGuard && !\(await window\.SyDentSyncGuard\.beforeLogout\(\)\)\) return; \}/.test(R(f)));
    });
  }

  /* ══ الخطوة 6: سقف كاش الأصول يسع الأسطول مرتين (توكن قديم + جديد) ══ */
  if (!only || only === 's6') {
    const sw = (opt_sw || fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
    const cap = parseInt((/MAX_ASSETS = (\d+)/.exec(sw) || [])[1], 10);
    const set = new Set();
    fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).forEach(f => {
      const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of h.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|webp|png|svg|woff2))(?:\?[^"]*)?"/g)) set.add(m[1].replace(/^\//, ''));
    });
    try { fs.readdirSync(path.join(ROOT, 'fonts')).forEach(f => set.add('fonts/' + f)); } catch (e) {}
    ['tour.js', 'guides.js', 'i18n-en.js'].forEach(f => { if (fs.existsSync(path.join(ROOT, f))) set.add(f); });
    ok('s6: asset census is sane', set.size > 60, String(set.size));
    ok('s6: asset cache cap holds the whole fleet twice', cap >= set.size * 2, 'cap=' + cap + ' assets=' + set.size);
  }

  /* ══ الخطوة 7: مدة قصوى للعمل بلا اتصال + عمر أقصى لمدخلات الكاش ══ */
  if (!only || only === 's7') {
    const DAY = 24 * 3600 * 1000, SEEN = 'sydent.seen.' + U1;
    const boot = async () => { const idb = newIDB();
      const t = mkTab(src, U1, async () => json([{ id: 'p1', name: 'مريض' }]), idb);
      await t.SyDentOffline.fetch(PURL, G); await sleep(25); return t; };
    let t = await boot();
    ok('s7: a successful server read stamps «last seen»', Math.abs(Date.now() - parseInt(t.localStorage.getItem(SEEN), 10)) < 5000);
    t.navigator.onLine = false;
    let r = await t.SyDentOffline.fetch(PURL, G).catch(() => null);
    ok('s7: within the limit the cache is served offline', !!r && r.headers.get('X-SyDent-Offline-Cache') === '1');
    /* 15 يوماً بلا اتصال */
    await t.SyDentOffline.fetch(SB + '/rest/v1/appointments', { method: 'POST', body: JSON.stringify({ patient_id: 'p1', date: '2026-11-21' }), headers: { 'Content-Type': 'application/json' } });
    t.localStorage.setItem(SEEN, String(Date.now() - 15 * DAY));
    r = await t.SyDentOffline.fetch(PURL, G).catch(() => null);
    await sleep(30);
    ok('s7: past the limit nothing is served from the cache', r === null);
    ok('s7: past the limit the patient rows are removed from disk', !(await t.SyDentOffline._get(cacheKey(U1, PURL))));
    ok('s7: writes queued offline are not touched by the limit', (await t.SyDentOffline._outboxAll()).length === 1);
    const bar = t.byId('sydent-stale-banner');
    ok('s7: the user is told why and what to do', !!bar && bar.style.display === 'block' && /14/.test(bar.textContent || '') && /اتصل بالإنترنت/.test(bar.textContent || ''));
    const en = englishEngine()(bar ? bar.textContent : '');
    ok('s7: banner passes the English engine', en != null && !AR.test(en) && /14/.test(en), String(en));
    /* عودة الاتصال: قراءة ناجحة تصفّر العدّاد وتخفي الشريط */
    t.navigator.onLine = true;
    await t.SyDentOffline.fetch(PURL + '&again=1', G); await sleep(25);
    ok('s7: reconnecting hides the banner', bar && bar.style.display === 'none');
    /* جهاز بلا ختم (سبق الميزة): يُخدَم ويبدأ العدّاد */
    t = await boot(); t.localStorage.removeItem(SEEN); t.navigator.onLine = false;
    r = await t.SyDentOffline.fetch(PURL, G).catch(() => null);
    ok('s7: a device from before this feature keeps working and starts the clock', !!r && !!t.localStorage.getItem(SEEN));
    /* مدخلة عمرها 31 يوماً لا تُخدَم ولو كانت الجلسة حديثة */
    t = await boot();
    const rec = await t.SyDentOffline._get(cacheKey(U1, PURL));
    rec.savedAt = Date.now() - 31 * DAY; await t.SyDentOffline._put(rec);
    t.navigator.onLine = false;
    r = await t.SyDentOffline.fetch(PURL, G).catch(() => null);
    ok('s7: an entry not refreshed for 31 days is not served', r === null);
  }

  /* ══ الخطوة 8: مهلة الحفظ + إعادة المحاولة بلا تكرار ══ */
  if (!only || only === 's8') {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const H = extra => Object.assign({ 'content-type': 'application/json', apikey: 'k', authorization: 'Bearer t', prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, extra || {});
    const PAY = { doctor_id: U1, patient_id: 'p1', amount: 50000, method: 'cash', date: '2026-11-20', currency: 'SYP' };
    const PK = { code: '23505', message: 'duplicate key value violates unique constraint "ledger_payments_pkey"', details: 'Key (id)=(x) already exists.' };
    const mk = (net, opt) => { const calls = []; const t = mkTab(src, U1, (u, i) => { calls.push({ u, i, body: i.body ? JSON.parse(i.body) : null }); return net(u, i, calls); }, newIDB(), opt); t.calls = calls; return t; };
    const post = (t, table, row, h, tail) => t.SyDentOffline.fetch(SB + '/rest/v1/' + table + (tail || '?select=*'), { method: 'POST', headers: H(h), body: JSON.stringify(row) });

    /* المسار العادي */
    let t = mk(async (u, i) => json(JSON.parse(i.body), 201));
    let r = await post(t, 'ledger_payments', PAY);
    ok('s8: online insert carries a client uuid and passes through', r.status === 201 && UUID.test(t.calls[0].body.id) && t.calls.length === 1);
    r = await post(t, 'ledger_payments', PAY);
    ok('s8: an identical payment after a SUCCESS is a new payment (new id)', UUID.test(t.calls[1].body.id) && t.calls[1].body.id !== t.calls[0].body.id);
    await post(t, 'appointments', [{ patient_id: 'p1', date: '2026-11-21' }, { patient_id: 'p2', date: '2026-11-21' }], { accept: 'application/json' }, '?columns=%22patient_id%22%2C%22date%22&select=id');
    const c3 = t.calls[2];
    ok('s8: array insert — every row gets an id and the columns list includes it', c3.body.length === 2 && c3.body.every(x => UUID.test(x.id)) && decodeURIComponent(c3.u).indexOf('columns="patient_id","date","id"') !== -1 && c3.u.indexOf('&select=id') !== -1, c3.u);
    await post(t, 'appointments', { patient_id: 'p1' }, { prefer: 'return=representation,resolution=merge-duplicates' });
    await post(t, 'appointments', { patient_id: 'p1' }, null, '?on_conflict=id');
    await post(t, 'appointments', { id: 'mine', patient_id: 'p1' });
    ok('s8: upserts and rows with their own id are sent untouched', t.calls[3].body.id === undefined && t.calls[4].body.id === undefined && t.calls[5].body.id === 'mine');
    const init6 = { method: 'POST', headers: H(), body: JSON.stringify({ name: 'x' }) };
    let seen6 = null; t.fetch = (input, init) => { seen6 = init; return Promise.resolve(json({}, 201)); };
    await t.SyDentOffline.fetch(SB + '/rest/v1/treatments', init6);
    ok('s8: a write to any other table is forwarded exactly as given (no id, no timeout)', seen6 === init6);
    const init7 = { method: 'PATCH', headers: H(), body: '{}' };
    await t.SyDentOffline.fetch(SB + '/rest/v1/ledger_payments?id=eq.x', init7);
    ok('s8: editing a payment is not put under the timeout', seen6 === init7);

    /* فشل شبكي ثم إعادة: المعرّف نفسه */
    let mode = 'down';
    t = mk(async (u, i) => {
      if ((i.method || 'GET') === 'GET') return json({ id: 'server-row', amount: 50000 }, 200);
      if (mode === 'down') throw new TypeError('Failed to fetch');
      if (mode === 'dup') return json(PK, 409);
      if (mode === 'fk') return json({ code: '23503', message: 'violates foreign key constraint', details: '' }, 409);
      return json(JSON.parse(i.body), 201);
    });
    let err = null; try { await post(t, 'ledger_payments', PAY); } catch (e) { err = e; }
    const id1 = t.calls[0].body.id;
    ok('s8: a network failure surfaces as before', !!err && /Failed to fetch/.test(err.message));
    mode = 'dup';
    r = await post(t, 'ledger_payments', PAY);
    const posts = t.calls.filter(c => c.i.method === 'POST'), gets = t.calls.filter(c => (c.i.method || 'GET') === 'GET');
    ok('s8: the retry of the same payment reuses the same id', posts.length === 2 && posts[1].body.id === id1);
    ok('s8: first attempt had landed (409 pkey) → the page gets the saved row as a success', r.status === 201 && (await r.json()).id === 'server-row');
    ok('s8: the saved row is re-read by id with the caller\'s select and credentials', gets.length === 1 && gets[0].u === SB + '/rest/v1/ledger_payments?id=in.(' + id1 + ')&select=*' && gets[0].i.headers.authorization === 'Bearer t' && gets[0].i.headers.accept === 'application/vnd.pgrst.object+json', gets[0] && gets[0].u);
    mode = 'ok';
    await post(t, 'ledger_payments', PAY);
    ok('s8: once answered, the next identical payment is a new one', t.calls[t.calls.length - 1].body.id !== id1);
    /* الأولى لم تصل: الإعادة تُدرج بالمعرّف نفسه */
    mode = 'down'; try { await post(t, 'appointments', { patient_id: 'p7', date: '2026-11-23' }); } catch (e) {}
    const idA = t.calls[t.calls.length - 1].body.id;
    mode = 'ok'; r = await post(t, 'appointments', { patient_id: 'p7', date: '2026-11-23' });
    ok('s8: first attempt never arrived → the retry inserts with the same id', r.status === 201 && t.calls[t.calls.length - 1].body.id === idA);
    /* حمولة مختلفة بعد فشل = معرّف جديد */
    mode = 'down'; try { await post(t, 'appointments', { patient_id: 'p8', date: '2026-11-23' }); } catch (e) {}
    const idB = t.calls[t.calls.length - 1].body.id;
    mode = 'ok'; await post(t, 'appointments', { patient_id: 'p8', date: '2026-11-24' });
    ok('s8: a different payload after a failure gets a new id', t.calls[t.calls.length - 1].body.id !== idB);
    /* سلسلة مواعيد أُعيدت وكانت قد وصلت: الصفوف تعود بترتيب الإدراج */
    {
      let m2 = 'down', sentIds = null;
      const t9 = mk(async (u, i) => {
        if ((i.method || 'GET') === 'GET') return json([{ id: sentIds[1], n: 2 }, { id: sentIds[0], n: 1 }], 200);
        sentIds = JSON.parse(i.body).map(x => x.id);
        if (m2 === 'down') throw new TypeError('Failed to fetch');
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "appointments_pkey"', details: '' }, 409);
      });
      const two = [{ patient_id: 'p1', date: '2026-12-01' }, { patient_id: 'p1', date: '2026-12-08' }];
      try { await post(t9, 'appointments', two, { accept: 'application/json' }, '?columns=%22patient_id%22%2C%22date%22&select=id,n'); } catch (e) {}
      m2 = 'dup';
      const r9 = await post(t9, 'appointments', two, { accept: 'application/json' }, '?columns=%22patient_id%22%2C%22date%22&select=id,n');
      const back = await r9.json();
      ok('s8: a recovered series comes back in insert order', r9.status === 201 && back.length === 2 && back[0].n === 1 && back[1].n === 2, JSON.stringify(back));
    }
    /* 409 حقيقي على إعادة = يمرّ كما هو */
    mode = 'down'; try { await post(t, 'ledger_payments', Object.assign({}, PAY, { amount: 7 })); } catch (e) {}
    mode = 'fk'; r = await post(t, 'ledger_payments', Object.assign({}, PAY, { amount: 7 }));
    ok('s8: a real conflict on a retry is not masked as success', r.status === 409);

    /* المهلة (زمن مضغوط) */
    let aborted = false;
    t = mk((u, i) => new Promise((res, rej) => { if (i.signal) i.signal.addEventListener('abort', () => { aborted = true; const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }), { fast: true });
    /* سباقٌ مع موعدٍ نهائي: بلا المهلة يعلَق الطلب أبداً، والمثبت يجب أن يحمرّ لا أن يعلَق معه */
    err = null; try { await Promise.race([post(t, 'appointments', { patient_id: 'p1', date: '2026-11-21' }), sleep(600).then(() => { throw new Error('still hanging'); })]); } catch (e) { err = e; }
    ok('s8: a hung appointment save is cut with a clear message', aborted && !!err && /الشبكة لا تستجيب/.test(err.message) && err.name === '');
    ok('s8: the slow-network notice appears before the cut', t.toasts.some(m => /الشبكة بطيئة/.test(m)));
    const idT = t.calls[0].body.id;
    t.fetch = (input, init) => { t.calls.push({ u: input, i: init, body: JSON.parse(init.body) }); return Promise.resolve(json(JSON.parse(init.body), 201)); };
    await post(t, 'appointments', { patient_id: 'p1', date: '2026-11-21' });
    ok('s8: retry after a timeout reuses the id', t.calls[t.calls.length - 1].body.id === idT);
    /* جدول آخر معلَّق: تنبيه بلا قطع */
    let resolveLater, sig = 'unset';
    t = mk((u, i) => new Promise(res => { sig = i.signal; resolveLater = () => res(json({}, 201)); }), { fast: true });
    const pend = t.SyDentOffline.fetch(SB + '/rest/v1/treatments', { method: 'POST', headers: H(), body: '{}' });
    await sleep(120);
    ok('s8: a slow save to another table is announced but never cut', sig === undefined && t.toasts.some(m => /الشبكة بطيئة/.test(m)));
    resolveLater(); ok('s8: … and completes normally', (await pend).status === 201);
    /* إشارة قطع من المُستدعي تُحترم */
    const own = new AbortController(); let got = null;
    t = mk(async (u, i) => { got = i.signal; return json({}, 201); });
    await t.SyDentOffline.fetch(SB + '/rest/v1/appointments?id=eq.x', { method: 'PATCH', headers: H(), body: '{}', signal: own.signal });
    ok('s8: a caller-supplied abort signal is kept', got === own.signal);
    /* طابور الأوفلاين: إدراج المصفوفة يحمل عمود المعرّف */
    t = mk(async () => json({}, 201)); t.navigator.onLine = false;
    await post(t, 'appointments', [{ patient_id: 'p1', date: '2026-11-21' }], { accept: 'application/json' }, '?columns=%22patient_id%22%2C%22date%22');
    const q = (await t.SyDentOffline._outboxAll())[0];
    ok('s8: an array insert queued offline keeps its injected id on upload', !!q && decodeURIComponent(q.url).indexOf('"id"') !== -1 && UUID.test(JSON.parse(q.body)[0].id), q && q.url);
    const tr8 = englishEngine();
    ['⏳ الشبكة بطيئة — ما زال الحفظ جارياً', 'الشبكة لا تستجيب — لم يتأكد الحفظ، أعد المحاولة'].forEach(x => { const en = tr8(x); ok('s8: English engine leaves no Arabic in «' + x + '»', en != null && !AR.test(en), String(en)); });
  }

  /* ══ تطوير 3: القوائم المرجعية الثابتة — فوراً من الكاش، بلا أي جدول مالي أو بوابة ══ */
  if (!only || only === 'd3') {
    const T = SB + '/rest/v1/appointment_types?select=*&doctor_id=eq.' + U1;
    const quick = (p, ms) => Promise.race([p.then(r => r, () => 'rejected'), sleep(ms || 150).then(() => 'pending')]);
    const bus = sharedBus();
    let body = [{ id: 't1', name: 'فحص' }], hang = false, calls = 0;
    const net = async (u, i) => { if ((i.method || 'GET') !== 'GET') return json({}, 201); calls++; if (hang) return new Promise(() => {}); return json(body); };
    const idb = newIDB();
    const t = mkTab(src, U1, net, idb, { bus });
    let r = await t.SyDentOffline.fetch(T, G); await sleep(25);
    ok('d3: first read comes from the server', !r.headers.get('X-SyDent-Offline-Cache') && calls === 1);
    hang = true;
    r = await quick(t.SyDentOffline.fetch(T, G));
    ok('d3: a recent copy of a reference list is returned at once, without waiting for the network', r !== 'pending' && r !== 'rejected' && r.headers.get('X-SyDent-Offline-Cache') === '1');
    ok('d3: … while the server is still asked in the background', calls === 2);
    hang = false; body = [{ id: 't1', name: 'فحص' }, { id: 't2', name: 'تنظيف' }];
    await t.SyDentOffline.fetch(T, G); await sleep(30);
    r = await t.SyDentOffline.fetch(T, G);
    ok('d3: the background answer is what the next read shows', (await r.json()).length === 2);
    /* كتابة من هذا التبويب ⇒ القراءة التالية من الخادم */
    await t.SyDentOffline.fetch(SB + '/rest/v1/appointment_types', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    hang = true;
    ok('d3: after saving to that table the next read waits for the server', (await quick(t.SyDentOffline.fetch(T, G))) === 'pending');
    /* سباق: تحديثٌ بالخلفية انطلق قبل الحفظ ووصل بعده لا يُعتمد كنسخة حديثة */
    {
      let release = null, phase = 'ok', n2 = 0;
      const net2 = async (u, i) => { if ((i.method || 'GET') !== 'GET') return json({}, 201); n2++;
        if (phase === 'slow') return new Promise(res => { release = () => res(json([{ id: 'pre-save' }])); });
        if (phase === 'hang') return new Promise(() => {});
        return json([{ id: 'x' }]); };
      const tr = mkTab(src, U1, net2, newIDB(), { bus: sharedBus() });
      await tr.SyDentOffline.fetch(T, G); await sleep(25);
      phase = 'slow'; await tr.SyDentOffline.fetch(T, G);                    /* من الكاش + تحديث خلفي معلَّق */
      phase = 'ok'; await tr.SyDentOffline.fetch(SB + '/rest/v1/appointment_types', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      await sleep(5); release(); await sleep(30);                            /* التحديث القديم يصل بعد الحفظ */
      phase = 'hang';
      ok('d3: a background refresh that started before a save is not trusted after it', (await quick(tr.SyDentOffline.fetch(T, G))) === 'pending');
    }
    /* كتابة من تبويب آخر */
    hang = false; await t.SyDentOffline.fetch(T, G); await sleep(30);
    const t2 = mkTab(src, U1, net, idb, { bus });
    await t2.SyDentOffline.fetch(SB + '/rest/v1/appointment_types?id=eq.t1', { method: 'PATCH', body: '{}', headers: { 'Content-Type': 'application/json' } });
    await sleep(30); hang = true;
    ok('d3: a save in another tab invalidates the copy here too', (await quick(t.SyDentOffline.fetch(T, G))) === 'pending');
    /* نسخة أقدم من 5 دقائق */
    hang = false; await sleep(5); await t.SyDentOffline.fetch(T, G); await sleep(30);
    const rec = await t.SyDentOffline._get(cacheKey(U1, T)); rec.savedAt = Date.now() - 6 * 60 * 1000; await t.SyDentOffline._put(rec);
    hang = true;
    ok('d3: a copy older than five minutes is not used — the server is awaited', (await quick(t.SyDentOffline.fetch(T, G))) === 'pending');
    /* لا جدول مالي ولا بوابة: دائماً من الخادم أولاً */
    for (const tb of ['patients', 'treatments', 'clinic_doctors', 'clinic_settings', 'clinic_employees', 'ledger_sessions', 'ledger_payments', 'payment_splits', 'appointments', 'trial_requests', 'subscription_plans', 'teeth_status']) {
      const u = SB + '/rest/v1/' + tb + '?select=*&doctor_id=eq.' + U1;
      hang = false; await t.SyDentOffline.fetch(u, G); await sleep(20); hang = true;
      ok('d3: ' + tb + ' is never answered from the cache while online', (await quick(t.SyDentOffline.fetch(u, G))) === 'pending');
    }
    const lit = /var SWR_TABLES_RE = (.+);/.exec(src);
    ok('d3: the instant-list table set is exactly the four reference tables', !!lit && lit[1] === '/\\/rest\\/v1\\/(appointment_types|operatories|wa_message_templates|expense_categories)(\\?|$)/', lit && lit[1]);
  }

  /* ══ تطوير 4: مريض جديد بلا اتصال — يُسجَّل ويظهر ويُحجز له، ورقم ملفه من الخادم عند الرفع ══ */
  if (!only || only === 'd4') {
    const H4 = { 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' };
    const LIST = SB + '/rest/v1/patients?select=*&doctor_id=eq.' + U1;
    const sent = []; let seqMode = 'ok', seqCalls = 0;
    const net = async (u, i) => {
      const m = i.method || 'GET';
      if (m === 'GET') return json([{ id: 'p-old', name: 'قديم', local_id: 'P007', doctor_id: U1 }]);
      if (u.indexOf('/rpc/next_patient_seq') !== -1) { seqCalls++;
        if (seqMode === 'down') throw new TypeError('Failed to fetch');
        if (seqMode === 'missing') return json({ code: 'PGRST202' }, 404);
        return json(41 + seqCalls); }
      sent.push({ m, u: u.replace(SB, ''), body: i.body ? JSON.parse(i.body) : null });
      return json(null, 201);
    };
    const idb = newIDB();
    const t = mkTab(src, U1, net, idb);
    await t.SyDentOffline.fetch(LIST, G); await sleep(25);
    t.navigator.onLine = false;
    let r = await t.SyDentOffline.fetch(SB + '/rest/v1/patients?select=*', { method: 'POST', headers: H4, body: JSON.stringify({ doctor_id: U1, local_id: 'P008', name: 'ريم الخطيب', phone: '0944', status: 'جديد' }) });
    const np = await r.json();
    ok('d4: a new patient saved offline is queued and echoed with its id', r.status === 201 && /^[0-9a-f-]{36}$/.test(np.id) && np.name === 'ريم الخطيب');
    let threw = false; try { await t.SyDentOffline.fetch(SB + '/rest/v1/patients?id=eq.p-old', { method: 'PATCH', body: '{}' }); } catch (e) { threw = true; }
    let threw2 = false; try { await t.SyDentOffline.fetch(SB + '/rest/v1/patients?id=eq.p-old', { method: 'DELETE' }); } catch (e) { threw2 = true; }
    ok('d4: editing or deleting a patient offline is still refused', threw && threw2);
    r = await t.SyDentOffline.fetch(LIST, G);
    ok('d4: the new patient appears in the cached patient list', (await r.json()).map(x => x.name).join(',') === 'قديم,ريم الخطيب');
    r = await t.SyDentOffline.fetch(SB + '/rest/v1/patients?select=*&id=eq.' + np.id + '&doctor_id=eq.' + U1, { method: 'GET', headers: { Accept: 'application/vnd.pgrst.object+json' } }).catch(() => null);
    ok('d4: their card opens offline (single row by id)', !!r && (await r.json()).name === 'ريم الخطيب');
    r = await t.SyDentOffline.fetch(SB + '/rest/v1/ledger_sessions?select=*&patient_id=eq.' + np.id, G).catch(() => null);
    ok('d4: their (empty) history loads instead of failing', !!r && (await r.json()).length === 0);
    await t.SyDentOffline.fetch(SB + '/rest/v1/appointments', { method: 'POST', headers: H4, body: JSON.stringify({ doctor_id: U1, patient_id: np.id, patient_name: 'ريم الخطيب', date: '2026-11-22', time: '10:00' }) });
    r = await t.SyDentOffline.fetch(SB + '/rest/v1/appointments?select=*&patient_id=eq.' + np.id, G).catch(() => null);
    ok('d4: an appointment booked for them offline shows on their card', !!r && (await r.json()).length === 1);
    r = await t.SyDentOffline.fetch(SB + '/rest/v1/ledger_sessions?select=*&patient_id=eq.99999999-9999-4999-8999-999999999999', G).catch(() => null);
    ok('d4: an uncached list for an EXISTING patient still fails — never shown as empty', r === null);
    r = await t.SyDentOffline.fetch(SB + '/rest/v1/appointments?select=*&doctor_id=eq.' + U1 + '&date=eq.2026-11-22', G).catch(() => null);
    ok('d4: an uncached day list is not faked from the queue', r === null);
    const other = mkTab(src, U2, net, idb); other.navigator.onLine = false;
    r = await other.SyDentOffline.fetch(SB + '/rest/v1/patients?select=*&id=eq.' + np.id, G).catch(() => null);
    ok('d4: another account on the device cannot read the queued patient', r === null);

    /* الرفع: العدّاد مقطوع ⇒ لا شيء يُرسَل والكل باقٍ */
    seqMode = 'down'; t.navigator.onLine = true;
    let d = await t.SyDentOffline.drain();
    ok('d4: if the file-number counter is unreachable nothing is uploaded and nothing is lost', sent.length === 0 && (await t.SyDentOffline._outboxAll()).length === 2 && d.failed === 0, JSON.stringify(d));
    seqMode = 'ok';
    d = await t.SyDentOffline.drain();
    ok('d4: the patient is uploaded before their appointment', sent.length === 2 && sent[0].u.indexOf('/rest/v1/patients') === 0 && sent[1].u.indexOf('/rest/v1/appointments') === 0 && d.synced === 2, JSON.stringify(sent.map(x => x.u)));
    ok('d4: the file number is the one the server counter allocated, not the offline guess', sent[0].body.local_id === 'P043' && sent[0].body.id === np.id && sent[1].body.patient_id === np.id, sent[0] && sent[0].body.local_id);
    /* عدّاد غائب (قاعدة قديمة) ⇒ يُرفع بالرقم المؤقت كما تفعل الصفحة */
    const t3 = mkTab(src, U1, net, newIDB()); t3.navigator.onLine = false;
    await t3.SyDentOffline.fetch(SB + '/rest/v1/patients', { method: 'POST', headers: H4, body: JSON.stringify({ doctor_id: U1, local_id: 'P050', name: 'x' }) });
    seqMode = 'missing'; sent.length = 0; t3.navigator.onLine = true; await t3.SyDentOffline.drain();
    ok('d4: without the counter the offline number is used, as the page itself does', sent.length === 1 && sent[0].body.local_id === 'P050');
    /* الرفع فشل بعد التخصيص ⇒ إعادة المحاولة لا تحرق رقماً ثانياً */
    let fail = true; seqMode = 'ok';
    const net5 = async (u, i) => { if (u.indexOf('/rpc/next_patient_seq') !== -1) { seqCalls++; return json(90); } if (fail) return json({ message: 'boom' }, 500); return json(null, 201); };
    const t5 = mkTab(src, U1, net5, newIDB()); t5.navigator.onLine = false;
    await t5.SyDentOffline.fetch(SB + '/rest/v1/patients', { method: 'POST', headers: H4, body: JSON.stringify({ doctor_id: U1, local_id: 'P001', name: 'y' }) });
    t5.navigator.onLine = true; const before = seqCalls;
    await t5.SyDentOffline.drain(); fail = false; await t5.SyDentOffline.drain();
    ok('d4: a retried upload does not allocate a second number', seqCalls - before === 1 && (await t5.SyDentOffline._outboxAll()).length === 0, seqCalls - before);
    /* أونلاين: المريض الجديد يحمل معرّفاً (إعادة المحاولة لا تكرره) والاستيراد الكبير بلا مهلة */
    let seen = null; const t6 = mkTab(src, U1, async (u, i) => { seen = i; return json({}, 201); }, newIDB());
    await t6.SyDentOffline.fetch(SB + '/rest/v1/patients?select=*', { method: 'POST', headers: H4, body: JSON.stringify({ doctor_id: U1, name: 'z' }) });
    ok('d4: online, a new patient carries a client id and the save timeout', !!JSON.parse(seen.body).id && !!seen.signal);
    const big = []; for (let i = 0; i < 400; i++) big.push({ doctor_id: U1, name: 'مريض رقم ' + i, phone: '09' + i, notes: 'استيراد' });
    await t6.SyDentOffline.fetch(SB + '/rest/v1/patients?columns=%22doctor_id%22%2C%22name%22%2C%22phone%22%2C%22notes%22', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(big) });
    ok('d4: a bulk import is never put under the save timeout', !seen.signal && JSON.parse(seen.body).length === 400);
    const tr4 = englishEngine()('مريض جديد'); ok('d4: review label passes the English engine', tr4 != null && !AR.test(tr4));
  }

  /* ══ تطوير 5: كشف تعارض موعدٍ عُدّل/حُذف بلا اتصال وقد غيّره جهاز آخر ══ */
  if (!only || only === 'd5') {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const LIST = SB + '/rest/v1/appointments?select=*&doctor_id=eq.' + U1 + '&date=eq.2026-11-21';
    const HJ = { 'Content-Type': 'application/json' };
    const base = { id: A, doctor_id: U1, patient_name: 'سامر', date: '2026-11-21', time: '10:00:00', status: 'scheduled', notes: 'n1' };
    /* tab مع خادم وهمي: srv = الصف الحالي على الخادم (null = محذوف) */
    const mk5 = (opt) => { const w = { srv: Object.assign({}, base), sent: [], gets: 0, down: false };
      const net = async (u, i) => { const m = i.method || 'GET';
        if (m === 'GET') { if (u.indexOf('id=eq.') !== -1) { w.gets++; if (w.down) throw new TypeError('Failed to fetch'); return json(w.srv ? [w.srv] : []); } return json([base]); }
        w.sent.push({ m, u: u.replace(SB, ''), body: i.body ? JSON.parse(i.body) : null }); return json(null, 204); };
      w.t = mkTab(src, U1, net, (opt && opt.idb) || newIDB(), opt); return w; };
    const editOffline = async (w, patch, method) => { w.t.navigator.onLine = false;
      await w.t.SyDentOffline.fetch(SB + '/rest/v1/appointments?id=eq.' + A, { method: method || 'PATCH', headers: HJ, body: method === 'DELETE' ? undefined : JSON.stringify(patch) });
      w.t.navigator.onLine = true; };
    const prime = async (w) => { await w.t.SyDentOffline.fetch(LIST, G); await sleep(25); };

    let w = mk5(); await prime(w); await editOffline(w, { time: '11:00' });
    const q0 = (await w.t.SyDentOffline._outboxAll())[0];
    ok('d5: the edit remembers the value the user saw', q0 && q0.base && q0.base.time === '10:00:00' && Object.keys(q0.base).length === 1, JSON.stringify(q0 && q0.base));
    let d = await w.t.SyDentOffline.drain();
    ok('d5: untouched on the server → the edit is uploaded', d.synced === 1 && w.sent.length === 1 && w.sent[0].body.time === '11:00');

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); w.srv.time = '12:30:00';
    d = await w.t.SyDentOffline.drain();
    let ob = await w.t.SyDentOffline._outboxAll();
    ok('d5: changed from another device → NOT uploaded, kept as a conflict', w.sent.length === 0 && d.failed === 1 && ob.length === 1 && ob[0].lastError === 'CONFLICT changed', JSON.stringify(d));
    const g1 = w.gets; await w.t.SyDentOffline.drain(); await w.t.SyDentOffline.drain();
    ok('d5: a conflict is never retried on its own', w.gets === g1 && w.sent.length === 0);
    d = await w.t.SyDentOffline.outboxRetry(ob[0].id, true);
    ok('d5: «apply my edit» uploads it without re-checking', d.synced === 1 && w.sent.length === 1 && w.gets === g1);

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); w.srv.time = '11:00:00';
    d = await w.t.SyDentOffline.drain();
    ok('d5: the other device made the same change → no conflict', d.synced === 1 && d.failed === 0);

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); w.srv.notes = 'changed elsewhere';
    d = await w.t.SyDentOffline.drain();
    ok('d5: a change to a field I did not touch is not a conflict', d.synced === 1 && w.sent.length === 1);

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); w.srv = null;
    d = await w.t.SyDentOffline.drain(); ob = await w.t.SyDentOffline._outboxAll();
    ok('d5: editing an appointment deleted elsewhere is a conflict, not a silent «done»', w.sent.length === 0 && ob.length === 1 && ob[0].lastError === 'CONFLICT gone');

    w = mk5(); await prime(w); await editOffline(w, null, 'DELETE'); w.srv = null;
    d = await w.t.SyDentOffline.drain();
    ok('d5: deleting an appointment already deleted elsewhere is simply done', d.synced === 1 && w.sent.length === 0 && (await w.t.SyDentOffline._outboxAll()).length === 0);
    w = mk5(); await prime(w); await editOffline(w, null, 'DELETE'); w.srv.time = '15:00:00';
    d = await w.t.SyDentOffline.drain();
    ok('d5: deleting an appointment someone else just moved is a conflict', w.sent.length === 0 && d.failed === 1);

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); await editOffline(w, { time: '12:00' });
    const two = await w.t.SyDentOffline._outboxAll();
    ok('d5: a second offline edit is based on the first one', two[1].base && two[1].base.time === '11:00');
    const origNet = w.t.fetch;
    w.t.fetch = (input, init) => { const u = typeof input === 'string' ? input : input.url; const p = origNet(input, init);
      if ((init.method || 'GET') === 'PATCH') { try { Object.assign(w.srv, JSON.parse(init.body)); } catch (e) {} } return p; };
    d = await w.t.SyDentOffline.drain();
    ok('d5: two edits of mine in a row do not conflict with each other', d.synced === 2 && d.failed === 0 && w.sent.length === 2, JSON.stringify(d));

    w = mk5(); await prime(w); await editOffline(w, { time: '11:00' }); w.down = true;
    d = await w.t.SyDentOffline.drain(); ob = await w.t.SyDentOffline._outboxAll();
    ok('d5: if the check cannot reach the server nothing is uploaded and the edit stays pending', w.sent.length === 0 && ob.length === 1 && ob[0].status !== 'failed');

    /* صف غير مكاش (موعد أُنشئ بلا اتصال ثم عُدّل): بلا أساس، والرفع يمرّ */
    w = mk5(); await editOffline(w, { time: '11:00' });
    ok('d5: no cached row → no base recorded', !(await w.t.SyDentOffline._outboxAll())[0].base);
    d = await w.t.SyDentOffline.drain();
    ok('d5: … and the edit still uploads when the row exists', d.synced === 1);
    /* عزل: كاش حساب آخر لا يُستعمل أساساً */
    const idbS = newIDB(); const wa = mk5({ idb: idbS }); await prime(wa);
    const wb = { t: mkTab(src, U2, async () => json(null, 204), idbS) };
    wb.t.navigator.onLine = false;
    await wb.t.SyDentOffline.fetch(SB + '/rest/v1/appointments?id=eq.' + A, { method: 'PATCH', headers: HJ, body: JSON.stringify({ time: '09:00' }) });
    ok('d5: another account\'s cached row is never used as the base', !(await wb.t.SyDentOffline._outboxAll()).filter(o => o.uid === U2)[0].base);

    /* النافذة: خيارات التعارض */
    const wu = { srv: Object.assign({}, base), sent: [] };
    const netU = async (u, i) => { const m = i.method || 'GET'; if (m === 'GET') return json(u.indexOf('id=eq.') !== -1 ? (wu.srv ? [wu.srv] : []) : [base]); wu.sent.push(m); return json(null, 204); };
    const tu = mkTab(src, U1, netU, newIDB(), { wire: true });
    await tu.SyDentOffline.fetch(LIST, G); await sleep(25);
    tu.navigator.onLine = false; await tu.SyDentOffline.fetch(SB + '/rest/v1/appointments?id=eq.' + A, { method: 'PATCH', headers: HJ, body: JSON.stringify({ time: '11:00' }) }); tu.navigator.onLine = true;
    wu.srv.time = '13:00:00'; await tu.SyDentOffline.drain();
    tu.dialogs = []; tu.script = [0, 0];
    tu.byId('sydent-sync-badge').onclick(); await sleep(120);
    const d1 = tu.dialogs[0], d2 = tu.dialogs[1];
    ok('d5: the review window names the conflict', !!d1 && /عُدّل الموعد من جهاز آخر/.test(d1.o.choices[0].sub + ' ' + ((d2 && d2.o.message) || '')), d1 && JSON.stringify(d1.o.choices));
    ok('d5: it offers «apply my edit» or leaving the server version', !!d2 && d2.o.choices.length === 2 && d2.o.choices[0].label === 'تطبيق تعديلي' && d2.o.choices[1].label === 'حذف العملية');
    ok('d5: choosing «apply my edit» uploads it', wu.sent.length === 1 && (await tu.SyDentOffline.outboxList()).length === 0, wu.sent.length);
    const tr5 = englishEngine();
    ['عُدّل الموعد من جهاز آخر بعد تعديلك', 'حُذف الموعد من جهاز آخر', 'تطبيق تعديلي', 'يُكتب فوق ما عُدّل من الجهاز الآخر', 'يبقى الموعد كما هو على الخادم'].forEach(x => { const en = tr5(x); ok('d5: English engine leaves no Arabic in «' + x + '»', en != null && !AR.test(en), String(en)); });
  }

  /* ══ تطوير 6: النافذة تعرض المنتظر أيضاً (لا المرفوض فقط) ══ */
  if (!only || only === 'd6') {
    const HJ = { 'Content-Type': 'application/json' };
    let mode = 'down'; const sent = [];
    const net = async (u, i) => { if ((i.method || 'GET') === 'GET') return json([]); if (mode === 'down') throw new TypeError('Failed to fetch'); if (mode === 'fk') return json({ code: '23503', message: 'fk' }, 409); sent.push(u); return json(null, 201); };
    const t = mkTab(src, U1, net, newIDB(), { wire: true });
    const q = async (table, row) => { t.navigator.onLine = false; await t.SyDentOffline.fetch(SB + '/rest/v1/' + table, { method: 'POST', headers: HJ, body: JSON.stringify(row) }); };
    await q('appointments', { patient_id: 'p1', patient_name: 'سامر', date: '2026-11-21', time: '10:30:00' });
    await q('ledger_payments', { patient_id: 'p1', amount: 20, currency: 'USD', date: '2026-11-20' });
    await q('audit_log', { action: 'x' });
    const badge = t.byId('sydent-sync-badge');
    /* بلا اتصال: النقر يعرض المنتظر */
    t.dialogs = []; t.script = [null];
    badge.onclick(); await sleep(80);
    let d1 = t.dialogs[0];
    ok('d6: offline, clicking the badge lists what is waiting to upload', !!d1 && d1.kind === 'choose' && d1.o.choices.length === 2 && d1.o.choices.every(c => c.label.indexOf('⏳') === 0), d1 && JSON.stringify(d1.o.choices));
    ok('d6: the audit entry is not listed', !!d1 && !d1.o.choices.some(c => /سجل/.test(c.label)));
    ok('d6: the window says they upload on their own', !!d1 && /تُرفع تلقائياً/.test(d1.o.message));
    /* عملية منتظرة: الخيار الوحيد حذفها (بتأكيد) */
    t.dialogs = []; t.script = [0, 0, true];
    badge.onclick(); await sleep(120);
    ok('d6: a waiting operation offers only «delete», behind a confirmation', t.dialogs.length === 3 && t.dialogs[1].o.choices.length === 1 && t.dialogs[1].o.choices[0].label === 'حذف العملية' && t.dialogs[2].kind === 'confirm' && t.dialogs[2].o.danger === true);
    ok('d6: … and deleting it removes exactly that one', (await t.SyDentOffline.outboxList()).filter(o => o.table !== 'audit_log').length === 1);
    /* أونلاين: النقر يرفع أولاً، ولا نافذة إن لم يبقَ شيء */
    mode = 'ok'; t.navigator.onLine = true; t.dialogs = []; t.toasts.length = 0;
    badge.onclick(); await sleep(120);
    ok('d6: online, a click uploads first and opens nothing when nothing is left', t.dialogs.length === 0 && sent.length === 2 && t.toasts.some(m => /تمت مزامنة/.test(m)), t.dialogs.length + '/' + sent.length);
    /* مرفوض + منتظر معاً: المرفوض أولاً بعلامته */
    mode = 'fk'; await q('appointments', { patient_id: 'gone', patient_name: 'أ', date: '2026-11-23', time: '09:00:00' }); t.navigator.onLine = true;
    await t.SyDentOffline.drain();
    await q('appointments', { patient_id: 'p1', patient_name: 'ب', date: '2026-11-24', time: '09:00:00' });
    t.dialogs = []; t.script = [null];
    badge.onclick(); await sleep(80);
    d1 = t.dialogs[0];
    ok('d6: rejected operations come first, each kind marked', !!d1 && d1.o.choices.length === 2 && d1.o.choices[0].label.indexOf('⚠️') === 0 && d1.o.choices[1].label.indexOf('⏳') === 0, d1 && JSON.stringify(d1.o.choices.map(c => c.label)));
    const tr6 = englishEngine();
    ['سُجّلت بلا اتصال وتُرفع تلقائياً عند عودة الإنترنت.', 'بانتظار الرفع', d1 ? d1.o.choices[0].label : 'x', d1 ? d1.o.choices[1].label : 'x'].forEach(x => { const en = tr6(x); ok('d6: English engine leaves no Arabic in «' + x.replace(/[\u2066-\u2069]/g, '') + '»', en != null && !AR.test(en), String(en)); });
  }

  /* ══ تطوير 7: قفل التطبيق على الجهاز (منطق الرمز والخمول والتبريد — الشاشة تُفحص بمتصفح حقيقي) ══ */
  if (!only || only === 'd7') {
    const lock = (uid, pathname) => {
      const m = new Map(); if (uid) m.set('sydent.auth', JSON.stringify({ user: { id: uid } }));
      const st = { now: 1e12, m };
      const storage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
      const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} }, querySelector: () => null });
      const win = { localStorage: storage, location: { pathname: pathname || '/patients.html' }, crypto: require('crypto').webcrypto, addEventListener() {} };
      const ctx = vm.createContext({ window: win, document: { getElementById: () => null, createElement: el, documentElement: el(), head: el(), body: null, readyState: 'complete', addEventListener() {}, visibilityState: 'visible' },
        Date: { now: () => st.now }, TextEncoder, Uint8Array, Array, JSON, parseInt, Math, Promise, String, setInterval() {}, setTimeout });
      vm.runInContext(slice(src, '/* ═══ SYDENT_APPLOCK_START', '/* ═══ SYDENT_APPLOCK_END ═══ */'), ctx);
      st.L = win.SyDentAppLock; st.win = win; return st; };
    const MIN = 60000;
    let a = lock(U1);
    ok('d7: off by default', a.L.isOn() === false && a.L.shouldLock() === false);
    let r = await a.L.enable('12', 5);
    ok('d7: a code that is not 4–6 digits is refused', r.ok === false && !a.L.isOn());
    r = await a.L.enable('1234', 5);
    const raw = a.m.get('sydent.applock') || '';
    ok('d7: turning it on stores a derived value, never the code', r.ok && a.L.isOn() && raw.indexOf('1234') === -1 && /"hash":"[0-9a-f]{64}"/.test(raw) && /"salt":"[0-9a-f]{32}"/.test(raw), raw.slice(0, 80));
    ok('d7: not locked right after turning it on', a.L.shouldLock() === false);
    a.now += 4 * MIN; ok('d7: still open within the idle period', a.L.shouldLock() === false);
    a.now += 2 * MIN; ok('d7: locks once the idle period has passed', a.L.shouldLock() === true);
    r = await a.L.verify('abcd'); ok('d7: a malformed code is refused without using up an attempt', r.reason === 'invalid_format' && !a.m.has('sydent.applock.fails'));
    const tries = []; for (let i = 0; i < 4; i++) tries.push(await a.L.verify('9999'));
    ok('d7: wrong codes are refused and counted down', tries.every(x => x.ok === false && x.reason === 'wrong') && tries[3].failsLeft === 1);
    r = await a.L.verify('9999'); ok('d7: the fifth wrong code starts a one-minute wait', r.reason === 'cooldown');
    r = await a.L.verify('1234'); ok('d7: during the wait even the right code is refused', r.ok === false && r.reason === 'cooldown');
    a.now += 61000; r = await a.L.verify('1234'); ok('d7: after the wait the right code opens', r.ok === true);
    a.L._touch(); ok('d7: activity postpones the lock', a.L.shouldLock() === false);
    ok('d7: the idle period can be changed to an offered value only', a.L.setIdle(15) === true && a.L.setIdle(7) === false);
    a.now += 10 * MIN; ok('d7: … and the new period is respected', a.L.shouldLock() === false); a.now += 6 * MIN; ok('d7: … until it passes', a.L.shouldLock() === true);
    r = await a.L.disable('0000'); ok('d7: turning it off needs the right code', r.ok === false && a.L.isOn());
    r = await a.L.disable('1234'); ok('d7: the right code turns it off and leaves nothing behind', r.ok && !a.L.isOn() && ![...a.m.keys()].some(k => k.indexOf('sydent.applock') === 0));
    /* صفحات عامة / بلا جلسة / حساب آخر */
    const b = lock(U1, '/auth.html'); await b.L.enable('1234', 1); b.now += 10 * MIN;
    ok('d7: public pages are never locked', b.L.shouldLock() === false);
    const c = lock(U1); await c.L.enable('1234', 1); c.now += 10 * MIN;
    ok('d7: locked for the account that set it', c.L.shouldLock() === true);
    c.m.set('sydent.auth', JSON.stringify({ user: { id: U2 } })); ok('d7: another account on the device is not locked by it', c.L.shouldLock() === false);
    c.m.delete('sydent.auth'); ok('d7: no session → no lock', c.L.shouldLock() === false);
    /* ملحٌ لكل جهاز */
    const d1 = lock(U1), d2 = lock(U1); await d1.L.enable('1234', 5); await d2.L.enable('1234', 5);
    ok('d7: the same code gives a different stored value on each device', JSON.parse(d1.m.get('sydent.applock')).hash !== JSON.parse(d2.m.get('sydent.applock')).hash);
    /* الخروج يلغي القفل */
    const t = mkTab(src, U1, async () => json([]), newIDB(), { auth: true });
    let cleared = 0; t.SyDentAppLock = { clear: () => { cleared++; } };
    await t.sb.auth.signOut({ scope: 'local' });
    ok('d7: signing out clears the device lock', cleared === 1);
    const tr7 = englishEngine();
    ['التطبيق مقفل', 'أدخل رمز القفل للمتابعة', 'فتح', 'رمز غير صحيح', 'محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة', 'نسيت الرمز؟ تسجيل الخروج', 'قفل التطبيق على هذا الجهاز', 'مفعّل على هذا الجهاز', 'يطلب رمزاً عند فتح التطبيق وبعد مدة خمول — على هذا الجهاز فقط', 'رمز قفل جديد من 4 إلى 6 أرقام', 'أعد إدخال الرمز للتأكيد', 'مدة الخمول قبل القفل', 'دقيقة واحدة', '5 دقائق', '15 دقيقة', '30 دقيقة', '🔒 تم تفعيل قفل التطبيق على هذا الجهاز', 'القفل مفعّل على هذا الجهاز', 'قفل الآن', 'تغيير مدة الخمول', 'إيقاف القفل', 'يتطلب رمز القفل الحالي', 'أدخل رمز القفل الحالي', 'تم إيقاف قفل التطبيق', '⚠️ الرمزان غير متطابقين', '⚠️ الرمز من 4 إلى 6 أرقام', 'تم حفظ مدة الخمول', '⚠️ تعذّر تفعيل القفل على هذا المتصفح', 'قفل التطبيق'].forEach(x => { const en = tr7(x); ok('d7: English engine leaves no Arabic in «' + x + '»', en != null && !AR.test(en), String(en)); });
  }

  return fails;
}

const MUTATIONS = [
  ['d7: public pages get locked', s => s.replace("if (isPublic() || !isOn()) return false;", 'if (!isOn()) return false;')],
  ['d7: no wait after five wrong codes', s => s.replace("if (n >= MAX_FAILS) { ls().setItem(K_COOL, String(now() + COOL_MS)); ls().removeItem(K_FAIL); return { ok: false, reason: 'cooldown', secondsLeft: COOL_MS / 1000 }; }", '')],
  ['d7: right code accepted during the wait', s => s.replace("if (left) return Promise.resolve({ ok: false, reason: 'cooldown', secondsLeft: left });", '')],
  ['d7: lock applies to any account on the device', s => s.replace("function isOn() { var c = cfg(), u = sessionUid(); return !!(c && u && c.uid === u); }", 'function isOn() { return !!cfg(); }')],
  ['d7: turning off without the code', s => s.replace("function disable(pin) { return verify(pin).then(function (r) { if (r.ok) clear(); return r; }); }", 'function disable(pin) { clear(); return Promise.resolve({ ok: true }); }')],
  ['d7: sign-out leaves the lock on', s => s.replace("try { if (window.SyDentAppLock) window.SyDentAppLock.clear(); } catch (eA) {}", '')],
  ['d7: idle period ignored', s => s.replace("return now() - last > (c.idle || 5) * 60000;", 'return false;')],
  ['d7: same stored value on every device (no salt)', s => s.replace("var salt = hex(window.crypto.getRandomValues(new Uint8Array(16)));", "var salt = '00000000000000000000000000000000';")],
  ['d6: waiting operations hidden again', s => s.replace("var bad = all.filter(isBad).concat(all.filter(function (o) { return !isBad(o); }));   /* المرفوض أولاً */", 'var bad = all.filter(isBad);')],
  ['d6: a waiting operation offered «retry» instead of only delete', s => s.replace("var acts = !isBad(op)\n          ? [{ k: 'drop', label: 'حذف العملية', sub: 'تُحذف من هذا الجهاز ولا تُرفع' }]\n          : op.lastError === 'CONFLICT changed'", "var acts = op.lastError === 'CONFLICT changed'")],
  ['d6: click no longer uploads first', s => s.replace("var pre = offline ? Promise.resolve(null) : O.drain().catch(function () { return null; });", 'var pre = Promise.resolve(null);')],
  ['d6: audit entries listed', s => s.replace("var all = ops.filter(function (o) { return o.table !== 'audit_log'; });", 'var all = ops;')],
  ['d5: conflict check skipped', s => s.replace("if (!rec || rec.table !== 'appointments' || rec.force) return Promise.resolve('ok');", "return Promise.resolve('ok');")],
  ['d5: edit of a deleted appointment counted as done', s => s.replace("if (!rows.length) return rec.method === 'DELETE' ? 'done' : 'gone';", "if (!rows.length) return rec.method === 'DELETE' ? 'done' : 'ok';")],
  ['d5: my own earlier edit seen as someone else\'s', s => s.replace("try { var p = JSON.parse(o.body || '{}'); for (var c in p) if (Object.prototype.hasOwnProperty.call(p, c)) found[c] = p[c]; } catch (e) {}", '')],
  ['d5: same change by the other device treated as a conflict', s => s.replace(" && !(rec.method === 'PATCH' && sameVal(srv[c], patch[c]))) return 'changed';", ") return 'changed';")],
  ['d5: conflict retried automatically', s => s.replace("rec.status = 'failed'; rec.attempts = 5;\n      rec.lastError = 'CONFLICT ' + verdict;", "rec.status = 'failed'; rec.attempts = 1;\n      rec.lastError = 'CONFLICT ' + verdict;")],
  ['d5: «apply my edit» still blocked by the check', s => s.replace("if (force) rec.force = true;", '')],
  ['d5: base taken from another account\'s cache', s => s.replace("return typeof k === 'string' && k.indexOf(uid + '|') === 0 && k.indexOf('/rest/v1/' + table) !== -1;", "return typeof k === 'string' && k.indexOf('/rest/v1/' + table) !== -1;")],
  ['d5: unreachable check uploads anyway', s => s.replace("{ method: 'GET', headers: h }).then(function (res) {\n      if (res.status === 401) throw new Error('auth-401');\n      if (!res.ok) return 'ok';", "{ method: 'GET', headers: h }).catch(function () { return { ok: false, status: 0 }; }).then(function (res) {\n      if (res.status === 401) throw new Error('auth-401');\n      if (!res.ok) return 'ok';")],
  ['d4: any uncached patient history faked as empty', s => s.replace("if (m && !wantsObj && rowsOf('patients').some(function (r) { return r.id === m[1]; })) {", 'if (m && !wantsObj) {')],
  ['d4: file number not taken from the server', s => s.replace("return allocPatientSeq(rec, auth).then(function () { return conflictCheck(rec, auth); })", "return conflictCheck(rec, auth)")],
  ['d4: number allocated again on every retry', s => s.replace("rec.seqDone = true;", '')],
  ['d4: patients editable offline', s => s.replace("patients:        { POST: 1 }\n  };", "patients:        { POST: 1, PATCH: 1, DELETE: 1 }\n  };")],
  ['d4: unreachable counter ignored (upload with a guessed number)', s => s.replace("method: 'POST', headers: h, body: JSON.stringify({ n: rows.length })\n    }).then(function (res) {", "method: 'POST', headers: h, body: JSON.stringify({ n: rows.length })\n    }).catch(function () { return { ok: false, status: 0 }; }).then(function (res) {")],
  ['d4: bulk import cut by the timeout', s => s.replace("if (guarded && small && !(sendInit && sendInit.signal)", 'if (guarded && !(sendInit && sendInit.signal)')],
  ['d4: queued rows of another account readable', s => s.replace("ops = ops.filter(function (o) { return o && o.uid === uid; });\n      if (!ops.length) return null;\n      var wantsObj", "if (!ops.length) return null;\n      var wantsObj")],
  ['d3: age limit removed', s => s.replace("if (rec && age >= 0 && age < SWR_MAX_AGE_MS && ", 'if (rec && ')],
  ['d3: saves no longer invalidate', s => s.replace("(rec.reqAt || 0) > (_swrDirty[swrT] || 0) && ", '')],
  ['d3: freshness judged by arrival time, not request time', s => s.replace("(rec.reqAt || 0) > (_swrDirty[swrT] || 0) && ", "(rec.savedAt || 0) > (_swrDirty[swrT] || 0) && ")],
  ['d3: other tabs not told about a save', s => s.replace("if (!fromOtherTab && _bc) { try { _bc.postMessage({ swr: table }); } catch (e) {} }", '')],
  ['d3: prices served from the cache', s => s.replace("(appointment_types|operatories|wa_message_templates|expense_categories)(\\?|$)/;", "(appointment_types|operatories|wa_message_templates|expense_categories|treatments)(\\?|$)/;")],
  ['d3: no background refresh', s => s.replace("doNetwork().catch(function () {});\n          return cachedResponse(rec);", 'return cachedResponse(rec);')],
  ['s8: ids not remembered after a network failure', s => s.replace("_retryIds[fp] = { ids: ids, at: nowF };", '')],
  ['s8: memory kept after a success (a real second payment would vanish)', s => s.replace("delete _retryIds[fp];                  /* الخادم أجاب", "/* الخادم أجاب")],
  ['s8: own-duplicate 409 on a retry not turned into success', s => s.replace("return alreadySaved(url, input, init, ids, rows);   /* المحاولة السابقة وصلت */", 'return res;')],
  ['s8: any 409 on a retry masked as success', s => s.replace("if (!isOwnDuplicate({ method: 'POST', table: table }, pgError(txt))) return res;", '')],
  ['s8: save timeout removed', s => s.replace("timer = setTimeout(function () { timedOut = true; try { ctrl.abort(); } catch (e) {} }, WRITE_TIMEOUT_MS);", '')],
  ['s8: timeout applied to every table', s => s.replace("if (guarded && small && !(sendInit && sendInit.signal) && typeof AbortController === 'function') {", "if (small && !(sendInit && sendInit.signal) && typeof AbortController === 'function') {")],
  ['s8: id column not added to array inserts', s => s.replace("return d.indexOf('\"id\"') !== -1 ? m : a + v + encodeURIComponent(',\"id\"');", 'return m;')],
  ['s8: upserts get an injected id', s => s.replace("return url.indexOf('on_conflict=') === -1 && (prefer || '').indexOf('resolution=') === -1;", 'return true;')],
  ['s7: offline limit disabled', s => s.replace("return Date.now() - (parseInt(raw, 10) || 0) > OFFLINE_MAX_MS;", 'return false;')],
  ['s7: expired cache left on disk', s => s.replace("if (!quiet) staleBarShow(true);\n        wipeCache();", 'if (!quiet) staleBarShow(true);')],
  ['s7: entry age limit removed', s => s.replace("if (Date.now() - (rec.savedAt || 0) > CACHE_MAX_AGE_MS) return null;", '')],
  ['s7: server read no longer refreshes the stamp', s => s.replace("markSeen(uid);                     /* الخادم", "/* الخادم")],
  ['s6: asset cache cap back below the fleet', s => s, sw => sw.replace('MAX_ASSETS = 240', 'MAX_ASSETS = 80')],
  ['s5: sbSignOut wipes the queue again', s => s.replace("try { if (window.SyDentSyncGuard && !(await window.SyDentSyncGuard.beforeLogout())) return; } catch (e) {}\n    // Migration 107", "try { if (window.SyDentOffline) window.SyDentOffline.wipe(); } catch (e) {}\n    // Migration 107")],
  ['s5: guard never asks', s => s.replace("if (!D || typeof D.confirm !== 'function') return true;", 'return true;')],
  ['s5: guard asks about audit entries', s => s.replace("return ops.filter(function (o) { return o.table !== 'audit_log'; }).length;", 'return ops.length;')],
  ['s4: drain no longer takes the cross-tab lock', s => s.replace("if (!L || typeof L.request !== 'function') return drainNow();", 'if (true) return drainNow();')],
  ['s4: losing tab drains anyway', s => s.replace("if (!lock) return { synced: 0, failed: 0, busy: true };", '')],
  ['s4: other tabs not told about queue changes', s => s.replace("if (!fromOtherTab && _bc) { try { _bc.postMessage(1); } catch (e) {} }", '')],
  ['s3: failed appointments swept after a week again', s => s.replace("if (rec.table === 'audit_log' && Date.now() - (rec.createdAt || 0) > 7 * 24 * 3600 * 1000) {", 'if (Date.now() - (rec.createdAt || 0) > 7 * 24 * 3600 * 1000) {')],
  ['s3: review list leaks other users', s => s.replace("return rows.filter(function (r) { return r && uid && r.uid === uid; }).map(function (r) {", 'return rows.map(function (r) {')],
  ['s3: discard not limited to own operations', s => s.replace("if (rows[i] && rows[i].id === id && uid && rows[i].uid === uid) return rows[i];", 'if (rows[i] && rows[i].id === id) return rows[i];')],
  ['s3: delete without confirmation', s => s.replace("if (!yes) return;\n                return O.outboxDiscard(op.id)", 'return O.outboxDiscard(op.id)')],
  ['s3: badge click no longer opens the review', s => s.replace('el.onclick = function () { try { openSyncReview(); } catch (e) {} };', 'el.onclick = function () { try { syncNow(); } catch (e) {} };')],
  ['s2: any 409 counts as synced again', s => s.replace('if (res.status === 409 && isOwnDuplicate(rec, info)) return done();', 'if (res.status === 409) return done();')],
  ['s2: own-duplicate rule widened beyond inserts', s => s.replace("if (!rec || rec.method !== 'POST' || !UUID_INJECT_TABLES[rec.table]) return false;", 'if (!rec) return false;')],
  ['s1: logout no longer wipes', s => s.replace('var w = _wipeOfflineCache();', 'var w = Promise.resolve();')],
  ['s1: wipeCache clears the queue instead of the cache', s => s.replace("var t = db.transaction(STORE, 'readwrite');\n          t.objectStore(STORE).clear();", "var t = db.transaction(OUTBOX, 'readwrite');\n          t.objectStore(OUTBOX).clear();")],
  ['s1: SIGNED_OUT ignored', s => s.replace("if (ev === 'SIGNED_OUT') _wipeOfflineCache();", '')]
];

/* حلقة أحداث فرغت قبل الاكتمال (وعدٌ لا يُحسم أبداً) = خروجٌ صامت برمز 0 — يُحوَّل فشلاً صريحاً */
let FINISHED = false;
process.on('exit', code => { if (!FINISHED && code === 0) { console.log('⛔ مثبت الأوفلاين: توقّف قبل الاكتمال (وعدٌ لم يُحسم)'); process.exitCode = 1; } });
const finish = code => { FINISHED = true; process.exit(code); };

(async () => {
  const fails = await runAll(LIVE);
  if (fails.length) { console.log('⛔ مثبت الأوفلاين: ' + fails.length + ' فشل'); fails.forEach(f => console.log('   ✗ ' + f)); finish(1); }
  if (process.argv.indexOf('--self-test') !== -1) {
    const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    for (const [name, mut, swMut] of MUTATIONS) {
      const m = mut(LIVE), msw = swMut ? swMut(SW) : SW;
      if (m === LIVE && msw === SW) { console.log('⛔ طفرة لم تُطبَّق (المرساة تغيّرت): ' + name); finish(1); }
      /* كل طفرة تُشغَّل على قسم خطوتها وحده (اسمها يبدأ بـ sN:) — التشغيل الكامل جرى أعلاه */
      let f; try { f = await runAll(m, msw, name.slice(0, 2)); } catch (e) { f = ['threw: ' + e.message]; }
      if (!f.length) { console.log('⛔ طفرة لم تُكشف: ' + name); finish(1); }
    }
    console.log('✅ مثبت الأوفلاين: كل التوكيدات خضراء + ' + MUTATIONS.length + ' طفرات مكشوفة');
  } else {
    console.log('✅ مثبت الأوفلاين: كل التوكيدات خضراء');
  }
  finish(0);
})().catch(e => { console.error('⛔ مثبت الأوفلاين: خطأ بالحامل', e); finish(2); });
