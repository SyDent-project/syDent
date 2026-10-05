/* v524 — مثبتُ الاستحقاق التلقائي وسقف موعد التركيب (lab-due.js) — مستقل، على الملفات الحيّة.
   (١) الوحدة: أيامُ الدوام (الجمعة عطلة افتراضاً · إعدادُ العيادة) · الإضافةُ والسابقُ والعدّ · الوسيط ·
       مدّةُ المخبر من التاريخ (≥ طلبين · المخبرُ والعملُ نفسهما · ≤60) · compute بحالاته الخمس · check;
   (٢) المودال (DOM مصغّر): يملأ الفارغ · لا يدوس ما كتبه الطبيب إلا إن صار بعد الموعد · القالبُ يملأ صراحةً ·
       الكتابةُ اليدوية تُسقط «التلقائي» · reset · التنبيهُ مرئيّ;
   (٣) السطحان الحيّان: كتلةُ القالب متطابقةٌ وتمرّ بـapplyTemplateDays · التحقّقُ قبل أيّ كتابة بالحفظين ·
       labDueOpen قبل فتح المودال (إنشاء/تعديل) · حلُّ موعد التركيب مُنفَّذاً (الملغى · __auto__ · __new__ · غير النشط);
   (٤) الربط: وسمُ السكربت · cache-bust · theme.css (السطر · الزرّ العائم · تاريخ iOS بحوار الإعادة).
   --self-test: 17 طفرة لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function miniDoc() {
  const els = {};
  const mk = (id, v) => {
    const e = { id, value: v || '', attrs: {}, listeners: {}, children: [], textContent: '', innerHTML: '', className: '',
      setAttribute(k, x) { this.attrs[k] = String(x); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      removeAttribute(k) { delete this.attrs[k]; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; }, fire(t) { (this.listeners[t] || []).forEach(f => f()); } };
    Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set(v) { if (v === '') e.children = []; } });
    e.parentNode = { appendChild(c) { if (c.id) els[c.id] = c; return c; } };
    els[id] = e; return e;
  };
  ['labOrderDateSent', 'labOrderDateDue', 'labOrderAppointment', 'labOrderWorkType', 'labOrderLabSelect', 'labNewApptDate'].forEach(i => mk(i));
  const doc = { getElementById: id => els[id] || null, createElement: () => mk('__tmp' + Math.random()), createTextNode: t => ({ textContent: t }) };
  return { doc, els };
}
function load(src, doc) {
  const win = {};
  const ctx = { window: win, document: doc, console: { warn() { win.__warned = (win.__warned || 0) + 1; } }, Number, String, Date, Array, Object, Promise, Math, RegExp, JSON, parseInt };
  vm.createContext(ctx); vm.runInContext(src, ctx); return win;
}
const hintText = els => (els.lduHint ? els.lduHint.children.filter(c => c.className !== 'ldu-setup').map(c => c.textContent).join(' | ') : '');
const setupOf = els => { const c = els.lduHint && els.lduHint.children.find(x => x.className === 'ldu-setup'); if (!c) return null; const a = c.children.find(x => x.href); return a ? a.href : ''; };
const warnOf = els => (els.lduHint ? els.lduHint.children.filter(c => c.className === 'ldu-warn').map(c => c.textContent).join('') : '');
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

async function suite(F) {
  const WD = [0, 1, 2, 3, 4, 6];
  /* ── (١) ── */
  const { doc, els } = miniDoc();
  const W = load(F['lab-due.js'], doc), D = W.SyLabDue;
  ok(!!D, 'module exported');
  ok(JSON.stringify(D.parseWorkDays('0,1,2,3,4,6')) === '[0,1,2,3,4,6]' && JSON.stringify(D.parseWorkDays('')) === '[0,1,2,3,4,6]' && JSON.stringify(D.parseWorkDays('1,9,x,2')) === '[1,2]',
     'parseWorkDays: setting, empty ⇒ Friday closed, junk dropped');
  ok(D.addWorkDays('2026-10-01', 1, WD) === '2026-10-03' && D.addWorkDays('2026-09-28', 5, WD) === '2026-10-04' && D.addWorkDays('2026-09-28', 0, WD) === '',
     'addWorkDays: Thursday +1 ⇒ Saturday (Friday skipped); Monday +5 ⇒ Sunday; 0 ⇒ none');
  ok(D.prevWorkDay('2026-10-03', WD) === '2026-10-01' && D.prevWorkDay('2026-10-05', WD) === '2026-10-04', 'prevWorkDay: Saturday ⇒ Thursday; Monday ⇒ Sunday');
  ok(D.workDaysBetween('2026-09-28', '2026-10-03', WD) === 4 && D.workDaysBetween('2026-10-03', '2026-09-28', WD) === 0, 'workDaysBetween: Mon→Sat = 4 (Friday skipped) · reversed ⇒ 0');
  ok(D.median([7, 3, 5]) === 5 && D.median([4, 6]) === 5 && D.median([]) === null, 'median');
  const H = [{ lab_id: 'L1', treatment_key: 'crown', date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-08T10:00:00Z' },
             { lab_id: 'L1', treatment_key: 'crown', date_sent: '2026-09-10T00:00:00+00:00', date_received: '2026-09-15T10:00:00Z' },
             { lab_id: 'L1', treatment_key: 'crown', date_sent: '2026-01-01T00:00:00+00:00', date_received: '2026-06-01T10:00:00Z' },
             { lab_id: 'L2', treatment_key: 'crown', date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-03T10:00:00Z' },
             { lab_id: 'L1', treatment_key: 'bridge', date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-20T10:00:00Z' }];
  const h = D.histDays(H, 'L1', 'crown', WD);
  ok(h && h.days === 5 && h.n === 2, 'histDays: same lab + work, >60 ignored, median of work days (6,4 ⇒ 5) ' + JSON.stringify(h));
  ok(D.histDays(H, 'L2', 'crown', WD) === null && D.histDays(H, 'L1', 'bridge', WD) === null && D.histDays(H, '', 'crown', WD) === null, 'histDays: <2 samples or missing key ⇒ none');
  let r = D.compute({ sent: '2026-09-28', days: 5, src: 'tpl', workDays: WD });
  ok(r.due === '2026-10-04' && /القالب: 5 أيام عمل/.test(r.hint) && !r.warn, 'compute: template only ⇒ sent + work days');
  r = D.compute({ sent: '2026-09-28', apptDate: '2026-10-05', workDays: WD });
  ok(r.due === '2026-10-04' && /قبل موعد التركيب \(5\/10\)/.test(r.hint), 'compute: appointment only ⇒ last work day before it');
  r = D.compute({ sent: '2026-09-28', days: 3, src: 'hist', samples: 4, apptDate: '2026-10-08', workDays: WD });
  ok(r.due === '2026-10-01' && /عادةً 3 أيام عمل \(من 4 طلبات/.test(r.hint) && !r.warn, 'compute: turnaround before the cap ⇒ turnaround, history hint');
  r = D.compute({ sent: '2026-09-28', days: 8, src: 'tpl', apptDate: '2026-10-03', workDays: WD });
  ok(r.due === '2026-10-01' && /قد لا يجهز/.test(r.warn) && /قبل موعد التركيب/.test(r.hint), 'compute: turnaround past the appointment ⇒ capped + explicit warning');
  r = D.compute({ sent: '2026-10-01', apptDate: '2026-10-01', workDays: WD });
  ok(r.due === '2026-10-01', 'compute: appointment on the send day ⇒ never before the send date');
  ok(/بعد موعد التركيب/.test(D.check('2026-10-06', '2026-10-05')) && D.check('2026-10-05', '2026-10-05') === '' && D.check('2026-10-06', '') === '' && D.check('', '2026-10-05') === '',
     'check: due after the appointment refused; same day / no appointment / no due allowed');

  /* ── (٢) المودال ── */
  let appt = '';
  D._state.workDays = WD; D._state.hist = H;
  D.attach({ apptDate: () => appt });
  const due = els.labOrderDateDue;
  els.labOrderDateSent.value = '2026-09-28'; els.labOrderLabSelect.value = 'L1'; els.labOrderWorkType.value = 'crown';
  D.reset(); els.labOrderWorkType.fire('change');
  ok(due.value === '2026-10-04' && /عادةً 5 أيام عمل/.test(hintText(els)), 'modal: empty due filled from lab history on change');
  appt = '2026-10-01'; els.labOrderAppointment.fire('change');
  ok(due.value === '2026-09-30' && /قد لا يجهز/.test(warnOf(els)), 'modal: linking a nearer appointment re-caps the auto value and warns');
  due.value = '2026-09-29'; due.fire('input'); appt = '2026-10-10'; els.labOrderAppointment.fire('change');
  ok(due.value === '2026-09-29', 'modal: a date the doctor typed is kept');
  appt = '2026-09-28'; els.labOrderAppointment.fire('change');
  ok(due.value === '2026-09-28' && /عُدّل ليسبق موعد التركيب/.test(hintText(els)), 'modal: a typed date after the new appointment is corrected, with a message');
  appt = ''; D.applyTemplateDays(2);
  ok(due.value === '2026-09-30' && /القالب: يوما عمل/.test(hintText(els)), 'modal: applying a template fills the due explicitly (work days)');
  D.reset();
  ok(due.getAttribute('data-ldu-auto') === null && hintText(els) === '', 'modal: reset clears the auto mark and the hint');
  due.value = '2026-10-20'; appt = '2026-10-10';
  ok(/بعد موعد التركيب/.test(D.checkForm()), 'modal: checkForm reads the live fields');
  appt = ''; due.value = '2026-09-20';
  ok(/قبل تاريخ الإرسال/.test(D.checkForm()), 'modal: a due before the send date is refused (v533)');
  due.value = '2026-10-20'; appt = '2026-10-10';

  /* M161: مدّة العلاج من صفحة العلاجات — الأولوية القالب ← العلاج ← التاريخ، ورابطُ الإعداد بلا مصدر */
  D.reset(); due.value = ''; appt = '';
  D._state.trtDays = { crown: 3, zircon: null };
  els.labOrderWorkType.fire('change');
  ok(due.value === '2026-10-01' && /مدّة المخبر المعتادة لهذا العلاج: 3 أيام عمل \(صفحة العلاجات\)/.test(hintText(els)), 'M161: treatment lab_days beats the lab history (3 work days, source named)');
  D.applyTemplateDays(2);
  ok(due.value === '2026-09-30', 'M161: an applied template still wins over the treatment setting');
  D.reset(); due.value = ''; els.labOrderWorkType.value = 'crown'; els.labOrderWorkType.fire('change');
  const autoCrown = due.value;
  els.labOrderWorkType.value = 'zircon'; els.labOrderWorkType.fire('change');
  ok(autoCrown === '2026-10-01' && due.value === '', 'M161: switching to a work without a source clears the stale automatic date');
  due.value = '2026-10-09'; due.fire('input'); els.labOrderWorkType.value = 'crown'; els.labOrderWorkType.fire('change'); els.labOrderWorkType.value = 'zircon'; els.labOrderWorkType.fire('change');
  ok(due.value === '2026-10-09', 'M161: a date the doctor typed survives work-type changes');
  D.reset(); due.value = ''; els.labOrderWorkType.value = 'zircon'; els.labOrderWorkType.fire('change');
  ok(due.value === '' && setupOf(els) === 'treatments.html?edit=zircon&focus=lab_days', 'M161: no template/setting/history ⇒ due left empty + deep link to that treatment\'s lab days');
  D.reset(); els.labOrderWorkType.value = '_other'; els.labOrderWorkType.fire('change');
  ok(setupOf(els) === null, 'M161: «other» work gets no setup link');
  els.labOrderWorkType.value = 'crown';
  let calls = 0;
  const sbT = { from(t) { const q = { select() { return q; }, eq() { return q; }, not() { return q; }, order() { return q; }, limit() { return Promise.resolve({ data: [], error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); }, then(r, j) { if (t === 'treatments') calls++; return Promise.resolve({ data: t === 'treatments' ? [{ treatment_key: 'crown', lab_days: 6 }, { treatment_key: 'x', lab_days: 99 }] : [], error: null }).then(r, j); } }; return q; } };
  D.open(sbT, 'U', { apptDate: () => '' }); await new Promise(r => setTimeout(r, 5)); D.open(sbT, 'U', { apptDate: () => '' }); await new Promise(r => setTimeout(r, 5));
  ok(calls === 2 && D._state.trtDays.crown === 6 && D._state.trtDays.x === null, 'M161: treatment days re-read on every open (not cached) · out-of-range ignored');

  /* ── (٣) السطحان ── */
  const L = F['labs.html'], P = F['pp-clinical.js'];
  const tpl = s => { const i = s.indexOf('/* v524: الاستحقاق = الإرسال + مهلة القالب'); return i < 0 ? '' : s.slice(i, s.indexOf('/* الملاحظات: إلحاق آمن', i)); };
  ok(tpl(L) && tpl(L) === tpl(P) && /SyLabDue\.applyTemplateDays\(tpl\.due_days\)/.test(tpl(L)) && !/new Date\(\+m\[1\]/.test(L + P), 'template block: identical on both surfaces, via applyTemplateDays, old calendar-day math gone');
  for (const [name, s] of [['labs.html', L], ['pp-clinical.js', P]]) {
    const sv = fnSrc(s, 'async function saveLabOrder() {');
    const c = sv.indexOf('SyLabDue.checkForm()'), w = sv.search(/\.from\('lab_orders'\)|_saveLabOrder|\.insert\(|\.update\(/);
    ok(c > -1 && (w === -1 || c < w) && /if \(_dueErr\) \{ showToast\('⚠️ ' \+ _dueErr\); return; \}/.test(sv), name + ': save validates the due before any write');
    const op = fnSrc(s, name === 'labs.html' ? 'function openLabOrderModal() {' : 'async function openLabOrderModal(prefill) {');
    const ed = fnSrc(s, 'async function editLabOrder(id) {');
    ok(op.indexOf('labDueOpen(true)') > -1 && op.indexOf('labDueOpen(true)') < op.indexOf("openModal('labOrderModal')"), name + ': new-order modal wires the due before opening');
    ok(ed.indexOf('labDueOpen(false)') > -1 && ed.indexOf('labDueOpen(false)') < ed.indexOf("openModal('labOrderModal')"), name + ': edit modal wires the due (no auto-fill of a saved order)');
  }
  /* حلُّ موعد التركيب مُنفَّذاً */
  const mk = v => ({ value: v });
  let ctx = { document: { getElementById: id => ctx._el[id] || null }, _el: {}, getAppointmentById: id => ({ a1: { date: '2026-10-05', status: 'confirmed' }, a2: { date: '2026-10-06', status: 'cancelled' } })[id] || null };
  vm.createContext(ctx); vm.runInContext(fnSrc(L, 'function labDueApptDate() {'), ctx);
  ctx._el.labOrderAppointment = mk('a1'); const l1 = vm.runInContext('labDueApptDate()', ctx);
  ctx._el.labOrderAppointment = mk('a2'); const l2 = vm.runInContext('labDueApptDate()', ctx);
  ok(l1 === '2026-10-05' && l2 === '', 'labs.html: linked appointment date; a cancelled one does not count');
  ctx = { document: { getElementById: id => ctx._el[id] || null }, _el: {}, toDay: () => '2026-09-29',
    upcomingAppts: [{ id: 'x0', date: '2026-09-30', status: 'cancelled' }, { id: 'x1', date: '2026-10-02', status: 'confirmed' }, { id: 'x2', date: '2026-10-09', status: 'no_show' }] };
  vm.createContext(ctx); vm.runInContext(fnSrc(P, 'function labDueApptDate() {'), ctx);
  const run = (v, nd) => { ctx._el.labOrderAppointment = mk(v); ctx._el.labNewApptDate = mk(nd || ''); return vm.runInContext('labDueApptDate()', ctx); };
  ok(run('__auto__') === '2026-10-02' && run('x2') === '' && run('x1') === '2026-10-02' && run('__new__', '2026-10-12') === '2026-10-12' && run('') === '',
     'pp: __auto__ = first live upcoming · inactive ignored · explicit id · __new__ reads the inline date · unlinked ⇒ none');

  /* ── (٤) الربط ── */
  for (const page of ['labs.html', 'patient-profile.html']) {
    const S = F[page], a = S.indexOf('<script src="lab-due.js?v='), b = S.indexOf('<script src="sy-modal.js?v=');
    const consumer = page === 'labs.html' ? S.indexOf('function labDueOpen') : S.indexOf('<script src="pp-clinical.js?v=');
    ok(a > b && b > -1 && a < consumer, page + ': lab-due.js loaded before its consumer');
    ok(!/id="ldu/.test(S), page + ': ldu- ids belong to the module');
  }
  ok(/lab-due\\\.js/.test(F['scripts/cache-bust.sh']), 'cache-bust: lab-due.js in the fleet allow-list');
  /* M161 — صفحة العلاجات */
  const TR = F['treatments.html'], M = F['migrations/161_treatment_lab_days.sql'];
  ok(/id="tLabDaysGroup" hidden>/.test(TR) && /<input type="number" id="tLabDays" min="1" max="60"/.test(TR), 'treatments: lab days field (1..60) hidden by default');
  ok(/function syncLabDaysVisibility\(\) \{[\s\S]*g\.hidden = !tg\.checked;/.test(TR) && /function openModal\(\)  \{\n  syncLabDaysVisibility\(\);/.test(TR) && /userTouchedLabToggle = true;\n  syncLabDaysVisibility\(\);/.test(TR),
     'treatments: the field follows «needs lab» on open and on toggle');
  const svT = fnSrc(TR, 'async function _saveTreatment_inner() {');
  ok(/if \(needsLab && _ldRaw !== ''\)/.test(svT) && /needs_lab: needsLab, lab_days: labDays,/.test(svT) && /needs_lab: needsLab,\n\s*lab_days: labDays,/.test(svT) && /مدّة المخبر عددُ أيامٍ من 1 إلى 60/.test(svT),
     'treatments: lab_days validated and saved on update and insert (empty when no lab)');
  ok(/lab_days: \(t\.lab_days >= 1 && t\.lab_days <= 60\) \? Number\(t\.lab_days\) : null/.test(TR) && (TR.match(/getElementById\('tLabDays'\)\.value = /g) || []).length === 3,
     'treatments: mapping keeps lab_days · add/edit/duplicate fill the field');
  ok(/loadTreatments\(\)\.then\(openEditFromQuery\)/.test(TR) && /x\.treatment_key === key/.test(TR) && /history\.replaceState/.test(TR) && /q\.get\('focus'\) === 'lab_days'/.test(TR),
     'treatments: ?edit=<key>&focus=lab_days opens that treatment (fills, never saves)');
  ok(/ADD COLUMN IF NOT EXISTS lab_days smallint/.test(M) && /CHECK \(lab_days IS NULL OR lab_days BETWEEN 1 AND 60\)/.test(M), 'M161: column + range constraint');
  const T = F['theme.css'];
  ok(/\.ldu-hint \.ldu-warn/.test(T) && /body\.sy-modal-lock #syFabDock,\s*body:has\(\.modal-overlay\.open\) #syFabDock,\s*body:has\(\.modal-overlay\.show\) #syFabDock \{ display: none !important; \}/.test(T),
     'theme.css: due hint kit + floating dock hidden while any modal is open');
  ok(/\.modal-overlay :is\(input\[type="date"\], input\[type="time"\], input\[type="datetime-local"\]\) \{\s*-webkit-appearance: none; appearance: none; min-width: 0; max-width: 100%; min-height: 42px;/.test(T) && /\.form-row > \* \{ min-width: 0; \}/.test(T),
     'theme.css: date/time inputs in any modal shrink on iOS + every .form-row cell can shrink (v525 — the modal no longer scrolls sideways)');
  ok(/\.lrd-dialog input\[type="date"\]\.lrd-due \{ -webkit-appearance: none; appearance: none; display: block; width: 100%; min-width: 0;/.test(T), 'theme.css: redo dialog date input fits on iOS (#675)');
}

const FILES = ['lab-due.js', 'labs.html', 'pp-clinical.js', 'patient-profile.html', 'scripts/cache-bust.sh', 'theme.css', 'treatments.html', 'migrations/161_treatment_lab_days.sql'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['Friday not skipped', rep('lab-due.js', 'var DEFAULT_DAYS = [0, 1, 2, 3, 4, 6];', 'var DEFAULT_DAYS = [0, 1, 2, 3, 4, 5, 6];')],
  ['cap on the appointment day itself', rep('lab-due.js', 'var cap = o.apptDate ? prevWorkDay(o.apptDate, wd) : \'\';', 'var cap = o.apptDate || \'\';')],
  ['latest instead of earliest', rep('lab-due.js', '(base < cap ? base : cap)', '(base > cap ? base : cap)')],
  ['one sample is enough', rep('lab-due.js', 'var MIN_SAMPLES = 2', 'var MIN_SAMPLES = 1')],
  ['typed date overwritten', rep('lab-due.js', "var mine = !cur || cur === due.getAttribute('data-ldu-auto');", 'var mine = true;')],
  ['check allows after the appointment', rep('lab-due.js', 'if (due && apptDate && due > apptDate)', 'if (false)')],
  ['labs.html save skips the check', rep('labs.html', "if (_dueErr) { showToast('⚠️ ' + _dueErr); return; }", '')],
  ['pp: cancelled counts', rep('pp-clinical.js', "var INACT = ['cancelled', 'broken', 'no_show', 'completed'], today = toDay();", "var INACT = ['broken'], today = toDay();")],
  ['form-row cells cannot shrink', rep('theme.css', '.form-row > * { min-width: 0; }', '')],
  ['modal date inputs keep the iOS width', rep('theme.css', '-webkit-appearance: none; appearance: none; min-width: 0; max-width: 100%; min-height: 42px;', '-webkit-appearance: none; appearance: none; max-width: 100%; min-height: 42px;')],
  ['history beats the treatment setting', rep('lab-due.js', "else if (st.trtDays[work] >= 1) { days = st.trtDays[work]; src = 'trt'; }", "else if (false) {}")],
  ['setup link for anything outside the catalogue', rep('lab-due.js', "work && Object.prototype.hasOwnProperty.call(st.trtDays, work)", 'work')],
  ['treatment days cached forever', rep('lab-due.js', 'Promise.all([load(sb, uid), loadTrt(sb, uid)])', 'Promise.all([load(sb, uid)])')],
  ['treatments save drops lab_days', rep('treatments.html', 'needs_lab: needsLab, lab_days: labDays,', 'needs_lab: needsLab,')],
  ['stale automatic date kept', rep('lab-due.js', "if (cur && cur === due.getAttribute('data-ldu-auto')) { due.value = ''; due.removeAttribute('data-ldu-auto'); }", '')],
  ['due before send accepted', rep('lab-due.js', "if (due && sent && due < sent) return", "if (false) return")],
  ['dock stays over modals', rep('theme.css', 'body:has(.modal-overlay.open) #syFabDock,', '')]
];
(async () => {
await suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const log = console.log; console.log = () => {};
    try { await suite(F2); } catch (e) { fail++; }
    console.log = log;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-lab-due: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-due: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
})();
