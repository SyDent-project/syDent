/* v539 — مثبتُ تبويب «العلاجات» بصفحة التقارير (rpt-treat.js + provider-reports.html) — مستقل، على الملفات الحيّة.
   (١) التصنيفاتُ مرآةٌ حرفية لـCAT_ORDER/CAT_MAP بصفحة العلاجات (تُقرأ من المصدر — #11);
   (٢) هويةُ العلاج مرآةُ sessionTreatmentKey الحقيقية (pp-dental.js) على عيّنةٍ متنوّعة;
   (٣) لا معادلةَ ثانية (#684): مجموعُ الصفوف = إنتاجُ تبويب الأطباء بكل نطاق — كلُّ العيادة (= Σ الجلسات) ·
       طبيبٌ واحد (= computeProviderStats الحقيقية) · نوعُ مزوّد · وضعُ الطبيب المقفول — وبكل طبقة عملة;
   (٤) الرسومُ والرصيدُ السابق يبقيان ضمن المجموع بتصنيفٍ صريح · الفترةُ السابقة بنفس النطاق;
   (٥) الرسم: تهريب · حالةٌ فارغة · رابطُ الإعداد (#696) · ترتيب · (٦) الربط والتصدير والرابط.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
const sum = a => a.reduce((x, s) => x + (Number(s.cost) || 0), 0);
const near = (a, b) => Math.abs(a - b) < 1e-6;

function suite(F) {
  /* ── (١) الوحدة ── */
  const mctx = { console: { warn() {} } };
  vm.createContext(mctx);
  vm.runInContext('var window = this;', mctx);
  try { vm.runInContext(F['rpt-treat.js'], mctx); } catch (e) { ok(false, 'module throws: ' + e.message); return; }
  const T = mctx.SyRptTreat;
  if (!T) { ok(false, 'SyRptTreat missing'); return; }

  const TR = F['treatments.html'];
  const a = TR.indexOf('var CAT_ORDER = ['), b = TR.indexOf('};', TR.indexOf('var CAT_MAP = {', a));
  const cctx = {}; vm.createContext(cctx);
  vm.runInContext(TR.slice(a, b + 2), cctx);
  ok(JSON.stringify(Array.from(T.CAT_ORDER)) === JSON.stringify(Array.from(cctx.CAT_ORDER)), 'categories: order mirrors treatments.html CAT_ORDER');
  ok(JSON.stringify(T.CAT_MAP) === JSON.stringify(cctx.CAT_MAP), 'categories: labels mirror treatments.html CAT_MAP');

  const CAT = [
    { treatment_key: 'crown', name: 'تاج خزف على معدن', label: 'ت', category: 'prosthodontics' },
    { treatment_key: 'zr', name: 'تاج زركون', label: 'ت', category: 'prosth_cosmetic' },
    { treatment_key: 'comp', name: 'حشوة كومبوزت', label: 'ح', category: 'restorative' },
    { treatment_key: 'rct', name: 'معالجة لبية', label: 'ق', category: 'endodontics' },
    { treatment_key: 'odd', name: 'علاج قديم', label: 'ع', category: 'no_such_cat' }
  ];
  const cat = T.catalogOf(CAT);
  const S = (id, extra) => Object.assign({ id, cost: 100, status: 'completed', currency: 'SYP', date: '2026-09-10', patient_id: 'p1' }, extra);
  const idOf = s => T.identify(s, cat);
  ok(idOf(S('a', { treatment_key: 'zr', type: 'اسمٌ آخر' })).key === 'k:zr', 'identity: a catalogue treatment_key wins over the name');
  ok(idOf(S('b', { treatment_key: null, type: 'حشوة كومبوزت' })).key === 'k:comp' && idOf(S('b', { type: 'حشوة كومبوزت' })).cat === 'restorative', 'identity: no key ⇒ matched by name, category from the catalogue');
  ok(idOf(S('c', { treatment_key: 'gone', type: 'معالجة لبية' })).key === 'k:rct', 'identity: a key missing from the catalogue falls back to the name');
  ok(idOf(S('d', { type: 'ق' })).key === 'k:rct', 'identity: the one-letter label also matches (mirror of the source)');
  const un = idOf(S('e', { type: '  أشعة  ' }));
  ok(un.key === 'n:أشعة' && un.cat === T.CAT_UNLINKED && un.name === 'أشعة', 'identity: unknown name ⇒ grouped by the trimmed name, «غير مرتبط»');
  ok(idOf(S('f', { type: '' })).name === 'غير مسمّى', 'identity: empty name ⇒ «غير مسمّى»');
  ok(idOf(S('g', { type: 'علاج قديم' })).cat === 'other', 'identity: an unknown category ⇒ «أخرى»');
  ok(idOf(S('h', { type: 'رصيد سابق (قبل SyDent)' })).cat === T.CAT_FEES && idOf(S('i', { type: 'رسم موعد لم يحضر', description: 'رسم عدم الحضور' })).key === 'fee:noshow', 'identity: opening balance and no-show fee are fees, not treatments');

  /* (٢) مرآةُ sessionTreatmentKey الحقيقية */
  const pctx = { TREATMENTS: CAT.map(t => ({ id: t.treatment_key, name: t.name, label: t.label })) };
  vm.createContext(pctx);
  vm.runInContext('function getTreatment(k){ for (var i=0;i<TREATMENTS.length;i++) if (TREATMENTS[i].id===k) return TREATMENTS[i]; return null; }\n'
    + fnSrc(F['pp-dental.js'], 'function sessionTreatmentKey(sess) {'), pctx);
  const sample = [{ treatment_key: 'zr', type: 'x' }, { type: 'تاج زركون' }, { type: 'ت' }, { treatment_key: 'nope', type: 'معالجة لبية' }, { type: 'ح' }, { type: 'أشعة' }, { treatment_key: 'comp' }];
  ok(sample.every(s => { const k = pctx.sessionTreatmentKey(s); const r = idOf(S('m', s)); return k ? r.key === 'k:' + k : r.cat === T.CAT_UNLINKED; }), 'identity: matches pp-dental sessionTreatmentKey on every sample');

  /* (٣) التجميع */
  const SS = [
    S('1', { type: 'حشوة كومبوزت', cost: '50000' }), S('2', { type: 'حشوة كومبوزت', cost: 49996 }), S('3', { treatment_key: 'zr', type: 'تاج زركون', cost: 300000 }),
    S('4', { type: 'أشعة', cost: 15000 }), S('5', { type: 'رصيد سابق (قبل SyDent)', cost: 10000 }), S('6', { type: 'رسم موعد لم يحضر', description: 'رسم عدم الحضور', cost: 5000 }),
    S('7', { type: 'معالجة لبية', cost: null }), S('8', { type: 'حشوة كومبوزت', cost: 30.5 })];
  const M = T.aggregate(SS, CAT);
  ok(near(M.total.prod, sum(SS)) && M.total.n === SS.length, 'aggregate: total = Σ cost of every session (string/null costs as the engine reads them)');
  ok(near(M.rows.reduce((x, r) => x + r.prod, 0), M.total.prod) && M.rows.reduce((x, r) => x + r.n, 0) === M.total.n, 'aggregate: rows add up to the total');
  ok(near(M.cats.reduce((x, c) => x + c.prod, 0), M.total.prod) && M.cats.reduce((x, c) => x + c.kinds, 0) === M.rows.length, 'aggregate: categories add up to the total and to the kinds');
  const comp = M.rows.find(r => r.key === 'k:comp');
  ok(comp && comp.n === 3 && near(comp.prod, 100026.5) && comp.sessions.length === 3, 'aggregate: one row per treatment with its sessions');
  ok(M.cats[0].prod >= M.cats[M.cats.length - 1].prod, 'aggregate: categories by production');
  ok(M.cats.some(c => c.cat === T.CAT_FEES && c.n === 2 && c.prod === 15000), 'aggregate: fees kept inside the total under their own category');
  ok(T.sortRows(M.rows, 'count')[0].key === 'k:comp' && T.sortRows(M.rows, 'prod')[0].key === 'k:zr', 'sort: by production or by count');

  /* الفترة السابقة */
  const P = T.aggregate([S('p1', { type: 'حشوة كومبوزت', cost: 50000 }), S('p2', { type: 'قلع', cost: 20000 })], CAT);
  T.compare(M, P);
  ok(M.hasPrev && comp.prevN === 1 && comp.prevProd === 50000 && M.rows.find(r => r.key === 'k:zr').prevN === 0, 'compare: previous count/production per treatment (0 when new)');
  ok(M.gone.length === 1 && M.gone[0].name === 'قلع' && M.prevTotal.prod === 70000, 'compare: a treatment done only before is listed, previous total kept');

  /* (٥) الرسم */
  const fmt = n => 'F' + Math.round(n);
  const html = T.render(M, { fmt, sort: 'prod', scopeLabel: 'المنجزة · كل العيادة', cur: 'SYP' });
  ok(html.indexOf('data-rt-key="k:comp"') > -1 && html.indexOf('data-rt-cur="SYP"') > -1, 'render: each row carries its key and currency for the drill-down');
  ok(/<div class="rt-list hp">/.test(html) && /مقابل السابقة/.test(html) && /<span class="rt-d new">جديد<\/span>/.test(html), 'render: previous-period column and «جديد»');
  ok(/href="treatments\.html">راجع صفحة العلاجات/.test(html) && /جلسة واحدة بأسماءٍ غير موجودة/.test(html), 'render: unlinked names point to the treatments page (#696)');
  ok(/لم يُجرَ بهذه الفترة وكان بالسابقة: <b>قلع<\/b> \(1\)/.test(html), 'render: what disappeared since the previous period');
  ok(html.indexOf('F' + Math.round(M.total.prod)) > -1 && />100%</.test(html), 'render: footer total');
  const evil = T.render(T.aggregate([S('x', { type: '<img src=x onerror=alert(1)>' })], CAT), { fmt });
  ok(evil.indexOf('<img') === -1 && evil.indexOf('&lt;img') > -1, 'render: names escaped');
  ok(/لا جلسات بهذه الفترة/.test(T.render(T.aggregate([], CAT), { fmt })), 'render: empty state');
  ok(T.sessWord(1) === 'جلسة واحدة' && T.sessWord(2) === 'جلستان' && T.sessWord(7) === '7 جلسات' && T.sessWord(11) === '11 جلسة', 'Arabic count forms');

  /* ── (٣) التكافؤ مع تبويب الأطباء — دوالُّ الصفحة الحقيقية ── */
  const PR = F['provider-reports.html'];
  const el = { providerFilter: { value: 'all' }, providerTypeFilter: { value: 'all', options: [{ text: 'أطباء فقط' }], selectedIndex: 0 }, inactiveFilter: { value: 'hide' }, statusFilter: { value: 'completed' } };
  const lock = { doctor: null };
  const gctx = {
    console: { warn() {}, error() {} }, Math, Number, String, Object, Array, JSON, Date,
    document: { getElementById: id => el[id] || null },
    window: {}, SyRptTreat: T
  };
  gctx.window.SyRptTreat = T;
  gctx.window.SyDentLock = { isDoctor: () => !!lock.doctor, getEffectiveDoctorId: () => lock.doctor, getDoctorId: () => lock.doctor };
  vm.createContext(gctx);
  const pieces = ['function _rowCur(r)', 'function splitIsEarned(sp) {', 'function providerLabCost(provId) {', 'function computeProviderStats(provId) {',
    'function withCurrencyLayer(cur, fn) {', 'function withCtx(ctx, cur, fn) {', 'function getVisibleDoctors() {', 'function treatScopeSessions() {', 'function _trtModel(cur) {'];
  const code = 'var sessions=[],payments=[],paymentSplits=[],labOrders=[],payouts=[],splitSessionStatus={},doctors=[],prevCtx=null,trtCatalog=null,_renderCur=null;\n'
    + PR.slice(PR.indexOf('function _rowCur(r)'), PR.indexOf('\n', PR.indexOf('function _rowCur(r)'))) + '\n'
    + PR.slice(PR.indexOf('function _filterCur(arr, cur)'), PR.indexOf('\n}\n', PR.indexOf('function _filterCur(arr, cur)')) + 3)
    + pieces.slice(1).map(p => fnSrc(PR, p)).join('\n');
  ok(pieces.slice(1).every(p => fnSrc(PR, p)), 'page: every function the tab relies on is present');
  try { vm.runInContext(code, gctx); } catch (e) { ok(false, 'page functions throw: ' + e.message); return; }
  gctx.window.SyDentCurBag = null;
  vm.runInContext('var window = this.window;', gctx);
  const D = [{ id: 'd1', name: 'د. أ', provider_type: 'doctor' }, { id: 'd2', name: 'ب', provider_type: 'hygienist' }, { id: 'd3', name: 'ج', provider_type: 'doctor', is_active: false }];
  const X = [
    S('s1', { provider_id: 'd1', type: 'حشوة كومبوزت', cost: 50000 }), S('s2', { provider_id: 'd1', type: 'تاج زركون', cost: 300000 }),
    S('s3', { provider_id: 'd2', type: 'حشوة كومبوزت', cost: 40000 }), S('s4', { provider_id: 'd3', type: 'معالجة لبية', cost: 70000 }),
    S('s5', { provider_id: null, type: 'رصيد سابق (قبل SyDent)', cost: 10000 }), S('s6', { provider_id: 'd1', type: 'حشوة كومبوزت', cost: 30, currency: 'USD' })];
  gctx.__D = D; gctx.__X = X; gctx.__CAT = CAT;
  vm.runInContext('doctors = __D; sessions = __X; trtCatalog = SyRptTreat.catalogOf(__CAT);', gctx);
  const model = cur => vm.runInContext('_trtModel(' + JSON.stringify(cur) + ')', gctx);
  const prodOf = (id, cur) => vm.runInContext('(function(){ var p=0; withCurrencyLayer(' + JSON.stringify(cur) + ', function(){ p = computeProviderStats(' + JSON.stringify(id) + ').production; }); return p; })()', gctx);
  const syp = X.filter(s => s.currency !== 'USD');
  const mAll = model('SYP');
  ok(near(mAll.total.prod, sum(syp)) && mAll.total.n === syp.length, 'parity: whole clinic = Σ all sessions of the layer (= «إجمالي الإنتاج»), inactive and unassigned included');
  ok(near(model('USD').total.prod, 30) && model('USD').total.n === 1, 'parity: the dollar layer holds only dollar sessions');
  el.providerFilter.value = 'd1';
  ok(near(model('SYP').total.prod, prodOf('d1', 'SYP')) && model('SYP').total.prod === 350000, 'parity: one doctor = computeProviderStats(d1).production');
  el.providerFilter.value = 'all'; el.providerTypeFilter.value = 'doctor';
  ok(near(model('SYP').total.prod, prodOf('d1', 'SYP')), 'parity: provider type = Σ the visible cards (inactive hidden, unassigned out)');
  el.inactiveFilter.value = 'show';
  ok(near(model('SYP').total.prod, prodOf('d1', 'SYP') + prodOf('d3', 'SYP')), 'parity: showing inactive adds their cards');
  el.inactiveFilter.value = 'hide'; el.providerTypeFilter.value = 'all';
  lock.doctor = 'd2';
  ok(near(model('SYP').total.prod, 40000) && model('SYP').total.n === 1, 'doctor mode: locked to the doctor\'s own sessions even when the filter says «all»');
  lock.doctor = null;
  gctx.__PC = { sessions: [S('q1', { provider_id: 'd1', type: 'تاج زركون', cost: 250000 }), S('q2', { provider_id: 'd2', type: 'حشوة كومبوزت', cost: 1000 }), S('q3', { provider_id: 'd1', type: 'تاج زركون', cost: 9, currency: 'USD' })],
    payments: [], paymentSplits: [], labOrders: [], splitSessionStatus: {} };
  vm.runInContext('prevCtx = __PC;', gctx);
  el.providerFilter.value = 'd1';
  const mp = model('SYP');
  ok(mp.hasPrev && mp.prevTotal.prod === 250000 && mp.rows.find(r => r.key === 'k:zr').prevProd === 250000, 'previous period: same scope (doctor) and same currency layer');
  ok(vm.runInContext('sessions.length', gctx) === X.length && vm.runInContext('_renderCur', gctx) === null, 'context restored after every layer/previous run');
  el.providerFilter.value = 'all';
  vm.runInContext('prevCtx = null;', gctx);

  /* ── (٦) الربط ── */
  const iS = PR.indexOf('<script src="sidebar.js?v='), iR = PR.indexOf('<script src="rpt-treat.js?v='), iIn = PR.indexOf("<script>\n'use strict';");
  ok(iR > iS && iR < iIn && (PR.match(/rpt-treat\.js\?v=/g) || []).length === 1, 'page: rpt-treat.js loaded once, before the inline script');
  ok((F['scripts/cache-bust.sh'].match(/rpt-treat/g) || []).length === 3, 'cache-bust: rpt-treat.js in the fleet allow-list');
  ok(/prevCtx = await fetchCtx\(w\.from, w\.to, statusList, true\)/.test(PR) && /\(withTreat \? ',type,treatment_key,description' : ''\)/.test(PR)
     && /priorCtx = await fetchCtx\(null, _dayShift\(from, -1\), statusList, true\);/.test(PR), 'previous period and the history before it load the session identity (fees are not visits)');
  ok(/render\(\);\n  _prLoaded = true;\n  _newData = null;[^\n]*\n  _attData = null;[^\n]*\n  _retData = null;[^\n]*\n  _sumData = null;[^\n]*\n  renderTreat\(\);/.test(PR), 'wiring: the tab re-renders with every load');
  ok(/if \(rptTab === 'treat'\) return exportTreatExcel\(\);/.test(fnSrc(PR, 'async function exportExcel() {')), 'wiring: Excel follows the visible tab');
  ok(/body:not\(\[data-rpt-tab="prov"\]\) #summaryRow,body:not\(\[data-rpt-tab="prov"\]\) #provList\{display:none !important;\}/.test(PR), 'wiring: the doctors tab hides under any other tab');
  ok(/if \(rptTab !== 'prov'\) q\.set\('tab', rptTab\);/.test(PR) && /if \(_tq && _tq !== 'prov' && Object\.prototype\.hasOwnProperty\.call\(RPT_SUB, _tq\)\) setRptTab\(_tq, true\);/.test(PR), 'wiring: the tab survives in the link');
  ok(/@container \(max-width:620px\)/.test(PR) && /\.rt-host\{container-type:inline-size;\}/.test(PR), 'layout: rows become cards by the section width (#695)');
  ok(/label: 'التقارير', href: 'provider-reports\.html'/.test(F['sidebar.js']), 'sidebar: «التقارير»');
  ok(/<div class="rpt-tabs-wrap"><div class="rpt-tabs" role="tablist"/.test(PR) && /\.rpt-tabs-wrap\{container-type:inline-size;\}/.test(PR)
     && /@container \(max-width:720px\)\{\n  \.rpt-tabs\{display:grid;[^}]*overflow:visible;/.test(PR), 'tabs: every tab visible on a phone — a wrapping grid, never a hidden horizontal scroll (owner photo, v543)');
}

const FILES = ['rpt-treat.js', 'provider-reports.html', 'treatments.html', 'pp-dental.js', 'scripts/cache-bust.sh', 'sidebar.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['category label drift', rep('rpt-treat.js', "'orthodontics':    '⚓ تقويم',", "'orthodontics':    '⚓ تقويم الأسنان',")],
  ['label match dropped', rep('rpt-treat.js', 'if (c.name === s.type || c.label === s.type) { t = c; break; }', 'if (c.name === s.type) { t = c; break; }')],
  ['fees dropped from the total', rep('rpt-treat.js', "var id = identify(s, cat), c = num(s.cost);", "var id = identify(s, cat), c = num(s.cost); if (id.cat === CAT_FEES) return;")],
  ['unknown category not folded', rep('rpt-treat.js', "cat: CAT_MAP[t.category] ? t.category : 'other' };", 'cat: t.category };')],
  ['name unescaped', rep('rpt-treat.js', "'<span class=\"rt-name\"><b>' + esc(r.name) + '</b>", "'<span class=\"rt-name\"><b>' + r.name + '</b>")],
  ['scope ignores the doctor', rep('provider-reports.html', "if (vis.providerFilter === 'all' && (!tf || tf.value === 'all')) return sessions.slice();", 'return sessions.slice();')],
  ['scope filters by the dropdown not the lock', rep('provider-reports.html', "vis.list.forEach(function(d){ out = out.concat(computeProviderStats(d.id).sessions); });", "sessions.forEach(function(s){ if (s.provider_id === document.getElementById('providerFilter').value) out.push(s); });")],
  ['previous period not compared', rep('provider-reports.html', '    window.SyRptTreat.compare(m, pm);', '')],
  ['previous period without the treatment identity', rep('provider-reports.html', 'prevCtx = await fetchCtx(w.from, w.to, statusList, true);', 'prevCtx = await fetchCtx(w.from, w.to, statusList);')],
  ['export ignores the tab', rep('provider-reports.html', "  if (rptTab === 'treat') return exportTreatExcel();   // v539: التصديرُ يتبع التبويبَ الظاهر\n", '')],
  ['sort by count ignored', rep('rpt-treat.js', "if (by === 'count') return", "if (false) return")],
  ['tabs back to a hidden scroll on phones', rep('provider-reports.html', '.rpt-tabs-wrap{container-type:inline-size;}', '.rpt-tabs-wrap{}')],
  ['no setup link', rep('rpt-treat.js', "+ '<a href=\"' + esc(o.treatLink || 'treatments.html') + '\">راجع صفحة العلاجات</a>.</div>';", "+ 'راجع صفحة العلاجات.</div>';")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-treat: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-treat: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
