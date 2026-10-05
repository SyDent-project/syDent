/* v503 — مثبتُ تخطيط بطاقة الحجز الإلكتروني بالإعدادات (لقطة المالك على الجوال: شرائحُ الأيام وحقلا
   الوقت يخرجون عن البطاقة) — مستقل، على settings.html الحيّ. ثوابتُه من سبب العلّة لا من لقطة:
   (١) كل حقلٍ داخل البطاقة بلا عرضٍ ثابت ولا flex/min-width inline (مصدرُ الفيضان) ؛
   (٢) الأيامُ السبعة شرائحُ .bk-day بمربّعٍ مخفيٍّ يغطّيها، بمعرّفاتها التي يقرؤها JS (bkDay0..6) مرةً واحدة لكلٍّ؛
   (٣) الصفّان عمودان minmax(0,1fr) مع min-width:0 للخلايا والحقول؛ حقلا الوقت appearance:none؛
   (٤) صفُّ المفتاح أفقي؛ صفُّ الرابط flex بحقلٍ min-width:0؛
   (٥) JS يقرأ/يكتب الأيام بنفس المعرّفات.
   --self-test: 3 طفرات على CSS الحيّ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
function run(src) {
  let pass = 0, fail = 0; const bad = [];
  const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); } };
  const i = src.indexOf('id="bookingSection"'), j = src.indexOf('id="btnSaveBooking"', i);
  const card = i > 0 && j > i ? src.slice(i, j) : '';
  ok(card.length > 0, 'booking card found');
  ok(!/style="[^"]*(flex:\s*1|min-width:\s*1[0-9]{2}px|display:flex;flex-wrap)/.test(card), '(1) no inline flex/min-width layout inside the card');
  const days = [...card.matchAll(/<label class="bk-day"><input type="checkbox" id="bkDay(\d)"><span>[^<]+<\/span><\/label>/g)].map(m => m[1]);
  ok(days.length === 7 && new Set(days).size === 7 && days.join() === '6,0,1,2,3,4,5', '(2) seven day chips, Saturday first, ids bkDay0..6 once each');
  ok(!/accent-color/.test(card), '(2) no leftover native-checkbox styling on day inputs');
  const css = (src.match(/#bookingSection [^{]+\{[^}]*\}/g) || []).join('\n');
  ok(/#bookingSection \.bk-day input \{[^}]*position: absolute; inset: 0;[^}]*opacity: 0/.test(css), '(2) hidden input covers the whole chip');
  ok(/#bookingSection \.bk-day:has\(input:checked\) \{[^}]*background: var\(--green-bg\)/.test(css) && /\.bk-day:has\(input:focus-visible\)/.test(css), '(2) checked + keyboard-focus states');
  ok((card.match(/<div class="bk-grid2">/g) || []).length === 2, '(3) both two-field rows use the grid');
  ok(/#bookingSection \.bk-grid2 \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css), '(3) columns can shrink (minmax 0)');
  ok(/#bookingSection \.bk-grid2 > \.form-group \{ min-width: 0; \}/.test(css) && /#bookingSection \.bk-grid2 :is\(input, select\) \{ min-width: 0; max-width: 100%; \}/.test(css), '(3) cells and fields may shrink');
  ok(/#bookingSection input\[type="time"\] \{[^}]*appearance: none;[^}]*display: block/.test(css), '(3) iOS time input loses its intrinsic width');
  ok(/<div class="form-group bk-toggle-row">/.test(card) && /#bookingSection \.bk-toggle-row \{ flex-direction: row;/.test(css), '(4) toggle row horizontal');
  ok(/<div class="bk-link-row">\s*<input type="text" id="bkLink" readonly dir="ltr">/.test(card) && /#bookingSection \.bk-link-row input \{ flex: 1; min-width: 0;/.test(css), '(4) link row shrinks its field, keeps the button');
  ok(/class="btn bk-blocks-btn" onclick="openBlockModal\(\)" data-sub-write/.test(card), '(4) blocks button on a class, still sub-write gated');
  ok((src.match(/document\.getElementById\('bkDay' \+ d\)/g) || []).length >= 2, '(5) JS reads/writes the same day ids');
  return { pass, fail, bad };
}
const r = run(SRC);
r.bad.forEach(m => console.log('FAIL', m));
let total = r.pass + r.fail, failed = r.fail;
if (process.argv.includes('--self-test')) {
  const muts = [
    ['repeat(2, minmax(0, 1fr))', 'repeat(2, 1fr)', 'columns cannot shrink'],
    ['#bookingSection .bk-day input { position: absolute; inset: 0;', '#bookingSection .bk-day input { position: static; inset: 0;', 'input no longer covers chip'],
    ['<div class="bk-grid2">', '<div style="display:flex;flex-wrap:wrap;gap:12px;">', 'inline flex back']
  ];
  let red = 0;
  muts.forEach(([a, b, n]) => { if (!SRC.includes(a)) { console.log('FAIL mutation anchor missing:', n); failed++; return; } if (run(SRC.replace(a, b)).fail > 0) red++; else console.log('MUTANT SURVIVED:', n); });
  total++; if (red !== muts.length) { failed++; console.log('FAIL self-test', red + '/' + muts.length); }
}
console.log((failed ? '❌' : '✅') + ' مثبت تخطيط بطاقة الحجز: ' + (total - failed) + '/' + total);
process.exit(failed ? 1 : 0);
