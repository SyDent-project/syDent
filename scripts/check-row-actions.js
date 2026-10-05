#!/usr/bin/env node
/* =====================================================================
 * SyDent — check-row-actions.js  (v469: توحيد أزرار الصفوف الجانبية)
 * ---------------------------------------------------------------------
 * المعيار (قرار المالك 21 أيلول 2026): أزرارُ «طلبات الحجز» بصفحة المواعيد.
 * الطقم: SYDENT ROW-ACTIONS KIT بـtheme.css (.sy-acts / .sy-act / -danger / -ico).
 *
 * يفحص على الملفات الحيّة:
 *   ١. الطقمُ موجودٌ مرةً واحدة بـtheme.css، ولا ملفَّ آخر يعيد تعريف .sy-act
 *      (الاستثناءات المُعلَنة بالاسم في KIT_EXCEPTIONS فقط).
 *   ٢. الملفاتُ المُرحَّلة خاليةٌ من فئات الأزرار القديمة (LEGACY).
 *   ٣. كلُّ زرٍّ .sy-act: بلا style مضمَّن · زرُّ الأيقونة وحدها يحمل title
 *      وaria-label وأيقونتُه من القائمة المسموحة (📱 ⋮) · الزرُّ العادي يحمل
 *      كلمةً عربية · زرُّ حذفٍ/رفضٍ/إزالةٍ يحمل .sy-act-danger.
 *   ٤. كلُّ ملفٍّ مُرحَّل يستهلك الطقم فعلاً (حاويةٌ .sy-acts واحدةٌ على الأقل).
 *
 *   node scripts/check-row-actions.js              ← الفحص
 *   node scripts/check-row-actions.js --self-test  ← إثباتُ أن كلَّ قاعدةٍ تحمرّ
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* الملفاتُ المُرحَّلة ← فئاتُ الأزرار القديمة الممنوعة فيها. تُضاف الصفحةُ هنا عند ترحيلها. */
const MIGRATED = {
  'appointments.html': ['list-action-btn', 'bk-act', 'btn-schedule'],
  'appointments.css':  ['list-action-btn', 'bk-act', 'btn-schedule'],
  'appt-booking.js':   ['list-action-btn', 'bk-act'],
  'appt-views.js':     ['list-action-btn'],
  'patients.html':     ['btn-sm', 'dots-btn'],
  'patient-profile.html': ['del-btn', 'complete-btn', 'lab-btn', 'split-edit-btn'],
  'patient-profile.css':  ['del-btn', 'complete-btn', 'lab-btn', 'split-edit-btn'],
  'pp-clinical.js':    ['del-btn', 'lab-action-btn'],
  'pp-plan.js':        ['pv-btn-go'],   // خطط الأقساط (v471) · زيارات الخطة (v473)
  'pp-modules.js':     [],        // قوالب الزرعات
  'pp-appt.js':        ['appt-btn-main', 'appt-btn-warn', 'appt-btn-danger', 'btn-schedule-pp', 'btn-delete-pp'],
  'pp-extras.js':      [],        // بطاقات الملفات (v473)
  'treatments.html':   ['fav-btn', 'ed-btn', 'dup-btn', 'mat-btn', 'inact-btn', 'del-btn'],   // v474 («تفعيل» أخضر / «تعطيل» برتقالي شرطياً)
  'doctors.html':      ['btn-edit', 'btn-default-on', 'btn-default-off'],
  'employees.html':    ['btn-warning', 'btn-danger'],
  'payouts.html':      ['icon-btn'],                 // v475
  'expenses.html':     ['act-btn'],
  'inventory.html':    ['mg-copy', 'exp-finish'],
  'labs.html':         ['del-btn'],                  // .lab-action-btn يبقى لأزرار داخل نافذة الطلب (قوالب · نسخ الأمر)
  'provider-reports.html': ['btn-details', 'btn-print', 'btn-ledger', 'btn-pay', 'del-btn'],   // v477
  'audit-log.html':    [],                           // v478 («↩ استرجاع الكل» بشريط الأرشيف ليس زرَّ صف)
  'admin-render.js':   ['btn-accept', 'btn-reject', 'btn-upgrade', 'btn-renew', 'btn-suspend', 'btn-reactivate', 'btn-grace', 'btn-promote', 'btn-demote', 'btn-c360', 'btn-edit', 'btn-whatsapp', 'btn-pay'],   // v485
  'admin.css':         ['btn-accept', 'btn-reject', 'btn-upgrade', 'btn-renew', 'btn-suspend', 'btn-reactivate', 'btn-grace', 'btn-promote', 'btn-demote', 'btn-c360', 'btn-edit', 'btn-whatsapp', 'btn-pay'],
  'admin.html':        ['btn-pay'],
  'settings.html':     [],        // v487: الكراسي/الغرف
  'appt-wa.js':        [],        // v487: قائمة الانتظار
  'pp-dental.js':      [],        // v487: سجلُّ الزرعة
};
/* قواعدُ CSS تمسّ الطقم خارج theme.css — مُعلَنةٌ بالاسم فقط (سبب كلٍّ منها بجانبها بالملف). */
const KIT_EXCEPTIONS = {
  'appointments.css': ['.sy-acts > .time-track-btn'],   // زرُّ مرحلة الوقت الملوّن بالحالة يأخذ ارتفاعَ الطقم
  'patient-profile.css': ['.sy-acts > .appt-btn-stage'], // زرُّ المرحلة ببطاقة المريض — نفسُ الاستثناء
};
const ICON_ONLY_OK = ['📱', '⋮'];                 // رابطُ الواتساب السريع · قائمةُ «المزيد»
/* تسمياتٌ تُبنى من خريطة ثابتة — تُقبل بالاسم، وتُفحص الخريطةُ نفسُها: كلُّ تسميةٍ فيها بكلمة. */
const DYNAMIC_LABELS = {
  "' + nx.label + '": { file: 'pp-core.js', map: 'LAB_NEXT_STATUS' },   // «📤 إرسال للمخبر» · «📦 تم الاستلام…» …
};
const DANGER_RE = /\b(delete|del|reject|remove|unlink)[A-Z]\w*\(|\b(delete|remove)\w*\(|[a-z](Delete|Remove|Reject|Unlink)\w*\(|\breject\(|act:del/;   // + pfDeleteFile…
/* v472 (طلب المالك: «لازم تميّز»): الفعلُ الأساسيّ أخضر، وإعادةُ العمل برتقالية — بالمعالج لا بالنصّ،
   فلا يعود زرٌّ منها محايداً بصمت. زرٌّ أخضر لغير هذه المعالجات يحتاج إضافتَه هنا بقرار. */
const PRIMARY_RE = /confirmBookingRequest\(|recordApptTime\(.*confirmed_at|quickSchedulePlanned\(|quickSchedulePlannedFromProfile\(|planNewVisit\(|&pay=1'|prmMarkRecalled\(|completeSessionFromProfile\(|advanceLabOrder\(|planSetStatus\(.*completed|toggleActive\(|unlinkFromUser\(|finishBatch\(|openMoveModal\(.*purchase|openPayoutModal\(|restoreOne\(|\baccept\(|openConvertPicker\(|renewAccount\(|restartTrial\(|reactivateAccount\(|openPayModal\(|toggleCategoryActive\(.*true|act:(schedule|rebook|new)\b|act:open label:📝 حدّد النتيجة/;
const PRIMARY_NOT_RE = /confirmBookingRequest\(.*,\s*true\)/;   // «✏️ تعديل» الطلب يمرّ بنفس المعالج مع true
const NOT_DANGER_RE = /unlinkFromUser\(/;   // إلغاءُ «المعالج الافتراضي» تبديلُ حالة لا حذف — زرُّها الأخضر هو الحالةُ الفعّالة
const WARN_RE = /redoLabOrder\(|toggleActive\(|toggleCategoryActive\(.*false|suspendAccount\(|demoteFromAdmin\(/;   // v485: إيقافُ حسابٍ وإنزالٌ من Admin — قابلان للتراجع   // v474: البرتقالي = إعادةُ عمل أو إيقافٌ قابلٌ للتراجع (تعطيل العلاج/الحساب؛ شرطيٌّ مع «تفعيل» الأخضر)

function scanFiles() {
  return fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f) && f !== 'book.html' && f !== 'sw.js');
}

/* يلتقط وسمَ فتحِ <button|<a يحمل sy-act (لا sy-acts) مع نصّه حتى الإغلاق. */
function kitTags(src) {
  const out = [];
  const re = /<(button|a)\b/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index, q = false, j = i;
    for (; j < src.length; j++) { const c = src[j]; if (c === '"') q = !q; else if (c === '>' && !q) break; }
    const open = src.slice(i, j + 1);
    const cls = (open.match(/class=\\?"([^"\\]*)/) || [])[1] || '';
    if (!/(^|\s)sy-act(\s|$)/.test(cls)) continue;
    const close = src.indexOf('</' + m[1] + '>', j);
    const text = close > 0 ? src.slice(j + 1, close) : '';
    const line = src.slice(0, i).split('\n').length;
    out.push({ open, cls, text, line });
  }
  return out;
}

function check(files, readFn) {
  const errs = [];
  /* ١. الطقم */
  const theme = readFn('theme.css');
  const starts = theme.split('SYDENT ROW-ACTIONS KIT (').length - 1;
  if (starts !== 1) errs.push('theme.css: الطقمُ يجب أن يكون مرةً واحدة (وُجد ' + starts + ')');
  if (!/:root\[data-theme\] \.sy-act \{/.test(theme)) errs.push('theme.css: قاعدةُ .sy-act الأساسية غائبة');
  for (const f of files) {
    if (f === 'theme.css') continue;
    const src = readFn(f).replace(/\/\*[\s\S]*?\*\//g, '');   // التعليقات ليست قواعد
    const allowed = KIT_EXCEPTIONS[f] || [];
    const ruleRe = /([^{}\n;]*\.sy-acts?\b[^{};]*)\{/g; let r;
    while ((r = ruleRe.exec(src))) {
      const sel = r[1].trim();
      if (/['"`]/.test(sel) || /class=/.test(sel)) continue;          // نصٌّ داخل JS/HTML لا قاعدة CSS
      if (allowed.indexOf(sel) < 0) errs.push(f + ': قاعدةٌ محلية تمسّ الطقم «' + sel + '» — الشكلُ من theme.css وحده');
    }
  }
  /* ٢ + ٤. الملفاتُ المُرحَّلة */
  for (const f of Object.keys(MIGRATED)) {
    const src = readFn(f);
    for (const c of MIGRATED[f]) {
      const re = new RegExp('(class=\\\\?"[^"\\\\]*\\b' + c + '\\b|\\.' + c + '\\b)');
      const hit = src.match(re);
      if (hit) errs.push(f + ': فئةُ الزرّ القديمة «' + c + '» ما زالت مستعملة (' + hit[0].slice(0, 60) + ')');
    }
    if (/\.(html|js)$/.test(f) && !/sy-acts/.test(src)) errs.push(f + ': مُرحَّلٌ ولا يستهلك حاويةَ .sy-acts');
  }
  /* ٣. كلُّ زرٍّ على الطقم */
  for (const f of files) {
    const src = readFn(f);
    for (const t of kitTags(src)) {
      const where = f + ':' + t.line;
      if (/\sstyle=/.test(t.open)) errs.push(where + ': زرُّ الطقم يحمل style مضمَّناً — الشكلُ من الطقم وحده');
      const plain = t.text.replace(/<[^>]*>/g, '').replace(/\$\{[^}]*\}/g, '').trim();
      if (/\bsy-act-ico\b/.test(t.cls)) {
        if (!/\stitle=/.test(t.open) || !/\saria-label=/.test(t.open)) errs.push(where + ': زرُّ الأيقونة وحدها بلا title/aria-label');
        if (ICON_ONLY_OK.indexOf(plain) < 0) errs.push(where + ': أيقونةٌ وحدها «' + plain + '» خارج المسموح (' + ICON_ONLY_OK.join(' ') + ') — الأفعالُ بكلمة');
        if ((plain === '⋮') !== /\bsy-act-more\b/.test(t.cls)) errs.push(where + ': زرُّ «المزيد» ⋮ يحمل .sy-act-more (ولا يحملها غيره)');
      } else if (DYNAMIC_LABELS[plain]) {
        const d = DYNAMIC_LABELS[plain], src2 = readFn(d.file);
        const body = (src2.split('var ' + d.map + ' = {')[1] || '').split('};')[0];
        const labels = [...body.matchAll(/label:\s*'([^']*)'/g)].map(x => x[1]);
        if (!labels.length) errs.push(where + ': خريطةُ التسميات ' + d.map + ' غائبة بـ' + d.file);
        labels.filter(l => !/[\u0621-\u064A]/.test(l)).forEach(l => errs.push(d.file + ': تسميةٌ بلا كلمة «' + l + '» بـ' + d.map));
      } else if (!/[\u0621-\u064A]/.test(plain)) {
        errs.push(where + ': زرٌّ بلا كلمة «' + plain + '» — الأيقونةُ وحدها للأدوات المسموحة فقط (.sy-act-ico)');
      }
      const act = (t.open.match(/data-appt-act=\\?"([a-z]+)/) || [])[1];
      /* المعالجُ بالسمة onclick، أو بالتفويض data-appt-act (تبويب المواعيد ببطاقة المريض) + التسمية */
      const oc = ((t.open.match(/onclick=\\?"((?:\\'|[^"\\])*)/) || [])[1] || '') + (act ? ' act:' + act + ' label:' + t.text.replace(/<[^>]*>/g, '').trim() : '');   // يحتمل \' داخل نصوص JS
      if (DANGER_RE.test(oc) && !NOT_DANGER_RE.test(oc) && !/\bsy-act-danger\b/.test(t.cls)) errs.push(where + ': فعلُ حذفٍ/رفضٍ بلا .sy-act-danger (' + oc.slice(0, 50) + ')');
      const isP = /\bsy-act-primary\b/.test(t.cls), isW = /\bsy-act-warn\b/.test(t.cls);
      const wantP = PRIMARY_RE.test(oc) && !PRIMARY_NOT_RE.test(oc);
      if (wantP !== isP) errs.push(where + (isP ? ': أخضرُ لفعلٍ غير مُعلَن أساسياً' : ': فعلٌ أساسيٌّ بلا .sy-act-primary') + ' (' + oc.slice(0, 50) + ')');
      if (WARN_RE.test(oc) !== isW) errs.push(where + (isW ? ': برتقاليٌّ لفعلٍ ليس إعادة' : ': إعادةٌ بلا .sy-act-warn') + ' (' + oc.slice(0, 50) + ')');
      if ((isP || isW) && /\bsy-act-(ico|danger)\b/.test(t.cls)) errs.push(where + ': تنويعُ لونٍ مع أيقونةٍ وحدها أو حذف');
      if (isP && isW && !/\?/.test(t.cls)) errs.push(where + ': أخضرُ وبرتقاليٌّ معاً بلا شرط');
    }
  }
  return errs;
}

function selfTest() {
  /* كلُّ قاعدةٍ تُكسَر عمداً على نسخةٍ بالذاكرة ويجب أن تحمرّ (#646-٤). */
  const files = scanFiles();
  const base = {}; files.forEach(f => base[f] = read(f));
  const cases = [
    ['طقمٌ مكرّر', 'theme.css', s => s + '\n/* SYDENT ROW-ACTIONS KIT (dup) */'],
    ['قاعدةٌ محلية', 'appointments.css', s => s + '\n.list-item .sy-act { height: 28px; }'],
    ['فئةٌ قديمة', 'appt-views.js', s => s.replace('class="sy-act" data-slot="2" onclick="editAppt', 'class="list-action-btn" data-slot="2" onclick="editAppt')],
    ['style مضمَّن', 'appt-booking.js', s => s.replace('<button class="sy-act sy-act-primary" title="تأكيد كموعد"', '<button class="sy-act sy-act-primary" style="color:red" title="تأكيد كموعد"')],
    ['أيقونةٌ بلا title', 'appt-booking.js', s => s.replace('class="sy-act sy-act-ico" title="مراسلة واتساب" aria-label="مراسلة واتساب"', 'class="sy-act sy-act-ico"')],
    ['زرٌّ بلا كلمة', 'appt-views.js', s => s.replace('✏️ تعديل</button>', '✏️</button>')],
    ['حذفٌ بلا أحمر', 'appt-views.js', s => s.replace('class="sy-act sy-act-danger" data-slot="3" onclick="deleteAppt', 'class="sy-act" data-slot="3" onclick="deleteAppt')],
    ['مُرحَّلٌ بلا حاوية', 'appt-booking.js', s => s.split('sy-acts').join('xx-acts')],
    ['⋮ بلا -more', 'patients.html', s => s.replace('sy-act sy-act-ico sy-act-more" onclick="toggleDotsMenu', 'sy-act sy-act-ico" onclick="toggleDotsMenu')],
    ['واتساب المتابعة بلونٍ خاص', 'patients.html', s => s.replace('<button class="sy-act" data-slot="1" onclick="prmDoWaRecall(', '<button class="sy-act" data-slot="1" style="background:var(--wa)" onclick="prmDoWaRecall(')],
    ['فئةُ المرضى القديمة', 'patients.html', s => s.replace('<button class="sy-act" data-slot="2" onclick="prmDoCopyBday(', '<button class="btn-sm" data-slot="2" onclick="prmDoCopyBday(')],
    ['حذفُ جلسةٍ بلا أحمر', 'patient-profile.html', s => s.replace('class="sy-act sy-act-danger" data-slot="3" onclick="delSession(', 'class="sy-act" data-slot="3" onclick="delSession(')],
    ['تسميةُ مخبرٍ بلا كلمة', 'pp-core.js', s => s.replace("label: '🤝 تم التركيب'", "label: '🤝'")],
    ['زرُّ روشتةٍ أيقونةً وحدها', 'pp-clinical.js', s => s.replace('📋 نسخ</button>', '📋</button>')],
    ['تسجيلُ دفعةٍ محايد', 'patients.html', s => s.replace('<button class="sy-act sy-act-primary" onclick="event.stopPropagation();location.href=\'patient-profile.html?id=${p.id}&pay=1', '<button class="sy-act" onclick="event.stopPropagation();location.href=\'patient-profile.html?id=${p.id}&pay=1')],
    ['إعادةُ المخبر محايدة', 'pp-clinical.js', s => s.replace('class="sy-act sy-act-warn" data-slot="2" onclick="redoLabOrder(', 'class="sy-act" data-slot="2" onclick="redoLabOrder(')],
    ['تعديلٌ أخضر', 'pp-clinical.js', s => s.replace('class="sy-act" data-slot="3" onclick="editLabOrder(', 'class="sy-act sy-act-primary" data-slot="3" onclick="editLabOrder(')],
    ['جدولةُ الموعد المخطّط محايدة', 'pp-appt.js', s => s.replace('class="sy-act sy-act-primary" data-appt-act="schedule"', 'class="sy-act" data-appt-act="schedule"')],
    ['حذفُ المخطّط بلا أحمر', 'pp-appt.js', s => s.replace('class="sy-act sy-act-danger" data-appt-act="delplanned"', 'class="sy-act" data-appt-act="delplanned"')],
    ['حذفُ ملفٍّ بلا أحمر', 'pp-extras.js', s => s.replace('class="sy-act sy-act-danger" onclick="pfDeleteFile(', 'class="sy-act" onclick="pfDeleteFile(')],
    ['تفعيلُ العلاج بلا أخضر', 'treatments.html', s => s.replace("'<button class=\"sy-act' + (isInactive ? ' sy-act-primary' : ' sy-act-warn') + '\" onclick=\"toggleActive(", "'<button class=\"sy-act\" onclick=\"toggleActive(")],
    ['تعديلُ العلاج أخضر', 'treatments.html', s => s.replace('class="sy-act" onclick="editTreatment(', 'class="sy-act sy-act-primary" onclick="editTreatment(')],
    ['إعادةُ المخبر (صفحة المخابر) محايدة', 'labs.html', s => s.replace('class="sy-act sy-act-warn" data-slot="2" onclick="redoLabOrder(', 'class="sy-act" data-slot="2" onclick="redoLabOrder(')],
    ['تعطيلُ التصنيف أخضر', 'expenses.html', s => s.replace("class=\"sy-act sy-act-warn\" onclick=\"toggleCategoryActive(", "class=\"sy-act sy-act-primary\" onclick=\"toggleCategoryActive(")],
    ['حذفُ صنف المخزون بلا أحمر', 'inventory.html', s => s.replace('class="sy-act sy-act-danger" onclick="deleteItem(', 'class="sy-act" onclick="deleteItem(')],
    ['تسجيلُ دفعة الطبيب محايد', 'provider-reports.html', s => s.replace("'<button class=\"sy-act sy-act-primary\" onclick=\"openPayoutModal(", "'<button class=\"sy-act\" onclick=\"openPayoutModal(")],
    ['رفضُ طلب التسجيل بلا أحمر', 'admin-render.js', s => s.replace('class="sy-act sy-act-danger" onclick="reject(', 'class="sy-act" onclick="reject(')],
    ['إيقافُ الحساب بلا برتقالي', 'admin-render.js', s => s.replace('class="sy-act sy-act-warn" onclick="suspendAccount(', 'class="sy-act" onclick="suspendAccount(')],
    ['تجديدُ الاشتراك محايد', 'admin-render.js', s => s.replace('<button class="sy-act sy-act-primary" onclick="renewAccount(', '<button class="sy-act" onclick="renewAccount(')],
    ['حذفُ الموظف بلا أحمر', 'employees.html', s => s.replace('class="sy-act sy-act-danger" onclick="deleteEmployee(', 'class="sy-act" onclick="deleteEmployee(')],
    ['المعالجُ الافتراضي بلا أخضر', 'doctors.html', s => s.replace('class="sy-act sy-act-primary" onclick="unlinkFromUser(', 'class="sy-act" onclick="unlinkFromUser(')],
  ];
  let ok = 0;
  for (const [name, f, mut] of cases) {
    const mutated = mut(base[f]);
    if (mutated === base[f]) { console.log('  ✗ الحالة «' + name + '» لم تُطبَّق — المرساةُ تغيّرت'); continue; }
    const errs = check(files, x => x === f ? mutated : base[x]);
    if (errs.length) { ok++; console.log('  ✓ ' + name + ' ⇐ ' + errs[0]); }
    else console.log('  ✗ ' + name + ' مرّت خضراء!');
  }
  const clean = check(files, x => base[x]);
  console.log((ok === cases.length && !clean.length ? '✅' : '⛔') + ' الإثبات العكسي: ' + ok + '/' + cases.length + ' تحمرّ · الحالةُ الحيّة ' + (clean.length ? 'حمراء' : 'خضراء'));
  process.exit(ok === cases.length && !clean.length ? 0 : 1);
}

if (process.argv.includes('--self-test')) selfTest();
const errs = check(scanFiles(), read);
if (errs.length) { errs.forEach(e => console.log('  ✗ ' + e)); console.log('⛔ طقم أزرار الصفوف: ' + errs.length + ' خرق'); process.exit(1); }
const n = scanFiles().reduce((a, f) => a + kitTags(read(f)).length, 0);
console.log('✅ طقم أزرار الصفوف: ' + n + ' زراً على الطقم بـ' + Object.keys(MIGRATED).length + ' ملفاً مُرحَّلاً · صفر فئات قديمة · صفر شكل محلي.');
