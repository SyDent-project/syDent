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

  /* (٥) v716: نافذةُ «تطبيق» ورسائلُ الحفظ بالتحديد المتعدد — الجملةُ تُترجَم واسمُ العلاج يُترجَم إن عُرف ويبقى كما هو إن لم يُعرف */
  const BATCH = [
    ['🦷 قلع — 2 جلسات (16 إطباقي، 26 جذر 1)', '🦷 Extraction — 2 sessions (16 Occlusal, 26 root 1)'],
    ['🦷 قلع — 1 جلسة (16 تاج)', '🦷 Extraction — 1 session (16 crown)'],
    ['📌 قلع — موجود مسبقاً على 2 مواضع · توثيق بلا تكلفة (16 إطباقي، 26 إطباقي)', '📌 Extraction — already existing on 2 positions · documentation, no charge (16 Occlusal, 26 Occlusal)'],
    ['✅ تم تسجيل قلع لـ2 أسنان (جلسة لكل سن)', '✅ Extraction recorded for 2 teeth (one session per tooth)'],
    ['✅ تم تسجيل قلع لـ1 أسنان (جلسة لكل سن)', '✅ Extraction recorded for 1 tooth (one session per tooth)'],
    ['📌 وُثّق تنظيف كموجودٍ مسبقاً على 1 موضع — بلا تكلفة', '📌 Cleaning documented as already existing on 1 position — no charge'],
    ['⚠️ توقفت الدفعة — سُجلت 1 من 3 جلسات', '⚠️ Batch stopped — 1 of 3 sessions recorded'],
    ['⚠️ توقفت الدفعة — وُثّق 2 من 3 مواضع', '⚠️ Batch stopped — 2 of 3 positions documented']
  ];
  const bad = BATCH.filter(([ar, en]) => t(ar) !== en);
  ok(bad.length === 0, 'batch apply modal + save toasts translate' + (bad.length ? ' — ' + bad.map(([ar]) => '«' + ar + '» ⇒ «' + t(ar) + '»').slice(0, 2).join(' | ') : ''));
  ok(t('📌 قلع تنظيف — موجود مسبقاً على 2 مواضع · توثيق بلا تكلفة (16 إطباقي، 26 إطباقي)') === '📌 قلع تنظيف — already existing on 2 positions · documentation, no charge (16 Occlusal, 26 Occlusal)', 'batch: a clinic treatment name not in the dictionary stays whole — never word-by-word guessed');
  /* الأنماطُ مربوطةٌ بالكود: صيغُ الرسائل كما يبنيها pp-modules/pp-dental — تغييرُ صياغةٍ هناك يحمرّ هنا */
  const PDS = F['pp-dental.js'], PMS = F['pp-modules.js'];
  ok(["' كموجودٍ مسبقاً على '", "' أسنان (جلسة لكل سن)'", "' — بلا تكلفة'", "'⚠️ توقفت الدفعة — سُجلت '", "'⚠️ توقفت الدفعة — وُثّق '"].every(x => PDS.includes(x))
    && ["' — موجود مسبقاً على '", "' · توثيق بلا تكلفة ('", "(units.length === 1 ? 'جلسة' : 'جلسات')", "posList.join('، ')"].every(x => PMS.includes(x)), 'batch: the patterns match the strings the code actually builds');

  /* (٦) v718: رسائلُ الخطأ لسنٍّ معيّن ورسائلُ التحديد المتعدد الثابتة */
  const ERR = [
    ['⚠️ السن 16 لم يعد مؤهلاً (مقلوع) — توقفت الدفعة', '⚠️ Tooth 16 is no longer eligible (extracted) — batch stopped'],
    ['⚠️ السن 16: مزروع', '⚠️ Tooth 16: has an implant'],
    ['⚠️ السن 75: علاجٌ للأسنان الدائمة فقط', '⚠️ Tooth 75: treatment for permanent teeth only'],
    ['⚠️ أسنان غير مؤهلة لهذا العلاج: 16 (مقلوع)، 26 (دعامة جسر)', '⚠️ Teeth not eligible for this treatment: 16 (extracted), 26 (bridge abutment)'],
    ['🔩 قلعُ السن 16 ما زال مخطّطاً — الزرعة عليه تُضاف كعلاجٍ مخطّط — توقفت الدفعة', '🔩 The extraction of tooth 16 is still planned — an implant on it is added as a planned treatment — batch stopped'],
    ['⚠️ خطأ بالسن 16: duplicate key value', '⚠️ Error on tooth 16: duplicate key value'],
    ['⚠️ خطأ حفظ السن 16: network error', '⚠️ Error saving tooth 16: network error'],
    ['⚠️ تسجيل جلسة السن 16 فشل: timeout', '⚠️ Recording the session for tooth 16 failed: timeout'],
    ['↩️ أُلغي تحديد السن 26 (جذر 1)', '↩️ Tooth 26 deselected (root 1)'],
    ['☑️ أنهِ وضع التحديد المتعدد أولاً', '☑️ Finish multi-select first'],
    ['👆 انقر موضعاً واحداً على الأقل من المخطط', '👆 Click at least one position on the chart'],
    ['لا شيء للتراجع عنه', 'Nothing to undo'],
    ['☑️ وضع التحديد المتعدد — اختر علاجاً ثم انقر المواضع على المخطط', '☑️ Multi-select — choose a treatment, then click positions on the chart'],
    ['🔒 حسابك غير نشط — لا يمكن تسجيل علاجات', '🔒 Your account is inactive — treatments cannot be recorded']
  ];
  const badE = ERR.filter(([ar, en]) => t(ar) !== en);
  ok(badE.length === 0, 'batch: per-tooth errors and fixed toasts translate' + (badE.length ? ' — ' + badE.map(([ar]) => '«' + ar + '» ⇒ «' + t(ar) + '»').slice(0, 2).join(' | ') : ''));
  /* سببٌ مجهول ⇒ الرسالةُ كلُّها تبقى عربية كما هي — لا نصفُ ترجمة («Tooth 16 لم يعد…») */
  ok(['⚠️ السن 16 لم يعد مؤهلاً (سبب جديد) — توقفت الدفعة', '⚠️ السن 16: سبب جديد', '⚠️ أسنان غير مؤهلة لهذا العلاج: 16 (مقلوع)، 26 (سبب جديد)'].every(x => t(x) == null || t(x) === x), 'batch: an unknown reason leaves the whole message untouched — never half translated');
  /* كلُّ سببٍ يبنيه الكود له ترجمة: أسبابُ batchAllowed ورسالتا txDentitionMsg */
  const PMx = F['pp-modules.js'], PDx = F['pp-dental.js'];
  const ba = PMx.slice(PMx.indexOf('function batchAllowed('), PMx.indexOf('\n}\n', PMx.indexOf('function batchAllowed(')));
  const td = PDx.slice(PDx.indexOf('function txDentitionMsg('), PDx.indexOf('\n}\n', PDx.indexOf('function txDentitionMsg(')));
  const reasons = [...ba.matchAll(/msg: '([^']+)'/g)].map(m => m[1]).concat([...td.matchAll(/'([^']*[\u0600-\u06FF][^']*)'/g)].map(m => m[1]));
  const untr = reasons.filter(r => t('⚠️ السن 16: ' + r) === null || /[\u0600-\u06FF]/.test(t('⚠️ السن 16: ' + r)));
  ok(reasons.length >= 12 && untr.length === 0, 'batch: every eligibility reason the code builds has a translation (' + reasons.length + ')' + (untr.length ? ' — missing: ' + untr.join(' | ') : ''));
  /* ج2: رقمُ السن يمرّ بـtoothRef (السنُّ الزائد باسمه «الزائد بين 12 و13»؛ سنُّ FDI رقمُه كما هو ⇒ الأنماطُ \\d+ تبقى صالحة) */
  ok(["'⚠️ السن ' + toothRef(_bn) + ' لم يعد مؤهلاً ('", "'⚠️ خطأ بالسن ' + toothRef(_bn) + ': '", "'⚠️ خطأ حفظ السن ' + toothRef(_bn) + ': '", "'⚠️ تسجيل جلسة السن ' + toothRef(_bn) + ' فشل: '", "'🔩 قلعُ السن ' + toothRef(_bn) + ' ما زال مخطّطاً"].every(x => PDx.includes(x))
    && /function toothRef\(n\)\{ return isSupTooth\(n\) \? 'الزائد ' \+ supPlace\(n\) : n; \}/.test(PDx)
    && ["'⚠️ أسنان غير مؤهلة لهذا العلاج: ' + bad.join('، ')", "bad.push((typeof toothRef === 'function' ? toothRef(units[i].n) : units[i].n) + ' (' + v.msg + ')')", "'↩️ أُلغي تحديد السن ' + (typeof toothRef === 'function' ? toothRef(last.n) : last.n) + ' ('"].every(x => PMx.includes(x)), 'batch: the error patterns match the strings the code actually builds');

  /* (٧) 25/11: مخطط اللثة بالإنجليزية — الجدول · المؤشّرات (وبالمقارنة «(كان …)») · المقارنة · الإشعارات · الطباعة */
  const PERIO = [
    ['عمق — دهليزي', 'Depth — Buccal'], ['نزف — حنكي', 'BOP — Palatal'], ['انحسار — لساني', 'Recession — Lingual'], ['تشعب (1-3) — أرحاء', 'Furcation (1-3) — Molars'],
    ['الحركة (0-3)', 'Mobility (0-3)'], ['التشعب', 'Furcation'],
    ['أسنان مفحوصة: 32', 'Teeth examined: 32'], ['نزف BOP: 12٪', 'BOP: 12%'], ['نزف BOP: 0٪ (كان 7٪)', 'BOP: 0% (was 7%)'],
    ['مواقع ≥4مم: 3 (كان 1)', 'Sites ≥4 mm: 3 (was 1)'], ['مواقع ≥6مم: 0', 'Sites ≥6 mm: 0'], ['CAL ≥5مم: 2 (كان 0)', 'CAL ≥5 mm: 2 (was 0)'],
    ['مقابل 1/10/2026:', 'vs 1/10/2026:'], ['▼ تحسّن 3', '▼ improved 3'], ['▲ تراجع 1', '▲ worse 1'], ['· ثبات 14 · نزف: توقّف 1 / جديد 2', '· same 14 · bleeding: stopped 1 / new 2'],
    ['مقابل 1/10/2026 — د. سامي', 'vs 1/10/2026 — د. سامي'], ['✕ إنهاء المقارنة', '✕ End comparison'], ['كان: 4', 'Was: 4'], ['كان: 4 — الآن فارغ', 'Was: 4 — now empty'],
    ['جديد (لم يُقَس سابقاً)', 'New (not measured before)'], ['نزف جديد (لم يكن ينزف)', 'New bleeding (was not bleeding)'], ['توقف النزف (كان ينزف)', 'Bleeding stopped (was bleeding)'],
    ['🔍 مقارنة بفحص 1/10/2026', '🔍 Comparing with the exam of 1/10/2026'], ['لا يوجد فحص أسبق للمقارنة', 'No earlier exam to compare with'],
    ['حذف فحص 1/10/2026 نهائياً مع كل قياساته؟', 'Delete the exam of 1/10/2026 permanently with all its measurements?'],
    ['💾 حُفظ فحص اللثة (12 سناً)', '💾 Perio exam saved (12 teeth)'], ['💾 حُفظ فحص اللثة (1 سناً)', '💾 Perio exam saved (1 tooth)'],
    ['لديك تعديلات غير محفوظة — تجاهلها والانتقال؟', 'You have unsaved changes — discard them and switch?'],
    ['مقارنة: 1/10/2026 ← 20/11/2026', 'Comparison: 1/10/2026 → 20/11/2026'],
    ['تحسّنت حالة اللثة: نقص عمق الجيب في 3 موقعاً، وزاد في 1.', 'Gums improved: pocket depth decreased at 3 site(s), and increased at 1.'],
    ['تحتاج اللثة متابعة: زاد عمق الجيب في 4 موقعاً.', 'Gums need follow-up: pocket depth increased at 4 site(s).'],
    ['نزف عند السبر (٪)', 'Bleeding on probing (%)'], ['تراجع (عمقٌ أكبر) — مقابل فحص 1/10/2026', 'worse (deeper) — vs the exam of 1/10/2026'],
    ['● نزف عند السبر · × سن مقلوع · القيم بالملم (أنسي · وسط · وحشي) · CAL = العمق + الانحسار (الانحسار الفارغ = 0) · التشعب على الأرحاء: 1=I · 2=II · 3=III · — لا ينطبق',
     '● bleeding on probing · × extracted tooth · values in mm (mesial · mid · distal) · CAL = depth + recession (empty recession = 0) · furcation on molars: 1=I · 2=II · 3=III · — not applicable']
  ];
  const badP = PERIO.filter(([ar, en]) => t(ar) !== en);
  ok(badP.length === 0, 'perio: chart, stats, compare, toasts and print translate' + (badP.length ? ' — ' + badP.map(([ar]) => '«' + ar + '» ⇒ «' + t(ar) + '»').slice(0, 2).join(' | ') : ''));
  /* أنماطُ «مقابل/مقارنة» مقصورةٌ على تاريخ fmtD — نصٌّ عربي آخر يبدأ بها لا يُلتقط نصفَ ترجمة */
  ok(['مقابل الدفعة', 'مقارنة: الفحص ← اليوم'].every(x => t(x) === null || /^مقا/.test(t(x))), 'perio: the «vs»/«comparison» patterns only take a date');
  /* الأنماطُ مربوطةٌ بالكود — تغييرُ صياغةٍ بـpp-modules يحمرّ هنا */
  const PMp = F['pp-modules.js'];
  ok(["'<span>أسنان مفحوصة: '", "نزف BOP: ' + pct + '٪' + (cp ? ' (كان ' + cp.pct + '٪)'", "مواقع ≥4مم: ' + w4 + (cp ? ' (كان '", "CAL ≥5مم: ' + cal5", "مقابل ' + fmtD(cp.date) + ': <b class=\"cmp-better-t\">▼ تحسّن '",
      "· ثبات ' + cp.same", "' · نزف: توقّف ' + cp.bopStop + ' / جديد ' + cp.bopNew", "showToast('🔍 مقارنة بفحص ' + fmtD(prev.exam_date));", "'حذف فحص ' + fmtD(perioCurrent.exam_date) + ' نهائياً مع كل قياساته؟'",
      "showToast('💾 حُفظ فحص اللثة (' + rows.length + ' سناً)');", "مقارنة: ' + fmtD(cp.date) + ' ← ' + fmtD(perioCurrent.exam_date)", "' موقعاً' + (cp.worse ? '، وزاد في '",
      "'\" data-en=\"Mobility\">الحركة</td>'"].every(x => PMp.includes(x)), 'perio: the patterns match the strings the code builds');

  /* (٨) 25/11: بطاقةُ المريض — خطةُ العلاج وجدولُ الجلسات والمدفوعات والسجلّ ونوافذُها. اسمُ العلاج بيانُ العيادة: يبقى كما هو */
  const CARD = [
    ['🗓️ زيارات الخطة', '🗓️ Plan visits'], ['المرحلة الأولى', 'Stage 1'], ['بلا مرحلة', 'No stage'], ['ترتيب / بديل', 'Order / alternative'], ['م2', 'S2'],
    ['🗓️ زيارة 1', '🗓️ Visit 1'], ['2 بند · 1,200 ل.س', '2 items · 1,200 SYP'], ['1 بند · 300 $', '1 item · 300 $'],
    ['↩︎ 1 بند كان مربوطاً بموعدٍ أُلغي أو فات أو انتهى دون إنجازه — عاد «بلا زيارة» ليُجدوَل من جديد.', '↩︎ 1 item was linked to an appointment that was cancelled, missed or ended without it — back to «No visit» to be scheduled again.'],
    ['🔬 2 طلب مخبر مفتوح — اضغط للعرض', '🔬 2 open lab orders — tap to view'],  ['غير مدفوع', 'Unpaid'], ['بندٌ بديل — لا يُجدوَل ولا يدخل الزيارات قبل اعتماد الخيار ب', 'An alternative item — not scheduled and not in visits until option B is adopted'], ['📅 موعد منتهٍ', '📅 Appointment ended'],
    ['⚠️ على المريض ل.س', '⚠️ Owed by the patient (SYP)'], ['مخطط (لم يُنجز)', 'Planned (not done)'], ['✏️ توزيع', '✏️ Allocate'],
    ['حشوة — السن 36', 'Filling — tooth 36'], ['دفعة: 150 ل.س', 'Payment: 150 SYP'],
    ['🗓️ زيارة جديدة — المرحلة الثانية', '🗓️ New visit — Stage 2'], ['2 علاج سيُربط • 1,200 ل.س', '2 treatments to link • 1,200 SYP'], ['حشوة • السن 36', 'Filling • tooth 36'],
    ['تأكيد إكمال العلاج', 'Confirm completing the treatment'], ['العلاج: حشوة', 'Treatment: Filling'], ['التكلفة: 300 ل.س', 'Cost: 300 SYP'],
    ['✅ حشوة • سن 16 (إطباقي)', '✅ Filling • tooth 16 (Occlusal)'], ['📋 حشوة • سن زائد بين 12 و13', '📋 Filling • supernumerary tooth between 12 and 13'],
    ['5/11/2026 • متبقي على الجلسة:', '5/11/2026 • left on the session:'],
    ['✓ اعتماد الخيار ب', '✓ Adopt option B'], ['+ 1 بند مشترك (أدناه)', '+ 1 shared item (below)'], ['3 بنود', '3 items'], ['🔀 يضمّ بدائل — أ: 900 · ب: 1,500', '🔀 Includes alternatives — A: 900 · B: 1,500'],
    ['🔀 هذا البند من «الخيار ج» — إنجازُه يعني اعتماد هذا الخيار.', '🔀 This item belongs to «Option C» — completing it adopts that option.'], ['– زرعة (سن 36) [ب]', '– زرعة (tooth 36) [B]'], ['150 من 150 ل.س', '150 of 150 SYP'],
    ['لا مراسلات بعد — كل ما تُرسله لهذا المريض من زر «واتساب» (روشتة · تعليمات · خطة · تذكير…) يُسجَّل هنا بتاريخه ونصّه.', 'No messages yet — everything you send this patient with the «WhatsApp» button (prescription · instructions · plan · reminder…) is logged here with its date and text.']
  ];
  const badC = CARD.filter(([ar, en]) => t(ar) !== en);
  ok(badC.length === 0, 'patient card: plan, sessions, payments, log and their dialogs translate' + (badC.length ? ' — ' + badC.map(([ar]) => '«' + ar + '» ⇒ «' + t(ar) + '»').slice(0, 2).join(' | ') : ''));
  /* اسمُ علاجٍ مجهول يبقى كما هو والسنُّ وحده يُترجم — لا اختلاقَ لاسم */
  /* كلماتٌ مفردة ملتبسة تبقى خارج القاموس المشترك — إنجليزيتُها بـdata-en بموضعها */
  ok(['المرحلة', 'بديل', 'أ', 'ب', 'ج', 'إكمال', 'الدفع'].every(w => t(w) === null || t(w) === w) && F['pp-plan.js'].includes('data-en="Stage">المرحلة</span>') && F['pp-plan.js'].includes('data-en="Alternative">بديل</span>') && F['pp-plan.js'].includes("var en = ({ 'أ': 'A', 'ب': 'B', 'ج': 'C' })[lbl];") && F['pp-plan.js'].includes("(en ? ' data-en=\"' + en + '\"' : '')")
    && F['patient-profile.html'].includes('<th data-en="Payment">الدفع</th>') && F['patient-profile.html'].includes('<span class="sy-act-lbl" data-en="Complete"> إكمال</span>'), 'patient card: ambiguous single words carry their own data-en, not the shared dictionary');
  ok(t('حشوة مخصّصة للعيادة — السن 21') === 'حشوة مخصّصة للعيادة — tooth 21' && t('تاج زركون • سن 11') === 'تاج زركون • tooth 11', 'patient card: an unknown treatment name stays exactly as the clinic wrote it');
  return out;
}

const FILES = ['theme.js', 'i18n-en.js', 'pp-dental.js', 'pp-modules.js', 'pp-plan.js', 'patient-profile.html'].concat(...MODULES.map(m => m.files));
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
  ['the engine loses an entry with its own colon before a decimal', 'theme.js', 'if (D[t2[2] + t2[3]] != null) return', 'if (false) return'],
  ['batch: the doc-title pattern is dropped', 'i18n-en.js', /\n    \[\/\^📌 \(\.\+\?\) — موجود مسبقاً[^\n]*\n/, '\n'],
  ['batch: teeth always plural', 'i18n-en.js', "cnt(n, 'tooth', 'teeth')", "cnt(n, 'teeth', 'teeth')"],
  ['batch: positions keep the Arabic comma', 'i18n-en.js', "return s.split('، ').map(pos).join(', ');", "return s.split('، ').map(pos).join('، ');"],
  ['batch: an unknown name is half-guessed', 'i18n-en.js', "function name(s) { var d = D(); return d[s] != null ? d[s] : s; }", "function name(s) { return pos(s); }"],
  ['batch: the code rewords a toast', 'pp-dental.js', "' كموجودٍ مسبقاً على '", "' كموجود سابقاً على '"],
  ['batch: a reason loses its translation', 'i18n-en.js', "'عليه حافظ مسافة': 'has a space maintainer', ", ''],
  ['batch: the code adds an untranslated reason', 'pp-modules.js', "return { ok: false, msg: 'مزروع' };", "return { ok: false, msg: 'مزروع حديثاً' };"],
  ['batch: unknown reason half-translated', 'i18n-en.js', "[new RegExp('^⚠️ السن (\\\\d+): ' + WHY_RE + '$')", "[new RegExp('^⚠️ السن (\\\\d+): (.+)$')"],
  ['batch: technical error text dropped', 'i18n-en.js', "'⚠️ Error saving tooth $1: $2'", "'⚠️ Error saving tooth $1'"],
  ['batch: a fixed toast loses its entry', 'i18n-en.js', "'لا شيء للتراجع عنه': 'Nothing to undo',", ''],
  ['batch: the code rewords an error toast', 'pp-dental.js', "' فشل: '", "' لم ينجح: '"],
  ['perio: a grid label loses its entry', 'i18n-en.js', "'عمق — دهليزي': 'Depth — Buccal', ", ''],
  ['perio: the stats pattern is dropped', 'i18n-en.js', /\n    \[\/\^نزف BOP[^\n]*\n/, '\n'],
  ['perio: «was» lost in compare', 'i18n-en.js', "return 'BOP: ' + a + '%' + was(b ? b + '%' : '');", "return 'BOP: ' + a + '%';"],
  ['perio: tooth always plural', 'i18n-en.js', "(n === '1' ? ' tooth)' : ' teeth)')", "' teeth)'"],
  ['perio: the «vs» pattern takes any text', 'i18n-en.js', "[R('^مقابل ' + DT + '( — .+)?$')", "[R('^مقابل (.+?)( — .+)?$')"],
  ['perio: mobility printed as movement', 'pp-modules.js', '" data-en="Mobility">الحركة</td>', '">الحركة</td>'],
  ['perio: the code rewords a toast', 'pp-modules.js', "showToast('🔍 مقارنة بفحص '", "showToast('🔍 مقارنة مع فحص '"],
  ['card: a plan label loses its entry', 'i18n-en.js', "'🗓️ زيارات الخطة': '🗓️ Plan visits', ", ''],
  ['card: items always plural', 'i18n-en.js', "return cnt(n, 'item', 'items') + ' · '", "return n + ' items · '"],
  ['card: an ambiguous single word enters the shared dictionary', 'i18n-en.js', "'الخيار أ': 'Option A',", "'الخيار أ': 'Option A', 'بديل': 'Alternative',"],
  ['card: the option letter loses its data-en', 'pp-plan.js', "(en ? ' data-en=\"' + en + '\"' : '')", "''"],
  ['card: the tooth pattern swallows the treatment name', 'i18n-en.js', "[/^(.+) — (?:السن|سن) (\\d+)$/, '$1 — tooth $2'],", "[/^(.+) — (?:السن|سن) (\\d+)$/, 'Treatment — tooth $2'],"]
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
