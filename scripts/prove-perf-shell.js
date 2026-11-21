/* v555 — مثبتُ أداء الغلاف المشترك (DeepCode #1 · docs/DEEPCODE_REVIEW.md) — مستقل، على الملفات الحيّة.
   (١) القائمة الجانبية (refreshSidebarDynamic): قراءاتُها الخمس تُطلَق قبل أول انتظارٍ بعد المستخدم، وتُستهلك بمواضعها
       الأصلية وبالترتيب نفسه — فقرارُ الحجب (موقوف/قيد المراجعة) قبل رسم أي شيء كما كان؛ والاستعلاماتُ نفسُها حرفياً.
   (٢) SyDentPlan (سلوكياً بـvm على _resolve الحيّة): الكتالوجُ يُطلَق مع طلب التجربة (جولة) · صفُّ الخطة بالرمز ·
       بلا رمز ⇒ الافتراضُ · خطأُ الكتالوج ⇒ fail-open كما كان · لا رفضَ غير ملتقَط.
   (٣) القفل: ذاكرةُ الأطباء تُطلَق مع فحص الأدمن، وensureOwnerEmployee (قد يكتب) يبقى بعده.
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
const base = { 'sidebar.js': read('sidebar.js'), 'supabase-init.js': read('supabase-init.js'), 'patient-profile.html': read('patient-profile.html') };

async function suite(F) {
  const SB = fnSrc(F['sidebar.js'], 'async function refreshSidebarDynamic(');
  /* ── (١) ── */
  const P = ['_sbTrialP', '_sbCsP', '_sbPlanP', '_sbApptsP', '_sbReqP'];
  const iUid = SB.indexOf('const uid = u.user.id;'), iFirst = SB.indexOf('_sbTake(await _sbTrialP)');
  ok(P.every(n => { const i = SB.indexOf('const ' + n + ' = _sbSettle('); return i > iUid && i < iFirst; }) && !/\bawait\b/.test(SB.slice(iUid, iFirst)), 'sidebar: all five reads start before the first await after the user');
  const uses = ['const { data: trialData } = _sbTake(await _sbTrialP);', 'const csRes = _sbTake(await _sbCsP);', '_sbTake(await _sbPlanP);', 'const { data: appts } = _sbTake(await _sbApptsP);', 'const { count: reqCount, error: reqErr } = _sbTake(await _sbReqP);'];
  const pos = uses.map(u => SB.indexOf(u));
  ok(pos.every(p => p > -1) && pos.every((p, i) => i === 0 || p > pos[i - 1]), 'sidebar: consumed at the original spots in the original order');
  const iRej = SB.indexOf("trialData.status === 'rejected'"), iNew = SB.indexOf("trialData.status === 'new'"), iName = SB.indexOf("document.getElementById('sbDoctorName')");
  ok(iRej > pos[0] && iNew > iRej && iName > iNew, 'sidebar: the block decision (suspended / pending) still comes before anything is painted');
  ok(/\.from\('trial_requests'\)\s*\.select\('status'\)\s*\.eq\('user_id', uid\)\s*\.maybeSingle\(\)/.test(SB) && /\.from\('clinic_settings'\)\s*\.select\('clinic_name, currency, ai_features_enabled'\)\.eq\('owner_id', uid\)\.maybeSingle\(\)/.test(SB)
     && /\.from\('appointments'\)\.select\('id,status'\)\s*\.eq\('doctor_id', uid\)\.eq\('date', _sbTodayStr\)/.test(SB) && /\.select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('clinic_id', uid\)\.eq\('status', 'pending'\)/.test(SB), 'sidebar: the same five queries verbatim');
  ok(!/await window\.sb\.from\(|await window\.sb\s*\n\s*\.from\(|await window\.SyDentPlan\.load\(\)/.test(SB.slice(iFirst, SB.indexOf("platform_settings")) + SB.slice(SB.indexOf("// اسم الدكتور"))), 'sidebar: no read is fetched late any more');
  /* ── (٢) ── */
  const I = F['supabase-init.js'];
  const R = fnSrc(I, 'async function _resolve(');
  ok(R.indexOf('var _plansP = ') > -1 && R.indexOf('var _plansP = ') < R.indexOf("from('trial_requests')"), 'plan: catalogue fired before/with the trial row (one round)');
  async function run(opt) {
    const ev = [];
    const q = t => ({ select() { return this; }, eq() { return this; }, maybeSingle() { return this; },
      then(a, b) { ev.push('start:' + t); const v = t === 'trial_requests' ? { data: opt.tr, error: null } : (opt.plErr ? { data: null, error: { message: 'x' } } : { data: opt.plans, error: null });
        return (opt.plThrow && t === 'subscription_plans' ? Promise.reject(new Error('net')) : Promise.resolve(v)).then(a, b); } });
    const ctx = { console: { warn() {} }, Promise, Array, Number, window: { sbGetUser: async () => ({ id: 'u' }), sb: { from: q } } };
    vm.createContext(ctx); vm.runInContext(R + '\nthis.__r = _resolve;', ctx);
    let unh = 0; const on = () => unh++; process.on('unhandledRejection', on);
    const out = await ctx.__r(); await new Promise(r => setTimeout(r, 5)); process.removeListener('unhandledRejection', on);
    return { out, ev, unh };
  }
  const PL = [{ code: 'one', display_name: 'One', entitlements: { labs: false }, max_patients: 100, max_employees: 2 }, { code: 'max', display_name: 'Max', entitlements: {}, max_patients: null, max_employees: null }];
  let r = await run({ tr: { plan: 'one', ai_override: false }, plans: PL });
  ok(r.out.code === 'one' && r.out.display_name === 'One' && r.out.entitlements.labs === false && r.out.max_patients === 100 && r.out.max_employees === 2 && r.out.ai_override === false, 'plan: the row picked by code, fields as before');
  ok(r.ev.indexOf('start:subscription_plans') > -1 && r.ev.indexOf('start:subscription_plans') < r.ev.indexOf('start:trial_requests') + 2, 'plan: both reads start together');
  r = await run({ tr: { plan: null }, plans: PL });
  ok(r.out.code === null && JSON.stringify(r.out.entitlements) === '{}', 'plan: no code ⇒ the default (unchanged)');
  r = await run({ tr: { plan: 'one' }, plErr: true });
  ok(r.out.code === 'one' && r.out.display_name === 'one' && JSON.stringify(r.out.entitlements) === '{}' && r.out.max_patients === null, 'plan: catalogue error ⇒ fail-open exactly as before');
  r = await run({ tr: { plan: 'one' }, plThrow: true });
  ok(r.out.code === 'one' && JSON.stringify(r.out.entitlements) === '{}' && r.unh === 0, 'plan: catalogue exception ⇒ fail-open, no unhandled rejection');
  r = await run({ tr: { plan: 'ghost' }, plans: PL });
  ok(r.out.code === 'ghost' && r.out.display_name === 'ghost' && JSON.stringify(r.out.entitlements) === '{}', 'plan: unknown code ⇒ empty row, as with .eq(code) returning nothing');
  /* ── (٣) ── */
  const iDocs = I.indexOf('var _lockDocsP = loadDoctors()'), iAdm = I.indexOf("var adminCheck = await window.SyDentAuth.isPlatformAdmin(sUser.id);"), iEns = I.indexOf('    await _lockDocsP;   /* v555');
  const iHeal = I.indexOf('await ensureOwnerEmployee();', I.indexOf('var _lockDocsP'));
  ok(iDocs > -1 && iDocs < iAdm && iEns > iAdm && iHeal > iEns && iHeal - iEns < 120, 'lock: doctors cache starts with the admin check; the (possibly writing) owner-row heal stays after it');
  /* ── (٤) v801 — الإقلاع: getUser وصفُّ المريض يبدآن مع تحميل السكربتات ── */
  const PPH = F['patient-profile.html'];
  const b0 = I.indexOf('  try {\n    var _bootU = sydentLocalSessionUser();'), b1 = I.indexOf('  } catch (eB) {}', b0);
  ok(b0 > -1 && b1 > b0 && b0 > I.indexOf('window.sb.auth.getUser = async function (jwt) {') && b0 < I.indexOf('window.sbGetUser = async function'), 'boot: the early block sits after the single-flight getUser wrapper');
  const bootSrc = b0 > -1 && b1 > b0 ? I.slice(b0, b1 + '  } catch (eB) {}'.length) : 'throw 1';
  const bootRun = (sess, early, getUser) => { const log = [];
    const win = { sb: { auth: { getUser: getUser || (() => { log.push('getUser'); return Promise.resolve({ data: { user: sess } }); }) } } };
    if (early) win.__syEarly = (sb, uid) => { log.push('early:' + (sb === win.sb) + ':' + uid); if (early === 'throw') throw new Error('x'); };
    new Function('window', 'sydentLocalSessionUser', bootSrc)(win, () => sess); return log; };
  ok(bootRun({ id: 'U1' }, true).join() === 'getUser,early:true:U1', 'boot: with a local session getUser is requested at once and the page\'s early read is started with the session id');
  ok(bootRun(null, true).length === 0, 'boot: without a local session (login page, public pages) nothing is requested');
  ok(bootRun({ id: 'U1' }, false).join() === 'getUser', 'boot: a page with no early read still warms getUser');
  ok(bootRun({ id: 'U1' }, 'throw').join() === 'getUser,early:true:U1', 'boot: a faulty early read never breaks the page');
  let bootThrew = false; try { bootRun({ id: 'U1' }, true, () => { throw new Error('sync'); }); } catch (e) { bootThrew = true; }
  ok(!bootThrew, 'boot: getUser throwing synchronously is contained');
  let unh = 0; const onU = () => { unh++; }; process.on('unhandledRejection', onU);
  bootRun({ id: 'U1' }, false, () => Promise.reject(new Error('net'))); await new Promise(r => setTimeout(r, 5)); process.removeListener('unhandledRejection', onU);
  ok(unh === 0, 'boot: a failed warm-up is not an unhandled rejection');
  /* الرأس: المعلِن قبل supabase-init، ولا يحمل مرساةَ الكتلة الرئيسية */
  const hk0 = PPH.indexOf('<script>window.__syEarly=function(sb,uid){'), hk1 = PPH.indexOf('</script>', hk0);
  ok(hk0 > -1 && hk0 < PPH.indexOf('<script src="supabase-init.js') && PPH.slice(hk0, hk1).indexOf('new URLSearchParams(location.search)') === -1, 'card: the early-read hook is declared before supabase-init.js and does not shadow the main-block anchor');
  const hookSrc = hk0 > -1 ? PPH.slice(hk0 + '<script>'.length, hk1) : 'throw 1';
  const hookRun = (href, uid) => { const calls = []; const win = {};
    const q = { select(c) { calls.push('select:' + c); return q; }, eq(k, v) { calls.push('eq:' + k + '=' + v); return q; }, single() { calls.push('single'); return Promise.resolve({ data: { id: 'row' }, error: null }); } };
    const sb = { from(t) { calls.push('from:' + t); return q; } };
    new Function('window', 'location', 'URL', hookSrc)(win, { href }, URL); win.__syEarly(sb, uid); return { win, calls }; };
  const PID = '8e71dc0e-ce50-409b-9487-c4987fcb9c20';
  let hr = hookRun('https://x/patient-profile.html?id=' + PID, 'U1');
  ok(hr.calls.join() === 'from:patients,select:*,eq:id=' + PID + ',eq:doctor_id=U1,single' && hr.win.__ppPatientPre && hr.win.__ppPatientPre.uid === 'U1' && hr.win.__ppPatientPre.id === PID
    && (await hr.win.__ppPatientPre.p).data.id === 'row', 'card: the early read is the page\'s own patient query (same table, columns and owner filter), kept with the user and patient it was made for');
  ok(hookRun('https://x/patient-profile.html?id=demo', 'U1').calls.length === 0 && hookRun('https://x/patient-profile.html', 'U1').calls.length === 0, 'card: the demo card and a missing id read nothing');
  {
    const win = {}; const sb = { from() { return { select() { return this; }, eq() { return this; }, single() { return Promise.reject(new Error('net')); } }; } };
    new Function('window', 'location', 'URL', hookSrc)(win, { href: 'https://x/p?id=' + PID }, URL); win.__syEarly(sb, 'U1');
    const rr = await win.__ppPatientPre.p; ok(rr && rr.error && rr.data === null, 'card: a failed early read resolves to an error result (never an unhandled rejection)');
  }
  /* loadAll: الاستهلاكُ مرةً واحدة، وبالمطابقة، وبالنجاح فقط */
  const c0 = PPH.indexOf('  var _ppPre = window.__ppPatientPre; window.__ppPatientPre = null;'), c1 = PPH.indexOf(".eq('id', patientId).eq('doctor_id', currentUser.id).single();", c0);
  ok(c0 > PPH.indexOf('async function loadAll() {') && c1 > c0 && c1 - c0 < 700, 'card: loadAll consumes the early read where it used to read the patient row');
  const useSrc = c0 > -1 && c1 > c0 ? PPH.slice(c0, c1 + ".eq('id', patientId).eq('doctor_id', currentUser.id).single();".length) : 'throw 1';
  const useRun = async (pre, uid, pid) => { let net = 0; const win = { __ppPatientPre: pre };
    win.sb = { from() { const q = { select() { return q; }, eq() { return q; }, single() { net++; return Promise.resolve({ data: { id: 'net' }, error: null }); } }; return q; } };
    const out = await new Function('window', 'currentUser', 'patientId', 'return (async function(){' + useSrc + '\nreturn { pd: pd, pErr: pErr }; })();')(win, { id: uid }, pid);
    return { out, net, left: win.__ppPatientPre }; };
  let ur = await useRun({ uid: 'U1', id: PID, p: Promise.resolve({ data: { id: 'early' }, error: null }) }, 'U1', PID);
  ok(ur.out.pd.id === 'early' && ur.net === 0 && ur.left === null, 'card: a matching early read is used — no second patient round-trip — and is cleared');
  ur = await useRun(null, 'U1', PID);
  ok(ur.out.pd.id === 'net' && ur.net === 1, 'card: later loads (after a save, a live update) read from the database');
  ur = await useRun({ uid: 'U1', id: PID, p: Promise.resolve({ data: null, error: { message: 'net' } }) }, 'U1', PID);
  ok(ur.out.pd.id === 'net' && ur.net === 1 && !ur.out.pErr, 'card: a failed early read falls back to the normal read instead of showing an error');
  ur = await useRun({ uid: 'OTHER', id: PID, p: Promise.resolve({ data: { id: 'early' }, error: null }) }, 'U1', PID);
  ok(ur.out.pd.id === 'net' && ur.net === 1 && ur.left === null, 'card: an early read made for another user is never used');
  ur = await useRun({ uid: 'U1', id: 'another-patient', p: Promise.resolve({ data: { id: 'early' }, error: null }) }, 'U1', PID);
  ok(ur.out.pd.id === 'net' && ur.net === 1, 'card: an early read made for another patient is never used');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['sidebar trial awaited alone', rep('sidebar.js', "  const _sbTrialP = _sbSettle(window.sb.from('trial_requests')", "  const _sbTrialP0 = await 0;\n  const _sbTrialP = _sbSettle(window.sb.from('trial_requests')")],
  ['sidebar counter fetched late', rep('sidebar.js', "  const { data: appts } = _sbTake(await _sbApptsP);", "  const { data: appts } = await window.sb.from('appointments').select('id')\n    .eq('doctor_id', uid).eq('date', _sbTodayStr);")],
  ['sidebar block decided after painting', F0 => { const F = Object.assign({}, F0); let s = F['sidebar.js'];
    const a = s.indexOf("  // اسم الدكتور\n"), b = s.indexOf("  // Clinic name in the brand sub-line."); const blk = s.slice(a, b); s = s.slice(0, a) + s.slice(b);
    const k = s.indexOf("  if (trialData && trialData.status === 'rejected') {"); F['sidebar.js'] = s.slice(0, k) + blk + s.slice(k); return F; }],
  ['sidebar settings query drift', rep('sidebar.js', ".select('clinic_name, currency, ai_features_enabled').eq('owner_id', uid).maybeSingle());", ".select('clinic_name').eq('owner_id', uid).maybeSingle());")],
  ['plan catalogue after the trial row', rep('supabase-init.js', "        var _plansP = Promise.resolve(window.sb.from('subscription_plans')", "        var _trFirst = await window.sb.from('trial_requests').select('plan').eq('user_id', user.id).maybeSingle();\n        var _plansP = Promise.resolve(window.sb.from('subscription_plans')")],
  ['plan picks the wrong row', rep('supabase-init.js', "if (_pls.data[_pi] && _pls.data[_pi].code === code) { row = _pls.data[_pi]; break; }", "if (_pls.data[_pi]) { row = _pls.data[_pi]; break; }")],
  ['plan exception unhandled', rep('supabase-init.js', "          .then(function (r) { return r; }, function (e) { return { data: null, error: e }; });", "          .then(function (r) { return r; });")],
  /* v801 */
  ['getUser not warmed', rep('supabase-init.js', "      try { var _bootG = window.sb.auth.getUser(); if (_bootG && _bootG.catch) _bootG.catch(function () {}); } catch (eG) {}\n", "")],
  ['warm-up rejection unhandled', rep('supabase-init.js', "if (_bootG && _bootG.catch) _bootG.catch(function () {});", "")],
  ['early read without a session', rep('supabase-init.js', "    if (_bootU) {\n      try { var _bootG", "    if (true) {\n      try { var _bootG")],
  ['boot faults escape (page breaks)', rep('supabase-init.js', "window.__syEarly(window.sb, _bootU.id); } catch (eE) {}\n    }\n  } catch (eB) {}", "window.__syEarly(window.sb, _bootU.id); } catch (eE) { throw eE; }\n    }\n  } catch (eB) { throw eB; }")],
  ['early read not started', rep('supabase-init.js', "      try { if (typeof window.__syEarly === 'function') window.__syEarly(window.sb, _bootU.id); } catch (eE) {}\n", "")],
  ['hook declared after the client', F0 => { const F = Object.assign({}, F0); let s = F['patient-profile.html'];
    const a = s.indexOf('<script>window.__syEarly=function(sb,uid){'), b = s.indexOf('</script>', a) + 9; const blk = s.slice(a, b); s = s.slice(0, a) + s.slice(b);
    const k = s.indexOf('<script src="sy-modal.js'); F['patient-profile.html'] = s.slice(0, k) + blk + s.slice(k); return F; }],
  ['demo card reads the database', rep('patient-profile.html', "if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return;", "if(!id)return;")],
  ['early read drops the owner filter', rep('patient-profile.html', ".eq('id',id).eq('doctor_id',uid).single()", ".eq('id',id).single()")],
  ['early read rejection unhandled', rep('patient-profile.html', ".single().then(function(r){return r;},function(e){return{data:null,error:e};})", ".single()")],
  ['early read reused on every load (stale after a save)', rep('patient-profile.html', "var _ppPre = window.__ppPatientPre; window.__ppPatientPre = null;", "var _ppPre = window.__ppPatientPre;")],
  ['failed early read shown as an error', rep('patient-profile.html', "(_ppPreRes && !_ppPreRes.error && _ppPreRes.data) ? _ppPreRes", "_ppPreRes ? _ppPreRes")],
  ['early read used for another user', rep('patient-profile.html', "(_ppPre && _ppPre.uid === currentUser.id && _ppPre.id === patientId)", "(_ppPre && _ppPre.id === patientId)")],
  ['early read used for another patient', rep('patient-profile.html', "(_ppPre && _ppPre.uid === currentUser.id && _ppPre.id === patientId)", "(_ppPre && _ppPre.uid === currentUser.id)")],
  ['owner heal before the admin check', rep('supabase-init.js', "    var _lockDocsP = loadDoctors().catch(function (e) { console.warn('[SyDentLock] loadDoctors:', e); });", "    var _lockDocsP = loadDoctors().catch(function (e) { console.warn('[SyDentLock] loadDoctors:', e); });\n    await ensureOwnerEmployee();")]
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
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-perf-shell: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-perf-shell: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
