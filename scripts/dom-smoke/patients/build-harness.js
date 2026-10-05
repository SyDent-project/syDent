/* v441 — شاهدُ نوافذ صفحة المرضى: تُقتطع النوافذ الأربع من patients.html نفسها،
   ويُبنى محرّرُ الرسالة (prmAiOverlay) بدالة الصفحة الحقيقية المستخرَجة من الملف،
   لا بنسخةٍ مكتوبةٍ هنا — فتغييرُ البنية أو حذفُ الرأس يُسقط المثبت. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = R('patients.html');
const a = html.indexOf('<div class="modal-overlay sy-m sy-m-md" id="modalOverlay">');
if (a < 0) throw new Error('modalOverlay غير موجود أو لا يحمل sy-m');
const modals = html.slice(a, html.indexOf('<!-- Toast', a));
/* ستايل الصفحة الداخلي (يحوي .btn-cancel/.btn-save/الشبكة) */
const st = html.indexOf('<style>');
const css = html.slice(st + 7, html.indexOf('</style>', st));
/* دالةُ بناء المحرّر كما هي بالملف */
/* الدالتان معاً: البناء + عدّاد الأحرف (v442) — تُقتطعان من الملف الحيّ */
const fs0 = html.indexOf('function prmAiOpenPreview(');
const fs1 = html.indexOf('function prmMsgCountSync()', fs0);
if (fs1 < 0) throw new Error('prmMsgCountSync غير موجودة — طقم المحرّر تغيّر');
const fnSrc = html.slice(fs0, html.indexOf('\n}\n', fs1) + 3);
const sb = R('sy-modal.js');
const kit = sb.slice(sb.indexOf('/* SYDENT_MODAL_KIT_START'));
const stubs = `<script>
window.log=[]; var PRM_AI_ON=false; var _prmAiCur=null;
function stubClose(id){ log.push(id); var e=document.getElementById(id); if(e) e.classList.remove('open'); }
function closeModal(){stubClose('modalOverlay');}
function closeImportModal(){stubClose('importModal');}
function closeSrcModal(){stubClose('srcModal');}
function prmClose(){stubClose('prmModal');}
function prmAiClose(){ log.push('prmAiOverlay'); var o=document.getElementById('prmAiOverlay'); if(o) o.remove(); }
function prmAiCloseDom(){ var o=document.getElementById('prmAiOverlay'); if(o) o.remove(); }
function submitPatient(e){e.preventDefault();log.push('submit');}
['prmSwitchTab','runPatientImport','downloadImportTemplate','prmAiSend','prmCopyText','prmAiRedraft',
 'prmTplLoad','prmTplRefreshSelect','prmTplSaveCurrent','prmTplDeleteSelected'].forEach(function(n){ if(!window[n]) window[n]=function(){ return {then:function(){}} ; }; });
window.prmTplLoad=function(){ return { then: function(){} }; };
${fnSrc}
document.getElementById('srcModalBody').innerHTML='<div>مصدر</div>'.repeat(20);
document.getElementById('prmRecallView').innerHTML='<div style="padding:8px">مريض</div>'.repeat(20);
</script>`;
const page = t => `<!doctype html><html lang="ar" dir="rtl" data-theme="${t}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<link rel="stylesheet" href="../theme.css"></head><body><button id="opener">فتح</button>
${modals}
${stubs}
<script>${kit}</script></body></html>`;
const out = path.join(ROOT, '_ph');
fs.mkdirSync(out, { recursive: true });
for (const t of ['light', 'dark']) fs.writeFileSync(path.join(out, `pat_${t}.html`), page(t));
console.log('شاهدا المرضى جاهزان بـ_ph/');
