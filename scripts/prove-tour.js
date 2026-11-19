/* prove-tour — الجولات التعريفية (tour.js): ثوابتٌ تُفحص من الملفات الحية.
   (١) الجولات الأربع موجودة (اللوحة · البطاقة · المخابر · المخزون) · كل خطوةٍ لها عنوانٌ ونصٌّ بالعربية والإنجليزية · الإنجليزية بلا حرفٍ عربي ·
       العربية عربيةٌ فعلاً · الدوال التي تعيد نصّاً تُفحص بفرعيها (بطاقة تجريبية / حقيقية).
   (٢) كل رابطٍ بالقائمة الجانبية تشير إليه الجولة العامة موجودٌ بـnavItems في sidebar.js.
   (٣) كل معرّفٍ (#id أو getElementById/rowOf) تشير إليه الجولة موجودٌ في صفحته أو في الوحدات التي تبنيها.
   (٤) sidebar.js يحمّل tour.js على الصفحات الأربع بتوكنه، والجولة لا تكتب شيئاً بالقاعدة (لا sb.from/rpc/insert).
   (٤ب) كل زرٍّ تشير إليه جولة المخزون بـonclick موجودٌ في inventory.html، و«30 يوماً» = عتبة الصلاحية في الصفحة.
   (٤د) الجولة المفصّلة: الفصول الستة موجودة وكلٌّ يختم بخطوةٍ ختامية فيها أزرار الفصول · زرّ «جولة مفصّلة» يفتح البطاقة التجريبية
        بـtour=detail وfrom · كل دالةٍ تنقرها الفصول (onclick) موجودة في البطاقة · مفاتيح الحشوة والمعالجة اللبية مبنيّة في الكتالوج.
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
  ok(tours && tours.dashboard && tours.patient && tours.labs && tours.inventory, 'the four tours exist (dashboard · patient · labs · inventory)');
  if (!tours || !tours.dashboard || !tours.patient || !tours.labs || !tours.inventory) return out;

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
  const DCH = ['d-sess', 'd-fill', 'd-endo', 'd-lab', 'd-pay', 'd-appt'];
  const untitled = ['dashboard', 'patient', 'labs', 'inventory'].concat(DCH).some(p => tours[p] && tours[p].some(s => !s.title || !s.body));
  ok(!untitled, 'every step has a title and a body');
  const finals = ['dashboard', 'patient', 'labs', 'inventory'].concat(DCH.filter(k => tours[k])).every(p => tours[p][tours[p].length - 1].final === true);
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
  for (const m of F['tour.js'].matchAll(/#(labOrdersContent|labsList|ordersBody|ordersCards|toothModal|labOrderModal|itemsList)\b/g)) ids.add(m[1]);
  const homes = F['patient-profile.html'] + F['labs.html'] + F['inventory.html'] + F['index.html'] + F['lab-files.js'] + F['lab-stages.js'] + F['sidebar.js'] + F['pp-dental.js'] + F['pp-clinical.js'];
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
  ok(/function loadTour\(/.test(sb) && /\n  loadTour\(activeId\);/.test(sb) && /'tour\.js' \+ \(q \? '\?' \+ q : ''\)/.test(sb) && /\['index', 'patient-profile', 'labs', 'inventory'\]/.test(sb), 'sidebar.js loads tour.js on the four pages with its own version token');
  const invSrc = F['tour.js'].slice(F['tour.js'].indexOf('var INVENTORY = ['), F['tour.js'].indexOf('الجولة المفصّلة (طلب المالك'));
  const onc = [...invSrc.matchAll(/\[onclick\^?="([\w]+)/g)].map(m => m[1]);
  const lostOnc = onc.filter(fn => !F['inventory.html'].includes('onclick="' + fn + '(') && !F['inventory.html'].includes("onclick=\"" + fn + "(\\''"));
  ok(onc.length >= 5 && lostOnc.length === 0, 'every inventory button the tour points at exists in inventory.html (' + [...new Set(onc)].join(', ') + ')' + (lostOnc.length ? ' — missing: ' + lostOnc.join(', ') : ''));
  ok(/if \(days <= 30\) return \{ state:'soon'/.test(F['inventory.html']) && /30 يوماً/.test(invSrc) && /30 days/.test(invSrc), 'the inventory tour\'s «30 days» matches the page\'s expiry threshold');
  ok(!/\bsb\.(from|rpc)\b|window\.sb\b|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(F['tour.js'].replace(/\/\*[\s\S]*?\*\//g, '')), 'the tour never touches the database');
  ok(!/setAttribute\('data-i18n-skip'/.test(F['tour.js']) && /el\.card\.dir = EN \? 'ltr' : 'rtl'/.test(F['tour.js']), 'the card is written in the chosen language with its direction (no data-i18n-skip — that marks Arabic content and turns it right-to-left)');

  ok(/navigator\.webdriver && localStorage\.getItem\('sydent\.tour\.autostart'\) !== '1'/.test(F['tour.js']) && /!st\.done && !st\.snoozed && !automated/.test(F['tour.js']), 'no self-start under browser automation (E2E clicks are never blocked) unless the test asks for it');

  // (٤ج) نافذة الطلب البطيئة: خطوات السن قبلها تتقدّم إليها متى فُتحت، والنقر على «حفظ + إرسال لمخبر» يُمهل فتحها
  const aheadN = (F['tour.js'].match(/ahead: AHEAD_LAB/g) || []).length;
  ok(aheadN >= 4 && /id: 'lab-fill'/.test(F['tour.js']) && /closest\('#toothLabBtn'\)\) labWaitUntil = Date\.now\(\) \+ \d+/.test(F['tour.js']) && /dir >= 0 && s\.ahead && s\.ahead\.when\(\) && jumpTo/.test(F['tour.js']),
    'a slow lab window never sends the tour back to the tooth (wait after «Save + send to lab» · tooth steps jump ahead once it opens)');
  // (٤د) الجولة المفصّلة
  const lostCh = DCH.filter(k => !tours[k] || !tours[k].length || !tours[k][tours[k].length - 1].chapEnd);
  ok(lostCh.length === 0, 'the six detailed-tour chapters exist and each ends on a chapter-end step' + (lostCh.length ? ' — ' + lostCh.join(', ') : ''));
  const T0 = F['tour.js'];
  ok(/'patient-profile\.html\?id=demo&tour=detail' \+ \(id \? '&from=' \+ id : ''\)/.test(T0) && /isDemo\(\) && \/\[\?&\]tour=detail/.test(T0) && /sd-tour-detail/.test(T0),
    'the «Detailed tour» button opens the demo card with tour=detail and from, and the demo card opens the chapter picker');
  const ppAll = F['patient-profile.html'] + F['pp-dental.js'] + F['pp-clinical.js'] + F['pp-core.js'];
  const fns = [...new Set([...T0.matchAll(/\[onclick="([A-Za-z_]\w*)\(/g), ...T0.matchAll(/\[onclick\^?="([A-Za-z_]\w*)\(/g)].map(m => m[1]))];
  const lostFn = fns.filter(fn => !new RegExp('function ' + fn + '\\b|var ' + fn + ' = |' + fn + ' = function').test(ppAll + F['labs.html'] + F['inventory.html']));
  ok(fns.length >= 8 && lostFn.length === 0, 'every page function the tours tap exists (' + fns.length + ')' + (lostFn.length ? ' — missing: ' + lostFn.join(', ') : ''));
  ok(/'treated'/.test(T0) && /'root-canal'/.test(T0) && /treatment_key:'treated'/.test(R('treatments.html')) && /treatment_key:'root-canal'/.test(R('treatments.html')), 'the filling and root-canal fallbacks are built-in catalogue treatments');
  ok(/var PEND_SEL = '#nseGrid button, \.sd-page-head__actions button, \.crown-surface, \.root-part/.test(T0) && /if \(s\.need && !s\.need\(\) && s\.onLost\) \{\s*if \(pending\(\)\)/.test(T0) &&
     /if \(s && s\.act && !s\.act\.done\(\)\) \{ if \(pending\(\) && !\(s\.need && s\.need\(\)\)\) return;/.test(T0) && (T0.match(/ahead: AH_(TOOTH|S2|FILL|ENDO)/g) || []).length >= 10,
    'a window still opening (slow phone) never sends a chapter back to its start, «Do it for me» is not repeated meanwhile, and chapters catch up when the dentist is ahead');
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
  ['tour.js', 'sidebar.js', 'patient-profile.html', 'labs.html', 'inventory.html', 'pp-core.js', 'index.html', 'lab-files.js', 'lab-stages.js', 'pp-dental.js', 'pp-clinical.js', 'i18n-en.js'].forEach(f => { F[f] = R(f); });
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
    ['the tour self-starts under automation', f => { f['tour.js'] = f['tour.js'].replace('!st.done && !st.snoozed && !automated', '!st.done && !st.snoozed'); }],
    ['sidebar stops loading the inventory tour', f => { f['sidebar.js'] = f['sidebar.js'].replace("'labs', 'inventory'].indexOf", "'labs'].indexOf"); }],
    ['an inventory button that does not exist', f => { f['tour.js'] = f['tour.js'].replace('[onclick="openCountModal()"]', '[onclick="openStockCount()"]'); }],
    ['the expiry window changes without the tour', f => { f['inventory.html'] = f['inventory.html'].replace('if (days <= 30) return', 'if (days <= 45) return'); }],
    ['the inventory tour is gone', f => { f['tour.js'] = f['tour.js'].replace('labs: LABS, inventory: INVENTORY', 'labs: LABS'); }],
    ['the tooth steps no longer jump ahead to the open lab window', f => { f['tour.js'] = f['tour.js'].split('ahead: AHEAD_LAB, ').join(''); }],
    ['no wait after «Save + send to lab»', f => { f['tour.js'] = f['tour.js'].replace("labWaitUntil = Date.now() + 15000", "labWaitUntil = 0"); }],
    ['a detailed chapter is gone', f => { f['tour.js'] = f['tour.js'].replace("'d-pay': D_PAY, ", ''); }],
    ['a chapter loses its chapter-end', f => { f['tour.js'] = f['tour.js'].split("final: true, chapEnd: true, ico: '🗓️'").join("final: true, ico: '🗓️'"); }],
    ['a chapter taps a page function that does not exist', f => { f['tour.js'] = f['tour.js'].replace('[onclick="openApptModal()"]', '[onclick="openAppointment()"]'); }],
    ['the detailed tour no longer passes from', f => { f['tour.js'] = f['tour.js'].replace("(id ? '&from=' + id : '')", "''"); }],
    ['a slow tooth window sends the chapter back again', f => { f['tour.js'] = f['tour.js'].replace('if (pending()) { lostAt = 0; place(null, s); syncWait(s); return; }', ''); }],
    ['«Do it for me» repeats while a window opens', f => { f['tour.js'] = f['tour.js'].replace('if (s && s.act && !s.act.done()) { if (pending() && !(s.need && s.need())) return;', 'if (s && s.act && !s.act.done()) {'); }],
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
