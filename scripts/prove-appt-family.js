/* v506 — مثبتُ حجز الأسرة المتتابع (appt-family.js) — مستقل، على الملفات الحيّة.
   (١) slots: التتابعُ بعد الأساس بمقدار المدّة، الرفضُ عند تجاوز منتصف الليل، المدّةُ الغائبة 30، وقتٌ غيرُ صالح ⇒ [];
   (٢) members: الطبيبُ ⇒ family_id ⇒ الأفرادُ غيرُ المريض؛ بلا أسرة أو خطأ ⇒ [];
   (٣) precheck: استعلامُ مواعيدَ واحد ليوم الأساس عند وجود مورد، الفتراتُ دائماً، التعارضُ لكل فرد عبر المصدرين المشتركين؛
   (٤) rows: الحقولُ الجدولية فقط، status=scheduled، بلا ملاحظات/أختام؛
   (٥) الربط: المجموعةُ بالنموذج · التحميلُ عند اختيار المريض · مخفيّةٌ بالتعديل والمخطّط · الحفظُ يجمع المختارين قبل الإدخال
       ويُنشئهم بعده · لا addEventListener (سجلّ المستمعات) · cache-bust · ترتيبُ السكربت · جردُ الكتابة.
   --self-test: 4 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('appt-family.js');
function ext(src, name) { const i = src.indexOf(name); if (i < 0) throw new Error('missing ' + name); let j = src.indexOf('{', i), d = 0, k = j; for (; k < src.length; k++) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } } return src.slice(i, k + 1); }
function load(src, win) {
  win = win || {};
  const ctx = { window: win, console: { warn() {} }, Number, parseInt, String, Date, Math, Array, Object, Promise, RegExp };
  vm.createContext(ctx);
  vm.runInContext(read('sched-blocks.js'), ctx); vm.runInContext(read('appt-conflict.js'), ctx); vm.runInContext(src, ctx);
  return win.SyDentFamily;
}
const P = (id) => ({ id, name: 'N' + id });
function suite(F) {
  let s = F.slots('10:00', 30, [P('a'), P('b'), P('c')]);
  ok(s.length === 3 && s.map(x => x.time).join() === '10:30,11:00,11:30' && s[0].patient.id === 'a', 'slots: back-to-back by duration');
  ok(F.slots('10:00:00', 45, [P('a')])[0].time === '10:45', 'slots: HH:MM:SS input, 45 min');
  ok(F.slots('23:00', 30, [P('a'), P('b')]).length === 1 && F.slots('23:30', 30, [P('a')]).length === 0, 'slots: stop before midnight');
  ok(F.slots('10:00', null, [P('a')])[0].time === '10:30' && F.slots('10:00', 'x', [P('a')])[0].time === '10:30', 'slots: missing duration → 30');
  ok(F.slots('', 30, [P('a')]).length === 0 && F.slots('10:00', 30, []).length === 0, 'slots: no time / nobody → []');
  const r = F.rows({ doctor_id: 'D', date: '2026-10-05', duration: 30, type: 'كشف', color: 'g', stroke: 's', provider_id: 'PR', operatory_id: 'OP', appointment_type_id: 'AT', notes: 'private', status: 'confirmed', asap: true, series_id: 'S' }, F.slots('10:00', 30, [P('a'), P('b')]));
  ok(r.length === 2 && r[0].patient_id === 'a' && r[0].patient_name === 'Na' && r[0].time === '10:30' && r[1].time === '11:00' && r.every(x => x.status === 'scheduled' && x.is_planned === false && x.date === '2026-10-05' && x.provider_id === 'PR' && x.operatory_id === 'OP' && x.appointment_type_id === 'AT' && x.type === 'كشف'), 'rows: scheduling fields copied, scheduled, own patient');
  ok(r.every(x => x.notes === null && !('asap' in x) && !('series_id' in x) && !('id' in x) && !('confirmed_at' in x)), 'rows: no notes/asap/series/stamps carried over');
}
suite(load(SRC));

(async () => {
  function win(opts) {
    const calls = { tables: [], eq: [] };
    const mk = (t) => { const o = { select() { return o; }, eq(k, v) { calls.eq.push([t, k, v]); return o; }, lte() { return o; }, gte() { return o; }, or() { return o; }, order() { return o; }, in() { return o; },
      maybeSingle() { return Promise.resolve(opts.me === undefined ? { data: null } : { data: opts.me, error: null }); },
      then(res) { return Promise.resolve({ data: t === 'patients' ? opts.fam : (t === 'appointments' ? opts.appts : opts.blocks), error: null }).then(res); } }; return o; };
    return { w: { sb: { from(t) { calls.tables.push(t); return mk(t); } } }, calls };
  }
  let { w, calls } = win({ me: { id: 'p', family_id: 'F' }, fam: [{ id: 'p', name: 'me' }, { id: 'q', name: 'sis' }, { id: 'r', name: 'bro' }] });
  let F = load(SRC, w);
  let m = await F.members('DOC', 'p');
  ok(m.map(x => x.id).join() === 'q,r' && calls.eq.some(e => e[0] === 'patients' && e[1] === 'doctor_id' && e[2] === 'DOC') && calls.eq.some(e => e[1] === 'family_id' && e[2] === 'F'), 'members: doctor-scoped, by family, self excluded');
  ({ w, calls } = win({ me: { id: 'p', family_id: null }, fam: [] })); F = load(SRC, w);
  ok((await F.members('DOC', 'p')).length === 0 && calls.tables.length === 1, 'members: no family → [] after one query');
  ok((await load(SRC, {}).members('DOC', 'p')).length === 0, 'members: no client → []');
  ({ w, calls } = win({ appts: [{ id: 1, date: '2026-10-05', time: '10:40', duration: 30, provider_id: 'PR', status: 'confirmed', patient_name: 'X' }], blocks: [{ id: 'b', title: 'استراحة', kind: 'break', date_from: '2026-10-05', date_to: '2026-10-05', start_time: '11:00:00', end_time: '12:00:00', blocks_scheduling: true }] }));
  F = load(SRC, w);
  const base = { date: '2026-10-05', time: '10:00', duration: 30, provider_id: 'PR', operatory_id: null };
  const plan = F.slots('10:00', 30, [P('a'), P('b'), P('c')]);   // 10:30 · 11:00 · 11:30
  const pre = await F.precheck(base, plan, 'DOC');
  ok(calls.tables.filter(t => t === 'appointments').length === 1 && calls.eq.some(e => e[0] === 'appointments' && e[1] === 'date' && e[2] === '2026-10-05') && calls.tables.includes('schedule_blocks'), 'precheck: one appointments query for the day + one blocks load');
  ok(pre.conflicting.join() === 'a,b,c' && pre.byPatient.a.conflicts.length === 1 && pre.byPatient.a.blocks.length === 0 && pre.byPatient.b.blocks.length === 1 && pre.byPatient.c.blocks.length === 1 && pre.byPatient.c.conflicts.length === 0, 'precheck: a hits the provider conflict, b and c hit the break');
  ({ w, calls } = win({ appts: [{ id: 1, date: '2026-10-05', time: '10:40', duration: 30, provider_id: 'PR', status: 'confirmed' }], blocks: [] })); F = load(SRC, w);
  ok((await F.precheck({ date: '2026-10-05', time: '10:00', duration: 30 }, plan, 'DOC')).conflicting.length === 0 && !calls.tables.includes('appointments'), 'precheck: no resource → no appointments query');

  /* (٥) الربط */
  const AH = read('appointments.html'), AM = read('appt-modal.js');
  ok(/id="fFamilyGroup" style="display:none;"/.test(AH) && /id="fFamilyChips" class="fam-chips"/.test(AH) && /id="fFamilyHint"/.test(AH), 'modal: family group hidden by default');
  ok(/async function apptFamilyLoad\(pid\)/.test(AM) && /window\.SyDentFamily\.members\(currentUser\.id, pid\)/.test(AM) && /if \(!pid \|\| editingId \|\| !window\.SyDentFamily\)/.test(ext(AM, 'async function apptFamilyLoad')), 'load: members fetched for the picked patient, never in edit mode');
  ok(/rec\.id !== pid\) \{ g\.style\.display = 'none'; return; \}/.test(ext(AM, 'async function apptFamilyLoad')), 'load: a patient switched during the fetch is discarded');
  ok(/apptFamilyLoad\(rec && rec\.id \? rec\.id : null\)/.test(ext(AM, 'function updatePatientMedHint')), 'load: triggered from the patient pick (same hook as the medical hint)');
  ok(!/addEventListener\('change', apptFamilyHint\)/.test(AM) && /cb\.setAttribute\('onchange', 'apptFamilyHint\(\)'\)/.test(AM), 'chips: inline handler (listener registry untouched)');
  ok(/<input type="time" id="fTime" onchange="apptFamilyHint\(\)">/.test(AH) && /<select id="fDuration" onchange="apptFamilyHint\(\)">/.test(AH), 'hint: follows time and duration');
  const sub = ext(AH, 'async function submitAppt');
  ok(/var _famPicked = \(!editingId && !isPlannedNow && window\.SyDentFamily && typeof apptFamilyPicked === 'function'\) \? apptFamilyPicked\(\) : \[\];/.test(sub) && sub.indexOf('var _famPicked') < sub.indexOf('.insert(apptData)'), 'submit: picks collected before the base insert');
  const iF = sub.indexOf('await apptCreateFamilyAppts(ins.data, _famPicked)'), iB = sub.indexOf('bookingMarkConfirmed(_newApptId, ins.data)');
  ok(iF > 0 && iF < iB && /if \(_newApptId && _famPicked\.length && ins\.data\)/.test(sub), 'submit: family created after a successful insert, before booking link/close');
  const cf = ext(AH, 'async function apptCreateFamilyAppts');
  ok(/F\.slots\(saved\.time, saved\.duration, picked\)/.test(cf) && /F\.precheck\(saved, plan, currentUser\.id\)/.test(cf) && /confirmText: 'حجز غير المتعارضين'/.test(cf) && /confirmText: 'الحجز رغم التعارض'/.test(cf) && /\.insert\(F\.rows\(saved, use\)\)/.test(cf) && !/window\.confirm\(/.test(cf), 'create: slots → precheck → skip/force/base-only → one batch insert, no native dialogs');
  ok(/if \(famGrp && planned\) famGrp\.style\.display = 'none';/.test(ext(AH, 'function onPlannedToggle')) && /apptFamilyLoad\(null\);   \/\* v506: لا حجزَ أسرةٍ عند التعديل \*\//.test(ext(AH, 'async function editAppt')) && /apptFamilyLoad\(null\);   \/\* v506 \*\//.test(ext(AH, 'async function openModal')), 'modal: hidden on planned / edit / open');
  const tags = ['appt-series.js', 'appt-family.js', 'appt-modal.js'].map(n => AH.indexOf('<script src="' + n + '?v='));
  ok(tags.every(i => i > 0) && tags[0] < tags[1] && tags[1] < tags[2], 'script order: series → family → modal');
  ok((read('scripts/cache-bust.sh').match(/appt-family/g) || []).length === 3, 'cache-bust.sh allow-listed');
  ok(/\.fam-chips label input \{ position: absolute; inset: 0;[^}]*opacity: 0/.test(read('appointments.css')), 'css: chip pattern (hidden input covers the chip)');
  ok(/'appointments\.html:apptCreateFamilyAppts': 'other'/.test(read('scripts/prove-appt-conflict.js')), 'write-site census classifies the family insert');
  ok(/if \(window\.SyDentFamily\) return;/.test(SRC) && /SYDENT_FAMILY_END/.test(SRC) && !/innerHTML|window\.confirm|\balert\(/.test(SRC), 'module: idempotent, no DOM, no native dialogs');

  if (process.argv.includes('--self-test')) {
    const muts = [
      ['var t = s + d * (i + 1);', 'var t = s + d * i;', 'first member on the base slot'],
      ['if (t + d > 1440) break;', '', 'past midnight allowed'],
      ["status: 'scheduled', notes: null,", "status: 'confirmed', notes: saved.notes,", 'confirmed + notes leaked'],
      ["return (r.data || []).filter(function (p) { return p.id !== patientId; });", 'return (r.data || []);', 'self included']
    ];
    let red = 0;
    for (const [a, b, n] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + n); continue; }
      const f0 = fail, p0 = pass, lg = console.log; console.log = () => {};
      const M = SRC.replace(a, b);
      suite(load(M));
      const { w: w3 } = win({ me: { id: 'p', family_id: 'F' }, fam: [{ id: 'p', name: 'me' }, { id: 'q', name: 'sis' }] });
      const mm = await load(M, w3).members('DOC', 'p'); if (mm.some(x => x.id === 'p')) fail++;
      console.log = lg;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', n);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت حجز الأسرة: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
