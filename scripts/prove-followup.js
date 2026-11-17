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

const FILES = ['pp-followup.js', 'patient-profile.html', 'patient-profile.css', 'pp-plan.js', 'pp-timeline.js', 'pp-core.js', 'pp-dental.js', 'supabase-init.js',
  'provider-reports.html', 'rpt-treat.js', 'acc-daysheet.js', 'accounting.html', 'index.html', 'i18n-en.js', 'theme.js', 'pp-extras.js', 'guides.js',
  'migrations/210_followup_sessions.sql', 'db/schema.sql', 'scripts/db-bootstrap.py', 'scripts/cache-bust.sh', 'scripts/check-mirrors.js',
  'scripts/check-modal-behaviour.js', 'scripts/validate.sh', 'scripts/followup-db.sql'];
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
    function renderInfo() { window.__ri++; }
    window.SyDentSub = { blockReadOnly: function () { return window.__ro; }, isReadOnly: function () { return window.__ro; } };
    window.SyDialog = { confirm: function (o) { window.__DIALOGS.push(o); return Promise.resolve(window.__confirm); } };
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
      if (fn === 'session_followup_set_state') {
        if (!b || b.parent_id || !window.__DB.some(function (x) { return x.parent_id === b.id; })) return Promise.resolve({ data: null, error: { message: 'followup_base_invalid' } });
        b.__state = a.p_state; return Promise.resolve({ data: { id: b.id, state: a.p_state }, error: null });
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
    extractFunction(PP, 'renderSessions'), extractFunction(PP, 'renderRecentSessions'),
    F['pp-followup.js']
  ].map(x => '<script>' + x.replace(/<\/script/gi, '<\\/script') + '</script>').join('\n');
  return '<!doctype html><html dir="rtl" lang="ar"><body><div id="sessionsContent"></div><div id="recentSessionsList"></div>' + entry + modals
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
  const out = [], ok = (c, m) => out.push([!!c, m]);
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
    await w.fuSave(); await tick(w);
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
    w.__confirm = false; await w.fuSetState('b1', 'open'); ok(w.__RPC.length === 2 && w.__DIALOGS.length === 1 && w.__DIALOGS[0].danger === false, 'reopening asks first; «cancel» writes nothing');
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
    ok(/#sessionsContent\{container:mc \/ inline-size;overflow-x:auto;max-width:100%;\}/.test(F['patient-profile.css']) && /@container mc \(max-width:1100px\)\{ \.sess-table th,\.sess-table td\{padding-inline:5px;\}/.test(F['patient-profile.css']),
      'the sessions table stays inside its card: scrolls within it at worst, tighter padding between the card layout and full width');
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
  ['table spills out of its card', rep('patient-profile.css', "#sessionsContent{container:mc / inline-size;overflow-x:auto;max-width:100%;}", "#sessionsContent{container:mc / inline-size;}")],
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
  ['unescaped step in the window', rep('pp-followup.js', "'<span class=\"fu-prev-t\">' + fuEsc(k.description || '—') + '</span></div>'", "'<span class=\"fu-prev-t\">' + (k.description || '—') + '</span></div>'")],
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
  ['demo: close flag dropped', rep('patient-profile.html', "fb.followup_state = args.p_close ? 'closed' : 'open';", "fb.followup_state = 'open';")],
  ['demo: calls not routed', rep('patient-profile.html', "    if (name === 'session_followup_add' || name === 'session_followup_set_state') return Promise.resolve(demoFollowupRpc(name, args || {}));   /* M210 */\n", '')],
  ['demo: delete leaves follow-ups', rep('patient-profile.html', "DB.ledger_sessions = rows('ledger_sessions').filter(function(r){ return ids.indexOf(r.parent_id) === -1; });", '')],
  ['demo: base stays in progress with no follow-up', rep('patient-profile.html', "if (r.id === g.parent_id) r.followup_state = null;", '')],
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
  ['state badge hidden in read-only', rep('patient-profile.css', '[onclick*="fuSave("],', '[onclick*="fuSave("],[onclick*="fuSetState("],')]
];

(async () => {
  const res = await run(LIVE), bad = res.filter(x => !x[0]);
  if (bad.length) { bad.forEach(x => console.error('  ✗ ' + x[1])); console.error('prove-followup ❌ ' + bad.length + '/' + res.length + ' توكيداً سقط'); process.exit(1); }
  if (process.argv.indexOf('--self-test') < 0) { console.log('prove-followup ✅ ' + res.length + ' توكيداً'); return; }
  let bit = 0; const dull = [];
  for (const [name, mut] of MUT) {
    let F2; try { F2 = mut(LIVE); } catch (e) { dull.push(name + ' (' + e.message + ')'); continue; }
    let r; try { r = await run(F2); } catch (e) { r = [[false, 'threw']]; }
    if (r.some(x => !x[0])) bit++; else dull.push(name);
  }
  if (dull.length) { dull.forEach(n => console.error('  ✗ طفرةٌ لم تعضّ: ' + n)); console.error('prove-followup ❌ ' + bit + '/' + MUT.length + ' طفرات تعضّ'); process.exit(1); }
  console.log('prove-followup ✅ ' + res.length + ' توكيداً · ' + bit + '/' + MUT.length + ' طفرات تعضّ');
})();
