/* v469 — شاهدُ أزرار الصفوف: لكل صفحةٍ مُرحَّلة تُركَّب صفوفُها الحقيقية (بحاوياتها
   كما تكتبها الصفحة) فوق ستايل الصفحة نفسه + theme.css، ثم يقيس run.py كلَّ زرٍّ
   بالمتصفح مقابل المرجع (أزرار طلبات الحجز) بالثيمين والمقاسين.
   #641: كلُّ شاهدٍ مربوطٌ بالمصدر — لو غيّرت الصفحةُ حاويتَها أو فئاتِ صفّها
   يسقط البناء بدل أن يمرّ شاهدٌ لا يطابق الصفحة. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const out = path.join(ROOT, '_ra');
fs.mkdirSync(out, { recursive: true });

/* الصفحة ← ملفاتُ المصدر التي يجب أن تحوي كلَّ مرساة · الصفوف (كما تُرسم) */
const PAGES = {
  'appointments.html': {
    /* v470: شريطُ العرض يُقتطع من الصفحة نفسها (لا نسخة) والشارتان ظاهرتان — بلاغُ المالك:
       «طلبات الحجز» وشارتُه كانا يُقصّان بالهاتف. */
    top: ['  <div class="topbar">', '  <!-- Content -->'],
    src: ['appointments.html', 'appt-booking.js', 'appt-views.js'],
    anchors: [
      '<div class="list-item booking-item show-acts"',
      '<div class="list-actions sy-acts" data-sub-write onclick="event.stopPropagation()">',
      '<div class="list-item show-acts"',
      '<div class="list-actions sy-acts sy-slots" style="--sy-slots:__SY_SLOTS__" onclick="event.stopPropagation()">',   // v482: خاناتُ الاتصالات
      '<div class="planned-item">', '<div class="planned-actions sy-acts">',
      '<div class="list-item" style="--bc:',
    ],
    rows: `
<div class="list-group" data-row="booking"><div class="list-item booking-item show-acts" style="border-right:3px solid var(--green);">
  <div class="list-time">08:30 AM</div><div class="list-avatar">هـ</div>
  <div class="list-info"><div class="list-name">هند</div><div class="list-type">📅 الثلاثاء 28 تموز · 📞 0933223176</div></div>
  <div class="list-actions sy-acts" data-sub-write><button class="sy-act sy-act-primary" title="تأكيد كموعد">✅ تأكيد</button><button class="sy-act" title="تعديل الوقت ثم التأكيد">✏️ تعديل</button><button class="sy-act sy-act-danger" title="رفض الطلب">✖ رفض</button><a class="sy-act sy-act-ico" title="مراسلة واتساب" aria-label="مراسلة واتساب" href="#">📱</a></div>
</div></div>
<div class="list-group" data-slot-group data-row="list" data-mobile-hidden="1" data-slot-row><div class="list-item" style="--bc:#0d8577;" role="button" tabindex="0">
  <div class="list-time">09:00 AM</div><div class="list-avatar">ع</div>
  <div class="list-info"><div class="list-name">عبدو شحرور</div><div class="list-type">فحص — 30 دقيقة</div></div>
  <span class="list-badge status-confirmed">مؤكّد</span>
  <div class="list-actions sy-acts sy-slots" style="--sy-slots:[s1] 84px [s2] 82px [s3] 80px" data-sub-write><button class="time-track-btn cbadge tone tone-blue" data-slot="1">🚶 وصل</button><button class="sy-act" data-slot="2">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="3">🗑️ حذف</button></div>
</div></div>
<div class="list-group" data-row="list-nostage" data-mobile-hidden="1" data-slot-row><div class="list-item" style="--bc:#2563eb;" role="button" tabindex="0">
  <div class="list-time">10:30 AM</div><div class="list-avatar">م</div>
  <div class="list-info"><div class="list-name">محمد منير</div><div class="list-type">حشوة — 30 دقيقة</div></div>
  <span class="list-badge status-completed">مكتمل</span>
  <div class="list-actions sy-acts sy-slots" style="--sy-slots:[s1] 84px [s2] 82px [s3] 80px" data-sub-write><button class="sy-act" data-slot="2">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="3">🗑️ حذف</button></div>
</div></div>
<div class="list-group" data-row="calls" data-slot-row><div class="list-item show-acts" style="border-right:3px solid #0d8577;">
  <div class="list-time">11:00 AM</div><div class="list-avatar">ي</div>
  <div class="list-info"><div class="list-name">يحيى التر</div><div class="list-type">📞 0934012433 — قلع</div></div>
  <div class="list-actions sy-acts sy-slots" style="--sy-slots:[s1] 92px [s2] 76px [s3] 102px"><button class="sy-act" data-slot="1" title="تذكير واتساب">📱 واتساب</button><button class="sy-act" data-slot="2" title="نسخ رسالة التذكير">📋 نسخ</button><button class="sy-act sy-act-primary" data-slot="3" title="تم التأكيد">✅ تم التأكيد</button></div>
</div></div>
<div class="list-group" data-row="calls-nophone" data-slot-row><div class="list-item show-acts" style="border-right:3px solid #0d8577;">
  <div class="list-time">12:00 PM</div><div class="list-avatar">ل</div>
  <div class="list-info"><div class="list-name">ليلى</div><div class="list-type">لا رقم هاتف — فحص</div></div>
  <div class="list-actions sy-acts sy-slots" style="--sy-slots:[s1] 92px [s2] 76px [s3] 102px"><button class="sy-act" data-slot="1" title="لا رقم هاتف مسجّل" disabled>📱 واتساب</button><button class="sy-act" data-slot="2" title="نسخ رسالة التذكير">📋 نسخ</button></div>
</div></div>
<div data-row="planned"><div class="planned-item">
  <div class="planned-icon">📋</div>
  <div class="planned-info"><div class="planned-name">صدام ابراهيم الجاهل</div><div class="planned-reason">🦷 تاج زركون — بانتظار المخبر</div></div>
  <div class="planned-actions sy-acts"><button class="sy-act sy-act-primary">📅 جدولة الآن</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div>
</div></div>`,
  },
  'patients.html': {
    src: ['patients.html'],
    anchors: [
      '<td data-sub-write>\n          <div class="action-btns sy-acts" onclick="event.stopPropagation()">',
      'data-test="patient-row" data-patient-id=',
      'data-test="patient-menu" data-sub-write>⋮</button>', '<div class="dots-menu" data-sub-write>',
      '<div style="border:1px solid var(--border,#1e3556);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">', '<div class="prm-acts sy-acts\' + (slots ? \' sy-slots" style="--sy-slots:\' + slots : \'\') + \'">',
      '<div class="modal-overlay sy-m sy-m-lg" id="prmModal"',
    ],
    rows: `
<div class="table-wrap"><table><thead><tr><th>المريض</th><th>رقم الهاتف</th><th>حالة الدفع</th><th>آخر زيارة</th><th>الحالة</th><th data-sub-write>إجراءات</th></tr></thead>
<tbody><tr class="row-active" data-row="table" data-patient-id="demo" tabindex="0" style="cursor:pointer;">
  <td><div class="patient-cell"><div class="seq-badge">1</div><div><div class="patient-name">يحيى التر</div><div class="patient-id">P001</div></div></div></td>
  <td class="text-muted">0934012433</td><td><span class="badge yellow">متبقي 374,000</span></td><td class="text-muted">4 تموز 2026</td>
  <td><span class="badge blue">تحت العلاج</span></td>
  <td data-sub-write><div class="action-btns sy-acts"><button class="sy-act">📅 موعد جديد</button><button class="sy-act sy-act-primary">💰 تسجيل دفعة</button><button class="sy-act sy-act-ico sy-act-more" title="المزيد" aria-label="المزيد">⋮</button><div class="dots-menu"><button>🗑️ حذف المريض</button></div></div></td>
</tr></tbody></table></div>
<div class="modal-overlay sy-m sy-m-lg open" style="position:static;display:block;background:none;padding:0;"><div class="modal" style="margin:16px 0;"><div class="modal-body">
<div data-row="prm-recall" data-slot-row><div style="border:1px solid var(--border,#1e3556);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:150px;"><div style="font-weight:700;">ياسر بوبس</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">0934012433 · آخر زيارة قبل 7 أشهر</div></div><div class="prm-acts sy-acts sy-slots" style="--sy-slots:[s1] 90px [s2] 80px [s3] 66px"><button class="sy-act" data-slot="1">📱 واتساب</button><button class="sy-act" data-slot="2" title="تحرير الرسالة">✏️ تحرير</button><button class="sy-act sy-act-primary" data-slot="3" title="إخفاؤه من القائمة">✅ تم</button></div></div></div>
<div data-row="prm-recall-nophone" data-slot-row><div style="border:1px solid var(--border,#1e3556);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:150px;"><div style="font-weight:700;">ليلى فادي</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">بلا رقم · آخر زيارة قبل 8 أشهر</div></div><div class="prm-acts sy-acts sy-slots" style="--sy-slots:[s1] 90px [s2] 80px [s3] 66px"><button class="sy-act" data-slot="2">📋 نسخ</button><button class="sy-act sy-act-primary" data-slot="3" title="إخفاؤه من القائمة">✅ تم</button></div></div></div>
<div data-row="prm-inst"><div style="border:1px solid var(--border,#1e3556);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:150px;"><div style="font-weight:700;">أحمد محمود</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">بلا رقم · 💰 قسط 50,000 ل.س — متأخر 3 يوم</div></div><div class="prm-acts sy-acts"><button class="sy-act">📋 نسخ</button><button class="sy-act">📂 فتح البطاقة</button></div></div></div>
<div data-row="prm-bday"><div style="border:1px solid var(--border,#1e3556);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:150px;"><div style="font-weight:700;">ليلى</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">0991234567 · عيد الميلاد: غداً</div></div><div class="prm-acts sy-acts"><button class="sy-act">📱 واتساب</button><button class="sy-act">📋 نسخ</button></div></div></div>
</div></div></div>`,
  },
  'patient-profile.html': {
    src: ['patient-profile.html', 'pp-clinical.js', 'pp-plan.js', 'pp-modules.js', 'pp-appt.js', 'pp-extras.js'],
    anchors: [
      'id="sessionsContent"', 'id="paymentsContent"', 'id="adjustmentsContent"', 'id="labOrdersContent"', 'id="rxList"', 'id="postopList"',
      '<table class="data-table sess-table">', "'<td class=\"sc-actions sess-actions\"><div class=\"sy-acts sy-slots\" style=\"--sy-slots:__SY_SLOTS__\">'",
      '<table class="data-table m-cards"><thead>', '<td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts">',
      '<td class="mc-actions" style="text-align:left;white-space:nowrap;"><div class="sy-acts">',
      '<td class="mc-actions" style="text-align:left;white-space:nowrap;vertical-align:top;"><div class="sy-acts">', "SyDT.cellRec(lo.date_sent, lo.created_at)",
      "rows = SySlots.finalize(rows, { 1: '84px', 2: '78px', 3: '80px' });", "rows = SySlots.finalize(rows, { 1: '160px', 2: '78px', 3: '82px', 4: '80px' });",   // v484: الخاناتُ تُطوى — الشاهدُ بقالبه الكامل
      '<table class="data-table m-cards">', '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">', '<div class="sy-acts" style="margin-top:10px;">',
      /* v473: الدفعة الثانية */
      "'<div class=\"appt-actions sy-acts\">'", "'<div class=\"appts-next-actions sy-acts\">'", "'<div class=\"planned-pp-actions sy-acts\">'",
      "'<span class=\"sy-acts\">'", '<div class="sy-acts" style="flex-wrap:wrap;margin-top:4px;">',
      'id="pfFilesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;"',
      'class="appt-btn appt-btn-stage tone tone-', '<div class="appt-row appt-b-', '<div class="planned-pp-row">', '<div class="pv-card ',
    ],
    rows: `
<div class="card" style="margin-bottom:14px;"><div id="sessionsContent"><table class="data-table sess-table"><thead><tr><th>التاريخ</th><th>العلاج</th><th>السن</th><th>الحالة</th><th>الدفع</th><th>التفاصيل</th><th>التكلفة</th><th></th></tr></thead><tbody>
<tr data-test="pp-session-row" data-row="sessions" data-slot-row><td class="sc-date"><span class="dt-cell"><span class="ltr-val">31/7/2026</span><span class="dt-time ltr-val">10:21 PM</span></span></td><td class="sc-type"><span class="sess-type" style="background:#0d857722;color:#0d8577;">تلبيس (تاج)</span></td><td class="sc-chip"><span class="sess-chip">سن 36</span></td><td class="sc-chip"><span class="sess-chip tone tone-blue">مخطّط</span></td><td class="sc-chip"><span class="sess-chip tone tone-red">غير مدفوع</span></td><td class="sc-details"><div class="sess-desc">زركون — قياس بعد أسبوع</div></td><td class="sc-cost sess-cost" style="color:var(--red);">450,000 ل.س</td>
<td class="sc-actions sess-actions"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 84px [s2] 78px [s3] 80px"><button class="sy-act sy-act-primary" data-slot="1" title="إكمال هذا العلاج">✅ إكمال</button><button class="sy-act" data-slot="2" title="إنشاء طلب مخبر">🥽 مخبر</button><button class="sy-act sy-act-danger" data-slot="3">🗑️ حذف</button></div></td></tr>
<tr data-test="pp-session-row" data-row="sessions-nolab" data-slot-row><td class="sc-date">19/9/2026</td><td class="sc-type"><span class="sess-type" style="background:#0d857722;color:#0d8577;">حشوة</span></td><td class="sc-chip"><span class="sess-chip">سن 16</span></td><td class="sc-chip"><span class="sess-chip tone tone-blue">مخطّط</span></td><td class="sc-chip sc-empty">—</td><td class="sc-details sc-empty">—</td><td class="sc-cost sess-cost" style="color:var(--red);">30,000 ل.س</td>
<td class="sc-actions sess-actions"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 84px [s2] 78px [s3] 80px"><button class="sy-act sy-act-primary" data-slot="1" data-span="2">✅ إكمال</button><button class="sy-act sy-act-danger" data-slot="3">🗑️ حذف</button></div></td></tr>
<tr data-test="pp-session-row" data-row="sessions-done" data-slot-row><td class="sc-date">9/8/2026</td><td class="sc-type"><span class="sess-type" style="background:#0d857722;color:#0d8577;">حشوة</span></td><td class="sc-chip"><span class="sess-chip">سن 16</span></td><td class="sc-chip"><span class="sess-chip tone tone-blue">مخطّط</span></td><td class="sc-chip sc-empty">—</td><td class="sc-details sc-empty">—</td><td class="sc-cost sess-cost" style="color:var(--red);">30,000 ل.س</td>
<td class="sc-actions sess-actions"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 84px [s2] 78px [s3] 80px"><button class="sy-act sy-act-danger" data-slot="3">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div>
<div class="card" style="margin-bottom:14px;"><div id="paymentsContent"><table class="data-table m-cards"><thead><tr><th>التاريخ</th><th>طريقة الدفع</th><th>ملاحظات</th><th style="text-align:left;">المبلغ</th><th></th></tr></thead><tbody>
<tr data-test="pp-payment-row" data-row="payments"><td class="mc-hide">4 تموز 2026</td><td class="mc-title"><span class="tag tag-green">نقداً</span><div class="mc-only mc-meta">4 تموز 2026 · دفعة أولى</div></td><td class="mc-hide" style="color:var(--text2)">دفعة أولى</td><td class="amount-green mc-side" style="text-align:left;">200,000 ل.س</td><td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts"><button class="sy-act" title="توزيع هذه الدفعة على الجلسات">✏️ توزيع</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div>
<div class="card" style="margin-bottom:14px;"><div id="adjustmentsContent"><table class="data-table m-cards"><thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th><th style="text-align:left;">المبلغ</th><th></th></tr></thead><tbody>
<tr data-row="adjustments"><td class="mc-hide">20 آب 2026</td><td class="mc-title"><span class="tag tone tone-yellow">خصم</span><div class="mc-only mc-meta">20 آب 2026 · خصم عائلي</div></td><td class="mc-hide" style="color:var(--text2)">خصم عائلي</td><td class="mc-side" style="text-align:left;color:var(--amber);font-weight:700;white-space:nowrap;">− 25,000 ل.س</td><td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts"><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div>
<div class="card" style="margin-bottom:14px;"><div id="labOrdersContent"><div style="overflow-x:auto;scrollbar-width:none;" class="no-scrollbar"><table class="data-table m-cards"><thead><tr><th>تاريخ الإرسال</th><th>السن</th><th>نوع العمل</th><th>المخبر</th><th>اللون</th><th style="text-align:left;">التكلفة</th><th>الحالة</th><th></th></tr></thead><tbody>
<tr data-row="labs" data-slot-row><td class="mc-hide"><span class="dt-cell"><span class="ltr-val">31/7/2026</span><span class="dt-time ltr-val">06:09 AM</span></span></td><td class="mc-hide">سن 35</td><td class="mc-title">تاج زركون<div class="mc-only mc-meta">سن 35 · 13 آب 2026 · حسن · لون a3</div></td><td class="mc-hide" style="color:var(--text2)">حسن</td><td class="mc-hide" style="color:var(--text2)">a3</td><td class="mc-side2" style="text-align:left;color:var(--text2)">90 $</td><td class="mc-side"><span class="lab-pill tone tone-blue">مُرسَل</span></td>
<td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act sy-act-primary" data-slot="1">✓ تم الفحص</button><button class="sy-act sy-act-warn" data-slot="2">🔄 إعادة</button><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr>
<tr data-row="labs-noredo" data-slot-row><td class="mc-hide">13/8/2026</td><td class="mc-hide">سن 15</td><td class="mc-title">زراعة<div class="mc-only mc-meta">سن 15 · 13/8/2026 · حسن</div></td><td class="mc-hide" style="color:var(--text2)">حسن</td><td class="mc-hide" style="color:var(--text2)">a3</td><td class="mc-side2" style="text-align:left;color:var(--text2)">90 $</td><td class="mc-side"><span class="lab-pill tone tone-blue">مُرسَل</span></td>
<td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act sy-act-primary" data-slot="1" data-span="2">📦 تم الاستلام من المخبر</button><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr>
<tr data-row="labs-done" data-slot-row><td class="mc-hide">28/7/2026</td><td class="mc-hide">سن 14</td><td class="mc-title">زراعة<div class="mc-only mc-meta">سن 14 · 28/7/2026 · حسن</div></td><td class="mc-hide" style="color:var(--text2)">حسن</td><td class="mc-hide" style="color:var(--text2)">a3</td><td class="mc-side2" style="text-align:left;color:var(--text2)">90 $</td><td class="mc-side"><span class="lab-pill tone tone-blue">مُرسَل</span></td>
<td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div></div>
<div class="card" style="margin-bottom:14px;"><div id="rxList"><div style="overflow-x:auto;" class="no-scrollbar"><table class="data-table m-cards"><thead><tr><th>التاريخ</th><th>الأدوية</th><th>الطبيب</th><th style="text-align:left;"></th></tr></thead><tbody>
<tr data-row="rx"><td class="mc-hide" style="white-space:nowrap;">31 تموز 2026</td><td class="mc-title mc-wide">بروفن، أموكسيسيلين<div class="mc-only mc-meta">31 تموز 2026 · د. أيهم غنيم</div></td><td class="mc-hide" style="white-space:nowrap;">د. أيهم غنيم</td>
<td class="mc-actions" style="text-align:left;white-space:nowrap;"><div class="sy-acts"><button class="sy-act">🖨️ طباعة</button><button class="sy-act">📋 نسخ</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div></div>
<div class="card" style="margin-bottom:14px;"><div id="postopList"><div style="overflow-x:auto;" class="no-scrollbar"><table class="data-table m-cards"><thead><tr><th>التاريخ</th><th>التعليمات</th><th style="text-align:left;"></th></tr></thead><tbody>
<tr data-row="postop"><td class="mc-hide" style="white-space:nowrap;vertical-align:top;">20 أيلول 2026</td><td class="mc-title mc-wide">القلع الجراحي يحتاج عناية أكثر قليلاً…<div class="mc-only mc-meta">20 أيلول 2026</div></td>
<td class="mc-actions" style="text-align:left;white-space:nowrap;vertical-align:top;"><div class="sy-acts"><button class="sy-act">🖨️ طباعة</button><button class="sy-act">📋 نسخ</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div></div>
<div class="card" style="margin-bottom:14px;padding:14px;"><div data-row="plan"><div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;"><div style="font-weight:800;">خطة أقساط <span style="font-weight:400;font-size:12px;color:var(--text2);">(شهري — 50,000 ل.س)</span></div><div style="font-size:13px;">القسط القادم: <strong>1/10/2026</strong></div>
<div class="sy-acts" style="margin-top:10px;"><button class="sy-act">📱 تذكير واتساب</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-primary">✅ إكمال</button><button class="sy-act sy-act-danger">✖ إلغاء الخطة</button></div></div></div></div>
<div class="card" style="margin-bottom:14px;padding:14px;">
<div class="appts-next" data-row="appt-next"><div class="appts-next-body"><div class="appts-next-k">الموعد القادم · <b>اليوم</b></div><div class="appts-next-date">الاثنين 21 أيلول 2026</div></div><div class="appts-next-actions sy-acts"><button type="button" class="appt-btn appt-btn-stage tone tone-blue" style="--bc:#2563eb;">🚶 وصل</button><button type="button" class="sy-act">📱 تذكير</button><button type="button" class="sy-act">🗓️ فتح بالتقويم</button></div></div>
<div class="appt-row appt-b-planned" data-row="appt-planned" style="--bc:var(--blue);"><div class="appt-tile appt-tile-planned"><span class="appt-tile-day">📋</span><span class="appt-tile-mon">بلا تاريخ</span></div><div class="appt-body"><div class="appt-head">حشوة كومبوزت</div><div class="appt-line appt-muted">موعدٌ مخطّط بانتظار الجدولة</div></div><div class="appt-actions sy-acts"><button type="button" class="sy-act sy-act-primary">📅 جدولة</button><button type="button" class="sy-act">✏️ تعديل</button><button type="button" class="sy-act sy-act-danger">🗑️ حذف</button></div></div>
<div class="appt-row appt-b-missed" data-row="appt-missed" style="--bc:var(--red);"><div class="appt-tile"><span class="appt-tile-dow">الخميس</span><span class="appt-tile-day">17</span><span class="appt-tile-mon">أيلول 2026</span></div><div class="appt-body"><div class="appt-head">فحص دوري</div><div class="appt-line appt-warn">لم يُعَد حجزه</div></div><div class="appt-actions sy-acts"><button type="button" class="sy-act sy-act-primary">📅 إعادة حجز</button><button type="button" class="sy-act">📂 فتح</button></div></div>
</div>
<div class="card" style="margin-bottom:14px;padding:14px;"><div data-row="planned-pp"><div class="planned-pp-row"><div class="planned-pp-icon">📋</div><div class="planned-pp-info"><div class="planned-pp-title">موعد مخطّط</div><div class="planned-pp-reason">🦷 تاج زركون — بانتظار المخبر</div></div><div class="planned-pp-actions sy-acts"><button class="sy-act sy-act-primary">📅 جدولة الآن</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div></div>
<div class="card plan-visits" style="margin-bottom:14px;padding:14px;"><div class="pv-list">
<div class="pv-card pv-unsched" data-row="pv"><div class="pv-title"><b>زيارة 1</b><span class="pv-when">غير مجدولة</span></div><div class="pv-items">حشوة 36 · قناة جذر 46</div><div class="pv-foot"><span class="pv-total">2 بند · 350,000 ل.س</span><span class="sy-acts"><button type="button" class="sy-act sy-act-primary">📅 جدوِل</button><button type="button" class="sy-act" title="تعديل بنود الزيارة">✏️ تعديل</button></span></div></div>
<div class="pv-card pv-free" data-row="pv-free"><div class="pv-title"><b>المرحلة ١</b></div><div class="pv-items">تنظيف · تبييض</div><div class="pv-foot"><span class="pv-total">2 بند · 90,000 ل.س</span><span class="sy-acts"><button type="button" class="sy-act sy-act-primary">➕ زيارة</button><button type="button" class="sy-act" aria-pressed="false">🔗 موعد قائم</button></span></div></div>
</div></div>
<div class="card" style="margin-bottom:14px;padding:14px;"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;">
<div data-row="file" style="border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--bg2);display:flex;flex-direction:column;"><div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:40px;background:var(--bg3);">📄</div><div style="padding:8px 9px;flex:1;display:flex;flex-direction:column;gap:4px;"><div style="font-size:11px;color:var(--text2);">أشعة</div><div style="font-size:12px;">صورة بانورامية.jpg</div><div class="sy-acts" style="flex-wrap:wrap;margin-top:4px;"><button class="sy-act" title="عرض / تنزيل">👁️ عرض</button><button class="sy-act sy-act-danger" title="حذف">🗑️ حذف</button></div></div></div>
</div></div>
<div class="card" style="padding:14px;"><div data-row="templates"><div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:0;"><div style="font-weight:700;color:var(--text);">بعد القلع الجراحي</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">بروفن، أموكسيسيلين</div></div><div class="sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div></div>`,
  },
  'treatments.html': {
    src: ['treatments.html'],
    anchors: ["'<div class=\"treat-actions sy-acts sy-acts-grid\">'", 'class="treat-grid" id="treatGrid"', "'<div class=\"treat-card\" draggable=\"true\"",
              "'<button class=\"sy-act' + (isInactive ? ' sy-act-primary' : ' sy-act-warn') + '\" onclick=\"toggleActive("],
    rows: `
<div class="treat-grid">
<div class="treat-card" data-row="treat-active"><div class="treat-color-bar" style="background:#0d8577;"></div><div class="treat-body"><div class="treat-head"><div class="treat-swatch" style="background:#0d857733;border:2px solid #0d8577;"></div><div class="treat-head-main"><div class="treat-name">تلبيس (تاج) زركون</div><div class="treat-tags"></div></div><span class="treat-fav-star on">★</span></div><div class="treat-price">450,000 <span class="currency">ل.س</span></div>
<div class="treat-actions sy-acts sy-acts-grid"><button class="sy-act" title="إزالة من المفضلة">⭐ مفضّل</button><button class="sy-act">✏️ تعديل</button><button class="sy-act" title="إنشاء نسخة">📋 نسخ</button><button class="sy-act" title="ربط مواد المخزون">🧰 المواد</button><button class="sy-act sy-act-warn" title="تعطيل العلاج">⏸️ تعطيل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div>
<div class="treat-card" data-row="treat-inactive" style="opacity:.6;"><div class="treat-color-bar" style="background:#7c3aed;"></div><div class="treat-body"><div class="treat-head"><div class="treat-swatch" style="background:#7c3aed33;border:2px solid #7c3aed;"></div><div class="treat-head-main"><div class="treat-name">تبييض</div><div class="treat-tags"></div></div><span class="treat-fav-star">☆</span></div><div class="treat-price">150,000 <span class="currency">ل.س</span></div>
<div class="treat-actions sy-acts sy-acts-grid"><button class="sy-act" title="إضافة للمفضلة">☆ مفضّل</button><button class="sy-act">✏️ تعديل</button><button class="sy-act">📋 نسخ</button><button class="sy-act">🧰 المواد</button><button class="sy-act sy-act-primary" title="تفعيل العلاج">▶️ تفعيل</button></div></div></div>
</div>`,
  },
  'doctors.html': {
    src: ['doctors.html'],
    anchors: ["'<div class=\"doc-actions sy-acts sy-acts-grid\">'", "'<div class=\"doc-grid\">'", "'<div class=\"doc-card\">'"],
    rows: `
<div class="doc-grid">
<div class="doc-card" data-row="doc-owner"><div class="doc-color-bar" style="background:#0d8577"></div><div class="doc-body"><div class="doc-head"><div class="doc-avatar" style="background:#0d8577">أغ</div><div style="flex:1;"><div class="doc-name">د. أيهم غنيم</div></div></div>
<div class="doc-actions sy-acts sy-acts-grid"><button class="sy-act sy-act-primary" title="هذا هو معالجك الافتراضي">⭐ المعالج الافتراضي</button></div></div></div>
<div class="doc-card" data-row="doc-other"><div class="doc-color-bar" style="background:#2563eb"></div><div class="doc-body"><div class="doc-head"><div class="doc-avatar" style="background:#2563eb">مب</div><div style="flex:1;"><div class="doc-name">د. مجد بركة</div></div></div>
<div class="doc-actions sy-acts sy-acts-grid"><button class="sy-act">✏️ تعديل</button><button class="sy-act" title="تعيين هذا الطبيب كمعالج افتراضي">☆ تعيين كمعالج افتراضي</button></div></div></div>
</div>`,
  },
  'employees.html': {
    src: ['employees.html'],
    anchors: ["'<div class=\"emp-actions sy-acts\">'", "'<div class=\"emp-card'"],
    rows: `
<div class="emp-grid">
<div class="emp-card" data-row="emp"><div class="emp-color-bar" style="background:#7c3aed;"></div><div class="emp-body"><div class="emp-head"><div class="emp-name">ريم — سكرتيرة</div></div><div class="emp-pin-status pin-set">✅ رقم السر محفوظ</div>
<div class="emp-actions sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-warn" title="منع جهاز هذا الموظف">🔒 تعطيل الحساب</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div>
<div class="emp-card inactive" data-row="emp-inactive"><div class="emp-color-bar" style="background:#0d8577;"></div><div class="emp-body"><div class="emp-head"><div class="emp-name">د. مجد — طبيب</div></div>
<div class="emp-actions sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-primary" title="إعادة تفعيل حساب هذا الموظف">✅ تفعيل الحساب</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div>
<div class="emp-card" data-row="emp-owner"><div class="emp-body"><div class="emp-head"><div class="emp-name">د. أيهم غنيم — المالك</div></div>
<div class="emp-actions sy-acts"><button class="sy-act">🔐 تغيير رقم سرّي</button></div></div></div>
</div>`,
  },
  'payouts.html': {
    src: ['payouts.html'],
    anchors: ['<div class="payouts-table">', "SyDT.cell(po.paid_at || po.created_at)", "'<div class=\"table-row\" tabindex=\"0\" role=\"button\"", "'<div class=\"cell-actions sy-acts\">'"],
    rows: `
<div class="payouts-table"><div class="table-head"><div>التاريخ</div><div>الموظف</div><div>الفترة</div><div>المبلغ</div><div>الطريقة</div><div></div></div>
<div class="table-row" data-row="payout" data-scroll-table="1" tabindex="0" role="button"><div><span class="dt-cell"><span class="ltr-val">21/9/2026</span><span class="dt-time ltr-val">02:32 PM</span></span></div><div class="cell-employee"><span class="dot-color" style="background:#2563eb;"></span><span>د. مجد بركة</span></div><div style="font-size:12px;color:var(--text2);">1 آب ← 31 آب</div><div class="cell-amt">1,250,000 ل.س</div><div><span class="cell-method cash">نقداً</span></div>
<div class="cell-actions sy-acts"><button class="sy-act" title="عرض تفصيل الدفعة">📊 التفصيل</button></div></div></div>`,
  },
  'expenses.html': {
    src: ['expenses.html'],
    anchors: ['<div class="table-scroll">', "SyDT.cell(e.date, e.expense_time)", "'<td data-label=\"إجراءات\" class=\"exp-acts-cell\"><div class=\"sy-acts\">'", 'id="catsGrid" class="cats-grid"', "'<div class=\"cat-actions sy-acts\">'"],
    rows: `
<div class="table-scroll"><table><thead><tr><th>التاريخ</th><th>التصنيف</th><th>الوصف</th><th>المورّد</th><th>المبلغ</th><th>طريقة الدفع</th><th>إجراءات</th></tr></thead><tbody>
<tr data-exp-id="x" data-row="expense"><td data-label="التاريخ"><span class="dt-cell"><span class="ltr-val">30/7/2026</span><span class="dt-time ltr-val">11:05 AM</span></span></td><td data-label="التصنيف">مواد سنية</td><td data-label="الوصف">كمبوزيت — ثلاث عبوات</td><td data-label="المورّد">—</td><td data-label="المبلغ"><span class="amount">350,000 ل.س</span></td><td data-label="طريقة الدفع">نقد</td>
<td data-label="إجراءات" class="exp-acts-cell"><div class="sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div>
<div class="cats-grid">
<div class="cat-card" data-row="cat"><div class="cat-head"><div class="cat-icon">🦷</div><div class="cat-info"><div class="cat-name">مواد سنية</div><div class="cat-stats">2 مصروف • مجموع 800,000 ل.س</div></div></div>
<div class="cat-actions sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-warn">⏸️ تعطيل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div>
<div class="cat-card inactive" data-row="cat-off"><div class="cat-head"><div class="cat-icon">⚡</div><div class="cat-info"><div class="cat-name">كهرباء وماء</div><div class="cat-stats">1 مصروف</div></div></div>
<div class="cat-actions sy-acts"><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-primary">▶️ تفعيل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div>
</div>`,
  },
  'inventory.html': {
    src: ['inventory.html'],
    anchors: ["'<td style=\"text-align:left;white-space:nowrap;\"><div class=\"sy-acts\">'", "'<td><div class=\"sy-acts\"><button class=\"sy-act sy-act-primary\" onclick=\"finishBatch(",
              "'<td style=\"text-align:left;\"><div class=\"sy-acts\"><button class=\"sy-act sy-act-primary\" onclick=\"openMoveModal(", '<div class="mg-row">', '<span class="sy-acts"><button class="sy-act" onclick="mgFillExample(', '<table class=\"data-table inv-items\">'],
    rows: `
<div class="card" style="margin-bottom:14px;"><div style="overflow-x:auto;"><table class="data-table inv-items"><thead><tr><th>الصنف</th><th>الكمية</th><th>حد التنبيه</th><th>سعر الشراء</th><th style="text-align:left;"></th></tr></thead><tbody>
<tr data-row="item" tabindex="0" role="button"><td><strong>كمبوزيت A2</strong></td><td><span class="qty-pill">12</span> <span style="color:var(--text2);font-size:12px;">تطبيق</span></td><td style="color:var(--text2);">5</td><td style="color:var(--text2);">150,000 ل.س</td>
<td style="text-align:left;white-space:nowrap;"><div class="sy-acts"><button class="sy-act">🔄 حركة</button><button class="sy-act" title="سجلّ حركات الصنف">📜 السجل</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></td></tr>
</tbody></table></div></div>
<div class="card" style="margin-bottom:14px;"><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الصنف</th><th>المتبقي</th><th>حد التنبيه</th><th style="text-align:left;"></th></tr></thead><tbody>
<tr data-row="low"><td><strong>بنج موضعي</strong></td><td><span class="qty-pill">3 كبسولة</span></td><td style="color:var(--text2);">10</td><td style="text-align:left;"><div class="sy-acts"><button class="sy-act sy-act-primary" title="تسجيل شراء">🛒 شراء</button></div></td></tr>
</tbody></table></div></div>
<div class="card" style="margin-bottom:14px;"><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>
<tr data-row="batch"><td><strong>ألجينات</strong></td><td style="white-space:nowrap;">22 طبعة</td><td style="color:var(--text2);white-space:nowrap;">2026-10-01</td><td><span class="exp-badge exp-soon">قريب</span></td><td><div class="sy-acts"><button class="sy-act sy-act-primary" title="تسجيل انتهاء هذه الدفعة">✅ انتهت</button></div></td></tr>
</tbody></table></div></div>
<div class="mg-sec" data-row="mg"><div class="mg-row"><div class="mg-row-info"><div class="mg-row-name">بنج موضعي</div><div class="mg-row-meta">كبسولة · 50 · تنبيه 10</div></div><span class="sy-acts"><button class="sy-act">📋 نسخ مثال</button></span></div></div>`,
  },
  'labs.html': {
    src: ['labs.html'],
    anchors: ['<tbody id="ordersBody">', "tbody.innerHTML = SySlots.finalize(rows, _labW);", '<div class="cards-list" id="ordersCards">', "'<td style=\"white-space:nowrap;\"><div class=\"sy-acts sy-slots\" style=\"--sy-slots:__SY_SLOTS__\">'",
              "'<div class=\"oc-actions sy-acts\">'", "'<div class=\"lab-list-actions sy-acts\">'", "'<div class=\"sy-acts\"><button class=\"sy-act sy-act-danger\" onclick=\"delLabPayment("],
    rows: `
<div class="card"><div class="table-scroll"><table><thead><tr><th>المريض</th><th>السن</th><th>نوع العمل</th><th>المخبر</th><th>اللون</th><th>الإرسال</th><th>الاستحقاق</th><th style="text-align:left;">التكلفة</th><th>الحالة</th><th></th></tr></thead>
<tbody id="ordersBody"><tr data-row="order" data-mobile-hidden="1" data-slot-row><td class="patient-link">تجريبي 3</td><td><span class="tooth-badge">سن 35</span></td><td>تاج حرف على معدن</td><td style="color:var(--text2)">انس</td><td style="color:var(--text2)">a1</td><td>14 أيلول</td><td>—</td><td style="text-align:left;color:var(--text2)">25 $</td><td><span class="lab-pill tone tone-green">تم الاستلام</span></td>
<td style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act sy-act-primary" data-slot="1">✓ تم الفحص</button><button class="sy-act sy-act-warn" data-slot="2">🔄 إعادة</button><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr>
<tr data-row="order-draft" data-mobile-hidden="1" data-slot-row><td class="patient-link">تجريبي 4</td><td><span class="tooth-badge">سن 44</span></td><td>زراعة</td><td style="color:var(--text2)">حسن</td><td style="color:var(--text2)">a3</td><td>—</td><td>26/9/2026</td><td style="text-align:left;color:var(--text2)">90 $</td><td><span class="lab-pill tone tone-gray">مسودة</span></td>
<td style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act sy-act-primary" data-slot="1" data-span="2">📤 إرسال للمخبر</button><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr>
<tr data-row="order-done" data-mobile-hidden="1" data-slot-row><td class="patient-link">تجريبي 4</td><td><span class="tooth-badge">سن 44</span></td><td>زراعة</td><td style="color:var(--text2)">حسن</td><td style="color:var(--text2)">a3</td><td>—</td><td>26/9/2026</td><td style="text-align:left;color:var(--text2)">90 $</td><td><span class="lab-pill tone tone-gray">مسودة</span></td>
<td style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:[s1] 160px [s2] 78px [s3] 82px [s4] 80px"><button class="sy-act" data-slot="3">✏️ تعديل</button><button class="sy-act sy-act-danger" data-slot="4">🗑️ حذف</button></div></td></tr></tbody></table></div>
<div class="cards-list" id="ordersCards"><div class="order-card" data-row="order-card" data-desktop-hidden="1"><div class="oc-head"><b>تجريبي 3</b></div><div class="oc-info">تاج حرف على معدن · انس</div>
<div class="oc-actions sy-acts"><button class="sy-act sy-act-primary">🤝 تم التركيب</button><button class="sy-act sy-act-warn">🔄 إعادة</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div></div>
<div class="card" style="margin-top:14px;"><div id="labsList"><div class="lab-list-row" data-row="lab"><div class="lab-list-info"><div class="lab-list-name">مخبر حسن</div><div class="lab-list-phone">📞 0934012433</div><div class="lab-list-phone bal neg">💰 مستحق للمخبر: 546,000 ل.س</div></div>
<div class="lab-list-actions sy-acts"><button class="sy-act">💰 كشف حساب</button><button class="sy-act">✏️ تعديل</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div></div>
<div class="card" style="margin-top:14px;padding:12px;"><div data-row="stmt-pay"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:9px 4px;font-size:13px;"><span>💵</span><div style="flex:1;min-width:0;"><div>دفعة سداد — نقداً</div><div style="font-size:11px;color:var(--text2);">1 أيلول 2026</div></div><div style="font-weight:700;color:var(--green);white-space:nowrap;">− 200,000 ل.س</div>
<div class="sy-acts"><button class="sy-act sy-act-danger" title="حذف الدفعة">🗑️ حذف</button></div></div></div></div>`,
  },
  'provider-reports.html': {
    src: ['provider-reports.html'],
    anchors: ["'<div class=\"prov-actions sy-acts sy-acts-grid\">'", 'providers-grid', "'<div class=\"sy-acts\"><button class=\"sy-act sy-act-danger\" onclick=\"deletePayout(", 'id="payoutHistoryList"', "SyDT.cell(po.paid_at || po.created_at)"],
    rows: `
<div class="providers-grid">
<div class="prov-card" data-row="prov"><div class="prov-body"><div class="prov-head"><div class="prov-avatar" style="background:#2563eb">مب</div><div><div class="prov-name">د. مجد بركة</div><div class="prov-role">طبيب · نسبة</div></div></div>
<div class="prov-actions sy-acts sy-acts-grid"><button class="sy-act">📋 التفاصيل</button><button class="sy-act">🖨️ طباعة كشف</button><button class="sy-act">📒 كشف حساب</button><button class="sy-act sy-act-primary">💵 تسجيل دفعة</button></div></div></div>
</div>
<div class="card" style="margin-top:14px;padding:12px;"><div id="payoutHistoryList"><div class="payout-history-item" data-row="po-hist"><div><div class="amt">1,250,000 ل.س</div><div class="meta">1/8/2026 ← 31/8/2026 • دفعة آب</div></div>
<div class="phi-when"><span class="dt-cell"><span class="ltr-val">21/9/2026</span><span class="dt-time ltr-val">02:32 PM</span></span></div><div class="sy-acts"><button class="sy-act sy-act-danger" title="حذف الدفعة">🗑️ حذف</button></div></div></div></div>`,
  },
  'audit-log.html': {
    src: ['audit-log.html'],
    anchors: ["html += '<div class=\"log-list\">';", "'<div class=\"log-actions sy-acts' + (arch ? ' sy-slots\" style=\"--sy-slots:__SY_SLOTS__' : '') + '\">'", "'<a class=\"sy-act\" data-slot=\"2\" href=\"patient-profile.html?id="],
    rows: `
<div class="log-list">
<div class="log-row archived" data-row="log" data-slot-row><div class="log-time"><span class="lt-date">21/9/2026</span><span class="lt-hour">02:32 PM</span></div><div class="log-emp"><div class="le-name">ريم</div><div class="le-role secretary">سكرتيرة</div></div>
<div class="log-desc"><span class="ld-arch-tag">📂 مؤرشف</span><span class="ld-text">حذف دفعة — 200,000 ل.س</span><span class="ld-action">حذف دفعة</span></div>
<div class="log-actions sy-acts sy-slots" style="--sy-slots:[s1] 94px [s2] 94px"><button class="sy-act sy-act-primary" data-slot="1">↩️ استرجاع</button><a class="sy-act" data-slot="2" href="#">👤 المريض</a></div></div>
<div class="log-row archived" data-row="log-nopatient" data-slot-row><div class="log-time"><span class="lt-date">20/9/2026</span><span class="lt-hour">09:10 AM</span></div><div class="log-emp"><div class="le-name">ريم</div><div class="le-role secretary">سكرتيرة</div></div>
<div class="log-desc"><span class="ld-arch-tag">📂 مؤرشف</span><span class="ld-text">تعديل إعدادات العيادة</span><span class="ld-action">تعديل</span></div>
<div class="log-actions sy-acts sy-slots" style="--sy-slots:[s1] 94px [s2] 94px"><button class="sy-act sy-act-primary" data-slot="1">↩️ استرجاع</button></div></div>
</div>`,
  },
  'admin.html': {
    src: ['admin.html', 'admin-render.js'],
    anchors: ['<div class="requests-list" id="reqList">', "'<div class=\"req-actions sy-acts\">' + actions + '</div>'", "'<div class=\"c360-actions-row sy-acts\">'",
              ".map(function (g) { return '<span class=\"sy-acts-grp\">' + g + '</span>'; })", "'<div class=\"sy-acts\"><button class=\"sy-act sy-act-primary\" onclick=\"openPayModal("],
    rows: `
<div class="requests-list">
<div class="req-card expired" data-row="acct-expired"><div class="req-top"><div><div class="req-name">عيادة د. أيهم غنيم</div></div><span class="req-state expired">منتهٍ</span></div>
<div class="req-info"><div class="req-info-row">📱 <span class="ltr-val">0934012433</span></div><div class="req-info-row">🕐 <span>21/9/2026 — 02:32 PM</span></div></div>
<div class="req-actions sy-acts"><span class="sy-acts-grp"><button class="sy-act sy-act-primary">✅ إعادة تجربة 30 يوم</button><button class="sy-act">⏰ منح فترة سماح 14 يوم</button><button class="sy-act">💎 ترقية إلى مدفوع</button></span><span class="sy-acts-sep" aria-hidden="true"></span><span class="sy-acts-grp"><a class="sy-act" href="#">👋 ترحيب</a></span><span class="sy-acts-sep" aria-hidden="true"></span><span class="sy-acts-grp"><button class="sy-act">✏️ تعديل</button><button class="sy-act">👤 ملف العميل</button><button class="sy-act">📊 عرض النشاط</button></span><span class="sy-acts-sep" aria-hidden="true"></span><span class="sy-acts-grp"><button class="sy-act sy-act-warn">⏸️ إيقاف</button><button class="sy-act sy-act-danger">🗑️ حذف</button></span></div></div>
<div class="req-card new" data-row="acct-new"><div class="req-top"><div><div class="req-name">عيادة الأمل</div></div><span class="req-state new">جديد</span></div>
<div class="req-actions sy-acts"><span class="sy-acts-grp"><button class="sy-act sy-act-primary">✅ قبول وتفعيل التجربة</button></span><span class="sy-acts-sep" aria-hidden="true"></span><span class="sy-acts-grp"><button class="sy-act">✏️ تعديل</button><button class="sy-act">👤 ملف العميل</button></span><span class="sy-acts-sep" aria-hidden="true"></span><span class="sy-acts-grp"><button class="sy-act sy-act-danger">❌ رفض</button></span></div></div>
</div>
<div class="c360-actions" style="margin-top:16px;"><div class="c360-action-group" data-row="c360-life"><div class="c360-action-group-title">⚙️ دورة حياة الاشتراك</div><div class="c360-actions-row sy-acts"><button class="sy-act sy-act-primary">🔄 تجديد</button><button class="sy-act">💎 تغيير الخطة</button></div></div>
<div class="c360-action-group" data-row="c360-del"><div class="c360-action-group-title">⏸ إيقاف وحذف</div><div class="c360-actions-row sy-acts"><button class="sy-act sy-act-warn">⏸️ إيقاف</button><button class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div>`,
  },
  'settings.html': {
    src: ['settings.html', 'appt-wa.js', 'pp-dental.js'],
    anchors: ["+   '<div class=\"sy-acts\">'   /* v487: الكراسي/الغرف", "'<div class=\"sy-acts\">' + waBtn", "'<div class=\"sy-acts\"><button type=\"button\" class=\"sy-act sy-act-danger\" onclick=\"deleteImplantLog("],
    rows: `
<div class="card" style="padding:14px;margin-bottom:14px;"><div data-row="operatory"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px;background:color-mix(in srgb, var(--text) 3%, transparent);border:1px solid var(--border);border-radius:10px;">
<div style="width:14px;height:14px;border-radius:4px;background:#0d8577;"></div><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;color:var(--text);">كرسي 1</div></div>
<div class="sy-acts"><button type="button" class="sy-act">✏️ تعديل</button><button type="button" class="sy-act sy-act-danger">🗑️ حذف</button></div></div></div></div>
<div class="card" style="padding:14px;margin-bottom:14px;"><div data-row="waitlist"><div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
<div style="flex:1;min-width:160px;"><div style="font-weight:700;">يحيى التر</div><div style="font-size:12.5px;color:var(--text2);margin-top:3px;">موعده الحالي: <b>21/9/2026 \u200E10:30 AM\u200E</b> · فحص</div></div>
<div class="sy-acts"><button class="sy-act">📱 واتساب</button><button class="sy-act">🗓️ فتح الموعد</button></div></div></div></div>
<div class="card" style="padding:14px;"><div data-row="implant-log"><div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg2);"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
<div style="font-size:13px;font-weight:700;color:var(--text);">Straumann BLT 4.1×10 مم</div><div class="sy-acts"><button type="button" class="sy-act sy-act-danger" title="حذف السجل">🗑️ حذف</button></div></div></div></div></div>`,
  },
};

const made = [];
for (const [page, spec] of Object.entries(PAGES)) {
  const source = spec.src.map(R).join('\n');
  for (const a of spec.anchors) if (source.indexOf(a) < 0) throw new Error(page + ': الشاهدُ لا يطابق الصفحة — المرساة غائبة: ' + a);
  const html = R(page);
  let css = '';
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) css += m[1] + '\n';
  for (const m of html.matchAll(/<link rel="stylesheet" href="([^"?]+)\??[^"]*">/g))
    if (m[1] !== 'theme.css' && fs.existsSync(path.join(ROOT, m[1]))) css += R(m[1]) + '\n';
  let top = '';
  if (spec.top) {
    const i = html.indexOf(spec.top[0]), j = html.indexOf(spec.top[1]);
    if (i < 0 || j < i) throw new Error(page + ': الشاهدُ لا يطابق الصفحة — شريطُ العرض غائب');
    top = '<div class="main" id="sbMainContent">' + html.slice(i, j)
      .replace(/(id="(?:bookingBadge|waitlistBadge)" style=")display:none;/g, '$1display:inline-block;')
      .replace(/(id="bookingBadge"[^>]*>)<\/span>/, '$14</span>')
      .replace(/(id="waitlistBadge"[^>]*>)<\/span>/, '$15</span>') + '</div>';
  }
  const base = page.replace('.html', '');
  for (const t of ['light', 'dark']) {
    fs.writeFileSync(path.join(out, `${base}_${t}.html`), `<!doctype html><html lang="ar" dir="rtl" data-theme="${t}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<link rel="stylesheet" href="../theme.css"></head><body><div style="display:block;flex:1 1 auto;min-width:0;">${top}<div style="padding:16px;">${spec.rows}</div></div></body></html>`);
  }
  made.push(base);
}
fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify(made));
console.log('شواهد أزرار الصفوف جاهزة بـ_ra/: ' + made.join(' · '));
