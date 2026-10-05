/* v547 — مثبتُ تصفيح قراءات الفترة (الفحص الشامل لجولة التقارير) — مستقل، على الملفات الحيّة.
   حدُّ PostgREST 1000 صفّ للطلب: كلُّ قراءة فترةٍ بالتقارير والمحاسبة تمرّ بجالبٍ مصفَّح وإلا قُصّت بصمت.
   (١) الجالبان (_fetchAllPR · _pagedAcc) يجمعان 2345 صفّاً بثلاث صفحات، ويقفان عند صفحةٍ ناقصة، والخطأُ لا يُبتلع;
   (٢) كلُّ قراءة فترة بـloadFilteredData (جلسات · دفعات · مخابر · دفعات الأطباء) وبمحمّلات المحاسبة واتجاهها مصفّحة،
       ولا طلبَ خامَ باقٍ عليها; أسماءُ المرضى بمقاطع 150 (#691). --self-test: طفرات. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function fakeQ(total, failAt) {
  const calls = [];
  const build = () => {
    const q = { _o: null };
    q.order = k => { q._o = k; return q; };
    q.range = (a, b) => { calls.push([a, b, q._o]); if (failAt !== undefined && a >= failAt) return Promise.resolve({ data: null, error: { message: 'boom' } });
      const rows = []; for (let i = a; i <= Math.min(b, total - 1); i++) rows.push({ id: i }); return Promise.resolve({ data: rows, error: null }); };
    return q;
  };
  return { build, calls };
}

async function suite(F) {
  const PR = F['provider-reports.html'], A = F['accounting.html'];
  const c = { console: { warn() {}, error() {} }, Promise };
  vm.createContext(c);
  try { vm.runInContext(fnSrc(PR, 'async function _fetchAllPR(buildQuery) {') + '\n' + fnSrc(A, 'async function _pagedAcc(build) {'), c); } catch (e) { ok(false, 'helpers: ' + e.message); return; }
  let q = fakeQ(2345);
  let rows = await c._fetchAllPR(q.build);
  ok(rows.length === 2345 && q.calls.length === 3 && q.calls.every(x => x[2] === 'id'), '_fetchAllPR: 2345 rows over 3 pages ordered by id');
  q = fakeQ(2000); rows = await c._fetchAllPR(q.build);
  ok(rows.length === 2000 && q.calls.length === 3, '_fetchAllPR: an exact multiple of 1000 still reaches the end');
  q = fakeQ(2345, 1000); let threw = false;
  try { await c._fetchAllPR(q.build); } catch (e) { threw = true; }
  ok(threw, '_fetchAllPR: a failing page throws (never a silent partial set)');
  q = fakeQ(2345); let r = await c._pagedAcc(q.build);
  ok(r.error === null && r.data.length === 2345 && q.calls.length === 3 && q.calls[0][2] === 'id', '_pagedAcc: 2345 rows over 3 pages, same { data, error } shape');
  q = fakeQ(2345, 2000); r = await c._pagedAcc(q.build);
  ok(r.data === null && r.error && r.error.message === 'boom', '_pagedAcc: a failing page returns the error (existing branches handle it)');

  const lf = fnSrc(PR, 'async function _loadFilteredDataCore(gate) {')   /* v553: جسمُ الجلب صار بالنواة (الغلافُ يتبنّى الجلبَ المبكر) */;
  ['ledger_sessions', 'ledger_payments', 'lab_orders', 'provider_payouts'].forEach(t => {
    ok(new RegExp("_fetchAllPR\\(function\\(\\)\\{[^\\n]*\\n\\s*return window\\.sb\\.from\\('" + t + "'\\)").test(lf), 'reports: ' + t + ' paged');
    ok(!new RegExp("await \\(?window\\.sb\\.from\\('" + t + "'\\)").test(lf), 'reports: no raw single request left on ' + t);
  });
  ok(/ci \+= 150\) \{/.test(lf) && /pidList\.slice\(ci, ci \+ 150\)/.test(lf) && !/\+ 500/.test(lf), 'reports: patient names in chunks of 150 (#691)');
  ['loadSessions', 'loadPayments', 'loadPaymentSplits', 'loadExpenses', 'loadAdjustments', 'loadPayouts', 'loadLabOrders', 'loadLabPayable', 'loadAppointmentStats', 'loadMaterialCost'].forEach(f => {
    const b = fnSrc(A, 'async function ' + f + '(');
    ok(b && /await _pagedAcc\(function\(\)\{ return window\.sb\.from\(/.test(b) && !/await \(?window\.sb\.from\(/.test(b), 'accounting: ' + f + ' paged, no raw request');
  });
  const tr = fnSrc(A, 'async function loadTrend() {');
  ok((tr.match(/_pagedAcc\(function\(\)\{ return window\.sb\.from\('(ledger_sessions|ledger_payments|account_adjustments|payment_splits)'\)/g) || []).length === 4, 'accounting trend: sessions, payments, adjustments and splits paged');
}

const FILES = ['provider-reports.html', 'accounting.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['off-by-one stop', rep('provider-reports.html', '    if (rows.length < PAGE) break;\n    off += PAGE;\n  }\n  return out;', '    if (rows.length <= PAGE) break;\n    off += PAGE;\n  }\n  return out;')],
  ['accounting helper ignores later pages', rep('accounting.html', "    if (rows.length < PAGE) break;\n    off += PAGE;\n  }\n  return { data: out, error: null };", "    break;\n  }\n  return { data: out, error: null };")],
  ['page error swallowed', rep('accounting.html', "    if (res.error) return { data: null, error: res.error };", "    if (res.error) break;")],
  ['reports sessions back to one request', rep('provider-reports.html', "      sessions = await _fetchAllPR(function(){\n        return window.sb.from('ledger_sessions').select('*')\n          .eq('doctor_id', currentUser.id).gte('date', from).lte('date', to).in('status', statusList);\n      });", "      sessions = (await window.sb.from('ledger_sessions').select('*')\n          .eq('doctor_id', currentUser.id).gte('date', from).lte('date', to).in('status', statusList)).data || [];")],   /* v552: المجموعةُ صارت داخل _grpSessions (إزاحةٌ +2) */
  ['accounting sessions back to one request', rep('accounting.html', "  var res = await _pagedAcc(function(){ return window.sb.from('ledger_sessions')", "  var res = await (function(){ return window.sb.from('ledger_sessions')")],
  ['names in chunks of 500', rep('provider-reports.html', 'for (var ci = 0; ci < pidList.length; ci += 150) {', 'for (var ci = 0; ci < pidList.length; ci += 500) {')]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0;
      const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-period-paging: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-period-paging: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
