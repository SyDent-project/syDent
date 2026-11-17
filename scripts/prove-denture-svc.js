#!/usr/bin/env node
/* M208 — مثبتُ خدمات ما بعد تسليم الجهاز المتحرك (ج4-أ) على الكود الحيّ:
   pp-denture-svc.js وخطّافاتُه (pp-dental.js · pp-denture.js · patient-profile.html · appointments.html · treatments.html).
   (١) العقدُ الثابت: الترحيل (عمودان nullable + وسمُ الكتالوج + الدالةُ بخصائصها) · الأسلاك · لا كتابةَ لـunit_teeth.
   (٢) السلوك على الصفحة الحقيقية (jsdom + عُدّة dom-smoke + القاعدة الوهمية لمثبت الجهاز):
       الشريحةُ زرّ · نافذةُ الجهاز (سجلّ · خدمات · «إضافة سن» للجزئي وحده) · الخدمةُ جلسةُ فكٍّ مربوطة بلا مساس بالمخطط ·
       «إضافة سن»: المنتقي · المنجزةُ ترسم بمعرّف الوحدة ومفتاحها وحالتها · المخطّطةُ ترسم عند الإنجاز · الحذفُ يعيد الرسم ·
       فشلُ الرسم يسحب الجلسة · الحالاتُ غير المالية مرفوضة · جهازٌ مخطّط لا يقبل خدمة · سياقٌ متروك لا يحفظ ·
       مرآةُ صفحة المواعيد تُنفَّذ حرفياً · مخططٌ بلا جهاز لا يتغيّر فيه بايت.
   (٣) الواجهة الإنجليزية: كلُّ نصٍّ يراه الطبيب يمرّ بالمحرّك الحقيقي.
   (٤) طفراتٌ متعمَّدة — كلٌّ منها يجب أن تُحمرّ توكيداً واحداً على الأقل (#342). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت خدمات الجهاز (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const POOL = require('./mutant-pool');   /* الطفراتُ على كل الأنوية + التوقّفُ عند أول توكيدٍ أحمر */
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');

const FILES = ['pp-denture-svc.js', 'pp-denture.js', 'pp-dental.js', 'pp-core.js', 'patient-profile.html', 'patient-profile.css', 'appointments.html', 'treatments.html',
  'migrations/208_denture_services.sql', 'migrations/203_removable_prosthetics_category.sql', 'db/schema.sql', 'scripts/db-bootstrap.py', 'scripts/cache-bust.sh',
  'scripts/check-catalog-parity.js', 'scripts/check-modal-behaviour.js', 'scripts/validate.sh', 'scripts/prove-denture.js', 'i18n-en.js', 'theme.js', 'lab-slip.js',
  'labs.html', 'pp-clinical.js', 'supabase/functions/ai-assist/index.ts'];
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

/* القاعدةُ الوهمية والخطّافاتُ مصدرُها مثبتُ الجهاز نفسه (لا نسخةَ ثانية تنحرف) */
const FAKE_DB = (() => {
  const s = LIVE['scripts/prove-denture.js'], a = s.indexOf('const FAKE_DB = `'), b = s.indexOf('`;\n\nfunction page(over)', a);
  if (a < 0 || b < a) throw new Error('FAKE_DB: الاقتطاعُ من prove-denture.js فشل');
  return new Function('return `' + s.slice(a + 'const FAKE_DB = `'.length, b) + '`;')();
})();

function page(over) {
  const src = f => (over && over[f] != null) ? over[f] : (LIVE[f] != null ? LIVE[f] : (LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const PP = src('patient-profile.html');
  const a = PP.search(/<div class="modal-overlay[^"]*" id="regionalAreaModal">/), b = PP.indexOf('<!-- Modal: السن -->');
  if (a < 0 || b < a) throw new Error('regionalAreaModal: الاقتطاعُ فشل');
  let html = HARNESS.replace(/<link rel="stylesheet"[^>]*>/g, '');
  html = html.replace('<div id="chartLegend"></div>', '<div id="chartLegend"></div><div class="ortho-banner" id="orthoBanner"></div><div class="ortho-banner dent-banner" id="dentureBanner" style="display:none;"></div>' + PP.slice(a, b));
  html = html.replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => {
    const rel = path.relative(ROOT, f), wrap = x => '<script>' + src(x).replace(/<\/script/gi, '<\\/script') + '</script>';
    let out = wrap(rel);
    if (rel === 'pp-dental.js') out += wrap('pp-denture.js') + ((over && over.__noSvc) ? '' : wrap('pp-denture-svc.js'));
    return out;
  });
  const ia = PP.indexOf('function ppIngestToothRow(t) {'), ib = ia < 0 ? -1 : PP.indexOf('\n}\n', ia);
  const ingest = (ia > -1 && ib > ia) ? PP.slice(ia, ib + 2) : '';
  /* خطّافا الجلسة بصفحة المريض يُقتطعان حرفياً (ترتيبُ النداء جزءٌ من العقد) */
  const hook = (from, to) => { const i = PP.indexOf(from), j = PP.indexOf(to, i); return (i > -1 && j > i) ? PP.slice(i, j) : ''; };
  const complete = hook('async function syncToothStatusOnComplete(sess) {', "  if (!sess || !sess.tooth_num) return '';");
  const del = hook('  /* M202: حذفُ جلسة جهازٍ متحرك مخطّطة', '  /* M145-b: حذفُ جلسة جسرٍ مخطّط');
  const extra = 'window.__completeHook = ' + (complete ? complete.replace('async function syncToothStatusOnComplete(sess) {', 'async function (sess) {') + ' return "__TOOTH__"; }' : 'null') + ';\n'
    + 'window.__deleteHook = ' + (del ? 'async function (sess) {' + del + '}' : 'null') + ';\n'
    + '(function(){ var st = showToast; showToast = function(m){ window.__i18nAdd(m); return st.apply(this, arguments); }; })();\n'
    + 'window.__grabSvc = function(){ var roots = [], q = function(sel){ var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) roots.push(l[i]); };\n'
    + '  q(".dsv-dialog"); q("#dentureBanner"); q("#toothStep2Title"); q(".dsv-open");\n'
    + '  roots.forEach(function(r){ [r].concat(Array.prototype.slice.call(r.querySelectorAll("*"))).forEach(function(el){\n'
    + '    ["title", "aria-label", "placeholder"].forEach(function(a){ var v = el.getAttribute && el.getAttribute(a); if (v) window.__i18nAdd(v); });\n'
    + '    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) window.__i18nAdd(c.nodeValue); }); }); };';
  return html.replace('</body>', '<script>' + FAKE_DB + '\n' + ingest + '\n' + extra + '</script></body>');
}
function boot(over) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(page(over), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

/* أسماءٌ لاتينية لبيانات العيادة ⇒ أيُّ عربيةٍ تبقى بعد الترجمة نصُّ واجهةٍ بلا ترجمة */
const T = (id, name, tp, extra) => Object.assign({ treatment_key: id, id, name, label: 'x', fill: '#e11d74', stroke: '#9d174d', price: 50000, target_part: tp, category: 'prosth_removable',
  is_active: true, needs_lab: false, dentition_scope: 'permanent', currency: 'SYP', price_overrides: {}, denture_svc: '' }, extra || {});
const T_PART = T('denture-partial-acrylic', 'Partial ACR', 'denture_partial', { needs_lab: true });
const T_FULL = T('denture-full', 'Complete DENT', 'denture_full', { needs_lab: true });
const T_RELINE = T('denture-reline-lab', 'Reline LAB', 'arch', { denture_svc: 'service', needs_lab: true });
const T_ADJ = T('denture-adjust', 'Adjust DENT', 'arch', { denture_svc: 'service' });
const T_ADD = T('denture-add-tooth', 'Add TOOTH', 'arch', { denture_svc: 'add', needs_lab: true });
const T_ARCH = T('whitening', 'Whitening', 'arch', { category: 'cosmetic' });
const T_OFF = T('denture-clasp', 'Clasp OFF', 'arch', { denture_svc: 'service', is_active: false });

let pass = 0, fail = 0, BAILING = false;
/* بتشغيل الطفرات يقف عند أول توكيدٍ أحمر — توكيدٌ واحد يكفي لإثبات أن الطفرة تعضّ (mutant-pool.js) */
function ok(c, name) { if (c) pass++; else { fail++; if (BAILING) throw POOL.BAIL; console.log('  ✗ ' + name); } }

function staticChecks(F) {
  const M = F['migrations/208_denture_services.sql'], S = F['pp-denture-svc.js'], PD = F['pp-dental.js'], DN = F['pp-denture.js'], PH = F['patient-profile.html'], AP = F['appointments.html'], TH = F['treatments.html'];
  ok(/ALTER TABLE public\.treatments ADD COLUMN IF NOT EXISTS denture_svc text;/.test(M)
    && /CHECK \(denture_svc IS NULL OR \(denture_svc = ANY \(ARRAY\['service'::text, 'add'::text\]\) AND target_part = 'arch'\)\);/.test(M),
    'M208: denture_svc is a closed marker on jaw treatments only');
  ok(/ADD COLUMN IF NOT EXISTS denture_unit uuid;/.test(M) && /ADD COLUMN IF NOT EXISTS denture_add text;/.test(M)
    && /CHECK \(denture_unit IS NULL OR \(tooth_num IS NULL AND arch IS NOT NULL AND unit_teeth IS NULL\)\);/.test(M)
    && /CHECK \(denture_add IS NULL OR \(denture_add ~ '\^\[1-4\]\[1-8\]\(,\[1-4\]\[1-8\]\)\{0,13\}\$' AND denture_unit IS NOT NULL\)\);/.test(M),
    'M208: two nullable session columns with shape checks — a service is never a denture session (unit_teeth stays NULL)');
  ok(!/target_part_check/.test(M) && !/denture_service'/.test(M), 'M208: no new target_part value (unknown types fall through as crown surfaces elsewhere)');
  const seg = t => { const a = t.indexOf('-- CATALOG-PARITY-START'), b = t.indexOf('-- CATALOG-PARITY-END', a); return a > -1 && b > a ? t.slice(a, b) : ''; };
  const rows = s => (s.match(/\n    \(NEW\.id, '[^\n]*\)[,\n]/g) || []).map(x => x.trim().replace(/,$/, ''));
  const r8 = rows(seg(M)), r3 = rows(seg(F['migrations/203_removable_prosthetics_category.sql']));
  ok(r8.length === 40 && r3.length === 33 && r3.every((x, i) => r8[i] === x.replace(/\)$/, ', NULL)')),
    'M208: the 33 existing catalog rows are M203 verbatim plus a NULL marker');
  const svc = r8.slice(33);
  ok(svc.length === 7 && svc.every((x, i) => new RegExp("^\\(NEW\\.id, 'denture-[a-z-]+', '[^']+', '[^']+', '#[0-9a-f]{6}', '#[0-9a-f]{6}', 0, false, (true|false), 'arch', 'prosth_removable', " + (34 + i) + ", false, false, true, '[^']+', 'permanent', '(service|add)'\\)$").test(x))
    && svc.filter(x => /'add'\)$/.test(x)).length === 1 && /'denture-add-tooth'[^\n]*'add'\)/.test(M),
    'M208: seven denture services seeded as jaw treatments (34..40) — exactly one adds a tooth');
  const strip = t => t.replace(/-- زرع الكتالوج المرجعي \(\d+ علاجاً · كل الأسعار 0\)/, '').replace(seg(t), '').replace(/[\s\S]*?(CREATE OR REPLACE FUNCTION public\.handle_new_doctor)/, '$1').replace(/\$function\$;[\s\S]*$/, '$function$;');
  ok(strip(M) === strip(F['migrations/203_removable_prosthetics_category.sql']) && /SECURITY DEFINER\s+SET search_path TO 'public'/.test(M) && /EXCEPTION WHEN OTHERS THEN/.test(M) && !/GRANT /i.test(M) && !/DROP (TABLE|COLUMN|FUNCTION)/i.test(M),
    'M208: handle_new_doctor outside the catalog block is M203 verbatim — same properties, signup never blocked');
  const Mcode = M.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  ok(/BEGIN;[\s\S]*COMMIT;/.test(Mcode) && !/payment_splits|ledger_payments|reallocate|cost|amount/i.test(Mcode.replace(/'[^']*'/g, "''")), 'M208: one transaction, no financial object touched');
  const SC = F['db/schema.sql'];
  ok(/"denture_svc" "text"/.test(SC) && /"denture_unit" "uuid"/.test(SC) && /"denture_add" "text"/.test(SC) && /treatments_denture_svc_check/.test(SC) && /ledger_sessions_denture_unit_shape/.test(SC) && /ledger_sessions_denture_add_format/.test(SC) && /'denture-adjust'/.test(SC),
    'schema.sql mirrors M208 (columns, checks, catalog)');
  ok(/208_denture_services\.sql/.test(F['scripts/db-bootstrap.py']), 'db-bootstrap registers M208');
  const Scode = S.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/unit_teeth/.test(Scode) && !/\.upsert\(/.test(Scode) && /denture_unit: u\.id/.test(S) && /payload\.denture_add = dentTeethCsv\(add\)/.test(S),
    'module: writes denture_unit / denture_add — never unit_teeth (the appointment mirror would draw a new denture from it), never upsert');
  ok(/function dsvKind\(t\) \{ return \(t && t\.target_part === 'arch' && \(t\.denture_svc === 'service' \|\| t\.denture_svc === 'add'\)\) \? t\.denture_svc : ''; \}/.test(S), 'module: a service is a marked jaw treatment');
  const iK = PD.indexOf('  if (window.SyDentSvc) window.SyDentSvc.clearPending();'), iD = PD.indexOf('window.SyDenture.openPicker(status, label, _dArch'), iS = PD.indexOf('if (window.SyDentSvc.isTreatment(tr)) {'), iR = PD.indexOf("if (!spacerFlow && (tp === 'quadrant' || tp === 'arch' || tp === 'mouth')) {", iD);
  ok(iK > -1 && iK < PD.indexOf('if (window.SyDenture) {\n    window.SyDenture.clearPending();') && iD > iK && iS > iD && iR > iS && (PD.match(/SyDentSvc\.clearPending\(\)/g) || []).length === 1
    && /if \(window\.SyDentSvc\.isTreatment\(tr\)\) \{[\s\S]{0,260}window\.SyDentSvc\.start\(status, label, _svTooth \? \{ tooth: _svTooth \} : null\);\n      return;/.test(PD),
    'pick handler: a stale service context is cleared before any early return (denture picker included), and a service routes to its own flow before the plain jaw picker');
  const iG = PD.indexOf('if (window.SyDenture && window.SyDenture.saveReady())'), iG2 = PD.indexOf('if (window.SyDentSvc && window.SyDentSvc.saveReady()) { await window.SyDentSvc.save(cost, units, date, notes); return; }'), iG3 = PD.indexOf("if (pendingRegionalType === 'quadrant' || pendingRegionalType === 'arch' || pendingRegionalType === 'mouth') {", iG);
  ok(iG > -1 && iG2 > iG && iG3 > iG2, 'save gate: the service save runs before the plain regional save');
  ok(/    _special = window\.SyDenture\.removeBtnHtml\(n\) \+ _special;\n    if \(window\.SyDentSvc\) _special = window\.SyDentSvc\.btnHtml\(n\) \+ _special;/.test(PD), 'tooth window: the services button sits beside the remove button');
  ok(/if \(bar && window\.SyDentSvc\) window\.SyDentSvc\.decorate\(bar, units\);/.test(DN) && DN.indexOf('if (!units.length) return;\n  if (bar && window.SyDentSvc)') > -1, 'banner: chips are decorated only when a denture exists');
  ok(/if \(s && !s\.tooth_num && s\.denture_add && \(s\.arch === 'U' \|\| s\.arch === 'L'\)\) \{/.test(DN), 'sessWhere: an add-tooth session is located by its added teeth');
  ok(PH.indexOf('<script src="pp-denture-svc.js?v=') > PH.indexOf('<script src="pp-denture.js?v=') && PH.indexOf('<script src="pp-denture-svc.js?v=') < PH.indexOf('<script src="pp-plan.js?v='), 'profile: the module loads right after pp-denture.js');
  const iC = PH.indexOf('if (sess && window.SyDentSvc && window.SyDentSvc.isSession(sess)) { await window.SyDentSvc.onSessionComplete(sess); return window.SyDentSvc.completeNote(sess); }');
  ok(iC > -1 && iC < PH.indexOf('if (sess && !sess.tooth_num && window.SyDenture) { await window.SyDenture.onSessionComplete(sess);'), 'profile: completion hook — a service session never enters the denture hook');
  ok(/try \{ await window\.SyDentSvc\.onSessionDeleted\(sess\); \} catch \(e\)/.test(PH), 'profile: delete hook wired');
  ok(/denture_svc: \(t\.denture_svc === 'service' \|\| t\.denture_svc === 'add'\) \? t\.denture_svc : '',/.test(F['pp-core.js']), 'treatments loader carries the marker');
  ok(/if \(await _apptDentureAddOnComplete\(s, providerOverride\)\) return;/.test(AP) && AP.indexOf('if (await _apptDentureAddOnComplete(s, providerOverride)) return;') < AP.indexOf(".eq('unit_id', s.id).eq('surface', 'DENTURE').eq('status', 'planned').select('tooth_num');"),
    'appointments: the mirror runs before the denture path');
  /* صفحة العلاجات: بلاطتان صريحتان (طلبُ المالك: الحقلُ المخفيّ لم يُعثَر عليه) — التحويلُ بالاتجاهين يُنفَّذ من الملف */
  const cutFn = (name) => { const i = TH.indexOf('function ' + name + '('), j = TH.indexOf('\n}\n', i); return (i > -1 && j > i) ? TH.slice(i, j + 2) : ''; };
  let ui = null, db = null;
  try { const c = {}; vm.createContext(c); vm.runInContext(cutFn('_normDentSvc') + '\n' + TH.slice(TH.indexOf('function _normDentSvc('), TH.indexOf('\n', TH.indexOf('function _normDentSvc('))) + '\n' + cutFn('uiTargetOf') + '\n' + cutFn('dbTargetOf') + '\nthis.ui = uiTargetOf; this.db = dbTargetOf;', c); ui = c.ui; db = c.db; } catch (e) { ui = null; }
  const J = x => JSON.stringify(x);
  ok(!!ui && ui({ target_part: 'arch', denture_svc: 'service' }) === 'denture_service' && ui({ target_part: 'arch', denture_svc: 'add' }) === 'denture_add' && ui({ target_part: 'arch', denture_svc: '' }) === 'arch' && ui({ target_part: 'arch' }) === 'arch'
    && ui({ target_part: 'crown', denture_svc: 'service' }) === 'crown' && ui({ target_part: 'arch', denture_svc: 'zzz' }) === 'arch' && ui({}) === 'crown' && ui({ target_part: 'denture_partial' }) === 'denture_partial',
    'catalog page: a marked jaw treatment shows as its own tile — a plain jaw treatment stays «jaw»');
  ok(!!db && J(db('denture_service')) === J({ target_part: 'arch', denture_svc: 'service' }) && J(db('denture_add')) === J({ target_part: 'arch', denture_svc: 'add' }) && J(db('arch')) === J({ target_part: 'arch', denture_svc: null })
    && J(db('crown')) === J({ target_part: 'crown', denture_svc: null }) && ['denture_service', 'denture_add', 'arch', 'mouth', 'crown', 'denture_full'].every(t => ui(db(t)) === t),
    'catalog page: each tile saves a valid (target_part · marker) pair and round-trips — nothing but the two service tiles carries a marker');
  ok(/<div class="target-opt" data-target="denture_service" data-m208 style="display:none;">/.test(TH) && /<div class="target-opt" data-target="denture_add" data-m208 style="display:none;">/.test(TH)
    && TH.indexOf('data-target="denture_service"') > TH.indexOf('data-target="denture_partial"') && TH.indexOf('data-target="denture_add"') < TH.indexOf('data-target="quadrant"')
    && /for \(var i = 0; i < ts\.length; i\+\+\) ts\[i\]\.style\.display = window\.__m208T \? '' : 'none';/.test(TH) && /window\.__m208T = !!\(data && data\.length && Object\.prototype\.hasOwnProperty\.call\(data\[0\], 'denture_svc'\)\);\n  syncDentSvcTiles\(\);/.test(TH)
    && !/tDentSvc|dentSvcWrap/.test(TH), 'catalog page: two explicit tiles beside the denture tiles, hidden until the column exists — no hidden field left');
  ok(/var _savedDb = dbTargetOf\(_savedUi\), _savedTarget = _savedDb\.target_part;/.test(TH) && /if \(window\.__m208T\) updatePayload\.denture_svc = _savedDb\.denture_svc;/.test(TH)
    && /target_part: dbTargetOf\(pickedTarget\)\.target_part,/.test(TH) && /if \(window\.__m208T\) insertPayload\.denture_svc = dbTargetOf\(pickedTarget\)\.denture_svc;/.test(TH)
    && (TH.match(/pickTarget\(uiTargetOf\(t\)\);/g) || []).length === 2 && /\? uiTargetOf\(existing\)/.test(TH) && !/target_part: pickedTarget,/.test(TH),
    'catalog page: add, edit and duplicate all go through the one mapping (column-gated)');
  ok(/uiTargetOf\(t\) !== activeFilter\) return false;/.test(TH) && /var k = uiTargetOf\(t\); byT\[k\]/.test(TH) && /var tp = targetMap\[uiTargetOf\(t\)\] \|\| targetMap\.crown;/.test(TH)
    && /\['denture_service','خدمة جهاز'\], \['denture_add','إضافة سن لجهاز'\]/.test(TH) && /'denture_service': \{ text:'خدمة جهاز',  tone:'purple' \}/.test(TH) && /'denture_add':     \{ text:'إضافة سن لجهاز', tone:'purple' \}/.test(TH),
    'catalog page: the filter chips and the card tag follow the same mapping');
  ok(/if \(res\.error && \/denture_svc\/i\.test\(res\.error\.message \|\| ''\)\) \{\n    rows = rows\.filter\(function\(r\)\{ return !r\.denture_svc; \}\);/.test(TH), 'catalog defaults: before the migration, services are deferred — never inserted as plain jaw treatments');
  ok(/'dentition_scope', 'denture_svc'\];/.test(F['scripts/check-catalog-parity.js']), 'catalog parity guard compares the marker');
  const CB = F['scripts/cache-bust.sh'];
  ok((CB.match(/pp-denture-svc\\\.js/g) || []).length === 2 && /pp-denture-svc\.js/.test(CB.split('\n').slice(0, 20).join('\n')), 'cache-bust: the module is a fleet asset (both expressions + the header list)');
  ok(/'pp-denture-svc\.js'/.test(F['scripts/check-modal-behaviour.js']), 'modal behaviour guard scans the module');
  ok(/prove-denture-svc\.js" --self-test/.test(F['scripts/validate.sh']), 'validate.sh runs this prover');
  /* v733: موضعُ الخدمة بطلب المخبر (جدولُ الطلبات · ورقةُ المخبر) — المصدرُ الواحد SyLabSlip.area يُنفَّذ من ملفه */
  let LS = null; try { const c = { console }; c.window = c; c.document = {}; vm.createContext(c); vm.runInContext(F['lab-slip.js'], c); LS = c.SyLabSlip; } catch (e) { LS = null; }
  const AJ = x => JSON.stringify(x);
  ok(!!LS && AJ(LS.area({ arch: 'U', denture_unit: 'u' })) === AJ({ text: 'الفك العلوي', teeth: [] }) && AJ(LS.area({ arch: 'L', denture_unit: 'u', denture_add: '36,34' })) === AJ({ text: 'الفك السفلي — الأسنان 34، 36', teeth: [34, 36] })
    && AJ(LS.area({ arch: 'U', denture_unit: 'u', denture_add: '16' })) === AJ({ text: 'الفك العلوي — السن 16', teeth: [16] }),
    'lab area: a service order shows the denture jaw, an add-tooth order its added teeth');
  ok(!!LS && LS.area({ arch: 'U' }) === null && LS.area({ arch: 'U', denture_unit: 'u', tooth_num: '16' }) === null && LS.area({ arch: 'X', denture_unit: 'u' }) === null && LS.area({ denture_unit: 'u' }) === null
    && LS.area({ arch: 'U', unit_teeth: '14,15' }).text === 'الفك العلوي — الأسنان 14، 15', 'lab area: a plain jaw session still has none, and a denture session keeps its own');
  ok(/\.select\('id, arch, unit_teeth, tooth_num, denture_unit, denture_add'\)/.test(F['lab-slip.js']) && /if \(r\.error && \/denture_unit\|denture_add\/\.test\(r\.error\.message \|\| ''\)\) r = await sb\.from\('ledger_sessions'\)\.select\('id, arch, unit_teeth, tooth_num'\)/.test(F['lab-slip.js']),
    'lab area: the labs page loads the link columns — and falls back before the migration so denture areas are not lost');
  ok(/if \(openLab\) window\._pendingMatDeduct = \{ k: key, l: label, m: made\.length, s: matIds \};/.test(DN), 'denture save: the stock prompt is deferred behind the lab form too');
  /* ── ج4-ب: تعليماتُ المريض للجهاز · سياقُ صياغة أمر المخبر (المرحلة والموضع) ── */
  const PC = F['pp-clinical.js'], LB = F['labs.html'], AI = F['supabase/functions/ai-assist/index.ts'];
  let LIB = null; try { const a = PC.indexOf('var POST_OP_LIBRARY = ['), b = PC.indexOf('\n];', a); LIB = new Function(PC.slice(a, b + 3) + ';return POST_OP_LIBRARY;')(); } catch (e) { LIB = null; }
  const byId = id => (LIB || []).filter(x => x.id === id)[0];
  const ids = (LIB || []).map(x => x.id), L21 = byId('lib21'), L22 = byId('lib22');
  ok(!!LIB && LIB.length === 22 && new Set(ids).size === 22 && ids.indexOf('lib21') === ids.indexOf('lib13') + 1 && ids.indexOf('lib22') === ids.indexOf('lib13') + 2
    && !!L21 && !!L22 && L21.treatment_key === null && L22.treatment_key === null && /الجهاز الفوري/.test(L21.name) && /تبطين أو إصلاح/.test(L22.name),
    'instructions library: two denture templates added right after the denture-care one — ids unique, never reused');
  ok(!!L21 && /أول 24 ساعة:\n• أبقِ الجهاز في فمك ولا تنزعه، حتى عند النوم في الليلة الأولى/.test(L21.body) && /انزعه عند النوم واحفظه في كوب ماء، ما لم يطلب منك طبيبك إبقاءه في الليالي الأولى/.test(L21.body)
    && /يُعالَج بتبطين الجهاز، وغالباً يُستبدَل بجهاز نهائي بعد 6 إلى 12 شهراً/.test(L21.body) && /لا ماء ساخن ولا معجون أسنان عادي/.test(L21.body) && /اتصل بالعيادة إذا:/.test(L21.body),
    'immediate-denture template: 24 hours without removing it, night removal afterwards, reline and replacement window — as the NHS leaflets say');
  ok(!!L22 && /لا ماء ساخن ولا مبيّضات ولا معجون أسنان عادي/.test(L22.body) && /المؤقتة تُشطف بالماء ولا تُفرك بالفرشاة/.test(L22.body) && /لا تلصقه بنفسك/.test(L22.body)
    && !/أضعف عند مكان الكسر|أضيق من قبل/.test(L22.body), 'reline/repair template: sourced care rules only — the unsourced statements are not in it');
  ok([L21, L22].every(x => !!x && !/\d+\s*(?:ملغ|مغ|mg|حبة|حبتين)|باراسيتامول|ايبوبروفين|إيبوبروفين|أموكسيسيلين|مضاد حيوي/.test(x.body)), 'new templates: no drug names and no doses (library rule)');
  ok(/سجلُّ المراجعة \(16\/11\/2026\)/.test(PC) && /«انا ما راجعت شي»/.test(PC) && /«راجعت التعليمات انا»/.test(PC), 'library header: the review record carries both of the owner\'s statements, dated');
  const PPH = F['patient-profile.html'];
  ok(/<div class="po-lib-hint">تعليمات جاهزة لأشيع العلاجات — اخترها ثم عدّل النص كما تشاء قبل الحفظ\.<\/div>/.test(PPH) && !/مراجَعة طبياً/.test(PPH) && !/مراجَعة طبياً/.test(F['i18n-en.js'].replace(/\/\*[\s\S]*?\*\//g, '')),
    'instructions form: the hint says «ready-made» — no «medically reviewed» claim on the page or in the dictionary (owner, 16/11/2026)');
  const cutLab = (src, name) => { const a = src.indexOf('function ' + name + '('), b = src.indexOf('\n}\n', a); return (a > -1 && b > a) ? src.slice(a, b + 2) : ''; };
  const runCtx = (code, env) => { const c = Object.assign({ window: {}, console }, env); c.window = c; vm.createContext(c); vm.runInContext(code + '\nthis.out = labAiContext();', c); return c.out; };
  const fakeDoc = id => ({ getElementById: k => k === 'labOrderId' ? { value: id } : { id: k } });
  const stg = { forSlip: (box, lo) => (lo && lo.staged) ? { name: 'تجربة الأسنان', pos: 2, total: 3, all: [] } : null };
  let cL = null, cL0 = null, cP = null, cPn = null;
  try {
    cL = runCtx(cutLab(LB, 'labAiContext'), { document: fakeDoc('o1'), allOrders: [{ id: 'o1', staged: true }], SyLabSlip: { areaOf: lo => lo.id === 'o1' ? { text: 'الفك العلوي — الأسنان 14، 15', teeth: [14, 15] } : null }, SyLabStages: stg });
    cL0 = runCtx(cutLab(LB, 'labAiContext'), { document: fakeDoc(''), allOrders: [], SyLabSlip: { areaOf: () => null }, SyLabStages: stg });
    cP = runCtx(cutLab(PC, 'labAiContext'), { document: fakeDoc('o1'), labOrders: [{ id: 'o1', staged: true, session_id: 's1' }], pendingLabSessionId: null, labOrderArea: lo => (lo && lo.session_id === 's1') ? { text: 'الفك السفلي', teeth: [] } : null, SyLabStages: stg });
    cPn = runCtx(cutLab(PC, 'labAiContext'), { document: fakeDoc(''), labOrders: [], pendingLabSessionId: 's9', labOrderArea: lo => (lo && lo.session_id === 's9') ? { text: 'الفك العلوي — السن 16', teeth: [16] } : null, SyLabStages: stg });
  } catch (e) { cL = null; }
  ok(!!cL && cL.area === 'الفك العلوي — الأسنان 14، 15' && cL.stage === 'تجربة الأسنان (2 من 3)' && cL0.area === '' && cL0.stage === ''
    && !!cP && cP.area === 'الفك السفلي' && cP.stage === 'تجربة الأسنان (2 من 3)' && cPn.area === 'الفك العلوي — السن 16' && cPn.stage === '',
    'lab draft context: each surface reads the denture location and the stage due now from its own order — a new order from a session too');
  const callRe = /var ctxAi = \(typeof labAiContext === 'function'\) \? labAiContext\(\) : null;\n    if \(ctxAi && ctxAi\.area\) payload\.area = ctxAi\.area;\n    if \(ctxAi && ctxAi\.stage\) payload\.stage = ctxAi\.stage;/;
  ok(callRe.test(LB) && callRe.test(PC), 'lab draft: both surfaces send the location and the stage');
  ok(/const area = String\(input\?\.area \|\| ""\)\.slice\(0, 120\);/.test(AI) && /const stage = String\(input\?\.stage \|\| ""\)\.slice\(0, 80\);/.test(AI)
    && /\(stage \? "المرحلة المطلوبة الآن: " \+ stage \+ "\\n" : ""\)/.test(AI) && /\(area \? "موضع العمل: " \+ area \+ "\\n" : ""\)/.test(AI)
    && /«المرحلة المطلوبة:»/.test(AI) && /موضع العمل كما وصل حرفياً/.test(AI), 'assistant: the lab draft receives the stage and the location (bounded text) and has a line for each');
  ok(/inAr: nfWord\("جهاز\|اجهزه"\)/.test(AI) && /\(inOnly \? inOnly\.test\(inN\) : false\)/.test(AI), 'assistant: denture vocabulary — any «جهاز» in the input allows denture words (prove-ai-note-faith runs the cases)');
  const CSS = F['patient-profile.css'];
  ok(/\.dent-banner \.dsv-chip\{cursor:pointer;\}/.test(CSS) && /\.dsv-dialog \.dsv-tx\{/.test(CSS) && /\.dsv-dialog \.dent-t\.dsv-own\{/.test(CSS), 'css: chip, dialog and picker kits');
}

async function behave(w, F) {
  const doc = w.document, $ = id => doc.getElementById(id);
  [T_PART, T_FULL, T_RELINE, T_ADJ, T_ADD, T_ARCH, T_OFF].forEach(t => w.TREATMENTS.push(JSON.parse(JSON.stringify(t))));
  const K = 'custom_1781292854422';
  const row = (tooth, surface, key, status, unit) => ({ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: String(tooth), surface, treatment_key: key, status: status || 'completed', unit_id: unit || null, provider_id: null });
  const X = (t, st) => row(t, 'WHOLE', 'extracted', st || 'completed');
  const D = (t, unit, key, st) => row(t, 'DENTURE', key || T_PART.id, st || 'completed', unit);
  const load = (rows, sess) => {
    const dlg = doc.querySelector('.dsv-dialog'); if (dlg) dlg.remove();
    w.__DB.teeth_status = JSON.parse(JSON.stringify(rows)); w.__DB.ledger_sessions = JSON.parse(JSON.stringify(sess || []));
    w.__OPS = []; w.__DIALOGS = []; w.__TOASTS.length = 0; w.__REALLOC = 0; w.__AUDIT = []; w.__MAT = []; w.__LAB = []; w.__FAIL = null;
    const tm = {};
    w.SyDenture.reset();
    rows.forEach(t => { if (w.SyDenture.take(t)) return;
      const n = String(t.tooth_num); tm[n] = tm[n] || {}; tm[n][t.surface] = t.treatment_key; tm[n].__status = tm[n].__status || {}; tm[n].__status[t.surface] = t.status || 'completed'; });
    w.eval('teethMap = ' + JSON.stringify(tm) + '; sessions = ' + JSON.stringify(sess || []) + '; window.teethDx = {};');
    const t = w.rebuildToothMaps(); w.T_FILL = t.fill; w.T_STROKE = t.stroke; w.T_LABEL = t.label;
    w.eval('currentTooth = null; currentSurface = null; pendingProviderId = "d1"; window.__examMode = false; window.__batchMode = false; window.__historyMode = false; pendingDentSvc = null; pendingRegionalType = null;');
    ['toothModal', 'regionalAreaModal'].forEach(id => $(id).classList.remove('open'));
    w.renderTeeth(); w.__grabSvc();
  };
  const ops = (table, op) => w.__OPS.filter(o => o.table === table && o.op === op);
  const toasts = () => w.__TOASTS.join(' || ');
  const DB = t => w.__DB[t];
  const dlg = () => doc.querySelector('.dsv-dialog');
  const click = el => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); w.__grabSvc(); };
  const snap = () => ['upperJaw', 'lowerJaw', 'upperOcc', 'lowerOcc', 'chartLegend'].map(id => $(id).innerHTML).join('\n@@\n');
  const SESS = (id, extra) => Object.assign({ id, doctor_id: 'doc-1', patient_id: 'pat-1', type: 'X', cost: 1, date: '2026-11-01', status: 'completed', tooth_num: null, arch: 'U', treatment_key: T_RELINE.id }, extra || {});
  /* الفك العلوي: جهازٌ جزئي u-1 على 14،15 · 16 مفقود · 26 قلعُه مخطّط · 24 مزروع · الباقي قائم. السفلي: جهازٌ كامل قائم u-2 */
  const lower = w.DENT_FULL_TEETH.L.map(t => D(t, 'u-2', T_FULL.id, 'existing_other')).concat(w.DENT_FULL_TEETH.L.map(t => X(t)));
  const base = () => [X(14), X(15), X(16), X(26, 'planned'), X(24), row(24, 'WHOLE', 'implant'), D(14, 'u-1'), D(15, 'u-1')].filter(r => !(r.tooth_num === '24' && r.treatment_key === 'extracted')).concat(lower);

  /* ① مخططٌ بلا جهاز: الوحدةُ حاضرة = الوحدةُ غائبة (بايت ببايت)، والشريطُ فارغ */
  load([row(46, 'O', K), X(36), X(26, 'planned'), row(11, 'WHOLE', 'implant', 'planned')]); const withSvc = snap();
  const keep = w.SyDentSvc; w.SyDentSvc = undefined; w.renderTeeth(); const without = snap(); w.SyDentSvc = keep;
  ok(withSvc === without && withSvc.length > 20000 && $('dentureBanner').innerHTML === '' && !doc.querySelector('[data-dsv-open]'), 'no denture: the chart and the banner are byte-identical with and without the module');

  /* ② الشريط: شريحةُ الجهاز زرّ بعدّاد خدماته */
  load(base(), [SESS('s-old', { denture_unit: 'u-1', type: 'Reline LAB', date: '2026-10-01' }), SESS('s-pl', { denture_unit: 'u-1', denture_add: '16', status: 'planned', type: 'Add TOOTH', date: '2026-10-05' }), SESS('s-other', { arch: 'L' })]);
  const chips = [].slice.call($('dentureBanner').querySelectorAll('.dent-chip'));
  ok(chips.length === 2 && chips.every(c => c.getAttribute('role') === 'button' && c.getAttribute('tabindex') === '0' && c.querySelector('.dsv-badge'))
    && chips[0].getAttribute('data-dsv-open') === 'u-1' && chips[0].querySelector('.dsv-badge').textContent === '🛠 2' && chips[1].querySelector('.dsv-badge').textContent === '🛠',
    'banner: each drawn denture chip is a button carrying its unit and its service count');
  w.renderTeeth(); w.renderTeeth();
  ok($('dentureBanner').querySelectorAll('.dsv-badge').length === 2, 'banner: repainting does not stack badges');

  /* ③ نافذةُ الجهاز: سطرُه · الخدماتُ الفعّالة · سجلُّه (الأحدثُ أولاً، والمخطّطُ موسوم، والسنُّ المضاف مسمّى) */
  click($('dentureBanner').querySelector('.dent-chip'));
  const d1 = dlg();
  ok(!!d1 && /Partial ACR — الفك العلوي — الأسنان 14، 15/.test(d1.querySelector('.dsv-unit').textContent)
    && [].map.call(d1.querySelectorAll('[data-dsv-tx]'), b => b.getAttribute('data-dsv-tx')).join(',') === 'denture-reline-lab,denture-adjust,denture-add-tooth'
    && !d1.querySelector('[data-dsv-tx][aria-disabled]'), 'dialog: the unit line and the active service treatments (inactive and plain jaw treatments excluded)');
  const hr = [].slice.call(d1.querySelectorAll('.dsv-row'));
  ok(hr.length === 2 && /Add TOOTH/.test(hr[0].textContent) && /السن 16/.test(hr[0].querySelector('.dsv-add').textContent) && !!hr[0].querySelector('.dsv-st') && /Reline LAB/.test(hr[1].textContent) && !hr[1].querySelector('.dsv-st'),
    'dialog: the history is this denture only, newest first — planned flagged, added tooth named');

  /* ③-ب v739 (M209): الضمّات بنافذة الجهاز الجزئي — مقترحةٌ تلقائياً (13 وحده: 16 مفقود) · نقرةُ السن تضيف أو تلغي وتُحفظ فوراً */
  const tk = () => new Promise(res => setTimeout(res, 5));
  const cb = n => dlg().querySelector('[data-dsv-clasp="' + n + '"]');
  const dRows = () => DB('teeth_status').filter(x => x.surface === 'DENTURE' && x.unit_id === 'u-1');
  ok(!!d1.querySelector('.dsv-clasp-grid') && d1.querySelectorAll('[data-dsv-clasp]').length === 16 && d1.classList.contains('sy-m-md') && !d1.classList.contains('sy-m-sm')
    && cb(13).classList.contains('dsv-clasp-on') && cb(13).getAttribute('aria-pressed') === 'true' && cb(12).classList.contains('dent-miss') && cb(12).getAttribute('aria-pressed') === 'false'
    && cb(14).classList.contains('dsv-own') && cb(15).classList.contains('dsv-own') && [16, 24, 26].every(n => cb(n).classList.contains('dent-off') && cb(n).getAttribute('aria-disabled') === 'true')
    && d1.querySelectorAll('.dsv-clasp-on').length === 1 && /مقترحة تلقائياً على الأسنان المجاورة للفراغ/.test(d1.textContent) && !d1.querySelector('.dsv-clasp-auto'),
    'clasps: the partial denture window lists the jaw — the suggested clasp is on, denture teeth are marked, unfit teeth are disabled');
  w.__OPS = []; click(cb(12)); await tk();
  ok(ops('teeth_status', 'update').length === 1 && dRows().length === 2 && dRows().every(x => x.denture_clasps === '12,13') && cb(12).classList.contains('dsv-clasp-on') && cb(13).classList.contains('dsv-clasp-on')
    && /قائمة الطبيب/.test(dlg().textContent) && !!dlg().querySelector('.dsv-clasp-auto') && !!doc.querySelector('.tooth-cell[data-tooth-cell="12"] g.dent-clasp')
    && ops('ledger_sessions', 'insert').length === 0 && w.__REALLOC === 0 && $('dentureBanner').querySelector('.dent-clasps').textContent === 'ضمّات: 12، 13',
    'clasps: clicking a tooth adds a clasp — one update on every denture row, no session, the chart and the chip follow');
  click(cb(13)); await tk();
  ok(dRows().every(x => x.denture_clasps === '12') && !cb(13).classList.contains('dsv-clasp-on') && !doc.querySelector('.tooth-cell[data-tooth-cell="13"] g.dent-clasp'), 'clasps: clicking a clasped tooth removes its clasp');
  click(dlg().querySelector('.dsv-clasp-auto')); await tk();
  ok(dRows().every(x => x.denture_clasps === null) && cb(13).classList.contains('dsv-clasp-on') && !cb(12).classList.contains('dsv-clasp-on') && !dlg().querySelector('.dsv-clasp-auto') && /مقترحة تلقائياً/.test(dlg().textContent),
    'clasps: «automatic suggestion» drops the dentist list and the suggestion returns');
  w.__OPS = []; w.__TOASTS.length = 0; click(cb(16)); await tk(); click(cb(14)); await tk();
  ok(w.__OPS.length === 0 && /السن 16: لا يحمل ضمّة/.test(toasts()) && /السن 14: ضمن الجهاز/.test(toasts()), 'clasps: a missing tooth and a denture tooth are refused with the reason, nothing is written');
  w.__OPS = []; w.eval('window.__examMode = true'); click(cb(12)); await tk(); w.eval('window.__examMode = false');
  const subK = w.SyDentSub.blockReadOnly; w.SyDentSub.blockReadOnly = () => true; click(cb(12)); await tk(); w.SyDentSub.blockReadOnly = subK;
  ok(w.__OPS.length === 0 && dRows().every(x => x.denture_clasps === null), 'clasps: no edit in initial-exam mode or on a read-only subscription');
  w.SyDentSvc.open('u-2'); w.__grabSvc();
  ok(!dlg().querySelector('.dsv-clasp-grid') && !dlg().querySelector('[data-dsv-clasp]') && dlg().classList.contains('sy-m-sm'), 'clasps: a complete denture window has no clasp section');
  w.SyDentSvc.open('u-1'); w.__grabSvc();
  click(d1.querySelector('.modal-close'));
  ok(!dlg(), 'dialog: closes');
  /* الجهازُ الكامل: «إضافة سن» معطّلة بسببها */
  click($('dentureBanner').querySelectorAll('.dent-chip')[1]);
  const offBtn = dlg().querySelector('[data-dsv-tx="denture-add-tooth"]');
  w.__TOASTS.length = 0; click(offBtn);
  ok(offBtn.getAttribute('aria-disabled') === 'true' && /الجهاز الكامل يعوّض كل أسنان الفك/.test(toasts()) && !!dlg() && !$('toothModal').classList.contains('open') && /لا خدمات مسجّلة لهذا الجهاز بعد/.test(dlg().textContent),
    'dialog: add-tooth is disabled for a complete denture, with its reason — and an empty history says so');
  click(dlg().querySelector('.modal-close'));

  /* قائمةُ العلاجات تُحدَّث عند فتح النافذة (خدمةٌ أُضيفت بصفحة العلاجات والبطاقةُ مفتوحة) */
  load(base());
  const origLoad = w.loadTreatmentsFromSupabase; let loads = 0;
  w.loadTreatmentsFromSupabase = function () { loads++; w.TREATMENTS.push(JSON.parse(JSON.stringify(T('denture-new', 'New SVC', 'arch', { denture_svc: 'service' })))); return Promise.resolve(); };
  w.SyDentSvc.open('u-1'); const before = !!dlg().querySelector('[data-dsv-tx="denture-new"]');
  await new Promise(res => setTimeout(res, 20));
  ok(!before && loads === 1 && !!dlg().querySelector('[data-dsv-tx="denture-new"]'), 'dialog: the treatments list is refreshed on open — a service just added in the catalog appears');
  w.loadTreatmentsFromSupabase = origLoad; w.TREATMENTS.pop(); click(dlg().querySelector('.modal-close'));

  /* v733: الفحصُ الأولي والتحديدُ المتعدد يعطّلان حارسَ الحفظ — الخدمةُ المبدوءة من الشريحة كانت تُحفظ جلسةَ فكٍّ بلا ربط.
     المدخلُ يرفض بكل وضعٍ ترفض به «جلسة جديدة» (المسودة · الفحص · التحديد · حسابٌ غير نشط)، ونافذةُ السجل تبقى للقراءة */
  const MODES = [['__examMode', 'أنهِ وضع الفحص الأولي أولاً'], ['__batchMode', 'أنهِ وضع التحديد المتعدد أولاً'], ['__draftMode', 'أغلق المسودة أولاً']];
  for (const [flag, msg] of MODES) {
    load(base()); w.eval('window.' + flag + ' = true;'); w.__TOASTS.length = 0;
    w.SyDentSvc.open('u-1'); const dm = dlg();
    if (dm) click(dm.querySelector('[data-dsv-tx="denture-adjust"]'));
    const viaList = w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, null);
    ok(!!dm && !$('toothModal').classList.contains('open') && w.eval('pendingDentSvc') === null && w.__OPS.length === 0 && viaList === true && toasts().split(msg).length === 3,
      'chart mode ' + flag + ': the history opens for reading, but no service starts — from the window or from the list');
    w.eval('window.' + flag + ' = false;'); if (dlg()) click(dlg().querySelector('.modal-close'));
  }
  load(base()); w.eval('window.' + '__examMode = true;');
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]'));
  ok(!dlg().querySelector('[data-dsv-tooth]') && w.__OPS.length === 0, 'chart mode: add-tooth does not reach its picker either');
  w.eval('window.__examMode = false;'); click(dlg().querySelector('.modal-close'));
  load(base()); w.eval('window.SyDentLock = { isDoctorAccountInactive: function () { return true; } };'); w.__TOASTS.length = 0;
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]'));
  ok(!$('toothModal').classList.contains('open') && /حسابك غير نشط — لا يمكن تسجيل جلسات جديدة/.test(toasts()) && w.__OPS.length === 0, 'inactive locked doctor: no service starts');
  w.eval('window.SyDentLock = undefined;'); click(dlg().querySelector('.modal-close'));
  /* وضعٌ بدأ بعد اختيار الخدمة (سياقٌ قائم): الخطوةُ لا تُفتح بلا حارس حفظها */
  load(base()); w.eval("pendingDentSvc = { key: 'denture-adjust', label: 'Adjust DENT', kind: 'service', unit: { id: 'u-1' }, teeth: [], picking: false }; window.__batchMode = true;");
  w.eval('dsvStep2()');
  ok(!$('toothModal').classList.contains('open') && w.eval('pendingDentSvc') === null, 'chart mode entered mid-flow: the cost step does not open and the context is dropped');
  w.eval('window.__batchMode = false;');

  /* ج4-ب: «📋 تعليمات للمريض» — تفتح نافذةَ التعليمات على قالب المكتبة المناسب للجهاز */
  const instrProbe = async (rows, unitId) => {
    load(rows);
    const sel = doc.getElementById('postOpLibraryPick') || doc.body.appendChild(Object.assign(doc.createElement('select'), { id: 'postOpLibraryPick', innerHTML: '<option value=""></option><option value="lib13">a</option><option value="lib21">b</option>' }));
    sel.value = '';
    w.__INSTR = { opened: 0, applied: [] };
    w.openPostOpModal = function () { w.__INSTR.opened++; return Promise.resolve(); };
    w.postOpLibraryGet = function (id) { return (id === 'lib13' || id === 'lib21') ? { id: id } : null; };
    w.postOpApplyLibrary = function (id) { w.__INSTR.applied.push(id); };
    w.SyDentSvc.open(unitId); w.__grabSvc();
    const b = dlg().querySelector('[data-dsv-act="instr"]');
    if (b) click(b);
    await new Promise(res => setTimeout(res, 10));
    return { btn: !!b, opened: w.__INSTR.opened, applied: w.__INSTR.applied.join(','), pick: sel.value, dialog: !!dlg() };
  };
  const i1 = await instrProbe(base(), 'u-1');
  const i2 = await instrProbe([X(14), X(15, 'planned'), D(14, 'u-i', T_PART.id, 'planned'), D(15, 'u-i', T_PART.id, 'planned')], 'u-i');
  ok(i1.btn && i1.opened === 1 && i1.applied === 'lib13' && i1.pick === 'lib13' && !i1.dialog, 'instructions: the denture window opens the instructions form on the denture-care template');
  ok(i2.btn && i2.opened === 1 && i2.applied === 'lib21' && i2.pick === 'lib21', 'instructions: an immediate denture (planned extraction under it) opens on the immediate-denture template');
  w.openPostOpModal = undefined; load(base()); w.SyDentSvc.open('u-1');
  ok(!dlg().querySelector('[data-dsv-act="instr"]'), 'instructions: no button where the instructions form does not exist');
  click(dlg().querySelector('.modal-close'));

  /* ④ خدمةٌ عادية: جلسةُ فكٍّ مربوطة بالجهاز — صفر مساس بالمخطط */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-reline-lab"]'));
  w.__grabSvc();
  ok(!dlg() && $('toothModal').classList.contains('open') && /^🛠 Reline LAB — Partial ACR \(الفك العلوي — الأسنان 14، 15\)$/.test($('toothStep2Title').textContent) && w.SyDentSvc.saveReady() === true && !w.SyDenture.saveReady(),
    'service: picking it goes straight to the cost step, titled with the denture');
  $('toothCost').value = '75000'; await w.saveToothTreatment();
  let s = DB('ledger_sessions')[0];
  ok(DB('ledger_sessions').length === 1 && s.denture_unit === 'u-1' && s.arch === 'U' && s.tooth_num === null && s.surface === null && s.status === 'completed' && s.treatment_key === 'denture-reline-lab'
    && s.type === 'Reline LAB' && s.description === 'الفك العلوي — الأسنان 14، 15' && Number(s.cost) === 75000 && !('denture_add' in s) && !('unit_teeth' in s),
    'service: one jaw session linked to the denture — no unit_teeth, no added teeth');
  ok(ops('teeth_status', 'insert').length === 0 && ops('teeth_status', 'delete').length === 0 && ops('teeth_status', 'update').length === 0 && ops('teeth_status', 'upsert').length === 0, 'service: the chart is not written');
  ok(w.__REALLOC === 1 && w.__AUDIT.length === 1 && w.__AUDIT[0].a === 'session.create' && w.__AUDIT[0].d.newValue.scope === 'denture_service' && w.__MAT.length === 1 && w.__LAB.length === 0
    && /✅ تم تسجيل Reline LAB — Partial ACR \(الفك العلوي\)/.test(toasts()) && !$('toothModal').classList.contains('open') && w.SyDentSvc.saveReady() === false,
    'service: funds reallocated once, audited, stock prompt offered — and the context is consumed');
  ok($('dentureBanner').querySelector('.dent-chip .dsv-badge').textContent === '🛠 1' && w.eval('pendingDentSvc') === null, 'service: the chip count follows and the context is gone');
  /* مسارُ المخبر: الطلبُ يُفتح بالجلسة وبملاحظةٍ تسمّي الجهاز · المخطّطُ مسودّة */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-reline-lab"]')); w.pickStatus('planned'); await w.saveRegionalAndOpenLab();
  ok(w.__LAB.length === 1 && w.__LAB[0].session_id === DB('ledger_sessions')[0].id && w.__LAB[0].treatment_key === 'denture-reline-lab' && w.__LAB[0].draft === true && /^Partial ACR — الفك العلوي — الأسنان 14، 15/.test(w.__LAB[0].notes)
    && DB('ledger_sessions')[0].status === 'planned' && w.__MAT.length === 0, 'service + lab: the order opens on the session, names the denture — a planned service is a draft');
  /* v733: خدمةٌ منجزة مع المخبر — سؤالُ خصم المواد يُؤجَّل لإغلاق نموذج المخبر (لا نافذتان فوق بعض) */
  load(base()); w.eval('window._pendingMatDeduct = null;');
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-reline-lab"]')); await w.saveRegionalAndOpenLab();
  const pmd = w.eval('window._pendingMatDeduct');
  ok(w.__LAB.length === 1 && w.__LAB[0].draft === false && w.__MAT.length === 0 && !!pmd && pmd.k === 'denture-reline-lab' && pmd.m === 1 && pmd.s.length === 1 && pmd.s[0] === DB('ledger_sessions')[0].id,
    'service + lab (completed): the stock prompt waits for the lab form to close');
  w.eval('window._pendingMatDeduct = null;');
  /* الحالاتُ غير المالية مرفوضة بصفر كتابة */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]')); w.pickStatus('existing_other'); await w.saveToothTreatment();
  ok(w.__OPS.length === 0 && /خدمة الجهاز تُسجَّل «منجز» أو «مخطّط» فقط/.test(toasts()) && w.SyDentSvc.saveReady() === true, 'service: a non-billable status is refused with zero writes — the step stays');

  /* ⑤ «إضافة سن»: المنتقي */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]'));
  const cls = n => dlg().querySelector('[data-dsv-tooth="' + n + '"]').className;
  ok(/dsv-own/.test(cls(14)) && /dsv-own/.test(cls(15)) && /dent-miss/.test(cls(16)) && !/dent-alt/.test(cls(16)) && /dent-miss dent-alt/.test(cls(26)) && /dent-off/.test(cls(17)) && /dent-off/.test(cls(24))
    && dlg().querySelector('[data-dsv-act="next"]').disabled === true && dlg().querySelectorAll('[data-dsv-tooth]').length === 16 && !dlg().querySelector('[data-dsv-tooth="46"]'),
    'add: the picker shows the denture arch — own teeth locked, missing selectable, planned-extraction marked, standing and implant refused');
  w.__TOASTS.length = 0; click(dlg().querySelector('[data-dsv-tooth="17"]')); click(dlg().querySelector('[data-dsv-tooth="24"]')); click(dlg().querySelector('[data-dsv-tooth="14"]'));
  ok(/🦷 السن 17: سن قائم — سجّل قلعه أولاً/.test(toasts()) && /🦷 السن 24: مزروع/.test(toasts()) && /🦷 السن 14: ضمن الجهاز/.test(toasts()) && dlg().querySelector('[data-dsv-act="next"]').disabled === true, 'add: a refused tooth says why and is not selected');
  click(dlg().querySelector('[data-dsv-tooth="16"]'));
  ok(/dent-on/.test(cls(16)) && dlg().querySelector('[data-dsv-act="next"]').disabled === false, 'add: a missing tooth toggles on');
  click(dlg().querySelector('[data-dsv-tooth="16"]')); const offAgain = !/dent-on/.test(cls(16)); click(dlg().querySelector('[data-dsv-tooth="16"]'));
  click(dlg().querySelector('[data-dsv-act="next"]')); w.__grabSvc();
  ok(offAgain && !dlg() && /^🛠 Add TOOTH — Partial ACR \(الفك العلوي — الأسنان 14، 15\) — إضافة السن 16$/.test($('toothStep2Title').textContent) && w.eval('pendingTreatStatus') === 'completed', 'add: the cost step names the added tooth');
  await w.saveToothTreatment();
  s = DB('ledger_sessions')[0];
  const ins = ops('teeth_status', 'insert');
  ok(DB('ledger_sessions').length === 1 && s.denture_unit === 'u-1' && s.denture_add === '16' && !('unit_teeth' in s) && s.description === 'الفك العلوي — السن 16' && s.arch === 'U',
    'add (completed): the session carries the added tooth in denture_add');
  ok(ins.length === 1 && ins[0].payload.length === 1 && JSON.stringify(ins[0].payload[0]) === JSON.stringify({ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: '16', surface: 'DENTURE', treatment_key: T_PART.id, status: 'completed', provider_id: 'd1', unit_id: 'u-1', review_at: null })
    && ops('teeth_status', 'delete').length === 0 && ops('teeth_status', 'upsert').length === 0, 'add (completed): one DENTURE row inserted with the unit id, key and status — nothing else written');
  const u1 = w.SyDenture.units().filter(u => u.id === 'u-1')[0];
  ok(u1.teeth.join(',') === '14,15,16' && w.SyDenture.has(16) && /أُضيف السن 16 لرسم الجهاز/.test(toasts()) && w.__REALLOC === 1, 'add (completed): the denture now covers the tooth on the chart');
  ok(w.SyDenture.sessWhere(s) === 'الفك العلوي — السن 16' && w.SyDenture.sessWhere(SESS('x', { denture_unit: 'u-1' })) === '', 'sessWhere: add-tooth by its teeth — a plain service falls back to the jaw');

  /* الصفُّ المضاف يأخذ حالةَ جهازه (جهازٌ «من عيادة أخرى» يبقى كذلك بكل أسنانه) */
  load([X(14), X(15), X(16), D(14, 'u-e', T_PART.id, 'existing_other'), D(15, 'u-e', T_PART.id, 'existing_other')]);
  w.SyDentSvc.open('u-e'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]')); click(dlg().querySelector('[data-dsv-tooth="16"]')); click(dlg().querySelector('[data-dsv-act="next"]'));
  await w.saveToothTreatment();
  ok(ops('teeth_status', 'insert').length === 1 && ops('teeth_status', 'insert')[0].payload[0].status === 'existing_other' && DB('ledger_sessions')[0].status === 'completed', 'add: the new row takes the status of its denture, not of the session');

  /* ⑥ «إضافة سن» على سنٍّ قلعُه مخطّط: مخطّطةٌ فقط */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]')); click(dlg().querySelector('[data-dsv-tooth="26"]')); click(dlg().querySelector('[data-dsv-act="next"]'));
  const openedPlanned = w.eval('pendingTreatStatus') === 'planned';
  w.pickStatus('completed'); await w.saveToothTreatment();
  ok(openedPlanned && w.__OPS.length === 0 && /السن 26 قلعه مخطّط — سجّل الإضافة «مخطّط»/.test(toasts()), 'add on a planned extraction: the step opens on «planned», and «done» is refused with zero writes');
  w.pickStatus('planned'); await w.saveToothTreatment();
  ok(DB('ledger_sessions').length === 1 && DB('ledger_sessions')[0].denture_add === '26' && DB('ledger_sessions')[0].status === 'planned' && ops('teeth_status', 'insert').length === 0 && !w.SyDenture.has(26)
    && /Add TOOTH مخطّطاً — السن 26 يُضاف لرسم الجهاز عند الإنجاز/.test(toasts()), 'add (planned): the session is saved and the chart waits for completion');

  /* ⑦ إنجازُ المخطّطة يرسم — بخطّاف الصفحة الحرفي */
  load(base(), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16', status: 'planned', provider_id: 'd9' })]);
  let note = await w.__completeHook(w.eval('sessions[0]'));
  ok(note === '' && ops('teeth_status', 'insert').length === 1 && ops('teeth_status', 'insert')[0].payload[0].tooth_num === '16' && ops('teeth_status', 'insert')[0].payload[0].unit_id === 'u-1' && ops('teeth_status', 'insert')[0].payload[0].provider_id === 'd9'
    && ops('teeth_status', 'update').length === 0 && w.SyDenture.has(16), 'complete: a planned add-tooth draws its tooth into the unit — and never enters the denture hook');
  /* v737: خطأُ كتابةٍ عند رسم السن المضاف ⇒ الجلسةُ تُوسَم لتعيدها الصفحةُ مخطّطة؛ رفضُ القاعدة (سنٌّ لم يعد يقبل) ليس خطأً */
  load(base(), [SESS('s-addf', { denture_unit: 'u-1', denture_add: '16', status: 'planned' })]);
  w.__FAIL = st => (st.table === 'teeth_status' && st.op === 'insert') ? 'network' : null;
  await w.__completeHook(w.eval('sessions[0]')); w.__FAIL = null;
  const flagAdd = w.SyDenture.drawFailed({ id: 's-addf' }) === true && !w.SyDenture.has(16); w.SyDenture.clearDrawFail({ id: 's-addf' });
  load(base().concat([row(16, 'DENTURE', (base().filter(x => x.surface === 'DENTURE')[0] || {}).treatment_key, 'completed', 'u-9')]), [SESS('s-addr', { denture_unit: 'u-1', denture_add: '16', status: 'planned' })]);
  await w.__completeHook(w.eval('sessions[0]'));
  ok(flagAdd && w.SyDenture.drawFailed({ id: 's-addr' }) === false, 'complete: a write error while drawing the added tooth is flagged for rollback — a tooth that no longer qualifies is not');
  load(base(), [SESS('s-svc', { denture_unit: 'u-1', status: 'planned' })]);
  note = await w.__completeHook(w.eval('sessions[0]'));
  ok(note === '' && w.__OPS.length === 0, 'complete: a plain service writes nothing');
  load([X(16)], [SESS('s-add', { denture_unit: 'u-gone', denture_add: '16', status: 'planned' })]);
  note = await w.__completeHook(w.eval('sessions[0]'));
  ok(w.__OPS.length === 0 && /⚠️ السن 16 لم يُضف لرسم الجهاز — الجهاز لم يعد على المخطط/.test(note), 'complete: a removed denture draws nothing and says so');
  load(base().concat([row(16, 'WHOLE', 'implant')]).filter(r => !(r.tooth_num === '16' && r.treatment_key === 'extracted')), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16', status: 'planned' })]);
  note = await w.__completeHook(w.eval('sessions[0]'));
  ok(w.__OPS.length === 0 && /⚠️ السن 16 لم يُضف لرسم الجهاز — السن لا يقبل الإضافة الآن/.test(note), 'complete: a tooth that no longer accepts the addition is not drawn');
  load(base(), [SESS('s-add', { denture_unit: 'u-1', denture_add: '26', status: 'planned' })]);
  note = await w.__completeHook(w.eval('sessions[0]'));
  ok(ops('teeth_status', 'insert').length === 1 && /⚠️ قلع السن 26 ما زال مخطّطاً — أنجزه ليظهر سنُّ الجهاز/.test(note), 'complete: an addition over a still-planned extraction is drawn with a warning (never blocks completing the visit)');
  load(base(), [{ id: 's-arch', doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: null, arch: 'U', status: 'planned', treatment_key: 'whitening', type: 'Whitening' }]);
  note = await w.__completeHook(w.eval('sessions[0]'));
  ok(note === '' && ops('teeth_status', 'insert').length === 0, 'complete: a plain jaw session is untouched by the service hook');

  /* ⑧ الحذف: المنجزةُ تعيد الرسم كما كان قبلها — أسنانُها وحدها */
  load(base().concat([D(16, 'u-1')]), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16' })]);
  await w.__deleteHook(w.eval('sessions[0]'));
  const dl = ops('teeth_status', 'delete');
  ok(dl.length === 1 && JSON.stringify(dl[0].filters) === JSON.stringify([['eq', 'doctor_id', 'doc-1'], ['eq', 'patient_id', 'pat-1'], ['eq', 'unit_id', 'u-1'], ['eq', 'surface', 'DENTURE'], ['in', 'tooth_num', ['16']]])
    && !w.SyDenture.has(16) && w.SyDenture.has(14) && w.SyDenture.has(15) && DB('teeth_status').filter(r => r.surface === 'DENTURE' && r.unit_id === 'u-1').length === 2,
    'delete: a completed add-tooth removes its own teeth from the unit — the rest of the denture stays');
  load(base(), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16', status: 'planned' })]);
  await w.__deleteHook(w.eval('sessions[0]'));
  ok(ops('teeth_status', 'delete').length === 0, 'delete: a planned add-tooth drew nothing, so nothing is removed');
  load(base().concat([D(16, 'u-1')]), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16', status: 'planned' })]);
  await w.__deleteHook(w.eval('sessions[0]'));
  ok(ops('teeth_status', 'delete').length === 0 && w.SyDenture.has(16), 'delete: a planned add-tooth never removes a tooth already in the denture');
  load(base().concat([D(16, 'u-9')]), [SESS('s-add', { denture_unit: 'u-1', denture_add: '16' })]);
  await w.__deleteHook(w.eval('sessions[0]'));
  ok(ops('teeth_status', 'delete').length === 0 && w.SyDenture.has(16), 'delete: a tooth now held by another denture is not touched');
  load(base(), [SESS('s-svc', { denture_unit: 'u-1' })]);
  await w.__deleteHook(w.eval('sessions[0]'));
  ok(ops('teeth_status', 'delete').length === 0, 'delete: a plain service removes nothing');

  /* ⑨ فشلُ الرسم يسحب الجلسة — لا نصف حفظ، والخطوةُ تبقى */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]')); click(dlg().querySelector('[data-dsv-tooth="16"]')); click(dlg().querySelector('[data-dsv-act="next"]'));
  w.__FAIL = st => (st.table === 'teeth_status' && st.op === 'insert') ? 'boom' : null;
  await w.saveToothTreatment();
  ok(DB('ledger_sessions').length === 0 && ops('ledger_sessions', 'delete').length === 1 && !w.SyDenture.has(16) && w.__REALLOC === 0 && w.__AUDIT.length === 0 && /تعذّر إضافة السن لرسم الجهاز \(boom\) — لم تُحفظ الجلسة/.test(toasts())
    && w.SyDentSvc.saveReady() === true && $('toothModal').classList.contains('open'), 'failed drawing: the session is rolled back, nothing audited or reallocated, and the step stays for a retry');
  /* فشلُ إدراج الجلسة: صفر كتابةٍ أخرى */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]'));
  w.__FAIL = st => (st.table === 'ledger_sessions' && st.op === 'insert') ? 'column "denture_unit" does not exist' : null;
  await w.saveToothTreatment();
  ok(w.__OPS.length === 1 && w.__REALLOC === 0 && /خدمات الجهاز تحتاج تحديث قاعدة البيانات/.test(toasts()) && w.SyDentSvc.saveReady() === true, 'before the migration: the save fails loudly and writes nothing else');

  /* ⑩ المخططُ تغيّر بين النافذة والحفظ */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-add-tooth"]')); click(dlg().querySelector('[data-dsv-tooth="16"]')); click(dlg().querySelector('[data-dsv-act="next"]'));
  w.SyDenture.take(D(16, 'u-9')); await w.saveToothTreatment();
  ok(w.__OPS.length === 0 && /⚠️ تغيّر المخطط — السن 16: يعوّضه جهاز آخر/.test(toasts()), 'revalidation: a tooth taken meanwhile stops the save with zero writes');
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]'));
  w.SyDenture.reset(); await w.saveToothTreatment();
  ok(w.__OPS.length === 0 && /⚠️ تغيّر المخطط — الجهاز لم يعد على المخطط/.test(toasts()), 'revalidation: a removed denture stops the save with zero writes');

  /* ⑪ جهازٌ مخطّط لا يقبل خدمة */
  load([X(14), X(15), D(14, 'u-p', T_PART.id, 'planned'), D(15, 'u-p', T_PART.id, 'planned')]);
  w.SyDentSvc.open('u-p'); w.__grabSvc();
  ok(/الجهاز ما زال مخطّطاً — أنجزه أولاً/.test(dlg().querySelector('.dsv-warn').textContent) && !dlg().querySelector('[data-dsv-tx]'), 'planned denture: the dialog offers no service and says why');
  click(dlg().querySelector('.modal-close'));
  w.__TOASTS.length = 0; const handled = w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, null);
  ok(handled === true && /🛠 الجهاز ما زال مخطّطاً — أنجزه أولاً/.test(toasts()) && !$('toothModal').classList.contains('open') && w.SyDentSvc.saveReady() === false, 'planned denture: the list entry refuses too');

  /* ⑫ المدخل من قائمة العلاجات: الجهازُ يُحدَّد */
  load([X(16)]);
  w.__TOASTS.length = 0; w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, null);
  ok(/🛠 لا جهاز متحرك على المخطط — سجّل الجهاز أولاً/.test(toasts()) && !dlg() && !$('toothModal').classList.contains('open'), 'list entry: no denture — a clear refusal');
  load(base());
  w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, null); w.__grabSvc();
  const pick = [].slice.call(dlg().querySelectorAll('[data-dsv-unit]'));
  ok(pick.length === 2 && pick[0].getAttribute('data-dsv-unit') === 'u-1' && /Complete DENT — الفك السفلي — كامل · من عيادة أخرى/.test(pick[1].textContent) && /اختر الجهاز الذي تخصّه «Adjust DENT»:/.test(dlg().textContent), 'list entry: two dentures — the doctor chooses which');
  click(pick[1]);
  ok(!dlg() && /^🛠 Adjust DENT — Complete DENT \(الفك السفلي — كامل\)$/.test($('toothStep2Title').textContent) && w.eval('pendingRegionalArch') === 'L', 'list entry: the chosen denture sets the jaw');
  await w.saveToothTreatment();
  ok(DB('ledger_sessions')[0].denture_unit === 'u-2' && DB('ledger_sessions')[0].arch === 'L', 'list entry: the session is linked to the chosen denture');
  load(base());
  w.SyDentSvc.start(T_ADD.id, T_ADD.name, null); w.__grabSvc();
  ok(!!dlg().querySelector('[data-dsv-tooth="16"]') && !dlg().querySelector('[data-dsv-unit]'), 'list entry: add-tooth with a single partial denture goes straight to the tooth picker');
  click(dlg().querySelector('[data-dsv-act="back"]'));
  ok(!!dlg().querySelector('[data-dsv-tx]') && !dlg().querySelector('[data-dsv-tooth]'), 'add picker: «back» returns to the denture window');
  click(dlg().querySelector('.modal-close'));
  /* من نافذة سنٍّ يعوّضه الجهاز: جهازُ ذلك السن بلا سؤال */
  load(base());
  w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, { tooth: 41 });
  ok(!dlg() && /Complete DENT \(الفك السفلي — كامل\)/.test($('toothStep2Title').textContent), 'tooth entry: the denture of the clicked tooth is used');
  const bh = w.SyDentSvc.btnHtml(14); const holder = doc.createElement('div'); holder.innerHTML = bh; w.__i18nAdd(holder.textContent); w.__i18nAdd(holder.firstChild.getAttribute('title'));
  ok(/onclick="dsvOpenFromTooth\(14\)"/.test(bh) && w.SyDentSvc.btnHtml(17) === '', 'tooth window: the services button exists only on a denture tooth');

  /* ⑬ سياقٌ متروك لا يحفظ: اختيارُ علاج فكٍّ عادي بعد خدمةٍ ملغاة يمرّ بمساره */
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]'));
  const live = w.SyDentSvc.saveReady();
  w.eval("pendingToothStatus = 'whitening';"); const otherTx = w.SyDentSvc.saveReady();
  w.eval("pendingToothStatus = 'denture-adjust'; pendingRegionalType = 'quadrant';"); const otherScope = w.SyDentSvc.saveReady();
  w.eval("pendingRegionalType = 'arch'; currentTooth = 16;"); const onTooth = w.SyDentSvc.saveReady(); w.eval('currentTooth = null;');
  ok(live === true && otherTx === false && otherScope === false && onTooth === false, 'stale context: it saves only while the cost step is this very service (another treatment, scope or a tooth step never triggers it)');
  w.closeModal('toothModal');
  w.eval('window.__regionalPickerMode = true;'); await w.openToothModal(null, null);
  await w.pickToothTreatment(T_ARCH.id, T_ARCH.name);
  ok(w.SyDentSvc.saveReady() === false && w.eval('pendingDentSvc') === null, 'stale context: picking another treatment clears it');
  load(base());
  w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-adjust"]')); w.closeModal('toothModal');
  w.eval('window.__regionalPickerMode = true;'); await w.openToothModal(null, null);
  await w.pickToothTreatment(T_PART.id, T_PART.name);
  ok(w.eval('pendingDentSvc') === null && $('regionalAreaModal').classList.contains('open'), 'stale context: picking a denture (whose picker returns early) clears it too');
  w.closeModal('regionalAreaModal'); w.SyDenture.pickerReset();
  /* وضعُ العرض التاريخي: الشريحةُ ليست زراً والمدخلُ مرفوض */
  load(base()); w.eval('window.__historyMode = true;'); w.renderTeeth();
  w.__TOASTS.length = 0; const hm = w.SyDentSvc.start(T_ADJ.id, T_ADJ.name, null);
  ok(!$('dentureBanner').querySelector('[data-dsv-open]') && hm === true && /عرض تاريخي للقراءة فقط/.test(toasts()) && !$('toothModal').classList.contains('open'), 'history view: read-only — chips are not buttons and the entry is refused');
  w.eval('window.__historyMode = false;');

  /* ⑭ v741: خدمةُ «إضافة أو إصلاح ضمة» تمرّ بسنّها — السنُّ الجديد يدخل رسمَ الجهاز مع الجلسة المنجزة، وسنٌّ عليه ضمّة = إصلاحٌ بلا مساس بالرسم */
  const tC = w.TREATMENTS.filter(t => t.id === 'denture-clasp')[0]; tC.is_active = true; tC.name = 'Clasp SVC';
  const tk2 = () => new Promise(res => setTimeout(res, 5));
  const ct = n => dlg().querySelector('[data-dsv-ctooth="' + n + '"]');
  const dR = () => DB('teeth_status').filter(x => x.surface === 'DENTURE' && x.unit_id === 'u-1');
  const pickClasp = (...teeth) => { w.SyDentSvc.open('u-1'); click(dlg().querySelector('[data-dsv-tx="denture-clasp"]')); teeth.forEach(n => click(ct(n))); };
  load(base()); pickClasp();
  ok(!!dlg() && !$('toothModal').classList.contains('open') && w.eval('pendingDentSvc') === null && dlg().querySelectorAll('[data-dsv-ctooth]').length === 16 && dlg().classList.contains('sy-m-md')
    && /dsv-own/.test(ct(14).className) && /dsv-own/.test(ct(15).className) && /dsv-clasp-on/.test(ct(13).className) && /dent-miss/.test(ct(12).className)
    && [16, 24, 26].every(n => /dent-off/.test(ct(n).className) && ct(n).getAttribute('aria-disabled') === 'true') && dlg().querySelector('[data-dsv-act="next"]').disabled === true
    && /«Clasp SVC»: اختر السن الذي تُركَّب عليه الضمّة أو تُصلَّح\./.test(dlg().textContent) && !dlg().querySelector('[data-dsv-clasp]'),
    'clasp service: on a partial denture it opens the tooth picker first — clasped tooth marked, denture teeth locked, unfit teeth disabled');
  w.__TOASTS.length = 0; click(ct(16)); click(ct(14));
  ok(/🦷 السن 16: لا يحمل ضمّة/.test(toasts()) && /🦷 السن 14: ضمن الجهاز/.test(toasts()) && !dlg().querySelector('.dent-on') && dlg().querySelector('[data-dsv-act="next"]').disabled === true, 'clasp service: an unfit tooth and a denture tooth are refused with the reason');
  w.__TOASTS.length = 0; w.dsvConfirmClasp(dlg());
  ok(!!dlg() && !$('toothModal').classList.contains('open') && /اختر سناً واحداً على الأقل/.test(toasts()), 'clasp service: no tooth — no cost step');
  click(ct(12)); const cOn = /dent-on/.test(ct(12).className) && ct(12).getAttribute('aria-pressed') === 'true' && dlg().querySelector('[data-dsv-act="next"]').disabled === false && /السن 12/.test(dlg().querySelector('.dsv-note b').textContent);
  click(ct(12)); const cOff = !/dent-on/.test(ct(12).className); click(ct(12));
  click(dlg().querySelector('[data-dsv-act="next"]')); w.__grabSvc();
  ok(cOn && cOff && !dlg() && $('toothModal').classList.contains('open') && /^🛠 Clasp SVC — Partial ACR \(الفك العلوي — الأسنان 14، 15\) — ضمّة على السن 12$/.test($('toothStep2Title').textContent) && w.SyDentSvc.saveReady() === true,
    'clasp service: the tooth toggles, and the cost step names it');
  $('toothCost').value = '5000'; await w.saveToothTreatment(); await tk2();
  s = DB('ledger_sessions')[0];
  ok(DB('ledger_sessions').length === 1 && s.denture_unit === 'u-1' && s.treatment_key === 'denture-clasp' && s.description === 'الفك العلوي — ضمّة على السن 12' && s.tooth_num === null && s.arch === 'U' && Number(s.cost) === 5000
    && !('denture_add' in s) && !('unit_teeth' in s), 'clasp service (completed): one denture session — its description names the clasp tooth');
  ok(ops('teeth_status', 'update').length === 1 && dR().length === 2 && dR().every(x => x.denture_clasps === '12,13') && ops('teeth_status', 'insert').length === 0 && ops('teeth_status', 'delete').length === 0
    && !!doc.querySelector('.tooth-cell[data-tooth-cell="12"] g.dent-clasp') && !!doc.querySelector('.tooth-cell[data-tooth-cell="13"] g.dent-clasp')
    && /✅ تم تسجيل Clasp SVC — ضمّة على السن 12 — أُضيفت لرسم الجهاز/.test(toasts()) && w.__REALLOC === 1 && w.__AUDIT.length === 1 && w.__AUDIT[0].d.newValue.clasp === '12',
    'clasp service (completed): the new clasp joins the drawing beside the ones already drawn — one update, nothing else on the chart');
  ok(w.SyDenture.sessWhere(s) === 'الفك العلوي — ضمّة على السن 12' && w.SyDenture.sessClasp(s).join(',') === '12', 'sessWhere: a clasp service is located by its clasp tooth');
  w.SyDentSvc.open('u-1');
  ok(/Clasp SVC/.test(dlg().querySelector('.dsv-row').textContent) && dlg().querySelector('.dsv-row .dsv-add').textContent === 'السن 12', 'dialog history: the clasp service names its tooth');
  click(dlg().querySelector('.modal-close'));
  /* إصلاح: سنٌّ عليه ضمّة أصلاً — الرسمُ لا يُمسّ (يبقى على الاقتراح التلقائي) */
  load(base()); pickClasp(13); click(dlg().querySelector('[data-dsv-act="next"]')); await w.saveToothTreatment(); await tk2();
  ok(DB('ledger_sessions').length === 1 && DB('ledger_sessions')[0].description === 'الفك العلوي — ضمّة على السن 13' && ops('teeth_status', 'update').length === 0 && dR().every(x => x.denture_clasps == null)
    && /✅ تم تسجيل Clasp SVC — ضمّة على السن 13( \|\||$)/.test(toasts()) && !/أُضيفت لرسم الجهاز/.test(toasts()), 'clasp service (repair): a tooth that already carries a clasp leaves the drawing untouched');
  /* مخطّطة: لا رسم — والرسالةُ تدلّ على قسم «الضمّات» */
  load(base()); pickClasp(13, 12); click(dlg().querySelector('[data-dsv-act="next"]')); w.pickStatus('planned'); await w.saveToothTreatment(); await tk2();
  ok(DB('ledger_sessions').length === 1 && DB('ledger_sessions')[0].status === 'planned' && DB('ledger_sessions')[0].description === 'الفك العلوي — ضمّات على الأسنان 12، 13' && ops('teeth_status', 'update').length === 0
    && dR().every(x => x.denture_clasps == null) && !doc.querySelector('.tooth-cell[data-tooth-cell="12"] g.dent-clasp')
    && /✅ تم تسجيل Clasp SVC مخطّطاً — ضمّات على الأسنان 12، 13 — أضفها لرسم الجهاز من قسم «الضمّات» عند الإنجاز/.test(toasts())
    && w.SyDenture.sessWhere(DB('ledger_sessions')[0]) === 'الفك العلوي — ضمّات على الأسنان 12، 13', 'clasp service (planned): the session is saved and the drawing is not touched');
  /* تعذّر الرسم: الجلسةُ تبقى (الضمّاتُ عرضيّة) والفشلُ يُعلَن */
  load(base()); pickClasp(12); click(dlg().querySelector('[data-dsv-act="next"]'));
  w.__FAIL = st => (st.table === 'teeth_status' && st.op === 'update') ? 'boom' : null;
  await w.saveToothTreatment(); await tk2(); w.__FAIL = null;
  ok(DB('ledger_sessions').length === 1 && ops('ledger_sessions', 'delete').length === 0 && w.__REALLOC === 1 && dR().every(x => x.denture_clasps == null)
    && /⚠️ تم تسجيل Clasp SVC — ضمّة على السن 12 — تعذّر تحديث رسم الجهاز، أضفها من قسم «الضمّات»/.test(toasts()) && !/أُضيفت لرسم الجهاز/.test(toasts()) && !$('toothModal').classList.contains('open'),
    'clasp service: a failed drawing keeps the session and says so');
  /* المخططُ تغيّر بين المنتقي والحفظ: السنُّ قُلع */
  load(base()); pickClasp(12); click(dlg().querySelector('[data-dsv-act="next"]'));
  w.eval("teethMap['12'] = { WHOLE: 'extracted', __status: { WHOLE: 'completed' } };"); w.__OPS = []; w.__TOASTS.length = 0;
  await w.saveToothTreatment(); await tk2();
  ok(w.__OPS.length === 0 && DB('ledger_sessions').length === 0 && /⚠️ تغيّر المخطط — السن 12: لا يحمل ضمّة/.test(toasts()), 'clasp service: a tooth extracted before saving stops the save with zero writes');
  /* مع المخبر: الطلبُ يسمّي سنَّ الضمّة والرسمُ يُحدَّث */
  load(base()); pickClasp(12); click(dlg().querySelector('[data-dsv-act="next"]')); await w.saveRegionalAndOpenLab(); await tk2();
  ok(w.__LAB.length === 1 && /^Partial ACR — الفك العلوي — الأسنان 14، 15 — ضمّة على السن 12/.test(w.__LAB[0].notes) && dR().every(x => x.denture_clasps === '12,13')
    && /✅ تم تسجيل Clasp SVC — الفك العلوي — ضمّة على السن 12 — أكمل بيانات المخبر/.test(toasts()), 'clasp service + lab: the order names the clasp tooth and the drawing follows');
  w.eval('window._pendingMatDeduct = null;');
  /* جهازٌ كامل: لا سنَّ يحمل ضمّة ⇒ الخدمةُ كما كانت (خطوةُ التكلفة مباشرة) */
  load(base()); w.SyDentSvc.open('u-2'); click(dlg().querySelector('[data-dsv-tx="denture-clasp"]')); w.__grabSvc();
  const fullDirect = !dlg() && $('toothModal').classList.contains('open') && /^🛠 Clasp SVC — Complete DENT \(الفك السفلي — كامل\)$/.test($('toothStep2Title').textContent);
  await w.saveToothTreatment(); await tk2();
  ok(fullDirect && DB('ledger_sessions')[0].description === 'الفك السفلي — كامل' && w.SyDenture.sessWhere(DB('ledger_sessions')[0]) === '' && ops('teeth_status', 'update').length === 0, 'clasp service on a complete denture: no picker — the service is recorded as before');
  /* وحدةٌ نوعُها «كامل» لا تمرّ بالمنتقي ولو بقيت أسنانٌ قائمة بفكّها (لا ضمّات تُرسم لها) */
  load([X(14), X(15), D(14, 'u-f', T_FULL.id), D(15, 'u-f', T_FULL.id)]); w.SyDentSvc.open('u-f'); click(dlg().querySelector('[data-dsv-tx="denture-clasp"]'));
  ok(!dlg() && $('toothModal').classList.contains('open'), 'clasp service: a complete-type denture never gets the clasp picker');
  w.closeModal('toothModal'); w.eval('pendingDentSvc = null;');
  /* من قائمة العلاجات: الجهازُ يُختار ثم السن · «رجوع» يعيد لواجهة الجهاز */
  load(base()); w.SyDentSvc.start('denture-clasp', 'Clasp SVC', null); w.__grabSvc();
  const unitsFirst = !!dlg().querySelector('[data-dsv-unit="u-1"]'); click(dlg().querySelector('[data-dsv-unit="u-1"]'));
  const thenTeeth = dlg().querySelectorAll('[data-dsv-ctooth]').length === 16; click(dlg().querySelector('[data-dsv-act="back"]'));
  ok(unitsFirst && thenTeeth && !dlg().querySelector('[data-dsv-ctooth]') && !!dlg().querySelector('.dsv-clasp-grid'), 'clasp service from the treatments list: the denture, then the tooth — «back» returns to the denture window');
  click(dlg().querySelector('.modal-close'));
  /* القراءةُ من الوصف صارمة: وصفٌ معدَّل أو خدمةٌ أخرى أو فكٌّ آخر ⇒ جلسةُ فكٍّ عادية */
  const CS = (d, extra) => SESS('c', Object.assign({ denture_unit: 'u-1', treatment_key: 'denture-clasp', description: d }, extra || {}));
  ok(w.SyDenture.sessClasp(CS('الفك العلوي — ضمّة على السن 13')).join(',') === '13' && w.SyDenture.sessClasp(CS('الفك العلوي — ضمّات على الأسنان 12، 13')).join(',') === '12,13'
    && w.SyDenture.sessWhere(CS('نص حر — ضمّة على السن 13')) === '' && w.SyDenture.sessWhere(CS('الفك العلوي — ضمّة على السن 13 وملاحظة')) === ''
    && w.SyDenture.sessWhere(CS('الفك العلوي — ضمّة على السن 13', { treatment_key: 'denture-reline-lab' })) === '' && w.SyDenture.sessWhere(CS('الفك العلوي — ضمّة على السن 33')) === ''
    && w.SyDenture.sessWhere(CS('الفك العلوي — ضمّة على السن 13', { denture_unit: null })) === '' && w.SyDenture.sessWhere(CS('الفك العلوي — ضمّة على السن 13', { tooth_num: '13' })) === '',
    'sessWhere: the clasp tooth is read only from the exact text this service writes — an edited description, another service or another jaw falls back to the jaw');
  tC.is_active = false; tC.name = 'Clasp OFF';

  ok((w.__ERRORS || []).length === 0, 'no JS errors on the page' + ((w.__ERRORS || []).length ? ' → ' + String(w.__ERRORS[0]).slice(0, 160) : ''));
  return Object.keys(w.__I18N);
}

/* مرآةُ صفحة المواعيد: الدالةُ تُقتطع من ملفها وتُنفَّذ على قاعدةٍ وهمية */
async function apptMirror(F) {
  const AP = F['appointments.html'];
  const cut = (name) => { const a = AP.indexOf('async function ' + name + '('), b = AP.indexOf('\n}\n', a); return (a > -1 && b > a) ? AP.slice(a, b + 2) : ''; };
  const kp = (() => { const a = AP.indexOf('function _apptKeyPart(key) {'), b = AP.indexOf('\n}\n', a); return AP.slice(a, b + 2); })();
  const src = cut('_apptDentureAddOnComplete');
  if (!src) { ok(false, 'appointments mirror: function not found'); return; }
  const mk = (rows, sess, failSelect) => {
    const db = { teeth_status: JSON.parse(JSON.stringify(rows)), ledger_sessions: JSON.parse(JSON.stringify(sess)) }, opsL = [];
    const match = (r, fs) => fs.every(f => f[0] === 'eq' ? String(r[f[1]]) === String(f[2]) : f[2].map(String).indexOf(String(r[f[1]])) !== -1);
    const Q = table => { const st = { table, op: 'select', filters: [], payload: null, single: false };
      const api = { select: () => api, insert: p => { st.op = 'insert'; st.payload = p; return api; }, eq: (k, v) => { st.filters.push(['eq', k, v]); return api; }, in: (k, v) => { st.filters.push(['in', k, v]); return api; },
        maybeSingle: () => { st.single = true; return api; },
        then: (res, rej) => Promise.resolve().then(() => { opsL.push({ table, op: st.op, payload: st.payload });
          if (failSelect && st.op === 'select' && table === 'ledger_sessions') return { data: null, error: { message: 'column ledger_sessions.denture_unit does not exist' } };
          if (st.op === 'insert') { st.payload.forEach(r => db[table].push(r)); return { data: st.payload, error: null }; }
          const hits = db[table].filter(r => match(r, st.filters)); return { data: st.single ? (hits[0] || null) : hits, error: null }; }).then(res, rej) };
      return api; };
    const ctx = { window: { sb: { from: Q } }, currentUser: { id: 'doc-1' }, console: { warn() {} }, getTreatment: () => null };
    vm.createContext(ctx); vm.runInContext(kp + '\n' + src + '\nthis.run = _apptDentureAddOnComplete;', ctx);
    return { run: ctx.run, db, ops: opsL };
  };
  const R = (t, sf, key, st, unit) => ({ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: String(t), surface: sf, treatment_key: key, status: st || 'completed', unit_id: unit || null });
  const unit = [R(14, 'DENTURE', 'denture-partial-acrylic', 'existing_other', 'u-1'), R(15, 'DENTURE', 'denture-partial-acrylic', 'existing_other', 'u-1'), R(14, 'WHOLE', 'extracted'), R(15, 'WHOLE', 'extracted')];
  const S = extra => [Object.assign({ id: 's1', doctor_id: 'doc-1', patient_id: 'pat-1', provider_id: 'd7' }, extra)];
  const sArg = { id: 's1', patient_id: 'pat-1' };
  let m = mk(unit, S({}));
  ok(await m.run(sArg, null) === false && m.ops.filter(o => o.op === 'insert').length === 0, 'appointments mirror: a plain jaw or denture session is not a service (falls to the denture path)');
  m = mk(unit, S({ denture_unit: 'u-1' }));
  ok(await m.run(sArg, null) === true && m.ops.length === 1, 'appointments mirror: a plain service is handled with one read and no write');
  m = mk(unit.concat([R(16, 'WHOLE', 'extracted'), R(17, 'O', 'treated'), R(13, 'WHOLE', 'implant'), R(12, 'WHOLE', 'extracted'), R(12, 'DENTURE', 'x', 'completed', 'u-9')]), S({ denture_unit: 'u-1', denture_add: '16,17,13,12,11' }));
  const res = await m.run(sArg, null), insA = m.ops.filter(o => o.op === 'insert');
  ok(res === true && insA.length === 1 && insA[0].table === 'teeth_status' && JSON.stringify(insA[0].payload) === JSON.stringify([{ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: '16', surface: 'DENTURE', treatment_key: 'denture-partial-acrylic', status: 'existing_other', provider_id: 'd7', unit_id: 'u-1', review_at: null }]),
    'appointments mirror: only a missing, free tooth joins the unit — with the unit key and status (standing, implant, another denture and uncharted teeth are skipped)');
  m = mk(unit.concat([R(16, 'WHOLE', 'extracted')]), S({ denture_unit: 'u-1', denture_add: '16' }));
  await m.run(sArg, 'd-over');
  ok(m.ops.filter(o => o.op === 'insert')[0].payload[0].provider_id === 'd-over', 'appointments mirror: the completing provider overrides');
  m = mk([R(16, 'WHOLE', 'extracted')], S({ denture_unit: 'u-gone', denture_add: '16' }));
  ok(await m.run(sArg, null) === true && m.ops.filter(o => o.op === 'insert').length === 0, 'appointments mirror: a removed denture draws nothing');
  m = mk([R(14, 'DENTURE', 'k', 'planned', 'u-1'), R(16, 'WHOLE', 'extracted')], S({ denture_unit: 'u-1', denture_add: '16' }));
  ok(await m.run(sArg, null) === true && m.ops.filter(o => o.op === 'insert').length === 0, 'appointments mirror: a still-planned denture draws nothing');
  m = mk(unit, S({ denture_unit: 'u-1', denture_add: '16' }), true);
  ok(await m.run(sArg, null) === false && m.ops.filter(o => o.op === 'insert').length === 0, 'appointments mirror: before the migration (missing column) it steps aside');
}

/* v737 — مرآةُ إنجاز الجهاز المعلّق بصفحة المواعيد (_apptDrawPendingDenture) تُنفَّذ حرفياً على قاعدةٍ بالذاكرة: التبديلُ يرسم الجديد،
   وفشلُ كتابته يعيد القديم كما كان (مرآةُ dentSwapRows — v721) ويُعلِم الحلقة؛ بلا لقطةٍ لا إزالة. ومرآةُ «إضافة سن» تُعلِم بفشل كتابتها. */
async function apptSwapMirror(F) {
  const AP = F['appointments.html'];
  const cut = (name) => { const a = AP.indexOf('async function ' + name + '('), b = AP.indexOf('\n}\n', a); return (a > -1 && b > a) ? AP.slice(a, b + 2) : ''; };
  const kp = (() => { const a = AP.indexOf('function _apptKeyPart(key) {'), b = AP.indexOf('\n}\n', a); return AP.slice(a, b + 2); })();
  const src = cut('_apptDrawPendingDenture'), srcAdd = cut('_apptDentureAddOnComplete');
  if (!src || !srcAdd) { ok(false, 'appointments swap mirror: function not found'); return; }
  const mk = (rows, sess, failOn) => {
    const db = { teeth_status: JSON.parse(JSON.stringify(rows)), ledger_sessions: JSON.parse(JSON.stringify(sess)) }, opsL = [];
    const match = (r, fs) => fs.every(f => f[0] === 'eq' ? String(r[f[1]]) === String(f[2]) : f[0] === 'is' ? (r[f[1]] == null) : f[2].map(String).indexOf(String(r[f[1]])) !== -1);
    const key = r => [r.doctor_id, r.patient_id, r.tooth_num, r.surface].join('|');
    const Q = table => { const st = { table, op: 'select', filters: [], payload: null, single: false };
      const api = { select: () => api, insert: p => { st.op = 'insert'; st.payload = p; return api; }, upsert: p => { st.op = 'upsert'; st.payload = p; return api; }, delete: () => { st.op = 'delete'; return api; },
        eq: (k, v) => { st.filters.push(['eq', k, v]); return api; }, in: (k, v) => { st.filters.push(['in', k, v]); return api; }, is: (k, v) => { st.filters.push(['is', k, v]); return api; },
        maybeSingle: () => { st.single = true; return api; },
        then: (res, rej) => Promise.resolve().then(() => { opsL.push({ table, op: st.op, payload: st.payload });
          if (failOn && failOn(st, opsL)) return { data: null, error: { message: 'network' } };
          if (st.op === 'insert') { if (st.payload.some(r => db[table].some(x => key(x) === key(r)))) return { data: null, error: { message: 'duplicate key' } }; st.payload.forEach(r => db[table].push(r)); return { data: null, error: null }; }
          if (st.op === 'upsert') { st.payload.forEach(r => { const i = db[table].findIndex(x => key(x) === key(r)); if (i > -1) db[table][i] = r; else db[table].push(r); }); return { data: null, error: null }; }
          const hits = db[table].filter(r => match(r, st.filters));
          if (st.op === 'delete') { db[table] = db[table].filter(r => hits.indexOf(r) === -1); return { data: null, error: null }; }
          return { data: st.single ? (hits[0] || null) : JSON.parse(JSON.stringify(hits)), error: null }; }).then(res, rej) };
      return api; };
    const ctx = { window: { sb: { from: Q } }, currentUser: { id: 'doc-1' }, console: { warn() {}, error() {} }, getTreatment: () => null };
    vm.createContext(ctx); vm.runInContext('var _apptDentFail = false;\n' + kp + '\n' + src + '\n' + srcAdd + '\nthis.run = _apptDrawPendingDenture; this.runAdd = _apptDentureAddOnComplete; this.failed = function(){ return _apptDentFail; };', ctx);
    return { run: ctx.run, runAdd: ctx.runAdd, failed: ctx.failed, db: () => db, ops: opsL };
  };
  const R = (t, sf, key, st, unit, extra) => Object.assign({ doctor_id: 'doc-1', patient_id: 'pat-1', tooth_num: String(t), surface: sf, treatment_key: key, status: st || 'completed', unit_id: unit || null }, extra || {});
  const old = [R(14, 'DENTURE', 'denture-partial-acrylic', 'existing_other', 'u-old', { provider_id: 'd1', dx_key: null }), R(15, 'DENTURE', 'denture-partial-acrylic', 'existing_other', 'u-old', { provider_id: 'd1', dx_key: null }),
    R(24, 'DENTURE', 'denture-partial-acrylic', 'existing_other', 'u-old', { provider_id: 'd1', dx_key: null }), R(14, 'WHOLE', 'extracted'), R(15, 'WHOLE', 'extracted'), R(24, 'WHOLE', 'extracted')];
  const S = [{ id: 's-new', doctor_id: 'doc-1', patient_id: 'pat-1', unit_teeth: '14,15', treatment_key: 'denture-partial-metal', provider_id: 'd7', status: 'completed' }];
  const sArg = { id: 's-new', patient_id: 'pat-1' }, dent = m => m.db().teeth_status.filter(r => r.surface === 'DENTURE');
  let m = mk(old, S); await m.run(sArg, null);
  ok(dent(m).length === 2 && dent(m).every(r => r.unit_id === 's-new' && r.status === 'completed' && r.treatment_key === 'denture-partial-metal' && r.provider_id === 'd7') && m.failed() === false
    && m.db().teeth_status.filter(r => r.surface === 'WHOLE').length === 3, 'appointments swap mirror: the pending denture takes the chart from the whole old unit (extraction rows untouched)');
  m = mk(old, S, st => st.table === 'teeth_status' && st.op === 'insert'); await m.run(sArg, null);
  ok(JSON.stringify(dent(m).sort((a, b) => a.tooth_num - b.tooth_num)) === JSON.stringify(old.slice(0, 3)) && m.failed() === true && m.ops.filter(o => o.op === 'upsert').length === 1,
    'appointments swap mirror: a failed write puts the old drawing back exactly as it was and flags the session for rollback');
  m = mk(old, S, (st, all) => st.table === 'teeth_status' && st.op === 'select' && all.filter(o => o.table === 'teeth_status' && o.op === 'select').length === 3); await m.run(sArg, null);
  ok(JSON.stringify(dent(m)) === JSON.stringify(old.slice(0, 3)) && m.ops.filter(o => o.op === 'delete' || o.op === 'insert').length === 0 && m.failed() === true,
    'appointments swap mirror: no snapshot — nothing is removed');
  m = mk(old, S, st => st.table === 'teeth_status' && st.op === 'delete'); await m.run(sArg, null);
  ok(JSON.stringify(dent(m)) === JSON.stringify(old.slice(0, 3)) && m.ops.filter(o => o.op === 'insert').length === 0 && m.failed() === true, 'appointments swap mirror: a failed removal writes nothing and is flagged');
  /* «إضافة سن»: فشلُ الكتابة يُعلِم، والرفضُ لا */
  const addS = [{ id: 's-add', doctor_id: 'doc-1', patient_id: 'pat-1', denture_unit: 'u-old', denture_add: '16', provider_id: 'd7' }];
  m = mk(old.concat([R(16, 'WHOLE', 'extracted')]), addS, st => st.table === 'teeth_status' && st.op === 'insert');
  const addRes = await m.runAdd({ id: 's-add', patient_id: 'pat-1' }, null), addFlag = m.failed();
  m = mk(old.concat([R(16, 'O', 'treated')]), addS); await m.runAdd({ id: 's-add', patient_id: 'pat-1' }, null);
  ok(addRes === true && addFlag === true && m.failed() === false, 'appointments mirror: a write error while adding the tooth is flagged — a tooth that no longer qualifies is not');
}

function i18nEngine(F) {
  const store = { 'sydent.lang': 'en' }, el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/patient-profile.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(), write() {}, querySelector: () => null, getElementById: () => null,
      addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {}; vm.createContext(ctx);
  const theme = F['theme.js'], start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(F['i18n-en.js'], ctx); vm.runInContext(theme.slice(start, end), ctx);
  return s => String(ctx.window.SyI18n.t(s));
}
function i18nChecks(strings, F) {
  const AR = /[؀-ۿ]/; let t;
  try { t = i18nEngine(F); } catch (e) { ok(false, 'i18n: the engine loads'); return; }
  /* نصوصُ صفحة العلاجات (ثابتة بالـHTML والكود) */
  const TH = F['treatments.html'];
  ['خدمة جهاز', 'إضافة سن لجهاز', 'تبطين · إصلاح · تعديل', 'للجهاز الجزئي فقط', '🦷 خدمة جهاز', '🦷 إضافة سن لجهاز'].forEach(x => { if (TH.indexOf(x.replace(/^🦷 /, '')) > -1) strings.push(x); else ok(false, 'i18n: catalog text missing from the page → ' + x); });
  const left = strings.filter(s => AR.test(t(s)));
  ok(strings.length >= 60 && left.length === 0, 'i18n: ' + strings.length + ' service texts through the real engine — no Arabic left' + (left.length ? ' → ' + left.slice(0, 5).map(x => x + ' ⇒ ' + t(x)).join(' | ') : ''));
  ok(t('🛠 Reline LAB — Partial ACR (الفك العلوي — الأسنان 14، 15)') === '🛠 Reline LAB — Partial ACR (Upper jaw — teeth 14, 15)'
    && t('✅ تم تسجيل Add TOOTH — أُضيف السن 16 لرسم الجهاز') === '✅ Add TOOTH recorded — tooth 16 added to the denture drawing'
    && t('Partial ACR — الفك السفلي — كامل · من عيادة أخرى') === 'Partial ACR — Lower jaw — complete · from another clinic', 'i18n: clinic names stay as written — numbers and places survive');
  ok(t('Partial ACR — الفك العلوي — السن 99 · حالة مجهولة') === 'Partial ACR — الفك العلوي — السن 99 · حالة مجهولة' && t('🛠 سبب مجهول') === '🛠 سبب مجهول', 'i18n: unknown values stay fully Arabic (closed tables)');
  ok(strings.indexOf('📋 تعليمات للمريض') > -1 && t('📋 تعليمات للمريض') === '📋 Patient instructions', 'i18n: the instructions button was rendered, collected and translated');
  ok(t('تعليمات جاهزة لأشيع العلاجات — اخترها ثم عدّل النص كما تشاء قبل الحفظ.') === 'Ready-made instructions for the most common treatments — pick one, then edit the text as you like before saving.', 'i18n: the instructions hint is translated');
  /* v736: نصّا العدّاد وحالة «لا قوالب خاصة» يُبنيان من الكود نفسه بعدد المكتبة الحقيقي ويمرّان بالمحرّك (#782) */
  const PCs = F['pp-clinical.js'];
  const mC = /cnt\.textContent = '(\()' \+ POST_OP_LIBRARY\.length \+ '( قالباً\))';/.exec(PCs);
  const mE = /font-size:13px;">(لا قوالب خاصة بعد\. مكتبة SyDent الجاهزة \()' \+ POST_OP_LIBRARY\.length \+ '( قالباً\) متاحة[^<]+)<\/div><\/div>';/.exec(PCs);
  let libN = 0; try { const a = PCs.indexOf('var POST_OP_LIBRARY = ['), b = PCs.indexOf('\n];', a); libN = new Function(PCs.slice(a, b + 3) + ';return POST_OP_LIBRARY.length;')(); } catch (e) { libN = 0; }
  const built = (mC && mE) ? [1, libN, 100].map(n => [mC[1] + n + mC[2], mE[1] + n + mE[2]]) : [];
  ok(libN === 22 && built.length === 3 && built.every(p => !AR.test(t(p[0])) && !AR.test(t(p[1])))
    && t(mC[1] + libN + mC[2]) === '(22 templates)' && /^No templates of your own yet\. The SyDent ready-made library \(22 templates\) /.test(t(mE[1] + libN + mE[2])),
    'i18n: the library count and the «no templates yet» text, built from the code with the real count, come out fully English' + (built.length ? ' → ' + t(built[1][0]) : ' → source texts not found'));
}

async function suite(F) {
  staticChecks(F);
  const over = {}; ['pp-denture-svc.js', 'pp-denture.js', 'pp-dental.js', 'pp-core.js', 'patient-profile.html'].forEach(f => { if (F[f] !== LIVE[f]) over[f] = F[f]; });
  const w = await boot(over);
  let strings = [];
  try {
    try { strings = await behave(w, F); } catch (e) { if (e === POOL.BAIL) throw e; ok(false, 'behaviour ran to the end → ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  } finally { w.close(); }
  await apptMirror(F);
  await apptSwapMirror(F);
  i18nChecks(strings, F);
}

const rep = (file, a, b) => F => { if (F[file].indexOf(a) === -1) throw new Error('mutant anchor missing in ' + file + ': ' + a.slice(0, 70)); const o = Object.assign({}, F); o[file] = F[file].replace(a, b); return o; };
const SV = 'pp-denture-svc.js', MG = 'migrations/208_denture_services.sql';
const MUTANTS = [
  ['service session written as a denture session (unit_teeth)', rep(SV, "    denture_unit: u.id                                   /* M208 */", "    denture_unit: u.id, unit_teeth: dentTeethCsv(u.teeth)")],
  ['service not linked to its denture', rep(SV, "    denture_unit: u.id                                   /* M208 */", "    denture_unit: null")],
  ['added teeth not recorded on the session', rep(SV, "  if (add.length) payload.denture_add = dentTeethCsv(add);", "")],
  ['completed add-tooth does not draw', rep(SV, "  if (add.length && status === 'completed') {", "  if (false) {")],
  ['planned add-tooth draws immediately', rep(SV, "  if (add.length && status === 'completed') {", "  if (add.length) {")],
  ['added row gets its own unit', rep(SV, "treatment_key: u.key, status: u.st, provider_id: providerId || null, unit_id: u.id, review_at: null };", "treatment_key: u.key, status: u.st, provider_id: providerId || null, unit_id: 'u-new', review_at: null };")],
  ['added row ignores the unit status', rep(SV, "treatment_key: u.key, status: u.st, provider_id", "treatment_key: u.key, status: 'completed', provider_id")],
  ['failed drawing keeps the session', rep(SV, "      var rb = await window.sb.from('ledger_sessions').delete().eq('id', sess.id).eq('doctor_id', currentUser.id);\n", "")],
  ['failed drawing still finishes the save', rep(SV, "      showToast('⚠️ تعذّر إضافة السن لرسم الجهاز (' + wErr + ') — لم تُحفظ الجلسة');\n      return;", "      showToast('⚠️ تعذّر إضافة السن لرسم الجهاز (' + wErr + ') — لم تُحفظ الجلسة');")],
  ['non-billable status accepted', rep(SV, "  if (status !== 'completed' && status !== 'planned') {", "  if (false) {")],
  ['planned denture accepts a service', rep(SV, "  if (u.st === 'planned') return 'الجهاز ما زال مخطّطاً — أنجزه أولاً';\n", "")],
  ['complete denture accepts add-tooth', rep(SV, "  if (kind === 'add' && dentIsFullSet(u.teeth, u.arch)) return", "  if (false) return")],
  ['standing tooth accepted for adding', rep(SV, "  return { ok: false, why: s.why || 'لا يقبل الإضافة' };", "  return { ok: true, why: s.why || 'لا يقبل الإضافة' };")],
  ['own tooth selectable', rep(SV, "  if (u.teeth.indexOf(t) !== -1) return { ok: false, own: true, why: 'ضمن الجهاز' };", "  if (u.teeth.indexOf(t) !== -1) return { ok: true, own: true, why: 'ضمن الجهاز' };")],
  ['tooth held by another denture accepted', rep(SV, "  if (dentHas(t)) return { ok: false, why: 'يعوّضه جهاز آخر' };\n", "")],
  ['planned-extraction addition saved as done', rep(SV, "    if (imm.length && status !== 'planned') {", "    if (false) {")],
  ['save without revalidating the denture', rep(SV, "  if (why) { showToast('⚠️ تغيّر المخطط — ' + why); return; }", "")],
  ['save without revalidating the teeth', rep(SV, "      if (!ts.ok) { showToast('⚠️ تغيّر المخطط — السن ' + add[i] + ': ' + ts.why); return; }", "")],
  ['stale context saves', rep(SV, "    && pendingRegionalType === 'arch' && pendingToothStatus === p.key && !currentTooth", "    && !currentTooth")],
  ['clasp service skips the tooth picker', rep(SV, "  if (dsvClaspPick(u, key)) {   /* v741", "  if (false) {   /* v741")],
  ['complete-type denture gets the clasp picker', rep(SV, "return key === DENT_CLASP_SVC_KEY && dsvClaspUnit(u) && dsvClaspTeethOk(u).length > 0;", "return key === DENT_CLASP_SVC_KEY && dsvClaspTeethOk(u).length > 0;")],
  ['every denture service asks for a clasp tooth', rep(SV, "return key === DENT_CLASP_SVC_KEY && dsvClaspUnit(u)", "return dsvClaspUnit(u)")],
  ['unfit tooth accepted for a clasp', rep(SV, "  return dentClaspOk(n) ? '' : 'لا يحمل ضمّة (مفقود أو مزروع أو قلعه مخطّط)';", "  return '';")],
  ['denture tooth accepted for a clasp', rep(SV, "  if (u.teeth.indexOf(n) !== -1) return 'ضمن الجهاز';\n  return dentClaspOk(n)", "  return dentClaspOk(n)")],
  ['clasp step opens with no tooth', rep(SV, "  if (!teeth.length) { showToast('⚠️ اختر سناً واحداً على الأقل'); return; }\n  dsvClose();\n  pendingDentSvc = { key: st.key, label: st.label, kind: 'service'", "  dsvClose();\n  pendingDentSvc = { key: st.key, label: st.label, kind: 'service'")],
  ['cost step does not name the clasp tooth', rep(SV, "    + ((p.clasp && p.clasp.length) ? ' — ' + dentClaspPhrase(p.clasp) : '');", "    ;")],
  ['clasp tooth not written in the description', rep(SV, "  var area = clasp.length ? dentArchLabel(u.arch) + ' — ' + dentClaspPhrase(clasp) : dentAreaText(u.arch, add.length ? add : u.teeth);", "  var area = dentAreaText(u.arch, add.length ? add : u.teeth);")],
  ['new clasp not drawn', rep(SV, "    if (claspNew.length && status === 'completed') claspDrew = await dentClaspSave(u, claspCur.concat(claspNew));", "")],
  ['planned clasp drawn immediately', rep(SV, "    if (claspNew.length && status === 'completed') claspDrew", "    if (claspNew.length) claspDrew")],
  ['clasp repair rewrites the drawing', rep(SV, "    claspNew = clasp.filter(function (t) { return claspCur.indexOf(t) === -1; });", "    claspNew = clasp.slice();")],
  ['new clasp replaces the drawn ones', rep(SV, "claspDrew = await dentClaspSave(u, claspCur.concat(claspNew));", "claspDrew = await dentClaspSave(u, claspNew);")],
  ['save without revalidating the clasp tooth', rep(SV, "    if (cwhy) { showToast('⚠️ تغيّر المخطط — السن ' + clasp[ck] + ': ' + cwhy); return; }", "")],
  ['failed clasp drawing reported as drawn', rep(SV, "    else if (claspDrew) showToast(", "    else if (true) showToast(")],
  ['lab order does not name the clasp tooth', rep(SV, " + (clasp.length ? ' — ' + dentClaspPhrase(clasp) : '') + (notes ? ' — ' + notes : ''),", " + (notes ? ' — ' + notes : ''),")],
  ['clasp tooth not audited', rep(SV, ", add: add.join(','), clasp: clasp.join(',') }", ", add: add.join(',') }")],
  ['history does not name the clasp tooth', rep(SV, "      if (!add.length) add = dentSessClasp(s);   /* v741: خدمةُ الضمّة تسمّي سنَّها */\n", "")],
  ['sessWhere trusts an edited description', rep('pp-denture.js', "  if (!m || m[1] !== dentArchLabel(s.arch)) return [];", "  if (!m) return [];")],
  ['sessWhere reads a clasp from any service', rep('pp-denture.js', "!s.denture_unit || s.treatment_key !== DENT_CLASP_SVC_KEY || (s.arch", "!s.denture_unit || (s.arch")],
  ['sessWhere reads a clasp from a session with no denture', rep('pp-denture.js', "if (!s || s.tooth_num || !s.denture_unit || s.treatment_key !== DENT_CLASP_SVC_KEY", "if (!s || s.tooth_num || s.treatment_key !== DENT_CLASP_SVC_KEY")],
  ['sessWhere accepts a clasp tooth of the other jaw', rep('pp-denture.js', "return t >= 11 && t <= 48 && dentArchOf(t) === s.arch; }) ? teeth : [];", "return t >= 11 && t <= 48; }) ? teeth : [];")],
  ['sessWhere ignores the clasp service', rep('pp-denture.js', "  if (ct.length) return dentArchLabel(s.arch) + ' — ' + dentClaspPhrase(ct);\n", "")],
  ['i18n: the clasp picker hint left untranslated', rep('i18n-en.js', "[/^«(.+)»: اختر السن الذي تُركَّب عليه الضمّة أو تُصلَّح\\.$/, '«$1»: choose the tooth the clasp is fitted on or repaired.'],", "")],
  ['i18n: the clasp picker note left untranslated', rep('i18n-en.js', "    '— الرمادي عليه ضمّة (اختره للإصلاح)، والسن الجديد تُضاف ضمّته لرسم الجهاز.': '— a grey tooth already has a clasp (pick it for a repair); a new tooth gets its clasp added to the denture drawing.'\n", "")],
  ['i18n: the clasp cost-step title left untranslated', rep('i18n-en.js', "    [R('^🛠 (.+) — (.+) \\\\((' + A1 + ')\\\\) — ' + CL + '$')", "    [R('^🛠 (.+) — (.+) \\\\((' + A1 + ')\\\\) — x' + CL + '$')")],
  ['i18n: a clasp save toast left untranslated', rep('i18n-en.js', "    [R('^✅ تم تسجيل (.+) — ' + CL + '( — أُضيفت لرسم الجهاز)?$')", "    [R('^✅ تم تسجيل (.+) — x' + CL + '( — أُضيفت لرسم الجهاز)?$')")],
  ['i18n: the planned clasp toast left untranslated', rep('i18n-en.js', "    [R('^✅ تم تسجيل (.+) مخطّطاً — ' + CL + '(", "    [R('^✅ تم تسجيل (.+) مخطّطاً — x' + CL + '(")],
  ['i18n: the failed clasp drawing toast left untranslated', rep('i18n-en.js', "    [R('^⚠️ تم تسجيل (.+) — ' + CL + ' — تعذّر", "    [R('^⚠️ تم تسجيل (.+) — x' + CL + ' — تعذّر")],
  ['i18n: the clasp lab toast left untranslated', rep('i18n-en.js', "    [R('^✅ تم تسجيل (.+?) — ' + C1 + ' — أكمل بيانات المخبر$')", "    [R('^✅ تم تسجيل (.+?) — x' + C1 + ' — أكمل بيانات المخبر$')")],
  ['context not consumed after saving', rep(SV, "  var openLab = (typeof _regOpenLabAfterSave !== 'undefined') && _regOpenLabAfterSave === true;\n  pendingDentSvc = null;", "  var openLab = (typeof _regOpenLabAfterSave !== 'undefined') && _regOpenLabAfterSave === true;")],
  ['funds not reallocated', rep(SV, "  await reallocatePatientFunds();\n", "")],
  ['lab order opened without the session', rep(SV, "      session_id: sess.id, treatment_key: key,", "      session_id: null, treatment_key: key,")],
  ['planned service sends the lab order', rep(SV, "      draft: status !== 'completed'", "      draft: false")],
  ['history shows other dentures', rep(SV, "return dsvIsSession(s) && s.denture_unit === u.id; })", "return dsvIsSession(s); })")],
  ['inactive treatments offered', rep(SV, "return t && t.is_active !== false && dsvIsTreatment(t); });", "return t && dsvIsTreatment(t); });")],
  ['plain jaw treatments offered as services', rep(SV, "(t.denture_svc === 'service' || t.denture_svc === 'add')) ? t.denture_svc : ''; }", "true) ? (t.denture_svc || 'service') : ''; }")],
  ['completion hook draws a plain service', rep(SV, "  var add = dsvTeeth(sess); if (!add.length) return false;\n  var u = dsvUnit(sess.denture_unit);\n  if (!u || u.st === 'planned') return false;", "  var add = dsvTeeth(sess); if (!add.length) add = [16];\n  var u = dsvUnit(sess.denture_unit);\n  if (!u || u.st === 'planned') return false;")],
  ['completion hook draws a refused tooth', rep(SV, "  var ok = add.filter(function (t) { return dsvToothState(u, t).ok; });\n  if (!ok.length) return false;", "  var ok = add;")],
  ['deleting a planned add-tooth removes teeth', rep(SV, "  if (!dsvIsSession(sess) || (sess.status || 'completed') !== 'completed') return false;", "  if (!dsvIsSession(sess)) return false;")],
  ['deleting removes a tooth held by another denture', rep(SV, "return !!d && d.unit === sess.denture_unit; });", "return !!d; });")],
  ['delete not scoped to the unit', rep(SV, "    .eq('unit_id', sess.denture_unit).eq('surface', DENT_SURFACE).in('tooth_num', add.map(String));", "    .eq('surface', DENT_SURFACE).in('tooth_num', add.map(String));")],
  ['history view decorates chips', rep(SV, "  if (!bar || !units || !units.length || window.__historyMode) return;", "  if (!bar || !units || !units.length) return;")],
  ['history view accepts a service', rep(SV, "  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return true; }", "")],
  ['dialog not refreshed after reloading the treatments', rep(SV, "      if (dsvDialog() === ov && ov._dsv && ov._dsv.view === 'home') dsvRender(ov);", "")],
  ['exam mode lets a service start (saved unlinked)', rep(SV, "  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return true; }\n", "")],
  ['batch mode lets a service start (saved unlinked)', rep(SV, "  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return true; }\n", "")],
  ['draft mode lets a service start', rep(SV, "  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return true; }\n", "")],
  ['inactive locked doctor records a service', rep(SV, "    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل جلسات جديدة'); return true;", "    return false;")],
  ['the cost step opens inside a chart mode', rep(SV, "  if (dsvLocked()) { pendingDentSvc = null; return; }   /* وضعٌ بدأ بين النافذة والخطوة — لا خطوةَ بلا حارس حفظها */\n", "")],
  ['stock prompt stacked over the lab form', rep(SV, "    if (openLab) window._pendingMatDeduct = { k: key, l: label, m: 1, s: [sess.id] };\n    else {", "    {")],
  ['lab area: a service order has no location', rep('lab-slip.js', "    if (sess.denture_unit) {", "    if (false) {")],
  ['lab area: add-tooth shows the jaw only', rep('lab-slip.js', "      return add.length ? { text: jaw + ' — ' + (add.length === 1 ? 'السن ' : 'الأسنان ') + add.join('، '), teeth: add } : { text: jaw, teeth: [] };", "      return { text: jaw, teeth: [] };")],
  ['lab area: every jaw session gets a location', rep('lab-slip.js', "    if (!sess.unit_teeth) return null;\n", "    if (!sess.unit_teeth) return { text: 'x', teeth: [] };\n")],
  ['lab area: link columns not loaded on the labs page', rep('lab-slip.js', ".select('id, arch, unit_teeth, tooth_num, denture_unit, denture_add')", ".select('id, arch, unit_teeth, tooth_num')")],
  ['instructions: an immediate denture gets the general template', rep(SV, "return (u && dentOpenExtractions(u.teeth).length) ? 'lib21' : 'lib13'; }", "return 'lib13'; }")],
  ['instructions: the template is not applied', rep(SV, "{ pick.value = lid; postOpApplyLibrary(lid); }", "{ pick.value = lid; }")],
  ['instructions: the dialog stays open under the form', rep(SV, "  dsvClose();\n  await openPostOpModal();", "  await openPostOpModal();")],
  ['library: immediate template lets the patient remove it on day one', rep('pp-clinical.js', "أبقِ الجهاز في فمك ولا تنزعه، حتى عند النوم في الليلة الأولى", "انزع الجهاز عند النوم من الليلة الأولى")],
  ['library: the unsourced weakness claim is back', rep('pp-clinical.js', "اتصل بالعيادة إذا: انكسر الجهاز أو أحد مشابكه (لا تلصقه بنفسك)", "الجهاز المُصلَح أضعف عند مكان الكسر. اتصل بالعيادة إذا: انكسر الجهاز أو أحد مشابكه (لا تلصقه بنفسك)")],
  ['library: an existing template id reused', rep('pp-clinical.js', '"id": "lib22"', '"id": "lib14"')],
  ['library: the review record dropped', rep('pp-clinical.js', "🔴 سجلُّ المراجعة (16/11/2026)", "ملاحظة")],
  ['instructions form: the «medically reviewed» claim is back', rep('patient-profile.html', "تعليمات جاهزة لأشيع العلاجات", "تعليمات مراجَعة طبياً لأشيع العلاجات")],
  ['i18n: the new hint left untranslated', rep('i18n-en.js', '"تعليمات جاهزة لأشيع العلاجات — اخترها ثم عدّل النص كما تشاء قبل الحفظ."', '"تعليمات جاهزه"')],
  ['lab draft: labs page drops the stage', rep('labs.html', "stage: st ? (st.name + ' (' + st.pos + ' من ' + st.total + ')') : '' };\n}\nfunction labAiTeeth() {", "stage: '' };\n}\nfunction labAiTeeth() {")],
  ['lab draft: patient card ignores a new order from its session', rep('pp-clinical.js', "labOrderArea(lo || { session_id: (typeof pendingLabSessionId !== 'undefined') ? pendingLabSessionId : null })", "labOrderArea(lo)")],
  ['lab draft: the location is not sent', rep('labs.html', "    if (ctxAi && ctxAi.area) payload.area = ctxAi.area;\n", "")],
  ['assistant: the stage is dropped from the lab draft', rep('supabase/functions/ai-assist/index.ts', '(stage ? "المرحلة المطلوبة الآن: " + stage + "\\n" : "") +', '')],
  ['list entry skips choosing between dentures', rep(SV, "  if (ok.length === 1) { dsvBegin(ok[0], key, label, kind, null); return true; }", "  if (ok.length >= 1) { dsvBegin(ok[0], key, label, kind, null); return true; }")],
  ['profile: service session enters the denture hook', rep('patient-profile.html', "  if (sess && window.SyDentSvc && window.SyDentSvc.isSession(sess)) { await window.SyDentSvc.onSessionComplete(sess); return window.SyDentSvc.completeNote(sess); }\n", "")],
  ['profile: delete hook removed', rep('patient-profile.html', "    try { await window.SyDentSvc.onSessionDeleted(sess); } catch (e) { console.warn('delSession: denture service rows skipped:', e); }", "")],
  ['pick handler keeps a stale context', rep('pp-dental.js', "  if (window.SyDentSvc) window.SyDentSvc.clearPending();\n", "")],
  ['pick handler clears the context only after the denture picker returned', F => rep('pp-dental.js', "  if (window.SyDentSvc) {\n    if (window.SyDentSvc.isTreatment(tr)) {", "  if (window.SyDentSvc) {\n    window.SyDentSvc.clearPending();\n    if (window.SyDentSvc.isTreatment(tr)) {")(rep('pp-dental.js', "  if (window.SyDentSvc) window.SyDentSvc.clearPending();\n", "")(F))],
  ['save gate removed', rep('pp-dental.js', "  if (window.SyDentSvc && window.SyDentSvc.saveReady()) { await window.SyDentSvc.save(cost, units, date, notes); return; }\n", "")],
  ['banner decorated without a denture', rep('pp-denture.js', "  if (!units.length) return;\n  if (bar && window.SyDentSvc) window.SyDentSvc.decorate(bar, units);", "  if (bar && window.SyDentSvc) window.SyDentSvc.decorate(bar, units);\n  if (!units.length) return;")],
  ['sessWhere ignores added teeth', rep('pp-denture.js', "    if (at.length) return dentAreaText(s.arch, at);", "    if (at.length) return '';")],
  ['loader drops the marker', rep('pp-core.js', "denture_svc: (t.denture_svc === 'service' || t.denture_svc === 'add') ? t.denture_svc : '',", "denture_svc: '',")],
  ['v737 service: a failed add-tooth draw is not flagged', rep('pp-denture-svc.js', "if (window.SyDenture && window.SyDenture.markDrawFail) window.SyDenture.markDrawFail(sess.id); return false; }", "return false; }")],
  ['v737 appointments: failed swap leaves the chart empty', rep('appointments.html', "console.warn('pending denture rows warn:', ins.error); _apptDentFail = true; await _restoreOld(); }", "console.warn('pending denture rows warn:', ins.error); _apptDentFail = true; }")],
  ['v737 appointments: failed swap not flagged', rep('appointments.html', "console.warn('pending denture rows warn:', ins.error); _apptDentFail = true; await _restoreOld(); }", "console.warn('pending denture rows warn:', ins.error); await _restoreOld(); }")],
  ['v737 appointments: old unit removed without a snapshot', rep('appointments.html', "    if (s1.error) { console.warn('pending denture snapshot warn:', s1.error); _apptDentFail = true; return; }\n", "")],
  ['v737 appointments: failed add-tooth write not flagged', rep('appointments.html', "console.warn('denture add rows warn:', ins.error); _apptDentFail = true; }", "console.warn('denture add rows warn:', ins.error); }")],
  ['appointments: mirror not called', rep('appointments.html', "  if (await _apptDentureAddOnComplete(s, providerOverride)) return;   /* ج4-أ (M208): خدمةُ جهازٍ قائم — ليست جهازاً */\n", "")],
  ['appointments: a tooth under another denture is added', rep('appointments.html', "r.surface === 'DENTURE' || r.surface === 'PONTIC' || r.surface === 'SPACER'", "r.surface === 'PONTIC' || r.surface === 'SPACER'")],
  ['appointments: a standing tooth is added', rep('appointments.html', "    return parts.length > 0 && parts.every(function(p){ return p === 'extraction'; });", "    return true;")],
  ['appointments: a planned denture is drawn into', rep('appointments.html', "  if (!base || base.status === 'planned') return true;", "  if (!base) return true;")],
  ['appointments: added row gets the session as unit', rep('appointments.html', "status: base.status, provider_id: prov, unit_id: ls.data.denture_unit, review_at: null };", "status: base.status, provider_id: prov, unit_id: s.id, review_at: null };")],
  ['appointments: a plain session is swallowed', rep('appointments.html', "  if (ls.error || !ls.data || !ls.data.denture_unit) return false;", "  if (ls.error || !ls.data) return false;")],
  ['M208: marker allowed on any target', rep(MG, " AND target_part = 'arch'));", "));")],
  ['M208: a service may carry unit_teeth', rep(MG, "(tooth_num IS NULL AND arch IS NOT NULL AND unit_teeth IS NULL)", "(tooth_num IS NULL AND arch IS NOT NULL)")],
  ['M208: an existing catalog row drifted', rep(MG, "'جسر', 'ج', '#dc2626'", "'جسر', 'ج', '#dc2627'")],
  ['M208: signup function lost its safety net', rep(MG, "EXCEPTION WHEN OTHERS THEN", "-- no handler")],
  ['catalog page: the service tile saved on a non-jaw target', rep('treatments.html', "if (ui === 'denture_service') return { target_part: 'arch', denture_svc: 'service' };", "if (ui === 'denture_service') return { target_part: 'mouth', denture_svc: 'service' };")],
  ['catalog page: the add tile saved as a plain service', rep('treatments.html', "if (ui === 'denture_add') return { target_part: 'arch', denture_svc: 'add' };", "if (ui === 'denture_add') return { target_part: 'arch', denture_svc: 'service' };")],
  ['catalog page: a plain jaw treatment shown as a service', rep('treatments.html', "return (tp === 'arch' && sv) ? (sv === 'add' ? 'denture_add' : 'denture_service') : tp;", "return (tp === 'arch') ? (sv === 'add' ? 'denture_add' : 'denture_service') : tp;")],
  ['catalog page: editing drops the marker', rep('treatments.html', "updatePayload.denture_svc = _savedDb.denture_svc;", "updatePayload.denture_svc = null;")],
  ['catalog page: adding ignores the tile', rep('treatments.html', "insertPayload.denture_svc = dbTargetOf(pickedTarget).denture_svc;", "insertPayload.denture_svc = null;")],
  ['catalog page: editing opens on the wrong tile', rep('treatments.html', "  pickTarget(uiTargetOf(t));   /* M208: خدمةُ الجهاز ببلاطتها */", "  pickTarget(t.target_part || 'crown');")],
  ['catalog page: tiles shown before the migration', rep('treatments.html', "ts[i].style.display = window.__m208T ? '' : 'none';", "ts[i].style.display = '';")],
  ['catalog page: services still counted under the jaw filter', rep('treatments.html', "uiTargetOf(t) !== activeFilter) return false;", "(t.target_part || 'crown') !== activeFilter) return false;")],
  ['catalog defaults: services inserted unmarked before the migration', rep('treatments.html', "    rows = rows.filter(function(r){ return !r.denture_svc; });", "    rows.forEach(function(r){ delete r.denture_svc; });")],
  ['clasps: the section is missing from the denture window', rep(SV, "  h += dsvClaspHtml(u);\n", "")],
  ['clasps: a click is not saved', rep(SV, "    if (cl) { dsvClaspClick(ov, parseInt(cl.getAttribute('data-dsv-clasp'), 10), false); return; }", "    if (cl) { return; }")],
  ['clasps: offered on a complete denture', rep(SV, "function dsvClaspUnit(u) { return !!(u && typeof dentIsPartialUnit === 'function' && dentIsPartialUnit(u)); }", "function dsvClaspUnit(u) { return !!u; }")],
  ['clasps: editable in initial-exam mode', rep(SV, "  if (dsvLocked() || st.busy) return;", "  if (st.busy) return;")],
  ['clasps: no way back to the suggestion', rep(SV, "  if (!dentClaspIsAuto(u)) h += '<button", "  if (false) h += '<button")],
  ['clasps: an unfit tooth is accepted silently', rep(SV, "    if (!dentClaspOk(n)) { showToast('🦷 السن ' + n + ': لا يحمل ضمّة (مفقود أو مزروع أو قلعه مخطّط)'); return; }\n", "")],
  ['i18n: the clasp hint left untranslated', rep('i18n-en.js', "    '↺ الاقتراح التلقائي': '↺ Automatic suggestion',\n", "")],
  ['i18n: the unfit-tooth reason left untranslated', rep('i18n-en.js', "    'لا يحمل ضمّة (مفقود أو مزروع أو قلعه مخطّط)': 'cannot carry a clasp (missing, implant or planned extraction)'\n", "")],
  ['i18n: the library count left untranslated', rep('i18n-en.js', "[/^\\((\\d+) قالباً\\)$/, '($1 templates)'],", "")],
  ['i18n: the «no templates yet» text left untranslated', rep('i18n-en.js', "[/^لا قوالب خاصة بعد\\. مكتبة SyDent الجاهزة", "[/^لا قوالب خاصه بعد\\. مكتبة SyDent الجاهزة")],
  ['i18n: the count wording drifts from the dictionary', rep('pp-clinical.js', "if (cnt) cnt.textContent = '(' + POST_OP_LIBRARY.length + ' قالباً)';", "if (cnt) cnt.textContent = '(' + POST_OP_LIBRARY.length + ' قالب)';")],
  ['i18n: the instructions button left untranslated', rep('i18n-en.js', "'📋 تعليمات للمريض': '📋 Patient instructions',", "")],
  ['i18n: a service toast left untranslated', rep('i18n-en.js', "[R('^✅ تم تسجيل (.+) — أُضيف ' + TP + ' لرسم الجهاز$')", "[R('^✅ تم تسجيل (.+) — أُضيفت ' + TP + ' لرسم الجهاز$')")],
  ['i18n: the unit line half-translated on an unknown status', rep('i18n-en.js', "(?: · (مخطط|من عيادة أخرى|من عيادتنا|محوّل))?$'), function (m, n, a, st) { return n + ' — ' + area1(a) + (st ? ' · ' + ST[st] : ''); }]", "(?: · (.+))?$'), function (m, n, a, st) { return n + ' — ' + area1(a) + (st ? ' · ' + (ST[st] || st) : ''); }]")]
];

(async () => {
  await suite(LIVE);
  const basePass = pass, baseFail = fail;
  if (process.argv.indexOf('--self-test') !== -1 || process.argv.indexOf('--mutants') !== -1) {
    /* كل طفرةٍ مستقلة ⇒ تتوزّع على الأنوية، وكلٌّ منها يقف عند أول توكيدٍ أحمر */
    const pool = await POOL.runMutants(MUTANTS, async ([name, mut]) => {
      pass = 0; fail = 0;
      let F2;
      try { F2 = mut(LIVE); } catch (e) { if (/mutant anchor missing/.test(String(e))) { console.log('MUTANT ANCHOR MISSING:', name); return false; } return true; }
      const log = console.log; console.log = () => {}; BAILING = true;
      try { await suite(F2); } catch (e) { fail++; }
      finally { console.log = log; BAILING = false; }
      return fail > 0;
    });
    pool.dull.forEach(i => console.log('MUTANT SURVIVED:', MUTANTS[i][0]));
    if (pool.failed.length) console.log('MUTANT WORKER FAILED:', pool.failed.join(', '));
    const bit = pool.failed.length ? -1 : pool.bit;
    pass = basePass; fail = baseFail;
    const allBit = bit === MUTANTS.length;
    console.log((fail === 0 && allBit ? '✅' : '❌') + ' prove-denture-svc: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && allBit ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-denture-svc: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ prove-denture-svc:', e && e.stack || e); process.exit(1); });
