/* v570 — مثبتُ الجرد الدوري (M171 + inv-count.js + صفحة المخزون) — مستقل، على الملفات الحيّة.
   (١) الهجرة: الجدولان بـRLS المالك + بوابةُ الاشتراك بالدالّة المشتركة · سببُ «count» · count_id بحارس ملكية (#694) ·
       حارسُ سطور الجرد · RPC: كلُّها أو لا شيء · قفلٌ بترتيب · الفرقُ = المعدود − ما رآه العادّ والكميةُ = الحالية + الفرق ·
       النقصُ من الدفعات بـFEFO والزيادةُ بلا دفعة · لا تكرار · لا سالب · السعرُ والعملةُ لحظةَ الجرد · وضعُ القراءة;
   (٢) inv-count.js بثوابت ذاتية: الفارغُ لم يُعدّ · الفرقُ · القيمةُ لكل عملةٍ (نقص/زيادة/صافٍ) بلا خلط وبسعر وقت الجرد ·
       بلا سعر يُعلَن · الورقةُ العمياء بلا كمية النظام · التقريرُ مهرَّب وأرقامُه معزولة LTR (#704) · إكسل;
   (٣) الربط: نافذةُ الجرد تستدعي الـRPC وحده · العدُّ الجزئي · تبويبُ السابقة كسولٌ بحارس تسلسل (#705) ومصفّح (#706) ·
       الاعتمادُ مخفيٌّ بالقراءة ومحروس · السجلُّ يعرف «جرد» · الأصلُ محمَّلٌ مرةً وبالفليت;
   (٤) النافذة بـDOM مصطنع: «بالنظام» لقطةُ الفتح، والفارغُ لا يُرسل، والحمولةُ للـRPC.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const M = F['migrations/171_inventory_counts.sql'];
  ok(/ALTER TABLE public\.inventory_counts ENABLE ROW LEVEL SECURITY/.test(M) && /ALTER TABLE public\.inventory_count_lines ENABLE ROW LEVEL SECURITY/.test(M), 'migration: RLS on both tables');
  ok(/SELECT public\._sub_guard_table\('public\.inventory_counts'\)/.test(M) && /SELECT public\._sub_guard_table\('public\.inventory_count_lines'\)/.test(M), 'migration: subscription gate through the shared helper');
  ok((M.match(/USING \(owner_id = \(SELECT auth\.uid\(\)\)\) WITH CHECK \(owner_id = \(SELECT auth\.uid\(\)\)\)/g) || []).length === 2, 'migration: owner policy on both tables');
  ok(/reason = ANY \(ARRAY\['purchase', 'consume', 'adjust', 'return', 'count'\]\)/.test(M), 'migration: reason «count» added, nothing removed');
  ok(/RAISE EXCEPTION 'movement_count_not_owned'/.test(M) && /UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id, count_id ON public\.inventory_movements/.test(M), 'migration: count_id under the movement guard');
  ok(/RAISE EXCEPTION 'count_line_count_not_owned'/.test(M) && /RAISE EXCEPTION 'count_line_item_not_owned'/.test(M), 'migration: count-line ownership guard');
  ['movement_item_not_owned', 'movement_session_not_owned', 'movement_patient_not_owned', 'movement_provider_not_owned', 'movement_batch_not_owned']
    .forEach(k => ok(new RegExp("RAISE EXCEPTION '" + k + "'").test(M), 'migration: M169 guard kept — ' + k));
  const fn = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_apply_count'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_apply_count'));
  ok(/SECURITY INVOKER/.test(fn) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(fn), 'apply: invoker rights, read-only refused');
  ok(/RAISE EXCEPTION 'duplicate_item'/.test(fn), 'apply: one line per item');
  ok(/r\.counted < 0/.test(fn) && /RAISE EXCEPTION 'bad_line'/.test(fn), 'apply: no negative count');
  ok(/i\.owner_id = v_uid AND i\.is_active FOR UPDATE/.test(fn) && /ORDER BY 1\n/.test(fn), 'apply: owned active items, locked in order');
  ok(/v_var := r\.counted - r\.seen;/.test(fn) && /v_new := greatest\(v_q \+ v_var, 0\);/.test(fn) && /v_var := v_new - v_q;/.test(fn), 'apply: variance against what the counter saw, interim movements kept, clamped at zero');
  ok(/inventory_fefo_take\(r\.item_id, -v_var, v_today, false\)/.test(fn) && /'count', 'جرد: نقص', s\.batch_id, v_count/.test(fn), 'apply: shortage leaves the batches FEFO, one movement per slice');
  ok(fn.indexOf('inventory_fefo_take(r.item_id') < fn.indexOf('UPDATE public.inventory_items SET quantity = v_new WHERE id = r.item_id;'), 'apply: batches before the item on a shortage');
  ok(/v_var, 'count', 'جرد: زيادة', v_count\)/.test(fn), 'apply: surplus as one unbatched movement');
  ok(/expected, counted, variance, unit_price, currency\)\s*VALUES \(v_uid, v_count, r\.item_id, r\.seen, r\.counted, v_var, v_price, v_cur\)/.test(fn), 'apply: line keeps the price and currency of the moment');
  ok(/GRANT EXECUTE ON FUNCTION public\.inventory_apply_count\(jsonb, text\) TO authenticated/.test(M) && /FROM PUBLIC, anon/.test(M), 'grants: authenticated only');
  const SCH = F['db/schema.sql'];
  ok(/"inventory_count_lines"/.test(SCH) && /'count'::"text"/.test(SCH) && /inventory_movements_count_id_fkey/.test(SCH), 'schema.sql mirrors M171');

  let C;
  try { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(F['inv-count.js'], ctx); C = ctx.window.SyDentInvCount; }
  catch (e) { ok(false, 'inv-count throws: ' + e.message); return; }
  ok(C.parse('') === null && C.parse('  ') === null && C.parse(null) === null && C.parse('-2') === null && C.parse('3.456') === 3.46 && C.parse('0') === 0, 'parse: blank = not counted, zero is a count');
  const L = C.lines([{ item_id: 'a', seen: 10, counted: '8' }, { item_id: 'b', seen: 5, counted: '' }, { item_id: 'c', seen: -2, counted: 0 }]);
  ok(L.length === 2 && L[0].counted === 8 && L[1].item_id === 'c' && L[1].seen === 0, 'lines: only counted rows; negative stock seen as zero');
  ok(C.variance(10, 8) === -2 && C.variance(4, 4.5) === 0.5, 'variance');
  const rep = C.report([
    { item_id: 'a', expected: 10, counted: 8, variance: -2, unit_price: 5000, currency: 'SYP' },
    { item_id: 'b', expected: 4, counted: 7, variance: 3, unit_price: 2, currency: 'USD' },
    { item_id: 'c', expected: 6, counted: 5, variance: -1, unit_price: null, currency: 'SYP' },
    { item_id: 'd', expected: 9, counted: 9, variance: 0, unit_price: 100, currency: 'SYP' },
    { item_id: 'e', expected: 2, counted: 3, variance: 1, unit_price: 1000, currency: 'SYP' }], { a: { name: 'بنج <x>' }, b: { name: 'كفوف' } });
  ok(rep.counted === 5 && rep.diffs === 4 && rep.unpriced === 1, 'report: counted, differences, unpriced announced');
  ok(rep.totals.SYP.short === -10000 && rep.totals.SYP.over === 1000 && rep.totals.SYP.net === -9000 && rep.totals.USD.net === 6 && rep.totals.USD.short === 0, 'report: value per currency, never mixed (short · over · net)');
  ok(rep.rows[0].item_id === 'a', 'report: biggest value first');
  const blank = C.blankSheet({ clinic: 'ع', items: [{ name: 'بنج <x>', unit: 'أمبولة' }] });
  ok(blank.indexOf('بنج &lt;x&gt;') > -1 && !/بالنظام/.test(blank) && /المعدود/.test(blank), 'blank sheet: blind (no system quantity), escaped');
  const rs = C.reportSheet({ clinic: 'ع', rep, money: (n, c) => n + ' ' + c });
  ok(rs.indexOf('بنج &lt;x&gt;') > -1 && /<bdi dir="ltr">-2<\/bdi>/.test(rs) && /<bdi dir="ltr">\+3<\/bdi>/.test(rs), 'report sheet: escaped, signed numbers isolated LTR (#704)');
  ok(/بلا سعر/.test(rs) && /بالليرة: نقص 10000 SYP · زيادة 1000 SYP · الصافي <bdi dir="ltr">-9000 SYP<\/bdi>/.test(rs), 'report sheet: totals per currency');
  const xr = C.reportRows(rep);
  ok(xr.length === 5 && xr[0].length === C.REPORT_HEADERS.length && xr[0][4] === -2 && xr[0][5] === -10000 && xr.find(r => r[0] === '—' && r[4] === -1)[5] === '', 'Excel rows aligned, unpriced left blank');

  const INV = F['inventory.html'];
  const ap = fnSrc(INV, 'async function _applyCount_inner() {');
  ok(/window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(ap.split('\n')[1] || ''), 'apply: read-only guard on the first line');
  ok(/window\.sb\.rpc\('inventory_apply_count', \{ p_lines: L, p_note: note \|\| null \}\)/.test(ap) && !/\.from\(/.test(ap), 'apply: the RPC only, no direct write');
  ok(/var applyCount = iGuarded\('applyCount'/.test(INV) && /html\[data-sub-level="read"\] :is\([^\n]*\[onclick\*="applyCount\("\][^\n]*\)\{display:none !important;\}/.test(INV), 'apply: guarded against double click, hidden in read mode');
  const lp = fnSrc(INV, 'async function loadPastCounts() {');
  ok(/var seq = \+\+_ivcPastSeq;/.test(lp) && (lp.match(/if \(seq !== _ivcPastSeq\) return;/g) || []).length === 2, 'past tab: lazy with a sequence guard (#705)');
  ok(/window\.SyDentFetchAll\(/.test(lp) && /ids\.slice\(i, i \+ 150\)/.test(lp), 'past tab: paged lines, .in() in chunks of 150');
  ok(/count: '📋 جرد'/.test(INV), 'history knows the new reason');
  ok(!/escapeHtml\(SyDT\.cell\(/.test(INV) && (INV.match(/SyDT\.cell\(k\.created_at\)/g) || []).length === 2, 'count dates: SyDT.cell HTML not escaped twice');
  ok(/data-ivc="blank"/.test(INV) && /if \(act === 'blank'\) \{[\s\S]{0,120}return window\.SyDentInvCount\.printHtml\(/.test(INV), 'blank sheet printed synchronously inside the click');
  ok(/escapeHtml\(r\.it\.name\)/.test(fnSrc(INV, 'function renderCountRows() {')) && /escapeHtml\(r\.name\)/.test(fnSrc(INV, 'function openPastCount(id) {')), 'names escaped in both views');
  const S = INV, iA = S.indexOf('<script src="inv-order.js?v='), iC = S.indexOf('<script src="inv-count.js?v=');
  ok(iC > iA && (S.match(/inv-count\.js\?v=/g) || []).length === 1, 'inv-count.js loaded once after inv-order.js');
  ok((F['scripts/cache-bust.sh'].match(/inv-count/g) || []).length === 3, 'cache-bust: inv-count.js in the fleet allow-list');

  /* (٤) النافذة */
  const els = {}, log = [];
  const get = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, setAttribute() {}, getAttribute() { return ''; } });
  get('ivcNote').value = 'قديمة';
  const ctx = { window: { SyDentSub: { blockReadOnly: () => false } }, console, document: { getElementById: get, querySelectorAll: () => [] },
    showToast() {}, openModal() {}, fmtNum: n => String(n), escapeHtml: s => String(s), SyDialog: { confirm: async () => true },
    currentUser: { id: 'u' }, _ivoLoadClinic() {}, loadItems: async () => {}, iGuarded: (n, f) => f,
    ITEMS: [{ id: 'b', name: 'كفوف', quantity: 7 }, { id: 'a', name: 'بنج', quantity: 10 }] };
  vm.createContext(ctx);
  vm.runInContext(F['inv-count.js'], ctx);
  ctx.window.sb = { rpc: (n, a) => { log.push([n, JSON.parse(JSON.stringify(a))]); return Promise.resolve({ data: { count_id: null, lines: [] }, error: null }); } };
  try {
    vm.runInContext(['var _ivc = [];', 'var _ivcPastSeq = 0;', 'var _ivoClinic = null;', 'function ivcTab() {}', 'function openPastCount() {}',
      fnSrc(INV, 'async function openCountModal() {'), fnSrc(INV, 'function ivcVarHtml(r) {'), fnSrc(INV, 'function renderCountRows() {'),
      fnSrc(INV, 'function renderCountSum() {'), 'var applyCount = iGuarded(\'applyCount\', _applyCount_inner);', fnSrc(INV, 'async function _applyCount_inner() {'),
      'this.__o = openCountModal; this.__a = applyCount; this.__s = function(){ return _ivc; };'].join('\n'), ctx);
    await ctx.__o();
    const st = ctx.__s();
    ok(st.length === 2 && st[0].it.name === 'بنج' && st[0].seen === 10, 'window: items sorted, «بالنظام» snapshotted at opening');
    ctx.ITEMS.find(x => x.id === 'a').quantity = 99;          // تتغيّر بعد الفتح — اللقطةُ لا تتبعها
    st[0].counted = '8';
    get('ivcNote').value = ' آخر الشهر ';   /* الفتحُ يفرّغ الملاحظة — تُكتب بعده */
    await ctx.__a();
    ok(log.length === 1 && log[0][0] === 'inventory_apply_count' && log[0][1].p_lines.length === 1 && log[0][1].p_lines[0].item_id === 'a'
       && log[0][1].p_lines[0].seen === 10 && log[0][1].p_lines[0].counted === 8 && log[0][1].p_note === 'آخر الشهر', 'window: only counted rows sent, with what the counter saw');
  } catch (e) { ok(false, 'count window throws: ' + e.message); }
}

const FILES = ['migrations/171_inventory_counts.sql', 'db/schema.sql', 'inv-count.js', 'inventory.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/171_inventory_counts.sql';
const MUTANTS = [
  ['count lines without the subscription gate', rep(MIG, "SELECT public._sub_guard_table('public.inventory_count_lines');", '')],
  ['foreign count accepted on a movement', rep(MIG, "RAISE EXCEPTION 'movement_count_not_owned'", "RAISE NOTICE 'movement_count_not_owned'")],
  ['interim consumption erased', rep(MIG, 'v_new := greatest(v_q + v_var, 0);', 'v_new := r.counted;')],
  ['shortage not taken from batches', rep(MIG, 'FOR s IN SELECT * FROM public.inventory_fefo_take(r.item_id, -v_var, v_today, false) LOOP', 'FOR s IN SELECT NULL::uuid AS batch_id, -v_var AS took LOOP')],
  ['duplicates allowed', rep(MIG, "RAISE EXCEPTION 'duplicate_item'", "RAISE NOTICE 'duplicate_item'")],
  ['price not kept', rep(MIG, 'r.counted, v_var, v_price, v_cur);', 'r.counted, v_var, NULL, NULL);')],
  ['blank read as zero', rep('inv-count.js', "if (s === '') return null;", "if (s === '') return 0;")],
  ['currencies mixed', rep('inv-count.js', "var cur = l.currency || 'SYP';", "var cur = 'SYP';")],
  ['blank sheet shows the system quantity', rep('inv-count.js', "'</td><td>' + esc(it.unit || '—') + '</td><td class=\"ivo-blank\"></td>", "'</td><td>' + esc(it.unit || '—') + '</td><td class=\"ivo-blank\">بالنظام</td>")],
  ['report unescaped', rep('inv-count.js', "h += '<tr><td>' + esc(r.name) + '</td>", "h += '<tr><td>' + r.name + '</td>")],
  ['apply without the read-only guard', rep('inventory.html', '  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;\n  var L = window.SyDentInvCount.lines(', '  var L = window.SyDentInvCount.lines(')],
  ['past tab without the sequence guard', rep('inventory.html', '    if (seq !== _ivcPastSeq) return;\n    _ivcPast = ', '    _ivcPast = ')],
  ['count date escaped twice', rep('inventory.html', "<strong>' + SyDT.cell(k.created_at) /* يُهرّب داخلياً */", "<strong>' + escapeHtml(SyDT.cell(k.created_at))")],
  ['seen follows the live list', rep('inventory.html', "var L = window.SyDentInvCount.lines(_ivc.map(function(r){ return { item_id: r.it.id, seen: r.seen, counted: r.counted }; }));\n  if (!L.length) { showToast", "var L = window.SyDentInvCount.lines(_ivc.map(function(r){ return { item_id: r.it.id, seen: Number(r.it.quantity || 0), counted: r.counted }; }));\n  if (!L.length) { showToast")]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-count: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-count: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
