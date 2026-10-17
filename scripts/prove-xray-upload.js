/* v635 — مثبتُ الأشعة (ج1 · M192) — مستقل، على الملفات الحيّة، بعميلٍ مصطنع يطبّق ما يطبّقه الخادم.
   (١) فحصُ الملف: الأنواع · بصمةُ DICM · الحدود (30MB للأشعة/DICOM · 10MB للباقي بعد الضغط) · الفارغ;
   (٢) الرفع: الأشعة بلا ضغط والباقي يُضغط · الحصّةُ قبل الرفع ومشتركةٌ للدفعة · القراءة فقط/الأوفلاين بلا شبكة ·
       رفضُ السياسة ⇒ «امتلاء» حين يكون الاستهلاكُ عند السقف · فشلُ الصف ⇒ حذفُ الكائن وإرجاعُ الحصّة · وسمُ الأشعة يُكتب حين يُطلب فقط;
   (٣) الحذف: فشلُ حذف الكائن يُجهض (لا يتيم) · حذفُ المريض يمسح مجلده أولاً ويُجهض عند الفشل · تنظيفُ اليتيمة;
   (٤) الرسائلُ والعدّاد; (٥) التبويب: عدُّ كل أسنان الصورة · 🩻 للأشعة · التوجيهُ لورقة الوسم · الخطُّ الزمني بتاريخ الالتقاط · الهروب;
   (٦) الورقة: التحقّق من التاريخ والرابط · الرفعُ يتوقّف عند الامتلاء · حارسُ القراءة أولَ سطر;
   (٧) M192 بالقاعدة · الأدمن · الاشتراك · التوصيل.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

/* ملفٌّ مصطنع: الحجم · النوع · بايتات 128..131 */
function mkFile(name, type, size, dicm) {
  return { name, type, size, slice: (a, b) => ({ arrayBuffer: async () => { const u = new Uint8Array(4); if (dicm) { u.set([68, 73, 67, 77]); } return u.buffer; } }) };
}

function filesCtx(F, o) {
  o = o || {};
  const calls = { up: [], ins: [], rm: [], del: [], rpc: [], list: [], upd: [], compress: 0 };
  const st = { usage: o.usage || { used_bytes: 0, cap_bytes: null, files: 0, orphans: 0 }, upErr: o.upErr || null, insErr: o.insErr || null, rmErr: o.rmErr || null,
               listPages: o.listPages || null, listErr: o.listErr || null, orphans: o.orphans || [] };
  const bucket = {
    upload: async (p, body, opt) => { calls.up.push({ p, body, opt }); return st.upErr ? { error: st.upErr } : { data: { path: p } }; },
    remove: async paths => { calls.rm.push(paths.slice()); return st.rmErr ? { error: st.rmErr } : { data: paths }; },
    list: async (dir, opt) => { calls.list.push({ dir, opt }); if (st.listErr) return { error: st.listErr }; const pg = (st.listPages || [[]])[Math.floor(opt.offset / 1000)] || []; return { data: pg }; }
  };
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: 'U1' } } }) },
    storage: { from: () => bucket },
    rpc: async name => { calls.rpc.push(name); if (name === 'my_storage_usage') return { data: JSON.parse(JSON.stringify(st.usage)) }; if (name === 'my_storage_orphans') return { data: st.orphans }; return { data: null }; },
    from: () => {
      const q = { _op: null, _row: null,
        insert(r) { q._op = 'ins'; q._row = r; calls.ins.push(r); return q; },
        update(r) { q._op = 'upd'; q._row = r; calls.upd.push(r); return q; },
        delete() { q._op = 'del'; return q; },
        select() { return q; }, eq(c, v) { if (q._op === 'del') calls.del.push(v); return q; }, order() { return q; },
        single: async () => (st.insErr && q._op === 'ins') ? { error: st.insErr } : { data: Object.assign({ id: 'D1' }, q._row) },
        then(r, j) { return Promise.resolve({ data: [], error: null }).then(r, j); } };
      return q;
    }
  };
  const ctx = { console: { warn() {}, error() {}, log() {} }, Promise, Object, Array, String, Number, JSON, Math, Date, Uint8Array, isNaN, isFinite,
    navigator: { onLine: o.offline ? false : true }, crypto: { randomUUID: () => 'uuid-1' },
    /* ضغطُ المتصفح المصطنع: أيُّ صورةٍ تمرّ بـcompressImage تخرج JPEG بـ10 بايت ⇒ يُرى إن ضُغطت */
    createImageBitmap: async () => ({ width: 4000, height: 2000, close() {} }),
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: cb => cb({ size: 10, type: 'image/jpeg' }) }) } };
  vm.createContext(ctx); vm.runInContext('window = this;', ctx);
  ctx.sb = sb;
  ctx.SyDentSub = { isReadOnly: () => !!o.readOnly };
  const SI = F['supabase-init.js'];
  const a = SI.indexOf('/* ============================================================\n   Phase 9 — Patient Documents & Imaging');
  const b = SI.indexOf('/* ─────────────────────────────────────────────────────────────────────────\n   SyDent — Offline / connectivity banner');
  vm.runInContext(SI.slice(a, b), ctx);
  const D = ctx.SyDentFiles;
  const realCompress = D.compressImage;
  ctx.__compress = 0;
  return { D, ctx, calls, st };
}

async function suite(F) {
  /* (١) الفحص */
  let h = filesCtx(F);
  const C = (f, c) => h.D.check(f, c);
  ok((await C(mkFile('a.jpg', 'image/jpeg', 500), 'xray')).ok && (await C(mkFile('a.pdf', 'application/pdf', 500), 'document')).mime === 'application/pdf', 'check: jpeg/pdf accepted');
  ok((await C(mkFile('a.exe', 'application/x-msdownload', 500), 'xray')).reason === 'type' && (await C(mkFile('a.heic', 'image/heic', 500), 'xray')).reason === 'type', 'check: unknown types refused');
  const dc = await C(mkFile('PA_16.dcm', '', 2e6, true), 'document');
  ok(dc.ok && dc.dicom && dc.mime === 'application/dicom', 'check: .dcm with the DICM magic accepted as application/dicom (empty browser type)');
  ok((await C(mkFile('fake.dcm', '', 2e6, false), 'xray')).reason === 'type', 'check: a renamed .dcm without DICM is refused');
  ok((await C(mkFile('z.png', 'image/png', 0), 'xray')).reason === 'empty', 'check: empty file refused');
  const big = await C(mkFile('pano.png', 'image/png', 31 * 1048576), 'xray');
  ok(big.reason === 'size' && big.limit === 30 * 1048576 && (await C(mkFile('pano.png', 'image/png', 29 * 1048576), 'xray')).ok, 'check: radiographs up to 30MB');
  ok((await C(mkFile('photo.jpg', 'image/jpeg', 31 * 1048576), 'clinical_photo')).reason === 'size', 'check: nothing above the bucket limit');

  /* (٢) الرفع */
  h = filesCtx(F, { usage: { used_bytes: 100, cap_bytes: 10 * 1048576 } });
  h.D.compressImage = async f => { h.ctx.__compress++; return f; };
  /* compressImage مُستدعى داخلياً — نراقبه بتبديل الدالة بالإغلاق عبر upload نفسه: نقيس بالجسم المرفوع */
  const xf = mkFile('bw.png', 'image/png', 3 * 1048576);
  let r = await h.D.upload('P1', xf, { category: 'xray', teeth: ['46', '16'], xrayType: 'bitewing', takenAt: '2026-10-01', source: 'center', sourceName: 'مركز النور' });
  ok(r.ok && h.calls.up[0].body === xf && h.calls.up[0].opt.contentType === 'image/png' && /^U1\/P1\/uuid-1-bw\.png$/.test(h.calls.up[0].p), 'upload: a radiograph goes up as-is (no lossy compression) in the patient folder');
  const row = h.calls.ins[0];
  ok(row.category === 'xray' && row.xray_type === 'bitewing' && JSON.stringify(row.teeth) === '["46","16"]' && row.taken_at === '2026-10-01' && row.source === 'center' && row.source_name === 'مركز النور',
     'upload: type · teeth · taken date · source written on the row');
  h = filesCtx(F);
  r = await h.D.upload('P1', mkFile('doc.pdf', 'application/pdf', 5000), { category: 'document', toothNum: '21' });
  const r0 = h.calls.ins[0];
  h = filesCtx(F);
  r = await h.D.upload('P1', mkFile('mouth.png', 'image/png', 2 * 1048576), { category: 'clinical_photo' });
  ok(r.ok && h.calls.up[0].body.size === 10 && h.calls.up[0].opt.contentType === 'image/jpeg' && /mouth\.jpg$/.test(h.calls.up[0].p) && h.calls.ins[0].size_bytes === 10, 'upload: clinical photos still compressed as before (JPEG, honest extension)');
  h = filesCtx(F);
  r = await h.D.upload('P1', mkFile('doc.pdf', 'application/pdf', 5000), { category: 'document', toothNum: '21' });
  const r0b = h.calls.ins[0];
  ok(r.ok && !('teeth' in r0b) && !('xray_type' in r0b) && !('taken_at' in r0b) && !('source' in r0b) && !('cbct_url' in r0b) && r0b.tooth_num === '21' && r0.tooth_num === '21', 'upload: other callers write exactly what they wrote before (trigger fills teeth)');
  r = await h.D.upload('P1', mkFile('x.png', 'image/png', 5000), { category: 'document', source: 'clinic', sourceName: 'لا' });
  ok(!('source_name' in h.calls.ins[1]), 'upload: a centre name only with source = centre');
  h = filesCtx(F);
  r = await h.D.upload('P1', mkFile('a.dcm', '', 4e6, true), { category: 'document' });
  ok(r.ok && h.calls.ins[0].category === 'xray' && h.calls.up[0].opt.contentType === 'application/dicom', 'upload: a DICOM file is always filed as an X-ray');
  /* الحصّة */
  h = filesCtx(F, { usage: { used_bytes: 9 * 1048576, cap_bytes: 10 * 1048576 } });
  r = await h.D.upload('P1', mkFile('p.png', 'image/png', 2 * 1048576), { category: 'xray' });
  ok(r.reason === 'quota' && h.calls.up.length === 0 && r.usage.cap === 10 * 1048576, 'quota: used + size over the cap ⇒ refused before any upload');
  h = filesCtx(F, { usage: { used_bytes: 0, cap_bytes: 5 * 1048576 } });
  const shared = await h.D.usage();
  await h.D.upload('P1', mkFile('1.png', 'image/png', 3 * 1048576), { category: 'xray', usage: shared });
  r = await h.D.upload('P1', mkFile('2.png', 'image/png', 3 * 1048576), { category: 'xray', usage: shared });
  ok(r.reason === 'quota' && h.calls.up.length === 1 && h.calls.rpc.filter(x => x === 'my_storage_usage').length === 1, 'quota: one server read per batch, the shared counter grows after each upload');
  h = filesCtx(F, { readOnly: true });
  r = await h.D.upload('P1', mkFile('a.png', 'image/png', 10), { category: 'xray' });
  ok(r.reason === 'read' && !h.calls.up.length, 'read-only: refused with no network call');
  h = filesCtx(F, { offline: true });
  r = await h.D.upload('P1', mkFile('a.png', 'image/png', 10), { category: 'xray' });
  ok(r.reason === 'offline' && !h.calls.up.length, 'offline: refused up front');
  h = filesCtx(F, { upErr: { message: 'new row violates row-level security policy "pf_quota_insert"', statusCode: '403' }, usage: { used_bytes: 5, cap_bytes: 5 } });
  r = await h.D.upload('P1', mkFile('a.png', 'image/png', 1), { category: 'xray', usage: { used: 0, cap: 100 } });
  ok(r.reason === 'quota', 'server policy refusal while the real usage is at the cap ⇒ «storage full»');
  h = filesCtx(F, { upErr: { message: 'mime type application/zip is not supported' } });
  r = await h.D.upload('P1', mkFile('a.png', 'image/png', 1), { category: 'xray' });
  ok(r.reason === 'type', 'bucket mime refusal ⇒ «type»');
  h = filesCtx(F, { insErr: { message: 'xray_taken_in_future' }, usage: { used_bytes: 0, cap_bytes: 100 } });
  const u3 = await h.D.usage();
  r = await h.D.upload('P1', mkFile('a.png', 'image/png', 40), { category: 'xray', usage: u3 });
  ok(r.reason === 'future' && h.calls.rm.length === 1 && h.calls.rm[0][0] === h.calls.up[0].p && u3.used === 0, 'row refused ⇒ the uploaded object is removed and the shared counter given back');

  /* (٣) الحذف */
  h = filesCtx(F, { rmErr: { message: 'network' } });
  r = await h.D.remove({ id: 'D9', storage_path: 'U1/P1/x.png' });
  ok(!r.ok && r.reason === 'storage' && h.calls.del.length === 0, 'remove: a failed object delete aborts — the row stays (no orphan eating the quota)');
  h = filesCtx(F);
  r = await h.D.remove({ id: 'D9', storage_path: 'U1/P1/x.png' });
  ok(r.ok && h.calls.rm[0][0] === 'U1/P1/x.png' && h.calls.del[0] === 'D9', 'remove: object first, then the row');
  h = filesCtx(F, { readOnly: true });
  ok((await h.D.remove({ id: 'D9', storage_path: 'U1/P1/x.png' })).reason === 'read' && !h.calls.rm.length, 'remove: read-only refused before touching storage');
  const page1 = []; for (let i = 0; i < 1000; i++) page1.push({ id: 'o' + i, name: 'f' + i + '.png' });
  h = filesCtx(F, { listPages: [page1, [{ id: 'x', name: 'last.png' }, { id: null, name: 'sub' }]] });
  r = await h.D.purgePatient('P7');
  ok(r.ok && r.removed === 1001 && h.calls.list[0].dir === 'U1/P7' && h.calls.list.length === 2 && h.calls.rm.length === 11 && h.calls.rm[0].length === 100 && h.calls.rm[10][0] === 'U1/P7/last.png',
     'purgePatient: the whole folder, paged by 1000, deleted by 100');
  h = filesCtx(F, { listErr: { message: 'x' } });
  ok(!(await h.D.purgePatient('P7')).ok && !h.calls.rm.length, 'purgePatient: a listing error deletes nothing and reports failure');
  h = filesCtx(F, { orphans: ['U1/P0/a.png', 'U1/P0/b.png'] });
  r = await h.D.cleanOrphans();
  ok(r.ok && r.removed === 2 && JSON.stringify(h.calls.rm[0]) === '["U1/P0/a.png","U1/P0/b.png"]', 'cleanOrphans: removes exactly what the server lists');

  /* (٤) الرسائل والعدّاد */
  const M = h.D.message;
  ok(/DICOM/.test(M({ reason: 'type' })) && /30 ميغابايت/.test(M({ reason: 'size', limit: 30 * 1048576 })) && /امتلأت مساحة التخزين لخطتك \(1 GB من 1 GB\)/.test(M({ reason: 'quota', usage: { used: 1073741824, cap: 1073741824 } }))
     && /الاشتراك/.test(M({ reason: 'quota' })) && /اتصال/.test(M({ reason: 'offline' })) && /للقراءة فقط/.test(M({ reason: 'read' })) && /المستقبل/.test(M({ reason: 'future' })), 'messages: one clear Arabic sentence per reason');
  const UH = h.D.usageHtml;
  ok(/sy-usage full/.test(UH({ used: 10, cap: 10 })) && /رقِّ الخطة/.test(UH({ used: 10, cap: 10 })) && /sy-usage warn/.test(UH({ used: 9, cap: 10 })) && /بلا سقف/.test(UH({ used: 9, cap: null })) && !/sy-usage-bar/.test(UH({ used: 9, cap: null }))
     && /width:50%/.test(UH({ used: 5, cap: 10 })), 'usage meter: full / near / no-cap states');

  /* (٥) التبويب */
  const PX = F['pp-extras.js'];
  const tctx = { console, String, Number, Array, Object };
  vm.createContext(tctx);
  vm.runInContext('var _toothPhotoCounts = {}, _toothXrayTeeth = {}, _toothDocIds = {};\n' + fnSrc(PX, 'function pfCountTeeth(rows){') + fnSrc(PX, 'function pfHasTooth(f, t){'), tctx);
  vm.runInContext("pfCountTeeth([{id:'a',teeth:['16','46'],category:'xray'},{id:'b',teeth:[],tooth_num:'16',category:'clinical_photo'},{id:'c',teeth:[],tooth_num:null,category:'document'}])", tctx);
  ok(tctx._toothPhotoCounts['16'] === 2 && tctx._toothPhotoCounts['46'] === 1 && tctx._toothXrayTeeth['46'] && tctx._toothXrayTeeth['16'] && /a/.test(tctx._toothDocIds['46']) && /a b/.test(tctx._toothDocIds['16']),
     'chart: a bitewing counts on every tooth it shows; 🩻 marks teeth with an X-ray; ids on the badge for live deletes');
  ok(vm.runInContext("pfHasTooth({teeth:['36','37']}, '37') && !pfHasTooth({teeth:['36']}, '37') && pfHasTooth({teeth:[], tooth_num:'21'}, 21)", tctx), 'tooth filter: by any tooth of the image (legacy tooth_num too)');
  const pick = fnSrc(PX, 'async function pfOnFilesPicked(fileList){');
  ok(/if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;\n  var cat/.test(pick) && /if \(cat === 'xray' \|\| files\.some\(function\(f\)\{ return window\.SyDentFiles\.isDicomName\(f\.name\) \|\| f\.type === 'application\/dicom'; \}\)\) \{\n    if \(typeof xrOpenUpload === 'function'\) \{ xrOpenUpload\(files\); return; \}/.test(pick)
     && /if \(r\.reason === 'quota' \|\| r\.reason === 'offline' \|\| r\.reason === 'read'\) \{ failed \+= files\.length - i - 1; break; \}/.test(pick) && /showToast\('⚠️ ' \+ window\.SyDentFiles\.message\(firstFail\), true\)/.test(pick),
     'files tab: read-only guard first · X-rays/DICOM go through the tagging sheet · a full quota stops the batch with its message');
  const rnd = fnSrc(PX, 'function renderPatientFiles(){'), card = fnSrc(PX, 'function pfCardHtml(f){');
  ok(/var dayOf = function\(f\)\{ return f\.taken_at \|\| String\(f\.created_at \|\| ''\)\.slice\(0, 10\); \};/.test(rnd) && /return da < db \? 1 : da > db \? -1/.test(rnd) && /class="pf-day"/.test(rnd),
     'X-ray section: a timeline grouped by the TAKEN date, newest first');
  ok(/escapeHtml\(f\.source_name \|\| 'مركز أشعة'\)/.test(card) && /escapeHtml\(f\.file_name\)/.test(card) && /href="' \+ escapeHtml\(f\.cbct_url\) \+ '" target="_blank" rel="noopener noreferrer"/.test(card)
     && /'<div class="sy-acts" style="flex-wrap:wrap;margin-top:4px;">'/.test(card), 'cards: names, centre and CBCT link escaped; row-actions anchor kept');

  /* (٦) الورقة */
  const PXR = F['pp-xray.js'];
  ['async function xrOpenUpload(fileList, row, preset) {', 'async function xrUpSubmit() {', 'function pfCamPick() {', 'function pfEditXray(id) {', 'async function pfCleanOrphans() {'].forEach(sig => {
    const b = fnSrc(PXR, sig);
    ok(/^[^\n]*\{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(b), 'sheet: read-only guard is the first line of ' + sig.replace(/\(.*$/, ''));
  });
  const xctx = { console, String, Number, Array, Object, Date, Intl, Math, JSON, Promise };
  vm.createContext(xctx);
  vm.runInContext(fnSrc(PXR, 'function xrDamToday() {') + fnSrc(PXR, 'function xrSortTeeth(arr) {') + "var _xrUp = { type:'bitewing', teeth:['46','16'], source:'center' }; var VALS = {};\n" +
    "var document = { getElementById: function(id){ return { value: VALS[id] || '' }; } };\n" + fnSrc(PXR, 'function xrReadMeta() {'), xctx);
  xctx.VALS = { xrUpDate: '2999-01-01' }; vm.runInContext('VALS = this.VALS', xctx);
  ok(/المستقبل/.test(vm.runInContext('xrReadMeta().err', xctx)), 'sheet: a future taken date is refused');
  vm.runInContext("VALS = { xrUpDate: '2026-01-02', xrUpCbct: 'javascript:alert(1)' }", xctx);
  ok(/https/.test(vm.runInContext('xrReadMeta().err', xctx)), 'sheet: a CBCT link must be https');
  vm.runInContext("VALS = { xrUpDate: '2026-01-02', xrUpCbct: 'https://viewer.example/x', xrUpSrcName: ' مركز النور ' }", xctx);
  const mm = vm.runInContext('JSON.stringify(xrReadMeta())', xctx);
  ok(mm === JSON.stringify({ type: 'bitewing', teeth: ['16', '46'], takenAt: '2026-01-02', source: 'center', sourceName: 'مركز النور', cbctUrl: 'https://viewer.example/x' }), 'sheet: one tag set for the batch — teeth sorted, name trimmed');
  const sub = fnSrc(PXR, 'async function xrUpSubmit() {');
  ok(/var usage = await SyDentFiles\.usage\(\);/.test(sub) && /if \(stopped\) \{ _xrUp\.results\[i\] = stopped; failed\+\+; continue; \}/.test(sub) && /if \(r\.reason === 'quota' \|\| r\.reason === 'offline' \|\| r\.reason === 'read'\) stopped = /.test(sub)
     && /if \(_xrUp\.results\[i\] && _xrUp\.results\[i\]\.ok\) continue;/.test(sub), 'sheet: one usage read per batch · a full quota stops the rest · a retry skips what already went up');
  ok(/if \(window\.__xrPasteWired\) return;/.test(PXR) && /if \(!tab \|\| !tab\.classList\.contains\('active'\)\) return;/.test(PXR) && /if \(document\.querySelector\('\.modal-overlay\.open, \.modal-overlay\.show'\)\) return;/.test(PXR),
     'paste: one listener, only on the visible files tab with no dialog open');

  /* (٧) القاعدة · الأدمن · الاشتراك · التوصيل */
  const G = F['migrations/192_xray_core.sql'];
  ok(/p\.id = NEW\.patient_id AND p\.doctor_id = NEW\.owner_id/.test(G) && /NEW\.storage_path NOT LIKE \(NEW\.owner_id::text \|\| '\/' \|\| NEW\.patient_id::text \|\| '\/%'\)/.test(G)
     && /s\.id = NEW\.session_id AND s\.doctor_id = NEW\.owner_id AND s\.patient_id = NEW\.patient_id/.test(G) && /a\.id = NEW\.appointment_id AND a\.doctor_id = NEW\.owner_id AND a\.patient_id = NEW\.patient_id/.test(G)
     && !/FUNCTION public\.patient_documents_xray_guard\(\)\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER/.test(G), 'M192: ownership guards on patient · folder · session · appointment (invoker — RLS hides foreign rows)');
  ok(/CREATE POLICY pf_quota_insert ON storage\.objects AS RESTRICTIVE FOR INSERT TO authenticated\n  WITH CHECK \(bucket_id <> 'patient-files' OR \(SELECT public\.pf_quota_ok\(\)\)\);/.test(G)
     && /COALESCE\(public\._pf_used_bytes\(auth\.uid\(\)\) < public\._pf_cap_bytes\(auth\.uid\(\)\), true\)/.test(G) && /jsonb_typeof\(sp\.entitlements->'storage_mb'\) = 'number'/.test(G)
     && /WHERE NOT \(COALESCE\(entitlements, '\{\}'::jsonb\) \? 'storage_mb'\);/.test(G), 'M192: the server enforces the per-plan cap from entitlements.storage_mb (seeded only where absent)');
  ok(/REVOKE ALL ON FUNCTION public\._pf_used_bytes\(uuid\) FROM PUBLIC, anon, authenticated;/.test(G) && /REVOKE ALL ON FUNCTION public\.my_storage_usage\(\) FROM PUBLIC, anon;/.test(G) && /REVOKE ALL ON FUNCTION public\.my_storage_orphans\(\) FROM PUBLIC, anon;/.test(G)
     && /o\.created_at < now\(\) - interval '1 hour'/.test(G), 'M192: internals unreachable; usage/orphans only for the signed-in tenant; in-flight uploads never orphans');
  ok(/file_size_limit = 31457280/.test(G) && /'application\/dicom'\]/.test(G) && /ALTER PUBLICATION supabase_realtime ADD TABLE public\.patient_documents;/.test(G) && /taken_at > \(now\(\) AT TIME ZONE 'Asia\/Damascus'\)::date/.test(G),
     'M192: bucket 30MB + DICOM · Realtime · taken date not in the future (Damascus)');
  const PT = fnSrc(F['patients.html'], 'async function deletePatient(id) {');
  ok(PT.indexOf('window.SyDentFiles.purgePatient(id)') > -1 && PT.indexOf('window.SyDentFiles.purgePatient(id)') < PT.indexOf(".from('patients')") && /if \(!_pf\.ok\) \{[\s\S]{0,260}return;/.test(PT),
     'patient delete: his folder is removed first and a failure keeps the patient');
  ok(/showToast\(\(_pf && _pf\.removed\) \? '⚠️ حُذفت ملفات المريض \(' \+ _pf\.removed \+ '\) ولم يُحذف المريض نفسه/.test(PT) && /var _pf = null;/.test(PT),
     'patient delete: files gone but the row delete failed ⇒ said plainly (a retry completes it)');
  const AP = F['admin-plans.js'];
  ok(/if \(_stc\.value === ''\) \{ delete ed\.entitlements\.storage_mb; \}/.test(AP) && /_vSt < 1 \|\| Math\.floor\(_vSt\) !== _vSt/.test(AP) && /id="planFldStorageMb"/.test(F['admin.html']), 'admin: the storage cap is edited in the plan, blank removes it, integers ≥ 1 only');
  ok(/p\.entitlements\.storage_mb/.test(F['subscription.html']) && /window\.SyDentFiles\.usageHtml\(u\)/.test(F['subscription.html']) && /id="subStorage"/.test(F['subscription.html']), 'subscription: plan cards show the cap, the clinic sees its usage');
  const PP = F['patient-profile.html'];
  ok(PP.indexOf('<script src="pp-xray.js?v=') > PP.indexOf('<script src="pp-portal.js?v=') && PP.indexOf('<script src="pp-portal.js?v=') > -1 && /id="xrUpModal"/.test(PP) && !/id="xrUpModal"[^>]*onclick/.test(PP)
     && /accept="image\/\*" capture="environment"/.test(PP) && /\.dcm,application\/dicom/.test(PP), 'wiring: module loaded · sheet without outside-click close · camera input · .dcm accepted');
  ok(/pp-xray\\\.js/.test(F['scripts/cache-bust.sh']) && (F['scripts/cache-bust.sh'].match(/pp-xray\\\.js/g) || []).length === 2 && /\.sy-usage\{/.test(F['theme.css']) && /patient_documents: 'owner_id'/.test(F['supabase-init.js']),
     'cache-bust (both lists) · meter style · live tenant column');
}

const FILES = ['supabase-init.js', 'pp-extras.js', 'pp-xray.js', 'patient-profile.html', 'patients.html', 'admin-plans.js', 'admin.html', 'subscription.html', 'scripts/cache-bust.sh', 'theme.css', 'migrations/192_xray_core.sql'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['radiographs compressed', rep('supabase-init.js', "var body = (category === 'xray') ? file : await compressImage(file);", 'var body = await compressImage(file);')],
  ['DICM magic not checked', rep('supabase-init.js', "if (!(await sniffDicom(file))) return { ok:false, reason:'type' };", '')],
  ['quota not pre-checked', rep('supabase-init.js', "if (!fits(u, size)) return { ok:false, reason:'quota', usage: u };", '')],
  ['shared counter not advanced', rep('supabase-init.js', '    if (u) u.used += size;\n', '')],
  ['object kept when the row fails', rep('supabase-init.js', '      try { await window.sb.storage.from(BUCKET).remove([path]); } catch(e){}\n      if (u) u.used -= size;', '      if (u) u.used -= size;')],
  ['remove falls through on storage error', rep('supabase-init.js', "if (st && st.error) return { ok:false, reason:'storage', error: st.error };", '')],
  ['xray limit = standard', rep('supabase-init.js', 'var LIMIT_XRAY = 30 * 1024 * 1024', 'var LIMIT_XRAY = 10 * 1024 * 1024')],
  ['centre name for any source', rep('supabase-init.js', "if (opts.source === 'center' && opts.sourceName)", 'if (opts.sourceName)')],
  ['purge before delete removed', rep('patients.html', '_pf = await window.SyDentFiles.purgePatient(id);', '_pf = { ok: true };')],
  ['silent partial delete', rep('patients.html', "showToast((_pf && _pf.removed) ? '⚠️ حُذفت ملفات المريض (' + _pf.removed + ') ولم يُحذف المريض نفسه — تحقّق من الاتصال وأعد الحذف لإكماله' : '❌ خطأ في الحذف', true);", "showToast('❌ خطأ في الحذف');")],
  ['badge counts first tooth only', rep('pp-extras.js', "var teeth = (f.teeth && f.teeth.length) ? f.teeth : ((f.tooth_num != null && f.tooth_num !== '') ? [f.tooth_num] : []);\n    teeth.forEach", "var teeth = (f.tooth_num != null && f.tooth_num !== '') ? [f.tooth_num] : [];\n    teeth.forEach")],
  ['timeline by upload date', rep('pp-extras.js', "var dayOf = function(f){ return f.taken_at || String(f.created_at || '').slice(0, 10); };", "var dayOf = function(f){ return String(f.created_at || '').slice(0, 10); };")],
  ['sheet skips the read-only guard', rep('pp-xray.js', "async function xrUpSubmit() {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", 'async function xrUpSubmit() {')],
  ['future date accepted', rep('pp-xray.js', "  if (date && date > xrDamToday()) return { err: 'تاريخ الالتقاط في المستقبل' };\n", '')],
  ['quota policy permissive', rep('migrations/192_xray_core.sql', 'CREATE POLICY pf_quota_insert ON storage.objects AS RESTRICTIVE FOR INSERT', 'CREATE POLICY pf_quota_insert ON storage.objects FOR INSERT')],
  ['guard ignores the folder', rep('migrations/192_xray_core.sql', "    IF NEW.storage_path NOT LIKE (NEW.owner_id::text || '/' || NEW.patient_id::text || '/%') THEN", '    IF false THEN')],
  ['seed overwrites the owner value', rep('migrations/192_xray_core.sql', " WHERE NOT (COALESCE(entitlements, '{}'::jsonb) ? 'storage_mb');", ';')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-xray-upload: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-xray-upload: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
