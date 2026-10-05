/* v505 — مثبتُ المواعيد المتكرّرة (appt-series.js · M157) — مستقل، على الملفات الحيّة.
   (١) plan/addPeriod من التعريف: أسبوعي · كل أسبوعين · شهري بقصّ نهاية الشهر · عبورُ السنة · حدودُ العدد · صيغُ الإدخال؛
   (٢) siblingRows: الحقولُ الجدولية فقط، status=scheduled، الفهرسُ من 2، لا أختامَ ولا asap ولا طلبَ حجز؛
   (٣) precheck: استعلامُ مواعيدَ واحد بـin(dates) فقط عند وجود مورد، الفتراتُ دائماً، التعارضُ بكل تاريخ؛
   (٤) cancelRest: تحديثٌ محصورٌ بالطبيب والسلسلة وما بعد الفهرس وغير المنتهي؛
   (٥) الربط: النموذج · الأساسُ يحمل series عند «جديد ومجدوَل» فقط · الأخوةُ بعد نجاح الإدخال وقبل ربط طلب الحجز ·
       التعديلُ والمخطّطُ يخفيان التكرار · الشارةُ بالعروض الخمسة · cache-bust · ترتيبُ السكربت · M157.
   --self-test: 5 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('appt-series.js');
function ext(src, name) { const i = src.indexOf(name); if (i < 0) throw new Error('missing ' + name); let j = src.indexOf('{', i), d = 0, k = j; for (; k < src.length; k++) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } } return src.slice(i, k + 1); }
function load(src, win) {
  win = win || {};
  const ctx = { window: win, console: { warn() {} }, Number, parseInt, String, Date, Math, Array, Object, Promise, RegExp };
  vm.createContext(ctx);
  vm.runInContext(read('sched-blocks.js'), ctx); vm.runInContext(read('appt-conflict.js'), ctx); vm.runInContext(src, ctx);
  return win.SyDentSeries;
}
function suite(S) {
  ok(S.plan('2026-10-05', 'weekly', 4).join() === '2026-10-12,2026-10-19,2026-10-26', 'plan: weekly ×4 → 3 siblings');
  ok(S.plan('2026-10-05', 'biweekly', 3).join() === '2026-10-19,2026-11-02', 'plan: biweekly');
  ok(S.plan('2026-01-31', 'monthly', 4).join() === '2026-02-28,2026-03-31,2026-04-30', 'plan: monthly clamps to month end (31→28/31/30)');
  ok(S.plan('2028-01-31', 'monthly', 2).join() === '2028-02-29', 'plan: leap year clamp');
  ok(S.plan('2026-11-15', 'monthly', 3).join() === '2026-12-15,2027-01-15', 'plan: crosses the year');
  ok(S.plan('2026-03-28', 'weekly', 2).join() === '2026-04-04' && S.plan('2026-10-24', 'weekly', 2).join() === '2026-10-31', 'plan: DST-safe (UTC arithmetic)');
  ok(S.plan('2026-10-05', 'weekly', 1).length === 0 && S.plan('2026-10-05', 'weekly', 25).length === 0 && S.plan('2026-10-05', 'daily', 3).length === 0 && S.plan('', 'weekly', 3).length === 0 && S.plan('2026-10-05', 'weekly', 'x').length === 0, 'plan: bounds and invalid inputs → []');
  ok(S.plan('2026-10-05', 'weekly', '3').length === 2, 'plan: numeric string count accepted');
  ok(S.plan('2026-10-05', 'monthly', 24).length === 23, 'plan: max 24');
  // siblings
  const saved = { id: 'A', doctor_id: 'DOC', patient_id: 'P', patient_name: 'سامر', time: '10:00:00', duration: 45, type: 'تقويم', notes: 'n', color: 'green', stroke: 'x', provider_id: 'PR', operatory_id: 'OP', appointment_type_id: 'AT', status: 'confirmed', asap: true, confirmed_at: 'now', series_id: 'S', series_total: 3, booking_request_id: 'B' };
  const rows = S.siblingRows(saved, ['2026-10-12', '2026-10-19'], 'S', 3);
  ok(rows.length === 2 && rows[0].series_index === 2 && rows[1].series_index === 3 && rows.every(r => r.series_id === 'S' && r.series_total === 3), 'siblings: index from 2, shared series');
  ok(rows.every(r => r.status === 'scheduled' && r.is_planned === false && r.time === '10:00:00' && r.duration === 45 && r.provider_id === 'PR' && r.operatory_id === 'OP' && r.appointment_type_id === 'AT' && r.patient_id === 'P'), 'siblings: scheduling fields copied, unconfirmed');
  ok(rows.every(r => !('asap' in r) && !('confirmed_at' in r) && !('id' in r) && !('booking_request_id' in r) && !('arrived_at' in r)), 'siblings: no id / stamps / asap / booking link');
  ok(S.siblingRows({ doctor_id: 'D', time: '09:00' }, ['2026-10-12'], 'S', 2)[0].duration === 30, 'siblings: missing duration → 30');
  ok(/tone-blue/.test(S.badgeHtml({ series_id: 'S', series_index: 3, series_total: 12 })) && /\u20663\/12\u2069/.test(S.badgeHtml({ series_id: 'S', series_index: 3, series_total: 12 })) && S.badgeHtml({}) === '' && S.badgeHtml(null) === '', 'badge');
  const ids = new Set([S.newId(), S.newId(), S.newId()]);
  ok(ids.size === 3 && [...ids].every(x => /^[0-9a-f-]{36}$/.test(x)), 'newId: unique uuids');
}
suite(load(SRC));

(async () => {
  // precheck with stubs
  function win(apptRows, blockRows) {
    const calls = { tables: [], in: null };
    const q = (rows) => { const o = { select() { return o; }, eq() { return o; }, in(k, v) { calls.in = v; return o; }, lte() { return o; }, gte() { return o; }, or() { return o; }, order() { return o; }, then(r) { return Promise.resolve({ data: rows, error: null }).then(r); } }; return o; };
    return { w: { sb: { from(t) { calls.tables.push(t); return q(t === 'appointments' ? apptRows : blockRows); } } }, calls };
  }
  const B = { id: 'b', title: 'استراحة', kind: 'break', date_from: '2026-10-01', date_to: null, weekdays: [1], start_time: '10:00:00', end_time: '11:00:00', blocks_scheduling: true };
  let { w, calls } = win([{ id: 1, date: '2026-10-19', time: '10:15', duration: 30, provider_id: 'PR', status: 'confirmed', patient_name: 'X' }], [B]);
  let S = load(SRC, w);
  let pre = await S.precheck({ time: '10:00', duration: 30, provider_id: 'PR', operatory_id: null }, ['2026-10-12', '2026-10-19', '2026-10-26'], 'DOC');
  ok(calls.tables.filter(t => t === 'appointments').length === 1 && calls.in.join() === '2026-10-12,2026-10-19,2026-10-26' && calls.tables.includes('schedule_blocks'), 'precheck: one appointments query with in(dates) + one blocks load');
  ok(pre.conflicting.join() === '2026-10-12,2026-10-19,2026-10-26' && pre.byDate['2026-10-19'].conflicts.length === 1 && pre.byDate['2026-10-12'].blocks.length === 1 && pre.byDate['2026-10-26'].conflicts.length === 0 && pre.byDate['2026-10-26'].blocks.length === 1, 'precheck: Mondays hit the weekly block, the 19th also hits the provider conflict');
  ({ w, calls } = win([{ id: 1, date: '2026-10-19', time: '10:15', duration: 30, provider_id: 'PR', status: 'confirmed' }], []));
  S = load(SRC, w);
  pre = await S.precheck({ time: '10:00', duration: 30, provider_id: null, operatory_id: null }, ['2026-10-19'], 'DOC');
  ok(!calls.tables.includes('appointments') && calls.tables.includes('schedule_blocks') && pre.conflicting.length === 0, 'precheck: no resource → no appointments query, blocks still checked');
  ok((await S.precheck({ time: '10:00' }, [], 'DOC')).conflicting.length === 0, 'precheck: empty dates → nothing');
  // cancelRest shape
  const cc = { ops: [] };
  const w2 = { sb: { from(t) { const o = { update(p) { cc.ops.push(['update', p]); return o; }, eq(k, v) { cc.ops.push(['eq', k, v]); return o; }, gt(k, v) { cc.ops.push(['gt', k, v]); return o; }, not(k, op, v) { cc.ops.push(['not', k, op, v]); return o; }, select() { return o; }, then(r) { return Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }).then(r); } }; return o; } } };
  const r = await load(SRC, w2).cancelRest('DOC', 'S', 3);
  ok(r.count === 2 && JSON.stringify(cc.ops) === JSON.stringify([['update', { status: 'cancelled' }], ['eq', 'doctor_id', 'DOC'], ['eq', 'series_id', 'S'], ['gt', 'series_index', 3], ['not', 'status', 'in', '(completed,cancelled,no_show,broken)']]), 'cancelRest: doctor + series + after index + unfinished only, status→cancelled');

  /* (٥) الربط */
  const AH = read('appointments.html'), AM = read('appt-modal.js'), AV = read('appt-views.js');
  ok(/id="fRepeatGroup"/.test(AH) && /<select id="fRepeat" onchange="apptRepeatHint\(\)">/.test(AH) && /id="fRepeatCount" min="2" max="24"/.test(AH) && /id="fSeriesGroup" style="display:none;"/.test(AH) && /onclick="apptCancelSeriesRest\(\)"/.test(AH), 'modal: repeat controls + series group');
  const sub = ext(AH, 'async function submitAppt');
  ok(/var _repFreq = \(!editingId && !isPlannedNow && window\.SyDentSeries\)/.test(sub) && /apptData\.series_id = window\.SyDentSeries\.newId\(\); apptData\.series_index = 1; apptData\.series_total = _repDates\.length \+ 1;/.test(sub), 'submit: base row carries the series only when new + scheduled');
  ok(sub.indexOf('apptData.series_id = window.SyDentSeries.newId()') < sub.indexOf('window.SyDentConflict.confirm('), 'submit: series stamped before the conflict guard (guard sees the real row)');
  const iS = sub.indexOf('await apptCreateSeriesSiblings(ins.data, _repDates)'), iB = sub.indexOf('bookingMarkConfirmed(_newApptId, ins.data)'), iC = sub.indexOf('closeModal();', iS);
  ok(iS > 0 && iS < iB && iB < iC && /if \(_newApptId && _repDates\.length && ins\.data && ins\.data\.series_id\)/.test(sub), 'submit: siblings created after a successful insert, before booking-link and closeModal');
  const cs = ext(AH, 'async function apptCreateSeriesSiblings');
  ok(/S\.precheck\(saved, dates, currentUser\.id\)/.test(cs) && /confirmText: 'حجز غير المتعارضة'/.test(cs) && /confirmText: 'الحجز رغم التعارض'/.test(cs) && /S\.siblingRows\(saved, use, saved\.series_id, saved\.series_total\)/.test(cs) && /\.insert\(rows\)/.test(cs), 'siblings: precheck → skip/force/first-only → one batch insert');
  ok(/if \(!use\.length\) \{ showToast\('حُفظ الموعد الأول وحده'\); return; \}/.test(cs) && !/window\.confirm\(/.test(cs), 'siblings: empty selection keeps the base only; no native dialogs');
  ok(/apptRepeatReset\(true, null\);/.test(ext(AH, 'async function openModal')) && /apptRepeatReset\(false, a\);/.test(ext(AH, 'async function editAppt')), 'modal: reset on open, hidden on edit');
  ok(/repGrp\.style\.display = planned \? 'none' : ''/.test(ext(AH, 'function onPlannedToggle')), 'modal: planned toggle hides recurrence');
  ok(/onchange="apptRepeatHint\(\)"/.test(AH.split('id="fDate"')[1] ? AH : '') && /<input type="date" id="fDate" onchange="apptRepeatHint\(\)">/.test(AH), 'modal: hint follows the date');
  ok(/function apptRepeatReset\(isNew, a\)/.test(AM) && /function getApptSeriesBadge\(e\)/.test(AM) && /async function apptCancelSeriesRest\(\)/.test(AM) && /window\.SyDentSub\.blockReadOnly\(\)\) return;/.test(ext(AM, 'async function apptCancelSeriesRest')), 'helpers present, cancel guarded for read-only mode');
  ok((AV.match(/getApptSeriesBadge\(e\)/g) || []).length === 5, 'views: badge on all five name sites');
  const tags = ['appt-conflict.js', 'sched-blocks.js', 'appt-blocks.js', 'appt-series.js', 'appt-modal.js'].map(n => AH.indexOf('<script src="' + n + '?v='));
  ok(tags.every(i => i > 0) && tags[0] < tags[1] && tags[1] < tags[2] && tags[2] < tags[3] && tags[3] < tags[4], 'script order: conflict → blocks → blocks-ui → series → modal');
  ok((read('scripts/cache-bust.sh').match(/appt-series/g) || []).length === 3, 'cache-bust.sh allow-listed');
  const M = read('migrations/157_appointment_series.sql');
  ok(/ADD COLUMN IF NOT EXISTS series_id\s+uuid/.test(M) && /series_index smallint/.test(M) && /series_total smallint/.test(M) && /idx_appointments_series/.test(M), 'M157: three columns + partial index');
  ok(/if \(window\.SyDentSeries\) return;/.test(SRC) && /SYDENT_SERIES_END/.test(SRC) && !/innerHTML|window\.confirm|\balert\(/.test(SRC), 'module: idempotent, no DOM, no native dialogs');

  if (process.argv.includes('--self-test')) {
    const muts = [
      ['Math.min(d, last)', 'd', 'no month-end clamp'],
      ["status: 'scheduled',", "status: saved.status,", 'siblings inherit confirmed'],
      ['for (var k = 1; k < count; k++)', 'for (var k = 0; k < count; k++)', 'base date duplicated'],
      ['count < MIN_COUNT || count > MAX_COUNT', 'count < MIN_COUNT', 'no upper bound'],
      ['series_index: i + 2', 'series_index: i + 1', 'index off by one']
    ];
    let red = 0;
    for (const [a, b, n] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + n); continue; }
      const f0 = fail, p0 = pass, lg = console.log; console.log = () => {};
      suite(load(SRC.replace(a, b)));
      console.log = lg;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', n);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت المواعيد المتكرّرة: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
