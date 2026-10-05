/* v554 — مثبتُ أداء لوحة التحكم (DeepCode #1 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   (١) loadDashboard: القراءاتُ المستقلة السبع (المرضى · محفظةُ المرضى · مواعيدُ اليوم · الكراسي · إيرادُ اليوم · تعريفاتُ الأعلام ·
       غرفةُ الانتظار بعد الكراسي) تُطلَق قبل أول انتظار، وتُستهلك بمواضعها الأصلية (_dashTake(await …)) فترتيبُ الرسم كما كان.
   (٢) **التكافؤُ المالي** (بـvm على computeDashFinancials الحيّة): المسارُ المبكر (`pre` — كلُّ صفوف الطبيب مصفّحة) يعطي
       الخريطةَ نفسها حرفياً كمسار `.in(ids)` — بصفوفٍ لمرضى خارج القائمة وتوزيعٍ على جلسةٍ مخطّطة وخصمٍ واسترداد وعملتين؛
       ورفضُ `pre` ⇒ ok:false كما كان فشلُ الجلب.
   (٣) _dashFinPrefetch: الأعمدةُ نفسُها حرفياً ومصفّحٌ بنطاق الطبيب؛ بطاقةُ المخابر تطلق استعلاميها معاً؛
       الإعداداتُ ومؤشّرُ الالتزام معاً؛ البطاقاتُ الثانوية قبل الهدل.
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
const base = { 'index.html': read('index.html') };

async function suite(F) {
  const H = F['index.html'];
  const LD = fnSrc(H, 'async function loadDashboard(');
  /* ── (١) ── */
  const iFirstData = LD.indexOf('_dashTake(await _pfPatients)');
  const PF = ['_pfPatients', '_pfFin', '_pfAppts', '_pfOps', '_pfPays', '_pfFlags', '_pfWait'];
  ok(PF.every(n => { const i = LD.indexOf('const ' + n + ' = _dashSettle('); return i > -1 && i < iFirstData; }), 'seven independent reads start before the first data await');
  ok(/const _pfWait = _dashSettle\(_pfOps\.then\(function \(\) \{ return loadWaitingRoom\(uid\); \}\)\);/.test(LD), 'waiting room starts right after the chair cache (its chips)');
  const uses = ['const { data: patients } = _dashTake(await _pfPatients);', 'const { data: appts } = _dashTake(await _pfAppts);', '_dashFlagDefs = _dashTake(await _pfFlags);',
    '_dashTake(await _pfOps);', 'const { data: pays } = _dashTake(await _pfPays);', '_dashTake(await _pfLabs);', '_dashTake(await _pfWait);'];
  const pos = uses.map(u => LD.indexOf(u));
  ok(pos.every(p => p > -1) && pos.every((p, i) => i === 0 || p > pos[i - 1]), 'consumed at their original spots, in the original order');
  ok(!/await window\.sb\.from\('(patients|appointments|ledger_payments)'\)/.test(LD) && !/await loadDashOperatoriesCache\(|await loadLabOrdersCard\(|await loadWaitingRoom\(/.test(LD), 'no read is fetched late any more');
  ok(/const _pfLabs = _dashSettle\(loadLabOrdersCard\(uid, list\)\);/.test(LD) && LD.indexOf('const _pfLabs') < LD.indexOf('await computeDashFinancials('), 'lab card starts as soon as the patient list arrives');
  ok(/const dashFin = await computeDashFinancials\(uid, list\.map\(p => p\.id\), _pfFin\.then\(_dashTake\)\);/.test(LD), 'dashboard financials consume the early ledger reads');
  const iW = LD.indexOf('var _waP = loadDashWaState(uid);'), iR = LD.indexOf('var _relP = (async function () {'), iAw = LD.indexOf('  await _waP;\n  await _relP;');
  ok(iW > LD.indexOf('_dashApptsToday = apptsToday;') && iR > iW && iAw > iR, 'settings + reliability run together after today\'s appointments are cached');
  const iY = LD.indexOf('window.SyDentYesterday.load('), iG = LD.indexOf('window.SyDentGoal.load('), iGp = LD.indexOf('window.SyDentGaps.load('), iH = LD.indexOf('_dashHuddle = await window.SyDentHuddle.load');
  ok([iY, iG, iGp].every(i => i > iAw && i < iH), 'the three secondary cards start before the huddle (independent of it)');
  /* ── (٣) ── */
  const FP = fnSrc(H, 'function _dashFinPrefetch(');
  const CF = fnSrc(H, 'async function computeDashFinancials(');
  const colsIn = (CF.match(/from\('[a-z_]+'\)\.select\('[^']+'\)/g) || []);
  const colsPf = (FP.match(/from\('[a-z_]+'\)\.select\('[^']+'\)/g) || []);
  ok(colsIn.length === 4 && JSON.stringify(colsIn) === JSON.stringify(colsPf), 'prefetch: same four tables and columns verbatim as the .in() path');
  ok((FP.match(/window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('[a-z_]+'\)\.select\('[^']+'\)\.eq\('doctor_id', uid\); \}\)/g) || []).length === 4 && !/\.in\(/.test(FP), 'prefetch: paged (no 1000-row cut, no giant GET), doctor-scoped');
  const LC = fnSrc(H, 'async function loadLabOrdersCard(');
  ok(LC.indexOf('const _ovdP = _dashSettle(') > -1 && LC.indexOf('const _ovdP = _dashSettle(') < LC.indexOf("const { data, error } = await window.sb.from('lab_orders')") && /const \{ data: ovd \} = _dashTake\(await _ovdP\);/.test(LC), 'lab card: overdue count fired together with the top-5 read');
  /* ── (٢) التكافؤ المالي ── */
  const code = fnSrc(H, 'async function computeDashFinancials(');
  const DATA = {
    ledger_sessions: [{ id: 's1', patient_id: 'A', cost: 100, status: 'completed', currency: 'SYP' }, { id: 's2', patient_id: 'A', cost: 50, status: 'planned', currency: 'SYP' },
      { id: 's3', patient_id: 'B', cost: 20, status: 'completed', currency: 'USD' }, { id: 's4', patient_id: 'Z', cost: 999, status: 'completed', currency: 'SYP' }, { id: 's5', patient_id: 'B', cost: 70, status: null, currency: 'SYP' }],
    ledger_payments: [{ patient_id: 'A', amount: 90, currency: 'SYP' }, { patient_id: 'B', amount: 25, currency: 'USD' }, { patient_id: 'Z', amount: 5, currency: 'SYP' }],
    payment_splits: [{ patient_id: 'A', session_id: 's1', amount: 60, is_unearned: false, currency: 'SYP' }, { patient_id: 'A', session_id: 's2', amount: 30, is_unearned: false, currency: 'SYP' },
      { patient_id: 'B', session_id: 's3', amount: 20, is_unearned: false, currency: 'USD' }, { patient_id: 'B', session_id: null, amount: 5, is_unearned: true, currency: 'USD' }, { patient_id: 'Z', session_id: 's4', amount: 5, is_unearned: false, currency: 'SYP' }],
    account_adjustments: [{ patient_id: 'A', kind: 'discount', amount: 10, currency: 'SYP' }, { patient_id: 'B', kind: 'refund', amount: 3, currency: 'USD' }, { patient_id: 'Z', kind: 'write_off', amount: 100, currency: 'SYP' }]
  };
  const ids = ['A', 'B', 'C'];
  const q = (t, filterIds) => { const o = { in(c, v) { o.ids = v; return o; }, eq() { return o; }, select() { return o; },
    then(a, b) { const rows = DATA[t].filter(r => !o.ids || o.ids.indexOf(r.patient_id) > -1); return Promise.resolve({ data: rows, error: null }).then(a, b); } }; return o; };
  const ctx = { console: { warn() {} }, Number, parseFloat, Math, Object, Promise, window: { sb: { from: t => q(t) } } };
  vm.createContext(ctx); vm.runInContext(code + '\nthis.__c = computeDashFinancials;', ctx);
  const viaIn = await ctx.__c('u', ids);
  const pre = Promise.resolve(['ledger_sessions', 'ledger_payments', 'payment_splits', 'account_adjustments'].map(t => ({ data: DATA[t], error: null })));
  const viaPre = await ctx.__c('u', ids, pre);
  ok(viaIn.ok && viaPre.ok && JSON.stringify(viaIn) === JSON.stringify(viaPre), 'financial equivalence: early doctor-wide rows ⇒ the exact same per-patient map as the .in(ids) path');
  ok(viaPre.map.A.bags.SYP.trueBalance === 30 && viaPre.map.A.bags.SYP.unearned === 30 && viaPre.map.B.dual === true && !viaPre.map.Z, 'sanity: planned-session split is unearned · discount · two currencies · outsiders ignored');
  const bad = await ctx.__c('u', ids, Promise.reject(new Error('net')));
  ok(bad.ok === false, 'a failed early read degrades exactly like a failed fetch (ok:false ⇒ stored-status fallback)');
  const coreErr = await ctx.__c('u', ids, Promise.resolve([{ data: null, error: { message: 'x' } }, { data: [], error: null }, null, null]));
  ok(coreErr.ok === false, 'core ledger error in the early reads ⇒ fallback, as before');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['patients fetched late again', rep('index.html', "  const { data: patients } = _dashTake(await _pfPatients);", "  const { data: patients } = await window.SyDentFetchAll(function(){ return window.sb.from('patients').select('*').eq('doctor_id', uid); });")],
  ['financials ignore the early reads', rep('index.html', 'list.map(p => p.id), _pfFin.then(_dashTake));', 'list.map(p => p.id));')],
  ['early path skips outsiders filter', rep('index.html', "    const b0 = map[s.patient_id]; if (!b0) return;\n    const b = b0.bags[rc(s)];\n    b.sessCount++;", "    const b0 = map[s.patient_id] || (map[s.patient_id] = Object.assign(mkDashBag(), { bags: { SYP: mkDashBag(), USD: mkDashBag() }, dual: false, cur: 'SYP' }));\n    const b = b0.bags[rc(s)];\n    b.sessCount++;")],
  ['prefetch unpaged', rep('index.html', "    window.SyDentFetchAll(function(){ return window.sb.from('payment_splits')", "    (function(){ return window.sb.from('payment_splits')")],
  ['prefetch column drift', rep('index.html', "window.SyDentFetchAll(function(){ return window.sb.from('account_adjustments').select('patient_id,kind,amount,currency')", "window.SyDentFetchAll(function(){ return window.sb.from('account_adjustments').select('patient_id,amount,currency')")],
  ['waiting room back to the end', rep('index.html', "  const _pfWait = _dashSettle(_pfOps.then(function () { return loadWaitingRoom(uid); }));", "  const _pfWait = null;")],
  ['settings awaited alone', rep('index.html', '  var _waP = loadDashWaState(uid);', '  var _waP = await loadDashWaState(uid);')],
  ['secondary cards after the huddle', F0 => { const F = Object.assign({}, F0); const H = F['index.html'];
    const a = H.indexOf('  /* v554: البطاقاتُ الثانوية الثلاث'), b = H.indexOf("  _dashHuddle = {}; _dashFlagDefs = null;"); const blk = H.slice(a, b);
    const h2 = H.slice(0, a) + H.slice(b); const k = h2.indexOf('  if (window.__sydentBlocked) return;\n  _dashUid = uid;'); F['index.html'] = h2.slice(0, k) + blk + h2.slice(k); return F; }],
  ['lab overdue sequential', rep('index.html', '    const { data: ovd } = _dashTake(await _ovdP);', "    const { data: ovd } = await window.sb.from('lab_orders').select('id').eq('doctor_id', uid);")],
  ['early failure not degraded', rep('index.html', '    if (pre) [sRes, pRes, spRes, aRes] = await pre;', '    if (pre) try { [sRes, pRes, spRes, aRes] = await pre; } catch (e2) { [sRes, pRes, spRes, aRes] = [{ data: [] }, { data: [] }, null, null]; }')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-perf-dashboard: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-perf-dashboard: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
