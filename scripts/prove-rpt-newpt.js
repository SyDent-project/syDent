/* v540 — مثبتُ تبويب «المرضى الجدد» بصفحة التقارير (rpt-newpt.js + provider-reports.html) — مستقل، على الملفات الحيّة.
   (١) المصادرُ مرآةٌ حرفية لـREFERRAL_SOURCE_DEFS بصفحتي المرضى وبطاقة المريض (تُقرأ من المصدر — #11);
   (٢) الجديد = أوّلُ علاجٍ منجز بالفترة من كل التاريخ: لا مخطّط · لا رسم · لا رصيدَ سابقاً قبله · التعادلُ حتمي;
   (٣) النطاق: طبيبُ أول زيارة (فلتر/نوع/وضع الطبيب) · الإنتاجُ من جلسات تبويب الأطباء نفسها (#684) كيساً لكل عملة;
   (٤) الفترة السابقة · المصادر · الأشهر · الأطباء · «سجّلوا وما بلّشوا» (للعيادة وحدها، والرسمُ ليس بدءاً);
   (٥) الرسم (تهريب · رابطُ الإعداد #696 · فشلُ التاريخ مُعلَن #689) · (٦) الربط والتحميل الكسول والتصدير.
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
  vm.createContext(ctx);
  vm.runInContext('var window = this;', ctx);
  try { vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'], ctx); } catch (e) { ok(false, 'modules throw: ' + e.message); return; }
  const N = ctx.SyRptNew;
  if (!N) { ok(false, 'SyRptNew missing'); return; }
  ctx.SyDT = { numDate: d => String(d).split('-').reverse().map(x => String(+x)).join('/') };

  /* (١) مرآةُ المصادر */
  ['patients.html', 'patient-profile.html'].forEach(f => {
    const S = F[f], a = S.indexOf('const REFERRAL_SOURCE_DEFS = ['), b = S.indexOf('];', a);
    const c = {}; vm.createContext(c); vm.runInContext(S.slice(a, b + 2).replace('const ', 'var '), c);
    ok(JSON.stringify(c.REFERRAL_SOURCE_DEFS) === JSON.stringify(N.SOURCES), 'sources mirror ' + f + ' REFERRAL_SOURCE_DEFS');
  });
  ok(N.srcKey('social') === 'social' && N.srcKey(null) === N.NONE && N.srcKey('tiktok') === N.NONE && N.srcLabel(N.NONE) === 'غير محدد', 'source key: unknown/empty ⇒ «غير محدد»');

  /* (٢) أوّلُ زيارة */
  const S = (id, pid, date, extra) => Object.assign({ id, patient_id: pid, date, status: 'completed', cost: 100, currency: 'SYP', provider_id: 'd1', type: 'حشوة' }, extra);
  const fv = N.firstVisits([
    S('a2', 'p1', '2026-09-05'), S('a1', 'p1', '2026-09-05'), S('a0', 'p1', '2026-09-09'),
    S('b1', 'p2', '2026-08-01', { status: 'planned' }), S('b2', 'p2', '2026-09-10', { provider_id: 'd2' }),
    S('c1', 'p3', '2026-09-01', { type: 'رسم موعد لم يحضر', description: 'رسم عدم الحضور' }), S('c2', 'p3', '2026-09-12'),
    S('d1', 'p4', '2026-09-02', { type: 'رصيد سابق (قبل SyDent)' })]);
  ok(fv.p1.date === '2026-09-05' && fv.p1.id === 'a1', 'first visit: earliest date, ties broken by id');
  ok(fv.p2.date === '2026-09-10' && fv.p2.provider_id === 'd2', 'first visit: a planned session is not a visit');
  ok(fv.p3.date === '2026-09-12' && !fv.p4, 'first visit: a no-show fee or an opening balance is not a visit');

  /* (٣) الحساب */
  const prior = [S('x1', 'old', '2026-05-01'), S('x2', 'pv', '2026-08-10', { provider_id: 'd2' }), S('x3', 'pv2', '2026-08-20'),
                 S('x4', 'ob', '2026-01-01', { type: 'رصيد سابق (قبل SyDent)' })];
  const period = [
    S('s1', 'old', '2026-09-03', { cost: 999 }),
    S('s2', 'n1', '2026-09-04', { cost: 50000 }), S('s3', 'n1', '2026-09-20', { cost: 10, currency: 'USD', provider_id: 'd2' }),
    S('s4', 'n2', '2026-09-06', { cost: 70000, provider_id: 'd2' }), S('s10', 'n2', '2026-09-25', { cost: 3000, provider_id: 'd1' }),
    S('s5', 'n3', '2026-10-02', { cost: 1 }),
    S('s6', 'ob', '2026-09-07', { cost: 30000 }),
    S('s7', 'n4', '2026-09-08', { cost: 20000 }), S('s8', 'n4', '2026-09-15', { type: 'رصيد سابق (قبل SyDent)', cost: 5000 }),
    S('s9', 'n5', '2026-09-09', { status: 'planned', cost: 777 })];
  const P = { n1: { name: 'نور', referral_source: 'social' }, n2: { name: '<i>x</i>', referral_source: 'friend' }, n4: { name: 'باسل', referral_source: null },
              pv: { referral_source: 'social' }, pv2: { referral_source: 'search' } };
  const base = { from: '2026-09-01', to: '2026-09-30', prev: { from: '2026-08-02', to: '2026-08-31' }, prior, period, scoped: period, patients: P, clinicScope: true };
  const M = N.compute(base);
  const ids = M.list.map(r => r.id).sort().join(',');
  ok(ids === 'n1,n2,n4', 'new = first visit in the period (old patient, outside window, opening-balance-first and planned-only excluded; opening after the first visit still new) [' + ids + ']');
  const n1 = M.list.find(r => r.id === 'n1');
  ok(n1.bag.SYP === 50000 && n1.bag.USD === 10 && n1.provider_id === 'd1' && n1.first === '2026-09-04', 'production per currency bag, doctor of the first visit');
  ok(M.total.SYP === 50000 + 70000 + 3000 + 20000 + 5000 && M.total.USD === 10, 'total = Σ their sessions (#481 bags)');
  ok(M.prevN === 2 && M.sources.find(s => s.key === 'social').prevN === 1 && M.sources.find(s => s.key === 'search').prevN === 1, 'previous window: counted from the same history, per source');
  ok(M.sources[0].n >= M.sources[M.sources.length - 1].n && M.sources.some(s => s.key === N.NONE && s.n === 1), 'sources: by count, empty source ⇒ «غير محدد»');
  ok(M.doctors.length === 2 && M.months.length === 0, 'by doctor; one calendar month ⇒ no month breakdown');
  const M3 = N.compute(Object.assign({}, base, { from: '2026-07-01', to: '2026-09-30', prev: null }));
  ok(M3.months.map(x => x.label + ':' + x.n).join(',') === '7/2026:0,8/2026:2,9/2026:3' && M3.prevN === null, 'months across the span (zeros kept), no previous for «all»');
  const Md = N.compute(Object.assign({}, base, { scoped: period.filter(s => s.provider_id === 'd2'), inScope: p => p === 'd2', clinicScope: false }));
  ok(Md.list.map(r => r.id).join(',') === 'n2' && Md.total.SYP === 70000 && Md.prevN === 1, 'doctor scope: only patients whose first visit was with the doctor, production from the doctor\'s sessions');
  const R = N.registered([{ id: 'r1', name: 'أ', created_day: '2026-09-02' }, { id: 'r2', name: 'ب', created_day: '2026-09-09', referral_source: 'booking' }, { id: 'r3', name: 'ج', created_day: '2026-09-05' }], { r1: true });
  ok(R.n === 3 && R.started === 1 && R.waiting.map(w => w.id).join(',') === 'r2,r3' && R.waiting[0].src === 'booking', 'registered: started vs waiting, newest first');

  /* (٥) الرسم */
  const bag = b => 'B' + b.SYP + '/' + b.USD;
  const html = N.render(M, { bag, doc: id => 'Dr-' + id, reg: R, setupLink: 'patients.html' });
  ok(html.indexOf('<i>x</i>') === -1 && html.indexOf('&lt;i&gt;x&lt;/i&gt;') > -1, 'render: names escaped');
  ok(/href="patients\.html">صفحة المرضى<\/a>/.test(html) && /مريض واحد بلا مصدر/.test(html), 'render: missing sources point to where they are set (#696)');
  ok(/<div class="lbl">أكثر مصدر<\/div><div class="val rt-val-sm">—<\/div><div class="sub">تعادل بين 2 مصادر/.test(html), 'render: a tie for the top source is said, not a winner picked');
  const M1 = N.compute(Object.assign({}, base, { patients: Object.assign({}, P, { n4: { name: 'باسل', referral_source: 'social' } }) }));
  ok(/<div class="val rt-val-sm">فيسبوك \/ إنستغرام<\/div><div class="sub">مريضان · <bdi dir="ltr">67%<\/bdi>/.test(N.render(M1, { bag, doc: () => '' })), 'render: a clear top source');
  ok(/مقابل الفترة السابقة \(2\)/.test(html) && /بدأ العلاج منهم 1 \(<bdi dir="ltr">33%<\/bdi>\)/.test(html), 'render: previous period and conversion');
  ok((html.match(/href="patient-profile\.html\?id=/g) || []).length === 5 && /سجّلوا وما بلّشوا/.test(html), 'render: every new and waiting patient links to their profile');
  ok(N.render(M, { bag, doc: () => '' }).indexOf('سُجّلوا بالفترة') === -1, 'render: no registered block outside the clinic scope');
  ok(/تعذّر تحميل تاريخ المرضى قبل الفترة/.test(N.render({}, { priorFailed: true })), 'render: without the history no verdict (#689)');
  ok(/لا مرضى جدد بهذه الفترة/.test(N.render(N.compute({ from: '2026-09-01', to: '2026-09-30', prior: [], period: [], scoped: [] }), { bag })), 'render: empty state');
  ok(N.ptWord(0) === 'لا أحد' && N.ptWord(1) === 'مريض واحد' && N.ptWord(2) === 'مريضان' && N.ptWord(5) === '5 مرضى' && N.ptWord(12) === '12 مريضاً', 'Arabic count forms');

  /* ── نطاقُ الصفحة الحقيقي ── */
  const PR = F['provider-reports.html'];
  const el = { providerFilter: { value: 'all' }, providerTypeFilter: { value: 'all' }, inactiveFilter: { value: 'hide' }, fromDate: { value: '2026-09-01' }, toDate: { value: '2026-09-30' } };
  const lock = { doctor: null, on: false };
  const g = { console: { warn() {} }, Math, Number, String, Object, Array, JSON, Date, document: { getElementById: id => el[id] || null } };
  vm.createContext(g);
  vm.runInContext('var window = this;', g);
  vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'], g);
  g.SyDentLock = { isDoctor: () => !!lock.doctor || lock.on, getEffectiveDoctorId: () => lock.doctor, getDoctorId: () => lock.doctor };
  const need = ['function splitIsEarned(sp) {', 'function providerLabCost(provId) {', 'function computeProviderStats(provId) {', 'function getVisibleDoctors() {',
    'function treatScopeSessions() {', 'function _newClinicScope() {', 'function _newInScope() {', 'function _newModel() {', 'function prevWindow(from, to) {', 'function _dayShift(isoDay, n) {', 'function toDay(d) {'];
  ok(need.every(sg => fnSrc(PR, sg)), 'page: every function the tab relies on is present');
  vm.runInContext('var sessions=[],payments=[],paymentSplits=[],labOrders=[],splitSessionStatus={},doctors=[],priorCtx=null,_newData=null;\n' + need.map(sg => fnSrc(PR, sg)).join('\n'), g);
  g.__D = [{ id: 'd1', name: 'أ', provider_type: 'doctor' }, { id: 'd2', name: 'ب', provider_type: 'hygienist' }];
  g.__S = period; g.__PC = { sessions: prior }; g.__P = P;
  vm.runInContext('doctors=__D; sessions=__S; priorCtx=__PC; _newData={patients:__P};', g);
  const run = () => vm.runInContext('_newModel()', g);
  let m = run();
  ok(m.list.length === 3 && m.clinicScope === true && m.prevN === 2, 'page: whole clinic — same verdict as the engine, previous window from prevWindow()');
  el.providerFilter.value = 'd2';
  m = run();
  ok(m.list.map(r => r.id).join(',') === 'n2' && m.total.SYP === 70000 && m.total.USD === 0 && m.clinicScope === false, 'page: one doctor — her first visits, production from her sessions (computeProviderStats scope)');
  el.providerFilter.value = 'all'; el.providerTypeFilter.value = 'doctor';
  m = run();
  ok(m.list.map(r => r.id).sort().join(',') === 'n1,n4' && m.clinicScope === false, 'page: provider type narrows by the first visit');
  el.providerTypeFilter.value = 'all'; lock.doctor = 'd2';
  m = run();
  ok(m.list.map(r => r.id).join(',') === 'n2' && m.clinicScope === false, 'page: doctor mode — own first visits only, no clinic registrations');
  lock.doctor = null; lock.on = true;
  ok(run().clinicScope === false, 'page: doctor mode without a resolved id still never gets the clinic scope');
  lock.on = false;

  /* (٦) الربط */
  const iT = PR.indexOf('<script src="rpt-treat.js?v='), iN = PR.indexOf('<script src="rpt-newpt.js?v='), iIn = PR.indexOf("<script>\n'use strict';");
  ok(iN > iT && iN < iIn && (PR.match(/rpt-newpt\.js\?v=/g) || []).length === 1, 'page: rpt-newpt.js loaded once, after rpt-treat.js, before the inline script');
  ok((F['scripts/cache-bust.sh'].match(/rpt-newpt/g) || []).length === 3, 'cache-bust: rpt-newpt.js in the fleet allow-list');
  ok(/data-rpt-tab="new" onclick="setRptTab\('new'\)">🆕 المرضى الجدد<\/button>/.test(PR) && /<div id="newHost" class="rt-host" hidden><\/div>/.test(PR), 'page: tab and host');
  const lf = fnSrc(PR, 'async function _loadFilteredDataCore(gate) {')   /* v553: جسمُ الجلب صار بالنواة (الغلافُ يتبنّى الجلبَ المبكر) */;
  ok(/_newData = null;[^\n]*\n  _attData = null;[^\n]*\n  _retData = null;[^\n]*\n  _sumData = null;[^\n]*\n  renderTreat\(\);[^\n]*\n  renderNew\(\);/.test(lf) && lf.indexOf('loadNewData') === -1, 'lazy: a new period drops the cache; names/registrations load only when the tab is shown (#687)');
  const ld = fnSrc(PR, 'async function loadNewData(key) {');
  ok((ld.match(/CH = 150/g) || []).length === 1 && /_newFetchPatients\(ids\)/.test(ld) && /\.in\('patient_id', rids\.slice\(i, i \+ CH\)\)/.test(ld) && /CH = 150/.test(fnSrc(PR, 'async function _newFetchPatients(ids) {')), '.in() in chunks of 150 (#691)');
  ok(/if \(seq === _newSeq\) renderNew\(\);/.test(ld), 'a slower older load cannot overwrite a newer period');
  ok(/priorCtx = await fetchCtx\(null, _dayShift\(from, -1\), statusList, true\);/.test(PR) && /\(withTreat \? ',type,treatment_key,description' : ''\)/.test(PR), 'history before the period carries type/description — an old opening balance or fee is not a first visit');
  ok(/if \(rptTab === 'new'\) return exportNewExcel\(\);/.test(fnSrc(PR, 'async function exportExcel() {')), 'Excel follows the tab');
  ok(/if \(!priorCtx\) \{ host\.innerHTML = window\.SyRptNew\.render\(\{\}, \{ priorFailed: true \}\); return; \}/.test(fnSrc(PR, 'function renderNew() {')), 'no history ⇒ announced, not guessed (#689)');
}

const FILES = ['rpt-treat.js', 'rpt-newpt.js', 'provider-reports.html', 'patients.html', 'patient-profile.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['source label drift', rep('rpt-newpt.js', "{ key:'walk_in',         label:'مرور بالشارع' },", "{ key:'walk_in',         label:'مرور' },")],
  ['fee counted as a visit', rep('rpt-newpt.js', "&& !T().isFee(s); }", "; }")],
  ['planned counted as a visit', rep('rpt-newpt.js', "(s.status || 'completed') === 'completed' &&", '')],
  ['opening balance ignored', rep('rpt-newpt.js', "return inWin(fv.date, w) && !ob[pid] && inScope(fv.provider_id);", 'return inWin(fv.date, w) && inScope(fv.provider_id);')],
  ['latest instead of earliest', rep('rpt-newpt.js', 'if (!c || s.date < c.date ||', 'if (!c || s.date > c.date ||')],
  ['production from every period session', rep('rpt-newpt.js', "(o.scoped || []).forEach(function (s) {", "(o.period || []).forEach(function (s) {")],
  ['doctor scope ignored', rep('provider-reports.html', "  if (_newClinicScope()) return function(){ return true; };", "  return function(){ return true; };")],
  ['doctor sees clinic registrations', rep('provider-reports.html', "  if (window.SyDentLock && window.SyDentLock.isDoctor()) return false;\n  var vis = getVisibleDoctors();\n  var tf", "  var vis = getVisibleDoctors();\n  var tf")],
  ['no previous window', rep('provider-reports.html', "from: from, to: to, prev: prevWindow(from, to),", "from: from, to: to, prev: null,")],
  ['name unescaped', rep('rpt-newpt.js', "'<span class=\"rt-name\"><b>' + esc(r.name || '—') + '</b></span>'", "'<span class=\"rt-name\"><b>' + (r.name || '—') + '</b></span>'")],
  ['registered block for a doctor', rep('rpt-newpt.js', "    if (reg) {\n      html += '<div class=\"stat-card blue\">", "    if (true) { reg = reg || { n: 0, started: 0, waiting: [] };\n      html += '<div class=\"stat-card blue\">")],
  ['history without the session identity', rep('provider-reports.html', 'priorCtx = await fetchCtx(null, _dayShift(from, -1), statusList, true);', 'priorCtx = await fetchCtx(null, _dayShift(from, -1), statusList);')],
  ['tie reported as a winner', rep('rpt-newpt.js', 'tie = !!(top && named[1] && named[1].n === top.n);', 'tie = false;')],
  ['eager load on every period', rep('provider-reports.html', "  _newData = null;   // v540", "  _newData = null; loadNewData(_newKey());   // v540")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-newpt: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-newpt: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
