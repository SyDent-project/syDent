/* v509 — مثبتُ الاتجاه الشهري (accounting.html: trendMonths · loadTrend · computeTrend · renderTrendSection) — على الملف الحيّ.
   (١) لا معادلةَ ثانية: صفُّ كلِّ شهر ≡ computeSummary/computeAdjustmentTotals على صفوف ذلك الشهر مباشرة، والمصفوفاتُ العامّة تعود كما كانت؛
   (٢) الحفظ: Σ الأشهر ≡ الحسابُ على الاثني عشر شهراً دفعةً واحدة (التوزيعاتُ تُقسَم بمعرّف الدفعة ⇒ تقسيمٌ تامّ)؛
   (٣) التحميل مرآةُ اللوادر: مكتملٌ بتاريخه · التوزيعاتُ بمعرّف الدفعة بمقاطع 150 · الحالاتُ مستقلةٌ عن النافذة · جدولُ التوزيعات الغائب ⇒ [] · خطأٌ حقيقي ⇒ لا اتجاه · مرةٌ واحدة؛
   (٤) الأشهر: 12 منتهيةً بالشهر الحالي، عبر السنة، تسمياتٌ رقمية؛ العرضُ لكل طبقة بعد الأداء حسب الطبيب، خارج حقائق الملخّص.
   --self-test: طفرات لا بدّ أن تحمّر. */
'use strict';
process.env.TZ = 'Asia/Damascus';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const AC = read('accounting.html');
const TODAY = '2026-09-28';

function extractFn(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('missing ' + name);
  let i = src.indexOf('{', m.index), depth = 0, start = m.index;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); } }
  throw new Error('unbalanced ' + name);
}
const FNS = ['isoDate', 'todayISO', 'isMigrationMissing', 'computeSummary', 'computeAdjustmentTotals', 'splitIsEarned', '_rowCur', 'escapeHtml', 'fmtSY', 'fmtPct', 'fmtCurLabel',
             'trendMonths', 'loadTrend', 'computeTrend', 'renderTrendSection', '_pagedAcc'];   // v547: loadTrend مصفّح
function mk(src, sb) {
  const body = FNS.map(n => extractFn(src, n)).join('\n');
  const ctx = { window: { sb }, console: { warn() {} }, Number, String, Date, Array, Object, Promise, Math, isNaN, parseFloat,
    sessions: ['S0'], payments: ['P0'], paymentSplits: ['SP0'], splitSessionStatus: { z: 'planned' }, adjustments: ['A0'],
    currentUser: { id: 'DOC' }, _renderCur: null, curLbl: () => 'ل.س',
    trendData: null, _trendLoaded: false, TREND_MONTHS: 12, TREND_GOALS: { SYP: null, USD: null } };
  vm.createContext(ctx);
  vm.runInContext(body + "\ntodayISO = function(){ return '" + TODAY + "'; };", ctx);
  return ctx;
}
/* ── محاكي Supabase ── */
function stub(spec) {
  const calls = [];
  const sb = { from(t) {
    const c = { table: t, eq: [], in: null, gte: null, lte: null, select: '' }; calls.push(c);
    const q = { select(s) { c.select = s; return q; }, eq(k, v) { c.eq.push([k, v]); return q; }, in(k, v) { c.in = [k, v]; return q; },
      gte(k, v) { c.gte = [k, v]; return q; }, lte(k, v) { c.lte = [k, v]; return q; },
      order(k) { c.order = k; return q; }, range(a, b) { c.range = [a, b]; return q; },   /* v547: _pagedAcc */
      then(r) { const f = spec[t]; const out = typeof f === 'function' ? f(c) : (f || { data: [] }); return Promise.resolve(out).then(r); } };
    return q; } };
  return { calls, sb };
}
const S = (id, cost, date, extra) => Object.assign({ id, cost, date, status: 'completed', currency: 'SYP' }, extra || {});
const P = (id, amount, date, extra) => Object.assign({ id, amount, date, currency: 'SYP' }, extra || {});
const SP = (pid, sid, amount, extra) => Object.assign({ payment_id: pid, session_id: sid, amount, is_unearned: false, currency: 'SYP' }, extra || {});
const ADJ = (kind, amount, date, extra) => Object.assign({ kind, amount, date, currency: 'SYP' }, extra || {});

/* بياناتٌ عبر 12 شهراً */
const DATA = {
  sessions: [S('s1', 1000, '2025-10-05'), S('s2', 300, '2025-10-20'), S('s3', 800, '2026-03-15'), S('s4', 500, '2026-09-27'), S('s5', 900, '2026-09-10', { currency: 'USD' })],
  payments: [P('p1', 600, '2025-10-06'), P('p2', 400, '2025-11-02'), P('p3', 150, '2026-03-16'), P('p4', 200, '2026-09-27'), P('p5', 50, '2026-09-11', { currency: 'USD' }), P('p6', 70, '2026-09-12')],
  splits: [SP('p1', 's1', 600), SP('p2', 's1', 400), SP('p3', 's3', 150), SP('p4', 's4', 100), SP('p4', 'zz', 100), SP('p5', 's5', 50, { currency: 'USD' })],   /* p6 بلا توزيعات ⇒ خام */
  statuses: { s1: 'completed', s3: 'completed', s4: 'completed', s5: 'completed', zz: 'planned' },
  adjustments: [ADJ('discount', 100, '2025-10-30'), ADJ('refund', 20, '2026-03-20'), ADJ('write_off', 50, '2026-09-01')]
};
function spec(over) {
  const base = {
    ledger_sessions: c => c.in ? { data: Object.keys(DATA.statuses).filter(id => c.in[1].includes(id)).map(id => ({ id, status: DATA.statuses[id] })) } : { data: DATA.sessions },
    ledger_payments: { data: DATA.payments },
    account_adjustments: { data: DATA.adjustments },
    payment_splits: c => ({ data: DATA.splits.filter(sp => c.in[1].includes(sp.payment_id)) })
  };
  return Object.assign(base, over || {});
}
/* الحسابُ المباشر بالدوالّ نفسها على مجموعةٍ معطاة */
function direct(ctx, sess, pays, splits, statuses, adj) {
  const c2 = { sessions: sess, payments: pays, paymentSplits: splits, splitSessionStatus: statuses, adjustments: adj, Number };
  vm.createContext(c2);
  vm.runInContext(extractFn(AC, 'computeSummary') + extractFn(AC, 'computeAdjustmentTotals') + extractFn(AC, 'splitIsEarned') + '\nthis.__s = computeSummary(); this.__a = computeAdjustmentTotals();', c2);
  return { s: c2.__s, a: c2.__a };
}

async function suite(src) {
  /* (٤) الأشهر */
  const c0 = mk(src, stub(spec()).sb);
  const months = c0.trendMonths(TODAY);
  ok(months.length === 12 && months[0].ym === '2025-10' && months[11].ym === '2026-09' && months[0].from === '2025-10-01' && months[0].to === '2025-10-31' && months[11].to === '2026-09-30', 'trendMonths: 12 months ending this month, crossing the year');
  ok(months[4].ym === '2026-02' && months[4].to === '2026-02-28' && months.every(m => /^\d{1,2}\/\d{2}$/.test(m.label)) && months[11].label === '9/26', 'trendMonths: month-end clipping + numeric labels (no month names)');
  ok(c0.trendMonths('2026-01-15')[0].ym === '2025-02' && c0.trendMonths('2026-01-15')[11].ym === '2026-01', 'trendMonths: January window');

  /* (٣) التحميل */
  const st = stub(spec()); const ctx = mk(src, st.sb);
  await ctx.loadTrend();
  ok(ctx._trendLoaded === true && ctx.trendData && ctx.trendData.sessions.length === 5 && ctx.trendData.payments.length === 6 && ctx.trendData.splits.length === 6 && ctx.trendData.statuses.zz === 'planned', 'loadTrend: loads sessions/payments/splits/statuses/adjustments');
  const sessCall = st.calls.find(c => c.table === 'ledger_sessions' && !c.in);
  ok(sessCall.eq.some(e => e.join() === 'doctor_id,DOC') && sessCall.eq.some(e => e.join() === 'status,completed') && sessCall.gte[1] === '2025-10-01' && sessCall.lte[1] === TODAY, 'loadTrend: sessions completed, doctor-scoped, 12-month window (mirror of loadSessions)');
  const payCall = st.calls.find(c => c.table === 'ledger_payments');
  ok(payCall.gte[0] === 'date' && payCall.gte[1] === '2025-10-01' && payCall.lte[1] === TODAY, 'loadTrend: payments by date window');
  const spCall = st.calls.find(c => c.table === 'payment_splits');
  ok(spCall && spCall.in[0] === 'payment_id' && spCall.eq.some(e => e.join() === 'doctor_id,DOC') && /is_unearned/.test(spCall.select) && /session_id/.test(spCall.select), 'loadTrend: splits by payment_id (not by date), doctor-scoped (mirror of loadPaymentSplits)');
  const stCall = st.calls.find(c => c.table === 'ledger_sessions' && c.in);
  ok(stCall && stCall.in[0] === 'id' && stCall.in[1].includes('zz') && /status/.test(stCall.select), 'loadTrend: statuses fetched for every split session, including ones outside the window');
  /* مقاطعُ 150 */
  const many = Array.from({ length: 320 }, (_, i) => P('q' + i, 1, '2026-09-01'));
  const st2 = stub(spec({ ledger_payments: { data: many }, payment_splits: c => ({ data: c.in[1].map(pid => SP(pid, null, 1, { is_unearned: true })) }) }));
  const ctx2 = mk(src, st2.sb); await ctx2.loadTrend();
  const spCalls = st2.calls.filter(c => c.table === 'payment_splits');
  ok(spCalls.length === 3 && spCalls.every(c => c.in[1].length <= 150) && ctx2.trendData.splits.length === 320, 'loadTrend: splits chunked by 150, all collected');
  await ctx2.loadTrend();
  ok(st2.calls.filter(c => c.table === 'ledger_payments').length === 1, 'loadTrend: loads once (cached across applies)');
  const st3 = stub(spec({ payment_splits: { error: { code: '42P01', message: 'relation does not exist' } } })); const ctx3 = mk(src, st3.sb); await ctx3.loadTrend();
  ok(ctx3.trendData && ctx3.trendData.splits.length === 0, 'loadTrend: pre-Migration-3 (no splits table) → raw payments are the source');
  const st4 = stub(spec({ payment_splits: { error: { message: 'network' } } })); const ctx4 = mk(src, st4.sb); await ctx4.loadTrend();
  ok(ctx4.trendData === null && ctx4._trendLoaded === false && ctx4.renderTrendSection('SYP') === '', 'loadTrend: real splits error → no trend, no section, retry next apply');
  const st5 = stub(spec({ ledger_payments: { error: { message: 'boom' } } })); const ctx5 = mk(src, st5.sb); await ctx5.loadTrend();
  ok(ctx5.trendData === null && ctx5.renderTrendSection('SYP') === '', 'loadTrend: core error → nothing');
  const st6 = stub(spec({ account_adjustments: { error: { code: '42P01' } } })); const ctx6 = mk(src, st6.sb); await ctx6.loadTrend();
  ok(ctx6.trendData && ctx6.trendData.adjustments.length === 0, 'loadTrend: missing adjustments table tolerated');

  /* (١) لا معادلةَ ثانية + إرجاعُ السياق */
  const rows = ctx.computeTrend('SYP');
  ok(rows.length === 12 && rows[0].ym === '2025-10' && rows[11].ym === '2026-09', 'computeTrend: one row per month');
  ok(ctx.sessions[0] === 'S0' && ctx.payments[0] === 'P0' && ctx.paymentSplits[0] === 'SP0' && ctx.splitSessionStatus.z === 'planned' && ctx.adjustments[0] === 'A0', 'computeTrend: page globals restored byte-for-byte');
  const oct = rows[0], mar = rows[5], sep = rows[11], nov = rows[1];
  const dOct = direct(ctx, [DATA.sessions[0], DATA.sessions[1]], [DATA.payments[0]], [DATA.splits[0]], DATA.statuses, [DATA.adjustments[0]]);
  ok(oct.production === dOct.s.production && oct.revenue === dOct.s.revenue && oct.netProduction === dOct.s.production - dOct.a.chargeReductions, 'October ≡ direct computeSummary on October rows (1300 · 600 · net 1200)');
  ok(oct.production === 1300 && oct.revenue === 600 && oct.netProduction === 1200 && Math.abs(oct.collectionRate - 50) < 1e-9, 'October values');
  ok(nov.production === 0 && nov.revenue === 400 && nov.collectionRate === null, 'November: payment allocated to an October session counts as November collection (cash basis); no production → rate null');
  ok(mar.production === 800 && mar.revenue === 150 && mar.netProduction === 800, 'March: refund does not reduce production; revenue is earned splits');
  ok(sep.production === 500 && sep.revenue === 100 + 70 && sep.netProduction === 450, 'September: unearned split on planned session excluded; split-less payment counted raw; write-off nets production');
  const usd = ctx.computeTrend('USD');
  ok(usd[11].production === 900 && usd[11].revenue === 50 && usd[0].production === 0 && rows.every(r => r.ym !== undefined), 'USD layer isolated (no cross-currency sums)');
  /* (٢) الحفظ */
  const sumP = rows.reduce((a, r) => a + r.production, 0), sumR = rows.reduce((a, r) => a + r.revenue, 0);
  const all = direct(ctx, DATA.sessions.filter(s => s.currency !== 'USD'), DATA.payments.filter(p => p.currency !== 'USD'), DATA.splits.filter(s => s.currency !== 'USD'), DATA.statuses, DATA.adjustments);
  ok(Math.abs(sumP - all.s.production) < 1e-9 && Math.abs(sumR - all.s.revenue) < 1e-9, 'conservation: Σ months ≡ one 12-month computeSummary');
  /* عشوائيات: مرآةٌ شهراً بشهر + حفظ */
  let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  let mism = 0;
  for (let t = 0; t < 25; t++) {
    const ms = ctx.trendMonths(TODAY); const D2 = { sessions: [], payments: [], splits: [], statuses: {}, adjustments: [] };
    let n = 0;
    ms.forEach(m => { for (let i = 0; i < 3; i++) { const id = 's' + (++n); const planned = rnd() < 0.2; D2.sessions.push(S(id, Math.round(rnd() * 900), m.from.slice(0, 8) + String(1 + Math.floor(rnd() * 27)).padStart(2, '0'), { status: planned ? 'planned' : 'completed', currency: rnd() < 0.3 ? 'USD' : 'SYP' })); D2.statuses[id] = planned ? 'planned' : 'completed'; } });
    ms.forEach(m => { for (let i = 0; i < 2; i++) { const id = 'p' + (++n); const cur = rnd() < 0.3 ? 'USD' : 'SYP'; D2.payments.push(P(id, Math.round(rnd() * 500), m.from.slice(0, 8) + String(1 + Math.floor(rnd() * 27)).padStart(2, '0'), { currency: cur }));
      if (rnd() < 0.7) { const tgt = D2.sessions[Math.floor(rnd() * D2.sessions.length)]; D2.splits.push(SP(id, tgt.id, Math.round(rnd() * 300), { currency: cur, is_unearned: rnd() < 0.2 })); } } });
    ms.forEach(m => { if (rnd() < 0.4) D2.adjustments.push(ADJ(['discount', 'write_off', 'refund'][Math.floor(rnd() * 3)], Math.round(rnd() * 80), m.from, { currency: rnd() < 0.3 ? 'USD' : 'SYP' })); });
    const cx = mk(src, null); cx.trendData = { months: ms, sessions: D2.sessions.filter(s => s.status === 'completed'), payments: D2.payments, splits: D2.splits, statuses: D2.statuses, adjustments: D2.adjustments };
    ['SYP', 'USD'].forEach(cur => {
      const rs = cx.computeTrend(cur);
      ms.forEach((m, i) => {
        const inM = r => r.date >= m.from && r.date <= m.to;
        const sess = D2.sessions.filter(s => s.status === 'completed' && s.currency === cur && inM(s)), pays = D2.payments.filter(p => p.currency === cur && inM(p));
        const pid = new Set(pays.map(p => p.id)); const spl = D2.splits.filter(sp => sp.currency === cur && pid.has(sp.payment_id));
        const d = direct(cx, sess, pays, spl, D2.statuses, D2.adjustments.filter(a => a.currency === cur && inM(a)));
        if (Math.abs(rs[i].production - d.s.production) > 1e-9 || Math.abs(rs[i].revenue - d.s.revenue) > 1e-9 || Math.abs(rs[i].netProduction - (d.s.production - d.a.chargeReductions)) > 1e-9) mism++;
      });
      const tot = direct(cx, D2.sessions.filter(s => s.status === 'completed' && s.currency === cur), D2.payments.filter(p => p.currency === cur), D2.splits.filter(sp => sp.currency === cur), D2.statuses, D2.adjustments.filter(a => a.currency === cur));
      if (Math.abs(rs.reduce((a, r) => a + r.production, 0) - tot.s.production) > 1e-9 || Math.abs(rs.reduce((a, r) => a + r.revenue, 0) - tot.s.revenue) > 1e-9) mism++;
    });
    if (cx.sessions[0] !== 'S0') mism++;
  }
  ok(mism === 0, 'random: 25 datasets × 2 currencies × 12 months mirror direct computeSummary + conservation + globals restored');

  /* العرض */
  const html = ctx.renderTrendSection('SYP');
  ok(/^<details class="section tr-section" data-tr-cur="SYP">\s*<summary><h2>/.test(html) && !/<details[^>]*open/.test(html) && /<\/details>$/.test(html) && /<th class="num">الإنتاج<\/th><th class="num">التحصيل<\/th><th class="num">نسبة التحصيل<\/th>/.test(html) && /table\.providers td\.num, table\.providers th\.num \{/.test(src), 'render: collapsed <details> with a summary heading; numeric headers aligned with their cells (th.num)');
  ok(/tr-section/.test(html) && /data-tr-cur="SYP"/.test(html) && (html.match(/<rect /g) || []).length === 24 && (html.match(/<tr><td>/g) || []).length === 12, 'render: 12 months × 2 bars + 12 table rows');
  ok(/9\/26/.test(html) && /حتى اليوم/.test(html) && /1,300 /.test(html) && /50\.0%/.test(html), 'render: numeric labels, partial-month tag, formatted amounts and rate');
  ok(/class="tbl-wrap"><svg/.test(html) && !/preserveAspectRatio/.test(html) && /min-width:560px/.test(src), 'render: chart scrolls inside its own container on narrow screens (#675)');
  ok(/'كانون الثاني'/.test(html) === false && !/toLocaleDateString/.test(extractFn(src, 'renderTrendSection')), 'render: no month names, no locale date formatter (check-sydt contract)');
  /* v521: خطُّ الهدف (M159) */
  ok(!/tr-goal/.test(html) && !/من الهدف/.test(html), 'goal: no goal → no line, no column (layout unchanged)');
  ctx.TREND_GOALS = { SYP: 1000, USD: null };
  const hg = ctx.renderTrendSection('SYP');
  ctx.TREND_GOALS = { SYP: null, USD: null };
  const gl = (hg.match(/<line class="tr-goal"[^>]*>/) || [''])[0];
  ok(/stroke="var\(--orange\)"/.test(gl) && /stroke-dasharray/.test(gl) && /y1="([\d.]+)" y2="\1"/.test(gl), 'goal: one dashed horizontal line in theme orange');
  const yG = +(gl.match(/y1="([\d.]+)"/) || [0, -1])[1];
  ok(yG > 14 && yG < 194, 'goal: line inside the plot (max rescaled to include the goal)');
  ok(/<th class="num">الإنتاج<\/th><th class="num">من الهدف<\/th><th class="num">التحصيل<\/th>/.test(hg) && (hg.match(/<tr><td>/g) || []).length === 12, 'goal: "من الهدف" column after production, 12 rows');
  ok(/tr-hit">✅ 130\.0%/.test(hg) && /الهدف الشهري 1,000 /.test(hg) && /الحالي/.test(hg), 'goal: month at 1,300 of 1,000 → ✅ 130% highlighted; legend with the goal; note says current goal applies to all months');
  { const keepTD = ctx.trendData, re = r => Object.assign({}, r, { currency: 'USD' });
    ctx.trendData = Object.assign({}, keepTD, { sessions: keepTD.sessions.map(re), payments: keepTD.payments.map(re), splits: keepTD.splits.map(re), adjustments: keepTD.adjustments.map(re) });
    ctx.TREND_GOALS = { SYP: 1000, USD: null }; const hU = ctx.renderTrendSection('USD');
    ctx.TREND_GOALS = { SYP: null, USD: 1000 }; const hU2 = ctx.renderTrendSection('USD');
    ctx.trendData = keepTD; ctx.TREND_GOALS = { SYP: null, USD: null };
    ok(hU && !/tr-goal/.test(hU) && /tr-goal/.test(hU2), 'goal: per currency — a SYP goal never draws on the USD layer, the USD goal does'); }
  ctx.TREND_GOALS = { SYP: 5000, USD: null };
  const hBig = ctx.renderTrendSection('SYP'); ctx.TREND_GOALS = { SYP: null, USD: null };
  const yBig = +((hBig.match(/<line class="tr-goal"[^>]*y1="([\d.-]+)"/) || [0, -99])[1]);
  ok(yBig >= 14 && yBig < 20 && /tr-rate">26\.0%/.test(hBig), 'goal above every month → line at the top of the plot (scale includes it), 1,300/5,000 = 26%');
  const cxE = mk(src, null); cxE.trendData = { months: ctx.trendMonths(TODAY), sessions: [], payments: [], splits: [], statuses: {}, adjustments: [] };
  ok(cxE.renderTrendSection('SYP') === '', 'render: no movement in 12 months → no section');
  /* الربطُ بالصفحة */
  ok(/loadTrend\(\),/.test(extractFn(src, 'loadAllInRange')), 'accounting: loadTrend runs with the loaders');
  ok(/\.select\('production_goal_syp, production_goal_usd'\)\.eq\('owner_id', currentUser\.id\)\.maybeSingle\(\)\);/.test(src) && /var csG = _accT\(await _csGP\);/.test(src)   /* v557: نداؤه المنفصل يُطلَق مع المرجعية */ && /TREND_GOALS = \{ SYP: \(_gS > 0\) \? _gS : null, USD: \(_gU > 0\) \? _gU : null \};/.test(src), 'accounting: goals read once in their own guarded call (M159), zero/empty → no goal');
  const r = extractFn(src, 'render');
  ok(/html \+= renderProviderSection\(L\.providerRows\);\n\s*html \+= renderTrendSection\(cur\);/.test(r), 'accounting: trend rendered per currency layer right after the provider section');
  ok(!/trend/i.test(extractFn(src, 'buildDigestFactsAllLayers')) && !/trend/i.test(extractFn(src, 'renderUnifiedReportCard')), 'accounting: trend stays out of AI digest facts and unified card');
  ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(extractFn(src, 'loadTrend') + extractFn(src, 'computeTrend') + extractFn(src, 'renderTrendSection')), 'trend: zero DB writes');
}

(async () => {
  await suite(AC);
  if (process.argv.includes('--self-test')) {
    const muts = [
      ["var goal = (TREND_GOALS && TREND_GOALS[cur] > 0) ? TREND_GOALS[cur] : null;", "var goal = (TREND_GOALS && TREND_GOALS.SYP > 0) ? TREND_GOALS.SYP : null;", 'goal not per currency'],
      ["var max = goal || 0; rows.forEach", "var max = 0; rows.forEach", 'goal outside the plot scale'],
      ["paymentSplits = td.splits.filter(function (sp) { return _rowCur(sp) === cur && pidSet[sp.payment_id]; });", "paymentSplits = td.splits.filter(function (sp) { return _rowCur(sp) === cur; });", 'splits not partitioned by payment id (double counting)'],
      ["sessions = keep.sessions; payments = keep.payments; paymentSplits = keep.paymentSplits;", "", 'page globals not restored'],
      [".eq('status', 'completed').gte('date', from).lte('date', to); }),\n      _pagedAcc(function(){ return window.sb.from('ledger_payments')", ".gte('date', from).lte('date', to); }),\n      _pagedAcc(function(){ return window.sb.from('ledger_payments')", 'planned sessions loaded as production'],
      ["sessions = td.sessions.filter(function (r) { return _rowCur(r) === cur && inM(r, m); });", "sessions = td.sessions.filter(function (r) { return inM(r, m); });", 'currencies mixed'],
      ["var netProduction = s.production - adj.chargeReductions;", "var netProduction = s.production;", 'write-offs ignored in the rate denominator'],
      ["if (missing) { tSplits = []; break; }", "if (true) { tSplits = []; break; }", 'real splits error silently becomes raw payments'],
      ["if (_trendLoaded) return;", "", 'reloads on every apply'],
      ["mm = ((mm % 12) + 12) % 12;", "mm = mm % 12;", 'year rollover broken'],
      ["for (var c2 = 0; c2 < sids.length; c2 += CHUNK) {", "for (var c2 = 0; c2 < 0; c2 += CHUNK) {", 'split session statuses never fetched (planned money counted as earned)']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!AC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { await suite(AC.replace(a, b)); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت الاتجاه الشهري: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
