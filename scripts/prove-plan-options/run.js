/* مثبت خيارات خطة العلاج (M145) — الكود الحقيقي على قاعدة وهمية بنفس المخطط وقيوده الفريدة.
   تشغيل: node scripts/prove-plan-options/run.js   (يلزم acorn: npm i acorn --no-save)
   run2: الاعتماد/الإنجاز/الحذف/الإلغاء/المستند · run3: التلميحات/التوستات/التسرّب/مرآة المواعيد/أمان القديم
   run4: الإنجاز من المواعيد واللوحة ثم «الاعتماد المعلّق» بملف المريض */
const { execFileSync } = require('child_process');
let ok = 0, bad = 0;
for (const f of ['run2.js', 'run3.js', 'run4.js', 'run5.js']) {
  let out = '';
  try { out = execFileSync(process.execPath, [require('path').join(__dirname, f)], { encoding: 'utf8', timeout: 240000 }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/(\d+) نجح · (\d+) فشل\s*$/m) || out.match(/(\d+) نجح · (\d+) فشل/);
  const fails = out.split('\n').filter(l => l.startsWith('✗') || l.startsWith('FATAL'));
  if (!m) { bad++; console.log('⛔ ' + f + ': لم يكتمل\n' + out.slice(-600)); continue; }
  ok += +m[1]; bad += +m[2];
  console.log((+m[2] ? '⛔ ' : '✅ ') + f + ': ' + m[1] + ' نجح · ' + m[2] + ' فشل' + (fails.length ? '\n   ' + fails.join('\n   ') : ''));
}
console.log(`\nالمجموع: ${ok} نجح · ${bad} فشل`);
process.exitCode = bad ? 1 : 0;
