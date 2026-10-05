/* v563 — مثبتُ #15 (شاراتُ بطاقة الموعد) من ملاحظات Deep Code — مستقل، على الملفات الحيّة.
   ثلاثُ شاراتٍ ظاهرة والباقي خلف «+N» · التحذيرُ الطبي والحساسية و«انتظار» (⚠️/⚡) لا تُطوى أبداً · النقرُ يفتح الشارات
   بلا فتح الموعد (stopPropagation) · مراقبٌ واحد يطبّقها على العرض اليومي والقائمة · بُناةُ الشارات المحروسة بالمرايا لم تُمسّ.
   سلوكياً بـvm على الدالة الحيّة بـDOM مصغّر. --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('{', i); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return ''; }
const base = { 'appointments.html': read('appointments.html'), 'appt-modal.js': read('appt-modal.js'), 'treatments.html': read('treatments.html'), 'theme.js': read('theme.js'), 'index.html': read('index.html') };
function mkRow(texts) {
  const row = { children: [], classList: new Set(), appendChild(e) { this.children.push(e); e.parentNode = this; } };
  row.classList.add = function (c) { Set.prototype.add.call(this, c); };
  texts.forEach(t => row.children.push({ tagName: 'SPAN', textContent: t, cls: new Set(), get classList() { const s = this.cls; return { add: c => s.add(c), contains: c => s.has(c) }; } }));
  return row;
}
function suite(F) {
  /* v565: المنطقُ بمصدرٍ واحد — SyDentBadgeCap بـtheme.js (صفحةُ المواعيد + لوحةُ التحكم) */
  const T = F['theme.js'];
  const mod = T.slice(T.indexOf('/* ═══ SyDent — سقفُ الشارات'));
  const w = {}; const doc = { readyState: 'complete', getElementById: () => true, head: { appendChild() {} },
    createElement: () => ({ type: '', className: '', textContent: '', title: '', setAttribute() {}, addEventListener(t, f) { this['_' + t] = f; } }) };
  try { vm.runInNewContext(mod, { window: w, document: doc }); } catch (e) {}
  const cap = w.SyDentBadgeCap;
  const run = texts => { const r = mkRow(texts); const sp = r.children.slice(); cap.apply(r, sp, r, 3); return { r, hidden: sp.filter(e => e.cls.has('ab-more')).map(e => e.textContent), plus: r.children.find(e => e.className === 'ab-plus') }; };
  let x = run(['🥽 مخبر', '🦷 2', '💬', '🪑 كرسي 1', '⚠️ تحذير طبي', '⚠️ حساسية', '🔁 3/6', '⭐ VIP', '⚡ انتظار']);
  ok(cap && x.hidden.length === 6 && x.hidden.indexOf('⚠️ تحذير طبي') < 0 && x.hidden.indexOf('⚠️ حساسية') < 0 && x.hidden.indexOf('⚡ انتظار') < 0 && x.plus && x.plus.textContent === '+6',
     'medical warning · allergy · waiting never collapse (and count toward the three); the rest behind +N');
  x = run(['🪑 كرسي', '💰 متبقي', '👪 الأسرة', '⚠ 3/6', '⚠️ موعد قريب — أرسل تذكير']);
  ok(x.hidden.length === 2 && x.hidden[0] === '⚠ 3/6' && x.hidden[1] === '⚠️ موعد قريب — أرسل تذكير', 'reliability/reminder badges that merely start with ⚠️ are NOT safety (owner screenshot: they crowded the card)');
  x = run(['🥽 مخبر', '🦷 2', '💬']);
  ok(x.hidden.length === 0 && !x.plus, 'three or fewer ⇒ untouched');
  x = run(['🥽', '🦷', '💬', '🪑']); cap.apply(x.r, x.r.children.slice(), x.r, 3);
  ok(x.r.children.filter(e => e.className === 'ab-plus').length === 1, 'idempotent per card');
  ok(/ev\.stopPropagation\(\); ev\.preventDefault\(\);/.test(mod) && /b\.addEventListener\('keydown', function \(ev\) \{ ev\.stopPropagation\(\); \}\);/.test(mod), '+N never opens the appointment (click or key)');
  const H = F['appointments.html'], X = F['index.html'];
  ok(/window\.SyDentBadgeCap\.apply\(rows\[i\], kids, rows\[i\], APPT_BADGE_MAX\);/.test(H) && /querySelectorAll\('\.appt-name, \.list-name'\)/.test(H), 'appointments page (day + list) uses the shared cap');
  ok(/window\.SyDentBadgeCap\.apply\(it, b, hud \|\| nm, DASH_BADGE_MAX\);/.test(X) && /if \(hud\) for \(c = 0; c < hud\.children\.length; c\+\+\) b\.push\(hud\.children\[c\]\);/.test(X), 'dashboard «today» card: name-line badges + huddle chips capped together');
  ok(/'⚠️ تحذير طبي<\/span>'/.test(F['appt-modal.js']) || />⚠️ تحذير طبي<\/span>'/.test(F['appt-modal.js']), 'mirrored badge builders unchanged');
  /* v564 — بطاقةُ العلاج (قرار المالك «أ»): «مفضّل» و«تعديل» ظاهران والأربعةُ خلف «⋯ المزيد» */
  const TR = F['treatments.html'];
  const blk = TR.slice(TR.indexOf("'<div class=\"treat-actions sy-acts sy-acts-grid\">'"), TR.indexOf("  grid.innerHTML = html;"));
  const iDet = blk.indexOf('<details class="trt-more">'), iEnd = blk.indexOf("'</div></details>'");
  const before = blk.slice(0, iDet), inside = blk.slice(iDet, iEnd);
  ok(/onclick="toggleFavorite\(/.test(before) && /onclick="editTreatment\(/.test(before) && !/duplicateTreatment|openMaterialsModal|toggleActive|deleteTreatment/.test(before), 'treatment card: favourite + edit stay visible');
  ok(['duplicateTreatment', 'openMaterialsModal', 'toggleActive', 'deleteTreatment'].every(f => inside.indexOf('onclick="' + f + '(') > -1) && /<summary class="sy-act"[^>]*>⋯ المزيد<\/summary>/.test(inside), 'treatment card: copy · materials · (de)activate · delete behind «⋯ المزيد»');
  ok(/t\.closest\('button, a, input, select, \.drag-handle, summary, \.trt-more'\)\) return;/.test(TR), 'opening «⋯» never opens the edit form (card click guard)');
  ok(/\.trt-more\[open\]\{grid-column:1 \/ -1;\}/.test(TR), 'the open menu spans the card width');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['medical badge collapsible', rep('theme.js', "return t.indexOf('تحذير طبي') > -1 || t.indexOf('حساسية') > -1 || t.indexOf('⚡') === 0;", "return t.indexOf('⚡') === 0;")],
  ['any ⚠️ counted as safety', rep('theme.js', "return t.indexOf('تحذير طبي') > -1 || t.indexOf('حساسية') > -1 || t.indexOf('⚡') === 0;", "return t.indexOf('⚠') === 0 || t.indexOf('⚡') === 0;")],
  ['click opens the appointment', rep('theme.js', 'ev.stopPropagation(); ev.preventDefault();', 'ev.preventDefault();')],
  ['not idempotent', rep('theme.js', "if (!root || root.__abCap) return; root.__abCap = true;", "if (!root) return;")],
  ['dashboard huddle row ignored', rep('index.html', 'if (hud) for (c = 0; c < hud.children.length; c++) b.push(hud.children[c]);', '')],
  ['list view forgotten', rep('appointments.html', "querySelectorAll('.appt-name, .list-name')", "querySelectorAll('.appt-name')")],
  ['delete back on the card face', rep('treatments.html', "          + '<details class=\"trt-more\">", "          + '<button class=\"sy-act\" onclick=\"deleteTreatment(1)\">x</button><details class=\"trt-more\">")],
  ['⋯ opens the edit form', rep('treatments.html', ", .drag-handle, summary, .trt-more')) return;", ", .drag-handle')) return;")]
];
suite(base);
const bp = pass, bf = fail;
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
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-appt-badges: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-appt-badges: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
