/* v550 — مثبتُ الدفعة ١ من ملاحظات Deep Code (docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   #2  الحقولُ الطبية لا تبدأ «لا يوجد» · شريطُ التنبيه الطبي داخل الشريط العلوي اللاصق ومصدرُه warnParts/allergyParts
       (نقلٌ لا تكرار — خرجت الوسومُ من سطر الهيدر) · مهرَّب · مخفيٌّ بلا تحذير · فشلُ التحميل يقول «تعذّر» لا «لا يوجد».
   #16 هيكلُ التحميل على الصفحة حتى رسم الهيدر/المعلومات/الأرقام · يُزال بـinit وبمسار الفشل.
   #17 مسافةُ آخر المحتوى بقدر الزر العائم · التنحّي بالتمرير لأسفل والعودةُ بالتمرير لأعلى/قرب الأعلى/بتغيّرٍ داخله.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
function constSrc(src, name) {
  const i = src.indexOf('const ' + name + ' = [');
  if (i < 0) return '';
  return src.slice(i, src.indexOf('];', i) + 2);
}
const FILES = ['patient-profile.html', 'patient-profile.css', 'theme.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });

function suite(F) {
  const H = F['patient-profile.html'], C = F['patient-profile.css'], T = F['theme.js'];
  /* ── #2 القيمُ الابتدائية ── */
  ['iMedFlags', 'iAllergies', 'iHistory'].forEach(id => {
    const m = H.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
    ok(m && m[1] !== 'لا يوجد' && /التحميل/.test(m[1]), id + ': initial text must not claim «لا يوجد» before data arrives');
  });
  /* ── #2 مكانُ الشريط: شقيقٌ مباشر بعد .topbar اللاصق وقبل الصفحة ── */
  const tb = H.slice(H.indexOf('<div class="topbar">'), H.indexOf('<div class="page'));
  ok(/<\/div>\n<\/div>\n<!-- DeepCode #2[^]*?-->\n<div class="pp-med-alert" id="pMedAlert" role="alert" hidden/.test(tb), 'alert strip sits right under the topbar, hidden by default, role=alert');
  const rh = fnSrc(H, 'renderHeader');
  ok(!!rh && !/med-flag-tag|allergy-tag/.test(rh) && /renderMedAlert\(\);/.test(rh), 'renderHeader moved the tags to the strip (no duplicate) and renders it');
  /* ── #2 السلوك: تشغيلُ الدوال الحيّة ── */
  const code = [constSrc(H, 'MEDICAL_FLAGS_DEFS'), constSrc(H, 'ALLERGY_FLAGS_DEFS'), fnSrc(H, 'medFlagLabels'), fnSrc(H, 'allergyFlagLabels'),
    fnSrc(H, 'warnParts'), fnSrc(H, 'allergyParts'), fnSrc(H, 'escapeHtml'), fnSrc(H, 'medAlertHtml'), fnSrc(H, 'renderMedAlert'),
    fnSrc(H, 'ppEndLoading'), fnSrc(H, 'ppLoadFailed')].join('\n');
  const els = {}, mk = id => (els[id] = els[id] || { id, innerHTML: '', textContent: '', hidden: true, title: '', attrs: { 'aria-busy': 'true' },
    classList: { s: new Set(['pp-loading']), remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } }, removeAttribute(a) { delete this.attrs[a]; } });
  let toast = '';
  let watched = 0;
  const ctx = { document: { getElementById: mk }, console: { warn() {} }, showToast: m => { toast = m; }, patient: null, Array, String, ppWatchTopbar: () => { watched++; } };
  try { vm.createContext(ctx); vm.runInContext(code + '\nthis.__f={medAlertHtml,renderMedAlert,ppEndLoading,ppLoadFailed};', ctx); } catch (e) { ok(false, 'live functions run: ' + e.message); return; }
  const f = ctx.__f;
  ok(f.medAlertHtml({ medical_flags: [], allergies: 'لا يوجد', medical_flags_other: '' }) === '', 'no warning + legacy «لا يوجد» allergy ⇒ empty (strip hidden)');
  const w = f.medAlertHtml({ medical_flags: ['anticoagulants'], medical_flags_other: '', allergies: '' });
  ok(/pma-warn">⚠️ تحذير طبي: مميعات دم</.test(w) && !/pma-alg/.test(w), 'warning only ⇒ red segment, no allergy segment');
  const a = f.medAlertHtml({ medical_flags: ['penicillin_allergy'], allergies: 'يود', medical_flags_other: '' });
  ok(/pma-alg">⚠️ حساسية: بنسلين، يود</.test(a) && !/pma-warn/.test(a), 'allergy chips + free text in the amber segment');
  const x = f.medAlertHtml({ medical_flags: [], medical_flags_other: '<img src=x onerror=1>', allergies: '"><b>' });
  ok(!/<img|<b>/.test(x) && /&lt;img/.test(x) && /&quot;&gt;&lt;b&gt;/.test(x), 'every value escaped (#195)');
  ctx.patient = { medical_flags: ['diabetes'], allergies: 'لا يوجد' };
  mk('pMedAlert').textContent = 'تحذير'; f.renderMedAlert();
  ok(els.pMedAlert.hidden === false && /سكري/.test(els.pMedAlert.innerHTML) && /انقر/.test(els.pMedAlert.title) && watched === 1, 'renderMedAlert shows the strip when there is a warning (and measures the topbar)');
  ctx.patient = { medical_flags: [], allergies: '' }; f.renderMedAlert();
  ok(els.pMedAlert.hidden === true && els.pMedAlert.innerHTML === '' && els.pMedAlert.title === '' && watched === 1, 'renderMedAlert hides the strip when there is nothing');
  f.ppLoadFailed(new Error('net'));
  ok(['iMedFlags', 'iAllergies', 'iHistory'].every(id => /تعذّر التحميل/.test(els[id].textContent)) && !els.ppPage.classList.contains('pp-loading')
     && !('aria-busy' in els.ppPage.attrs) && /تعذّر/.test(toast), 'load failure says «تعذّر التحميل», ends the skeleton, toasts');
  /* ── #16 الهيكل ── */
  ok(/<div class="page pp-loading" id="ppPage" aria-busy="true">/.test(H), 'page starts in the loading state');
  const ini = fnSrc(H, 'init');
  ok(/safe\(renderStats,\s*'renderStats'\);\s*\n\s*ppEndLoading\(\);/.test(ini), 'init ends the loading state right after header/info/stats render');
  ok(/try \{ await loadAll\(\); \}\s*\n\s*catch \(e\) \{ ppLoadFailed\(e\); return; \}/.test(H), 'bootstrap catches a failed load (no endless skeleton, no false «لا يوجد»)');
  ok(/setTimeout\(ppLoadSlow, 15000\);/.test(H) && /e\.classList\.add\('pp-msg'\)/.test(fnSrc(H, 'ppLoadSlow')) && /\.pp-loading #tab-file \.ival\.pp-msg\{color:var\(--yellow-ink\) !important;background:none;animation:none;\}/.test(C), 'v567 review: after 15s without data the medical fields say so (readable over the skeleton)');
  ok(/var _net = !!\(pErr && \(\/fetch\|network\|load failed\|timeout\/i\.test\(String\(pErr\.message \|\| ''\)\)/.test(H) && /if \(_net\) \{\s*\n\s*document\.body\.innerHTML = '[^']*تعذّر الاتصال بالخادم/.test(H) && /onclick="location\.reload\(\);return false;"/.test(H), 'v567 review: a network failure shows «cannot reach the server» + retry, not «patient not found»');
  ok(/\.pp-loading \.h-name,\.pp-loading \.stat-val,\.pp-loading #tab-file \.ival\{\s*color:transparent !important;/.test(C), 'skeleton hides placeholder values (0 · — · text)');
  ok(/\.pp-med-alert\[hidden\]\{display:none;\}/.test(C) && /\.pp-med-alert\{position:sticky;top:var\(--pp-tb-h,66px\);/.test(C),
     'strip: sticky under the measured topbar, [hidden] honoured over display:flex');
  ok(/\.pp-med-alert\{[^}]*background:linear-gradient\(var\(--red-bg\),var\(--red-bg\)\),var\(--bg\);/.test(C), 'strip is opaque (the translucent dark --red-bg sits on --bg) — content never shows through');
  ok(/@media\(max-width:820px\)\{\s*\.topbar\{position:static;\}\s*\.pp-med-alert\{top:0;/.test(C), 'mobile: the 3-row topbar scrolls away, the alert alone stays stuck at the top');
  ok(/new ResizeObserver\(set\)\.observe\(tb\)/.test(fnSrc(H, 'ppWatchTopbar')) && /if \(h\) ppWatchTopbar\(\);/.test(H), 'topbar height measured live (wrapping) when the strip shows');
  /* ── #17 الزر العائم ── */
  ok(/body:has\(#syFabDock:not\(:empty\)\) \.sb-main-content::after\{content:"";display:block;height:calc\(var\(--sy-fab-bottom,14px\) \+ 62px\)\}/.test(T), 'content end spacer as tall as the dock');
  ok(/#syFabDock\.sy-fab-away\{opacity:0;pointer-events:none;/.test(T), 'away state is invisible AND click-through');
  ok(/wireDrag\(d\);\s*\n\s*wireAway\(d\);/.test(T), 'away behaviour wired when the dock is created');
  ok(/p = last\.has\(t\) \? last\.get\(t\) : 0;/.test(T), 'an unseen container starts at 0 — a single jump (wheel/End key) still hides the dock');
  ok(/\{ capture: true, passive: true \}/.test(T) && /new MutationObserver\(function \(\) \{ d\.classList\.remove\('sy-fab-away'\); \}\)/.test(T), 'captures every scroll container · returns on any change inside (new message)');
  const tctx = {}; vm.createContext(tctx);
  const aw = fnSrc(T, 'awayStep'), consts = (T.match(/var AWAY_PX = \d+, AWAY_TOP = \d+;/) || [''])[0];
  try { vm.runInContext(consts + aw + ';this.s=awayStep;', tctx); } catch (e) { ok(false, 'awayStep runs'); return; }
  const s = tctx.s;
  ok(s(100, 300) === true && s(300, 200) === false && s(300, 303) === null && s(500, 60) === false && s(0, 70) === false,
     'down ⇒ away · up ⇒ back · jitter ⇒ unchanged · near the top ⇒ always back');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['allergies start «لا يوجد» again', rep('patient-profile.html', 'id="iAllergies" style="color:var(--yellow-ink)">جارٍ التحميل…', 'id="iAllergies" style="color:var(--yellow-ink)">لا يوجد')],
  ['strip not rendered', rep('patient-profile.html', '  document.getElementById(\'pSub\').innerHTML = sub;\n  renderMedAlert();', '  document.getElementById(\'pSub\').innerHTML = sub;')],
  ['strip not escaped', rep('patient-profile.html', "⚠️ حساسية: ' + escapeHtml(a.join('، '))", "⚠️ حساسية: ' + (a.join('، '))")],
  ['strip never hides', rep('patient-profile.html', '  el.hidden = !h;', '  el.hidden = false;')],
  ['strip id lost', rep('patient-profile.html', '<div class="pp-med-alert" id="pMedAlert" role="alert" hidden', '<div class="pp-med-alert" id="pMedAlertX" role="alert" hidden')],
  ['strip not sticky', rep('patient-profile.css', '.pp-med-alert{position:sticky;', '.pp-med-alert{')],
  ['strip translucent again', rep('patient-profile.css', 'background:linear-gradient(var(--red-bg),var(--red-bg)),var(--bg);', 'background:var(--red-bg);')],
  ['mobile topbar still eats the screen', rep('patient-profile.css', '  .topbar{position:static;}\n', '')],
  ['topbar height not watched', rep('patient-profile.html', '  if (h) ppWatchTopbar();', '')],
  ['skeleton never ends', rep('patient-profile.html', "  ppEndLoading();   /* DeepCode #16", "  /* DeepCode #16")],
  ['failed load unhandled', rep('patient-profile.html', '  try { await loadAll(); }\n  catch (e) { ppLoadFailed(e); return; }', '  await loadAll();')],
  ['failure claims nothing', rep('patient-profile.html', "if (e) e.textContent = '⚠️ تعذّر التحميل — أعد تحميل الصفحة';", "if (e) e.textContent = 'لا يوجد';")],
  ['[hidden] loses to display:flex', rep('patient-profile.css', '.pp-med-alert[hidden]{display:none;}\n', '')],
  ['skeleton shows placeholders', rep('patient-profile.css', 'color:transparent !important;background:var(--bg3)', 'background:var(--bg3)')],
  ['no end spacer', rep('theme.js', " .sb-main-content::after{content:\"\";display:block;height:calc(var(--sy-fab-bottom,14px) + 62px)}", " .sb-main-content::after{}")],
  ['away still clickable', rep('theme.js', '{opacity:0;pointer-events:none;', '{opacity:0;')],
  ['away never wired', rep('theme.js', '      wireDrag(d);\n      wireAway(d);', '      wireDrag(d);')],
  ['first (only) scroll event ignored', rep('theme.js', 'p = last.has(t) ? last.get(t) : 0;', 'p = last.has(t) ? last.get(t) : y;')],
  ['network failure still says not-found', rep('patient-profile.html', "    var _net = !!(pErr && (/fetch|network|load failed|timeout/i.test(String(pErr.message || '')) || (typeof navigator !== 'undefined' && navigator.onLine === false)));", "    var _net = false;")],
  ['no slow-network message', rep('patient-profile.html', '  setTimeout(ppLoadSlow, 15000);   /* v567 */\n', '')],
  ['never comes back near the top', rep('theme.js', '    if (y <= AWAY_TOP) return false;\n', '')]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-deepcode-b1: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-deepcode-b1: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
