/* v545 — مثبتُ تبويب «ملخّص الفترة» (rpt-sum.js + provider-reports.html) — مستقل، على الملفات الحيّة.
   (١) الوحدة ترسم ولا تحسب: الفرقُ نسبةٌ للأعداد والمبالغ ونقاطٌ للنسب · العملتان معاً «بعملتين» · «جديد» · الغائب «—» ·
       الاتجاهُ السيّئ بالأحمر (higherBad) · التهريب · نصُّ الواتساب;
   (٢) مصدرٌ واحد (#684): clinicTotals() يغذّي ملخّص تبويب الأطباء والملخّص معاً؛ الأرقامُ بدوالّ الصفحة الحقيقية
       تطابق المحرّكات (الإنتاج = تبويب العلاجات · التحصيل = المدفوعات أو البطاقات · الجدد/النشطون/المفقودون · الحضور);
   (٣) النوافذ: السابقة من prevCtx والسنة الماضية = −12 شهراً بسياقٍ يُجلب عند الفتح · (٤) الربط والطباعة والتصدير.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function suite(F) {
  const ctx = { console: { warn() {} }, encodeURIComponent };
  vm.createContext(ctx); vm.runInContext('var window = this;', ctx);
  try { vm.runInContext(F['rpt-sum.js'], ctx); } catch (e) { ok(false, 'module throws: ' + e.message); return; }
  const S = ctx.SyRptSum;

  /* (١) */
  const num = { kind: 'num' }, bad = { kind: 'num', higherBad: true }, pct = { kind: 'pct' }, bag = { kind: 'bag' };
  ok(S.change(num, 12, 10).pct === 20 && S.change(num, 0, 0).same && S.change(num, 5, 0).fresh && S.change(num, null, 3) === null, 'change: % for counts, same, fresh, missing');
  ok(S.change(pct, 0.6, 0.75).pts === -15, 'change: percentage points for rates');
  ok(S.change(bag, { SYP: 150, USD: 0 }, { SYP: 100, USD: 0 }).pct === 50 && S.change(bag, { SYP: 1, USD: 2 }, { SYP: 1, USD: 1 }).mixed
     && S.change(bag, { SYP: 200, USD: 5 }, { SYP: 100, USD: 0 }).pct === 100, 'change: the currency present on both sides compares (a new dollar layer does not block it); two on both say so');
  const snap = { title: 'ملخّص <b>ع</b>', sub: 'ف', cols: { cur: 'الفترة', prev: 'السابقة', ly: 'السنة الماضية' },
    sections: [{ title: 'المرضى', rows: [{ label: 'فقدناهم', kind: 'num', higherBad: true, cur: 5, prev: 2, ly: null }, { label: 'نسبة الحضور', kind: 'pct', cur: 0.6, prev: 0.75, ly: 0.6 }] }],
    top: [{ name: '<i>x</i>', n: 3, bag: { SYP: 1, USD: 0 } }], notes: ['⚠️ <u>n</u>'], stamp: 's' };
  const html = S.render(snap, { val: (r, v) => v === null ? '—' : String(v), bag: () => 'B' });
  ok(html.indexOf('<b>ع</b>') === -1 && html.indexOf('<i>x</i>') === -1 && html.indexOf('<u>n</u>') === -1, 'render: title, treatment names and notes escaped');
  ok(/<span class="rs-ch down"><bdi dir="ltr">▲ 150%<\/bdi><\/span>/.test(html), 'render: a rise in a bad metric is red');
  ok(/<span class="rs-ch down"><bdi dir="ltr">▼ 15<\/bdi> نقطة<\/span>/.test(html) && /<span class="rs-ch flat">=<\/span>/.test(html), 'render: attendance change in points; equal is «=»');
  ok(/data-l="السنة الماضية">— <span class="rs-ch flat">—<\/span>/.test(html), 'render: a missing value is «—», not zero');
  ok(/<span class="rs-ch down">▲ من صفر<\/span>/.test(S.render({ title: '', sub: '', cols: snap.cols, sections: [{ title: '', rows: [{ label: 'x', kind: 'num', higherBad: true, cur: 1, prev: 0, ly: null }] }] }, {})), 'render: a bad metric rising from zero is red, not «جديد»');
  ok(/data-rs="print">🖨️ طباعة \/ PDF/.test(html) && /data-rs="copy">📋/.test(html) && /class="rs-actions no-print"/.test(html), 'render: print and WhatsApp actions, hidden when printed');
  const txt = S.text(snap, {});
  ok(/• فقدناهم: 5 \(▲150% عن السابقة\)/.test(txt) && /• نسبة الحضور: 0\.6 \(▼15 نقطة عن السابقة\)/.test(txt) && /🦷 الأكثر إجراءً: <i>x<\/i> \(3\)/.test(txt), 'WhatsApp text: value with change vs previous (and last year when it differs)');

  /* (٢)(٣) الصفحة */
  const PR = F['provider-reports.html'];
  const rnd = fnSrc(PR, 'function _renderLayerPR() {');
  ok(/var _ct = clinicTotals\(\);/.test(rnd) && /var t = clinicTotals\(\);/.test(rnd) && !/payments\.reduce/.test(rnd), 'single source: the doctors-tab summary and its previous period read clinicTotals()');
  const el = { providerFilter: { value: 'all' }, providerTypeFilter: { value: 'all', options: [{ text: 'x' }], selectedIndex: 0 }, inactiveFilter: { value: 'hide' },
    statusFilter: { value: 'completed' }, fromDate: { value: '2026-09-01' }, toDate: { value: '2026-09-30' } };
  const lock = { doctor: null };
  const g = { console: { warn() {} }, Math, Number, String, Object, Array, JSON,
    Date: class extends Date { constructor(...a) { if (!a.length) super('2026-09-29T12:00:00'); else super(...a); } } };
  g.document = { getElementById: id => el[id] || null };
  vm.createContext(g); vm.runInContext('var window = this;', g);
  vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'] + '\n' + F['rpt-att.js'] + '\n' + F['rpt-ret.js'] + '\n' + F['rpt-sum.js'], g);
  g.SyDentLock = { isDoctor: () => !!lock.doctor, getEffectiveDoctorId: () => lock.doctor, getDoctorId: () => lock.doctor };
  g.SyDT = { numDate: d => String(d), hm: () => '' };
  const need = ['function _rowCur(r)', 'function _filterCur(arr, cur) {', 'function splitIsEarned(sp) {', 'function providerLabCost(provId) {', 'function computeProviderStats(provId) {',
    'function clinicTotals() {', 'function withCurrencyLayer(cur, fn) {', 'function withCtx(ctx, cur, fn) {', 'function getVisibleDoctors() {', 'function treatScopeSessions() {',
    'function _newClinicScope() {', 'function _newInScope() {', 'function _trtScopeLabel() {', 'function prevWindow(from, to) {', 'function _dayShift(isoDay, n) {', 'function toDay(d) {',
    'function _sumWins() {', 'function _sumIn(which, cur, fn) {', 'function _sumMoney(which) {', 'function _sumModel() {'];
  const rc = PR.slice(PR.indexOf('function _rowCur(r)'), PR.indexOf('\n', PR.indexOf('function _rowCur(r)')));
  ok(need.slice(1).every(sg => fnSrc(PR, sg)), 'page: every function the tab relies on is present');
  vm.runInContext('var sessions=[],payments=[],paymentSplits=[],labOrders=[],payouts=[],splitSessionStatus={},doctors=[],prevCtx=null,priorCtx=null,trtCatalog=null,_renderCur=null,_sumData=null;\n'
    + rc + '\n' + need.slice(1).map(sg => fnSrc(PR, sg)).join('\n'), g);
  const X = (id, pid, date, prov, cost, extra) => Object.assign({ id, patient_id: pid, date, provider_id: prov, cost, currency: 'SYP', status: 'completed', type: 'حشوة' }, extra);
  g.__D = [{ id: 'd1', name: 'أ', provider_type: 'doctor' }, { id: 'd2', name: 'ب', provider_type: 'hygienist' }];
  g.__S = [X('s1', 'n1', '2026-09-03', 'd1', 100), X('s2', 'o1', '2026-09-04', 'd2', 50), X('s3', 'n2', '2026-09-05', 'd1', 20, { currency: 'USD' })];
  g.__PAY = [{ id: 'p1', amount: 70, currency: 'SYP', patient_id: 'o1', date: '2026-09-04' }];
  g.__LAB = [{ id: 'l1', cost: 30, currency: 'SYP', provider_id: 'd1' }];
  g.__PRIOR = { sessions: [X('h1', 'o1', '2026-08-10', 'd2', 40), X('h2', 'o2', '2025-09-15', 'd1', 10)] };
  g.__PREV = { sessions: [X('h1', 'o1', '2026-08-10', 'd2', 40)], payments: [], paymentSplits: [], labOrders: [], splitSessionStatus: {}, from: '2026-08-02', to: '2026-08-31' };
  g.__LY = { sessions: [X('y1', 'o2', '2025-09-15', 'd1', 10)], payments: [{ id: 'y', amount: 5, currency: 'SYP' }], paymentSplits: [], labOrders: [], splitSessionStatus: {} };
  g.__AP = [{ id: 'a1', patient_id: 'n1', date: '2026-09-03', status: 'completed' }, { id: 'a2', patient_id: 'o1', date: '2026-09-04', status: 'no_show' },
            { id: 'a3', patient_id: 'x', date: '2026-09-06', status: 'completed' }, { id: 'a4', patient_id: 'y', date: '2025-09-10', status: 'cancelled' }];
  vm.runInContext('doctors=__D; sessions=__S; payments=__PAY; labOrders=__LAB; priorCtx=__PRIOR; prevCtx=__PREV; _sumData={ly:__LY, appts:__AP, clinic:"عيادة"};', g);
  const W = vm.runInContext('_sumWins()', g);
  ok(W.prev && W.prev.from === '2026-08-02' && W.ly.from === '2025-09-01' && W.ly.to === '2025-09-30', 'windows: previous from prevWindow(), last year = −12 months');
  let m = vm.runInContext('_sumModel()', g);
  const row = (sec, lbl) => m.sections.find(s => s.title.indexOf(sec) > -1).rows.find(r => r.label === lbl);
  const prod = row('المال', 'الإنتاج'), coll = row('المال', 'التحصيل'), lab = row('المال', 'المخبر'), n = row('المال', 'عدد الجلسات');
  ok(prod.cur.SYP === 150 && prod.cur.USD === 20 && prod.prev.SYP === 40 && prod.ly.SYP === 10, 'production per currency = Σ sessions (= the treatments tab) in each window');
  ok(coll.cur.SYP === 70 && coll.ly.SYP === 5 && lab.cur.SYP === 30 && lab.higherBad === true && n.cur === 3, 'clinic scope: collection and lab from clinicTotals(); sessions counted across currencies');
  const nw = row('المرضى', 'مرضى جدد'), act = row('المرضى', 'المرضى النشطون'), lost = row('المرضى', 'فقدناهم');
  ok(nw.cur === 2 && nw.prev === 1 && act.cur === 3 && lost.cur === 1, 'patients: new (n1 n2; o1 was new in the previous window), active 3, lost 1 (o2 — last visit 15/9/2025 crossed 12 months in the period)');
  const ar = row('المواعيد', 'نسبة الحضور'), am = row('المواعيد', 'غاب');
  ok(Math.abs(ar.cur - 2 / 3) < 1e-9 && am.cur === 1 && ar.ly === null && row('المواعيد', 'ألغى').ly === 1, 'attendance from SyRptAtt: rate from 3 finished, under that «—»');
  vm.runInContext("sessions.push({ id: 'ob', patient_id: 'o1', date: '2026-09-07', provider_id: null, cost: 999, currency: 'SYP', status: 'completed', type: 'رصيد سابق (قبل SyDent)' });", g);
  m = vm.runInContext('_sumModel()', g);
  ok(m.top.every(t => t.name !== 'رصيد سابق (قبل SyDent)') && row('المال', 'الإنتاج').cur.SYP === 1149, 'fees stay in production but never in the top treatments');
  vm.runInContext('sessions.pop();', g);
  m = vm.runInContext('_sumModel()', g);
  ok(m.top[0].name === 'حشوة' && m.top[0].n === 3 && m.top[0].bag.SYP === 150 && m.top[0].bag.USD === 20, 'top treatments merged across currencies');
  el.providerFilter.value = 'd1';
  m = vm.runInContext('_sumModel()', g);
  ok(row('المال', 'الإنتاج').cur.SYP === 100 && row('المال', 'التحصيل').cur.SYP === vm.runInContext('(function(){var c=0; withCurrencyLayer("SYP", function(){ c = computeProviderStats("d1").collection; }); return c;})()', g)
     && row('المال', 'المخبر').cur.SYP === 30 && /المختارين/.test(row('المال', 'التحصيل').note), 'doctor scope: money from her card (computeProviderStats)');
  el.providerFilter.value = 'all';
  vm.runInContext('prevCtx = null; _sumData.ly = null;', g);
  m = vm.runInContext('_sumModel()', g);
  ok(row('المال', 'الإنتاج').prev === null && row('المال', 'الإنتاج').ly === null, 'without a previous/last-year context the columns are «—»');

  /* (٤) الربط */
  const iR = PR.indexOf('<script src="rpt-ret.js?v='), iS = PR.indexOf('<script src="rpt-sum.js?v='), iIn = PR.indexOf("<script>\n'use strict';");
  ok(iS > iR && iS < iIn && (PR.match(/rpt-sum\.js\?v=/g) || []).length === 1, 'page: rpt-sum.js loaded once, before the inline script');
  ok((F['scripts/cache-bust.sh'].match(/rpt-sum/g) || []).length === 3, 'cache-bust: rpt-sum.js in the fleet allow-list');
  ok(/data-rpt-tab="sum" onclick="setRptTab\('sum'\)">📄 ملخّص الفترة<\/button>/.test(PR) && /<div id="sumHost" class="rt-host" hidden><\/div>/.test(PR), 'page: tab and host');
  const lf = fnSrc(PR, 'async function _loadFilteredDataCore(gate) {')   /* v553: جسمُ الجلب صار بالنواة (الغلافُ يتبنّى الجلبَ المبكر) */;
  ok(/_sumData = null;/.test(lf) && /renderSum\(\);/.test(lf) && lf.indexOf('loadSumData') === -1, 'lazy: last year and appointments load only when the tab is shown (#687)');
  const ld = fnSrc(PR, 'async function loadSumData(key) {');
  ok(/d\.ly = await fetchCtx\(W\.ly\.from, W\.ly\.to, statusList, true\);/.test(ld) && /if \(seq === _sumSeq\) renderSum\(\);/.test(ld), 'last year through the same fetchCtx; an older load cannot overwrite');
  ok(/if \(rptTab === 'sum'\) return exportSumExcel\(\);/.test(fnSrc(PR, 'async function exportExcel() {')), 'Excel follows the tab');
  ok(/body\.printing-sum #sumHost, body\.printing-sum #sumHost \* \{ visibility: visible !important; \}/.test(PR) && /document\.body\.classList\.add\('printing-sum'\);/.test(PR), 'print shows the summary only');
}

const FILES = ['rpt-sum.js', 'rpt-treat.js', 'rpt-newpt.js', 'rpt-att.js', 'rpt-ret.js', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['rates compared in % not points', rep('rpt-sum.js', "if (row.kind === 'pct') return { pts: Math.round((cur - ref) * 100) };", '')],
  ['higher-is-bad ignored', rep('rpt-sum.js', 'var bad = row.higherBad ? d > 0 : d < 0;', 'var bad = d < 0;')],
  ['two currencies compared as one', rep('rpt-sum.js', "var use = any.length === 1 ? any[0] : (both.length === 1 ? both[0] : null);", "var use = any[0];")],
  ['fees in the top treatments', rep('provider-reports.html', "        if (x.cat === window.SyRptTreat.CAT_FEES) return;", '')],
  ['title unescaped', rep('rpt-sum.js', "rs-title\">' + esc(snap.title)", "rs-title\">' + snap.title")],
  ['collection from sessions', rep('provider-reports.html', "    collection: payments.reduce(function(sum, p){ return sum + (Number(p.amount) || 0); }, 0),\n    lab: lab", "    collection: sessions.reduce(function(sum, p){ return sum + (Number(p.cost) || 0); }, 0),\n    lab: lab")],
  ['doctor scope with clinic money', rep('provider-reports.html', "      if (clinic) { var t = clinicTotals(); r.coll[cur] = t.collection; r.lab[cur] = t.lab; }", "      if (true) { var t = clinicTotals(); r.coll[cur] = t.collection; r.lab[cur] = t.lab; }")],
  ['last year one month off', rep('provider-reports.html', "var ly = pw ? { from: window.SyRptRet.minusMonths(from, 12), to: window.SyRptRet.minusMonths(to, 12) } : null;", "var ly = pw ? { from: window.SyRptRet.minusMonths(from, 11), to: window.SyRptRet.minusMonths(to, 11) } : null;")],
  ['small samples shown as a rate', rep('provider-reports.html', 'return { rate: rr.f >= window.SyRptAtt.MIN_RATE ? rr.att : null,', 'return { rate: rr.f ? rr.att : null,')],
  ['production not per currency', rep('provider-reports.html', "      r.prod[cur] = agg.total.prod; r.n += agg.total.n;", "      r.prod.SYP += agg.total.prod; r.n += agg.total.n;")],
  ['eager load', rep('provider-reports.html', "  _sumData = null;   // v545", "  _sumData = null; loadSumData(_newKey());   // v545")],
  ['doctors tab back to its own sums', rep('provider-reports.html', "  var totalCollection = _ct.collection;", "  var totalCollection = payments.reduce(function(sum, p){ return sum + (Number(p.amount) || 0); }, 0);")]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0;
    const log = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-sum: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-sum: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
