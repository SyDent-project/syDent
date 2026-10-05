#!/usr/bin/env node
/* SyDent — validate-js.js: فحص صياغة كل كتل JS المضمّنة بكل صفحات HTML.
 * يتخطى <script src=...> والأنواع غير JS. الاستخدام: node scripts/validate-js.js */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
let failures = 0, blocks = 0;
for (const f of files) {
  const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, idx = 0;
  while ((m = re.exec(content)) !== null) {
    idx++;
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const t = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    if (t && !/javascript|module/i.test(t[1])) continue;
    blocks++;
    try { new vm.Script(m[2], { filename: f + '#' + idx }); }
    catch (e) {
      failures++;
      const line = content.slice(0, m.index).split('\n').length;
      console.log('✗ ' + f + ' (كتلة #' + idx + '، تبدأ سطر ' + line + '): ' + e.message);
    }
  }
}
/* ملفات .js بجذر الشجرة المخدومة: الأصول المشتركة (theme/sidebar/supabase-init/
 * timepicker/sw) + أي وحدات مستخرَجة بمشروع تفكيك الملفات الوحشية (pp-modules.js
 * وأخواتها) — كانت خارج التغطية لأن الحارس كان يمسح كتل HTML المضمّنة فقط. */
const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).sort();
for (const f of jsFiles) {
  try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); }
  catch (e) {
    failures++;
    console.log('✗ ' + f + ' (ملف .js بالجذر): ' + e.message);
  }
}
console.log(failures === 0
  ? '✅ JS: ' + blocks + ' كتلة inline عبر ' + files.length + ' ملف HTML + ' + jsFiles.length + ' ملف .js بالجذر — الكل يُـparse نظيفاً'
  : '⛔ JS: ' + failures + ' فشل');
process.exit(failures ? 1 : 0);
