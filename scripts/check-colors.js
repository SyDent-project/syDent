#!/usr/bin/env node
/* =====================================================================
 * SyDent — check-colors.js  (v350: توحيد ألوان الوضع الفاتح)
 * ---------------------------------------------------------------------
 * الحارس يعدّ الألوانَ المحفورة بقيم لوحة الداكن في كل ملف (rgba/hex)
 * — وهي التي تنطبق كما هي على الثيمين فتُعطي كلَّ صفحةٍ شكلاً مختلفاً
 * بالفاتح — ويقارنها بخطٍّ أساسي لكل ملف (scripts/color-baseline.json).
 *
 *   العدد > الخط الأساسي  ⇒ فشل: لونٌ محفور جديد. استعمل نظامَ الألوان
 *                            الموحّد (theme.css: tone / cbadge / -fill /
 *                            -solid / توكنات الثيم).
 *   العدد < الخط الأساسي  ⇒ فشل: تقدّمٌ غير مُثبَّت. شغّل
 *                            node scripts/check-colors.js --update
 *                            ثم اعمل commit للملف مع الصفحة.
 *
 * لا يُعدّ: كتل :root المحلية (theme.css يدوسها بالثيمين) · القيمُ
 * الاحتياطية var(--x, #hex) · book.html · sw.js · vendor/ · theme.css
 * (مصدرُ التوكنات نفسه).
 * ما يبقى بالخط الأساسي بعد انتهاء الجولات = استثناءاتٌ مقصودة:
 * ألوانُ العلاجات على المخطط · أقلامُ المسودة · نوافذُ الطباعة ·
 * بذورُ البيانات الافتراضية · رسومُ نطاق العلاج (SVG) · صفحةُ الهبوط التسويقية.
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(__dirname, 'color-baseline.json');
const UPDATE = process.argv.includes('--update');

const SKIP = new Set(['book.html', 'sw.js', 'theme.css']);
const RGB = new RegExp('rgba?\\(\\s*(' + [
  '239,83,80', '245,200,66', '255,167,38', '245,158,11', '251,146,60', '239,68,68',
  '249,115,22', '99,179,237', '167,139,250', '77,208,225', '46,232,158', '59,130,246',
  '34,197,94', '168,85,247', '236,72,153', '255,87,87', '229,62,62', '72,187,120',
  '246,173,85', '6,182,212', '16,185,129', '255,193,7', '220,38,38', '245,101,101',
  // v373: more status-ish dark-palette hues found by a fleet-wide survey
  '245,166,35', '229,72,77', '232,93,93', '56,189,248', '66,165,245', '159,122,234'
].map(t => t.replace(/,/g, ',\\s*')).join('|') + ')\\s*,', 'g');
const HEX = new RegExp('(?<![\\w-])#(' + [
  'ef5350', 'f5c842', 'ffa726', 'fb923c', 'f59e0b', 'ef4444', '63b3ed', 'a78bfa',
  '4dd0e1', '2ee89e', 'f97316', 'fbbf24', '22c55e', '3b82f6', 'a855f7', 'ec4899',
  '48bb78', 'f6ad55', 'fc8181', '06b6d4', '10b981', '8b5cf6', 'ffc107', 'e85d5d',
  'ff5757', 'f87171', 'facc15', 'eab308', '34d399', '60a5fa', 'c084fc', 'fb7185',
  '4ade80', 'fcd34d', '5b9dff', 'f5a623', 'e5484d', '38bdf8', '42a5f5', '9f7aea'
].join('|') + ')\\b', 'gi');

function count(src) {
  const s = src
    .replace(/:root(?:\[[^\]]*\])*\s*\{[^}]*\}/g, '')      // page-local token blocks (:root / :root[data-theme=…] only — v367: the old
                                                                   // `:root[^{]*` could swallow unrelated text up to the next `{`)
    .replace(/var\(--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g, ''); // var() fallbacks
  return (s.match(RGB) || []).length + (s.match(HEX) || []).length;
}

const files = fs.readdirSync(ROOT)
  .filter(f => /\.(html|css|js)$/.test(f) && !SKIP.has(f))
  .sort();
const now = {};
files.forEach(f => { const n = count(fs.readFileSync(path.join(ROOT, f), 'utf8')); if (n) now[f] = n; });

if (UPDATE) {
  fs.writeFileSync(BASE, JSON.stringify(now, null, 2) + '\n');
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  console.log('✅ حارس الألوان: خطٌّ أساسي جديد — ' + total + ' لوناً محفوراً بـ' + Object.keys(now).length + ' ملفاً.');
  process.exit(0);
}

let base = {};
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); }
catch (e) { console.log('⛔ حارس الألوان: scripts/color-baseline.json مفقود — شغّل --update'); process.exit(1); }

let fail = 0;
const keys = new Set(Object.keys(base).concat(Object.keys(now)));
[...keys].sort().forEach(f => {
  const b = base[f] || 0, n = now[f] || 0;
  if (n > b) { fail++; console.log('  ✗ ' + f + ': ' + n + ' لوناً محفوراً (الخط الأساسي ' + b + ') — استعمل نظام الألوان الموحّد بـtheme.css'); }
  else if (n < b) { fail++; console.log('  ✗ ' + f + ': نزل إلى ' + n + ' (الخط الأساسي ' + b + ') — ثبّت التقدّم: node scripts/check-colors.js --update'); }
});
const total = Object.values(now).reduce((a, b) => a + b, 0);
if (fail) { console.log('⛔ حارس الألوان: ' + fail + ' ملف خارج الخط الأساسي.'); process.exit(1); }
console.log('✅ حارس الألوان: ' + total + ' لوناً محفوراً متبقياً بـ' + Object.keys(now).length + ' ملفاً — مطابق للخط الأساسي (لا جديد).');
