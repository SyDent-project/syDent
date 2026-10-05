/* v559 — مثبتُ #13 (الهواتف) من ملاحظات Deep Code — مستقل، على الملفات الحيّة.
   (١) SyDentPhone.tidy/isPlausible (بـvm): أرقامٌ عربية ⇒ لاتينية · +963/00963/963 ⇒ محلي · 9 خانات ⇒ 0… · دوليٌّ ⇒ +أرقام ·
       لا إتلافَ لما لا يُفهم · المخرجُ يقبله مُطبِّعُ الواتساب الحيّ (book.html normalizePhone).
   (٢) التوحيدُ عند كل حفظ: إضافة/تعديل مريض · تعديلُ بطاقة المريض · استيرادُ CSV · المخبر (صفحةً ومن البطاقة).
   (٣) التلميحات (بـvm على prmPhoneHint الحيّة): رقمٌ مريب ⇒ تنبيه · رقمٌ مشترك ⇒ معلومة + خانةُ ربط العائلة (إضافةً فقط) ·
       الاسمُ + الميلاد ⇒ تحذيرُ «قد يكون نفسه» · كلُّه مهرَّب · **ولا يمنع الحفظ أبداً**.
   (٤) العرض: الرقمُ بعزلٍ اتجاهيّ LTR بالقائمة والبطاقة (لا «مقلوب»).
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  const j = src.indexOf('{', i); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const FILES = ['supabase-init.js', 'patients.html', 'patient-profile.html', 'labs.html', 'pp-clinical.js', 'book.html'];
const base = {}; FILES.forEach(f => base[f] = read(f));
function suite(F) {
  const I = F['supabase-init.js'];
  const blk = I.slice(I.indexOf('window.SyDentPhone = (function'), I.indexOf('/* DeepCode #11 (v558):'));
  const w = {}; try { vm.runInNewContext(blk, { window: w }); } catch (e) {}
  const P = w.SyDentPhone;
  const T = [['0933 123 456', '0933123456', true], ['+963 933 123456', '0933123456', true], ['00963933123456', '0933123456', true], ['963933123456', '0933123456', true],
    ['933123456', '0933123456', true], ['+٤٩١٥٧٣٤٨٤٨٤١٨', '+4915734848418', true], ['٠٩٣٣١٢٣٤٥٦', '0933123456', true], ['011 2233445', '0112233445', true],
    ['09877663443', '09877663443', false], ['abc', 'abc', false], ['', '', false]];
  ok(!!P && T.every(([a, b, pl]) => P.tidy(a) === b && P.isPlausible(P.tidy(a)) === pl), '(١) tidy/isPlausible truth table (Arabic digits · +963/00963/963 · 9 digits · intl · landline · untouched junk)');
  const B = F['book.html']; const nf = fnSrc(B, 'function normalizePhone(raw){');
  let norm = null; try { norm = new Function(nf + ';return normalizePhone;')(); } catch (e) {}
  ok(norm && norm('0933123456') === '963933123456' && norm('+4915734848418') === '4915734848418', '(١) tidied output stays WhatsApp-ready (live normalizer)');
  /* (٢) */
  const PT = F['patients.html'], PP = F['patient-profile.html'];
  ok(/const phone     = \(window\.SyDentPhone \? window\.SyDentPhone\.tidy\(document\.getElementById\('fPhone'\)\.value\)/.test(PT), '(٢) add/edit patient saves the tidied number');
  ok(/phone = window\.SyDentPhone \? window\.SyDentPhone\.tidy\(g\(iPhone\)\) : g\(iPhone\);/.test(PT), '(٢) CSV import tidies');
  ok(/phone:\s+\(window\.SyDentPhone \? window\.SyDentPhone\.tidy\(document\.getElementById\('ePhone'\)\.value\)/.test(PP), '(٢) profile edit tidies');
  ok(/var phone = window\.SyDentPhone \? window\.SyDentPhone\.tidy\(document\.getElementById\('labModalPhone'\)\.value\)/.test(F['labs.html']) && /var phone = window\.SyDentPhone \? window\.SyDentPhone\.tidy\(document\.getElementById\('ppLabPhone'\)\.value\)/.test(F['pp-clinical.js']), '(٢) labs (page + from the profile) tidy');
  /* (٣) */
  const code = [fnSrc(PT, 'function prmEsc('), fnSrc(PT, 'function _prmNameKey('), fnSrc(PT, 'function prmPhoneHint(')].join('\n');
  function hint(vals, pts, editing) {
    const box = { hidden: true, innerHTML: '' }, els = { fPhoneHint: box, fPhone: { value: vals.phone }, fName: { value: vals.name || '' }, fDob: { value: vals.dob || '' } };
    const ctx = { window: { SyDentPhone: P }, patients: pts, editingId: editing || null, String, document: { getElementById: id => els[id] || null } };
    vm.createContext(ctx); vm.runInContext(code + '\nprmPhoneHint();', ctx); return box;
  }
  const PTS = [{ id: 'a', name: 'هدى علي', phone: '+963 933 123456', dob: '1990-05-01', local_id: 'P001' }, { id: 'b', name: 'سامي <b>x</b>', phone: '0944000000', local_id: 'P002' }];
  let b = hint({ phone: '0933123456' }, PTS);
  ok(!b.hidden && /مسجَّل أيضاً عند: هدى علي — طبيعيٌّ لأفراد العائلة/.test(b.innerHTML) && /id="fFamLink" value="a"/.test(b.innerHTML), '(٣) shared number (after tidying) ⇒ family note + link option on add');
  b = hint({ phone: '0933123456' }, PTS, 'z');
  ok(/طبيعيٌّ لأفراد العائلة/.test(b.innerHTML) && !/fFamLink/.test(b.innerHTML), '(٣) on edit: note only, no link option');
  b = hint({ phone: '09877663443' }, PTS);
  ok(/الرقم يبدو ناقصاً/.test(b.innerHTML) && /يُحفظ كما هو/.test(b.innerHTML), '(٣) implausible number ⇒ soft warning that still allows saving');
  b = hint({ phone: '0955555555', name: 'هُدى  علي', dob: '1990-05-01' }, PTS);
  ok(/يوجد مريضٌ بالاسم نفسه وتاريخ الميلاد نفسه \(P001\)/.test(b.innerHTML), '(٣) same name (normalised) + same DOB ⇒ «may be the same patient»');
  b = hint({ phone: '0955555555', name: 'هدى علي', dob: '2001-01-01' }, PTS);
  ok(!/بالاسم نفسه/.test(b.innerHTML), '(٣) same name, different DOB ⇒ not flagged');
  b = hint({ phone: '0944000000' }, PTS);
  ok(/سامي &lt;b&gt;x&lt;\/b&gt;/.test(b.innerHTML) && !/<b>x<\/b>/.test(b.innerHTML), '(٣) names escaped');
  b = hint({ phone: '0955555555' }, PTS);
  ok(b.hidden === true && b.innerHTML === '', '(٣) nothing to say ⇒ hidden');
  const sub = fnSrc(PT, 'async function submitPatient(');
  ok(!/prmPhoneHint|isPlausible|fPhoneHint/.test(sub.replace(/const _famWith[^\n]*\n/, '')) && /if \(_famWith && newPat\) \{ try \{ await prmLinkFamily\(newPat\.id, _famWith\); \}/.test(sub), '(٣) the save path never consults the hints (never blocks); family link applied after insert');
  /* (٤) */
  ok(/<td class="text-muted"><bdi dir="ltr">\$\{prmEsc\(p\.phone \|\| '—'\)\}<\/bdi><\/td>/.test(PT) && /id="iPhone" dir="ltr"/.test(PP) && /<span dir="ltr">' \+ escapeHtml\(patient\.phone\)/.test(PP), '(٤) numbers shown LTR-isolated in the list, info panel and header');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['Arabic digits kept', rep('supabase-init.js', "    s = s.replace(/[\\u0660-\\u0669]/g", "    s = s.replace(/[\\u0000-\\u0000]/g")],
  ['+963 not localised', rep('supabase-init.js', "      return n.indexOf('963') === 0 ? '0' + n.slice(3) : '+' + n;", "      return '+' + n;")],
  ['junk destroyed', rep('supabase-init.js', '    if (!d) return s;\n', "    if (!d) return '';\n")],
  ['profile saves raw', rep('patient-profile.html', "(window.SyDentPhone ? window.SyDentPhone.tidy(document.getElementById('ePhone').value) : document.getElementById('ePhone').value.trim())", "document.getElementById('ePhone').value.trim()")],
  ['labs save raw', rep('labs.html', "var phone = window.SyDentPhone ? window.SyDentPhone.tidy(document.getElementById('labModalPhone').value) : document.getElementById('labModalPhone').value.trim();", "var phone = document.getElementById('labModalPhone').value.trim();")],
  ['shared number blocks save', rep('patients.html', "  const btn = document.getElementById('saveBtn');\n  btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';", "  if (document.getElementById('fPhoneHint') && !document.getElementById('fPhoneHint').hidden) return;\n  const btn = document.getElementById('saveBtn');\n  btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';")],
  ['names unescaped', rep('patients.html', "return prmEsc(p.name || '—'); }).join('، ')", "return (p.name || '—'); }).join('، ')")],
  ['twin check ignores DOB', rep('patients.html', " && (!dob || !p.dob || String(p.dob).slice(0, 10) === dob)", '')],
  ['list shows bidi-raw', rep('patients.html', "<bdi dir=\"ltr\">${prmEsc(p.phone || '—')}</bdi>", "${prmEsc(p.phone || '—')}")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-phone-tidy: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-phone-tidy: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
