/* v514 — مثبتُ أعلام الهدل الصباحي (huddle-flags.js) — مستقل، على الملفات الحيّة.
   (١) دلالةُ compute من التعريف (رصيدٌ بكل عملة على EPS · المخطّطُ الحرّ: بلا موعد/بموعدٍ مات بـSyDentApptDead الحقيقية ·
       البدائلُ غيرُ المعتمدة لا تُعدّ · التحذيرُ الطبي والحساسية · أعلامُ المريض · جديد · عيدُ ميلاد · الأسرة · مرضى اليوم فقط)؛
   (٢) الرقائق (هروبٌ · أرقامٌ معزولة LTR · وصلاتٌ لبطاقة المريض · نغماتُ theme.css فقط · '' عند لا شيء)؛
   (٣) load: استعلامان محصوران بالطبيب والحالة والمرضى (مع أفراد الأسرة)، وفشلُهما يُسقط المخطّطَ وحده؛
   (٤) الربط باللوحة (تحميلٌ بعد الالتزام · صفُّ hud-row بمواعيد اليوم) وقائمةُ سماح cache-bust ومرآةُ التحذيرات ×4.
   --self-test: 7 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('huddle-flags.js');
const INIT = read('supabase-init.js');
const DEAD_SRC = (() => { const i = INIT.indexOf('window.SyDentApptDead = function'); const j = INIT.indexOf('\n};', i); return INIT.slice(i, j + 3); })();
const FLAGS_SRC = (() => { const i = INIT.indexOf('/* ═══════════════ SyDentFlags'); const j = INIT.indexOf('/* ═══════════════ SyDentApptDead'); return INIT.slice(i, j); })();

function load(src, sb, opts) {
  const win = {}; if (sb) win.sb = sb;
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, encodeURIComponent };
  vm.createContext(ctx);
  if (!(opts && opts.noDead)) vm.runInContext(DEAD_SRC, ctx);
  if (opts && opts.flags) vm.runInContext(FLAGS_SRC, ctx);
  vm.runInContext(src, ctx); return win;
}
const TODAY = '2026-09-28';
const bag = (syp, usd, sess) => ({ sessCount: sess || 0, bags: { SYP: { trueBalance: syp || 0 }, USD: { trueBalance: usd || 0 } } });
const P = (id, extra) => Object.assign({ id, name: 'م-' + id }, extra || {});
const A = (pid, extra) => Object.assign({ id: 'a-' + pid, patient_id: pid, date: TODAY, status: 'confirmed' }, extra || {});
const S = (pid, extra) => Object.assign({ id: 's' + Math.random(), patient_id: pid, status: 'planned', appointment_id: null, plan_option: null }, extra || {});

function suite(H) {
  const c = o => H.compute(Object.assign({ today: TODAY }, o));
  /* الرصيد */
  let r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(1000) } });
  ok(r.p.balance.length === 1 && r.p.balance[0].cur === 'SYP' && r.p.balance[0].amount === 1000, 'balance: SYP due read from fin as-is');
  r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(0.5, 0.51) } });
  ok(r.p.balance.length === 1 && r.p.balance[0].cur === 'USD', 'balance: EPS boundary — 0.5 excluded, 0.51 included, per currency (no cross-sum)');
  r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(-200, 0) } });
  ok(r.p.balance.length === 0, 'balance: credit (negative) is not a due flag');
  r = c({ appts: [A('p')], patients: [P('p')], fin: null });
  ok(r.p.balance.length === 0 && r.p.isNew === false, 'balance: no fin → no balance flag and no "new" claim');
  /* المخطّط غير المجدول */
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p'), S('p')] });
  ok(r.p.planned === 2 && r.p.altOnly === false, 'planned: two free adopted items → 2');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { appointment_id: 'a-p' })], apptsById: { 'a-p': A('p') } });
  ok(r.p.planned === 0, 'planned: item linked to today\'s live appointment is not unscheduled');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { appointment_id: 'x' })], apptsById: { x: A('p', { id: 'x', date: '2026-09-01', status: 'cancelled' }) } });
  ok(r.p.planned === 1, 'planned: item linked to a cancelled appointment is free (SyDentApptDead)');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { appointment_id: 'x' })], apptsById: { x: A('p', { id: 'x', date: '2026-09-01', status: 'confirmed', arrived_at: '2026-09-01T09:00:00Z' }) } });
  ok(r.p.planned === 1, 'planned: past appointment with arrival stamp is dead → free');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { appointment_id: 'x' })], apptsById: { x: A('p', { id: 'x', date: '2026-10-05', status: 'pending' }) } });
  ok(r.p.planned === 0, 'planned: item linked to an upcoming appointment is scheduled');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { appointment_id: 'ghost' })], apptsById: {} });
  ok(r.p.planned === 0, 'planned: unknown appointment id → treated as live (no false alarm)');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { plan_option: 2 }), S('p', { plan_option: 1 })] });
  ok(r.p.planned === 0 && r.p.altOnly === true, 'planned: only unadopted alternatives → altOnly, not counted');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { plan_option: 2 }), S('p')] });
  ok(r.p.planned === 1 && r.p.altOnly === false, 'planned: adopted item beside an alternative → 1, altOnly false');
  r = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { status: 'completed' })] });
  ok(r.p.planned === 0, 'planned: non-planned status ignored');
  /* التحذير الطبي والحساسية وأعلام المريض */
  r = c({ appts: [A('p')], patients: [P('p', { medical_flags: ['diabetes', 'penicillin_allergy'], medical_flags_other: 'صرع', allergies: 'لا يوجد', flags: ['vip', 'zzz'] })] });
  ok(r.p.warn.join() === 'سكري,صرع' && r.p.allergy.join() === 'بنسلين' && r.p.flags.join() === 'vip,zzz', 'medical: warn/allergy split as on the appointments page; flags copied raw');
  /* جديد */
  r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(0, 0, 0) }, reliab: {} });
  ok(r.p.isNew === true, 'new: zero sessions and no finished appointments → new');
  r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(0, 0, 1) }, reliab: {} });
  ok(r.p.isNew === false, 'new: a session (even planned) → not new');
  r = c({ appts: [A('p')], patients: [P('p')], fin: { p: bag(0, 0, 0) }, reliab: { p: { finished: 1, level: 0 } } });
  ok(r.p.isNew === false, 'new: a finished appointment in the reliability window → not new');
  /* عيد الميلاد */
  r = c({ appts: [A('p'), A('q'), A('z')], patients: [P('p', { dob: '1990-09-28' }), P('q', { dob: '1990-09-27' }), P('z', { dob: 'nope' })] });
  ok(r.p.birthday === true && r.q.birthday === false && r.z.birthday === false, 'birthday: month-day match only; invalid dob ignored');
  /* الأسرة */
  r = c({ appts: [A('p')], patients: [P('p', { family_id: 'f' }), P('q', { family_id: 'f' }), P('w', { family_id: 'g' })],
          fin: { p: bag(0), q: bag(300), w: bag(900) }, planned: [S('q'), S('w')] });
  ok(r.p.family.length === 1 && r.p.family[0].id === 'q' && r.p.family[0].balance[0].amount === 300 && r.p.family[0].planned === 1, 'family: same family_id member with balance + free item; other family excluded');
  r = c({ appts: [A('p')], patients: [P('p', { family_id: 'f' }), P('q', { family_id: 'f' })], fin: { p: bag(500), q: bag(0) }, planned: [S('p')] });
  ok(r.p.family.length === 0, 'family: the patient himself is never listed as his own family');
  r = c({ appts: [A('p')], patients: [P('p'), P('q')], fin: { q: bag(500) } });
  ok(r.p.family.length === 0, 'family: no family_id → no family flag');
  /* مرضى اليوم فقط */
  r = c({ appts: [A('p')], patients: [P('p'), P('q')], fin: { q: bag(500) } });
  ok(!('q' in r), 'scope: only today\'s patients get an entry');
  r = c({ appts: [A('p'), A('p', { id: 'a2' })], patients: [P('p')], fin: { p: bag(500) } });
  ok(Object.keys(r).length === 1, 'scope: two appointments same patient → one entry');
  r = c({ appts: [{ id: 'x', patient_name: 'بلا معرّف' }], patients: [] });
  ok(Object.keys(r).length === 0, 'scope: appointment without patient_id ignored');
  /* 1ب: الفحصُ الدوري */
  r = c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2026-03-28' }, recallMonths: 6 });
  ok(r.p.recallDue && r.p.recallDue.lastVisit === '2026-03-28' && r.p.recallDue.months === 6, 'recall: last visit exactly at the threshold (6 months) is due');
  r = c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2026-03-29' }, recallMonths: 6 });
  ok(r.p.recallDue === null, 'recall: one day inside the window → not due');
  r = c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2026-06-30' }, recallMonths: 3 });
  ok(r.p.recallDue === null && c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2026-06-28' }, recallMonths: 3 }).p.recallDue, 'recall: clinic interval respected (3 months)');
  r = c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2020-01-01' }, recallMonths: 'x' });
  ok(r.p.recallDue && r.p.recallDue.months === 6, 'recall: bad interval → default 6');
  r = c({ appts: [A('p')], patients: [P('p')], lastVisit: {} });
  ok(r.p.recallDue === null, 'recall: no completed visit → not a recall target (new patient)');
  /* 1ب: المراقبات */
  const WT = (pid, tooth, extra) => Object.assign({ patient_id: pid, tooth_num: tooth, surface: 'WHOLE', treatment_key: 'watch', review_at: null, status: 'condition' }, extra || {});
  r = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 36, { review_at: '2026-09-28' }), WT('p', 11, { review_at: '2026-12-01' }), WT('p', 21), WT('p', 46, { status: 'completed', treatment_key: 'filling' })] });
  ok(r.p.watches.length === 3 && r.p.watches[0].tooth_num === 36 && r.p.watches[0].due === true && r.p.watches[1].tooth_num === 11 && !r.p.watches[1].due && r.p.watches[2].review_at === '', 'watches: condition rows only, due first (review_at ≤ today), then by date, no-date last');
  r = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 36, { review_at: '2026-09-29' })] });
  ok(r.p.watches.length === 1 && r.p.watches[0].due === false, 'watches: review tomorrow → informational, not due');
  r = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 36, { review_at: '2026-01-01' }), WT('p', 36, { status: 'completed', treatment_key: 'ext_simple' })], extractionKeys: ['ext_simple'] });
  ok(r.p.watches.length === 0, 'watches: watched tooth later extracted (clinic extraction key) is dropped');
  r = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 36, { review_at: '2026-01-01' }), WT('p', 36, { status: 'completed', treatment_key: 'extracted' })] });
  ok(r.p.watches.length === 0, 'watches: the built-in "extracted" key always counts');
  r = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 36, { review_at: '2026-01-01' }), WT('p', 37, { status: 'completed', treatment_key: 'extracted' })] });
  ok(r.p.watches.length === 1, 'watches: extraction of another tooth does not hide the watch');
  r = c({ appts: [A('p')], patients: [P('p'), P('q')], watches: [WT('q', 36, { review_at: '2026-01-01' })] });
  ok(r.p.watches.length === 0, 'watches: other patients\' watches never leak');
  const e4 = c({ appts: [A('p')], patients: [P('p')], lastVisit: { p: '2025-02-03' }, watches: [WT('p', 36, { review_at: '2026-09-01' }), WT('p', 21)] }).p;
  const h4 = H.chipsHtml(e4, 'p', null);
  ok(/tone-lime/.test(h4) && /🔁 فحص دوري مستحق/.test(h4) && /\u20663\/2\/2025\u2069/.test(h4) && /\u20666\u2069 أشهر/.test(h4), 'chips: recall chip with last visit d/m/y and interval in the title');
  ok(/tone-red/.test(h4) && /👁 مراقبة مستحقة \u20661\u2069/.test(h4) && /السن \u206636\u2069 \(مراجعة \u20661\/9\/2026\u2069 — مستحقة\)/.test(h4) && /السن \u206621\u2069 \(بلا موعد مراجعة\)/.test(h4), 'chips: due watch chip is red with tooth list in the title');
  const e5 = c({ appts: [A('p')], patients: [P('p')], watches: [WT('p', 21)] }).p;
  ok(/tone-gray/.test(H.chipsHtml(e5, 'p', null)) && /👁 مراقبة \u20661\u2069/.test(H.chipsHtml(e5, 'p', null)), 'chips: watch without due date is a gray informational chip');
  /* الرقائق */
  const e1 = c({ appts: [A('p')], patients: [P('p', { medical_flags: ['penicillin_allergy'], medical_flags_other: '<b>x</b>' })], fin: { p: bag(12500, 30.5, 3) }, planned: [S('p')] }).p;
  const h1 = H.chipsHtml(e1, 'p', null);
  ok(/tone-red/.test(h1) && /💰 متبقي/.test(h1) && /\u206613K ل\.س\u2069 \+ \u206630\.5 \$\u2069/.test(h1), 'chips: balance chip with both currencies, LTR-isolated, K-abbreviated SYP');
  ok(/href="patient-profile\.html\?id=p"/.test(h1), 'chips: balance chip links to the patient profile');
  ok(/tone-orange/.test(h1) && /🦷 غير مجدول \u20661\u2069/.test(h1) && /بند مخطّط/.test(h1), 'chips: planned chip with count + title');
  ok(/&lt;b&gt;x&lt;\/b&gt;/.test(h1) && !/<b>x<\/b>/.test(h1) && /tone-yellow/.test(h1) && /حساسية/.test(h1), 'chips: free-text medical warning escaped; allergy chip present');
  ok(!/tone-cyan|tone-purple|tone-blue/.test(h1), 'chips: no new/birthday/family chip when not applicable');
  const e2 = c({ appts: [A('p')], patients: [P('p', { dob: '2000-09-28', family_id: 'f', flags: ['vip'] }), P('q', { name: '"عمر"', family_id: 'f' })], fin: { p: bag(0, 0, 0), q: bag(700) }, reliab: {} }).p;
  const W = load(SRC, null, { flags: true });
  const h2 = W.SyDentHuddle.chipsHtml(e2, 'p', W.SyDentFlags.effectiveDefs(null));
  ok(/tone-cyan/.test(h2) && /🆕 مريض جديد/.test(h2) && /tone-purple/.test(h2) && /🎂/.test(h2), 'chips: new + birthday chips');
  ok(/tone-blue/.test(h2) && /👪 الأسرة \u20661\u2069/.test(h2) && /&quot;عمر&quot;: رصيد/.test(h2) && !/"عمر"/.test(h2), 'chips: family chip with escaped member name in title');
  ok(/pt-flag cbadge tone tone-yellow pt-flag-sm hud-chip/.test(h2) && /⭐ VIP/.test(h2), 'chips: patient flags drawn through SyDentFlags with the small class');
  ok(H.chipsHtml(c({ appts: [A('p')], patients: [P('p')] }).p, 'p', null) === '' && H.chipsHtml(null) === '', 'chips: nothing to say → empty string');
  const e3 = c({ appts: [A('p')], patients: [P('p')], planned: [S('p', { plan_option: 3 })] }).p;
  ok(/خيارات لم تُعتمد/.test(H.chipsHtml(e3, 'p', null)), 'chips: alternatives-only chip');
  ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'module: no hard-coded colours (tones only; rule numbers in comments excluded)');
  for (const t of (SRC.match(/tone-[a-z]+/g) || [])) ok(/^tone-(red|orange|yellow|blue|cyan|purple|green|lime|gray)$/.test(t) || t === 'tone-', 'module: tone from the closed list: ' + t);
}
suite(load(SRC).SyDentHuddle);

async function loadSuite(SRCX) {
  function sbStub(plan) {
    const calls = [];
    function q(table) {
      const rec = { table, eq: [], in: [] }; calls.push(rec);
      const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, in(k, v) { rec.in.push([k, v]); return o; },
        then(res) { const p = plan[table] || { data: [], error: null }; return Promise.resolve(typeof p === 'function' ? p(rec) : p).then(res); } };
      return o;
    }
    return { sb: { from: q }, calls };
  }
  const pats = [P('p', { family_id: 'f' }), P('q', { family_id: 'f' }), P('w')];
  const LS = rec => rec.eq.some(x => x[1] === 'planned') ? { data: [S('p', { appointment_id: 'x' }), S('q')], error: null } : { data: [{ patient_id: 'p', date: '2025-01-10', status: 'completed', description: null }], error: null };
  let st = sbStub({ ledger_sessions: LS,
                    appointments: { data: [A('p', { id: 'x', date: '2026-09-01', status: 'no_show' })], error: null } });
  let H = load(SRCX, st.sb).SyDentHuddle;
  let r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: pats, fin: { p: bag(100), q: bag(0), w: bag(0) }, reliab: {} });
  ok(r.p && r.p.planned === 1 && r.p.family.length === 1 && r.p.family[0].planned === 1, 'load: computes planned via dead appointment + family item');
  const byT = t => st.calls.filter(c => c.table === t);
  const s1 = byT('ledger_sessions').find(c => c.eq.some(x => x[1] === 'planned')), s2 = byT('appointments')[0];
  ok(s1.table === 'ledger_sessions' && s1.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && s1.eq.some(x => x[0] === 'status' && x[1] === 'planned'), 'load: sessions query scoped to doctor + planned');
  ok(s1.in[0][0] === 'patient_id' && s1.in[0][1].slice().sort().join() === 'p,q', 'load: patient ids = today\'s patients + their family, not others');
  ok(/plan_option/.test(s1.select) && /appointment_id/.test(s1.select) && !/cost/.test(s1.select), 'load: selects plan_option/appointment_id and never money columns');
  ok(s2 && s2.table === 'appointments' && s2.in[0][0] === 'id' && s2.in[0][1].join() === 'x' && /dismissed_at/.test(s2.select) && /arrived_at/.test(s2.select), 'load: second query only for linked appointment ids, with the SyDentApptDead columns');
  st = sbStub({ ledger_sessions: rec => rec.eq.some(x => x[1] === 'planned') ? { data: [S('p')], error: null } : { data: [], error: null } });
  H = load(SRCX, st.sb).SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: pats, fin: {}, reliab: {} });
  ok(!st.calls.some(c => c.table === 'appointments') && r.p.planned === 1, 'load: no linked ids → no appointments query');
  st = sbStub({ ledger_sessions: { data: null, error: { message: 'boom' } } });
  const w = load(SRCX, st.sb); H = w.SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: [P('p', { dob: '1980-09-28' })], fin: { p: bag(400) }, reliab: {} });
  ok(r.p.planned === 0 && r.p.balance.length === 1 && r.p.birthday === true && w.__warned === true, 'load: query error → planned dropped, other flags still computed, warned');
  st = sbStub({});
  H = load(SRCX, st.sb).SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [], patients: pats, fin: {}, reliab: {} });
  ok(st.calls.length === 0 && Object.keys(r).length === 0, 'load: no appointments today → no query at all');
  H = load(SRCX, null).SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: pats, fin: { p: bag(5) }, reliab: {} });
  ok(r.p.balance.length === 1 && r.p.planned === 0, 'load: no sb → compute from loaded rows only');

  /* 1ب: استعلاماتُ load */
  st = sbStub({ ledger_sessions: rec => rec.eq.some(x => x[1] === 'completed') ? { data: [{ patient_id: 'p', date: '2025-01-10', status: 'completed', description: null }, { patient_id: 'p', date: '2026-09-01', status: 'completed', description: 'رسم عدم الحضور' }, { patient_id: 'p', date: '2025-06-01', status: 'completed', description: 'x' }], error: null } : { data: [], error: null },
                teeth_status: { data: [{ patient_id: 'p', tooth_num: 36, surface: 'WHOLE', treatment_key: 'w', review_at: '2026-01-01', status: 'condition' }, { patient_id: 'p', tooth_num: 36, surface: 'WHOLE', treatment_key: 'ext_x', review_at: null, status: 'completed' }], error: null },
                treatments: { data: [{ treatment_key: 'ext_x' }], error: null } });
  H = load(SRCX, st.sb).SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: pats, fin: {}, reliab: {}, recallMonths: 6 });
  ok(r.p.recallDue && r.p.recallDue.lastVisit === '2025-06-01', 'load: last visit = newest completed session, no-show fee rows excluded');
  ok(r.p.watches.length === 0, 'load: extraction keys fetched and the extracted watched tooth dropped');
  const lq = st.calls.find(c => c.table === 'ledger_sessions' && c.eq.some(x => x[1] === 'completed')), wq = st.calls.find(c => c.table === 'teeth_status'), xq = st.calls.find(c => c.table === 'treatments');
  ok(lq && lq.eq.some(x => x[0] === 'doctor_id') && lq.in[0][1].join() === 'p' && /description/.test(lq.select) && !/cost/.test(lq.select), 'load: last-visit query scoped to doctor + today\'s patients only (no family), no money columns');
  ok(wq && wq.eq.some(x => x[0] === 'doctor_id') && wq.in[0][1].join() === 'p' && /review_at/.test(wq.select) && /status/.test(wq.select), 'load: teeth query scoped to today\'s patients with review_at + status');
  ok(xq && xq.eq.some(x => x[0] === 'target_part' && x[1] === 'extraction'), 'load: extraction keys read from the clinic catalogue (target_part = extraction)');
  st = sbStub({ teeth_status: { data: [{ patient_id: 'p', tooth_num: 1, treatment_key: 'f', status: 'completed' }], error: null } });
  H = load(SRCX, st.sb).SyDentHuddle;
  await H.load('DOC', { today: TODAY, appts: [A('p')], patients: pats, fin: {}, reliab: {} });
  ok(!st.calls.some(c => c.table === 'treatments'), 'load: no condition rows → no extraction-keys query');
  st = sbStub({ teeth_status: { data: null, error: { message: 'boom' } }, ledger_sessions: { data: null, error: { message: 'boom' } } });
  const w2 = load(SRCX, st.sb); H = w2.SyDentHuddle;
  r = await H.load('DOC', { today: TODAY, appts: [A('p')], patients: [P('p', { dob: '1980-09-28' })], fin: {}, reliab: {} });
  ok(r.p && r.p.recallDue === null && r.p.watches.length === 0 && r.p.birthday === true && w2.__warned, 'load: 1b query errors degrade to no recall/watch flags, others intact');

}

(async () => {
  await loadSuite(SRC);
  /* الربط */
  const IX = read('index.html');
  const tag = IX.indexOf('<script src="huddle-flags.js?v='), relTag = IX.indexOf('<script src="pt-reliability.js?v=');
  ok(tag > 0 && tag > relTag && (IX.match(/huddle-flags\.js\?v=/g) || []).length === 1, 'dashboard: single tag after pt-reliability.js');
  ok(/_dashHuddle = await window\.SyDentHuddle\.load\(uid, \{ today: today, appts: apptsToday, patients: list, fin: dashFin\.ok \? dashFin\.map : null, reliab: _dashReliab, recallMonths: _dashCfgWa && _dashCfgWa\.recall_interval_months \}\)/.test(IX), 'dashboard: one load after reliability, fed from the same dashFin map (no second formula)');
  ok(IX.indexOf('_dashHuddle = await window.SyDentHuddle.load') > IX.indexOf('_dashReliab = await window.SyDentReliability.load'), 'dashboard: huddle load runs after the reliability load it consumes');
  ok((IX.match(/window\.SyDentFlags\.load\(uid\)/g) || []).length === 1 && /const _pfFlags = _dashSettle\(\(window\.SyDentHuddle && window\.SyDentFlags\) \? window\.SyDentFlags\.load\(uid\) : null\);/.test(IX) && /_dashFlagDefs = _dashTake\(await _pfFlags\);/.test(IX), 'dashboard: clinic flag definitions loaded once (v554: prefetched with the first batch)');
  ok(/chipsHtml\(hudMap\[a\.patient_id\], a\.patient_id, _dashFlagDefs\)/.test(IX) && /\(hud \? '<div class="hud-row">' \+ hud \+ '<\/div>' : ''\)/.test(IX), 'dashboard: chips row rendered under the appointment type in today\'s card');
  const rt = IX.slice(IX.indexOf('function renderTodayApptsCard'), IX.indexOf('function _dashOpenAppt'));
  ok(rt.indexOf('hud-row') > rt.indexOf('class="appt-type"') && rt.indexOf('hud-row') < rt.indexOf('stamps ?'), 'dashboard: huddle row sits between the type line and the time stamps');
  ok(/\.hud-row \{ display: flex; flex-wrap: wrap/.test(IX) && /\.hud-row \.hud-chip \{ margin-inline-start: 0/.test(IX), 'dashboard: row CSS wraps chips, no page colours');
  ok(/t\.closest\('button, a, \.wa-badge-dash'\)/.test(IX), 'dashboard: row click ignores inner links so chip links keep working');
  ok((read('scripts/cache-bust.sh').match(/huddle-flags/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');
  ok(/'huddle-flags\.js'\]/.test(read('scripts/check-mirrors.js')), 'check-mirrors.js: medical defs mirror covers the 4th copy');
  ok(/if \(window\.SyDentHuddle\) return;/.test(SRC) && /SYDENT_HUDDLE_END/.test(SRC) && !/innerHTML|window\.confirm|alert\(|\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(SRC), 'module: idempotent, no DOM writes, no native dialogs, read-only');

  /* الإثباتُ العكسي */
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['if (tb > EPS) out.push({ cur: c, amount: tb });', 'if (tb >= 0) out.push({ cur: c, amount: tb });', 'zero/credit balance flagged'],
      ['if (planOptOf(s) !== null) { altByPt', 'if (false) { altByPt', 'unadopted alternatives counted'],
      ['free = !!a && !!dead && dead(a, today);', 'free = false;', 'dead appointment still "scheduled"'],
      ['if (!m || m.id === pid) return;', 'if (!m) return;', 'patient listed as own family'],
      ["dob.slice(5) === today.slice(5)", "dob.slice(5, 7) === today.slice(5, 7)", 'birthday by month only'],
      ['!(fb.sessCount > 0) && !finishedAppts', '!(fb.sessCount > 0)', 'finished appointments ignored for "new"'],
      ["var t = title ? ' title=\"' + esc(title) + '\"' : '';", "var t = title ? ' title=\"' + title + '\"' : '';", 'title not escaped'],
      ['if (lv && lv <= threshold) e.recallDue', 'if (lv && lv < threshold) e.recallDue', 'recall threshold boundary off by one'],
      ["if (extracted[r.patient_id] && extracted[r.patient_id][String(r.tooth_num)]) return;", "", 'extracted teeth still watched'],
      ["if (!s.date || s.description === 'رسم عدم الحضور') return;", "if (!s.date) return;", 'no-show fee counted as a visit'],
      ["if (!r || !r.patient_id || r.status !== 'condition') return;", "if (!r || !r.patient_id) return;", 'non-condition rows counted as watches']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { const m = SRC.replace(a, b); suite(load(m).SyDentHuddle); await loadSuite(m); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت أعلام الهدل: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
