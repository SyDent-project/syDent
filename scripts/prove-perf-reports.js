/* v552 — مثبتُ أداء التقارير (DeepCode #1 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   (١) loadFilteredData: المجموعاتُ الأربع (الجلسات+أسماؤها · الدفعات+توزيعاتها+حالاتها · المخابر · دفعات الأطباء)
       والسياقان (ما قبل الفترة · الفترة السابقة) تُطلَق معاً والرسمُ بعد اكتمالها كلها؛ التبعياتُ داخل كل مجموعة بترتيبها.
   (٢) fetchCtx (سلوكياً بـvm): القراءاتُ الأربع تبدأ قبل حسم أولها · النتيجةُ مطابقة للمسار المتسلسل ·
       أولُ خطأٍ يُرمى هو الجلسات ثم الدفعات (كما كان) بلا رفضٍ غير ملتقَط · فشلُ الـembed يذهب لمساره البديل.
   (٣) ذاكرتا القفل (الموظفون · الأطباء) تُنتظران معاً وكلتاهما قبل فحص الطبيب المعطَّل.
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
const base = { 'provider-reports.html': read('provider-reports.html') };

async function suite(F) {
  const H = F['provider-reports.html'];
  /* ── (١) ── */
  const lf = fnSrc(H, 'async function _loadFilteredDataCore(');
  const groups = ['_grpSessions', '_grpPayments', '_grpLabs', '_grpPayouts'];
  ok(groups.every(g => new RegExp('var ' + g + ' = \\(async function\\(\\)\\{').test(lf)), 'four independent groups, each an immediately-started task');
  ok(/var _grpCtx = Promise\.all\(\[loadPriorContext\(from, statusList\), loadPrevContext\(from, to, statusList\)\]\);/.test(lf), 'prior + previous contexts start with them');
  const iAll = lf.indexOf('await Promise.all([_grpSessions, _grpPayments, _grpLabs, _grpPayouts, _grpCtx]);'), iRender = lf.indexOf('  render();');
  ok(iAll > -1 && iRender > iAll && !/await loadPriorContext|await loadPrevContext/.test(lf), 'render only after every group and both contexts');
  const gS = lf.slice(lf.indexOf('var _grpSessions'), lf.indexOf('var _grpPayments')), gP = lf.slice(lf.indexOf('var _grpPayments'), lf.indexOf('var _grpLabs'));
  ok(gS.indexOf('sessions = await _fetchAllPR') > -1 && gS.indexOf('sessions = await _fetchAllPR') < gS.indexOf("from('patients')"), 'sessions group: names are resolved from its own sessions, after them');
  ok(gP.indexOf('payments = await _fetchAllPR') < gP.indexOf("from('payment_splits')") && gP.indexOf("from('payment_splits')") < gP.indexOf('await loadSplitSessionStatuses();'), 'payments group: payments ← splits ← split-session statuses, in order');
  /* ── (٢) fetchCtx بالسلوك ── */
  const code = [fnSrc(H, 'function _prSettle('), fnSrc(H, 'function _prTake('), fnSrc(H, 'async function fetchCtx(')].join('\n');
  async function run(opt) {
    const ev = [], pending = [];
    const later = (tag, val, err) => new Promise((res, rej) => { ev.push('start:' + tag); pending.push(() => { ev.push('done:' + tag); err ? rej(err) : res(val); }); });
    const DATA = { ledger_sessions: [{ id: 's1', cost: 5 }], ledger_payments: [{ id: 'p1', amount: 5 }], lab_orders: [{ id: 'l1', date_sent: '2026-09-10T08:00:00Z' }, { id: 'l2', date_sent: '2026-10-05T08:00:00Z' }],
      payment_splits: [{ payment_id: 'p1', session_id: 's1', provider_id: 'd1', amount: 5, is_unearned: false, currency: 'SYP', ledger_sessions: { status: 'planned' } }] };
    const q = t => { const o = { __t: t, select() { return o; }, eq() { return o; }, lte() { return o; }, gte() { return o; }, in() { return o; }, neq() { return o; } }; return o; };
    const ctx = { currentUser: { id: 'u' }, console: { warn: () => ev.push('warn') }, Promise, Object, Date, isNaN, String,
      widenEndUtc: x => x, widenStartUtc: x => x, toDay: d => d.toISOString().slice(0, 10),
      window: { sb: { from: t => (t === 'payment_splits' && opt.fallback) ? Object.assign(q(t), { then(a, b) { ev.push('fallback:' + t); return Promise.resolve({ data: [{ payment_id: 'p1', session_id: 's1', provider_id: 'd1', amount: 5 }], error: null }).then(a, b); } })
        : t === 'ledger_sessions' && opt.fallback ? Object.assign(q(t), { then(a, b) { ev.push('fallback:status'); return Promise.resolve({ data: [{ id: 's1', status: 'completed' }], error: null }).then(a, b); } }) : q(t) } },
      _fetchAllPR: b => { const t = b().__t; return later(t, DATA[t], (opt.err || {})[t]); } };
    vm.createContext(ctx); vm.runInContext(code + '\nthis.__f = fetchCtx;', ctx);
    let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
    let out = null, thrown = null;
    const p = ctx.__f('2026-09-01', '2026-09-30', ['completed'], false).then(r => { out = r; }, e => { thrown = e; });
    for (let i = 0; i < 20; i++) { await new Promise(r => setImmediate(r)); if (pending.length) pending.shift()(); }
    await p; await new Promise(r => setTimeout(r, 10)); process.removeListener('unhandledRejection', onU);
    return { ev, out, thrown, unhandled };
  }
  let r = await run({});
  const firstDone = r.ev.findIndex(e => e.startsWith('done:'));
  ok(['ledger_sessions', 'ledger_payments', 'payment_splits', 'lab_orders'].every(t => { const i = r.ev.indexOf('start:' + t); return i > -1 && i < firstDone; }), 'fetchCtx: the four reads all start before the first resolves');
  ok(r.out && r.out.sessions.length === 1 && r.out.payments.length === 1 && r.out.paymentSplits.length === 1 && r.out.splitSessionStatus.s1 === 'planned'
     && r.out.labOrders.length === 1 && r.out.labOrders[0].id === 'l1', 'fetchCtx: result identical to the sequential path (embed statuses · local-day lab trim)');
  r = await run({ err: { ledger_sessions: new Error('S'), ledger_payments: new Error('P'), lab_orders: new Error('L') } });
  ok(r.thrown && r.thrown.message === 'S' && r.unhandled === 0, 'fetchCtx: sessions error surfaces first (as before) — the early-started reads never become unhandled rejections');
  r = await run({ err: { ledger_payments: new Error('P') } });
  ok(r.thrown && r.thrown.message === 'P' && r.unhandled === 0, 'fetchCtx: payments error surfaces when sessions succeed');
  r = await run({ err: { payment_splits: new Error('embed') }, fallback: false });
  ok(r.ev.indexOf('warn') > -1, 'fetchCtx: an embed failure still takes its fallback branch (warned)');
  /* ── (٤) v553 الجلبُ المبكر ببوابة الرسم (سلوكياً بـvm على الغلاف الحيّ) ── */
  ok(/if \(gate && \(await gate\) === false\) return;[^\n]*\n\s*syncUrl\(\);/.test(lf), 'core: the gated (early) load renders only after the gate opens with true');
  const initSrc = H.slice(H.indexOf('renderPresetRow();\n  if (!applyUrlParams())'), H.indexOf('  await loadAll();\n\n  // Phase 4: Doctor mode auto-filter'));
  const iEarly = initSrc.indexOf('_prStartEarly();'), iDocs = initSrc.indexOf('_prDocsEarly = _prSettle(_prDoctorsQuery());'), iLock = initSrc.indexOf("// Ensure SyDentLock's employee+doctor caches");
  ok(iEarly > initSrc.indexOf('markPreset(') && iEarly < iLock && iDocs > iEarly && iDocs < iLock, 'init: window data and the doctors list start after the dates are set, before the lock caches');
  ok(/_prCancelEarly\(\);   \/\* v553 \*\/\s*\n\s*return;/.test(initSrc), 'inactive doctor: the early load is cancelled (never renders)');
  ok(/var _de = _prDocsEarly; _prDocsEarly = null;\s*\n\s*var dRes = _de \? _prTake\(await _de\) : await _prDoctorsQuery\(\);/.test(H), 'loadAll adopts the early doctors list once, then queries fresh');
  const W = [fnSrc(H, 'function _prWinKey('), fnSrc(H, 'function _prStartEarly('), fnSrc(H, 'function _prCancelEarly('), fnSrc(H, 'async function loadFilteredData(')].join('\n');
  async function wrap(steps) {
    const vals = { fromDate: '2026-09-01', toDate: '2026-09-30', statusFilter: 'completed' }, log = [];
    const ctx = { _prEarly: null, Promise, console: { warn() {} }, document: { getElementById: id => ({ get value() { return vals[id]; } }) },
      _loadFilteredDataCore: async gate => { const n = log.filter(x => x.startsWith('fetch')).length + 1; log.push('fetch' + n);
        await new Promise(r => setImmediate(r)); if (gate && (await gate) === false) { log.push('norender' + n); return; } log.push('render' + n); } };
    vm.createContext(ctx); vm.runInContext(W + '\nvar _prEarly = null; this.__w = { start: _prStartEarly, cancel: _prCancelEarly, load: loadFilteredData };', ctx);
    await steps(ctx.__w, vals, log); for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    return log.join(',');
  }
  ok(await wrap(async w => { w.start(); await w.load(); }) === 'fetch1,render1', 'same window: the first normal call adopts the early fetch (one fetch, one render)');
  ok(await wrap(async w => { w.start(); w.cancel(); }) === 'fetch1,norender1', 'cancelled early fetch never renders');
  ok(await wrap(async (w, v) => { w.start(); v.fromDate = '2026-08-01'; await w.load(); }) === 'fetch1,norender1,fetch2,render2', 'other window: the stale early fetch finishes silently first, then a fresh fetch renders (no stale overwrite)');
  ok(await wrap(async w => { w.start(); await w.load(); await w.load(); }) === 'fetch1,render1,fetch2,render2', 'later calls fetch normally');
  /* ── (٣) ── */
  const init = H.slice(H.indexOf("// Ensure SyDentLock's employee+doctor caches"), H.indexOf('// HARD GUARD: if the locked doctor'));
  ok(/await Promise\.all\(\[\s*\(typeof window\.SyDentLock\.loadEmployees === 'function'\)[\s\S]*?loadDoctors\(\); \}\)\.catch\(function\(\)\{\}\) : null\s*\]\);/.test(init)
     && !/await window\.SyDentLock\.load(Employees|Doctors)\(\)/.test(init), 'lock caches awaited together, both before the inactive-doctor guard');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['contexts back to sequential', rep('provider-reports.html', '  var _grpCtx = Promise.all([loadPriorContext(from, statusList), loadPrevContext(from, to, statusList)]);', '  await loadPriorContext(from, statusList);\n  await loadPrevContext(from, to, statusList);\n  var _grpCtx = null;')],
  ['render before the groups finish', rep('provider-reports.html', '  await Promise.all([_grpSessions, _grpPayments, _grpLabs, _grpPayouts, _grpCtx]);', '  Promise.all([_grpSessions, _grpPayments, _grpLabs, _grpPayouts, _grpCtx]);')],
  ['payouts awaited alone', rep('provider-reports.html', '  var _grpPayouts = (async function(){', '  var _grpPayouts = await (async function(){')],
  ['fetchCtx payments after sessions', rep('provider-reports.html', "  var _cP = _prSettle(_fetchAllPR(function(){", "  await _cS;\n  var _cP = _prSettle(_fetchAllPR(function(){")],
  ['early read unsettled', rep('provider-reports.html', "  var _cL = _prSettle(_fetchAllPR(function(){", "  var _cL = (_fetchAllPR(function(){")],
  ['error order changed', rep('provider-reports.html', '  var pSessions = _prTake(await _cS);\n  var pPayments = _prTake(await _cP);', '  var pPayments = _prTake(await _cP);\n  var pSessions = _prTake(await _cS);')],
  ['lab trim dropped', rep('provider-reports.html', '    return day <= hi && (!lo || day >= lo);', '    return true;')],
  ['early fetch renders without the gate', rep('provider-reports.html', '  if (gate && (await gate) === false) return;   /* v553', '  /* v553')],
  ['inactive doctor still renders early data', rep('provider-reports.html', '    _prCancelEarly();   /* v553 */\n', '')],
  ['stale early fetch not awaited on window change', rep('provider-reports.html', '    e.open(false); await e.p;\n', '    e.open(false);\n')],
  ['early fetch never adopted', rep('provider-reports.html', "    if (e.key === _prWinKey()) { e.open(true); return e.p; }", "    if (false) { e.open(true); return e.p; }")],
  ['doctors early list ignored', rep('provider-reports.html', 'var dRes = _de ? _prTake(await _de) : await _prDoctorsQuery();', 'var dRes = await _prDoctorsQuery();')],
  ['lock caches sequential again', rep('provider-reports.html', "    await Promise.all([\n      (typeof window.SyDentLock.loadEmployees === 'function')", "    await window.SyDentLock.loadEmployees();\n    await Promise.all([\n      (typeof window.SyDentLock.loadEmployees === 'function')")]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-perf-reports: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-perf-reports: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
