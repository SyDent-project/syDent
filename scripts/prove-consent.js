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
const FILES = ['migrations/219_consent_forms.sql', 'tx-consent.js', 'treatments.html', 'scripts/cache-bust.sh', 'scripts/db-bootstrap.py',
  'pp-consent.js', 'patient-profile.html', 'pp-timeline.js', 'patient-profile.css',
  'migrations/220_portal_consents.sql', 'portal.html', 'sidebar.js', 'settings.html',
  'migrations/221_consent_keep_after_done.sql', 'consent-pending.js', 'huddle-flags.js', 'appt-modal.js', 'appointments.html', 'index.html'];
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


/* بطاقةُ المريض (أ2): الموديول دوالُّ عامة — تُشغَّل بـvm على DOM وقاعدةٍ وهميين */
function mkCard(F, opt) {
  opt = opt || {};
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } });
  const calls = [], toasts = [], audit = [], opened = [], timers = [];
  let rows = (opt.rows || []).map(r => Object.assign({}, r));
  const q = table => {
    const st = { table, op: 'select', filters: {}, cols: '', payload: null };
    const api = {
      select(c) { if (st.op === 'select') st.cols = c; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      eq(k, v) { st.filters[k] = v; return api; }, order() { return api; }, limit() { return api; }, single() { st.single = true; return api; },
      then(res, rej) {
        calls.push(st); let out;
        if (opt.missing) out = { data: null, error: { code: '42P01', message: 'does not exist' } };
        else if (st.op === 'select') {
          const m = rows.filter(r => Object.keys(st.filters).every(k => r[k] === st.filters[k]));
          out = { data: st.single ? (m[0] || null) : m, error: null };
        } else if (opt.failWrite) out = { data: null, error: { message: 'network' } };
        else {
          const i = rows.findIndex(r => Object.keys(st.filters).every(k => r[k] === st.filters[k]));
          if (i < 0) out = { data: null, error: { message: 'no row' } };
          else { rows[i] = Object.assign({}, rows[i], st.payload, st.payload.status === 'void' ? { voided_at: '2026-11-21T10:00:00Z' } : {}); out = { data: rows[i], error: null }; }
        }
        return Promise.resolve(out).then(res, rej);
      }
    };
    return api;
  };
  const win = { document: { written: '', write(h) { this.written += h; }, close() {} }, focus() {}, print() {} };
  const w = { sb: { from: q, rpc: (n, a) => { calls.push({ table: 'rpc:' + n, args: a }); return Promise.resolve({ data: 1, error: null }); } },
    logAudit: (a, o) => audit.push([a, o]), SyDentSub: { blockReadOnly: () => !!opt.readOnly }, open: () => { opened.push(1); return win; } };
  const ctx = { window: w, document: { getElementById: el }, console: { warn() {}, error() {}, log() {} },
    currentUser: { id: 'own-1' }, patientId: 'pt-1', patient: { name: 'أحمد' },
    sessions: opt.sessions || [{ id: 's1', status: 'planned', treatment_key: 'extracted', plan_option: null, parent_id: null }],
    showToast: m => toasts.push(m), escapeHtml: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    fmtD: x => String(x).slice(0, 10), openModal: id => el(id).classList.add('open'), closeModal: id => el(id).classList.remove('open'),
    SyDialog: { confirm: () => Promise.resolve(opt.decline ? false : true) }, ppPortalSend: () => { w._sent = (w._sent || 0) + 1; },
    setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, clearTimeout: () => {}, CLINIC_SETTINGS_WA: { clinic_name: 'عيادة' } };
  ctx.open = w.open; w.setTimeout = ctx.setTimeout;
  vm.createContext(ctx);
  vm.runInContext(F['pp-consent.js'], ctx);
  return { ctx, w, el, calls, toasts, audit, opened, timers, win, rows: () => rows };
}
const ROW = (id, st, extra) => Object.assign({ id, owner_id: 'own-1', patient_id: 'pt-1', treatment_key: 'extracted', treatment_name: 'قلع', title: 'الموافقة على قلع الأسنان', body: 'نص', teeth: '46',
  status: st, auto: true, created_at: '2026-11-20T10:00:00Z', signed_at: st === 'signed' ? '2026-11-21T09:00:00Z' : null, signer_name: st === 'signed' ? 'أحمد' : null, signer_relation: null, voided_at: null,
  signature: st === 'signed' ? 'data:image/png;base64,AAAA' : null }, extra || {});

async function suiteCard(F) {
  const J = F['pp-consent.js'], P = F['patient-profile.html'];
  let E = mkCard(F, { rows: [] });
  await E.ctx.ppConsentLoad();
  ok(E.calls[0].table === 'rpc:consent_sync' && E.calls[0].args.p_patient === 'pt-1' && E.calls[1].table === 'patient_consents'
     && E.calls[1].filters.owner_id === 'own-1' && E.calls[1].filters.patient_id === 'pt-1', 'card: sync first, then a read scoped to the owner and the patient');
  ok(E.calls[1].cols.indexOf('signature') < 0, 'card: the list never loads signature images');
  ok(E.el('consentRow').style.display === 'none', 'card: no consents ⇒ the row stays hidden');
  E = mkCard(F, { rows: [ROW('c1', 'pending'), ROW('c2', 'signed'), ROW('c3', 'void'), ROW('x', 'pending', { patient_id: 'other' }), ROW('y', 'pending', { owner_id: 'other' })] });
  await E.ctx.ppConsentLoad();
  let h = E.el('iConsent').innerHTML;
  ok(E.el('consentRow').style.display === '' && h.indexOf('بانتظار التوقيع: 1') > -1 && h.indexOf('موقَّعة: 1') > -1 && h.indexOf('onclick="ppConsentSend()"') > -1 && h.indexOf('onclick="ppConsentOpen()"') > -1,
     'card: the row counts this patient\'s pending and signed consents only');
  /* plan signature */
  let n = E.calls.length; E.ctx.ppConsentTouch();
  ok(E.timers.length === 0 && E.calls.length === n, 'card: an unchanged plan triggers no sync');
  E.ctx.sessions.push({ id: 's2', status: 'planned', treatment_key: 'implant', plan_option: null, parent_id: null });
  E.ctx.ppConsentTouch(); E.ctx.ppConsentTouch();
  ok(E.timers.length === 2 && E.timers[1][1] === 600, 'card: a changed plan schedules a debounced sync');
  await E.timers[1][0](); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  ok(E.calls.filter(c => c.table === 'rpc:consent_sync').length === 2, 'card: the debounced sync runs once');
  E.ctx.sessions.push({ id: 's3', status: 'completed', treatment_key: 'implant' }, { id: 's4', status: 'planned', treatment_key: 'implant', parent_id: 's2' });
  n = E.timers.length; E.ctx.ppConsentTouch();
  ok(E.timers.length === n, 'card: completed sessions and follow-up visits do not count as a plan change');
  /* list */
  E.ctx.ppConsentOpen();
  h = E.el('ppConsentList').innerHTML;
  ok(E.el('ppConsentModal').classList.contains('open') && h.indexOf('ppConsentVoid(\'c1\')') > -1 && h.indexOf('ppConsentVoid(\'c2\')') < 0 && h.indexOf('ppConsentVoid(\'c3\')') < 0
     && (h.match(/ppConsentPrint\(/g) || []).length === 3 && h.indexOf('وقّعها أحمد') > -1, 'card: only a pending consent can be cancelled; every consent can be printed');
  ok(h.indexOf('c1') < h.indexOf('c2') && h.indexOf('c2') < h.indexOf('c3'), 'card: pending first, then signed, then cancelled');
  /* XSS */
  E = mkCard(F, { rows: [ROW('c1', 'pending', { title: '<img src=x onerror=alert(1)>', body: '<script>x</script>', treatment_name: '"><b>', teeth: '<i>' })] });
  await E.ctx.ppConsentLoad(); E.ctx.ppConsentOpen(); h = E.el('ppConsentList').innerHTML;
  ok(!/<img|<script|<b>|<i>/.test(h), 'card: stored text is escaped in the list');
  await E.ctx.ppConsentPrint('c1');
  ok(E.opened.length === 1 && !/<img src=x|<script>x|<b>|<i>/.test(E.win.document.written) && E.win.document.written.indexOf('اسم الموقّع وتوقيعه') > -1
     && E.calls.filter(c => c.cols === 'signature').length === 0, 'card: printing a pending consent escapes everything, leaves a blank signature line, fetches no signature');
  /* void */
  E = mkCard(F, { rows: [ROW('c1', 'pending'), ROW('c2', 'signed')] }); await E.ctx.ppConsentLoad();
  await E.ctx.ppConsentVoid('c2');
  ok(E.calls.filter(c => c.op === 'update').length === 0, 'card: a signed consent is never sent for cancelling');
  await E.ctx.ppConsentVoid('c1');
  let u = E.calls.filter(c => c.op === 'update')[0];
  ok(u && u.payload.status === 'void' && Object.keys(u.payload).length === 1 && u.filters.id === 'c1' && u.filters.owner_id === 'own-1' && u.filters.status === 'pending'
     && E.audit.length === 1 && E.audit[0][0] === 'patient.consent_void' && E.el('iConsent').innerHTML.indexOf('بانتظار التوقيع') < 0,
     'card: cancel writes status only, scoped to owner + still-pending, and logs it');
  await E.ctx.ppConsentPrint('c2');
  ok(E.calls.filter(c => c.cols === 'signature' && c.filters.id === 'c2' && c.filters.owner_id === 'own-1').length === 1 && E.win.document.written.indexOf('src="data:image/png;base64,AAAA"') > -1
     && E.win.document.written.indexOf('وُقّعت إلكترونياً من بوابة المريض') > -1, 'card: printing a signed consent fetches its signature, scoped to the owner');
  E = mkCard(F, { rows: [ROW('c1', 'pending')], decline: true }); await E.ctx.ppConsentLoad(); await E.ctx.ppConsentVoid('c1');
  ok(E.calls.filter(c => c.op === 'update').length === 0, 'card: declining the confirmation cancels nothing');
  E = mkCard(F, { rows: [ROW('c1', 'pending')], failWrite: true }); await E.ctx.ppConsentLoad(); await E.ctx.ppConsentVoid('c1');
  ok(E.audit.length === 0 && E.el('iConsent').innerHTML.indexOf('بانتظار التوقيع: 1') > -1 && E.toasts.length === 1, 'card: a failed cancel says so and changes nothing');
  E = mkCard(F, { rows: [ROW('c1', 'pending')], readOnly: true }); await E.ctx.ppConsentLoad(); await E.ctx.ppConsentVoid('c1'); E.ctx.ppConsentSend();
  ok(E.calls.filter(c => c.op === 'update').length === 0 && !E.w._sent, 'card: read-only mode neither cancels nor sends');
  E = mkCard(F, { rows: [ROW('c1', 'pending')] }); await E.ctx.ppConsentLoad(); E.ctx.ppConsentSend();
  ok(E.w._sent === 1, 'card: sending for signature is the portal\'s own send');
  E = mkCard(F, { missing: true }); await E.ctx.ppConsentLoad();
  ok(E.el('consentRow').style.display === 'none' && E.toasts.length === 0, 'card: before the migration the row is hidden silently');
  /* wiring */
  ok((P.match(/<script src="pp-consent\.js\?v=/g) || []).length === 1 && P.indexOf('<script src="pp-consent.js?v=') > P.indexOf('<script src="pp-portal.js?v='), 'card: the module is loaded once, after the portal module');
  ok(/id="consentRow" style="display:none;"/.test(P) && /<div class="modal-overlay sy-m" id="ppConsentModal">/.test(P), 'card: the row starts hidden; the modal is on the kit');
  ok(/try \{ if \(typeof ppConsentTouch === 'function'\) ppConsentTouch\(\); \} catch \(e\)/.test(F['pp-timeline.js']) && F['pp-timeline.js'].indexOf('ppConsentTouch();') < F['pp-timeline.js'].indexOf("var container = document.getElementById('tlContent');"),
     'card: the passage point touches the consents before any early return, guarded');
  ok((P.match(/ppConsentLoad\(true\)/g) || []).length === 1 && /ppConsentLoad\(\); \} catch\(e\) \{\}/.test(P), 'card: loaded at start and on live refresh');
  ok(F['patient-profile.css'].indexOf('[onclick*="ppConsentSend("],[onclick*="ppConsentVoid("]') > -1, 'card: read-only mode hides send and cancel');
  ok((F['scripts/cache-bust.sh'].match(/pp-consent/g) || []).length === 3 && !/\.addEventListener\(|\.on(click|change|input)\s*=/.test(J), 'card: module in the fleet; zero event listeners');
}

/* أ3 (M220): بابا البوابة · صفحةُ المريض · الغلاف · الإعدادات */
function fnBody(sql, name) { const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '('); const j = sql.indexOf('END; $$;', i); return i < 0 ? '' : sql.slice(i, j); }
function suitePortal(F) {
  const M = F['migrations/220_portal_consents.sql'], P = F['portal.html'], SB = F['sidebar.js'], ST = F['settings.html'];
  const L = fnBody(M, 'portal_consents'), G = fnBody(M, 'portal_consent_sign');
  const chain = b => /pp\.token = p_token AND pp\.revoked_at IS NULL AND pp\.expires_at >= now\(\)/.test(b) && /IF NOT FOUND OR NOT public\._intake_clinic_open\(v\.owner_id\) THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'unavailable'\);/.test(b)
    && /p_token !~ '\^\[0-9a-f\]\{64\}\$'/.test(b) && /JOIN public\.patients p ON p\.id = pp\.patient_id AND p\.doctor_id = pp\.owner_id/.test(b);
  ok(chain(L) && chain(G), 'M220: both doors need a live, unrevoked link of an open clinic, bound to the owner\'s own patient');
  ok(/COALESCE\(c\.portal_show_consents, true\) INTO v_show/.test(L) && /IF v_show IS DISTINCT FROM true AND FOUND THEN\s+RETURN jsonb_build_object\('ok', true, 'items', '\[\]'::jsonb\);/.test(L)
     && /IF v_show IS DISTINCT FROM true AND FOUND THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'unavailable'\);/.test(G), 'M220: the clinic switch empties the list and closes the signing door');
  ok(/x\.owner_id = v\.owner_id AND x\.patient_id = v\.patient_id AND x\.status IN \('pending', 'signed'\)/.test(L) && L.indexOf("'signature'") < 0 && L.indexOf('signed_ua') < 0 && /LIMIT 40/.test(L),
     'M220: the list is this patient\'s pending and signed consents — never a signature image, never another patient');
  ok(L.indexOf('PERFORM public._consent_sync(v.owner_id, v.patient_id);') > L.indexOf('v_show IS DISTINCT FROM true'), 'M220: the derived sync runs only behind the link, clinic and switch checks');
  ok(/char_length\(p_signature\) < 200 OR char_length\(p_signature\) > 120000\s+OR p_signature !~ '\^data:image\/png;base64,\[A-Za-z0-9\+\/\]\+=\*\$'/.test(G), 'M220: the signature must be a PNG data URL within the cap');
  ok(/char_length\(v_name\) < 2 OR char_length\(v_name\) > 80 OR v_name ~ '\[<>\]'/.test(G) && /v_rel IS NOT NULL AND \(char_length\(v_rel\) > 40 OR v_rel ~ '\[<>\]'\)/.test(G), 'M220: signer name and relation are bounded and carry no markup');
  ok(/WHERE x\.id = p_consent AND x\.owner_id = v\.owner_id AND x\.patient_id = v\.patient_id\s+FOR UPDATE;/.test(G) && /IF c\.status = 'signed' THEN\s+RETURN jsonb_build_object\('ok', true, 'reason', 'already'/.test(G)
     && /IF c\.status <> 'pending' THEN RETURN jsonb_build_object\('ok', false, 'reason', 'not_signable'\); END IF;/.test(G), 'M220: only this patient\'s own pending consent is signable; a repeat is idempotent');
  ok(/>= 30 THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'rate'\);/.test(G), 'M220: a daily cap per patient');
  const iOpen = G.indexOf("PERFORM set_config('sydent.consent_sign', '1', true);"), iUpd = G.indexOf('UPDATE public.patient_consents'), iClose = G.indexOf("PERFORM set_config('sydent.consent_sign', '', true);");
  ok(iOpen > -1 && iOpen < iUpd && iUpd < iClose && /WHERE id = c\.id;/.test(G) && (G.match(/UPDATE public\./g) || []).length === 1 && !/p_body|p_title|body =|title =/.test(G),
     'M220: one row is written through the door, which closes right after; the visitor never sends text');
  ok(/INSERT INTO public\.audit_log/.test(G) && /'patient\.consent_sign'/.test(G) && G.indexOf('INSERT INTO public.audit_log') > iUpd, 'M220: every signature leaves an activity-log row');
  ok(/REVOKE ALL ON FUNCTION public\.portal_consent_sign\(text, uuid, text, text, text\) FROM PUBLIC;\s+GRANT EXECUTE ON FUNCTION public\.portal_consent_sign\(text, uuid, text, text, text\) TO anon, authenticated;/.test(M)
     && /ALTER PUBLICATION supabase_realtime ADD TABLE public\.patient_consents;/.test(M) && F['scripts/db-bootstrap.py'].indexOf("'migrations/220_portal_consents.sql'") > -1, 'M220: grants named; realtime publication; in the bootstrap plan');
  /* portal page */
  ok(/h \+= sectionConsents\(\);[^\n]*\n  h \+= sectionIntake\(INFO\.intake\);/.test(P) && /loadXrays\(\);[^\n]*\n    loadConsents\(\);/.test(P), 'portal: what awaits a signature shows first, and loads after the page');
  ok(/p_consent: id, p_signature: sig, p_name: name, p_relation: rel === RELATIONS\[0\] \? null : rel \}\), 30000\)/.test(P) && !/p_body|p_title/.test(P), 'portal: sends id + signature + signer only');
  ok(/if \(g\) g\.disabled = !\(a && a\.checked && n && n\.value\.trim\(\)\.length >= 2 && _sig\.has\) \|\| _cnsBusy;/.test(P) && /if \(!sig\) \{ say\('ارسم توقيعك داخل المربّع\.'\); return; \}/.test(P)
     && /if \(!c \|\| !a \|\| !a\.checked\) \{ say\(/.test(P), 'portal: agree + name + a drawn signature are all required');
  const sec = P.slice(P.indexOf('function sectionConsents'), P.indexOf('function closeConsent'));
  ok((sec.match(/esc\(c\.title\)/g) || []).length === 3 && (sec.match(/esc\(c\.body\)/g) || []).length === 2 && (sec.match(/esc\(meta\)/g) || []).length === 3 && !/' \+ c\.(title|body|treatment|teeth|signer) \+ '/.test(sec),
     'portal: every stored value is escaped');
  ok(/if \(!c \|\| c\.status !== 'pending'\) return;/.test(P) && /c\.status = 'signed';/.test(P) && /catch \(e\) \{ say\('تعذّر الاتصال[^']*توقيعك ما زال في المربّع\.'\); \}/.test(P), 'portal: only a pending consent opens; a network failure keeps the drawing');
  ok(/@media print\{ \.cns-ov\{display:none;\} \}/.test(P) && /\.cns-fld input\[type=text\]\{width:100%; min-height:46px;/.test(P) && /\.sig\{[^}]*touch-action:none;/.test(P), 'portal: touch-sized fields; the pad owns its touches; the sheet stays out of prints');
  /* shell + settings + card */
  ok(/sbIntakeSubscribe\(uid\);\n    sbConsentSubscribe\(uid\);/.test(SB) && /table: 'patient_consents', filter: 'owner_id=eq\.' \+ uid/.test(SB)
     && /if \(!row \|\| row\.owner_id !== uid \|\| row\.status !== 'signed'\) return;\s+if \(old && old\.status === 'signed'\) return;/.test(SB) && /\.eq\('id', row\.patient_id\)\.eq\('doctor_id', row\.owner_id\)\.maybeSingle\(\)/.test(SB),
     'shell: one owner-filtered channel; only a fresh signature toasts, naming the patient');
  ok(/window\.onSyDentConsent = function \(row\) \{\s+try \{ if \(row && row\.patient_id === patientId\) ppConsentLoad\(true\); \}/.test(F['pp-consent.js']), 'card: a live signature refreshes only that patient\'s card');
  ok(/id="ptShowConsents" class="bk-switch"/.test(ST) && /getElementById\('ptShowConsents'\)\.checked = row \? row\.portal_show_consents !== false : true;/.test(ST)
     && /portal_show_consents: document\.getElementById\('ptShowConsents'\)\.checked,/.test(ST), 'settings: the switch loads (default on) and saves');
}

/* أ4 (M221): «موافقة ناقصة» — تنبيهٌ بلا منع: اللوحة · نافذة الموعد · لحظة الإنجاز · والمعلَّقة تبقى بعد الإنجاز */
async function suiteAlerts(F) {
  const M = F['migrations/221_consent_keep_after_done.sql'], M219 = F['migrations/219_consent_forms.sql'];
  const cut = (m, a, b) => { const i = m.indexOf(a), j = m.indexOf(b, i); return m.slice(i, j); };
  const prune = cut(M, '-- (a) drop', '-- (b) add'), add = cut(M, '-- (b) add', 'RETURN v_n;'), add219 = cut(M219, '-- (b) add', 'RETURN v_n;');
  ok(/AND \(COALESCE\(s\.status, 'completed'\) = 'completed'\s+OR \(COALESCE\(s\.status, 'completed'\) = 'planned'\s+AND \(v_opts <= 1 OR s\.plan_option IS NULL OR s\.plan_option NOT BETWEEN 1 AND 3\)\)\)/.test(prune)
     && /AND s\.parent_id IS NULL/.test(prune) && /AND EXISTS \(SELECT 1 FROM public\.consent_templates ct/.test(prune), 'M221: a pending consent survives its treatment being completed; unadopted alternatives and removed texts still drop');
  ok(add === add219 && add.length > 500, 'M221: the add branch is byte-identical to M219 (completed treatments never get a new consent)');
  ok(/REVOKE ALL ON FUNCTION public\._consent_sync\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(M) && F['scripts/db-bootstrap.py'].indexOf("'migrations/221_consent_keep_after_done.sql'") > -1, 'M221: still closed to everyone; in the bootstrap plan');
  /* consent-pending.js on a fake DOM and database */
  const mk = (rows, opt) => {
    opt = opt || {}; const els = {}, calls = [];
    const el = id => els[id] || (els[id] = { textContent: 'old', style: { display: 'block' } });
    const w = { sb: { from: t => { const st = { t, f: {} }; const api = { select() { return api; }, eq(k, v) { st.f[k] = v; return api; }, in(k, v) { st.f[k] = v; return api; },
      then(a, b) { calls.push(st); const p = opt.fail ? { data: null, error: { message: 'x' } } : { data: rows.filter(r => r.owner_id === st.f.owner_id && r.status === st.f.status && st.f.patient_id.indexOf(r.patient_id) > -1), error: null };
        return (opt.delay ? new Promise(r => setTimeout(() => r(p), opt.delay(st))) : Promise.resolve(p)).then(a, b); } }; return api; } } };
    const ctx = { window: w, document: { getElementById: id => (opt.noEl ? null : el(id)) }, setTimeout };
    vm.createContext(ctx); vm.runInContext(F['consent-pending.js'], ctx);
    return { C: w.SyConsentPending, el, calls };
  };
  const R = [{ owner_id: 'o', patient_id: 'p1', status: 'pending' }, { owner_id: 'o', patient_id: 'p1', status: 'pending' }, { owner_id: 'o', patient_id: 'p2', status: 'signed' },
             { owner_id: 'other', patient_id: 'p3', status: 'pending' }, { owner_id: 'o', patient_id: 'p4', status: 'void' }];
  let E = mk(R);
  let m = await E.C.forPatients('o', ['p1', 'p2', 'p3', 'p4', null]);
  ok(JSON.stringify(m) === '{"p1":2}' && E.calls.length === 1 && E.calls[0].t === 'patient_consents' && E.calls[0].f.owner_id === 'o' && E.calls[0].f.status === 'pending' && E.calls[0].f.patient_id.length === 4,
     'alerts: one read, scoped to the owner, pending only, counted per patient');
  ok(JSON.stringify(await E.C.forPatients('o', [])) === '{}' && JSON.stringify(await E.C.forPatients(null, ['p1'])) === '{}' && E.calls.length === 1, 'alerts: no patients or no user ⇒ no request');
  E = mk(R, { fail: true });
  ok(JSON.stringify(await E.C.forPatients('o', ['p1'])) === '{}', 'alerts: a failed read (or a missing table) shows nothing');
  E = mk(R); await E.C.hint('o', 'p1', 'h');
  ok(E.el('h').style.display === 'block' && E.el('h').textContent.indexOf('2 موافقات') > -1, 'alerts: the appointment-modal line names the count');
  await E.C.hint('o', 'p2', 'h');
  ok(E.el('h').style.display === 'none' && E.el('h').textContent === '', 'alerts: a patient with nothing pending clears the line');
  await E.C.hint('o', null, 'h');
  ok(E.el('h').style.display === 'none', 'alerts: no patient ⇒ hidden');
  E = mk(R, { delay: st => (st.f.patient_id[0] === 'p1' ? 30 : 1) });
  const a1 = E.C.hint('o', 'p1', 'h'), a2 = E.C.hint('o', 'p2', 'h'); await Promise.all([a1, a2]);
  ok(E.el('h').style.display === 'none', 'alerts: a slow answer for the previous patient never overwrites the current one');
  ok(E.C.text(1).indexOf('موافقة علاج بانتظار توقيعه') > -1 && F['consent-pending.js'].indexOf('innerHTML') < 0 && !/\.(insert|update|upsert|delete)\(/.test(F['consent-pending.js']), 'alerts: text only, and the module never writes');
  /* huddle chip */
  const H = F['huddle-flags.js'];
  ok(/consent: \(ctx\.consents && ctx\.consents\[pid\] > 0\) \? ctx\.consents\[pid\] : 0 \};/.test(H) && /if \(e\.consent\)[^\n]*\n\s+out\.push\(chip\('yellow', '✍️ موافقة بانتظار التوقيع',/.test(H), 'huddle: a patient with a pending consent gets a yellow chip');
  const iStart = H.indexOf('var consentsP = (todayIds.length && window.SyConsentPending) ? window.SyConsentPending.forPatients(uid, todayIds) : null;'), iFirst = H.indexOf("var rl = await window.sb.from('ledger_sessions')"), iAwait = H.indexOf('if (consentsP) { try { consents = await consentsP; } catch (eC) { consents = {}; } }');
  ok(iStart > -1 && iStart < iFirst && iAwait > iFirst && /inprog: inprog, consents: consents \}\);/.test(H), 'huddle: the read starts before the other loads and is awaited last (no extra round in the chain)');
  ok(/<script src="consent-pending\.js\?v=[^"]+"><\/script>\n<script src="huddle-flags\.js/.test(F['index.html']) && (F['appointments.html'].match(/<script src="consent-pending\.js\?v=/g) || []).length === 1, 'pages: the reader is loaded once on the dashboard (before the huddle) and on appointments');
  ok(/id="fPatientConsentHint" class="rel-hint" style="display:none;/.test(F['appointments.html'])
     && /if \(window\.SyConsentPending\) window\.SyConsentPending\.hint\(\(typeof currentUser !== 'undefined' && currentUser\) \? currentUser\.id : null, \(rec && rec\.id\) \? rec\.id : null, 'fPatientConsentHint'\);/.test(F['appt-modal.js']),
     'appointment modal: the line sits under the reliability line and follows the chosen patient');
  ok(!/SyConsentPending[^\n]*return false|consent[^\n]*preventDefault/i.test(F['appt-modal.js']), 'appointment modal: the hint never blocks the booking');
  /* card: toast at the moment of completion only */
  let K = mkCard(F, { rows: [ROW('c1', 'pending', { session_ids: ['s1'] }), ROW('c2', 'pending', { session_ids: ['s9'] })],
    sessions: [{ id: 's1', status: 'planned', treatment_key: 'extracted' }, { id: 's9', status: 'completed', treatment_key: 'implant' }] });
  await K.ctx.ppConsentLoad();
  ok(K.toasts.length === 0, 'card: a treatment completed before the card was opened does not toast on every open');
  K.ctx.sessions[0].status = 'completed'; K.ctx.ppConsentTouch(); K.ctx.ppConsentTouch();
  ok(K.toasts.length === 1 && K.toasts[0].indexOf('لم تُوقَّع بعد') > -1, 'card: completing a treatment whose consent is pending warns once');
  ok(K.calls.filter(c => c.table === 'patient_consents' && c.op === 'select')[0].cols.indexOf('session_ids') > -1, 'card: the list carries the covered sessions');
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
  await suiteCard(F);
  suitePortal(F);
  await suiteAlerts(F);
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
  ['card read not scoped to the patient', rep('pp-consent.js', ".eq('owner_id', currentUser.id).eq('patient_id', patientId)\n      .order(", ".eq('owner_id', currentUser.id)\n      .order(")],
  ['signature images loaded with the list', rep('pp-consent.js', "signer_relation, voided_at';", "signer_relation, voided_at, signature';")],
  ['row shown with nothing to show', rep('pp-consent.js', "if (!PP_CONSENT_OK || (!n.pending && !n.signed)) { row.style.display = 'none'; return; }", "")],
  ['sync on every render', rep('pp-consent.js', "if (ppConsentPlanSig() === _ppConsentSig) return;", "")],
  ['follow-ups count as plan changes', rep('pp-consent.js', "=== 'planned' && !s.parent_id; })", "=== 'planned'; })")],
  ['signed consent cancellable', rep('pp-consent.js', "if (!c || c.status !== 'pending' || _ppConsentBusy) return;", "if (!c || _ppConsentBusy) return;")],
  ['cancel not pinned to pending', rep('pp-consent.js', ".eq('id', id).eq('owner_id', currentUser.id).eq('status', 'pending')", ".eq('id', id).eq('owner_id', currentUser.id)")],
  ['cancel not scoped to the owner', rep('pp-consent.js', ".eq('id', id).eq('owner_id', currentUser.id).eq('status', 'pending')", ".eq('id', id).eq('status', 'pending')")],
  ['cancel without confirmation', rep('pp-consent.js', "cancelText: 'تراجع' })) return;", "cancelText: 'تراجع' })) { /* go on */ }")],
  ['list title unescaped', rep('pp-consent.js', "<span class=\"ppc-title\">' + escapeHtml(c.title || '') + '</span>'", "<span class=\"ppc-title\">' + (c.title || '') + '</span>'")],
  ['list body unescaped', rep('pp-consent.js', "<div class=\"pp-intake-txt\">' + escapeHtml(c.body || '') + '</div>", "<div class=\"pp-intake-txt\">' + (c.body || '') + '</div>")],
  ['print body unescaped', rep('pp-consent.js', "'<div class=\"b\">' + E(c.body) + '</div>'", "'<div class=\"b\">' + c.body + '</div>'")],
  ['signature fetched without owner scope', rep('pp-consent.js', ".select('signature').eq('id', id).eq('owner_id', currentUser.id).single();", ".select('signature').eq('id', id).single();")],
  ['void works in read-only mode', rep('pp-consent.js', "async function ppConsentVoid(id) {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", "async function ppConsentVoid(id) {")],
  ['send works in read-only mode', rep('pp-consent.js', "function ppConsentSend() {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", "function ppConsentSend() {")],
  ['cancel rewrites more than the status', rep('pp-consent.js', ".update({ status: 'void' })", ".update({ status: 'void', body: 'x' })")],
  ['passage point after the early return', rep('pp-timeline.js', "  try { if (typeof ppConsentTouch === 'function') ppConsentTouch(); } catch (e) { console.warn('ppConsentTouch:', e); }   /* M219: الخطةُ تغيّرت ⇒ موافقاتُها تُزامَن */\n", "")],
  ['row visible before load', rep('patient-profile.html', 'id="consentRow" style="display:none;"', 'id="consentRow"')],
  ['read-only mode leaves cancel visible', rep('patient-profile.css', ',[onclick*="ppConsentVoid("]', '')],
  ['revoked link still lists', rep('migrations/220_portal_consents.sql', "   WHERE pp.token = p_token AND pp.revoked_at IS NULL AND pp.expires_at >= now()\n   LIMIT 1;\n  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN\n    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');\n  END IF;\n  SELECT COALESCE(c.portal_show_consents", "   WHERE pp.token = p_token\n   LIMIT 1;\n  IF NOT FOUND OR NOT public._intake_clinic_open(v.owner_id) THEN\n    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');\n  END IF;\n  SELECT COALESCE(c.portal_show_consents")],
  ['switch off still signs', rep('migrations/220_portal_consents.sql', "  IF v_show IS DISTINCT FROM true AND FOUND THEN\n    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');\n  END IF;\n\n  -- the signature", "\n  -- the signature")],
  ['signature image leaks into the list', rep('migrations/220_portal_consents.sql', "'status', pc.status, 'signed_at', pc.signed_at, 'signer', pc.signer_name)", "'status', pc.status, 'signed_at', pc.signed_at, 'signer', pc.signer_name, 'signature', pc.signature)")],
  ['another patient\'s consent signable', rep('migrations/220_portal_consents.sql', "WHERE x.id = p_consent AND x.owner_id = v.owner_id AND x.patient_id = v.patient_id\n   FOR UPDATE;", "WHERE x.id = p_consent AND x.owner_id = v.owner_id\n   FOR UPDATE;")],
  ['any data URL accepted as a signature', rep('migrations/220_portal_consents.sql', "OR p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$'", "OR p_signature !~ '^data:'")],
  ['markup accepted in the signer name', rep('migrations/220_portal_consents.sql', "OR char_length(v_name) > 80 OR v_name ~ '[<>]' THEN", "OR char_length(v_name) > 80 THEN")],
  ['cancelled consent signable', rep('migrations/220_portal_consents.sql', "IF c.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_signable'); END IF;", "")],
  ['no daily cap', rep('migrations/220_portal_consents.sql', ">= 30 THEN\n    RETURN jsonb_build_object('ok', false, 'reason', 'rate');", ">= 30 THEN\n    NULL;")],
  ['door left open after signing', rep('migrations/220_portal_consents.sql', "   WHERE id = c.id;\n  PERFORM set_config('sydent.consent_sign', '', true);", "   WHERE id = c.id;")],
  ['signature without an activity-log row', rep('migrations/220_portal_consents.sql', "'patient.consent_sign'", "'patient.other'")],
  ['sync before the link is checked', rep('migrations/220_portal_consents.sql', "\n  PERFORM public._consent_sync(v.owner_id, v.patient_id);\n", "\n")],
  ['portal sends without a signature', rep('portal.html', "if (!sig) { say('ارسم توقيعك داخل المربّع.'); return; }", "")],
  ['portal submit enabled without agreement', rep('portal.html', "!(a && a.checked && n && n.value.trim().length >= 2 && _sig.has) || _cnsBusy;", "!(n && n.value.trim().length >= 2 && _sig.has) || _cnsBusy;")],
  ['portal title unescaped', rep('portal.html', "h += '<div class=\"cns-it\"><h3>' + esc(c.title) + '</h3>' + (meta ? '<p class=\"cns-meta\">' + esc(meta) + '</p>' : '')\n      + '<button", "h += '<div class=\"cns-it\"><h3>' + c.title + '</h3>' + (meta ? '<p class=\"cns-meta\">' + esc(meta) + '</p>' : '')\n      + '<button")],
  ['portal body unescaped in the sheet', rep('portal.html', "<div class=\"cns-body\">' + esc(c.body) + '</div></div>'\n    + '<label class=\"cns-agree\">", "<div class=\"cns-body\">' + c.body + '</div></div>'\n    + '<label class=\"cns-agree\">")],
  ['consents delay the page', rep('portal.html', "    loadConsents();   /* M220: ثانويّ — لا يؤخّر الصفحة */", "    await loadConsents();   /* M220 */")],
  ['shell toasts every update', rep('sidebar.js', "if (!row || row.owner_id !== uid || row.status !== 'signed') return;", "if (!row || row.owner_id !== uid) return;")],
  ['shell channel not owner-filtered', rep('sidebar.js', "table: 'patient_consents', filter: 'owner_id=eq.' + uid }", "table: 'patient_consents' }")],
  ['live signature refreshes any card', rep('pp-consent.js', "if (row && row.patient_id === patientId) ppConsentLoad(true);", "if (row) ppConsentLoad(true);")],
  ['settings switch not saved', rep('settings.html', "    portal_show_consents: document.getElementById('ptShowConsents').checked,   /* M220 */\n", "")],
  ['pending consent vanishes once the treatment is done', rep('migrations/221_consent_keep_after_done.sql', "AND (COALESCE(s.status, 'completed') = 'completed'\n            OR (COALESCE(s.status, 'completed') = 'planned'", "AND (false\n            OR (COALESCE(s.status, 'completed') = 'planned'")],
  ['completed treatments get new consents', rep('migrations/221_consent_keep_after_done.sql', "AND COALESCE(s.status, 'completed') = 'planned' AND s.parent_id IS NULL\n       AND s.treatment_key = t.treatment_key", "AND s.parent_id IS NULL\n       AND s.treatment_key = t.treatment_key")],
  ['alerts read not scoped to the owner', rep('consent-pending.js', ".eq('owner_id', uid).eq('status', 'pending')", ".eq('status', 'pending')")],
  ['signed consents counted as missing', rep('consent-pending.js', ".eq('owner_id', uid).eq('status', 'pending')", ".eq('owner_id', uid)")],
  ['stale hint overwrites the current patient', rep('consent-pending.js', "    if (my !== _seq) return;\n", "")],
  ['hint left from the previous patient', rep('consent-pending.js', "    el.style.display = 'none'; el.textContent = '';\n", "")],
  ['huddle chip dropped', rep('huddle-flags.js', "if (e.consent)   /* M219 · أ4: تنبيهٌ بلا منع */", "if (false)")],
  ['huddle read chained in sequence', rep('huddle-flags.js', "var consentsP = (todayIds.length && window.SyConsentPending) ? window.SyConsentPending.forPatients(uid, todayIds) : null;", "var consentsP = null; if (todayIds.length && window.SyConsentPending) consents = await window.SyConsentPending.forPatients(uid, todayIds);")],
  ['appointment modal hint not wired', rep('appt-modal.js', "'fPatientConsentHint');", "'x');")],
  ['card toasts on every open', rep('pp-consent.js', "PP_CONSENT_OK = true; ppConsentWarnDone(true); }", "PP_CONSENT_OK = true; ppConsentWarnDone(false); }")],
  ['card never warns at completion', rep('pp-consent.js', "    if (!silent) showToast(", "    if (false) showToast(")],
  ['card warns again and again', rep('pp-consent.js', "if (c.status !== 'pending' || _ppConsentWarned[c.id]) return;", "if (c.status !== 'pending') return;")],
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
