#!/usr/bin/env node
/* M210 — مثبتُ جلسات المتابعة (ج1) على الكود الحيّ:
   pp-followup.js وخطّافاتُه (patient-profile.html · pp-plan.js · pp-timeline.js · pp-core.js · pp-dental.js) وقرّاءُ الجلسات
   (provider-reports.html · rpt-treat.js · acc-daysheet.js · accounting.html · index.html).
   (١) العقدُ الثابت: الترحيل (عمودان + شكلُ الصف + الحارسان + الدالتان بصلاحياتهما) · مرآةُ db/schema.sql · خطةُ البناء ·
       الأسلاك · الحرّاسُ المسجَّلة.
   (٢) النقيّ: الترتيبُ تحت الأساسية · الترقيم · الحالة · من يقبل المتابعة · الافتراضيُّ حسب التصنيف · منتقي الأساسية.
   (٣) العزل على الكود الحقيقي: مطابِقاتُ المخطط وstillUsed وكشفُ الحساب وتقريرُ العلاجات وكشفُ اليوم لا ترى صفَّ المتابعة
       (والمعاكس: صفٌّ يحمل سنّاً كان سيُبقي الرسم — لذلك تمنعه القاعدة).
   (٤) السلوك بمتصفحٍ وهمي (jsdom): جدولُ الجلسات الحقيقي (renderSessions) والنافذتان والحفظُ بالدالّة والإغلاق والحذف
       والقراءة فقط والهروب.
   (٥) الواجهة الإنجليزية: كلُّ نصٍّ يراه الطبيب يمرّ بالمحرّك الحقيقي.
   (٦) طفراتٌ متعمَّدة — كلٌّ منها يجب أن تُحمرّ توكيداً واحداً على الأقل (#342). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت جلسات المتابعة (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const { runMutants } = require('./mutant-pool');

const FILES = ['appointments.html', 'pp-appt.js', 'migrations/211_followup_need.sql', 'treatments.html', 'pp-clinical.js', 'pp-followup.js', 'patient-profile.html', 'patient-profile.css', 'pp-plan.js', 'pp-timeline.js', 'pp-core.js', 'pp-dental.js', 'supabase-init.js',
  'provider-reports.html', 'rpt-treat.js', 'acc-daysheet.js', 'accounting.html', 'index.html', 'i18n-en.js', 'theme.js', 'pp-extras.js', 'guides.js',
  'migrations/210_followup_sessions.sql', 'db/schema.sql', 'scripts/db-bootstrap.py', 'scripts/cache-bust.sh', 'scripts/check-mirrors.js',
  'scripts/check-modal-behaviour.js', 'scripts/validate.sh', 'scripts/followup-db.sql', 'migrations/213_followup_plan.sql', 'migrations/214_followup_keep_open.sql', 'migrations/216_appt_followup_date_sync.sql'];
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
const AR = /[؀-ۿ]/;

/* ── أدوات الاقتطاع ── */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('لم أجد function ' + name);
  let i = src.indexOf('{', start), depth = 0, inS = null, inLC = false, inBC = false, inRe = false, prev = '';
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && n === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === '\\') { i++; continue; } if (c === inS) inS = null; continue; }
    if (inRe) { if (c === '\\') { i++; continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { inLC = true; i++; continue; }
    if (c === '/' && n === '*') { inBC = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '/' && /[=(,:[!&|?;{}\n]/.test(prev)) { inRe = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('أقواس غير متوازنة عند ' + name);
}
function between(src, a, b, what) {
  const i = src.indexOf(a), j = i < 0 ? -1 : src.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('الاقتطاعُ فشل: ' + what);
  return src.slice(i, j);
}
function objLiteral(src, name) {   /* var NAME = { … }; */
  const i = src.indexOf('var ' + name + ' = {');
  if (i < 0) throw new Error('لم أجد ' + name);
  return src.slice(i, src.indexOf('};', i) + 2);
}

/* ── المحرّك الإنجليزي الحقيقي (نمطُ prove-i18n-render) ── */
function engine(F) {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = {
    console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/patient-profile.html', reload() {} },
    document: {
      readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(),
      write() {}, querySelector: () => null, getElementById: () => null, addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} })
    },
    MutationObserver: function () { this.observe = () => {}; }
  };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const theme = F['theme.js'], start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(F['i18n-en.js'], ctx);
  vm.runInContext(theme.slice(start, end), ctx);
  return s => ctx.window.SyI18n.t(s);
}

/* ── بياناتُ الاختبار: أسماءٌ لاتينية لبيانات العيادة ⇒ أيُّ عربيةٍ تبقى بعد الترجمة نصُّ واجهةٍ بلا ترجمة ── */
const TODAY = '2026-11-17';
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const P7 = addDays(TODAY, 7), PMAX = addDays(TODAY, 730);
const TREATS = [
  { treatment_key: 'root-canal', id: 'root-canal', name: 'RCT', fill: '#a78bfa', stroke: '#7c5cbf', category: 'endodontics', target_part: 'root', is_active: true, needs_lab: false },
  { treatment_key: 'crown', id: 'crown', name: 'Crown PFM', fill: '#ff6b00', stroke: '#b34b00', category: 'prosthodontics', target_part: 'crown_full', is_active: true, needs_lab: true },
  { treatment_key: 'treated', id: 'treated', name: 'Filling', fill: '#312f27', stroke: '#22211b', category: 'restorative', target_part: 'crown', is_active: true, needs_lab: false },
  { treatment_key: 'denture-adjust', id: 'denture-adjust', name: 'Adjust DENT', fill: '#fbcfe8', stroke: '#be185d', category: 'prosth_removable', target_part: 'arch', is_active: true, denture_svc: 'service' }
];
const S = (id, o) => Object.assign({ id, doctor_id: 'doc-1', patient_id: 'pat-1', type: 'RCT', treatment_key: null, description: '', cost: 0, date: '2026-11-01',
  notes: '', tooth_num: null, surface: null, status: 'completed', provider_id: 'd1', appointment_id: null, quadrant: null, arch: null, currency: 'SYP',
  created_at: '2026-11-01T08:00:00Z', parent_id: null, followup_state: null }, o || {});
const seed = () => [
  S('b1', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '36', surface: 'R1', cost: 7000, date: '2026-11-08', created_at: '2026-11-08T09:00:00Z', description: 'السن رقم 36 — R1' }),
  S('b2', { type: 'Crown PFM', treatment_key: 'crown', tooth_num: '16', surface: 'CROWN_FULL', cost: 9000, date: '2026-11-10', created_at: '2026-11-10T09:00:00Z', provider_id: 'd2' }),
  S('pl', { type: 'Filling', treatment_key: 'treated', tooth_num: '25', surface: 'O', cost: 3000, date: '2026-11-12', status: 'planned', created_at: '2026-11-12T09:00:00Z' }),
  S('fee', { type: 'رسم موعد لم يحضر', description: 'رسم عدم الحضور', cost: 500, date: '2026-11-05', created_at: '2026-11-05T09:00:00Z' }),
  S('ob', { type: 'رصيد سابق (قبل SyDent)', description: 'ذمة سابقة من قبل استخدام SyDent', cost: 2000, date: '2026-10-01', created_at: '2026-10-01T09:00:00Z' }),
  S('fr', { type: 'Consult', cost: 100, date: '2026-11-03', created_at: '2026-11-03T09:00:00Z' })
];

/* ── (٣-أ) وحدةُ المتابعة النقيّة بسياق vm ── */
function fuModule(F, sessions) {
  const ctx = { console, sessions: sessions || [], TREATMENTS: TREATS, window: {}, document: { getElementById: () => null },
    getTreatment: k => TREATS.find(t => t.treatment_key === k) || null, sessionTreatmentKey: s => s.treatment_key,
    sessionToothChipText: (n) => 'سن ' + n, QUADRANT_LABELS: { UR: 'الربع العلوي الأيمن' }, ARCH_LABELS: { U: 'الفك العلوي', L: 'الفك السفلي' } };
  vm.createContext(ctx); vm.runInContext(F['pp-followup.js'], ctx);
  return ctx;
}

/* ── (٤) الصفحةُ الوهمية: الجدولُ الحقيقي والنافذتان الحقيقيتان ── */
function page(F) {
  const PP = F['patient-profile.html'], PD = F['pp-dental.js'], SI = F['supabase-init.js'], PC = F['pp-core.js'];
  const modals = between(PP, '<div class="modal-overlay sy-m sy-m-md" id="fuModal">', '<div class="modal-overlay sy-m" id="sessionModal">', 'نافذتا المتابعة');
  const entry = between(PP, '<div class="modal-overlay sy-m sy-m-md" id="newSessionEntryModal">', '<div class="modal-overlay sy-m sy-m-md" id="fuModal">', 'نافذة «جلسة جديدة»').replace(/<!--[\s\S]*?-->/g, '');
  const sydt = between(SI, 'window.SyDT = (function () {', '/* ═══ SySlots', 'SyDT'), slots = between(SI, 'window.SySlots = {', '/* ═══════════════ SyLive', 'SySlots');
  const stubs = `
    window.__TOASTS = []; window.__RPC = []; window.__AUDIT = []; window.__DIALOGS = []; window.__confirm = true; window.__rpcFail = null; window.__ro = false; window.__tl = 0; window.__ri = 0; window.__UPD = []; window.__updFail = null;
    var currentUser = { id: 'doc-1' }, patientId = 'pat-1', patient = { id: 'pat-1', name: 'Test Patient' };
    var sessions = [], payments = [], adjustments = [], paymentSplits = [];
    var TREATMENTS = ${JSON.stringify(TREATS)};
    var CLINIC_DOCTORS = [{ id: 'd1', name: 'Dr Owner', is_owner: true, is_active: true, color: 'var(--green)' }, { id: 'd2', name: 'Dr Two', is_active: true }, { id: 'd3', name: 'Dr Off', is_active: false }];
    function getTreatment(k) { for (var i = 0; i < TREATMENTS.length; i++) if (TREATMENTS[i].treatment_key === k) return TREATMENTS[i]; return null; }
    function sessionTreatmentKey(s) { return s.treatment_key; }
    function isSxSurface() { return false; }
    function getDefaultProviderId(p) { return p && p[0] ? p[0].id : null; }
    function computeSessionPaid() { return 0; } function _epsFor() { return 0.5; }
    function _rowCur(r) { return r.currency === 'USD' ? 'USD' : 'SYP'; } function _rowLbl(r) { return r.currency === 'USD' ? '$' : 'ل.س'; }
    function toDay() { return '${TODAY}'; }
    function ppGuarded(n, f) { return f; }
    function showToast(m) { window.__TOASTS.push(String(m)); }
    function openModal(id) { var e = document.getElementById(id); if (e) e.classList.add('open'); }
    function closeModal(id) { var e = document.getElementById(id); if (e) e.classList.remove('open'); }
    function renderTimeline() { window.__tl++; }
    var pendingToothStatus = null, pendingTreatStatus = 'completed';   /* نافذةُ السن (pp-dental.js) */
    var _sessStatus = 'completed';   /* نافذةُ «جلسة جديدة» */
    function isConditionKey(k) { return k === 'caries'; }
    function renderInfo() { window.__ri++; }
    window.SyDentSub = { blockReadOnly: function () { return window.__ro; }, isReadOnly: function () { return window.__ro; } };
    window.SyDialog = { confirm: function (o) { window.__DIALOGS.push(o); return Promise.resolve(window.__confirm); } };
    /* M213: نافذةُ الموعد ببطاقة المريض (pp-appt.js) — تفتح بوضع الإنشاء ومخزنُ «سيُربط» فارغ؛ __apptBlock = حُجبت (قراءة فقط) */
    var _pendingAttachmentsPP = [], editingApptId = null; window.__appt = 0; window.__apptBlock = false; window.__pend = null;
    function openApptModal() { window.__appt++; if (window.__apptBlock) return; editingApptId = null; _pendingAttachmentsPP = []; document.getElementById('aDate').value = '${TODAY}'; document.getElementById('apptModal').classList.add('open'); return Promise.resolve(); }
    function renderApptProcedureListPP() { window.__pend = _pendingAttachmentsPP.map(function (x) { return x.id; }); }
    function planRowCtlHtml() { return '<span class="PLANCTL"></span>'; }
    window.logAudit = function (a, o) { window.__AUDIT.push({ action: a, o: o }); };
    /* القاعدةُ الوهمية بدلالة M210: الأساسيةُ منجزة وليست متابعة · التاريخُ بين تاريخها واليوم · الحالةُ تتبع p_close */
    window.__DB = []; var __n = 0;
    window.sb = { rpc: function (fn, a) {
      window.__RPC.push({ fn: fn, a: a });
      if (window.__rpcFail) return Promise.resolve({ data: null, error: { message: window.__rpcFail } });
      var b = window.__DB.filter(function (x) { return x.id === (a.p_parent || a.p_session); })[0];
      if (fn === 'session_followup_add') {
        if (!b || b.parent_id || (b.status || 'completed') !== 'completed') return Promise.resolve({ data: null, error: { message: 'followup_base_invalid' } });
        if (!a.p_date || a.p_date > '${TODAY}' || (b.date && a.p_date < b.date)) return Promise.resolve({ data: null, error: { message: 'followup_date_invalid' } });
        var c = { id: 'c' + (++__n), doctor_id: b.doctor_id, patient_id: b.patient_id, type: 'متابعة — ' + b.type, description: a.p_step, cost: 0, date: a.p_date, notes: a.p_notes,
          status: 'completed', provider_id: a.p_provider || b.provider_id, currency: b.currency, parent_id: b.id, tooth_num: null, surface: null, treatment_key: null, quadrant: null, arch: null,
          appointment_id: null, followup_state: null, created_at: '2026-11-17T10:0' + __n + ':00Z' };
        window.__DB.push(c); b.__state = a.p_close ? 'closed' : 'open';
        return Promise.resolve({ data: { session: JSON.parse(JSON.stringify(c)), state: b.__state }, error: null });
      }
      if (fn === 'session_followup_plan') {   /* M213: منجزةٌ ليست متابعة · من اليوم إلى سنتين ولا قبل الأساسية · مخطّطةٌ بلا مال */
        if (!b || b.parent_id || (b.status || 'completed') !== 'completed') return Promise.resolve({ data: null, error: { message: 'followup_base_invalid' } });
        if (!a.p_date || a.p_date < '${TODAY}' || a.p_date > '${PMAX}' || (b.date && a.p_date < b.date)) return Promise.resolve({ data: null, error: { message: 'followup_date_invalid' } });
        var pc = { id: 'c' + (++__n), doctor_id: b.doctor_id, patient_id: b.patient_id, type: 'متابعة — ' + b.type, description: a.p_step, cost: 0, date: a.p_date, notes: a.p_notes,
          status: 'planned', provider_id: a.p_provider || b.provider_id, currency: b.currency, parent_id: b.id, tooth_num: null, surface: null, treatment_key: null, quadrant: null, arch: null,
          appointment_id: null, followup_state: null, created_at: '2026-11-17T11:0' + __n + ':00Z' };
        window.__DB.push(pc); b.__state = 'open';
        return Promise.resolve({ data: { session: JSON.parse(JSON.stringify(pc)), state: 'open' }, error: null });
      }
      if (fn === 'session_followup_set_state') {   /* M211: open بلا متابعات · closed يشترطها · null يمسح أساسيةً بلا متابعات */
        var kids = !!b && window.__DB.some(function (x) { return x.parent_id === b.id; });
        if (!b || b.parent_id || (b.status || 'completed') !== 'completed' || (a.p_state === 'closed' && !kids)) return Promise.resolve({ data: null, error: { message: 'followup_base_invalid' } });
        if (a.p_state == null && kids) return Promise.resolve({ data: null, error: { message: 'followup_base_has_children' } });
        b.__state = a.p_state == null ? null : a.p_state; return Promise.resolve({ data: { id: b.id, state: b.__state }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'PGRST202 unknown function' } });
    } };
    /* patients.update(...).eq().eq() — «آخر زيارة» بعد حفظ المتابعة */
    window.sb.from = function (t) { return { update: function (v) { var q = { t: t, v: v, eq: [] }; var th = {
      eq: function (c, x) { q.eq.push(c + '=' + x); return th; },
      then: function (res, rej) { window.__UPD.push(q); return Promise.resolve({ data: null, error: window.__updFail ? { message: window.__updFail } : null }).then(res, rej); } }; return th; } }; };
    window.__patient = function () { return patient; };
    window.__load = function (rows) { sessions = JSON.parse(JSON.stringify(rows)); window.__DB = JSON.parse(JSON.stringify(rows)); };
    window.__sessions = function () { return sessions; };
  `;
  const real = [
    sydt, slots,
    extractFunction(PP, 'escapeHtml'),
    extractFunction(PC, 'fmt'), extractFunction(PC, 'fmtD'), extractFunction(PC, 'sortByDateDesc'),
    extractFunction(PD, 'sessionToothChipText'),
    objLiteral(PD, 'STATUS_LABELS'), objLiteral(PD, 'STATUS_TONES'), objLiteral(PD, 'QUADRANT_LABELS'), objLiteral(PD, 'ARCH_LABELS'),
    extractFunction(F['pp-plan.js'], 'sessionsForTable'),
    extractFunction(PP, 'renderSessions'), extractFunction(PP, 'renderRecentSessions'), extractFunction(PP, 'sessFitCheck'),
    F['pp-followup.js']
  ].map(x => '<script>' + x.replace(/<\/script/gi, '<\\/script') + '</script>').join('\n');
  const need = between(PP, '<!-- M211 (ج2-أ): «يحتاج جلسات متابعة» — للعلاج المنجز', '<div class="form-group" id="providerPickerGroup"', 'مفتاح «يحتاج جلسات متابعة»')
    + '<select id="sType"><option value="">—</option><option value="root-canal">RCT</option><option value="treated">Filling</option><option value="_other">أخرى</option></select>'
    + between(PP, '<!-- M211 (ج2-أ): «يحتاج جلسات متابعة» بنافذة «جلسة جديدة»', '<!-- Backlog #9 (M95)', 'مفتاح «جلسة جديدة»');
  return '<!doctype html><html dir="rtl" lang="ar"><body><div id="sessionsContent"></div><div id="recentSessionsList"></div>' + need + entry + modals
    + '<div class="modal-overlay" id="apptModal"><select id="aType"><option value="amalgam">Amalgam</option><option value="root-canal">RCT</option></select><input type="date" id="aDate"><select id="aProvider"><option value="d1">Dr Owner</option><option value="d2">Dr Two</option></select></div>'
    + '<script>' + stubs + '</script>' + real + '</body></html>';
}
function boot(F) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e && (e.detail || e.message || e))));
  const dom = new JSDOM(page(F), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  dom.window.__errors = errors;
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 20)));
}
const tick = (w, ms) => new Promise(r => w.setTimeout(r, ms || 15));
const rows = w => Array.from(w.document.querySelectorAll('#sessionsContent tr[data-test="pp-session-row"]'));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
function grab(w, sel, bag) {
  w.document.querySelectorAll(sel).forEach(r => [r].concat(Array.from(r.querySelectorAll('*'))).forEach(el => {
    if (el.nodeName === 'SCRIPT' || el.nodeName === 'TEXTAREA' && false) return;
    ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v && AR.test(v)) bag.push({ t: v }); });
    for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && AR.test(c.nodeValue)) bag.push({ t: c.nodeValue, en: el.getAttribute('data-en') });
  }));
}

async function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]), bag0 = [];
  const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' — threw: ' + (e && e.message)); } };

  /* ═══ (١) العقدُ الثابت ═══ */
  await guard('static', () => {
    const M = F['migrations/210_followup_sessions.sql'], SC = F['db/schema.sql'], PP = F['patient-profile.html'];
    ok(/ADD COLUMN IF NOT EXISTS parent_id uuid;/.test(M) && /ADD COLUMN IF NOT EXISTS followup_state text;/.test(M) && /ALTER TABLE public\.treatments\s+ADD COLUMN IF NOT EXISTS multi_visit boolean;/.test(M),
      'M210: two nullable session columns and the catalog tri-state');
    ok(/FOREIGN KEY \(parent_id\) REFERENCES public\.ledger_sessions\(id\) ON DELETE CASCADE/.test(M) && /CREATE INDEX IF NOT EXISTS idx_sessions_parent/.test(M), 'M210: self FK with cascade + partial index');
    const shape = (M.match(/ADD CONSTRAINT ledger_sessions_followup_shape\s+CHECK \(([\s\S]*?)\);\n/) || [])[1] || '';
    ok(/parent_id IS NULL/.test(shape) && /parent_id <> id/.test(shape) && /cost IS NOT NULL AND cost = 0/.test(shape), 'M210 shape: a follow-up never carries money');
    ok(['tooth_num', 'surface', 'treatment_key', 'quadrant', 'arch', 'unit_teeth', 'denture_unit', 'denture_add', 'plan_option', 'phase', 'units', 'ortho_start', 'ortho_months', 'followup_state']
      .every(c => new RegExp('\\b' + c + ' IS NULL').test(shape)), 'M210 shape: a follow-up has no place, key, plan slot or state of its own');
    ok(/status = ANY \(ARRAY\['completed'::text, 'planned'::text\]\)/.test(shape), 'M210 shape: financial statuses only');
    ok(/ADD CONSTRAINT ledger_sessions_followup_state_valid\s+CHECK \(followup_state IS NULL\s+OR \(followup_state = ANY \(ARRAY\['open'::text, 'closed'::text\]\) AND parent_id IS NULL AND status = 'completed'\)\);/.test(M),
      'M210: the state lives on a completed base only');
    const grd = between(M, 'CREATE OR REPLACE FUNCTION public.ledger_sessions_followup_guard()', 'DROP TRIGGER IF EXISTS trg_followup_guard', 'guard');
    ok(/CREATE TRIGGER trg_followup_guard BEFORE INSERT OR UPDATE ON public\.ledger_sessions/.test(M) && /'followup_link_fixed'/.test(grd) && /'followup_base_invalid'/.test(grd) && /'followup_base_has_children'/.test(grd)
      && /b\.doctor_id IS DISTINCT FROM NEW\.doctor_id/.test(grd) && /b\.patient_id IS DISTINCT FROM NEW\.patient_id/.test(grd) && /b\.parent_id IS NOT NULL/.test(grd) && /COALESCE\(b\.status, 'completed'\) <> 'completed'/.test(grd)
      && /b\.currency IS DISTINCT FROM NEW\.currency/.test(grd) && /NEW\.parent_id IS DISTINCT FROM OLD\.parent_id/.test(grd), 'M210 guard: fixed link · one level · same clinic, patient and currency · protected base');
    ok('trg_currency_ledger_sessions' < 'trg_followup_guard', 'M210 guard fires after the currency guard (name order)');
    ok(/CREATE TRIGGER trg_followup_after_delete AFTER DELETE ON public\.ledger_sessions/.test(M) && /SET followup_state = NULL/.test(M), 'M210: the last follow-up deleted frees the base');
    const add = between(M, 'CREATE OR REPLACE FUNCTION public.session_followup_add(', 'REVOKE ALL ON FUNCTION public.session_followup_add', 'add');
    ok(/SECURITY INVOKER SET search_path = public/.test(add) && /doctor_id = \(SELECT auth\.uid\(\)\) FOR UPDATE/.test(add) && /VALUES\s*\(b\.doctor_id, b\.patient_id,/.test(add)
      && /v_step, 0, p_date, v_notes, 'completed', COALESCE\(p_provider, b\.provider_id\), b\.currency, b\.id\)/.test(add), 'RPC add: invoker · base locked · the row is built from the base with cost 0');
    ok(/d\.owner_id = b\.doctor_id/.test(add) && /'followup_provider_invalid'/.test(add) && /'followup_date_invalid'/.test(add) && /p_date < b\.date/.test(add), 'RPC add: provider ownership and date window');
    ok(/UPDATE public\.ledger_sessions SET followup_state = v_state WHERE id = b\.id;/.test(add), 'RPC add: the base state changes in the same call');
    ok(/REVOKE ALL ON FUNCTION public\.session_followup_add\(uuid, date, uuid, text, text, boolean\) FROM PUBLIC, anon;\s*GRANT EXECUTE ON FUNCTION public\.session_followup_add\(uuid, date, uuid, text, text, boolean\) TO authenticated;/.test(M)
      && /REVOKE ALL ON FUNCTION public\.session_followup_set_state\(uuid, text\) FROM PUBLIC, anon;\s*GRANT EXECUTE ON FUNCTION public\.session_followup_set_state\(uuid, text\) TO authenticated;/.test(M),
      'both RPCs granted to authenticated only, by name');
    ok(!/realloc_patient_splits|payment_splits|portal_info\(/.test(M.replace(/^--.*$/gm, '')), 'M210 touches no financial or portal function');
    ok(/"parent_id" "uuid",\n\s+"followup_state" "text",/.test(SC) && /CONSTRAINT "ledger_sessions_followup_shape" CHECK/.test(SC) && /CONSTRAINT "ledger_sessions_followup_state_valid" CHECK/.test(SC)
      && /"ledger_sessions_parent_id_fkey" FOREIGN KEY \("parent_id"\) REFERENCES "public"\."ledger_sessions"\("id"\) ON DELETE CASCADE/.test(SC)
      && /CREATE INDEX "idx_sessions_parent"/.test(SC) && /"multi_visit" boolean,/.test(SC), 'db/schema.sql mirrors M210 (columns, checks, FK, index)');
    ok(/'migrations\/210_followup_sessions\.sql',/.test(F['scripts/db-bootstrap.py']), 'M210 is in the build plan');
    ok(F['scripts/cache-bust.sh'].split('pp-followup\\.js|').length === 3 && /pp-followup\.js · /.test(F['scripts/cache-bust.sh']), 'pp-followup.js is a cache-busted asset');
    ok(/'pp-followup\.js'\];\n\s+const PP_WRITE/.test(F['scripts/check-mirrors.js']) && /'fuOpenPicker', 'fuOpen', 'fuSave',/.test(F['scripts/check-mirrors.js'])
      && /'endToothWatch', 'fuSetState'/.test(F['scripts/check-mirrors.js']) && /'fuStepPick', 'fuPickBase',/.test(F['scripts/check-mirrors.js']) && /'pp-followup\.js': 0/.test(F['scripts/check-mirrors.js']),
      'read-only registry: entries are write (hidden), the state badge is guarded (stays visible), chips are inert');
    ok(/prove-followup\.js" --self-test/.test(F['scripts/validate.sh']), 'the prover is in the gate with its mutations');
    const css = F['patient-profile.css'];
    ok(/\[onclick\*="fuOpenPicker\("\],\[onclick\*="fuOpen\("\],\[onclick\*="fuSave\("\],/.test(css) && !/\[onclick\*="fuSetState\("\]/.test(css), 'read-only CSS hides the three write entries and keeps the state badge');
    /* الأسلاك */
    const iM = PP.indexOf('<script src="pp-modules.js?v='), iD = PP.indexOf('<script src="pp-denture-svc.js?v='), iF = PP.indexOf('<script src="pp-followup.js?v='), iP = PP.indexOf('<script src="pp-plan.js?v=');
    ok(iM > -1 && iF > iD && iD > iM && iP > iF, 'pp-followup.js loads after pp-modules.js (ppGuarded) and the denture modules');
    ok((PP.match(/id="fuModal"/g) || []).length === 1 && (PP.match(/id="fuPickModal"/g) || []).length === 1 && /onclick="fuOpenPicker\(\)"/.test(PP) && /id="fuSaveBtn" onclick="fuSave\(\)"/.test(PP), 'both windows and the «جلسة جديدة» entry exist once');
    ok(!/id="fu(Cost|Price)"/.test(PP) && !/fuCost|p_cost/.test(F['pp-followup.js'].replace(/fu-cost/g, '')), 'the follow-up window has no cost field at all');
    const rs = extractFunction(PP, 'renderSessions');
    ok(/_tableRows = fuOrder\(_tableRows\)/.test(rs) && /fuChildView\(s\)/.test(rs) && /fuStateBadge\(s\)/.test(rs) && /fuCellChips\(s\)/.test(rs) && !/fuRowButton|fuAddChip/.test(rs.slice(rs.indexOf('sc-actions'))) && /class="sc-cost sess-cost fu-cost"/.test(rs),
      'renderSessions: order · child view · state badge · row button · cost cell');
    const del = extractFunction(PP, '_delSession_inner');
    ok(/fuChildren\(sess\.id\)/.test(del) && /var _fuTail = _fuKids\.length \? '\\n\\n' \+ fuDeleteNote\(_fuKids\.length\) : '';/.test(del) && /SyDialog\.confirm\(\{ message: 'حذف هذه الجلسة؟' \+ _fuTail, danger: true \}\)/.test(del)
      && del.indexOf('fuDeleteNote(') < del.indexOf(".from('ledger_sessions').delete()"), 'delete: the follow-ups are named in the confirmation, before any write');
    ok(/sessions = sessions\.filter\(function\(s\)\{ return s\.id !== id && s\.parent_id !== id; \}\);/.test(del) && /_fuB\.followup_state = null;/.test(del), 'delete: local list mirrors the cascade and the freed base');
    ok(/fuDeleteNote\(fk\)/.test(extractFunction(F['pp-dental.js'], 'askDeleteCompletedToothSessions')), 'chart removal names the follow-ups that go with a completed session');
    /* القرّاء */
    ok(/var sessionCount = provSessions\.filter\(function\(s\)\{ return !s\.parent_id; \}\)\.length;/.test(F['provider-reports.html'])
      && /sessions: sessions\.filter\(function\(s\)\{ return !s\.parent_id; \}\)\.length,/.test(F['provider-reports.html']) && /currency,date,parent_id'/.test(F['provider-reports.html']),
      'provider reports: the session count is procedures (current and previous period)');
    ok(/select\('id, patient_id, provider_id, tooth_num, cost, date, status, type, currency, parent_id'\)/.test(F['accounting.html'])
      && /sessions = \(res\.data \|\| \[\]\)\.filter\(function\(s\)\{ return !s\.parent_id; \}\);/.test(F['accounting.html']), 'accounting: follow-ups are outside production');
    ok(/select\('type,description,status,date,parent_id'\)/.test(F['index.html']) && /if \(s\.parent_id\) return;\s+\/\/ M210/.test(F['index.html']), 'dashboard: «most frequent treatments» skips follow-ups');
    ok(/if \(typeof fuIsChild === 'function' && fuIsChild\(s\)\) \{\s+var _fuW = fuWhereText\(fuBaseOf\(s\)\);/.test(F['pp-timeline.js']), 'timeline: a follow-up shows its base place');
    ok(/fuIsChild\(s\)\) \? fuWhereText\(fuBaseOf\(s\)\) : ''\)/.test(F['pp-core.js']) && /fuIsChild\(s\)\) \? '—' : fmt\(s\.cost\)/.test(F['pp-core.js']), 'printed record: place from the base, no «0» cost');
  });

  /* ═══ (٢) النقيّ ═══ */
  await guard('pure', () => {
    const list = seed().concat([
      S('k2', { parent_id: 'b1', type: 'متابعة — RCT', description: 'second', date: '2026-11-12', created_at: '2026-11-12T10:00:00Z' }),
      S('k1', { parent_id: 'b1', type: 'متابعة — RCT', description: 'first', date: '2026-11-09', created_at: '2026-11-09T10:00:00Z' }),
      S('k3', { parent_id: 'b1', type: 'متابعة — RCT', description: 'third same day', date: '2026-11-12', created_at: '2026-11-12T11:00:00Z' }),
      S('orph', { parent_id: 'gone', type: 'متابعة — X', date: '2026-11-02' })
    ]);
    const C = fuModule(F, list);
    ok(C.fuChildren('b1').map(x => x.id).join() === 'k1,k2,k3' && C.fuIndex(list.find(x => x.id === 'k3')) === 3 && C.fuIndex(list[0]) === 0, 'children are chronological and numbered by position');
    const sorted = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const ord = C.fuOrder(sorted).map(x => x.id);
    ok(ord.join() === ['pl', 'b2', 'b1', 'k1', 'k2', 'k3', 'fee', 'fr', 'orph', 'ob'].join(), 'fuOrder nests each follow-up under its base and keeps the base order (' + ord.join() + ')');
    ok(C.fuOrder(sorted).length === sorted.length && C.fuOrder([]).length === 0 && C.fuOrder(null).length === 0, 'fuOrder loses and invents nothing');
    const by = id => list.find(x => x.id === id);
    ok(C.fuCanFollow(by('b1')) && C.fuCanFollow(by('fr')) && !C.fuCanFollow(by('pl')) && !C.fuCanFollow(by('k1')) && !C.fuCanFollow(by('fee')) && !C.fuCanFollow(by('ob')) && !C.fuCanFollow(null),
      'a follow-up attaches to a completed treatment only — not planned, not a follow-up, not a fee or opening balance');
    ok(C.fuState({ followup_state: 'open' }) === 'open' && C.fuState({ followup_state: 'closed' }) === 'closed' && C.fuState({ followup_state: 'x' }) === '' && C.fuState({ parent_id: 'b', followup_state: 'open' }) === '',
      'the state is read from a base only, two values');
    ok(C.fuMultiVisitDefault(TREATS[0]) && C.fuMultiVisitDefault(TREATS[1]) && !C.fuMultiVisitDefault(TREATS[2]) && !C.fuMultiVisitDefault(TREATS[3]),
      'default by category: endo and fixed prosthetics yes · restorative no · a denture service no');
    ok(['endodontics', 'prosthodontics', 'prosth_cosmetic', 'prosth_removable', 'implantology', 'orthodontics'].every(c => C.fuMultiVisitDefault({ category: c }))
      && ['restorative', 'surgical', 'preventive', 'diagnostic', 'periodontics', 'pediatric', 'cosmetic', 'other', ''].every(c => !C.fuMultiVisitDefault({ category: c })), 'the owner\'s six categories, no other');
    ok(C.fuMultiVisit(Object.assign({}, TREATS[2], { multi_visit: true })) === true && C.fuMultiVisit(Object.assign({}, TREATS[0], { multi_visit: false })) === false && C.fuMultiVisit(null) === false,
      'the clinic\'s explicit choice wins over the default');
    ok(C.fuStepsFor('endodontics')[0] === 'غسل أقنية' && C.fuStepsFor('nope').join() === C.fuStepsFor('').join() && C.fuStepsFor('endodontics') !== C.fuStepsFor('endodontics'), 'step chips by category with a default, returned as a copy');
    ok(Object.keys(C.FU_STEPS).every(k => C.FU_STEPS[k].every(s => s.length <= 40 && s === s.trim())), 'every chip is short and trimmed');
    ok(C.fuProcedures(list).length === list.length - 4 && C.fuProcedures(null).length === 0, 'fuProcedures drops follow-ups only');
    ok(C.fuDeleteNote(3) === 'جلسات المتابعة المرتبطة بها (3) تُحذف معها' && C.fuDeleteNote(0) === '', 'one sentence for the delete warning');
    ok(C.fuWhereText(by('b1')) === 'سن 36' && C.fuBaseLabel(by('b1')) === 'RCT — سن 36' && C.fuWhereText(by('fr')) === '' && C.fuWhereText({ arch: 'U' }) === 'الفك العلوي', 'the place is the base place');
    by('b1').followup_state = 'open'; by('fr').followup_state = 'closed';
    const pick = C.fuPickRows().map(x => x.id);
    ok(pick.join() === 'b1,b2,fr', 'picker: in progress first, then multi-visit, then the rest — never planned, fee or follow-up (' + pick.join() + ')');
  });

  /* ═══ (٣) العزل على الكود الحقيقي ═══ */
  await guard('isolation', () => {
    const PD = F['pp-dental.js'], PP = F['patient-profile.html'];
    const legal = [S('k1', { parent_id: 'b1', date: '2026-11-09' }), S('k2', { parent_id: 'b1', date: '2026-11-10', status: 'planned' })];
    const illegal = [S('x1', { parent_id: 'b1', tooth_num: '36', surface: 'R1', treatment_key: 'root-canal', date: '2026-11-09' }), S('x2', { parent_id: 'b1', tooth_num: '36', status: 'planned', date: '2026-11-10' })];
    const chart = rowsIn => {
      const ctx = { sessions: rowsIn, centerSurface: () => 'O', sessionTreatmentKey: s => s.treatment_key };
      vm.createContext(ctx);
      vm.runInContext([extractFunction(PD, 'isUnitLedgerSession'), extractFunction(PD, 'plannedToothSessions'), extractFunction(PD, 'completedToothSessionsForRows')].join('\n'), ctx);
      const base = rowsIn.find(x => x.id === 'b1');
      const still = vm.runInContext('(function(sess){ var sessSurface = sess.surface || centerSurface(sess.tooth_num); ' + between(PP, 'var stillUsed = sessions.some(function(s){', '    /* M145-e: جلسةُ زرعةٍ بديلة', 'stillUsed') + ' return stillUsed; })', ctx);
      const rest = rowsIn.filter(x => x.id !== 'b1'); ctx.sessions = rest;
      return { planned: ctx.plannedToothSessions(36).map(x => x.id).join(), done: ctx.completedToothSessionsForRows(36, [{ key: 'root-canal', st: 'completed', sf: 'R1' }]).map(x => x.id).join(),
        stillUsed: still(base) };
    };
    const a = chart(seed()), b = chart(seed().concat(legal)), c = chart(seed().concat(illegal));
    ok(a.planned === b.planned && a.done === b.done && a.stillUsed === false && b.stillUsed === false, 'the chart engine does not see a follow-up: planned and completed matchers and stillUsed are unchanged');
    ok(c.stillUsed === true && c.planned !== a.planned, 'counter-proof: a follow-up carrying a tooth would keep the drawing after its base is deleted — hence the shape check');
    /* كشفُ الحساب */
    const stmt = rowsIn => { const ctx = { sessions: rowsIn, payments: [], adjustments: [], adjKindLabel: k => k }; vm.createContext(ctx); vm.runInContext(extractFunction(F['pp-plan.js'], 'stmtAllRows'), ctx); return JSON.stringify(ctx.stmtAllRows()); };
    ok(stmt(seed()) === stmt(seed().concat(legal)) && JSON.parse(stmt(seed())).length === 5, 'the account statement is byte-identical with follow-ups');
    /* تقريرُ العلاجات */
    const rt = (() => { const w = {}; const ctx = { window: w, console }; vm.createContext(ctx); vm.runInContext(F['rpt-treat.js'], ctx); return w.SyRptTreat; })();
    const done = seed().filter(x => x.status === 'completed'), kids = [S('k1', { parent_id: 'b1', type: 'متابعة — RCT' }), S('k3', { parent_id: 'b2', type: 'متابعة — Crown PFM' })];
    const A1 = rt.aggregate(done, TREATS), A2 = rt.aggregate(done.concat(kids), TREATS);
    ok(A1.total.n === A2.total.n && A1.total.prod === A2.total.prod && A1.rows.length === A2.rows.length && A2.rows.every(r => r.sessions.every(s => !s.parent_id)), 'treatments report: counts, production and rows unchanged by follow-ups');
    /* كشفُ اليوم */
    const ds = (() => { const w = {}; const ctx = { window: w, console, Date, Math, Number, String, Object, Array, JSON, Promise, parseFloat, parseInt, isFinite }; vm.createContext(ctx); vm.runInContext(F['acc-daysheet.js'], ctx); return w.SyDentDaySheet; })();
    const dayData = extra => ({ sessions: [S('d1', { cost: 1000, date: TODAY }), S('d2', { cost: 500, date: TODAY })].concat(extra || []), payments: [], adjustments: [], expenses: [], labPayments: [], payouts: [], closings: [] });
    const L = r => r && r.SYP;
    const R1 = ds.compute(dayData(), TODAY), R2 = ds.compute(dayData([S('dk', { parent_id: 'd1', cost: 0, date: TODAY, description: 'Fit' })]), TODAY);
    ok(L(R1) && L(R1).production.count === 2 && L(R2).production.count === 2 && L(R2).production.total === 1500 && (L(R2).production.items || []).length === (L(R1).production.items || []).length,
      'day sheet: production count, total and lines unchanged by a follow-up');
    ok(/select\('id,patient_id,description,tooth_num,cost,status,currency,date,parent_id'\)/.test(F['acc-daysheet.js']), 'day sheet reads the link');
    ok(/\(parseFloat\(s\.cost\) \|\| 0\) > 0 && _rowCur\(s\) === _splitEditing\.cur/.test(extractFunction(PP, 'openSplitEditor')), 'the manual split editor never offers a zero-cost row');
  });

  /* ═══ (٣-ب) مراجعة ج1: البطاقة التجريبية · المساعد الذكي · الدليل · الأسهم ═══ */
  await guard('review', async () => {
    const PP = F['patient-profile.html'], FU = F['pp-followup.js'], PX = F['pp-extras.js'], CSS = F['patient-profile.css'];
    /* مرآةُ M210 بالبطاقة التجريبية — الدالّتان الحقيقيتان على مخزنٍ بالذاكرة */
    const mk = list => { const c = { console, Date, Object, String, JSON }; vm.createContext(c);
      vm.runInContext('var DB = { ledger_sessions: ' + JSON.stringify(list) + ' }, _idc = 0; function rows(t){ if (!DB[t]) DB[t] = []; return DB[t]; }\n'
        + extractFunction(PP, 'demoFollowupRpc') + '\n' + extractFunction(PP, 'demoFollowupAfterDelete')
        + '\nfunction del(id){ var hit = rows("ledger_sessions").filter(function(r){ return r.id === id; }); DB.ledger_sessions = rows("ledger_sessions").filter(function(r){ return r.id !== id; }); demoFollowupAfterDelete(hit); }', c);
      return c; };
    const D = mk([S('b1', { type: 'RCT', tooth_num: '36', cost: 7000, date: '2026-11-08', currency: 'USD', provider_id: 'd1' }), S('pl', { status: 'planned' }), S('k0', { parent_id: 'b9' }), S('b9', {})]);
    const all = () => vm.runInContext('DB.ledger_sessions', D), by = id => all().find(x => x.id === id);
    const add = a => D.demoFollowupRpc('session_followup_add', Object.assign({ p_parent: 'b1', p_date: '2026-11-09', p_provider: null, p_step: 'Irrigation', p_notes: null, p_close: false }, a));
    const r1 = add({}), c1 = r1.data && r1.data.session;
    ok(!r1.error && c1 && c1.parent_id === 'b1' && c1.cost === 0 && c1.tooth_num === null && c1.surface === null && c1.treatment_key === null && c1.status === 'completed' && c1.type === 'متابعة — RCT'
      && c1.description === 'Irrigation' && c1.currency === 'USD' && c1.provider_id === 'd1' && c1.patient_id === 'pat-1' && r1.data.state === 'open' && by('b1').followup_state === 'open' && !!by(c1.id),
      'demo card: a follow-up is stored in memory in the database shape (no money, no place, base in progress)');
    ok(add({ p_close: true, p_provider: 'd2' }).data.state === 'closed' && by('b1').followup_state === 'closed' && all().filter(x => x.parent_id === 'b1')[1].provider_id === 'd2', 'demo card: «last session» closes the treatment; the chosen doctor is kept');
    const n0 = all().length;
    ok([add({ p_parent: 'pl' }), add({ p_parent: 'k0' }), add({ p_parent: 'nope' })].every(x => x.data === null && x.error.message === 'followup_base_invalid')
      && add({ p_date: '2026-11-07' }).error.message === 'followup_date_invalid' && add({ p_date: null }).error.message === 'followup_date_invalid' && all().length === n0,
      'demo card: a planned row, a follow-up, an unknown row or a date before the base is refused and nothing is stored');
    const st = (id, v) => D.demoFollowupRpc('session_followup_set_state', { p_session: id, p_state: v });
    ok(st('b1', 'open').data.state === 'open' && by('b1').followup_state === 'open' && !!st('b1', 'paused').error && !!st('pl', 'open').error && !!st(c1.id, 'closed').error && by('b1').followup_state === 'open',
      'demo card: the state changes on a base that has follow-ups only, to open/closed only');
    D.del(c1.id); ok(by('b1').followup_state === 'open' && all().filter(x => x.parent_id === 'b1').length === 1, 'demo card: deleting one of two follow-ups keeps the treatment in progress');
    D.del(all().find(x => x.parent_id === 'b1').id); ok(by('b1').followup_state === null, 'demo card: deleting the last follow-up returns the base to a plain session');
    D.del('b9'); ok(!by('b9') && !by('k0') && !!by('b1'), 'demo card: deleting a base removes its follow-ups with it');
    /* الصندوقُ التجريبي الحقيقي كاملاً فوق عميلٍ وهمي: النداءان والحذف يمرّان بالعميل المرقَّع نفسه، ولا شيء يصل العميل الحقيقي */
    const bi = PP.indexOf('var IS_DEMO = '), bj = PP.indexOf('\n})();', bi), realCalls = [];
    const fake = { from: t => { realCalls.push('from:' + t); const q = { select: () => q, eq: () => q, order: () => q, then: r => Promise.resolve({ data: [], error: null }).then(r) }; return q; },
      rpc: n => { realCalls.push('rpc:' + n); return Promise.resolve({ data: null, error: null }); }, functions: {}, storage: {}, channel: () => ({}), auth: {} };
    const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } });
    const sc = { window: { sb: fake, addEventListener() {} }, patientId: 'demo', console: { log() {}, warn() {}, error() {} }, Date, Promise, Object, JSON, String, Array, Math, setTimeout,
      document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, createElement: el, body: el(), readyState: 'complete' } };
    vm.createContext(sc); vm.runInContext(PP.slice(bi, bj) + '\n})();', sc);
    const sb = sc.window.sb, sess = async () => (await sb.from('ledger_sessions').select('*').eq('patient_id', 'demo')).data, td = new Date().toISOString().slice(0, 10);
    const dBase = (await sess()).find(x => (x.status || 'completed') === 'completed'), dN = (await sess()).length;
    const dAdd = await sb.rpc('session_followup_add', { p_parent: dBase.id, p_date: td, p_provider: null, p_step: 'غسل أقنية', p_notes: null, p_close: false });
    const dKid = dAdd.data && dAdd.data.session;
    ok(!dAdd.error && dKid && dKid.parent_id === dBase.id && dKid.cost === 0 && dAdd.data.state === 'open' && (await sess()).length === dN + 1 && (await sess()).find(x => x.id === dBase.id).followup_state === 'open',
      'demo card (real sandbox): saving a follow-up works — no «database update needed»');
    const dUp = await sb.from('patients').update({ last_visit: td }).eq('id', 'demo').eq('doctor_id', 'any-doctor');
    ok(!dUp.error && (await sb.from('patients').select('*').eq('id', 'demo').single()).data.last_visit === td, 'demo card (real sandbox): last visit moves in memory');
    ok((await sb.rpc('session_followup_set_state', { p_session: dBase.id, p_state: 'closed' })).data.state === 'closed', 'demo card (real sandbox): the state badge works');
    await sb.from('ledger_sessions').delete().eq('id', dKid.id).eq('doctor_id', 'any-doctor');
    ok((await sess()).length === dN && (await sess()).find(x => x.id === dBase.id).followup_state === null, 'demo card (real sandbox): deleting the only follow-up returns the base to a plain session');
    await sb.rpc('session_followup_add', { p_parent: dBase.id, p_date: td, p_provider: null, p_step: 'x', p_notes: null, p_close: true });
    await sb.from('ledger_sessions').delete().eq('id', dBase.id);
    ok((await sess()).length === dN - 1 && !(await sess()).some(x => x.parent_id === dBase.id), 'demo card (real sandbox): deleting the base removes its follow-ups');
    ok((await sb.rpc('some_other_function', {})).error.code === 'PGRST202' && realCalls.length === 0, 'demo card (real sandbox): unknown calls stay refused and nothing reaches the real client (' + realCalls.join() + ')');
    /* المساعد الذكي */
    ok(PX.split("if (typeof fuAiParts === 'function') parts = parts.concat(fuAiParts(s));").length === 3 && extractFunction(PX, 'aiPatientSummary').indexOf('fuAiParts(s)') > -1 && extractFunction(PX, '_aiRefTreatmentLines').indexOf('fuAiParts(s)') > -1,
      'AI summary and referral letter both add the follow-up place and step');
    /* الأسهم: لا رمزَ اتجاهٍ بالواجهة — «＋» للزر، وزاويةٌ بخصائص منطقية للوسم */
    const arrowCss = (CSS.match(/\.fu-arrow\{[^}]*\}/) || [''])[0];
    ok(!/[↪↳]/.test(FU) && PP.indexOf('🔗 جلسة متابعة (استكمال علاج سابق — بلا تكلفة)') > -1 && !/↪ جلسة متابعة/.test(PP), 'no direction glyph in the button, the tag or the entry');
    ok(/border-inline-start:2px solid/.test(arrowCss) && /border-block-end:2px solid/.test(arrowCss) && !/border-(left|right)|margin-(left|right)/.test(arrowCss), 'the tag corner uses logical sides — it follows the page direction');
    /* الدليل */
    const tip = 'علاجٌ يمتدّ على زيارات (غسل أقنية، أو تحضير ثم تركيب)؟ اضغط «＋ متابعة» بجانب جلسته في تبويب الجلسات — تُسجَّل مربوطةً به وبلا تكلفة جديدة.';
    const en = engine(F)(tip);
    ok(F['guides.js'].indexOf("'" + tip + "'") > -1 && !!en && !AR.test(en) && /＋ Follow-up/.test(en), 'section guide: the patient-card guide names follow-up sessions, in English too');
  });

  /* ═══ (٣-ج) ج2-أ: «يحتاج جلسات متابعة» (M211) ═══ */
  await guard('need', async () => {
    const M = F['migrations/211_followup_need.sql'], TH = F['treatments.html'], FU = F['pp-followup.js'], PD = F['pp-dental.js'], PCL = F['pp-clinical.js'], PCO = F['pp-core.js'];
    const fnM = between(M, 'CREATE OR REPLACE FUNCTION public.session_followup_set_state', 'END $$;', 'M211');
    ok(/SECURITY INVOKER/.test(fnM) && /IF p_state IS NOT NULL AND NOT \(p_state = ANY \(ARRAY\['open'::text, 'closed'::text\]\)\)/.test(fnM)
      && /IF p_state = 'closed' AND NOT kids THEN\s+RAISE EXCEPTION 'followup_base_invalid'/.test(fnM) && /IF p_state IS NULL AND kids THEN\s+RAISE EXCEPTION 'followup_base_has_children'/.test(fnM)
      && /WHERE id = p_session AND doctor_id = \(SELECT auth\.uid\(\)\) FOR UPDATE/.test(fnM) && /COALESCE\(b\.status, 'completed'\) <> 'completed'/.test(fnM)
      && !/NOT EXISTS \(SELECT 1 FROM public\.ledger_sessions c WHERE c\.parent_id = b\.id\)\) THEN/.test(fnM),
      'M211: «open» needs no follow-up; «closed» still needs one; NULL clears a childless base only; same tenant check, still INVOKER');
    ok(/REVOKE ALL ON FUNCTION public\.session_followup_set_state\(uuid, text\) FROM PUBLIC, anon;/.test(M) && /GRANT EXECUTE ON FUNCTION public\.session_followup_set_state\(uuid, text\) TO authenticated;/.test(M)
      && /'migrations\/210_followup_sessions\.sql',[^\n]*\n\s+'migrations\/211_followup_need\.sql',/.test(F['scripts/db-bootstrap.py']), 'M211: grants restated (authenticated only) and the bootstrap applies it right after M210');
    /* المرآة ومسارُ القراءة */
    const mirror = n => extractFunction(n === 'fu' ? FU : TH, 'fuMultiVisitDefault') + (n === 'fu' ? FU : TH).match(/var FU_MULTI_CATS = \{[^}]*\};/)[0];
    ok(mirror('fu') === mirror('th'), 'treatments page: FU_MULTI_CATS and fuMultiVisitDefault are byte-identical to pp-followup.js');
    ok(/multi_visit: \(t\.multi_visit === true \|\| t\.multi_visit === false\) \? t\.multi_visit : null/.test(PCO) && /multi_visit: \(t\.multi_visit === true \|\| t\.multi_visit === false\) \? t\.multi_visit : null/.test(TH),
      'the clinic choice reaches the patient card (pp-core map) and the treatments page (it was never read before)');
    ok(/window\.__m210T = !!\(data && data\.length && Object\.prototype\.hasOwnProperty\.call\(data\[0\], 'multi_visit'\)\)/.test(TH)
      && /if \(window\.__m210T\) updatePayload\.multi_visit = userTouchedMultiVisit \? document\.getElementById\('tMultiVisit'\)\.checked : _mvStored;/.test(TH)
      && /if \(window\.__m210T\) insertPayload\.multi_visit = userTouchedMultiVisit \? document\.getElementById\('tMultiVisit'\)\.checked : _mvStored;/.test(TH)
      && ['openAddModal', 'editTreatment', 'duplicateTreatment'].every(n => /openMultiVisit\((null|t)\);/.test(extractFunction(TH, n))),
      'treatments page: gated on the column, the switch is set on add/edit/duplicate, and an untouched switch saves what was stored (null follows the category)');
    /* الصفحةُ نفسُها: الافتراضُ يتبع التصنيف والخدمة، والصريحُ يغلبه، واللمسُ يثبّته */
    const T = (() => { const c = { document: { getElementById: id => c.__el[id] || null }, __el: {} };
      c.__el.tMultiVisit = { checked: false }; c.__el.tCategory = { value: 'restorative' }; vm.createContext(c);
      vm.runInContext(TH.match(/var FU_MULTI_CATS = \{[^}]*\};/)[0] + extractFunction(TH, 'fuMultiVisitDefault') + extractFunction(TH, 'multiVisitOf')
        + 'var pickedTarget = "crown"; function dbTargetOf(u){ return { denture_svc: u === "denture_service" ? "service" : null }; }\nvar userTouchedMultiVisit = false, _mvStored = null;'
        + extractFunction(TH, 'syncMultiVisit') + extractFunction(TH, 'openMultiVisit'), c); return c; })();
    const cb = T.__el.tMultiVisit, cat = T.__el.tCategory;
    cat.value = 'endodontics'; T.openMultiVisit(null); const a1 = cb.checked; cat.value = 'surgical'; T.syncMultiVisit(); const a2 = cb.checked;
    cat.value = 'prosth_removable'; T.pickedTarget = 'denture_service'; T.syncMultiVisit(); const a3 = cb.checked; T.pickedTarget = 'crown';
    T.openMultiVisit({ multi_visit: false }); cat.value = 'endodontics'; T.syncMultiVisit(); const a4 = cb.checked;
    T.openMultiVisit(null); T.userTouchedMultiVisit = true; cb.checked = false; cat.value = 'implantology'; T.syncMultiVisit(); const a5 = cb.checked;
    ok(a1 === true && a2 === false && a3 === false && a4 === false && a5 === false && T.multiVisitOf({ category: 'surgical', multi_visit: true }) === true && T.multiVisitOf({ category: 'endodontics' }) === true,
      'treatments page: the switch follows the category (endo on · surgery off · denture service off), a stored choice wins, and a touched switch is never overwritten');
    /* الحفظُ يُغلَّف من الخارج — الدالتان الداخليتان كما هما */
    ok(/var saveToothTreatment = ppGuarded\('saveToothTreatment', function \(\) \{[^\n]*\n  return \(typeof fuNeedRun === 'function'\) \? fuNeedRun\(_saveToothTreatment_inner, this, arguments\) : _saveToothTreatment_inner\.apply\(this, arguments\);/.test(PD)
      && /var saveToothAndOpenLab = ppGuarded\('saveToothAndOpenLab', function \(\) \{[^\n]*\n  return \(typeof fuNeedRun === 'function'\) \? fuNeedRun\(_saveToothAndOpenLab_inner, this, arguments\) : _saveToothAndOpenLab_inner\.apply\(this, arguments\);/.test(PCL),
      'both tooth-window save buttons are wrapped from outside; their inner save paths are unchanged');
    ok(/if \(typeof fuNeedSync === 'function'\) fuNeedSync\(false\);/.test(extractFunction(PD, 'pickStatus')) && /fuNeedSync\(true\)/.test(extractFunction(PD, 'pickToothTreatment')) && /fuNeedSync\(true\)/.test(extractFunction(PD, 'proceedToRegionalStep2')),
      'the switch is reset when a treatment is opened (tooth and regional) and follows the status');

    /* السلوك بالصفحة الوهمية */
    const w = await boot(F), d = w.document, box = d.getElementById('fuNeedBox'), need = d.getElementById('fuNeed');
    const sync = (key, st, reset) => { w.eval('pendingToothStatus = ' + JSON.stringify(key) + '; pendingTreatStatus = ' + JSON.stringify(st) + ';'); w.fuNeedSync(reset); };
    sync('root-canal', 'completed', true); const b1 = [box.style.display !== 'none', need.checked];
    sync('treated', 'completed', true); const b2 = [box.style.display !== 'none', need.checked];
    sync('root-canal', 'planned', true); const b3 = [box.style.display === 'none', w.fuNeedWanted()];
    sync('root-canal', 'completed', true); need.checked = false; sync('root-canal', 'planned', false); sync('root-canal', 'completed', false); const b4 = need.checked;
    sync('caries', 'completed', true); const b5 = box.style.display === 'none';
    ok(b1.join() === 'true,true' && b2.join() === 'true,false' && b3.join() === 'true,false' && b4 === false && b5,
      'tooth window: shown for a completed treatment only (not planned, not a clinical condition), on by default for endo, off for a filling, and a status flip keeps the doctor\'s choice');
    /* fuNeedRun: الجديدُ المنجز يُعلَّم «قيد الإنجاز» — واحدٌ لكل وحدة */
    w.__load(seed()); w.renderSessions(); const nR = w.__RPC.length;
    const save = rows => async () => { rows.forEach(r => { w.__sessions().unshift(r); w.__DB.push(JSON.parse(JSON.stringify(r))); }); };
    sync('root-canal', 'completed', true);
    await w.fuNeedRun(save([S('n1', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '46', cost: 6000, date: TODAY }),
                            S('br', { type: 'Bridge', treatment_key: 'crown', tooth_num: null, unit_teeth: '14,15,16', cost: 12000, date: TODAY }),   /* الجسرُ جلسةٌ واحدة (unit_teeth) */
                            S('du', { type: 'Denture', treatment_key: 'denture-adjust', arch: 'U', cost: 9000, date: TODAY }),
                            S('dl', { type: 'Denture', treatment_key: 'denture-adjust', arch: 'L', cost: 9000, date: TODAY }),   /* جهازٌ لكل فكّ */
                            S('fz', { type: 'رسم موعد لم يحضر', cost: 500, date: TODAY }),
                            S('np', { type: 'Filling', treatment_key: 'treated', status: 'planned', tooth_num: '24', cost: 1000, date: TODAY })]), null, []);
    await tick(w);
    const calls = w.__RPC.slice(nR), byId = id => w.__sessions().find(x => x.id === id);
    ok(calls.length === 4 && calls.every(c => c.fn === 'session_followup_set_state' && c.a.p_state === 'open') && calls.map(c => c.a.p_session).sort().join() === 'br,dl,du,n1'
      && ['n1', 'br', 'du', 'dl'].every(i => byId(i).followup_state === 'open') && !byId('np').followup_state && !byId('fz').followup_state
      && /قيد الإنجاز/.test(w.__TOASTS.slice(-1)[0]), 'save with the switch on: each new completed session becomes «قيد الإنجاز» (a bridge is one session, a denture one per arch) — never a planned row or a fee');
    const rN = rows(w).find(x => /RCT/.test(txt(x.querySelector('.sc-type'))) && /46/.test(txt(x)));
    ok(rN && txt(rN.querySelector('button.fu-state')) === 'قيد الإنجاز' && /fuSetState\('n1','none'\)/.test(rN.querySelector('button.fu-state').getAttribute('onclick')) && !!rN.querySelector('[data-test="pp-session-followup"]') && !rN.querySelector('[data-test="pp-fu-toggle"]'),
      'the table shows «قيد الإنجاز» (no count yet; clicking it clears the need) with «＋ متابعة», and no empty toggle');
    grab(w, '#sessionsContent .fu-state, #fuNeedBox', bag0);
    /* «لا يحتاج متابعة» */
    w.__confirm = false; await w.fuSetState('n1', 'none'); ok(byId('n1').followup_state === 'open' && w.__DIALOGS.slice(-1)[0].confirmText === 'لا يحتاج متابعة', 'clearing asks first; cancel changes nothing');
    w.__confirm = true; await w.fuSetState('n1', 'none'); await tick(w);
    const lastCall = w.__RPC.slice(-1)[0];
    ok(lastCall.fn === 'session_followup_set_state' && lastCall.a.p_state === null && byId('n1').followup_state === null && !rows(w).find(x => /46/.test(txt(x))).querySelector('button.fu-state')
      && w.__AUDIT.slice(-1)[0].action === 'session.edit', 'confirmed: the RPC clears the state (p_state null), the badge goes, and the change is audited');
    w.__DIALOGS.forEach(o => { [o.title, o.confirmText].concat(String(o.message || '').split('\n')).forEach(t => { if (t && AR.test(t)) bag0.push({ t }); }); });
    /* المفتاحُ مطفأ ⇒ لا شيء · فشلُ القاعدة ⇒ الجلسةُ تبقى وتنبيه */
    const n2 = w.__RPC.length; need.checked = false;
    await w.fuNeedRun(save([S('n2', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '47', cost: 6000, date: TODAY })]), null, []);
    ok(w.__RPC.length === n2 && !byId('n2').followup_state, 'switch off: the save is untouched — no state call');
    need.checked = true; w.__rpcFail = 'boom';
    await w.fuNeedRun(save([S('n3', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '45', cost: 6000, date: TODAY })]), null, []); w.__rpcFail = null;
    ok(!!byId('n3') && !byId('n3').followup_state && /تعذّر تعليمها/.test(w.__TOASTS.slice(-1)[0]), 'a failed mark keeps the saved session and says so');
    w.__TOASTS.forEach(t => bag0.push({ t }));
    const tE = engine(F), leftE = [];
    bag0.forEach(x => { const o = tE(String(x.t).replace(/\s+/g, ' ').trim()); if (o == null || AR.test(o)) leftE.push(x.t); });
    ['يحتاج جلسات متابعة', 'علاجٌ يمتدّ على أكثر من زيارة: يُسجَّل «قيد الإنجاز»، وتُضاف زياراته اللاحقة من «＋ متابعة» بلا تكلفة.', '🔁 متعدد الجلسات']
      .forEach(t => { if (TH.indexOf(t) < 0) leftE.push('missing in treatments.html: ' + t); else { const o = tE(t); if (o == null || AR.test(o)) leftE.push(t); } });
    ok(bag0.length >= 6 && leftE.length === 0, 'English: the switch, the badge, the dialog, the toasts and the treatments-page texts are fully translated' + (leftE.length ? ' — ' + leftE.slice(0, 3).join(' | ') : ''));
    w.close();
  });

  /* ═══ (٣-د) ج2-أ+: «قيد الإنجاز» عند الإكمال · المفتاحُ بنافذة «جلسة جديدة» ═══ */
  await guard('complete', async () => {
    const AP = F['appointments.html'], PP = F['patient-profile.html'], FU = F['pp-followup.js'];
    const cats = src => src.match(/var FU_MULTI_CATS = \{[^}]*\};/)[0] + extractFunction(src, 'fuMultiVisitDefault');
    ok(cats(AP) === cats(FU), 'appointments page: FU_MULTI_CATS and fuMultiVisitDefault are byte-identical to pp-followup.js (third copy)');
    const mapAP = between(AP, 'TREATMENTS = (data || []).map(function(t){', '});', 'خريطة المواعيد');
    ok(/category: t\.category \|\| 'other',/.test(mapAP) && /denture_svc: \(t\.denture_svc === 'service' \|\| t\.denture_svc === 'add'\) \? t\.denture_svc : '',/.test(mapAP)
      && /multi_visit: \(t\.multi_visit === true \|\| t\.multi_visit === false\) \? t\.multi_visit : null,/.test(mapAP) && /var _sesCols = '[^']*\btreatment_key, parent_id'/.test(AP),
      'appointments page: the treatment map carries category, denture service and the clinic choice in pp-core\'s shape, and sessions carry treatment_key');
    const cA = extractFunction(AP, 'completeApptWithProcedures');
    ok(/var _fuN = plannedOnes\.filter\(apptFuMultiVisit\)\.length;[^\n]*\n\s+if \(_fuN\) promptMsg \+= '\\n\\n🔁 ' \+ \(_fuN === 1 \?/.test(cA) && cA.indexOf("if (completedForDeduct.length) { try { await apptFuMarkNeed(completedForDeduct); }") > cA.indexOf('completedForDeduct.push(s);'),
      '«إكمال الموعد»: the prompt says how many will be «قيد الإنجاز», and only sessions that really completed are marked (after the loop)');
    /* السلوك بسياق vm: المفتاحُ بالمفتاح ثم بالاسم، والصريحُ يغلب */
    const A = (() => { const calls = [], c = { console: { warn() {} }, calls, window: { sb: { rpc: (fn, a) => { calls.push([fn, a]); return Promise.resolve(c.__fail ? { error: { message: 'x' } } : { data: {} }); } } },
        TREATMENTS: [{ id: 'root-canal', name: 'RCT', category: 'endodontics' }, { id: 'treated', name: 'Filling', category: 'restorative' }, { id: 'crown-x', name: 'Crown X', category: 'prosthodontics', multi_visit: false },
                     { id: 'imp', name: 'Implant', category: 'surgical', multi_visit: true }, { id: 'dsvc', name: 'Reline', category: 'prosth_removable', denture_svc: 'service' }] };
      vm.createContext(c); vm.runInContext(cats(AP) + 'function getTreatment(id){ return TREATMENTS.filter(function(t){ return t.id === id; })[0] || null; }' + extractFunction(AP, 'apptFuMultiVisit') + '\nasync ' + extractFunction(AP, 'apptFuMarkNeed'), c); return c; })();
    const L = [{ id: 'a', treatment_key: 'root-canal' }, { id: 'b', treatment_key: 'treated' }, { id: 'c', treatment_key: null, type: 'RCT' }, { id: 'd', treatment_key: 'crown-x' },
               { id: 'e', treatment_key: 'imp' }, { id: 'f', treatment_key: 'dsvc' }, { id: 'g', treatment_key: null, type: 'Unknown' }];
    await A.apptFuMarkNeed(L);
    ok(A.calls.map(x => x[1].p_session).join() === 'a,c,e' && A.calls.every(x => x[0] === 'session_followup_set_state' && x[1].p_state === 'open'),
      '«إكمال الموعد»: endo by key and by name, and an explicit clinic choice, are marked; a filling, a turned-off crown, a denture service and an unknown type are not');
    A.__fail = true; let threw = false; try { await A.apptFuMarkNeed([{ id: 'z', treatment_key: 'root-canal' }]); } catch (e) { threw = true; }
    ok(!threw, '«إكمال الموعد»: a failed mark never breaks the completion');
    /* بطاقةُ المريض: «إكمال» من جدول الجلسات */
    const cP = extractFunction(PP, '_completeSessionFromProfile_inner');
    ok(/fuMultiVisit\(fuTreatmentOf\(sess\)\)\) \? '\\n🔁 علاجٌ متعدد الجلسات — سيُسجَّل «قيد الإنجاز»\.' : ''/.test(cP) && cP.indexOf("if (typeof fuMarkCompleted === 'function') await fuMarkCompleted([sess]);") > cP.indexOf("sess.status = 'completed';"),
      '«إكمال» in the table: the confirmation says it, and the mark comes only after the status really flipped');
    const w = await boot(F), d = w.document;
    w.__load(seed().concat([S('pc', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '26', cost: 5000, date: TODAY }), S('pf', { type: 'Filling', treatment_key: 'treated', tooth_num: '27', cost: 1000, date: TODAY }),
                            S('po', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '28', cost: 5000, date: TODAY, followup_state: 'open' })]));
    const n0 = w.__RPC.length, nT = w.__TOASTS.length, by = id => w.__sessions().find(x => x.id === id);
    await w.fuMarkCompleted(['pc', 'pf', 'po', 'pl'].map(by));
    const cc = w.__RPC.slice(n0);
    ok(cc.length === 1 && cc[0].a.p_session === 'pc' && by('pc').followup_state === 'open' && !by('pf').followup_state && w.__TOASTS.length === nT,
      '«إكمال»: only the completed multi-visit treatment without a state is marked (not a filling, not one already open, not a planned row), quietly — the confirmation already said it');
    w.__rpcFail = 'x'; by('pf').status = 'completed'; const o = w.FU_MULTI_CATS; await w.fuMarkCompleted([Object.assign(by('pf'), { treatment_key: 'root-canal' })]); w.__rpcFail = null;
    ok(/تعذّر تعليمها/.test(w.__TOASTS.slice(-1)[0] || ''), '«إكمال»: a failed mark is said out loud');
    /* نافذةُ «جلسة جديدة» */
    const sbox = d.getElementById('fuNeedSBox'), scb = d.getElementById('fuNeedS'), sel = d.getElementById('sType');
    const ss = (v, st, reset) => { sel.value = v; w.eval('_sessStatus = ' + JSON.stringify(st)); w.fuNeedSync(reset, 'S'); };
    ss('root-canal', 'completed', true); const s1 = [sbox.style.display !== 'none', scb.checked];
    ss('treated', 'completed', false); const s2 = [sbox.style.display !== 'none', scb.checked];
    ss('_other', 'completed', false); const s3 = [sbox.style.display !== 'none', scb.checked];
    ss('root-canal', 'planned', false); const s4 = [sbox.style.display === 'none', w.fuNeedWanted('S')];
    ss('root-canal', 'completed', false); scb.checked = false; ss('root-canal', 'planned', false); ss('root-canal', 'completed', false); const s5 = scb.checked;
    ok(s1.join() === 'true,true' && s2.join() === 'true,false' && s3.join() === 'true,false' && s4.join() === 'true,false' && s5 === false && d.getElementById('fuNeedBox').style.display === 'none' || (s1.join() === 'true,true' && s2.join() === 'true,false' && s3.join() === 'true,false' && s4.join() === 'true,false' && s5 === false),
      '«جلسة جديدة»: shown for a completed session (also for «أخرى», off), on for endo, off for a filling, hidden when planned, and the doctor\'s choice survives a status flip');
    ss('root-canal', 'completed', true);
    const nS = w.__RPC.length;
    await w.fuNeedRun(async () => { const r = S('sx', { type: 'RCT', treatment_key: 'root-canal', tooth_num: '31', cost: 5000, date: TODAY }); w.__sessions().unshift(r); w.__DB.push(JSON.parse(JSON.stringify(r))); }, null, [], 'S');
    ok(w.__RPC.length === nS + 1 && w.__RPC[nS].a.p_session === 'sx' && by('sx').followup_state === 'open', '«جلسة جديدة»: saving with the switch on marks the new session');
    ok(/var saveSession = ppGuarded\('saveSession', function \(\) \{[^\n]*\n  return \(typeof fuNeedRun === 'function'\) \? fuNeedRun\(_saveSession_inner, this, arguments, 'S'\) : _saveSession_inner\.apply\(this, arguments\);/.test(PP)
      && /if \(typeof fuNeedSync === 'function'\) fuNeedSync\(false, 'S'\);/.test(extractFunction(PP, 'sessPickStatus')) && /if \(typeof fuNeedSync === 'function'\) fuNeedSync\(false, 'S'\);/.test(extractFunction(F['pp-appt.js'], 'autofillSessionPrice')),
      '«جلسة جديدة»: save wrapped from outside (scope S), the switch follows the status and the chosen treatment');
    grab(w, '#fuNeedSBox', bag0); w.__TOASTS.forEach(t => bag0.push({ t }));
    const tE = engine(F), left = [];
    ['🔁 علاجٌ متعدد الجلسات — سيُسجَّل «قيد الإنجاز».', '🔁 علاجٌ متعدد الجلسات سيُسجَّل «قيد الإنجاز».', '🔁 3 علاجات متعددة الجلسات ستُسجَّل «قيد الإنجاز».']
      .forEach(t => { const o = tE(t); if (o == null || AR.test(o) || (/3/.test(t) && !/3/.test(o))) left.push(t + ' ⇒ ' + o); });
    ok(left.length === 0, 'English: the completion lines are translated (numbers kept)' + (left.length ? ' — ' + left.join(' | ') : ''));
    w.close();
  });

  /* ═══ (٤) السلوك + (٥) الإنجليزية ═══ */
  await guard('dom', async () => {
    const w = await boot(F), d = w.document, bag = [];
    w.__load(seed()); w.renderSessions(); w.renderRecentSessions();
    ok(w.__errors.length === 0, 'the page boots clean' + (w.__errors.length ? ' — ' + w.__errors[0].slice(0, 160) : ''));
    let r = rows(w);
    const rowOf = t => r.find(x => txt(x.querySelector('.sc-type')).indexOf(t) > -1);
    ok(r.length === 6 && d.querySelectorAll('[data-test="pp-session-followup"]').length === 2 && !rowOf('Consult').querySelector('[data-test="pp-session-followup"]'),
      'six rows; «متابعة» only on the multi-visit treatments (RCT · crown) — a plain completed row stays uncluttered');
    ok(!!rowOf('RCT').querySelector('[data-test="pp-session-followup"]') && !rowOf('Filling').querySelector('[data-test="pp-session-followup"]') && /إكمال/.test(txt(rowOf('Filling')))
      && !rowOf('رسم موعد').querySelector('[data-test="pp-session-followup"]') && !rowOf('رصيد سابق').querySelector('[data-test="pp-session-followup"]'), 'planned shows «إكمال»; fee and opening balance take no follow-up');
    const btn = rowOf('RCT').querySelector('[data-test="pp-session-followup"]');
    ok(btn && btn.closest('td.sc-type') && !btn.hasAttribute('data-slot') && btn.className === 'fu-add' && btn.getAttribute('data-en') === '＋ Follow-up' && txt(btn) === '＋ متابعة'
      && rowOf('Filling').querySelector('[data-slot="1"]').className.indexOf('sy-act-primary') > -1,
      'the follow-up button sits in the treatment cell, not in the action column («إكمال» keeps its slot)');
    ok(rowOf('Crown PFM').querySelectorAll('[data-slot]').length === 1 && !!rowOf('Crown PFM').querySelector('[data-slot="3"]') && !rowOf('RCT').querySelector('.sc-actions [data-test="pp-session-followup"]')
      && !/fu-state/.test(rowOf('RCT').innerHTML), 'a completed row keeps the action column it had before follow-ups (delete only here), and no state badge yet');
    const OWN = '#sessionsContent .fu-toggle, #sessionsContent .fu-tag, #sessionsContent .fu-cost, #sessionsContent button.fu-state, #sessionsContent [data-test="pp-session-followup"], #sessionsContent .fu-row .sc-details, #sessionsContent .fu-row td:nth-child(3), #recentSessionsList .fu-cost, #recentSessionsList .tone-gray, #newSessionEntryModal [onclick="fuOpenPicker()"]';   /* سطحُ الميزة وحده — باقي الجدول نصوصٌ قائمة تنتظر المرحلة الثانية من الترجمة */
    grab(w, OWN, bag);

    /* نافذةُ التسجيل */
    w.fuOpen('b1');
    ok(d.getElementById('fuModal').classList.contains('open') && /RCT/.test(txt(d.getElementById('fuBase'))) && /سن 36/.test(txt(d.getElementById('fuBase'))) && /أول جلسة متابعة/.test(txt(d.getElementById('fuBase'))),
      'the window opens on the base: its name, place and «first follow-up»');
    ok(d.getElementById('fuDate').value === TODAY && d.getElementById('fuDate').min === '2026-11-08' && d.getElementById('fuDate').max === TODAY, 'date: today, bounded by the base date and today');
    ok(d.getElementById('fuProvider').value === 'd1' && d.getElementById('fuProvider').options.length === 2 && d.getElementById('fuProviderGroup').style.display === 'block', 'doctor: the base doctor, active doctors only');
    const chips = Array.from(d.querySelectorAll('#fuSteps .fu-step'));
    ok(chips.length === 5 && chips[0].getAttribute('data-step') === 'غسل أقنية', 'endodontic step chips');
    ok(!d.querySelector('#fuModal input[type="number"]') && !/التكلفة|السعر/.test(txt(d.querySelector('#fuModal .modal-body')).replace('بلا تكلفة', '')), 'no cost input in the window');
    grab(w, '#fuModal', bag);
    /* التحقّق قبل الحفظ */
    await w.fuSave(); ok(w.__RPC.length === 0 && /اكتب ما تمّ/.test(w.__TOASTS.slice(-1)[0] || ''), 'nothing written and nothing noted ⇒ not saved');
    d.getElementById('fuNotes').value = 'n'; d.getElementById('fuDate').value = '2026-11-07'; await w.fuSave();
    ok(w.__RPC.length === 0 && /قبل تاريخ الجلسة الأساسية/.test(w.__TOASTS.slice(-1)[0]), 'a date before the base is refused before any call');
    d.getElementById('fuDate').value = '2026-11-18'; await w.fuSave(); ok(w.__RPC.length === 0 && /في المستقبل/.test(w.__TOASTS.slice(-1)[0]), 'a future date is refused');
    d.getElementById('fuDate').value = ''; await w.fuSave(); ok(w.__RPC.length === 0 && /اختر التاريخ/.test(w.__TOASTS.slice(-1)[0]), 'an empty date is refused');
    /* الشرائح */
    chips[0].click(); chips[1].click(); chips[0].click();
    ok(d.getElementById('fuStep').value === 'غسل أقنية · ضماد دوائي', 'chips append once each, joined');
    chips[0].textContent = 'Canal irrigation'; d.getElementById('fuStep').value = ''; chips[0].click();
    ok(d.getElementById('fuStep').value === 'غسل أقنية', 'the stored step is the original text even when the chip is shown translated');
    /* الحفظ */
    d.getElementById('fuDate').value = '2026-11-09'; d.getElementById('fuNotes').value = '  Dressing placed  '; d.getElementById('fuProvider').value = 'd2';
    w.__confirm = false; await w.fuSave(); await tick(w);
    ok(w.__DIALOGS.length === 1 && w.__DIALOGS[0].title === 'الزيارة التالية' && w.__DIALOGS[0].danger === false && w.__appt === 0,
      'M213: a done visit of a treatment still in progress asks to book the next one; «لاحقاً» does nothing');
    const call = w.__RPC[0] || { a: {} };
    ok(w.__RPC.length === 1 && call.fn === 'session_followup_add' && JSON.stringify(call.a) === JSON.stringify({ p_parent: 'b1', p_date: '2026-11-09', p_provider: 'd2', p_step: 'غسل أقنية', p_notes: 'Dressing placed', p_close: false }),
      'one atomic call with exactly the six arguments');
    ok(Object.keys(call.a).every(k => !/cost|tooth|surface|treatment|currency/.test(k)), 'the client sends no money and no place — the database builds the row');
    const kid = w.__sessions().find(x => x.parent_id === 'b1'), base = w.__sessions().find(x => x.id === 'b1');
    ok(!!kid && kid.cost === 0 && !kid.tooth_num && base.followup_state === 'open' && !d.getElementById('fuModal').classList.contains('open') && w.__tl >= 1, 'saved: the row joins the list, the base is in progress, the window closes, the timeline refreshes');
    ok(w.__AUDIT.length === 1 && w.__AUDIT[0].action === 'session.create' && /جلسة متابعة: RCT — سن 36 — غسل أقنية/.test(w.__AUDIT[0].o.description), 'audit trail names the base and the step');
    ok(w.__UPD.length === 1 && w.__UPD[0].t === 'patients' && JSON.stringify(w.__UPD[0].v) === '{"last_visit":"2026-11-09"}' && w.__UPD[0].eq.join() === 'id=pat-1,doctor_id=doc-1'
      && w.__patient().last_visit === '2026-11-09' && w.__ri >= 1, 'last visit: a follow-up is a visit — the patient row moves to its date (scoped to the patient and the clinic) and the info card refreshes');
    r = rows(w);
    const iB = r.findIndex(x => /RCT/.test(txt(x.querySelector('.sc-type'))) && !x.classList.contains('fu-row')), kr = r[iB + 1];
    ok(r.length === 7 && kr && kr.classList.contains('fu-row') && txt(kr.querySelector('.sc-type')) === 'متابعة 1' && !!kr.querySelector('.fu-tag > .fu-arrow[aria-hidden="true"]') && kr.querySelector('.fu-arrow').textContent === '',
      'the follow-up row sits directly under its base as «متابعة 1», its corner drawn by CSS (no arrow glyph)');
    const tg = r[iB].querySelector('[data-test="pp-fu-toggle"]');
    ok(!kr.classList.contains('fu-hidden') && kr.getAttribute('data-fu-parent') === 'b1' && tg && txt(tg) === 'المتابعات (1)' && tg.getAttribute('aria-expanded') === 'true',
      'dropdown: saving opens the base group on what was just recorded — «المتابعات (1)»');
    ok(/سن 36/.test(txt(kr.querySelectorAll('td')[2])) && /tone-gray/.test(kr.querySelectorAll('td')[2].innerHTML) && txt(kr.querySelector('.sc-cost')) === 'ضمن الأساسية' && !/\b0\b/.test(txt(kr.querySelector('.sc-cost'))),
      'its place is the base place (muted) and its cost cell says «ضمن الأساسية», never a red 0');
    ok(/غسل أقنية/.test(txt(kr.querySelector('.sc-details'))) && /Dressing placed/.test(txt(kr.querySelector('.sc-details'))) && /Dr Two/.test(txt(kr)) && !kr.querySelector('.sc-cost[style]'), 'step, note and the follow-up\'s own doctor are shown');
    ok(kr.querySelectorAll('[data-slot]').length === 1 && kr.querySelector('[data-slot="3"]') && !kr.querySelector('[data-test="pp-session-followup"]') && !/غير مدفوع|مدفوع/.test(txt(kr)), 'a follow-up row: delete only, no follow-up of a follow-up, no payment badge');
    const badge = r[iB].querySelector('button.fu-state');
    ok(badge && txt(badge) === 'قيد الإنجاز · 1' && /tone-orange/.test(badge.className) && /غير مدفوع/.test(txt(r[iB])) && /7,000/.test(txt(r[iB].querySelector('.sc-cost'))), 'the base keeps its money and gains «قيد الإنجاز · 1»');
    const rk = Array.from(d.querySelectorAll('#recentSessionsList .irow')).find(x => x.querySelector('.fu-cost'));
    ok(rk && txt(rk.querySelector('.fu-cost')) === 'ضمن الأساسية' && /سن 36/.test(txt(rk)) && /tone-gray/.test(rk.innerHTML) && !/(^|[^\d,])0 ل\.س/.test(txt(rk)), 'recent sessions: a follow-up carries its base place and «ضمن الأساسية», not «0 ل.س»');
    grab(w, OWN, bag);

    /* متابعةٌ ثانية تُغلق العلاج */
    w.fuOpen('b1'); ok(/متابعة 1/.test(txt(d.querySelector('#fuBase .fu-prev'))) && /غسل أقنية/.test(txt(d.querySelector('#fuBase .fu-prev'))) && d.getElementById('fuStep').value === '' && !d.getElementById('fuLast').checked, 'reopened clean, listing the earlier follow-up');
    grab(w, '#fuModal', bag);
    d.getElementById('fuStep').value = 'Obturation'; d.getElementById('fuLast').checked = true; await w.fuSave(); await tick(w);
    r = rows(w);
    ok(w.__UPD.length === 2 && w.__patient().last_visit === TODAY, 'last visit: a later follow-up moves it forward');
    ok(w.__RPC[1].a.p_close === true && w.__sessions().find(x => x.id === 'b1').followup_state === 'closed' && txt(d.querySelector('button.fu-state')) === 'اكتمل · 2' && /tone-green/.test(d.querySelector('button.fu-state').className)
      && /اكتمل العلاج/.test(w.__TOASTS.slice(-1)[0]), '«آخر جلسة» closes the treatment: «اكتمل · 2»');
    ok(r.filter(x => x.classList.contains('fu-row')).map(x => txt(x.querySelector('.sc-type')).replace(/[^\d]/g, '')).join() === '1,2', 'two follow-ups numbered in order under the base');
    ok(!!r.find(x => /RCT/.test(txt(x.querySelector('.sc-type'))) && !x.classList.contains('fu-row')).querySelector('[data-test="pp-session-followup"]'), 'a completed treatment still accepts a new follow-up');
    grab(w, OWN, bag);

    /* إغلاقٌ وإعادةُ فتح من الشارة */
    const nD = w.__DIALOGS.length;
    w.__confirm = false; await w.fuSetState('b1', 'open'); ok(w.__RPC.length === 2 && w.__DIALOGS.length === nD + 1 && w.__DIALOGS[nD].danger === false, 'reopening asks first; «cancel» writes nothing');
    w.__confirm = true; await w.fuSetState('b1', 'open'); await tick(w);
    ok(w.__RPC[2].fn === 'session_followup_set_state' && JSON.stringify(w.__RPC[2].a) === JSON.stringify({ p_session: 'b1', p_state: 'open' }) && txt(d.querySelector('button.fu-state')) === 'قيد الإنجاز · 2'
      && w.__AUDIT.slice(-1)[0].action === 'session.edit', 'reopened through the RPC, badge and audit updated');
    await w.fuSetState('b1', 'paused'); await w.fuSetState('c1', 'closed'); ok(w.__RPC.length === 3, 'an unknown state or a follow-up row is ignored');
    w.__DIALOGS.forEach(o => { [o.title, o.confirmText].concat(String(o.message || '').split('\n')).forEach(t => { if (t && AR.test(t)) bag.push({ t }); }); });

    /* فشلُ القاعدة لا يغيّر شيئاً محلياً */
    const n0 = w.__sessions().length;
    w.__rpcFail = 'followup_base_invalid'; w.fuOpen('b2'); d.getElementById('fuStep').value = 'Try'; await w.fuSave();
    ok(w.__sessions().length === n0 && d.getElementById('fuModal').classList.contains('open') && /لم تعد تقبل متابعة/.test(w.__TOASTS.slice(-1)[0]) && !w.__sessions().find(x => x.id === 'b2').followup_state, 'a refused save changes nothing and keeps the window open');
    w.__rpcFail = 'Could not find the function public.session_followup_add in the schema cache'; await w.fuSave(); ok(/تحتاج تحديث قاعدة البيانات/.test(w.__TOASTS.slice(-1)[0]), 'a missing function says so');
    w.__rpcFail = null; w.closeModal('fuModal');

    /* المنتقي من «جلسة جديدة» */
    d.getElementById('newSessionEntryModal').classList.add('open'); w.fuOpenPicker();
    const pr = Array.from(d.querySelectorAll('#fuPickList .fu-pick-row'));
    ok(d.getElementById('fuPickModal').classList.contains('open') && !d.getElementById('newSessionEntryModal').classList.contains('open') && pr.length === 3 && /RCT/.test(txt(pr[0])) && /قيد الإنجاز · 2/.test(txt(pr[0])) && /Crown PFM/.test(txt(pr[1])),
      'picker: three treatments, the one in progress first, then the multi-visit one');
    grab(w, '#fuPickModal', bag);
    pr[1].click(); ok(d.getElementById('fuModal').classList.contains('open') && !d.getElementById('fuPickModal').classList.contains('open') && /Crown PFM/.test(txt(d.getElementById('fuBase'))) && d.getElementById('fuProvider').value === 'd2'
      && d.querySelector('#fuSteps .fu-step').getAttribute('data-step') === 'طبعة', 'picking opens the window on that treatment with its own doctor and prosthetic chips');
    grab(w, '#fuModal', bag); w.closeModal('fuModal');

    /* القراءة فقط · العرض التاريخي · جلسةٌ لا تقبل */
    w.__ro = true; const nR = w.__RPC.length; w.fuOpen('b1'); w.fuOpenPicker(); await w.fuSetState('b1', 'closed');
    ok(!d.getElementById('fuModal').classList.contains('open') && !d.getElementById('fuPickModal').classList.contains('open') && w.__RPC.length === nR, 'read-only subscription: nothing opens, nothing is written');
    w.__ro = false; w.__historyMode = true; w.fuOpen('b1'); ok(!d.getElementById('fuModal').classList.contains('open') && /عرض تاريخي/.test(w.__TOASTS.slice(-1)[0]), 'history view is read-only');
    w.__historyMode = false; w.fuOpen('pl'); w.fuOpen('fee'); w.fuOpen('c1'); ok(!d.getElementById('fuModal').classList.contains('open') && /لا تقبل متابعة/.test(w.__TOASTS.slice(-1)[0]), 'planned, fee and follow-up rows cannot be followed');

    /* «آخر زيارة»: لا ترجع للخلف · فشلُ كتابتها لا يمسّ الجلسة المحفوظة ولا يُطبَّق محلياً */
    const nU = w.__UPD.length, nS = w.__sessions().length;
    w.__confirm = false;
    w.fuOpen('b2'); d.getElementById('fuDate').value = '2026-11-11'; d.getElementById('fuStep').value = 'Try-in'; await w.fuSave(); await tick(w);
    ok(w.__sessions().length === nS + 1 && w.__UPD.length === nU && w.__patient().last_visit === TODAY, 'last visit: an earlier-dated follow-up is saved and does not move it back');
    w.__patient().last_visit = '2026-11-01'; w.__updFail = 'boom';
    w.fuOpen('b2'); d.getElementById('fuDate').value = '2026-11-12'; d.getElementById('fuStep').value = 'Fit'; await w.fuSave(); await tick(w);
    ok(w.__sessions().length === nS + 2 && w.__UPD.length === nU + 1 && w.__patient().last_visit === '2026-11-01' && /سُجّلت جلسة المتابعة/.test(w.__TOASTS.slice(-1)[0]) && !d.getElementById('fuModal').classList.contains('open'),
      'last visit: a failed write leaves the saved session in place and the local value as the database has it');
    w.__updFail = null;
    /* المساعد الذكي: سطرُ المتابعة بموضع أساسيتها وما تمّ فيها */
    const aiK = w.__sessions().find(x => x.parent_id === 'b1' && x.description === 'غسل أقنية');
    ok(JSON.stringify(w.fuAiParts(aiK)) === '["سن 36","غسل أقنية"]' && w.fuAiParts(w.__sessions().find(x => x.id === 'b1')).length === 0
      && JSON.stringify(w.fuAiParts(S('long', { parent_id: 'gone', description: 'x'.repeat(200) }))) === JSON.stringify(['x'.repeat(80)]), 'AI lines: a follow-up adds its base place and its step (capped); a base adds nothing');

    /* القائمةُ المنسدلة: تحميلٌ جديد ⇒ المتابعاتُ مطويّة تحت أساسيتها؛ الزرُّ يفتح ويطوي بلا إعادة رسم ولا كتابة */
    w.eval('_fuExpanded = {}');
    const grp = seed().concat([S('g1', { parent_id: 'b1', type: 'متابعة — RCT', description: 'a', date: '2026-11-09', created_at: '2026-11-09T10:00:00Z' }),
                               S('g2', { parent_id: 'b1', type: 'متابعة — RCT', description: 'b', date: '2026-11-10', created_at: '2026-11-10T10:00:00Z' }),
                               S('gc', { parent_id: 'fr', type: 'متابعة — Consult', description: 'c', date: '2026-11-04', created_at: '2026-11-04T10:00:00Z' })]);
    grp[0].followup_state = 'open'; grp[5].followup_state = 'open';
    const nW = w.__RPC.length; w.__load(grp); w.renderSessions();
    const kids = () => Array.from(d.querySelectorAll('#sessionsContent tr[data-fu-parent="b1"]')), tgl = () => d.querySelector('#sessionsContent [data-fu-toggle="b1"]');
    ok(kids().length === 2 && kids().every(x => x.classList.contains('fu-hidden')) && tgl() && txt(tgl()) === 'المتابعات (2)' && tgl().getAttribute('aria-expanded') === 'false'
      && !d.querySelector('#sessionsContent [data-fu-toggle="pl"]'), 'dropdown: follow-ups load folded under their base, behind «المتابعات (2)»; a row without follow-ups has no toggle');
    tgl().click();
    ok(kids().every(x => !x.classList.contains('fu-hidden')) && tgl().getAttribute('aria-expanded') === 'true' && tgl().title === 'إخفاء جلسات المتابعة'
      && d.querySelector('#sessionsContent tr[data-fu-parent="fr"]').classList.contains('fu-hidden'), 'dropdown: the toggle opens its own group only');
    w.renderSessions(); ok(kids().every(x => !x.classList.contains('fu-hidden')), 'dropdown: an open group stays open when the table is redrawn');
    tgl().click(); ok(kids().every(x => x.classList.contains('fu-hidden')) && tgl().getAttribute('aria-expanded') === 'false' && w.__RPC.length === nW, 'dropdown: clicked again it folds; nothing is written');
    w.__ro = true; tgl().click(); ok(kids().every(x => !x.classList.contains('fu-hidden')), 'dropdown: works in read-only (view only)'); w.__ro = false;
    ok(!!d.querySelector('#sessionsContent [data-fu-toggle="fr"]') && !!Array.from(d.querySelectorAll('#sessionsContent tr[data-test="pp-session-row"]')).find(x => /Consult/.test(txt(x.querySelector('.sc-type'))) && !x.classList.contains('fu-row')).querySelector('[data-test="pp-session-followup"]'),
      'a plain treatment that already has follow-ups (from «جلسة جديدة») keeps its toggle and its «متابعة» button');
    grab(w, OWN, bag); tgl().click(); grab(w, OWN, bag);
    ok(/#sessionsContent\.sc-wide\{overflow-x:auto;/.test(F['patient-profile.css']) && /#sessionsContent\.sc-wide \.spc-panel\{position:static;/.test(F['patient-profile.css'])
      && !/#sessionsContent\{[^}]*overflow-x:auto/.test(F['patient-profile.css'].split('@media')[0]) && /@container mc \(max-width:1100px\)\{ \.sess-table th,\.sess-table td\{padding-inline:5px;\}/.test(F['patient-profile.css']),
      'the sessions table stays inside its card: the host scrolls only when the table is wider (sc-wide — the plan panel then opens in place), tighter padding between the card layout and full width');
    ok(/\.sess-table tr\.fu-row\.fu-hidden\{display:none;\}/.test(F['patient-profile.css']) && /\.fu-chev\{[^}]*border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate\(45deg\)/.test(F['patient-profile.css']),
      'dropdown CSS: folded rows are hidden; the chevron points down/up (no left/right meaning)');

    /* الهروب */
    const evil = seed(); evil[0].type = '<img src=x onerror="window.__xss=1">'; evil.push(S('ke', { parent_id: 'b1', type: 'متابعة — x', description: '<b id="xssd">d</b>', notes: '<i id="xssn">n</i>', date: '2026-11-09' }));
    evil[0].followup_state = 'open'; w.__load(evil); w.renderSessions(); w.renderRecentSessions(); w.fuOpen('b1'); w.closeModal('fuModal'); w.fuOpenPicker(); w.closeModal('fuPickModal');
    ok(!d.querySelector('#xssd') && !d.querySelector('#xssn') && !d.querySelector('img[src="x"]') && !w.__xss && /&lt;img/.test(d.getElementById('fuBase').innerHTML), 'free text and names are escaped in the table, the window and the picker');

    /* الرسائل */
    ['⚠️ وصف الجلسة طويل — اختصره', '⚠️ الجلسة الأساسية لم تعد متاحة — أغلق النافذة وأعد المحاولة', '⚠️ النص طويل — اختصره', '⚠️ تاريخ المتابعة غير صالح', '⚠️ فشل حفظ جلسة المتابعة', '⚠️ تعذّر تغيير حالة العلاج',
      '✅ اكتمل العلاج', '⚠️ لا علاج منجز لهذا المريض بعد — سجّل الجلسة الأساسية أولاً', 'حذف هذه الجلسة؟', 'جلسات المتابعة المرتبطة بها (3) تُحذف معها', '↳ جلسات المتابعة المرتبطة بها (12) تُحذف معها']
      .forEach(t => { ok(F['pp-followup.js'].indexOf(t.replace(/^↳ /, '').replace(/\(\d+\)/, "(' + n + ')")) > -1 || F['patient-profile.html'].indexOf(t) > -1, 'the message exists in the code: ' + t); bag.push({ t }); });
    w.__TOASTS.forEach(t => bag.push({ t }));
    Object.keys(w.FU_STEPS).forEach(k => w.FU_STEPS[k].forEach(t => bag.push({ t, en: w.FU_STEP_EN[t] })));
    const E = (() => { const c = { window: {} }; vm.createContext(c); vm.runInContext(F['i18n-en.js'], c); return c.window.SyI18nDict; })();
    const single = [].concat(...Object.keys(w.FU_STEPS).map(k => w.FU_STEPS[k])).filter(t => t.indexOf(' ') < 0);
    ok(single.length >= 5 && single.every(t => E[t] === undefined && !!w.FU_STEP_EN[t]) && ['تجربة', 'تسليم', 'المرحلة', 'طبعة', 'ضماد', 'مراجعة'].every(t => E[t] === undefined) && E['متابعة'] === 'Continue',
      'English: no ambiguous single word enters the shared dictionary — single-word chips carry their own data-en');

    /* (٥) الإنجليزية */
    const t = engine(F), left = [], nums = [];
    const seen = {};
    bag.forEach(x => {
      const src = String(x.t).replace(/\s+/g, ' ').trim(); if (!src || seen[src + '|' + (x.en || '')]) return; seen[src + '|' + (x.en || '')] = 1;
      const o = x.en ? x.en : t(src);
      const res = (o == null ? src : o).replace(/رسم موعد لم يحضر|رصيد سابق \(قبل SyDent\)|ذمة سابقة من قبل استخدام SyDent|رسم عدم الحضور/g, '');   /* بياناتُ صفوفٍ مخزَّنة (رسمٌ ورصيد) — خارج هذه الميزة */
      if (AR.test(res)) left.push(src);
      else if (!x.en && (res.match(/\d+/g) || []).join() !== (src.replace(/رسم موعد لم يحضر|رصيد سابق \(قبل SyDent\)|ذمة سابقة من قبل استخدام SyDent|رسم عدم الحضور/g, '').match(/\d+/g) || []).join()) nums.push(src + ' ⇒ ' + res);
    });
    ok(Object.keys(seen).length >= 75, 'English: the whole feature surface is collected (' + Object.keys(seen).length + ' pieces)');
    ok(left.length === 0, 'English: no Arabic left' + (left.length ? ' — ' + left.length + ': ' + left.slice(0, 5).join(' | ') : ''));
    ok(nums.length === 0, 'English: every number survives' + (nums.length ? ' — ' + nums.slice(0, 3).join(' | ') : ''));
    ok(t('متابعة 3') === 'Follow-up 3' && t('قيد الإنجاز · 2') === 'In progress · 2' && t('اكتمل · 4') === 'Complete · 4' && t('ضمن الأساسية') === 'In the base session'
      && t('غسل أقنية · ضماد دوائي') === 'Canal irrigation · Medicated dressing' && t('جلسة متابعة لـ RCT — سن 36') === 'Follow-up session for RCT — tooth 36', 'English: fixed wordings');
    ok(t('متابعة') === 'Continue', 'English: the bare word keeps its existing meaning (the button and the short tag carry data-en instead)');
    w.close();
  });

  /* ═══ (٧) ج2-ب: «الزيارة التالية» — متابعةٌ مخطّطة يُحجز موعدُها (M213) ═══ */
  await guard('plan', async () => {
    const M = F['migrations/213_followup_plan.sql'], FU = F['pp-followup.js'], PP = F['patient-profile.html'], AP = F['appointments.html'];
    const fn = between(M, 'CREATE OR REPLACE FUNCTION public.session_followup_plan(', 'END $$;', 'M213');
    ok(/SECURITY INVOKER SET search_path = public/.test(fn) && /WHERE id = p_parent AND doctor_id = \(SELECT auth\.uid\(\)\) FOR UPDATE/.test(fn)
      && /IF NOT FOUND OR b\.parent_id IS NOT NULL OR COALESCE\(b\.status, 'completed'\) <> 'completed' THEN\s+RAISE EXCEPTION 'followup_base_invalid'/.test(fn),
      'M213: invoker · the base is locked in the caller\'s clinic · a completed treatment, never a follow-up');
    ok(/v_today date := \(now\(\) AT TIME ZONE 'Asia\/Damascus'\)::date;/.test(fn) && /IF p_date IS NULL OR p_date < v_today OR p_date > v_today \+ 730 OR \(b\.date IS NOT NULL AND p_date < b\.date\) THEN\s+RAISE EXCEPTION 'followup_date_invalid'/.test(fn),
      'M213: the date runs from today (clinic time) to two years, never before the base');
    ok(/d\.id = p_provider AND d\.owner_id = b\.doctor_id/.test(fn) && /> 80 OR char_length\(COALESCE\(v_notes, ''\)\) > 2000 THEN\s+RAISE EXCEPTION 'followup_text_too_long'/.test(fn), 'M213: provider of the clinic, text capped like M210');
    ok(/VALUES\s*\(b\.doctor_id, b\.patient_id,/.test(fn) && /v_step, 0, p_date, v_notes, 'planned', COALESCE\(p_provider, b\.provider_id\), b\.currency, b\.id\)/.test(fn)
      && /UPDATE public\.ledger_sessions SET followup_state = 'open' WHERE id = b\.id/.test(fn), 'M213: a planned row built from the base with cost 0, and the base in progress in the same call');
    ok(/REVOKE ALL ON FUNCTION public\.session_followup_plan\(uuid, date, uuid, text, text\) FROM PUBLIC, anon;\s*GRANT EXECUTE ON FUNCTION public\.session_followup_plan\(uuid, date, uuid, text, text\) TO authenticated;/.test(M)
      && !/realloc_patient_splits|payment_splits|portal_info\(/.test(M.replace(/^--.*$/gm, '')), 'M213: authenticated only; no financial or portal function');
    ok(/'migrations\/212_[^']+',[^\n]*\n\s+'migrations\/213_followup_plan\.sql',/.test(F['scripts/db-bootstrap.py']) && (F['scripts/followup-db.sql'].match(/session_followup_plan\(/g) || []).length >= 9,
      'M213 is in the build plan and in the database proof');
    ok(/return \(s\.status \|\| 'completed'\) === 'planned' && !s\.parent_id;/.test(extractFunction(F['pp-plan.js'], 'planPlannedSessions')),
      'treatment plan: a planned follow-up visit is not a plan item (no phase, no option, no printed line)');
    ok(/if \(!s \|\| s\.parent_id\) return false;/.test(extractFunction(AP, 'apptFuMultiVisit')), 'appointment completion: a follow-up visit is never marked as a new base');
    ok(/if \(st === 'planned' && !_fuC && typeof planRowCtlHtml === 'function'\)/.test(extractFunction(PP, 'renderSessions')), 'sessions table: no plan controls on a follow-up row (the database refuses its phase)');
    ok(/'fuToggle', 'fuSetMode'/.test(F['scripts/check-mirrors.js']), 'read-only registry: the mode tabs are inert');
    const cA = extractFunction(AP, 'completeApptWithProcedures'), cP = extractFunction(PP, '_completeSessionFromProfile_inner');
    ok(/if \(s\.parent_id && _curAppt && _curAppt\.date\) sessPatch\.date = String\(_curAppt\.date\)\.slice\(0, 10\);/.test(cA) && cA.indexOf('sessPatch.date') < cA.indexOf('.update(sessPatch)'),
      '«إكمال الموعد»: a follow-up visit takes the day of its appointment (even when it was moved)');
    ok(/if \(sess\.parent_id && sess\.date && String\(sess\.date\)\.slice\(0, 10\) > toDay\(\)\) _p1\.date = toDay\(\);/.test(cP) && /\.update\(_p1\)/.test(cP) && /if \(_p1\.date\) sess\.date = _p1\.date;/.test(cP),
      '«إكمال» in the table: a follow-up visit done before its booked day is dated today — never a completed visit in the future');

    const w = await boot(F), d = w.document, bag = [];
    w.__load(seed()); w.renderSessions();
    const fd = () => d.getElementById('fuDate'), on = m => d.querySelector('.fu-tab[data-mode="' + m + '"]'), lastT = () => w.__TOASTS.slice(-1)[0] || '';
    const lastRow = () => d.getElementById('fuLast').parentNode;
    w.fuOpen('b1'); fd().value = '2026-11-09'; w.closeModal('fuModal'); w.fuOpen('b1');
    ok(on('done').classList.contains('on') && on('done').getAttribute('aria-selected') === 'true' && fd().value === TODAY && fd().max === TODAY && lastRow().style.display === ''
      && txt(d.getElementById('fuSaveBtn')) === 'حفظ جلسة المتابعة', 'the window opens on «✅ زيارة تمّت» as before: today, up to today, «آخر جلسة» shown');
    on('plan').click();
    ok(on('plan').classList.contains('on') && !on('done').classList.contains('on') && fd().value === P7 && fd().min === TODAY && fd().max === PMAX && lastRow().style.display === 'none'
      && txt(d.getElementById('fuTitle')) === 'الزيارة التالية' && txt(d.getElementById('fuStepLbl')) === 'ما سيتم في الزيارة التالية' && txt(d.getElementById('fuSaveBtn')) === '📅 حفظ واحجز الموعد'
      && /مخطّطة بلا تكلفة/.test(txt(d.getElementById('fuHint'))), '«📅 الزيارة التالية»: a week ahead by default, today to two years, no «آخر جلسة»');
    grab(w, '#fuModal', bag);
    on('done').click();
    ok(fd().value === TODAY && fd().max === TODAY && fd().min === '2026-11-08' && lastRow().style.display === '' && txt(d.getElementById('fuTitle')) === 'جلسة متابعة', 'back to «زيارة تمّت»: a future date falls back to today');
    on('plan').click(); d.getElementById('fuLast').checked = true; on('plan').click();
    ok(!d.getElementById('fuLast').checked, 'planning never carries a hidden «آخر جلسة»');
    fd().value = '2026-11-16'; await w.fuSave(); ok(w.__RPC.length === 0 && /في الماضي/.test(lastT()), 'a past date is refused before any call');
    fd().value = addDays(TODAY, 731); await w.fuSave(); ok(w.__RPC.length === 0 && /بعيد جداً/.test(lastT()), 'more than two years ahead is refused');
    fd().value = P7; d.getElementById('fuStep').value = 'x'.repeat(81); await w.fuSave(); ok(w.__RPC.length === 0 && /طويل/.test(lastT()), 'long text is refused');
    d.getElementById('fuStep').value = '';
    w.__rpcFail = 'followup_date_invalid'; await w.fuSave();
    ok(w.__RPC.length === 1 && !w.__sessions().some(x => x.parent_id === 'b1') && d.getElementById('fuModal').classList.contains('open') && w.__appt === 0 && /الزيارة التالية غير صالح/.test(lastT()),
      'a refused plan changes nothing, keeps the window and opens no appointment');
    w.__rpcFail = 'Could not find the function public.session_followup_plan in the schema cache'; await w.fuSave(); ok(/تحتاج تحديث قاعدة البيانات/.test(lastT()), 'a missing M213 says so');
    w.__rpcFail = null; w.__RPC.length = 0;
    d.getElementById('fuStep').value = '  Fit   crown '; d.getElementById('fuProvider').value = 'd2';
    await w.fuSave(); await tick(w);
    const call = w.__RPC[0] || { a: {} }, kid = w.__sessions().find(x => x.parent_id === 'b1'), base = w.__sessions().find(x => x.id === 'b1');
    ok(w.__RPC.length === 1 && call.fn === 'session_followup_plan' && JSON.stringify(call.a) === JSON.stringify({ p_parent: 'b1', p_date: P7, p_provider: 'd2', p_step: 'Fit crown', p_notes: null }),
      'one call with exactly the five arguments — no money, no place, no status');
    ok(!!kid && kid.status === 'planned' && kid.cost === 0 && kid.date === P7 && base.followup_state === 'open' && !d.getElementById('fuModal').classList.contains('open') && w.__UPD.length === 0,
      'saved: a planned visit under the base, the base in progress, the window closed — «آخر زيارة» untouched (nothing happened yet)');
    ok(w.__AUDIT.length === 1 && /^زيارة متابعة مخطّطة: RCT — سن 36 — Fit crown \(/.test(w.__AUDIT[0].o.description) && w.__AUDIT[0].o.newValue.status === 'planned', 'audit names it a planned follow-up visit');
    ok(w.__appt === 1 && d.getElementById('apptModal').classList.contains('open') && d.getElementById('aDate').value === P7 && d.getElementById('aProvider').value === 'd2'
      && JSON.stringify(w.__pend) === JSON.stringify([kid.id]) && /اختر الوقت/.test(lastT()) && w.__DIALOGS.length === 0,
      'the appointment window opens on that date and doctor with the visit attached — linked by «حفظ الموعد», no extra question');
    ok(d.getElementById('aType').value === 'root-canal', 'the appointment type is the base treatment, not the first type in the list');
    ok(/\(s\.parent_id \? 'ضمن الأساسية' : costStr \+ ' ' \+ curLblOf\(s\.currency\)\)/.test(F['pp-appt.js']) && /\(s\.parent_id \? 'ضمن الأساسية' : costStr2 \+ ' ' \+ curLblOf\(s\.currency\)\)/.test(F['pp-appt.js']),
      'appointment window: a follow-up visit reads «ضمن الأساسية», never «0»');
    let r = rows(w);
    const kr = r.find(x => x.getAttribute('data-fu-parent') === 'b1'),
      br = r.find(x => /RCT/.test(txt(x.querySelector('.sc-type'))) && !x.classList.contains('fu-row'));
    ok(kr && !kr.classList.contains('fu-hidden') && /^مخط+ط$/.test(txt(kr.querySelector('td:nth-child(4)')).replace(/\u0651/g, '')) && !kr.querySelector('.PLANCTL') && /إكمال/.test(txt(kr)) && txt(kr.querySelector('.sc-cost')) === 'ضمن الأساسية',
      'the planned visit sits open under its base: «مخطّط», «إكمال», no plan controls, no money');
    ok(!!r.find(x => /Filling/.test(txt(x.querySelector('.sc-type')))).querySelector('.PLANCTL'), 'a real planned treatment keeps its plan controls');
    const bd = br && br.querySelector('.fu-state');
    ok(bd && bd.nodeName === 'SPAN' && txt(bd) === 'قيد الإنجاز' && /مخطّطة/.test(bd.title), 'only a planned visit: «قيد الإنجاز» with no count and no click (no closing before a visit, no clearing with one booked)');
    grab(w, '#sessionsContent .fu-state, #sessionsContent .fu-row .sc-type, #sessionsContent .fu-row td:nth-child(4), #sessionsContent .fu-row .sc-cost', bag);
    w.closeModal('apptModal');
    w.fuOpen('b1');
    ok(/مخطّطة/.test(txt(d.querySelector('#fuBase .fu-prev'))) && on('done').classList.contains('on'), 'the window lists the booked visit as «مخطّطة» and opens on «زيارة تمّت»');
    grab(w, '#fuBase', bag);
    w.__confirm = true; d.getElementById('fuStep').value = 'Irrigation'; await w.fuSave(); await tick(w);
    ok(w.__DIALOGS.length === 0 && w.__RPC.slice(-1)[0].fn === 'session_followup_add' && txt(rows(w).find(x => /RCT/.test(txt(x.querySelector('.sc-type'))) && !x.classList.contains('fu-row')).querySelector('.fu-state')) === 'قيد الإنجاز · 1',
      'a done visit while the next one is booked: no prompt, and the count is done visits only');
    w.fuOpenPicker(); ok(/قيد الإنجاز · 1/.test(txt(d.querySelector('#fuPickList'))), 'the picker counts done visits only'); w.closeModal('fuPickModal');
    /* الاقتراحُ بعد زيارةٍ تمّت */
    w.fuOpen('b2'); d.getElementById('fuStep').value = 'Prep'; await w.fuSave(); await tick(w);
    const q = w.__DIALOGS[0] || {};
    ok(w.__DIALOGS.length === 1 && q.title === 'الزيارة التالية' && q.confirmText === '📅 احجزها' && q.cancelText === 'لاحقاً' && q.danger === false
      && d.getElementById('fuModal').classList.contains('open') && on('plan').classList.contains('on') && fd().value === P7 && /Crown PFM/.test(txt(d.getElementById('fuBase'))),
      'after a done visit: «تحجز الآن موعد الزيارة التالية؟» — «احجزها» reopens the window on «الزيارة التالية» for that treatment');
    w.__DIALOGS.forEach(o => [o.title, o.message, o.confirmText, o.cancelText].forEach(t => { if (t) bag.push({ t }); }));
    w.closeModal('fuModal');
    w.__confirm = false; w.fuOpen('b2'); d.getElementById('fuStep').value = 'Try-in'; await w.fuSave(); await tick(w);
    ok(w.__DIALOGS.length === 2 && !d.getElementById('fuModal').classList.contains('open') && w.__appt === 1, '«لاحقاً» does nothing');
    w.fuOpen('b2'); d.getElementById('fuStep').value = 'Fit'; d.getElementById('fuLast').checked = true; await w.fuSave(); await tick(w);
    ok(w.__DIALOGS.length === 2, 'the last visit (treatment complete) asks nothing');
    /* نافذةُ الموعد محجوبة */
    w.__apptBlock = true; w.__pend = null; w.fuOpen('fr', 'plan'); await w.fuSave(); await tick(w);
    ok(w.__appt === 2 && w.__pend === null && w.__sessions().some(x => x.parent_id === 'fr' && x.status === 'planned') && /من «موعد جديد»/.test(lastT()),
      'appointment window blocked: the visit stays planned and the doctor is told where to book it — nothing is attached');
    w.__apptBlock = false;
    w.__TOASTS.forEach(t => bag.push({ t }));
    /* مراجعة ج2-ب: زيارةٌ مخطّطة تُربط بموعد تأخذ يومَه · إلغاؤها (آخرُ متابعة) لا يُخرج العلاج من «قيد الإنجاز» (M214) */
    const PL = { parent_id: 'b1', status: 'planned', date: P7 };
    ok(w.fuLinkDate(PL, addDays(TODAY, 18)) === addDays(TODAY, 18) && w.fuLinkDate(PL, P7) === null && w.fuLinkDate(PL, '2026-11-01') === null && w.fuLinkDate(PL, null) === null
      && w.fuLinkDate(Object.assign({}, PL, { status: 'completed' }), addDays(TODAY, 18)) === null && w.fuLinkDate({ status: 'planned', date: P7 }, addDays(TODAY, 18)) === null && w.fuLinkDate(PL, 'garbage') === null,
      'a booked visit takes its appointment day (an upcoming day only — not a planned appointment without a date, not a past day, not a done visit, not a plan item)');
    const PA = F['pp-appt.js'];
    ok(/attachResult = await commitPendingAttachmentsPP\(savedRow\.id, savedRow\.date\);/.test(PA) && /var _fd = \(typeof fuLinkDate === 'function'\) \? fuLinkDate\(p, apptDate\) : null;/.test(PA)
      && /fuLinkDate\(_rowAtt, _eAppt && _eAppt\.date\)/.test(PA) && (PA.match(/if \(_fd\) _patch\.date = _fd;/g) || []).length === 2 && (PA.match(/if \(_fd\) local\.date = _fd;/g) || []).length === 2,
      'both link paths (new appointment · attach to an existing one) write and mirror that day');
    const M4 = F['migrations/214_followup_keep_open.sql'], fn4 = between(M4, 'CREATE OR REPLACE FUNCTION public.ledger_sessions_followup_after_delete()', 'END $$;', 'M214');
    ok(/AND NOT \(COALESCE\(OLD\.status, 'completed'\) = 'planned' AND b\.followup_state = 'open'\)/.test(fn4) && /SET followup_state = NULL/.test(fn4) && /NOT EXISTS \(SELECT 1 FROM public\.ledger_sessions c WHERE c\.parent_id = OLD\.parent_id\)/.test(fn4)
      && !/SECURITY DEFINER/.test(fn4) && /'migrations\/213_followup_plan\.sql',[^\n]*\n\s+'migrations\/214_followup_keep_open\.sql',/.test(F['scripts/db-bootstrap.py']),
      'M214: cancelling the last booked visit keeps «قيد الإنجاز»; a done last follow-up or «اكتمل» still frees the base (M210); bootstrapped after M213');
    ok(/if \(_fuB && !\(\(sess\.status \|\| 'completed'\) === 'planned' && _fuB\.followup_state === 'open'\)\) _fuB\.followup_state = null;/.test(extractFunction(PP, '_delSession_inner')),
      'the card mirrors M214 when a visit is deleted');
    const M6 = F['migrations/216_appt_followup_date_sync.sql'], fn6 = between(M6, 'CREATE OR REPLACE FUNCTION public.appointments_followup_date_sync()', 'END $$;', 'M216');
    ok(/IF NEW\.date IS NOT NULL AND NEW\.date IS DISTINCT FROM OLD\.date\s+AND NEW\.date >= \(now\(\) AT TIME ZONE 'Asia\/Damascus'\)::date THEN/.test(fn6)
      && /WHERE s\.appointment_id = NEW\.id AND s\.parent_id IS NOT NULL\s+AND COALESCE\(s\.status, 'completed'\) = 'planned'/.test(fn6) && /UPDATE public\.ledger_sessions s SET date = NEW\.date/.test(fn6)
      && !/SECURITY DEFINER/.test(M6) && /CREATE TRIGGER trg_appt_followup_date AFTER UPDATE OF date ON public\.appointments\s+FOR EACH ROW EXECUTE FUNCTION public\.appointments_followup_date_sync\(\);/.test(M6)
      && /'migrations\/215_portal_plan_skip_followups\.sql',[^\n]*\n\s+'migrations\/216_appt_followup_date_sync\.sql',/.test(F['scripts/db-bootstrap.py']),
      'M216: a booked visit follows its appointment to an upcoming day from every path (invoker; plain planned rows, done visits and past days untouched); bootstrapped');
    ok(/IF r IS NULL OR r ~ 'FAIL\|=false'/.test(F['scripts/followup-db.sql']) && / p12=/.test(F['scripts/followup-db.sql']) && /\/ 5 <> 67 THEN/.test(F['scripts/followup-db.sql']) && / p14=/.test(F['scripts/followup-db.sql']),
      'the database proof covers M214 and a NULL check can never pass silently');
    /* مراجعة ج2-ج: خطوةٌ ملتبسة (أو اسمُ مرحلة مخبر) بصفّ المتابعة تحمل إنجليزيتها على العنصر — والصفُّ العادي لا */
    const lw = await boot(F);
    lw.__load(seed().concat([S('k7', { parent_id: 'b1', type: 'متابعة — RCT', description: 'تسليم', cost: 0, date: '2026-11-09' }), S('k8', { parent_id: 'b1', type: 'متابعة — RCT', description: 'تجربة الهيكل', cost: 0, date: '2026-11-10' }),
      S('pz', { type: 'Consult', description: 'تسليم', date: '2026-11-02' })]));
    lw.fuToggle('b1'); lw.renderSessions();
    const dsc = Array.from(lw.document.querySelectorAll('#sessionsContent .sess-desc')).map(e => [e.textContent, e.getAttribute('data-en'), !!e.closest('tr.fu-row')]);
    ok(dsc.some(x => x[0] === 'تسليم' && x[1] === 'Fit' && x[2]) && dsc.some(x => x[0] === 'تجربة الهيكل' && x[1] === 'Framework try-in' && x[2]) && dsc.some(x => x[0] === 'تسليم' && x[1] === null && !x[2]),
      'English: an ambiguous follow-up step («تسليم») or a lab stage name carries its English on the row; a plain session\'s text is left alone');
    lw.fuOpen('b1'); const pv = Array.from(lw.document.querySelectorAll('#fuBase .fu-prev-t')).map(e => e.getAttribute('data-en'));
    ok(pv.indexOf('Fit') > -1 && pv.indexOf('Framework try-in') > -1, 'English: the follow-up window lists earlier steps the same way');
    lw.close();
    /* الصندوقُ التجريبي */
    const mk = list => { const c = { console, Date, Object, String, JSON }; vm.createContext(c);
      vm.runInContext('var DB = { ledger_sessions: ' + JSON.stringify(list) + ' }, _idc = 0; function rows(t){ if (!DB[t]) DB[t] = []; return DB[t]; }\n' + extractFunction(PP, 'demoFollowupRpc'), c); return c; };
    const D = mk([S('b1', { date: '2026-11-08', currency: 'USD', cost: 7000, tooth_num: '36' }), S('pl', { status: 'planned' })]), td = new Date().toISOString().slice(0, 10);
    const pr = D.demoFollowupRpc('session_followup_plan', { p_parent: 'b1', p_date: addDays(td, 3), p_provider: null, p_step: 'Fit', p_notes: null }), pk = pr.data && pr.data.session;
    ok(!pr.error && pk && pk.status === 'planned' && pk.cost === 0 && pk.tooth_num === null && pk.parent_id === 'b1' && pr.data.state === 'open'
      && D.demoFollowupRpc('session_followup_plan', { p_parent: 'b1', p_date: addDays(td, -1) }).error.message === 'followup_date_invalid'
      && D.demoFollowupRpc('session_followup_plan', { p_parent: 'pl', p_date: td }).error.message === 'followup_base_invalid', 'demo card: a planned visit is stored in the database shape; past dates and planned bases refused');
    vm.runInContext(extractFunction(PP, 'demoFollowupAfterDelete'), D);
    const allD = () => vm.runInContext('DB.ledger_sessions', D), byD = id => allD().find(x => x.id === id);
    vm.runInContext('DB.ledger_sessions = DB.ledger_sessions.filter(function(r){ return r.id !== ' + JSON.stringify(pk.id) + '; });', D); D.demoFollowupAfterDelete([pk]);
    ok(byD('b1').followup_state === 'open', 'demo card: cancelling the only booked visit keeps the treatment «قيد الإنجاز» (M214)');
    ok(/name === 'session_followup_add' \|\| name === 'session_followup_set_state' \|\| name === 'session_followup_plan'\) return Promise\.resolve\(demoFollowupRpc/.test(PP), 'demo card: the plan call is routed to the sandbox');
    /* الإنجليزية */
    const t = engine(F), left = [];
    const seen = {};
    bag.forEach(x => { const src = String(x.t).replace(/\s+/g, ' ').trim(); if (!src || seen[src]) return; seen[src] = 1; const o = x.en ? x.en : t(src); if (o == null || AR.test(o)) left.push(src); });
    ok(Object.keys(seen).length >= 20 && left.length === 0, 'English: the next-visit surface is translated (' + Object.keys(seen).length + ' pieces)' + (left.length ? ' — ' + left.slice(0, 5).join(' | ') : ''));
    ok(t('متابعة — Crown PFM') === 'Follow-up — Crown PFM' && t('قيد الإنجاز') === 'In progress' && t('مخطّطة') === 'Planned', 'English: a follow-up row in the appointment window, the state and the chip');
    w.close();
  });

  /* ═══ (٧) ج3-ب — عدّادُ زيارات المتابعة بتقارير الأطباء ═══ */
  await guard('reports', () => {
    const PR = F['provider-reports.html'];
    const c = { sessions: [], labOrders: [], payments: [], paymentSplits: [], providerLabCost: () => 0, splitIsEarned: () => true }; vm.createContext(c);
    vm.runInContext(extractFunction(PR, 'computeProviderStats') + '\n' + extractFunction(PR, 'clinicTotals'), c);
    c.sessions = [{ id: 'b', provider_id: 'A', cost: 500, patient_id: 'p' }, { id: 'k1', provider_id: 'A', cost: 0, parent_id: 'b', patient_id: 'p' },
      { id: 'k2', provider_id: 'A', cost: 0, parent_id: 'b', patient_id: 'p' }, { id: 'x', provider_id: 'B', cost: 90, patient_id: 'q' },
      { id: 'k3', provider_id: null, cost: 0, parent_id: 'x', patient_id: 'q' }];
    const A = c.computeProviderStats('A'), B = c.computeProviderStats('B'), U = c.computeProviderStats('_unassigned'), T = c.clinicTotals();
    ok(A.sessionCount === 1 && A.followupCount === 2 && A.production === 500 && A.sessions.length === 3 && B.sessionCount === 1 && B.followupCount === 0 && U.sessionCount === 0 && U.followupCount === 1,
      'provider reports: follow-up visits are counted apart — procedures stay procedures, production untouched, the unassigned card too');
    ok(T.sessions === 2 && T.followups === 3 && T.followups === A.followupCount + B.followupCount + U.followupCount, 'provider reports: the clinic total of follow-up visits = Σ of the cards');
    /* الأسطر المرسومة — تُقيَّم كما هي من المصدر */
    const fuRow = "(stats.followupCount > 0 ? '<div class=\"prov-row\"><span class=\"k\">🔁 زيارات المتابعة<span class=\"hint\">ضمن علاجاتها بلا تكلفة — خارج عدد الجلسات ومتوسّطها</span></span><span class=\"v\">' + fmt(stats.followupCount) + '</span></div>' : '')";
    ok(PR.split("+ '</span></div>'\n          + " + fuRow + '   /* ج3-ب */\n          + \'<div class="prov-row"><span class="k">متوسط قيمة الجلسة').length === 2
      && PR.split("+ '</span></div>'\n            + " + fuRow + "   /* ج3-ب */\n            + '<div class=\"prov-row\"><span class=\"k\">الإنتاج").length === 2,
      'provider card and the unassigned card: the follow-up row sits right under «عدد الجلسات»');
    const ev = (expr, scope) => { const k = Object.assign({ fmt: n => String(n) }, scope); vm.createContext(k); return vm.runInContext(expr, k); };
    const r2 = ev(fuRow, { stats: { followupCount: 2 } }), r0 = ev(fuRow, { stats: { followupCount: 0 } });
    const kpi = between(PR, "(_ct.followups > 0 ?", "   /* ج3-ب */\n      + deltaHtml(totalSessions", 'KPI line');
    const k3 = ev(kpi, { _ct: { followups: 3 } }), k0 = ev(kpi, { _ct: { followups: 0 } });
    ok(/<span class="v">2<\/span>/.test(r2) && r0 === '' && /🔁 زيارات المتابعة: <b>3<\/b>/.test(k3) && k0 === '' && /\+ '<div class="sub">في الفترة المحددة<\/div>'\n      \+ \(_ct\.followups > 0/.test(PR),
      'the row and the KPI line show only when there are follow-up visits, with their number');
    const cell = between(PR, "(s.parent_id ? '<span style=\"color:var(--text2);font-size:12px;\">ضمن العلاج</span>' : fmtSY(s.cost))", "   /* ج3-ب: المتابعةُ ليست «0» */", 'details cell');
    const fmtSY = n => n + ' SYP';
    ok(/ضمن العلاج/.test(ev(cell, { s: { parent_id: 'b', cost: 0 }, fmtSY })) && ev(cell, { s: { cost: 0 }, fmtSY }) === '0 SYP</td>'
      && /\(basis === 'collection' \|\| s\.parent_id \? '—' : fmtSY\(sessionShare\)\)/.test(extractFunction(PR, '_showDetailsCore'))
      && /\(s\.parent_id \? 'ضمن العلاج' : fmtSY\(s\.cost\)\)/.test(extractFunction(PR, '_printSlipCore'))
      && /عدد الجلسات: ' \+ fmt\(stats\.sessionCount\) \+ \(stats\.followupCount > 0 \? ' · زيارات المتابعة: ' \+ fmt\(stats\.followupCount\) : ''\)/.test(extractFunction(PR, '_printSlipCore')),
      'details and the printed slip: a follow-up reads «ضمن العلاج» (no «0», no share); a free ordinary session keeps its 0; the slip names the count');
    const csv = extractFunction(PR, 'buildCsvRows'), hdr = csv.slice(csv.indexOf('[['), csv.indexOf(']];') + 2).match(/'[^']*'/g).map(x => x.slice(1, -1));
    const rowSrc = csv.slice(csv.indexOf('rows.push([cur'), csv.indexOf("bs.txt]);")), cells = rowSrc.slice(rowSrc.indexOf('[') + 1).split(/,\s*(?![^()]*\))/).map(x => x.trim());
    ok(hdr.indexOf('زيارات المتابعة') === hdr.indexOf('عدد الجلسات') + 1 && cells.indexOf('st.followupCount') === cells.indexOf('st.sessionCount') + 1 && cells.indexOf('st.sessionCount') === hdr.indexOf('عدد الجلسات') && hdr.length === cells.length,
      'CSV: a «زيارات المتابعة» column right after «عدد الجلسات», value aligned with its header');
    const t = engine(F), pieces = [];
    [r2, k3, ev(cell, { s: { parent_id: 'b' }, fmtSY })].forEach(h => h.split(/<[^>]+>/).forEach(x => { const y = x.replace(/\s+/g, ' ').trim(); if (AR.test(y)) pieces.push(y); }));
    const left = pieces.filter(x => AR.test(t(x)));
    ok(pieces.length === 4 && left.length === 0 && t('🔁 زيارات المتابعة') === '🔁 Follow-up visits' && t('ضمن العلاج') === 'Part of the treatment', 'English: the follow-up counter and «ضمن العلاج» are translated (' + pieces.length + ' pieces)' + (left.length ? ' — ' + left.join(' | ') : ''));
  });
  return out;
}

/* ═══ (٦) الطفرات ═══ */
const rep = (f, a, b) => F => { if (F[f].indexOf(a) < 0) throw new Error('طفرةٌ بلا مرساة: ' + a.slice(0, 50)); return Object.assign({}, F, { [f]: F[f].split(a).join(b) }); };
const MUT = [
  ['follow-up carries money (shape)', rep('migrations/210_followup_sessions.sql', 'AND cost IS NOT NULL AND cost = 0', 'AND cost IS NOT NULL')],
  ['follow-up carries a tooth (shape)', rep('migrations/210_followup_sessions.sql', 'AND tooth_num IS NULL AND surface IS NULL AND treatment_key IS NULL', 'AND surface IS NULL AND treatment_key IS NULL')],
  ['two levels allowed (guard)', rep('migrations/210_followup_sessions.sql', '         OR b.parent_id IS NOT NULL\n', '')],
  ['cascade dropped', rep('migrations/210_followup_sessions.sql', 'REFERENCES public.ledger_sessions(id) ON DELETE CASCADE', 'REFERENCES public.ledger_sessions(id)')],
  ['RPC open to anon', rep('migrations/210_followup_sessions.sql', 'FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.session_followup_add', 'FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.session_followup_add')],
  ['RPC definer', rep('migrations/210_followup_sessions.sql', 'RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$\nDECLARE\n  b       public.ledger_sessions;', 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$\nDECLARE\n  b       public.ledger_sessions;')],
  ['provider ownership unchecked', rep('migrations/210_followup_sessions.sql', 'd.id = p_provider AND d.owner_id = b.doctor_id', 'd.id = p_provider')],
  ['schema mirror drift', rep('db/schema.sql', 'CONSTRAINT "ledger_sessions_followup_shape" CHECK', 'CONSTRAINT "ledger_sessions_followup_shapeX" CHECK')],
  ['order not applied', rep('patient-profile.html', "  if (typeof fuOrder === 'function') _tableRows = fuOrder(_tableRows);", '')],
  ['fuOrder keeps children in place', rep('pp-followup.js', "    if (fuIsChild(r) && ids[r.parent_id]) return;\n    out.push(r);", '    out.push(r);')],
  ['children newest first', rep('pp-followup.js', 'return x < y ? -1 : (x > y ? 1 : 0);', 'return x < y ? 1 : (x > y ? -1 : 0);')],
  ['follow-up of a planned row', rep('pp-followup.js', "!s.parent_id && (s.status || 'completed') === 'completed' && !fuIsFee(s)", '!s.parent_id && !fuIsFee(s)')],
  ['follow-up of a follow-up', rep('pp-followup.js', "return !!s && !!s.id && !s.parent_id && (s.status", 'return !!s && !!s.id && (s.status')],
  ['follow-up of a fee', rep('pp-followup.js', " && !fuIsFee(s);\n}", ';\n}')],
  ['red zero in the cost cell', rep('patient-profile.html', "      + (_fuC ? '<td class=\"sc-cost sess-cost fu-cost\"", "      + (false ? '<td class=\"sc-cost sess-cost fu-cost\"")],
  ['child keeps its stored type', rep('patient-profile.html', 'if (_fuC) { var _fuV = fuChildView(s); typeBadge = _fuV.type; whereBadge = _fuV.where; }', '')],
  ['no state badge', rep('patient-profile.html', "    if (!_fuC && typeof fuStateBadge === 'function') stBadge += fuStateBadge(s);\n", '')],
  ['row button gone', rep('patient-profile.html', "    else if (typeof fuCellChips === 'function') typeBadge += fuCellChips(s);", '')],
  ['follow-up button back in the action column', rep('patient-profile.html', "          : '')   /* M210: «＋ متابعة» بخانة العلاج", "          : fuAddChip(s).replace('class=\"fu-add\"', 'class=\"sy-act\" data-slot=\"1\"'))   /* M210: «＋ متابعة» بخانة العلاج")],
  ['table spills out of its card', rep('patient-profile.css', "#sessionsContent.sc-wide{overflow-x:auto;", "#sessionsContent.sc-wide{")],
  ['plan panel clipped when the table scrolls', rep('patient-profile.css', "#sessionsContent.sc-wide .spc-panel{position:static;", "#sessionsContent.sc-wide .spc-panel{")],
  ['save without the RPC', rep('pp-followup.js', "window.sb.rpc('session_followup_add', {", "window.sb.rpc('session_followup_addx', {")],
  ['close flag dropped', rep('pp-followup.js', 'p_notes: notes || null, p_close: last', 'p_notes: notes || null, p_close: false')],
  ['future date accepted', rep('pp-followup.js', "  if (date > toDay()) { showToast('⚠️ تاريخ المتابعة في المستقبل — سجّلها يوم إجرائها'); return; }\n", '')],
  ['date before base accepted', rep('pp-followup.js', "  if (base.date && date < String(base.date).slice(0, 10)) { showToast('⚠️ تاريخ المتابعة قبل تاريخ الجلسة الأساسية'); return; }\n", '')],
  ['empty session accepted', rep('pp-followup.js', "  if (!step && !notes) { showToast('⚠️ اكتب ما تمّ في هذه الجلسة'); return; }\n", '')],
  ['chip stores the shown text', rep('pp-followup.js', "btn.getAttribute && btn.getAttribute('data-step')", 'btn.textContent')],
  ['read-only can write', rep('pp-followup.js', "  if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return true;   /* M141-ب */\n", '')],
  ['state change without asking', rep('pp-followup.js', "confirmText: closing ? 'اكتمل العلاج' : 'إعادة فتح', danger: false\n  })) return;", "confirmText: closing ? 'اكتمل العلاج' : 'إعادة فتح', danger: false\n  }) && false) return;")],
  ['failed save applied locally', rep('pp-followup.js', "  if (res.error || !res.data || !res.data.session) {", "  if (false) {")],
  ['unescaped base name', rep('pp-followup.js', "'<div class=\"fu-base-head\"><span class=\"fu-base-type\">' + fuEsc(base.type || 'علاج') + '</span>'", "'<div class=\"fu-base-head\"><span class=\"fu-base-type\">' + (base.type || 'علاج') + '</span>'")],
  ['unescaped step in the window', rep('pp-followup.js', "fuStepEnAttr(k.description) + '>' + fuEsc(k.description || '—') + '</span>'", "fuStepEnAttr(k.description) + '>' + (k.description || '—') + '</span>'")],
  ['delete without the warning', rep('patient-profile.html', "var _fuTail = _fuKids.length ? '\\n\\n' + fuDeleteNote(_fuKids.length) : '';", "var _fuTail = '';")],
  ['delete leaves ghost rows', rep('patient-profile.html', 'return s.id !== id && s.parent_id !== id; });   /* M210', 'return s.id !== id; });   /* M210')],
  ['statement lists follow-ups', rep('pp-plan.js', "    if (s.parent_id) return;   // M210: جلسةُ المتابعة بلا مال — ليست حركةً بكشف الحساب\n", '')],
  ['treatments report counts follow-ups', rep('rpt-treat.js', "      if (s && s.parent_id) return;   /* M210: جلسةُ المتابعة ليست إجراءً — علاجُها معدودٌ بجلسته الأساسية */\n", '')],
  ['day sheet counts follow-ups', rep('acc-daysheet.js', "        if (s.parent_id) return;   /* M210: جلسةُ المتابعة بلا مال — ليست بنداً بإنتاج اليوم ولا تُعدّ «جلسة منجزة» */\n", '')],
  ['provider count includes follow-ups', rep('provider-reports.html', 'var sessionCount = provSessions.filter(function(s){ return !s.parent_id; }).length;', 'var sessionCount = provSessions.length;')],
  ['accounting keeps follow-ups', rep('accounting.html', 'sessions = (res.data || []).filter(function(s){ return !s.parent_id; });', 'sessions = (res.data || []);')],
  ['default covers restorative', rep('pp-followup.js', 'var FU_MULTI_CATS = { endodontics: 1,', 'var FU_MULTI_CATS = { restorative: 1, endodontics: 1,')],
  ['explicit choice ignored', rep('pp-followup.js', '  if (t.multi_visit === true || t.multi_visit === false) return t.multi_visit;\n', '')],
  ['a step loses its translation', rep('i18n-en.js', "'غسل أقنية': 'Canal irrigation', ", '')],
  ['an ambiguous word enters the shared dictionary', rep('i18n-en.js', "'ترميم نهائي': 'Final restoration', ", "'ترميم نهائي': 'Final restoration', 'تجربة': 'Try-in', ")],
  ['single-word chip without its own English', rep('pp-followup.js', "(FU_STEP_EN[st] ? ' data-en=\"' + fuEsc(FU_STEP_EN[st]) + '\"' : '')", "''")],
  ['numbered tag loses its pattern', rep('i18n-en.js', "    [/^متابعة (\\d+)$/, 'Follow-up $1'],\n", '')],
  ['button translated as «Continue»', rep('pp-followup.js', ' data-en="＋ Follow-up"', '')],
  ['last visit not moved', rep('pp-followup.js', '(!patient.last_visit || date > patient.last_visit)) {', 'false) {')],
  ['last visit moves backwards', rep('pp-followup.js', '(!patient.last_visit || date > patient.last_visit)) {', 'true) {')],
  ['last visit not scoped to the clinic', rep('pp-followup.js', "update({ last_visit: date }).eq('id', patientId).eq('doctor_id', currentUser.id)", "update({ last_visit: date }).eq('id', patientId)")],
  ['failed last-visit write applied locally', rep('pp-followup.js', '    else patient.last_visit = date;', '    patient.last_visit = date;')],
  ['info card not refreshed', rep('pp-followup.js', "  if (typeof renderInfo === 'function') renderInfo();", '')],
  ['demo: follow-up carries money', rep('patient-profile.html', "description: args.p_step || null, cost:0, date: args.p_date", "description: args.p_step || null, cost: fb.cost, date: args.p_date")],
  ['demo: follow-up carries a tooth', rep('patient-profile.html', "treatment_key:null, tooth_num:null, surface:null,\n               currency: fb.currency, parent_id: fb.id", "treatment_key:null, tooth_num: fb.tooth_num, surface:null,\n               currency: fb.currency, parent_id: fb.id")],
  ['demo: follow-up of a follow-up', rep('patient-profile.html', "if (!fb || fb.parent_id || (fb.status || 'completed') !== 'completed') return bad;", "if (!fb || (fb.status || 'completed') !== 'completed') return bad;")],
  ['demo: follow-up of a planned row', rep('patient-profile.html', "if (!fb || fb.parent_id || (fb.status || 'completed') !== 'completed') return bad;", "if (!fb || fb.parent_id) return bad;")],
  ['demo: date before the base', rep('patient-profile.html', "(fb.date && String(args.p_date) < String(fb.date).slice(0, 10))", "false")],
  ['demo: close flag dropped', rep('patient-profile.html', "fb.followup_state = (!plan && args.p_close) ? 'closed' : 'open';", "fb.followup_state = 'open';")],
  ['demo: calls not routed', rep('patient-profile.html', "    if (name === 'session_followup_add' || name === 'session_followup_set_state' || name === 'session_followup_plan') return Promise.resolve(demoFollowupRpc(name, args || {}));   /* M210 */\n", '')],
  ['demo: delete leaves follow-ups', rep('patient-profile.html', "DB.ledger_sessions = rows('ledger_sessions').filter(function(r){ return ids.indexOf(r.parent_id) === -1; });", '')],
  ['demo: base stays in progress with no follow-up', rep('patient-profile.html', "if (r.id === g.parent_id && !((g.status || 'completed') === 'planned' && r.followup_state === 'open')) r.followup_state = null;", '')],
  ['M214: a booked visit cancelled frees the base', rep('migrations/214_followup_keep_open.sql', "       AND NOT (COALESCE(OLD.status, 'completed') = 'planned' AND b.followup_state = 'open')\n", '')],
  ['M214 not bootstrapped', rep('scripts/db-bootstrap.py', "    'migrations/214_followup_keep_open.sql',", "    #'migrations/214_followup_keep_open.sql',")],
  ['card mirror frees the base on a cancelled visit', rep('patient-profile.html', "if (_fuB && !((sess.status || 'completed') === 'planned' && _fuB.followup_state === 'open')) _fuB.followup_state = null;", "if (_fuB) _fuB.followup_state = null;")],
  ['demo frees the base on a cancelled visit', rep('patient-profile.html', "if (r.id === g.parent_id && !((g.status || 'completed') === 'planned' && r.followup_state === 'open')) r.followup_state = null;", "if (r.id === g.parent_id) r.followup_state = null;")],
  ['link keeps the planned date', rep('pp-appt.js', "    if (_fd) _patch.date = _fd;\n    try {", "    try {")],
  ['attach keeps the planned date', rep('pp-appt.js', "  if (_fd) _patch.date = _fd;\n  const { error }", "  const { error }")],
  ['link moves a visit to a past day', rep('pp-followup.js', "&& d >= toDay() && d !== String(row.date", "&& d !== String(row.date")],
  ['link moves a done visit', rep('pp-followup.js', "  if (!row || !row.parent_id || (row.status || 'completed') !== 'planned') return null;\n  var d = apptDate", "  if (!row || !row.parent_id) return null;\n  var d = apptDate")],
  ['M216 moves plain planned rows', rep('migrations/216_appt_followup_date_sync.sql', "WHERE s.appointment_id = NEW.id AND s.parent_id IS NOT NULL\n", "WHERE s.appointment_id = NEW.id\n")],
  ['M216 moves done visits', rep('migrations/216_appt_followup_date_sync.sql', "       AND COALESCE(s.status, 'completed') = 'planned' AND s.date IS DISTINCT FROM NEW.date;", "       AND s.date IS DISTINCT FROM NEW.date;")],
  ['M216 moves visits to a past day', rep('migrations/216_appt_followup_date_sync.sql', "     AND NEW.date >= (now() AT TIME ZONE 'Asia/Damascus')::date THEN", "     THEN")],
  ['M216 definer', rep('migrations/216_appt_followup_date_sync.sql', "RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$", "RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$")],
  ['M216 not bootstrapped', rep('scripts/db-bootstrap.py', "    'migrations/216_appt_followup_date_sync.sql',", "    #'migrations/216_appt_followup_date_sync.sql',")],
  ['database proof passes on a NULL report', rep('scripts/followup-db.sql', "IF r IS NULL OR r ~ 'FAIL|=false'", "IF r ~ 'FAIL|=false'")],
  ['demo: delete not mirrored', rep('patient-profile.html', "        if (b._t === 'ledger_sessions') demoFollowupAfterDelete(hit);   /* M210 */\n", '')],
  ['AI line drops the step', rep('pp-followup.js', "  if (s.description) out.push(String(s.description).slice(0, 80));\n", '')],
  ['AI line drops the place', rep('pp-followup.js', "  if (w) out.push(w);\n  if (s.description)", "  if (s.description)")],
  ['AI summary ignores follow-ups', rep('pp-extras.js', "      if (typeof fuAiParts === 'function') parts = parts.concat(fuAiParts(s));   /* M210: جلسةُ المتابعة بموضع أساسيتها وما تمّ فيها */\n", '')],
  ['referral letter ignores follow-ups', rep('pp-extras.js', "      if (typeof fuAiParts === 'function') parts = parts.concat(fuAiParts(s));   /* M210 */\n", '')],
  ['arrow glyph back in the tag', rep('pp-followup.js', '<span class="fu-arrow" aria-hidden="true"></span>متابعة', '<span class="fu-arrow" aria-hidden="true">↳</span> متابعة')],
  ['arrow glyph back on the button', rep('pp-followup.js', '>＋ متابعة</button>', '>↪ متابعة</button>')],
  ['tag corner drawn with physical sides', rep('patient-profile.css', 'border-inline-start:2px solid var(--text3);border-block-end:2px solid var(--text3)', 'border-right:2px solid var(--text3);border-block-end:2px solid var(--text3)')],
  ['guide tip untranslated', rep('i18n-en.js', "    'علاجٌ يمتدّ على زيارات (غسل أقنية، أو تحضير ثم تركيب)؟", "    'x علاجٌ يمتدّ على زيارات (غسل أقنية، أو تحضير ثم تركيب)؟")],
  ['guide tip removed', rep('guides.js', "        'علاجٌ يمتدّ على زيارات (غسل أقنية، أو تحضير ثم تركيب)؟", "        'x علاجٌ يمتدّ على زيارات (غسل أقنية، أو تحضير ثم تركيب)؟")],
  ['follow-up button on every completed row', rep('pp-followup.js', "  if (!fuMultiVisit(fuTreatmentOf(s)) && !fuState(s) && !fuChildren(s.id).length) return '';\n  return '<button type=\"button\" class=\"fu-add\"", "  return '<button type=\"button\" class=\"fu-add\"")],
  ['button lost on a plain treatment that has follow-ups', rep('pp-followup.js', "!fuMultiVisit(fuTreatmentOf(s)) && !fuState(s) && !fuChildren(s.id).length", "!fuMultiVisit(fuTreatmentOf(s))")],
  ['dropdown open by default', rep('pp-followup.js', "(fuIsExpanded(s.parent_id) ? '' : ' fu-hidden')", "''")],
  ['toggle does nothing', rep('pp-followup.js', "tr.classList.toggle('fu-hidden', !open); });", "});")],
  ['toggle opens every group', rep('pp-followup.js', "if (tr.getAttribute('data-fu-parent') === id) tr.classList", "tr.classList")],
  ['toggle chip not updated', rep('pp-followup.js', "    if (b.getAttribute('data-fu-toggle') !== id) return;\n    b.setAttribute('aria-expanded', String(open));", "    b.setAttribute('aria-expanded', 'false');")],
  ['no toggle on the base', rep('pp-followup.js', "var h = fuAddChip(s) + fuToggleChip(s);", "var h = fuAddChip(s);")],
  ['mid widths keep the wide padding', rep('patient-profile.css', "@container mc (max-width:1100px){ .sess-table th,.sess-table td{padding-inline:5px;}", "@container mc (max-width:1px){ .sess-table th,.sess-table td{padding-inline:5px;}")],
  ['save leaves the group folded', rep('pp-followup.js', "  _fuExpanded[base.id] = true;", '')],
  ['folded rows still shown (CSS)', rep('patient-profile.css', ".sess-table tr.fu-row.fu-hidden{display:none;}", '')],
  ['toggle count untranslated', rep('i18n-en.js', "    [/^المتابعات \\((\\d+)\\)$/, 'Follow-ups ($1)'],\n", '')],
  ['M211: open still needs a follow-up', rep('migrations/211_followup_need.sql', "  IF p_state = 'closed' AND NOT kids THEN", "  IF NOT kids THEN")],
  ['M211: clearing allowed with follow-ups', rep('migrations/211_followup_need.sql', "  IF p_state IS NULL AND kids THEN", "  IF false THEN")],
  ['M211: definer', rep('migrations/211_followup_need.sql', "RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER", "RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER")],
  ['M211: anon keeps execute', rep('migrations/211_followup_need.sql', "FROM PUBLIC, anon;", "FROM PUBLIC;")],
  ['M211 not bootstrapped', rep('scripts/db-bootstrap.py', "    'migrations/211_followup_need.sql',", "    #'migrations/211_followup_need.sql',")],
  ['treatments-page default drifts', rep('treatments.html', "var FU_MULTI_CATS = { endodontics: 1,", "var FU_MULTI_CATS = { surgical: 1, endodontics: 1,")],
  ['patient card ignores the clinic choice', rep('pp-core.js', "               multi_visit: (t.multi_visit === true || t.multi_visit === false) ? t.multi_visit : null,", "               multi_visit: null,")],
  ['untouched switch overwrites the stored value', rep('treatments.html', "if (window.__m210T) updatePayload.multi_visit = userTouchedMultiVisit ? document.getElementById('tMultiVisit').checked : _mvStored;", "if (window.__m210T) updatePayload.multi_visit = document.getElementById('tMultiVisit').checked;")],
  ['touched switch overwritten by the category', rep('treatments.html', "  if (!cb || userTouchedMultiVisit) return;", "  if (!cb) return;")],
  ['stored choice ignored on the page', rep('treatments.html', "  if (_mvStored === true || _mvStored === false) { cb.checked = _mvStored; return; }", "")],
  ['denture service multi-visit by default', rep('treatments.html', "cb.checked = fuMultiVisitDefault({ category: cat, denture_svc: dbTargetOf(pickedTarget).denture_svc });", "cb.checked = fuMultiVisitDefault({ category: cat, denture_svc: null });")],
  ['tooth save not wrapped', rep('pp-dental.js', "  return (typeof fuNeedRun === 'function') ? fuNeedRun(_saveToothTreatment_inner, this, arguments) : _saveToothTreatment_inner.apply(this, arguments);", "  return _saveToothTreatment_inner.apply(this, arguments);")],
  ['lab save not wrapped', rep('pp-clinical.js', "  return (typeof fuNeedRun === 'function') ? fuNeedRun(_saveToothAndOpenLab_inner, this, arguments) : _saveToothAndOpenLab_inner.apply(this, arguments);", "  return _saveToothAndOpenLab_inner.apply(this, arguments);")],
  ['switch not reset on a new treatment', rep('pp-dental.js', "  if (typeof fuNeedSync === 'function') fuNeedSync(true);   /* M211 */\n", "")],
  ['switch shown for a planned treatment', rep('pp-followup.js', "box.style.display = ((scope === 'S' || t) && st === 'completed' && !cond) ? '' : 'none';", "box.style.display = ((scope === 'S' || t) && !cond) ? '' : 'none';")],
  ['status flip resets the choice', rep('pp-followup.js', "if (reset || cb.getAttribute('data-key') !== String(key)) {", "if (true) {")],
  ['fees marked', rep('pp-followup.js', "!fuIsChild(s) && !fuIsFee(s) && !fuState(s)", "!fuIsChild(s) && !fuState(s)")],
  ['planned rows marked', rep('pp-followup.js', " && (s.status || 'completed') === 'completed';\n  });", ";\n  });")],
  ['old sessions marked', rep('pp-followup.js', "return !!s && !!s.id && !before[s.id] &&", "return !!s && !!s.id &&")],
  ['marks without the switch', rep('pp-followup.js', "  if (want) { try { await fuMarkNeed(before); }", "  if (true) { try { await fuMarkNeed(before); }")],
  ['failed mark claims success', rep('pp-followup.js', "    if (res && !res.error && res.data) { list[i].followup_state = 'open'; ok++; }", "    list[i].followup_state = 'open'; ok++;")],
  ['clear without asking', rep('pp-followup.js', "    confirmText: 'لا يحتاج متابعة', danger: false\n  })) return;", "    confirmText: 'لا يحتاج متابعة', danger: false\n  }) && false) return;")],
  ['clear sends a value', rep('pp-followup.js', "{ p_session: base.id, p_state: null }", "{ p_session: base.id, p_state: 'none' }")],
  ['childless badge closes instead of clearing', rep('pp-followup.js', "onclick=\"fuSetState(\\'' + s.id + '\\',\\'none\\')\"", "onclick=\"fuSetState(\\'' + s.id + '\\',\\'closed\\')\"")],
  ['switch label untranslated', rep('i18n-en.js', "    'يحتاج جلسات متابعة': 'Needs follow-up sessions',   /* treatments.html */\n", "")],
  ['appointments default drifts', rep('appointments.html', "var FU_MULTI_CATS = { endodontics: 1,", "var FU_MULTI_CATS = { restorative: 1, endodontics: 1,")],
  ['appointments map drops the clinic choice', rep('appointments.html', "        multi_visit: (t.multi_visit === true || t.multi_visit === false) ? t.multi_visit : null,", "")],
  ['appointment completion not marked', rep('appointments.html', "  if (completedForDeduct.length) { try { await apptFuMarkNeed(completedForDeduct); }", "  if (false) { try { await apptFuMarkNeed(completedForDeduct); }")],
  ['appointment prompt silent', rep('appointments.html', "    if (_fuN) promptMsg +=", "    if (false) promptMsg +=")],
  ['appointment marks by name only', rep('appointments.html', "  var t = s.treatment_key ? getTreatment(s.treatment_key) : null;", "  var t = null;")],
  ['appointment explicit choice ignored', rep('appointments.html', "  return (t.multi_visit === true || t.multi_visit === false) ? t.multi_visit : fuMultiVisitDefault(t);\n}\nasync function apptFuMarkNeed", "  return fuMultiVisitDefault(t);\n}\nasync function apptFuMarkNeed")],
  ['table completion not marked', rep('patient-profile.html', "  if (typeof fuMarkCompleted === 'function') await fuMarkCompleted([sess]);", "")],
  ['table completion marks a filling', rep('pp-followup.js', " && (s.status || 'completed') === 'completed' && fuMultiVisit(fuTreatmentOf(s));", " && (s.status || 'completed') === 'completed';")],
  ['table completion loud toast', rep('pp-followup.js', "  if (loud || ok < list.length) showToast(", "  showToast(")],
  ['session window save not wrapped', rep('patient-profile.html', "fuNeedRun(_saveSession_inner, this, arguments, 'S')", "_saveSession_inner.apply(this, arguments)")],
  ['session window switch reads the tooth box', rep('pp-followup.js', "  return scope === 'S'\n    ?", "  return false\n    ?")],
  ['session window ignores the chosen treatment', rep('pp-appt.js', "  if (typeof fuNeedSync === 'function') fuNeedSync(false, 'S');   /* M211: علاجٌ آخر ⇒ افتراضُه */\n", "")],
  /* M213 (ج2-ب) */
  ['M213: definer', rep('migrations/213_followup_plan.sql', 'RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER', 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER')],
  ['M213: anon keeps execute', rep('migrations/213_followup_plan.sql', 'FROM PUBLIC, anon;', 'FROM PUBLIC;')],
  ['M213: past date allowed', rep('migrations/213_followup_plan.sql', 'p_date IS NULL OR p_date < v_today OR p_date > v_today + 730', 'p_date IS NULL OR p_date > v_today + 730')],
  ['M213: stored as done', rep('migrations/213_followup_plan.sql', "v_step, 0, p_date, v_notes, 'planned',", "v_step, 0, p_date, v_notes, 'completed',")],
  ['M213: carries the base money', rep('migrations/213_followup_plan.sql', "v_step, 0, p_date, v_notes, 'planned',", "v_step, b.cost, p_date, v_notes, 'planned',")],
  ['M213: base not in progress', rep('migrations/213_followup_plan.sql', "  UPDATE public.ledger_sessions SET followup_state = 'open' WHERE id = b.id AND followup_state IS DISTINCT FROM 'open';\n", '')],
  ['M213: another clinic\'s base', rep('migrations/213_followup_plan.sql', 'WHERE id = p_parent AND doctor_id = (SELECT auth.uid()) FOR UPDATE', 'WHERE id = p_parent FOR UPDATE')],
  ['M213 not bootstrapped', rep('scripts/db-bootstrap.py', "    'migrations/213_followup_plan.sql',", "    #'migrations/213_followup_plan.sql',")],
  ['plan saved as a done visit', rep('pp-followup.js', "  if (_fuMode === 'plan') return fuPlanSave(base);\n", '')],
  ['plan: past date accepted', rep('pp-followup.js', "if (date < today || (base.date && date < String(base.date).slice(0, 10))) { showToast('⚠️ تاريخ الزيارة التالية في الماضي'); return; }", '')],
  ['plan: far date accepted', rep('pp-followup.js', "  if (date > fuAddDays(today, FU_PLAN_DAYS)) { showToast('⚠️ تاريخ الزيارة التالية بعيد جداً — حتى سنتين'); return; }\n", '')],
  ['plan: default date today', rep('pp-followup.js', ': fuAddDays(min, 7);', ': min;')],
  ['plan: «آخر جلسة» still shown', rep('pp-followup.js', "last.parentNode.style.display = plan ? 'none' : '';", "last.parentNode.style.display = '';")],
  ['plan: hidden «آخر جلسة» kept checked', rep('pp-followup.js', "if (last) { last.checked = false; if", "if (last) { if")],
  ['open keeps the last date', rep('pp-followup.js', "  document.getElementById('fuDate').value = '';   /* كلُّ فتحٍ", "  /* كلُّ فتحٍ")],
  ['booking: visit not attached', rep('pp-followup.js', '  _pendingAttachmentsPP = [child];\n', '')],
  ['booking: date not applied', rep('pp-followup.js', "if (d) d.value = String(child.date).slice(0, 10);", '')],
  ['booking: doctor not applied', rep('pp-followup.js', 'return o.value === child.provider_id; })) pr.value = child.provider_id;', 'return o.value === child.provider_id; })) {}')],
  ['booking: blocked window still attached', rep('pp-followup.js', "if (!mo || !mo.classList.contains('open') || (typeof editingApptId", "if (false && (typeof editingApptId")],
  ['plan: «آخر زيارة» moved', rep('pp-followup.js', "  base.followup_state = 'open';\n  _fuExpanded[base.id] = true;\n  if (window.logAudit) {\n    window.logAudit('session.create', {\n      entityId: child.id, patientId: patientId, patientName: (patient && patient.name) || '',\n      description: 'زيارة متابعة مخطّطة: '",
    "  base.followup_state = 'open';\n  _fuExpanded[base.id] = true; window.sb.from('patients').update({ last_visit: date }).eq('id', patientId).then(function(){});\n  if (window.logAudit) {\n    window.logAudit('session.create', {\n      entityId: child.id, patientId: patientId, patientName: (patient && patient.name) || '',\n      description: 'زيارة متابعة مخطّطة: '")],
  ['plan not audited', rep('pp-followup.js', "description: 'زيارة متابعة مخطّطة: '", "description: 'جلسة متابعة: '")],
  ['prompt despite a booked visit', rep('pp-followup.js', "fuState(base) !== 'open' || fuNextPlanned(baseId)) return;", "fuState(base) !== 'open') return;")],
  ['prompt after the last visit', F => rep('pp-followup.js', "fuState(base) !== 'open' || fuNextPlanned", 'fuNextPlanned')(rep('pp-followup.js', '  if (!last) setTimeout(function () { fuAskNext(base.id); }, 0);', '  setTimeout(function () { fuAskNext(base.id); }, 0);')(F))],
  ['no next-visit prompt', rep('pp-followup.js', '  if (!last) setTimeout(function () { fuAskNext(base.id); }, 0);\n', '')],
  ['«احجزها» opens the done tab', rep('pp-followup.js', "  })) fuOpen(baseId, 'plan');", "  })) fuOpen(baseId);")],
  ['badge counts booked visits', rep('pp-followup.js', "return (k.status || 'completed') === 'completed'; }).length;\n}", "return true; }).length;\n}")],
  ['booked-only badge clickable', rep('pp-followup.js', "  if (st === 'open' && !n && fuChildren(s.id).length)", "  if (false)")],
  ['window hides the booked mark', rep('pp-followup.js', "((k.status || 'completed') === 'planned' ? '<span class=\"sess-chip tone tone-yellow\">مخطّطة</span>' : '')", "''")],
  ['plan controls on a follow-up row', rep('patient-profile.html', "if (st === 'planned' && !_fuC && typeof planRowCtlHtml === 'function')", "if (st === 'planned' && typeof planRowCtlHtml === 'function')")],
  ['plan lists follow-up visits', rep('pp-plan.js', "=== 'planned' && !s.parent_id; });   /* M213", "=== 'planned'; });   /* M213")],
  ['appointment marks a follow-up as a base', rep('appointments.html', '  if (!s || s.parent_id) return false;', '  if (!s) return false;')],
  ['appointments page drops parent_id', rep('appointments.html', "treatment_key, parent_id';", "treatment_key';")],
  ['demo: plan not routed', rep('patient-profile.html', " || name === 'session_followup_plan') return", ") return")],
  ['demo: plan stored as done', rep('patient-profile.html', "status: plan ? 'planned' : 'completed',", "status:'completed',")],
  ['demo: plan in the past', rep('patient-profile.html', "    if (plan && String(args.p_date) < today) return", "    if (false) return")],
  ['plan button untranslated', rep('i18n-en.js', "    '📅 حفظ واحجز الموعد': '📅 Save and book the appointment',\n", '')],
  ['follow-up row name untranslated', rep('i18n-en.js', "    [/^متابعة — (.+)$/, function (m, x) { return 'Follow-up — ' + (D[x] || x); }],", '')],
  ['appointment completion keeps the planned date', rep('appointments.html', '    if (s.parent_id && _curAppt && _curAppt.date) sessPatch.date', '    if (false) sessPatch.date')],
  ['table completion leaves a future date', rep('patient-profile.html', "  if (sess.parent_id && sess.date && String(sess.date).slice(0, 10) > toDay()) _p1.date = toDay();", '')],
  ['appointment type left on the first option', rep('pp-followup.js', "if (Array.prototype.some.call(sel.options || [], function (o) { return o.value === String(t.id); })) sel.value = String(t.id);", '')],
  ['appointment window shows 0 for a follow-up', rep('pp-appt.js', "(s.parent_id ? 'ضمن الأساسية' : costStr + ' ' + curLblOf(s.currency))", "(costStr + ' ' + curLblOf(s.currency))")],
  ['ambiguous step left untranslated on the row', rep('patient-profile.html', "((_fuC && typeof fuStepEnAttr === 'function') ? fuStepEnAttr(desc) : '')", "''")],
  ['plain sessions get step English', rep('patient-profile.html', "((_fuC && typeof fuStepEnAttr === 'function') ? fuStepEnAttr(desc) : '')", "((typeof fuStepEnAttr === 'function') ? fuStepEnAttr(desc) : '')")],
  ['lab stage name without English', rep('pp-followup.js', ", 'تجربة الهيكل': 'Framework try-in' };", " };")],
  ['mode tabs not registered', rep('scripts/check-mirrors.js', "'fuToggle', 'fuSetMode'", "'fuToggle'")],
  /* ج3-ب */
  ['report follow-up counter counts everything', rep('provider-reports.html', 'var followupCount = provSessions.filter(function(s){ return !!s.parent_id; }).length;', 'var followupCount = provSessions.length;')],
  ['clinic follow-up total missing', rep('provider-reports.html', "    followups: sessions.filter(function(s){ return !!s.parent_id; }).length,", "    followups: 0,")],
  ['card row always shown', rep('provider-reports.html', "(stats.followupCount > 0 ? '<div class=\"prov-row\"><span class=\"k\">🔁", "(true ? '<div class=\"prov-row\"><span class=\"k\">🔁")],
  ['KPI line always shown', rep('provider-reports.html', "(_ct.followups > 0 ? '<div class=\"sub\">", "(true ? '<div class=\"sub\">")],
  ['details shows 0 for a follow-up', rep('provider-reports.html', "(s.parent_id ? '<span style=\"color:var(--text2);font-size:12px;\">ضمن العلاج</span>' : fmtSY(s.cost))", "fmtSY(s.cost)")],
  ['details shows a share for a follow-up', rep('provider-reports.html', "(basis === 'collection' || s.parent_id ? '—'", "(basis === 'collection' ? '—'")],
  ['slip shows 0 for a follow-up', rep('provider-reports.html', "(s.parent_id ? 'ضمن العلاج' : fmtSY(s.cost))", "fmtSY(s.cost)")],
  ['CSV value misaligned', rep('provider-reports.html', 'st.sessionCount, st.followupCount,', 'st.followupCount, st.sessionCount,')],
  ['counter untranslated', rep('i18n-en.js', "    'زيارات المتابعة': 'Follow-up visits', ", '    ')],
  ['«ضمن العلاج» untranslated', rep('i18n-en.js', "    'ضمن العلاج': 'Part of the treatment',\n", '')],
  ['state badge hidden in read-only', rep('patient-profile.css', '[onclick*="fuSave("],', '[onclick*="fuSave("],[onclick*="fuSetState("],')]
];

(async () => {
  const res = await run(LIVE), bad = res.filter(x => !x[0]);
  if (bad.length) { bad.forEach(x => console.error('  ✗ ' + x[1])); console.error('prove-followup ❌ ' + bad.length + '/' + res.length + ' توكيداً سقط'); process.exit(1); }
  if (process.argv.indexOf('--self-test') < 0) { console.log('prove-followup ✅ ' + res.length + ' توكيداً'); return; }
  /* الطفراتُ مستقلّة ⇒ تُوزَّع على أنوية المعالج (scripts/mutant-pool.js) — طفرةٌ بلا مرساة لا تُعدّ عاضّة */
  const anchorless = [];
  MUT.forEach(([name, mut]) => { try { mut(LIVE); } catch (e) { anchorless.push(name + ' (' + e.message + ')'); } });
  const pool = await runMutants(MUT, async ([, mut]) => {
    let F2; try { F2 = mut(LIVE); } catch (e) { return false; }
    const r = await run(F2); return r.some(x => !x[0]);
  });
  const dull = pool.dull.map(i => MUT[i][0]).filter(n => !anchorless.some(a => a.indexOf(n + ' (') === 0)).concat(anchorless);
  if (pool.failed.length) console.error('  ✗ عاملٌ مات بلا تقرير: ' + pool.failed.join());
  if (dull.length || pool.failed.length) { dull.forEach(n => console.error('  ✗ طفرةٌ لم تعضّ: ' + n)); console.error('prove-followup ❌ ' + pool.bit + '/' + MUT.length + ' طفرات تعضّ'); process.exit(1); }
  console.log('prove-followup ✅ ' + res.length + ' توكيداً · ' + pool.bit + '/' + MUT.length + ' طفرات تعضّ');
})();
