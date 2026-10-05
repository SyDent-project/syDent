#!/usr/bin/env node
/* SyDent — حارس نطاق القوالب (السابع عشر).
 *
 * لماذا: `wa_message_templates` جدولٌ **مشترك بين ثلاث عائلات** منذ M120/M122
 * (الرسالة الحرة · كتاب الإحالة · المنشور الصحّي)، والفصلُ بينها عمودُ `kind`
 * وحده. واستعلامٌ لا يسمّي نطاقه لا يفشل ولا يحمّر شيئاً — بل يخلط العائلات
 * بصمت: قوالبُ الإحالة والمنشور تُخزَّن JSON (v:2)، فظهورُ أحدها بقائمة رسالةٍ
 * حرّة يعني سكبَ نصٍّ خام بصندوق رسالةِ مريض، وحذفاً عابراً للعائلات.
 * وهذا ما وقع فعلاً: M120 فلتَر سطحَ بطاقة المريض ونسي السطحَ الموازي بقائمة
 * المتابعة، وعاش الانحرافُ لأن أحداً لم يكن يحرس «النطاق» بل الشكلَ وحده.
 *
 * العقد: كلُّ استدعاء `from('wa_message_templates')` — قراءةً أو كتابةً أو
 * حذفاً — يجب أن يسمّي نطاقه صراحةً: `.eq('kind', '…')` للاستعلامات، أو مفتاح
 * `kind:` بحمولة الإدراج. لا افتراضاتٍ على DEFAULT القاعدة.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TABLE = 'wa_message_templates';
const KINDS = ['wa_free', 'referral', 'health_post'];

const files = fs.readdirSync(ROOT)
  .filter(f => /\.(js|html)$/.test(f) && f !== 'sw.js')
  .sort();

let sites = 0, bad = [];
const seen = Object.create(null);

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = new RegExp("from\\('" + TABLE + "'\\)", 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    sites++;
    const line = src.slice(0, m.index).split('\n').length;
    /* نافذة الاستدعاء: حتى نهاية سلسلة الاستعلام (أول `;` بعد بدايته)
       أو 600 محرف — أيّهما أقرب. الحمولة والسلسلة كلتاهما داخلها. */
    const semi = src.indexOf(';', m.index);
    const win = src.slice(m.index, semi > -1 ? Math.min(semi + 1, m.index + 600) : m.index + 600);
    const kindEq = /\.eq\(\s*'kind'\s*,\s*'([a-z_]+)'\s*\)/.exec(win);
    const kindKey = /\bkind\s*:\s*'([a-z_]+)'/.exec(win);
    const hit = kindEq || kindKey;
    if (!hit) { bad.push(f + ':' + line + ' — استعلامٌ بلا نطاق'); continue; }
    if (KINDS.indexOf(hit[1]) === -1) { bad.push(f + ':' + line + ' — نطاقٌ مجهول «' + hit[1] + '»'); continue; }
    seen[hit[1]] = (seen[hit[1]] || 0) + 1;
  }
}

if (bad.length) {
  console.error('⛔ حارس نطاق القوالب: ' + bad.length + ' استعلاماً لا يسمّي عائلته على ' + TABLE + ':');
  bad.forEach(b => console.error('   ✗ ' + b));
  console.error('   العلاج: أضف .eq(\'kind\', \'…\') للاستعلام أو kind: \'…\' لحمولة الإدراج.');
  process.exit(1);
}

const dist = KINDS.map(k => k + ' ' + (seen[k] || 0)).join(' · ');
console.log('✅ حارس نطاق القوالب: كل استعلامات ' + TABLE + ' تسمّي عائلتها (' +
            sites + ' موضعاً · ' + dist + ').');
