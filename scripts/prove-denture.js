#!/usr/bin/env node
/* M202 — مثبتُ التعويضات المتحركة (ج1) على الكود الحيّ: pp-denture.js · pp-dental.js · pp-modules.js ·
   patient-profile.html · appointments.html · treatments.html · الهجرة 202 ومرآتها.
   (١) العقدُ الثابت: الهجرة (قيدان + كتالوج 33) ومرآةُ db/schema.sql وخطةُ البناء · الكتالوج بصفحة العلاجات ·
       المحمّلُ والعرضُ التاريخي يوجّهان صفَّ الجهاز لخريطته · كلُّ محوٍ/تحديثٍ للسن بلا سطحٍ يستثني صفَّ الجهاز ·
       تسجيلُ الملف بكسر الكاش ووضع القراءة.
   (٢) السلوك بـjsdom على عُدّة dom-smoke الحقيقية وقاعدةٍ وهميةٍ تحترم المفتاح الأساسي والفلاتر:
       مخططٌ بلا جهاز لا يتغيّر فيه بايت (ثابتٌ ذاتي: الطبقةُ حاضرة = الطبقةُ غائبة — #671) · المدخلُ من «علاج جماعي»
       لا من نقرة سن · الجزئي (الافتراضي · التبديل · الحفظ: جلسةُ فكٍّ واحدة + صفوفُ وحدةٍ بمعرّف الجلسة) ·
       الكامل (تأكيدُ الأسنان القائمة · تعليمُها مفقودة · الموانع · الفكّان = جلستان) · الحالات (موجود بلا جلسة ·
       مراقبة مرفوضة) · التراجعُ عند فشل الرسم · الرسمُ بالمنظرين والحالةُ بالشكل والرابط · الإزالةُ وسؤالُ الجلسات ·
       الإنجازُ والحذف · حرّاسُ القلع والزرعة والفحص والدفعة · الفحصُ الأولي · العرضُ التاريخي · سياقٌ متروك لا يحفظ.
   (٣) طفراتٌ متعمَّدة — كلٌّ منها يجب أن تُحمرّ توكيداً واحداً على الأقل (#342). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت التعويضات المتحركة (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');

const FILES = ['pp-denture.js', 'pp-dental.js', 'pp-modules.js', 'pp-core.js', 'pp-clinical.js', 'pp-wa.js', 'patient-profile.html', 'patient-profile.css',
  'appointments.html', 'treatments.html', 'rpt-treat.js', 'migrations/202_removable_prosthetics_core.sql', 'migrations/203_removable_prosthetics_category.sql', 'db/schema.sql', 'scripts/db-bootstrap.py',
  'scripts/cache-bust.sh', 'scripts/check-mirrors.js'];
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

/* ── القاعدةُ الوهمية: تحترم المفتاح الأساسي لـteeth_status والفلاتر (eq/neq/in/not) وتسجّل كلَّ عملية ── */
const FAKE_DB = `
  window.__DB = { teeth_status: [], ledger_sessions: [], patients: [{ id: 'pat-1', doctor_id: 'doc-1' }] };
  window.__OPS = []; window.__FAIL = null; window.__SID = 0;
  (function(){
    function pk(r){ return [r.doctor_id, r.patient_id, String(r.tooth_num), r.surface].join('|'); }
    function match(row, fs){ for (var i = 0; i < fs.length; i++) { var f = fs[i], v = row[f[1]];
        if (f[0] === 'eq' && String(v) !== String(f[2])) return false;
        if (f[0] === 'neq' && String(v) === String(f[2])) return false;
        if (f[0] === 'in' && f[2].map(String).indexOf(String(v)) === -1) return false;
        if (f[0] === 'notnull' && (v === null || v === undefined)) return false; }
      return true; }
    function run(st){
      window.__OPS.push(JSON.parse(JSON.stringify({ table: st.table, op: st.op, payload: st.payload, filters: st.filters })));
      var fail = window.__FAIL ? window.__FAIL(st) : null;
      if (fail) return { data: null, error: { message: fail, code: 'XX000' } };
      var T = window.__DB[st.table] || (window.__DB[st.table] = []);
      if (st.op === 'insert') {
        var rows = Array.isArray(st.payload) ? st.payload : [st.payload], made = [];
        if (st.table === 'teeth_status') {
          var seen = {}; T.forEach(function(r){ seen[pk(r)] = 1; });
          for (var i = 0; i < rows.length; i++) { if (seen[pk(rows[i])]) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "teeth_status_pkey"' } }; seen[pk(rows[i])] = 1; }
        }
        rows.forEach(function(r){ var c = JSON.parse(JSON.stringify(r)); if (st.table === 'ledger_sessions' && !c.id) c.id = 'sess-' + (++window.__SID); T.push(c); made.push(JSON.parse(JSON.stringify(c))); });
        return { data: st.single ? made[0] : made, error: null };
      }
      if (st.op === 'upsert') {
        var ur = Array.isArray(st.payload) ? st.payload : [st.payload];
        ur.forEach(function(r){ var c = JSON.parse(JSON.stringify(r)), hit = -1;
          for (var i = 0; i < T.length; i++) if (st.table === 'teeth_status' && pk(T[i]) === pk(c)) hit = i;
          if (hit > -1) T[hit] = Object.assign({}, T[hit], c); else T.push(c); });
        return { data: ur, error: null };
      }
      var hits = T.filter(function(r){ return match(r, st.filters); });
      if (st.op === 'update') { hits.forEach(function(r){ Object.assign(r, st.payload); }); return { data: hits, error: null }; }
      if (st.op === 'delete') { window.__DB[st.table] = T.filter(function(r){ return !match(r, st.filters); }); return { data: hits, error: null }; }
      return { data: st.single ? (hits[0] || null) : JSON.parse(JSON.stringify(hits)), error: null };
    }
    function Q(table){ var st = { table: table, op: 'select', filters: [], payload: null, single: false };
      var api = {
        insert: function(p){ st.op = 'insert'; st.payload = p; return api; },
        upsert: function(p){ st.op = 'upsert'; st.payload = p; return api; },
        update: function(p){ st.op = 'update'; st.payload = p; return api; },
        delete: function(){ st.op = 'delete'; return api; },
        select: function(){ return api; }, single: function(){ st.single = true; return api; }, maybeSingle: function(){ st.single = true; return api; },
        eq: function(k, v){ st.filters.push(['eq', k, v]); return api; }, neq: function(k, v){ st.filters.push(['neq', k, v]); return api; },
        in: function(k, v){ st.filters.push(['in', k, v]); return api; }, not: function(k){ st.filters.push(['notnull', k]); return api; },
        order: function(){ return api; }, limit: function(){ return api; }, or: function(){ return api; }, range: function(){ return api; },
        then: function(res, rej){ return Promise.resolve().then(function(){ return run(st); }).then(res, rej); }
      }; return api; }
    window.sb = { from: Q, rpc: function(){ return Promise.resolve({ data: null, error: null }); } };
  })();
  window.__DIALOGS = []; window.__DIALOG_ANSWER = true;
  window.SyDialog = { confirm: function(o){ window.__DIALOGS.push(o); var a = window.__DIALOG_ANSWER; return Promise.resolve(typeof a === 'function' ? a(o) : a); } };
  window.__REALLOC = 0; reallocatePatientFunds = function(){ window.__REALLOC++; return Promise.resolve(); };
  window.__AUDIT = []; window.logAudit = function(a, d){ window.__AUDIT.push({ a: a, d: d }); };
  window.__MAT = []; maybePromptMaterialDeduction = function(k, l, n, ids){ window.__MAT.push({ k: k, n: n, ids: ids }); return Promise.resolve(); };
  window.__LAB = []; openLabOrderModal = function(p){ window.__LAB.push(p); };
  window.__DELS = []; delSession = function(id){ window.__DELS.push(id); sessions = sessions.filter(function(s){ return s.id !== id; }); return Promise.resolve(); };
  function _rowLbl(){ return 'ل.س'; } function _rowCur(){ return 'SYP'; } function curLblOf(){ return 'ل.س'; } function fmt(n){ return String(n); }
  function computeSessionPaid(){ return 0; }
  sessionTreatmentKey = function(x){ return x ? x.treatment_key : null; };
`;

function page(over) {
  const src = f => (over && over[f] != null) ? over[f] : LIVE[f];
  const PP = src('patient-profile.html');
  const a = PP.search(/<div class="modal-overlay[^"]*" id="regionalAreaModal">/);
  const b = PP.indexOf('<!-- Modal: السن -->');
  if (a < 0 || b < a) throw new Error('regionalAreaModal: الاقتطاعُ فشل');
  const regional = PP.slice(a, b);
  let html = HARNESS.replace(/<link rel="stylesheet"[^>]*>/g, '');
  html = html.replace('<div id="chartLegend"></div>', '<div id="chartLegend"></div><div class="ortho-banner" id="orthoBanner"></div><div class="ortho-banner dent-banner" id="dentureBanner" style="display:none;"></div>' + regional);
  html = html.replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => {
    const rel = path.relative(ROOT, f);
    let out = '<script>' + src(rel).replace(/<\/script/gi, '<\\/script') + '</script>';
    if (rel === 'pp-dental.js' && !(over && over.__noDenture)) out += '<script>' + src('pp-denture.js').replace(/<\/script/gi, '<\\/script') + '</script>';
    return out;
  });
  return html.replace('</body>', '<script>' + FAKE_DB + '</script></body>');
}
function boot(over) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(page(over), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

/* ── (١) العقدُ الثابت ── */
function scanWipes(src) {
  const out = { bad: [], guarded: 0 }; let i = 0;
  while ((i = src.indexOf("from('teeth_status')", i)) > -1) {
    const end = src.indexOf(';', i), st = src.slice(i, end + 1); i = end + 1;
    if (!/\.delete\(\)/.test(st) && !/\.update\(/.test(st)) continue;
    const scoped = /\.(eq|in)\('surface'/.test(st) || /\.eq\('unit_id'/.test(st);
    const spared = st.indexOf(".neq('surface', 'DENTURE')") > -1;
    if (spared) out.guarded++;
    if (!scoped && !spared) out.bad.push(st.replace(/\s+/g, ' ').slice(0, 110));
  }
  return out;
}
function staticChecks(over) {
  const F = f => (over && over[f] != null) ? over[f] : LIVE[f];
  const r = {};
  const M = F('migrations/202_removable_prosthetics_core.sql'), SCH = F('db/schema.sql'), TR = F('treatments.html'), PPH = F('patient-profile.html');
  r.migTargetPart = /treatments_target_part_check\s+CHECK \(target_part = ANY \(ARRAY\[[^\]]*'mouth'::text,\s*'denture_full'::text, 'denture_partial'::text\s*\]\)\)/.test(M);
  r.migSurface = /teeth_status_surface_check[\s\S]{0,400}'SXM'::text, 'SXD'::text, 'DENTURE'::text/.test(M) && !/ALTER TABLE public\.ledger_sessions/.test(M);
  const rows = (M.match(/\(NEW\.id, '[^']+', '[^\n]*\)[,\n]/g) || []);
  const dent = rows.filter(x => /'denture_(full|partial)'/.test(x));
  r.migCatalog33 = rows.length === 33 && dent.length === 4 && dent.every(x => /, 0, false, true, 'denture_(full|partial)', 'prosthodontics', 3[0-3], false, false, true, '[^']+', 'permanent'\)/.test(x))
    && /'denture-full'[^\n]*'denture_full'/.test(M) && (M.match(/'denture_partial', 'prosthodontics'/g) || []).length === 3;
  r.migFunctionKept = /SECURITY DEFINER\s+SET search_path TO 'public'/.test(M) && /EXCEPTION WHEN OTHERS THEN/.test(M) && /-- CATALOG-PARITY-START/.test(M) && !/GRANT /i.test(M);
  const seg = (t) => { const a = t.indexOf('-- CATALOG-PARITY-START'), b = t.indexOf('-- CATALOG-PARITY-END', a); return a > -1 && b > a ? t.slice(a, b) : null; };
  /* M203: فئةُ «تعويضات متحركة» — الكتالوجُ المرجعي صار بـM203، وصفوفُ M202 المزروعة تُنقل (المفاتيحُ الأربعة على فئتها الافتراضية حصراً) */
  const M3 = F('migrations/203_removable_prosthetics_category.sql');
  const rows3 = (M3.match(/\(NEW\.id, '[^']+', '[^\n]*\)[,\n]/g) || []), dent3 = rows3.filter(x => /'denture_(full|partial)'/.test(x));
  r.m203Catalog = rows3.length === 33 && dent3.length === 4 && dent3.every(x => /, 0, false, true, 'denture_(full|partial)', 'prosth_removable', 3[0-3], false, false, true, '[^']+', 'permanent'\)/.test(x))
    && rows3.filter(x => /'prosth_removable'/.test(x)).length === 4 && rows3.filter(x => /, 'prosthodontics', /.test(x)).length === 4
    && /SECURITY DEFINER\s+SET search_path TO 'public'/.test(M3) && !/GRANT /i.test(M3) && !/ALTER TABLE/.test(M3);
  r.m203Backfill = /UPDATE public\.treatments\s+SET category = 'prosth_removable'\s+WHERE treatment_key IN \('denture-full', 'denture-partial-acrylic', 'denture-partial-metal', 'denture-partial-flex'\)\s+AND target_part IN \('denture_full', 'denture_partial'\)\s+AND category = 'prosthodontics';/.test(M3)
    && (M3.match(/UPDATE public\./g) || []).length === 1;
  const RT = F('rpt-treat.js'), PDn = F('pp-dental.js');
  r.categorySplit = /<option value="prosthodontics">تعويضات ثابتة \(تاج، جسر\)<\/option>\s*<option value="prosth_removable">تعويضات متحركة \(جهاز كامل، جزئي\)<\/option>/.test(TR)
    && /'surgical','prosthodontics','prosth_removable',\s*'implantology'/.test(TR) && /'prosthodontics':\s+'🔗 تعويضات ثابتة'/.test(TR) && /'prosth_removable':'🧩 تعويضات متحركة'/.test(TR)
    && /'prosth_removable':true,/.test(TR) && /prosth_removable:'denture_partial',/.test(TR)
    && /'surgical','prosthodontics','prosth_removable',\s*'implantology'/.test(RT) && /'prosthodontics':\s+'🔗 تعويضات ثابتة',\s*'prosth_removable':'🧩 تعويضات متحركة'/.test(RT)
    && /prosthodontics:'🔗 تعويضات ثابتة', prosth_removable:'🧩 تعويضات متحركة'/.test(PDn) && /'surgical','prosthodontics','prosth_removable','implantology'/.test(PDn);
  r.schemaMirror = seg(SCH) !== null && seg(SCH) === seg(M3)
    && /"treatments_target_part_check" CHECK[^\n]*'mouth'::"text", 'denture_full'::"text", 'denture_partial'::"text"\]/.test(SCH)
    && /"teeth_status_surface_check" CHECK[^\n]*'SOCKET'::"text", 'DENTURE'::"text"/.test(SCH);
  r.bootstrapPlan = /'migrations\/201_expense_system_category_supplier_link\.sql',[^\n]*\n\s+'migrations\/202_removable_prosthetics_core\.sql',[^\n]*\n\s+'migrations\/203_removable_prosthetics_category\.sql',/.test(F('scripts/db-bootstrap.py'));
  /* صفحة العلاجات: الكتالوج · البلاطتان · الفلتر · الشارة · الحماية */
  const cat = (TR.match(/\{ treatment_key:'denture-[a-z-]+',[^\n]*\}/g) || []);
  r.treatCatalog = cat.length === 4 && cat.every(x => /price:0, builtin:false, needs_lab:true, target_part:'denture_(full|partial)', category:'prosth_removable', sort_order:3[0-3],/.test(x) && /dentition_scope:'permanent'/.test(x));
  r.treatTargetUi = /data-target="denture_full"/.test(TR) && /data-target="denture_partial"/.test(TR) && /\['denture_full','جهاز كامل'\], \['denture_partial','جهاز جزئي'\]/.test(TR)
    && /'denture_full':\s+\{ text:'جهاز كامل'/.test(TR) && /'denture_partial':\s+\{ text:'جهاز جزئي'/.test(TR);
  r.treatProtected = /\|\| tp === 'denture_full' \|\| tp === 'denture_partial'/.test(TR.slice(TR.indexOf('function isProtectedTreatment'), TR.indexOf('function isProtectedTreatment') + 1600));
  /* المحمّل والعرض التاريخي */
  r.loaderRoutes = /if \(window\.SyDenture\) window\.SyDenture\.reset\(\);[^\n]*\n\s+\(td \|\| \[\]\)\.forEach\(function\(t\)\{\s+if \(window\.SyDenture && window\.SyDenture\.take\(t\)\) return;/.test(PPH);
  r.historyRoutes = /if \(window\.SyDenture\) window\.SyDenture\.histBegin\(\);/.test(PPH) && /if \(window\.SyDenture && window\.SyDenture\.take\(ev\)\) return;/.test(PPH) && /if \(window\.SyDenture\) window\.SyDenture\.histEnd\(\);/.test(PPH);
  r.sessionHooks = /await window\.SyDenture\.onSessionDeleted\(sess\)/.test(PPH) && /if \(sess && !sess\.tooth_num && window\.SyDenture\) \{ await window\.SyDenture\.onSessionComplete\(sess\); return ''; \}/.test(PPH);
  r.scriptOrder = PPH.indexOf('<script src="pp-denture.js?v=') > PPH.indexOf('<script src="pp-dental.js?v=') && PPH.indexOf('<script src="pp-denture.js?v=') < PPH.indexOf('<script src="pp-plan.js?v=')
    && /id="dentPickBox"/.test(PPH) && /id="dentTeethGrid"/.test(PPH) && /id="dentureBanner"/.test(PPH)
    && /onclick="nseRegional\(\)">🦷 علاج جماعي \(ربع \/ فك \/ فم \/ جهاز متحرك\)<\/button>/.test(PPH)
    && /<button type="button" class="exam-btn" onclick="dentOpenEdentulous\(\)"[^>]*>🦷 فك أدرد<\/button>/.test(PPH);
  /* كلُّ محوٍ/تحديثٍ للسن بلا سطحٍ ولا وحدة يستثني صفَّ الجهاز */
  const sc = ['pp-dental.js', 'pp-modules.js', 'patient-profile.html', 'appointments.html', 'pp-denture.js'].map(f => scanWipes(F(f)));
  r.wipesSpareDenture = sc.every(x => x.bad.length === 0) && sc.reduce((n, x) => n + x.guarded, 0) === 12;
  /* مرآةُ صفحة المواعيد: إنجازُ جلسة الجهاز يقلب صفوفَ وحدتها بمعرّف الجلسة */
  const AP = F('appointments.html');
  r.apptCompleteMirror = /if \(s && !s\.tooth_num\) \{ await _apptSyncDentureRowsOnComplete\(s, providerOverride\); return; \}/.test(AP)
    && /\.eq\('unit_id', s\.id\)\.eq\('surface', 'DENTURE'\)\.eq\('status', 'planned'\)/.test(AP);
  /* التسجيل: كسرُ الكاش ×2 · وضعُ القراءة */
  const CB = F('scripts/cache-bust.sh');
  r.cacheBustAsset = (CB.match(/pp-denture\\\.js/g) || []).length === 2 && /pp-dental\.js · pp-denture\.js · pp-plan\.js/.test(CB);
  const CSS = F('patient-profile.css'), DN = F('pp-denture.js');
  r.bleedMirrorsCss = /\.jaw-row\{display:flex;justify-content:center;gap:4px;/.test(CSS) && /\.jaw-wrap\[data-dent="mixed"\] \.jaw-row\{gap:7px;\}/.test(CSS) && /\.jaw-wrap\[data-dent="primary"\] \.jaw-row\{gap:11px;\}/.test(CSS)
    && /\.midline\{width:2px;[^}]*margin:0 6px;/.test(CSS) && /var DENT_ROW_GAP_PX = \{ permanent: 4, mixed: 7, primary: 11 \};/.test(DN) && /var DENT_MIDLINE_PX = 14;/.test(DN)
    && /\.tooth-shape\{\s*display:block;\s*overflow:visible;/.test(CSS);
  r.readOnlyRegistry = /\[onclick\*="dentRemoveUnit\("\]/.test(F('patient-profile.css')) && /'removeSpacerUnit', 'dentRemoveUnit' \/\* M202[^*]*\*\/, 'removeSocket'/.test(F('scripts/check-mirrors.js'))
    && /'dentArchToggle', 'dentArchBoth', 'dentToothToggle', 'dentToothWhy', 'dentOpenEdentulous'\];/.test(F('scripts/check-mirrors.js'));
  return r;
}

/* ── (٢) السلوك ── */
const T_FULL = { treatment_key: 'denture-full', id: 'denture-full', name: 'جهاز متحرك كامل', label: 'ك', fill: '#e11d74', stroke: '#9d174d', price: 900000, target_part: 'denture_full', category: 'prosth_removable', is_active: true, needs_lab: true, dentition_scope: 'permanent', currency: 'SYP', price_overrides: {} };
const T_PART = { treatment_key: 'denture-partial-acrylic', id: 'denture-partial-acrylic', name: 'جهاز متحرك جزئي (أكريل)', label: 'ج', fill: '#fb7185', stroke: '#be123c', price: 400000, target_part: 'denture_partial', category: 'prosth_removable', is_active: true, needs_lab: true, dentition_scope: 'permanent', currency: 'SYP', price_overrides: {} };
const T_IMPL = { treatment_key: 'implant', id: 'implant', name: 'زراعة', label: 'ز', fill: '#bfdbfe', stroke: '#3b82f6', price: 0, target_part: 'implant', category: 'implantology', is_active: true, currency: 'SYP', price_overrides: {} };
const T_BRDG = { treatment_key: 'bridge', id: 'bridge', name: 'جسر', label: 'ج', fill: '#ef4444', stroke: '#b91c1c', price: 0, target_part: 'bridge', category: 'prosthodontics', is_active: true, currency: 'SYP', price_overrides: {} };
const T_SOCK = { treatment_key: 'socket-dressing', id: 'socket-dressing', name: 'ضماد سنخ', label: 'ض', fill: '#fbbf24', stroke: '#b45309', price: 0, target_part: 'whole', category: 'surgical', is_active: true, post_extraction: true, currency: 'SYP', price_overrides: {} };
const T_ARCH = { treatment_key: 'whitening', id: 'whitening', name: 'تبييض', label: 'ب', fill: '#84cc16', stroke: '#5a9410', price: 100000, target_part: 'arch', category: 'cosmetic', is_active: true, currency: 'SYP', price_overrides: {} };

async function behave(w, hasDenture) {
  const r = {}, doc = w.document;
  const $ = id => doc.getElementById(id);
  const tick = (ms) => new Promise(res => setTimeout(res, ms || 0));
  [T_FULL, T_PART, T_IMPL, T_BRDG, T_SOCK, T_ARCH].forEach(t => w.TREATMENTS.push(JSON.parse(JSON.stringify(t))));
  const K = 'custom_1781292854422';
  const row = (tooth, surface, key, status, unit) => ({ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: String(tooth), surface, treatment_key: key, status: status || 'completed', unit_id: unit || null, provider_id: null });
  /* تحميلٌ بمحاكاة المحمّل الحرفية (المطابقةُ الثابتة r.loaderRoutes تحرس الأصل) */
  const load = (rows, sess) => {
    w.__DB.teeth_status = JSON.parse(JSON.stringify(rows)); w.__DB.ledger_sessions = JSON.parse(JSON.stringify(sess || []));
    w.__OPS = []; w.__DIALOGS = []; w.__TOASTS.length = 0; w.__REALLOC = 0; w.__AUDIT = []; w.__MAT = []; w.__LAB = []; w.__DELS = []; w.__FAIL = null; w.__DIALOG_ANSWER = true;
    const tm = {};
    if (w.SyDenture) w.SyDenture.reset();
    rows.forEach(t => { if (w.SyDenture && w.SyDenture.take(t)) return;
      const n = String(t.tooth_num); tm[n] = tm[n] || {}; tm[n][t.surface] = t.treatment_key; tm[n].__status = tm[n].__status || {}; tm[n].__status[t.surface] = t.status || 'completed';
      if (t.unit_id) { tm[n].__unit = tm[n].__unit || {}; tm[n].__unit[t.surface] = t.unit_id; } });
    w.eval('teethMap = ' + JSON.stringify(tm) + '; sessions = ' + JSON.stringify(sess || []) + '; window.teethDx = {};');
    const t = w.rebuildToothMaps(); w.T_FILL = t.fill; w.T_STROKE = t.stroke; w.T_LABEL = t.label;
    w.eval('currentTooth = null; currentSurface = null; pendingProviderId = "d1"; window.__examMode = false; window.__batchMode = false; window.__historyMode = false;');
    ['toothModal', 'regionalAreaModal'].forEach(id => $(id).classList.remove('open'));
  };
  const X = (t, st) => row(t, 'WHOLE', 'extracted', st || 'completed');
  const snap = () => ['upperJaw', 'lowerJaw', 'upperOcc', 'lowerOcc', 'chartLegend'].map(id => $(id).innerHTML).join('\n@@\n');
  const ops = (table, op) => w.__OPS.filter(o => o.table === table && o.op === op);
  const toasts = () => w.__TOASTS.join(' || ');
  const DB = (t) => w.__DB[t];

  /* ① مخططٌ بلا جهاز: الطبقةُ حاضرةٌ بخريطةٍ فارغة = الطبقةُ غائبة تماماً (بايت ببايت) */
  const mixed = [row(46, 'O', K), row(45, 'O', K, 'planned'), X(36), X(26, 'planned'), row(16, 'CROWN_FULL', 'crown', 'planned'),
    row(14, 'WHOLE', 'bridge', 'completed', 'u-b'), row(15, 'WHOLE', 'extracted'), row(15, 'PONTIC', 'bridge', 'completed', 'u-b'), row(16, 'WHOLE', 'bridge', 'completed', 'u-b'), row(11, 'WHOLE', 'implant', 'planned')];
  load(mixed); w.renderTeeth(); const withLayer = snap();
  const keep = w.SyDenture; w.SyDenture = undefined; w.renderTeeth(); const without = snap(); w.SyDenture = keep;
  r.noDentureByteParity = withLayer === without && withLayer.length > 20000 && !/dent-layer|dent-tip/.test(withLayer);
  if (!hasDenture) { r.noJsErrors = (w.__ERRORS || []).length === 0; return r; }
  r.bannerHiddenWithoutDenture = $('dentureBanner').style.display === 'none' && $('dentureBanner').innerHTML === '';

  /* ② المدخل: «علاج جماعي» يعرض الجهاز؛ نقرةُ السن (قائماً أو مقلوعاً) لا تعرضه */
  load([X(14), X(15), X(18), X(24, 'planned'), row(25, 'WHOLE', 'implant'), row(36, 'O', K)]);
  w.eval('window.__regionalPickerMode = true;'); await w.openToothModal(null, null);
  const regHtml = $('toothOptsContainer').innerHTML;
  r.regionalListsDenture = regHtml.indexOf(T_FULL.name) > -1 && regHtml.indexOf(T_PART.name) > -1 && regHtml.indexOf(T_ARCH.name) > -1 && /جهاز متحرك/.test($('toothModalTitle').textContent);
  w.closeModal('toothModal'); w.eval('window.__regionalPickerMode = false;');
  /* القائمةُ المسموحة كاملةً (_txAllowed) لا التبويبُ الظاهر وحده */
  const allowed = () => w.eval('_txAllowed.map(function(t){ return t.id; })');
  await w.openToothModal(36, 'O'); const stIds = allowed();
  await w.openToothModal(14, 'WHOLE'); const exIds = allowed();
  r.toothClickListsDenture = stIds.indexOf(T_FULL.id) > -1 && stIds.indexOf(T_PART.id) > -1 && exIds.indexOf(T_FULL.id) > -1 && exIds.indexOf(T_PART.id) > -1
    && stIds.indexOf(K) > -1 && stIds.indexOf('crown') > -1 && exIds.indexOf('implant') > -1 && exIds.indexOf('bridge') > -1 && exIds.indexOf(K) === -1;
  /* فئتان: «تعويضات ثابتة» (المفتاحُ القائم) و«تعويضات متحركة» (الجديد) — تبويبُ الجهاز يظهر بنافذة السن */
  w.switchTxTab('prosth_removable');
  const tabsHtml = $('txTabs').textContent + ' || ' + $('toothOptsContainer').innerHTML;
  r.categoryTabs = w.TX_CAT_META.prosthodontics === '🔗 تعويضات ثابتة' && w.TX_CAT_META.prosth_removable === '🧩 تعويضات متحركة'
    && w.TX_CAT_ORDER.indexOf('prosth_removable') === w.TX_CAT_ORDER.indexOf('prosthodontics') + 1
    && tabsHtml.indexOf('تعويضات متحركة') > -1 && tabsHtml.indexOf(T_PART.name) > -1 && tabsHtml.indexOf(T_FULL.name) > -1;
  /* نقرةُ العلاج من نافذة سن ⇒ المنتقي على فكّ ذلك السن (36 ⇒ السفلي؛ لا مفقودَ فيه ⇒ تنبيهٌ لا فكٌّ آخر) */
  await w.openToothModal(36, 'O'); w.pickToothTreatment(T_PART.id, T_PART.name);
  const fromLower = $('regionalAreaModal').classList.contains('open') && !$('toothModal').classList.contains('open')
    && !!doc.querySelector('#dentTeethGrid [data-dent-tooth="36"]') && !doc.querySelector('#dentTeethGrid [data-dent-tooth="14"]') && /لا أسنان مفقودة بهذا الفك/.test($('dentPickNote').textContent);
  w.closeModal('regionalAreaModal');
  await w.openToothModal(14, 'WHOLE'); w.pickToothTreatment(T_PART.id, T_PART.name);
  const fromUpper = !!doc.querySelector('#dentTeethGrid [data-dent-tooth="14"].dent-on') && !doc.querySelector('#dentTeethGrid [data-dent-tooth="36"]');
  w.closeModal('regionalAreaModal');
  await w.openToothModal(36, 'O'); w.pickToothTreatment(T_FULL.id, T_FULL.name);
  const fullFromTooth = /الفك السفلي:/.test($('dentPickNote').textContent) && !/الفك العلوي:/.test($('dentPickNote').textContent);
  w.closeModal('regionalAreaModal'); w.SyDenture.clearPending();
  r.pickFromToothUsesItsArch = fromLower && fromUpper && fullFromTooth;
  w.closeModal('toothModal');

  /* ③ الجزئي: الافتراضي (المفقودُ عدا رحى العقل) · الحالاتُ بالشبكة · التبديل */
  w.eval('window.__regionalPickerMode = true;'); await w.openToothModal(null, null);
  w.pickToothTreatment(T_PART.id, T_PART.name);
  const cell = n => doc.querySelector('#dentTeethGrid [data-dent-tooth="' + n + '"]');
  r.partialPickerDefault = $('regionalAreaModal').classList.contains('open') && !$('toothModal').classList.contains('open') && $('dentPickBox').style.display !== 'none'
    && doc.querySelectorAll('#dentTeethGrid [data-dent-tooth]').length === 16
    && cell(14).classList.contains('dent-on') && cell(15).classList.contains('dent-on') && cell(18).classList.contains('dent-miss')
    && cell(16).classList.contains('dent-off') && cell(24).classList.contains('dent-off') && cell(25).classList.contains('dent-off')
    && /قلعه مخطّط/.test(cell(24).getAttribute('title')) && /مزروع/.test(cell(25).getAttribute('title')) && /قائم/.test(cell(16).getAttribute('title'))
    && $('regionalAreaModal').classList.contains('sy-m-md') && !$('regionalAreaModal').classList.contains('sy-m-sm') && $('regionalAreaSelect').style.display === 'none';
  w.dentToothToggle(18); const on18 = cell(18).classList.contains('dent-on'); w.dentToothToggle(18); w.dentToothToggle(16);
  r.partialToggle = on18 && cell(18).classList.contains('dent-miss') && cell(16).classList.contains('dent-off');
  w.dentToothWhy(16); r.offToothExplains = /السن 16: سن قائم/.test(toasts());
  /* «متابعة» عبر زرّ النافذة المشتركة ⇒ الخطوةُ الثانية بعنوانٍ يسمّي الأسنان */
  w.confirmRegionalAreaPick(); await tick(20);
  r.partialStep2 = $('toothModal').classList.contains('open') && !$('regionalAreaModal').classList.contains('open') && $('toothStep2').style.display === 'block'
    && /جهاز متحرك جزئي \(أكريل\) — الفك العلوي — الأسنان 14، 15$/.test($('toothStep2Title').textContent) && $('toothCost').value === '400000'
    && $('regionalLabBtn').style.display !== 'none' && $('toothLabBtn').style.display === 'none'
    && $('regionalAreaModal').classList.contains('sy-m-sm') && $('dentPickBox').style.display === 'none';
  /* الحفظ «منجز»: جلسةُ فكٍّ واحدة + صفّان بمعرّفها + إعادةُ توزيعٍ واحدة — وteethMap لا تُمسّ */
  const tmBefore = JSON.stringify(w.eval('teethMap'));
  $('toothCost').value = '500000'; $('toothNotes').value = 'ملاحظة';
  await w.saveToothTreatment();
  const li = ops('ledger_sessions', 'insert'), ti = ops('teeth_status', 'insert');
  const s1 = DB('ledger_sessions')[0] || {};
  r.partialSaveLedger = li.length === 1 && DB('ledger_sessions').length === 1 && s1.tooth_num === null && s1.surface === null && s1.arch === 'U' && s1.type === T_PART.name
    && s1.description === 'الفك العلوي — الأسنان 14، 15' && s1.cost === 500000 && s1.status === 'completed' && s1.treatment_key === T_PART.id && s1.currency === 'SYP' && s1.provider_id === 'd1' && s1.notes === 'ملاحظة';
  const dr = DB('teeth_status').filter(x => x.surface === 'DENTURE');
  r.partialSaveRows = ti.length === 1 && Array.isArray(ti[0].payload) && dr.length === 2 && dr.every(x => x.unit_id === s1.id && x.status === 'completed' && x.treatment_key === T_PART.id && x.provider_id === 'd1')
    && dr.map(x => x.tooth_num).sort().join() === '14,15' && ops('teeth_status', 'upsert').length === 0 && ops('teeth_status', 'delete').length === 0;
  r.partialSaveMoney = w.__REALLOC === 1 && w.eval('sessions.length') === 1 && w.eval('sessions[0].id') === s1.id && w.__AUDIT.length === 1 && w.__AUDIT[0].a === 'session.create';
  r.teethMapUntouched = JSON.stringify(w.eval('teethMap')) === tmBefore && w.SyDenture.has(14) && w.SyDenture.has(15) && !w.SyDenture.has(18);
  r.partialSaveUi = !$('toothModal').classList.contains('open') && /تم تسجيل جهاز متحرك جزئي \(أكريل\) — الفك العلوي — الأسنان 14، 15/.test(toasts()) && w.eval('pendingRegionalType') === null && !w.SyDenture.saveReady();
  r.completedPromptsMaterials = w.__MAT.length === 1 && w.__MAT[0].k === T_PART.id && w.__MAT[0].ids.length === 1 && w.__MAT[0].ids[0] === s1.id;

  /* ④ الرسم: السنُّ الصناعي والقاعدة بالمنظرين · التلميح · الشريط · الحالةُ بالشكل */
  const fsvg = n => doc.querySelector('.tooth-cell[data-tooth-cell="' + n + '"] svg.tooth-shape'), osvg = n => doc.querySelector('.occ-cell[data-occ-cell="' + n + '"] svg.tooth-shape');
  const L = (svg) => svg ? svg.querySelector('g.dent-layer') : null;
  r.paintFacial = !!L(fsvg(14)) && !!L(fsvg(14)).querySelector('path.dent-tooth') && !!L(fsvg(14)).querySelector('rect.dent-base') && !L(fsvg(14)).querySelector('pattern')
    && L(fsvg(14)).getAttribute('transform') === 'translate(0,210) scale(1,-1)' && L(fsvg(14)).getAttribute('pointer-events') === 'none' && L(fsvg(14)).getAttribute('data-dent-unit') === s1.id
    && L(fsvg(14)).querySelector('path.dent-tooth').getAttribute('fill') === T_PART.fill && L(fsvg(14)).querySelector('rect.dent-base').getAttribute('fill') === T_PART.stroke
    && !!L(fsvg(15)) && !L(fsvg(16)) && !L(fsvg(13)) && fsvg(14).classList.contains('extract-ghost');
  r.paintOcclusal = !!L(osvg(14)) && !!L(osvg(14)).querySelector('path.dent-tooth') && !L(osvg(14)).getAttribute('transform') && !!L(osvg(15)) && !L(osvg(16));
  const tip = n => doc.querySelector('.tooth-cell[data-tooth-cell="' + n + '"] .tooth-tip .dent-tip'), otip = n => doc.querySelector('.occ-cell[data-occ-cell="' + n + '"] .tooth-tip .dent-tip');
  r.paintTips = !!tip(14) && /جهاز متحرك:/.test(tip(14).textContent) && tip(14).textContent.indexOf(T_PART.name) > -1 && !!otip(15) && !tip(16)
    && doc.querySelectorAll('.tooth-cell[data-tooth-cell="14"] .tooth-tip .dent-tip').length === 1;
  r.paintBanner = $('dentureBanner').style.display === 'flex' && /جهاز متحرك جزئي \(أكريل\) · الفك العلوي · 2 أسنان$/.test($('dentureBanner').textContent.trim());
  w.SyDenture.paint(); r.paintIdempotent = fsvg(14).querySelectorAll('g.dent-layer').length === 1 && osvg(14).querySelectorAll('g.dent-layer').length === 1 && doc.querySelectorAll('.tooth-cell[data-tooth-cell="14"] .dent-tip').length === 1;
  /* الجارُ داخل الوحدة: القاعدةُ تمتدّ نحوه (الصفُّ يُرسم من اليمين إلى اليسار: 14 قبل 15 بالمصفوفة ⇒ 15 على يسار 14) */
  const bx = n => { const b = L(fsvg(n)).querySelector('rect.dent-base'); return [+b.getAttribute('x'), +b.getAttribute('x') + +b.getAttribute('width')]; };
  /* نصفُ فراغ الصف (4px من 60 ⇒ 3.33) + ε = 3.48: القاعدتان تتلاقيان بلا تراكب */
  r.baseBleedsTowardNeighbour = bx(14)[0] === -3.48 && bx(14)[1] === 94 && bx(15)[0] === 6 && bx(15)[1] === 103.48;
  const paintSt = (st) => { load([X(36), X(37), row(36, 'DENTURE', T_PART.id, st, 'u1'), row(37, 'DENTURE', T_PART.id, st, 'u1')]); w.renderTeeth();
    const g = L(fsvg(36)), o = L(osvg(36)), t = g.querySelector('path.dent-tooth'), b = g.querySelector('rect.dent-base');
    return { g, o, t, b, tipTxt: tip(36).textContent, ban: $('dentureBanner').textContent }; };
  const pl = paintSt('planned');
  r.plannedHatched = /^url\(#dn36\)$/.test(pl.t.getAttribute('fill')) && !!pl.g.querySelector('pattern#dn36') && /^url\(#dnb36\)$/.test(pl.b.getAttribute('fill')) && !!pl.g.querySelector('pattern#dnb36')
    && /^url\(#dno36\)$/.test(pl.o.querySelector('path.dent-tooth').getAttribute('fill')) && !pl.g.getAttribute('transform') && /مخطط/.test(pl.tipTxt) && /مخطط/.test(pl.ban);
  const eo = paintSt('existing_other');
  r.existingOtherDashed = eo.t.getAttribute('stroke-dasharray') === '2.2 2' && eo.t.getAttribute('fill') === T_PART.fill && +eo.t.getAttribute('fill-opacity') < 0.5 && eo.b.getAttribute('stroke-dasharray') === '2.2 2';
  const rf = paintSt('referred');
  r.referredDotted = rf.t.getAttribute('stroke-dasharray') === '1.6 2.4' && +rf.t.getAttribute('fill-opacity') < 0.2;
  const cp2 = paintSt('completed');
  r.completedSolid = cp2.t.getAttribute('fill') === T_PART.fill && !cp2.t.getAttribute('stroke-dasharray') && !cp2.g.querySelector('pattern') && !/مخطط|موجود/.test(cp2.tipTxt);
  /* الرابط: جهازٌ على 14 و24 ⇒ خطٌّ رابط على ما بينهما بلا سنٍّ صناعي، وخارج الطرفين لا شيء */
  load([X(14), X(24), row(14, 'DENTURE', T_PART.id, 'completed', 'u2'), row(24, 'DENTURE', T_PART.id, 'completed', 'u2')]); w.renderTeeth();
  const between = [13, 12, 11, 21, 22, 23];
  const cx = n => { const l = L(fsvg(n)).querySelector('line.dent-conn'); return [l.getAttribute('x1'), l.getAttribute('x2')].join(); };
  r.connectorAcrossSpan = between.every(n => { const g = L(fsvg(n)); return !!g && !!g.querySelector('line.dent-conn') && !g.querySelector('.dent-tooth') && !g.querySelector('.dent-base')
      && !g.querySelector('line.dent-conn').getAttribute('opacity') && !L(osvg(n)) && !tip(n); })
    && cx(13) === '-3.48,103.48' && cx(12) === '-3.48,103.48' && cx(22) === '-3.48,103.48'
    && !L(fsvg(15)) && !L(fsvg(25)) && !!L(fsvg(14)).querySelector('.dent-tooth') && !!L(fsvg(24)).querySelector('.dent-tooth')
    && w.SyDenture.units().length === 1 && w.SyDenture.units()[0].teeth.join() === '24,14';
  /* عبر الخط الناصف: فراغان + الخط (4+14+4 = 22px ⇒ نصفُه 18.33 + ε) — 21 يمين 11 بالمخطط */
  r.connectorBridgesMidline = cx(11) === '-3.48,118.48' && cx(21) === '-18.48,103.48' && bx(14)[1] === 103.48 && bx(14)[0] === 6 && bx(24)[0] === -3.48 && bx(24)[1] === 94;

  /* ⑤ الكامل: تأكيدُ الأسنان القائمة ثم تعليمُها مفقودة (ومحوُ صفوفها) + 14 صفاً + جلسةُ الفك */
  const lowerMissing = [47, 46, 45, 44, 43, 42, 41, 31, 32, 33].map(t => X(t));
  load(lowerMissing.concat([row(34, 'O', K), row(35, 'O', K, 'planned'), X(38), row(11, 'O', K)]));
  w.SyDenture.openPicker(T_FULL.id, T_FULL.name, null);
  r.fullPickerUi = $('dentTeethGrid').style.display === 'none' && doc.querySelectorAll('#regionalQuadChips [data-dent-arch]').length === 3 && /اختر فكاً/.test($('dentPickNote').textContent);
  w.dentArchToggle('L');
  r.fullNoteListsStanding = /الفك السفلي: 4 أسنان قائمة بالمخطط \(34، 35، 36، 37\)/.test($('dentPickNote').textContent.replace(/\s+/g, ' '));
  w.__DIALOG_ANSWER = false; await w.SyDenture.confirmPick();
  r.confirmNamesDrawnTreatments = /على الأسنان 34، 35 علاجاتٌ مرسومة تُزال عن المخطط \(جلساتُها تبقى بالسجل\)/.test(w.__DIALOGS[0].message);
  r.fullConfirmCanCancel = w.__DIALOGS.length === 1 && /34، 35، 36، 37/.test(w.__DIALOGS[0].message) && $('regionalAreaModal').classList.contains('open') && !w.SyDenture.saveReady() && w.__OPS.length === 0;
  w.__DIALOG_ANSWER = true; await w.SyDenture.confirmPick();
  r.fullStep2 = /جهاز متحرك كامل — الفك السفلي — كامل$/.test($('toothStep2Title').textContent) && w.SyDenture.saveReady() && w.__OPS.length === 0;
  w.pickStatus('planned'); $('toothCost').value = '900000';
  await w.saveToothTreatment();
  const s5 = DB('ledger_sessions')[0] || {};
  const miss = DB('teeth_status').filter(x => x.surface === 'WHOLE' && ['34', '35', '36', '37'].indexOf(x.tooth_num) > -1);
  r.fullMarksMissing = miss.length === 4 && miss.every(x => x.treatment_key === 'extracted' && x.status === 'existing_other')
    && DB('teeth_status').filter(x => x.tooth_num === '34' || x.tooth_num === '35').every(x => x.surface === 'WHOLE' || x.surface === 'DENTURE')
    && w.eval('teethMap["34"].WHOLE') === 'extracted' && w.eval('teethMap["34"].__status.WHOLE') === 'existing_other' && w.eval('teethMap["34"].O') === undefined
    && DB('teeth_status').some(x => x.tooth_num === '11' && x.surface === 'O') && !DB('teeth_status').some(x => x.tooth_num === '38' && x.surface === 'DENTURE');
  const d5 = DB('teeth_status').filter(x => x.surface === 'DENTURE');
  r.fullSaveRows = d5.length === 14 && d5.every(x => x.unit_id === s5.id && x.status === 'planned') && s5.arch === 'L' && s5.description === 'الفك السفلي — كامل' && s5.status === 'planned' && s5.cost === 900000
    && DB('ledger_sessions').length === 1 && w.__MAT.length === 0 && /جهاز متحرك كامل · الفك السفلي · كامل · مخطط$/.test($('dentureBanner').textContent.trim());
  /* الموانع: فكٌّ فيه زرعة أو قلعٌ مخطّط لا يقبل الكامل */
  load([X(14), row(25, 'WHOLE', 'implant'), X(24, 'planned')]);
  w.SyDenture.openPicker(T_FULL.id, T_FULL.name, null); w.dentArchToggle('U');
  const blkNote = $('dentPickNote').textContent;
  await w.SyDenture.confirmPick();
  r.fullBlockers = /لا يقبل جهازاً كاملاً/.test(blkNote) && /25 \(مزروع\)/.test(blkNote) && /24 \(قلعه مخطّط/.test(blkNote) && /لا يقبل جهازاً كاملاً/.test(toasts()) && w.__DIALOGS.length === 0 && w.__OPS.length === 0 && !w.SyDenture.saveReady();
  /* الفكّان معاً ⇒ جلستان ووحدتان بالسعر المدخل لكلٍّ */
  load(w.DENT_FULL_TEETH.U.concat(w.DENT_FULL_TEETH.L).map(t => X(t)));
  w.SyDenture.openPicker(T_FULL.id, T_FULL.name, null); w.dentArchBoth(); await w.SyDenture.confirmPick();
  $('toothCost').value = '700000'; await w.saveToothTreatment();
  const both = DB('ledger_sessions'), bd = DB('teeth_status').filter(x => x.surface === 'DENTURE');
  r.bothArchesTwoSessions = w.__DIALOGS.length === 0 && both.length === 2 && both[0].arch === 'U' && both[1].arch === 'L' && both.every(s => s.cost === 700000) && both[0].id !== both[1].id
    && bd.length === 28 && bd.filter(x => x.unit_id === both[0].id).length === 14 && bd.filter(x => x.unit_id === both[1].id).length === 14 && w.__REALLOC === 1 && w.SyDenture.units().length === 2
    && /جلسة لكل فك/.test(toasts());

  /* ⑥ الحالات: «موجود مسبقاً» صفوفٌ بلا جلسة · «مراقبة» مرفوضة بصفر كتابة */
  const two = [X(46), X(47)];
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick(); w.pickStatus('existing_other'); await w.saveToothTreatment();
  const e6 = DB('teeth_status').filter(x => x.surface === 'DENTURE');
  r.existingNoLedger = DB('ledger_sessions').length === 0 && ops('ledger_sessions', 'insert').length === 0 && e6.length === 2 && e6.every(x => x.status === 'existing_other' && /^[0-9a-f-]{36}$/.test(x.unit_id))
    && e6[0].unit_id === e6[1].unit_id && w.__REALLOC === 0 && w.__AUDIT.length === 0 && /سُجّل جهاز متحرك جزئي/.test(toasts());
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick(); w.pickStatus('condition'); await w.saveToothTreatment();
  r.conditionRejected = w.__OPS.length === 0 && /«مراقبة» لا تُسجَّل لجهازٍ متحرك/.test(toasts()) && !w.SyDenture.has(46) && $('toothModal').classList.contains('open');
  /* زرّ «حفظ + إرسال لمخبر»: الجلسةُ تُسلَّم لطلب المخبر بوصف الأسنان */
  w.pickStatus('planned'); await w.saveRegionalAndOpenLab();
  r.labHandoff = w.__LAB.length === 1 && w.__LAB[0].session_id === DB('ledger_sessions')[0].id && w.__LAB[0].treatment_key === T_PART.id && w.__LAB[0].draft === true && /^الفك السفلي — الأسنان 46، 47/.test(w.__LAB[0].notes);

  /* ⑦ فشلُ الرسم ⇒ الجلسةُ تُسحب ولا يبقى نصفُ حفظ (صفٌّ قائم بالقاعدة لا يراه هذا الجهاز) */
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick();
  w.__DB.teeth_status.push(row(46, 'DENTURE', T_FULL.id, 'completed', 'other-device'));
  await w.saveToothTreatment();
  r.rollbackOnRowsFailure = DB('ledger_sessions').length === 0 && ops('ledger_sessions', 'insert').length === 1 && ops('ledger_sessions', 'delete').length === 1 && w.eval('sessions.length') === 0
    && DB('teeth_status').filter(x => x.surface === 'DENTURE').length === 1 && DB('teeth_status').filter(x => x.surface === 'DENTURE')[0].unit_id === 'other-device'
    && !w.SyDenture.has(47) && w.__REALLOC === 0 && /تعذّر حفظ الجهاز على المخطط/.test(toasts());
  r.failureKeepsStepForRetry = w.SyDenture.saveReady() === true && $('toothModal').classList.contains('open') && w.eval('pendingRegionalType') === 'arch';
  w.__DB.teeth_status = w.__DB.teeth_status.filter(x => x.unit_id !== 'other-device'); await w.saveToothTreatment();
  r.retryAfterFailureSaves = DB('ledger_sessions').length === 1 && DB('teeth_status').filter(x => x.surface === 'DENTURE' && x.unit_id === DB('ledger_sessions')[0].id).length === 2 && !w.SyDenture.saveReady() && !$('toothModal').classList.contains('open');
  /* تغيّرُ المخطط بين المنتقي والحفظ ⇒ رفضٌ بصفر كتابة */
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick();
  w.SyDenture.take(row(47, 'DENTURE', T_FULL.id, 'completed', 'u-x'));
  await w.saveToothTreatment();
  r.revalidatesAtSave = w.__OPS.length === 0 && /تغيّر المخطط — السن 47: عليه جهاز متحرك مسجّل/.test(toasts());

  /* ⑧ سياقٌ متروك لا يخطف حفظَ مسارٍ آخر */
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick();
  const readyA = w.SyDenture.saveReady();
  w.pickToothTreatment(T_ARCH.id, T_ARCH.name);
  const afterArch = w.SyDenture.saveReady();
  w.eval('pendingRegionalArches = ["U"];'); w.confirmRegionalAreaPick(); await w.saveToothTreatment();
  r.stalePendingNeverSaves = readyA === true && afterArch === false && ops('teeth_status', 'insert').length === 0 && DB('ledger_sessions').length === 1 && DB('ledger_sessions')[0].type === T_ARCH.name
    && $('regionalAreaModal').classList.contains('sy-m-sm') && $('dentPickBox').style.display === 'none';
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null);
  const openedMd = $('regionalAreaModal').classList.contains('sy-m-md') && $('dentPickBox').style.display !== 'none';
  w.closeModal('regionalAreaModal');   /* إلغاءٌ بلا متابعة */
  w.pickToothTreatment(T_ARCH.id, T_ARCH.name);
  r.cancelledPickerRestoresRegionalModal = openedMd && $('regionalAreaModal').classList.contains('open') && $('regionalAreaModal').classList.contains('sy-m-sm') && !$('regionalAreaModal').classList.contains('sy-m-md')
    && $('dentPickBox').style.display === 'none' && !w.SyDenture.pickerActive() && doc.querySelectorAll('#regionalQuadChips [data-dent-arch]').length === 0 && doc.querySelectorAll('#regionalQuadChips button').length === 3;
  w.closeModal('regionalAreaModal');
  load(two); w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.SyDenture.confirmPick();
  w.eval('currentTooth = 36;'); const r1 = w.SyDenture.saveReady(); w.eval('currentTooth = null; window.__batchMode = true;'); const r2 = w.SyDenture.saveReady(); w.eval('window.__batchMode = false;');
  r.saveReadyNeedsItsOwnStep = r1 === false && r2 === false && w.SyDenture.saveReady() === true;
  w.SyDenture.clearPending();

  /* ⑨ الإزالة: زرٌّ بنافذة أيّ سنٍّ يعوّضه · تُحذف صفوفُ الوحدة وحدها · السؤالُ عن الجلسة المخطّطة */
  const unitRows = [X(14), X(15), X(26), row(14, 'DENTURE', T_PART.id, 'planned', 'sess-9'), row(15, 'DENTURE', T_PART.id, 'planned', 'sess-9'), row(26, 'DENTURE', T_FULL.id, 'completed', 'u-keep')];
  const unitSess = [{ id: 'sess-9', patient_id: 'pat-1', type: T_PART.name, description: 'الفك العلوي — الأسنان 14، 15', cost: 400000, status: 'planned', tooth_num: null, arch: 'U', treatment_key: T_PART.id, date: '2026-11-01' }];
  load(unitRows, unitSess); w.renderTeeth();
  await w.openToothModal(15, 'WHOLE');
  const sp = $('toothOptsContainer').innerHTML;
  const dIds = allowed();
  await w.openToothModal(26, 'WHOLE'); const sp26 = $('toothOptsContainer').innerHTML;
  r.removeButtonOnDentureTooth = /onclick="dentRemoveUnit\(15\)"/.test(sp) && /إزالة «جهاز متحرك جزئي \(أكريل\)»/.test(sp) && /undoExtraction\(15\)/.test(sp)
    && /onclick="dentRemoveUnit\(26\)"/.test(sp26) && /إزالة «جهاز متحرك كامل»/.test(sp26);
  /* على سنٍّ يعوّضه جهاز: علاجاتُ موقع القلع وحدها — لا زرعة ولا جسر (والقائمةُ غير فارغة فتُحدَّث _txAllowed) */
  r.dentureToothTakesNoImplantOrBridge = dIds.indexOf('implant') === -1 && dIds.indexOf('bridge') === -1 && dIds.indexOf('socket-dressing') > -1 && dIds.indexOf(T_PART.id) > -1 && dIds.indexOf(T_FULL.id) > -1;
  await w.dentRemoveUnit(15);
  const delOp = ops('teeth_status', 'delete')[0] || { filters: [] };
  r.removeUnitRows = w.__DIALOGS.length === 2 && /إزالة «جهاز متحرك جزئي \(أكريل\)» \(الفك العلوي — الأسنان 14، 15\)/.test(w.__DIALOGS[0].message) && w.__DIALOGS[0].danger === true
    && /نسألك عن حذف العلاجات المخطّطة/.test(w.__DIALOGS[0].message)
    && delOp.filters.some(f => f[0] === 'eq' && f[1] === 'surface' && f[2] === 'DENTURE') && delOp.filters.some(f => f[0] === 'in' && f[1] === 'tooth_num' && f[2].join() === '14,15')
    && DB('teeth_status').filter(x => x.surface === 'DENTURE').length === 1 && DB('teeth_status').filter(x => x.surface === 'DENTURE')[0].tooth_num === '26'
    && DB('teeth_status').filter(x => x.surface === 'WHOLE').length === 3 && !w.SyDenture.has(14) && w.SyDenture.has(26);
  r.removeAsksAboutSession = /جهاز متحرك جزئي \(أكريل\) \/ الفك العلوي — الأسنان 14، 15/.test(w.__DIALOGS[1].message) && w.__DELS.join() === 'sess-9' && /تمت إزالة جهاز متحرك جزئي/.test(toasts());
  load(unitRows, unitSess); w.__DIALOG_ANSWER = false; await w.dentRemoveUnit(14);
  r.removeCancelKeepsAll = w.__OPS.length === 0 && w.SyDenture.has(14) && w.__DELS.length === 0;
  load(unitRows, unitSess); w.__FAIL = (st) => (st.table === 'teeth_status' && st.op === 'delete') ? 'network' : null; await w.dentRemoveUnit(14);
  r.removeFailureIsLoud = w.SyDenture.has(14) && w.__DIALOGS.length === 1 && /لم تُحفظ الإزالة/.test(toasts());

  /* ⑩ خطّافا الجلسة: الإنجازُ يقلب صفوفَ وحدتها · حذفُ المخطّطة يزيل رسمَها · المنجزةُ يبقى رسمُها */
  load(unitRows, unitSess);
  const c1 = await w.SyDenture.onSessionComplete(unitSess[0]);
  r.completeFlipsUnit = c1 === true && DB('teeth_status').filter(x => x.unit_id === 'sess-9').every(x => x.status === 'completed') && w.SyDenture.map()['14'].st === 'completed'
    && DB('teeth_status').find(x => x.tooth_num === '26' && x.surface === 'DENTURE').status === 'completed' && ops('teeth_status', 'update').length === 1
    && (await w.SyDenture.onSessionComplete({ id: 'sess-none', patient_id: 'pat-1' })) === false;
  load(unitRows, unitSess);
  const d1 = await w.SyDenture.onSessionDeleted(unitSess[0]);
  r.deletePlannedRemovesDrawing = d1 === true && DB('teeth_status').filter(x => x.surface === 'DENTURE').length === 1 && !w.SyDenture.has(14) && !w.SyDenture.has(15) && w.SyDenture.has(26);
  const doneRows = unitRows.map(x => x.unit_id === 'sess-9' ? Object.assign({}, x, { status: 'completed' }) : x), doneSess = [Object.assign({}, unitSess[0], { status: 'completed' })];
  load(doneRows, doneSess);
  r.deleteCompletedKeepsDrawing = (await w.SyDenture.onSessionDeleted(doneSess[0])) === false && w.__OPS.length === 0 && w.SyDenture.has(14);

  /* ⑪ الحرّاس: إلغاءُ القلع · الزرعة/الجسر (الكتابة) · الفحص الأولي · التحديد المتعدد */
  load(unitRows, unitSess);
  await w.undoExtraction(14);
  r.undoExtractionBlocked = w.__OPS.length === 0 && w.__DIALOGS.length === 0 && /السن 14 يعوّضه جهاز متحرك — أزل الجهاز أولاً/.test(toasts()) && w.eval('teethMap["14"].WHOLE') === 'extracted';
  w.eval('currentTooth = 14; currentSurface = "WHOLE"; pendingToothStatus = "implant"; pendingToothLabel = "زراعة"; pendingTreatStatus = "planned";');
  const spI = await w.persistSpecialTreatment();
  w.eval('pendingToothStatus = "bridge";'); const spB = await w.persistSpecialTreatment();
  r.implantBridgeWriteGate = spI.blocked === true && spB.blocked === true && w.__OPS.length === 0;
  w.eval('currentTooth = null; currentSurface = null;');
  const eaI = w.examAllowed(14, T_IMPL), eaB = w.examAllowed(15, T_BRDG), baI = w.batchAllowed(14, T_IMPL, 'WHOLE'), eaFree = w.examAllowed(26, T_IMPL);
  load([X(14)]); const eaOk = w.examAllowed(14, T_IMPL), baOk = w.batchAllowed(14, T_IMPL, 'WHOLE');
  r.examBatchGuards = eaI.ok === false && /جهاز متحرك/.test(eaI.msg) && eaB.ok === false && baI.ok === false && /جهاز متحرك/.test(baI.msg) && eaFree.ok === false && eaOk.ok === true && baOk.ok === true;
  const bp = doc.createElement('div'); bp.id = 'batchPalette'; doc.body.appendChild(bp); w.renderBatchPalette();
  w.renderExamBar();
  r.palettes = bp.innerHTML.indexOf('جهاز متحرك') === -1 && bp.innerHTML.indexOf(T_IMPL.name) > -1 && $('examPalette').innerHTML.indexOf(T_FULL.name) > -1 && $('examPalette').innerHTML.indexOf(T_PART.name) > -1;

  /* ⑫ الفحص الأولي: الجهازُ القائم يُسجَّل بحالة الشريط — صفوفٌ بلا جلسة ولا خطوةٍ ثانية */
  load([X(36), X(37)]); w.eval('window.__examMode = true; examStatus = "existing_current"; examSelectedKey = null; examCount = 0;');
  w.examPick(T_PART.id);
  const exOpen = $('regionalAreaModal').classList.contains('open') && w.eval('examSelectedKey') === null;
  await w.SyDenture.confirmPick();
  const ex = DB('teeth_status').filter(x => x.surface === 'DENTURE');
  r.examRecordsExisting = exOpen && ex.length === 2 && ex.every(x => x.status === 'existing_current') && DB('ledger_sessions').length === 0 && !$('toothModal').classList.contains('open')
    && w.eval('examCount') === 1 && /للتراجع عنه أزله من الوضع العادي/.test(toasts()) && !w.SyDenture.saveReady();
  w.eval('examStatus = "condition";'); w.__TOASTS.length = 0; $('regionalAreaModal').classList.remove('open'); w.examPick(T_PART.id);
  r.examConditionRefused = !$('regionalAreaModal').classList.contains('open') && /اختر «موجود»/.test(toasts());
  w.eval('examStatus = "existing_other"; examSelectedKey = "' + T_PART.id + '";'); w.__OPS = []; w.__TOASTS.length = 0;
  await w.examStamp(46, 'O');
  r.examStampNeverWritesDentureOnSurface = w.__OPS.length === 0 && /الجهاز المتحرك يُسجَّل من زرّه/.test(toasts());
  w.eval('window.__examMode = false; examSelectedKey = null;');

  /* ⑬ العرضُ التاريخي: خريطةُ ذلك اليوم مؤقتة، والحيّةُ تعود بهويتها */
  load(unitRows, unitSess); const live = w.SyDenture.map();
  w.SyDenture.histBegin(); const emptied = Object.keys(w.SyDenture.map()).length === 0;
  w.SyDenture.take({ tooth_num: '36', surface: 'DENTURE', treatment_key: T_PART.id, status: 'planned' });
  w.SyDenture.histBegin(); const again = Object.keys(w.SyDenture.map()).length === 0;
  w.SyDenture.take({ tooth_num: '37', surface: 'DENTURE', treatment_key: T_PART.id, status: 'planned' });
  const histUnit = w.SyDenture.units();
  w.SyDenture.histEnd();
  r.historyKeepsLiveMap = emptied && again && histUnit.length === 1 && histUnit[0].id === null && histUnit[0].teeth.join() === '37' && w.SyDenture.map() === live && w.SyDenture.has(14) && !w.SyDenture.has(37);
  w.eval('window.__historyMode = true;'); const hOpen = w.SyDenture.openPicker(T_PART.id, T_PART.name, null); w.eval('window.__historyMode = false;');
  r.historyReadOnly = hOpen === true && !$('regionalAreaModal').classList.contains('open') && /عرض تاريخي للقراءة فقط/.test(toasts());

  /* ⑬-ب «فك أدرد» (شريط الفحص الأولي): القائمُ يُعلَّم مفقوداً بحالة الشريط · الزرعةُ والقلعُ المخطّط والمفقودُ لا تُمسّ · بلا جلسة */
  const edRows = [row(36, 'O', K), row(46, 'WHOLE', 'implant'), X(45, 'planned'), X(31), row(11, 'O', K)];
  load(edRows); w.eval('window.__examMode = true; examStatus = "existing_current"; examCount = 0;');
  w.dentOpenEdentulous();
  const edOpen = $('regionalAreaModal').classList.contains('open') && /فك أدرد/.test($('regionalAreaTitle').textContent) && $('dentTeethGrid').style.display === 'none'
    && doc.querySelectorAll('#regionalQuadChips [data-dent-arch]').length === 3;
  await w.SyDenture.confirmPick(); const edNeedsArch = /اختر فكاً واحداً/.test(toasts()) && w.__OPS.length === 0;
  w.dentArchToggle('L');
  const edNote = $('dentPickNote').textContent.replace(/\s+/g, ' ');
  r.edentPicker = edOpen && edNeedsArch && /الفك السفلي: 13 أسنان قائمة تُعلَّم مفقودة/.test(edNote) && /يبقى كما هو: /.test(edNote) && /46 \(مزروع\)/.test(edNote) && /45 \(قلعه مخطّط/.test(edNote) && !/31/.test(edNote.split('يبقى كما هو')[1]);
  w.__DIALOG_ANSWER = false; await w.SyDenture.confirmPick();
  r.edentCancelWritesNothing = w.__DIALOGS.length === 1 && w.__OPS.length === 0 && $('regionalAreaModal').classList.contains('open') && w.__DIALOGS[0].danger === true
    && /على السن 36 علاجاتٌ مرسومة تُزال/.test(w.__DIALOGS[0].message) && /13 أسنان قائمة تُعلَّم مفقودة/.test(w.__DIALOGS[0].message);
  w.__DIALOG_ANSWER = true; await w.SyDenture.confirmPick();
  const edW = DB('teeth_status').filter(x => x.surface === 'WHOLE' && x.treatment_key === 'extracted');
  r.edentMarks = edW.filter(x => x.status === 'existing_current').length === 13 && edW.length === 15
    && DB('teeth_status').find(x => x.tooth_num === '45').status === 'planned' && DB('teeth_status').find(x => x.tooth_num === '31').status === 'completed'
    && DB('teeth_status').find(x => x.tooth_num === '46').treatment_key === 'implant' && !DB('teeth_status').some(x => x.tooth_num === '36' && x.surface === 'O')
    && DB('teeth_status').some(x => x.tooth_num === '11' && x.surface === 'O') && !DB('teeth_status').some(x => x.surface === 'DENTURE')
    && DB('ledger_sessions').length === 0 && w.__REALLOC === 0 && w.eval('teethMap["36"].WHOLE') === 'extracted' && w.eval('teethMap["36"].__status.WHOLE') === 'existing_current'
    && !$('regionalAreaModal').classList.contains('open') && $('regionalAreaModal').classList.contains('sy-m-sm') && !w.SyDenture.pickerActive() && w.eval('examCount') === 13
    && /الفك السفلي: 13 أسنان عُلّمت مفقودة/.test(toasts());
  w.eval('examStatus = "condition";'); w.dentOpenEdentulous(); w.dentArchBoth(); await w.SyDenture.confirmPick();
  const edU = DB('teeth_status').filter(x => x.surface === 'WHOLE' && x.status === 'existing_other');
  r.edentBothArchesDefaultStatus = edU.length === 16 && /الفك العلوي: 16 أسنان قائمة تُعلَّم مفقودة|16 أسنان قائمة تُعلَّم مفقودة/.test(w.__DIALOGS[w.__DIALOGS.length - 1].message)
    && !DB('teeth_status').some(x => x.tooth_num === '11' && x.surface === 'O');
  w.__TOASTS.length = 0; w.__OPS = []; w.dentOpenEdentulous(); w.dentArchToggle('U'); await w.SyDenture.confirmPick();
  r.edentNothingToMark = /لا أسنان قائمة تُعلَّم/.test(toasts()) && w.__OPS.length === 0;
  w.closeModal('regionalAreaModal'); w.SyDenture.clearPending(); w.eval('window.__examMode = false; examStatus = "existing_other";');

  /* ⑭ نصوصُ الموضع والوحدات */
  r.areaText = w.dentAreaText('U', [16, 14, 15]) === 'الفك العلوي — الأسنان 14، 15، 16' && w.dentAreaText('L', [36]) === 'الفك السفلي — السن 36'
    && w.dentAreaText('U', w.DENT_FULL_TEETH.U) === 'الفك العلوي — كامل' && w.dentAreaText('U', w.DENT_FULL_TEETH.U.concat([18, 28])) === 'الفك العلوي — كامل'
    && w.dentAreaText('U', [24, 14, 15]) === 'الفك العلوي — الأسنان 14، 15، 24';
  r.typePredicates = w.SyDenture.isTp('denture_full') && w.SyDenture.isTp('denture_partial') && !w.SyDenture.isTp('arch') && w.SyDenture.isKey(T_FULL.id) && !w.SyDenture.isKey('whitening') && !w.SyDenture.isKey(null);
  /* وضعُ القراءة: لا منتقي ولا إزالة */
  load(unitRows, unitSess); const sub = w.SyDentSub.blockReadOnly; w.SyDentSub.blockReadOnly = () => true;
  const ro1 = w.SyDenture.openPicker(T_PART.id, T_PART.name, null); await w.dentRemoveUnit(14);
  w.SyDentSub.blockReadOnly = sub;
  r.readOnlyBlocks = ro1 === true && !$('regionalAreaModal').classList.contains('open') && w.__OPS.length === 0 && w.__DIALOGS.length === 0 && w.SyDenture.has(14);
  r.noJsErrors = (w.__ERRORS || []).length === 0;
  if (!r.noJsErrors) console.error('JS errors:', (w.__ERRORS || []).slice(0, 4));
  return r;
}

(async () => {
  const st = staticChecks(null);
  const w = await boot(null);
  const bh = await behave(w, true);
  const res = Object.assign({}, st, bh);
  const keys = Object.keys(res), bad = keys.filter(k => !res[k]);
  if (process.argv.indexOf('--verbose') > -1 || bad.length) keys.forEach(k => console.log((res[k] ? '  ✓ ' : '  ✗ ') + k));
  if (bad.length) { console.log(`⛔ prove-denture: ${keys.length - bad.length}/${keys.length}`); process.exit(1); }
  if (process.argv.indexOf('--self-test') === -1) { console.log(`✅ prove-denture: ${keys.length}/${keys.length} توكيداً`); return; }

  /* ── (٣) الطفرات ── */
  const D = 'pp-denture.js', PD = 'pp-dental.js', PM = 'pp-modules.js', PH = 'patient-profile.html', AP = 'appointments.html', MG = 'migrations/202_removable_prosthetics_core.sql';
  const MUT = [
    ['paint-draws-nothing', D, "if (svg && !dentLayerOf(svg, u)) svg.insertAdjacentHTML('beforeend', dentFacialLayer(n, u, inUnit, i > lo, i < hi, i === mid, i === mid - 1));", ''],
    ['planned-drawn-solid', D, "var a = txPathAttrs(st, c.fill, c.stroke, 'dn' + n, 0.92);", "var a = txPathAttrs('completed', c.fill, c.stroke, 'dn' + n, 0.92);"],
    ['no-connector', D, "for (var i = lo; i <= hi; i++) {\n      var n = row[i], inUnit = u.teeth.indexOf(n) !== -1;", "for (var i = lo; i <= hi; i++) {\n      var n = row[i], inUnit = u.teeth.indexOf(n) !== -1; if (!inUnit) continue;"],
    ['base-bleeds-wrong-side', D, "var x1 = bleedLeft ? -dentBleed(n, midLeft) : 6, x2 = bleedRight ? 100 + dentBleed(n, midRight) : 94;", "var x1 = bleedRight ? -dentBleed(n, midLeft) : 6, x2 = bleedLeft ? 100 + dentBleed(n, midRight) : 94;"],
    ['midline-gap-left-open', D, "dentFacialLayer(n, u, inUnit, i > lo, i < hi, i === mid, i === mid - 1)", "dentFacialLayer(n, u, inUnit, i > lo, i < hi, false, false)"],
    ['bases-overlap-again', D, "return Math.round((px * 100 / w + DENT_BLEED_EPS) * 100) / 100;", "return 24;"],
    ['rows-upsert-not-insert', D, "var r = await window.sb.from('teeth_status').insert(rows);", "var r = await window.sb.from('teeth_status').upsert(rows, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });"],
    ['no-rollback', D, "var rb = await window.sb.from('ledger_sessions').delete().eq('id', sess.id).eq('doctor_id', currentUser.id);", "var rb = null;"],
    ['unit-not-session-id', D, "sess = rS.data; unitId = sess.id;", "sess = rS.data; unitId = dentUuid();"],
    ['existing-creates-session', D, "var billable = (status === 'completed' || status === 'planned');", "var billable = true;"],
    ['condition-accepted', D, "if (status === 'condition') { showToast('🩺 «مراقبة» لا تُسجَّل لجهازٍ متحرك — اختر منجز أو مخطّط أو موجود مسبقاً'); return; }", ''],
    ['no-revalidation', D, "if (bad) { showToast('⚠️ تغيّر المخطط — ' + bad); return; }\n  var billable", "var billable"],
    ['mark-missing-skipped', D, "var mErr = await dentMarkMissing(markNow, pendingProviderId);\n      if (mErr) { failMsg", "var mErr = '';\n      if (mErr) { failMsg"],
    ['failure-drops-step-context', D, "  if (!made.length) { showToast('⚠️ ' + (failMsg || 'لم يُحفظ الجهاز')); return; }\n  pendingDenture = null;", "  pendingDenture = null;\n  if (!made.length) { showToast('⚠️ ' + (failMsg || 'لم يُحفظ الجهاز')); return; }"],
    ['area-text-unsorted', D, "var sorted = nums.slice().sort(function (a, b) { return a - b; });", "var sorted = nums.slice();"],
    ['standing-not-confirmed', D, "if (toMark.length) {\n      var ok = await SyDialog.confirm({", "if (false) {\n      var ok = await SyDialog.confirm({"],
    ['blockers-ignored', D, "if (c.blockers.length) {\n        showToast(", "if (false) {\n        showToast("],
    ['planned-extraction-selectable', D, "if (typeof isExtractionPlanned === 'function' && isExtractionPlanned(n)) return { ok: false, block: true, why: 'قلعه مخطّط — أنجز القلع أولاً' };", ''],
    ['wisdom-preselected', D, "return dentSelectable(arch).filter(function (t) { return (t % 10) !== 8; });", "return dentSelectable(arch);"],
    ['save-ready-always', D, "&& pendingRegionalType === 'arch' && pendingToothStatus === pd.key && !currentTooth && !window.__batchMode && !window.__examMode);", ");"],
    ['picker-not-reset', PD, "  if (window.SyDenture) window.SyDenture.pickerReset();   /* M202: النافذةُ مشتركة مع منتقي الجهاز المتحرك */\n", ''],
    ['denture-hidden-on-tooth', PD, "if (window.SyDenture.isTreatment(t)) return true;   /* v710", "if (window.SyDenture.isTreatment(t)) return false;   /* v710"],
    ['tooth-arch-ignored', PD, "window.SyDenture.openPicker(status, label, _dArch ? { arch: _dArch } : null);", "window.SyDenture.openPicker(status, label, null);"],
    ['removable-tab-missing', PD, "prosthodontics:'🔗 تعويضات ثابتة', prosth_removable:'🧩 تعويضات متحركة', implantology", "prosthodontics:'🔗 تعويضات ثابتة', implantology"],
    ['edent-marks-implants-too', D, "if (s.standing) mark.push(t); else if (s.block) skip.push({ t: t, why: s.why });", "mark.push(t);"],
    ['edent-touches-missing-teeth', D, "    if (typeof isExtractionDone === 'function' && isExtractionDone(t)) return;\n    var s = dentToothState(t);\n    if (s.standing)", "    var s = { standing: true };\n    if (s.standing)"],
    ['edent-without-confirm', D, "confirmText: 'علّمها مفقودة', cancelText: 'رجوع', danger: !!charted\n  })) return;", "confirmText: 'علّمها مفقودة', cancelText: 'رجوع', danger: !!charted\n  }) && false) return;"],
    ['edent-ignores-bar-status', D, "var st = (typeof examStatus !== 'undefined' && examStatus === 'existing_current') ? 'existing_current' : 'existing_other';\n  var err", "var st = 'existing_other';\n  var err"],
    ['drawn-treatments-not-named', D, "return n.length ? '\\n\\n⚠️ على '", "return false ? '\\n\\n⚠️ على '"],
    ['m203-category-drifts', 'migrations/203_removable_prosthetics_category.sql', "'denture_full', 'prosth_removable', 30,", "'denture_full', 'prosthodontics', 30,"],
    ['m203-backfill-unscoped', 'migrations/203_removable_prosthetics_category.sql', "   AND category = 'prosthodontics';", "   ;"],
    ['report-category-missing', 'rpt-treat.js', "    'prosth_removable':'🧩 تعويضات متحركة',\n", ''],
    ['implant-offered-on-denture-tooth', PD, "      if (window.SyDenture.has(n) && ((t.target_part || 'crown') === 'implant' || (t.target_part || 'crown') === 'bridge')) return false;\n", ''],
    ['regional-list-without-denture', PD, "if (tpR !== 'quadrant' && tpR !== 'arch' && tpR !== 'mouth' && !(window.SyDenture && window.SyDenture.isTp(tpR))) continue;", "if (tpR !== 'quadrant' && tpR !== 'arch' && tpR !== 'mouth') continue;"],
    ['save-branch-removed', PD, "  if (window.SyDenture && window.SyDenture.saveReady()) { await window.SyDenture.save(cost, units, date, notes); return; }\n", ''],
    ['undo-extraction-open', PD, "  if (window.SyDenture && window.SyDenture.has(num)) { showToast('🦷 السن ' + num + ' يعوّضه جهاز متحرك — أزل الجهاز أولاً'); return; }\n", ''],
    ['implant-write-gate-open', PD, "if ((pendingTp === 'implant' || isBridgeTreatment) && window.SyDenture && window.SyDenture.has(currentTooth)) {", "if (false) {"],
    ['remove-button-missing', PD, "    _special = window.SyDenture.removeBtnHtml(n) + _special;\n", ''],
    ['wipe-hits-denture-row', PD, "        .eq('tooth_num', String(currentTooth)).neq('surface', 'DENTURE');   /* M202 */", "        .eq('tooth_num', String(currentTooth));"],
    ['paint-hook-removed', PD, "  if (window.SyDenture) window.SyDenture.paint();   /* M202: طبقةُ الجهاز المتحرك — بعد اكتمال المنظرين (بلا جهاز ⇒ صفر أثر) */\n", ''],
    ['session-where-empty', PD, "  if (x && !x.tooth_num) return x.description ? ' / ' + x.description : ((x.arch && ARCH_LABELS[x.arch]) ? ' / ' + ARCH_LABELS[x.arch] : '');\n", ''],
    ['exam-pick-stamps', PM, "  if (window.SyDenture && window.SyDenture.isKey(key)) {\n    if (examStatus === 'condition')", "  if (false) {\n    if (examStatus === 'condition')"],
    ['exam-stamp-open', PM, "  if (window.SyDenture && window.SyDenture.isTreatment(t)) { showToast('🦷 الجهاز المتحرك يُسجَّل من زرّه بشريط الفحص — لا بالنقر على سن'); return; }   /* M202 */\n", ''],
    ['exam-allows-implant', PM, "    if ((tp === 'bridge' || tp === 'implant') && window.SyDenture && window.SyDenture.has(n)) return { ok: false, msg: '🦷 يعوّضه جهاز متحرك — أزل الجهاز من الوضع العادي' };\n", ''],
    ['batch-palette-lists-denture', PM, "    if (window.SyDenture && window.SyDenture.isTp(tp)) continue;                   // M202: جهاز متحرك → منتقيه الخاص («علاج جماعي»)\n", ''],
    ['loader-keeps-denture-in-teethmap', PH, "    if (window.SyDenture && window.SyDenture.take(t)) return;   /* M202: صفُّ الجهاز المتحرك (surface='DENTURE') بخريطته المنفصلة — لا يدخل teethMap */\n", ''],
    ['history-live-map-lost', PH, "    if (window.SyDenture) window.SyDenture.histEnd();   /* M202: خريطةُ الجهاز الحيّة تعود كما كانت */\n", ''],
    ['profile-complete-hook-removed', PH, "  if (sess && !sess.tooth_num && window.SyDenture) { await window.SyDenture.onSessionComplete(sess); return ''; }\n", ''],
    ['profile-wipe-hits-denture', PH, ".eq('tooth_num', tn).neq('surface', 'DENTURE');   /* M202: محوُ السن لا يطال صفَّ الجهاز المتحرك */\n  if (w.error) { console.warn('drawPendingImplant wipe:'", ".eq('tooth_num', tn);\n  if (w.error) { console.warn('drawPendingImplant wipe:'"],
    ['appt-complete-mirror-removed', AP, "  if (s && !s.tooth_num) { await _apptSyncDentureRowsOnComplete(s, providerOverride); return; }   /* M202 */\n", ''],
    ['appt-wipe-hits-denture', AP, ".eq('tooth_num', tn).neq('surface', 'DENTURE');   /* M202 */\n      if (wI.error) { console.warn('implant-complete wipe warn:'", ".eq('tooth_num', tn);\n      if (wI.error) { console.warn('implant-complete wipe warn:'"],
    ['migration-drops-surface', MG, "'SXM'::text, 'SXD'::text, 'DENTURE'::text,", "'SXM'::text, 'SXD'::text,"],
    ['migration-catalog-drifts', MG, "'denture-partial-flex', 'جهاز متحرك جزئي (مرن)', 'ج', '#b45309', '#78350f', 0, false, true,", "'denture-partial-flex', 'جهاز متحرك جزئي (مرن)', 'ج', '#b45309', '#78350f', 0, false, false,"]
  ];
  let bit = 0; const dull = [];
  for (const [name, file, find, repl] of MUT) {
    if (LIVE[file].split(find).length !== 2) { console.log('  ✗ الطفرة «' + name + '»: مرساتُها ليست فريدة بـ' + file); dull.push(name); continue; }
    const over = {}; over[file] = LIVE[file].replace(find, repl);
    let red = false;
    try {
      const s2 = staticChecks(over);
      if (Object.keys(s2).some(k => !s2[k])) red = true;
      if (!red && /\.js$/.test(file)) { const w2 = await boot(over); const b2 = await behave(w2, true); red = Object.keys(b2).some(k => !b2[k]); w2.close(); }
    } catch (e) { red = true; }
    if (red) bit++; else { dull.push(name); console.log('  ✗ الطفرة «' + name + '» لم تُحمرّ شيئاً'); }
  }
  /* الطبقةُ نفسها غائبة (الملفُّ لم يُحمَّل): المخططُ يُرسم كما كان — الخطّافاتُ كلها محروسةٌ بوجودها */
  const w0 = await boot({ __noDenture: true }); const b0 = await behave(w0, false);
  const absentOk = Object.keys(b0).every(k => b0[k]);
  if (!absentOk) console.log('  ✗ بلا pp-denture.js: ' + Object.keys(b0).filter(k => !b0[k]).join('، '));
  if (dull.length || !absentOk) { console.log(`⛔ prove-denture: ${keys.length} توكيداً · ${bit}/${MUT.length} طفرة تعضّ`); process.exit(1); }
  console.log(`✅ prove-denture: ${keys.length}/${keys.length} توكيداً · ${bit}/${MUT.length} طفرة تعضّ · الصفحةُ تعمل بلا الطبقة`);
  process.exit(0);
})().catch(e => { console.error('⛔ prove-denture:', e && e.stack || e); process.exit(1); });
