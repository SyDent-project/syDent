/* prove-landing-colors — صفحة التعريف (landing.html) بألوان اللوغو والتطبيق بلونه (طلب المالك، تشرين الأول 2026):
   كتلةُ التجاوز الخضراء موجودة، وتأتي بعد رابط theme.css (وإلا غلبها لون التطبيق)، وتغطّي الفاتح والغامق،
   وصفحات التطبيق نفسها لا تحمل هذه الألوان. ضاعت الكتلة مرةً بدمجٍ حُلّ لصالح main — هذا الفحص يمنع تكرارها.
   --self-test يشغّل طفرات يجب أن تُكشف كلها. */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const L0 = R('landing.html'), T = R('theme.css');

function run(L) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  const link = L.search(/<link rel="stylesheet" href="theme\.css\?v=[0-9a-z]+">/);
  const light = L.search(/:root\[data-theme="light"\]\{--green:#0d8577;[^}]*--green-rgb:13,133,119;/);
  const dark = L.search(/:root\[data-theme="dark"\]\{--green:#2ee89e;[^}]*--green-rgb:46,232,158;/);
  ok(link > -1, 'landing loads theme.css');
  ok(light > -1 && dark > -1, 'landing overrides the brand tokens with the logo greens, light and dark');
  ok(light > link && dark > link, 'the override comes after theme.css, so it wins over the app colour');
  ok(!/#0d8577/i.test(T.match(/--green:\s*#[0-9a-f]{6}/i)[0]), 'the app itself keeps its own brand colour (theme.css --green is not the logo green)');
  return out;
}

const MUTANTS = [
  ['override dropped', /<style>\n\/\* صفحة التعريف بألوان اللوغو[\s\S]*?<\/style>\n/, ''],
  ['override before theme.css', /(<link rel="stylesheet" href="theme\.css\?v=[0-9a-z]+">\n)(<style>\n\/\* صفحة التعريف بألوان اللوغو[\s\S]*?<\/style>\n)/, '$2$1'],
  ['dark mode left out', /:root\[data-theme="dark"\]\{--green:#2ee89e;[^}]*\}/, '']
];
const self = process.argv.includes('--self-test');
let pass = 0, fail = 0;
run(L0).forEach(([c, m]) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } });
let bit = 0;
if (self) MUTANTS.forEach(([name, a, b]) => {
  const src = L0.replace(a, b);
  if (src === L0) { console.log('MUTANT DID NOT APPLY: ' + name); return; }
  if (run(src).some(([c]) => !c)) bit++; else console.log('MUTANT SURVIVED: ' + name);
});
const good = fail === 0 && (!self || bit === MUTANTS.length);
console.log((good ? '✅' : '❌') + ' prove-landing-colors: ' + pass + '/' + (pass + fail) + (self ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
process.exit(good ? 0 : 1);
