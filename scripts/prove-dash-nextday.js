/* v520 — مثبتُ تبديل «اليوم / يوم العمل القادم» ببطاقة مواعيد اللوحة (index.html الحيّ).
   (١) يومُ العمل القادم من booking_work_days (الجمعة مغلقة ⇒ السبت باسمه) · بلا إعداد ⇒ غداً؛
   (٢) التأكيد (confirmed_at أو confirmation_status أو الحالة) · رقاقةُ الحالة · الملخّص (العدد · غير المؤكد · بلا تذكير حين واتساب مفعَّل · الملغى لا يُعدّ)؛
   (٣) _dashLoadNext على sb مصطنع: مواعيدُ ذلك اليوم بنطاق الطبيب بلا المخطّطة بلا تاريخ · الهدلُ بيوم ذلك اليوم (عيدُ ميلاده) ومن خريطة dashFin نفسها ·
       سجلاتُ التذكير تُدمج · تحميلٌ واحد (مخبّأ)؛ (٤) العرض: بلا أزرار حضور ولا أختام بعرض الغد · الأزرارُ باقية بعرض اليوم · الحالةُ الفارغة؛
   (٥) الربط: الزرّان · الوسومُ aria · إعادةُ الضبط عند إعادة تحميل اللوحة.
   --self-test: 5 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const IX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fn(src, name) {
  let i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error(name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let j = src.indexOf('{', src.indexOf(')', i)), d = 0, inS = null;
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
const NAMES = ['_dashApptConfirmed', '_dashNextDay', '_dashConfirmChipHtml', '_dashNextSummaryHtml', '_dashLoadNext', 'dashSetApptView', 'renderTodayApptsCard'];
function build(src, sbData) {
  const st = { calls: [], huddleCtx: null };
  const el = { innerHTML: '' }, btns = {};
  const mk = id => (btns[id] = btns[id] || { id, textContent: '', cls: new Set(), attrs: {}, classList: { toggle(c, on) { on ? btns[id].cls.add(c) : btns[id].cls.delete(c); } }, setAttribute(k, v) { btns[id].attrs[k] = v; } });
  const win = {
    sb: { from(t) { const rec = { table: t, eq: [], in: [] }; st.calls.push(rec); const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, in(k, v) { rec.in.push([k, v]); return o; }, order() { return o; },
      then(res) { return Promise.resolve({ data: (sbData[t] || []), error: null }).then(res); } }; return o; } },
    SyDentHuddle: { async load(uid, ctx) { st.huddleCtx = ctx; const o = {}; ctx.appts.forEach(a => { if (a.patient_id) o[a.patient_id] = { tag: 'H-' + a.patient_id }; }); return o; }, chipsHtml(e) { return '<i>' + e.tag + '</i>'; } },
    SyDentReliability: { async load() { return {}; }, badgeHtml() { return ''; } }
  };
  const ctx = { window: win, console: { warn() {}, error() {} }, Date, String, Number, Promise, Array, Object, JSON, RegExp, Math, parseInt,
    document: { getElementById(id) { return id === 'todayAppts' ? el : mk(id); } },
    _dashUid: 'DOC', _dashCfgWa: { booking_work_days: '0,1,2,3,4,6', whatsapp_reminders_enabled: true, recall_interval_months: 6 }, _dashReminderLogs: {},
    _dashApptsToday: [{ id: 't1', patient_id: 'p1', patient_name: 'اليوم', time: '09:00', status: 'confirmed' }], _dashHuddle: {}, _dashReliab: {}, _dashFlagDefs: null,
    _dashApptView: 'today', _dashNext: null, _dashNextLoading: null, _dashPatientsList: [{ id: 'p1' }], _dashFinMap: { MARK: 1 },
    todayStr() { return '2026-10-01'; },   /* الخميس */
    renderDashStrip() { return '<s>STAMP</s>'; }, renderDashActionBtn() { return '<button>ACT</button>'; }, renderDashWaBadge() { return ''; }, _dashOperatoryChipHtml() { return ''; },
    fmtTime12(t) { return String(t); }, _dashEscapeHtml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); } };
  vm.createContext(ctx);
  vm.runInContext(NAMES.map(n => fn(src, n)).join('\n'), ctx);
  return { ctx, st, el, btns };
}
const NEXT = [{ id: 'n1', patient_id: 'q1', patient_name: 'أ', time: '09:00', status: 'pending', date: '2026-10-03' },
              { id: 'n2', patient_id: 'q2', patient_name: '<b>ب</b>', time: '10:00', status: 'scheduled', confirmed_at: 'x', date: '2026-10-03' },
              { id: 'n3', patient_id: 'q3', patient_name: 'ج', time: '11:00', status: 'cancelled', date: '2026-10-03' },
              { id: 'n4', patient_id: 'q4', patient_name: 'د', time: '12:00', status: 'pending', is_planned: true, date: '2026-10-03' }];
async function suite(src) {
  const { ctx, st, el, btns } = build(src, { appointments: NEXT, reminder_logs: [{ appointment_id: 'n2', sent_at: 's' }] });
  /* (١) */
  const nd = ctx._dashNextDay('2026-10-01', '0,1,2,3,4,6');
  ok(nd.day === '2026-10-03' && nd.k === 2 && nd.btn === 'السبت' && /^يوم السبت 3\/10$/.test(nd.label), 'next day: Thursday with Friday closed → Saturday, named');
  ok(ctx._dashNextDay('2026-09-28', '').day === '2026-09-29' && ctx._dashNextDay('2026-09-28', '').btn === 'غداً', 'next day: no setting → tomorrow');
  /* (٢) */
  ok(ctx._dashApptConfirmed({ confirmed_at: 'x' }) && ctx._dashApptConfirmed({ confirmation_status: 'confirmed' }) && ctx._dashApptConfirmed({ status: 'confirmed' }) && !ctx._dashApptConfirmed({ status: 'pending' }), 'confirmed: stamp, confirmation_status or status');
  ok(/tone-orange[^>]*>☎️ غير مؤكد/.test(ctx._dashConfirmChipHtml({ status: 'pending' })) && /tone-green[^>]*>✅ مؤكد/.test(ctx._dashConfirmChipHtml({ confirmed_at: 'x' })) && ctx._dashConfirmChipHtml({ status: 'cancelled' }) === '', 'confirm chip: pending orange, confirmed green, cancelled none');
  /* (٣) + (٤) */
  await ctx.dashSetApptView('next');
  const aq = st.calls.find(c => c.table === 'appointments');
  ok(aq && aq.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && aq.eq.some(x => x[0] === 'date' && x[1] === '2026-10-03'), 'load: next work day appointments, doctor-scoped');
  ok(ctx._dashNext.appts.map(a => a.id).join() === 'n1,n2,n3', 'load: date-less planned rows dropped');
  ok(st.huddleCtx && st.huddleCtx.today === '2026-10-03' && st.huddleCtx.fin && st.huddleCtx.fin.MARK === 1 && st.huddleCtx.recallMonths === 6, 'load: huddle computed for that day (birthday/dead-check) from the same dashFin map');
  ok(ctx._dashReminderLogs.n2 && st.calls.some(c => c.table === 'reminder_logs' && c.in[0][1].join() === 'n1,n2,n3'), 'load: reminder logs for those appointments merged');
  const html = el.innerHTML;
  ok(/📅 يوم السبت 3\/10 · \u20662\u2069 موعد/.test(html) && /☎️ \u20661\u2069 غير مؤكد/.test(html) && /📨 \u20661\u2069 بلا تذكير/.test(html), 'summary: 2 live appointments (cancelled excluded), 1 unconfirmed, 1 without reminder');
  ok(!/ACT|STAMP/.test(html) && /☎️ غير مؤكد/.test(html) && /✅ مؤكد/.test(html) && /<i>H-q1<\/i>/.test(html) && /&lt;b&gt;ب&lt;\/b&gt;/.test(html), 'render next: no arrival buttons/stamps, confirmation chips, huddle chips, escaped names');
  ok(btns.dashViewNext.cls.has('on') && !btns.dashViewToday.cls.has('on') && btns.dashViewNext.attrs['aria-selected'] === 'true' && btns.todayApptsTitle.textContent === 'المواعيد القادمة', 'toggle: buttons and title follow the view');
  const n0 = st.calls.length; await ctx.dashSetApptView('today'); await ctx.dashSetApptView('next');
  ok(st.calls.length === n0, 'load: cached — toggling back does not refetch');
  await ctx.dashSetApptView('today');
  ok(/ACT/.test(el.innerHTML) && /STAMP/.test(el.innerHTML) && !/dash-next-sum/.test(el.innerHTML) && btns.todayApptsTitle.textContent === 'مواعيد اليوم', 'render today: arrival buttons and stamps back, no summary');
  /* مراجعةُ الإغلاق: إعادةُ تحميل اللوحة تصفّر الغد بينما العرضُ «غداً» ⇒ الرسمُ يطلق التحميل ذاتياً */
  ctx._dashApptView = 'next'; ctx._dashNext = null; const nCalls = st.calls.length;
  ctx.renderTodayApptsCard();
  await new Promise(r => setTimeout(r, 30));
  ok(st.calls.length > nCalls && ctx._dashNext && /dash-next-sum/.test(el.innerHTML), 'self-heal: render in next view with nothing loaded fetches and repaints (no stuck skeleton)');
  ctx._dashApptView = 'today';
  const e2 = build(src, { appointments: [] }); await e2.ctx.dashSetApptView('next');
  ok(/لا مواعيد يوم السبت 3\/10/.test(e2.el.innerHTML), 'render next: empty state names the day');
}
(async () => {
  await suite(IX);
  /* (٥) */
  ok(/onclick="dashSetApptView\('today'\)">اليوم<span id="dayName" hidden>—<\/span><\/button>/.test(IX) && /id="dashViewNext" role="tab" aria-selected="false" onclick="dashSetApptView\('next'\)"/.test(IX), 'wiring: two tab buttons, dayName kept hidden for legacy writers');
  ok(/_dashPatientsList = list; _dashFinMap = dashFin\.ok \? dashFin\.map : null; _dashNext = null;/.test(IX), 'wiring: dashboard reload resets the cached next-day view');
  if (process.argv.includes('--self-test')) {
    const muts = [
      ["return !!(a && (a.confirmed_at || a.confirmation_status === 'confirmed' || a.status === 'confirmed'));", "return !!(a && a.status === 'confirmed');", 'confirmed_at ignored'],
      ["res.appts = (r.data || []).filter(function (a) { return a.is_planned !== true; });", "res.appts = r.data || [];", 'date-less planned shown'],
      ["var stamps = isNext ? '' : renderDashStrip(a);", "var stamps = renderDashStrip(a);", 'stamps on the next-day view'],
      ["res.huddle = await window.SyDentHuddle.load(uid, { today: nd.day,", "res.huddle = await window.SyDentHuddle.load(uid, { today: today,", 'huddle computed for today'],
      ["try { _dashNext = await _dashNextLoading; }", "try { await _dashNextLoading; }", 'loaded day never kept'],
      ["    if (!_dashNextLoading) _dashLoadNext().then(function () { if (_dashApptView === 'next' && _dashNext) renderTodayApptsCard(); }, function () {});   /* _dashNext شرطٌ: لا حلقة */\n", "", 'stuck skeleton after reload']
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
  console.log((fail ? '❌' : '✅') + ' مثبت عرض الغد: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
