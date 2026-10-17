/* v636 — مثبتُ عارض الأشعة (ج2) — مستقل، على الملفات الحيّة.
   (١) الدوالُّ الصافية: تنقيةُ التعليقات القادمة من القاعدة · طولُ الخط بالمليمتر/البكسل · المعايرة (أرقامٌ عربية،
       حدودٌ معقولة، خطٌّ قصير مرفوض) · التكبيرُ حول نقطةٍ ثابتة · الملاءمة · تحويلُ الشاشة ← الصورة;
   (٢) الأمان: النصُّ بـtextContent وصفرُ innerHTML بقيمٍ متغيّرة · لا ctx.filter (سفاري) · الألوانُ مفاتيحُ لوحة;
   (٣) الحفظ: مؤجَّلٌ وموحَّد عبر SyDentFiles.updateMeta · القراءةُ فقط لا تحفظ (قياسٌ مؤقت فقط) · الفشلُ يُعلَن ويُعاد عند
       عودة الاتصال · المغادرةُ تُفرغ المعلّق وتسأل إن بقي فشل · المعايرةُ تُحفظ فوراً وتُسترجَع عند الفشل;
   (٤) التوصيل: الصورُ تُفتح بالعارض بقائمة القسم الظاهر · المزامنةُ تُغلقه إن حُذفت الصورة · cache-bust · CSS.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j + 4); }

function pure(F) {
  const ctx = { window: {}, document: { addEventListener() {} }, console, Math, JSON, Object, Array, String, Number, isFinite };
  vm.createContext(ctx);
  vm.runInContext(F['xray-viewer.js'], ctx);
  return ctx.window.SyXrayViewer._pure;
}

function suite(F) {
  const V = F['xray-viewer.js'];
  let P;
  try { P = pure(F); } catch (e) { ok(false, 'module loads: ' + e.message); return; }
  /* (١) التنقية */
  const dirty = [
    { t: 'arrow', x1: 10.04, y1: 20, x2: 30, y2: 40, c: 'g' },
    { t: 'arrow', x1: 'x', y1: 1, x2: 2, y2: 3 },
    { t: 'circle', cx: 5, cy: 5, r: -1 },
    { t: 'circle', cx: 5, cy: 5, r: 9, c: 'purple' },
    { t: 'text', x: 1, y: 2, s: '  <img src=x onerror=alert(1)>\u0007' + 'ب'.repeat(300), c: 'y' },
    { t: 'text', x: 1, y: 2, s: '   ' },
    { t: 'script', x: 1 }, null, 7,
    { t: 'ruler', x1: 0, y1: 0, x2: 1e9, y2: 0 },
    { t: 'ruler', x1: 0, y1: 0, x2: 100, y2: 0, c: 'b' }
  ];
  const c = JSON.parse(JSON.stringify(P.sanitize(dirty, 1000, 800)));
  ok(c.length === 4 && c[0].x1 === 10 && c[0].c === 'g' && c[1].t === 'circle' && c[1].c === 'r' && c[2].t === 'text' && c[3].t === 'ruler' && c[3].c === 'b',
     'sanitize: unknown kinds, non-numbers, negative radius, blank text and out-of-range points dropped; unknown colour ⇒ red');
  ok(c[2].s.length === 120 && c[2].s.indexOf('\u0007') < 0 && c[2].s.indexOf('<img') === 0, 'sanitize: text trimmed to 120, control chars removed (kept literal — rendered by textContent)');
  ok(P.sanitize('nope', 10, 10).length === 0 && P.sanitize(new Array(500).fill({ t: 'circle', cx: 1, cy: 1, r: 1 }), 10, 10).length === P.MAX_ANN, 'sanitize: non-array ⇒ empty · capped at MAX_ANN');
  /* القياس والمعايرة */
  ok(P.lenLabel(200, 0.125) === '25.0 مم' && P.lenLabel(2000, 0.125) === '250 مم' && P.lenLabel(123.4, null) === '123 بكسل', 'length label: mm once calibrated, pixels otherwise');
  ok(P.calibFrom('25', 200) === 0.125 && P.calibFrom('٢٥', 200) === 0.125 && P.calibFrom('12٫5', 100) === 0.125 && P.calibFrom('12,5', 100) === 0.125,
     'calibration: mm / px, Arabic digits and decimal comma accepted');
  ok(P.calibFrom('0', 200) === null && P.calibFrom('abc', 200) === null && P.calibFrom('600', 200) === null && P.calibFrom('10', 3) === null && P.calibFrom('10', 0.5) === null,
     'calibration: zero, text, > 500 mm and a line too short are refused');
  /* التكبير والملاءمة */
  const v = { s: 0.5, tx: 100, ty: 50 }, z = P.zoomAt(v, 2, 300, 200);
  const before = P.toImage(v, 300, 200), after = P.toImage(z, 300, 200);
  ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9 && z.s === 1, 'zoom keeps the point under the finger/cursor fixed');
  ok(P.zoomAt({ s: 30, tx: 0, ty: 0 }, 10, 0, 0).s === 40 && P.zoomAt({ s: 0.03, tx: 0, ty: 0 }, 0.1, 0, 0).s === 0.02, 'zoom clamped to [2%, 4000%]');
  const f = P.fitView(2786, 1316, 1280, 700);
  ok(Math.abs(f.s - Math.min(1280 / 2786, 700 / 1316) * 0.94) < 1e-9 && Math.abs(f.tx * 2 + 2786 * f.s - 1280) < 1e-6 && Math.abs(f.ty * 2 + 1316 * f.s - 700) < 1e-6, 'fit: whole image centred with a margin');

  /* (٢) الأمان */
  const renderFn = fnSrc(V, 'function drawAnn(svg, list, scale, calib, temp) {');
  ok(/t\.textContent = str;/.test(renderFn) && !/innerHTML/.test(renderFn) && /drawAnn\(E\.svg, S\.ann, S\.v\.s, calibNow\(\), S\.temp\);/.test(V) && /drawAnn\(P\.svg, P\.ann, P\.v\.s, P\.calib \|\| P\.dicomCalib, null\);/.test(V), 'render: one SVG builder (viewer + compare) with createElementNS + textContent — no innerHTML');
  ok(!/innerHTML\s*=\s*[^'";]*(?:\+|ann|doc|\.s\b|file_name)/.test(V) && (V.match(/innerHTML\s*=/g) || []).every(() => true) && !/innerHTML\s*=\s*(?!'')/.test(V.replace(/E\.svg\.innerHTML = '';/g, '')),
     'module: innerHTML only ever cleared, never fed');
  ok(!/ctx\.filter|getContext\('2d'\)\.filter/.test(V) && /P\.img\.style\.filter = f;/.test(V) && /E\.img\.style\.filter = 'brightness\(' \+ S\.bright \+ '%\) contrast\(' \+ S\.contrast \+ '%\)' \+ \(S\.invert \? ' invert\(1\)' : ''\);/.test(V),
     'adjustments: CSS filters on the <img> (work on iPhone Safari), never canvas ctx.filter');
  ok(/g\.style\.setProperty\('--xrv-c', a\.t === 'calib' \? 'var\(--cyan\)' : \(COLORS\[a\.c\] \|\| COLORS\.r\)\);/.test(V) && /var COLORS = \{ r: 'var\(--red\)', y: 'var\(--yellow\)', g: 'var\(--green\)', b: 'var\(--blue\)' \};/.test(V),
     'colours: stored as palette keys, painted from theme tokens');
  ok(/vector-effect', 'non-scaling-stroke'/.test(renderFn) && /var k = 1 \/ scale/.test(renderFn), 'annotations keep a constant on-screen size at any zoom');

  /* (٣) الحفظ */
  const save = fnSrc(V, 'async function save() {'), sch = fnSrc(V, 'function scheduleSave(ms) {'), settle = fnSrc(V, 'async function settle() {'), cal = fnSrc(V, 'async function calibrate(px) {');
  ok(/if \(S\.ro \|\| !S\.doc \|\| !S\.dirty\) return;/.test(save) && /window\.SyDentFiles\.updateMeta\(doc\.id, \{ annotations: snapshot \}\)/.test(save) && /if \(S\.ro\) return;\n    S\.dirty = true;/.test(sch),
     'save: one debounced write of the annotations column; read-only never schedules nor writes');
  ok(/if \(JSON\.stringify\(snapshot\) === JSON\.stringify\(S\.ann\)\) S\.dirty = false;/.test(save) && /if \(doc !== S\.doc\) return;/.test(save), 'save: an edit made during the request stays dirty; a late answer for another image is ignored');
  ok(/status\('⚠️ لم تُحفظ التعليقات \(' \+ S\.failed \+ '\)/.test(save) && /window\.addEventListener\('online', function \(\) \{ if \(S\.open && S\.dirty\) scheduleSave\(0\); \}\);/.test(V), 'save failure is shown and retried when the connection returns');
  ok(/if \(S\.dirty && !S\.ro\) await save\(\);/.test(settle) && /return await window\.SyDialog\.confirm\(/.test(settle) && /if \(!force && !\(await settle\(\)\)\) return;/.test(V) && /if \(!\(await settle\(\)\)\) return;/.test(fnSrc(V, 'async function go(step) {')),
     'leaving (close / next image) flushes the pending save and asks before dropping a failed one');
  ok(/if \(!r\.ok\) \{ S\.calib = prev; render\(\); status\('⚠️ لم تُحفظ المعايرة/.test(cal) && /updateMeta\(S\.doc\.id, \{ calib_mm_per_px: c \}\)/.test(cal) && /if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;\n    var prev = S\.calib;/.test(cal),
     'calibration: saved at once on the row, rolled back on failure, refused in read-only');
  ok(/if \(t\.t === 'ruler' && S\.ro\) \{ S\.temp = t; render\(\); status\('📐 ' \+ lenLabel\(len, calibNow\(\)\) \+ ' · قراءة فقط — لا يُحفظ'\); return; \}/.test(V)
     && /if \(S\.ro && t !== 'pan' && t !== 'ruler'\)/.test(V) && /\.xrv-ro \.xrv-tool:not\(\[data-tool="pan"\]\):not\(\[data-tool="ruler"\]\),\.xrv-ro \.xrv-ed,\.xrv-ro \.xrv-cols\{display:none;\}/.test(F['theme.css']),
     'read-only: pan + temporary measuring only — drawing tools hidden and refused');
  ok(/if \(S\.ann\.length >= MAX_ANN\)/.test(fnSrc(V, 'function addAnn(a) {')) && /var clean = sanitize\(\[a\], S\.iw, S\.ih\);/.test(V), 'new annotations pass the same sanitizer and the cap');
  ok(/if \(ids\.length === 2\) \{      \/\/ قرصٌ بإصبعين/.test(V) && /S\.temp = null; S\.drag = null;/.test(V) && /try \{ if \(E\.stage\.setPointerCapture\) E\.stage\.setPointerCapture\(e\.pointerId\); \} catch \(x\) \{\}/.test(V),
     'touch: a second finger turns any gesture into pinch-zoom (cancels the half-drawn shape)');
  ok(/if \(document\.querySelector\('\.modal-overlay\.open, \.modal-overlay\.show'\)\) return;/.test(fnSrc(V, 'function onKey(e) {')), 'keys: a dialog above the viewer owns the keyboard (Escape cancels the dialog, not the viewer)');

  /* (٤) التوصيل */
  const PX = F['pp-extras.js'], open = fnSrc(PX.replace(/\n}\n/g, '\n  }\n'), 'async function pfOpenFile(id){');
  ok(/if \(window\.SyXrayViewer && pfViewable\(f\)\) \{/.test(PX) && /var shown = pfVisibleImages\(\);/.test(PX) && /window\.SyXrayViewer\.open\(\{ docs: shown, index: idx, urlFor: pfUrlFor, onSaved: pfOnViewerSaved \}\);/.test(PX) && /_pfFiles\[i\]\.annotations = row\.annotations; _pfFiles\[i\]\.calib_mm_per_px = row\.calib_mm_per_px;/.test(PX),
     'files tab: images open in the viewer with the visible section as the navigation list; saves update the tab rows');
  ok(/if \(window\.SyXrayViewer\) window\.SyXrayViewer\.sync\(_pfFiles\);/.test(PX) && /if \(!cur\) \{[\s\S]{0,200}close\(true\);[\s\S]{0,120}حُذفت هذه الصورة/.test(V), 'an image deleted (here or on another device) closes the open viewer with a notice');
  const PP = F['patient-profile.html'];
  ok(PP.indexOf('<script src="xray-viewer.js?v=') > -1 && PP.indexOf('<script src="xray-viewer.js?v=') < PP.indexOf('<script src="pp-xray.js?v='), 'wiring: viewer loaded on the patient card');
  ok((F['scripts/cache-bust.sh'].match(/xray-viewer\\\.js\|pp-xray\\\.js\|pp-portal\\\.js\)/g) || []).length === 2, 'cache-bust: the viewer is a numbered asset in both lists (portal stays last)');
  ok(/\.xrv\{position:fixed;inset:0;z-index:995;/.test(F['theme.css']) && /html\.xrv-open #syFabDock\{display:none !important;\}/.test(F['theme.css']) && /touch-action:none/.test(F['theme.css']),
     'css: under dialogs (1000) so prompts show above it · floating button hidden · native gestures off on the stage');
}

const FILES = ['xray-viewer.js', 'pp-extras.js', 'patient-profile.html', 'theme.css', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['colour not checked', rep('xray-viewer.js', "var c = Object.prototype.hasOwnProperty.call(COLORS, a.c) ? a.c : 'r';", "var c = a.c || 'r';")],
  ['text not capped', rep('xray-viewer.js', '.trim().slice(0, MAX_TXT)', '.trim()')],
  ['label ignores calibration', rep('xray-viewer.js', "if (num(calib) && calib > 0) {", 'if (false) {')],
  ['short line calibrates', rep('xray-viewer.js', '|| !num(px) || px < 5)', '|| !num(px))')],
  ['zoom drifts', rep('xray-viewer.js', "return { s: s2, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };", "return { s: s2, tx: v.tx, ty: v.ty };")],
  ['text via innerHTML', rep('xray-viewer.js', 't.textContent = str; return t;', 't.innerHTML = str; return t;')],
  ['read-only saves', rep('xray-viewer.js', "    if (S.ro) return;\n    S.dirty = true;", "    S.dirty = true;")],
  ['edit during save lost', rep('xray-viewer.js', 'if (JSON.stringify(snapshot) === JSON.stringify(S.ann)) S.dirty = false;', 'S.dirty = false;')],
  ['close without flushing', rep('xray-viewer.js', 'if (!force && !(await settle())) return;', '')],
  ['calibration not rolled back', rep('xray-viewer.js', "if (!r.ok) { S.calib = prev; render();", "if (!r.ok) { render();")],
  ['viewer survives a deleted image', rep('pp-extras.js', 'if (window.SyXrayViewer) window.SyXrayViewer.sync(_pfFiles);', '')],
  ['canvas filter', rep('xray-viewer.js', "E.img.style.filter = 'brightness('", "ctx.filter = 'brightness('")],
  ['viewer above dialogs', rep('theme.css', '.xrv{position:fixed;inset:0;z-index:995;', '.xrv{position:fixed;inset:0;z-index:2000;')]
];
const bp = (() => { suite(base); return [pass, fail]; })();
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-xray-viewer: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-xray-viewer: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
