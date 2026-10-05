/* v447 — شاهدٌ عامٌّ لنوافذ أي صفحةٍ مُرحَّلة: تُقتطع النوافذ من الصفحة نفسها
   وتُركَّب فوق ستايلها (داخليٍّ أو ملفٍ خارجي) + theme.css + موديول العُدّة،
   بكعوبٍ صامتةٍ لكل معالجٍ inline. صفحةٌ تُضاف للقائمة ⇒ تُفحص تلقائياً. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = JSON.parse(process.argv[2] || '[]');
const sb = R('sy-modal.js');
const kit = sb.slice(sb.indexOf('/* SYDENT_MODAL_KIT_START'));
const out = path.join(ROOT, '_pg');
fs.mkdirSync(out, { recursive: true });
const made = [];
for (const page of PAGES) {
  const html = R(page);
  /* v453: بعضُ الصفحات تكتب id قبل class (auth · subscription) — يُلتقط الشكلان. */
  const RE_OPEN = /<div (?:class="[^"]*\bmodal-overlay\b[^"]*" id="([^"]+)"|id="([^"]+)" class="[^"]*\bmodal-overlay\b[^"]*")/g;
  const first = html.search(RE_OPEN);
  if (first < 0) throw new Error(page + ': لا نوافذ');
  const end = html.indexOf('<script', first);
  const modals = html.slice(first, end);
  const ids = [...modals.matchAll(RE_OPEN)].map(m => m[1] || m[2]);
  /* ستايل الصفحة: كلُّ <style> داخلي + أيُّ ملفِ css خاصٍّ بها */
  let css = '';
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) css += m[1] + '\n';
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)\??[^"]*">/g)]
    .map(m => m[1]).filter(f => f !== 'theme.css' && fs.existsSync(path.join(ROOT, f)));
  for (const f of links) css += R(f) + '\n';
  const stubs = `<script>
window.log=[]; window.MODAL_IDS=${JSON.stringify(ids)};
function openModal(id){ var e=document.getElementById(id||'${ids[0]}'); if(e) e.classList.add('open'); }
function closeModal(id){ var e=document.getElementById(id||'${ids[0]}'); log.push(id||'${ids[0]}'); if(e) e.classList.remove('open'); }
document.querySelectorAll('[onclick]').forEach(function(el){
  /* v453: بعضُ الصفحات تنادي عبر window.fn() — يُلتقط الشكلان */
  var c = el.getAttribute('onclick') || '', m = c.match(/^(?:window\\.)?([A-Za-z_$][\\w$]*)\\(/);
  if (!m || window[m[1]] || m[1]==='closeModal' || m[1]==='openModal') return;
  /* دوالُ الإغلاق الخاصّة بالصفحة (closeExpModal…) تُحاكى بإغلاقٍ فعليّ كي يُقاس
     مسارُ Escape/✕ كما يجري بالصفحة الحقيقية، لا ككعبٍ صامت. */
  var _fn = /close/i.test(m[1])
    ? (function(name){ return function(){ log.push(name);
        var o = el.closest('.modal-overlay'); if (o) o.classList.remove('open'); }; })(m[1])
    : function(){};
  window[m[1]] = _fn;
});
</script>`;
  const mk = t => `<!doctype html><html lang="ar" dir="rtl" data-theme="${t}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<link rel="stylesheet" href="../theme.css"></head><body><button id="opener">فتح</button>
${modals}
${stubs}
${loadsKit ? '<script>' + kit + '</script>' : ''}</body></html>`;
  /* v462: الشاهدُ يطابق الصفحةَ لا يجمّلها — تُحقن العُدّة فقط إن كانت الصفحة
     تحمّل sy-modal.js فعلاً. حقنُها دائماً جعل صفحةَ الدخول «تمرّ» بـEscape
     وa11y لم تكن عندها أصلاً. */
  const loadsKit = /<script src="sy-modal\.js/.test(html);
  if (!loadsKit) console.warn('⚠️ ' + page + ': لا تحمّل sy-modal.js — الشاهدُ بلا العُدّة');
  const base = page.replace('.html', '');
  for (const t of ['light', 'dark']) fs.writeFileSync(path.join(out, `${base}_${t}.html`), mk(t));
  made.push(base + ' (' + ids.length + ')');
}
console.log('شواهد جاهزة بـ_pg/: ' + made.join(' · '));
