/* prove-tour — الجولات التعريفية (tour.js): ثوابتٌ تُفحص من الملفات الحية.
   (١) الجولات الثلاث موجودة · كل خطوةٍ لها عنوانٌ ونصٌّ بالعربية والإنجليزية · الإنجليزية بلا حرفٍ عربي ·
       العربية عربيةٌ فعلاً · الدوال التي تعيد نصّاً تُفحص بفرعيها (بطاقة تجريبية / حقيقية).
   (٢) كل رابطٍ بالقائمة الجانبية تشير إليه الجولة العامة موجودٌ بـnavItems في sidebar.js.
   (٣) كل معرّفٍ (#id أو getElementById/rowOf) تشير إليه الجولة موجودٌ في صفحته أو في الوحدات التي تبنيها.
   (٤) sidebar.js يحمّل tour.js على الصفحات الثلاث بتوكنه، والجولة لا تكتب شيئاً بالقاعدة (لا sb.from/rpc/insert).
   (٥) البطاقة التجريبية فيها «مخبر تجريبي» نشط بالطبقة المحلية وموعدُ تركيبٍ قادم — بالذاكرة وحدها.
   --self-test يشغّل طفراتٍ يجب أن تُكشف كلها. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const AR = /[؀-ۿ]/;

function loadTours(src, demo, en) {
  const store = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const ctx = {
    console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: demo ? '?id=demo' : '?id=1', pathname: '/patient-profile.html' },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, createTextNode: () => ({}), head: el(), body: el(), addEventListener() {}, removeEventListener() {} },
    getComputedStyle: () => ({}), matchMedia: () => ({ matches: false }), innerWidth: 1366, innerHeight: 768,
    addEventListener() {}, removeEventListener() {}, Event: function () {}, MouseEvent: function () {}
  };
  ctx.window = ctx; ctx.SyI18n = { lang: en ? 'en' : 'ar' };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.SyDentTour;
}

function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  let tours;
  try { tours = loadTours(F['tour.js'], false, false).tours; }
  catch (e) { ok(false, 'tour.js throws on load: ' + e.message); return out; }
  ok(tours && tours.dashboard && tours.patient && tours.labs, 'the three tours exist (dashboard · patient · labs)');
  if (!tours || !tours.dashboard || !tours.patient || !tours.labs) return out;

  // (١) النصوص
  const texts = [];
  for (const demo of [true, false]) {
    const t = loadTours(F['tour.js'], demo, false).tours;
    for (const p of Object.keys(t)) t[p].forEach((s, i) => ['title', 'body', 'tip'].forEach(k => {
      let v = s[k]; if (typeof v === 'function') v = v(); if (v == null) return;
      texts.push({ where: p + '#' + (i + 1) + '.' + k, v });
    }));
  }
  const noPair = texts.filter(x => typeof x.v !== 'object' || !x.v.ar || !x.v.en);
  ok(noPair.length === 0, 'every title/body/tip has Arabic and English' + (noPair.length ? ' — missing: ' + noPair[0].where : ''));
  const arInEn = texts.filter(x => x.v && x.v.en && AR.test(x.v.en));
  ok(arInEn.length === 0, 'English texts carry no Arabic letter' + (arInEn.length ? ' — ' + arInEn[0].where : ''));
  const notAr = texts.filter(x => x.v && x.v.ar && !AR.test(x.v.ar));
  ok(notAr.length === 0, 'Arabic texts are Arabic' + (notAr.length ? ' — ' + notAr[0].where : ''));
  const untitled = ['dashboard', 'patient', 'labs'].some(p => tours[p].some(s => !s.title || !s.body));
  ok(!untitled, 'every step has a title and a body');
  const finals = ['dashboard', 'patient', 'labs'].every(p => tours[p][tours[p].length - 1].final === true);
  ok(finals, 'each tour ends on a final step');
  const uiMatch = F['tour.js'].match(/var UI = \{([\s\S]*?)\n  \};/);
  const uiBad = uiMatch ? [...uiMatch[1].matchAll(/en: '([^']*)'/g)].filter(m => AR.test(m[1])) : [1];
  ok(uiMatch && uiBad.length === 0, 'button and counter labels have English without Arabic');

  // (٢) روابط القائمة
  const hrefs = [...F['tour.js'].matchAll(/nav\('([^']+)'\)/g)].map(m => m[1]);
  const navHrefs = new Set([...F['sidebar.js'].matchAll(/href: '([^']+)'/g)].map(m => m[1]));
  const lostHref = hrefs.filter(h => !navHrefs.has(h));
  ok(hrefs.length >= 9 && lostHref.length === 0, 'every sidebar link the dashboard tour points at exists in sidebar.js (' + hrefs.length + ')' + (lostHref.length ? ' — missing: ' + lostHref.join(', ') : ''));

  // (٣) المعرّفات
  const ids = new Set();
  for (const m of F['tour.js'].matchAll(/\$\('#([A-Za-z][\w-]*)/g)) ids.add(m[1]);
  for (const m of F['tour.js'].matchAll(/(?:getElementById|rowOf|modalOpen)\('([A-Za-z][\w-]*)'\)/g)) ids.add(m[1]);
  for (const m of F['tour.js'].matchAll(/#(labOrdersContent|labsList|ordersBody|ordersCards|toothModal|labOrderModal)\b/g)) ids.add(m[1]);
  const homes = F['patient-profile.html'] + F['labs.html'] + F['index.html'] + F['lab-files.js'] + F['lab-stages.js'] + F['sidebar.js'] + F['pp-dental.js'] + F['pp-clinical.js'];
  const own = new Set(['sdtStyle', 'sdtTtl']);
  const declared = id => homes.includes('id="' + id + '"') || homes.includes("id='" + id + "'") || homes.includes('id=\\"' + id + '\\"') || homes.includes(".id = '" + id + "'");
  const missing = [...ids].filter(id => !own.has(id) && !declared(id));
  ok(ids.size >= 20 && missing.length === 0, 'every id the tours use exists in its page or module (' + ids.size + ')' + (missing.length ? ' — missing: ' + missing.join(', ') : ''));
  const tabNames = [...F['tour.js'].matchAll(/goTab\('(\w+)'\)/g)].map(m => m[1]);
  const lostTab = tabNames.filter(n => !F['patient-profile.html'].includes("switchTab('" + n + "'") || !F['patient-profile.html'].includes('id="tab-' + n + '"'));
  ok(tabNames.length >= 4 && lostTab.length === 0, 'every patient tab the tour opens exists (' + [...new Set(tabNames)].join(', ') + ')' + (lostTab.length ? ' — missing: ' + lostTab.join(', ') : ''));
  ok(F['tour.js'].includes("pickToothTreatment\\('crown'") && /treatment_key:'crown'/.test(R('treatments.html')), 'the crown the demo chapter picks is a built-in catalogue treatment');

  // (٤) التحميل · لا كتابة
  const sb = F['sidebar.js'];
  ok(/function loadTour\(/.test(sb) && /\n  loadTour\(activeId\);/.test(sb) && /'tour\.js' \+ \(q \? '\?' \+ q : ''\)/.test(sb) && /\['index', 'patient-profile', 'labs'\]/.test(sb), 'sidebar.js loads tour.js on the three pages with its own version token');
  ok(!/\bsb\.(from|rpc)\b|window\.sb\b|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(F['tour.js'].replace(/\/\*[\s\S]*?\*\//g, '')), 'the tour never touches the database');
  ok(!/setAttribute\('data-i18n-skip'/.test(F['tour.js']) && /el\.card\.dir = EN \? 'ltr' : 'rtl'/.test(F['tour.js']), 'the card is written in the chosen language with its direction (no data-i18n-skip — that marks Arabic content and turns it right-to-left)');

  // (٥) البطاقة التجريبية
  const pp = F['patient-profile.html'];
  const demoStart = pp.indexOf('var IS_DEMO = '), demoEnd = pp.indexOf('real.from = function', demoStart);
  const demo = demoStart > -1 ? pp.slice(demoStart, demoEnd) : '';
  ok(/ovRows\('labs'\)\.push\(\{ id:'demo-lab1'[^}]*is_active:true/.test(demo), 'the demo card has an active «Demo lab» in its local overlay only');
  ok(/appointments: \[\s*\{ id:'demo-a1'[^}]*date:_fd\(\d+\)[^}]*status:'confirmed'/.test(demo), 'the demo card has an upcoming fitting appointment in memory');
  ok(/'مخبر تجريبي': 'Demo lab'/.test(F['i18n-en.js']) && /'تركيب تاج': 'Crown fitting'/.test(F['i18n-en.js']), 'the demo lab and appointment names have English entries');
  return out;
}

function files() {
  const F = {};
  ['tour.js', 'sidebar.js', 'patient-profile.html', 'labs.html', 'index.html', 'lab-files.js', 'lab-stages.js', 'pp-dental.js', 'pp-clinical.js', 'i18n-en.js'].forEach(f => { F[f] = R(f); });
  return F;
}

const F = files();
const res = run(F);
const bad = res.filter(r => !r[0]);
res.forEach(r => console.log((r[0] ? '✓ ' : '✗ ') + r[1]));

if (process.argv.includes('--self-test')) {
  const M = [
    ['drop an English body', f => { f['tour.js'] = f['tour.js'].replace(", en: 'Your clinic day at a glance", ", xx: 'Your clinic day at a glance"); }],
    ['Arabic inside English', f => { f['tour.js'] = f['tour.js'].replace("en: 'Reports'", "en: 'التقارير'"); }],
    ['a sidebar link that does not exist', f => { f['tour.js'] = f['tour.js'].replace("nav('inventory.html')", "nav('stock.html')"); }],
    ['an id that does not exist', f => { f['tour.js'] = f['tour.js'].replace("$('#labOrderSaveBtn')", "$('#labOrderSaveButton')"); }],
    ['a tab that does not exist', f => { f['tour.js'] = f['tour.js'].replace("goTab('payments')", "goTab('billing')"); }],
    ['sidebar stops loading the tour', f => { f['sidebar.js'] = f['sidebar.js'].replace('loadTour(activeId);\n}', '\n}'); }],
    ['the tour writes to the database', f => { f['tour.js'] = f['tour.js'].replace('function goTab(name) {', 'function goTab(name) { window.sb.from("x");'); }],
    ['the demo lab is inactive', f => { f['patient-profile.html'] = f['patient-profile.html'].replace("notes:'', is_active:true, created_at:_ts(30)", "notes:'', created_at:_ts(30)"); }],
    ['the demo appointment is gone', f => { f['patient-profile.html'] = f['patient-profile.html'].replace("{ id:'demo-a1'", "{ id:'demo-x1'"); }],
    ['the demo chapter picks a crown that is not built in', f => { f['tour.js'] = f['tour.js'].split("pickToothTreatment\\('crown'").join("pickToothTreatment\\('crown_x'"); }],
    ['the card is marked as Arabic content', f => { f['tour.js'] = f['tour.js'].replace("el.card.tabIndex = -1;", "el.card.tabIndex = -1; el.card.setAttribute('data-i18n-skip', '');"); }],
    ['a tour loses its final step', f => { f['tour.js'] = f['tour.js'].replace("{ center: true, final: true, ico: '🎉',\n      title: { ar: 'أنت جاهز!', en: 'You\\'re all set!' },\n      body: { ar: 'الدورة", "{ center: true, ico: '🎉',\n      title: { ar: 'أنت جاهز!', en: 'You\\'re all set!' },\n      body: { ar: 'الدورة"); }]
  ];
  let caught = 0;
  M.forEach(([name, mut]) => {
    const f = Object.assign({}, F); mut(f);
    if (JSON.stringify(f) === JSON.stringify(F)) { console.log('✗ mutation did not apply: ' + name); return; }
    const r = run(f);
    if (r.some(x => !x[0])) caught++; else console.log('✗ mutation survived: ' + name);
  });
  console.log((caught === M.length && !bad.length ? '✅' : '❌') + ' prove-tour: ' + (res.length - bad.length) + '/' + res.length + ' · mutations caught ' + caught + '/' + M.length);
  process.exit(bad.length || caught !== M.length ? 1 : 0);
}
console.log((bad.length ? '❌' : '✅') + ' prove-tour: ' + (res.length - bad.length) + '/' + res.length);
process.exit(bad.length ? 1 : 0);
