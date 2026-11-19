/* tour.js — الجولات التعريفية (SyDentTour): جولةٌ عامة على لوحة التحكم، وجولتان مفصّلتان داخل ملف المريض وصفحة المخابر.
   • sidebar.js يحمّل هذا الملف عند الطلب بتوكن sidebar.js نفسه (نمط guides.js) ثم ينادي SyDentTour.mount(activeId):
     يُضاف زرّ «🧭 جولة تعريفية» بجانب «📖 دليل هذا القسم»، وتبدأ الجولة وحدها مرةً واحدة عند أول زيارة للصفحة.
   • الجولة تتبع صلاحيات المستخدم: كل خطوةٍ عنصرُها غيرُ ظاهر (قسمٌ محجوب بالدور أو بالخطة، تحذيرٌ طبي غير موجود…)
     تُتخطّى وحدها — فلا خطوة فارغة.
   • البطاقة التجريبية (patient-profile.html?id=demo): فصل «الإرسال إلى المخبر» تفاعلي — الطبيب ينقر بنفسه (أو «نفّذ عنّي»)
     وكل شيءٍ بالذاكرة لا يُحفظ. على بطاقة مريضٍ حقيقي يبقى الفصل شرحاً فقط ويدلّ على البطاقة التجريبية — الجولة لا تكتب شيئاً.
   • الحالة لكل صفحة بـlocalStorage (sydent.tour.v1.<page>): انتهت · أُجّلت عند الخطوة N (والزر يصير «تابع الجولة N/M»).
   • النصوص ثابتة (لا إدخال مستخدم) بالعربية الفصحى، ومعها الإنجليزية لخيار اللغة (SyI18n): بالإنجليزية تُكتب البطاقة إنجليزيةً مباشرةً
     فلا يجد القاموس فيها حرفاً عربياً يترجمه (ولا تحمل data-i18n-skip لأنه يعني «محتوى عربي» فيقلبها يميناً). */
(function () {
  'use strict';
  if (window.SyDentTour) return;

  var EN = !!(window.SyI18n && window.SyI18n.lang === 'en');
  var KEY = 'sydent.tour.v1.';
  function T(o) { return o == null ? '' : (typeof o === 'string' ? o : (EN && o.en ? o.en : o.ar)); }
  function $(s, r) { try { return (r || document).querySelector(s); } catch (e) { return null; } }
  function $$(s, r) { try { return Array.prototype.slice.call((r || document).querySelectorAll(s)); } catch (e) { return []; } }
  function shown(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) {   /* عنصرٌ داخل مجموعةٍ مطويّة بالقائمة الجانبية: يُعدّ ظاهراً (تُفتح المجموعة عند الحاجة) */
      return !!(el.closest('.sb-group-inner') && getComputedStyle(el).display !== 'none');
    }
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function modalOpen(id) { var m = document.getElementById(id); return !!(m && (m.classList.contains('open') || m.classList.contains('show'))); }
  function isMobile() { return window.matchMedia('(max-width:820px)').matches; }
  function isDemo() { return /[?&]id=demo(&|$)/.test(location.search); }
  function page() {
    var p = (String(location.pathname).split('/').pop() || '').replace(/\.html$/, '') || 'index';
    if (p === 'index') return 'dashboard';
    if (p === 'patient-profile') return 'patient';
    if (p === 'labs') return 'labs';
    if (p === 'inventory') return 'inventory';
    return null;
  }
  function nav(href) { return $('.sb-nav .sb-item[href="' + href + '"]'); }
  function tabBtn(name) {
    return $$('.pp-tabs .tab').filter(function (b) { return (b.getAttribute('onclick') || '').indexOf("switchTab('" + name + "'") > -1; })[0] || null;
  }
  function goTab(name) {
    var pane = document.getElementById('tab-' + name);
    if (pane && pane.classList.contains('active')) return 0;
    var b = tabBtn(name); if (b) { b.click(); return 220; }
    return 0;
  }
  function closeOpenModals() {
    var w = 0;
    ['labOrderModal', 'toothModal'].forEach(function (id) {
      if (modalOpen(id) && typeof window.closeModal === 'function') { try { window.closeModal(id); w = 200; } catch (e) {} }
    });
    return w;
  }
  function rowOf(id) { var e = document.getElementById(id); return e ? (e.closest('.form-group') || e.parentElement) : null; }
  /* جدولٌ أعرض من الشاشة (الموبايل) يمرّ أفقياً داخل حاويته: toEl = أظهر العنصر نفسه، وإلا عُد إلى بداية الجدول */
  function hScroll(el, toEl) {
    var box = el && el.closest ? el.closest('[style*="overflow-x"]') : null;
    if (!box || box.scrollWidth <= box.clientWidth + 1) return 0;
    var before = box.scrollLeft;
    if (toEl) {
      var b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
      box.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
    } else box.scrollLeft = 0;
    return box.scrollLeft !== before ? 200 : 0;
  }
  function firstShown(list) { for (var i = 0; i < list.length; i++) if (shown(list[i])) return list[i]; return null; }

  /* ═══════════════ الخطوات ═══════════════
     sel: عنصرُ الخطوة (دالة) — غيابُه يُسقط الخطوة · center: بطاقةٌ في الوسط · prep: تجهيزُ الشاشة (تبويب) ويعيد زمن الانتظار
     act: خطوةٌ ينفّذها الطبيب بنفسه — done() تُنهيها، doIt() «نفّذ عنّي» · need: شرطُ بقاء الشاشة، وإلا onLost
     demo: true = بالبطاقة التجريبية وحدها، false = خارجها وحدها · cta: زرٌّ إضافي بالبطاقة */
  var CTA_DEMO = { label: { ar: 'افتح البطاقة التجريبية', en: 'Open the demo card' }, href: 'patient-profile.html?id=demo' };

  var DASH = [
    { center: true, ico: '👋',
      title: { ar: 'أهلاً بك في SyDent', en: 'Welcome to SyDent' },
      body: { ar: 'جولةٌ قصيرة <b>(نحو دقيقة)</b> تعرّفك على أقسام النظام ومكان كل شيء. يمكنك إيقافها متى شئت وإكمالها لاحقاً من حيث توقّفت.',
              en: 'A short tour <b>(about a minute)</b> of the main sections and where everything is. Stop it any time and continue later from where you left off.' } },
    { sel: function () { var b = $('#obBanner'); return shown(b) ? b : null; }, ico: '✅',
      title: { ar: 'خطوات البداية', en: 'Getting-started steps' },
      body: { ar: 'أربع خطواتٍ تجهّز عيادتك: <b>اسم العيادة · أول مريض · أول موعد · أول جلسة وفاتورة</b>. اضغط أيّاً منها لتنتقل إليه، وتختفي القائمة حين تكتمل.', en: 'Four steps to get your clinic ready: <b>clinic name · first patient · first appointment · first session and invoice</b>. Tap any of them to go there; the list disappears once they are done.' } },
    { sel: function () { return nav('index.html'); }, ico: '🏠',
      title: { ar: 'لوحة التحكم', en: 'Dashboard' },
      body: { ar: 'نظرةٌ على يوم العيادة: <b>مواعيد اليوم</b>، والإيراد، والتنبيهات التي تحتاج انتباهك.', en: 'Your clinic day at a glance: <b>today\'s appointments</b>, revenue, and the alerts that need you.' } },
    { sel: function () { return nav('patients.html'); }, ico: '👥',
      title: { ar: 'المرضى', en: 'Patients' },
      body: { ar: 'ملفّ كل مريضٍ في مكانٍ واحد: البيانات، و<b>مخطط الأسنان</b>، والجلسات، والمدفوعات، والوثائق.', en: 'Each patient\'s file in one place: details, the <b>dental chart</b>, sessions, payments and documents.' },
      tip: { ar: 'جرّب كل شيء على <b>البطاقة التجريبية</b> دون أن يُحفظ شيء — تفتحها من آخر هذه الجولة، وتبقى في أول قائمة المرضى حتى تحذفها، ولا تأخذ رقماً.', en: 'Try everything on the <b>demo card</b> without saving anything — open it from the end of this tour; it stays at the top of the Patients list until you delete it, and takes no number.' } },
    { sel: function () { return nav('appointments.html'); }, ico: '📅',
      title: { ar: 'المواعيد', en: 'Appointments' },
      body: { ar: 'جدول العيادة بعرضٍ يومي أو أسبوعي أو شهري، و<b>طلبات الحجز</b> الإلكتروني، و<b>تذكير المرضى</b> عبر واتساب.', en: 'The clinic schedule by day, week or month, online <b>booking requests</b>, and <b>patient reminders</b> on WhatsApp.' } },
    { sel: function () { return nav('treatments.html'); }, ico: '🩺',
      title: { ar: 'قائمة العلاجات', en: 'Treatment list' },
      body: { ar: 'العلاجات التي تقدّمها العيادة <b>بأسعارها وألوانها</b> على المخطط، وما يحتاج منها إلى <b>مخبر</b> ومدّته المعتادة عنده.', en: 'The treatments your clinic offers, <b>with prices and chart colours</b>, and which need a <b>lab</b> and its usual turnaround.' } },
    { sel: function () { return nav('labs.html'); }, ico: '🧪',
      title: { ar: 'المخابر', en: 'Labs' },
      body: { ar: 'كل ما يُرسَل إلى المخبر (تاج، جسر، جهاز…) <b>من الإرسال حتى التركيب</b>، مع تاريخ الاستحقاق وحساب كل مخبر.', en: 'Everything sent to the lab (crown, bridge, denture…) <b>from sending to fitting</b>, with due dates and each lab\'s account.' } },
    { sel: function () { return nav('accounting.html'); }, ico: '📊',
      title: { ar: 'المحاسبة', en: 'Accounting' },
      body: { ar: 'الإيراد والإنتاج والمصروفات و<b>صافي الربح</b> عن أي فترة، وكشف اليوم وإغلاق الصندوق.', en: 'Revenue, production, expenses and <b>net profit</b> for any period, plus the day sheet and cash closing.' },
      tip: { ar: 'لكل عملةٍ حسابها — لا تُجمع الليرة مع الدولار.', en: 'Each currency is kept on its own — SYP and $ are never added together.' } },
    { sel: function () { return nav('provider-reports.html'); }, ico: '📈',
      title: { ar: 'التقارير', en: 'Reports' },
      body: { ar: 'أداء العيادة <b>وكل طبيب</b>: الإنتاج، والعلاجات، والحضور والغياب، والمرضى الجدد.', en: 'Performance of the clinic <b>and each dentist</b>: production, treatments, attendance and new patients.' } },
    { sel: function () { return nav('inventory.html'); }, ico: '📦',
      title: { ar: 'المخزون', en: 'Inventory' },
      body: { ar: 'مواد العيادة وكمياتها، و<b>تنبيهات النقص وانتهاء الصلاحية</b>، وطلبيات الموردين.', en: 'Clinic materials and stock, <b>low-stock and expiry alerts</b>, and supplier orders.' } },
    { sel: function () { return nav('settings.html'); }, ico: '⚙️',
      title: { ar: 'الإعدادات', en: 'Settings' },
      body: { ar: '<b>هوية العيادة</b> (الاسم والشعار والهاتف)، وأوقات العمل، والعملة، وقوالب رسائل واتساب.', en: '<b>Clinic identity</b> (name, logo, phone), working hours, currency and WhatsApp message templates.' } },
    { sel: function () { return $('#dashSearch'); }, ico: '🔎',
      title: { ar: 'البحث عن مريض', en: 'Find a patient' },
      body: { ar: 'اكتب <b>اسم المريض أو رقم هاتفه</b> واضغط إدخال، فتنتقل إلى قائمة المرضى مصفّاةً عليه.', en: 'Type the <b>patient\'s name or phone number</b> and press Enter to jump to the patient list filtered on it.' } },
    { sel: function () { return $('.sd-guide-btn'); }, ico: '📖',
      title: { ar: 'دليل هذا القسم', en: 'Guide to this section' },
      body: { ar: 'في رأس كل صفحة شرحٌ مكتوب لها خطوةً بخطوة، وكل الأدلة مجموعةٌ في <b>مركز التعلّم</b>.', en: 'Every page has a written step-by-step guide in its header, and all guides are collected in the <b>Learning centre</b>.' } },
    { center: true, final: true, ico: '🎉', cta: CTA_DEMO,
      title: { ar: 'أنت جاهز!', en: 'You\'re all set!' },
      body: { ar: 'تعرّفت على أقسام النظام. <b>الخطوة التالية:</b> افتح البطاقة التجريبية لترى ملف المريض وطريقة إرسال العمل إلى المخبر خطوةً بخطوة.', en: 'You now know the main sections. <b>Next:</b> open the demo card to see the patient file and how to send work to the lab, step by step.' },
      tip: { ar: 'أعد الجولة متى شئت من زر <b>🧭 جولة تعريفية</b> في رأس الصفحة.', en: 'Replay the tour any time from the <b>🧭 Guided tour</b> button in the page header.' } }
  ];

  function crownOpt() {
    var all = $$('#toothModal .topt').filter(shown);
    var c = all.filter(function (b) { return /pickToothTreatment\('crown'/.test(b.getAttribute('onclick') || ''); })[0];
    if (c) return c;
    return all.filter(function (b) {
      var m = (b.getAttribute('onclick') || '').match(/pickToothTreatment\('([^']+)'/);
      return m && m[1] !== 'bridge' && typeof window.needsLab === 'function' && window.needsLab(m[1]);
    })[0] || null;
  }
  function labBtnShown() { var b = $('#toothLabBtn'); return !!(b && modalOpen('toothModal') && b.style.display !== 'none' && shown(b)); }
  function labModal() { return modalOpen('labOrderModal'); }
  /* بعد نقر «حفظ + إرسال لمخبر» تُغلق نافذة السن فوراً، أمّا نافذة الطلب فتنتظر الحفظ وقراءاتٍ من الشبكة —
     على الموبايل قد تتأخّر ثوانٍ. هذه المهلة تمنع الجولة من اعتبار الشاشة «ضاعت» فتعود إلى السن في الفراغ. */
  var labWaitUntil = 0;
  function labOpening() { return Date.now() < labWaitUntil; }
  /* بلاغ المالك (19 تشرين الثاني، الموبايل): نقرةُ الطبيب نفسه على سنٍّ أو زرّ تفتح نافذةً تنتظر الشبكة ثوانٍ —
     كانت الجولة تعدّ الشاشة «ضاعت» وتعود إلى أول الفصل في الفراغ. نقرةٌ على عنصرٍ تفاعلي تمهل الشاشة 8 ثوانٍ (البطاقة وحدها بلا إطار). */
  var pendUntil = 0;
  /* ما يفتح نافذةً أو يحفظ (لا الأزرار التي تعمل في الحال: الفئات والأسطح وخيارات العلاج) */
  var PEND_SEL = '#nseGrid button, .sd-page-head__actions button, .crown-surface, .root-part, [data-occ-cell], .tooth-cell, ' +
    '#toothFoot button, #tab-payments button, #labOrderSaveBtn';
  function pending() { return Date.now() < pendUntil || Date.now() < labWaitUntil; }
  function inTooth() { return modalOpen('toothModal') || labOpening() || labModal(); }
  function inLabBtn() { return labBtnShown() || labOpening() || labModal(); }
  /* نافذة الطلب فُتحت (بنقرة الطبيب أو متأخّرةً): خطوات السن التي قبلها انتهت — تقدّمٌ إلى أول خطوةٍ في النافذة */
  var AHEAD_LAB = { when: labModal, to: 'lab-fill' };
  var LOST_LAB = { to: 'lab-tab' };

  var PATIENT = [
    { center: true, ico: '🦷', prep: function () { return closeOpenModals() + goTab('file'); },
      title: { ar: 'ملف المريض', en: 'The patient file' },
      body: function () {
        return isDemo()
          ? { ar: 'كل ما يخصّ المريض في مكانٍ واحد. الجولة قسمان: <b>① أقسام الملف</b>، ثم <b>② إرسال عملٍ إلى المخبر</b> ومتابعته حتى التركيب — وهذه بطاقةٌ تجريبية: نفّذ كل خطوةٍ بنفسك، فلا شيء هنا يُحفظ.',
              en: 'Everything about a patient in one place. Two parts: <b>① the sections of the file</b>, then <b>② sending work to the lab</b> and following it to fitting. This is the demo card — try every step yourself; nothing here is saved.' }
          : { ar: 'كل ما يخصّ المريض في مكانٍ واحد. الجولة قسمان: <b>① أقسام الملف</b>، ثم <b>② إرسال عملٍ إلى المخبر</b> ومتابعته حتى التركيب.',
              en: 'Everything about a patient in one place. Two parts: <b>① the sections of the file</b>, then <b>② sending work to the lab</b> and following it to fitting.' };
      } },
    { chap: 1, ico: '⚠️', prep: function () { return goTab('file'); },
      sel: function () { var a = $('#pMedAlert'); if (shown(a)) return a; var f = $('#iMedFlags'); return f ? (f.closest('.info-row') || f.parentElement) : null; },
      title: { ar: 'التحذيرات الطبية', en: 'Medical alerts' },
      body: { ar: 'الحساسية والأمراض المهمة (مميّعات الدم، السكري، الحمل…) تُسجَّل في معلومات المريض، ومتى وُجدت تظهر في <b>شريطٍ أحمر ثابت</b> أعلى الملف في كل تبويب — فلا تفوتك قبل أي إجراء.', en: 'Allergies and important conditions (anticoagulants, diabetes, pregnancy…) are recorded in the patient details; when present they show in a <b>red bar pinned</b> to the top of the file on every tab — you can\'t miss them before a procedure.' } },
    { chap: 1, ico: '💰', sel: function () { return $('.hcard .stats-row') || $('.stats-row'); },
      title: { ar: 'حساب المريض بلمحة', en: 'The account at a glance' },
      body: { ar: '<b>المُنجَز</b> (قيمة ما عُمل) · <b>المدفوع</b> · و<b>الرصيد</b>: ما بقي على المريض أو له. لكل عملةٍ سطرها.', en: '<b>Done</b> (value of the work) · <b>Paid</b> · and the <b>balance</b>: what the patient still owes, or is owed. Each currency has its own line.' } },
    { chap: 1, ico: '⚡', sel: function () { return $('.pp-head .sd-page-head__actions') || $('.sd-page-head__actions'); },
      title: { ar: 'أهم الأفعال', en: 'Main actions' },
      body: { ar: '<b>جلسة جديدة</b> · <b>موعد جديد</b> · <b>تسجيل دفعة</b> · رسالة <b>واتساب</b> للمريض · وقائمة <b>أدوات</b> للطباعة وكشف الحساب.', en: '<b>New session</b> · <b>New appointment</b> · <b>Record a payment</b> · a <b>WhatsApp</b> message to the patient · and <b>Tools</b> for printing and the account statement.' } },
    { chap: 1, ico: '🗂️', sel: function () { return $('.pp-tabs'); },
      title: { ar: 'تبويبات الملف', en: 'The file\'s tabs' },
      body: { ar: 'مجمّعةٌ حسب النوع: <b>العلاج</b> (الملف، فحص اللثة، الجلسات، المخابر) · <b>المالية</b> · <b>الوثائق</b> (الملفات والأشعة، الوصفات، التعليمات) · <b>التواصل</b> · <b>السجل</b>. الرقم بجانب التبويب عددُ ما فيه.', en: 'Grouped by kind: <b>Treatment</b> (file, perio, sessions, labs) · <b>Finance</b> · <b>Documents</b> (files and X-rays, prescriptions, instructions) · <b>Contact</b> · <b>Log</b>. The number beside a tab is how many items it holds.' } },
    { chap: 1, ico: '🦷', prep: function () { return goTab('file'); }, sel: function () { return $('#jawWrap'); },
      title: { ar: 'مخطط الأسنان', en: 'The dental chart' },
      body: { ar: 'اضغط على <b>السن أو السطح</b> لتسجيل علاجٍ أو حالةٍ سريرية. <b>اللون</b> يدلّ على نوع العلاج (من قائمة العلاجات)، و<b>الشكل</b> على حالته: مصمتٌ للمنجز، ومخطّطٌ بخطوط للمخطّط، وفاتحٌ للموجود مسبقاً.', en: 'Tap a <b>tooth or surface</b> to record a treatment or a clinical finding. The <b>colour</b> is the treatment type (from the treatment list) and the <b>shape</b> is its status: solid = done, hatched = planned, light = existing.' } },
    { chap: 1, ico: '🧰', sel: function () { var b = $('#batchToggleBtn'); return b ? b.parentElement : null; },
      title: { ar: 'أدوات المخطط', en: 'Chart tools' },
      body: { ar: '<b>☑️ تحديد متعدد</b>: العلاج نفسه أو الحالة نفسها على عدة أسنانٍ أو أسطح دفعةً واحدة · <b>🩺 فحص أولي</b>: تسجيل الموجودات كلها مرةً واحدة · <b>🕰️ عرض تاريخي</b>: الفم كما كان بتاريخٍ سابق · <b>✏️ مسودة</b>: رسمٌ حر.', en: '<b>☑️ Multi-select</b>: the same treatment or finding on several teeth or surfaces at once · <b>🩺 Initial exam</b>: record all findings in one go · <b>🕰️ History view</b>: the mouth as it was on an earlier date · <b>✏️ Sketch</b>: free drawing.' },
      tip: { ar: 'لفكٍّ بلا أسنان: زرّ <b>🦷 فك أدرد</b> في شريط الفحص الأولي.', en: 'For an arch with no teeth: the <b>🦷 Edentulous arch</b> button in the initial-exam bar.' } },
    { chap: 1, ico: '🗒️', prep: function () { return goTab('sessions'); }, sel: function () { return $('#tab-sessions .card') || $('#sessionsContent'); },
      title: { ar: 'الجلسات وخطة العلاج', en: 'Sessions and the treatment plan' },
      body: { ar: 'كل ما أُنجز في كل زيارة بسعره وطبيبه، والعلاجات المخطّطة مع <b>زيارات الخطة</b>. يمكنك عرض <b>خياراتٍ بديلة أ / ب / ج</b> على المريض واعتماد ما يختاره — والخيار المعتمد وحده يدخل المواعيد.', en: 'Everything done at each visit with its price and dentist, and planned treatments with <b>plan visits</b>. You can offer <b>alternative options A / B / C</b> and adopt the one the patient picks — only the adopted option goes into appointments.' },
      tip: { ar: 'علاجٌ يمتدّ على زيارات (غسل أقنية، تحضير ثم تركيب)؟ <b>＋ متابعة</b> بجانب جلسته تربط الزيارات به دون تكلفةٍ جديدة.', en: 'A treatment over several visits? <b>＋ Follow-up</b> next to its session links the visits to it at no new cost.' } },
    { chap: 1, ico: '💳', prep: function () { return goTab('payments'); }, sel: function () { var s = $('#balanceSummary'); return s ? (s.closest('.card') || s) : null; },
      title: { ar: 'المدفوعات', en: 'Payments' },
      body: { ar: 'ملخّص الحساب، وتسجيل <b>الدفعات والتسويات</b>، و<b>خطة الأقساط</b> — والأقساط المستحقة تظهر أيضاً في متابعة المرضى.', en: 'The account summary, <b>payments and adjustments</b>, and <b>installment plans</b> — installments due also appear in patient follow-up.' } },

    /* ② على بطاقةٍ حقيقية: شرحٌ فقط — الجولة لا تنشئ شيئاً على مريضٍ حقيقي */
    { chap: 2, demo: false, ico: '🧪', prep: function () { return goTab('file'); }, sel: function () { return tabBtn('labs'); },
      title: { ar: 'إرسال عملٍ إلى المخبر', en: 'Sending work to the lab' },
      body: { ar: 'ابدأ <b>من السن نفسه</b>: اختر علاجاً مخبرياً (تاج، جسر، جهاز…) ثم <b>«حفظ + إرسال لمخبر»</b> — فيرتبط الطلب بالسن والجلسة، واربطه بموعد التركيب، ثم تابعه من تبويب <b>المخابر</b> حتى «تم التركيب».', en: 'Start <b>from the tooth itself</b>: pick a lab treatment (crown, bridge, denture…) then <b>«Save + send to lab»</b> — the order is tied to the tooth and the session; link it to the fitting appointment, then follow it from the <b>Labs</b> tab to «Fitted».' },
      tip: { ar: 'لتجربة الخطوات عملياً دون حفظ أي شيء: افتح <b>البطاقة التجريبية</b> من الزرّ في آخر هذه الجولة.', en: 'To try the steps hands-on without saving anything, open the <b>demo card</b> from the button at the end of this tour.' } },

    /* ② بالبطاقة التجريبية: تفاعلي */
    { chap: 2, demo: true, id: 'lab-start', ico: '👆', ahead: AHEAD_LAB, prep: function () { labWaitUntil = 0; return closeOpenModals() + goTab('file'); },
      sel: function () { return $('[data-occ-cell="27"]') || $('[data-tooth-cell="27"]'); },
      act: { done: function () { return modalOpen('toothModal'); }, doIt: function (t) {
        /* النقرُ يُقرأ من السطح تحت المؤشّر (مسار SVG) لا من الخلية — فنرسله لما في منتصف السن */
        function fire() {
          var k = t.getBoundingClientRect(), cx = k.left + k.width / 2, cy = k.top + k.height / 2;
          /* أول طبقةٍ داخل السن تحت النقطة — يتجاوز ما قد يعلوه مؤقتاً (تلميحُ سنٍّ مجاور، الحاجز) */
          var hit = (document.elementsFromPoint ? document.elementsFromPoint(cx, cy) : []).filter(function (x) { return t.contains(x); })[0];
          if (!hit) return false;
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (ev) { hit.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy })); });
          return true;
        }
        if (!fire()) { try { t.scrollIntoView({ block: 'center' }); } catch (e) {} setTimeout(function () { if (!fire()) t.click(); }, 450); }
      } },
      title: { ar: 'ابدأ من السن', en: 'Start from the tooth' },
      body: { ar: 'سنرسل <b>تاجاً</b> للسن 27 إلى المخبر. البداية دائماً من <b>السن نفسه</b>، فيرتبط الطلب بالسن والجلسة والموعد تلقائياً. <b>اضغط على السن 27.</b>', en: 'We will send a <b>crown</b> for tooth 27 to the lab. Always start from <b>the tooth itself</b>, so the order is tied to the tooth, session and appointment. <b>Tap tooth 27.</b>' } },
    { chap: 2, demo: true, ico: '🔗', ahead: AHEAD_LAB, need: inTooth, onLost: { to: 'lab-start' },
      sel: function () { return $('#toothModal .tx-tab[data-txtab="prosthodontics"]'); },
      act: { done: function () { var t = $('#toothModal .tx-tab[data-txtab="prosthodontics"]'); return !!(t && t.classList.contains('tx-tab-active')); }, doIt: function (t) { t.click(); } },
      title: { ar: 'فئة العلاج', en: 'Treatment category' },
      body: { ar: 'افتح فئة <b>«تعويضات ثابتة»</b>.', en: 'Open the <b>«Fixed prosthodontics»</b> category.' } },
    { chap: 2, demo: true, ico: '🥽', ahead: AHEAD_LAB, need: inTooth, onLost: { to: 'lab-start' },
      sel: function () { return crownOpt(); },
      act: { done: labBtnShown, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر التاج', en: 'Pick the crown' },
      body: { ar: 'اختر <b>التاج</b>. لأنه مفعّلٌ عليه <b>«يحتاج مخبراً»</b> في قائمة العلاجات، يظهر زرّ الإرسال إلى المخبر.', en: 'Pick the <b>crown</b>. Because it is marked <b>«Needs a lab»</b> in the treatment list, the send-to-lab button appears.' },
      tip: { ar: 'فعّل «يحتاج مخبراً» مرةً واحدة لكل علاجٍ مخبري (تيجان، جسور، أجهزة…) من صفحة قائمة العلاجات.', en: 'Mark «Needs a lab» once for each lab treatment (crowns, bridges, dentures…) on the treatment list page.' } },
    { chap: 2, demo: true, ico: '📌', ahead: AHEAD_LAB, need: inLabBtn, onLost: { to: 'lab-start' }, sel: function () { return $('#toothStatusPicker'); },
      title: { ar: 'منجز أم مخطّط؟', en: 'Done or planned?' },
      body: { ar: 'الحالة تحدّد كيف يُفتح طلب المخبر: <b>منجز</b> (أخذتَ الطبعة اليوم) ⇐ يُفتح <b>بتاريخ إرسال اليوم</b>. <b>مخطّط</b> (لم تُؤخذ الطبعة بعد) ⇐ يُفتح <b>مسودّة</b> بلا تاريخ إرسال، وترسله حين تأخذ الطبعة. في هذه التجربة اتركه «منجز».', en: 'The status decides how the lab order opens: <b>Done</b> (impression taken today) ⇒ it opens <b>with today as the send date</b>. <b>Planned</b> (no impression yet) ⇒ it opens as a <b>draft</b> with no send date, and you send it when you take the impression. For this walkthrough, leave it on «Done».' },
      tip: { ar: 'مع «منجز» يظهر <b>🔁 يحتاج جلسات متابعة</b> مُعلَّماً للتاج، لأنه يمتدّ على زيارات (تحضير ثم تركيب): تُضاف زياراته اللاحقة بـ«＋ متابعة» دون تكلفة.', en: 'With «Done», <b>🔁 Needs follow-up sessions</b> is ticked for a crown, as it spans visits (prep, then fitting): its later visits are added with «＋ Follow-up» at no cost.' } },
    { chap: 2, demo: true, ico: '🥽', need: inLabBtn, onLost: { to: 'lab-start' }, sel: function () { return $('#toothLabBtn'); },
      act: { done: labModal, doIt: function (t) { t.click(); } },
      title: { ar: '«حفظ + إرسال لمخبر»', en: '«Save + send to lab»' },
      body: { ar: 'يظهر هذا الزر <b>للعلاجات المخبرية وحدها</b>: يحفظ الجلسة ويفتح طلب المخبر <b>مباشرةً</b> دون مغادرة الملف. <b>اضغطه.</b>', en: 'This button appears <b>only for lab treatments</b>: it saves the session and opens the lab order <b>straight away</b>, without leaving the file. <b>Tap it.</b>' },
      tip: { ar: '<b>للجسر:</b> اضغط على <b>السن المقلوع</b> (مكان الفراغ) واختر «جسر» — تُحدَّد الدعامات تلقائياً ويمكنك إضافة دعامة — ثم الزر نفسه يفتح طلباً واحداً للجسر كله.', en: '<b>For a bridge:</b> tap the <b>missing tooth</b> (the gap) and pick «Bridge» — the abutments are set automatically and you can add one — then the same button opens one order for the whole bridge.' } },
    { chap: 2, demo: true, id: 'lab-fill', ico: '✅', need: labModal, onLost: LOST_LAB, sel: function () { var a = rowOf('labOrderTooth'); return a ? (a.parentElement && a.parentElement.contains($('#labOrderWorkType')) ? a.parentElement : a) : null; },
      title: { ar: 'معبّأ تلقائياً', en: 'Filled in for you' },
      body: { ar: '<b>رقم السن ونوع العمل</b> جاءا من الجلسة التي حفظتها — لا حاجة لإعادة كتابتهما.', en: 'The <b>tooth number and work type</b> come from the session you just saved — no need to type them again.' },
      tip: { ar: 'و<b>الطبيب المعالج</b> يُعبّأ من الجلسة أو الموعد — وعليه تُحتسب كلفة المخبر في تقارير الأطباء. وللأعمال المتكررة احفظ الطلب <b>🧩 قالباً</b>.', en: 'The <b>treating dentist</b> is filled from the session or appointment — the lab cost is counted against them in the dentist reports. For repeated work, save the order as a <b>🧩 template</b>.' } },
    { chap: 2, demo: true, ico: '📅', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderAppointment'); },
      title: { ar: 'اربطه بموعد التركيب', en: 'Link it to the fitting appointment' },
      body: { ar: 'اختر: <b>🔄 الموعد القادم تلقائياً</b>، أو موعداً محدّداً من مواعيد المريض، أو <b>📅 تحديد موعد التركيب الآن</b> فيُنشأ الموعد تلقائياً. بالربط يعرف النظام أن هذا الموعد <b>يحتاج عودة العمل من المخبر قبله</b>.', en: 'Choose <b>🔄 Next appointment automatically</b>, a specific appointment of the patient, or <b>📅 Set the fitting appointment now</b> to create it. Linked, the system knows this appointment <b>needs the work back from the lab first</b>.' },
      tip: { ar: 'الافتراضي «غير مربوط بموعد» — اربطه ليعمل تنبيه التأخير وحساب الاستحقاق.', en: 'The default is «Not linked» — link it so the late alert and the due date work.' } },
    { chap: 2, demo: true, ico: '🎨', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderLabSelect'); },
      title: { ar: 'المخبر', en: 'The lab' },
      body: { ar: 'اختر المخبر، أو <b>＋</b> لإضافة مخبرٍ جديد في ثوانٍ. وفي البطاقة التجريبية <b>«مخبر تجريبي»</b> جاهزٌ للتجربة.', en: 'Choose the lab, or <b>＋</b> to add a new one in seconds. The demo card has a ready <b>«Demo lab»</b> to try.' } },
    { chap: 2, demo: true, ico: '🎨', need: labModal, onLost: LOST_LAB, sel: function () { var g = rowOf('labOrderShade'); return g ? (g.closest('.form-row') || g) : null; },
      title: { ar: 'اللون والكلفة', en: 'Shade and cost' },
      body: { ar: 'اكتب اللون أو اضغط <b>🎨</b> لاختيار الرمز من دليل <b>VITA classical</b> أو <b>3D-MASTER</b> أو <b>Chromascop</b> فيُكتب وحده. و<b>الكلفة</b> ما تدفعه العيادة للمخبر عن هذا العمل.', en: 'Type the shade or tap <b>🎨</b> to pick it from the <b>VITA classical</b>, <b>3D-MASTER</b> or <b>Chromascop</b> guide. The <b>cost</b> is what the clinic pays the lab for this work.' },
      tip: { ar: 'ألوان العيّنات على الشاشة تقريبية — المرجع هو الدليل الحقيقي في ضوء النهار.', en: 'On-screen swatches are approximate — the real guide in daylight is the reference.' } },
    { chap: 2, demo: true, ico: '💵', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderDateSent'); },
      title: { ar: 'تاريخ الإرسال', en: 'Send date' },
      body: { ar: 'يوم تسليم العمل للمخبر. <b>فارغٌ = مسودّة</b>: تُحفظ ولا تُحتسب حتى يخرج العمل فعلاً. ومن هذا التاريخ تُحتسب الكلفة على العيادة لصالح المخبر <b>في شهر الإرسال</b>.', en: 'The day the work is handed to the lab. <b>Empty = a draft</b>: saved but not counted until the work actually leaves. From this date the cost counts against the clinic, owed to the lab, <b>in the month it is sent</b>.' } },
    { chap: 2, demo: true, ico: '⏱', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderDateDue'); },
      title: { ar: 'تاريخ الاستحقاق يُحسب وحده', en: 'The due date is worked out for you' },
      body: { ar: 'من <b>«مدّة المخبر المعتادة»</b> للعلاج (في قائمة العلاجات) بأيام الدوام، و<b>لا يتجاوز موعد التركيب</b> المربوط؛ وإن كانت المدّة أطول من الوقت المتاح ينبّهك.', en: 'From the treatment\'s <b>usual lab turnaround</b> (in the treatment list) in working days, and <b>never after the linked fitting appointment</b>; if the turnaround is longer than the time left, you are warned.' },
      tip: { ar: 'إن لم تحدّد مدّةً للعلاج، يتعلّم النظام من مدد هذا المخبر في طلباتك السابقة.', en: 'With no turnaround set, the system learns from this lab\'s times on your earlier orders.' } },
    { chap: 2, demo: true, ico: '🪜', need: labModal, onLost: LOST_LAB, sel: function () { return $('#labStagesBox'); },
      title: { ar: 'مراحل العمل', en: 'Work stages' },
      body: { ar: 'للأعمال التي تعود إلى العيادة أكثر من مرة (الأجهزة المتحركة مثلاً): <b>طبعة نهائية ← تسجيل العضة ← تجربة الأسنان ← تسليم</b>، ولكل مرحلةٍ موعدها واستحقاقها. التاج رحلةٌ واحدة.', en: 'For work that comes back to the clinic more than once (dentures, for example): <b>final impression → bite registration → try-in → delivery</b>, each stage with its own appointment and due date. A crown is a single trip.' } },
    { chap: 2, demo: true, ico: '📎', need: labModal, onLost: LOST_LAB, sel: function () { return $('#lfsBox'); },
      title: { ar: 'المرفقات', en: 'Attachments' },
      body: { ar: 'صورة اللون أو المسح أو ملف PDF — تُحفظ مع الطلب وتظهر أيضاً في <b>ملفات المريض</b>.', en: 'A shade photo, a scan or a PDF — kept with the order and also shown in the <b>patient\'s files</b>.' } },
    { chap: 2, demo: true, ico: '🖨️', need: labModal, onLost: LOST_LAB, sel: function () { return firstShown($$('#labOrderModal .lsl-btn')); },
      title: { ar: 'ورقة الطلب', en: 'The lab slip' },
      body: { ar: 'ورقةٌ تُطبع وترافق الطبعة: الأسنان على المخطط، واللون، و«مطلوب قبل»، والتعليمات، وتوقيعان — <b>دون سعرٍ ولا هاتف المريض</b>.', en: 'A printed slip that goes with the impression: teeth on the chart, shade, «needed by», instructions and two signatures — <b>no price and no patient phone</b>.' },
      tip: { ar: 'مع تفعيل المساعد الذكي يظهر أيضاً <b>🤖 صياغة أمر مخبر</b> ثم <b>💬 حفظ + واتساب</b> لإرسال الأمر إلى رقم المخبر.', en: 'With the AI assistant on, <b>🤖 Draft a lab order</b> and <b>💬 Save + WhatsApp</b> also appear, to send the order to the lab\'s number.' } },
    { chap: 2, demo: true, ico: '💾', need: labModal, onLost: LOST_LAB, sel: function () { return $('#labOrderSaveBtn'); },
      act: { done: function () { return !labModal(); }, doIt: function (t) {
        var s = $('#labOrderLabSelect');
        if (s && !s.value) { var o = $$('option', s).filter(function (x) { return x.value; })[0]; if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } }
        t.click();
      } },
      title: { ar: 'احفظ الطلب', en: 'Save the order' },
      body: { ar: '<b>اضغط «حفظ».</b>', en: '<b>Tap «Save».</b>' } },
    { chap: 2, demo: true, id: 'lab-tab', ico: '🧪', prep: function () { return closeOpenModals() + goTab('labs'); },
      sel: function () { var c = $('#labOrdersContent'); return c ? (firstShown($$('#labOrdersContent > *')) || c) : null; },
      title: { ar: 'الطلب في تبويب «المخابر»', en: 'The order in the «Labs» tab' },
      body: { ar: 'كل طلبات المريض هنا: <b>الحالة</b>، والسن، ونوع العمل، والمخبر، والتواريخ.', en: 'All the patient\'s orders are here: <b>status</b>, tooth, work type, lab and dates.' } },
    { chap: 2, demo: true, ico: '👆', prep: function () { return goTab('labs'); }, sel: function () { return firstShown($$('#labOrdersContent .sy-act-primary, #labOrdersContent .sy-acts')); },
      title: { ar: 'تقدّمٌ بنقرة', en: 'One tap per step' },
      body: { ar: 'الزرّ الأساسي هو <b>الخطوة التالية</b> دائماً: <b>📤 إرسال للمخبر ← 📦 تم الاستلام من المخبر ← ✓ تم الفحص ← 🤝 تم التركيب</b>، وكل نقرةٍ تختم تاريخها. و<b>✏️ تعديل</b> لتصحيح خطوةٍ بالخطأ أو إلغاء الطلب.', en: 'The main button is always <b>the next step</b>: <b>📤 Send to lab → 📦 Received from lab → ✓ Checked → 🤝 Fitted</b>, each tap stamping its date. <b>✏️ Edit</b> corrects a wrong step or cancels the order.' },
      tip: { ar: '<b>🔄 إعادة</b> يظهر بعد وصول العمل (تم الاستلام أو تم الفحص): تختار السبب إلزاماً، وتُسجَّل كل دورة إعادة وتدخل في أداء المخبر.', en: '<b>🔄 Redo</b> appears once the work is back (received or checked): a reason is required, and each redo cycle is recorded and counts in the lab\'s performance.' } },
    { chap: 2, demo: true, center: true, ico: '🔗', prep: function () { return goTab('labs'); },
      title: { ar: 'الربط مع الموعد', en: 'The link with the appointment' },
      body: { ar: 'في نافذة موعد التركيب يظهر الطلب وحالته، وإن لم يصل العمل من المخبر قبل الموعد يظهر <b>«متأخر»</b> بالأحمر — فتعرف قبل أن يصل المريض. وعند إنهاء الموعد يسألك النظام: <b>«تم التركيب؟»</b> فيُغلق الطلب.', en: 'The fitting appointment shows the order and its status; if the work is not back from the lab before the appointment it shows <b>«Late»</b> in red — so you know before the patient arrives. When you finish the appointment you are asked <b>«Fitted?»</b> and the order is closed.' } },
    { center: true, final: true, ico: '🎉', cta: CTA_DEMO, prep: function () { return closeOpenModals() + goTab('file'); },
      title: { ar: 'هذا هو ملف المريض', en: 'That\'s the patient file' },
      body: { ar: 'باختصار للمخبر: <b>السن ← علاجٌ مخبري ← «حفظ + إرسال لمخبر» ← اربط موعد التركيب ← حفظ</b>، ثم الزرّ الأساسي خطوةً بخطوة حتى «تم التركيب».', en: 'In short, for the lab: <b>tooth → lab treatment → «Save + send to lab» → link the fitting appointment → Save</b>, then the main button step by step until «Fitted».' },
      tip: { ar: 'للتفاصيل خطوةً خطوة (الجلسة، الأسطح، الجذور، الدفعات، المواعيد): زر <b>🧭 جولة مفصّلة</b>. والشرح المكتوب في «📖 دليل هذا القسم».', en: 'For step-by-step details (sessions, surfaces, roots, payments, appointments): the <b>🧭 Detailed tour</b> button. The written guide is in «📖 Guide to this section».' } }
  ];

  var LABS = [
    { center: true, ico: '🧪',
      title: { ar: 'صفحة المخابر', en: 'The Labs page' },
      body: { ar: 'هنا <b>كل طلبات المخبر لكل المرضى</b> في مكانٍ واحد، وحساب كل مخبرٍ وأداؤه.', en: 'Here are <b>all lab orders for all patients</b> in one place, plus each lab\'s account and performance.' },
      tip: { ar: 'الأفضل أن يبدأ الطلب من ملف المريض (من السن)؛ وهذه الصفحة للمتابعة.', en: 'Orders are best started from the patient file (from the tooth); this page is for follow-up.' } },
    { sel: function () { return $('.stats-strip'); }, ico: '📊',
      title: { ar: 'الوضع بلمحة', en: 'At a glance' },
      body: { ar: '<b>قيد العمل</b>: مُرسَل، أو وصل ولم يُفحص، أو مُعاد · <b>جاهز للتركيب</b>: فُحص وصار جاهزاً · <b>طلبات هذا الشهر</b> · و<b>المستحق للمخابر</b>.', en: '<b>In progress</b>: sent, back but not checked, or redone · <b>Ready to fit</b>: checked and ready · <b>Orders this month</b> · and <b>owed to labs</b>.' } },
    { sel: function () { var l = $('#labsList'); return l ? (l.closest('.section') || l) : null; }, ico: '🏭',
      title: { ar: 'المخابر المسجّلة', en: 'Your labs' },
      body: { ar: 'لكل مخبرٍ <b>ذمّته</b>: «مستحق له» أو «رصيد لصالح العيادة» أو «الذمة مسدَّدة»، و<b>＋ مخبر جديد</b> للإضافة. المسودّات والطلبات الملغاة لا تدخل الذمّة.', en: 'Each lab shows its <b>balance</b>: «owed to it», «credit to the clinic» or «settled», and <b>＋ New lab</b> adds one. Drafts and cancelled orders are not counted.' } },
    { sel: function () { return firstShown($$('#labsList .lab-perf')); }, ico: '⏱',
      title: { ar: 'أداء المخبر', en: 'Lab performance' },
      body: { ar: 'من طلباتك الفعلية: <b>المدّة المعتادة</b> بأيام الدوام · <b>الالتزام بالموعد</b> · <b>نسبة الإعادة</b>. الأحمر أداءٌ ضعيف — قارن قبل أن تختار المخبر.', en: 'From your real orders: <b>usual turnaround</b> in working days · <b>on-time rate</b> · <b>redo rate</b>. Red means weak — compare before you choose a lab.' } },
    { sel: function () { return firstShown($$('#labsList [onclick^="openLabStatement"]')); }, ico: '💰',
      title: { ar: 'كشف حساب المخبر', en: 'Lab statement' },
      body: { ar: 'كل الأعمال وكلفها، و<b>الدفعات</b> التي دفعتها للمخبر مع طريقة الدفع، والرصيد. سجّل الدفعة من هنا فتظهر في المحاسبة.', en: 'All the work and its cost, the <b>payments</b> you made to the lab with the method, and the balance. Record a payment here and it shows in accounting.' } },
    { sel: function () { return $('.filters'); }, ico: '🚦',
      title: { ar: 'الفلاتر', en: 'Filters' },
      body: { ar: 'تظهر عند الحاجة: <b>⚠️ متأخر</b> (تجاوز الاستحقاق ولم يصل) · <b>⏰ قارب الموعد</b> (موعد التركيب قريب والعمل ما زال خارجاً) · <b>📅 بلا موعد تركيب</b> (عملٌ لمريضٍ ليس له موعد تركيبٍ قادم) · <b>📝 مسودّات</b> (لم تُرسَل بعد) — ثم الحالات. والبحث باسم المريض أو المخبر أعلى الصفحة.', en: 'Shown when needed: <b>⚠️ Late</b> (past due and not back) · <b>⏰ Near the appointment</b> (fitting soon, work still out) · <b>📅 No fitting appointment</b> (work for a patient with no upcoming fitting) · <b>📝 Drafts</b> (not sent yet) — then the statuses. Search by patient or lab name at the top.' } },
    { sel: function () { return firstShown($$('#ordersBody tr, #ordersCards > *')); }, ico: '📋',
      title: { ar: 'سطر الطلب', en: 'An order row' },
      body: { ar: 'المريض، والسن، ونوع العمل، والمخبر، واللون، وتاريخا الإرسال والاستحقاق، والكلفة، والحالة — والمتأخر عليه شارةٌ حمراء.', en: 'Patient, tooth, work type, lab, shade, send and due dates, cost and status — late orders carry a red badge.' } },
    { center: true, ico: '👆',
      title: { ar: 'دورة الطلب', en: 'An order\'s life' },
      body: { ar: 'الزرّ الأساسي في كل سطرٍ هو الخطوة التالية: <b>📤 إرسال للمخبر ← 📦 تم الاستلام من المخبر ← ✓ تم الفحص ← 🤝 تم التركيب</b>. وبعد وصول العمل يظهر <b>🔄 إعادة</b> بسببٍ إلزامي — والكلفة تبقى في شهر الإرسال الأول. ومن <b>✏️ تعديل</b> تصحّح خطوةً أو تلغي الطلب.', en: 'The main button on each row is the next step: <b>📤 Send to lab → 📦 Received from lab → ✓ Checked → 🤝 Fitted</b>. Once the work is back, <b>🔄 Redo</b> appears with a required reason — the cost stays in the month first sent. <b>✏️ Edit</b> corrects a step or cancels the order.' },
      tip: { ar: 'الأجهزة المتحركة على <b>مراحل</b> (طبعة نهائية ← تسجيل العضة ← تجربة الأسنان ← تسليم)، والزرّ يقول «📤 للمخبر: المرحلة التالية»، و«تم التركيب» للمرحلة الأخيرة وحدها.', en: 'Dentures go in <b>stages</b> (final impression → bite → try-in → delivery); the button reads «📤 To lab: next stage», and «Fitted» is for the last stage only.' } },
    { sel: function () { return $('.sd-page-head__actions [onclick^="openLabOrderModal"]'); }, ico: '＋',
      title: { ar: 'طلب جديد من هنا', en: 'A new order from here' },
      body: { ar: 'النافذة نفسها التي في ملف المريض، لكن تختار هنا المريض والسن بنفسك. للطلبات المرتبطة بجلسة استعمل ملف المريض.', en: 'The same window as in the patient file, but here you choose the patient and tooth yourself. For orders tied to a session, use the patient file.' } },
    { center: true, final: true, ico: '🎉',
      title: { ar: 'أنت جاهز!', en: 'You\'re all set!' },
      body: { ar: 'الدورة كاملة: <b>من السن في ملف المريض ← طلبٌ مربوط بموعد التركيب ← متابعةٌ من هنا بالزرّ الأساسي ← «تم التركيب» يوم الموعد</b>، والحساب مع المخبر من كشف الحساب.', en: 'The full cycle: <b>from the tooth in the patient file → an order linked to the fitting appointment → follow it here with the main button → «Fitted» on the day</b>, and settle with the lab from its statement.' },
      tip: { ar: 'التأخير يظهر أيضاً في لوحة التحكم ضمن «يحتاج إلى متابعة».', en: 'Late work also shows on the dashboard under «Needs follow-up».' } }
  ];

  var INVENTORY = [
    { center: true, ico: '📦',
      title: { ar: 'صفحة المخزون', en: 'The Inventory page' },
      body: { ar: 'هنا <b>مواد العيادة ومستلزماتها</b>: كم بقي من كل صنف، ومتى تطلبه، وما الذي قارب انتهاء صلاحيته.', en: 'Here are <b>the clinic\'s materials and supplies</b>: how much is left of each item, when to reorder it, and what is close to expiry.' },
      tip: { ar: 'المخزون للمتابعة والتنبيهات، ولا يدخل في أرباح المحاسبة أو مصاريفها — إلا ما تسجّله أنت مصروفاً من استلام طلبية.', en: 'Inventory is for tracking and alerts and is not counted in accounting profit or expenses — except what you record as an expense from an order receipt.' } },
    { sel: function () { return $('#mgGuide'); }, ico: '📖',
      title: { ar: 'كيف أُدخل المواد؟', en: 'How do I enter materials?' },
      body: { ar: 'دليلٌ يقسم المواد إلى <b>3 أنواع</b>: <b>مواد معدودة</b> (كبسولة بنج، إبرة) · <b>مواد سائبة ثمينة</b> تُعرَّف بوحدة الاستخدام الصغيرة لا بالعبوة (الكمبوزيت بوحدة «تطبيق») · <b>مواد رخيصة كثيرة الاستهلاك</b> (قطن، شاش) لا تُربط بعلاج وتُصحَّح بالجرد آخر الشهر.', en: 'A guide that splits materials into <b>3 types</b>: <b>countable items</b> (anaesthetic cartridge, needle) · <b>valuable bulk materials</b> defined by the small unit of use, not the pack (composite as «application») · <b>cheap high-use materials</b> (cotton, gauze) not linked to a treatment and corrected by a month-end count.' },
      tip: { ar: '<b>📋 نسخ مثال</b> يعبّئ نافذة الصنف جاهزةً — راجعها ثم احفظ.', en: '<b>📋 Copy example</b> fills the item window for you — review it, then save.' } },
    { sel: function () { return $('.sd-page-head__actions [onclick^="openItemModal"]'); }, ico: '＋',
      title: { ar: 'أضف صنفاً', en: 'Add an item' },
      body: { ar: 'الاسم والوحدة والكمية الحالية، ثم <b>حدّ التنبيه</b>: عنده أو تحته يُعدّ الصنف ناقصاً · و<b>كمية الطلب</b> التي تشتريها عادةً كل مرة، فيقترح النظام كم تطلب.', en: 'Name, unit and current quantity, then the <b>alert level</b>: at or below it the item counts as low · and the <b>order quantity</b> you usually buy each time, so the system suggests how much to order.' },
      tip: { ar: 'لصنفٍ له صلاحية اكتب <b>تاريخ صلاحية الرصيد الافتتاحي</b> ليُنبّهك قبل انتهائه. وسعر الشراء اختياري، ويفيد في تقدير كلفة الطلبية وقيمة الجرد.', en: 'For an item that expires, enter the <b>expiry date of the opening stock</b> so you are warned before it expires. The purchase price is optional and helps estimate order cost and count value.' } },
    { center: true, ico: '🧰',
      title: { ar: 'الخصم التلقائي مع العلاج', en: 'Automatic deduction with treatments' },
      body: { ar: 'في صفحة <b>العلاجات</b> اربط كل علاجٍ بموادّه من زر <b>🧰 المواد</b> مع الكمية لكل استخدام. وعند تسجيل جلسةٍ <b>منجزة</b> بهذا العلاج تظهر نافذة <b>«خصم مواد من المخزون»</b>: راجع الكميات (يمكن تعديلها) ثم <b>تأكيد الخصم</b>، أو <b>تخطّي</b>.', en: 'On the <b>Treatments</b> page, link each treatment to its materials from the <b>🧰 Materials</b> button, with the quantity per use. When you record a <b>completed</b> session with that treatment, the <b>«Deduct materials from stock»</b> window appears: review the quantities (you can edit them), then <b>Confirm deduction</b>, or <b>Skip</b>.' },
      tip: { ar: 'الجلسة المخطّطة لا يُخصم لها شيء حتى تُنجَز. والخصم يبدأ من الدفعة الأقرب انتهاءً.', en: 'Nothing is deducted for a planned session until it is completed. Deduction starts from the batch closest to expiry.' } },
    { sel: function () { return $('#summaryRow'); }, ico: '📊',
      title: { ar: 'الوضع بلمحة', en: 'At a glance' },
      body: { ar: '<b>إجمالي الأصناف</b> · <b>أصناف تحت حدّ التنبيه</b> (نافدة أو عند الحدّ وتحته) · <b>دفعات قاربت أو انتهت صلاحيتها</b> (خلال 30 يوماً أو منتهية).', en: '<b>Total items</b> · <b>items below the alert level</b> (out of stock, or at or below the level) · <b>batches near or past expiry</b> (within 30 days, or expired).' } },
    { sel: function () { return $('#lowStockCard'); }, ico: '⚠️',
      title: { ar: 'أصناف تحتاج إعادة طلب', en: 'Items to reorder' },
      body: { ar: 'كل صنفٍ نافد أو عند حدّ التنبيه وتحته، مع <b>الكمية المقترحة</b> في «يُطلب» (من كمية الطلب). <b>🛒 شراء</b> يسجّل ما اشتريته مباشرة، و<b>🧾 جهّز الطلبية</b> يجمع النواقص في طلبيةٍ واحدة للمورّد.', en: 'Every item that is out of stock or at or below its alert level, with the <b>suggested quantity</b> under «To order» (from the order quantity). <b>🛒 Purchase</b> records what you bought directly, and <b>🧾 Prepare order</b> gathers the shortages into one order for the supplier.' },
      tip: { ar: 'النقص يظهر أيضاً في لوحة التحكم ضمن «يحتاج إلى متابعة».', en: 'Shortages also show on the dashboard under «Needs follow-up».' } },
    { sel: function () { return $('#expiryCard'); }, ico: '⏳',
      title: { ar: 'الصلاحية', en: 'Expiry' },
      body: { ar: 'كل شحنةٍ لها تاريخ صلاحية تُسجَّل <b>دفعةً مستقلّة</b>، وتظهر هنا قبل انتهائها بـ30 يوماً مرتّبةً الأقرب انتهاءً أولاً — فاستعملها قبل غيرها. <b>✅ انتهت</b> يُخرج ما بقي منها من الكمية.', en: 'Each shipment with an expiry date is recorded as <b>a separate batch</b>, and shows here 30 days before it expires, closest first — so use it before the others. <b>✅ Finished</b> removes what is left of it from the quantity.' } },
    { prep: function () { return hScroll(firstShown($$('#itemsList tbody tr')), false); }, sel: function () { return firstShown($$('#itemsList tbody tr')); }, ico: '📋',
      title: { ar: 'سطر الصنف', en: 'An item row' },
      body: { ar: 'الكمية بلونها (<b>أحمر</b> نافد، <b>أصفر</b> ناقص، <b>أخضر</b> كافٍ)، وحدّ التنبيه، وسعر الشراء، وأقرب صلاحية. انقر السطر للتعديل، و<b>📜 السجل</b> يعرض كل حركات الصنف.', en: 'The quantity in colour (<b>red</b> out of stock, <b>yellow</b> low, <b>green</b> enough), the alert level, the purchase price and the nearest expiry. Click the row to edit, and <b>📜 History</b> lists all the item\'s movements.' } },
    { prep: function () { return hScroll(firstShown($$('#itemsList [onclick^="openMoveModal"]')), true); }, sel: function () { return firstShown($$('#itemsList [onclick^="openMoveModal"]')); }, ico: '🔄',
      title: { ar: 'حركة مخزون', en: 'A stock movement' },
      body: { ar: 'كل تغييرٍ في الكمية حركةٌ تُحفظ في السجل: <b>شراء / إضافة وارد</b> (مع الصلاحية ورقم الدفعة) · <b>استهلاك / صرف</b> · <b>مرتجع إلى المخزون</b> · <b>مرتجع للمورّد</b> · <b>تعديل جرد</b> بكتابة الكمية الصحيحة.', en: 'Every change in quantity is a movement saved in the history: <b>Purchase / incoming</b> (with expiry and batch number) · <b>Consumption / issue</b> · <b>Return to stock</b> · <b>Return to supplier</b> · <b>Count adjustment</b> by entering the correct quantity.' },
      tip: { ar: 'حتى تغيير الكمية من نافذة الصنف يُسجَّل «تعديل جرد»، فيبقى السجل كاملاً.', en: 'Even a quantity change from the item window is recorded as a «count adjustment», so the history stays complete.' } },
    { sel: function () { return $('[onclick="openCountModal()"]'); }, ico: '🧮',
      title: { ar: 'الجرد', en: 'Stock count' },
      body: { ar: 'عُدّ الموجود فعلاً واكتبه؛ الصنف الذي تتركه فارغاً لا يتغيّر، فيمكنك جرد قسمٍ واحد فقط. وعند <b>✅ اعتمد الجرد</b> يُسجَّل الفرق وتصبح الكمية هي المعدودة.', en: 'Count what is actually there and enter it; an item you leave empty does not change, so you can count just one section. On <b>✅ Approve count</b> the difference is recorded and the quantity becomes the counted one.' },
      tip: { ar: 'يمكنك طباعة ورقة عدٍّ فارغة، والجردات السابقة محفوظةٌ بفروقها وقيمتها.', en: 'You can print a blank count sheet, and past counts are kept with their differences and value.' } },
    { sel: function () { return $('[onclick="openLotModal()"]'); }, ico: '🧪',
      title: { ar: 'تتبّع دفعة (LOT)', en: 'Batch tracking (LOT)' },
      body: { ar: 'اكتب رقم الدفعة كما هو على العبوة لتعرف <b>كل مريضٍ استُعملت له</b> — مثلاً عند سحب المورّد لدفعة — ويمكنك تصدير النتيجة إلى Excel.', en: 'Enter the batch number as printed on the pack to find <b>every patient it was used for</b> — for example when the supplier recalls a batch — and export the result to Excel.' },
      tip: { ar: '<b>⬇️ كشف المخزون</b> ينزّل ملف Excel بكل الأصناف وكمياتها وقيمتها وأقرب صلاحية.', en: '<b>⬇️ Stock report</b> downloads an Excel file with every item, its quantity, value and nearest expiry.' } },
    { sel: function () { return $('.sd-page-head__actions [onclick^="openPoModal"]'); }, ico: '🚚',
      title: { ar: 'الطلبيات والموردون', en: 'Orders and suppliers' },
      body: { ar: 'الدورة: <b>🧾 جهّز الطلبية ← أرسلها للمورّد (واتساب أو طباعة أو Excel) واحفظها طلبية ← عند وصولها سجّل ما وصل</b> مع الصلاحية ورقم الدفعة، فتزيد الكميات وحدها. ويمكن الاستلام على دفعات، وإغلاق الطلبية إن لم يصل الباقي.', en: 'The cycle: <b>🧾 Prepare order → send it to the supplier (WhatsApp, print or Excel) and save it as an order → when it arrives, record what came</b> with expiry and batch number, and the quantities go up by themselves. You can receive in parts, and close the order if the rest will not come.' },
      tip: { ar: 'بعد الاستلام يفتح <b>💸 سجّلها مصروفاً</b> صفحة المصاريف معبّأةً بالمبلغ لتحفظه — وبهذا وحده تدخل كلفة الشراء في المحاسبة. وتبويب <b>🏪 الموردون</b> لأسمائهم وأرقامهم.', en: 'After receiving, <b>💸 Record as expense</b> opens the Expenses page filled with the amount for you to save — only then does the purchase cost enter accounting. The <b>🏪 Suppliers</b> tab keeps their names and numbers.' } },
    { center: true, final: true, ico: '🎉',
      title: { ar: 'أنت جاهز!', en: 'You\'re all set!' },
      body: { ar: 'باختصار: <b>أضف الأصناف بحدّ التنبيه ← اربطها بالعلاجات ← تُخصم مع كل جلسةٍ منجزة ← اطلب النواقص ← سجّل الاستلام ← اجرد آخر الشهر</b>.', en: 'In short: <b>add items with an alert level → link them to treatments → they are deducted with each completed session → order the shortages → record the receipt → count at month end</b>.' },
      tip: { ar: 'أعد الجولة متى شئت من زر <b>🧭 جولة تعريفية</b>، والشرح المكتوب في «📖 دليل هذا القسم».', en: 'Replay it any time from <b>🧭 Guided tour</b>; the written guide is in «📖 Guide to this section».' } }
  ];

  /* ═══════════════ الجولة المفصّلة (طلب المالك، 19 تشرين الثاني 2026) ═══════════════
     زرّ «🧭 جولة مفصّلة» في بطاقة أي مريض يفتح البطاقة التجريبية (?id=demo&tour=detail&from=…) — لا تُمسّ بطاقةٌ حقيقية.
     هناك يختار الطبيب فصلاً، وكل فصلٍ جولةٌ تفاعلية مستقلة بحالتها (sydent.tour.v1.<فصل>). */
  function closeAll() {
    var w = 0;
    ['labOrderModal', 'toothModal', 'newSessionEntryModal', 'matDeductModal', 'payModal', 'apptModal'].forEach(function (id) {
      if (modalOpen(id) && typeof window.closeModal === 'function') { try { window.closeModal(id); w = 200; } catch (e) {} }
    });
    return w;
  }
  function nseOpen() { return modalOpen('newSessionEntryModal'); }
  function toothOpen() { return modalOpen('toothModal'); }
  function step2On() { var s = $('#toothStep2'); return !!(toothOpen() && s && s.style.display !== 'none'); }
  function txTab(cat) { return $('#txTabs .tx-tab[data-txtab="' + cat + '"]'); }
  function txTabOn(cat) { var t = txTab(cat); return !!(t && t.classList.contains('tx-tab-active')); }
  /* خيار العلاج: بالاسم أولاً (قائمة كل عيادةٍ مختلفة)، ثم بالمفتاح المبني */
  function txOpt(re, key) {
    var all = $$('#toothOptsContainer .topt').filter(shown);
    return all.filter(function (b) { return re.test(b.textContent); })[0] ||
      all.filter(function (b) { return (b.getAttribute('onclick') || '').indexOf("pickToothTreatment('" + key + "'") > -1; })[0] || null;
  }
  function chip(code) { return $$('#toothSurfaceChipsRow button').filter(function (b) { return (b.getAttribute('onclick') || '').indexOf("('" + code + "')") > -1; })[0] || null; }
  function chipOn(code) { var c = chip(code); return !!(c && /^\s*✓/.test(c.textContent)); }
  function chipsBox() { var c = $('#toothSurfaceChips'); return c && shown(c) ? c : null; }
  /* SVG بلا .click(): نرسل حدث النقر للعنصر نفسه */
  function tap(t) { if (!t) return; try { t.scrollIntoView({ block: 'center' }); } catch (e) {} ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (ev) { t.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window })); }); }
  var sessBase = 0;
  function sessCount() { return (window.sessions && window.sessions.length) || 0; }
  function saved() { return !toothOpen() && sessCount() > sessBase; }
  function saveStep(lostTo, body, ico) {
    return { chap: 'd', demo: true, ico: ico || '💾', need: function () { return toothOpen() || saved(); }, onLost: { to: lostTo }, prep: function () { sessBase = sessCount(); return 0; },
      sel: function () { return $('#toothFoot .btn-save-m'); }, act: { done: saved, doIt: function (t) { t.click(); } },
      title: { ar: '«حفظ كجلسة»', en: '«Save as a session»' }, body: body };
  }
  function tabStep(cat, lostTo, need, id, ahead) {
    var L = { restorative: { ar: '🦷 ترميمي', en: '🦷 Restorative' }, endodontics: { ar: '🌱 معالجة لبية', en: '🌱 Endodontics' } }[cat];
    return { chap: 'd', demo: true, id: id, ahead: ahead, ico: '📚', need: need || toothOpen, onLost: { to: lostTo }, sel: function () { return txTab(cat); },
      act: { done: function () { return txTabOn(cat); }, doIt: function (t) { t.click(); } },
      title: { ar: 'فئة العلاج', en: 'Treatment category' },
      body: { ar: 'العلاجات مرتّبة في <b>فئات</b>، وفي أولها «⭐ المفضلة» و«🔥 شائعة» إن وُجدت. افتح <b>' + L.ar + '</b>.', en: 'Treatments are grouped in <b>categories</b>, starting with «⭐ Favourites» and «🔥 Common» when you have them. Open <b>' + L.en + '</b>.' } };
  }
  var RE_COMPOSITE = /كومبوزت|كمبوزيت|كومبوزيت|composite/i, RE_RCT = /معالجة لبية|root canal/i;
  function surfaceTarget(n) {
    var a = $$('[data-occ-cell="' + n + '"]').concat($$('.tooth-cell[data-tooth-cell="' + n + '"]'));
    return firstShown(a) || a[0] || null;   /* قبل فتح تبويب الملف يكفي وجودُه — يُعاد الاختيار عند العرض */
  }

  /* الطبيب سبق الجولة (نقر السن أو العلاج بنفسه): الفصل يلحق به إلى الخطوة التي تطابق الشاشة */
  var AH_TOOTH = { when: toothOpen, to: 'ds-tab' }, AH_S2 = { when: step2On, to: 'ds-chips' };
  /* ① الجلسة: الأساس */
  var D_SESS = [
    { chap: 'd', demo: true, id: 'ds-start', center: true, ico: '🗂️', prep: function () { return closeAll() + goTab('file'); },
      title: { ar: 'كيف تُسجَّل جلسة؟', en: 'How is a session recorded?' },
      body: { ar: 'كل علاجٍ يبدأ من <b>السن نفسه</b>: انقر السن (أو سطحه أو جذره) في المخطط، أو اضغط <b>جلسة جديدة</b> ثم اختر السن. النافذة واحدة في الطريقتين، ويرتبط العلاج بالسن تلقائياً. نجرّب هنا «جلسة جديدة».', en: 'Every treatment starts from <b>the tooth itself</b>: tap the tooth (or its surface or root) on the chart, or press <b>New session</b> and pick the tooth. It is the same window either way, and the treatment is tied to the tooth automatically. Here we try «New session».' } },
    { chap: 'd', demo: true, ico: '➕', ahead: AH_TOOTH, sel: function () { return $('.sd-page-head__actions [onclick="openNewSessionEntry()"]'); },
      act: { done: nseOpen, doIt: function (t) { t.click(); } },
      title: { ar: '«جلسة جديدة»', en: '«New session»' },
      body: { ar: 'يفتح شبكة الأسنان لتختار السن. <b>اضغطه.</b>', en: 'It opens the tooth grid so you can pick the tooth. <b>Tap it.</b>' } },
    { chap: 'd', demo: true, ico: '🧭', ahead: AH_TOOTH, need: nseOpen, onLost: { to: 'ds-start' }, sel: function () { return $('#newSessionEntryModal .nse-alt'); },
      title: { ar: 'مداخل أخرى', en: 'Other ways in' },
      body: { ar: 'تحت الشبكة ثلاثة مداخل: <b>علاج جماعي</b> (ربع، فك، فم، جهاز متحرك) · <b>جلسة بلا سن</b> (استشارة، أشعة، أخرى) · <b>جلسة متابعة</b> لاستكمال علاجٍ سابق بلا تكلفة.', en: 'Under the grid are three more ways in: <b>Group treatment</b> (quadrant, arch, mouth, denture) · <b>Session with no tooth</b> (consultation, X-ray, other) · <b>Follow-up session</b> to continue an earlier treatment at no cost.' } },
    { chap: 'd', demo: true, ico: '🦷', ahead: AH_S2, need: function () { return nseOpen() || toothOpen(); }, onLost: { to: 'ds-start' }, sel: function () { return $('#nseGrid [onclick="nsePick(15)"]'); },
      act: { done: toothOpen, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر السن', en: 'Pick the tooth' },
      body: { ar: 'الأرقام الملوّنة: عليه علاج، مخطّط، مقلوع، مزروع. <b>اضغط السن 15.</b>', en: 'Coloured numbers: treated, planned, extracted, implant. <b>Tap tooth 15.</b>' } },
    tabStep('restorative', 'ds-start', null, 'ds-tab', AH_S2),
    { chap: 'd', demo: true, ico: '🦷', ahead: AH_S2, need: toothOpen, onLost: { to: 'ds-start' }, sel: function () { return txOpt(RE_COMPOSITE, 'treated'); },
      act: { done: step2On, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر العلاج', en: 'Pick the treatment' },
      body: { ar: 'اختر <b>حشوة كومبوزت</b> (أو الحشوة التي في قائمتك).', en: 'Pick <b>Composite filling</b> (or the filling on your list).' },
      tip: { ar: 'القائمة من صفحة <b>قائمة العلاجات</b>: هناك تضيف علاجاتك وألوانها وأسعارها.', en: 'The list comes from the <b>Treatment list</b> page: add your treatments, colours and prices there.' } },
    { chap: 'd', demo: true, id: 'ds-chips', ico: '🔲', need: step2On, onLost: { to: 'ds-start' }, sel: function () { var c = $('#toothStep2AreaSlot #toothSurfaceChips'); return c && shown(c) ? c : null; },
      title: { ar: 'الأسطح', en: 'The surfaces' },
      body: { ar: 'من «جلسة جديدة» تظهر الأسطح <b>بعد</b> اختيار العلاج، والسطح الأوسط محدَّد. التفصيل في فصل «الحشوة والأسطح».', en: 'From «New session» the surfaces appear <b>after</b> you pick the treatment, with the middle surface selected. Details are in the «Fillings and surfaces» chapter.' } },
    { chap: 'd', demo: true, ico: '📌', need: step2On, onLost: { to: 'ds-start' }, sel: function () { return $('#toothStatusPicker'); },
      title: { ar: 'حالة العلاج', en: 'Treatment status' },
      body: { ar: '<b>منجز</b>: عُمل اليوم ويدخل في حساب المريض · <b>مخطط</b>: يدخل خطة العلاج ولا يُحسب في رصيد المريض حتى يُنجَز · <b>موجود</b> (من عيادتنا أو من عيادة أخرى) و<b>محوّل</b> و<b>مراقبة</b>: توثيقٌ على المخطط فقط، بلا جلسة ولا تكلفة.', en: '<b>Done</b>: carried out today and counted in the patient\'s account · <b>Planned</b>: goes into the treatment plan and is not counted in the balance until done · <b>Existing</b> (ours or another clinic\'s), <b>Referred</b> and <b>Watch</b>: recorded on the chart only, with no session and no cost.' },
      tip: { ar: 'مع «مراقبة» تختار <b>موعد المراجعة</b>: 3 أشهر أو 6 أشهر أو سنة.', en: 'With «Watch» you pick a <b>review time</b>: 3 months, 6 months or a year.' } },
    { chap: 'd', demo: true, ico: '🔁', need: step2On, onLost: { to: 'ds-start' }, sel: function () { var b = $('#fuNeedBox'); return b && shown(b) ? b : null; },
      title: { ar: 'يحتاج جلسات متابعة', en: 'Needs follow-up sessions' },
      body: { ar: 'للعلاج الذي يمتدّ على زيارات: يُسجَّل «قيد الإنجاز» بتكلفته، وتُضاف زياراته اللاحقة من <b>＋ متابعة</b> في الجلسات <b>بلا تكلفة جديدة</b>.', en: 'For treatment that spans visits: it is recorded «in progress» with its cost, and later visits are added with <b>＋ Follow-up</b> in Sessions <b>at no new cost</b>.' },
      tip: { ar: 'يظهر مع «منجز» وحده، ويُعلَّم افتراضياً للمعالجة اللبية والتعويضات والزراعة والتقويم (وتغيّر ذلك لكل علاجٍ من قائمة العلاجات). للحشوة يبقى فارغاً.', en: 'It shows with «Done» only, and is ticked by default for endodontics, prosthodontics, implants and orthodontics (you can change that per treatment in the treatment list). For a filling it stays unticked.' } },
    { chap: 'd', demo: true, ico: '👨‍⚕️', when: function () { return !!(window.CLINIC_DOCTORS && window.CLINIC_DOCTORS.length); }, need: step2On, onLost: { to: 'ds-start' }, sel: function () { var g = $('#providerPickerGroup'); return g && shown(g) ? g : null; },
      title: { ar: 'الطبيب المعالج', en: 'Treating dentist' },
      body: { ar: 'يُختار تلقائياً: الطبيب المرتبط بحسابك، وإلا صاحب العيادة. غيّره إن عالج غيرك — الجلسة تُحسب للطبيب المختار في التقارير.', en: 'Chosen automatically: the dentist linked to your account, otherwise the clinic owner. Change it if someone else treated — the session counts for the chosen dentist in reports.' } },
    { chap: 'd', demo: true, ico: '💵', need: step2On, onLost: { to: 'ds-start' }, sel: function () { var c = $('#toothCost'); return c ? (c.closest('.form-row') || rowOf('toothCost')) : null; },
      title: { ar: 'التكلفة والتاريخ', en: 'Cost and date' },
      body: { ar: 'التكلفة تُعبّأ من <b>سعر العلاج</b> في قائمة العلاجات، وتعدّلها هنا. والتاريخ اليوم افتراضياً — غيّره لتسجيل جلسةٍ سابقة.', en: 'The cost is filled from the <b>treatment\'s price</b> in the treatment list, and you can change it here. The date is today by default — change it to record an earlier session.' } },
    { chap: 'd', demo: true, ico: '📝', need: step2On, onLost: { to: 'ds-start' }, sel: function () { return rowOf('toothNotes'); },
      title: { ar: 'الملاحظات', en: 'Notes' },
      body: { ar: 'اكتب ما عملت. ويمكنك حفظ نصٍّ متكرّر <b>قالبَ ملاحظة</b> واستعماله بنقرة، أو طلب <b>🤖 اقتراح ملاحظة</b> إن كان المساعد الذكي مفعّلاً في عيادتك.', en: 'Write what you did. You can save repeated text as a <b>note template</b> and reuse it with a tap, or ask for a <b>🤖 suggested note</b> if the AI assistant is on in your clinic.' } },
    saveStep('ds-start', { ar: 'اضغطه لتحفظ الجلسة.', en: 'Tap it to save the session.' }),
    { chap: 'd', demo: true, final: true, chapEnd: true, ico: '🗒️', prep: function () { return closeAll() + goTab('sessions'); }, sel: function () { return $('#tab-sessions .card') || $('#sessionsContent'); },
      title: { ar: 'الجلسات وخطة العلاج', en: 'Sessions and the treatment plan' },
      body: { ar: 'الجلسة هنا، وتلوّنت السنّ في المخطط: <b>مصمت</b> للمنجز و<b>بخطوط</b> للمخطّط. والمخطّط يُنجَز لاحقاً من نافذة السن (<b>تم إنجاز العلاج المخطّط</b>) أو مع إكمال موعده المربوط.', en: 'The session is here, and the tooth is coloured on the chart: <b>solid</b> for done, <b>striped</b> for planned. A planned treatment is completed later from the tooth window (<b>The planned treatment is done</b>) or together with its linked appointment.' } }
  ];

  var AH_FILL = { when: step2On, to: 'df-status' };
  /* ② الحشوة والأسطح */
  var D_FILL = [
    { chap: 'd', demo: true, id: 'df-start', reveal: true, ico: '👆', prep: function () { return closeAll() + goTab('file'); }, sel: function () { return surfaceTarget(46); },
      act: { done: function () { return toothOpen() && !!chip('M'); }, doIt: function () { tap(firstShown($$('[data-occ-cell="46"] .crown-surface[data-surface="O"]').concat($$('.tooth-shape .crown-surface[data-tooth="46"][data-surface="O"]')))); } },
      title: { ar: 'انقر السطح', en: 'Tap the surface' },
      body: { ar: 'كل سنٍّ في المخطط مقسّم إلى <b>أسطح</b> (إطباقي، إنسي، وحشي، دهليزي، لساني) <b>وجذور</b>. <b>انقر السطح الإطباقي للسن 46</b> (الوسط): تُفتح النافذة على هذا السطح بالعلاجات المناسبة له.', en: 'Each tooth on the chart is split into <b>surfaces</b> (occlusal, mesial, distal, buccal, lingual) <b>and roots</b>. <b>Tap the occlusal surface of tooth 46</b> (the middle): the window opens on that surface with the treatments that fit it.' } },
    { chap: 'd', demo: true, ico: '🔲', ahead: AH_FILL, need: function () { return toothOpen() && !!chip('M'); }, onLost: { to: 'df-start' }, sel: chipsBox,
      act: { done: function () { return chipOn('M') && chipOn('D'); }, doIt: function () { ['M', 'D'].forEach(function (k) { if (!chipOn(k)) { var c = chip(k); if (c) c.click(); } }); } },
      title: { ar: 'الأسطح المشمولة', en: 'Surfaces included' },
      body: { ar: 'السطح الذي نقرته محدَّد. <b>أضف إنسي ووحشي</b> لحشوةٍ واحدة على ثلاثة أسطح (MOD).', en: 'The surface you tapped is selected. <b>Add mesial and distal</b> for one filling on three surfaces (MOD).' } },
    { chap: 'd', demo: true, ico: '✅', ahead: AH_FILL, need: function () { return toothOpen() && !!chip('M'); }, onLost: { to: 'df-start' }, sel: chipsBox,
      title: { ar: 'سطرٌ واحد وتكلفة واحدة', en: 'One line, one cost' },
      body: { ar: 'الأسطح الثلاثة تصير <b>ترميماً واحداً</b>: جلسة واحدة بتكلفتها، لا ثلاث. والعنوان يذكر الأسطح المختارة.', en: 'The three surfaces become <b>one restoration</b>: one session with its cost, not three. The title lists the chosen surfaces.' },
      tip: { ar: 'يبقى سطحٌ واحد على الأقل محدَّداً. ونقر سطحٍ من ترميمٍ مركّبٍ قائم يفتحه كاملاً لتعدّله.', en: 'At least one surface stays selected. Tapping a surface of an existing multi-surface restoration opens the whole of it for editing.' } },
    tabStep('restorative', 'df-start', null, null, AH_FILL),
    { chap: 'd', demo: true, ico: '🦷', ahead: AH_FILL, need: toothOpen, onLost: { to: 'df-start' }, sel: function () { return txOpt(RE_COMPOSITE, 'treated'); },
      act: { done: step2On, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر الحشوة', en: 'Pick the filling' },
      body: { ar: 'من «🦷 ترميمي»: حشوة كومبوزت أو حشوة أملغم، ومن «🛡️ وقائي» سادّ الشقوق. <b>اختر حشوة كومبوزت.</b>', en: 'Under «🦷 Restorative»: composite or amalgam filling; under «🛡️ Preventive»: fissure sealant. <b>Pick Composite filling.</b>' } },
    { chap: 'd', demo: true, id: 'df-status', ico: '📌', need: step2On, onLost: { to: 'df-start' }, sel: function () { return $('#toothStatusPicker'); },
      title: { ar: 'منجز، والتكلفة', en: 'Done, and the cost' },
      body: { ar: 'اترك الحالة <b>«منجز»</b>. والتكلفة والطبيب والتاريخ كما في فصل «الجلسة: الأساس».', en: 'Leave it on <b>Done</b>. Cost, dentist and date work as in the «Session basics» chapter.' } },
    saveStep('df-start', { ar: 'اضغطه لتحفظ الحشوة.', en: 'Tap it to save the filling.' }),
    { chap: 'd', demo: true, final: true, chapEnd: true, reveal: true, ico: '🎨', prep: function () { return closeAll() + goTab('file'); }, sel: function () { return surfaceTarget(46); },
      title: { ar: 'الأسطح في المخطط', en: 'The surfaces on the chart' },
      body: { ar: 'تلوّنت <b>الأسطح الثلاثة</b> بلون الحشوة، والجلسة في «الجلسات» بسطرٍ واحد.', en: 'The <b>three surfaces</b> now carry the filling\'s colour, and the session is one line in «Sessions».' },
      tip: { ar: 'من «جلسة جديدة» الترتيب معكوس: <b>السن ← العلاج ← الأسطح</b>، والسطح الأوسط (الإطباقي للخلفي، القاطع للأمامي) محدَّد مسبقاً.', en: 'From «New session» the order is reversed: <b>tooth → treatment → surfaces</b>, with the middle surface (occlusal for back teeth, incisal for front teeth) already selected.' } }
  ];

  /* ③ المعالجة اللبية والجذور */
  function rootFlow() { return toothOpen() && !!chip('R1'); }
  var AH_ENDO = { when: step2On, to: 'de-fu' };
  var D_ENDO = [
    { chap: 'd', demo: true, id: 'de-start', reveal: true, ico: '👆', prep: function () { return closeAll() + goTab('file'); }, sel: function () { return $('.tooth-shape .root-part[data-tooth="47"][data-surface="R1"]'); },
      act: { done: rootFlow, doIt: function (t) { tap(t); } },
      title: { ar: 'انقر الجذر', en: 'Tap the root' },
      body: { ar: 'في الصورة الجانبية للمخطط <b>انقر جذر السن 47</b>. نقر الجذر يعرض <b>العلاجات المناسبة للجذر</b>.', en: 'In the side view of the chart, <b>tap a root of tooth 47</b>. Tapping a root shows <b>the treatments that fit a root</b>.' } },
    { chap: 'd', demo: true, ico: '🌿', ahead: AH_ENDO, need: rootFlow, onLost: { to: 'de-start' }, sel: chipsBox,
      act: { done: function () { return chipOn('R1') && chipOn('R2'); }, doIt: function () { var a = $('#toothSurfaceChipsRow [onclick="selectAllRootChips()"]'); if (a) a.click(); } },
      title: { ar: 'الجذور المشمولة', en: 'Roots included' },
      body: { ar: 'السن 47 له جذران: <b>الجذر الإنسي</b> و<b>الجذر الوحشي</b>. اختر جذراً أو أكثر، أو <b>اضغط «كل الجذور»</b>.', en: 'Tooth 47 has two roots: <b>mesial</b> and <b>distal</b>. Pick one root or more, or <b>tap «All roots»</b>.' },
      tip: { ar: 'الرحى العلوية ثلاثة جذور: الدهليزي الإنسي، الدهليزي الوحشي، الحنكي. وللسن وحيد الجذر لا تظهر هذه الأزرار.', en: 'Upper molars have three roots: mesiobuccal, distobuccal and palatal. A single-rooted tooth shows no root buttons.' } },
    { chap: 'd', demo: true, ico: '✅', ahead: AH_ENDO, need: rootFlow, onLost: { to: 'de-start' }, sel: chipsBox,
      title: { ar: 'معالجة واحدة', en: 'One treatment' },
      body: { ar: 'كل الجذور = <b>معالجة واحدة</b>: سطرٌ واحد وتكلفة واحدة، لا علاجٌ لكل قناة.', en: 'All roots = <b>one treatment</b>: one line and one cost, not one per canal.' } },
    tabStep('endodontics', 'de-start', rootFlow, null, AH_ENDO),
    { chap: 'd', demo: true, ico: '🌱', ahead: AH_ENDO, need: toothOpen, onLost: { to: 'de-start' }, sel: function () { return txOpt(RE_RCT, 'root-canal'); },
      act: { done: step2On, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر العلاج', en: 'Pick the treatment' },
      body: { ar: 'في «🌱 معالجة لبية» علاجات الجذر: معالجة لبية، حشوة عصب، إعادة معالجة، وتد… <b>اختر معالجة لبية.</b>', en: 'Under «🌱 Endodontics» are the root treatments: root canal, root filling, retreatment, post… <b>Pick Root canal treatment.</b>' } },
    { chap: 'd', demo: true, id: 'de-fu', ico: '🔁', need: step2On, onLost: { to: 'de-start' }, sel: function () { var b = $('#fuNeedBox'); return b && shown(b) ? b : null; },
      title: { ar: 'على عدة زيارات', en: 'Over several visits' },
      body: { ar: '<b>🔁 يحتاج جلسات متابعة</b> معلَّمٌ تلقائياً للمعالجة اللبية: تُسجَّل اليوم «قيد الإنجاز» بتكلفتها، والزيارات التالية (غسل الأقنية، حشوها) تُضاف من <b>＋ متابعة</b> بلا تكلفة.', en: '<b>🔁 Needs follow-up sessions</b> is ticked automatically for root canal treatment: it is recorded today «in progress» with its cost, and the next visits (irrigation, obturation) are added with <b>＋ Follow-up</b> at no cost.' },
      tip: { ar: 'انتهت في زيارةٍ واحدة؟ ألغِ العلامة قبل الحفظ.', en: 'Finished in one visit? Untick it before saving.' } },
    saveStep('de-start', { ar: 'اضغطه لتحفظ المعالجة.', en: 'Tap it to save the treatment.' }),
    { chap: 'd', demo: true, final: true, chapEnd: true, reveal: true, ico: '🎨', prep: function () { return closeAll() + goTab('file'); }, sel: function () { return $('.tooth-cell[data-tooth-cell="47"]'); },
      title: { ar: 'القنوات في المخطط', en: 'The canals on the chart' },
      body: { ar: 'تظهر <b>قناةٌ داخل كل جذرٍ معالَج</b>. وللتاج بعد المعالجة انقر <b>التاج نفسه</b> لا الجذر — والطريقة في فصل «الإرسال إلى المخبر».', en: 'A <b>canal appears inside each treated root</b>. For a crown afterwards, tap <b>the crown itself</b>, not the root — the steps are in the «Sending to the lab» chapter.' } }
  ];

  /* ⑤ الدفعات والحساب */
  var D_PAY = [
    { chap: 'd', demo: true, id: 'dp-start', ahead: { when: function () { return modalOpen('payModal'); }, to: 'dp-modal' }, ico: '💼', prep: function () { return closeAll() + goTab('payments'); }, sel: function () { var s = $('#balanceSummary'); return s ? (s.closest('.card') || s) : null; },
      title: { ar: 'حساب المريض بلمحة', en: 'The account at a glance' },
      body: { ar: '<b>العلاج المنجز</b> · <b>إجمالي المدفوع</b> · و<b>الرصيد</b>: عليه أو له. والمخطّط يظهر وحده <b>غير محتسب ضمن الرصيد</b> حتى يُنجَز.', en: '<b>Treatment done</b> · <b>total paid</b> · and the <b>balance</b>: owed by or to the patient. Planned work shows apart, <b>not counted in the balance</b> until done.' } },
    { chap: 'd', demo: true, ico: '＋', prep: function () { return goTab('payments'); }, sel: function () { return $('#tab-payments [onclick="openPayModal()"]'); },
      act: { done: function () { return modalOpen('payModal'); }, doIt: function (t) { t.click(); } },
      title: { ar: 'تسجيل دفعة', en: 'Record a payment' },
      body: { ar: 'هنا، أو «تسجيل دفعة» أعلى الصفحة. <b>اضغطه.</b>', en: 'Here, or «Record a payment» at the top of the page. <b>Tap it.</b>' } },
    { chap: 'd', demo: true, id: 'dp-modal', ico: '💳', need: function () { return modalOpen('payModal'); }, onLost: { to: 'dp-start' }, sel: function () { return $('#payModal .modal-body'); },
      title: { ar: 'الدفعة', en: 'The payment' },
      body: { ar: '<b>المبلغ</b> و<b>طريقة الدفع</b> (نقداً، شام كاش، تحويل بنكي…) و<b>التاريخ</b>. الدفعة تُنقص الرصيد وتظهر في المحاسبة.', en: '<b>Amount</b>, <b>payment method</b> (cash, Sham Cash, bank transfer…) and <b>date</b>. The payment lowers the balance and shows in accounting.' } },
    { chap: 'd', demo: true, ico: '📒', prep: function () { return closeAll() + goTab('payments'); }, sel: function () { return $('#tab-payments [onclick="openObModal()"]'); },
      title: { ar: 'ذمة سابقة', en: 'Earlier balance' },
      body: { ar: 'مبلغٌ كان على المريض <b>قبل أن تبدأ باستعمال النظام</b>: يدخل رصيده دون جلسة، بتاريخه القديم.', en: 'An amount the patient owed <b>before you started using the system</b>: it enters the balance without a session, with its old date.' } },
    { chap: 'd', demo: true, ico: '⚖️', prep: function () { return goTab('payments'); }, sel: function () { return $('#tab-payments [onclick="openAdjustmentModal()"]'); },
      title: { ar: 'خصم · إعدام · استرداد', en: 'Discount · write-off · refund' },
      body: { ar: '<b>خصم</b>: تخفيضٌ على المريض · <b>إعدام دين</b>: مبلغٌ لن يُحصَّل · <b>استرداد</b>: إعادة مبلغٍ للمريض بطريقة الإعادة.', en: '<b>Discount</b>: a reduction for the patient · <b>Write-off</b>: an amount that will not be collected · <b>Refund</b>: money given back to the patient, with the method.' } },
    { chap: 'd', demo: true, final: true, chapEnd: true, ico: '🗓️', prep: function () { return goTab('payments'); }, sel: function () { return $('#paymentPlanCard'); },
      title: { ar: 'خطة الأقساط', en: 'Installment plan' },
      body: { ar: 'تقسيم المبلغ المتبقي على دفعاتٍ بمواعيد — <b>للتذكير فقط ولا تغيّر الحساب</b>. الدفعة الفعلية تُسجَّل دائماً بـ«تسجيل دفعة».', en: 'Splits the remaining amount into dated installments — <b>a reminder only; it does not change the account</b>. The actual payment is always recorded with «Record a payment».' } }
  ];

  /* ⑥ الموعد */
  var D_APPT = [
    { chap: 'd', demo: true, id: 'da-start', ico: '📅', prep: function () { return closeAll() + goTab('file'); }, sel: function () { return $('.sd-page-head__actions [onclick="openApptModal()"]'); },
      act: { done: function () { return modalOpen('apptModal'); }, doIt: function (t) { t.click(); } },
      title: { ar: 'موعد جديد', en: 'New appointment' },
      body: { ar: 'لحجز موعدٍ لهذا المريض. <b>اضغطه.</b>', en: 'To book an appointment for this patient. <b>Tap it.</b>' } },
    { chap: 'd', demo: true, ico: '🕘', need: function () { return modalOpen('apptModal'); }, onLost: { to: 'da-start' }, sel: function () { var a = $('#aType'); return a ? (a.closest('.form-row') || rowOf('aType')) : null; },
      title: { ar: 'بيانات الموعد', en: 'Appointment details' },
      body: { ar: '<b>نوع الموعد</b> والمدة، ثم التاريخ والوقت، و<b>الحالة</b> (مؤكد، غير مؤكد، معلّق…) والطبيب.', en: '<b>Appointment type</b> and length, then date and time, the <b>status</b> (confirmed, unconfirmed, pending…) and the dentist.' } },
    { chap: 'd', demo: true, ico: '🗒️', need: function () { return modalOpen('apptModal'); }, onLost: { to: 'da-start' }, sel: function () { return $('#apptModal label.planned-toggle-pp'); },
      title: { ar: 'موعد مخطّط', en: 'Planned appointment' },
      body: { ar: '<b>بدون تاريخٍ محدّد</b>: يُحفظ للمتابعة، ويُجدول لاحقاً حين يؤكّد المريض.', en: '<b>With no date yet</b>: kept for follow-up, and scheduled later once the patient confirms.' } },
    { chap: 'd', demo: true, ico: '🔗', need: function () { return modalOpen('apptModal'); }, onLost: { to: 'da-start' }, sel: function () { var s = $('#appProcSectionPP'); return s && shown(s) ? s : null; },
      title: { ar: 'علاجات هذا الموعد', en: 'Treatments for this appointment' },
      body: { ar: 'اربط العلاجات <b>المخطّطة</b> بالموعد. وعند إكمال الموعد في صفحة المواعيد (<b>إكمال الموعد + كل العلاجات المخطّطة</b>) تُسجَّل منجزةً معه وتدخل حساب المريض — دون أن تفتح أي سن.', en: 'Link <b>planned</b> treatments to the appointment. When you complete the appointment on the Appointments page (<b>Complete the appointment + all planned treatments</b>) they are recorded as done with it and enter the patient\'s account — without opening any tooth.' } },
    { chap: 'd', demo: true, final: true, chapEnd: true, center: true, ico: '🧪', prep: function () { return closeAll() + goTab('appts'); },
      title: { ar: 'مع المخبر', en: 'With the lab' },
      body: { ar: 'موعد التركيب المربوط بطلب مخبر يُظهر حالة الطلب، و<b>«متأخر»</b> بالأحمر إن لم يصل العمل قبل الموعد. وعند إنهاء الموعد يسألك: <b>«تم التركيب؟»</b> فيُغلق الطلب.', en: 'A fitting appointment linked to a lab order shows the order\'s status, and <b>«Late»</b> in red if the work is not back before the appointment. When you finish the appointment you are asked <b>«Fitted?»</b> and the order is closed.' } }
  ];

  /* ④ المخبر: الفصل التفاعلي نفسه من جولة الملف */
  var D_LAB = PATIENT.filter(function (s) { return s.chap === 2 && s.demo === true; }).concat([
    { chap: 'd', demo: true, final: true, chapEnd: true, center: true, ico: '🎉', prep: function () { return closeAll() + goTab('labs'); },
      title: { ar: 'هذا هو الإرسال إلى المخبر', en: 'That\'s sending to the lab' },
      body: { ar: 'باختصار: <b>السن ← علاجٌ مخبري ← «حفظ + إرسال لمخبر» ← اربط موعد التركيب ← حفظ</b>، ثم الزرّ الأساسي خطوةً بخطوة حتى «تم التركيب».', en: 'In short: <b>tooth → lab treatment → «Save + send to lab» → link the fitting appointment → Save</b>, then the main button step by step until «Fitted».' } }
  ]);

  var CHAPTERS = [
    { k: 'd-sess', ico: '🗂️', t: { ar: 'الجلسة: الأساس', en: 'Session basics' }, s: { ar: 'جلسة جديدة · منجز أم مخطّط · المتابعة · الطبيب والتكلفة والملاحظات', en: 'New session · done or planned · follow-ups · dentist, cost and notes' } },
    { k: 'd-fill', ico: '🦷', t: { ar: 'الحشوة والأسطح', en: 'Fillings and surfaces' }, s: { ar: 'نقر السطح في المخطط · حشوةٌ على عدة أسطح بسطرٍ واحد', en: 'Tapping a surface · one filling over several surfaces in one line' } },
    { k: 'd-endo', ico: '🌱', t: { ar: 'المعالجة اللبية والجذور', en: 'Root canals and roots' }, s: { ar: 'نقر الجذر · جذرٌ أو أكثر أو كل الجذور · الزيارات المتعدّدة', en: 'Tapping a root · one, several or all roots · multiple visits' } },
    { k: 'd-lab', ico: '🧪', t: { ar: 'الإرسال إلى المخبر', en: 'Sending to the lab' }, s: { ar: 'من السن إلى طلبٍ مربوط بموعد التركيب', en: 'From the tooth to an order linked to the fitting appointment' } },
    { k: 'd-pay', ico: '💳', t: { ar: 'الدفعات والحساب', en: 'Payments and the account' }, s: { ar: 'الرصيد · تسجيل دفعة · ذمة سابقة · الخصم والإعدام والاسترداد · الأقساط', en: 'Balance · recording a payment · earlier balance · discount, write-off and refund · installments' } },
    { k: 'd-appt', ico: '📅', t: { ar: 'الموعد', en: 'Appointments' }, s: { ar: 'موعد جديد أو مخطّط · ربط العلاجات المخطّطة · الربط مع المخبر', en: 'New or planned appointment · linking planned treatments · the lab link' } }
  ];

  var TOURS = { dashboard: DASH, patient: PATIENT, labs: LABS, inventory: INVENTORY,
    'd-sess': D_SESS, 'd-fill': D_FILL, 'd-endo': D_ENDO, 'd-lab': D_LAB, 'd-pay': D_PAY, 'd-appt': D_APPT };

  /* ═══════════════ الحالة ═══════════════ */
  function load(p) { try { return JSON.parse(localStorage.getItem(KEY + p) || 'null') || {}; } catch (e) { return {}; } }
  function save(p, s) { try { localStorage.setItem(KEY + p, JSON.stringify(s)); } catch (e) {} }

  /* ═══════════════ الواجهة ═══════════════ */
  var css = '' +
    '.sd-tour-btn{margin-inline-start:6px}' +
    '.sd-tour-btn .sdt-n{font-size:10.5px;background:var(--green);color:var(--on-accent);border-radius:999px;padding:0 6px;margin-inline-start:4px}' +
    '.sdt-blk{position:fixed;z-index:100500;background:transparent}' +
    '.sdt-scrim{position:fixed;inset:0;z-index:100501;background:rgba(9,18,31,.55);pointer-events:none;opacity:0;transition:opacity .25s}' +
    '.sdt-scrim.on{opacity:1}' +
    '.sdt-spot{position:fixed;z-index:100502;pointer-events:none;border-radius:12px;box-shadow:0 0 0 3px var(--green),0 0 0 9999px rgba(9,18,31,.55);opacity:0;' +
      'transition:top .35s cubic-bezier(.2,.8,.2,1),left .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1),height .35s cubic-bezier(.2,.8,.2,1),opacity .2s}' +
    '.sdt-spot.on{opacity:1}' +
    '.sdt-spot.act::after{content:"";position:absolute;inset:-3px;border-radius:14px;animation:sdtPulse 1.6s ease-out infinite}' +
    '@keyframes sdtPulse{0%{box-shadow:0 0 0 0 rgba(var(--green-rgb),.6)}100%{box-shadow:0 0 0 14px rgba(var(--green-rgb),0)}}' +
    '.sdt-card{position:fixed;z-index:100503;width:330px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:16px;' +
      'box-shadow:var(--shadow-modal);padding:16px 16px 12px;outline:none;font-family:inherit;opacity:0;transform:scale(.97);transition:top .35s cubic-bezier(.2,.8,.2,1),left .35s cubic-bezier(.2,.8,.2,1),opacity .2s,transform .2s}' +
    '.sdt-card.on{opacity:1;transform:none}' +
    '.sdt-card:focus,.sdt-card:focus-visible{outline:none!important;box-shadow:var(--shadow-modal)!important}' +
    '.sdt-card.center{width:390px}' +
    '.sdt-arrow{position:absolute;width:14px;height:14px;background:var(--bg2);border:1px solid var(--border);transform:rotate(45deg)}' +
    '.sdt-arrow[hidden]{display:none}' +
    '.sdt-arrow[data-side="L"]{right:-8px;border-left:0;border-bottom:0}' +
    '.sdt-arrow[data-side="R"]{left:-8px;border-right:0;border-top:0}' +
    '.sdt-arrow[data-side="B"]{top:-8px;border-bottom:0;border-right:0}' +
    '.sdt-arrow[data-side="T"]{bottom:-8px;border-top:0;border-left:0}' +
    '.sdt-head{display:flex;align-items:flex-start;gap:10px}' +
    '.sdt-ico{width:38px;height:38px;border-radius:11px;background:rgba(var(--green-rgb),.12);color:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:19px}' +
    '.sdt-tt{flex:1;min-width:0}' +
    '.sdt-chap{font-size:11px;font-weight:700;color:var(--green);margin-bottom:1px}' +
    '.sdt-ttl{font-size:16px;font-weight:800;margin:2px 0 0;line-height:1.5;color:var(--text)}' +
    '.sdt-x{width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:var(--text2);cursor:pointer;font-size:19px;line-height:1;flex-shrink:0;font-family:inherit}' +
    '.sdt-x:hover{background:var(--bg3);color:var(--text)}' +
    '.sdt-body{font-size:13.5px;line-height:1.85;color:var(--text2);margin:8px 0 4px}' +
    '.sdt-body b,.sdt-tip b{color:var(--text)}' +
    '.sdt-tip{font-size:12px;line-height:1.7;margin:8px 0 0;padding:7px 10px;border-radius:10px;background:var(--bg4);border:1px solid var(--border);color:var(--text2)}' +
    '.sdt-tip[hidden],.sdt-chap[hidden],.sdt-wait[hidden],.sdt-b[hidden]{display:none}' +
    '.sdt-wait{font-size:12px;font-weight:700;color:var(--green);margin-top:8px;display:flex;align-items:center;gap:6px}' +
    '.sdt-wait::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--green);animation:sdtBlink 1s ease-in-out infinite}' +
    '@keyframes sdtBlink{50%{opacity:.25}}' +
    '.sdt-prog{display:flex;align-items:center;gap:10px;margin:12px 0 10px}' +
    '.sdt-bar{flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden}' +
    '.sdt-bar i{display:block;height:100%;background:var(--green);border-radius:999px;transition:width .35s}' +
    '.sdt-count{font-size:11.5px;color:var(--text3);font-weight:700;white-space:nowrap}' +
    '.sdt-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.sdt-foot .sdt-sp{flex:1}' +
    '.sdt-b{height:36px;padding:0 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--border2);background:var(--bg2);color:var(--text);white-space:nowrap;font-family:inherit}' +
    '.sdt-b:hover{background:var(--bg3)}' +
    '.sdt-b:active{transform:scale(.97)}' +
    '.sdt-b:focus-visible,.sdt-x:focus-visible{outline:2px solid var(--green);outline-offset:2px}' +
    '.sdt-next{background:var(--green);border-color:var(--green);color:var(--on-accent);min-width:92px}' +
    '.sdt-next:hover{background:var(--green2)}' +
    '.sdt-ghost{border-color:transparent;background:transparent;color:var(--text2);padding:0 8px}' +
    '.sdt-ghost:hover{color:var(--text);background:var(--bg3)}' +
    '.sdt-keys{font-size:11px;color:var(--text3);margin-top:8px;text-align:center}' +
    '.sdt-keys kbd{font-family:inherit;border:1px solid var(--border2);border-bottom-width:2px;border-radius:5px;padding:0 5px;background:var(--bg4);font-size:10.5px}' +
    '.sdt-toast{position:fixed;z-index:100504;left:50%;bottom:22px;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--text);color:var(--bg2);padding:10px 16px;border-radius:12px;font-size:13px;font-weight:700;transition:.25s;box-shadow:var(--shadow-modal);max-width:calc(100vw - 32px);text-align:center;font-family:inherit}' +
    '.sdt-toast.on{opacity:1;transform:translate(-50%,0)}' +
    'body.sdt-on .sb-nav{padding-bottom:45vh}' +
    'body.sdt-on #sbMainContent{padding-bottom:55vh}' +
    '@media (max-width:820px){' +
      '.sdt-card.sheet{left:10px!important;right:10px;width:auto!important;max-width:none;top:auto!important;bottom:calc(10px + env(safe-area-inset-bottom));border-radius:18px;max-height:46vh}' +
      '.sdt-card.sheet.top{top:calc(10px + env(safe-area-inset-top))!important;bottom:auto}' +
      '.sdt-keys{display:none}' +
      '.sdt-pick-box{max-height:calc(100vh - 16px)!important}' +
      'body.sdt-on .sb-nav{padding-bottom:60vh}' +
      'body.sdt-on #sbMainContent,body.sdt-on .modal-overlay.open .modal{padding-bottom:58vh}' +
    '}' +
    '.sd-tour-detail{margin-inline-start:6px}' +
    '.sdt-cend{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    '.sdt-cend[hidden]{display:none}' +
    '.sdt-cend .sdt-b{flex:1 1 auto}' +
    '.sdt-pick{position:fixed;inset:0;z-index:100505;background:rgba(9,18,31,.55);display:flex;align-items:center;justify-content:center;padding:12px}' +
    '.sdt-pick[hidden]{display:none}' +
    '.sdt-pick-box{width:520px;max-width:100%;max-height:calc(100vh - 24px);overflow-y:auto;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-modal);padding:16px 18px}' +
    '.sdt-pick-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}' +
    '.sdt-pick-h h2{flex:1;margin:0;font-size:16px;font-weight:800}' +
    '.sdt-pick-note{font-size:12.5px;line-height:1.7;background:var(--purple-soft,#f5f3ff);border:1px solid var(--purple-bd,#ddd6fe);border-radius:10px;padding:9px 12px;margin-bottom:12px}' +
    '.sdt-chs{display:grid;gap:8px}' +
    '.sdt-ch{display:flex;align-items:center;gap:12px;width:100%;padding:11px 12px;border:1.5px solid var(--border);border-radius:13px;background:var(--bg2);color:var(--text);cursor:pointer;font-family:inherit;text-align:start}' +
    '.sdt-ch:hover,.sdt-ch:focus-visible{border-color:var(--green)}' +
    '.sdt-ch-i{width:38px;height:38px;flex:none;border-radius:11px;background:var(--bg3);display:grid;place-items:center;font-size:19px}' +
    '.sdt-ch-t{flex:1;min-width:0}' +
    '.sdt-ch-t b{display:block;font-size:14px}' +
    '.sdt-ch-t small{display:block;font-size:12px;color:var(--text2);line-height:1.6;margin-top:2px}' +
    '.sdt-ch-n{font-size:11.5px;color:var(--text2);white-space:nowrap}' +
    '.sdt-ch.done .sdt-ch-n{color:var(--green);font-weight:700}' +
    '.sdt-pick-f{display:flex;justify-content:center;margin-top:10px}' +
    '.sdt-pick-f[hidden]{display:none}' +
    '@media (prefers-reduced-motion:reduce){.sdt-spot,.sdt-card,.sdt-bar i{transition:none!important}.sdt-spot.act::after,.sdt-wait::before{animation:none}}' +
    '@media print{.sd-tour-btn,.sdt-card,.sdt-spot,.sdt-scrim,.sdt-blk{display:none!important}}';

  var UI = {
    next: { ar: 'التالي', en: 'Next' }, prev: { ar: 'السابق', en: 'Back' }, later: { ar: 'تأجيل', en: 'Later' }, laterFirst: { ar: 'لاحقاً', en: 'Not now' },
    start: { ar: 'ابدأ الجولة', en: 'Start the tour' }, done: { ar: 'تمّ', en: 'Done' }, doIt: { ar: 'نفّذ عنّي', en: 'Do it for me' },
    wait: { ar: 'بانتظار نقرتك…', en: 'Waiting for your tap…' }, opening: { ar: 'جارٍ الفتح…', en: 'Opening…' }, of: { ar: ' من ', en: ' of ' }, close: { ar: 'إغلاق الجولة', en: 'Close the tour' },
    btn: { ar: 'جولة تعريفية', en: 'Guided tour' }, resume: { ar: 'تابع الجولة', en: 'Continue the tour' },
    snoozed: { ar: 'تأجّلت الجولة — أكملها من زر 🧭 في رأس الصفحة', en: 'Tour paused — continue it from the 🧭 button in the page header' },
    finished: { ar: 'انتهت الجولة ✓', en: 'Tour complete ✓' },
    detail: { ar: 'جولة مفصّلة', en: 'Detailed tour' },
    pickTitle: { ar: '🧭 جولة مفصّلة — اختر ما تريد تعلّمه', en: '🧭 Detailed tour — pick what to learn' },
    pickNote: { ar: 'تجري على <b>البطاقة التجريبية</b>: تجرّب كل خطوةٍ بنفسك، ولا يُحفظ شيء ولا يُمسّ أي مريضٍ حقيقي.', en: 'It runs on the <b>demo card</b>: try every step yourself; nothing is saved and no real patient is touched.' },
    steps: { ar: ' خطوات', en: ' steps' }, steps11: { ar: ' خطوة', en: ' steps' }, chDone: { ar: '✓ تمّ', en: '✓ Done' },
    nextChap: { ar: 'الفصل التالي', en: 'Next chapter' }, allChaps: { ar: 'كل الفصول', en: 'All chapters' }, backPt: { ar: 'ارجع لبطاقة المريض', en: 'Back to the patient' },
    chapDone: { ar: 'انتهى الفصل ✓', en: 'Chapter complete ✓' },
    chap1: { ar: '① أقسام الملف', en: '① Sections of the file' }, chap2: { ar: '② الإرسال إلى المخبر', en: '② Sending to the lab' },
    keys: { ar: '<kbd>←</kbd> التالي · <kbd>→</kbd> السابق · <kbd>Esc</kbd> تأجيل', en: '<kbd>→</kbd> Next · <kbd>←</kbd> Back · <kbd>Esc</kbd> Later' }
  };

  var el = {}, P = null, steps = [], idx = 0, active = false, seq = 0, poll = null, lastFocus = null, busy = false, lostAt = 0, shownAt = 0;

  function mk(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function q(s) { return el.card.querySelector(s); }
  function build() {
    if (el.card) return;
    var st = mk('style'); st.id = 'sdtStyle'; st.textContent = css; document.head.appendChild(st);
    el.blk = [0, 1, 2, 3].map(function () { var b = mk('div', 'sdt-blk'); b.addEventListener('click', function () { el.card.focus(); }); return b; });
    el.scrim = mk('div', 'sdt-scrim'); el.spot = mk('div', 'sdt-spot'); el.card = mk('div', 'sdt-card');
    el.card.setAttribute('role', 'dialog'); el.card.setAttribute('aria-modal', 'true'); el.card.setAttribute('aria-labelledby', 'sdtTtl');
    el.card.tabIndex = -1; el.card.dir = EN ? 'ltr' : 'rtl';
    el.card.innerHTML = '<div class="sdt-arrow"></div><div class="sdt-head"><div class="sdt-ico"></div><div class="sdt-tt"><div class="sdt-chap"></div><h2 class="sdt-ttl" id="sdtTtl"></h2></div>' +
      '<button type="button" class="sdt-x">×</button></div><div class="sdt-body" aria-live="polite"></div><div class="sdt-tip"></div><div class="sdt-wait"></div>' +
      '<div class="sdt-prog"><div class="sdt-bar"><i></i></div><span class="sdt-count"></span></div>' +
      '<div class="sdt-foot"><button type="button" class="sdt-b sdt-ghost sdt-later"></button><span class="sdt-sp"></span><button type="button" class="sdt-b sdt-prev"></button>' +
      '<button type="button" class="sdt-b sdt-cta" hidden></button><button type="button" class="sdt-b sdt-next"></button></div>' +
      '<div class="sdt-cend" hidden><button type="button" class="sdt-b sdt-next sdt-nchap"></button><button type="button" class="sdt-b sdt-ghost sdt-all"></button><button type="button" class="sdt-b sdt-ghost sdt-back"></button></div><div class="sdt-keys"></div>';
    el.toast = mk('div', 'sdt-toast'); el.toast.setAttribute('role', 'status'); el.toast.dir = EN ? 'ltr' : 'rtl';
    el.blk.forEach(function (b) { document.body.appendChild(b); });
    [el.scrim, el.spot, el.card, el.toast].forEach(function (n) { document.body.appendChild(n); });
    q('.sdt-x').setAttribute('aria-label', T(UI.close)); q('.sdt-x').title = T(UI.close) + ' (Esc)';
    q('.sdt-keys').innerHTML = T(UI.keys);
    q('.sdt-next').addEventListener('click', onNext);
    q('.sdt-prev').addEventListener('click', prev);
    q('.sdt-later').addEventListener('click', later);
    q('.sdt-x').addEventListener('click', later);
    q('.sdt-cta').addEventListener('click', function () { var s = steps[idx]; if (s && s.cta) { finish(true); location.href = s.cta.href; } });
    q('.sdt-nchap').textContent = T(UI.nextChap) + (EN ? ' →' : ' ←'); q('.sdt-all').textContent = T(UI.allChaps); q('.sdt-back').textContent = T(UI.backPt);
    q('.sdt-nchap').addEventListener('click', function () { var n = chapAfter(P); finish(true); if (n) start(n.k, 0); });
    q('.sdt-all').addEventListener('click', function () { finish(true); openPicker(); });
    q('.sdt-back').addEventListener('click', function () { finish(true); goBack(); });
    /* اختيار الفصل */
    el.pick = mk('div', 'sdt-pick'); el.pick.hidden = true; el.pick.dir = EN ? 'ltr' : 'rtl';
    el.pick.setAttribute('role', 'dialog'); el.pick.setAttribute('aria-modal', 'true'); el.pick.setAttribute('aria-labelledby', 'sdtPickTtl');
    el.pick.innerHTML = '<div class="sdt-pick-box"><div class="sdt-pick-h"><h2 id="sdtPickTtl"></h2><button type="button" class="sdt-x sdt-pick-x">×</button></div><div class="sdt-pick-note"></div><div class="sdt-chs"></div><div class="sdt-pick-f"><button type="button" class="sdt-b sdt-ghost sdt-pick-back"></button></div></div>';
    document.body.appendChild(el.pick);
    el.pick.querySelector('#sdtPickTtl').textContent = T(UI.pickTitle);
    el.pick.querySelector('.sdt-pick-note').innerHTML = T(UI.pickNote);
    el.pick.querySelector('.sdt-pick-x').setAttribute('aria-label', T(UI.close));
    el.pick.querySelector('.sdt-pick-x').addEventListener('click', closePicker);
    el.pick.querySelector('.sdt-pick-back').textContent = T(UI.backPt);
    el.pick.querySelector('.sdt-pick-back').addEventListener('click', function () { closePicker(); goBack(); });
    el.pick.addEventListener('click', function (e) {
      if (e.target === el.pick) { closePicker(); return; }
      var b = e.target.closest && e.target.closest('.sdt-ch'); if (!b) return;
      closePicker(); start(b.getAttribute('data-k'), 0);
    });
    el.pick.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); closePicker(); } });
    hideAll();
  }
  function hideAll() { el.blk.concat([el.scrim, el.spot, el.card]).forEach(function (n) { n.hidden = true; }); }
  function chapOf(k) { for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].k === k) return i; return -1; }
  function chapAfter(k) { var i = chapOf(k); return i > -1 ? CHAPTERS[i + 1] || null : null; }
  function fromId() { var m = /[?&]from=([\w-]{1,64})(&|$)/.exec(location.search); return m ? m[1] : ''; }
  function goBack() { var f = fromId(); location.href = f ? 'patient-profile.html?id=' + f : 'patients.html'; }
  function openPicker() {
    build();
    if (!isDemo()) { var id = (/[?&]id=([\w-]{1,64})(&|$)/.exec(location.search) || [])[1] || ''; location.href = 'patient-profile.html?id=demo&tour=detail' + (id ? '&from=' + id : ''); return; }
    el.pick.querySelector('.sdt-chs').innerHTML = CHAPTERS.map(function (c, i) {
      var d = load(c.k).done, n = TOURS[c.k].filter(eligible).filter(function (x) { return !x.when || x.when(); }).length;
      return '<button type="button" class="sdt-ch' + (d ? ' done' : '') + '" data-k="' + c.k + '"><span class="sdt-ch-i">' + c.ico + '</span><span class="sdt-ch-t"><b>' + (i + 1) + '. ' + T(c.t) + '</b><small>' + T(c.s) + '</small></span><span class="sdt-ch-n">' + (d ? T(UI.chDone) : n + T(n > 10 ? UI.steps11 : UI.steps)) + '</span></button>';
    }).join('');   /* نصوصٌ ثابتة من هذا الملف — لا مدخلات مستخدم */
    el.pick.querySelector('.sdt-pick-f').hidden = !fromId();
    el.pick.hidden = false;
    try { el.pick.querySelector('.sdt-ch').focus(); } catch (e) {}
  }
  function closePicker() { if (el.pick) el.pick.hidden = true; }

  function eligible(s) {
    if (s.demo === true && !isDemo()) return false;
    if (s.demo === false && isDemo()) return false;
    return true;
  }
  function toast(m) { if (!el.toast) build(); el.toast.textContent = m; el.toast.classList.add('on'); clearTimeout(el.tt); el.tt = setTimeout(function () { el.toast.classList.remove('on'); }, 3000); }

  function start(p, at) {
    if (!TOURS[p]) return;
    build(); closePicker(); pendUntil = 0; if (chapOf(p) > -1) closeAll(); P = p; steps = TOURS[p].filter(eligible).filter(function (s) {
      if (s.when && !s.when()) return false;   /* شرطٌ يُعرف قبل البدء (مثلاً: لا أطباء مسجّلون ⇒ لا خطوة «الطبيب المعالج») */
      /* ما لا وجود له لهذا المستخدم الآن (قسمٌ محجوب، لا مخابر بعد…) لا يُعدّ — إلا خطوات الفصل التفاعلي التي تظهر عناصرها أثناءه */
      if (!s.sel || s.act || s.need || s.final || s.id === 'lab-tab' || s.chap === 2) return true;
      var x = s.sel(); return !!(x && x.isConnected);
    });
    idx = Math.max(0, Math.min(at || 0, steps.length - 1));
    active = true; lastFocus = document.activeElement;
    document.body.classList.add('sdt-on');
    el.blk.concat([el.scrim, el.spot, el.card]).forEach(function (n) { n.hidden = false; });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', reflow); window.addEventListener('scroll', reflow, true);
    poll = setInterval(tick, 300);
    show(1);
  }
  function stop() {
    active = false; busy = false; seq++; clearInterval(poll); poll = null;
    document.body.classList.remove('sdt-on');
    el.card.classList.remove('on'); el.spot.classList.remove('on'); el.scrim.classList.remove('on');
    setTimeout(function () { if (!active) hideAll(); }, 220);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', reflow); window.removeEventListener('scroll', reflow, true);
    if (isMobile()) drawer(false);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    syncBtn();
  }
  function later() {
    if (chapOf(P) > -1) { stop(); closeAll(); openPicker(); return; }   /* إغلاق الفصل يعيد إلى قائمة الفصول — والفصل يُعاد من أوله: خطواته التفاعلية تحتاج شاشتها */
    save(P, { snoozed: true, at: idx }); stop(); toast(T(UI.snoozed));
  }
  function finish(silent) { save(P, { done: true }); stop(); if (!silent) toast(T(chapOf(P) > -1 ? UI.chapDone : UI.finished)); }
  function onNext() {
    if (busy) return;   /* نقرٌ أثناء الانتقال (جهازٌ بطيء أو نقرٌ مزدوج) لا يُحسب مرتين */
    if (Date.now() - shownAt < 350) return;   /* خطوةٌ ظهرت للتوّ (قفزةٌ تلقائية بعد فتح نافذة): نقرةٌ قُصد بها ما قبلها لا تتخطّاها */
    var s = steps[idx];
    if (s && s.act && !s.act.done()) { if (pending()) return;   /* نقرةٌ سابقة ما زالت تفتح نافذتها: لا تُكرَّر (نافذتان بوضعين مختلفين) */
      var t = s.sel(); if (t && s.act.doIt) { try { s.act.doIt(t); } catch (e) {} } return; }
    next();
  }
  function next() { if (idx >= steps.length - 1) return finish(); idx++; save(P, { at: idx }); show(1); }
  function prev() {
    if (busy) return;
    var j = idx - 1;
    /* لا رجوعَ إلى خطوة تنفيذٍ تمّت ولا إلى شاشةٍ أُغلقت — نعود لآخر شرحٍ صالح قبلها */
    while (j > 0 && (steps[j].act || (steps[j].need && !steps[j].need()))) j--;
    if (j >= 0 && j !== idx) { idx = j; save(P, { at: idx }); show(-1); }
  }
  function jumpTo(id) { pendUntil = 0; for (var i = 0; i < steps.length; i++) if (steps[i].id === id) { idx = i; save(P, { at: idx }); show(1); return true; } return false; }
  function onKey(e) {
    if (!active) return;
    var fwd = EN ? 'ArrowRight' : 'ArrowLeft', back = EN ? 'ArrowLeft' : 'ArrowRight';
    var inCard = el.card.contains(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); later(); }
    else if (inCard && (e.key === fwd || (e.key === 'Enter' && document.activeElement === el.card))) { e.preventDefault(); onNext(); }
    else if (inCard && e.key === back) { e.preventDefault(); prev(); }
  }

  /* ── القائمة الجانبية على الموبايل ── */
  function drawer(open) {
    var sb = document.getElementById('sbSidebar'); if (!sb) return 0;
    var isOpen = sb.classList.contains('open');
    if (open && !isOpen && window._sbBtn) { window._sbBtn.click(); return 320; }
    if (!open && isOpen) { var ov = document.getElementById('sbOverlay'); if (ov) ov.click(); return 300; }
    return 0;
  }

  function show(dir) {
    var my = ++seq, s = steps[idx];
    busy = true; lostAt = 0;
    if (!s) return finish();
    if (dir >= 0 && s.ahead && s.ahead.when() && jumpTo(s.ahead.to)) return;
    if (s.need && !s.need()) {   /* الشاشة التي تحتاجها الخطوة أُغلقت (مثلاً أُغلقت نافذة الطلب) */
      if (!pending() && s.onLost && jumpTo(s.onLost.to)) return;
    }
    var wait = s.prep ? (s.prep() || 0) : 0;
    if (!s.need && !s.act && !s.prep) wait += closeOpenModals();   /* خطوةٌ لا تحتاج نافذة: لا تُترك نافذةٌ مفتوحة تحتها */
    el.card.classList.remove('on');
    setTimeout(function () {
      if (!active || my !== seq) return;
      var t = s.sel ? s.sel() : null;
      if (s.sel && s.final && !(t && shown(t))) t = null;   /* خطوةُ الختام لا تُتخطّى: المخطط يُعاد رسمه بعد الحفظ — البطاقة في الوسط حتى يظهر عنصرها */
      else if (s.sel && !(t && (shown(t) || (s.act && t.isConnected)))) {   /* عنصرٌ غير موجود لهذا المستخدم أو هذه البطاقة: تخطٍّ */
        if (dir < 0 && idx > 0) { idx--; return show(-1); }
        if (idx < steps.length - 1) { idx++; return show(1); }
        return finish();
      }
      var w2 = 0, inNav = t && t.closest('.sb-nav');
      if (inNav) {
        var g = t.closest('.sb-group');
        if (g && !g.classList.contains('open')) { var hb = g.querySelector('.sb-section'); if (hb && typeof window.sbToggleGroup === 'function') { window.sbToggleGroup(hb); w2 = 360; } }
        if (isMobile()) w2 = Math.max(w2, drawer(true));
      } else if (isMobile()) w2 = drawer(false);
      setTimeout(function () {
        if (!active || my !== seq) return;
        render(s);
        if (t && s.reveal) { try { t.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }   /* المخطط على الموبايل يُمرَّر أفقياً: السن المقصود إلى الوسط */
        if (t) bring(t, inNav);
        setTimeout(function () {
          if (!active || my !== seq) return;
          place(t, s); el.card.classList.add('on'); busy = false; shownAt = Date.now();
          try { el.card.focus({ preventScroll: true }); } catch (e) {}
        }, t ? 120 : 0);
      }, w2);
    }, wait);
  }
  function render(s) {
    var n = steps.length;
    q('.sdt-ico').textContent = s.ico || '';
    var ch = q('.sdt-chap'), ci = chapOf(P); ch.hidden = !s.chap && ci < 0;
    ch.textContent = ci > -1 ? (ci + 1) + '. ' + T(CHAPTERS[ci].t) : s.chap === 1 ? T(UI.chap1) : s.chap === 2 ? T(UI.chap2) : '';
    var ce = q('.sdt-cend'); ce.hidden = !s.chapEnd; q('.sdt-nchap').hidden = !chapAfter(P); q('.sdt-back').hidden = !fromId();
    q('.sdt-ttl').textContent = T(s.title);
    q('.sdt-body').innerHTML = T(typeof s.body === 'function' ? s.body() : s.body);
    var tip = q('.sdt-tip'); tip.hidden = !s.tip; tip.innerHTML = T(s.tip);
    var w = q('.sdt-wait'); w.hidden = !s.act; w.textContent = T(UI.wait);
    q('.sdt-bar i').style.width = ((idx + 1) / n * 100) + '%';
    q('.sdt-count').textContent = (idx + 1) + T(UI.of) + n;
    q('.sdt-prev').textContent = T(UI.prev); q('.sdt-prev').hidden = idx === 0;
    var lt = q('.sdt-later'); lt.hidden = !!s.final; lt.textContent = T(idx === 0 ? UI.laterFirst : UI.later);
    var cta = q('.sdt-cta'); cta.hidden = !(s.cta && !(isDemo() && /id=demo/.test(s.cta.href))); cta.textContent = s.cta ? T(s.cta.label) : '';
    var nx = q('.sdt-next');
    nx.textContent = s.act ? T(UI.doIt) : s.final ? T(UI.done) : idx === 0 ? T(UI.start) : T(UI.next);
    nx.classList.toggle('sdt-next', true);
  }
  function tick() {
    if (!active || busy || !el.card.classList.contains('on')) return;
    var s = steps[idx];
    if (s.act && s.act.done()) { pendUntil = 0; next(); return; }   /* تحقّق ما انتظرناه */
    if (s.ahead && s.ahead.when()) { jumpTo(s.ahead.to); return; }
    /* الشاشة غابت: مهلةٌ قصيرة قبل الرجوع — بين إغلاق نافذة السن وفتح نافذة الطلب لحظةٌ لا تكون فيها أيٌّ منهما */
    if (s.need && !s.need() && s.onLost) {
      if (pending()) { lostAt = 0; place(null, s); syncWait(s); return; }   /* نافذةٌ في الطريق: لا رجوع */
      if (!lostAt) lostAt = Date.now(); else if (Date.now() - lostAt > 1500) jumpTo(s.onLost.to);
      return;
    }
    lostAt = 0; syncWait(s);
    var t = s.sel ? s.sel() : null;
    place(t && (shown(t) || !pending()) ? t : null, s);   /* أثناء انتظار نافذة الطلب: البطاقة وحدها، لا إطارَ على عنصرٍ غاب */
  }
  function syncWait(s) { var w = q('.sdt-wait'); if (s.act && w) { var tx = T(pending() ? UI.opening : UI.wait); if (w.textContent !== tx) w.textContent = tx; } }
  function onDocClick(e) {
    var t = e.target;
    if (!t || !t.closest || t.closest('.sdt-card, .sdt-pick')) return;
    if (t.closest('#toothLabBtn')) labWaitUntil = Date.now() + 15000;
    else if (t.closest(PEND_SEL)) pendUntil = Date.now() + 8000;
  }
  function reflow() { if (active && el.card && el.card.classList.contains('on')) { var s = steps[idx]; place(s.sel ? s.sel() : null, s); } }

  function scrollParent(n) {
    for (var p = n.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
    }
    return null;
  }
  function bring(t, inNav) {
    var r = t.getBoundingClientRect(), vh = innerHeight, mob = isMobile(), sp = scrollParent(t);
    if (inNav) {
      var nv = t.closest('.sb-nav'), nr = nv.getBoundingClientRect(), lim = mob ? nr.top + nr.height * 0.45 : nr.bottom - 10;
      if (r.bottom > lim || r.top < nr.top) nv.scrollTop += r.top - nr.top - (mob ? 20 : nr.height / 3);
      return;
    }
    var top = Math.max(mob ? vh * 0.10 : 70, topInset() + 14), bottom = mob ? vh * 0.50 : vh - 40;
    if (sp) { var pr = sp.getBoundingClientRect(); top = Math.max(top, pr.top + 14); bottom = Math.min(bottom, pr.bottom - 10); }
    var wide = !mob && r.width > innerWidth - 380 - sideW();
    var ch = (el.card && el.card.offsetHeight) || 300;   /* البطاقة مرسومةٌ قبل التمرير — نعرف ارتفاعها الفعلي */
    if (wide && r.height + ch + 40 <= vh - top) { if (r.top >= top && r.bottom + ch + 28 <= vh) return; var d2 = r.top - top; if (sp) sp.scrollTop += d2; else window.scrollBy(0, d2); return; }
    if (r.top >= top && r.bottom <= bottom) return;
    var delta = r.top - (mob ? top : Math.max(top, top + (bottom - top - r.height) / 2));
    if (sp) sp.scrollTop += delta; else window.scrollBy(0, delta);
  }
  /* رؤوسٌ لاصقة أعلى الصفحة (رأس الصفحة · شريط البطاقة التجريبية · التحذير الطبي) — الهدف يُمرَّر إلى ما تحتها */
  function topInset() {
    var y = 0;
    $$('.sd-page-head, .topbar, #demoBanner, .pp-med-alert, .sb-mobile-bar').forEach(function (e) {
      if (!shown(e)) return;
      var cs = getComputedStyle(e); if (cs.position !== 'sticky' && cs.position !== 'fixed') return;
      /* اللاصق يُحسب بموضعه بعد الالتصاق (قيمة top + ارتفاعه) لا بموضعه الآن — قبل التمرير يكون تحت مكانه */
      var r = e.getBoundingClientRect(), stuck = cs.position === 'sticky' ? (parseFloat(cs.top) || 0) + r.height : r.bottom;
      if ((cs.position === 'sticky' || r.top <= 8) && stuck > y && stuck < innerHeight / 2) y = stuck;
    });
    return y;
  }
  function sideW() { var sb = document.getElementById('sbSidebar'); if (!sb || isMobile()) return 0; return sb.getBoundingClientRect().width || 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setBlk(hole) {   /* حاجزٌ من أربع قطعٍ حول الفتحة: النقر داخل الفتحة يصل للعنصر (خطوات التنفيذ) وحدها */
    var vw = innerWidth, vh = innerHeight;
    var R = hole ? [[0, 0, vw, hole.t], [0, hole.b, vw, vh - hole.b], [0, hole.t, hole.l, hole.b - hole.t], [hole.r, hole.t, vw - hole.r, hole.b - hole.t]] : [[0, 0, vw, vh], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    el.blk.forEach(function (b, i) { var x = R[i]; b.style.left = x[0] + 'px'; b.style.top = x[1] + 'px'; b.style.width = Math.max(0, x[2]) + 'px'; b.style.height = Math.max(0, x[3]) + 'px'; });
  }
  var curT = null;
  function place(t, s) {
    curT = t;
    var c = el.card, a = q('.sdt-arrow'), vw = innerWidth, vh = innerHeight, M = 12, G = 16;
    c.classList.remove('center', 'sheet', 'top');
    if (!t || !t.isConnected) {
      el.spot.classList.remove('on', 'act'); el.scrim.classList.add('on'); c.classList.add('center'); a.hidden = true; setBlk(null);
      var w = Math.min(390, vw - 24); c.style.width = w + 'px'; c.style.left = ((vw - w) / 2) + 'px'; c.style.top = Math.max(M, (vh - c.offsetHeight) / 2) + 'px';
      return;
    }
    c.style.width = '';
    var r = t.getBoundingClientRect(), Pd = 5;
    var top = Math.max(r.top - Pd, 4), bot = Math.min(r.bottom + Pd, vh - 4);
    el.scrim.classList.remove('on'); el.spot.classList.add('on'); el.spot.classList.toggle('act', !!(s && s.act));
    if (isMobile()) {
      c.classList.add('sheet'); c.classList.toggle('top', r.top > vh * 0.5); a.hidden = true;
      var cr = c.getBoundingClientRect();
      if (c.classList.contains('top')) top = Math.max(top, cr.bottom + 8); else bot = Math.min(bot, cr.top - 8);
    }
    el.spot.style.top = top + 'px'; el.spot.style.left = (r.left - Pd) + 'px'; el.spot.style.width = (r.width + Pd * 2) + 'px'; el.spot.style.height = Math.max(0, bot - top) + 'px';
    setBlk(s && s.act ? { t: top, b: bot, l: r.left - Pd, r: r.right + Pd } : null);
    if (isMobile()) return;
    a.hidden = false;
    var cw = c.offsetWidth, chh = c.offsetHeight, side, x, y;
    if (r.left - G - cw >= M) side = 'L'; else if (r.right + G + cw <= vw - M) side = 'R'; else if (r.bottom + G + chh <= vh - M) side = 'B'; else if (r.top - G - chh >= M) side = 'T'; else side = 'O';
    if (side === 'L' || side === 'R') {
      x = side === 'L' ? r.left - G - cw : r.right + G;
      y = clamp(r.top + r.height / 2 - chh / 2, M, vh - chh - M);
      a.style.top = clamp(r.top + r.height / 2 - y - 7, 14, chh - 28) + 'px';
      if (side === 'L') { a.style.right = '-8px'; a.style.left = 'auto'; } else { a.style.left = '-8px'; a.style.right = 'auto'; }
    } else if (side === 'O') {
      /* هدفٌ كبير لا يتّسع بجانبه شيء: البطاقة أسفل منطقة المحتوى (أو أعلاها) والإطار يقف عند حافتها — كالموبايل */
      a.hidden = true;
      var sw = sideW(), L0 = EN ? sw : 0, R0 = EN ? vw : vw - sw;
      x = clamp((L0 + R0 - cw) / 2, M, vw - cw - M);
      var under = r.top + 60 > vh - chh - M;
      y = under ? M : vh - chh - M;
      if (under) top = Math.max(top, y + chh + 8); else bot = Math.min(bot, y - 8);
      el.spot.style.top = top + 'px'; el.spot.style.height = Math.max(0, bot - top) + 'px';
      setBlk(s && s.act ? { t: top, b: bot, l: r.left - Pd, r: r.right + Pd } : null);
    } else {
      y = side === 'B' ? r.bottom + G : r.top - G - chh;
      x = clamp(r.left + r.width / 2 - cw / 2, M, vw - cw - M);
      a.style.left = clamp(r.left + r.width / 2 - x - 7, 14, cw - 28) + 'px'; a.style.right = 'auto'; a.style.top = '';
    }
    a.setAttribute('data-side', side); c.style.left = x + 'px'; c.style.top = y + 'px';
  }

  /* ── زرّ الرأس ── */
  var btn = null, HOME = null;
  function syncBtn() {
    if (!btn || !HOME) return;
    var s = load(HOME), n = TOURS[HOME].filter(eligible).length;
    btn.textContent = '🧭 ';
    if (s.snoozed && !s.done && s.at > 0) {
      btn.appendChild(document.createTextNode(T(UI.resume)));
      var sp = mk('span', 'sdt-n'); sp.textContent = (s.at + 1) + '/' + n; btn.appendChild(sp);
    } else btn.appendChild(document.createTextNode(T(UI.btn)));
  }
  function slot() {
    var g = $('.sd-guide-btn'); if (g && g.parentNode) return { host: g.parentNode, after: g };
    var t = $('.sd-page-head__text') || $('.page-header > div');
    if (t) return { host: t, after: null };
    var d = $('.header-title'); return d ? { host: d.parentNode, after: null } : null;
  }
  function mount() {
    var p = page();
    if (!p || !TOURS[p]) return;
    P = p; HOME = p;
    build();
    if (!document.querySelector('.sd-tour-btn')) {
      var sl = slot(); if (!sl) return;
      btn = mk('button', 'sd-guide-btn sd-tour-btn'); btn.type = 'button';
      btn.addEventListener('click', function () { if (active) return; closePicker(); var s = load(HOME); start(HOME, s.snoozed && !s.done ? s.at : 0); });
      if (sl.after && sl.after.nextSibling) sl.host.insertBefore(btn, sl.after.nextSibling); else sl.host.appendChild(btn);
      /* بطاقة المريض: «🧭 جولة مفصّلة» — على البطاقة الحقيقية يفتح البطاقة التجريبية بفصولها */
      if (p === 'patient') {
        var db = mk('button', 'sd-guide-btn sd-tour-detail'); db.type = 'button'; db.textContent = '🧭 ' + T(UI.detail);
        db.addEventListener('click', function () { if (!active) openPicker(); });
        btn.parentNode.insertBefore(db, btn.nextSibling);
      }
    }
    syncBtn();
    /* وصولٌ من «جولة مفصّلة» على بطاقةٍ حقيقية: قائمة الفصول بدل جولة الملف */
    if (p === 'patient' && isDemo() && /[?&]tour=detail(&|$)/.test(location.search)) {
      var tr = 0;
      (function w() { if (active) return; var ready = $('#jawWrap') && shown($('#jawWrap')); if (!ready && tr++ < 40) { setTimeout(w, 400); return; } openPicker(); })();
      return;
    }
    /* أول زيارة: تبدأ وحدها مرةً واحدة — بعد استقرار القائمة (فلترة الخطة والدور) وبلا نافذةٍ مفتوحة */
    var st = load(p);
    /* متصفحٌ تقوده أداة (اختبارات E2E وغيرها): لا بدءَ ذاتي يحجب النقرات — إلا إن طلبه الاختبار صراحةً (sydent.tour.autostart) */
    var automated = false;
    try { automated = !!navigator.webdriver && localStorage.getItem('sydent.tour.autostart') !== '1'; } catch (e) {}
    if (!st.done && !st.snoozed && !automated) {
      var tries = 0;
      (function wait() {
        if (active) return;
        var busy = $$('.modal-overlay.open, .modal-overlay.show').filter(shown).length > 0;
        var ready = p !== 'patient' || ($('#jawWrap') && shown($('#jawWrap')));
        if ((busy || !ready) && tries++ < 40) { setTimeout(wait, 500); return; }
        if (!busy && ready) start(p, st.at || 0);
      })();
    }
  }

  window.SyDentTour = { mount: function () { setTimeout(mount, 1200); }, start: start, stop: function () { if (active) stop(); }, tours: TOURS, page: page, target: function () { return active ? curT : null; } };
})();
