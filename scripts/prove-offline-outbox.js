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
    const flat = first ? first.o.choices.map(c => c.label.replace(/[\u2066-\u2069]/g, '') + ' | ' + c.sub.replace(/[\u2066-\u2069]/g, '')) : [];
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
    await t.SyDentOffline.fetch(SB + '/rest/v1/patients', init6);
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
    const pend = t.SyDentOffline.fetch(SB + '/rest/v1/patients', { method: 'POST', headers: H(), body: '{}' });
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

  return fails;
}

const MUTATIONS = [
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
  ['s8: timeout applied to every table', s => s.replace("if (guarded && !(sendInit && sendInit.signal) && typeof AbortController === 'function') {", "if (!(sendInit && sendInit.signal) && typeof AbortController === 'function') {")],
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
