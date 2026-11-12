/* prove-i18n-render — النصوصُ التي يبنيها الكود وقت التشغيل تُترجَم كاملةً بالإنجليزية.
   prove-i18n يفحص النصَّ الثابت بملفات الصفحات وحده؛ ما تركّبه الوحدات (بطاقات · عدّادات · نِسَب) لا يراه.
   هنا تُشغَّل دالةُ الرسم الحقيقية للوحدة بكل حالاتها، ويُقطَّع ناتجُها إلى عُقد نصٍّ وسماتٍ كما يفعل المتصفح،
   وتمرّ كلُّ عقدةٍ بمحرّك SyI18n الحقيقي (theme.js + i18n-en.js):
   (١) لا يبقى حرفٌ عربي واحد بأي حالة — قطعةٌ واحدة مجهولة تُبقي السطرَ كلَّه عربياً بالمحرّك؛
   (٢) الأرقامُ نفسُها قبل الترجمة وبعدها (لا رقمَ يسقط ولا يُختلق ولا يتبدّل ترتيبه)؛
   (٣) صياغاتٌ مثبّتة لأسطر البطاقة (المفرد/الجمع · الوتيرة · العملة · السهم).
   الوحدات: dash-goal.js (بطاقة «الإنتاج مقابل الهدف»). وحدةٌ جديدة تُضاف لـMODULES بحالاتها.
   --self-test يشغّل طفرات يجب أن تُكشف كلها. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const AR = /[\u0600-\u06FF]/;
const ISO = /[\u2066-\u2069]/g;   // عوازلُ الاتجاه حول الأرقام — لا تُرى

/* المحرّك الحقيقي بالإنجليزية على index (الصفحةُ التي تحمل البطاقة) */
function engine(F) {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = {
    console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/index.html', reload() {} },
    document: {
      readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(),
      write() {}, querySelector: () => null, getElementById: () => null, addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} })
    },
    MutationObserver: function () { this.observe = () => {}; }
  };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const theme = F['theme.js'], start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(F['i18n-en.js'], ctx);
  vm.runInContext(theme.slice(start, end), ctx);
  return s => ctx.window.SyI18n.t(s);
}

/* عُقدُ النص والسماتُ المترجَمة كما يراها المتصفح بعد innerHTML */
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' };
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m]);
function nodes(html) {
  const out = [];
  html.split(/<[^>]*>/).forEach(t => { const v = decode(t); if (v.trim()) out.push(v); });
  for (const m of html.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) { const v = decode(m[1]); if (v.trim()) out.push(v); }
  return out;
}
/* ما يفعله textNode بالمحرّك: الناتجُ يحلّ محلَّ النص مع فراغَي الطرفين */
function shown(t, node) { const lead = node.match(/^\s*/)[0], trail = node.match(/\s*$/)[0]; return lead + t(node) + trail; }
/* «موعد واحد» و«موعدان» أرقامٌ مكتوبةٌ بالكلمة — تُعدّ 1 و2 قبل المقارنة */
const digits = s => (s.replace(ISO, '').replace(/موعد واحد/g, '1').replace(/موعدان/g, '2').match(/\d+(?:[.,]\d+)*/g) || []).join(' ');

/* ── dash-goal.js ── */
function goalModule(F) {
  const win = {};
  const ctx = { window: win, console: { warn() {} }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, JSON, isFinite };
  vm.createContext(ctx); vm.runInContext(F['dash-goal.js'], ctx);
  return win.SyDentGoal;
}
function goalStates() {
  const WD = { passed: 11, total: 26 };
  const L = (cur, o) => Object.assign({ cur, exact: 0, estimated: 0, scheduled: 0, apptsTotal: 0, apptsExact: 0, apptsEstimated: 0, apptsUnpriced: 0,
    monthlyGoal: null, dailyGoal: null, mtd: 0, paceGoal: null, workDays: WD }, o);
  const goalS = { monthlyGoal: 2000000, dailyGoal: 76923, paceGoal: 846154 }, goalU = { monthlyGoal: 3000, dailyGoal: 115.38, paceGoal: 1269.23 };
  const S = [];
  const add = (name, layers, extra, opts) => S.push({ name, res: Object.assign({ today: '2026-11-12', layers, apptsTotal: null, apptsUnpriced: 0, collected: null }, extra || {}), opts: opts || {} });
  /* صورةُ المالك حرفياً: عملتان بهدفين، بلا مواعيد مسعَّرة، دون الوتيرة، مقبوضٌ صفر */
  add('owner screenshot', [L('SYP', Object.assign({ mtd: 2500 }, goalS)), L('USD', goalU)], { apptsTotal: 0, collected: { SYP: 0, USD: 0 } }, { owner: true });
  /* أعدادُ المواعيد × مصدرُ القيمة، بعملةٍ واحدة وبعملتين */
  [1, 2, 3, 10, 11, 25].forEach(n => {
    [['exact', n, 0], ['estimated', 0, n], ['both', Math.ceil(n / 2), n]].forEach(([how, ex, es]) => {
      const sch = { scheduled: 150000, exact: ex ? 100000 : 0, estimated: es ? 50000 * (how === 'estimated' ? 3 : 1) : 0, apptsExact: ex, apptsEstimated: es };
      add('SYP ' + how + ' ×' + n, [L('SYP', Object.assign({ mtd: 900000 }, goalS, sch))], { apptsTotal: n, apptsUnpriced: n > 2 ? 2 : 0, collected: { SYP: 350000, USD: 0 } }, { owner: n % 2 === 0 });
      add('USD+SYP ' + how + ' ×' + n, [L('SYP', Object.assign({ mtd: 900000 }, goalS, sch)), L('USD', Object.assign({ mtd: 1500.5 }, goalU, { scheduled: 220, exact: 20, estimated: 200, apptsExact: ex, apptsEstimated: es }))],
        { apptsTotal: n + 1, apptsUnpriced: n === 3 ? 1 : 0, collected: { SYP: 0, USD: 120.5 } }, { owner: true });
    });
  });
  /* الوتيرة: عليها · دونها · بلغ الهدف */
  add('on pace', [L('SYP', Object.assign({}, goalS, { mtd: 900000, scheduled: 80000, exact: 80000, apptsExact: 2 }))], { apptsTotal: 2, collected: { SYP: 10, USD: 0 } });
  add('goal reached', [L('USD', Object.assign({}, goalU, { mtd: 3200, scheduled: 400, exact: 400, apptsExact: 4 }))], { apptsTotal: 4, collected: { SYP: 0, USD: 400 } });
  add('behind pace', [L('USD', Object.assign({}, goalU, { mtd: 10 }))], { apptsTotal: 0, collected: { SYP: 0, USD: 0 } });
  /* بلا هدف: «يوم عمل 11/26» ورابطُ «حدّد هدفاً» للمالك (بعملةٍ وبعملتين) ولغيره لا */
  add('no goal · owner', [L('SYP', { mtd: 500000, scheduled: 50000, estimated: 50000, apptsEstimated: 1 })], { apptsTotal: 1, collected: { SYP: 0, USD: 0 } }, { owner: true });
  add('no goal · staff', [L('SYP', { mtd: 500000 })], { apptsTotal: 3, apptsUnpriced: 3, collected: { SYP: 0, USD: 0 } }, { owner: false });
  add('no goal · two currencies · owner', [L('SYP', { mtd: 500000 }), L('USD', { mtd: 40 })], { apptsTotal: 12, apptsUnpriced: 5, collected: { SYP: 1, USD: 1 } }, { owner: true });
  /* بلا سطر المقبوض (الدفعاتُ لم تُقرأ) · عددُ المواعيد مجهول */
  add('no collected row', [L('SYP', Object.assign({ mtd: 1 }, goalS))], {}, { owner: true });
  add('collected, total unknown', [L('SYP', Object.assign({ mtd: 1 }, goalS))], { collected: { SYP: 5000, USD: 0 } });
  /* الحالةُ الفارغة: للمالك (مع الرابط) ولغيره */
  add('empty · owner', [], {}, { owner: true });
  add('empty · staff', [], {}, { owner: false });
  S.push({ name: 'null result', res: null, opts: { owner: true } });
  return S;
}

const MODULES = [
  { name: 'dash-goal', files: ['dash-goal.js'], render: F => { const G = goalModule(F); return goalStates().map(s => ({ name: s.name, html: G.render(s.res, s.opts) })); } }
];

function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  let t; try { t = engine(F); } catch (e) { ok(false, 'engine throws: ' + e.message); return out; }
  const byState = {};
  MODULES.forEach(M => {
    let states; try { states = M.render(F); } catch (e) { ok(false, M.name + ' render throws: ' + e.message); return; }
    let nNodes = 0; const left = [], nums = [];
    states.forEach(s => {
      const en = [];
      nodes(s.html).forEach(n => {
        nNodes++;
        const o = shown(t, n); en.push(o.replace(ISO, '').replace(/\s+/g, ' ').trim());
        if (AR.test(o)) left.push(s.name + ' ⇒ «' + n.replace(ISO, '').trim() + '»');
        else if (digits(o) !== digits(n)) nums.push(s.name + ' ⇒ «' + n.replace(ISO, '').trim() + '» ⇒ «' + o.replace(ISO, '').trim() + '»');
      });
      byState[M.name + ' / ' + s.name] = en;
    });
    ok(states.length >= 20 && nNodes >= 200, M.name + ': the state matrix is really rendered (' + states.length + ' states · ' + nNodes + ' text pieces)');
    ok(left.length === 0, M.name + ': no Arabic left in English' + (left.length ? ' — ' + left.length + ' piece(s): ' + [...new Set(left)].slice(0, 4).join(' | ') : ''));
    ok(nums.length === 0, M.name + ': every number survives translation unchanged' + (nums.length ? ' — ' + nums.slice(0, 3).join(' | ') : ''));
  });

  /* (٣) صياغاتٌ مثبّتة — بطاقةُ الهدف */
  const has = (state, text) => (byState['dash-goal / ' + state] || []).some(x => x === text);
  const line = (state, text) => (byState['dash-goal / ' + state] || []).join(' ¦ ').includes(text);
  const shot = 'owner screenshot';
  ok(has(shot, '📅 Scheduled today (expected)') && has(shot, '📈 Month to date'), 'goal: the two row titles');
  ok(has(shot, "0% of today's goal") && has(shot, "0% of the month's goal"), 'goal: percentage of the daily and the monthly goal');
  ok(has(shot, '· ⚠️ Behind pace (expected by today: 846,154 SYP)') && has(shot, '· ⚠️ Behind pace (expected by today: 1,269.23 $)'), 'goal: behind pace carries the expected amount in its own currency');
  ok(has('on pace', '· ✅ On pace (expected by today: 846,154 SYP)'), 'goal: on pace');
  ok(has(shot, '0 appointments today') && has(shot, '· No priced appointments in this currency') && has(shot, '💵 Collected today'), 'goal: the closing row and the «no priced appointments» line');
  ok(has('SYP exact ×1', '· 1 appointment · from plan items') && has('SYP exact ×2', '· 2 appointments · from plan items') && has('SYP exact ×11', '· 11 appointments · from plan items'), 'goal: appointment count — singular, dual, plural — from plan items');
  ok(has('SYP estimated ×3', '· 3 appointments · estimated from the treatment price') && has('SYP both ×3', '· 5 appointments (2 from the plan · 3 estimated from the treatment price)'), 'goal: estimated, and the mixed breakdown');
  ok(has('SYP exact ×1', '1 appointment today') && has('SYP exact ×3', '3 appointments today · 2 unpriced') && has('USD+SYP exact ×1', '2 appointments today'), 'goal: closing count with «unpriced»');
  ok(has('no goal · owner', 'Working day 11/26') && has('no goal · owner', 'Set a monthly goal →'), 'goal: no goal ⇒ working-day counter and the owner link (arrow flipped)');
  ok(has('no goal · two currencies · owner', 'Set a monthly goal in SYP →') && has('no goal · two currencies · owner', 'Set a monthly goal in $ →'), 'goal: with two currencies the link names its currency');
  ok(!line('no goal · staff', 'Set a monthly goal'), 'goal: staff get no «set a goal» link');
  ok(has('empty · staff', 'No priced appointments today and no production this month yet') && has('empty · owner', 'No priced appointments today and no production this month yet —') && has('null result', 'Set a monthly goal →'), 'goal: the empty state, with and without the owner link');
  ok(line('SYP estimated ×3', 'Expected value — estimated from treatment prices, not collected'), 'goal: the striped bar explains itself (title)');
  ok(has('USD+SYP exact ×1', '0 SYP · 120.5 $') && has('SYP exact ×1', '350,000 SYP') && has('goal reached', '400 $') && has(shot, '0 SYP · 0 $'), 'goal: collected today per shown currency — a decimal dollar amount beside SYP included');

  /* (٤) المحرّك: كلمةٌ معروفة يتبعها رقمٌ عشري أو قوس تُترجَم؛ والمجهولُ (اسمُ مريض) يبقى كما هو */
  const I = s => s.replace(/<(.*?)>/g, '\u2066$1\u2069'), plain = s => t(I(s)).replace(ISO, '');
  ok(plain('<0 ل.س> · <120.5 $>') === '0 SYP · 120.5 $' && plain('<10 ل.س> · <1,200.75 $>') === '10 SYP · 1,200.75 $', 'engine: «ل.س» followed by a decimal amount is translated');
  ok(plain('<0 ل.س> · <0 $>') === '0 SYP · 0 $' && plain('<5,000 ل.س>') === '5,000 SYP' && plain('<1.5 ل.س>') === '1.5 SYP', 'engine: the amounts that already worked still do');
  ok(plain('ل.س (1.5)') === 'SYP (1.5)' && plain('ل.س: 1.5') === 'SYP: 1.5', 'engine: a known word before a bracketed or decimal number keeps the punctuation that follows it');
  ok(plain('التخزين: 2.5 GB') === 'Storage: 2.5 GB' && plain('التخزين: 2 GB') === 'Storage: 2 GB', 'engine: an entry that carries its own colon is found before a decimal as before a whole number');
  ok(plain('أحمد الخطيب (2.5)') === 'أحمد الخطيب (2.5)' && plain('أحمد الخطيب · <120.5 $>') === 'أحمد الخطيب · 120.5 $', 'engine: an unknown name before a decimal is left exactly as is');
  ok(plain('أحمد الخطيب — <0 ل.س> · <1.5 $>') === 'أحمد الخطيب — 0 ل.س · 1.5 $', 'engine: no half-translated line — a name beside an amount stays whole');
  return out;
}

const FILES = ['theme.js', 'i18n-en.js'].concat(...MODULES.map(m => m.files));
const F0 = {}; FILES.forEach(f => { F0[f] = R(f); });
const MUTANTS = [
  ['a row title loses its entry', 'i18n-en.js', "  'الشهر حتى اليوم': 'Month to date',\n", ''],
  ['the pace pattern is dropped', 'i18n-en.js', /\n  \[\/\^\(\?:· \)\?\(✅ على الوتيرة\|⚠️ دون الوتيرة\)[^\n]*\n/, '\n'],
  ['the closing-count pattern is dropped', 'i18n-en.js', /\n  \[new RegExp\('\^' \+ COUNT \+ ' اليوم[^\n]*\n/, '\n'],
  ['a pattern loses a number', 'i18n-en.js', "' from the plan · ' + es + ' estimated from the treatment price)'", "' from the plan · estimated from the treatment price)'"],
  ['the module gains an untranslated string', 'dash-goal.js', "' من هدف اليوم</b>", "' من هدف اليوم المحدَّث</b>"],
  ['the module gains an untranslated state', 'dash-goal.js', "'لا مواعيد مسعَّرة بهذه العملة'", "'لا مواعيد بقيمة بهذه العملة'"],
  ['singular written as plural', 'i18n-en.js', "n === 1 ? ' appointment' : ' appointments'", "' appointments'"],
  ['the engine loses the word before a decimal again', 'theme.js', 'if (D[t2[2]] != null) return', 'if (false) return'],
  ['the engine loses an entry with its own colon before a decimal', 'theme.js', 'if (D[t2[2] + t2[3]] != null) return', 'if (false) return']
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
console.log((good ? '✅' : '❌') + ' prove-i18n-render: ' + pass + '/' + (pass + fail) + (self ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
process.exit(good ? 0 : 1);
