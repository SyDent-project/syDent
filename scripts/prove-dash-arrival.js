/* v515 — مثبتُ زرّ «🚪 وصل» باللوحة لكل موعدٍ غير منتهٍ + التأكيدُ الضمني عند الوصول (index.html الحيّ).
   (١) getDashNextAction: يظهر للمؤكَّد وغير المؤكَّد (pending/scheduled) · لا للمنتهي · المرحلةُ التالية بالترتيب؛
   (٢) recordDashApptTime على sb مصطنع: وصولُ غير المؤكَّد يكتب arrived_at + confirmed_at + confirmation_status='confirmed'
       بكتابةٍ واحدة · المؤكَّدُ (بالختم أو بالحالة) يكتب arrived_at وحده · «جلس/خرج» لا يؤكّدان · قيدُ confirmation
       الغائب ⇒ إعادةٌ بالختم وحده · الصفُّ المكاش يُحدَّث · التوست يذكر التأكيد.
   --self-test: 4 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const IX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fn(src, name) {
  let i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error(name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let j = src.indexOf('{', i), d = 0, inS = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inS) { if (c === '\\') { k++; continue; } if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); continue; }
    if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k) + 1; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
const STAGES = IX.slice(IX.indexOf('var DASH_TIME_STAGES = ['), IX.indexOf('];', IX.indexOf('var DASH_TIME_STAGES = [')) + 2);
function build(src) {
  const code = STAGES + '\n' + fn(src, '_dashIsFinished') + '\n' + fn(src, 'getDashNextAction') + '\n' + fn(src, '_dashIsAutoFillRejection') + '\n' + fn(src, 'recordDashApptTime');
  const state = { updates: [], toasts: [], renders: 0 };
  const win = { showToast(m) { state.toasts.push(m); } };
  const sbErr = [];   // قائمةُ أخطاءٍ للردود المتتالية
  win.sb = { from(t) { const rec = { table: t }; return { update(p) { rec.patch = JSON.parse(JSON.stringify(p)); return { eq(k, v) { rec.eq = [k, v]; state.updates.push(rec); const e = sbErr.shift() || null; return Promise.resolve({ error: e }); } }; } }; } };
  const ctx = { window: win, console: { error() {}, warn() {} }, Date, String, Number, Promise, Array, Object, JSON, RegExp, Math,
    _dashApptsToday: [], _dashUid: 'DOC', _dashGap6WarnedOnce: false, _dashWarnGap6MigrationOnce() {},
    renderTodayApptsCard() { state.renders++; }, loadWaitingRoom() {}, fmtTime12(t) { return String(t); }, SyDialog: {} };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, state, sbErr };
}
const A = (extra) => Object.assign({ id: 'a1', status: 'pending', patient_name: 'م' }, extra || {});

function suite(src) {
  const { ctx, state, sbErr } = build(src);
  const next = a => ctx.getDashNextAction(a);
  ok(next(A()) && next(A()).key === 'arrived_at', 'next: pending (unconfirmed) → 🚪 وصل');
  ok(next(A({ status: 'scheduled' })) && next(A({ status: 'scheduled' })).key === 'arrived_at', 'next: scheduled (family/series rows) → 🚪 وصل');
  ok(next(A({ status: 'confirmed' })) && next(A({ status: 'confirmed' })).key === 'arrived_at', 'next: confirmed → 🚪 وصل');
  ok(next(A({ arrived_at: 'x' })).key === 'seated_at' && next(A({ arrived_at: 'x', seated_at: 'y' })).key === 'dismissed_at', 'next: stages in order');
  ok(next(A({ status: 'completed' })) === null && next(A({ status: 'cancelled' })) === null && next(A({ status: 'no_show' })) === null && next(A({ status: 'broken' })) === null, 'next: finished statuses → no button');
  ok(next(A({ arrived_at: 'x', seated_at: 'y', dismissed_at: 'z' })) === null && next(null) === null, 'next: all stamped / null → no button');

  return (async () => {
    // (٢) وصولُ غير المؤكَّد ⇒ تأكيدٌ ضمني بالكتابة نفسها
    ctx._dashApptsToday = [A()];
    await ctx.recordDashApptTime('a1', 'arrived_at', null);
    let u = state.updates[state.updates.length - 1];
    ok(u.table === 'appointments' && u.eq.join() === 'id,a1' && u.patch.arrived_at && u.patch.confirmed_at === u.patch.arrived_at && u.patch.confirmation_status === 'confirmed', 'stamp: unconfirmed arrival writes arrived_at + confirmed_at + confirmation_status in ONE update');
    ok(ctx._dashApptsToday[0].confirmed_at === u.patch.arrived_at && ctx._dashApptsToday[0].confirmation_status === 'confirmed' && ctx._dashApptsToday[0].arrived_at, 'stamp: cached row carries the implicit confirmation');
    ok(/وتأكّد الموعد/.test(state.toasts[state.toasts.length - 1]) && state.renders === 1, 'stamp: toast says the appointment was confirmed; card re-rendered');
    // المؤكَّد بالختم
    ctx._dashApptsToday = [A({ confirmed_at: '2026-09-28T05:00:00Z' })];
    await ctx.recordDashApptTime('a1', 'arrived_at', null);
    u = state.updates[state.updates.length - 1];
    ok(Object.keys(u.patch).join() === 'arrived_at', 'stamp: already confirmed (stamp) → arrived_at only');
    ok(!/وتأكّد/.test(state.toasts[state.toasts.length - 1]), 'stamp: no confirmation wording when already confirmed');
    // المؤكَّد بالحالة
    ctx._dashApptsToday = [A({ confirmation_status: 'confirmed' })];
    await ctx.recordDashApptTime('a1', 'arrived_at', null);
    ok(Object.keys(state.updates[state.updates.length - 1].patch).join() === 'arrived_at', 'stamp: already confirmed (status) → arrived_at only');
    // جلس/خرج لا يؤكّدان
    ctx._dashApptsToday = [A({ arrived_at: 'x' })];
    await ctx.recordDashApptTime('a1', 'seated_at', null);
    ok(Object.keys(state.updates[state.updates.length - 1].patch).join() === 'seated_at', 'stamp: seated_at never adds confirmation');
    // قيدٌ غائب ⇒ إعادةٌ بالختم وحده
    ctx._dashApptsToday = [A()];
    sbErr.push({ code: '23514', message: 'violates check constraint "confirmation_valid"' });
    const before = state.updates.length;
    await ctx.recordDashApptTime('a1', 'arrived_at', null);
    const u1 = state.updates[before], u2 = state.updates[before + 1];
    ok(state.updates.length === before + 2 && u1.patch.confirmation_status === 'confirmed' && !('confirmation_status' in u2.patch) && u2.patch.confirmed_at && u2.patch.arrived_at, 'stamp: constraint error → retry without confirmation_status, stamps kept');
    ok(ctx._dashApptsToday[0].arrived_at && ctx._dashApptsToday[0].confirmed_at, 'stamp: retry success updates the cached row');
    // خطأٌ حقيقي ⇒ لا تحديثَ للصفّ + توستُ فشل
    ctx._dashApptsToday = [A()];
    sbErr.push({ code: 'PGRST301', message: 'boom' });
    await ctx.recordDashApptTime('a1', 'arrived_at', null);
    ok(!ctx._dashApptsToday[0].arrived_at && /تعذّر/.test(state.toasts[state.toasts.length - 1]), 'stamp: real error → nothing cached, failure toast');
    // (٣) الربط: زرُّ الصفّ يُبنى من getDashNextAction ولا بوابةَ تأكيدٍ متبقّية
    ok(/var btn = isNext \? _dashConfirmChipHtml\(a\) : renderDashActionBtn\(a\);/.test(src) && /var act = getDashNextAction\(appt\);/.test(src), 'wiring: today card button built from getDashNextAction');
    ok(!/if \(!appt\.confirmed_at && appt\.status !== 'confirmed'\) return null;/.test(src), 'wiring: the old confirmation gate is gone');
  })();
}

(async () => {
  await suite(IX);
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['  if (_dashIsFinished(appt.status)) return null;\n  for (var i = 0; i < DASH_TIME_STAGES.length; i++) {', "  if (_dashIsFinished(appt.status)) return null;\n  if (!appt.confirmed_at && appt.status !== 'confirmed') return null;\n  for (var i = 0; i < DASH_TIME_STAGES.length; i++) {", 'confirmation gate restored'],
      ["var _implicitConfirm = fieldKey === 'arrived_at' && !!_rowPre", "var _implicitConfirm = !!_rowPre", 'seated/dismissed also confirm'],
      ["if (_implicitConfirm) { patch.confirmed_at = nowIso; patch.confirmation_status = 'confirmed'; }", "if (_implicitConfirm) { patch.confirmed_at = nowIso; }", 'confirmation_status dropped'],
      ['      delete patch.confirmation_status;\n      res = await window.sb.from(\'appointments\').update(patch).eq(\'id\', apptId);', '      delete patch.confirmation_status;', 'no retry without constraint']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!IX.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { await suite(IX.replace(a, b)); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت وصول اللوحة: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
