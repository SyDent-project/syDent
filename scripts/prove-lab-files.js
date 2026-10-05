/* v535 — مثبتُ مرفقات طلب المخبر (lab-files.js · M162) — مستقل، على الملفات الحيّة.
   (١) الدفعة: المرفقاتُ تُعرض لكل صفوف الإدراج الواحد وتُرفع على أولها;
   (٢) طلبٌ محفوظ ⇒ رفعٌ فوري (labOrderId · المريض · الفئة بحسب النوع · الملاحظة) ثم إعادةُ القراءة;
   (٣) طلبٌ جديد ⇒ حجزٌ بلا رفع · flush بعد الحفظ يرفع ويُفرغ · بلا ملفات = لا شيء;
   (٤) الحدود: صور وPDF فقط · 10 للطلب; (٥) العرض مهرَّب · الحذفُ بتأكيد عبر SyDentFiles.remove;
   (٦) العدّاد بمقاطع 150 (#691) والشارة; (٧) SyDentFiles.upload يكتب lab_order_id حين يُطلب فقط; (٨) الربط + M162.
   --self-test: 10 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
const tick = () => new Promise(r => setTimeout(r, 0));

async function suite(F) {
  let boxEl = null;
  const grp = { parentNode: { insertBefore(el) { boxEl = el; } } };
  const doc = { getElementById: id => (id === 'lfsBox' ? boxEl : id === 'labOrderNotes' ? { closest: () => grp } : null),
    createElement: () => ({ id: '', className: '', innerHTML: '', addEventListener() {} }) };
  const uploads = [], removed = [], queries = [];
  let docsDB = [], toasts = [], confirmAns = true;
  const sb = { from(t) { const q = { _in: null, select() { return q; }, in(c, ids) { q._in = ids; queries.push(ids.length); return q; }, order() { return Promise.resolve({ data: docsDB.filter(d => q._in.indexOf(d.lab_order_id) !== -1), error: null }); },
    then(r, j) { return Promise.resolve({ data: docsDB.filter(d => q._in.indexOf(d.lab_order_id) !== -1), error: null }).then(r, j); } }; return q; } };
  const ctx = { console: { warn() {} }, Promise, Object, Array, String, Number, JSON, Math, document: doc, showToast: m => toasts.push(m),
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} } };
  vm.createContext(ctx); vm.runInContext('window = this;', ctx);
  ctx.sb = sb;
  ctx.SyDentFiles = { upload: async (pid, f, o) => { uploads.push({ pid, name: f.name, o }); docsDB.push({ id: 'd' + uploads.length, lab_order_id: o.labOrderId, mime_type: f.type, file_name: f.name, storage_path: 'p/' + f.name }); return { ok: true }; },
    signedUrls: async paths => { const m = {}; paths.forEach(p => { m[p] = 'https://s/' + p; }); return m; }, remove: async row => { removed.push(row.id); docsDB = docsDB.filter(d => d.id !== row.id); return { ok: true }; } };
  ctx.SyDialog = { confirm: async () => confirmAns };
  vm.runInContext(F['lab-files.js'], ctx);
  const L = ctx.SyLabFiles;
  /* (١) */
  const orders = [{ id: 'a', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T1' }, { id: 'b', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T1' },
                  { id: 'c', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T2' }];
  ok(JSON.stringify(L.siblings(orders, 'b')) === '["a","b"]' && JSON.stringify(L.siblings(orders, 'c')) === '["c"]', 'batch: siblings of the same insert');
  /* (٢) محفوظ */
  docsDB = [{ id: 'd0', lab_order_id: 'b', mime_type: 'image/jpeg', file_name: '<img src=x onerror=1>.jpg', storage_path: 'p/0' }];
  L.open({ orderId: 'a', orders, patientId: 'p' }); await tick(); await tick();
  ok(boxEl && /lfs-thumb/.test(boxEl.innerHTML) && boxEl.innerHTML.indexOf('<img src=x') === -1 && /&lt;img src=x/.test(boxEl.innerHTML) && /https:\/\/s\/p\/0/.test(boxEl.innerHTML), 'saved: batch attachments listed with signed thumbnails, names escaped');
  await L._pick([{ name: 'shade.jpg', type: 'image/jpeg' }, { name: 'scan.pdf', type: 'application/pdf' }, { name: 'x.exe', type: 'application/x-msdownload' }]);
  ok(uploads.length === 2 && uploads.every(u => u.pid === 'p' && u.o.labOrderId === 'a' && u.o.note === 'مرفق طلب مخبر') && uploads[0].o.category === 'clinical_photo' && uploads[1].o.category === 'document',
     'saved: immediate upload to the first row of the batch, category by type, only images/PDF');
  ok(L._state.docs.length === 3 && toasts.some(t => /رُفع 2 مرفقات/.test(t)), 'saved: list re-read after upload + toast');
  /* (٥) الحذف */
  confirmAns = false; boxEl.innerHTML = ''; await vm.runInContext("SyLabFiles._state.docs.length", ctx);
  /* الحذف عبر المعالج الداخلي: نستدعيه بمحاكاة النقرة غير متاحة ⇒ نختبر عبر الواجهة المكشوفة للحذف غير موجودة، فنتحقّق من المصدر */
  ok(/SyDialog\.confirm\(\{ message: 'حذف هذا المرفق؟ يُحذف من ملفات المريض أيضاً\.', danger: true \}\)/.test(F['lab-files.js']) && /var r = await SyDentFiles\.remove\(d\);/.test(F['lab-files.js']), 'delete: confirmed, through SyDentFiles.remove (object then row)');
  /* (٣) جديد */
  uploads.length = 0; toasts = [];
  L.open({ orderId: '', orders, patientId: null }); await tick();
  await L._pick([{ name: 'n1.png', type: 'image/png' }, { name: 'n2.png', type: 'image/png' }]);
  ok(uploads.length === 0 && L.hasStaged() && /تُرفع مع حفظ الطلب/.test(boxEl.innerHTML), 'new: files staged, nothing uploaded before saving');
  const n = await L.flush('NEW1', 'p9');
  ok(n === 2 && uploads.length === 2 && uploads.every(u => u.o.labOrderId === 'NEW1' && u.pid === 'p9') && !L.hasStaged(), 'new: flush after save uploads to the new order and empties the queue');
  ok(await L.flush('NEW2', 'p9') === 0 && uploads.length === 2, 'flush with nothing staged does nothing');
  /* (٤) الحد */
  L.open({ orderId: '', orders }); await tick(); toasts = [];
  const many = []; for (let i = 0; i < 12; i++) many.push({ name: 'm' + i + '.jpg', type: 'image/jpeg' });
  await L._pick(many);
  ok(L._state.staged.length === 10 && toasts.some(t => /الحدّ 10/.test(t)) && !/lfs-add/.test(boxEl.innerHTML), 'limit: 10 per order, add tile hidden at the cap');
  /* (٦) العدّاد */
  const ids = []; for (let i = 0; i < 320; i++) ids.push('o' + i);
  docsDB = [{ lab_order_id: 'o1' }, { lab_order_id: 'o1' }, { lab_order_id: 'o300' }];
  queries.length = 0;
  await L.loadCounts(sb, ids);
  ok(JSON.stringify(queries) === '[150,150,20]' && L.count('o1') === 2 && L.count('o300') === 1 && /📎 2/.test(L.badge('o1')) && L.badge('o5') === '', 'counts: .in() by 150, badge only when there are files');
  /* (٧) SyDentFiles.upload */
  const SI = F['supabase-init.js'], up = SI.slice(SI.indexOf('  async function upload(patientId, file, opts){'), SI.indexOf('  async function list(patientId, opts){'));
  ok(/if \(opts\.labOrderId\) docRow\.lab_order_id = opts\.labOrderId;/.test(up) && !/lab_order_id:\s*opts\.labOrderId \|\| null/.test(up), 'SyDentFiles.upload: lab_order_id written only when asked (other callers untouched)');
  /* (٨) الربط */
  const LB = F['labs.html'], PC = F['pp-clinical.js'], PP = F['patient-profile.html'];
  ok(/SyLabFiles\.open\(\{ orderId: _lfId, orders: allOrders/.test(fnSrc(LB, 'function labDueOpen(isNew) {')) && /SyLabFiles\.open\(\{ orderId: isNew \? '' : document\.getElementById\('labOrderId'\)\.value, orders: labOrders/.test(fnSrc(PC, 'function labDueOpen(isNew) {')),
     'wiring: both modals open the attachments with batch context');
  ok(/if \(res2\.data && window\.SyLabFiles && SyLabFiles\.hasStaged\(\)\) SyLabFiles\.flush\(res2\.data\.id, res2\.data\.patient_id\);/.test(LB)
     && (PC.match(/SyLabFiles\.flush\(/g) || []).length === 2 && /SyLabFiles\.flush\(resB\.data\[0\]\.id, resB\.data\[0\]\.patient_id\)/.test(PC), 'wiring: flush after insert — labs single, profile single + batch first row');
  ok((LB.match(/SyLabFiles\.badge\(lo\.id\)/g) || []).length === 2 && /SyLabFiles\.badge\(lo\.id\)/.test(PC) && /SyLabFiles\.loadCounts\(window\.sb/.test(LB) && /SyLabFiles\.loadCounts\(window\.sb/.test(PP), 'wiring: 📎 badge in table, card and profile tab; counts loaded');
  for (const pg of ['labs.html', 'patient-profile.html']) ok(F[pg].indexOf('<script src="lab-files.js?v=') > F[pg].indexOf('<script src="lab-slip.js?v=') && F[pg].indexOf('<script src="lab-slip.js?v=') > -1, pg + ': lab-files.js loaded');
  ok(/lab-files\\\.js/.test(F['scripts/cache-bust.sh']) && /\.lfs-thumb \{/.test(F['theme.css']), 'cache-bust + theme.css');
  const G = F['migrations/163_lab_links_tenant_guard.sql'];
  ok(/o\.id = NEW\.lab_order_id AND o\.doctor_id = NEW\.doctor_id/.test(G) && /o\.id = NEW\.lab_order_id AND o\.doctor_id = NEW\.owner_id AND o\.patient_id = NEW\.patient_id/.test(G)
     && /BEFORE INSERT OR UPDATE OF lab_order_id, doctor_id ON public\.lab_order_redos/.test(G) && /BEFORE INSERT OR UPDATE OF lab_order_id, owner_id, patient_id ON public\.patient_documents/.test(G) && !/SECURITY DEFINER/.test(G),
     'M163: redo rows and attachments may only point at the owner\'s own order (and the same patient) — invoker, so RLS hides foreign orders');
  const M = F['migrations/162_patient_documents_lab_order.sql'];
  ok(/ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public\.lab_orders\(id\) ON DELETE SET NULL/.test(M) && /WHERE lab_order_id IS NOT NULL/.test(M), 'M162: nullable FK, SET NULL (patient keeps the photo), partial index');
}

const FILES = ['lab-files.js', 'supabase-init.js', 'labs.html', 'pp-clinical.js', 'patient-profile.html', 'scripts/cache-bust.sh', 'theme.css', 'migrations/162_patient_documents_lab_order.sql', 'migrations/163_lab_links_tenant_guard.sql'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['uploads to the clicked row not the batch head', rep('lab-files.js', 'await uploadAll(files, st.orderIds[0], st.patientId);', 'await uploadAll(files, st.orderIds[st.orderIds.length - 1], st.patientId);')],
  ['new order uploads immediately', rep('lab-files.js', 'if (st.orderIds.length) {                      /* محفوظ', 'if (true) {                      /* محفوظ')],
  ['any file type', rep('lab-files.js', ".filter(function (f) { return isImg(f.type) || f.type === 'application/pdf'; })", '')],
  ['no cap', rep('lab-files.js', 'var MAX = 10, CHUNK = 150;', 'var MAX = 99, CHUNK = 150;')],
  ['names unescaped', rep('lab-files.js', "'\" alt=\"' + esc(d.file_name) + '\"></a>'", "'\" alt=\"' + d.file_name + '\"></a>'")],
  ['queue kept after flush', rep('lab-files.js', 'var files = st.staged.slice(); st.staged = [];', 'var files = st.staged.slice();')],
  ['counts unchunked', rep('lab-files.js', 'var MAX = 10, CHUNK = 150;', 'var MAX = 10, CHUNK = 1000;')],
  ['profile batch flush missing', rep('pp-clinical.js', 'if (resB.data[0] && window.SyLabFiles && SyLabFiles.hasStaged()) SyLabFiles.flush(resB.data[0].id, resB.data[0].patient_id);', '')],
  ['attachment guard ignores the patient', rep('migrations/163_lab_links_tenant_guard.sql', ' AND o.patient_id = NEW.patient_id', '')],
  ['SET NULL → CASCADE', rep('migrations/162_patient_documents_lab_order.sql', 'REFERENCES public.lab_orders(id) ON DELETE SET NULL', 'REFERENCES public.lab_orders(id) ON DELETE CASCADE')]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lab-files: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-files: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
