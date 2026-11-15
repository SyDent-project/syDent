#!/usr/bin/env node
/* v732 — مثبتُ «اسحب للتحديث» أمام النوافذ المفتوحة.
   بلاغُ المالك (15/11/2026، صفحة العلاجات على الهاتف): «عم بفتح إضافة علاج عم يسكر المودل لحالو».
   السبب (أُعيد إنتاجه بمتصفحٍ حقيقي بلمسٍ محاكى): نسخةُ «اسحب للتحديث» المضمَّنة بخمس صفحات تبدأ متى كانت الصفحة بأعلاها
   (window.scrollY = 0) بلا نظرٍ لنافذةٍ مفتوحة — والنافذةُ تقفل تمريرَ الصفحة فتبقى بأعلاها — فسحبُ الإصبع نزولاً داخل
   النموذج (تمريرُه للأعلى) يُعيد تحميل الصفحة فتنغلق النافذة. نسخةُ sidebar.js المشتركة كانت محروسة؛ المضمَّنةُ لا.
   هنا يُنفَّذ كلُّ معالجٍ من ملفه على DOM وهمي: سحبٌ بلا نافذة يُحدّث · بنافذةٍ مفتوحة لا · نافذةٌ فُتحت أثناء السحب لا ·
   صفحةٌ ممرَّرة لا. وطفراتٌ متعمَّدة تنزع الحارس من كل ملف (#342). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const PAGES = ['treatments.html', 'settings.html', 'admin.html', 'auth.html', 'landing.html'];
const FILES = PAGES.concat(['sidebar.js', 'scripts/validate.sh']);
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  ✗ ' + name); } }

/* مصدرُ معالج السحب بكل ملف: السكربتُ المضمَّن الذي ينشئ ptrBar، أو جسمُ startPTR بـsidebar.js */
function ptrSource(file, src) {
  if (file === 'sidebar.js') {
    const a = src.indexOf('function startPTR() {'); if (a < 0) return '';
    let depth = 0, i = src.indexOf('{', a);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
    return src.slice(a, i + 1) + '\nstartPTR();';
  }
  const k = src.indexOf("bar.id='ptrBar'"); if (k < 0) return '';
  const a = src.lastIndexOf('<script>', k), b = src.indexOf('</script>', k);
  return (a > -1 && b > a) ? src.slice(a + 8, b) : '';
}

/* DOM وهمي يكفي المعالج: يلتقط مستمعات اللمس، ويجيب عن «هل من نافذةٍ مفتوحة؟» */
function world(code) {
  const handlers = {}, st = { modal: false, lock: false, scrollY: 0, reloads: 0, refresh: 0 };
  const el = () => ({ style: {}, className: '', textContent: '', innerHTML: '', id: '', classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, insertBefore() {}, firstChild: null, parentNode: null });
  const document = {
    readyState: 'complete', head: el(), body: Object.assign(el(), { classList: { add() {}, remove() {}, contains: c => c === 'sy-modal-lock' && st.lock } }),
    createElement: el, getElementById: () => el(),
    querySelector: sel => (/modal-overlay\.open|\.open/.test(sel) && st.modal) ? el() : null,
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); }
  };
  const window = { location: { reload() { st.reloads++; } }, addEventListener() {}, get scrollY() { return st.scrollY; } };
  window.ontouchstart = null;
  const ctx = { window, document, console, setTimeout: fn => { fn(); return 0; }, getComputedStyle: () => ({}) };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const fire = (t, y) => (handlers[t] || []).forEach(fn => fn({ touches: [{ clientY: y }], target: el() }));
  /* سحبٌ نزولاً 320px (يتجاوز العتبة): بدايةٌ · حركات · إفلات — وmid يُنفَّذ بمنتصف السحب */
  const drag = mid => { fire('touchstart', 300); fire('touchmove', 380); if (mid) mid(); fire('touchmove', 520); fire('touchmove', 620); fire('touchend', 620); };
  return { st, drag, has: !!(handlers.touchstart && handlers.touchmove && handlers.touchend) };
}

function suite(F) {
  FILES.filter(f => f !== 'scripts/validate.sh').forEach(file => {
    const code = ptrSource(file, F[file]);
    if (!code) { ok(false, file + ': pull-to-refresh handler not found'); return; }
    let w; try { w = world(code); } catch (e) { ok(false, file + ': the handler runs on the fake DOM → ' + String(e.message).slice(0, 120)); return; }
    ok(w.has, file + ': touch handlers registered');
    w.drag();
    ok(w.st.reloads === 1, file + ': a pull on the page (no window open) refreshes');
    w = world(code); w.st.modal = true; w.drag();
    ok(w.st.reloads === 0, file + ': a drag while a window is open never reloads the page');
    if (file !== 'sidebar.js') {
      w = world(code); w.st.lock = true; w.drag();
      ok(w.st.reloads === 0, file + ': a drag while the modal scroll-lock is on never reloads');
      w = world(code); w.drag(() => { w.st.modal = true; });
      ok(w.st.reloads === 0, file + ': a window opened during the drag cancels the refresh');
    }
    w = world(code); w.st.scrollY = 40; w.drag();
    ok(w.st.reloads === 0, file + ': a scrolled page does not refresh');
    w = world(code); w.st.modal = true; w.drag(); w.st.modal = false; w.drag();
    ok(w.st.reloads === 1, file + ': after the window closes, pull-to-refresh works again');
  });
  /* لا نسخةَ مضمَّنة غير محروسة بأي صفحة أخرى */
  const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
  const loose = pages.filter(f => { const s = F[f] != null ? F[f] : fs.readFileSync(path.join(ROOT, f), 'utf8'); return /location\.reload\(\)/.test(s) && /ptrBar/.test(s) && !/ptrBlocked\(\)/.test(s); });
  ok(loose.length === 0, 'fleet: every inline pull-to-refresh is guarded' + (loose.length ? ' → ' + loose.join(', ') : ''));
  ok(/prove-ptr-modal\.js" --self-test/.test(F['scripts/validate.sh']), 'validate.sh runs this prover');
}

const rep = (file, a, b) => F => { if (F[file].indexOf(a) === -1) throw new Error('mutant anchor missing in ' + file); const o = Object.assign({}, F); o[file] = F[file].split(a).join(b); return o; };
const MUTANTS = [];
PAGES.forEach(f => {
  /* الحرّاسُ الثلاثة (بدء · حركة · إفلات) متراكبةٌ عمداً — نزعُ حارس البدء وحده لا يغيّر سلوكاً، فالطفرةُ هي الكودُ القديم كله */
  MUTANTS.push([f + ': the old unguarded handler', F => rep(f, "if(pull>=THRESHOLD&&!ptrBlocked()){", "if(pull>=THRESHOLD){")(rep(f, "if(window.scrollY>0||ptrBlocked()){active=false;", "if(window.scrollY>0){active=false;")(rep(f, "if(window.scrollY>0||ptrBlocked())return;", "if(window.scrollY>0)return;")(F)))]);
  MUTANTS.push([f + ': a window opened mid-drag still reloads', F => rep(f, "if(pull>=THRESHOLD&&!ptrBlocked()){", "if(pull>=THRESHOLD){")(rep(f, "if(window.scrollY>0||ptrBlocked()){active=false;", "if(window.scrollY>0){active=false;")(F))]);
  MUTANTS.push([f + ': the scroll-lock is not read', rep(f, "||document.body.classList.contains('sy-modal-lock')", "")]);
});
MUTANTS.push(['sidebar.js: touchstart ignores an open window', rep('sidebar.js', "      if (document.querySelector('.modal-overlay.open')) return;\n", "")]);

suite(LIVE);
const basePass = pass, baseFail = fail;
if (process.argv.indexOf('--self-test') !== -1 || process.argv.indexOf('--mutants') !== -1) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    pass = 0; fail = 0;
    const log = console.log; console.log = () => {};
    try { suite(mut(LIVE)); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = basePass; fail = baseFail;
  const allBit = bit === MUTANTS.length;
  console.log((fail === 0 && allBit ? '✅' : '❌') + ' prove-ptr-modal: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && allBit ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-ptr-modal: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
