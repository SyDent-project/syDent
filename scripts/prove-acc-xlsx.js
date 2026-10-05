/* v546 — مثبتُ تصدير المحاسبة إلى Excel (supabase-init.js SyDentXlsx.save بأوراق + accounting.html buildAccSheets) — مستقل.
   (١) save: الورقةُ الواحدة كما كانت حرفياً · عدّةُ أوراق بأسماءٍ منظّفة (≤31 · بلا \ / ? * [ ] :) وغيرِ مكرّرة · الأعمدة · RTL ·
       الاحتياطُ النصّي: ورقةٌ واحدة بلا عناوين (كما كان)، والعدّةُ متتاليةٌ بعناوينها;
   (٢) buildAccSheets يرتّب ولا يحسب (#684): كلُّ قيمةٍ من طبقات computeLayersByCurrency/computeTrend/agingResult كما هي،
       موسومةً بعملتها؛ البنودُ الشرطية كما بالبطاقات؛ الخسارةُ باسمها؛ النسبةُ من المصروفات؛ الفترةُ المطبَّقة لا حقلا التاريخ;
   (٣) الربط: الزرّ والمستمع والحارس أثناء التحميل. --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  /* (١) save */
  const I = F['supabase-init.js'];
  const a = I.indexOf('    function sheetName(n, used) {'), b = I.indexOf('    window.SyDentXlsx = {', a);
  ok(a > -1 && b > a, 'save: multi-sheet support present in the shared exporter');
  const log = { sheets: [], files: [], blobs: [] };
  const fakeX = { utils: { book_new: () => ({ s: [] }), aoa_to_sheet: aoa => ({ aoa }), book_append_sheet: (wb, ws, n) => { wb.s.push({ n, ws }); log.sheets.push(n); } },
    writeFile: (wb, f) => { log.files.push({ f, wb }); } };
  const mk = (throws) => {
    const c = { console: { warn() {} }, Blob: function (p) { this.p = p; }, Promise, Array, String };
    c.window = c;
    vm.createContext(c);
    vm.runInContext('function today(){return "2026-09-30";}\nfunction tsvCell(v){ if (v===null||v===undefined) return ""; return String(v).replace(/[\\t\\r\\n]+/g," "); }\n'
      + 'function download(blob, name){ window.__dl = { text: blob.p[0], name: name }; }\n'
      + 'async function load(){ ' + (throws ? 'throw new Error("no lib");' : 'return window.__X;') + ' }\n' + I.slice(a, b), c);
    c.__X = fakeX;
    return c;
  };
  let c = mk(false);
  let k = await c.save({ headers: ['h'], rows: [[1]], sheetName: 'ورقتي', filename: 'f', cols: [{ wch: 5 }] });
  const wb1 = log.files[0].wb;
  ok(k === 'xlsx' && wb1.s.length === 1 && wb1.s[0].n === 'ورقتي' && JSON.stringify(wb1.s[0].ws.aoa) === '[["h"],[1]]' && wb1.s[0].ws['!cols'][0].wch === 5 && wb1.Workbook.Views[0].RTL === true && log.files[0].f === 'f.xlsx', 'single sheet exactly as before (name · rows · cols · RTL · file)');
  k = await c.save({ filename: 'm', sheets: [{ name: 'الملخّص', headers: ['a'], rows: [[1]] }, { name: 'a/b?c*d[e]:f' + 'x'.repeat(40), rows: [[2]] }, { name: 'الملخّص', rows: [[3]] }] });
  const wb2 = log.files[1].wb, names = wb2.s.map(s => s.n);
  ok(names.length === 3 && names[0] === 'الملخّص' && !/[\\/?*\[\]:]/.test(names[1]) && names[1].length <= 31 && names[2] !== names[0] && names[2].length <= 31, 'sheets: sanitized, ≤31 chars, never duplicated [' + names.join(' | ') + ']');
  c = mk(true);
  await c.save({ headers: ['h'], rows: [[1, 'x\ty']], filename: 'g' });
  ok(c.__dl.name === 'g.tsv' && c.__dl.text === '\uFEFFh\r\n1\tx y', 'fallback: a single sheet is the old TSV byte for byte');
  await c.save({ filename: 'z', sheets: [{ name: 'أ', headers: ['h'], rows: [[1]] }, { name: 'ب', rows: [[2]] }] });
  ok(c.__dl.text === '\uFEFF— أ —\r\nh\r\n1\r\n\r\n— ب —\r\n2', 'fallback: several sheets one after another, each titled');

  /* (٢) buildAccSheets */
  const A = F['accounting.html'];
  const g = { Math, Number, String, isNaN, Array, JSON, console: { warn() {} } };
  g.window = g;
  vm.createContext(g);
  g.SyDentCurrency = { labelOf: c2 => c2 === 'USD' ? '$' : 'ل.س' };
  g.SyDentAging = { BUCKETS: [{ label: '0–30 يوماً' }, { label: '31–60' }, { label: '61–90' }, { label: '+90' }] };
  g.SyDT = { numDate: () => 'D', hm: () => 'T' };
  const L = cur => ({
    summary: { revenue: 1000.456, production: 1500, unearnedTotal: cur === 'SYP' ? 50 : 0 },
    totals: { totalExpenses: 400 },
    adj: cur === 'SYP' ? { chargeReductions: 100, refundsTotal: 30 } : { chargeReductions: 0, refundsTotal: 0 },
    netRevenue: 970, netProduction: 1400, netProfit: cur === 'SYP' ? 570 : -25, profitMargin: cur === 'SYP' ? 58.76 : null, collectionRate: 71.46,
    breakdown: [{ name: 'إيجار', amount: 300 }, { name: 'تكاليف المخابر', amount: 100 }],
    providerRows: [{ name: 'د. أ', sessionCount: 4, production: 1000, labCost: 50, collection: 800, paidOut: 200, clinicNet: 550 },
                   { name: '—', isUnassigned: true, sessionCount: 1, production: 500, labCost: 0, collection: 200, paidOut: 0, clinicNet: 200 }]
  });
  g.__L = { SYP: L('SYP'), USD: L('USD'), _active: ['SYP', 'USD'] };
  vm.runInContext('var _accLastRange = { from: "2026-09-01", to: "2026-09-30" }; var agingResult = { SYP: { due: { rows: [{ name: "ر", phone: "09", total: 90, b: [10, 20, 30, 30], oldestDate: "2026-05-01" }] }, credit: { rows: [{ name: "س", phone: "", amount: 15 }] } }, USD: null };\n'
    + 'function computeLayersByCurrency(){ return __L; }\nfunction computeTrend(cur){ return cur === "SYP" ? [{ label: "9/2026", production: 1500, revenue: 1000, netProduction: 1400, collectionRate: 71.43 }] : []; }\n'
    + ['function _accNum(n) {', 'function _accCurLbl(cur) {', 'function buildAccSheets() {'].map(sg => fnSrc(A, sg)).join('\n'), g);
  const sh = vm.runInContext('buildAccSheets()', g);
  const byName = n => sh.find(x => x.name === n);
  ok(sh.map(x => x.name).join(',') === 'الملخّص,المصروفات,الأطباء,الاتجاه الشهري,تقادم الذمم,أرصدة دائنة', 'sheets: summary · expenses · doctors · monthly trend · aging · credits');
  const S = byName('الملخّص').rows, v = (cur, lbl) => (S.find(r => r[0] === cur && r[1] === lbl) || [])[2];
  ok(v('ل.س', 'الإيرادات المحصّلة') === 1000.46 && v('ل.س', 'الإنتاج المنجز') === 1500 && v('ل.س', 'معدّل التحصيل %') === 71.46 && v('ل.س', 'صافي الربح') === 570, 'summary values straight from the layer (rounded to cents)');
  ok(v('ل.س', 'صافي الإيراد بعد الاسترداد') === 970 && v('ل.س', 'صافي الإنتاج بعد الخصم') === 1400 && v('ل.س', 'مدفوعات مقدّمة (غير مكتسبة)') === 50
     && v('$', 'صافي الإيراد بعد الاسترداد') === undefined && v('$', 'مبالغ مستردّة') === undefined, 'conditional lines only when the card shows them');
  ok(v('$', 'صافي الخسارة') === 25 && v('$', 'صافي الربح') === undefined && v('$', 'هامش الربح %') === '', 'a loss is named a loss; a missing margin is blank, not zero');
  ok(S.some(r => r[0] === 'الفترة' && r[1] === '2026-09-01 ← 2026-09-30'), 'the applied period, not the date inputs');
  const E = byName('المصروفات').rows;
  ok(E[0][0] === 'ل.س' && E[0][1] === 'إيجار' && E[0][2] === 300 && E[0][3] === 75, 'expenses: amount and share of total expenses');
  const P = byName('الأطباء').rows;
  ok(P.length === 4 && P[1][1] === 'بلا طبيب محدد' && P[0].slice(2).join() === '4,1000,50,800,200,550', 'doctors: every column of the provider row, unassigned named');
  const Tr = byName('الاتجاه الشهري');
  ok(Tr.rows.length === 1 && Tr.rows[0].join() === 'ل.س,9/2026,1500,1000,1400,71.43', 'trend from computeTrend per currency');
  const Ag = byName('تقادم الذمم');
  ok(Ag.headers.slice(4, 8).join() === '0–30 يوماً,31–60,61–90,+90' && Ag.rows[0].join() === 'ل.س,ر,09,90,10,20,30,30,2026-05-01', 'aging: bucket headers from SyDentAging.BUCKETS, rows as computed');
  ok(byName('أرصدة دائنة').rows[0].join() === 'ل.س,س,,15', 'credits sheet');

  /* (٣) الربط */
  ok(/<button class="qb" id="btnExportXlsx" type="button"[^>]*>⬇️ Excel<\/button>/.test(A) && /\$\('btnExportXlsx'\)\.addEventListener\('click', exportAccExcel\);/.test(A), 'button and listener');
  ok(/function render\(from, to\) \{\n  _accLastRange = \{ from: from, to: to \};/.test(A), 'render records the applied period');
  const ex = fnSrc(A, 'async function exportAccExcel() {');
  ok(/if \(!_accLastRange \|\| _applyInFlight\)/.test(ex) && /sheets: buildAccSheets\(\)/.test(ex) && /if \(_accExportBusy\) return;/.test(ex), 'export waits for the load, uses the sheets, no double click');
}

const FILES = ['supabase-init.js', 'accounting.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, x, y) => F => Object.assign({}, F, { [f]: F[f].replace(x, y) });
const MUTANTS = [
  ['duplicate sheet names', rep('supabase-init.js', "      while (used[nm]) { nm = b.slice(0, 26) + ' (' + k + ')'; k++; }\n", '')],
  ['only the first sheet', rep('supabase-init.js', "        list.forEach(function (sh, i) {\n          var ws", "        list.slice(0, 1).forEach(function (sh, i) {\n          var ws")],
  ['fallback without titles', rep('supabase-init.js', "return (i ? [[]] : []).concat([['— ' + (list[i].name || '') + ' —']], x);", 'return x;')],
  ['old single-sheet fallback changed', rep('supabase-init.js', 'var aoa = list.length === 1 ? aoas[0]', "var aoa = list.length === 0 ? aoas[0]")],
  ['loss shown as a negative profit', rep('accounting.html', "sum.push([c, L.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة', _accNum(Math.abs(L.netProfit))]);", "sum.push([c, 'صافي الربح', _accNum(L.netProfit)]);")],
  ['share of revenue not expenses', rep('accounting.html', "t.totalExpenses > 0 ? _accNum(b.amount / t.totalExpenses * 100) : ''", "s.revenue > 0 ? _accNum(b.amount / s.revenue * 100) : ''")],
  ['refund line always', rep('accounting.html', "    if (a.refundsTotal > 0) sum.push([c, 'صافي الإيراد بعد الاسترداد', _accNum(L.netRevenue)]);", "    sum.push([c, 'صافي الإيراد بعد الاسترداد', _accNum(L.netRevenue)]);")],
  ['unassigned not named', rep('accounting.html', "p.isUnassigned ? 'بلا طبيب محدد' : p.name", 'p.name')],
  ['period from the inputs', rep('accounting.html', "function render(from, to) {\n  _accLastRange = { from: from, to: to };", "function render(from, to) {")],
  ['export during a load', rep('accounting.html', "if (!_accLastRange || _applyInFlight)", 'if (!_accLastRange)')],
  ['missing margin as zero', rep('accounting.html', "function _accNum(n) { return (n === null || n === undefined || isNaN(n)) ? '' : Math.round(Number(n) * 100) / 100; }", "function _accNum(n) { return Math.round(Number(n) * 100) / 100 || 0; }")]
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
      const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-acc-xlsx: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-acc-xlsx: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
