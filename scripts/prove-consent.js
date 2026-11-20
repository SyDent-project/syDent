/* M219 — مثبتُ موافقات العلاج (الأساس): tx-consent.js · treatments.html · الهجرة — على الملفات الحيّة.
   (١) الهجرة: جدولان بعزل المالك وبوابة الاشتراك · لا سياسةَ anon · حذفُ الموقَّع ممنوع بالسياسة · زنادٌ يرفض
       الإدراجَ غير المعلَّق وتعديلَ الموقَّع والتوقيعَ من غير بابه (والبابُ غيرُ المضبوط = مغلق) · consent_sync
       للمالك بوصولٍ كامل فقط · الداخليةُ مسحوبةٌ من الجميع · الخطةُ المعتمدة وحدها وبلا زيارات المتابعة.
   (٢) الموديول بـvm على DOM وقاعدةٍ وهميين: المكتبةُ تملأ النص عند أول فتح · المحفوظُ يغلب المكتبة · الحفظُ
       upsert بمفتاح العلاج ونطاق المالك · الإيقافُ يحذف صفَّ العيادة وحده · التحقّقُ يسبق الشبكة · وضعُ القراءة
       يمنع الفتح والحفظ · الجدولُ الغائب يُخفي الميزة بلا خطأ.
   (٣) الصفحة: الموديول محمَّل مرةً بتوكن الفليت · الزرُّ والشارةُ مشروطان بتوفّر الميزة · التحميلُ لا يؤخّر الرسم.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILES = ['migrations/219_consent_forms.sql', 'tx-consent.js', 'treatments.html', 'scripts/cache-bust.sh', 'scripts/db-bootstrap.py'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => { const o = Object.assign({}, F); o[f] = F[f].split(a).join(b); return o; };

/* DOM + قاعدة وهميان للموديول */
function mkEnv(F, opt) {
  opt = opt || {};
  const els = {};
  const el = id => els[id] || (els[id] = { id, value: '', checked: false, textContent: '', disabled: false, style: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } });
  const calls = [], toasts = [], audit = [];
  let rows = (opt.rows || []).slice();
  const q = table => {
    const st = { table, op: 'select', filters: {}, payload: null, opts: null };
    const api = {
      select() { if (st.op === 'select') st.cols = arguments[0]; return api; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(k, v) { st.filters[k] = v; return api; },
      single() { return api.then(x => x); },
      then(res, rej) {
        calls.push(st);
        let out;
        if (opt.missing) out = { data: null, error: { code: '42P01', message: 'relation "public.consent_templates" does not exist' } };
        else if (opt.failWrite && st.op !== 'select') out = { data: null, error: { message: 'network' } };
        else if (st.op === 'select') out = { data: rows.filter(r => r.owner_id === st.filters.owner_id), error: null };
        else if (st.op === 'upsert') {
          const i = rows.findIndex(r => r.owner_id === st.payload.owner_id && r.treatment_key === st.payload.treatment_key);
          const row = Object.assign({ id: i > -1 ? rows[i].id : 'new-' + rows.length }, st.payload);
          if (i > -1) rows[i] = row; else rows.push(row);
          out = { data: row, error: null };
        } else { rows = rows.filter(r => !(r.id === st.filters.id && r.owner_id === st.filters.owner_id)); out = { data: null, error: null }; }
        return Promise.resolve(out).then(res, rej);
      }
    };
    return api;
  };
  const w = {
    sb: { from: q }, showToast: m => toasts.push(m), logAudit: (a, o) => audit.push([a, o]), render: () => { w._renders = (w._renders || 0) + 1; },
    SyDentSub: { blockReadOnly: () => !!opt.readOnly }
  };
  const ctx = { window: w, document: { getElementById: el }, console: { error() {}, warn() {}, log() {} },
    currentDoctor: { id: 'own-1' },
    treatments: [{ id: 't1', treatment_key: 'extracted', name: 'قلع', category: 'surgical' }, { id: 't2', treatment_key: 'custom_9', name: 'حشوة', category: 'restorative' },
                 { id: 't3', treatment_key: 'implant', name: 'زراعة', category: 'implantology' }] };
  vm.createContext(ctx);
  vm.runInContext(F['tx-consent.js'], ctx);
  return { w, els, el, calls, toasts, audit, rows: () => rows };
}

async function suite(F) {
  const M = F['migrations/219_consent_forms.sql'], J = F['tx-consent.js'], T = F['treatments.html'];

  /* (١) الهجرة */
  ok(/CREATE POLICY consent_templates_owner_all ON public\.consent_templates\s+USING \(owner_id = \(SELECT auth\.uid\(\)\)\)\s+WITH CHECK \(owner_id = \(SELECT auth\.uid\(\)\)\);/.test(M)
     && /SELECT public\._sub_guard_table\('public\.consent_templates'\);/.test(M) && /SELECT public\._sub_guard_table\('public\.patient_consents'\);/.test(M),
     'migration: owner-only RLS + subscription gate on both tables');
  ok(!/TO anon|FOR SELECT\s+USING \(true\)/.test(M.replace(/GRANT EXECUTE[^;]*;/g, '')) && !/GRANT[^;]*\banon\b/.test(M), 'migration: no anon policy and no anon grant');
  ok(/CREATE POLICY patient_consents_owner_delete ON public\.patient_consents FOR DELETE\s+USING \(owner_id = \(SELECT auth\.uid\(\)\) AND status <> 'signed'\);/.test(M),
     'migration: a signed consent cannot be deleted through the API');
  ok(/v_door BOOLEAN := COALESCE\(current_setting\('sydent\.consent_sign', true\) = '1', false\);/.test(M), 'migration: an unset signing door reads as closed (NULL-safe)');
  ok(/IF NEW\.status <> 'pending' OR NEW\.signed_at IS NOT NULL OR NEW\.signature IS NOT NULL\s+OR NEW\.signer_name IS NOT NULL OR NEW\.voided_at IS NOT NULL THEN\s+RAISE EXCEPTION 'consent_insert_pending_only';/.test(M),
     'migration: inserts are pending-only');
  const iImm = M.indexOf("RAISE EXCEPTION 'consent_signed_immutable'"), iDoor = M.indexOf("RAISE EXCEPTION 'consent_sign_door_only'");
  ok(/IF OLD\.status = 'signed' THEN\s+RAISE EXCEPTION 'consent_signed_immutable';/.test(M) && /IF NEW\.status = 'signed' AND NOT v_door THEN\s+RAISE EXCEPTION 'consent_sign_door_only';/.test(M) && iImm > -1 && iImm < iDoor,
     'migration: a signed row is frozen, and signing needs the door');
  ok(/CREATE TRIGGER trg_patient_consents_guard BEFORE INSERT OR UPDATE ON public\.patient_consents/.test(M), 'migration: the guard runs on insert and update');
  ok(/patient_consents_signed_shape CHECK \(\s+\(status = 'signed' AND signed_at IS NOT NULL AND signature IS NOT NULL AND signer_name IS NOT NULL\)\s+OR \(status <> 'signed' AND signed_at IS NULL AND signature IS NULL\)\)/.test(M),
     'migration: signed ⇔ signature + time + signer');
  ok(/REVOKE ALL ON FUNCTION public\._consent_sync\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(M)
     && /REVOKE ALL ON FUNCTION public\.consent_sync\(uuid\) FROM PUBLIC, anon;\s+GRANT EXECUTE ON FUNCTION public\.consent_sync\(uuid\) TO authenticated;/.test(M),
     'migration: the internal sync is closed to everyone; the door is authenticated-only');
  ok(/IF public\.tenant_access_level\(v_uid\) <> 'full' THEN RETURN 0; END IF;\s+RETURN public\._consent_sync\(v_uid, p_patient\);/.test(M), 'migration: the clinic door acts as auth.uid() and only with full access');
  ok(/PERFORM 1 FROM public\.patients p WHERE p\.id = p_patient AND p\.doctor_id = p_owner;\s+IF NOT FOUND THEN RETURN 0; END IF;/.test(M), 'migration: the sync refuses a patient that is not the owner\'s');
  ok((M.match(/AND s\.parent_id IS NULL/g) || []).length === 2 && (M.match(/\(v_opts <= 1 OR s\.plan_option IS NULL OR s\.plan_option NOT BETWEEN 1 AND 3\)/g) || []).length === 2,
     'migration: follow-up visits and unadopted alternatives never get a consent (add + prune)');
  ok(/pc\.status IN \('pending','signed'\) AND x = ANY \(pc\.session_ids\)/.test(M) && /pg_advisory_xact_lock\(hashtextextended\('consent_sync:' \|\| p_patient::text, 0\)\)/.test(M),
     'migration: a covered session is never consented twice; sync is serialised per patient');
  ok(!/ledger_sessions\s+SET|INSERT INTO public\.ledger_sessions|DELETE FROM public\.ledger_sessions|payment_splits|ledger_payments/.test(M), 'migration: the financial layer is read-only here');
  ok(F['scripts/db-bootstrap.py'].indexOf("'migrations/219_consent_forms.sql'") > -1, 'db-bootstrap: migration 219 is in the plan');

  /* (٢) الموديول */
  let E = mkEnv(F), C = E.w.SyConsentTx;
  ok(C && typeof E.w.openConsentModal === 'function' && typeof E.w.saveConsentTpl === 'function', 'module: API exposed');
  ok(C.available() === false && C.has('extracted') === false, 'module: hidden until loaded');
  E.w.openConsentModal('t1');
  ok(!E.el('consentModal').classList.contains('open') && E.toasts.length === 1, 'module: opening before load does nothing but say so');
  ok(await C.load() === true && C.available(), 'module: loads the clinic templates');
  ok(E.calls[0].table === 'consent_templates' && E.calls[0].filters.owner_id === 'own-1', 'module: the read is scoped to the owner');
  E.w.openConsentModal('t1');
  ok(E.el('consentModal').classList.contains('open') && E.el('cnsOn').checked === false && E.el('cnsTitle').value === 'الموافقة على قلع الأسنان'
     && E.el('cnsBody').value.indexOf('السنخ الجاف') > -1 && E.el('cnsBody').value.endsWith(C.TAIL) && E.el('cnsFields').style.display === 'none',
     'module: first open offers the library text for that treatment, switched off');
  ok(C.libFor({ treatment_key: 'custom_9', category: 'restorative' }).title === 'الموافقة على المعالجة السنّية'
     && C.libFor({ treatment_key: 'x', category: 'endodontics' }).title === 'الموافقة على المعالجة اللبية'
     && C.libFor({ treatment_key: 'implant', category: 'other' }).title === 'الموافقة على زراعة الأسنان', 'module: library by key, then category, then general');
  ok(Object.keys(C.LIB).every(k => C.LIB[k].title.length <= 120 && (C.LIB[k].body + C.TAIL).length <= 6000 && C.LIB[k].body.trim().length > 200), 'module: every library text fits the database limits');
  /* validation before the network */
  E.el('cnsOn').checked = true; E.el('cnsTitle').value = '  '; let n = E.calls.length;
  await E.w.saveConsentTpl();
  ok(E.calls.length === n && E.el('cnsErr').style.display === 'block', 'module: an empty title is refused before any request');
  E.el('cnsTitle').value = 'عنوان'; E.el('cnsBody').value = 'x'.repeat(6001);
  await E.w.saveConsentTpl();
  ok(E.calls.length === n, 'module: an over-long text is refused before any request');
  E.el('cnsBody').value = 'نصّي الخاص';
  await E.w.saveConsentTpl();
  let last = E.calls[E.calls.length - 1];
  ok(last.op === 'upsert' && last.payload.owner_id === 'own-1' && last.payload.treatment_key === 'extracted' && last.payload.title === 'عنوان' && last.payload.body === 'نصّي الخاص'
     && last.opts && last.opts.onConflict === 'owner_id,treatment_key', 'module: save is one upsert keyed by (owner, treatment)');
  ok(C.has('extracted') && !E.el('consentModal').classList.contains('open') && E.w._renders === 1 && E.audit.length === 1 && E.audit[0][0] === 'settings.consent_template',
     'module: after save the card shows the tag, the modal closes, the activity log has a row');
  E.w.openConsentModal('t1');
  ok(E.el('cnsOn').checked === true && E.el('cnsBody').value === 'نصّي الخاص', 'module: the saved text wins over the library');
  E.w.consentRestoreLib();
  ok(E.el('cnsBody').value.indexOf('السنخ الجاف') > -1 && E.calls[E.calls.length - 1].op === 'upsert', 'module: restore refills the fields without saving');
  E.el('cnsOn').checked = false;
  await E.w.saveConsentTpl();
  last = E.calls[E.calls.length - 1];
  ok(last.op === 'delete' && last.filters.owner_id === 'own-1' && !!last.filters.id && !C.has('extracted') && E.rows().length === 0, 'module: switching off deletes the clinic\'s own row');
  /* off + nothing saved ⇒ no request */
  E.w.openConsentModal('t2'); n = E.calls.length; await E.w.saveConsentTpl();
  ok(E.calls.length === n && E.audit.length === 2, 'module: off with nothing saved sends nothing and logs nothing');
  /* failed write keeps the modal and the state */
  E = mkEnv(F, { failWrite: true }); C = E.w.SyConsentTx; await C.load(); E.w.openConsentModal('t3'); E.el('cnsOn').checked = true;
  await E.w.saveConsentTpl();
  ok(E.el('consentModal').classList.contains('open') && !C.has('implant') && E.el('cnsErr').style.display === 'block' && E.el('cnsSaveBtn').disabled === false && E.audit.length === 0,
     'module: a failed save says so, keeps the form, claims nothing');
  /* read-only subscription */
  E = mkEnv(F, { readOnly: true, rows: [{ id: 'r1', owner_id: 'own-1', treatment_key: 'implant', title: 'ت', body: 'ن' }] }); C = E.w.SyConsentTx; await C.load();
  E.w.openConsentModal('t3');
  ok(C.has('implant') && !E.el('consentModal').classList.contains('open'), 'module: read-only mode shows the tag but never opens the editor');
  /* table missing ⇒ feature hidden, no error surfaced */
  E = mkEnv(F, { missing: true }); C = E.w.SyConsentTx;
  ok(await C.load() === false && !C.available() && E.toasts.length === 0, 'module: missing table hides the feature silently');
  /* another clinic's row never leaks into the map */
  E = mkEnv(F, { rows: [{ id: 'z', owner_id: 'other', treatment_key: 'extracted', title: 'ت', body: 'ن' }] }); C = E.w.SyConsentTx; await C.load();
  ok(!C.has('extracted'), 'module: only the owner\'s rows are read');

  /* (٣) الصفحة */
  ok((T.match(/<script src="tx-consent\.js\?v=/g) || []).length === 1 && T.indexOf('<script src="tx-consent.js?v=') > T.indexOf('<script src="sidebar.js?v='), 'page: the module is loaded once, after the shell');
  ok((F['scripts/cache-bust.sh'].match(/tx-consent/g) || []).length === 3, 'cache-bust: tx-consent.js is in the fleet allow-list');
  ok(/\(\(window\.SyConsentTx && window\.SyConsentTx\.available\(\)\) \? '<button class="sy-act" onclick="openConsentModal\(/.test(T), 'page: the card button exists only when the feature is available');
  ok(/var cnsTag = \(window\.SyConsentTx && window\.SyConsentTx\.has\(t\.treatment_key\)\) \?/.test(T) && T.indexOf("+ ' ' + cnsTag + ' '") > -1, 'page: the tag shows only for a treatment that has a consent');
  ok(/render\(\);\s+\/\*[^\n]*\*\/\s+if \(window\.SyConsentTx\) window\.SyConsentTx\.load\(\)\.then\(function \(ok\) \{ if \(ok\) render\(\); \}\);/.test(T), 'page: templates load beside the first render, never before it');
  ok(/<div class="modal-overlay sy-m sy-m-md" id="consentModal">/.test(T) && /id="cnsBody" rows="12" maxlength="6000"/.test(T) && /id="cnsTitle" maxlength="120"/.test(T), 'page: the modal is on the kit with the database limits');
  ok(/\[onclick\*="openConsentModal\("\],\[onclick\*="saveConsentTpl\("\]/.test(T), 'page: read-only mode hides the button and the save');
  ok(J.indexOf('innerHTML') < 0, 'module: no HTML is built from text (textContent/value only)');
}

const MUTANTS = [
  ['unset door reads as open', rep('migrations/219_consent_forms.sql', "COALESCE(current_setting('sydent.consent_sign', true) = '1', false)", "(current_setting('sydent.consent_sign', true) = '1')")],
  ['signed row editable', rep('migrations/219_consent_forms.sql', "IF OLD.status = 'signed' THEN\n    RAISE EXCEPTION 'consent_signed_immutable';\n  END IF;", '')],
  ['signature forgeable by update', rep('migrations/219_consent_forms.sql', "IF NEW.status = 'signed' AND NOT v_door THEN", "IF false THEN")],
  ['insert a signed row', rep('migrations/219_consent_forms.sql', "IF NEW.status <> 'pending' OR NEW.signed_at IS NOT NULL", "IF NEW.signed_at IS NOT NULL")],
  ['signed consent deletable', rep('migrations/219_consent_forms.sql', " AND status <> 'signed');", ");")],
  ['internal sync callable', rep('migrations/219_consent_forms.sql', "REVOKE ALL ON FUNCTION public._consent_sync(uuid, uuid) FROM PUBLIC, anon, authenticated;", "REVOKE ALL ON FUNCTION public._consent_sync(uuid, uuid) FROM PUBLIC;")],
  ['door open to read-only accounts', rep('migrations/219_consent_forms.sql', "IF public.tenant_access_level(v_uid) <> 'full' THEN RETURN 0; END IF;\n  RETURN", "RETURN")],
  ['foreign patient synced', rep('migrations/219_consent_forms.sql', "  IF NOT FOUND THEN RETURN 0; END IF;\n\n  -- serialise", "\n  -- serialise")],
  ['follow-up visits consented', rep('migrations/219_consent_forms.sql', "AND COALESCE(s.status, 'completed') = 'planned' AND s.parent_id IS NULL\n       AND s.treatment_key = t.treatment_key", "AND COALESCE(s.status, 'completed') = 'planned'\n       AND s.treatment_key = t.treatment_key")],
  ['unadopted alternatives consented', rep('migrations/219_consent_forms.sql', "AND s.treatment_key = t.treatment_key\n       AND (v_opts <= 1 OR s.plan_option IS NULL OR s.plan_option NOT BETWEEN 1 AND 3);", "AND s.treatment_key = t.treatment_key;")],
  ['subscription gate dropped', rep('migrations/219_consent_forms.sql', "SELECT public._sub_guard_table('public.patient_consents');", '')],
  ['read not scoped to the owner', rep('tx-consent.js', ".select('id, treatment_key, title, body').eq('owner_id', uid);", ".select('id, treatment_key, title, body');")],
  ['delete not scoped to the owner', rep('tx-consent.js', ".delete().eq('id', cur.id).eq('owner_id', uid);", ".delete().eq('id', cur.id);")],
  ['validation after the request', rep('tx-consent.js', "if (!title) return fail('اكتب عنوان الموافقة.');", '')],
  ['over-long text sent', rep('tx-consent.js', "if (body.length > 6000) return fail('النص أطول من 6000 حرف.');", '')],
  ['saved text lost to the library', rep('tx-consent.js', "byId('cnsBody').value = cur ? cur.body : lib.body;", "byId('cnsBody').value = lib.body;")],
  ['restore saves silently', rep('tx-consent.js', "byId('cnsBody').value = lib.body;\n    countChars();\n  }", "byId('cnsBody').value = lib.body;\n    countChars(); byId('cnsOn').checked = true; save();\n  }")],
  ['failed save claims success', rep('tx-consent.js', "if (r.error) throw r.error;\n        S.map[key] = r.data;", "S.map[key] = r.data || {};")],
  ['editor opens in read-only mode', rep('tx-consent.js', "function open(treatmentId) {\n    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;", "function open(treatmentId) {")],
  ['missing table shown as an error', rep('tx-consent.js', "if (!isMissing(r.error)) console.error('consent_templates load:', r.error); return false;", "toast('خطأ'); return false;")],
  ['library text over the limit', rep('tx-consent.js', "title: 'الموافقة على المعالجة السنّية',", "title: '" + 'ط'.repeat(130) + "',")],
  ['button without the feature', rep('treatments.html', "((window.SyConsentTx && window.SyConsentTx.available()) ? '<button class=\"sy-act\" onclick=\"openConsentModal(", "(true ? '<button class=\"sy-act\" onclick=\"openConsentModal(")],
  ['templates block the first render', rep('treatments.html', "  render();\n  /* M219:", "  /* M219:")],
  ['read-only mode leaves save visible', rep('treatments.html', ',[onclick*="saveConsentTpl("]', '')],
  ['module loaded twice', rep('treatments.html', '<script src="tx-consent.js?v=', '<script src="tx-consent.js?v=1"></script>\n<script src="tx-consent.js?v=')]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-consent: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-consent: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
