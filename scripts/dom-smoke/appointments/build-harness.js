/* v438 — مثبت DOM الحيّ لنوافذ صفحة المواعيد.
   يقتطع النوافذ الخمس من appointments.html نفسها (تغييرُ البنية أو المعرّفات
   يُسقط المثبت) ويركّبها فوق appointments.css + theme.css + موديول العُدّة
   من sidebar.js، بكعوبٍ لدوال الصفحة. يكتب الشاهدين بـ_ah/ (مؤقتة). */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = R('appointments.html');
const a = html.indexOf('<div class="modal-overlay sy-m sy-m-md" id="modalOverlay">');
if (a < 0) throw new Error('modalOverlay غير موجود أو لا يحمل sy-m');
const modals = html.slice(a, html.indexOf('<script', a));
const sb = R('sy-modal.js');
const kit = sb.slice(sb.indexOf('/* SYDENT_MODAL_KIT_START'));
if (!kit) throw new Error('موديول العُدّة غير موجود بـsy-modal.js');
const stubs = `<script>
window.log=[];
function stubClose(id){ log.push(id); document.getElementById(id).classList.remove('open'); }
function closeModal(){stubClose('modalOverlay');}
function closeWaitlistModal(){stubClose('waitlistModal');}
function closeApptMatDeductModal(){stubClose('apptMatDeductModal');}
function closeWaReminderModal(){stubClose('waReminderModal');}
function closeDismissedCompleteModal(){stubClose('dismissedCompleteModal');}
function submitAppt(e){e.preventDefault();log.push('submit');}
['onPlannedToggle','updateColorPreview','onApptProviderChange','onOperatoryChange','apptOnFilesPicked',
 'applyNoShowFeeFromModal','deleteApptFromModal','scheduleNowFromModal','apptConfirmMaterialDeduction',
 'sendWaReminder','dismissedSkipComplete','dismissedConfirmComplete','dcmToggleRow','onFPatientTyped',
 'onFPatientInput','updatePatientMedHint','fpSuggestPick','apptTplPick','apptProcAdd'].forEach(function(n){ if(!window[n]) window[n]=function(){}; });
document.getElementById('waitlistBody').innerHTML='<div style="font-weight:700">مريض تجريبي</div>'.repeat(14);
document.getElementById('dcmPlannedList').innerHTML='<div>جلسة</div>'.repeat(8);
document.getElementById('dcmPlannedSection').style.display='block';
document.getElementById('waModalMessage').value='مرحباً…';
</script>`;
const page = t => `<!doctype html><html lang="ar" dir="rtl" data-theme="${t}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../appointments.css"><link rel="stylesheet" href="../theme.css"></head><body>
<button id="opener">فتح</button>
${modals}
${stubs}
<script>${kit}</script></body></html>`;
const out = path.join(ROOT, '_ah');
fs.mkdirSync(out, { recursive: true });
for (const t of ['light', 'dark']) fs.writeFileSync(path.join(out, `appt_${t}.html`), page(t));
console.log('شاهدا المواعيد جاهزان بـ_ah/');
