/* v560 — مثبتُ حقل التاريخ الموحّد (DeepCode #19 · docs/DEEPCODE_REVIEW.md) — مستقل، على theme.js الحيّ.
   (١) التحليل والعرض والتنسيق (بـvm): ي/ش/سنة بأي فاصل · 8 أرقام · ISO كما هو · أرقام عربية · تاريخٌ مستحيل ⇒ null ·
       ناقص ⇒ null · فارغ ⇒ '' · العرض DD/MM/YYYY · التنسيقُ التلقائي لا يكسر كتابةً بفواصلَ يدوية.
   (٢) العقد مع الكود القائم: value يُعاد تعريفه على النسخة (قراءةٌ/كتابة بـYYYY-MM-DD) · الكتابة تُفسَّر بالتقاط المستند قبل
       مستمعي الصفحة · المنتقي المرافق يطلق input+change على الحقل · reset يُعيد العرض.
   (٣) الحلقة المميتة: المنتقي المرافق لا يُعزَّز أبداً (لا بالفحص ولا بالمراقب) — كانت تُجمّد صفحةً تُنشئ حقولها ديناميكياً.
   (٤) المنتقي محصورٌ بزرّ 📅 (!important) فلا تمطّه قواعدُ الصفحات على input[type=date] فوق الحقل؛ ومواضعُ فيزيائية (LTR داخل RTL).
   (٥) قواعدُ الصفحات المكتوبة لـinput[type=date] تشمل الحقلَ الموحّد.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILES = ['theme.js', 'theme.css', 'accounting.html', 'payouts.html'];
const base = {}; FILES.forEach(f => base[f] = read(f));
function suite(F) {
  const T = F['theme.js'];
  const M = T.slice(T.indexOf('/* ═══ SyDent — حقلُ التاريخ الموحّد'));
  const core = M.slice(M.indexOf('function lat(s)'), M.indexOf('function enhance(el)'));
  const c = {}; try { vm.runInNewContext(core + ';this.p=parse;this.f=fmt;this.m=mask;', c); } catch (e) {}
  const P = [['01/10/2026', '2026-10-01'], ['1/10/2026', '2026-10-01'], ['01-10-2026', '2026-10-01'], ['01.10.2026', '2026-10-01'], ['01102026', '2026-10-01'],
    ['٠١/١٠/٢٠٢٦', '2026-10-01'], ['2026-10-01', '2026-10-01'], ['31/02/2026', null], ['29/02/2028', '2028-02-29'], ['1/10', null], ['', ''], ['abc', null], ['01/13/2026', null]];
  ok(c.p && P.every(([a, b]) => c.p(a) === b), '(١) parse truth table (separators · 8 digits · ISO · Arabic digits · impossible/partial ⇒ null · empty ⇒ "")');
  ok(c.f && c.f('2026-10-01') === '01/10/2026' && c.f('') === '' && c.f(null) === '', '(١) display DD/MM/YYYY');
  ok(c.m && c.m('011') === '01/1' && c.m('01/102') === '01/10/2' && c.m('01/10/20261') === '01/10/2026' && c.m('1/10/2026') === '1/10/2026' && c.m('٠١١') === '01/1', '(١) auto-mask, never fighting manual separators');
  /* (٢) */
  ok(/Object\.defineProperty\(el, 'value', \{ configurable: true,\s*get: function \(\) \{ return iso; \},\s*set: function \(v\) \{ show\(parse\(v\) \|\| ''\); \} \}\);/.test(M), '(٢) value read/write stays YYYY-MM-DD for every existing caller');
  ok(/document\.addEventListener\('input', function \(e\) \{ var t = e\.target; if \(t && t\.__syDfTyped && e\.isTrusted\) t\.__syDfTyped\(\); \}, true\);/.test(M), '(٢) typing parsed in the capture phase, before page listeners');
  ok(/pick\.addEventListener\('change', function \(\) \{\s*show\(P\.get\.call\(pick\) \|\| ''\);\s*el\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);\s*el\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\);/.test(M), '(٢) picking fires input + change on the field');
  ok(/el\.form\.addEventListener\('reset'/.test(M) && /iso = r \|\| '';/.test(M), '(٢) form reset re-syncs · incomplete typing reads as "" (like the native field)');
  /* (٣) */
  ok(/el\.classList\.contains\('sy-df-pick'\)\)\) return;/.test(M) && /pick\.__syDf = true;/.test(M) && /root\.matches\('input\[type="date"\]:not\(\.sy-df-pick\)'\)/.test(M) && /querySelectorAll\('input\[type="date"\]:not\(\.sy-df-pick\)'\)/.test(M),
     '(٣) the companion picker is never enhanced (no observer loop)');
  /* (٤) */
  ok(/\.sy-df>\.sy-df-pick\{position:absolute !important;left:0 !important;right:auto !important;top:0 !important;bottom:0 !important;width:38px !important;/.test(M) && /max-width:38px !important;/.test(M), '(٤) picker pinned to the 📅 button whatever page CSS says');
  ok(/\.sy-df>\.sy-df-in\{width:100%;box-sizing:border-box;padding-left:38px !important;text-align:right;/.test(M) && /\.sy-df-ico\{position:absolute;left:10px;/.test(M), '(٤) physical sides: icon left, text right (LTR field in an RTL page)');
  /* (٥) */
  ok(/\.field input\[type="date"\], \.field input\.sy-df-in \{/.test(F['accounting.html']) && /\.ds-ctl input\[type="date"\], \.ds-ctl input\.sy-df-in \{/.test(F['accounting.html'])
     && /\.date-range input\[type="date"\], \.date-range input\.sy-df-in \{/.test(F['payouts.html']) && /\.date-range input\[type="date"\], \.date-range \.sy-df \{ flex: 1 1 130px;/.test(F['payouts.html'])
     && /\.lrd-dialog \.sy-df > input\.sy-df-in\.lrd-due \{/.test(F['theme.css']), '(٥) page rules written for date inputs also style the unified field');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['impossible dates accepted', rep('theme.js', "    return valid(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : null;", "    return y + '-' + pad(mo) + '-' + pad(d);")],
  ['Arabic digits rejected', rep('theme.js', "replace(/[\\u0660-\\u0669\\u06F0-\\u06F9]/g", "replace(/[\\u0000-\\u0000]/g")],
  ['mask fights manual slashes', rep('theme.js', "    for (var k = 0; k < s.length; k++) if (s.charAt(k) === '/' && k !== 2 && k !== 5) return s;\n", '')],
  ['value getter returns display text', rep('theme.js', "      get: function () { return iso; },", "      get: function () { return P.get.call(el); },")],
  ['typing parsed after page listeners', rep('theme.js', "t.__syDfTyped(); }, true);", "t.__syDfTyped(); }, false);")],
  ['picker change silent', rep('theme.js', "      el.dispatchEvent(new Event('change', { bubbles: true }));\n    });", "    });")],
  ['observer loop', rep('theme.js', "    pick.__syDf = true;", "    pick.__syDfX = true;")],
  ['picker stretchable', rep('theme.js', "width:38px !important;min-width:0 !important;max-width:38px !important;", "width:38px;min-width:0;")],
  ['payouts rule misses the field', rep('payouts.html', '.date-range input[type="date"], .date-range input.sy-df-in {', '.date-range input[type="date"] {')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-datefield: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-datefield: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
