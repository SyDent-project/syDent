/* v572 — مثبتُ رقم الدفعة (LOT) وتتبّعه للمريض (M173 + inv-trace.js + inv-consume.js + الصفحات الثلاث) — مستقل، على الملفات الحيّة.
   (١) الهجرة: lot_no مشذَّبٌ ومحدود · الاستلامُ يُنشئ دفعةً بصلاحيةٍ أو برقمٍ وحده · الخصمُ يأخذ الدفعةَ المختارة أولاً ثم FEFO،
       ويرفض دفعةَ صنفٍ آخر أو منتهية أو غريبة · ترتيبُ القفل بعد إضافة العمود (ORDER BY 1, 5);
   (٢) inv-trace.js بعميلٍ مصطنع: مرضى الدفعة مجمَّعون ومرتّبون والمصروفُ بلا جلسة يُعلَن · موادُّ المريض الأحدثُ أولاً ·
       العرضُ مهرَّب والرقمُ معزولٌ LTR · أسطرُ Excel;
   (٣) الربط: نافذتا الخصم تعرضان «الدفعة (LOT)» وتمرّران المختارة · الشراءُ اليدوي والاستلامُ يحملان LOT · بطاقةُ المريض
       كسولةٌ بحارس تسلسل ومخفيّةٌ بلا مواد · «👥» قراءةٌ بحتة · السجلُّ يعرض LOT · الأصلُ محمَّلٌ وبالفليت.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function fakeSb(rows) {
  return { from: () => { const q = { select() { return q; }, eq() { return q; }, then(res) { return Promise.resolve({ data: rows, error: null }).then(res); } }; return q; } };
}

async function suite(F) {
  const M = F['migrations/173_inventory_lot_trace.sql'];
  ok(/ADD COLUMN IF NOT EXISTS lot_no text/.test(M) && /CHECK \(lot_no IS NULL OR char_length\(btrim\(lot_no\)\) BETWEEN 1 AND 60\)/.test(M), 'migration: lot_no trimmed and bounded');
  ok(/left\(nullif\(btrim\(coalesce\(e->>'lot', ''\)\), ''\), 60\) AS lot/.test(M) && /IF r\.expiry IS NOT NULL OR r\.lot IS NOT NULL THEN/.test(M) && /expiry_date, lot_no, note\)\s+VALUES \(v_uid, l\.item_id, r\.qty, r\.expiry, r\.lot,/.test(M), 'receive: a batch from an expiry or a LOT alone');
  const cons = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_consume'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_consume'));
  ok(/nullif\(e->>'batch_id', ''\)::uuid AS batch_id,/.test(cons) && /ORDER BY 1, 5/.test(cons), 'consume: optional batch_id, lock order kept on the ordinal');
  ok(/b\.id = r\.batch_id AND b\.item_id = r\.item_id AND b\.owner_id = v_uid AND b\.is_finished = false FOR UPDATE;\s+IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_available'/.test(cons), 'consume: chosen batch must be this item, owned and open');
  ok(cons.indexOf('v_t := least(v_take, coalesce(v_bq, 0));') > 0 && cons.indexOf('inventory_fefo_take(r.item_id, v_take - v_t') > cons.indexOf('v_t := least(v_take'), 'consume: chosen batch first, the rest FEFO');
  ok(/SECURITY INVOKER/.test(cons) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(cons), 'consume: invoker rights, read-only refused');
  ok(/GRANT EXECUTE ON FUNCTION public\.inventory_consume\(jsonb, text\) TO authenticated/.test(M) && /REVOKE ALL ON FUNCTION public\.inventory_consume\(jsonb, text\) FROM PUBLIC, anon/.test(M), 'grants kept');
  ok(/"lot_no" "text"/.test(F['db/schema.sql']) && /inventory_batches_lot_len/.test(F['db/schema.sql']), 'schema.sql mirrors M173');

  let T;
  try { const ctx = { window: { SyDentFetchAll: b => b() }, console }; vm.createContext(ctx); vm.runInContext(F['inv-trace.js'], ctx); T = ctx.window.SyDentInvTrace; }
  catch (e) { ok(false, 'inv-trace throws: ' + e.message); return; }
  const bp = await T.batchPatients(fakeSb([
    { change: -1, created_at: '2026-10-01T10:00:00Z', patient_id: 'p1', patient: { name: 'سارة <a>', phone: '0933' } },
    { change: -2, created_at: '2026-10-02T10:00:00Z', patient_id: 'p1', patient: { name: 'سارة <a>', phone: '0933' } },
    { change: -1, created_at: '2026-09-01T10:00:00Z', patient_id: 'p2', patient: { name: 'علي' } },
    { change: -3, created_at: '2026-09-02T10:00:00Z', patient_id: null }]), 'u', 'b');
  ok(bp.ok && bp.rows.length === 2 && bp.rows[0].patient_id === 'p1' && bp.rows[0].qty === 3 && bp.rows[0].first < bp.rows[0].last && bp.unlinked === 3, 'batchPatients: one row per patient, latest first, unlinked counted');
  const xr = T.batchRows(bp.rows);
  ok(xr.length === 2 && xr[0].length === T.BATCH_HEADERS.length && xr[0][2] === 3, 'batch Excel rows aligned');
  const pm = await T.patientMaterials(fakeSb([
    { id: 1, change: -1, created_at: '2026-09-01T10:00:00Z', item: { name: 'زرعة <3.5>', unit: 'قطعة' }, batch: { lot_no: 'L<1>', expiry_date: '2029-01-31' } },
    { id: 2, change: -2, created_at: '2026-10-01T10:00:00Z', item: { name: 'بنج', unit: '' }, batch: null }]), 'u', 'p');
  ok(pm.ok && pm.rows[0].id === 2 && pm.rows[1].lot === 'L<1>', 'patientMaterials: latest first, LOT kept');
  const ph = T.patientHtml(pm.rows);
  ok(ph.indexOf('زرعة &lt;3.5&gt;') > -1 && /<span class="cbadge tone tone-cyan" dir="ltr">LOT L&lt;1&gt;<\/span>/.test(ph) && /صلاحية 31\/01\/2029/.test(ph) && ph.indexOf('<1>') === -1, 'patientHtml: escaped, LOT isolated LTR');
  ok(T.patientHtml([]) === '', 'patientHtml: nothing without materials');
  ok(T.lotText({ lot_no: 'X', expiry_date: '2027-05-01' }) === 'LOT X · صلاحية 01/05/2027' && T.lotText({}) === '', 'lotText');

  const PP = F['patient-profile.html'], AP = F['appointments.html'], INV = F['inventory.html'];
  [['patient-profile.html', 'mat-deduct-lot', '#matDeductRows'], ['appointments.html', 'appt-mat-deduct-lot', '#apptMatDeductRows']].forEach(([f, cls, host]) => {
    const S = F[f];
    ok(new RegExp("window\\.SyDentInvConsume\\.lotSelectHtml\\('" + cls + "', idx, m\\.lots\\)").test(S) && /await window\.SyDentInvConsume\.loadLots\(window\.sb, currentUser\.id,/.test(S), f + ': LOT picker rendered from the owner\'s numbered batches');
    ok(S.indexOf("document.querySelector('" + host + " ." + cls + "[data-idx=\"' + idx + '\"]')") > -1 && /batch_id: \(lotSel && lotSel\.value\) \|\| null/.test(S), f + ': chosen LOT sent as batch_id');
  });
  const lp = fnSrc(PP, 'async function ppLoadMaterials(force) {');
  ok(/var seq = \+\+_ppMatSeq;/.test(lp) && /if \(seq !== _ppMatSeq\) return;/.test(lp), 'patient card: sequence guard (#705)');
  ok(/card\.style\.display = r\.rows\.length \? '' : 'none';/.test(lp) && /تعذّر تحميل المواد المستعملة/.test(lp), 'patient card: hidden without materials, failure announced (#699)');
  ok(/if \(name === 'sessions'\) ppLoadMaterials\(\);/.test(PP), 'patient card: lazy on the sessions tab');
  ok(/if \(res\.ok\) \{ _ppMatLoaded = false;/.test(PP), 'patient card: refreshed after a deduction');
  ok(/batchPayload\(itemId, q, expVal, note, lot\)/.test(INV) && /lot_no: lot \|\| null/.test(INV), 'batch payload carries the LOT');
  ok(/if \(expVal \|\| lotVal\) \{\s+try \{\s+await window\.sb\.from\('inventory_batches'\)\.insert\(batchPayload\(moveItemId, q, expVal, note, lotVal\)\)/.test(INV), 'manual purchase: a batch from an expiry or a LOT');
  ok(/data-po="lot"/.test(INV) && /lot: el\.querySelector\('\[data-po=lot\]'\)\.value/.test(INV), 'receive view: LOT field sent');
  const tr = fnSrc(INV, 'async function openBatchTrace(batchId) {');
  ok(tr.length > 200 && !/\.(insert|update|delete|upsert|rpc)\(/.test(tr) && /var seq = \+\+_traceSeq;/.test(tr) && /if \(seq !== _traceSeq\) return;/.test(tr), 'trace window: read-only, sequence guarded');
  ok(/escapeHtml\(x\.name\)/.test(tr) && /encodeURIComponent\(x\.patient_id\)/.test(tr), 'trace window: names escaped, links encoded');
  ok(/\.from\('inventory_batches'\)\.select\('id, item_id, quantity, received_qty, expiry_date, lot_no, is_finished'\)[\s\S]*?\.eq\('owner_id', currentUser\.id\)\.maybeSingle\(\)/.test(tr) && /if \(!br\.error && br\.data\) b = br\.data;/.test(tr) && /دفعة منتهية\/مستهلكة/.test(tr), 'trace window: a finished batch is fetched by itself (v575)');
  ok(/onclick="openBatchTrace\(\\'' \+ escapeHtml\(m\.batch_id\) \+ '\\'\)"/.test(fnSrc(INV, 'function histNote(m) {')) && /batch_id, patient:patients\(name\)/.test(INV), 'history: «👥 المرضى» on every batch row (v575)');
  ok(/batch:inventory_batches\(expiry_date, lot_no\)/.test(INV) && /escapeHtml\('LOT ' \+ m\.batch\.lot_no\)/.test(INV), 'history shows the LOT');
  ok(!/html\[data-sub-level="read"\] :is\([^\n]*openBatchTrace/.test(INV), 'trace stays visible in read mode');
  [['inventory.html', 'inv-po.js'], ['patient-profile.html', 'inv-consume.js']].forEach(([f, after]) => {
    const S = F[f], iA = S.indexOf('<script src="' + after + '?v='), iT = S.indexOf('<script src="inv-trace.js?v=');
    ok(iT > iA && (S.match(/inv-trace\.js\?v=/g) || []).length === 1, f + ': inv-trace.js loaded once after ' + after);
  });
  ok((F['scripts/cache-bust.sh'].match(/inv-trace/g) || []).length === 3, 'cache-bust: inv-trace.js in the fleet');
  ok(/if \(lot\) o\.lot = lot\.slice\(0, 60\);/.test(F['inv-po.js']), 'inv-po: LOT in the receive payload');
}

const FILES = ['migrations/173_inventory_lot_trace.sql', 'db/schema.sql', 'inv-trace.js', 'inv-po.js', 'patient-profile.html', 'appointments.html', 'inventory.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/173_inventory_lot_trace.sql';
const MUTANTS = [
  ['LOT alone makes no batch', rep(MIG, 'IF r.expiry IS NOT NULL OR r.lot IS NOT NULL THEN', 'IF r.expiry IS NOT NULL THEN')],
  ['batch of another item accepted', rep(MIG, 'WHERE b.id = r.batch_id AND b.item_id = r.item_id AND b.owner_id = v_uid', 'WHERE b.id = r.batch_id AND b.owner_id = v_uid')],
  ['lock order on the wrong ordinal', rep(MIG, '     ORDER BY 1, 5', '     ORDER BY 1, 4')],
  ['unlinked uses hidden', rep('inv-trace.js', "if (!m.patient_id) { unlinked += Math.abs(num(m.change)); return; }", "if (!m.patient_id) { return; }")],
  ['LOT unescaped on the card', rep('inv-trace.js', "esc('LOT ' + r.lot)", "('LOT ' + r.lot)")],
  ['chosen LOT ignored (profile)', rep('patient-profile.html', 'batch_id: (lotSel && lotSel.value) || null', 'batch_id: null')],
  ['chosen LOT ignored (appointments)', rep('appointments.html', 'batch_id: (lotSel && lotSel.value) || null', 'batch_id: null')],
  ['patient card without sequence guard', rep('patient-profile.html', '  if (seq !== _ppMatSeq) return;\n', '')],
  ['manual LOT dropped', rep('inventory.html', 'batchPayload(moveItemId, q, expVal, note, lotVal)', 'batchPayload(moveItemId, q, expVal, note)')],
  ['receive LOT dropped', rep('inv-po.js', '      if (lot) o.lot = lot.slice(0, 60);', '')],
  ['finished batch not fetched', rep('inventory.html', "      if (!br.error && br.data) b = br.data;\n", '')],
  ['trace name unescaped', rep('inventory.html', '"><strong>\' + escapeHtml(x.name) + \'</strong></a>', '"><strong>\' + x.name + \'</strong></a>')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-trace: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-trace: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
