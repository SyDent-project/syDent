/* v573 — مثبتُ كلفة المواد الموحَّدة (mat-cost.js + المحاسبة + تبويب «🧪 المواد») — مستقل، على الملفات الحيّة.
   (١) الحفظ (#684): على 400 مجموعة بيانات عشوائية، bag من mat-cost.js = معادلةُ المحاسبة السابقة حرفياً (مرجعٌ مثبَّت هنا)،
       وكلُّ تفصيلٍ يحفظ المجموع: Σ الأصناف = Σ العلاجات = Σ الأطباء = bag لكل عملة — بلا جمعٍ بين عملتين;
   (٢) الدلالة: غيرُ consume والخارجُ عن الفترة والصنفُ المجهول خارجون · الأشهر · الجلساتُ المميَّزة · «بلا جلسة»;
   (٣) العرض: مهرَّب · النسبُ معزولة LTR (#704) · الغائبُ «—» (#703) · الفترةُ الفارغة رسالة;
   (٤) الربط: المحاسبةُ تستدعي الدالّة ولا حلقةَ محلية · التبويبُ كسولٌ بحارس تسلسل ومصفّح ومقصوصٌ محلياً ومحصورٌ بنطاق الطبيب.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

/* مرجعٌ ثابت: معادلةُ loadMaterialCost قبل التوحيد (P3-C1 · M125) — للمقارنة فقط */
function oracle(items, movs, from, to, inRange) {
  const price = {}; items.forEach(it => { price[it.id] = { p: Number(it.purchase_price) || 0, cur: (it && it.currency === 'USD') ? 'USD' : 'SYP' }; });
  const bag = { SYP: 0, USD: 0 };
  movs.forEach(m => { if (!inRange(m.created_at, from, to)) return; const q = Math.abs(Number(m.change) || 0); const it = price[m.item_id]; if (!it) return; bag[it.cur] += q * it.p; });
  return bag;
}
function inRange(ts, from, to) {
  const d = new Date(ts); if (isNaN(d.getTime())) return false;
  const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return k >= from && k <= to;
}
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

async function suite(F) {
  let C;
  try { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(F['mat-cost.js'], ctx); C = ctx.window.SyDentMatCost; }
  catch (e) { ok(false, 'mat-cost throws: ' + e.message); return; }
  seed = 7;
  let same = true, cons = true;
  for (let t = 0; t < 400 && same && cons; t++) {
    const items = [], movs = [];
    const ni = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < ni; i++) items.push({ id: 'i' + i, name: 'صنف' + i, purchase_price: rnd() < 0.15 ? null : Math.round(rnd() * 50000) / 100, currency: rnd() < 0.3 ? 'USD' : (rnd() < 0.1 ? null : 'SYP') });
    const nm = Math.floor(rnd() * 40);
    for (let k = 0; k < nm; k++) {
      const day = 1 + Math.floor(rnd() * 90);
      movs.push({ item_id: 'i' + Math.floor(rnd() * (ni + 1)), change: -Math.round(rnd() * 500) / 100, reason: 'consume',
        created_at: new Date(Date.UTC(2026, 6, day, Math.floor(rnd() * 24))).toISOString(),
        session_id: rnd() < 0.7 ? 's' + Math.floor(rnd() * 5) : null, session: rnd() < 0.7 ? { type: rnd() < 0.5 ? 'حشوة' : 'زرعة' } : null,
        provider_id: rnd() < 0.6 ? 'd' + Math.floor(rnd() * 3) : null });
    }
    const from = '2026-07-15', to = '2026-09-10';
    const a = oracle(items, movs, from, to, inRange), b = C.cost(items, movs, from, to, inRange);
    if (a.SYP !== b.bag.SYP || a.USD !== b.bag.USD) same = false;
    ['SYP', 'USD'].forEach(c => {
      const si = b.byItem.filter(x => x.cur === c).reduce((s, x) => s + x.cost, 0);
      const st = b.byTreatment.reduce((s, x) => s + x.bag[c], 0);
      const sp = b.byProvider.reduce((s, x) => s + x.bag[c], 0);
      if (Math.abs(si - b.bag[c]) > 0.05 || Math.abs(st - b.bag[c]) > 0.05 || Math.abs(sp - b.bag[c]) > 0.05) cons = false;
    });
  }
  ok(same, 'bag = the previous accounting formula, exactly, on 400 random datasets (#684)');
  ok(cons, 'every breakdown keeps the total per currency (items · treatments · doctors)');

  const items = [{ id: 'a', name: 'زرعة <x>', unit: 'قطعة', purchase_price: 100, currency: 'USD' }, { id: 'b', name: 'بنج', unit: '', purchase_price: 2000, currency: 'SYP' }];
  const movs = [
    { item_id: 'a', change: -1, reason: 'consume', created_at: '2026-08-02T10:00:00Z', session_id: 's1', session: { type: 'زرعة' }, provider_id: 'd1' },
    { item_id: 'a', change: -1, reason: 'consume', created_at: '2026-09-03T10:00:00Z', session_id: 's2', session: { type: 'زرعة' }, provider_id: 'd1' },
    { item_id: 'b', change: -3, reason: 'consume', created_at: '2026-09-04T10:00:00Z', session_id: 's2', session: { type: 'زرعة' }, provider_id: 'd1' },
    { item_id: 'b', change: -1, reason: 'consume', created_at: '2026-09-05T10:00:00Z', session_id: null, provider_id: null },
    { item_id: 'b', change: -5, reason: 'adjust', created_at: '2026-09-05T10:00:00Z' },
    { item_id: 'b', change: -5, reason: 'consume', created_at: '2026-10-05T10:00:00Z' },
    { item_id: 'zz', change: -5, reason: 'consume', created_at: '2026-09-05T10:00:00Z' }];
  const m = C.cost(items, movs, '2026-08-01', '2026-09-30', inRange);
  ok(m.count === 4 && m.bag.USD === 200 && m.bag.SYP === 8000, 'non-consume, out-of-range and unknown items left out');
  ok(m.months.join(',') === '2026-08,2026-09' && m.byMonth['2026-09'].a === 1 && m.byMonth['2026-09'].b === 4, 'monthly quantities per item');
  const tz = m.byTreatment.find(x => x.key === 'زرعة'), tu = m.byTreatment.find(x => x.key === '');
  ok(tz && tz.sessions === 2 && tz.bag.USD === 200 && tz.bag.SYP === 6000 && tu && tu.bag.SYP === 2000 && m.byTreatment[m.byTreatment.length - 1].key === '', 'by treatment: distinct sessions, unlinked last');
  ok(m.byProvider[0].id === 'd1' && m.byProvider[m.byProvider.length - 1].id === '', 'by doctor: unassigned last');
  const h = C.render(m, { money: (n, c) => n + ' ' + c, docName: () => 'د. <ع>' });
  ok(h.indexOf('زرعة &lt;x&gt;') > -1 && h.indexOf('د. &lt;ع&gt;') > -1 && h.indexOf('<x>') === -1, 'render escaped');
  ok(/<bdi dir="ltr">100%<\/bdi>/.test(h) && /بلا جلسة/.test(h) && /بلا طبيب محدّد/.test(h), 'render: shares isolated LTR, unlinked named');
  ok(/200 USD/.test(h) && /8000 SYP/.test(h) && !/8200/.test(h), 'render: currencies never summed together');
  ok(/class="empty-state"/.test(C.render(C.cost(items, [], '2026-01-01', '2026-01-02', inRange), { money: String, docName: String })), 'empty period message');
  const xr = C.xlsxRows(m);
  ok(xr.length === 2 && xr[0].length === C.XLSX_HEADERS.length, 'Excel rows aligned');
  ok(C.monthLabel('2026-09') === '09/2026', 'months numeric (v487: dates are numbers only)');

  const ACC = F['accounting.html'], PR = F['provider-reports.html'];
  const lm = fnSrc(ACC, 'async function loadMaterialCost(from, to) {');
  ok(/materialCostBag = window\.SyDentMatCost\.cost\(itemsRes\.data, movRes\.data, from, to, inLocalRange\)\.bag;/.test(lm) && !/materialCostBag\[[^\]]+\] \+=/.test(lm), 'accounting: the shared function, no local formula');
  ok(/\.eq\('reason', 'consume'\)/.test(lm), 'accounting: consume only (unchanged query)');
  const ld = fnSrc(PR, 'async function loadMatData(key) {'), rm = fnSrc(PR, 'function renderMat() {');
  ok(/var seq = \+\+_matSeq;/.test(ld) && /if \(seq === _matSeq\) renderMat\(\);/.test(ld), 'reports: lazy with a sequence guard (#705)');
  ok((ld.match(/_fetchAllPR\(/g) || []).length === 2 && /widenStartUtc\(from\)/.test(ld) && /\.eq\('reason', 'consume'\)/.test(ld), 'reports: paged, widened window, consume only');
  ok(/window\.SyDentMatCost\.cost\(_matData\.items, movs, from, to, inLocalRange\)/.test(rm), 'reports: same function, same local range');
  ok(/var movs = clinic \? _matData\.movs : _matData\.movs\.filter\(function\(m\)\{ return inScope\(m\.provider_id\); \}\);/.test(rm), 'reports: doctor scope respected (doctor mode / provider filter)');
  ok(/mat:\s+'المواد:/.test(PR) && /data-rpt-tab="mat" onclick="setRptTab\('mat'\)"/.test(PR) && /renderSum\(\);     \/\/ v545\n  _matData = null;[^\n]*\n  renderMat\(\);/.test(PR), 'reports: tab registered and reset with the period');
  [['accounting.html', 'sidebar.js'], ['provider-reports.html', 'rpt-sum.js']].forEach(([f, after]) => {
    const S = F[f], iA = S.indexOf('<script src="' + after + '?v='), iM = S.indexOf('<script src="mat-cost.js?v=');
    ok(iM > iA && (S.match(/mat-cost\.js\?v=/g) || []).length === 1, f + ': mat-cost.js loaded once');
  });
  ok((F['scripts/cache-bust.sh'].match(/mat-cost/g) || []).length === 3, 'cache-bust: mat-cost.js in the fleet');
}

const FILES = ['mat-cost.js', 'accounting.html', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['adjustments counted as cost', rep('mat-cost.js', "if (m.reason && m.reason !== 'consume') return;", '')],
  ['unknown item counted', rep('mat-cost.js', "if (!it) return;                                     // صنفٌ مجهول — كما بالمحاسبة", "if (!it) it = { purchase_price: 1 };")],
  ['rounded per movement', rep('mat-cost.js', 'var qty = Math.abs(num(m.change)), cur = curOf(it), c = qty * num(it.purchase_price);', 'var qty = Math.abs(num(m.change)), cur = curOf(it), c = Math.round(qty * num(it.purchase_price));')],
  ['currencies mixed', rep('mat-cost.js', "function curOf(it) { return (it && it.currency === 'USD') ? 'USD' : 'SYP'; }", "function curOf(it) { return 'SYP'; }")],
  ['treatment breakdown leaks', rep('mat-cost.js', 'bt.bag[cur] += c;', 'bt.bag[cur] += c / 2;')],
  ['share not isolated', rep('mat-cost.js', "return '<bdi dir=\"ltr\">' + Math.round(num(part) / num(total) * 100) + '%</bdi>';", "return Math.round(num(part) / num(total) * 100) + '%';")],
  ['render unescaped', rep('mat-cost.js', "'<tr><td><strong>' + esc(x.name) + '</strong></td><td style=\"white-space:nowrap;\">'", "'<tr><td><strong>' + x.name + '</strong></td><td style=\"white-space:nowrap;\">'")],
  ['accounting keeps its own loop', rep('accounting.html', "    materialCostBag = window.SyDentMatCost.cost(itemsRes.data, movRes.data, from, to, inLocalRange).bag;", "    movRes.data.forEach(function(m){ materialCostBag[_rowCur(m)] += 0; });")],
  ['reports ignore the doctor scope', rep('provider-reports.html', 'var movs = clinic ? _matData.movs : _matData.movs.filter(function(m){ return inScope(m.provider_id); });', 'var movs = _matData.movs;')],
  ['reports without the sequence guard', rep('provider-reports.html', '  if (seq === _matSeq) renderMat();', '  renderMat();')]
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
