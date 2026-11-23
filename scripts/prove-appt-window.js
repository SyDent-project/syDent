/* v808 — مثبتُ نافذة تحميل المواعيد (طلب المالك 23/11/2026: «الأشهر القديمة تتحمّل بس لما أرجع لورا»).
   مستقل، على الملفات الحيّة، بقاعدةٍ وهمية تطبّق فلاتر الاستعلام كما كُتبت بالمصدر:
   (١) أولُ تحميل: من أول الشهر الماضي + كلُّ «بلا تاريخ» — لا شيءَ أقدم.
   (٢) الرجوعُ لفترةٍ أقدم: apptEnsureFrom يجلب [أولَ شهرها، بدايةَ المحمَّل) فقط، يدمج بلا تكرار وبترتيب الخادم،
       وطلبان متزامنان لنفس الفترة = طلبٌ واحد؛ والتحميلُ المعاد يبدأ من المُمدَّد إليه.
   (٣) تمديدٌ يكتمل أثناء تحميلٍ معاد ⇒ أشهرُه لا تضيع.
   (٤) موعدٌ بعينه أقدم من النافذة (رابطٌ عميق · طلب حجز/بوابة · بندٌ مخطّط مربوط) ⇒ يُجلب بمعرّفه ويُعاد مع كل تحميل.
   (٥) apptCheckRange: فترةٌ أقدم ⇒ غشاءٌ + جلبٌ + رسمٌ من جديد؛ داخل المحمَّل ⇒ الشهرُ الذي قبلها بالخلفية؛ العروضُ
       المتجدّدة ⇒ لا شيء.
   (٦) بلا اتصال وقد بدأ شهرٌ جديد ⇒ تُقرأ نافذةُ الشهر السابق المحفوظة بدل الفشل.
   (٧) التزامُ المريض من SyDentReliability.load لا من المصفوفة الناقصة؛ تعذّرت ⇒ لا شارةَ ناقصة.
   (٨) التوصيل: render ⇒ apptCheckRange · editAppt/الروابط/البوابة/الحجز ⇒ الجلبُ بالمعرّف.
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
const FILES = ['appointments.html', 'appt-views.js', 'appt-modal.js', 'appt-portal.js', 'appt-booking.js', 'pt-reliability.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });

/* ── قاعدةٌ وهمية: تطبّق eq/or/gte/lt/in كما كُتبت ── */
function makeDb(rows, opt) {
  opt = opt || {};
  const log = [];
  function q(table) {
    const f = { table, eq: [], or: null, gte: null, lt: null, in: null };
    const api = {
      select() { return api; }, order() { return api; },
      eq(c, v) { f.eq.push([c, v]); return api; }, or(s) { f.or = s; return api; },
      gte(c, v) { f.gte = [c, v]; return api; }, lt(c, v) { f.lt = [c, v]; return api; }, in(c, v) { f.in = [c, v.slice()]; return api; },
      __f: f,
      then(a, b) { return run().then(a, b); }
    };
    function run() {
      log.push(JSON.parse(JSON.stringify(f)));
      if (opt.failIf && opt.failIf(f)) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
      const src = table === 'appointments' ? rows : [];
      let out = src.filter(r => f.eq.every(([c, v]) => String(r[c]) === String(v)));
      if (f.or) {
        const conds = f.or.split(',').map(c => c.split('.'));
        out = out.filter(r => conds.some(c => c[1] === 'is' ? (r[c[0]] === null || r[c[0]] === undefined) : (c[1] === 'gte' ? (r[c[0]] != null && r[c[0]] >= c.slice(2).join('.')) : false)));
      }
      if (f.gte) out = out.filter(r => r[f.gte[0]] != null && r[f.gte[0]] >= f.gte[1]);
      if (f.lt) out = out.filter(r => r[f.lt[0]] != null && r[f.lt[0]] < f.lt[1]);
      if (f.in) out = out.filter(r => f.in[1].indexOf(r[f.in[0]]) !== -1);
      out = out.slice().sort((x, y) => { const xd = x.date, yd = y.date; if (xd !== yd) { if (xd == null) return 1; if (yd == null) return -1; return xd < yd ? -1 : 1; } const xt = x.time || '', yt = y.time || ''; return xt < yt ? -1 : xt > yt ? 1 : 0; });
      const delay = opt.delay ? opt.delay(f) : 0;
      return new Promise(res => setTimeout(() => res({ data: JSON.parse(JSON.stringify(out)), error: null }), delay));
    }
    return api;
  }
  return { q, log };
}

function harness(F, rows, opt) {
  opt = opt || {};
  const H = F['appointments.html'];
  const ws = H.indexOf('/* ═══ v808: تحميلُ المواعيد بنافذة'), we = H.indexOf('async function loadAppointments(');
  const win = (ws > -1 && we > ws) ? H.slice(ws, we) : '';
  const code = [fnSrc(H, 'function _apptSettle('), win, fnSrc(H, 'async function loadAppointments(')].join('\n');
  const db = makeDb(rows, opt.db);
  const ev = [];
  const classes = {};
  const el = id => ({ classList: { add: c => { classes[id + '.' + c] = 1; }, remove: c => { delete classes[id + '.' + c]; } }, hidden: true });
  const els = { scheduleView: el('scheduleView'), apptRangeStatus: el('apptRangeStatus') };
  const ctx = {
    currentUser: { id: 'u1' }, console: { warn: () => ev.push('warn') }, mainTab: 'schedule', Promise, Object, String, parseFloat, Array, Date, JSON, setTimeout,
    showToast: m => ev.push('toast:' + m), refreshPlannedCount() {}, renderPlanned() {}, render: () => { ev.push('render'); if (ctx.__autoCheck) ctx.apptCheckRange(); },
    dateStr: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    appointments: [], sessionsByAppt: null, plannedSessionsByPatient: null, altPlannedCountByPatient: null, labOrdersByPatient: null, labOrdersByAppt: null, _apptAux: null,
    view: 'month', currentDate: new Date(2026, 10, 23), selectedDate: new Date(2026, 10, 23),
    _wkWeekStart: d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; },
    document: { getElementById: id => els[id] || null },
    window: {
      navigator: { onLine: opt.offline ? false : true },
      SyDentApptDead: a => a.status === 'cancelled',
      SyDentFetchAll: build => build(),
      SyDentReliability: opt.reliab,
      sb: { from: t => db.q(t) }
    }
  };
  vm.createContext(ctx);
  /* Date ثابت: «اليوم» = 23/11/2026 */
  vm.runInContext('(function(){var R=Date;var T=new R(2026,10,23,10,0,0).getTime();function D(){if(!(this instanceof D))return new R(T).toString();var a=[].slice.call(arguments);return a.length?new (Function.prototype.bind.apply(R,[null].concat(a)))():new R(T);}D.now=function(){return T;};D.prototype=R.prototype;Date=D;})();', ctx);
  vm.runInContext(code + '\nthis.__L = loadAppointments; this.apptCheckRange = apptCheckRange; this.apptEnsureFrom = apptEnsureFrom; this.apptEnsureIds = apptEnsureIds; this.apptFindById = apptFindById; this.__st = function(){ return { from: _apptFrom, keep: Object.keys(_apptKeepIds), reliab: _apptReliab, ext: _apptExtending }; };', ctx);
  return { ctx, db, ev, classes, els };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));
const ids = arr => arr.map(a => a.id).join(',');

function mk() {
  const R = [];
  const add = (id, date, time, extra) => R.push(Object.assign({ id, doctor_id: 'u1', date, time, status: 'confirmed' }, extra || {}));
  add('00000000-0000-0000-0000-000000000001', '2026-06-10', '09:00');
  add('00000000-0000-0000-0000-000000000002', '2026-08-03', '10:00');
  add('00000000-0000-0000-0000-000000000003', '2026-09-30', '11:00');
  add('00000000-0000-0000-0000-000000000004', '2026-10-01', '08:00');
  add('00000000-0000-0000-0000-000000000005', '2026-10-15', '12:00');
  add('00000000-0000-0000-0000-000000000006', '2026-11-23', '09:30');
  add('00000000-0000-0000-0000-000000000007', '2026-11-23', '09:00');
  add('00000000-0000-0000-0000-000000000008', '2027-02-01', '10:00');
  add('00000000-0000-0000-0000-000000000009', null, null, { is_planned: true });
  add('00000000-0000-0000-0000-00000000000a', '2026-09-05', '10:00', { doctor_id: 'other' });
  return R;
}
const A = n => '00000000-0000-0000-0000-00000000000' + n;

async function suite(F) {
  const H = F['appointments.html'];
  /* (١) أولُ تحميل */
  let h = harness(F, mk());
  await h.ctx.__L();
  const ap0 = h.db.log.filter(l => l.table === 'appointments')[0] || {};
  ok(ap0.or === 'date.gte.2026-10-01,date.is.null', '(1) first load asks from the 1st of last month + undated: ' + ap0.or);
  ok(ids(h.ctx.appointments) === [A(4), A(5), A(7), A(6), A(8), A(9)].join(','), '(1) loaded = window only, in server order (date, time, undated last): ' + ids(h.ctx.appointments));
  ok(h.ctx.__st().from === '2026-10-01', '(1) window start recorded');
  /* (٢) الرجوع */
  let p1 = h.ctx.apptEnsureFrom('2026-08-17'), p2 = h.ctx.apptEnsureFrom('2026-08-01');
  await Promise.all([p1, p2]);
  const ext = h.db.log.filter(l => l.table === 'appointments' && l.gte);
  ok(ext.length === 1 && ext[0].gte[1] === '2026-08-01' && ext[0].lt[1] === '2026-10-01' && ext[0].eq.some(e => e[0] === 'doctor_id' && e[1] === 'u1'),
     '(2) going back fetches only [1st of that month, window start), once for two concurrent asks: ' + JSON.stringify(ext.map(e => [e.gte, e.lt])));
  ok(ids(h.ctx.appointments) === [A(2), A(3), A(4), A(5), A(7), A(6), A(8), A(9)].join(',') && h.ctx.__st().from === '2026-08-01',
     '(2) merged in server order, other clinics never, window start moves back');
  const before = h.db.log.length;
  ok((await h.ctx.apptEnsureFrom('2026-09-12')) === false && h.db.log.length === before, '(2) a period already loaded asks nothing');
  await h.ctx.__L();
  const re = h.db.log.filter(l => l.table === 'appointments' && l.or).pop();
  ok(re.or === 'date.gte.2026-08-01,date.is.null' && ids(h.ctx.appointments).indexOf(A(2)) === 0, '(2) a reload keeps the months already opened');
  /* لا تكرار: موعدٌ جُلب بمعرّفه ثم جاء ضمن تمديد */
  h = harness(F, mk());
  await h.ctx.__L();
  await h.ctx.apptEnsureIds([A(2)]);
  await h.ctx.apptEnsureFrom('2026-08-01');
  ok(h.ctx.appointments.filter(a => a.id === A(2)).length === 1 && h.ctx.appointments.length === new Set(h.ctx.appointments.map(a => a.id)).size, '(2) an appointment fetched by id and then by its month appears once');
  /* (٣) تمديدٌ يكتمل أثناء تحميلٍ معاد */
  h = harness(F, mk(), { db: { delay: f => f.or ? 40 : 5 } });
  await h.ctx.__L();
  const pl = h.ctx.__L(); await tick(2);
  await h.ctx.apptEnsureFrom('2026-08-01');
  await pl;
  ok(h.ctx.__st().from === '2026-08-01' && ids(h.ctx.appointments).split(',').indexOf(A(2)) > -1 && ids(h.ctx.appointments).split(',').indexOf(A(3)) > -1,
     '(3) months opened while a reload was in flight survive it: ' + ids(h.ctx.appointments));
  /* (٤) بالمعرّف */
  h = harness(F, mk());
  await h.ctx.apptEnsureIds([A(1)]);                 /* قبل أول تحميل ⇒ يُحفظ ولا يُجلب */
  ok(h.db.log.length === 0 && h.ctx.__st().keep.indexOf(A(1)) > -1, '(4) before the first load an id is remembered, not fetched');
  await h.ctx.__L();
  ok(h.ctx.appointments.some(a => a.id === A(1)) && h.db.log.some(l => l.in && l.in[1].length === 1 && l.in[1][0] === A(1)), '(4) …and resolved by that load');
  await h.ctx.__L();
  ok(h.ctx.appointments.some(a => a.id === A(1)), '(4) a kept id comes back after every reload');
  const n0 = h.db.log.length;
  await h.ctx.apptEnsureIds([A(5), A(6), 'not-a-uuid', '', null]);
  ok(h.db.log.length === n0, '(4) loaded or malformed ids ask nothing');
  const many = []; for (let i = 0; i < 320; i++) many.push('10000000-0000-0000-0000-' + String(i).padStart(12, '0'));
  await h.ctx.apptEnsureIds(many);
  const chunks = h.db.log.slice(n0).filter(l => l.in);
  ok(chunks.length === 3 && chunks.every(c => c.in[1].length <= 150 && c.eq.some(e => e[0] === 'doctor_id')), '(4) ids are fetched in chunks of ≤150, own clinic only');
  ok((await h.ctx.apptFindById(A('a'))) === null, '(4) another clinic\'s appointment is never found by id');
  /* البندُ المخطّط المربوط بموعدٍ قديم ملغى يعود للجدولة كما كان */
  h = harness(F, mk().concat([{ id: A('b'), doctor_id: 'u1', date: '2026-05-02', time: '10:00', status: 'cancelled' }]));
  const sesRows = [{ id: 's1', appointment_id: A('b'), status: 'planned', patient_id: 'p1' }];
  h.ctx.window.sb = { from: t => t === 'ledger_sessions' ? Object.assign(h.db.q('x'), { then(a, b) { return Promise.resolve({ data: sesRows, error: null }).then(a, b); } }) : h.db.q(t) };
  await h.ctx.__L();
  ok(h.ctx.plannedSessionsByPatient.p1 && h.ctx.plannedSessionsByPatient.p1.length === 1, '(4) a planned item tied to an old cancelled appointment still returns to scheduling');
  /* (٥) apptCheckRange */
  h = harness(F, mk());
  await h.ctx.__L();
  h.ctx.currentDate = new Date(2026, 8, 1); h.ctx.view = 'month';     /* أيلول — شبكتُه تبدأ 30 آب */
  h.ev.length = 0;
  h.ctx.apptCheckRange();
  ok(h.classes['scheduleView.appt-range-loading'] && h.els.apptRangeStatus.hidden === false, '(5) an older period dims and says it is loading');
  await tick(20);
  ok(!h.classes['scheduleView.appt-range-loading'] && h.els.apptRangeStatus.hidden === true && h.ev.indexOf('render') > -1 && h.ctx.__st().from === '2026-08-01',
     '(5) …then repaints with its months (grid from 30 Aug ⇒ from 1 Aug): ' + h.ctx.__st().from);
  const n1 = h.db.log.length; h.ctx.__autoCheck = false;
  h.ctx.currentDate = new Date(2026, 8, 10); h.ctx.apptCheckRange(); await tick(20);   /* أيلول: شبكتُه من 30 آب = بدايةُ المحمَّل */
  const bg = h.db.log.slice(n1).filter(l => l.gte);
  ok(bg.length === 1 && bg[0].gte[1] === '2026-07-01' && !h.classes['scheduleView.appt-range-loading'], '(5) inside the loaded range: the month before is fetched in the background, no dimming');
  const n2 = h.db.log.length; h.ctx.view = 'list'; h.ctx.apptCheckRange(); h.ctx.view = 'calls'; h.ctx.apptCheckRange(); await tick(10);
  ok(h.db.log.length === n2, '(5) rolling views (upcoming / calls) ask nothing');
  h.ctx.view = 'week'; h.ctx.selectedDate = new Date(2026, 4, 20); h.ctx.apptCheckRange(); await tick(20);
  ok(h.ctx.__st().from === '2026-05-01', '(5) week view goes back by its week start too');
  h.ctx.view = 'day'; h.ctx.selectedDate = new Date(2026, 0, 3); h.ctx.apptCheckRange(); await tick(20);
  ok(h.ctx.__st().from === '2026-01-01', '(5) day view too');
  /* فشلُ الجلب ⇒ رسالةٌ واحدة، بلا حلقة */
  h = harness(F, mk(), { db: { failIf: f => !!f.gte } });
  await h.ctx.__L(); h.ev.length = 0;
  h.ctx.currentDate = new Date(2026, 5, 1); h.ctx.apptCheckRange(); h.ctx.apptCheckRange(); await tick(20);
  ok(h.ev.filter(e => e.indexOf('toast:') === 0).length === 1 && h.ev.indexOf('render') === -1 && !h.classes['scheduleView.appt-range-loading'], '(5) a failed fetch: one toast, no loop, dimming cleared');
  /* (٦) بلا اتصال وقد بدأ شهرٌ جديد */
  h = harness(F, mk(), { offline: true, db: { failIf: f => f.or === 'date.gte.2026-10-01,date.is.null' } });
  await h.ctx.__L();
  const tried = h.db.log.filter(l => l.table === 'appointments' && l.or).map(l => l.or);
  ok(tried[0] === 'date.gte.2026-10-01,date.is.null' && tried[1] === 'date.gte.2026-09-01,date.is.null' && h.ctx.__st().from === '2026-09-01' && h.ev.every(e => e.indexOf('toast:') !== 0),
     '(6) offline + no cached window for this month ⇒ last month\'s saved window is read: ' + tried.join(' | '));
  h = harness(F, mk(), { db: { failIf: f => f.table === 'appointments' && !!f.or } });
  await h.ctx.__L();
  ok(h.db.log.filter(l => l.table === 'appointments' && l.or).length === 1 && h.ev.some(e => e.indexOf('toast:') === 0), '(6) online errors are not retried with another window (only the offline cache case)');
  /* (٧) التزامُ المريض */
  const map = { p1: { level: 2, failures: 3, finished: 4 } };
  h = harness(F, mk(), { reliab: { load: () => Promise.resolve(map) } });
  await h.ctx.__L();
  ok(h.ctx.__st().reliab === map, '(7) reliability comes from SyDentReliability.load with each load');
  const M = F['appt-modal.js'];
  const gr = fnSrc(M, 'function getApptReliabStats(');
  const mctx = { window: { SyDentReliability: { windowStart: () => '2025-11-23', compute: () => ({ p1: { level: 1, partial: true } }) } }, appointments: [], _apptReliab: null, _apptFrom: '2026-10-01', _reliabCache: { src: null, map: {} }, Date, String };
  vm.createContext(mctx); vm.runInContext(gr + '\n' + fnSrc(M, 'function _reliabToday(') + '\nthis.g = getApptReliabStats;', mctx);
  ok(mctx.g('p1') === null, '(7) no map and the window does not cover 12 months ⇒ no badge (never a partial count)');
  mctx._apptFrom = '2025-11-01';
  ok(mctx.g('p1') && mctx.g('p1').partial, '(7) …once the user went back 12 months the loaded rows are enough');
  mctx._apptReliab = map;
  ok(mctx.g('p1') === map.p1, '(7) the loaded map wins');
  /* (٨) التوصيل */
  const V = F['appt-views.js'];
  ok(/_syncTodayBtn\(\);\n  if \(typeof apptCheckRange === 'function'\) apptCheckRange\(\);/.test(fnSrc(V, 'function render(')), '(8) render() checks the range after painting');
  ok(/appointments\.find\(x=>x\.id===id\) \|\| await apptFindById\(id\)/.test(fnSrc(H, 'async function editAppt(')), '(8) editAppt fetches an appointment older than the window');
  const dl = H.indexOf("var _dlIds = [waId, editApptId, qp.get('dismiss')]"), dm = H.indexOf("var matched = appointments.find(function(a){ return a.id === waId; });");
  ok(dl > -1 && dm > dl && /if \(_dlIds\.length\) \{ try \{ await apptEnsureIds\(_dlIds\); \}/.test(H), '(8) deep links (?wa · ?editAppt · ?dismiss) fetch their appointment before matching');
  const P = F['appt-portal.js'];
  ok(/var a = await _portalApptOf\(r\.appointment_id\);/.test(fnSrc(P, 'async function portalReqApprove(')) && /var a = await _portalApptOf\(r\.appointment_id\);/.test(fnSrc(P, 'async function portalReqOpenAppt(')) && /typeof apptFindById === 'function'/.test(fnSrc(P, 'async function _portalApptOf(')),
     '(8) portal requests open an old appointment by id (other pages keep their old lookup)');
  ok(/apptEnsureIds\(_bIds, true\)/.test(fnSrc(F['appt-booking.js'], 'async function loadBookingRequests(')), '(8) confirmed booking requests fetch their linked appointment');
  ok((H.match(/\.from\('appointments'\)\s*\.select\('\*'\)\s*\.eq\('doctor_id', currentUser\.id\)\s*\.order/g) || []).length === 0, '(8) no unbounded read of every appointment is left in the page');
  ok(/id="apptRangeStatus" role="status" aria-live="polite" hidden>/.test(H) && /'جارٍ تحميل مواعيد هذه الفترة': 'Loading this period’s appointments'/.test(read('i18n-en.js')), '(8) the loading line exists (status role) and has its English');
}

const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['first load unbounded again', rep('appointments.html', ".or('date.gte.' + from + ',date.is.null')", '')],
  ['undated appointments dropped', rep('appointments.html', ".or('date.gte.' + from + ',date.is.null')", ".gte('date', from)")],
  ['window starts this month', rep('appointments.html', 'new Date(t.getFullYear(), t.getMonth() - 1, 1)', 'new Date(t.getFullYear(), t.getMonth(), 1)')],
  ['extension asks the whole past', rep('appointments.html', ".gte('date', from).lt('date', upto)", ".lt('date', upto)")],
  ['extension not shared', rep('appointments.html', '  if (_apptExtending && _apptExtending.from <= from) return _apptExtending.p;\n', '')],
  ['window start never moves back', rep('appointments.html', '      if (_apptFrom && upto >= _apptFrom && from < _apptFrom) _apptFrom = from;', '')],
  ['merge duplicates', rep('appointments.html', '!have[r.id] && (have[r.id] = 1)', 'true')],
  ['merge unsorted', rep('appointments.html', 'appointments = appointments.concat(add).sort(_apptCmp);', 'appointments = appointments.concat(add);')],
  ['reload forgets opened months', rep('appointments.html', 'var _from = _apptFrom || _apptDefaultFrom();', 'var _from = _apptDefaultFrom();')],
  ['race loses months', rep('appointments.html', "    _apptMerge(_prevArr.filter(function(a){ return a && a.date && a.date >= _extFrom && a.date < _from; }));\n", '')],
  ['kept ids not re-fetched', rep('appointments.html', '  try { await apptEnsureIds(Object.keys(_apptKeepIds), true); }', '  try { }')],
  ['by-id without clinic', rep('appointments.html', ".select('*').eq('doctor_id', currentUser.id).in('id', part)", ".select('*').in('id', part)")],
  ['planned item judged without its appointment', rep('appointments.html', '      await apptEnsureIds(_needIds, true);\n', '')],
  ['no dimming while loading', rep('appointments.html', "    if (box) box.classList.add('appt-range-loading');\n", '')],
  ['no repaint after loading', rep('appointments.html', "      if (st) st.hidden = true;\n      render();\n", "      if (st) st.hidden = true;\n")],
  ['no background prefetch', rep('appointments.html', '    apptEnsureFrom(prev).catch(function () {});', '')],
  ['week view ignored', rep('appointments.html', "if (view === 'week' && typeof _wkWeekStart === 'function')", "if (false)")],
  ['offline fallback gone', rep('appointments.html', "if (_apRes.error && window.navigator && window.navigator.onLine === false) {", 'if (false) {')],
  ['fallback also online', rep('appointments.html', "if (_apRes.error && window.navigator && window.navigator.onLine === false) {", 'if (_apRes.error) {')],
  ['reliability from the partial array', rep('appt-modal.js', '  if (!covered) return null;\n', '')],
  ['reliability never loaded', rep('appointments.html', '  try { _apptReliab = await _apptReliabPre; }', '  try { }')],
  ['render does not check the range', rep('appt-views.js', "  if (typeof apptCheckRange === 'function') apptCheckRange();", '')],
  ['editAppt lookup local only', rep('appointments.html', 'appointments.find(x=>x.id===id) || await apptFindById(id)', 'appointments.find(x=>x.id===id)')],
  ['deep links not fetched', rep('appointments.html', '    if (_dlIds.length) { try { await apptEnsureIds(_dlIds); }', '    if (false) { try { }')],
  ['portal local lookup', rep('appt-portal.js', "  if (typeof apptFindById === 'function') return apptFindById(apptId);\n", '')]
];
let FINISHED = false;
process.on('exit', code => { if (!FINISHED && code === 0) { console.log('❌ prove-appt-window: توقّف قبل الاكتمال'); process.exitCode = 1; } });
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  let line = '';
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
    line = ' · mutants ' + bit + '/' + MUTANTS.length;
    if (bit !== MUTANTS.length) fail++;
  }
  FINISHED = true;
  console.log((fail === 0 ? '✅' : '❌') + ' prove-appt-window: ' + pass + '/' + (pass + fail) + line);
  process.exitCode = fail === 0 ? 0 : 1;
})();
