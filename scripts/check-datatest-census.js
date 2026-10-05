#!/usr/bin/env node
/* SyDent — check-datatest-census.js: جرد سمات data-test الأربع عشرة.
 *
 * السياسة (وثيقة التسليم ملحق ج): سمات data-test هي اللمسة الوحيدة المسموحة
 * لكود الإنتاج لأجل الاختبارات، وجردها ملزم — patient-profile 6 · patients 5
 * · appointments 3، كل سمة مرة واحدة بالضبط. أي حذف/تكرار يُسقط اختبارات E2E
 * ويقفل بوابة النشر (promote.needs = [guards, e2e]) — لكن الفشل هناك يظهر
 * متأخراً وبعيداً عن سببه. هذا الحارس يحوّله إلى فشل فوري محلي باسم السمة.
 *
 * مشروع تفكيك الملفات الوحشية يجعل هذا الجرد أشدّ أهمية: كل استخراج يقصّ
 * أسطراً من الملفات الحاملة للسمات، وضياع سمة أثناء القص هو أخطر انزلاق صامت.
 *
 * العقد (مستخرَج من الكود الحي بتاريخ 26 تموز 2026):
 *   - سمة تنتهي بـ'"' = قيمة ثابتة تُطابَق كاملة.
 *   - سمة بلا '"' ختامية = بادئة ديناميكية (pp-session-paid- تُركَّب وقت
 *     التشغيل إلى -full أو -partial في template literal — سطر ~11215).
 *   - إضافة سمة جديدة مستقبلاً = تحديث هذا الجرد بنفس الكومِت (احتكاك مقصود).
 *
 * الاستخدام: node scripts/check-datatest-census.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const CENSUS = {
  'patient-profile.html': [
    'pp-session-row"',
    'pp-session-paid-',          // ديناميكية: -full|-partial تُركَّب وقت التشغيل
    'pp-payment-row"',
    'pp-bal-completed"',
    'pp-bal-paid"',
    'pp-bal-due"'
  ],
  'patients.html': [
    'add-patient"',
    'patient-row"',
    'patient-local-id"',
    'patient-menu"',
    'patient-delete"'
  ],
  'appt-views.js': [   /* retarget: renderList نُقلت من appointments.html — استخراج ٥ */
    'appt-row"',
    'appt-status"',
    'appt-delete"'
  ]
};

let bad = 0, total = 0;
for (const [file, expected] of Object.entries(CENSUS)) {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, file), 'utf8'); }
  catch (e) { console.log('✗ ' + file + ': تعذّرت القراءة — ' + e.message); bad++; continue; }

  const occurrences = (src.match(/data-test="/g) || []).length;
  if (occurrences !== expected.length) {
    console.log('✗ ' + file + ': ' + occurrences + ' سمة data-test والجرد يوجب ' + expected.length);
    bad++;
  }
  for (const token of expected) {
    const needle = 'data-test="' + token;
    const n = src.split(needle).length - 1;
    if (n !== 1) {
      console.log('✗ ' + file + ': السمة "' + token.replace(/"$/, '') + '" تظهر ' + n + ' مرة والمطلوب 1');
      bad++;
    }
  }
  total += expected.length;
}

console.log(bad
  ? '⛔ data-test: ' + bad + ' خرق بالجرد'
  : '✅ حارس data-test: الجرد سليم — ' + total + ' سمة (6/5/3) كل وحدة مرة واحدة بالضبط');
process.exit(bad ? 1 : 0);
