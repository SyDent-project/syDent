/* v593 — مثبتُ «موعد سريع» (بلاغ المالك: القالبُ من اللوحة بطيء، 10 تشرين الأول 2026).
   الدوالُّ الحيّة من appointments.html بسياق vm وعميلِ Supabase مصطنع يعدّ الرحلات:
   (١) الكتالوجُ والأطباءُ يُجلبان مرةً واحدة لعمر الصفحة (الإقلاع) — فتحُ النافذة لا يعيد جلبَهما.
   (٢) برابطٍ عميق لموعدٍ جديد تُجلب أسماءُ المرضى مع الإقلاع وتستهلكها النافذة بلا رحلة.
   (٣) فتحٌ عاديّ (بلا رابط): رحلةُ الأسماء وحدها، والقراءاتُ الثلاث تنطلق معاً لا متسلسلة.
   (٤) فشلُ جلب الأطباء/الكتالوج لا يُخزَّن — يُعاد بالفتح التالي.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('{', i); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return ''; }
const base = { 'appointments.html': read('appointments.html'), 'appt-modal.js': read('appt-modal.js') };

function build(F, opts) {
  const H = F['appointments.html'], M = F['appt-modal.js'];
  const calls = []; let failDoctors = !!opts.failDoctors;
  const el = () => { const o = { style: {}, dataset: {}, value: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, appendChild() {}, focus() {}, reset() {}, querySelector() { return null; }, querySelectorAll() { return []; }, children: [], options: [] }; return o; };
  const els = {};
  const doc = { getElementById: id => (els[id] = els[id] || el()), querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(), addEventListener() {}, readyState: 'complete', body: el(), documentElement: el(), head: el() };
  function q(table) {
    const r = { _t: table, _n: 0 };
    ['select', 'eq', 'order', 'in', 'limit', 'range', 'gte', 'lte', 'neq', 'is', 'or'].forEach(m => { r[m] = function () { return r; }; });
    r.then = (res, rej) => {
      calls.push(table);
      return new Promise(resolve => setTimeout(resolve, 2)).then(() => {
        if (table === 'clinic_doctors' && failDoctors) return res({ data: null, error: { message: 'boom', code: '500' } });
        const rows = { treatments: [{ id: 'u1', treatment_key: 'fill', name: 'حشوة', fill: '#112233', stroke: '#112233', price: 1, currency: 'SYP', sort_order: 1 }],
                       clinic_doctors: [{ id: 'd1', name: 'د. أ', is_active: true, is_owner: true, provider_type: 'doctor' }],
                       patients: [{ name: 'ياسر' }, { name: 'ليلى' }] }[table] || [];
        return res({ data: rows, error: null });
      });
    };
    return r;
  }
  const sb = { from: q, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } };
  const w = { location: { search: opts.search || '', href: 'https://x/appointments.html' + (opts.search || '') }, sb, SyDentFetchAll: async fn => fn(), SyDentColorPicker: null,
              addEventListener() {}, history: { replaceState() {} } };
  const ls = {}; const localStorage = { getItem: k => ls[k] || null, setItem: (k, v) => { ls[k] = v; }, removeItem: k => { delete ls[k]; } };
  const ctx = { window: w, document: doc, localStorage, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, URLSearchParams, URL, JSON, Date, Number, parseInt, Math, String, Array, Object, RegExp, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const parts = [
    'var TREATMENTS = []; var CLINIC_DOCTORS = []; var currentUser = { id: "u" }; var editingId = null, selectedColor = "green"; var _fpNames = []; var _gap8TableMissing = true; var _appointmentTypes = []; var OPERATORIES = [];',
    'function _sanHex(h){ return "#112233"; } function dateStr(d){ return "2026-10-10"; }',
    'function apptApplyModalReadOnly(){} function updatePatientMedHint(){} function apptRepeatReset(){} function clearPendingA(){} function setApptProcSectionModeA(){} function onPlannedToggle(){} function setApptMoveLockUI(){} function updateColorPreview(){} function populateApptTypePicker(){} function populateOperatoryPicker(){} function getDefaultProviderId(l){ return l[0] && l[0].id; } function escapeHtml(s){ return String(s); }',
    fnSrc(H, 'var _treatmentsLoad'), fnSrc(H, 'function loadTreatmentsFromSupabase'), fnSrc(H, 'async function _loadTreatmentsOnce'),
    fnSrc(H, 'function getTreatment'), fnSrc(H, 'async function populateApptTypes'),
    'var _clinicDoctorsLoad = null;', fnSrc(H, 'function loadClinicDoctors'), fnSrc(H, 'async function _loadClinicDoctorsOnce'),
    fnSrc(H, 'async function loadPatientNames'), fnSrc(M, 'async function populateApptProviderPicker'),
    fnSrc(H, 'async function openModal'),
    'var _loadTreatmentsOnce_ok = typeof _loadTreatmentsOnce === "function";'
  ];
  try { vm.runInContext(parts.join('\n'), ctx); } catch (e) { return { error: e, calls, ctx }; }
  return { calls, ctx, setFailDoctors: v => { failDoctors = v; } };
}
const during = (calls, fn) => { const n = calls.length; return fn().then(() => calls.slice(n)); };
const init = (F, search) => vm.runInContext('(function(){ var q = new URLSearchParams(window.location.search); if (q.get("newWithTemplate") || q.get("slot") || q.get("newFor")) window._apptNamesPrefetch = loadPatientNames(); return Promise.all([loadClinicDoctors(), loadTreatmentsFromSupabase()]); })()', F.ctx);

async function suite(F) {
  const H = F['appointments.html'];
  ok(/q\.get\('newWithTemplate'\) \|\| q\.get\('slot'\) \|\| q\.get\('newFor'\)\) window\._apptNamesPrefetch = loadPatientNames\(\)/.test(H), 'init: deep link for a new appointment prefetches patient names with the boot batch');
  ok(/await Promise\.all\(\[_typesP, populateApptProviderPicker\(null\)\]\);/.test(H) && /const names = await _namesP;/.test(H), 'openModal: catalog · providers · names in flight together');
  // (١) + (٣): normal open after boot
  let B = build(F, { search: '' }); if (B.error) { ok(false, 'build: ' + B.error.message); return; }
  await init(B, '');
  const boot = B.calls.slice();
  ok(boot.filter(t => t === 'clinic_doctors').length === 1 && boot.filter(t => t === 'treatments').length === 1, 'boot: doctors + catalog once (' + boot.join(',') + ')');
  const open1 = await during(B.calls, () => vm.runInContext('openModal()', B.ctx));
  ok(open1.join(',') === 'patients', 'plain open after boot: only the patient-names round (' + open1.join(',') + ')');
  const open2 = await during(B.calls, () => vm.runInContext('openModal()', B.ctx));
  ok(open2.join(',') === 'patients', 'second open: still only names — catalog/doctors stay cached (' + open2.join(',') + ')');
  ok(vm.runInContext('CLINIC_DOCTORS.length === 1 && TREATMENTS.length === 1 && _fpNames.length === 2', B.ctx), 'pickers + names populated');
  // (٢): deep link
  B = build(F, { search: '?newWithTemplate=t1' });
  await init(B);
  const open3 = await during(B.calls, () => vm.runInContext('openModal()', B.ctx));
  ok(open3.length === 0 && vm.runInContext('_fpNames.length === 2 && !window._apptNamesPrefetch', B.ctx), 'deep link: modal opens with ZERO network rounds — names came with the boot batch (' + open3.join(',') + ')');
  const open4 = await during(B.calls, () => vm.runInContext('openModal()', B.ctx));
  ok(open4.join(',') === 'patients', 'prefetch is consumed once — the next open fetches names again (' + open4.join(',') + ')');
  // (٤): failed doctor load is not cached
  B = build(F, { search: '', failDoctors: true });
  await init(B);
  B.setFailDoctors(false);
  const open5 = await during(B.calls, () => vm.runInContext('openModal()', B.ctx));
  ok(open5.indexOf('clinic_doctors') > -1 && vm.runInContext('CLINIC_DOCTORS.length === 1', B.ctx), 'a failed doctors load is retried on open (' + open5.join(',') + ')');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['doctors refetched on every open', rep('appointments.html', '  if (_clinicDoctorsLoad) return _clinicDoctorsLoad;\n', '')],
  ['catalog refetched on every open', rep('appointments.html', '  if (_treatmentsLoad && !force) return _treatmentsLoad;\n', '')],
  ['deep-link prefetch dropped', rep('appointments.html', "if (q.get('newWithTemplate') || q.get('slot') || q.get('newFor')) window._apptNamesPrefetch = loadPatientNames()", "if (false) window._apptNamesPrefetch = loadPatientNames()")],
  ['prefetch ignored by openModal', rep('appointments.html', 'var _namesP = window._apptNamesPrefetch || loadPatientNames();', 'var _namesP = loadPatientNames();')],
  ['failed doctors load cached forever', rep('appointments.html', "CLINIC_DOCTORS = []; _clinicDoctorsLoad = null; return; }", "CLINIC_DOCTORS = []; return; }")]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-appt-quick-open: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-appt-quick-open: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
