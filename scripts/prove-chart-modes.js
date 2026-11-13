#!/usr/bin/env node
/* v712 — مثبتُ شريطَي الفحص الأولي والتحديد المتعدد على الكود الحيّ (pp-modules.js · pp-dental.js ·
   patient-profile.html · patient-profile.css). بلاغُ المالك بثلاث صور (13/11/2026):
   ① التحديد المتعدد: «موجود — من عيادتنا / من عيادة أخرى» بجانب منجز/مخطط — توثيقٌ على المخطط بلا جلسةٍ
      ولا إعادةِ توزيعٍ ولا مساسٍ بآخر زيارة (البوابةُ المالية: completed/planned وحدهما).
   ② الشريطان يبقيان مكانهما فوق المخطط (لا sticky)، والسطرُ الرفيع #modeMini وحده يرافق التمرير.
   ③ فلترُ التصنيفات (شرائح مودال السن) فوق «علاجات العيادة» بالوضعين، والتحديدُ المتعدد بعرض الفحص نفسه.
   jsdom على عُدّة dom-smoke الحقيقية + قاعدةٍ وهمية؛ و--self-test طفراتٌ يجب أن تعضّ كلُّها (#342). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت أوضاع المخطط (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const FILES = ['pp-dental.js', 'pp-modules.js', 'pp-core.js', 'pp-clinical.js', 'pp-wa.js', 'patient-profile.html', 'patient-profile.css'];
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

const FAKE_DB = `
  window.__DB = { teeth_status: [], ledger_sessions: [], patients: [{ id: 'pat-1', doctor_id: 'doc-1' }] };
  window.__OPS = []; window.__SID = 0;
  (function(){
    function pk(r){ return [r.doctor_id, r.patient_id, String(r.tooth_num), r.surface].join('|'); }
    function match(row, fs){ for (var i = 0; i < fs.length; i++) { var f = fs[i], v = row[f[1]];
        if (f[0] === 'eq' && String(v) !== String(f[2])) return false;
        if (f[0] === 'neq' && String(v) === String(f[2])) return false;
        if (f[0] === 'in' && f[2].map(String).indexOf(String(v)) === -1) return false; }
      return true; }
    function run(st){
      window.__OPS.push(JSON.parse(JSON.stringify({ table: st.table, op: st.op, payload: st.payload })));
      var T = window.__DB[st.table] || (window.__DB[st.table] = []);
      if (st.op === 'insert') { var rows = Array.isArray(st.payload) ? st.payload : [st.payload], made = [];
        rows.forEach(function(r){ var c = JSON.parse(JSON.stringify(r)); if (!c.id) c.id = 'sess-' + (++window.__SID); T.push(c); made.push(c); });
        return { data: st.single ? made[0] : made, error: null }; }
      if (st.op === 'upsert') { var ur = Array.isArray(st.payload) ? st.payload : [st.payload];
        ur.forEach(function(r){ var c = JSON.parse(JSON.stringify(r)), hit = -1;
          for (var i = 0; i < T.length; i++) if (st.table === 'teeth_status' && pk(T[i]) === pk(c)) hit = i;
          if (hit > -1) T[hit] = Object.assign({}, T[hit], c); else T.push(c); });
        return { data: ur, error: null }; }
      var hits = T.filter(function(r){ return match(r, st.filters); });
      if (st.op === 'update') { hits.forEach(function(r){ Object.assign(r, st.payload); }); return { data: hits, error: null }; }
      if (st.op === 'delete') { window.__DB[st.table] = T.filter(function(r){ return !match(r, st.filters); }); return { data: hits, error: null }; }
      return { data: st.single ? (hits[0] || null) : JSON.parse(JSON.stringify(hits)), error: null };
    }
    function Q(table){ var st = { table: table, op: 'select', filters: [], payload: null, single: false };
      var api = {
        insert: function(p){ st.op = 'insert'; st.payload = p; return api; }, upsert: function(p){ st.op = 'upsert'; st.payload = p; return api; },
        update: function(p){ st.op = 'update'; st.payload = p; return api; }, delete: function(){ st.op = 'delete'; return api; },
        select: function(){ return api; }, single: function(){ st.single = true; return api; }, maybeSingle: function(){ st.single = true; return api; },
        eq: function(k, v){ st.filters.push(['eq', k, v]); return api; }, neq: function(k, v){ st.filters.push(['neq', k, v]); return api; },
        in: function(k, v){ st.filters.push(['in', k, v]); return api; }, not: function(){ return api; },
        order: function(){ return api; }, limit: function(){ return api; }, or: function(){ return api; }, range: function(){ return api; },
        then: function(res, rej){ return Promise.resolve().then(function(){ return run(st); }).then(res, rej); }
      }; return api; }
    window.sb = { from: Q, rpc: function(){ return Promise.resolve({ data: null, error: null }); } };
  })();
  window.SyDialog = { confirm: function(){ return Promise.resolve(true); } };
  window.__REALLOC = 0; reallocatePatientFunds = function(){ window.__REALLOC++; return Promise.resolve(); };
  window.logAudit = function(){};
  window.__MAT = 0; maybePromptMaterialDeduction = function(){ window.__MAT++; return Promise.resolve(); };
  openLabOrderModal = function(){};
  function _rowLbl(){ return 'ل.س'; } function curLblOf(){ return 'ل.س'; } function fmt(n){ return String(n); }
`;

/* الشريطان والسطرُ الرفيع يُقتطعان من الصفحة الحيّة نفسها (العُدّة لا تحمل شريط الدفعة) */
function sliceBars(PP) {
  const a = PP.indexOf('<div class="batch-bar" id="batchBar">'), b = PP.indexOf('<!-- E: read-only historical chart bar -->');
  if (a < 0 || b < a) throw new Error('batchBar: الاقتطاعُ فشل');
  return PP.slice(a, b);
}
function page(over) {
  const src = f => (over && over[f] != null) ? over[f] : LIVE[f];
  let html = HARNESS.replace(/<link rel="stylesheet"[^>]*>/g, '');
  html = html.replace('<div id="chartLegend"></div>', '<div id="chartLegend"></div>' + sliceBars(src('patient-profile.html')));
  html = html.replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + src(path.relative(ROOT, f)).replace(/<\/script/gi, '<\\/script') + '</script>');
  return html.replace('</body>', '<script>' + FAKE_DB + '</script></body>');
}
function boot(over) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(page(over), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

/* ── (١) العقدُ الثابت: CSS والصفحة ── */
function staticChecks(over) {
  const F = f => (over && over[f] != null) ? over[f] : LIVE[f];
  const C = F('patient-profile.css'), H = F('patient-profile.html'), r = {};
  const rule = sel => { const m = C.match(new RegExp('(?:^|\\n)' + sel.replace(/[.#]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
  r.barsNotSticky = /position:static/.test(rule('.exam-bar')) && /position:static/.test(rule('.batch-bar')) && !/sticky/.test(rule('.exam-bar') + rule('.batch-bar'));
  r.miniSticky = /display:none/.test(rule('.mode-mini')) && /position:sticky;top:calc\(var\(--pp-ma-h,0px\) \+ 8px\)/.test(rule('.mode-mini'))
    && /body\.exam-on \.mode-mini\{display:flex/.test(C) && /body\.batch-on \.mode-mini\{display:flex/.test(C);
  /* v714: داخل الوضعين رأسُ الصفحة لا يلصق (كان يتراكب مع السطر الرفيع)، والتحذيرُ الطبي بأعلى الشاشة؛ وأزرارُ الرأس مجموعةٌ واحدة */
  r.headerStaticInModes = C.indexOf('body.exam-on .topbar,body.batch-on .topbar{position:static;}') > -1 && C.indexOf('body.exam-on .pp-med-alert,body.batch-on .pp-med-alert{top:0;}') > -1
    && /setProperty\('--pp-ma-h', \(el\.hidden \? 0 : el\.offsetHeight\) \+ 'px'\)/.test(H);
  const grp = id => { const i = H.indexOf('id="' + id + '"'), j = H.indexOf('<ol class="mode-steps"', i), seg = H.slice(i, j), k = seg.indexOf('<span class="mode-actions">'); const e = seg.indexOf('</span>', k), x = seg.indexOf('class="exam-btn exit"'); return k > -1 && x > k && x < e && seg.slice(0, k).indexOf('exam-btn') === -1 && seg.slice(e).indexOf('exam-btn') === -1; };
  r.actionsGrouped = grp('examBar') && grp('batchBar') && /\.mode-actions\{[^}]*margin-inline-start:auto/.test(C);
  r.sectionsBoxed = /\.exam-bar \.exam-row,\.batch-bar \.exam-row,\.exam-bar \.exam-cond-row\{[^}]*border:1px solid var\(--border\)/.test(C) && /#examStatusRow\{border-inline-start/.test(C) && /#batchStatusRow\{border-inline-start/.test(C);
  const iBatch = H.indexOf('id="batchBar"'), iExam = H.indexOf('id="examBar"'), iMini = H.indexOf('id="modeMini"'), iJaw = H.indexOf('id="jawWrap"');
  r.miniBetweenBarsAndChart = iExam > 0 && iBatch > iExam && iMini > iBatch && iJaw > iMini;
  r.statusScope = C.indexOf('body.batch-on #toothStatusPicker .status-opt:not([data-status="completed"]):not([data-status="planned"]):not([data-status="existing_current"]):not([data-status="existing_other"]){display:none;}') > -1;
  r.docCssScopedToBatch = /body\.batch-on #toothStep2\[data-batch-doc="1"\] \.tu-row/.test(C) && /body\.batch-on #toothStep2\[data-batch-doc="1"\] \.form-group:has\(> #toothDate\)/.test(C)
    && !/(^|[,\n])#toothStep2\[data-batch-doc/.test(C) && C.indexOf('[data-batch-doc="1"] #providerPickerGroup') === -1;
  r.sameLayout = /id="batchStatusRow"><span class="exam-row-lbl">📌 الحالة<\/span><div class="exam-chips" id="batchStatusChips">/.test(H)
    && /<div class="exam-tx-wrap"><div class="tx-tabs mode-tx-tabs" id="batchTxTabs"><\/div><div class="exam-palette" id="batchPalette">/.test(H)
    && /<div class="exam-tx-wrap"><div class="tx-tabs mode-tx-tabs" id="examTxTabs"><\/div><div class="exam-palette" id="examPalette">/.test(H);
  return r;
}

const T = (id, name, tp, cat, fav) => ({ treatment_key: id, id, name, label: name[0], fill: '#60a5fa', stroke: '#1d4ed8', price: 50000, target_part: tp, category: cat, is_active: true, is_favorite: !!fav, currency: 'SYP', price_overrides: {} });
const EXTRA = [T('t-endo', 'معالجة لبية تجريبية', 'root', 'endodontics'), T('t-diag', 'أشعة تجريبية', 'whole', 'diagnostic'), T('t-odd', 'علاج بلا تصنيف معروف', 'crown', 'zzz-unknown'),
  T('t-cos', 'تجميل تجريبي', 'crown', 'cosmetic')];

async function behave(w) {
  const r = {}, doc = w.document, $ = id => doc.getElementById(id);
  const tick = ms => new Promise(res => setTimeout(res, ms || 0));
  EXTRA.forEach(t => w.TREATMENTS.push(JSON.parse(JSON.stringify(t))));
  const tabsOf = id => Array.from($(id).querySelectorAll('.tx-tab')).map(b => b.getAttribute('data-modetab'));
  const active = id => { const b = $(id).querySelector('.tx-tab-active'); return b ? b.getAttribute('data-modetab') : null; };
  const names = id => Array.from($(id).querySelectorAll('.exam-tx')).map(b => b.textContent.trim());
  const reset = () => { w.__DB.teeth_status = []; w.__DB.ledger_sessions = []; w.__OPS = []; w.__TOASTS.length = 0; w.__REALLOC = 0; w.__MAT = 0;
    w.eval('teethMap = {}; sessions = []; window.teethDx = {}; patient.last_visit = null; patient.status = "جديد";'); };
  const toasts = () => w.__TOASTS.join(' | ');
  w.localStorage.removeItem('sydent_tx_usage');

  /* ── ③ الفحص الأولي: الشرائح والفلتر ── */
  w.eval('window.__examMode = true; examSelectedKey = null; examStatus = "existing_other"; modeTxTab.exam = null;');
  w.renderExamBar();
  const et = tabsOf('examTxTabs');
  r.examTabsOrder = et.join(',') === 'starred,fav,diagnostic,restorative,endodontics,surgical,prosthodontics,cosmetic,other';
  r.examDefaultStarred = active('examTxTabs') === 'starred' && names('examPalette').join('|') === 'حشوة كومبوزت|قلع';
  r.examNoConditionTab = et.indexOf('condition') === -1 && names('examPalette').every(n => names('examCondPalette').indexOf(n) === -1) && names('examCondPalette').length > 0;
  $('examTxTabs').querySelector('[data-modetab="surgical"]').click();
  r.examCategoryOnly = active('examTxTabs') === 'surgical' && names('examPalette').join('|') === 'قلع';
  $('examTxTabs').querySelector('[data-modetab="fav"]').click();
  r.examCommonAllWhenNoUsage = names('examPalette').length === w.eval('TREATMENTS.filter(function(t){ return t.is_active !== false; }).length');
  w.localStorage.setItem('sydent_tx_usage', JSON.stringify({ 't-endo': 5, 'crown': 2 }));
  w.renderExamBar();
  r.examCommonRanked = names('examPalette').join('|') === 'معالجة لبية تجريبية|تاج';
  w.localStorage.removeItem('sydent_tx_usage');
  $('examTxTabs').querySelector('[data-modetab="other"]').click();
  r.unknownCategoryUnderOther = names('examPalette').join('|') === 'علاج بلا تصنيف معروف';
  /* الاختيارُ يبقى عند تبديل الشريحة، والسطرُ الرفيع يذكره */
  $('examTxTabs').querySelector('[data-modetab="endodontics"]').click();
  $('examPalette').querySelector('.exam-tx').click();
  $('examTxTabs').querySelector('[data-modetab="surgical"]').click();
  r.examPickSurvivesTab = w.eval('examSelectedKey') === 't-endo' && !$('examPalette').querySelector('.exam-tx.selected');
  r.miniExam = $('modeMiniSel').textContent === '🩺 فحص أولي · موجود — من عيادة أخرى · معالجة لبية تجريبية' && $('modeMiniCount').textContent === 'وُسم: 0'
    && $('modeMiniSw').style.display === 'inline-block';
  w.eval('examSelectedKey = null; renderExamBar();');
  r.miniExamEmpty = /اختر علاجاً من الشريط$/.test($('modeMiniSel').textContent) && $('modeMiniSw').style.display === 'none';
  /* كلُّ دخولٍ يبدأ من أول شريحة */
  w.eval('window.__examMode = false; modeTxTab.exam = "surgical";');
  await w.toggleExamMode(); await tick(5);
  r.examEntryResetsTab = w.eval('window.__examMode') === true && active('examTxTabs') === 'starred';
  await w.toggleExamMode();

  /* ── ①③ التحديد المتعدد: الحالاتُ الأربع والفلتر ── */
  reset();
  w.toggleBatchMode(); await tick(20);
  const chips = Array.from($('batchStatusChips').querySelectorAll('.exam-chip')).map(b => b.textContent.trim());
  r.batchFourStatuses = chips.join('|') === 'منجز|مخطط|موجود — من عيادتنا|موجود — من عيادة أخرى' && $('batchStatusChips').querySelector('.selected').textContent.trim() === 'منجز'
    && $('batchDocNote').style.display === 'none';
  r.batchTabs = tabsOf('batchTxTabs').join(',') === 'starred,fav,diagnostic,restorative,endodontics,surgical,prosthodontics,cosmetic,other' && active('batchTxTabs') === 'starred';
  $('batchTxTabs').querySelector('[data-modetab="restorative"]').click();
  r.batchCategoryOnly = names('batchPalette').join('|') === 'حشوة كومبوزت';
  w.batchSetStatus('condition'); w.batchSetStatus('referred');
  r.batchRejectsOtherStatuses = w.eval('batchDefaultStatus') === 'completed';
  $('batchStatusChips').querySelectorAll('.exam-chip')[3].click();
  r.batchDocNoteShown = w.eval('batchDefaultStatus') === 'existing_other' && $('batchDocNote').style.display !== 'none';

  /* ── ① «موجود — من عيادة أخرى»: حشوةٌ على سطحَي 16 وسطح 26 ⇒ صفّان بالمخطط، صفرُ جلسة ── */
  $('batchPalette').querySelector('.exam-tx').click();
  w.batchToggleAt(16, 'O'); w.batchToggleAt(16, 'M'); w.batchToggleAt(26, 'O');
  r.miniBatch = $('modeMiniSel').textContent === '☑️ تحديد متعدد · موجود — من عيادة أخرى · حشوة كومبوزت' && $('modeMiniCount').textContent === 'جلسات: 2';
  w.batchApply(); await tick(5);
  const st2 = $('toothStep2'), saveBtn = doc.querySelector('#toothFoot .btn-save-m');
  r.docModal = $('toothModal').classList.contains('open') && st2.getAttribute('data-batch-doc') === '1' && saveBtn.textContent === 'حفظ'
    && $('toothCost').value === '0' && /موجود مسبقاً على 2 مواضع · توثيق بلا تكلفة/.test($('toothStep2Title').textContent)
    && w.eval('pendingTreatStatus') === 'existing_other' && $('batchLabBtn').style.display === 'none';
  /* التبديلُ داخل المودال: منجز ⇒ يعود مودالَ جلسة بسعره، ثم «من عيادتنا» ⇒ توثيق */
  w.pickStatus('completed');
  r.docToSession = !st2.hasAttribute('data-batch-doc') && saveBtn.textContent === 'حفظ كجلسة' && $('toothCost').value === '60000' && /2 جلسات/.test($('toothStep2Title').textContent);
  w.pickStatus('existing_current');
  r.sessionToDoc = st2.getAttribute('data-batch-doc') === '1' && saveBtn.textContent === 'حفظ' && $('toothCost').value === '0';
  w.pickStatus('existing_other');
  $('toothCost').value = '99999';   /* حتى لو وصل رقمٌ من الحقل — لا سطرَ مالياً */
  await w.saveToothTreatment(); await tick(10);
  const ts = w.__DB.teeth_status;
  r.docWritesChartOnly = ts.length === 2 && ts.every(x => x.status === 'existing_other' && x.treatment_key === 'custom_1781292854422')
    && ts.map(x => x.tooth_num + ':' + x.surface).sort().join(',') === '16:MO,26:O'
    && w.__DB.ledger_sessions.length === 0 && w.__OPS.filter(o => o.table === 'ledger_sessions').length === 0;
  r.docNoMoneySideEffects = w.__REALLOC === 0 && w.__MAT === 0 && w.__OPS.filter(o => o.table === 'patients').length === 0
    && w.eval('patient.status') === 'جديد' && w.eval('patient.last_visit') === null && w.eval('sessions.length') === 0;
  r.docToast = /وُثّق حشوة كومبوزت كموجودٍ مسبقاً على 2 مواضع — بلا تكلفة/.test(toasts()) && !/جلسة لكل سن/.test(toasts());
  r.docStaysInMode = w.eval('window.__batchMode') === true && w.eval('batchSel.length') === 0 && !$('toothModal').classList.contains('open')
    && w.eval('teethMap["16"].__status.MO') === 'existing_other';

  /* ── قلعٌ «موجود — من عيادتنا» بالدفعة: السنُّ مقلوع على المخطط بلا جلسة ── */
  reset();
  w.batchSetStatus('existing_current');
  $('batchTxTabs').querySelector('[data-modetab="surgical"]').click();
  $('batchPalette').querySelector('.exam-tx').click();
  w.batchToggleAt(18, 'O'); w.batchApply(); await tick(5);
  await w.saveToothTreatment(); await tick(10);
  r.docExtraction = w.__DB.teeth_status.length === 1 && w.__DB.teeth_status[0].surface === 'WHOLE' && w.__DB.teeth_status[0].status === 'existing_current'
    && w.__DB.ledger_sessions.length === 0 && w.isExtracted(18) === true;

  /* ── الانحدار: «منجز» ما زال جلسةً لكل وحدة بكل آثارها ── */
  reset();
  w.batchSetStatus('completed');
  $('batchTxTabs').querySelector('[data-modetab="restorative"]').click();
  $('batchPalette').querySelector('.exam-tx').click();
  w.batchToggleAt(36, 'O'); w.batchToggleAt(46, 'O'); w.batchApply(); await tick(5);
  r.sessionModalUntouched = !st2.hasAttribute('data-batch-doc') && saveBtn.textContent === 'حفظ كجلسة' && $('toothCost').value === '60000';
  await w.saveToothTreatment(); await tick(10);
  const ls = w.__DB.ledger_sessions;
  r.completedStillBills = ls.length === 2 && ls.every(x => x.status === 'completed' && x.cost === 60000) && w.__REALLOC === 1 && w.__MAT === 1
    && w.eval('patient.status') === 'تحت العلاج' && w.__DB.teeth_status.length === 2 && /جلسة لكل سن/.test(toasts());
  reset();
  w.batchSetStatus('planned');
  $('batchPalette').querySelector('.exam-tx').click();
  w.batchToggleAt(36, 'O'); w.batchApply(); await tick(5); await w.saveToothTreatment(); await tick(10);
  r.plannedStillBills = w.__DB.ledger_sessions.length === 1 && w.__DB.ledger_sessions[0].status === 'planned' && w.__MAT === 0;

  /* ── الخروجُ من الوضع ينظّف مظهرَ التوثيق ── */
  w.batchSetStatus('existing_other');
  $('batchPalette').querySelector('.exam-tx').click();
  w.batchToggleAt(37, 'O'); w.batchApply(); await tick(5);
  const wasDoc = st2.getAttribute('data-batch-doc') === '1';
  w.closeModal('toothModal'); w.toggleBatchMode();
  r.exitCleansDocUi = wasDoc && !st2.hasAttribute('data-batch-doc') && saveBtn.textContent === 'حفظ كجلسة' && w.eval('window.__batchMode') === false;
  w.toggleBatchMode(); await tick(20);
  r.batchEntryResets = w.eval('batchDefaultStatus') === 'completed' && active('batchTxTabs') === 'starred' && $('batchDocNote').style.display === 'none';
  w.toggleBatchMode();
  r.noJsErrors = (w.__ERRORS || []).length === 0;
  if (!r.noJsErrors) console.error('JS errors:', (w.__ERRORS || []).slice(0, 4));
  return r;
}

async function runAll(over) {
  const st = staticChecks(over);
  let bh = {};
  try { bh = await behave(await boot(over)); } catch (e) { bh = { crashed: false }; if (process.argv.indexOf('--verbose') > -1) console.error(e); }
  return Object.assign({}, st, bh);
}

(async () => {
  const res = await runAll(null);
  const keys = Object.keys(res), bad = keys.filter(k => !res[k]);
  if (process.argv.indexOf('--verbose') > -1 || bad.length) keys.forEach(k => console.log((res[k] ? '  ✓ ' : '  ✗ ') + k));
  if (bad.length) { console.log(`⛔ prove-chart-modes: ${keys.length - bad.length}/${keys.length}`); process.exit(1); }
  if (process.argv.indexOf('--self-test') === -1) { console.log(`✅ prove-chart-modes: ${keys.length}/${keys.length} توكيداً`); return; }

  const PM = 'pp-modules.js', PD = 'pp-dental.js', CSS = 'patient-profile.css', PH = 'patient-profile.html';
  const MUT = [
    ['existing-creates-session', PD, "if (pendingTreatStatus !== 'completed' && pendingTreatStatus !== 'planned') { _bCreated++; continue; }", ''],
    ['doc-touches-patient', PD, "if (!_bDoc && patient.status === 'جديد') _bUpd.status = 'تحت العلاج';", "if (patient.status === 'جديد') _bUpd.status = 'تحت العلاج';"],
    ['doc-toast-says-session', PD, "} else if (_bCreated && _bDoc) {", "} else if (false) {"],
    ['modal-ignores-status-switch', PD, "if (window.__batchMode === true && typeof batchDocUi === 'function') batchDocUi();", ''],
    ['statuses-back-to-two', PM, "  ['existing_current', 'موجود — من عيادتنا'], ['existing_other', 'موجود — من عيادة أخرى']\n];", "];"],
    ['any-status-accepted', PM, "if (!BATCH_STATUSES.some(function(o){ return o[0] === s; })) return;", ''],
    ['doc-cost-not-zeroed', PM, "if (on && !was) { _batchDocPrevCost = costEl.value; costEl.value = '0'; }", "if (on && !was) { _batchDocPrevCost = costEl.value; }"],
    ['price-not-restored', PM, "else if (!on && was && _batchDocPrevCost !== null) { costEl.value = _batchDocPrevCost; _batchDocPrevCost = null; }", ''],
    ['doc-ui-leaks-after-exit', PM, "_batchApplyInfo = null; batchDocUi();   /* v712: مظهرُ التوثيق لا يتسرّب للمودال العادي */", ''],
    ['filter-shows-everything', PM, "  return list.filter(function(t){ return _modeTxCat(t) === tab; });\n}", "  return list;\n}"],
    ['starred-shows-everything', PM, "if (tab === 'starred') return list.filter(function(t){ return t.is_favorite; });", "if (tab === 'starred') return list;"],
    ['common-not-ranked', PM, "scored.sort(function(a, b){ return (u[b.id] || 0) - (u[a.id] || 0); });\n  return scored.slice(0, 8);", "return list.slice();"],
    ['unknown-category-lost', PM, "return (c && c !== 'condition' && typeof TX_CAT_META !== 'undefined' && TX_CAT_META[c]) ? c : 'other';", "return c || 'other';"],
    ['exam-palette-unfiltered', PM, "list = modeTxRender('exam', list);   /* v712: فلترُ التصنيفات */", "modeTxRender('exam', list);"],
    ['batch-palette-unfiltered', PM, "list = modeTxRender('batch', list);   /* v712: فلترُ التصنيفات */", "modeTxRender('batch', list);"],
    ['exam-tab-not-reset', PM, "modeTxTab.exam = null;   /* v712: كلُّ دخولٍ يبدأ من المفضلة/الشائعة */", ''],
    ['batch-tab-not-reset', PM, "modeTxTab.batch = null;   /* v712: كلُّ دخولٍ يبدأ من المفضلة/الشائعة */", ''],
    ['mini-forgets-status', PM, "if (stLbl) parts.push(stLbl);", ''],
    ['mini-not-synced-on-select', PM, "      sm.style.display = 'block';\n    }\n  }\n  modeMiniSync();\n}", "      sm.style.display = 'block';\n    }\n  }\n}"],
    ['exam-bar-sticky-again', CSS, ".exam-bar{display:none;position:static;", ".exam-bar{display:none;position:sticky;top:8px;z-index:40;"],
    ['batch-bar-sticky-again', CSS, ".batch-bar{display:none;position:static;", ".batch-bar{display:none;position:sticky;top:8px;z-index:40;"],
    ['mini-not-sticky', CSS, ".mode-mini{display:none;position:sticky;top:calc(", ".mode-mini{display:none;position:static;top:calc("],
    ['existing-hidden-in-modal', CSS, ':not([data-status="planned"]):not([data-status="existing_current"]):not([data-status="existing_other"]){display:none;}', ':not([data-status="planned"]){display:none;}'],
    ['doc-css-unscoped', CSS, 'body.batch-on #toothStep2[data-batch-doc="1"] .tu-row,', '#toothStep2[data-batch-doc="1"] .tu-row,'],
    ['header-sticky-in-modes', CSS, "body.exam-on .topbar,body.batch-on .topbar{position:static;}", ""],
    ['exit-outside-group', PH, `          <button type="button" class="exam-btn exit" onclick="toggleBatchMode()">✕ إنهاء</button>
          </span>`, `          </span>
          <button type="button" class="exam-btn exit" onclick="toggleBatchMode()">✕ إنهاء</button>`],
    ['status-section-unboxed', CSS, ".batch-bar #batchStatusRow{border-inline-start", ".batch-bar #batchStatusRowX{border-inline-start"],
    ['mini-below-chart', PH, '<div class="mode-mini" id="modeMini">', '<div class="mode-mini" id="modeMiniX">'],
    ['batch-layout-old', PH, '<div class="exam-row" id="batchStatusRow"><span class="exam-row-lbl">📌 الحالة</span>', '<div id="batchStatusRow">']
  ];
  let bit = 0; const alive = [];
  for (const [name, file, a, b] of MUT) {
    if (LIVE[file].split(a).length !== 2) { alive.push(name + ' (المرساة ليست فريدة/غائبة)'); continue; }
    const over = {}; over[file] = LIVE[file].replace(a, b);
    const m = await runAll(over);
    if (Object.keys(m).some(k => !m[k])) bit++; else alive.push(name);
  }
  if (alive.length) { console.log('  طفراتٌ نجت: ' + alive.join(' · ')); console.log(`⛔ prove-chart-modes: ${keys.length}/${keys.length} توكيداً · ${bit}/${MUT.length} طفرة تعضّ`); process.exit(1); }
  console.log(`✅ prove-chart-modes: ${keys.length}/${keys.length} توكيداً · ${bit}/${MUT.length} طفرة تعضّ`);
})();
