/* v702 — مثبتُ مربع التحقق (Cloudflare Turnstile) — مستقل، على الملفات الحيّة (jsdom + بديلٌ عن واجهة turnstile).
   البلاغ (صورة المالك، 10 تشرين الثاني 2026): المربع غامقٌ على صفحة الدخول الفاتحة وأضيق من الحقول،
   ونافذتا حذف الحساب على مساعدٍ قديم يرسل توكناً فارغاً عند الضغط السريع.
   (١) اللون من ثيم المنصة (data-theme) لا من وضع الجهاز: لا «auto» إطلاقاً.
   (٢) تبديلُ الثيم يعيد رسم المربع الظاهر باللون الجديد ويُسقط توكنه؛ المخفيّ يُزال فقط ويُرسم عند طلبه.
   (٣) العرضُ «flexible» + قاعدةُ CSS تمدّه بعرض الحقول؛ وحيث الحقولُ أضيق من أرضية Cloudflare (300px —
       أغلبُ الهواتف) يُصغَّر المربع إلى عرضها بدل أن يبرز عنها.
   (٤) المساعدُ واحدٌ حرفياً بالصفحات الثلاث (الدخول يزيد سطرَ بذر مربعه فقط).
   (٥) حذفُ الحساب (الإعدادات · الاشتراك) ينتظر التوكن، ولا يرسل شيئاً للخادم بلا توكن.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('⏭ prove-turnstile: jsdom غير متاح — تخطٍّ'); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PAGES = ['auth.html', 'settings.html', 'subscription.html'];
const base = {}; PAGES.forEach(f => { base[f] = read(f); });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));

const HELPER_RE = /<script>\n(\(function\(\)\{\n  var SITEKEY = [\s\S]*?\n\}\)\(\);)\n<\/script>\n<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit&onload=onSyDentTurnstileLoad" async defer><\/script>/;
const helperOf = src => { const m = src.match(HELPER_RE); return m ? m[1] : null; };
const SEED = "  // The login widget is visible at page load → seed its render intent now.\n  wanted['login'] = 'ts-login';\n";

/* جسمُ دالّةٍ من موضع بدايتها حتى قوسها المطابق (يتخطّى النصوص والتعليقات). */
function block(src, head) {
  const s = src.indexOf(head); if (s < 0) return null;
  let i = src.indexOf('{', s + head.length - 1), d = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { for (i++; src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '{') d++;
    if (c === '}' && --d === 0) return src.slice(s, i + 1);
  }
  return null;
}

function mkWin(theme, body) {
  const dom = new JSDOM('<!doctype html><html data-theme="' + theme + '"><head></head><body>' + body + '</body></html>',
    { url: 'https://www.sydent.app/auth.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window, d = w.document;
  /* الظهور: jsdom بلا تخطيط ⇒ المخفيّ هو ما تحت [data-hidden] */
  w.Element.prototype.getClientRects = function () { return this.closest('[data-hidden]') ? [] : [{}]; };
  const live = {}, T = { renders: [], removed: [], resets: [], live };
  let n = 0;
  w.turnstile = {
    render(el, o) { const id = 'w' + (++n), box = d.createElement('div'); box.setAttribute('data-w', id); el.appendChild(box);
      live[id] = { o, el, box, token: '' }; T.renders.push({ id, el, o }); return id; },
    remove(id) { T.removed.push(id); if (live[id]) { live[id].box.remove(); delete live[id]; } },
    reset(id) { T.resets.push(id); if (live[id]) live[id].token = ''; },
    getResponse(id) { return live[id] ? live[id].token : ''; }
  };
  T.solve = (id, tok) => { live[id].token = tok; live[id].o.callback(tok); };
  return { w, d, T };
}
const last = T => T.renders[T.renders.length - 1];

async function suite(F) {
  const H = {}; PAGES.forEach(f => { H[f] = helperOf(F[f]); });
  ok(H['auth.html'] && H['settings.html'] && H['subscription.html'], 'helper block found on the three pages');
  if (!H['auth.html'] || !H['settings.html'] || !H['subscription.html']) return;

  /* (٤) مساعدٌ واحد */
  ok(H['settings.html'] === H['subscription.html'], '(٤) subscription helper is a literal copy of settings');
  ok(H['auth.html'].includes(SEED) && H['auth.html'].split(SEED).join('') === H['settings.html'], '(٤) auth helper = shared helper + the login seed only');

  /* (١) اللون من ثيم المنصة */
  const AUTH_BODY = '<div id="tabLogin"></div><div id="tabRegister"></div>' +
    '<form id="loginForm"><div id="ts-login" class="cf-turnstile-box"></div></form>' +
    '<form id="registerForm" class="hidden" data-hidden><div id="ts-register" class="cf-turnstile-box"></div></form>';
  for (const th of ['light', 'dark']) {
    const { w, T } = mkWin(th, AUTH_BODY);
    w.eval(H['auth.html']); w.onSyDentTurnstileLoad();
    const r = last(T);
    ok(T.renders.length === 1 && r.el.id === 'ts-login', '(١) login box is drawn once at load (' + th + ')');
    ok(r && r.o.theme === th, '(١) box theme = platform theme «' + th + '», got «' + (r && r.o.theme) + '»');
    ok(r && r.o.size === 'flexible', '(٣) size is flexible');
    ok(r && r.o.language === 'ar' && r.o.appearance === 'always' && r.o.action === 'login', 'language · appearance · action as before');
  }

  /* (٢) تبديل الثيم */
  {
    const { w, d, T } = mkWin('light', AUTH_BODY);
    w.eval(H['auth.html']); w.onSyDentTurnstileLoad();
    w.hideMsg = () => {};
    w.eval(block(F['auth.html'], 'function switchTab(which) {') || 'function switchTab(){}');
    const first = last(T).id;
    T.solve(first, 'TOK-LIGHT');
    ok(await w.waitTurnstileToken('login', 30) === 'TOK-LIGHT', 'a solved box hands its token');
    d.documentElement.setAttribute('data-theme', 'light'); await tick(5);
    ok(T.removed.length === 0 && T.renders.length === 1, '(٢) same theme set again ⇒ nothing redrawn');
    d.documentElement.setAttribute('data-theme', 'dark'); await tick(5);
    ok(T.removed.join() === first, '(٢) theme switch removes the old box');
    ok(T.renders.length === 2 && last(T).o.theme === 'dark' && last(T).el.id === 'ts-login', '(٢) and draws it again in the new theme');
    ok(d.getElementById('ts-login').children.length === 1, '(٢) exactly one box in the container');
    ok(w.getTurnstileToken('login') === '' && await w.waitTurnstileToken('login', 30) === '', '(٢) the old token does not survive the redraw');
    T.solve(last(T).id, 'TOK-DARK');
    ok(await w.waitTurnstileToken('login', 30) === 'TOK-DARK', '(٢) the new box hands a fresh token');
    /* تبويب التسجيل: يُرسم عند إظهاره، ثم يُخفى ويُبدَّل الثيم */
    d.getElementById('registerForm').removeAttribute('data-hidden'); d.getElementById('loginForm').setAttribute('data-hidden', '');
    w.switchTab('register');
    ok(last(T).el.id === 'ts-register' && last(T).o.theme === 'dark', 'register box drawn when its tab opens, in the current theme');
    const before = T.renders.length;
    d.documentElement.setAttribute('data-theme', 'light'); await tick(5);
    const drawn = T.renders.slice(before);
    ok(drawn.length === 1 && drawn[0].el.id === 'ts-register' && drawn[0].o.theme === 'light', '(٢) the visible box is redrawn');
    ok(T.removed.length === 3 && d.getElementById('ts-login').children.length === 0, '(٢) the hidden box is removed and not redrawn while hidden');
    d.getElementById('loginForm').removeAttribute('data-hidden'); d.getElementById('registerForm').setAttribute('data-hidden', '');
    w.switchTab('login');
    ok(last(T).el.id === 'ts-login' && last(T).o.theme === 'light' && d.getElementById('ts-login').children.length === 1, '(٢) back on the login tab its box is drawn again');
    /* رمزُ الخطأ بالرسالة */
    last(T).o['error-callback']('600010');
    ok(/\(رمز: 600010\)$/.test(w.tsPendingMsg('login')) && w.tsPendingMsg('register') === w.TS_PENDING_MSG, 'pending message carries the last Cloudflare error code');
  }

  /* (٣) الحقولُ أضيق من 300px ⇒ المربع يُصغَّر إلى عرضها؛ أعرض ⇒ بلا تصغير */
  {
    const { w, d, T } = mkWin('light', AUTH_BODY);
    const box = d.getElementById('ts-login'); let width = 254;
    Object.defineProperty(box, 'clientWidth', { get: () => width, configurable: true });
    w.eval(H['auth.html']); w.onSyDentTurnstileLoad();
    const inner = box.firstElementChild;
    ok(inner.style.transform === 'scale(0.8467)' && /^(top center|center top)$/.test(inner.style.transformOrigin), '(٣) 254px fields ⇒ box scaled to 254/300 from its centre, got «' + inner.style.transform + ' · ' + inner.style.transformOrigin + '»');
    ok(box.style.height === '56px' && box.style.minHeight === '56px', '(٣) the row height follows the scaled box');
    width = 324; w.dispatchEvent(new w.Event('resize'));
    ok(inner.style.transform === '' && box.style.height === '' && box.style.minHeight === '', '(٣) wide fields ⇒ no scaling left behind');
    width = 214; w.dispatchEvent(new w.Event('resize'));
    ok(inner.style.transform === 'scale(0.7133)', '(٣) a rotation/resize refits the box');
    d.documentElement.setAttribute('data-theme', 'dark'); await tick(5);
    ok(box.children.length === 1 && box.firstElementChild !== inner && box.firstElementChild.style.transform === 'scale(0.7133)', '(٣) a redrawn box is fitted again');
    width = 0; w.dispatchEvent(new w.Event('resize'));
    ok(box.firstElementChild.style.transform === '', '(٣) a hidden container (width 0) is left unscaled');
  }

  /* (٣) CSS: المربع بعرض الحقول */
  PAGES.forEach(f => ok(/\.cf-turnstile-box\s*>\s*div\s*\{\s*flex:\s*1 1 100%;\s*min-width:\s*300px;?\s*\}/.test(F[f]), '(٣) ' + f + ': the box stretches to the field width'));
  PAGES.forEach(f => ok(!/theme:\s*'auto'/.test(H[f]), '(١) ' + f + ': no «auto» theme'));

  /* (٥) حذف الحساب ينتظر التوكن */
  const DEL = [
    { f: 'settings.html', head: 'async function confirmDelete() {', call: 'confirmDelete()', phrase: 'fDeleteConfirm', pw: 'fDeletePass', btn: 'btnConfirmDelete', pre: '' },
    { f: 'subscription.html', head: 'window.subConfirmDelete = async function () {', call: 'window.subConfirmDelete()', phrase: 'subDelPhrase', pw: 'subDelPass', btn: 'subDelBtn', pre: '' }
  ];
  for (const D of DEL) {
    const code = block(F[D.f], D.head);
    ok(!!code, '(٥) ' + D.f + ': delete handler found');
    if (!code) continue;
    const mk = () => {
      const { w, d, T } = mkWin('light', '<input id="' + D.phrase + '" value="حذف حسابي"><input id="' + D.pw + '" value="pw"><button id="' + D.btn + '">حذف نهائياً</button><div id="ts-delete" class="cf-turnstile-box"></div>');
      w.eval(H[D.f]); w.onSyDentTurnstileLoad();
      const wait = w.waitTurnstileToken; w.waitTurnstileToken = n => wait(n, 60);
      const S = { runs: [], toasts: [] };
      w.showToast = w.toast = (m, e) => S.toasts.push(m);
      w.SyDentAccountDelete = { run: o => { S.runs.push(o); return Promise.resolve({ ok: false, message: 'كلمة المرور غير صحيحة' }); } };
      w.eval(code);
      return { w, d, T, S };
    };
    {
      const { w, d, T, S } = mk();
      ok(T.renders.length === 0, '(٥) ' + D.f + ': no box before the modal opens');
      w.requestTurnstile('delete', 'ts-delete');
      ok(last(T) && last(T).o.theme === 'light' && last(T).o.size === 'flexible' && last(T).o.language === 'ar', '(٥) ' + D.f + ': delete box uses the shared options');
      const p = w.eval(D.call); await tick(10);
      ok(S.runs.length === 0 && d.getElementById(D.btn).textContent === 'جارٍ التحقق…' && d.getElementById(D.btn).disabled, '(٥) ' + D.f + ': a fast press waits for the check');
      T.solve(last(T).id, 'TOK-DEL'); await p;
      ok(S.runs.length === 1 && S.runs[0].captchaToken === 'TOK-DEL' && S.runs[0].password === 'pw', '(٥) ' + D.f + ': then sends the real token once');
      ok(T.resets.length === 1 && !d.getElementById(D.btn).disabled && d.getElementById(D.btn).textContent === 'حذف نهائياً', '(٥) ' + D.f + ': a refused attempt refreshes the box and frees the button');
    }
    {
      const { w, d, T, S } = mk();
      w.requestTurnstile('delete', 'ts-delete');
      await w.eval(D.call);
      ok(S.runs.length === 0, '(٥) ' + D.f + ': nothing is sent without a token');
      ok(S.toasts.length === 1 && S.toasts[0] === '❌ ' + w.TS_PENDING_MSG, '(٥) ' + D.f + ': the person is told to finish the check');
      ok(!d.getElementById(D.btn).disabled && d.getElementById(D.btn).textContent === 'حذف نهائياً' && T.resets.length === 0, '(٥) ' + D.f + ': button is freed and the running check is left alone');
    }
  }
}

const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const all3 = (a, b) => F0 => { const F = Object.assign({}, F0); PAGES.forEach(f => { F[f] = F[f].split(a).join(b); }); return F; };
const MUTANTS = [
  ['theme back to auto', all3("theme: th, size: 'flexible'", "theme: 'auto', size: 'flexible'")],
  ['fixed-width box', all3("theme: th, size: 'flexible', action", 'theme: th, action')],
  ['theme switch ignored', all3('new MutationObserver(redraw)', 'new MutationObserver(function(){})')],
  ['redraw keeps the stale token', all3("delete widgets[n]; tokens[n] = ''; errs[n] = ''; retries[n] = 0;", 'delete widgets[n];')],
  ['hidden box redrawn', all3('if (shown(el)) render(n, wanted[n]);', 'render(n, wanted[n]);')],
  ['same theme redraws', all3('if (id === undefined || themes[n] === th) return;', 'if (id === undefined) return;')],
  ['old box left in place', all3('try { window.turnstile.remove(id); } catch(e){}', '')],
  ['login tab never redrawn', rep('auth.html', "requestTurnstile(which === 'register' ? 'register' : 'login', which === 'register' ? 'ts-register' : 'ts-login')", "if (which === 'register') requestTurnstile('register', 'ts-register')")],
  ['subscription helper drifts', rep('subscription.html', "'retry-interval': 1500", "'retry-interval': 1600")],
  ['auth helper drifts', rep('auth.html', "'retry-interval': 1500", "'retry-interval': 1600")],
  ['narrow phones: box not fitted', all3("box.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : '';", '')],
  ['row height ignores the scale', all3('el.style.height = h; el.style.minHeight = h;', '')],
  ['no refit on resize', all3("window.addEventListener('resize', function(){ Object.keys(widgets).forEach(fit); });", '')],
  ['redrawn box not fitted', all3("    fit(name);\n    setTimeout(function(){ fit(name); }, 400);", '    if (!fitted[el.id]) fit(name);')],
  ['auth box not stretched', rep('auth.html', '.cf-turnstile-box>div{flex:1 1 100%;min-width:300px}', '')],
  ['settings: no wait', rep('settings.html', "const delCaptcha = await waitTurnstileToken('delete');", "const delCaptcha = getTurnstileToken('delete');")],
  ['settings: empty token sent', rep('settings.html', "  if (!delCaptcha) {\n    btn.disabled = false; btn.textContent = 'حذف نهائياً';\n    showToast('❌ ' + tsPendingMsg('delete'), true);\n    return;\n  }\n", '')],
  ['subscription: no wait', rep('subscription.html', "var delCaptcha = await waitTurnstileToken('delete');", "var delCaptcha = getTurnstileToken('delete');")],
  ['subscription: empty token sent', rep('subscription.html', "    if (!delCaptcha) {\n      btn.disabled = false; btn.textContent = 'حذف نهائياً';\n      toast('❌ ' + tsPendingMsg('delete'), true);\n      return;\n    }\n", '')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-turnstile: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-turnstile: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
