/* v619 — مثبتُ الصفحات العامة على الموبايل (book.html · portal.html · intake.html) — بلاغ المالك: «99٪ من الموبايل».
   (١) مرآةٌ بايت-بايت بين الثلاث: سكربتُ الرأس (Sentry غيرُ حاجب + مسحُ التوكن + withTimeout) وكتلةُ CSS الموبايل
       (الهوامشُ الآمنة · لا تكبيرَ بكلمةٍ طويلة · حقولٌ 16px ضدّ تكبير آيفون — tel ضمناً).
   (٢) الشبكة: كلُّ نداء RPC بكل صفحة بمهلة، وكلٌّ محروسٌ بغياب المكتبة؛ فشلُ الإقلاع شاشةُ «إعادة المحاولة» لا «غير متاح».
   (٣) الحجز: أهدافُ لمسٍ ≥44px (الأسهم · الأيام · الأوقات) · زرٌّ 48 · ملاحظةُ «الاتصال بطيء».
   (٤) الحجز — ساعةُ العيادة دمشق (vm بمنطقة نيويورك ولحظةٍ مثبّتة): «اليوم» وأوقاتُه الماضية بتوقيت دمشق لا الهاتف،
       ومدى الأيام آمنٌ من تغيير التوقيت الصيفي.
   (٥–٧) v620 الاستمارة: التوقيعُ بنسب اللوحة (vm) · العودةُ للبوابة من رابطها فقط · أهدافُ لمس 44 · تباينُ الوضعين · زرُّ واتساب بلونٍ مقروء بالصفحات الثلاث.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
process.env.TZ = 'America/New_York';   /* a phone abroad — must be set before any Date use */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function slice(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
const headJs = f => { const a = f.indexOf('<script>\n/* ── v618 mobile/network'); return a < 0 ? '' : f.slice(a, f.indexOf('</script>', a)); };
const mobCss = f => { const a = f.indexOf('/* ── v618: mobile'); return a < 0 ? '' : f.slice(a, f.indexOf('/* ── /v618 ── */', a)); };

function suite(S) {
  const pages = { 'book.html': S.book, 'portal.html': S.portal, 'intake.html': S.intake };
  const names = Object.keys(pages);
  /* (١) */
  ok(names.every(n => headJs(pages[n]).length > 400) && new Set(names.map(n => headJs(pages[n]))).size === 1, 'mirror: the head script is byte-identical on all three public pages');
  ok(names.every(n => mobCss(pages[n]).length > 300) && new Set(names.map(n => mobCss(pages[n]))).size === 1, 'mirror: the mobile CSS block is byte-identical on all three public pages');
  ok(names.every(n => /<script src="https:\/\/js-de\.sentry-cdn\.com\/[0-9a-f]+\.min\.js" crossorigin="anonymous" async><\/script>/.test(pages[n]) && pages[n].indexOf('window.sentryOnLoad') < pages[n].indexOf('js-de.sentry-cdn.com') && (pages[n].match(/js-de\.sentry-cdn\.com\/[0-9a-f]+\.min\.js/g) || []).length === 1), 'sentry: one async loader per page, init defined before it (a blocked CDN cannot hold the page)');
  const H = headJs(S.book);
  ok(/replace\(\/\[0-9a-fA-F\]\{64\}\/g, '\[token\]'\)/.test(H) && /beforeSend: function\(ev\)\{ return scrub\(ev\); \}, beforeBreadcrumb: function\(b\)\{ return scrub\(b\); \}/.test(H) && /replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0/.test(H) && /sendDefaultPii: false/.test(H), 'sentry: tokens scrubbed from events and breadcrumbs, no replay, no default PII');
  const M = mobCss(S.book);
  ok(/padding-top:calc\(16px \+ env\(safe-area-inset-top, 0px\)\)/.test(M) && /padding-bottom:calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(M) && /env\(safe-area-inset-left, 0px\)/.test(M) && /env\(safe-area-inset-right, 0px\)/.test(M), 'mobile: content clears the notch, the home bar and the floating Safari bar');
  ok(/input\[type=text\],input\[type=date\],input\[type=tel\],textarea\{font-size:16px;\}/.test(M) && /overflow-wrap:anywhere/.test(M) && /-webkit-text-size-adjust:100%/.test(M), 'mobile: fields 16px incl. tel (no iPhone focus-zoom) · long words wrap · text-size-adjust');
  ok(names.every(n => /viewport-fit=cover/.test(pages[n]) && mobCss(pages[n]).length > 0), 'mobile: every page that asks for viewport-fit=cover carries the safe-area padding');
  /* (٢) */
  names.forEach(n => {
    const f = pages[n];
    const calls = (f.match(/sb\.rpc\('[a-z_]+'/g) || []).length;
    const timed = (f.match(/withTimeout\(sb\.rpc\('[a-z_]+'/g) || []).length;
    const guards = (f.match(/if \(!sb\) throw new Error\('vendor'\);/g) || []).length;
    ok(calls >= 2 && calls === timed && guards === calls && /var sb = \(window\.supabase && window\.supabase\.createClient\) \?/.test(f), n + ': all ' + calls + ' RPC calls timed out and guarded against a missing vendor script');
  });
  ok(/onclick="location\.reload\(\)">إعادة المحاولة<\/button>/.test(S.book) && /clearTimeout\(slowT\);/.test(S.book) && /id="slowNote"/.test(S.book), 'book: a failed first load offers a retry (not «الحجز غير متاح») and a slow link says so');
  /* (٣) */
  ok(/\.cal-nav\{width:44px; height:44px;\}/.test(S.book) && /\.cal-cell\{height:44px;\}/.test(S.book) && /\.slot\{min-height:44px;/.test(S.book) && /\.btn\{min-height:48px;\}/.test(S.book), 'book: month arrows · day cells · time slots ≥44px, main button 48px');
  /* (٤) */
  const clinicAt = iso => {
    const FIXED = Date.parse(iso);
    class FDate extends Date { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }
    const c = { Date: FDate, Intl, Math, parseInt, isNaN, String, Number, Array,
      CLINIC: { work_days: '0,1,2,3,4,6', work_start: '09:00:00', work_end: '21:00:00', slot_minutes: 30, max_days_ahead: 30 }, BUSY: {} };
    vm.createContext(c);
    vm.runInContext(['pad2', 'dateKey', 'timeToMin', 'damNow', 'damToday', 'addDays', 'buildDays', 'buildSlots'].map(f => slice(S.book, f)).join('\n'), c);
    return c;
  };
  const ctx = clinicAt('2026-10-12T11:45:00Z');            /* 07:45 in New York · 14:45 in Damascus */
  const days = ctx.buildDays(), slots = ctx.buildSlots(days[0].key, days[0].offset);
  ok(days[0].key === '2026-10-12' && days[0].offset === 0, 'clock: «today» is the Damascus date');
  ok(slots.length && slots[0].min === 15 * 60 && slots.every(x => x.min > 14 * 60 + 45), 'clock: today offers only slots after 14:45 Damascus (the phone says 07:45) — first is 15:00');
  ok(days.every((d, i) => i === 0 || d.key > days[i - 1].key) && days[days.length - 1].key <= '2026-11-11' && new Set(days.map(d => d.key)).size === days.length, 'clock: the 30-day window crosses New York\'s DST change (1 Nov) with no duplicated or shifted day');
  const night = clinicAt('2026-10-12T23:30:00Z');         /* 19:30 Mon in New York · 02:30 Tue 13 in Damascus */
  const nd = night.buildDays(), ns = night.buildSlots(nd[0].key, nd[0].offset);
  ok(nd[0].key === '2026-10-13' && ns.length && ns[0].min === 9 * 60, 'clock: after midnight in Damascus «today» is already the 13th with a full morning (the phone still says Monday evening)');
  ok(!/new Date\(today\.getTime\(\) \+ i\*86400000\)/.test(S.book) && !/getHours\(\)\*60 \+ new Date\(\)\.getMinutes\(\)/.test(S.book), 'clock: no device-time «now» and no millisecond day arithmetic left in the booking page');
  /* (٥) v620 — الاستمارة: التوقيعُ بنسبه الحقيقية (vm بقماشٍ مزيّف يسجّل) */
  const drawn = [];
  const sctx = { Math, document: { createElement: () => { const o = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...a) => drawn.push([o.width, o.height].concat(a.slice(1))), set fillStyle(v) {} }), toDataURL: () => 'data:image/png;base64,AAAA' }; return o; } } };
  vm.createContext(sctx);
  vm.runInContext('var _sig = { c: { clientWidth: 328, clientHeight: 170 }, has: true };\n' + slice(S.intake, 'sigData'), sctx);
  const sd = sctx.sigData();
  ok(sd === 'data:image/png;base64,AAAA' && drawn.length === 1 && drawn[0][0] === 600 && drawn[0][1] === 311 && drawn[0][4] === 600 && drawn[0][5] === 311, 'intake: a 328×170 phone pad is saved 600×311 — the signature keeps its shape (was forced 600×200, 1.55× wide)');
  vm.runInContext('_sig = { c: { clientWidth: 1400, clientHeight: 170 }, has: true };', sctx); drawn.length = 0; sctx.sigData();
  ok(drawn[0][1] === 100, 'intake: a very wide pad is clamped at 100px tall (never 0)');
  /* (٦) v620 — العودةُ للبوابة: من رابط البوابة نفسه فقط */
  const back = ref => { const c = { URL, location: { origin: 'https://sydent.app' }, document: { referrer: ref } }; vm.createContext(c); vm.runInContext(slice(S.intake, 'portalBackBtn'), c); return c.portalBackBtn(); };
  const T = 'ab'.repeat(32);
  ok(/href="\/portal\?t=abab/.test(back('https://sydent.app/portal.html?t=' + T)) && /href="\/portal\?t=/.test(back('https://sydent.app/portal?t=' + T)), 'intake: arriving from the portal offers «العودة إلى صفحتي» (fresh load ⇒ «مستلمة ✓»)');
  ok(back('https://evil.example/portal.html?t=' + T) === '' && back('https://sydent.app/book.html?t=' + T) === '' && back('https://sydent.app/portal.html?t=zz') === '' && back('') === '' && back('https://sydent.app/portal.html?t=' + T + '"><script>') === '', 'intake: no back button from another site, another page, a bad token or an injected referrer');
  /* (٧) v620 — أهدافُ لمسٍ وتباين */
  ok(/min-height:44px;\n  font-family:inherit;\n\}/.test(S.intake) && /\.lnk\{[^}]*min-height:44px;/.test(S.intake) && /input\[type=date\]\{min-height:48px; display:block;\}/.test(S.intake), 'intake: chips 44px · «مسح التوقيع» 44px · the date field never collapses');
  ok(/color:var\(--btn-ink\); font-size:14px; font-weight:800; margin-inline-end:7px;/.test(S.intake) && /:root\[data-theme="dark"\] \.err\{color:var\(--red\);\}/.test(S.intake), 'intake: step numbers and the error box readable in dark mode');
  ok(['book', 'portal', 'intake'].every(k => /\.btn-wa\{background:#075E54;/.test(S[k]) && !/\.btn-wa\{background:#128C7E;/.test(S[k]) && !/#25D366;/.test(S[k].replace(/rgba\(37,211,102[^)]*\)/g, ''))), 'contrast: the WhatsApp button is WhatsApp teal on all three pages (white on #25D366 was 1.98:1)');
  ok(/\.btn-wa-sm\{background:rgba\(37,211,102,0\.14\); color:#166534;/.test(S.portal), 'contrast (v631): the portal\'s small WhatsApp button text is ≥4.5:1 on its tint in light mode');
  ok(/\.cal-cell\.sel\{[^}]*color:var\(--green2\);\}/.test(S.book) && /\.day-lbl\{color:var\(--green2\); font-weight:700; font-size:14px;\}/.test(S.book) && /min-height:44px; padding:8px 14px; font-size:14px;/.test(S.portal), 'contrast: booking selection on --green2, day label 14px bold, portal small buttons 14px bold');
  /* (٨) v622 — رقمُ الهاتف بلوحة مفاتيحٍ عربية: الصفحةُ تحوّل قبل التحقّق والإرسال، والخادمُ يحوّل قبل التجريد */
  const dctx = {}; vm.createContext(dctx); vm.runInContext(slice(S.book, 'toLatinDigits'), dctx);
  ok(dctx.toLatinDigits('٠٩٣٣١٢٣٤٥٦') === '0933123456' && dctx.toLatinDigits('۰۹۴۴۱۲۳۴۵۶') === '0944123456' && dctx.toLatinDigits('+٩٦٣ ٩٣٣') === '+963 933' && dctx.toLatinDigits(null) === '', 'book: Arabic-Indic and Persian digits become Latin');
  const sub = (() => { const i = S.book.indexOf('var phEl'); return S.book.slice(S.book.lastIndexOf('function(ev){', i), S.book.indexOf('withTimeout(sb.rpc(\'booking_create_request\'', i)); })();
  ok(/var phone = toLatinDigits\(\(phEl\.value \|\| ''\)\.trim\(\)\);/.test(sub) && sub.indexOf('toLatinDigits(') < sub.indexOf("phone.replace(/\\D/g,'').length < 8"), 'book: the phone is converted before it is validated and sent (an Arabic keyboard could not book)');
  ok(/translate\(COALESCE\(p_phone,''\), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'\)/.test(S.m184) && /'\[\^0-9\+\]', '', 'g'\);/.test(S.m184), 'server (M184): booking_create_request translates both digit sets before stripping');
}
const FILES = { book: 'book.html', portal: 'portal.html', intake: 'intake.html', m184: 'migrations/184_booking_arabic_digits.sql' };
const base = {}; Object.keys(FILES).forEach(k => { base[k] = read(FILES[k]); });
function run(S) { pass = 0; fail = 0; suite(S); return { pass, fail }; }
const main = run(base);
if (main.fail) { console.log('❌ prove-public-mobile: ' + main.fail + ' فشل'); process.exit(1); }
if (process.argv.includes('--self-test')) {
  const mutants = [
    ['Sentry blocking again on the booking page', 'book', 'crossorigin="anonymous" async></script>', 'crossorigin="anonymous"></script>'],
    ['head script drifts on one page', 'book', "replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,", "replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 0,"],
    ['tel field back to 15px (iPhone zoom)', 'intake', 'input[type=text],input[type=date],input[type=tel],textarea{font-size:16px;}', 'input[type=text],input[type=date],textarea{font-size:16px;}'],
    ['booking send without a timeout', 'book', "    var res = await withTimeout(sb.rpc('booking_create_request', {", "    var res = await (sb.rpc('booking_create_request', {"],
    ['busy-slot load without the vendor guard', 'book', "    if (!sb) throw new Error('vendor');\n    var res = await withTimeout(sb.rpc('booking_busy_slots'", "    var res = await withTimeout(sb.rpc('booking_busy_slots'"],
    ['slots by device time again', 'book', "if (offset === 0){ var dn = damNow(); nowMin = dn.getHours()*60 + dn.getMinutes(); }", "if (offset === 0){ var dn = new Date(); nowMin = dn.getHours()*60 + dn.getMinutes(); }"],
    ['«today» by device date again', 'book', "function damToday(){ var n = damNow(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }", "function damToday(){ var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }"],
    ['month arrows back to 36px', 'book', '.cal-nav{width:44px; height:44px;}', '.cal-nav{width:36px; height:36px;}'],
    ['init failure says «unavailable» again', 'book', 'onclick="location.reload()">إعادة المحاولة</button></div>', 'onclick="history.back()">رجوع</button></div>'],
    ['signature forced to 600×200 again', 'intake', "var H = Math.max(100, Math.min(400, Math.round(600 * ch / cw)));", "var H = 200;"],
    ['back link trusts any referrer', 'intake', "if (r.origin !== location.origin || !", "if (!"],
    ['chips back to 40px', 'intake', "min-height:44px;\n  font-family:inherit;", "min-height:40px;\n  font-family:inherit;"],
    ['WhatsApp button back to #25D366', 'book', '.btn-wa{background:#075E54;', '.btn-wa{background:#25D366;'],
    ['WhatsApp button back to the 4.1:1 teal (v631)', 'intake', '.btn-wa{background:#075E54;', '.btn-wa{background:#128C7E;'],
    ['portal small WhatsApp button back to 4.24:1 (v631)', 'portal', 'color:#166534;   /* v631', 'color:#15803d;   /* v631'],
    ['Arabic-keyboard phone rejected again', 'book', "  var phone = toLatinDigits((phEl.value || '').trim());", "  var phone = (phEl.value || '').trim();"],
    ['server strips Arabic digits again', 'm184', "translate(COALESCE(p_phone,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')", "COALESCE(p_phone,'')"],
    ['safe-area dropped', 'portal', 'padding-top:calc(16px + env(safe-area-inset-top, 0px));', 'padding-top:16px;']
  ];
  let bit = 0; const L = console.log; console.log = () => {};
  for (const [n, k, a, b] of mutants) {
    if (base[k].indexOf(a) < 0) { console.log = L; console.log('❌ طفرة لا تطابق المصدر: ' + n); process.exit(1); }
    let r; try { r = run(Object.assign({}, base, { [k]: base[k].replace(a, b) })); } catch (e) { r = { fail: 1 }; }
    if (r.fail) bit++; else { console.log = L; console.log('❌ طفرة لم تعضّ: ' + n); process.exit(1); }
  }
  console.log = L;
  console.log('✅ prove-public-mobile: ' + main.pass + '/' + main.pass + ' توكيداً · ' + bit + '/' + mutants.length + ' طفرة تعضّ');
} else console.log('✅ prove-public-mobile: ' + main.pass + '/' + main.pass + ' توكيداً');
