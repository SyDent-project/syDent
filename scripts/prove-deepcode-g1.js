/* v558 — مثبتُ مجموعة «الأرقام والعدّادات» من ملاحظات Deep Code (docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   #11 تعريفٌ واحد لـ«مواعيد اليوم» (SyDentApptLive): الملغى/المكسور/لم يحضر لا يُعدّ — بشارة القائمة وبطاقة اللوحة وسطرها.
   #3  نسبُ البطاقات بحدٍّ منطقي ±999% مع تفسيرٍ بالسطر الفرعي؛ التصديرُ وملخّصُ الذكاء على الرقم الخام؛ المعادلاتُ لم تُمسّ.
   #4  نصُّ «معلومات إضافية» وبطاقةُ المواد يشرحان لماذا الرقمُ خارج الربح (منعاً للعدّ المزدوج).
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const base = { 'supabase-init.js': read('supabase-init.js'), 'sidebar.js': read('sidebar.js'), 'index.html': read('index.html'), 'accounting.html': read('accounting.html') };
function suite(F) {
  /* #11 */
  const I = F['supabase-init.js'];
  const L = I.slice(I.indexOf('window.SyDentApptLive = function (a) {'), I.indexOf('window.SyDentApptDead = function'));
  const w = {}; try { vm.runInNewContext(L, { window: w }); } catch (e) {}
  const live = w.SyDentApptLive;
  ok(typeof live === 'function' && ['confirmed', 'scheduled', 'completed', 'arrived', ''].every(s => live({ status: s })) && ['cancelled', 'broken', 'no_show'].every(s => !live({ status: s })) && !live(null),
     '#11 one definition: cancelled/broken/no-show excluded, completed kept');
  const S = F['sidebar.js'];
  ok(/\.from\('appointments'\)\.select\('id,status'\)/.test(S) && /const count = \(appts \|\| \[\]\)\.filter\(_live\)\.length;/.test(S) && /const _live = window\.SyDentApptLive \|\|/.test(S), '#11 sidebar badge counts with it');
  const X = F['index.html'];
  ok(/const _liveToday = apptsToday\.filter\(window\.SyDentApptLive \|\|/.test(X) && /textContent = _liveToday\.length;/.test(X) && /'لديك ' \+ _liveToday\.length \+ ' موعد اليوم'/.test(X) && /const upcoming = _liveToday\.filter\(/.test(X)
     && !/textContent = apptsToday\.length;/.test(X), '#11 dashboard KPI, header line and «remaining» count with it (the card list itself unchanged)');
  /* #3 */
  const A = F['accounting.html'];
  const code = [fnSrc(A, 'function fmtPct('), 'var ACC_PCT_CAP = ' + ((A.match(/var ACC_PCT_CAP = (\d+);/) || [])[1] || 'NaN') + ';', fnSrc(A, 'function fmtPctCard('), fnSrc(A, 'function pctOutOfRange(')].join('\n');
  const c = {}; try { vm.runInNewContext(code + ';this.f=fmtPctCard;this.o=pctOutOfRange;', c); } catch (e) {}
  ok(c.f && c.f(187187.2) === '>999%' && c.f(-1500) === '<−999%' && c.f(-220) === '-220.0%' && c.f(98) === '98.0%' && c.f(999) === '999.0%' && c.f(null) === '—' && c.f(NaN) === '—',
     '#3 cards: >±999% shown as a bound, normal values exactly as before');
  ok(c.o && c.o(187187) && c.o(-1000) && !c.o(999) && !c.o(null), '#3 out-of-range detector');
  const R = fnSrc(A, 'function renderSummaryCards(');
  ok(/collectionRateStr = \(cr === null\) \? '—' : fmtPctCard\(cr\);/.test(R) && /\(profitMargin === null \? '—' : fmtPctCard\(profitMargin\)\)/.test(R), '#3 both ratio cards use the bounded formatter');
  ok(/pctOutOfRange\(cr\) \? 'تحصيلُ ذممٍ سابقة/.test(R) && /pctOutOfRange\(profitMargin\) \? 'الإيرادُ ضئيلٌ جداً/.test(R), '#3 each bound carries its plain-language reason');
  ok(/lines\.push\('معدّل التحصيل: ' \+ \(collectionRate === null \? 'غير متاح' : fmtPct\(collectionRate\)\)\);/.test(A) && /sum\.push\(\[c, 'معدّل التحصيل %', _accNum\(L\.collectionRate\)\]\);/.test(A), '#3 export and AI digest keep the raw figure');
  ok(/var collectionRate = \(netProduction > 0\) \? \(grossRevenue \/ netProduction\) \* 100 : null;/.test(A) && /var profitMargin = \(netRevenue > 0\) \? \(netProfit \/ netRevenue\) \* 100 : null;/.test(A), '#3 formulas untouched');
  /* #4 */
  ok(/تكلفةُ المخبر تدخل المصروفات لحظة الإرسال/.test(A) && /يحسبها مرتين/.test(fnSrc(A, 'function renderMaterialCostSection(')), '#4 the reference cards explain why they sit outside profit');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['no-show counted', rep('supabase-init.js', "return st !== 'cancelled' && st !== 'broken' && st !== 'no_show';", "return st !== 'cancelled' && st !== 'broken';")],
  ['completed dropped', rep('supabase-init.js', "return st !== 'cancelled' && st !== 'broken' && st !== 'no_show';", "return st !== 'cancelled' && st !== 'broken' && st !== 'no_show' && st !== 'completed';")],
  ['sidebar counts every row', rep('sidebar.js', 'const count = (appts || []).filter(_live).length;', 'const count = (appts || []).length;')],
  ['dashboard KPI counts every row', rep('index.html', "document.getElementById('statApptToday').textContent = _liveToday.length;", "document.getElementById('statApptToday').textContent = apptsToday.length;")],
  ['no bound', rep('accounting.html', "  if (n > ACC_PCT_CAP) return '>' + ACC_PCT_CAP + '%';\n", '')],
  ['margin card unbounded', rep('accounting.html', "(profitMargin === null ? '—' : fmtPctCard(profitMargin))", "(profitMargin === null ? '—' : fmtPct(profitMargin))")],
  ['no reason shown', rep('accounting.html', "            : pctOutOfRange(cr) ? 'تحصيلُ ذممٍ سابقة أكبرُ بكثير من إنتاج هذه الفترة — النسبة لا تعبّر عن أداء الفترة'\n", '')],
  ['export capped too', rep('accounting.html', "sum.push([c, 'معدّل التحصيل %', _accNum(L.collectionRate)]);", "sum.push([c, 'معدّل التحصيل %', fmtPctCard(L.collectionRate)]);")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-deepcode-g1: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-deepcode-g1: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
