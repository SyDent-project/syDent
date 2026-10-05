/* v562 — مثبتُ دفعة الواجهة الأولى من ملاحظات Deep Code (#9 · #20 · #14) — مستقل، على الملفات الحيّة.
   #9  الهاتف: جداولُ المحاسبة (عدا كشف اليوم) بطاقاتٌ بأسماء أعمدتها (data-label من thead، مراقبٌ واحد) · صفُّ الدفعات بطاقةٌ
       بمناطق شبكة · كتلةُ الشاشات المتوسطة الأصلية سليمة (التفافُ حقلي التاريخ) · بطاقاتُ المصاريف لا تتجاوز العرض.
   #20 نافذةُ علاج السن لا تغطّي السنَّ: تُرسى قبل الفتح (التمريرُ ممكن) · لوحةٌ بالنصف المقابل (حاسوب) · ورقةٌ أقصر مع مساحةٍ مؤقتة
       لرفع الفكّ السفلي (هاتف) · السنُّ الظاهر وحده (لا نسخة اللثة المخفية) مُبرَز كاملاً · كلُّ ذلك يُزال عند الإغلاق بأي مسار ·
       المراقبُ لا يُعيد إطلاقَ نفسه (classList.remove يكتب السمة ولو بلا تغيير ⇒ كانت حلقةً جمّدت الصفحة بالفحص).
   #14 حذفُ الحساب داخل «منطقة الخطر» معنونةٍ ومفصولة، والسلوكُ كما هو.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('{', i); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return ''; }
const FILES = ['accounting.html', 'payouts.html', 'expenses.html', 'pp-dental.js', 'patient-profile.css', 'subscription.html'];
const base = {}; FILES.forEach(f => base[f] = read(f));
function suite(F) {
  const A = F['accounting.html'];
  const L = fnSrc(A, 'function accLabelCells(');
  ok(/querySelectorAll\('table\.providers:not\(\.ds-table\)'\)/.test(L) && /setAttribute\('data-label', hs\[c\]\)/.test(L) && /classList\.add\('acc-mcards'\)/.test(L), '#9 accounting: every cell labelled from its header; the day sheet stays a table');
  ok(/new MutationObserver\(function \(\) \{ if \(!pending\) \{ pending = true;/.test(A) && /\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/.test(A), '#9 accounting: one batched observer labels tables whenever they render');
  const M = A.slice(A.indexOf('@media (max-width:640px){\n  .tbl-wrap'));
  ok(/table\.providers\.acc-mcards thead \{ display:none; \}/.test(M) && /table\.providers\.acc-mcards td::before \{ content:attr\(data-label\);/.test(M) && /table\.providers\.acc-mcards td:first-child::before \{ display:none; \}/.test(M), '#9 accounting: ≤640px rows become labelled cards, first cell as the title');
  const P = F['payouts.html'];
  ok(/grid-template-areas: "emp amt" "date method" "period act";/.test(P) && /@media \(max-width:640px\) \{\s*\.payouts-table \{ overflow-x: visible; \}\s*\.payouts-table \.table-head \{ display: none; \}/.test(P), '#9 payouts: ≤640px a payout row is a card (no 640px scroller)');
  ok(/\.date-range input\[type="date"\], \.date-range \.sy-df \{ flex: 1 1 130px; min-width: 0; \}\n\}\n\/\* DeepCode #9/.test(P), '#9 payouts: the original mid-screen block (date-range wrap) is intact and closed before the new one');
  ok(/\.table-scroll tr \{ width: auto; \}/.test(F['expenses.html']), '#9 expenses: card width + margin no longer overflows');
  const D = F['pp-dental.js'];
  ok(/ppDockToothModal\(n\);   \/\* DeepCode #20 \(v562\)[^\n]*\n  openModal\('toothModal'\);/.test(D), '#20 docked BEFORE opening (scrolling still possible)');
  const K = fnSrc(D, 'function ppDockToothModal(');
  ok(/if \(ar > 0\) vis\.push\(cand\[k\]\); if \(ar > best\) \{ best = ar; t = cand\[k\]; \}/.test(K) && /vis\[v\]\.classList\.add\('pp-tooth-sel'\)/.test(K), '#20 the visible tooth (not the hidden perio copy), highlighted whole');
  ok(/\(r\.left \+ r\.width \/ 2\) > window\.innerWidth \/ 2 \? 'pp-dock-left' : 'pp-dock-right'/.test(K), '#20 desktop: panel on the half opposite the tooth');
  ok(/document\.documentElement\.classList\.add\('pp-dock-room'\);/.test(K) && /document\.documentElement\.classList\.remove\('pp-dock-room'\);/.test(K), '#20 mobile: temporary room to lift the lower arch above the sheet, removed on close');
  ok(/if \(m\.classList\.contains\('open'\) \|\| !m\.classList\.contains\('pp-dock'\)\) return;/.test(K), '#20 the close observer never re-triggers itself (no freeze)');
  const C = F['patient-profile.css'];
  ok(/#toothModal\.open\.pp-dock-left  \{ justify-content: flex-end;/.test(C) && /#toothModal\.open\.pp-dock > \.modal-box \{ max-height: 60dvh; \}/.test(C) && /html\.pp-dock-room #ppPage \{ padding-bottom: 62dvh; \}/.test(C), '#20 CSS: side panel · shorter sheet · scroll room');
  const S = F['subscription.html'];
  ok(/<div class="sub-danger" id="subDangerCard" hidden>/.test(S) && /margin-top: 64px;/.test(S) && /\.sub-danger::before \{[^}]*content: "⚠️ منطقة الخطر";/.test(S) && /onclick="window\.subOpenDelete\(\)">حذف حسابي<\/button>/.test(S), '#14 delete card inside a labelled, separated danger zone; behaviour unchanged');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['day sheet cardified', rep('accounting.html', "querySelectorAll('table.providers:not(.ds-table)')", "querySelectorAll('table.providers')")],
  ['labels dropped', rep('accounting.html', "  table.providers.acc-mcards td::before { content:attr(data-label);", "  table.providers.acc-mcards td::before { content:'';")],
  ['payouts still scroll', rep('payouts.html', '  .payouts-table .table-head { display: none; }\n', '')],
  ['mid-screen block broken', rep('payouts.html', "  .date-range input[type=\"date\"], .date-range .sy-df { flex: 1 1 130px; min-width: 0; }\n}\n/* DeepCode #9", "}\n  .date-range input[type=\"date\"], .date-range .sy-df { flex: 1 1 130px; min-width: 0; }\n/* DeepCode #9")],
  ['docked after open', rep('pp-dental.js', "  ppDockToothModal(n);   /* DeepCode #20 (v562) — قبل الفتح: التمريرُ ممكنٌ قبل قفل الصفحة تحت النافذة */\n  openModal('toothModal');", "  openModal('toothModal');\n  ppDockToothModal(n);   /* DeepCode #20 (v562) — قبل الفتح: التمريرُ ممكنٌ قبل قفل الصفحة تحت النافذة */")],
  ['observer loop', rep('pp-dental.js', "if (m.classList.contains('open') || !m.classList.contains('pp-dock')) return;", "if (m.classList.contains('open')) return;")],
  ['same side as tooth', rep('pp-dental.js', "? 'pp-dock-left' : 'pp-dock-right'", "? 'pp-dock-right' : 'pp-dock-left'")],
  ['room never removed', rep('pp-dental.js', "      document.documentElement.classList.remove('pp-dock-room');\n", '')],
  ['danger zone unlabelled', rep('subscription.html', '  content: "⚠️ منطقة الخطر"; position: absolute;', '  position: absolute;')]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-deepcode-ui1: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-deepcode-ui1: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
