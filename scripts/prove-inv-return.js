/* v651 — مثبتُ المرتجع للمورّد (M195 + نافذةُ الحركة بشاشة المخزون) — مستقل، على الملفات الحيّة.
   (١) الهجرة: 'return_supplier' بالقيد و'return' باقٍ · الدالّةُ SECURITY INVOKER تحت بوّابة القراءة · قفلُ الصنف ·
       لا تتجاوز المتوفّر (رفضٌ باسمه، لا قصّ) · الدفعةُ المختارة أولاً (صنفُها ومالكُها ومفتوحة) ثم FEFO · كلُّ شريحةٍ
       حركةٌ سالبة بسببها · الصلاحياتُ لـauthenticated وحده · schema.sql مرآةُ القيد.
   (٢) الشاشة: الخيارُ القديم «مرتجع» صار «إلى المخزون (إضافة +)» ويبقى طريقَ الوارد؛ الخيارُ الجديد يمرّ بالـRPC قبل أي
       كتابة مباشرة ويمرّر الدفعةَ المختارة · التحقّقُ المسبق يرفض ما فوق المتوفّر · التلميحُ يسمّي الإشارة لكل نوع ·
       السجلُّ يسمّي النوع · كلفةُ المواد (mat-cost · المحاسبة · التقرير) تقرأ consume وحده فلا يدخلها المرتجع.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const M = F['migrations/195_inventory_return_supplier.sql'];
  /* (١) الهجرة */
  ok(/ADD CONSTRAINT inv_reason_valid\s+CHECK \(reason = ANY \(ARRAY\['purchase', 'consume', 'adjust', 'return', 'count', 'return_supplier'\]\)\)/.test(M), 'migration: return_supplier added, return kept');
  const fn = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_return_supplier'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_return_supplier'));
  ok(fn.length > 0 && /SECURITY INVOKER/.test(fn) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(fn), 'fn: invoker rights under the subscription gate');
  ok(/i\.owner_id = v_uid FOR UPDATE;\s+IF NOT FOUND THEN RAISE EXCEPTION 'item_not_owned'/.test(fn), 'fn: item locked and owned');
  ok(/IF p_qty > coalesce\(v_q, 0\) THEN\s+RAISE EXCEPTION 'insufficient_stock:%'/.test(fn) && !/least\(p_qty, greatest\(v_q/.test(fn), 'fn: over stock is refused by name, never clamped');
  ok(/b\.id = p_batch AND b\.item_id = p_item AND b\.owner_id = v_uid AND b\.is_finished = false FOR UPDATE;\s+IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_available'/.test(fn), 'fn: chosen batch must be this item, owned and open');
  ok(fn.indexOf("'return_supplier', coalesce(v_note, 'مرتجع للمورّد'), p_batch)") > 0 && fn.indexOf('inventory_fefo_take(p_item, p_qty - v_t, v_today, false)') > fn.indexOf('v_t := least(p_qty'), 'fn: chosen batch first, the rest FEFO, every slice a return_supplier row');
  ok((fn.match(/VALUES \(v_uid, p_item, -/g) || []).length === 2 && (fn.match(/'return_supplier', coalesce\(v_note, 'مرتجع للمورّد'\)/g) || []).length === 2 && !/'consume'/.test(fn) && /UPDATE public\.inventory_items SET quantity = quantity - p_qty WHERE id = p_item;/.test(fn), 'fn: both slices negative and tagged return_supplier (never consume), item quantity reduced once');
  ok(/REVOKE ALL ON FUNCTION public\.inventory_return_supplier\(uuid, numeric, text, uuid\) FROM PUBLIC, anon;/.test(M) && /GRANT EXECUTE ON FUNCTION public\.inventory_return_supplier\(uuid, numeric, text, uuid\) TO authenticated, service_role;/.test(M), 'grants: authenticated only');
  /* db/schema.sql is our bootstrap snapshot (pre-M172); the constraint comes from migrations/195 in the db-bootstrap plan */
  ok(/'return_supplier'\]\)\);/.test(F['migrations/195_inventory_return_supplier.sql']), 'M195 widens the reason constraint');

  /* (٢) الشاشة */
  const INV = F['inventory.html'];
  ok(/<option value="return">مرتجع إلى المخزون \(إضافة \+\)<\/option>\s*<option value="return_supplier">مرتجع للمورّد \(خصم −\)<\/option>/.test(INV), 'modal: both returns named with their sign');
  const sm = fnSrc(INV, 'async function saveMovement() {');
  const iRS = sm.indexOf("if (reason === 'return_supplier') {\n      var _bsel"), iFresh = sm.indexOf("from('inventory_items')");
  ok(iRS > 0 && iFresh > iRS, 'inventory: supplier return through the RPC, before any direct write');
  ok(/window\.sb\.rpc\('inventory_return_supplier', \{\s*p_item: moveItemId, p_qty: q, p_note: note \|\| null, p_batch: \(_bsel && _bsel\.value\) \|\| null/.test(sm), 'inventory: RPC carries item, qty, note and the chosen batch');
  ok(/if \(reason === 'return_supplier' && q > cur\) \{[\s\S]*?showToast\('⚠️ الكمية المُرجَعة أكبر من المتوفّر/.test(sm), 'inventory: pre-check refuses more than stock');
  ok(/if \(rres\.error\) \{[^\n]*showToast\(returnSupplierErr\(rres\.error, it\), true\); return; \}/.test(sm), 'inventory: RPC error named, nothing else written');
  ok(sm.indexOf("// purchase / return = وارد") > 0 && /newQty = freshCur \+ q;/.test(sm), 'inventory: return (to stock) still adds');
  const rse = fnSrc(INV, 'function returnSupplierErr(err, it) {');
  ok(/insufficient_stock:\(\[0-9.\]\+\)/.test(rse) && /batch_not_available/.test(rse) && /read_only/.test(rse), 'errors: stock, batch and read-only named (#689)');
  const omc = fnSrc(INV, 'function onMoveReasonChange() {');
  ok(/batchGroup\.style\.display = \(reason === 'return_supplier'\) \? 'block' : 'none'/.test(omc) && /if \(reason === 'return_supplier'\) loadMoveBatches\(\);/.test(omc), 'modal: batch picker only for the supplier return, loaded lazily');
  ok(/hint\.textContent = MOVE_REASON_HINT\[reason\] \|\| ''/.test(omc) && /return: 'مادةٌ رجعت إلى عندك[^']*\(\+\)\.'/.test(INV) && /return_supplier: 'مادةٌ أعدتَها للمورّد[^']*\(−\) ولا تُحسب استهلاكاً\.'/.test(INV), 'modal: hint states the sign of each return');
  const lmb = fnSrc(INV, 'async function loadMoveBatches() {');
  ok(/\.eq\('owner_id', currentUser\.id\)\.eq\('item_id', moveItemId\)\.eq\('is_finished', false\)/.test(lmb) && /opt\.textContent = /.test(lmb) && !/innerHTML \+=/.test(lmb), 'batches: owned, this item, open; labels via textContent');
  ok(/_moveBatchesFor = null;/.test(fnSrc(INV, 'function openMoveModal(')) || /_moveBatchesFor = null;/.test(INV.slice(INV.indexOf('function openMoveModal'), INV.indexOf('function onMoveReasonChange'))), 'modal: batch cache reset per item');
  ok(/return: '↩️ مرتجع إلى المخزون', return_supplier: '📤 مرتجع للمورّد'/.test(INV), 'history: both returns named');
  /* كلفةُ المواد تقرأ consume وحده */
  ok(/if \(m\.reason && m\.reason !== 'consume'\) return;/.test(F['mat-cost.js']), 'mat-cost: consume only');
  ok(/\.eq\('reason', 'consume'\)/.test(F['accounting.html']) && /\.eq\('reason', 'consume'\)/.test(F['provider-reports.html']), 'accounting + report: consume only');
}

const FILES = ['migrations/195_inventory_return_supplier.sql', 'db/schema.sql', 'inventory.html', 'mat-cost.js', 'accounting.html', 'provider-reports.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/195_inventory_return_supplier.sql';
const MUTANTS = [
  ['over stock clamped instead of refused', rep(MIG, "IF p_qty > coalesce(v_q, 0) THEN\n    RAISE EXCEPTION 'insufficient_stock:%'", "IF false THEN\n    RAISE EXCEPTION 'insufficient_stock:%'")],
  ['item not locked', rep(MIG, 'i.owner_id = v_uid FOR UPDATE;', 'i.owner_id = v_uid;')],
  ['read-only allowed', rep(MIG, "IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;\n  IF p_item", 'IF p_item')],
  ['batch of another item accepted', rep(MIG, 'b.id = p_batch AND b.item_id = p_item AND b.owner_id = v_uid', 'b.id = p_batch AND b.owner_id = v_uid')],
  ['slice recorded as consume (enters material cost)', rep(MIG, "VALUES (v_uid, p_item, -s.took, 'return_supplier'", "VALUES (v_uid, p_item, -s.took, 'consume'")],
  ['anon may execute', rep(MIG, 'FROM PUBLIC, anon;', 'FROM PUBLIC;')],
  ['old return dropped from the constraint', rep(MIG, "'adjust', 'return', 'count', 'return_supplier'", "'adjust', 'count', 'return_supplier'")],
  ['constraint not widened', rep('migrations/195_inventory_return_supplier.sql', ", 'return_supplier']));", "]));")],
  ['supplier return back to read-then-write', rep('inventory.html', "    if (reason === 'return_supplier') {\n      var _bsel", "    if (false) {\n      var _bsel")],
  ['chosen batch dropped', rep('inventory.html', 'p_batch: (_bsel && _bsel.value) || null', 'p_batch: null')],
  ['pre-check removed', rep('inventory.html', "if (reason === 'return_supplier' && q > cur) {", 'if (false) {')],
  ['RPC error swallowed', rep('inventory.html', 'showToast(returnSupplierErr(rres.error, it), true); return; }', 'return; }')],
  ['return to stock now subtracts', rep('inventory.html', 'newQty = freshCur + q;', 'newQty = freshCur - q;')],
  ['sign dropped from the option label', rep('inventory.html', 'مرتجع للمورّد (خصم −)', 'مرتجع للمورّد')],
  ['batch picker shown for every reason', rep('inventory.html', "batchGroup.style.display = (reason === 'return_supplier') ? 'block' : 'none'", "batchGroup.style.display = 'block'")],
  ['batch labels via innerHTML', rep('inventory.html', "opt.textContent = (b.lot ? 'LOT ' + b.lot", "opt.innerHTML += (b.lot ? 'LOT ' + b.lot")],
  ['history name dropped', rep('inventory.html', "return_supplier: '📤 مرتجع للمورّد', ", '')],
  ['material cost counts every reason', rep('mat-cost.js', "if (m.reason && m.reason !== 'consume') return;", '')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-return: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-return: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
