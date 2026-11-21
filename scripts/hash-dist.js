/* hash-dist — يكتب dist/asset-manifest.json (يستدعيه build-dist.sh بعد التصغير، على البايتات النهائية المنشورة).
   الغاية (v803): كسرُ الكاش يدوّر التوكن على كل الأصول المشتركة ولو لم يتغيّر محتواها، فكلُّ نشرةٍ كانت تُنزّل كلَّ ملفات
   الصفحة من جديد (~1MB مضغوطة لبطاقة المريض). البيانُ يقول لعامل الخدمة ما محتوى كل أصلٍ بهذه النشرة (sha256)، فإن
   كان يحمل الملفَ نفسَه حرفياً بتوكنٍ أقدم استعمله بدل تنزيله (sw.js: provenCurrent / reuseSamePath).
   الشكل: { "v": 1, "token": "<توكن الأسطول>", "files": { "supabase-init.js": "<sha256 hex>", … } }
   • الملفات: كل .js و.css بجذر dist عدا sw.js (لا يُخدَم موسوماً أبداً).
   • التوكن: الوحيد الذي تحمله مراجعُ ?v= لملفات .js/.css بصفحات dist. أكثر من توكن أو لا توكن ⇒ يُكتب البيان بلا
     توكن فلا يثق به العامل (يبقى السلوكُ تنزيلاً من الشبكة كما كان) — لا تخمين.
   أيُّ فشلٍ هنا لا يُفشل البناء: build-dist.sh يكمل بلا بيان، والعاملُ بلا بيانٍ يعمل كما كان. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function build(DIST) {
  const names = fs.readdirSync(DIST).filter(n => fs.statSync(path.join(DIST, n)).isFile());
  const files = {};
  names.filter(n => /\.(js|css)$/.test(n) && n !== 'sw.js').sort().forEach(n => {
    files[n] = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, n))).digest('hex');
  });
  const tokens = new Set();
  names.filter(n => /\.html$/.test(n)).forEach(n => {
    const html = fs.readFileSync(path.join(DIST, n), 'utf8');
    for (const m of html.matchAll(/(?:src|href)=["']\/?([^"'#<>?\/]+\.(?:js|css))\?v=([A-Za-z0-9]+)["']/g)) {
      if (Object.prototype.hasOwnProperty.call(files, m[1])) tokens.add(m[2]);
    }
  });
  const out = { v: 1, token: tokens.size === 1 ? [...tokens][0] : null, files };
  return { out, tokens: [...tokens] };
}

if (require.main === module) {
  const DIST = path.resolve(process.argv[2] || 'dist');
  const { out, tokens } = build(DIST);
  fs.writeFileSync(path.join(DIST, 'asset-manifest.json'), JSON.stringify(out));
  if (out.token) console.log('── بيان الأصول: ' + Object.keys(out.files).length + ' ملفاً · التوكن ' + out.token);
  else console.warn('⚠️  بيان الأصول بلا توكن (التوكنات بالصفحات: ' + (tokens.join(' ') || 'لا شيء') + ') — العامل لن يستعمله');
}
module.exports = { build };
