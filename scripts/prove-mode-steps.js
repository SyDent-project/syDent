/* prove-mode-steps — شريط الخطوات وعدّادات الأسنان والتراجع بوضعَي التحديد المتعدد والفحص الأولي
   (pp-modules.js): الخطوة الحالية تتبع حالة الوضع، «أسنان» تعدّ الأسنان المميّزة لا المواضع،
   و«تراجع» التحديد المتعدد يلغي آخر موضع فقط. يشغَّل الملف الحيّ بـvm مع وثيقة مزيّفة.
   --self-test يشغّل طفرات يجب أن تُكشف كلها. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC0 = fs.readFileSync(path.join(__dirname, '..', 'pp-modules.js'), 'utf8');

function run(src) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  const els = {}, toasts = [];
  const el = id => (els[id] = els[id] || { id, textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: el, querySelectorAll: () => [], querySelector: () => null, body: { classList: { add() {}, remove() {} } } },
    window: {}, console, showToast: m => toasts.push(m), ppGuarded: (n, f) => f,
    isRootCode: s => /^R[123]$/.test(s), buildCompositeCode: a => a.join(''), buildRootComposite: a => a.join(''),
    rootAreaLabelFor: s => s, surfLabelFor: s => s
  };
  try { vm.createContext(ctx); vm.runInContext(src, ctx); } catch (e) { ok(false, 'load: ' + e.message); return out; }
  const R = c => vm.runInContext(c, ctx);
  const now = id => { const m = (els[id] || {}).innerHTML || ''; const li = m.split('</li>'); return li.findIndex(x => /class="now"/.test(x)); };

  R("batchSelectedKey = null; batchSel = []; batchSyncUI();");
  ok(now('batchSteps') === 0, 'batch: no treatment yet ⇒ step 1 is current');
  R("batchSelectedKey = 'x'; batchSyncUI();");
  ok(now('batchSteps') === 1, 'batch: treatment chosen, nothing clicked ⇒ step 2');
  R("batchSel = [{ n: 11, s: 'O' }, { n: 11, s: 'M' }, { n: 21, s: 'WHOLE' }]; batchSyncUI();");
  ok(now('batchSteps') === 2 && /class="done">اختر العلاج/.test(els.batchSteps.innerHTML), 'batch: positions picked ⇒ step 3, earlier steps done');
  ok(els.batchTeethEl.textContent === 2 && els.batchCountEl.textContent === 2, 'batch: two teeth, two merged sessions (11 MO + 21 whole)');
  R('batchUndo();');
  ok(els.batchTeethEl.textContent === 1 && R('batchSel.length') === 2 && /21/.test(toasts[toasts.length - 1]), 'batch undo: drops only the last position (21) and says which');
  R('batchUndo(); batchUndo(); batchUndo();');
  ok(R('batchSel.length') === 0 && toasts[toasts.length - 1] === 'لا شيء للتراجع عنه' && now('batchSteps') === 1, 'batch undo: empty selection ⇒ friendly no-op, back to step 2');

  R("examSelectedKey = null; examTeeth = {}; examCount = 0; renderModeSteps('examSteps', ['a', 'b', 'c'], examSelectedKey ? 2 : 1);");
  ok(now('examSteps') === 1, 'exam: status has a default ⇒ opens on step 2');
  R("examTouch('11', 1); examTouch(11, 1); examTouch('21', 1); examTouch('21', -1); examCount = 2; examSyncCount();");
  ok(els.examTeethEl.textContent === 1 && els.examCountEl.textContent === 2, 'exam: two marks on one tooth = 1 tooth; a tooth fully undone drops out');
  return out;
}

const MUTANTS = [
  ['steps ignore the selection', "!batchSelectedKey ? 0 : (batchSel.length ? 2 : 1)", "!batchSelectedKey ? 0 : 1"],
  ['teeth counted per position', "_bTeeth[batchSel[t2].n] = true", "_bTeeth[t2] = true"],
  ['undo clears everything', "var last = batchSel.pop();", "var last = batchSel[batchSel.length - 1]; batchSel = [];"],
  ['exam undone tooth kept', "if (examTeeth[k] <= 0) delete examTeeth[k];", ""]
];
const self = process.argv.includes('--self-test');
const base = run(SRC0);
let pass = 0, fail = 0;
base.forEach(([c, m]) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } });
let bit = 0;
if (self) MUTANTS.forEach(([name, a, b]) => {
  const src = SRC0.replace(a, b);
  if (src === SRC0) { console.log('MUTANT DID NOT APPLY: ' + name); return; }
  if (run(src).some(([c]) => !c)) bit++; else console.log('MUTANT SURVIVED: ' + name);
});
const good = fail === 0 && (!self || bit === MUTANTS.length);
console.log((good ? '✅' : '❌') + ' prove-mode-steps: ' + pass + '/' + (pass + fail) + (self ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
process.exit(good ? 0 : 1);
