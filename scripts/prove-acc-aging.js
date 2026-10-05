/* v507 — مثبتُ تقادم ذمم المرضى (acc-aging.js) — مستقل، على الملفات الحيّة.
   (١) **مرآةُ اللوحة**: balances() ≡ computeDashFinancials (index.html) على المتجهات نفسها + عشوائيات؛
   (٢) دلالةُ التعمير: حفظُ الذمم (Σ الفئات = الرصيد) · الأقدمُ يُطفأ أولاً · حدودُ الفئات · العملةُ كيس ·
       المخطّط لا يُعمَّر · الخصم/الاسترداد · الأرصدةُ الدائنة خارج الفئات · علَمُ القسط المتأخّر؛
   (٣) load: صفحاتُ الألف · فشلُ الأساسيّ ⇒ ok:false · جدولٌ ناعم غائب ⇒ [] · الخططُ النشطة فقط؛
   (٤) العرض والتصفية والربطُ بصفحة المحاسبة وقائمةُ سماح cache-bust.
   --self-test: طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('acc-aging.js');
const TODAY = '2026-09-27';

function load(src) {
  const win = {};
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, parseFloat, String, Date, Array, Object, Promise, Math, Infinity, encodeURIComponent };
  vm.createContext(ctx); vm.runInContext(src, ctx); return win.SyDentAging;
}

/* ── استخراجُ computeDashFinancials من index.html وتشغيلُه على stub ── */
function extractFn(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('missing ' + name);
  let i = src.indexOf('{', m.index), depth = 0, start = m.index;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); } }
  throw new Error('unbalanced ' + name);
}
const DASH_SRC = extractFn(read('index.html'), 'computeDashFinancials');
function sbFor(data) {
  const byTable = { ledger_sessions: data.sessions, ledger_payments: data.payments, payment_splits: data.splits, account_adjustments: data.adjustments };
  return { from(t) { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, then(r) { return Promise.resolve({ data: byTable[t] || [], error: null }).then(r); } }; return q; } };
}
async function dash(data, ids) {
  const win = { sb: sbFor(data) };
  const ctx = { window: win, console: { warn() {} }, Number, parseFloat, Object, Promise, Math, Array, String };
  vm.createContext(ctx); vm.runInContext(DASH_SRC + '\nthis.__f = computeDashFinancials;', ctx);
  return ctx.__f('DOC', ids);
}
const S = (id, pid, cost, date, extra) => Object.assign({ id, patient_id: pid, cost, date, status: 'completed', currency: 'SYP', created_at: date + 'T08:00:00Z' }, extra || {});
const P = (pid, amount, extra) => Object.assign({ patient_id: pid, amount, currency: 'SYP', date: '2026-09-01' }, extra || {});
const SP = (pid, sid, amount, extra) => Object.assign({ patient_id: pid, session_id: sid, amount, is_unearned: false, currency: 'SYP' }, extra || {});
const ADJ = (pid, kind, amount, extra) => Object.assign({ patient_id: pid, kind, amount, currency: 'SYP' }, extra || {});
const PT = (id, name) => ({ id, name, phone: '' });

const A = load(SRC);

function suite(A) {
  const C = (d) => A.compute(Object.assign({ patients: [], sessions: [], payments: [], splits: [], adjustments: [], plans: [] }, d), TODAY);
  /* حدودُ الفئات */
  ok(A.bucketIndex(0) === 0 && A.bucketIndex(30) === 0 && A.bucketIndex(31) === 1 && A.bucketIndex(60) === 1 && A.bucketIndex(61) === 2 && A.bucketIndex(90) === 2 && A.bucketIndex(91) === 3, 'bucket boundaries 30/31 · 60/61 · 90/91');
  ok(A.daysBetween('2026-08-28', TODAY) === 30 && A.daysBetween('2026-08-27', TODAY) === 31, 'daysBetween exact');

  /* حفظُ الذمم + الأقدمُ أولاً */
  let r = C({ patients: [PT('p', 'أحمد')], sessions: [S('s1', 'p', 1000, '2026-05-01'), S('s2', 'p', 600, '2026-08-20'), S('s3', 'p', 400, TODAY)], payments: [P('p', 1100)] });
  let row = r.SYP.due.rows[0];
  ok(r.SYP.due.rows.length === 1 && row.total === 900, 'balance 2000-1100 = 900');
  ok(row.b[3] === 0 && row.b[1] === 500 && row.b[0] === 400 && row.b[2] === 0, 'oldest charge paid off first: +90 → 0, 31–60 → 500, 0–30 → 400');
  ok(Math.abs(row.b[0] + row.b[1] + row.b[2] + row.b[3] - row.total) < 1e-9, 'conservation Σ buckets = balance');
  ok(r.SYP.due.total === 900 && r.SYP.due.buckets[1] === 500 && r.SYP.due.buckets[0] === 400, 'layer totals follow rows');
  ok(row.oldest === 38 && row.oldestDate === '2026-08-20', 'oldest open charge = 38 days');
  /* بلا دفعة: كلُّه بفئته */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01'), S('s2', 'p', 50, '2026-07-15'), S('s3', 'p', 20, '2026-09-10')] });
  row = r.SYP.due.rows[0];
  ok(row.b[3] === 100 && row.b[2] === 50 && row.b[0] === 20 && row.total === 170, 'unpaid charges age by their own date');
  /* المخطّط لا يُحمَّل */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01'), S('s2', 'p', 900, '2026-01-01', { status: 'planned' })] });
  ok(r.SYP.due.rows[0].total === 100 && r.SYP.due.rows[0].b[3] === 100, 'planned sessions are not receivables');
  /* الخصم يُطفئ الأقدم · الإعدام كذلك */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01'), S('s2', 'p', 100, '2026-09-20')], adjustments: [ADJ('p', 'discount', 60), ADJ('p', 'write_off', 40)] });
  ok(r.SYP.due.rows[0].total === 100 && r.SYP.due.rows[0].b[3] === 0 && r.SYP.due.rows[0].b[0] === 100, 'discount + write-off retire the oldest charge');
  /* الاسترداد يعيد فتحَ المستحق (على الأحدث) */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01'), S('s2', 'p', 100, '2026-09-20')], payments: [P('p', 200)], splits: [SP('p', 's1', 100), SP('p', 's2', 100)], adjustments: [ADJ('p', 'refund', 30)] });
  ok(r.SYP.due.rows[0].total === 30 && r.SYP.due.rows[0].b[0] === 30 && r.SYP.due.rows[0].b[3] === 0, 'refund of earned money reopens the newest charge');
  /* دفعةٌ مقدّمة ⇒ دائن لا مدين */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01')], payments: [P('p', 150)], splits: [SP('p', 's1', 100), SP('p', null, 50, { is_unearned: true })] });
  ok(r.SYP.due.rows.length === 0 && r.SYP.credit.rows.length === 1 && r.SYP.credit.rows[0].amount === 50 && r.SYP.credit.total === 50, 'unearned credit listed separately, not aged');
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01')], payments: [P('p', 130)] });
  ok(r.SYP.credit.rows.length === 1 && r.SYP.credit.rows[0].amount === 30 && !r.SYP.due.rows.length, 'no splits: overpayment → credit');
  /* مسدَّد ⇒ لا شيء */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01')], payments: [P('p', 100)] });
  ok(!r.SYP.active && !r.USD.active, 'fully paid → inactive layers');
  /* كيسٌ لكلِّ عملة */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01'), S('s2', 'p', 50, '2026-01-01', { currency: 'USD' })], payments: [P('p', 100, { currency: 'USD' })] });
  ok(r.SYP.due.rows[0].total === 100 && r.USD.credit.rows[0].amount === 50 && !r.USD.due.rows.length, 'USD payment never covers a SYP charge');
  /* عدّة مرضى · الترتيب: الأكثرُ تأخّراً أولاً */
  r = C({ patients: [PT('a', 'أ'), PT('b', 'ب'), PT('c', 'ج')], sessions: [S('s1', 'a', 100, '2026-09-01'), S('s2', 'b', 100, '2026-01-01'), S('s3', 'c', 500, '2026-09-01')] });
  ok(r.SYP.due.rows.map(x => x.patient_id).join() === 'b,c,a', 'sorted by oldest days desc, then amount');
  ok(r.SYP.due.rows[1].name === 'ج', 'patient names resolved');
  /* بلا تاريخ ⇒ اليوم (لا يسقط) */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, null, { created_at: '' })] });
  ok(r.SYP.due.rows[0].total === 100 && r.SYP.due.rows[0].b[0] === 100, 'dateless charge aged as today, never dropped');
  /* الفتاتُ تحت العتبة لا يُعرض */
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 100, '2026-01-01')], payments: [P('p', 99.7)] });
  ok(!r.SYP.active, 'balance ≤ 0.5 is settled (dashboard EPS)');
  /* الأقساطُ المتأخّرة */
  const plan = { patient_id: 'p', status: 'active', total: 1000, installment_amount: 250, frequency: 'monthly', start_date: '2026-06-01', currency: 'SYP' };
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 1000, '2026-06-01')], payments: [P('p', 250, { date: '2026-06-01' })], plans: [plan] });
  ok(r.SYP.due.rows[0].plan && r.SYP.due.rows[0].plan.overdueDays === 88 && r.SYP.due.rows[0].plan.nextDue === '2026-07-01' && r.SYP.due.rows[0].plan.installment === 250, 'overdue instalment flagged (next due 2026-07-01, 88 days)');
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 1000, '2026-06-01')], payments: [P('p', 250, { date: '2026-06-01' })], plans: [Object.assign({}, plan, { status: 'cancelled' })] });
  ok(!r.SYP.due.rows[0].plan, 'cancelled plan → no flag');
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 1000, '2026-06-01')], payments: [P('p', 250, { date: '2026-06-01' })], plans: [Object.assign({}, plan, { currency: 'USD' })] });
  ok(!r.SYP.due.rows[0].plan, 'plan in another currency does not flag this layer');
  r = C({ patients: [PT('p', 'x')], sessions: [S('s1', 'p', 1000, '2026-09-20')], payments: [P('p', 250, { date: '2026-09-20' })], plans: [Object.assign({}, plan, { start_date: '2026-09-20' })] });
  ok(!r.SYP.due.rows[0].plan, 'next instalment still in the future → no flag');
}
suite(A);

(async () => {
  /* (١) مرآةُ اللوحة — متجهاتٌ ثابتة + عشوائيات */
  const vec = { patients: [PT('a', 'a'), PT('b', 'b')],
    sessions: [S('s1', 'a', 1000, '2026-05-01'), S('s2', 'a', 600, '2026-08-20', { status: 'planned' }), S('s3', 'b', 400, '2026-09-01', { currency: 'USD' }), S('s4', 'b', 50, '2026-09-02')],
    payments: [P('a', 1100), P('b', 500, { currency: 'USD' })],
    splits: [SP('a', 's1', 1000), SP('a', null, 100, { is_unearned: true }), SP('b', 's3', 400, { currency: 'USD' }), SP('b', null, 100, { is_unearned: true, currency: 'USD' })],
    adjustments: [ADJ('a', 'refund', 150), ADJ('b', 'discount', 20)] };
  async function mirror(data, ids, label) {
    const d = await dash(data, ids), b = A.balances(data);
    let same = true;
    ids.forEach(id => ['SYP', 'USD'].forEach(c => {
      const x = d.map[id].bags[c], y = (b[id] || { bags: { SYP: {}, USD: {} } }).bags[c];
      ['completedTotal', 'paid', 'allocated', 'unearned', 'chargeReductions', 'refunds', 'trueBalance'].forEach(k => {
        if (Math.abs((x[k] || 0) - (y[k] || 0)) > 1e-9) { same = false; console.log('  mismatch', label, id, c, k, x[k], y[k]); }
      });
    }));
    ok(same, 'balances ≡ computeDashFinancials: ' + label);
  }
  await mirror(vec, ['a', 'b'], 'fixed vector');
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let t = 0; t < 40; t++) {
    const ids = ['p1', 'p2', 'p3'], curs = ['SYP', 'USD'], data = { patients: ids.map(i => PT(i, i)), sessions: [], payments: [], splits: [], adjustments: [] };
    let sid = 0;
    ids.forEach(pid => {
      const n = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) data.sessions.push(S('s' + (++sid), pid, Math.round(rnd() * 500), '2026-0' + (1 + Math.floor(rnd() * 9)) + '-1' + Math.floor(rnd() * 9), { status: rnd() < 0.2 ? 'planned' : 'completed', currency: curs[Math.floor(rnd() * 2)] }));
      const m = Math.floor(rnd() * 3);
      for (let i = 0; i < m; i++) data.payments.push(P(pid, Math.round(rnd() * 600), { currency: curs[Math.floor(rnd() * 2)] }));
      if (rnd() < 0.6) data.sessions.filter(s => s.patient_id === pid).forEach(s => { if (rnd() < 0.7) data.splits.push(SP(pid, s.id, Math.round(rnd() * s.cost), { currency: s.currency, is_unearned: rnd() < 0.15 })); });
      if (rnd() < 0.5) data.adjustments.push(ADJ(pid, ['discount', 'write_off', 'refund'][Math.floor(rnd() * 3)], Math.round(rnd() * 100), { currency: curs[Math.floor(rnd() * 2)] }));
    });
    await mirror(data, ids, 'random #' + t);
    /* حفظُ الذمم على العشوائيات */
    const res = A.compute(data, TODAY), d = await dash(data, ids);
    ids.forEach(id => curs.forEach(c => {
      const tb = d.map[id].bags[c].trueBalance, row = res[c].due.rows.find(r => r.patient_id === id);
      if (tb > 0.5) ok(row && Math.abs(row.b[0] + row.b[1] + row.b[2] + row.b[3] - tb) < 1e-6 && row.b.every(v => v >= -1e-9), 'conservation random #' + t + ' ' + id + ' ' + c);
      else ok(!row, 'no due row when balance ≤ EPS random #' + t + ' ' + id + ' ' + c);
    }));
  }

  /* (٣) load — الصفحات · الفشل · الجداولُ الناعمة */
  function stub(spec) {
    const calls = [];
    return { calls, sb: { from(t) {
      const c = { table: t, eq: [], range: null, order: null }; calls.push(c);
      const q = { select(s) { c.select = s; return q; }, eq(k, v) { c.eq.push([k, v]); return q; }, order(k) { c.order = k; return q; },
        range(a, b) { c.range = [a, b]; return q; },
        then(r) { const f = spec[t]; const out = typeof f === 'function' ? f(c) : (f || { data: [] }); return Promise.resolve(out).then(r); } };
      return q; } } };
  }
  const big = Array.from({ length: 1000 }, (_, i) => S('s' + i, 'p', 1, '2026-01-01'));
  let st = stub({ patients: { data: [PT('p', 'x')] }, ledger_sessions: c => ({ data: c.range[0] === 0 ? big : [S('sx', 'p', 5, '2026-09-01')] }), ledger_payments: { data: [] }, payment_splits: { data: [] }, account_adjustments: { data: [] }, payment_plans: { data: [] } });
  let r = await A.load(st.sb, 'DOC');
  ok(r.ok && r.data.sessions.length === 1001, 'load: pages by 1000 until a short page');
  const sc = st.calls.filter(c => c.table === 'ledger_sessions');
  ok(sc.length === 2 && sc[0].range[1] === 999 && sc[1].range[0] === 1000 && sc[0].order === 'id' && sc[0].eq[0].join() === 'doctor_id,DOC', 'load: range(0,999) then (1000,…), ordered by id, scoped to doctor');
  ok(st.calls.every(c => c.eq.some(e => e[0] === 'doctor_id' && e[1] === 'DOC')), 'load: every table scoped to doctor_id');
  ok(st.calls.find(c => c.table === 'payment_plans').eq.some(e => e[0] === 'status' && e[1] === 'active'), 'load: only active plans');
  ok(/\bdate\b/.test(sc[0].select) && /created_at/.test(sc[0].select) && /status/.test(sc[0].select) && /currency/.test(sc[0].select), 'load: sessions select carries date/created_at/status/currency');
  st = stub({ patients: { data: [] }, ledger_sessions: { error: { message: 'boom' } }, ledger_payments: { data: [] }, payment_splits: { data: [] }, account_adjustments: { data: [] }, payment_plans: { data: [] } });
  r = await A.load(st.sb, 'DOC'); ok(r.ok === false, 'load: core table error → ok:false');
  st = stub({ patients: { data: [] }, ledger_sessions: { data: [] }, ledger_payments: { data: [] }, payment_splits: { error: { code: '42P01', message: 'relation does not exist' } }, account_adjustments: { error: { code: 'PGRST205' } }, payment_plans: { error: { code: '42P01' } } });
  r = await A.load(st.sb, 'DOC'); ok(r.ok === true && r.data.splits.length === 0 && r.data.plans.length === 0, 'load: missing soft tables tolerated as empty');
  st = stub({ patients: { data: [] }, ledger_sessions: { data: [] }, ledger_payments: { data: [] }, payment_splits: { error: { message: 'network' } }, account_adjustments: { data: [] }, payment_plans: { data: [] } });
  r = await A.load(st.sb, 'DOC'); ok(r.ok === false, 'load: real error on splits → ok:false (raw balances would be wrong)');

  /* (٤) العرض */
  const fmt = n => n + ' ل.س';
  const plan = { patient_id: 'p', status: 'active', total: 1000, installment_amount: 250, frequency: 'monthly', start_date: '2026-06-01', currency: 'SYP' };
  const res = A.compute({ patients: [PT('p', '<b>x</b>'), PT('q', 'q'), PT('c', 'c')], sessions: [S('s1', 'p', 1000, '2026-06-01'), S('s2', 'q', 100, '2026-09-20'), S('s3', 'c', 100, '2026-09-20')], payments: [P('p', 250, { date: '2026-06-01' }), P('c', 130)], splits: [], adjustments: [], plans: [plan] }, TODAY);
  const html = A.renderSection(res.SYP, 'SYP', fmt);
  ok(/&lt;b&gt;x&lt;\/b&gt;/.test(html) && !/<b>x<\/b>/.test(html), 'render: names escaped');
  ok(/ag-section/.test(html) && /تقادم ذمم المرضى/.test(html) && /850 ل\.س/.test(html), 'render: section + total');
  ok((html.match(/data-ag-tags="all b3 plan"/g) || []).length === 1 && /data-ag-tags="all"/.test(html), 'render: rows tagged for filter chips');
  ok(/data-ag-key="plan"/.test(html) && /<th>الأقساط<\/th>/.test(html) && /متأخر <bdi>88<\/bdi> يوماً/.test(html), 'render: instalment chip + column + flag');
  ok(/<details class="ag-credits">/.test(html) && /30 ل\.س/.test(html), 'render: credits in a collapsed details block');
  ok(/<th class="num">المستحق<\/th><th class="num">0–30<\/th><th class="num">31–60<\/th><th class="num">61–90<\/th><th class="num">\+90<\/th><th class="num">أقدم دين<\/th>/.test(html), 'render: numeric headers carry .num so they align with their cells');
  ok((html.match(/patient-profile\.html\?id=/g) || []).length === 3 && (html.match(/class="ag-link"/g) || []).length === 3 && /title="كشف الحساب"/.test(html) && !/sy-act/.test(html), 'render: patient name links to the statement on every row (no extra action column)');
  ok(A.renderSection(res.USD, 'USD', fmt) === '' && A.renderSection(null, 'SYP', fmt) === '', 'render: inactive layer → empty string');
  const noPlan = A.renderSection(A.compute({ patients: [PT('q', 'q')], sessions: [S('s2', 'q', 100, '2026-09-20')], payments: [], splits: [], adjustments: [], plans: [] }, TODAY).SYP, 'SYP', fmt);
  ok(!/الأقساط/.test(noPlan) && !/data-ag-key="plan"/.test(noPlan), 'render: no plan column/chip when nobody has an overdue plan');
  /* التصفية على DOM مزيَّف */
  const mkRow = tags => ({ tags, hidden: false, getAttribute() { return tags; } });
  const rows = [mkRow('all b3 plan'), mkRow('all'), mkRow('all b2')];
  const mkChip = key => { const c = { key, cls: new Set(['ag-chip']), getAttribute() { return key; }, classList: { toggle(n, on) { on ? c.cls.add(n) : c.cls.delete(n); } } }; return c; };
  const chips = [mkChip('all'), mkChip('b3')];
  const sec = { querySelectorAll(sel) { return sel === '.ag-chip' ? chips : rows; } };
  chips.forEach(c => { c.closest = () => sec; });
  A.setFilter(chips[1]);
  ok(rows[0].hidden === false && rows[1].hidden === true && rows[2].hidden === true && chips[1].cls.has('active') && !chips[0].cls.has('active'), 'setFilter: single-select, hides non-matching rows');
  A.setFilter(chips[0]);
  ok(rows.every(r => r.hidden === false) && chips[0].cls.has('active'), 'setFilter: «all» restores every row');

  /* الربطُ بصفحة المحاسبة */
  const AC = read('accounting.html');
  const tag = AC.indexOf('<script src="acc-aging.js?v='), sbT = AC.indexOf('<script src="sidebar.js?v='), inl = AC.indexOf('<script>\n');
  ok(tag > 0 && tag > sbT && tag < inl && (AC.match(/acc-aging\.js\?v=/g) || []).length === 1, 'accounting: single tag after sidebar.js, before the inline script');
  ok(/loadAging\(\),/.test(extractFn(AC, 'loadAllInRange')), 'accounting: loadAging runs with the all-time loaders');
  ok(/agingResult = window\.SyDentAging\.compute\(r\.data, todayISO\(\)\)/.test(AC) && /if \(r && r\.ok\)/.test(AC), 'accounting: compute only on ok load');
  ok(/var s1 = renderAgingSection\(cur\) \+/.test(AC) && /renderMaterialCostSection\(\) \+/.test(AC), 'accounting: aging first in the supplementary block, per currency layer');
  ok(/return window\.SyDentAging\.renderSection\(agingResult\[cur\], cur, fmtSY\)/.test(AC) && /if \(!agingResult \|\| !window\.SyDentAging\) return '';/.test(AC), 'accounting: renders with fmtSY, empty on failure');
  ok(/\.ag-buckets \{ display:grid; grid-template-columns: repeat\(5, minmax\(0,1fr\)\)/.test(AC) && /@media \(max-width: 700px\) \{ \.ag-buckets \{ grid-template-columns: repeat\(2, minmax\(0,1fr\)\)/.test(AC), 'accounting: bucket grid uses minmax(0,1fr) + mobile collapse (#675)');
  ok((read('scripts/cache-bust.sh').match(/acc-aging/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');
  ok(/if \(window\.SyDentAging\) return;/.test(SRC) && /SYDENT_AGING_END/.test(SRC) && !/innerHTML|window\.confirm|alert\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(SRC), 'module: idempotent, no DOM writes, zero DB writes');

  /* الإثباتُ العكسي */
  if (process.argv.includes('--self-test')) {
    const muts = [
      ["if (st !== 'planned') b.completedTotal += Number(s.cost || 0);", 'b.completedTotal += Number(s.cost || 0);', 'planned sessions counted'],
      ['if (!b.hasSplits) b.allocated = b.paid;', 'b.allocated = b.paid;', 'splits ignored'],
      ['var rfe = b.refunds - rfu;', 'var rfe = 0;', 'refund never reopens'],
      ['var used = Math.min(ch.cost, pool);', 'var used = 0;', 'nothing retired (conservation broken)'],
      ['if (days <= 30) return 0;', 'if (days < 30) return 0;', 'bucket boundary off by one'],
      ["if (a.date !== b.date) return a.date < b.date ? -1 : 1;", "if (a.date !== b.date) return a.date < b.date ? 1 : -1;", 'newest retired first'],
      ["} else if ((b.unearned || 0) > EPS || tb < -EPS) {", "} else if (false) {", 'credits dropped'],
      ["if (rc(pl) !== cur) return;", "", 'foreign-currency plan flags'],
      ["if (rows.length < PAGE) break;", "break;", 'no paging'],
      ["if (rs[0].error || rs[1].error || rs[2].error) {", "if (false) {", 'core error swallowed']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      const M = load(SRC.replace(a, b));
      try { suite(M); } catch (e) { fail++; }
      /* الطفراتُ التحميلية تُختبر بنداءِ load على stub */
      if (/paging|core error/.test(name)) {
        const s2 = stub({ patients: { data: [PT('p', 'x')] }, ledger_sessions: c => ({ data: c.range[0] === 0 ? big : [S('sx', 'p', 5, '2026-09-01')] }), ledger_payments: { data: [] }, payment_splits: { data: [] }, account_adjustments: { data: [] }, payment_plans: { data: [] } });
        const r2 = await M.load(s2.sb, 'DOC');
        if (/paging/.test(name) && r2.data.sessions.length !== 1001) fail++;
        const s3 = stub({ patients: { data: [] }, ledger_sessions: { error: { message: 'boom' } }, ledger_payments: { data: [] }, payment_splits: { data: [] }, account_adjustments: { data: [] }, payment_plans: { data: [] } });
        const r3 = await M.load(s3.sb, 'DOC');
        if (/core error/.test(name) && r3.ok !== false) fail++;
      }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت تقادم الذمم: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
