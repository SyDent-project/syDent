#!/usr/bin/env node
/* v478 — حارسُ المُنسّق الموحّد SyDT (supabase-init.js): التاريخُ أرقاماً والوقتُ 12 ساعة، يومٌ محليّ بتوقيت دمشق،
   لا وقتَ مُخترَع (منتصف ليل UTC = يومٌ بلا وقت · cellRec لا يعرض وقتَ تسجيلٍ بيومٍ آخر)، والخانةُ مُهرَّبة. */
process.env.TZ = 'Asia/Damascus';
const fs=require('fs'), vm=require('vm');
const s=fs.readFileSync(require('path').join(__dirname, '..', 'supabase-init.js'),'utf8'); const i=s.indexOf('window.SyDT = (function');
const ctx={window:{}}; vm.createContext(ctx); vm.runInContext(s.slice(i),ctx); const T=ctx.window.SyDT;
const eq=(a,b,m)=>{ if(a!==b){console.log('✗',m,JSON.stringify(a),'≠',JSON.stringify(b)); process.exitCode=1;} else console.log('✓',m); };
eq(T.numDate('2026-07-30'),'30/7/2026','YMD نصّياً');
eq(T.numDate('2026-09-21T23:30:00+00:00'),'22/9/2026','طابعٌ بعد منتصف الليل المحلي ⇒ اليوم المحلي التالي');
eq(T.time12('2026-09-21T11:32:10+00:00'),'\u206602:32 PM\u2069','وقت محلي +3 (معزولُ الاتجاه)');
eq(T.time12('2026-08-02T00:00:00+00:00'),'','يومٌ بلا وقت');
eq(T.time12('09:05:00'),'\u206609:05 AM\u2069','نصّ وقت');
eq(/dt-time/.test(T.cellRec('2026-09-21','2026-09-21T08:00:00+00:00')),true,'سُجّل بيومه ⇒ وقت');
eq(/dt-time/.test(T.cellRec('2026-09-10','2026-09-21T08:00:00+00:00')),false,'سُجّل بيومٍ لاحق ⇒ تاريخٌ وحده');
eq(T.cell(''),'—','فارغ');
eq(/&lt;/.test(T.cell('2026-09-21','<b>')),false,'نصُّ وقتٍ غير صالح لا يُحقَن');
eq(T.hm('2026-09-21T11:32:10+00:00'),'14:32','لحقل الوقت');
// v481: اليومُ طابعٌ زمني (lab_orders.date_sent) — منتصفُ ليل UTC يومٌ بلا وقت ⇒ وقتُ التسجيل إن كان بيومه؛ وقتٌ حقيقيٌّ ⇒ وقتُه هو
eq(/06:09 AM/.test(T.cellRec('2026-07-31T00:00:00+00:00','2026-07-31T03:09:00+00:00')),true,'يومٌ طابعيٌّ بلا وقت ⇒ وقتُ التسجيل بيومه');
eq(/02:32 PM/.test(T.cellRec('2026-09-21T11:32:00+00:00','2026-09-25T08:00:00+00:00')),true,'يومٌ طابعيٌّ بوقته ⇒ وقتُه هو لا وقتُ التسجيل');
// v484: SySlots.finalize — تُطوى الخاناتُ غير المستعملة بالجدول كله، والامتدادُ فوق خانةٍ مطويّة يسقط
{ const src = fs.readFileSync(require('path').join(__dirname, '..', 'supabase-init.js'), 'utf8');
  const j = src.indexOf('window.SySlots = {'); const ctx2 = { window: {} }; vm.createContext(ctx2);
  vm.runInContext(src.slice(j, src.indexOf('\n};', j) + 3), ctx2); const SS = ctx2.window.SySlots;
  const W = { 1: '84px', 2: '78px', 3: '80px' };
  const allDone = '<div style="--sy-slots:__SY_SLOTS__"><button data-slot="3">حذف</button></div><div style="--sy-slots:__SY_SLOTS__"><button data-slot="2">مخبر</button><button data-slot="3">حذف</button></div>';
  eq(SS.finalize(allDone, W).includes('--sy-slots:[s2] 78px [s3] 80px'), true, 'جلساتٌ كلُّها منجزة ⇒ خانةُ «إكمال» مطويّة');
  const noLab = '<div style="--sy-slots:__SY_SLOTS__"><button data-slot="1" data-span-if="2">إكمال</button><button data-slot="3">حذف</button></div>';
  const r1 = SS.finalize(noLab, W);
  eq(r1.includes('--sy-slots:[s1] 84px [s3] 80px') && !/data-span/.test(r1), true, 'لا «مخبر» بأي صفّ ⇒ لا امتدادَ فوق خانةٍ مطويّة');
  const mixed = noLab + '<div style="--sy-slots:__SY_SLOTS__"><button data-slot="2">مخبر</button><button data-slot="3">حذف</button></div>';
  const r2 = SS.finalize(mixed, W);
  eq(r2.includes('data-span="2"') && !r2.includes('data-span-if') && !r2.includes('__SY_SLOTS__'), true, '«مخبر» بصفٍّ آخر ⇒ «إكمال» يمتدّ فوق خانته'); }
// v487 (قرار المالك: «التاريخ بس أرقام» حتى المطبوعات ورسائل الواتساب): لا مُنسّقَ تاريخٍ محليّ بالمنصة —
//       toLocaleDateString / toLocaleString('ar…'|'en-GB') ممنوعان، وأسماءُ الأشهر محصورةٌ بعناوين التقويم والتنقّل
//       (المواعيد · صفحة الحجز العامة · تسميات فترات اللوحة · مربّعات تبويب المواعيد) — كلُّ تاريخِ بيانٍ عبر SyDT.
{ const path = require('path'), root = path.join(__dirname, '..');
  const MONTH_OK = { 'appointments.html': 'عناوين التقويم', 'book.html': 'صفحة الحجز العامة', 'index.html': 'تسميات فترات اللوحة', 'pp-wa.js': 'مربّعات تبويب المواعيد' };
  const files = fs.readdirSync(root).filter(f => /\.(html|js)$/.test(f));
  const bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const t = l.trim(); if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('(toLocaleString')) return;
      if (/toLocaleDateString\(|toLocaleString\(\s*'(ar|en-GB)/.test(l)) bad.push(f + ':' + (i + 1) + ' مُنسّقٌ محليّ');
      if (/'كانون الثاني'/.test(l) && !MONTH_OK[f]) bad.push(f + ':' + (i + 1) + ' أسماءُ أشهرٍ خارج عناوين التقويم');
    });
  }
  if (bad.length) { console.log('✗ تاريخٌ خارج المُنسّق الموحّد:\n  ' + bad.join('\n  ')); process.exitCode = 1; }
  else console.log('✓ كلُّ تاريخِ بيانٍ عبر SyDT (' + files.length + ' ملفاً) — أسماءُ الأشهر بعناوين التقويم وحدها'); }
// v481: تلميحُ التاريخ العائم (.tip/data-tip) كان يُقَصّ داخل حاويات التمرير ويغطّي الصفّ التالي (لقطة المالك بتبويب المخابر)
//       — التاريخُ والوقتُ يُعرضان بالخانة نفسها عبر SyDT. لا يعود التلميح ببطاقة المريض.
{ const path = require('path'), root = path.join(__dirname, '..');
  const files = ['patient-profile.html', 'patient-profile.css'].concat(fs.readdirSync(root).filter(f => /^pp-.*\.js$/.test(f)));
  const bad = files.filter(f => /dtHoverAttrs|data-tip=|class=\\?"tip[ "\\]/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  if (bad.length) { console.log('✗ تلميحُ تاريخٍ عائم عاد ببطاقة المريض:', bad.join('، ')); process.exitCode = 1; }
  else console.log('✓ لا تلميحَ تاريخٍ عائمٍ ببطاقة المريض (التاريخُ والوقت بالخانة)'); }
if (!process.exitCode) console.log('✅ SyDT + SySlots: 16/16 — أرقامٌ · يومٌ محلي · لا وقتَ مُخترَع · مُهرَّب · الخاناتُ تُطوى · لا مُنسّقَ محلي');
