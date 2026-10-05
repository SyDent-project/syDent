// ═══════════════════════════════════════════════════════
// SyDent — Supabase Init (يُحمَّل في كل صفحة)
// ═══════════════════════════════════════════════════════

/* ═══ SYDENT_OFFLINE_MODULE_START ═══
   SyDent Offline (PWA — Phase 1): قراءة offline عبر نقطة اختناق واحدة.
   ─────────────────────────────────────────────────────────────────────
   الفكرة: لفّة fetch تُمرَّر لعميل Supabase (global.fetch) —
   • قراءات الجداول (GET ‎/rest/v1/‎ بلا ‎/rpc/‎) الناجحة أونلاين تُخزَّن
     بـIndexedDB بمفتاح (uid | url | accept | range) — عزل كامل لكل مستخدم.
   • عند فشل الشبكة (أو offline معروف) تُخدَم آخر نسخة مخزّنة لنفس
     الاستعلام حرفياً → كل الصفحات تكسب القراءة offline بصفر تعديل عليها.
   • الكتابات (POST/PATCH/PUT/DELETE) لا تُكاش ولا تُخدَم من كاش أبداً —
     GET فقط بنيوياً. كتابة جدول أثناء انقطاع معروف → toast واضح فوراً
     ثم نفس فشل الشبكة الطبيعي (مسارات الأخطاء القائمة بلا أي تغيير).
   • نداءات RPC (كلها POST) تمرّ للشبكة بلا toast — منها قراءات
     (isPlatformAdmin) ومساراتها fail-open أصلاً.
   • auth/storage وكل ما هو خارج ‎/rest/v1/‎ يمرّ للشبكة بلا لمس.
   • الأرقام المالية المعروضة offline = «حتى آخر مزامنة» (عرض فقط)؛
     أي إعادة حساب تتم أونلاين حصراً — الجدار العازل محفوظ.
   • تسجيل الخروج يمسح الكاش (sbSignOut → SyDentOffline.wipe).
   أي فشل داخلي (IndexedDB محجوب/كوتا) = تدهور رشيق لسلوك اليوم تماماً. */
(function () {
  'use strict';
  var DB_NAME = 'sydent-offline', STORE = 'rest_cache', OUTBOX = 'outbox', DB_VER = 2;
  var MAX_ENTRIES = 1200;         /* سقف صفوف كاش القراءة — تقليم كسول للأقدم
                                     (رُفع 800→1200 مع prefetch مرضى اليوم) */
  var TRIM_EVERY = 25;            /* افحص السقف كل N كتابة */
  /* مهلة إنقاذ القراءة أونلاين: بعدها تُخدَم النسخة المكاشة إن وُجدت،
     والطلب **لا يُقطع أبداً** — يكمل بالخلفية فيحدّث الكاش للطلب التالي.
     الحالة المستهدفة «اتصال قائم وإنترنت ميت»: السوكيت معلَّق لا مرفوض،
     فالرفض لا يجيء ومسار fromCache القائم لا يُبلَغ إطلاقاً (مقيسٌ حيّاً:
     أكثر من 35 ثانية بلا نتيجة فوق نسخةٍ حاضرة بالكاش). بلا نسخة مكاشة =
     انتظار الشبكة لآخرها تماماً كالسلوك السابق ⇒ التغيير إضافيّ صرف. */
  var NET_RESCUE_MS = 6000;
  /* Phase 2/2.1: الجداول المسموح لكتاباتها الدخول للطابور offline — حصراً،
     وبالأفعال المحددة لكل جدول فقط:
     • appointments (جدولة غير مالية): إنشاء/تعديل/حذف.
     • audit_log (append-only): إنشاء فقط.
     • ledger_payments (Phase 2.1 بقرار المالك): إنشاء فقط — واقعة append-only؛
       تعديل/حذف الدفعات online حصراً، والتوزيع (splits/FIFO) يبقى online
       حصراً عبر مسارات الصفحة القائمة — **صفر أرقام مشتقة تُكتب offline**.
     أي توسيع = قرار معماري يمرّ بالحارس (check-offline-guard يكسر البناء). */
  var OUTBOX_TABLES_RE = /\/rest\/v1\/(appointments|audit_log|ledger_payments)(\?|$)/;
  var OUTBOX_METHODS = {
    appointments:    { POST: 1, PATCH: 1, DELETE: 1 },
    audit_log:       { POST: 1 },
    ledger_payments: { POST: 1 }
  };
  /* كلاهما عمود id من نوع uuid بقيمة افتراضية — الحقن العميلي آمن
     (Migration 64 يؤكد payment_id::uuid)؛ audit_log لا يُحقن (id تسلسلي). */
  var UUID_INJECT_TABLES = { appointments: 1, ledger_payments: 1 };
  var OVERLAY_TABLES = { appointments: 1, ledger_payments: 1 };
  var _db = null, _putCount = 0, _lastWriteToast = 0, _lastQueueToast = 0;
  var _outboxListeners = [], _getAuthHeaders = null, _onSynced = null, _draining = false;

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      if (!window.indexedDB) return reject(new Error('no-idb'));
      var req = window.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        try {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            var os = db.createObjectStore(STORE, { keyPath: 'k' });
            os.createIndex('savedAt', 'savedAt');
          }
          if (!db.objectStoreNames.contains(OUTBOX)) {
            var ob = db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
            ob.createIndex('createdAt', 'createdAt');
          }
        } catch (e) {}
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error || new Error('idb-open')); };
      req.onblocked = function () { reject(new Error('idb-blocked')); };
    });
  }

  function idbGet(k) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function idbPut(rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var t = db.transaction(STORE, 'readwrite');
          t.objectStore(STORE).put(rec);
          t.oncomplete = function () { resolve(true); };
          t.onerror = function () { resolve(false); };
          t.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).then(function (ok) {
      _putCount++;
      if (ok && (_putCount % TRIM_EVERY === 0)) trimOldest();
      return ok;
    }).catch(function () { return false; });
  }

  /* تقليم كسول: عند تجاوز السقف احذف الأقدم (index savedAt تصاعدي) */
  function trimOldest() {
    idbOpen().then(function (db) {
      try {
        var os = db.transaction(STORE, 'readwrite').objectStore(STORE);
        var cnt = os.count();
        cnt.onsuccess = function () {
          var extra = (cnt.result || 0) - MAX_ENTRIES;
          if (extra <= 0) return;
          var cur = os.index('savedAt').openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (c && extra > 0) { extra--; c.delete(); c.continue(); }
          };
        };
      } catch (e) {}
    }).catch(function () {});
  }

  function wipe() {
    try {
      if (_db) { try { _db.close(); } catch (e) {} _db = null; }
      if (window.indexedDB) window.indexedDB.deleteDatabase(DB_NAME);
    } catch (e) {}
  }

  /* uid الحالي من الجلسة المحفوظة — مفتاح العزل بين المستخدمين */
  function currentUid() {
    try {
      var raw = window.localStorage.getItem('sydent.auth');
      if (!raw) return null;
      var s = JSON.parse(raw);
      var sess = (s && s.user) ? s
               : (s && s.currentSession && s.currentSession.user) ? s.currentSession
               : (s && s.session && s.session.user) ? s.session
               : null;
      return (sess && sess.user && sess.user.id) || null;
    } catch (e) { return null; }
  }

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;
    } catch (e) {}
    return '';
  }
  function methodOf(input, init) {
    var m = (init && init.method) || (input && input.method) || 'GET';
    return String(m).toUpperCase();
  }
  function headerOf(input, init, name) {
    try {
      var h = (init && init.headers) || (input && input.headers) || null;
      if (!h) return '';
      if (typeof h.get === 'function') return h.get(name) || '';
      var keys = Object.keys(h);
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i]).toLowerCase() === name) return h[keys[i]] || '';
      }
    } catch (e) {}
    return '';
  }

  function cachedResponse(rec) {
    try {
      var headers = { 'Content-Type': 'application/json', 'X-SyDent-Offline-Cache': '1' };
      if (rec.cr) headers['Content-Range'] = rec.cr;
      return new Response(rec.body, { status: 200, headers: headers });
    } catch (e) { return null; }
  }

  /* ── Phase 2: طابور الكتابة (outbox) — مواعيد + سجل تدقيق حصراً ────────── */
  function uuid() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    /* fallback v4 */
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function outboxNotify() {
    outboxAll().then(function (rows) {
      var pending = 0, failed = 0;
      rows.forEach(function (r) { if (r.status === 'failed') failed++; else pending++; });
      _outboxListeners.forEach(function (fn) { try { fn(pending, failed); } catch (e) {} });
    });
  }
  function outboxAdd(rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var t = db.transaction(OUTBOX, 'readwrite');
          t.objectStore(OUTBOX).add(rec);
          t.oncomplete = function () { resolve(true); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error || new Error('abort')); };
        } catch (e) { reject(e); }
      });
    }).then(function (ok) { outboxNotify(); return ok; });
  }
  function outboxAll() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll();
          r.onsuccess = function () {
            var rows = r.result || [];
            rows.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
            resolve(rows);
          };
          r.onerror = function () { resolve([]); };
        } catch (e) { resolve([]); }
      });
    }).catch(function () { return []; });
  }
  function outboxDelete(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var t = db.transaction(OUTBOX, 'readwrite');
          t.objectStore(OUTBOX).delete(id);
          t.oncomplete = function () { resolve(true); };
          t.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }
  function outboxMark(rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var t = db.transaction(OUTBOX, 'readwrite');
          t.objectStore(OUTBOX).put(rec);
          t.oncomplete = function () { resolve(true); };
          t.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  function idFromUrl(url) {
    try {
      var q = url.split('?')[1] || '';
      var m = /(^|&)id=eq\.([^&]+)/.exec(q);
      return m ? decodeURIComponent(m[2]) : null;
    } catch (e) { return null; }
  }
  function tableFromUrl(url) {
    var m = OUTBOX_TABLES_RE.exec(url);
    return m ? m[1] : null;
  }

  /* ردّ مخلَّق يطابق دلالة PostgREST كي تكمل مسارات الحفظ القائمة كما هي:
     POST→201 · PATCH→200/204 · DELETE→204؛ representation تُعاد صدىً للحمولة
     (+id المحقون) بشكل كائن أو مصفوفة حسب Accept (single مقابل قائمة). */
  function synthWriteResponse(method, prefer, accept, echoRows, patchedId) {
    var wantsRep = (prefer || '').indexOf('return=representation') !== -1;
    var wantsObj = (accept || '').indexOf('vnd.pgrst.object') !== -1;
    var status = method === 'POST' ? 201 : (wantsRep ? 200 : 204);
    if (!wantsRep) {
      return new Response(null, { status: status === 201 ? 201 : 204,
        headers: { 'X-SyDent-Offline-Queued': '1' } });
    }
    var rows = echoRows || [];
    if (method === 'PATCH' && patchedId && rows.length) rows[0].id = rows[0].id || patchedId;
    var body = JSON.stringify(wantsObj ? (rows[0] || {}) : rows);
    return new Response(body, { status: status,
      headers: { 'Content-Type': 'application/json', 'X-SyDent-Offline-Queued': '1' } });
  }

  /* تراكب عمليات الطابور فوق قراءات المواعيد المكاشة — كي تظهر الكتابات
     الأوفلاين فوراً بالقوائم/الروزنامة بعد إعادة التحميل من الكاش. */
  function rowPassesFilters(row, url, uid) {
    try {
      var q = url.split('?')[1] || '';
      var parts = q.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        var col = decodeURIComponent(kv[0] || '');
        var val = decodeURIComponent(kv.slice(1).join('=') || '');
        if (!col || col === 'select' || col === 'order' || col === 'limit' || col === 'offset' || col === 'on_conflict') continue;
        var m = /^(eq|neq|gt|gte|lt|lte)\.(.*)$/.exec(val);
        if (!m) continue; /* or=/in./بنى معقدة → أظهِر بدل أن تُخفي */
        var have = (col === 'doctor_id') ? (row.doctor_id || uid) : row[col];
        if (have === undefined || have === null) continue;
        var a = String(have), b = m[2];
        var ok = { eq: a === b, neq: a !== b, gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[m[1]];
        if (!ok) return false;
      }
      return true;
    } catch (e) { return true; }
  }
  function applyOutboxOverlay(bodyText, url, uid, ops, table) {
    try {
      var data = JSON.parse(bodyText);
      var single = !Array.isArray(data);
      var arr = single ? (data ? [data] : []) : data;
      ops.forEach(function (op) {
        if (op.table !== table) return;
        try {
          if (op.method === 'POST') {
            var rows = JSON.parse(op.body || 'null');
            if (!rows) return;
            if (!Array.isArray(rows)) rows = [rows];
            rows.forEach(function (r) {
              if (!r || !r.id) return;
              var exists = arr.some(function (x) { return x && x.id === r.id; });
              if (!exists && !single && rowPassesFilters(r, url, uid)) arr.push(r);
            });
          } else if (op.method === 'PATCH') {
            var pid = idFromUrl(op.url); if (!pid) return;
            var patch = JSON.parse(op.body || '{}');
            for (var i = 0; i < arr.length; i++) {
              if (arr[i] && arr[i].id === pid) {
                for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) arr[i][k] = patch[k];
              }
            }
          } else if (op.method === 'DELETE') {
            var did = idFromUrl(op.url); if (!did) return;
            for (var j = arr.length - 1; j >= 0; j--) {
              if (arr[j] && arr[j].id === did) arr.splice(j, 1);
            }
          }
        } catch (e) {}
      });
      return JSON.stringify(single ? (arr[0] || null) : arr);
    } catch (e) { return bodyText; }
  }

  /* ── التصريف (drain): إعادة تشغيل الطابور بالترتيب عند عودة النت ──────────
     الترويسات تُعاد بناؤها بجلسة اللحظة (لا توكنات مخزّنة قديمة)؛
     idempotency: insert بـUUID عميلي → 409 duplicate = «تمّ»؛ 4xx أخرى
     (RLS/قيود) → توسم failed وتبقى للمراجعة؛ فشل شبكة → إيقاف وإبقاء. */
  /* v363 — الاشتراك غير الكامل يوقف الطابور ولا يستهلكه: الكتابةُ سترفضها RLS (M141)،
     ومحاولتُها كانت تحرق المحاولات الخمس ثم يُكنَس ما كُتب أوفلاين بعد 7 أيام — حتى لو
     جدّد المالك. الآن ينتظر الطابور التجديد بلا محاولة ولا عدّاد ولا كنس، ويستأنف وحده
     حين يعود المستوى «full». fail-open: تعذّرُ قراءة المستوى ⇒ تصريفٌ عادي. */
  var _pausedSub = false;
  function subNotFull() {
    try {
      var s = window.SyDentSub;
      var lv = s && typeof s.level === 'function' ? s.level() : null;
      return !!lv && lv !== 'full';
    } catch (e) { return false; }
  }
  function drain() {
    var s = window.SyDentSub;
    if (!s || typeof s.load !== 'function') return drainNow();
    return Promise.resolve(s.load()).then(function (st) {
      if (st && st.level && st.level !== 'full') {
        _pausedSub = true;
        outboxNotify();
        return { synced: 0, failed: 0, paused: 'subscription' };
      }
      _pausedSub = false;
      return drainNow();
    }, function () { return drainNow(); });
  }
  function drainNow() {
    if (_draining) return Promise.resolve({ synced: 0, failed: 0 });
    if (window.navigator && window.navigator.onLine === false) return Promise.resolve({ synced: 0, failed: 0 });
    if (typeof _getAuthHeaders !== 'function') return Promise.resolve({ synced: 0, failed: 0 });
    _draining = true;
    var uid = currentUid();
    var synced = 0, failed = 0, syncedRecs = [];
    return outboxAll().then(function (rows) {
      rows = rows.filter(function (r) { return r && r.uid === uid; }); /* عزل المستخدمين */
      var chain = Promise.resolve();
      rows.forEach(function (rec) {
        chain = chain.then(function () {
          if (rec.status === 'failed' && (rec.attempts || 0) >= 5) {
            /* كنّاس: فاشلة نهائياً وأقدم من 7 أيام → أسقِطها كي لا تعلق الشارة للأبد */
            if (Date.now() - (rec.createdAt || 0) > 7 * 24 * 3600 * 1000) {
              console.warn('[SyDentOffline] dropping permanently-failed op (>7d):', rec.method, rec.table, rec.lastError);
              return outboxDelete(rec.id);
            }
            return;
          }
          return Promise.resolve(_getAuthHeaders()).then(function (auth) {
            var headers = {};
            for (var k in auth) headers[k] = auth[k];
            if (rec.headers) {
              if (rec.headers.ct) headers['Content-Type'] = rec.headers.ct;
              if (rec.headers.prefer) headers['Prefer'] = rec.headers.prefer;
              if (rec.headers.accept) headers['Accept'] = rec.headers.accept;
            }
            return window.fetch(rec.url, {
              method: rec.method, headers: headers,
              body: rec.method === 'DELETE' ? undefined : (rec.body || undefined)
            }).then(function (res) {
              if (res.ok || res.status === 409) {
              synced++;
              syncedRecs.push({ table: rec.table, method: rec.method, url: rec.url, body: rec.body });
              return outboxDelete(rec.id);
            }
              if (res.status === 401) { throw new Error('auth-401'); } /* جلسة — أوقف وأبقِ */
              /* v363: انتهى الاشتراك أثناء التصريف ⇒ أوقف وأبقِ (بلا عدّاد) */
              if ((res.status === 403 || res.status === 401) && subNotFull()) { _pausedSub = true; throw new Error('subscription-paused'); }
              failed++;
              rec.status = 'failed'; rec.attempts = (rec.attempts || 0) + 1;
              rec.lastError = 'HTTP ' + res.status;
              console.warn('[SyDentOffline] drain op failed:', rec.method, rec.table, rec.lastError);
              return outboxMark(rec);
            });
          });
        });
      });
      return chain;
    }).catch(function (e) {
      /* شبكة/جلسة — أبقِ الطابور كما هو، محاولة لاحقة */
      console.warn('[SyDentOffline] drain paused:', e && e.message);
    }).then(function () {
      _draining = false;
      if (syncedRecs.length && typeof _onSynced === 'function') {
        try { _onSynced(syncedRecs); } catch (e) {}
      }
      outboxNotify();
      return { synced: synced, failed: failed };
    });
  }

  /* ── شريط «البيانات حتى آخر مزامنة» ──────────────────────────────────
     يظهر حين تُنقذ قراءةٌ بالكاش والمتصفّح يظنّ نفسه متصلاً (شريط الانقطاع
     الأحمر صامتٌ حينها لأنه معلَّق بـonLine===false)، فرقمٌ مالي قديم بلا
     إعلانٍ عن قدمه هو صنف «رقم صحيح بنطاق خاطئ». يشفى ذاتياً: أول قراءة
     شبكة ناجحة تُخفيه، وكذلك الانتقال لانقطاعٍ صريح كي لا يتراكب مع الأحمر. */
  var STALE_ID = 'sydent-stale-banner';
  function staleBarShow() {
    try {
      var b = document.getElementById(STALE_ID);
      if (!b) {
        b = document.createElement('div');
        b.id = STALE_ID;
        b.setAttribute('role', 'status');
        b.setAttribute('aria-live', 'polite');
        b.style.cssText =
          'position:fixed;top:0;left:0;right:0;z-index:2147482999;' +
          'direction:rtl;font-family:inherit;font-size:13px;font-weight:700;' +
          'line-height:1.4;text-align:center;padding:7px 14px;color:#1f2937;' +
          'background:#fde68a;border-bottom:1px solid #d97706;';
        b.textContent = '\u26A0\uFE0F \u0627\u0644\u0634\u0628\u0643\u0629 \u0628\u0637\u064A\u0626\u0629 \u2014 ' +
          '\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629 \u062D\u062A\u0649 \u0622\u062E\u0631 \u0645\u0632\u0627\u0645\u0646\u0629';
        (document.body || document.documentElement).appendChild(b);
      }
      b.style.display = 'block';
    } catch (e) {}
  }
  function staleBarHide() {
    try {
      var b = document.getElementById(STALE_ID);
      if (b) b.style.display = 'none';
    } catch (e) {}
  }
  try { window.addEventListener('offline', staleBarHide); } catch (e) {}

  function offlineFetch(input, init) {
    var url = urlOf(input);
    var method = methodOf(input, init);
    var isRest = url.indexOf('/rest/v1/') !== -1;
    var isRpc = url.indexOf('/rest/v1/rpc/') !== -1;

    /* Phase 2 — كتابة أثناء انقطاع معروف:
       • appointments/audit_log → طابور outbox + ردّ مخلّق ناجح (المواعيد
         تُحقن بـUUID عميلي فتحمل هويتها النهائية من لحظة الإنشاء).
       • أي جدول آخر → رسالة واضحة ثم نفس فشل الشبكة الطبيعي (الجدار المالي). */
    if (isRest && !isRpc &&
        (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') &&
        window.navigator && window.navigator.onLine === false) {

      var qTable = tableFromUrl(url);
      if (qTable && !(OUTBOX_METHODS[qTable] && OUTBOX_METHODS[qTable][method])) qTable = null;
      var qUid = qTable ? currentUid() : null;
      if (qTable && qUid) {
        var bodyText = (init && typeof init.body === 'string') ? init.body : null;
        var echoRows = null;
        try {
          if (method === 'POST' && bodyText) {
            var parsed = JSON.parse(bodyText);
            var rows = Array.isArray(parsed) ? parsed : [parsed];
            if (UUID_INJECT_TABLES[qTable]) {
              rows.forEach(function (r) { if (r && !r.id) r.id = uuid(); });
            }
            bodyText = JSON.stringify(Array.isArray(parsed) ? rows : rows[0]);
            echoRows = rows;
            /* created_at للصدى/الترتيب المؤقت فقط — بعد stringify عمداً،
               فلا يدخل الجسد المطابَر (السيرفر يضبط القيمة الحقيقية عند الرفع) */
            try {
              var nowIso = new Date().toISOString();
              rows.forEach(function (r) { if (r && !r.created_at) r.created_at = nowIso; });
            } catch (e) {}
          } else if (method === 'PATCH' && bodyText) {
            var p = JSON.parse(bodyText);
            echoRows = [p && typeof p === 'object' ? JSON.parse(JSON.stringify(p)) : {}];
          }
        } catch (e) { echoRows = null; }

        var rec = {
          uid: qUid, method: method, url: url, body: bodyText, table: qTable,
          headers: {
            ct: headerOf(input, init, 'content-type'),
            prefer: headerOf(input, init, 'prefer'),
            accept: headerOf(input, init, 'accept')
          },
          createdAt: Date.now(), attempts: 0, status: 'pending'
        };
        return outboxAdd(rec).then(function () {
          var now = Date.now();
          if ((qTable === 'appointments' || qTable === 'ledger_payments') && now - _lastQueueToast > 2500) {
            _lastQueueToast = now;
            var qMsg = (qTable === 'ledger_payments')
              ? '📴 حُفظت الدفعة بلا اتصال — ستُرفع تلقائياً عند عودة الإنترنت'
              : '📴 حُفظ بلا اتصال — سيُرفع تلقائياً عند عودة الإنترنت';
            try {
              if (typeof window.showToast === 'function') window.showToast(qMsg, false);
            } catch (e) {}
          }
          return synthWriteResponse(method, rec.headers.prefer, rec.headers.accept, echoRows, idFromUrl(url));
        }).catch(function () {
          /* فشل الطابور نفسه (IDB محجوب) → سلوك اليوم تماماً */
          return Promise.reject(new TypeError('Failed to fetch'));
        });
      }

      /* رسالة الرفض بالعربي — الصفحات تعرض error.message مباشرة
         (name يُفرَّغ كي لا يسبقها "TypeError:" عند stringify) */
      var fwErr = new TypeError('لا يوجد اتصال بالإنترنت — العملية تتطلب اتصالاً');
      try { fwErr.name = ''; } catch (e) {}
      var now2 = Date.now();
      /* كتابة عرضية داخل تدفقٍ نجح أساسه للتوّ (طابور خلال 1.5ث) —
         ارفضها بصمت كي لا يمحو توستُ الجدار الأحمر رسالةَ النجاح الخضراء
         (مثال: syncPaymentStatus بعد طبخ الدفعة). الرفض نفسه يبقى. */
      if (now2 - _lastWriteToast > 4000 && now2 - _lastQueueToast > 1500) {
        _lastWriteToast = now2;
        /* مؤخَّرة 350ms كي تربح السباق على توست الخطأ الخام من الصفحة
           (showToast عنصر واحد — الأخير يكتب فوق الأول) */
        setTimeout(function () {
          try {
            if (typeof window.showToast === 'function') {
              window.showToast('لا يمكن تنفيذ العملية بلا إنترنت — أعد المحاولة عند عودة الاتصال', true);
            }
          } catch (e) {}
        }, 350);
      }
      return Promise.reject(fwErr);
    }

    /* يُكاش فقط: GET على جداول/فيوهات REST (لا rpc، لا auth، لا storage) */
    if (!isRest || isRpc || method !== 'GET') {
      /* انقطاع معروف: افشل فوراً حتى للممرَّر (RPC/HEAD/auth عبر العميل) —
         لا انتظار رفض نظام التشغيل. كان realloc داخل حفظ الدفعة offline
         ينتظر ثواني قبل أن يلتقطه الـcatch غير-القاتل الموجود أصلاً. */
      if (window.navigator && window.navigator.onLine === false &&
          url.indexOf('http') === 0) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return window.fetch(input, init);
    }

    var uid = currentUid();
    var key = uid
      ? [uid, url, headerOf(input, init, 'accept'), headerOf(input, init, 'range')].join('|')
      : null;

    var doNetwork = function () {
      return window.fetch(input, init).then(function (res) {
        if (res && res.ok) staleBarHide();   /* الشبكة عادت ⇒ لا ستالة معلنة */
        if (key && res && res.ok) {
          try {
            var cr = res.headers.get('content-range') || '';
            res.clone().text().then(function (body) {
              idbPut({ k: key, body: body, cr: cr, savedAt: Date.now() });
            }).catch(function () {});
          } catch (e) {}
        }
        return res;
      });
    };
    var fromCache = function () {
      if (!key) return Promise.resolve(null);
      return idbGet(key).then(function (rec) {
        if (!rec) return null;
        /* Phase 2: قراءات المواعيد المكاشة تُراكَب بعمليات الطابور المعلّقة
           لهذا المستخدم — فالموعد المحفوظ/المعدَّل/المحذوف offline يظهر فوراً */
        var ovTable = tableFromUrl(url);
        if (ovTable && OVERLAY_TABLES[ovTable]) {
          return outboxAll().then(function (ops) {
            ops = ops.filter(function (o) { return o && o.uid === uid; });
            var body = ops.length ? applyOutboxOverlay(rec.body, url, uid, ops, ovTable) : rec.body;
            return cachedResponse({ body: body, cr: rec.cr });
          });
        }
        return cachedResponse(rec);
      });
    };

    /* offline معروف → الكاش أولاً؛ وعند الغياب افشل فوراً (لا انتظار رفض
       نظام التشغيل — كان يبطّئ الحفظ ثواني). أونلاين → شبكة أولاً والكاش
       فقط عند رفضها. فشل API حقيقي أونلاين (4xx/5xx) يمرّ كما هو. */
    if (window.navigator && window.navigator.onLine === false) {
      return fromCache().then(function (hit) {
        if (hit) return hit;
        return Promise.reject(new TypeError('Failed to fetch'));
      });
    }
    /* فرع الشبكة = السلوك السابق حرفياً (نجاح يمرّ · رفض يسقط للكاش ثم يرمي).
       وفرع الإنقاذ يضاف فوقه: بعد NET_RESCUE_MS تُخدَم النسخة المكاشة إن
       وُجدت، وبلا نسخة يبقى معلَّقاً أبداً فلا يفوز بالسباق ⇒ صفر انحدار. */
    var netDone = false;
    var netBranch = doNetwork().then(function (res) {
      netDone = true;
      return res;
    }, function (err) {
      netDone = true;
      return fromCache().then(function (hit) {
        if (hit) return hit;
        throw err;
      });
    });
    var rescueBranch = new Promise(function (r) { setTimeout(r, NET_RESCUE_MS); })
      .then(function () {
        if (netDone) return new Promise(function () {});
        return fromCache().then(function (hit) {
          if (!hit || netDone) return new Promise(function () {});
          staleBarShow();
          return hit;
        });
      });
    return Promise.race([netBranch, rescueBranch]);
  }

  /* ── Prefetch بطاقات مرضى اليوم (تحسين اختياري فوق Phase 1) ──────────────
     الفكرة: بدل نسخ استعلامات بطاقة المريض يدوياً (مرايا تصدأ)، نعيد تشغيل
     «قوالب» مستخرجة من مفاتيح كاش القراءة نفسها — كل URL سبق أن طلبته
     البطاقة وفيه patient_id يصبح قالباً، نستبدل فيه معرّف كل مريض من مرضى
     اليوم (+ تطبيع فلتر تاريخ اليوم) ونجلبه عبر offlineFetch فيُكاش بنفس
     المفتاح الذي ستطلبه الصفحة حرفياً. صفر مرايا: تغيّرت استعلامات الصفحة
     مستقبلاً؟ القوالب تتجدد تلقائياً من أول فتح بطاقة.
     حراسة: GET فقط بنيوياً (يمرّ من نفس بوابة offlineFetch) · مرة/يوم لكل
     uid (الختم يُكتب بعد الاكتمال؛ الانقطاع = إعادة محاولة رخيصة بفضل تخطي
     الطازج) · سقف عمليات + فاصل بين الجلبات · توقف فوري عند فقدان الاتصال.
     البذر الأول: يلزم فتح بطاقة مريض واحدة مرة واحدة بعد النشر. */
  var PF_MAX_OPS = 250, PF_GAP_MS = 120, PF_FRESH_MS = 4 * 60 * 60 * 1000;
  var PF_UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

  function pfToday() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function pfAllKeys() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
          r.onsuccess = function () { resolve(r.result || []); };
          r.onerror = function () { resolve([]); };
        } catch (e) { resolve([]); }
      });
    }).catch(function () { return []; });
  }

  /* استخراج القوالب: (تفكيك المفتاح uid|url|accept|range بحدَّي '|' الأخيرين
     — الـURL لا يحوي '|' خاماً لأن قيم PostgREST مرمَّزة، والتفكيك الدفاعي
     يصمد حتى لو حوى) ثم استبدال uuid المريض بـ{PID} وتاريخ gte بـ{TODAY}. */
  function pfTemplates(uid, keys) {
    var seen = {}, out = [];
    var rePid = new RegExp('([?&]patient_id=eq\\.)' + PF_UUID, 'g');
    var rePatOne = new RegExp('([?&]id=eq\\.)' + PF_UUID, 'g');
    keys.forEach(function (k) {
      if (typeof k !== 'string') return;
      var i1 = k.indexOf('|'), i3 = k.lastIndexOf('|'), i2 = k.lastIndexOf('|', i3 - 1);
      if (i1 < 0 || i2 <= i1 || i3 <= i2) return;
      if (k.slice(0, i1) !== uid) return;
      var url = k.slice(i1 + 1, i2), accept = k.slice(i2 + 1, i3), range = k.slice(i3 + 1);
      if (url.indexOf('/rest/v1/') === -1) return;
      var tpl = null;
      if (rePid.test(url)) {
        tpl = url.replace(rePid, '$1{PID}');
      } else if (url.indexOf('/rest/v1/patients?') !== -1 && rePatOne.test(url)) {
        /* صف المريض المفرد — قاعدة id=eq محصورة بجدول patients حصراً */
        tpl = url.replace(rePatOne, '$1{PID}');
      }
      rePid.lastIndex = 0; rePatOne.lastIndex = 0;
      if (!tpl) return;
      tpl = tpl.replace(/([?&]date=gte\.)\d{4}-\d{2}-\d{2}/g, '$1{TODAY}');
      var sig = tpl + '|' + accept + '|' + range;
      if (seen[sig]) return;
      seen[sig] = 1;
      out.push({ tpl: tpl, accept: accept, range: range });
    });
    return out;
  }

  function prefetchToday() {
    try {
      if (window.navigator && window.navigator.onLine === false) return Promise.resolve(0);
      var uid = currentUid();
      if (!uid || !_getAuthHeaders) return Promise.resolve(0);
      var day = pfToday();
      var stampKey = 'sydent.prefetch.' + uid;
      try { if (window.localStorage.getItem(stampKey) === day) return Promise.resolve(0); } catch (e) {}

      return pfAllKeys().then(function (keys) {
        var tpls = pfTemplates(uid, keys);
        if (!tpls.length) return 0;                 /* لا بذور بعد — فتح بطاقة واحدة يزرعها */
        var origin = tpls[0].tpl.split('/rest/v1/')[0];
        return Promise.resolve(_getAuthHeaders()).then(function (h) {
          h = h || {};
          var seedUrl = origin + '/rest/v1/appointments?select=patient_id&doctor_id=eq.' +
                        uid + '&date=eq.' + day;
          var sh = { apikey: h.apikey, Accept: 'application/json' };
          if (h.Authorization) sh.Authorization = h.Authorization;
          return offlineFetch(seedUrl, { method: 'GET', headers: sh })
            .then(function (res) { return (res && res.ok) ? res.json() : []; })
            .catch(function () { return []; })
            .then(function (rows) {
              var pids = [], pseen = {};
              (rows || []).forEach(function (r) {
                var id = r && r.patient_id;
                if (id && !pseen[id]) { pseen[id] = 1; pids.push(id); }
              });
              if (!pids.length) {
                try { window.localStorage.setItem(stampKey, day); } catch (e) {}
                return 0;
              }
              var ops = [];
              pids.forEach(function (pid) {
                tpls.forEach(function (t) {
                  if (ops.length >= PF_MAX_OPS) return;
                  ops.push({
                    url: t.tpl.split('{PID}').join(pid).split('{TODAY}').join(day),
                    accept: t.accept, range: t.range
                  });
                });
              });
              var done = 0, i = 0;
              function step() {
                if (i >= ops.length) {
                  try { window.localStorage.setItem(stampKey, day); } catch (e) {}
                  try { console.info('[SyDentOffline] prefetch اليوم: ' + done + '/' + ops.length + ' لـ' + pids.length + ' مريض'); } catch (e) {}
                  return Promise.resolve(done);
                }
                if (window.navigator && window.navigator.onLine === false) {
                  /* انقطاع بمنتصف الجولة — بلا ختم كي تُستأنف لاحقاً (الطازج يُتخطى) */
                  return Promise.resolve(done);
                }
                var op = ops[i++];
                var key = [uid, op.url, op.accept, op.range].join('|');
                return idbGet(key).then(function (rec) {
                  if (rec && (Date.now() - (rec.savedAt || 0)) < PF_FRESH_MS) return null;
                  /* Accept تُرسَل فقط إن حملها القالب — كي يتطابق مفتاح الكاش
                     حرفياً مع مفتاح طلب الصفحة (accept فارغ = فارغ) */
                  var oh = { apikey: h.apikey };
                  if (op.accept) oh.Accept = op.accept;
                  if (h.Authorization) oh.Authorization = h.Authorization;
                  if (op.range) oh.Range = op.range;
                  return offlineFetch(op.url, { method: 'GET', headers: oh })
                    .then(function (res) { if (res && res.ok) done++; })
                    .catch(function () {});
                }).then(function () {
                  return new Promise(function (r) { setTimeout(r, PF_GAP_MS); }).then(step);
                });
              }
              return step();
            });
        });
      });
    } catch (e) { return Promise.resolve(0); }
  }

  window.SyDentOffline = {
    fetch: offlineFetch,
    prefetchToday: prefetchToday,
    wipe: wipe,
    drain: drain,
    isPausedForSubscription: function () { return _pausedSub; },
    configureDrain: function (getAuthHeaders, onSynced) { _getAuthHeaders = getAuthHeaders; _onSynced = onSynced || null; },
    onOutboxChange: function (fn) { _outboxListeners.push(fn); outboxNotify(); },
    _get: idbGet, _put: idbPut, _uid: currentUid,
    _outboxAdd: outboxAdd, _outboxAll: outboxAll, _overlay: applyOutboxOverlay   /* للاختبار */
  };
})();
/* ═══ SYDENT_OFFLINE_MODULE_END ═══ */

(function() {
  // إذا تحميل المكتبة لم يكتمل، انتظر
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded');
    return;
  }

  const SUPABASE_URL = 'https://rycqzpdhxabpqrdgtdzg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7LjceYIlrRrHt86sLpCwPg_TlMO8VJu';

  // إنشاء client مشترك
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      storageKey: 'sydent.auth'
    },
    global: {
      /* PWA Phase 1: كل نداءات العميل تمرّ عبر لفّة الأوفلاين (قراءة من
         الكاش عند فشل الشبكة). لو الموديول فشل بالتحميل = fetch الأصلي. */
      fetch: function (input, init) {
        var f = (window.SyDentOffline && window.SyDentOffline.fetch) || window.fetch;
        var args = arguments;
        /* M141: بوابة الاشتراك — كلُّ كتابةٍ لحسابٍ منتهٍ تُرفض هنا برسالةٍ واضحة
           قبل الشبكة وقبل طابور الأوفلاين (SyDentSub أدناه). القاعدة تحرس فعلياً. */
        var gate = (window.SyDentSub && window.SyDentSub.writeGate) ? window.SyDentSub.writeGate(input, init) : null;
        if (gate) return gate.then(function (denied) { return denied || f.apply(window, args); });
        return f.apply(window, args);
      }
    }
  });

  /* ══ SyDentSub:begin ══════════════════════════════════════════════════
     M141 — بوابةُ الاشتراك بالواجهة.
     مصدرُ الحقيقة الوحيد: my_subscription_state() بالقاعدة (tenant_access_level):
       full = نشط/دائم/ضمن السماح · read = مدفوعٌ منتهٍ · none = تجربةٌ منتهية.
     الواجهةُ لا تعيد حساب المستوى — تقرؤه مرةً لكل صفحة، ثم:
       (1) writeGate: تُرفض كلُّ كتابةٍ لغير full من نقطةٍ واحدة (fetch المشترك
           بـcreateClient) قبل الشبكة وقبل طابور الأوفلاين، بردٍّ بصيغة PostgREST
           فتعرض الصفحاتُ رسالتَه كما هي. كتابةٌ خلفية بلا فعلٍ من المستخدم ⇒ صامتة.
       (2) applyPageGate: none ⇒ كلُّ صفحةٍ محجوبة عدا صفحة الاشتراك (بقائمةٍ
           مختصرة) · read ⇒ شريطٌ ثابت للمالك، وبقيةُ الأدوار محجوبة (نمط Cliniko).
     القاعدةُ هي الحارس الفعلي (RLS RESTRICTIVE) — هذه الطبقة للسلوك والرسالة،
     وfail-open عند تعذّر القراءة. OPEN_TABLES مرآةُ v_exempt بهجرة 141 (الحارس V10). */
  window.SyDentSub = (function () {
    var OPEN_TABLES = ['trial_requests', 'subscription_requests', 'subscription_plans',
      'subscription_events', 'subscription_payments', 'platform_settings', 'platform_settings_audit',
      'platform_admins', 'notification_templates', 'login_resolve_hits'];
    var SILENT_KEYS = ['audit_log'];   // فشلُه صامتٌ بالتصميم (logAudit)
    var FILES_BUCKET = 'patient-files';
    var NONE_PAGES = ['subscription.html'];
    var GESTURE_MS = 8000, TOAST_GAP_MS = 5000, WAIT_MS = 4000, RETRY_MS = 30000;
    var _state = null, _loading = null, _failedAt = 0, _gate = null;
    var _lastGesture = 0, _lastToast = 0, _wipe = false;

    try {
      ['pointerdown', 'keydown', 'submit'].forEach(function (ev) {
        window.addEventListener(ev, function () { _lastGesture = Date.now(); }, true);
      });
    } catch (e) {}

    function load(force) {
      if (_state && !force) return Promise.resolve(_state);
      if (_loading) return _loading;
      if (!force && _failedAt && Date.now() - _failedAt < RETRY_MS) return Promise.resolve(null);
      var p = (async function () {
        try {
          var s = await window.sb.auth.getSession();
          var u = s && s.data && s.data.session && s.data.session.user;
          if (!u) return null;
          var r = await window.sb.rpc('my_subscription_state');
          if (!r || r.error || !r.data || typeof r.data !== 'object' || !r.data.level) {
            _failedAt = Date.now();
            console.warn('[SyDentSub] state read failed (fail-open):', r && r.error && r.error.message);
            return null;
          }
          _state = r.data;
          _failedAt = 0;
          markLevel(_state.level, u.id);
          return _state;
        } catch (e) {
          _failedAt = Date.now();
          console.warn('[SyDentSub] state read exception (fail-open):', e && e.message);
          return null;
        }
      })();
      _loading = p;
      p.then(function () { if (_loading === p) _loading = null; });
      return p;
    }

    function level() { return _state ? _state.level : null; }

    // وضعُ القراءة لمداخل الكتابة الضمنية (سحبٌ وإفلات · نقرٌ مزدوج · روابط عميقة):
    // الحالة الحيّة أولاً، ثم وسمُ <html> المستبَق. blockReadOnly تُعلم المستخدم وتعيد
    // true كي يخرج المدخل فوراً: `if (window.SyDentSub && SyDentSub.blockReadOnly()) return;`
    function isReadOnly() {
      if (_state) return _state.level === 'read';
      try { return document.documentElement.getAttribute('data-sub-level') === 'read'; } catch (e) { return false; }
    }
    function blockReadOnly() {
      if (!isReadOnly()) return false;
      try { if (typeof window.showToast === 'function') window.showToast('🔒 ' + msgFor('read'), true); } catch (e) {}
      return true;
    }

    // data-sub-level على <html> يقود CSS وضع القراءة. آخرُ مستوى معروف يُحفظ للتبويب
    // (sessionStorage، مقيَّداً بالمعرّف) فيُطبَّق فوراً عند التحميل التالي بلا وميضٍ
    // لأزرار الكتابة — والقراءةُ الحيّة تصحّحه بعد لحظات إن تغيّر (تجديد مثلاً).
    var LEVEL_KEY = 'sydent.sub.level';
    function markLevel(lvl, uid) {
      try { document.documentElement.setAttribute('data-sub-level', lvl); } catch (e) {}
      try { sessionStorage.setItem(LEVEL_KEY, JSON.stringify({ uid: uid, level: lvl })); } catch (e) {}
    }
    function primeLevel() {
      try {
        var c = JSON.parse(sessionStorage.getItem(LEVEL_KEY) || 'null');
        var a = JSON.parse(localStorage.getItem('sydent.auth') || 'null');
        var uid = a && a.user && a.user.id;
        if (c && uid && c.uid === uid && c.level === 'read') {
          document.documentElement.setAttribute('data-sub-level', 'read');
        }
      } catch (e) {}
    }

    function page() {
      var p = String(window.location.pathname || '').split('/').pop() || 'index.html';
      if (p.indexOf('.') === -1) p += '.html';
      return p.toLowerCase();
    }

    function role() {
      try {
        return (window.SyDentLock && typeof window.SyDentLock.getRole === 'function')
          ? window.SyDentLock.getRole() : 'owner';
      } catch (e) { return 'owner'; }
    }

    function isTrial(st) { return !st || !st.plan || st.plan === 'trial'; }

    function daysUntil(iso) {
      if (!iso) return null;
      var t = new Date(iso).getTime();
      if (isNaN(t)) return null;
      return Math.ceil((t - Date.now()) / 86400000);
    }

    // ضمن السماح: الانتهاءُ مضى والسماحُ لم يمضِ (والقاعدةُ قالت full).
    function inGrace(st) {
      if (!st || st.level !== 'full' || !st.trial_end || !st.grace_until) return false;
      var now = Date.now();
      return new Date(st.trial_end).getTime() <= now && new Date(st.grace_until).getTime() > now;
    }

    function dayWord(d) {
      if (d === 1) return 'يوم واحد';
      if (d === 2) return 'يومين';
      return d + (d <= 10 ? ' أيام' : ' يوماً');
    }

    function msgFor(lvl) {
      return lvl === 'read'
        ? 'اشتراكك منتهٍ — الحساب للقراءة فقط. جدّد الاشتراك لتتمكّن من الإضافة والتعديل.'
        : 'انتهت فترة التجربة — جدّد الاشتراك للمتابعة.';
    }

    // ما يُحرس: كتابةُ REST على جداول العيادة · كتابةُ ملفات المرضى.
    // الـRPC لا تُحرس هنا: الكاتبةُ منها (SECURITY DEFINER) ترفض بالقاعدة نفسها
    // لغير full، ومساراتُ استدعائها بالصفحات تعالج الرفض بصمت (الجدار المالي:
    // لا رموزَ توزيعٍ بهذا الملف — الحارس السادس).
    function classify(url, method) {
      if (/\/rest\/v1\/rpc\//.test(url)) return null;
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
      m = /\/rest\/v1\/([A-Za-z0-9_]+)/.exec(url);
      if (m) return OPEN_TABLES.indexOf(m[1]) > -1 ? null : { key: m[1] };
      m = /\/storage\/v1\/object\/([^?#]*)/.exec(url);
      if (m) {
        var rest = m[1];
        if (/^(sign|list|info|public|authenticated)\//.test(rest)) return null;   // قراءاتٌ بـPOST
        var parts = rest.split('/');
        var bucket = (rest === 'move' || rest === 'copy') ? FILES_BUCKET
                   : (parts[0] === 'upload' && parts[1] === 'sign') ? parts[2]
                   : parts[0];
        if (bucket !== FILES_BUCKET) return null;
        return { key: 'storage', del: method === 'DELETE' };
      }
      return null;
    }

    function notify(msg, info) {
      if (info.silent) return;
      var now = Date.now();
      if (now - _lastGesture > GESTURE_MS) return;   // كتابةٌ خلفية ⇒ بلا توست
      if (now - _lastToast < TOAST_GAP_MS) return;
      _lastToast = now;
      // مؤخَّرة لتكتب فوق توست الخطأ الخام من الصفحة (نفس حيلة جدار الأوفلاين)
      setTimeout(function () {
        try { if (typeof window.showToast === 'function') window.showToast('🔒 ' + msg, true); } catch (e) {}
      }, 350);
    }

    function deny(lvl, info) {
      var msg = msgFor(lvl);
      notify(msg, info);
      var body = JSON.stringify({ code: '42501', message: msg, details: null, hint: null,
                                  statusCode: '403', error: 'subscription_inactive' });
      return new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    function writeGate(input, init) {
      var url = (typeof input === 'string') ? input : String((input && input.url) || '');
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var info = classify(url, method);
      if (!info) return null;
      info.silent = SILENT_KEYS.indexOf(info.key) > -1;
      var decide = function (st) {
        if (!st || st.level === 'full') return null;
        // حذف الحساب: محوُ الملفات حقٌّ باقٍ — للقراءة وللمحجوب أيضاً (M142: القاعدة تسمح به
        // للمحجوب داخل نافذة المحو وحدها، فالعميل لا يسبقها بالرفض)
        if (info.del && _wipe && (st.level === 'read' || st.level === 'none')) return null;
        return deny(st.level, info);
      };
      if (_state) return Promise.resolve(decide(_state));
      var timer = new Promise(function (res) { setTimeout(function () { res(null); }, WAIT_MS); });
      return Promise.race([load(), timer]).then(decide, function () { return null; });
    }

    function whenReady(fn) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
      else fn();
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
    }

    // الحجبُ طبقةٌ فوق الصفحة لا استبدالٌ لـbody: محمّلاتُ الصفحة الجارية تجد عناصرها
    // فلا تنهار (ضجيج Sentry)، والقاعدةُ لا تعطيها بيانات أصلاً. CSS بـtheme.css يخفي
    // كلَّ ما عدا الطبقة ونافذة تبديل المستخدم والتوست.
    function renderBlock(st, staff) {
      window.__sydentBlocked = true;   // in-flight page loaders bail out
      if (document.getElementById('sdSubBlock')) return;
      var trial = isTrial(st);
      var title = staff ? (trial ? 'انتهت فترة التجربة' : 'اشتراك العيادة منتهٍ')
                        : (trial ? 'انتهت فترة التجربة' : 'انتهى اشتراكك');
      var text = staff
        ? (trial ? 'تواصل مع مالك العيادة لتفعيل الاشتراك والمتابعة.'
                 : 'الحساب الآن للقراءة فقط ومتاحٌ لمالك العيادة وحده. تواصل مع المالك لتجديد الاشتراك.')
        : 'لتجديد اشتراكك والاستمرار باستخدام SyDent، اختر خطتك من صفحة الاشتراك.';
      var primary = staff
        ? '<button type="button" class="sd-sub-block-btn" onclick="window.SyDentLock && window.SyDentLock.openSwitchModal()">🔄 تبديل المستخدم</button>'
        : '<a class="sd-sub-block-btn" href="subscription.html">💎 تجديد الاشتراك</a>';
      var box = document.createElement('div');
      box.id = 'sdSubBlock';
      box.className = 'sd-sub-block';
      box.setAttribute('role', 'alert');
      box.innerHTML =
        '<div class="sd-sub-block-icon" aria-hidden="true">' + (staff ? '🔒' : '⏰') + '</div>' +
        '<div class="sd-sub-block-title">' + esc(title) + '</div>' +
        '<div class="sd-sub-block-text">' + esc(text) + '</div>' +
        primary +
        '<button type="button" class="sd-sub-block-out" onclick="window.sbSignOut()">تسجيل الخروج</button>';
      document.body.appendChild(box);
      document.body.classList.add('sd-sub-blocked');
      try { window.scrollTo(0, 0); } catch (e) {}
    }

    function injectBar(st) {
      var main = document.getElementById('sbMainContent');
      if (!main || document.getElementById('sdSubBar')) return;
      var grace = inGrace(st);
      var bar = document.createElement('div');
      bar.id = 'sdSubBar';
      bar.className = 'sd-ro-bar' + (grace ? ' grace' : '');
      bar.setAttribute('role', 'status');
      var txt = document.createElement('span');
      if (grace) {
        txt.textContent = '⏳ اشتراكك منتهٍ وأنت ضمن فترة سماح تنتهي خلال ' + dayWord(daysUntil(st.grace_until)) +
          ' — جدّد قبلها كي ' + (isTrial(st) ? 'لا يُحجب الحساب.' : 'لا يتحوّل الحساب للقراءة فقط.');
      } else {
        txt.textContent = '🔒 اشتراكك منتهٍ — الحساب للقراءة فقط: التصفّح والتصدير والطباعة متاحة، والإضافة والتعديل متوقفان.';
      }
      bar.appendChild(txt);
      if (page() !== 'subscription.html') {
        var a = document.createElement('a');
        a.href = 'subscription.html';
        a.textContent = 'تجديد الاشتراك';
        bar.appendChild(a);
      }
      // بعد رأس الصفحة: .header (اللوحة) · .topbar (أغلب الصفحات) · .page-header (المحاسبة).
      // صفحاتُ .topbar تحشو المحتوى بغلافٍ تالٍ (.content/.page) لا بـ.main ⇒ الشريط أوّلُ
      // أبنائه كي يحاذي البطاقات بدل أن يلتصق بحافتي الشاشة.
      var hdr = null;
      for (var i = 0; i < main.children.length; i++) {
        var cl = main.children[i].classList;
        if (cl.contains('header') || cl.contains('topbar') || cl.contains('page-header')) { hdr = main.children[i]; break; }
      }
      var wrap = hdr ? hdr.nextElementSibling : null;
      if (wrap && (wrap.classList.contains('content') || wrap.classList.contains('page'))) {
        wrap.insertBefore(bar, wrap.firstChild);
      } else {
        main.insertBefore(bar, hdr ? hdr.nextSibling : main.firstChild);
      }
    }

    // التجربة المنتهية على صفحة الاشتراك: القائمة = «الاشتراك» + «تسجيل خروج» فقط.
    function pruneNav() {
      var nav = document.querySelector('.sb-nav');
      if (!nav) return;
      Array.prototype.forEach.call(nav.querySelectorAll('.sb-item'), function (a) {
        var h = a.getAttribute('href') || '';
        if (h !== 'subscription.html' && h !== '#') a.remove();
      });
      Array.prototype.forEach.call(nav.querySelectorAll('.sb-section'), function (sec) {
        var nx = sec.nextElementSibling;
        if (!nx || (nx.classList && nx.classList.contains('sb-section'))) sec.remove();
      });
    }

    function applyPageGate() {
      if (_gate) return _gate;
      _gate = (async function () {
        var st = await load();
        if (!st) return true;                      // fail-open — القاعدة تحرس
        var lvl = st.level;
        try { document.documentElement.setAttribute('data-sub-level', lvl); } catch (e) {}
        if (lvl === 'full') {
          if (inGrace(st)) whenReady(function () { injectBar(st); });
          return true;
        }
        var staff = role() !== 'owner';
        if (lvl === 'none') {
          if (!staff && NONE_PAGES.indexOf(page()) > -1) {
            window.__sydentSubLimited = true;
            whenReady(pruneNav);
            return true;
          }
          window.__sydentBlocked = true;
          whenReady(function () { renderBlock(st, staff); });
          return false;
        }
        if (lvl === 'read') {
          if (staff) {
            window.__sydentBlocked = true;
            whenReady(function () { renderBlock(st, true); });
            return false;
          }
          window.__sydentReadOnly = true;
          whenReady(function () { injectBar(st); });
          return true;
        }
        return true;
      })();
      return _gate;
    }

    primeLevel();
    try { load(); } catch (e) {}   // مبكراً: الكتابةُ الأولى لا تنتظر إلا قليلاً

    return {
      OPEN_TABLES: OPEN_TABLES,
      load: load,
      level: level,
      getState: function () { return _state; },
      isReadOnly: isReadOnly,
      blockReadOnly: blockReadOnly,
      inGrace: inGrace,
      daysUntil: daysUntil,
      writeGate: writeGate,
      applyPageGate: applyPageGate,
      renderBlock: renderBlock,
      pruneNav: pruneNav,
      setWipe: function (v) { _wipe = !!v; }
    };
  })();
  /* ══ SyDentSub:end ══ */

  // ─────────────────────────────────────────────────────────
  // سماحية الأوفلاين للجلسة (PWA Phase 0.1)
  // ─────────────────────────────────────────────────────────
  // المشكلة: auth.getUser() نداء شبكة. عند انقطاع النت كان فشله يُفسَّر
  // «غير مسجّل دخول» فتُرمى الصفحة إلى auth.html رغم وجود جلسة صالحة
  // محفوظة محلياً (repro: لوحة التحكم → قطع النت → فتح المرضى → auth).
  // الحل: لفّ getUser عند نقطة الاختناق الوحيدة — كل الصفحات الـ14
  // والدوال المساعدة وautoGate تمر من هنا — فشلُ شبكةٍ + جلسة محلية =
  // أعِد مستخدم الجلسة المحلية بدل null. أخطاء المصادقة الحقيقية أونلاين
  // (توكن ملغى/جلسة مسحوبة) ليست أخطاء شبكة فتبقى تعيد null ويبقى
  // التحويل لصفحة الدخول يعمل كما هو.
  // أمان: هذا تحكّم عرضِ قشرةٍ فقط — حماية البيانات الفعلية عند RLS،
  // وأي نداء بيانات offline يفشل أصلاً (يظهر معه شريط انقطاع الاتصال).

  function sydentLocalSessionUser() {
    try {
      var raw = window.localStorage.getItem('sydent.auth');
      if (!raw) return null;
      var s = JSON.parse(raw);
      // v2 يخزّن الجلسة مباشرة؛ أشكال أقدم/متداخلة محروسة دفاعياً.
      var sess = (s && s.user) ? s
               : (s && s.currentSession && s.currentSession.user) ? s.currentSession
               : (s && s.session && s.session.user) ? s.session
               : null;
      return (sess && sess.user && sess.user.id) ? sess.user : null;
    } catch (e) { return null; }
  }

  function sydentIsNetworkError(err) {
    try {
      if (navigator && navigator.onLine === false) return true;
      if (!err) return false;
      if (err.name === 'AuthRetryableFetchError') return true;
      if (err.status === 0) return true;
      var m = String(err.message || err);
      return /failed to fetch|networkerror|load failed|fetch failed|network request failed|timed? ?out/i.test(m);
    } catch (e) { return false; }
  }

  /* ── تلميح الأدمن قبل الرسم (إلغاء وميض شيل لوحة التحكم) ────────
     الحارس المتزامن بـ<head> يعرف «في جلسة أم لا» من localStorage فوراً،
     لكنه لا يعرف «هل هذا أدمن» — ذلك يحتاج رحلة شبكة لـplatform_admins،
     فيُرسَم شيل لوحة التحكم كاملاً ثم يُحوَّل (بلاغ حيّ: «بفوت على لوحة
     التحكم أول، بعدين بيفتح صفحة الأدمن»). نفس صنف v146 حرفياً، وأسوأ
     منه لأن التحويل ينتظر الشبكة لا مجرد قراءة محلية — وv146 غطّت فرع
     «لا جلسة» حصراً لأنه وحده يُعرَف محلياً. هذه العلامة تُخزَّن بعد أول فحص
     نظيف فيقع التحويل قبل أن يوجد الجسم أصلاً.

     🔴 أمان: تلميحُ توجيهٍ لا قرارُ تصريح. التصريح الفعلي سيرفر-سايد (RLS +
     بوابة admin.html نفسها)، ومستأجرٌ يزوّر المفتاح يرتدّ من admin.html ولا
     يرى صفّاً واحداً من بيانات المنصّة.

     الاتجاه الآمن: تُكتب/تُمسح على نتيجة نظيفة حصراً — فرعا الخطأ والاستثناء لا
     يلمسانها إطلاقاً، لأن الخطأ ليس دليلاً على عدم-الأدمن، ومسحُها عند كل
     انقطاع يقتل الميزة عند من يفتح التطبيق على شبكة متقطّعة.

     🔴 حارس القفزة: مسحُ العلامة عند false يكسر الحلقة بنيوياً (admin.html
     تنادي هذه الدالة نفسها قبل أن ترتدّ لـindex.html) — لكن حالةً واحدة تنجو:
     علامة قديمة + انقطاع شبكة ⇒ الدالة ترمي فلا تمسح ⇒ ارتداد أبديّ بين
     الصفحتين وأنت أوفلاين. مفتاح القفزة بـsessionStorage يجعل التحويل المبكّر
     مرّةً واحدة بالتبويب؛ فلو ارتدّ قعد الحارس ورُسمت الصفحة طبيعيةً —
     مستقلّ عن الشبكة كلياً. ونجاحٌ نظيف بـtrue يُفرّغ المفتاح فتعود ميزانية
     القفزة للأدمن الشرعي بكل فتحة تطبيق.

     المفتاحان عقدٌ مكرّر مع الصفحات الخمس ⇐ محروسان بمجموعة المرايا Q. */
  var PADM_KEY = 'sydent.padm';
  var PADM_HOP = 'sydent.padm.hop';
  function _padmHint(userId) {
    try {
      if (userId) { localStorage.setItem(PADM_KEY, userId); sessionStorage.removeItem(PADM_HOP); }
      else { localStorage.removeItem(PADM_KEY); }
    } catch (e) { /* تخزين محجوب — تدهور رشيق للسلوك السابق حرفياً */ }
  }
  function _padmClear() {
    try { localStorage.removeItem(PADM_KEY); sessionStorage.removeItem(PADM_HOP); } catch (e) { }
  }

  (function wrapGetUserForOfflineGrace() {
    try {
      if (!window.sb || !window.sb.auth || typeof window.sb.auth.getUser !== 'function') return;
      var realGetUser = window.sb.auth.getUser.bind(window.sb.auth);

      /* ── v_perf: single-flight + ذاكرة TTL قصيرة لـ getUser ──────────────
         التشخيص: getUser نداء شبكة (round-trip كامل من سوريا ~300ms)، وكل
         فتح صفحة كان يطلقه 4-5 مرات (autoGate + bootstrap الصفحة + sidebar +
         قفل الجهاز). الحل عند نقطة الاختناق الوحيدة نفسها التي حلّت مشكلة
         الأوفلاين: النداءات المتزامنة تتشارك promise واحداً (single-flight)،
         والنتيجة الناجحة تُذكَر 30 ثانية فقط.
         أمان (نفس عقد سماحية الأوفلاين أعلاه): هذا تحكّم عرضِ قشرةٍ فقط —
         حماية البيانات الفعلية عند RLS وصلاحية الـJWT بكل نداء بيانات.
         تُذكَر النتائج الناجحة حصراً (فشل/null لا يُكاش أبداً)، النداء بـjwt
         صريح لا يمرّ بالذاكرة إطلاقاً، وsignOut يصفّرها فوراً. ─────────── */
      var _guCache = null;      // { at: ms, res }
      var _guInflight = null;   // Promise قيد الطيران للنداء الافتراضي
      var GU_TTL_MS = 30000;
      function _guClear() { _guCache = null; _guInflight = null; }
      try {
        var realSignOut = window.sb.auth.signOut.bind(window.sb.auth);
        window.sb.auth.signOut = function (opts) { _guClear(); _padmClear(); return realSignOut(opts); };
      } catch (e0) { /* صامت — بدون تصفير تلقائي تبقى TTL الثلاثين ثانية الحارس */ }

      async function _guReal(jwt) {
        try {
          var res = await realGetUser(jwt);
          if (res && res.data && res.data.user) return res;
          // السماحية فقط للنداء الافتراضي (بلا jwt صريح) كي لا نغيّر
          // دلالة التحقق من توكن خارجي محدّد.
          if (jwt === undefined && res && res.error && sydentIsNetworkError(res.error)) {
            var u = sydentLocalSessionUser();
            if (u) return { data: { user: u }, error: null };
          }
          return res;
        } catch (e) {
          if (jwt === undefined && sydentIsNetworkError(e)) {
            var u2 = sydentLocalSessionUser();
            if (u2) return { data: { user: u2 }, error: null };
          }
          throw e;
        }
      }

      window.sb.auth.getUser = async function (jwt) {
        if (jwt !== undefined) return _guReal(jwt);   // توكن صريح: بلا ذاكرة أبداً
        if (_guCache && (Date.now() - _guCache.at) < GU_TTL_MS) return _guCache.res;
        if (_guInflight) return _guInflight;
        var p = _guReal(undefined);
        _guInflight = p;
        try {
          var out = await p;
          if (out && out.data && out.data.user) _guCache = { at: Date.now(), res: out };
          return out;
        } finally {
          _guInflight = null;
        }
      };
    } catch (e) { /* صامت — يبقى السلوك الأصلي بلا لفّ */ }
  })();

  // ── هوية المستأجر لـSentry (المُعرّف وحده — صفر بيانات شخصية) ────────────
  // بلا هذه الكتلة يصل كل خطأٍ مجهولَ المصدر: «شيءٌ وقع بمكانٍ ما». معها يصير
  // «هذا المستأجر، بهذه الصفحة، بهذا الإصدار» — وهو الفرق بين تقريرٍ قابلٍ
  // للتصرّف وضجيج، خصوصاً بمنصّةٍ متعدّدة المستأجرين.
  //
  // ⚠️ `id` فقط. لا بريد ولا اسم ولا هاتف ولا أيّ حقلٍ يخصّ مريضاً — المُعرّف
  // مبهمٌ (UUID) ولا يُفصح عن شيء وحده، ويُترجَم من لوحة الأدمن عند الحاجة.
  //
  // داخل onLoad لأن ستَب المُحمِّل لا يضمن وجود setUser قبل تحميل الحزمة؛
  // وonLoad تُنفّذ فوراً إن كانت محمّلة أصلاً. الوسوم الثابتة (الإصدار
  // والبيئة) تُضبَط من theme.js لأنه يغطّي صفحةً إضافية لا يغطّيها هذا الملف.
  try {
    window.sb.auth.getSession().then(function(r){
      var uid = r && r.data && r.data.session && r.data.session.user
              && r.data.session.user.id;
      if (!uid) return;
      if (typeof Sentry === 'undefined' || typeof Sentry.onLoad !== 'function') return;
      Sentry.onLoad(function(){
        try { Sentry.setUser({ id: uid }); } catch (e) {}
      });
    }).catch(function(){ /* لا جلسة أو تعذّرت القراءة — غير قاتل */ });
  } catch (e) { /* Sentry محجوب أو sb غير جاهز — لا يُكسَر شيء */ }

  // ── دوال مساعدة ──

  // الحصول على الدكتور المسجّل دخول حالياً
  window.sbGetUser = async function() {
    const { data, error } = await window.sb.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  };

  // التحقق من تسجيل الدخول — ينقل لـauth.html إذا لا
  window.sbRequireAuth = async function() {
    const user = await window.sbGetUser();
    if (!user) {
      window.location.href = 'auth.html';
      return null;
    }
    return user;
  };

  // ─────────────────────────────────────────────────────────
  // SyDentName — اللقب المهني للطبيب المالك: مكوّن لا جزء من النص
  // ─────────────────────────────────────────────────────────
  // العلّة المشخَّصة حيّاً: اللقب كان يُكتب **داخل** الاسم الشخصي، فبلا صيغة
  // قانونية — سبع صيَغ متعايشة بالقاعدة على أحد عشر حساباً («د . احمد غنيم» ·
  // «د وجيه حيبا» · «د. أيهم غنيم» · بلا لقب إطلاقاً) — والاسم يُطبع على
  // الروشتة وكشف الحساب وخطة العلاج ويُشتقّ منه اسم العيادة سيرفر-سايد.
  //
  // النموذج المعتمَد (Dentrix Ascend: حقل Title مستقل · Open Dental: Suffix
  // مستقل + Preferred Name للمريض): الإدخال مركَّب (لقب + اسم مجرّد) والتخزين
  // يبقى **سلسلة واحدة** — فصفر عمود جديد وصفر migration وصفر تعديل على أي
  // قارئ من القرّاء العشرة، ومرايا clinic_doctors/clinic_employees تبقى حرفية.
  //
  // ثابت حاكم: display لا **يخترع** لقباً غائباً — يقنّن الموجود فقط. اختراعه
  // كان سيسم مساعدةً أو موظفاً بـ«د.» وهو خطأ مهني؛ ومسارُ الاكتساب الوحيد هو
  // منتقي الإعدادات بيد المالك. والوحدة صفر-كتابة: لا تلمس أي جدول.
  window.SyDentName = (function () {
    // الأنماط منفصلة بحرفها الأول (همزة/ألف مقابل دال) فترتيبها لا أثر له —
    // الحامل الحقيقي هو **اشتراط الفاصل**: نقطة أو مسافة بعد الحرف المفرد.
    // بدونه يُقصّ الحرف الأول من اسمٍ يبدأ بدال («دانا» ⇒ «د. انا») أو من
    // اسمٍ يبدأ بألف تليها دال («ادهم» ⇒ «أ.د. هم») — ولهذا نقطةُ «أ.د»
    // إلزامية بالنمط لا اختيارية.
    var PATS = [
      { canon: 'أ.د.', re: /^[أاإٱ]\s*\.\s*د\s*\.?\s*/ },
      { canon: 'أ.د.', re: /^[أاإٱ]ستاذ\s+(?:ال)?دكتور(?:ة)?\s*\.?\s*/ },
      { canon: 'د.',   re: /^(?:ال)?دكتور(?:ة)?\s*\.?\s*/ },
      { canon: 'د.',   re: /^د\s*\.\s*/ },
      { canon: 'د.',   re: /^د\s+/ }
    ];

    function clean(s) {
      return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
    }
    // يفصل اللقب عن الاسم المجرّد. بلا لقب ⇒ title = ''.
    function split(s) {
      var v = clean(s);
      for (var i = 0; i < PATS.length; i++) {
        var m = PATS[i].re.exec(v);
        if (m && v.slice(m[0].length).trim()) {
          return { title: PATS[i].canon, name: v.slice(m[0].length).trim() };
        }
      }
      return { title: '', name: v };
    }
    function compose(title, name) {
      var t = clean(title), n = clean(name);
      if (!n) return '';
      return t ? (t + ' ' + n) : n;
    }
    // تقنين عرضٍ صرف: يوحّد صيغة اللقب الموجود ولا يضيف لقباً غائباً.
    // القيمة التي لا تُحلّ لاسم (لقبٌ وحده مثلاً) تُعاد كما هي — لا تُفرَّغ.
    function display(s) { return compose(split(s).title, split(s).name) || clean(s); }

    return { split: split, compose: compose, display: display, TITLES: ['د.', 'أ.د.'] };
  })();

  // ─────────────────────────────────────────────────────────
  // Migration 107 — عملة العيادة (رمز عرض فقط)
  // ─────────────────────────────────────────────────────────
  // تُختار مرّة واحدة عند التسجيل (auth.html) وتُخزَّن في
  // clinic_settings.currency. **لا تُغيَّر بعدها إطلاقاً** — لا واجهة تعديل
  // في settings.html، لأن التغيير يقلب رمز كل التاريخ المالي بلا تحويل.
  //
  // ما تفعله هذه الوحدة: توفير الرمز (ل.س / $) **متزامناً** لكل مواضع
  // العرض. لا تلمس أي رقم ولا أي جدول مالي — قاعدة العزل المالي محفوظة
  // بالبناء (صفر كتابة، والقراءة الوحيدة عمود نصّي في clinic_settings).
  //
  // لماذا localStorage: الصفحات ترسم المبالغ قبل أن ينتهي أي استعلام
  // async، فلو اعتمدنا على DB وحده لومض «ل.س» على شاشة عيادة دولار.
  // التسلسل: (1) تسجيل الدخول يبذر القيمة قبل التحويل، (2) كل صفحة تقرأ
  // القيمة الدافئة متزامناً عند التحميل، (3) sidebar.js يحدّثها من DB
  // على كل صفحة (ضمن استعلام clinic_settings القائم — صفر استعلام إضافي).
  // فرق المصدرين مستحيل عملياً لأن القيمة غير قابلة للتغيير أصلاً.
  //
  // fail-safe: أي خطأ في أي مرحلة ⇒ 'SYP' (ل.س) — سلوك ما قبل الميزة حرفياً.
  window.SyDentCurrency = (function () {
    var LS_KEY = 'sydent_currency';
    var LS_MC  = 'sydent_mc';        // M125: علم تعدد العملات (دافئ ومتزامن)
    var _code = null;
    var _mc   = null;

    function norm(c) { return (c === 'USD') ? 'USD' : 'SYP'; }
    function labelOf(c) { return norm(c) === 'USD' ? '$' : 'ل.س'; }

    // قراءة دافئة متزامنة عند تحميل الملف
    try {
      var w = localStorage.getItem(LS_KEY);
      if (w) _code = norm(w);
      var wm = localStorage.getItem(LS_MC);
      if (wm !== null) _mc = (wm === '1');
    } catch (e) { /* خصوصية/حصّة ممتلئة → يبقى null ⇒ SYP وتعدّد مطفأ */ }

    function code() { return _code || 'SYP'; }

    // M125: هل العيادة بوضع تعدد العملات؟ الغياب = مطفأ (الاتجاه الآمن —
    // عيادة أحادية لا ترى أي مبدّل ولا أي تغيير بصري إطلاقاً).
    function multi() { return _mc === true; }
    function setMulti(v) {
      var n = (v === true);
      _mc = n;
      try { localStorage.setItem(LS_MC, n ? '1' : '0'); } catch (e) {}
      return n;
    }

    function set(c) {
      var n = norm(c);
      var changed = (_code !== n);
      _code = n;
      try { localStorage.setItem(LS_KEY, n); } catch (e) {}
      if (changed) { try { paint(); } catch (e2) {} }
      return n;
    }

    function clear() {
      _code = null;
      _mc = null;
      try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_MC); } catch (e) {}
    }

    // تحميل من DB لمالك معلوم. تتسامح مع غياب العمود (قبل Migration 107).
    async function load(ownerId) {
      try {
        if (!window.sb || !ownerId) return code();
        var res = await window.sb.from('clinic_settings')
          .select('currency, multi_currency_enabled').eq('owner_id', ownerId).maybeSingle();
        // عمود غائب (قبل M125) يُفشل الـselect كاملاً بـPostgREST ⇒ إعادة محاولة
        // بالعمود القديم وحده، فالعملة تصل والعلم يبقى مطفأً (الاتجاه الآمن).
        if (res && res.error) {
          res = await window.sb.from('clinic_settings')
            .select('currency').eq('owner_id', ownerId).maybeSingle();
        }
        if (res && res.error) return code();          // 42703 قبل M107 → الدافئ يصمد
        if (res && res.data) {
          if (res.data.currency) set(res.data.currency);
          if (Object.prototype.hasOwnProperty.call(res.data, 'multi_currency_enabled')) {
            setMulti(res.data.multi_currency_enabled === true);
          }
        }
      } catch (e) { /* شبكة/RLS → الدافئ يصمد */ }
      return code();
    }

    // تعبئة كل العناصر الثابتة في الـHTML الموسومة بـ[data-cur].
    // النص يُكتب عبر textContent (صفر XSS بالبناء).
    function paint(root) {
      var lbl = labelOf(_code);
      var nodes = (root || document).querySelectorAll('[data-cur]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = lbl;
      return lbl;
    }

    return { code: code, label: function () { return labelOf(_code); },
             set: set, clear: clear, load: load, paint: paint, norm: norm,
             multi: multi, setMulti: setMulti, labelOf: labelOf };
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // قاعدة #481 — SyDentCurBag: كيسُ القراءة المقسوم بالعملة (مصدرٌ واحد)
  // ═══════════════════════════════════════════════════════════════════════
  // نظيرُ SyDentCurPick على طرف القراءة: هناك مبدّلٌ واحد يكتب العملة، وهنا
  // كيسٌ واحد يقرؤها. وُلد بعد أن تكاثرت نظائرُ الصياغة بأربعة ملفات خلال
  // جلسةٍ واحدة — وأربعُ نسخٍ تنحرف هو حرفياً الصنفُ الذي يحاربه المشروع
  // بكل مكانٍ آخر. المُنسِّق يُمرَّر لأن كل صفحة تملك منسِّقها (fmt · fmtCost
  // · fmtAmount)، والكيسُ لا يعرف كيف تُرسَم الأرقام ولا يجب أن يعرف.
  /* v548 (جولة قصّ 1000 صفّ): حدُّ PostgREST 1000 صفّ للطلب يقصّ كلَّ قراءةٍ جماعية بصمت (قائمةُ المرضى · كلُّ المواعيد ·
     الجلسات · الذمم…). هذا الجالبُ المشترك يصفّح بـorder('id').range بصفحات 1000 — يُبنى الاستعلامُ من جديد لكل صفحة
     (البنّاءُ قابلٌ للتغيير) — ويرجع الشكلَ نفسَه { data, error } فيبقى كلُّ فرعِ خطأٍ/هجرةٍ مفقودة عند المستدعي كما هو.
     الترتيبُ الأصلي للاستعلام يبقى أولاً و`id` كاسرُ تعادلٍ ثابت بين الصفحات. (#699) */
  window.SyDentFetchAll = async function (build) {
    var PAGE = 1000, out = [], off = 0;
    for (;;) {
      var res = await build().order('id').range(off, off + PAGE - 1);
      if (!res || res.error) return { data: null, error: (res && res.error) || { message: 'fetch_failed' } };
      var rows = res.data || [];
      out = out.concat(rows);
      if (rows.length < PAGE) break;
      off += PAGE;
    }
    return { data: out, error: null };
  };

  window.SyDentCurBag = (function () {
    function make() { return { SYP: 0, USD: 0 }; }
    function defCur() { try { return window.SyDentCurrency.code(); } catch (e) { return 'SYP'; } }
    function lblOf(c) { try { return window.SyDentCurrency.labelOf(c); } catch (e) { return (c === 'USD') ? '$' : 'ل.س'; } }
    // الطبقات ذات الحركة، بترتيب عملة العيادة أولاً (سابقة v200: الترتيب
    // يتبع عملة العيادة لا قائمةً مثبّتة).
    function active(bag) {
      var def = defCur();
      return (def === 'USD' ? ['USD', 'SYP'] : ['SYP', 'USD'])
        .filter(function (c) { return ((bag && bag[c]) || 0) !== 0; });
    }
    // bare = المواضع التي لم يكن فيها وسمٌ أصلاً: الطبقة الواحدة بعملة
    // العيادة تُخرج رقماً عارياً فيبقى مخرجُ العيادة الأحادية بايت-مطابقاً
    // للسابق، ولا تظهر القسمة إلا حين يكون للطبقة الثانية حركةٌ فعلية.
    function text(bag, f, bare) {
      var def = defCur(), act = active(bag);
      if (!act.length) return bare ? f(0) : (f(0) + ' ' + lblOf(def));
      if (bare && act.length === 1 && act[0] === def) return f(bag[act[0]]);
      return act.map(function (c) { return f(bag[c]) + ' ' + lblOf(c); }).join(' · ');
    }
    return { make: make, text: text, active: active, defCur: defCur, lblOf: lblOf };
  })();

  /* ═══ SYDENT_PAYROLL_MODULE_START ═══ */
  // ═══════════════════════════════════════════════════════════════════════
  // v382 — SyDentPayroll: تقسيمُ الراتب على الفترة وتصنيفُ دفعات الموظفين (مصدرٌ واحد)
  // ═══════════════════════════════════════════════════════════════════════
  // يستهلكه صفحتا الرواتب (payouts.html) وتقارير الأطباء (provider-reports.html).
  // نقيٌّ تماماً: لا DB ولا DOM — يُستخرَج بين الماركرَين ويُثبَت بالحارس.
  //
  //  • salaryFraction(start, end): نسبةُ الفترة من الشهور بأيام كل شهرٍ الفعلية
  //    (كانون الثاني 31 · شباط 28/29 …) — فالشهرُ الكامل = 1 بالضبط مهما كان
  //    طولُه، والتقسيمُ جمعيّ (1–15 + 16–31 = 1). كانت القسمةَ الثابتة على 30
  //    فأعطت الشهرَ 31 يوماً 103.3٪ من الراتب وشباط 93.3٪ (بلاغ المالك
  //    17 أيلول 2026؛ الأيامُ الفعلية هي الطريقة المعتمدة بأنظمة الرواتب:
  //    Personio · Xero · Gusto · وزارة القوى العاملة بسنغافورة).
  //  • prorateSalary(monthly, start, end, cur): راتبُ الفترة مقرَّباً لوحدة
  //    عملته (سنتُ الدولار · ليرةٌ صحيحة).
  //  • payoutParts(po, model, salaryDueFn): تفكيكُ دفعةٍ إلى راتب/حصّة/مكافأة/يدوي:
  //    التفصيلُ المخزَّن إن وُجد، وإلا حسب نموذج التعويض — راتب ⇒ راتبٌ كلّها ·
  //    نسبة ⇒ حصّةٌ كلّها · راتب+نسبة ⇒ الراتبُ أولاً حتى مستحقّ فترتها والباقي
  //    حصّة · بدون ⇒ يدويّ لا يُخصم من شيء. تُغذّي حارسَ منع الدفع المزدوج.
  window.SyDentPayroll = (function () {
    // 'YYYY-MM-DD' → تاريخ UTC (يرفض القيم المستحيلة كـ2026-02-31 بدل تدويرها)
    function _d(iso) {
      if (!iso || typeof iso !== 'string') return null;
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
      if (!m) return null;
      var y = +m[1], mo = +m[2] - 1, dd = +m[3];
      var d = new Date(Date.UTC(y, mo, dd));
      if (isNaN(d.getTime())) return null;
      if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo || d.getUTCDate() !== dd) return null;
      return d;
    }
    function daysInMonth(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }
    function salaryFraction(start, end) {
      var s = _d(start), e = _d(end);
      if (!s || !e || s > e) return 0;
      var frac = 0;
      var y = s.getUTCFullYear(), m = s.getUTCMonth();
      var ey = e.getUTCFullYear(), em = e.getUTCMonth();
      while (y < ey || (y === ey && m <= em)) {
        var dim  = daysInMonth(y, m);
        var from = (y === s.getUTCFullYear() && m === s.getUTCMonth()) ? s.getUTCDate() : 1;
        var to   = (y === ey && m === em) ? e.getUTCDate() : dim;
        frac += (to - from + 1) / dim;
        m++; if (m > 11) { m = 0; y++; }
      }
      return frac;
    }
    function roundCur(v, cur) {
      var n = Number(v) || 0;
      return (cur === 'USD') ? Math.round(n * 100) / 100 : Math.round(n);
    }
    function prorateSalary(monthly, start, end, cur) {
      var m = Number(monthly) || 0;
      if (m <= 0) return 0;
      return roundCur(m * salaryFraction(start, end), cur);
    }
    function hasBreakdown(po) {
      return ((Number(po && po.breakdown_salary) || 0)
            + (Number(po && po.breakdown_share)  || 0)
            + (Number(po && po.breakdown_bonus)  || 0)) > 0;
    }
    function payoutParts(po, model, salaryDueFn) {
      var amt = Number(po && po.amount) || 0;
      if (hasBreakdown(po)) {
        return { salary: Number(po.breakdown_salary) || 0, share: Number(po.breakdown_share) || 0,
                 bonus: Number(po.breakdown_bonus) || 0, manual: 0, explicit: true };
      }
      if (model === 'salary') return { salary: amt, share: 0, bonus: 0, manual: 0, explicit: false };
      if (model === 'none')   return { salary: 0, share: 0, bonus: 0, manual: amt, explicit: false };
      if (model === 'hybrid') {
        var due = (typeof salaryDueFn === 'function') ? (Number(salaryDueFn(po)) || 0) : 0;
        var sal = Math.min(amt, Math.max(0, due));
        return { salary: sal, share: amt - sal, bonus: 0, manual: 0, explicit: false };
      }
      return { salary: 0, share: amt, bonus: 0, manual: 0, explicit: false };   // percentage / legacy
    }
    // تقاطعُ مدَيَين مغلقَين من أيام ISO → {start,end} أو null
    function overlap(aS, aE, bS, bE) {
      if (!aS || !aE || !bS || !bE) return null;
      var s = (aS > bS) ? aS : bS, e = (aE < bE) ? aE : bE;
      return (s <= e) ? { start: s, end: e } : null;
    }
    // ── v384: سجلُّ النسب بتاريخ سريان (Migration 144) ──
    // history = [{from:'YYYY-MM-DD', pct:0..100}] — يُنظَّف ويُرتَّب تصاعدياً؛ المدخلاتُ
    // المعطوبة (تاريخٌ غير صالح · نسبةٌ خارج 0..100) تُسقَط لا تُدوَّر.
    function normalizeHistory(h) {
      if (typeof h === 'string') { try { h = JSON.parse(h); } catch (e) { h = []; } }
      if (!Array.isArray(h)) return [];
      var out = [];
      h.forEach(function (e) {
        if (!e || !_d(e.from)) return;
        var p = Number(e.pct);
        if (!isFinite(p) || p < 0 || p > 100) return;
        out.push({ from: String(e.from).slice(0, 10), pct: p });
      });
      out.sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
      // تاريخان متطابقان ⇒ الأخيرُ يحكم (استبدال)
      var dedup = [];
      out.forEach(function (e) {
        if (dedup.length && dedup[dedup.length - 1].from === e.from) dedup[dedup.length - 1] = e; else dedup.push(e);
      });
      return dedup;
    }
    // النسبةُ السارية على تاريخٍ: آخرُ مدخلٍ from ≤ date؛ قبل أول مدخل ⇒ أولُ مدخل
    // (تعبئةُ الترحيل «منذ البداية»)؛ سجلٌّ فارغ ⇒ النسبةُ الحالية (fallbackPct).
    function rateAt(history, fallbackPct, date) {
      var h = normalizeHistory(history);
      if (!h.length) return Number(fallbackPct) || 0;
      var d = (date || '').slice(0, 10);
      var pct = h[0].pct;
      for (var i = 0; i < h.length; i++) { if (h[i].from <= d) pct = h[i].pct; else break; }
      return pct;
    }
    // إضافةُ نسبةٍ تسري من تاريخ (تستبدل مدخلَ التاريخ نفسه إن وُجد) → سجلٌّ جديد مرتّب
    function appendRate(history, from, pct) {
      var h = normalizeHistory(history);
      var p = Number(pct);
      if (!_d(from) || !isFinite(p) || p < 0 || p > 100) return h;
      return normalizeHistory(h.concat([{ from: String(from).slice(0, 10), pct: p }]));
    }
    // النسبُ المختلفة السارية ضمن فترة (للعرض: «متغيّرة بالفترة»)
    function ratesInRange(history, fallbackPct, start, end) {
      var h = normalizeHistory(history);
      if (!h.length) return [Number(fallbackPct) || 0];
      var seen = [], first = rateAt(h, fallbackPct, start);
      seen.push(first);
      h.forEach(function (e) { if (e.from > start && e.from <= end && seen.indexOf(e.pct) < 0) seen.push(e.pct); });
      return seen;
    }
    return { salaryFraction: salaryFraction, prorateSalary: prorateSalary, roundCur: roundCur,
             payoutParts: payoutParts, hasBreakdown: hasBreakdown, overlap: overlap, daysInMonth: daysInMonth,
             normalizeHistory: normalizeHistory, rateAt: rateAt, appendRate: appendRate, ratesInRange: ratesInRange };
  })();
  /* ═══ SYDENT_PAYROLL_MODULE_END ═══ */

  // ═══════════════════════════════════════════════════════════════════════
  // M125 — SyDentCurPick: مبدّل عملة الإدخال (مكوّن مشترك وحيد)
  // ═══════════════════════════════════════════════════════════════════════
  // العقد: كل حقل مال بالمنظومة يحمل لصيقةً فيها <span data-cur>، فبدل اثني
  // عشر مبدّلاً يدوياً تنحرف عن بعضها، هذا المكوّن يُركَّب على الحقل نفسه:
  //   mount(inputId)  → يحقن حبّتين (ل.س | $) ويضبط الحقل والوسم لعملته
  //   read(inputId)   → عملة الحفظ ('SYP' | 'USD')
  //   reset(inputId)  → يعيد الافتراضي عند كل فتح (درس تصفير المودالات)
  // ثوابت حاكمة:
  //   • عيادة أحادية (العلم مطفأ) ⇒ لا يُحقن شيء إطلاقاً و read تُرجع عملة
  //     العيادة ⇒ صفر تغيير بصري وصفر تغيير سلوكي — الميزة صامتة تماماً.
  //   • بلا أي تحويل ولا سعر صرف ولا اقتراح مبلغ: تبديل العملة يغيّر وسم
  //     الرقم لا قيمته، والرقم المكتوب يبقى كما هو بعهدة كاتبه.
  //   • الوسم يُبدَّل داخل نطاق الحقل وحده (form-group) فلا يلوّث لصائق
  //     حقول أخرى بالمودال نفسه.
  window.SyDentCurPick = (function () {
    var CUR = ['SYP', 'USD'];

    function el(id) {
      return (typeof id === 'string') ? document.getElementById(id) : (id || null);
    }
    function scopeOf(input, opts) {
      if (opts && opts.scope) return el(opts.scope) || input.parentElement;
      var fg = input.closest ? input.closest('.form-group') : null;
      return fg || input.parentElement;
    }
    function defCur() {
      try { return window.SyDentCurrency.code(); } catch (e) { return 'SYP'; }
    }
    function enabled() {
      try { return window.SyDentCurrency.multi() === true; } catch (e) { return false; }
    }
    // تكييف الحقل + الوسم لعملة بعينها. يعمل بوجود المبدّل وبغيابه.
    function applyCur(input, cur, opts) {
      var c = (cur === 'USD') ? 'USD' : 'SYP';
      input.dataset.cur = c;
      if (input.tagName === 'INPUT' && input.type === 'number') {
        input.step = (c === 'USD') ? '0.01' : '1';
        input.setAttribute('inputmode', (c === 'USD') ? 'decimal' : 'numeric');
      }
      var sc = scopeOf(input, opts);
      if (sc) {
        var lbl = (c === 'USD') ? '$' : 'ل.س';
        var spans = sc.querySelectorAll('[data-cur]');
        for (var i = 0; i < spans.length; i++) spans[i].textContent = lbl;
      }
      var row = input.__curRow;
      if (row) {
        for (var j = 0; j < row.__pills.length; j++) {
          var on = (row.__pills[j].dataset.curval === c);
          row.__pills[j].setAttribute('aria-pressed', on ? 'true' : 'false');
          row.__pills[j].style.background = on ? 'var(--green,#2ee89e)' : 'transparent';
          row.__pills[j].style.color = on ? 'var(--on-green,#062018)' : 'var(--text2,#8aa)';
          row.__pills[j].style.fontWeight = on ? '800' : '600';
        }
      }
      if (opts && typeof opts.onChange === 'function') {
        try { opts.onChange(c); } catch (e) {}
      }
      return c;
    }

    // ── تفريغ المبلغ عند التبديل اليدوي (مصدر واحد للأسطول) ──────────────
    // القاعدة: رقمٌ كُتب تحت وحدةٍ لا يصحّ تحت غيرها — ٤٠٠٬٠٠٠ ل.س ليست
    // ٤٠٠٬٠٠٠ $. فالتبديل اليدوي يُفرِّغ الحقل وتوابعه ويطلب إعادة الكتابة.
    // حصراً بنقرة الطبيب: set/pin/reset/mount لا تُفرّغ شيئاً إطلاقاً — فرقُ
    // «النظام ضبط» عن «الطبيب بدّل» جوهريّ (عقد v177)، والتعبئة التلقائية
    // من الكتالوج وفتحةُ التعديل تبقيان بسلوكهما الحرفيّ السابق.
    function clearOne(node) {
      if (!node || typeof node.value === 'undefined') return false;
      if (String(node.value) === '') return false;
      node.value = '';
      // إطلاق input حقيقي: نظائرُ الحقل المربوطة (إعادة حساب القسط · مجموع
      // تفاصيل الدفعة · وهج زر القالب) تُحدَّث كما لو مسحه الطبيب بيده.
      try { node.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      return true;
    }
    // opts.clearAlso: قائمة معرّفات أو محدّدات CSS لحقول المبالغ التابعة —
    // تصفير الإجمالي وترك القسط معبّأً يصنع خطةً نصفها بعملةٍ ونصفها بأخرى.
    function clearAmounts(input, opts) {
      var n = clearOne(input) ? 1 : 0;
      var list = (opts && opts.clearAlso) || [];
      for (var i = 0; i < list.length; i++) {
        var byId = document.getElementById(list[i]);
        if (byId) { if (clearOne(byId)) n++; continue; }
        var nodes = document.querySelectorAll(list[i]);
        for (var j = 0; j < nodes.length; j++) if (clearOne(nodes[j])) n++;
      }
      return n;
    }

    function mount(inputId, opts) {
      var input = el(inputId);
      if (!input) return null;
      opts = opts || {};
      // مركّب سلفاً ⇒ إعادة ضبط لا حقن ثانٍ (المودال يُفتح مراراً).
      if (input.__curRow) { return reset(input, opts); }
      if (!enabled()) { applyCur(input, takePin(input) || defCur(), opts); return read(input); }

      var row = document.createElement('div');
      row.className = 'cur-pick';
      row.setAttribute('role', 'group');
      // align-self:flex-start ليس تجميلاً: الصفّ يُحقن بـinsertBefore فيصير
      // **عنصر flex** داخل حاويته، وحاويةٌ عمودية (settings.html تعرّف
      // .form-group كذلك) تمدّه على كامل العرض بافتراض align-items:stretch
      // — وinline-flex لا تحميه لأنها تحكم كيف يصفّ أولادَه لا كيف يضعه
      // أبوه. والخاصية بلا مفعولٍ إطلاقاً خارج حاويات flex/grid، فالأسطح
      // التسعة الأخرى مخرجها بايت-مطابق — والعلاج بالمكوّن لا برقعةٍ
      // بصفحةٍ واحدة كي لا يتكرّر بصمت (patients.html وappointments.css
      // تعرّفان .form-group عمودية كذلك: لغمان كامنان يُغلقان هنا).
      row.style.cssText = 'display:inline-flex;align-self:flex-start;gap:2px;'
        + 'padding:2px;margin-bottom:6px;'
        + 'border:1px solid var(--border,rgba(120,150,180,.35));border-radius:8px;';
      row.__pills = [];
      CUR.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.curval = c;
        b.textContent = (c === 'USD') ? '$' : 'ل.س';
        /* v450: حشوةٌ أضيق بعد نقل الحبّتين بجانب الحقل — تترك للمبلغ عرضاً
           كافياً بالأعمدة الضيّقة (عمودُ المبلغ ≈210px بنافذة المصروف). */
        b.style.cssText = 'border:none;border-radius:6px;padding:4px 9px;cursor:pointer;'
          + 'font-family:Cairo,sans-serif;font-size:12px;background:transparent;white-space:nowrap;';
        b.addEventListener('click', function () {
          // القفل حارسٌ بالكود لا بسمة disabled وحدها: العملة المقفولة
          // (سداد مخبر يتبع عملة أمره) يجب ألا تتبدّل بأي مسار.
          if (row.__locked) return;
          if (input.dataset.cur === c) return;   // نفس العملة ⇒ صفر فعل
          var _cleared = clearAmounts(input, opts);
          applyCur(input, c, opts);
          if (_cleared && typeof window.showToast === 'function') {
            window.showToast('💱 بدّلت العملة — أعد كتابة المبلغ بـ' + (c === 'USD' ? '$' : 'ل.س'));
          }
        });
        row.appendChild(b);
        row.__pills.push(b);
      });
      input.__curRow = row;
      /* v450: كان الصفُّ يُحقن **فوق** الحقل فيطول عمودُ المبلغ ٣٢px عن عمود
         التاريخ بجانبه فتختلّ محاذاةُ الصفّ (بلاغُ المالك بصورة «مصروف جديد»).
         الحبّتان صارتا **بجانب الحقل** داخل سطرٍ واحد (الحقل يتمدّد والحبّتان
         بعرضهما الطبيعي)، فارتفاعُ المجموعة = ارتفاعُ أي حقلٍ آخر بالصفّ،
         والمحاذاةُ سليمةٌ بكل الأسطح بلا رقعةٍ بصفحة. */
      var wrap = document.createElement('div');
      wrap.className = 'cur-field';
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
      row.style.marginBottom = '0';
      row.style.alignSelf = 'center';
      row.style.flex = '0 0 auto';
      input.parentElement.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(row);
      input.style.flex = '1 1 auto';
      input.style.minWidth = '0';
      wrap.style.minWidth = '0';
      return applyCur(input, opts.lock || opts.initial || takePin(input) || defCur(), opts);
    }

    // قفل العملة (سداد المخبر يتبع عملة أمره): يخفي الاختيار ويثبّت القيمة.
    function lock(inputId, cur, opts) {
      var input = el(inputId);
      if (!input) return null;
      var c = applyCur(input, cur, opts || {});
      if (input.__curRow) {
        input.__curRow.__locked = true;
        for (var i = 0; i < input.__curRow.__pills.length; i++) {
          input.__curRow.__pills[i].disabled = true;
          input.__curRow.__pills[i].style.cursor = 'default';
        }
      }
      return c;
    }
    function unlock(inputId) {
      var input = el(inputId);
      if (input && input.__curRow) {
        input.__curRow.__locked = false;
        for (var i = 0; i < input.__curRow.__pills.length; i++) {
          input.__curRow.__pills[i].disabled = false;
          input.__curRow.__pills[i].style.cursor = 'pointer';
        }
      }
    }

    function reset(inputId, opts) {
      var input = el(inputId);
      if (!input) return defCur();
      unlock(input);
      return applyCur(input, (opts && opts.lock) || takePin(input) || defCur(), opts || {});
    }

    // ضبطٌ برمجي للعملة بلا قفل: تُستعمله التعبئة التلقائية من الكتالوج
    // لتقول «هذا سعرٌ بهذه العملة» مع إبقاء التبديل بيد الطبيب. لا يُطلق
    // onChange عمداً — الفرق بين «النظام ضبط» و«الطبيب بدّل» جوهريّ:
    // الأول يرافق سعراً صحيحاً، والثاني يُبطِل السعر المعبّأ.
    function set(inputId, cur) {
      var input = el(inputId);
      if (!input) return defCur();
      return applyCur(input, cur, null);
    }

    // pin: «هذا السجلّ عملته كذا» — يصمد أمام mount اللاحق ويُستهلك مرةً واحدة.
    // وُلد من عطلٍ حقيقي: مسارات التعديل تُعبّئ الحقول أولاً ثم تفتح المودال،
    // فكان set يضبط العملة ثم mount يعيدها لعملة العيادة فيُقرأ راتبُ الدولار
    // ليرةً. الحلّ ألّا يعتمد الصواب على ترتيب نداءين ببعد ثلاثين سطراً.
    function pin(inputId, cur) {
      var input = el(inputId);
      if (!input) return defCur();
      var c = (cur === 'USD') ? 'USD' : 'SYP';
      input.dataset.curPin = c;
      return applyCur(input, c, null);
    }
    function takePin(input) {
      if (!input || !input.dataset) return null;
      var p = input.dataset.curPin;
      if (!p) return null;
      delete input.dataset.curPin;          // يُستهلك مرةً — لا يعلَق للسجل التالي
      return (p === 'USD') ? 'USD' : 'SYP';
    }

    // عملة الحفظ. الغياب أو الإطفاء ⇒ عملة العيادة (صفر انحدار بالبناء).
    function read(inputId) {
      var input = el(inputId);
      if (!input || !input.dataset || !input.dataset.cur) return defCur();
      return (input.dataset.cur === 'USD') ? 'USD' : 'SYP';
    }

    return { mount: mount, read: read, reset: reset, lock: lock, unlock: unlock,
             set: set, pin: pin, enabled: enabled, applyCur: applyCur };
  })();

  // الاختصار المستعمل في كل مواضع الدمج النصّي: fmt(x) + ' ' + curLbl()
  window.curLbl = function () { return window.SyDentCurrency.label(); };
  window.paintCurrency = function (root) { return window.SyDentCurrency.paint(root); };

  // الرسم الأولي بالقيمة الدافئة فور جهوزية الـDOM (قبل أي استعلام).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { window.SyDentCurrency.paint(); } catch (e) {}
    });
  } else {
    try { window.SyDentCurrency.paint(); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────
  // Phase F — SyDentAuth namespace (platform admin checks)
  // ─────────────────────────────────────────────────────────
  // Single source of truth for "is this user a platform admin?".
  // Reads from the platform_admins table (Phase F Migration 30) instead
  // of the legacy doctors.role='admin' flag.
  //
  // Why a helper instead of inline queries:
  //   • 12 sites used to inline the same pattern — moved them all here
  //   • Easier to audit / change auth-source in future
  //   • Returns a consistent { isAdmin, error } shape for caller logic
  //
  // Fail-closed semantics: any DB error → isAdmin=false. The caller treats
  // this as "not an admin" rather than blocking — matches pre-Phase-F
  // behavior where errors fell through to non-admin code paths.
  window.SyDentAuth = window.SyDentAuth || {};

  window.SyDentAuth.isPlatformAdmin = async function(userId) {
    if (!userId || !window.sb) return { isAdmin: false, error: 'no_user_or_sb' };
    try {
      var res = await window.sb.from('platform_admins')
        .select('user_id').eq('user_id', userId).maybeSingle();
      if (res.error) {
        console.warn('[SyDentAuth] isPlatformAdmin error:', res.error.message);
        return { isAdmin: false, error: res.error.message };
      }
      var isAdm = !!res.data;
      /* نتيجة نظيفة حصراً: فرع res.error أعلاه وفرع catch أدناه لا يلمسان
         العلامة إطلاقاً — الخطأ ليس دليلاً على عدم-الأدمن. */
      _padmHint(isAdm ? userId : null);
      return { isAdmin: isAdm, error: null };
    } catch (e) {
      console.warn('[SyDentAuth] isPlatformAdmin exception:', e && e.message);
      return { isAdmin: false, error: (e && e.message) || 'exception' };
    }
  };

  // Count rows in platform_admins. Used by last-admin guards in admin.html
  // (suspend/delete/demote workflows must ensure at least 1 admin remains
  // after the operation, otherwise the platform locks itself out).
  window.SyDentAuth.countPlatformAdmins = async function() {
    if (!window.sb) return { count: 0, error: 'no_sb' };
    try {
      var res = await window.sb.from('platform_admins')
        .select('user_id', { count: 'exact', head: true });
      if (res.error) {
        return { count: 0, error: res.error.message };
      }
      return { count: res.count || 0, error: null };
    } catch (e) {
      return { count: 0, error: (e && e.message) || 'exception' };
    }
  };

  // ─────────────────────────────────────────────────────────
  // M139 — tenantGateStatus: حالةُ طلب التجربة لمستأجرٍ مصادَق، بلا fail-open
  // على «لا صفّ».
  // ─────────────────────────────────────────────────────────
  // المشخَّص حيّاً (13 أيلول 2026): التسجيل خطوتان بلا معاملة (auth.signUp ثم
  // إدراج trial_requests). فشلُ الثانية (رقمٌ مكرَّر · انقطاع) يترك حساب auth
  // يتيماً؛ وكانت البوابتان (auth.html + ensureAccountAccessible) تقرآن «لا
  // صفّ» على أنه حسابٌ موروث ⇒ fail-open ⇒ دخولٌ كامل بلا موافقة الأدمن ولا
  // ظهورٍ بلوحته. القاعدةُ الحيّة حملت يتيمَين حقيقيَّين بهذا الصنف.
  //
  // العقد:
  //   • خطأُ قراءة (شبكة/RLS) ⇒ { status:null, error } — المستدعي يبقى fail-open
  //     كما كان (RLS تحمي البيانات؛ لا نُقفل على عطلٍ عابر).
  //   • صفٌّ موجود ⇒ { status }.
  //   • لا صفّ ⇒ شفاءٌ ذاتي: يُعاد إنشاء الطلب من user_metadata بحالة 'new'
  //     (سياسة trial_requests_self_insert تسمح بها) فيظهر للأدمن فوراً
  //     (Realtime M69) ⇒ { status:'new', healed:true }.
  //   • فشلُ الإدراج (فهرسُ هاتف/بريد فريد · أي رفض) ⇒ { status:'orphan' } —
  //     المستدعي يُسجّل الخروج ويعرض رسالةَ دعم. لا مسارَ يُدخل «لا صفّ».
  // الأدمن لا يمرّ من هنا (يُفحص قبله في كل مستدعٍ).
  window.SyDentAuth.tenantGateStatus = async function(user) {
    if (!user || !user.id || !window.sb) return { status: null, error: 'no_user_or_sb' };
    var res = await window.sb.from('trial_requests')
      .select('status').eq('user_id', user.id).maybeSingle();
    if (!res || res.error) return { status: null, error: (res && res.error && res.error.message) || 'read_failed' };
    if (res.data) return { status: res.data.status, error: null };

    var md = user.user_metadata || {};
    var name = String(md.full_name || md.name || '').trim();
    if (!name) name = String(user.email || '').split('@')[0] || 'حساب بلا اسم';
    var phone = String(md.phone || '').replace(/\D/g, '');
    var syn = String(md.syndicate_no || '').trim();
    var city = String(md.syndicate_branch || '').trim();
    var payload = {
      name: name,
      phone: phone || null,
      email: user.email || null,
      city: city || null,
      syndicate_no: syn || null,
      notes: 'أُعيد إنشاء الطلب تلقائياً عند الدخول — حساب auth بلا طلب تجربة (M139)',
      status: 'new',
      user_id: user.id
    };
    var ins = await window.sb.from('trial_requests').insert(payload);
    if (!ins || ins.error) {
      console.warn('[SyDentAuth] orphan auth user — trial_requests self-heal failed:', ins && ins.error && ins.error.message);
      return { status: 'orphan', error: (ins && ins.error && ins.error.message) || 'insert_failed',
               conflict: !!(ins && ins.error && ins.error.code === '23505') };
    }
    console.warn('[SyDentAuth] orphan auth user — trial_requests row re-created (status=new)');
    return { status: 'new', healed: true, error: null };
  };

  // ─────────────────────────────────────────────────────────
  // Phase 7.6F — ensureAccountAccessible
  // ─────────────────────────────────────────────────────────
  // Called by tenant pages AFTER authentication (sbGetUser / sbRequireAuth).
  // Blocks access when the trial_request is in a non-accessible state:
  //   • 'new'       → admin hasn't reviewed yet → redirect to pending.html
  //   • 'rejected'  → admin declined → sign-out + redirect to landing
  //   • 'suspended' → admin paused service → sign-out + redirect to landing
  // For 'accepted' (incl. trial/monthly/yearly/permanent) the gate is a pass-through.
  //
  // Skip rules:
  //   • Admin users (platform_admins) always bypass — they manage the platform
  //     and don't have a tenant trial_request.
  //   • M139: a tenant with NO trial_requests row is NOT grandfathered any more
  //     (live DB: zero legacy rows; the only such users were orphans from a
  //     failed signup step 2). tenantGateStatus re-creates the row as 'new'
  //     (→ pending.html, visible to the admin) or denies (→ auth.html?denied=orphan).
  //
  // Returns: true if the account is accessible, false if a redirect was issued.
  // Callers should `if (!await ensureAccountAccessible()) return;` to short-circuit.
  //
  // Resilience: a READ error (network/RLS) → fail-open (return true).
  // We prefer letting an authenticated user IN over a false-positive lockout,
  // because the per-page RLS rules already protect tenant data.
  window.ensureAccountAccessible = async function(user) {
    try {
      if (!user) user = await window.sbGetUser();
      if (!user) return false; // shouldn't get here — caller should auth-check first

      // Admin bypass: platform users have no tenant subscription.
      // Phase F: switched from doctors.role='admin' to platform_admins table.
      var adminCheck = await window.SyDentAuth.isPlatformAdmin(user.id);
      if (adminCheck.isAdmin) return true;

      // Read the trial_request for this user (M139: no row ⇒ self-heal or deny —
      // never fail-open; only a READ error stays fail-open).
      var gate = await window.SyDentAuth.tenantGateStatus(user);
      if (gate.error && gate.status === null) return true; // read failed → fail-open (RLS still gates data)

      var status = gate.status;

      // 'accepted' covers all paid/trial active states (plan field carries the tier).
      // M141: …والاشتراك داخله — التجربة المنتهية محجوبة عدا صفحة الاشتراك، والمدفوع
      // المنتهي للقراءة (للمالك). القرار كله بـSyDentSub.applyPageGate (fail-open).
      if (status === 'accepted') {
        if (window.SyDentSub) return await window.SyDentSub.applyPageGate();
        return true;
      }

      // Non-accessible states → redirect.
      if (status === 'new') {
        window.location.replace('pending.html');
        return false;
      }
      if (status === 'rejected' || status === 'suspended' || status === 'orphan') {
        try { await window.sb.auth.signOut({ scope: 'local' }); } catch(e){}
        window.location.replace('auth.html?denied=' + encodeURIComponent(status));
        return false;
      }
      // Unknown status → fail-open (don't lock out on a typo'd value).
      return true;
    } catch(err) {
      console.warn('[ensureAccountAccessible] gate error (fail-open):', err);
      return true;
    }
  };

  // تسجيل خروج
  window.sbSignOut = async function() {
    try { if (window.SyDentOffline) window.SyDentOffline.wipe(); } catch (e) {}
    // Migration 107: امسح العملة الدافئة كي لا يرث حسابٌ آخر على نفس الجهاز
    // رمز العيادة السابقة قبل أن يصل استعلام sidebar.
    try { if (window.SyDentCurrency) window.SyDentCurrency.clear(); } catch (e) {}
    await window.sb.auth.signOut();
    window.location.href = 'auth.html';
  };

  // ─────────────────────────────────────────────────────────
  // Entitlements — per-plan feature gating + quota limits
  // ─────────────────────────────────────────────────────────
  // Single source of truth: subscription_plans.entitlements (JSONB boolean
  // map, keyed by the same module ids as sidebar.js nav) + max_employees /
  // max_patients numeric quotas. The tenant's tier comes from
  // trial_requests.plan. Pattern: Stripe Entitlements + the pricing_plans
  // model — the catalog DEFINES, the runtime ENFORCES.
  //
  // Fail-open by design (mirrors ensureAccountAccessible): a missing key, a
  // missing column (pre-migration), or any error → feature ALLOWED / limit
  // UNLIMITED. We never lock a paying tenant out of their own data over a
  // config glitch. Under-enforcement is the safe failure direction here; the
  // hard quota enforcement lives in the DB triggers (Migration 36).
  (function(){
    var _plan = null;     // cached resolved plan object
    var _loading = null;  // in-flight promise (dedupe concurrent callers)

    async function _resolve() {
      try {
        var user = await window.sbGetUser();
        if (!user) return null;
        /* DeepCode #1 (v555): الكتالوجُ صغيرٌ ومقروءٌ للجميع — يُجلب **مع** طلب التجربة لا بعده (جولةٌ لا جولتان)،
           ويُختار صفُّ الخطة بالرمز نفسه الذي كان يُمرَّر لـ.eq('code', …). */
        var _plansP = Promise.resolve(window.sb.from('subscription_plans')
          .select('code, display_name, entitlements, max_patients, max_employees'))
          .then(function (r) { return r; }, function (e) { return { data: null, error: e }; });
        var tr = await window.sb.from('trial_requests')
          .select('plan, ai_override').eq('user_id', user.id).maybeSingle();
        var code = (tr && tr.data && tr.data.plan) ? tr.data.plan : null;
        // Migration 110 — per-account AI override (third gate layer, admin-set).
        // Tri-state: true = force ON (beats the plan) · false = force OFF ·
        // null/missing column = follow the plan (identical to pre-110 behaviour).
        var _ovRaw = (tr && tr.data) ? tr.data.ai_override : null;
        var ovr = (_ovRaw === true) ? true : (_ovRaw === false ? false : null);
        if (!code) return { code:null, entitlements:{}, max_patients:null, max_employees:null, ai_override:ovr };
        var _pls = await _plansP;
        var row = {};
        if (_pls && !_pls.error && Array.isArray(_pls.data)) {
          for (var _pi = 0; _pi < _pls.data.length; _pi++) { if (_pls.data[_pi] && _pls.data[_pi].code === code) { row = _pls.data[_pi]; break; } }
        }
        return {
          code: code,
          display_name: row.display_name || code,
          entitlements: (row.entitlements && typeof row.entitlements === 'object') ? row.entitlements : {},
          max_patients:  (row.max_patients  == null ? null : Number(row.max_patients)),
          max_employees: (row.max_employees == null ? null : Number(row.max_employees)),
          ai_override:   ovr
        };
      } catch(e) {
        console.warn('[SyDentPlan] resolve failed (fail-open):', e);
        return { code:null, entitlements:{}, max_patients:null, max_employees:null, ai_override:null };
      }
    }

    window.SyDentPlan = {
      load: function() {
        if (_plan) return Promise.resolve(_plan);
        if (_loading) return _loading;
        _loading = _resolve().then(function(p){ _plan = p; _loading = null; return p; });
        return _loading;
      },
      getPlan: function() { return _plan; },
      // boolean feature — default ALLOW when key/plan unknown (grandfather)
      can: function(key) {
        // Migration 110 — per-account admin override wins over the plan for
        // 'ai_features' ONLY. Handled here (not at each call site) so all four
        // consumer surfaces — patients.html, pp-wa.js, settings.html and
        // patient-profile.html — inherit it with zero edits. The clinic opt-in
        // (clinic_settings.ai_features_enabled) is a SEPARATE gate and is never
        // bypassed: privacy is not overridable.
        if (key === 'ai_features' && _plan && _plan.ai_override === true)  return true;
        if (key === 'ai_features' && _plan && _plan.ai_override === false) return false;
        if (!_plan || !_plan.entitlements) return true;
        return (_plan.entitlements[key] === false) ? false : true;
      },
      // numeric quota — null = unlimited
      limit: function(kind) {
        if (!_plan) return null;
        if (kind === 'patients')  return _plan.max_patients;
        if (kind === 'employees') return _plan.max_employees;
        return null;
      }
    };
  })();

  // Phase C: full-screen "this module is not in your plan" gate. Mirrors the
  // suspension/pending screens in sidebar.js for visual consistency.
  window.__sydentRenderPlanBlock = function() {
    var planName = (window.SyDentPlan && window.SyDentPlan.getPlan() && window.SyDentPlan.getPlan().display_name) || '';
    var nameLine = planName ? ('خطتك الحالية: ' + planName) : 'هذه الميزة غير متاحة في خطتك الحالية.';
    window.__sydentBlocked = true;   // in-flight page loaders bail out (Sentry 31 Aug 2026)
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg,#0a1628);padding:24px;font-family:\'Cairo\',sans-serif;text-align:center;">' +
        '<div style="font-size:60px;margin-bottom:16px;">🔒</div>' +
        '<div style="font-size:22px;font-weight:800;color:var(--text,#e1f4ee);margin-bottom:10px;">هذه الميزة غير متاحة في خطتك</div>' +
        '<div style="font-size:14px;color:var(--text2,#8a9ab5);margin-bottom:28px;max-width:340px;line-height:1.7;">' + nameLine + '<br>للترقية والوصول لكل الميزات، تواصل معنا.</div>' +
        '<a href="index.html" style="padding:14px 28px;background:var(--green,var(--green));border-radius:12px;color:#062a1c;font-size:15px;font-weight:800;text-decoration:none;">← العودة للوحة التحكم</a>' +
      '</div>';
  };

  // ─────────────────────────────────────────────────────────
  // Phase 7.6F — Auto-gate on page load
  // ─────────────────────────────────────────────────────────
  // Runs ensureAccountAccessible automatically on tenant pages, so we don't
  // need to modify 9+ tenant pages individually. The gate runs after the
  // first auth state event (we know whether a user is logged in by then).
  //
  // Skipped pages: auth.html, landing.html, pending.html, admin.html.
  // These are either pre-auth (landing/auth/pending) or admin-only (admin),
  // none of which should be gated against trial_request status.
  //
  // Why a small delay before running: tenant pages do their own auth check
  // shortly after load (await getUser → redirect-if-null). Running the gate
  // too eagerly races with that. We wait for either:
  //   • The first onAuthStateChange event (SIGNED_IN / TOKEN_REFRESHED), OR
  //   • A 1.2 second fallback timer (if no event fires, fall back to a
  //     direct getUser check — handles already-signed-in pages).
  (function autoGate() {
    try {
      var path = (window.location.pathname || '').toLowerCase();
      var page = path.split('/').pop() || 'index.html';
      // Phase Email Part 3b: Cloudflare Pages serves clean URLs (no .html).
      // Normalize so both '/reset-password' and '/reset-password.html' skip alike.
      // Rule #63 applied to autoGate skip (was already applied to isPublicPage).
      if (page && page.indexOf('.') === -1) page = page + '.html';
      var skip = { 'auth.html':1, 'landing.html':1, 'pending.html':1, 'admin.html':1, 'reset-password.html':1 };
      if (skip[page]) return;

      // Phase C: map gateable pages → entitlement module id (same ids as the
      // sidebar nav). Core pages (dashboard/patients/appointments/settings)
      // are intentionally absent — they are never plan-gated.
      var PAGE_MODULE = {
        'treatments.html':'treatments',
        'doctors.html':'doctors',
        'employees.html':'employees',
        'payouts.html':'payouts',
        'expenses.html':'expenses',
        'inventory.html':'inventory',
        'labs.html':'labs',
        'accounting.html':'accounting',
        'provider-reports.html':'provider-reports',
        'audit-log.html':'audit-log',
        'learn.html':'learn'
      };

      var gateRan = false;
      var runGate = async function(reason) {
        if (gateRan) return;
        gateRan = true;
        try {
          var user = await window.sbGetUser();
          if (!user) return; // tenant page's own auth check will redirect — let it
          var accessible = await window.ensureAccountAccessible(user);
          if (accessible === false) return; // a redirect was already issued

          // Phase C: per-plan module gate. If this page maps to a module that
          // the tenant's plan disables, block it. Fail-open: any error here
          // leaves the page accessible (SyDentPlan.can defaults to allow).
          var moduleId = PAGE_MODULE[page];
          if (moduleId && window.SyDentPlan) {
            try {
              await window.SyDentPlan.load();
              if (!window.SyDentPlan.can(moduleId)) {
                window.__sydentRenderPlanBlock();
              }
            } catch(mErr) { console.warn('[autoGate] module gate skipped:', mErr); }
          }
        } catch(e) {
          console.warn('[autoGate] failed (' + reason + '):', e);
        }
      };

      // Listen for the first auth event (preferred path).
      try {
        var sub = window.sb.auth.onAuthStateChange(function(event, session){
          if (session) runGate('authEvent:' + event);
        });
        // Best-effort unsubscribe after the first run to avoid leaks; supabase
        // returns { data: { subscription: { unsubscribe } } } shape.
        setTimeout(function(){
          try { if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); } catch(e){}
        }, 5000);
      } catch(subErr) { /* listener unavailable — fall back to timer below */ }

      // Fallback: if no auth event fires within 1.2s, run the gate directly.
      // Covers the case where the user is already signed in (no fresh event).
      setTimeout(function(){ runGate('fallback'); }, 1200);
    } catch(outerErr) {
      console.warn('[autoGate] init error:', outerErr);
    }
  })();

  console.log('[SyDent] Supabase initialized');
})();

// ═══════════════════════════════════════════════════════════════════
// SyDent — Device Lock Mode (Phase 4)
// ═══════════════════════════════════════════════════════════════════
// نظام أدوار محلي على مستوى الجهاز (Owner / Doctor / Secretary).
// PIN واحد يُخزَّن hashed (SHA-256) في clinic_settings.lock_pin_hash.
// الـ role يُحفظ في localStorage. Hierarchy: Owner > Doctor = Secretary.
// Owner → أي شي بدون PIN (تخفيض). أي ترقية أو تبديل أفقي → PIN مطلوب.
// Rate-limit: 5 محاولات خاطئة → 60 ثانية cooldown.
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────
  const LS_ROLE        = 'sydent.lock.role';        // 'owner'|'doctor'|'secretary'
  const LS_DOCTOR_ID   = 'sydent.lock.doctorId';    // UUID (when role=doctor)
  const LS_EMPLOYEE_ID = 'sydent.lock.employeeId';  // ← Phase 5: per-employee identity
  const LS_FAIL_COUNT  = 'sydent.lock.failCount';
  const LS_COOLDOWN    = 'sydent.lock.cooldownUntil';
  const MAX_FAILS      = 5;
  const COOLDOWN_MS    = 60 * 1000; // 60 seconds

  const ROLE_LABELS = {
    owner:     'المالك',
    doctor:    'الطبيب',
    secretary: 'السكرتيرة'
  };
  const ROLE_ICONS = {
    owner:     '👑',
    doctor:    '👨‍⚕️',
    secretary: '👩‍💼'
  };
  const ROLE_COLORS = {
    // v377: unified tone tokens (theme.css) — same chips as the employees page
    owner:     { bg: 'var(--green-bg)',  border: 'var(--green-bd)',  text: 'var(--green-fg)' },
    doctor:    { bg: 'var(--blue-bg)',   border: 'var(--blue-bd)',   text: 'var(--blue-fg)' },
    secretary: { bg: 'var(--orange-bg)', border: 'var(--orange-bd)', text: 'var(--orange-ink)' }
  };

  // ── Public-page detection (Phase X10.1 fix) ─────────────────────────
  // Single source of truth for "is this a pre-auth page that should not
  // render tenant UI (role pill, inactive banner, sidebar)?". Used by
  // injectHeaderButton, injectInactiveBanner, and autoInit as a defense-
  // in-depth guard. Even if any of those is called directly (cached
  // service worker, manual API call, future entry point), the public
  // page check stops tenant UI from leaking onto auth/landing/index/
  // pending/admin (platform layer).
  //
  // Pages classified as "public":
  //   /                — apex (some browsers report "/" for root)
  //   /index           — dashboard router (redirects based on auth)
  //   /auth            — pre-auth login/signup
  //   /landing         — pure marketing (anon access)
  //   /pending         — post-signup waiting page (auth'd but no clinic yet)
  //   /admin           — SaaS platform admin (cross-tenant, not a tenant)
  //
  // Phase X10.2 fix: Cloudflare Pages serves clean URLs by default —
  // sydent.app/landing rewrites internally to landing.html but the
  // browser's window.location.pathname stays as "/landing" (no .html).
  // The first version of this helper required the ".html" suffix and
  // therefore failed on Brave/Chrome desktop where Cloudflare clean URLs
  // were the default rewrite mode. iPhone Safari still worked because
  // when typing the URL directly the pathname kept ".html".
  // The fix: treat ".html" as optional in the regex, so both
  // "/landing" and "/landing.html" classify as public.
  //
  // We also strip an optional trailing slash to handle "/auth.html/"
  // (rare but seen on some CDN edges) and use an explicit leading slash
  // boundary so partial matches like "myauth" don't false-positive.
  // Phase F4 — index.html is the post-auth dashboard, NOT a public page.
  // The pre-auth guard at the top of index.html redirects unauth users to
  // landing.html, so by the time any SyDentLock code runs on / or /index.html,
  // the user is guaranteed authenticated. Listing 'index' here caused the
  // header switch-employee button to disappear from the dashboard (the very
  // place users need it most). The public set is: apex `/` is intentionally
  // excluded too — apex resolves to index.html which is post-auth.
  // Truly public pages: auth, landing, pending, admin (platform), reset-password.
  function isPublicPage() {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return /^\/(auth|landing|pending|admin|reset-password)(\.html)?$/.test(path);
  }



  // ── Cache (loaded once per page) ───────────────────────────────
  let _pinHashCache = null;       // SHA-256 hex من DB
  let _pinHashLoaded = false;
  let _doctorsListCache = null;    // active doctors only (for switch picker)
  let _allDoctorsListCache = null; // ALL doctors incl inactive (for name recovery)
  let _employeesListCache = null;  // Phase 5: active employees (for picker)
  let _allEmployeesListCache = null; // Phase 5: all employees incl inactive (recovery)

  // ── Low-level state ────────────────────────────────────────────
  function getRole() {
    try {
      var r = localStorage.getItem(LS_ROLE);
      if (r === 'owner' || r === 'doctor' || r === 'secretary') return r;
    } catch(e) {}
    return 'owner'; // default: جهاز جديد = Owner
  }

  function getDoctorId() {
    try {
      var d = localStorage.getItem(LS_DOCTOR_ID);
      return d && d !== 'null' && d !== 'undefined' ? d : null;
    } catch(e) { return null; }
  }

  // Phase 5: per-employee identity (which specific person is using this device)
  function getEmployeeId() {
    try {
      var e = localStorage.getItem(LS_EMPLOYEE_ID);
      return e && e !== 'null' && e !== 'undefined' ? e : null;
    } catch(err) { return null; }
  }

  // Phase 5: resolve the effective doctor_id for filter/lock purposes.
  // Priority order:
  //   1. LS_DOCTOR_ID  (legacy + Phase 5 with explicit doctor_id)
  //   2. Phase 5 employee.doctor_id from cache (if LS_DOCTOR_ID is missing
  //      but the locked employee has a doctor_id linkage in the DB)
  //   3. null
  //
  // This is critical for provider-reports.html in Phase 5 where a device
  // may have LS_EMPLOYEE_ID set but LS_DOCTOR_ID empty (e.g. employee was
  // created without doctor_id link, or LS_DOCTOR_ID got cleared by an
  // applyRole call that didn't propagate from the employee record).
  function getEffectiveDoctorId() {
    var did = getDoctorId();
    if (did) return did;
    // Fallback: look up the locked employee's doctor_id
    var empId = getEmployeeId();
    if (!empId || !_employeesListCache) return null;
    var emp = _employeesListCache.find(function(e){ return e.id === empId; });
    if (emp && emp.role === 'doctor' && emp.doctor_id) return emp.doctor_id;
    // Also check allEmployees cache (in case employee is deactivated but row exists)
    if (_allEmployeesListCache) {
      var empAny = _allEmployeesListCache.find(function(e){ return e.id === empId; });
      if (empAny && empAny.role === 'doctor' && empAny.doctor_id) return empAny.doctor_id;
    }
    return null;
  }

  function isOwner()     { return getRole() === 'owner'; }
  function isDoctor()    { return getRole() === 'doctor'; }
  function isSecretary() { return getRole() === 'secretary'; }

  // ── Owner's real person name (dynamic, no static "المالك") ─────
  // The owner identity must display the actual person's name, NOT the
  // literal role word "المالك". Resolution order (uses already-loaded
  // caches, no extra query):
  //   1. clinic_employees row with role='owner' (same name shown in the
  //      switch picker — keeps pill + modal in perfect agreement)
  //   2. clinic_doctors row with is_owner=true (fallback)
  //   3. null → callers fall back to ROLE_LABELS.owner
  // Name is used as-is (the stored name already carries the "د" title
  // when the owner is a doctor — avoids double-prefix like "د. د أيهم").
  function getOwnerPersonName() {
    try {
      var eSrc = _employeesListCache || _allEmployeesListCache;
      if (eSrc) {
        var oe = eSrc.find(function(e){ return e.role === 'owner' && e.name; });
        if (oe) return oe.name;
      }
      var dSrc = _doctorsListCache || _allDoctorsListCache;
      if (dSrc) {
        var od = dSrc.find(function(d){ return d.is_owner === true && d.name; });
        if (od) return od.name;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Sync check: is a PIN configured in the DB?
  // Returns false if cache hasn't loaded yet OR if no PIN is set.
  // This is safe-by-default — if we can't confirm a PIN exists, we treat
  // the lock as unconfigured (which means no PIN-required transitions).
  // The cache is preloaded by autoInit() so this returns the correct value
  // by the time the user clicks the lock button.
  function isPinSet() {
    return !!(_pinHashLoaded && _pinHashCache);
  }

  // ── Hierarchy: Owner=3 > Doctor=2 = Secretary=2 ───────────────
  // الفلسفة: Owner → أي شي بدون PIN (تخفيض). أي ترقية → PIN.
  // التبديل الأفقي (Doctor → Secretary أو العكس) → PIN.
  // التبديل بين أطباء (Doctor:A → Doctor:B) → PIN.
  // ✱ Important: if NO PIN is configured in the DB, the lock is effectively
  //   disabled — any transition is free (otherwise Doctor/Secretary devices
  //   could lock themselves out before setup completes).
  function requirePin(targetRole, targetDoctorId) {
    // Lock not configured → no PIN required ever (prevents lockout if user
    // switches modes before setting up a PIN)
    if (!isPinSet()) return false;

    var curRole = getRole();
    var curDoctorId = getDoctorId();

    // Same exact state — no-op, no PIN
    if (curRole === targetRole) {
      if (targetRole === 'doctor') {
        if ((curDoctorId || null) === (targetDoctorId || null)) return false;
        // تبديل بين أطباء — PIN
        return true;
      }
      return false;
    }

    // Owner → أي شي = تخفيض = بدون PIN
    if (curRole === 'owner') return false;

    // Secretary/Doctor → Owner = ترقية = PIN
    if (targetRole === 'owner') return true;

    // أفقي (Secretary ↔ Doctor) = PIN
    return true;
  }

  // ── PIN hashing (SHA-256 hex) ──────────────────────────────────
  async function hashPin(pin) {
    if (typeof pin !== 'string') pin = String(pin || '');
    var enc = new TextEncoder();
    var buf = await crypto.subtle.digest('SHA-256', enc.encode(pin));
    var arr = Array.from(new Uint8Array(buf));
    return arr.map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  // ── DB: load/save PIN hash on clinic_settings ─────────────────
  async function loadPinHash() {
    if (_pinHashLoaded) return _pinHashCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return null;
      var res = await window.sb.from('clinic_settings')
        .select('lock_pin_hash')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (res.error) {
        // Migration not applied yet — fall back to "no PIN configured"
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        if (!/lock_pin_hash|42703|PGRST/i.test(m)) {
          console.warn('[SyDentLock] loadPinHash:', res.error);
        }
        _pinHashCache = null;
      } else {
        _pinHashCache = res.data && res.data.lock_pin_hash || null;
      }
    } catch(e) {
      console.warn('[SyDentLock] loadPinHash exception:', e);
      _pinHashCache = null;
    }
    _pinHashLoaded = true;
    return _pinHashCache;
  }

  // Force reload — used after PIN set/change
  function invalidatePinCache() {
    _pinHashLoaded = false;
    _pinHashCache = null;
  }

  async function savePinHash(newHash) {
    var user = await window.sbGetUser();
    if (!user) throw new Error('not authenticated');
    var res = await window.sb.from('clinic_settings')
      .upsert({ owner_id: user.id, lock_pin_hash: newHash }, { onConflict: 'owner_id' })
      .select('lock_pin_hash')
      .maybeSingle();
    if (res.error) throw res.error;
    _pinHashCache = newHash;
    _pinHashLoaded = true;
    return true;
  }

  // ── Rate limit ─────────────────────────────────────────────────
  function isInCooldown() {
    try {
      var until = parseInt(localStorage.getItem(LS_COOLDOWN) || '0', 10);
      return !!(until && Date.now() < until);
    } catch(e) { return false; }
  }

  function cooldownSecondsLeft() {
    try {
      var until = parseInt(localStorage.getItem(LS_COOLDOWN) || '0', 10);
      var ms = until - Date.now();
      return ms > 0 ? Math.ceil(ms / 1000) : 0;
    } catch(e) { return 0; }
  }

  function recordFail() {
    try {
      var n = parseInt(localStorage.getItem(LS_FAIL_COUNT) || '0', 10);
      n = (isNaN(n) ? 0 : n) + 1;
      localStorage.setItem(LS_FAIL_COUNT, String(n));
      if (n >= MAX_FAILS) {
        localStorage.setItem(LS_COOLDOWN, String(Date.now() + COOLDOWN_MS));
      }
      return n;
    } catch(e) { return 0; }
  }

  function resetFails() {
    try {
      localStorage.removeItem(LS_FAIL_COUNT);
      localStorage.removeItem(LS_COOLDOWN);
    } catch(e) {}
  }

  // ── Verify PIN ─────────────────────────────────────────────────
  async function verifyPin(pin) {
    if (isInCooldown()) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    var pinStr = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      return { ok: false, reason: 'invalid_format' };
    }
    var dbHash = await loadPinHash();
    if (!dbHash) {
      return { ok: false, reason: 'no_pin_set' };
    }
    var inputHash = await hashPin(pinStr);
    if (inputHash === dbHash) {
      resetFails();
      return { ok: true };
    }
    var fails = recordFail();
    if (fails >= MAX_FAILS) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    return { ok: false, reason: 'wrong', failsLeft: MAX_FAILS - fails };
  }

  // ── Phase 5: Verify a specific employee's PIN ────────────────
  // Used by the new per-employee lock modal. Each employee has their
  // own pin_hash in clinic_employees. This function verifies against
  // THAT employee's hash, not the clinic-wide one.
  // Returns same shape as verifyPin() for UI consistency.
  // Rate limiting is shared (same fail count regardless of which employee).
  async function verifyEmployeePin(employee, pin) {
    if (isInCooldown()) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    if (!employee || !employee.pin_hash) {
      return { ok: false, reason: 'no_pin_set' };
    }
    var pinStr = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      return { ok: false, reason: 'invalid_format' };
    }
    var inputHash = await hashPin(pinStr);
    if (inputHash === employee.pin_hash) {
      resetFails();
      return { ok: true };
    }
    var fails = recordFail();
    if (fails >= MAX_FAILS) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    return { ok: false, reason: 'wrong', failsLeft: MAX_FAILS - fails };
  }

  // ── Apply a role transition (after PIN check, if any) ─────────
  // Phase 5: now also accepts employeeId. If provided, stored in localStorage.
  // Backward compat: if employeeId is undefined, the old value is preserved
  // for backward compat (used by legacy callers like settings.html setup flow).
  // If null is explicitly passed, the employeeId is cleared.
  function applyRole(newRole, newDoctorId, newEmployeeId) {
    try {
      if (newRole === 'doctor') {
        localStorage.setItem(LS_ROLE, 'doctor');
        if (newDoctorId) localStorage.setItem(LS_DOCTOR_ID, newDoctorId);
        else             localStorage.removeItem(LS_DOCTOR_ID);
      } else if (newRole === 'secretary') {
        localStorage.setItem(LS_ROLE, 'secretary');
        localStorage.removeItem(LS_DOCTOR_ID);
      } else {
        // owner
        localStorage.setItem(LS_ROLE, 'owner');
        localStorage.removeItem(LS_DOCTOR_ID);
      }
      // Phase 5: employee identity (explicit: undefined=preserve, null=clear, value=set)
      if (newEmployeeId === null) {
        localStorage.removeItem(LS_EMPLOYEE_ID);
      } else if (typeof newEmployeeId === 'string' && newEmployeeId.length > 0) {
        localStorage.setItem(LS_EMPLOYEE_ID, newEmployeeId);
      }
    } catch(e) {
      console.error('[SyDentLock] applyRole failed:', e);
    }
  }

  // ── DOM guards: data-role-block / data-role-page / data-role-disable ──
  function applyRoleGuards() {
    var role = getRole();

    // Hide elements blocked for this role: data-role-block="secretary doctor"
    var hideEls = document.querySelectorAll('[data-role-block]');
    for (var i = 0; i < hideEls.length; i++) {
      var blocked = (hideEls[i].getAttribute('data-role-block') || '').split(/\s+/);
      if (blocked.indexOf(role) >= 0) {
        hideEls[i].style.display = 'none';
        hideEls[i].setAttribute('data-role-hidden', '1');
      } else if (hideEls[i].getAttribute('data-role-hidden') === '1') {
        hideEls[i].style.display = '';
        hideEls[i].removeAttribute('data-role-hidden');
      }
    }

    // Disable interaction: data-role-disable="secretary"
    var disableEls = document.querySelectorAll('[data-role-disable]');
    for (var j = 0; j < disableEls.length; j++) {
      var disabled = (disableEls[j].getAttribute('data-role-disable') || '').split(/\s+/);
      var shouldDisable = disabled.indexOf(role) >= 0;
      if (shouldDisable) {
        disableEls[j].setAttribute('disabled', 'disabled');
        disableEls[j].style.opacity = '0.55';
        disableEls[j].style.cursor = 'not-allowed';
      } else if (disableEls[j].hasAttribute('disabled') && disableEls[j].getAttribute('data-role-disabled-by-lock') === '1') {
        disableEls[j].removeAttribute('disabled');
        disableEls[j].style.opacity = '';
        disableEls[j].style.cursor = '';
        disableEls[j].removeAttribute('data-role-disabled-by-lock');
      }
      if (shouldDisable) disableEls[j].setAttribute('data-role-disabled-by-lock', '1');
    }

    // Phase 4.1: also re-apply inactive-doctor guards (re-renders pick them up)
    if (isDoctorAccountInactive()) {
      applyInactiveActionGuards();
    }
  }

  // ── Page guard: redirect if role is not allowed on this page ─────
  // Allowed roles passed as array, e.g. ['owner']
  function guardPage(allowedRoles) {
    var role = getRole();
    if (allowedRoles.indexOf(role) < 0) {
      showBlockedScreen(role);
      return false;
    }
    return true;
  }

  function showBlockedScreen(role) {
    try {
      window.__sydentBlocked = true;   // in-flight page loaders bail out
      document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg,#0a1628);padding:24px;font-family:\'Cairo\',sans-serif;text-align:center;direction:rtl;">' +
          '<div style="font-size:72px;margin-bottom:16px;">🔒</div>' +
          '<div style="font-size:22px;font-weight:800;color:var(--text,#e1f4ee);margin-bottom:10px;">لا تملك صلاحية</div>' +
          '<div style="font-size:14px;color:var(--text2,#8a9ab5);margin-bottom:28px;max-width:360px;line-height:1.7;">' +
            'الوضع الحالي (' + (ROLE_LABELS[role] || role) + ') لا يسمح بالوصول إلى هذه الصفحة.' +
          '</div>' +
          '<a href="index.html" style="padding:12px 24px;background:var(--green,var(--green));border-radius:10px;color:#0a1628;font-size:14px;font-weight:800;text-decoration:none;margin-bottom:10px;">' +
            '↩ العودة للصفحة الرئيسية' +
          '</a>' +
          '<button onclick="window.SyDentLock.openSwitchModal()" style="padding:10px 22px;background:transparent;border:1px solid var(--border2,rgba(255,255,255,0.18));border-radius:10px;color:var(--text2,#8a9ab5);font-family:\'Cairo\',sans-serif;font-size:13px;cursor:pointer;margin-top:8px;">' +
            '🔓 تبديل الوضع' +
          '</button>' +
        '</div>';
    } catch(e) {
      console.error('[SyDentLock] showBlockedScreen failed:', e);
    }
  }

  // ── Load doctors list (for Doctor role picker) ────────────────
  // Fetches ALL doctors (active + inactive). The active subset is used
  // for the role-switch picker; the full list is used for name recovery
  // when a device is locked to a doctor who was just deactivated.
  async function loadDoctors() {
    if (_doctorsListCache) return _doctorsListCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return [];
      var res = await window.sb.from('clinic_doctors')
        .select('id, name, is_active, is_owner')
        .eq('owner_id', user.id)
        .order('name');
      if (res.error) {
        console.warn('[SyDentLock] loadDoctors:', res.error);
        return [];
      }
      _allDoctorsListCache = res.data || [];
      _doctorsListCache = _allDoctorsListCache.filter(function(d){ return d.is_active !== false; });
      return _doctorsListCache;
    } catch(e) {
      return [];
    }
  }

  // ── Phase 5: Load employees list (for per-employee picker) ────
  // Fetches ALL employees (active + inactive). The active subset is used
  // for the lock modal picker; the full list is used for name recovery
  // and audit-log historical display.
  // Returns [] silently if Migration 9.1 is not applied yet (graceful fallback).
  // ────────────────────────────────────────────────────────────────────
  // Phase 7.4: Lock-mode picker only shows employees with system access.
  // Employees marked has_system_access=false are HR-only (payroll/reports
  // tracking) and never appear in the lock-mode role switcher.
  //
  // Migration 21 added the has_system_access column. Graceful fallback:
  // if Migration 21 hasn't run yet, fall back to loading all employees
  // (pre-7.4 behavior — anyone with a pin_hash was effectively a user).
  // ────────────────────────────────────────────────────────────────────
  async function loadEmployees() {
    if (_employeesListCache) return _employeesListCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return [];
      // Phase 7.4: filter on has_system_access=true so HR-only employees
      // don't pollute the role picker. Owners ALWAYS appear regardless of
      // the flag (defense-in-depth: prevents accidental lockout if an UPDATE
      // somehow flips an owner's access to false — Rule #16).
      var res = await window.sb.from('clinic_employees')
        .select('id, name, role, doctor_id, pin_hash, is_active, has_system_access')
        .eq('owner_id', user.id)
        .or('has_system_access.eq.true,role.eq.owner')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      // Pre-Migration-21 fallback: if has_system_access column doesn't
      // exist, retry without the filter (old behavior). 42703 = column
      // not found; PGRST205 = schema cache miss.
      if (res.error && /42703|has_system_access|PGRST/i.test((res.error.message || '') + ' ' + (res.error.code || ''))) {
        console.warn('[SyDentLock] has_system_access column missing — falling back to all-employees mode');
        res = await window.sb.from('clinic_employees')
          .select('id, name, role, doctor_id, pin_hash, is_active')
          .eq('owner_id', user.id)
          .order('role', { ascending: true })
          .order('name', { ascending: true });
      }
      if (res.error) {
        // Migration not applied yet — silently fall back to empty list
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        if (!/clinic_employees|42P01|PGRST205/i.test(m)) {
          console.warn('[SyDentLock] loadEmployees:', res.error);
        }
        return [];
      }
      _allEmployeesListCache = res.data || [];
      _employeesListCache = _allEmployeesListCache.filter(function(e){ return e.is_active !== false; });
      return _employeesListCache;
    } catch(e) {
      console.warn('[SyDentLock] loadEmployees exception:', e);
      return [];
    }
  }

  // Force reload of employees cache (after add/edit/delete in employees.html)
  function invalidateEmployeesCache() {
    _employeesListCache = null;
    _allEmployeesListCache = null;
  }

  // ── Phase X14.2: self-heal the owner's clinic_employees row ───
  // The role-switch picker, the per-employee PIN model, and the owner PIN UI
  // in employees.html (saveOwnerPin) all assume the owner has a
  // clinic_employees row with role='owner'. Clinics onboarded before that row
  // existed — or where it was never inserted — break in subtle ways: the owner
  // disappears from the switch modal, "saveOwnerPin" reports "owner account
  // not found", and a device can get stuck read-only. This idempotent helper
  // creates the row exactly once. It is safe: RLS allows owner_id=auth.uid(),
  // and a UNIQUE partial index (uq_clinic_employees_one_owner) guarantees at
  // most one owner row — concurrent inserts collide on 23505 and are ignored.
  // Callers should `await loadDoctors()` first so getOwnerPersonName() can
  // resolve the owner's name from clinic_doctors.is_owner.
  var _ownerRowEnsured = false;
  async function ensureOwnerEmployee() {
    if (_ownerRowEnsured) return;
    try {
      var user = await window.sbGetUser();
      if (!user) return;

      // Already present? Query directly (caches may be empty this early).
      var existing = await window.sb.from('clinic_employees')
        .select('id')
        .eq('owner_id', user.id)
        .eq('role', 'owner')
        .limit(1);
      if (existing.error) {
        // Table missing (pre-Migration-9.1) → nothing to heal; bail quietly.
        return;
      }
      if (existing.data && existing.data.length > 0) {
        _ownerRowEnsured = true;
        return;
      }

      // Resolve the owner's display name: clinic_doctors.is_owner (warm cache
      // from the caller's loadDoctors()), then auth metadata, then a default.
      var ownerNm = getOwnerPersonName();
      if (!ownerNm) {
        var md = (user.user_metadata || {});
        ownerNm = md.full_name || md.name || md.clinic_name || ROLE_LABELS.owner;
      }

      // Preserve any existing clinic-level lock PIN as the owner's pin_hash so
      // an already-configured lock keeps working once the row exists.
      var existingPin = await loadPinHash();

      var row = {
        owner_id: user.id,
        name: ownerNm,
        role: 'owner',
        pin_hash: existingPin || null,
        is_active: true,
        has_system_access: true
      };
      var ins = await window.sb.from('clinic_employees').insert(row).select('id').single();
      if (ins.error) {
        var m = (ins.error.message || '') + ' ' + (ins.error.code || '');
        // has_system_access missing (pre-Migration-21) → retry without it.
        if (/42703/.test(m)) {
          delete row.has_system_access;
          ins = await window.sb.from('clinic_employees').insert(row).select('id').single();
        }
      }
      if (ins.error) {
        var m2 = (ins.error.message || '') + ' ' + (ins.error.code || '');
        // 23505 = unique violation: another tab/device created it first → fine.
        if (!/23505/.test(m2)) {
          console.warn('[SyDentLock] ensureOwnerEmployee insert:', ins.error);
          return;
        }
      }
      _ownerRowEnsured = true;
      invalidateEmployeesCache();
    } catch (e) {
      console.warn('[SyDentLock] ensureOwnerEmployee exception:', e);
    }
  }

  // Get current employee object (or null if not set / migration not applied)
  // This is the snapshot used for audit logging.
  async function getCurrentEmployee() {
    var eid = getEmployeeId();
    if (!eid) return null;
    var list = await loadEmployees();
    return (list || []).find(function(e){ return e.id === eid; })
        || (_allEmployeesListCache || []).find(function(e){ return e.id === eid; })
        || null;
  }

  // ── CSS injection (once per page) ─────────────────────────────
  function injectCSS() {
    if (document.getElementById('sydent-lock-css')) return;
    var style = document.createElement('style');
    style.id = 'sydent-lock-css';
    style.textContent =
      '.sd-lock-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:transform .15s,filter .15s;border:1.5px solid transparent;background:transparent;white-space:nowrap;}' +
      '.sd-lock-btn:hover{transform:translateY(-1px);filter:brightness(1.1);}' +
      '.sd-lock-btn.sd-owner{background:rgba(var(--green-rgb),0.14);border-color:rgba(var(--green-rgb),0.40);color:var(--green,var(--green));}' +
      '.sd-lock-btn.sd-doctor{background:var(--blue-bg);border-color:var(--blue-bd);color:var(--blue-fg,#1d4ed8);}' +
      '.sd-lock-btn.sd-secretary{background:var(--orange-bg);border-color:var(--orange-bd);color:var(--orange-ink,#9a3412);}' +
      '.sd-lock-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;direction:rtl;font-family:\'Cairo\',sans-serif;}' +
      '.sd-lock-modal{background:var(--bg2,#0f2038);border:1.5px solid var(--border2,rgba(var(--green-rgb),0.25));border-radius:14px;padding:24px;max-width:440px;width:100%;color:var(--text,#e1f4ee);max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-modal,0 20px 60px rgba(0,0,0,0.4));}' +
      '.sd-lock-modal h3{margin:0 0 6px;font-size:18px;font-weight:800;color:var(--green,var(--green));}' +
      '.sd-lock-modal .sd-cur{font-size:13px;color:var(--text2,#8a9ab5);margin-bottom:16px;padding:10px 12px;background:var(--green-dim,rgba(var(--green-rgb),0.06));border-radius:8px;}' +
      '.sd-lock-modal .sd-opt{display:block;padding:12px 14px;margin-bottom:8px;background:var(--bg3,#132840);border:1.5px solid transparent;border-radius:10px;cursor:pointer;transition:all .15s;' +
        // Defense vs global label rules (patients.html: label{font-size:13px;
        // font-weight:600;color:var(--text2)}, appointments.html: label{
        // font-size:12px;font-weight:700;color:var(--text2)}). Since .sd-opt
        // IS a <label>, those global rules apply and dim the text + shrink it.
        // Force the modal's own typography explicitly.
        'color:var(--text,#e1f4ee);font-size:14px;font-weight:600;line-height:1.5;}' +
      '.sd-lock-modal .sd-opt:hover{border-color:rgba(var(--green-rgb),0.30);background:rgba(var(--green-rgb),0.05);}' +
      '.sd-lock-modal .sd-opt input[type=radio]{margin-left:8px;accent-color:var(--green,var(--green));' +
        // Defense vs global input resets (patients.html / appointments.html
        // define `input, select, textarea { width:100%; appearance:none }`
        // which would otherwise hide the radio circle AND stretch it to
        // 100% width, breaking the layout). Force native radio rendering.
        'width:auto !important;-webkit-appearance:radio !important;' +
        '-moz-appearance:radio !important;appearance:radio !important;' +
        'background:transparent !important;border:none !important;' +
        'padding:0 !important;height:auto !important;vertical-align:middle;' +
        'flex-shrink:0;}' +
      '.sd-lock-modal .sd-opt.sd-active{border-color:rgba(var(--green-rgb),0.55);background:rgba(var(--green-rgb),0.08);}' +
      '.sd-lock-modal .sd-sub{padding:8px 12px 8px 28px;margin-top:6px;display:none;}' +
      '.sd-lock-modal .sd-opt.sd-active .sd-sub{display:block;}' +
      '.sd-lock-modal select{width:100%;padding:9px 10px;background:var(--bg,#0a1628);border:1px solid rgba(var(--green-rgb),0.20);border-radius:8px;color:var(--text,#e1f4ee);font-family:\'Cairo\',sans-serif;font-size:13px;}' +
      '.sd-lock-modal .sd-pin-row{margin-top:14px;padding:12px;background:var(--blue-soft);border:1px solid var(--blue-bd);border-radius:10px;}' +
      '.sd-lock-modal .sd-pin-row label{display:block;font-size:12px;color:var(--text2,#8a9ab5);margin-bottom:6px;font-weight:700;}' +
      '.sd-lock-modal .sd-pin-row input{width:100%;padding:10px 12px;background:var(--bg,#0a1628);border:1.5px solid var(--blue-bd);border-radius:8px;color:var(--text,#e1f4ee);font-family:\'Cairo\',sans-serif;font-size:18px;font-weight:800;text-align:center;letter-spacing:8px;-webkit-appearance:none;appearance:none;}' +
      '.sd-lock-modal .sd-msg{font-size:12px;color:var(--red,#ef5350);margin-top:8px;min-height:18px;font-weight:700;}' +
      '.sd-lock-modal .sd-msg.sd-ok{color:var(--green,var(--green));}' +
      '.sd-lock-modal .sd-actions{display:flex;gap:10px;margin-top:18px;}' +
      '.sd-lock-modal .sd-btn{flex:1;padding:11px 14px;border-radius:10px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;cursor:pointer;border:1.5px solid transparent;}' +
      '.sd-lock-modal .sd-btn-cancel{background:transparent;border-color:var(--border2,rgba(255,255,255,0.18));color:var(--text2,#8a9ab5);}' +
      '.sd-lock-modal .sd-btn-cancel:hover{background:var(--bg3,rgba(255,255,255,0.06));}' +
      '.sd-lock-modal .sd-btn-primary{background:var(--green,var(--green));color:#0a1628;}' +
      '.sd-lock-modal .sd-btn-primary:hover{filter:brightness(1.08);}' +
      '.sd-lock-modal .sd-btn-primary:disabled{opacity:0.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  // ── Inject header lock button into topbar (or fallback container) ──
  function injectHeaderButton() {
    // Phase X10.1: defense-in-depth. The role pill ("المالك 👑"/"الطبيب"/
    // "السكرتيرة") must NEVER render on public pages. Even if a stale
    // cached supabase-init.js bypasses the autoInit() skip, or someone
    // calls window.SyDentLock.injectHeaderButton() directly, this guard
    // stops the leak at the source.
    if (isPublicPage()) return;
    if (document.getElementById('sdLockBtn')) return; // already injected
    injectCSS();
    var role = getRole();
    var btn = document.createElement('button');
    btn.id = 'sdLockBtn';
    btn.className = 'sd-lock-btn sd-' + role;
    btn.type = 'button';
    btn.title = 'تبديل الوضع';
    btn.onclick = function(){ openSwitchModal(); };
    refreshHeaderButton(btn);

    // Insertion strategy: topbar → header-actions → header → body
    var anchor = document.querySelector('.topbar') ||
                 document.querySelector('.header-actions') ||
                 document.querySelector('.header') ||
                 document.querySelector('header');
    if (anchor) {
      anchor.appendChild(btn);
    } else {
      // floating fallback
      btn.style.position = 'fixed';
      btn.style.top = '12px';
      btn.style.left = '12px';
      btn.style.zIndex = '300';
      document.body.appendChild(btn);
    }
  }

  function refreshHeaderButton(btn) {
    btn = btn || document.getElementById('sdLockBtn');
    /* DeepCode #5 (v556): الاسمُ يُحسب حتى بلا زرّ رأس — تذييلُ القائمة الجانبية يحتاجه (انظر آخر الدالة). */
    if (!btn && !document.getElementById('sbDoctorName')) return;
    var role = getRole();
    var inactive = false;
    if (btn) btn.className = 'sd-lock-btn sd-' + role;
    var label = ROLE_LABELS[role] || role;
    var icon  = ROLE_ICONS[role]  || '🔒';

    // Phase 5: if we have a specific employee identity locked in, prefer that name
    var empId = getEmployeeId();
    var ownerMode = isOwner();

    if (ownerMode) {
      // ── Phase 7.6 Fix: Owner pill never enters Phase 5 employee lookup ──
      // The owner's identity comes from doctors (is_owner=true), NOT from
      // clinic_employees. Even if LS_EMPLOYEE_ID is set on this device (from
      // a pre-Phase-5 setup or stale state), we must NEVER label the owner
      // as "(محذوف)" because the owner has no clinic_employees row by design.
      //
      // Resolution order for the owner's display name:
      //   1. getOwnerPersonName() → real person name (employees role=owner,
      //      else doctors is_owner=true). Works even when LS_DOCTOR_ID is
      //      unset on a default device — this is the primary path now.
      //   2. _doctorsListCache lookup by LS_DOCTOR_ID → "د. {name}" (legacy)
      //   3. _allDoctorsListCache fallback (inactive owner doctor row)
      //   4. Default ROLE_LABELS.owner ("المالك") — NEVER "(محذوف)"
      var ownerName = getOwnerPersonName();
      if (ownerName) {
        label = ownerName; // name used as-is (already carries "د" title if doctor)
      } else if (_doctorsListCache) {
        var ownerDid = getDoctorId();
        var ownerDoc = ownerDid
          ? _doctorsListCache.find(function(x){ return x.id === ownerDid; })
          : null;
        if (ownerDoc && ownerDoc.name) {
          label = 'د. ' + ownerDoc.name;
        } else if (ownerDid && _allDoctorsListCache) {
          var ownerAny = _allDoctorsListCache.find(function(x){ return x.id === ownerDid; });
          if (ownerAny && ownerAny.name) label = 'د. ' + ownerAny.name;
        }
      }
      // icon stays as ROLE_ICONS.owner (👑), inactive stays false
    } else if (empId && _employeesListCache) {
      var emp = (_employeesListCache || []).find(function(e){ return e.id === empId; });
      if (emp && emp.name) {
        // Active employee → show their name + role icon.
        // The pill only turns red when the EMPLOYEE row is deactivated
        // (toggled from employees.html).
        label = emp.name;
        icon = ROLE_ICONS[emp.role] || icon;
      } else if (_allEmployeesListCache) {
        // Employee might be deactivated OR fully deleted → name recovery
        var empAny = (_allEmployeesListCache || []).find(function(e){ return e.id === empId; });
        if (empAny && empAny.name) {
          // Deactivated but row still exists → show name with (معطّل)
          label = empAny.name + ' (معطّل)';
          icon = ROLE_ICONS[empAny.role] || icon;
          inactive = true;
        } else {
          // Fully deleted by owner from another device → name unrecoverable
          label = (ROLE_LABELS[role] || 'موظف') + ' (محذوف)';
          inactive = true;
        }
      }
    } else if (role === 'doctor' && _doctorsListCache) {
      // Legacy fallback: device locked to a doctor but no employee_id yet
      var did = getDoctorId();
      var d = (_doctorsListCache || []).find(function(x){ return x.id === did; });
      if (d && d.name) {
        label = 'د. ' + d.name;
      } else if (did) {
        // Doctor account is inactive — try to recover the name from
        // _allDoctorsListCache (loaded by loadAllDoctors), else show generic.
        var dAny = (_allDoctorsListCache || []).find(function(x){ return x.id === did; });
        if (dAny && dAny.name) label = 'د. ' + dAny.name + ' (معطّل)';
        else label = ROLE_LABELS.doctor + ' (معطّل)';
        inactive = true;
      }
    }
    /* DeepCode #5 (v556): تذييلُ القائمة الجانبية كان يُبقي اسمَ المالك (حسابُ الدخول) بعد التبديل لطبيب/سكرتيرة —
       الآن يتبع الشخصَ الفعّال على الجهاز: الاسمُ نفسُه المحسوب للزرّ أعلاه + دوره. المالكُ يبقى كما ترسمه القائمة.
       عُقدٌ نصّية لا innerHTML — الاسمُ من بيانات المستخدم. */
    var foot = document.getElementById('sbDoctorName');
    if (foot && !ownerMode) {
      foot.textContent = '';
      foot.appendChild(document.createTextNode(label));
      foot.appendChild(document.createElement('br'));
      foot.appendChild(document.createTextNode(ROLE_LABELS[role] || ''));
      foot.setAttribute('data-sy-person', role);
    }
    if (!btn) return;
    if (inactive) {
      // Red accent overlay for inactive doctor/employee
      btn.style.borderColor = 'var(--red-bd)';   // v377: unified tokens
      btn.style.background = 'var(--red-bg)';
      btn.style.color = 'var(--red-ink)';
    } else {
      btn.style.borderColor = '';
      btn.style.background = '';
      btn.style.color = '';
    }
    // Escape label to prevent XSS via doctor/employee names (defense per قاعدة #14)
    btn.innerHTML = '<span>' + escapeHtmlLock(icon) + '</span><span>' + escapeHtmlLock(label) + '</span>';
  }

  // ── A11y enhancer for the lock modal ──────────────────────────
  // Phase 6 M — Observation N: Focus trap + Escape + restore focus.
  // Applies the four missing a11y bits to the lock modal overlay:
  //   1. aria-modal="true" on the inner dialog
  //   2. Focus trap — Tab/Shift+Tab cycle within the modal only
  //   3. Restore focus to the element that opened the modal on close
  //   4. Auto-focus the first interactive element if no input is shown yet
  //
  // Returns a `cleanup` function the caller must invoke when removing the
  // modal so we clear the keydown listener and restore focus.
  //
  // The caller already wires Escape close + outside-click close — this
  // helper does NOT duplicate those; it only adds keyboard navigation.
  function _a11yEnhanceModal(ov) {
    var dialog = ov.querySelector('.sd-lock-modal');
    if (dialog) dialog.setAttribute('aria-modal', 'true');

    // Capture the element that had focus before the modal opened so we
    // can restore it on close (proper a11y pattern).
    var prevFocus = document.activeElement;

    // Build a fresh list of focusable elements on each Tab keydown.
    // (Building dynamically handles the case where #sdPinRow toggles
    //  visibility based on radio selection — its input enters/exits the
    //  tab cycle live.)
    function getFocusable() {
      var sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      var nodes = ov.querySelectorAll(sel);
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        // Skip hidden elements (display:none / parent hidden / radio in hidden row)
        if (el.offsetParent === null && el.tagName !== 'INPUT') continue;
        if (el.disabled) continue;
        out.push(el);
      }
      return out;
    }

    function trapHandler(e) {
      if (e.key !== 'Tab' && e.keyCode !== 9) return;
      var list = getFocusable();
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0];
      var last = list[list.length - 1];
      var active = document.activeElement;
      // If focus is outside the modal entirely, pull it back in.
      if (!ov.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey) {
        if (active === first) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', trapHandler);

    // Cleanup: remove listener + restore focus to opener.
    // Caller invokes this in their existing closeModal().
    return function cleanup() {
      document.removeEventListener('keydown', trapHandler);
      try {
        if (prevFocus && typeof prevFocus.focus === 'function' && document.body.contains(prevFocus)) {
          prevFocus.focus();
        }
      } catch (e) { /* ignore */ }
    };
  }

  // ── Switch modal ──────────────────────────────────────────────
  // Phase 5: employee-aware modal. Lists each employee by NAME (not role),
  // and verifies that employee's own pin_hash. Falls back to legacy
  // role-picker if no employees are present (Migration 9.1 not run).
  async function openSwitchModal() {
    injectCSS();
    var employees = await loadEmployees();

    // If no employees → legacy modal (backward compat for fresh installs
    // pre-Phase 5 migration). This path uses the old role-picker UI.
    if (!employees || employees.length === 0) {
      return openSwitchModalLegacy();
    }

    var curRole = getRole();
    var curDoctorId = getDoctorId();
    var curEmployeeId = getEmployeeId();
    var hasPinSet = !!(await loadPinHash());

    // Remove any existing modal
    var ex = document.getElementById('sdLockModal');
    if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = 'sdLockModal';
    /* v454: النافذتان المشتركتان (قفلُ الموظف/الوضع) على عُدّة SyDent — الفئةُ
       القديمة تبقى لقواعد محتواها، و`sy-m open` تمنح الإطارَ والسلوك. */
    ov.className = 'sd-lock-modal-overlay modal-overlay sy-m open';

    // Sort: owner first, then doctors, then secretaries; alpha within group
    var sorted = employees.slice().sort(function(a, b){
      var rank = { owner: 1, doctor: 2, secretary: 3 };
      var ra = rank[a.role] || 99, rb = rank[b.role] || 99;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), 'ar');
    });

    // Determine which one is currently active in the device.
    // Priority:
    //   1. exact employee_id match (Phase 5 mode)
    //   2. backward compat for legacy devices (no employee_id):
    //      - role=doctor → match by doctor_id
    //      - role=owner → match the one owner record (UNIQUE constraint guarantees)
    //      - role=secretary → ambiguous (multiple secretaries possible); resolve to
    //        FIRST secretary in alpha order to avoid double-selection in UI
    var _legacySecretaryClaimedId = null;
    function isCurrent(emp) {
      if (curEmployeeId && emp.id === curEmployeeId) return true;
      if (curEmployeeId) return false; // employee_id set but doesn't match
      // Backward compat: no employee_id yet
      if (emp.role !== curRole) return false;
      if (emp.role === 'doctor') return emp.doctor_id === curDoctorId;
      if (emp.role === 'owner') return true; // single owner per clinic (UNIQUE)
      // secretary: claim only the first one encountered (sorted alpha)
      if (emp.role === 'secretary') {
        if (_legacySecretaryClaimedId === null) {
          _legacySecretaryClaimedId = emp.id;
          return true;
        }
        return emp.id === _legacySecretaryClaimedId;
      }
      return false;
    }

    var optionsHtml = '';
    sorted.forEach(function(emp){
      var current = isCurrent(emp);
      var icon = ROLE_ICONS[emp.role] || '👤';
      var roleLabel = ROLE_LABELS[emp.role] || emp.role;
      var hasPinForThisEmployee = !!emp.pin_hash;
      var pinWarn = (!hasPinForThisEmployee)
        ? '<span style="color:var(--yellow,#f5c842);font-size:11px;margin-right:6px;">⚠ بدون PIN</span>'
        : '';
      // Owner row: the 👑 crown already signals ownership — omit the
      // "المالك" word badge entirely. Doctors/secretaries keep their badge.
      var roleBadge = (emp.role === 'owner')
        ? ''
        : '<span style="color:var(--text2,#8a9ab5);font-size:11px;margin-right:8px;">' + escapeHtmlLock(roleLabel) + '</span>';
      optionsHtml +=
        '<label class="sd-opt' + (current ? ' sd-active' : '') + '" data-employee-id="' + escapeHtmlLock(emp.id) + '">' +
          '<input type="radio" name="sdEmpSel" value="' + escapeHtmlLock(emp.id) + '"' + (current ? ' checked' : '') + '>' +
          '<span style="font-weight:800;">' + icon + ' ' + escapeHtmlLock(emp.name) + '</span>' +
          roleBadge +
          pinWarn +
        '</label>';
    });

    // Current employee display.
    // Owner → show the real name WITHOUT the "(المالك)" suffix (crown only).
    // Other roles keep "name (role)". If no current employee row resolved,
    // fall back to the owner's real name (getOwnerPersonName) before the
    // static role word.
    var curEmp = sorted.find(isCurrent);
    var curDisplay;
    if (curEmp) {
      curDisplay = (curEmp.role === 'owner')
        ? ((ROLE_ICONS[curEmp.role] || '') + ' ' + curEmp.name)
        : ((ROLE_ICONS[curEmp.role] || '') + ' ' + curEmp.name + ' (' + (ROLE_LABELS[curEmp.role] || curEmp.role) + ')');
    } else if (curRole === 'owner') {
      var curOwnerName = getOwnerPersonName();
      curDisplay = (ROLE_ICONS.owner || '') + ' ' + (curOwnerName || ROLE_LABELS.owner);
    } else {
      curDisplay = (ROLE_ICONS[curRole] || '') + ' ' + (ROLE_LABELS[curRole] || curRole);
    }

    ov.innerHTML =
      '<div class="sd-lock-modal modal-box">' +
        '<div class="modal-head"><h3 id="sdModalTitle">🔓 تبديل الموظف</h3>' +
          '<button type="button" class="modal-close" id="sdBtnX" aria-label="إغلاق">✕</button></div>' +
        '<div class="modal-body">' +
        '<div class="sd-cur">الموظف الحالي: ' + escapeHtmlLock(curDisplay) + '</div>' +
        optionsHtml +
        '<div class="sd-pin-row" id="sdPinRow" style="display:none;">' +
          '<label>أدخل رقم سرّ الموظف:</label>' +
          '<input type="password" inputmode="numeric" maxlength="6" id="sdPinInput" autocomplete="off">' +
          '<div class="sd-msg" id="sdPinMsg"></div>' +
        '</div>' +
        '<div class="sd-msg" id="sdMsg" style="margin-top:4px;"></div>' +
        '</div>' +
        '<div class="sd-actions modal-foot">' +
          '<button type="button" class="sd-btn sd-btn-cancel" id="sdBtnCancel">إلغاء</button>' +
          '<button type="button" class="sd-btn sd-btn-primary" id="sdBtnConfirm">تبديل</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    // Phase 6 M — Observation N: a11y enhancement (focus trap + restore)
    var _a11yCleanup = _a11yEnhanceModal(ov);

    // ── Event wiring ──
    var radios = ov.querySelectorAll('input[name="sdEmpSel"]');

    function getSelectedEmployee() {
      var checked = ov.querySelector('input[name="sdEmpSel"]:checked');
      if (!checked) return null;
      return sorted.find(function(e){ return e.id === checked.value; }) || null;
    }

    function updateActive() {
      ov.querySelectorAll('.sd-opt').forEach(function(opt){
        var checked = opt.querySelector('input').checked;
        opt.classList.toggle('sd-active', checked);
      });

      var target = getSelectedEmployee();
      var pinRow = ov.querySelector('#sdPinRow');
      var msg = ov.querySelector('#sdMsg');
      var confirmBtn = ov.querySelector('#sdBtnConfirm');

      if (!target) {
        pinRow.style.display = 'none';
        return;
      }

      // Determine if PIN is needed using employee-level hierarchy:
      // - Selecting the SAME employee = no-op = no PIN
      // - Owner role (current) → ANY other = downgrade = no PIN (owner supreme)
      // - Switching INTO owner = needs the OWNER's own PIN, but only if the
      //   owner has set one. Owner mode with no PIN is unprotected; requiring a
      //   non-existent PIN would permanently lock every device out of owner
      //   mode (the stuck-device bug when staff have PINs but the owner doesn't).
      // - Any other target → PIN required (the TARGET employee's PIN)
      // - If lock not configured (no PINs anywhere) → free
      var sameEmp = isCurrent(target);
      var lockConfigured = hasPinSet || employees.some(function(e){ return !!e.pin_hash; });

      var needPin;
      if (sameEmp) {
        needPin = false;
      } else if (!lockConfigured) {
        needPin = false; // no PINs set anywhere yet
      } else if (curRole === 'owner') {
        needPin = false; // owner can switch freely (downgrade)
      } else if (target.role === 'owner') {
        needPin = !!target.pin_hash; // owner switch-in: only if owner set a PIN
      } else {
        needPin = true;
      }

      // Edge case: a NON-owner target with no pin_hash can't be verified.
      // (Owner targets never reach here with needPin=true unless they HAVE a
      // pin_hash, per the branch above — so the owner is never falsely blocked.)
      if (needPin && !target.pin_hash) {
        msg.textContent = '⚠ هذا الموظف لم يضبط رقم سر بعد. اطلب من المالك إعداده.';
        msg.className = 'sd-msg';
        pinRow.style.display = 'none';
        confirmBtn.disabled = true;
        return;
      }

      pinRow.style.display = needPin ? 'block' : 'none';

      if (isInCooldown()) {
        msg.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
        msg.className = 'sd-msg';
        confirmBtn.disabled = true;
      } else if (!lockConfigured) {
        msg.textContent = 'ℹ️ القفل غير مفعّل. يمكن التبديل بحرية. لتفعيل القفل، عيّن رقم سر من صفحة الموظفين.';
        msg.className = 'sd-msg sd-ok';
        confirmBtn.disabled = false;
      } else {
        msg.textContent = '';
        confirmBtn.disabled = false;
      }
    }

    radios.forEach(function(r){ r.addEventListener('change', updateActive); });

    // Click row → select radio
    ov.querySelectorAll('.sd-opt').forEach(function(opt){
      opt.addEventListener('click', function(e){
        if (e.target.tagName === 'INPUT') return;
        var input = opt.querySelector('input[type=radio]');
        input.checked = true;
        updateActive();
      });
    });

    /* v454: Escape صار من عُدّة النوافذ (تنقر ✕ نفسه فيمرّ بالتنظيف)، فحُذف
       المعالجُ المحليُّ كي لا تُغلق طبقتان بضغطةٍ واحدة. */
    function closeModal() {
      if (typeof _a11yCleanup === 'function') _a11yCleanup();
      ov.remove();
      if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
    }

    ov.querySelector('#sdBtnCancel').addEventListener('click', closeModal);
    var _x = ov.querySelector('#sdBtnX'); if (_x) _x.addEventListener('click', closeModal);
    /* v454: النقرُ الخارجي كان يغلقها ورقمُ السرّ مكتوبٌ فيها — أُزيل. */
    if (window.SyModal) window.SyModal.scan();

    var _switchInFlight = false;
    ov.querySelector('#sdBtnConfirm').addEventListener('click', async function(){
      if (_switchInFlight) return;
      _switchInFlight = true;
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      confirmBtn.disabled = true;
      try {
        var target = getSelectedEmployee();
        if (!target) {
          ov.querySelector('#sdMsg').textContent = 'اختر موظفاً أولاً.';
          return;
        }

        // No-op? Just close.
        if (isCurrent(target)) {
          closeModal();
          return;
        }

        // PIN logic same as updateActive
        var lockConfigured = hasPinSet || employees.some(function(e){ return !!e.pin_hash; });
        var needPin = false;
        if (!lockConfigured) {
          needPin = false;
        } else if (curRole === 'owner') {
          needPin = false;
        } else if (target.role === 'owner') {
          needPin = !!target.pin_hash; // owner switch-in: only if owner set a PIN
        } else {
          needPin = true;
        }

        if (needPin) {
          if (!target.pin_hash) {
            ov.querySelector('#sdMsg').textContent = '⚠ هذا الموظف لم يضبط رقم سر بعد.';
            return;
          }
          var pin = (ov.querySelector('#sdPinInput').value || '').trim();
          var ver = await verifyEmployeePin(target, pin);
          if (!ver.ok) {
            var pm = ov.querySelector('#sdPinMsg');
            if (ver.reason === 'cooldown') {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + ver.secondsLeft + ' ثانية.';
            } else if (ver.reason === 'no_pin_set') {
              pm.textContent = '⚠ لم يتم تعيين رقم سر لهذا الموظف.';
            } else if (ver.reason === 'invalid_format') {
              pm.textContent = 'رقم السر يجب أن يكون 4-6 أرقام.';
            } else if (ver.reason === 'wrong') {
              pm.textContent = '❌ رقم سر خاطئ. متبقّي ' + (ver.failsLeft || 0) + ' محاولات.';
            }
            return;
          }
        }

        // Apply: role + doctor_id derived from the employee
        var newDoctorId = (target.role === 'doctor') ? (target.doctor_id || null) : null;
        applyRole(target.role, newDoctorId, target.id);

        // Log to audit before reload (best effort, fire-and-forget)
        try {
          await logAudit('lock.role_switch', {
            entityId: target.id,
            description: 'تبديل إلى الموظف: ' + target.name + ' (' + (ROLE_LABELS[target.role] || target.role) + ')',
            oldValue: { role: curRole, doctor_id: curDoctorId, employee_id: curEmployeeId },
            newValue: { role: target.role, doctor_id: newDoctorId, employee_id: target.id }
          });
        } catch (e) { /* ignore */ }

        closeModal();
        window.location.reload();
      } finally {
        _switchInFlight = false;
        if (confirmBtn && document.body.contains(confirmBtn)) confirmBtn.disabled = false;
      }
    });

    updateActive();
    setTimeout(function(){
      var pi = ov.querySelector('#sdPinInput');
      if (pi && pi.offsetParent) { pi.focus(); return; }
      // Phase 6 M (Obs N): if PIN row is hidden, focus the first interactive
      // element (the active radio, or the Confirm button) so keyboard users
      // have a clear entry point.
      var checked = ov.querySelector('input[name="sdEmpSel"]:checked');
      if (checked && checked.offsetParent !== null) { checked.focus(); return; }
      var confirm = ov.querySelector('#sdBtnConfirm');
      if (confirm) confirm.focus();
    }, 80);
  }

  // ── Legacy modal (pre-Phase 5 fallback) ──
  // Used only when clinic_employees is empty (Migration 9.1 not run).
  // Same behavior as the original Phase 4 modal: 3 role radios + PIN.
  async function openSwitchModalLegacy() {
    injectCSS();
    var doctors = await loadDoctors();
    var curRole = getRole();
    var curDoctorId = getDoctorId();
    var hasPinSet = !!(await loadPinHash());

    // Remove any existing modal
    var ex = document.getElementById('sdLockModal');
    if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = 'sdLockModal';
    /* v454: النافذتان المشتركتان (قفلُ الموظف/الوضع) على عُدّة SyDent — الفئةُ
       القديمة تبقى لقواعد محتواها، و`sy-m open` تمنح الإطارَ والسلوك. */
    ov.className = 'sd-lock-modal-overlay modal-overlay sy-m open';

    var doctorOptions = '';
    doctors.forEach(function(d){
      var sel = (d.id === curDoctorId) ? ' selected' : '';
      doctorOptions += '<option value="'+d.id+'"'+sel+'>'+escapeHtmlLock(d.name)+'</option>';
    });

    var doctorBlock = doctors.length > 0
      ? '<select id="sdDoctorSel">' + doctorOptions + '</select>'
      : '<div style="color:var(--red,#ef5350);font-size:12px;">لا يوجد أطباء — أضف طبيباً من صفحة الأطباء أولاً.</div>';

    ov.innerHTML =
      '<div class="sd-lock-modal modal-box">' +
        '<div class="modal-head"><h3 id="sdLegacyTitle">🔓 تبديل الوضع</h3>' +
          '<button type="button" class="modal-close" id="sdBtnX" aria-label="إغلاق">✕</button></div>' +
        '<div class="modal-body">' +
        '<div class="sd-cur">الوضع الحالي: ' + (ROLE_ICONS[curRole]||'') + ' ' + (ROLE_LABELS[curRole]||curRole) + '</div>' +
        '<label class="sd-opt' + (curRole==='owner'?' sd-active':'') + '" data-role="owner">' +
          '<input type="radio" name="sdRoleSel" value="owner"' + (curRole==='owner'?' checked':'') + '> 👑 المالك' +
        '</label>' +
        '<label class="sd-opt' + (curRole==='doctor'?' sd-active':'') + '" data-role="doctor">' +
          '<input type="radio" name="sdRoleSel" value="doctor"' + (curRole==='doctor'?' checked':'') + '> 👨‍⚕️ طبيب' +
          '<div class="sd-sub">' + doctorBlock + '</div>' +
        '</label>' +
        '<label class="sd-opt' + (curRole==='secretary'?' sd-active':'') + '" data-role="secretary">' +
          '<input type="radio" name="sdRoleSel" value="secretary"' + (curRole==='secretary'?' checked':'') + '> 👩‍💼 السكرتيرة' +
        '</label>' +
        '<div class="sd-pin-row" id="sdPinRow" style="display:none;">' +
          '<label>أدخل PIN للتأكيد:</label>' +
          '<input type="password" inputmode="numeric" maxlength="6" id="sdPinInput" autocomplete="off">' +
          '<div class="sd-msg" id="sdPinMsg"></div>' +
        '</div>' +
        '<div class="sd-msg" id="sdMsg" style="margin-top:4px;"></div>' +
        '</div>' +
        '<div class="sd-actions modal-foot">' +
          '<button type="button" class="sd-btn sd-btn-cancel" id="sdBtnCancel">إلغاء</button>' +
          '<button type="button" class="sd-btn sd-btn-primary" id="sdBtnConfirm">تبديل</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    // Phase 6 M — Observation N: a11y enhancement (focus trap + restore)
    var _a11yCleanup = _a11yEnhanceModal(ov);

    // ── Event wiring ──
    var radios = ov.querySelectorAll('input[name="sdRoleSel"]');
    function updateActive() {
      ov.querySelectorAll('.sd-opt').forEach(function(opt){
        var checked = opt.querySelector('input').checked;
        opt.classList.toggle('sd-active', checked);
      });
      var targetRole = ov.querySelector('input[name="sdRoleSel"]:checked').value;
      var targetDocId = (targetRole === 'doctor') ? ov.querySelector('#sdDoctorSel') && ov.querySelector('#sdDoctorSel').value : null;
      var need = requirePin(targetRole, targetDocId);
      var pinRow = ov.querySelector('#sdPinRow');
      pinRow.style.display = need ? 'block' : 'none';

      var msg = ov.querySelector('#sdMsg');
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      if (isInCooldown()) {
        msg.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
        msg.className = 'sd-msg';
        confirmBtn.disabled = true;
      } else if (!hasPinSet) {
        msg.textContent = 'ℹ️ القفل غير مفعّل (لا يوجد PIN). يمكن التبديل بحرية. لتفعيل القفل، عيّن PIN من الإعدادات.';
        msg.className = 'sd-msg sd-ok';
        confirmBtn.disabled = false;
      } else {
        msg.textContent = '';
        confirmBtn.disabled = false;
      }
    }
    radios.forEach(function(r){ r.addEventListener('change', updateActive); });
    var docSel = ov.querySelector('#sdDoctorSel');
    if (docSel) docSel.addEventListener('change', updateActive);

    ov.querySelectorAll('.sd-opt').forEach(function(opt){
      opt.addEventListener('click', function(e){
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        var input = opt.querySelector('input[type=radio]');
        input.checked = true;
        updateActive();
      });
    });

    /* v454: Escape من عُدّة النوافذ (تنقر ✕ نفسه فيمرّ بالتنظيف). */
    function closeModal() {
      if (typeof _a11yCleanup === 'function') _a11yCleanup();
      ov.remove();
      if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
    }

    ov.querySelector('#sdBtnCancel').addEventListener('click', closeModal);
    var _x = ov.querySelector('#sdBtnX'); if (_x) _x.addEventListener('click', closeModal);
    /* v454: النقرُ الخارجي كان يغلقها ورقمُ السرّ مكتوبٌ فيها — أُزيل. */
    if (window.SyModal) window.SyModal.scan();

    var _switchInFlight = false;
    ov.querySelector('#sdBtnConfirm').addEventListener('click', async function(){
      if (_switchInFlight) return;
      _switchInFlight = true;
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      confirmBtn.disabled = true;
      try {
        var targetRole = ov.querySelector('input[name="sdRoleSel"]:checked').value;
        var targetDocId = null;
        if (targetRole === 'doctor') {
          var sel = ov.querySelector('#sdDoctorSel');
          if (!sel || !sel.value) {
            ov.querySelector('#sdMsg').textContent = 'اختر طبيباً أولاً.';
            return;
          }
          targetDocId = sel.value;
        }
        if (targetRole === getRole() && (targetRole !== 'doctor' || targetDocId === getDoctorId())) {
          closeModal();
          return;
        }
        var need = requirePin(targetRole, targetDocId);
        if (need) {
          var pin = (ov.querySelector('#sdPinInput').value || '').trim();
          var ver = await verifyPin(pin);
          if (!ver.ok) {
            var pm = ov.querySelector('#sdPinMsg');
            if (ver.reason === 'cooldown') {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + ver.secondsLeft + ' ثانية.';
            } else if (ver.reason === 'no_pin_set') {
              pm.textContent = '⚠ لم يتم تعيين PIN بعد.';
            } else if (ver.reason === 'invalid_format') {
              pm.textContent = 'PIN يجب أن يكون 4-6 أرقام.';
            } else if (ver.reason === 'wrong') {
              pm.textContent = '❌ PIN خاطئ. متبقّي ' + (ver.failsLeft || 0) + ' محاولات.';
            }
            return;
          }
        }
        applyRole(targetRole, targetDocId);
        closeModal();
        window.location.reload();
      } finally {
        _switchInFlight = false;
        if (confirmBtn && document.body.contains(confirmBtn)) confirmBtn.disabled = false;
      }
    });

    updateActive();
    setTimeout(function(){
      var pi = ov.querySelector('#sdPinInput');
      if (pi && pi.offsetParent) { pi.focus(); return; }
      // Phase 6 M (Obs N): fallback focus if PIN row hidden
      var checked = ov.querySelector('input[name="sdRoleSel"]:checked');
      if (checked && checked.offsetParent !== null) { checked.focus(); return; }
      var confirm = ov.querySelector('#sdBtnConfirm');
      if (confirm) confirm.focus();
    }, 80);
  }

  // ── HTML escape (local helper) ────────────────────────────────
  function escapeHtmlLock(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Auto-init on every page that has supabase-init ────────────
  // ── Phase 4.1: Device lock detection ─────────────────────────
  // Returns TRUE only if the EMPLOYEE row is deactivated (or fully deleted),
  // triggering banner + action guards across the whole device.
  //
  // Reads from _employeesListCache (preloaded in autoInit).
  // Cache contains is_active=true rows only, so "not found" = deactivated.
  function isDoctorAccountInactive() {
    // ── Phase 7.6 Fix: Owner is never locked by employee logic ──
    // The clinic owner's identity comes from doctors.is_owner=true (Phase 1
    // canonical owner record), NOT from clinic_employees. A device with
    // role='owner' but a stale LS_EMPLOYEE_ID (e.g. from a pre-Phase-5 setup
    // attempt, a wiped clinic_employees row, or a re-onboarded tenant) must
    // never be flagged as inactive — that would lock the actual clinic owner
    // out of their own data.
    // Employees (secretary, doctor-as-employee) still go through Path 1 below.
    if (isOwner()) return false;

    // ── Path 1: Phase 5 employee-locked device ──
    // If a specific employee is locked in, check if that employee is still
    // active. This is the primary path for all post-Phase-5 devices.
    var empId = getEmployeeId();
    if (empId && _employeesListCache) {
      var emp = _employeesListCache.find(function(e){ return e.id === empId; });
      if (!emp) {
        // Employee deactivated (or fully deleted) → device read-only
        return true;
      }
      return false; // active employee → device unlocked
    }

    // ── Path 2: Phase 4.1 legacy doctor-only lock (pre-Phase-5 devices) ──
    // Device locked to role=doctor WITHOUT an employee_id (legacy installs).
    if (!isDoctor()) return false;
    if (!_doctorsListCache) return false; // not loaded yet — assume active
    var did = getDoctorId();
    if (!did) return false;
    return !_doctorsListCache.find(function(d){ return d.id === did; });
  }

  function injectInactiveBanner() {
    // Phase X10.1: defense-in-depth. The "حسابك معطّل" banner is for
    // clinic employees/doctors only — it has no meaning on public pages
    // and would confuse visitors who never logged in. Mirror the guard
    // in injectHeaderButton().
    if (isPublicPage()) return;
    if (document.getElementById('sdInactiveBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'sdInactiveBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'position:sticky;top:0;left:0;right:0;z-index:200;' +
      'background:var(--red-soft);' +   // v377: unified tokens
      'border-bottom:2px solid var(--red-solid,#dc2626);color:var(--red-ink,#991b1b);' +
      'padding:10px 16px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;' +
      'text-align:center;direction:rtl;white-space:normal;line-height:1.5;';
    banner.innerHTML =
      '⚠ <strong>حسابك معطّل من قِبَل المالك.</strong> ' +
      'يمكنك تصفّح البيانات للقراءة فقط — تسجيل الجلسات والدفعات والمواعيد معطّل. ' +
      'الرجاء التواصل مع المالك لإعادة التفعيل.';

    // Placement: insert into .main (sidebar layout) or at body top (no sidebar).
    // Either way, it should be ABOVE the topbar so it spans the working area
    // without breaking the sidebar's vertical full-height layout.
    var main = document.querySelector('.main');
    if (main && main.firstChild) {
      main.insertBefore(banner, main.firstChild);
    } else if (main) {
      main.appendChild(banner);
    } else if (document.body.firstChild) {
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      document.body.appendChild(banner);
    }
  }

  function applyInactiveActionGuards() {
    // Disable any element opted-in to inactive-doctor blocking
    var els = document.querySelectorAll('[data-doctor-inactive-block]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.setAttribute('disabled', 'disabled');
      el.setAttribute('aria-disabled', 'true');
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
      el.style.pointerEvents = 'none';
      el.title = 'معطّل — حسابك غير نشط حالياً';
      el.setAttribute('data-doctor-inactive-disabled-by-lock', '1');
    }
  }

  function applyInactiveDoctorUI() {
    if (!isDoctorAccountInactive()) return;
    injectInactiveBanner();
    applyInactiveActionGuards();
    // Re-run guards after dynamic re-renders by listening for the
    // applyRoleGuards call too (patients/labs/etc. call it after render)
    // We also patch refreshHeaderButton to keep the banner visible.
  }

  // ═══════════════════════════════════════════════════════════════
  // Presence heartbeat (Migration 82)
  // ═══════════════════════════════════════════════════════════════
  // Stamps clinic_settings.last_seen_at so the platform admin console
  // can show a truthful "online now / last seen" — last_sign_in_at is
  // frozen under long-lived refresh-token sessions and audit_log only
  // captures mutations (pure browsing leaves no trace).
  //
  // Deliberately minimal (Rule #20 — no websockets, no presence infra):
  //   • Throttled: at most ONE write per tenant per 10 minutes, enforced
  //     via a per-uid localStorage stamp. Parallel tabs may rarely race
  //     into two identical writes — harmless.
  //   • Online only: skipped entirely when navigator.onLine is false.
  //     NEVER queued in the offline outbox (not an outbox table; a stale
  //     replayed heartbeat would lie about presence anyway).
  //   • Fire-and-forget: nothing awaits it; failures only warn. On
  //     failure the stamp is cleared so the next page load retries
  //     (e.g. Migration 82 not applied yet, or a network blip).
  //   • Scope: tenant pages only — called from autoInit AFTER the
  //     isPublicPage() skip and the platform-admin redirect, so it can
  //     never fire for admin.html / auth / landing / book / privacy.
  //   • RLS: the owner ALL policy covers the UPDATE (single-login model
  //     → auth.uid() IS the owner_id for every staff member). A missing
  //     clinic_settings row simply matches 0 rows — silent no-op.
  var HB_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
  function presenceHeartbeat() {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      window.sb.auth.getSession().then(function(res) {
        var u = res && res.data && res.data.session && res.data.session.user;
        if (!u || !u.id) return;
        var key = 'sydent_last_hb_' + u.id;
        var last = 0;
        try { last = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch(_) {}
        if (Date.now() - last < HB_THROTTLE_MS) return;
        try { localStorage.setItem(key, String(Date.now())); } catch(_) {}
        // M141: عبر touch_presence — تبقى تعمل للحساب المنتهي (القاعدة تمنع تحديث
        // clinic_settings لغير full) فتظل لوحةُ الأدمن تراه متصلاً.
        window.sb.rpc('touch_presence')
          .then(function(r) {
            if (r && r.error) {
              // Column missing (pre-Migration-82) or transient failure —
              // clear the stamp so the next page load retries.
              try { localStorage.removeItem(key); } catch(_) {}
              console.warn('[presenceHeartbeat] skipped:', r.error.message);
            }
          });
      }).catch(function(e) {
        console.warn('[presenceHeartbeat] session read failed:', e && e.message);
      });
    } catch(e) {
      console.warn('[presenceHeartbeat] error:', e && e.message);
    }
  }

  async function autoInit() {
    // Skip on auth & landing pages (pre-auth) AND admin.html (platform page, not tenant).
    //
    // admin.html is the SyDent SaaS platform control panel — it manages
    // trial_requests for clinic owners across all tenants. It does NOT belong
    // to any single clinic (no clinic_doctors / clinic_employees row for the
    // admin user). Running autoInit() here would:
    //   1. Try to load clinic_employees / clinic_doctors for an admin who has
    //      no rows → empty caches → confusing "owner deleted" lock pill
    //   2. Risk injecting the "حسابك معطّل من قِبَل المالك" inactive banner
    //      (designed for clinic employees, not the platform admin)
    //   3. Inject sidebar header buttons / role guards that don't apply to
    //      the platform-level admin role
    // The admin page has its own auth guard (platform_admins check) and
    // runs entirely outside the per-tenant SyDentLock system. See Rule #28 and
    // the SaaS multi-tenant best practice: keep the global/platform layer
    // distinct from the tenant layer.
    // Phase X10.1: use the canonical isPublicPage() helper instead of
    // an inline regex. This guarantees consistency with the matching
    // guards inside injectHeaderButton() and injectInactiveBanner() so
    // all three skip the same set of pages. The helper also handles
    // trailing-slash edge cases and includes /index.html + /pending.html
    // which the old inline regex missed.
    if (isPublicPage()) return;

    // Wait briefly for DOM
    if (document.readyState === 'loading') {
      await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, { once: true }); });
    }

    // ── Defensive platform-admin redirect ─────────────────────────────
    // Belt-and-suspenders: index.html already redirects admins to admin.html,
    // but if the admin lands directly on any other tenant page (patients,
    // appointments, settings, etc.) via a bookmark, deep link, history, or
    // PWA shortcut, redirect them to admin.html before any tenant-level
    // logic (caches, banners, role guards) tries to render. Without this,
    // the admin would see the misleading "Owner deleted" pill + "account
    // deactivated" banner since they have no clinic_employees row.
    //
    // We use a deliberately-cheap check: only fire the query if there's a
    // session at all. Errors are non-fatal — if the platform_admins query
    // fails, we let the page proceed (graceful degradation; admins are rare).
    // Phase F: switched from doctors.role='admin' to platform_admins table.
    /* DeepCode #1 (v555): ذاكرةُ الأطباء (قراءةٌ بحتة، محفوظةٌ ومكرَّرةُ الاستدعاء بأمان) تُطلَق مع فحص الأدمن لا بعده.
       ensureOwnerEmployee — وقد يكتب — يبقى **بعد** فحص الأدمن كما كان (لا صفَّ مالكٍ لحساب أدمن). */
    var _lockDocsP = loadDoctors().catch(function (e) { console.warn('[SyDentLock] loadDoctors:', e); });
    try {
      var sessRes = await window.sb.auth.getSession();
      var sUser = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (sUser) {
        var adminCheck = await window.SyDentAuth.isPlatformAdmin(sUser.id);
        if (adminCheck.isAdmin) {
          window.location.replace('admin.html');
          return;
        }
      }
    } catch(_adminCheckErr) {
      // Best-effort. Non-admin users far outnumber admins, so failing
      // this check should never block a tenant user from their dashboard.
      console.warn('[SyDentLock] admin role check skipped:', _adminCheckErr && _adminCheckErr.message);
    }
    // ──────────────────────────────────────────────────────────────────

    // Phase X14.2: self-heal the owner's clinic_employees row before anything
    // reads the employee list. loadDoctors() first so getOwnerPersonName() can
    // resolve the owner's name from clinic_doctors.is_owner. Both are idempotent
    // and cached, so the parallel preload below reuses the doctor cache.
    await _lockDocsP;   /* v555: بدأ مع فحص الأدمن أعلاه */
    await ensureOwnerEmployee();

    // Preload (don't await — fire and forget for speed)
    loadPinHash();
    // Phase 5: preload BOTH caches in parallel; refresh header & apply inactive
    // UI only once BOTH are loaded so isDoctorAccountInactive() has full data.
    // Header is also refreshed as each cache lands so user sees the name asap.
    var empPromise = loadEmployees().then(function(){ refreshHeaderButton(); });
    var docPromise = loadDoctors().then(function(){ refreshHeaderButton(); });
    Promise.all([empPromise, docPromise]).then(function(){
      // Phase 4.1 + 5: now both caches are ready — check inactive status
      // against employee AND doctor, render banner + apply guards if needed
      applyInactiveDoctorUI();
    });
    injectHeaderButton();
    applyRoleGuards();

    // Presence heartbeat — fire-and-forget, throttled (see definition above).
    // Placed AFTER the isPublicPage() skip and the platform-admin redirect,
    // so it only ever runs for a signed-in tenant on a tenant page.
    presenceHeartbeat();
    // Long-lived single-page sessions (e.g. the appointments board left
    // open all day) never re-run autoInit, so re-fire on a timer. The
    // 10-min localStorage throttle inside presenceHeartbeat() still caps
    // actual writes; hidden/background tabs are skipped so an abandoned
    // minimized tab doesn't fake presence. Guarded against double timers.
    if (!window._sydHbTimer) {
      window._sydHbTimer = setInterval(function() {
        try {
          if (document.visibilityState === 'hidden') return;
          presenceHeartbeat();
        } catch(_) {}
      }, 5 * 60 * 1000);
    }

    // Phase 6 M (Obs M): multi-tab sync.
    // The lock identity lives in localStorage. If another tab switches
    // the role (or the Owner disables/changes the clinic PIN) while
    // THIS tab has the lock modal open, the modal's local snapshot of
    // curRole/curDoctorId/curEmployeeId becomes stale — the next click
    // would apply a transition computed from outdated state. Listening
    // for the 'storage' event (fires in OTHER tabs only, never in the
    // tab that wrote) lets us react cleanly.
    //
    // Strategy:
    //   • Identity keys (LS_ROLE, LS_DOCTOR_ID, LS_EMPLOYEE_ID) changed
    //     → close any open lock modal in this tab AND reload, so the
    //       page re-applies guards/banners with the new identity. This
    //       matches the behavior of a fresh tab opening after the switch.
    //   • Failure/cooldown keys (LS_FAIL_COUNT, LS_COOLDOWN) changed
    //     → don't reload; just refresh any open modal's PIN message so
    //       the cooldown countdown reflects reality.
    //   • Anything else (settings, app preferences) → ignored here.
    if (typeof window.addEventListener === 'function' && !window._sydLockStorageWired) {
      window._sydLockStorageWired = true;
      window.addEventListener('storage', function(e){
        if (!e || !e.key) return;
        var identityChanged = (e.key === LS_ROLE || e.key === LS_DOCTOR_ID || e.key === LS_EMPLOYEE_ID);
        var rateLimitChanged = (e.key === LS_FAIL_COUNT || e.key === LS_COOLDOWN);
        if (!identityChanged && !rateLimitChanged) return;
        var openModal = document.getElementById('sdLockModal');
        if (identityChanged) {
          // Close the modal (if any) so a stale snapshot doesn't act.
          // Don't bother with a11y cleanup — the page is about to reload.
          if (openModal) openModal.remove();
          // Tiny defer so the storage write in the other tab has fully
          // landed in our localStorage (avoids racing the reload).
          setTimeout(function(){ window.location.reload(); }, 50);
          return;
        }
        // rateLimitChanged: just nudge the open modal's PIN message if any.
        if (openModal) {
          var pm = openModal.querySelector('#sdPinMsg');
          if (pm) {
            if (isInCooldown()) {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات (من جهاز آخر). أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
            }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Audit Logging API
  // ═══════════════════════════════════════════════════════════════
  // Fire-and-forget logger for every important operation in the system.
  // Records WHO (employee_id + snapshot), WHAT (action_type + entity),
  // WHEN (created_at auto), and ON WHOM (patient_id + snapshot).
  //
  // Usage:
  //   window.logAudit('payment.delete', {
  //     entityId: paymentId,
  //     patientId: patient.id,
  //     patientName: patient.name,
  //     description: 'حذف دفعة 5000 ل.س',
  //     oldValue: { amount: 5000, created_at: '...' }
  //   });
  //
  // Designed to be safe & non-blocking:
  //   - Never throws (errors go to console)
  //   - Fire-and-forget (returns immediately; logging happens async)
  //   - Falls back silently if Migration 9.1 not applied
  //   - employee_id may be NULL if device is on a legacy install (no per-employee setup)
  // ═══════════════════════════════════════════════════════════════

  // Valid action_type prefixes (used for validation, not enforcement)
  var VALID_ACTION_PREFIXES = [
    'patient.', 'appointment.', 'appointment_type.', 'session.', 'payment.',
    'lab.', 'lab_payment.', 'doctor.', 'employee.', 'operatory.',
    'expense.', 'expense_category.', 'payout.', 'payment_plan.',
    'settings.', 'lock.', 'report.',
    'prescription.', 'postop_note.', 'adjustment.',
    'implant_log.',
    'perio.',
    'family.'
  ];

  async function logAudit(actionType, opts) {
    opts = opts || {};
    try {
      // Validate action_type quickly
      if (typeof actionType !== 'string' || !actionType.includes('.')) {
        console.warn('[logAudit] invalid action_type:', actionType);
        return;
      }
      // Soft validation — warn but don't block (in case new prefixes added later)
      var validPrefix = VALID_ACTION_PREFIXES.some(function(p){ return actionType.indexOf(p) === 0; });
      if (!validPrefix) {
        console.warn('[logAudit] unrecognized action prefix:', actionType);
      }

      var user = await window.sbGetUser();
      if (!user) return; // not authenticated — nothing to log

      // Resolve employee snapshot (may be null on legacy devices)
      var emp = await getCurrentEmployee();

      var row = {
        owner_id: user.id,
        employee_id: emp ? emp.id : null,
        employee_name_snapshot: emp ? emp.name : null,
        employee_role_snapshot: emp ? emp.role : getRole(), // fallback to device role
        action_type: actionType,
        entity_type: opts.entityType || actionType.split('.')[0],
        entity_id: opts.entityId || null,
        patient_id: opts.patientId || null,
        patient_name_snapshot: opts.patientName || null,
        description: opts.description || null,
        old_value: opts.oldValue || null,
        new_value: opts.newValue || null
      };

      var res = await window.sb.from('audit_log').insert(row);
      if (res.error) {
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        // Silently swallow "table does not exist" — Migration 9.1 not run yet
        if (!/audit_log|42P01|PGRST205/i.test(m)) {
          console.warn('[logAudit] insert failed:', res.error);
        }
      }
    } catch (e) {
      console.warn('[logAudit] exception:', e);
    }
  }

  // Expose globally for convenience (every page can call window.logAudit directly)
  window.logAudit = logAudit;

  // ═══════════════════════════════════════════════════════════════
  // Phase 6 M (Obs E): Shared appointment migration-detection helpers
  // ═══════════════════════════════════════════════════════════════
  // Both appointments.html (saveAppt) and patient-profile.html (saveAppt)
  // need to detect "Gap 7 migration not applied" errors and fall back
  // to a legacy-row insert. Pre-Phase-6, both files defined IDENTICAL
  // copies of isPlannedMigrationMissing() and buildLegacyRow(). This
  // helper hoists them to a single source of truth without changing
  // any retry orchestration (those remain page-specific because their
  // surrounding state — editingId, autofill fields, no-show fees —
  // differs).
  //
  // Usage in any page:
  //   if (SyDentAppt.isPlannedMigrationMissing(err)) {
  //     var legacy = SyDentAppt.buildLegacyRow(apptData);
  //     // retry with legacy ...
  //   }
  //
  // Behavior is byte-for-byte equivalent to the previous inline copies.
  function _apptIsPlannedMigrationMissing(err) {
    if (!err) return false;
    var emsg = (err.message || '').toLowerCase();
    var code = err.code || '';
    var isPlannedCol = emsg.indexOf('is_planned') !== -1;
    var notNullDate  = /violates not-null constraint.*"(date|time)"/i.test(err.message || '');
    var schedHasDate = emsg.indexOf('scheduled_has_date') !== -1;
    if (isPlannedCol && (code === '42703' || code === 'PGRST204' || emsg.indexOf('does not exist') !== -1 || emsg.indexOf('schema cache') !== -1)) return true;
    if (notNullDate || schedHasDate) return true;
    return false;
  }

  function _apptBuildLegacyRow(src) {
    var row = Object.assign({}, src);
    delete row.is_planned;
    // Today's date in YYYY-MM-DD — matches the existing toDay() format.
    // Inlined here because supabase-init.js doesn't import page helpers.
    var t = new Date();
    var yyyy = t.getFullYear();
    var mm = String(t.getMonth() + 1).padStart(2, '0');
    var dd = String(t.getDate()).padStart(2, '0');
    var today = yyyy + '-' + mm + '-' + dd;
    if (row.date === null) row.date = today;
    if (row.time === null) row.time = '12:00';
    return row;
  }

  window.SyDentAppt = {
    isPlannedMigrationMissing: _apptIsPlannedMigrationMissing,
    buildLegacyRow: _apptBuildLegacyRow
  };

  // ── Phase 7.6G: Tenant Onboarding State ──────────────────────────────
  // Returns a snapshot of the new owner's onboarding progress. Used by
  // index.html (welcome banner + checklist) and by individual tenant
  // pages (empty states deciding whether to show first-time CTAs).
  //
  // Returns an object:
  //   {
  //     loaded:               boolean,  // false if user not logged in or query failed
  //     dismissed:            boolean,  // banner was hidden by user
  //     clinicNameConfirmed:  boolean,
  //     clinicName:           string|null,
  //     patientsCount:        number,
  //     appointmentsCount:    number,
  //     sessionsCount:        number,
  //     // derived:
  //     itemsDone:            number,   // 0..4
  //     itemsTotal:           4,
  //     allDone:              boolean,
  //     shouldShowBanner:     boolean   // !dismissed && !allDone
  //   }
  //
  // The four checklist items are intentionally computed (not stored) so
  // they reflect reality without any sync bookkeeping. Adding a patient
  // anywhere instantly bumps the count on the next render.
  //
  // Fault-tolerant: returns sensible defaults if any query fails or if
  // Migration 29 hasn't been applied. Callers should check `loaded`.
  async function getOnboardingState() {
    var fallback = {
      loaded: false,
      dismissed: false,
      clinicNameConfirmed: false,
      clinicName: null,
      patientsCount: 0,
      appointmentsCount: 0,
      sessionsCount: 0,
      itemsDone: 0,
      itemsTotal: 4,
      allDone: false,
      shouldShowBanner: false
    };

    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return fallback;

      // Parallel queries — much faster than serial chains. The counts are
      // head:true (no row payload), so the wire cost is essentially zero.
      var ownerId = u.id;
      var p = window.sb.from('clinic_settings')
        .select('clinic_name, onboarding_dismissed_at, clinic_name_confirmed_at')
        .eq('owner_id', ownerId).maybeSingle();
      // Tenant tables (patients/appointments/ledger_sessions) use the legacy
      // column name `doctor_id` for the tenant identity (originally there was
      // only one doctor per tenant — Phase 1 naming). Only platform-aware
      // tables (clinic_settings, clinic_employees, clinic_doctors) use
      // `owner_id`. Phase 7.6G initially used `owner_id` here, which raised
      // 400 (Bad Request) on patients/appointments + 404 (Not Found) on
      // 'sessions' (the real table is `ledger_sessions`). Onboarding state
      // silently defaulted to 0/4 — banner stayed up forever for every tenant.
      var pp = window.sb.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);
      var pa = window.sb.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);
      var ps = window.sb.from('ledger_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);

      var results = await Promise.all([p, pp, pa, ps]);
      var settingsRes = results[0];
      var patientsRes = results[1];
      var apptsRes    = results[2];
      var sessRes2    = results[3];

      // 28-May-2026 fix: if the tenant has no clinic_settings row yet, the
      // welcome prompt ("هل اسم عيادتك … صحيح؟") can't display because
      // st.clinic_name is null. Pre-Phase 7.6G the row was created lazily on
      // first visit to settings.html, but a freshly approved tenant typically
      // lands on index.html first → prompt was silently skipped.
      // Auto-create the row here with the same defaults settings.html uses on
      // first visit (clinic_name seeded from auth.users.user_metadata.full_name).
      // We deliberately do NOT set clinic_name_confirmed_at — the whole point
      // is for the user to confirm or edit the seeded name. The WhatsApp
      // template column has a Postgres DEFAULT so we omit it here.
      // Best-effort: on any failure (race, RLS, missing column) we fall
      // through with the original empty state. Idempotent via the existing
      // owner_id unique constraint on clinic_settings (PK).
      if (settingsRes && !settingsRes.error && !settingsRes.data) {
        try {
          var meta = u.user_metadata || {};
          var seedName = (meta.full_name || meta.name)
            ? ('عيادة ' + (meta.full_name || meta.name))
            : null;
          // Migration 107: العملة المختارة عند التسجيل تصل هنا عبر
          // user_metadata.currency (مررها auth.html في signUp). هذه هي اللحظة
          // الوحيدة التي تُكتب فيها — بعدها لا واجهة تغيير. أي قيمة غير 'USD'
          // (أو غياب المفتاح كلياً في الحسابات القديمة) → 'SYP'.
          var seedCur = (meta.currency === 'USD') ? 'USD' : 'SYP';
          // Migration 114: الفرع والرقم النقابي من نموذج التسجيل. القصّ يطابق
          // قيدَي CHECK بالـDB (40 / 30) فلا يفشل الإدراج ويبقى الصف بلا اسم
          // عيادة. الفراغ → null (لا سلسلة فارغة) كي يبقى «غير محدّد» صادقاً.
          var seedBranch = (typeof meta.syndicate_branch === 'string' && meta.syndicate_branch.trim())
            ? meta.syndicate_branch.trim().slice(0, 40) : null;
          var seedLicense = (typeof meta.syndicate_no === 'string' && meta.syndicate_no.trim())
            ? meta.syndicate_no.trim().slice(0, 30) : null;
          var seedRes = await window.sb.from('clinic_settings').insert({
            owner_id: ownerId,
            clinic_name: seedName,
            currency: seedCur,
            syndicate_branch: seedBranch,
            license_no: seedLicense,
            whatsapp_reminders_enabled: true,
            whatsapp_reminder_hours_before: 24
          }).select('clinic_name, onboarding_dismissed_at, clinic_name_confirmed_at').single();
          try { if (window.SyDentCurrency) window.SyDentCurrency.set(seedCur); } catch (e0) {}
          if (!seedRes.error && seedRes.data) {
            settingsRes = { data: seedRes.data };  // feed the rest of the function
          }
        } catch (seedErr) {
          console.warn('[onboarding] clinic_settings auto-create failed:', seedErr && seedErr.message);
        }
      }

      var st = (settingsRes && settingsRes.data) || {};
      var dismissed           = !!st.onboarding_dismissed_at;
      var clinicNameConfirmed = !!st.clinic_name_confirmed_at;
      var clinicName          = st.clinic_name || null;
      var patientsCount       = (patientsRes && typeof patientsRes.count === 'number') ? patientsRes.count : 0;
      var appointmentsCount   = (apptsRes    && typeof apptsRes.count    === 'number') ? apptsRes.count    : 0;
      var sessionsCount       = (sessRes2    && typeof sessRes2.count    === 'number') ? sessRes2.count    : 0;

      var itemsDone =
        (clinicNameConfirmed ? 1 : 0) +
        (patientsCount     > 0 ? 1 : 0) +
        (appointmentsCount > 0 ? 1 : 0) +
        (sessionsCount     > 0 ? 1 : 0);
      var allDone = itemsDone >= 4;

      return {
        loaded: true,
        dismissed: dismissed,
        clinicNameConfirmed: clinicNameConfirmed,
        clinicName: clinicName,
        patientsCount: patientsCount,
        appointmentsCount: appointmentsCount,
        sessionsCount: sessionsCount,
        itemsDone: itemsDone,
        itemsTotal: 4,
        allDone: allDone,
        shouldShowBanner: !dismissed && !allDone
      };
    } catch (e) {
      console.warn('[onboarding] getOnboardingState failed:', e && e.message);
      return fallback;
    }
  }

  // Mark the welcome banner as dismissed. Best-effort: silently no-ops
  // if Migration 29 isn't applied yet.
  async function dismissOnboardingBanner() {
    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return false;
      var res = await window.sb.from('clinic_settings')
        .update({ onboarding_dismissed_at: new Date().toISOString() })
        .eq('owner_id', u.id);
      return !res.error;
    } catch (e) {
      console.warn('[onboarding] dismiss failed:', e && e.message);
      return false;
    }
  }

  // Mark the clinic_name as confirmed by the user. Called either after
  // they tap "نعم احتفظ" on the inline prompt, or after they edit and
  // save the name in settings.html. Idempotent.
  async function confirmClinicName(newName) {
    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return false;
      var payload = { clinic_name_confirmed_at: new Date().toISOString() };
      if (typeof newName === 'string' && newName.trim()) {
        payload.clinic_name = newName.trim();
      }
      var res = await window.sb.from('clinic_settings')
        .update(payload)
        .eq('owner_id', u.id);
      return !res.error;
    } catch (e) {
      console.warn('[onboarding] confirmClinicName failed:', e && e.message);
      return false;
    }
  }

  window.SyDentOnboarding = {
    getState:            getOnboardingState,
    dismissBanner:       dismissOnboardingBanner,
    confirmClinicName:   confirmClinicName
  };


  // ───────────────────────────────────────────────────────────────
  // Password Visibility Toggle (👁 / 🙈)
  // ───────────────────────────────────────────────────────────────
  // Industry pattern: Microsoft Edge + Stripe + GitHub.
  //   • Auto-hide on blur (Edge pattern) — prevents accidental leak
  //   • aria-pressed + dynamic aria-label (WCAG 4.1.2)
  //   • Keyboard support (Enter / Space)
  //   • Caret + value preservation across type swap
  //   • RTL-safe positioning via inset-inline-end (logical property)
  //   • Idempotent: re-calling attach() on the same input is a no-op
  //
  // Used by: auth.html (loginPass, regPass),
  //          settings.html (fPassNew, fPassConfirm, fDeletePass),
  //          employees.html (ePin, ePinConfirm, oNewPin, oNewPinConfirm)
  function attachPwdToggle(inputId) {
    try {
      var input = document.getElementById(inputId);
      if (!input) return false;
      if (input.getAttribute('data-pwd-wired') === '1') return true; // idempotent
      if (input.type !== 'password') return false; // safety guard

      // Wrap the input in .pwd-wrap (if not already wrapped)
      var parent = input.parentNode;
      if (!parent) return false;
      var wrap;
      if (parent.classList && parent.classList.contains('pwd-wrap')) {
        wrap = parent;
      } else {
        wrap = document.createElement('span');
        wrap.className = 'pwd-wrap';
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);
      }

      // Heroicons-style inline SVGs (outline, 20×20, currentColor).
      // Using SVG instead of 👁/🙈 emojis because the see-no-evil monkey
      // emoji renders at native (huge) size on some Windows font fallbacks,
      // breaking the button layout. SVGs scale perfectly across all OSes.
      var SVG_EYE      = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.21.07.439 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><circle cx="12" cy="12" r="3"/></svg>';
      var SVG_EYE_OFF  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"/></svg>';

      // Build the toggle button
      var btn = document.createElement('button');
      btn.type = 'button';                       // never submits the form
      btn.className = 'pwd-toggle';
      btn.tabIndex = 0;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'إظهار كلمة السر');
      btn.setAttribute('aria-controls', inputId);
      btn.innerHTML = SVG_EYE;
      wrap.appendChild(btn);

      function setRevealed(reveal) {
        // Preserve caret position across the type swap
        var pos = null, end = null;
        try { pos = input.selectionStart; end = input.selectionEnd; } catch(_) {}
        input.type = reveal ? 'text' : 'password';
        btn.innerHTML = reveal ? SVG_EYE_OFF : SVG_EYE;
        btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
        btn.setAttribute('aria-label', reveal ? 'إخفاء كلمة السر' : 'إظهار كلمة السر');
        // Restore caret (some browsers reset it on type change)
        if (pos !== null) {
          try { input.setSelectionRange(pos, end); } catch(_) {}
        }
      }

      function toggle(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        setRevealed(input.type === 'password');
        // Keep focus on the input so typing continues naturally
        try { input.focus(); } catch(_) {}
      }

      btn.addEventListener('click', toggle);

      // Note: native <button> already handles Enter (keydown) and Space (keyup)
      // by firing a click event, so no extra keydown handler is needed.

      // Auto-hide on blur (Microsoft Edge security pattern).
      // Use focusout on the wrap so moving focus between input and button
      // does NOT count as leaving the field.
      wrap.addEventListener('focusout', function(e){
        var next = e.relatedTarget;
        if (next && (next === input || next === btn || wrap.contains(next))) return;
        if (input.type === 'text') setRevealed(false);
      });

      input.setAttribute('data-pwd-wired', '1');
      return true;
    } catch (err) {
      console.warn('[pwd] attach failed for', inputId, err && err.message);
      return false;
    }
  }

  function attachAllPwdToggles(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      attachPwdToggle(ids[i]);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SyDentAiGuard — حارس أرقام حتميّ لمخرجات الذكاء الاصطناعي
     ═══════════════════════════════════════════════════════════════════
     الدرس الذي وُلد منه (سرد churn، اختبار حيّ 3 آب 2026): الحمولة قالت
     «15 موعداً» والسرد كتب «16» — انزياحٌ بخانة واحدة لا يُرى بالعين.
     كل ميزات الأرقام تُبنى حمولتها من دوال العرض نفسها فيستحيل أن تكذب،
     لكن **المخرج لم يكن يُفحص**، وقاعدة النسخ الحرفيّ بالبرومبت هي أشدّ
     ما يمكن كتابته وقد انزاحت رغمها. فالبرومبت ليس ضماناً؛ الضمان
     الوحيد فحصٌ حتميّ بلا AI بالحلقة.

     المبدأ: كل رقم يظهر بالمخرج يجب أن يكون موجوداً حرفياً بالحمولة —
     بلا قائمة بيضاء، لأن كل رقم مشتقّ ممنوع أصلاً بالبرومبتات.
     أي رقم لا يطابق ⇒ سطر تحذير يسمّيه. ولا يُحجب النصّ: قد يكون باقيه
     صحيحاً، والمقصود أن يصير الفشل مسموعاً بدل صامت.

     حدٌّ معروف ومقبول عمداً: العدد المكتوب لفظاً («يومين» · «ثلاثة»)
     يتجاوز هذا الحارس بنيوياً — البرومبتات تمنع الكتابة بالحروف، ولم
     يُبنَ كاشفٌ لفظيّ لأن هذه كلمات شائعة تُنتج إنذارات كاذبة، وتآكل
     مصداقية التحذير أخطر من عددٍ لفظيٍّ نادر: قيمة التحذير كلها في أن
     ظهوره يعني شيئاً.

     🔒 دوال نقيّة — صفر شبكة وصفر تخزين وصفر DOM.
     ═══════════════════════════════════════════════════════════════════ */
  (function () {
    'use strict';

    /* هندية ← لاتينية · فاصلة الآلاف (لاتينية وعربية) تُزال · الفاصلة
       العشرية العربية تصير نقطة. */
    function normDigits(s) {
      return String(s == null ? '' : s)
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .replace(/(\d)[,\u066C](?=\d{3}\b)/g, '$1')
        .replace(/\u066B/g, '.');
    }

    /* مجموعة الأرقام الظاهرة بنصّ، مُقنَّنة (04 ⇒ 4 · 15.0 ⇒ 15). */
    function numSet(s) {
      var out = {}, m, re = /\d+(?:\.\d+)?/g, t = normDigits(s);
      while ((m = re.exec(t))) {
        var n = Number(m[0]);
        if (isFinite(n)) out[String(n)] = true;
      }
      return out;
    }

    /* أرقام المخرج غير الموجودة بالحمولة — بترتيب ظهورها وبلا تكرار.
       يُبلَّغ عن الرقم بصيغته كما ظهر بالمخرج لا مقنَّنة، وإلا بحث
       القارئ عن «999» في نصّ يكتب «٩٩٩». */
    function unknownNums(outText, factsText) {
      var allowed = numSet(factsText);
      var seen = {}, bad = [];
      var D = '0-9\\u0660-\\u0669\\u06F0-\\u06F9';
      var re = new RegExp('[' + D + '][' + D + ',\\u066C.\\u066B]*', 'g');
      var m, src = String(outText == null ? '' : outText);
      while ((m = re.exec(src))) {
        // نقطة نهاية الجملة أو فاصلتها ليست جزءاً من الرقم.
        var raw = String(m[0]).replace(/[.,\u066B\u066C]+$/, '');
        var n = Number(normDigits(raw));
        if (!isFinite(n)) continue;            // صيغة ملتبسة ⇒ لا تُبلَّغ زوراً
        var k = String(n);
        if (allowed[k] || seen[k]) continue;
        seen[k] = true;
        bad.push(raw);
      }
      return bad;
    }

    /* نصّ التحذير الموحَّد — صياغة واحدة لكل السطوح بلا مرايا. */
    function warnText(bad) {
      if (!bad || !bad.length) return '';
      return '⚠️ ' + (bad.length === 1 ? 'رقم لا يطابق المؤشّرات' : 'أرقام لا تطابق المؤشّرات') +
             ': ' + bad.join(' · ') + ' — تحقّق منها قبل الاعتماد على النصّ.';
    }

    /* الاستعمال المعتاد بسطر واحد: نصّ التحذير أو '' . */
    function check(outText, factsText) {
      if (!outText || !factsText) return '';
      return warnText(unknownNums(outText, factsText));
    }

    window.SyDentAiGuard = {
      normDigits:  normDigits,
      numSet:      numSet,
      unknownNums: unknownNums,
      warnText:    warnText,
      check:       check
    };
  })();

  /* ═══ SyDentXlsx — مصدر واحد لتصدير جداول إكسل عبر كل الأسطح ═══════════
     نشأ محلياً بـpatients.html ثم تكرّر بـaudit-log.html، وكان رح يتكرّر
     ثلاث مرات أخرى بطبقة الأدمن — فرُقّي هنا (سابقة SyDentAiGuard). مرآةٌ
     تُحذف خير من مرآة تُحرَس: انحراف مسار الـvendor أو رقم النسخة بملف دون
     آخر لا يرمي خطأً، بل يُسقط تلك الصفحة **بصمت** على الاحتياط النصّي.

     المكتبة مستضافة ذاتياً (لا CDN) وتُحمَّل كسولاً عند أول نقرة تصدير
     فقط — 881KB لا تُدفع أبداً بتحميل الصفحة.

     الاحتياط TSV لا CSV عمداً: درس هامبورغ الحيّ (ويندوز ألماني + WPS)
     أثبت أن اللغة تُقسّم على «؛» لا على الفاصلة، وأن التوجيه sep=, يُتجاهل
     بصمت. الجدولة بلا التباس لغوي بأي نظام. */
  (function () {

    var libP = null;
    function load() {
      if (window.XLSX) return Promise.resolve(window.XLSX);
      if (libP) return libP;
      libP = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = '/vendor/xlsx-0.18.5.full.min.js';
        s.onload  = function () { window.XLSX ? res(window.XLSX) : rej(new Error('XLSX missing after load')); };
        s.onerror = function () { libP = null; rej(new Error('xlsx load failed')); };
        document.head.appendChild(s);
      });
      return libP;
    }

    /* تاريخ حتمي لاتيني بالتوقيت المحلي: الفرز النصّي = الفرز الزمني.
       (toLocaleString('ar*') يُخرج أرقاماً هندية — نصٌّ بإكسل لا ينفرز
       ولا يُفلتر بعمود تاريخ، أي أن أهمّ ما يُفعل بجدول مُصدَّر يتعذّر.) */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function stamp(iso) {
      if (!iso) return '';
      var d = (iso instanceof Date) ? iso : new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
             ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function ymd(iso) {
      var s = stamp(iso || new Date());
      return s ? s.slice(0, 10) : '';
    }
    function today() { return ymd(new Date()); }

    function download(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    /* خلية TSV: الجدولة والأسطر تُستبدل بفراغ — لا مهرب لها بصيغة
       مفصولة بالجدولة، وإتلاف عمود واحد أهون من إتلاف الصف كله. */
    function tsvCell(v) {
      if (v === null || v === undefined) return '';
      return String(v).replace(/[\t\r\n]+/g, ' ');
    }

    /* البناء المشترك: كل مستهلك يمرّر عناوين وصفوفاً فقط، فيستحيل أن
       ينحرف سطحٌ عن آخر بالاتجاه أو التسمية أو صيغة الاحتياط.
       يرجّع 'xlsx' أو 'tsv' ليعرف المستدعي أي مسار جرى فعلاً. */
    /* v546: opts.sheets = [{ name, headers, rows, cols }] ⇒ مصنّفٌ بعدّة أوراق (المحاسبة)؛ بدونها ورقةٌ واحدة كما كانت. */
    function sheetName(n, used) {
      /* حدّ إكسل لاسم الورقة 31 محرفاً، والمحارف \ / ? * [ ] : ممنوعة، والاسمُ لا يتكرّر */
      var b = String(n || 'البيانات').replace(/[\\\/?*\[\]:]/g, '-').slice(0, 31) || 'ورقة', nm = b, k = 2;
      while (used[nm]) { nm = b.slice(0, 26) + ' (' + k + ')'; k++; }
      used[nm] = 1;
      return nm;
    }
    async function save(opts) {
      opts = opts || {};
      var base = opts.filename || ('sydent-' + today());
      var list = (Array.isArray(opts.sheets) && opts.sheets.length) ? opts.sheets
               : [{ name: opts.sheetName || 'البيانات', headers: opts.headers || [], rows: opts.rows || [], cols: opts.cols }];
      var aoas = list.map(function (sh) { var h = sh.headers || [], r = sh.rows || []; return h.length ? [h].concat(r) : r.slice(); });
      try {
        var X  = await load();
        var wb = X.utils.book_new(), used = {};
        list.forEach(function (sh, i) {
          var ws = X.utils.aoa_to_sheet(aoas[i]);
          if (sh.cols) ws['!cols'] = sh.cols;
          X.utils.book_append_sheet(wb, ws, sheetName(sh.name, used));
        });
        wb.Workbook = { Views: [{ RTL: true }] };
        X.writeFile(wb, base + '.xlsx');
        return 'xlsx';
      } catch (e) {
        if (window.console) console.warn('[SyDentXlsx] سقوط على الاحتياط النصّي:', e);
      }
      /* الاحتياطُ النصّي لعدّة أوراق: متتاليةٌ بملفٍّ واحد، كلٌّ بسطر عنوانٍ وسطرٍ فارغ قبله */
      var aoa = list.length === 1 ? aoas[0]
              : [].concat.apply([], aoas.map(function (x, i) { return (i ? [[]] : []).concat([['— ' + (list[i].name || '') + ' —']], x); }));
      /* الامتداد .tsv لا .csv: إكسل يفكّ الـcsv بفاصل اللغة (فاصلة أو
         فاصلة منقوطة) ولا ينشقّ على الجدولة أبداً — فالصفّ كلّه ينزل
         بخانة واحدة، ودرسُ هامبورغ يُهدَم من طرف الاسم بعد أن
         صين من طرف المحتوى. */
      var text = aoa.map(function (r) { return (r || []).map(tsvCell).join('\t'); }).join('\r\n');
      download(new Blob(['\uFEFF' + text], { type: 'text/tab-separated-values;charset=utf-8;' }),
               base + '.tsv');
      return 'tsv';
    }

    window.SyDentXlsx = {
      load:  load,
      save:  save,
      stamp: stamp,
      ymd:   ymd,
      today: today
    };
  })();

  window.SyDentPwd = {
    attach:    attachPwdToggle,
    attachAll: attachAllPwdToggles
  };


  // ── Public API ────────────────────────────────────────────────
  window.SyDentLock = {
    // state
    getRole: getRole,
    getDoctorId: getDoctorId,
    getEffectiveDoctorId: getEffectiveDoctorId,
    isOwner: isOwner,
    isDoctor: isDoctor,
    isSecretary: isSecretary,
    isDoctorAccountInactive: isDoctorAccountInactive,
    // Phase 5: per-employee identity
    getEmployeeId: getEmployeeId,
    loadEmployees: loadEmployees,
    loadDoctors: loadDoctors,
    invalidateEmployeesCache: invalidateEmployeesCache,
    ensureOwnerEmployee: ensureOwnerEmployee,
    getCurrentEmployee: getCurrentEmployee,
    // pin
    hashPin: hashPin,
    verifyPin: verifyPin,
    verifyEmployeePin: verifyEmployeePin,
    loadPinHash: loadPinHash,
    savePinHash: savePinHash,
    invalidatePinCache: invalidatePinCache,
    isPinSet: isPinSet,
    // hierarchy
    requirePin: requirePin,
    // rate limit
    isInCooldown: isInCooldown,
    cooldownSecondsLeft: cooldownSecondsLeft,
    resetFails: resetFails,
    // role transition
    applyRole: applyRole,
    // UI
    injectHeaderButton: injectHeaderButton,
    refreshHeaderButton: refreshHeaderButton,
    openSwitchModal: openSwitchModal,
    applyRoleGuards: applyRoleGuards,
    applyInactiveDoctorUI: applyInactiveDoctorUI,
    applyInactiveActionGuards: applyInactiveActionGuards,
    guardPage: guardPage,
    showBlockedScreen: showBlockedScreen,
    // Phase 5: audit log
    logAudit: logAudit,
    // constants (for UI consumers)
    ROLE_LABELS: ROLE_LABELS,
    ROLE_ICONS: ROLE_ICONS
  };

  // Fire-and-forget init (safe even if some pages don't want the button — guardPage runs first)
  autoInit();
})();

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6 K2.1 — SyDentColorPicker (shared color picker component)
// ═══════════════════════════════════════════════════════════════════════════
// A cross-platform color picker that replaces <input type="color">. The native
// HTML5 picker varies wildly by OS (tiny RGB-only on Windows Chrome/Brave vs.
// the gorgeous Grid/Spectrum/Sliders panel on iOS Safari). This component
// emulates the iOS panel everywhere — same tabs, same look, same behavior.
//
// Public API:
//   window.SyDentColorPicker.open(currentHex, callback)
//     • currentHex: '#RRGGBB' (sanitized; falls back to var(--green) on bad input)
//     • callback(newHex):    called with the confirmed color, or NOT called if
//                            the user cancels
//   window.SyDentColorPicker.injectDOM()  // idempotent; called automatically
//
// The picker DOM is injected once per page on first .open() call (lazy).
// Self-contained: CSS-in-JS, no external dependencies, no separate file.
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Sanitization helpers ────────────────────────────────────────────────
  function sanitizeHex(h) {
    // Only accept strings — numbers/objects/etc. fall back to default. This
    // protects against accidental sanitizeHex(123) returning '#112233' due to
    // the short-form expansion path.
    if (typeof h !== 'string') return '#0d8577';
    if (!h) return '#0d8577';
    var s = h.trim();
    if (s.charAt(0) !== '#') s = '#' + s;
    if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
      // Expand short form #abc → #aabbcc
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '#0d8577';
  }
  function hexToRgb(hex) {
    var h = sanitizeHex(hex).slice(1);
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16)
    };
  }
  function rgbToHex(r, g, b) {
    function c(v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + c(r) + c(g) + c(b);
  }
  // HSV ↔ RGB (used by Spectrum tab)
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    var c = v * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    var m = v - c;
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  // ── State (per-open invocation) ─────────────────────────────────────────
  var _isInjected = false;
  var _currentHex = '#0d8577';
  var _onConfirm = null;
  var _activeTab = 'grid'; // 'grid' | 'spectrum' | 'sliders'
  var _spectrumState = { h: 150, s: 0.8, v: 0.9 }; // synced from hex on open

  // ── Grid palette: 11 rows × 11 cols = 121 swatches ──────────────────────
  // Row 0 = grayscale ramp. Rows 1-10 = (hue, saturation/lightness) ramp.
  function buildGridSwatches() {
    var out = [];
    // Grayscale row
    for (var i = 0; i < 11; i++) {
      var v = 255 - Math.round(i * 25.5);
      out.push(rgbToHex(v, v, v));
    }
    // Color rows: hue varies by column, saturation/lightness varies by row
    var hues = [0, 20, 40, 60, 100, 160, 200, 240, 280, 320, 350];
    var levels = [
      { s: 0.85, v: 0.30 },
      { s: 0.85, v: 0.45 },
      { s: 0.90, v: 0.60 },
      { s: 0.95, v: 0.75 },
      { s: 1.00, v: 0.95 }, // most saturated bright
      { s: 0.70, v: 1.00 },
      { s: 0.50, v: 1.00 },
      { s: 0.35, v: 1.00 },
      { s: 0.22, v: 1.00 },
      { s: 0.12, v: 1.00 }
    ];
    for (var r = 0; r < levels.length; r++) {
      for (var c = 0; c < hues.length; c++) {
        var rgb = hsvToRgb(hues[c], levels[r].s, levels[r].v);
        out.push(rgbToHex(rgb.r, rgb.g, rgb.b));
      }
    }
    return out;
  }
  var _gridSwatches = null; // lazy

  // ── DOM injection (once per page) ───────────────────────────────────────
  function injectDOM() {
    if (_isInjected) return;
    _isInjected = true;

    // Inject CSS
    var style = document.createElement('style');
    style.id = 'sydent-color-picker-styles';
    style.textContent = [
      '#sydentCpOverlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);',
      '  display:none;align-items:flex-end;justify-content:center;z-index:10050;',
      '  -webkit-tap-highlight-color:transparent;}',
      '#sydentCpOverlay.open{display:flex;}',
      '#sydentCpOverlay .cp-sheet{background:var(--bg2,#0f1f35);',
      '  border:1px solid var(--border,#1e3556);border-radius:18px 18px 0 0;',
      '  width:100%;max-width:520px;max-height:88vh;overflow-y:auto;',
      '  padding:16px 18px 22px;direction:rtl;font-family:"Cairo",sans-serif;',
      '  color:var(--text,#e7eef9);box-shadow:0 -8px 32px rgba(0,0,0,0.5);}',
      '@media(min-width:640px){#sydentCpOverlay{align-items:center;}',
      '  #sydentCpOverlay .cp-sheet{border-radius:18px;margin:auto;}}',
      '#sydentCpOverlay .cp-header{display:flex;align-items:center;',
      '  justify-content:space-between;margin-bottom:14px;}',
      '#sydentCpOverlay .cp-title{font-weight:800;font-size:16px;}',
      '#sydentCpOverlay .cp-close{width:32px;height:32px;border-radius:50%;',
      '  background:rgba(255,255,255,0.08);border:none;color:var(--text);',
      '  font-size:18px;cursor:pointer;display:flex;align-items:center;',
      '  justify-content:center;line-height:1;}',
      '#sydentCpOverlay .cp-close:hover{background:rgba(255,255,255,0.14);}',
      '#sydentCpOverlay .cp-tabs{display:flex;background:rgba(255,255,255,0.04);',
      '  border-radius:10px;padding:3px;margin-bottom:14px;}',
      '#sydentCpOverlay .cp-tab{flex:1;padding:8px 12px;text-align:center;',
      '  font-size:13px;font-weight:700;cursor:pointer;border-radius:8px;',
      '  color:var(--text2,#8da0bd);transition:all .15s;border:none;',
      '  background:transparent;font-family:inherit;}',
      '#sydentCpOverlay .cp-tab.active{background:rgba(255,255,255,0.10);',
      '  color:var(--text);}',
      '#sydentCpOverlay .cp-panel{display:none;}',
      '#sydentCpOverlay .cp-panel.active{display:block;}',
      // Grid tab
      '#sydentCpOverlay .cp-grid{display:grid;grid-template-columns:repeat(11,1fr);',
      '  gap:4px;}',
      '#sydentCpOverlay .cp-swatch{aspect-ratio:1;border-radius:6px;cursor:pointer;',
      '  border:2px solid transparent;transition:transform .1s;}',
      '#sydentCpOverlay .cp-swatch:hover{transform:scale(1.12);}',
      '#sydentCpOverlay .cp-swatch.selected{border-color:#fff;',
      '  box-shadow:0 0 0 2px var(--bg2,#0f1f35),0 0 0 4px var(--green,var(--green));}',
      // Spectrum tab
      '#sydentCpOverlay .cp-spectrum{position:relative;width:100%;aspect-ratio:1.6;',
      '  border-radius:12px;overflow:hidden;cursor:crosshair;',
      '  touch-action:none;user-select:none;}',
      '#sydentCpOverlay .cp-spectrum-canvas{width:100%;height:100%;display:block;}',
      '#sydentCpOverlay .cp-spectrum-dot{position:absolute;width:18px;height:18px;',
      '  border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.4),',
      '  0 2px 6px rgba(0,0,0,0.4);transform:translate(-50%,-50%);pointer-events:none;}',
      // Sliders tab
      '#sydentCpOverlay .cp-slider-row{margin-bottom:14px;}',
      '#sydentCpOverlay .cp-slider-label{display:flex;justify-content:space-between;',
      '  align-items:center;font-size:11px;font-weight:800;letter-spacing:0.5px;',
      '  color:var(--text2,#8da0bd);margin-bottom:6px;}',
      '#sydentCpOverlay .cp-slider-value{background:rgba(255,255,255,0.06);',
      '  padding:3px 10px;border-radius:6px;font-size:13px;color:var(--text);',
      '  min-width:42px;text-align:center;font-weight:700;}',
      '#sydentCpOverlay .cp-slider{width:100%;height:32px;border-radius:16px;',
      '  appearance:none;-webkit-appearance:none;outline:none;cursor:pointer;}',
      '#sydentCpOverlay .cp-slider::-webkit-slider-thumb{appearance:none;',
      '  -webkit-appearance:none;width:24px;height:24px;border-radius:50%;',
      '  background:#fff;border:3px solid rgba(0,0,0,0.15);cursor:pointer;',
      '  box-shadow:0 2px 6px rgba(0,0,0,0.3);}',
      '#sydentCpOverlay .cp-slider::-moz-range-thumb{width:24px;height:24px;',
      '  border-radius:50%;background:#fff;border:3px solid rgba(0,0,0,0.15);',
      '  cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);}',
      // Footer (preview + hex + buttons)
      '#sydentCpOverlay .cp-footer{margin-top:18px;padding-top:14px;',
      '  border-top:1px solid var(--border,#1e3556);}',
      '#sydentCpOverlay .cp-preview-row{display:flex;align-items:center;gap:12px;',
      '  margin-bottom:14px;}',
      '#sydentCpOverlay .cp-preview-swatch{width:54px;height:54px;border-radius:12px;',
      '  border:2px solid rgba(255,255,255,0.15);flex-shrink:0;}',
      '#sydentCpOverlay .cp-hex-wrap{flex:1;}',
      '#sydentCpOverlay .cp-hex-label{font-size:11px;font-weight:700;',
      '  color:var(--text2);margin-bottom:4px;letter-spacing:0.5px;}',
      '#sydentCpOverlay .cp-hex-input{width:100%;background:rgba(255,255,255,0.06);',
      '  border:1px solid var(--border);border-radius:8px;padding:8px 12px;',
      '  color:var(--text);font-family:"Courier New",monospace;font-size:14px;',
      '  font-weight:700;text-transform:uppercase;letter-spacing:1px;',
      '  direction:ltr;text-align:left;}',
      '#sydentCpOverlay .cp-hex-input:focus{outline:none;border-color:var(--green);}',
      '#sydentCpOverlay .cp-actions{display:flex;gap:10px;}',
      '#sydentCpOverlay .cp-btn{flex:1;padding:11px;border-radius:10px;border:none;',
      '  font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;',
      '  transition:opacity .15s;}',
      '#sydentCpOverlay .cp-btn:hover{opacity:0.85;}',
      '#sydentCpOverlay .cp-btn-cancel{background:rgba(255,255,255,0.08);',
      '  color:var(--text2);}',
      '#sydentCpOverlay .cp-btn-confirm{background:var(--green,var(--green));',
      '  color:#0a1628;}'
    ].join('\n');
    document.head.appendChild(style);

    // Inject HTML
    var overlay = document.createElement('div');
    overlay.id = 'sydentCpOverlay';
    overlay.innerHTML = [
      '<div class="cp-sheet" role="dialog" aria-modal="true" aria-labelledby="sydentCpTitle">',
      '  <div class="cp-header">',
      '    <div class="cp-title" id="sydentCpTitle">اختيار اللون</div>',
      '    <button type="button" class="cp-close" aria-label="إغلاق" id="sydentCpClose">×</button>',
      '  </div>',
      '  <div class="cp-tabs">',
      '    <button type="button" class="cp-tab active" data-tab="grid">شبكة</button>',
      '    <button type="button" class="cp-tab" data-tab="spectrum">طيف</button>',
      '    <button type="button" class="cp-tab" data-tab="sliders">شرائح</button>',
      '  </div>',
      '  <div class="cp-panel active" data-panel="grid">',
      '    <div class="cp-grid" id="sydentCpGrid"></div>',
      '  </div>',
      '  <div class="cp-panel" data-panel="spectrum">',
      '    <div class="cp-spectrum" id="sydentCpSpectrum">',
      '      <canvas class="cp-spectrum-canvas" id="sydentCpSpectrumCanvas" width="320" height="200"></canvas>',
      '      <div class="cp-spectrum-dot" id="sydentCpSpectrumDot"></div>',
      '    </div>',
      '  </div>',
      '  <div class="cp-panel" data-panel="sliders">',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>RED</span><span class="cp-slider-value" id="sydentCpRedVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpRed" min="0" max="255" value="0" aria-label="Red">',
      '    </div>',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>GREEN</span><span class="cp-slider-value" id="sydentCpGreenVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpGreen" min="0" max="255" value="0" aria-label="Green">',
      '    </div>',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>BLUE</span><span class="cp-slider-value" id="sydentCpBlueVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpBlue" min="0" max="255" value="0" aria-label="Blue">',
      '    </div>',
      '  </div>',
      '  <div class="cp-footer">',
      '    <div class="cp-preview-row">',
      '      <div class="cp-preview-swatch" id="sydentCpPreview"></div>',
      '      <div class="cp-hex-wrap">',
      '        <div class="cp-hex-label">sRGB Hex Colour #</div>',
      '        <input type="text" class="cp-hex-input" id="sydentCpHex" maxlength="7" autocomplete="off" spellcheck="false">',
      '      </div>',
      '    </div>',
      '    <div class="cp-actions">',
      '      <button type="button" class="cp-btn cp-btn-cancel" id="sydentCpCancel">إلغاء</button>',
      '      <button type="button" class="cp-btn cp-btn-confirm" id="sydentCpConfirm">✓ اختيار</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    // Wire up events
    document.getElementById('sydentCpClose').addEventListener('click', close);
    document.getElementById('sydentCpCancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
    document.getElementById('sydentCpConfirm').addEventListener('click', confirm);
    /* v454: منتقي الألوان ورقةٌ سفلية بتصميمها الخاص (تبويبات + عجلة)، فتبقى
       خارج إطار العُدّة — لكنها تكسب سلوكَها: Escape يغلقها وقفلُ تمرير الخلفية
       يمنع انزلاقَ الصفحة تحتها. (اختيارٌ بلا بياناتٍ مكتوبة ⇒ النقرُ الخارجي يغلق.) */
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && overlay.classList.contains('open')) {
        if (e.defaultPrevented) return;
        e.preventDefault();
        close();
      }
    });

    // Tab switching
    var tabs = overlay.querySelectorAll('.cp-tab');
    for (var ti = 0; ti < tabs.length; ti++) {
      tabs[ti].addEventListener('click', function(e) {
        switchTab(e.currentTarget.getAttribute('data-tab'));
      });
    }

    // Sliders
    var rEl = document.getElementById('sydentCpRed');
    var gEl = document.getElementById('sydentCpGreen');
    var bEl = document.getElementById('sydentCpBlue');
    function onSliderInput() {
      var r = parseInt(rEl.value, 10);
      var g = parseInt(gEl.value, 10);
      var b = parseInt(bEl.value, 10);
      _currentHex = rgbToHex(r, g, b);
      _spectrumState = rgbToHsv(r, g, b);
      // Avoid recursive feedback: sync UI without triggering input events
      syncSlidersUI();
      syncHexInput();
      syncPreview();
      syncGridSelection();
      drawSpectrumDot(); // dot only; canvas doesn't need redraw on slider change
    }
    rEl.addEventListener('input', onSliderInput);
    gEl.addEventListener('input', onSliderInput);
    bEl.addEventListener('input', onSliderInput);

    // Hex input
    var hexEl = document.getElementById('sydentCpHex');
    hexEl.addEventListener('input', function() {
      var v = hexEl.value.trim();
      // Allow user to type without # — auto-add it
      if (v.length > 0 && v.charAt(0) !== '#') v = '#' + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        _currentHex = v.toLowerCase();
        var rgb = hexToRgb(_currentHex);
        _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
        syncSlidersUI();
        syncPreview();
        syncGridSelection();
        drawSpectrumDot();
      }
    });
    hexEl.addEventListener('blur', function() {
      // On blur, normalize the field to the current sanitized value
      hexEl.value = _currentHex.toUpperCase();
    });

    // Spectrum interaction (mouse + touch)
    var spectrumEl = document.getElementById('sydentCpSpectrum');
    function spectrumPick(clientX, clientY) {
      var rect = spectrumEl.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      var h = (x / rect.width) * 360;
      // y maps to (saturation, value) in a perceptually pleasant way:
      //   top → white-ish (s low, v high)
      //   middle → fully saturated
      //   bottom → dark
      var ny = y / rect.height; // 0..1
      var s, v;
      if (ny < 0.5) {
        // Top half: s goes 0 → 1, v stays 1
        s = ny * 2;
        v = 1;
      } else {
        // Bottom half: s stays 1, v goes 1 → 0
        s = 1;
        v = 1 - (ny - 0.5) * 2;
      }
      _spectrumState = { h: h, s: s, v: v };
      var rgb = hsvToRgb(h, s, v);
      _currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
      syncSlidersUI();
      syncHexInput();
      syncPreview();
      syncGridSelection();
      drawSpectrumDot();
    }
    var _dragging = false;
    spectrumEl.addEventListener('mousedown', function(e) {
      _dragging = true; spectrumPick(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function(e) {
      if (_dragging) spectrumPick(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function() { _dragging = false; });
    spectrumEl.addEventListener('touchstart', function(e) {
      if (e.touches.length) {
        e.preventDefault();
        spectrumPick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    spectrumEl.addEventListener('touchmove', function(e) {
      if (e.touches.length) {
        e.preventDefault();
        spectrumPick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    // Render grid swatches (lazy build once)
    if (!_gridSwatches) _gridSwatches = buildGridSwatches();
    var gridEl = document.getElementById('sydentCpGrid');
    var html = '';
    for (var i = 0; i < _gridSwatches.length; i++) {
      var c = _gridSwatches[i];
      html += '<div class="cp-swatch" data-color="' + c + '" style="background:' + c + ';" role="button" aria-label="' + c + '"></div>';
    }
    gridEl.innerHTML = html;
    // Delegated click handler
    gridEl.addEventListener('click', function(e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('cp-swatch')) {
        var col = t.getAttribute('data-color');
        if (col) {
          _currentHex = col;
          var rgb = hexToRgb(col);
          _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
          syncSlidersUI();
          syncHexInput();
          syncPreview();
          syncGridSelection();
          drawSpectrumDot();
        }
      }
    });

    // Render spectrum canvas once (it's static — only the dot moves)
    drawSpectrumCanvas();
  }

  // ── Render helpers ──────────────────────────────────────────────────────
  function drawSpectrumCanvas() {
    var canvas = document.getElementById('sydentCpSpectrumCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    // Horizontal hue gradient (left → right: 0 → 360)
    var img = ctx.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      var ny = y / H;
      var s, v;
      if (ny < 0.5) { s = ny * 2; v = 1; }
      else { s = 1; v = 1 - (ny - 0.5) * 2; }
      for (var x = 0; x < W; x++) {
        var h = (x / W) * 360;
        var rgb = hsvToRgb(h, s, v);
        var idx = (y * W + x) * 4;
        img.data[idx]     = rgb.r;
        img.data[idx + 1] = rgb.g;
        img.data[idx + 2] = rgb.b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function drawSpectrumDot() {
    var dot = document.getElementById('sydentCpSpectrumDot');
    if (!dot) return;
    // Convert HSV state to (x%, y%)
    var x = (_spectrumState.h / 360) * 100;
    var s = _spectrumState.s, v = _spectrumState.v;
    var ny;
    if (v >= 1 - 1e-6) {
      // On top half: s ∈ [0,1] → ny ∈ [0, 0.5]
      ny = s * 0.5;
    } else {
      // On bottom half: v ∈ [0,1] → ny ∈ [1, 0.5]
      ny = 0.5 + (1 - v) * 0.5;
    }
    dot.style.left = x + '%';
    dot.style.top = (ny * 100) + '%';
  }
  function syncSlidersUI() {
    var rgb = hexToRgb(_currentHex);
    document.getElementById('sydentCpRed').value = rgb.r;
    document.getElementById('sydentCpGreen').value = rgb.g;
    document.getElementById('sydentCpBlue').value = rgb.b;
    document.getElementById('sydentCpRedVal').textContent = rgb.r;
    document.getElementById('sydentCpGreenVal').textContent = rgb.g;
    document.getElementById('sydentCpBlueVal').textContent = rgb.b;
    // Color the slider tracks so they look like the iOS gradient sliders
    var rTrack = 'linear-gradient(to right, ' + rgbToHex(0, rgb.g, rgb.b) + ', ' + rgbToHex(255, rgb.g, rgb.b) + ')';
    var gTrack = 'linear-gradient(to right, ' + rgbToHex(rgb.r, 0, rgb.b) + ', ' + rgbToHex(rgb.r, 255, rgb.b) + ')';
    var bTrack = 'linear-gradient(to right, ' + rgbToHex(rgb.r, rgb.g, 0) + ', ' + rgbToHex(rgb.r, rgb.g, 255) + ')';
    document.getElementById('sydentCpRed').style.background = rTrack;
    document.getElementById('sydentCpGreen').style.background = gTrack;
    document.getElementById('sydentCpBlue').style.background = bTrack;
  }
  function syncHexInput() {
    var el = document.getElementById('sydentCpHex');
    // Only update if not focused (so user typing isn't disturbed)
    if (document.activeElement !== el) el.value = _currentHex.toUpperCase();
  }
  function syncPreview() {
    document.getElementById('sydentCpPreview').style.background = _currentHex;
  }
  function syncGridSelection() {
    var grid = document.getElementById('sydentCpGrid');
    if (!grid) return;
    var swatches = grid.querySelectorAll('.cp-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var c = swatches[i].getAttribute('data-color');
      if (c && c.toLowerCase() === _currentHex.toLowerCase()) {
        swatches[i].classList.add('selected');
      } else {
        swatches[i].classList.remove('selected');
      }
    }
  }
  function switchTab(name) {
    _activeTab = name;
    var tabs = document.querySelectorAll('#sydentCpOverlay .cp-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-tab') === name) tabs[i].classList.add('active');
      else tabs[i].classList.remove('active');
    }
    var panels = document.querySelectorAll('#sydentCpOverlay .cp-panel');
    for (var j = 0; j < panels.length; j++) {
      if (panels[j].getAttribute('data-panel') === name) panels[j].classList.add('active');
      else panels[j].classList.remove('active');
    }
    // Sync the active panel UI to current state
    if (name === 'spectrum') drawSpectrumDot();
    if (name === 'sliders') syncSlidersUI();
  }

  // ── Public API ──────────────────────────────────────────────────────────
  function open(currentHex, callback) {
    injectDOM();
    _currentHex = sanitizeHex(currentHex);
    _onConfirm = typeof callback === 'function' ? callback : null;
    var rgb = hexToRgb(_currentHex);
    _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // Sync all panels to incoming hex
    syncSlidersUI();
    syncHexInput();
    syncPreview();
    syncGridSelection();
    drawSpectrumDot();
    switchTab('grid');
    document.getElementById('sydentCpOverlay').classList.add('open');
    document.body.classList.add('sy-modal-lock');   /* v454: قفلُ تمرير الخلفية */
    // Defer focus so the overlay finishes painting first
    setTimeout(function() {
      var hexInput = document.getElementById('sydentCpHex');
      if (hexInput) hexInput.value = _currentHex.toUpperCase();
    }, 30);
  }
  function close() {
    var overlay = document.getElementById('sydentCpOverlay');
    if (overlay) overlay.classList.remove('open');
    /* v454: لا يُرفع القفلُ إن كانت نافذةٌ أخرى ما تزال مفتوحةً تحته. */
    if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
    _onConfirm = null; // user cancelled — drop the callback
  }
  function confirm() {
    var cb = _onConfirm;
    var hex = _currentHex;
    close();
    // Fire the callback AFTER closing so any UI updates the consumer triggers
    // (e.g. updating a swatch) don't compete with the overlay closing animation.
    if (cb) {
      try { cb(hex); } catch (e) { console.error('SyDentColorPicker callback error:', e); }
    }
  }

  window.SyDentColorPicker = {
    open: open,
    injectDOM: injectDOM,
    // Expose helpers in case consumers need them
    sanitizeHex: sanitizeHex
  };
})();

/* ============================================================
   Phase 9 — Patient Documents & Imaging  (shared helper)
   Single source of truth for Supabase Storage I/O used by
   patient-profile.html (files tab) + appointments.html (modal).
   Bucket: patient-files (private). Path: {owner_id}/{patient_id}/{uuid}-{name}
   so storage RLS (foldername[1] = auth.uid()) isolates each tenant.
   Rule #68: consolidate repeated query patterns into window.SyDent* namespace.
   ============================================================ */
(function(){
  'use strict';
  var BUCKET = 'patient-files';
  var CAT_LABELS = {
    xray:           '🦷 أشعة',
    clinical_photo: '📷 صورة سريرية',
    document:       '📄 مستند',
    receipt:        '🧾 إيصال',
    other:          '📎 أخرى'
  };

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8); return v.toString(16);
    });
  }

  // مفتاح التخزين فقط (لا الاسم المعروض): Supabase Storage يرفض أي محرف خارج
  // ASCII بـ«Invalid key» (isValidKey بـstorage-api: \w بلا علم u) — فكان كل ملفٍ
  // اسمُه عربي يفشل رفعُه (تبويب الملفات · نافذة الموعد · مسودة المخطط؛ v343).
  // الاسم العربي يبقى كما هو بعمود file_name (العرض والتنزيل)، والمفتاح يحمل
  // uuid فريداً قبله فلا تصادم حتى لو صار الجزء المقروء 'file'.
  function sanitizeName(name){
    name = String(name || 'file');
    var dot  = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext  = dot > 0 ? name.slice(dot)    : '';
    base = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_{2,}/g, '_')
               .replace(/^[_-]+|[_-]+$/g, '').slice(0, 60) || 'file';
    ext  = ext.replace(/[^.A-Za-z0-9]+/g, '').slice(0, 8);
    if (!/^\.[A-Za-z0-9]+$/.test(ext)) ext = '';
    return base + ext;
  }

  function isImage(m){ return /^image\//.test(m || ''); }

  // Client-side compression. Returns a Blob for large raster images, else the
  // original File untouched (PDFs always pass through). Never enlarges a file.
  async function compressImage(file){
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    if (file.size < 400 * 1024) return file;
    try {
      var bmp   = await createImageBitmap(file);
      var maxD  = 1800;
      var scale = Math.min(1, maxD / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      var blob = await new Promise(function(res){ canvas.toBlob(res, 'image/jpeg', 0.85); });
      return (blob && blob.size < file.size) ? blob : file;
    } catch (e){ console.warn('[SyDentFiles] compress failed, using original', e); return file; }
  }

  async function ownerId(){
    try { var u = (await window.sb.auth.getUser()).data.user; return u ? u.id : null; }
    catch(e){ return null; }
  }

  // opts: { appointmentId, category, note, toothNum, sessionId, labOrderId (M162) }
  async function upload(patientId, file, opts){
    opts = opts || {};
    if (!window.sb)   return { ok:false, reason:'no-sb' };
    if (!patientId)   return { ok:false, reason:'no-patient' };
    var oid = await ownerId();
    if (!oid)         return { ok:false, reason:'no-owner' };

    var body = await compressImage(file);
    var mime = (body && body.type) || file.type || 'application/octet-stream';
    var displayName = file.name || ('ملف-' + Date.now());
    var storeName   = sanitizeName(displayName);
    // If compression transcoded to JPEG, keep the stored extension honest.
    if (body !== file && /image\/jpeg/.test(mime) && !/\.jpe?g$/i.test(storeName)) {
      storeName = storeName.replace(/\.[^.]+$/, '') + '.jpg';
    }
    var path = oid + '/' + patientId + '/' + uuid() + '-' + storeName;

    var up = await window.sb.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert:false });
    if (up.error) return { ok:false, reason:'storage', error:up.error };

    var docRow = {
      owner_id:       oid,
      patient_id:     patientId,
      appointment_id: opts.appointmentId || null,
      storage_path:   path,
      file_name:      displayName,
      mime_type:      mime,
      size_bytes:     (body && body.size) || file.size || null,
      category:       opts.category || 'other',
      note:           opts.note || null,
      uploaded_by:    oid,
      tooth_num:      opts.toothNum || null,   // P2 (Migration 55): link image/doc to a specific tooth
      session_id:     opts.sessionId || null   // P2 (Migration 55): optional link to a ledger session
    };
    if (opts.labOrderId) docRow.lab_order_id = opts.labOrderId;   // M162: مرفقُ طلب مخبر (يُكتب فقط حين يُطلب)

    var ins = await window.sb.from('patient_documents').insert(docRow).select().single();

    // Graceful pre-Migration-55 fallback: if tooth_num/session_id columns are not
    // present yet (PGRST204 = column missing from schema cache), retry the insert
    // without them so file upload NEVER breaks before the migration is applied.
    // Parity with the account_adjustments graceful fallback pattern (v70).
    if (ins.error && (ins.error.code === 'PGRST204' ||
        /tooth_num|session_id/i.test(ins.error.message || ''))) {
      delete docRow.tooth_num;
      delete docRow.session_id;
      ins = await window.sb.from('patient_documents').insert(docRow).select().single();
    }

    if (ins.error) {
      // Roll back the orphaned object so storage never drifts from the table.
      try { await window.sb.storage.from(BUCKET).remove([path]); } catch(e){}
      return { ok:false, reason:'db', error:ins.error };
    }
    return { ok:true, row: ins.data };
  }

  // opts: { appointmentId }  → scope to one appointment's files
  async function list(patientId, opts){
    opts = opts || {};
    if (!window.sb || !patientId) return [];
    var q = window.sb.from('patient_documents').select('*')
              .eq('patient_id', patientId).order('created_at', { ascending:false });
    if (opts.appointmentId) q = q.eq('appointment_id', opts.appointmentId);
    var res = await q;
    return res.error ? [] : (res.data || []);
  }

  async function countFor(patientId){
    if (!window.sb || !patientId) return 0;
    var res = await window.sb.from('patient_documents')
                .select('id', { count:'exact', head:true }).eq('patient_id', patientId);
    return res.error ? 0 : (res.count || 0);
  }

  async function signedUrls(paths, expiry){
    if (!window.sb || !paths || !paths.length) return {};
    var res = await window.sb.storage.from(BUCKET).createSignedUrls(paths, expiry || 3600);
    var map = {};
    if (!res.error && res.data) res.data.forEach(function(d){ if (d.signedUrl) map[d.path] = d.signedUrl; });
    return map;
  }

  async function signedUrl(path, expiry){
    if (!window.sb || !path) return null;
    var res = await window.sb.storage.from(BUCKET).createSignedUrl(path, expiry || 3600);
    return res.error ? null : ((res.data && res.data.signedUrl) || null);
  }

  // Storage object removed first, then the row — a row never silently points
  // at a missing file. Non-fatal storage error still proceeds to row delete.
  async function remove(row){
    if (!window.sb || !row) return { ok:false, reason:'no-row' };
    try { await window.sb.storage.from(BUCKET).remove([row.storage_path]); } catch(e){}
    var del = await window.sb.from('patient_documents').delete().eq('id', row.id);
    return { ok: !del.error, error: del.error };
  }

  function humanSize(bytes){
    bytes = Number(bytes || 0);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
  }

  // M140 — purgeOwner: يمسح كل ملفات المستأجر الحالي من التخزين قبل حذف
  // الحساب من الإعدادات. التخطيط <uid>/<patient_id>/<file> (مستويان)؛ RLS
  // pf_delete_own تسمح للمالك بحذف مجلده. الحذف على دفعات 100. يُرجع
  // { ok, removed, failed } — أي فشل جزئي يُعلَن لا يُبلع (لا يُحذف الحساب
  // فوق ملفات باقية بصمت). صفر ملفات = نجاح.
  async function purgeOwner(uid, expected){
    if (!window.sb || !uid) return { ok:false, removed:0, failed:0, reason:'no-uid' };
    var st = window.sb.storage.from(BUCKET);
    var paths = [];
    try {
      var top = await st.list(uid, { limit: 1000 });
      if (top.error) return { ok:false, removed:0, failed:0, reason: top.error.message };
      var dirs = (top.data || []);
      for (var i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        if (d.id) { paths.push(uid + '/' + d.name); continue; }   // file at top level (legacy)
        var sub = await st.list(uid + '/' + d.name, { limit: 1000 });
        if (sub.error) return { ok:false, removed:0, failed:0, reason: sub.error.message };
        (sub.data || []).forEach(function(f){ if (f.id) paths.push(uid + '/' + d.name + '/' + f.name); });
      }
    } catch(e) { return { ok:false, removed:0, failed:0, reason: (e && e.message) || 'list_failed' }; }
    // M142: القائمة تحت RLS قد تعود ناقصة بلا خطأ — إن عرفنا العددَ الحقيقي من القاعدة
    // فقائمةٌ أقصر منه تُوقف المحوَ قبل حذف أي ملف.
    if (typeof expected === 'number' && paths.length < expected) {
      return { ok:false, removed:0, failed:0, reason:'list_incomplete', listed: paths.length, expected: expected };
    }
    var removed = 0, failed = 0;
    for (var j = 0; j < paths.length; j += 100) {
      var batch = paths.slice(j, j + 100);
      try {
        var r = await st.remove(batch);
        if (r.error) failed += batch.length; else removed += batch.length;
      } catch(e) { failed += batch.length; }
    }
    return { ok: failed === 0, removed: removed, failed: failed };
  }

  window.SyDentFiles = {
    BUCKET: BUCKET, CAT_LABELS: CAT_LABELS,
    upload: upload, list: list, countFor: countFor,
    signedUrl: signedUrl, signedUrls: signedUrls,
    remove: remove, purgeOwner: purgeOwner, compressImage: compressImage,
    isImage: isImage, humanSize: humanSize
  };
})();

/* ─────────────────────────────────────────────────────────────────────────
   SyDent — Offline / connectivity banner (self-contained, additive).
   Lets a clinic user tell "no internet" apart from "no data" by showing a
   slim banner when the device goes offline, auto-hiding when it returns.
   Touches no load/financial logic; pure navigator.onLine + online/offline.
   Fully guarded + idempotent — cannot break page behaviour.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__sydentNetBanner) return;            // idempotent guard
  window.__sydentNetBanner = true;

  var BAR_ID = 'sydent-net-banner';
  var STYLE_ID = 'sydent-net-banner-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '#' + BAR_ID + '{position:fixed;top:0;left:0;right:0;z-index:2147483000;' +
      'display:none;direction:rtl;font-family:inherit;font-size:14px;font-weight:600;' +
      'line-height:1.4;text-align:center;padding:8px 14px;color:#fff;' +
      'background:#c0392b;box-shadow:0 2px 8px rgba(0,0,0,.25);}';
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    ensureStyle();
    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.textContent =
      '\u26A0\uFE0F \u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A \u2014 ' +
      '\u0628\u0639\u0636 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0642\u062F \u0644\u0627 \u062A\u0638\u0647\u0631 \u062D\u062A\u0649 \u064A\u0639\u0648\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644';
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function show() { try { ensureBar().style.display = 'block'; } catch (e) {} }
  function hide() { try { var b = document.getElementById(BAR_ID); if (b) b.style.display = 'none'; } catch (e) {} }
  function sync() { try { if (navigator && navigator.onLine === false) show(); else hide(); } catch (e) {} }

  function init() {
    try {
      window.addEventListener('online', hide);
      window.addEventListener('offline', show);
      sync();                                       // initial state on load
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SyDentNet = { show: show, hide: hide, sync: sync };
})();

/* ══ SyDentAccountDelete:begin ══ (M142)
   مسارُ حذف الحساب نهائياً — مصدرٌ واحد للإعدادات وصفحة الاشتراك.
   الترتيب (لا يُحذف شيءٌ قبل نجاح ما قبله):
     1) إعادةُ التحقق بكلمة المرور (+ Turnstile)
     2) begin_account_wipe — نافذة 15 دقيقة يرى فيها الحسابُ المحجوب ملفاتِه ويحذفها
     3) العددُ الحقيقي من القاعدة → محوُ الملفات بشرط قائمةٍ كاملة → العددُ بعدها = صفر
     4) حذفٌ صريح للجداول الرئيسية حين يكون الحساب كاملاً فقط (غيره لا يكتب — RLS)
     5) delete_my_account — يمسح الباقي بالتسلسل (M140)، ثم تسجيل الخروج
   أيُّ فشلٍ بالخطوات 1–3 يعيد { ok:false, stage } ولم يُحذف من البيانات شيء
   (عدا ملفاتٍ حُذفت فعلاً إن فشلت الخطوة 3 بعد المحو — تُذكر بالرسالة).
   الواجهة (نافذة التأكيد والتوست والتحويل) مسؤوليةُ الصفحة. */
window.SyDentAccountDelete = (function () {
  'use strict';
  async function tryDelete(table, key, value, failures) {
    try {
      var res = await window.sb.from(table).delete().eq(key, value);
      if (res.error) { console.warn('wipe: ' + table + ' delete failed:', res.error); failures.push(table); }
    } catch (e) { console.warn('wipe: ' + table + ' delete threw:', e); failures.push(table); }
  }
  async function storageCount() {
    var r = await window.sb.rpc('my_storage_object_count');
    if (r.error || typeof r.data !== 'number') throw new Error((r.error && r.error.message) || 'count_failed');
    return r.data;
  }
  async function run(opts) {
    opts = opts || {};
    var sb = window.sb;
    if (!sb) return { ok: false, stage: 'init', message: 'الجلسة غير جاهزة — أعد تحميل الصفحة' };
    var ures = await sb.auth.getUser();
    var user = ures && ures.data && ures.data.user;
    if (!user) return { ok: false, stage: 'init', message: 'انتهت الجلسة — سجّل الدخول من جديد' };
    // 1) كلمة المرور
    var au = await sb.auth.signInWithPassword({ email: user.email, password: opts.password || '', options: { captchaToken: opts.captchaToken || '' } });
    if (au.error) {
      var cap = /captcha/i.test(au.error.message || '');
      return { ok: false, stage: 'auth', captcha: cap, message: cap ? 'تعذّر التحقق من الحماية، أعد المحاولة' : 'كلمة المرور غير صحيحة' };
    }
    var uid = user.id;
    // 2) نافذة المحو
    var w = await sb.rpc('begin_account_wipe');
    if (w.error) return { ok: false, stage: 'window', message: 'تعذّر بدء الحذف (' + (w.error.message || 'خطأ') + ') — لم يُحذف شيء، أعد المحاولة' };
    // 3) الملفات: عددٌ حقيقي → محوٌ بقائمةٍ كاملة → صفر
    var sub = window.SyDentSub;
    if (sub) sub.setWipe(true);
    try {
      var before;
      try { before = await storageCount(); }
      catch (e) { return { ok: false, stage: 'files', message: 'تعذّر عدّ ملفات المرضى — لم يُحذف شيء، أعد المحاولة' }; }
      if (before > 0) {
        if (!window.SyDentFiles || typeof window.SyDentFiles.purgeOwner !== 'function') {
          return { ok: false, stage: 'files', message: 'وحدة الملفات غير محمّلة — لم يُحذف شيء، أعد تحميل الصفحة' };
        }
        var pr = await window.SyDentFiles.purgeOwner(uid, before);
        if (!pr.ok) {
          var why = pr.reason === 'list_incomplete' ? ('القائمة ناقصة ' + pr.listed + ' من ' + pr.expected) : (pr.reason || (pr.failed + ' ملف'));
          return { ok: false, stage: 'files', message: 'تعذّر حذف ملفات المرضى من التخزين (' + why + ') — لم يُحذف الحساب، أعد المحاولة' };
        }
      }
      var after;
      try { after = await storageCount(); }
      catch (e) { return { ok: false, stage: 'files', message: 'تعذّر التحقق من حذف الملفات — لم يُحذف الحساب، أعد المحاولة' }; }
      if (after !== 0) return { ok: false, stage: 'files', message: 'بقي ' + after + ' ملف بالتخزين — لم يُحذف الحساب، أعد المحاولة' };
    } finally {
      if (sub) sub.setWipe(false);
    }
    // 4) الجداول الرئيسية — للحساب الكامل وحده
    var failures = [];
    var lvl = sub ? sub.level() : null;
    if (!lvl || lvl === 'full') {
      await tryDelete('teeth_status',    'doctor_id', uid, failures);
      await tryDelete('ledger_payments', 'doctor_id', uid, failures);
      await tryDelete('ledger_sessions', 'doctor_id', uid, failures);
      await tryDelete('appointments',    'doctor_id', uid, failures);
      await tryDelete('patients',        'doctor_id', uid, failures);
    }
    // 5) الحساب نفسه
    var del = await sb.rpc('delete_my_account');
    try { await sb.auth.signOut(); } catch (e) {}
    if (del.error) {
      console.error('RPC delete error:', del.error);
      return { ok: true, pendingAccount: true, failures: failures };
    }
    return { ok: true, pendingAccount: false, failures: failures };
  }
  return { run: run };
})();
/* ══ SyDentAccountDelete:end ══ */

/* ─────────────────────────────────────────────────────────────────────────
   SyDent Offline — توصيل التصريف + شارة المزامنة (PWA Phase 2)
   يصرّف طابور المواعيد المكتوبة offline عند عودة النت (حدث online + بعد
   التحميل + دورياً كل 60ث ما دام في معلّق) ويعرض شارة كهرمانية «⏳ بانتظار
   المزامنة: N». الترويسات تُبنى بجلسة اللحظة (getSession يجدّد التوكن).
   محروس بالكامل + idempotent — لا يمس أي سلوك قائم.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__sydentSyncWire) return;            /* idempotent guard */
  window.__sydentSyncWire = true;
  if (!window.SyDentOffline) return;

  var BADGE_ID = 'sydent-sync-badge';

  function ensureBadge() {
    var el = document.getElementById(BADGE_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = BADGE_ID;
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;bottom:14px;inset-inline-start:14px;z-index:99990;' +
      'display:none;direction:rtl;font-family:inherit;font-size:13px;font-weight:700;' +
      'padding:8px 14px;border-radius:10px;cursor:pointer;color:#1f2937;' +
      'background:#fde68a;border:1px solid #d97706;box-shadow:0 4px 14px rgba(0,0,0,.25);';
    el.title = 'اضغط لمحاولة المزامنة الآن';
    el.onclick = function () {
      try {
        window.SyDentOffline.drain().then(function (r) {
          if (r && r.paused === 'subscription' && typeof window.showToast === 'function') {
            window.showToast('⏸ المزامنة متوقفة حتى تجديد الاشتراك — لن يُحذف شيء مما سجّلته', true);
          }
        });
      } catch (e) {}
    };
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function renderBadge(pending, failed) {
    try {
      var el = ensureBadge();
      var n = (pending || 0) + (failed || 0);
      if (n <= 0) { el.style.display = 'none'; return; }
      var paused = !!(window.SyDentOffline.isPausedForSubscription && window.SyDentOffline.isPausedForSubscription());
      el.textContent = '⏳ بانتظار المزامنة: ' + n +
        (failed ? ' · ⚠️ ' + failed + ' تحتاج مراجعة' : '') +
        (paused ? ' · ⏸ بانتظار تجديد الاشتراك' : '');
      el.style.display = 'block';
    } catch (e) {}
  }

  async function getAuthHeaders() {
    var h = { apikey: (window.sb && window.sb.supabaseKey) || 'sb_publishable_7LjceYIlrRrHt86sLpCwPg_TlMO8VJu' };
    try {
      var s = await window.sb.auth.getSession();
      var t = s && s.data && s.data.session && s.data.session.access_token;
      if (t) h['Authorization'] = 'Bearer ' + t;
    } catch (e) {}
    return h;
  }

  function drainAndReport() {
    try {
      window.SyDentOffline.drain().then(function (r) {
        if (!r) return;
        try {
          if (r.synced > 0 && typeof window.showToast === 'function') {
            window.showToast('✅ تمت مزامنة ' + r.synced + ' عملية بنجاح', false);
          }
          if (r.failed > 0 && typeof window.showToast === 'function') {
            window.showToast('⚠️ ' + r.failed + ' عملية لم تُرفع — راجع المواعيد', true);
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  function init() {
    try {
      if (!window.sb) return;                     /* المكتبة غائبة (offline بلا كاش CDN) */
      window.SyDentOffline.configureDrain(getAuthHeaders, function (recs) {
        /* Phase 2.1: دفعات وصلت السيرفر — التوزيع (FIFO/splits) يبقى online
           حصراً بمسارات الصفحة القائمة: نبثّ حدثاً ليكمله بروفايل المريض
           المفتوح فوراً، وإلا فself-heal عند أول فتح. صفر منطق مالي هنا. */
        try {
          var pids = [];
          (recs || []).forEach(function (r) {
            if (!r || r.table !== 'ledger_payments' || r.method !== 'POST') return;
            try {
              var b = JSON.parse(r.body || 'null');
              var rows = Array.isArray(b) ? b : [b];
              rows.forEach(function (row) {
                if (row && row.patient_id && pids.indexOf(row.patient_id) === -1) pids.push(row.patient_id);
              });
            } catch (e) {}
          });
          if (!pids.length) return;
          try {
            if (typeof window.showToast === 'function') {
              window.showToast('💰 تمت مزامنة الدفعات — يكتمل التوزيع عند فتح ملف المريض', false);
            }
          } catch (e) {}
          try {
            document.dispatchEvent(new CustomEvent('sydent-payments-synced', { detail: { patientIds: pids } }));
          } catch (e) {}
        } catch (e) {}
      });
      window.SyDentOffline.onOutboxChange(renderBadge);
      window.addEventListener('online', function () { setTimeout(drainAndReport, 1200); });
      setTimeout(drainAndReport, 3000);           /* بعد الإقلاع — يلتقط بقايا جلسة سابقة */
      /* prefetch بطاقات مرضى اليوم — خلفي هادئ، مرة/يوم، بعد استقرار الصفحة */
      setTimeout(function () {
        try { window.SyDentOffline.prefetchToday(); } catch (e) {}
      }, 8000);
      setInterval(function () {
        if (window.navigator && window.navigator.onLine !== false) drainAndReport();
      }, 60000);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ═══════════════ SyDentFlags — أعلام المريض الملوّنة (M148 · v414) ═══════════════
   مصدرٌ واحد للتعريف الافتراضي والتعقيم والرسم — تستهلكه بطاقة المريض وقائمة المرضى
   والإعدادات (لا مرايا). إداريةٌ بحتة، منفصلة عن medical_flags (M87)، ولا تدخل أي حساب.
   التعريف: clinic_settings.patient_flag_defs = [{k,label,tone}] ≤ 8 · NULL ⇒ DEFAULTS.
   المريض:  patients.flags = [k,…] · مفتاحٌ حُذف تعريفُه يُهمَل عرضاً (صفر ترحيل).
   الألوان نغماتُ theme.css القائمة حصراً (حارس الألوان: لا لون محفور جديد).
   XSS: التسمية نصٌّ حرّ من صاحب العيادة ⇒ تُهرَّب دائماً هنا؛ النغمة من قائمةٍ مغلقة. */
(function () {
  var TONES = ['yellow', 'orange', 'red', 'purple', 'blue', 'cyan', 'green', 'lime', 'gray'];
  var TONE_LABELS = { yellow: 'أصفر', orange: 'برتقالي', red: 'أحمر', purple: 'بنفسجي', blue: 'أزرق', cyan: 'سماوي', green: 'أخضر', lime: 'ليموني', gray: 'رمادي' };
  var MAX = 8, MAX_LABEL = 24;
  var DEFAULTS = [
    { k: 'vip',  label: '⭐ VIP',               tone: 'yellow' },
    { k: 'late', label: '⏰ يتأخّر عن مواعيده', tone: 'orange' },
    { k: 'care', label: '🤝 عناية خاصة',        tone: 'blue' }
  ];
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  /* تعقيمٌ صارم: مفتاح [a-z][a-z0-9_]{0,15} فريد (يبدأ بحرف ⇒ لا __proto__) · تسمية مقصوصة غير فارغة · نغمة من القائمة. */
  function sanitizeDefs(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [], seen = {};
    for (var i = 0; i < arr.length && out.length < MAX; i++) {
      var d = arr[i];
      if (!d || typeof d !== 'object') continue;
      var k = String(d.k == null ? '' : d.k);
      var label = String(d.label == null ? '' : d.label).replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
      if (!/^[a-z][a-z0-9_]{0,15}$/.test(k) || has(seen, k) || !label) continue;
      seen[k] = true;
      out.push({ k: k, label: label, tone: TONES.indexOf(d.tone) >= 0 ? d.tone : 'gray' });
    }
    return out;
  }
  function effectiveDefs(raw) {
    var d = sanitizeDefs(raw);
    return d.length ? d : DEFAULTS.map(function (x) { return { k: x.k, label: x.label, tone: x.tone }; });
  }
  function sanitizeFlags(flags, defs) {
    if (!Array.isArray(flags)) return [];
    var ok = {}; (defs || []).forEach(function (d) { ok[d.k] = true; });
    var out = [], seen = {};
    flags.forEach(function (k) { k = String(k); if (has(ok, k) && !has(seen, k)) { seen[k] = true; out.push(k); } });
    return out;
  }
  /* بترتيب التعريف لا ترتيب التخزين — ثابتٌ بصرياً عبر المرضى. */
  function chipsHtml(flags, defs, cls) {
    var sel = sanitizeFlags(flags, defs);
    if (!sel.length) return '';
    return (defs || []).filter(function (d) { return sel.indexOf(d.k) >= 0; }).map(function (d) {
      return '<span class="pt-flag cbadge tone tone-' + d.tone + (cls ? ' ' + cls : '') + '">' + esc(d.label) + '</span>';
    }).join('');
  }
  function newKey(defs) {
    var used = {}; (defs || []).forEach(function (d) { used[d.k] = true; });
    for (var i = 1; i < 1000; i++) { var k = 'f' + i; if (!has(used, k)) return k; }
    return 'f' + Date.now().toString(36).slice(-6);
  }
  var _cache = null, _cacheUid = null;
  /* قبل M148 (42703/PGRST204) أو أي خطأ ⇒ الافتراضي بصمت — العرضُ لا يتعطّل لأجل وسم. */
  async function load(uid, force) {
    if (!force && _cache && _cacheUid === uid) return _cache;
    var defs = effectiveDefs(null);
    try {
      if (window.sb && uid) {
        var r = await window.sb.from('clinic_settings').select('patient_flag_defs').eq('owner_id', uid).maybeSingle();
        if (!r.error && r.data) defs = effectiveDefs(r.data.patient_flag_defs);
      }
    } catch (e) {}
    _cache = defs; _cacheUid = uid;
    return defs;
  }
  function setCache(uid, raw) { _cache = effectiveDefs(raw); _cacheUid = uid; return _cache; }
  window.SyDentFlags = { TONES: TONES, TONE_LABELS: TONE_LABELS, MAX: MAX, MAX_LABEL: MAX_LABEL, DEFAULTS: DEFAULTS,
    sanitizeDefs: sanitizeDefs, effectiveDefs: effectiveDefs, sanitizeFlags: sanitizeFlags, chipsHtml: chipsHtml,
    newKey: newKey, load: load, setCache: setCache, esc: esc };
})();

/* ═══════════════ SyDentApptDead — «الموعد لم يعد يحمل بنوده» (v415) ═══════════════
   مصدرٌ واحد لبطاقة المريض وصفحة المواعيد: بندٌ مخطّط مربوط بموعدٍ ملغى/فائت/مكتمل/
   خرج مريضه (أو ماضٍ سُجّل فيه حضور) لم يعد «مجدولاً» فعلاً — يعود «بلا زيارة» ويُعرض
   للجدولة من جديد. الموعد المخطّط بلا تاريخ والقادم والماضي غير المحسوم = حيّ.
   يطابق تصنيف ppApptBucket (cancelled · missed · attended) — يُبرهَن بالمثبت. */
/* DeepCode #13 (v559): صيغةُ تخزينٍ واحدة لأرقام الهواتف (نمط Dentally: يُوحَّد الرقمُ تلقائياً) —
   أرقامٌ عربية-هندية ⇒ لاتينية (كان «+٤٩…» يُعرض مقلوباً) · فواصل/مسافات تُحذف · +963/00963/963 ⇒ 0… محلي ·
   9 خانات تبدأ بـ9 ⇒ 0… · دوليٌّ آخر ⇒ +أرقام. لا يُرفض شيء: tidy لا يُتلف ما لا يفهمه (بلا أرقام ⇒ كما هو)، وisPlausible
   للتنبيه الخفيف فقط. التكرارُ لا يُمنع أبداً (العائلة على رقمٍ واحد — قرار المالك 30 أيلول). */
window.SyDentPhone = (function () {
  function tidy(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    s = s.replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
         .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
    var d = s.replace(/\D/g, '');
    if (!d) return s;
    var intl = s.charAt(0) === '+' || d.indexOf('00') === 0;
    if (intl) {
      var n = (s.charAt(0) === '+') ? d : d.slice(2);
      return n.indexOf('963') === 0 ? '0' + n.slice(3) : '+' + n;
    }
    if (d.indexOf('963') === 0 && d.length === 12) return '0' + d.slice(3);
    if (d.charAt(0) === '9' && d.length === 9) return '0' + d;
    return d;
  }
  function isPlausible(t) {
    t = String(t || '');
    return /^09\d{8}$/.test(t) || /^0[1-8]\d{7,8}$/.test(t) || /^\+\d{8,15}$/.test(t);
  }
  return { tidy: tidy, isPlausible: isPlausible };
})();
/* DeepCode #11 (v558): تعريفٌ واحد لـ«مواعيد اليوم» بكل الأسطح (شارةُ القائمة · بطاقةُ اللوحة · سطرُ «لديك … موعد»):
   الموعدُ يُعدّ ما لم يُلغَ أو يُكسر أو يُسجَّل «لم يحضر» — كان الشريطُ الجانبي واللوحة يعدّان كلَّ الصفوف فتختلف الأرقام
   عن بطاقة الغد وملخّص الأمس اللذين يستثنيانها. المنجَزُ اليوم يبقى معدوداً (حدث اليوم فعلاً). */
window.SyDentApptLive = function (a) {
  if (!a) return false;
  var st = a.status || '';
  return st !== 'cancelled' && st !== 'broken' && st !== 'no_show';
};
window.SyDentApptDead = function (a, today) {
  if (!a) return false;
  if (a.is_planned === true || !a.date) return false;
  var st = a.status || '';
  if (st === 'cancelled' || st === 'no_show' || st === 'broken' || st === 'completed') return true;
  if (a.dismissed_at) return true;
  var d = String(a.date).slice(0, 10);
  return d < today && !!(a.arrived_at || a.seated_at);
};

/* ═══ SyDT (v477) — مُنسّقُ التاريخ والوقت الموحّد للمنصة ═══════════════════════════
   طلب المالك (21 أيلول 2026): «وحّد التاريخ… خلّيه بس أرقام… ولازم نضيف وقت مو بس تاريخ».
   مصدرٌ واحد لكل الصفحات بدل مُنسّقاتٍ محلية بأسماء أشهرٍ مختلفة (ar-EG «يوليو» مقابل «تموز»…).
     SyDT.numDate(v)  'YYYY-MM-DD' ⇒ d/m/yyyy نصّياً بلا Date (لا انزياح توقيت) ·
                      طابعٌ زمني (timestamptz/Date) ⇒ يومُه المحلي d/m/yyyy
     SyDT.time12(v)   'HH:MM[:SS]' أو طابعٌ زمني ⇒ hh:mm AM|PM (صيغةُ المواعيد). طابعٌ عند منتصف
                      ليل UTC بالضبط = يومٌ حُفظ بلا وقت ⇒ فارغ (لا نخترع وقتاً)
     SyDT.hm(v)       طابعٌ زمني ⇒ 'HH:mm' محلي لحقول <input type="time">
     SyDT.nowHM()     الآن 'HH:mm'
     SyDT.cell(d, t)  HTML «التاريخ وتحته الوقتُ أصغر» (.dt-cell بـtheme.css)؛ t اختياري — إن غاب
                      وكان d طابعاً زمنياً أُخذ وقتُه منه. كلُّ نصٍّ مُهرَّب.
     SyDT.cellRec(ymd, ts) لسجلٍّ تاريخُه يومٌ (DATE) ووقتُه وقتُ تسجيله (created_at): يُعرض الوقت
                      فقط إن سُجّل بيومه نفسه — المُدخلُ بتاريخٍ سابق يُعرض تاريخُه وحده.          */
window.SyDT = (function () {
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function isYmd(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  function asDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v !== 'string' || !v || isYmd(v)) return null;
    var d = new Date(v); return isNaN(d.getTime()) ? null : d;
  }
  function numDate(v) {
    if (isYmd(v)) { var m = v.split('-'); return parseInt(m[2], 10) + '/' + parseInt(m[1], 10) + '/' + m[0]; }
    var d = asDate(v); return d ? (d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()) : '';
  }
  // v485: الوقتُ معزولُ الاتجاه (LRI…PDI) — داخل نصٍّ عربي كان «02:32 PM» يُرسم «PM 02:32» (لقطة الأدمن)
  function fmt12(h, mi) { var ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12; return '\u2066' + p2(h12) + ':' + p2(mi) + ' ' + ap + '\u2069'; }
  function hasTime(d) { return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0); }
  function time12(v) {
    var m = typeof v === 'string' && /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v);
    if (m) return fmt12(parseInt(m[1], 10), parseInt(m[2], 10));
    var d = asDate(v); return (d && hasTime(d)) ? fmt12(d.getHours(), d.getMinutes()) : '';
  }
  function hm(v) { var d = asDate(v); return (d && hasTime(d)) ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : ''; }
  function nowHM() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cell(d, t) {
    var dd = numDate(d); if (!dd) return '—';
    var tt = time12(t === undefined ? d : t);
    return '<span class="dt-cell"><span class="ltr-val">' + esc(dd) + '</span>'
      + (tt ? '<span class="dt-time ltr-val">' + esc(tt) + '</span>' : '') + '</span>';
  }
  function localYmd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function cellRec(day, ts) {
    // v481: اليومُ قد يكون طابعاً زمنياً (lab_orders.date_sent timestamptz): إن حمل وقتَه الحقيقي عُرض،
    //       وإلا (يومٌ حُفظ عند منتصف ليل UTC) عومل يوماً وأُخذ وقتُ التسجيل إن كان بيومه.
    var dd = asDate(day);
    if (dd && hasTime(dd)) return cell(day);
    var ymd = isYmd(day) ? day : (dd ? localYmd(dd) : '');
    var d = asDate(ts);
    var same = !!(d && ymd && localYmd(d) === ymd);
    return cell(ymd || day, same ? ts : null);
  }
  return { numDate: numDate, time12: time12, hm: hm, nowHM: nowHM, cell: cell, cellRec: cellRec };
})();

/* ═══ SySlots (v484) — طيُّ خاناتِ أزرار الصفوف غير المستعملة بالجدول كله ═══════════════
   طلب المالك (لقطتا الجلسات والمدفوعات: «راجع… وتأكّد إنو كل شي نظيف»): خاناتُ .sy-slots الثابتة
   تركت عموداً فارغاً حين لا يستعمل أيُّ صفٍّ خانته (جلساتٌ كلُّها منجزة ⇒ خانةُ «إكمال» فراغٌ عريض).
   العارضُ يكتب القالبَ '__SY_SLOTS__' في style الحاوية و data-span-if="N" على زرٍّ يمتدّ فوق خانة N
   إن غابت بصفّه؛ ثم SySlots.finalize(html, {1:'84px', 2:'78px', …}) على HTML الجدول كله:
     · القالب = الخاناتُ المستعملة فعلاً بأيّ صفّ (يُكشف من data-slot بالـHTML نفسه) بترتيبها
     · data-span-if="N" ⇒ data-span="2" إن كانت الخانة N بالقالب، وإلا يُحذف (لا امتدادَ فوق خانةٍ مطويّة). */
window.SySlots = {
  finalize: function (html, widths) {
    html = String(html || '');
    var used = {};
    Object.keys(widths).forEach(function (k) { used[k] = html.indexOf('data-slot="' + k + '"') >= 0; });
    var tpl = Object.keys(widths).sort().filter(function (k) { return used[k]; })
      .map(function (k) { return '[s' + k + '] ' + widths[k]; }).join(' ');
    html = html.split('__SY_SLOTS__').join(tpl);
    return html.replace(/ data-span-if="(\d)"/g, function (_, n) { return used[n] ? ' data-span="2"' : ''; });
  }
};
