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
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const ctx = vm.createContext({ window: win, navigator: win.navigator, localStorage: storage, sessionStorage: storage,
    document: { getElementById: () => null, createElement: el, body: el(), documentElement: el(), readyState: 'complete', addEventListener() {} },
    Response, AbortController, Promise, setTimeout, clearTimeout, setInterval() {}, console: win.console });
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
  return win;
}

async function runAll(src) {
  const fails = [];
  const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ' [' + extra + ']' : '')); };
  const PURL = SB + '/rest/v1/patients?select=*&doctor_id=eq.' + U1;
  const G = { method: 'GET', headers: { Accept: 'application/json' } };
  const cacheKey = (uid, url) => [uid, url, 'application/json', ''].join('|');

  /* ══ أساس: كاش القراءة + العزل + الجدار ══ */
  {
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
  {
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
  {
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

  return fails;
}

const MUTATIONS = [
  ['s2: any 409 counts as synced again', s => s.replace('if (res.status === 409 && isOwnDuplicate(rec, info)) return done();', 'if (res.status === 409) return done();')],
  ['s2: own-duplicate rule widened beyond inserts', s => s.replace("if (!rec || rec.method !== 'POST' || !UUID_INJECT_TABLES[rec.table]) return false;", 'if (!rec) return false;')],
  ['s1: logout no longer wipes', s => s.replace('var w = _wipeOfflineCache();', 'var w = Promise.resolve();')],
  ['s1: wipeCache clears the queue instead of the cache', s => s.replace("var t = db.transaction(STORE, 'readwrite');\n          t.objectStore(STORE).clear();", "var t = db.transaction(OUTBOX, 'readwrite');\n          t.objectStore(OUTBOX).clear();")],
  ['s1: SIGNED_OUT ignored', s => s.replace("if (ev === 'SIGNED_OUT') _wipeOfflineCache();", '')]
];

(async () => {
  const fails = await runAll(LIVE);
  if (fails.length) { console.log('⛔ مثبت الأوفلاين: ' + fails.length + ' فشل'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
  if (process.argv.indexOf('--self-test') !== -1) {
    for (const [name, mut] of MUTATIONS) {
      const m = mut(LIVE);
      if (m === LIVE) { console.log('⛔ طفرة لم تُطبَّق (المرساة تغيّرت): ' + name); process.exit(1); }
      let f; try { f = await runAll(m); } catch (e) { f = ['threw: ' + e.message]; }
      if (!f.length) { console.log('⛔ طفرة لم تُكشف: ' + name); process.exit(1); }
    }
    console.log('✅ مثبت الأوفلاين: كل التوكيدات خضراء + ' + MUTATIONS.length + ' طفرات مكشوفة');
  } else {
    console.log('✅ مثبت الأوفلاين: كل التوكيدات خضراء');
  }
  process.exit(0);
})().catch(e => { console.error('⛔ مثبت الأوفلاين: خطأ بالحامل', e); process.exit(2); });
