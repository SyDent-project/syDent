/* SyDent — prove-read-retry.js: قراءةٌ علقت بلا ردّ وبلا نسخةٍ بالكاش تُعاد على اتصالٍ جديد (بلاغ المالك 28/11/2026:
   صفحةُ المواعيد تفتح «شهر» فارغاً حتى يُعاد تحميلها). يشغّل networkFirst «الحية» (من supabase-init.js) داخل vm
   بمؤقّتاتٍ افتراضية وشبكةٍ مكتوبة السيناريو:
   (١) ردٌّ سريع ⇒ طلبٌ واحد فقط؛ (٢) الأول معلَّق ⇒ طلبٌ ثانٍ عند 10 ث وردُّه يُعاد؛ (٣) الاثنان معلَّقان ⇒ ثالثٌ عند 25 ث؛
   (٤) نسخةٌ بالكاش ⇒ تُخدَم عند 6 ث كما كانت (الإنقاذ قبل الإعادة)؛ (٥) بلا اتصال معروف ⇒ لا إعادة؛
   (٦) فشلُ الإعادة لا يُسقط الطلبَ الأول؛ (٧) رفضُ الشبكة يمرّ كما كان (كاش ثم رمي).
   --self-test: طفراتٌ لا بدّ أن تحمرّ. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const LIVE = fs.readFileSync(path.join(__dirname, '..', 'supabase-init.js'), 'utf8');
function build(src) {
  const c = /var NET_RESCUE_MS = (\d+);/.exec(src), r = /var NET_RETRY_AT_MS = (\[[^\]]*\]);/.exec(src);
  const i = src.indexOf('    function networkFirst() {'), j = src.indexOf('\n    }\n  }\n', i);
  if (!c || i < 0 || j < 0) throw new Error('anchors');
  return { rescue: c[1], retry: r ? r[1] : '[]', fn: src.slice(i, j + 6) };
}
async function scenario(src, opt) {
  const B = build(src);
  const timers = []; let now = 0, calls = 0;
  const ctx = { Promise, console, window: { navigator: { onLine: opt.offline ? false : true } },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    staleBarShow() {}, doNetwork: () => { const n = calls++; return opt.net(n); },
    fromCache: () => Promise.resolve(opt.cache || null) };
  vm.createContext(ctx);
  vm.runInContext('var NET_RESCUE_MS = ' + B.rescue + ', NET_RETRY_AT_MS = ' + B.retry + ';\n' + B.fn + '\nthis.go = networkFirst;', ctx);
  let out = { state: 'pending' };
  ctx.go().then(v => { out = { state: 'ok', v }; }, e => { out = { state: 'err', e }; });
  const flush = async () => { for (let k = 0; k < 20; k++) await new Promise(r => setImmediate(r)); };
  const marks = {};
  for (const t of [0, 5999, 6000, 9999, 10000, 24999, 25000, 60000]) {
    now = t; timers.filter(x => !x.done && x.at <= now).sort((a, b) => a.at - b.at).forEach(x => { x.done = true; x.fn(); });
    await flush(); marks[t] = { state: out.state, v: out.v, calls };
  }
  return marks;
}
const never = () => new Promise(() => {});
async function runAll(src) {
  const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
  let m = await scenario(src, { net: () => Promise.resolve('R0') });
  ok(m[0].state === 'ok' && m[0].v === 'R0' && m[60000].calls === 1, '(١) a fast answer ⇒ exactly one request, ever');
  m = await scenario(src, { net: n => n === 0 ? never() : Promise.resolve('R' + n) });
  ok(m[9999].state === 'pending' && m[9999].calls === 1 && m[10000].state === 'ok' && m[10000].v === 'R1' && m[60000].calls === 2, '(٢) a stalled read is retried at 10s on a fresh request and its answer returned; no third request after success');
  m = await scenario(src, { net: n => n < 2 ? never() : Promise.resolve('R' + n) });
  ok(m[24999].state === 'pending' && m[24999].calls === 2 && m[25000].state === 'ok' && m[25000].v === 'R2', '(٣) both stalled ⇒ a third attempt at 25s');
  m = await scenario(src, { net: () => never(), cache: 'CACHED' });
  ok(m[5999].state === 'pending' && m[6000].state === 'ok' && m[6000].v === 'CACHED', '(٤) a cached copy is still served at 6s (rescue before retry)');
  m = await scenario(src, { net: () => never(), offline: true });
  ok(m[60000].calls === 1, '(٥) known offline ⇒ no retry requests');
  m = await scenario(src, { net: n => n === 0 ? new Promise(r => setTimeout(() => r('LATE'), 0)) && never() : Promise.reject(new TypeError('x')) });
  ok(m[60000].state === 'pending', '(٦) a failed retry never rejects the read (the first request still decides)');
  m = await scenario(src, { net: () => Promise.reject(new TypeError('Failed to fetch')) });
  ok(m[0].state === 'err', '(٧) a network refusal with no cache still rejects at once, as before');
  m = await scenario(src, { net: () => Promise.reject(new TypeError('Failed to fetch')), cache: 'CACHED' });
  ok(m[0].state === 'ok' && m[0].v === 'CACHED', '(٧) a network refusal falls back to the cache, as before');
  return fails;
}
const MUT = [
  ['no retry at all', s => s.replace('return Promise.race([netBranch, rescueBranch].concat(retryBranches));', 'return Promise.race([netBranch, rescueBranch]);')],
  ['retry even after an answer', s => s.replace("if (netDone || (window.navigator && window.navigator.onLine === false)) return never;", "if (window.navigator && window.navigator.onLine === false) return never;")],
  ['retry while offline', s => s.replace("if (netDone || (window.navigator && window.navigator.onLine === false)) return never;", "if (netDone) return never;")],
  ['failed retry rejects the read', s => s.replace("function (res) { netDone = true; return res; }, function () { return never; });\n      });", "function (res) { netDone = true; return res; });\n      });")],
  ['single retry only', s => s.replace('var NET_RETRY_AT_MS = [10000, 25000];', 'var NET_RETRY_AT_MS = [10000];')],
  ['retry before the cache rescue', s => s.replace('var NET_RETRY_AT_MS = [10000, 25000];', 'var NET_RETRY_AT_MS = [3000, 25000];')]
];
(async () => {
  const f = await runAll(LIVE);
  if (f.length) { console.log('❌ prove-read-retry: ' + f.length + ' فشل'); f.forEach(x => console.log('   ✗ ' + x)); process.exit(1); }
  if (process.argv.includes('--self-test')) {
    for (const [name, mut] of MUT) {
      const m = mut(LIVE);
      if (m === LIVE) { console.log('❌ طفرة لم تُطبَّق: ' + name); process.exit(1); }
      let r; try { r = await runAll(m); } catch (e) { r = ['threw']; }
      if (!r.length) { console.log('❌ طفرة لم تعضّ: ' + name); process.exit(1); }
    }
    console.log('✅ prove-read-retry: 8/8 · mutants ' + MUT.length + '/' + MUT.length);
  } else console.log('✅ prove-read-retry: 8/8');
  process.exit(0);
})();
