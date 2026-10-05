/* v542 — مثبتُ تبويب «الاحتفاظ» بصفحة التقارير (rpt-ret.js + provider-reports.html) — مستقل، على الملفات الحيّة.
   (١) التواريخ: طرحُ الأشهر بقصّ اليوم · اليوم السابق · حدودُ «النشط» (حصريٌّ من الأسفل، ضمنيٌّ من الأعلى);
   (٢) الزيارة = علاجٌ منجز (لا مخطّط · لا رسم · لا رصيدَ سابق) · المرجعُ نهايةُ الفترة ولا يتجاوز اليوم;
   (٣) النشطون بالبداية والنهاية · المفقودون · الجددُ بتعريف تبويب المرضى الجدد حرفياً (من كل الزيارات) · الراجعون ·
       «حجزوا الخطوة الجاية» (موعدٌ بعد آخر زيارة، لا ملغى ولا غياب ولا مخطّط) · الاتجاهُ الشهري;
   (٤) النطاقُ بدوالّ الصفحة (طبيبُ الجلسة · وضعُ الطبيب) · (٥) الرسم · (٦) الربط والتحميل الكسول والتصدير.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function suite(F) {
  const ctx = { console: { warn() {} }, encodeURIComponent, Date };
  vm.createContext(ctx);
  vm.runInContext('var window = this;', ctx);
  try { vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'] + '\n' + F['rpt-ret.js'], ctx); } catch (e) { ok(false, 'modules throw: ' + e.message); return; }
  const R = ctx.SyRptRet;
  if (!R) { ok(false, 'SyRptRet missing'); return; }

  /* (١) التواريخ */
  ok(R.minusMonths('2026-03-31', 1) === '2026-02-28' && R.minusMonths('2024-03-31', 1) === '2024-02-29' && R.minusMonths('2026-01-15', 12) === '2025-01-15' && R.minusMonths('2026-02-10', 3) === '2025-11-10', 'minus months clips the day to the month');
  ok(R.dayBefore('2026-03-01') === '2026-02-28' && R.dayBefore('2026-01-01') === '2025-12-31', 'day before');
  const bp = { a: ['2025-09-29'], b: ['2025-09-30'], c: ['2026-10-01'], d: ['2025-01-01', '2026-09-29'] };
  const act = R.activeAt(bp, '2026-09-29');
  ok(!act.a && act.b === '2025-09-30' && !act.c && act.d === '2026-09-29', 'active: a visit exactly 12 months before is out, the day after is in, future visits ignored');

  /* (٢)(٣) الحساب */
  const S = (id, pid, date, extra) => Object.assign({ id, patient_id: pid, date, status: 'completed', cost: 1, currency: 'SYP', provider_id: 'd1', type: 'حشوة' }, extra);
  const V = [
    S('1', 'p1', '2025-10-01'), S('2', 'p2', '2025-09-10'), S('3', 'p3', '2026-09-05'),
    S('4', 'p4', '2025-12-01'), S('5', 'p4', '2026-09-12'), S('6', 'p5', '2026-09-15', { provider_id: 'd2' }),
    S('7', 'p6', '2026-01-01', { type: 'رصيد سابق (قبل SyDent)' }), S('8', 'p6', '2026-09-20'),
    S('9', 'p7', '2026-09-08', { type: 'رسم موعد لم يحضر', description: 'رسم عدم الحضور' }), S('10', 'p8', '2026-09-09', { status: 'planned' }),
    S('11', 'p9', '2026-09-03'), S('12', 'p9', '2026-09-18', { provider_id: 'd2' }), S('13', 'p10', '2025-09-30'), S('14', 'p11', '2024-01-01')];
  const AP = [
    { patient_id: 'p3', date: '2026-10-10', status: 'confirmed' }, { patient_id: 'p4', date: '2026-09-20', status: 'cancelled' },
    { patient_id: 'p4', date: '2026-09-11', status: 'confirmed' }, { patient_id: 'p6', date: '2026-09-25', status: 'no_show' },
    { patient_id: 'p6', date: '2026-10-02', status: 'completed' }, { patient_id: 'p5', date: '2026-10-05', status: 'confirmed', is_planned: true }];
  const base = { from: '2026-09-01', to: '2026-09-30', today: '2026-09-29', all: V, visits: V, appts: AP };
  const M = R.compute(base);
  ok(M.ref === '2026-09-29', 'reference = end of period, capped at today');
  ok(M.activeStart === 4 && M.activeEnd === 7, 'active at the start (p1 p2 p4 p10) and at the end (p1 p3 p4 p5 p6 p9 p10) [' + M.activeStart + '/' + M.activeEnd + ']');
  ok(M.lost.map(r => r.id).join(',') === 'p2' && M.lost[0].last === '2025-09-10', 'lost = active the day before, no longer at the end');
  ok(M.newN === 3 && M.visited === 5 && M.returning === 2, 'new = the new-patients definition (p3 p5 p9; p6 had an opening balance), visited 5, returning 2');
  ok(M.booked === 2 && M.noNext.map(r => r.id).sort().join(',') === 'p4,p5,p9', 'booked = a later appointment not cancelled/no-show/planned (p3 upcoming, p6 attended later)');
  ok(M.noNext.find(r => r.id === 'p9').isNew === true && M.noNext.find(r => r.id === 'p4').isNew === false, 'no-next list flags new patients');
  const last = M.trend[M.trend.length - 1];
  ok(M.trend.length === 12 && last.key === '2026-09' && last.active === 7 && last.fresh === 3 && last.lost === 1 && M.trend[0].key === '2025-10', 'trend: 12 month-ends, the last one at the reference');
  const inD2 = p => p === 'd2';
  const Md = R.compute(Object.assign({}, base, { visits: V.filter(s => inD2(s.provider_id)), inScope: inD2 }));
  ok(Md.activeEnd === 2 && Md.newN === 1 && Md.visited === 2 && Md.returning === 1, 'doctor scope: her visits; new only if her visit was the very first (p9 first saw d1)');

  /* (٥) الرسم */
  const names = { p2: '<b>ريم</b>', p4: 'سامر', p5: 'نور', p9: 'مازن' };
  const html = R.render(M, { name: id => names[id] || '', recallLink: 'patients.html?open=recall', numDate: d => d });
  ok(html.indexOf('<b>ريم</b>') === -1 && html.indexOf('&lt;b&gt;ريم') > -1, 'render: names escaped');
  ok(/<bdi dir="ltr">\+3<\/bdi><\/span> <span>منذ بداية الفترة \(4\)/.test(html) && /<div class="val"><bdi dir="ltr">\+2<\/bdi><\/div>/.test(html), 'render: active change and net growth signed (+3 · +2)');
  ok(/<bdi dir="ltr">40%<\/bdi>/.test(html) && /2 من 5 مرضى لهم موعدٌ بعد آخر زيارة/.test(html), 'render: booked share');
  ok(/href="patients\.html\?open=recall">قائمة الاستدعاء<\/a>/.test(html) && (html.match(/href="patient-profile\.html\?id=/g) || []).length === 4, 'render: lost point to the recall list; every listed patient links to the profile');
  ok(/حجزوا الخطوة الجاية<\/div><div class="val">—<\/div>/.test(R.render(Md, {})), 'render: under 3 visits no rate');
  ok(/لا زيارات بآخر 12 شهراً/.test(R.render(R.compute(Object.assign({}, base, { all: [], visits: [], appts: [] })), {})), 'render: empty state');

  /* (٤) نطاقُ الصفحة */
  const PR = F['provider-reports.html'];
  const el = { providerFilter: { value: 'all' }, providerTypeFilter: { value: 'all' }, inactiveFilter: { value: 'hide' }, fromDate: { value: '2026-09-01' }, toDate: { value: '2026-09-30' } };
  const lock = { doctor: null };
  const g = { console: { warn() {} }, Math, Number, String, Object, Array, JSON,
    Date: class extends Date { constructor(...a) { if (!a.length) super('2026-09-29T12:00:00'); else super(...a); } } };
  g.document = { getElementById: id => el[id] || null };
  vm.createContext(g);
  vm.runInContext('var window = this;', g);
  vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'] + '\n' + F['rpt-ret.js'], g);
  g.SyDentLock = { isDoctor: () => !!lock.doctor, getEffectiveDoctorId: () => lock.doctor, getDoctorId: () => lock.doctor };
  const need = ['function getVisibleDoctors() {', 'function _newClinicScope() {', 'function _newInScope() {', 'function _retModel() {', 'function toDay(d) {'];
  ok(need.every(sg => fnSrc(PR, sg)), 'page: every function the tab relies on is present');
  vm.runInContext('var sessions=[],doctors=[],priorCtx=null,_retData=null;\n' + need.map(sg => fnSrc(PR, sg)).join('\n'), g);
  g.__D = [{ id: 'd1', name: 'أ' }, { id: 'd2', name: 'ب' }];
  g.__PR = V.filter(s => s.date < '2026-09-01'); g.__S = V.filter(s => s.date >= '2026-09-01'); g.__A = AP;
  vm.runInContext('doctors=__D; sessions=__S; priorCtx={sessions:__PR}; _retData={appts:__A};', g);
  let m = vm.runInContext('_retModel()', g);
  ok(m.activeEnd === 7 && m.lost.length === 1 && m.newN === 3 && m.booked === 2 && m.ref === '2026-09-29', 'page: history before the period + the period, today from the clock');
  el.providerFilter.value = 'd2';
  m = vm.runInContext('_retModel()', g);
  ok(m.activeEnd === 2 && m.newN === 1 && m.visited === 2, 'page: one doctor — her visits, new by the first-visit rule');
  el.providerFilter.value = 'all'; lock.doctor = 'd2';
  m = vm.runInContext('_retModel()', g);
  ok(m.activeEnd === 2 && m.newN === 1, 'page: doctor mode — own visits only');
  lock.doctor = null;

  /* (٦) الربط */
  const iA = PR.indexOf('<script src="rpt-att.js?v='), iR = PR.indexOf('<script src="rpt-ret.js?v='), iIn = PR.indexOf("<script>\n'use strict';");
  ok(iR > iA && iR < iIn && (PR.match(/rpt-ret\.js\?v=/g) || []).length === 1, 'page: rpt-ret.js loaded once, before the inline script');
  ok((F['scripts/cache-bust.sh'].match(/rpt-ret/g) || []).length === 3, 'cache-bust: rpt-ret.js in the fleet allow-list');
  ok(/data-rpt-tab="ret" onclick="setRptTab\('ret'\)">🔁 الاحتفاظ<\/button>/.test(PR) && /<div id="retHost" class="rt-host" hidden><\/div>/.test(PR), 'page: tab and host');
  const lf = fnSrc(PR, 'async function _loadFilteredDataCore(gate) {')   /* v553: جسمُ الجلب صار بالنواة (الغلافُ يتبنّى الجلبَ المبكر) */;
  ok(/_retData = null;/.test(lf) && /renderRet\(\);/.test(lf) && lf.indexOf('loadRetData') === -1, 'lazy: appointments load only when the tab is shown (#687)');
  const ld = fnSrc(PR, 'async function loadRetData(key) {');
  ok(/\.select\('id,patient_id,date,status,is_planned'\)/.test(ld) && /_fetchAllPR\(/.test(ld) && /\.gte\('date', from\)/.test(ld) && /if \(seq === _retSeq\) renderRet\(\);/.test(ld), 'load: fields the booking rule reads, paged, from the period start; older loads cannot overwrite');
  ok(/_newFetchPatients\(ids\)/.test(fnSrc(PR, 'async function _retFetchNames(ids, d) {')) && /if \(need\.length && !_retData\.fetching\) _retFetchNames\(need, _retData\);/.test(fnSrc(PR, 'function renderRet() {')), 'names only for the visible lists, via the chunked loader (#691)');
  ok(/if \(rptTab === 'ret'\) return exportRetExcel\(\);/.test(fnSrc(PR, 'async function exportExcel() {')), 'Excel follows the tab');
  ok(/priorCtx = await fetchCtx\(null, _dayShift\(from, -1\), statusList, true\);/.test(PR), 'history carries the session identity (fees are not visits)');
}

const FILES = ['rpt-treat.js', 'rpt-newpt.js', 'rpt-ret.js', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['12 months inclusive', rep('rpt-ret.js', 'if (d[i] > lo) out[pid] = d[i];', 'if (d[i] >= lo) out[pid] = d[i];')],
  ['fees count as visits', rep('rpt-ret.js', "if (!s || !s.patient_id || !s.date || !N().isVisit(s)) return;", "if (!s || !s.patient_id || !s.date) return;")],
  ['lost without being active before', rep('rpt-ret.js', "var lost = Object.keys(aStart).filter(function (pid) { return !aEnd[pid]; })", "var lost = Object.keys(bp).filter(function (pid) { return !aEnd[pid]; })")],
  ['new from the scoped visits', rep('rpt-ret.js', "var newIds = N().pickNew(o.all || [], { from: o.from, to: ref }, o.inScope);", "var newIds = N().pickNew(o.visits || [], { from: o.from, to: ref }, o.inScope);")],
  ['cancelled counts as booked', rep('rpt-ret.js', 'var NOT_NEXT = { cancelled: 1, no_show: 1, broken: 1 };', 'var NOT_NEXT = { no_show: 1, broken: 1 };')],
  ['planned appointment counts as booked', rep('rpt-ret.js', "if (!a || !a.patient_id || !a.date || a.is_planned === true || NOT_NEXT[a.status]) return;", "if (!a || !a.patient_id || !a.date || NOT_NEXT[a.status]) return;")],
  ['reference not capped at today', rep('rpt-ret.js', 'var ref = o.to < o.today ? o.to : o.today;', 'var ref = o.to;')],
  ['name unescaped', rep('rpt-ret.js', "<b>' + esc(nm(r.id) || '—') + '</b>", "<b>' + (nm(r.id) || '—') + '</b>")],
  ['page scope ignored', rep('provider-reports.html', "visits: all.filter(function(s){ return inScope(s.provider_id || null); }),", 'visits: all,')],
  ['eager load', rep('provider-reports.html', "  _retData = null;   // v542", "  _retData = null; loadRetData(_newKey());   // v542")],
  ['day clipping lost', rep('rpt-ret.js', 'return ymd(y, m, Math.min(d, lastDay(y, m)));', 'return ymd(y, m, d);')],
  ['trend one month short', rep('rpt-ret.js', 'var ACTIVE_MONTHS = 12, TREND_MONTHS = 12,', 'var ACTIVE_MONTHS = 12, TREND_MONTHS = 11,')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-ret: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-ret: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
