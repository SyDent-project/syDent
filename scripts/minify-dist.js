/* minify-dist — يصغّر أصول dist/ المنشورة (يستدعيه build-dist.sh بعد النسخ، وesbuild في NODE_PATH):
   1) ملفات .js و.css بجذر dist (vendor/ مصغّرة أصلاً).
   2) كتل <script> و<style> المضمّنة داخل صفحات .html — صفحة المريض وحدها تحمل ~4400 سطر JS مضمّن.
   حذف تعليقات وفراغات وتبسيط نحوي فقط: لا إعادة تسمية ولا تجميع ولا هزّ شجرة، فكل دالة/متغيّر
   أعلى المستوى يبقى باسمه (onclick والسكربتات الأخرى تستدعيها). أي كتلة يفشل تصغيرها أو يخرج
   ناتجها بنصّ يكسر HTML تبقى كما هي — صفحة أثقل لا صفحة مكسورة. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const esbuild = require('esbuild');

const DIST = path.resolve(process.argv[2] || 'dist');
const OPTS = { minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8', logLevel: 'silent' };
const min = (code, loader) => esbuild.transformSync(code, Object.assign({ loader }, OPTS)).code;

let files = 0, blocks = 0, kept = 0, before = 0, after = 0;

for (const name of fs.readdirSync(DIST)) {
  const ext = path.extname(name);
  if (ext !== '.js' && ext !== '.css' && ext !== '.html') continue;
  const p = path.join(DIST, name), src = fs.readFileSync(p, 'utf8');
  let out = src;
  if (ext === '.html') {
    // مرور واحد يستهلك تعليقات HTML وكتل <script> و<style> بترتيب ظهورها: نصّ "<style>" داخل تعليق
    // HTML أو سلسلة JS لا يُحسب وسماً (وإلا صُغّرت شيفرة أو وسوم <script> كأنها CSS). التعليقات تبقى كما هي.
    out = src.replace(/<!--[\s\S]*?-->|(<script\b([^>]*)>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (all, open, attrs, body, close, sOpen, sBody, sClose) => {
        if (!open && !sOpen) return all;   // تعليق HTML
        if (sOpen) return sBody.trim() ? sOpen + block(sBody, 'css', /<\/style/i) + sClose : all;
        if (/\bsrc\s*=/i.test(attrs) || !body.trim()) return all;
        const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
        if (type && !/^(text|application)\/javascript$/i.test(type)) return all;   // ld+json, module…
        return open + block(body, 'js', /<\/script|<!--/i) + close;
      });
    // شبكة أمان: كل سكربت مضمّن كان يُترجَم بالأصل يجب أن يُترجَم بالناتج، وإلا تبقى الصفحة كما هي.
    if (out !== src && compiles(src) !== compiles(out)) { console.warn('⚠️  ' + name + ': ناتج لا يُترجَم — بقيت كما هي'); out = src; kept++; }
  } else {
    try { out = min(src, ext.slice(1)); } catch (e) { console.warn('⚠️  ' + name + ': ' + e.message.split('\n')[0]); kept++; }
  }
  if (out !== src) { fs.writeFileSync(p, out); files++; }
  before += Buffer.byteLength(src); after += Buffer.byteLength(out);
}

function compiles(html) {
  let ok = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|\btype\s*=/i.test(m[1]) || !m[2].trim()) continue;
    try { new vm.Script(m[2]); ok++; } catch (e) { /* لا يُعدّ */ }
  }
  return ok;
}

function block(body, loader, unsafe) {
  try {
    const m = min(body, loader).trim();
    if (unsafe.test(m) && !unsafe.test(body)) { kept++; return body; }
    blocks++; return m;
  } catch (e) { kept++; return body; }
}

console.log('── صُغِّر ' + files + ' ملفاً (' + blocks + ' كتلة مضمّنة' + (kept ? '، بقي ' + kept + ' كما هو' : '') + '): '
  + (before >> 10) + 'KB → ' + (after >> 10) + 'KB ──');
