/* prove-i18n — خيار اللغة الإنجليزية (SyI18n بـtheme.js + القاموس i18n-en.js)، المرحلة 1:
   (١) كل نصٍّ عربي ثابت بصفحات المرحلة (نصوص الوسوم + placeholder/title/aria-label/alt + <title>) له
       ترجمة — نصٌّ يُضاف لاحقاً بلا ترجمة يُوقف الدمج بدل أن يظهر عربياً وسط الإنجليزية.
   (٢) ترجماتٌ بلا حرف عربي، والصفحات المترجَمة هي نفسها قائمة EN_PAGES بالمحرّك.
   (٣) المحرّك نفسه (يُشغَّل بـvm بوثيقةٍ مزيّفة): الإنجليزية خارج EN_PAGES لا تعمل، الرموز المحيطة تبقى
       والسهم ينقلب، الأنماط الرقمية (الأسعار · الحدود)، وما لا يطابق القاموس (اسم مريض) يبقى كما هو.
   --self-test يشغّل طفرات يجب أن تُكشف كلها. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGES = ['landing.html', 'auth.html', 'pending.html', 'reset-password.html'];
const AR = /[؀-ۿ]/;

function staticStrings(html) {
  let s = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  for (const m of s.matchAll(/>([^<>]+)</g)) { const t = m[1].replace(/\s+/g, ' ').trim(); if (AR.test(t)) out.add(t); }
  for (const m of s.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) { const t = m[1].replace(/\s+/g, ' ').trim(); if (AR.test(t)) out.add(t); }
  return [...out];
}

function engine(theme, dictSrc, page, lang) {
  const store = { 'sydent.lang': lang };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = {
    console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/' + page, reload() {} },
    document: {
      readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(),
      write() {}, querySelector: () => null, getElementById: () => null, addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} })
    },
    MutationObserver: function () { this.observe = () => {}; }
  };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(dictSrc, ctx);
  vm.runInContext(theme.slice(start, end), ctx);
  return ctx;
}

function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  let D, P;
  try { const c = { window: {} }; vm.createContext(c); vm.runInContext(F['i18n-en.js'], c); D = c.window.SyI18nDict; P = c.window.SyI18nPatterns; }
  catch (e) { ok(false, 'i18n-en.js throws: ' + e.message); return out; }
  const core = t => { const m = t.match(/^[^؀-ۿ]*?([؀-ۿ][\s\S]*[؀-ۿ.)»؟:،]|[؀-ۿ])[^؀-ۿ]*$/); return m ? m[1] : t; };
  for (const p of PAGES) {
    const miss = staticStrings(F[p]).filter(t => D[t] == null && D[core(t)] == null && !P.some(x => x[0].test(t) || x[0].test(core(t))));
    ok(miss.length === 0, p + ': every static Arabic string has an English entry' + (miss.length ? ' — missing: ' + miss.slice(0, 4).join(' | ') : ''));
  }
  const bad = Object.keys(D).filter(k => AR.test(D[k]));
  ok(bad.length === 0, 'no English value still carries Arabic' + (bad.length ? ': ' + bad[0] : ''));
  const list = (F['theme.js'].match(/var EN_PAGES = \[([^\]]*)\]/) || [])[1] || '';
  ok(PAGES.every(p => list.includes("'" + p.replace('.html', '') + "'")) && (list.match(/'/g) || []).length === PAGES.length * 2, 'the engine enables exactly the translated pages');

  let E;
  try { E = engine(F['theme.js'], F['i18n-en.js'], 'landing.html', 'en'); } catch (e) { ok(false, 'engine throws: ' + e.message); return out; }
  const t = s => E.window.SyI18n.t(s);
  ok(E.window.SyI18n.lang === 'en', 'English is on for a translated page');
  ok(t('أرسل طلب التجربة المجانية ←') === 'Request your free trial →', 'surrounding symbols kept, the «next» arrow flips');
  ok(t('❌ البريد أو كلمة المرور غير صحيحة') === '❌ Incorrect email or password', 'a prefixed message is translated by its core');
  ok(t('وفّر ~17%') === 'Save ~17%' && t('🦷 حتى 150 مريض') === '🦷 Up to 150 patients' && t('≈ 25 ل.س / شهر') === '≈ 25 SYP / month', 'runtime patterns: savings, limits, per-month price with the currency');
  ok(t('أحمد الخطيب') === 'أحمد الخطيب', 'text with no entry (a patient name) is left as is');
  const A = engine(F['theme.js'], F['i18n-en.js'], 'patients.html', 'en');
  ok(A.window.SyI18n.lang === 'ar' && A.window.SyI18n.chosen === 'en', 'pages not translated yet stay Arabic even when English is chosen');
  return out;
}

const FILES = ['theme.js', 'i18n-en.js'].concat(PAGES);
const F0 = {}; FILES.forEach(f => { F0[f] = R(f); });
const MUTANTS = [
  ['a landing string loses its entry', 'i18n-en.js', "  'جاهز لتنظيم عيادتك؟': 'Ready to organise your clinic?',\n", ''],
  ['arrow not flipped', 'theme.js', "return c === '←' ? '→' : '←';", "return c;"],
  ['English forced on every page', 'theme.js', 'var on = lang === \'en\' && ready;', 'var on = lang === \'en\';'],
  ['pattern dropped', 'i18n-en.js', "  [/^حتى (\\d+) مريض$/, 'Up to $1 patients'],\n", ''],
  ['untranslated value', 'i18n-en.js', "'Most popular'", "'الأكثر شعبية'"]
];
const self = process.argv.includes('--self-test');
let pass = 0, fail = 0;
run(F0).forEach(([c, m]) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } });
let bit = 0;
if (self) MUTANTS.forEach(([name, f, a, b]) => {
  const F = Object.assign({}, F0); F[f] = F0[f].replace(a, b);
  if (F[f] === F0[f]) { console.log('MUTANT DID NOT APPLY: ' + name); return; }
  if (run(F).some(([c]) => !c)) bit++; else console.log('MUTANT SURVIVED: ' + name);
});
const good = fail === 0 && (!self || bit === MUTANTS.length);
console.log((good ? '✅' : '❌') + ' prove-i18n: ' + pass + '/' + (pass + fail) + (self ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
process.exit(good ? 0 : 1);
