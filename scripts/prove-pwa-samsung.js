/* v625 — مثبتُ «التثبيت عبر Chrome» على متصفح سامسونج — مستقل، على الملفات الحيّة (jsdom).
   الخلل (بلاغ المالك بصورة، 13 تشرين الأول 2026): Samsung Internet يلتقط beforeinstallprompt ويبني
   APK خاصاً به موجَّهاً لإصدار أندرويد قديم ⇒ Google Play Protect: «تم حظر تطبيق غير آمن».
   (١) theme.js: SyDentPWA.samsungBrowser (UA سامسونج + أندرويد فقط) · chromeIntentUrl يفتح الصفحة نفسها بـChrome
       وصفحةُ Chrome على Play احتياطاً.
   (٢) البطاقة العائمة: سامسونج ⇒ «افتح بـChrome» ولا زرّ تثبيت حتى مع beforeinstallprompt، وحتى لمن رفض الدعوة
       القديمة (مفتاحٌ مستقل) · «لاحقاً» يُسكتها · كروم ⇒ «ثبّت الآن» كما كان · iOS كما كان.
   (٣) بطاقة الإعدادات: سامسونج ⇒ نصُّ Chrome + data-samsung، والنقر يفتح Chrome ولا يستدعي promptInstall.
   runScripts: dangerously كي يُنفَّذ onclick المضمَّن ببطاقة الإعدادات (الجسمُ بلا وسوم script).
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('⏭ prove-pwa-samsung: jsdom غير متاح — تخطٍّ'); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const base = { 'theme.js': read('theme.js'), 'settings.html': read('settings.html') };

const UA = {
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  chrome:  'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  ios:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  samsungDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36'
};

function mkWin(ua, body, ls) {
  const vc = new VirtualConsole(); const navs = [];
  vc.on('jsdomError', e => { if (/navigation/i.test(String(e && e.message))) navs.push(1); });
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + (body || '') + '</body></html>',
    { url: 'https://sydent.app/settings.html?x=1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(w.navigator, 'serviceWorker', { value: { controller: null, addEventListener() {}, register() { return Promise.resolve(); } }, configurable: true });
  Object.keys(ls || {}).forEach(k => w.localStorage.setItem(k, ls[k]));
  return { w, navs };
}
function fireBip(w) {
  const e = new w.Event('beforeinstallprompt', { cancelable: true }); let prompted = 0;
  e.prompt = () => { prompted++; }; w.dispatchEvent(e); return () => prompted;
}
function floating(F, ua, ls, bip) {
  const { w, navs } = mkWin(ua, '', ls);
  w.eval(F['theme.js']);
  if (bip) fireBip(w);
  w.document.dispatchEvent(new w.CustomEvent('sydent-can-install'));
  return new Promise(r => setTimeout(() => r({ w, navs, card: w.document.getElementById('syInstallCard') }), 2700));
}
function settingsCard(F, ua, bip) {
  const S = F['settings.html'];
  const a0 = S.indexOf('<a class="shub-card" href="#" id="pwaInstallCard"'), a1 = S.indexOf('</a>', a0) + 4;
  const s0 = S.indexOf('/* PWA Phase 3: بطاقة التثبيت'), s1 = S.indexOf('})();', s0) + 5;
  const { w, navs } = mkWin(ua, S.slice(a0, a1));
  w.eval(F['theme.js']);
  let prompted = () => 0; if (bip) prompted = fireBip(w);
  w.eval(S.slice(s0, s1));
  w.document.dispatchEvent(new w.CustomEvent('sydent-can-install'));
  return { w, navs, prompted, card: w.document.getElementById('pwaInstallCard') };
}

async function suite(F) {
  /* (١) الكشف والرابط */
  let { w } = mkWin(UA.samsung); w.eval(F['theme.js']);
  ok(w.SyDentPWA && w.SyDentPWA.samsungBrowser === true, '(١) Samsung Internet on Android is detected');
  const u = w.SyDentPWA.chromeIntentUrl();
  ok(u.indexOf('intent://sydent.app/settings.html?x=1#Intent;scheme=https;package=com.android.chrome;') === 0 && /;end$/.test(u),
     '(١) intent opens this very page in Chrome');
  ok(u.indexOf('S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome')) > 0,
     '(١) no Chrome ⇒ Chrome on Play as fallback');
  for (const k of ['chrome', 'ios', 'samsungDesktop']) {
    ({ w } = mkWin(UA[k])); w.eval(F['theme.js']);
    ok(w.SyDentPWA.samsungBrowser === false, '(١) not flagged: ' + k);
  }
  /* (٢) البطاقة العائمة */
  let r = await floating(F, UA.samsung, {}, true);
  ok(r.card && /عبر Chrome/.test(r.card.textContent) && /Play Protect/.test(r.card.textContent), '(٢) Samsung ⇒ Chrome guidance card');
  ok(r.card && !r.w.document.getElementById('syicGo') && r.w.document.getElementById('syicChrome'), '(٢) Samsung ⇒ no install button even after beforeinstallprompt');
  r.w.document.getElementById('syicChrome').click();
  ok(r.navs.length === 1 && r.w.localStorage.getItem('sydent_install_samsung') === '1' && !r.w.document.getElementById('syInstallCard'),
     '(٢) «افتح بـChrome» navigates, remembers, closes');
  r = await floating(F, UA.samsung, { sydent_install_prompt: '1' }, true);
  ok(!!r.card && /عبر Chrome/.test(r.card.textContent), '(٢) Samsung user who dismissed/used the old invite still sees the guidance once');
  r = await floating(F, UA.samsung, { sydent_install_samsung: '1' }, true);
  ok(!r.card, '(٢) guidance dismissed ⇒ silent');
  r = await floating(F, UA.samsung, {}, true);
  r.w.document.getElementById('syicLater').click();
  ok(r.w.localStorage.getItem('sydent_install_samsung') === '1' && r.w.localStorage.getItem('sydent_install_prompt') === null, '(٢) «لاحقاً» on Samsung silences only the Samsung guidance');
  r = await floating(F, UA.chrome, {}, true);
  ok(r.card && r.w.document.getElementById('syicGo') && !r.w.document.getElementById('syicChrome'), '(٢) Chrome ⇒ «ثبّت الآن» as before');
  r = await floating(F, UA.ios, {}, false);
  ok(r.card && /سفاري/.test(r.card.textContent) && !r.w.document.getElementById('syicChrome'), '(٢) iOS ⇒ Safari instructions as before');
  /* (٣) بطاقة الإعدادات */
  let c = settingsCard(F, UA.samsung, true);
  ok(c.card.style.display === 'flex' && c.card.getAttribute('data-samsung') === '1' && /عبر Chrome/.test(c.card.textContent), '(٣) Samsung ⇒ settings card points to Chrome');
  c.card.click();
  ok(c.navs.length === 1 && c.prompted() === 0, '(٣) click opens Chrome, never the Samsung installer');
  c = settingsCard(F, UA.chrome, true);
  ok(c.card.style.display === 'flex' && !c.card.hasAttribute('data-samsung') && /كتطبيق/.test(c.card.textContent), '(٣) Chrome ⇒ install card as before');
  c.card.click();
  ok(c.prompted() === 1 && c.navs.length === 0, '(٣) Chrome click ⇒ native install prompt');
}

const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['detection broken', rep('theme.js', '/SamsungBrowser/i.test(ua)', '/SamsungBrowserX/i.test(ua)')],
  ['Android requirement dropped', rep('theme.js', ' && /Android/i.test(ua);', ';')],
  ['floating card ignores Samsung', rep('theme.js', '      if (window.SyDentPWA && window.SyDentPWA.samsungBrowser) {\n        if (!dismissed(KEY_SS))', '      if (false) {\n        if (!dismissed(KEY_SS))')],
  ['shared dismissal key', rep('theme.js', "var KEY_SS = 'sydent_install_samsung';", "var KEY_SS = 'sydent_install_prompt';")],
  ['intent without Chrome package', rep('theme.js', 'package=com.android.chrome;S.browser', 'S.browser')],
  ['settings show ignores Samsung', rep('settings.html', "      if(window.SyDentPWA && window.SyDentPWA.samsungBrowser){", '      if(false){')],
  ['settings click prompts on Samsung', rep('settings.html', "if(this.getAttribute('data-samsung')==='1')", 'if(false)')]
];

(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-pwa-samsung: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-pwa-samsung: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
