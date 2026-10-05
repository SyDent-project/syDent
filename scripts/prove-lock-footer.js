/* v556 — مثبتُ تذييل القائمة بعد «تبديل الموظف» (DeepCode #5 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   الخلل: بعد التبديل لطبيب/سكرتيرة بقي اسمُ المالك (صاحبُ حساب الدخول) أسفل القائمة.
   (١) refreshHeaderButton يكتب اسمَ الشخص الفعّال + دورَه بالتذييل لغير المالك (عُقدٌ نصّية — لا حقن)، حتى بلا زرّ رأس.
   (٢) القائمة لا تكتب اسمَ المالك فوق موظفٍ فعّال: دورُه مؤقتاً ثم الاسم؛ المالكُ كما كان.
   (٣) سلوكياً بـvm على الكتلة الحيّة: مالك ⇒ اسمُ الحساب · طبيب ⇒ اسمُه ودوره · اسمٌ فيه وسوم ⇒ نصٌّ حرفي.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const base = { 'sidebar.js': read('sidebar.js'), 'supabase-init.js': read('supabase-init.js') };
function suite(F) {
  const I = F['supabase-init.js'], S = F['sidebar.js'];
  const rh = I.slice(I.indexOf('function refreshHeaderButton(btn) {'), I.indexOf('// ── A11y enhancer for the lock modal'));
  ok(/if \(!btn && !document\.getElementById\('sbDoctorName'\)\) return;/.test(rh) && !/\n    if \(!btn\) return;\n    var role/.test(rh), '(١) the label is computed even without a header button');
  const iFoot = rh.indexOf("var foot = document.getElementById('sbDoctorName');"), iRet = rh.indexOf('    if (!btn) return;\n    if (inactive)');
  ok(iFoot > rh.indexOf('var label') && iRet > iFoot, '(١) footer written after the label is resolved, before the button-only part');
  ok(/if \(foot && !ownerMode\) \{\s*foot\.textContent = '';\s*foot\.appendChild\(document\.createTextNode\(label\)\);\s*foot\.appendChild\(document\.createElement\('br'\)\);\s*foot\.appendChild\(document\.createTextNode\(ROLE_LABELS\[role\] \|\| ''\)\);\s*foot\.setAttribute\('data-sy-person', role\);/.test(rh), '(١) staff only · text nodes (no HTML injection) · marked as resolved');
  const blk = S.slice(S.indexOf("  const nameEl = document.getElementById('sbDoctorName');"), S.indexOf('  // Clinic name in the brand sub-line.'));
  ok(!/\.innerHTML\s*=/.test(blk), '(٢) the sidebar no longer writes the name as HTML');
  ok(/if \(nameEl && !\(_staff && nameEl\.hasAttribute\('data-sy-person'\)\)\)/.test(blk), '(٢) never overwrites a resolved staff name with the owner\'s');
  /* (٣) سلوكياً */
  function mkDom() {
    const el = { kids: [], attrs: {}, set textContent(v) { this.kids = v ? [{ t: v }] : []; }, get text() { return this.kids.map(k => k.t === undefined ? '\n' : k.t).join(''); },
      appendChild(n) { this.kids.push(n); }, hasAttribute(a) { return a in this.attrs; }, setAttribute(a, v) { this.attrs[a] = v; } };
    return { el, doc: { getElementById: id => id === 'sbDoctorName' ? el : null, createTextNode: t => ({ t: String(t) }), createElement: () => ({}) } };
  }
  function runSidebar(lock) {
    const { el, doc } = mkDom();
    const ctx = { document: doc, window: { SyDentLock: lock }, name: 'د. صاحب الحساب', role: 'طبيب أسنان' };
    vm.createContext(ctx); vm.runInContext(blk, ctx); return el;
  }
  let el = runSidebar(null);
  ok(el.text === 'د. صاحب الحساب\nطبيب أسنان', '(٣) no lock ⇒ account owner name + title, as before');
  el = runSidebar({ isOwner: () => true, getRole: () => 'owner', ROLE_LABELS: { owner: 'المالك' } });
  ok(el.text === 'د. صاحب الحساب\nطبيب أسنان', '(٣) owner on the device ⇒ unchanged');
  let refreshed = 0;
  el = runSidebar({ isOwner: () => false, getRole: () => 'doctor', ROLE_LABELS: { doctor: 'الطبيب' }, refreshHeaderButton: () => { refreshed++; } });
  ok(el.text === 'الطبيب' && refreshed === 1 && el.text.indexOf('صاحب الحساب') < 0, '(٣) switched doctor ⇒ role placeholder (never the owner\'s name) and a name refresh');
  const fb = rh.slice(iFoot, iRet);
  function runFoot(ownerMode, label, role) {
    const { el, doc } = mkDom(); const ctx = { document: doc, ownerMode, label, role, ROLE_LABELS: { doctor: 'الطبيب', secretary: 'السكرتيرة' } };
    vm.createContext(ctx); vm.runInContext(fb, ctx); return el;
  }
  el = runFoot(false, 'د. ريم <b>X</b>', 'doctor');
  ok(el.text === 'د. ريم <b>X</b>\nالطبيب' && el.attrs['data-sy-person'] === 'doctor' && el.kids[0].t === 'د. ريم <b>X</b>', '(٣) doctor ⇒ own name + role, tags kept as literal text');
  el = runFoot(true, 'د. أيهم', 'owner');
  ok(el.kids.length === 0 && !('data-sy-person' in el.attrs), '(٣) owner ⇒ the header refresh leaves the footer alone');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['footer still owner-only', rep('supabase-init.js', '    if (foot && !ownerMode) {', '    if (foot && ownerMode) {')],
  ['name injected as HTML', rep('supabase-init.js', '      foot.appendChild(document.createTextNode(label));', "      foot.innerHTML = label;")],
  ['no footer without a header button', rep('supabase-init.js', "    if (!btn && !document.getElementById('sbDoctorName')) return;", '    if (!btn) return;')],
  ['sidebar overwrites the staff name', rep('sidebar.js', "  if (nameEl && !(_staff && nameEl.hasAttribute('data-sy-person'))) {", '  if (nameEl) {')],
  ['sidebar shows the owner to staff', rep('sidebar.js', "    const _line1 = _staff ? ((_L.ROLE_LABELS && _L.ROLE_LABELS[_L.getRole()]) || '') : name;", '    const _line1 = name;')],
  ['sidebar back to innerHTML', rep('sidebar.js', "    nameEl.textContent = '';\n    nameEl.appendChild(document.createTextNode(_line1));", "    nameEl.innerHTML = _line1;")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lock-footer: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-lock-footer: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
