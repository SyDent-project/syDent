/* v569 — مثبتُ «جهّز الطلبية» (M170 + inv-order.js + صفحة المخزون + اللوحة) — مستقل، على الملفات الحيّة.
   (١) الهجرة: reorder_qty موجبة ومحدودة · schema.sql مرآة;
   (٢) inv-order.js بثوابت ذاتية: isLow تعريفٌ واحد (النافدُ بلا حدّ يُعدّ) · suggest أصغرُ مضاعفٍ يرفع فوق الحدّ ·
       النصُّ والورقةُ بلا أسعار والمستبعدُ والفارغُ خارجهما · الورقةُ مهرَّبة · الكلفةُ لكل عملةٍ على حدة · إكسل;
   (٣) الربط: الصفحةُ واللوحةُ تستعملان isLow وحدها · الحقلُ يُحفظ (فارغ ⇒ NULL) ويُعبّأ · النافذةُ لا تكتب بالقاعدة ·
       الطباعةُ متزامنة · الدلالةُ على الإعداد مخفيّةٌ بوضع القراءة · الأصلُ محمَّلٌ مرةً وبالفليت;
   (٤) نافذةُ الطلبية تُشغَّل بـDOM مصطنع: الاقتراحُ افتراضي · الاستبعادُ والكميةُ المكتوبة تصل للطلبية.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function mod(F) {
  const ctx = { window: {}, console, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(F['inv-order.js'], ctx);
  return ctx.window.SyDentInvOrder;
}

async function suite(F) {
  const M = F['migrations/170_inventory_reorder_qty.sql'];
  ok(/ADD COLUMN IF NOT EXISTS reorder_qty numeric/.test(M) && /reorder_qty IS NULL OR \(reorder_qty > 0 AND reorder_qty <= 1000000\)/.test(M), 'migration: reorder_qty positive and bounded, NULL = unset');
  ok(/"reorder_qty" numeric/.test(F['db/schema.sql']) && /inventory_items_reorder_qty_pos/.test(F['db/schema.sql']), 'schema.sql mirrors M170');

  let O;
  try { O = mod(F); } catch (e) { ok(false, 'inv-order throws: ' + e.message); return; }
  ok(O.isLow({ quantity: 0, reorder_level: 0 }) === true, 'isLow: out of stock without a level counts');
  ok(O.isLow({ quantity: 5, reorder_level: 5 }) === true && O.isLow({ quantity: 6, reorder_level: 5 }) === false, 'isLow: at the level counts, above does not');
  ok(O.isLow({ quantity: 3, reorder_level: 0 }) === false, 'isLow: stocked item without a level is not low');
  ok(O.isLow({ quantity: 0, reorder_level: 5, is_active: false }) === false, 'isLow: deleted item never low');
  ok(O.suggest({ quantity: 5, reorder_level: 20, reorder_qty: 10 }) === 20, 'suggest: 5 under 20 by 10s ⇒ 20');
  ok(O.suggest({ quantity: 0, reorder_level: 20, reorder_qty: 50 }) === 50, 'suggest: one pack lifts above');
  ok(O.suggest({ quantity: 10, reorder_level: 10, reorder_qty: 10 }) === 10, 'suggest: at the level ⇒ one pack');
  ok(O.suggest({ quantity: 1, reorder_level: 10, reorder_qty: 2.5 }) === 10, 'suggest: fractional packs');
  ok(O.suggest({ quantity: -3, reorder_level: 4, reorder_qty: 5 }) === 5, 'suggest: negative stock read as zero');
  ok(O.suggest({ quantity: 0, reorder_level: 20 }) === null && O.suggest({ quantity: 0, reorder_level: 20, reorder_qty: 0 }) === null, 'suggest: no order quantity ⇒ null (typed by hand)');
  let minimal = true;
  for (let q = 0; q <= 30; q++) for (let r = 0; r <= 30; r += 3) for (const Q of [1, 4, 7, 12.5]) {
    const s = O.suggest({ quantity: q, reorder_level: r, reorder_qty: Q }); const k = Math.round(s / Q);
    if (!(q + s > r) || (k > 1 && q + (k - 1) * Q > r) || Math.abs(k * Q - s) > 1e-9) { minimal = false; break; }
  }
  ok(minimal, 'suggest: always the smallest multiple that lifts above the level');

  const order = { clinic: 'عيادة <أ>', supplier: 'مستودع', note: 'قبل الخميس', date: new Date(2026, 9, 2),
    lines: [{ name: 'بنج <b>', unit: 'أمبولة', qty: 50, current: 4, level: 20, price: 5000, currency: 'SYP' },
            { name: 'كفوف', unit: 'علبة', qty: null, current: 0, level: 5, price: 2, currency: 'USD' },
            { name: 'خيط', unit: '', qty: 3, current: 0, level: 0, price: 4, currency: 'USD' },
            { name: 'إبر', unit: 'علبة', qty: 2, current: 1, level: 3, price: null, currency: 'SYP' }] };
  const t = O.text(order);
  ok(/^🧾 طلبية مواد — عيادة <أ>\nإلى: مستودع\nالتاريخ: 02\/10\/2026\n\n1\) بنج <b> — 50 أمبولة\n2\) خيط — 3\n3\) إبر — 2 علبة\n\nقبل الخميس$/.test(t), 'text: numbered lines, empty quantity left out, supplier, date, note');
  ok(!/5000|5,000|\$|ل\.س/.test(t), 'text: no prices to the supplier');
  const sh = O.sheet(order);
  ok(sh.indexOf('بنج &lt;b&gt;') > -1 && sh.indexOf('<b>') === -1 && sh.indexOf('عيادة &lt;أ&gt;') > -1, 'sheet: names escaped');
  ok((sh.match(/<tr><td>\d+<\/td>/g) || []).length === 3 && !/5,000|5000/.test(sh), 'sheet: three lines, no prices');
  const rw = O.rows(order);
  ok(rw.length === 3 && rw[0][2] === 50 && rw[0][4] === 4 && rw[1][5] === '' && O.HEADERS.length === rw[0].length, 'rows: Excel lines and headers aligned');
  const c = O.costs(order);
  ok(c.bag.SYP === 250000 && c.bag.USD === 12 && c.missing === 1, 'costs: per currency, never mixed; unpriced counted');
  ok(O.waUrl(order).indexOf('https://wa.me/?text=') === 0 && decodeURIComponent(O.waUrl(order).slice(20)) === t, 'WhatsApp link carries the text');

  /* (٣) الربط */
  const INV = F['inventory.html'], IDX = F['index.html'];
  ok(!/Number\(it\.reorder_level\|\|0\) > 0 && Number\(it\.quantity\|\|0\) <= Number\(it\.reorder_level\|\|0\)/.test(INV), 'inventory: the old local definition is gone');
  ok((INV.match(/window\.SyDentInvOrder\.isLow\(it\)/g) || []).length >= 4, 'inventory: badge, summary, card and order all use isLow');
  ok(/window\.SyDentInvOrder\.isLow\(it\)/.test(IDX) && !/return q<=0 \|\| \(r>0 && q<=r\)/.test(IDX), 'dashboard: same definition');
  ok(/reorder_qty: \(reorderQty > 0\) \? reorderQty : null,/.test(INV), 'item form: saved, blank ⇒ NULL');
  ok(/getElementById\('itemReorderQty'\)\.value = it \? \(it\.reorder_qty != null \? it\.reorder_qty : ''\) : '';/.test(INV), 'item form: filled on edit');
  const orderSrc = ['function openOrderModal(', 'function renderOrderRows(', 'function ivoOrder(', 'function renderOrderCost(', 'function ivoSetQty('].map(s => fnSrc(INV, s)).join('');
  ok(orderSrc.length > 500 && !/\.(insert|update|delete|upsert|rpc)\(/.test(orderSrc), 'order window writes nothing to the database');
  ok(/if \(act === 'print'\) \{ window\.SyDentInvOrder\.print\(order\); return; \}/.test(INV), 'print stays synchronous inside the click');
  ok(/escapeHtml\(it\.name\)/.test(fnSrc(INV, 'function renderOrderRows(')), 'order rows escape names');
  ok(/html\[data-sub-level="read"\] :is\([^\n]*\[onclick\*="ivoSetQty\("\][^\n]*\)\{display:none !important;\}/.test(INV), 'deep link to the setting hidden in read mode');
  ok(/onclick="openOrderModal\(\)">🧾 جهّز الطلبية<\/button>/.test(INV), 'the button sits on the low-stock card');
  [['inventory.html', 'inv-consume.js'], ['index.html', 'sidebar.js']].forEach(([f, after]) => {
    const S = F[f], iA = S.indexOf('<script src="' + after + '?v='), iO = S.indexOf('<script src="inv-order.js?v=');
    ok(iO > iA && (S.match(/inv-order\.js\?v=/g) || []).length === 1, f + ': inv-order.js loaded once, after ' + after);
  });
  ok((F['scripts/cache-bust.sh'].match(/inv-order/g) || []).length === 3, 'cache-bust: inv-order.js in the fleet allow-list');

  /* (٤) النافذة بـDOM مصطنع */
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', value: '', classList: { add() {}, remove() {} } });
  get('ivoSupplier').value = ' مستودع '; get('ivoNote').value = '';
  const ctx = { window: {}, console, document: { getElementById: get }, showToast() {}, openModal() {}, closeModal() {},
    fmtNum: n => String(Math.round(Number(n) * 100) / 100), fmtMoney: (n, c) => n + ' ' + c, escapeHtml: s => String(s), encodeURIComponent,
    currentUser: null, setTimeout,
    ITEMS: [{ id: 'a', name: 'بنج', unit: 'أمبولة', quantity: 4, reorder_level: 20, reorder_qty: 10, purchase_price: 5000, currency: 'SYP' },
            { id: 'b', name: 'كفوف', unit: 'علبة', quantity: 0, reorder_level: 0, reorder_qty: null },
            { id: 'c', name: 'خيط', quantity: 9, reorder_level: 2, reorder_qty: 5 }] };
  vm.createContext(ctx);
  vm.runInContext(F['inv-order.js'], ctx);
  try {
    vm.runInContext(['var _ivo = [];', 'var _ivoClinic = null;', 'async function _ivoLoadClinic() {}', fnSrc(INV, 'function openOrderModal('), fnSrc(INV, 'function renderOrderRows('),
      fnSrc(INV, 'function ivoOrder('), fnSrc(INV, 'function renderOrderCost('), 'this.__o = openOrderModal; this.__q = ivoOrder; this.__s = function(){ return _ivo; };'].join('\n'), ctx);
    ctx.__o();
    const st = ctx.__s();
    ok(st.length === 2 && st[0].qty === 20 && st[1].qty === null, 'window: low items only, suggestion prefilled, unset left empty');
    ok(/حدّد «كمية الطلب»/.test(get('ivoRows').innerHTML) && (get('ivoRows').innerHTML.match(/ivoSetQty\(/g) || []).length === 1, 'window: the unset item points to its setting (#696)');
    st[1].qty = 6; st[0].on = false;
    const o = ctx.__q();
    ok(o.supplier === 'مستودع' && o.lines.length === 1 && o.lines[0].name === 'كفوف' && o.lines[0].qty === 6, 'window: exclusion and typed quantity reach the order');
    ok(/الكلفة التقديرية/.test(get('ivoCost').innerHTML) || /ما في ولا صنف/.test(get('ivoCost').innerHTML), 'window: cost line rendered');
  } catch (e) { ok(false, 'order window throws: ' + e.message); }
}

const FILES = ['migrations/170_inventory_reorder_qty.sql', 'db/schema.sql', 'inv-order.js', 'inventory.html', 'index.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['out of stock without a level not low', rep('inv-order.js', 'return q <= 0 || (r > 0 && q <= r);', 'return r > 0 && q <= r;')],
  ['always one pack', rep('inv-order.js', 'var k = Math.max(1, Math.floor((r - q) / Q) + 1);', 'var k = 1;')],
  ['one pack too many', rep('inv-order.js', 'var k = Math.max(1, Math.floor((r - q) / Q) + 1);', 'var k = Math.max(1, Math.floor((r - q) / Q) + 2);')],
  ['empty quantities printed', rep('inv-order.js', "return l && num(l.qty) > 0;", "return !!l;")],
  ['prices sent to the supplier', rep('inv-order.js', "out.push((i + 1) + ') ' + l.name + ' — ' + fmt(l.qty) + (l.unit ? ' ' + l.unit : ''));", "out.push((i + 1) + ') ' + l.name + ' — ' + fmt(l.qty) + (l.unit ? ' ' + l.unit : '') + ' · ' + l.price);")],
  ['sheet unescaped', rep('inv-order.js', "'</td><td>' + esc(l.name) + '</td>", "'</td><td>' + l.name + '</td>")],
  ['currencies mixed', rep('inv-order.js', "var c = l.currency || 'SYP';", "var c = 'SYP';")],
  ['blank order quantity saved as 0', rep('inventory.html', 'reorder_qty: (reorderQty > 0) ? reorderQty : null,', 'reorder_qty: isNaN(reorderQty) ? 0 : reorderQty,')],
  ['dashboard back to its own rule', rep('index.html', 'var low=(res.data||[]).filter(function(it){ return window.SyDentInvOrder.isLow(it); });', 'var low=(res.data||[]).filter(function(it){ var q=Number(it.quantity||0); var r=Number(it.reorder_level||0); return q<=0 || (r>0 && q<=r); });')],
  ['excluded rows still ordered', rep('inventory.html', 'lines: _ivo.filter(function(r){ return r.on; }).map(', 'lines: _ivo.map(')],
  ['setting link visible in read mode', rep('inventory.html', ',[onclick*="ivoSetQty("]', '')],
  ['print awaited', rep('inventory.html', "if (act === 'print') { window.SyDentInvOrder.print(order); return; }", "if (act === 'print') { setTimeout(function(){ window.SyDentInvOrder.print(order); }, 0); return; }")]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-order: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-order: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
