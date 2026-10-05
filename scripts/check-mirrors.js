#!/usr/bin/env node
/* =====================================================================
 * SyDent — check-mirrors.js  (حارس المرايا، Rule #211 + نمط 4-copy)
 *
 * يثبت أن كل "مجموعات المرايا" متطابقة:
 *   A) مطبّعات الهاتف ×4 (سلوكياً على متجهات ثابتة):
 *      appointments.normalizePhone · book.normalizePhone ·
 *      patients.prmNormalizePhone · patient-profile.ppNormalizePhone
 *   B) القوالب الافتراضية (بايت-بايت على القيمة المُقيَّمة):
 *      تذكير: settings.DEFAULT_WA_TEMPLATE ↔ appointments.DEFAULT_WA_TEMPLATE
 *      استدعاء: settings.DEFAULT_RECALL_TEMPLATE ↔ patients.DEFAULT_RECALL_TPL ↔
 *               patient-profile.PP_DEFAULT_RECALL_TPL
 *      ميلاد: settings.DEFAULT_BIRTHDAY_TEMPLATE ↔ patients.DEFAULT_BDAY_TPL
 *   C) أدوات ذيل المراجعات (سلوكياً على متجهات ثابتة):
 *      prmFmtNum↔fmtDNum · prmWatchTeeth↔ppWatchTeeth · prmWatchByDate↔ppWatchByDate
 *
 * الاستخدام: node scripts/check-mirrors.js   (من جذر الريبو)
 * الخروج: 0 = كل المرايا متطابقة · 1 = كسر بمرآة واحدة على الأقل
 * =================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const ok = m => console.log('  ✓ ' + m);
const bad = m => { failures++; console.log('  ✗ ' + m); };
const ASYNC_CHECKS = [];   // v332: فحوصٌ سلوكية غير متزامنة — الحكمُ النهائي ينتظرها

/* ── استخراج دالة باسمها بموازنة الأقواس (يتخطى السلاسل/التعليقات/regex) ── */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('لم أجد function ' + name);
  let i = src.indexOf('{', start);
  if (i < 0) throw new Error('لا { لـ ' + name);
  let depth = 0, inS = null, inLC = false, inBC = false, inRe = false, prev = '';
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && n === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === '\\') { i++; continue; } if (c === inS) inS = null; continue; }
    if (inRe) { if (c === '\\') { i++; continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { inLC = true; i++; continue; }
    if (c === '/' && n === '*') { inBC = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '/' && /[=(,:[!&|?;{}\n]/.test(prev)) { inRe = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('أقواس غير متوازنة عند ' + name);
}

/* ── استخراج قيمة ثابت نصي (const/var NAME = <expr>;) وتقييمها ── */
function extractConstValue(src, name) {
  const re = new RegExp('(?:const|var|let)\\s+' + name + '\\s*=');
  const m = re.exec(src);
  if (!m) throw new Error('لم أجد الثابت ' + name);
  let i = m.index + m[0].length, expr = '', inS = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inS) { expr += c; if (c === '\\') { expr += src[++i]; continue; } if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; expr += c; continue; }
    if (c === ';') break;
    expr += c;
  }
  return vm.runInNewContext('(' + expr + ')', {});
}

function compileFns(src, names) {
  const code = names.map(n => extractFunction(src, n)).join('\n');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__x = { ' + names.map(n => n + ': ' + n).join(', ') + ' };', sandbox);
  return sandbox.__x;
}

const J = v => JSON.stringify(v);

/* ═══ A) مطبّعات الهاتف ×4 ═══ */
console.log('A) مطبّعات الهاتف (6-COPY MIRROR):');
try {
  const impls = {
    'appointments.normalizePhone': compileFns(read('appt-wa.js'), ['normalizePhone']).normalizePhone,
    'book.normalizePhone':         compileFns(read('book.html'), ['normalizePhone']).normalizePhone,
    'patients.prmNormalizePhone':  compileFns(read('patients.html'), ['prmNormalizePhone']).prmNormalizePhone,
    'patient-profile.ppNormalizePhone': compileFns(read('pp-wa.js'), ['ppNormalizePhone']).ppNormalizePhone,
    'labs.labAiNormPhone':         compileFns(read('labs.html'), ['labAiNormPhone']).labAiNormPhone,
    'pp-clinical.labAiNormPhone':  compileFns(read('pp-clinical.js'), ['labAiNormPhone']).labAiNormPhone,
  };
  const vectors = [
    '0991234567', '+963 99 123 4567', '00963991234567', '963991234567',
    '991234567', '011 2345678', '0212345678', '+90 532 123 4567',
    '05321234567', '0101234567890', '1234', 'abc', '', null, undefined,
    '  0991-234-567  ', '+1 (415) 555-2671',
  ];
  const names = Object.keys(impls);
  let mism = 0;
  for (const v of vectors) {
    const outs = names.map(n => J(impls[n](v)));
    if (new Set(outs).size !== 1) {
      mism++;
      bad(`تباعد على المدخل ${J(v)}: ` + names.map((n, i) => `${n}=${outs[i]}`).join(' · '));
    }
  }
  if (!mism) ok(`6/6 نسخ متطابقة سلوكياً على ${vectors.length} متجهاً`);
} catch (e) { bad('فشل الاستخراج/التقييم: ' + e.message); }

/* ═══ B) القوالب الافتراضية (بايت-بايت) ═══ */
console.log('B) القوالب الافتراضية (بايت-بايت):');
function tplSet(label, entries) {
  try {
    const vals = entries.map(([file, cname]) => ({ id: file + '.' + cname, v: extractConstValue(read(file), cname) }));
    const first = vals[0].v;
    const diff = vals.filter(x => x.v !== first);
    if (diff.length) {
      bad(`${label}: تباعد بايت-بايت — ` + vals.map(x => `${x.id}=${x.v.length} محرفاً`).join(' · '));
    } else {
      ok(`${label}: ${vals.length} نسخ متطابقة (${first.length} محرفاً)`);
    }
  } catch (e) { bad(`${label}: ` + e.message); }
}
tplSet('تذكير الموعد', [['settings.html', 'DEFAULT_WA_TEMPLATE'], ['appt-wa.js', 'DEFAULT_WA_TEMPLATE']]);
tplSet('الاستدعاء الدوري', [['settings.html', 'DEFAULT_RECALL_TEMPLATE'], ['patients.html', 'DEFAULT_RECALL_TPL'], ['pp-wa.js', 'PP_DEFAULT_RECALL_TPL']]);
tplSet('عيد الميلاد', [['settings.html', 'DEFAULT_BIRTHDAY_TEMPLATE'], ['patients.html', 'DEFAULT_BDAY_TPL']]);
tplSet('تذكير القسط', [['settings.html', 'DEFAULT_INSTALLMENT_TEMPLATE'], ['patients.html', 'DEFAULT_INST_TPL'], ['pp-plan.js', 'PP_DEFAULT_INST_TPL']]);
tplSet('التقييم', [['settings.html', 'DEFAULT_REVIEW_TEMPLATE'], ['pp-wa.js', 'PP_DEFAULT_REVIEW_TPL']]);

/* ═══ C) أدوات ذيل المراجعات prm↔pp ═══ */
console.log('C) أدوات ذيل المراجعات (prm↔pp):');
try {
  const prm = compileFns(read('patients.html'), ['prmFmtNum', 'prmWatchTeeth', 'prmWatchByDate', 'prmYmdLocal']);
  const pp  = Object.assign({},
    compileFns(read('pp-core.js'), ['fmtDNum', 'ppYmdLocal']),
    compileFns(read('pp-wa.js'), ['ppWatchTeeth', 'ppWatchByDate']));   /* الاستخراج ٧: المراقبات في pp-wa.js */

  // v99: مطابقة التاريخ المحلي على تواريخ ثابتة (منها ما بعد منتصف الليل المحلي)
  const dateVecs = [new Date(2026, 9, 3, 1, 30), new Date(2026, 0, 1, 0, 5), new Date(2026, 11, 31, 23, 59), new Date(2026, 6, 4, 12, 0)];
  let m0 = 0;
  for (const dv of dateVecs) {
    if (prm.prmYmdLocal(dv) !== pp.ppYmdLocal(dv)) { m0++; bad('YmdLocal تباعد على ' + dv.toString()); }
  }
  if (prm.prmYmdLocal() !== pp.ppYmdLocal()) { m0++; bad('YmdLocal تباعد بلا وسيط'); }
  if (!m0) ok('prmYmdLocal↔ppYmdLocal متطابقتان على ' + (dateVecs.length + 1) + ' متجهات');

  const isoVecs = ['2026-10-03', '2026-01-15T00:00:00', '2026-7-4', '', null, 'garbage', '2026-12-31'];
  let m1 = 0;
  for (const v of isoVecs) {
    if (J(prm.prmFmtNum(v)) !== J(pp.fmtDNum(v))) { m1++; bad(`fmt تباعد على ${J(v)}: prm=${J(prm.prmFmtNum(v))} pp=${J(pp.fmtDNum(v))}`); }
  }
  if (!m1) ok(`prmFmtNum↔fmtDNum متطابقتان على ${isoVecs.length} متجهاً`);

  const rowVecs = [
    [],
    null,
    [{ tooth_num: 26, review_at: '2026-10-03' }, { tooth_num: 26, review_at: '2026-10-03' }, { tooth_num: 26, review_at: '2026-10-03' }],
    [{ tooth_num: 37, review_at: null }, { tooth_num: 12, review_at: '2026-10-02' }, { tooth_num: 11, review_at: '2026-10-02' }, { tooth_num: 48, review_at: '2026-09-01' }],
    [{ tooth_num: '8', review_at: '' }, { tooth_num: 8, review_at: '' }],
    [{ tooth_num: 14, review_at: '2027-01-01' }, { tooth_num: 15, review_at: '2026-05-05' }, { tooth_num: 14, review_at: '2026-05-05' }],
  ];
  let m2 = 0, m3 = 0;
  rowVecs.forEach((v, i) => {
    if (J(prm.prmWatchTeeth(v)) !== J(pp.ppWatchTeeth(v))) { m2++; bad(`WatchTeeth تباعد على المتجه #${i}`); }
    if (J(prm.prmWatchByDate(v)) !== J(pp.ppWatchByDate(v))) { m3++; bad(`WatchByDate تباعد على المتجه #${i}`); }
  });
  if (!m2) ok(`prmWatchTeeth↔ppWatchTeeth متطابقتان على ${rowVecs.length} متجهات`);
  if (!m3) ok(`prmWatchByDate↔ppWatchByDate متطابقتان على ${rowVecs.length} متجهات`);
} catch (e) { bad('فشل الاستخراج/التقييم: ' + e.message); }

/* ── D2) Backlog #3: اشتقاق الأقساط prm↔pp (سلوكياً) ────────────────────
 *    prmPlanAddPeriod↔ppPlanAddPeriod + prmPlanCalc↔ppPlanCalc — أي تباعد
 *    يعني استحقاقاً مختلفاً بين قائمة المتابعة وبطاقة المريض. */
console.log('— مرآة اشتقاق الأقساط (prm↔pp) —');
try {
  const prmP = compileFns(read('patients.html'), ['prmPlanAddPeriod', 'prmPlanCalc']);
  const ppP  = compileFns(read('pp-plan.js'), ['ppPlanAddPeriod', 'ppPlanCalc']);
  const agP  = compileFns(read('acc-aging.js'), ['agPlanAddPeriod', 'agPlanCalc']);   // v507: النسخة الثالثة (تقادم الذمم)

  const apVecs = [
    ['2026-01-31', 'monthly', 1],   // قصّ نهاية الشهر → 2026-02-28
    ['2024-01-31', 'monthly', 1],   // سنة كبيسة → 2024-02-29
    ['2026-01-31', 'monthly', 3],
    ['2026-11-15', 'monthly', 2],   // عبور السنة
    ['2026-03-01', 'weekly', 5],
    ['2026-03-01', 'biweekly', 3],
    ['2026-07-19', 'monthly', 0],   // k=0 → التاريخ نفسه
  ];
  let mp0 = 0;
  apVecs.forEach((v, i) => {
    if (prmP.prmPlanAddPeriod(v[0], v[1], v[2]) !== ppP.ppPlanAddPeriod(v[0], v[1], v[2]) ||
        prmP.prmPlanAddPeriod(v[0], v[1], v[2]) !== agP.agPlanAddPeriod(v[0], v[1], v[2])) {
      mp0++; bad(`PlanAddPeriod تباعد على المتجه #${i}`);
    }
  });
  if (!mp0) ok(`prmPlanAddPeriod↔ppPlanAddPeriod↔agPlanAddPeriod متطابقات على ${apVecs.length} متجهات`);

  const planA = { total: 1200000, installment_amount: 100000, frequency: 'monthly', start_date: '2026-01-15' };
  const paysA = [
    { amount: 100000, date: '2026-01-15' },
    { amount: 100000, date: '2026-02-14' },
    { amount: 50000,  date: '2026-03-20' },
    { amount: 999999, date: '2025-12-01' },   // قبل البداية — تُهمل
  ];
  const calcVecs = [
    [planA, paysA, '2026-07-19'],
    [planA, [], '2026-07-19'],
    [planA, null, '2026-01-15'],
    [{ total: 300000, installment_amount: 100000, frequency: 'weekly', start_date: '2026-06-01' },
      [{ amount: 300000, date: '2026-06-01' }], '2026-07-19'],   // مغطاة بالكامل
    [{ total: 100000, installment_amount: 40000, frequency: 'biweekly', start_date: '2026-06-01' },
      [{ amount: 40000, created_at: '2026-06-01T09:00:00Z' }], '2026-07-19'],   // fallback على created_at
    // قاعدة #481: بلا متجه مخلوط يبقى بُعد العملة خارج المرآة — تنحرف نسخةٌ
    // عن أختها بالطيّ وتبقى الخمسة الأولى متطابقة فيمرّ الحارس أخضر.
    [{ total: 1000, installment_amount: 250, frequency: 'monthly', start_date: '2026-01-01', currency: 'USD' },
      [{ amount: 250, date: '2026-01-05', currency: 'USD' },
       { amount: 900000, date: '2026-01-06', currency: 'SYP' }], '2026-07-01'],
    [{ total: 1000000, installment_amount: 250000, frequency: 'monthly', start_date: '2026-01-01', currency: 'SYP' },
      [{ amount: 250, date: '2026-01-05', currency: 'USD' },
       { amount: 900000, date: '2026-01-06', currency: 'SYP' }], '2026-07-01'],
  ];
  let mp1 = 0;
  calcVecs.forEach((v, i) => {
    if (J(prmP.prmPlanCalc(v[0], v[1], v[2])) !== J(ppP.ppPlanCalc(v[0], v[1], v[2])) ||
        J(prmP.prmPlanCalc(v[0], v[1], v[2])) !== J(agP.agPlanCalc(v[0], v[1], v[2]))) {
      mp1++; bad(`PlanCalc تباعد على المتجه #${i}`);
    }
  });
  if (!mp1) ok(`prmPlanCalc↔ppPlanCalc↔agPlanCalc متطابقات على ${calcVecs.length} متجهات`);
} catch (e) { bad('فشل استخراج اشتقاق الأقساط: ' + e.message); }

/* ── E) مرآة theme-color (بايت-بايت على زوج الألوان dark/light) ─────────
 *    theme.js.applyTheme ↔ sidebar.js.applyMode — كلاهما يكتب نفس الميتا
 *    <meta name="theme-color">؛ أي تباعد = وميض لون بشريط عنوان التطبيق
 *    المثبّت وشريط حالة الموبايل. */
console.log('— مرآة theme-color —');
try {
  const TC_RE = /meta\.setAttribute\('content',\s*(?:mode|m)\s*===\s*'dark'\s*\?\s*'(#[0-9a-fA-F]{6})'\s*:\s*'(#[0-9a-fA-F]{6})'\s*\)/g;
  function tcPair(file) {
    const src = read(file);
    const hits = [...src.matchAll(TC_RE)];
    if (hits.length !== 1) throw new Error(`${file}: توقعت سطر theme-color واحداً، وجدت ${hits.length}`);
    return { dark: hits[0][1].toLowerCase(), light: hits[0][2].toLowerCase() };
  }
  const t = tcPair('theme.js'), s = tcPair('sidebar.js');
  if (t.dark !== s.dark || t.light !== s.light) {
    bad(`theme-color تباعد: theme.js(${t.dark}/${t.light}) ≠ sidebar.js(${s.dark}/${s.light})`);
  } else {
    ok(`theme.js↔sidebar.js متطابقان (dark ${t.dark} · light ${t.light})`);
  }
} catch (e) { bad('فشل استخراج theme-color: ' + e.message); }

/* ── F) M87: التحذيرات الطبية ×4 (v514: + huddle-flags.js) ──────────────────────────────────────
 *    MEDICAL_FLAGS_DEFS (JSON بايت-بايت) + medFlagLabels (سلوكياً)
 *    عبر patients.html ↔ patient-profile.html ↔ appointments.html. */
/* ── G) Backlog #4: مصدر المريض ×2 ────────────────────────────────────
 *    REFERRAL_SOURCE_DEFS (JSON بايت-بايت) + refSourceLabel (سلوكياً)
 *    عبر patients.html ↔ patient-profile.html. */
console.log('G) مصدر المريض (2-COPY MIRROR):');
try {
  const rsFiles = ['patients.html', 'patient-profile.html'];
  const rsDefs = rsFiles.map(f => ({ id: f, v: JSON.stringify(extractConstValue(read(f), 'REFERRAL_SOURCE_DEFS')) }));
  const rsFirst = rsDefs[0].v;
  const rsDiff = rsDefs.filter(x => x.v !== rsFirst);
  if (rsDiff.length) {
    bad('REFERRAL_SOURCE_DEFS تباعد: ' + rsDefs.map(x => `${x.id}=${x.v.length} محرفاً`).join(' · '));
  } else {
    ok(`REFERRAL_SOURCE_DEFS: 2 نسخ متطابقة (${JSON.parse(rsFirst).length} مصادر)`);
  }
  const rsImpls = rsFiles.map(f => {
    const src = read(f);
    const code = extractFunction(src, 'refSourceLabel');
    const sandbox = { REFERRAL_SOURCE_DEFS: extractConstValue(src, 'REFERRAL_SOURCE_DEFS') };
    vm.createContext(sandbox);
    vm.runInContext(code + '\nthis.__f = refSourceLabel;', sandbox);
    return { id: f, fn: sandbox.__f };
  });
  const rsVecs = ['friend', 'search', 'social', 'walk_in', 'doctor_referral', 'booking', 'other',
    'unknown_key', '', null, undefined, 42];
  let rsMism = 0;
  for (const v of rsVecs) {
    const outs = rsImpls.map(x => J(x.fn(v)));
    if (new Set(outs).size !== 1) { rsMism++; bad(`refSourceLabel تباعد على ${J(v)}`); }
  }
  if (!rsMism) ok(`refSourceLabel: 2 نسخ متطابقة سلوكياً على ${rsVecs.length} متجهاً`);
} catch (e) { bad('فشل استخراج مصدر المريض: ' + e.message); }

console.log('F) التحذيرات الطبية (4-COPY MIRROR):');
try {
  const mfFiles = ['patients.html', 'patient-profile.html', 'appointments.html', 'huddle-flags.js'];   // v514: النسخةُ الرابعة — أعلامُ الهدل باللوحة
  const defs = mfFiles.map(f => ({ id: f, v: JSON.stringify(extractConstValue(read(f), 'MEDICAL_FLAGS_DEFS')) }));
  const firstD = defs[0].v;
  const dDiff = defs.filter(x => x.v !== firstD);
  if (dDiff.length) {
    bad('MEDICAL_FLAGS_DEFS تباعد: ' + defs.map(x => `${x.id}=${x.v.length} محرفاً`).join(' · '));
  } else {
    ok(`MEDICAL_FLAGS_DEFS: ${mfFiles.length} نسخ متطابقة (${JSON.parse(firstD).length} أعلام)`);
  }
  const mfImpls = mfFiles.map(f => {
    const src = read(f);
    const code = extractFunction(src, 'medFlagLabels');
    const sandbox = { MEDICAL_FLAGS_DEFS: extractConstValue(src, 'MEDICAL_FLAGS_DEFS') };
    vm.createContext(sandbox);
    vm.runInContext(code + '\nthis.__f = medFlagLabels;', sandbox);
    return { id: f, fn: sandbox.__f };
  });
  const mfVecs = [null, undefined, [], ['diabetes'], ['diabetes','pregnancy'],
    ['unknown_key'], ['diabetes','unknown','asthma'], 'notarray', 42,
    ['drug_allergy','penicillin_allergy','anticoagulants']];
  let mfMism = 0;
  for (const v of mfVecs) {
    const outs = mfImpls.map(x => J(x.fn(v)));
    if (new Set(outs).size !== 1) { mfMism++; bad(`medFlagLabels تباعد على ${J(v)}`); }
  }
  if (!mfMism) ok(`medFlagLabels: ${mfFiles.length} نسخ متطابقة سلوكياً على ${mfVecs.length} متجهات`);

  /* فصل الحساسيات (M92-era): ALLERGY_FLAGS_DEFS بايت-بايت + allergyFlagLabels/warnParts/allergyParts سلوكياً ×3 */
  const aDefs = mfFiles.map(f => ({ id: f, v: JSON.stringify(extractConstValue(read(f), 'ALLERGY_FLAGS_DEFS')) }));
  const aFirst = aDefs[0].v;
  if (aDefs.filter(x => x.v !== aFirst).length) {
    bad('ALLERGY_FLAGS_DEFS تباعد: ' + aDefs.map(x => `${x.id}=${x.v.length} محرفاً`).join(' · '));
  } else {
    ok(`ALLERGY_FLAGS_DEFS: ${mfFiles.length} نسخ متطابقة (${JSON.parse(aFirst).length} أعلام)`);
  }
  const cmbImpls = mfFiles.map(f => {
    const src = read(f);
    const code = extractFunction(src, 'medFlagLabels') + '\n' +
                 extractFunction(src, 'allergyFlagLabels') + '\n' +
                 extractFunction(src, 'warnParts') + '\n' +
                 extractFunction(src, 'allergyParts');
    const sandbox = {
      MEDICAL_FLAGS_DEFS: extractConstValue(src, 'MEDICAL_FLAGS_DEFS'),
      ALLERGY_FLAGS_DEFS: extractConstValue(src, 'ALLERGY_FLAGS_DEFS')
    };
    vm.createContext(sandbox);
    vm.runInContext(code + '\nthis.__x = { allergyFlagLabels, warnParts, allergyParts };', sandbox);
    return { id: f, x: sandbox.__x };
  });
  const recVecs = [
    null, undefined, {}, 42,
    { medical_flags: ['penicillin_allergy'] },
    { medical_flags: ['drug_allergy', 'diabetes'], allergies: 'لاتكس' },
    { medical_flags: ['penicillin_allergy'], allergies: 'بنسلين' },
    { medical_flags: [], allergies: 'لا يوجد' },
    { medical_flags: ['diabetes'], medical_flags_other: '  غسيل كلى  ' },
    { medical_flags: null, medical_flags_other: 'صرع', allergies: 'يود' },
    { medical_flags: ['unknown', 'asthma', 'drug_allergy'], medical_flags_other: '', allergies: '' }
  ];
  let cmbMism = 0;
  for (const fn of ['allergyFlagLabels', 'warnParts', 'allergyParts']) {
    for (const v of recVecs) {
      const outs = cmbImpls.map(i => J(fn === 'allergyFlagLabels' ? i.x[fn](v && v.medical_flags) : i.x[fn](v)));
      if (new Set(outs).size !== 1) { cmbMism++; bad(`${fn} تباعد على ${J(v)}`); }
    }
  }
  if (!cmbMism) ok(`allergyFlagLabels/warnParts/allergyParts: ${mfFiles.length} نسخ متطابقة سلوكياً على ${recVecs.length} متجهاً`);
} catch (e) { bad('فشل استخراج التحذيرات الطبية: ' + e.message); }

/* ── H) قائمة ميزات الخطة ×3 ──────────────────────────────────────────
 *    planFeatureItems + planVisibleFeatures (بايت-بايت وسلوكياً)
 *    عبر admin-plans.js ↔ subscription.html ↔ landing.html.
 *    (كانت admin.html حتى تفكيك admin — حزام A1، 27 تموز 2026.)
 *    العنصر إمّا نص (ظاهر — الشكل القديم) أو { t, h:true } (مخفي). */
console.log('H) قائمة ميزات الخطة (3-COPY MIRROR):');
try {
  const pfFiles = ['admin-plans.js', 'subscription.html', 'landing.html'];
  const pfNames = ['planFeatureItems', 'planVisibleFeatures'];
  for (const nm of pfNames) {
    const bodies = pfFiles.map(f => ({ id: f, v: extractFunction(read(f), nm).replace(/^[ \t]+/gm, '') }));
    const firstB = bodies[0].v;
    if (bodies.filter(x => x.v !== firstB).length) {
      bad(`${nm} تباعد بايت-بايت: ` + bodies.map(x => `${x.id}=${x.v.length} محرفاً`).join(' · '));
    } else {
      ok(`${nm}: 3 نسخ متطابقة بايت-بايت (${firstB.length} محرفاً)`);
    }
  }
  const pfImpls = pfFiles.map(f => {
    const src = read(f);
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(src, 'planFeatureItems') + '\n' +
                    extractFunction(src, 'planVisibleFeatures') +
                    '\nthis.__i = planFeatureItems; this.__v = planVisibleFeatures;', sandbox);
    return { id: f, items: sandbox.__i, vis: sandbox.__v };
  });
  const pfVecs = [
    null, undefined, [], 'notarray', 42,
    ['أ', 'ب', 'ج'],                                   /* الشكل القديم بالكامل */
    [{ t: 'أ', h: true }, 'ب'],                        /* مختلط */
    [{ t: 'أ', h: false }, { t: 'ب', h: true }],       /* كائنات فقط */
    [{ t: 'أ' }],                                      /* كائن بلا h */
    ['', '  ', 'ج'],                                   /* فراغات تُستبعد من الظاهر */
    [{ t: '', h: true }, ''],                          /* كلها فارغة */
    [null, undefined, 0, false, 'د'],                  /* قيم شاذة */
    [['متداخلة'], { t: 'هـ', h: 'true' }],             /* مصفوفة داخلية + h نصية (ليست true) */
    Array.from({ length: 9 }, (_, i) => 'ميزة ' + (i + 1))
  ];
  let pfMism = 0;
  for (const v of pfVecs) {
    const oi = pfImpls.map(x => J(x.items(v)));
    if (new Set(oi).size !== 1) { pfMism++; bad(`planFeatureItems تباعد على ${J(v)}`); }
    const ov = pfImpls.map(x => J(x.vis(v)));
    if (new Set(ov).size !== 1) { pfMism++; bad(`planVisibleFeatures تباعد على ${J(v)}`); }
  }
  if (!pfMism) ok(`planFeatureItems/planVisibleFeatures: 3 نسخ متطابقة سلوكياً على ${pfVecs.length} متجهاً`);
} catch (e) { bad('فشل استخراج قائمة الميزات: ' + e.message); }

/* ── J) طبقة العناصر النائبة/رابط الحجز للواتساب (prm↔pp، سلوكياً) ───────
 *    السبب المباشر لوجود هذا القسم: انحدار حقيقي (٢٨ تموز ٢٠٢٦) — رسالة
 *    الاستدعاء المولَّدة وصلت بلا رابط الحجز بينما القالب الثابت يحمله، لأن
 *    مسارَي الرسائل الموجَّهة للمريض نسختان متوازيتان بلا حارس. أي تباعد هنا
 *    يعني رسالةً مختلفة بين بطاقة المريض وقائمة المتابعة. */
console.log('— مرآة العناصر النائبة ورابط الحجز (prm↔pp) —');
try {
  const alImpls = [
    { n: 'pp', f: compileFns(read('pp-wa.js'), ['ppWaAllowList']).ppWaAllowList },
    { n: 'prm', f: compileFns(read('patients.html'), ['prmWaAllowList']).prmWaAllowList },
  ];
  const alVecs = [
    { patient_name: 'س', patient_first_name: 'س', clinic_name: 'ع', clinic_phone: '011', booking_link: 'https://x/book.html?c=1' },
    { patient_name: 'س', patient_first_name: 'س', clinic_name: 'ع', clinic_phone: '011', booking_link: '' },
    { patient_name: 'س', patient_first_name: 'س', clinic_name: 'ع', clinic_phone: '', booking_link: 'L',
      installment_amount: '100', due_date: '1/1/2026', remaining_total: '900' },
    {}, null, undefined,
    { booking_link: 'L' },
    { patient_name: 'س' },
    /* عيادة لم تُعبّئ رقمها ولا حجزها — كل الوسائل فارغة */
    { patient_name: 'س', patient_first_name: 'س', clinic_name: 'ع', clinic_phone: '', booking_link: '' },
    /* قيم null/undefined لا تُعامَل كموجودة */
    { clinic_phone: null, booking_link: undefined, clinic_name: 'ع' },
    /* الصفر قيمة مشروعة ويجب ألّا يُسقَط */
    { remaining_total: 0, clinic_name: 'ع' },
  ];
  let alMism = 0;
  alVecs.forEach((v, i) => {
    const outs = alImpls.map(x => J(x.f(v)));
    if (new Set(outs).size !== 1) { alMism++; bad(`AllowList تباعد على المتجه #${i}: ${outs.join(' ≠ ')}`); }
  });
  /* عقود ثابتة لا تُكسَر بصمت حتى لو تطابقت النسختان على الخطأ نفسه */
  const full = alVecs[0], off = alVecs[1], noMeans = alVecs[8], zero = alVecs[10];
  alImpls.forEach(x => {
    if (J(x.f(full)).indexOf('patient_name') !== -1) { alMism++; bad(`${x.n}: اسم المريض تسرّب للقائمة (عقد {الاسم})`); }
    if (J(x.f(full)).indexOf('booking_link') === -1) { alMism++; bad(`${x.n}: رابط الحجز مفقود رغم توفّره`); }
    if (J(x.f(off)).indexOf('booking_link') !== -1) { alMism++; bad(`${x.n}: رابط الحجز مُقترَح رغم أنه مطفأ`); }
    /* العقد الحاسم: عنصر بقيمة فارغة لا يُقترَح إطلاقاً — وإلا أنتج النموذج
       سطراً مبتوراً («للاستفسار: ») بعد الحلّ لدى كل عيادة بلا رقم. */
    if (J(x.f(noMeans)).indexOf('clinic_phone') !== -1) { alMism++; bad(`${x.n}: رقم عيادة فارغ مُقترَح على النموذج`); }
    if (J(x.f(noMeans)) !== '["{clinic_name}"]') { alMism++; bad(`${x.n}: بلا وسائل ⇒ يجب أن يبقى اسم العيادة وحده`); }
    if (J(x.f(zero)).indexOf('remaining_total') === -1) { alMism++; bad(`${x.n}: الصفر أُسقط وهو قيمة مشروعة`); }
  });
  if (!alMism) ok(`ppWaAllowList↔prmWaAllowList متطابقتان سلوكياً على ${alVecs.length} متجهات + 3 عقود`);

  /* شطب سطر {booking_link} حين الحجز مطفأ — الدالتان تقرآن globals مختلفة،
     فتُقيَّمان بسابقة تُثبّت العلم بكل ملف على حدة. */
  const mkStrip = (file, fname, preamble) => {
    const sb = {}; vm.createContext(sb);
    vm.runInContext(preamble + '\n' + extractFunction(read(file), fname) +
      `\nthis.__f = ${fname};`, sb);
    return sb.__f;
  };
  const stripVecs = [
    'مرحباً\n📅 احجز: {booking_link}\nشكراً',
    '{booking_link}',
    'بلا رابط إطلاقاً',
    'أ\n\n\nب\n{booking_link}\n\n',
    '', null, undefined,
    '{booking_link}\n{booking_link}\nتذييل',
  ];
  let stMism = 0;
  [[true, 'مفعّل'], [false, 'مطفأ']].forEach(([on, label]) => {
    const ppF  = mkStrip('pp-wa.js', 'ppStripBookingIfDisabled',
      `var CLINIC_SETTINGS_WA = { booking_enabled: ${on} }; var PP_BOOKING_PLAN_OK = true;`);
    const prmF = mkStrip('patients.html', 'prmStripBookingIfDisabled',
      `var PRM_BOOKING_ENABLED = ${on};`);
    stripVecs.forEach((v, i) => {
      if (J(ppF(v)) !== J(prmF(v))) {
        stMism++; bad(`StripBooking تباعد (${label}) على المتجه #${i}: ${J(ppF(v))} ≠ ${J(prmF(v))}`);
      }
    });
  });
  if (!stMism) ok(`ppStripBookingIfDisabled↔prmStripBookingIfDisabled متطابقتان على ${stripVecs.length} متجهات ×2 حالة`);

  /* M109: بنّاء خيارات القوالب — بايت-بايت + سلوكياً (الهارب مُمرَّر كبارامتر) */
  /* M130.4: تجريدُ اسم المريض عقدٌ أمنيّ لا تجميليّ — انحرافُ سطحٍ عنه يعني
     أن قالباً يُحفظ باسمٍ مخبوز على سطحٍ ويُجرَّد على الآخر، فيصل مريضاً تحيةٌ
     باسم غيره بلا أي خطأ يُرمى. النسختان بايت-بايت + عقدٌ سلوكيّ منفَّذ. */
  const absPP  = extractFunction(read('pp-wa.js'), 'waTplAbstractName');
  const absPRM = extractFunction(read('patients.html'), 'waTplAbstractName');
  if (absPP !== absPRM) bad('waTplAbstractName: النسختان غير متطابقتين بايت-بايت');
  else ok(`waTplAbstractName: نسختان متطابقتان بايت-بايت (${absPP.length} محرفاً)`);
  const absF = compileFns(read('pp-wa.js'), ['waTplAbstractName']).waTplAbstractName;
  let absMism = 0;
  if (absF('مرحباً يحيى التر، كيفك', 'يحيى التر') !== 'مرحباً {الاسم}، كيفك') { absMism++; bad('waTplAbstractName: الاسم لم يُجرَّد'); }
  if (absF('مرحباً يحيى ويحيى', 'يحيى') !== 'مرحباً {الاسم} و{الاسم}') { absMism++; bad('waTplAbstractName: التكرار لم يُغطَّ'); }
  if (absF('نصّ بلا اسم', '') !== 'نصّ بلا اسم') { absMism++; bad('waTplAbstractName: الاسم الفارغ غيّر المتن'); }
  if (absF('نصّ', '   ') !== 'نصّ') { absMism++; bad('waTplAbstractName: اسمٌ بمسافات غيّر المتن'); }
  if (absF(null, 'س') !== '' || absF('', null) !== '') { absMism++; bad('waTplAbstractName: null لم يُطبَّع'); }
  /* السطحان يجب أن يستعملاها فعلاً — دالةٌ مرآةٌ بلا منادٍ حراسةٌ لعدم. */
  for (const f of ['pp-wa.js', 'patients.html']) {
    const src = read(f);
    if ((src.match(/waTplAbstractName\(/g) || []).length < 2) { absMism++; bad(`waTplAbstractName: ${f} لا يناديها`); }
  }
  /* والتطبيق يجب أن يحلّ {الاسم} بالسطحين وإلا وصل العنصرُ النائب المريضَ. */
  if (!/split\('\{الاسم\}'\)/.test(extractFunction(read('pp-wa.js'), 'waTplApply'))) { absMism++; bad('waTplApply: {الاسم} لا يُحلّ'); }
  if (!/prmAiResolve\(/.test(extractFunction(read('patients.html'), 'prmTplApply'))) { absMism++; bad('prmTplApply: {الاسم} لا يُحلّ'); }
  if (!absMism) ok('waTplAbstractName: العقود سليمة (تجريد + تكرار + فراغ + null + منادون + حلٌّ بالتطبيق)');

  const tplPP  = extractFunction(read('pp-wa.js'), 'waTplOptionsHtml');
  const tplPRM = extractFunction(read('patients.html'), 'waTplOptionsHtml');
  if (tplPP !== tplPRM) bad('waTplOptionsHtml: النسختان غير متطابقتين بايت-بايت');
  else ok(`waTplOptionsHtml: نسختان متطابقتان بايت-بايت (${tplPP.length} محرفاً)`);
  const tplF = compileFns(read('pp-wa.js'), ['waTplOptionsHtml']).waTplOptionsHtml;
  const esc = x => String(x == null ? '' : x).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  let tplMism = 0;
  const evil = tplF([{ id: 'i1', name: '<img src=x onerror=alert(1)>' }], esc);
  if (evil.indexOf('<img') !== -1) { tplMism++; bad('waTplOptionsHtml: اسم القالب غير مهرَّب (#195)'); }
  if (tplF(null, esc).indexOf('<option value="">') !== 0) { tplMism++; bad('waTplOptionsHtml: خيار الفراغ مفقود'); }
  if (tplF([], esc) !== tplF(null, esc)) { tplMism++; bad('waTplOptionsHtml: [] و null تباعدا'); }
  if (!tplMism) ok('waTplOptionsHtml: العقود سليمة (هروب + خيار الفراغ + قائمة فارغة)');
} catch (e) { bad('فشل استخراج طبقة العناصر النائبة: ' + e.message); }

/* ── K) M112: قوالب طلب المخبر (pp-clinical.js ↔ labs.html، بايت-بايت) ────
   labs.html تحمل مودال طلب مخبر متوازياً بمعرّفات عناصر مطابقة، فالكتلة
   نفسها تعمل على السطحين حرفياً. درس v67: طبقة متوازية بلا حارس تنحرف —
   فتُسجَّل الدوال الست هنا. الكتلة مكتفية ذاتياً عمداً (صفر ppYmdLocal /
   labsPlanOk مباشرةً) وإلا استحال التطابق البايتي. */
try {
  const LAB_TPL_FNS = ['labTplGateOk', 'labTplRefresh', 'labTplGlowSync',
                       'labTplPopulate', 'labTplApply', 'labTplSaveCurrent',
                       'labTplDeleteSelected'];
  const srcs = [['pp-clinical.js', read('pp-clinical.js')], ['labs.html', read('labs.html')]];
  let ltMism = 0, ltChars = 0;
  for (const fn of LAB_TPL_FNS) {
    const impls = srcs.map(([f, src]) => {
      try { return { f, code: extractFunction(src, fn) }; }
      catch (e) { return { f, code: null }; }
    });
    const missing = impls.filter(i => !i.code).map(i => i.f);
    if (missing.length) { ltMism++; bad(`${fn}: مفقودة في ${J(missing)}`); continue; }
    if (impls[0].code !== impls[1].code) {
      ltMism++;
      bad(`${fn}: تباعد بايت-بايت — ` + impls.map(i => `${i.f}=${i.code.length} محرفاً`).join(' · '));
    } else ltChars += impls[0].code.length;
  }
  /* عقد الاكتفاء الذاتي: أي تبعية خارجية جديدة تكسر إمكان المرآة مستقبلاً */
  const ppBlock = read('pp-clinical.js');
  for (const dep of ['ppYmdLocal(', 'labsBlockedToast(']) {
    for (const fn of LAB_TPL_FNS) {
      let code; try { code = extractFunction(ppBlock, fn); } catch (e) { continue; }
      if (code.indexOf(dep) !== -1) { ltMism++; bad(`${fn}: تبعية خارجية «${dep}» تكسر المرآة مع labs.html`); }
    }
  }
  /* الصف موجود بالمودالين، والتحديث مستدعى بمساري الفتح والتعديل لكل سطح.
     لاحظ أن مالك منطق الفتح يختلف: ببطاقة المريض هو pp-clinical.js، وبصفحة
     المخابر هو labs.html نفسها — فالتوكيد على الملف المالك لا على الـHTML دائماً. */
  ['patient-profile.html', 'labs.html'].forEach(f => {
    if (read(f).indexOf('id="labTplRow"') === -1) { ltMism++; bad(`${f}: صف قالب طلب المخبر مفقود`); }
  });
  [['pp-clinical.js', 'بطاقة المريض'], ['labs.html', 'صفحة المخابر']].forEach(([f, label]) => {
    const n = (read(f).match(/labTplRefresh\(\)/g) || []).length;
    if (n < 2) { ltMism++; bad(`${label} (${f}): labTplRefresh مستدعاة ${n} مرة — المتوقع مساران (فتح + تعديل)`); }
  });
  if (!ltMism) ok(`قوالب طلب المخبر: ${LAB_TPL_FNS.length} دوال متطابقة بايت-بايت عبر سطحين (${ltChars} محرفاً) + مكتفية ذاتياً`);
} catch (e) { bad('فشل استخراج قوالب طلب المخبر: ' + e.message); }

/* ── N) بند #6: صياغة أمر المخبر بالذكاء الاصطناعي (pp-clinical.js ↔ labs.html) ──
   نفس عقد المجموعة K حرفياً: المودالان متطابقا المعرّفات فالكتلة الواحدة
   تخدم السطحين بايت-بايت. مكتفية ذاتياً عمداً (مُحلّل اسم المريض يتحسس
   السطح، والهاتف عبر labAiNormPhone المحلية — عضو سلوكي بعائلة المجموعة A). */
try {
  const LAB_AI_FNS = ['labAiInit', 'labAiNormPhone', 'labAiPatientName',
                      'labAiDraftOrder', 'labAiCopy', 'labAiSaveAndSend',
                      'labAiTeeth', 'labAiReset'];
  const srcs = [['pp-clinical.js', read('pp-clinical.js')], ['labs.html', read('labs.html')]];
  let laMism = 0, laChars = 0;
  for (const fn of LAB_AI_FNS) {
    const impls = srcs.map(([f, src]) => {
      try { return { f, code: extractFunction(src, fn) }; }
      catch (e) { return { f, code: null }; }
    });
    const missing = impls.filter(i => !i.code).map(i => i.f);
    if (missing.length) { laMism++; bad(`${fn}: مفقودة في ${J(missing)}`); continue; }
    if (impls[0].code !== impls[1].code) {
      laMism++;
      bad(`${fn}: تباعد بايت-بايت — ` + impls.map(i => `${i.f}=${i.code.length} محرفاً`).join(' · '));
    } else laChars += impls[0].code.length;
  }
  /* عقد الاكتفاء الذاتي: تبعية سطح-أحادية جديدة تكسر إمكان المرآة */
  for (const dep of ['ppYmdLocal(', 'labsBlockedToast(', 'ppNormalizePhone(']) {
    for (const [f, src] of srcs) {
      for (const fn of LAB_AI_FNS) {
        let code; try { code = extractFunction(src, fn); } catch (e) { continue; }
        if (code.indexOf(dep) !== -1) { laMism++; bad(`${fn} (${f}): تبعية خارجية «${dep}» تكسر المرآة`); }
      }
    }
  }
  /* الصف والصندوق موجودان بالمودالين */
  ['patient-profile.html', 'labs.html'].forEach(f => {
    if (read(f).indexOf('id="labAiRow"') === -1) { laMism++; bad(`${f}: صف صياغة أمر المخبر مفقود`); }
    if (read(f).indexOf('id="labAiResult"') === -1) { laMism++; bad(`${f}: صندوق ناتج الأمر مفقود`); }
    if (read(f).indexOf('id="labAiSaveSendBtn"') === -1) { laMism++; bad(`${f}: زر حفظ+واتساب مفقود`); }
    /* v264: زر الإرسال المستقل (بلا حفظ) حُذف بقرار المالك — عودته تكسر */
    if (read(f).indexOf('labAiWaSend(') !== -1) { laMism++; bad(`${f}: زر إرسال واتساب المستقل عاد (labAiWaSend) — القناة الوحيدة حفظ+واتساب`); }
  });
  /* labAiReset موصولة بمساري الفتح والتعديل بكل سطح (نمط توكيد labTplRefresh) */
  [['pp-clinical.js', 'بطاقة المريض'], ['labs.html', 'صفحة المخابر']].forEach(([f, label]) => {
    const n = (read(f).match(/labAiReset\(\);/g) || []).length;
    if (n < 2) { laMism++; bad(`${label} (${f}): labAiReset مستدعاة ${n} مرة — المتوقع مساران (فتح + تعديل)`); }
  });
  if (!laMism) ok(`صياغة أمر المخبر AI: ${LAB_AI_FNS.length} دوال متطابقة بايت-بايت عبر سطحين (${laChars} محرفاً) + مكتفية ذاتياً`);
} catch (e) { bad('فشل استخراج صياغة أمر المخبر AI: ' + e.message); }

/* ── V) v266: مدخل الجلسة الجديدة chart-first (patient-profile.html ↔ pp-dental.js) ──
   عقدٌ من اتجاهين: (١) كلُّ زرّ «إضافة جلسة» بالبطاقة يمرّ من openNewSessionEntry —
   نداءٌ مباشر لـopenSessionModal من الماركب يعيد المسارَ الناقص؛ (٢) المودالُ
   القديم يبقى بلا سن/مخبر — ترقيعُه يصنع محرّكاً ثانياً بجانب مودال السن. */
try {
  const ppv = read('patient-profile.html'), pdv = read('pp-dental.js');
  let nseMism = 0;
  const directCalls = (ppv.match(/onclick="openSessionModal\(\)"/g) || []).length;
  if (directCalls) { nseMism++; bad(`patient-profile.html: ${directCalls} زر ينادي openSessionModal مباشرةً — يجب أن يمرّ من openNewSessionEntry`); }
  const entryCalls = (ppv.match(/onclick="openNewSessionEntry\(\)"/g) || []).length;
  if (entryCalls < 3) { nseMism++; bad(`patient-profile.html: أزرار إضافة الجلسة عبر openNewSessionEntry = ${entryCalls} — المتوقع 3 (الهيدر · التبويب · الحالة الفارغة)`); }
  if (ppv.indexOf('id="newSessionEntryModal"') === -1 || ppv.indexOf('id="nseGrid"') === -1) { nseMism++; bad('patient-profile.html: مودال مدخل الجلسة الجديدة مفقود'); }
  const legacy = ppv.slice(ppv.indexOf('id="sessionModal"'), ppv.indexOf('id="aiHubModal"'));
  for (const bad_id of ['sTooth', 'sSurface', 'toothLabBtn']) {
    if (legacy.indexOf(bad_id) !== -1) { nseMism++; bad(`sessionModal: «${bad_id}» — المودال الحرّ لا يُرقَّع بسنٍّ أو مخبر؛ المسارُ السنّي هو مودال السن`); }
  }
  for (const fn of ['openNewSessionEntry', 'nseRender', 'nsePick', 'nseRegional', 'nseFree']) {
    if (pdv.indexOf('function ' + fn + '(') === -1) { nseMism++; bad(`pp-dental.js: ${fn} مفقودة`); }
  }
  if (!/nsePick[\s\S]*?openToothModal\(n\)/.test(pdv)) { nseMism++; bad('nsePick لا تسلّم لـopenToothModal(n)'); }
  if (!nseMism) ok('مدخل الجلسة الجديدة: 3 أزرار عبر openNewSessionEntry · sessionModal بلا سن · 5 دوال حاضرة وتسلّم لمودال السن');
} catch (e) { bad('فشل فحص مدخل الجلسة الجديدة: ' + e.message); }

/* ── V2) v331: حالةُ الجلسة الحرّة + عملةُ علاجات الموعد ─────────────────────
   (١) الجلسةُ الحرّة كانت تُحفظ status:'completed' ثابتاً حتى حين تُربط بموعدٍ لم
   يحصل ⇒ مودالُ الموعد «مخطّط 0 / منجز 1» وإكمالُه يُتجاوَز. الحارسُ يمنع عودة
   الثابت، ويشغّل منطقَ الاقتراح سلوكياً على DOM مزيّف.
   (٢) صفحةُ المواعيد كانت تجلب الجلسات بلا currency وتَسِم كلَّ صفٍّ بعملة العيادة
   ⇒ علاجٌ بالدولار يُقرأ «ل.س». */
try {
  const ppv = read('patient-profile.html');
  let ssMism = 0;
  const saveFn = extractFunction(ppv, '_saveSession_inner');
  if (/status:\s*'completed'/.test(saveFn)) { ssMism++; bad('_saveSession_inner: status مكتوبة «completed» ثابتة — يجب أن تأتي من منتقي الحالة (sStatus)'); }
  if (!/status:\s*sStatus/.test(saveFn)) { ssMism++; bad('_saveSession_inner: الإدخال لا يحمل status: sStatus'); }
  if (!/sStatus === 'completed'[^\n]*last_visit/.test(saveFn)) { ssMism++; bad('_saveSession_inner: «آخر زيارة» تتحرّك بجلسةٍ مخطّطة'); }
  if (!/sStatus === 'completed'[^\n]*maybePromptMaterialDeduction|sStatus === 'completed' && typeVal/.test(saveFn)) { ssMism++; bad('_saveSession_inner: خصمُ المواد غير مقصور على المنجز'); }
  const legacy = ppv.slice(ppv.indexOf('id="sessionModal"'), ppv.indexOf('id="aiHubModal"'));
  if (legacy.indexOf('id="sStatusPicker"') === -1 || legacy.indexOf('onchange="sessApptChanged()"') === -1) { ssMism++; bad('sessionModal: منتقي الحالة أو ربطُه بالموعد مفقود'); }
  if (!/\.select\('[^']*arrived_at, seated_at, dismissed_at'\)\s*\n\s*\.eq\('patient_id', patientId\)\s*\n\s*\.gte\('date', todayStr\)/.test(ppv)) { ssMism++; bad('upcomingAppts: أختامُ الحضور غير مجلوبة — استثناءُ «المريض حاضر» سيعمى'); }
  // سلوكياً
  const TODAY = '2026-09-16';
  const mk = () => {
    const el = { sAppt: { value: '' }, sDate: { value: TODAY }, sStatusHint: { textContent: '', style: {} } };
    const btns = ['completed', 'planned'].map(s => ({ s, cls: new Set(), getAttribute: () => s, classList: { toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } } }));
    btns.forEach(b => { b.classList._s = b.cls; });
    const ctx = {
      toDay: () => TODAY,
      upcomingAppts: [
        { id: 'fut', date: '2026-11-25' },
        { id: 'todayWait', date: TODAY },
        { id: 'todayIn', date: TODAY, arrived_at: '2026-09-16T09:00:00Z' },
        { id: 'todayDone', date: TODAY, dismissed_at: '2026-09-16T11:00:00Z' }
      ],
      document: { getElementById: id => el[id] || null, querySelectorAll: () => btns }
    };
    vm.createContext(ctx);
    vm.runInContext('var _sessStatus = "completed"; var _sessAutoDate = null;\n'
      + ['sessPickStatus', 'sessApptIsLive', 'sessApptChanged'].map(f => extractFunction(ppv, f)).join('\n'), ctx);
    return { ctx, el, sel: () => btns.filter(b => b.cls.has('selected')).map(b => b.s).join(',') };
  };
  const pick = (t, id) => { t.el.sAppt.value = id; vm.runInContext('sessApptChanged()', t.ctx); return vm.runInContext('_sessStatus', t.ctx); };
  const cases = [
    ['موعدٌ مستقبلي ⇒ مخطّط + تاريخُ الموعد', t => pick(t, 'fut') === 'planned' && t.el.sDate.value === '2026-11-25' && t.sel() === 'planned'],
    ['موعدُ اليوم والمريضُ لم يصل ⇒ مخطّط', t => pick(t, 'todayWait') === 'planned' && t.el.sDate.value === TODAY],
    ['موعدُ اليوم والمريضُ واصل ⇒ منجز', t => pick(t, 'todayIn') === 'completed' && t.sel() === 'completed'],
    ['موعدُ اليوم وانصرف ⇒ منجز', t => pick(t, 'todayDone') === 'completed'],
    ['فكُّ الربط ⇒ منجز + التاريخُ يعود لليوم', t => { pick(t, 'fut'); return pick(t, '') === 'completed' && t.el.sDate.value === TODAY; }],
    ['تاريخٌ كتبه الطبيب لا يُمسّ عند فكّ الربط', t => { pick(t, 'fut'); t.el.sDate.value = '2026-10-01'; pick(t, ''); return t.el.sDate.value === '2026-10-01'; }],
    ['تبديلُ المستقبلي إلى حاضرٍ اليوم يعيد التاريخ', t => { pick(t, 'fut'); return pick(t, 'todayIn') === 'completed' && t.el.sDate.value === TODAY; }],
    ['تلميحُ الإكمال يظهر مع المخطّط المربوط', t => { pick(t, 'fut'); return t.el.sStatusHint.style.display === 'block' && /إكمال الموعد/.test(t.el.sStatusHint.textContent); }],
  ];
  let passed = 0;
  for (const [name, fn] of cases) { if (fn(mk())) passed++; else { ssMism++; bad('حالة الجلسة الحرّة: ' + name); } }
  // (٢) العملة
  const ap = read('appointments.html');
  /* v412: قائمةُ الأعمدة صارت بمتغيّر (_sesCols) يقرأه الاستعلامان (مع plan_option · وبدونه قبل M145) — القصدُ نفسه: currency بالقائمة وكلا الاستعلامين يقرآنها. */
  if (!/var _sesCols = 'id, patient_id, appointment_id[^']*\bcurrency\b/.test(ap) || (ap.match(/from\('ledger_sessions'\)\.select\(_sesCols/g) || []).length !== 2) { ssMism++; bad('appointments.html: جلساتُ المواعيد تُجلب بلا currency'); }
  for (const f of ['appt-modal.js', 'appt-time.js']) {
    const n = (read(f).match(/fmtCost\(s\.cost\)\s*\+\s*' '\s*\+\s*curLbl\(\)/g) || []).length;
    if (n) { ssMism++; bad(`${f}: ${n} وسمٍ لكلفة جلسة بعملة العيادة (curLbl) — يجب _apptCurLblOf(s.currency)`); }
  }
  if (!ssMism) ok(`حالة الجلسة الحرّة: الحالة من المنتقي · ${passed}/${cases.length} سيناريو اقتراح · وسمُ العملة لعلاجات الموعد من الصف`);
} catch (e) { bad('فشل فحص حالة الجلسة الحرّة: ' + e.message); }

/* ── V3) v332: طبيبُ الموعد ≠ طبيبِ الجلسة — سؤالٌ لا قرارٌ صامت ──────────────
   لا اتجاهَ تلقائي: التنبيهُ يظهر عند الاختلاف فقط، «اجعل الجلسة» يغيّر المنتقي،
   «انقل الموعد» علمٌ يُطبَّق بعد نجاح الجلسة ومحصورٌ بالعيادة، وأيُّ تغييرٍ للموعد
   أو الطبيب يُسقط العلم. */
try {
  const ppv = read('patient-profile.html');
  let pmMism = 0;
  const saveFn = extractFunction(ppv, '_saveSession_inner');
  const iIns = saveFn.indexOf("from('ledger_sessions').insert"), iMove = saveFn.indexOf('sessProvApplyMove(');
  if (iMove < 0 || iMove < iIns) { pmMism++; bad('_saveSession_inner: نقلُ طبيب الموعد مفقود أو يسبق إدخالَ الجلسة'); }
  const applyFn = extractFunction(ppv, 'sessProvApplyMove');
  if (!/\.update\(\{\s*provider_id:\s*provId\s*\}\)[\s\S]*?\.eq\('id', apptId\)\.eq\('doctor_id', currentUser\.id\)/.test(applyFn)) { pmMism++; bad('sessProvApplyMove: التحديثُ غير محصور بـid + doctor_id أو يلمس غير provider_id');
  if (!/\.eq\('doctor_id', currentUser\.id\)\.select\('id'\);[\s\S]*?u\.data\.length !== 1/.test(applyFn)) { pmMism++; bad('sessProvApplyMove: لا يتحقق من أن صفاً واحداً تحدّث فعلاً'); } }
  if (!/logAudit\('appointment\.edit'/.test(applyFn)) { pmMism++; bad('sessProvApplyMove: نقلُ الطبيب بلا سجل نشاط'); }
  if (/innerHTML/.test(extractFunction(ppv, 'sessProvSync')) || /innerHTML/.test(extractFunction(ppv, 'sessProvMoveToggle'))) { pmMism++; bad('تنبيهُ اختلاف الطبيب يكتب innerHTML — الأسماءُ نصٌّ حرّ'); }
  if (!/_sessMoveApptProv = false;\s*sessProvSync\(\)/.test(ppv.slice(ppv.indexOf('select.onchange = function(){ autofillSessionPrice();')))) { pmMism++; bad('تبديلُ طبيب الجلسة لا يُسقط قرارَ النقل'); }
  const mk = () => {
    const mkEl = () => ({ style: {}, textContent: '', _c: new Set(), classList: { toggle(c, on) { on ? this.o._c.add(c) : this.o._c.delete(c); } } });
    const el = {};
    ['sProvMismatch', 'sProvMismatchTxt', 'sProvMoveBtn', 'sProvTakeBtn', 'sProvMismatchWarn', 'sessionProviderGroup'].forEach(k => { el[k] = mkEl(); el[k].classList.o = el[k]; });
    el.sAppt = { value: '' };
    el.sProvider = { value: 'dM', options: [{ value: 'dA' }, { value: 'dM' }] };
    const updates = [], audits = [];
    const ctx = {
      console: { log() {}, warn() {}, error() {} }, CLINIC_DOCTORS: [{ id: 'dA', name: 'د. أيهم' }, { id: 'dM', name: 'د. <b>مجد</b>' }],
      upcomingAppts: [{ id: 'a1', date: '2026-09-16', time: '12:00', duration: 30, provider_id: 'dA' },
                      { id: 'a2', date: '2026-09-17', time: '10:00', provider_id: 'dM' },
                      { id: 'a3', date: '2026-09-18', time: '09:00', provider_id: 'dX' }],
      allAppointmentsForTl: [{ id: 'a1', provider_id: 'dA' }], currentUser: { id: 'u' }, patientId: 'p', patient: { name: 'x' },
      autofillSessionPrice() {}, fmtTime12: t => t,
      window: { logAudit: (a, o) => audits.push([a, o]), sb: { from: () => ({ update(r) { const q = { r, eqs: [] }; updates.push(q); const e = { eq(k, v) { q.eqs.push([k, v]); return e; }, select() { return { then(f) { return Promise.resolve({ error: null, data: ctx.__rows }).then(f); } }; } }; return e; } }) } },
      __rows: [{ id: 'a1' }],
      document: { getElementById: id => el[id] || null }
    };
    vm.createContext(ctx);
    vm.runInContext('var _sessMoveApptProv = false; var _sessProvChkTok = 0;\n'
      + ['sessProvName', 'sessProvCurrent', 'sessProvAppt', 'sessProvSync', 'sessProvTakeAppt'].map(f => extractFunction(ppv, f)).join('\n')
      + '\nasync ' + applyFn, ctx);
    const run = c => vm.runInContext(c, ctx);
    return { el, run, updates, audits, ctx };
  };
  const shown = t => t.el.sProvMismatch.style.display === 'block';
  const cases = [
    ['بلا ربط ⇒ لا تنبيه', t => { t.run('sessProvSync()'); return !shown(t); }],
    ['الطبيبان متطابقان ⇒ لا تنبيه', t => { t.el.sAppt.value = 'a2'; t.run('sessProvSync()'); return !shown(t); }],
    ['مختلفان ⇒ تنبيهٌ يسمّي الاثنين بـtextContent', t => { t.el.sAppt.value = 'a1'; t.run('sessProvSync()'); return shown(t) && /أيهم/.test(t.el.sProvMismatchTxt.textContent) && /<b>مجد<\/b>/.test(t.el.sProvMismatchTxt.textContent); }],
    ['«اجعل الجلسة» يغيّر المنتقي ويخفي التنبيه', t => { t.el.sAppt.value = 'a1'; t.run('sessProvSync(); sessProvTakeAppt()'); return t.el.sProvider.value === 'dA' && !shown(t); }],
    ['طبيبُ موعدٍ غيرُ نشط ⇒ زرُّ «اجعل الجلسة» مخفي', t => { t.el.sAppt.value = 'a3'; t.run('sessProvSync()'); return shown(t) && t.el.sProvTakeBtn.style.display === 'none'; }],
    ['العلمُ يُظهر حالةَ الزرّ المختار', t => { t.el.sAppt.value = 'a1'; t.run('_sessMoveApptProv = true; sessProvSync()'); return t.el.sProvMoveBtn._c.has('selected') && /سيُنقل/.test(t.el.sProvMoveBtn.textContent); }],
    ['تطابقُ الطبيبين يُسقط العلم', t => { t.el.sAppt.value = 'a2'; t.run('_sessMoveApptProv = true; sessProvSync()'); return t.run('_sessMoveApptProv') === false; }],
    ['مجموعةُ الطبيب مخفية ⇒ لا تنبيه', t => { t.el.sAppt.value = 'a1'; t.el.sessionProviderGroup.style.display = 'none'; t.run('sessProvSync()'); return !shown(t); }],
  ];
  let passed = 0;
  for (const [name, fn] of cases) { if (fn(mk())) passed++; else { pmMism++; bad('اختلاف الطبيب: ' + name); } }
  // مسارُ التطبيق (async)
  ASYNC_CHECKS.push((async () => {
    const t1 = mk();
    const noFlag = await t1.run("sessProvApplyMove('a1', 'dM')");
    const t2 = mk();
    t2.run('_sessMoveApptProv = true');
    const moved = await t2.run("sessProvApplyMove('a1', 'dM')");
    const u = t2.updates[0] || { r: {}, eqs: [] };
    const okMove = moved === true && t2.updates.length === 1 && JSON.stringify(u.r) === '{"provider_id":"dM"}'
      && JSON.stringify(u.eqs) === '[["id","a1"],["doctor_id","u"]]'
      && t2.ctx.upcomingAppts[0].provider_id === 'dM' && t2.ctx.allAppointmentsForTl[0].provider_id === 'dM'
      && t2.audits.length === 1 && t2.audits[0][0] === 'appointment.edit' && t2.run('_sessMoveApptProv') === false;
    const t3 = mk();
    t3.run('_sessMoveApptProv = true');
    const same = await t3.run("sessProvApplyMove('a2', 'dM')");
    const t4 = mk();   // صفرُ صفوفٍ محدَّثة (الموعدُ حُذف بتبويبٍ آخر) ⇒ فشلٌ صريح بلا سجلٍّ ولا تعديلٍ محلي
    t4.ctx.__rows = [];
    t4.run('_sessMoveApptProv = true');
    const ghost = await t4.run("sessProvApplyMove('a1', 'dM')");
    if (ghost !== false || t4.audits.length || t4.ctx.upcomingAppts[0].provider_id !== 'dA') { pmMism++; bad('اختلاف الطبيب: تحديثٌ بلا صفوف يُعلَن نجاحاً'); }
    let aMism = 0;
    if (noFlag !== null || t1.updates.length) { aMism++; bad('اختلاف الطبيب: بلا علمٍ لا نقل'); }
    if (!okMove) { aMism++; bad('اختلاف الطبيب: النقلُ لا يكتب provider_id وحده بقيدَي id+doctor_id أو لا يحدّث القوائم/السجل'); }
    if (same !== null || t3.updates.length) { aMism++; bad('اختلاف الطبيب: نقلٌ لطبيبٍ هو نفسه'); }
    if (!pmMism && !aMism) ok(`اختلاف طبيب الموعد عن الجلسة: ${passed}/${cases.length} سيناريو عرض + 4 لمسار النقل · التحديثُ محصور · صفر innerHTML`);
  })().catch(e => { bad('فشل مسار نقل الطبيب: ' + e.message); }));
} catch (e) { bad('فشل فحص اختلاف الطبيب: ' + e.message); }

/* ── V4) v333: مدخلُ «جلسة جديدة» = السن ← العلاج ← المنطقة ─────────────────────
   كان nsePick يفتح مودالَ السن كنقرةِ تاج، ففلترُ المنطقة (Open Dental treatment
   area) أخفى علاجاتِ الجذور بلا بابٍ بديل. الحارسُ يشغّل pp-dental.js الحيّ كاملاً
   بـvm فوق DOM مزيّف بلا تبعيات، ويثبت: المدخلُ يعرض التاجَ والجذرَ معاً، والمنطقةُ
   تُبنى بعد الاختيار (كلُّ الجذور افتراضياً)، ونقرُ المخطط بقي مفلتراً ولا يرث الوضع. */
try {
  const pdv = read('pp-dental.js'), ppv = read('patient-profile.html');
  let teMism = 0;
  if (ppv.indexOf('id="toothChipsHome"') === -1 || ppv.indexOf('id="toothStep2AreaSlot"') === -1) { teMism++; bad('patient-profile.html: بيتُ شرائح السن أو خانتُها بالخطوة الثانية مفقود'); }
  if (!/function nsePick\(n\) \{[\s\S]*?_toothEntryNext = true;[\s\S]*?openToothModal\(n\);/.test(pdv)) { teMism++; bad('nsePick لا يطلب وضعَ المدخل قبل openToothModal'); }
  const otm = extractFunction(pdv, 'openToothModal');
  if (!/^function openToothModal\(n, surface\) \{\s*var _entryReq = \(_toothEntryNext === true\); _toothEntryNext = false;/.test(otm)) { teMism++; bad('openToothModal لا يستهلك طلبَ المدخل أولَ سطر — خروجٌ مبكر قد يورّثه'); }
  const noop = () => {};
  const mkDom = () => {
    const els = {};
    const mkEl = id => {
      const cls = new Set();
      const el = { id, style: {}, textContent: '', innerHTML: '', value: '', children: [], parentNode: null,
        classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: (c, on) => { ((on === undefined) ? !cls.has(c) : on) ? cls.add(c) : cls.delete(c); } },
        appendChild(ch) { ch.parentNode = el; return ch; }, getAttribute: () => null, setAttribute: noop,
        addEventListener: noop, insertAdjacentElement: noop, remove: noop, focus: noop, select: noop,
        querySelectorAll: () => [], querySelector: () => null };
      return el;
    };
    const document = { getElementById: id => (els[id] = els[id] || mkEl(id)), querySelectorAll: () => [], querySelector: () => null,
      createElement: () => mkEl(''), addEventListener: noop, body: mkEl('body'), documentElement: mkEl('html') };
    document.getElementById('toothChipsHome').appendChild(document.getElementById('toothSurfaceChips'));
    return { document, els };
  };
  const boot = () => {
    const { document, els } = mkDom();
    const ctx = { document, console: { log: noop, warn: noop, error: noop }, setTimeout, localStorage: { getItem: () => null, setItem: noop }, navigator: {}, location: { search: '' } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(`
      var TREATMENTS = [{id:'fill',name:'حشوة',target_part:'crown'},{id:'rct',name:'معالجة لبية',target_part:'root'},
        {id:'post',name:'وتد',target_part:'root'},{id:'crown',name:'تاج',target_part:'crown_full'},
        {id:'ext',name:'قلع',target_part:'extraction'},{id:'impl',name:'زرعة',target_part:'implant'}];
      var teethMap = {}, sessions = [], patient = {}, currentUser = {id:'u'};
      function getTreatment(k){ return TREATMENTS.find(function(t){ return t.id === k; }) || null; }
      async function loadTreatmentsFromSupabase(){}
      function escapeHtml(s){ return String(s); } function openModal(){} function closeModal(){}
      function snTplRefresh(){} function fmt(n){ return String(n); } function curLblOf(){ return '$'; }
      function toDay(){ return '2026-09-16'; } function showToast(){}
      function ppGuarded(n, f){ return f; } function populateProviderPicker(){} function getPriceForDoctor(){ return 0; }
      function labsPlanOk(){ return false; } function needsLab(){ return false; }
      var SyDentCurPick = { mount: function(){}, set: function(){}, read: function(){ return 'SYP'; } };
      var __m61 = true;`, ctx);
    vm.runInContext(pdv, ctx);
    vm.runInContext('mountToothCostPicker = function(){}; renderTxTabs = function(){};', ctx);
    const R = c => vm.runInContext(c, ctx);
    return { R, els, listed: () => R('(_txAllowed || []).map(function(t){ return t.id; }).join(",")') };
  };
  const scen = [
    ['المدخل: الجذرية والتاجية معاً والزرعةُ مخفية على سنٍّ قائم', async t => { await t.R('nsePick(21)'); const l = t.listed(); return /rct/.test(l) && /post/.test(l) && /fill/.test(l) && !/impl/.test(l); }],
    ['المدخل: بلا شرائح بالخطوة الأولى', async t => { await t.R('nsePick(21)'); return t.els.toothSurfaceChips.style.display === 'none'; }],
    ['المدخل: قناةُ سنٍّ وحيد الجذر ⇒ R1 بلا شرائح', async t => { await t.R('nsePick(21)'); t.R("pickToothTreatment('rct','معالجة لبية')"); return t.R('currentSurface') === 'R1' && t.els.toothSurfaceChips.style.display === 'none'; }],
    ['المدخل: قناةُ رحى سفلية ⇒ R1R2 وشرائحُ الجذور بالخطوة الثانية', async t => { await t.R('nsePick(36)'); t.R("pickToothTreatment('rct','معالجة لبية')"); return t.R('currentSurface') === 'R1R2' && t.els.toothSurfaceChips.parentNode.id === 'toothStep2AreaSlot' && t.els.toothSurfaceChips.style.display === 'block'; }],
    ['المدخل: قناةُ رحى علوية ⇒ R1R2R3 والشريحةُ تبدّل', async t => { await t.R('nsePick(16)'); t.R("pickToothTreatment('rct','معالجة لبية')"); const a = t.R('currentSurface'); t.R("toggleRootChip('R3')"); return a === 'R1R2R3' && t.R('currentSurface') === 'R1R2'; }],
    ['المدخل: حشوة ⇒ السطحُ الأوسط وشرائحُ الأسطح بالخطوة الثانية', async t => { await t.R('nsePick(21)'); t.R("pickToothTreatment('fill','حشوة')"); return t.R('currentSurface') === 'I' && t.els.toothSurfaceChips.parentNode.id === 'toothStep2AreaSlot'; }],
    ['المدخل: رجوعٌ ثم علاجٌ آخر يعيد بناء المنطقة', async t => { await t.R('nsePick(36)'); t.R("pickToothTreatment('rct','r')"); t.R('backToStep1()'); t.R("pickToothTreatment('fill','f')"); return t.R('currentSurface') === 'O'; }],
    ['المدخل: ترميمٌ مركّبٌ قائم يُبذَر (MOD)', async t => { t.R("teethMap['46'] = { MOD: 'fill' }"); await t.R('nsePick(46)'); t.R("pickToothTreatment('fill','f')"); return t.R('currentSurface') === 'MOD'; }],
    ['المدخل: تاجٌ كامل ⇒ CROWN_FULL بلا شرائح', async t => { await t.R('nsePick(16)'); t.R("pickToothTreatment('crown','t')"); return t.R('currentSurface') === 'CROWN_FULL' && t.els.toothSurfaceChips.style.display === 'none'; }],
    ['المدخل: سنٌّ مقلوع ⇒ قواعدُ الحالة كما هي (زرعة فقط)', async t => { t.R("teethMap['26'] = { WHOLE: 'ext' }"); await t.R('nsePick(26)'); const l = t.listed(); return /impl/.test(l) && !/rct/.test(l) && !/fill/.test(l); }],
    ['المدخل: بانرُ المخطّط يرى العلاجَ الجذري', async t => { t.R("sessions = [{id:'s1',status:'planned',tooth_num:'36',surface:'R1R2',type:'معالجة لبية',cost:1,created_at:'x'}]"); await t.R('nsePick(36)'); return t.els.toothPlannedBanner.style.display === 'block'; }],
    ['المخطط: نقرُ التاج يخفي الجذرية والشرائحُ ببيتها', async t => { await t.R('nsePick(36)'); t.R("pickToothTreatment('rct','r')"); await t.R("openToothModal(36,'O')"); return !/rct/.test(t.listed()) && t.els.toothSurfaceChips.parentNode.id === 'toothChipsHome' && t.R('toothEntryMode') === false; }],
    ['المخطط: نقرُ الجذر يخفي التاجية', async t => { await t.R("openToothModal(36,'R1')"); const l = t.listed(); return /rct/.test(l) && !/fill/.test(l); }],
    ['المخطط: فتحٌ بلا سطحٍ بعد المدخل لا يرث الوضع', async t => { await t.R('nsePick(21)'); await t.R('openToothModal(21)'); return !/rct/.test(t.listed()); }],
    ['المخطط: بانرُ السطح الإطباقي لا يلتقط الجذري (كما كان)', async t => { t.R("sessions = [{id:'s1',status:'planned',tooth_num:'36',surface:'R1R2',type:'x',cost:1,created_at:'x'}]"); await t.R("openToothModal(36,'O')"); return t.els.toothPlannedBanner.style.display === 'none'; }],
    ['وضعُ الفحص يعترض قبل الاستهلاك ولا يورّث', async t => { t.R('window.__examMode = true; examStamp = function(){}'); await t.R('nsePick(21)'); t.R('window.__examMode = false'); await t.R('openToothModal(21)'); return t.R('toothEntryMode') === false && !/rct/.test(t.listed()); }],
  ];
  ASYNC_CHECKS.push((async () => {
    let passed = 0;
    for (const [name, fn] of scen) {
      let okv = false;
      try { okv = await fn(boot()); } catch (e) { okv = false; }
      if (okv) passed++; else { teMism++; bad('مدخل الجلسة الجديدة: ' + name); }
    }
    if (!teMism) ok(`مدخل الجلسة الجديدة (السن ← العلاج ← المنطقة): ${passed}/${scen.length} سيناريو على pp-dental.js الحيّ · نقرُ المخطط مفلترٌ كما كان`);
  })().catch(e => { bad('فشل تشغيل مدخل الجلسة الجديدة: ' + e.message); }));
} catch (e) { bad('فشل فحص مدخل الجلسة الجديدة (V4): ' + e.message); }

/* ── L) خلفية المودال المُكدَّس (patient-profile.css ↔ labs.html) ──────────
   السطحان يكدّسان مودالين فعلياً (خصم المواد فوق طلب المخبر · إضافة مخبر فوق
   طلب المخبر) وكلٌّ يملك نسخته من CSS المودالات. القاعدة سطر واحد لكنها طبقة
   متوازية — ودرس v67 أن المتوازي بلا حارس ينحرف. لا تطابق بايتي هنا: الملفان
   يختلفان بعرف التنسيق (مضغوط/موسّع) وباسم الصندوق (.modal-box/.modal)،
   فيُحرَس المحدِّد والأثر بعد تطبيع المسافات. */
try {
  const norm = css => css.replace(/\s+/g, ' ');
  const SEL = '.modal-overlay.open ~ .modal-overlay.open';
  const PARENT = '.modal-overlay.open:has(~ .modal-overlay.open)';
  let stMism = 0;
  /* النمط المُرقّى (نمط iOS sheet): الابن المُكدَّس يحمل تعتيمه الأخف .45
     (بدل transparent القديمة)، والأب يتراجع ويُعتَّم ويتعطّل عبر :has.
     ثلاثة أسطح — appointments.css انضمّت (retarget من appointments.html — استخراج CSS ٢) (apptMatDeductModal فوق مودال
     الموعد عند الإكمال الجماعي). */
  /* v438: سطحٌ انتقل لعُدّة SyDent الموحّدة (sy-m) يرث القاعدة من theme.css،
     فلا تُطلب منه نسخةٌ محلية — يُحرَس أن صفحته تحمل sy-m على كل .modal-overlay
     وأن العُدّة نفسها ما زالت تحمل القاعدة الثلاثية. appointments انتقلت أولاً. */
  const KIT = norm(read('theme.css'));
  const KSEL = '.modal-overlay.sy-m:is(.open, .show) ~ .modal-overlay.sy-m:is(.open, .show)';
  const KPAR = '.modal-overlay.sy-m:is(.open, .show):has(~ .modal-overlay.sy-m:is(.open, .show))';
  if (KIT.indexOf(KSEL + ' { background: var(--sy-m-scrim-stack); }') === -1) {
    stMism++; bad('theme.css (عُدّة النوافذ): تعتيم الابن المُكدَّس مفقود');
  }
  if (KIT.indexOf(KPAR + ' > :is(.modal-box, .modal, .modal-card)') === -1) {
    stMism++; bad('theme.css (عُدّة النوافذ): قاعدة تراجع/تعطيل الأب (:has) مفقودة');
  }
  [['appointments.html', 5] /* v501: نافذةُ الحجوزات تُحقن من appt-blocks.js */, ['patients.html', 4], ['patient-profile.html', 34],
   ['treatments.html', 2], ['doctors.html', 1], ['employees.html', 2], ['payouts.html', 1],
   ['expenses.html', 2], ['inventory.html', 5], ['labs.html', 3],
   ['provider-reports.html', 3], ['audit-log.html', 1],
   ['settings.html', 5], ['learn.html', 1], ['subscription.html', 2], ['auth.html', 1], ['admin.html', 6]].forEach(([f, n]) => {
    const h = read(f);
    const tot = (h.match(/<div (?:class="[^"]*\bmodal-overlay\b[^"]*" id="|id="[^"]+"[^>]*class="[^"]*\bmodal-overlay\b)/g) || []).length;
    const kit = (h.match(/class="[^"]*\bmodal-overlay\b[^"]*\bsy-m\b|class="[^"]*\bsy-m\b[^"]*\bmodal-overlay\b/g) || []).length;
    if (tot !== n || kit !== n) { stMism++; bad(`${f}: نوافذ العُدّة ${kit}/${tot} (المنتظَر ${n}) — كل .modal-overlay بالصفحة المُرحَّلة تحمل sy-m`); }
    else ok(`${f}: ${kit}/${tot} نوافذ على العُدّة الموحّدة (التكديس من theme.css)`);
  });
  [].forEach(([f, box]) => {
    const c = norm(read(f));
    if (c.indexOf(SEL + ' { background: rgba(0,0,0,.45); }') === -1 &&
        c.indexOf(SEL + '{background:rgba(0,0,0,.45);}') === -1) {
      stMism++; bad(`${f}: قاعدة تعتيم الابن المُكدَّس (.45) مفقودة`);
    }
    if (c.indexOf(SEL + ' ' + box) === -1) {
      stMism++; bad(`${f}: ظل التراتب البصري مفقود على ${box}`);
    }
    if (c.indexOf(PARENT + ' ' + box) === -1) {
      stMism++; bad(`${f}: قاعدة تراجع/تعطيل الأب (:has) مفقودة على ${box}`);
    }
  });
  /* شرط الصحة: المودال المُكدَّس يجب أن يكون متأخراً بالـDOM وإلا رسم تحت من يعتّم */
  const order = (f, ids) => { const h = read(f); return ids.map(i => h.indexOf('id="' + i + '"')); };
  [['patient-profile.html', ['labOrderModal', 'matDeductModal']],
   ['patient-profile.html', ['labOrderModal', 'ppLabModal']],
   ['patient-profile.html', ['rxModal', 'rxTemplatesModal']],
   ['patient-profile.html', ['postOpModal', 'postOpTemplatesModal']],
   ['patient-profile.html', ['postOpTemplatesModal', 'postOpTemplateEditModal']],
   ['patient-profile.html', ['implantModal', 'implantTemplatesModal']],
   ['labs.html',            ['labOrderModal', 'labModal']],
   ['appointments.html',    ['modalOverlay', 'apptMatDeductModal']]].forEach(([f, ids]) => {
    const [a, b] = order(f, ids);
    if (a < 0 || b < 0 || b < a) {
      stMism++; bad(`${f}: ${ids[1]} ليس متأخراً عن ${ids[0]} بالـDOM — القاعدة تنعكس`);
    }
  });
  if (!stMism) ok('تعتيم المودال المُكدَّس: النمط المُرقّى (ابن .45 + أب :has) على الأسطح الثلاثة + ترتيب DOM سليم بالأزواج الثمانية');
} catch (e) { bad('فشل فحص تعتيم المودال المُكدَّس: ' + e.message); }

/* ── M) M114: قائمة فروع النقابة (auth.html ↔ settings.html، بايت-بايت) ───
   القائمة تُعرض بسطحين: نموذج التسجيل ونموذج الإعدادات. أي انحراف يعني
   فرعاً يستطيع الطبيب اختياره بمكان دون آخر — أو قيمة محفوظة تختفي من
   المنتقي فيدهسها أول حفظ. الخيار النائب يختلف عمداً بين السطحين
   («اختر الفرع» ↔ «— غير محدَّد —») فيُستثنى من المقارنة. */
try {
  const selOf = (file, id) => {
    const h = read(file);
    const m = h.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
    if (!m) throw new Error(file + ': لم يُعثر على <select id="' + id + '">');
    return m[1];
  };
  const branchesOf = (body) =>
    [...body.matchAll(/<option>([^<]*)<\/option>/g)].map(x => x[1]);

  const a = branchesOf(selOf('auth.html', 'regCity'));
  const b = branchesOf(selOf('settings.html', 'fSyndicateBranch'));

  let sbMism = 0;
  if (a.length !== 15) { sbMism++; bad(`auth.html: الفروع ${a.length} لا 15`); }
  if (J(a) !== J(b)) {
    sbMism++;
    bad('قائمة فروع النقابة منحرفة بين auth.html و settings.html');
    a.filter(x => !b.includes(x)).forEach(x => bad(`  ناقص بـsettings.html: ${x}`));
    b.filter(x => !a.includes(x)).forEach(x => bad(`  زائد بـsettings.html: ${x}`));
  }
  if (new Set(a).size !== a.length) { sbMism++; bad('تكرار بقائمة الفروع'); }
  if (!sbMism) ok('فروع النقابة: القائمة ذاتها (15 فرعاً) بايت-بايت على السطحين');
} catch (e) { bad('فشل فحص فروع النقابة: ' + e.message); }

/* ── O) الحارس المتزامن قبل الرسم (5 صفحات ↔ supabase-init.js) ──────────
   الحارس يقرأ مفتاح تخزين الجلسة نصّاً، والمفتاح يُعرَّف مرة واحدة بـ
   supabase-init.js (storageKey). لو أُعيدت تسميته هناك، تصمت الحراسات
   المتزامنة الخمس بلا أي خطأ — يعود الوميض ولا شيء يشتكي. لذلك المفتاح
   يُقرأ حيّاً من مصدره ويُطابَق على الصفحات الخمس، مع فرض العقد كاملاً:
   الحارس بالـ<head> قبل أي ماركب، replace لا href، وملفوف بـtry/catch. */
try {
  const initSrc = read('supabase-init.js');
  const km = /storageKey:\s*'([^']+)'/.exec(initSrc);
  if (!km) throw new Error('supabase-init.js: لم أجد storageKey');
  const KEY = km[1];

  const DEST = {
    'index.html':           'landing.html',
    'patients.html':        'auth.html',
    'appointments.html':    'auth.html',
    'labs.html':            'auth.html',
    'patient-profile.html': 'auth.html',
  };

  let sgMism = 0;
  for (const page of Object.keys(DEST)) {
    const h = read(page);
    const re = new RegExp("<script>try\\{if\\(!localStorage\\.getItem\\('([^']+)'\\)\\)location\\.replace\\('([^']+)'\\);\\}catch\\(e\\)\\{\\}</script>", 'g');
    const hits = [...h.matchAll(re)];
    if (hits.length !== 1) { sgMism++; bad(`${page}: الحارس المتزامن ${hits.length} لا 1`); continue; }
    const [, key, dest] = hits[0];
    if (key !== KEY)        { sgMism++; bad(`${page}: مفتاح الحارس '${key}' ≠ storageKey الحيّ '${KEY}'`); }
    if (dest !== DEST[page]){ sgMism++; bad(`${page}: وجهة الحارس '${dest}' ≠ '${DEST[page]}'`); }

    /* يجب أن يسبق أي ماركب — وإلا فقد معناه (الرسم يقع قبله) */
    const gi = h.indexOf('<script>try{if(!localStorage');
    const bm = /^<body/m.exec(h);   // بداية السطر حصراً: التعليق التوثيقي يذكر الوسم نصّاً
    if (!bm) { sgMism++; bad(`${page}: لم أجد وسم <body>`); }
    else if (gi > bm.index) { sgMism++; bad(`${page}: الحارس المتزامن بعد الجسم — لا يمنع الوميض`); }

    /* النوم القديم أعاد الوميض بذاته: ممنوع رجوعه */
    if (/await new Promise\(r => setTimeout\(r, 50\)\);/.test(h)) {
      sgMism++; bad(`${page}: نوم 50ms عاد لحارس المصادقة`);
    }
    /* الحارس غير المتزامن: replace لا href (وإلا بقيت صفحة الوميض بالـhistory) */
    const gm = /\/\/ SyDent auth guard[\s\S]{0,600}?<\/script>|<body>\s*<script>\s*\(async function\(\)\{[\s\S]{0,600}?<\/script>/.exec(h);
    if (gm && new RegExp("window\\.location\\.href = '" + DEST[page] + "'").test(gm[0])) {
      sgMism++; bad(`${page}: الحارس غير المتزامن ما زال يستخدم location.href`);
    }
  }
  if (!sgMism) ok(`الحارس المتزامن قبل الرسم: 5 صفحات على المفتاح الحيّ '${KEY}' بوجهات صحيحة + صفر نوم + replace`);
} catch (e) { bad('فشل فحص الحارس المتزامن: ' + e.message); }


/* ── P) قاعدة #257: تصدير إكسل من مصدر واحد (window.SyDentXlsx) ──────────
   كان المُحمِّل مرآةً بايت-بايت بين صفحتين، وكان سيصير خمس نسخ مع طبقة
   الأدمن — فرُقّي لـsupabase-init.js وحُذفت المرآة. هذا الحارس يقفل الباب
   على رجوعها: أي تعريف محلي جديد يُعيد بالضبط صنف الانحراف الصامت الذي
   لا يرمي خطأً بل يُسقط سطحاً واحداً على الاحتياط النصّي دون أن ينتبه أحد. */
try {
  let xlMism = 0;
  const INIT = 'supabase-init.js';
  const initSrc = read(INIT);

  /* (1) التعريف موجود مرة واحدة بالمصدر المشترك حصراً */
  const owners = fs.readdirSync(ROOT)
    .filter(f => /\.(js|html)$/.test(f))
    .filter(f => /function\s+_ensureXlsxLib\s*\(/.test(read(f)));
  if (owners.length) { xlMism++; bad(`مُحمِّل محلي عاد للظهور في ${J(owners)} — المقرّ ${INIT} حصراً`); }

  /* (2) النطاق مُصدَّر بواجهته الكاملة */
  if (!/window\.SyDentXlsx\s*=/.test(initSrc)) { xlMism++; bad(`${INIT}: window.SyDentXlsx غير مُصدَّر`); }
  const nsBlock = /window\.SyDentXlsx\s*=\s*\{[\s\S]*?\};/.exec(initSrc);
  for (const k of ['load', 'save', 'stamp', 'ymd', 'today']) {
    if (!nsBlock || !new RegExp('\\b' + k + '\\s*:').test(nsBlock[0])) {
      xlMism++; bad(`window.SyDentXlsx: الدالة «${k}» مفقودة من الواجهة`);
    }
  }

  /* (3) المكتبة مستضافة ذاتياً وملفها موجود فعلاً — لا CDN */
  const pm = /s\.src = '([^']+)'/.exec(initSrc);
  if (!pm || pm[1].indexOf('/vendor/') !== 0) { xlMism++; bad(`${INIT}: مسار مكتبة xlsx ليس محلياً`); }
  else if (!fs.existsSync(path.join(ROOT, pm[1].replace(/^\//, '')))) {
    xlMism++; bad(`${INIT}: الملف «${pm[1]}» غير موجود بالريبو`);
  }

  /* (4) الاحتياط جدولةٌ لا فاصلة — درس هامبورغ الحيّ: ويندوز ألماني يقسّم
         على «؛» ويتجاهل sep=, بصمت، فيهوي الجدول كله بعمود واحد. */
  const saveFn = extractFunction(initSrc, 'save');
  if (saveFn.indexOf("join('\\t')") === -1) { xlMism++; bad('احتياط SyDentXlsx ليس مفصولاً بالجدولة'); }
  if (!/text\/tab-separated-values/.test(saveFn)) { xlMism++; bad('احتياط SyDentXlsx: نوع MIME ليس TSV'); }
  if (saveFn.indexOf('\\uFEFF') === -1) { xlMism++; bad('احتياط SyDentXlsx بلا BOM — العربي يتلف بإكسل ويندوز'); }
  if (!/Views:\s*\[\{\s*RTL:\s*true\s*\}\]/.test(saveFn)) { xlMism++; bad('SyDentXlsx: الورقة ليست RTL'); }

  /* (5) كل المستهلكين يمرّون من النطاق، وصفر بقايا مسارات CSV اليدوية */
  const CONSUMERS = ['patients.html', 'audit-log.html', 'admin-wa.js', 'admin-render.js', 'admin-modules.js'];
  let uses = 0;
  for (const f of CONSUMERS) {
    const src = read(f);
    const n = (src.match(/window\.SyDentXlsx\.(save|load)\(/g) || []).length;
    if (!n) { xlMism++; bad(`${f}: لا يمرّ من window.SyDentXlsx`); }
    uses += n;
    for (const dead of ['tsvCell(', 'evfCsvCell(', 'bkCsvCell(', 'rptCsvCell(', '_auditCsvCell(']) {
      if (src.indexOf(dead) !== -1) { xlMism++; bad(`${f}: بقيّة مسار CSV يدوي «${dead}»`); }
    }
  }

  /* (6) تواريخ التصدير لاتينية: أرقام toLocaleString('ar*') الهندية نصٌّ
         بإكسل لا ينفرز ولا يُفلتر — وهو أهمّ ما يُفعل بجدول مُصدَّر. */
  for (const [f, fn] of [['admin-render.js', 'evfExportCsv'], ['admin-render.js', 'bkExportCsv'],
                         ['admin-render.js', 'acLedgerCsv'], ['admin-wa.js', 'exportCSV'],
                         ['admin-modules.js', 'rptExportCsv']]) {
    let code; try { code = extractFunction(read(f), fn); } catch (e) { xlMism++; bad(`${f}: ${fn} مفقودة`); continue; }
    if (/toLocaleString\(\s*'ar/.test(code)) { xlMism++; bad(`${fn}: تاريخ عربي الأرقام بمسار تصدير`); }
  }
  /* والعرضُ على الشاشة بالمُنسّق الموحّد للمنصة SyDT (v485، طلب المالك: التاريخ أرقاماً مع الوقت) — لا مُنسّقَ محلي */
  if (!/function evfFormatTimestamp[\s\S]{0,600}SyDT\.numDate\(/.test(read('admin-render.js'))) {
    xlMism++; bad('evfFormatTimestamp: عرض الشاشة لم يعد على المُنسّق الموحّد SyDT');
  }

  if (!xlMism) ok(`تصدير إكسل: مصدر واحد بـ${INIT} (${pm[1]}) · ${CONSUMERS.length} أسطح مستهلكة بـ${uses} نداءً · احتياط TSV+BOM+RTL · صفر تاريخ عربي الأرقام بالتصدير مع بقاء عرض الشاشة عربياً`);
} catch (e) { bad('فشل فحص تصدير إكسل: ' + e.message); }


/* ── Q) تلميح الأدمن قبل الرسم (5 صفحات ↔ supabase-init.js) ─────────
   نظير المجموعة O لفرع «أدمن»: الحارس يقرأ مفتاحين نصّاً، وكلاهما
   يُعرّف مرّةً واحدة بـsupabase-init.js. إعادة تسمية أيٍّ منهما هناك تُسكِت
   التحويلات الخمسة بلا أي خطأ — يعود الوميض ولا شيء يشتكي. ويُفرَض
   العقد كاملاً: سطرٌ واحد بايت-متطابق بالخمسة، قبل الجسم، بعد حارس
   الجلسة (لا معنى لتلميح أدمن بلا جلسة أصلاً)، replace لا href، وحارس
   قفزة حاضر — حذفُ حارس القفزة وحده يفتح ارتداداً أبديّاً أوفلاين. */
try {
  const initSrc = read('supabase-init.js');
  const kk = /var PADM_KEY = '([^']+)';/.exec(initSrc);
  const kh = /var PADM_HOP = '([^']+)';/.exec(initSrc);
  const ks = /storageKey:\s*'([^']+)'/.exec(initSrc);
  if (!kk || !kh || !ks) throw new Error('supabase-init.js: مفاتيح PADM/storageKey مفقودة');
  const [KEY, HOP, SESS] = [kk[1], kh[1], ks[1]];

  const PAGES = ['index.html', 'patients.html', 'appointments.html', 'labs.html', 'patient-profile.html'];
  let pqMism = 0;
  const seen = new Set();

  for (const page of PAGES) {
    const h = read(page);
    const hits = [...h.matchAll(/<script>try\{(?:if\(!location[^{]*\{)?var _pa=[^\n]*?<\/script>/g)];
    if (hits.length !== 1) { pqMism++; bad(`${page}: تلميح الأدمن ${hits.length} لا 1`); continue; }
    const line = hits[0][0];
    seen.add(line);

    /* المفاتيح الثلاثة حيّة من مصدرها لا منسوخة بالحارس */
    for (const [k, nm] of [[KEY, 'PADM_KEY'], [HOP, 'PADM_HOP'], [SESS, 'storageKey']]) {
      if (line.indexOf(`'${k}'`) === -1) { pqMism++; bad(`${page}: التلميح لا يذكر ${nm} الحيّ '${k}'`); }
    }
    if (line.indexOf("location.replace('admin.html')") === -1) {
      pqMism++; bad(`${page}: وجهة التلميح ليست admin.html بـreplace`);
    }
    if (/location\.href/.test(line)) { pqMism++; bad(`${page}: التلميح يستخدم href — تبقى صفحة الوميض بالـhistory`); }

    /* حارس القفزة: قراءة + كتابة + مسح — غياب أيٍّ منها = حلقة أوفلاين */
    for (const op of ['getItem', 'setItem', 'removeItem']) {
      if (line.indexOf(`sessionStorage.${op}('${HOP}'`) === -1) {
        pqMism++; bad(`${page}: حارس القفزة بلا ${op} — ارتداد أبديّ محتمل أوفلاين`);
      }
    }
    if (!/^<script>try\{/.test(line) || !/catch\(e\)\{\}<\/script>$/.test(line)) {
      pqMism++; bad(`${page}: التلميح غير ملفوف بـtry/catch — تخزين محجوب يرمي`);
    }

    /* الموضع: بعد حارس الجلسة وقبل الجسم */
    const gi = h.indexOf("<script>try{if(!localStorage");
    const qi = h.indexOf(line);
    const bm = /^<body/m.exec(h);
    if (gi === -1) { pqMism++; bad(`${page}: حارس الجلسة (O) مفقود`); }
    else if (qi < gi) { pqMism++; bad(`${page}: تلميح الأدمن قبل حارس الجلسة`); }
    if (!bm) { pqMism++; bad(`${page}: لم أجد وسم <body>`); }
    else if (qi > bm.index) { pqMism++; bad(`${page}: تلميح الأدمن بعد الجسم — لا يمنع الوميض`); }
  }

  if (seen.size > 1) { pqMism++; bad(`تلميح الأدمن منحرف: ${seen.size} صيغ مختلفة بالخمسة`); }

  /* auth.html — السطح السادس بصيغة ملفوفة. صفحة عامة تُقصد لأسباب
     صريحة (logged_out · denied · reset · tab=register · #register)، فالتحويل
     المبكّر مشروط بغياب أي search أو hash — شرطٌ واحد يغطّيها كلها،
     ونزعُه يخطف الأدمن من مسار خروجٍ أو إعادة تعيين كلمة مرور قبل أن
     يرى الرسالة. والنواة بايت-متطابقة مع الخمسة فلا تنحرف واحدة عن الأخرى. */
  try {
    const ah = read('auth.html');
    const ahits = [...ah.matchAll(/<script>try\{if\(!location[^\n]*?<\/script>/g)];
    if (ahits.length !== 1) { pqMism++; bad(`auth.html: تلميح الأدمن ${ahits.length} لا 1`); }
    else {
      const aline = ahits[0][0];
      const core = [...seen][0].replace(/^<script>try\{/, '').replace(/\}catch\(e\)\{\}<\/script>$/, '');
      const want = `<script>try{if(!location.search&&!location.hash){${core}}}catch(e){}</script>`;
      if (aline !== want) {
        pqMism++; bad('auth.html: نواة التلميح منحرفة عن الصفحات الخمس أو الشرط مفقود');
      }
      const abm = /^<body/m.exec(ah);
      if (!abm || ah.indexOf(aline) > abm.index) {
        pqMism++; bad('auth.html: التلميح بعد الجسم — لا يمنع الوميض');
      }
    }
    /* دين النوم — نفس صنف v146. window.sb مضمون بـIIFE متزامن بالـ<head>،
       والنوم يضاعف الوميض فوق رحلتي الشبكة (getUser ثم platform_admins). */
    if (/await new Promise\(r => setTimeout\(r, \d+\)\);/.test(read('auth.html'))) {
      pqMism++; bad('auth.html: عاد نوم لحارس المصادقة');
    }
  } catch (e) { pqMism++; bad('فشل فحص auth.html: ' + e.message); }

  /* الكاتب واحد: _padmHint داخل isPlatformAdmin على النتيجة النظيفة حصراً.
     وفرعا الخطأ لا يلمسان العلامة — وإلا ماتت الميزة عند أول انقطاع. */
  const ipa = /window\.SyDentAuth\.isPlatformAdmin = async function[\s\S]*?\n  \};/.exec(initSrc);
  if (!ipa) { pqMism++; bad('isPlatformAdmin مفقودة'); }
  else {
    const body = ipa[0];
    const nHint = (body.match(/_padmHint\(/g) || []).length;
    if (nHint !== 1) { pqMism++; bad(`isPlatformAdmin: _padmHint ×${nHint} لا ×1`); }
    if (!/_padmHint\(isAdm \? userId : null\);/.test(body)) {
      pqMism++; bad('isPlatformAdmin: التلميح لا يتبع النتيجة النظيفة حرفياً');
    }
    for (const errBranch of [/if \(res\.error\) \{[\s\S]*?\n      \}/, /\} catch \(e\) \{[\s\S]*?exception'? \};/]) {
      const m = errBranch.exec(body);
      if (m && /_padm/.test(m[0])) {
        pqMism++; bad('isPlatformAdmin: فرع خطأ يلمس العلامة — الخطأ ليس دليل عدم-أدمن');
      }
    }
  }

  /* signOut هي نقطة الاختناق الوحيدة (9 مواضع تمرّ منها) */
  if (!/signOut = function \(opts\) \{ _guClear\(\); _padmClear\(\); return realSignOut\(opts\); \};/.test(initSrc)) {
    pqMism++; bad('signOut لا تمسح علامة الأدمن');
  }

  /* كل نداء لـisPlatformAdmin يجب أن يمرّر هوية الجلسة الحالية حصراً.
     🔴 هذا هو العقد الذي يجعل الكتابة داخل الدالة آمنة أصلاً: نداءٌ
     بمعرّف مستخدمٍ آخر (مثلاً فحص أدمنية صفّ بقائمة العملاء) سيكتب
     علامة لشخص آخر بمتصفّح الأدمن — تسمّم صامت لا يرمي خطأ. */
  const ALLOWED = new Set(['session.user.id', 'user.id', 'sUser.id', 'data.user.id']);
  const CALLERS = ['admin.html', 'supabase-init.js', 'index.html', 'auth.html'];
  let calls = 0;
  for (const f of CALLERS) {
    for (const m of read(f).matchAll(/isPlatformAdmin\(([^)]*)\)/g)) {
      const arg = m[1].trim();
      if (arg === 'userId') continue;            // التعريف نفسه
      calls++;
      if (!ALLOWED.has(arg)) {
        pqMism++; bad(`${f}: isPlatformAdmin(${arg}) — وسيط غير معتمد؛ العلامة تُكتب لهوية الجلسة حصراً`);
      }
    }
  }
  if (calls !== 6) { pqMism++; bad(`مواضع نداء isPlatformAdmin = ${calls} لا 6 — راجع العقد`); }

  if (!pqMism) ok(`تلميح الأدمن قبل الرسم: 5 صفحات + auth.html (ملفوفة بشرط search/hash · صفر نوم) بسطر بايت-متطابق على '${KEY}'/'${HOP}'/'${SESS}' الحيّة · كاتب واحد على النتيجة النظيفة · فرعا الخطأ لا يلمسانها · signOut تمسح · ${calls} نداءات بهوية الجلسة`);
} catch (e) { bad('فشل فحص تلميح الأدمن: ' + e.message); }



/* ── مرآة M125: مساعدا قسمة العملة _rowCur/_filterCur (بايت-بايت) ──
 * accounting.html ↔ provider-reports.html — الدلالة الحاكمة: أي صف عملته
 * غير 'USD' (بما فيها null/undefined لصفوف قديمة) يُطوى إلى 'SYP'.
 * انحراف نسخة واحدة = صفوف تسقط من طبقة أو تدخل الطبقتين ⇒ كسر حفظ Test A.
 * (index.html وpatients.html يستعملان مغلِّفاً محلياً rc بنفس الدلالة داخل
 * دوالهما المحروسة سلوكياً بمجموعتي «تكافؤ الرصيد/اللوحة» — لا نسخ حرّة.) */
console.log('D125) مساعدا قسمة العملة (accounting ↔ provider-reports):');
try {
  const accSrc = read('accounting.html');
  const prSrc  = read('provider-reports.html');
  const ppSrcM = read('patient-profile.html');
  const apSrcM = read('appointments.html');
  // _rowCur: أربع نسخ (القرّاء الثقيلان + دفتر المريض ومرآة المواعيد) —
  // الدلالة الحاكمة واحدة: غير 'USD' يُطوى إلى 'SYP'.
  for (const [file, src] of [['provider-reports', prSrc], ['patient-profile', ppSrcM], ['appointments', apSrcM], ['labs', read('labs.html')]]) {
    const a = extractFunction(accSrc, '_rowCur');
    const b = extractFunction(src, '_rowCur');
    if (a === b) ok('_rowCur بايت-متطابقة (accounting ↔ ' + file + ')');
    else bad('_rowCur انحرفت بين accounting و' + file + ' — وحّدهما فوراً (M125)');
  }
  {
    const a = extractFunction(accSrc, '_filterCur');
    const b = extractFunction(prSrc, '_filterCur');
    if (a === b) ok('_filterCur بايت-متطابقة بالملفين');
    else bad('_filterCur انحرفت بين accounting وprovider-reports — وحّدهما فوراً (M125)');
  }
  // مساعدا الوحدة الصغرى: دفتر المريض ⇔ مرآة المواعيد (دفعة 2).
  for (const fn of ['_minorFactor', 'toMinor', 'fromMinor']) {
    const a = extractFunction(ppSrcM, fn);
    const b = extractFunction(apSrcM, fn);
    if (a === b) ok(fn + ' بايت-متطابقة (patient-profile ↔ appointments)');
    else bad(fn + ' انحرفت بين patient-profile وappointments — وحّدهما فوراً (M125)');
  }
} catch (e) { bad('فشل فحص مساعدي القسمة: ' + e.message); }

/* ── R) أرقام العرض لاتينية بالأسطول كله ────────────────────────────
   بلاغ المالك الحيّ: الشاشة الواحدة كانت تخلط ٦٦٠٬٠٠٠ مع 0934012433 —
   الهاتف يُطبع خاماً والمبلغ يمرّ بمُنسّق لوكيله عربي. والصنف لا يرمي
   خطأً ولا يمسكه أي حارس نصّي: الرقم صحيح والخانات وحدها هندية.
   الثابت المفروض هنا سطرٌ واحد لا استثناء له: أي لوكيل عربي بأي نداء
   toLocale* يجب أن يحمل الامتداد -u-nu-latn صراحةً. والتصريح ليس
   زخرفةً — 'ar' المجرّد يعطي لاتينياً بـNode وهندياً بكروم، فالاتّكال
   على افتراضي CLDR يعني سلوكاً يختلف بين المحرّك الذي أختبر عليه
   والمتصفّح الذي يراه الطبيب. والأرقام المجرّدة (بلا تاريخ) تذهب
   لـen-US أصلاً فلا تصل هذا الفحص إطلاقاً.
   ملاحظة نطاق: هذا حارس عرضٍ لا إدخال — مطبّعات القراءة التي تقبل
   ٠-٩ من الطبيب (استيراد المرضى · nlDigits) خارجه بالتصميم. */
try {
  const BAD_LOC = /toLocale(?:String|DateString|TimeString)\(\s*'(ar(?:-[A-Za-z]{2})?)'/g;
  const SKIP = new Set(['sw.js', 'book.html']);
  let latnMism = 0, latnOk = 0, scanned = 0;
  for (const f of fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f)).sort()) {
    if (SKIP.has(f)) continue;
    const src = read(f);
    scanned++;
    let m;
    BAD_LOC.lastIndex = 0;
    while ((m = BAD_LOC.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      latnMism++;
      bad(`${f}:${line} — لوكيل «${m[1]}» بلا -u-nu-latn ⇒ أرقام هندية بالعرض`);
    }
    latnOk += (src.match(/'ar(?:-[A-Za-z]{2})?-u-nu-latn'/g) || []).length;
  }
  if (!latnMism) ok(`أرقام العرض لاتينية: ${scanned} ملفاً · ${latnOk} لوكيلاً عربياً كلها بـ-u-nu-latn · صفر افتراضي CLDR`);
} catch (e) { bad('فشل فحص أرقام العرض: ' + e.message); }

/* ── S) كل مسار يفتح مودال السن يركّب مبدّل عملة التكلفة ────────────
   الصنف عضّ مرّتين بيومين ومصدره واحد: وضع التحديد المتعدد يفتح
   toothModal بنفسه بدل المرور من openToothModal، فيرث ما هيّأته فتحةٌ
   سابقة بدل أن يهيّئ لنفسه. أوّل عرَض كان عنوان المودال عالقاً على سنّ
   وعلاجٍ آخَرين، والثاني أن مبدّل العملة يظهر أحياناً ويغيب أحياناً
   حسب ما إن سبقته فتحة سن مفرد بنفس تحميل الصفحة — وظهورٌ بالصدفة أسوأ
   من غيابٍ دائم لأن الطبيب لا يعرف متى يُعتمد عليه.
   الثابت المفروض: أي openModal('toothModal') يجب أن يسبقه — داخل الدالة
   نفسها — نداءُ mountToothCostPicker(). مسارٌ رابع يُفتح مستقبلاً بلا
   تركيب يوقف الكومِت بدل أن يعيد الصنف بصمت.
   ويُفرض معه أن التركيب مصدرٌ واحد: نداء الوحدة على toothCost مرّة
   واحدة بالأسطول كله، وإلا عادت المرآة التي أُلغيت. */
try {
  const OPEN = "openModal('toothModal')";
  const CALL = 'mountToothCostPicker()';
  let sites = 0, uncovered = 0, defs = 0, mounts = 0;
  for (const f of fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f)).sort()) {
    if (f === 'book.html') continue;
    const src = read(f);
    defs   += (src.match(/function mountToothCostPicker\s*\(/g) || []).length;
    mounts += (src.match(/CurPick\.mount\(\s*'toothCost'/g) || []).length;
    let at = src.indexOf(OPEN);
    while (at !== -1) {
      sites++;
      /* حدّ الدالة الحاوية: أقرب تعريف دالة قبل موضع الفتح. النطاق
         محافظ عمداً — لا يقفز فوق تعريف آخر فلا يُحتسب تركيبٌ لجارٍ. */
      const before = src.slice(0, at);
      const start = Math.max(
        before.lastIndexOf('\nfunction '),
        before.lastIndexOf('function '),
        before.lastIndexOf('= function')
      );
      const body = before.slice(start < 0 ? 0 : start);
      if (body.indexOf(CALL) === -1) {
        uncovered++;
        bad(`${f}:${before.split('\n').length} — يفتح toothModal بلا ${CALL} بالدالة نفسها`);
      }
      at = src.indexOf(OPEN, at + OPEN.length);
    }
  }
  if (sites === 0) bad('صفر موضع يفتح toothModal — الفحص فراغيّ، راجع المرساة');
  if (defs !== 1)  bad(`تعريف mountToothCostPicker ليس واحداً (${defs}) — المصدر الواحد انكسر`);
  if (mounts !== 1) bad(`تركيب toothCost بأكثر من موضع (${mounts}) — عادت المرآة`);
  if (!uncovered && sites && defs === 1 && mounts === 1) {
    ok(`مودال السن: ${sites} مسار فتح كلها تركّب مبدّل التكلفة · تعريف واحد · تركيب واحد`);
  }
} catch (e) { bad('فشل فحص تركيب مبدّل مودال السن: ' + e.message); }

/* ═══ U) تفريغ المبلغ عند تبديل العملة — مصدرٌ واحد ═══
   بلاغُ المالك: تبديلُ عملة طلب المخبر كان يعيد وسم الرقم بمكانه، فـ٤٠٠٬٠٠٠
   ليرة تصير ٤٠٠٬٠٠٠ دولاراً. القاعدة صارت: التبديل اليدوي يُفرّغ المبلغ.
   وهذا الصنف بالضبط هو ما يتعفّن بالتكرار — كان بالأسطول تفريغان محليّان
   مشروطان (مودال السن وحقل الجلسة) انحرفا عن بعضهما بشرطهما، فلو نزل ثالثٌ
   لسطحٍ جديد لاختلف عنهما بصمت. الثابت المفروض هنا:
     • التفريغ معرَّفٌ مرّةً واحدة بالوحدة المشتركة ومنادىً من نقرة الحبّة.
     • صفر سطحٍ يُفرّغ محلياً داخل خيارات mount.
     • الحقولُ التابعة مصرَّحةٌ بـclearAlso لا مكتوبةً بيد كلِّ سطح — تصفيرُ
       الإجمالي وترك القسط يبني خطةً نصفها بعملةٍ ونصفها بأخرى.
     • مساراتُ التعديل الثلاثة تفتح بعملة الصف المحفوظة (pin) — بدونها
       يُرسَل صفُّ الدولار موسوماً بعملة العيادة بلا أي نقرة تُفرّغ. */
try {
  const unit = read('supabase-init.js');
  const defs   = (unit.match(/function clearAmounts\s*\(/g) || []).length;
  const ones   = (unit.match(/function clearOne\s*\(/g) || []).length;
  const calls  = (unit.match(/_cleared = clearAmounts\(input, opts\);/g) || []).length;
  const clears = (unit.match(/node\.value = '';/g) || []).length;
  if (defs !== 1)  bad(`تعريف clearAmounts ليس واحداً (${defs}) — المصدر الواحد انكسر`);
  if (ones !== 1)  bad(`تعريف clearOne ليس واحداً (${ones})`);
  if (calls !== 1) bad(`نداء التفريغ من نقرة الحبّة ليس واحداً (${calls})`);
  if (clears !== 1) bad(`التفريغ الفعليّ ليس بموضعٍ واحد (${clears})`);

  /* صفر تفريغ محلي داخل أي خيارات mount بالأسطول */
  let sites = 0, local = 0;
  const need = { planTotal: "'planInst'", fldAmount: "'fldBonus'", tPrice: "'.t-ovr-inp'" };
  const seen = {};
  for (const f of fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f)).sort()) {
    if (f === 'book.html') continue;
    const src = read(f);
    let at = src.indexOf('CurPick.mount(');
    while (at !== -1) {
      sites++;
      let d = 0, k = src.indexOf('(', at), stop = k;
      for (let j = k; j < src.length; j++) {
        if (src[j] === '(') d++;
        else if (src[j] === ')') { d--; if (!d) { stop = j; break; } }
      }
      const args = src.slice(k, stop + 1);
      if (/\.value\s*=\s*''/.test(args)) {
        local++;
        bad(`${f}:${src.slice(0, at).split('\n').length} — تفريغٌ محليّ داخل mount؛ التفريغ عقدٌ مركزيّ`);
      }
      /* التصريح يُقرأ من مصفوفة clearAlso نفسها لا من نصّ الوسائط كلّه:
         ذكرُ المعرّف داخل جسم onChange ليس تصريحاً، وكلُّ موضع تركيبٍ لنفس
         الحقل يجب أن يحمله (سطحان لنفس الحقل ينحرفان بلا هذا). */
      for (const id of Object.keys(need)) {
        if (args.indexOf("'" + id + "'") < 0) continue;
        const ca = args.match(/clearAlso\s*:\s*\[([^\]]*)\]/);
        if (!ca || ca[1].indexOf(need[id]) < 0)
          bad(`${f}:${src.slice(0, at).split('\n').length} — ${id} بلا تصريح clearAlso لـ${need[id]}؛ حقلٌ تابع يبقى معبّأً بعملةٍ أخرى`);
        else seen[id] = (seen[id] || 0) + 1;
      }
      at = src.indexOf('CurPick.mount(', stop);
    }
  }
  if (sites === 0) bad('صفر موضع تركيب لمبدّل العملة — الفحص فراغيّ، راجع المرساة');
  for (const id of Object.keys(need))
    if (!seen[id]) bad(`${id} فقد تصريح clearAlso (${need[id]}) — حقلٌ تابع سيبقى معبّأً بعملةٍ أخرى`);

  /* مسارات التعديل الثلاثة تفتح بعملة الصف المحفوظة */
  const PINS = [
    ['expenses.html',  "pin('eAmount', (e.currency"],
    ['payouts.html',   "pin('fldAmount', (po.currency"],
    ['pp-plan.js',     "pin('planTotal', (pl.currency"]
  ];
  for (const [f, sig] of PINS) {
    const src = read(f);
    if (src.indexOf(sig) < 0) bad(`${f} — مسارُ التعديل لا يثبّت عملة الصف المحفوظة (${sig})`);
  }
  if (!local && sites && defs === 1 && calls === 1)
    ok(`تفريغ المبلغ عند تبديل العملة: تعريفٌ واحد · ${sites} موضع تركيب · صفر تفريغ محلي · ${Object.keys(need).length} تصريح clearAlso · ${PINS.length} مسار تعديلٍ مثبَّت`);
} catch (e) { bad('فشل فحص تفريغ المبلغ: ' + e.message); }

/* ═══ T) خريطتا حالات المخبر (بايت-بايت) + عقد المسودّة ═══
   طبقةٌ متوازية بلا حارس كانت تنتظر أن تنحرف: LAB_STATUSES وLAB_NEXT_STATUS
   معرَّفتان من جديد بـpp-core.js وبـlabs.html، ومتطابقتان اليوم بالصدفة لا
   بالعقد. وإضافةُ حالةٍ لواحدةٍ دون الأخرى لا ترمي خطأً — الصفّ يُرسَم بحالةٍ
   افتراضية بسطحٍ ويصحّ بالآخر، وهو بالضبط صنفُ الباغ الذي علّمتنا إياه v67.
   ومع M127 صار للخريطتين معنى ماليّ: 'draft' هي ما يُستثنى من كل ذمّة. ═══ */
console.log('T) حالات المخبر (بايت-بايت + عقد المسودّة):');
try {
  const FILES = ['pp-core.js', 'labs.html'];
  for (const cname of ['LAB_STATUSES', 'LAB_NEXT_STATUS']) {
    const vals = FILES.map(f => ({ id: f, v: extractConstValue(read(f), cname) }));
    const outs = vals.map(x => J(x.v));
    if (new Set(outs).size !== 1) {
      bad(`${cname} متباعدة: ` + vals.map((x, i) => `${x.id}=${outs[i]}`).join(' · '));
    }
  }
  const ST = extractConstValue(read('pp-core.js'), 'LAB_STATUSES');
  const NX = extractConstValue(read('pp-core.js'), 'LAB_NEXT_STATUS');
  /* عقد المسودّة: موجودةٌ بالخريطة، ومخرجُها الوحيد 'sent' (فعلٌ صريح بيد
     الطبيب — لا قلبَ تلقائياً من أي فعلٍ سريري)، ولا حالةَ أخرى تعود إليها
     فالمسودّة بدايةٌ لا محطّة. */
  if (!ST.draft) bad("LAB_STATUSES بلا 'draft' — M127 وسّعت القيد بلا واجهة");
  if (!NX.draft || NX.draft.next !== 'sent') bad("LAB_NEXT_STATUS.draft يجب أن يتقدّم إلى 'sent' حصراً");
  for (const k of Object.keys(NX)) {
    if (k !== 'draft' && NX[k].next === 'draft') bad(`${k} يعود إلى draft — المسودّة بداية لا محطّة`);
  }
  /* استثناءُ المسودّة من كل ذمّة — مفروضٌ عدّياً لا بالنيّة. الأسطح الخمسة
     تحسب التزاماً على العيادة، والمسودّة لم تُرسَل فلا التزام. */
  const DUE_SITES = [
    ['labs.html', 4],        // labsDueBag · labBalanceBag · كشف الحساب · تغطية FIFO
    ['accounting.html', 2],  // labPayableBag · نافذة المصروف
  ];
  let due = 0;
  for (const [f, n] of DUE_SITES) {
    const hits = (read(f).match(/_labIsDraft\s*\(/g) || []).length;
    if (hits < n) bad(`${f}: ${hits}/${n} موضع ذمّة يستثني المسودّة — الباقي يحسب التزاماً لم يُرسَل`);
    else due += hits;
  }
  const impls = FILES.concat(['accounting.html']).map(f => extractFunction(read(f), '_labIsDraft'));
  if (new Set(impls).size !== 1) bad('_labIsDraft متباعدة بين الأسطح الثلاثة');
  if (!failures) ok(`الخريطتان متطابقتان بايت-بايت · عقد المسودّة قائم · ${due} موضع ذمّة يستثنيها · المُحدِّد واحد بثلاثة ملفات`);
} catch (e) { bad('فشل فحص حالات المخبر: ' + e.message); }

/* ── V) v186: منتقي اللقب المهني (auth.html ↔ settings.html ↔ supabase-init.js) ──
   اللقب صار مكوّناً مستقلاً بسطحين — التسجيل والإعدادات — وقائمتُه تعيش
   بالوحدة المشتركة (SyDentName.TITLES) وهي نفسها ما تقنّنه split عند
   القراءة. لقبٌ يُعرض بمنتقٍ ولا تعرفه الوحدة يُحفظ ولا يُقنَّن أبداً،
   ولقبٌ بسطحٍ دون آخر يعني خياراً يملكه الطبيب بمكان ويفقده بمكان — وكلاهما
   لا يرمي خطأً بل ينحرف بصمت. ويُفرض معه غلافُ التدهور الرشيق (درس v187):
   وحدةٌ غائبة لتحميلٍ واحد يجب أن تُعيد الحقل واحداً لا أن تُسقط الصفحة. */
try {
  const mT = read('supabase-init.js').match(/TITLES:\s*\[([^\]]*)\]/);
  if (!mT) throw new Error('supabase-init.js: لم يُعثر على SyDentName.TITLES');
  const titles = mT[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  if (!titles.length) throw new Error('SyDentName.TITLES فارغة');

  const titleOptsOf = (file, id) => {
    const h = read(file);
    const m = h.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
    if (!m) throw new Error(file + ': لم يُعثر على <select id="' + id + '">');
    return [...m[1].matchAll(/<option value="([^"]*)"/g)].map(x => x[1]);
  };

  let tMis = 0;
  for (const [f, id] of [['auth.html', 'regTitle'], ['settings.html', 'fTitle']]) {
    const got = titleOptsOf(f, id).filter(v => v !== '');
    if (J(got) !== J(titles)) {
      tMis++;
      bad(`${f}#${id}: ألقاب المنتقي ${J(got)} ≠ SyDentName.TITLES ${J(titles)}`);
    }
  }
  /* الخيار النائب يختلف عمداً بين السطحين وهو عقدٌ لا زخرفة: التسجيل يركّب
     لقباً دائماً فلا معنى لخيارٍ فارغ فيه، والإعدادات تخدم حسابات محفوظة
     بلا لقب فغيابُ الخيار الفارغ يعيد افتراض «د.» يُقرأ حالةً — وهو العطب
     نفسه. ويُشدّ معه مسار الإسناد كي لا يعود الافتراض من باب الجافاسكربت. */
  const stgSrc = read('settings.html');
  if (titleOptsOf('settings.html', 'fTitle').filter(v => v === '').length !== 1) {
    tMis++; bad('settings.html#fTitle: خيار «بلا لقب» مفقود — الافتراض يعود يُقرأ حالةً');
  }
  if (titleOptsOf('auth.html', 'regTitle').some(v => v === '')) {
    tMis++; bad('auth.html#regTitle: خيارٌ فارغ بالتسجيل — التركيب يجب أن يحمل لقباً دائماً');
  }
  if (!/t\.value = nm\.title \|\| '';/.test(stgSrc)) {
    tMis++; bad('settings.html: إسناد المنتقي لا يتبع اللقب المخزَّن — افتراضٌ يُقرأ حالةً');
  }
  if (!/function\s+stgApplyNameFields\s*\(/.test(stgSrc)) {
    tMis++; bad('settings.html: stgApplyNameFields مفقودة — الإقلاع والحفظ ينحرفان');
  }
  for (const [f, g] of [['auth.html', 'regNameOk'], ['settings.html', 'stgNameOk']]) {
    const src = read(f);
    if (!new RegExp('function\\s+' + g + '\\s*\\(').test(src)) {
      tMis++; bad(`${f}: غلاف ${g} مفقود — الوحدة الغائبة تُسقط الصفحة بدل أن تتدهور`);
    }
    if (!new RegExp('!' + g + '\\(\\)').test(src)) {
      tMis++; bad(`${f}: المنتقي لا يُخفى عند غياب الوحدة — وعدٌ بلقبٍ لا يُركَّب`);
    }
  }
  if (!tMis) ok(`منتقي اللقب: ${titles.length} ألقاب مطابقة لـSyDentName.TITLES على السطحين · غلافا التدهور قائمان`);
} catch (e) { bad('فشل فحص منتقي اللقب: ' + e.message); }

/* ── W) شكل مفاتيح تفعيل الميزات بصفحة الإعدادات (bk-switch) ─────────────
   كل حبّة تفعّل ميزةً أو تُطفئها هي **مفتاح تبديل** لا مربّع اختيار: أربعتها
   تعيش بشاشةٍ واحدة يتنقّل بينها الطبيب بالتبويبات، فحبّةٌ بشكلٍ مختلف تُقرأ
   ضابطاً مختلفاً. ومربّعُ الاختيار يبقى الشكل الصحيح للاختيار من متعدد
   (أيام العمل) ولحقلٍ داخل مودال — فالفحص مقصورٌ على الأربعة بالاسم لا على
   كل حبّةٍ بالصفحة، وإضافةُ مفتاحٍ خامس مستقبلاً تُضاف هنا صراحةً. */
try {
  const stg = read('settings.html');
  const SWITCHES = ['fLicenseOnRx', 'fMultiCurrency', 'fNoShowFeeEnabled', 'bkEnabled', 'aiEnabled'];
  let wMis = 0;
  for (const id of SWITCHES) {
    const m = stg.match(new RegExp('<input type="checkbox" id="' + id + '"([^>]*)>'));
    if (!m) { wMis++; bad(`settings.html: حبّة ${id} غير موجودة بالصيغة المتوقّعة`); continue; }
    if (!/class="bk-switch"/.test(m[1])) { wMis++; bad(`settings.html: ${id} ليست bk-switch — حبّةٌ بشكلٍ مختلف تُقرأ ضابطاً مختلفاً`); }
    if (/accent-color|width:\s*18px/.test(m[1])) { wMis++; bad(`settings.html: ${id} تحمل نمط مربّع الاختيار القديم`); }
    if (!new RegExp('<label for="' + id + '"').test(stg)) { wMis++; bad(`settings.html: ${id} بلا <label for> — النقر على النصّ لا يبدّلها`); }
  }
  if (/input\.bk-switch:checked\s*\{/.test(stg) === false) { wMis++; bad('settings.html: تعريف bk-switch مفقود'); }
  if (!wMis) ok(`مفاتيح التفعيل: ${SWITCHES.length} حبّات بشكلٍ واحد (bk-switch) ولكلٍّ لصيقتها القابلة للنقر`);
} catch (e) { bad('فشل فحص مفاتيح التفعيل: ' + e.message); }

/* ── X) بوابة اليوم بأزرار تتبّع الوقت (appt-time.js) ─────────────────────
   ثابتٌ سلوكيّ لا مرآة بايتية: مراحلُ الحضور الفيزيائي (وصل · جلس · خرج)
   تُعرض بيوم الموعد حصراً، والتأكيدُ (📞) يبقى متاحاً لأي تاريخ.
   نزعُ البوابة لا يرمي شيئاً ولا يُحمِّر حارساً نصّياً — الزرُّ يظهر ببساطة
   على موعد الأسبوع القادم فيُختم حضورٌ لم يقع (بلاغ حيّ من المالك).
   والفحص يشغّل الدالة الحيّة بمتجهات لا يوكّد على نصّها (درس #433).
   ملاحظة مقيسة: لوحة التحكم سليمة بنيوياً — استعلامها .eq('date', today)
   فبطاقتها لا ترى إلا اليوم؛ ويُثبَّت ذلك هنا كي لا يتسرّب الصنفُ إليها
   بصمت لو وُسِّع الاستعلام لاحقاً. */
try {
  const atSrc = read('appt-time.js');
  const stagesM = atSrc.match(/var TIME_STAGES = \[[\s\S]*?\];/);
  const presM   = atSrc.match(/var PRESENCE_STAGE_KEYS = \[[^\]]*\];/);
  if (!stagesM) throw new Error('TIME_STAGES غير موجودة بالصيغة المتوقّعة');
  if (!presM)   throw new Error('PRESENCE_STAGE_KEYS غير موجودة — بوابةُ اليوم مفكوكة');

  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
                 + '-' + String(d.getDate()).padStart(2, '0');
  const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

  const ctx = vm.createContext({
    Date,
    isFinishedStatus: s => s === 'completed' || s === 'cancelled' || s === 'broken' || s === 'no_show',
    dateStr: ymd
  });
  vm.runInContext(
    stagesM[0] + '\n' + presM[0] + '\n'
    + extractFunction(atSrc, 'isApptToday') + '\n'
    + extractFunction(atSrc, 'getNextTimeAction'),
    ctx
  );

  const nextKey = a => { const r = ctx.getNextTimeAction(a); return r ? r.key : null; };
  const TODAY = ymd(new Date());
  let xMis = 0;
  const xCase = (label, appt, exp) => {
    const got = nextKey(appt);
    if (got !== exp) { xMis++; bad(`بوابة اليوم: ${label} — توقّع ${exp} · جاء ${got}`); }
  };

  /* اليوم: السلّم الرباعي كاملاً كما كان قبل البوابة (صفر انحدار) */
  xCase('اليوم بلا أختام → تأكيد',  { date: TODAY, status: 'scheduled' }, 'confirmed_at');
  xCase('اليوم مؤكَّد → وصل',       { date: TODAY, status: 'confirmed', confirmed_at: 'x' }, 'arrived_at');
  xCase('اليوم وصل → جلس',          { date: TODAY, status: 'confirmed', confirmed_at: 'x', arrived_at: 'x' }, 'seated_at');
  xCase('اليوم جلس → خرج',          { date: TODAY, status: 'confirmed', confirmed_at: 'x', arrived_at: 'x', seated_at: 'x' }, 'dismissed_at');
  xCase('اليوم مكتمل الأختام → لا زر', { date: TODAY, status: 'completed', confirmed_at: 'x', arrived_at: 'x', seated_at: 'x', dismissed_at: 'x' }, null);

  /* غير اليوم: التأكيد يمرّ · الحضور محجوب — جوهر البوابة */
  xCase('غداً بلا أختام → تأكيد',   { date: shift(1),  status: 'scheduled' }, 'confirmed_at');
  xCase('غداً مؤكَّد → لا زر حضور',  { date: shift(1),  status: 'confirmed', confirmed_at: 'x' }, null);
  xCase('بعد أسبوع مؤكَّد → لا زر',  { date: shift(7),  status: 'confirmed', confirmed_at: 'x' }, null);
  xCase('أمس مؤكَّد → لا زر',        { date: shift(-1), status: 'confirmed', confirmed_at: 'x' }, null);
  xCase('غداً وصل (صفٌّ قديم) → لا زر', { date: shift(1), status: 'confirmed', confirmed_at: 'x', arrived_at: 'x' }, null);

  /* حالات حدّية */
  xCase('مخطَّط بلا تاريخ → لا زر حضور', { date: null, status: 'confirmed', confirmed_at: 'x' }, null);
  xCase('ملغى اليوم → لا زر',        { date: TODAY, status: 'cancelled' }, null);
  xCase('لم يحضر اليوم → لا زر',     { date: TODAY, status: 'no_show', confirmed_at: 'x' }, null);
  xCase('appt = null → لا زر',       null, null);

  /* ثابتٌ بنيويّ: البوابة تغطّي كل مرحلةٍ غير التأكيد — فمرحلةٌ خامسة
     تُضاف لاحقاً لا تفلت منها بصمت. */
  const stageKeys = ctx.TIME_STAGES.map(s => s.key);
  const expectedPresence = stageKeys.filter(k => k !== 'confirmed_at');
  if (J(expectedPresence.slice().sort()) !== J(ctx.PRESENCE_STAGE_KEYS.slice().sort())) {
    xMis++;
    bad(`بوابة اليوم: PRESENCE_STAGE_KEYS لا تغطّي كل مراحل الحضور — ${J(ctx.PRESENCE_STAGE_KEYS)} مقابل ${J(expectedPresence)}`);
  }

  /* السطح الموازي: بطاقة لوحة التحكم يجب أن تبقى مقيّدة بتاريخ اليوم.
     التوكيد مربوطٌ بالاستعلام الذي يغذّي _dashApptsToday بعينه لا بأي
     ورودٍ للقيد بالملف — index.html يحمل ثلاثة مواضع تحمل نفس القيد،
     وتوكيدٌ عامّ عليها كان يمرّ ولو وُسِّع استعلام اللوحة (قاعدة #442). */
  const idxSrc = read('index.html');
  const sinkRe = /_dashApptsToday\s*=\s*apptsToday\s*;/g;
  const sinkHits = idxSrc.match(sinkRe) || [];
  if (sinkHits.length !== 1) {
    xMis++;
    bad(`لوحة التحكم: مُسنِد _dashApptsToday غير فريد (${sinkHits.length}) — مرساةُ الفحص ما عادت تصف الاستعلام`);
  } else {
    const sinkAt = idxSrc.search(sinkRe);
    const qAt = idxSrc.lastIndexOf("from('appointments')", sinkAt);
    if (qAt < 0) {
      xMis++;
      bad('لوحة التحكم: ما لقيت استعلام appointments قبل مُسنِد _dashApptsToday');
    } else {
      const qSlice = idxSrc.slice(qAt, sinkAt);
      if (!/\.eq\('date',\s*today\)/.test(qSlice)) {
        xMis++;
        bad('لوحة التحكم: استعلام مواعيد اليوم ما عاد مقيّداً بـeq(date, today) — بطاقتها سترث صنف «وصل على موعدٍ غير اليوم»');
      }
    }
  }

  if (!xMis) ok('بوابة اليوم بتتبّع الوقت: 14 متجهاً + تغطية المراحل + قيد استعلام اللوحة');
} catch (e) { bad('فشل فحص بوابة اليوم: ' + e.message); }

/* ── V5) v336: تبويبُ «المواعيد» ببطاقة المريض ────────────────────────────────
   التصنيفُ مصدرٌ واحد بمعيار قفل v335 (حالةٌ منتهية أو ختمُ خروج)، والماضي بلا
   أختامٍ ولا حالةٍ منتهية «بلا نتيجة» لا تخمين. الحارسُ يشغّل pp-appt.js الحيّ
   كاملاً بـvm بلا DOM، ويثبت: الترتيبَ والوصلات · صفرَ كتابة بالتبويب · التصنيفَ ·
   «أُعيد الحجز» بالنوع نفسه · الهروبَ · وأن اختيارَ نوع المخطّط ينجو من البناء غير
   المتزامن (باغٌ قائم: «📅 جدولة الآن» كانت تحفظ أولَ علاجٍ بالقائمة). */
try {
  const ppa = read('pp-appt.js'), pph = read('patient-profile.html'), ppt = read('pp-timeline.js');
  let apMis = 0;
  const miss = m => { apMis++; bad(m); };
  // (1) الترتيب والوصلات
  const iPost = pph.indexOf("switchTab('postop',this)"), iAppts = pph.indexOf("switchTab('appts',this)"),
        iAudit = pph.indexOf("switchTab('audit',this)"), iTl = pph.indexOf("switchTab('timeline',this)");
  if (!(iPost > 0 && iPost < iAppts && iAppts < iAudit && iAudit < iTl)) miss('تبويبُ المواعيد ليس بين «تعليمات» و«سجل النشاطات»');
  ['id="tab-appts"', 'id="apptsBadge"', 'id="apptsContent"', 'id="apptsSummary"', 'id="apptsChips"', 'id="aPatApptsNote"'].forEach(t => {
    if (pph.split(t).length !== 2) miss('patient-profile.html: ' + t + ' مفقودٌ أو مكرَّر');
  });
  if (!/addEventListener\('pageshow', function\(e\) \{\s*if \(e && e\.persisted && currentUser/.test(pph)) miss('الرجوعُ من bfcache لا يعيد التحميل');
  const oam = extractFunction(pph, 'openApptModal');
  if (!/var typesReady = populateApptTypes\(\);/.test(oam) || !/return typesReady;\s*\}$/.test(oam)) miss('openApptModal لا يُعيد وعدَ بناء الأنواع (إعادةُ الحجز تنتظره)');
  // (2) المصدر: الأختام مجلوبة وrenderTimeline يجدّد التبويب أولاً
  const lat = extractFunction(ppt, 'loadAllAppointmentsForTimeline');
  if (!/select\('[^']*arrived_at, seated_at, dismissed_at'\)/.test(lat)) miss('استعلامُ كل المواعيد لا يجلب أختامَ الحضور');
  if (!/^function renderTimeline\(\) \{\s*(\/\*[\s\S]*?\*\/\s*)?try \{ if \(typeof renderApptsTab === 'function'\) renderApptsTab\(\); \} catch/.test(extractFunction(ppt, 'renderTimeline'))) miss('renderTimeline لا يجدّد التبويب أولَ سطر (قبل خروجها المبكر)');
  // (3) صفرُ كتابة بقسم التبويب — إلا ختمُ الحضور (v338) بدالّته وحدها
  const stampFn = extractFunction(ppa, '_ppApptStamp_inner');
  const sec = ppa.slice(ppa.indexOf('v336 — تبويب «المواعيد»')).split(stampFn).join('');
  if (!sec || /\.(insert|update|delete|upsert)\(|\.from\(/.test(sec)) miss('قسمُ التبويب بـpp-appt.js يكتب أو يستعلم خارج ختم الحضور — الكتابةُ بصفحة المواعيد (قفل v335) أو بالدوال القائمة');
  // (4) باغُ اختيار النوع
  const pat = extractFunction(ppa, 'populateApptTypes');
  if (!/^async function populateApptTypes\(keepVal\)/.test('async ' + pat) || !/if \(keepVal\) \{\s*sel\.value = keepVal;/.test(pat)) miss('populateApptTypes لا تحفظ الاختيارَ بعد البناء');
  ['editPlannedFromProfile', 'quickSchedulePlannedFromProfile'].forEach(fn => {
    const b = extractFunction(ppa, fn);
    const iFound = b.indexOf('var _foundT = null;'), iPop = b.indexOf('populateApptTypes(_foundT ? _foundT.id : null)');
    if (iFound < 0 || iPop < iFound || /populateApptTypes\(\);/.test(b)) miss(fn + ': يبني الأنواع بلا الاختيار ⇒ يُحفظ أولُ علاج');
  });
  // (5) سلوكٌ حيّ
  const noop = () => {};
  const ctx = { console: { log: noop, warn: noop, error: noop }, Date, Math, JSON, String };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(`
    function ppGuarded(n, f){ return f; }
    function escapeHtml(s){ if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function fmtDNum(d){ var p = String(d).slice(0,10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
    function fmtTime12(t){ return String(t).slice(0,5); }
    function _sanHex(h){ return /^#[0-9a-f]{3,8}$/i.test(String(h)) ? h : '#0d8577'; }
    var CLINIC_DOCTORS = [{id:'d1', name:'<u>د</u>', color:'red;background:url(x)'}], TREATMENTS = [{id:'k1', dbId:'t1', name:'تنظيف', fill:'#123456'}],
        sessions = [], patient = {phone:'09'}, lastReminderLogByAppt = {}, allAppointmentsForTl = [];`, ctx);
  vm.runInContext(ppa, ctx);
  const R = c => vm.runInContext(c, ctx);
  const T = '2026-09-16';
  const cases = [
    [{date:'2026-09-20', status:'confirmed'}, 'upcoming'],
    [{date:T, status:'confirmed', arrived_at:1}, 'upcoming'],
    [{date:T, status:'confirmed', arrived_at:1, dismissed_at:1}, 'attended'],
    [{date:'2026-08-03', status:'confirmed'}, 'unresolved'],
    [{date:'2026-08-03', status:'pending'}, 'unresolved'],
    [{date:'2026-08-03', status:'confirmed', seated_at:1}, 'attended'],
    [{date:'2026-08-03', status:'confirmed', arrived_at:1, dismissed_at:1}, 'attended'],
    [{date:'2026-08-03', status:'completed'}, 'attended'],
    [{date:'2026-07-08', status:'no_show', arrived_at:1, dismissed_at:1}, 'missed'],
    [{date:'2026-07-08', status:'broken'}, 'missed'],
    [{date:'2026-10-08', status:'cancelled'}, 'cancelled'],
    [{date:'2026-10-08', status:'confirmed', is_planned:true}, 'planned'],
    [{status:'confirmed'}, 'planned'],
    [{date:'2026-10-08', status:'confirmed', dismissed_at:1}, 'attended'],
  ];
  cases.forEach(([a, want]) => {
    const got = R('ppApptBucket(' + JSON.stringify(a) + ', "' + T + '")');
    if (got !== want) miss('التصنيف: ' + JSON.stringify(a) + ' ⇒ ' + got + ' بدل ' + want);
  });
  R(`var __L = [{id:'m', date:'2026-07-09', status:'no_show', type:'حشوة'}, {id:'o', date:'2026-09-25', status:'confirmed', type:'زراعة'},
     {id:'c', date:'2026-09-01', status:'cancelled', type:'تنظيف', treatment_id:'t1'}, {id:'u', date:'2026-09-20', status:'confirmed', type:'تنظيف ٢', treatment_id:'t1'},
     {id:'x', date:'2026-10-01', status:'confirmed', type:'<img src=x onerror=1>', notes:'<script>1</script>', provider_id:'d1'}];
     var __g = ppApptGroups(__L, '${T}');`);
  if (R("ppApptRebookedBy(__L[0], __g)") !== null) miss('«أُعيد الحجز»: موعدٌ لاحقٌ من نوعٍ آخر عُدّ إعادةَ حجز');
  if (R("(ppApptRebookedBy(__L[2], __g) || {}).kind") !== 'upcoming') miss('«أُعيد الحجز»: مطابقةُ العلاج بالمعرّف لا تعمل');
  if (!/data-appt-act="rebook"/.test(R("ppApptRowHtml(__L[0], 'missed', __g, '" + T + "')"))) miss('الفائتُ بلا موعدٍ لاحق من نوعه بلا زرّ «إعادة حجز»');
  if (/data-appt-act="rebook"/.test(R("ppApptRowHtml(__L[2], 'cancelled', __g, '" + T + "')"))) miss('الملغى المُعاد حجزُه ما زال يعرض «إعادة حجز»');
  const evil = R("ppApptRowHtml(__L[4], 'upcoming', __g, '" + T + "') + ppApptNextHtml(ppApptGroups([__L[4]], '" + T + "'), '" + T + "')");
  if (/<img|<script|<u>|url\(/.test(evil)) miss('الهروب: نصٌّ حرّ أو لونُ طبيبٍ دخل HTML بلا تهريب');
  if (!/>حضر</.test(R("ppApptRowHtml({id:'a', date:'2026-08-03', status:'confirmed', dismissed_at:'2026-08-03T10:00:00Z'}, 'attended', __g, '" + T + "')"))) miss('#106: «مؤكد» بعد الخروج لا يُقرأ «حضر»');
  if (R("ppApptRel('2026-09-18', '" + T + "')") !== 'بعد يومين' || R("ppApptRel('2025-09-26', '" + T + "')") !== 'قبل سنة') miss('الزمنُ النسبي: المثنّى أو السنة');
  if (!apMis) ok('تبويب المواعيد: الترتيب · الوصلات · صفر كتابة · 14 حالةَ تصنيف · إعادةُ الحجز بالنوع · الهروب · اختيارُ نوع المخطّط ينجو');
} catch (e) { bad('فشل فحص تبويب المواعيد: ' + e.message); }

/* ── V6) v338: أزرارُ الحضور بتبويب المواعيد ─────────────────────────────────
   بوابةُ اليوم مرآةُ صفحة المواعيد (الحضورُ بيوم الموعد وحده) بلا 📞 كلوحة
   التحكم؛ الكتابةُ ختمٌ واحد من قائمةٍ مغلقة محصورٌ بالمعرّف والعيادة ويُشترط
   صفٌّ واحد؛ و«خرج» على علاجاتٍ مخطّطة أو مخابرَ قيد التسليم يُحال لنافذة
   الإكمال الموحّدة (?dismiss=) قبل أي كتابة. */
try {
  const ppa = read('pp-appt.js');
  let stMis = 0;
  const miss = m => { stMis++; bad(m); };
  const fn = extractFunction(ppa, '_ppApptStamp_inner');
  if (!/var allowed = \['arrived_at', 'seated_at', 'dismissed_at'\];\s*if \(allowed\.indexOf\(fieldKey\) === -1\) return false;/.test(fn)) miss('ختمُ البطاقة بلا قائمة مفاتيح مغلقة (أو تضمّ confirmed_at)');
  if ((fn.match(/\.update\(/g) || []).length !== 1 || !/\.update\(patch\)\s*\.eq\('id', apptId\)\.eq\('doctor_id', currentUser\.id\)\.select\('id'\)/.test(fn)) miss('ختمُ البطاقة: التحديثُ غيرُ محصور بالمعرّف والعيادة أو بلا select');
  if (!/res\.data\.length !== 1/.test(fn)) miss('ختمُ البطاقة يعلن نجاحاً بلا صفٍّ محدَّث (درس v334)');
  const iDis = fn.indexOf("if (fieldKey === 'dismissed_at')"), iRoute = fn.indexOf("'appointments.html?dismiss='"), iUpd = fn.indexOf('.update(');
  if (!(iDis > 0 && iDis < iRoute && iRoute < iUpd)) miss('«خرج» لا يمرّ بنافذة الإكمال قبل الكتابة');
  if (!/if \(!stg \|\| stg\.key !== fieldKey\)/.test(fn)) miss('ختمُ البطاقة لا يعيد فحصَ المرحلة قبل الكتابة (واجهةٌ متقادمة)');
  if (!/^var ppApptStamp = ppGuarded\('ppApptStamp', _ppApptStamp_inner/m.test(ppa)) miss('ختمُ البطاقة غيرُ مقفول ضد النقرة المزدوجة');
  const noop = () => {};
  const ctx = { console: { log: noop, warn: noop, error: noop }, Date, Math, JSON, String };
  vm.createContext(ctx);
  vm.runInContext(`function ppGuarded(n, f){ return f; } function escapeHtml(s){ return String(s == null ? '' : s).replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
    var sessions = [{id:'s1', appointment_id:'a', status:'planned'}, {id:'s2', appointment_id:'b', status:'completed'}],
        labOrders = [{id:'l1', appointment_id:'c', status:'received'}, {id:'l2', appointment_id:'b', status:'delivered'}];`, ctx);
  vm.runInContext(ppa, ctx);
  const T = '2026-09-16';
  const S = a => { const r = vm.runInContext('ppApptNextStage(' + JSON.stringify(a) + ', "' + T + '")', ctx); return r ? r.key : null; };
  const vec = [
    [{date:T, status:'confirmed'}, 'arrived_at', 'اليوم بلا أختام'],
    [{date:T + 'T00:00:00', status:'pending'}, 'arrived_at', 'معلّقٌ اليوم'],
    [{date:T, status:'confirmed', arrived_at:1}, 'seated_at', 'بعد الوصول'],
    [{date:T, status:'confirmed', seated_at:1}, 'arrived_at', 'جلوسٌ بلا وصول ⇒ الوصولُ أولاً (ترتيبُ صفحة المواعيد)'],
    [{date:T, status:'confirmed', arrived_at:1, seated_at:1}, 'dismissed_at', 'بعد الجلوس'],
    [{date:T, status:'confirmed', arrived_at:1, seated_at:1, dismissed_at:1}, null, 'مختومُ الخروج'],
    [{date:T, status:'confirmed', dismissed_at:1}, null, 'خروجٌ بلا وصول'],
    [{date:'2026-09-17', status:'confirmed'}, null, 'الغد'],
    [{date:'2026-09-15', status:'confirmed'}, null, 'الأمس'],
    [{date:T, status:'completed'}, null, 'مكتمل'],
    [{date:T, status:'no_show'}, null, 'عدم حضور'],
    [{date:T, status:'broken'}, null, 'broken'],
    [{date:T, status:'cancelled'}, null, 'ملغى'],
    [{date:T, status:'confirmed', is_planned:true}, null, 'مخطّط بتاريخ'],
    [{status:'confirmed'}, null, 'بلا تاريخ'],
  ];
  vec.forEach(([a, exp, lbl]) => { const got = S(a); if (got !== exp) miss('بوابة البطاقة: ' + lbl + ' — توقّع ' + exp + ' · جاء ' + got); });
  const keys = vm.runInContext('PP_APPT_STAGES.map(function(s){ return s.key; }).join(",")', ctx);
  if (keys !== 'arrived_at,seated_at,dismissed_at') miss('مراحلُ البطاقة ≠ مراحل الحضور الثلاث بترتيبها: ' + keys);
  const load = id => vm.runInContext('(function(){ var l = ppApptDismissLoad("' + id + '"); return l.planned.length + "/" + l.labs.length; })()', ctx);
  if (load('a') !== '1/0' || load('b') !== '0/0' || load('c') !== '0/1') miss('حملُ الخروج: مخطّطٌ/مخبرٌ قيد التسليم لا يُكشف كما يجب (' + load('a') + ' · ' + load('b') + ' · ' + load('c') + ')');
  const btn = vm.runInContext('ppApptStageBtnHtml({id:"x\\"><img>", date:"' + T + '", status:"confirmed"}, "' + T + '")', ctx);
  if (!/data-stage="arrived_at"/.test(btn) || /<img/.test(btn)) miss('زرُّ المرحلة: المفتاحُ أو الهروب');
  if (vm.runInContext('ppApptStageBtnHtml({id:"y", date:"2026-09-17", status:"confirmed"}, "' + T + '")', ctx) !== '') miss('زرُّ المرحلة يظهر لموعدٍ غير اليوم');
  if (!stMis) ok('أزرار الحضور بتبويب المواعيد: 15 متجهاً لبوابة اليوم · قائمةٌ مغلقة · تحديثٌ محصور بصفٍّ واحد · «خرج» يمرّ بنافذة الإكمال');
} catch (e) { bad('فشل فحص أزرار الحضور بالبطاقة: ' + e.message); }

/* ── V7) v342: مسودة الشرح فوق المخطط ─────────────────────────────────────────
   العقد: (1) المسودة طبقة شرح لا تعديل — مداخل التعديل الأربعة بـpp-dental.js
   وتبديلُ الأوضاع الثلاثة ترفض ما دامت مفتوحة؛ (2) الرسم بالذاكرة وحدها — صفر
   تخزين محلي وصفر قاعدة بيانات بالكتلة، والكتابة الوحيدة رفعٌ صريح عبر
   SyDentFiles.upload؛ (3) التصغير عبر متغيّرٍ على body لا على #jawWrap (نسخة
   الطباعة تستنسخ #jawWrap بسماته)؛ (4) الإغلاق يمسح البكسلات والذاكرة، وتبديل
   التبويب يغلقها؛ (5) سلوكياً: التراجع/مسح الكل/حدود الرسم. */
try {
  let dfMis = false;
  const miss = m => { dfMis = true; bad('مسودة الشرح: ' + m); };
  const ppm = read('pp-modules.js'), ppd = read('pp-dental.js'), pph = read('patient-profile.html'), ppc = read('patient-profile.css');
  const GATE = /if \(window\.__draftMode\) \{ showToast\('✏️ أغلق المسودة أولاً'\); return; \}/;
  ['openToothModal', 'endToothWatch', 'openNewSessionEntry', 'openRegionalTreatmentPicker'].forEach(fn => {
    const body = extractFunction(ppd, fn);
    if (!body) { miss('الدالة ' + fn + ' غير موجودة بـpp-dental.js'); return; }
    const g = body.search(GATE);
    if (g < 0) { miss(fn + ' بلا بوابة المسودة'); return; }
    const firstAwait = body.indexOf('await ');
    const firstWrite = body.search(/\.(update|insert|upsert|delete)\(/);
    if ((firstAwait > -1 && firstAwait < g) || (firstWrite > -1 && firstWrite < g)) miss(fn + ': البوابة بعد أول await/كتابة');
  });
  [['toggleBatchMode', ppm], ['toggleExamMode', ppm], ['toggleHistoryMode', pph]].forEach(([fn, src]) => {
    const body = extractFunction(src, fn);
    if (!body || !GATE.test(body)) miss(fn + ' لا يرفض والمسودة مفتوحة');
  });
  const sw = extractFunction(pph, 'switchTab') || '';
  if (!/if \(name !== 'file' && window\.__draftMode && typeof draftClose === 'function'\) draftClose\(\);/.test(sw)) miss('switchTab لا يغلق المسودة عند مغادرة تبويب الملف');
  const a = ppm.indexOf('═══ ✏️ مسودة الشرح (v342)'), z = ppm.indexOf('═══ end ✏️ مسودة الشرح');
  if (a < 0 || z < a) { miss('ماركرات الكتلة مفقودة بـpp-modules.js'); }
  else {
    const blk = ppm.slice(ppm.indexOf('*/', a) + 2, z).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (/localStorage|sessionStorage|indexedDB|\.from\(|\.rpc\(|document\.cookie/.test(blk)) miss('الكتلة تلمس تخزيناً محلياً أو القاعدة');
    const ups = blk.match(/\.upload\(/g) || [];
    if (ups.length !== 1 || !/window\.SyDentFiles\.upload\(patientId,/.test(blk)) miss('الكتابة الوحيدة يجب أن تكون SyDentFiles.upload مرة واحدة');
    if (/\.style\.zoom|jawWrap[^;\n]*setProperty/.test(blk)) miss('التصغير يُضبط على #jawWrap بدل body');
    if (!/document\.body\.style\.setProperty\('--draft-z'/.test(blk)) miss('التصغير لا يمرّ بمتغيّر body');
    const cl = extractFunction(ppm, 'draftClose') || '';
    if (!/cv\.width = 0; cv\.height = 0;/.test(cl) || !/d\.strokes\.length = 0; d\.hist\.length = 0;/.test(cl) || !/removeProperty\('--draft-z'\)/.test(cl)) miss('draftClose لا يمسح البكسلات/الذاكرة/التصغير');
    const kd = extractFunction(ppm, 'draftKeyDown') || '';
    if (kd.indexOf('ppAnyModalOpen') < 0 || kd.indexOf('ppAnyModalOpen') > kd.indexOf("'Escape'")) miss('Escape يغلق المسودة قبل فحص المودالات');
  }
  if (!/body\.draft-on #jawWrap\{zoom:var\(--draft-z,1\);overflow-x:hidden;\}/.test(ppc)) miss('قاعدة التصغير CSS مفقودة أو تغيّرت');
  if (!/id="draftToggleBtn"/.test(pph) || !/id="draftCanvas"/.test(pph) || !/id="draftBar"/.test(pph)) miss('عناصر المسودة مفقودة من الصفحة');
  // سلوكياً — التراجع/المسح/الحدود على الدوال الحيّة
  const ctx = vm.createContext({ Math, window: {}, document: { documentElement: { getAttribute: () => 'light' } } });
  vm.runInContext(['DRAFT_COLORS', 'DRAFT_WIDTHS'].map(n => {
    const m = new RegExp('var ' + n + ' = [\\s\\S]*?;\\n').exec(ppm); return m ? m[0] : '';
  }).join('') + ['draftInk', 'draftColorOf', 'draftUndo', 'draftClearAll', 'draftStrokeBounds', 'draftRadius', 'draftCssColorAlpha'].map(f => extractFunction(ppm, f)).join('\n') +
    '\nvar _draft = { cur: null, strokes: [], hist: [] }; function draftSyncUI(){} function draftScheduleRedraw(){}', ctx);
  const R = c => vm.runInContext(c, ctx);
  R("_draft.strokes.push({t:'p',c:'red',w:3,p:[0,0,10,0]}); _draft.hist.push({a:'add'}); _draft.strokes.push({t:'e',c:'red',w:40,p:[500,500]}); _draft.hist.push({a:'add'});");
  R('draftClearAll()');
  if (R('_draft.strokes.length') !== 0) miss('مسح الكل لا يفرّغ الرسم');
  R('draftUndo()');
  if (R('_draft.strokes.length') !== 2) miss('التراجع بعد مسح الكل لا يعيد الرسم');
  if (R('JSON.stringify(draftStrokeBounds(_draft.strokes))') !== J({ l: -1.5, t: -1.5, r: 11.5, b: 1.5 })) miss('حدود الرسم تحسب الممحاة أو تُهمل السماكة: ' + R('JSON.stringify(draftStrokeBounds(_draft.strokes))'));
  R('draftUndo(); draftUndo();');
  if (R('_draft.strokes.length') !== 0 || R('_draft.hist.length') !== 0) miss('التراجع المتتالي لا يعود للفراغ');
  R("_draft.cur = {}; _draft.strokes.push({t:'p',p:[0,0]}); _draft.hist.push({a:'add'}); draftUndo(); draftClearAll();");
  if (R('_draft.strokes.length') !== 1) miss('التراجع/المسح أثناء خطٍّ جارٍ يجب أن يُتجاهل');
  if (R("draftColorOf('ink')") !== '#111827' || R("draftColorOf('blue')") !== '#3b82f6') miss('ألوان المسودة/الحبر');
  if (R("draftRadius('50%', 18, 18)") !== 9 || R("draftRadius('12px', 10, 40)") !== 5) miss('نصف القطر بالنسبة المئوية/السقف');
  if (R("draftCssColorAlpha('rgba(0, 0, 0, 0)')") !== 0 || R("draftCssColorAlpha('rgb(1, 2, 3)')") !== 1 || R("draftCssColorAlpha('transparent')") !== 0) miss('كشف الشفافية');
  if (!dfMis) ok('مسودة الشرح: 4 مداخل + 3 أوضاع ترفض · صفر تخزين/قاعدة · رفعٌ صريح واحد · التصغير على body · الإغلاق يمسح · تراجع/مسح/حدود سلوكياً');
} catch (e) { bad('فشل فحص مسودة الشرح: ' + e.message); }

/* ── V8) v343: مفتاح التخزين ASCII حصراً (SyDentFiles.sanitizeName) ───────────────
   Supabase Storage يرفض أي مفتاح خارج isValidKey (storage-api — \w بلا علم u =
   ASCII) بـ«Invalid key». الدالة الوحيدة التي تبني الجزء المقروء من المفتاح تُشغَّل
   حيّةً على أسماء عربية/مختلطة/رموز، والمفتاح الكامل كما يبنيه upload يُطابَق
   بقاعدة Supabase حرفياً؛ والامتداد اللاتيني يُحفظ؛ والاسم المعروض يبقى الأصلي. */
try {
  let skMis = false;
  const miss = m => { skMis = true; bad('مفتاح التخزين: ' + m); };
  const si = read('supabase-init.js');
  const fnSrc = extractFunction(si, 'sanitizeName');
  if (!fnSrc) throw new Error('sanitizeName غير موجودة بـsupabase-init.js');
  const SB_VALID = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;   // storage-api isValidKey
  const ctxK = vm.createContext({});
  vm.runInContext(fnSrc, ctxK);
  const SN = n => vm.runInContext('sanitizeName(' + J(n) + ')', ctxK);
  const vecK = [
    ['مسودة-المخطط-2026-09-16_19-34.jpg', '2026-09-16_19-34.jpg'],
    ['أشعة بانورامية.png', 'file.png'],
    ['ملف.pdf', 'file.pdf'],
    ['report (1).pdf', 'report_1.pdf'],
    ['X-Ray_01.JPEG', 'X-Ray_01.JPEG'],
    ['صورة.صورة', 'file'],
    ['....', 'file'],
    ['', 'file'],
    ['a%b#c.png', 'a_b_c.png'],
    ['كشف-حساب 2026.xlsx', '2026.xlsx'],
    ['😀 سن ١٦.webp', 'file.webp']
  ];
  vecK.forEach(([n, exp]) => {
    const got = SN(n);
    if (got !== exp) miss(J(n) + ' → ' + J(got) + ' (المتوقّع ' + J(exp) + ')');
    const key = '9d7d2956-b11b-43ea-aee2-c9d04ef3d65c/11111111-2222-4333-8444-555555555555/4d7680b7-a0ad-424b-9927-848f895835f6-' + got;
    if (!SB_VALID.test(key) || !got.length) miss('مفتاحٌ ترفضه Supabase: ' + key);
  });
  const up = extractFunction(si, 'upload') || '';
  if (!/var path = oid \+ '\/' \+ patientId \+ '\/' \+ uuid\(\) \+ '-' \+ storeName;/.test(up)) miss('بناء المسار تغيّر — راجع توافقه مع isValidKey');
  if (!/var storeName\s+= sanitizeName\(displayName\);/.test(up) || !/file_name:\s+displayName,/.test(up)) miss('الاسم المعروض يجب أن يبقى الأصلي والمفتاح وحده يُعقَّم');
  if (!skMis) ok('مفتاح التخزين: ' + vecK.length + ' اسماً (عربي/مختلط/رموز/إيموجي) ⇒ مفاتيح تقبلها Supabase · الامتداد اللاتيني محفوظ · الاسم المعروض أصلي');
} catch (e) { bad('فشل فحص مفتاح التخزين: ' + e.message); }

/* ── V9) v348: نغمات ألوان الحالات (tone) ───────────────────────────────────────
   الشاراتُ الدلالية (أختام الحضور · أزرار المراحل · تحذير/حساسية/انتظار) تأخذ
   `tone tone-<x>` بألوانٍ صريحة لكل ثيم بدل صيغة `.cbadge` الفاتحة التي تُغمِق
   الأحمر والبرتقالي والأصفر إلى البنيّ نفسه. يُفحص: كل مرحلةٍ بنغمةٍ معرّفة
   تطابق لونَها · المُولِّداتُ تُخرج الصنف · النغماتُ والتوكنات معرّفة بالثيمين. */
try {
  let tnMis = false;
  const miss = m => { tnMis = true; bad('نغمات الحالات: ' + m); };
  const TONES = ['red', 'orange', 'yellow', 'blue', 'green', 'purple', 'cyan', 'gray', 'lime'];
  const th = read('theme.css');
  TONES.forEach(t => { if (!new RegExp('\\.tone-' + t + '\\s*\\{[^}]*--tone-bg:[^}]*--tone-bd:').test(th)) miss('.tone-' + t + ' غير معرّفة كاملة بـtheme.css'); });
  if (!/:root\[data-theme\] \.tone\.tone\s*\{[^}]*background:\s*var\(--tone-bg\)/.test(th)) miss('قاعدة .tone.tone غائبة أو أضعف');
  const li = th.indexOf(':root[data-theme="light"] {'), di = th.indexOf(':root[data-theme="dark"] {');
  const lightB = th.slice(li, di), darkB = th.slice(di, th.indexOf('}', di));
  ['red-bg','red-bd','orange-bg','orange-bd','yellow-bg','yellow-bd','red-ink','orange-ink','yellow-ink','blue-fg','blue-bg','blue-bd','green-fg','green-bg','green-bd','purple-fg','purple-bg','purple-bd','cyan-fg','cyan-bg','cyan-bd','gray-fg','gray-bg','gray-bd','lime-fg','lime-bg','lime-bd','red-soft','orange-soft','yellow-soft','blue-soft'].forEach(k => {
    if (lightB.indexOf('--' + k + ':') < 0) miss('--' + k + ' غير معرّف بالفاتح');
    if (darkB.indexOf('--' + k + ':') < 0)  miss('--' + k + ' غير معرّف بالداكن');
  });
  const arr = (src, name) => {
    const m = src.match(new RegExp('var ' + name + ' = \\[[\\s\\S]*?\\];'));
    if (!m) throw new Error(name + ' غير موجودة');
    const c = vm.createContext({}); vm.runInContext(m[0], c); return vm.runInContext(name, c);
  };
  const at = read('appt-time.js'), pa = read('pp-appt.js'), ix = read('index.html'), am = read('appt-modal.js');
  [['TIME_STAGES', arr(at, 'TIME_STAGES')], ['PP_APPT_STAGES', arr(pa, 'PP_APPT_STAGES')]].forEach(([n, a]) => {
    a.forEach(st => {
      if (TONES.indexOf(st.tone) < 0) miss(n + '.' + st.key + ' بلا نغمة');
      else if (st.color !== 'var(--' + st.tone + ')') miss(n + '.' + st.key + ' النغمة ' + st.tone + ' لا تطابق اللون ' + st.color);
    });
  });
  const dash = arr(ix, 'DASH_TIME_STAGES');
  const dArr = dash.find(s => s.key === 'arrived_at');
  if (!dArr || dArr.tone !== 'yellow') miss('وصل بلوحة التحكم بلا نغمة صفراء');
  dash.forEach(st => { if (st.tone && st.color !== 'var(--' + st.tone + ')') miss('DASH ' + st.key + ' نغمة لا تطابق اللون'); });
  if (!/class="time-track-stamp tone tone-' \+ st\.tone/.test(at)) miss('ختم صفحة المواعيد لا يُخرج النغمة');
  if (!/class="time-track-btn cbadge tone tone-' \+ act\.tone/.test(at)) miss('زر مرحلة المواعيد لا يُخرج النغمة');
  if (!/appt-btn-stage tone tone-' \+ stg\.tone/.test(pa)) miss('زر مرحلة بطاقة المريض لا يُخرج النغمة');
  if (!/dash-time-stamp tone tone-' \+ st\.tone/.test(ix) || !/' tone tone-' \+ act\.tone/.test(ix)) miss('لوحة التحكم لا تُخرج النغمة');
  ['tone tone-orange"[^>]*>⚡ انتظار', 'tone tone-red" style=', 'tone tone-yellow" style='].forEach(re => { if (!new RegExp(re).test(am)) miss('شارة بنافذة الموعد بلا نغمة: ' + re); });
  if (/rgba\((239,83,80|245,200,66)/.test(am)) miss('ألوانٌ محفورة بقيم الداكن ما زالت بـappt-modal.js');
  if (!tnMis) ok('نغمات الحالات: ' + TONES.length + ' نغمات بالثيمين · مراحل الحضور بالسطوح الثلاثة تطابق ألوانها · شارات التحذير/الحساسية/الانتظار');
} catch (e) { bad('فشل فحص نغمات الحالات: ' + e.message); }

/* ── V10) M141: بوابةُ الاشتراك (القاعدة + الواجهة) ───────────────────────────
   العقد: (1) كلُّ جدول RLS بـpublic إمّا محروسٌ بـ_sub_guard_table بهجرة ≥141 أو
   من جداول المنصة (v_exempt) — بلا تداخل؛ (2) SyDentSub.OPEN_TABLES = v_exempt حرفياً؛
   (3) ترتيبُ tenant_access_level: الحالة ← دائم/نشط ← السماح ← التجربة ← قراءة؛
   (4) التوصيل: fetch المشترك يمرّ بـwriteGate · ensureAccountAccessible يمرّ
   بـapplyPageGate · الشريط والوحة بالمعرّف لا بالبريد · صفحة الاشتراك تعرف السماح ·
   حذف الحساب بلا حذف صفّ الطلب · ai-assist يرفض المنتهي قبل Anthropic · خرائط AI ×4؛
   (5) سلوكياً بـvm: مصفوفةُ writeGate/applyPageGate كاملة. */
try {
  let sgMis = false;
  const miss = m => { sgMis = true; bad('بوابة الاشتراك: ' + m); };
  const migDir = path.join(ROOT, 'migrations');
  const migs = fs.readdirSync(migDir).filter(f => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) >= 141)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const m141 = migs.find(f => /^141_/.test(f));
  if (!m141) throw new Error('هجرة 141 غير موجودة');
  const sql141 = read('migrations/' + m141);
  const arrOf = (name) => {
    const m = new RegExp(name + '\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]').exec(sql141);
    if (!m) throw new Error(name + ' غير موجودة بهجرة 141');
    return m[1].match(/'([a-z_0-9]+)'/g).map(x => x.slice(1, -1));
  };
  const EXEMPT = arrOf('v_exempt'), READ_OPEN = arrOf('v_read_open');
  const guarded = new Set(), readOpen = new Set(), rlsNew = new Set();
  migs.forEach(f => {
    const src = read('migrations/' + f).replace(/--[^\n]*/g, '');
    for (const m of src.matchAll(/_sub_guard_table\(\s*'public\.([a-z_0-9]+)'\s*(,\s*true\s*)?\)/g)) {
      guarded.add(m[1]); if (m[2]) readOpen.add(m[1]);
    }
    for (const m of src.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([a-z_0-9]+)"?\s+ENABLE ROW LEVEL SECURITY/gi)) rlsNew.add(m[1]);
  });
  const schema = read('db/schema.sql');
  const rls = new Set([...schema.matchAll(/ALTER TABLE "public"\."([a-z_0-9]+)" ENABLE ROW LEVEL SECURITY/g)].map(m => m[1]));
  rlsNew.forEach(t => rls.add(t));
  rls.forEach(t => { if (!guarded.has(t) && EXEMPT.indexOf(t) < 0) miss('جدول RLS بلا حراسة اشتراك ولا استثناء: ' + t + ' (أضف SELECT public._sub_guard_table(\'public.' + t + '\') بهجرته)'); });
  EXEMPT.forEach(t => { if (guarded.has(t)) miss('جدول منصة محروس خطأً: ' + t); if (!rls.has(t)) miss('استثناءٌ لجدول غير موجود: ' + t); });
  guarded.forEach(t => { if (!rls.has(t)) miss('حراسةٌ لجدول غير موجود بـRLS: ' + t); });
  if (JSON.stringify([...readOpen].sort()) !== JSON.stringify(READ_OPEN.slice().sort())) miss('جداول الهوية المقروءة لا تطابق v_read_open');
  const tal = (/FUNCTION public\.tenant_access_level\(p_uid uuid\)[\s\S]*?\$\$;/.exec(sql141) || [''])[0].replace(/\s+/g, ' ');
  const order = ["IS DISTINCT FROM 'accepted' THEN 'none'", "trial_end IS NULL OR tr.trial_end > now() THEN 'full'",
    "grace_until > now() THEN 'full'", "COALESCE(tr.plan, 'trial') = 'trial' THEN 'none'", "ELSE 'read'", "'none');"];
  let at = -1;
  order.forEach(k => { const i = tal.indexOf(k); if (i < 0 || i < at) miss('ترتيب tenant_access_level تغيّر عند: ' + k); at = Math.max(at, i); });
  if (!/REVOKE EXECUTE ON FUNCTION public\.tenant_access_level\(uuid\) FROM PUBLIC, anon, authenticated;/.test(sql141)) miss('tenant_access_level مكشوفة للعميل');
  if (!/IF public\.tenant_access_level\(p_clinic\) <> 'full' THEN RETURN; END IF;/.test(sql141)) miss('الحجز العام بلا بوابة الاشتراك');
  if (!/IF public\.my_access_level\(\) <> 'full' THEN\s+RAISE EXCEPTION 'subscription_read_only'/.test(sql141)) miss('دالة التوزيع بلا بوابة الاشتراك');
  if (!/DROP POLICY IF EXISTS "User can delete own trial" ON public\.trial_requests;/.test(sql141)) miss('سياسة حذف الطلب الذاتي باقية');

  const si = read('supabase-init.js');
  const bi = si.indexOf('/* ══ SyDentSub:begin'), be = si.indexOf('/* ══ SyDentSub:end ══ */');
  if (bi < 0 || be < 0) throw new Error('كتلة SyDentSub غير موجودة');
  const block = si.slice(bi, be);
  const ot = /var OPEN_TABLES = (\[[\s\S]*?\]);/.exec(block);
  const OPEN = ot ? vm.runInNewContext(ot[1]) : [];
  if (JSON.stringify(OPEN.slice().sort()) !== JSON.stringify(EXEMPT.slice().sort())) miss('OPEN_TABLES ≠ v_exempt بهجرة 141');
  if (!/var gate = \(window\.SyDentSub && window\.SyDentSub\.writeGate\) \? window\.SyDentSub\.writeGate\(input, init\) : null;\s+if \(gate\) return gate\.then\(function \(denied\) \{ return denied \|\| f\.apply\(window, args\); \}\);/.test(si)) miss('fetch المشترك لا يمرّ بـwriteGate قبل الشبكة');
  const eaa = /window\.ensureAccountAccessible = async function[\s\S]*?\n  \};/.exec(si);
  if (!eaa || !/if \(status === 'accepted'\) \{\s+if \(window\.SyDentSub\) return await window\.SyDentSub\.applyPageGate\(\);/.test(eaa[0])) miss('ensureAccountAccessible لا يمرّ بـapplyPageGate');
  const hb = extractFunction(si, 'presenceHeartbeat');
  if (!/window\.sb\.rpc\('touch_presence'\)/.test(hb) || /last_seen_at/.test(hb.replace(/\/\/[^\n]*/g, ''))) miss('نبضة التواجد ليست عبر touch_presence');
  const sb = read('sidebar.js');
  const rsd = extractFunction(sb, 'refreshSidebarDynamic');
  if (/from\('trial_requests'\)[\s\S]{0,120}\.eq\('email'/.test(rsd) || !/from\('trial_requests'\)\s*\.select\('status'\)\s*\.eq\('user_id', uid\)/.test(rsd)) miss('الشريط يبحث عن الطلب بالبريد');
  if (!/window\.__sydentSubLimited && window\.SyDentSub[\s\S]{0,60}pruneNav\(\)/.test(rsd)) miss('الشريط لا يختصر القائمة للتجربة المنتهية');
  const ix = read('index.html');
  if (/from\('trial_requests'\)/.test(ix)) miss('index.html ما زال يقرأ trial_requests مباشرة');
  if (!/const trialData = window\.SyDentSub \? await window\.SyDentSub\.load\(\) : null;/.test(ix) || !/window\.SyDentSub\.applyPageGate\(\)/.test(ix)) miss('لوحة التحكم لا تقرأ SyDentSub');
  if (/expiredTitle/.test(ix)) miss('شاشة الحجب القديمة ما زالت بـindex.html');
  const sub = read('subscription.html');
  if ((sub.match(/select\('id, plan, status, trial_end, grace_until, billing_cycle, currency'\)/g) || []).length !== 4) miss('صفحة الاشتراك لا تجلب grace_until بالمواضع الأربعة');
  if (!/badge = 'فترة سماح'/.test(extractFunction(sub, 'renderCurrent'))) miss('صفحة الاشتراك لا تعرض السماح');
  const st = read('settings.html');
  if (/tryDelete\('trial_requests'/.test(st)) miss('حذف الحساب ما زال يحذف صفّ الطلب');
  const cd = extractFunction(st, 'confirmDelete');
  if (!/await window\.SyDentAccountDelete\.run\(\{ password: pass, captchaToken: getTurnstileToken\('delete'\) \}\)/.test(cd)) miss('حذف الحساب بالإعدادات لا يمرّ بالوحدة المشتركة');
  /* M142 — وحدة الحذف المشتركة: الترتيب هو الأمان (لا يُحذف الحساب وملفاتٌ باقية) */
  {
    const ib = si.indexOf('/* ══ SyDentAccountDelete:begin'), ie = si.indexOf('/* ══ SyDentAccountDelete:end ══ */');
    const ad = (ib > -1 && ie > ib) ? si.slice(ib, ie) : '';
    const at = k => ad.indexOf(k);
    if (!ad) miss('وحدة SyDentAccountDelete غائبة');
    else {
      const order = ['sb.auth.signInWithPassword(', "sb.rpc('begin_account_wipe')", 'sub.setWipe(true)', 'before = await storageCount()',
                     'window.SyDentFiles.purgeOwner(uid, before)', 'after = await storageCount()', "if (after !== 0) return { ok: false, stage: 'files'",
                     'sub.setWipe(false)', "if (!lvl || lvl === 'full') {", "sb.rpc('delete_my_account')", 'sb.auth.signOut()'];
      let last = -1;
      order.forEach(k => { const i = at(k); if (i < 0) miss('وحدة الحذف: «' + k + '» غائب'); else if (i < last) miss('وحدة الحذف: «' + k + '» خارج الترتيب'); else last = i; });
      if (!/if \(w\.error\) return \{ ok: false, stage: 'window'/.test(ad)) miss('وحدة الحذف: فشل النافذة لا يوقف المسار');
      if (!/catch \(e\) \{ return \{ ok: false, stage: 'files', message: 'تعذّر عدّ ملفات المرضى/.test(ad)) miss('وحدة الحذف: فشل العدّ لا يوقف المسار (يجب fail-closed)');
      if (!/\} finally \{\s+if \(sub\) sub\.setWipe\(false\);/.test(ad)) miss('وحدة الحذف: علم المحو لا يُطفأ بكل المسارات');
      if (si.indexOf('SyDentAccountDelete:begin') > si.indexOf('SyDent Offline — توصيل التصريف')) miss('وحدة الحذف داخل قسم توصيل الأوفلاين (الجدار المالي)');
    }
    const po = extractFunction(si, 'purgeOwner');
    if (!/async function purgeOwner\(uid, expected\)|function purgeOwner\(uid, expected\)/.test(po) ||
        !/if \(typeof expected === 'number' && paths\.length < expected\) \{\s+return \{ ok:false, removed:0, failed:0, reason:'list_incomplete'/.test(po) ||
        po.indexOf("reason:'list_incomplete'") > po.indexOf('st.remove(')) miss('purgeOwner: قائمةٌ ناقصة لا توقف المحو قبل الحذف');
    // صفحة الاشتراك: نسخةُ Turnstile حرفية من الإعدادات · البطاقة للمحجوب وحده · الحذف عبر الوحدة
    const tsOf = src => { const m = src.match(/<script>\n\(function\(\)\{\n  var SITEKEY = [\s\S]*?\n\}\)\(\);\n<\/script>\n<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit&onload=onSyDentTurnstileLoad" async defer><\/script>/); return m ? m[0] : null; };
    const tsS = tsOf(st), tsB = tsOf(sub);
    if (!tsS || !tsB || tsS !== tsB) miss('Turnstile بصفحة الاشتراك ليس نسخةً حرفية من الإعدادات');
    if (!/<div class="sub-danger" id="subDangerCard" hidden>/.test(sub)) miss('بطاقة الحذف بصفحة الاشتراك ليست مخفيةً افتراضياً');
    if (!/if \(card\) card\.hidden = !\(st && st\.level === 'none'\);/.test(sub)) miss('بطاقة الحذف تظهر لغير الحساب المحجوب');
    if (!/var res = await window\.SyDentAccountDelete\.run\(\{ password: pass, captchaToken: getTurnstileToken\('delete'\) \}\);/.test(sub)) miss('حذف صفحة الاشتراك لا يمرّ بالوحدة المشتركة');
    if (!/if \(phrase !== 'حذف حسابي'\)/.test(sub)) miss('حذف صفحة الاشتراك بلا عبارة التأكيد');
    /* v363 — الطابور الأوفلاين ينتظر التجديد: لا محاولة ولا عدّاد ولا كنس ما دام المستوى ليس full */
    {
      const om = si.slice(si.indexOf('SYDENT_OFFLINE_MODULE_START'), si.indexOf('SYDENT_OFFLINE_MODULE_END'));
      const dr = extractFunction(om, 'drain'), dn = extractFunction(om, 'drainNow');
      if (!/if \(st && st\.level && st\.level !== 'full'\) \{\s+_pausedSub = true;\s+outboxNotify\(\);\s+return \{ synced: 0, failed: 0, paused: 'subscription' \};/.test(dr)) miss('الطابور الأوفلاين يُصرَّف والاشتراك غير كامل');
      if (/dropping permanently-failed/.test(dr) || !/dropping permanently-failed/.test(dn)) miss('كنّاس الطابور خارج drainNow (يعمل أثناء الإيقاف)');
      const i403 = dn.indexOf("if ((res.status === 403 || res.status === 401) && subNotFull()) { _pausedSub = true; throw new Error('subscription-paused'); }");
      if (i403 < 0 || i403 > dn.indexOf('failed++;')) miss('رفضُ الاشتراك أثناء التصريف يُحسب فشلاً');
      if (!/isPausedForSubscription: function \(\) \{ return _pausedSub; \}/.test(om)) miss('حالة إيقاف الطابور غير مكشوفة للشارة');
      if (si.indexOf("(paused ? ' · ⏸ بانتظار تجديد الاشتراك' : '')") < 0 || si.indexOf("r.paused === 'subscription'") < 0) miss('شارة المزامنة لا تشرح الإيقاف');
    }
    const m142 = read('migrations/142_account_wipe_window.sql');
    if (!/CREATE POLICY sub_gate_pf_select[\s\S]*?OR \(SELECT public\.my_wipe_open\(\)\)\);/.test(m142) || !/CREATE POLICY sub_gate_pf_delete[\s\S]*?OR \(SELECT public\.my_wipe_open\(\)\)\);/.test(m142)) miss('M142: نافذة المحو غائبة عن سياستي القراءة/الحذف');
    if (/CREATE POLICY sub_gate_pf_(insert|update)/.test(m142)) miss('M142: لا يُمسّ الرفع/التعديل');
    if (!/wipe_started_at > now\(\) - interval '15 minutes'/.test(m142)) miss('M142: مدة النافذة ليست 15 دقيقة');
    if (!/REVOKE ALL ON FUNCTION public\.begin_account_wipe\(\) FROM PUBLIC, anon;/.test(m142) || !/REVOKE ALL ON FUNCTION public\.my_wipe_open\(\) FROM PUBLIC, anon;/.test(m142) || !/REVOKE ALL ON FUNCTION public\.my_storage_object_count\(\) FROM PUBLIC, anon;/.test(m142)) miss('M142: دالة نافذة/عدّ قابلة للتنفيذ من anon');
    if (!/CREATE POLICY wipe_insert_guard ON public\.trial_requests AS RESTRICTIVE FOR INSERT TO authenticated\s+WITH CHECK \(wipe_started_at IS NULL OR/.test(m142)) miss('M142: العميل يستطيع ضبط wipe_started_at بإدراجٍ ذاتي');
  }
  const ai = read('supabase/functions/ai-assist/index.ts');
  const iLvl = ai.indexOf('admin.rpc("tenant_access_level", { p_uid: ownerId })');
  const iAnth = ai.indexOf('api.anthropic.com');
  if (iLvl < 0 || !/lvl !== "full"\) \{\s+return json\(403, \{ error: "subscription_inactive" \}\);/.test(ai) || (iAnth > -1 && iLvl > iAnth)) miss('ai-assist لا يرفض المنتهي قبل Anthropic');
  [['patients.html', read('patients.html')], ['index.html', ix], ['accounting.html', read('accounting.html')], ['pp-extras.js', read('pp-extras.js')]].forEach(([f, src]) => {
    if (!/subscription_inactive: 'انتهى اشتراك العيادة/.test(src)) miss('خريطة أخطاء AI بلا subscription_inactive: ' + f);
  });
  const th = read('theme.css');
  if (!/body\.sd-sub-blocked > :not\(\.sd-sub-block\):not\(#sdLockModal\):not\(#syToast\)\{display:none !important;\}/.test(th)) miss('قاعدة إخفاء ما تحت طبقة الحجب تغيّرت');
  ['.sd-sub-block{', '.sd-ro-bar{', '.sd-ro-bar.grace{'].forEach(k => { if (th.indexOf(k) < 0) miss('صنف غائب بـtheme.css: ' + k); });

  // ── سلوكياً ──
  const mkSub = (o) => {
    const toasts = [], listeners = {}, appended = [], bodyCls = [];
    const el = () => ({ attrs: {}, children: [], classList: { add() {}, contains() { return false; } }, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } });
    const ctx = {
      console: { warn() {}, log() {}, info() {} }, Promise, JSON, Date, Math, String, Array, isNaN, Object,
      Response: class { constructor(b, i) { this.body = b; this.status = i.status; this.headers = i.headers; } },
      setTimeout: (fn, ms) => (ms >= 4000 ? (o.hang ? Promise.resolve().then(fn) : 0) : setTimeout(fn, ms)),   // مهلة الانتظار: تنطلق فوراً فقط بحالة التعليق
      location: { pathname: '/' + (o.page || 'patients.html') },
      addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      showToast: (m, e) => toasts.push([m, e]),
      SyDentLock: { getRole: () => o.role || 'owner' },
      document: {
        readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null,
        documentElement: { setAttribute() {} }, createElement: el,
        body: { appendChild: (c) => appended.push(c), classList: { add: (c) => bodyCls.push(c) } }
      },
      sb: {
        auth: { getSession: async () => ({ data: { session: o.noSession ? null : { user: { id: 'u1' } } } }) },
        rpc: (name) => { ctx.rpcCalls.push(name); return o.hang ? new Promise(() => {}) : Promise.resolve(o.rpc); }
      },
      rpcCalls: []
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(block, ctx);
    return { ctx, S: ctx.SyDentSub, toasts, appended, bodyCls, gesture: () => (listeners.pointerdown || []).forEach(f => f()) };
  };
  const stOf = (level, extra) => ({ data: Object.assign({ level, status: 'accepted', plan: level === 'none' ? 'trial' : 'yearly' }, extra || {}), error: null });
  const U = 'https://x.supabase.co';
  const REQ = (path, method) => [U + path, { method }];
  const gate = async (S, p, m) => { const g = S.writeGate(...REQ(p, m)); return g === null ? 'pass-sync' : ((await g) ? (await g).status : 'pass'); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ASYNC_CHECKS.push((async () => {
    const res = [];
    const expect = (name, got, want) => { if (got !== want) { res.push(name + ': got ' + got + ' want ' + want); } };
    // full
    let t = mkSub({ rpc: stOf('full') });
    expect('full POST patients', await gate(t.S, '/rest/v1/patients', 'POST'), 'pass');
    expect('full GET patients', await gate(t.S, '/rest/v1/patients?select=*', 'GET'), 'pass-sync');
    // read
    t = mkSub({ rpc: stOf('read') });
    expect('read POST patients', await gate(t.S, '/rest/v1/patients', 'POST'), 403);
    expect('read PATCH appointments', await gate(t.S, '/rest/v1/appointments?id=eq.1', 'PATCH'), 403);
    expect('read DELETE ledger_payments', await gate(t.S, '/rest/v1/ledger_payments?id=eq.1', 'DELETE'), 403);
    expect('read GET patients', await gate(t.S, '/rest/v1/patients', 'GET'), 'pass-sync');
    expect('read HEAD patients', await gate(t.S, '/rest/v1/patients', 'HEAD'), 'pass-sync');
    expect('read POST trial_requests', await gate(t.S, '/rest/v1/trial_requests', 'POST'), 'pass-sync');
    expect('read POST subscription_requests', await gate(t.S, '/rest/v1/subscription_requests', 'POST'), 'pass-sync');
    expect('read PATCH subscription_requests', await gate(t.S, '/rest/v1/subscription_requests?id=eq.1', 'PATCH'), 'pass-sync');
    expect('read rpc any', await gate(t.S, '/rest/v1/rpc/touch_presence', 'POST'), 'pass-sync');
    expect('read upload', await gate(t.S, '/storage/v1/object/patient-files/u1/p/a.jpg', 'POST'), 403);
    expect('read update file', await gate(t.S, '/storage/v1/object/patient-files/u1/p/a.jpg', 'PUT'), 403);
    expect('read signed upload', await gate(t.S, '/storage/v1/object/upload/sign/patient-files/u1/a.jpg', 'POST'), 403);
    expect('read move', await gate(t.S, '/storage/v1/object/move', 'POST'), 403);
    expect('read sign url', await gate(t.S, '/storage/v1/object/sign/patient-files/u1/a.jpg', 'POST'), 'pass-sync');
    expect('read sign urls', await gate(t.S, '/storage/v1/object/sign/patient-files', 'POST'), 'pass-sync');
    expect('read list', await gate(t.S, '/storage/v1/object/list/patient-files', 'POST'), 'pass-sync');
    expect('read download', await gate(t.S, '/storage/v1/object/authenticated/patient-files/u1/a.jpg', 'GET'), 'pass-sync');
    expect('read other bucket', await gate(t.S, '/storage/v1/object/avatars/a.jpg', 'POST'), 'pass-sync');
    expect('read remove files', await gate(t.S, '/storage/v1/object/patient-files', 'DELETE'), 403);
    t.S.setWipe(true);
    expect('read remove files (wipe)', await gate(t.S, '/storage/v1/object/patient-files', 'DELETE'), 'pass');
    expect('read upload (wipe)', await gate(t.S, '/storage/v1/object/patient-files/u1/p/a.jpg', 'POST'), 403);
    const d403 = await t.S.writeGate(...REQ('/rest/v1/patients', 'POST'));
    const body = d403 ? JSON.parse(d403.body) : {};
    expect('read deny body', body.code === '42501' && /للقراءة فقط/.test(body.message) && body.error === 'subscription_inactive', true);
    expect('read rpc once', t.ctx.rpcCalls.filter(n => n === 'my_subscription_state').length, 1);
    // toast: gesture ⇒ toast · no gesture ⇒ silent · audit ⇒ silent
    t = mkSub({ rpc: stOf('read') });
    await gate(t.S, '/rest/v1/patients', 'POST'); await sleep(380);
    expect('no-gesture toast', t.toasts.length, 0);
    t.gesture();
    expect('audit silent status', await gate(t.S, '/rest/v1/audit_log', 'POST'), 403);
    await sleep(380);
    expect('audit silent toast', t.toasts.length, 0);
    await gate(t.S, '/rest/v1/patients', 'POST'); await sleep(380);
    expect('gesture toast', t.toasts.length === 1 && /للقراءة فقط/.test(t.toasts[0][0]) && t.toasts[0][1] === true, true);
    await gate(t.S, '/rest/v1/patients', 'POST'); await sleep(380);
    expect('toast throttle', t.toasts.length, 1);
    // none
    t = mkSub({ rpc: stOf('none') });
    const dn = await t.S.writeGate(...REQ('/rest/v1/patients', 'POST'));
    expect('none POST', dn && dn.status, 403);
    expect('none msg', !!dn && /انتهت فترة التجربة/.test(JSON.parse(dn.body).message), true);
    expect('none remove files (no wipe)', await gate(t.S, '/storage/v1/object/patient-files', 'DELETE'), 403);
    t.S.setWipe(true);
    // M142: المحجوب يمحو ملفاته بمسار الحذف (القاعدة تحصره بنافذة المحو)؛ الكتابة الأخرى تبقى مرفوضة
    expect('none remove files (wipe)', await gate(t.S, '/storage/v1/object/patient-files', 'DELETE'), 'pass');
    expect('none POST (wipe on)', await gate(t.S, '/rest/v1/patients', 'POST'), 403);
    expect('none upload (wipe on)', await gate(t.S, '/storage/v1/object/patient-files/x/y.jpg', 'POST'), 403);
    t.S.setWipe(false);
    expect('none remove files (wipe off again)', await gate(t.S, '/storage/v1/object/patient-files', 'DELETE'), 403);
    // fail-open
    t = mkSub({ rpc: { data: null, error: { message: 'boom' } } });
    expect('rpc error ⇒ pass', await gate(t.S, '/rest/v1/patients', 'POST'), 'pass');
    expect('rpc error retry throttled', (await gate(t.S, '/rest/v1/patients', 'POST'), t.ctx.rpcCalls.length), 1);
    t = mkSub({ noSession: true, rpc: stOf('none') });
    expect('no session ⇒ pass', await gate(t.S, '/rest/v1/patients', 'POST'), 'pass');
    expect('no session ⇒ no rpc', t.ctx.rpcCalls.length, 0);
    t = mkSub({ hang: true });
    expect('timeout ⇒ pass', await gate(t.S, '/rest/v1/patients', 'POST'), 'pass');
    // page gate
    t = mkSub({ rpc: stOf('none'), page: 'patients.html' });
    expect('none page', await t.S.applyPageGate(), false);
    expect('none blocked flag', t.ctx.__sydentBlocked, true);
    expect('none overlay', t.appended.length === 1 && t.bodyCls.indexOf('sd-sub-blocked') > -1, true);
    expect('gate memo', await t.S.applyPageGate(), false);
    expect('overlay once', t.appended.length, 1);
    t = mkSub({ rpc: stOf('none'), page: 'subscription.html' });
    expect('none subscription page', await t.S.applyPageGate(), true);
    expect('none limited nav', t.ctx.__sydentSubLimited, true);
    expect('none subscription no overlay', t.appended.length, 0);
    t = mkSub({ rpc: stOf('none'), page: 'subscription' });
    expect('none clean url', await t.S.applyPageGate(), true);
    t = mkSub({ rpc: stOf('none'), page: 'subscription.html', role: 'secretary' });
    expect('none staff on subscription', await t.S.applyPageGate(), false);
    t = mkSub({ rpc: stOf('read'), page: 'patients.html' });
    expect('read owner page', await t.S.applyPageGate(), true);
    expect('read flag', t.ctx.__sydentReadOnly, true);
    expect('read owner no overlay', t.appended.length, 0);
    t = mkSub({ rpc: stOf('read'), page: 'patients.html', role: 'doctor' });
    expect('read staff page', await t.S.applyPageGate(), false);
    t = mkSub({ rpc: stOf('full') });
    expect('full page', await t.S.applyPageGate(), true);
    expect('full not blocked', !!t.ctx.__sydentBlocked, false);
    t = mkSub({ rpc: { data: null, error: { message: 'x' } } });
    expect('fail-open page', await t.S.applyPageGate(), true);
    const past = new Date(Date.now() - 864e5).toISOString(), fut = new Date(Date.now() + 3 * 864e5).toISOString();
    expect('grace yes', t.S.inGrace({ level: 'full', trial_end: past, grace_until: fut }), true);
    expect('grace no (active)', t.S.inGrace({ level: 'full', trial_end: fut, grace_until: fut }), false);
    expect('grace no (lapsed)', t.S.inGrace({ level: 'full', trial_end: past, grace_until: past }), false);
    expect('grace no (read)', t.S.inGrace({ level: 'read', trial_end: past, grace_until: fut }), false);
    expect('grace no (permanent)', t.S.inGrace({ level: 'full', trial_end: null, grace_until: fut }), false);
    if (res.length) res.forEach(r => miss('سلوك: ' + r));
    else if (!sgMis) ok('بوابة الاشتراك: ' + rls.size + ' جدول RLS = ' + guarded.size + ' محروس (' + readOpen.size + ' هوية مقروءة) + ' + EXEMPT.length + ' منصة · OPEN_TABLES = v_exempt · ترتيب المستوى · التوصيل ×9 · سلوك writeGate/applyPageGate ×60');
  })().catch(e => bad('فشل فحص بوابة الاشتراك (سلوك): ' + e.message)));
} catch (e) { bad('فشل فحص بوابة الاشتراك: ' + e.message); }

/* ── V11) M141-ب: وضعُ القراءة — عناصرُ الكتابة موسومة data-sub-write ────────────
   تُراجَع الصفحاتُ واحدةً واحدة بترتيب الشريط (كلُّ صفحةٍ تدخل السجلَّ بعد «تمام»
   المالك)، والسجلُّ يثبّت كلَّ عنصرٍ موسوم كي لا يسقط وسمُه بتعديلٍ لاحق.
   أيضاً: قاعدةُ CSS نفسها · زرُّ الرسائل يختفي بالقراءة والحجب · كلُّ عنصر
   data-doctor-inactive-block بصفحةٍ مراجَعة يحمل الوسم · المستوى يُعلَّم على <html>
   من القراءة الحيّة ويُستبق من ذاكرة التبويب لـ«read» وحدها. */
try {
  let roMis = false;
  const miss = m => { roMis = true; bad('وضع القراءة: ' + m); };
  const th = read('theme.css');
  if (!/html\[data-sub-level="read"\] \[data-sub-write\]\{display:none !important;\}/.test(th)) miss('قاعدة إخفاء data-sub-write غائبة');
  if (!/html\[data-sub-level="read"\] #syMsgFab,html\[data-sub-level="read"\] #syMsgPanel,\s*html\[data-sub-level="none"\] #syMsgFab,html\[data-sub-level="none"\] #syMsgPanel\{display:none !important;\}/.test(th)) miss('زر الرسائل الداخلية لا يختفي بالقراءة/الحجب');
  const si = read('supabase-init.js');
  const blk = si.slice(si.indexOf('/* ══ SyDentSub:begin'), si.indexOf('/* ══ SyDentSub:end ══ */'));
  if (!/_state = r\.data;\s+_failedAt = 0;\s+markLevel\(_state\.level, u\.id\);/.test(blk)) miss('المستوى لا يُعلَّم على <html> من القراءة الحيّة');
  const pl = extractFunction(blk, 'primeLevel');
  if (!/c\.uid === uid && c\.level === 'read'/.test(pl)) miss('الاستباق من ذاكرة التبويب ليس مقيَّداً بالمعرّف و«read»');
  const RO_PAGES = {
    'index.html': [
      'data-doctor-inactive-block data-sub-write>＋ مريض جديد</a>',
      'id="obClinicPrompt" data-sub-write',
      'id="obBanner" data-sub-write',
      'id="aiHubCard" data-sub-write',
      'id="quickTplCard" data-sub-write',
      "return '<button data-sub-write class=\"dash-time-btn cbadge'",
      "return '<span class=\"wa-badge-dash urgent\" data-sub-write ",
      'لا توجد بيانات<span data-sub-write> — <a href="patients.html"',
      'لا توجد طلبات مخابر نشطة<span data-sub-write> — <a href="labs.html"',
    ],
    'patients.html': [
      'data-test="add-patient" data-doctor-inactive-block data-sub-write>',
      /* الاستيراد والمتابعة (إرسالٌ وتأشير) بالشريط العلوي */
      'onclick="openImportModal()"',
      'onclick="openPrmModal()"',
      '<th data-sub-write>إجراءات</th>',
      '<td data-sub-write>\n          <div class="action-btns sy-acts"',
      "&appt=1'\" data-doctor-inactive-block data-sub-write>📅 موعد جديد</button>",
      "&pay=1'\" data-doctor-inactive-block data-sub-write>💰 تسجيل دفعة</button>",
      'data-test="patient-menu" data-sub-write>⋮</button>',
      '<div class="dots-menu" data-sub-write>',
      '<div class="empty-sub" data-sub-write>ابدأ بإضافة أول مريض',
      'onclick="openModal()" data-doctor-inactive-block data-sub-write style=',
      '<div id="obDemoCard" data-sub-write ',
      'جرّب كلمة بحث مختلفة<span data-sub-write> أو أضف مريضاً جديداً</span>',
    ],
    'appointments.html': [
      'onclick="openModal()" data-doctor-inactive-block data-sub-write>＋ موعد جديد</button>',
      'onclick="openWaitlistModal()" title="قائمة الانتظار: مرضى يرغبون بموعد أبكر" data-sub-write',
      'id="plannedToggleWrap" data-sub-write', 'id="plannedNote" data-sub-write', 'id="apptLockNote" data-sub-write', 'id="apptTypePickerWrap" data-sub-write',
      'id="bookingResolveBox" data-sub-write', 'id="apptProcControls" data-sub-write', 'id="completeApptBtn" data-sub-write',
      'id="apptFileCategory" data-sub-write', 'id="apptFileDrop" data-sub-write', 'id="noShowFeeBtn" data-sub-write',
      'id="deleteApptBtn" data-sub-write', 'id="scheduleNowBtn" data-sub-write', 'id="saveBtn" data-sub-write>',
      '<div class="hint" data-sub-write>أضف موعداً جديداً',
      '<button class="sy-act sy-act-primary" data-sub-write onclick="quickSchedulePlanned(',
      '<button class="sy-act sy-act-danger" data-sub-write onclick="deleteAppt(',
      '<button type="button" class="sy-act sy-act-danger" data-sub-write onclick="apptDeleteFile(',
    ],
    'appt-views.js': [
      'data-sub-write>احجز موعداً جديداً بنقرة واحدة',
      'onclick="openModal()" data-doctor-inactive-block data-sub-write style=',
      '<div class="list-actions sy-acts sy-slots" style="--sy-slots:__SY_SLOTS__" data-sub-write onclick="event.stopPropagation()">\n            ${renderTimeActionBtn(e)}',
      "'<button class=\"sy-act\" data-slot=\"1\" data-sub-write title=\"تذكير واتساب\"",
      "'<button class=\"sy-act\" data-slot=\"1\" data-sub-write title=\"لا رقم هاتف مسجّل\"",
      "'<button class=\"sy-act sy-act-primary\" data-slot=\"3\" data-sub-write title=\"تم التأكيد\"",
    ],
    'appt-time.js': ["return '<button data-sub-write data-slot=\"1\" class=\"time-track-btn cbadge"],
    'appt-wa.js': ["(c.kind !== 'sent' ? ' data-sub-write' : '')"],
    'appt-booking.js': ['<div class="list-actions sy-acts" data-sub-write onclick="event.stopPropagation()">\' + actions'],
    'appt-modal.js': ['\'<button type="button" data-sub-write onclick="unlinkSessionFromAppt('],
    'patient-profile.html': ['<span class="chart-hint" data-sub-write>اضغط على المنطقة المحددة', 'لا توجد تسويات.<span data-sub-write> استخدم الزر أعلاه'],
    'pp-plan.js': ['✓ مغطّاة بالكامل<span data-sub-write> — اضغط «إكمال» لإغلاقها</span>'],
    'pp-timeline.js': ['data-sub-write>ابدأ بتسجيل جلسة، موعد، أو دفعة'],
  };
  // مداخلُ الكتابة الضمنية بالمواعيد: حارسٌ بأول سطرٍ منفَّذ (قبل أي await/كتابة)
  const GUARD_RE = /if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) (return;|\{ try \{ ev\.preventDefault\(\); \} catch \(e\) \{\} return; \})/;
  [['appointments.html', 'openModal'], ['appointments.html', 'submitAppt'], ['appointments.html', 'quickSchedulePlanned'],
   ['appt-views.js', 'onK3ApptDragStart'], ['appt-views.js', 'onK3SlotDrop'], ['appt-views.js', 'onWkSlotDrop'],
   ['appt-blocks.js', 'openBlockModal'], ['appt-blocks.js', 'saveBlock'], ['appt-blocks.js', 'deleteBlock'],   /* v498 */
   ['appt-time.js', 'openDismissedCompleteModal'], ['appt-time.js', 'overrideApptTime'], ['appt-wa.js', 'openWaReminderModal']].forEach(([f, fn]) => {
    let body = '';
    try { body = extractFunction(read(f), fn); } catch (e) { miss(f + ': ' + fn + ' غائبة'); return; }
    const g = body.search(GUARD_RE);
    if (g < 0) { miss(f + ': ' + fn + ' بلا حارس وضع القراءة'); return; }
    const aw = body.indexOf('await '), wr = body.search(/\.(update|insert|upsert|delete)\(/);
    if ((aw > -1 && aw < g) || (wr > -1 && wr < g)) miss(f + ': ' + fn + ' — الحارس بعد أول await/كتابة');
  });
  const apH = read('appointments.html');
  const ea = extractFunction(apH, 'editAppt');
  if (!/apptApplyModalReadOnly\(\);[^\n]*\n\}$/.test(ea)) miss('appointments.html: editAppt لا ينتهي بـapptApplyModalReadOnly');
  const amr = extractFunction(apH, 'apptApplyModalReadOnly');
  if (!/window\.SyDentSub\.isReadOnly\(\)/.test(amr) || !/el\.disabled = true; el\.setAttribute\('data-sub-ro', '1'\)/.test(amr) || !/el\.getAttribute\('data-sub-ro'\)/.test(amr) || !/querySelectorAll\('\.tpw'\)[\s\S]*?w\.style\.pointerEvents = 'none'/.test(amr)) miss('appointments.html: نافذة التفاصيل لا تعطّل الحقول أو لا تعيد ما عطّلته');
  if (!/function blockReadOnly\(\)/.test(blk) || !/function isReadOnly\(\)/.test(blk)) miss('SyDentSub بلا isReadOnly/blockReadOnly');
  // أزرارٌ يمتدّ وسمُها على أكثر من سطر: الوسمُ داخل وسم البداية نفسه
  const tagOf = (src, onclick) => { const m = new RegExp('<button[^>]*onclick="' + onclick.replace(/[()]/g, '\\$&') + '"[^>]*>').exec(src); return m ? m[0] : ''; };
  const ph = read('patients.html');
  ['openImportModal()', 'openPrmModal()'].forEach(o => { if (tagOf(ph, o).indexOf('data-sub-write') < 0) miss('patients.html: زر ' + o + ' بلا data-sub-write'); });
  const auo = extractFunction(ph, 'applyUrlOpen');
  if (!/if \(o && window\.SyDentSub\) \{\s+var _sub = await window\.SyDentSub\.load\(\);\s+if \(_sub && _sub\.level !== 'full'\) return;\s+\}\s+if \(o === 'recall'\)/.test(auo)) miss('patients.html: الروابط العميقة (?open=) تفتح نوافذ الكتابة بوضع القراءة');
  let nMarks = 0;
  Object.keys(RO_PAGES).forEach(f => {
    const src = read(f);
    RO_PAGES[f].forEach(k => { if (src.indexOf(k) < 0) miss(f + ': عنصر كتابة فقد وسمه: ' + k); else nMarks++; });
    // بطاقة المريض تُغطّى بسجلّ معالجاتها (قاعدةٌ أوسع أدناه: وسمٌ أو data-sub-read أو معالجُ كتابة)
    if (f !== 'patient-profile.html') for (const m of src.matchAll(/<[a-z]+\b[^>]*data-doctor-inactive-block[^>]*>/g)) {
      if (m[0].indexOf('data-sub-write') < 0) miss(f + ': عنصر data-doctor-inactive-block بلا data-sub-write: ' + m[0].slice(0, 80));
    }
  });
  /* ── بطاقة المريض (الصفحة الرابعة): سجلُّ معالجاتٍ كامل بدل وسمٍ عنصراً عنصراً ──
     أكثر من 200 معالج عبر الصفحة وتسع وحدات؛ كلُّ اسمٍ مصنَّف (كتابة · حراسة · قراءة ·
     خامل)، وسطرُ CSS بـpatient-profile.css مولَّدٌ من قائمة الكتابة ويُقارَن حرفياً،
     ومعالجٌ جديد بلا تصنيف يُسقط الحارس فيُجبر صاحبه على القرار. */
  // سجلُّ معالجات بطاقة المريض لوضع القراءة — مصدرٌ واحد يُنسخ حرفياً إلى check-mirrors (V11)
  const PP_FILES = ['patient-profile.html', 'pp-core.js', 'pp-clinical.js', 'pp-dental.js', 'pp-modules.js', 'pp-plan.js', 'pp-timeline.js', 'pp-appt.js', 'pp-extras.js', 'pp-wa.js'];
  const PP_WRITE = ['openApptModal', 'openNewSessionEntry', 'openModal', 'openWaHub', 'openPayModal', 'openEditModal', 'unlinkFromFamily', 'openFamilyLinkModal',
    'openPlannedApptModal', 'toggleBatchMode', 'toggleExamMode', 'toggleDraftMode', 'examUndo', 'batchApply', 'draftUndo', 'draftClearAll', 'draftSave',
    'draftSetWidth', 'draftSetEraser', 'perioDeleteExam', 'perioNewExam', 'perioSave', 'perioCreateExam', 'openObModal', 'openAdjustmentModal',
    'openPlanModal', 'openLabOrderModal', 'openRxModal', 'openPostOpModal', 'savePayment', 'saveOpeningBalance', 'saveAdjustment', 'nseRegional',
    'nseFree', 'sessProvMoveToggle', 'sessProvTakeAppt', 'sessPickStatus', 'snTplSaveCurrent', 'snTplDeleteSelected', 'aiSuggestSessionNote',
    'saveSession', 'aiPatientSummary', 'aiReferralOpen', 'aiExplainPlan', 'aiSeqSuggest', 'aiPlanWaSend', 'refTplSaveCurrent', 'refTplDeleteSelected',
    'aiReferralGenerate', 'onAddPlannedClickPP', 'saveAppt', 'saveEditedPatient', 'confirmRegionalAreaPick', 'completeToothPlannedFromModal',
    'pickStatus', 'pickReviewMonths', 'aiSuggestToothNote', 'saveToothAndOpenLab', 'saveRegionalAndOpenLab', 'saveBatchAndOpenLab',
    'saveToothTreatment', 'openImplantTemplatesModal', 'saveImplantLog', 'openImplantTemplateEdit', 'saveImplantTemplate', 'labTplSaveCurrent',
    'labTplDeleteSelected', 'ppOpenLabModal', 'labClearDateSent', 'labAiDraftOrder', 'labAiSaveAndSend', 'saveLabOrder', 'ppSaveLab', 'revertToFifo',
    'saveManualSplits', 'ppSendWaReminder', 'waTplSaveCurrent', 'waTplDeleteSelected', 'ppWaAiDraft', 'ppWaComposeSend', 'savePaymentPlan',
    'openRxTemplatesModal', 'rxAddItemRow', 'savePrescription', 'openPostOpTemplatesModal', 'ppPostOpAiSuggest', 'savePostOpNote',
    'openPostOpTemplateEdit', 'savePostOpTemplate', 'confirmMaterialDeduction', 'setSessionPhase', 'setSessionOption', 'adoptPlanOption', 'openAltBridgePicker', 'aiPlanOptPick', 'completeSessionFromProfile', 'ppSessionOpenLab',
    'delSession', 'openSplitEditor', 'delPayment', 'delAdjustment', 'advanceLabOrder', 'redoLabOrder', 'editLabOrder', 'delLabOrder',
    'deletePrescription', 'rxEditTemplate', 'deleteRxTemplate', 'deletePostOpNote', 'deletePostOpTemplate', 'removeImplant', 'undoExtraction',
    'clearToothStatus', 'removeSpacerUnit', 'removeSocket', 'removeCondition', 'deleteImplantLog', 'linkToFamily', 'deleteImplantTemplate', 'batchSetStatus',
    'batchPickTx', 'examSetStatus', 'examSetMonths', 'examPick', 'planWa', 'planSetStatus', 'removePendingPP', 'unlinkSessionFromApptPP',
    'quickSchedulePlannedFromProfile', 'editPlannedFromProfile', 'deletePlannedFromProfile', 'pfDeleteFile', 'planNewVisit', 'planLinkVisitPick', 'planLinkVisit', 'ppFlagsToggleEdit', 'ppFlagToggle'];
  // عناصرُ تحمل بيانات (سنٌّ بالمخطط · نقطةُ نزف · شريحةُ مراقبة · سجلُّ زرعة) — تبقى ظاهرة ويحرسها أولُ سطرٍ بالدالة
  const PP_GUARD = ['openToothModal', 'openImplantLog', 'perioBop', 'endToothWatch'];
  const PP_READ = ['switchTab', 'switchTabByName', 'famFilter', 'printChart', 'showDentSeg', 'toggleHistoryMode', 'historyStep', 'historyGo',
    'historyToday', 'onTlTypeChip', 'onTlDateRangeChange', 'onTlSearchInput', 'onTlLoadMore', 'perioPickExam', 'perioToggleCompare', 'perioPrint',
    'pfApplyToothFilter', 'closeModal', 'openPrintChoice', 'doPrintRecord', 'openStatementModal', 'printTreatmentPlan', 'copyTreatmentPlan',
    'stmtSetPreset', 'printStatement', 'copyStatement', 'printPrescription', 'copyPrescription', 'printPostOp', 'copyPostOp',
    'resetTimelineFilters', 'pfOpenFile', 'aiPlanCopy', 'aiPlanPrint', 'aiReferralCopy', 'aiReferralPrint', 'aiSeqCopy', 'ppWaComposeCopy', 'labAiCopy', 'labSlipPrint', 'ppApptOpenInCalendar', 'ppMsgSetFilter', 'ppMsgToggle'];
  // حقولٌ وأزرارٌ تعيش داخل نوافذ/أوضاع كتابةٍ مداخلُها مخفية أو محروسة (أو حقول اللثة المقفلة بـreadOnly)
  const PP_INERT = ['toothUnitsChanged', 'draftSetEraserSize', 'pfOnFilesPicked', 'onAdjKindChange', 'sessApptChanged', 'snTplApply', 'snTplGlowSync', 'refTplApply',
    'onApptPlannedToggle', 'onProviderChange', 'implantApplyTemplate', 'labTplApply', 'onLabApptChange', 'labTplGlowSync', 'waTplApply', 'planRecalc',
    'rxApplyTemplate', 'postOpApplyTemplate', 'postOpApplyLibrary', 'onSplitInputChange', 'backToStep1', 'switchTxTab', 'toggleSurfaceChip', 'toggleRootChip',
    'selectAllRootChips', 'pickToothTreatment', 'regQuadToggle', 'regQuadAll', 'regArchToggle', 'regArchAll', 'bridgeExtraAdj', 'nsePick',
    'perioPdInput', 'perioPdKey', 'perioRecInput', 'perioMobInput'];
  const PP_ACT_WRITE = ['new', 'remind', 'rebook', 'stage', 'schedule', 'editplanned', 'delplanned'];
  const PP_ACT_READ = ['open', 'more'];
  const PP_SPECIAL = { openModal: '[onclick*="openModal(\'aiHubModal\')"]' };
  const PP_EXTRA_SEL = ['#pfDropZone', '#pfUploadCategory', '#pfUploadTooth', '.wend-x'];
  function ppReadOnlyCss() {
    const sels = PP_WRITE.map(n => PP_SPECIAL[n] || '[onclick*="' + n + '("]')
      .concat(PP_ACT_WRITE.map(a => '[data-appt-act="' + a + '"]'))
      .concat(PP_EXTRA_SEL);
    return 'html[data-sub-level="read"] :is(' + sels.join(',') + '){display:none !important;}';
  }

  {
    const PP_SKIP = new Set(['if', 'event', 'this', 'return', 'function', 'document', 'window', 'parseInt', 'String', 'Number', 'setTimeout']);
    const classified = new Set([...PP_WRITE, ...PP_GUARD, ...PP_READ, ...PP_INERT]);
    const found = new Set(), acts = new Set();
    const writeSels = PP_WRITE.filter(n => !PP_SPECIAL[n]).map(n => n + '(').concat(["openModal('aiHubModal')"]);
    let hideMismatch = [];
    PP_FILES.forEach(f => {
      const src = read(f);
      // القيمة كاملةً حتى محدِّدها (للإخفاء) · وبادئتُها حتى أول علامة اقتباس (للأسماء — تتجنّب الشيفرة المسلسلة)
      for (const m of src.matchAll(/on(click|dblclick|change|input|submit|keydown)=(\\?["'])([\s\S]*?)\2/g)) {
        const head = m[3].match(/^[^"']*/)[0];
        const names = [...head.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[1]).filter(n => !PP_SKIP.has(n));
        names.forEach(n => found.add(n));
        if (m[1] !== 'click') continue;
        const shouldHide = names.some(n => PP_WRITE.includes(n));
        const hidden = writeSels.some(sel => m[3].replace(/\\'/g, "'").indexOf(sel) > -1);
        if (shouldHide !== hidden) hideMismatch.push(f + ': ' + m[3].slice(0, 60));
      }
      for (const m of src.matchAll(/data-appt-act=\\?"([a-z]+)/g)) acts.add(m[1]);
    });
    const unclassified = [...found].filter(n => !classified.has(n));
    const stale = [...classified].filter(n => !found.has(n));
    if (unclassified.length) miss('بطاقة المريض: معالجات بلا تصنيف: ' + unclassified.join('، '));
    if (stale.length) miss('بطاقة المريض: أسماء بالسجل لم تعد موجودة: ' + stale.join('، '));
    const dupe = [PP_WRITE, PP_GUARD, PP_READ, PP_INERT].flat().filter((x, i, a) => a.indexOf(x) !== i);
    if (dupe.length) miss('بطاقة المريض: اسم بأكثر من تصنيف: ' + dupe.join('، '));
    if (hideMismatch.length) miss('بطاقة المريض: إخفاءٌ لا يطابق التصنيف (تصادم أسماء؟): ' + hideMismatch.slice(0, 3).join(' | '));
    const actBad = [...acts].filter(a => !PP_ACT_WRITE.includes(a) && !PP_ACT_READ.includes(a));
    if (actBad.length) miss('بطاقة المريض: أفعال data-appt-act بلا تصنيف: ' + actBad.join('، '));
    const ppCss = read('patient-profile.css');
    if (ppCss.indexOf(ppReadOnlyCss()) < 0) miss('patient-profile.css: سطر إخفاء الكتابة لا يطابق السجل حرفياً');
    if (!/html\[data-sub-level="read"\] \.wend-chip\{cursor:default;\}/.test(ppCss)) miss('patient-profile.css: شريحة المراقبة تبدو قابلة للنقر بالقراءة');
    const guardAt = (f, fn, afterRe) => {
      let body = '';
      try { body = extractFunction(read(f), fn); } catch (e) { miss(f + ': ' + fn + ' غائبة'); return; }
      const g = body.search(GUARD_RE);
      if (g < 0) { miss(f + ': ' + fn + ' بلا حارس وضع القراءة'); return; }
      const aw = body.indexOf('await '), wr = body.search(/\.(update|insert|upsert|delete)\(/);
      if ((aw > -1 && aw < g) || (wr > -1 && wr < g)) miss(f + ': ' + fn + ' — الحارس بعد أول await/كتابة');
    };
    const ppFileOf = fn => PP_FILES.find(f => read(f).indexOf('function ' + fn + '(') > -1);
    PP_GUARD.concat(['openPayModal', 'openApptModal', 'openNewSessionEntry']).forEach(fn => {
      const f = ppFileOf(fn);
      if (!f) miss('بطاقة المريض: ' + fn + ' غير معرّفة'); else guardAt(f, fn);
    });
    const tm = extractFunction(read('pp-dental.js'), 'openToothModal');
    if (!/\{\s*var _entryReq = \(_toothEntryNext === true\); _toothEntryNext = false;[^\n]*\n\s*if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(tm)) miss('pp-dental.js: حارس openToothModal ليس بعد استهلاك طلب المدخل مباشرة');
    const sds = extractFunction(read('pp-dental.js'), 'saveDentitionState');
    if (!/if \(window\.SyDentSub && window\.SyDentSub\.isReadOnly\(\)\) return;\s+var pt =/.test(sds)) miss('pp-dental.js: تبديل الإطباق يحفظ بوضع القراءة');
    const rpg = extractFunction(read('pp-modules.js'), 'renderPerioGrid');
    if (!/window\.SyDentSub\.isReadOnly\(\)\) \{\s+panel\.querySelectorAll\('input\.pd-in'\)\.forEach\(function\(el\)\{ el\.readOnly = true; \}\);/.test(rpg)) miss('pp-modules.js: حقول اللثة قابلة للكتابة بوضع القراءة');
    const pph = read('patient-profile.html');
    if (!/window\.SyDentSub \? window\.SyDentSub\.load\(\) : Promise\.resolve\(null\)\)\.then\(function \(_sub\) \{\s+if \(_sub && _sub\.level !== 'full'\) return;\s+if \(params\.get\('pay'\)/.test(pph)) miss('patient-profile.html: ?pay=1/?appt=1 تفتح نوافذ الكتابة بوضع القراءة');
    for (const m of pph.matchAll(/<[a-z]+\b[^>]*data-doctor-inactive-block[^>]*>/g)) {
      const t = m[0], oc = (t.match(/onclick="([^"]*)"/) || [, ''])[1];
      const covered = /data-sub-write|data-sub-read/.test(t) || writeSels.some(sel => oc.indexOf(sel) > -1);
      if (!covered) miss('patient-profile.html: عنصر data-doctor-inactive-block غير مغطّى: ' + t.slice(0, 80));
    }
    nMarks += PP_WRITE.length + PP_ACT_WRITE.length + PP_EXTRA_SEL.length;
    RO_PAGES['patient-profile.html (سجل)'] = [];
  }
  /* ── بقيةُ الصفحات (الجولة الأخيرة): سجلٌّ مصنَّفٌ لكل صفحة بنمط بطاقة المريض ──
     كتابة ⇒ سطرُ CSS مولَّد داخل <style> الصفحة (onclick/onsubmit/onchange/oninput حسب
     حدث الاسم) · حراسة ⇒ صفٌّ/بطاقةٌ تبقى ظاهرة وأولُ سطرٍ بالدالة blockReadOnly ·
     قراءة/خامل ⇒ لا شيء. الاشتراك بلا معالجات (التجديد مسموح بالقراءة) فخارج السجل. */
  const RO_REG = {
    "treatments.html": {
      "write": ["resetToDefaults", "openAddModal", "saveTreatment", "matAddRow", "saveMaterials", "toggleFavorite", "editTreatment", "duplicateTreatment", "openMaterialsModal", "toggleActive", "deleteTreatment"],
      "guard": ["treatCardOpen"],
      "read": ["printLegend", "resetFilters", "closeModal", "closeMaterialsModal"],
      "inert": ["openTreatColorPicker", "matUpdateRowUnit"],
      "extra": [".drag-handle"]
    },
    "doctors.html": {
      "write": ["saveDoctor", "unlinkFromUser", "linkToUser", "goEditDoctor"],
      "guard": [], "read": ["closeModal"], "inert": ["openDocColorPicker"], "extra": []
    },
    "employees.html": {
      "write": ["openAddModal", "saveEmployee", "removeAllLockPins", "saveOwnerPin", "openOwnerPinModal", "openEditModal", "toggleActive", "deleteEmployee"],
      "guard": ["empCardOpen"],
      "read": ["closeModal", "closeOwnerModal"],
      "inert": ["onRoleChange", "updateCompensationFieldsVisibility", "openEmpDocColorPicker", "onSystemAccessChange", "onShareInput"],
      "extra": [".drag-handle"]
    },
    "payouts.html": {
      "write": ["openModal", "deleteCurrent", "savePayout"],
      "guard": ["openEditModal"],
      "read": ["setMethodFilter", "renderPayouts", "clearPayoutDateFilter", "closeModal", "populateProviderDropdown", "setEmployeeFilter", "toggleBreakdownRow"],
      "inert": ["onProviderChange", "onPeriodChange", "onBreakdownChange", "onAmountInput", "applySuggestion", "setModalMethod", "setModalSource", "toggleBreakdown"],
      "extra": []
    },
    "expenses.html": {
      "write": ["openExpenseModal", "openCatModal", "saveExpense", "saveCategory", "editExpense", "deleteExpense", "editCategory", "toggleCategoryActive", "deleteCategory"],
      "guard": ["expRowOpen"],
      "read": ["switchTab", "applyFilters", "clearDateFilter", "closeExpModal", "closeCatModal"],
      "inert": ["openCatColorPicker", "syncExpSource"],
      "extra": []
    },
    "inventory.html": {
      "write": ["openItemModal", "saveItem", "saveMovement", "finishBatch", "openMoveModal", "deleteItem", "finishBatchFromItem", "ivoSetQty", "applyCount"],
      "guard": ["invRowOpen"],
      "read": ["closeModal", "openHistory", "openOrderModal", "openCountModal"],
      "inert": ["mgFillExample", "itemExpiryUiRefresh", "onMoveReasonChange"],
      "extra": []
    },
    "labs.html": {
      "write": ["openLabOrderModal", "openLabModal", "labTplSaveCurrent", "labTplDeleteSelected", "labClearDateSent", "labAiDraftOrder", "labAiSaveAndSend", "saveLabOrder", "saveLab", "saveLabPayment", "editLab", "delLab", "advanceLabOrder", "redoLabOrder", "editLabOrder", "delLabOrder", "delLabPayment"],
      "guard": [],
      "read": ["applyFilter", "setLabPageSize", "closeModal", "closeLabModal", "openLabStatement", "labAiCopy", "labSlipPrint"],
      "inert": ["labTplApply", "onLabOrderPatientChange", "onLabOrderAppointmentChange", "labTplGlowSync"],
      "extra": []
    },
    "accounting.html": {
      "write": ["digestGenerate", "setAccUnifyCur", "saveAccUsdRate"],
      "guard": [], "read": [], "inert": [], "extra": []
    },
    "provider-reports.html": {
      "write": ["savePayout", "openPayoutModal", "deletePayout"],
      "guard": [],
      "read": ["exportExcel", "refresh", "clearPresetHighlight", "onFilterChange", "setBasis", "closeModal", "printLedger", "goToFullPayoutsPage", "setPreset", "showDetails", "printSlip", "openLedger", "setRptTab"],
      "inert": [], "extra": []
    },
    "audit-log.html": {
      "write": ["openArchiveModal", "doArchive", "restoreAll", "restoreOne"],
      "guard": [],
      "read": ["exportCSV", "dismissAlerts", "applyFilters", "loadMore", "closeArchiveModal", "filterByAlert"],
      "inert": [], "extra": []
    },
    "settings.html": {
      "write": ["saveProfile", "saveLicenseNo", "applyDerivedClinicName", "keepCustomClinicName", "saveClinicIdentity", "saveMultiCurrency", "saveProductionGoal", "saveAppointmentSettings", "openApptTypeModal", "openOperatoryModal", "toggleWaEnabled", "insertPlaceholder", "insertPlaceholderInto", "saveClinicSettings", "resetTemplate", "saveBookingSettings", "saveStaffMsgPresets", "pfdAdd", "pfdRemove", "pfdReset", "savePatientFlagDefs", "resetStaffMsgPresets", "saveAiSettings", "runBackfill", "saveApptType", "saveOperatory", "duplicateApptType", "editApptType", "deleteApptType", "editOperatory", "deleteOperatory", "openBlockModal"],
      "guard": [],
      "read": ["settingsGo", "changeEmail", "changePassword", "previewTemplate", "copyBookingLink", "scanOrphanedPayments", "openDeleteModal", "closeApptTypeModal", "closeOperatoryModal", "closeDeleteModal", "confirmDelete", "closeClinicNameSync", "closeWaPreview"],
      "inert": ["pfdPreview", "autoSizeTextarea", "onApptTypeNameInput", "onApptTypeTreatmentChange", "onApptTypeProviderChange", "onApptTypeOperatoryChange", "openOpColorPicker"],
      "extra": []
    },
    "learn.html": {
      "write": [], "guard": [], "read": ["closePlayer", "setCat", "openPlayer"], "inert": [], "extra": []
    }
  };
  {
    const SKIP2 = new Set(['if', 'event', 'this', 'return', 'function', 'document', 'window', 'parseInt', 'String', 'Number', 'setTimeout', 'confirm', 'alert']);
    const MARK = '/* M141-ب: وضعُ القراءة — مولَّد من سجلّ الصفحة بـcheck-mirrors (V11) */';
    const EVSEL = { click: n => '[onclick*="' + n + '("]', submit: n => '[onsubmit*="' + n + '("] [type="submit"]', change: n => '[onchange*="' + n + '("]', input: n => '[oninput*="' + n + '("]' };
    Object.keys(RO_REG).forEach(f => {
      const r = RO_REG[f], src = read(f);
      const H = new Map(), attrs = [];
      for (const m of src.matchAll(/on(click|dblclick|change|input|submit|keydown|keyup|blur)=(\\?["'])([\s\S]*?)\2/g)) {
        const head = m[3].match(/^[^"']*/)[0];
        const names = [...head.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[1]).filter(n => !SKIP2.has(n));
        names.forEach(n => { const e = H.get(n) || new Set(); e.add(m[1]); H.set(n, e); });
        attrs.push({ ev: m[1], val: m[3].replace(/\\'/g, "'"), names });
      }
      const cls = new Set([...r.write, ...r.guard, ...r.read, ...r.inert]);
      const un = [...H.keys()].filter(k => !cls.has(k)), st = [...cls].filter(k => !H.has(k));
      if (un.length) miss(f + ': معالجات بلا تصنيف: ' + un.join('، '));
      if (st.length) miss(f + ': أسماء بالسجل لم تعد موجودة: ' + st.join('، '));
      const dup = [r.write, r.guard, r.read, r.inert].flat().filter((x, i, a) => a.indexOf(x) !== i);
      if (dup.length) miss(f + ': اسم بأكثر من تصنيف: ' + dup.join('، '));
      const sels = [];
      r.write.forEach(n => ['click', 'submit', 'change', 'input'].forEach(ev => { if (H.get(n) && H.get(n).has(ev)) sels.push(EVSEL[ev](n)); }));
      (r.extra || []).forEach(x => sels.push(x));
      const want = sels.length ? MARK + '\nhtml[data-sub-level="read"] :is(' + sels.join(',') + '){display:none !important;}' : '';
      if (want && src.indexOf(want) < 0) miss(f + ': سطر إخفاء الكتابة لا يطابق السجل حرفياً');
      if (!want && src.indexOf(MARK) > -1) miss(f + ': سطر إخفاء بلا معالجات كتابة');
      const mis = attrs.filter(a => EVSEL[a.ev]).filter(a => {
        const should = a.names.some(n => r.write.includes(n));
        const hidden = r.write.some(n => a.val.indexOf(n + '(') > -1 && H.get(n) && H.get(n).has(a.ev));
        return should !== hidden;
      });
      if (mis.length) miss(f + ': إخفاءٌ لا يطابق التصنيف (تصادم أسماء؟): ' + mis.slice(0, 2).map(a => a.val.slice(0, 40)).join(' | '));
      r.guard.forEach(fn => {
        let body = '';
        try { body = extractFunction(src, fn); } catch (e) { miss(f + ': ' + fn + ' غائبة'); return; }
        const g = body.search(GUARD_RE);
        if (g < 0 || g > body.indexOf('{') + 4) miss(f + ': ' + fn + ' بلا حارس وضع القراءة بأول سطر');
      });
      nMarks += sels.length;
    });
    /* v365 — مستمعاتُ الأحداث المربوطة بالـJS (addEventListener / .onX =) لا تراها سجلّاتُ
       المعالجات أعلاه، فتُحصى هنا لكل ملفٍّ مراجَع: العددُ المسجَّل = ما رُوجع واحداً واحداً
       (108 مستمعاً — كلُّها قراءة، أو داخل عنصرٍ/نافذةٍ مخفيةٍ بالقراءة، أو دالةٌ محروسة).
       مستمعٌ جديد أو محذوف يُسقط الحارس: صنّفه لوضع القراءة (إخفاء · حراسة · قراءة) ثم حدّث عدده. */
    const LISTENER_RE = /addEventListener\(\s*['"](click|dblclick|dragstart|drop|dragend|dragover|submit|change|input|pointerdown|pointerup|mousedown|touchstart|contextmenu|keydown|keyup)['"]|\.on(click|dblclick|change|input|submit|keydown)\s*=\s*(?!=)/g;
    const LISTENERS = {
      'index.html': 3, 'patients.html': 16   /* v442: عدّاد أحرف نص الرسالة (input) — قراءة بحتة */, 'appointments.html': 3   /* v439: مستمع إغلاق modalOverlay بنقرةٍ خارجية حُذف — كان يمحو نموذجاً معبّأً · v565: مستمعُ «+N» انتقل إلى SyDentBadgeCap بـtheme.js (قراءةٌ بحتة) */, 'appt-views.js': 7   /* v498: نقرُ فترةٍ محجوزة ⇒ openBlockModal (محروسة) */, 'appt-blocks.js': 0, 'appt-time.js': 0, 'appt-wa.js': 1   /* v443: عدّاد أحرف نص التذكير (input) — قراءة بحتة */,
      'appt-booking.js': 0, 'appt-modal.js': 0, 'patient-profile.html': 10, 'pp-core.js': 0, 'pp-clinical.js': 0, 'pp-dental.js': 2,
      'pp-modules.js': 5, 'pp-plan.js': 0, 'pp-timeline.js': 0, 'pp-appt.js': 3, 'pp-extras.js': 2, 'pp-wa.js': 1,   /* v408: عدّاد أحرف نص الرسالة (input) — قراءة بحتة */
      'treatments.html': 16, 'doctors.html': 1, 'employees.html': 5, 'payouts.html': 1, 'expenses.html': 4, 'inventory.html': 5   /* v569: نافذةُ «جهّز الطلبية» (نقرٌ + إدخال) — قراءة بحتة · v570: نافذةُ الجرد (نقرٌ + إدخال) — الاعتمادُ وحده كتابة وزرُّه مخفيٌّ بالقراءة ومحروس */,
      'labs.html': 4, 'accounting.html': 11   /* v546: تصديرُ Excel — قراءة بحتة */, 'provider-reports.html': 3   /* v539: نقرُ تبويب العلاجات (ترتيبٌ · تفاصيلُ جلسات) · v545: طباعةُ الملخّص ونسخُه — قراءة بحتة */, 'audit-log.html': 6, 'settings.html': 2, 'learn.html': 1
    };
    let nListeners = 0;
    Object.keys(LISTENERS).forEach(f => {
      const n = (read(f).match(LISTENER_RE) || []).length;
      nListeners += n;
      if (n !== LISTENERS[f]) miss(f + ': عدد مستمعات الأحداث ' + n + ' والمراجَع ' + LISTENERS[f] + ' — صنّف الجديد لوضع القراءة ثم حدّث العدد');
    });
    const regFiles = new Set(Object.keys(RO_REG).concat(PP_FILES, Object.keys(RO_PAGES).filter(k => !/سجل/.test(k))));
    regFiles.forEach(f => { if (!(f in LISTENERS)) miss(f + ': ملفٌّ مراجَع بلا عدِّ مستمعات'); });
    if (nListeners !== 112) miss('مجموع المستمعات المراجَعة ' + nListeners + ' (المسجَّل 112)');   /* v569: +2 نافذةُ الطلبية بالمخزون */   /* v565: مستمعُ شارات الموعد انتقل لـtheme.js المشترك */
    const tr = extractFunction(read('treatments.html'), 'wireDragAndDrop');
    if (!/\|\| !!\(window\.SyDentSub && window\.SyDentSub\.isReadOnly\(\)\);/.test(tr)) miss('treatments.html: الترتيب بالسحب متاح بوضع القراءة');
    const em = extractFunction(read('employees.html'), 'wireDragAndDrop');
    if (!/if \(window\.SyDentSub && window\.SyDentSub\.isReadOnly\(\)\) \{ cards\.forEach\(function\(c\)\{ c\.removeAttribute\('draggable'\); \}\); return; \}/.test(em)) miss('employees.html: الترتيب بالسحب متاح بوضع القراءة');
    if (!/<div class="form-group" data-sub-write style="background:var\(--bg-input[^"]*">\s*<label[^>]*>➕ تسجيل دفعة للمخبر/.test(read('labs.html'))) miss('labs.html: نموذج دفعة المخبر ظاهر بوضع القراءة');
    if (!/if \(action && window\.SyDentSub\) \{\s+var _sub = await window\.SyDentSub\.load\(\);\s+if \(_sub && _sub\.level !== 'full'\) \{ history\.replaceState\(\{\}, '', 'employees\.html'\); action = null; \}/.test(read('employees.html'))) miss('employees.html: ?action= يفتح نموذج الموظف بوضع القراءة');
    if (!/\(window\.SyDentSub \? window\.SyDentSub\.load\(\) : Promise\.resolve\(null\)\)\.then\(function \(_sub\) \{\s+if \(_sub && _sub\.level !== 'full'\) return;\s+setTimeout\(function\(\)\{\s+openModal\(provId/.test(read('payouts.html'))) miss('payouts.html: ?action=new يفتح نموذج الدفعة بوضع القراءة');
    const stg = read('settings.html');
    if (!/if \(!_sub \|\| _sub\.level !== 'read'\) return;\s+document\.querySelectorAll\('#sv-clinic, #sv-ai, #sv-advanced, form\[onsubmit\*="saveProfile\("\], #fLicenseNo, #fLicenseOnRx'\)/.test(stg)) miss('settings.html: حقول الإعدادات غير مجمَّدة بوضع القراءة');
    if (/#sv-account|#sv-danger/.test((stg.match(/document\.querySelectorAll\('#sv-clinic[^']*'\)/) || [''])[0])) miss('settings.html: التجميد يطال الحساب أو الحذف');
  }
  if (!roMis) ok('وضع القراءة: قاعدة الإخفاء + الرسائل الداخلية + تعليم المستوى · صفحات مراجَعة: 16 (اللوحة · المرضى · المواعيد · بطاقة المريض + ' + Object.keys(RO_REG).length + ' بسجلّ) · عناصر مخفية: ' + nMarks + ' · مداخل ضمنية محروسة: 23 · كل المعالجات مصنَّفة · مستمعات JS مراجَعة: 109');
} catch (e) { bad('فشل فحص وضع القراءة: ' + e.message); }

/* ── V12) M141: دورة حياة الاشتراك بالأدمن — المدفوع لا يصير تجربة ────────────
   بلاغ المالك: تقصيرُ Max الشهري للماضي أوقف الحساب، و«إعادة التفعيل» أعادته
   تجربةً. العقد (نمط Chargebee change-term-end + Stripe/Chargebee resume):
   (1) التقصير تعديلُ تاريخ فقط — للماضي يُلغي السماح ولا يغيّر الحالة ولا يحظر؛
   (2) الاستئناف يعيد الموقوف كما كان حرفياً (الطلب المرفوض الذي لم يُفعَّل قط وحده
   يُمنح تجربةً أولى)؛ (3) إعادة التجربة للتجربة وحدها ومرفوضةٌ للمدفوع؛
   (4) أزرار «منتهٍ» بالقائمة ونافذة العميل منفصلة (تجربة/مدفوع)؛ (5) الشارة تفرّق.
   سلوكياً: transitionAccount وcomputeAccountState الحيّتان من admin.html بـvm. */
try {
  let lcMis = false;
  const miss = m => { lcMis = true; bad('دورة الحياة: ' + m); };
  const ah = read('admin.html'), ar = read('admin-render.js');
  // extractFunction يبدأ من «function» فيسقط «async» — يُعاد صراحةً
  const src = [extractFunction(ah, 'computeAccountState'), extractFunction(ah, 'planDisplayName'), 'async ' + extractFunction(ah, 'transitionAccount')].join('\n');
  // أزرار «منتهٍ»
  const expList = (ar.match(/case 'expired':[\s\S]*?break;/) || [''])[0];
  if (/reactivateAccount/.test(expList)) miss('قائمة الأدمن: «منتهٍ» ما زال يستدعي reactivateAccount');
  if (!/expTrial\s*\n?\s*\? '<button class="sy-act sy-act-primary" onclick="restartTrial\(/.test(expList) || !/: '<button class="sy-act sy-act-primary" onclick="renewAccount\(/.test(expList)) miss('قائمة الأدمن: أزرار «منتهٍ» غير مفصولة (تجربة ⇒ restartTrial · مدفوع ⇒ renewAccount)');
  const c360 = (ar.match(/\/\/ M141: نفس فصل القائمة[\s\S]*?\n  \}/) || [''])[0];
  if (/reactivateAccount/.test(c360) || !/restartTrial\(/.test(c360) || !/renewAccount\(/.test(c360)) miss('نافذة العميل: أزرار «منتهٍ» غير مفصولة');
  if (!/async function restartTrial\(id\)/.test(ah)) miss('restartTrial غائبة');
  if (!/var paidAtRest = \(s\.state === 'expired' \|\| s\.state === 'suspended'\) && \(s\.plan \|\| 'trial'\) !== 'trial';/.test(ar)) miss('بطاقة المدفوع المنتهي/الموقوف لا تعرض خطته');
  const rt = extractFunction(ah, 'restartTrial');
  if (!/if \(\(r\.plan \|\| 'trial'\) !== 'trial'\) \{/.test(rt) || !/transitionAccount\('restart_trial', r, \{\}\)/.test(rt)) miss('restartTrial لا ترفض المدفوع أو لا تمرّ بـrestart_trial');
  // M143: نوعُ حدثٍ مستقل — القيد بالهجرة · تسميةُ السجل · إعادةُ بناء MRR
  const m143 = read('migrations/143_restart_trial_event.sql');
  if (!/'owner_name_changed',\s*'restart_trial'\s*\]::text\[\]/.test(m143)) miss('M143: القيد لا يعرف restart_trial');
  if (!/'restart_trial':\s+\{ label_ar: 'إعادة تجربة'/.test(ar)) miss('سجل الأحداث بلا تسمية لـrestart_trial');
  if (!/type === 'reactivate' \|\| type === 'restart_trial' \|\|/.test(read('admin-modules.js'))) miss('إعادة بناء MRR تتجاهل restart_trial');
  if (/restart_trial'\) \? 'reactivate'/.test(ah)) miss('restart_trial ما زال يُسجَّل reactivate');
  const aa = extractFunction(ah, 'applyAdjust');
  if (/سيُعطّل فوراً/.test(aa) || !/يتحوّل الحساب للقراءة فقط حتى التجديد/.test(aa)) miss('تأكيد التقصير ما زال يَعِد بالتعطيل');
  const ra = extractFunction(ah, 'reactivateAccount');
  if (/سيُمنح فترة تجربة جديدة 30 يوم/.test(ra) || !/يعود كما كان قبل الإيقاف/.test(ra)) miss('تأكيد إعادة التفعيل ما زال يَعِد بتجربة جديدة');

  const DAY = 86400000;
  const mk = () => {
    const calls = { updates: [], bans: [], unbans: [], events: [] };
    const cfg = { trial: { code: 'trial', display_name: 'تجريبي', duration_days: 30, currency: 'SYP' },
                  yearly: { code: 'yearly', display_name: 'Max', duration_days: 0, currency: 'USD' } };
    const ctx = {
      console: { warn() {}, log() {} }, Date, Math, Number, String, JSON, Object, isFinite, parseInt,
      getPlanConfig: c => cfg[c] || null,
      planDurationForCycle: () => 30, planPriceForCycle: () => 55,
      normCycle: c => c || 'monthly', normCurrency: c => c || 'SYP',
      cycleLabelAr: () => 'شهري', currencyLabelAr: () => '',
      countActiveStaff: async () => 0,
      callAdminFn: async () => ({ ok: true }),
      banUserPermanently: async u => { calls.bans.push(u); },
      unbanUserIfBanned: async u => { calls.unbans.push(u); },
      logSubscriptionEvent: async ev => { calls.events.push(ev); return 'ev1'; },
      window: {}
    };
    ctx.window.sb = { from: () => ({ update: payload => ({ eq: () => ({ select: () => ({ maybeSingle: async () => {
      calls.updates.push(payload);
      return { data: Object.assign({}, ctx.__row, payload), error: null };
    } }) }) }) }) };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { ctx, calls, run: async (type, row, params) => { ctx.__row = row; return ctx.transitionAccount(type, row, params || {}); } };
  };
  const iso = d => new Date(Date.now() + d * DAY).toISOString();
  const paid = (o) => Object.assign({ id: 'r1', user_id: 'u1', status: 'accepted', plan: 'yearly', billing_cycle: 'monthly', price_paid: 55, currency: 'USD', trial_end: iso(1), grace_until: null }, o || {});
  const trial = (o) => Object.assign({ id: 'r2', user_id: 'u2', status: 'accepted', plan: 'trial', billing_cycle: null, trial_end: iso(1), grace_until: null }, o || {});
  ASYNC_CHECKS.push((async () => {
    const res = [];
    const expect = (n, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) res.push(n + ': ' + g + ' ≠ ' + w); };
    let t = mk(); let o = await t.run('shorten', paid({ grace_until: iso(5) }), { days: 2 });
    expect('shorten paid→past keys', Object.keys(t.calls.updates[0]).sort(), ['grace_until', 'trial_end']);
    expect('shorten paid→past grace', t.calls.updates[0].grace_until, null);
    expect('shorten paid→past no ban/unban', [t.calls.bans.length, t.calls.unbans.length], [0, 0]);
    expect('shorten paid→past event status', [t.calls.events[0].event_type, t.calls.events[0].to_status, t.calls.events[0].to_plan], ['shorten', 'accepted', 'yearly']);
    expect('shorten paid→past state', [t.ctx.computeAccountState(o.newRow).state, t.ctx.computeAccountState(o.newRow).label], ['expired', 'منتهي · للقراءة فقط']);
    t = mk(); o = await t.run('shorten', trial(), { days: 2 });
    expect('shorten trial→past state', [o.newRow.status, o.newRow.plan, t.ctx.computeAccountState(o.newRow).label], ['accepted', 'trial', 'تجربة منتهية']);
    t = mk(); o = await t.run('shorten', paid({ trial_end: iso(10), grace_until: iso(3) }), { days: 2 });
    expect('shorten in-future keys', Object.keys(t.calls.updates[0]), ['trial_end']);
    expect('shorten in-future still paid', t.ctx.computeAccountState(o.newRow).state, 'paid');
    t = mk(); o = await t.run('extend', paid({ trial_end: iso(-3) }), { days: 5 });
    expect('extend expired paid', [t.calls.updates[0].status, t.calls.unbans.length, t.ctx.computeAccountState(o.newRow).state], ['accepted', 1, 'paid']);
    t = mk(); o = await t.run('reactivate', paid({ status: 'rejected', trial_end: iso(20) }));
    expect('resume paid payload', t.calls.updates[0], { status: 'accepted' });
    expect('resume paid unban', t.calls.unbans, ['u1']);
    expect('resume paid event', [t.calls.events[0].event_type, t.calls.events[0].from_plan, t.calls.events[0].to_plan, t.calls.events[0].to_trial_end === t.calls.events[0].from_trial_end], ['reactivate', 'yearly', 'yearly', true]);
    expect('resume paid state', [o.newRow.plan, o.newRow.billing_cycle, o.newRow.price_paid, t.ctx.computeAccountState(o.newRow).state], ['yearly', 'monthly', 55, 'paid']);
    t = mk(); o = await t.run('reactivate', paid({ status: 'rejected', trial_end: iso(-2) }));
    expect('resume lapsed paid ⇒ read', [t.calls.updates[0], t.ctx.computeAccountState(o.newRow).label], [{ status: 'accepted' }, 'منتهي · للقراءة فقط']);
    t = mk(); o = await t.run('reactivate', paid({ status: 'rejected', trial_end: null, billing_cycle: null }));
    expect('resume permanent', [t.calls.updates[0], t.ctx.computeAccountState(o.newRow).isPermanent], [{ status: 'accepted' }, true]);
    t = mk(); o = await t.run('reactivate', trial({ status: 'rejected', trial_end: iso(9) }));
    expect('resume trial keeps date', [t.calls.updates[0], t.ctx.computeAccountState(o.newRow).state], [{ status: 'accepted' }, 'trial']);
    t = mk(); o = await t.run('reactivate', trial({ status: 'rejected', trial_end: null }));
    const u0 = t.calls.updates[0];
    expect('never-activated ⇒ first trial', [u0.status, u0.plan, !!u0.trial_end && Math.abs(new Date(u0.trial_end) - Date.now() - 30 * DAY) < 5 * 60000, t.calls.events[0].event_type], ['accepted', 'trial', true, 'restart_trial']);
    t = mk(); o = await t.run('restart_trial', trial({ trial_end: iso(-4) }));
    expect('restart trial', [t.calls.updates[0].plan, t.calls.updates[0].grace_until, t.calls.events[0].event_type, t.ctx.computeAccountState(o.newRow).state], ['trial', null, 'restart_trial', 'trial']);
    t = mk(); o = await t.run('restart_trial', paid({ trial_end: iso(-4) }));
    expect('restart refused for paid', [o.ok, o.error, t.calls.updates.length, t.calls.events.length], [false, 'paid_account_no_trial_restart', 0, 0]);
    t = mk(); o = await t.run('suspend', paid());
    expect('suspend unchanged', [t.calls.updates[0], t.calls.bans], [{ status: 'rejected' }, ['u1']]);
    if (res.length) res.forEach(x => miss('سلوك: ' + x));
    else if (!lcMis) ok('دورة الحياة: التقصير تاريخٌ فقط · الاستئناف كما كان · إعادة التجربة للتجربة وحدها · أزرار «منتهٍ» مفصولة بالسطحين · الشارة والتأكيدات — 20 توكيداً سلوكياً على transitionAccount الحيّة');
  })().catch(e => bad('فشل فحص دورة الحياة (سلوك): ' + e.message)));
} catch (e) { bad('فشل فحص دورة الحياة: ' + e.message); }

Promise.all(ASYNC_CHECKS).then(() => {
console.log('');
if (failures) {
  console.log(`⛔ ${failures} كسر بالمرايا — أي تغيير دلالي يجب تعميمه على كل النسخ (Rule #211).`);
  process.exit(1);
}
console.log('✅ كل المرايا متطابقة (هواتف ×6 · قوالب 2/3/2/3/2 · أدوات الذيل ×3 · YmdLocal ×2 · اشتقاق الأقساط ×3 · theme-color ×2 · تحذيرات طبية ×4 · مصدر المريض ×2 · ميزات الخطة ×3 · عناصر الواتساب النائبة ورابط الحجز ×2 · خيارات القوالب ×2 · قوالب طلب المخبر ×2 · صياغة أمر المخبر AI ×2 · تعتيم المُكدَّس ×3 · فروع النقابة ×2 · الحارس المتزامن ×5 · تلميح الأدمن ×6 · تصدير إكسل من مصدر واحد · أرقام العرض لاتينية بالأسطول · تركيب مبدّل مودال السن بكل مساراته · حالات المخبر وعقد المسودّة · منتقي اللقب المهني ×2 · مفاتيح تفعيل الإعدادات ×5 · بوابة اليوم بأزرار تتبّع الوقت · تبويب المواعيد ببطاقة المريض وأزرار حضوره · مسودة الشرح فوق المخطط · مفتاح التخزين ASCII · نغمات ألوان الحالات · بوابة الاشتراك · وضع القراءة · دورة حياة الاشتراك).');
});
