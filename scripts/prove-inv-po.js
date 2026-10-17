/* C3 part 1 — prover for suppliers, purchase orders and partial receiving (M172 + inv-po.js + inventory/expenses pages).
   Standalone, on the live files:
   (1) migration: five owned tables with owner RLS + the shared subscription gate · ownership guard on every link
       (supplier · order · item · receipt · batch · expense of the right currency) · movement guard keeps M169/M171 and
       adds receipt_id · RPCs: invoker rights, read-only refused, items locked in item_id order, no more than ordered
       unless confirmed, inactive item refused, quantity before batch, status partial/received · every FK indexed;
   (2) inv-po.js: blank = not received · over-ordered rows · totals per currency never mixed · expense prefill per currency ·
       saved order to the supplier sheet carries what is still awaited and no prices;
   (3) wiring: every write behind the read-only guard on its first line and iGuarded · receive/create through the RPC only ·
       lazy lists behind a sequence guard (#705) · the expense link passes id + currency only (#721), the expenses page
       fills and does not save, links after an insert once (.is(col, null)) and unlinks on close / new;
   (4) the receive window on a fake DOM: only filled rows sent, over-ordered asks first and then allows.
   --self-test: mutants that must turn red. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const M = F['migrations/172_inventory_suppliers_orders.sql'];
  const T = ['inventory_suppliers', 'inventory_orders', 'inventory_order_lines', 'inventory_receipts', 'inventory_receipt_lines'];
  T.forEach(t => {
    ok(new RegExp('ALTER TABLE public\\.' + t + ' ENABLE ROW LEVEL SECURITY').test(M), 'migration: RLS on ' + t);
    ok(M.indexOf("SELECT public._sub_guard_table('public." + t + "');") > -1, 'migration: subscription gate on ' + t);
    ok(new RegExp('CREATE POLICY ' + t + '_owner_all ON public\\.' + t + ' FOR ALL\\s+USING \\(owner_id = \\(SELECT auth\\.uid\\(\\)\\)\\) WITH CHECK \\(owner_id = \\(SELECT auth\\.uid\\(\\)\\)\\)').test(M), 'migration: owner policy on ' + t);
  });
  ['order_supplier_not_owned', 'order_line_order_not_owned', 'order_line_item_not_owned', 'receipt_order_not_owned', 'receipt_supplier_not_owned',
   'receipt_line_receipt_not_owned', 'receipt_line_order_line_not_owned', 'receipt_line_batch_not_owned', 'movement_receipt_not_owned',
   'movement_item_not_owned', 'movement_session_not_owned', 'movement_patient_not_owned', 'movement_provider_not_owned', 'movement_batch_not_owned', 'movement_count_not_owned']
    .forEach(k => ok(new RegExp("RAISE EXCEPTION '" + k + "'").test(M), 'migration: ownership guard — ' + k));
  ok(/e\.id = NEW\.expense_syp_id AND e\.owner_id = NEW\.owner_id AND e\.currency = 'SYP'/.test(M) && /e\.id = NEW\.expense_usd_id AND e\.owner_id = NEW\.owner_id AND e\.currency = 'USD'/.test(M), 'migration: expense link owned and in its own currency');
  ok(/UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id, receipt_id ON public\.inventory_movements/.test(M), 'migration: receipt_id under the movement guard');
  const fks = (M.match(/REFERENCES public\.\w+\(id\)/g) || []).length;
  const idx = (M.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
  ok(fks === 12 && idx >= 16, 'migration: every foreign key indexed (' + fks + ' FKs, ' + idx + ' indexes)');

  const co = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_create_order'), M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_receive'));
  ok(/SECURITY INVOKER/.test(co) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(co), 'create: invoker rights, read-only refused');
  ok(/RAISE EXCEPTION 'duplicate_item'/.test(co) && /i\.owner_id = v_uid AND i\.is_active;/.test(co), 'create: one line per item, owned active items only');
  ok(/VALUES \(v_uid, v_order, r\.item_id, r\.qty, v_price, v_cur\)/.test(co), 'create: price and currency snapshotted from the item');

  const rv = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_receive'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_create_order'));
  ok(/SECURITY INVOKER/.test(rv) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(rv), 'receive: invoker rights, read-only refused');
  ok(/o\.id = p_order AND o\.owner_id = v_uid FOR UPDATE/.test(rv) && /v_status NOT IN \('open', 'partial'\) THEN RAISE EXCEPTION 'order_not_open'/.test(rv), 'receive: order locked, only while open or partial');
  ok(/ORDER BY 2, 1 /.test(rv) && /SELECT l2\.id AS line_id, l2\.item_id,/.test(rv), 'receive: items locked in item_id order (rank 2 is item_id — #719)');
  ok(/r\.qty_received \+ r\.qty > r\.qty_ordered AND NOT coalesce\(p_allow_over, false\) THEN\s+RAISE EXCEPTION 'over_ordered'/.test(rv), 'receive: no more than ordered unless confirmed');
  ok(/IF NOT FOUND OR NOT v_active THEN RAISE EXCEPTION 'item_inactive'/.test(rv) && /i\.id = r\.item_id AND i\.owner_id = v_uid FOR UPDATE/.test(rv), 'receive: owned item locked, deleted item refused');
  ok(rv.indexOf('UPDATE public.inventory_items SET quantity = quantity + r.qty') > -1 && rv.indexOf('UPDATE public.inventory_items SET quantity = quantity + r.qty') < rv.indexOf('INSERT INTO public.inventory_batches'), 'receive: quantity raised before the batch opens (batch guard)');
  ok(/IF r\.expiry IS NOT NULL THEN\s+INSERT INTO public\.inventory_batches \(owner_id, item_id, quantity, received_qty, expiry_date, note\)/.test(rv), 'receive: a batch only when an expiry is given');
  ok(/VALUES \(v_uid, r\.item_id, r\.qty, 'purchase', 'استلام طلبية', v_batch, v_receipt\)/.test(rv), 'receive: one purchase movement per line, tied to batch and receipt');
  ok(/SET qty_received = qty_received \+ r\.qty WHERE id = r\.line_id/.test(rv) && /THEN 'partial' ELSE 'received' END/.test(rv), 'receive: received quantity and status follow');
  ok(/ELSIF v_cur = 'USD' THEN v_usd := v_usd \+ r\.qty \* v_price;\s+ELSE v_syp := v_syp \+ r\.qty \* v_price;/.test(rv), 'receive: totals per currency, never mixed');
  ok(/GRANT EXECUTE ON FUNCTION public\.inventory_receive\(uuid, jsonb, text, boolean\) TO authenticated/.test(M) && /REVOKE ALL ON FUNCTION public\.inventory_receive\(uuid, jsonb, text, boolean\) FROM PUBLIC, anon/.test(M), 'grants: authenticated only');

  let P;
  try { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(F['inv-po.js'], ctx); P = ctx.window.SyDentInvPO; }
  catch (e) { ok(false, 'inv-po throws: ' + e.message); return; }
  const l1 = { id: 'l1', qty_ordered: 20, qty_received: 12 }, l2 = { id: 'l2', qty_ordered: 10, qty_received: 0 }, l3 = { id: 'l3', qty_ordered: 5, qty_received: 5 };
  ok(P.remaining(l1) === 8 && P.remaining(l3) === 0 && P.remaining({ qty_ordered: 5, qty_received: 7 }) === 0, 'remaining never negative');
  const pg = P.progress([l1, l2, l3]);
  ok(pg.lines === 3 && pg.done === 1 && pg.ordered === 35 && pg.received === 17, 'progress');
  const RL = P.receiveLines([{ line: l1, qty: '8', expiry: '2027-01-01', price: '' }, { line: l2, qty: '', expiry: '2027-02-02', price: '5' }, { line: l3, qty: '0' }, { line: l2, qty: '2.345', price: '0' }]);
  ok(RL.length === 2 && RL[0].line_id === 'l1' && RL[0].qty === 8 && RL[0].expiry === '2027-01-01' && !('price' in RL[0]), 'receive lines: blank or zero qty not sent, blank price not sent');
  ok(RL[1].qty === 2.35 && RL[1].price === 0, 'receive lines: rounding, zero price kept');
  const OV = P.overLines([{ line: l1, qty: '9' }, { line: l2, qty: '10' }, { line: l3, qty: '' }]);
  ok(OV.length === 1 && OV[0].line === l1, 'over-ordered rows found');
  const tt = P.receiptTotals([{ qty: 2, unit_price: 5000, currency: 'SYP' }, { qty: 3, unit_price: 1.5, currency: 'USD' }, { qty: 1, unit_price: null, currency: 'SYP' }, { qty: 4, unit_price: 250, currency: 'SYP' }]);
  ok(tt.bag.SYP === 11000 && tt.bag.USD === 4.5 && tt.unpriced === 1, 'receipt totals per currency, unpriced counted');
  const pre = P.expensePrefill({ received_at: '2026-10-05T09:00:00Z', supplier_name: 'مستودع' }, [{ qty: 2, unit_price: 5000, currency: 'SYP' }, { qty: 3, unit_price: 2, currency: 'USD' }], 'USD');
  ok(pre.amount === 6 && pre.currency === 'USD' && pre.vendor === 'مستودع' && pre.date === '2026-10-05' && /استلام طلبية 05\/10\/2026/.test(pre.description), 'expense prefill: one currency only, numeric date');
  const ord = P.order({ status: 'partial', supplier_name: 'م', created_at: '2026-10-01' }, [{ item_id: 'a', qty_ordered: 20, qty_received: 12, unit_price: 9 }, { item_id: 'b', qty_ordered: 5, qty_received: 5 }], { a: { name: 'كفوف', unit: 'علبة' } }, { name: 'ع' });
  ok(ord.lines[0].qty === 8 && ord.lines[1].qty === 0 && !('price' in ord.lines[0]) && ord.supplier === 'م', 'saved order to the supplier: what is still awaited, no prices');

  const INV = F['inventory.html'];
  [['async function _poReceive_inner() {', 'poReceive'], ['async function _poClose_inner() {', 'poClose'], ['async function _poSupSave_inner() {', 'poSupSave'],
   ['async function _poSupHide_inner(id) {', 'poSupHide'], ['async function _ivoSave_inner() {', 'ivoSave']].forEach(([sig, name]) => {
    const b = fnSrc(INV, sig);
    ok(/^\s+if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(b.split('\n')[1] || ''), name + ': read-only guard on the first line');
    ok(new RegExp('var ' + name + " = iGuarded\\('" + name + "', _" + name + '_inner').test(INV), name + ': guarded against double click');
  });
  const rcv = fnSrc(INV, 'async function _poReceive_inner() {');
  ok(/window\.sb\.rpc\('inventory_receive', \{ p_order: v\.order\.id, p_lines: L, p_note: note \|\| null, p_allow_over: over\.length > 0 \}\)/.test(rcv) && !/\.from\(/.test(rcv), 'receive: the RPC only');
  ok(rcv.indexOf('SyDialog.confirm') > -1 && rcv.indexOf('SyDialog.confirm') < rcv.indexOf("window.sb.rpc('inventory_receive'"), 'receive: over-ordered asks before sending');
  ok(/window\.sb\.rpc\('inventory_create_order', \{ p_supplier: supId, p_lines: lines, p_note: note \|\| null \}\)/.test(fnSrc(INV, 'async function _ivoSave_inner() {')), 'save order: the RPC');
  ['async function poLoadOrders(more) {', 'async function poOpenOrder(id) {', 'async function poLoadSupplierTab() {'].forEach(sig => {
    const b = fnSrc(INV, sig);
    ok(/var seq = \+\+_poSeq;/.test(b) && (b.match(/if \(seq !== _poSeq\) return;/g) || []).length === 2, sig.slice(15, 35) + ': sequence guard (#705)');
  });
  const ex = fnSrc(INV, 'function poExpense(receiptId, cur) {');
  ok(/location\.href = 'expenses\.html\?inv_receipt=' \+ encodeURIComponent\(receiptId\) \+ '&cur=' \+ encodeURIComponent\(cur\);/.test(ex) && !/amount/.test(ex), 'expense link: id and currency only (#721)');
  ok(/escapeHtml\(sup \|\| 'طلبية بلا مورّد'\)/.test(INV) && /escapeHtml\(it\.name \|\| '—'\)/.test(INV) && /escapeHtml\(s\.name\)/.test(INV), 'names escaped');
  ok(/:is\([^\n]*\[onclick\*="poReceive\("\][^\n]*,#poRecvForm\)\{display:none !important;\}/.test(INV), 'read mode: writes and the receive form hidden');
  const iC = INV.indexOf('<script src="inv-count.js?v='), iP = INV.indexOf('<script src="inv-po.js?v=');
  ok(iP > iC && (INV.match(/inv-po\.js\?v=/g) || []).length === 1, 'inv-po.js loaded once after inv-count.js');
  ok((F['scripts/cache-bust.sh'].match(/inv-po/g) || []).length === 3, 'cache-bust: inv-po.js in the fleet allow-list');

  const EXP = F['expenses.html'];
  const oe = fnSrc(EXP, 'async function openInvReceiptExpense(receiptId, cur) {');
  ok(/_sub && _sub\.level !== 'full'\) return;/.test(oe) && /\.from\('inventory_receipts'\)/.test(oe) && !/\.insert\(|saveExpense\(/.test(oe), 'expenses: reads the receipt, fills, never saves; not in read mode');
  ok(oe.indexOf('openExpenseModal();') > -1 && oe.indexOf('openExpenseModal();') < oe.indexOf('_invReceiptLink = { id: receiptId, cur: cur };'), 'expenses: link set after the form resets');
  ok(/expense_usd_id : r\.data\.expense_syp_id\) \{ showToast/.test(oe), 'expenses: an already linked receipt is not filled again');
  const lk = fnSrc(EXP, 'async function linkInvReceipt(link, expense) {');
  ok(/expense\.currency !== link\.cur\) return;/.test(lk) && /\.is\(col, null\)/.test(lk), 'expenses: link once, only in the matching currency (#721)');
  ok(/if \(!editingExpId && _invReceiptLink\) await linkInvReceipt\(_invReceiptLink, res\.data\);/.test(EXP), 'expenses: linked only after a new expense is saved');
  ok(/_invReceiptLink = null;   \/\/ C3: إضافةٌ جديدة/.test(fnSrc(EXP, 'function openExpenseModal() {')) && /_invReceiptLink = null;/.test(fnSrc(EXP, 'function closeExpModal() {')), 'expenses: close or new add unlinks');
  ok(/<script src="inv-po\.js\?v=/.test(EXP), 'expenses: inv-po.js loaded');

  /* (4) the receive window */
  const log = [], els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', value: '', style: {}, setAttribute() {}, getAttribute() { return ''; } });
  let confirms = 0, answer = false;
  const ctx = { window: { SyDentSub: { blockReadOnly: () => false } }, console, document: { getElementById: get },
    showToast() {}, SyDialog: { confirm: async () => { confirms++; return answer; } }, currentUser: { id: 'u' },
    loadItems() {}, iGuarded: (n, f) => f, escapeHtml: s => String(s), isTableMissing: () => false };
  vm.createContext(ctx);
  vm.runInContext(F['inv-po.js'], ctx);
  ctx.window.sb = { rpc: (n, a) => { log.push([n, JSON.parse(JSON.stringify(a))]); return Promise.resolve({ data: { status: 'partial' }, error: null }); } };
  try {
    vm.runInContext(['var _po = { view: null };', 'async function poOpenOrder() {}', fnSrc(INV, 'function poItemOf(l) {'), fnSrc(INV, 'function poErrText(e) {'),
      'var poReceive = iGuarded(\'poReceive\', _poReceive_inner);', fnSrc(INV, 'async function _poReceive_inner() {'),
      'this.__r = poReceive; this.__set = function(v){ _po.view = v; };'].join('\n'), ctx);
    const line1 = { id: 'l1', item_id: 'a', qty_ordered: 20, qty_received: 12, inventory_items: { name: 'كفوف' } };
    const line2 = { id: 'l2', item_id: 'b', qty_ordered: 10, qty_received: 0, inventory_items: { name: 'بنج' } };
    const view = { order: { id: 'o1', status: 'open' }, rows: [{ line: line1, qty: '9', expiry: '', price: '' }, { line: line2, qty: '', expiry: '', price: '' }] };
    ctx.__set(view);
    get('poRecvNote').value = ' فاتورة 7 ';
    await ctx.__r();
    ok(confirms === 1 && log.length === 0, 'window: over-ordered asks, refusal sends nothing');
    answer = true;
    await ctx.__r();
    ok(log.length === 1 && log[0][0] === 'inventory_receive' && log[0][1].p_lines.length === 1 && log[0][1].p_lines[0].line_id === 'l1'
       && log[0][1].p_allow_over === true && log[0][1].p_note === 'فاتورة 7', 'window: only filled rows sent, confirmed over-receive allowed');
    view.rows[0].qty = '8';
    await ctx.__r();
    ok(log.length === 2 && log[1][1].p_allow_over === false && confirms === 2, 'window: within the order no question, no allowance');
  } catch (e) { ok(false, 'receive window throws: ' + e.message); }
}

const FILES = ['migrations/172_inventory_suppliers_orders.sql', 'inv-po.js', 'inventory.html', 'expenses.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/172_inventory_suppliers_orders.sql';
const MUTANTS = [
  ['receipt lines without the subscription gate', rep(MIG, "SELECT public._sub_guard_table('public.inventory_receipt_lines');", '')],
  ['foreign supplier accepted on an order', rep(MIG, "RAISE EXCEPTION 'order_supplier_not_owned'", "RAISE NOTICE 'order_supplier_not_owned'")],
  ['expense of the other currency accepted', rep(MIG, "e.owner_id = NEW.owner_id AND e.currency = 'USD'", 'e.owner_id = NEW.owner_id')],
  ['over-receive without confirmation', rep(MIG, 'r.qty_received + r.qty > r.qty_ordered AND NOT coalesce(p_allow_over, false)', 'false')],
  ['wrong lock order rank', rep(MIG, 'ORDER BY 2, 1 ', 'ORDER BY 1, 2 ')],
  ['deleted item received', rep(MIG, 'IF NOT FOUND OR NOT v_active THEN', 'IF NOT FOUND THEN')],
  ['batch before quantity', rep(MIG, "    UPDATE public.inventory_items SET quantity = quantity + r.qty WHERE id = r.item_id;\n    v_batch := NULL;", "    v_batch := NULL;")],
  ['movement not tied to the receipt', rep(MIG, "'استلام طلبية', v_batch, v_receipt);", "'استلام طلبية', v_batch, NULL);")],
  ['read-only allowed to receive', rep(MIG, "IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;\n  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'\n     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN\n    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';\n  END IF;\n  IF (SELECT count(DISTINCT e->>'line_id')", "IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'\n     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN\n    RAISE EXCEPTION 'bad_lines' USING ERRCODE = '22023';\n  END IF;\n  IF (SELECT count(DISTINCT e->>'line_id')")],
  ['blank qty read as received', rep('inv-po.js', "    if (s === '') return null;\n    var n = Number(s);\n    return (isFinite(n) && n > 0)", "    if (s === '') return 1;\n    var n = Number(s);\n    return (isFinite(n) && n > 0)")],
  ['currencies mixed in totals', rep('inv-po.js', "var c = l.currency || 'SYP';", "var c = 'SYP';")],
  ['prices sent to the supplier', rep('inv-po.js', "current: it.quantity, level: it.reorder_level };", "current: it.quantity, level: it.reorder_level, price: l.unit_price };")],
  ['receive without the read-only guard', rep('inventory.html', "async function _poReceive_inner() {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;\n", "async function _poReceive_inner() {\n")],
  ['over-receive sent without asking', rep('inventory.html', '  if (over.length) {\n    var names', '  if (false) {\n    var names')],
  ['order list without the sequence guard', rep('inventory.html', '    if (seq !== _poSeq) return;\n    if (r.error) throw r.error;\n    var rows = r.data', '    if (r.error) throw r.error;\n    var rows = r.data')],
  ['amount passed in the expense link', rep('inventory.html', "'&cur=' + encodeURIComponent(cur);", "'&cur=' + encodeURIComponent(cur) + '&amount=0';")],
  ['expenses links twice', rep('expenses.html', '.is(col, null)', '')],
  ['expenses keeps the link after close', rep('expenses.html', "  editingExpId = null;\n  _invReceiptLink = null;   // C3: الإغلاقُ", "  editingExpId = null;\n  // C3: الإغلاقُ")],
  ['expenses links on edit', rep('expenses.html', 'if (!editingExpId && _invReceiptLink) await', 'if (_invReceiptLink) await')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-po: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-po: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
