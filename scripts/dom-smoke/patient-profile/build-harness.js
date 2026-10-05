/* v443 — شاهدُ نوافذ بطاقة المريض: تُقتطع النوافذ الأربعُ والثلاثون من
   patient-profile.html نفسها وتُركَّب فوق patient-profile.css + theme.css +
   موديول العُدّة من sidebar.js، بكعوبٍ لدوال الصفحة (فتح/إغلاق فقط). */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = R('patient-profile.html');
const first = html.search(/<div class="modal-overlay[^"]*" id="/);
if (first < 0) throw new Error('لا نوافذ بـpatient-profile.html');
const end = html.indexOf('<script', first);
const modals = html.slice(first, end);
const ids = [...modals.matchAll(/<div class="modal-overlay[^"]*" id="([^"]+)"/g)].map(m => m[1]);
if (ids.length !== 34) throw new Error('عدد النوافذ تغيّر: ' + ids.length + ' (المنتظَر 34) — حدّث المثبت');
const sb = R('sy-modal.js');
const kit = sb.slice(sb.indexOf('/* SYDENT_MODAL_KIT_START'));
const stubs = `<script>
window.log=[]; window.MODAL_IDS=${JSON.stringify(ids)};
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ log.push(id); document.getElementById(id).classList.remove('open'); }
/* كلُّ معالجٍ inline بالنوافذ يصير كعباً صامتاً — المثبت يفحص البنية والسلوك لا المنطق */
new MutationObserver(function(){}).observe(document.body,{childList:true});
document.querySelectorAll('[onclick]').forEach(function(el){
  var code = el.getAttribute('onclick') || '';
  var m = code.match(/^([A-Za-z_$][\\w$]*)\\(/);
  if (m && !window[m[1]] && m[1] !== 'closeModal' && m[1] !== 'openModal') window[m[1]] = function(){};
});
</script>`;
const page = t => `<!doctype html><html lang="ar" dir="rtl" data-theme="${t}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../patient-profile.css"><link rel="stylesheet" href="../theme.css"></head>
<body><button id="opener">فتح</button>
${modals}
${stubs}
<script>${kit}</script></body></html>`;
const out = path.join(ROOT, '_pp');
fs.mkdirSync(out, { recursive: true });
for (const t of ['light', 'dark']) fs.writeFileSync(path.join(out, `pp_${t}.html`), page(t));
console.log('شاهدا بطاقة المريض جاهزان بـ_pp/ (' + ids.length + ' نافذة)');
