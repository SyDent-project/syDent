#!/usr/bin/env node
/* =====================================================================
 * SyDent — check-critical-logic.js  (الحارس السابع — المنطق الحرج)
 *
 * حزمة اختبارات آلية دائمة للمنطق الحرج الذي غلطُه صامتٌ وخطير.
 * تستخرج الدوال الحية من الملفات (string slicing، نفس نمط check-mirrors.js)
 * وتشغّلها بصندوق vm معزول على متجهات ثابتة، ثم تؤكّد خصائصها.
 *
 * ⚠️ للقراءة والتحقّق فقط — لا تكتب لأي ملف، لا تلمس DB، لا تلمس أي جدول مالي.
 *    الاختبار يحمي منطق المحاسبة بقفل سلوكه؛ لا يخاطر به.
 *
 * المجموعات (تنمو عبر الجلسات):
 *   A) FIFO / توزيع الدفعات — buildFifoSplits (الكانوني، patient-profile.html)
 *      ⇔ _apptBuildFifoSplits (المرآة، appointments.html)
 *      — كل متجه يُشغَّل على الدالتين ويؤكّد تطابق المخرجين (قفل المرآة)
 *      — + خصائص FIFO نفسها + الثابت الجوهري: Σ الـsplits = round(الدفعة)
 *   [لاحقاً] B) CAL باللثة — perioCalcCal   ·   C) الترقيم الذرّي — next_patient_seq
 *
 * الاستخدام: node scripts/check-critical-logic.js   (من جذر الريبو)
 * الخروج: 0 = كل الاختبارات خضر · 1 = فشل واحد على الأقل
 * =================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = v => JSON.stringify(v);

let failures = 0;
const ok  = m => console.log('  ✓ ' + m);
const bad = m => { failures++; console.log('  ✗ ' + m); };

/* ── استخراج دالة باسمها بموازنة الأقواس (منقول حرفياً من check-mirrors.js) ── */
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

/* ── تجميع الدوال المستخرَجة في صندوق vm معزول وإرجاعها كـcallables ── */
function compileFns(src, names, extra) {
  const code = names.map(n => extractFunction(src, n)).join('\n');
  const sandbox = Object.assign({}, extra || {});   /* M125: حقن سياق اختياري (مثل currentUser لنسخة الإعدادات) */
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__x = { ' + names.map(n => n + ': ' + n).join(', ') + ' };', sandbox);
  return sandbox.__x;
}

/* ═══════════════════════════════════════════════════════════════════
 * A) FIFO / توزيع الدفعات
 * =================================================================== */
console.log('A) FIFO / توزيع الدفعات — buildFifoSplits ⇔ _apptBuildFifoSplits:');

const fifo = compileFns(read('patient-profile.html'), ['_rowCur', '_minorFactor', 'toMinor', 'fromMinor', 'buildFifoSplits']).buildFifoSplits;
const fifoAppt = compileFns(read('appointments.html'), ['_rowCur', '_minorFactor', 'toMinor', 'fromMinor', '_apptBuildFifoSplits'])._apptBuildFifoSplits;
/* M125: النسخة الثالثة (أداة الصيانة بالإعدادات) كانت خارج الحراسة — تنضم الآن،
 * فأي انحراف بأي متجه (أساسي أو مخلوط) يكسر البوابة. doctor_id فيها يسقط على
 * currentUser عند غيابه — نحقنه بقيمة المتجهات 'DOC' فتتطابق المخرجات حرفياً. */
const fifoStg = (function(){
  const f = compileFns(read('settings.html'), ['_rowCur', '_minorFactor', 'toMinor', 'fromMinor', '_backfillBuildFifo'], { currentUser: { id: 'DOC' } });
  return f._backfillBuildFifo;
})();

/* بنّاؤون مختصرون للمدخلات */
function mkPay(amount, extra) {
  return Object.assign({ id: 'PAY', amount: amount, doctor_id: 'DOC', patient_id: 'PT', date: '2026-01-10' }, extra || {});
}
function mkSess(id, cost, opts) {
  return Object.assign({
    id: id, cost: cost, status: 'completed',
    date: '2026-01-01', created_at: '2026-01-01T10:00:00', provider_id: null
  }, opts || {});
}
const sum = arr => arr.reduce((a, s) => a + (s.amount || 0), 0);
const earned = arr => arr.filter(s => s.is_unearned === false);
const unearnedOf = arr => arr.filter(s => s.is_unearned === true);
const bySess = (arr, sid) => arr.filter(s => s.session_id === sid);

/* المتجهات — [اسم، دفعة، جلسات، existingSplits، مؤكِّد على المخرج out] */
const VECTORS = [
  ['V1 تخصيص دقيق (دفعة = كلفة جلسة واحدة)',
    mkPay(100), [mkSess('S1', 100, { provider_id: 'PR1' })], [],
    out => {
      if (out.length !== 1) return 'expected 1 split, got ' + out.length;
      const s = out[0];
      if (s.amount !== 100) return 'amount ' + s.amount + ' ≠ 100';
      if (s.session_id !== 'S1') return 'session_id ' + s.session_id + ' ≠ S1';
      if (s.is_unearned !== false) return 'is_unearned should be false';
      if (s.provider_id !== 'PR1') return 'provider_id ' + s.provider_id + ' ≠ PR1';
      if (s.payment_id !== 'PAY' || s.patient_id !== 'PT' || s.doctor_id !== 'DOC') return 'ownership fields wrong';
      if (s.payment_date !== '2026-01-10') return 'payment_date wrong';
      return null;
    }],

  ['V2 فائض → صف unearned (session/provider = null)',
    mkPay(150), [mkSess('S1', 100)], [],
    out => {
      if (out.length !== 2) return 'expected 2 splits, got ' + out.length;
      const e = earned(out), u = unearnedOf(out);
      if (e.length !== 1 || e[0].amount !== 100) return 'earned split should be 100';
      if (u.length !== 1 || u[0].amount !== 50) return 'unearned split should be 50';
      if (u[0].session_id !== null || u[0].provider_id !== null) return 'unearned must have null session_id AND provider_id';
      return null;
    }],

  ['V3 FIFO الأقدم أولاً + توقّف بمنتصف الثانية',
    mkPay(120),
    [mkSess('S1', 100, { date: '2026-01-01' }), mkSess('S2', 100, { date: '2026-01-05' })], [],
    out => {
      if (out.length !== 2) return 'expected 2 splits, got ' + out.length;
      if (out[0].session_id !== 'S1' || out[0].amount !== 100) return 'oldest (S1) should be filled first with 100';
      if (out[1].session_id !== 'S2' || out[1].amount !== 20) return 'S2 should get remaining 20';
      if (unearnedOf(out).length !== 0) return 'no unearned expected';
      return null;
    }],

  ['V4 planned مستثنى (المال يبقى unearned)',
    mkPay(100), [mkSess('S1', 100, { status: 'planned' })], [],
    out => {
      if (bySess(out, 'S1').length !== 0) return 'planned session must never receive a split';
      if (out.length !== 1 || out[0].is_unearned !== true) return 'all money should be one unearned split';
      if (out[0].amount !== 100 || out[0].session_id !== null) return 'unearned should be 100 with null session_id';
      return null;
    }],

  ['V5 دفعة ≤ صفر → []',
    mkPay(0), [mkSess('S1', 100)], [],
    out => (out.length === 0 ? null : 'zero payment must return []')],

  ['V5b دفعة سالبة → []',
    mkPay(-50), [mkSess('S1', 100)], [],
    out => (out.length === 0 ? null : 'negative payment must return []')],

  ['V6 جلسة كلفتها صفر → مستثناة',
    mkPay(100), [mkSess('S1', 0)], [],
    out => {
      if (bySess(out, 'S1').length !== 0) return 'zero-cost session must be excluded';
      if (out.length !== 1 || out[0].is_unearned !== true || out[0].amount !== 100) return 'money should become unearned 100';
      return null;
    }],

  ['V7 جلسة مدفوعة بالكامل → متخطّاة، التخصيص يمشي للتالية',
    mkPay(100),
    [mkSess('S1', 100, { date: '2026-01-01' }), mkSess('S2', 100, { date: '2026-01-05' })],
    [{ session_id: 'S1', amount: 100 }],
    out => {
      if (bySess(out, 'S1').length !== 0) return 'fully-paid S1 must be skipped';
      if (out.length !== 1 || out[0].session_id !== 'S2' || out[0].amount !== 100) return 'S2 should receive 100';
      return null;
    }],

  ['V8 existing جزئي → يُخصَّص المتبقي فقط',
    mkPay(100), [mkSess('S1', 100)], [{ session_id: 'S1', amount: 30 }],
    out => {
      const e = earned(out), u = unearnedOf(out);
      if (e.length !== 1 || e[0].session_id !== 'S1' || e[0].amount !== 70) return 'S1 remaining 70 should be allocated';
      if (u.length !== 1 || u[0].amount !== 30) return 'leftover 30 should be unearned';
      return null;
    }],

  ['V9 حفظ القيمة بسيناريو مختلط (planned + عدة جلسات)',
    mkPay(250),
    [mkSess('S1', 80, { date: '2026-01-01' }),
     mkSess('S2', 90, { date: '2026-01-02' }),
     mkSess('S3', 100, { status: 'planned', date: '2026-01-03' })], [],
    out => {
      if (bySess(out, 'S3').length !== 0) return 'planned S3 excluded';
      const e = earned(out);
      if (sum(e) !== 170) return 'earned should total 80+90=170, got ' + sum(e);
      const u = unearnedOf(out);
      if (u.length !== 1 || u[0].amount !== 80) return 'remainder 80 should be unearned';
      return null; /* الثابت Σ=round(payment) يُفحص عمومياً أدناه */
    }],

  ['V10 الحساب الصحيح (round-on-entry + round كل كلفة، صفر float drift)',
    mkPay(100.6),
    [mkSess('S1', 50.4, { date: '2026-01-01' }), mkSess('S2', 50.4, { date: '2026-01-02' })], [],
    out => {
      for (const s of out) if (!Number.isInteger(s.amount)) return 'amounts must be integers, got ' + s.amount;
      if (out[0].amount !== 50 || out[1].amount !== 50) return 'each cost 50.4 rounds to 50';
      const u = unearnedOf(out);
      if (u.length !== 1 || u[0].amount !== 1) return 'payment 100.6→101, minus 50+50 = 1 unearned';
      return null;
    }],

  ['V11 created_at tiebreak (نفس التاريخ، الأقدم إنشاءً أولاً رغم ترتيب المصفوفة)',
    mkPay(100),
    [mkSess('S_late', 100, { date: '2026-01-01', created_at: '2026-01-01T12:00:00' }),
     mkSess('S_early', 100, { date: '2026-01-01', created_at: '2026-01-01T09:00:00' })], [],
    out => (out[0] && out[0].session_id === 'S_early' ? null : 'earlier created_at (S_early) must be filled first')],

  ['V12 id tiebreak (نفس التاريخ + created_at)',
    mkPay(100),
    [mkSess('SB', 100), mkSess('SA', 100)], [],
    out => (out[0] && out[0].session_id === 'SA' ? null : "lower id ('SA') must be filled first")],

  ['V13 provider_id: earned يحمل sess.provider_id، unearned يحمل null',
    mkPay(150), [mkSess('S1', 100, { provider_id: 'PR9' })], [],
    out => {
      const e = earned(out), u = unearnedOf(out);
      if (!e.length || e[0].provider_id !== 'PR9') return 'earned split must carry provider_id PR9';
      if (!u.length || u[0].provider_id !== null) return 'unearned split must carry null provider_id';
      return null;
    }],

  ['V14 legacy status "" مؤهّل لكن يُرتَّب بعد "completed" الصريحة',
    mkPay(100),
    [mkSess('S_legacy', 100, { status: '', date: '2026-01-01' }),   /* أقدم تاريخاً */
     mkSess('S_done', 100, { status: 'completed', date: '2026-01-05' })], [], /* أحدث لكن completed */
    out => (out[0] && out[0].session_id === 'S_done'
      ? null
      : 'completed-bucket must sort before legacy "" even when newer — got ' + (out[0] && out[0].session_id))],
];

for (const [name, payment, sessions, existing, assertFn] of VECTORS) {
  try {
    const outC = fifo(payment, sessions, existing);       /* الكانوني */
    const outA = fifoAppt(payment, sessions, existing);    /* المرآة   */

    /* (1) قفل المرآة — النسخ الثلاث متطابقة حرفياً */
    if (J(outC) !== J(outA)) { bad(name + '  [المرآة انحرفت: الكانوني ≠ المواعيد]'); continue; }
    const outS = fifoStg(payment, sessions, existing);
    if (J(outC) !== J(outS)) { bad(name + '  [المرآة انحرفت: الكانوني ≠ الإعدادات]'); continue; }

    /* (2) الثابت الجوهري — Σ الـsplits = round(الدفعة) (صفر مال يُخلَق/يضيع) */
    const expectedSum = Math.max(0, Math.round(parseFloat(payment.amount) || 0));
    if (sum(outC) !== expectedSum) { bad(name + '  [حفظ القيمة انكسر: Σ=' + sum(outC) + ' ≠ ' + expectedSum + ']'); continue; }

    /* (3) خصائص المتجه */
    const err = assertFn(outC);
    if (err) { bad(name + '  [' + err + ']'); continue; }

    ok(name);
  } catch (e) {
    bad(name + '  [استثناء: ' + (e && e.message) + ']');
  }
}


/* ── A-M125: متجهات قسمة العملة بـFIFO (دائمة) ─────────────────────────
 * العقد: الدفعة توزَّع على جلسات عملتها حصراً، والحساب بالوحدة الصغرى
 * فسنتات الدولار تُحفَظ بالسنت، وكل صف split يحمل عملة دفعته صراحةً.
 * متجهات الحلقة أعلاه (بلا عمود عملة → طيّ ل.س) تثبت صفر الانحدار؛ هذا
 * البلوك يثبت السلوك المخلوط، بقفل مرآة على كل متجه. */
console.log('A-M125) قسمة العملة بـFIFO — عزل العملة + سنتات الدولار:');
{
  const mixVectors = [
    ['MX1 دفعة $ بسنتات تُحفَظ بالسنت (49.99 لا 50)',
      mkPay(49.99, { currency: 'USD' }),
      [mkSess('U1', 49.99, { currency: 'USD' })], [],
      out => {
        if (out.length !== 1) return 'expected 1 split, got ' + out.length;
        if (out[0].amount !== 49.99) return 'cents destroyed: ' + out[0].amount;
        if (out[0].currency !== 'USD') return 'split must carry USD';
        return null;
      }],
    ['MX2 دفعة $ لا تلمس جلسات الليرة — كلها unearned بعملتها',
      mkPay(75, { currency: 'USD' }),
      [mkSess('S1', 100000), mkSess('S2', 50000)], [],
      out => {
        if (out.length !== 1) return 'expected 1 unearned split, got ' + out.length;
        if (!out[0].is_unearned || out[0].amount !== 75) return 'must be unearned 75';
        if (out[0].currency !== 'USD') return 'unearned must carry USD';
        return null;
      }],
    ['MX3 مخلوط: دفعة ليرة تملأ جلسة الليرة وتتجاهل الدولار',
      mkPay(60000),
      [mkSess('U1', 200, { currency: 'USD', date: '2026-01-01' }),
       mkSess('S1', 100000, { date: '2026-01-05' })], [],
      out => {
        if (out.length !== 1) return 'expected 1 split, got ' + out.length;
        if (out[0].session_id !== 'S1' || out[0].amount !== 60000) return 'must fill SYP session only';
        if (out[0].currency !== 'SYP') return 'split must carry SYP';
        return null;
      }],
    ['MX4 سنتات جزئية: 10.5$ على جلسة 20.25$ → split 10.5 بالضبط',
      mkPay(10.5, { currency: 'USD' }),
      [mkSess('U1', 20.25, { currency: 'USD' })], [],
      out => (out.length === 1 && out[0].amount === 10.5 && !out[0].is_unearned)
        ? null : 'partial cents allocation broken']
  ];
  for (const [name, payment, sessions, existing, assertFn] of mixVectors) {
    try {
      const outC = fifo(payment, sessions, existing);
      const outA = fifoAppt(payment, sessions, existing);
      if (J(outC) !== J(outA)) { bad(name + '  [المرآة انحرفت]'); continue; }
      const outS = fifoStg(payment, sessions, existing);
      if (J(outC) !== J(outS)) { bad(name + '  [مرآة الإعدادات انحرفت]'); continue; }
      /* حفظ القيمة بعملة الدفعة على الوحدة الصغرى (سنتات $) */
      const factor = (payment.currency === 'USD') ? 100 : 1;
      const expMinor = Math.max(0, Math.round((parseFloat(payment.amount) || 0) * factor));
      const gotMinor = Math.round(outC.reduce((a, sp) => a + sp.amount * factor, 0));
      if (gotMinor !== expMinor) { bad(name + '  [حفظ القيمة بالوحدة الصغرى انكسر: ' + gotMinor + ' ≠ ' + expMinor + ']'); continue; }
      const err = assertFn(outC);
      if (err) { bad(name + '  [' + err + ']'); continue; }
      ok(name);
    } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * B) CAL باللثة — perioCalcCal (الحساب المشتق) + perioCalPaint (التصنيف)
 *    CAL = عمق الجيب + الانحسار (انحسار فارغ = 0 · لا عمق → لا CAL).
 *    تصنيف بصري يعتمد عليه الطبيب: v≥5 خطر · v≥3 تحذير · لا شيء دونها.
 *    الدالتان معتمدتان على DOM → نبني shim خفيف بلا تبعيات (stub لـ
 *    querySelector مطابق حرفياً للسيلكتور الذي تبنيه الدالة — يقفل عقد
 *    data-attributes كمان)، ونشغّل الدالة الحية داخل vm.
 * =================================================================== */
console.log('B) CAL باللثة — perioCalcCal + تصنيف perioCalPaint:');

const ppSrc = read('patient-profile.html');
const ppModSrc = read('pp-modules.js');   /* موطن perio بعد التفكيك (استخراج ٥) */
const perioSrc = extractFunction(ppModSrc, 'perioCalcCal') + '\n' + extractFunction(ppModSrc, 'perioCalPaint');

/* السيلكتورات كما تبنيها الدالة بالضبط (سن 18، موقع mb) — أي تغيير بعقد
   data-f/data-s سيكسر المطابقة فيسقط الاختبار (قفل ضمني للعقد). */
const T = '18', S = 'mb';
const selPd   = 'input[data-t="' + T + '"][data-f="pd_'  + S + '"]';
const selRec  = 'input[data-t="' + T + '"][data-f="rec_' + S + '"]';
const selCell = '.cal-cell[data-t="' + T + '"][data-s="' + S + '"]';

function makeCell() {
  const set = new Set();
  let text = '';
  return {
    get textContent()  { return text; },
    set textContent(v) { text = String(v); },   /* الـDOM يحوّل القيمة لـstring دائماً */
    classList: {
      add(...cs)    { cs.forEach(c => set.add(c)); },
      remove(...cs) { cs.forEach(c => set.delete(c)); },
      contains(c)   { return set.has(c); }
    }
  };
}
function makeDoc(inputs, cell) {
  const panel = {
    querySelector(sel) {
      if (cell && sel === selCell) return cell;
      return Object.prototype.hasOwnProperty.call(inputs, sel) ? inputs[sel] : null;
    }
  };
  return { getElementById(id) { return id === 'tab-perio' ? panel : null; } };
}
function evalPerio(doc) {
  const sandbox = { document: doc };
  vm.createContext(sandbox);
  vm.runInContext(perioSrc + '\nthis.__x = { cal: perioCalcCal, paint: perioCalPaint };', sandbox);
  return sandbox.__x;
}

/* الحساب المشتق — [اسم، inputs، CAL المتوقع] */
const CAL_VECTORS = [
  ['C1 PD=3 REC=2 → CAL 5', { [selPd]: { value: '3' }, [selRec]: { value: '2' } }, 5],
  ['C2 PD=4 REC فارغ → 4 (انحسار فارغ = 0)', { [selPd]: { value: '4' }, [selRec]: { value: '' } }, 4],
  ['C3 PD=4 بلا حقل REC → 4 (غياب الانحسار = 0)', { [selPd]: { value: '4' } }, 4],
  ['C4 PD فارغ → null (لا عمق = لا CAL، مهما كان الانحسار)', { [selPd]: { value: '' }, [selRec]: { value: '2' } }, null],
  ['C5 بلا حقل PD → null', { [selRec]: { value: '2' } }, null],
  ['C6 PD=0 REC=0 → CAL 0 (صفر قراءة صحيحة ≠ لا قراءة)', { [selPd]: { value: '0' }, [selRec]: { value: '0' } }, 0],
  ['C7 PD=5 REC=3 → CAL 8', { [selPd]: { value: '5' }, [selRec]: { value: '3' } }, 8],
];
for (const [name, inputs, expected] of CAL_VECTORS) {
  try {
    const got = evalPerio(makeDoc(inputs, null)).cal(T, S);
    if (got === expected) ok(name);
    else bad(name + '  [CAL=' + J(got) + ' ≠ ' + J(expected) + ']');
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* التصنيف البصري — [اسم، inputs، النص المتوقع، الصنف المتوقع (null=بلا صنف)] */
const PAINT_VECTORS = [
  ['P1 CAL null → "–" بلا صنف', { [selPd]: { value: '' } }, '–', null],
  ['P2 CAL 2 → "2" بلا صنف (تحت 3)', { [selPd]: { value: '2' }, [selRec]: { value: '0' } }, '2', null],
  ['P3 CAL 3 → "3" cal-warn (عتبة التحذير)', { [selPd]: { value: '3' }, [selRec]: { value: '0' } }, '3', 'cal-warn'],
  ['P4 CAL 4 → "4" cal-warn (<5)', { [selPd]: { value: '4' }, [selRec]: { value: '0' } }, '4', 'cal-warn'],
  ['P5 CAL 5 → "5" cal-danger فقط (عتبة الخطر، بلا warn)', { [selPd]: { value: '3' }, [selRec]: { value: '2' } }, '5', 'cal-danger'],
  ['P6 CAL 8 → "8" cal-danger', { [selPd]: { value: '5' }, [selRec]: { value: '3' } }, '8', 'cal-danger'],
  ['P7 CAL 0 → "0" بلا صنف (0 يُعرض لا "–")', { [selPd]: { value: '0' }, [selRec]: { value: '0' } }, '0', null],
];
for (const [name, inputs, expText, expClass] of PAINT_VECTORS) {
  try {
    const cell = makeCell();
    evalPerio(makeDoc(inputs, cell)).paint(T, S);
    if (cell.textContent !== expText) { bad(name + '  [النص=' + J(cell.textContent) + ' ≠ ' + J(expText) + ']'); continue; }
    const w = cell.classList.contains('cal-warn'), d = cell.classList.contains('cal-danger');
    if (expClass === 'cal-warn'   && !(w && !d)) { bad(name + '  [توقّعت cal-warn فقط · warn=' + w + ' danger=' + d + ']'); continue; }
    if (expClass === 'cal-danger' && !(d && !w)) { bad(name + '  [توقّعت cal-danger فقط · warn=' + w + ' danger=' + d + ']'); continue; }
    if (expClass === null && (w || d))           { bad(name + '  [توقّعت بلا صنف · warn=' + w + ' danger=' + d + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * C) قاعدة المكتسب — splitIsEarned
 *    المرآة الكانونية للاعتراف بالإيراد: مقسوم "مكتسب" ⟺ (ليس unearned)
 *    و(له session_id) و(جلسته completed). مرآة بين provider-reports.html
 *    و accounting.html — انحرافها يجعل تقارير الأطباء والمحاسبة يختلفان
 *    على الإيراد المكتسب. الدالة تقرأ splitSessionStatus من نطاقها → نحقنه.
 * =================================================================== */
console.log('C) قاعدة المكتسب — splitIsEarned (مرآة provider-reports ⇔ accounting):');

const earnedSrcPR = extractFunction(read('provider-reports.html'), 'splitIsEarned');
const earnedSrcAC = extractFunction(read('accounting.html'), 'splitIsEarned');

/* قفل المصدر — النسختان متطابقتان (تجاهل المسافات؛ لا تعليقات داخل الجسم) */
const normWs = s => s.replace(/\s+/g, ' ').trim();
if (normWs(earnedSrcPR) === normWs(earnedSrcAC)) ok('قفل المصدر: النسختان متطابقتان');
else bad('قفل المصدر: النسختان انحرفتا (provider-reports ≠ accounting)');

function runEarned(src, sp, statusMap) {
  const sandbox = { splitSessionStatus: statusMap };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__f = splitIsEarned;', sandbox);
  return sandbox.__f(sp);
}

/* [اسم، خريطة حالة الجلسات، المقسوم sp، المتوقع] — يُشغَّل على النسختين */
const EARNED_VECTORS = [
  ['E1 مكتسب (ليس unearned + session_id + الجلسة completed) → true',
    { S1: 'completed' }, { is_unearned: false, session_id: 'S1' }, true],
  ['E2 unearned → false (يقصّر مهما كان session_id/الحالة)',
    { S1: 'completed' }, { is_unearned: true, session_id: 'S1' }, false],
  ['E3 sp = null → false',
    {}, null, false],
  ['E4 الجلسة غير completed (planned) → false',
    { S1: 'planned' }, { is_unearned: false, session_id: 'S1' }, false],
  ['E5 session_id غير موجود بالخريطة (الحالة undefined) → false',
    {}, { is_unearned: false, session_id: 'S_unknown' }, false],
  ['E6 بلا session_id (null) وليس unearned → false',
    {}, { is_unearned: false, session_id: null }, false],
  ['E7 session_id فارغ "" → false (حتى لو الخريطة فيها مفتاح "" completed)',
    { '': 'completed' }, { is_unearned: false, session_id: '' }, false],
  ['E8 حقول غائبة (is_unearned + session_id = undefined) → false',
    {}, {}, false],
];
for (const [name, statusMap, sp, expected] of EARNED_VECTORS) {
  try {
    const rPR = runEarned(earnedSrcPR, sp, statusMap);
    const rAC = runEarned(earnedSrcAC, sp, statusMap);
    if (rPR !== rAC) { bad(name + '  [المرآة انحرفت: provider-reports=' + J(rPR) + ' accounting=' + J(rAC) + ']'); continue; }
    if (rPR !== expected) { bad(name + '  [النتيجة=' + J(rPR) + ' ≠ ' + J(expected) + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * D) الملخّص المالي — computeFinancials (رصيد المريض + شلال الاسترداد)
 *    الدالة الكانونية للرصيد المعروض بملف المريض. تقرأ 4 globals
 *    (sessions/payments/paymentSplits/adjustments) → نحقنها بالصندوق.
 *    تقفل: تقسيم مكتمل/planned · قاعدة "split على planned = رصيد لا إنتاج"
 *    · legacy بلا splits (allocated=paid) · خصم/شطب يخفّض الرسم · وشلال
 *    الاسترداد (يأكل الرصيد أولاً، والفائض يعيد فتح المتبقّي عبر
 *    refundFromEarned) → trueBalance = netCompleted − allocated + refundFromEarned.
 *    ملاحظة: patients.html يعيد تطبيق نفس الصيغة بشكل batch مختلف بنيوياً
 *    (مرآة-بالصيغة لا byte-identical) → مرشّح لهارنس تكافؤ منفصل لاحقاً.
 * =================================================================== */
console.log('D) الملخّص المالي — computeFinancials (رصيد + شلال استرداد):');

const finSrc = ['_rowCur', '_epsFor', 'computeFinancials'].map(n => extractFunction(ppSrc, n)).join('\n');   /* ppSrc مُعرّف ببلوك B — M125: المساعدات تُستخرج مع الصيغة */
function runFin(sc) {
  const sandbox = {
    sessions: sc.sessions || [], payments: sc.payments || [],
    paymentSplits: sc.splits || [], adjustments: sc.adjustments || []
  };
  vm.createContext(sandbox);
  vm.runInContext(finSrc + '\nthis.__f = computeFinancials();', sandbox);
  return sandbox.__f;
}
const eqN = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.001;
function expectFields(f, obj) {
  for (const k in obj) if (!eqN(f[k], obj[k])) return k + '=' + J(f[k]) + ' ≠ ' + J(obj[k]);
  return null;
}
/* بنّاؤون مختصرون (أسماء لا تصطدم بالبلوكات السابقة) */
const mkS   = (id, cost, status) => ({ id: id, cost: cost, status: status || 'completed' });
const mkP   = amt => ({ amount: amt });
const mkSP  = (session_id, amount, unearned) => ({ session_id: session_id, amount: amount, is_unearned: !!unearned });
const mkAdj = (kind, amount) => ({ kind: kind, amount: amount });

/* [اسم، سيناريو {sessions,payments,splits,adjustments}، الحقول المتوقعة] */
const FIN_VECTORS = [
  ['D1 مكتمل مدفوع بالكامل (split earned) → trueBalance 0',
    { sessions: [mkS('S1', 100)], payments: [mkP(100)], splits: [mkSP('S1', 100, false)] },
    { trueBalance: 0, allocatedToProduction: 100, unearnedCredit: 0, completedTotal: 100, netCompleted: 100 }],

  ['D2 planned مستثنى من completedTotal',
    { sessions: [mkS('S1', 100), mkS('S2', 50, 'planned')], payments: [mkP(100)], splits: [mkSP('S1', 100, false)] },
    { completedTotal: 100, plannedTotal: 50, total: 150, allocatedToProduction: 100, trueBalance: 0 }],

  ['D3 فائض → رصيد unearned (split unearned)',
    { sessions: [mkS('S1', 100)], payments: [mkP(150)], splits: [mkSP('S1', 100, false), mkSP(null, 50, true)] },
    { allocatedToProduction: 100, unearnedCredit: 50, trueBalance: 0, paid: 150 }],

  ['D4 split ليس-unearned لكن على جلسة planned → رصيد لا إنتاج (قاعدة self-heal)',
    { sessions: [mkS('S1', 100, 'planned')], payments: [mkP(100)], splits: [mkSP('S1', 100, false)] },
    { completedTotal: 0, plannedTotal: 100, allocatedToProduction: 0, unearnedCredit: 100, trueBalance: 0 }],

  ['D5 legacy بلا splits → allocated = paid',
    { sessions: [mkS('S1', 100)], payments: [mkP(80)], splits: [] },
    { allocatedToProduction: 80, unearnedCredit: 0, trueBalance: 20, completedTotal: 100 }],

  ['D6 خصم يخفّض الرسم',
    { sessions: [mkS('S1', 100)], payments: [mkP(0)], splits: [], adjustments: [mkAdj('discount', 30)] },
    { chargeReductions: 30, netCompleted: 70, trueBalance: 70, allocatedToProduction: 0 }],

  ['D7 شطب (write_off) يخفّض الرسم مثل الخصم',
    { sessions: [mkS('S1', 100)], payments: [mkP(0)], splits: [], adjustments: [mkAdj('write_off', 100)] },
    { chargeReductions: 100, netCompleted: 0, trueBalance: 0 }],

  ['D8 شلال الاسترداد: يأكل الرصيد أولاً (لا يعيد فتح المتبقّي)',
    { sessions: [mkS('S1', 100)], payments: [mkP(150)], splits: [mkSP('S1', 100, false), mkSP(null, 50, true)], adjustments: [mkAdj('refund', 30)] },
    { unearnedCredit: 20, trueBalance: 0, refundsTotal: 30, allocatedToProduction: 100 }],

  ['D9 شلال الاسترداد: الفائض على الرصيد يعيد فتح المتبقّي (refundFromEarned)',
    { sessions: [mkS('S1', 100)], payments: [mkP(150)], splits: [mkSP('S1', 100, false), mkSP(null, 50, true)], adjustments: [mkAdj('refund', 80)] },
    { unearnedCredit: 0, trueBalance: 30, refundsTotal: 80 }],

  ['D10 مركّب (خصم + استرداد + planned + unearned) → trueBalance −10',
    { sessions: [mkS('S1', 200), mkS('S2', 100, 'planned')], payments: [mkP(250)],
      splits: [mkSP('S1', 200, false), mkSP(null, 50, true)],
      adjustments: [mkAdj('discount', 20), mkAdj('refund', 60)] },
    { completedTotal: 200, plannedTotal: 100, total: 300, allocatedToProduction: 200, unearnedCredit: 0,
      chargeReductions: 20, refundsTotal: 60, netCompleted: 180, trueBalance: -10 }],
];
for (const [name, sc, expected] of FIN_VECTORS) {
  try {
    const f = runFin(sc);
    /* ثوابت عامة لكل متجه */
    if (!eqN(f.total, f.completedTotal + f.plannedTotal)) { bad(name + '  [الثابت: total ≠ completed+planned]'); continue; }
    if (!eqN(f.netCompleted, f.completedTotal - f.chargeReductions)) { bad(name + '  [الثابت: netCompleted ≠ completedTotal−chargeReductions]'); continue; }
    /* الحقول المتوقعة */
    const err = expectFields(f, expected);
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * E) محرّر التقسيم اليدوي — recalcSplitTotals
 *    الحساب الحيّ عند تعديل توزيع دفعة يدوياً. يقرأ _splitEditing
 *    (paymentAmt + rows) ويكتب DOM (+fmt) → نبني shim ونقرأ الأثر.
 *    يقفل: (1) الحارس الأهم — منع الحفظ إذا تجاوز التوزيع الدفعة
 *    (saveBtn.disabled = remaining<0، أي لا يُخلَق مال من العدم)؛
 *    (2) تصنيف الفائض: coversCompleted=min(leftover,owedCompleted) و
 *    truePrepay=leftover−coversCompleted (planned مستثنى من owedCompleted)؛
 *    (3) علم تجاوز الصف: currentInput > max(sessionCost−alreadyPaidByOthers,0).
 * =================================================================== */
console.log('E) محرّر التقسيم اليدوي — recalcSplitTotals (منع تجاوز الدفعة + تصنيف الفائض):');

const splitSrc = ['_minorFactor', 'fromMinor', '_curLblOf', '_splitEdLbl', 'recalcSplitTotals'].map(n => extractFunction(ppSrc, n)).join('\n');   // v261: _splitEdLbl تشتق الوسم من _curLblOf

function makeElE() {
  const set = new Set();
  let text = '', html = '', disabled = false;
  return {
    classList: { add(...c) { c.forEach(x => set.add(x)); }, remove(...c) { c.forEach(x => set.delete(x)); }, contains(x) { return set.has(x); } },
    get textContent() { return text; }, set textContent(v) { text = String(v); },
    get innerHTML() { return html; }, set innerHTML(v) { html = String(v); },
    get disabled() { return disabled; }, set disabled(v) { disabled = v; }
  };
}
function runSplit(sc) {
  const els = {};
  for (let i = 0; i < sc.rows.length; i++) els['splitInput_' + i] = makeElE();
  els.splitEditorSummary = makeElE();
  els.splitEditorWarn = makeElE();
  els.splitSaveBtn = makeElE();
  const sandbox = {
    document: { getElementById(id) { return els[id] || null; } },
    fmt: x => String(x),
    // Migration 107: محرّر التقسيم صار يستدعي curLbl() لرمز العملة. الرمز
    // طبقة عرض بحتة ولا يدخل أي حساب، فنثبّته هنا كي تبقى مراسي الإيموجي
    // في الملخّص قابلة للقراءة تماماً كما كانت قبل الميزة.
    curLbl: () => 'ل.س',
    _splitEditing: { paymentAmt: sc.paymentAmt, rows: sc.rows }
  };
  vm.createContext(sandbox);
  vm.runInContext(splitSrc + '\nrecalcSplitTotals();', sandbox);
  return els;
}
/* استخراج رقم من ملخّص الـinnerHTML عبر مرساة الإيموجي (fmt مُبدَّل لرقم خام) */
const numAfter = (html, emoji, cls) => {
  const m = html.match(new RegExp(emoji + '[^<]*<\\/span><span class="val ' + cls + '">(\\d+)'));
  return m ? parseInt(m[1], 10) : 0;
};
const overCls  = (els, i) => els['splitInput_' + i].classList.contains('over');
const allocOf  = els => numAfter(els.splitEditorSummary.innerHTML, '📊', 'green');
const coversOf = els => numAfter(els.splitEditorSummary.innerHTML, '💼', 'green');
const prepayOf = els => numAfter(els.splitEditorSummary.innerHTML, '💳', 'blue');

const mkRow = (currentInput, sessionCost, alreadyPaidByOthers, sessionStatus) =>
  ({ currentInput: currentInput, sessionCost: sessionCost, alreadyPaidByOthers: alreadyPaidByOthers, sessionStatus: sessionStatus || 'completed' });

/* [اسم، سيناريو {paymentAmt, rows}، مؤكِّد(els)] */
const SPLIT_VECTORS = [
  ['G1 نقص التوزيع → حفظ مُتاح + الفائض يغطّي منجَزاً',
    { paymentAmt: 100, rows: [mkRow(60, 100, 0, 'completed')] },
    els => {
      if (els.splitSaveBtn.disabled) return 'يجب أن يكون الحفظ مُتاحاً';
      if (overCls(els, 0)) return 'الصف ضمن الحد — لا "over"';
      if (allocOf(els) !== 60) return 'allocated=' + allocOf(els) + ' ≠ 60';
      if (coversOf(els) !== 40) return 'coversCompleted=' + coversOf(els) + ' ≠ 40';
      if (prepayOf(els) !== 0) return 'truePrepay=' + prepayOf(els) + ' ≠ 0';
      return null;
    }],

  ['G2 تخصيص تام → حفظ مُتاح + لا فائض',
    { paymentAmt: 100, rows: [mkRow(100, 100, 0, 'completed')] },
    els => {
      if (els.splitSaveBtn.disabled) return 'يجب أن يكون الحفظ مُتاحاً';
      if (overCls(els, 0)) return 'لا "over" عند المساواة (المقارنة صارمة >)';
      if (allocOf(els) !== 100) return 'allocated=' + allocOf(els) + ' ≠ 100';
      if (coversOf(els) !== 0 || prepayOf(els) !== 0) return 'لا فائض متوقّع';
      return null;
    }],

  ['G3 ⭐ تجاوز الدفعة → الحفظ مُعطَّل (الحارس الأهم — لا مال من العدم)',
    { paymentAmt: 100, rows: [mkRow(120, 200, 0, 'completed')] },
    els => (els.splitSaveBtn.disabled ? null : 'التوزيع (120) يتجاوز الدفعة (100) → يجب تعطيل الحفظ')],

  ['G4 الصف يتجاوز متبقّيه → علم "over" (غير حاجب)',
    { paymentAmt: 200, rows: [mkRow(150, 100, 0, 'completed')] },
    els => {
      if (!overCls(els, 0)) return 'currentInput 150 > حد 100 → متوقّع "over"';
      if (els.splitSaveBtn.disabled) return 'تجاوز الصف غير حاجب — الحفظ يبقى مُتاحاً';
      return null;
    }],

  ['G5 alreadyPaidByOthers يخفّض حد الصف',
    { paymentAmt: 200, rows: [mkRow(60, 100, 50, 'completed')] },
    els => {
      if (!overCls(els, 0)) return 'الحد = max(100−50,0)=50؛ 60>50 → متوقّع "over"';
      if (els.splitSaveBtn.disabled) return 'غير حاجب';
      return null;
    }],

  ['G6 فائض يتجاوز المنجَز المستحقّ → truePrepay',
    { paymentAmt: 200, rows: [mkRow(50, 100, 0, 'completed')] },
    els => {
      if (coversOf(els) !== 50) return 'coversCompleted=min(150,50)=50، حصلنا ' + coversOf(els);
      if (prepayOf(els) !== 100) return 'truePrepay=150−50=100، حصلنا ' + prepayOf(els);
      if (els.splitSaveBtn.disabled) return 'الحفظ مُتاح';
      return null;
    }],

  ['G7 صف planned مستثنى من المنجَز المستحقّ (الفائض كله رصيد مقدّم)',
    { paymentAmt: 200, rows: [mkRow(0, 100, 0, 'planned')] },
    els => {
      if (coversOf(els) !== 0) return 'planned لا يُحتسب مستحقاً → coversCompleted 0، حصلنا ' + coversOf(els);
      if (prepayOf(els) !== 200) return 'كل الفائض 200 رصيد مقدّم، حصلنا ' + prepayOf(els);
      return null;
    }],
];
for (const [name, sc, assertFn] of SPLIT_VECTORS) {
  try {
    const els = runSplit(sc);
    const err = assertFn(els);
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * H) محرّك P&L لصفحة المحاسبة — accounting.html.
 *    computeSummary (إيراد العيادة: splits + de-dup الـlegacy + استبعاد
 *    unearned + الإنتاج + معدّل التحصيل) + computeExpenseTotals +
 *    computeAdjustmentTotals + كتلة هويّة صافي الربح من render() (سطور
 *    حسابية بحتة تُقتَصّ بمرساة نصّية، صفر DOM). حقن globals بالصندوق.
 *    يقفل الرقم الذي يقرّر عليه المالك على مستوى العيادة كلها؛ أخطر فخّ
 *    صامت = de-dup الـlegacy (دفعة إلها splits لا تُعدّ مرتين → تضخّم
 *    الإيراد). splitIsEarned يُستخرَج معها (اعتماد). ثوابت لكل متجه:
 *    revenue=splits+legacy · totalExpenses=exp+pay+labs · adjTotal=charge+refund
 *    · netProfit=(revenue−refunds)−totalExpenses (يربط كتلة render بالمكوّنات).
 * =================================================================== */
console.log('H) محرّك P&L للمحاسبة — computeSummary + مجاميع + هويّة صافي الربح:');

const accSrc = read('accounting.html');
const accEarnedSrc   = extractFunction(accSrc, 'splitIsEarned');
const accSummarySrc  = extractFunction(accSrc, 'computeSummary');
const accExpensesSrc = extractFunction(accSrc, 'computeExpenseTotals');
const accAdjSrc      = extractFunction(accSrc, 'computeAdjustmentTotals');
/* كتلة هويّة صافي الربح داخل render() — اقتصاص بمرساة (سطور حسابية بحتة، صفر DOM) */
function extractNetIdentity(src) {
  const a = src.indexOf('var grossRevenue');
  const end = 'var collectionRate = (netProduction > 0) ? (grossRevenue / netProduction) * 100 : null;';
  const b = src.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error('لم أجد كتلة هويّة صافي الربح في render()');
  return src.slice(a, b + end.length);
}
const accNetFnSrc = 'function __net(summary, totals, adj) {\n' + extractNetIdentity(accSrc)
  + '\n  return { netRevenue: netRevenue, netProduction: netProduction, netProfit: netProfit, profitMargin: profitMargin, collectionRate: collectionRate };\n}';

function runAcc(sc) {
  const sandbox = {
    sessions: sc.sessions || [], payments: sc.payments || [], paymentSplits: sc.splits || [],
    expenses: sc.expenses || [], payouts: sc.payouts || [], labOrders: sc.labs || [],
    adjustments: sc.adjustments || [], splitSessionStatus: sc.sessStatus || {}
  };
  vm.createContext(sandbox);
  vm.runInContext(
    accEarnedSrc + '\n' + accSummarySrc + '\n' + accExpensesSrc + '\n' + accAdjSrc + '\n' + accNetFnSrc
    + '\nthis.__s = computeSummary();'
    + '\nthis.__t = computeExpenseTotals();'
    + '\nthis.__a = computeAdjustmentTotals();'
    + '\nthis.__n = __net(this.__s, this.__t, this.__a);', sandbox);
  return { summary: sandbox.__s, totals: sandbox.__t, adj: sandbox.__a, net: sandbox.__n };
}
function flatAcc(o) {
  const s = o.summary, t = o.totals, a = o.adj, n = o.net;
  return {
    revenue: s.revenue, splitsRevenue: s.splitsRevenue, legacyRevenue: s.legacyRevenue,
    unearnedTotal: s.unearnedTotal, production: s.production, collectionRate: s.collectionRate,
    expensesTotal: t.expensesTotal, payoutsTotal: t.payoutsTotal, labsTotal: t.labsTotal, totalExpenses: t.totalExpenses,
    chargeReductions: a.chargeReductions, refundsTotal: a.refundsTotal, adjTotal: a.adjTotal,
    netRevenue: n.netRevenue, netProduction: n.netProduction, netProfit: n.netProfit
  };
}
function expectAcc(f, obj) {
  for (const k in obj) {
    const exp = obj[k], act = f[k];
    if (exp === null) { if (act !== null) return k + '=' + J(act) + ' ≠ null'; }
    else if (!eqN(act, exp)) return k + '=' + J(act) + ' ≠ ' + J(exp);
  }
  return null;
}
/* بنّاؤون بشكل المحاسبة (payment_id للربط + كلفة للإنتاج) */
const aS   = cost => ({ cost: cost });
const aP   = (id, amount) => ({ id: id, amount: amount });
const aSP  = (payment_id, session_id, amount, unearned) => ({ payment_id: payment_id, session_id: session_id, amount: amount, is_unearned: !!unearned });
const aE   = amount => ({ amount: amount });
const aL   = cost => ({ cost: cost });
const aADJ = (kind, amount) => ({ kind: kind, amount: amount });

/* [اسم، سيناريو، الحقول المتوقعة] */
const ACC_VECTORS = [
  ['H1 split مكتسب + دفعته مستبعدة من legacy',
    { sessions: [aS(100)], payments: [aP('P1', 100)], splits: [aSP('P1', 'S1', 100, false)], sessStatus: { S1: 'completed' } },
    { revenue: 100, splitsRevenue: 100, legacyRevenue: 0, unearnedTotal: 0, production: 100, collectionRate: 100 }],

  ['H2 دفعة legacy (بلا split) تُحتسب إيراداً',
    { sessions: [aS(100)], payments: [aP('P2', 80)], splits: [] },
    { revenue: 80, splitsRevenue: 0, legacyRevenue: 80, production: 100, collectionRate: 80 }],

  ['H3 de-dup: دفعة إلها split لا تُعدّ مرتين (الفخّ الصامت)',
    { sessions: [aS(100)], payments: [aP('P1', 100)], splits: [aSP('P1', 'S1', 100, false)], sessStatus: { S1: 'completed' } },
    { revenue: 100, legacyRevenue: 0 }],

  ['H4 فائض: split unearned مستبعد من الإيراد، يُحتسب unearnedTotal',
    { sessions: [aS(100)], payments: [aP('P3', 150)], splits: [aSP('P3', 'S1', 100, false), aSP('P3', null, 50, true)], sessStatus: { S1: 'completed' } },
    { splitsRevenue: 100, unearnedTotal: 50, legacyRevenue: 0, revenue: 100, production: 100 }],

  ['H5 split على جلسة planned → غير مكتسب → unearnedTotal',
    { sessions: [aS(100)], payments: [aP('P4', 100)], splits: [aSP('P4', 'S9', 100, false)], sessStatus: { S9: 'planned' } },
    { splitsRevenue: 0, unearnedTotal: 100, revenue: 0, production: 100, collectionRate: 0 }],

  ['H6 معدّل التحصيل: إنتاج صفر → null (حارس القسمة)',
    { sessions: [], payments: [aP('P5', 50)], splits: [] },
    { production: 0, revenue: 50, collectionRate: null }],

  ['H7 مصاريف: totalExpenses = مصاريف+رواتب+مخابر',
    { expenses: [aE(100), aE(50)], payouts: [aE(200)], labs: [aL(30), aL(20)] },
    { expensesTotal: 150, payoutsTotal: 200, labsTotal: 50, totalExpenses: 400 }],

  ['H8 تسويات: refund مقابل discount+write_off، amt≤0 يُتجاهَل',
    { adjustments: [aADJ('refund', 60), aADJ('discount', 20), aADJ('write_off', 10), aADJ('refund', -5), aADJ('discount', 0)] },
    { refundsTotal: 60, chargeReductions: 30, adjTotal: 90 }],

  ['H9 هويّة صافي الربح المركّبة (الرقم الذي يراه المالك)',
    { sessions: [aS(200)], payments: [aP('P1', 150)], splits: [aSP('P1', 'S1', 150, false)], sessStatus: { S1: 'completed' },
      expenses: [aE(50)], payouts: [aE(30)], labs: [aL(20)], adjustments: [aADJ('refund', 40), aADJ('discount', 10)] },
    { revenue: 150, production: 200, totalExpenses: 100, refundsTotal: 40, chargeReductions: 10,
      netRevenue: 110, netProduction: 190, netProfit: 10 }],
];
for (const [name, sc, expected] of ACC_VECTORS) {
  try {
    const out = runAcc(sc);
    const f = flatAcc(out);
    /* ثوابت عامة لكل متجه */
    if (!eqN(f.revenue, f.splitsRevenue + f.legacyRevenue)) { bad(name + '  [الثابت: revenue ≠ splits+legacy]'); continue; }
    if (!eqN(f.totalExpenses, f.expensesTotal + f.payoutsTotal + f.labsTotal)) { bad(name + '  [الثابت: totalExpenses ≠ exp+pay+labs]'); continue; }
    if (!eqN(f.adjTotal, f.chargeReductions + f.refundsTotal)) { bad(name + '  [الثابت: adjTotal ≠ charge+refund]'); continue; }
    if (!eqN(f.netProfit, (f.revenue - f.refundsTotal) - f.totalExpenses)) { bad(name + '  [الثابت: netProfit ≠ (revenue−refunds)−totalExpenses]'); continue; }
    /* الحقول المتوقعة */
    const err = expectAcc(f, expected);
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * I) المدفوع على الجلسة — computeSessionPaid (patient-profile.html).
 *    Σ الـsplits المرتبطة بجلسة معيّنة — يغذّي محرّك التوزيع/المحرّر اليدوي
 *    (كم دُفع لهذه الجلسة). نقي: يقرأ paymentSplits + بارامتر sessionId.
 *    يقفل: تجميع فقط الصفوف المطابقة session_id (صفوف جلسات أخرى + الـunearned
 *    ذات session_id=null مستبعدة)، وحارس sessionId فارغ → 0.
 * =================================================================== */
console.log('I) المدفوع على الجلسة — computeSessionPaid:');
const sessPaidSrc = extractFunction(ppSrc, 'computeSessionPaid');   /* ppSrc من بلوك B */
function runSessPaid(splits, sessionId) {
  const sandbox = { paymentSplits: splits };
  vm.createContext(sandbox);
  vm.runInContext(sessPaidSrc + '\nthis.__r = computeSessionPaid(' + J(sessionId) + ');', sandbox);
  return sandbox.__r;
}
const iSP = (sid, amt) => ({ session_id: sid, amount: amt });
const SESSPAID_VECTORS = [
  ['I1 يجمع فقط صفوف نفس session_id', [iSP('S1', 60), iSP('S1', 40), iSP('S2', 100)], 'S1', 100],
  ['I2 لا صفوف مطابقة → 0',            [iSP('S2', 100)], 'S9', 0],
  ['I3 sessionId فارغ → 0 (حارس)',     [iSP('S1', 100)], null, 0],
  ['I4 مبلغ غير رقمي يُتجاهَل',         [iSP('S1', 'abc'), iSP('S1', 50)], 'S1', 50],
  ['I5 صف unearned (session_id=null) لا يطابق جلسة حقيقية', [iSP(null, 50), iSP('S1', 30)], 'S1', 30],
];
for (const [name, splits, sid, expected] of SESSPAID_VECTORS) {
  try {
    const r = runSessPaid(splits, sid);
    if (!eqN(r, expected)) { bad(name + '  [' + r + ' ≠ ' + expected + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * J) اقتراح دفعة الطبيب — computeSuggestion (payouts.html) — مال خارج.
 *    يقرأ globals sessions + payouts + بارامترات (provider/الفترة/المُستثنى) +
 *    resolveSharePct والمساعدات الأربع + موديول SyDentPayroll (يُستخرَج حيّاً
 *    من supabase-init.js بين ماركرَيه). صفر DB/DOM. يقفل حساب ما يُدفَع للطبيب:
 *    توجيه نموذج التعويض (none/salary/percentage/hybrid) · الراتب بأيام كل شهرٍ
 *    الفعلية (v382 — الشهر الكامل = الراتب، والتقسيمُ جمعيّ) ناقص ما دُفع منه
 *    عن الأيام نفسها · الحصّة دفترٌ جارٍ بعملتها (إنتاج حتى نهاية الفترة −
 *    ما سُدِّد من الحصّة عن الفترات حتى نهايتها) — حارس منع الدفع المزدوج ·
 *    استثناءُ الدفعة المُعدَّلة · تصنيفُ الدفعات بلا تفصيل بنموذج الموظف ·
 *    قصّ عند ≥0 · العزل بالعملة · تحذيرُ الإنتاج بعملةٍ أخرى.
 * =================================================================== */
console.log('J) اقتراح دفعة الطبيب — computeSuggestion (مال خارج):');
const poSrc = read('payouts.html');
const suggSrc     = extractFunction(poSrc, 'computeSuggestion');
const sharePctSrc = extractFunction(poSrc, 'resolveSharePct');
/* قاعدة #481: الاقتراح صار يعمل داخل عملته المُعلَنة — المساعد يُستخرَج حيّاً
 * لا يُعاد تنفيذه هنا، وإلا صار المثبت نسخةً ثانية تنحرف عن الملف. */
const poRowCurSrc = extractFunction(poSrc, '_rowCur');
const poHelpersSrc = ['_providerSalaryCur', '_salaryDueForPayout', '_payoutMatches', '_payoutPartsFor']
  .map(n => extractFunction(poSrc, n)).join('\n');
/* v382: الموديول المشترك يُستخرَج بين ماركرَيه (نمط SYDENT_OFFLINE_MODULE) — نسخةٌ حيّة لا مرآة */
function extractPayrollModule() {
  const src = read('supabase-init.js');
  const a = src.indexOf('/* ═══ SYDENT_PAYROLL_MODULE_START ═══ */');
  const b = src.indexOf('/* ═══ SYDENT_PAYROLL_MODULE_END ═══ */');
  if (a < 0 || b < 0 || b < a) throw new Error('ماركرا SyDentPayroll مفقودان بـsupabase-init.js');
  return src.slice(a, b);
}
const payrollModSrc = extractPayrollModule();
function runSugg(sc) {
  const sandbox = { sessions: sc.sessions || [], payouts: sc.payouts || [] };
  vm.createContext(sandbox);
  vm.runInContext('var window = this;\n' + payrollModSrc + '\n' + poRowCurSrc + '\n' + sharePctSrc + '\n' + poHelpersSrc + '\n' + suggSrc
    + '\nthis.__r = computeSuggestion(' + J(sc.provider) + ', ' + J(sc.start) + ', ' + J(sc.end) + ', ' + J(sc.exclude || null) + ');', sandbox);
  return sandbox.__r;
}
/* الموديول وحده (تقسيم الراتب والتصنيف) — يُشغَّل مباشرةً */
const PRmod = (function(){ const sb = {}; vm.createContext(sb); vm.runInContext('var window = this;\n' + payrollModSrc, sb); return sb.SyDentPayroll; })();
const jDoc = o => Object.assign({ id: 'DR1', _hasDoctorLink: true, doctorId: 'D1' }, o);   /* طبيب مرتبط */
const jSes = (pid, date, cost, cur) => ({ provider_id: pid, date: date, cost: cost, currency: cur || null });
const jPo  = o => Object.assign({ provider_id: 'D1', period_start: '2026-01-01', period_end: '2026-01-31', amount: 0, breakdown_salary: 0, breakdown_share: 0, breakdown_bonus: 0 }, o);
const M1 = '2026-01-01', M15 = '2026-01-15', M30 = '2026-01-30', M31 = '2026-01-31';

const SUGG_VECTORS = [
  ['J1 نموذج none → صفر',
    { provider: jDoc({ compensation_model: 'none' }), start: M1, end: M31 },
    { total: 0, salary: 0, share: 0 }],

  ['J2 راتب مقسّم بأيام الشهر الفعلية (15 يوماً من 31 = 1452)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 3000 }), start: M1, end: M15 },
    { salary: 1452, share: 0, total: 1452 }],

  ['J3 حصّة = إنتاج × نسبة (بلا دفعات سابقة)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1000), jSes('DR1', '2026-01-20', 500), jSes('OTHER', M15, 9999)], start: M1, end: M31 },
    { salary: 0, share: 600, total: 600 }],

  ['J4 حارس الدفع المزدوج: يطرح ما دُفع سابقاً في فترة متداخلة',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1500)], payouts: [jPo({ amount: 200 })], start: M1, end: M31 },
    { share: 400, total: 400 }],

  ['J5 hybrid = راتب (30 من 31 يوماً = 2903) + حصّة',
    { provider: jDoc({ compensation_model: 'hybrid', monthly_salary: 3000, share_percent: 50 }),
      sessions: [jSes('DR1', M15, 1000)], start: M1, end: M30 },
    { salary: 2903, share: 500, total: 3403 }],

  ['J6 فترة معكوسة (start > end) → null',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 3000 }), start: M31, end: M1 },
    null],

  ['J7 resolveSharePct: المالك بلا نسبة محددة → 100%',
    { provider: { id: 'DR1', _hasDoctorLink: false, employeeId: 'E1', compensation_model: 'percentage', share_percent: null, is_owner: true },
      sessions: [jSes('DR1', M15, 1000)], start: M1, end: M31 },
    { share: 1000, total: 1000 }],

  ['J8 قصّ الحصّة عند صفر (ما دُفع > المستحق)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1000)], payouts: [jPo({ amount: 500 })], start: M1, end: M31 },
    { share: 0, total: 0 }],

  ['J9 مطابقة بالتفصيل: يُحتسب breakdown_share فقط عند وجود تفصيل',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1500)], payouts: [jPo({ amount: 1000, breakdown_salary: 300, breakdown_share: 200 })], start: M1, end: M31 },
    { share: 400, total: 400 }],

  /* قاعدة #481 — الاقتراح يُحسب داخل عملته. بلا هذه المتجهات يبقى البلوك
   * فراغياً تجاه العزل: المتجهات J1-J9 كلها بلا عمود عملة فتُطوى لليرة
   * وتمرّ كما هي حتى لو أُلغي الفلتر. */
  ['J10 راتب دولار: الحصّة من إنتاج الدولار وحده',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 50, salary_currency: 'USD' }),
      sessions: [jSes('DR1', M15, 1000, 'USD'), jSes('DR1', M15, 9000000, 'SYP')], start: M1, end: M31 },
    { share: 500, total: 500, cur: 'USD' }],

  ['J11 راتب ليرة: إنتاج الدولار لا يدخل',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 50, salary_currency: 'SYP' }),
      sessions: [jSes('DR1', M15, 1000, 'USD'), jSes('DR1', M15, 800000, 'SYP')], start: M1, end: M31 },
    { share: 400000, total: 400000, cur: 'SYP' }],

  ['J12 المدفوع سلفاً يُطرح من عملته حصراً',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 50, salary_currency: 'USD' }),
      sessions: [jSes('DR1', M15, 1000, 'USD')],
      payouts: [jPo({ amount: 999999, currency: 'SYP' }), jPo({ amount: 100, currency: 'USD' })],
      start: M1, end: M31 },
    { share: 400, total: 400, cur: 'USD' }],

  /* ── v382: بلاغ المالك «الشهر 31 يوماً يزيد» والثغرات الست خلفه ── */
  ['J13 الشهر الكامل 31 يوماً = الراتب بالضبط (كان 103.33)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }), start: M1, end: M31 },
    { salary: 100, total: 100, cur: 'USD' }],
  ['J14 شباط 28 يوماً = الراتب بالضبط (كان 93.33)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }), start: '2026-02-01', end: '2026-02-28' },
    { salary: 100, total: 100 }],
  ['J15 نصفا الشهر يجمعان الراتب (16–31 = 51.61)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }), start: '2026-01-16', end: M31 },
    { salary: 51.61, total: 51.61 }],
  ['J16 سنة كاملة = 12 راتباً (كان 1216.67)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }), start: M1, end: '2026-12-31' },
    { salary: 1200, total: 1200 }],
  ['J17 راتب دُفع عن الفترة نفسها ⇒ لا يُقترح ثانيةً (حارس الدفع المزدوج للراتب)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }),
      payouts: [jPo({ amount: 100, currency: 'USD', period_start: M1, period_end: M31, breakdown_salary: 100 })], start: M1, end: M31 },
    { salary: 0, total: 0 }],
  ['J18 راتب دُفع عن 1–15 ⇒ يُقترح الباقي 16–31 فقط (تداخل جزئي)',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }),
      payouts: [jPo({ amount: 48.39, currency: 'USD', period_start: M1, period_end: M15, breakdown_salary: 48.39 })], start: M1, end: M31 },
    { salary: 51.61, total: 51.61 }],
  ['J19 دفعةُ راتبٍ بلا تفصيل تُصنَّف راتباً بنموذج الموظف',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' }),
      payouts: [jPo({ amount: 100, currency: 'USD', period_start: M1, period_end: M31 })], start: M1, end: M31 },
    { salary: 0, total: 0 }],
  ['J20 الدفعةُ المُعدَّلة تُستثنى من المدفوع (كانت تُطرح من نفسها ⇒ 0)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1000), jSes('DR1', '2026-01-20', 1000)],
      payouts: [jPo({ id: 'EDIT', amount: 800, breakdown_share: 800 })], start: M1, end: M31, exclude: 'EDIT' },
    { share: 800, total: 800 }],
  ['J21 دفعة فترتها 15 كانون الأول ← 14 كانون الثاني عن إنتاج كانون الأول وحده لا تُلغي حصّة كانون الثاني',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', '2025-12-20', 1000), jSes('DR1', '2026-01-20', 1000)],
      payouts: [jPo({ amount: 400, breakdown_share: 400, period_start: '2025-12-15', period_end: '2026-01-14' })], start: M1, end: M31 },
    { share: 400, total: 400 }],
  ['J22 رصيدُ حصّةٍ سابق غير مسدَّد يُضاف ويُعلَن (كانون الأول لم يُدفع)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', '2025-12-20', 1000), jSes('DR1', '2026-01-20', 1000)], start: M1, end: M31 },
    { share: 800, total: 800, meta: { periodShare: 400, priorShare: 400 } }],
  ['J23 مقدَّمٌ سابق يُخصم ويُعلَن (دُفع 500 عن 400 مستحقة)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', '2025-12-20', 1000), jSes('DR1', '2026-01-20', 1000)],
      payouts: [jPo({ amount: 500, breakdown_share: 500, period_start: '2025-12-01', period_end: '2025-12-31' })], start: M1, end: M31 },
    { share: 300, total: 300, meta: { periodShare: 400, priorShare: -100 } }],
  ['J24 دفعةُ فترةٍ لاحقة لا تُطرح من فترةٍ سابقة (شباط مدفوع، كانون الثاني يُقترح)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40 }),
      sessions: [jSes('DR1', M15, 1000), jSes('DR1', '2026-02-10', 1000)],
      payouts: [jPo({ amount: 400, breakdown_share: 400, period_start: '2026-02-01', period_end: '2026-02-28' })], start: M1, end: M31 },
    { share: 400, total: 400 }],
  ['J25 دفعةٌ بلا تفصيل لموظف راتب+نسبة: الراتب أولاً والباقي حصّة',
    { provider: jDoc({ compensation_model: 'hybrid', monthly_salary: 3000, share_percent: 50 }),
      sessions: [jSes('DR1', M15, 1000)],
      payouts: [jPo({ amount: 3500, period_start: M1, period_end: M31 })], start: M1, end: M31 },
    { salary: 0, share: 0, total: 0 }],
  ['J26 النسبة وحدها تُدفع بعملة إنتاجها الوحيدة (إنتاج دولار وراتب بلا عملة ⇒ $)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 50 }),
      sessions: [jSes('DR1', M15, 1000, 'USD')], start: M1, end: M31 },
    { share: 500, total: 500, cur: 'USD' }],
  ['J27 إنتاجٌ بعملةٍ أخرى لا يدخل ويُحذَّر منه صراحةً (لا صمت)',
    { provider: jDoc({ compensation_model: 'hybrid', monthly_salary: 100, salary_currency: 'USD', share_percent: 50 }),
      sessions: [jSes('DR1', M15, 800000, 'SYP')], start: M1, end: M31 },
    { salary: 100, share: 0, total: 100, cur: 'USD', warnings: [{ code: 'foreign_production', cur: 'SYP', amount: 800000 }] }],
  ['J27b رصيدُ حصّةٍ قديم غير مسدَّد بعملةٍ أخرى يُعلَن ولا يُدمج',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 50, salary_currency: 'SYP' }),
      sessions: [jSes('DR1', '2025-12-10', 1000, 'USD'), jSes('DR1', M15, 800000, 'SYP')], start: M1, end: M31 },
    { share: 400000, total: 400000, cur: 'SYP', warnings: [{ code: 'foreign_balance', cur: 'USD', amount: 500 }] }],
  /* ── v384: سجلُّ النسب بتاريخ سريان (Migration 144) ── */
  ['J30 رفعُ النسبة من 30 إلى 40 بمنتصف الشهر: كلُّ جلسةٍ بنسبة تاريخها (300 + 400)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40, share_history: [{ from: '2000-01-01', pct: 30 }, { from: '2026-01-16', pct: 40 }] }),
      sessions: [jSes('DR1', '2026-01-10', 1000), jSes('DR1', '2026-01-20', 1000)], start: M1, end: M31 },
    { share: 700, total: 700, meta: { rates: [30, 40] } }],
  ['J31 الرفعُ في أيلول لا يعيد حسابَ آب (لا رصيدَ سابق كاذب)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40, share_history: [{ from: '2000-01-01', pct: 30 }, { from: '2026-01-01', pct: 40 }] }),
      sessions: [jSes('DR1', '2025-12-20', 1000), jSes('DR1', M15, 1000)],
      payouts: [jPo({ amount: 300, breakdown_share: 300, period_start: '2025-12-01', period_end: '2025-12-31' })], start: M1, end: M31 },
    { share: 400, total: 400, meta: { priorShare: 0 } }],
  ['J32 سجلٌّ فارغ ⇒ النسبةُ الحالية على كل التاريخ (ما قبل الترحيل)',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40, share_history: [] }),
      sessions: [jSes('DR1', '2025-12-20', 1000), jSes('DR1', M15, 1000)], start: M1, end: M31 },
    { share: 800, total: 800 }],
  ['J33 سجلٌّ معطوب (نصّ/نسبة 150/تاريخ مستحيل) يُسقَط لا يُدوَّر',
    { provider: jDoc({ compensation_model: 'percentage', share_percent: 40, share_history: [{ from: '2026-02-31', pct: 90 }, { from: '2000-01-01', pct: 150 }, 'x'] }),
      sessions: [jSes('DR1', M15, 1000)], start: M1, end: M31 },
    { share: 400, total: 400 }],
  ['J34 خفضُ النسبة إلى 0 عند التحوّل لراتب (نموذج hybrid ⇒ salary سابقاً) يُوقف الحصّة من تاريخه',
    { provider: jDoc({ compensation_model: 'hybrid', monthly_salary: 3100, share_percent: 50, share_history: [{ from: '2000-01-01', pct: 50 }, { from: '2026-01-16', pct: 0 }] }),
      sessions: [jSes('DR1', '2026-01-10', 1000), jSes('DR1', '2026-01-20', 1000)], start: M1, end: M31 },
    { salary: 3100, share: 500, total: 3600 }],
  ['J28 تاريخٌ مستحيل (2026-02-31) ⇒ null لا رقمٌ مدوَّر',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 3000 }), start: '2026-02-01', end: '2026-02-31' },
    null],
  ['J29 فترةٌ عابرة لثلاثة أشهر (15 كانون الثاني ← 10 آذار) = 17/31 + 1 + 10/31',
    { provider: jDoc({ compensation_model: 'salary', monthly_salary: 310 }), start: '2026-01-15', end: '2026-03-10' },
    { salary: 580, total: 580 }],
];
/* ── SyDentPayroll مباشرةً: خصائص التقسيم والتصنيف ── */
const PRV = [
  ['PR1 كسر الشهر الكامل = 1 لكل الشهور', () => [1,2,3,4,5,6,7,8,9,10,11,12].every(m => { const mm = String(m).padStart(2,'0'); const dim = PRmod.daysInMonth(2026, m-1); return Math.abs(PRmod.salaryFraction('2026-' + mm + '-01', '2026-' + mm + '-' + dim) - 1) < 1e-12; })],
  ['PR2 كبيسة: شباط 2028 = 29 يوماً و1 كامل', () => PRmod.daysInMonth(2028, 1) === 29 && Math.abs(PRmod.salaryFraction('2028-02-01', '2028-02-29') - 1) < 1e-12],
  ['PR3 الجمعية: 1–15 + 16–31 = 1', () => Math.abs(PRmod.salaryFraction('2026-01-01','2026-01-15') + PRmod.salaryFraction('2026-01-16','2026-01-31') - 1) < 1e-12],
  ['PR4 يومٌ واحد 31 كانون الثاني = 1/31', () => Math.abs(PRmod.salaryFraction('2026-01-31','2026-01-31') - 1/31) < 1e-12],
  ['PR5 فترةٌ معكوسة أو مستحيلة = 0', () => PRmod.salaryFraction('2026-01-31','2026-01-01') === 0 && PRmod.salaryFraction('2026-02-30','2026-03-01') === 0 && PRmod.salaryFraction('', '2026-01-01') === 0],
  ['PR6 التقريب: الليرة صحيحة والدولار بالسنت', () => PRmod.prorateSalary(400000,'2026-01-01','2026-01-15','SYP') === 193548 && PRmod.prorateSalary(100,'2026-01-01','2026-01-15','USD') === 48.39],
  ['PR7 راتبٌ صفري/سالب/نصّي = 0', () => PRmod.prorateSalary(0,'2026-01-01','2026-01-31','USD') === 0 && PRmod.prorateSalary(-5,'2026-01-01','2026-01-31','USD') === 0 && PRmod.prorateSalary('abc','2026-01-01','2026-01-31','USD') === 0],
  ['PR8 التصنيف: التفصيلُ المخزَّن يحكم', () => { const r = PRmod.payoutParts({ amount: 500, breakdown_salary: 300, breakdown_share: 200 }, 'percentage'); return r.salary === 300 && r.share === 200 && r.explicit; }],
  ['PR9 التصنيف بلا تفصيل: راتب/نسبة/بدون', () => PRmod.payoutParts({ amount: 500 }, 'salary').salary === 500 && PRmod.payoutParts({ amount: 500 }, 'percentage').share === 500 && PRmod.payoutParts({ amount: 500 }, 'none').manual === 500 && PRmod.payoutParts({ amount: 500 }, 'none').share === 0],
  ['PR10 التصنيف بلا تفصيل (راتب+نسبة): الراتبُ أولاً حتى مستحقّه', () => { const r = PRmod.payoutParts({ amount: 3500 }, 'hybrid', () => 3000); const r2 = PRmod.payoutParts({ amount: 2000 }, 'hybrid', () => 3000); return r.salary === 3000 && r.share === 500 && r2.salary === 2000 && r2.share === 0; }],
  ['PR12 rateAt: قبل أول مدخل ⇒ الأول · بينهما ⇒ الأقدم الساري · يومُ السريان نفسه ⇒ الجديد', () => { const h = [{ from: '2026-01-16', pct: 40 }, { from: '2000-01-01', pct: 30 }]; return PRmod.rateAt(h, 99, '1999-05-05') === 30 && PRmod.rateAt(h, 99, '2026-01-15') === 30 && PRmod.rateAt(h, 99, '2026-01-16') === 40 && PRmod.rateAt(h, 99, '2027-01-01') === 40; }],
  ['PR13 rateAt: سجلٌّ فارغ/نصّ معطوب ⇒ fallback', () => PRmod.rateAt([], 40, '2026-01-01') === 40 && PRmod.rateAt('not json', 40, '2026-01-01') === 40 && PRmod.rateAt(null, 40, '2026-01-01') === 40],
  ['PR14 normalizeHistory: ترتيب + إسقاط المعطوب + استبدال التاريخ المكرَّر', () => { const h = PRmod.normalizeHistory([{ from: '2026-03-01', pct: 50 }, { from: '2026-01-01', pct: 30 }, { from: '2026-01-01', pct: 35 }, { from: 'bad', pct: 1 }, { from: '2026-02-30', pct: 1 }, { from: '2026-02-01', pct: 120 }]); return h.length === 2 && h[0].from === '2026-01-01' && h[0].pct === 35 && h[1].pct === 50; }],
  ['PR15 appendRate: يضيف مرتّباً ويرفض تاريخاً/نسبةً غير صالحَين بلا تغيير', () => { const b = [{ from: '2000-01-01', pct: 30 }]; const a = PRmod.appendRate(b, '2026-01-16', 40); return a.length === 2 && a[1].pct === 40 && PRmod.appendRate(b, '2026-02-30', 40).length === 1 && PRmod.appendRate(b, '2026-01-16', 101).length === 1 && b.length === 1; }],
  ['PR16 ratesInRange: النسبُ الساريةُ داخل الفترة فقط', () => { const h = [{ from: '2000-01-01', pct: 30 }, { from: '2026-01-16', pct: 40 }, { from: '2026-03-01', pct: 50 }]; return J(PRmod.ratesInRange(h, 0, '2026-01-01', '2026-01-31')) === '[30,40]' && J(PRmod.ratesInRange(h, 0, '2026-02-01', '2026-02-28')) === '[40]' && J(PRmod.ratesInRange([], 45, '2026-02-01', '2026-02-28')) === '[45]'; }],
  ['PR11 التقاطع: متداخل/متلامس/منفصل', () => { const a = PRmod.overlap('2026-01-01','2026-01-31','2026-01-16','2026-02-14'); return a && a.start === '2026-01-16' && a.end === '2026-01-31' && PRmod.overlap('2026-01-01','2026-01-31','2026-02-01','2026-02-28') === null; }],
];
for (const [name, fn] of PRV) {
  try { fn() ? ok(name) : bad(name); } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}
/* ── v382: تقارير الأطباء — حصّةُ الإنتاج وحدها تُخصم من دفتر الطبيب ──
 * payoutsPaidInWindow + _payoutShareOf (provider-reports.html) تُستخرَجان حيّاً مع
 * الموديول: راتبُ الطبيب الثابت ومكافأتُه ودفعاتُ «بدون» لا تُطرح من حصّة الإنتاج —
 * كانت الدفعةُ تُطرح كاملةً فطبيبُ الراتب يظهر «مقدَّم لصالح العيادة». */
console.log('J-PR) تقارير الأطباء — حصّة الإنتاج من الدفعات:');
try {
  const prSrc = read('provider-reports.html');
  const prCode = ['_rowCur', 'toDay', '_payoutDay', '_payoutShareOf', 'payoutsPaidInWindow'].map(n => extractFunction(prSrc, n)).join('\n');
  function runPR(doctors, payouts, provId, from, to) {
    const sb = { doctors: doctors, payouts: payouts };
    vm.createContext(sb);
    vm.runInContext('var window = this;\n' + payrollModSrc + '\n' + prCode + '\nthis.__r = payoutsPaidInWindow(' + J(provId) + ', ' + J(from) + ', ' + J(to) + ');', sb);
    return sb.__r;
  }
  const inWin = '2026-01-10T12:00:00+00:00';
  const docs = [
    { id: 'DS', compensation_model: 'salary', monthly_salary: 100, salary_currency: 'USD' },
    { id: 'DP', compensation_model: 'percentage' },
    { id: 'DH', compensation_model: 'hybrid', monthly_salary: 3000, salary_currency: 'SYP' },
    { id: 'DN', compensation_model: 'none' },
  ];
  const vec = [
    ['JP1 راتبٌ ثابت بلا تفصيل ⇒ صفرٌ من الحصّة', [{ provider_id: 'DS', paid_at: inWin, amount: 100, currency: 'USD' }], 'DS', 0],
    ['JP2 نسبةٌ بلا تفصيل ⇒ كامل المبلغ حصّة', [{ provider_id: 'DP', paid_at: inWin, amount: 400 }], 'DP', 400],
    ['JP3 تفصيلٌ مخزَّن (راتب 300 + نسبة 200 + مكافأة 50) ⇒ 200', [{ provider_id: 'DP', paid_at: inWin, amount: 550, breakdown_salary: 300, breakdown_share: 200, breakdown_bonus: 50 }], 'DP', 200],
    ['JP4 راتب+نسبة بلا تفصيل عن كانون الثاني كاملاً: 3500 ⇒ 500 حصّة', [{ provider_id: 'DH', paid_at: inWin, amount: 3500, period_start: '2026-01-01', period_end: '2026-01-31' }], 'DH', 500],
    ['JP5 راتب+نسبة بعملةٍ غير عملة الراتب ⇒ كلّها حصّة', [{ provider_id: 'DH', paid_at: inWin, amount: 50, currency: 'USD', period_start: '2026-01-01', period_end: '2026-01-31' }], 'DH', 50],
    ['JP6 نموذج «بدون» ⇒ لا يُخصم شيء', [{ provider_id: 'DN', paid_at: inWin, amount: 900 }], 'DN', 0],
    ['JP7 خارج النافذة أو لطبيبٍ آخر ⇒ 0', [{ provider_id: 'DP', paid_at: '2026-02-10T12:00:00+00:00', amount: 400 }, { provider_id: 'DS', paid_at: inWin, amount: 400 }], 'DP', 0],
  ];
  for (const [name, pos, pid, exp] of vec) {
    try { const r = runPR(docs, pos, pid, '2026-01-01', '2026-01-31'); eqN(r, exp) ? ok(name) : bad(name + '  [' + r + ' ≠ ' + exp + ']'); }
    catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
  }
  /* v384: computePayout بسجلّ النسب — أساسُ الإنتاج دقيقٌ بكل جلسة، الصافي/التحصيل بالنسبة الفعلية */
  const prPayCode = ['resolveSharePercent', 'getShareBase', 'computePayout', '_shareWeighted'].map(n => extractFunction(prSrc, n)).join('\n');
  function runPay(basisV, sessionsV, doc, stats) {
    const sb = { sessions: sessionsV, basis: basisV };
    vm.createContext(sb);
    vm.runInContext('var window = this;\n' + payrollModSrc + '\n' + prPayCode + '\nthis.__r = computePayout(' + J(doc) + ', ' + J(stats) + ');', sb);
    return sb.__r;
  }
  const hDoc = { id: 'D1', share_percent: 40, share_history: [{ from: '2000-01-01', pct: 30 }, { from: '2026-01-16', pct: 40 }] };
  const hSes = [{ provider_id: 'D1', date: '2026-01-10', cost: 1000 }, { provider_id: 'D1', date: '2026-01-20', cost: 1000 }, { provider_id: 'D2', date: '2026-01-20', cost: 5000 }];
  const hStats = { production: 2000, labCost: 200, net: 1800, collection: 1000 };
  const payVec = [
    ['JP8 إنتاج: 300 + 400 (كل جلسة بنسبة تاريخها)', runPay('production', hSes, hDoc, hStats), 700],
    ['JP9 صافي: 700 − مخبر 200 × النسبة الفعلية 35٪', runPay('net', hSes, hDoc, hStats), 630],
    ['JP10 تحصيل: 1000 × 35٪', runPay('collection', hSes, hDoc, hStats), 350],
    ['JP11 سجلٌّ فارغ ⇒ المسارُ السابق حرفياً (الأساس × النسبة)', runPay('production', hSes, { id: 'D1', share_percent: 40, share_history: [] }, hStats), 800],
    ['JP12 المالكُ بلا نسبة وبلا سجلّ ⇒ 100٪', runPay('production', hSes, { id: 'D1', is_owner: true, share_percent: null }, hStats), 2000],
    ['JP13 لا إنتاجَ بالفترة ⇒ النسبةُ الأحدث على التحصيل', runPay('collection', [], hDoc, { production: 0, labCost: 0, net: 0, collection: 500 }), 200],
  ];
  for (const [name, r, exp] of payVec) { eqN(r, exp) ? ok(name) : bad(name + '  [' + r + ' ≠ ' + exp + ']'); }
} catch (e) { bad('J-PR: فشل الاستخراج — ' + (e && e.message)); }
function expectSugg(r, exp) {
  if (exp === null) return (r === null) ? null : 'ليس null: ' + J(r);
  if (r === null) return 'null غير متوقّع';
  for (const k in exp) {
    /* v382: meta (كائن أرقام) وwarnings (مصفوفة) يُقارَنان بنيوياً؛ وسم العملة سلسلة ⇒ حرفياً؛ المبالغ ⇒ eqN. */
    let eq;
    if (k === 'meta') { eq = Object.keys(exp.meta).every(mk => Array.isArray(exp.meta[mk]) ? J((r.meta || {})[mk]) === J(exp.meta[mk]) : eqN((r.meta || {})[mk], exp.meta[mk])); }
    else if (k === 'warnings') { eq = J(r.warnings || []) === J(exp.warnings); }
    else eq = (typeof exp[k] === 'string') ? (r[k] === exp[k]) : eqN(r[k], exp[k]);
    if (!eq) return k + '=' + J(r[k]) + ' ≠ ' + J(exp[k]);
  }
  return null;
}
for (const [name, sc, expected] of SUGG_VECTORS) {
  try {
    const r = runSugg(sc);
    /* ثابت عام: total = salary + share (عند وجود نتيجة) */
    if (r && !eqN(r.total, (r.salary || 0) + (r.share || 0))) { bad(name + '  [الثابت: total ≠ salary+share]'); continue; }
    const err = expectSugg(r, expected);
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * K) أداء الطبيب المالي — computeProviderStats (provider-reports.html).
 *    إنتاج/تكلفة مخبر/صافي/تحصيل لكل طبيب — يغذّي قرارات الدفع والأداء.
 *    نقي: يقرأ globals sessions/payments/paymentSplits/labOrders/
 *    splitSessionStatus + بارامتر provId + providerLabCost + splitIsEarned
 *    (كلاهما يُستخرَج معها). صفر DB/DOM. يقفل: production=Σ جلسات الطبيب ·
 *    labCost=Σ مخابر الطبيب · net=production−labCost · التحصيل جزء A (splits
 *    مكتسبة مطابقة للطبيب — unearned/planned مستبعدة، قاعدة مطابقة لـaccounting
 *    فلا يتجاوز تحصيل الطبيب إيراد العيادة) + جزء B (fallback نسبي للدفعات
 *    القديمة بلا splits: نسبة provTotal/total لكل مريض) · _unassigned (بلا
 *    provider_id) · دفعة إلها split لا تدخل fallback الـlegacy (لا عدّ مزدوج).
 * =================================================================== */
console.log('K) أداء الطبيب المالي — computeProviderStats:');
const prSrc = read('provider-reports.html');
const provStatsSrc = extractFunction(prSrc, 'computeProviderStats');
const provLabSrc   = extractFunction(prSrc, 'providerLabCost');
const prEarnedSrc  = extractFunction(prSrc, 'splitIsEarned');
function runProvStats(sc) {
  const sandbox = {
    sessions: sc.sessions || [], payments: sc.payments || [], paymentSplits: sc.splits || [],
    labOrders: sc.labs || [], splitSessionStatus: sc.sessStatus || {}
  };
  vm.createContext(sandbox);
  vm.runInContext(prEarnedSrc + '\n' + provLabSrc + '\n' + provStatsSrc
    + '\nthis.__r = computeProviderStats(' + J(sc.provId) + ');', sandbox);
  return sandbox.__r;
}
/* بنّاؤون (patient_id افتراضي PT1؛ session_id/provider_id صريحة للمطابقة) */
const kSes = (provider_id, cost, patient_id) => ({ provider_id: provider_id, cost: cost, patient_id: patient_id || 'PT1' });
const kSP  = (payment_id, provider_id, session_id, amount, unearned) => ({ payment_id: payment_id, provider_id: provider_id, session_id: session_id, amount: amount, is_unearned: !!unearned });
const kPay = (id, patient_id, amount) => ({ id: id, patient_id: patient_id, amount: amount });
const kLab = (provider_id, cost) => ({ provider_id: provider_id, cost: cost });

const PROV_VECTORS = [
  ['K1 الإنتاج = Σ جلسات الطبيب + العدّ',
    { sessions: [kSes('P1', 1000), kSes('P1', 500), kSes('P2', 9999)], provId: 'P1' },
    { production: 1500, sessionCount: 2, collection: 0, labCost: 0, net: 1500 }],

  ['K2 تكلفة المخبر + الصافي (net = production − labCost)',
    { sessions: [kSes('P1', 1000)], labs: [kLab('P1', 200), kLab('P2', 50)], provId: 'P1' },
    { production: 1000, labCost: 200, net: 800 }],

  ['K3 التحصيل عبر split مكتسب مطابق للطبيب',
    { sessions: [kSes('P1', 800)], splits: [kSP('PAY1', 'P1', 'S1', 800, false)], sessStatus: { S1: 'completed' }, provId: 'P1' },
    { collection: 800, production: 800 }],

  ['K4 unearned + planned مستبعدان من التحصيل',
    { sessions: [kSes('P1', 800)],
      splits: [kSP('PAY1', 'P1', 'S1', 800, false), kSP('PAY2', 'P1', null, 200, true), kSP('PAY3', 'P1', 'S9', 300, false)],
      sessStatus: { S1: 'completed', S9: 'planned' }, provId: 'P1' },
    { collection: 800 }],

  ['K5 split لطبيب آخر لا يُحتسب',
    { sessions: [kSes('P1', 800)],
      splits: [kSP('PAY1', 'P1', 'S1', 800, false), kSP('PAY4', 'P2', 'S2', 999, false)],
      sessStatus: { S1: 'completed', S2: 'completed' }, provId: 'P1' },
    { collection: 800 }],

  ['K6 fallback نسبي للـlegacy (دفعة بلا split ← نسبة provTotal/total)',
    { sessions: [kSes('P1', 600, 'PT1'), kSes('P2', 400, 'PT1')], payments: [kPay('LEG1', 'PT1', 500)], splits: [], provId: 'P1' },
    { collection: 300 }],

  ['K7 دفعة إلها split لا تدخل fallback الـlegacy (لا عدّ مزدوج)',
    { sessions: [kSes('P1', 1000, 'PT1')], payments: [kPay('PAY1', 'PT1', 500)],
      splits: [kSP('PAY1', 'P1', 'S1', 500, false)], sessStatus: { S1: 'completed' }, provId: 'P1' },
    { collection: 500 }],

  ['K8 _unassigned (بلا provider_id)',
    { sessions: [kSes(null, 300)], splits: [kSP('X', null, 'S1', 150, false)], sessStatus: { S1: 'completed' }, provId: '_unassigned' },
    { production: 300, collection: 150 }],

  ['K9 مركّب: إنتاج + مخبر + صافي + تحصيل (split مكتسب + legacy)',
    { sessions: [kSes('P1', 1000, 'PT1'), kSes('P2', 1000, 'PT1')],
      labs: [kLab('P1', 100)],
      payments: [kPay('PAY1', 'PT1', 400), kPay('LEG2', 'PT1', 200)],
      splits: [kSP('PAY1', 'P1', 'S1', 400, false)], sessStatus: { S1: 'completed' }, provId: 'P1' },
    { production: 1000, labCost: 100, net: 900, collection: 500 }],
];
for (const [name, sc, expected] of PROV_VECTORS) {
  try {
    const r = runProvStats(sc);
    /* ثابت عام: net = production − labCost */
    if (!eqN(r.net, r.production - r.labCost)) { bad(name + '  [الثابت: net ≠ production−labCost]'); continue; }
    let err = null;
    for (const k in expected) if (!eqN(r[k], expected[k])) { err = k + '=' + J(r[k]) + ' ≠ ' + J(expected[k]); break; }
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * L) إحصاء المصاريف بالفترات — computeStats (expenses.html).
 *    مجاميع مصاريف اليوم/الأسبوع/الشهر/السنة على لوحة المصاريف. حرجية أقل
 *    (طبقة عرض) لكن حدود المقارنة (>= شامل · الأسبوع=آخر 7 أيام · بداية
 *    الشهر/السنة) لها سطح خطأ صامت. الدالة معتمدة DOM (تكتب statToday/Week/
 *    Month/Year) وتعتمد التاريخ الحالي → نحقن Date ثابتاً (15 حزيران 2026) +
 *    todayISO + fmtAmount هوية + $ shim يلتقط النص، ونقرأ المجاميع.
 *    ثابت لكل متجه: today ≤ week ≤ month ≤ year (تعشيش النوافذ).
 * =================================================================== */
console.log('L) إحصاء المصاريف بالفترات — computeStats:');
const expStatsSrc = extractFunction(read('expenses.html'), 'computeStats');
/* قاعدة #481: computeStats صارت تُخرج أكياساً لكل عملة عبر مساعدات مشتركة —
 * تُستخرج حيّةً كي لا يتحوّل المثبت إلى نسخةٍ ثانية تنحرف عن الملف. */
const expCurHelpers = ['_rowCur', '_curLblOf', '_defCurExp', '_emptyBag', '_bagAdd', '_bagText']
  .map(fn => extractFunction(read('expenses.html'), fn)).join('\n');
/* المصدر الواحد لأكياس القراءة (قاعدة #481) يعيش بالأصل المشترك — يُستخرَج
 * حيّاً ويُثبَّت بالسياق كما يفعل المتصفّح (window.X ينشئ عالمياً X). */
const curBagSrc = (function () {
  const src = read('supabase-init.js');
  const i = src.indexOf('window.SyDentCurBag = (function');
  if (i < 0) throw new Error('SyDentCurBag غير موجودة بـsupabase-init.js');
  const end = src.indexOf('})();', i);
  return src.slice(i, end + 5) + '\nthis.SyDentCurBag = window.SyDentCurBag;';
})();
function makeMockDate() {
  const RD = Date;
  return function MockDate(...args) {
    if (args.length === 0) return new RD(2026, 5, 15, 12, 0, 0);   /* ثابت: 15 حزيران 2026 (محلي) */
    return new RD(...args);
  };
}
function runExpStats(expenses, clinicCur) {
  const els = {};
  const $ = id => (els[id] || (els[id] = { textContent: '' }));
  const sandbox = {
    expenses: expenses,
    todayISO: () => '2026-06-15',
    fmtAmount: x => x,          /* هوية: textContent يحمل المجموع الخام */
    $: $,
    Date: makeMockDate(),
    window: { SyDentCurrency: { code: () => (clinicCur || 'SYP'),
                                labelOf: c => (c === 'USD') ? '$' : 'ل.س' } }
  };
  vm.createContext(sandbox);
  vm.runInContext(curBagSrc + '\n' + expCurHelpers + '\n' + expStatsSrc + '\ncomputeStats();', sandbox);
  return {
    today: els.statToday ? els.statToday.textContent : undefined,
    week:  els.statWeek  ? els.statWeek.textContent  : undefined,
    month: els.statMonth ? els.statMonth.textContent : undefined,
    year:  els.statYear  ? els.statYear.textContent  : undefined
  };
}
const lE = (date, amount, cur) => ({ date: date, amount: amount, currency: cur || null });
const EXPSTATS_VECTORS = [
  ['L1 تعشيش النوافذ (اليوم⊆الأسبوع⊆الشهر⊆السنة)',
    [lE('2026-06-15', 100), lE('2026-06-10', 50), lE('2026-06-03', 30), lE('2026-03-01', 20), lE('2025-12-01', 999)],
    { today: 100, week: 150, month: 180, year: 200 }],
  ['L2 حدود شاملة (بداية الأسبوع/الشهر/السنة، >= )',
    [lE('2026-06-08', 70), lE('2026-06-01', 40), lE('2026-01-01', 10)],
    { today: 0, week: 70, month: 110, year: 120 }],
  ['L3 مبلغ غير رقمي يُتجاهَل',
    [lE('2026-06-15', 'abc'), lE('2026-06-15', 25)],
    { today: 25, week: 25, month: 25, year: 25 }],
  ['L4 فارغ → كل المجاميع صفر',
    [],
    { today: 0, week: 0, month: 0, year: 0 }],
  /* قاعدة #481 — عزل الطبقتين. بدون هذه المتجهات يبقى الفحص فراغياً تجاه
   * الثابت الجديد: المتجهات ١-٤ كلها بعملةٍ واحدة فتمرّ حتى لو أُلغي العزل. */
  ['L5 عملتان: كل طبقة بوسمها ولا تُجمعان',
    [lE('2026-06-15', 100, 'SYP'), lE('2026-06-15', 50, 'USD')],
    { today: '100 ل.س · 50 $', week: '100 ل.س · 50 $' }],
  ['L6 طبقة الدولار وحدها بعيادة ليرة ⇒ توسَم (لا رقم عارٍ)',
    [lE('2026-06-15', 50, 'USD')],
    { today: '50 $' }],
  ['L7 عيادة أحادية ⇒ رقم عارٍ بايت-مطابق للسابق',
    [lE('2026-06-15', 100, 'SYP'), lE('2026-06-10', 50, null)],
    { today: 100, week: 150 }],
];
for (const [name, exps, expected] of EXPSTATS_VECTORS) {
  try {
    const r = runExpStats(exps);
    /* ثابت التعشيش يُقاس على المتجهات أحادية العملة حصراً — المخرج المزدوج
     * سلسلةٌ موسومة لا رقمٌ قابل للمقارنة، وهو ذاته دليل العزل. */
    if (typeof expected.today === 'number' && typeof expected.year === 'number' &&
        !(r.today <= r.week + 0.001 && r.week <= r.month + 0.001 && r.month <= r.year + 0.001)) {
      bad(name + '  [الثابت: today≤week≤month≤year مكسور: ' + J(r) + ']'); continue;
    }
    let err = null;
    for (const k in expected) {
      /* المخرج المزدوج سلسلة موسومة ⇒ مقارنة حرفية؛ الأحادي رقم ⇒ eqN. */
      const eq = (typeof expected[k] === 'string') ? (r[k] === expected[k]) : eqN(r[k], expected[k]);
      if (!eq) { err = k + '=' + J(r[k]) + ' ≠ ' + J(expected[k]); break; }
    }
    if (err) { bad(name + '  [' + err + ']'); continue; }
    ok(name);
  } catch (e) { bad(name + '  [استثناء: ' + (e && e.message) + ']'); }
}

/* ═══════════════════════════════════════════════════════════════════
 * N) عزل عملة خطة الأقساط — ppPlanCalc (pp-plan.js) · قاعدة #481.
 *    الخطة كتلةٌ واحدة بعملةٍ واحدة (M125)، ودفعةٌ بعملةٍ أخرى لا تغطّي
 *    منها شيئاً. حارس المرايا يثبّت التطابق بين النسختين لا صحّتهما — لو
 *    سقط الطيّ من الاثنتين معاً بقيتا متطابقتين وكلتاهما خاطئة، فالقيمة
 *    تُثبَّت هنا. تُقاس على النسختين لأن الخطأ قد يدخل أيّهما.
 * =================================================================== */
console.log('N) عزل عملة خطة الأقساط — prmPlanCalc ⇔ ppPlanCalc:');
try {
  const planCalcs = [
    ['pp-plan.js', compileFns(read('pp-plan.js'), ['ppPlanAddPeriod', 'ppPlanCalc']).ppPlanCalc],
    ['patients.html', compileFns(read('patients.html'), ['prmPlanAddPeriod', 'prmPlanCalc']).prmPlanCalc]
  ];
  const planUsd = { total: 1000, installment_amount: 250, frequency: 'monthly', start_date: '2026-01-01', currency: 'USD' };
  const planSyp = { total: 1000000, installment_amount: 250000, frequency: 'monthly', start_date: '2026-01-01', currency: 'SYP' };
  const mixedPays = [
    { amount: 250,    date: '2026-01-05', currency: 'USD' },
    { amount: 900000, date: '2026-01-06', currency: 'SYP' },
    { amount: 250,    date: '2026-02-05', currency: 'USD' }
  ];
  for (const [file, calc] of planCalcs) {
    /* N1: خطة الدولار لا ترى دفعة الليرة — لولا الطيّ لأُعلنت مغطّاة (500+900000). */
    const a = calc(planUsd, mixedPays, '2026-07-01');
    if (eqN(a.covered, 500) && a.done === false) ok('N1 خطة الدولار: covered=500 وغير مغطّاة (' + file + ')');
    else bad('N1 خطة الدولار تسرّبت لها الليرة: ' + J(a) + ' (' + file + ')');
    /* N2: خطة الليرة لا ترى دفعة الدولار. */
    const b = calc(planSyp, mixedPays, '2026-07-01');
    if (eqN(b.covered, 900000)) ok('N2 خطة الليرة: covered=900,000 بلا الدولار (' + file + ')');
    else bad('N2 خطة الليرة تسرّب لها الدولار: ' + J(b) + ' (' + file + ')');
    /* N3: صفٌّ قديم بلا عمود عملة يُطوى إلى الليرة بالطرفين ⇒ صفر انحدار. */
    const c = calc({ total: 300, installment_amount: 100, frequency: 'monthly', start_date: '2026-01-01' },
                   [{ amount: 100, date: '2026-01-05' }, { amount: 100, date: '2026-02-05', currency: null }], '2026-07-01');
    if (eqN(c.covered, 200)) ok('N3 خطة/دفعات بلا عمود عملة ⇒ سلوك ما قبل M125 حرفياً (' + file + ')');
    else bad('N3 انحدار على الصفوف القديمة: ' + J(c) + ' (' + file + ')');
  }
} catch (e) { bad('فشل فحص عزل عملة الخطة: ' + e.message); }

/* ═══════════════════════════════════════════════════════════════════
 * F) تكافؤ صيغة الرصيد — patients.html ⇔ patient-profile.html
 *    خطر الانحراف الصامت الأخير: رصيد قائمة المرضى (loadFinancials — تجميع
 *    batch يستعلم Supabase) مقابل رصيد ملف المريض (computeFinancials). نفس
 *    الصيغة، تطبيقان مختلفان بنيوياً → لو تغيّرت بمكان دون الآخر، العيادة
 *    ترى رصيدين لنفس المريض. نشغّل loadFinancials الحية بـsb وهمي على نفس
 *    سيناريوهات بلوك D ونقارن trueBalance (+ allocated/unearned/completed).
 * =================================================================== */
/* loadFinancials دالة async؛ extractFunction تُسقِط "async" → نعيدها */
const finBatchSrc = 'async ' + extractFunction(read('patients.html'), 'loadFinancials');
function mkSb(rowsByTable) {
  return { from(t) { return { select() { return { in() { return Promise.resolve({ data: rowsByTable[t] || [], error: null }); } }; } }; } };
}
async function runBatchFin(sc) {
  const pid = 'PT1';
  const rows = {
    ledger_sessions:     (sc.sessions    || []).map(s  => ({ id: s.id, patient_id: pid, cost: s.cost, status: s.status, date: '2026-01-01', description: '' })),
    ledger_payments:     (sc.payments    || []).map(p  => ({ patient_id: pid, amount: p.amount })),
    payment_splits:      (sc.splits      || []).map(sp => ({ patient_id: pid, session_id: sp.session_id, amount: sp.amount, is_unearned: sp.is_unearned })),
    account_adjustments: (sc.adjustments || []).map(a  => ({ patient_id: pid, kind: a.kind, amount: a.amount }))
  };
  const sandbox = { patients: [{ id: pid }], finMap: {}, lastVisitMap: {}, window: { sb: mkSb(rows) }, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(finBatchSrc + '\nthis.__p = loadFinancials();', sandbox);
  await sandbox.__p;
  return sandbox.finMap[pid];
}

/* ═══════════════════════════════════════════════════════════════════
 * G) تكافؤ رصيد اللوحة الرئيسية — index.html computeDashFinancials
 *    ⇔ الكانوني computeFinancials (patient-profile.html، بلوك D).
 *    ثالث تطبيق بنيوي مختلف لنفس صيغة رصيد المريض (بعد ملف المريض D
 *    وقائمة المرضى F): دالة async تستعلم Supabase بـPromise.all على
 *    4 جداول، بشلال استرداد inline خاص بها (rfu=min(refunds,unearned)،
 *    rfe=refunds−rfu، trueBalance=(completed−chargeRed)−allocated+rfe).
 *    لو انحرفت عن الكانوني صامتاً → اللوحة الرئيسية تعرض رصيداً مختلفاً
 *    عن ملف المريض/لائحته لنفس المريض. نستخرجها (async → نعيد الكلمة)،
 *    نشغّلها بـsb وهمي (.select().eq().in() على 4 جداول) على نفس
 *    سيناريوهات بلوك D، ونقارن trueBalance/allocated/unearned/
 *    completedTotal/chargeReductions مع مخرج computeFinancials.
 *    (اللوحة لا تحسب plannedTotal فمستثنى من المقارنة.)
 * =================================================================== */
const dashSrc = 'async ' + extractFunction(read('index.html'), 'computeDashFinancials');
function mkSbDash(rowsByTable) {
  return { from(t) { return { select() { return { eq() { return {
    in() { return Promise.resolve({ data: rowsByTable[t] || [], error: null }); }
  }; } }; } }; } };
}
async function runDashFin(sc) {
  const pid = 'PT1';
  const rows = {
    ledger_sessions:     (sc.sessions    || []).map(s  => ({ id: s.id, patient_id: pid, cost: s.cost, status: s.status })),
    ledger_payments:     (sc.payments    || []).map(p  => ({ patient_id: pid, amount: p.amount })),
    payment_splits:      (sc.splits      || []).map(sp => ({ patient_id: pid, session_id: sp.session_id, amount: sp.amount, is_unearned: sp.is_unearned })),
    account_adjustments: (sc.adjustments || []).map(a  => ({ patient_id: pid, kind: a.kind, amount: a.amount }))
  };
  const sandbox = { window: { sb: mkSbDash(rows) }, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(dashSrc + '\nthis.__d = computeDashFinancials("DR1", ["' + pid + '"]);', sandbox);
  const res = await sandbox.__d;
  return (res && res.map) ? res.map[pid] : null;
}

/* الذيل async: بلوكا F+G ثم الملخّص النهائي (يعيدان استخدام سيناريوهات بلوك D) */
(async () => {
  console.log('F) تكافؤ صيغة الرصيد — patients.html ⇔ patient-profile.html:');
  for (const [name, sc] of FIN_VECTORS) {
    try {
      const prof = runFin(sc);              /* ملف المريض  (computeFinancials) */
      const bat  = await runBatchFin(sc);   /* قائمة المرضى (loadFinancials)   */
      const pairs = [
        ['trueBalance',    prof.trueBalance,           bat.trueBalance],
        ['allocated',      prof.allocatedToProduction, bat.allocated],
        ['unearned',       prof.unearnedCredit,        bat.unearned],
        ['completedTotal', prof.completedTotal,        bat.completedTotal],
        ['plannedTotal',   prof.plannedTotal,          bat.plannedTotal]
      ];
      let err = null;
      for (const [f, a, b] of pairs) if (!eqN(a, b)) { err = f + ': ملف=' + a + ' ≠ قائمة=' + b; break; }
      if (err) bad('تكافؤ ' + name + '  [' + err + ']');
      else ok('تكافؤ ' + name);
    } catch (e) { bad('تكافؤ ' + name + '  [استثناء: ' + (e && e.message) + ']'); }
  }

  console.log('G) تكافؤ رصيد اللوحة الرئيسية — index.html ⇔ patient-profile.html:');
  for (const [name, sc] of FIN_VECTORS) {
    try {
      const prof = runFin(sc);              /* الكانوني (computeFinancials)      */
      const dash = await runDashFin(sc);    /* اللوحة   (computeDashFinancials)  */
      const pairs = [
        ['trueBalance',      prof.trueBalance,           dash.trueBalance],
        ['allocated',        prof.allocatedToProduction, dash.allocated],
        ['unearned',         prof.unearnedCredit,        dash.unearned],
        ['completedTotal',   prof.completedTotal,        dash.completedTotal],
        ['chargeReductions', prof.chargeReductions,      dash.chargeReductions]
      ];
      let err = null;
      for (const [f, a, b] of pairs) if (!eqN(a, b)) { err = f + ': ملف=' + a + ' ≠ لوحة=' + b; break; }
      if (err) bad('تكافؤ اللوحة ' + name + '  [' + err + ']');
      else ok('تكافؤ اللوحة ' + name);
    } catch (e) { bad('تكافؤ اللوحة ' + name + '  [استثناء: ' + (e && e.message) + ']'); }
  }

  /* ===================================================================
   * P) الطبقة المخطَّطة وحدها لا تصنع «حساباً ثانياً» — v337.
   *    بلاغ المالك: مريضٌ حسابُه بالليرة + جلسةٌ «مخطّطة» بالدولار ⇒ الصناديق
   *    الثلاثة عرضت «0 $» و«لا علاج منجز $». العقد: dual يشترط حركةً ماليةً
   *    فعلية بالطبقتين (المخطّط تقديرٌ خارج الرصيد)، وcur يتبع الطبقة ذات
   *    الحركة المالية، ويبقى سلوك «مخطّط وحده» السابق حين لا مال بأيٍّ منهما.
   *    التطبيقات الثلاثة (الملف · القائمة · اللوحة) تُشغَّل حيّةً بالعملة.
   * =================================================================== */
  console.log('P) المخطَّط وحده لا يصنع طبقةً ثانية — الملف ⇔ القائمة ⇔ اللوحة:');
  let PLAN_LAYER_CHECKS = 0;
  {
    const U = 'USD', S = 'SYP';
    const sS = (id, cost, st, cur) => ({ id, cost, status: st || 'completed', currency: cur || S });
    const PV = [
      ['P1 ليرة منجزة/مدفوعة + دولار مخطّط وحده (البلاغ)',
        { sessions: [sS('A', 2829500), sS('B', 95, 'planned', U)], payments: [{ amount: 2810000, currency: S }] },
        { dual: false, cur: S, trueBalance: 19500 }],
      ['P2 دولار منجز + ليرة مخطّطة وحدها ⇒ الطبقة المعروضة دولار',
        { sessions: [sS('A', 100, 'completed', U), sS('B', 5000, 'planned', S)], payments: [{ amount: 40, currency: U }] },
        { dual: false, cur: U, trueBalance: 60 }],
      ['P3 حركة مالية بالطبقتين ⇒ ثنائي',
        { sessions: [sS('A', 1000), sS('B', 50, 'completed', U)], payments: [] },
        { dual: true, cur: S, trueBalance: 1000 }],
      ['P4 دولار مخطّط وحده بلا أي مال ⇒ السلوك السابق (cur دولار)',
        { sessions: [sS('B', 95, 'planned', U)], payments: [] },
        { dual: false, cur: U, trueBalance: 0 }],
      ['P5 مخطّط بالعملتين بلا مال ⇒ ليرة، غير ثنائي',
        { sessions: [sS('A', 500, 'planned'), sS('B', 95, 'planned', U)], payments: [] },
        { dual: false, cur: S, trueBalance: 0 }],
      ['P6 دفعة دولار مقدّمة بلا جلسة + ليرة منجزة ⇒ ثنائي (الدفعة مال)',
        { sessions: [sS('A', 1000)], payments: [{ amount: 30, currency: U }] },
        { dual: true, cur: S, trueBalance: 1000 }],
      ['P7 تقسيمٌ دولاري على جلسة مخطّطة + ليرة منجزة ⇒ ثنائي (رصيد مقدّم)',
        { sessions: [sS('A', 1000), sS('B', 95, 'planned', U)], payments: [{ amount: 20, currency: U }],
          splits: [{ session_id: 'B', amount: 20, is_unearned: false, currency: U }] },
        { dual: true, cur: S, trueBalance: 1000 }]
    ];
    for (const [name, sc, exp] of PV) {
      const pid = 'PT1';
      const rowsS = sc.sessions.map(x => ({ id: x.id, patient_id: pid, cost: x.cost, status: x.status, currency: x.currency, date: '2026-01-01', description: '' }));
      const rowsP = sc.payments.map(x => ({ patient_id: pid, amount: x.amount, currency: x.currency }));
      const rowsSp = (sc.splits || []).map(x => Object.assign({ patient_id: pid }, x));
      const prof = runFin(sc);
      const sbB = { window: { sb: mkSb({ ledger_sessions: rowsS, ledger_payments: rowsP, payment_splits: rowsSp, account_adjustments: [] }) },
                    patients: [{ id: pid }], finMap: {}, lastVisitMap: {}, console: { warn() {} } };
      vm.createContext(sbB); vm.runInContext(finBatchSrc + '\nthis.__p = loadFinancials();', sbB); await sbB.__p;
      const bat = sbB.finMap[pid];
      const sbD = { window: { sb: mkSbDash({ ledger_sessions: rowsS, ledger_payments: rowsP, payment_splits: rowsSp, account_adjustments: [] }) }, console: { warn() {} } };
      vm.createContext(sbD); vm.runInContext(dashSrc + '\nthis.__d = computeDashFinancials("DR1", ["' + pid + '"]);', sbD);
      const dash = (await sbD.__d).map[pid];
      const errs = [];
      for (const [who, o] of [['ملف', prof], ['قائمة', bat], ['لوحة', dash]]) {
        if (o.dual !== exp.dual) errs.push(who + '.dual=' + o.dual);
        if (o.cur !== exp.cur)   errs.push(who + '.cur=' + o.cur);
        if (!eqN(o.trueBalance, exp.trueBalance)) errs.push(who + '.trueBalance=' + o.trueBalance);
      }
      PLAN_LAYER_CHECKS++;
      if (errs.length) bad(name + '  [' + errs.join(' · ') + ']'); else ok(name);
    }
  }

  /* ===================================================================
   * Q) شارة الدفع بقائمة المرضى — v339/v340/v341.
   *    بلاغا المالك: «متبقي ل.س · 619,000 ل.س» (v339) ثم «كلمة متبقي وحدة مع
   *    العملتين» (v340) ثم «الدولار ببادج لحالو» (v341). payBadgeHtml الحيّة
   *    تُقيَّم: الحالة نفسها ⇒ الكلمة مرة واحدة وكل عملة بشارتها بنفس اللون؛ الحالتان مختلفتان ⇒ شارتان، وبلا
   *    مبلغ («مسدّد $») بوسمها؛ وlabel/extra محفوظان لتصدير Excel.
   * =================================================================== */
  console.log('Q) شارة الدفع بقائمة المرضى — كلمة واحدة وكل عملة مرة واحدة:');
  try {
    const pS = read('patients.html');
    const bg = (tb, un, ct) => ({ trueBalance: tb, unearned: un, completedTotal: ct });
    const sbQ = { fmt: v => String(v), finMap: {
      A: { dual: true, cur: 'SYP', bags: { SYP: bg(619000, 0, 1), USD: bg(90, 0, 1) } },
      B: { dual: true, cur: 'SYP', bags: { SYP: bg(520000, 0, 1), USD: bg(0, 0, 50) } },
      C: { dual: true, cur: 'SYP', bags: { SYP: bg(0, 0, 10), USD: bg(0, 0, 5) } },
      D: { dual: true, cur: 'SYP', bags: { SYP: bg(0, 5000, 0), USD: bg(0, 20, 0) } },
      E: { dual: false, cur: 'SYP', bags: { SYP: bg(19500, 0, 1), USD: bg(0, 0, 0) } } } };
    vm.createContext(sbQ);
    vm.runInContext(['payInfoBag', 'payInfo', 'payBadgeHtml'].map(n => extractFunction(pS, n)).join('\n')
      + ';this.go=id=>payBadgeHtml(payInfo({id})).replace(/<span class="badge ([a-z]+)">/g,"[$1]").replace(/<\\/span>/g,"").replace(/\\s+/g," ").trim();', sbQ);
    const want = {
      A: '[red]متبقي · 619000 ل.س [red]90 $',
      B: '[red]متبقي · 520000 ل.س [green]مسدّد $',
      C: '[green]مسدّد',
      D: '[blue]دفع مقدم · 5000 ل.س [blue]20 $',
      E: '[red]متبقي · 19500 ل.س'
    };
    for (const k of Object.keys(want)) {
      const got = sbQ.go(k);
      if (got === want[k]) ok('Q-' + k + ' ' + want[k]); else bad('Q-' + k + ' متوقَّع ' + J(want[k]) + ' — الناتج ' + J(got));
    }
    const pA = vm.runInContext('payInfo({id:"A"})', sbQ);
    if (pA.label === 'متبقي ل.س' && pA.extra && pA.extra.label === 'متبقي $') ok('Q-X وسم label/extra محفوظ لتصدير Excel');
    else bad('Q-X label/extra تغيّر: ' + J([pA.label, pA.extra && pA.extra.label]));
    if (/\$\{payBadgeHtml\(pi\)/.test(pS)) ok('Q-T قالب الجدول يمرّ عبر payBadgeHtml');
    else bad('Q-T قالب الجدول لا يستعمل payBadgeHtml');
  } catch (e) { bad('Q) فشل فحص الشارة: ' + (e && e.message)); }

  /* ===================================================================
   * M) طبقة القسمة بالعملة — M125 (accounting.html + provider-reports.html).
   *    العقد: المحرّكات الحرفية تعمل داخل شرائح عملة بتبديل/إرجاع المصفوفات
   *    العامة (computeLayersByCurrency / withCurrencyLayer) — صفر جمع عابر
   *    للعملات. متجه مخلوط دائم يثبّت: (١) عزل الطبقتين — طبقة ل.س بالمخلوط
   *    تساوي المحرّك المباشر على صفوف ل.س وحدها، فأي تسرّب دولاري يكسر
   *    المساواة فوراً؛ (٢) orphan بمستوى (مريض، عملة): دفعة legacy دولارية
   *    لمريض جلساتُه بالليرة تسقط بـ«غير محدد» بطبقة الدولار حفظاً لـTest A
   *    داخل كل طبقة؛ (٣) الإرجاع الكامل للمصفوفات بعد القسمة. نزع فلتر
   *    العملة أو نزع الإرجاع يكسر هذه التوكيدات (مثبَت بطفرات جلسة البناء).
   * =================================================================== */
  console.log('M) طبقة القسمة بالعملة (M125) — عزل الطبقتين وحفظ Test A داخل كل عملة:');
  let CURLAYER_CHECKS = 0;
  try {
    const accS = read('accounting.html');
    const mNames = ['splitIsEarned','computeSummary','computeExpenseTotals','computeExpenseBreakdown',
                    'computeOneProviderRow','computeProviderPerformance','runIdentityTests',
                    'computeAdjustmentTotals','_rowCur','_filterCur','computeLayersByCurrency'];
    const mCode = mNames.map(n => extractFunction(accS, n)).join('\n');
    /* عملةُ العيادة تُمرَّر لأن ترتيبَ الطبقات يتبعها (سابقة v200)؛ والكيسُ
     * المشترك يُحقَن حيّاً من الأصل نفسه كي لا يصير المثبت نسخةً ثانية. */
    const mkAcc = (rows, def) => {
      const sb = Object.assign({
        sessions: [], payments: [], paymentSplits: [], expenses: [], payouts: [],
        labOrders: [], adjustments: [], doctors: [{ id: 'd1', name: 'x' }], expenseCategories: [],
        splitSessionStatus: {}, materialCostBag: { SYP: 0, USD: 0 }, labPayableBag: null,
        curLbl: () => ((def === 'USD') ? '$' : 'ل.س'),
        window: { SyDentCurrency: { code: () => (def || 'SYP'),
                                    labelOf: c => ((c === 'USD') ? '$' : 'ل.س') } }
      }, rows);
      vm.createContext(sb); vm.runInContext(curBagSrc + '\n' + mCode, sb); return sb;
    };
    const mSyp = {
      sessions: [{ id: 's1', patient_id: 'p1', provider_id: 'd1', cost: 100000, status: 'completed', currency: 'SYP' }],
      payments: [{ id: 'pay1', patient_id: 'p1', amount: 60000, currency: 'SYP' }],
      paymentSplits: [{ payment_id: 'pay1', session_id: 's1', provider_id: 'd1', amount: 60000, is_unearned: false, currency: 'SYP' }],
      splitSessionStatus: { s1: 'completed' }
    };
    const mMixed = {
      sessions: mSyp.sessions.slice(),
      payments: mSyp.payments.concat([{ id: 'upay', patient_id: 'p1', amount: 75, currency: 'USD' }]),
      paymentSplits: mSyp.paymentSplits.slice(),
      splitSessionStatus: mSyp.splitSessionStatus
    };
    const mL = vm.runInContext('computeLayersByCurrency()', mkAcc(mMixed));
    const mDirect = vm.runInContext('computeSummary()', mkAcc(mSyp));
    if (JSON.stringify(mL.SYP.summary) === JSON.stringify(mDirect)) ok('عزل طبقة ل.س بالمخلوط (صفر تلوّث دولاري)');
    else bad('عزل طبقة ل.س: التسرّب بين العملات عاد');
    CURLAYER_CHECKS++;
    const mUn = (mL.USD.providerRows || []).find(r => r.id === '_unassigned');
    if (mUn && Math.abs(mUn.collection - 75) < 1e-9) ok('orphan (مريض، عملة): legacy الدولاري بـ«غير محدد» بطبقة $');
    else bad('orphan (مريض، عملة) انكسر');
    CURLAYER_CHECKS++;
    if (mL.SYP.identities.concat(mL.USD.identities).every(t => t.pass)) ok('Tests A–E خضراء داخل كل طبقة');
    else bad('اختبار هوية انكسر داخل طبقة عملة');
    CURLAYER_CHECKS++;
    const mSb2 = mkAcc(mMixed);
    vm.runInContext('computeLayersByCurrency()', mSb2);
    if (mSb2.payments.length === 2 && mSb2.sessions.length === 1) ok('إرجاع المصفوفات الكاملة بعد القسمة');
    else bad('إرجاع المصفوفات بعد القسمة انكسر');
    CURLAYER_CHECKS++;
    /* ترتيبُ الطبقات يتبع عملة العيادة لا قائمةً مثبّتة (سابقة v200)، وهو
     * عرضٌ صرف: الأرقامُ نفسها بالوضعين. نزعُ اشتقاق الترتيب يعيد الليرة
     * أولاً بعيادةٍ دولارية فتعضّ هذه المتجهات (مثبَت بطفراتٍ ثلاث). */
    const mOrdS = vm.runInContext('computeLayersByCurrency()._active', mkAcc(mMixed, 'SYP'));
    const mOrdU = vm.runInContext('computeLayersByCurrency()._active', mkAcc(mMixed, 'USD'));
    if (JSON.stringify(mOrdS) === '["SYP","USD"]' && JSON.stringify(mOrdU) === '["USD","SYP"]')
      ok('ترتيب طبقات المحاسبة يتبع عملة العيادة (ل.س ⇒ الليرة أولاً · $ ⇒ الدولار أولاً)');
    else bad('ترتيب طبقات المحاسبة لا يتبع عملة العيادة: ' + JSON.stringify(mOrdS) + ' · ' + JSON.stringify(mOrdU));
    CURLAYER_CHECKS++;
    const mLU = vm.runInContext('computeLayersByCurrency()', mkAcc(mMixed, 'USD'));
    if (JSON.stringify(mLU.SYP.summary) === JSON.stringify(mL.SYP.summary) &&
        JSON.stringify(mLU.USD.summary) === JSON.stringify(mL.USD.summary))
      ok('الترتيب عرضٌ صرف: أرقام الطبقتين لا تتحرك بتغيّر عملة العيادة');
    else bad('تغيّر عملة العيادة حرّك رقماً — الترتيب لم يعد عرضاً صرفاً');
    CURLAYER_CHECKS++;
    const prS = read('provider-reports.html');
    const prOrdCode = ['_rowCur', '_activeCursPR'].map(n => extractFunction(prS, n)).join('\n');
    const mkPROrd = (def) => {
      const sb = { sessions: mMixed.sessions.slice(), payments: mMixed.payments.slice(),
        paymentSplits: mMixed.paymentSplits.slice(), labOrders: [], payouts: [],
        window: { SyDentCurrency: { code: () => def, labelOf: c => c } } };
      vm.createContext(sb); vm.runInContext(curBagSrc + '\n' + prOrdCode, sb);
      return vm.runInContext('_activeCursPR()', sb);
    };
    if (JSON.stringify(mkPROrd('SYP')) === '["SYP","USD"]' && JSON.stringify(mkPROrd('USD')) === '["USD","SYP"]')
      ok('تقارير الأطباء: ترتيب الطبقات يتبع عملة العيادة');
    else bad('تقارير الأطباء: ترتيب الطبقات لا يتبع عملة العيادة');
    CURLAYER_CHECKS++;
    const prNames = ['splitIsEarned','providerLabCost','computeProviderStats','_rowCur','_filterCur','withCurrencyLayer'];
    const prCode = prNames.map(n => extractFunction(prS, n)).join('\n') + '\nvar _renderCur = null;';
    const prSb = {
      sessions: mMixed.sessions.slice(), payments: mMixed.payments.slice(),
      paymentSplits: mMixed.paymentSplits.slice(), labOrders: [], payouts: [],
      splitSessionStatus: { s1: 'completed' }, curLbl: () => 'ل.س'
    };
    vm.createContext(prSb); vm.runInContext(prCode, prSb);
    const prStats = vm.runInContext("(function(){ var r; withCurrencyLayer('SYP', function(){ r = computeProviderStats('d1'); }); return r; })()", prSb);
    if (Math.abs(prStats.collection - 60000) < 1e-9 && prSb.payments.length === 2)
      ok('provider-reports: الغلاف يعزل ويعيد (تحصيل ل.س بلا الدفعة الدولارية)');
    else bad('provider-reports: غلاف العملة انحرف');
    CURLAYER_CHECKS++;
  } catch (e) { bad('طبقة القسمة: استثناء — ' + (e && e.message)); }

  /* ── v269: مداخل دفعات الصلاحية (inventory.html) — حمولة واحدة لكل إدراج ──
     الدفعة تُخلق من ثلاثة أبواب (شراء · رصيد افتتاحي · رصيد حالي)؛ لو كتب أحدها
     الحمولة بيده انحرف عن الباقين بصمت (تاريخٌ بلا كمية مثلاً). */
  try {
    const invS = fs.readFileSync(path.join(ROOT, 'inventory.html'), 'utf8');
    const ins = invS.match(/from\('inventory_batches'\)\.insert\(([^;]*)\)/g) || [];
    const stray = ins.filter(x => !/\.insert\(batchPayload\(/.test(x));
    if (ins.length >= 3 && stray.length === 0) ok('المخزون: ' + ins.length + ' مداخل إدراج دفعة كلها عبر batchPayload');
    else bad('المخزون: إدراج دفعة خارج batchPayload — ' + (stray.length ? stray.join(' | ') : ('عدد المداخل ' + ins.length + ' < 3')));
    const bp = extractFunction(invS, 'batchPayload');
    if (/owner_id: currentUser\.id, item_id: itemId, quantity: q, expiry_date: expVal, note: note/.test(bp)) ok('المخزون: حمولة الدفعة = المالك + الصنف + الكمية + الصلاحية + الملاحظة');
    else bad('المخزون: حمولة batchPayload تغيّرت');
  } catch (e) { bad('المخزون: فشل فحص دفعات الصلاحية — ' + (e && e.message)); }

  /* ── M147: حالةُ الطبيب بمكانين (حساب الموظف + بطاقة الطبيب) — التريغر يُبقيهما متطابقين ──
     البلاغ: طبيبٌ عُطّل حسابُه بقي قابلاً للاختيار بكل منتقٍ يقرأ clinic_doctors.is_active.
     القفل: (١) آخرُ ترحيلٍ يذكر التريغر يُنشئه ولا يُسقطه · (٢) الدالة تستثني المالك وتحصر
     العيادة · (٣) منتقياتُ بطاقة المريض تفلتر الفعّالين، وحلُّ الاسم التاريخي يقرأ الكلّ. */
  try {
    const migDir = path.join(ROOT, 'migrations');
    const hits = fs.readdirSync(migDir).filter(f => /^\d+_.*\.sql$/.test(f))
      .filter(f => fs.readFileSync(path.join(migDir, f), 'utf8').indexOf('trg_sync_doctor_card_active') >= 0)
      .sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
    if (!hits.length) bad('مزامنة بطاقة الطبيب: لا ترحيلَ يعرّف trg_sync_doctor_card_active');
    else {
      const sql = fs.readFileSync(path.join(migDir, hits[hits.length - 1]), 'utf8');
      const creates = /CREATE TRIGGER trg_sync_doctor_card_active[\s\S]{0,160}?ON public\.clinic_employees/.test(sql);
      const covers  = /AFTER INSERT OR UPDATE OF is_active, doctor_id/.test(sql);
      // جسمُ الدالة وحده — تعليقُ التحقق بذيل الملف يحمل العبارة نفسها فيُخفي حذفها (كُشف بطفرة)
      const f0 = sql.indexOf('CREATE OR REPLACE FUNCTION public.sync_doctor_card_active');
      const fnBody = f0 >= 0 ? sql.slice(f0, sql.indexOf('$function$;', f0)) : '';
      const ownerEx = /cd\.is_owner IS NOT TRUE/.test(fnBody);
      const scoped  = /cd\.owner_id = NEW\.owner_id/.test(fnBody);
      const ppc = read('pp-core.js');
      const keepsAll   = /window\.CLINIC_DOCTORS_ALL = dRes\.data;/.test(ppc);
      const filtersAct = /CLINIC_DOCTORS = dRes\.data\.filter\(function\(d\)\{ return d\.is_active !== false; \}\);/.test(ppc);
      const tl = read('pp-timeline.js');
      const tlAll = (tl.match(/window\.CLINIC_DOCTORS_ALL \|\| CLINIC_DOCTORS/g) || []).length >= 2;
      if (creates && covers && ownerEx && scoped && keepsAll && filtersAct && tlAll)
        ok('مزامنة بطاقة الطبيب: التريغر قائم بـ' + hits[hits.length - 1] + ' (تفعيل + ربط · المالك مستثنى · العيادة محصورة) · المنتقيات للفعّالين وحلُّ الاسم من الكلّ');
      else bad('مزامنة بطاقة الطبيب: ' + J({ creates, covers, ownerEx, scoped, keepsAll, filtersAct, tlAll }));
    }
  } catch (e) { bad('مزامنة بطاقة الطبيب: فشل الفحص — ' + (e && e.message)); }

  /* ── v429: القلع المخطّط — فصلُ الرسم عن الأهلية ─────────────────────────
     isExtracted() مسندُ الأهلية (جسور · زرع · بريو · منتقيات) ويجب أن يبقى عمياءَ عن الحالة
     حرفياً؛ الراسمُ وحده (الحلقة الوجهية + الإطباقي) يسأل isExtractionDone(). أيُّ إعادةٍ
     لـisExtracted بحلقة الرسم تُعيد شبحَ السن المخطّط قلعه، وأيُّ حالةٍ بمسند الأهلية تكسر
     تخطيط الزراعة على قلعٍ مخطّط. */
  try {
    const pd = read('pp-dental.js');
    const isExSrc = /function isExtracted\(num\) \{\n  var sm = teethMap\[String\(num\)\] \|\| \{\};\n  if \(isExtractionKey\(sm\.WHOLE\)\) return true;\n  \/\/ Legacy: any surface marked as extracted\n  for \(var k in sm\) \{\n    if \(isExtractionKey\(sm\[k\]\)\) return true;\n  \}\n  return false;\n\}/.test(pd);
    const helpers = /function isExtractionPlanned\(num\)/.test(pd) && /function isExtractionDone\(num\)/.test(pd)
      && /function extractionStatusIsOpen\(st\) \{ return st === 'planned' \|\| st === 'referred'; \}/.test(pd);
    const facialLoop = (pd.match(/else if \(isExtractionDone\((un|ln)\)\) (u|l)Html \+= buildExtractedPlaceholder\(/g) || []).length === 2
      && !/else if \(isExtracted\((un|ln)\)\) (u|l)Html \+= buildExtractedPlaceholder\(/.test(pd);
    const occ = /var isExtract=isExtractionKey\(whole\)&&!occPlannedX/.test(pd) && /if\(occPlannedX\)\{[^\n]*planned-x[^\n]*pointer-events=[^\n]*none/.test(pd);
    const facialX = /var _pxSt = \(hasWhole && isExtractionKey\(wholeT\) && sm\.__status\) \? sm\.__status\.WHOLE : null;/.test(pd)
      && /if \(_pxSt && extractionStatusIsOpen\(_pxSt\)\) \{/.test(pd);
    const noHardColor = /function plannedExtractionMarkColor\(st\) \{\n[^\n]*STATUS_COLORS\[st\] \|\| STATUS_COLORS\.planned/.test(pd);
    const eligibilityIntact = /if \(tp === 'implant'\) return \{ ok: false, msg: 'سن قائم — الزراعة تُخطَّط على موقع مقلوع \(سجّل القلع أولاً ولو مخططاً\)' \};/.test(read('pp-modules.js'));
    if (isExSrc && helpers && facialLoop && occ && facialX && noHardColor && eligibilityIntact)
      ok('القلع المخطّط: isExtracted عمياءُ الحالة حرفياً · الحلقة الوجهية والإطباقي يسألان isExtractionDone · ✕ بلون الحالة بالمنظرين · أهليةُ الزراعة على القلع المخطّط قائمة');
    else bad('القلع المخطّط: ' + J({ isExSrc, helpers, facialLoop, occ, facialX, noHardColor, eligibilityIntact }));
  } catch (e) { bad('القلع المخطّط: فشل الفحص — ' + (e && e.message)); }

  /* ── v430 (M152): مكتبةُ الحالات السريرية — صفرُ أثرٍ مالي وسطحٌ لا يزاحم ───────
     الخطرُ المحروس هنا ثلاثة: (1) مفتاحُ حالةٍ يتسرّب بحالةٍ غير 'condition' فيصير
     سطراً مالياً؛ (2) مسارُ الدفعة يُدرج سطرَ سجلٍّ بلا بوابةِ حالة (كان كذلك قبل
     v430)؛ (3) حالةُ السن تُرسى على WHOLE فتدهس القلع/الزرع/الأشعة. */
  try {
    const pd = read('pp-dental.js');
    const core = read('pp-core.js');
    const lib = /var COND_DEFS = \[([\s\S]*?)\n\];/.exec(pd);
    const libOk = !!lib && (lib[1].match(/\bid:'cond-/g) || []).length === 10   /* C3: +غير بازغ */
      && !/price\s*:\s*[1-9]/.test(/var COND_LIBRARY = COND_DEFS\.map[\s\S]*?\}\);/.exec(pd)[0]);
    const chokeOk = /return \(typeof getCondition === 'function'\) \? getCondition\(id\) : null;/.test(core)
      && /for \(var i=0; i<TREATMENTS\.length; i\+\+\) if \(TREATMENTS\[i\]\.id === id\) return TREATMENTS\[i\];/.test(core);
    const normOk = /function condNormalizePending\(\) \{\n  if \(!isConditionKey\(pendingToothStatus\)\) return false;\n  pendingTreatStatus = 'condition';/.test(pd)
      && /if \(condNormalizePending\(\)\) cost = 0;/.test(pd);
    const pickOk = /if \(isConditionKey\(pendingToothStatus\) && s !== 'condition'\) \{/.test(pd);
    const batchOk = (function(){
      const i = pd.indexOf("if (isConditionKey(pendingToothStatus)) { _bCreated++; continue; }");
      const j = pd.indexOf("from('ledger_sessions').insert({", i);
      return i > 0 && j > i;
    })();
    const surfaceOk = /if \(tr && tr\.cond_scope === 'tooth'\) currentSurface = COND_SURFACE;/.test(pd)
      && /var COND_SURFACE = 'COND';/.test(pd);
    const ledgerKeyOk = (pd.match(/treatment_key: getTreatment\(pendingToothStatus\) \? pendingToothStatus : null,   \/\/ v260/g) || []).length === 3;
    const watchOk = /if \(s === COND_SURFACE \|\| isConditionKey\(teethMap\[n\]\[s\]\)\) return;/.test(pd)
      && /if \(s === COND_SURFACE \|\| isConditionKey\(teethMap\[tn\]\[s\]\)\) return false;/.test(pd);
    const migOk = /'COND'::text/.test(read('migrations/152_teeth_status_condition_surface.sql'));
    /* v431 (تدقيقُ المسارات): أربعةُ مساراتٍ أغلقها الفحصُ اللاحق — لا تُفتح بصمت */
    const surfGuardOk = /function condSurfaceConflict\(num, surf\)\{?/.test(pd)
      && /var _cfK = condSurfaceConflict\(currentTooth, currentSurface\);/.test(pd)
      && (function(){ const i = pd.indexOf('var _cfK = condSurfaceConflict'), j = pd.indexOf('// Normal save — DB constraint now accepts all valid surface values'); return i > 0 && j > i; })();
    const fadeOk = /if \(status === 'condition' && condOnlyLibraryRows\(num\)\) continue;/.test(pd)
      && /st==='condition'\) op=\(condOnlyLibraryRows\(num\)\?1:0\.45\)/.test(pd);
    const lockOk = (function(){ const h = pd.slice(pd.indexOf('async function openToothModal(n, surface)'), pd.indexOf('async function openToothModal(n, surface)') + 900); return /condLockStatusPicker\(false\)/.test(h); })();
    const waOk = (function(){ const w = read('pp-wa.js'); const i0 = w.indexOf('function ppCollectWatches'); if (i0 < 0) return false; const f = w.slice(i0, i0 + 1600); return /s === COND_SURFACE/.test(f) && /isConditionKey\(teethMap\[n\]\[s\]\)/.test(f); })();
    const labParityOk = /if \(typeof condNormalizePending === 'function'\) condNormalizePending\(\);/.test(read('pp-clinical.js'));
    /* v433: الفحصُ الأولي — المكتبةُ بصفٍّ مستقل، والوسمُ يفرض الحالةَ والسطحَ ولا يكتب موعداً */
    /* v434: نطاقُ كلِّ حالةٍ يتبع تشريحَها — لا إرساءَ قسريٍّ على COND ولا مركزَ تاجٍ دائماً */
    const scopeOk = (function(){
      const d = /var COND_DEFS = \[([\s\S]*?)\n\];/.exec(pd);
      if (!d) return false;
      const b = d[1];
      const line = (id) => (b.split('\n').find(l => l.indexOf("id:'" + id + "'") >= 0) || '');
      return /scope:'both'/.test(line('cond-fracture'))
        && /scope:'surface'/.test(line('cond-calculus'))
        && /scope:'surface'/.test(line('cond-recession'))
        && /scope:'surface'/.test(line('cond-sensitivity'))
        && /scope:'tooth'/.test(line('cond-abscess')) && /anchor:'apex'/.test(line('cond-abscess'))
        && /only:\['M','D'\]/.test(line('cond-open-contact'))
        && /function condAnchorFor\(anat, key, def\)/.test(pd)
        && /if \(\/\^R\[123\]\$\/\.test\(key\)\)/.test(pd)
        && /function condSurfaceNotAllowed\(def, surf\)/.test(pd)
        && /var _onlyMsg = condSurfaceNotAllowed\(_cdDef, currentSurface\);/.test(pd)
        && /else if \(currentSurface === 'WHOLE' \|\| currentSurface === 'CROWN_FULL' \|\| !currentSurface\) currentSurface = COND_SURFACE;/.test(pd);
    })();
    /* v435: حالتان تغيّران تشريحَ الرسم — والتسمياتُ العلمية */
    const anatOk = (function(){
      const d = /var COND_DEFS = \[([\s\S]*?)\n\];/.exec(pd);
      if (!d) return false;
      const b = d[1];
      return /name:'انحسار لثوي'/.test(b) && !/ارتداد/.test(b) && /name:'حساسية عاجية'/.test(b)
        && /draw:'gum'/.test(b) && /draw:'no-crown'/.test(b)
        && /function condDrawFlag\(sm, flag\)/.test(pd)
        && /var COND_GUM_SHIFT = 12;/.test(pd)
        && /var gumY = anat\.cervicalY \+ \(condDrawFlag\(sm, 'gum'\) \? COND_GUM_SHIFT : 0\);/.test(pd)
        && /var _noCrown = condDrawFlag\(sm, 'no-crown'\);\n  if \(!_noCrown\) \{/.test(pd)
        && /cond_draw === 'no-crown'\) \{[\s\S]{0,400}stroke-dasharray="4 3"/.test(pd);
    })();
    /* v436: اتجاهُ مثلث الانحسار التشريحي · إزاحةُ المنطمر وتصغيرُ ظلّه الإطباقي */
    const drawOk = (function(){
      if (!/symbol:'chevron'[\s\S]{0,60}anchor:'cej'/.test(pd)) return false;
      if (/cond_follow/.test(pd)) return false;                       /* v437: أُلغي استثناءُ القلب */
      if (!/var COND_IMPACT_SHIFT = 26;/.test(pd)) return false;
      if (!/var COND_IMPACT_OCC_SCALE = 0\.5;/.test(pd)) return false;
      if (!/var _impMax = Math\.max\(0, 206 - \(anat\.rootBot \|\| 190\)\);/.test(pd)) return false;
      if (!/Math\.min\(COND_IMPACT_SHIFT, _impMax\)/.test(pd)) return false;
      if (!/def\.cond_anchor === 'cej'/.test(pd)) return false;
      /* الرموزُ لا تُرسم إطباقياً: نداءا conditionSymbolSvg الباقيان هما الوجهي واللافتة */
      if ((pd.match(/conditionSymbolSvg\(/g) || []).length !== 3) return false;
      /* والأهم — ترتيبُ فرعَي الإطباقي: قبل أولِ خطٍّ يُرسم (المينا)، وإغلاقُ المجموعة أخيراً */
      var f = pd.indexOf('function buildOcclusalTooth');
      var seg = pd.slice(f, pd.indexOf('\nfunction ', f + 10));
      var iRet = seg.indexOf("cond_draw === 'no-crown'");
      var iImp = seg.indexOf("var _occImp = condDrawFlag(sm, 'impacted')");
      var iEnamel = seg.indexOf("fill=\"url(#en'+gid+')\"");
      var iClose = seg.indexOf("if (_occImp) svg+='</g>';");
      var iSvgEnd = seg.indexOf("svg+='</svg>';", iClose);
      return iRet > 0 && iImp > iRet && iEnamel > iImp && iClose > iEnamel && iSvgEnd > iClose;
    })();
    /* C3 (v489): «غير بازغ» — بمكانه باهتاً بحدٍّ منقّط، ورمزُه خارج التعتيم، ويُستثنى من البريو */
    const uneruptedOk = (function(){
      const d = /var COND_DEFS = \[([\s\S]*?)\n\];/.exec(pd);
      if (!d) return false;
      const line = d[1].split('\n').find(l => l.indexOf("id:'cond-unerupted'") >= 0) || '';
      if (!(/scope:'tooth'/.test(line) && /draw:'unerupted'/.test(line) && /perio:'skip'/.test(line))) return false;
      if (!/var COND_UNERUPTED_OPACITY = 0\.38;/.test(pd)) return false;
      if (!/function condPerioSkip\(sm\)/.test(pd)) return false;
      /* الوجهي: المجموعةُ الباهتة تُفتح بعد مجموعة السن وتُغلق قبل طبقة الرموز */
      const f = pd.indexOf('function buildTooth(num, surfaceMap, isUpper)');
      const seg = pd.slice(f, pd.indexOf('\nfunction ', f + 10));
      const iOpen = seg.indexOf("if (_unerupted) svg += '<g class=\"tooth-unerupted\"");
      const iClose = seg.indexOf("svg += '</g>';   /* C3: نهايةُ الجسم الباهت */");
      const iSym = seg.indexOf('/* v430: رموزُ الحالات السريرية');
      const iX = seg.indexOf('var _pxSt');
      if (!(iOpen > 0 && iClose > iOpen && iSym > iClose && iX > iClose)) return false;
      /* الإطباقي: الغلافُ قبل المينا وإغلاقُه قبل </svg> */
      const o = pd.indexOf('function buildOcclusalTooth');
      const oseg = pd.slice(o, pd.indexOf('\nfunction ', o + 10));
      const oOpen = oseg.indexOf("if (_occUn) svg += '<g class=\"occ-unerupted\"");
      const oEn = oseg.indexOf("fill=\"url(#en'+gid+')\"");
      const oClose = oseg.indexOf("svg+='</g>';   /* C3 */");
      const oEnd = oseg.indexOf("svg+='</svg>';", oClose);
      if (!(oOpen > 0 && oEn > oOpen && oClose > oEn && oEnd > oClose)) return false;
      /* البريو: المسندُ الواحد يقرأ الاستثناء من الخريطة الحيّة */
      const m = read('pp-modules.js');
      return /condPerioSkip\(teethMap\[String\(n\)\]\)/.test(m) && /teethMap = liveTeethMapRef \|\| teethMap;/.test(m);
    })();
    /* v490: تكافؤُ الفحص الأولي مع المودال يُبنى على النقرة الفعلية · و«سليم» لا يحذف غطاءَ التاج مع حالةٍ سطحية */
    const parity490Ok = (function(){
      const m = read('pp-modules.js');
      return /var _clk = clickedSurface \|\| '';/.test(m)
        && /if \(t\.cond_scope === 'tooth' \|\| !_clk \|\| _clk === 'WHOLE' \|\| _clk === 'CROWN_FULL'\) s = COND_SURFACE;/.test(m)
        && /if \(t\.cond_scope === 'both'\) s = _clk;/.test(m)
        && /حالةٌ سطحية — انقر السطحَ التاجيَّ المطلوب لا الجذر'\); return; \}/.test(m)
        && /var _clrCond = \(typeof isConditionKey === 'function'\) && isConditionKey\(sm\[currentSurface\]\);/.test(pd)
        && /if \(!_clrCond && currentSurface !== 'WHOLE' && currentSurface !== 'CROWN_FULL'/.test(pd);
    })();
    /* v491: لكلِّ حالةٍ زرُّ إزالتها بأيِّ موضع — والزرُّ لا يحذف علاجاً أبداً */
    const remove491Ok = /function conditionRowsOf\(num\)/.test(pd)
      && /async function _removeCondition_inner\(num, surface\)/.test(pd)
      && /if \(!key \|\| !isConditionKey\(key\)\) \{ showToast\(/.test(pd)
      && /\.eq\('tooth_num', tn\)\.eq\('surface', sf\)\s*\n\s*\.eq\('treatment_key', key\);/.test(pd)
      && /var _cRows = conditionRowsOf\(n\);/.test(pd)
      && /onclick="removeCondition\(' \+ n \+ ',\\'' \+ _cr\.surface \+ '\\'\)"/.test(pd);
    /* v494: تأكيدُ استبدال حالةٍ بأخرى على أيِّ موضع (لا COND وحده) */
    const replace494Ok = /var _prevC = \(teethMap\[String\(currentTooth\)\] \|\| \{\}\)\[currentSurface\];/.test(pd)
      && /if \(_prevC && isConditionKey\(_prevC\) && _prevC !== pendingToothStatus\) \{/.test(pd)
      && !/var _prevC = toothConditionKey\(currentTooth\);/.test(pd);
    const examOk = (function(){
      const m = read('pp-modules.js');
      return /examCondPalette/.test(m)
        && /var _isCond = \(typeof isConditionKey === 'function'\) && isConditionKey\(examSelectedKey\);/.test(m)
        && /var _onlyM = condSurfaceNotAllowed\(t, s\);/.test(m)
        && /var _stW = _isCond \? 'condition' : examStatus;/.test(m)
        && /review_at: _isCond \? null : examReviewAt\(\)/.test(m)
        && /if \(_isCond && s !== COND_SURFACE && typeof condSurfaceConflict === 'function'\)/.test(m)
        && /id="examCondRow"/.test(read('patient-profile.html'));
    })();
    if (libOk && chokeOk && normOk && pickOk && batchOk && surfaceOk && ledgerKeyOk && watchOk && migOk
        && surfGuardOk && fadeOk && lockOk && waOk && labParityOk && examOk && scopeOk && anatOk && drawOk && uneruptedOk && parity490Ok && remove491Ok && replace494Ok)
      ok('الحالات السريرية: مكتبةٌ بتسعِ حالاتٍ بصفر سعر · ارتدادُ getTreatment نقطةَ خنقٍ والكتالوجُ يفوز · التطبيعُ قسريٌّ بالحفظ وبمنتقي الحالة وبمسار المخبر · الدفعةُ تعود قبل السجل · سطحُ COND محجوز وحارسُ تعارض الأسطح قبل الكتابة · صفرُ مفتاحِ حالةٍ بالسجل · خارج بانر المراقبة ورسالةِ المريض · بلا تعتيمٍ يطمس الرمز · القفلُ لا يتسرّب · الفحصُ الأولي بصفٍّ مستقلٍّ وحالةٍ مفروضة · نطاقُ كلِّ حالةٍ تشريحيٌّ ورمزُها حيث سُجِّلت · الانحسارُ يُزيح خطَّ اللثة ورمزُه عند حدِّ التاج والجذر · الجذرُ المتبقّي بلا تاج · المنطمرُ مرتفعٌ وظلُّه مُصغَّر · لا رموزَ إطباقية');
    else bad('الحالات السريرية: ' + J({ libOk, chokeOk, normOk, pickOk, batchOk, surfaceOk, ledgerKeyOk, watchOk, migOk, surfGuardOk, fadeOk, lockOk, waOk, labParityOk, examOk, scopeOk, anatOk, drawOk, uneruptedOk, parity490Ok, remove491Ok, replace494Ok }));
  } catch (e) { bad('الحالات السريرية: فشل الفحص — ' + (e && e.message)); }

  console.log('───────────────────────────────────────');
  if (failures > 0) {
    console.log('⛔ المنطق الحرج: ' + failures + ' فشل — لا تعمل commit.');
    process.exit(1);
  }
  console.log('✅ المنطق الحرج: كل الاختبارات خضر (FIFO: ' + VECTORS.length
    + ' + مرآة · CAL: ' + (CAL_VECTORS.length + PAINT_VECTORS.length)
    + ' · المكتسب: ' + EARNED_VECTORS.length + ' + قفل مصدر'
    + ' · المالي: ' + FIN_VECTORS.length
    + ' · محرّر التقسيم: ' + SPLIT_VECTORS.length
    + ' · محاسبة P&L: ' + ACC_VECTORS.length
    + ' · مدفوع الجلسة: ' + SESSPAID_VECTORS.length
    + ' · دفعة الطبيب: ' + SUGG_VECTORS.length
    + ' · أداء الطبيب: ' + PROV_VECTORS.length
    + ' · إحصاء المصاريف: ' + EXPSTATS_VECTORS.length
    + ' · تكافؤ الرصيد: ' + FIN_VECTORS.length
    + ' · تكافؤ اللوحة: ' + FIN_VECTORS.length
    + ' · قسمة العملة: ' + CURLAYER_CHECKS
    + ' · الطبقة المخطّطة: ' + PLAN_LAYER_CHECKS + ' · القلع المخطّط: 7 · الحالات السريرية: 9).');
  process.exit(0);
})().catch(e => { console.log('⛔ استثناء غير متوقّع ببلوك F/G: ' + (e && e.message)); process.exit(1); });
