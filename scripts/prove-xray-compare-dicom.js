/* v637 — مثبتُ الأشعة ج3: DICOM المفرد · المقارنة قبل/بعد · معرضُ السن · إرفاقُ صورة جلسة «أشعة».
   (١) DICOM على ملفاتٍ حقيقية (scripts/fixtures/dicom — pydicom MIT) بالمكتبة المستضافة نفسها (vendor/):
       الترميزاتُ الثلاثة تعطي الصورةَ نفسها بايتاً ببايت · 16 بت بإشارة · التباعدُ معايرةٌ تلقائية · MONOCHROME1 مقلوب ·
       JPEG Baseline يُسلَّم للمتصفح · JPEG 2000/RLE يُعلَنان باسمهما · بلا صورة/ناقص/عشوائي ⇒ رسالة لا انهيار;
   (٢) المكتبة: الملفُّ المرقّم يطابق SHA-256 الموثَّق · يُحمَّل كسولاً (لا وسمَ بأي صفحة) · روابطُ blob تُحرَّر;
   (٣) المزامنة: التكبيرُ نسبيٌّ للملاءمة والمركزُ نسبيٌّ للصورة — صورتان بمقاسين تبقيان على المنطقة نفسها;
   (٤) المعرض: صورُ السن بكل أسنانها مرتّبةً بتاريخ الالتقاط · انتقاءُ صورتين بالضبط (الثالثةُ تُزيح الأقدم) ·
       المعرضُ يُغلق قبل العارض/المقارنة ويعود بعدها · «أضف صورة» محروسةٌ ومخفيةٌ بالقراءة;
   (٥) جلسةُ «أشعة» منجزة ⇒ عرضُ إرفاقٍ مربوطٍ بالسن والجلسة · لا شيء بالقراءة · الورقةُ تبدأ فارغةً بمنتقيها;
   (٦) الحذفُ يُغلق المقارنة · الشارةُ تفتح المعرض.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FX = f => new Uint8Array(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/dicom', f)));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const md5 = a => crypto.createHash('md5').update(Buffer.from(a)).digest('hex');
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

const DP = (() => {
  const c = { console, Math, JSON, Object, Array, String, Number, Uint8Array, DataView, Error, TextDecoder: global.TextDecoder };
  vm.createContext(c);
  vm.runInContext(read('vendor/dicom-parser-1.8.21.min.js'), c);
  return c.dicomParser;
})();

function suite(F) {
  let P;
  try {
    const ctx = { window: {}, document: { addEventListener() {} }, console, Math, JSON, Object, Array, String, Number, isFinite, DataView, Float32Array, Uint8ClampedArray, Uint8Array };
    vm.createContext(ctx); vm.runInContext(F['xray-viewer.js'], ctx);
    P = ctx.window.SyXrayViewer._pure;
  } catch (e) { ok(false, 'viewer loads: ' + e.message); return; }
  const D = b => P.dicomDecode(b, DP);

  /* (١) DICOM */
  const ex = D(FX('MR_small.dcm')), im = D(FX('MR_small_implicit.dcm')), be = D(FX('MR_small_bigendian.dcm'));
  ok(ex.ok && im.ok && be.ok && ex.w === 64 && ex.h === 64 && md5(ex.rgba) === md5(im.rgba) && md5(ex.rgba) === md5(be.rgba),
     'DICOM: explicit · implicit · big-endian encodings of the same scan give the same pixels byte for byte');
  let gray = true, lo = 255, hi = 0;
  for (let i = 0; i < ex.rgba.length; i += 4) { if (ex.rgba[i] !== ex.rgba[i + 1] || ex.rgba[i] !== ex.rgba[i + 2] || ex.rgba[i + 3] !== 255) gray = false; lo = Math.min(lo, ex.rgba[i]); hi = Math.max(hi, ex.rgba[i]); }
  ok(gray && hi - lo > 150 && ex.calib === 0.3125, 'DICOM: monochrome rendered grey and opaque, full contrast window, pixel spacing ⇒ calibration');
  const ct = D(FX('CT_small.dcm'));
  /* المرجعُ المستقل: pydicom 3.0.2 + numpy (pixel_array ⇒ Rescale ⇒ نافذة الملف بالمعادلة نفسها) — حُسب مرةً وثُبّت هنا */
  ok(ct.ok && ct.w === 128 && ct.h === 128 && ct.calib === 0.661468 && md5(ct.rgba) === '7fbe6b33a442d309afa0bddab8fe3633' && md5(ex.rgba) === '4c02d520589ef4e21552743917acd7da',
     'DICOM: 16-bit signed CT (−896…1167 HU) and MR match an independent pydicom rendering pixel for pixel');
  /* إشارةُ 16 بت: أولُ بكسلٍ بالـCT (بلا نافذةٍ بالملف ⇒ المدى) يصير 0xFFFF — بإشارةٍ = −1 فهو الأدنى (أسود)، وبلا إشارة = 65535 فهو الأعلى (أبيض) */
  const ctb = Buffer.from(FX('CT_small.dcm')), pxOff = DP.parseDicom(FX('CT_small.dcm')).elements.x7fe00010.dataOffset;
  ctb[pxOff] = 0xFF; ctb[pxOff + 1] = 0xFF;
  const cts = D(new Uint8Array(ctb));
  ok(cts.ok && cts.rgba[0] === 0 && cts.rgba[4] > 0, 'DICOM: signed pixels honoured (0xFFFF = −1 ⇒ the darkest, not 65535 ⇒ white)');
  const m1 = FX('MR_small.dcm'); const buf = Buffer.from(m1); const k = buf.indexOf('MONOCHROME2');
  ok(k > 0, 'fixture carries MONOCHROME2');
  buf.write('MONOCHROME1', k, 'latin1');
  const inv = D(new Uint8Array(buf));
  let inverted = inv.ok;
  for (let i = 0; inverted && i < inv.rgba.length; i += 4) if (inv.rgba[i] !== 255 - ex.rgba[i]) inverted = false;
  ok(inverted, 'DICOM: MONOCHROME1 shown inverted (bone white)');
  const jp = D(FX('SC_rgb_jpeg_dcmtk.dcm'));
  ok(jp.ok && jp.jpeg && jp.jpeg[0] === 0xFF && jp.jpeg[1] === 0xD8 && jp.w === 100, 'DICOM: JPEG Baseline frame extracted for the browser to decode');
  const j2 = D(FX('JPEG2000.dcm')), rl = D(FX('MR_small_RLE.dcm'));
  ok(!j2.ok && j2.reason === 'compressed' && j2.ts === 'JPEG 2000' && !rl.ok && rl.ts === 'RLE' && /JPEG 2000/.test(P.dicomMsg(j2)) && /نزّل الملف/.test(P.dicomMsg(j2)),
     'DICOM: JPEG 2000 / RLE are named and the original offered for download');
  const np = D(FX('rtplan.dcm')), tr = D(FX('MR_truncated.dcm'));
  let junk; try { junk = D(new Uint8Array(4096).map((_, i) => (i * 37) & 255)); } catch (e) { junk = { thrown: true }; }
  ok(!np.ok && np.reason === 'nopixels' && !tr.ok && tr.reason === 'invalid' && !junk.thrown && junk.ok === false && /تالفاً/.test(P.dicomMsg(tr)), 'DICOM: no image / truncated / random bytes ⇒ a message, never a crash');

  /* (٢) المكتبة */
  const V = F['xray-viewer.js'];
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'vendor/dicom-parser-1.8.21.min.js'))).digest('hex');
  ok(F['vendor/README.md'].indexOf(sha) > -1 && /sc\.src = '\/vendor\/dicom-parser-1\.8\.21\.min\.js';/.test(V), 'library: the numbered vendor file matches the SHA-256 in vendor/README.md and is what the viewer loads');
  const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
  ok(pages.every(f => read(f).indexOf('dicom-parser') < 0), 'library: lazy — no page carries a static tag for it');
  ok(/if \(window\.dicomParser && window\.dicomParser\.parseDicom\) return Promise\.resolve\(window\.dicomParser\);/.test(V) && /sc\.onerror = function \(\) \{ _dpP = null; res\(null\); \};/.test(V), 'library: loaded once; a failed load can be retried');
  ok(/revokeBlob\(\); S\.dicomCalib = null; S\.note = '';/.test(V) && /E\.svg\.innerHTML = ''; revokeBlob\(\);/.test(V) && /if \(P\.blob\) \{ try \{ URL\.revokeObjectURL\(P\.blob\); \} catch \(e\) \{\} \}/.test(V)
     && /if \(seq !== S\.loadSeq \|\| !S\.open\) \{ if \(r\.blob\) URL\.revokeObjectURL\(r\.src\); return; \}/.test(V), 'memory: decoded images (blob URLs) released on next image / close / late answers');
  ok(/function calibNow\(\) \{ return S\.calib \|\| S\.dicomCalib \|\| null; \}/.test(V), 'calibration: a manual one on the row wins over the DICOM pixel spacing');

  /* (٣) المزامنة */
  const fa = P.fitView(2000, 1000, 600, 400), fb = P.fitView(800, 1000, 600, 400);
  const va = P.zoomAt(fa, 3, 150, 120);
  const vb = P.mirrorView(va, fa, 2000, 1000, { width: 600, height: 400 }, fb, 800, 1000, { width: 600, height: 400 });
  const ca = P.toImage(va, 300, 200), cb = P.toImage(vb, 300, 200);
  ok(Math.abs(va.s / fa.s - vb.s / fb.s) < 1e-9 && Math.abs(ca.x / 2000 - cb.x / 800) < 1e-9 && Math.abs(ca.y / 1000 - cb.y / 1000) < 1e-9,
     'compare sync: same zoom relative to each fit, same relative centre — different-size images stay on the same region');

  /* (٤) المعرض */
  const PXR = F['pp-xray.js'];
  const g = { console, Array, String, Object, JSON };
  vm.createContext(g);
  vm.runInContext("var _xrGal = { tooth: '46', all: false, list: [], pick: [] }; var _pfFiles = []; function xrGalPaint(){}\n" +
    "function pfViewable(f){ return /^image\\//.test(f.mime_type) || f.mime_type === 'application/dicom'; }\n" +
    "function pfHasTooth(f, t){ return (f.teeth || []).indexOf(String(t)) > -1; }\n" + fnSrc(PXR, 'function xrGalList() {') + fnSrc(PXR, 'function xrGalPick(id, on) {'), g);
  vm.runInContext("_pfFiles = [{id:'a',teeth:['46'],taken_at:'2025-01-10',created_at:'2026-10-01',mime_type:'image/png',category:'xray'},{id:'b',teeth:['45','46','47'],taken_at:'2026-03-01',created_at:'2026-09-01',mime_type:'application/dicom',category:'xray'},{id:'c',teeth:['21'],taken_at:'2026-05-01',created_at:'2026-05-01',mime_type:'image/png',category:'xray'},{id:'d',teeth:['46'],taken_at:null,created_at:'2026-06-01T10:00:00Z',mime_type:'application/pdf',category:'document'},{id:'e',teeth:['46'],taken_at:null,created_at:'2026-07-01T10:00:00Z',mime_type:'image/jpeg',category:'clinical_photo'}];", g);
  ok(vm.runInContext("xrGalList().map(function(f){return f.id}).join(',')", g) === 'e,b,a', 'gallery: every image showing the tooth (photos and DICOM too, never PDFs), newest taken first');
  vm.runInContext("_xrGal.tooth = null; _xrGal.all = true;", g);
  ok(vm.runInContext("xrGalList().map(function(f){return f.id}).join(',')", g) === 'c,b,a', 'gallery (all): the clinic\'s X-rays only');
  vm.runInContext("xrGalPick('a', true); xrGalPick('b', true); xrGalPick('c', true);", g);
  ok(vm.runInContext("_xrGal.pick.join(',')", g) === 'b,c' && vm.runInContext("xrGalPick('b', false); _xrGal.pick.join(',')", g) === 'c', 'gallery: two picks at most — a third pushes out the oldest pick; untick removes');
  const cmpFn = fnSrc(PXR, 'function xrGalCompare() {'), viewFn = fnSrc(PXR, 'function xrGalView(id) {'), attFn = fnSrc(PXR, 'function xrGalAttach() {');
  ok(/if \(_xrGal\.pick\.length !== 2 \|\| !window\.SyXrayViewer\) return;/.test(cmpFn) && /closeModal\('xrGalModal'\);\n  window\.SyXrayViewer\.compare\(\{ docs: docs, urlFor: pfUrlFor, onClose: xrGalReopen \}\);/.test(cmpFn)
     && /closeModal\('xrGalModal'\);   \/\/ العارضُ تحت النوافذ/.test(viewFn) && /onClose: xrGalReopen/.test(viewFn), 'gallery: exactly two to compare; it closes before the viewer/compare (they sit under dialogs) and comes back after');
  ok(/^function xrGalAttach\(\) \{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(attFn) && /xrOpenUpload\(null, null, \{ teeth: \[_xrGal\.tooth\] \}\);/.test(attFn)
     && /'xrGalAttach',   \/\* v637/.test(F['scripts/check-mirrors.js']) && /\[onclick\*="xrGalAttach\("\]/.test(F['patient-profile.css']), 'gallery: «add an image» guarded, preset to the tooth, hidden in read-only');
  const C = V.slice(V.indexOf('async function cOpen(opts) {'));
  ok(/docs\.sort\(function \(a, b\) \{ return day\(a\) < day\(b\) \? -1/.test(C) && /C\.sync = true;/.test(C) && /if \(docs\.length !== 2\) return;/.test(C), 'compare: oldest = before (right), newest = after; sync on by default; exactly two images');
  ok(/sync: function \(rows\) \{ sync\(rows\); cSync\(rows\); \}/.test(V) && /if \(gone\) \{ cClose\(\);/.test(V), 'compare: an image deleted while comparing closes it');

  /* (٥) جلسةُ «أشعة» */
  const PD = F['pp-dental.js'];
  ok(/if \(pendingTreatStatus === 'completed' && newSess && _xt && \(_xt\.id === 'xray' \|\| \/أشعة\/\.test\(_xt\.name \|\| ''\)\) && typeof xrAttachForSession === 'function'\) \{\n      await xrAttachForSession\(currentTooth, newSess\.id\);/.test(PD),
     'session: a completed X-ray treatment on a tooth offers to attach its image');
  const att = fnSrc(PXR, 'async function xrAttachForSession(tooth, sessionId) {');
  ok(/if \(!tooth \|\| !sessionId \|\| \(window\.SyDentSub && window\.SyDentSub\.isReadOnly && window\.SyDentSub\.isReadOnly\(\)\)\) return;/.test(att) && /if \(yes\) xrOpenUpload\(null, null, \{ teeth: \[String\(tooth\)\], sessionId: sessionId \}\);/.test(att),
     'session: never in read-only; opens the sheet preset to the tooth and the session');
  const sub = fnSrc(PXR, 'async function xrUpSubmit() {');
  ok(/sessionId: _xrUp\.sessionId \|\| null/.test(sub) && /if \(!_xrUp\.files\.length\) \{ showToast\('اختر صورة واحدة على الأقل', true\); return; \}/.test(sub)
     && /if \(!ok\.length && !preset\) return;/.test(PXR) && /id="xrUpPick"[^>]*onchange="xrUpAddFiles\(this\.files\); this\.value='';"/.test(F['patient-profile.html']),
     'sheet: starts empty with its own picker (a real tap — works on iPhone), links the session, refuses an empty batch');

  /* (٦) التوصيل */
  const PX = F['pp-extras.js'];
  ok(/if \(typeof xrOpenGallery === 'function'\) \{ xrOpenGallery\(\{ tooth: String\(num\) \}\); return; \}/.test(PX) && /function pfViewable\(f\)\{ return window\.SyDentFiles\.isImage\(f\.mime_type\) \|\| f\.mime_type === 'application\/dicom'; \}/.test(PX),
     'chart badge opens the tooth gallery; DICOM opens in the viewer');
  ok(/id="xrGalModal"/.test(F['patient-profile.html']) && !/id="xrGalModal"[^>]*onclick/.test(F['patient-profile.html']), 'gallery dialog present, no outside-click close');
}

const FILES = ['xray-viewer.js', 'pp-xray.js', 'pp-extras.js', 'pp-dental.js', 'patient-profile.html', 'patient-profile.css', 'vendor/README.md', 'scripts/check-mirrors.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['big-endian read as little', rep('xray-viewer.js', "var be = ts === '1.2.840.10008.1.2.2';", 'var be = false;')],
  ['sign ignored', rep('xray-viewer.js', 'if (signed && raw >= sign) raw -= 2 * sign;', '')],
  ['MONOCHROME1 not inverted', rep('xray-viewer.js', 'if (inv) y = 255 - y;', '')],
  ['spacing ignored', rep('xray-viewer.js', "var calib = dSpacing(ds), note", "var calib = null, note")],
  ['JPEG 2000 decoded raw', rep('xray-viewer.js', "if (TS_RAW.indexOf(ts) < 0) return { ok: false, reason: 'compressed', ts: TS_NAMES[ts] || ts };", '')],
  ['parse error throws', rep('xray-viewer.js', "try { ds = dp.parseDicom(bytes); } catch (e) { return { ok: false, reason: 'invalid' }; }", 'ds = dp.parseDicom(bytes);')],
  ['blob leaks', rep('xray-viewer.js', "revokeBlob(); S.dicomCalib = null; S.note = '';", "S.dicomCalib = null; S.note = '';")],
  ['sync absolute', rep('xray-viewer.js', 'var s = clampN(rel * fb.s, MIN_S, MAX_S);', 'var s = va.s;')],
  ['gallery unsorted', rep('pp-xray.js', "}).sort(function (a, b) { var da = day(a), db = day(b); return da < db ? 1 : da > db ? -1", "}).sort(function (a, b) { var da = day(a), db = day(b); return 0 ? 1 : 0 ? -1")],
  ['third pick kept', rep('pp-xray.js', 'if (_xrGal.pick.length > 2) _xrGal.pick.shift();', '')],
  ['gallery left above viewer', rep('pp-xray.js', "  closeModal('xrGalModal');   // العارضُ تحت النوافذ", '  // العارضُ تحت النوافذ')],
  ['attach in read-only', rep('pp-xray.js', "if (!tooth || !sessionId || (window.SyDentSub && window.SyDentSub.isReadOnly && window.SyDentSub.isReadOnly())) return;", 'if (!tooth || !sessionId) return;')],
  ['session link dropped', rep('pp-xray.js', 'sessionId: _xrUp.sessionId || null', 'sessionId: null')],
  ['compare survives delete', rep('xray-viewer.js', 'sync: function (rows) { sync(rows); cSync(rows); }', 'sync: function (rows) { sync(rows); }')]
];
suite(base);
const bp = [pass, fail];
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  [pass, fail] = bp;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-xray-compare-dicom: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-xray-compare-dicom: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
