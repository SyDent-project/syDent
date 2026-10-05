/* v498 — مثبتُ الحجوزات المغلقة (sched-blocks.js · appt-blocks.js · M154) — مستقل، على الملفات الحيّة.
   (١) دلالةُ الوحدة من التعريف: التطبيقُ على يوم (مدى + أيام أسبوع) · التوسيعُ اليومي · اليومُ الكامل · المنعُ بالنطاق
       (عامّ/كرسي/طبيب) والفترةُ نصفُ المفتوحة · reserved لا يمنع · ساعاتُ العمل والتظليل؛
   (٢) اندماجُ حارس التعارض: check يُعيد blocks، confirm يحاور عند فترةٍ مانعة وحدها، ونصُّ الحوار؛
   (٣) الربطُ بالعروض: الكراسي والأسبوع (حالةُ الفراغ · المدى · التظليل · الرسم) واليوم (الشريط) والشهر (الشريحة)؛
   (٤) نافذةُ الإدارة: حرّاسُ وضع القراءة · جمعُ النموذج وتحقّقُه · الحذفُ بـSyDialog · نطاقُ الطبيب بكل كتابة · طقمُ الأزرار؛
   (٥) عقدُ الهجرة M154: الجدول وقيوده · RLS + _sub_guard_table · الحجزُ الإلكتروني يرى الفترات (busy + create_request)؛
   (٦) الربط: وسومُ السكربت بالترتيب · قائمةُ سماح cache-bust · تحميلُ الفترات بالـinit قبل أول رسم.
   --self-test: 5 طفرات على الوحدة لا بدّ أن تحمّر (١). */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('sched-blocks.js');

function load(src, sb) {
  const win = {}; if (sb) win.sb = sb;
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math };
  vm.createContext(ctx); vm.runInContext(src, ctx); return win.SyDentBlocks;
}
const B = (o) => Object.assign({ id: 'b1', title: 'استراحة', kind: 'break', date_from: '2026-10-01', date_to: '2026-10-31', weekdays: null, start_time: '13:00:00', end_time: '14:00:00', operatory_id: null, provider_id: null, blocks_scheduling: true }, o || {});

function suite(K) {
  // appliesOn
  ok(K.appliesOn(B(), '2026-10-01') && K.appliesOn(B(), '2026-10-31') && !K.appliesOn(B(), '2026-09-30') && !K.appliesOn(B(), '2026-11-01'), 'appliesOn: inclusive range');
  ok(K.appliesOn(B({ weekdays: [0, 2] }), '2026-10-04') && !K.appliesOn(B({ weekdays: [0, 2] }), '2026-10-05'), 'appliesOn: weekdays (Sun=0 · Oct 4 2026 is Sunday)');
  ok(K.appliesOn(B({ weekdays: [] }), '2026-10-05'), 'appliesOn: empty weekdays = every day');
  ok(K.appliesOn(B({ date_to: null }), '2030-01-01') && !K.appliesOn(B({ date_to: null }), '2026-09-30'), 'appliesOn: date_to NULL = open-ended (M155)');
  ok(K.expand([B({ date_to: null, weekdays: [1] })], '2027-03-01', '2027-03-14').length === 2, 'expand: open-ended weekly block keeps expanding years later');
  // expand
  let x = K.expand([B({ weekdays: [0, 2], date_from: '2026-10-04', date_to: '2026-10-10' })], '2026-10-01', '2026-10-31');
  ok(x.length === 2 && x[0].date === '2026-10-04' && x[1].date === '2026-10-06' && x[0].startMin === 780 && x[0].endMin === 840 && !x[0].allDay, 'expand: Sun+Tue in one week → 2 instances 13:00–14:00');
  x = K.expand([B({ date_from: '2026-10-12', date_to: '2026-10-12', start_time: null, end_time: null })], '2026-10-01', '2026-10-31');
  ok(x.length === 1 && x[0].allDay && x[0].startMin === 0 && x[0].endMin === 1440, 'expand: all-day instance spans 0..1440');
  x = K.expand([B({ date_from: '2026-09-20', date_to: '2026-10-05' })], '2026-10-01', '2026-10-03');
  ok(x.length === 3 && x[0].date === '2026-10-01' && x[2].date === '2026-10-03', 'expand: clipped to the requested window');
  ok(K.expand([B({ start_time: '14:00', end_time: '13:00' })], '2026-10-01', '2026-10-01').length === 0, 'expand: end ≤ start skipped');
  x = K.expand([B({ id: 'late', start_time: '15:00', end_time: '16:00' }), B({ id: 'early', start_time: '09:00', end_time: '10:00' })], '2026-10-02', '2026-10-02');
  ok(x[0].block.id === 'early' && x[1].block.id === 'late', 'expand: sorted by start within a day');
  ok(K.forDay(K.expand([B()], '2026-10-01', '2026-10-31'), '2026-10-15').length === 1, 'forDay: picks the day');
  // column scoping
  const gen = K.expand([B()], '2026-10-02', '2026-10-02')[0], chair = K.expand([B({ operatory_id: 'K1' })], '2026-10-02', '2026-10-02')[0];
  ok(K.appliesToColumn(gen, 'K1') && K.appliesToColumn(gen, null) && K.appliesToColumn(chair, 'K1') && !K.appliesToColumn(chair, 'K2') && !K.appliesToColumn(chair, null), 'appliesToColumn: general → all columns; chair-specific → its column only');
  // blocking
  const inst = K.expand([B(), B({ id: 'k', operatory_id: 'K1', start_time: '10:00', end_time: '11:00' }), B({ id: 'p', provider_id: 'A', start_time: '16:00', end_time: '17:00' }), B({ id: 'r', kind: 'reserved', blocks_scheduling: false, start_time: '08:00', end_time: '09:00' })], '2026-10-02', '2026-10-02');
  const c = (time, dur, prov, op) => K.blocking(inst, { date: '2026-10-02', time, duration: dur, provider_id: prov, operatory_id: op }).map(i => i.block.id).join();
  ok(c('13:30', 30, null, null) === 'b1' && c('13:30', 30, 'Z', 'K9') === 'b1', 'blocking: general block hits everyone');
  ok(c('12:30', 30, null, null) === '' && c('14:00', 30, null, null) === '' && c('12:45', 30, null, null) === 'b1', 'blocking: half-open interval (adjacent free, 1-min overlap hits)');
  ok(c('10:30', 30, null, 'K1') === 'k' && c('10:30', 30, null, 'K2') === '' && c('10:30', 30, null, null) === '', 'blocking: chair block hits that chair only');
  ok(c('16:30', 30, 'A', null) === 'p' && c('16:30', 30, 'B', null) === '' && c('16:30', 30, null, null) === '', 'blocking: provider block hits that provider only');
  ok(c('08:30', 30, null, null) === '', 'blocking: reserved (blocks_scheduling=false) never blocks');
  ok(K.blocking(inst, { date: '2026-10-03', time: '13:30', duration: 30 }).length === 0 && K.blocking(inst, { date: '2026-10-02', time: null }).length === 0, 'blocking: other day / no time → nothing');
  ok(c('13:50', null, null, null) === 'b1' && c('13:50', 'x', null, null) === 'b1', 'blocking: missing duration = 30');
  const allDay = K.expand([B({ start_time: null, end_time: null })], '2026-10-02', '2026-10-02');
  ok(K.blocking(allDay, { date: '2026-10-02', time: '07:00', duration: 30 }).length === 1 && K.blocking(allDay, { date: '2026-10-02', time: '23:30', duration: 30 }).length === 1, 'blocking: all-day blocks any time');
  // labels
  ok(/☕ استراحة/.test(K.label(gen)) && /01:00\u00A0PM\u2060–\u206002:00\u00A0PM/.test(K.timeLabel(gen)) && K.timeLabel(allDay[0]) === 'يومٌ كامل', 'label/timeLabel');
  ok(/^• وقتٌ محجوز: ☕ استراحة /.test(K.describeLine(gen)), 'describeLine wording');
  ok(K.label(K.expand([B({ title: '', kind: 'power' })], '2026-10-02', '2026-10-02')[0]) === '⚡ انقطاع كهرباء', 'label: kind name when title empty');
  // work hours
  const wh = K.workHours({ booking_work_days: '0,1,2,3,4', booking_work_start: '09:00:00', booking_work_end: '17:00:00' });
  ok(wh && wh.startMin === 540 && wh.endMin === 1020 && wh.days.join() === '0,1,2,3,4', 'workHours parsed');
  ok(K.isClosed(wh, '2026-10-05', 480) && !K.isClosed(wh, '2026-10-05', 540) && !K.isClosed(wh, '2026-10-05', 1010) && K.isClosed(wh, '2026-10-05', 1020), 'isClosed: before start / at end closed, inside open');
  ok(K.isClosed(wh, '2026-10-03', 600) && !K.isClosed(wh, '2026-10-04', 600), 'isClosed: Saturday (6) closed, Sunday (0) open');
  ok(K.workHours(null) === null && K.workHours({ booking_work_start: '17:00', booking_work_end: '09:00' }) === null && !K.isClosed(null, '2026-10-05', 480), 'workHours: missing/invalid → null → nothing shaded');
}
suite(load(SRC));

(async () => {
  /* load(): query shape + pre-M154 tolerance */
  function sbStub(rows, err) {
    const calls = { eq: [], lte: [], gte: [] };
    const q = { select(c) { calls.select = c; return q; }, eq(k, v) { calls.eq.push([k, v]); return q; }, lte(k, v) { calls.lte.push([k, v]); return q; }, gte(k, v) { calls.gte.push([k, v]); return q; }, or(v) { calls.or = v; return q; }, order() { return q; },
      then(r) { return Promise.resolve(err ? { error: err } : { data: rows, error: null }).then(r); } };
    return { sb: { from(t) { calls.table = t; return q; } }, calls };
  }
  let st = sbStub([B()]); let K = load(SRC, st.sb);
  let rows = await K.load('DOC', '2026-10-01', '2026-10-31');
  ok(rows.length === 1 && st.calls.table === 'schedule_blocks' && st.calls.eq[0].join() === 'doctor_id,DOC' && st.calls.lte[0].join() === 'date_from,2026-10-31' && st.calls.or === 'date_to.is.null,date_to.gte.2026-10-01', 'load: doctor-scoped, range-overlap query, open-ended rows included (M155)');
  ok(/blocks_scheduling/.test(st.calls.select) && /weekdays/.test(st.calls.select), 'load: selects needed columns');
  st = sbStub(null, { code: '42P01', message: 'relation schedule_blocks does not exist' }); K = load(SRC, st.sb);
  ok((await K.load('DOC', '2026-10-01', '2026-10-31')).length === 0, 'load: missing table (pre-M154) → [] silently');

  /* (٢) حارس التعارض */
  const CSRC = read('appt-conflict.js');
  function loadGuard(apptRows, blockRows, answer, log) {
    const win = { currentUser: { id: 'DOC' } };
    win.sb = { from(t) { const rows = t === 'appointments' ? apptRows : blockRows; const q = { select() { return q; }, eq() { return q; }, lte() { return q; }, gte() { return q; }, or() { return q; }, order() { return q; }, then(r) { return Promise.resolve({ data: rows, error: null }).then(r); } }; return q; } };
    win.SyDialog = { confirm: async o => { log.push(o); return answer; } };
    const ctx = { window: win, console: { warn() {} }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp };
    vm.createContext(ctx); vm.runInContext(SRC, ctx); vm.runInContext(CSRC, ctx);
    return win.SyDentConflict;
  }
  let log = []; let G = loadGuard([], [B()], false, log);
  const cand = { date: '2026-10-02', time: '13:30', duration: 30, provider_id: null, operatory_id: null };
  let res = await G.check(cand, 'DOC');
  ok(res.conflicts.length === 0 && res.blocks.length === 1, 'guard.check: block-only result, no appointments query needed without a resource');
  ok((await G.confirm(cand, { doctorId: 'DOC' })) === false && log.length === 1 && /فترةٍ محجوزة على التقويم/.test(log[0].message) && /وقتٌ محجوز: ☕ استراحة/.test(log[0].message) && /هل تريد الحجز رغم التعارض/.test(log[0].message), 'guard.confirm: dialog for a blocking block alone');
  log = []; G = loadGuard([{ id: 1, date: '2026-10-02', time: '13:40', duration: 30, provider_id: 'A', status: 'confirmed', patient_name: 'P' }], [B()], true, log);
  ok((await G.confirm(Object.assign({}, cand, { provider_id: 'A' }), { doctorId: 'DOC' })) === true && /موعدٍ آخر ومع وقتٍ محجوز:/.test(log[0].message) && /الطبيب/.test(log[0].message), 'guard.confirm: appointment + block → combined heading');
  log = []; G = loadGuard([], [B({ blocks_scheduling: false })], false, log);
  ok((await G.confirm(cand, { doctorId: 'DOC' })) === true && log.length === 0, 'guard.confirm: reserved block → no dialog');
  log = []; G = loadGuard([], [B()], false, log);
  ok((await G.confirm(Object.assign({}, cand, { time: '12:00' }), { doctorId: 'DOC' })) === true && log.length === 0, 'guard.confirm: outside the block → no dialog');

  /* (٣) العروض */
  const AV = read('appt-views.js');
  function ext(src, name) { const i = src.indexOf(name); if (i < 0) throw new Error('missing ' + name); let j = src.indexOf('{', i), d = 0, k = j; for (; k < src.length; k++) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } } return src.slice(i, k + 1); }
  const chair = ext(AV, 'function renderDayByChair'), week = ext(AV, 'function renderWeek'), day = ext(AV, 'function renderDay()'), cell = ext(AV, 'function cellHTML');
  ok(/if \(!dayEvts\.length && !dayBlocks\.length\)/.test(chair) && /if \(!weekEvts\.length && !weekBlocks\.length\)/.test(week), 'views: empty state only when no appointments AND no blocks');
  ok(/_k3ComputeRange\(dayEvts\.concat\(_blockPseudoEvts\(dayBlocks\)\)\)/.test(chair) && /_k3ComputeRange\(weekEvts\.concat\(_blockPseudoEvts\(weekBlocks\)\)\)/.test(week), 'views: timed blocks extend the visible range');
  ok(/class="k3-slot-cell' \+ _slotClosedCls\(wh, ds, slotMin2\)/.test(chair) && /class="k3-slot-cell' \+ _slotClosedCls\(wh, day\.ds, slotMin2\)/.test(week), 'views: closed-hours shading class on every slot cell');
  ok(/appliesToColumn\(i, col\.id\)/.test(chair) && /_paintBlocks\(colEl0, day\.blocks, range\)/.test(week), 'views: chair columns scoped, week columns all');
  ok(chair.indexOf('_paintBlocks(') < chair.indexOf('apptsByCol[idxKey].forEach') && week.indexOf('_paintBlocks(') < week.indexOf('items.forEach(function(item){'), 'views: blocks painted before appointments (z-order under them)');
  ok(/innerHTML = _dayBlocksStrip\(dayBlocks\) \+ html/.test(day), 'day list: strip above the list');
  ok(/i\.allDay && i\.blocks && !i\.operatory_id && !i\.provider_id/.test(cell) && /class="cal-block"/.test(cell), 'month: chip for a clinic-wide all-day block only');
  const pb = ext(AV, 'function _paintBlocks');
  ok(/el\.textContent = window\.SyDentBlocks\.label\(i\)/.test(pb) && !/innerHTML/.test(pb) && /openBlockModal\(i\.block\.id\)/.test(pb), '_paintBlocks: textContent (no HTML), click → edit');
  const css = read('appointments.css');
  ok(!/\.bk-|\.sbk-/.test(css) && /\.k3-slot-cell\.k3-closed \{ background: repeating-linear-gradient/.test(css) && /\.k3-block \{[^}]*z-index: 0/.test(css) && /\.k3-appt \{ z-index: 1; \}/.test(css) && /\.k3-block\.k3-block-soft/.test(css) && /\.cal-block \{/.test(css) && /\.day-block-chip \{/.test(css), 'css: shading, block layer under appointments, soft variant, month chip, day chip');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf('v498 (M154)'))), 'css: tokens only, no hard-coded colours in the new block');

  /* (٤) نافذةُ الإدارة */
  const AB = read('appt-blocks.js'), AH = read('appointments.html');
  ['openBlockModal', 'saveBlock', 'deleteBlock'].forEach(fn => {
    const body = ext(AB, 'async function ' + fn);
    ok(/if \(window\.SyDentSub && window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(body), fn + ': read-only guard');
  });
  ok(/\.update\(c\.row\)\.eq\('id', _sbkEditingId\)\.eq\('doctor_id', currentUser\.id\)/.test(AB) && /\.delete\(\)\.eq\('id', id\)\.eq\('doctor_id', currentUser\.id\)/.test(AB) && /doctor_id: currentUser\.id/.test(AB), 'writes: doctor-scoped update/delete, insert carries doctor_id');
  ok(/window\.SyDialog\.confirm\(\{ title: 'حذف الحجز'/.test(AB) && !/window\.confirm\(|\balert\(/.test(AB), 'delete: SyDialog, no native dialogs');
  ok(/class="sy-act" data-sub-write onclick="openBlockModal\(/.test(AB) && /class="sy-act sy-act-danger" data-sub-write onclick="deleteBlock\(/.test(AB), 'list rows: kit buttons (edit · delete) with sub-write');
  ok(!/innerHTML = [^;]*\+ *(b\.title|b\.notes|kind\.label)/.test(AB) && /_sbkEsc\(kind\.icon \+ ' ' \+ \(b\.title \|\| ''\)\)/.test(AB) && /_sbkEsc\(_sbkWhenText\(b\)\)/.test(AB), 'list rows: every user string escaped');
  ok(/await _sbkReload\(\);/.test(ext(AB, 'async function saveBlock')) && /await _sbkReload\(\); renderBlockList\(\);/.test(ext(AB, 'async function deleteBlock')) && /if \(typeof loadBlocks === 'function'\) \{ await loadBlocks\(\); \}/.test(ext(AB, 'async function _sbkReload')) && /if \(typeof render === 'function'\) render\(\);/.test(ext(AB, 'async function _sbkReload')), 'save/delete: reload via the host page when present (appointments) else locally (settings), then repaint');
  const tpl = ext(AB, 'function _sbkEnsureModal');
  ok(/id="schedBlockModal"/.test(tpl) && /class="modal-overlay sy-m sy-m-md" id="schedBlockModal"/.test(tpl) && !/id="schedBlockModal" onclick=/.test(tpl) && /if \(_sbkEl\('schedBlockModal'\)\) return;/.test(tpl), 'modal: injected once from JS, on the kit, no outside-click close (data entry)');
  ok(/_sbkEl\('schedBlockModal'\)\.classList\.add\('open'\)/.test(AB) && /classList\.remove\('open'\)/.test(AB) && /\.modal-overlay\.sy-m\.open/.test(read('theme.css')), 'modal: opens with the kit class «open» (caught live: «active» never showed it)');
  ok((tpl.match(/<label class="sbk-check"><input type="checkbox" id="sbk(AllDay|Blocks)"/g) || []).length === 2 && /#schedBlockModal \.sbk-check input\[type="checkbox"\] \{[^}]*appearance: checkbox/.test(read('theme.css')), 'modal: the two checkboxes are real checkboxes (pages flatten inputs — seen live as grey bars)');
  ok(/#schedBlockModal \.sbk-weekdays label input \{ position: absolute; inset: 0;[^}]*opacity: 0/.test(read('theme.css')) && /#schedBlockModal \.sbk-weekdays label:has\(input:checked\) \{[^}]*background: var\(--green-bg\)/.test(read('theme.css')), 'weekday chips: whole chip is the control, checked state filled');
  ok(/\(فارغ = من اليوم\)/.test(tpl) && /\(فارغ = دائم\)/.test(tpl) && /_sbkEl\('sbkFrom'\)\.value = dateYmd \|\| ''; _sbkEl\('sbkTo'\)\.value = dateYmd \|\| '';/.test(AB), 'modal: dates empty by default with explained placeholders');
  ok(/return !b\.date_to \|\| b\.date_to >= today;/.test(AB) && /— دائم/.test(AB), 'list: open-ended blocks listed as دائم');
  const M155 = read('migrations/155_schedule_blocks_open_end.sql');
  ok(/ALTER COLUMN date_to DROP NOT NULL/.test(M155) && /date_to IS NULL OR \(date_to >= date_from/.test(M155) && /LEAST\(COALESCE\(b\.date_to, p_to\), p_to\)/.test(M155) && /\(b\.date_to IS NULL OR b\.date_to >= p_from\)/.test(M155), 'M155: nullable date_to, constraint, booking expansion open-ended');
  ok(!/id="blockModal"|id="schedBlockModal"/.test(AH) && !/id="schedBlockModal"/.test(read('settings.html')), 'no static copy of the modal in either page (single source, no mirror)');
  // بادئةُ sbk لا تصطدم بمعرّفات الصفحتين المضيفتين (الإعداداتُ تملك bkStart/bkEnd/bkNote)
  const ids = [...tpl.matchAll(/id="(sbk[A-Za-z]+)"/g)].map(m => m[1]);
  ok(ids.length >= 14 && ids.every(id => !new RegExp('id="' + id + '"').test(AH) && !new RegExp('id="' + id + '"').test(read('settings.html'))), 'modal ids are unique against both host pages (' + ids.length + ' ids)');
  ok(/id="bkStart"/.test(read('settings.html')) && !ids.includes('bkStart'), 'settings.html keeps its own bkStart/bkEnd untouched');
  ok(/onclick="openBlockModal\(\)" title="[^"]*" data-sub-write data-doctor-inactive-block/.test(AH), 'header: «حجز وقت» button gated for sub-write and inactive doctor');
  // _bkCollect validation via a tiny DOM stub
  function collect(vals) {
    const els = {}; const mk = (id, v, extra) => { els[id] = Object.assign({ value: v, checked: false, options: [], style: {} }, extra || {}); };
    mk('sbkTitle', vals.title); mk('sbkFrom', vals.from); mk('sbkTo', vals.to); mk('sbkAllDay', '', { checked: !!vals.allDay }); mk('sbkStart', vals.st || ''); mk('sbkEnd', vals.en || '');
    mk('sbkKind', vals.kind || 'break'); mk('sbkOperatory', vals.op || ''); mk('sbkProvider', vals.pv || ''); mk('sbkBlocks', '', { checked: vals.blocks !== false }); mk('sbkNotes', vals.notes || '');
    const wds = (vals.wd || []).map(d => ({ checked: true, value: String(d) }));
    const ctx = { document: { getElementById: id => els[id], querySelectorAll: () => wds }, currentUser: { id: 'DOC' }, Array, parseInt, String, Date, Math, window: {}, dateStr: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
    vm.createContext(ctx); ctx._sbkEditingId = vals.editing || null; ctx._sbkRowsNow = () => vals.rows || [];
    vm.runInContext(ext(AB, 'function _sbkEl') + '\n' + ext(AB, 'function _sbkYmd') + '\n' + ext(AB, 'function _sbkDaysBetween') + '\n' + ext(AB, 'function _sbkCollect') + '\nthis.r=_sbkCollect();', ctx); return ctx.r;
  }
  ok(collect({ title: '', from: '2026-10-01', to: '2026-10-01', st: '13:00', en: '14:00' }).error, 'collect: title required');
  const today = new Date(); const todayYmd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const open = collect({ title: 'غداء', from: '', to: '', st: '13:00', en: '14:00' });
  ok(open.row && open.row.date_from === todayYmd && open.row.date_to === null, 'collect: empty dates → from today, open-ended (owner decision)');
  const kept = collect({ title: 'إجازة', from: '', to: '', st: '13:00', en: '14:00', editing: 'b9', rows: [{ id: 'b9', date_from: '2027-02-01' }] });
  ok(kept.row && kept.row.date_from === '2027-02-01', 'collect: editing with an emptied «من» keeps the original start (never silently moved to today)');
  ok(collect({ title: 'x', from: '2026-01-01', to: '2027-06-01', st: '13:00', en: '14:00' }).error && collect({ title: 'x', from: '2026-01-01', to: '2027-01-01', st: '13:00', en: '14:00' }).row, 'collect: closed range capped at 366 days (matches the DB check)');
  ok(collect({ title: 'x', from: '2026-10-05', to: '2026-10-01', st: '13:00', en: '14:00' }).error && collect({ title: 'x', from: '2026-10-01', to: '2026-10-01', st: '14:00', en: '13:00' }).error && collect({ title: 'x', from: '2026-10-01', to: '2026-10-01' }).error, 'collect: reversed dates / reversed times / missing times rejected');
  let r = collect({ title: 'استراحة', from: '2026-10-01', to: '2026-10-31', st: '13:00', en: '14:00', wd: [0, 2], notes: '  ' });
  ok(r.row && r.row.doctor_id === 'DOC' && r.row.weekdays.join() === '0,2' && r.row.start_time === '13:00' && r.row.notes === null && r.row.blocks_scheduling === true && r.row.operatory_id === null, 'collect: valid timed weekly block');
  r = collect({ title: 'إجازة', from: '2026-10-12', to: '2026-10-12', allDay: true, st: '13:00', en: '14:00', kind: 'leave', op: 'K1', blocks: false });
  ok(r.row && r.row.start_time === null && r.row.end_time === null && r.row.weekdays === null && r.row.operatory_id === 'K1' && r.row.blocks_scheduling === false && r.row.kind === 'leave', 'collect: all-day ignores times; empty weekdays → null');

  /* (٥) الهجرة */
  const M = read('migrations/154_schedule_blocks.sql');
  ok(/CREATE TABLE IF NOT EXISTS public\.schedule_blocks/.test(M) && /schedule_blocks_time_chk/.test(M) && /schedule_blocks_weekdays_chk/.test(M) && /schedule_blocks_range_chk/.test(M) && /schedule_blocks_kind_chk/.test(M), 'M154: table + 4 constraints');
  ok(/ENABLE ROW LEVEL SECURITY/.test(M) && /schedule_blocks_owner_all/.test(M) && /_sub_guard_table\('public\.schedule_blocks'\)/.test(M), 'M154: RLS owner policy + subscription gate');
  ok(/FUNCTION public\.booking_blocked_slots/.test(M) && /b\.operatory_id IS NULL AND b\.provider_id IS NULL/.test(M) && /AND b\.blocks_scheduling/.test(M) && /EXTRACT\(DOW FROM g\.d\)::smallint = ANY \(b\.weekdays\)/.test(M), 'M154: blocked_slots = clinic-wide blocking rows, weekday-expanded');
  ok(/booking_busy_slots[\s\S]*booking_blocked_slots\(p_clinic, p_from, p_to\) bs/.test(M) && /booking_create_request[\s\S]*booking_blocked_slots\(p_clinic, p_date, p_date\) bs[\s\S]*RAISE EXCEPTION 'slot_taken'/.test(M), 'M154: online booking sees blocks (busy) and refuses them (slot_taken)');
  ok(/GRANT EXECUTE ON FUNCTION public\.booking_blocked_slots\(uuid, date, date\) TO anon, authenticated, service_role/.test(M), 'M154: anon can call blocked_slots (public booking page)');

  /* (٦) الربط */
  const tags = ['sy-modal.js', 'appt-conflict.js', 'sched-blocks.js', 'appt-blocks.js', 'appt-views.js'].map(n => AH.indexOf('<script src="' + n + '?v='));
  ok(tags.every(i => i > 0) && tags[0] < tags[1] && tags[1] < tags[2] && tags[2] < tags[3] && tags[3] < tags[4], 'appointments.html: sy-modal → appt-conflict → sched-blocks → appt-blocks → appt-views');
  /* v551 (DeepCode #1): الإقلاعُ صار دفعةً متوازية — الحجوزاتُ المغلقة ضمنها، وأولُ رسمٍ ينتظر الدفعة (أقوى من قبل:
     سابقاً رسمت loadAppointments قبل loadBlocks فكان أولُ رسمٍ بلا حجوزات). */
  ok(/_apptAux = Promise\.all\(\[[^\]]*loadBlocks\(\)[^\]]*\]/.test(AH) && /if \(_apptAux\) \{ try \{ await _apptAux; \} catch \(e\) \{\} \}\s*\n(?:.*\n){0,4}\s*render\(\);\n\}/.test(AH),
     'init: blocks load in the boot batch and the first render waits for it');
  const SH = read('settings.html'); const stags = ['sy-modal.js', 'sched-blocks.js', 'appt-blocks.js'].map(n => SH.indexOf('<script src="' + n + '?v='));
  ok(stags.every(i => i > 0) && stags[0] < stags[1] && stags[1] < stags[2], 'settings.html: sy-modal → sched-blocks → appt-blocks');
  ok(/onclick="openBlockModal\(\)" data-sub-write/.test(SH) && SH.indexOf('onclick="openBlockModal()"') < SH.indexOf('id="btnSaveBooking"') && SH.indexOf('onclick="openBlockModal()"') > SH.indexOf('id="bkLink"'), 'settings.html: «حجز وقت» sits inside the online-booking card, above its save button');
  ok(/from\('operatories'\)\.select\('id, name, is_active, sort_order'\)\.eq\('doctor_id', currentUser\.id\)/.test(AB) && /from\('clinic_doctors'\)\.select\('id, name, is_active'\)\.eq\('owner_id', currentUser\.id\)/.test(AB), 'pickers fallback (settings): doctor-scoped queries for chairs and providers');
  const cb = read('scripts/cache-bust.sh');
  ok((cb.match(/sched-blocks/g) || []).length === 3 && (cb.match(/appt-blocks/g) || []).length === 3, 'cache-bust.sh: both files allow-listed');
  ok(/if \(window\.SyDentBlocks\) return;/.test(SRC) && /SYDENT_BLOCKS_END/.test(SRC) && !/innerHTML|window\.confirm|\balert\(/.test(SRC), 'module: idempotent, no DOM writes, no native dialogs');

  /* الإثبات العكسي */
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['if (!i.blocks) return false;', '', 'reserved blocks'],
      ['if (!(i.startMin < e0 && s0 < i.endMin)) return false;', 'if (!(i.startMin <= e0 && s0 <= i.endMin)) return false;', 'adjacent counted'],
      ["if (i.operatory_id && i.operatory_id !== (cand.operatory_id || null)) return false;", '', 'chair scope ignored'],
      ['return b.weekdays.indexOf(dowOf(dateYmd)) !== -1;', 'return true;', 'weekdays ignored'],
      ['return min < wh.startMin || min >= wh.endMin;', 'return min < wh.startMin || min > wh.endMin;', 'end minute open']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, lg = console.log; console.log = () => {};
      suite(load(SRC.replace(a, b)));
      console.log = lg;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت الحجوزات المغلقة: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
