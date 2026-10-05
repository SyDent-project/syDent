/* v532 — مثبتُ أداء المخبر بصفحة المخابر — مستقل، على الملفات الحيّة (lab-due.js الحقيقي لأيام الدوام).
   (١) العيّنة: المُرسَلة فقط (لا مسودّة · لا مرفوض) · لمخبرها وحده;
   (٢) المدّة: وسيطُ أيام الدوام من الإرسال للاستلام **بالدورة الأولى** (استلامُ ما قبل الإعادة من M160) · الجمعة عطلة;
   (٣) بالموعد: الاستلامُ يومَ الاستحقاق أو قبله (استحقاقُ الدورة الأولى) · من ذوات الاستحقاق فقط;
   (٤) الإعادة: دورةٌ مسجّلة أو حالة «إعادة» بلا دورة (نسخةٌ قديمة);
   (٥) الحدود الدنيا (#689) · العرض (بطاقة + كشف · مهرَّب · عددٌ عربيّ) · الربط.
   --self-test: 8 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function suite(F) {
  const L = F['labs.html'];
  const el = { innerHTML: '' };
  const ctx = { console: { warn() {} }, Date, String, Number, Object, Array, Math, JSON, parseInt, document: { getElementById: id => (id === 'labStmtPerf' ? el : null) }, allOrders: [] };
  vm.createContext(ctx);
  vm.runInContext('window = this;', ctx);
  vm.runInContext(F['lab-due.js'], ctx);
  const redo = { o3: [{ prev_date_received: '2026-09-17T10:00:00Z', prev_date_due: '2026-09-20T00:00:00+00:00', reason: 'لون' }] };
  ctx.SyLabRedo = { list: id => redo[id] || [] };
  vm.runInContext([fnSrc(L, 'function escapeHtml(s) {'), fnSrc(L, 'function _labIsDraft('),
    L.slice(L.indexOf('var LAB_PERF_MIN = '), L.indexOf('\n', L.indexOf('var LAB_PERF_MIN = '))),
    fnSrc(L, 'function labPerfOf(labId) {'), L.slice(L.indexOf('function labPerfCount(n)'), L.indexOf('\n', L.indexOf('function labPerfCount(n)'))),
    fnSrc(L, 'function labPerfDays(n) {').split('\n')[0].indexOf('}') > 0 ? L.slice(L.indexOf('function labPerfDays(n)'), L.indexOf('\n', L.indexOf('function labPerfDays(n)'))) : fnSrc(L, 'function labPerfDays(n) {'),
    fnSrc(L, 'function labPerfLine(labId) {'), fnSrc(L, 'function renderLabPerf(labId) {')].join('\n'), ctx);
  const O = (id, extra) => Object.assign({ id, lab_id: 'L1', status: 'delivered', work_type: 'تاج زركون' }, extra);
  ctx.allOrders = [
    O('o1', { date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-08T10:00:00Z', date_due: '2026-09-08T00:00:00+00:00' }),                 /* 6 أيام · بالموعد */
    O('o2', { date_sent: '2026-09-10T00:00:00+00:00', date_received: '2026-09-15T10:00:00Z', date_due: '2026-09-14T00:00:00+00:00', work_type: '<b>جسر</b>' }),   /* 4 · متأخر */
    O('o2b', { date_sent: '2026-09-20T00:00:00+00:00', date_received: '2026-09-22T09:00:00Z', work_type: '<b>جسر</b>' }),                              /* 2 · بلا استحقاق */
    O('o3', { date_sent: '2026-09-15T00:00:00+00:00', date_received: null, date_due: '2026-09-30T00:00:00+00:00', status: 'sent' }),                   /* دورة أولى 2 · بالموعد · إعادة */
    O('o6', { date_sent: '2026-09-25T00:00:00+00:00', status: 'redo' }),
    O('o8', { date_sent: '2026-09-05T00:00:00+00:00', date_received: '2026-09-06T10:00:00Z', date_due: '2026-08-24T00:00:00+00:00', work_type: 'زراعة' }),   /* استحقاقٌ قبل الإرسال ⇒ خارج «بالموعد» */                                                                                /* إعادة بلا دورة مسجّلة */
    O('o4', { date_sent: null, status: 'draft' }), O('o5', { date_sent: '2026-09-02T00:00:00+00:00', date_received: '2026-09-03T00:00:00Z', status: 'rejected' }),
    O('x1', { lab_id: 'L2', date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-02T00:00:00Z' })];
  const P = vm.runInContext("labPerfOf('L1')", ctx);
  ok(P.n === 6, 'sample: sent only — draft and rejected out, other lab out (n=' + P.n + ')');
  ok(P.tatN === 5 && P.tat === 2, 'turnaround: first-cycle work days [6,4,2,2,1] (Friday skipped) ⇒ median 2 (got ' + P.tat + ')');
  ok(P.dueN === 3 && P.onTime === 67, 'on time: received on/before the first-cycle due ⇒ 2/3 = 67%; a due before the send date is excluded (got ' + P.onTime + ')');
  ok(P.redoN === 2 && P.redo === 33, 'redo: a recorded cycle or a «redo» status ⇒ 2/6 = 33%');
  ok(P.byWork.length === 2 && P.byWork.some(w => w.work === 'تاج زركون' && w.n === 2 && w.days === 4) && P.byWork.some(w => w.work === '<b>جسر</b>' && w.days === 3), 'by work: median per work type (≥2 samples)');
  const line = vm.runInContext("labPerfLine('L1')", ctx);
  ok(/⏱ عادةً يوما عمل/.test(line) && /<span class="lp-bad">✅ 67% بالموعد<\/span>/.test(line) && /<span class="lp-bad">🔄 33% إعادة<\/span>/.test(line) && /\(6 طلبات\)/.test(line), 'card line: median · on-time and redo flagged · Arabic count');
  ok(vm.runInContext("labPerfLine('L2')", ctx) === '', 'thresholds: a lab with one order shows nothing (#689)');
  vm.runInContext("renderLabPerf('L1')", ctx);
  ok(/أداء المخبر/.test(el.innerHTML) && /من 5 طلبات مستلمة/.test(el.innerHTML) && /2 من 6 طلبات/.test(el.innerHTML) && /&lt;b&gt;جسر/.test(el.innerHTML) && el.innerHTML.indexOf('<b>جسر</b>') === -1, 'statement block: samples named · free text escaped');
  vm.runInContext("renderLabPerf('L2')", ctx);
  ok(/يظهر بعد 3 طلباتٍ مستلمة/.test(el.innerHTML), 'statement block: below the minimum ⇒ explains when it will appear');
  ok(vm.runInContext('labPerfCount(1) + "|" + labPerfCount(2) + "|" + labPerfCount(7) + "|" + labPerfCount(12)', ctx) === 'طلب واحد|طلبان|7 طلبات|12 طلباً', 'Arabic count forms');
  /* الربط */
  ok(/\+   labPerfLine\(l\.id\)/.test(fnSrc(L, 'function renderLabs() {')), 'wiring: every lab card carries the line');
  ok(/renderLabPerf\(stmtLabId\);/.test(fnSrc(L, 'function renderLabStatement() {')) && /<div id="labStmtPerf" class="lab-perf-box"><\/div>\n\s*<div id="labStmtSummary"/.test(L), 'wiring: statement shows the block above the account');
  ok(/renderTable\(\); renderLabs\(\);/.test(L) && /SyLabDue\.load\(window\.sb, currentUser\.id\)\.then\(function\(\)\{ try \{ renderLabs\(\);/.test(L), 'wiring: cards re-render when redo cycles and work days arrive');
}

const FILES = ['labs.html', 'lab-due.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['first cycle ignored', rep('labs.html', 'var rec = first ? first.prev_date_received : o.date_received;', 'var rec = o.date_received;')],
  ['rejected counted', rep('labs.html', "o.date_sent && o.status !== 'rejected' && !_labIsDraft(o)", 'o.date_sent && !_labIsDraft(o)')],
  ['on the due day is late', rep('labs.html', "if (r10 <= String(due).slice(0, 10)) onTime++;", "if (r10 < String(due).slice(0, 10)) onTime++;")],
  ['redo status without a cycle ignored', rep('labs.html', "if (R.length || o.status === 'redo') redoN++;", 'if (R.length) redoN++;')],
  ['no minimum sample', rep('labs.html', 'var LAB_PERF_MIN = { tat: 2, due: 3, redo: 3 };', 'var LAB_PERF_MIN = { tat: 1, due: 1, redo: 1 };')],
  ['work type unescaped', rep('labs.html', "'<span class=\"lp-work\">' + escapeHtml(w.work) + ': <b>'", "'<span class=\"lp-work\">' + w.work + ': <b>'")],
  ['calendar days', rep('lab-due.js', 'var DEFAULT_DAYS = [0, 1, 2, 3, 4, 6];', 'var DEFAULT_DAYS = [0, 1, 2, 3, 4, 5, 6];')],
  ['due before send counted', rep('labs.html', "if (due && String(due).slice(0, 10) >= s10) {", "if (due) {")],
  ['card without the line', rep('labs.html', '      +   labPerfLine(l.id)   /* v532 */\n', '')]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lab-perf: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-perf: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
