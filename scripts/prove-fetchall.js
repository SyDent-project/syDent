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
  ['patients.html', 'payment_plans', 'eq:doctor_id eq:status', 'الخطط النشطة'],
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
  const a = I.indexOf('  window.SyDentFetchAll = async function (build, orderKeys) {'), b = I.indexOf('\n  };\n', a);
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
  ok(JSON.stringify(t.calls.map(x => [x[0], x[1]])) === '[[0,999],[1000,1999],[2000,2999]]' && r.data.every((x, i) => x.id === i), 'fetcher: the same page requests as before (same offsets ⇒ same offline cache keys), rows in order');
  t = mk(1000); r = await FA(t.build);
  ok(r.data.length === 1000 && t.calls.length === 3 && t.calls[1][0] === 1000, 'fetcher: exactly 1000 still checks beyond the first page');
  t = mk(2345, 1000); r = await FA(t.build);
  ok(r.data === null && r.error && r.error.message === 'x', 'fetcher: a failing page returns the error (callers\' branches unchanged)');
  t = mk(700); r = await FA(t.build);
  ok(r.data.length === 700 && t.calls.length === 1, 'fetcher: a table under one page costs exactly one request, as before');
  /* v804 — الأمواجُ المتوازية */
  const mk2 = (total, o) => { o = o || {}; const calls = [], gates = []; let live = 0, peak = 0;
    const build = () => { const q = { o: [] }; q.order = k => { q.o.push(k); return q; };
      q.range = (x, y) => { calls.push(x / 1000); live++; peak = Math.max(peak, live);
        const answer = () => { live--; if (o.throwAt === x) throw new Error('boom');
          if (o.failAt === x) return { data: null, error: { message: 'page-error' } };
          const rr = []; for (let i = x; i <= Math.min(y, total - 1); i++) rr.push({ id: i }); return { data: rr, error: null }; };
        return new Promise((res, rej) => gates.push({ x, go: () => { try { res(answer()); } catch (e) { rej(e); } } })); }; return q; };
    const drain = async order => { for (let guard = 0; guard < 200; guard++) { await new Promise(z => setImmediate(z)); if (!gates.length) { await new Promise(z => setImmediate(z)); if (!gates.length) return; }
        const batch = gates.splice(0); (order === 'reverse' ? batch.reverse() : batch).forEach(g2 => g2.go()); } };
    return { build, calls, gates, drain, peak: () => peak }; };
  let u = mk2(31500); let pr = FA(u.build); await new Promise(z => setImmediate(z));
  ok(u.calls.length === 1 && u.calls[0] === 0, 'waves: the first page goes alone');
  u.gates.splice(0).forEach(g2 => g2.go()); await new Promise(z => setImmediate(z)); await new Promise(z => setImmediate(z));
  ok(JSON.stringify(u.calls) === '[0,1,2]', 'waves: after a full first page the next two pages are requested together');
  await u.drain('reverse'); r = await pr;
  ok(r.error === null && r.data.length === 31500 && r.data.every((x, i) => x.id === i), 'waves: 31,500 rows arrive complete and in order even when pages answer out of order');
  const waves = []; let cur = []; u.calls.forEach((c, i) => { cur.push(c); const sizes = [1, 2, 4, 8, 8, 8, 8]; const done = waves.length; if (cur.length === sizes[done]) { waves.push(cur); cur = []; } });
  ok(u.calls.length === 39 && u.peak() === 8 && JSON.stringify(u.calls) === JSON.stringify(Array.from({ length: 39 }, (_, i) => i)), 'waves: 32 pages of data take 6 rounds (1·2·4·8·8·8) instead of 32, never more than 8 requests at once');
  u = mk2(1500, { failAt: 2000 }); pr = FA(u.build); await u.drain(); r = await pr;
  ok(u.calls.indexOf(2) > -1 && r.error === null && r.data.length === 1500, 'waves: an error on a page that lies beyond the end of the data is ignored');
  u = mk2(9000, { failAt: 4000 }); pr = FA(u.build); await u.drain('reverse'); r = await pr;
  ok(r.data === null && r.error && r.error.message === 'page-error', 'waves: an error on a page inside the data fails the whole read — never a silently shorter list');
  u = mk2(9000, { throwAt: 4000 }); const prT = FA(u.build).then(v => ({ v }), e => ({ e })); await u.drain(); const threw = (await prT).e;
  ok(threw && threw.message === 'boom', 'waves: a page that throws still throws to the caller, as before');
  u = mk2(1500, { throwAt: 2000 }); pr = FA(u.build); await u.drain(); r = await pr;
  ok(u.calls.indexOf(2) > -1 && r.error === null && r.data.length === 1500, 'waves: a throw beyond the end of the data is ignored too');
  t = mk(3000); r = await FA(t.build, ['tooth_num', 'surface']);
  ok(r.data.length === 3000 && t.calls.every(x => x[2].join() === 'tooth_num,surface'), 'waves: custom order keys are applied to every page');

  const res = scan(F), bad = res.filter(x => !ALLOW.some(al => al[0] === x[0] && al[1] === x[1] && al[2] === x[2]));
  ok(!bad.length, 'inventory: no unpaged bulk read outside the reasoned allow-list' + (bad.length ? ' — ' + bad.map(x => x.join(' | ')).join(' ; ') : ''));
  const stale = ALLOW.filter(al => !res.some(x => al[0] === x[0] && al[1] === x[1] && al[2] === x[2]));
  ok(!stale.length, 'allow-list has no stale entries' + (stale.length ? ' — ' + stale.map(x => x.slice(0, 3).join(' | ')).join(' ; ') : ''));

  const has = (f, re, m) => ok(re.test(F[f]), m);
  has('patients.html', /await window\.SyDentFetchAll\(function\(\)\{ return window\.sb\s*\.from\('patients'\)\s*\.select\('\*'\)/, 'patients list paged');
  /* v808: التقويمُ يحمّل نافذةً (من أول الشهر الماضي + «بلا تاريخ») والأقدمُ عند الرجوع — كلاهما بالجالب المصفّح */
  has('appointments.html', /return window\.SyDentFetchAll\(function \(\) \{ return window\.sb\.from\('appointments'\)\.select\('\*'\)\s*\.eq\('doctor_id', currentUser\.id\)\s*\.or\('date\.gte\.' \+ from \+ ',date\.is\.null'\)/, 'calendar window paged (calendar)');
  has('appointments.html', /window\.SyDentFetchAll\(function \(\) \{ return window\.sb\.from\('appointments'\)\.select\('\*'\)\s*\.eq\('doctor_id', currentUser\.id\)\.gte\('date', from\)\.lt\('date', upto\)/, 'older months paged when going back (calendar)');
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
  ['fetcher stops after one page', rep('supabase-init.js', "        if (rows.length < PAGE) return { data: out, error: null };\n", "        return { data: out, error: null };\n")],
  ['fetcher pages one by one again', rep('supabase-init.js', "      wave = Math.min(wave * 2, WAVE_MAX);", "      wave = 1;")],
  ['fetcher floods the server (unbounded wave)', rep('supabase-init.js', "      wave = Math.min(wave * 2, WAVE_MAX);", "      wave = wave * 2;")],
  ['first page not alone (wasted requests on every small read)', rep('supabase-init.js', "var PAGE = 1000, WAVE_MAX = 8, out = [], next = 0, wave = 1;", "var PAGE = 1000, WAVE_MAX = 8, out = [], next = 0, wave = 2;")],
  ['pages merged in arrival order', rep('supabase-init.js', "      var got = await Promise.all(batch);\n", "      var got = []; await Promise.all(batch.map(function (bp) { return bp.then(function (v) { got.push(v); }); }));\n")],
  ['error inside the data swallowed', rep('supabase-init.js', "        if (!res || res.error) return { data: null, error: (res && res.error) || { message: 'fetch_failed' } };\n", "        if (!res || res.error) return { data: out, error: null };\n")],
  ['error beyond the end fails the read', rep('supabase-init.js', "      var got = await Promise.all(batch);\n", "      var got = await Promise.all(batch);\n      for (var z = 0; z < got.length; z++) { if (got[z].r && got[z].r.error) return { data: null, error: got[z].r.error }; }\n")],
  ['page exception swallowed', rep('supabase-init.js', "        if (got[g].threw) throw got[g].e;\n", "        if (got[g].threw) return { data: out, error: null };\n")],
  ['order keys dropped after the first page', rep('supabase-init.js', "      for (var ki = 0; ki < keys.length; ki++) q = q.order(keys[ki]);\n      return Promise.resolve(q.range(", "      if (i === 0) for (var ki = 0; ki < keys.length; ki++) q = q.order(keys[ki]);\n      return Promise.resolve(q.range(")],
  ['fetcher reuses one builder', rep('supabase-init.js', "    var fetchPage = function (i) {\n      var q = build();\n", "    var q0 = build();\n    var fetchPage = function (i) {\n      var q = q0;\n")],
  ['patients list unpaged again', F => Object.assign({}, F, { 'patients.html': F['patients.html'].replace(/await window\.SyDentFetchAll\(function\(\)\{ return (window\.sb\s*\.from\('patients'\)\s*\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: true \}\)); \}\)/, 'await $1') })],
  ['a new unpaged bulk read', rep('expenses.html', "async function loadExpenses() {", "async function loadExpenses() {\n  var _x = await window.sb.from('expenses').select('id').eq('owner_id', currentUser.id);")]
];
/* خروجٌ صامت (وعدٌ لم يُحسم فأفرغت الحلقة) لا يُحسب نجاحاً أبداً */
let FINISHED = false;
process.on('exit', code => { if (!FINISHED && code === 0) { console.log('❌ prove-fetchall: توقّف قبل الاكتمال'); process.exitCode = 1; } });
const withLimit = (p, ms) => { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(tm)); };
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await withLimit(suite(F2), 15000); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-fetchall: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    FINISHED = true; process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-fetchall: ' + pass + '/' + (pass + fail));
  FINISHED = true; process.exit(fail === 0 ? 0 : 1);
})();
