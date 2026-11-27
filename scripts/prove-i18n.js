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
const PAGES = ['landing.html', 'auth.html', 'pending.html', 'reset-password.html', 'index.html', 'patients.html', 'patient-profile.html', 'appointments.html', 'treatments.html', 'doctors.html', 'labs.html', 'radiology.html', 'inventory.html', 'accounting.html', 'expenses.html', 'payouts.html', 'settings.html', 'subscription.html', 'employees.html', 'audit-log.html', 'provider-reports.html', 'learn.html', 'privacy.html'];
const AR = /[؀-ۿ]/;

function staticStrings(html) {
  let s = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(\w+)\b[^>]*\sdata-(?:i18n-skip|en)\b[^>]*>[^<]*<\/\1>/g, '<x></x>');   // a leaf the engine skips (data, or a placeholder JS clears) or one that carries its own English (data-en)
  s = s.replace(/<[^>]*\sdata-i18n-skip\b[^>]*>/g, '<x>');   // a skipped element's own attributes (e.g. a phrase the user must type in Arabic)
  const out = new Set();
  for (const m of s.matchAll(/>([^<>]+)</g)) { const t = m[1].replace(/\s+/g, ' ').trim(); if (AR.test(t)) out.add(t); }
  for (const m of s.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) { const t = m[1].replace(/&#10;/g, '\n').replace(/\s+/g, ' ').trim(); if (AR.test(t)) out.add(t); }
  return [...out];
}

function engine(theme, dictSrc, page, lang) {
  const store = { 'sydent.lang': lang };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const mount = { load: null, where: null, cls: '' };   // where the language button lands once the page has loaded
  const sw = { parentNode: { insertBefore(b) { mount.where = 'sidebar'; mount.cls = b.className; } } };
  const ctx = {
    console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: page.charAt(0) === '/' ? page : '/' + page, reload() {} },
    document: {
      readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: Object.assign(el(), { appendChild(b) { mount.where = 'float'; mount.cls = b.className; } }),
      write() {}, querySelector: () => null, getElementById: id => (id === 'sbThemeSwitch' ? sw : null), addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} })
    },
    MutationObserver: function () { this.observe = () => {}; }
  };
  ctx.window = ctx; ctx.window.addEventListener = (ev, cb) => { if (ev === 'load') mount.load = cb; };
  ctx.__mount = mount;
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
  ok(t('⚠️ النسخة ناقصة — تعذّرت قراءة 3 من 61 جدولاً. احذف الملف وحاول مجدداً') === '⚠️ The backup is incomplete — 3 of 61 tables could not be read. Delete the file and try again'
    && t('⚠️ الملف الذي نزل ليس نسخة احتياطية صالحة — احذفه وحاول مجدداً') === "⚠️ The file that downloaded isn't a valid backup — delete it and try again", 'backup warnings (partial file with its counts · text fallback) come out in English');
  /* «فحص ملف نسخة»: every line the report can show, and every sheet name it can list, through the engine */
  {
    const ixb = F['index.html'].slice(F['index.html'].indexOf('// BACKUP-BEGIN'), F['index.html'].indexOf('// BACKUP-END'));
    const B = new Function(ixb + '; return { DASH_BACKUP_TABLES, dashBackupReport };')();
    const items = B.DASH_BACKUP_TABLES.map((x, i) => ({ sheet: x[2], missing: i + 1, of: i + 7 }));
    const lines = [].concat(
      B.dashBackupReport({ stamp: '2026-11-28 00:10', tables: 61, rows: 4512, missing: 0, added: 0, items: [], skipped: 0, broken: false, uncompared: 0 }),
      B.dashBackupReport({ stamp: '2026-11-28 00:10', tables: 61, rows: 4512, missing: 9, added: 5, items: items.slice(0, 12), skipped: 2, broken: true, uncompared: 3 }),
      B.dashBackupReport({ stamp: '', tables: 2, rows: 5, missing: 0, added: 0, items: [], skipped: 0, broken: false, uncompared: 2 }),
      items.map(it => '• ' + it.sheet + ': ' + it.missing + ' من ' + it.of));
    const src = F['index.html'].slice(F['index.html'].indexOf('async function dashBackupMenu'), F['index.html'].indexOf('loadDashboard();\ndashBackupInit();'));
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*[\u0600-\u06FF](?:[^'\\\n]|\\.)*)'/g)) if (!/\s$/.test(m[1])) lines.push(m[1]);   // a piece that ends in a space is the start of a line proven above
    const left = lines.filter(l => { const o = t(l); return o == null || AR.test(o.replace(/«[^»]*»/g, '')); });
    ok(lines.length > 90 && left.length === 0, 'backup file check: all ' + lines.length + ' report lines, sheet names and dialog texts come out in English' + (left.length ? ' — left: ' + left[0] + ' → ' + t(left[0]) : ''));
    ok(t('• المرضى: 2 من 20') === '• Patients: 2 of 20' && t('الجداول: 61 · الصفوف: 4512') === 'Tables: 61 · Rows: 4512', 'backup file check: the numbers stay the same');
  }
  ok(t('أحمد الخطيب') === 'أحمد الخطيب', 'text with no entry (a patient name) is left as is');
  const A = engine(F['theme.js'], F['i18n-en.js'], 'book.html', 'en');
  ok(A.window.SyI18n.lang === 'ar' && A.window.SyI18n.chosen === 'en', 'pages not translated yet stay Arabic even when English is chosen');
  /* the site root «/» IS the dashboard (manifest start_url — how the installed app opens): same language, same button */
  const btn = (path, lang) => { const X = engine(F['theme.js'], F['i18n-en.js'], path, lang); if (X.__mount.load) X.__mount.load(); return { ready: X.window.SyI18n.ready, lang: X.window.SyI18n.lang, where: X.__mount.where, cls: X.__mount.cls }; };
  const root = btn('/', 'ar'), idx = btn('/index.html', 'ar'), clean = btn('/index', 'ar');
  ok(root.ready && root.where === 'sidebar' && /\bsy-lang-sb\b/.test(root.cls), 'the root URL «/» mounts the language button in the side menu');
  ok(idx.where === 'sidebar' && clean.where === 'sidebar' && root.cls === idx.cls, '«/», «/index.html» and «/index» mount the same button');
  ok(btn('/', 'en').lang === 'en' && btn('/index.html', 'en').lang === 'en', 'English chosen ⇒ the dashboard is English on «/» as on «/index.html»');
  ok(btn('/book.html', 'ar').where === null && btn('/admin.html', 'ar').where === null, 'a page outside EN_PAGES still gets no language button');
  return out;
}

const FILES = ['theme.js', 'i18n-en.js'].concat(PAGES);
const F0 = {}; FILES.forEach(f => { F0[f] = R(f); });
const MUTANTS = [
  ['a landing string loses its entry', 'i18n-en.js', "  'جاهز لتنظيم عيادتك؟': 'Ready to organise your clinic?',\n", ''],
  ['arrow not flipped', 'theme.js', "return c === '←' ? '→' : '←';", "return c;"],
  ['English forced on every page', 'theme.js', 'var on = lang === \'en\' && ready;', 'var on = lang === \'en\';'],
  ['pattern dropped', 'i18n-en.js', "  [/^حتى (\\d+) مريض$/, 'Up to $1 patients'],\n", ''],
  ['backup check: a sheet name loses its entry', 'i18n-en.js', "  'موافقات المرضى': 'Patient consents',\n", ''],
  ['backup check: missing-rows line loses its pattern', 'i18n-en.js', "  [/^• (.+): (\\d+) من (\\d+)$/, '• $1: $2 of $3'],\n", ''],
  ['backup partial-file warning loses its pattern', 'i18n-en.js', "'The backup is incomplete — $1 of $2 tables could not be read. Delete the file and try again'", "'النسخة ناقصة'"],
  ['untranslated value', 'i18n-en.js', "'Most popular'", "'الأكثر شعبية'"],
  ['root URL not treated as the dashboard', 'theme.js', ".replace(/\\.html$/, '') || 'index';", ".replace(/\\.html$/, '');"],
  ['language button mounted on untranslated pages', 'theme.js', "if (ready) window.addEventListener('load'", "window.addEventListener('load'"]
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
