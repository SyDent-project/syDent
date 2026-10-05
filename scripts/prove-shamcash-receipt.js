/* v566 — مثبتُ #8 (إيصالُ شام كاش) من ملاحظات Deep Code — مستقل، على الملفات الحيّة.
   (١) M167: payment_ref · receipt_path · قيدُ «واحدٌ على الأقل» لشام كاش · المسارُ بمجلد صاحب الطلب · حاويةٌ خاصة 5MB صور/PDF ·
       سياساتُ التخزين (المستأجرُ مجلدَه · المشرفُ يقرأ) · مرآةُ db/schema.sql.
   (٢) صفحةُ الاشتراك: القسمُ يظهر بشام كاش وحده · الإرسالُ معطّلٌ بلا رقمٍ أو صورةٍ صالحة · الصورةُ تُرفع لمجلد العيادة ثم يُسجَّل مسارُها ·
       فشلُ الإدراج يحذف الإيصالَ اليتيم · رقمُ حساب المنصة من الإعدادات مع زر نسخ.
   (٣) لوحةُ الأدمن: رقمُ العملية بالطلب · «عرض الإيصال» برابطٍ موقَّع قصير · حقلُ رقم الحساب يُحفظ مع تعليمات الدفع.
   التحقق الحيّ (كتلةٌ متراجَعة): بلا إثبات ⇒ مرفوض · برقمٍ ⇒ مقبول · مجلدٌ غريب ⇒ مرفوض · مجلدُه ⇒ مقبول · كاشٌ بلا إثبات ⇒ مقبول.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILES = ['migrations/167_shamcash_receipts.sql', 'migrations/168_shamcash_account_tenant_read.sql', 'db/schema.sql', 'subscription.html', 'admin-settings.js', 'admin.html'];
const base = {}; FILES.forEach(f => base[f] = read(f));
function suite(F) {
  const M = F['migrations/167_shamcash_receipts.sql'];
  ok(/ADD COLUMN IF NOT EXISTS payment_ref  text;/.test(M) && /ADD COLUMN IF NOT EXISTS receipt_path text;/.test(M), '(١) columns');
  ok(/CHECK \(payment_method IS DISTINCT FROM 'sham_cash'\s+OR receipt_path IS NOT NULL\s+OR NULLIF\(btrim\(payment_ref\), ''\) IS NOT NULL\) NOT VALID;/.test(M), '(١) Sham Cash needs a receipt or a reference (DB-enforced)');
  ok(/CHECK \(receipt_path IS NULL OR split_part\(receipt_path, '\/', 1\) = user_id::text\) NOT VALID;/.test(M), '(١) receipt path only inside the requester\'s own folder');
  ok(/VALUES \('payment-receipts', 'payment-receipts', false, 5242880,/.test(M) && /ON CONFLICT \(id\) DO UPDATE SET public = false/.test(M), '(١) private bucket, 5MB, images/PDF');
  ok(/p_receipts_tenant_insert ON storage\.objects FOR INSERT TO authenticated\n  WITH CHECK \(bucket_id = 'payment-receipts' AND \(storage\.foldername\(name\)\)\[1\] = \(SELECT auth\.uid\(\)\)::text\);/.test(M) && /p_receipts_admin_select[\s\S]*?\(SELECT public\.is_platform_admin\(\)\)\);/.test(M) && !/\bTO (anon|public)\b/.test(M), '(١) storage policies: tenant own folder · admin read · no anon');
  ok(/"payment_ref" "text",\n    "receipt_path" "text",/.test(F['db/schema.sql']) && /subscription_requests_shamcash_proof/.test(F['db/schema.sql']) && /subscription_requests_receipt_own_folder/.test(F['db/schema.sql']), '(١) db/schema.sql mirrors');
  const S = F['subscription.html'];
  ok(/box\.hidden = !sham;/.test(S) && /var box = document\.getElementById\('subProof'\), sham = ST\.selMethod === 'sham_cash';/.test(S), '(٢) proof section only for Sham Cash');
  ok(/b\.disabled = !ST\.selMethod \|\| ST\.inFlight \|\| \(ST\.selMethod === 'sham_cash' && !proofState\(\)\.ok\);/.test(S) && /ok: !!\(ref \|\| \(f && !fileErr\)\)/.test(S), '(٢) submit disabled without a reference or a valid file');
  ok(/RECEIPT_MAX = 5 \* 1024 \* 1024;/.test(S) && /RECEIPT_TYPES = \/\^\(image\\\/\(jpeg\|png\|webp\|heic\|heif\)\|application\\\/pdf\)\$\/;/.test(S), '(٢) client limits match the bucket');
  ok(/var _path = ST\.user\.id \+ '\/' \+ Date\.now\(\)/.test(S) && /storage\.from\('payment-receipts'\)\.upload\(_path, _proof\.file/.test(S) && /payload\.receipt_path = _path;/.test(S), '(٢) upload into the clinic\'s own folder, then the path is recorded');
  ok(/if \(res\.error && _uploaded\) \{ try \{ await window\.sb\.storage\.from\('payment-receipts'\)\.remove\(\[_uploaded\]\); \}/.test(S), '(٢) failed insert removes the orphan receipt');
  ok(/'shamcash_account'\]\)/.test(S) && /window\.subCopyShamAcc = function/.test(S), '(٢) platform account shown with a copy button');
  ok(/'payment_instructions_ar'::text, 'shamcash_account'::text\]\)\);/.test(F['migrations/168_shamcash_account_tenant_read.sql']) && /'payment_instructions_ar'::"text", 'shamcash_account'::"text"\]\)\)\);/.test(F['db/schema.sql']), '(٢) M168: the tenant read policy actually lets the clinic read the account (review finding)');
  const A = F['admin-settings.js'];
  ok(/rقم العملية|رقم العملية: <b dir="ltr">' \+ srqEsc\(req\.payment_ref\)/.test(A) && /onclick="srqViewReceipt\(/.test(A), '(٣) admin card: reference + view receipt');
  ok(/createSignedUrl\(req\.receipt_path, 120\)/.test(A), '(٣) receipt opened through a short-lived signed URL');
  ok(/key: 'shamcash_account', value: _acc/.test(A) && /id="psShamcashAccount"/.test(F['admin.html']), '(٣) account editable in platform settings');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['proof optional in DB', rep('migrations/167_shamcash_receipts.sql', "             OR NULLIF(btrim(payment_ref), '') IS NOT NULL) NOT VALID;", "             OR TRUE) NOT VALID;")],
  ['bucket public', rep('migrations/167_shamcash_receipts.sql', "VALUES ('payment-receipts', 'payment-receipts', false, 5242880,", "VALUES ('payment-receipts', 'payment-receipts', true, 5242880,")],
  ['any folder writable', rep('migrations/167_shamcash_receipts.sql', "  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);", "  WITH CHECK (bucket_id = 'payment-receipts');")],
  ['submit without proof', rep('subscription.html', " || (ST.selMethod === 'sham_cash' && !proofState().ok);", ';')],
  ['orphan kept', rep('subscription.html', "      if (res.error && _uploaded) { try { await window.sb.storage.from('payment-receipts').remove([_uploaded]); } catch (eRm) {} }", '')],
  ['tenant cannot read the account', rep('migrations/168_shamcash_account_tenant_read.sql', ", 'shamcash_account'::text]", "]")],
  ['public URL to receipts', rep('admin-settings.js', "createSignedUrl(req.receipt_path, 120)", "getPublicUrl(req.receipt_path)")]
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
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-shamcash-receipt: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-shamcash-receipt: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
