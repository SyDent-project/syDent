/* C3 part 4 — prover for the inventory hardening (M178) and the inventory statement (Excel).
   (1) batch guard: the item is locked only when a batch grows; growth still checks «open ≤ quantity»; ownership kept;
   (2) finished batches zeroed; trigger functions not executable by PUBLIC/anon;
   (3) statement: active items only, by name, value in the item's own currency (never summed across currencies),
       blank when unpriced, nearest open expiry, open LOTs; read-only, wired to its button;
   (4) history shows the LOT; `_ra/` ignored by git (#725).
   --self-test: mutants that must turn red. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function suite(F) {
  const M = F['migrations/178_inventory_hardening.sql'];
  const g = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_batches_guard'), M.indexOf('UPDATE public.inventory_batches SET quantity = 0'));
  ok(g.indexOf('v_grow :=') > -1 && g.indexOf('v_grow :=') < g.indexOf('FROM public.inventory_items i'), 'guard: growth decided before touching the item');
  ok(/IF v_grow THEN\s+SELECT i\.quantity, i\.owner_id INTO v_itemq, v_owner FROM public\.inventory_items i WHERE i\.id = NEW\.item_id FOR UPDATE;\s+ELSE\s+SELECT i\.quantity, i\.owner_id INTO v_itemq, v_owner FROM public\.inventory_items i WHERE i\.id = NEW\.item_id;/.test(g), 'guard: lock only on growth');
  ok(/RAISE EXCEPTION 'batch_item_not_owned'/.test(g) && /RAISE EXCEPTION 'batch_exceeds_stock'/.test(g) && /OR coalesce\(NEW\.quantity, 0\) > coalesce\(OLD\.quantity, 0\)\);/.test(g), 'guard: ownership and «open ≤ quantity» kept');
  ok(/UPDATE public\.inventory_batches SET quantity = 0 WHERE is_finished AND coalesce\(quantity, 0\) > 0;/.test(M), 'finished batches zeroed');
  ['inventory_batches_guard', 'inventory_items_trim_batches', 'inventory_movements_guard', 'treatment_materials_guard', 'inventory_count_lines_guard',
   'inventory_orders_guard', 'inventory_order_lines_guard', 'inventory_receipts_guard', 'inventory_receipt_lines_guard']
    .forEach(fn => ok(M.indexOf('REVOKE ALL ON FUNCTION public.' + fn + '() FROM PUBLIC, anon;') > -1, 'trigger function closed to the API — ' + fn));

  let T;
  try { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(F['inv-trace.js'], ctx); T = ctx.window.SyDentInvTrace; }
  catch (e) { ok(false, 'inv-trace throws: ' + e.message); return; }
  const R = T.stockRows([
    { id: 'b', name: 'بنج', unit: 'كبسولة', quantity: 40, reorder_level: 20, purchase_price: 1.25, currency: 'USD', is_active: true },
    { id: 'a', name: 'أبر', unit: 'علبة', quantity: 3, reorder_level: 0, purchase_price: 2000, currency: 'SYP', is_active: true },
    { id: 'c', name: 'كمبوزيت', quantity: 5, purchase_price: null, currency: 'SYP' },
    { id: 'd', name: 'محذوف', quantity: 9, purchase_price: 1, currency: 'SYP', is_active: false }
  ], [
    { item_id: 'b', quantity: 10, expiry_date: '2027-05-01', lot: 'L2', is_finished: false },
    { item_id: 'b', quantity: 5, expiry_date: '2026-12-01', lot: 'L1', is_finished: false },
    { item_id: 'b', quantity: 0, expiry_date: '2026-01-01', lot: 'L0', is_finished: true }
  ]);
  ok(R.length === 3 && R.map(r => r[0]).join(',') === 'أبر,بنج,كمبوزيت', 'statement: active items only, by name');
  const b = R[1];
  ok(b[4] === 1.25 && b[5] === '$' && b[6] === 50 && R[0][5] === 'ل.س' && R[0][6] === 6000, 'statement: value in the item\'s own currency');
  ok(R[2][4] === '' && R[2][5] === '' && R[2][6] === '', 'statement: unpriced left blank, not zero');
  ok(b[7] === '01/12/2026' && b[8] === 'L2، L1' && R[0][3] === '', 'statement: nearest open expiry, open LOTs only, no level shown as blank');
  ok(R.every(r => r.length === T.STOCK_HEADERS.length), 'statement: rows aligned with the headers');

  const INV = F['inventory.html'];
  const ex = fnSrc(INV, 'function exportStock() {');
  ok(/SyDentInvTrace\.stockRows\(ITEMS, BATCHES,/.test(ex) && !/window\.sb\./.test(ex) && /onclick="exportStock\(\)"/.test(INV), 'statement: wired, read-only (no database call)');
  ok(/batch:inventory_batches\(expiry_date, lot\)/.test(INV) && /m\.batch\.lot \? 'LOT <bdi dir="ltr">' \+ escapeHtml\(m\.batch\.lot\)/.test(INV), 'history: LOT shown, escaped');
  ok(/^_ra\/$/m.test(F['.gitignore']), 'git ignores the review screenshots (#725)');
}

const FILES = ['migrations/178_inventory_hardening.sql', 'inv-trace.js', 'inventory.html', '.gitignore'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/178_inventory_hardening.sql';
const MUTANTS = [
  ['always locks the item', rep(MIG, "  ELSE\n    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id;\n", "  ELSE\n    SELECT i.quantity, i.owner_id INTO v_itemq, v_owner FROM public.inventory_items i WHERE i.id = NEW.item_id FOR UPDATE;\n")],
  ['growth no longer checked', rep(MIG, "RAISE EXCEPTION 'batch_exceeds_stock'", "RAISE NOTICE 'batch_exceeds_stock'")],
  ['anon keeps a trigger function', rep(MIG, 'REVOKE ALL ON FUNCTION public.inventory_receipts_guard() FROM PUBLIC, anon;', '')],
  ['currencies summed', rep('inv-trace.js', "priced ? lbl(it.currency === 'USD' ? 'USD' : 'SYP') : ''", "priced ? lbl('SYP') : ''")],
  ['unpriced as zero', rep('inv-trace.js', "priced ? r2(num(it.quantity) * num(it.purchase_price)) : ''", "r2(num(it.quantity) * num(it.purchase_price))")],
  ['finished LOTs listed', rep('inv-trace.js', 'if (b.is_finished || !(num(b.quantity) > 0)) return;', '')],
  ['deleted items listed', rep('inv-trace.js', '.filter(function (it) { return it.is_active !== false; })', '')],
  ['_ra/ committed', rep('.gitignore', '_ra/', '')]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0;
    const log = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-harden: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-harden: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
