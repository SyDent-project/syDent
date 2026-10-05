/* v547 — مثبتُ «لا شريطَ تنقّلٍ يُخفي عناصرَه بتمريرٍ أفقي بلا إشارة» (صورة المالك من الآيفون + الفحص الشامل).
   المسحُ بمتصفحٍ حقيقي على 390 وجد العيبَ نفسَه بثلاثة أشرطة: تبويبات التقارير (v543) · أقسام الإعدادات · شرائح تصنيفات
   العلاجات. هذا المثبت يمنع عودة أيٍّ منها إلى التمرير المخفي. --self-test: طفرات. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const hid = rule => /overflow-x\s*:\s*(auto|scroll)/.test(rule) && /scrollbar-width\s*:\s*none/.test(rule);
function rulesFor(css, sel) {
  const out = [], re = new RegExp(sel.replace(/[.#]/g, m => '\\' + m) + '\\s*\\{([^}]*)\\}', 'g'); let m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out;
}
function suite(F) {
  const PR = F['provider-reports.html'], ST = F['settings.html'], TR = F['treatments.html'];
  ok(/@container \(max-width:720px\)\{\n  \.rpt-tabs\{display:grid;[^}]*overflow:visible;/.test(PR) && rulesFor(PR, '.rpt-tabs').every(r => !/scrollbar-width\s*:\s*none/.test(r) || /overflow:visible/.test(PR)), 'reports tabs: a visible grid on phones');
  const sn = rulesFor(ST, '.stg-nav');
  ok(sn.length >= 2 && sn.every(r => !hid(r)) && !/\.stg-nav::-webkit-scrollbar\{display:none;\}/.test(ST), 'settings sections: never a hidden horizontal scroll');
  ok(/\.stg-nav\{display:flex;gap:6px;flex-wrap:wrap;/.test(ST), 'settings sections wrap');
  const fc = rulesFor(TR, '.flt-row .filter-chips');
  ok(fc.length >= 2 && fc.every(r => !hid(r)) && /\.flt-row \.filter-chips\{flex:none;width:100%;flex-wrap:wrap;\}/.test(TR), 'treatment category chips wrap on phones');
}
const FILES = ['provider-reports.html', 'settings.html', 'treatments.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['settings back to hidden scroll', rep('settings.html', '  .stg-nav{top:56px;}', '  .stg-nav{overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none;top:56px;}')],
  ['chips back to hidden scroll', rep('treatments.html', '  .flt-row .filter-chips{flex:none;width:100%;flex-wrap:wrap;}', '  .flt-row .filter-chips{flex:none;width:100%;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;}')],
  ['reports tabs back to a scroll strip', rep('provider-reports.html', '.rpt-tabs{display:grid;grid-template-columns', '.rpt-tabs{display:flex;grid-template-columns')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-no-hidden-scroll: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-no-hidden-scroll: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
