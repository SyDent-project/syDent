/* v508 — مثبتُ كشف اليوم (acc-daysheet.js) وطرق الدفع الموحَّدة (pay-methods.js) — مستقل، على الملفات الحيّة.
   (١) طرقُ الدفع: القائمةُ الواحدة · norm على كل صيغةٍ مخزَّنة (تسمياتٌ عربية · رموزٌ · فراغ · مجهول) · خياراتُ الدفعة تسمياتٌ عربية؛
   (٢) كشفُ اليوم: إنتاجُ اليوم ≡ إنتاجُ صفحة المحاسبة (computeSummary على الصفوف نفسها) · المقبوضاتُ حسب الطريقة ·
       الخارجُ بأنواعه · صافي الدرج نقداً (الاستردادُ ودفعاتُ المخابر نقداً صراحةً، الخصمُ لا) · كيسُ العملة · يومُ الطابع الزمني ≡ inLocalRange؛
   (٣) load: نطاقُ المالك · eq(date) · نافذةُ paid_at الموسَّعة ثم القصُّ المحلي · الجدولُ الناعم الغائب ⇒ [] · فشلُ الأساسي ⇒ ok:false؛
   (٤) العرضُ والتركيبُ (آخرُ اختيارٍ يفوز) والربطُ بالصفحتين وقائمةُ سماح cache-bust.
   (٥) v548 — مصدرُ النقد (M165): normSource/fromDrawer/sourceForStore · «من خارج الدرج» خارجٌ بالكشف لا يُخصم من الدرج ·
       قيمةٌ عالقة على طريقةٍ غير نقدية لا تُحتسب · التنبيهُ والتأكيدُ عند المتوقَّع السالب · الحفظُ بالصفحات الثلاث + قيدُ القاعدة.
   --self-test: طفرات لا بدّ أن تحمّر. */
'use strict';
process.env.TZ = 'Asia/Damascus';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PM_SRC = read('pay-methods.js'), DS_SRC = read('acc-daysheet.js');
const AC = read('accounting.html'), PP = read('patient-profile.html');
const DAY = '2026-09-28';
const tick = () => new Promise(r => setImmediate(r));

function load(dsSrc, pmSrc) {
  const win = {};
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, parseFloat, String, Date, Array, Object, Promise, Math, isNaN, encodeURIComponent, setTimeout: (f) => f(), document: undefined };
  vm.createContext(ctx); vm.runInContext((pmSrc || PM_SRC) + '\n' + dsSrc, ctx); return win;
}
function extractFn(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('missing ' + name);
  let i = src.indexOf('{', m.index), depth = 0, start = m.index;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); } }
  throw new Error('unbalanced ' + name);
}
/* إنتاجُ صفحة المحاسبة على صفوفٍ معطاة (computeSummary تقرأ العامّات) */
function accProduction(sessions) {
  const ctx = { sessions, payments: [], paymentSplits: [], splitIsEarned: () => false, Number };
  vm.createContext(ctx); vm.runInContext(extractFn(AC, 'computeSummary') + '\nthis.__p = computeSummary().production;', ctx);
  return ctx.__p;
}
const inLocalRangeSrc = extractFn(AC, 'inLocalRange');
function accInLocalRange(ts, from, to) {
  const ctx = { Date, String, isNaN }; vm.createContext(ctx);
  vm.runInContext(inLocalRangeSrc + '\nthis.__r = inLocalRange(' + JSON.stringify(ts) + ',' + JSON.stringify(from) + ',' + JSON.stringify(to) + ');', ctx);
  return ctx.__r;
}

const S = (cost, extra) => Object.assign({ id: 's' + Math.random(), cost, date: DAY, status: 'completed', currency: 'SYP' }, extra || {});
const P = (amount, method, extra) => Object.assign({ id: 'p' + Math.random(), amount, method, date: DAY, currency: 'SYP' }, extra || {});
const ADJ = (kind, amount, extra) => Object.assign({ kind, amount, date: DAY, currency: 'SYP' }, extra || {});
const E = (amount, pm, extra) => Object.assign({ amount, payment_method: pm, date: DAY, currency: 'SYP' }, extra || {});
const LB = (amount, extra) => Object.assign({ amount, pay_date: DAY, currency: 'SYP' }, extra || {});
const PO = (amount, pm, paid_at, extra) => Object.assign({ amount, payment_method: pm, paid_at, currency: 'SYP' }, extra || {});
const D = (o) => Object.assign({ sessions: [], payments: [], adjustments: [], expenses: [], labPayments: [], payouts: [] }, o || {});

const W = load(DS_SRC);
const PMm = W.SyDentPayMethods, DS = W.SyDentDaySheet;

function suite(PMm, DS) {
  /* (١) طرقُ الدفع */
  const keys = PMm.LIST.map(m => m.key), labels = PMm.LIST.map(m => m.label);
  ok(new Set(keys).size === keys.length && new Set(labels).size === labels.length, 'LIST: unique keys and labels');
  ok(PMm.LIST.filter(m => m.cash).length === 1 && PMm.LIST.find(m => m.cash).key === 'cash', 'LIST: exactly one physical-cash method');
  ok(['shamcash', 'syriatel', 'mtn'].every(k => keys.includes(k)) && labels.includes('شام كاش') && labels.includes('سيريتل كاش') && labels.includes('MTN كاش'), 'LIST: Syrian e-wallets present');
  /* الصيغُ المخزَّنة فعلاً بالقاعدة الحيّة (ledger_payments.method عربي · expenses/payouts رموز) */
  ok(PMm.norm('نقداً') === 'cash' && PMm.norm('cash') === 'cash' && PMm.norm('نقد') === 'cash' && PMm.norm(' نقدا ') === 'cash', 'norm: every stored cash form → cash');
  ok(PMm.norm('تحويل بنكي') === 'bank' && PMm.norm('bank') === 'bank' && PMm.norm('أونلاين') === 'online' && PMm.norm('check') === 'check' && PMm.norm('شيك') === 'check', 'norm: bank / online / check forms');
  ok(PMm.norm('شام كاش') === 'shamcash' && PMm.norm('سيريتل كاش') === 'syriatel' && PMm.norm('MTN كاش') === 'mtn' && PMm.norm('mtn') === 'mtn', 'norm: e-wallet labels and codes');
  ok(PMm.norm('') === 'other' && PMm.norm(null) === 'other' && PMm.norm(undefined) === 'other' && PMm.norm('other') === 'other' && PMm.norm('شي غريب') === 'other', 'norm: empty/unknown → other (never dropped)');
  ok(PMm.LIST.every(m => PMm.norm(m.label) === m.key && PMm.norm(m.key) === m.key), 'norm: every label and key round-trips');
  ok(PMm.label('cash') === 'نقداً' && PMm.label('نقداً') === 'نقداً' && PMm.label('zzz') === 'أخرى' && PMm.isCash('نقداً') && !PMm.isCash('bank'), 'label/isCash');
  const opts = PMm.optionsHtml('cash');
  ok((opts.match(/<option /g) || []).length === PMm.LIST.length && /value="نقداً" selected/.test(opts) && /value="شام كاش"/.test(opts) && !/value="cash"/.test(opts), 'optionsHtml: values are Arabic labels (storage contract), cash preselected');
  ok(/value="تحويل بنكي" selected/.test(PMm.optionsHtml('bank')), 'optionsHtml: preselect by any stored form');

  /* (٢) كشفُ اليوم */
  let r = DS.compute(D({ sessions: [S(1000), S(500), S(9999, { status: 'planned' }), S(700, { date: '2026-09-27' }), S(300, { currency: 'USD' })] }), DAY);
  ok(r.SYP.production.total === 1500 && r.SYP.production.count === 2 && r.USD.production.total === 300, 'production: completed sessions dated today, per currency; planned/other-day excluded');
  ok(accProduction([S(1000), S(500)]) === r.SYP.production.total, 'production ≡ accounting computeSummary on the same rows');
  r = DS.compute(D({ payments: [P(100, 'نقداً'), P(200, 'نقداً'), P(50, 'شام كاش'), P(30, 'تحويل بنكي'), P(5, 'غير معروف'), P(1000, 'نقداً', { date: '2026-09-27' }), P(70, 'نقداً', { currency: 'USD' }), P(0, 'نقداً')] }), DAY);
  ok(r.SYP.collected.total === 385 && r.SYP.collected.count === 5, 'collected: gross payments dated today (zero excluded), other day/currency out');
  ok(r.SYP.collected.byMethod[0].key === 'cash' && r.SYP.collected.byMethod[0].total === 300 && r.SYP.collected.byMethod[0].label === 'نقداً', 'collected: grouped by normalised method, largest first');
  ok(r.SYP.collected.byMethod.find(m => m.key === 'shamcash').total === 50 && r.SYP.collected.byMethod.find(m => m.key === 'other').total === 5, 'collected: e-wallet and unknown buckets');
  ok(r.SYP.net.cashIn === 300 && r.SYP.net.cash === 300 && r.SYP.net.all === 385 && r.USD.net.cash === 70, 'net: cash drawer counts only cash-method inflows; all-methods net separate');
  r = DS.compute(D({ payments: [P(1000, 'نقداً'), P(500, 'تحويل بنكي')], adjustments: [ADJ('discount', 100), ADJ('write_off', 50), ADJ('refund', 80), ADJ('refund', 999, { date: '2026-09-01' })],
                   expenses: [E(120, 'cash'), E(200, 'bank'), E(30, null)], labPayments: [LB(60), LB(999, { pay_date: '2026-09-27' })],
                   payouts: [PO(400, 'cash', DAY + 'T10:00:00+03:00'), PO(150, 'bank', DAY + 'T10:00:00+03:00'), PO(999, 'cash', '2026-09-27T10:00:00+03:00')] }), DAY);
  ok(r.SYP.adjustments.reductions.total === 150 && r.SYP.adjustments.reductions.count === 2 && r.SYP.adjustments.refunds.total === 80, 'adjustments: discount+write-off vs refunds, today only');
  ok(r.SYP.outflow.expenses.total === 350 && r.SYP.outflow.expenses.byMethod.find(m => m.key === 'none').total === 30 && r.SYP.outflow.expenses.byMethod.find(m => m.key === 'none').label === 'بلا طريقة مسجَّلة' && !r.SYP.outflow.expenses.byMethod.find(m => m.key === 'other') && r.SYP.outflow.labs.total === 60 && r.SYP.outflow.payouts.total === 550 && r.SYP.outflow.total === 350 + 60 + 550 + 80, 'outflow: expenses (codes normalised, blank → its own «بلا طريقة مسجَّلة» bucket) + labs + payouts + refunds');
  ok(r.SYP.net.cashOut === 120 + 60 + 400 + 80 && r.SYP.net.cash === 1000 - (120 + 60 + 400 + 80), 'drawer: cash expenses + labs (explicitly cash) + cash payouts + refunds (explicitly cash); discounts never; bank never');
  ok(r.SYP.net.all === 1500 - 1040, 'net all methods = collected − all outflow');
  ok(r.SYP.active && !r.USD.active, 'active flags per currency');
  r = DS.compute(D({ adjustments: [ADJ('discount', 10)] }), DAY);
  ok(r.SYP.active && r.SYP.net.cash === 0 && r.SYP.net.all === 0, 'a lone discount makes the day active but moves no money');
  /* يومُ الطابع الزمني ≡ inLocalRange بتوقيت دمشق — منتصفُ الليل المحلي ومنتصفُ ليل UTC */
  const stamps = [DAY + 'T00:30:00+03:00', DAY + 'T23:30:00+03:00', '2026-09-27T21:30:00Z', DAY + 'T20:59:59Z', DAY + 'T21:00:00Z', '2026-09-27T20:59:59Z'];
  ok(stamps.every(ts => (DS.localDayOf(ts) === DAY) === accInLocalRange(ts, DAY, DAY)), 'payouts: local-day test mirrors accounting inLocalRange on DST-free Damascus stamps');
  ok(DS.localDayOf('') === null && DS.localDayOf('garbage') === null, 'localDayOf: empty/garbage → null (never today)');
  ok(DS.shiftYmd('2026-10-01', -1) === '2026-09-30' && DS.shiftYmd('2026-12-31', 1) === '2027-01-01', 'shiftYmd across month/year');
  r = DS.compute(D({ payouts: [PO(10, 'cash', '2026-09-27T21:30:00Z')] }), DAY);
  ok(r.SYP.outflow.payouts.total === 10, 'payout at 00:30 local (21:30Z previous day) belongs to today');

  /* (٥) مصدرُ النقد — M165 */
  ok(PMm.normSource('outside') === 'outside' && PMm.normSource(' OUTSIDE ') === 'outside' && ['drawer', '', null, undefined, 'x'].every(v => PMm.normSource(v) === 'drawer'), 'normSource: only «outside» is outside; empty/unknown → drawer (pre-M165 rows unchanged)');
  ok(PMm.fromDrawer('cash', null) && PMm.fromDrawer('نقداً', 'drawer') && !PMm.fromDrawer('cash', 'outside') && !PMm.fromDrawer('bank', null) && !PMm.fromDrawer(null, 'drawer'), 'fromDrawer: cash from the drawer only');
  ok(PMm.sourceForStore('bank', 'outside') === null && PMm.sourceForStore('shamcash', 'drawer') === null && PMm.sourceForStore('cash', 'outside') === 'outside' && PMm.sourceForStore('cash', null) === 'drawer' && PMm.sourceForStore('cash', 'zz') === 'drawer', 'sourceForStore: non-cash → null (M165 constraint), cash → normalised source');
  const so = PMm.sourceOptionsHtml('outside');
  ok((so.match(/<option /g) || []).length === 2 && /value="outside" selected/.test(so) && /value="drawer"/.test(PMm.sourceOptionsHtml(null)) && /value="drawer" selected/.test(PMm.sourceOptionsHtml(null)), 'sourceOptionsHtml: two options, stored value preselected, empty → drawer');
  ok(PMm.SOURCES.map(x => x.key).join() === 'drawer,outside', 'SOURCES ≡ M165 constraint list');
  r = DS.compute(D({ payments: [P(500, 'نقداً')],
                     expenses: [E(100, 'cash', { cash_source: 'outside' }), E(50, 'cash', { cash_source: 'drawer' }), E(20, 'cash'), E(40, 'bank', { cash_source: 'outside' })],
                     payouts: [PO(150, 'cash', DAY + 'T10:00:00+03:00', { cash_source: 'outside' }), PO(60, 'cash', DAY + 'T11:00:00+03:00')],
                     labPayments: [LB(30, { cash_source: 'outside' }), LB(10)] }), DAY);
  ok(r.SYP.net.cashOut === 50 + 20 + 60 + 10 && r.SYP.net.cash === 500 - 140, 'drawer: «outside» cash never deducted; drawer/empty source deducted as before');
  ok(r.SYP.net.cashOutside === 100 + 150 + 30, 'cashOutside: every «outside» cash outflow summed');
  ok(r.SYP.outflow.expenses.total === 210 && r.SYP.outflow.payouts.total === 210 && r.SYP.outflow.labs.total === 40 && r.SYP.outflow.total === 460 && r.SYP.net.all === 40, 'outflow and all-methods net unchanged by the source (still spent money)');
  const eo = r.SYP.outflow.expenses.byMethod;
  ok(eo.find(m => m.key === 'cash_outside').total === 100 && eo.find(m => m.key === 'cash_outside').label === 'نقداً — من خارج الدرج' && eo.find(m => m.key === 'cash').total === 70 && eo.find(m => m.key === 'bank').total === 40, 'byMethod: outside cash in its own bucket; a stale source on a bank row stays bank');
  ok(r.SYP.outflow.payouts.byMethod.find(m => m.key === 'cash_outside').total === 150 && r.SYP.outflow.labs.outside === 30, 'payouts/labs: outside split kept');
  const hs = DS.renderBody(r, DAY, (n, cur) => n + (cur === 'USD' ? ' $' : ' ل.س'));
  ok(/نقداً — من خارج الدرج/.test(hs) && /نقداً من خارج الدرج/.test(hs) && /280 ل\.س/.test(hs) && /خارجٌ من الدرج 140 ل\.س/.test(hs), 'render: outside lines + drawer card counts only drawer cash');
  ok(!/المتوقّع بالسالب/.test(hs), 'render: no negative warning when the drawer is positive');
  const neg = DS.compute(D({ payouts: [PO(150, 'cash', DAY + 'T10:00:00+03:00')] }), DAY);
  ok(neg.SYP.net.cash === -150 && /المتوقّع بالسالب/.test(DS.renderBody(neg, DAY, (n) => n + '')), 'render: negative expected → explicit warning on the open closing form');
  const negOut = DS.compute(D({ payouts: [PO(150, 'cash', DAY + 'T10:00:00+03:00', { cash_source: 'outside' })] }), DAY);
  ok(negOut.SYP.net.cash === 0 && negOut.SYP.net.cashOutside === 150 && !/المتوقّع بالسالب/.test(DS.renderBody(negOut, DAY, (n) => n + '')), 'owner case: a $150 salary from outside → drawer 0, no warning');

  /* (٦) v702 · M200 — طريقةُ الدفع لدفعات المخابر والاستردادات + الحركاتُ بلا طريقة */
  const f6 = (n, cur) => n + (cur === 'USD' ? ' $' : ' ل.س');
  r = DS.compute(D({ payments: [P(1000, 'نقداً')],
                     labPayments: [LB(100, { payment_method: 'bank' }), LB(40, { payment_method: 'cash' }), LB(25, { payment_method: 'cash', cash_source: 'outside' }), LB(15), LB(7, { payment_method: 'shamcash', cash_source: 'outside' })],
                     adjustments: [ADJ('refund', 60, { payment_method: 'shamcash' }), ADJ('refund', 30, { payment_method: 'cash' }), ADJ('refund', 20)] }), DAY);
  ok(r.SYP.outflow.labs.total === 187 && r.SYP.outflow.labs.count === 5 && r.SYP.adjustments.refunds.total === 110, 'M200: lab/refund totals unchanged by the method (money still left)');
  ok(r.SYP.net.cashOut === 40 + 15 + 30 + 20 && r.SYP.net.cash === 1000 - 105, 'M200: only cash lab payments/refunds leave the drawer; bank & e-wallet never; blank (pre-M200) rows still count as cash');
  const lm = k => (r.SYP.outflow.labs.byMethod.find(m => m.key === k) || {}).total, rm = k => (r.SYP.adjustments.refunds.byMethod.find(m => m.key === k) || {}).total;
  ok(lm('bank') === 100 && lm('cash') === 55 && lm('cash_outside') === 25 && lm('shamcash') === 7 && r.SYP.outflow.labs.outside === 25 && r.SYP.net.cashOutside === 25, 'M200: lab payments grouped by method; «outside» only for cash (a stale source on an e-wallet row stays e-wallet)');
  ok(rm('shamcash') === 60 && rm('cash') === 50, 'M200: refunds grouped by method (blank → cash)');
  let h6 = DS.renderBody(r, DAY, f6);
  ok(/دفعات مخابر/.test(h6) && /· تحويل بنكي/.test(h6) && /استرداد للمريض/.test(h6) && /· شام كاش/.test(h6) && !/تُحتسب نقداً/.test(h6), 'M200 render: lab payments and refunds list their methods');
  ok(r.SYP.noMethod.count === 0 && !/ds-flag/.test(h6), 'no-method flag: silent when every movement has a method (blank lab/refund rows are legacy cash, not flagged)');
  r = DS.compute(D({ payments: [P(500, 'نقداً'), P(70, null), P(5, 'غير معروف')], expenses: [E(30, ''), E(10, 'other')], payouts: [PO(63599, null, DAY + 'T10:00:00+03:00'), PO(9, 'cash', DAY + 'T10:00:00+03:00')] }), DAY);
  ok(r.SYP.noMethod.count === 3 && r.SYP.noMethod.total === 70 + 30 + 63599, 'no-method flag: counts blank-method payments, expenses and payouts — explicit «other»/unknown text is not blank');
  ok(r.SYP.net.cash === 500 - 9 && r.SYP.outflow.payouts.byMethod.find(m => m.key === 'none').total === 63599 && r.SYP.collected.byMethod.find(m => m.key === 'none').total === 70 && r.SYP.collected.byMethod.find(m => m.key === 'other').total === 5, 'no-method rows never touch the drawer and sit in their own bucket');
  h6 = DS.renderBody(r, DAY, f6);
  ok(/class="ds-flag"/.test(h6) && /3 حركات/.test(h6) && /63699 ل\.س/.test(h6) && /بلا طريقة دفع/.test(h6) && /بلا طريقة مسجَّلة/.test(h6), 'no-method flag: rendered with count, total and what to do');
  ok(/حركةٌ واحدة/.test(DS.renderBody(DS.compute(D({ payouts: [PO(5, null, DAY + 'T10:00:00+03:00')] }), DAY), DAY, f6)), 'no-method flag: singular wording');
}
suite(PMm, DS);

(async () => {
  /* (٣) load */
  function stub(spec) {
    const calls = [];
    return { calls, sb: { from(t) {
      const c = { table: t, eq: [], gte: null, lte: null, select: '' }; calls.push(c);
      const q = { select(s) { c.select = s; return q; }, eq(k, v) { c.eq.push([k, v]); return q; }, gte(k, v) { c.gte = [k, v]; return q; }, lte(k, v) { c.lte = [k, v]; return q; },
        then(res) { const f = spec[t]; const out = typeof f === 'function' ? f(c) : (f || { data: [] }); return Promise.resolve(out).then(res); } };
      return q; } } };
  }
  const full = { ledger_sessions: { data: [S(10)] }, ledger_payments: { data: [P(5, 'نقداً')] }, account_adjustments: { data: [] }, expenses: { data: [] }, lab_payments: { data: [] }, day_closings: { data: [] },
                 provider_payouts: { data: [PO(1, 'cash', DAY + 'T10:00:00+03:00'), PO(2, 'cash', '2026-09-27T10:00:00+03:00'), PO(3, 'cash', '2026-09-29T00:30:00+03:00')] } };
  let st = stub(full);
  let r = await DS.load(st.sb, 'DOC', DAY);
  ok(r.ok && r.data.sessions.length === 1 && r.data.payments.length === 1 && r.data.payouts.length === 1 && r.data.payouts[0].amount === 1, 'load: ok; payouts trimmed to the local day after the widened window');
  const c = t => st.calls.find(x => x.table === t);
  ok(c('ledger_sessions').eq.some(e => e.join() === 'doctor_id,DOC') && c('ledger_sessions').eq.some(e => e.join() === 'status,completed') && c('ledger_sessions').eq.some(e => e.join() === 'date,' + DAY), 'load: sessions scoped to doctor, completed, eq(date)');
  ok(/payment_method/.test(c('lab_payments').select) && /payment_method/.test(c('account_adjustments').select), 'load: lab payments and adjustments carry payment_method (M200)');
  ok(c('ledger_payments').eq.some(e => e.join() === 'date,' + DAY) && /method/.test(c('ledger_payments').select) && c('account_adjustments').eq.some(e => e.join() === 'date,' + DAY) && c('lab_payments').eq.some(e => e.join() === 'pay_date,' + DAY), 'load: payments (with method) / adjustments / labs by day');
  ok(c('expenses').eq.some(e => e.join() === 'owner_id,DOC') && c('provider_payouts').eq.some(e => e.join() === 'owner_id,DOC') && /payment_method/.test(c('expenses').select) && /payment_method/.test(c('provider_payouts').select), 'load: expenses/payouts scoped to owner_id and carry payment_method');
  ok(/cash_source/.test(c('expenses').select) && /cash_source/.test(c('lab_payments').select) && /cash_source/.test(c('provider_payouts').select), 'load: expenses / lab payments / payouts carry cash_source (M165)');
  ok(c('day_closings') && c('day_closings').eq.some(e => e.join() === 'owner_id,DOC') && c('day_closings').eq.some(e => e.join() === 'day,' + DAY), 'load: closings by owner and day');
  ok(c('provider_payouts').gte && c('provider_payouts').gte[0] === 'paid_at' && c('provider_payouts').gte[1] < DAY + 'T00:00:00Z' && c('provider_payouts').lte[1] > DAY + 'T23:59:59Z', 'load: payouts window widened ±1 day (timezone-safe)');
  st = stub(Object.assign({}, full, { ledger_payments: { error: { message: 'boom' } } }));
  r = await DS.load(st.sb, 'DOC', DAY); ok(r.ok === false, 'load: core error (payments) → ok:false');
  st = stub(Object.assign({}, full, { lab_payments: { error: { code: '42P01', message: 'relation does not exist' } }, provider_payouts: { error: { code: 'PGRST205' } }, day_closings: { error: { code: '42P01' } } }));
  r = await DS.load(st.sb, 'DOC', DAY); ok(r.ok === true && r.data.labPayments.length === 0 && r.data.payouts.length === 0 && r.data.closings.length === 0, 'load: missing soft tables (incl. pre-M158 day_closings) tolerated as empty');
  st = stub(Object.assign({}, full, { expenses: { error: { message: 'network' } } }));
  r = await DS.load(st.sb, 'DOC', DAY); ok(r.ok === false, 'load: real error on a soft table → ok:false (a partial sheet is worse than none)');

  /* (٤) العرض */
  const fmt = (n, cur) => n + (cur === 'USD' ? ' $' : ' ل.س');
  const res = DS.compute(D({ payments: [P(100, 'نقداً'), P(50, '<b>x</b>'), P(7, 'نقداً', { currency: 'USD' })], expenses: [E(20, 'cash')] }), DAY);
  const html = DS.renderBody(res, DAY, fmt);
  ok(/بالليرة/.test(html) && /بالدولار/.test(html) && (html.match(/ds-layer/g) || []).length === 2, 'render: dual currency → two layers with heads');
  ok(/150 ل\.س/.test(html) && /130 ل\.س/.test(html) && /7 \$/.test(html), 'render: totals via page formatter per currency');
  ok(!/<b>x<\/b>/.test(html) && /أخرى/.test(html), 'render: unknown method shown as «أخرى», never raw HTML');
  ok(/صافي الدرج نقداً/.test(html) && /كلٌّ بطريقته المسجَّلة/.test(html) && !/تُحتسب نقداً/.test(html), 'render: drawer line + footnote says every outflow counts by its recorded method (no blanket cash assumption since M200)');
  const empty = DS.renderBody(DS.compute(D(), DAY), DAY, fmt);
  ok(/لا حركة مالية بتاريخ 28\/9\/2026/.test(empty) && !/ds-layer/.test(empty), 'render: empty day message with numeric date');
  ok(/تعذّر تحميل/.test(DS.renderBody(null, DAY, fmt)), 'render: failed load → explicit error, no numbers');
  const sec = DS.renderSection(DAY, 'X');
  ok(/id="daySheetSection"/.test(sec) && /id="dsDate" value="2026-09-28"/.test(sec) && /pick\('today'\)/.test(sec) && /pick\('yesterday'\)/.test(sec) && /SyDentDaySheet\.print\(\)/.test(sec) && /id="dsBody">X</.test(sec), 'render: section controls (date · today · yesterday · print) + body host');
  /* التركيب: آخرُ اختيارٍ يفوز */
  const gates = {};
  const slowSb = { from(t) { const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; }, then(r) { return new Promise(res => { (gates[t] = gates[t] || []).push(() => res({ data: [] })); }).then(r); } }; return q; } };
  const host = { innerHTML: '' }; const bodyEl = { innerHTML: '' };
  const W2 = load(DS_SRC); const ctxDoc = { getElementById(id) { return id === 'dsBody' ? bodyEl : null; } };
  W2.SyDentDaySheet.__doc = ctxDoc;
  /* نحقن document بالنطاق */
  const ctx2 = { window: {}, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, document: ctxDoc, setTimeout: (f) => f() };
  vm.createContext(ctx2); vm.runInContext(PM_SRC + '\n' + DS_SRC, ctx2);
  const DS2 = ctx2.window.SyDentDaySheet;
  const p1 = DS2.mount(host, slowSb, 'DOC', fmt);            /* اليوم — معلَّق */
  const p2 = DS2.pick('2026-09-01');                         /* اختيارٌ لاحق — معلَّق */
  await tick();
  ok(/value="2026-09-01"/.test(host.innerHTML), 'mount/pick: the section re-renders immediately with the newly picked day');
  /* نُطلق الاستعلاماتِ الأولى (لليوم) أولاً — يجب ألا تكتب فوق الاختيار اللاحق */
  const tables = ['ledger_sessions', 'ledger_payments', 'account_adjustments', 'expenses', 'lab_payments', 'provider_payouts', 'day_closings'];
  tables.forEach(t => gates[t][0]()); await p1;
  ok(bodyEl.innerHTML === '', 'pick: a stale (earlier) load never paints over a newer pick');
  tables.forEach(t => gates[t][1]()); await p2;
  ok(/لا حركة مالية بتاريخ 1\/9\/2026/.test(bodyEl.innerHTML), 'pick: the latest pick paints');
  ok(await DS2.pick('bad') === undefined && /1\/9\/2026/.test(bodyEl.innerHTML), 'pick: malformed date ignored');

  /* الإقفال (M158) */
  const CL = (cur, expected, counted, extra) => Object.assign({ id: 'c1', day: DAY, currency: cur, expected, counted, note: '', closed_at: DAY + 'T18:05:00+03:00' }, extra || {});
  let rc = DS.compute(D({ payments: [P(1000, 'نقداً')], closings: [CL('SYP', 1000, 950, { note: 'ناقص' })] }), DAY);
  ok(rc.SYP.closing && rc.SYP.closing.variance === -50 && rc.SYP.closing.counted === 950 && rc.SYP.closing.note === 'ناقص' && !rc.USD.closing, 'compute: closing attached to its currency with variance = counted − expected');
  rc = DS.compute(D({ closings: [CL('USD', 0, 0), CL('SYP', 5, 5, { day: '2026-09-01' })] }), DAY);
  ok(rc.USD.active && rc.USD.closing && !rc.SYP.closing, 'compute: a closing alone makes the layer active; another day\'s closing ignored');
  let hc = DS.renderBody(DS.compute(D({ payments: [P(1000, 'نقداً')], closings: [CL('SYP', 1000, 950, { note: '<b>n</b>' })] }), DAY), DAY, fmt);
  ok(/الصندوق مُقفل/.test(hc) && /عجز 50 ل\.س/.test(hc) && /&lt;b&gt;n&lt;\/b&gt;/.test(hc) && /reopen\('SYP'\)/.test(hc) && !/dsCounted_SYP/.test(hc) && /28\/9\/2026 — \u206606:05 PM\u2069/.test(hc), 'render: closed state — shortage, escaped note, edit button, stamp');
  hc = DS.renderBody(DS.compute(D({ payments: [P(1000, 'نقداً')], closings: [CL('SYP', 1000, 1000)] }), DAY), DAY, fmt);
  ok(/مطابق/.test(hc) && /ds-var-ok/.test(hc), 'render: exact count → «مطابق»');
  hc = DS.renderBody(DS.compute(D({ payments: [P(1000, 'نقداً')], closings: [CL('SYP', 900, 1000)] }), DAY), DAY, fmt);
  ok(/زيادة 100 ل\.س/.test(hc) && /تغيّر الدفترُ بعد الإقفال/.test(hc), 'render: overage + warning when the ledger moved after the snapshot');
  hc = DS.renderBody(DS.compute(D({ payments: [P(1000, 'نقداً')] }), DAY), DAY, fmt);
  ok(/dsCounted_SYP/.test(hc) && /dsNote_SYP/.test(hc) && /close\('SYP'\)/.test(hc) && /المتوقّع من الكشف: 1000 ل\.س/.test(hc) && !/reopen\(/.test(hc), 'render: open state — count form with expected shown');
  /* close(): الحمولة والحارس */
  async function closeHarness(opts, src) {
    const writes = []; const els = { dsCounted_SYP: { value: opts.counted }, dsNote_SYP: { value: opts.note || '' }, dsBody: { innerHTML: '' } };
    const sbc = { from(t) { const st = { t, up: null, opt: null }; const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; },
      upsert(row, o) { st.up = row; st.opt = o; writes.push(st); return q; }, single() { return q; },
      then(r) { return Promise.resolve(st.up ? (opts.fail ? { error: { message: 'x' } } : { data: st.up, error: null }) : { data: [], error: null }).then(r); } }; return q; } };
    const cx = { window: { SyDentSub: { blockReadOnly: () => !!opts.readOnly }, showToast: () => {} }, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, parseFloat, isFinite,
      document: { getElementById(id) { return els[id] || null; }, querySelector() { return null; } }, setTimeout: (f) => f() };
    vm.createContext(cx); vm.runInContext(PM_SRC + '\n' + (src || DS_SRC), cx);
    const M = cx.window.SyDentDaySheet;
    await M.mount({ innerHTML: '' }, sbc, 'DOC', fmt);            /* اليوم — بلا صفوف */
    M.__res = null;
    await M.pick(DAY);
    /* نحقن نتيجةً بصافي درج معروف */
    const st = cx.window.SyDentDaySheet;
    return { M, writes, cx, els };
  }
  async function closingSuite(src) {
    const h = await closeHarness({ counted: '950', note: ' ملاحظة ' }, src);
    /* نجعل صافي الدرج 1000 عبر إعادة الحساب على بيانات مباشرة */
    const stub2 = { from(t) { const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; }, upsert(row, o) { h.writes.push({ t, up: row, opt: o }); return q; }, single() { return q; },
      then(r) { const rows = t === 'ledger_payments' ? [P(1000, 'نقداً')] : []; const last = h.writes[h.writes.length - 1]; return Promise.resolve(last && last.up && !last.done ? (last.done = true, { data: last.up, error: null }) : { data: rows, error: null }).then(r); } }; return q; } };
    await h.M.mount({ innerHTML: '' }, stub2, 'DOC', fmt);
    await h.M.pick(DAY);   /* v523: mount يفتح «اليوم» الحقيقي — نثبّت اليومَ صراحةً فلا يصير المثبتُ لقطةَ تاريخٍ (#671) */
    await h.M.close('SYP');
    const w = h.writes.filter(x => x.t === 'day_closings');
    ok(w.length === 1 && w[0].up.owner_id === 'DOC' && w[0].up.day === DAY && w[0].up.currency === 'SYP' && w[0].up.expected === 1000 && w[0].up.counted === 950 && w[0].up.note === 'ملاحظة' && w[0].opt && w[0].opt.onConflict === 'owner_id,day,currency', 'close(): one upsert on (owner, day, currency) with expected = drawer snapshot, counted, trimmed note');
    h.els.dsCounted_SYP.value = '-5'; const n0 = h.writes.length; await h.M.close('SYP');
    ok(h.writes.length === n0, 'close(): negative/invalid count never writes');
    h.els.dsCounted_SYP.value = ''; await h.M.close('SYP'); ok(h.writes.length === n0, 'close(): empty count never writes');
    h.cx.window.SyDentSub.blockReadOnly = () => true; h.els.dsCounted_SYP.value = '10'; await h.M.close('SYP');
    ok(h.writes.length === n0, 'close(): read-only subscription → no write');
  }
  await closingSuite(DS_SRC);

  /* M165: متوقَّعٌ سالب ⇒ تأكيدٌ صريح؛ الرفضُ لا يكتب، القبولُ يكتب اللقطة السالبة كما هي */
  async function negClosingSuite(src) {
    for (const answer of [false, true]) {
      const writes = []; let asked = 0;
      const els = { dsCounted_SYP: { value: '0' }, dsNote_SYP: { value: '' }, dsBody: { innerHTML: '' } };
      const sbn = { from(t) { const st = { t, up: null }; const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; },
        upsert(row, o) { st.up = row; writes.push({ t, up: row, opt: o }); return q; }, single() { return q; },
        then(res) { const rows = t === 'provider_payouts' ? [PO(150, 'cash', DAY + 'T10:00:00+03:00')] : []; return Promise.resolve(st.up ? { data: st.up, error: null } : { data: rows, error: null }).then(res); } }; return q; } };
      const cx = { window: { SyDialog: { confirm: async () => { asked++; return answer; } }, showToast() {} }, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, parseFloat, isFinite,
        document: { getElementById(id) { return els[id] || null; }, querySelector() { return null; } }, setTimeout: (f) => f() };
      vm.createContext(cx); vm.runInContext(PM_SRC + '\n' + src, cx);
      const M = cx.window.SyDentDaySheet;
      await M.mount({ innerHTML: '' }, sbn, 'DOC', fmt); await M.pick(DAY);
      await M.close('SYP');
      const w = writes.filter(x => x.t === 'day_closings');
      if (!answer) ok(asked === 1 && w.length === 0, 'close(): negative expected asks first; «no» writes nothing');
      else ok(asked === 1 && w.length === 1 && w[0].up.expected === -150 && w[0].up.counted === 0, 'close(): «yes» saves the negative snapshot unchanged');
      await M.close('SYP');   /* القفلُ تحرّر بعد الحوار (لا يعلق _closeBusy) */
      ok(asked === 2, 'close(): busy flag released after the dialog (' + answer + ')');
    }
  }
  await negClosingSuite(DS_SRC);

  /* الربطُ بالصفحتين */
  const tagPM = AC.indexOf('<script src="pay-methods.js?v='), tagDS = AC.indexOf('<script src="acc-daysheet.js?v='), tagAg = AC.indexOf('<script src="acc-aging.js?v='), inl = AC.indexOf('<script>\n');
  ok(tagPM > tagAg && tagDS > tagPM && tagDS < inl && (AC.match(/pay-methods\.js\?v=/g) || []).length === 1 && (AC.match(/acc-daysheet\.js\?v=/g) || []).length === 1, 'accounting: pay-methods then acc-daysheet, once each, before the inline script');
  const hostIdx = AC.indexOf('<div id="daySheetHost"></div>'), filterIdx = AC.indexOf('id="btnApply"'), bodyIdx = AC.indexOf('<div id="body">');
  ok(hostIdx > filterIdx && hostIdx < bodyIdx, 'accounting: day-sheet host sits between the filter bar and the report body');
  const initSrc = extractFn(AC, 'init');
  ok(/loadDaySheet\(\);/.test(initSrc) && initSrc.indexOf('loadDaySheet();') > initSrc.indexOf("$('btnApply').addEventListener"), 'accounting: loadDaySheet called from init after the filter wiring');
  ok(/window\.SyDentDaySheet\.mount\(host, window\.sb, currentUser\.id, dsFmt\)/.test(AC) && /function dsFmt\(n, cur\) \{ var keep = _renderCur; _renderCur = cur; var s = fmtSY\(n\); _renderCur = keep; return s; \}/.test(AC), 'accounting: mounted with a formatter that restores _renderCur');
  ok(/\.ds-cards \{ display:grid; grid-template-columns: repeat\(4, minmax\(0,1fr\)\)/.test(AC) && /@media \(max-width: 700px\) \{ \.ds-cards \{ grid-template-columns: repeat\(2, minmax\(0,1fr\)\)/.test(AC), 'accounting: card grid minmax(0,1fr) + mobile collapse (#675)');
  ok(!/<option>نقداً<\/option><option>تحويل بنكي<\/option>/.test(PP) && /<select id="payMethod" data-src="SyDentPayMethods">/.test(PP), 'patient-profile: no hard-coded method list — single source');
  ok(/pmSel\.innerHTML = window\.SyDentPayMethods\.optionsHtml\('cash'\)/.test(extractFn(PP, 'openPayModal')), 'patient-profile: openPayModal fills the select from SyDentPayMethods');
  const ppPM = PP.indexOf('<script src="pay-methods.js?v='), ppMain = PP.indexOf('new URLSearchParams(location.search)');
  ok(ppPM > 0 && ppPM < ppMain && (PP.match(/pay-methods\.js\?v=/g) || []).length === 1, 'patient-profile: pay-methods tag once, before the main block');
  ok((read('scripts/cache-bust.sh').match(/pay-methods/g) || []).length === 3 && (read('scripts/cache-bust.sh').match(/acc-daysheet/g) || []).length === 3, 'cache-bust.sh: both assets allow-listed (3 places each)');
  ok(/if \(window\.SyDentDaySheet\) return;/.test(DS_SRC) && /SYDENT_DAYSHEET_END/.test(DS_SRC) && !/\.insert\(|\.update\(|\.delete\(|window\.confirm|alert\(/.test(DS_SRC) && (DS_SRC.match(/\.upsert\(/g) || []).length === 1 && /from\('day_closings'\)\s*\.upsert\(/.test(DS_SRC), 'daysheet module: idempotent, the ONLY write is the day_closings upsert (M158), no native dialogs');
  ok(/async function close\(cur\) \{\n    if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(DS_SRC) && /function reopen\(cur\) \{\n    if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(DS_SRC), 'closing: read-mode guard is the first line of close() and reopen()');
  ok((DS_SRC.match(/data-sub-write/g) || []).length === 2 && /class="ds-noprint ds-close-form"/.test(DS_SRC), 'closing: both write buttons carry data-sub-write; the form never prints');
  const M158 = read('migrations/158_day_closings.sql');
  ok(/CREATE TABLE IF NOT EXISTS public\.day_closings/.test(M158) && /UNIQUE \(owner_id, day, currency\)/.test(M158) && /GENERATED ALWAYS AS \(counted - expected\) STORED/.test(M158) && /counted >= 0/.test(M158) && /_sub_guard_table\('public\.day_closings'\)/.test(M158), 'M158: table, one row per (owner, day, currency), generated variance, non-negative count, subscription gate');
  ok(/'cash','bank','check','other','shamcash','syriatel','mtn','online'/.test(M158) && /day_closings/.test(read('db/schema.sql')) && /'shamcash'::"text", 'syriatel'::"text", 'mtn'::"text", 'online'::"text"/.test(read('db/schema.sql')), 'M158: payouts accept e-wallet keys; db/schema.sql mirrored');
  const POH = read('payouts.html'), EXH = read('expenses.html');
  ['shamcash', 'syriatel', 'mtn', 'online'].forEach(k => {
    ok(new RegExp('setMethodFilter\\(\'' + k + '\'\\)').test(POH) && new RegExp('setModalMethod\\(\'' + k + '\'\\)').test(POH) && new RegExp('<option value="' + k + '">').test(EXH), 'payouts filter+modal chips and expenses options carry ' + k);
  });
  ok(/\['cash','bank','check','other','shamcash','syriatel','mtn','online'\]\.indexOf\(po\.payment_method\)/.test(POH) && /pay-methods\.js\?v=/.test(POH) && /pay-methods\.js\?v=/.test(EXH) && /window\.SyDentPayMethods\.label\(m\)/.test(extractFn(POH, 'methodLabel')) && /window\.SyDentPayMethods\.label\(m\)/.test(extractFn(EXH, 'paymentMethodLabel')), 'payouts/expenses: labels for the new keys come from the shared source');
  const PMK = PMm.LIST.map(m => m.key).sort().join();
  ok(PMK === ['cash','bank','check','other','shamcash','syriatel','mtn','online'].sort().join(), 'M158 constraint list ≡ pay-methods.js keys');
  ok(/if \(window\.SyDentPayMethods\) return;/.test(PM_SRC) && !/document|\.insert\(|\.update\(/.test(PM_SRC), 'pay-methods module: idempotent, pure definitions');

  /* M165 — الصفحاتُ الثلاث والقاعدة */
  const LBH = read('labs.html'), M165 = read('migrations/165_cash_source.sql');
  const poSave = POH.slice(POH.indexOf('var payload = {'), POH.indexOf('var payload = {') + 1200);
  ok(/cash_source:\s+window\.SyDentPayMethods\.sourceForStore\(modalMethod, modalSource\)/.test(poSave), 'payouts: save stores cash_source via sourceForStore (non-cash → null)');
  ok(/id="cashSourceField" style="display:none;"/.test(POH) && /data-src="drawer" onclick="setModalSource\('drawer'\)"/.test(POH) && /data-src="outside" onclick="setModalSource\('outside'\)"/.test(POH), 'payouts: source chips, hidden until «cash»');
  ok(/setModalMethod\('cash'\);\n  setModalSource\('drawer'\);/.test(POH) && /setModalSource\(window\.SyDentPayMethods\.normSource\(po\.cash_source\)\)/.test(POH) && /_syncSourceField\(\);\n\}/.test(extractFn(POH, 'setModalMethod')), 'payouts: new → cash from drawer (no silent «other»); edit restores source; method change toggles the field');
  ok(/payment_method, cash_source, breakdown_salary/.test(POH), 'payouts: loader reads cash_source');
  ok(/cash_source: cashSource,/.test(EXH) && /var cashSource = window\.SyDentPayMethods\.sourceForStore\(paymentMethod, \$\('eCashSource'\)\.value\)/.test(EXH) && /onchange="syncExpSource\(\)"/.test(EXH) && /sourceOptionsHtml\(e\.cash_source\)/.test(EXH) && /sourceOptionsHtml\('drawer'\)/.test(EXH), 'expenses: select filled from the shared source, saved via sourceForStore, toggled by method');
  ok(/cash_source: cashSource,/.test(LBH) && /var cashSource = window\.SyDentPayMethods\.sourceForStore\(payMethod, document\.getElementById\('labPaySource'\)\.value\)/.test(LBH) && /payment_method: payMethod,/.test(LBH) && /getElementById\('labPayMethod'\)\.value = 'cash'; syncLabPaySource\(\);/.test(LBH) && /labPaySource'\)\.innerHTML = window\.SyDentPayMethods\.sourceOptionsHtml\('drawer'\)/.test(LBH), 'labs: lab payment saves its method + a source for cash only (M200), defaults to cash from the drawer');
  const lbPM = LBH.indexOf('<script src="pay-methods.js?v='), lbInl = LBH.indexOf('<script>\n');
  ok(lbPM > 0 && (LBH.match(/pay-methods\.js\?v=/g) || []).length === 1 && (lbInl < 0 || lbPM < lbInl), 'labs: pay-methods tag once, before inline code');
  ok(/expenses_cash_source_valid[\s\S]*cash_source IN \('drawer','outside'\) AND payment_method = 'cash'/.test(M165) && /provider_payouts_cash_source_valid[\s\S]*cash_source IN \('drawer','outside'\) AND payment_method = 'cash'/.test(M165) && /lab_payments_cash_source_valid[\s\S]*cash_source IN \('drawer','outside'\)\)/.test(M165) && (M165.match(/ADD COLUMN IF NOT EXISTS cash_source text;/g) || []).length === 3, 'M165: three nullable columns, cash-only constraint (labs: values only), idempotent');

  /* v702 · M200 — الصفحاتُ والقاعدة */
  const M200 = read('migrations/200_daysheet_methods_and_closing_trail.sql'), PRH = read('provider-reports.html'), SCH = read('db/schema.sql');
  const K8 = "'cash','bank','check','other','shamcash','syriatel','mtn','online'";
  ok(M200.includes("lab_payments ADD COLUMN IF NOT EXISTS payment_method text") && M200.includes("account_adjustments ADD COLUMN IF NOT EXISTS payment_method text") && (M200.match(new RegExp(K8.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2, 'M200: payment_method on lab_payments + account_adjustments, constrained to the pay-methods.js keys');
  ok(/cash_source IN \('drawer','outside'\) AND \(payment_method IS NULL OR payment_method = 'cash'\)/.test(M200) && /kind = 'refund' AND payment_method IN/.test(M200), 'M200: lab cash source is for cash only; a method on a non-refund adjustment is rejected');
  ok(/"payment_method" "text"/.test(SCH.slice(SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."lab_payments"'), SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."lab_payments"') + 900)) && /"payment_method" "text"/.test(SCH.slice(SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."account_adjustments"'), SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."account_adjustments"') + 900)) && /lab_payments_payment_method_valid/.test(SCH) && /account_adjustments_payment_method_valid/.test(SCH), 'db/schema.sql mirrors M200 columns and constraints');
  ok(/<select id="labPayMethod" onchange="syncLabPaySource\(\)">/.test(LBH) && /id="labPaySourceWrap"/.test(LBH) && /labPayMethodText\(e\.p\)/.test(LBH), 'labs: method select on the payment form, source shown for cash only, statement rows state the method');
  const adjSave = extractFn(PP, 'saveAdjustment');
  ok(/var adjMethod = \(kind === 'refund'\) \? window\.SyDentPayMethods\.norm\(document\.getElementById\('adjMethod'\)\.value\) : null;/.test(adjSave) && /payment_method: adjMethod,/.test(adjSave) && /id="adjMethodGroup" style="display:none;"/.test(PP) && /mg\.style\.display = \(kind === 'refund'\) \? '' : 'none';/.test(extractFn(PP, 'onAdjKindChange')), 'patient-profile: refund carries its method (null for discount/write-off — DB constraint); the field shows for refunds only');
  const prSave = extractFn(PRH, '_savePayout_inner');
  ok(/payment_method: method,\n    cash_source: source,/.test(prSave) && /var method = window\.SyDentPayMethods\.norm\(document\.getElementById\('payoutMethod'\)\.value\);/.test(prSave) && /sourceForStore\(method, document\.getElementById\('payoutSource'\)\.value\)/.test(prSave), 'provider-reports: the quick payout stores method + source (was blank → «أخرى», never deducted)');
  ok(/resetPayoutMethod\(\);   \/\/ v702/.test(extractFn(PRH, '_openPayoutModalCore')) && /if \(m\) m\.value = 'cash';/.test(extractFn(PRH, 'resetPayoutMethod')) && (PRH.match(/pay-methods\.js\?v=/g) || []).length === 1 && PRH.indexOf('<script src="pay-methods.js?v=') < PRH.indexOf('<script>\n'), 'provider-reports: every payout starts «cash · drawer»; pay-methods loaded once before inline code');
  ok(!/entity_id:|new_value:|old_value:|entity_type:/.test(PRH.slice(PRH.indexOf("window.logAudit('payout.create'"), PRH.indexOf("window.logAudit('payout.delete'") + 400)), 'provider-reports: audit entries use the keys logAudit actually reads (values were silently dropped)');

  /* ══ v702 — وضوحُ الكشف: تحديثٌ لحظي · فحصُ ما قبل الإقفال · أثرُ التعديل وسجلُّه · السالب · الطباعة · الصياغة · شريطُ التحكّم ══ */
  async function v702Suite(src) {
    /* بيئةٌ بمستندٍ بسيط: كلُّ عنصرٍ كائنٌ ثابت يحفظ innerHTML/value */
    function env(rowsRef, extraWin) {
      const els = { dsBody: { innerHTML: '' }, daySheetSection: { innerHTML: '' }, dsCounted_SYP: { value: '', id: 'dsCounted_SYP' }, dsNote_SYP: { value: '', id: 'dsNote_SYP' } };
      const writes = [], toasts = [], audits = [], opened = [];
      const sb = { from(t) { const st = { up: null }; const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; }, maybeSingle() { return q; },
        upsert(row, o) { st.up = row; writes.push({ t, up: row, opt: o }); return q; }, single() { return q; },
        then(res) { const spec = rowsRef.v[t]; return Promise.resolve(st.up ? { data: Object.assign({ id: 'cid' }, st.up), error: null } : (spec && spec.error ? spec : { data: spec || [], error: null })).then(res); } }; return q; } };
      const win = Object.assign({ showToast: m => toasts.push(m), logAudit: (a, o) => audits.push({ a, o }),
        open() { const w = { html: '', document: { write(h) { w.html += h; }, close() {} }, print() {} }; opened.push(w); return w; } }, extraWin || {});
      const cx = { window: win, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, parseFloat, isFinite,
        document: { activeElement: null, getElementById(id) { return els[id] || null; }, querySelector() { return null; } }, setTimeout: (f) => f() };
      vm.createContext(cx); vm.runInContext(PM_SRC + '\n' + src, cx);
      return { M: win.SyDentDaySheet, els, writes, toasts, audits, opened, cx };
    }
    const f = (n, cur) => n + (cur === 'USD' ? ' $' : ' ل.س');
    const host = () => ({ innerHTML: '' });

    /* (أ) التحديثُ الصامت */
    let ref = { v: { ledger_payments: [P(1000, 'نقداً')] } };
    let e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY);
    ok(/1000 ل\.س/.test(e.els.dsBody.innerHTML), 'v702 live: baseline day painted');
    ref.v = { ledger_payments: [P(1000, 'نقداً'), P(250, 'نقداً')] };
    ok(await e.M.refresh() === true && /1250 ل\.س/.test(e.els.dsBody.innerHTML) && /المتوقّع من الكشف: 1250 ل\.س/.test(e.els.dsBody.innerHTML), 'v702 live: refresh() repaints the same day with the new ledger (no reload)');
    ref.v = { ledger_payments: { error: { message: 'offline' } } };
    const kept = e.els.dsBody.innerHTML;
    ok(await e.M.refresh() === false && e.els.dsBody.innerHTML === kept, 'v702 live: a failed silent refresh keeps the last good sheet (never an error screen)');
    ok(/window\.SyDentDaySheet\.refresh\(\)/.test(extractFn(AC, 'init')) && extractFn(AC, 'init').indexOf('window.SyDentDaySheet.refresh()') < extractFn(AC, 'init').indexOf("var from = $('fromDate') && $('fromDate').value, to"), 'v702 live: accounting SyLive refresh updates the day sheet first, independent of the report range');

    /* (ب) فحصُ ما قبل الإقفال: الدفترُ تحرّك بعد الرسم ⇒ لا كتابة، أرقامٌ جديدة، ثم الإقفالُ على الجديد */
    ref = { v: { ledger_payments: [P(1000, 'نقداً')] } };
    e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY);
    ref.v = { ledger_payments: [P(1000, 'نقداً')], expenses: [E(300, 'cash')] };
    e.els.dsCounted_SYP.value = '700'; await e.M.close('SYP');
    ok(e.writes.length === 0 && e.toasts.some(t => /تغيّرت حركة اليوم/.test(t) && /700 ل\.س/.test(t)) && /المتوقّع من الكشف: 700 ل\.س/.test(e.els.dsBody.innerHTML) && e.els.dsCounted_SYP.value === '700', 'v702 close: ledger moved since the sheet was drawn → nothing written, fresh expected shown, typed count kept');
    await e.M.close('SYP');
    ok(e.writes.length === 1 && e.writes[0].up.expected === 700 && e.writes[0].up.counted === 700, 'v702 close: the second press closes on the fresh expected');
    ok(e.audits.length === 1 && e.audits[0].a === 'day_closing.create' && e.audits[0].o.entityType === 'day_closing' && e.audits[0].o.entityId === 'cid' && /المتوقّع 700 ل\.س · المعدود 700 ل\.س · مطابق/.test(e.audits[0].o.description) && e.audits[0].o.newValue.day === DAY && !e.audits[0].o.oldValue, 'v702 audit: a closing is written to the activity log with expected/counted/verdict');
    /* أُقفل من جهازٍ آخر بين الرسم والضغط */
    ref = { v: { ledger_payments: [P(1000, 'نقداً')] } };
    e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY);
    ref.v = { ledger_payments: [P(1000, 'نقداً')], day_closings: [{ id: 'x', day: DAY, currency: 'SYP', expected: 1000, counted: 1000, note: '', closed_at: DAY + 'T18:05:00+03:00', edit_count: 0 }] };
    e.els.dsCounted_SYP.value = '900'; await e.M.close('SYP');
    ok(e.writes.length === 0 && e.toasts.some(t => /أُقفل للتوّ من جهازٍ آخر/.test(t)) && /الصندوق مُقفل/.test(e.els.dsBody.innerHTML) && e.audits.length === 0, 'v702 close: a closing made on another device is shown, never overwritten blindly');
    const r2f = { v: { ledger_payments: [P(10, 'نقداً')] } };
    e = env(r2f); await e.M.mount(host(), mkSb(r2f, e), 'DOC', f); await e.M.pick(DAY); r2f.v = { ledger_payments: { error: { message: 'offline' } } };
    e.els.dsCounted_SYP.value = '10'; await e.M.close('SYP');
    ok(e.writes.length === 0 && e.toasts.some(t => /تعذّر التحقق من حركة اليوم/.test(t)), 'v702 close: cannot verify the ledger (offline) → no closing is written');

    /* (ج) أثرُ التعديل وسجلُّه */
    const closed = { id: 'c9', day: DAY, currency: 'SYP', expected: 1000, counted: 950, note: 'ناقص', closed_at: DAY + 'T18:05:00+03:00', edited_at: DAY + 'T20:10:00+03:00', edit_count: 2, first_counted: 1000 };
    const DSm = load(src).SyDentDaySheet;
    let rcx = DSm.compute(D({ payments: [P(1000, 'نقداً')], closings: [closed] }), DAY);
    ok(rcx.SYP.closing.edit_count === 2 && rcx.SYP.closing.first_counted === 1000 && rcx.SYP.closing.edited_at === closed.edited_at, 'v702 trail: compute carries the DB-stamped edit trail');
    let hx = DSm.renderBody(rcx, DAY, f);
    ok(/ds-close-trail/.test(hx) && /عُدّل هذا الإقفال مرتين/.test(hx) && /آخر تعديل 28\/9\/2026 — \u206608:10 PM\u2069/.test(hx) && /المعدود عند الإقفال الأول: 1000 ل\.س/.test(hx) && /28\/9\/2026 — \u206606:05 PM\u2069/.test(hx), 'v702 trail: the closed block says it was edited, when, and what the first count was — the first closing time stays');
    ok(!/ds-close-trail/.test(DSm.renderBody(DSm.compute(D({ payments: [P(1000, 'نقداً')], closings: [Object.assign({}, closed, { edit_count: 0, edited_at: null, first_counted: null })] }), DAY), DAY, f)), 'v702 trail: an unedited closing shows no trail line');
    ok(DSm.renderClosing && /مرةً واحدة/.test(DSm.renderBody(DSm.compute(D({ payments: [P(1000, 'نقداً')], closings: [Object.assign({}, closed, { edit_count: 1 })] }), DAY), DAY, f)), 'v702 trail: singular wording');
    ref = { v: { ledger_payments: [P(1000, 'نقداً')], day_closings: [closed] } };
    e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY);
    e.M.reopen('SYP'); e.els.dsCounted_SYP.value = '1000'; e.els.dsNote_SYP.value = 'وُجد الفرق'; await e.M.close('SYP');
    ok(e.writes.length === 1 && e.audits.length === 1 && e.audits[0].a === 'day_closing.edit' && e.audits[0].o.entityId === 'cid' && /المعدود من 950 ل\.س إلى 1000 ل\.س/.test(e.audits[0].o.description) && e.audits[0].o.oldValue.counted === 950 && e.audits[0].o.oldValue.note === 'ناقص' && e.audits[0].o.newValue.counted === 1000 && e.toasts.some(t => /عُدّل الإقفال وسُجّل التعديل/.test(t)), 'v702 audit: editing a closing logs old → new');
    const M200b = read('migrations/200_daysheet_methods_and_closing_trail.sql'), SI = read('supabase-init.js'), AL = read('audit-log.html');
    ok(/NEW\.closed_at := OLD\.closed_at;/.test(M200b) && /NEW\.edit_count\s+:= OLD\.edit_count \+ 1;/.test(M200b) && /NEW\.first_counted\s+:= COALESCE\(OLD\.first_counted, OLD\.counted\);/.test(M200b) && /BEFORE INSERT OR UPDATE ON public\.day_closings/.test(M200b) && /IF TG_OP = 'INSERT' THEN\n    NEW\.edited_at := NULL; NEW\.edit_count := 0;/.test(M200b) && /REVOKE ALL ON FUNCTION public\.day_closings_keep_trail\(\) FROM PUBLIC, anon, authenticated;/.test(M200b), 'M200: the trail is stamped by a trigger (client cannot forge it); first closing time never moves; function not callable from the API');
    ok(/'day_closing\.'/.test(SI) && /day_closing: \['day_closing\.create', 'day_closing\.edit'\]/.test(AL) && /day_closing:'إقفال صندوق'/.test(AL) && /<option value="day_closing">إقفال الصندوق<\/option>/.test(AL), 'activity log: closing actions registered, labelled and filterable');

    /* (د) السالب · الطباعة · الصياغة · شريطُ التحكّم */
    const neg = DSm.compute(D({ payments: [P(100, 'نقداً')], payouts: [PO(250, 'cash', DAY + 'T10:00:00+03:00')] }), DAY);
    hx = DSm.renderBody(neg, DAY, f);
    ok(hx.includes('\u2066-150\u2069 ل.س') && !/[^\u2066]-150 ل\.س/.test(hx) && hx.includes('>100 ل.س<') && !hx.includes('\u2066100'), 'v702 negative: the number alone is direction-isolated (minus stays in front); positives untouched');
    ok(!/direction:ltr/.test(src.slice(src.indexOf('function print()'))) && /td\.num\{text-align:left;white-space:nowrap;\}/.test(src), 'v702 print: amounts keep «number then currency» in table rows as in the cards (no forced LTR cell)');
    ref = { v: { ledger_payments: [P(1000, 'نقداً')] } };
    e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY);
    e.M.setMeta({ clinic: 'عيادة <b>الاختبار</b>' }); e.M.print();
    ok(e.opened.length === 1 && /<div class="ds-ph-clinic">عيادة &lt;b&gt;الاختبار&lt;\/b&gt;<\/div>/.test(e.opened[0].html) && /طُبع: \d{1,2}\/\d{1,2}\/\d{4} — \u2066\d{2}:\d{2} (AM|PM)\u2069/.test(e.opened[0].html) && /كشف اليوم — 28\/9\/2026/.test(e.opened[0].html), 'v702 print: clinic name (escaped) + print date AND time in the header');
    e = env(ref); await e.M.mount(host(), mkSb(ref, e), 'DOC', f); await e.M.pick(DAY); e.M.print();
    ok(e.opened.length === 1 && !/ds-ph-clinic"/.test(e.opened[0].html.replace(/<style>[\s\S]*?<\/style>/, '')), 'v702 print: no clinic name known → prints without it (never blocks)');
    const C = DSm.cntAr;
    ok(C(0, 'pay') === 'لا دفعات' && C(1, 'pay') === 'دفعة واحدة' && C(2, 'pay') === 'دفعتان' && C(3, 'pay') === '3 دفعات' && C(10, 'pay') === '10 دفعات' && C(11, 'pay') === '11 دفعة' && C(103, 'sess') === '103 جلسات منجزة' && C(2, 'sess') === 'جلستان منجزتان' && C(12, 'exp') === '12 مصروفاً', 'v702 wording: Arabic counted nouns (one · dual · 3–10 plural · 11+ singular)');
    hx = DSm.renderBody(DSm.compute(D({ sessions: [S(1), S(2), S(3)], payments: [P(1, 'نقداً'), P(2, 'نقداً'), P(3, 'نقداً')], expenses: [E(5, 'cash'), E(6, 'cash')], payouts: [PO(9, 'cash', DAY + 'T10:00:00+03:00')] }), DAY), DAY, f);
    ok(/3 جلسات منجزة/.test(hx) && /3 دفعات/.test(hx) && /مصروفان/.test(hx) && /دفعة واحدة/.test(hx) && !/3 دفعة|3 جلسة|ds-sub">2</.test(hx), 'v702 wording: no «3 دفعة», no bare counts beside the labels');
    const T = DSm.todayYmd(), Y = DSm.shiftYmd(T, -1);
    let sx = DSm.renderSection(T, '');
    ok(new RegExp('max="' + T + '"').test(sx) && /class="ds-qb on" aria-pressed="true" onclick="window\.SyDentDaySheet\.pick\('today'\)"/.test(sx) && /class="ds-qb" aria-pressed="false" onclick="window\.SyDentDaySheet\.pick\('yesterday'\)"/.test(sx), 'v702 controls: «اليوم» lit when today is shown; future dates not offered');
    sx = DSm.renderSection(Y, '');
    ok(/class="ds-qb on" aria-pressed="true" onclick="window\.SyDentDaySheet\.pick\('yesterday'\)"/.test(sx) && /class="ds-qb" aria-pressed="false" onclick="window\.SyDentDaySheet\.pick\('today'\)"/.test(sx), 'v702 controls: «أمس» lit when yesterday is shown');
    ref = { v: {} }; e = env(ref); const hh = host(); await e.M.mount(hh, mkSb(ref, e), 'DOC', f); await e.M.pick(DSm.shiftYmd(T, 5));
    ok(new RegExp('value="' + T + '"').test(hh.innerHTML) && e.toasts.some(t => /لا كشف لتاريخٍ قادم/.test(t)), 'v702 controls: a typed future date falls back to today and says so');
    ok(/\.ds-close-grid \{ grid-template-columns: minmax\(0,1fr\); gap:0; \}/.test(AC) && /\.ds-close-grid > div \{ display:flex; align-items:baseline; justify-content:space-between;/.test(AC) && /\.ds-ctl \{ width:100%; display:grid; grid-template-columns: repeat\(3, minmax\(0,1fr\)\); gap:8px; \}/.test(AC) && /\.ds-qb\.on \{/.test(AC) && /\.ds-flag \{/.test(AC) && /\.ds-close-trail \{/.test(AC), 'v702 css: phone layout for the closed block and the control bar; styles for the lit chip, the flag and the trail');
  }
  function mkSb(ref, env) {
    return { from(t) { const st = { up: null }; const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; }, maybeSingle() { return q; },
      upsert(row, o) { st.up = row; if (env) env.writes.push({ t, up: row, opt: o }); return q; }, single() { return q; },
      then(res) { const spec = ref.v[t]; return Promise.resolve(st.up ? { data: Object.assign({ id: 'cid' }, st.up), error: null } : (spec && spec.error ? spec : { data: spec || [], error: null })).then(res); } }; return q; } };
  }
  await v702Suite(DS_SRC);

  /* الإثباتُ العكسي */
  if (process.argv.includes('--self-test')) {
    const muts = [
      [DS_SRC, "if ((s.status || 'completed') !== 'completed') return;", '', 'planned sessions counted as production'],
      [DS_SRC, "if (mIsCash(k)) cashIn += a;", 'cashIn += a;', 'bank money counted in the drawer'],
      [DS_SRC, "if (mIsCash(kl)) cashOut += a;", "", 'lab payments not taken from the drawer'],
      [DS_SRC, "if (mIsCash(kl)) cashOut += a;", "cashOut += a;", 'bank lab payment taken from the drawer'],
      [DS_SRC, "function mKeyLegacyCash(raw) { return isBlank(raw) ? 'cash' : mKey(raw); }", "function mKeyLegacyCash(raw) { return mKey(raw); }", 'pre-M200 blank lab/refund rows stop counting as cash'],
      [DS_SRC, "if (mIsCash(kr)) cashOut += a;", "cashOut += a;", 'e-wallet refund taken from the drawer'],
      [DS_SRC, "function mKeyOrNone(raw) { return isBlank(raw) ? NONE_KEY : mKey(raw); }", "function mKeyOrNone(raw) { return mKey(raw); }", 'blank method melts back into «other» (no flag)'],
      [DS_SRC, "if (L.noMethod && L.noMethod.count) {", "if (false) {", 'no-method flag not rendered'],
      [DS_SRC, "if (mIsCash(k) && srcOutside(e.cash_source)) {", "if (false) {", 'outside expense deducted from the drawer'],
      [DS_SRC, "if (mIsCash(k) && srcOutside(po.cash_source)) {", "if (false) {", 'outside payout deducted from the drawer'],
      [DS_SRC, "if (mIsCash(kl) && srcOutside(l.cash_source)) {", "if (false) {", 'outside lab payment deducted from the drawer'],
      [DS_SRC, "if (mIsCash(kl) && srcOutside(l.cash_source)) {", "if (srcOutside(l.cash_source)) {", 'stale source on a non-cash lab payment treated as outside cash'],
      [DS_SRC, "if (mIsCash(k) && srcOutside(e.cash_source)) {", "if (srcOutside(e.cash_source)) {", 'stale source on a non-cash expense treated as outside cash'],
      [PM_SRC, "=== 'outside' ? 'outside' : 'drawer'; }", "=== 'outside' ? 'drawer' : 'drawer'; }", 'normSource never returns outside'],
      [PM_SRC, "function sourceForStore(method, source) { return isCash(method) ? normSource(source) : null; }", "function sourceForStore(method, source) { return normSource(source); }", 'non-cash rows get a source (violates M165)'],
      [DS_SRC, "      if (L.net.cash < 0) {", "      if (false) {", 'negative confirm removed'],
      [DS_SRC, "(L.net.cash < 0 ? '<div class=\"ds-close-warn\">", "(false ? '<div class=\"ds-close-warn\">", 'negative warning removed'],
      [DS_SRC, "if (mIsCash(kr)) cashOut += a;", "", 'refunds not taken from the drawer'],
      [DS_SRC, "if (rc(po) !== cur || localDayOf(po.paid_at) !== day) return;", "if (rc(po) !== cur || String(po.paid_at).slice(0,10) !== day) return;", 'payout day taken from UTC not local'],
      [DS_SRC, "if (seq !== _st.seq) return;", '', 'stale load paints over a newer pick'],
      [DS_SRC, "data.payouts = data.payouts.filter(function (po) { return localDayOf(po.paid_at) === day; });", '', 'widened payout window not trimmed'],
      [DS_SRC, "if (core[keys[i]] || !migrationMissing(r.error)) {", 'if (false) {', 'core error swallowed'],
      [PM_SRC, "if (!s) return 'other';", "if (!s) return 'cash';", 'empty method becomes cash'],
      [DS_SRC, "if (!isFinite(counted) || counted < 0) {", "if (!isFinite(counted)) {", 'negative count accepted'],
      [DS_SRC, "expected: L.net.cash, counted: counted,", "expected: counted, counted: counted,", 'expected not a snapshot of the drawer'],
      [DS_SRC, ", { onConflict: 'owner_id,day,currency' })", ")", 'upsert without the day key (duplicates)'],
      [DS_SRC, "  async function close(cur) {\n    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;", "  async function close(cur) {", 'read-only guard removed from close()'],
      [DS_SRC, "if (closedElsewhere || Math.abs(FL.net.cash - L.net.cash) > 0.005) {", "if (false) {", 'v702: closing on a stale expected / over another device\'s closing'],
      [DS_SRC, "if (!fr.ok) {", "if (false) {", 'v702: closing without being able to verify the ledger'],
      [DS_SRC, "    if (!r.ok) return false;", "", 'v702: failed silent refresh replaces the sheet'],
      [DS_SRC, "logClosing(cur, L, counted, note, res.data);", "", 'v702: closing/edit not written to the activity log'],
      [DS_SRC, "(c.edit_count > 0 ? '<div class=\"ds-close-trail\">", "(false ? '<div class=\"ds-close-trail\">", 'v702: edit trail hidden'],
      [DS_SRC, "return s.charAt(0) === '-' ? s.replace(", "return false ? s.replace(", 'v702: negative amount not isolated (trailing minus)'],
      [DS_SRC, "' — \\u2066' + String(hh)", "' — ' + String(hh)", 'v702: closing time not isolated (PM 04:23)'],
      [DS_SRC, "((m >= 3 && m <= 10) ? f[3] : f[4])", "f[4]", 'v702: «3 دفعة» wording back'],
      [DS_SRC, "if (day > todayYmd()) {", "if (false) {", 'v702: future date accepted']
    ];
    let red = 0;
    for (const [base, a, b, name] of muts) {
      if (!base.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try {
        const Wm = base === PM_SRC ? load(DS_SRC, PM_SRC.replace(a, b)) : load(DS_SRC.replace(a, b));
        suite(Wm.SyDentPayMethods, Wm.SyDentDaySheet);
        if (/count accepted|snapshot|day key|guard removed/.test(name)) await closingSuite(base === PM_SRC ? DS_SRC : DS_SRC.replace(a, b));
        if (/negative confirm/.test(name)) await negClosingSuite(DS_SRC.replace(a, b));
        if (/^v702/.test(name)) await v702Suite(DS_SRC.replace(a, b));
        if (/stale|trimmed|swallowed/.test(name)) {
          const M = Wm.SyDentDaySheet;
          const s1 = stub(full); const r1 = await M.load(s1.sb, 'DOC', DAY);
          if (/trimmed/.test(name) && r1.data.payouts.length !== 1) fail++;
          const s2 = stub(Object.assign({}, full, { ledger_payments: { error: { message: 'boom' } } })); const r2 = await M.load(s2.sb, 'DOC', DAY);
          if (/swallowed/.test(name) && r2.ok !== false) fail++;
          if (/stale/.test(name)) {
            const g = {}; const sb3 = { from(t) { const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; }, then(r) { return new Promise(res => { (g[t] = g[t] || []).push(() => res({ data: [] })); }).then(r); } }; return q; } };
            const h3 = { innerHTML: '' }, b3 = { innerHTML: '' };
            const c3 = { window: {}, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, document: { getElementById(id) { return id === 'dsBody' ? b3 : null; } }, setTimeout: (f) => f() };
            vm.createContext(c3); vm.runInContext(PM_SRC + '\n' + DS_SRC.replace(a, b), c3);
            const M3 = c3.window.SyDentDaySheet;
            const q1 = M3.mount(h3, sb3, 'DOC', fmt); const q2 = M3.pick('2026-09-01'); await tick();
            tables.forEach(t => g[t][0]()); await q1;
            if (b3.innerHTML !== '') fail++;
            tables.forEach(t => g[t][1]()); await q2;
          }
        }
      } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت كشف اليوم وطرق الدفع: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
