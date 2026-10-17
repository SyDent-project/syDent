#!/usr/bin/env node
/* v597 — خياراتُ الخطة كبطاقاتٍ مسمّاة بمحتواها + ضابطُ الصفّ (المرحلة · البديل).
   يشغّل pp-plan.js الحقيقي داخل vm بعالميّاتٍ دنيا (بلا acorn ولا DOM) على جلساتٍ وهمية:
   • بلا خيارات ⇒ لا بطاقات ولا شريط (تكافؤٌ مع ما قبل v597).
   • خياران + مشترك ⇒ بطاقةٌ لكل خيار باسمٍ مشتقٍّ من بنده الأغلى، بنودُه بأسنانها وأسعارها
     ومرحلتها، بطاقةُ «مشترك»، الإجمالي = المشترك + بنوده، زرُّ اعتمادٍ لكل خيار، ولا زرَّ للمشترك.
   • «اعتمادٌ معلّق» (M145-i) ما زال بنصّه وزرّه.
   • ضابطُ الصف: شريحةٌ واحدة «م2 · خيار ب» مغلقةً، وبالفتح لوحةٌ بسطرين مسمّيين وتحديدٍ صحيح
     وتلميحِ «لا يُجدوَل قبل الاعتماد» على بند الخيار؛ لوحةٌ مفتوحة واحدة فقط بالجدول.
   --self-test: طفراتٌ على المصدر يجب أن تُسقط التوكيدات. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const REPO = path.resolve(__dirname, '..') + '/';
const SRC = fs.readFileSync(REPO + 'pp-plan.js', 'utf8');

function boot(src, sessions) {
  const ctx = {
    console, Date, Math, JSON, Array, Object, String, Number, RegExp, Error, parseInt, parseFloat, isNaN,
    window: null, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    ppGuarded: (n, f) => f, showToast() {}, logAudit() {}, renderSessions() { ctx._renders++; }, _renders: 0,
    fmt: n => Number(n || 0).toLocaleString('en-US'),
    escapeHtml: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    _rowCur: s => s.currency || 'SYP', _rowLbl: s => (s.currency || 'SYP') === 'USD' ? '$' : 'ل.س',
    SyDentCurBag: { make: () => ({ SYP: 0, USD: 0 }), text: (b, f) => [b.SYP ? f(b.SYP) + ' ل.س' : '', b.USD ? f(b.USD) + ' $' : ''].filter(Boolean).join(' · ') || '0' },
    QUADRANT_LABELS: {}, ARCH_LABELS: {}, STATUS_LABELS: {},
    sessions, patient: { name: 'x' }, patientId: 'P', currentUser: { id: 'D' }, toDay: () => '2026-10-10',
    sb: { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }), in: () => ({ eq: async () => ({ error: null }) }) }) }) }
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'pp-plan.js' });
  return { run: c => vm.runInContext(c, ctx), ctx };
}
const S = () => [
  { id: 's1', type: 'تاج خزف على معدن', tooth_num: '14', cost: 200000, status: 'planned', phase: 1, plan_option: null },
  { id: 's3', type: 'قلع', tooth_num: '42', cost: 6000, status: 'planned', phase: null, plan_option: 1 },
  { id: 's2', type: 'زراعة', tooth_num: '45', cost: 350, currency: 'USD', status: 'planned', phase: 2, plan_option: 1 },
  { id: 's7', type: 'قلع', tooth_num: '46', cost: 6000, status: 'planned', phase: null, plan_option: 1 },
  { id: 's4', type: 'جسر (زركون)', tooth_num: '43,44,45', cost: 1352500, status: 'planned', phase: 2, plan_option: 2 },
  { id: 's5', type: 'حشوة كومبوزت', tooth_num: '31', cost: 50000, status: 'completed', plan_option: null }
];
const R = (b, id) => b.run("planRowCtlHtml(sessions.filter(function(x){ return x.id === '" + id + "'; })[0])");
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function assertions(src) {
  const fails = [];
  const T = (name, ok, extra) => { if (!ok) fails.push(name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); };
  // A — بلا خيارات
  { const b = boot(src, S().map(s => Object.assign({}, s, { plan_option: null })));
    T('A1 بلا خيارات ⇒ شريطٌ فارغ', b.run('planOptionsBarHtml()') === '');
    const row = R(b, 's1');
    T('A2 الصفُّ المشترك بمرحلة 1 ⇒ شريحة «م1» بلا بديل', /spc-ph[^<]*>م1</.test(row) && !/spc-op/.test(row), row); }
  // B — خياران + مشترك
  { const b = boot(src, S());
    const html = b.run('planOptionsBarHtml()'), txt = strip(html);
    T('B1 بطاقتان للخيارين', (html.match(/class="po-card" data-plan-opt="/g) || []).length === 2, html);
    T('B2 وصفُ أ = أنواعُ علاجاته بلا تكرار ولا «+N» ولا أسنان', /الخيار أ 3 بنود قلع · زراعة قلع \(42\)/.test(txt) && !/\+1/.test(txt), txt);
    T('B3 وصفُ ب وعدّاده', /الخيار ب 1 بند جسر \(زركون\) جسر \(زركون\) \(43,44,45\)/.test(txt), txt);
    T('B4 بنودُ أ بأسعارها ومرحلة الزرعة', /زراعة \(45\)\s*م2\s*350 \$/.test(txt) && /قلع \(42\)\s*6,000 ل\.س/.test(txt), txt);
    T('B5 بطاقةُ المشترك ببند التاج ومرحلته وعدّاده', /مشترك 1 بند.*تاج خزف على معدن \(14\)\s*م1\s*200,000 ل\.س/.test(txt), txt);
    T('B6 إجمالي أ = المشترك + بنوده (212,000 ل.س · 350 $)', /الإجمالي 212,000 ل\.س · 350 \$/.test(txt), txt);
    T('B7 إجمالي ب = 1,552,500 ل.س', /الإجمالي 1,552,500 ل\.س/.test(txt), txt);
    T('B8 زرُّ اعتمادٍ لكل خيار ولا زرَّ للمشترك', /adoptPlanOption\(1\)/.test(html) && /adoptPlanOption\(2\)/.test(html) && (html.match(/adoptPlanOption\(/g) || []).length === 2, html);
    T('B9 المنجزُ لا يدخل البطاقات', !/حشوة كومبوزت/.test(txt), txt);
    T('B10 حالةُ «بانتظار قرار المريض» + الخطواتُ الثلاث', /بانتظار قرار المريض/.test(txt) && /١ بدائل ← ٢ اعتماد ← ٣ ترتيب/.test(txt), txt);
    T('B11 «+1 بند مشترك» على كل بطاقة خيار', (html.match(/\+ 1 بند مشترك/g) || []).length === 2, html);
    T('B12 كلُّ صفِّ بندٍ بخلية مرحلةٍ ثابتة (فارغة أو م)', (html.match(/class="po-phc"/g) || []).length === 5, html); }
  // C — اعتمادٌ معلّق (M145-i) محفوظ
  { const ss = S(); ss.push({ id: 's6', type: 'تاج زركون', tooth_num: '36', cost: 1000, status: 'completed', plan_option: 2 });
    const b = boot(src, ss); const html = b.run('planOptionsBarHtml()');
    T('C1 نصُّ الاعتماد المعلّق وزرُّه', /أُنجز بندٌ من «الخيار ب»/.test(html) && /data-plan-pending="1"/.test(html) && (html.match(/adoptPlanOption\(2\)/g) || []).length === 2, strip(html)); }
  // D — ضابطُ الصف
  { const b = boot(src, S());
    const closed = R(b, 's2');
    T('D1 مغلقٌ: «م2 · خيار أ» بلا لوحة', /م2</.test(closed) && /خيار أ</.test(closed) && !/spc-panel/.test(closed) && /aria-expanded="false"/.test(closed), closed);
    const empty = R(b, 's3');
    T('D2 بندٌ بلا مرحلة يعرض خياره فقط', /خيار أ</.test(empty) && !/م\d</.test(empty), empty);
    b.run("planRowCtlToggle('s2')");
    const open = R(b, 's2');
    T('D3 مفتوحٌ: لوحةٌ بسطرَي «المرحلة» و«بديل» وإعادةُ رسم', /spc-panel/.test(open) && /spc-lbl[^>]*>المرحلة</.test(open) && /spc-lbl[^>]*>بديل</.test(open) && b.ctx._renders === 1, open);
    T('D4 التحديدُ الصحيح: المرحلة 2 والخيار أ', /spc-c-ph sel"[^>]*onclick="setSessionPhase\('s2',2\)/.test(open) && /spc-c-op sel"[^>]*onclick="setSessionOption\('s2',1\)/.test(open), open);
    T('D5 تلميحُ «لا يُجدوَل قبل الاعتماد» على بند الخيار', /لا يُجدوَل ولا يدخل الزيارات قبل اعتماد الخيار أ/.test(open), open);
    T('D6 الصفُّ الآخر يبقى مغلقاً (لوحةٌ واحدة)', !/spc-panel/.test(R(b, 's1')));
    b.run("planRowCtlToggle('s1')");
    T('D7 فتحُ صفٍّ آخر يغلق الأول', !/spc-panel/.test(R(b, 's2')) && /spc-panel/.test(R(b, 's1')));
    T('D8 الصفُّ المشترك المفتوح بلا تلميح بديل', !/قبل اعتماد الخيار/.test(R(b, 's1')));
    b.run("planRowCtlToggle('s1')");
    T('D9 النقرُ ثانيةً يغلق', !/spc-panel/.test(R(b, 's1'))); }
  /* E — v611: ترتيبُ الجدول: المخطّطُ أولاً بالخيار أ←ب←ج←مشترك ثم بالمرحلة، والباقي بترتيبه الأصلي */
  { const b = boot(src, [
      { id: 'c1', status: 'completed' }, { id: 'p3', status: 'planned', plan_option: 3 }, { id: 'pS2', status: 'planned', phase: 2 },
      { id: 'p2', status: 'planned', plan_option: 2 }, { id: 'c2', status: 'completed' }, { id: 'pS1', status: 'planned', phase: 1 },
      { id: 'p1b', status: 'planned', plan_option: 1, phase: 3 }, { id: 'p1a', status: 'planned', plan_option: 1, phase: 1 }, { id: 'pS0', status: 'planned' } ]);
    const order = b.run("sessionsForTable(sessions).map(function(s){ return s.id; }).join(',')");
    T('E1 أ(م1,م3) ← ب ← ج ← مشترك(م1,م2,بلا) ← المنجز بترتيبه', order === 'p1a,p1b,p2,p3,pS1,pS2,pS0,c1,c2', order);
    T('E2 المصفوفةُ الأصلية لا تُمسّ', b.run("sessions[0].id") === 'c1'); }
  return fails;
}

const MUTANTS = [
  ['M1 وصفُ الخيار يكرّر النوع', '    if (seen[k]) return;\n', '\n'],
  ['M2 الإجمالي = بنودُ الخيار وحدها', 'return o === null || o === opt;', 'return o === opt;'],
  ['M3 المشتركُ يفقد بطاقته', "if (shared.length) {\n    var sb = _planBag();", "if (false) {\n    var sb = _planBag();"],
  ['M4 زرُّ اعتمادٍ غائب', "onclick=\"adoptPlanOption(' + o + ')\" title=\"اعتماد هذا الخيار", "onclick=\"void 0\" title=\"اعتماد هذا الخيار"],
  ['M5 اللوحةُ تبقى مفتوحةً لكل الصفوف', "_planCtlOpen = (_planCtlOpen === sid) ? null : sid;", "_planCtlOpen = sid;"],
  ['M6 تحديدُ المرحلة بالخيار', "ph === p[0], 'spc-c-ph'", "op === p[0], 'spc-c-ph'"],
  ['M7 المنجزُ يدخل البطاقات', "var all = planPlannedSessions();\n  var shared", "var all = sessions.filter(function(s){ return s; });\n  var shared"],
  ['M8 تلميحُ البديل غائب', "(op ? '<span class=\"spc-hint\">", "(false ? '<span class=\"spc-hint\">"],
  ['M9 الترتيبُ يتجاهل الخيار', "if (pa === 0) { var d = opt(a.s) - opt(b.s); if (d) return d; d = ph(a.s) - ph(b.s); if (d) return d; }", "if (pa === 0) { var d = ph(a.s) - ph(b.s); if (d) return d; }"]
];

const fails = assertions(SRC);
if (fails.length) { console.log('prove-plan-cards: ' + fails.length + ' فشل'); fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
const COUNT = (assertions.toString().match(/T\('/g) || []).length;
if (process.argv.includes('--self-test')) {
  let bite = 0;
  for (const [name, a, b] of MUTANTS) {
    if (!SRC.includes(a)) { console.log('prove-plan-cards: الطفرةُ ' + name + ' لا تجد هدفها'); process.exit(1); }
    const f = assertions(SRC.replace(a, b));
    if (f.length) bite++; else { console.log('prove-plan-cards: الطفرةُ لم تعضّ — ' + name); process.exit(1); }
  }
  console.log('prove-plan-cards ✅ ' + COUNT + ' توكيداً · ' + bite + '/' + MUTANTS.length + ' طفرة تعضّ');
} else {
  console.log('prove-plan-cards ✅ ' + COUNT + ' توكيداً');
}
