/* v495 — مثبتُ حارس التعارض عند الحفظ (appt-conflict.js) — مستقل، على الملفات الحيّة.
   يثبت (١) دلالةَ find/check/confirm على الوحدة الحيّة بثوابت محسوبة من التعريف لا لقطات؛
   (٢) أن معالجَي السحب والإفلات الحيّين (appt-views.js) لا يكتبان عند الإلغاء ويكتبان عند التأكيد؛
   (٣) جردَ كل مواضع الكتابة على appointments بالمنصة وتصنيفَها — أي موضعٍ جديد غير مصنّف = أحمر؛
   (٤) تكافؤَ مسند التداخل مع المسند القائم بفحص نقل الطبيب بملف المريض (patient-profile.html)؛
   (٥) الربطَ (وسمُ السكربت بالصفحتين قبل وحداتهما · قائمةُ السماح بـcache-bust.sh).
   --self-test: يطفّر الوحدةَ ثلاث طفرات ويثبت أن (١) تحمرّ لكلٍّ منها. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

/* ── (١) الوحدة الحيّة ───────────────────────────────────────────────── */
function loadModule(src, hooks) {
  hooks = hooks || {};
  const win = { currentUser: { id: 'DOC' } };
  if (hooks.rows !== undefined || hooks.err) {
    win.sb = { from: () => { const q = { select() { return q; }, eq() { return q; },
      then(r) { return Promise.resolve(hooks.err ? { error: hooks.err } : { data: hooks.rows, error: null }).then(r); } }; return q; } };
  }
  if (hooks.answer !== undefined) win.SyDialog = { confirm: async o => { hooks.log.push(o); return hooks.answer; } };
  const ctx = { window: win, console: { warn: () => { hooks.warned = true; } }, Number, parseInt, Math, String, RegExp, Promise };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return win.SyDentConflict;
}
const SRC = read('appt-conflict.js');
const R = (id, time, dur, prov, op, extra) => Object.assign({ id, date: '2026-10-01', time, duration: dur, provider_id: prov, operatory_id: op, status: 'confirmed', patient_name: 'P' + id }, extra || {});

function suite(C) {
  const cand = { id: 'X', date: '2026-10-01', time: '10:00', duration: 30, provider_id: 'A', operatory_id: 'K1' };
  const f = rows => C.find(cand, rows);
  // تداخل صريح بالطبيب
  ok(f([R(1, '10:15', 30, 'A', null)]).length === 1 && f([R(1, '10:15', 30, 'A', null)])[0].reasons.join() === 'provider', 'find: provider overlap');
  // تداخل بالكرسي وحده
  ok(f([R(1, '09:45', 30, 'B', 'K1')])[0].reasons.join() === 'operatory', 'find: operatory overlap');
  // كلاهما
  ok(f([R(1, '10:00', 30, 'A', 'K1')])[0].reasons.join() === 'provider,operatory', 'find: both reasons');
  // متجاوران بلا تقاطع: [09:30,10:00) و[10:30,11:00) لا يتعارضان مع [10:00,10:30)
  ok(f([R(1, '09:30', 30, 'A', 'K1'), R(2, '10:30', 30, 'A', 'K1')]).length === 0, 'find: adjacent = no conflict (half-open)');
  // تقاطعٌ بدقيقة واحدة يكفي
  ok(f([R(1, '09:31', 30, 'A', null)]).length === 1 && f([R(1, '10:29', 30, 'A', null)]).length === 1, 'find: 1-minute overlap both sides');
  // احتواءٌ كامل (موعدٌ طويل يلفّ المرشَّح)
  ok(f([R(1, '09:00', 180, 'A', null)]).length === 1, 'find: containing appointment');
  // مدّةٌ غائبة = 30
  ok(f([R(1, '09:45', null, 'A', null)]).length === 1 && f([R(1, '09:30', null, 'A', null)]).length === 0, 'find: default duration 30');
  ok(f([R(1, '09:45', '0', 'A', null)]).length === 1 && f([R(1, '09:45', 'abc', 'A', null)]).length === 1, 'find: invalid duration → 30');
  // الحالات الميتة لا تشغل الوقت؛ المكتمل يشغله
  ['cancelled', 'no_show', 'broken'].forEach(s => ok(f([R(1, '10:00', 30, 'A', 'K1', { status: s })]).length === 0, 'find: dead status ' + s));
  ok(f([R(1, '10:00', 30, 'A', 'K1', { status: 'completed' })]).length === 1, 'find: completed still occupies');
  ['scheduled', 'pending', 'confirmed'].forEach(s => ok(f([R(1, '10:00', 30, 'A', 'K1', { status: s })]).length === 1, 'find: live status ' + s));
  // مخطّط بلا تاريخ · يومٌ آخر · الموعدُ نفسُه · بلا وقت
  ok(f([R(1, '10:00', 30, 'A', 'K1', { is_planned: true })]).length === 0, 'find: planned skipped');
  ok(f([R(1, '10:00', 30, 'A', 'K1', { date: '2026-10-02' })]).length === 0, 'find: other day skipped');
  ok(f([R('X', '10:00', 30, 'A', 'K1')]).length === 0, 'find: self excluded on edit');
  ok(f([R(1, null, 30, 'A', 'K1')]).length === 0 && f([R(1, 'zz', 30, 'A', 'K1')]).length === 0, 'find: unparsable time skipped');
  // موردٌ مختلف = لا تعارض · مرشَّحٌ بلا مورد = لا شيء
  ok(f([R(1, '10:00', 30, 'B', 'K2')]).length === 0, 'find: different provider+operatory');
  ok(C.find({ date: '2026-10-01', time: '10:00', duration: 30 }, [R(1, '10:00', 30, null, null)]).length === 0, 'find: no resource → nothing');
  ok(C.find({ date: '2026-10-01', time: '10:00', duration: 30, provider_id: 'A' }, [R(1, '10:00', 30, null, 'K1')]).length === 0, 'find: null vs null never matches');
  ok(C.find({ date: '2026-10-01', time: null, duration: 30, provider_id: 'A' }, [R(1, '10:00', 30, 'A')]).length === 0, 'find: candidate without time');
  // صيغُ الوقت: HH:MM:SS من القاعدة و H:MM
  ok(C.find({ date: '2026-10-01', time: '10:00:00', duration: 30, provider_id: 'A' }, [R(1, '10:15:00', 30, 'A')]).length === 1, 'find: HH:MM:SS');
  ok(C.find({ date: '2026-10-01', time: '9:45', duration: 30, provider_id: 'A' }, [R(1, '10:00', 30, 'A')]).length === 1, 'find: H:MM');
  // الترتيب بالوقت
  const s = f([R(2, '10:20', 10, 'A'), R(1, '09:50', 20, 'A')]);
  ok(s.length === 2 && s[0].appt.id === 1 && s[1].appt.id === 2, 'find: sorted by start');
  // النص
  const d = C.describe(f([R(1, '10:15', 30, 'A', 'K1')]), { provider: id => 'د. سامر', operatory: id => 'كرسي 2' });
  ok(/الطبيب د\. سامر/.test(d) && /الكرسي كرسي 2/.test(d) && /10:15\u00A0AM\u2060–\u206010:45\u00A0AM/.test(d) && /«P1»/.test(d), 'describe: names+time+patient');
  ok(/موعدٍ آخر/.test(d) && !/<[a-z]/.test(d), 'describe: singular wording, no HTML');
  ok(/2 مواعيدَ أخرى/.test(C.describe(f([R(1, '10:15', 30, 'A'), R(2, '10:20', 30, 'A')]), null)), 'describe: plural');
  ok(/12:05\u00A0AM\u2060–\u206012:35\u00A0AM/.test(C.describe(C.find({ date: '2026-10-01', time: '00:10', duration: 5, provider_id: 'A' }, [R(1, '00:05', 30, 'A')]), null)), 'describe: 12-hour midnight');
  ok(/12:00\u00A0PM\u2060–\u206012:30\u00A0PM/.test(C.describe(C.find({ date: '2026-10-01', time: '12:10', duration: 5, provider_id: 'A' }, [R(1, '12:00', 30, 'A')]), null)), 'describe: 12-hour noon');
}
suite(loadModule(SRC));

/* check/confirm على القاعدة المحاكاة */
(async () => {
  const cand = { id: null, date: '2026-10-01', time: '10:00', duration: 30, provider_id: 'A', operatory_id: null };
  let h = { rows: [R(1, '10:10', 30, 'A')], answer: false, log: [] };
  let C = loadModule(SRC, h);
  ok((await C.confirm(cand, { doctorId: 'DOC' })) === false && h.log.length === 1 && h.log[0].danger === true && /إلغاء/.test(h.log[0].cancelText), 'confirm: conflict + cancel → false, danger dialog');
  ok(/الحجز رغم التعارض/.test(h.log[0].confirmText) && /هل تريد الحجز رغم التعارض/.test(h.log[0].message), 'confirm: default wording');
  h = { rows: [R(1, '10:10', 30, 'A')], answer: true, log: [] }; C = loadModule(SRC, h);
  ok((await C.confirm(cand, { doctorId: 'DOC', verb: 'النقل' })) === true && h.log[0].confirmText === 'النقل رغم التعارض' && /هل تريد النقل رغم التعارض/.test(h.log[0].message), 'confirm: conflict + accept → true, custom text');
  h = { rows: [R(1, '11:00', 30, 'A')], answer: false, log: [] }; C = loadModule(SRC, h);
  ok((await C.confirm(cand, { doctorId: 'DOC' })) === true && h.log.length === 0, 'confirm: no conflict → true without dialog');
  h = { err: { message: 'boom' }, answer: false, log: [] }; C = loadModule(SRC, h);
  ok((await C.confirm(cand, { doctorId: 'DOC' })) === true && h.warned === true && h.log.length === 0, 'confirm: query error → fail-open with console.warn');
  h = { rows: [R(1, '10:10', 30, 'A')], answer: false, log: [] }; C = loadModule(SRC, h);
  ok((await C.confirm({ date: '2026-10-01', time: '10:00', duration: 30 }, { doctorId: 'DOC' })) === true && h.log.length === 0, 'confirm: no resource → no query, true');
  ok((await C.confirm(Object.assign({}, cand, { time: null }), { doctorId: 'DOC' })) === true, 'confirm: planned (no time) → true');
  h = { rows: [R(1, '10:10', 30, 'A')], log: [] }; C = loadModule(SRC, h);   // بلا SyDialog
  ok((await C.confirm(cand, { doctorId: 'DOC' })) === true && h.warned === true, 'confirm: SyDialog missing → fail-open with warn (no native dialog)');
  h = { rows: [R(1, '10:10', 30, 'A')], answer: false, log: [] }; C = loadModule(SRC, h);
  ok((await C.confirm(cand, {})) === false && h.log.length === 1, 'confirm: doctorId falls back to window.currentUser (query ran, dialog shown)');

  /* ── (٢) معالجا السحب والإفلات الحيّان ───────────────────────────────── */
  const AV = read('appt-views.js');
  function ext(src, name) {
    const i = src.indexOf(name); if (i < 0) throw new Error('missing ' + name);
    let j = src.indexOf('{', i), d = 0, k = j;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
    return src.slice(i, k + 1);
  }
  async function runDrop(fnName, opts) {
    const log = { updates: [], toasts: [], dialogs: [] };
    const win = { currentUser: { id: 'DOC' }, SyDentConflict: loadModule(SRC, { rows: opts.rows, answer: opts.answer, log: log.dialogs }),
      sb: { from: () => { const q = { update(p) { log.updates.push(p); return q; }, eq() { return q; }, then(r) { return Promise.resolve({ error: null }).then(r); } }; return q; } } };
    const ctx = { window: win, console: { warn() {} }, Number, parseInt, String, Promise, Math, RegExp,
      _k3DragApptId: 'X', appointments: [opts.appt], currentUser: win.currentUser, showToast: m => log.toasts.push(m),
      isFinishedStatus: s => ['completed', 'cancelled', 'broken', 'no_show'].includes(s),
      _k3FormatTime: m => (m / 60 | 0).toString().padStart(2, '0') + ':' + (m % 60).toString().padStart(2, '0'),
      apptMoveBlocked: () => null, loadAppointments: async () => { log.reloaded = true; }, render: () => {}, OPERATORIES_ALL: [] };
    vm.createContext(ctx); vm.runInContext(ext(AV, 'async function ' + fnName) + '\n;this.go=' + fnName + ';', ctx);
    const cell = { classList: { remove() {} }, dataset: { slotMin: String(opts.slotMin) }, closest: () => ({ dataset: opts.col }) };
    await ctx.go({ preventDefault() {} }, cell);
    return log;
  }
  const appt = R('X', '09:00', 30, 'A', 'K1');
  const busy = [R(1, '10:10', 30, 'A', 'K2')];   // نفس الطبيب، كرسي آخر
  let L = await runDrop('onK3SlotDrop', { appt, rows: busy, answer: false, slotMin: 600, col: { operatoryId: 'K2' } });
  ok(L.dialogs.length === 1 && L.updates.length === 0 && !L.reloaded, 'K3 drop: conflict + cancel → no update');
  L = await runDrop('onK3SlotDrop', { appt, rows: busy, answer: true, slotMin: 600, col: { operatoryId: 'K2' } });
  ok(L.dialogs.length === 1 && L.updates.length === 1 && L.updates[0].time === '10:00:00' && L.updates[0].operatory_id === 'K2', 'K3 drop: conflict + accept → update');
  L = await runDrop('onK3SlotDrop', { appt, rows: [R(1, '13:00', 30, 'A', 'K2')], answer: false, slotMin: 600, col: { operatoryId: 'K2' } });
  ok(L.dialogs.length === 0 && L.updates.length === 1, 'K3 drop: free slot → update without dialog');
  L = await runDrop('onK3SlotDrop', { appt, rows: [R(1, '10:10', 30, 'B', 'K2')], answer: false, slotMin: 600, col: { operatoryId: 'K2' } });
  ok(L.dialogs.length === 1 && /الكرسي/.test(L.dialogs[0].message) && !/الطبيب/.test(L.dialogs[0].message), 'K3 drop: target chair busy → operatory reason only');
  L = await runDrop('onWkSlotDrop', { appt, rows: busy, answer: false, slotMin: 600, col: { date: '2026-10-01' } });
  ok(L.dialogs.length === 1 && L.updates.length === 0, 'Wk drop: conflict + cancel → no update');
  L = await runDrop('onWkSlotDrop', { appt, rows: busy, answer: true, slotMin: 600, col: { date: '2026-10-01' } });
  ok(L.updates.length === 1 && L.updates[0].time === '10:00:00' && !('operatory_id' in L.updates[0]), 'Wk drop: conflict + accept → update, operatory untouched');
  L = await runDrop('onWkSlotDrop', { appt, rows: busy, answer: false, slotMin: 600, col: { date: '2026-10-05' } });
  ok(L.dialogs.length === 0 && L.updates.length === 1 && L.updates[0].date === '2026-10-05', 'Wk drop: other day → candidate uses the NEW date');

  /* ── (٣) جردُ مواضع الكتابة على appointments — كلُّها مصنّفة ────────── */
  const files = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && !/^sw\.js$/.test(f));
  const KNOWN = {   // موضع ⇒ تصنيف: guarded (يمرّ بالحارس) · stamp (أختامُ وقتٍ لا جدولة) · other (سبب مذكور)
    'appointments.html:submitAppt': 'guarded',            // إدخالٌ وتعديل من نافذة المواعيد (وتأكيدُ الحجز الإلكتروني وجدولةُ المخطّط يمرّان بها)
    'appt-views.js:onK3SlotDrop': 'guarded', 'appt-views.js:onWkSlotDrop': 'guarded',
    'pp-appt.js:_saveAppt_inner': 'guarded', 'pp-clinical.js:_saveLabOrderInner': 'guarded',
    'appt-time.js:recordApptTime': 'stamp', 'appt-time.js:overrideApptTime': 'stamp',
    'index.html:recordDashApptTime': 'stamp', 'pp-appt.js:_ppApptStamp_inner': 'stamp',
    'appointments.html:completeApptWithProcedures': 'other',   // status=completed فقط — لا تاريخ/وقت/مورد
    'appointments.html:apptCreateSeriesSiblings': 'other',   // v505: أخوةُ السلسلة — فحصٌ مسبق واحد (SyDentSeries.precheck يستعمل SyDentConflict.find + SyDentBlocks.blocking) بحوارِ تخطٍّ/فرض قبل الإدخال الدفعي
    'appt-series.js:cancelRest': 'other',
    'appointments.html:apptCreateFamilyAppts': 'other',   // v506: أفرادُ الأسرة — فحصٌ مسبق واحد (SyDentFamily.precheck عبر SyDentConflict.find + SyDentBlocks.blocking) بحوارِ تخطٍّ/فرض قبل الإدخال الدفعي   // v505: status→cancelled لبقية السلسلة — لا جدولة
    'patient-profile.html:_completeSessionFromProfile_inner': 'other',   // status فقط (completed/confirmed) — لا جدولة
    'patient-profile.html:sessProvApplyMove': 'other'     // نقلُ طبيبٍ بتحذيرٍ مضمَّن مسبق (sessProvMoveToggle يفحص التداخل ويعلنه قبل الحفظ)
  };
  function enclosing(src, idx) {
    let best = null;
    for (const fm of src.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
      if (fm.index > idx) break;
      let k = fm.index + fm[0].length - 1, d = 0;
      for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
      if (k > idx && (!best || fm.index > best.start)) best = { name: fm[1], start: fm.index, end: k };
    }
    return best;
  }
  const seen = {};
  for (const f of files) {
    const src = read(f); const re = /\.from\('appointments'\)\s*\.(insert|update|upsert)\(/g; let m;
    while ((m = re.exec(src))) {
      const fm = enclosing(src, m.index);   // أضيقُ دالةٍ مسمّاة تحوي موضعَ الكتابة (لا آخرُ دالةٍ مُعلنة قبله)
      const key = f + ':' + (fm ? fm.name : '?');
      seen[key] = (seen[key] || 0) + 1;
      if (KNOWN[key] === 'guarded') ok(/SyDentConflict\.confirm\(/.test(src.slice(fm.start, m.index)), 'guard precedes write in ' + key);
    }
  }
  Object.keys(seen).forEach(k => ok(k in KNOWN, 'unclassified appointments write site: ' + k + ' — add it to KNOWN as guarded/stamp/other'));
  Object.keys(KNOWN).forEach(k => ok(k in seen, 'known site vanished: ' + k));
  ok(Object.values(KNOWN).filter(v => v === 'guarded').length === 5, 'five guarded scheduling paths');
  ok(/window\.SyDentConflict\.find\(cand, rows\)/.test(read('appt-series.js')) && /S\.precheck\(saved, dates, currentUser\.id\)/.test(read('appointments.html')), 'series siblings go through the same overlap finder (precheck) before their batch insert');
  // مسارُ المواعيد يعيد الزرَّ عند الإلغاء، ولا يفحص المخطّط
  const AH = read('appointments.html'), sub = ext(AH, 'async function submitAppt');
  ok(/if \(!isPlannedNow && window\.SyDentConflict\)/.test(sub) && /if \(!_cfOk\) \{\s*btn\.disabled = false;/.test(sub), 'submitAppt: planned skipped, button restored on cancel');
  ok(/names: _cfNames\(\)/.test(sub) && /function _cfNames\(\)/.test(AH) && /OPERATORIES_ALL/.test(ext(AH, 'function _cfNames')), 'submitAppt: names from CLINIC_DOCTORS + OPERATORIES_ALL');
  ok(/id: editingId \|\| null/.test(sub) && /operatory_id: operatoryId/.test(sub) && /provider_id: providerId/.test(sub), 'submitAppt: candidate carries id/provider/operatory');
  const PA = read('pp-appt.js'), ps = ext(PA, 'async function _saveAppt_inner');
  ok(/if \(!isPlannedNow && window\.SyDentConflict\)/.test(ps) && /id: editingApptId \|\| null/.test(ps) && /if \(!_cfOk\) return;/.test(ps), 'pp-appt: guarded with edit id, planned skipped');
  ok(/verb: 'النقل'/.test(ext(AV, 'async function onK3SlotDrop')) && /verb: 'النقل'/.test(ext(AV, 'async function onWkSlotDrop')), 'drops: move verb');
  ok(/ AM| PM|[^\u2060]–/.test(loadModule(SRC).describe(loadModule(SRC).find({ date: '2026-10-01', time: '10:00', duration: 30, provider_id: 'A' }, [R(1, '10:15', 30, 'A')]), null)) === false, 'describe: time range never wraps (nbsp + word joiners)');
  // pp-clinical: الحارس قبل الإدخال وبعد تحقّق التاريخ/الوقت
  const PC = read('pp-clinical.js'); const gi = PC.indexOf('SyDentConflict.confirm('), ii = PC.indexOf(".from('appointments').insert(apptIns)");
  ok(gi > 0 && ii > gi && PC.indexOf("document.getElementById('labNewApptTime')") < gi, 'pp-clinical: guard after date/time read, before insert');

  /* ── (٤) تكافؤُ المسند مع الفحص القائم بملف المريض ───────────────────── */
  const PP = read('patient-profile.html');
  const pm = /return s1 < e0 && s0 < e1;/.exec(ext(PP, 'async function sessProvMoveToggle'));
  ok(!!pm, 'parity anchor: existing overlap predicate present in sessProvMoveToggle');
  ok(/not\('status', 'in', '\(cancelled,broken,no_show\)'\)/.test(ext(PP, 'async function sessProvMoveToggle')), 'parity anchor: same dead set (cancelled,broken,no_show)');
  const pred = new Function('s0', 'e0', 's1', 'e1', pm ? pm[0] : 'return false;');
  const Cp = loadModule(SRC); let agree = 0, seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 4000; i++) {
    const s0 = rnd(1440), d0 = 5 + rnd(120), s1 = rnd(1440), d1 = 5 + rnd(120);
    const t = m => (m / 60 | 0).toString().padStart(2, '0') + ':' + (m % 60).toString().padStart(2, '0');
    const got = Cp.find({ date: '2026-10-01', time: t(s0), duration: d0, provider_id: 'A' }, [R(1, t(s1), d1, 'A')]).length === 1;
    if (got === !!pred(s0, s0 + d0, s1, s1 + d1)) agree++;
  }
  ok(agree === 4000, 'parity: find ≡ existing predicate on 4000 random pairs (' + agree + ')');

  /* ── (٥) الربط ──────────────────────────────────────────────────────── */
  for (const f of ['appointments.html', 'patient-profile.html']) {
    const src = read(f); const tag = src.indexOf('<script src="appt-conflict.js?v='), dlg = src.indexOf('<script src="sy-modal.js?v=');
    const firstMod = Math.min(...['appt-views.js', 'appt-modal.js', 'pp-appt.js', 'pp-clinical.js'].map(n => src.indexOf('<script src="' + n + '?v=')).filter(i => i > 0));
    ok(tag > 0 && dlg > 0 && dlg < tag && tag < firstMod, f + ': appt-conflict.js after sy-modal.js and before the consuming modules');
    ok((src.match(/appt-conflict\.js\?v=/g) || []).length === 1, f + ': single tag');
  }
  ok(/appt-conflict\\\.js/.test(read('scripts/cache-bust.sh')) && (read('scripts/cache-bust.sh').match(/appt-conflict/g) || []).length === 3, 'cache-bust.sh: allow-listed (comment + regex + perl)');
  ok(!/window\.confirm\(|\balert\(|\bprompt\(/.test(SRC), 'module: no native browser dialogs');
  ok(/SYDENT_APPT_CONFLICT_START/.test(SRC) && /SYDENT_APPT_CONFLICT_END/.test(SRC) && /if \(window\.SyDentConflict\) return;/.test(SRC), 'module: sentinels + idempotent');

  /* ── الإثبات العكسي ───────────────────────────────────────────────────── */
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['s1 < e0 && s0 < e1', 's1 <= e0 && s0 < e1', 'adjacent counted'],
      ['if (DEAD_STATUSES[x.status]) return;', '', 'dead statuses occupy'],
      ['if (!x || (cand.id && x.id === cand.id)) return;', 'if (!x) return;', 'self not excluded'],
      ['if (x.is_planned || !x.date || x.date !== cand.date) return;', 'if (!x.date) return;', 'other day counted'],
      ["if (res.error) { console.warn('SyDentConflict: check failed — proceeding without guard:', res.error); return true; }", 'if (res.error) return false;', 'fail-closed on error']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const before = fail, passBefore = pass; const M = SRC.replace(a, b);
      const savedLog = console.log; console.log = () => {};
      suite(loadModule(M));
      const hh = { rows: [R(1, '10:10', 30, 'A')], answer: false, log: [] };
      const gone = (await loadModule(M, { err: { message: 'x' }, answer: false, log: [] }).confirm(cand, { doctorId: 'DOC' })) !== true;
      console.log = savedLog;
      const caught = fail > before || gone;
      if (caught) red++; else console.log('MUTANT SURVIVED:', name);
      fail = before; pass = passBefore;   // الطفرات لا تُحسب على النتيجة الأصلية
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }

  console.log((fail ? '❌' : '✅') + ' مثبت حارس التعارض: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
