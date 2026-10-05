/* v518 — مثبتُ الإنتاج مقابل الهدف (dash-goal.js · M159) — مستقل، على الملفات الحيّة مع SyDentDaySheet الحقيقي.
   (١) المجدولُ اليوم: البنودُ المربوطة دقيقة بكيس عملتها · الموعدُ بلا بنود ⇒ تقديرٌ من سعر العلاج (treatment_id ثم اسمُ النوع) ·
       بلا أيٍّ منهما ⇒ «بلا تسعير» · الملغى/الغائب لا يُعدّ · موعدٌ له بنود لا يُقدَّر مرةً ثانية؛
   (٢) الشهرُ حتى اليوم = مجموعُ SyDentDaySheet.compute يوماً بيوم رقماً برقم (المخطّطُ والمستقبل لا يُعدّان)؛
   (٣) أيامُ العمل: الكل/الماضية من booking_work_days · الهدفُ اليومي والوتيرة · طبقةٌ فقط لعملةٍ لها هدفٌ أو مجدولٌ أو إنتاج؛
   (٤) العرض: النسبُ والألوان · الوتيرة · «حدّد هدفاً» للمالك فقط · الحالةُ الفارغة · هروبٌ · بلا ألوانٍ محفورة؛
   (٥) load: ثلاثة استعلامات بنطاق الطبيب (بنودُ مواعيد اليوم غير الملغاة · الكتالوج · جلساتُ الشهر المكتملة حتى اليوم)؛
   (٦) الربط: الوسم · البطاقة · الأعمدةُ الجديدة باستعلام الإعدادات · الهدفُ يُمرَّر بكيس عملته · إعداداتُ الهدف (قسمٌ + حفظٌ بأعمدةٍ مسمّاة) · الهجرة 159 · cache-bust.
   --self-test: 6 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('dash-goal.js'), DS = read('acc-daysheet.js'), PM = read('pay-methods.js');
function load(src, sb) {
  const win = {}; if (sb) win.sb = sb;
  /* v548: الاستعلاماتُ الجماعية تمرّ بـSyDentFetchAll (مثبتُه prove-fetchall)؛ هنا ممرٌّ مباشر لأن محاكيَ الاستعلام بلا range */
  win.SyDentFetchAll = win.SyDentFetchAll || (b => Promise.resolve(b()));
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, encodeURIComponent, JSON, isFinite };
  vm.createContext(ctx); vm.runInContext(PM, ctx); vm.runInContext(DS, ctx); vm.runInContext(src, ctx); return win;
}
const TODAY = '2026-09-28';   // الاثنين
const A = (id, extra) => Object.assign({ id, status: 'confirmed', type: 'حشوة', treatment_id: null }, extra || {});
const TR = [{ id: 't1', name: 'حشوة', price: 50000, currency: 'SYP' }, { id: 't2', name: 'تاج', price: 100, currency: 'USD' }, { id: 't3', name: 'فحص', price: 0, currency: 'SYP' }];
const SESS = [{ id: 'm1', cost: 100000, status: 'completed', currency: 'SYP', date: '2026-09-01' }, { id: 'm2', cost: 200000, status: 'completed', currency: 'SYP', date: '2026-09-15' },
              { id: 'm3', cost: 300000, status: 'completed', currency: 'SYP', date: '2026-09-28' }, { id: 'm4', cost: 40, status: 'completed', currency: 'USD', date: '2026-09-10' },
              { id: 'm5', cost: 999, status: 'planned', currency: 'SYP', date: '2026-09-10' }, { id: 'm6', cost: 999, status: 'completed', currency: 'SYP', date: '2026-09-29' }];

function suite(src) {
  const W = load(src), G = W.SyDentGoal, DSh = W.SyDentDaySheet;
  const c = o => G.compute(Object.assign({ today: TODAY }, o));
  /* (١) */
  let r = c({ appts: [A('a1'), A('a2', { type: 'تاج' }), A('a3', { type: 'x' }), A('a4', { status: 'cancelled' }), A('a5', { treatment_id: 't2', type: 'حشوة' })],
              planned: [{ appointment_id: 'a1', cost: 150000, currency: 'SYP' }, { appointment_id: 'a1', cost: 20, currency: 'USD' }, { appointment_id: 'a4', cost: 5000, currency: 'SYP' }],
              treatments: TR, goals: {}, workDays: '0,1,2,3,4,6' });
  const S = r.layers.find(l => l.cur === 'SYP'), U = r.layers.find(l => l.cur === 'USD');
  ok(S && S.exact === 150000 && S.apptsExact === 1, 'scheduled: linked planned items are exact, per currency bag');
  ok(U && U.exact === 20 && U.apptsExact === 1, 'scheduled: the same appointment counts in both bags when its items span currencies');
  ok(S.estimated === 0 && U.estimated === 200 && U.apptsEstimated === 2, 'scheduled: estimate from treatment_id (a5→تاج) and from type name (a2→تاج); a1 with items is never estimated again');
  ok(S.apptsTotal === 4 && U.apptsTotal === 4 && S.apptsUnpriced === 1, 'scheduled: cancelled appointment excluded from total; unknown type → unpriced');
  ok(S.scheduled === 150000 && U.scheduled === 220, 'scheduled: total = exact + estimated');
  r = c({ appts: [A('a1', { type: 'فحص' })], treatments: TR, goals: {} });
  ok(r.layers.length === 0, 'scheduled: zero-priced catalogue item → unpriced; no layer without goal/scheduled/mtd');
  r = c({ appts: [A('a1', { type: ' حشوة  ' })], treatments: TR, goals: {} });
  ok(r.layers[0].estimated === 50000, 'scheduled: type matched to catalogue name after trim/space normalisation');
  r = c({ appts: [A('a1')], planned: [{ appointment_id: 'a1', cost: 7000, currency: 'SYP', status: 'completed' }], treatments: [], goals: {} });
  ok(r.layers.length === 0, 'scheduled: only planned-status items count');
  /* (٢) */
  r = c({ appts: [], treatments: [], goals: { SYP: 3000000 }, workDays: '0,1,2,3,4,6', sheetData: { sessions: SESS } });
  const L = r.layers.find(l => l.cur === 'SYP');
  let ref = 0; for (let d = 1; d <= 28; d++) { const s = DSh.compute({ sessions: SESS }, '2026-09-' + String(d).padStart(2, '0')); ref += s.SYP.production.total; }
  ok(L.mtd === ref && L.mtd === 600000, 'mtd: equals the day-sheet production summed day by day (planned m5 and future m6 excluded)');
  ok(!r.layers.find(l => l.cur === 'USD'), 'mtd: a stray USD session alone does not open a USD layer when multi-currency is off');
  r = c({ appts: [], treatments: [], goals: { SYP: 3000000 }, workDays: '0,1,2,3,4,6', sheetData: { sessions: SESS }, multi: true });
  ok(r.layers.find(l => l.cur === 'USD') && r.layers.find(l => l.cur === 'USD').mtd === 40, 'mtd: with multi-currency on, the USD layer shows its production');
  r = c({ appts: [], treatments: [], goals: {}, sheetData: { sessions: SESS }, baseCur: 'USD' });
  ok(r.layers.length === 1 && r.layers[0].cur === 'USD' && r.layers[0].mtd === 40, 'base: a USD-based clinic gets the USD layer as base (SYP hidden without goal/scheduled/multi)');
  /* (٣) */
  const w = G.workDayStats('2026-09-28', '0,1,2,3,4,6');
  ok(w.total === 26 && w.passed === 24, 'workdays: September 2026 with Fridays closed → 26 total, 24 through the 28th');
  ok(G.workDayStats('2026-09-28', '').total === 30 && G.workDayStats('2026-09-28', 'x').passed === 28, 'workdays: no/invalid setting → every day');
  ok(L.dailyGoal === Math.round(3000000 / 26 * 100) / 100 && L.paceGoal === Math.round(3000000 * 24 / 26 * 100) / 100, 'goal: daily = monthly ÷ work days; pace = monthly × passed ÷ total');
  r = c({ appts: [], treatments: [], goals: { SYP: 0, USD: -5 }, sheetData: { sessions: [] } });
  ok(r.layers.length === 0, 'goal: zero/negative goals are no goal');
  r = c({ appts: [], treatments: [], goals: { USD: 1000 } });
  ok(r.layers.length === 1 && r.layers[0].cur === 'USD' && r.layers[0].monthlyGoal === 1000, 'goal: USD-only goal → USD layer only');
  /* (٤) */
  r = c({ appts: [A('a1'), A('a2', { type: 'x' })], planned: [{ appointment_id: 'a1', cost: 120000, currency: 'SYP' }], treatments: TR, goals: { SYP: 2600000 }, workDays: '0,1,2,3,4,6', sheetData: { sessions: SESS } });
  let h = G.render(r, { owner: true });
  ok(/📅 قيمة مواعيد اليوم \(متوقّع\)/.test(h) && /\u2066120,000 ل\.س\u2069/.test(h) && /\/ \u2066100,000 ل\.س\u2069/.test(h) && /gl-fill gl-green" style="width:100%"/.test(h) && /\u2066120%\u2069 من هدف اليوم/.test(h), 'render: today row with daily goal (2.6M/26 = 100,000), green full bar, 120%');
  ok(/موعد واحد · من بنود الخطة/.test(h) && !/gl-est/.test(h), 'render (v533): the layer counts only its own currency\'s appointments (1 exact), solid bar when exact');
  ok(!/gl-foot/.test(h), 'render (v533): no payments passed → no collected line');
  {
  /* v533 — سؤال المالك: 350$ «مسدد» ولا أحد دفع. المتوقَّع ≠ المقبوض، والعدد لكل عملة */
  let r = c({ appts: [A('f1'), A('f2'), A('f3'), A('f4'), A('i1', { type: 'تاج' }), A('u1', { type: 'x' })], treatments: TR, goals: { SYP: 2600000, USD: 3000 }, workDays: '0,1,2,3,4,6', sheetData: { sessions: [] }, payments: [] });
  let h = G.render(r, {});
  const hU = h.slice(h.indexOf('gl-cur">$') - 80);
  ok(/\u20664\u2069 مواعيد · تقديري من سعر العلاج/.test(h) && /موعد واحد · تقديري من سعر العلاج/.test(hU) && !/\u20666\u2069 موعد \(/.test(h), 'render (v533): SYP line 4 appointments, USD line 1 — never the day\'s total per currency');
  ok(/gl-fill gl-[a-z]+ gl-est"/.test(h) && /ليست مقبوضاً/.test(h), 'render (v533): estimate-driven bar is striped with an explanatory title');
  ok(/💵 المقبوض اليوم<\/span><span class="gl-v">\u20660 ل\.س\u2069 · \u20660 \$\u2069<\/span>/.test(h) && /\u20666\u2069 موعداً اليوم|6 مواعيد اليوم|\u20666\u2069 مواعيد اليوم/.test(h) && /\u20661\u2069 بلا تسعير/.test(h), 'render (v533): collected today (0 in both) + the day\'s total and unpriced once');
  r = c({ appts: [], treatments: [], goals: { SYP: 100 }, sheetData: { sessions: [] }, payments: [{ amount: 40, currency: 'USD' }, { amount: 10.5, currency: 'USD' }, { amount: 7000, currency: 'SYP' }] });
  h = G.render(r, {});
  ok(r.collected.USD === 50.5 && r.collected.SYP === 7000 && /\u20667,000 ل\.س\u2069 · \u206650\.5 \$\u2069/.test(h), 'render (v533): collected summed per currency; a currency with payments but no layer still shown');
  }
  ok(/📈 الشهر حتى اليوم/.test(h) && /\u2066600,000 ل\.س\u2069/.test(h) && /\u206623%\u2069 من هدف الشهر/.test(h) && /⚠️ دون الوتيرة/.test(h) && /gl-t-orange/.test(h), 'render: month row 600K of 2.6M = 23%, below pace → orange');
  ok(!/حدّد هدفاً/.test(h) && !/gl-cur/.test(h), 'render: goal set → no settings link; single layer → no currency tag');
  r = c({ appts: [A('a1')], planned: [{ appointment_id: 'a1', cost: 120000, currency: 'SYP' }], treatments: [], goals: {}, sheetData: { sessions: [] } });
  h = G.render(r, { owner: true });
  ok(!/gl-bar/.test(h) && /href="settings\.html#productionGoalSection"/.test(h) && /يوم عمل \u206628\/30\u2069/.test(h), 'render: no goal → no bars, work-day counter, settings link for owner');
  ok(!/href=/.test(G.render(r, { owner: false })), 'render: staff never gets the settings link');
  r = c({ appts: [], treatments: [], goals: { SYP: 100000 }, sheetData: { sessions: [{ id: 'z', cost: 95000, status: 'completed', currency: 'SYP', date: '2026-09-28' }] }, workDays: '0,1,2,3,4,5,6' });
  h = G.render(r, {});
  ok(/\u20660%\u2069 من هدف اليوم/.test(h) && /gl-fill gl-red" style="width:0%"/.test(h) && /✅ على الوتيرة/.test(h) && /\u206695%\u2069 من هدف الشهر/.test(h) && /gl-fill gl-green" style="width:95%"/.test(h), 'render: today 0% red; month 95% ≥ pace (28/30 → 93,333) → green on pace');
  ok(/gl-empty/.test(G.render({ layers: [] }, { owner: true })) && /settings\.html#productionGoalSection/.test(G.render({ layers: [] }, { owner: true })), 'render: empty state with owner link');
  r = c({ appts: [A('a1', { type: '<b>x</b>' })], treatments: [{ id: 'q', name: '<b>x</b>', price: 10, currency: 'USD' }], goals: { SYP: 5, USD: 5 }, sheetData: { sessions: [] } });
  h = G.render(r, {});
  ok(/gl-cur/.test(h) && !/<b>x<\/b>/.test(h), 'render: two layers → currency tags; no raw HTML leaks');
  ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')) && /if \(window\.SyDentGoal\) return;/.test(src) && !/\.update\(|\.insert\(|\.delete\(|\.upsert\(|innerHTML/.test(src), 'module: idempotent, read-only, tones only');
}
suite(SRC);

(async () => {
  /* (٥) */
  const calls = [];
  const sb = { from(t) { const rec = { table: t, eq: [], in: [], gte: [], lte: [] }; calls.push(rec); const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, in(k, v) { rec.in.push([k, v]); return o; }, gte(k, v) { rec.gte.push([k, v]); return o; }, lte(k, v) { rec.lte.push([k, v]); return o; },
    then(res) { const d = t === 'treatments' ? [{ id: 't1', name: 'حشوة', price: 50000, currency: 'SYP' }] : (t === 'ledger_sessions' ? (rec.eq.some(x => x[1] === 'planned') ? [{ appointment_id: 'a1', cost: 90000, currency: 'SYP', status: 'planned' }] : [{ id: 'm', cost: 10000, status: 'completed', currency: 'SYP', date: '2026-09-03' }]) : []); return Promise.resolve({ data: d, error: null }).then(res); } }; return o; } };
  const W = load(SRC, sb);
  const r = await W.SyDentGoal.load(sb, 'DOC', { today: TODAY, appts: [A('a1'), A('a2'), A('a3', { status: 'cancelled' })], goals: { SYP: 1000000 }, workDays: '' });
  const pq = calls.find(c => c.table === 'ledger_sessions' && c.eq.some(x => x[1] === 'planned')), tq = calls.find(c => c.table === 'treatments'), mq = calls.find(c => c.table === 'ledger_sessions' && c.eq.some(x => x[1] === 'completed'));
  ok(pq && pq.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && pq.in[0][0] === 'appointment_id' && pq.in[0][1].join() === 'a1,a2', 'load: planned items only for today\'s live appointments (cancelled excluded), doctor-scoped');
  ok(tq && tq.eq.some(x => x[0] === 'doctor_id') && /price/.test(tq.select) && /currency/.test(tq.select), 'load: catalogue with price + currency, doctor-scoped');
  ok(mq && mq.gte[0][1] === '2026-09-01' && mq.lte[0][1] === TODAY && /date/.test(mq.select) && /cost/.test(mq.select), 'load: month sessions from the 1st to today in the day-sheet column shape');
  const L = r.layers[0];
  const payq = calls.find(c => c.table === 'ledger_payments');
  ok(payq && payq.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && payq.eq.some(x => x[0] === 'date' && x[1] === TODAY) && /amount/.test(payq.select) && /currency/.test(payq.select), 'load (v533): today\'s payments — the «إيراد اليوم» query (doctor, date = today)');
  ok(/const _pfPays = _dashSettle\(window\.sb\.from\('ledger_payments'\)\.select\('amount,date,currency'\)\s*\.eq\('doctor_id', uid\)\.eq\('date', today\)\);/.test(read('index.html')) && /const \{ data: pays \} = _dashTake\(await _pfPays\);/.test(read('index.html'))   /* v554: جُلب مبكراً — الاستعلامُ نفسُه */ && /sb\.from\('ledger_payments'\)\.select\('amount,date,currency'\)\.eq\('doctor_id', uid\)\.eq\('date', today\)/.test(SRC), 'load (v533): same table, columns and filters as the income KPI');
  ok(L.exact === 90000 && L.estimated === 50000 && L.apptsExact === 1 && L.apptsEstimated === 1 && L.mtd === 10000 && L.monthlyGoal === 1000000, 'load: exact + estimated + mtd assembled');
  const sbE = { from(t) { const o = { select() { return o; }, eq() { return o; }, in() { return o; }, gte() { return o; }, lte() { return o; }, then(res) { return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res); } }; return o; } };
  const W2 = load(SRC, sbE);
  const r2 = await W2.SyDentGoal.load(sbE, 'DOC', { today: TODAY, appts: [A('a1')], goals: { SYP: 5 } });
  ok(r2.layers.length === 1 && r2.layers[0].scheduled === 0 && r2.layers[0].mtd === 0 && W2.__warned, 'load: query errors degrade to zeros with the goal still shown');
  /* (٦) */
  const IX = read('index.html'), ST = read('settings.html'), CB = read('scripts/cache-bust.sh'), MG = read('migrations/159_production_goal.sql');
  ok((IX.match(/dash-goal\.js\?v=/g) || []).length === 1 && IX.indexOf('<script src="dash-goal.js?v=') > IX.indexOf('<script src="acc-daysheet.js?v='), 'dashboard: single tag after acc-daysheet.js');
  ok(/id="glCard"/.test(IX) && /id="glBody"/.test(IX) && IX.indexOf('id="ydCard"') < IX.indexOf('id="glCard"'), 'dashboard (v529): goal card below the yesterday card');
  ok(/production_goal_syp, production_goal_usd, currency, multi_currency_enabled'\)/.test(IX), 'dashboard: goal columns (+ base currency, multi flag) read in the settings query');
  /* v554: الإعداداتُ تُطلَق مع مؤشّر الالتزام وتُنتظر قبل البطاقات الثانوية والهدل */
  ok((IX.match(/loadDashWaState\(uid\);/g) || []).length === 1 && IX.indexOf('var _waP = loadDashWaState(uid);') > IX.indexOf('_dashApptsToday = apptsToday;')
     && IX.indexOf('  await _waP;') > IX.indexOf('var _waP = loadDashWaState(uid);') && IX.indexOf('  await _waP;') < IX.indexOf('window.SyDentYesterday.load(')
     && IX.indexOf('  await _waP;') < IX.indexOf('window.SyDentGoal.load(') && IX.indexOf('  await _waP;') < IX.indexOf('_dashHuddle = await window.SyDentHuddle.load'), 'dashboard: settings (goals, work days, recall interval) load once, before the huddle/yesterday/goal loads and after today\'s appointments are cached');
  ok(/goals: \{ SYP: _dashCfgWa && _dashCfgWa\.production_goal_syp, USD: _dashCfgWa && _dashCfgWa\.production_goal_usd \}/.test(IX) && /baseCur: _dashCfgWa && _dashCfgWa\.currency, multi: !!\(_dashCfgWa && _dashCfgWa\.multi_currency_enabled\)/.test(IX) && /window\.SyDentGoal\.render\(_gl, \{ owner: nlIsOwner\(\) \}\)/.test(IX), 'dashboard: goals passed per currency bag with base currency + multi flag; owner-gated links');
  ok(/\.gl-green \{ background: var\(--green\); \}/.test(IX) && /\.gl-red \{ background: var\(--red\); \}/.test(IX), 'dashboard: bar colours from theme variables');
  ok(/id="productionGoalSection"/.test(ST) && /id="fGoalSyp"/.test(ST) && /id="fGoalUsd"/.test(ST) && /async function saveProductionGoal/.test(ST), 'settings: goal section with per-currency inputs and its own save');
  ok(/\.update\(\{ production_goal_syp: gS, production_goal_usd: gU, updated_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\('owner_id', currentUser\.id\)/.test(ST), 'settings: save writes the two named columns only, owner-scoped');
  ok(/if \(!res\.data\) \{ showToast\('⚠️ لم يُحفظ/.test(ST), 'settings: an update that touched no row is reported, not toasted as saved');
  ok(/if \(Number\.isNaN\(gS\) \|\| Number\.isNaN\(gU\)\)/.test(ST) && /_gS\.value = \(res\.data\.production_goal_syp != null\)/.test(ST), 'settings: negative/invalid rejected; values loaded from the existing settings read');
  ok(/ADD COLUMN IF NOT EXISTS production_goal_syp numeric/.test(MG) && /ADD COLUMN IF NOT EXISTS production_goal_usd numeric/.test(MG) && /production_goal_syp >= 0/.test(MG) && /production_goal_usd >= 0/.test(MG), 'migration 159: two nullable non-negative columns, idempotent');
  ok((CB.match(/dash-goal/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');

  if (process.argv.includes('--self-test')) {
    const muts = [
      ["if (!a || !a.id || DEAD[a.status]) return;", "if (!a || !a.id) return;", 'cancelled appointments scheduled'],
      ["        return;\n      }\n      var t = (a.treatment_id", "      }\n      var t = (a.treatment_id", 'appointment with items estimated again'],
      ["if (set && !set[wd]) continue;", "", 'work days setting ignored'],
      ["dailyGoal: g && wds.total ? r2(g / wds.total) : null,", "dailyGoal: g ? r2(g / 30) : null,", 'daily goal from a fixed 30 days'],
      ["for (var i = 1; i <= p[2]; i++) {", "for (var i = 1; i <= 31; i++) {", 'month-to-date includes future days'],
      ["b[rc(s)] += c;", "b.SYP += c;", 'USD items dumped into the SYP bag'],
      ["var mtdCounts = mtd[c] > 0 && (c === base || !!ctx.multi);", "var mtdCounts = mtd[c] > 0;", 'stray other-currency session opens a layer']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { suite(SRC.replace(a, b)); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت الإنتاج مقابل الهدف: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
