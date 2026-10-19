/* v652 (+v653) — مثبتُ فتح واتساب بالتطبيق مباشرةً على الحاسوب (SyDentWA · supabase-init.js) — طلبُ المالك 19/10/2026:
   «بس اضغط ارسال يفتح التطبيق عالكمبيوتر مباشر من غير ما يفتح المتصفح قبل».
   (١) التحويل: wa.me/<رقم>?text= ⇒ whatsapp://send?phone=&text= (رقمٌ وحده · نصٌّ وحده · غيرُ wa.me ⇒ لا شيء).
   (٢) الكشف: ويندوز/ماك/لينكس حاسوب · أندرويد/آيفون/آيباد (حتى المتنكّر بـMacintosh مع لمس) جوال.
   (٣) السلوك (vm على الكتلة الحيّة بنافذةٍ وساعةٍ مزيّفتين): الجوالُ wa.me بتبويب كما كان · الحاسوبُ المخطّطُ بالتبويب الحالي ·
       غادر التركيزُ ⇒ لا احتياط · لم يغادر ⇒ wa.me بتبويبٍ بعد المهلة · نافذةٌ مسبقة (المخبر) تُوجَّه وتُغلق أو تُوجَّه احتياطاً.
   (٤) الروابط: مستمعٌ واحد بمرحلة الالتقاط يلتقط <a href="https://wa.me/…"> على الحاسوب فقط؛ Ctrl/⌘/Shift/الأوسط تُترك.
   (٥) الجرد (#درس 20/9 — كلُّ أشكال التوصيل): كلُّ window.open يسبقه wa.me بملفات العيادة يمرّ بـSyDentWA.open، عدا الفتح الجماعي
       بالأدمن (مسبَّب)؛ وكلُّ صفحةٍ تحمل wa.me تحمّل supabase-init.js؛ والصفحاتُ العامة لا تلمسه (#735).
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const base = { 'supabase-init.js': read('supabase-init.js') };
const PUBLIC = ['book.html', 'intake.html', 'portal.html', 'landing.html', 'privacy.html'];
const blockOf = s => { const a = s.indexOf('/* ═══════════════ SyDentWA'); return a < 0 ? '' : s.slice(a); };

function harness(S, ua, touch) {
  let now = 0; const timers = []; let tid = 0;
  const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; now = t.at; timers.shift(); t.fn(); } now = end; };
  const winL = {}, docL = {};
  const opened = [];
  const win = { location: { href: 'https://sydent.app/x.html' }, addEventListener: (e, f) => { (winL[e] = winL[e] || []).push(f); },
    removeEventListener: (e, f) => { winL[e] = (winL[e] || []).filter(x => x !== f); }, open: (u, t, feat) => { opened.push([u, t, feat]); return null; } };
  const doc = { addEventListener: (e, f, cap) => { (docL[e] = docL[e] || []).push({ f, cap }); }, removeEventListener: (e, f) => { docL[e] = (docL[e] || []).filter(x => x.f !== f); } };
  const ctx = { window: win, document: doc, navigator: { userAgent: ua, maxTouchPoints: touch || 0 }, setTimeout: (f, ms) => { const id = ++tid; timers.push({ id, at: now + ms, fn: f }); return id; }, String, RegExp, console };
  vm.createContext(ctx); vm.runInContext(blockOf(S), ctx);
  const blur = () => (winL.blur || []).forEach(f => f());
  const click = ev => { ev = Object.assign({ button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, ev); (docL.click || []).forEach(x => x.f(ev)); return ev; };
  return { W: win.SyDentWA, win, opened, advance, blur, click, docL, winL };
}
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
/* v653: النافذةُ المسبقة (about:blank نفسُ الأصل) بمستمعاتها — لتُحاكى مغادرةُ التركيز منها هي */
function mkPre() {
  const L = {}, D = {};
  const add = M => (e, f) => { (M[e] = M[e] || []).push(f); }, rem = M => (e, f) => { M[e] = (M[e] || []).filter(x => x !== f); };
  return { location: { href: 'about:blank' }, closed: false, close() { this.closed = true; }, L, D,
    addEventListener: add(L), removeEventListener: rem(L), document: { addEventListener: add(D), removeEventListener: rem(D) },
    blur() { (L.blur || []).forEach(f => f()); } };
}
const URL1 = 'https://wa.me/963944123456?text=' + encodeURIComponent('مرحباً أحمد،\nموعدك غداً 🦷 & تذكير');

function suite(F) {
  const S = F['supabase-init.js'];
  ok(blockOf(S).length > 0, 'SyDentWA block exists in supabase-init.js');
  const h = harness(S, WIN), W = h.W;
  /* (١) التحويل */
  ok(W.toScheme(URL1) === 'whatsapp://send?phone=963944123456&text=' + encodeURIComponent('مرحباً أحمد،\nموعدك غداً 🦷 & تذكير'), '(١) phone + text ⇒ whatsapp://send?phone=&text= (text kept percent-encoded)');
  ok(W.toScheme('https://wa.me/963944123456') === 'whatsapp://send?phone=963944123456', '(١) phone only');
  ok(W.toScheme('https://wa.me/?text=abc%20d') === 'whatsapp://send?text=abc%20d', '(١) text only (no phone ⇒ picker)');
  ok(W.toScheme('https://sydent.app/book.html') === '' && W.toScheme('') === '' && W.toScheme(null) === '', '(١) non-wa.me ⇒ empty');
  /* (٢) الكشف */
  ok(harness(S, WIN).W.isDesktop() === true && harness(S, MAC).W.isDesktop() === true, '(٢) Windows / Mac ⇒ desktop');
  ok(harness(S, AND).W.isDesktop() === false && harness(S, IOS).W.isDesktop() === false, '(٢) Android / iPhone ⇒ mobile');
  ok(harness(S, MAC, 5).W.isDesktop() === false, '(٢) iPadOS posing as Macintosh with touch ⇒ mobile');
  /* (٣) السلوك — الجوال */
  const m = harness(S, AND); m.W.open(URL1); m.advance(5000);
  ok(m.opened.length === 1 && m.opened[0][0] === URL1 && m.opened[0][1] === '_blank' && m.opened[0][2] === 'noopener' && m.win.location.href.indexOf('whatsapp://') < 0, '(٣) mobile ⇒ wa.me in a new tab, current tab untouched');
  const mp = harness(S, IOS); const pre1 = { location: { href: 'about:blank' }, closed: false, close() { this.closed = true; } }; mp.W.open(URL1, pre1); mp.advance(5000);
  ok(pre1.location.href === URL1 && mp.opened.length === 0 && !pre1.closed, '(٣) mobile with a pre-opened window ⇒ that window is pointed at wa.me');
  /* (٣) الحاسوب — التطبيقُ موجود (التركيزُ يغادر) */
  const d1 = harness(S, WIN); d1.W.open(URL1);
  ok(d1.win.location.href === d1.W.toScheme(URL1), '(٣) desktop ⇒ current tab navigates to whatsapp://send (no intermediate page)');
  ok(d1.opened.length === 0, '(٣) desktop ⇒ no tab opened synchronously');
  d1.advance(300); d1.blur(); d1.advance(5000);
  ok(d1.opened.length === 0, '(٣) focus left (app opened / browser prompt) ⇒ no fallback tab');
  ok((d1.winL.blur || []).length === 0 && (d1.docL.visibilitychange || []).length === 0, '(٣) leave-listeners removed after the window');
  /* (٣) الحاسوب — لا تطبيق (لا مغادرة) */
  const d2 = harness(S, WIN); d2.W.open(URL1); d2.advance(W._consts.FALLBACK_MS - 1);
  ok(d2.opened.length === 0, '(٣) no fallback before the window closes');
  d2.advance(2);
  ok(d2.opened.length === 1 && d2.opened[0][0] === URL1 && d2.opened[0][2] === 'noopener', '(٣) focus stayed ⇒ wa.me fallback in a new tab exactly once');
  d2.advance(10000); ok(d2.opened.length === 1, '(٣) fallback fires once');
  ok(W._consts.FALLBACK_MS >= 1200 && W._consts.FALLBACK_MS <= 3000, '(٣) fallback window inside the 5 s user-activation budget, long enough for the OS launch');
  /* (٣) الحاسوب — نافذةٌ مسبقة (المخبر) */
  const d3 = harness(S, WIN); const pre3 = mkPre(); d3.W.open(URL1, pre3);
  ok(pre3.location.href === d3.W.toScheme(URL1) && d3.win.location.href.indexOf('whatsapp://') < 0, '(٣) pre-opened window carries the scheme; current tab untouched');
  /* v653 — التسلسلُ الحقيقي: الصفحةُ الأصلية فقدت التركيزَ عند فتح النافذة المسبقة (قبل النداء)، فالتطبيقُ يأخذه من النافذة المسبقة وحدها */
  d3.advance(400); pre3.blur(); d3.advance(5000);
  ok(pre3.closed === true && d3.opened.length === 0 && pre3.location.href.indexOf('wa.me') < 0, '(٣) app took focus from the pre-opened window ⇒ closed, no wa.me fallback (no double open)');
  ok((pre3.L.blur || []).length === 0 && (pre3.D.visibilitychange || []).length === 0, '(٣) pre-window leave-listeners removed');
  const d3b = harness(S, WIN); const pre3b = mkPre(); d3b.W.open(URL1, pre3b); d3b.blur(); d3b.advance(5000);
  ok(pre3b.closed === true && d3b.opened.length === 0, '(٣) focus leaving the main window still counts');
  const d3c = harness(S, WIN); const pre3c = mkPre(); d3c.W.open(URL1, pre3c); pre3c.close(); d3c.advance(5000);
  ok(pre3c.location.href === d3c.W.toScheme(URL1) && d3c.opened.length === 0, '(٣) pre-opened window closed by the user ⇒ nothing reopened');
  const d4 = harness(S, WIN); const pre4 = mkPre(); d4.W.open(URL1, pre4); d4.advance(5000);
  ok(pre4.location.href === URL1 && !pre4.closed && d4.opened.length === 0, '(٣) pre-opened window falls back to wa.me itself — never a second tab');
  /* (٣) الصلابة */
  const d5 = harness(S, WIN); d5.W.open('https://sydent.app/portal.html?t=1');
  ok(d5.opened.length === 1 && d5.opened[0][0] === 'https://sydent.app/portal.html?t=1' && d5.win.location.href.indexOf('whatsapp') < 0, '(٣) a non-wa.me URL is just opened in a tab (no scheme guess)');
  /* (٤) الروابط */
  const c1 = harness(S, WIN); const a1 = { getAttribute: () => URL1 };
  const ev1 = c1.click({ target: { closest: sel => sel === 'a[href^="https://wa.me/"]' ? a1 : null } });
  ok(ev1.defaultPrevented && c1.win.location.href === c1.W.toScheme(URL1), '(٤) desktop click on a wa.me anchor ⇒ prevented and routed to the app');
  ok((c1.docL.click || []).length === 1 && c1.docL.click[0].cap === true, '(٤) one document listener, capture phase (runs before inline stopPropagation)');
  const c2 = harness(S, WIN); const ev2 = c2.click({ target: { closest: () => a1 }, ctrlKey: true });
  ok(!ev2.defaultPrevented && c2.win.location.href.indexOf('whatsapp') < 0, '(٤) Ctrl-click left to the browser');
  const c2b = harness(S, WIN); const ev2b = c2b.click({ target: { closest: () => a1 }, button: 1 });
  ok(!ev2b.defaultPrevented, '(٤) middle-click left to the browser');
  const c3 = harness(S, WIN); const ev3 = c3.click({ target: { closest: () => null } });
  ok(!ev3.defaultPrevented && c3.win.location.href.indexOf('whatsapp') < 0, '(٤) other anchors untouched');
  const c4 = harness(S, AND); const ev4 = c4.click({ target: { closest: () => a1 } });
  ok(!ev4.defaultPrevented && c4.win.location.href.indexOf('whatsapp') < 0, '(٤) mobile: anchors keep the native wa.me navigation');
  /* (٥) الجرد */
  const files = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && f !== 'supabase-init.js' && f !== 'sw.js');
  const legacy = [], noInit = [];
  for (const f of files) {
    const s = read(f); if (!/wa\.me/.test(s)) continue;
    if (PUBLIC.indexOf(f) > -1) { ok(!/SyDentWA/.test(s), '(٥) public page ' + f + ' does not touch SyDentWA (#735)'); continue; }
    if (/\.html$/.test(f) && !/<script src="supabase-init\.js/.test(s)) noInit.push(f);
    const lines = s.split('\n');
    lines.forEach((ln, i) => {
      if (!/window\.open\(/.test(ln)) return;
      const back = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
      if (!/wa\.me|waUrl\(|waReminderLink|waWelcomeLink|waSuspendedLink|waRenewedLink/.test(back)) return;
      if (f === 'admin-render.js' && /bkOpenWaTabs|MAX_TABS/.test(lines.slice(Math.max(0, i - 40), i).join('\n'))) return;   /* الفتحُ الجماعي — مسبَّب */
      legacy.push(f + ':' + (i + 1));
    });
  }
  ok(legacy.length === 0, '(٥) every wa.me opener in clinic files goes through SyDentWA.open — legacy: ' + legacy.join(', '));
  ok(noInit.length === 0, '(٥) every clinic page with wa.me loads supabase-init.js — missing: ' + noInit.join(', '));
  const cnt = files.reduce((n, f) => n + (read(f).match(/SyDentWA\.open\(/g) || []).length, 0);
  ok(cnt >= 17, '(٥) SyDentWA.open wired at the known call sites (' + cnt + ' ≥ 17)');
  ok(/if \(w\) w\.close\(\);/.test(read('pp-clinical.js')) && /if \(w\) w\.close\(\);/.test(read('labs.html')), '(٥) lab save-and-send still closes the pre-opened window when the save failed');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['no blur tracking ⇒ fallback even when the app opened', rep('supabase-init.js', "      window[m]('blur', onLeave); document[m]('visibilitychange', onLeave);\n", "      document[m]('visibilitychange', onLeave);\n")],
  ['fallback never fires', rep('supabase-init.js', '      window.open(url, \'_blank\', \'noopener\');\n    }, FALLBACK_MS);', '    }, FALLBACK_MS);')],
  ['desktop opens a tab instead of the scheme', rep('supabase-init.js', 'try { if (tab) tab.location.href = scheme; else window.location.href = scheme; } catch (e) {}', 'window.open(scheme, \'_blank\', \'noopener\');')],
  ['scheme without the phone', rep('supabase-init.js', "    if (m[1]) q.push('phone=' + m[1]);\n", '')],
  ['mobile treated as desktop', rep('supabase-init.js', "    if (/Android|iPhone|iPad|iPod|IEMobile|Windows Phone|Mobile/i.test(ua)) return false;\n", '')],
  ['iPadOS treated as desktop', rep('supabase-init.js', '    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false;', '')],
  ['pre-opened window left open after success', rep('supabase-init.js', "      if (left) { if (tab) { try { tab.close(); } catch (e) {} } return; }", '      if (left) return;')],
  ['anchor listener in bubble phase', rep('supabase-init.js', "      open(a.getAttribute('href'));\n    }, true);", "      open(a.getAttribute('href'));\n    }, false);")],
  ['Ctrl-click hijacked', rep('supabase-init.js', ' || e.ctrlKey || e.metaKey', '')],
  ['fallback window too short', rep('supabase-init.js', 'var FALLBACK_MS = 1600;', 'var FALLBACK_MS = 300;')],
  ['pre-opened window not watched (double open on the lab path)', rep('supabase-init.js', "      if (tab) { try { tab[m]('blur', onLeave); } catch (e) {} try { tab.document[m]('visibilitychange', onLeave); } catch (e) {} }\n", '')],
  ['user-closed pre window reopened', rep('supabase-init.js', '      if (tab && tab.closed) return;   /* أغلقها المستخدم بنفسه ⇒ لا شيء */\n', '')],
  ['listeners never removed', rep('supabase-init.js', "      track('removeEventListener');\n", '')]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-wa-desktop: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-wa-desktop: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
