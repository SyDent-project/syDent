/* v557 — مثبتُ أداء صفحتي المرضى والمحاسبة (DeepCode #1 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   (١) المرضى: دفاترُ الأرصدة الأربعة (بنطاق الطبيب، مصفّحة، الأعمدةُ نفسُها) والأعلامُ تُطلَق مع القائمة؛ المتابعةُ والالتزام
       مع القائمة ويُطبَّقان بعدها بالترتيب نفسه.
   (٢) **تكافؤٌ مالي** بـvm على loadFinancials الحيّة: الصفوفُ المبكرة ≡ مسارُ `.in(ids)` (خريطةُ الأرصدة وآخرُ زيارة) —
       بصفوفٍ لمرضى خارج القائمة · جلسةٍ مخطّطة · توزيعٍ عليها · رسمِ عدم حضور · خصمٍ واسترداد · عملتين.
   (٣) المحاسبة: قراءاتُ الإعدادات الثلاث (منفصلةٌ عمداً) والخطة تُطلَق مع البيانات المرجعية وتُستهلك بكتلها بالترتيب.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const base = { 'patients.html': read('patients.html'), 'accounting.html': read('accounting.html') };
async function suite(F) {
  const P = F['patients.html'], A = F['accounting.html'];
  /* (١) */
  const LP = fnSrc(P, 'async function loadPatients(');
  const iList = LP.indexOf("await window.SyDentFetchAll(function(){ return window.sb\n    .from('patients')");
  ok(LP.indexOf('const _finPre = _ptSettle(_ptFinPrefetch(currentUser.id));') > -1 && LP.indexOf('const _finPre') < iList && LP.indexOf('const _flagsP') < iList, 'patients: ledgers and flags start before the list is awaited');
  ok(/PATIENT_FLAG_DEFS = _ptTake\(await _flagsP\);/.test(LP) && /await loadFinancials\(_finPre\.then\(_ptTake\)\);\s*\n\s*render\(\);/.test(LP), 'patients: consumed at the original spots, then render');
  const FP = fnSrc(P, 'function _ptFinPrefetch(');
  const LF = fnSrc(P, 'async function loadFinancials(');
  const colsIn = (LF.match(/from\('[a-z_]+'\)\.select\('[^']+'\)/g) || []), colsPf = (FP.match(/from\('[a-z_]+'\)\.select\('[^']+'\)/g) || []);
  ok(colsIn.length === 4 && JSON.stringify(colsIn) === JSON.stringify(colsPf) && (FP.match(/window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('[a-z_]+'\)\.select\('[^']+'\)\.eq\('doctor_id', uid\); \}\)/g) || []).length === 4, 'patients prefetch: same tables/columns verbatim, doctor-scoped and paged');
  const INIT = P.slice(P.indexOf('(async function init() {'), P.indexOf('// Apply URL filter param'));
  const iPrm = INIT.indexOf('const _prmP = (async function () { try { await loadPrmMeta(); }'), iRel = INIT.indexOf('const _relP = _ptSettle('), iLoad = INIT.indexOf('await loadPatients();');
  ok(iPrm > -1 && iRel > iPrm && iLoad > iRel && INIT.indexOf('await _prmP;') > iLoad && INIT.indexOf('prmReliab = _ptTake(await _relP);') > INIT.indexOf('await _prmP;'), 'patients init: follow-up + reliability start with the list, applied after it in the original order');
  /* (٢) */
  const DATA = {
    ledger_sessions: [{ id: 's1', patient_id: 'A', cost: 100, status: 'completed', date: '2026-09-01', description: 'حشوة', currency: 'SYP' },
      { id: 's2', patient_id: 'A', cost: 40, status: 'planned', date: '2026-09-20', description: 'تاج', currency: 'SYP' },
      { id: 's3', patient_id: 'A', cost: 5, status: 'completed', date: '2026-09-25', description: 'رسم عدم الحضور', currency: 'SYP' },
      { id: 's4', patient_id: 'B', cost: 30, status: 'completed', date: '2026-08-10', description: 'x', currency: 'USD' },
      { id: 's5', patient_id: 'Z', cost: 999, status: 'completed', date: '2026-09-29', description: 'y', currency: 'SYP' }],
    ledger_payments: [{ patient_id: 'A', amount: 80, currency: 'SYP' }, { patient_id: 'B', amount: 35, currency: 'USD' }, { patient_id: 'Z', amount: 1, currency: 'SYP' }],
    payment_splits: [{ patient_id: 'A', session_id: 's1', amount: 50, is_unearned: false, currency: 'SYP' }, { patient_id: 'A', session_id: 's2', amount: 30, is_unearned: false, currency: 'SYP' }, { patient_id: 'Z', session_id: 's5', amount: 1, is_unearned: false, currency: 'SYP' }],
    account_adjustments: [{ patient_id: 'A', kind: 'discount', amount: 10, currency: 'SYP' }, { patient_id: 'B', kind: 'refund', amount: 5, currency: 'USD' }]
  };
  const q = t => { const o = { in(c, v) { o.ids = v; return o; }, eq() { return o; }, select() { return o; },
    then(a, b) { return Promise.resolve({ data: DATA[t].filter(r => !o.ids || o.ids.indexOf(r.patient_id) > -1), error: null }).then(a, b); } }; return o; };
  async function runLF(pre) {
    const ctx = { console: { warn() {} }, Number, parseFloat, Math, Object, Promise, String, patients: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], finMap: null, lastVisitMap: null, window: { sb: { from: q } } };
    vm.createContext(ctx); vm.runInContext(LF + '\nthis.__f = loadFinancials;', ctx);
    await ctx.__f(pre); return JSON.stringify({ f: ctx.finMap, v: ctx.lastVisitMap });
  }
  const viaIn = await runLF(undefined);
  const viaPre = await runLF(Promise.resolve(['ledger_sessions', 'ledger_payments', 'payment_splits', 'account_adjustments'].map(t => ({ data: DATA[t], error: null }))));
  ok(viaIn === viaPre, 'financial equivalence: early doctor-wide rows ⇒ identical balances and last visits as the .in(ids) path');
  const J = JSON.parse(viaPre);
  ok(J.v.A === '2026-09-01' && !J.f.Z && !J.v.Z && J.f.A.bags.SYP.unearned === 30, 'sanity: no-show fee is not a visit · outsiders ignored · planned-session split is credit');
  /* (٣) */
  const AI = A.slice(A.indexOf("    // Load reference data (doctors + categories + employees) once.") - 1200, A.indexOf("    // Default range: current month"));
  const iRef = AI.indexOf('    await Promise.all([\n      loadDoctors(),');
  ok(['var _csAP = _accS(', 'var _csGP = _accS(', 'var _csRP = _accS(', 'var _planP = _accS('].every(k => { const i = AI.indexOf(k); return i > -1 && i < iRef; }), 'accounting: the three settings reads and the plan start with the reference data');
  const uses = ['var csA = _accT(await _csAP);', 'var csG = _accT(await _csGP);', 'var csR = _accT(await _csRP);', '_accT(await _planP);'].map(u => AI.indexOf(u));
  ok(uses.every(p => p > iRef) && uses.every((p, i) => i === 0 || p > uses[i - 1]), 'accounting: consumed in their original blocks, in order');
  ok([/\.select\('ai_features_enabled'\)/g, /\.select\('production_goal_syp, production_goal_usd'\)/g, /\.select\('usd_report_rate, report_unify_currency'\)/g].every(re => (AI.match(re) || []).length === 1) && /csR = await window\.sb\.from\('clinic_settings'\)\s*\.select\('usd_report_rate'\)/.test(AI), 'accounting: still three separate calls (a missing column fails only its own) + the legacy-rate retry');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['patients ledgers fetched late', rep('patients.html', 'await loadFinancials(_finPre.then(_ptTake));', 'await loadFinancials();')],
  ['prefetch keeps outsiders', rep('patients.html', "    const b0 = finMap[s.patient_id]; if (!b0) return;\n    const b = b0.bags[rc(s)];\n    if (st === 'planned')", "    const b0 = finMap[s.patient_id] || finMap[Object.keys(finMap)[0]];\n    const b = b0.bags[rc(s)];\n    if (st === 'planned')")],
  ['prefetch column drift', rep('patients.html', "window.SyDentFetchAll(function(){ return window.sb.from('ledger_sessions').select('id,patient_id,cost,status,date,description,currency').eq('doctor_id', uid); })", "window.SyDentFetchAll(function(){ return window.sb.from('ledger_sessions').select('id,patient_id,cost,status,currency').eq('doctor_id', uid); })")],
  ['reliability after the follow-up', rep('patients.html', "  const _relP = _ptSettle(window.SyDentReliability ? window.SyDentReliability.load(currentUser.id) : null);\n  await loadPatients();", "  await loadPatients();\n  const _relP = _ptSettle(window.SyDentReliability ? window.SyDentReliability.load(currentUser.id) : null);")],
  ['accounting settings awaited serially', rep('accounting.html', "      var csG = _accT(await _csGP);   /* v557 */", "      var csG = await window.sb.from('clinic_settings').select('production_goal_syp, production_goal_usd').eq('owner_id', currentUser.id).maybeSingle();")],
  ['accounting settings merged into one call', rep('accounting.html', ".select('production_goal_syp, production_goal_usd').eq('owner_id', currentUser.id).maybeSingle());", ".select('ai_features_enabled').eq('owner_id', currentUser.id).maybeSingle());")]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-perf-lists: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-perf-lists: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
