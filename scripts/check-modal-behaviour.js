#!/usr/bin/env node
/* حارس سلوك النوافذ (v440) — يقرأ **الملفات الحيّة**، لا شاهداً مقتطعاً.
   وُلد من غلطةٍ متكرّرة: أُصلح الإغلاقُ بنقرةٍ خارجية بالـHTML بينما مستمعٌ
   منفصلٌ بالجافاسكربت ظلّ يُغلق المودال ويمحو نموذجاً معبّأً — والمثبت كان يفحص
   الشاهد المقتطع فلم يره، فخرج الإصلاح «منجزاً» وهو لا يعمل على المنصة.
   القاعدة: كل سلكٍ يمكنه إغلاق نافذة — سمةً بالـHTML أو addEventListener
   بالجافاسكربت — يُحصى هنا على الملف نفسه، بكل صفحاتٍ رُحّلت للعُدّة (sy-m).
   READ_ONLY: نوافذ لا بيانات فيها، يجوز إغلاقها بنقرةٍ خارجية (تُعلَن صراحةً). */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let bad = 0, okN = 0;
const fail = m => { bad++; console.log('  ✗ ' + m); };
const pass = m => { okN++; console.log('  ✓ ' + m); };

/* نوافذُ القراءة المسموح إغلاقها بنقرةٍ خارجية — تُضاف واحدةً واحدةً بمراجعة */
const READ_ONLY = new Set(['waitlistModal', 'srcModal', 'prmModal', 'pfLightbox', 'printChoiceModal',
                           'evfModalOverlay', 'kbsModal', 'c360Overlay', 'bkProgressOverlay',
                           'detailsModal', 'ledgerModal',
                           'clinicNameSyncModal', 'waPreviewModal', 'playerModal']);

/* الصفحات المُرحَّلة للعُدّة: كل .modal-overlay فيها تحمل sy-m */
const MIGRATED = ['appointments.html', 'patients.html', 'patient-profile.html',
                  'treatments.html', 'doctors.html', 'employees.html', 'payouts.html',
                  'expenses.html', 'inventory.html', 'labs.html',
                  'provider-reports.html', 'audit-log.html',
                  'settings.html', 'learn.html', 'subscription.html', 'auth.html',
                  'admin.html'];
const SCRIPTS = { 'appointments.html': ['appt-booking.js', 'appt-modal.js', 'appt-time.js', 'appt-views.js', 'appt-wa.js'], 'patients.html': [], 'patient-profile.html': ['pp-appt.js', 'pp-clinical.js', 'pp-core.js', 'pp-dental.js', 'pp-extras.js', 'pp-modules.js', 'pp-plan.js', 'pp-timeline.js', 'pp-wa.js'], 'treatments.html': [], 'doctors.html': [], 'employees.html': [], 'payouts.html': [], 'expenses.html': [], 'inventory.html': [], 'labs.html': [], 'provider-reports.html': [], 'audit-log.html': [], 'settings.html': [], 'learn.html': [], 'subscription.html': [], 'auth.html': [], 'admin.html': ['admin-render.js'] };

for (const page of MIGRATED) {
  const html = R(page);
  /* v453: id قد يسبق class (auth · subscription) وقد تسبق modal-overlay فئاتٌ أخرى */
  const ids = [...html.matchAll(/<div (?:class="[^"]*\bmodal-overlay\b[^"]*" id="([^"]+)"|id="([^"]+)"[^>]*class="[^"]*\bmodal-overlay\b[^"]*")/g)].map(m => m[1] || m[2]);
  if (!ids.length) { fail(`${page}: لا نوافذ — الصفحة بقائمة المُرحَّل خطأً؟`); continue; }
  const total = ids.length;
  const kit = (html.match(/class="[^"]*\bmodal-overlay\b[^"]*\bsy-m\b|class="[^"]*\bsy-m\b[^"]*\bmodal-overlay\b/g) || []).length;
  if (kit !== total) fail(`${page}: ${kit}/${total} نافذة على العُدّة — المُرحَّل يحمل sy-m على كلٍّ`);
  else pass(`${page}: ${kit}/${kit} نافذة على العُدّة`);

  let js = html;
  for (const f of (SCRIPTS[page] || [])) js += R(f);
  /* حلقةٌ عامّة تُلبس كلَّ نوافذ الصفحة إغلاقاً بنقرةٍ خارجية */
  const sweepWired = /querySelectorAll\(\s*'\.modal-overlay'\s*\)[\s\S]{0,400}?addEventListener\(\s*'click'[\s\S]{0,200}?target\s*===?\s*\w+/.test(js);
  if (sweepWired) fail(`${page}: حلقةٌ تُلبس كلَّ النوافذ إغلاقاً بنقرةٍ خارجية — تمحو النماذجَ المعبّأة`);

  for (const id of ids) {
    const inline = new RegExp('id="' + id + '"[^>]*onclick="[^"]*target\\s*===?\\s*this').test(html);
    const listen = new RegExp("getElementById\\(\\s*'" + id + "'\\s*\\)\\.addEventListener\\(\\s*'click'").test(js);
    /* v447: سلكٌ على المستند يقارن هويّةَ الهدف — لا يراه فحصُ المعرّف المباشر
       (صفحةُ الرواتب كانت تُغلق نموذجَ الدفعة هكذا). */
    const docLevel = new RegExp("target[^;\\n]{0,24}\\.id\\s*===?\\s*'" + id + "'").test(js);
    /* v448: شكلان آخران رصدتهما الجولة — مقارنةٌ بعنصرٍ مجلوبٍ بالمعرّف
       (`ev.target === $('id')`) وحلقةٌ تُلبس كلَّ `.modal-overlay` بالصفحة
       إغلاقاً بنقرةٍ خارجية (تُصيب كلَّ نوافذ الصفحة دفعةً واحدة). */
    const byHelper = new RegExp("target\\s*===?\\s*[\\w$.]+\\(\\s*'" + id + "'\\s*\\)").test(js);
    const wired = inline || listen || docLevel || byHelper || sweepWired;
    if (READ_ONLY.has(id)) {
      if (wired) pass(`${page}/${id}: نافذةُ قراءة — الإغلاق بنقرةٍ خارجية باقٍ`);
      else fail(`${page}/${id}: نافذةُ قراءة فقدت الإغلاق بنقرةٍ خارجية`);
    } else if (wired) {
      fail(`${page}/${id}: تُغلق بنقرةٍ خارجية (${[inline && 'سمة onclick', listen && 'addEventListener', docLevel && 'مستمعٌ على المستند', byHelper && 'مقارنةٌ بمُساعِد'].filter(Boolean).join(' + ')}) — نافذةٌ فيها بياناتٌ تُمحى بلا إنذار`);
    } else pass(`${page}/${id}: لا إغلاق بنقرةٍ خارجية`);
  }
  /* بنيةُ الجسم: الذيلُ يثبت والجسمُ وحده يتمرّر */
  for (const id of ids) {
    const a = html.indexOf('id="' + id + '"');
    const seg = html.slice(a, html.indexOf('<div class="modal-overlay', a + 5) > 0 ? html.indexOf('<div class="modal-overlay', a + 5) : html.indexOf('<script', a));
    if (!/class="[^"]*\bmodal-body\b/.test(seg)) fail(`${page}/${id}: بلا modal-body — الرأسُ والذيلُ يتمرّران مع المحتوى`);
  }
}
/* ── تطابقُ محرّرات الرسائل (v442) ──────────────────────────────────────────
   طلبُ المالك: كل محرّر رسالةٍ بالمنصة يُبنى بشكل «الرسالة الحرة» ببطاقة المريض.
   الطقمُ المعياري بـtheme.css، وهنا نحرس أن كل سطحِ تحريرٍ يستهلكه فعلاً — وأن
   أحداً لم يُعِد تعريفَه محلياً بصفحةٍ فيتفرّع الشكلُ ثانيةً. */
const COMPOSER_CLASSES = ['wa-info-row', 'wa-ai-card', 'wa-ai-head', 'wa-sec-label', 'wa-field',
                          'wa-ai-btn', 'wa-msg-sec', 'wa-msg-head', 'wa-count', 'wa-tpl-row',
                          'wa-icon-btn', 'wa-modal-message', 'wa-hint'];
const KIT = R('theme.css');
for (const c of COMPOSER_CLASSES) {
  /* v494 (مراجعة): محدِّدٌ فعليّ (يليه { أو , أو : أو مسافة) — لا مجرّد سلسلةٍ جزئية تقبل .wa-ai-cardX */
  if (!new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(KIT)) fail(`theme.css: طقم المحرّر ينقصه .${c}`);
}
if (!/SYDENT COMPOSER KIT/.test(KIT)) fail('theme.css: كتلة طقم المحرّر مفقودة');
else pass(`theme.css: طقم المحرّر كاملٌ (${COMPOSER_CLASSES.length} فئة)`);
/* السطحان المستهلكان — الرسالة الحرة (ثابتة بالـHTML) ومحرّر متابعة المرضى (يُبنى بالجافاسكربت) */
const SURFACES = [['patient-profile.html', 'ppWaComposeModal'], ['patients.html', 'prmAiOpenPreview']];
/* أسطحُ نصٍّ أخرى يكتبها الطبيب للمريض: تتبع الطقم نفسه بقدر طبيعتها —
   بطاقةُ مساعدٍ محكومةٌ بالبوابة (إن وُجد ذكاءٌ بالسطح) · صفُّ قوالبَ بأيقونة ·
   قسمُ نصٍّ بعنوانٍ وعدّادٍ وتلميح. (طلبُ المالك v444 بعد بلاغ مودال التعليمات.) */
const TEXT_SURFACES = [
  ['patient-profile.html', 'postOpModal', ['wa-ai-card', 'wa-ai-head', 'wa-ai-btn', 'wa-tpl-row', 'wa-icon-btn', 'wa-msg-sec', 'wa-count', 'wa-hint', 'wa-modal-message']],
  ['patient-profile.html', 'rxModal',     ['wa-sec-label', 'wa-field', 'wa-tpl-row', 'wa-icon-btn']],
  ['patient-profile.html', 'postOpTemplateEditModal', ['wa-ai-card', 'wa-ai-head', 'wa-ai-btn', 'wa-msg-sec', 'wa-count', 'wa-hint', 'wa-modal-message']],
  ['patient-profile.html', 'ppWaModal',   ['wa-info-row', 'wa-msg-sec', 'wa-count', 'wa-hint']],
  ['appointments.html',    'waReminderModal', ['wa-info-row', 'wa-msg-sec', 'wa-count', 'wa-hint']]
];
for (const [f, mid, need] of TEXT_SURFACES) {
  const src = R(f);
  const a0 = src.indexOf('id="' + mid + '"');
  if (a0 < 0) { fail(`${f}: ${mid} مفقود`); continue; }
  const nx = src.indexOf('<div class="modal-overlay', a0);
  const seg = src.slice(a0, nx > 0 ? nx : src.indexOf('<script', a0));
  const miss = need.filter(c => seg.indexOf(c) === -1);
  if (miss.length) fail(`${f}/${mid}: خارجَ الطقم المعياري — ناقص: ${miss.join('، ')}`);
  else pass(`${f}/${mid}: على الطقم المعياري`);
}
/* v456: الحوارُ الموحّد — الصفحاتُ المُحوَّلة لا تعود لنوافذ المتصفّح الأصلية.
   القائمةُ تنمو مع كل دفعة، فما حُوّل لا يرتدّ. */
{
  const sm = R('sy-modal.js');
  /* v494 (مراجعة): مطابقةٌ دقيقة — `window.SyDialog =` لا بادئةً تقبل SyDialogX */
  if (!/SYDENT_DIALOG_START/.test(sm) || !/window\.SyDialog\s*=\s*\{/.test(sm) || !/window\.SyModal\s*=\s*\{/.test(sm)
      || !/confirm:\s*function/.test(sm) || !/prompt:\s*function/.test(sm) || !/alert:\s*function/.test(sm))
    fail('sy-modal.js: العُدّة أو الحوارُ الموحّد مفقود');
  else pass('sy-modal.js: العُدّة والحوارُ الموحّد موجودان');
  if (/SYDENT_MODAL_KIT_START|SYDENT_DIALOG_START/.test(R('sidebar.js')))
    fail('sidebar.js: نسخةٌ ثانية من العُدّة/الحوار — المصدرُ واحد (sy-modal.js)');
  /* كلُّ صفحةٍ تستعمل SyDialog أو تحمل نوافذ sy-m يجب أن تحمّل sy-modal.js فعلاً —
     درسُ صفحة الدخول: كانت «تمرّ» بالشاهد لأنه يحقن العُدّة، والصفحةُ الحقيقية بلاها. */
  for (const f of fs.readdirSync(ROOT).filter(x => /\.html$/.test(x) && x !== 'book.html')) {
    const h = R(f);
    let uses = /SyDialog\.|class="[^"]*\bsy-m\b/.test(h);
    const m = h.match(/<script src="([\w-]+\.js)\?v=/g) || [];
    for (const tag of m) {
      const js = tag.replace(/<script src="|\?v=/g, '');
      if (js !== 'sy-modal.js' && fs.existsSync(path.join(ROOT, js)) && /SyDialog\./.test(R(js))) uses = true;
    }
    if (uses && !/<script src="sy-modal\.js\?v=/.test(h)) fail(`${f}: تستعمل الحوار/العُدّة ولا تحمّل sy-modal.js`);
  }
  /* v461: صفحاتُ العيادة كلُّها بلا نوافذ متصفّحٍ أصلية — قاعدةٌ شاملة بدل
     قوائمَ تُحدَّث يدوياً. يُستثنى: التعليقات · الملاذُ الأخيرُ المُعلَن
     `window.prompt` (مسبوقٌ بنقطة فلا يلتقطه النمط) · دالةُ المنتقي المحليّة
     المسمّاة confirm بـsupabase-init.js. الأدمن خارج القاعدة حتى تكتمل دفعتُه. */
  /* v462: الأدمن داخل القاعدة — المنصةُ كلُّها بلا نافذة متصفّحٍ أصلية */
  const clinic = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f));
  let offenders = [];
  for (const f of clinic) {
    const src = R(f);
    const lines = src.split('\n');
    const re = /(?<![.\w])(confirm|prompt|alert)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const ln = src.slice(0, m.index).split('\n').length - 1;
      const t = (lines[ln] || '').trim();
      if (/^(\/\/|\*|\/\*)/.test(t) || /function confirm\(\)/.test(t)) continue;
      offenders.push(`${f}:${ln + 1} ${m[1]}`);
    }
  }
  if (offenders.length) fail(`نوافذُ متصفّحٍ أصلية عادت للمنصة — استعمل SyDialog: ${offenders.slice(0, 6).join(' · ')}`);
  else pass(`المنصةُ كلُّها (${clinic.length} ملفاً): صفرُ confirm/prompt/alert أصلية`);
}

/* v458: الخطورةُ تُقرَّر بالفعل لا بنصّ الرسالة — كان التحويلُ الآليُّ يقرأ
   الرسالةَ، فموضعٌ رسالتُه بمتغيّر (حذفُ مصروف) خرج بزرٍّ أخضر. القاعدة: تأكيدٌ
   داخل دالةٍ اسمُها حذف/إزالة/أرشفة يلبس الزرَّ الأحمر. */
{
  const DESTRUCTIVE = /(delete|remove|destroy|archive|purge|wipe)/i;
  for (const f of ['expenses.html', 'inventory.html', 'doctors.html', 'treatments.html', 'patients.html',
                   'audit-log.html', 'payouts.html', 'provider-reports.html', 'labs.html', 'employees.html',
                   'settings.html', 'index.html', 'appointments.html', 'patient-profile.html',
                   'pp-dental.js', 'pp-clinical.js', 'pp-modules.js', 'pp-appt.js', 'pp-wa.js', 'pp-extras.js']) {
    const src = R(f);
    const bad = [];
    const re = /SyDialog\.confirm\(\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      if (/danger\s*:/.test(m[1])) continue;                 /* أُعلنت صراحةً */
      const before = src.slice(0, m.index);
      /* أقربُ دالةٍ **مسمّاة** قبل الموضع: ردودُ النداء المجهولة (find/forEach)
         تسبقه عادةً فتُخفي اسمَ الدالة الحاضنة. */
      const named = [...before.matchAll(/function\s+([\w$]+)\s*\(/g)];
      const fn = named.length ? named[named.length - 1][1] : '';
      if (DESTRUCTIVE.test(fn)) bad.push(fn || '(بلا اسم)');
    }
    if (bad.length) fail(`${f}: تأكيدُ حذفٍ بلا زرٍّ أحمر — ${bad.join('، ')}`);
    else pass(`${f}: كلُّ تأكيدات الحذف بالزرّ الأحمر`);
  }
}

/* v454: النوافذ المشتركة بـsupabase-init.js (قفلُ الموظف/الوضع · منتقي الألوان)
   تُبنى بالجافاسكربت لكل صفحات المنصة ⇒ تُحرس نصّياً هنا. */
{
  const si = R('supabase-init.js');
  const checks = [
    ['قفلُ الموظف/الوضع على العُدّة', (si.match(/sd-lock-modal-overlay modal-overlay sy-m open/g) || []).length === 2],
    ['قفلُ الموظف/الوضع برأسٍ وزرِّ إغلاق', (si.match(/class="modal-head"><h3 id="sd/g) || []).length === 2],
    ['قفلُ الموظف/الوضع بجسمٍ وذيل', (si.match(/class="modal-body"/g) || []).length >= 2 && (si.match(/sd-actions modal-foot/g) || []).length === 2],
    ['قفلُ الموظف/الوضع بلا إغلاقٍ بنقرةٍ خارجية', !/e\.target === ov\b/.test(si)],
    ['قفلُ الموظف/الوضع بلا معالج Escape محليّ', !/escHandler/.test(si)],
    ['قفلُ الموظف/الوضع يربط سلوكَه بعد البناء', (si.match(/SyModal\.scan\(\)/g) || []).length >= 2],
    ['منتقي الألوان يغلق بـEscape ويقفل تمريرَ الخلفية', /sydentCpOverlay[\s\S]{0,60000}?keyCode === 27/.test(si) && /sy-modal-lock/.test(si)]
  ];
  for (const [label, okv] of checks) { if (okv) pass('supabase-init.js: ' + label); else fail('supabase-init.js: ' + label); }
}

/* v446: كلُّ زرٍّ يُطلق الذكاء داخل نافذةٍ يلبس الزرَّ المعياري (.wa-ai-btn).
   طلبُ المالك بعد رؤية زرِّ «اقترح ملاحظة» بشكلٍ مختلفٍ بمودال السن. */
for (const f of ['patient-profile.html', 'patients.html', 'appointments.html', 'labs.html']) {
  const src = R(f);
  const offenders = [];
  const re = /<button([^>]*)>([^<]*🤖[^<]*)<\/button>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    if (/\bwa-ai-btn\b/.test(attrs)) continue;
    /* زرُّ شريط الصفحة الذي يفتح نافذةَ المساعد ليس زرَّ إطلاق — يتبع أزرار الشريط */
    if (/openModal\(/.test(attrs) || /stg-nav-btn/.test(attrs)) continue;
    offenders.push((m[2] || '').trim().slice(0, 30));
  }
  if (offenders.length) fail(`${f}: زرُّ ذكاءٍ خارج الزرّ المعياري — ${offenders.join('، ')}`);
  else pass(`${f}: كلُّ أزرار الذكاء على الزرّ المعياري`);
}

/* بوابةُ الذكاء: بطاقةُ التعليمات تبقى مخفيةً حتى body.ai-on */
{
  const css = R('patient-profile.css');
  if (!/#postOpAiRow[^{]*\{[^}]*display:\s*none/.test(css) || css.indexOf('body.ai-on #postOpAiRow') === -1)
    fail('patient-profile.css: بطاقةُ مساعد التعليمات ليست خلف بوابة body.ai-on');
  else pass('patient-profile.css: بطاقةُ مساعد التعليمات خلف بوابة body.ai-on');
}
for (const [f, anchor] of SURFACES) {
  const src = R(f);
  const miss = COMPOSER_CLASSES.filter(c => src.indexOf(c) === -1);
  if (!src.includes(anchor)) fail(`${f}: مرساةُ المحرّر (${anchor}) مفقودة`);
  else if (miss.length) fail(`${f}: محرّرُ الرسالة لا يستهلك الطقم المعياري — ناقص: ${miss.join('، ')}`);
  else pass(`${f}: محرّرُ الرسالة على الطقم المعياري`);
  for (const c of ['wa-ai-card', 'wa-tpl-row', 'wa-msg-sec']) {
    if (new RegExp('\\.' + c + '\\s*\\{').test(src)) fail(`${f}: أعاد تعريف .${c} محلياً — الطقم يخصّ theme.css وحدها`);
  }
}
console.log(bad ? `⛔ سلوك النوافذ: ${bad} كسر` : `✅ سلوك النوافذ: ${okN} توكيداً على الملفات الحيّة`);
process.exit(bad ? 1 : 0);
