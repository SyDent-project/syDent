/* v497 — مثبتُ مؤشّر التزام المريض (pt-reliability.js) — مستقل، على الملفات الحيّة.
   (١) دلالةُ compute من التعريف (نافذة 12 شهراً · المنتهي · الفشل · إلغاءٌ بإعادة جدولة · حدُّ الموعدين · الدرجات)؛
   (٢) الشارةُ والتلميح (لا HTML من أسماء · أرقامٌ معزولة LTR · الدرجة 0 = لا شيء)؛
   (٣) load: الاستعلامُ محصورٌ بالنافذة وبالمرضى المطلوبين، وفشلُه {}؛
   (٤) الربط بالأسطح الأربعة (المواعيد: 5 مواضع رسم + النافذة · اللوحة · المرضى) وقائمةُ سماح cache-bust.
   --self-test: 5 طفرات لا بدّ أن تحمّر (١). */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('pt-reliability.js');

function load(src, sb) {
  const win = {}; if (sb) win.sb = sb;
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math };
  vm.createContext(ctx); vm.runInContext(src, ctx); return win;
}
const TODAY = '2026-10-01';
const A = (pid, date, status, extra) => Object.assign({ patient_id: pid, date, status }, extra || {});

function suite(R) {
  const c = rows => R.compute(rows, TODAY);
  // حدُّ الموعدين
  ok(c([A('p', '2026-09-01', 'no_show')])['p'].level === 0 && c([A('p', '2026-09-01', 'no_show')])['p'].failures === 1, 'one finished appt → counted but no level');
  ok(c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'completed')])['p'].level === 2, 'two finished, one miss = 50% → level 2 (rate rule)');
  // الدرجات
  ok(c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'no_show'), A('p', '2026-07-01', 'completed')])['p'].level === 2, '2 misses → level 2 (count rule)');
  ok(c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'completed'), A('p', '2026-07-01', 'completed')])['p'].level === 2, '1/3 = 33% → level 2 (rate rule)');
  ok(c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'completed'), A('p', '2026-07-01', 'completed'), A('p', '2026-06-01', 'completed')])['p'].level === 1, '1/4 = 25% → level 1');
  ok(c([A('p', '2026-09-01', 'completed'), A('p', '2026-08-01', 'completed')])['p'].level === 0, 'no failures → level 0');
  // الحالات
  ok(c([A('p', '2026-09-01', 'broken'), A('p', '2026-08-01', 'completed')])['p'].missed === 1, 'legacy broken counts as missed');
  ok(c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-08-01', 'completed')])['p'].cancelled === 1, 'cancelled without rebook = failure');
  ok(c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-09-01', 'completed')])['p'].cancelled === 0 && c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-09-01', 'completed')])['p'].finished === 2, 'cancelled + another non-cancelled same day = reschedule, not failure');
  ok(c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-09-01', 'cancelled')])['p'].cancelled === 2, 'two cancellations same day, nothing else = 2 failures');
  ok(c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-09-01', 'no_show')])['p'].cancelled === 0 && c([A('p', '2026-09-01', 'cancelled'), A('p', '2026-09-01', 'no_show')])['p'].missed === 1, 'cancelled then no-show same day: only the no-show counts');
  ok(!('p' in c([A('p', '2026-09-01', 'confirmed'), A('p', '2026-08-01', 'scheduled'), A('p', '2026-08-15', 'pending')])), 'unfinished statuses ignored entirely');
  ok(c([A('p', '2026-09-01', 'confirmed', { dismissed_at: '2026-09-01T10:00:00Z' }), A('p', '2026-08-01', 'completed')])['p'].finished === 2, 'dismissed_at = finished even with live status');
  ok(!('p' in c([A('p', null, 'no_show'), A('p', '2026-09-01', 'no_show', { is_planned: true })])), 'planned / dateless rows ignored');
  ok(!('x' in c([A(null, '2026-09-01', 'no_show')])) && Object.keys(c([A(null, '2026-09-01', 'no_show')])).length === 0, 'rows without patient_id ignored');
  // النافذة
  ok(R.windowStart(TODAY) === '2025-10-01', 'window start = today − 365 days');
  ok(c([A('p', '2025-10-01', 'no_show'), A('p', '2026-09-01', 'completed')])['p'].missed === 1, 'boundary day inside window');
  ok(c([A('p', '2025-09-30', 'no_show'), A('p', '2026-09-01', 'completed')])['p'].missed === 0, 'day before window excluded');
  ok(c([A('p', '2026-10-02', 'no_show'), A('p', '2026-09-01', 'completed')])['p'].missed === 0, 'future date excluded');
  ok(c([A('p', TODAY, 'no_show'), A('p', '2026-09-01', 'completed')])['p'].missed === 1, 'today included');
  // مرضى متعدّدون مستقلّون
  const m = c([A('a', '2026-09-01', 'no_show'), A('a', '2026-08-01', 'completed'), A('b', '2026-09-01', 'completed'), A('b', '2026-08-01', 'completed')]);
  ok(m.a.level === 2 && m.b.level === 0, 'patients independent');
  // الشارة
  const s1 = c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'completed'), A('p', '2026-07-01', 'completed'), A('p', '2026-06-01', 'completed')])['p'];
  const b = R.badgeHtml(s1);
  ok(/tone-yellow/.test(b) && /\u20661\/4\u2069/.test(b) && /عدم حضور 1/.test(b) && /12 شهراً/.test(b), 'badge: yellow, 1/4, title');
  ok(/pt-reliab/.test(b) && /white-space:nowrap/.test(b), 'badge: class + no wrap');
  const s2 = c([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'cancelled'), A('p', '2026-07-01', 'completed')])['p'];
  ok(/tone-red/.test(R.badgeHtml(s2)) && /عدم حضور 1 · إلغاء بلا بديل 1/.test(R.badgeHtml(s2)), 'badge: red, both reasons');
  ok(R.badgeHtml(c([A('p', '2026-09-01', 'completed'), A('p', '2026-08-01', 'completed')])['p']) === '' && R.badgeHtml(null) === '', 'badge: level 0 / null → empty');
  ok(/font-size:10px/.test(R.badgeHtml(s1, true)) && /font-size:11px/.test(R.badgeHtml(s1)), 'badge: small variant');
  ok(!/<script|onerror/.test(R.badgeHtml(s2)) && !/[<>"]/.test(R.badgeHtml(s2).replace(/<span[^>]*>|<\/span>/g, '')), 'badge: no unescaped markup');
  ok(/تأكيدٌ مسبق أو عربون/.test(R.hintText(s2)) && !/عربون/.test(R.hintText(s1)) && R.hintText(null) === '', 'hint: deposit advice only at level 2');
}
suite(load(SRC).SyDentReliability);

(async () => {
  /* load(): الاستعلام */
  function sbStub(rows, err) {
    const calls = { eq: [], gte: [], lte: [], in: [] };
    const q = { select(c) { calls.select = c; return q; }, eq(k, v) { calls.eq.push([k, v]); return q; }, gte(k, v) { calls.gte.push([k, v]); return q; },
      lte(k, v) { calls.lte.push([k, v]); return q; }, in(k, v) { calls.in.push([k, v]); return q; },
      then(r) { return Promise.resolve(err ? { error: err } : { data: rows, error: null }).then(r); } };
    return { sb: { from(t) { calls.table = t; return q; } }, calls };
  }
  let st = sbStub([A('p', '2026-09-01', 'no_show'), A('p', '2026-08-01', 'completed')]);
  let R = load(SRC, st.sb).SyDentReliability;
  let r = await R.load('DOC', ['p', 'q'], TODAY);
  ok(r.p && r.p.level === 2, 'load: computes from rows');
  ok(st.calls.table === 'appointments' && st.calls.eq[0][1] === 'DOC' && st.calls.gte[0][1] === '2025-10-01' && st.calls.lte[0][1] === TODAY && st.calls.in[0][1].join() === 'p,q', 'load: query scoped to doctor · window · patient ids');
  ok(/dismissed_at/.test(st.calls.select) && /is_planned/.test(st.calls.select) && /status/.test(st.calls.select), 'load: selects the columns compute needs');
  st = sbStub([]); R = load(SRC, st.sb).SyDentReliability; r = await R.load('DOC', undefined, TODAY);
  ok(st.calls.in.length === 0 && Object.keys(r).length === 0, 'load: no ids → no .in filter (whole window)');
  r = await R.load('DOC', [], TODAY); ok(Object.keys(r).length === 0, 'load: empty id list → {} without query');
  st = sbStub(null, { message: 'x' }); const w = load(SRC, st.sb); r = await w.SyDentReliability.load('DOC', ['p'], TODAY);
  ok(Object.keys(r).length === 0 && w.__warned === true, 'load: query error → {} + warn');

  /* الربط */
  const AM = read('appt-modal.js'), AV = read('appt-views.js'), AH = read('appointments.html'), IX = read('index.html'), PT = read('patients.html');
  ok(/function getApptReliabStats\(pid\)/.test(AM) && /_reliabCache\.src !== appointments/.test(AM) && /window\.SyDentReliability\.compute\(appointments\)/.test(AM), 'modal helpers: cached compute on the loaded appointments array');
  ok((AV.match(/getApptReliabBadge\(e\)/g) || []).length === 3, 'views: day/list/calls name lines carry the badge (3)');
  ok((AV.match(/getApptReliabBadge\(e, true\)/g) || []).length === 2, 'views: chair + week cards carry the small badge (2)');
  for (const m of AV.matchAll(/getApptMedBadge\(e\)[^\n]*/g)) ok(/getApptReliabBadge\(e\)/.test(m[0]), 'views: badge sits next to the med badge on the same line');
  ok(/id="fPatientRelHint"/.test(AH) && AH.indexOf('id="fPatientRelHint"') > AH.indexOf('id="fPatientMedHint"'), 'modal: hint element after the medical hint');
  ok(/getElementById\('fPatientRelHint'\)/.test(AM) && /rel\.textContent = txt/.test(AM) && /hintText\(st\)/.test(AM), 'modal: hint filled via textContent from hintText');
  ok(/\.rel-hint\.rel-red/.test(read('appointments.css')) && /classList\.toggle\('rel-red'/.test(AM), 'modal: level-2 red styling wired');
  ok(/_dashReliab = await window\.SyDentReliability\.load\(uid, _relIds\)/.test(IX) && /badgeHtml\(relMap\[a\.patient_id\], true\)/.test(IX) && /var relMap = isNext \? _dashNext\.reliab : _dashReliab;/.test(IX) && /safeName \+ ' ' \+ relBadge/.test(IX), 'dashboard: one scoped load + badge in today card (v520: map chosen by the today/next view)');
  ok(/const _relP = _ptSettle\(window\.SyDentReliability \? window\.SyDentReliability\.load\(currentUser\.id\) : null\);/.test(PT) && /prmReliab = _ptTake\(await _relP\);/.test(PT)   /* v557: يُطلَق مع القائمة */ && /\$\{flagBadge\}\$\{relBadge/.test(PT), 'patients: load + badge next to the name');
  for (const f of ['appointments.html', 'index.html', 'patients.html']) {
    const src = read(f), tag = src.indexOf('<script src="pt-reliability.js?v='), dlg = src.indexOf('<script src="sy-modal.js?v=');
    const firstUse = Math.min(...['appt-views.js', 'appt-modal.js'].map(n => src.indexOf('<script src="' + n + '?v=')).filter(i => i > 0).concat([src.length]));
    ok(tag > 0 && tag > dlg && tag < firstUse && (src.match(/pt-reliability\.js\?v=/g) || []).length === 1, f + ': single tag, after sy-modal, before consumers');
  }
  ok((read('scripts/cache-bust.sh').match(/pt-reliability/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');
  ok(/if \(window\.SyDentReliability\) return;/.test(SRC) && /SYDENT_RELIABILITY_END/.test(SRC) && !/innerHTML|window\.confirm|alert\(/.test(SRC), 'module: idempotent, no DOM writes, no native dialogs');

  /* الإثبات العكسي */
  if (process.argv.includes('--self-test')) {
    const muts = [
      ['if (finished >= MIN_FINISHED && failures > 0)', 'if (failures > 0)', 'no minimum'],
      ["var rebooked = list.some(function (b) { return b !== a && b.date === a.date && b.status !== 'cancelled'; });", 'var rebooked = false;', 'reschedule counted as failure'],
      ['if (a.date < from || a.date > today) return;', 'if (a.date < from) return;', 'future rows counted'],
      ['(failures >= RED_COUNT || rate >= RED_RATE) ? 2 : 1', '(failures >= RED_COUNT) ? 2 : 1', 'rate rule dropped'],
      ["if (!s || !s.level) return '';", "if (!s) return '';", 'level-0 badge shown']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      suite(load(SRC.replace(a, b)).SyDentReliability);
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت مؤشّر الالتزام: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });
