/* v528 — مثبتُ ورقة طلب المخبر (lab-slip.js) — مستقل، على الملفات الحيّة.
   (١) الأسنان: FDI صالحة فقط · بلا تكرار · مرتّبة · الفاصلةُ العربية · مخططُ الدائم/اللبني والمختارة ·
       أسنانُ الدفعة المحفوظة (المريض+المخبر+العمل+لحظة الإنشاء) وحقلُ السن لغير الدفعة;
   (٢) المحتوى: ترويسةُ العيادة · الطبيب · الترخيص (يتبع إعداد الروشتة M115) · الهاتف · رقمُ الطلب · المريض والمخبر ·
       العمل · اللون · الإرسال · «مطلوب قبل» · التعليمات · الإعادة — **مهرَّبٌ كلُّه** و**بلا تكلفة ولا هاتف مريض**;
   (٣) الطباعة: الحقولُ ناقصة ⇒ رسالةٌ ولا طباعة · وإلا الجذرُ ثم الصنفُ ثم print() متزامناً (بلا await — iOS);
   (٤) الترويسة تُجلب مرةً مسبقاً; (٥) الربط بالسطحين + theme.css + cache-bust.
   --self-test: 9 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const log = [];
  const fields = { labOrderWorkType: { value: 'crown', options: [{ text: 'تاج زيركون (معطل)' }], selectedIndex: 0 }, labOrderProvider: { value: 'd1', options: [{ text: 'د. مجد' }], selectedIndex: 0 },
    labOrderTooth: { value: '36' }, labOrderShade: { value: 'A2' }, labOrderDateSent: { value: '2026-09-29' }, labOrderDateDue: { value: '2026-10-04' }, labOrderNotes: { value: 'حواف كتف 1مم\n<script>x</script>' } };
  let root = null, bodyCls = [];
  const doc = { getElementById: id => (id === 'lslPrintRoot' ? root : fields[id] || null),
    createElement: () => ({ id: '', innerHTML: '' }), body: { appendChild(e) { root = e; log.push('root'); }, classList: { add(c) { bodyCls.push(c); log.push('class'); }, remove(c) { bodyCls = bodyCls.filter(x => x !== c); } } } };
  const win = { addEventListener() {}, removeEventListener() {}, print() { log.push('print:' + (root ? root.innerHTML.length : 0) + ':' + bodyCls.join()); } };
  let toast = '';
  const ctx = { window: win, document: doc, console: { warn() {} }, setTimeout() {}, showToast: m => { toast = m; }, String, Number, Date, Array, Object, parseInt, JSON, RegExp };
  vm.createContext(ctx); vm.runInContext(F['lab-slip.js'], ctx);
  const S = win.SyLabSlip;
  /* (١) */
  ok(JSON.stringify(S.parseTeeth('23، 22 24,22 19 90 10 0 55')) === '[22,23,24,55]', 'parseTeeth: valid FDI only, deduped, sorted, Arabic comma');
  const orders = [{ id: 'a', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T1', tooth_num: 24 },
                  { id: 'b', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T1', tooth_num: 22 },
                  { id: 'c', patient_id: 'p', lab_id: 'L', treatment_key: 'bridge', created_at: 'T2', tooth_num: 11 }];
  ok(JSON.stringify(S.batchTeeth(orders, 'a')) === '[22,24]' && JSON.stringify(S.batchTeeth(orders, 'c')) === '[11]', 'batchTeeth: same insert only');
  let d = S.fromForm({ patientName: 'سامي', orderId: '4fa1ad91-d3c7', orders });
  ok(JSON.stringify(d.teeth) === '[36]' && d.orderNo === '4FA1AD91' && d.workType === 'تاج زيركون' && d.providerName === 'د. مجد', 'fromForm: single order uses the tooth field · order no · inactive suffix stripped');
  d = S.fromForm({ patientName: 'سامي', orderId: 'a', orders });
  ok(JSON.stringify(d.teeth) === '[22,24]', 'fromForm: a saved batch prints all its teeth');
  const hp = S.build({ teeth: [16, 21] }), hd = S.build({ teeth: [55] });
  ok(/<td class="lsl-t on">16<\/td>/.test(hp) && /<td class="lsl-t on">21<\/td>/.test(hp) && /<td class="lsl-t mid">11<\/td>/.test(hp) && !/>55</.test(hp) && /<td class="lsl-t on">55<\/td>/.test(hd) && !/>18</.test(hd),
     'chart: permanent/deciduous rows, selected teeth marked, midline');
  /* (٢) */
  S._setClinic({ clinic_name: 'عيادة <b>', clinic_phone: '011-222', license_no: 'L-9' });
  d = S.fromForm({ patientName: '<img src=x onerror=1>', lab: { name: 'مخبر الشام', phone: '0911' }, orderId: 'a1b2', redo: [{ reason: 'اللون غير مطابق' }, { reason: 'حواف <i>' }] });
  const h = S.build(d);
  ok(h.indexOf('<img') === -1 && h.indexOf('&lt;img') > -1 && h.indexOf('<script>') === -1 && h.indexOf('عيادة &lt;b&gt;') > -1 && h.indexOf('<i>') === -1, 'build: every free text escaped');
  ok(/د\. مجد/.test(h) && /رقم الترخيص: L-9/.test(h) && /011-222/.test(h) && /#A1B2/.test(h) && /مخبر الشام/.test(h) && /0911/.test(h) && /تاج زيركون/.test(h) && />A2</.test(h) && /29\/9\/2026/.test(h) && /class="lsl-due">4\/10\/2026/.test(h),
     'build: clinic, doctor, licence, phone, order no, lab, work, shade, sent, due');
  ok(/حواف كتف 1مم/.test(h) && /lsl-pre/.test(h) && /إعادة \(المرة 2\)<\/strong>: حواف &lt;i&gt;/.test(h) && /استلام المخبر/.test(h), 'build: instructions (line breaks kept), latest redo reason, signatures');
  ok(!/التكلفة|ل\.س|\$/.test(h) && !/0933/.test(h), 'build: no cost and no patient phone on the slip');
  /* (٣) */
  root = null; log.length = 0; toast = '';
  ok(S.print(S.fromForm({ patientName: '' })) === false && log.length === 0 && /المريض/.test(toast), 'print: missing patient ⇒ message, no print');
  fields.labOrderWorkType.value = ''; toast = '';
  ok(S.print(S.fromForm({ patientName: 'سامي' })) === false && /نوع العمل/.test(toast), 'print: missing work ⇒ message, no print');
  fields.labOrderWorkType.value = 'crown';
  ok(S.print(S.fromForm({ patientName: 'سامي' })) === true && log[0] === 'root' && log[1] === 'class' && /^print:\d{3,}:lsl-printing$/.test(log[2]), 'print: root filled, body class set, then print() — synchronously ' + JSON.stringify(log));
  ok(!/await/.test(fnSrc(F['lab-slip.js'], '  function print(d) {').replace(/\/\*[\s\S]*?\*\//g, '')), 'print: no await inside (iOS user activation)');
  /* (٤) */
  let calls = 0;
  const sbC = on => ({ from() { calls++; const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return Promise.resolve({ data: { clinic_name: 'ع', clinic_phone: '1', license_no: 'L', license_no_on_rx: on }, error: null }); } }; return q; } });
  const ctx2 = { window: {}, document: doc, console: { warn() {} }, String, Number, Date, Array, Object, parseInt, JSON, RegExp, setTimeout() {} };
  vm.createContext(ctx2); vm.runInContext(F['lab-slip.js'], ctx2);
  await ctx2.window.SyLabSlip.prefetch(sbC(false), 'u'); await ctx2.window.SyLabSlip.prefetch(sbC(false), 'u');
  ok(calls === 1 && !/رقم الترخيص/.test(ctx2.window.SyLabSlip.build(ctx2.window.SyLabSlip.fromForm({ patientName: 'x' }))), 'prefetch: once per page · licence hidden when the prescription setting hides it (M115)');
  /* (٥) */
  for (const [page, js] of [['labs.html', 'labs.html'], ['patient-profile.html', 'pp-clinical.js']]) {
    const P = F[page], J = F[js];
    const a = P.indexOf('<script src="lab-slip.js?v='), b = P.indexOf('<script src="lab-due.js?v=');
    ok(a > b && b > -1 && /<button type="button" class="lsl-btn" onclick="labSlipPrint\(\)">🖨️ طباعة ورقة الطلب للمخبر<\/button>/.test(P) && !/id="lsl/.test(P), page + ': print button in the lab modal + script loaded');
    const fp = fnSrc(J, 'function labSlipPrint() {');
    ok(/SyLabSlip\.print\(SyLabSlip\.fromForm\(\{/.test(fp) && /orders: (allOrders|labOrders)/.test(fp) && /SyLabRedo\.list\(id\)/.test(fp) && !/await/.test(fp), js + ': labSlipPrint passes batch orders + redo history, no await');
    ok(/SyLabSlip\.prefetch\(window\.sb, currentUser\.id\)/.test(fnSrc(J, 'function labDueOpen(isNew) {')), js + ': header prefetched when the modal opens');
  }
  const T = F['theme.css'];
  ok(/body\.lsl-printing > \*:not\(#lslPrintRoot\) \{ display: none !important; \}/.test(T) && /#lslPrintRoot \{ display: none; \}/.test(T), 'theme.css: slip printed alone, hidden on screen');
  ok(/lab-slip\\\.js/.test(F['scripts/cache-bust.sh']), 'cache-bust: lab-slip.js in the allow-list');
}

const FILES = ['lab-slip.js', 'labs.html', 'patient-profile.html', 'pp-clinical.js', 'theme.css', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['patient name unescaped', rep('lab-slip.js', "esc(d.patientName || '—')", "(d.patientName || '—')")],
  ['licence ignores the setting', rep('lab-slip.js', "(s.license_no_on_rx !== false) ? (s.license_no || '') : ''", "(s.license_no || '')")],
  ['prints without a patient', rep('lab-slip.js', "if (!d.patientName) return 'اختر المريض أولاً';", '')],
  ['deciduous chart never used', rep('lab-slip.js', 'var kids = teeth.some(function (t) { return t >= 51; });', 'var kids = false;')],
  ['batch ignored', rep('lab-slip.js', 'var teeth = bt.length > 1 ? bt :', 'var teeth =')],
  ['invalid teeth kept', rep('lab-slip.js', 'n % 10 >= 1 && n % 10 <= 8 && ', '')],
  ['prefetch every click', rep('lab-slip.js', 'if (clinic || loading || !sb || !uid) return loading;', 'if (!sb || !uid) return loading;')],
  ['slip not isolated in print', rep('theme.css', 'body.lsl-printing > *:not(#lslPrintRoot) { display: none !important; }', '')],
  ['profile header not prefetched', rep('pp-clinical.js', "  if (window.SyLabSlip && currentUser) SyLabSlip.prefetch(window.sb, currentUser.id);   /* v528: ترويسةُ الورقة مسبقاً (print متزامن — iOS) */\n", '')]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lab-slip: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-slip: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
