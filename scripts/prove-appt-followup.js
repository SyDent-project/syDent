/* prove-appt-followup.js — ج2-ب-2: زيارةٌ انتهت بلا علاجٍ مربوط ومريضُها له علاجٌ «قيد الإنجاز» ⇒ سؤالٌ واحد
   «هل كانت متابعةً له؟» على appt-followup.js وsy-modal.js الحيّين (jsdom) فوق قاعدةٍ وهمية بدلالة RLS/M210:
   (١) متى يُسأل ومتى يصمت · (٢) «نعم» = session_followup_add بيوم الموعد وطبيبه ثم ربطُها بالموعد · (٣) «لا» = صفرُ كتابة ·
   (٤) أكثر من علاج ⇒ SyDialog.choose الحقيقي · (٥) الخطّافات الخمسة بالصفحات الثلاث · (٦) الإنجليزية بالمحرّك الحقيقي.
   --self-test: كلُّ طفرةٍ يجب أن تحمّر (mutant-pool). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت متابعة الموعد (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const { runMutants } = require('./mutant-pool');

const FILES = ['appt-followup.js', 'sy-modal.js', 'theme.css', 'theme.js', 'i18n-en.js', 'appt-time.js', 'index.html', 'appointments.html', 'pp-appt.js', 'patient-profile.html',
  'pp-followup.js', 'scripts/cache-bust.sh', 'scripts/validate.sh'];
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
const AR = /[؀-ۿ]/;
const TODAY = '2026-11-18';

/* القاعدةُ الوهمية: from(t).select().eq().is().in().limit().maybeSingle() · update().eq().eq() · rpc */
const STUBS = `
  window.__TOASTS = []; window.__RPC = []; window.__UPD = []; window.__Q = []; window.__AUDIT = []; window.__EV = []; window.__ro = false; window.__inactive = false; window.__rpcFail = null; window.__provBad = false;
  window.toDay = function () { return '${TODAY}'; };
  window.showToast = function (m) { window.__TOASTS.push(String(m)); };
  window.logAudit = function (a, o) { window.__AUDIT.push({ a: a, o: o }); };
  window.SyDentSub = { isReadOnly: function () { return window.__ro; } };
  window.SyDentLock = { isDoctorAccountInactive: function () { return window.__inactive; } };
  window.addEventListener('sy:followup-added', function (e) { window.__EV.push(e.detail); });
  window.__DB = { appointments: [], ledger_sessions: [] }; var __n = 0;
  function Q(t) {
    var q = { t: t, f: [], op: 'select', patch: null, lim: null, one: false };
    var api = {
      select: function () { return api; },
      eq: function (c, v) { q.f.push(function (r) { return String(r[c]) === String(v); }); q.f[q.f.length - 1].k = c + '=' + v; return api; },
      is: function (c, v) { q.f.push(function (r) { return (r[c] == null) === (v === null); }); q.f[q.f.length - 1].k = c + ' is ' + v; return api; },
      in: function (c, vs) { q.f.push(function (r) { return vs.map(String).indexOf(String(r[c])) > -1; }); q.f[q.f.length - 1].k = c + ' in'; return api; },
      limit: function (n) { q.lim = n; return api; },
      maybeSingle: function () { q.one = true; return api; },
      update: function (p) { q.op = 'update'; q.patch = p; return api; },
      then: function (res, rej) {
        window.__Q.push({ t: t, op: q.op, k: q.f.map(function (f) { return f.k; }) });
        var rows = (window.__DB[t] || []).filter(function (r) { return q.f.every(function (f) { return f(r); }); });
        if (q.op === 'update') { window.__UPD.push({ t: t, p: q.patch, k: q.f.map(function (f) { return f.k; }) }); rows.forEach(function (r) { Object.assign(r, q.patch); }); return Promise.resolve({ data: null, error: null }).then(res, rej); }
        if (q.lim != null) rows = rows.slice(0, q.lim);
        var data = q.one ? (rows[0] ? JSON.parse(JSON.stringify(rows[0])) : null) : JSON.parse(JSON.stringify(rows));
        return Promise.resolve({ data: data, error: null }).then(res, rej);
      }
    };
    return api;
  }
  window.sb = { from: Q, rpc: function (fn, a) {
    window.__RPC.push({ fn: fn, a: a });
    if (window.__rpcFail) return Promise.resolve({ data: null, error: { message: window.__rpcFail } });
    if (window.__provBad && a.p_provider) return Promise.resolve({ data: null, error: { message: 'followup_provider_invalid' } });
    var b = window.__DB.ledger_sessions.filter(function (x) { return x.id === a.p_parent; })[0];
    if (fn !== 'session_followup_add' || !b || b.parent_id || b.status !== 'completed') return Promise.resolve({ data: null, error: { message: 'followup_base_invalid' } });
    var c = { id: 'k' + (++__n), doctor_id: b.doctor_id, patient_id: b.patient_id, type: 'متابعة — ' + b.type, description: a.p_step, notes: a.p_notes, cost: 0, date: a.p_date,
      status: 'completed', provider_id: a.p_provider || b.provider_id, parent_id: b.id, appointment_id: null, followup_state: null };
    window.__DB.ledger_sessions.push(c); b.followup_state = a.p_close ? 'closed' : 'open';
    return Promise.resolve({ data: { session: JSON.parse(JSON.stringify(c)), state: b.followup_state }, error: null });
  } };
`;
const A = (id, o) => Object.assign({ id, doctor_id: 'doc', patient_id: 'p1', date: TODAY, provider_id: 'd2', is_planned: false, status: 'confirmed' }, o || {});
const S = (id, o) => Object.assign({ id, doctor_id: 'doc', patient_id: 'p1', type: 'RCT', tooth_num: '36', quadrant: null, arch: null, date: '2026-11-08', cost: 7000, status: 'completed',
  provider_id: 'd1', parent_id: null, followup_state: 'open', appointment_id: null }, o || {});

function boot(F) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e && (e.detail || e.message || e))));
  const html = '<!doctype html><html dir="rtl" lang="ar"><body><script>' + STUBS + '</script><script>' + F['sy-modal.js'] + '</script><script>' + F['appt-followup.js'] + '</script></body></html>';
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  dom.window.__errors = errors;
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 10)));
}
const tick = (w, ms) => new Promise(r => w.setTimeout(r, ms || 20));
const dlg = w => w.document.querySelector('.sy-dialog');
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
async function answer(w, act) {   /* ينتظر الحوار ثم يضغط: 'ok' · 'cancel' · رقمُ خيار */
  for (let i = 0; i < 50 && !dlg(w); i++) await tick(w, 5);
  const d = dlg(w); if (!d) return null;
  const info = { kind: d.getAttribute('data-sy-kind'), title: txt(d.querySelector('.modal-head h3')), msg: txt(d.querySelector('.sy-dialog-msg')),
    msgLines: Array.from(d.querySelector('.sy-dialog-msg') ? d.querySelector('.sy-dialog-msg').childNodes : []).filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).filter(Boolean),
    ok: txt(d.querySelector('.btn-sy-ok')), cancel: txt(d.querySelector('.btn-sy-cancel')),
    choices: Array.from(d.querySelectorAll('.sy-dialog-choice')).map(b => ({ l: txt(b.querySelector('.sy-dialog-choice-l')), s: txt(b.querySelector('.sy-dialog-choice-s')) })),
    html: d.innerHTML };
  if (act === 'ok') d.querySelector('.btn-sy-ok').click();
  else if (act === 'cancel') d.querySelector('.btn-sy-cancel').click();
  else if (act === 'esc') d.querySelector('[data-sy-close]').click();
  else d.querySelectorAll('.sy-dialog-choice')[act].click();
  return info;
}
function engine(F) {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/appointments.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(), write() {}, querySelector: () => null, getElementById: () => null,
      addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const theme = F['theme.js'], start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(F['i18n-en.js'], ctx); vm.runInContext(theme.slice(start, end), ctx);
  return s => ctx.window.SyI18n.t(s);
}
function extractFunction(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}

async function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]), bag = [];
  /* كلُّ قسمٍ بمهلة: وعدٌ معلّق (حوارٌ لم يُجب) كان يُفرغ حلقةَ الأحداث فيخرج Node بصمتٍ وبرمز 0 — والصمتُ هنا نجاحٌ كاذب */
  const guard = async (name, fn) => {
    let timer;
    try { await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('hung — a dialog or a call never settled')), 10000); })]); }
    catch (e) { ok(false, name + ' — threw: ' + (e && e.message)); }
    finally { clearTimeout(timer); }
  };

  /* (١) سؤالٌ واحد · «نعم» */
  await guard('yes', async () => {
    const w = await boot(F); w.__DB.appointments.push(A('a1')); w.__DB.ledger_sessions.push(S('b1'), S('pl', { status: 'planned', followup_state: null, type: 'Filling' }), S('plain', { followup_state: null, type: 'Consult' }));
    const p = w.SyApptFu.offer('a1'); const q = await answer(w, 'ok'); const r = await p; await tick(w);
    ok(w.__errors.length === 0, 'boots clean' + (w.__errors.length ? ' — ' + w.__errors[0].slice(0, 120) : ''));
    ok(q && q.kind === 'confirm' && q.title === 'زيارة متابعة؟' && q.msgLines[0] === 'للمريض علاجٌ قيد الإنجاز: «RCT — سن 36».' && q.ok === '🔁 سجّلها متابعة' && q.cancel === 'لا',
      'one treatment in progress ⇒ one plain question naming it (name and place)');
    const c = w.__RPC[0] || { a: {} };
    ok(w.__RPC.length === 1 && c.fn === 'session_followup_add' && JSON.stringify(c.a) === JSON.stringify({ p_parent: 'b1', p_date: TODAY, p_provider: 'd2', p_step: null, p_notes: null, p_close: false }),
      '«نعم» ⇒ one atomic add on the appointment day with the appointment doctor — no money, no place, not closing the treatment');
    const kid = w.__DB.ledger_sessions.find(x => x.parent_id === 'b1');
    ok(kid && kid.appointment_id === 'a1' && w.__UPD.length === 1 && w.__UPD[0].t === 'ledger_sessions' && JSON.stringify(w.__UPD[0].p) === '{"appointment_id":"a1"}' && w.__UPD[0].k.join() === 'id=' + kid.id + ',doctor_id=doc',
      'the follow-up is linked to the appointment (scoped to its clinic) — so it is never asked again');
    ok(r && r.session && r.session.id === kid.id && r.base.id === 'b1' && w.__EV.length === 1 && w.__EV[0].baseId === 'b1' && w.__EV[0].apptId === 'a1' && w.__EV[0].session.appointment_id === 'a1',
      'the result and the «sy:followup-added» event carry the session for the patient card');
    ok(w.__AUDIT.length === 1 && w.__AUDIT[0].a === 'session.create' && /^جلسة متابعة من موعد: RCT — سن 36 \(/.test(w.__AUDIT[0].o.description) && /سُجّلت جلسة متابعة لـ «RCT — سن 36»/.test(w.__TOASTS.slice(-1)[0]),
      'audit trail and toast name the treatment');
    w.__RPC.length = 0; const nQ = w.__Q.length;
    ok(await w.SyApptFu.offer('a1') === null && w.__Q.length === nQ && !dlg(w), 'asked once per appointment on a page (a second trigger does not even read)');
    bag.push({ t: q.title }, { t: q.ok }, { t: q.cancel }); q.msgLines.forEach(t => bag.push({ t })); w.__TOASTS.forEach(t => bag.push({ t }));
    w.close();
  });

  /* (٢) «لا» · الصمت */
  await guard('no', async () => {
    const w = await boot(F); w.__DB.appointments.push(A('a1')); w.__DB.ledger_sessions.push(S('b1'));
    const p = w.SyApptFu.offer('a1'); await answer(w, 'cancel'); const r = await p;
    ok(r === null && w.__RPC.length === 0 && w.__UPD.length === 0 && w.__EV.length === 0 && w.__TOASTS.length === 0, '«لا» writes nothing and says nothing');
    w.close();
    const silent = async (label, appt, sess, pre) => {
      const v = await boot(F); v.__DB.appointments.push(appt); sess.forEach(s => v.__DB.ledger_sessions.push(s)); if (pre) pre(v);
      const r2 = await v.SyApptFu.offer(appt.id); await tick(v, 30);
      ok(r2 === null && !dlg(v) && v.__RPC.length === 0 && v.__UPD.length === 0, 'silent: ' + label);
      v.close();
    };
    await silent('an appointment with any linked session (its treatments were the visit)', A('a2'), [S('b1'), S('x', { followup_state: null, appointment_id: 'a2', status: 'planned' })]);
    await silent('a linked session even if completed', A('a2'), [S('b1'), S('x', { followup_state: null, appointment_id: 'a2' })]);
    await silent('no treatment in progress', A('a3'), [S('b1', { followup_state: null }), S('b2', { followup_state: 'closed' })]);
    await silent('another patient\'s treatment', A('a3'), [S('b1', { patient_id: 'p2' })]);
    await silent('a follow-up already recorded that day for it', A('a4'), [S('b1'), S('k0', { parent_id: 'b1', followup_state: null, date: TODAY, cost: 0 })]);
    await silent('an appointment in the future', A('a5', { date: '2026-11-19' }), [S('b1')]);
    const y = await boot(F); y.__DB.appointments.push(A('ay', { date: '2026-11-17' })); y.__DB.ledger_sessions.push(S('b1'));
    const py = y.SyApptFu.offer('ay'); await answer(y, 'ok'); await py;
    ok(y.__RPC.length === 1 && y.__RPC[0].a.p_date === '2026-11-17', 'a visit closed the next day is recorded on its appointment day, not today');
    y.close();
    await silent('a planned appointment without a date', A('a6', { date: null, is_planned: true }), [S('b1')]);
    await silent('a treatment that started after the visit', A('a7', { date: '2026-11-05' }), [S('b1')]);
    await silent('read-only subscription', A('a8'), [S('b1')], v => { v.__ro = true; });
    await silent('inactive doctor account', A('a9'), [S('b1')], v => { v.__inactive = true; });
    await silent('an unknown appointment', A('zz'), [S('b1')], v => { v.__DB.appointments.length = 0; });
  });

  /* (٣) أكثر من علاج ⇒ SyDialog.choose الحقيقي */
  await guard('choose', async () => {
    const w = await boot(F); w.__DB.appointments.push(A('a1'));
    w.__DB.ledger_sessions.push(S('b1'), S('b2', { type: 'Crown PFM', tooth_num: '16', date: '2026-11-10' }), S('b3', { type: 'Denture', tooth_num: null, arch: 'U', date: '2026-11-01' }), S('bx', { type: '<img src=x onerror="window.__xss=1">', tooth_num: null, date: '2026-10-01' }));
    const p = w.SyApptFu.offer('a1'); const q = await answer(w, 1); const r = await p; await tick(w);
    ok(q && q.kind === 'choose' && q.choices.length === 4 && q.choices[0].l === 'Crown PFM' && q.choices[0].s === 'سن 16 · منذ 10/11/2026' && q.choices[1].l === 'RCT' && q.choices[2].s === 'الفك العلوي · منذ 01/11/2026'
      && q.cancel === 'ليست متابعة' && !/btn-sy-ok/.test(q.html), 'several treatments in progress ⇒ a pick list, newest first, each with its place and start day; no generic «OK»');
    ok(r && r.base.id === 'b1' && w.__RPC.length === 1 && w.__RPC[0].a.p_parent === 'b1', 'picking records the follow-up for the picked treatment only');
    ok(!w.document.querySelector('img[src="x"]') && !w.__xss && /&lt;img/.test(q.html), 'treatment names are escaped in the list');
    bag.push({ t: q.title }, { t: q.msg }, { t: q.cancel }); q.choices.forEach(c => { if (c.s) bag.push({ t: c.s }); });
    w.close();
    const v = await boot(F); v.__DB.appointments.push(A('a1')); v.__DB.ledger_sessions.push(S('b1'), S('b2', { type: 'Crown PFM' }));
    let pv = v.SyApptFu.offer('a1'); await answer(v, 'cancel'); ok(await pv === null && v.__RPC.length === 0, '«ليست متابعة» writes nothing');
    v.__DB.appointments.push(A('a2'));
    pv = v.SyApptFu.offer('a2'); await answer(v, 'esc'); ok(await pv === null && v.__RPC.length === 0 && !dlg(v), 'Escape (the close path) resolves as «no» and removes the dialog');
    let pc = v.SyDialog.choose({ title: 'T', choices: [{ label: 'x' }, { label: 'y', sub: 's' }] }); await answer(v, 'cancel'); const rc1 = await pc;
    pc = v.SyDialog.choose({ title: 'T', choices: [{ label: 'x' }, { label: 'y' }] }); await answer(v, 1); const rc2 = await pc;
    ok(rc1 === null && rc2 === 1 && !dlg(v), 'SyDialog.choose resolves the picked index, and exactly null when cancelled');
    v.close();
  });

  /* (٤) الإخفاق */
  await guard('fail', async () => {
    const w = await boot(F); w.__DB.appointments.push(A('a1')); w.__DB.ledger_sessions.push(S('b1'));
    w.__provBad = true; let p = w.SyApptFu.offer('a1'); await answer(w, 'ok'); let r = await p;
    ok(r && w.__RPC.length === 2 && w.__RPC[0].a.p_provider === 'd2' && w.__RPC[1].a.p_provider === null, 'an appointment doctor no longer in the clinic ⇒ retried with the treatment doctor');
    w.close();
    const v = await boot(F); v.__DB.appointments.push(A('a1')); v.__DB.ledger_sessions.push(S('b1'));
    v.__rpcFail = 'followup_base_invalid'; p = v.SyApptFu.offer('a1'); await answer(v, 'ok'); r = await p;
    ok(r === null && v.__UPD.length === 0 && v.__EV.length === 0 && /تعذّر تسجيل جلسة المتابعة/.test(v.__TOASTS.slice(-1)[0] || ''), 'a refused add links nothing, announces nothing and says where to record it');
    bag.push({ t: v.__TOASTS.slice(-1)[0] });
    v.__DB.appointments.push(A('a2')); v.sb.from = () => { throw new Error('offline'); };
    ok(await v.SyApptFu.offer('a2') === null, 'a read that throws is swallowed — the visit stamp is never blocked');
    v.close();
  });

  /* (٥) الخطّافات والأسلاك */
  await guard('hooks', async () => {
    const AT = F['appt-time.js'], IX = F['index.html'], AP = F['appointments.html'], PA = F['pp-appt.js'], PP = F['patient-profile.html'];
    const rat = extractFunction(AT, 'recordApptTime');
    ok(/if \(fieldKey === 'dismissed_at' && window\.SyApptFu\) window\.SyApptFu\.offer\(apptId\);\s+\/\*[^*]*\*\/\s+return true;/.test(rat) && rat.indexOf('SyApptFu.offer') > rat.lastIndexOf("update(patch)"),
      'appointments page «خرج»: asked after the stamp succeeded');
    const rd = extractFunction(IX, 'recordDashApptTime');
    ok(/if \(fieldKey === 'dismissed_at' && window\.SyApptFu\) window\.SyApptFu\.offer\(apptId\);/.test(rd) && rd.indexOf('SyApptFu.offer') > rd.indexOf('renderTodayApptsCard();'), 'dashboard «خرج»: asked after the stamp succeeded');
    const ps = extractFunction(PA, '_ppApptStamp_inner');
    ok(/if \(fieldKey === 'dismissed_at' && !offline && window\.SyApptFu\) window\.SyApptFu\.offer\(apptId\);/.test(ps) && ps.indexOf('SyApptFu.offer') > ps.indexOf("res.data.length !== 1"), 'patient card «خرج»: asked after the stamp succeeded (online only)');
    const sa = extractFunction(PA, 'saveAppt') || extractFunction(PA, '_saveAppt_inner');
    ok(/var _fuPrevSt = editingApptId \?/.test(PA) && /if \(savedRow && savedRow\.id && savedRow\.status === 'completed' && _fuPrevSt !== 'completed' && window\.SyApptFu\) window\.SyApptFu\.offer\(savedRow\.id\);/.test(PA)
      && PA.indexOf('SyApptFu.offer(savedRow.id)') > PA.indexOf('commitPendingAttachmentsPP(savedRow.id'), 'patient card save: asked when the appointment just became «مكتمل», after its treatments were linked');
    ok(/var _fuOfferId = \(apptData\.status === 'completed' && _wlOrig && _wlOrig\.status !== 'completed'\) \? editingId : null;/.test(AP) && AP.indexOf('var _fuOfferId') < AP.indexOf('portalApproveSaved(window._portalApproveCtx, apptData);')
      && /await loadAppointments\(\);\s+if \(_fuOfferId && window\.SyApptFu\) window\.SyApptFu\.offer\(_fuOfferId\);/.test(AP), 'appointments page save: asked when the appointment just became «مكتمل» (id kept before the window clears it)');
    ['appointments.html', 'index.html', 'patient-profile.html'].forEach(f => {
      const s = F[f], i = s.indexOf('<script src="sy-modal.js?v='), j = s.indexOf('<script src="appt-followup.js?v=');
      ok(i > -1 && j > i && (s.match(/appt-followup\.js\?v=/g) || []).length === 1, f + ': loads appt-followup.js once, after sy-modal.js');
    });
    ok(F['scripts/cache-bust.sh'].split('appt-followup\\.js|').length === 3 && /appt-followup\.js · /.test(F['scripts/cache-bust.sh']), 'appt-followup.js is a cache-busted asset');
    ok(/prove-appt-followup\.js" --self-test/.test(F['scripts/validate.sh']), 'the prover is in the gate with its mutations');
    const fl = extractFunction(F['pp-followup.js'], 'fuOnAdded');
    ok(/k\.patient_id !== patientId\) return;/.test(fl) && /sessions\.unshift\(k\)/.test(fl) && /base\.followup_state = d\.state \|\| 'open';/.test(fl) && /fuRerender\(\);/.test(fl)
      && /window\.addEventListener\('sy:followup-added', fuOnAdded\);/.test(F['pp-followup.js']), 'the patient card shows the new follow-up at once (its own patient only)');
    const SM = F['sy-modal.js'];
    ok(/choose:  function \(o\) \{ return open\('choose', o \|\| \{\}\); \}/.test(SM) && /if \(b\.getAttribute\('data-sy-act'\) === 'pick'\) \{ finish\(parseInt\(b\.getAttribute\('data-sy-i'\), 10\)\); return; \}/.test(SM)
      && /\.sy-dialog \.sy-dialog-choice \{/.test(F['theme.css']), 'SyDialog.choose is part of the shared dialog kit, styled in theme.css');
  });

  /* (٦) الإنجليزية */
  await guard('english', async () => {
    const t = engine(F), left = [], seen = {};
    bag.forEach(x => { const s = String(x.t || '').replace(/\s+/g, ' ').trim(); if (!s || seen[s]) return; seen[s] = 1; const o = t(s); if (o == null || AR.test(o)) left.push(s + ' ⇒ ' + o); });
    ok(Object.keys(seen).length >= 12 && left.length === 0, 'English: every piece of the question, the list and the toasts is translated (' + Object.keys(seen).length + ')' + (left.length ? ' — ' + left.slice(0, 4).join(' | ') : ''));
    ok(t('للمريض علاجٌ قيد الإنجاز: «RCT — سن 36».') === 'The patient has a treatment in progress: «RCT — tooth 36».' && t('الفك العلوي · منذ 01/11/2026') === 'Upper jaw · since 01/11/2026'
      && t('منذ 10/11/2026') === 'since 10/11/2026', 'English: the place inside a sentence is translated, the clinic\'s treatment name is kept, dates survive');
  });
  return out;
}

const rep = (f, a, b) => F => { if (F[f].indexOf(a) < 0) throw new Error('طفرةٌ بلا مرساة: ' + a.slice(0, 50)); return Object.assign({}, F, { [f]: F[f].split(a).join(b) }); };
const MUT = [
  ['asks despite linked sessions', rep('appt-followup.js', "if (!rl || rl.error || (rl.data || []).length) return null;", "if (!rl || rl.error) return null;")],
  ['asks for a future appointment', rep('appt-followup.js', "    if (day > today()) return null;\n", '')],
  ['asks for closed treatments', F => rep('appt-followup.js', " && b.followup_state === 'open' && ", ' && ')(rep('appt-followup.js', ".eq('followup_state', 'open').is('parent_id', null)", ".is('parent_id', null)")(F))],
  ['asks about another patient', rep('appt-followup.js', ".eq('patient_id', a.patient_id).eq('followup_state', 'open')", ".eq('followup_state', 'open')")],
  ['asks twice the same day', rep('appt-followup.js', "    bases = bases.filter(function (b) { return !done[b.id]; });\n", '')],
  ['asks for a treatment started later', rep('appt-followup.js', " && (!b.date || String(b.date).slice(0, 10) <= day)", '')],
  ['asks in read-only', rep('appt-followup.js', "    if (window.SyDentSub && typeof window.SyDentSub.isReadOnly === 'function' && window.SyDentSub.isReadOnly()) return true;\n", '')],
  ['asks on an inactive account', rep('appt-followup.js', "    if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) return true;\n", '')],
  ['asks twice per appointment', rep('appt-followup.js', "if (!apptId || asked[apptId] || blocked()", "if (!apptId || blocked()")],
  ['records today instead of the visit day', rep('appt-followup.js', "{ p_parent: base.id, p_date: c.day, p_provider: c.appt.provider_id || null,", "{ p_parent: base.id, p_date: today(), p_provider: c.appt.provider_id || null,")],
  ['records with the treatment doctor', rep('appt-followup.js', "p_provider: c.appt.provider_id || null, p_step: null, p_notes: null, p_close: false });\n    if (res", "p_provider: null, p_step: null, p_notes: null, p_close: false });\n    if (res")],
  ['closes the treatment', rep('appt-followup.js', "p_provider: c.appt.provider_id || null, p_step: null, p_notes: null, p_close: false });\n    if (res", "p_provider: c.appt.provider_id || null, p_step: null, p_notes: null, p_close: true });\n    if (res")],
  ['no retry on an old doctor', rep('appt-followup.js', "    if (res && res.error && /followup_provider_invalid/.test(res.error.message || '')) {", "    if (false) {")],
  ['not linked to the appointment', rep('appt-followup.js', "var rl = await sb.from('ledger_sessions').update({ appointment_id: c.appt.id }).eq('id', kid.id).eq('doctor_id', c.appt.doctor_id);", "var rl = { error: null };")],
  ['link not scoped to the clinic', rep('appt-followup.js', ".update({ appointment_id: c.appt.id }).eq('id', kid.id).eq('doctor_id', c.appt.doctor_id)", ".update({ appointment_id: c.appt.id }).eq('id', kid.id)")],
  ['no event for the card', rep('appt-followup.js', "    try { window.dispatchEvent(new CustomEvent('sy:followup-added',", "    try { if (0) window.dispatchEvent(new CustomEvent('sy:followup-added',")],
  ['records without asking', rep('appt-followup.js', "      return ok ? c.bases[0] : null;", "      return c.bases[0];")],
  ['several treatments: always the first', rep('appt-followup.js', "    return (typeof i === 'number' && c.bases[i]) ? c.bases[i] : null;", "    return c.bases[0];")],
  ['failure not reported', rep('appt-followup.js', "    if (!res || res.error || !res.data || !res.data.session) {", "    if (!res) {")],
  ['unescaped choice', rep('sy-modal.js', "'<span class=\"sy-dialog-choice-l\">' + esc(c && c.label) + '</span>'", "'<span class=\"sy-dialog-choice-l\">' + (c && c.label) + '</span>'")],
  ['choose keeps an OK button', rep('sy-modal.js', "(isChoose ? '' : '<button type=\"button\" class=\"btn-sy-ok'", "('' + '<button type=\"button\" class=\"btn-sy-ok'")],
  ['choose cancel resolves true', rep('sy-modal.js', "        if (kind === 'choose') { finish(null); return; }\n", '')],
  ['appointments «خرج» not hooked', rep('appt-time.js', "    if (fieldKey === 'dismissed_at' && window.SyApptFu) window.SyApptFu.offer(apptId);", '')],
  ['dashboard «خرج» not hooked', rep('index.html', "    if (fieldKey === 'dismissed_at' && window.SyApptFu) window.SyApptFu.offer(apptId);", '')],
  ['card «خرج» not hooked', rep('pp-appt.js', "  if (fieldKey === 'dismissed_at' && !offline && window.SyApptFu) window.SyApptFu.offer(apptId);", '')],
  ['card save asks on every save', rep('pp-appt.js', "savedRow.status === 'completed' && _fuPrevSt !== 'completed' && window.SyApptFu", "savedRow.status === 'completed' && window.SyApptFu")],
  ['appointments save not hooked', rep('appointments.html', "      if (_fuOfferId && window.SyApptFu) window.SyApptFu.offer(_fuOfferId);\n", '')],
  ['card ignores the new follow-up', rep('pp-followup.js', "if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('sy:followup-added', fuOnAdded);", '')],
  ['card shows another patient\'s follow-up', rep('pp-followup.js', "  if (typeof patientId !== 'undefined' && k.patient_id !== patientId) return;\n", '')],
  ['module not loaded on the dashboard', rep('index.html', '<script src="appt-followup.js?v=', '<script data-x="appt-followup.js?v=')],
  ['question untranslated', rep('i18n-en.js', "    'زيارة متابعة؟': 'A follow-up visit?',\n", '')],
  ['place untranslated in the sentence', rep('i18n-en.js', "return 'The patient has a treatment in progress: «' + fuW(x) + '».';", "return 'The patient has a treatment in progress: «' + x + '».';")]
];

(async () => {
  let settled = false;
  process.on('exit', code => { if (!settled && code === 0) { console.error('prove-appt-followup ❌ exited before finishing'); process.exitCode = 1; } });
  const res = await run(LIVE), bad = res.filter(x => !x[0]);
  if (bad.length) { bad.forEach(x => console.error('  ✗ ' + x[1])); console.error('prove-appt-followup ❌ ' + bad.length + '/' + res.length); process.exit(1); }
  if (process.argv.indexOf('--self-test') < 0) { settled = true; console.log('prove-appt-followup ✅ ' + res.length + ' توكيداً'); return; }
  settled = true;   /* من هنا: عمّالُ mutant-pool يخرجون بأنفسهم، وكلُّ قسمٍ له مهلته */
  const anchorless = [];
  MUT.forEach(([name, mut]) => { try { mut(LIVE); } catch (e) { anchorless.push(name + ' (' + e.message + ')'); } });
  const pool = await runMutants(MUT, async ([, mut]) => { let F2; try { F2 = mut(LIVE); } catch (e) { return false; } const r = await run(F2); return r.some(x => !x[0]); });
  const dull = pool.dull.map(i => MUT[i][0]).filter(n => !anchorless.some(a => a.indexOf(n + ' (') === 0)).concat(anchorless);
  if (dull.length || pool.failed.length) { dull.forEach(n => console.error('  ✗ طفرةٌ لم تعضّ: ' + n)); if (pool.failed.length) console.error('  ✗ عاملٌ مات: ' + pool.failed.join()); console.error('prove-appt-followup ❌ ' + pool.bit + '/' + MUT.length); process.exit(1); }
  settled = true;
  console.log('prove-appt-followup ✅ ' + res.length + ' توكيداً · ' + pool.bit + '/' + MUT.length + ' طفرات تعضّ');
})();
