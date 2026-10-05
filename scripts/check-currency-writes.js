#!/usr/bin/env node
/* SyDent — check-currency-writes.js (الحارس الخامس عشر · M125): وسمُ العملة إلزاميّ.
 *
 * الثابت: **كل كتابةٍ تضبط مبلغاً يجب أن تضبط عملته بالحمولة نفسها.**
 *
 * وُلد هذا الحارس من ثلاثة بلاغات متتالية للمالك كشفت أن جردي اليدوي للأسطح
 * المالية غير موثوق: الراتب الشهري فاتني كلياً، ومودال المخبر ببطاقة المريض
 * لم يُوصَل، وحمولة أمر المخبر ركّبت مبدّلاً ولم تكتب قيمته — أي مبدّلٌ يكذب.
 * الدرس: جردُ الأسطح المالية يُشتقّ من **أعمدة الجداول** لا من قائمةٍ تُكتب
 * باليد، ويُفرض آلياً لا بالانتباه.
 *
 * لماذا «يضبط مبلغاً» لا «كل كتابة»: تحديثٌ يغيّر sort_order أو status وحده
 * لا علاقة له بالعملة، وإلزامه بها ضجيجٌ يُفقد الحارس مصداقيته.
 * والصفوف التي تُدرَج بلا وسم يشتقّ لها تريغرُ M125 عملةَ العيادة — لكن
 * الاشتقاق شبكةُ أمان لا بديلٌ عن التصريح: النية يجب أن تُقرأ من الكود.
 */
const fs = require('fs');
process.chdir(require('path').resolve(__dirname, '..'));   // جذر الريبو من موضع الملف — يعمل من أي cwd
const T = {
  ledger_sessions:['currency',['cost']], ledger_payments:['currency',['amount']],
  payment_splits:['currency',['amount']], expenses:['currency',['amount']],
  provider_payouts:['currency',['amount']], lab_orders:['currency',['cost']],
  lab_payments:['currency',['amount']], account_adjustments:['currency',['amount']],
  inventory_items:['currency',['purchase_price']], treatments:['currency',['price']],
  payment_plans:['currency',['total','installment_amount']],
  clinic_doctors:['salary_currency',['monthly_salary']],
  clinic_employees:['salary_currency',['monthly_salary']],
  /* M130: قوالب طلب المخبر — كان الجدول الوحيد بالمخطّط الحامل لمبلغٍ بلا
     عمود عملة، فبقي خارج نطاق هذا الحارس بنيوياً حتى وصل البلاغ. */
  lab_order_templates:['currency',['cost']],
  /* M131: رسم عدم الحضور — كان آخر عمود مبلغ بالمخطّط بلا عمود عملة **يصفه**.
     وclinic_settings تحمل currency بنفس الصفّ لكنها عملة العيادة الافتراضية
     لا عملة الرسم، فالجدول بقي خارج هذه الخريطة بنيوياً حتى وصل السؤال. */
  clinic_settings:['no_show_fee_currency',['no_show_fee_amount']],
  /* v252: سجلُّ تاريخ الأسعار — العمود currency قائم منذ M125 لكن الجدول بقي
     خارج هذه الخريطة، فمرّ إدراجان بلا عملة وسجّلا تغيّرَ سعرٍ دولاريّ بوسم
     الليرة خمس مرات حيّاً. الاشتقاقُ بالتريغر يعطي عملة العيادة لا عملة العلاج. */
  treatment_price_history:['currency',['old_price','new_price']]
};
const files=fs.readdirSync('.').filter(f=>/\.(html|js)$/.test(f)&&f!=='sw.js');
const bad=[]; let checked=0, withMoney=0;
for(const f of files){ const src=fs.readFileSync(f,'utf8');
 for(const [tbl,[col,moneyCols]] of Object.entries(T)){
  const re=new RegExp("from\\('"+tbl+"'\\)","g"); let m;
  while((m=re.exec(src))){
    const head=src.slice(m.index,m.index+200);
    /* upsert عمليةُ كتابةٍ كاملة الحمولة كسواها، وكانت **غير مرئية** لهذا
       الحارس: clinic_settings تُكتب بها حصراً (صفٌّ واحد لكل مالك)، فإضافةُ
       الجدول للخريطة وحدها كانت زينةً لا حراسة — حارسٌ يمرّ ليس دليلاً على
       أنه يحرس الشيء الصحيح (#484). عُضّ بنزع العملة من الحمولة فأمسكها. */
    const op=/\.insert\s*\(/.test(head)?'insert':/\.update\s*\(/.test(head)?'update':/\.upsert\s*\(/.test(head)?'upsert':null;
    if(!op) continue; checked++;
    // حدّد نصّ الحمولة: inline أو تعريف المتغيّر
    let body=src.slice(m.index,m.index+1200);
    const vm=head.match(/\.(insert|update|upsert)\(\s*([A-Za-z_$][\w$]*)\s*[),]/);
    if(vm){ const v=vm[2];
      /* أقربُ تعريفٍ **قبل** موضع النداء لا أوّلُ تعريفٍ بالملف: اسم payload
         متكرّرٌ سبع مرات بصفحة الإعدادات وحدها، وأخذُ الأوّل كان يقرأ حمولةً
         أخرى فيصمت الحارس عن الحمولة الصحيحة — يمرّ وهو يحرس الشيء الخطأ. */
      const _before=src.slice(0,m.index);
      const _dre=new RegExp("(var|let|const)\\s+"+v+"\\s*=\\s*\\{[\\s\\S]{0,2000}?\\n\\s*\\};","g");
      let _d=null, dm=null;
      while((_d=_dre.exec(_before))) dm=_d;
      if(dm) body=dm[0]+'\n'+src.slice(m.index,m.index+400);
      if(new RegExp("\\b"+v+"\\."+col+"\\s*=").test(src)) body+=' '+col+':';
      /* v252: حمولةٌ مصفوفية تُبنى بـpush({...}) قبل النداء (سجلُّ تاريخ الأسعار):
         الجسمُ يبدأ من النداء فلا يرى الكائنات — فكان الحارس أعمى عنها حتى مع
         الجدول بالخريطة. كلُّ push يُفحص على حدة: مبلغٌ بلا عملته في أيٍّ منها = ناقص. */
      if(!dm){
        const _pre=new RegExp("\\b"+v+"\\.push\\(\\s*\\{","g"); let pm, pushes=[];
        while((pm=_pre.exec(_before))){ let d=0,k=pm.index+pm[0].length-1; for(;k<_before.length;k++){ if(_before[k]==='{')d++; else if(_before[k]==='}'){d--; if(!d)break;} } pushes.push(_before.slice(pm.index,k+1)); }
        if(pushes.length){
          let anyMoney=false;
          for(const pb of pushes){ const sm=moneyCols.some(c=>new RegExp("(^|[{,\\s])"+c+"\\s*:").test(pb)); if(!sm) continue; anyMoney=true; withMoney++;
            if(pb.indexOf(col+':')<0) bad.push(`${f}:${src.slice(0,m.index).split('\n').length}  ${tbl}.${op} (push)`); }
          if(anyMoney) continue;   // حُكم على مستوى الـpush — لا تُكرِّر الحكم على الجسم
        }
      }
    }
    const setsMoney=moneyCols.some(c=>new RegExp("(^|[{,\\s])"+c+"\\s*:").test(body));
    if(!setsMoney) continue;            // لا يضبط مبلغاً ⇒ لا يلزمه وسم
    withMoney++;
    if(body.indexOf(col+':')<0) bad.push(`${f}:${src.slice(0,m.index).split('\n').length}  ${tbl}.${op}`);
  }
 }}
/* استثناءات مبرَّرة — نسخٌ مشتقّة بـObject.assign ترث العملة من أصلها،
 * وارتدادُ ما-قبل-الهجرة يحذف الراتب وعملته معاً. المحلّل النصّي لا يرى
 * ذلك، والتصريح هنا أصدق من إسكات الحارس. */
const ALLOW = [
  'payouts.html:provider_payouts.insert',   // noEmp/noBreak = Object.assign({}, payload)
  'employees.html:clinic_doctors.update'    // legacyUpd يحذف monthly_salary و salary_currency معاً
];
const real = bad.filter(b => !ALLOW.some(a => {
  const [f,sig] = a.split(':'); return b.startsWith(f+':') && b.indexOf(sig)>=0;
}));
console.log('كتابات تضبط مبلغاً: ' + withMoney + ' · تحمل عملته: ' + (withMoney-bad.length)
          + ' · استثناءات مبرَّرة: ' + (bad.length-real.length) + ' · ناقصة: ' + real.length);
if (real.length) {
  console.log('\n🔴 كتابةُ مبلغٍ بلا عملته — أضِف الوسم أو برِّر الاستثناء:');
  real.forEach(b=>console.log('   '+b));
  process.exit(1);
}
console.log('✅ حارس وسم العملة: كل كتابةٍ تضبط مبلغاً تحمل عملته (' + withMoney + ' مساراً · ' + Object.keys(T).length + ' جدولاً).');

/* ═══ M128 — تماسك نطاق القفل ══════════════════════════════════════════
 * الثابت: **العملة تُقفل حيثما يُقفل المبلغ، وتُفتح حيثما يُفتح.**
 *
 * وُلد هذا الفحص من بلاغٍ حيّ: طلبُ مخبرٍ سُجّل بالليرة سهواً لم يقبل التحويل
 * للدولار، بينما مودالُه يعرض مبدّل عملةٍ مفتوحاً — والقفلُ نفسه كان يخبّئ
 * عطباً أخطر: مسارات تعديلٍ تُرسل عملة العيادة بدل عملة الصف، فيرتدّ الحفظ
 * بخطأ PostgREST خام بدل أن يُعاد الوسم بصمت. أي أن القفل كان يعمل شبكةَ
 * أمانٍ لباغٍ آخر — وهذا بالضبط ما لا يُترك بلا حارس.
 *
 * يُشتقّ الوضع الفعّال من ملفات الترحيل (آخرُ تعريفٍ لكل جدول هو النافذ)
 * ويُقارن بالخريطة المعلنة، ثم يُفرَض الشقّ الثاني على الكلاينت:
 *   • جدولٌ مقفول ⇒ كل تعديلاته كائناتٌ حرفية بلا أي ذكرٍ للعملة
 *     (أي: لا مسار يعدّل مبلغه أصلاً — التصحيح حذفٌ وإعادةُ إنشاء).
 *   • تعديلٌ بحمولةٍ متغيّرة (تحمل المبلغ والعملة معاً) ⇒ الجدول يجب أن
 *     يكون مفتوحاً، وإلا فالمستخدم يقابل رفضاً بدل تصحيح.
 */
try {
  const path = require('path');
  const LOCK_REASON = {
    ledger_sessions:     'payment_splits تشير إليها وجدارُ التطابق يقيس عملتها',
    ledger_payments:     'payment_splits تخزّن العملة المشتقّة منها',
    account_adjustments: 'ابنةُ الجلسة — بلا أي مسار تعديلٍ للمبلغ',
    lab_payments:        'بلا أي مسار تعديلٍ للمبلغ — التصحيح حذفٌ وإعادةُ إنشاء'
  };
  const NOLOCK_OK = ['lab_orders','expenses','provider_payouts','payment_plans',
                     'inventory_items','treatments','treatment_price_history',
                     'clinic_doctors','clinic_employees'];
  const MIG = path.join('migrations');
  const eff = {};
  fs.readdirSync(MIG).filter(f=>/^\d+.*\.sql$/.test(f))
    .sort((a,b)=>parseInt(a,10)-parseInt(b,10))
    .forEach(f=>{
      const src = fs.readFileSync(path.join(MIG,f),'utf8');
      const re = /ON\s+public\.(\w+)[\s\S]{0,120}?sydent_currency_guard\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'(lock|nolock)'\s*\)/g;
      let m; while ((m = re.exec(src))) eff[m[1]] = m[2];
    });
  if (!Object.keys(eff).length) throw new Error('صفر تريغر مقروء — الفحص فراغيّ، راجع المرساة');

  const problems = [];
  for (const t of Object.keys(LOCK_REASON))
    if (eff[t] !== 'lock') problems.push(`${t} يجب أن يبقى مقفولاً (${LOCK_REASON[t]}) — الوضع الفعّال: ${eff[t]||'غائب'}`);
  for (const t of NOLOCK_OK)
    if (eff[t] && eff[t] !== 'nolock') problems.push(`${t} مبلغه قابل للتعديل بالعميل فيجب ألّا يكون مقفولاً`);
  for (const t of Object.keys(eff))
    if (!LOCK_REASON[t] && NOLOCK_OK.indexOf(t) < 0)
      problems.push(`${t} جدولٌ جديد بتريغر عملة بلا تصنيف — صنِّفه بالخريطة المعلنة`);

  /* الشقّ الثاني: سلوك الكلاينت يطابق التصنيف */
  let locked = 0, opened = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const t of Object.keys(eff)) {
      const fre = new RegExp("from\\('" + t + "'\\)", 'g');
      let fm;
      while ((fm = fre.exec(src))) {
        const win = src.slice(fm.index, fm.index + 500);
        const at = win.indexOf('.update(');
        if (at < 0) continue;
        let d = 0, k = fm.index + at + 7, stop = k;
        for (let j = k; j < src.length && j < k + 4000; j++) {
          if (src[j] === '(') d++;
          else if (src[j] === ')') { d--; if (!d) { stop = j; break; } }
        }
        let arg = src.slice(k + 1, stop).trim();
        const line = src.slice(0, fm.index).split('\n').length;
        /* حمولةٌ بمتغيّر ⇒ يُحلّ تعريفه وإسناداته المتأخرة، وإلا حُكِم على
           اسمٍ لا على محتوى (تحديثُ حالةٍ بمتغيّر ليس تعديلَ مبلغ). */
        if (!arg.startsWith('{') && /^[A-Za-z_$][\w$]*$/.test(arg)) {
          const dm = src.match(new RegExp("(var|let|const)\\s+" + arg + "\\s*=\\s*\\{[\\s\\S]{0,2000}?\\n?\\s*\\}"));
          let body = dm ? dm[0] : '';
          const ar = new RegExp("\\b" + arg + "\\.(\\w+)\\s*=", 'g');
          let am; while ((am = ar.exec(src))) body += ' ' + am[1] + ':';
          arg = body || arg;
        }
        const touchesMoney = /(^|[{,\s.])currency\s*:/.test(arg)
          || (T[t] && T[t][1].some(c => new RegExp("(^|[{,\\s.])" + c + "\\s*:").test(arg)));
        if (!touchesMoney) continue;         // لا يمسّ مالاً ⇒ خارج الثابت
        if (eff[t] === 'lock') {
          problems.push(`${f}:${line} — تعديلٌ يمسّ مبلغ/عملة جدولٍ مقفول (${t}) ⇒ رفضٌ بدل تصحيح`);
          locked++;
        } else opened++;
      }
    }
  }
  if (problems.length) {
    console.log('\n🔴 تماسك نطاق القفل انكسر:');
    problems.forEach(p => console.log('   ' + p));
    process.exit(1);
  }
  console.log('✅ تماسك نطاق القفل: ' + Object.keys(LOCK_REASON).length + ' مقفولة بلا تعديل مبلغ · '
            + NOLOCK_OK.filter(t=>eff[t]).length + ' مفتوحة (' + opened + ' مسار تعديلٍ كامل الحمولة).');
} catch (e) {
  console.log('🔴 فشل فحص تماسك نطاق القفل: ' + e.message);
  process.exit(1);
}
