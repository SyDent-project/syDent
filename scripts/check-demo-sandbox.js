#!/usr/bin/env node
/**
 * check-demo-sandbox.js — الحارس الرابع عشر.
 *
 * يحرس الثابت البنيوي للبطاقة التجريبية (?id=demo) بـpatient-profile.html:
 *   القراءة يجوز أن تمرّ إلى القاعدة الحقيقية · الكتابة لا تمرّ أبداً.
 *
 * الخلفية: النسخة الأولى فوّضت جداول العيادة كاملةً للعميل الحقيقي بافتراض أن
 * الصفحة لا تكتبها. التدقيق الحيّ أثبت أنها تكتب ستةً منها (labs · inventory_items
 * وخمسة *_templates بعضها بـdelete)، فنزل مخبر حقيقي من البطاقة التجريبية.
 * هذا الحارس يمنع رجوع ذلك الافتراض تحت أي صياغة.
 *
 * الفحوص:
 *   1. الكتلة موجودة ومعرّفة بعلم IS_DEMO.
 *   2. المرجع الحقيقي مُلتقط مرة واحدة فقط (origFrom) قبل الترقيع.
 *   3. كل استخدام لـorigFrom يتبعه .select( فوراً — لا insert/update/delete/upsert.
 *   4. لا وجود لتفويض جدول كامل للعميل الحقيقي (النمط: return ... origFrom(t) ...).
 *   5. الترقيع بالمكان: real.from/rpc/functions/storage/channel كلها مُعاد تعريفها.
 */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'patient-profile.html');
const html = fs.readFileSync(FILE, 'utf8');

let bad = 0;
const fail = (m) => { console.log('X ' + m); bad = 1; };

const i = html.indexOf('var IS_DEMO = ');
if (i === -1) fail('كتلة البطاقة التجريبية (IS_DEMO) غير موجودة بـpatient-profile.html');
const j = html.indexOf('\n})();', i);
const blk = i > -1 && j > -1 ? html.slice(i, j) : '';

if (blk) {
  // 2) التقاط المرجع الحقيقي
  const caps = blk.match(/var\s+origFrom\s*=\s*real\.from\.bind\(real\)\s*;/g) || [];
  if (caps.length !== 1) fail('يجب التقاط مسار القاعدة الحقيقية مرة واحدة بالضبط عبر origFrom = real.from.bind(real)');

  // 3) كل استخدام لـorigFrom مقصور على select
  const uses = [...blk.matchAll(/origFrom\s*\(/g)];
  const decl = blk.indexOf('var origFrom');
  let readOnly = 0;
  for (const u of uses) {
    if (decl > -1 && u.index >= decl && u.index < decl + 40) continue; // سطر التعريف نفسه
    const tail = blk.slice(u.index, u.index + 160);
    if (/^origFrom\s*\([^)]*\)\s*\.\s*select\s*\(/.test(tail)) { readOnly++; continue; }
    fail('استخدام لـorigFrom لا يتبعه .select( مباشرة — الكتابة ممنوعة على المسار الحقيقي: ' + tail.slice(0, 70).replace(/\s+/g, ' '));
  }
  if (readOnly < 1) fail('لا يوجد أي قراءة عبر origFrom — تحقّق من صحة الكتلة');
  if (/origFrom\s*\([^)]*\)\s*\.\s*(insert|update|delete|upsert)\s*\(/.test(blk))
    fail('كتابة صريحة على العميل الحقيقي داخل كتلة البطاقة التجريبية');

  // 4) لا تفويض جدول كامل
  if (/return\s+[A-Z_]*\[?\w*\]?\s*\?\s*origFrom\s*\(/.test(blk) || /\?\s*origFrom\s*\(\s*t\s*\)\s*:/.test(blk))
    fail('تفويض جدول كامل للعميل الحقيقي (نمط النسخة الأولى) — يجب أن تمرّ جداول READ_THROUGH عبر Hybrid لا origFrom مباشرة');

  // 5) الترقيع بالمكان لكل الأسطح
  for (const surf of ['real.from =', 'real.rpc =', 'real.functions =', 'real.storage =', 'real.channel ='])
    if (!blk.includes(surf)) fail('سطح غير مُرقَّع بالبطاقة التجريبية: ' + surf);
  if (/window\.sb\s*=\s*\{/.test(blk))
    fail('استبدال window.sb بكائن جديد — الترقيع يجب أن يكون بمكان العميل نفسه كي تُغطّى المراجع المأخوذة');
}

if (bad) { console.log('⛔ حارس البطاقة التجريبية: فشل.'); process.exit(1); }
console.log('✅ حارس البطاقة التجريبية: القراءة تمرّ · الكتابة لا تمرّ (' + ((blk.match(/origFrom\s*\(/g) || []).length - 1) + ' قراءة، صفر كتابة، الأسطح الخمسة مُرقَّعة بالمكان).');
