/* v643 — مثبتُ SyDent Bridge ج٢ (M194 + Edge Function bridge): الاقتران · طلباتُ الالتقاط · الوارد.
   (١) القاعدة: المفتاحُ لا يُخزَّن إلا تجزئته · الرمزُ 8 أحرف بلا لبس 10 دقائق مرةً واحدة · لا INSERT جهازٍ من العميل ·
       المالكُ يسمّي ويوقف فقط والإيقافُ نهائي · الطلبُ محروسُ الملكية والعميلُ لا يكتب done · الواردُ تحت _inbox وليس يتيماً ·
       دوالُّ الجسر لمفتاح الخدمة وحده وتطبّق بوابةَ الاشتراك والحصّة والصيغ والمسار · Realtime للجداول الثلاثة;
   (٢) الدالةُ الطرفية تُشغَّل فعلاً: الاقترانُ يولّد مفتاحاً 64 hex ويمرّر SHA-256 فقط · هويةٌ ناقصة ⇒ 401 ·
       الرفعُ يعطي مسارَ القاعدة ورابطَ رفعٍ موقّع · صفٌّ مرفوض ⇒ الكائنُ يُحذف · المفتاحُ من البيئة;
   (٣) العيادة: قسمُ الأجهزة بالإعدادات (رمزٌ من الخادم · إيقاف) · «التقاط من الجهاز» يحتاج جهازاً مقترناً ويفتح الورقةَ بلا
       ملفات ويرسل طلباً · شريطُ الانتظار · الواردُ يُسند بنقل الكائن ثم الصف ثم حذف صفّ الوارد · حرّاسُ القراءة · SyLive.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const { stripTypeScriptTypes } = require('node:module');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function runEdge(src, body, rpc, storage) {
  const calls = { rpc: [], sign: [], rm: [] };
  let handler = null;
  const js = stripTypeScriptTypes(src.replace(/^import \{ createClient \} from "[^"]+";$/m, ''));
  const ctx = {
    console, JSON, Array, String, Object, Number, Math, Promise, Response, Headers, Uint8Array, TextEncoder,
    crypto: globalThis.crypto,
    Deno: { serve: h => { handler = h; }, env: { get: k => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] } },
    createClient: () => ({
      rpc: async (n, a) => { calls.rpc.push([n, a]); return rpc ? await rpc(n, a) : { data: null }; },
      storage: { from: () => ({
        createSignedUploadUrl: async p => { calls.sign.push(p); return storage && storage.sign ? storage.sign(p) : { data: { signedUrl: 'https://x.supabase.co/storage/v1/object/upload/sign/patient-files/' + p + '?token=t', token: 't', path: p } }; },
        remove: async ps => { calls.rm.push(ps); return { data: ps }; }
      }) }
    })
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const req = new Request('https://x/functions/v1/bridge', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await handler(req);
  let out = null; try { out = await res.json(); } catch (e) {}
  return { res, out, calls };
}

async function suite(F) {
  /* (١) القاعدة */
  const M = F['migrations/194_bridge_core.sql'];
  ok(/key_hash      TEXT NOT NULL UNIQUE CHECK \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(M) && !/device_key|secret\s+TEXT/.test(M), 'M194: only the SHA-256 of the device key is stored');
  ok(/code        TEXT PRIMARY KEY CHECK \(code ~ '\^\[A-HJ-NP-Z2-9\]\{8\}\$'\)/.test(M) && /expires_at  TIMESTAMPTZ NOT NULL DEFAULT now\(\) \+ interval '10 minutes'/.test(M) && /v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/.test(M)
     && /DELETE FROM public\.bridge_pairings WHERE owner_id = v_uid;/.test(M) && /IF NOT FOUND OR v\.used_at IS NOT NULL OR v\.expires_at < now\(\) THEN RETURN jsonb_build_object\('ok', false, 'reason', 'bad_code'\); END IF;/.test(M),
     'M194: pairing code — 8 unambiguous chars, 10 minutes, one open per clinic, single use');
  const devBlock = M.slice(M.indexOf('CREATE TABLE IF NOT EXISTS public.bridge_devices'), M.indexOf('CREATE TABLE IF NOT EXISTS public.bridge_pairings'));
  ok(!/FOR INSERT/.test(devBlock) && /CREATE POLICY bridge_devices_owner_update/.test(devBlock) && /NEW\.key_hash := OLD\.key_hash; NEW\.owner_id := OLD\.owner_id;/.test(devBlock) && /IF OLD\.revoked_at IS NOT NULL THEN NEW\.revoked_at := OLD\.revoked_at; END IF;/.test(devBlock),
     'M194: the client never inserts a device, may only rename/revoke, and a revoke is final');
  ok(/p\.id = NEW\.patient_id AND p\.doctor_id = NEW\.owner_id/.test(M) && /s\.id = NEW\.session_id AND s\.doctor_id = NEW\.owner_id AND s\.patient_id = NEW\.patient_id/.test(M)
     && /IF auth\.uid\(\) IS NOT NULL AND current_setting\('sydent\.bridge', true\) IS DISTINCT FROM '1' THEN/.test(M) && /IF NEW\.status NOT IN \('open', 'cancelled'\) OR OLD\.status <> 'open' THEN NEW\.status := OLD\.status; END IF;/.test(M),
     'M194: capture request — patient/session ownership guarded; the client opens or cancels only, the server alone completes');
  ok(/CONSTRAINT bridge_inbox_path_check CHECK \(storage_path LIKE \(owner_id::text \|\| '\/_inbox\/%'\)\)/.test(M) && (M.match(/AND NOT EXISTS \(SELECT 1 FROM public\.bridge_inbox b WHERE b\.storage_path = o\.name\)/g) || []).length === 2 && /'inbox',      \(SELECT count\(\*\) FROM public\.bridge_inbox b WHERE b\.owner_id = auth\.uid\(\)\)/.test(M),
     'M194: inbox objects live under _inbox in the owner folder and are not counted as orphans');
  ['bridge_pair(text, text, text, text)', 'bridge_auth(uuid, text, text)', 'bridge_open_requests(uuid)', 'bridge_upload_path(uuid, uuid, text, text)', 'bridge_complete(uuid, uuid, uuid, text, text, text, bigint)'].forEach(sig => {
    const re = new RegExp('REVOKE ALL ON FUNCTION public\\.' + sig.replace(/[()]/g, '\\$&') + ' FROM PUBLIC, anon, authenticated;\\nGRANT EXECUTE ON FUNCTION public\\.' + sig.replace(/[()]/g, '\\$&') + ' TO service_role;');
    ok(re.test(M), 'M194: service_role only — ' + sig.split('(')[0]);
  });
  ok(/GRANT EXECUTE ON FUNCTION public\.bridge_pairing_code\(text\) TO authenticated;/.test(M) && /IF public\.tenant_access_level\(v_uid\) <> 'full' THEN RAISE EXCEPTION 'subscription_read_only'/.test(M), 'M194: the owner mints codes (full subscription only)');
  const up = M.slice(M.indexOf('FUNCTION public.bridge_upload_path'), M.indexOf('FUNCTION public.bridge_complete'));
  ok(/IF public\.tenant_access_level\(p_owner\) <> 'full' THEN RETURN jsonb_build_object\('ok', false, 'reason', 'subscription'\); END IF;/.test(up) && /IF v_cap IS NOT NULL AND v_used >= v_cap THEN RETURN jsonb_build_object\('ok', false, 'reason', 'quota'\); END IF;/.test(up)
     && /IF p_mime NOT IN \('image\/jpeg', 'image\/png', 'image\/webp', 'application\/dicom'\)/.test(up) && /regexp_replace\(COALESCE\(p_name, 'capture'\), '\[\^A-Za-z0-9\._-\]\+', '-', 'g'\)/.test(up),
     'M194: device uploads pass the subscription gate, the quota, the mime list and an ASCII-safe name');
  const cp = M.slice(M.indexOf('FUNCTION public.bridge_complete'), M.indexOf('-- ── 6)'));
  ok(/IF FOUND AND p_path LIKE \(p_owner::text \|\| '\/' \|\| v_req\.patient_id::text \|\| '\/%'\) THEN/.test(cp) && /INSERT INTO public\.patient_documents\(/.test(cp) && /UPDATE public\.capture_requests SET status = 'done', done_at = now\(\), document_id = v_doc/.test(cp)
     && /IF p_path NOT LIKE \(p_owner::text \|\| '\/_inbox\/%'\) THEN RETURN jsonb_build_object\('ok', false, 'reason', 'path'\); END IF;/.test(cp), 'M194: complete — the patient row only inside that patient\'s folder, otherwise the inbox only under _inbox');
  ['capture_requests', 'bridge_inbox', 'bridge_devices'].forEach(t => ok(M.indexOf('ALTER PUBLICATION supabase_realtime ADD TABLE public.' + t + ';') > -1, 'M194: realtime — ' + t));

  /* (٢) الدالةُ الطرفية */
  const E = F['supabase/functions/bridge/index.ts'];
  let hashSeen = null;
  let r = await runEdge(E, { action: 'pair', code: 'abcd-2345', version: '1.0' }, (n, a) => { if (n === 'bridge_pair') { hashSeen = a.p_key_hash; return { data: { ok: true, device_id: 'd1', owner_id: 'o1', device_name: 'غرفة 1' } }; } return { data: null }; });
  ok(r.out.ok && /^[0-9a-f]{64}$/.test(r.out.key) && hashSeen === sha(r.out.key) && r.calls.rpc[0][1].p_code === 'ABCD2345' && !('owner_id' in r.out), 'edge pair: a fresh 64-hex key goes to the device, only its SHA-256 reaches the database; code normalised; owner id not returned');
  r = await runEdge(E, { action: 'pair', code: 'ABCD-234O' });
  ok(r.out.ok === false && r.out.reason === 'bad_code' && r.calls.rpc.length === 0, 'edge pair: a code with 0/O never reaches the database');
  r = await runEdge(E, { action: 'poll', device_id: 'nope', key: 'x' });
  ok(r.res.status === 401 && r.calls.rpc.length === 0, 'edge: malformed identity ⇒ 401 without a database call');
  const dev = '11111111-2222-4333-8444-555555555555', key = 'f'.repeat(64);
  r = await runEdge(E, { action: 'poll', device_id: dev, key }, (n) => n === 'bridge_auth' ? { data: null } : { data: [] });
  ok(r.res.status === 401 && r.calls.rpc[0][0] === 'bridge_auth' && r.calls.rpc[0][1].p_key_hash === sha(key), 'edge: an unknown/revoked key ⇒ 401 (hash compared, never the key)');
  r = await runEdge(E, { action: 'poll', device_id: dev, key }, (n) => n === 'bridge_auth' ? { data: 'owner-1' } : { data: [{ id: 'r1' }] });
  ok(r.out.ok && r.out.requests.length === 1 && r.calls.rpc[1][0] === 'bridge_open_requests' && r.calls.rpc[1][1].p_owner === 'owner-1', 'edge poll: the open requests of the device\'s own clinic');
  r = await runEdge(E, { action: 'upload', device_id: dev, key, request_id: 'bad', mime: 'image/png', name: 'PA 46.png', size: 1000 }, (n) => n === 'bridge_auth' ? { data: 'owner-1' } : { data: { ok: true, path: 'owner-1/_inbox/u-PA-46.png', request_id: null } });
  ok(r.out.ok && r.calls.rpc[1][1].p_request === null && r.calls.sign[0] === 'owner-1/_inbox/u-PA-46.png' && /\/upload\/sign\//.test(r.out.url) && r.out.path === 'owner-1/_inbox/u-PA-46.png', 'edge upload: the database decides the path; a malformed request id becomes null; a signed upload URL is returned');
  r = await runEdge(E, { action: 'upload', device_id: dev, key, mime: 'image/gif', name: 'x', size: 10 }, () => ({ data: 'owner-1' }));
  ok(r.out.ok === false && r.out.reason === 'type' && r.calls.rpc.length === 1, 'edge upload: a bad mime is refused before the database');
  r = await runEdge(E, { action: 'upload', device_id: dev, key, mime: 'image/png', name: 'x', size: 40 * 1048576 }, () => ({ data: 'owner-1' }));
  ok(r.out.reason === 'size', 'edge upload: above 30MB refused');
  r = await runEdge(E, { action: 'complete', device_id: dev, key, path: 'owner-1/_inbox/u-x.png', name: 'x.png', mime: 'image/png', size: 10 }, (n) => n === 'bridge_auth' ? { data: 'owner-1' } : { data: { ok: false, reason: 'subscription' } });
  ok(r.out.ok === false && r.out.reason === 'subscription' && r.calls.rm.length === 1 && r.calls.rm[0][0] === 'owner-1/_inbox/u-x.png', 'edge complete: a refused row removes the uploaded object (no orphan)');
  r = await runEdge(E, { action: 'complete', device_id: dev, key, path: 'other/x.png', name: 'x.png', mime: 'image/png', size: 10 }, () => ({ data: 'owner-1' }));
  ok(r.out.reason === 'path' && r.calls.rpc.length === 1, 'edge complete: a path outside the owner folder never reaches the database');
  ok(!/eyJ|sb_secret/.test(E) && /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(E) && /\[functions\.bridge\]\nverify_jwt = false/.test(F['supabase/config.toml']), 'edge: service key from the environment; verify_jwt=false declared');

  /* (٣) العيادة */
  const S = F['settings.html'];
  ok(/window\.sb\.rpc\('bridge_pairing_code', \{ p_device_name: name \}\)/.test(S) && /^async function brPair\(\) \{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/m.test(S) && /^async function brRevoke\(id\) \{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/m.test(S)
     && /update\(\{ revoked_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', id\)/.test(S) && /"brPair", "brRevoke"/.test(F['scripts/check-mirrors.js']), 'settings: the code comes from the server; pair/revoke guarded and classified as writes');
  const X = F['pp-xray.js'];
  ok(/^async function xrCapture\(preset\) \{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;\n  if \(!await xrHasDevice\(\)\) \{/m.test(X) && /\.is\('revoked_at', null\)/.test(X) && /xrOpenUpload\(null, null, \{ request: true, teeth: \(preset && preset\.teeth\) \|\| \[\], sessionId: preset && preset\.sessionId \}\);/.test(X),
     'capture: read-only guard, needs a paired (unrevoked) device, opens the sheet in request mode');
  ok(/document\.getElementById\('xrUpFiles'\)\.style\.display = _xrUp\.request \? 'none' : '';/.test(X) && /if \(_xrUp\.request\) \{ await xrSendCaptureRequest\(m\); return; \}/.test(X)
     && /var row = \{ owner_id: currentUser\.id, patient_id: patientId, category: 'xray', xray_type: m\.type, teeth: m\.teeth, session_id: _xrUp\.sessionId \|\| null \};/.test(X) && /from\('capture_requests'\)\.insert\(row\)/.test(X),
     'capture: the request carries patient · type · teeth · session, no files');
  ok(/update\(\{ status: 'cancelled' \}\)\.eq\('id', id\)\.eq\('status', 'open'\)/.test(X) && /\.in\('id', wereOpen\)\.eq\('status', 'done'\)/.test(X) && /showToast\('📥 وصلت صورة الجهاز إلى ملفات المريض'\)/.test(X) && /\{ t: 'capture_requests', filter: _pf \}, \{ t: 'bridge_inbox' \}/.test(F['patient-profile.html']) && /xrRequestsSync\(\)/.test(F['patient-profile.html']),
     'capture: cancel only an open request; arrival announced only when a request that was open here became done (v645)');
  const A = fnSrc(F['supabase-init.js'].replace(/\n  \}\n/g, '\n}\n'), '  async function assignInbox(item, patientId, opts){');
  ok(/storage\.from\(BUCKET\)\.move\(item\.storage_path, dest\)/.test(A) && A.indexOf('.move(item.storage_path, dest)') < A.indexOf("from('patient_documents').insert(row)") && A.indexOf("from('patient_documents').insert(row)") < A.indexOf("from('bridge_inbox').delete()")
     && /if \(readOnly\(\)\) return \{ ok:false, reason:'read' \};/.test(A) && /move\(dest, item\.storage_path\)/.test(A), 'inbox assign: object moved first, then the row, then the inbox row; a refused row moves the object back; read-only refused');
  ok(/^async function xrInboxOpen\(\) \{\n  if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/m.test(X) && /'pfCapture', 'xrGalCapture', 'xrCancelRequest', 'xrInboxOpen'/.test(F['scripts/check-mirrors.js']) && /\[onclick\*="pfCapture\("\]/.test(F['patient-profile.css']),
     'read-only: capture, cancel and inbox entries guarded and hidden');
  ok(/capture_requests: 'owner_id'/.test(F['supabase-init.js']) && /bridge_inbox: 'owner_id'/.test(F['supabase-init.js']) && /inbox: Number\(d\.inbox\) \|\| 0/.test(F['supabase-init.js']), 'live tenant columns + inbox count in the usage meter');
}

const FILES = ['migrations/194_bridge_core.sql', 'supabase/functions/bridge/index.ts', 'supabase/config.toml', 'settings.html', 'pp-xray.js', 'pp-extras.js', 'patient-profile.html', 'patient-profile.css', 'supabase-init.js', 'scripts/check-mirrors.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['client may insert devices', rep('migrations/194_bridge_core.sql', 'CREATE POLICY bridge_devices_owner_update ON public.bridge_devices FOR UPDATE', 'CREATE POLICY bridge_devices_owner_insert ON public.bridge_devices FOR INSERT WITH CHECK (true);\nCREATE POLICY bridge_devices_owner_update ON public.bridge_devices FOR UPDATE')],
  ['revoke reversible', rep('migrations/194_bridge_core.sql', '  IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;', '')],
  ['client completes requests', rep('migrations/194_bridge_core.sql', "      IF NEW.status NOT IN ('open', 'cancelled') OR OLD.status <> 'open' THEN NEW.status := OLD.status; END IF;", '')],
  ['tenant calls bridge_complete', rep('migrations/194_bridge_core.sql', 'REVOKE ALL ON FUNCTION public.bridge_complete(uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;', 'REVOKE ALL ON FUNCTION public.bridge_complete(uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon;')],
  ['quota skipped for devices', rep('migrations/194_bridge_core.sql', "  IF v_cap IS NOT NULL AND v_used >= v_cap THEN RETURN jsonb_build_object('ok', false, 'reason', 'quota'); END IF;", '')],
  ['inbox counted as orphans', rep('migrations/194_bridge_core.sql', "     AND NOT EXISTS (SELECT 1 FROM public.bridge_inbox b WHERE b.storage_path = o.name)\n   ORDER BY o.name", '   ORDER BY o.name')],
  ['raw key sent to the database', rep('supabase/functions/bridge/index.ts', 'p_key_hash: await sha256(deviceKey), p_version: version, p_mode', 'p_key_hash: deviceKey, p_version: version, p_mode')],
  ['owner id leaked at pairing', rep('supabase/functions/bridge/index.ts', 'return json(200, { ok: true, device_id: out.device_id, key: deviceKey, device_name: out.device_name });', 'return json(200, { ok: true, device_id: out.device_id, key: deviceKey, device_name: out.device_name, owner_id: out.owner_id });')],
  ['refused row keeps the object', rep('supabase/functions/bridge/index.ts', '      try { await admin.storage.from("patient-files").remove([path]); } catch (_e) { /* best effort */ }\n', '')],
  ['foreign path accepted', rep('supabase/functions/bridge/index.ts', 'if (!path.startsWith(owner + "/") || path.indexOf("..") > -1) return json(200, { ok: false, reason: "path" });', '')],
  ['capture without a device', rep('pp-xray.js', "  if (!await xrHasDevice()) {", '  if (false) {')],
  ['inbox row before the move', rep('supabase-init.js', "    var mv = await window.sb.storage.from(BUCKET).move(item.storage_path, dest);\n    if (mv.error) return { ok:false, reason:'storage', error: mv.error };\n", '')],
  ['pair without the read-only guard', rep('settings.html', "async function brPair() {\n  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;", 'async function brPair() {')]
];
(async () => {
  await suite(base);
  const bp = [pass, fail];
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
    [pass, fail] = bp;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-bridge-core: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-bridge-core: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
