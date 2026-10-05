/* v551 — مثبتُ أداء التقويم (DeepCode #1 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   (١) الإقلاع: القراءاتُ المساندة السبع دفعةٌ متوازية واحدة (_apptAux) لا await متتالية، وطلباتُ الحجز
       غير حاجبة وتبدأ معها، والمواعيدُ تنطلق بالتوازي معها.
   (٢) loadAppointments: المواعيد والجلسات وطلبات المخابر تُطلَق **قبل** انتظار أيٍّ منها (سلوكياً بـvm):
       الطلباتُ الثلاثة تبدأ قبل أن يُحسم أولُها · المعالجةُ بالترتيب نفسه (المخطّطُ لموعدٍ ميت يعود للجدولة) ·
       أولُ رسمٍ ينتظر _apptAux · خطأُ المواعيد ⇒ توست بلا رسم وبلا رفضٍ غير ملتقَط · استثناءُ الجلسات/المخابر
       يُسجَّل ويُرسم الباقي · بعد الإقلاع (_apptAux = null) يُرسم فوراً.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const base = { 'appointments.html': read('appointments.html') };

async function suite(F) {
  const H = F['appointments.html'];
  /* ── (١) شكل الإقلاع ── */
  const init = fnSrc(H, '(async function init() {');
  const boot = init.slice(init.indexOf('currentUser = data.user;'), init.indexOf('// Phase 2A — Deep-link handler'));
  const LOADERS = ['loadClinicDoctors', 'loadOperatoriesCache', 'loadAppointmentTypes', 'loadClinicSettingsWa', 'loadPatientPhones', 'loadReminderLogs', 'loadBlocks'];
  const batch = (boot.match(/_apptAux = Promise\.all\(\[([\s\S]*?)\]\.map\(/) || [])[1] || '';
  ok(LOADERS.every(n => new RegExp('\\b' + n + '\\(\\)').test(batch)), 'boot: all seven supporting reads are in one parallel batch');
  ok(!LOADERS.some(n => new RegExp('await ' + n + '\\(').test(boot)), 'boot: none of them is awaited one-by-one any more');
  ok(/\.map\(function \(p\) \{ return Promise\.resolve\(p\)\.catch\(function \(e\) \{ console\.warn\('calendar boot read:', e\); \}\); \}\)\);/.test(batch.length ? boot : ''), 'boot: one failing read is logged, never aborts the boot');
  const iBook = boot.indexOf('loadBookingRequests().catch('), iAux = boot.indexOf('_apptAux = Promise.all(['), iApp = boot.indexOf('await loadAppointments();'), iNull = boot.indexOf('_apptAux = null;');
  ok(iBook > -1 && iBook < iAux && !/await loadBookingRequests/.test(boot), 'boot: booking requests start with the batch and never block');
  ok(iAux > -1 && iApp > iAux && iNull > iApp && (boot.match(/await /g) || []).length === 1, 'boot: appointments load alongside the batch; the only await is loadAppointments; the barrier is cleared after');
  /* ── (٢) السلوك: loadAppointments الحيّة بـvm ── */
  const code = [fnSrc(H, 'function _apptSettle('), fnSrc(H, 'async function loadAppointments(')].join('\n');
  ok(!!code && /var _apptAux = null;/.test(H), 'live functions + barrier declared');
  async function run(opt) {
    const ev = [], pending = [];
    const later = (tag, val) => new Promise(res => { ev.push('start:' + tag); pending.push(() => { ev.push('done:' + tag); res(val); }); });
    const stubQ = tag => ({ select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
      then(a, b) { return (opt.throwLab && tag === 'lab_orders' ? Promise.reject(new Error('net')) : later(tag, { data: opt.lab || [], error: null })).then(a, b); } });
    const ctx = {
      currentUser: { id: 'u1' }, console: { warn: () => ev.push('warn') }, mainTab: 'schedule', Promise, Object, String, parseFloat, Array,
      showToast: m => ev.push('toast:' + m), refreshPlannedCount: () => ev.push('planned'), renderPlanned() {}, render: () => ev.push('render'),
      dateStr: () => '2026-09-30', appointments: null, sessionsByAppt: null, plannedSessionsByPatient: null, altPlannedCountByPatient: null,
      labOrdersByPatient: null, labOrdersByAppt: null, _apptAux: opt.aux || null,
      window: { SyDentApptDead: (a) => a.status === 'cancelled',
        SyDentFetchAll: build => { const q = build(); return q.__tbl === 'appointments'
            ? (opt.apErr ? later('appointments', { data: null, error: { message: 'x' } }) : later('appointments', { data: opt.ap || [], error: null }))
            : (opt.throwSes ? Promise.reject(new Error('net')) : later('ledger_sessions', { data: opt.ses || [], error: null })); },
        sb: { from: t => Object.assign(stubQ(t), { __tbl: t }) } }
    };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.__L = loadAppointments;', ctx);
    let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
    const p = ctx.__L();
    for (let i = 0; i < 12; i++) { await new Promise(r => setImmediate(r)); if (pending.length) pending.shift()(); }
    if (opt.release) { opt.release(); for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); }
    await Promise.race([p, new Promise(r => setTimeout(r, 50))]);
    await new Promise(r => setTimeout(r, 10)); process.removeListener('unhandledRejection', onU);
    return { ev, ctx, unhandled };
  }
  let r = await run({ ap: [{ id: 'a1', status: 'confirmed' }, { id: 'a2', status: 'cancelled' }],
    ses: [{ id: 's1', appointment_id: 'a1', status: 'planned', patient_id: 'p1' }, { id: 's2', appointment_id: 'a2', status: 'planned', patient_id: 'p2' }],
    lab: [{ appointment_id: 'a1', patient_id: 'p1' }, { appointment_id: null, patient_id: 'p3' }] });
  const firstDone = r.ev.findIndex(e => e.startsWith('done:'));
  ok(['start:ledger_sessions', 'start:lab_orders', 'start:appointments'].every(t => { const i = r.ev.indexOf(t); return i > -1 && i < firstDone; }),
     'the three reads all start before the first one resolves (one round, not three)');
  ok(r.ctx.appointments.length === 2 && r.ctx.sessionsByAppt.a1.length === 1 && !r.ctx.plannedSessionsByPatient.p1 && r.ctx.plannedSessionsByPatient.p2.length === 1
     && r.ctx.labOrdersByAppt.a1.length === 1 && r.ctx.labOrdersByPatient.p3.length === 1 && r.ev.slice(-2).join() === 'planned,render',
     'processing unchanged: dead-appointment planned item returns to scheduling · lab indices · render last');
  let released = false, rel;
  const aux = new Promise(res => { rel = () => { released = true; res(); }; });
  r = await run({ aux, release: () => rel() });
  const iRender = r.ev.indexOf('render');
  ok(released && iRender > -1, 'first render waits for the supporting batch (_apptAux) and then paints');
  let r2 = await run({ aux: new Promise(() => {}) });
  ok(r2.ev.indexOf('render') === -1, 'no render while the batch is still loading (no half-drawn calendar)');
  r = await run({ apErr: true });
  ok(r.ev.some(e => e.startsWith('toast:')) && r.ev.indexOf('render') === -1 && r.unhandled === 0, 'appointments error ⇒ toast, no render, no unhandled rejection from the early-started reads');
  r = await run({ throwSes: true, throwLab: true, ap: [{ id: 'a1' }] });
  ok(r.ev.filter(e => e === 'warn').length === 2 && r.ev.indexOf('render') > -1 && r.unhandled === 0, 'sessions/lab exceptions are caught and logged; the calendar still renders');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['back to sequential awaits', F0 => rep('appointments.html', '    loadClinicDoctors(),\n', '')(rep('appointments.html', '  await loadAppointments();    /* قراءاتُه', '  await loadClinicDoctors();\n  await loadAppointments();    /* قراءاتُه')(F0))],
  ['blocks awaited after', rep('appointments.html', "    loadBlocks()               /* v498", "    null               /* v498")],
  ['one failure aborts boot', rep('appointments.html', ".map(function (p) { return Promise.resolve(p).catch(function (e) { console.warn('calendar boot read:', e); }); }));", '.map(function (p) { return p; }));')],
  ['booking blocks the boot', rep('appointments.html', "  loadBookingRequests().catch(function(e){ console.warn('P5 booking requests:', e); });   /* غير حاجب", "  await loadBookingRequests().catch(function(e){ console.warn('P5 booking requests:', e); });   /* غير حاجب")],
  ['barrier never cleared', rep('appointments.html', '  _apptAux = null;\n', '')],
  ['render ignores the barrier', rep('appointments.html', '  if (_apptAux) { try { await _apptAux; } catch (e) {} }\n', '')],
  ['sessions fetched after appointments', F0 => rep('appointments.html', '    var _s0 = await _sesPre;', '    var _s0 = await _sesPreF();')(rep('appointments.html', '  var _sesPre = _apptSettle(', '  var _sesPreF = () => _apptSettle(')(F0))],
  ['early reads not settled (unhandled rejection)', rep('appointments.html', 'var _labPre = _apptSettle(window.sb.from', 'var _labPre = (window.sb.from')],
  ['lab exception not rethrown into its catch', rep('appointments.html', '    if (_l0.e) throw _l0.e;\n', '    if (_l0.e) return;\n')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-perf-calendar: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-perf-calendar: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
