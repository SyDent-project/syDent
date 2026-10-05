/* مثبت عدم-الانحدار الشامل للمخطط — يقارن v429 (85517ba، ما قبل جولة الحالات كلها)
   بالحاضر على **كل مسارات الرسم** بمخططاتٍ لا تحوي أيَّ حالةٍ سريرية:
   لو لمست الجولةُ ميزةً قائمة، فرقٌ واحدُ بايت يُسقط هذا المثبت. */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = require('path').resolve(__dirname, '..');
/* أساسُ المقارنة: ما قبل جولة الحالات كلها (v429). يُمرَّر مرجعٌ آخر كوسيطٍ أول عند الحاجة. */
const BASE = process.argv[2] || '85517ba';
const sh = (c) => cp.execSync(c, { encoding: 'utf8', maxBuffer: 1 << 28 });
const OLD = sh(`git -C ${ROOT} show ${BASE}:pp-dental.js`);
const NEW = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8');
const COLD = sh(`git -C ${ROOT} show ${BASE}:pp-core.js`);
const CNEW = fs.readFileSync(path.join(ROOT, 'pp-core.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + ' — ' + e.message); fail++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ': ' + String(a).slice(0, 120) + ' ≠ ' + String(b).slice(0, 120)); };
const yes = (c, m) => { if (!c) throw new Error(m); };

const CAT = [
  ['custom_1781292854422', 'حشوة كومبوزت', '#60a5fa', '#1d4ed8', 'crown', 'restorative'],
  ['treated', 'حشوة املغم', '#334155', '#0f172a', 'crown', 'restorative'],
  ['root-canal', 'معالجة لبية', '#8b5cf6', '#5b21b6', 'root', 'endodontics'],
  ['crown', 'تاج', '#fb923c', '#c2410c', 'crown_full', 'prosthodontics'],
  ['bridge', 'جسر', '#dc2626', '#991b1b', 'bridge', 'prosthodontics'],
  ['implant', 'زراعة', '#0ea5e9', '#0369a1', 'implant', 'implantology'],
  ['extracted', 'قلع', '#ef5350', '#c62828', 'extraction', 'surgical'],
  ['xray', 'أشعة', '#94a3b8', '#475569', 'whole', 'diagnostic'],
  ['pedo-spacer', 'حافظ مسافة', '#d946ef', '#a21caf', 'whole', 'pediatric'],
  ['socket-graft', 'طعم عظمي', '#f59e0b', '#b45309', 'whole', 'surgical', true],
  ['cleaning', 'تقليح', '#22c55e', '#15803d', 'quadrant', 'preventive'],
].map(r => ({ id: r[0], name: r[1], label: r[1], fill: r[2], stroke: r[3], target_part: r[4], category: r[5],
  post_extraction: !!r[6], price: 50000, currency: 'SYP', price_overrides: {}, is_active: true, is_favorite: false,
  needs_lab: false, dentition_scope: 'all', accepts_units: false, default_note: '', completion_note: '', layman_name: '' }));

function ctxOf(src, core) {
  const el = () => ({ innerHTML: '', style: {}, value: '', setAttribute(){}, getAttribute(){ return null; }, hasAttribute(){ return false; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, appendChild(){}, remove(){}, addEventListener(){}, focus(){}, select(){},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } });
  const c = {
    window: { __m61: true, __historyMode: false, addEventListener(){}, SyDentSub: { isReadOnly: () => false } },
    document: { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), addEventListener(){} },
    console, localStorage: { getItem: () => null, setItem(){} }, setTimeout: (f) => f && 0,
    TREATMENTS: CAT.slice(), teethMap: {}, _chartStatusFilter: 'all', sessions: [], _toothPhotoCounts: {},
    patient: { dob: '1990-01-01' }, patientId: 'p', currentUser: { id: 'd' }, CLINIC_DOCTORS: [],
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
    showToast(){}, calcAge: () => 30, sessionTreatmentKey: (x) => x.treatment_key, centerSurface: () => 'O', tipOptBadge: () => '', ppGuarded: (n, f) => f,
  };
  c.globalThis = c; c.self = c; c.__src = src;
  vm.createContext(c);
  vm.runInContext(src, c, { filename: 'pp-dental.js' });
  vm.runInContext(/function getTreatment\(id\) \{[\s\S]*?\n\}/.exec(core)[0], c, { filename: 'getTreatment' });
  vm.runInContext('var _T = rebuildToothMaps(); T_FILL=_T.fill; T_STROKE=_T.stroke; T_LABEL=_T.label;', c);
  return c;
}
const O = ctxOf(OLD, COLD), N = ctxOf(NEW, CNEW);

function mapOf(rows) {
  const m = {};
  rows.forEach(t => { const n = String(t.t); if (!m[n]) m[n] = {}; m[n][t.s] = t.k;
    if (!m[n].__status) m[n].__status = {}; m[n].__status[t.s] = t.st || 'completed';
    if (t.u) { if (!m[n].__unit) m[n].__unit = {}; m[n].__unit[t.s] = t.u; }
    if (t.rv) { if (!m[n].__review) m[n].__review = {}; m[n].__review[t.s] = t.rv; } });
  return m;
}
function snapshot(ctx, m, filter, dent) {
  ctx.teethMap = JSON.parse(JSON.stringify(m));
  ctx._chartStatusFilter = filter;
  vm.runInContext('dentitionMode = ' + JSON.stringify(dent) + '; flipState = ' + (dent === 'mixed' ? 'defaultMixedFlips()' : '{}') + ';', ctx);
  vm.runInContext('_T = rebuildToothMaps(); T_FILL=_T.fill; T_STROKE=_T.stroke; T_LABEL=_T.label;', ctx);
  const fp = /function findPontics\(arch\) \{[\s\S]*?\n  \}\n/.exec(ctx.__src)[0];
  vm.runInContext('chartPonticSet = {}; (function(){ var ponticSet = chartPonticSet; ' + fp + ' findPontics(activeUpper()); findPontics(activeLower()); })();', ctx);
  const pontic = vm.runInContext('chartPonticSet', ctx);
  const teeth = vm.runInContext('activeUpper().concat(activeLower())', ctx);
  let out = '';
  teeth.forEach(n => {
    const up = vm.runInContext('activeUpper()', ctx).indexOf(n) >= 0;
    const sm = ctx.chartFilterSM(ctx.teethMap[String(n)]);
    let branch, html;
    if (ctx.isImplant(n)) { branch = 'implant'; html = ctx.buildImplantTooth(n, up); }
    else if (pontic[n]) { branch = 'pontic'; html = ctx.buildPonticTooth(n, up); }
    else if (ctx.isExtractionDone ? ctx.isExtractionDone(n) : ctx.isExtracted(n)) { branch = 'ghost'; html = ctx.buildExtractedPlaceholder(n, up); }
    else { branch = 'tooth'; html = ctx.buildTooth(n, sm, up); }
    out += n + '|' + branch + '|' + html + '|' + ctx.buildOcclusalTooth(n, sm, up)
        + '|' + ctx.occTipRows(n, sm) + '|' + (ctx.isBridgeAbut(n) ? 1 : 0) + (ctx.isExtracted(n) ? 1 : 0) + (ctx.getDominantStatus(n)) + '\n';
  });
  const e = { innerHTML: '' }, gi = ctx.document.getElementById;
  ctx.document.getElementById = () => e;
  try { ctx.renderLegend(); } finally { ctx.document.getElementById = gi; }
  return out + '##LEGEND##' + e.innerHTML;
}

const F = {
  'سنٌّ سليمٌ بالكامل (32 سناً)': [],
  'حشواتُ أسطحٍ مفردة ومركّبة + أملغم': [
    { t: 16, k: 'custom_1781292854422', s: 'MOD' }, { t: 26, k: 'treated', s: 'O' }, { t: 36, k: 'custom_1781292854422', s: 'B' },
    { t: 46, k: 'treated', s: 'MI' }, { t: 21, k: 'custom_1781292854422', s: 'V' }, { t: 31, k: 'treated', s: 'L' } ],
  'معالجاتٌ لبية مفردة ومركّبة': [
    { t: 17, k: 'root-canal', s: 'R1R2R3' }, { t: 27, k: 'root-canal', s: 'R1' }, { t: 37, k: 'root-canal', s: 'R1R2' },
    { t: 47, k: 'root-canal', s: 'R2' } ],
  'تيجانٌ وأشعةٌ ومراقبةٌ قديمة بعلاج': [
    { t: 13, k: 'crown', s: 'CROWN_FULL' }, { t: 23, k: 'xray', s: 'WHOLE' }, { t: 33, k: 'crown', s: 'CROWN_FULL', st: 'planned' },
    { t: 43, k: 'treated', s: 'O', st: 'condition', rv: '2026-12-01' }, { t: 12, k: 'crown', s: 'CROWN_FULL', st: 'existing_other' } ],
  'جسرٌ بوحدةٍ ووهمي + جسرٌ قديم بلا معرّف': [
    { t: 37, k: 'bridge', s: 'WHOLE', u: 'u1' }, { t: 36, k: 'bridge', s: 'WHOLE', u: 'u1' }, { t: 35, k: 'bridge', s: 'PONTIC', u: 'u1' },
    { t: 34, k: 'bridge', s: 'PONTIC', u: 'u1' }, { t: 33, k: 'bridge', s: 'WHOLE', u: 'u1' },
    { t: 35, k: 'extracted', s: 'WHOLE' }, { t: 34, k: 'extracted', s: 'WHOLE' },
    { t: 45, k: 'bridge', s: 'WHOLE' }, { t: 46, k: 'bridge', s: 'PONTIC' }, { t: 46, k: 'extracted', s: 'WHOLE' }, { t: 47, k: 'bridge', s: 'WHOLE' } ],
  'زرعاتٌ وقلعٌ منجزٌ ومخطّطٌ ومحوّل': [
    { t: 15, k: 'implant', s: 'WHOLE' }, { t: 25, k: 'extracted', s: 'WHOLE' }, { t: 26, k: 'extracted', s: 'WHOLE', st: 'planned' },
    { t: 27, k: 'extracted', s: 'WHOLE', st: 'referred' }, { t: 28, k: 'extracted', s: 'WHOLE', st: 'existing_other' },
    { t: 26, k: 'crown', s: 'CROWN_FULL', st: 'planned' } ],
  'موقعُ قلعٍ وحافظُ مسافة': [
    { t: 16, k: 'extracted', s: 'WHOLE' }, { t: 16, k: 'socket-graft', s: 'SOCKET' },
    { t: 36, k: 'extracted', s: 'WHOLE' }, { t: 36, k: 'pedo-spacer', s: 'SPACER' },
    { t: 35, k: 'pedo-spacer', s: 'SPACER' }, { t: 37, k: 'pedo-spacer', s: 'SPACER' } ],
  'كلُّ الحالات على أسنانٍ مختلفة (planned/EC/EO/referred/condition)': [
    { t: 11, k: 'custom_1781292854422', s: 'M', st: 'planned' }, { t: 12, k: 'treated', s: 'O', st: 'existing_current' },
    { t: 13, k: 'treated', s: 'D', st: 'existing_other' }, { t: 14, k: 'crown', s: 'CROWN_FULL', st: 'referred' },
    { t: 15, k: 'root-canal', s: 'R1', st: 'condition', rv: '2026-10-01' }, { t: 16, k: 'treated', s: 'B', st: 'existing' } ],
};

console.log('═══ تكافؤُ بايت مع ' + BASE + ' (v429) — مخططاتٌ بلا أي حالةٍ سريرية ═══');
Object.keys(F).forEach(name => {
  ['all', 'planned', 'completed', 'hide_existing'].forEach(filt => {
    T(name + ' · فلتر «' + filt + '»', () => {
      const m = mapOf(F[name]);
      eq(snapshot(N, m, filt, 'permanent'), snapshot(O, m, filt, 'permanent'), 'اختلاف');
    });
  });
});
['primary', 'mixed'].forEach(d => {
  T('الإطباقُ «' + d + '» — الأقواسُ اللبنية/المختلطة بكاملها', () => {
    const m = mapOf([{ t: 54, k: 'treated', s: 'O' }, { t: 64, k: 'extracted', s: 'WHOLE' }, { t: 74, k: 'crown', s: 'CROWN_FULL' },
                     { t: 16, k: 'custom_1781292854422', s: 'MOD' }, { t: 36, k: 'root-canal', s: 'R1R2' }]);
    eq(snapshot(N, m, 'all', d), snapshot(O, m, 'all', d), 'اختلاف');
  });
});

console.log('═══ المسنداتُ المنطقية (نفسُ الجواب للمخططات القائمة) ═══');
T('isExtracted · isBridgeAbut · isImplant · isBridgePontic · getDominantStatus · getStatus — بايت-مطابقةٌ نصّاً', () => {
  ['function isExtracted(num)', 'function isBridgeAbut(num)', 'function isImplant(num)', 'function getDominantStatus(num)',
   'function getStatus(num, surface)', 'function isExtractionKey(key)', 'function isBridgeKey(key)', 'function isImplantKey(key)',
   'function effectiveSurfaceTreatment(sm, regionKey)', 'function chartFilterSM(sm)'].forEach(sig => {
    const grab = (src) => { const i = src.indexOf(sig); yes(i > 0, sig + ' مفقودة'); return src.slice(i, src.indexOf('\n}', i) + 2); };
    eq(grab(NEW), grab(OLD), sig);
  });
});
const ROUND = (BASE === '85517ba');
if (ROUND) T('دوالُّ الكتابة المالية والوحدات لم تُمَسّ نصّاً', () => {
  ['function toothUnitsValue()', 'function toothUnitsSetup(', 'function _reviewAtVal()'].forEach(sig => {
    const i = NEW.indexOf(sig), j = OLD.indexOf(sig);
    yes(i > 0 && j > 0, sig + ' مفقودة');
  });
  const body = (src) => src.slice(src.indexOf('function toothUnitsValue()'), src.indexOf('\n}', src.indexOf('function toothUnitsValue()')) + 2);
  eq(body(NEW), body(OLD), 'toothUnitsValue');
});
if (ROUND) T('pp-plan.js وpp-timeline.js وpp-appt.js وpp-extras.js لم تتغيّر إطلاقاً', () => {
  ['pp-plan.js', 'pp-timeline.js', 'pp-appt.js', 'pp-extras.js', 'admin-render.js', 'appt-booking.js'].forEach(f => {
    eq(sh(`git -C ${ROOT} diff --name-only ${BASE}..HEAD -- ${f}`).trim(), '', f + ' تغيّر');
  });
});
if (ROUND) T('صفحاتُ المنصة الأخرى لم تتغيّر إلا بتوكن كسر الفليت', () => {
  const files = sh(`git -C ${ROOT} diff --name-only ${BASE}..HEAD -- '*.html'`).trim().split('\n');
  files.filter(f => f !== 'patient-profile.html').forEach(f => {
    const d = sh(`git -C ${ROOT} diff ${BASE}..HEAD -- ${f}`);
    const lines = d.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-][+-]/.test(l));
    lines.forEach(l => yes(/\?v=2026/.test(l), f + ': سطرٌ غيرُ توكن → ' + l.slice(0, 80)));
  });
});
if (ROUND) T('بطاقةُ المريض: التغييرُ بالـHTML عناصرُ شريط الفحص الجديدة فقط (إضافةٌ بحتة)', () => {
  const d = sh(`git -C ${ROOT} diff ${BASE}..HEAD -- patient-profile.html`);
  const lines = d.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-][+-]/.test(l) && !/\?v=2026/.test(l));
  yes(lines.every(l => l.startsWith('+')), 'حُذف سطرٌ من بطاقة المريض: ' + (lines.find(l => l.startsWith('-')) || '').slice(0, 90));
  var OKL = function(l){ return /examCond|exam-cond|v433/.test(l) || /^\+\s*<\/div>\s*$/.test(l); };
  yes(lines.every(OKL), 'سطرٌ خارج شريط الفحص: ' + (lines.find(function(l){ return !OKL(l); }) || '').slice(0, 90));
});
if (ROUND) T('pp-core.js: سطرُ منطقٍ واحدٌ مضاف (ارتدادُ getTreatment) وسطرٌ واحدٌ محذوف', () => {
  const d = sh(`git -C ${ROOT} diff ${BASE}..HEAD -- pp-core.js`);
  const add = d.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1).trim());
  const del = d.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).map(l => l.slice(1).trim());
  let inB = false;
  const logic = add.filter(l => { if (inB) { if (l.indexOf('*/') >= 0) inB = false; return false; }
    if (l.indexOf('/*') === 0) { if (l.indexOf('*/') < 0) inB = true; return false; } return !(l.indexOf('*') === 0); });
  eq(logic.length, 1, 'أسطرُ منطقٍ مضافة'); yes(/getCondition/.test(logic[0]), 'ليس سطرَ الارتداد');
  eq(del.join(' '), 'return null;', 'محذوفٌ غيرُ متوقّع');
});
if (ROUND) T('CSS: إضافاتٌ بحتة (صفرُ سطرٍ محذوف من patient-profile.css عدا سطر وضع القراءة المحدَّث)', () => {
  const d = sh(`git -C ${ROOT} diff ${BASE}..HEAD -- patient-profile.css`);
  const del = d.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
  eq(del.length, 1, 'حُذف أكثرُ من سطر');
  yes(/data-sub-level/.test(del[0]), 'المحذوفُ ليس سطرَ وضع القراءة');
});

console.log('\n' + (fail ? '⛔ ' : '✅ ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
