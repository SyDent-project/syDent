/* v527 — مثبتُ «بدها تحرّك» بصفحة المخابر + الإعادة على لوحة التحكم — مستقل، على الملفات الحيّة، بتواريخ نسبيّة لليوم (#671).
   (١) «حيّ»: الموعدُ المربوط الحيّ · وإلا أيُّ موعدٍ قادمٍ للمريض · SyDentApptDead الحقيقي (مكتمل/ملغى/غائب/منصرف) ·
       المخطَّطُ غير المجدول لا يُعدّ · الماضي لا يُعدّ;
   (٢) needsSeat: أُرسل/إعادة/استُلم/فُحص فقط، وبمريض · المسودّة والمركَّب والمرفوض أبداً;
   (٣) الشرائح: متأخر · قارب الموعد (ليس متأخراً) · بلا موعد — العدد، الإخفاءُ عند الصفر، والمختارةُ تبقى ظاهرة · الفلترة;
   (٤) رابطُ الحجز: اليومُ للجاهز · يومُ الدوام بعد الاستحقاق القادم لما عند المخبر · ترميزُ المعرّف · نصّا الجاهز/غيره;
   (٥) الربط: الصفّ والبطاقة · renderStats/applyFilter · حقولُ SyDentApptDead بالاستعلام · ?newFor= بصفحة المواعيد (صارم · يعبّي ولا يحفظ · يُزال);
   (٦) لوحة التحكم: الإعادةُ بالقائمة وبعدّاد المتأخر وبخريطة الحالات.
   --self-test: 11 طفرة لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
function varBlock(src, head) { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n};', i); return src.slice(i, j + 3); }
const pad = n => (n < 10 ? '0' : '') + n;
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addD = k => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d); };
const TODAY = addD(0);

function build(F) {
  const L = F['labs.html'], INIT = F['supabase-init.js'];
  const dead = (() => { const i = INIT.indexOf('window.SyDentApptDead = function'); const j = INIT.indexOf('\n};', i); return INIT.slice(i, j + 3); })();
  const els = {};
  const mkEl = id => ({ id, textContent: '', hidden: true, closest() { return els[id + '__btn']; } });
  ['actOverdue', 'actAtRisk', 'actUnsched'].forEach(id => { els[id] = mkEl(id); els[id + '__btn'] = { hidden: true }; });
  els.actSep = { hidden: true };
  const ctx = { window: {}, console: { warn() {} }, Date, String, Number, Object, Array, Math, JSON, encodeURIComponent,
    document: { getElementById: id => els[id] || null }, allOrders: [], allAppointments: [], currentFilter: 'all', searchQuery: '' };
  vm.createContext(ctx);
  vm.runInContext('window = this;', ctx);   /* كالمتصفح: window هو النطاق العام */
  vm.runInContext(dead + '\n' + F['lab-due.js'], ctx);
  const parts = [fnSrc(L, 'function dateStrLocal(d) {'), fnSrc(L, 'function _labIsDraft('), fnSrc(L, 'function getAppointmentById('),
    fnSrc(L, 'function isOverdue(lo) {'), fnSrc(L, 'function isAtRisk(lo) {'),
    L.slice(L.indexOf("var LAB_SEAT_STATUSES = "), L.indexOf('\n', L.indexOf("var LAB_SEAT_STATUSES = "))),
    fnSrc(L, 'function labApptLive(a, today) {'), fnSrc(L, 'function labNextSeat(lo) {'), fnSrc(L, 'function needsSeat(lo) {'),
    varBlock(L, 'var LAB_ACT_FILTERS = {'), fnSrc(L, 'function renderActChips() {'), fnSrc(L, 'function labSeatDate(lo) {'),
    fnSrc(L, 'function labSeatLink(lo) {'), fnSrc(L, 'function getFilteredOrders() {'), fnSrc(L, 'function getPatientName('), fnSrc(L, 'function getLabName(')];
  vm.runInContext(parts.join('\n'), ctx);
  return { ctx, els };
}

function suite(F) {
  const { ctx, els } = build(F);
  const A = (id, pid, dayK, extra) => Object.assign({ id, patient_id: pid, date: addD(dayK), time: '10:00:00', status: 'confirmed', is_planned: false }, extra || {});
  const O = (id, pid, status, extra) => Object.assign({ id, patient_id: pid, status, date_sent: addD(-5) + 'T00:00:00+00:00' }, extra || {});
  ctx.allAppointments = [
    A('aLinkDone', 'p1', 2, { status: 'completed' }), A('aP1', 'p1', 5),
    A('aP2dead', 'p2', 0, { arrived_at: addD(0) + 'T09:00:00Z', dismissed_at: addD(0) + 'T09:30:00Z' }),
    A('aP3plan', 'p3', 4, { is_planned: true }), A('aP4past', 'p4', -3), A('aP5today', 'p5', 0), A('aP6noshow', 'p6', 3, { status: 'no_show' })];
  const run = s => vm.runInContext(s, ctx);
  ctx.lo = O('o1', 'p1', 'received', { appointment_id: 'aLinkDone' });
  ok(run('labNextSeat(lo)') && run('labNextSeat(lo).id') === 'aP1' && run('needsSeat(lo)') === false, 'live: a completed linked appt falls back to the patient\'s next live appointment');
  const seat = (pid, status, extra) => { ctx.lo = O('x', pid, status, extra); return run('needsSeat(lo)'); };
  ok(seat('p2', 'checked') === true, 'live: arrived + dismissed today = dead (SyDentApptDead) ⇒ needs a seat');
  ok(seat('p3', 'received') === true && seat('p4', 'received') === true && seat('p6', 'sent') === true, 'live: planned-unscheduled, past and no-show do not count');
  ok(seat('p5', 'received') === false, 'live: a live appointment today counts');
  ok(seat('p9', 'draft') === false && seat('p9', 'delivered') === false && seat('p9', 'rejected') === false && seat('p9', 'redo') === true && seat('p9', 'sent') === true,
     'needsSeat: only sent/redo/received/checked');
  ctx.lo = { id: 'z', status: 'received', patient_id: null }; ok(run('needsSeat(lo)') === false, 'needsSeat: no patient ⇒ never');
  /* الشرائح والفلترة */
  ctx.allOrders = [
    O('ov', 'p5', 'sent', { date_due: addD(-2) + 'T00:00:00+00:00' }),                 /* متأخر (له موعد اليوم) */
    O('ar', 'p1', 'sent', { appointment_id: 'aAR' }),                                    /* قارب الموعد */
    O('both', 'p1', 'sent', { appointment_id: 'aAR', date_due: addD(-1) + 'T00:00:00+00:00' }),   /* متأخرٌ وقارب ⇒ متأخرٌ فقط */
    O('us', 'p2', 'checked'), O('us2', 'p9', 'redo'),                                    /* بلا موعد */
    O('dr', 'p9', 'draft', { date_sent: null }), O('dl', 'p9', 'delivered')];
  ctx.allAppointments.push(A('aAR', 'p1', 1));
  ctx.currentFilter = 'all'; run('renderActChips()');
  ok(els.actOverdue.textContent === 2 && els.actAtRisk.textContent === 1 && els.actUnsched.textContent === 2 && !els.actSep.hidden, 'chips: counts overdue 2 · at-risk 1 (overdue wins) · unscheduled 2 ' + JSON.stringify([els.actOverdue.textContent, els.actAtRisk.textContent, els.actUnsched.textContent]));
  ok(els.actOverdue__btn.hidden === false && els.actUnsched__btn.hidden === false, 'chips: shown when they have a count');
  const ids = f => { ctx.currentFilter = f; return run('getFilteredOrders().map(function(o){return o.id}).join()'); };
  ok(ids('overdue') === 'ov,both' && ids('atrisk') === 'ar' && ids('unsched') === 'us,us2' && ids('sent') === 'ov,ar,both', 'filter: act chips select by predicate; status filters unchanged');
  ctx.allOrders = [O('dl', 'p9', 'delivered')]; ctx.currentFilter = 'unsched'; run('renderActChips()');
  ok(els.actUnsched__btn.hidden === false && els.actOverdue__btn.hidden === true && els.actSep.hidden === false, 'chips: the selected chip stays visible at zero; others hide');
  ctx.currentFilter = 'all'; run('renderActChips()');
  ok(els.actSep.hidden === true && els.actUnsched__btn.hidden === true, 'chips: nothing to act on ⇒ row hidden');
  /* رابطُ الحجز */
  ctx.lo = O('x', 'p/9&x', 'received');
  const l1 = run('labSeatLink(lo)');
  ok(l1.indexOf('appointments.html?newFor=p%2F9%26x&date=' + TODAY) > -1 && /جاهز بلا موعد تركيب — احجز/.test(l1), 'link: ready ⇒ today, id encoded, «جاهز بلا موعد تركيب»');
  ctx.lo = O('x', 'p9', 'sent', { date_due: addD(6) + 'T00:00:00+00:00' });
  const exp = run("SyLabDue.addWorkDays('" + addD(6) + "', 1)");
  ok(run('labSeatDate(lo)') === exp && /[^ز] بلا موعد تركيب|📅 بلا موعد تركيب/.test(run('labSeatLink(lo)')), 'link: at the lab with an upcoming due ⇒ the work day after the due (' + exp + ')');
  ctx.lo = O('x', 'p9', 'redo', { date_due: addD(-4) + 'T00:00:00+00:00' });
  ok(run('labSeatDate(lo)') === TODAY, 'link: past due ⇒ today');
  ctx.lo = O('x', 'p5', 'received'); ok(run('labSeatLink(lo)') === '', 'link: none when a live appointment exists');

  /* (٥) الربط */
  const L = F['labs.html'];
  const rt = fnSrc(L, 'function renderTable() {') || L.slice(L.indexOf('function renderTable'), L.indexOf('/* Filters */'));
  ok((rt.match(/\(seatLink \? '<div>' \+ seatLink \+ '<\/div>' : ''\)/g) || []).length === 2 && /var seatLink = labSeatLink\(lo\);/.test(rt), 'wiring: link in the table row and the mobile card');
  ok(/renderActChips\(\);\n\}/.test(fnSrc(L, 'function renderStats() {')) || /\n  renderActChips\(\);\n/.test(fnSrc(L, 'function renderStats() {')), 'wiring: renderStats refreshes the chips');
  ok(/renderActChips\(\);/.test(fnSrc(L, 'function applyFilter(f, btn) {')), 'wiring: applyFilter refreshes the chips');
  ok(/select\('id, patient_id, patient_name, date, time, type, status, provider_id, is_planned, arrived_at, seated_at, dismissed_at'\)/.test(L), 'wiring: appointments query carries the SyDentApptDead fields');
  ok(/data-filter="overdue"[^>]*hidden>/.test(L) && /data-filter="atrisk"[^>]*hidden>/.test(L) && /data-filter="unsched"[^>]*hidden>/.test(L), 'wiring: chips hidden until counted');
  ok(/<div class="section lab-orders">/.test(L) && /\.lab-orders \{ container-type: inline-size; container-name: laborders; \}/.test(L)
     && /@container laborders \(max-width: 1200px\) \{\s*\.table-scroll \{ display: none !important; \}\s*\.cards-list \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(L)
     && /@container laborders \(max-width: 700px\) \{\s*\.cards-list \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(L), 'layout: orders switch to 2-column cards by the section\'s own width (v536), 1 column when narrow');
  const AP = F['appointments.html'];
  const nf = AP.slice(AP.indexOf("var _newForQ = qp.get('newFor');"), AP.indexOf("newWithTemplateId = null;", AP.indexOf("var _newForQ")) + 30);
  ok(/if \(_newForQ && !_slotQ && !waId && !editApptId\)/.test(nf) && /\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\$|\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(nf) && /await openModal\(_nfDate \|\| undefined\)/.test(nf) && /patientsCache\[_newForQ\]/.test(nf)
     && /\['newFor', 'date', 'newWithTemplate'\]/.test(nf) && !/saveAppt\(|\.insert\(/.test(nf), 'appointments: ?newFor= strict date, opens a new appointment prefilled, URL cleaned, never saves');
  /* (٦) اللوحة */
  const IX = F['index.html'];
  ok(/'redo':\s*\{ ar: 'إعادة',/.test(IX) && /\.in\('status', \['sent','received','checked','redo'\]\)/.test(IX) && /\.in\('status', \['sent','received','redo'\]\)\s*\/\*[^*]*\*\/\s*\n\s*\.lt\('date_due'/.test(IX)
     && /lo\.status === 'sent' \|\| lo\.status === 'received' \|\| lo\.status === 'redo'\);/.test(IX), 'dashboard: redo listed, counted overdue and labelled');
}

const FILES = ['labs.html', 'supabase-init.js', 'lab-due.js', 'appointments.html', 'index.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['planned appointments count', rep('labs.html', "if (!a || !a.date || a.is_planned === true) return false;", "if (!a || !a.date) return false;")],
  ['past appointments count', rep('labs.html', "if (String(a.date).slice(0, 10) < today) return false;", '')],
  ['dead appointments count', rep('labs.html', "return !(window.SyDentApptDead && window.SyDentApptDead(a, today));", 'return true;')],
  ['drafts need a seat', rep('labs.html', "var LAB_SEAT_STATUSES = ['sent', 'redo', 'received', 'checked'];", "var LAB_SEAT_STATUSES = ['draft', 'sent', 'redo', 'received', 'checked'];")],
  ['at-risk includes overdue', rep('labs.html', 'atrisk:  function (lo) { return !isOverdue(lo) && isAtRisk(lo); }', 'atrisk:  function (lo) { return isAtRisk(lo); }')],
  ['selected chip hides at zero', rep('labs.html', "var show = n > 0 || currentFilter === k;", 'var show = n > 0;')],
  ['seat date ignores the due', rep('labs.html', 'if (next > today) return next;', '')],
  ['card lacks the link', rep('labs.html', "'<div class=\"oc-patient\">' + apptBadge + pLink + (seatLink ? '<div>' + seatLink + '</div>' : '') + '</div>'", "'<div class=\"oc-patient\">' + apptBadge + pLink + '</div>'")],
  ['newFor loose date', rep('appointments.html', "var _nfDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(qp.get('date') || '') ? qp.get('date') : null;", "var _nfDate = qp.get('date');")],
  ['table kept on narrow sections', rep('labs.html', '@container laborders (max-width: 1200px) {', '@container laborders (max-width: 100px) {')],
  ['dashboard hides redo', rep('index.html', ".in('status', ['sent','received','checked','redo'])", ".in('status', ['sent','received','checked'])")]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const log = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lab-worklist: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-worklist: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
