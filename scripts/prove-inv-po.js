/* v571 — مثبتُ الموردين والطلبيات والاستلام الجزئي (M172 + inv-po.js + المخزون + المصاريف) — مستقل، على الملفات الحيّة.
   (١) الهجرة: الجداولُ الأربعة بـRLS المالك وبوابةِ الاشتراك المشتركة · حرّاسُ ملكية (#694) على كل عمود ربط (المورّد · الطلبية ·
       الصنف · المصروفان · سطرُ الطلبية والاستلامُ على الحركة) · الاستلام: قفلٌ بترتيب الأصناف · الكميةُ قبل الدفعة · لا فوق
       المطلوب إلا بتأكيد · لا استلامَ لملغاة · المجاميعُ لكل عملة على حدة · وضعُ القراءة;
   (٢) inv-po.js بثوابت ذاتية: الحالةُ المشتقّة · المتبقّي · حمولةُ الاستلام (الفارغُ لا يُرسل) · الأسطرُ الزائدة · مبالغُ الاستلام ·
       الرابطُ العميق للمصاريف · رقمُ واتساب المورّد;
   (٣) الربط: الحفظُ كطلبية والاستلامُ عبر الـRPC وحدها · الكتاباتُ محروسةٌ ومخفيّةٌ بالقراءة · البطاقةُ ثانويةٌ بحارس تسلسل
       ومصفّحة · المصاريف: الرابطُ يعبّي ولا يحفظ (#690)، المبلغُ من القاعدة، والربطُ بعد الحفظ فقط وبعمود عملته ولو فارغاً;
   (٤) المصاريف بـDOM مصطنع: رابطٌ ⇒ النافذةُ معبّأة · مسجّلٌ سلفاً ⇒ لا تعبئة.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const M = F['migrations/172_inventory_suppliers_orders.sql'];
  ['inventory_suppliers', 'inventory_orders', 'inventory_order_lines', 'inventory_receipts'].forEach(t => {
    ok(new RegExp('ALTER TABLE public\\.' + t + ' ENABLE ROW LEVEL SECURITY').test(M) && new RegExp("SELECT public\\._sub_guard_table\\('public\\." + t + "'\\)").test(M)
       && new RegExp('CREATE POLICY ' + t + '_owner_all ON public\\.' + t + ' FOR ALL\\s+USING \\(owner_id = \\(SELECT auth\\.uid\\(\\)\\)\\)').test(M), t + ': RLS owner + subscription gate');
  });
  ['order_supplier_not_owned', 'order_line_order_not_owned', 'order_line_item_not_owned', 'receipt_order_not_owned', 'receipt_expense_not_owned',
   'movement_order_line_not_owned', 'movement_receipt_not_owned', 'movement_count_not_owned', 'movement_batch_not_owned', 'movement_session_not_owned']
    .forEach(k => ok(new RegExp("RAISE EXCEPTION '" + k + "' USING ERRCODE = '42501'").test(M), 'guard: ' + k));
  ok(/l\.id = NEW\.order_line_id AND l\.owner_id = NEW\.owner_id AND l\.item_id = NEW\.item_id/.test(M), 'guard: an order line must be of the same item');
  ok((M.match(/e\.owner_id = NEW\.owner_id\) THEN\s+RAISE EXCEPTION 'receipt_expense_not_owned'/g) || []).length === 2, 'guard: both expense links owned');
  ok(/UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id, order_line_id, receipt_id/.test(M), 'guard: movement trigger covers every link column');
  const rv = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_receive'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_create_order'));
  ok(/SECURITY INVOKER/.test(rv) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(rv), 'receive: invoker rights, read-only refused');
  ok(/IF v_status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled'/.test(rv), 'receive: cancelled order refused');
  ok(/l\.qty_received \+ r\.qty > l\.qty_ordered AND NOT coalesce\(p_allow_over, false\) THEN\s+RAISE EXCEPTION 'over_receive'/.test(rv), 'receive: no more than ordered without explicit consent');
  ok(/ORDER BY ol0\.item_id NULLS LAST, 1/.test(rv), 'receive: items locked in item order (like M169)');
  ok(/ol\.id = r\.line_id AND ol\.order_id = p_order AND ol\.owner_id = v_uid FOR UPDATE/.test(rv), 'receive: the line must belong to this order');
  ok(rv.indexOf('UPDATE public.inventory_items SET quantity = quantity + r.qty') > 0 && rv.indexOf('UPDATE public.inventory_items SET quantity = quantity + r.qty') < rv.indexOf('INSERT INTO public.inventory_batches'), 'receive: quantity before the batch (M169 invariant)');
  ok(/'purchase', left\('🚚 استلام طلبية'[\s\S]*?v_batch, r\.line_id, v_receipt\)/.test(rv), 'receive: purchase movement linked to its line, receipt and batch');
  ok(/IF l\.currency = 'USD' THEN v_usd := v_usd \+ r\.qty \* v_price; ELSE v_syp := v_syp \+ r\.qty \* v_price; END IF;/.test(rv), 'receive: amounts per currency, never mixed');
  ok(/RAISE EXCEPTION 'duplicate_line'/.test(rv), 'receive: one entry per line');
  const co = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_create_order'), M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_receive'));
  ok(/i\.owner_id = v_uid AND i\.is_active;/.test(co) && /coalesce\(r\.price, v_price\), coalesce\(v_cur, 'SYP'\)/.test(co), 'create: owned active items, price defaults to the recorded one in the item currency');
  ok(/GRANT EXECUTE ON FUNCTION public\.inventory_receive\(uuid, jsonb, boolean\) TO authenticated/.test(M) && /REVOKE ALL ON FUNCTION public\.inventory_receive\(uuid, jsonb, boolean\) FROM PUBLIC, anon/.test(M), 'grants');
  ok(/"inventory_receipts"/.test(F['db/schema.sql']) && /inventory_movements_receipt_id_fkey/.test(F['db/schema.sql']), 'schema.sql mirrors M172');

  let P;
  try { const ctx = { window: { SyDentPhone: { tidy: s => String(s || '').replace(/\s/g, '') } }, console }; vm.createContext(ctx); vm.runInContext(F['inv-po.js'], ctx); P = ctx.window.SyDentInvPO; }
  catch (e) { ok(false, 'inv-po throws: ' + e.message); return; }
  const L = [{ id: 'a', qty_ordered: 10, qty_received: 0 }, { id: 'b', qty_ordered: 5, qty_received: 0 }];
  ok(P.status({ status: 'open' }, L).key === 'placed' && P.status({ status: 'cancelled' }, L).key === 'cancelled', 'status: placed / cancelled');
  ok(P.status({}, [{ qty_ordered: 10, qty_received: 4 }, { qty_ordered: 5, qty_received: 0 }]).key === 'partial', 'status: partial');
  ok(P.status({}, [{ qty_ordered: 10, qty_received: 10 }, { qty_ordered: 5, qty_received: 6 }]).key === 'received', 'status: received (over counts)');
  ok(P.remaining({ qty_ordered: 10, qty_received: 4 }) === 6 && P.remaining({ qty_ordered: 5, qty_received: 6 }) === 0, 'remaining never negative');
  const rl = P.receiveLines([{ line_id: 'a', qty: '6', expiry: '2027-01-31', price: '' }, { line_id: 'b', qty: '', expiry: '', price: '3' }, { line_id: 'c', qty: '2', expiry: 'x', price: '4.5' }]);
  ok(rl.length === 2 && rl[0].expiry === '2027-01-31' && !('unit_price' in rl[0]) && rl[1].line_id === 'c' && !('expiry' in rl[1]) && rl[1].unit_price === 4.5, 'receiveLines: blank skipped, bad date dropped, price only when typed');
  ok(P.overLines([{ line_id: 'a', qty: 11 }, { line_id: 'b', qty: 5 }], L).length === 1, 'overLines');
  const ra = P.receiptAmounts({ amount_syp: 40, amount_usd: 6, expense_syp_id: 'e1', expense_usd_id: null });
  ok(ra.list.length === 2 && ra.pending === 1 && ra.list[1].cur === 'USD', 'receiptAmounts: per currency, pending counted');
  ok(P.receiptAmounts({ amount_syp: 0, amount_usd: 0 }).list.length === 0, 'receiptAmounts: unpriced receipt has no expense');
  ok(P.expenseUrl('r&1', 'USD') === 'expenses.html?inv_receipt=r%261&cur=USD' && P.expenseUrl('r', 'X') === 'expenses.html?inv_receipt=r&cur=SYP', 'expenseUrl encoded, currency whitelisted');
  ok(P.waNumber('0933000000') === '963933000000' && P.waNumber('+491701234567') === '491701234567' && P.waNumber('') === '' && P.waNumber('123') === '', 'waNumber');

  const INV = F['inventory.html'], EXP = F['expenses.html'];
  const sv = fnSrc(INV, 'async function _ivoSaveOrder_inner() {');
  ok(/blockReadOnly\(\)\) return;/.test(sv.split('\n')[1] || '') && /window\.sb\.rpc\('inventory_create_order'/.test(sv) && !/\.from\(/.test(sv), 'save as order: RPC only, read-only guarded');
  const pr = fnSrc(INV, 'async function _poReceive_inner() {');
  ok(/blockReadOnly\(\)\) return;/.test(pr.split('\n')[1] || '') && /window\.sb\.rpc\('inventory_receive', \{ p_order: x\.o\.id, p_lines: L, p_allow_over: over\.length > 0 \}\)/.test(pr) && !/\.from\(/.test(pr), 'receive: RPC only, read-only guarded, over only after consent');
  ok(/over\.length && !await SyDialog\.confirm/.test(pr), 'receive: over-receipt asks first');
  ok(/unpriced \? ' · ⚠️ ' \+ unpriced \+ ' بلا سعر/.test(pr), 'receive: unpriced lines announced (#689)');
  ['saveSupplier', 'editSupplier', 'hideSupplier', 'ivoSaveOrder', 'poOpenReceive', 'poCancel', 'poReceive'].forEach(n =>
    ok(new RegExp('html\\[data-sub-level="read"\\] :is\\([^\\n]*\\[onclick\\*="' + n + '\\("\\]').test(INV), 'read mode hides ' + n));
  const lo = fnSrc(INV, 'async function loadOrders(more) {');
  ok(/var seq = \+\+_poSeq;/.test(lo) && (lo.match(/if \(seq !== _poSeq\) return;/g) || []).length === 2 && /SyDentFetchAll/.test(lo) && /ids\.slice\(i, i \+ 150\)/.test(lo), 'orders: sequence guard, paged, chunked .in()');
  ok(/\.limit\(_poShown \+ 1\)/.test(lo) && /_poMore = os\.length > _poShown; if \(_poMore\) os = os\.slice\(0, _poShown\);/.test(lo) && /onclick="loadOrders\(true\)">⬇️ عرض طلبيات أقدم/.test(INV), 'orders: «older orders» paging instead of a silent cap (v575)');
  ok(/await loadItems\(\);\n    loadOrders\(\);/.test(INV), 'orders card does not delay the items (#687)');
  ok(/escapeHtml\(window\.SyDentInvPO\.expenseUrl\(r\.id, x\.cur\)\)/.test(INV), 'expense link escaped');
  ok(/escapeHtml\(sp\.name\)/.test(fnSrc(INV, 'function renderSuppliers() {')) && /escapeHtml\(poSupName\(x\.o\)\)/.test(fnSrc(INV, 'function renderOrders() {')), 'names escaped');
  const mo = fnSrc(EXP, 'async function maybeOpenFromReceipt() {');
  ok(/\.from\('inventory_receipts'\)[\s\S]*?\.eq\('owner_id', currentUser\.id\)/.test(mo) && !/insert\(|\.update\(/.test(mo), 'expenses: the link reads the receipt, writes nothing');
  ok(/var amount = Number\(cur === 'USD' \? rec\.amount_usd : rec\.amount_syp\)/.test(mo), 'expenses: amount from the database, not the URL');
  ok(/if \(cur === 'USD' \? rec\.expense_usd_id : rec\.expense_syp_id\) \{ showToast\('✓ هالاستلام مسجّل مصروف من قبل'\); return; \}/.test(mo), 'expenses: already linked ⇒ no second expense');
  const se = fnSrc(EXP, 'async function saveExpense() {');
  ok(/if \(_invReceiptLink && !editingExpId && res\.data && res\.data\.id\)/.test(se) && se.indexOf('_invReceiptLink && !editingExpId') > se.indexOf("if (res.error) {"), 'expenses: link only after a successful new save');
  ok(/_col = row\.currency === 'USD' \? 'expense_usd_id' : 'expense_syp_id'/.test(se) && /\.is\(_col, null\)/.test(se), 'expenses: linked in its currency column, only if still empty');
  ok(/_invReceiptLink = null;   \/\* M172: الإغلاقُ بلا حفظ يفكّ الربط \*\//.test(EXP) && /function openExpenseModal\(\) \{\n  editingExpId = null;\n  _invReceiptLink = null;/.test(EXP), 'expenses: closing or a fresh add drops the link');
  ok((INV.match(/inv-po\.js\?v=/g) || []).length === 1 && INV.indexOf('<script src="inv-po.js?v=') > INV.indexOf('<script src="inv-count.js?v='), 'inv-po.js loaded once');
  ok((F['scripts/cache-bust.sh'].match(/inv-po/g) || []).length === 3, 'cache-bust: inv-po.js in the fleet');

  /* (٤) المصاريف بـDOM مصطنع */
  for (const linked of [false, true]) {
    const els = {}, $ = id => els[id] || (els[id] = { value: '' });
    let opened = 0, toasts = [];
    const ctx = { console, URLSearchParams, location: { search: '?inv_receipt=R1&cur=USD', pathname: '/expenses.html' }, history: { replaceState() {} },
      currentUser: { id: 'u' }, $, showToast: t => toasts.push(t), openExpenseModal: () => { opened++; }, categories: [{ id: 'c1', name: 'رواتب' }, { id: 'c2', name: 'مواد سنية' }],
      window: { SyDentCurPick: { set: (id, c) => { $('cur').value = c; } }, sb: { from: t => {
        const q = { select() { return q; }, eq() { return q; }, maybeSingle() {
          return Promise.resolve(t === 'inventory_receipts'
            ? { data: { id: 'R1', order_id: 'O1', amount_syp: 0, amount_usd: 12.5, expense_syp_id: null, expense_usd_id: linked ? 'E9' : null }, error: null }
            : { data: { supplier_id: 'S', inventory_suppliers: { name: 'مستودع <x>' } }, error: null }); } };
        return q; } } } };
    vm.createContext(ctx);
    try {
      vm.runInContext('var _invReceiptLink = null;\n' + mo + '\nthis.__m = maybeOpenFromReceipt; this.__l = function(){ return _invReceiptLink; };', ctx);
      await ctx.__m();
      if (!linked) ok(opened === 1 && $('eAmount').value === 12.5 && $('cur').value === 'USD' && $('eVendor').value === 'مستودع <x>' && $('eCategory').value === 'c2' && ctx.__l().id === 'R1', 'expenses: the link fills amount, currency, supplier and the materials category');
      else ok(opened === 0 && ctx.__l() === null && /من قبل/.test(toasts[0] || ''), 'expenses: an already-linked receipt is not filled again');
    } catch (e) { ok(false, 'expenses link throws: ' + e.message); }
  }
}

const FILES = ['migrations/172_inventory_suppliers_orders.sql', 'db/schema.sql', 'inv-po.js', 'inventory.html', 'expenses.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/172_inventory_suppliers_orders.sql';
const MUTANTS = [
  ['receipts without the subscription gate', rep(MIG, "SELECT public._sub_guard_table('public.inventory_receipts');", '')],
  ['foreign expense linkable', rep(MIG, "(SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_usd_id AND e.owner_id = NEW.owner_id) THEN\n    RAISE EXCEPTION 'receipt_expense_not_owned'", "(SELECT 1 FROM public.expenses e WHERE e.id = NEW.expense_usd_id) THEN\n    RAISE EXCEPTION 'receipt_expense_not_owned'")],
  ['over-receipt silent', rep(MIG, 'AND NOT coalesce(p_allow_over, false) THEN', 'AND false THEN')],
  ['cancelled order receivable', rep(MIG, "IF v_status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled' USING ERRCODE = '22023'; END IF;", '')],
  ['currencies mixed', rep(MIG, "IF l.currency = 'USD' THEN v_usd := v_usd + r.qty * v_price; ELSE v_syp := v_syp + r.qty * v_price; END IF;", 'v_syp := v_syp + r.qty * v_price;')],
  ['line of another order', rep(MIG, 'WHERE ol.id = r.line_id AND ol.order_id = p_order AND ol.owner_id = v_uid FOR UPDATE', 'WHERE ol.id = r.line_id AND ol.owner_id = v_uid FOR UPDATE')],
  ['status partial missed', rep('inv-po.js', "if (L.some(function (l) { return num(l.qty_received) > 0; })) return STATUS.partial;", '')],
  ['blank quantity sent', rep('inv-po.js', "if (q === '' || !(Number(q) > 0)) return;", "if (false) return;")],
  ['expense link unescaped currency', rep('inv-po.js', "'&cur=' + (cur === 'USD' ? 'USD' : 'SYP')", "'&cur=' + cur")],
  ['older orders unreachable', rep('inventory.html', '_poMore = os.length > _poShown; if (_poMore) os = os.slice(0, _poShown);', '_poMore = false;')],
  ['receive without read-only guard', rep('inventory.html', "async function _poReceive_inner() {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;\n", "async function _poReceive_inner() {\n")],
  ['receive visible in read mode', rep('inventory.html', ',[onclick*="poReceive("]', '')],
  ['amount trusted from the URL', rep('expenses.html', "var amount = Number(cur === 'USD' ? rec.amount_usd : rec.amount_syp) || 0;", "var amount = Number(q.get('amount')) || 0;")],
  ['second expense for a linked receipt', rep('expenses.html', "if (cur === 'USD' ? rec.expense_usd_id : rec.expense_syp_id) { showToast('✓ هالاستلام مسجّل مصروف من قبل'); return; }", '')],
  ['link overwrites an existing one', rep('expenses.html', ".is(_col, null);", ";")]
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
