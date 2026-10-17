/* v589 — مثبتُ «مراجعة اليوم» 🔁 على بانر المراقبة (pp-dental.js) — مستقل، على الدوال الحيّة بسياق vm.
   (١) _snapWatchMonths: يقرّب لأقرب خيار 3/6/12 والافتراضي 3;
   (٢) _prevWatchMonths: يختار من السجل (M76) الكتابةَ التي ضبطت الموعد الحالي ويستنتج مدّتها، ويفشل بأمان إلى 3;
   (٣) renderWatchBanner: 🔁 على الشرائح المستحقّة فقط (لا «تحت المراقبة») مع stopPropagation فلا يصل النقر لـendToothWatch (#29) · الوسيط أرقام فقط;
   (٤) renewToothWatch: بوابةُ القراءة/المسودة/التاريخ/الفحص/الدفعة قبل أي await · إلغاءُ الحوار = صفر كتابة ·
       التأكيد ⇒ UPDATE review_at فقط، مقيّد بـstatus='condition' لكل سطح مراقب (لا حالة سريرية COND) · الذاكرة المحلية تُزامَن · إعادةُ الرسم;
   (٥) القراءة: 🔁 مخفية بوضع القراءة ضمن سطر الإخفاء الحرفي (check-mirrors).
   --self-test: 6 طفرات لا بدّ أن تحمّر. */
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
const FN = ['renderWatchBanner', '_snapWatchMonths', '_prevWatchMonths', 'renewToothWatch', 'endToothWatch'];

function load(src, opt) {
  opt = opt || {};
  const writes = [], hist = opt.hist || [];
  const q = (table) => {
    const st = { table, f: {}, payload: null, op: null };
    const b = {
      select() { return b; }, eq(k, v) { st.f[k] = v; return b; }, in(k, v) { st.f[k] = v; return b; },
      neq() { return b; }, not() { return b; }, order() { return b; }, limit() { return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      then(res) {
        if (table === 'teeth_status_history') return res({ data: hist, error: null });
        writes.push({ f: Object.assign({}, st.f), payload: st.payload });
        return res({ error: opt.writeErr || null });
      }
    };
    return b;
  };
  const win = { sb: { from: q }, SyDentSub: { blockReadOnly: () => !!opt.readOnly }, __draftMode: !!opt.draft, __historyMode: !!opt.history,
    __examMode: false, __batchMode: false, _renewWatchInFlight: false, _endWatchInFlight: false };
  const el = { style: {}, innerHTML: '' };
  const ctx = {
    window: win, document: { getElementById: id => (id === 'watchDueBanner' ? el : null) }, console: { error() {}, warn() {} },
    Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, JSON, Infinity,
    teethMap: opt.teethMap || {}, currentUser: { id: 'doc' }, patientId: 'pat', COND_SURFACE: 'COND',
    isConditionKey: k => String(k || '').indexOf('cond-') === 0, isExtracted: () => false,
    getTreatment: k => ({ name: 'مراقبة ' + k }), escapeHtml: s => String(s), fmtDNum: d => String(d),
    toDay: () => opt.today || '2026-10-08', ppYmdLocal: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    showToast: m => { win.__toast = m; }, renderTeeth: () => { win.__rendered = (win.__rendered || 0) + 1; }, renderStats: () => {},
    SyDialog: { confirm: o => { win.__dialog = o; return Promise.resolve(opt.answer !== false); } }
  };
  vm.createContext(ctx);
  vm.runInContext(FN.map(f => slice(src, f)).join('\n') + '\nvar WATCH_MONTH_OPTS = [3, 6, 12];', ctx);
  return { ctx, win, el, writes };
}
const TM = () => ({
  '25': { __status: { O: 'condition', M: 'condition', COND: 'condition' }, __review: { O: '2026-09-01', M: '2026-09-01' }, O: 'watch', M: 'watch', COND: 'cond-caries' },
  '36': { __status: { O: 'condition' }, __review: { O: '2027-01-01' }, O: 'watch' }
});

async function suite(src) {
  /* (١) */
  let L = load(src);
  const snap = L.ctx._snapWatchMonths;
  ok(snap(2.9) === 3 && snap(5.2) === 6 && snap(9.5) === 12 && snap(0) === 3 && snap(NaN) === 3 && snap(40) === 12, 'snap: nearest of 3/6/12, default 3');
  /* (٢) */
  L = load(src, { teethMap: TM(), hist: [
    { surface: 'O', review_at: '2026-12-01', changed_at: '2026-10-01T10:00:00Z' },      /* أحدث لكن ليس الموعد الحالي */
    { surface: 'O', review_at: '2026-09-01', changed_at: '2026-03-02T10:00:00Z' } ] });  /* ضبط الموعد الحالي: ~6 أشهر */
  ok(await L.ctx._prevWatchMonths('25', ['O', 'M']) === 6, 'prev: the write that set the current review_at wins (6 months), not the newest row');
  L = load(src, { teethMap: TM(), hist: [{ surface: 'O', review_at: '2026-12-01', changed_at: '2026-01-05T10:00:00Z' }] });
  ok(await L.ctx._prevWatchMonths('25', ['O']) === 12, 'prev: no matching row → newest dated row (~11 months → سنة)');
  L = load(src, { teethMap: TM(), hist: [] });
  ok(await L.ctx._prevWatchMonths('25', ['O']) === 3, 'prev: empty history → default 3');
  /* (٣) */
  L = load(src, { teethMap: TM() });
  L.ctx.renderWatchBanner();
  const html = L.el.innerHTML;
  const dueBlock = html.split('🔎')[0], soonBlock = html.split('🔎')[1] || '';
  ok(/renewToothWatch\('25'\)/.test(dueBlock) && /wend-r/.test(dueBlock), 'banner: due tooth 25 carries 🔁 (renewToothWatch)');
  ok(!/renewToothWatch/.test(soonBlock) && /endToothWatch\('36'\)/.test(soonBlock), 'banner: upcoming tooth 36 has ✕ only, no 🔁');
  ok(/onclick="event\.stopPropagation\(\);renewToothWatch\('25'\)"/.test(dueBlock), 'banner: 🔁 stops propagation so the chip\'s endToothWatch never fires (#29)');
  ok((dueBlock.match(/renewToothWatch/g) || []).length === 1, 'banner: one 🔁 per tooth even with two watched surfaces');
  /* (٤) */
  L = load(src, { teethMap: TM(), hist: [] });
  await L.ctx.renewToothWatch('25');
  ok(L.writes.length === 2 && L.writes.every(w => w.f.status === 'condition' && w.f.tooth_num === '25' && JSON.stringify(Object.keys(w.payload)) === '["review_at"]'),
     'renew: one UPDATE per watched surface, review_at only, constrained to status=condition');
  ok(L.writes.map(w => w.f.surface).sort().join() === 'M,O', 'renew: COND (clinical condition) surface untouched');
  const d = new Date(); d.setMonth(d.getMonth() + 3);   /* نفس اشتقاق الكود الحيّ — لا تاريخ مثبّت (#671؛ عضّ بعد منتصف الليل) */
  const exp = L.ctx.ppYmdLocal(d);
  ok(L.writes.every(w => w.payload.review_at === exp) && L.ctx.teethMap['25'].__review.O === exp && L.ctx.teethMap['25'].__review.M === exp, 'renew: today + 3 months written and mirrored into teethMap.__review');
  ok(L.win.__rendered === 1 && /🔁/.test(L.win.__toast) && L.win._renewWatchInFlight === false, 'renew: re-rendered, toast, in-flight released');
  ok(/تجديد المراقبة/.test(L.win.__dialog.confirmText) && /3 أشهر/.test(L.win.__dialog.message), 'renew: dialog names the period');
  L = load(src, { teethMap: TM(), answer: false });
  await L.ctx.renewToothWatch('25');
  ok(L.writes.length === 0 && !L.win.__rendered, 'renew: cancel → no write, no re-render');
  for (const g of [['readOnly', true], ['draft', true], ['history', true]]) {
    const o = { teethMap: TM() }; o[g[0]] = g[1];
    L = load(src, o); await L.ctx.renewToothWatch('25');
    ok(L.writes.length === 0 && !L.win.__dialog, 'renew: gate ' + g[0] + ' blocks before any dialog/write');
  }
  L = load(src, { teethMap: TM(), writeErr: { message: 'boom' } });
  await L.ctx.renewToothWatch('25');
  ok(/تعذّر/.test(L.win.__toast) && L.win._renewWatchInFlight === false, 'renew: write error → toast, in-flight released');
  const body = slice(src, 'renewToothWatch');
  const gate = body.indexOf("window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }");
  ok(gate > -1 && body.indexOf('await ') > gate && body.indexOf('.update(') > gate, 'renew: draft gate precedes the first await/write');
  /* (٥) */
  const css = read('patient-profile.css');
  ok(/html\[data-sub-level="read"\] :is\([^\n]*\[onclick\*="renewToothWatch\("\][^\n]*\)\{display:none !important;\}/.test(css), 'css: 🔁 hidden in read-only mode');
  ok(/#watchDueBanner \.wend-r\{/.test(css), 'css: .wend-r styled');
  const cm = read('scripts/check-mirrors.js');
  ok(/'ppFlagToggle', 'renewToothWatch'\]/.test(cm) && /'endToothWatch', 'renewToothWatch', 'openNewSessionEntry'/.test(cm), 'check-mirrors: renewToothWatch classified as write + draft-gated');
}

(async () => {
  const SRC = read('pp-dental.js');
  await suite(SRC);
  const base = { pass, fail };
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['no stopPropagation', s => s.replace("onclick=\"event.stopPropagation();renewToothWatch(", "onclick=\"renewToothWatch(")],
      ['🔁 on upcoming too', s => s.replace("function(d){ return d.when ? fmtDNum(d.when) : 'بلا موعد'; });", "function(d){ return d.when ? fmtDNum(d.when) : 'بلا موعد'; }, true);")],
      ['status filter dropped', s => s.replace(".eq('tooth_num', tn).eq('surface', s).eq('status', 'condition');\n      if (r.error) {\n        console.error('renewToothWatch:'", ".eq('tooth_num', tn).eq('surface', s);\n      if (r.error) {\n        console.error('renewToothWatch:'")],
      ['cache not mirrored', s => s.replace("teethMap[tn].__review[s] = next;", "")],
      ['snap default 6', s => s.replace("if (!(m > 0)) return 3;", "if (!(m > 0)) return 6;")],
      ['gate after await', s => s.replace("  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }\n  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }\n  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }\n  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return; }\n  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {\n    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');\n    return;\n  }\n  var tn = String(num).replace(/[^0-9]/g, '');\n  var st = teethMap[tn] && teethMap[tn].__status;\n  if (!st) return;\n  var surfaces = Object.keys(st).filter(function(s){\n    if (s === COND_SURFACE || isConditionKey(teethMap[tn][s])) return false;\n    return st[s] === 'condition';\n  });\n  if (!surfaces.length) return;\n  if (window._renewWatchInFlight) return;   // حارس الإرسال المزدوج (#66)\n  window._renewWatchInFlight = true;\n  try {\n    var months = await _prevWatchMonths(tn, surfaces);",
        "  var tn = String(num).replace(/[^0-9]/g, '');\n  var st = teethMap[tn] && teethMap[tn].__status;\n  if (!st) return;\n  var surfaces = Object.keys(st).filter(function(s){\n    if (s === COND_SURFACE || isConditionKey(teethMap[tn][s])) return false;\n    return st[s] === 'condition';\n  });\n  if (!surfaces.length) return;\n  if (window._renewWatchInFlight) return;\n  window._renewWatchInFlight = true;\n  try {\n    var months = await _prevWatchMonths(tn, surfaces);\n  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }\n  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }")]
    ];
    let bit = 0;
    for (const [name, m] of muts) {
      const ms = m(SRC);
      if (ms === SRC) { console.log('MUTATION NOT APPLIED:', name); continue; }
      const before = fail; const log = console.log; console.log = () => {};
      try { await suite(ms); } catch (e) { fail++; }
      console.log = log;
      if (fail > before) bit++; else log('MUTATION SURVIVED:', name);
    }
    fail = base.fail; pass = base.pass;
    if (bit !== muts.length) { console.log('prove-watch-renew: self-test ' + bit + '/' + muts.length + ' mutations bit'); process.exit(1); }
    console.log('prove-watch-renew: ' + pass + '/' + (pass + fail) + ' passed · ' + bit + '/' + muts.length + ' mutations bit' + (fail ? ' ✗' : ' ✓'));
  } else console.log('prove-watch-renew: ' + pass + '/' + (pass + fail) + ' passed' + (fail ? ' ✗' : ' ✓'));
  process.exit(fail ? 1 : 0);
})();
