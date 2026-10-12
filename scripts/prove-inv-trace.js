/* C3 part 2 — prover for the batch number (LOT) and tracing it to the patient (M177 + inv-trace.js + inv-consume.js + pages).
   Standalone, on the live files:
   (1) migration: lot on batches and receipt lines (≤ 60) · receive opens a batch on an expiry OR a lot and keeps the lot
       on the receipt line · consume takes the picked batch first (owned, this item, open), drops the item with it, then
       FEFO for the rest · the select keeps ord at rank 4 (#719) · grants unchanged;
   (2) inv-consume.js: batch_id rides on every split line only when picked · the picker is escaped, «تلقائياً» first;
   (3) inv-trace.js: per patient and batch sums, returns skipped, unlinked use reported apart · query stripped of
       wildcards · views escaped, numbers LTR · Excel one row per patient per batch;
   (4) wiring: both windows attach the picker after opening and send the pick · inventory: LOT on manual purchase
       and on receiving, the trace window is read-only with a sequence guard (#705) · patient card «🧪 المواد ورقم الدفعة».
   --self-test: mutants that must turn red. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const M = F['migrations/177_inventory_lot.sql'];
  ok(/ALTER TABLE public\.inventory_batches ADD COLUMN IF NOT EXISTS lot text;/.test(M) && /ALTER TABLE public\.inventory_receipt_lines ADD COLUMN IF NOT EXISTS lot text;/.test(M), 'migration: lot columns');
  ok(/CHECK \(lot IS NULL OR char_length\(lot\) BETWEEN 1 AND 60\)/.test(M), 'migration: lot length bounded');
  const rv = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_receive'), M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_consume'));
  ok(/left\(nullif\(btrim\(coalesce\(e->>'lot', ''\)\), ''\), 60\) AS lot/.test(rv), 'receive: lot trimmed and bounded');
  ok(/IF r\.expiry IS NOT NULL OR r\.lot IS NOT NULL THEN/.test(rv) && /VALUES \(v_uid, r\.item_id, r\.qty, r\.qty, r\.expiry, r\.lot, 'استلام طلبية'\)/.test(rv), 'receive: a batch on an expiry or a lot, carrying the lot');
  ok(/r\.expiry, r\.lot, v_batch\);/.test(rv), 'receive: lot kept on the receipt line');
  ok(/ORDER BY 2, 1 /.test(rv) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(rv) && /RAISE EXCEPTION 'over_ordered'/.test(rv), 'receive: M176 rules kept');
  const co = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_consume'), M.indexOf('REVOKE ALL ON FUNCTION public.inventory_receive'));
  ok(/o AS ord,\s+nullif\(e->>'batch_id', ''\)::uuid AS batch_id\s+FROM jsonb_array_elements\(p_lines\) WITH ORDINALITY AS x\(e, o\)\s+ORDER BY 1, 4 /.test(co), 'consume: batch_id added after ord, rank 4 still ord (#719)');
  ok(/b\.id = r\.batch_id AND b\.item_id = r\.item_id AND b\.owner_id = v_uid AND b\.is_finished = false FOR UPDATE/.test(co), 'consume: the picked batch must be this owner\'s, this item\'s and open');
  const iPick = co.indexOf('IF v_left > 0 AND r.batch_id IS NOT NULL THEN'), iFefo = co.indexOf('inventory_fefo_take(r.item_id, v_left');
  ok(iPick > 0 && iFefo > iPick, 'consume: picked batch before FEFO');
  ok(/UPDATE public\.inventory_items SET quantity = quantity - t WHERE id = r\.item_id;\s+v_left := v_left - t;/.test(co), 'consume: item drops with the picked slice (no phantom unbatched stock)');
  ok(/UPDATE public\.inventory_items SET quantity = quantity - v_left WHERE id = r\.item_id;/.test(co) && !/quantity - v_take/.test(co), 'consume: the rest drops after FEFO, nothing twice');
  ok(/r\.session_id, v_pat, v_prov, r\.batch_id\);/.test(co), 'consume: picked slice keeps session, patient, doctor and batch');
  ok(/SECURITY INVOKER/.test(co) && /my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(co) && /i\.owner_id = v_uid FOR UPDATE/.test(co), 'consume: M169 rights kept');
  ok(/GRANT EXECUTE ON FUNCTION public\.inventory_consume\(jsonb, text\) TO authenticated/.test(M) && /REVOKE ALL ON FUNCTION public\.inventory_consume\(jsonb, text\) FROM PUBLIC, anon/.test(M), 'grants kept');

  let C, T;
  try {
    const ctx = { window: {}, console }; vm.createContext(ctx);
    vm.runInContext(F['inv-consume.js'], ctx); vm.runInContext(F['inv-trace.js'], ctx);
    C = ctx.window.SyDentInvConsume; T = ctx.window.SyDentInvTrace;
  } catch (e) { ok(false, 'modules throw: ' + e.message); return; }
  const L = C.buildLines([{ item_id: 'a', qty: 2, contribs: [{ session_id: 's1', qty: 1 }, { session_id: 's2', qty: 1 }], batch_id: 'b9' }, { item_id: 'c', qty: 1, contribs: [] }]);
  ok(L.length === 3 && L[0].batch_id === 'b9' && L[1].batch_id === 'b9' && !('batch_id' in L[2]), 'buildLines: the pick rides on every split line, absent when not picked');
  const pk = C.lotPicker('mat-deduct-lot', 0, [{ id: 'x"1', lot: '<L1>', quantity: 3, expiry_date: '2027-05-01' }]);
  ok(/<option value="">تلقائياً/.test(pk) && pk.indexOf('&lt;L1&gt;') > -1 && pk.indexOf('x&quot;1') > -1 && /01\/05\/2027/.test(pk), 'picker: automatic first, escaped, numeric date');
  ok(C.lotPicker('c', 0, []) === '' && C.pickedLot({ querySelector: () => ({ value: 'b2' }) }, 'c', 0) === 'b2' && C.pickedLot(null, 'c', 0) === null, 'picker: hidden without lots; pick read back');

  ok(T.cleanQuery(' A%_1,() ') === 'A1', 'query: wildcards and filter syntax stripped');
  const calls = [];
  const fakeSb = {
    from(t) {
      const q = { t, f: [] };
      const ch = new Proxy({}, { get(_, k) {
        if (k === 'then') return (res, rej) => {
          calls.push(q);
          const data = t === 'inventory_batches'
            ? [{ id: 'b1', lot: 'LOT-7', expiry_date: '2028-01-01', received_qty: 5, quantity: 1, is_finished: false, inventory_items: { name: 'زرعة <4>', unit: 'قطعة' } }]
            : [{ batch_id: 'b1', change: -1, created_at: '2026-10-01T10:00:00Z', patient_id: 'p1', patients: { name: 'سارة', phone: '0999', patient_number: 7 } },
               { batch_id: 'b1', change: -2, created_at: '2026-10-05T10:00:00Z', patient_id: 'p1', patients: { name: 'سارة', phone: '0999', patient_number: 7 } },
               { batch_id: 'b1', change: -1, created_at: '2026-10-03T10:00:00Z', patient_id: 'p2', patients: { name: 'أحمد' } },
               { batch_id: 'b1', change: 1, created_at: '2026-10-04T10:00:00Z', patient_id: 'p2', patients: { name: 'أحمد' } },
               { batch_id: 'b1', change: -0.5, created_at: '2026-10-02T10:00:00Z', patient_id: null }];
          return Promise.resolve({ data, error: null }).then(res, rej);
        };
        return (...a) => { q.f.push([k, ...a]); return ch; };
      } });
      return ch;
    }
  };
  const G = await T.searchLot(fakeSb, 'u', 'LOT%7');
  ok(G.length === 1 && G[0].patients.length === 2 && G[0].patients[0].name === 'سارة' && G[0].patients[0].qty === 3 && G[0].patients[1].qty === 1 && G[0].loose === 0.5,
     'search: summed per patient and batch, newest first, returns skipped, unlinked use apart');
  const bq = calls.find(c => c.t === 'inventory_batches');
  ok(bq && bq.f.some(x => x[0] === 'eq' && x[1] === 'owner_id' && x[2] === 'u') && bq.f.some(x => x[0] === 'ilike' && x[2] === '%LOT7%') && !bq.f.some(x => x[0] === 'eq' && x[1] === 'is_finished'), 'search: owner-scoped, cleaned pattern, finished batches included');
  const mq = calls.find(c => c.t === 'inventory_movements');
  ok(mq && mq.f.some(x => x[0] === 'eq' && x[1] === 'reason' && x[2] === 'consume') && mq.f.some(x => x[0] === 'in' && x[1] === 'batch_id'), 'search: consume movements of those batches');
  const H = T.lotHtml(G);
  ok(H.indexOf('زرعة &lt;4&gt;') > -1 && /<bdi dir="ltr">LOT-7<\/bdi>/.test(H) && /patient-profile\.html\?id=p1/.test(H) && /دون ربطٍ بمريض/.test(H), 'lot view: escaped, LTR, links to the patient, unlinked use shown');
  const R = T.lotRows(G);
  ok(R.length === 2 && R[0].length === T.LOT_HEADERS.length && R[0][0] === 'LOT-7' && R[0][7] === 3, 'Excel: one row per patient per batch');
  const P = T.patientHtml([{ date: '2026-10-05T10:00:00Z', name: '<b>', unit: 'قطعة', qty: 1, lot: 'L<1', expiry: '2028-01-01' }]);
  ok(P.indexOf('&lt;b&gt;') > -1 && P.indexOf('L&lt;1') > -1 && /<bdi dir="ltr">01\/01\/2028<\/bdi>/.test(P) && /لم يُسجَّل/.test(T.patientHtml([])), 'patient view: escaped, LTR dates, empty state');
  ok(/\.eq\('owner_id', ownerId\)\.eq\('patient_id', patientId\)\.eq\('reason', 'consume'\)/.test(F['inv-trace.js']), 'patient query owner- and patient-scoped');

  const PP = F['patient-profile.html'], AP = F['appointments.html'], INV = F['inventory.html'];
  ok(/openModal\('matDeductModal'\);\s+window\.SyDentInvConsume\.attachLots\(window\.sb, currentUser\.id, rowsEl, _matDeductList, 'mat-deduct-lot'\);/.test(PP), 'profile window: picker attached after opening');
  ok(/batch_id: window\.SyDentInvConsume\.pickedLot\(document\.getElementById\('matDeductRows'\), 'mat-deduct-lot', idx\)/.test(PP), 'profile window: pick sent');
  ok(/mod\.classList\.add\('open'\);\s+window\.SyDentInvConsume\.attachLots\(window\.sb, currentUser\.id, rowsEl, _apptMatDeductList, 'appt-mat-deduct-lot'\);/.test(AP), 'appointments window: picker attached after opening');
  ok(/batch_id: window\.SyDentInvConsume\.pickedLot\(document\.getElementById\('apptMatDeductRows'\), 'appt-mat-deduct-lot', idx\)/.test(AP), 'appointments window: pick sent');
  const op = fnSrc(PP, 'async function openPatientLots() {');
  ok(/var seq = \+\+_ptLotsSeq;/.test(op) && (op.match(/if \(seq !== _ptLotsSeq\) return;/g) || []).length === 2 && /SyDentInvTrace\.patientMaterials\(window\.sb, currentUser\.id, pid\)/.test(op), 'patient card: lazy, sequence-guarded (#705)');
  ok(/onclick="openPatientLots\(\)"/.test(PP) && /<script src="inv-trace\.js\?v=/.test(PP), 'patient card: menu entry and module loaded');
  const ls = fnSrc(INV, 'async function lotSearch() {');
  ok(/var seq = \+\+_lotSeq;/.test(ls) && (ls.match(/if \(seq !== _lotSeq\) return;/g) || []).length === 2 && !/\.(insert|update|delete|rpc)\(/.test(ls), 'trace window: read-only, sequence-guarded (#705)');
  ok(/if \(expVal \|\| lotVal\) \{/.test(INV) && /batchPayload\(moveItemId, q, expVal, note, lotVal\)/.test(INV) && /if \(lot\) b\.lot = lot;/.test(INV), 'manual purchase: a batch on an expiry or a lot');
  ok(/data-po-f="lot"/.test(INV) && /rows: lines\.map\(function\(l\)\{ return \{ line: l, qty: '', expiry: '', lot: '', price: '' \}; \}\)/.test(INV), 'receiving: LOT field per line');
  ok(/onclick="openLotModal\(this\.dataset\.lot\)" data-lot="' \+ escapeHtml\(b\.lot\) \+ '"/.test(INV), 'item batches: «👥 المرضى» passes the lot through a data attribute');
  let PO;
  try { const c2 = { window: {}, console }; vm.createContext(c2); vm.runInContext(F['inv-po.js'], c2); PO = c2.window.SyDentInvPO; } catch (e) { ok(false, 'inv-po throws'); return; }
  const RL = PO.receiveLines([{ line: { id: 'l1' }, qty: '2', lot: '  AB-1 ' }, { line: { id: 'l2' }, qty: '1', lot: '' }]);
  ok(RL[0].lot === 'AB-1' && !('lot' in RL[1]), 'receive lines: lot trimmed, blank not sent');
  const iT = INV.indexOf('<script src="inv-trace.js?v='), iP = INV.indexOf('<script src="inv-po.js?v=');
  ok(iT > iP && (F['scripts/cache-bust.sh'].match(/inv-trace/g) || []).length === 3, 'inv-trace.js loaded after inv-po.js and in the cache-bust fleet');
}

const FILES = ['migrations/177_inventory_lot.sql', 'inv-consume.js', 'inv-trace.js', 'inv-po.js', 'inventory.html', 'patient-profile.html', 'appointments.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/177_inventory_lot.sql';
const MUTANTS = [
  ['lot dropped on receiving', rep(MIG, 'r.expiry, r.lot, v_batch);', 'r.expiry, NULL, v_batch);')],
  ['lot alone opens no batch', rep(MIG, 'IF r.expiry IS NOT NULL OR r.lot IS NOT NULL THEN', 'IF r.expiry IS NOT NULL THEN')],
  ['foreign batch accepted', rep(MIG, 'AND b.owner_id = v_uid AND b.is_finished = false FOR UPDATE', 'AND b.is_finished = false FOR UPDATE')],
  ['item not dropped with the pick', rep(MIG, "        UPDATE public.inventory_items SET quantity = quantity - t WHERE id = r.item_id;\n        v_left := v_left - t;", "        v_left := v_left - t;")],
  ['rank 4 no longer ord', rep(MIG, "           o AS ord,\n           nullif(e->>'batch_id', '')::uuid AS batch_id", "           nullif(e->>'batch_id', '')::uuid AS batch_id,\n           o AS ord")],
  ['pick lost in buildLines', rep('inv-consume.js', 'if (r.batch_id) l.batch_id = r.batch_id;', '')],
  ['picker unescaped', rep('inv-consume.js', "h += '<option value=\"' + esc(b.id) + '\">' + esc(b.lot)", "h += '<option value=\"' + esc(b.id) + '\">' + b.lot")],
  ['returns counted as use', rep('inv-trace.js', "if (m.batch_id !== b.id || !(num(m.change) < 0)) return;", "if (m.batch_id !== b.id) return;")],
  ['wildcards kept', rep('inv-trace.js', "replace(/[%_,()\\\\]/g, '')", "replace(/[,()]/g, '')")],
  ['finished batches hidden', rep('inv-trace.js', ".eq('owner_id', ownerId).ilike('lot',", ".eq('owner_id', ownerId).eq('is_finished', false).ilike('lot',")],
  ['patient view unescaped', rep('inv-trace.js', "'</td><td><strong>' + esc(r.name) + '</strong></td>'", "'</td><td><strong>' + r.name + '</strong></td>'")],
  ['profile pick not sent', rep('patient-profile.html', "batch_id: window.SyDentInvConsume.pickedLot(document.getElementById('matDeductRows'), 'mat-deduct-lot', idx)", "batch_id: null")],
  ['appointments picker missing', rep('appointments.html', "  window.SyDentInvConsume.attachLots(window.sb, currentUser.id, rowsEl, _apptMatDeductList, 'appt-mat-deduct-lot');", '')],
  ['trace without the sequence guard', rep('inventory.html', "    if (seq !== _lotSeq) return;\n    _lotGroups = g;", "    _lotGroups = g;")],
  ['manual purchase drops the lot', rep('inventory.html', 'batchPayload(moveItemId, q, expVal, note, lotVal)', 'batchPayload(moveItemId, q, expVal, note)')]
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
