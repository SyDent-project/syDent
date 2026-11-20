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
  const st = (fn, ms) => (ms >= 3000 ? 0 : setTimeout(fn, ms));
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

  /* ══ الخطوة 3: العمليات الفاشلة تُعرَض وتُدار — لا حذف صامت ══ */
  {
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
  {
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
  {
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

  return fails;
}

const MUTATIONS = [
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
