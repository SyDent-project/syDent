#!/usr/bin/env node
/* prove-ai-note-faith.js — v641: أمانةُ ملاحظة الجلسة بالمساعد الذكي.
   بلاغ المالك 15/10/2026: «حشوة كومبوزت» على السطحين الإنسي والوحشي للسن 11
   خرجت ملاحظتُها «زرع إنستري مركب». يُستخرج بلوك NOTE-FAITH من دالة ai-assist
   الحيّة كما هو (أنواعُ TS تُنزع بـstripTypeScriptTypes) ويُشغَّل على حالاتٍ
   حقيقية من مسارات المنصة، ثم يُتحقَّق من التوصيل: النموذج · البرومبت ·
   إعادةُ الكتابة · الرفضُ قبل الحقل · خريطةُ الخطأ بالعميل.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let strip;
try { const m = require('node:module'); strip = m.stripTypeScriptTypes; } catch (_e) {}
const _warn = process.emitWarning; process.emitWarning = () => {};

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };

function loadFaith(src) {
  const a = src.indexOf('// ═══ NOTE-FAITH BEGIN ═══'), b = src.indexOf('// ═══ NOTE-FAITH END ═══');
  if (a < 0 || b < a) throw new Error('NOTE-FAITH block missing');
  if (typeof strip !== 'function') throw new Error('node lacks stripTypeScriptTypes (needs Node ≥ 22.13)');
  const js = strip(src.slice(a, b)) + '\n;({ sessionNoteIssues, nfTreatmentCore, nfNorm });';
  return vm.runInNewContext(js, {});
}

// المدخلاتُ كما تبنيها المنصة: عنوانُ نافذة السن (🦷 بعد نزعه بالخادم) · نافذةُ الجلسة (النوع — الوصف)
const T11 = 'حشوة كومبوزت — السن 11 (السطح إنسي·وحشي)';
const CASES = [
  // [وصف, علاج, ملاحظات, مخرج, هل يجب أن يُرفض؟]
  ['بلاغ المالك حرفياً', T11, '', 'السن 11: زرع إنستري مركب على السطح الإنسي والوحشي.', true],
  ['مركّب بدل كومبوزت (تعريب)', T11, '', 'تم ترميم السن 11 بحشوة مركّبة على السطحين الإنسي والوحشي.', true],
  ['ملاحظة سليمة', T11, '', 'أُجريت حشوة كومبوزت للسن 11 على السطحين الإنسي والوحشي بعد إزالة النخر والعزل، وتم التشطيب والتلميع.', false],
  ['سليمة مع تنظيف النخر وتبطين قرب اللب', T11, 'نخر عميق', 'بعد تنظيف النخر العميق وتبطين القاع قرب اللب، أُجريت حشوة كومبوزت للسن 11 على السطحين الإنسي والوحشي.', false],
  ['سنٌّ مخترع', T11, '', 'أُجريت حشوة كومبوزت للسن 11 والسن 12 على السطحين الإنسي والوحشي.', true],
  ['معالجة لبية مخترعة', T11, '', 'أُجريت حشوة كومبوزت للسن 11 مع معالجة لبية سابقة.', true],
  ['RCT بكلمات الطبيب يسمح بالمعالجة اللبية', T11, 'RCT سابق', 'أُجريت حشوة كومبوزت للسن 11 على سنٍّ معالج لبياً سابقاً بمعالجة لبية.', false],
  ['نافذة الجلسة: تلبيس (تاج)', 'تلبيس (تاج) — السن رقم 26 — التاج كامل', '', 'تم تحضير السن 26 وأخذ الطبعة لتلبيس خزفي، مع بناء بحشوة كومبوزت قبل التحضير، وتركيب تاج مؤقت.', false],
  ['قناة جذر تسمح بحشو الأقنية والحشوة المؤقتة', 'قناة جذر — السن رقم 36 — الجذر', '', 'أُنجزت قناة جذر للسن 36: فتح الحجرة وتحضير الأقنية وحشو الأقنية، ووُضعت حشوة مؤقتة.', false],
  ['حشو الأقنية لا يُعدّ حشوة بمسار الحشوة', 'قناة جذر — السن رقم 36 — الجذر', '', 'أُنجزت قناة جذر للسن 36 مع حشو الأقنية بالكوتابيركا.', false],
  ['زرع داخل حشوة يُرفض حتى بصيغة الزرعة', 'حشوة — السن رقم 15 — السطح إطباقي', '', 'تم وضع حشوة للسن 15 تمهيداً للزرعة.', true],
  ['جسرٌ يسمح بتيجان الدعامات', '🔀 جسر (زركون) — جسر بديل (مخطّط) للأسنان 44، 45، 46'.replace(/^[^\p{L}\p{N}]+/u, ''), '', 'جسر زركون مخطّط للأسنان 44 و45 و46 بتيجان على الدعامتين 44 و46.', false],
  ['جسر بسنٍّ مخترع', 'جسر (زركون) — جسر يشمل الأسنان 44، 45، 46', '', 'جسر زركون على الأسنان 44، 45، 47.', true],
  ['زراعة سليمة', 'زراعة — السن رقم 15 — السن كاملاً', 'غرسة 4.3×11', 'تمت زراعة السن 15 بغرسة قطرها 4.3 وطولها 11 مم.', false],
  ['التاجيّ ليس تاجاً', T11, '', 'أُجريت حشوة كومبوزت للسن 11 على السطحين الإنسي والوحشي حتى الثلث التاجي.', false],
  ['أرقامٌ عربية مكافئة', 'حشوة كومبوزت — السن ١١ (السطح إنسي·وحشي)', '', 'أُجريت حشوة كومبوزت للسن 11 على السطحين الإنسي والوحشي.', false],
  ['همزاتٌ وتاءٌ مربوطة لا تُسقط الاسم', 'حشوة كومبوزت — السن 11', '', 'اجريت حشوه كومبوزت للسن 11.', false],
  ['عنوان «أخرى» بلا اسم إلزامي', 'أخرى', 'تعديل إطباق', 'أُجري تعديل إطباق بسيط.', false],
  ['السنةُ ليست سناً', T11, '', 'أُجريت حشوة كومبوزت للسن 11 على السطحين الإنسي والوحشي، سنة 2026.', false],
];

function suite(F) {
  const src = F['supabase/functions/ai-assist/index.ts'];
  let L;
  try { L = loadFaith(src); } catch (e) { ok(false, 'load: ' + e.message); return; }
  for (const [name, t, n, out, bad] of CASES) {
    let iss;
    try { iss = L.sessionNoteIssues(t, n, out); } catch (e) { ok(false, name + ': threw ' + e.message); continue; }
    ok(Array.isArray(iss) && (iss.length > 0) === bad, name + ' ⇒ ' + JSON.stringify(iss));
  }
  ok(L.nfTreatmentCore('🦷 حشوة كومبوزت — السن 11 (السطح إنسي·وحشي)') === 'حشوة كومبوزت', 'core from tooth-modal title');
  ok(L.nfTreatmentCore('تلبيس (تاج) — السن رقم 26') === 'تلبيس', 'core drops parenthetical');
  ok(L.nfTreatmentCore('أخرى') === '', 'generic «أخرى» has no core');
  const iss = L.sessionNoteIssues(T11, '', 'السن 11: زرع إنستري مركب على السطح الإنسي والوحشي.');
  ok(iss.some(x => /حشوة كومبوزت/.test(x)) && iss.some(x => /زرع/.test(x)), 'owner case names both the missing name and the foreign procedure');

  // التوصيل بالدالة
  ok(/const FEATURE_MODEL: Record<string, string> = \{\s+session_note: "claude-sonnet-5-5",\s+\};/.test(src), 'session_note uses the stronger model');
  ok(/\(r\.status === 400 \|\| r\.status === 404\) && usedModel !== AI_MODEL\)[\s\S]{0,200}usedModel = AI_MODEL;/.test(src), 'rejected model falls back to AI_MODEL');
  ok(/model: usedModel,\s+max_tokens: tokenCap,/.test(src), 'request uses the resolved model');
  ok(/model: usedModel,\s+input_tokens: usage\.input_tokens,/.test(src), 'usage logs the model actually used');
  ok(/\(8\) اذكر اسم العلاج المسجّل حرفياً/.test(src) && /\(9\) لا تذكر أي إجراء علاجي آخر/.test(src), 'prompt: verbatim name + no foreign procedure');
  ok(/let issues = sessionNoteIssues\(noteTreatment, noteRough, aiText\);/.test(src), 'first draft is checked');
  ok(/const second = await runModel\(userContent \+/.test(src), 'one rewrite with a correction');
  ok(/issues = aiText \? sessionNoteIssues\(noteTreatment, noteRough, aiText\) : \[\];/.test(src), 'rewrite is re-checked');
  const iU = src.indexOf('if (unfaithful) return json(422, { error: "ai_unfaithful" });'), iOk = src.indexOf('return json(200, { text: aiText });');
  ok(iU > 0 && iOk > iU, 'unfaithful draft never returned as text');
  ok(/noteTreatment = treatment; noteRough = rough;/.test(src), 'checker sees the same inputs as the model');
  ok(/const treatment = String\(input\?\.treatment \|\| ""\)\.replace\(\/\^\[\^\\p\{L\}\\p\{N\}\]\+\/u, ""\)/.test(src), 'leading emoji stripped from the treatment');
  const iLvl = src.indexOf('admin.rpc("tenant_access_level", { p_uid: ownerId })'), iAnth = src.indexOf('api.anthropic.com');
  ok(iLvl > 0 && iAnth > iLvl, 'Anthropic still called only after the subscription gate');
  ok(/ai_unfaithful: '/.test(F['pp-extras.js']), 'client maps ai_unfaithful to a clear toast');
}

const FILES = ['supabase/functions/ai-assist/index.ts', 'pp-extras.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const FN = 'supabase/functions/ai-assist/index.ts';
const MUTANTS = [
  ['name check removed', rep(FN, 'if (core && outN.indexOf(nfNorm(core)) < 0) issues.push', 'if (false) issues.push')],
  ['implant family dropped', rep(FN, 'nfWord("زرع|زرعه|زرعات|زراعه|زراعات|غرسه|غرسات")', 'nfWord("غرسات")')],
  ['no word boundary (التاجي = تاج)', rep(FN, '(?<![\\\\u0621-\\\\u064A])[وفبلك]?(?:ال|لل)?(?:" + stems + ")(?![\\\\u0621-\\\\u064A])', '(?:" + stems + ")')],
  ['endo no longer implies filling', rep(FN, 'la: /\\b(?:rct|endo|root canal|pulpotomy|pulpectomy)\\b/i, implies: ["filling"]', 'la: /\\b(?:rct|endo|root canal|pulpotomy|pulpectomy)\\b/i, implies: []')],
  ['tooth numbers unchecked', rep(FN, 'if (!inNums[n] && !seen[n])', 'if (false)')],
  ['digits not normalised', rep(FN, '.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))', '')],
  ['numbers read without a tooth word', rep(FN, 'const NF_TOOTH_RUN = /(?:سن|اسنان|ضرس|اضراس|رحي|ناب|قاطع|ثنيه|ضاحك)(?:ين|ان)?(?: رقم| رقمي)?:? ?(', 'const NF_TOOTH_RUN = /(')],
  ['back to Haiku', rep(FN, 'session_note: "claude-sonnet-5-5",', 'session_note: "claude-haiku-4-5-20251001",')],
  ['no fallback', rep(FN, 'usedModel = AI_MODEL;\n          continue;', 'break;')],
  ['no rewrite', rep(FN, 'const second = await runModel(userContent +', 'const second = await Promise.resolve({ text: aiText, error: "" }) || (userContent +')],
  ['unfaithful text returned', rep(FN, 'if (unfaithful) return json(422, { error: "ai_unfaithful" });', '')],
  ['prompt rule 8 removed', rep(FN, '(8) اذكر اسم العلاج المسجّل حرفياً', '(8) اذكر العلاج')],
  ['client map missing', rep('pp-extras.js', "ai_unfaithful: '", "ai_x: '")],
];

suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0;
    const log = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-ai-note-faith: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-ai-note-faith: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
