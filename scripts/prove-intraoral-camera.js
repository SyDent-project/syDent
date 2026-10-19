/* v642 — مثبتُ كاميرا الفم بالمتصفح (جلسة الأجهزة ١).
   (١) اختيارُ الكاميرا: المذكورةُ على الجهاز أولاً، وإلا أولُ كاميرا خارجية (ليست مدمجة/أمامية)؛ (٢) الأخطاءُ بأسمائها
   (رفض · لا كاميرا · مشغولة)؛ (٣) اللقطة: كاملُ دقّة البثّ · JPEG · الانعكاسُ يُحفظ كما يُرى · حدٌّ 30 · البثُّ يُوقف عند
   الإغلاق والإنهاء · روابطُ المعاينة تُحرَّر؛ (٤) اللقطاتُ ⇒ ورقةُ الوسم كصورٍ سريرية (بلا نوعٍ ولا مصدر) بالسن المحدّد؛
   (٥) الحرّاس: مدخلا الكاميرا محروسان أولَ سطر ومخفيان بالقراءة · Space/Enter لا تلتقط داخل حقلٍ أو قائمة ·
   Permissions-Policy يسمح بالكاميرا لصفحات التطبيق ويبقيها مطفأةً بصفحتَي الحجز · الزرُّ الحيّ للحواسيب والأصليُّ للجوال.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

function suite(F) {
  const X = F['pp-xray.js'];
  const c = { console, String, Array, Object };
  vm.createContext(c); vm.runInContext(fnSrc(X, 'function xrCamPickDevice(list, remembered) {') + fnSrc(X, 'function xrCamErrText(e) {'), c);
  const devs = [{ deviceId: 'int', label: 'Integrated Camera (04f2:b6d9)' }, { deviceId: 'usb', label: 'USB Video Device (1b3f:2002)' }, { deviceId: 'fr', label: 'FaceTime HD Camera' }];
  c.devs = devs;
  ok(vm.runInContext("xrCamPickDevice(devs, '')", c) === 'usb' && vm.runInContext("xrCamPickDevice(devs, 'fr')", c) === 'fr' && vm.runInContext("xrCamPickDevice(devs, 'gone')", c) === 'usb' && vm.runInContext("xrCamPickDevice([devs[0]], '')", c) === 'int' && vm.runInContext("xrCamPickDevice([], '')", c) === '',
     'device choice: remembered first, else the external (intraoral) camera, else whatever exists');
  ok(/السماح للكاميرا مرفوض/.test(vm.runInContext("xrCamErrText({name:'NotAllowedError'})", c)) && /لا كاميرا موصولة/.test(vm.runInContext("xrCamErrText({name:'NotFoundError'})", c)) && /مستعملة من برنامج آخر/.test(vm.runInContext("xrCamErrText({name:'NotReadableError'})", c)) && /تعذّر تشغيل الكاميرا/.test(vm.runInContext("xrCamErrText({})", c)),
     'errors: permission · no camera · busy — each named');
  const shot = fnSrc(X, 'function xrCamShot() {'), start = fnSrc(X, 'async function xrCamStart(deviceId) {');
  ok(/c\.width = v\.videoWidth; c\.height = v\.videoHeight;/.test(shot) && /'image\/jpeg', 0\.92\)/.test(shot) && /if \(_xrCam\.mirror\) \{ ctx\.translate\(c\.width, 0\); ctx\.scale\(-1, 1\); \}/.test(shot) && /if \(_xrCam\.shots\.length >= 30\)/.test(shot),
     'shot: full stream resolution · JPEG 0.92 · mirrored preview saved as seen · 30 per batch');
  ok(/width: \{ ideal: 1920 \}, height: \{ ideal: 1080 \}/.test(start) && /deviceId: \{ exact: remembered \}/.test(start) && /localStorage\.removeItem\(XR_CAM_KEY\)/.test(start) && /if \(!_xrCam\.open\) \{ stream\.getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\); \}\); return; \}/.test(start),
     'start: asks full HD · the remembered device by id · a vanished device is forgotten and the default used · a stream that arrives after closing is stopped');
  const close = fnSrc(X, 'function xrCamClose() {'), done = fnSrc(X, 'function xrCamDone() {');
  ok(/_xrCam\.open = false; xrCamStop\(\);/.test(close) && /xrCamRevoke\(\); _xrCam\.shots = \[\];/.test(close) && /_xrCam\.open = false; xrCamStop\(\); closeModal\('xrCamModal'\); xrCamRevoke\(\);/.test(done)
     && /xrOpenUpload\(shots, null, \{ category: 'clinical_photo', teeth: preset\.teeth \|\| \[\] \}\);/.test(done), 'close/done: the stream is stopped and previews released; shots go to the tagging sheet as clinical photos with the preset tooth');
  ok(/_xrCam\.category = row \? \(row\.category === 'clinical_photo' \? 'clinical_photo' : 'xray'\)/.test(X.replace(/_xrUp\.category = row/, '_xrCam.category = row')) && /document\.getElementById\('xrUpTypeGroup'\)\.style\.display = photo \? 'none' : '';/.test(X) && /document\.getElementById\('xrUpSrcGroup'\)\.style\.display = \(photo \|\| _xrUp\.request\) \? 'none' : '';/.test(X)
     && /if \(_xrUp\.category === 'clinical_photo'\) return \{ type: null, teeth: xrSortTeeth\(_xrUp\.teeth\), takenAt: date \|\| null, source: null, sourceName: '', cbctUrl: null \};/.test(X)
     && /category: _xrUp\.category \|\| 'xray', usage: usage/.test(X), 'sheet: clinical photos carry teeth + date only (type/source/CBCT hidden, not written) and upload under their own category');
  ['async function xrCamOpen(preset) {', 'function pfLiveCam() {', 'function xrGalCam() {'].forEach(sig => {
    ok(/^[^\n]*\{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(fnSrc(X, sig)), 'read-only guard first line: ' + sig.replace(/\(.*$/, ''));
  });
  ok(/if \(a && \(a\.tagName === 'SELECT' \|\| a\.tagName === 'INPUT' \|\| a\.tagName === 'TEXTAREA'\)\) return;\n    if \(e\.key === ' ' \|\| e\.key === 'Enter'\) \{ e\.preventDefault\(\); xrCamShot\(\); \}/.test(X) && /if \(!_xrCam\.open\) return;/.test(X) && /if \(window\.__xrCamKeyWired\) return;/.test(X),
     'keys: Space/Enter capture only while the camera is open and focus is not in a field (one listener)');
  const H = F['_headers'];
  const blocks = H.split(/\n(?=\/)/);
  const app = blocks.find(b => b.startsWith('/*\n')), book = blocks.filter(b => /^\/book(\.html)?\n/.test(b));
  ok(app && /camera=\(self\)/.test(app) && book.length === 2 && book.every(b => /camera=\(\)/.test(b)) && /microphone=\(\)/.test(app) && /geolocation=\(\)/.test(app), 'Permissions-Policy: camera allowed for the app, still off on both booking blocks, microphone/geolocation untouched');
  const PP = F['patient-profile.html'], C = F['patient-profile.css'];
  ok(/id="pfLiveCamBtn" class="pf-livecam" onclick="pfLiveCam\(\)"/.test(PP) && /@media \(hover:hover\) and \(pointer:fine\)\{ \.pf-livecam\{display:block;\} \}/.test(C) && /@media \(hover:none\) and \(pointer:coarse\)\{ \.pf-cam\{display:block;\} \}/.test(C),
     'entry points: live camera on pointer devices, native capture on touch devices');
  ok(/id="xrCamModal"/.test(PP) && !/id="xrCamModal"[^>]*onclick/.test(PP) && /<video id="xrCamVideo" autoplay playsinline muted><\/video>/.test(PP) && /onchange="xrCamStart\(this\.value\)"/.test(PP) && /id="xrGalCam" onclick="xrGalCam\(\)"/.test(PP),
     'markup: camera dialog (no outside-click close) · inline muted video · device switch · «📸 صوّر» in the tooth gallery');
  ok(/\[onclick\*="pfLiveCam\("\]/.test(C) && /\[onclick\*="xrGalCam\("\]/.test(C), 'read-only: both camera entry buttons hidden');
  ok(/if \(cat === 'clinical_photo' && typeof xrOpenUpload === 'function'\) \{ xrOpenUpload\(files, null, \{ category: 'clinical_photo', teeth: tooth \? \[tooth\] : \[\] \}\); return; \}/.test(F['pp-extras.js']), 'files tab: picked clinical photos go through the same sheet');
}

const FILES = ['pp-xray.js', 'pp-extras.js', 'patient-profile.html', 'patient-profile.css', '_headers'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['integrated camera preferred', rep('pp-xray.js', "var ext = list.find(function (d) { return !/integrated|built-?in|facetime|front|internal|مدمج/i.test(d.label || ''); });", 'var ext = list[0];')],
  ['remembered device ignored', rep('pp-xray.js', "if (remembered && list.some(function (d) { return d.deviceId === remembered; })) return remembered;", '')],
  ['shot downscaled', rep('pp-xray.js', 'c.width = v.videoWidth; c.height = v.videoHeight;', 'c.width = 640; c.height = 480;')],
  ['mirror not applied to the saved image', rep('pp-xray.js', 'if (_xrCam.mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }', '')],
  ['stream left running on close', rep('pp-xray.js', '  _xrCam.open = false; xrCamStop();\n  closeModal', '  _xrCam.open = false;\n  closeModal')],
  ['shots filed as X-rays', rep('pp-xray.js', "xrOpenUpload(shots, null, { category: 'clinical_photo', teeth: preset.teeth || [] });", 'xrOpenUpload(shots, null, { teeth: preset.teeth || [] });')],
  ['camera in read-only', rep('pp-xray.js', "async function xrCamOpen(preset) {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", 'async function xrCamOpen(preset) {')],
  ['space captures inside a field', rep('pp-xray.js', "if (a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;\n    if (e.key", "if (e.key")],
  ['camera blocked by headers', rep('_headers', 'Permissions-Policy: geolocation=(), microphone=(), camera=(self), payment=()', 'Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()')],
  ['camera allowed on the booking page', rep('_headers', '/book.html\n  ! X-Frame-Options\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()', '/book.html\n  ! X-Frame-Options\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Permissions-Policy: geolocation=(), microphone=(), camera=(self), payment=()')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-intraoral-camera: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-intraoral-camera: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
