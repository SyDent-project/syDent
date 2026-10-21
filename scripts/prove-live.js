/* v623 — مثبتُ التحديث اللحظي (SyLive · Migration 185) — طلبُ المالك: «أي شي بدو تحديث خليه لحظي».
   (١) النشر: كلُّ جدولٍ تراقبه صفحةٌ موجودٌ بالنشر (M185 ∪ M178)، وكلُّ جدولٍ بالخريطة له عمودُ عزل.
   (٢) التوصيل: الصفحاتُ السبع + الشريطُ الجانبي تسجّل مراقبةً باسمها ودالّةِ تحميلٍ موجودة؛ بطاقةُ المريض مفلترةٌ بالمريض.
   (٣) السلوك (vm بقناةٍ وساعةٍ مزيّفتين على SyLive الحيّ): التجميع · لا رسمَ والنافذةُ مفتوحة أو الكتابةُ جارية أو السحب ·
       الحذفُ لا يُعيد إلا لمعرّفٍ معروض · التبويبُ المخفيّ يؤجّل والعودةُ تلحق · سقوطُ القناة ⇒ أرضيةُ فحص · العودةُ ⇒ لحاق ·
       حدثٌ أثناء التحميل ⇒ تحميلٌ تالٍ · الشريطُ بلا تأجيل · الفلاتر (المالك لـINSERT/UPDATE · بلا فلتر لـDELETE · فلترُ المريض).
   (٤) لوحةُ اليوم: مستمعُ غرفة الانتظار يُسجَّل مرةً واحدة مهما أُعيد التحميل.
   (٥) v626 · M186 — الأطباء · الموظفون · المستحقّات · سجلّ النشاط: النشرُ وعمودُ العزل · المسارُ اللحظي يقرأ ولا يكتب
       (لا إصلاحَ ذاتياً ولا إدراجَ لصفّ المالك) · فشلٌ عابر يُبقي المعروض · السحبُ وحفظُ الترتيب يؤجّلان الرسم ·
       وسجلُّ النشاط بمتصفح jsdom على الصفحة الحيّة: لا «جارٍ التحميل» ولا فقدَ لما حُمِّل · الصفُّ الأخير يبقى آخراً ·
       «عرض المزيد» بعده بلا تكرار · مرساةٌ لا تزيح القارئ · حبّةُ «↑ جديد» باسم المريض · الفلاترُ المطبَّقة لا ما بالقوائم ·
       اختيارُ الموظف يبقى · الإحصاءاتُ لا تصير أصفاراً عند فشلٍ عابر.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const liveSrc = s => { const a = s.indexOf('/* ═══════════════ SyLive'); return a < 0 ? '' : s.slice(a); };
const pubOf = sql => { const m = /ARRAY\[([^\]]*)\]/.exec(sql); return m ? m[1].match(/'([a-z_]+)'/g).map(x => x.slice(1, -1)) : []; };

function harness(S, opt) {
  opt = opt || {};
  let now = 1000; const timers = []; let tid = 0;
  const setT = (fn, ms, rep) => { const id = ++tid; timers.push({ id, at: now + ms, fn, ms, rep }); return id; };
  const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; now = t.at; if (t.rep) t.at = now + t.ms; else timers.shift(); t.fn(); } now = end; };
  const listeners = {}, winListeners = {};
  const doc = { hidden: false, activeElement: null, modal: false, drag: false, inlineOverlay: false, html: '', body: null,
    querySelector: sel => (doc.modal ? {} : (doc.drag && String(sel).indexOf('[draggable="true"].dragging') > -1 ? {} : null)),
    querySelectorAll: () => (doc.inlineOverlay ? [{ style: { display: 'flex' } }] : [{ style: { display: 'none' } }, { style: {} }]),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); } };
  doc.body = { classList: { contains: () => false }, get innerHTML() { return doc.html; } };
  const chans = [];
  const sb = { channel: name => { const ch = { name, subs: [], on(kind, f, cb) { this.subs.push({ f, cb }); return this; },
    subscribe(cb) { this.statusCb = cb; chans.push(this); return this; } }; return ch; }, removeChannel: () => {} };
  const ctx = { window: { sb }, document: doc, setTimeout: (f, ms) => setT(f, ms, false), clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i > -1) timers.splice(i, 1); },
    setInterval: (f, ms) => setT(f, ms, true), Date: { now: () => now }, Math, String, Array, console: { warn() {} } };
  ctx.window.addEventListener = (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); };
  ctx.addEventListener = ctx.window.addEventListener;
  vm.createContext(ctx);
  vm.runInContext(liveSrc(S.init).replace(/window\.addEventListener/g, 'window.addEventListener'), ctx);
  const L = ctx.window.SyLive;
  let calls = 0; let release = null;
  const w = L.watch({ name: 'p', uid: 'U1', tables: opt.tables || ['appointments', { t: 'patients', filter: 'id=eq.P1' }], hold: opt.hold,
    refresh: () => { calls++; if (opt.slow) return new Promise(r => { release = r; }); } });
  const ch = chans[0];
  const fire = (table, type, row) => ch.subs.filter(s => s.f.table === table && s.f.event === type).forEach(s => s.cb({ eventType: type, new: row || {}, old: row || {} }));
  const tick = async ms => { advance(ms); await new Promise(r => setImmediate(r)); };
  return { L, w, ch, doc, fire, tick, calls: () => calls, release: () => release && release(), listeners, winListeners, status: s => ch.statusCb(s) };
}

async function suite(S) {
  /* (١) */
  /* v628: + every table a migration adds by name (ALTER PUBLICATION … ADD TABLE public.x — M187 portal_requests) */
  const pub = pubOf(S.m185).concat(pubOf(S.m186)).concat(['patient_intakes'])
    .concat([...S.migs.matchAll(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.([a-z_]+);/g)].map(m => m[1]));
  const ctx0 = { window: {}, document: { addEventListener() {} }, setInterval() {}, console };
  vm.createContext(ctx0); vm.runInContext(liveSrc(S.init), ctx0);
  const tenantOf = ctx0.window.SyLive.tenantOf;
  /* the schema snapshot first; a table newer than the snapshot (e.g. patient_portals, M180) from the migration that created it */
  const hasCol = (table, col) => {
    const m = new RegExp('CREATE TABLE IF NOT EXISTS "public"\\."' + table + '" \\(([\\s\\S]*?)\\n\\);').exec(S.schema);
    if (m) return m[1].indexOf('"' + col + '"') > -1;
    const g = new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table + ' \\(([\\s\\S]*?)\\n\\);').exec(S.migs);
    return !!(g && new RegExp('\\n\\s+' + col + '\\s').test(g[1]));
  };
  const T = new Proxy({}, { get: (o, k) => (typeof k === 'string' && /^[a-z_]+$/.test(k) && hasCol(k, tenantOf(k))) ? tenantOf(k) : undefined });
  ok(!/payment_splits|realloc_patient_splits|buildFifoSplits/.test(S.init) && !/ledger_sessions/.test(liveSrc(S.init)), 'financial wall: SyLive names no financial table inside supabase-init.js (check-offline-guard)');
  const watched = new Set();
  const pages = { 'appointments.html': S.appt, 'patients.html': S.pats, 'patient-profile.html': S.pp, 'labs.html': S.labs, 'accounting.html': S.acc, 'inventory.html': S.inv, 'index.html': S.idx, 'sidebar.js': S.side,
                  'doctors.html': S.doc, 'employees.html': S.emp, 'payouts.html': S.pay, 'audit-log.html': S.aud };
  Object.keys(pages).forEach(f => {
    const src = pages[f]; const i = src.indexOf('SyLive.watch({'); const seg = i < 0 ? '' : src.slice(i, src.indexOf('});', i));
    ok(i > -1 && /name: '[a-z-]+'/.test(seg) && /tables: \[/.test(seg) && /refresh:/.test(seg), f + ': registers a live watch (name · tables · refresh)');
    /* v628: the table names come from the tables array itself — a name is never dropped because its tenant column is missing
       (the old «any quoted word that has a tenant column» filter silently skipped a mis-mapped table) */
    const arr = (/tables: \[([\s\S]*?)\]/.exec(seg) || ['', ''])[1];
    (arr.replace(/\{[^}]*\}/g, '').match(/'([a-z_]+)'/g) || []).map(x => x.slice(1, -1)).forEach(x => watched.add(x));
    (seg.match(/t: '([a-z_]+)'/g) || []).map(x => x.slice(4, -1)).forEach(x => watched.add(x));
  });
  ok([...watched].every(t => pub.indexOf(t) > -1 && T[t]) && watched.size >= 21 && ['clinic_doctors', 'clinic_employees', 'audit_log', 'portal_requests'].every(t => watched.has(t)), 'publication + schema: every watched table (' + watched.size + ') is published and really has its tenant column (db/schema.sql)');
  /* v626: العمودُ لا يكفي أن يوجد — يجب أن يكون عمودَ سياسة المالك نفسَها (clinic_employees فيه doctor_id أيضاً) */
  const rlsCol = t => { const m = new RegExp('CREATE POLICY "[^"]*" ON "public"\\."' + t + '" (?!AS RESTRICTIVE)[^\\n]*?USING \\(\\("([a-z_]+)" = \\( SELECT "auth"\\."uid"\\(\\)').exec(S.schema); return m ? m[1] : null; };
  const mism = [...watched].filter(t => rlsCol(t) && rlsCol(t) !== tenantOf(t));
  ok(mism.length === 0 && ['clinic_doctors', 'clinic_employees', 'audit_log'].every(t => rlsCol(t) === 'owner_id' && tenantOf(t) === 'owner_id'), 'tenant filter = the column of the table\'s own owner RLS policy (' + (mism.join(',') || 'all match') + ')');
  ok(/refresh: apptLiveRefresh/.test(S.appt) && /async function apptLiveRefresh\(\) \{[\s\S]{0,400}await loadAppointments\(\);/.test(S.appt), 'calendar: live refresh reloads names, phones, appointments and booking requests');
  ok(/\{ t: 'patients', filter: 'id=eq\.' \+ patientId \}/.test(S.pp) && (S.pp.match(/filter: _pf \}/g) || []).length === 12 && /ppPortalLoad\(true\)/.test(S.pp) && /ppIntakeLoad\(true\)/.test(S.pp) && /\{ t: 'patient_documents', filter: _pf \}/.test(S.pp) && /if \(_pfLoaded && typeof loadPatientFiles === 'function'\) await loadPatientFiles\(\);/.test(S.pp) && /\{ t: 'capture_requests', filter: _pf \}, \{ t: 'bridge_inbox' \}/.test(S.pp), 'patient card: scoped to this patient on all 13 patient tables (+ the clinic inbox); intake, portal, the files tab and (M194) capture requests refreshed too');
  ok(/if \(!from \|\| !to \|\| from > to \|\| _applyInFlight \|\| _blocked\(\)\) return;\s+await loadAllInRange\(from, to\);/.test(S.acc) && !/SyLive[\s\S]{0,900}_setBody\(/.test(S.acc.slice(S.acc.indexOf('SyLive.watch'), S.acc.indexOf('SyLive.watch') + 900)), 'accounting: the open report refreshes silently (no spinner flash, never mid-apply)');
  ok(/name: 'sidebar'[\s\S]{0,140}refresh: refreshSidebarDynamic, hold: false/.test(S.side), 'sidebar: today\'s-appointments and booking badges are live and never deferred');
  /* (٤) */
  ok(/if \(!window\._waitingRoomVisWired\) \{/.test(S.idx), 'dashboard: the waiting-room listener is wired once although loadDashboard re-runs on every live refresh');
  /* (٣) */
  let h = harness(S);
  const ins = h.ch.subs.filter(s => s.f.table === 'appointments');
  ok(ins.length === 3 && ins.find(s => s.f.event === 'INSERT').f.filter === 'doctor_id=eq.U1' && ins.find(s => s.f.event === 'UPDATE').f.filter === 'doctor_id=eq.U1' && !ins.find(s => s.f.event === 'DELETE').f.filter && h.ch.subs.find(s => s.f.table === 'patients' && s.f.event === 'UPDATE').f.filter === 'id=eq.P1', 'filters: tenant column on INSERT/UPDATE, none on DELETE (unsupported), custom per-patient filter honoured');
  h.status('SUBSCRIBED');
  for (let i = 0; i < 5; i++) { h.fire('appointments', 'UPDATE', { id: 'a' + i }); await h.tick(200); }
  await h.tick(800);
  ok(h.calls() === 1, 'debounce: five changes in a burst ⇒ one reload');
  h = harness(S); h.status('SUBSCRIBED'); h.doc.modal = true;
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(5000);
  ok(h.calls() === 0, 'hold: no repaint while a modal/dialog is open');
  h.doc.modal = false; await h.tick(1200);
  ok(h.calls() === 1, 'hold: the held update is applied right after the modal closes');
  h = harness(S); h.status('SUBSCRIBED'); h.doc.inlineOverlay = true;
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(4000);
  ok(h.calls() === 0, 'hold: an overlay opened with style.display (perio / family link) also holds the repaint');
  h.doc.inlineOverlay = false; await h.tick(1200);
  ok(h.calls() === 1, 'hold: applied once that overlay is hidden again');
  ok(/id="famLinkModal" data-live-hold /.test(S.pp) && /id="perioNewModal" data-live-hold /.test(S.pp), 'patient card: both hand-rolled overlays are marked data-live-hold');
  h = harness(S); h.status('SUBSCRIBED'); h.doc.activeElement = { tagName: 'TEXTAREA' };
  h.fire('appointments', 'INSERT', { id: 'a1' }); await h.tick(4000);
  ok(h.calls() === 0, 'hold: no repaint while typing in a textarea');
  h.doc.activeElement = null; await h.tick(1200);
  ok(h.calls() === 1, 'hold: applied once typing stops');
  h = harness(S, { hold: false }); h.status('SUBSCRIBED'); h.doc.modal = true;
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(1000);
  ok(h.calls() === 1, 'hold:false (sidebar badges) refreshes even with a modal open');
  h = harness(S); h.status('SUBSCRIBED'); h.doc.html = '<div onclick="openAppt(\'KNOWN-ID\')"></div>';
  h.fire('appointments', 'DELETE', { id: 'OTHER-CLINIC-ID' }); await h.tick(1500);
  ok(h.calls() === 0, 'delete: an id not on this screen (another clinic\'s row) is ignored');
  h.fire('appointments', 'DELETE', { id: 'KNOWN-ID' }); await h.tick(1500);
  ok(h.calls() === 1, 'delete: a row on this screen ⇒ reload');
  h = harness(S); h.status('SUBSCRIBED'); h.doc.hidden = true;
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(3000);
  ok(h.calls() === 0, 'hidden tab: no reload in the background');
  h.doc.hidden = false; (h.listeners.visibilitychange || []).forEach(f => f()); await h.tick(1000);
  ok(h.calls() === 1, 'hidden tab: the pending update is applied on return');
  h = harness(S); h.status('SUBSCRIBED');
  h.doc.hidden = true; (h.listeners.visibilitychange || []).forEach(f => f()); await h.tick(30000);
  h.doc.hidden = false; (h.listeners.visibilitychange || []).forEach(f => f()); await h.tick(1000);
  ok(h.calls() === 1, 'away > 20s (the phone dropped the socket) ⇒ one catch-up reload on return');
  h = harness(S); h.status('SUBSCRIBED'); h.status('CHANNEL_ERROR'); await h.tick(61000);
  ok(h.calls() >= 1, 'socket down ⇒ the 60s floor still reloads');
  const before = h.calls(); h.status('SUBSCRIBED'); await h.tick(1000);
  ok(h.calls() === before + 1, 'socket back ⇒ one catch-up reload');
  h = harness(S, { slow: true }); h.status('SUBSCRIBED');
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(800);
  h.fire('appointments', 'UPDATE', { id: 'a2' }); await h.tick(3000);
  ok(h.calls() === 1, 'running: no overlapping reload while one is in flight');
  h.release(); await h.tick(10); await h.tick(1000);
  ok(h.calls() === 2, 'running: a change that arrived mid-reload triggers exactly one more reload');
  /* (٥) v626 — الصفحاتُ الأربع */
  h = harness(S); h.status('SUBSCRIBED'); h.doc.drag = true;
  h.fire('appointments', 'UPDATE', { id: 'a1' }); await h.tick(4000);
  ok(h.calls() === 0, 'hold: no repaint while an HTML5 reorder drag is in progress (employee cards)');
  h.doc.drag = false; await h.tick(1200);
  ok(h.calls() === 1, 'hold: applied once the drag ends');
  ok(/name: 'doctors'[\s\S]{0,120}tables: \['clinic_doctors', 'clinic_employees'\][\s\S]{0,80}loadDoctors\(\{ live: true \}\)/.test(S.doc), 'doctors: live watch on doctors + employee links, refreshing through the read-only live path');
  ok(/if \(!hasOwnerRow && !live\) \{/.test(S.doc) && /if \(_ownerFull && !live\) \{/.test(S.doc), 'doctors: the live path never inserts/promotes the owner row nor rewrites its name (two devices ⇒ no double insert)');
  ok(/if \(error && live\) \{ console\.warn\('live doctors refresh:', error\); return; \}/.test(S.doc) && /if \(empQueryFailed && live\) return;/.test(S.doc), 'doctors: a transient failure during a live refresh keeps the shown list — no «فشل تحميل الأطباء» toast, no switch to the degraded filter');
  ok(/name: 'employees'[\s\S]{0,120}tables: \['clinic_employees', 'clinic_doctors'\], refresh: empLiveRefresh/.test(S.emp) && /async function empLiveRefresh\(\) \{\s+if \(await loadData\(\{ live: true \}\)\) renderList\(\);/.test(S.emp), 'employees: live watch; the list is repainted only after a successful read');
  ok(/if \(!live && window\.SyDentLock && window\.SyDentLock\.ensureOwnerEmployee\)/.test(S.emp) && /if \(_ownerFull && !live\) \{/.test(S.emp) && /if \(empRes\.error && live\) \{ console\.warn\('live employees refresh:', empRes\.error\); return false; \}/.test(S.emp), 'employees: live path writes nothing (no owner self-heal, no name rewrite) and a transient failure keeps the shown list (no error card/toast)');
  ok(/document\.body\.classList\.add\('sy-live-hold'\);\s+try \{\s+for \(var k = 0; k < updates\.length; k\+\+\)/.test(S.emp) && /\} finally \{ document\.body\.classList\.remove\('sy-live-hold'\); \}/.test(S.emp), 'employees: saving a new order holds live repaints until the last sequential write (no half-saved order flashes)');
  ok(/name: 'payouts'[\s\S]{0,120}tables: \['provider_payouts', 'clinic_doctors', 'clinic_employees', 'ledger_sessions'\], refresh: payLiveRefresh/.test(S.pay), 'payouts: live watch on payouts, doctors, employees and completed-session production');
  ok(/if \(_payLiveFail\) \{ doctors = snap\.d; payouts = snap\.p; sessions = snap\.s; return; \}/.test(S.pay) && (S.pay.match(/\.error && _payLive\) \{ _payLiveFail = true; return; \}/g) || []).length === 4, 'payouts: any failed read during a live refresh restores the whole shown snapshot (never an empty list or a false zero)');
  ok(/name: 'audit-log'[\s\S]{0,120}tables: \['audit_log', 'clinic_employees'\], refresh: auditLiveRefresh/.test(S.aud), 'activity log: live watch on the log and the employee names');
  ok(/'\.modal-overlay\.open, \.modal-overlay\.show, \.k3-dragging'/.test(liveSrc(S.init)) && /querySelectorAll\('\.modal-overlay, \[data-live-hold\]'\)/.test(liveSrc(S.init)), 'hold covers both modal conventions (.open/.show and inline display), SyDialog, and calendar drag');
}
/* (٥ب) سجلُّ النشاط على الصفحة الحيّة بـjsdom — قاعدةٌ مزيّفة وتخطيطٌ محاكى (الصفُّ i على 300 + 50i − scrollY، الشريطُ العلوي حتى 60) */
async function auditSuite(S) {
  const { JSDOM, VirtualConsole } = require('jsdom'); const vcon = new VirtualConsole();   /* صامت: تحذيراتُ الصفحة المقصودة (فشلٌ محاكى) */
  const html = S.aud.replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, '');
  /* relative to now: the page shows the last week by default, so fixed dates age out of view */
  const BASE = Date.now() - 6 * 3600000;
  const iso = n => new Date(BASE + n * 60000).toISOString();
  let rows = []; for (let i = 0; i < 120; i++) rows.push({ id: 'r' + String(i).padStart(3, '0'), owner_id: 'U1', employee_id: i % 2 ? 'E1' : 'E2', employee_name_snapshot: 'سارة', employee_role_snapshot: 'secretary', action_type: 'patient.edit', description: 'تعديل مريض ' + i, patient_id: 'P' + i, patient_name_snapshot: 'مريض ' + i, is_alert: i % 7 === 0, alert_reason: null, is_archived: false, created_at: iso(i) });
  let emps = [{ id: 'E1', name: 'سارة', role: 'secretary' }, { id: 'E2', name: 'رامي', role: 'doctor' }];
  const db = { fail: false, defer: null, calls: [] };
  const mkQ = table => { const st = { table, eq: [], gte: null, inl: null, range: null, head: false, limit: null };
    const q = { select(c, o) { st.head = !!(o && o.head); return q; }, eq(k, v) { st.eq.push([k, v]); return q; }, gte(k, v) { st.gte = [k, v]; return q; }, in(k, v) { st.inl = [k, v]; return q; },
      order() { return q; }, range(a, b) { st.range = [a, b]; return q; }, limit(n) { st.limit = n; return q; }, not() { return q; },
      then(res, rej) { const run = () => { db.calls.push(st);
          if (db.fail && table === 'audit_log') return { data: null, count: null, error: { message: 'network' } };
          if (table === 'clinic_employees') return { data: emps.slice(), error: null };
          let r = rows.filter(x => st.eq.every(([k, v]) => x[k] === v) && (!st.gte || x[st.gte[0]] >= st.gte[1]) && (!st.inl || st.inl[1].indexOf(x[st.inl[0]]) > -1));
          r.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : (a.id < b.id ? 1 : -1)));
          if (st.head) return { count: r.length, error: null };
          if (st.limit) r = r.slice(0, st.limit);
          if (st.range) r = r.slice(st.range[0], st.range[1] + 1);
          return { data: r, error: null }; };
        if (db.defer && table === 'audit_log' && st.range && st.range[0] === 0 && !st.head) { const d = db.defer; db.defer = null; return d.then(() => run()).then(res, rej); }
        return Promise.resolve(run()).then(res, rej); } };
    return q; };
  let watchOpts = null, Y = 0;
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vcon, beforeParse(w) {
    w.sb = { from: mkQ }; w.sbRequireAuth = async () => ({ id: 'U1' }); w.initSidebar = () => {}; w.SySlots = { finalize: h => h.replace(/__SY_SLOTS__/g, '2') };
    w.SyLive = { watch: o => { watchOpts = o; return {}; } }; w.SyDentLock = { guardPage: () => true };
    w.SyDT = { numDate: d => d.toISOString().slice(0, 10), time12: d => d.toISOString().slice(11, 16) }; w.showToast = () => {}; w.logAudit = () => {};
    Object.defineProperty(w, 'scrollY', { get: () => Y, configurable: true });
    w.scrollBy = (x, y) => { Y += y; }; w.scrollTo = o => { Y = (o && o.top) || 0; };
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList && this.classList.contains('topbar')) return { top: 0, bottom: 60 };
      if (this.id === 'logContainer') return { top: 300 - Y, bottom: 0 };
      if (this.classList && this.classList.contains('log-row')) { const all = [...this.ownerDocument.querySelectorAll('#logContainer .log-row')]; const i = all.indexOf(this); return { top: 300 + 50 * i - Y, bottom: 350 + 50 * i - Y }; }
      return { top: 0, bottom: 0 }; };
  } });
  const w = dom.window; const $ = id => w.document.getElementById(id);
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };
  await settle();
  ok(!!watchOpts && typeof watchOpts.refresh === 'function' && w.allLogs.length === 50, 'activity log (jsdom): first page shown and the live watch registered');
  let resets = 0; const orig = w.loadLogs; w.loadLogs = function (reset) { if (reset) resets++; return orig.apply(this, arguments); };
  w.loadMore(); await settle();
  ok(w.allLogs.length === 100, 'activity log: «عرض المزيد» loads the second page');
  /* scrolled deep, three new rows arrive (one names a patient) */
  Y = 1000; const anchorBefore = [...w.document.querySelectorAll('#logContainer .log-row')][16].getAttribute('data-id');
  const prevLast = w.allLogs[99].id;
  for (let i = 0; i < 3; i++) rows.push({ id: 'n' + i, owner_id: 'U1', employee_id: 'E1', employee_name_snapshot: 'سارة', employee_role_snapshot: 'secretary', action_type: 'appointment.status_change', description: 'أكّد المريض موعده', patient_id: 'PX', patient_name_snapshot: 'خالد الأحمد', is_alert: false, is_archived: false, created_at: iso(500 + i) });
  let sawSpinner = false; const mo = new w.MutationObserver(() => { if (/جارٍ التحميل/.test($('logContainer').textContent)) sawSpinner = true; }); mo.observe($('logContainer'), { childList: true, subtree: true, characterData: true });
  await watchOpts.refresh(); await settle();
  ok(resets === 0 && !sawSpinner, 'activity log: a live refresh never resets the list nor flashes «جارٍ التحميل»');
  ok(w.allLogs.length === 103 && w.allLogs[102].id === prevLast && new Set(w.allLogs.map(r => r.id)).size === 103, 'activity log: everything loaded stays — the last shown row is still last, nothing duplicated or dropped');
  const anchorRow = w.document.querySelector('#logContainer .log-row[data-id="' + anchorBefore + '"]');
  ok(anchorRow && anchorRow.getBoundingClientRect().top === 300 + 50 * 16 - 1000, 'activity log: the reader is not moved — the first visible row stays exactly where it was');
  ok(!$('liveNewPill').hidden && /3 سجلات جديدة/.test($('liveNewPillText').textContent) && /خالد الأحمد/.test($('liveNewPillText').textContent) && /أكّد المريض موعده/.test($('liveNewPillDesc').textContent), 'activity log: scrolled away ⇒ «↑ 3 سجلات جديدة» pill naming the latest entry\'s patient');
  w.loadMore(); await settle();
  ok(w.allLogs.length === 123 && new Set(w.allLogs.map(r => r.id)).size === 123, '«عرض المزيد» after a live insert continues exactly where the list ends (no duplicates, nothing skipped)');
  w.liveJumpTop(); await settle();
  ok(Y === 300 - 60 - 12 && !w.listScrolledAway() && $('liveNewPill').hidden, 'activity log: tapping the pill brings the top of the list right under the top bar and clears it');
  /* at the top: new rows appear at once, highlighted, no pill */
  rows.push({ id: 'n9', owner_id: 'U1', employee_id: 'E2', employee_name_snapshot: 'رامي', employee_role_snapshot: 'doctor', action_type: 'payment.create', description: 'دفعة', patient_id: 'PY', patient_name_snapshot: 'ليلى', is_alert: false, is_archived: false, created_at: iso(900) });
  await watchOpts.refresh(); await settle();
  ok(w.allLogs[0].id === 'n9' && w.document.querySelector('#logContainer .log-row[data-id="n9"]').classList.contains('log-new') && $('liveNewPill').hidden, 'activity log: at the top the new row shows at once, highlighted, without a pill');
  ok($('statTotal').textContent === '124', 'activity log: the counters follow live');
  /* a filter chosen but not applied does not leak into the live list */
  $('filterAlerts').value = 'only'; await watchOpts.refresh(); await settle();
  ok(w.allLogs.length > 100 && w.allLogs.some(r => !r.is_alert), 'activity log: live refresh uses the APPLIED filters, not an unapplied dropdown change');
  $('filterAlerts').value = 'all';
  /* the chosen employee survives a rebuilt employee list (new employee added on another device) */
  $('filterEmployee').value = 'E1'; emps = emps.concat([{ id: 'E3', name: 'نور', role: 'secretary' }]);
  await watchOpts.refresh(); await settle();
  ok($('filterEmployee').value === 'E1' && $('filterEmployee').options.length === 4, 'activity log: a new employee appears in the filter and the chosen one stays selected');
  /* a transient failure keeps the list and the counters */
  const shown = w.allLogs.length, tot = $('statTotal').textContent; db.fail = true;
  await watchOpts.refresh(); await settle(); db.fail = false;
  ok(w.allLogs.length === shown && $('statTotal').textContent === tot && $('statTotal').textContent !== '0', 'activity log: a failed live read keeps the shown list and counters (no zeros, no empty list)');
  /* an apply that lands while a live read is in flight wins */
  let releaseDefer; db.defer = new Promise(r => { releaseDefer = r; });
  const pending = watchOpts.refresh(); await settle();
  $('filterAlerts').value = 'only'; await w.applyFilters(); await settle();
  releaseDefer(); await pending; await settle();
  ok(w.allLogs.length > 0 && w.allLogs.every(r => r.is_alert), 'activity log: a filter applied during a live read is not overwritten by the stale live result');
  /* back to all rows; an event whose live read is overtaken by «عرض المزيد» is retried, not lost */
  $('filterAlerts').value = 'all'; $('filterEmployee').value = 'all'; await w.applyFilters(); await settle();
  ok(w.allLogs.length === 50 && w.hasMore, 'activity log: back to all rows, first page');
  rows.push({ id: 'n20', owner_id: 'U1', employee_id: 'E1', employee_name_snapshot: 'سارة', employee_role_snapshot: 'secretary', action_type: 'patient.edit', description: 'حدثٌ أثناء عرض المزيد', patient_id: 'PZ', patient_name_snapshot: 'سامر', is_alert: false, is_archived: false, created_at: iso(1000) });
  let rel2; db.defer = new Promise(r => { rel2 = r; });
  const pend2 = watchOpts.refresh(); await settle();
  w.loadMore(); await settle();
  rel2(); await pend2; await settle();
  ok(w.allLogs[0].id === 'n20' && new Set(w.allLogs.map(r => r.id)).size === w.allLogs.length, 'activity log: a live event overtaken by «عرض المزيد» is retried and shown (not lost until the next event), with no duplicates');
  /* «عرض المزيد» clicked before the live refresh lands (debounce/held window): offsets shifted by inserts ⇒ no duplicate rows */
  const before2 = w.allLogs.length;
  for (let i = 0; i < 4; i++) rows.push({ id: 'm' + i, owner_id: 'U1', employee_id: 'E1', employee_name_snapshot: 'سارة', employee_role_snapshot: 'secretary', action_type: 'patient.edit', description: 'x', patient_id: 'P', patient_name_snapshot: 'م', is_alert: false, is_archived: false, created_at: iso(1100 + i) });
  ok(w.hasMore, 'activity log: more pages remain before the de-dup check');
  w.loadMore(); await settle();
  ok(new Set(w.allLogs.map(r => r.id)).size === w.allLogs.length && w.allLogs.length > before2, '«عرض المزيد» after unseen inserts adds no duplicate rows (append de-duplicates by id)');
  mo.disconnect(); w.close();
}

const FILES = { schema: 'db/schema.sql', init: 'supabase-init.js', m185: 'migrations/185_realtime_live_app.sql', appt: 'appointments.html', pats: 'patients.html', pp: 'patient-profile.html', labs: 'labs.html', acc: 'accounting.html', inv: 'inventory.html', idx: 'index.html', side: 'sidebar.js',
                m186: 'migrations/186_realtime_staff_audit.sql', doc: 'doctors.html', emp: 'employees.html', pay: 'payouts.html', aud: 'audit-log.html' };
const base = {}; Object.keys(FILES).forEach(k => { base[k] = read(FILES[k]); });
base.migs = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => /\.sql$/.test(f)).sort().map(f => read('migrations/' + f)).join('\n');
async function run(S) { pass = 0; fail = 0; await suite(S); await auditSuite(S); return { pass, fail }; }
(async () => {
  const main = await run(base);
  if (main.fail) { console.log('❌ prove-live: ' + main.fail + ' فشل'); process.exit(1); }
  if (process.argv.includes('--self-test')) {
    const mutants = [
      ['inline-display overlays ignored', 'init', "if (st && st.display && st.display !== 'none') return true;", ""],
      ['repaint while a modal is open', 'init', "if (w.running || (w.hold !== false && held())) {", "if (w.running) {"],
      ['every delete reloads (cross-clinic storm)', 'init', "if (!(w.knows || knowsByDom)(table, id)) return;", ""],
      ['no debounce', 'init', "w.timer = setTimeout(function () { flush(w); }, DEBOUNCE_MS);", "flush(w);"],
      ['no tenant filter', 'init', "(col + '=eq.' + w.uid)", "undefined"],
      ['wrong tenant column for an owner_id table', 'init', "patient_portals: 'owner_id', ", ""],
      ['background reload on a hidden tab', 'init', "if (document.hidden) return;                                   /* يُطبَّق عند العودة للتبويب */", ""],
      ['no catch-up after a dropped socket', 'init', "if (w.wasDown) schedule(w);", ""],
      ['appointments not published', 'm185', "ARRAY['appointments',", "ARRAY["],
      ['waiting-room listener per refresh', 'idx', "if (!window._waitingRoomVisWired) {", "if (true) {"],
      ['patient card unscoped', 'pp', "{ t: 'patients', filter: 'id=eq.' + patientId }", "'patients'"],
      ['sidebar badges deferred behind modals', 'side', "refresh: refreshSidebarDynamic, hold: false", "refresh: refreshSidebarDynamic"],
      /* v626 */
      ['audit_log not published (M186)', 'm186', "ARRAY['clinic_doctors','clinic_employees','audit_log']", "ARRAY['clinic_doctors','clinic_employees']"],
      ['portal_requests filtered by a column it lacks (v628)', 'init', "    portal_requests: 'owner_id'   /* M187 · v628 */", "    portal_requests_x: 'owner_id'"],
      ['clinic_employees filtered by a column it lacks', 'init', "clinic_employees: 'owner_id', ", ""],
      ['repaint during an employee reorder drag', 'init', "if (d.querySelector('[draggable=\"true\"].dragging')) return true;", ""],
      ['doctors live path inserts the owner row', 'doc', "if (!hasOwnerRow && !live) {", "if (!hasOwnerRow) {"],
      ['employees live path self-heals the owner row', 'emp', "if (!live && window.SyDentLock && window.SyDentLock.ensureOwnerEmployee)", "if (window.SyDentLock && window.SyDentLock.ensureOwnerEmployee)"],
      ['half-saved reorder flashes', 'emp', "document.body.classList.add('sy-live-hold');\n", ""],
      ['payouts live failure paints an empty list', 'pay', "if (_payLiveFail) { doctors = snap.d; payouts = snap.p; sessions = snap.s; return; }", ""],
      ['activity log live drops loaded pages', 'aud', "var shown = Math.max(pageOffset, PAGE_SIZE);", "var shown = PAGE_SIZE;"],
      ['activity log live drops the row the list ended on', 'aud', "if (prevLast) { var li = rows.findIndex(function (r) { return r.id === prevLast; }); if (li > -1) cut = li + 1; }", ""],
      ['activity log live moves the reader', 'aud', "if (a) window.scrollBy(0, a.getBoundingClientRect().top - anchorTop);", ""],
      ['pill does not name the patient', 'aud', "var who = r.patient_name_snapshot ? ' · 👤 ' + r.patient_name_snapshot : '';", "var who = '';"],
      ['live uses unapplied dropdowns', 'aud', "function curFilters() { return _applied || readFilterSelects(); }", "function curFilters() { return readFilterSelects(); }"],
      ['transient failure paints zero counters', 'aud', "if (!totalRes.error) stats.total = totalRes.count || 0;", "stats.total = totalRes.count || 0;"],
      ['chosen employee lost on rebuild', 'aud', "    sel.value = prev;\n", ""],
      ['stale live result overwrites an applied filter', 'aud', "if (gen !== _logGen || _loadInFlight) return 'stale';", ""],
      ['live doctors failure toasts', 'doc', "if (error && live) { console.warn('live doctors refresh:', error); return; }", ""],
      ['live doctors falls back to the degraded filter', 'doc', "if (empQueryFailed && live) return;", ""],
      ['overtaken live event is dropped', 'aud', "if (gen !== _logGen || _loadInFlight) return 'stale';", "if (gen !== _logGen || _loadInFlight) return;"],
      ['load more duplicates rows after inserts', 'aud', "  allLogs = appendUnique(allLogs, batch);\n  renderLogs();", "  allLogs = allLogs.concat(batch);\n  renderLogs();"],
      ['live refresh resets with a spinner', 'aud', "  var gen = _logGen;\n", "  await loadLogs(true); var gen = _logGen;\n"]
    ];
    let bit = 0; const L = console.log; console.log = () => {};
    for (const [n, k, a, b] of mutants) {
      if (base[k].indexOf(a) < 0) { console.log = L; console.log('❌ طفرة لا تطابق المصدر: ' + n); process.exit(1); }
      let r; try { r = await run(Object.assign({}, base, { [k]: base[k].replace(a, b) })); } catch (e) { r = { fail: 1 }; }
      if (r.fail) bit++; else { console.log = L; console.log('❌ طفرة لم تعضّ: ' + n); process.exit(1); }
    }
    console.log = L;
    console.log('✅ prove-live: ' + main.pass + '/' + main.pass + ' توكيداً · ' + bit + '/' + mutants.length + ' طفرة تعضّ');
  } else console.log('✅ prove-live: ' + main.pass + '/' + main.pass + ' توكيداً');
})();
