/* v548 — مثبتُ جولة «قصّ 1000 صفّ» بكل المنصة (window.SyDentFetchAll) — مستقل، على الملفات الحيّة.
   (١) الجالبُ المشترك: يبني الاستعلامَ من جديد لكل صفحة · order('id') كاسرُ تعادل · يجمع 2345 بثلاث صفحات · يقف عند الناقصة ·
       الخطأُ يُرجَع بالشكل { data:null, error } لا يُبتلع;
   (٢) جردٌ آلي: كلُّ قراءة select على جدولٍ جماعي (مرضى · مواعيد · جلسات · دفعات · توزيعات · ذمم…) بلا range/limit/single/head
       ولا قيدِ صفٍّ/مريض ولا .in() — يجب أن تمرّ بجالبٍ مصفّح، أو تكون بقائمة الاستثناء المسبَّبة (نافذةُ يومٍ واحد · مريضٌ واحد ·
       مصفّحةٌ يدوياً). أيُّ قراءةٍ جماعية جديدة غيرِ مصفّحة تحمّر البوابة (#699);
   (٣) المواضعُ الحرجة بالاسم (قائمةُ المرضى · كلُّ المواعيد · تسلسلُ رقم المريض · عدّادُ اللوحة · فحصُ الدفعات اليتيمة…). --self-test: طفرات. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const BULK = ['patients', 'appointments', 'ledger_sessions', 'ledger_payments', 'payment_splits', 'provider_payouts', 'expenses', 'lab_orders',
  'lab_payments', 'reminder_logs', 'teeth_status', 'audit_log', 'account_adjustments', 'patient_documents', 'inventory_movements', 'patient_recalls', 'payment_plans'];
/* الاستثناءات المسبَّبة: ملف · جدول · بصمةُ الفلاتر */
const ALLOW = [
  ['acc-daysheet.js', 'ledger_sessions', 'eq:doctor_id eq:status eq:date', 'يومٌ واحد'], ['acc-daysheet.js', 'ledger_payments', 'eq:doctor_id eq:date', 'يومٌ واحد'],
  ['acc-daysheet.js', 'account_adjustments', 'eq:doctor_id eq:date', 'يومٌ واحد'], ['acc-daysheet.js', 'expenses', 'eq:owner_id eq:date', 'يومٌ واحد'],
  ['acc-daysheet.js', 'lab_payments', 'eq:doctor_id eq:pay_date', 'يومٌ واحد'], ['acc-daysheet.js', 'provider_payouts', 'eq:owner_id gte:paid_at lte:paid_at', 'يومٌ واحد'],
  ['appt-conflict.js', 'appointments', 'eq:doctor_id eq:date', 'يومٌ واحد'], ['appt-family.js', 'appointments', 'eq:doctor_id eq:date', 'يومٌ واحد'],
  ['audit-log.html', 'audit_log', 'eq:owner_id eq:is_archived', 'مصفّحٌ يدوياً بـq.range بعد الفلاتر'],
  ['dash-goal.js', 'ledger_payments', 'eq:doctor_id eq:date', 'يومٌ واحد'], ['dash-yesterday.js', 'appointments', 'eq:doctor_id eq:date', 'يومٌ واحد'],
  ['index.html', 'appointments', 'eq:doctor_id eq:date', 'يومٌ واحد'], ['index.html', 'ledger_payments', 'eq:doctor_id eq:date', 'يومٌ واحد'],
  ['index.html', 'appointments', 'eq:doctor_id eq:date not:arrived_at', 'يومٌ واحد'],
  ['patient-profile.html', 'appointments', '', 'مريضٌ واحد (eq patient_id بعد تعليق)'], ['patient-profile.html', 'appointments', 'eq:doctor_id eq:provider_id eq:date neq:id not:status', 'يومٌ واحد'],
  ['patients.html', 'patient_recalls', 'eq:owner_id gte:recalled_at', '120 يوماً من الاستدعاءات'], ['patients.html', 'payment_plans', 'eq:doctor_id eq:status', 'الخطط النشطة'],
  ['pp-timeline.js', 'appointments', '', 'مريضٌ واحد (eq patient_id بعد تعليق)'], ['pt-reliability.js', 'appointments', 'eq:doctor_id gte:date lte:date', 'داخل بنّاءٍ يمرّ بـfetchAll'],
  ['sidebar.js', 'appointments', 'eq:doctor_id eq:date', 'يومٌ واحد']
];
function scan(F) {
  const out = [];
  Object.keys(F).filter(f => /\.(html|js)$/.test(f)).forEach(f => {
    const s = F[f], re = /\.from\('([a-z_]+)'\)((?:\s*\.[a-zA-Z]+\((?:[^()]|\([^()]*\))*\))*)/g; let m;
    while ((m = re.exec(s))) {
      const t = m[1], chain = m[2];
      if (!BULK.includes(t) || !/\.select\(/.test(chain) || /\.(insert|update|upsert|delete)\(/.test(chain)) continue;
      if (/\.(range|limit|maybeSingle|single)\(/.test(chain) || /head:\s*true/.test(chain)) continue;
      if (/\.eq\('(id|patient_id|lab_order_id|appointment_id|session_id|payment_id|family_id|series_id|exam_id|prescription_id)'/.test(chain) || /\.in\('/.test(chain)) continue;
      const pre = s.slice(Math.max(0, m.index - 120), m.index);
      if (/(SyDentFetchAll|_fetchAll\w*|_pagedAcc)\(function\s*\(\)\s*\{[^}]*$/.test(pre)) continue;
      const flt = []; const fr = /\.(eq|gte|lte|gt|lt|neq|not)\('([a-z_.]+)'/g; let q; while ((q = fr.exec(chain))) flt.push(q[1] + ':' + q[2]);
      out.push([f, t, flt.join(' ')]);
    }
  });
  return out;
}
async function suite(F) {
  const I = F['supabase-init.js'];
  const a = I.indexOf('  window.SyDentFetchAll = async function (build) {'), b = I.indexOf('\n  };\n', a);
  ok(a > -1, 'shared fetcher exported from supabase-init.js');
  const c = { Promise, window: {} }; vm.createContext(c);
  vm.runInContext('var window = this.window;\n' + I.slice(a, b + 5), c);
  const FA = c.window.SyDentFetchAll;
  const mk = (total, failAt) => { let builds = 0; const calls = []; const build = () => { builds++; const q = { o: [] }; q.order = k => { q.o.push(k); return q; };
    q.range = (x, y) => { calls.push([x, y, q.o.slice()]); if (failAt !== undefined && x >= failAt) return Promise.resolve({ data: null, error: { message: 'x' } });
      const r = []; for (let i = x; i <= Math.min(y, total - 1); i++) r.push({ id: i }); return Promise.resolve({ data: r, error: null }); }; return q; };
    return { build, calls, n: () => builds }; };
  let t = mk(2345), r = await FA(t.build);
  ok(r.error === null && r.data.length === 2345 && t.calls.length === 3 && t.n() === 3 && t.calls.every(x => x[2].length === 1 && x[2][0] === 'id'), 'fetcher: 2345 rows, 3 pages, a fresh query per page, id as the only added order');
  t = mk(1000); r = await FA(t.build);
  ok(r.data.length === 1000 && t.calls.length === 2, 'fetcher: exactly 1000 checks one more page');
  t = mk(2345, 1000); r = await FA(t.build);
  ok(r.data === null && r.error && r.error.message === 'x', 'fetcher: a failing page returns the error (callers\' branches unchanged)');

  const res = scan(F), bad = res.filter(x => !ALLOW.some(al => al[0] === x[0] && al[1] === x[1] && al[2] === x[2]));
  ok(!bad.length, 'inventory: no unpaged bulk read outside the reasoned allow-list' + (bad.length ? ' — ' + bad.map(x => x.join(' | ')).join(' ; ') : ''));
  const stale = ALLOW.filter(al => !res.some(x => al[0] === x[0] && al[1] === x[1] && al[2] === x[2]));
  ok(!stale.length, 'allow-list has no stale entries' + (stale.length ? ' — ' + stale.map(x => x.slice(0, 3).join(' | ')).join(' ; ') : ''));

  const has = (f, re, m) => ok(re.test(F[f]), m);
  has('patients.html', /await window\.SyDentFetchAll\(function\(\)\{ return window\.sb\s*\.from\('patients'\)\s*\.select\('\*'\)/, 'patients list paged');
  has('appointments.html', /await window\.SyDentFetchAll\(function\(\)\{ return window\.sb\s*\.from\('appointments'\)\s*\.select\('\*'\)/, 'all appointments paged (calendar)');
  has('appt-booking.js', /window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('patients'\)\.select\('local_id'\)/, 'local_id sequence reads every patient (no duplicate numbers past 1000)');
  has('patient-profile.html', /window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('patients'\)\.select\('id,created_at'\)/, 'patient number sequence reads every patient');
  has('index.html', /window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('patients'\)\.select\('\*'\)\.eq\('doctor_id', uid\)/, 'dashboard patient count paged');
  has('settings.html', /window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('payment_splits'\)/, 'orphan-payments scan reads every split (no false «orphans» ⇒ no duplicate backfill)');
  has('labs.html', /window\.SyDentFetchAll\(function\(\)\{ return window\.sb\.from\('lab_orders'\)/, 'labs page reads every order');
  has('pt-reliability.js', /var fetchAll = window\.SyDentFetchAll \|\| function \(b\) \{ return b\(\); \};/, 'reliability paged, patients in chunks of 150');
}
const FILES = require('fs').readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && f !== 'sw.js');
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, x, y) => F => Object.assign({}, F, { [f]: F[f].replace(x, y) });
const MUTANTS = [
  ['fetcher stops after one page', rep('supabase-init.js', "      if (rows.length < PAGE) break;\n      off += PAGE;\n    }\n    return { data: out, error: null };", "      break;\n    }\n    return { data: out, error: null };")],
  ['fetcher reuses one builder', rep('supabase-init.js', "    var PAGE = 1000, out = [], off = 0;\n    for (;;) {\n      var res = await build().order('id')", "    var PAGE = 1000, out = [], off = 0, qb = build();\n    for (;;) {\n      var res = await qb.order('id')")],
  ['patients list unpaged again', F => Object.assign({}, F, { 'patients.html': F['patients.html'].replace(/await window\.SyDentFetchAll\(function\(\)\{ return (window\.sb\s*\.from\('patients'\)\s*\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: true \}\)); \}\)/, 'await $1') })],
  ['a new unpaged bulk read', rep('expenses.html', "async function loadExpenses() {", "async function loadExpenses() {\n  var _x = await window.sb.from('expenses').select('id').eq('owner_id', currentUser.id);")]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-fetchall: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-fetchall: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
