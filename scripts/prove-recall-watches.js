/* v590 — مثبتُ مراقبات الأسنان بقائمة المتابعة (patients.html + SyDentFetchAll) — مستقل، على الملفات الحيّة بسياق vm.
   الخلل: v548 لفّت قراءةَ teeth_status بـSyDentFetchAll الذي يرتّب بـorder('id') وteeth_status بلا عمود id (مفتاحٌ مركّب)
   ⇒ 42703 صامت ⇒ صفرُ مراقبات بالمتابعة والشارة منذ v548 (بلاغ المالك بصورة، 9 تشرين الأول 2026).
   (١) SyDentFetchAll: أعمدةُ ترتيبٍ اختيارية — تُطبَّق بترتيبها ولا يُستدعى 'id' معها؛ الافتراضي 'id' كما كان · التصفيحُ سليم;
   (٢) patients.html: قراءةُ teeth_status تمرّر ['patient_id','tooth_num','surface'] · الحالاتُ السريرية (COND · SXM · SXD) تُستبعد من المراقبات (تكافؤ بانر البطاقة v430/v580);
   (٣) prmRecallList: صاحبُ المراقبة يظهر ولو حجز موعداً ويحمل تاريخَه (قرار المالك)؛ المتأخرُ عن المراجعة بلا مراقبة يبقى مستثنى بالموعد؛ التهدئةُ كما هي;
   (٤) prmApptExcludedCount يعدّ المتأخرين وحدهم · العرضُ يحمل شارةَ 📅 بتاريخ الموعد.
   --self-test: 8 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function slice(src, fnName) {
  let i = src.indexOf('async function ' + fnName + '(');
  if (i < 0) i = src.indexOf('function ' + fnName + '(');
  if (i < 0) throw new Error('missing ' + fnName);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + fnName);
}
function fetchAllSrc(init) {
  const a = init.indexOf('  window.SyDentFetchAll = async function (build, orderKeys) {'), b = init.indexOf('\n  };\n', a);
  if (a < 0 || b < 0) throw new Error('SyDentFetchAll anchor missing');
  return init.slice(a, b + 5);
}

async function suite(F) {
  const PH = F['patients.html'], INIT = F['supabase-init.js'];
  /* (١) */
  {
    const win = {}; const ctx = { window: win, Array, Promise }; vm.createContext(ctx); vm.runInContext(fetchAllSrc(INIT), ctx);
    const FA = win.SyDentFetchAll;
    const mk = (pages) => { const orders = []; let call = 0; const b = () => ({
      order(k) { orders.push(k); return this; },
      range(lo, hi) { const rows = pages[call++] || []; return Promise.resolve({ data: rows, error: null }); } }); return { b, orders }; };
    let m = mk([[1, 2]]); let r = await FA(m.b);
    ok(r.data.length === 2 && m.orders.join() === 'id', 'fetchall: default order is id (unchanged)');
    m = mk([[1]]); r = await FA(m.b, ['patient_id', 'tooth_num', 'surface']);
    ok(m.orders.join() === 'patient_id,tooth_num,surface' && r.data.length === 1, 'fetchall: composite keys applied in order, id never requested');
    const big = Array.from({ length: 1000 }, (_, i) => i);
    m = mk([big, [7]]); r = await FA(m.b, ['patient_id']);
    ok(r.data.length === 1001 && m.orders.length === 2, 'fetchall: paging still walks pages with custom keys');
    const eb = () => ({ order() { return this; }, range() { return Promise.resolve({ data: null, error: { message: 'x' } }); } });
    r = await FA(eb, 'patient_id');
    ok(r.error && r.data === null, 'fetchall: error surfaces unchanged');
  }
  /* (٢) */
  ok(/window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('teeth_status'\)[\s\S]{0,300}?\.eq\('status', 'condition'\); \}, \['patient_id', 'tooth_num', 'surface'\]\)/.test(PH), 'patients: teeth_status read passes composite order keys');
  ok(/_wRows = _wRows\.filter\(function\(r\)\{ return !prmIsClinicalCondSurface\(r\.surface\); \}\);/.test(PH), 'patients: clinical-condition surfaces filtered out of watches');
  const ctxP = { String, Object, Array, Date, Math, Number, JSON, console: { warn() {} } };
  vm.createContext(ctxP);
  vm.runInContext(slice(PH, 'prmIsClinicalCondSurface'), ctxP);
  ok(['COND', 'SXM', 'SXD'].every(s => ctxP.prmIsClinicalCondSurface(s)) && ['O', 'M', 'WHOLE', 'R1', '', null].every(s => !ctxP.prmIsClinicalCondSurface(s)), 'patients: COND/SXM/SXD are clinical, surfaces are watches');
  /* (٣) */
  const P = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }, { id: 'e', name: 'E' }];
  const ctx = {
    String, Object, Array, Date, Math, Number, JSON,
    patients: P, _prmFind: id => P.find(p => p.id === id) || null,
    lastVisitMap: { a: '2026-01-01', b: '2026-01-01', c: '2026-09-30', d: '2026-01-01', e: '2026-01-01' },
    prmThresholdDate: () => '2026-09-08',
    PRM_COOLDOWN_DAYS: 30,
    prmRecentRecalls: { e: Date.now() },
    prmUpcomingApptPatients: { a: '2026-10-20', b: '2026-10-15', c: '2026-11-01' },
    prmDueWatches: { b: [{ tooth_num: '25', surface: 'O', review_at: '2026-09-01' }], e: [{ tooth_num: '11', surface: 'O', review_at: '2026-09-01' }] },
    prmSoonWatches: { c: [{ tooth_num: '37', surface: 'O', review_at: '2027-01-07' }], d: [{ tooth_num: '46', surface: 'O', review_at: null }] },
    prmPostRecallWatch: {}
  };
  vm.createContext(ctx);
  vm.runInContext(slice(PH, 'prmRecallList') + '\n' + slice(PH, 'prmApptExcludedCount'), ctx);
  const L = ctx.prmRecallList();
  const ids = L.map(r => r.p.id);
  ok(!ids.includes('a'), 'list: lapsed-visit patient with an upcoming appointment is still excluded (nothing to recall)');
  const rb = L.find(r => r.p.id === 'b');
  ok(rb && rb.watch && rb.watch.length === 1 && rb.appt === '2026-10-15' && !rb.soonOnly, 'list: due-watch patient WITH appointment is listed, carrying the appointment date');
  const rc = L.find(r => r.p.id === 'c');
  ok(rc && rc.soonOnly && rc.soon.length === 1 && rc.appt === '2026-11-01', 'list: upcoming-watch patient with appointment is listed (soon section) with its date');
  const rd = L.find(r => r.p.id === 'd');
  ok(rd && rd.watch === undefined && rd.soon && !rd.appt, 'list: lapsed patient without appointment carries soon-watch, appt null');
  ok(!ids.includes('e'), 'list: cooldown («تم») still hides a watch that was standing at recall time');
  ok(ids.indexOf('b') < ids.indexOf('c'), 'list: due rows precede the soon section');
  /* (٤) */
  ok(ctx.prmApptExcludedCount() === 1, 'excluded count: only the lapsed-visit patient (a); watch owners b/c are shown, not counted');
  ok(/if \(r\.appt\) \{\s*sub = '<b style="color:var\(--green,#2ee89e\);">📅 عنده موعد قادم ' \+ prmEsc\(prmFmtNum\(r\.appt\)\) \+ '<\/b> · ' \+ sub;/.test(PH), 'render: 📅 badge with the appointment date on the row');
  ok(/أصحاب المراقبات يظهرون مع موعدهم 📅/.test(PH), 'render: header explains the new rule');
  ok(/\.select\('patient_id, date'\)[\s\S]{0,200}\.gte\('date', todayStr\)/.test(PH) && /if \(!cur \|\| d < cur\) prmUpcomingApptPatients\[r\.patient_id\] = d;/.test(PH), 'load: earliest upcoming appointment date kept per patient');
  /* (٥) v591 — مراجعةُ المتابعة الموسّعة */
  const ctx5 = { String, Object, Array, Date, Math, Number, JSON, PRM_RECALL_MONTHS: 1 };
  vm.createContext(ctx5);
  vm.runInContext(slice(PH, 'prmYmdLocal') + '\n' + slice(PH, 'prmThresholdDate') + '\n' + slice(PH, 'prmDaysUntilBirthday'), ctx5);
  ok(ctx5.prmThresholdDate(new Date(2026, 9, 31)) === '2026-09-30', 'threshold: 31 Oct − 1 month = 30 Sep (no overflow to 1 Oct)');
  ok(ctx5.prmThresholdDate(new Date(2026, 9, 9)) === '2026-09-09', 'threshold: ordinary day keeps the day');
  ctx5.PRM_RECALL_MONTHS = 6;
  ok(ctx5.prmThresholdDate(new Date(2026, 7, 31)) === '2026-02-28', 'threshold: 31 Aug − 6 months = 28 Feb');
  ok(ctx5.prmDaysUntilBirthday('1990-10-12', new Date(2026, 9, 9)) === 3 && ctx5.prmDaysUntilBirthday('1990-10-09', new Date(2026, 9, 9)) === 0, 'birthday: parsed from the string, 3 days / today');
  ok(ctx5.prmDaysUntilBirthday('1992-02-29', new Date(2026, 1, 27)) === 1 && ctx5.prmDaysUntilBirthday('1992-02-29', new Date(2026, 1, 28)) === 0, 'birthday: 29 Feb falls on 28 Feb in a non-leap year');
  ok(ctx5.prmDaysUntilBirthday('1990-10-08', new Date(2026, 9, 9)) === 364 && ctx5.prmDaysUntilBirthday('bad', new Date()) === null && ctx5.prmDaysUntilBirthday('', new Date()) === null, 'birthday: yesterday → next year; junk → null');
  ok(/window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('patient_recalls'\)[\s\S]{0,160}\.gte\('recalled_at', since\); \}\);/.test(PH) && /\(\(PRM_COOLDOWN_DAYS \|\| 30\) \+ 1\) \* 86400000/.test(PH), 'cooldown: recall log read paged and windowed to the cooldown');
  /* markRecalled: rollback on failure, single flight */
  for (const fails of [false, true]) {
    const writes = []; let rendered = 0; const toasts = [];
    const c6 = { String, Object, Array, Date, Math, Number, JSON, console: { warn() {} },
      window: { sb: { from: () => ({ insert: r => { writes.push(r); return Promise.resolve(fails ? { error: { message: 'x' } } : { error: null }); } }) } },
      currentUser: { id: 'doc' }, _prmFind: id => ({ id }), prmRecentRecalls: {}, prmPostRecallWatch: { a: { '25|O': 1 } },
      renderPrmRecall: () => { rendered++; }, renderPrmNoShow: () => {}, updatePrmBadge: () => {}, showToast: m => toasts.push(m) };
    vm.createContext(c6); vm.runInContext(slice(PH, 'prmMarkRecalled'), c6);
    await Promise.all([c6.prmMarkRecalled('a'), c6.prmMarkRecalled('a')]);
    if (!fails) ok(writes.length === 1 && c6.prmRecentRecalls.a > 0 && c6.prmPostRecallWatch.a === undefined && rendered === 1, 'markRecalled: double click → one insert, cooldown set, exemptions cleared');
    else ok(writes.length === 1 && c6.prmRecentRecalls.a === undefined && c6.prmPostRecallWatch.a && rendered === 2 && /تعذّر/.test(toasts[0]), 'markRecalled: insert failure rolls back cooldown + exemptions and re-renders');
  }
}

(async () => {
  const F = { 'patients.html': read('patients.html'), 'supabase-init.js': read('supabase-init.js') };
  await suite(F);
  const base = { pass, fail };
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['order keys dropped (the v548 bug)', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace(".eq('status', 'condition'); }, ['patient_id', 'tooth_num', 'surface']);", ".eq('status', 'condition'); });") })],
      ['fetchall ignores keys', G => Object.assign({}, G, { 'supabase-init.js': G['supabase-init.js'].replace("var keys = Array.isArray(orderKeys) ? orderKeys : [orderKeys || 'id'];", "var keys = ['id'];") })],
      ['clinical conditions back in watches', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("_wRows = _wRows.filter(function(r){ return !prmIsClinicalCondSurface(r.surface); });", "") })],
      ['watch owner hidden by appointment again', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("    out.push({ p: p, lastVisit: lastVisitMap[pid] || '', watch: wsD, appt: prmUpcomingApptPatients[pid] || null });", "    if (prmUpcomingApptPatients[pid]) return;\n    out.push({ p: p, lastVisit: lastVisitMap[pid] || '', watch: wsD, appt: prmUpcomingApptPatients[pid] || null });") })],
      ['excluded count counts watch owners', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("if (lv && String(lv) <= th && !(prmDueWatches || {})[pid] && !(prmSoonWatches || {})[pid]) n++;", "if ((lv && String(lv) <= th) || (prmDueWatches || {})[pid] || (prmSoonWatches || {})[pid]) n++;") })],
      ['badge removed', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("if (r.appt) {\n        sub = '<b style=\"color:var(--green,#2ee89e);\">📅 عنده موعد قادم ' + prmEsc(prmFmtNum(r.appt)) + '</b> · ' + sub;\n      }", "") })],
      ['threshold overflow back', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("d.setDate(1); d.setMonth(d.getMonth() - (PRM_RECALL_MONTHS || 6));\n  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();\n  d.setDate(Math.min(day, last));", "d.setMonth(d.getMonth() - (PRM_RECALL_MONTHS || 6));") })],
      ['markRecalled no rollback', G => Object.assign({}, G, { 'patients.html': G['patients.html'].replace("if (_prevRecall === undefined) delete prmRecentRecalls[id]; else prmRecentRecalls[id] = _prevRecall;", "") })]
    ];
    let bit = 0;
    for (const [name, m] of muts) {
      const G = m(F);
      if (G['patients.html'] === F['patients.html'] && G['supabase-init.js'] === F['supabase-init.js']) { console.log('MUTATION NOT APPLIED:', name); continue; }
      const before = fail; const log = console.log; console.log = () => {};
      try { await suite(G); } catch (e) { fail++; }
      console.log = log;
      if (fail > before) bit++; else log('MUTATION SURVIVED:', name);
    }
    fail = base.fail; pass = base.pass;
    if (bit !== muts.length) { console.log('prove-recall-watches: self-test ' + bit + '/' + muts.length + ' mutations bit'); process.exit(1); }
    console.log('prove-recall-watches: ' + pass + '/' + (pass + fail) + ' passed · ' + bit + '/' + muts.length + ' mutations bit' + (fail ? ' ✗' : ' ✓'));
  } else console.log('prove-recall-watches: ' + pass + '/' + (pass + fail) + ' passed' + (fail ? ' ✗' : ' ✓'));
  process.exit(fail ? 1 : 0);
})();
