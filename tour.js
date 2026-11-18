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
    { sel: function () { return nav('index.html'); }, ico: '🏠',
      title: { ar: 'لوحة التحكم', en: 'Dashboard' },
      body: { ar: 'نظرةٌ على يوم العيادة: <b>مواعيد اليوم</b>، والإيراد، والتنبيهات التي تحتاج انتباهك.', en: 'Your clinic day at a glance: <b>today\'s appointments</b>, revenue, and the alerts that need you.' } },
    { sel: function () { return nav('patients.html'); }, ico: '👥',
      title: { ar: 'المرضى', en: 'Patients' },
      body: { ar: 'ملفّ كل مريضٍ في مكانٍ واحد: البيانات، و<b>مخطط الأسنان</b>، والجلسات، والمدفوعات، والوثائق.', en: 'Each patient\'s file in one place: details, the <b>dental chart</b>, sessions, payments and documents.' },
      tip: { ar: 'في صفحة المرضى <b>بطاقة مريضٍ تجريبية</b> تجرّب عليها كل شيء دون أن يُحفظ شيء.', en: 'The Patients page has a <b>demo patient card</b> where you can try everything — nothing is saved.' } },
    { sel: function () { return nav('appointments.html'); }, ico: '📅',
      title: { ar: 'المواعيد', en: 'Appointments' },
      body: { ar: 'جدول العيادة بعرضٍ يومي أو أسبوعي أو شهري، و<b>طلبات الحجز</b> الإلكتروني، و<b>تذكير المرضى</b> عبر واتساب.', en: 'The clinic schedule by day, week or month, online <b>booking requests</b>, and <b>patient reminders</b> on WhatsApp.' } },
    { sel: function () { return nav('treatments.html'); }, ico: '🩺',
      title: { ar: 'قائمة العلاجات', en: 'Treatment list' },
      body: { ar: 'العلاجات التي تقدّمها العيادة <b>بأسعارها وألوانها</b> على المخطط، وما يحتاج منها إلى <b>مخبر</b> ومدّته المعتادة عنده.', en: 'The treatments your clinic offers, <b>with prices and chart colours</b>, and which need a <b>lab</b> and its usual turnaround.' } },
    { sel: function () { return nav('labs.html'); }, ico: '🧪',
      title: { ar: 'المخابر', en: 'Labs' },
      body: { ar: 'كل ما يُرسَل إلى المخبر (تاج، جسر، جهاز…) <b>من الإرسال حتى التركيب</b>، مع موعد الاستلام وحساب كل مخبر.', en: 'Everything sent to the lab (crown, bridge, denture…) <b>from sending to fitting</b>, with due dates and each lab\'s account.' } },
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
      body: { ar: 'اكتب <b>اسم المريض أو رقم هاتفه</b> وافتح ملفه مباشرةً.', en: 'Type the <b>patient\'s name or phone number</b> and open their file straight away.' } },
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
      body: { ar: 'الحساسية والأمراض المهمة (مميّعات الدم، السكري، الحمل…) تظهر في <b>شريطٍ أحمر ثابت</b> أعلى الملف في كل تبويب وأثناء التمرير — فلا تفوتك قبل أي إجراء.', en: 'Allergies and important conditions (anticoagulants, diabetes, pregnancy…) show in a <b>red bar pinned</b> to the top of the file on every tab — you can\'t miss them before a procedure.' } },
    { chap: 1, ico: '💰', sel: function () { return $('.hcard .stats-row') || $('.stats-row'); },
      title: { ar: 'حساب المريض بلمحة', en: 'The account at a glance' },
      body: { ar: '<b>المُنجَز</b> (قيمة ما عُمل) · <b>المدفوع</b> · <b>المتبقّي</b> على المريض. لكل عملةٍ سطرها.', en: '<b>Done</b> (value of the work) · <b>Paid</b> · <b>Balance</b> due. Each currency has its own line.' } },
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
      body: { ar: 'ملخّص الحساب، وتسجيل <b>الدفعات والتسويات</b>، و<b>خطة الأقساط</b> — والأقساط المستحقة تظهر أيضاً في متابعة المرضى.', en: 'The account summary, <b>payments and adjustments</b>, and <b>instalment plans</b> — instalments due also appear in patient follow-up.' } },

    /* ② على بطاقةٍ حقيقية: شرحٌ فقط — الجولة لا تنشئ شيئاً على مريضٍ حقيقي */
    { chap: 2, demo: false, ico: '🧪', prep: function () { return goTab('file'); }, sel: function () { return tabBtn('labs'); },
      title: { ar: 'إرسال عملٍ إلى المخبر', en: 'Sending work to the lab' },
      body: { ar: 'ابدأ <b>من السن نفسه</b>: اختر علاجاً مخبرياً (تاج، جسر، جهاز…) ثم <b>«حفظ + إرسال لمخبر»</b> — فيرتبط الطلب بالسن والجلسة، واربطه بموعد التركيب، ثم تابعه من تبويب <b>المخابر</b> حتى «تم التركيب».', en: 'Start <b>from the tooth itself</b>: pick a lab treatment (crown, bridge, denture…) then <b>«Save + send to lab»</b> — the order is tied to the tooth and the session; link it to the fitting appointment, then follow it from the <b>Labs</b> tab to «Fitted».' },
      tip: { ar: 'لتجربة الخطوات عملياً دون حفظ أي شيء: افتح <b>البطاقة التجريبية</b> من صفحة المرضى.', en: 'To try the steps hands-on without saving anything, open the <b>demo card</b> from the Patients page.' } },

    /* ② بالبطاقة التجريبية: تفاعلي */
    { chap: 2, demo: true, id: 'lab-start', ico: '👆', prep: function () { return closeOpenModals() + goTab('file'); },
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
    { chap: 2, demo: true, ico: '🔗', need: function () { return modalOpen('toothModal'); }, onLost: { to: 'lab-start' },
      sel: function () { return $('#toothModal .tx-tab[data-txtab="prosthodontics"]'); },
      act: { done: function () { var t = $('#toothModal .tx-tab[data-txtab="prosthodontics"]'); return !!(t && t.classList.contains('tx-tab-active')) || !!crownOpt(); }, doIt: function (t) { t.click(); } },
      title: { ar: 'فئة العلاج', en: 'Treatment category' },
      body: { ar: 'افتح فئة <b>«تعويضات ثابتة»</b>.', en: 'Open the <b>«Fixed prosthodontics»</b> category.' } },
    { chap: 2, demo: true, ico: '🥽', need: function () { return modalOpen('toothModal'); }, onLost: { to: 'lab-start' },
      sel: function () { return crownOpt(); },
      act: { done: labBtnShown, doIt: function (t) { t.click(); } },
      title: { ar: 'اختر التاج', en: 'Pick the crown' },
      body: { ar: 'اختر <b>التاج</b>. لأنه مفعّلٌ عليه <b>«يحتاج مخبراً»</b> في قائمة العلاجات، يظهر زرّ الإرسال إلى المخبر.', en: 'Pick the <b>crown</b>. Because it is marked <b>«Needs a lab»</b> in the treatment list, the send-to-lab button appears.' },
      tip: { ar: 'فعّل «يحتاج مخبراً» مرةً واحدة لكل علاجٍ مخبري (تيجان، جسور، أجهزة…) من صفحة قائمة العلاجات.', en: 'Mark «Needs a lab» once for each lab treatment (crowns, bridges, dentures…) on the treatment list page.' } },
    { chap: 2, demo: true, ico: '📌', need: labBtnShown, onLost: { to: 'lab-start' }, sel: function () { return $('#toothStatusPicker'); },
      title: { ar: 'منجز أم مخطّط؟', en: 'Done or planned?' },
      body: { ar: 'الحالة تحدّد كيف يُفتح طلب المخبر: <b>منجز</b> (أخذتَ الطبعة اليوم) ⇐ يُفتح <b>بتاريخ إرسال اليوم</b>. <b>مخطّط</b> (لم تُؤخذ الطبعة بعد) ⇐ يُفتح <b>مسودّة</b> بلا تاريخ إرسال، وترسله حين تأخذ الطبعة.', en: 'The status decides how the lab order opens: <b>Done</b> (impression taken today) ⇒ it opens <b>with today as the send date</b>. <b>Planned</b> (no impression yet) ⇒ it opens as a <b>draft</b> with no send date, and you send it when you take the impression.' } },
    { chap: 2, demo: true, ico: '🥽', need: labBtnShown, onLost: { to: 'lab-start' }, sel: function () { return $('#toothLabBtn'); },
      act: { done: labModal, doIt: function (t) { t.click(); } },
      title: { ar: '«حفظ + إرسال لمخبر»', en: '«Save + send to lab»' },
      body: { ar: 'يظهر هذا الزر <b>للعلاجات المخبرية وحدها</b>: يحفظ الجلسة ويفتح طلب المخبر <b>مباشرةً</b> دون مغادرة الملف. <b>اضغطه.</b>', en: 'This button appears <b>only for lab treatments</b>: it saves the session and opens the lab order <b>straight away</b>, without leaving the file. <b>Tap it.</b>' },
      tip: { ar: '<b>للجسر:</b> اضغط على <b>السن المقلوع</b> (مكان الفراغ) واختر «جسر» — تُحدَّد الدعامات تلقائياً ويمكنك إضافة دعامة — ثم الزر نفسه يفتح طلباً واحداً للجسر كله.', en: '<b>For a bridge:</b> tap the <b>missing tooth</b> (the gap) and pick «Bridge» — the abutments are set automatically and you can add one — then the same button opens one order for the whole bridge.' } },
    { chap: 2, demo: true, ico: '✅', need: labModal, onLost: LOST_LAB, sel: function () { var a = rowOf('labOrderTooth'); return a ? (a.parentElement && a.parentElement.contains($('#labOrderWorkType')) ? a.parentElement : a) : null; },
      title: { ar: 'معبّأ تلقائياً', en: 'Filled in for you' },
      body: { ar: '<b>رقم السن ونوع العمل</b> جاءا من الجلسة التي حفظتها — لا حاجة لإعادة كتابتهما.', en: 'The <b>tooth number and work type</b> come from the session you just saved — no need to type them again.' },
      tip: { ar: 'للأعمال المتكررة: احفظ الطلب <b>🧩 قالباً</b> واختره بنقرة في المرة القادمة.', en: 'For repeated work: save the order as a <b>🧩 template</b> and pick it with one tap next time.' } },
    { chap: 2, demo: true, ico: '📅', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderAppointment'); },
      title: { ar: 'اربطه بموعد التركيب', en: 'Link it to the fitting appointment' },
      body: { ar: 'اختر: <b>🔄 الموعد القادم تلقائياً</b>، أو موعداً محدّداً من مواعيد المريض، أو <b>📅 تحديد موعد التركيب الآن</b> فيُنشأ الموعد تلقائياً. بالربط يعرف النظام أن هذا الموعد <b>يحتاج عودة العمل من المخبر قبله</b>.', en: 'Choose <b>🔄 Next appointment automatically</b>, a specific appointment of the patient, or <b>📅 Set the fitting appointment now</b> to create it. Linked, the system knows this appointment <b>needs the work back from the lab first</b>.' },
      tip: { ar: 'الافتراضي «غير مربوط بموعد» — اربطه ليعمل تنبيه التأخير وحساب الاستحقاق.', en: 'The default is «Not linked» — link it so the late alert and the due date work.' } },
    { chap: 2, demo: true, ico: '🎨', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderLabSelect'); },
      title: { ar: 'المخبر', en: 'The lab' },
      body: { ar: 'اختر المخبر، أو <b>＋</b> لإضافة مخبرٍ جديد في ثوانٍ. وفي البطاقة التجريبية <b>«مخبر تجريبي»</b> جاهزٌ للتجربة.', en: 'Choose the lab, or <b>＋</b> to add a new one in seconds. The demo card has a ready <b>«Demo lab»</b> to try.' } },
    { chap: 2, demo: true, ico: '🎨', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderShade'); },
      title: { ar: 'اللون', en: 'Shade' },
      body: { ar: 'اكتب اللون أو اضغط <b>🎨</b> لاختيار الرمز من دليل <b>VITA classical</b> أو <b>3D-MASTER</b> أو <b>Chromascop</b> فيُكتب وحده.', en: 'Type the shade or tap <b>🎨</b> to pick it from the <b>VITA classical</b>, <b>3D-MASTER</b> or <b>Chromascop</b> guide.' },
      tip: { ar: 'ألوان العيّنات على الشاشة تقريبية — المرجع هو الدليل الحقيقي في ضوء النهار.', en: 'On-screen swatches are approximate — the real guide in daylight is the reference.' } },
    { chap: 2, demo: true, ico: '💵', need: labModal, onLost: LOST_LAB, sel: function () { return rowOf('labOrderDateSent'); },
      title: { ar: 'تاريخ الإرسال والكلفة', en: 'Send date and cost' },
      body: { ar: '<b>تاريخ الإرسال الفارغ = مسودّة</b>: تُحفظ ولا تُحتسب حتى يخرج العمل فعلاً. والكلفة تُحتسب على العيادة لصالح المخبر <b>في شهر الإرسال</b>.', en: '<b>An empty send date = a draft</b>: saved but not counted until the work actually leaves. The cost is counted against the clinic, owed to the lab, <b>in the month it is sent</b>.' } },
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
      body: { ar: 'كل طلبات المريض هنا، ولكلّ طلبٍ <b>مراحله</b> وتواريخه ولونه ومرفقاته.', en: 'All the patient\'s orders are here, each with its <b>steps</b>, dates, shade and attachments.' } },
    { chap: 2, demo: true, ico: '👆', prep: function () { return goTab('labs'); }, sel: function () { return firstShown($$('#labOrdersContent .sy-act-primary, #labOrdersContent .sy-acts')); },
      title: { ar: 'تقدّمٌ بنقرة', en: 'One tap per step' },
      body: { ar: 'الزرّ الأساسي هو <b>الخطوة التالية</b> دائماً: <b>📤 إرسال للمخبر ← 📦 تم الاستلام من المخبر ← ✓ تم الفحص ← 🤝 تم التركيب</b>، وكل نقرةٍ تختم تاريخها. و<b>✏️ تعديل</b> لتصحيح خطوةٍ بالخطأ أو إلغاء الطلب.', en: 'The main button is always <b>the next step</b>: <b>📤 Send to lab → 📦 Received from lab → ✓ Checked → 🤝 Fitted</b>, each tap stamping its date. <b>✏️ Edit</b> corrects a wrong step or cancels the order.' },
      tip: { ar: '<b>🔄 إعادة</b> يظهر بعد وصول العمل (تم الاستلام أو تم الفحص): تختار السبب إلزاماً، وتُسجَّل كل دورة إعادة وتدخل في أداء المخبر.', en: '<b>🔄 Redo</b> appears once the work is back (received or checked): a reason is required, and each redo cycle is recorded and counts in the lab\'s performance.' } },
    { chap: 2, demo: true, center: true, ico: '🔗', prep: function () { return goTab('labs'); },
      title: { ar: 'الربط مع الموعد', en: 'The link with the appointment' },
      body: { ar: 'في نافذة موعد التركيب يظهر الطلب وحالته، وإن بقي العمل عند المخبر يوم الموعد يظهر <b>«متأخر»</b> بالأحمر — فتعرف قبل أن يصل المريض. وعند إنهاء الموعد يسألك النظام: <b>«تم التركيب؟»</b> فيُغلق الطلب.', en: 'The fitting appointment shows the order and its status; if the work is still at the lab on the day it shows <b>«Late»</b> in red — so you know before the patient arrives. When you finish the appointment you are asked <b>«Fitted?»</b> and the order is closed.' } },
    { center: true, final: true, ico: '🎉', cta: CTA_DEMO, prep: function () { return closeOpenModals() + goTab('file'); },
      title: { ar: 'هذا هو ملف المريض', en: 'That\'s the patient file' },
      body: { ar: 'باختصار للمخبر: <b>السن ← علاجٌ مخبري ← «حفظ + إرسال لمخبر» ← اربط موعد التركيب ← حفظ</b>، ثم الزرّ الأساسي خطوةً بخطوة حتى «تم التركيب».', en: 'In short, for the lab: <b>tooth → lab treatment → «Save + send to lab» → link the fitting appointment → Save</b>, then the main button step by step until «Fitted».' },
      tip: { ar: 'أعد الجولة متى شئت من زر <b>🧭 جولة تعريفية</b>، والشرح المكتوب في «📖 دليل هذا القسم».', en: 'Replay it any time from <b>🧭 Guided tour</b>; the written guide is in «📖 Guide to this section».' } }
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
      body: { ar: 'تظهر عند الحاجة: <b>⚠️ متأخر</b> (تجاوز الاستحقاق ولم يصل) · <b>⏰ قارب الموعد</b> (موعد التركيب قريب والعمل ما زال خارجاً) · <b>📅 بلا موعد تركيب</b> · <b>📝 مسودّات</b> — ثم الحالات. والبحث باسم المريض أو المخبر أعلى الصفحة.', en: 'Shown when needed: <b>⚠️ Late</b> (past due and not back) · <b>⏰ Near the appointment</b> (fitting soon, work still out) · <b>📅 No fitting appointment</b> · <b>📝 Drafts</b> — then the statuses. Search by patient or lab name at the top.' } },
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

  var TOURS = { dashboard: DASH, patient: PATIENT, labs: LABS };

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
      'body.sdt-on .sb-nav{padding-bottom:60vh}' +
      'body.sdt-on #sbMainContent,body.sdt-on .modal-overlay.open .modal{padding-bottom:58vh}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.sdt-spot,.sdt-card,.sdt-bar i{transition:none!important}.sdt-spot.act::after,.sdt-wait::before{animation:none}}' +
    '@media print{.sd-tour-btn,.sdt-card,.sdt-spot,.sdt-scrim,.sdt-blk{display:none!important}}';

  var UI = {
    next: { ar: 'التالي', en: 'Next' }, prev: { ar: 'السابق', en: 'Back' }, later: { ar: 'تأجيل', en: 'Later' }, laterFirst: { ar: 'لاحقاً', en: 'Not now' },
    start: { ar: 'ابدأ الجولة', en: 'Start the tour' }, done: { ar: 'تمّ', en: 'Done' }, doIt: { ar: 'نفّذ عنّي', en: 'Do it for me' },
    wait: { ar: 'بانتظار ضغطك…', en: 'Waiting for your tap…' }, of: { ar: ' من ', en: ' of ' }, close: { ar: 'إغلاق الجولة', en: 'Close the tour' },
    btn: { ar: 'جولة تعريفية', en: 'Guided tour' }, resume: { ar: 'تابع الجولة', en: 'Continue the tour' },
    snoozed: { ar: 'تأجّلت الجولة — أكملها من زر 🧭 في رأس الصفحة', en: 'Tour paused — continue it from the 🧭 button in the page header' },
    finished: { ar: 'انتهت الجولة ✓', en: 'Tour complete ✓' },
    chap1: { ar: '① أقسام الملف', en: '① Sections of the file' }, chap2: { ar: '② الإرسال إلى المخبر', en: '② Sending to the lab' },
    keys: { ar: '<kbd>←</kbd> التالي · <kbd>→</kbd> السابق · <kbd>Esc</kbd> تأجيل', en: '<kbd>→</kbd> Next · <kbd>←</kbd> Back · <kbd>Esc</kbd> Later' }
  };

  var el = {}, P = null, steps = [], idx = 0, active = false, seq = 0, poll = null, lastFocus = null, busy = false, lostAt = 0;

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
      '<button type="button" class="sdt-b sdt-cta" hidden></button><button type="button" class="sdt-b sdt-next"></button></div><div class="sdt-keys"></div>';
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
    hideAll();
  }
  function hideAll() { el.blk.concat([el.scrim, el.spot, el.card]).forEach(function (n) { n.hidden = true; }); }

  function eligible(s) {
    if (s.demo === true && !isDemo()) return false;
    if (s.demo === false && isDemo()) return false;
    return true;
  }
  function toast(m) { if (!el.toast) build(); el.toast.textContent = m; el.toast.classList.add('on'); clearTimeout(el.tt); el.tt = setTimeout(function () { el.toast.classList.remove('on'); }, 3000); }

  function start(p, at) {
    if (!TOURS[p]) return;
    build(); P = p; steps = TOURS[p].filter(eligible).filter(function (s) {
      /* ما لا وجود له لهذا المستخدم الآن (قسمٌ محجوب، لا مخابر بعد…) لا يُعدّ — إلا خطوات الفصل التفاعلي التي تظهر عناصرها أثناءه */
      if (!s.sel || s.act || s.need || s.id === 'lab-tab' || s.chap === 2) return true;
      var x = s.sel(); return !!(x && x.isConnected);
    });
    idx = Math.max(0, Math.min(at || 0, steps.length - 1));
    active = true; lastFocus = document.activeElement;
    document.body.classList.add('sdt-on');
    el.blk.concat([el.scrim, el.spot, el.card]).forEach(function (n) { n.hidden = false; });
    document.addEventListener('keydown', onKey, true);
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
    window.removeEventListener('resize', reflow); window.removeEventListener('scroll', reflow, true);
    if (isMobile()) drawer(false);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    syncBtn();
  }
  function later() { save(P, { snoozed: true, at: idx }); stop(); toast(T(UI.snoozed)); }
  function finish(silent) { save(P, { done: true }); stop(); if (!silent) toast(T(UI.finished)); }
  function onNext() {
    if (busy) return;   /* نقرٌ أثناء الانتقال (جهازٌ بطيء أو نقرٌ مزدوج) لا يُحسب مرتين */
    var s = steps[idx];
    if (s && s.act && !s.act.done()) { var t = s.sel(); if (t && s.act.doIt) { try { s.act.doIt(t); } catch (e) {} } return; }
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
  function jumpTo(id) { for (var i = 0; i < steps.length; i++) if (steps[i].id === id) { idx = i; save(P, { at: idx }); show(1); return true; } return false; }
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
    if (s.need && !s.need()) {   /* الشاشة التي تحتاجها الخطوة أُغلقت (مثلاً أُغلقت نافذة الطلب) */
      if (s.onLost && jumpTo(s.onLost.to)) return;
    }
    var wait = s.prep ? (s.prep() || 0) : 0;
    if (!s.need && !s.act && !s.prep) wait += closeOpenModals();   /* خطوةٌ لا تحتاج نافذة: لا تُترك نافذةٌ مفتوحة تحتها */
    el.card.classList.remove('on');
    setTimeout(function () {
      if (!active || my !== seq) return;
      var t = s.sel ? s.sel() : null;
      if (s.sel && !(t && (shown(t) || (s.act && t.isConnected)))) {   /* عنصرٌ غير موجود لهذا المستخدم أو هذه البطاقة: تخطٍّ */
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
        if (t) bring(t, inNav);
        setTimeout(function () {
          if (!active || my !== seq) return;
          place(t, s); el.card.classList.add('on'); busy = false;
          try { el.card.focus({ preventScroll: true }); } catch (e) {}
        }, t ? 120 : 0);
      }, w2);
    }, wait);
  }
  function render(s) {
    var n = steps.length;
    q('.sdt-ico').textContent = s.ico || '';
    var ch = q('.sdt-chap'); ch.hidden = !s.chap; ch.textContent = s.chap === 1 ? T(UI.chap1) : s.chap === 2 ? T(UI.chap2) : '';
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
    if (s.act && s.act.done()) { next(); return; }
    /* الشاشة غابت: مهلةٌ قصيرة قبل الرجوع — بين إغلاق نافذة السن وفتح نافذة الطلب لحظةٌ لا تكون فيها أيٌّ منهما */
    if (s.need && !s.need() && s.onLost) { if (!lostAt) lostAt = Date.now(); else if (Date.now() - lostAt > 1500) jumpTo(s.onLost.to); return; }
    lostAt = 0;
    place(s.sel ? s.sel() : null, s);
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
    if (wide && r.height < vh - 420) { if (r.top >= top && r.bottom <= vh - 340) return; var d2 = r.top - top; if (sp) sp.scrollTop += d2; else window.scrollBy(0, d2); return; }
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
  var btn = null;
  function syncBtn() {
    if (!btn || !P) return;
    var s = load(P), n = TOURS[P].filter(eligible).length;
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
    P = p;
    build();
    if (!document.querySelector('.sd-tour-btn')) {
      var sl = slot(); if (!sl) return;
      btn = mk('button', 'sd-guide-btn sd-tour-btn'); btn.type = 'button';
      btn.addEventListener('click', function () { if (active) return; var s = load(P); start(P, s.snoozed && !s.done ? s.at : 0); });
      if (sl.after && sl.after.nextSibling) sl.host.insertBefore(btn, sl.after.nextSibling); else sl.host.appendChild(btn);
    }
    syncBtn();
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
