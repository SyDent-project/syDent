/* v802 — مثبتُ «إعدادات العيادة تُقرأ مرةً واحدة» (SyDentCs بـsupabase-init.js) — مستقل، على الملف الحيّ.
   القياس الحيّ: كلُّ صفحةٍ كانت تقرأ صفَّ clinic_settings نفسَه 5–8 مرات عند فتحها (كلُّ قارئٍ بأعمدته). القرّاءُ لم
   يتغيّروا — طبقةُ fetch المشتركة تخدم القراءةَ البسيطة من قراءةٍ واحدة للصف كاملاً.
   (١) الخدمة: قراءاتٌ متزامنة ولاحقة ⇒ طلبٌ واحد · الإسقاطُ بأعمدته وترتيبها · شكلُ PostgREST (مصفوفة/كائن) · ردٌّ مستقل لكل قارئ.
   (٢) الحدود: كلُّ شكلٍ غير البسيط يمضي للشبكة كما هو · عمودٌ غائب · لا صف · فشلُ القراءة المشتركة · أكثر من صف.
   (٣) العزل والعمر: المفتاح = المالك + رمز الجلسة · TTL · الكتابة (الجدول/RPC) تُسقط المحفوظ عند بدئها وانتهائها.
   (٤) التوصيل: fetch المشترك يخدم قبل البوابة للقراءة فقط، والكتابةُ تمرّ بالبوابة ثم تُسقط المحفوظ.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const LIVE = fs.readFileSync(path.join(ROOT, 'supabase-init.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const ORIGIN = 'https://x.supabase.co', REST = ORIGIN + '/rest/v1/';
const ROW = { id: 'r1', owner_id: U1, clinic_name: 'عيادة', currency: 'SYP', ai_features_enabled: true, staff_msg_presets: ['أ', 'ب'], lock_pin_hash: null, patient_flag_defs: [{ k: 1 }] };
const tick = () => new Promise(r => setImmediate(r));

function harness(SRC, opt) {
  opt = opt || {};
  const a = SRC.indexOf('  var sydentCs = (function () {'), b = SRC.indexOf('  /* ═══ SyDentCs:end ═══ */');
  if (a < 0 || b < a) throw new Error('SyDentCs block not found');
  const st = { now: 1000000, calls: [], rows: opt.rows === undefined ? [ROW] : opt.rows, fail: opt.fail || null, gate: [] };
  const f = function (url, init) {
    const h = new Headers((init && init.headers) || {});
    st.calls.push({ url: String(url), method: (init && init.method) || 'GET', accept: h.get('Accept'), auth: h.get('Authorization'), apikey: h.get('apikey'), prefer: h.get('Prefer'), self: this });
    const isBase = /clinic_settings\?select=\*&owner_id=/.test(String(url));
    const answer = () => {
      if (st.fail === 'reject' && isBase) return Promise.reject(new Error('net'));
      if (st.fail === '500' && isBase) return Promise.resolve(new Response(JSON.stringify([{ clinic_name: 'جسمُ خطأ', currency: 'X' }]), { status: 500 }));
      if (st.fail === 'notjson' && isBase) return Promise.resolve(new Response('<html>', { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify(isBase ? st.rows : [{ direct: true }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    if (opt.gated && isBase) return new Promise(res => st.gate.push(() => res(answer())));
    return answer();
  };
  const win = {};
  const ctx = { window: win, URL, Headers, Response, Promise, JSON, Object, String, Array, encodeURIComponent, Date: { now: () => st.now } };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(a, b) + '\n;this.cs = sydentCs;', ctx);
  const cs = ctx.cs;
  const init = (o) => { o = o || {}; const h = { apikey: 'K', Authorization: 'Bearer ' + (o.tok || 'T1') };
    if (o.accept !== null) h.Accept = o.accept || 'application/json';
    if (o.prefer) h.Prefer = o.prefer; if (o.range) h.Range = o.range;
    const i = { method: o.method || 'GET', headers: o.plain ? h : new Headers(h) }; if (o.signal) i.signal = o.signal; return i; };
  const read = (cols, o) => { o = o || {}; const url = o.url || (REST + 'clinic_settings?select=' + encodeURIComponent(cols) + '&owner_id=eq.' + (o.owner || U1)); const i = init(o);
    const p = cs.serve(url, i, f, [url, i]); return p; };
  const bases = () => st.calls.filter(c => /clinic_settings\?select=\*&owner_id=/.test(c.url) && c.accept === 'application/json' && !c.direct);
  return { cs, st, f, read, init, win };
}
const baseCount = h => h.st.calls.filter(c => c.url.indexOf('select=*&owner_id=') > -1).length;
const body = async p => { const r = await p; return { status: r.status, ct: r.headers.get('Content-Type'), cr: r.headers.get('Content-Range'), json: await r.json() }; };

async function suite(SRC) {
  /* ── (١) الخدمة ── */
  let h = harness(SRC);
  const p1 = h.read('clinic_name,currency,ai_features_enabled'), p2 = h.read('staff_msg_presets'), p3 = h.read('lock_pin_hash'), p4 = h.read('ai_features_enabled,clinic_name');
  ok(p1 && p2 && p3 && p4 && typeof p1.then === 'function', 'serve: a simple read of the row is taken over');
  const [b1, b2, b3, b4] = [await body(p1), await body(p2), await body(p3), await body(p4)];
  ok(h.st.calls.length === 1 && baseCount(h) === 1 && h.st.calls[0].url === REST + 'clinic_settings?select=*&owner_id=eq.' + U1, 'serve: four readers ⇒ one request for the whole row');
  ok(h.st.calls[0].auth === 'Bearer T1' && h.st.calls[0].apikey === 'K' && h.st.calls[0].accept === 'application/json' && h.st.calls[0].method === 'GET' && !h.st.calls[0].prefer, 'serve: the shared read carries the session token and key of the readers, as a plain JSON read');
  ok(JSON.stringify(b1.json) === JSON.stringify([{ clinic_name: 'عيادة', currency: 'SYP', ai_features_enabled: true }]), 'serve: each reader gets exactly its columns, in its order, as a one-row array');
  ok(JSON.stringify(b4.json) === JSON.stringify([{ ai_features_enabled: true, clinic_name: 'عيادة' }]) && JSON.stringify(b2.json) === JSON.stringify([{ staff_msg_presets: ['أ', 'ب'] }]), 'serve: column order follows the request; nested values intact');
  ok(JSON.stringify(b3.json) === '[{"lock_pin_hash":null}]', 'serve: a null column is a real null, not a missing key');
  ok(b1.status === 200 && /^application\/json/.test(b1.ct) && b1.cr === '0-0/*', 'serve: answered in PostgREST\'s shape (200 · JSON · content-range)');
  const o1 = await body(h.read('clinic_name', { accept: 'application/vnd.pgrst.object+json' }));
  ok(JSON.stringify(o1.json) === '{"clinic_name":"عيادة"}' && /vnd\.pgrst\.object\+json/.test(o1.ct) && o1.cr === null, 'serve: .single() readers get an object');
  const s1 = await body(h.read('*'));
  ok(JSON.stringify(s1.json) === JSON.stringify([ROW]) && baseCount(h) === 1, 'serve: select=* is the whole row from the same read');
  const n1 = await body(h.read('clinic_name', { accept: null })), n2 = await body(h.read('clinic_name', { accept: '*/*' })), n3 = await body(h.read('clinic_name', { plain: true }));
  ok(n1.json[0].clinic_name === 'عيادة' && n2.json[0].clinic_name === 'عيادة' && n3.json[0].clinic_name === 'عيادة' && h.st.calls.length === 1, 'serve: no Accept / */* / plain-object headers are served the same way');
  const two = [await h.read('clinic_name'), await h.read('clinic_name')];
  ok(two[0] !== two[1] && (await two[0].json())[0].clinic_name === 'عيادة' && (await two[1].json())[0].clinic_name === 'عيادة', 'serve: every reader gets its own response (bodies are independently readable)');
  h.st.now += 6000; await body(h.read('currency'));
  ok(h.st.calls.length === 1, 'age: a reader a few seconds later (same page-open burst) still needs no request');
  h.st.now += 5000; await body(h.read('currency'));
  ok(baseCount(h) === 2 && h.st.calls.length === 2, 'age: after ' + h.cs._ttl + 'ms the row is read again — a page left open never serves an old copy');
  /* ── (٢) الحدود ── */
  h = harness(SRC);
  const rUnknown = h.read('clinic_name,column_from_the_future'), rKnown = h.read('clinic_name');
  const u = await body(rUnknown), k = await body(rKnown);
  ok(u.json[0].direct === true && h.st.calls.length === 2 && h.st.calls[1].url.indexOf('column_from_the_future') > -1 && k.json[0].clinic_name === 'عيادة', 'limits: a column the row does not have goes to the database itself (its error, its fallbacks) — other readers unaffected');
  const pass_through = [
    ['an extra filter', { url: REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1 + '&id=eq.5' }],
    ['a limit', { url: REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1 + '&limit=1' }],
    ['an order', { url: REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1 + '&order=id' }],
    ['no owner filter', { url: REST + 'clinic_settings?select=clinic_name' }],
    ['an owner list', { url: REST + 'clinic_settings?select=clinic_name&owner_id=in.(' + U1 + ')' }],
    ['a non-uuid owner', { url: REST + 'clinic_settings?select=clinic_name&owner_id=eq.abc' }],
    ['an embedded select', { url: REST + 'clinic_settings?select=' + encodeURIComponent('clinic_name,doctors(name)') + '&owner_id=eq.' + U1 }],
    ['an aliased column', { url: REST + 'clinic_settings?select=' + encodeURIComponent('n:clinic_name') + '&owner_id=eq.' + U1 }],
    ['a cast', { url: REST + 'clinic_settings?select=' + encodeURIComponent('clinic_name::text') + '&owner_id=eq.' + U1 }],
    ['a repeated select', { url: REST + 'clinic_settings?select=clinic_name&select=currency&owner_id=eq.' + U1 }],
    ['another table', { url: REST + 'patients?select=name&owner_id=eq.' + U1 }],
    ['another API root', { url: ORIGIN + '/proxy/rest/v1/clinic_settings?select=clinic_name&owner_id=eq.' + U1 }],
    ['a look-alike table', { url: REST + 'clinic_settings_audit?select=clinic_name&owner_id=eq.' + U1 }],
    ['a count request', { prefer: 'count=exact' }], ['a ranged request', { range: '0-9' }],
    ['a cancellable request', { signal: {} }], ['a CSV request', { accept: 'text/csv' }],
    ['HEAD', { method: 'HEAD' }], ['PATCH', { method: 'PATCH' }], ['POST', { method: 'POST' }], ['DELETE', { method: 'DELETE' }]
  ];
  const leaked = pass_through.filter(([, o]) => h.read('clinic_name', o) !== null).map(x => x[0]);
  ok(leaked.length === 0, 'limits: only the exact simple read is taken over — left alone: ' + pass_through.length + ' other shapes' + (leaked.length ? ' (TAKEN: ' + leaked.join(', ') + ')' : ''));
  const noTok = h.cs.serve(REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1, { method: 'GET', headers: { apikey: 'K' } }, h.f, []);
  ok(noTok === null && h.cs.serve({ url: REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1 }, h.init(), h.f, []) === null, 'limits: a request with no session token, or not given as a URL string, is left alone');
  h = harness(SRC, { rows: [] });
  const e1 = await body(h.read('clinic_name')), e2 = await body(h.read('currency')); h.st.now += 3000; const e3 = await body(h.read('lock_pin_hash'));
  ok(e1.json[0].direct && e2.json[0].direct && e3.json[0].direct && baseCount(h) === 1 && h.st.calls.length === 4, 'limits: no settings row yet ⇒ every reader asks the database itself, with no repeated shared read');
  h = harness(SRC, { rows: [ROW, ROW] });
  ok((await body(h.read('clinic_name'))).json[0].direct === true, 'limits: more than one row is never guessed from');
  for (const mode of ['reject', '500', 'notjson']) {
    h = harness(SRC, { fail: mode });
    const f1 = await body(h.read('clinic_name')), f2 = await body(h.read('currency'));
    const afterFail = h.st.calls.length;
    h.st.fail = null; const f3 = await body(h.read('clinic_name'));
    ok(f1.json[0].direct && f2.json[0].direct && f3.json[0].clinic_name === 'عيادة' && baseCount(h) >= 2 && afterFail >= 3, 'limits: a failed shared read (' + mode + ') sends readers to the network and is not remembered');
  }
  /* ── (٣) العزل والعمر ── */
  h = harness(SRC);
  await body(h.read('clinic_name')); await body(h.read('clinic_name', { tok: 'T2' })); await body(h.read('clinic_name', { owner: U2 }));
  ok(baseCount(h) === 3 && h.st.calls[1].auth === 'Bearer T2' && h.st.calls[2].url.indexOf(U2) > -1, 'isolation: another session token or another owner never shares a read');
  h = harness(SRC);
  ok(h.cs.writes(REST + 'clinic_settings?owner_id=eq.' + U1, { method: 'PATCH' }) && h.cs.writes(REST + 'clinic_settings?on_conflict=owner_id', { method: 'POST' }) && h.cs.writes(REST + 'clinic_settings?owner_id=eq.' + U1, { method: 'DELETE' })
    && h.cs.writes(REST + 'rpc/save_something', { method: 'POST' }), 'writes: any write to the table, or an RPC, may change the row');
  ok(!h.cs.writes(REST + 'clinic_settings?select=*', { method: 'GET' }) && !h.cs.writes(REST + 'clinic_settings?select=*') && !h.cs.writes(REST + 'patients?id=eq.1', { method: 'PATCH' }) && !h.cs.writes(REST + 'clinic_settings_audit', { method: 'POST' })
    && !h.cs.writes(REST + 'rpc/touch_presence', { method: 'POST' }) && !h.cs.writes(REST + 'rpc/my_subscription_state', { method: 'POST' }) && !h.cs.writes(ORIGIN + '/auth/v1/token', { method: 'POST' }), 'writes: reads, other tables, auth and the periodic presence/subscription calls do not');
  /* القائمةُ الهادئة مبرَّرةٌ من القاعدة نفسها: consent_sync لا يذكر الجدول بأي تعريفٍ له، وtouch_presence لا يكتب إلا last_seen_at */
  const mig = f => fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  const quiet = (/var RPC_QUIET = \{([^}]*)\};/.exec(SRC.slice(SRC.indexOf('var sydentCs = (function'))) || ['', ''])[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort();
  ok(quiet.join() === 'consent_sync,my_subscription_state,touch_presence', 'writes: the quiet RPC list is exactly the three audited calls (found: ' + quiet.join() + ')');
  /* كلُّ هجرةٍ تعرّف consent_sync أو _consent_sync (الحاليةُ وكلُّ ما يأتي بعدها) لا تذكر جدولَ الإعدادات */
  const consentMigs = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => /\.sql$/.test(f) && /FUNCTION public\._?consent_sync\(/.test(mig(f)));
  ok(consentMigs.length >= 4 && consentMigs.every(f => mig(f).indexOf('clinic_settings') === -1) && !h.cs.writes(REST + 'rpc/consent_sync', { method: 'POST' }), 'writes: consent_sync never touches the settings table (every migration that defines it: ' + consentMigs.map(f => f.slice(0, 3)).join(' · ') + '), so it keeps the row');
  const tp = /CREATE OR REPLACE FUNCTION "public"\."touch_presence"\(\)[\s\S]*?\n\$\$;/.exec(schema);
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
  ok(!!tp && (tp[0].match(/clinic_settings/g) || []).length === 1 && tp[0].indexOf('UPDATE public.clinic_settings SET last_seen_at = now() WHERE owner_id = auth.uid();') > -1
    && code.indexOf('last_seen_at') === -1, 'writes: touch_presence only stamps last_seen_at, a column the shared client code never reads');
  await body(h.read('clinic_name')); h.cs.invalidate(); await body(h.read('clinic_name'));
  ok(baseCount(h) === 2, 'writes: after an invalidation the next reader reads from the database');
  h = harness(SRC, { gated: true });
  const g1 = h.read('clinic_name'); await tick(); h.cs.invalidate(); const g2 = h.read('clinic_name'); await tick();
  ok(h.st.gate.length === 2, 'writes: a reader arriving after a write started never joins a shared read that began before it');
  h.st.gate.forEach(fn => fn()); ok((await body(g1)).json[0].clinic_name === 'عيادة' && (await body(g2)).json[0].clinic_name === 'عيادة', 'writes: both reads still complete');
  /* ── (٤) التوصيل بـfetch المشترك ── */
  const a = SRC.indexOf('      fetch: function (input, init) {\n        var f = (window.SyDentOffline'), b = SRC.indexOf('\n      }\n    }\n  });', a);
  ok(a > -1 && b > a && SRC.indexOf('  /* ═══ SyDentCs:end ═══ */') < a, 'wiring: the shared client fetch is found, after the settings module');
  h = harness(SRC);
  const log = []; let denied = null;
  const win = { fetch: function (url, init) { log.push((init && init.method || 'GET') + ' ' + String(url).split('/rest/v1/')[1]); return h.f.call(this, url, init); },
    SyLive: { noteWrite: (i, n) => { log.push('note:' + (n && n.method || 'GET')); return null; } },
    SyDentSub: { writeGate: (i, n) => { log.push('gate:' + (n && n.method || 'GET')); return denied ? Promise.resolve(denied) : null; } } };
  const fx = new Function('window', 'sydentCs', 'return {' + SRC.slice(a, b) + '\n      } };')(win, h.cs).fetch;
  const rd = cols => { const url = REST + 'clinic_settings?select=' + cols + '&owner_id=eq.' + U1; return fx(url, h.init()); };
  const w1 = await (await rd('clinic_name')).json(), w2 = await (await rd('currency')).json();
  ok(w1[0].clinic_name === 'عيادة' && w2[0].currency === 'SYP' && log.filter(x => /^GET clinic_settings/.test(x)).length === 1, 'wiring: two settings reads through the real client fetch ⇒ one network request');
  ok(log.indexOf('note:GET') === -1, 'wiring: a served read is not reported to SyLive as traffic of its own');
  log.length = 0; h.st.rows = [Object.assign({}, ROW, { clinic_name: 'اسم جديد' })];
  await fx(REST + 'clinic_settings?owner_id=eq.' + U1, h.init({ method: 'PATCH' }));
  const w3 = await (await rd('clinic_name')).json();
  ok(w3[0].clinic_name === 'اسم جديد' && log.join().indexOf('gate:PATCH') > -1 && log.filter(x => /^GET clinic_settings/.test(x)).length === 1, 'wiring: a save to the settings goes through the subscription gate, and the next read is fresh from the database');
  log.length = 0; h.st.rows = [Object.assign({}, ROW, { clinic_name: 'بعد RPC' })];
  await fx(REST + 'rpc/save_clinic_profile', h.init({ method: 'POST' }));
  ok((await (await rd('clinic_name')).json())[0].clinic_name === 'بعد RPC', 'wiring: an RPC is treated as a possible settings write');
  log.length = 0; h.st.rows = [Object.assign({}, ROW, { clinic_name: 'لا يُقرأ' })];
  await fx(REST + 'rpc/touch_presence', h.init({ method: 'POST' })); await fx(REST + 'patients?id=eq.1', h.init({ method: 'PATCH' }));
  ok((await (await rd('clinic_name')).json())[0].clinic_name === 'بعد RPC' && log.filter(x => /^GET clinic_settings/.test(x)).length === 0, 'wiring: the presence ping and writes to other tables do not throw the row away');
  /* كتابةٌ جارية: قارئٌ أثناءها ثم بعدها ⇒ قراءتان من القاعدة (السقوطُ عند البدء وعند الانتهاء) */
  h = harness(SRC); let relW = null; const log2 = [];
  const win2 = { fetch: function (url, init) { const m = (init && init.method) || 'GET'; log2.push(m + ' ' + String(url).split('/rest/v1/')[1].split('&')[0]);
    if (m === 'PATCH') return new Promise(r => { relW = () => r(new Response('[]', { status: 200 })); }); return h.f.call(this, url, init); } };
  const fx2 = new Function('window', 'sydentCs', 'return {' + SRC.slice(a, b) + '\n      } };')(win2, h.cs).fetch;
  const rd2 = () => fx2(REST + 'clinic_settings?select=clinic_name&owner_id=eq.' + U1, h.init());
  await (await rd2()).json();
  const wp = fx2(REST + 'clinic_settings?owner_id=eq.' + U1, h.init({ method: 'PATCH' })); await tick();
  await (await rd2()).json(); relW(); await wp; await tick();
  await (await rd2()).json();
  ok(log2.filter(x => /^GET clinic_settings/.test(x)).length === 3, 'wiring: the row is dropped when a write starts and again when it settles — a read during a save is never kept past it');
  denied = { denied: true }; h = harness(SRC); const log3 = [];
  const win3 = { fetch: function (url, init) { log3.push((init && init.method) || 'GET'); return h.f.call(this, url, init); }, SyDentSub: { writeGate: (i, n) => ((n && n.method) === 'PATCH' ? Promise.resolve({ denied: true }) : null) } };
  const fx3 = new Function('window', 'sydentCs', 'return {' + SRC.slice(a, b) + '\n      } };')(win3, h.cs).fetch;
  const dres = await fx3(REST + 'clinic_settings?owner_id=eq.' + U1, h.init({ method: 'PATCH' }));
  ok(dres && dres.denied === true && log3.length === 0, 'wiring: a write refused by the subscription gate still never reaches the network');
}

(async () => {
  await suite(LIVE);
  const bp = pass, bf = fail;
  if (!process.argv.includes('--self-test')) { console.log((fail === 0 ? '✅' : '❌') + ' prove-settings-once: ' + pass + '/' + (pass + fail)); process.exit(fail === 0 ? 0 : 1); }
  const MUT = [
    ['every reader fetches for itself (coalescing off)', "        var csHit = sydentCs.serve(input, init, f, args);\n        if (csHit) return csHit;\n", ""],
    ['served forever (no age limit)', "if (!slot || (slot.at && Date.now() - slot.at > TTL_MS)) {", "if (!slot) {"],
    ['whole row leaked to a column reader', "        if (q.sel === '*') out = row;\n        else {", "        if (true) out = row;\n        else {"],
    ['missing column served as absent', "            if (!Object.prototype.hasOwnProperty.call(row, cols[i])) return direct();     /* عمودٌ لا تعرفه القاعدة ⇒ خطؤها هي */\n", ""],
    ['object readers get an array', "new Response(JSON.stringify(q.obj ? out : [out])", "new Response(JSON.stringify([out])"],
    ['token not part of the key', "var key = q.owner.toLowerCase() + '|' + q.auth, slot = slots[key];", "var key = q.owner.toLowerCase(), slot = slots[key];"],
    ['owner not part of the key', "var key = q.owner.toLowerCase() + '|' + q.auth, slot = slots[key];", "var key = q.auth, slot = slots[key];"],
    ['writes taken over', "        if (String((init && init.method) || 'GET').toUpperCase() !== 'GET') return null;\n", ""],
    ['extra filters ignored', "if (keys.length !== 2 || keys.indexOf('select') < 0 || keys.indexOf('owner_id') < 0) return null;", "if (keys.indexOf('select') < 0 || keys.indexOf('owner_id') < 0) return null;"],
    ['complex selects taken over', "if (!COLS_RE.test(sel) || !OWNER_RE.test(owner)) return null;", "if (!OWNER_RE.test(owner)) return null;"],
    ['owner filter shape unchecked', "if (!COLS_RE.test(sel) || !OWNER_RE.test(owner)) return null;", "if (!COLS_RE.test(sel)) return null;"],
    ['look-alike table taken over', "        if (u.pathname !== PATH) return null;\n", ""],
    ['count / range requests taken over', "if (!auth || h.get('Prefer') || h.get('Range')) return null;", "if (!auth) return null;"],
    ['tokenless request taken over', "if (!auth || h.get('Prefer') || h.get('Range')) return null;", "if (h.get('Prefer') || h.get('Range')) return null;"],
    ['cancellable request taken over', "        if (init && init.signal) return null;\n", ""],
    ['non-JSON request taken over', "        if (!obj && acc && acc.indexOf('application/json') < 0 && acc.indexOf('*/*') < 0) return null;\n", ""],
    ['failed read remembered', "if (row === null) { if (slots[key] === used) delete slots[key]; return direct(); }   /* فشلٌ لا يُحفَظ */", "if (row === null) { return direct(); }"],
    ['empty account re-reads on every reader', "            if (rows.length === 0) return EMPTY;\n", "            if (rows.length === 0) return null;\n"],
    ['two rows guessed from', "return (rows.length === 1 && rows[0] && typeof rows[0] === 'object') ? rows[0] : null;", "return (rows[0] && typeof rows[0] === 'object') ? rows[0] : null;"],
    ['error body parsed as a row', "return (res && res.ok) ? res.json() : null;", "return res.json();"],
    ['shared read drops the session token', "var bh = new Headers(q.headers); bh.set('Accept', 'application/json');", "var bh = new Headers({ Accept: 'application/json' });"],
    ['save does not drop the row', "          if (csW) sydentCs.invalidate();\n", ""],
    ['row kept past a save that was in flight', "          if (csW) { try { p.then(sydentCs.invalidate, sydentCs.invalidate); } catch (e3) {} }\n", ""],
    ['table write not seen as a write', "        if (p === 'clinic_settings') return true;\n", ""],
    ['RPC not seen as a write', "return p.indexOf('rpc/') === 0 && !RPC_QUIET[p.slice(4)];", "return false;"],
    ['presence ping drops the row every minute', "return p.indexOf('rpc/') === 0 && !RPC_QUIET[p.slice(4)];", "return p.indexOf('rpc/') === 0;"],
    ['unaudited RPC made quiet', "var RPC_QUIET = { touch_presence: 1, my_subscription_state: 1, consent_sync: 1 };\n    var EMPTY", "var RPC_QUIET = { touch_presence: 1, my_subscription_state: 1, consent_sync: 1, save_clinic_profile: 1 };\n    var EMPTY"],
    ['every write drops the row', "        if (p === 'clinic_settings') return true;\n", "        if (p) return true;\n"],
    ['content-range missing on arrays', "        if (!q.obj) hd['Content-Range'] = '0-0/*';\n", ""]
  ];
  let bit = 0; const lg = console.log;
  for (const [name, x, y] of MUT) {
    if (LIVE.split(x).length !== 2) { console.log('❌ طفرة لا تطابق المصدر: ' + name); process.exit(1); }
    pass = 0; fail = 0; console.log = () => {};
    try { await suite(LIVE.replace(x, y)); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED: ' + name);
  }
  const all = bit === MUT.length;
  console.log((bf === 0 && all ? '✅' : '❌') + ' prove-settings-once: ' + bp + '/' + (bp + bf) + ' · mutants ' + bit + '/' + MUT.length);
  process.exit(bf === 0 && all ? 0 : 1);
})();
