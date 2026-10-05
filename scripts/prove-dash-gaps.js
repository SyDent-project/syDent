/* v519 — مثبتُ الفجوات القابلة للتعبئة (dash-gaps.js) — مستقل، على الملفات الحيّة مع SyDentBlocks وSyDentApptDead الحقيقيين.
   (١) الساعات: غيابُها ⇒ noHours · الخانة (30 افتراضاً) · أيامُ العمل ويومُ العمل القادم (الجمعة مغلقة);
   (٢) الفجوات: المواعيدُ الحيّة بمدتها (30 افتراضاً) · الملغى/الغائب/المخطّطُ بلا تاريخ لا يشغل · التداخل · الحدّ الأدنى = الخانة ·
       اليوم من الآن مقرَّباً على الشبكة · الأوقاتُ المحجوزة العامة/الطبيب (ومنها «المحجوز لنوع») تشغل وحجزُ الكرسي لا;
   (٣) المرشّحون: asap بعد النافذة فقط، أولُ فجوةٍ تتّسع لمدته · العلاجُ بلا موعد = تعريفُ الهدل (بلا موعد أو بموعدٍ مات، البدائلُ لا)
       ومن له موعدٌ قادم أو هو بقائمة الانتظار يُستثنى · الترتيب والحدّ 5;
   (٤) العرض: روابطُ ?slot= و?editAppt=&moveTo= · هروب · noHours؛ (٥) load: نطاقُ الطبيب والنافذة؛
   (٦) الربط: اللوحة (الوسوم · البطاقة · أعمدةُ الساعات) وروابطُ صفحة المواعيد (صيغةٌ صارمة · تعبئةٌ بلا حفظ) وcache-bust.
   --self-test: 7 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('dash-gaps.js'), BL = read('sched-blocks.js'), INIT = read('supabase-init.js');
const DEAD_SRC = (() => { const i = INIT.indexOf('window.SyDentApptDead = function'); const j = INIT.indexOf('\n};', i); return INIT.slice(i, j + 3); })();
function load(src, sb) {
  const win = {}; if (sb) win.sb = sb;
  /* v548: الاستعلاماتُ الجماعية تمرّ بـSyDentFetchAll (مثبتُه prove-fetchall)؛ هنا ممرٌّ مباشر لأن محاكيَ الاستعلام بلا range */
  win.SyDentFetchAll = win.SyDentFetchAll || (b => Promise.resolve(b()));
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, encodeURIComponent, JSON };
  vm.createContext(ctx); vm.runInContext(BL, ctx); vm.runInContext(DEAD_SRC, ctx); vm.runInContext(src, ctx); return win;
}
const TODAY = '2026-09-28';   // الاثنين
const CS = { booking_work_start: '09:00:00', booking_work_end: '17:00:00', booking_work_days: '0,1,2,3,4,6', booking_slot_minutes: 30 };
const A = (id, date, time, extra) => Object.assign({ id, date, time, duration: 30, status: 'confirmed', is_planned: false }, extra || {});

function suite(src) {
  const W = load(src), G = W.SyDentGaps, B = W.SyDentBlocks;
  /* (١) */
  ok(G.hoursOf(null) === null && G.hoursOf({ booking_work_start: '10:00' }) === null && G.hoursOf({ booking_work_start: '18:00', booking_work_end: '09:00' }) === null, 'hours: missing/inverted → null');
  ok(G.hoursOf(Object.assign({}, CS, { booking_slot_minutes: null })).slot === 30 && G.hoursOf(Object.assign({}, CS, { booking_slot_minutes: 15 })).slot === 15, 'hours: slot default 30, setting respected');
  const h = G.hoursOf(CS);
  ok(G.nextWorkDay(h, '2026-10-01').day === '2026-10-03' && G.nextWorkDay(h, TODAY).day === '2026-09-29' && G.nextWorkDay(h, TODAY).k === 1, 'hours: Thursday → Saturday (Friday closed); Monday → Tuesday');
  ok(G.compute({ today: TODAY, cs: null }).noHours === true, 'compute: no hours → noHours');
  /* (٢) */
  let g = G.gapsForDay(h, TODAY, [A('a', TODAY, '09:00'), A('b', TODAY, '10:00', { duration: 60 }), A('c', TODAY, '10:30'), A('d', TODAY, '13:00', { status: 'cancelled' }), A('e', TODAY, '14:00', { is_planned: true }), A('f', TODAY, '15:00', { duration: null })], [], NaN);
  ok(JSON.stringify(g.map(x => [x.startMin, x.endMin])) === JSON.stringify([[570, 600], [660, 900], [930, 1020]]), 'gaps: live appointments with duration (default 30), overlap merged, cancelled + date-less planned ignored');
  g = G.gapsForDay(h, TODAY, [A('a', TODAY, '09:00', { duration: 45 }), A('b', TODAY, '10:00')], [], NaN);
  ok(g[0].startMin === 585 && g[0].len === 15 ? false : !g.some(x => x.startMin === 585), 'gaps: a 15-min hole (shorter than the slot) is not a gap');
  g = G.gapsForDay(h, TODAY, [], [], 11 * 60 + 7);
  ok(g.length === 1 && g[0].startMin === 690 && g[0].endMin === 1020, 'gaps: today starts from now rounded up to the slot grid (11:07 → 11:30)');
  ok(G.gapsForDay(h, TODAY, [], [], 16 * 60 + 45).length === 0 && G.gapsForDay(h, '2026-10-02', [], [], NaN).length === 0, 'gaps: after hours → none; closed day → none');
  const inst = B.expand([{ id: 'x', kind: 'break', date_from: TODAY, date_to: TODAY, start_time: '12:00', end_time: '13:00', blocks_scheduling: true },
                         { id: 'y', kind: 'reserved', date_from: TODAY, date_to: TODAY, start_time: '15:00', end_time: '16:00', blocks_scheduling: false },
                         { id: 'z', kind: 'other', date_from: TODAY, date_to: TODAY, start_time: '09:00', end_time: '11:00', operatory_id: 'op2', blocks_scheduling: true }], TODAY, TODAY);
  g = G.gapsForDay(h, TODAY, [], inst, NaN);
  ok(JSON.stringify(g.map(x => [x.startMin, x.endMin])) === JSON.stringify([[540, 720], [780, 900], [960, 1020]]), 'gaps: clinic break and reserved-for-type occupy; a single chair\'s block does not');
  /* (٣) */
  const asap = [A('q1', '2026-10-10', '10:00', { patient_id: 'p1', patient_name: 'سامي', asap: true, duration: 60 }),
                A('q2', '2026-10-05', '09:00', { patient_id: 'p2', patient_name: 'رنا', asap: true }),
                A('q3', '2026-09-29', '09:00', { patient_id: 'p3', patient_name: 'داخل النافذة', asap: true }),
                A('q4', '2026-10-06', '09:00', { patient_id: 'p4', patient_name: 'ملغى', asap: true, status: 'cancelled' }),
                A('q5', '2026-10-07', '09:00', { patient_id: 'p5', patient_name: 'غير asap', asap: false })];
  const dayAppts = [A('a', TODAY, '09:00', { duration: 420 }), A('b', TODAY, '16:30'), A('c', '2026-09-29', '09:00', { duration: 60 })];
  let r = G.compute({ today: TODAY, nowMin: 8 * 60, cs: CS, appts: dayAppts, asap, patients: [] });
  ok(r.days.length === 2 && r.days[0].isToday && r.days[1].day === '2026-09-29' && /^غداً — الثلاثاء 29\/9$/.test(r.days[1].label), 'compute: today + next work day labelled');
  ok(JSON.stringify(r.days[0].gaps.map(x => [x.startMin, x.endMin])) === JSON.stringify([[960, 990]]), 'compute: today gap 16:00–16:30 only');
  ok(r.asap.map(x => x.id).join() === 'q2,q1' && r.asapTotal === 2, 'asap: live + after the window only, sorted by date (cancelled, in-window, non-asap excluded)');
  ok(r.asap[0].fit.day === TODAY && r.asap[0].fit.startMin === 960 && r.asap[1].fit.day === '2026-09-29' && r.asap[1].fit.startMin === 600, 'asap: first gap fitting each duration (30 → today 16:00; 60 → tomorrow 10:00)');
  const planned = [{ patient_id: 'u1', status: 'planned' }, { patient_id: 'u1', status: 'planned' }, { patient_id: 'u2', status: 'planned', appointment_id: 'dead1' },
                   { patient_id: 'u3', status: 'planned', appointment_id: 'live1' }, { patient_id: 'u4', status: 'planned', plan_option: 2 }, { patient_id: 'u5', status: 'planned' },
                   { patient_id: 'p2', status: 'planned' }, { patient_id: 'u6', status: 'planned' }];
  const linked = { dead1: A('dead1', '2026-09-01', '09:00', { status: 'no_show' }), live1: A('live1', '2026-10-20', '09:00') };
  r = G.compute({ today: TODAY, nowMin: 8 * 60, cs: CS, appts: dayAppts, asap, planned, linkedAppts: linked, upcoming: { u5: true },
                  patients: [{ id: 'u1', name: 'أ' }, { id: 'u2', name: 'ب' }, { id: 'u3', name: 'ج' }, { id: 'u4', name: 'د' }, { id: 'u5', name: 'هـ' }, { id: 'p2', name: 'رنا' }] });
  ok(r.unscheduled.map(x => x.patient_id).join() === 'u1,u2' && r.unscheduled[0].items === 2, 'unscheduled: free (no appt / dead appt) adopted items; live-linked, alternatives, upcoming-appointment, waitlisted and unknown patients excluded; most items first');
  ok(r.unscheduled[0].fit && r.unscheduled[0].fit.startMin === 960, 'unscheduled: first slot-length gap');
  const many = []; for (let i = 0; i < 9; i++) many.push(A('m' + i, '2026-10-1' + i % 9, '09:00', { patient_id: 'mp' + i, patient_name: 'م' + i, asap: true }));
  r = G.compute({ today: TODAY, cs: CS, appts: [], asap: many });
  ok(r.asap.length === 5 && r.asapTotal === 9, 'limits: at most 5 shown, total kept');
  /* (٤) */
  r = G.compute({ today: TODAY, nowMin: 8 * 60, cs: CS, appts: dayAppts, asap: [A('q9', '2026-10-05', '09:00', { patient_id: 'p9', patient_name: '<b>x</b>', asap: true })], planned: [{ patient_id: 'u1', status: 'planned' }], patients: [{ id: 'u1', name: 'أحمد' }] });
  let html = G.render(r, { owner: true });
  ok(/href="appointments\.html\?slot=2026-09-28T16%3A00"/.test(html) && /⏱ /.test(html) && /tone-cyan/.test(html), 'render: gap chips link to a new appointment at that time');
  ok(/href="appointments\.html\?editAppt=q9&amp;moveTo=2026-09-28T16%3A00"/.test(html) && /قدّمه لـاليوم/.test(html), 'render: waitlist → move link with the new time');
  ok(/href="appointments\.html\?slot=2026-09-28T16%3A00&amp;pid=u1"/.test(html) && /احجز اليوم/.test(html), 'render: unscheduled → new appointment with time + patient');
  ok(/&lt;b&gt;x&lt;\/b&gt;/.test(html) && !/<b>x<\/b>/.test(html), 'render: names escaped');
  ok(/لا فجوات|اليوم ممتلئ/.test(G.render(G.compute({ today: TODAY, nowMin: 8 * 60, cs: CS, appts: [A('a', TODAY, '09:00', { duration: 480 })] }), {})), 'render: full day message');
  ok(/حدّد ساعات العمل/.test(G.render({ noHours: true }, { owner: true })) && /href="settings\.html"/.test(G.render({ noHours: true }, { owner: true })) && !/href=/.test(G.render({ noHours: true }, {})), 'render: no hours → hint, settings link for owner only');
  ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')) && /if \(window\.SyDentGaps\) return;/.test(src) && !/\.update\(|\.insert\(|\.delete\(|\.upsert\(|innerHTML/.test(src), 'module: idempotent, read-only, tones only');
}
suite(SRC);

(async () => {
  /* (٥) */
  const calls = [];
  const sb = { from(t) { const rec = { table: t, eq: [], in: [], gte: [], lte: [], gt: [] }; calls.push(rec); const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, in(k, v) { rec.in.push([k, v]); return o; }, gte(k, v) { rec.gte.push([k, v]); return o; }, lte(k, v) { rec.lte.push([k, v]); return o; }, gt(k, v) { rec.gt.push([k, v]); return o; }, or() { return o; }, order() { return o; },
    then(res) { let d = []; if (t === 'ledger_sessions') d = [{ patient_id: 'u1', appointment_id: 'L1', status: 'planned' }]; if (t === 'appointments' && rec.in.length && rec.in[0][0] === 'id') d = [A('L1', '2026-09-01', '09:00', { status: 'cancelled' })]; return Promise.resolve({ data: d, error: null }).then(res); } }; return o; } };
  const W = load(SRC, sb);
  const r = await W.SyDentGaps.load(sb, 'DOC', { today: TODAY, nowMin: 8 * 60, cs: CS, patients: [{ id: 'u1', name: 'أحمد' }] });
  const win = calls.find(c => c.table === 'appointments' && c.gte.length && c.lte.length), aq = calls.find(c => c.table === 'appointments' && c.eq.some(x => x[0] === 'asap'));
  ok(win && win.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && win.gte[0][1] === TODAY && win.lte[0][1] === '2026-09-29', 'load: occupancy window = today → next work day, doctor-scoped');
  ok(aq && aq.gt[0][0] === 'date' && aq.gt[0][1] === '2026-09-29' && /patient_name/.test(aq.select), 'load: waitlist after the window');
  ok(calls.some(c => c.table === 'schedule_blocks'), 'load: schedule blocks read through SyDentBlocks');
  ok(calls.some(c => c.table === 'appointments' && c.in.length && c.in[0][0] === 'patient_id' && c.gte[0][1] === TODAY), 'load: upcoming appointments of candidates checked');
  ok(r.unscheduled.length === 1 && r.unscheduled[0].patient_id === 'u1', 'load: dead-linked item (cancelled appointment) counts as unscheduled');
  /* مراجعةُ الإغلاق: مقاطعُ 150 + خطأُ «القادمة» لا يقترح أحداً */
  const calls2 = [], many = []; for (let i = 0; i < 320; i++) many.push({ patient_id: 'x' + i, status: 'planned' });
  const mkSb = (errUp) => ({ from(t) { const rec = { table: t, eq: [], in: [], gte: [], lte: [], gt: [] }; calls2.push(rec); const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, in(k, v) { rec.in.push([k, v]); return o; }, gte(k, v) { rec.gte.push([k, v]); return o; }, lte(k, v) { rec.lte.push([k, v]); return o; }, gt(k, v) { rec.gt.push([k, v]); return o; }, or() { return o; }, order() { return o; },
    then(res) { const isUp = t === 'appointments' && rec.in.length && rec.in[0][0] === 'patient_id'; return Promise.resolve(isUp && errUp ? { data: null, error: { message: 'boom' } } : { data: t === 'ledger_sessions' ? many : [], error: null }).then(res); } }; return o; } });
  const pts = many.map(m => ({ id: m.patient_id, name: 'n' + m.patient_id }));
  let sbC = mkSb(false), Wc = load(SRC, sbC);
  const rc = await Wc.SyDentGaps.load(sbC, 'DOC', { today: TODAY, nowMin: 8 * 60, cs: CS, patients: pts });
  const upQs = calls2.filter(c => c.table === 'appointments' && c.in.length && c.in[0][0] === 'patient_id');
  ok(upQs.length === 3 && upQs.every(q => q.in[0][1].length <= 150) && upQs.reduce((n, q) => n + q.in[0][1].length, 0) === 320, 'load: candidate lookups chunked by 150 (320 → 3 requests)');
  ok(rc.unscheduledTotal === 320, 'load: all chunks merged');
  calls2.length = 0; sbC = mkSb(true); Wc = load(SRC, sbC);
  const re = await Wc.SyDentGaps.load(sbC, 'DOC', { today: TODAY, nowMin: 8 * 60, cs: CS, patients: pts });
  ok(re.unscheduledTotal === 0 && re.unscheduled.length === 0, 'load: failed upcoming lookup → no unscheduled suggestions (never suggest someone who may already be booked)');
  const c0 = calls.length; await W.SyDentGaps.load(sb, 'DOC', { today: TODAY, cs: null });
  ok(calls.length === c0, 'load: no hours → no queries');
  /* (٦) */
  const IX = read('index.html'), AP = read('appointments.html'), CB = read('scripts/cache-bust.sh');
  ok((IX.match(/dash-gaps\.js\?v=/g) || []).length === 1 && IX.indexOf('<script src="sched-blocks.js?v=') > 0 && IX.indexOf('<script src="sched-blocks.js?v=') < IX.indexOf('<script src="dash-gaps.js?v='), 'dashboard: sched-blocks.js before dash-gaps.js, single tags');
  ok(/id="gpCard"/.test(IX) && IX.indexOf('id="waitingRoomCard"') > IX.indexOf('id="todayApptsCard"') && IX.indexOf('id="gpCard"') > IX.indexOf('id="waitingRoomCard"'), 'dashboard (v528): waiting room right under today\'s appointments, gaps card below it');
  ok(/booking_work_start, booking_work_end, booking_slot_minutes/.test(IX) && /window\.SyDentGaps\.load\(window\.sb, uid, \{ today: today, nowMin: _nowD\.getHours\(\) \* 60 \+ _nowD\.getMinutes\(\), cs: _dashCfgWa, patients: list \}\)/.test(IX), 'dashboard: hours read in the settings query; load gets now + settings + patients');
  ok(/function apptParseSlotParam\(v\) \{\n  var m = \/\^\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)T\(\\d\{2\}\):\(\\d\{2\}\)\$\/\.exec/.test(AP) && /if \(!m \|\| \+m\[2\] > 23 \|\| \+m\[3\] > 59\) return null;/.test(AP), 'appointments: ?slot=/?moveTo= parsed strictly');
  ok(/await openModal\(_slotQ\.date\);\s+apptPrefillTime\(_slotQ\.time\);/.test(AP) && /onFPatientInput\(\)/.test(AP.slice(AP.indexOf('_slotQ.date'), AP.indexOf('_slotQ.date') + 500)), 'appointments: slot link opens a new appointment with time and (optional) patient');
  ok(/await editAppt\(editApptId\);\s+if \(_moveQ\)/.test(AP) && /راجع واضغط حفظ/.test(AP) && !/submitAppt\(/.test(AP.slice(AP.indexOf('if (_moveQ)'), AP.indexOf('if (_moveQ)') + 600)), 'appointments: move link pre-fills date/time and never saves by itself');
  ok(/url2\.searchParams\.delete\('moveTo'\)/.test(AP) && /\['slot', 'pid', 'newWithTemplate'\]/.test(AP), 'appointments: deep-link params cleaned from the URL');
  ok((CB.match(/dash-gaps/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');
  ok(['_ydBody', '_glBody', '_gpBody'].every(v => new RegExp("\\(async function \\(\\) \\{\\n  try \\{\\n    var " + v).test(IX)) && !/await \(async function \(\) \{\n  try \{\n    var _(yd|gl|gp)Body/.test(IX), 'dashboard: yesterday/goal/gaps cards load in parallel, never awaited before today\'s appointments render');

  if (process.argv.includes('--self-test')) {
    const muts = [
      ["if (!a || String(a.date).slice(0, 10) !== day || DEAD[a.status] || a.is_planned === true) return;", "if (!a || String(a.date).slice(0, 10) !== day || a.is_planned === true) return;", 'cancelled appointments occupy'],
      ["if (!i || i.date !== day || i.operatory_id) return;", "if (!i || i.date !== day) return;", 'chair-only block occupies the clinic'],
      ["if (e - cur >= h.slot)", "if (e - cur > 0)", 'holes shorter than a slot reported'],
      ["start = h.startMin + Math.ceil((fromMin - h.startMin) / h.slot) * h.slot;", "start = fromMin;", 'today not snapped to the slot grid'],
      ["var d = String(a.date || '').slice(0, 10); if (!d || d <= lastDay) return;", "var d = String(a.date || '').slice(0, 10); if (!d) return;", 'in-window waitlist offered'],
      ["return !up[pid] && !asapPids[pid] && names[pid];", "return !asapPids[pid] && names[pid];", 'patients with an upcoming appointment offered'],
      ["if (s.plan_option >= 1 && s.plan_option <= 3) return;", "", 'unadopted alternatives counted']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { suite(SRC.replace(a, b)); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت الفجوات: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
