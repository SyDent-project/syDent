/* v541 — مثبتُ تبويب «الحضور والغياب» بصفحة التقارير (rpt-att.js + provider-reports.html) — مستقل، على الملفات الحيّة.
   (١) التصنيف: الحالةُ المُعلنة تغلب الأختام · إعادةُ الجدولة بنفس اليوم ليست إلغاءً · المخطّطُ خارجاً · القادمُ واليومُ خارج النسب;
   (٢) مرآةُ SyDentReliability الحقيقية (pt-reliability.js): أعدادُ الغياب والإلغاء لكل مريض متطابقة;
   (٣) النسبُ من المنتهي (حضر+غاب+ألغى) · الوقتُ الضائع · الفترة السابقة · التقسيمات · المكرّرون · الحدُّ الأدنى للعيّنة;
   (٤) النطاقُ بدوالّ الصفحة (طبيبُ الموعد · وضعُ الطبيب) · رسومُ الغياب من جلسات تبويب الأطباء;
   (٥) الرسم (تهريب · «بلا نتيجة» مُعلنة برابط · نقاطٌ مئوية) · (٦) الربط والتحميل الكسول والتصدير.
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
  try { vm.runInContext(F['rpt-att.js'] + '\n' + F['pt-reliability.js'], ctx); } catch (e) { ok(false, 'modules throw: ' + e.message); return; }
  const A = ctx.SyRptAtt, REL = ctx.SyDentReliability;
  if (!A || !REL) { ok(false, 'modules missing'); return; }
  ctx.SyDT = { numDate: d => String(d).split('-').reverse().map(x => String(+x)).join('/') };
  const TODAY = '2026-09-29';
  const X = (id, pid, date, status, extra) => Object.assign({ id, patient_id: pid, patient_name: 'م-' + pid, date, time: '10:00:00', duration: 30, status, provider_id: 'd1' }, extra);

  /* (١) التصنيف */
  const rows1 = [X('a', 'p1', '2026-09-10', 'no_show', { arrived_at: '2026-09-10T08:00:00Z' }), X('b', 'p2', '2026-09-11', 'cancelled'), X('b2', 'p2', '2026-09-11', 'confirmed', { arrived_at: 'x' }),
    X('c', 'p3', '2026-09-12', 'cancelled'), X('d', 'p4', '2026-09-13', 'completed'), X('e', 'p5', '2026-09-14', 'confirmed', { seated_at: 'x' }),
    X('f', 'p6', '2026-09-15', 'confirmed'), X('g', 'p7', TODAY, 'confirmed'), X('h', 'p8', '2026-10-02', 'confirmed'), X('i', 'p9', '2026-09-16', 'confirmed', { is_planned: true }),
    X('j', 'p10', '2026-09-17', 'pending'), X('k', 'p11', '2026-09-18', 'broken')];
  const sd = A.sameDayIndex(rows1), cl = id => A.classify(rows1.find(r => r.id === id), TODAY, sd);
  ok(cl('a') === 'missed' && cl('k') === 'missed', 'no-show/broken is missed even with an arrival stamp (the declared status wins)');
  ok(cl('b') === 'rescheduled' && cl('c') === 'cancelled', 'cancelled with another appointment the same day = rescheduled, else cancelled');
  ok(cl('d') === 'attended' && cl('e') === 'attended' && cl('b2') === 'attended', 'completed or any arrival/seat/dismiss stamp = attended');
  ok(cl('f') === 'unresolved' && cl('j') === 'unresolved' && cl('g') === 'today' && cl('h') === 'upcoming' && cl('i') === null, 'past without outcome = unresolved · today · upcoming · planned out');

  /* (٢) مرآةُ SyDentReliability الحقيقية */
  const rel = [X('r1', 'q1', '2026-06-01', 'no_show'), X('r2', 'q1', '2026-06-05', 'cancelled'), X('r3', 'q1', '2026-06-05', 'confirmed', { dismissed_at: 'x' }),
    X('r4', 'q1', '2026-07-01', 'cancelled'), X('r5', 'q2', '2026-08-01', 'broken'), X('r6', 'q2', '2026-08-02', 'completed'), X('r7', 'q3', '2026-09-01', 'cancelled'),
    X('r8', 'q3', '2026-09-02', 'no_show', { is_planned: true })];
  const R = REL.compute(rel, TODAY), sd2 = A.sameDayIndex(rel);
  const mine = {};
  rel.forEach(a => { const c = A.classify(a, TODAY, sd2); if (!a.patient_id || !c) return; const m = mine[a.patient_id] = mine[a.patient_id] || { missed: 0, cancelled: 0 }; if (c === 'missed') m.missed++; if (c === 'cancelled') m.cancelled++; });
  ok(['q1', 'q2', 'q3'].every(p => R[p] && mine[p] && R[p].missed === mine[p].missed && R[p].cancelled === mine[p].cancelled), 'per-patient missed/cancelled = pt-reliability SyDentReliability.compute');

  /* (٣) الحساب */
  const rows = [
    X('m1', 'p1', '2026-09-07', 'no_show', { time: '09:30:00', duration: 45, appointment_type_id: 'T1' }),   /* الإثنين */
    X('m2', 'p1', '2026-09-14', 'no_show', { time: '09:00:00', duration: 30 }),
    X('m3', 'p2', '2026-09-08', 'cancelled', { time: '17:00:00', duration: 60, provider_id: 'd2' }),
    X('m4', 'p2', '2026-09-15', 'cancelled', { time: '17:00:00', duration: 0, provider_id: 'd2' }),
    X('m5', 'p3', '2026-09-09', 'completed', { time: '11:00:00', appointment_type_id: 'T1' }),
    X('m6', 'p4', '2026-09-09', 'confirmed', { time: '12:00:00', arrived_at: 'x', provider_id: null }),
    X('m7', 'p5', '2026-09-10', 'cancelled'), X('m8', 'p5', '2026-09-10', 'completed', { time: '13:00:00', provider_id: 'd2' }),
    X('m9', 'p6', '2026-09-11', 'confirmed'), X('m10', 'p7', '2026-10-05', 'confirmed'),
    X('v1', 'p8', '2026-08-20', 'completed'), X('v2', 'p9', '2026-08-21', 'no_show'), X('v3', 'p9', '2026-08-22', 'completed'), X('v4', 'p9', '2026-08-23', 'completed')];
  const base = { from: '2026-09-01', to: '2026-10-10', today: TODAY, prev: { from: '2026-07-23', to: '2026-08-31' }, rows,
    typeName: a => a.appointment_type_id === 'T1' ? '<b>فحص</b>' : 'بلا نوع' };
  const M = A.compute(Object.assign({}, base, { to: '2026-09-30' }));
  const c = M.cur, r = A.rates(c);
  ok(c.attended === 3 && c.missed === 2 && c.cancelled === 2 && c.rescheduled === 1 && c.unresolved === 1 && r.f === 7, 'buckets: attended 3 · missed 2 · cancelled 2 · rescheduled 1 · unresolved 1 ⇒ 7 finished');
  ok(Math.abs(r.att - 3 / 7) < 1e-9 && Math.abs(r.fail - 4 / 7) < 1e-9, 'rates over finished only (rescheduled and unresolved out)');
  ok(c.lostMin === 45 + 30 + 60 && c.noDur === 1, 'lost chair time = missed + cancelled durations; a missing duration is counted');
  ok(M.prev && M.prev.attended === 3 && M.prev.missed === 1 && A.rates(M.prev).f === 4, 'previous window bucketed from the same rows');
  ok(M.days.find(d => d.label === 'الإثنين').missed === 2 && M.hours.find(h => h.label === '17:00').cancelled === 2, 'by weekday (local date) and by hour');
  ok(M.doctors.length === 3 && M.doctors.some(d => d.provider_id === null && d.attended === 1), 'by doctor, unassigned kept as its own row in the clinic scope');
  ok(M.types.some(t => t.label === '<b>فحص</b>' && t.missed === 1 && t.attended === 1), 'by appointment type');
  ok(M.repeat.map(x => x.id).join(',') === 'p2,p1' && M.repeat[1].missed === 2 && M.repeat[0].cancelled === 2 && M.repeat[1].last === '2026-09-14', 'repeat: two or more failures (rescheduled not counted), ties by the latest');
  const Mf = A.compute(base);
  ok(Mf.cur.upcoming === 1 && A.rates(Mf.cur).f === 7 && Mf.months.length === 2, 'future appointments are upcoming (not in rates); months across the span');
  const Md = A.compute(Object.assign({}, base, { to: '2026-09-30', inScope: p => p === 'd2' }));
  ok(Md.cur.cancelled === 2 && Md.cur.attended === 1 && A.rates(Md.cur).f === 3 && Md.repeat.length === 1, 'scope by the appointment\'s doctor');
  const Mr = A.compute(Object.assign({}, base, { to: '2026-09-30', inScope: p => p === 'd1' }));
  ok(Mr.cur.rescheduled === 1, 'rescheduling is judged across the whole day, not only the scoped doctor');

  /* (٥) الرسم */
  const html = A.render(M, { docName: id => 'Dr-' + id, fees: { n: 2, text: '40,000 ل.س' }, apptLink: 'appointments.html' });
  ok(html.indexOf('<b>فحص</b>') === -1 && html.indexOf('&lt;b&gt;فحص') > -1, 'render: labels escaped');
  ok(/موعد واحد مضى بلا نتيجة مسجّلة/.test(html) && /<a href="appointments\.html">المواعيد<\/a>/.test(html), 'render: unresolved announced with a link (#689)');
  ok(/<bdi dir="ltr">43%<\/bdi>/.test(html) && /<span class="rt-d rt-pts down"><bdi dir="ltr">▼ 32<\/bdi> نقطة<\/span>/.test(html), 'render: rates isolated LTR; attendance change in percentage points (75% ⇒ 43%)');
  ok(/عيّنة صغيرة/.test(html) && /رُسّم عدمُ الحضور 2 مرة/.test(html) && /ساعتان و15 د/.test(html), 'render: small samples show no rate; fees line; lost time');
  ok(/href="patient-profile\.html\?id=p1"/.test(html) && /غاب 2/.test(html), 'render: repeat patients link to their profiles');
  ok(/لا مواعيد بهذه الفترة/.test(A.render(A.compute(Object.assign({}, base, { rows: [] })), {})), 'render: empty state');
  ok(A.hours(135) === 'ساعتان و15 د' && A.hours(60) === 'ساعة' && A.hours(45) === '45 دقيقة' && A.hours(300) === '5 ساعات' && A.hours(720) === '12 ساعة', 'hours wording');
  ok(A.apptWord(1) === 'موعد واحد' && A.apptWord(2) === 'موعدان' && A.apptWord(7) === '7 مواعيد' && A.apptWord(12) === '12 موعداً', 'Arabic count forms');

  /* ── نطاقُ الصفحة الحقيقي ── */
  const PR = F['provider-reports.html'];
  const el = { providerFilter: { value: 'all' }, providerTypeFilter: { value: 'all' }, inactiveFilter: { value: 'hide' }, fromDate: { value: '2026-09-01' }, toDate: { value: '2026-09-30' } };
  const lock = { doctor: null };
  const g = { console: { warn() {} }, Math, Number, String, Object, Array, JSON, Date: class extends Date { constructor(...a) { if (!a.length) super('2026-09-29T12:00:00'); else super(...a); } } };
  g.document = { getElementById: id => el[id] || null };
  vm.createContext(g);
  vm.runInContext('var window = this;', g);
  vm.runInContext(F['rpt-att.js'], g);
  g.SyDentLock = { isDoctor: () => !!lock.doctor, getEffectiveDoctorId: () => lock.doctor, getDoctorId: () => lock.doctor };
  g.SyDentCurBag = { text: b => b.SYP + '|' + b.USD };
  const need = ['function _rowCur(r)', 'function splitIsEarned(sp) {', 'function providerLabCost(provId) {', 'function computeProviderStats(provId) {', 'function getVisibleDoctors() {',
    'function treatScopeSessions() {', 'function _newClinicScope() {', 'function _newInScope() {', 'function _attModel() {', 'function _attFees() {', 'function prevWindow(from, to) {',
    'function _dayShift(isoDay, n) {', 'function toDay(d) {', 'function fmt(n) {', 'function _newBag(b) {'];
  ok(need.every(sg => fnSrc(PR, sg) || PR.indexOf(sg) > -1), 'page: every function the tab relies on is present');
  const rc = PR.slice(PR.indexOf('function _rowCur(r)'), PR.indexOf('\n', PR.indexOf('function _rowCur(r)')));
  vm.runInContext('var sessions=[],payments=[],paymentSplits=[],labOrders=[],splitSessionStatus={},doctors=[],_attData=null;\n' + rc + '\n' + need.slice(1).map(sg => fnSrc(PR, sg)).join('\n'), g);
  g.__D = [{ id: 'd1', name: 'أ', provider_type: 'doctor' }, { id: 'd2', name: 'ب', provider_type: 'hygienist' }];
  g.__A = rows;
  g.__S = [{ id: 's1', provider_id: 'd1', cost: 20000, currency: 'SYP', description: 'رسم عدم الحضور', status: 'completed' }, { id: 's2', provider_id: 'd2', cost: 5, currency: 'USD', description: 'رسم عدم الحضور', status: 'completed' },
           { id: 's3', provider_id: 'd1', cost: 99, currency: 'SYP', description: 'حشوة', status: 'completed' }];
  vm.runInContext('doctors=__D; sessions=__S; _attData={rows:__A, types:{T1:"فحص"}};', g);
  let m = vm.runInContext('_attModel()', g);
  ok(A.rates(m.cur).f === 7 && m.prev && m.types.some(t => t.label === 'فحص'), 'page: whole clinic, previous window, type names from appointment_types');
  ok(JSON.stringify(vm.runInContext('_attFees()', g)) === JSON.stringify({ n: 2, text: '20000|5' }), 'page: no-show fees from the doctors-tab sessions, bagged per currency');
  el.providerFilter.value = 'd2';
  m = vm.runInContext('_attModel()', g);
  ok(m.cur.cancelled === 2 && m.cur.attended === 1 && vm.runInContext('_attFees().n', g) === 1, 'page: one doctor — her appointments and her fees');
  el.providerFilter.value = 'all'; lock.doctor = 'd1';
  m = vm.runInContext('_attModel()', g);
  ok(m.cur.cancelled === 0 && m.cur.missed === 2 && m.doctors.every(d => d.provider_id === 'd1'), 'page: doctor mode — own appointments only (unassigned out)');
  lock.doctor = null;

  /* (٦) الربط */
  const iN = PR.indexOf('<script src="rpt-newpt.js?v='), iA = PR.indexOf('<script src="rpt-att.js?v='), iIn = PR.indexOf("<script>\n'use strict';");
  ok(iA > iN && iA < iIn && (PR.match(/rpt-att\.js\?v=/g) || []).length === 1, 'page: rpt-att.js loaded once, before the inline script');
  ok((F['scripts/cache-bust.sh'].match(/rpt-att/g) || []).length === 3, 'cache-bust: rpt-att.js in the fleet allow-list');
  ok(/data-rpt-tab="att" onclick="setRptTab\('att'\)">📅 الحضور والغياب<\/button>/.test(PR) && /<div id="attHost" class="rt-host" hidden><\/div>/.test(PR), 'page: tab and host');
  const lf = fnSrc(PR, 'async function _loadFilteredDataCore(gate) {')   /* v553: جسمُ الجلب صار بالنواة (الغلافُ يتبنّى الجلبَ المبكر) */;
  ok(/_attData = null;/.test(lf) && /renderAtt\(\);/.test(lf) && lf.indexOf('loadAttData') === -1, 'lazy: appointments load only when the tab is shown (#687)');
  const ld = fnSrc(PR, 'async function loadAttData(key) {');
  ok(/\.select\('id,date,time,duration,status,provider_id,patient_id,patient_name,appointment_type_id,type,arrived_at,seated_at,dismissed_at,is_planned'\)/.test(ld) && /_fetchAllPR\(/.test(ld) && /\.gte\('date', lo\)\.lte\('date', to\)/.test(ld), 'load: every field the classification reads (#9), paged, with the previous window');
  ok(/if \(seq === _attSeq\) renderAtt\(\);/.test(ld), 'a slower older load cannot overwrite a newer period');
  ok(/if \(rptTab === 'att'\) return exportAttExcel\(\);/.test(fnSrc(PR, 'async function exportExcel() {')), 'Excel follows the tab');
}

const FILES = ['rpt-att.js', 'pt-reliability.js', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['stamps beat the declared status', rep('rpt-att.js', "    if (MISSED[a.status]) return 'missed';\n    if (a.status === 'cancelled') return sameDayOk(a) ? 'rescheduled' : 'cancelled';\n    if (came(a)) return 'attended';", "    if (came(a)) return 'attended';\n    if (MISSED[a.status]) return 'missed';\n    if (a.status === 'cancelled') return sameDayOk(a) ? 'rescheduled' : 'cancelled';")],
  ['rescheduled counted as cancelled', rep('rpt-att.js', "return sameDayOk(a) ? 'rescheduled' : 'cancelled';", "return 'cancelled';")],
  ['rescheduled in the denominator', rep('rpt-att.js', 'function finished(b) { return b.attended + b.missed + b.cancelled; }', 'function finished(b) { return b.attended + b.missed + b.cancelled + b.rescheduled; }')],
  ['unresolved counted as attended', rep('rpt-att.js', "return a.date === today ? 'today' : 'unresolved';", "return a.date === today ? 'today' : 'attended';")],
  ['planned appointments included', rep('rpt-att.js', 'if (!a || a.is_planned === true || !a.date) return null;', 'if (!a || !a.date) return null;')],
  ['no minimum sample', rep('rpt-att.js', 'var MIN_RATE = 3;', 'var MIN_RATE = 1;')],
  ['rescheduled time counted as lost', rep('rpt-att.js', "if (cls === 'missed' || cls === 'cancelled') {\n      var d", "if (cls === 'missed' || cls === 'cancelled' || cls === 'rescheduled') {\n      var d")],
  ['label unescaped', rep('rpt-att.js', "h += '<div class=\"rt-mini-row\"><span>' + esc(labelOf(b))", "h += '<div class=\"rt-mini-row\"><span>' + labelOf(b)")],
  ['scope ignored', rep('provider-reports.html', "rows: (_attData && _attData.rows) || [], inScope: _newInScope(),", "rows: (_attData && _attData.rows) || [],")],
  ['no previous window', rep('provider-reports.html', "from: from, to: to, today: toDay(new Date()), prev: prevWindow(from, to),", "from: from, to: to, today: toDay(new Date()), prev: null,")],
  ['eager load', rep('provider-reports.html', "  _attData = null;   // v541", "  _attData = null; loadAttData(_newKey());   // v541")],
  ['fees from every session', rep('provider-reports.html', "  treatScopeSessions().forEach(function(s){\n    if (s.description !== 'رسم عدم الحضور') return;", "  sessions.forEach(function(s){\n    if (s.description !== 'رسم عدم الحضور') return;")],
  ['same-day index from the scoped rows only', rep('rpt-att.js', 'var sameDay = sameDayIndex(o.rows || []);', 'var sameDay = sameDayIndex(rows);')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-att: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-att: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
