/* C3c — prover for the shared materials-cost function (mat-cost.js) behind the accounting card and the reports
   «🧪 المواد» tab (#684, #722).
   (1) the accounting formula moved to a shared file: the previous loop is kept here as a fixed reference and compared
       with bag() on 400 random samples — exact equality per currency;
   (2) every breakdown (item · month · treatment · doctor) keeps the per-currency totals of bag();
   (3) rows never ranked by amount (names / dates), «—» for a currency without cost, numeric months (#724), escaped;
   (4) wiring: accounting reads bag() with its own inLocalRange; the reports tab loads lazily behind a sequence guard,
       owner-scoped consume movements only, no writes, and exports what it shows.
   --self-test: mutants that must turn red. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

/* the accounting loop before C3c, verbatim in behaviour (P3-C1 · M125) */
function reference(movs, priceById, keep) {
  const bag = { SYP: 0, USD: 0 };
  movs.forEach(function (m) {
    if (!keep(m)) return;
    const qty = Math.abs(Number(m.change) || 0);
    const it = priceById[m.item_id];
    if (!it) return;
    bag[it.cur] += qty * it.p;
  });
  return bag;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

async function suite(F) {
  let C;
  try { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(F['mat-cost.js'], ctx); C = ctx.window.SyDentMatCost; }
  catch (e) { ok(false, 'mat-cost throws: ' + e.message); return; }
  const curOf = it => (it && it.currency === 'USD') ? 'USD' : 'SYP';
  let same = 0, kept = 0;
  const R = rng(20261012);
  for (let n = 0; n < 400; n++) {
    const items = [];
    const ni = 1 + Math.floor(R() * 8);
    for (let i = 0; i < ni; i++) items.push({ id: 'i' + i, name: 'مادة ' + i, unit: R() < .5 ? 'قطعة' : 'علبة', currency: R() < .4 ? 'USD' : 'SYP',
      purchase_price: R() < .15 ? null : Math.round(R() * 100000) / 100 });
    const movs = [];
    const nm = Math.floor(R() * 40);
    for (let j = 0; j < nm; j++) movs.push({ item_id: R() < .1 ? 'gone' : 'i' + Math.floor(R() * ni), change: -(Math.round(R() * 500) / 100), reason: 'consume',
      created_at: new Date(Date.UTC(2026, Math.floor(R() * 12), 1 + Math.floor(R() * 27), Math.floor(R() * 24))).toISOString(),
      provider_id: R() < .3 ? null : 'd' + Math.floor(R() * 3), ledger_sessions: R() < .3 ? null : { type: ['حشوة', 'زرعة', 'قلع'][Math.floor(R() * 3)] } });
    const prices = C.prices(items, curOf);
    const ref = {}; items.forEach(it => { ref[it.id] = { p: Number(it.purchase_price) || 0, cur: curOf(it) }; });
    const keep = m => m.created_at < '2026-09-01';
    const a = C.bag(movs, prices, keep), b = reference(movs, ref, keep);
    if (a.SYP === b.SYP && a.USD === b.USD) same++;
    const close = (x, y) => Math.abs(x - y) < 1e-6;
    const all = C.bag(movs, prices, null);
    const modes = {
      item: m => m.item_id, month: m => C.monthKey(m.created_at),
      treat: m => (m.ledger_sessions && m.ledger_sessions.type) || '', doc: m => m.provider_id || ''
    };
    if (Object.keys(modes).every(k => {
      const md = C.breakdown(movs, prices, null, modes[k], key => key);
      const sum = md.rows.reduce((s, r) => ({ SYP: s.SYP + r.bag.SYP, USD: s.USD + r.bag.USD }), { SYP: 0, USD: 0 });
      return close(sum.SYP, all.SYP) && close(sum.USD, all.USD) && close(md.total.SYP, all.SYP) && close(md.total.USD, all.USD);
    })) kept++;
  }
  ok(same === 400, 'bag() equals the previous accounting formula on 400 random samples (' + same + '/400)');
  ok(kept === 400, 'every breakdown keeps the per-currency totals (' + kept + '/400)');

  const P = C.prices([{ id: 'a', name: 'زرعة', unit: 'قطعة', purchase_price: 100, currency: 'USD' }, { id: 'b', name: 'بنج', unit: 'كبسولة', purchase_price: 2000, currency: 'SYP' },
    { id: 'c', name: '<كمبوزيت>', unit: 'تطبيق', purchase_price: null, currency: 'SYP' }], curOf);
  const MV = [{ item_id: 'a', change: -1, created_at: '2026-03-10T10:00:00Z' }, { item_id: 'b', change: -5, created_at: '2026-01-10T10:00:00Z' },
    { item_id: 'c', change: -2, created_at: '2026-02-10T10:00:00Z' }, { item_id: 'b', change: 3, reason: 'return', created_at: '2026-02-11T10:00:00Z' }];
  const byItem = C.sortRows(C.breakdown(MV, P, null, m => m.item_id, (k, m, it) => it.name), 'item');
  ok(byItem.rows.map(r => r.label).join(',') === '<كمبوزيت>,بنج,زرعة', 'items by name, never by amount');
  ok(byItem.unpriced === 1 && byItem.total.USD === 100 && byItem.total.SYP === 10000, 'totals per currency; unpriced counted; returns are not consumption');
  const byMonth = C.sortRows(C.breakdown(MV, P, null, m => C.monthKey(m.created_at), k => C.monthLabel(k)), 'month');
  ok(byMonth.rows.map(r => r.label).join(',') === '01/2026,02/2026,03/2026', 'months numeric (#724) and in date order');
  const H = C.render(byItem, { mode: 'item', money: (v, c) => v + ' ' + c });
  ok(H.indexOf('&lt;كمبوزيت&gt;') > -1 && /<span class="n">—<\/span><span class="n"><bdi dir="ltr">100 USD<\/bdi><\/span>/.test(H) && /بلا سعر شراء/.test(H), 'view: escaped, «—» for a currency without cost, unpriced announced');
  const X = C.rows(byItem, 'item');
  ok(X.length === 5 && X[0].length === 5 && X[4][0] === 'المجموع' && X[4][3] === 10000 && X[4][4] === 100, 'Excel rows aligned with totals per currency');

  const ACC = F['accounting.html'];
  const lm = fnSrc(ACC, 'async function loadMaterialCost(from, to) {');
  ok(/materialCostBag = window\.SyDentMatCost\.bag\(movRes\.data, priceById, function\(m\)\{ return inLocalRange\(m\.created_at, from, to\); \}\);/.test(lm), 'accounting: bag() with its own local range');
  ok(/priceById\[it\.id\] = \{ p: Number\(it\.purchase_price\) \|\| 0, cur: _rowCur\(it\) \};/.test(lm) && /\.eq\('reason', 'consume'\)/.test(lm), 'accounting: prices and consume filter unchanged');
  ok(/<script src="mat-cost\.js\?v=/.test(ACC), 'accounting: mat-cost.js loaded');
  const RP = F['provider-reports.html'];
  const ld = fnSrc(RP, 'async function loadMatData(key) {');
  ok(/var seq = \+\+_matSeq;/.test(ld) && /if \(seq !== _matSeq\) return;/.test(ld) && !/\.(insert|update|delete|rpc)\(/.test(ld), 'reports: lazy, sequence-guarded (#705), no writes');
  ok(/\.eq\('owner_id', currentUser\.id\)\.eq\('reason', 'consume'\)/.test(ld) && /inLocalRange\(m\.created_at, from, to\)/.test(ld) && /SyDentMatCost\.prices\(ir\.data \|\| \[\], _rowCur\)/.test(ld), 'reports: owner-scoped consume movements, the same local range and currency reader');
  ok(/data-rpt-tab="mat" onclick="setRptTab\('mat'\)"/.test(RP) && /mat:\s+'/.test(RP) && /if \(rptTab === 'mat'\) return exportMatExcel\(\);/.test(RP), 'reports: tab, subtitle and export wired');
  ok(/_matData = null; renderMat\(\);   \/\/ C3c/.test(RP), 'reports: a new period reloads the tab');
  ok((F['scripts/cache-bust.sh'].match(/mat-cost/g) || []).length === 3, 'cache-bust: mat-cost.js in the fleet allow-list');
}

const FILES = ['mat-cost.js', 'accounting.html', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['signed quantity', rep('mat-cost.js', 'var qty = Math.abs(Number(m.change) || 0);', 'var qty = Number(m.change) || 0;')],
  ['currencies mixed', rep('mat-cost.js', 'b[it.cur] += v;', 'b.SYP += v;')],
  ['breakdown drops a currency', rep('mat-cost.js', 'r.bag[it.cur] += v; total[it.cur] += v;', 'r.bag.SYP += v; total[it.cur] += v;')],
  ['returns counted', rep('mat-cost.js', "if (m.reason && m.reason !== 'consume') return;", '')],
  ['sorted by amount', rep('mat-cost.js', "return String(a.label).localeCompare(String(b.label), 'ar');", 'return (b.bag.SYP + b.bag.USD) - (a.bag.SYP + a.bag.USD);')],
  ['month names', rep('mat-cost.js', "return m ? m[2] + '/' + m[1] : '—';", "return m ? ['كانون الثاني','شباط','آذار'][+m[2] - 1] + ' ' + m[1] : '—';")],
  ['zero shown as a number', rep('mat-cost.js', "return v > 0 ? ltr(money(r2(v), cur)) : '—';", "return ltr(money(r2(v), cur));")],
  ['label unescaped', rep('mat-cost.js', "<b>' + esc(r.label) + '</b>", "<b>' + r.label + '</b>")],
  ['accounting keeps its own loop', rep('accounting.html', "materialCostBag = window.SyDentMatCost.bag(movRes.data, priceById, function(m){ return inLocalRange(m.created_at, from, to); });", "movRes.data.forEach(function(m){ var it = priceById[m.item_id]; if (it) materialCostBag[it.cur] += Math.abs(Number(m.change) || 0) * it.p; });")],
  ['reports without the sequence guard', rep('provider-reports.html', '  if (seq !== _matSeq) return;\n  _matData = d;', '  _matData = d;')],
  ['reports outside the period', rep('provider-reports.html', "d.movs = (mr.data || []).filter(function(m){ return inLocalRange(m.created_at, from, to); });", "d.movs = mr.data || [];")]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0;
      const log = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = log;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-mat-cost: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-mat-cost: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
