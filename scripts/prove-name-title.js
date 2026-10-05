/* مثبت SyDentName — يقصّ الوحدة الحيّة من supabase-init.js ويشغّلها بسياق vm.
   لا يعيد كتابة المنطق إطلاقاً (قاعدة #19 على الكود لا على وصفه). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('❌ ' + m); } }

// استثناءٌ غير ملتقَط أثناء إقلاع الصفحة = الحادثة نفسها. jsdom تُصعّده خارج
// أي try، فيُلتقط هنا ويُبلَّغ فشلاً مسمّى بدل أن يُسقط المثبت بلا رسالة.
process.on('uncaughtException', function (e) {
  console.error('❌ 🔴 استثناء أسقط إقلاع الصفحة (انحدار الحادثة): ' + String(e && e.message).slice(0, 160));
  process.exit(1);
});

// ── قصّ الوحدة الحيّة بموازنة أقواس ───────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'supabase-init.js'), 'utf8');
const START = 'window.SyDentName = (function () {';
const iStart = src.indexOf(START);
ok(iStart > -1, 'وحدة SyDentName غير موجودة بـsupabase-init.js');
ok(src.split(START).length - 1 === 1, 'SyDentName معرَّفة أكثر من مرة');
if (iStart < 0) { console.error('توقّف: لا مرساة'); process.exit(1); }
let d = 0, iEnd = -1;
for (let i = iStart + START.length - 1; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') d++;
  else if (ch === '}') { d--; if (d === 0) { iEnd = i; break; } }
}
ok(iEnd > -1, 'تعذّر إغلاق جسم الوحدة');
const block = src.slice(iStart, src.indexOf(';', iEnd) + 1);

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(block, ctx, { filename: 'SyDentName' });
const N = ctx.window.SyDentName;
ok(!!N && typeof N.split === 'function' && typeof N.compose === 'function'
   && typeof N.display === 'function', 'الواجهة الثلاثية غير مكتملة');

// ── 1) المتجهات الحيّة: كل أسماء الحسابات والأطباء الفعلية بالقاعدة ───────
// (قُرئت من الـDB لحظة الجلسة — لا أسماء مخترعة)
const LIVE = [
  ['د. أيهم غنيم',        'د.',   'أيهم غنيم'],
  ['أيهم غنيم',           '',     'أيهم غنيم'],
  ['د . احمد غنيم',       'د.',   'احمد غنيم'],
  ['د بكري القشطة',       'د.',   'بكري القشطة'],
  ['د وجيه حيبا',         'د.',   'وجيه حيبا'],
  ['د مجد شاكر',          'د.',   'مجد شاكر'],
  ['رامي يوسف',           '',     'رامي يوسف'],
  ['تجريبي',              '',     'تجريبي'],
  ['amjad baghdadi',      '',     'amjad baghdadi'],
  ['د عمر الحجي',         'د.',   'عمر الحجي'],
  ['د. عمر حشمة',         'د.',   'عمر حشمة'],
  ['د. مجد بركة',         'د.',   'مجد بركة'],
  ['د. وحيد يزبك',        'د.',   'وحيد يزبك'],
  ['د وسيم علوش',         'د.',   'وسيم علوش'],
  ['هبة',                 '',     'هبة'],
  ['مرمر',                '',     'مرمر']
];
LIVE.forEach(function (v) {
  const p = N.split(v[0]);
  ok(p.title === v[1], 'لقب «' + v[0] + '» = «' + p.title + '» بدل «' + v[1] + '»');
  ok(p.name === v[2], 'اسم «' + v[0] + '» = «' + p.name + '» بدل «' + v[2] + '»');
});

// ── 2) الثابت الأخطر: display لا يخترع لقباً غائباً ───────────────────────
['رامي يوسف', 'هبة', 'مرمر', 'تجريبي', 'amjad baghdadi'].forEach(function (s) {
  ok(N.display(s) === s, 'display اخترع لقباً لـ«' + s + '» ⇒ «' + N.display(s) + '»');
  ok(N.display(s).indexOf('د.') !== 0, 'display بدأ بلقب على اسم بلا لقب: ' + s);
});

// ── 3) اسم يبدأ بحرف الدال لا يُقصّ حرفُه لقباً ───────────────────────────
// ويشمل الألف التي تليها دال: «ادهم» ليس «أ.د. هم» — نقطة «أ.د» إلزامية.
[['دانا حسن', '', 'دانا حسن'],
 ['دعاء سليم', '', 'دعاء سليم'],
 ['دمر الشامي', '', 'دمر الشامي'],
 ['ادهم سليم', '', 'ادهم سليم'],
 ['أدهم سليم', '', 'أدهم سليم'],
 ['اديب الحلبي', '', 'اديب الحلبي']].forEach(function (v) {
  const p = N.split(v[0]);
  ok(p.title === v[1] && p.name === v[2], 'قُصّ حرف الدال خطأً بـ«' + v[0] + '» ⇒ ' + JSON.stringify(p));
});

// ── 4) صيَغ اللقب المطوّلة والأستاذية ─────────────────────────────────────
[['دكتور سامر', 'د.', 'سامر'],
 ['الدكتور سامر', 'د.', 'سامر'],
 ['دكتورة رنا', 'د.', 'رنا'],
 ['الدكتورة رنا', 'د.', 'رنا'],
 ['د.أيهم', 'د.', 'أيهم'],
 ['أ.د. سامر', 'أ.د.', 'سامر'],
 ['أ.د سامر', 'أ.د.', 'سامر'],
 ['ا.د. سامر', 'أ.د.', 'سامر'],
 ['أستاذ دكتور سامر', 'أ.د.', 'سامر']].forEach(function (v) {
  const p = N.split(v[0]);
  ok(p.title === v[1] && p.name === v[2], 'صيغة «' + v[0] + '» ⇒ ' + JSON.stringify(p));
});
// «أ.د» لا تُبتلع كـ«د.» — ترتيب الأنماط
ok(N.split('أ.د. سامر').title === 'أ.د.', 'أ.د ابتُلعت كـد.');

// ── 5) compose ────────────────────────────────────────────────────────────
ok(N.compose('د.', 'أيهم غنيم') === 'د. أيهم غنيم', 'compose الأساسية');
ok(N.compose('', 'أيهم غنيم') === 'أيهم غنيم', 'compose بلا لقب');
ok(N.compose('د.', '  أيهم   غنيم  ') === 'د. أيهم غنيم', 'compose لا يطبّع المسافات');
ok(N.compose('د.', '') === '', 'compose باسم فارغ يجب أن يُرجع فارغاً');
ok(N.compose('د.', '   ') === '', 'compose بمسافات فقط يجب أن يُرجع فارغاً');

// ── 6) استقرار: التركيب بعد التفكيك = التقنين، والتقنين متساوي القوة ─────
LIVE.concat([['أ.د. سامر'], ['دكتور سامر'], ['د.أيهم']]).forEach(function (v) {
  const s = v[0];
  const p = N.split(s);
  ok(N.compose(p.title, p.name) === N.display(s), 'compose∘split ≠ display لـ«' + s + '»');
  ok(N.display(N.display(s)) === N.display(s), 'display غير متساوي القوة لـ«' + s + '»');
});

// ── 7) حالات حدّية لا تُفرِّغ القيمة ──────────────────────────────────────
ok(N.display('د.') === 'د.', 'لقبٌ وحده يجب أن يُعاد كما هو لا يُفرَّغ');
ok(N.split('د.').title === '' && N.split('د.').name === 'د.', 'لقبٌ وحده ليس تفكيكاً صالحاً');
ok(N.display('') === '', 'الفراغ');
ok(N.display(null) === '', 'null');
ok(N.display(undefined) === '', 'undefined');
ok(N.display('  د   .   احمد  ') === 'د. احمد', 'تطبيع المسافات حول النقطة');

// ── 8) العقد مع الاشتقاق السيرفري (M123): 'عيادة ' || full_name ───────────
// الاسم المركَّب يجعل المشتقّ «عيادة د. …» بلا أي تعديل على التريغر.
ok('عيادة ' + N.compose('د.', 'أيهم غنيم') === 'عيادة د. أيهم غنيم', 'الاشتقاق لا ينتج «عيادة د. …»');

// ── 9) عقود مصدرية على مواضع الاستهلاك الحيّة ────────────────────────────
const stg = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
ok(/id="fTitle"/.test(stg), 'منتقي اللقب غائب عن settings.html');
ok((stg.match(/id="fTitle"/g) || []).length === 1, 'منتقي اللقب مكرّر');
ok((stg.match(/id="fName"/g) || []).length === 1, 'حقل الاسم مكرّر');
// العقدان انتقلا للغلافين المحروسين (القسم 12) — النداء المباشر ممنوع هنا.
ok(/window\.SyDentName\.split\(s\)/.test(stg), 'غلاف التفكيك لا ينادي الوحدة');
ok(/window\.SyDentName\.compose\(t, n\)/.test(stg), 'غلاف التركيب لا ينادي الوحدة');
// الحارس يجب أن يفحص الاسم المجرّد لا المركَّب (وإلا لن يفرغ أبداً)
ok(/if \(!bareName\) \{ showToast/.test(stg), 'حارس الاسم الفارغ يفحص المركَّب لا المجرّد');
// ما بعد التركيب بلا مساس: المرايا تكتب name المركَّب كما كان
ok(/data: \{ name: name, full_name: name, role: role \}/.test(stg), 'حمولة updateUser تغيّرت');
ok(/\.update\(\{ name: name \}\)[\s\S]{0,120}\.eq\('role', 'owner'\)/.test(stg), 'مرآة الموظفين تغيّرت');
// خيارا اللقب لا ثالث لهما، و«بدون» ممنوع (اللقب إلزامي للمالك)
const selBlk = stg.slice(stg.indexOf('id="fTitle"'), stg.indexOf('id="fTitle"') + 400);
ok((selBlk.match(/<option/g) || []).length === 2, 'عدد خيارات اللقب ليس اثنين');
ok(!/value=""/.test(selBlk), 'خيار «بدون» موجود — اللقب إلزامي للمالك');

const sb = fs.readFileSync(path.join(ROOT, 'sidebar.js'), 'utf8');
ok(/window\.SyDentName\.display\(rawName\)/.test(sb), 'السايدبار لا يقنّن اللقب');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/window\.SyDentName\.display\(_docRaw\)/.test(idx), 'اللوحة لا تقنّن اللقب');
// تدهور رشيق: المستهلكان لا ينكسران بغياب الوحدة
ok(/window\.SyDentName \?/.test(sb) && /window\.SyDentName \?/.test(idx), 'مستهلك بلا حارس وجود');

// ── 10) صفر كتابة: الوحدة لا تلمس أي جدول ────────────────────────────────
ok(!/\.from\(|localStorage|updateUser|\.upsert\(|\.update\(/.test(block), 'الوحدة تكتب أو تقرأ حالة خارجية');

// ── 11) طبقة الموظفين/الأطباء بلا مساس (سكوب المالك وحده) ────────────────
const before = require('child_process').execSync(
  'git -C ' + ROOT + ' diff --name-only', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
['doctors.html', 'employees.html'].forEach(function (f) {
  ok(before.indexOf(f) === -1, 'طبقة خارج السكوب تغيّرت: ' + f);
});

// ── 12) الثابت الدائم: كل مستهلك للوحدة محروسٌ بوجودها ───────────────────
// وُلد من حادثة حيّة: نداءٌ مباشر بمسار init الحرج أسقط صفحة الإعدادات
// كاملةً حين غابت الوحدة للحظة (سباق نشر — صنف v131). الغياب يجب أن
// يتدهور رشيقاً لا أن يرمي.
const GUARD = /stgNameOk\(\)|window\.SyDentName \?|window\.SyDentName &&/;
const scanFiles = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && f !== 'sw.js');
let consumers = 0;
scanFiles.forEach(function (f) {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === 'supabase-init.js') return;              // ملف التعريف نفسه
  txt.split('\n').forEach(function (line, i) {
    if (!/\bSyDentName\s*\./.test(line)) return;
    if (/^\s*(\/\/|\*|<!--)/.test(line)) return;      // تعليق
    consumers++;
    ok(GUARD.test(line), 'مستهلك غير محروس ' + f + ':' + (i + 1) + ' → ' + line.trim().slice(0, 90));
  });
});
ok(consumers >= 3, 'لم يُعثر على مستهلكين — المسح فارغ (توكيد فراغيّ)');
// وفي settings.html تحديداً: النداء المباشر ممنوع خارج الغلافين
const stgDirect = (stg.match(/window\.SyDentName\.(split|compose)\(/g) || []).length;
ok(stgDirect === 2, 'settings.html يجب أن تنادي الوحدة من غلافيها وحدهما (وُجد ' + stgDirect + ')');
ok(/function stgNameSplit/.test(stg) && /function stgNameCompose/.test(stg), 'غلافا التدهور الرشيق مفقودان');
ok(/stgNameSplit\(meta\.full_name/.test(stg), 'مسار التحميل لا يمرّ بالغلاف');
ok(/const name = stgNameCompose\(/.test(stg), 'مسار الحفظ لا يمرّ بالغلاف');

// ── 13) انحدار الحادثة: الصفحة تُقلع كاملةً بوجود الوحدة وبغيابها ────────
let jsdomOk = true;
try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) {
  console.warn('⚠️  jsdom غائبة — تخطّي اختبار الإقلاع (npm install jsdom --no-save)');
} else {
  const { JSDOM, VirtualConsole } = require('jsdom');
  // 🔴 كل إقلاع يأخذ نسخته: saveProfile تُزامن user_metadata محلياً (v186)،
  // فكائنٌ مشترك بين الإقلاعين يجعل الثاني يبدأ من مخرج الأول — تلوّثُ مثبتٍ
  // يقرأ كنجاحٍ كاذب للتدهور الرشيق.
  const mkUser = () => ({ id: 'u1', email: 'd@x.com',
    user_metadata: { full_name: 'أيهم غنيم', role: 'طبيب أسنان' } });
  const ROW = { owner_id: 'u1', clinic_name: 'عيادة د. أيهم غنيم', clinic_name_source: 'custom',
    syndicate_branch: 'دمشق', license_no: '12354', contact_phone: '0934012433',
    no_show_fee_enabled: true, no_show_fee_amount: 15000, currency: 'SYP' };

  function boot(killModule, done) {
    let html = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
    html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, function (m, src) {
      if (/vendor\/supabase/.test(src)) return '<script>window.supabase={createClient:function(){return window.__SB;}};</script>';
      const p = path.join(ROOT, src.replace(/^\//, '').replace(/\?.*$/, ''));
      if (!fs.existsSync(p)) return '<script></script>';
      let js = fs.readFileSync(p, 'utf8');
      if (killModule && /supabase-init/.test(src)) js += '\n;try{delete window.SyDentName;}catch(e){window.SyDentName=undefined;}\n';
      return '<script>\n' + js + '\n</script>';
    });
    const USER = mkUser();
    const errs = [];
    const writes = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errs.push(String(e.message)));
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://sydent.app/settings.html',
      virtualConsole: vc, pretendToBeVisual: true, beforeParse(w) {
      function qb(t, rows) { const a = { select: () => a, eq: () => a, in: () => a, order: () => a, limit: () => a,
        neq: () => a, is: () => a, gte: () => a, lte: () => a, or: () => a, ilike: () => a, not: () => a,
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        single: async () => ({ data: rows[0] || null, error: null }),
        insert: (p) => { writes.push({ table: t, op: 'insert', payload: p }); return a; },
        update: (p) => { writes.push({ table: t, op: 'update', payload: p }); return a; },
        upsert: (p) => { writes.push({ table: t, op: 'upsert', payload: p }); return a; },
        delete: () => a, then: (r) => r({ data: rows, error: null }) }; return a; }
      w.__SB = { auth: { getUser: async () => ({ data: { user: USER }, error: null }),
          getSession: async () => ({ data: { session: { user: USER, access_token: 't' } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
          updateUser: async (o) => { writes.push({ table: 'auth.users', op: 'updateUser', payload: o.data }); return { data: { user: USER }, error: null }; } },
        from: (t) => qb(t, t === 'clinic_settings' ? [ROW] : []),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        functions: { invoke: async () => ({ data: null, error: null }) },
        storage: { from: () => ({ list: async () => ({ data: [] }) }) } };
      w.addEventListener('unhandledrejection', ev => errs.push(String((ev.reason && ev.reason.message) || ev.reason)));
    } });
    setTimeout(function () {
      const w = dom.window, g = id => { const e = w.document.getElementById(id); return e ? e.value : null; };
      const snap = { errs: errs, name: g('fName'), phone: g('fContactPhone'), clinic: g('fClinicName') };
      // مسار الحفظ الحقيقي — العقد الذي يُكسِب الاسمَ لقبَه
      writes.length = 0;
      try { w.eval('saveProfile({preventDefault:function(){}})'); }
      catch (e) { snap.errs.push('saveProfile: ' + e.message); }
      setTimeout(function () {
        snap.writes = writes.slice();
        done(snap);
        try { w.close(); } catch (e) {}
      }, 1000);
    }, 2200);
  }

  function payloadOf(ws, table) {
    for (var i = 0; i < ws.length; i++) if (ws[i].table === table) return ws[i].payload;
    return null;
  }

  boot(false, function (a) {
    ok(a.errs.length === 0, 'إقلاع عادي رمى: ' + a.errs[0]);
    ok(a.name === 'أيهم غنيم', 'الاسم المجرّد بالإقلاع العادي: ' + a.name);
    ok(a.phone === '0934012433', 'رقم الاتصال لم يُحمَّل بالإقلاع العادي');
    ok(a.clinic === 'عيادة د. أيهم غنيم', 'اسم العيادة لم يُحمَّل بالإقلاع العادي');

    // 🔴 العقد الذي يُكسِب الاسمَ لقبَه فعلياً: اسمٌ مخزَّن بلا لقب + منتقٍ
    // على «د.» ⇒ الحفظ يكتب المركَّب للهوية **ولمرآتَي الأطباء والموظفين**،
    // فيتبعه السايدبار والروشتة واشتقاق اسم العيادة سيرفر-سايد.
    const au = payloadOf(a.writes, 'auth.users');
    ok(!!au, 'الحفظ لم يصل auth إطلاقاً');
    ok(au && au.full_name === 'د. أيهم غنيم', 'الهوية لم تكتسب اللقب: ' + (au && au.full_name));
    ok(au && au.name === 'د. أيهم غنيم', 'حقل name لم يكتسب اللقب');
    ok(au && au.role === 'طبيب أسنان', 'المسمى الوظيفي تغيّر بلا داعٍ');
    const emp = payloadOf(a.writes, 'clinic_employees');
    const doc = payloadOf(a.writes, 'clinic_doctors');
    ok(emp && emp.name === 'د. أيهم غنيم', 'مرآة الموظفين لم تتبع اللقب');
    ok(doc && doc.name === 'د. أيهم غنيم', 'مرآة الأطباء لم تتبع اللقب');
    // ولا يمسّ الحفظُ اسمَ العيادة إطلاقاً (يبقى بمساره المستقل)
    const cs = payloadOf(a.writes, 'clinic_settings');
    ok(cs && !('clinic_name' in cs), 'حفظ الملف الشخصي لمس اسم العيادة');

    boot(true, function (b) {
      // إعادة إنتاج الحادثة حرفياً: بلا الوحدة كانت هذه الثلاثة كلها فارغة
      ok(b.errs.length === 0, 'إقلاع بلا الوحدة رمى: ' + b.errs[0]);
      ok(b.phone === '0934012433', '🔴 انحدار الحادثة: إعدادات العيادة لا تُحمَّل بغياب الوحدة');
      ok(b.clinic === 'عيادة د. أيهم غنيم', '🔴 انحدار الحادثة: اسم العيادة لا يُحمَّل بغياب الوحدة');
      ok(b.name === 'أيهم غنيم', 'التدهور الرشيق يجب أن يعرض الاسم كاملاً بحقل واحد');
      // وبالتدهور: يُحفظ الحقل حرفياً — فيستحيل تركيب لقب فوق اسم يحمله
      const bu = payloadOf(b.writes, 'auth.users');
      ok(bu && bu.full_name === 'أيهم غنيم', 'التدهور ركّب لقباً رغم غياب الوحدة: ' + (bu && bu.full_name));
      finish();
    });
  });
  return;
}
finish();

function finish() {
console.log(fail === 0 ? ('✅ مثبت اللقب: ' + pass + '/' + (pass + fail))
                       : ('❌ ' + fail + ' فشل من ' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);
}
