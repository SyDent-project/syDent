/* M222/M223 — مثبتُ دوام الأشخاص وإجازاتهم — على الملفات الحيّة.
   (١) الهجرة 222: خريطةُ الدوام بعقدٍ تتحقّق منه القاعدة · staff_leaves بعزل المالك وبوابة الاشتراك وبلا anon ·
       الموظفُ من عيادة المالك نفسِها · الأنواعُ والمدى مقيّدة.
   (٢) الهجرة 223: دالةٌ داخلية مسحوبةٌ من الجميع · البوابةُ تُغلق حين يغيب **كلُّ** طبيب أسنانٍ نشط (دوامٌ أو إجازة)
       أو تُحجب كلُّ الكراسي أو تغطّيها فترةٌ عامة · سقفُ 366 يوماً · محرّكُ بوابة المريض = M189 + فرعٌ واحد لطبيب الموعد.
   (٣) staff-leaves.js: عدُّ الأيام · الرصيد · التداخل · الخصمُ المقترح (شهرٌ بشهر على أيام الدوام).
   (٤) sched-blocks.js: «خارج الدوام» حالاتٌ مانعة باسم الطبيب للمستهلكين المانعين فقط · fail-open · لا تدخل load().
   (٥) emp-time.js على DOM وقاعدةٍ وهميين: الحفظُ بنطاق المالك · التحقّقُ يسبق الشبكة · إجازةُ الطبيب تُنشئ حجزَه
       المغلق ولا تترك حجزاً يتيماً · الحذفُ يزيل الاثنين · وضعُ القراءة يمنع.
   (٦) الرواتب: السطرُ ظاهرٌ ولا يغيّر شيئاً حتى يُضغط · مرّةٌ واحدة · بلا بياناتٍ لا سطر.
   (٧) التوصيل: الترتيب · السجلّات · الترجمة عبر المحرّك الحقيقي بلا حرفٍ عربي باقٍ.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILES = ['migrations/222_staff_hours_leaves.sql', 'migrations/223_booking_respects_doctor_hours.sql', 'migrations/189_portal_slot_picker.sql',
  'staff-leaves.js', 'emp-time.js', 'sched-blocks.js', 'appt-conflict.js', 'appt-series.js', 'appt-family.js', 'employees.html', 'payouts.html',
  'audit-log.html', 'i18n-en.js', 'theme.js', 'scripts/cache-bust.sh', 'scripts/db-bootstrap.py', 'scripts/check-mirrors.js', 'book.html'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => { const o = Object.assign({}, F); o[f] = F[f].split(a).join(b); return o; };
const AR = /[\u0600-\u06FF]/;

function fnBody(sql, name) {
  const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  if (i < 0) return '';
  const a = sql.indexOf('AS $$', i);
  return sql.slice(i, sql.indexOf('$$;', a + 5) + 3);
}
function jsFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

/* ── المحرّك الإنجليزي الحقيقي (theme.js + i18n-en.js) ── */
function engine(F) {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0, localStorage: { getItem: k => store[k] || null, setItem() {} }, location: { search: '', pathname: '/employees.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(), write() {}, querySelector: () => null, getElementById: () => null,
      addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const th = F['theme.js'], a = th.indexOf('/* ── SyI18n'), b = th.indexOf('})();', a) + 5;
  vm.runInContext(F['i18n-en.js'], ctx); vm.runInContext(th.slice(a, b), ctx);
  return s => ctx.window.SyI18n.t(s);
}

/* ── DOM + قاعدة وهميان ── */
function mkEnv(F, opt) {
  opt = opt || {};
  const els = {};
  const el = id => els[id] || (els[id] = { id, value: '', checked: false, textContent: '', innerHTML: '', disabled: false, style: {}, dataset: {},
    setAttribute() {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); } } });
  const calls = [], toasts = [], audit = [], dialogs = [];
  const db = Object.assign({ clinic_employees: [], staff_leaves: [], schedule_blocks: [], clinic_settings: [], clinic_doctors: [], appointments: [] }, JSON.parse(JSON.stringify(opt.db || {})));
  const q = table => {
    const st = { table, op: 'select', filters: {}, payload: null, head: false };
    const api = {
      select(c, o) { if (st.op === 'select') { st.cols = c; st.head = !!(o && o.head); } return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(k, v) { st.filters[k] = v; return api; }, not(k, o, v) { if (o === 'is') st.filters['!' + k] = v; return api; },
      gte() { return api; }, lte() { return api; }, order() { return api; }, limit() { return api; },
      single() { st.single = true; return api; }, maybeSingle() { st.single = true; return api; },
      then(res, rej) {
        calls.push(st);
        const rows = db[table] || (db[table] = []);
        const match = r => Object.keys(st.filters).every(k => k[0] === '!' ? r[k.slice(1)] != null : r[k] === st.filters[k]);
        let out;
        if (opt.missing && (table === 'staff_leaves' || (table === 'clinic_employees' && /work_schedule/.test(String(st.cols || '') + JSON.stringify(st.payload || '')))))
          out = { data: null, error: { code: '42P01', message: 'relation "public.staff_leaves" does not exist' } };
        else if (opt.fail && opt.fail(st)) out = { data: null, error: { message: 'network' } };
        else if (st.op === 'select') {
          const r = rows.filter(match);
          out = st.head ? { count: r.length, error: null } : { data: st.single ? (r[0] || null) : r, error: null };
        } else if (st.op === 'insert') { const n = Object.assign({ id: table.slice(0, 3) + '-' + (rows.length + 1), created_at: 'now' }, st.payload); rows.push(n); out = { data: n, error: null }; }
        else if (st.op === 'update') { const u = rows.filter(match)[0]; if (u) Object.assign(u, st.payload); out = { data: u || null, error: u ? null : { message: 'no row' } }; }
        else { db[table] = rows.filter(r => !match(r)); out = { data: null, error: null }; }
        return Promise.resolve(out).then(res, rej);
      }
    };
    return api;
  };
  const w = { sb: { from: q }, showToast: (m, e) => toasts.push(m), logAudit: (a, o) => audit.push(a), SyDentSub: { blockReadOnly: () => !!opt.readOnly },
    SyDialog: { confirm: o => { dialogs.push(o); return Promise.resolve(opt.decline ? false : true); } },
    SyDentLock: { getCurrentEmployee: () => Promise.resolve({ name: 'سكرتيرة' }) } };
  const ctx = { window: w, document: { getElementById: el }, console: { error() {}, warn() {}, log() {} }, currentUser: opt.noUser ? null : { id: 'own-1' },
    Promise, Date: opt.Date || Date, JSON, String, Number, Object, Array, Math, parseInt, RegExp, setTimeout };
  vm.createContext(ctx);
  vm.runInContext(F['staff-leaves.js'], ctx);
  if (opt.blocks) vm.runInContext(F['sched-blocks.js'], ctx);
  if (!opt.noEmpTime) vm.runInContext(F['emp-time.js'], ctx);
  return { w, el, calls, toasts, audit, dialogs, db, ctx };
}
const writes = E => E.calls.filter(c => c.op !== 'select');
const EMP_DOC = { id: 'e1', owner_id: 'own-1', name: 'د. سامر', role: 'doctor', doctor_id: 'd1', work_schedule: null, annual_leave_days: null };
const EMP_SEC = { id: 'e2', owner_id: 'own-1', name: 'ريم', role: 'secretary', doctor_id: null, work_schedule: null, annual_leave_days: 14 };
const EMP_OWN = { id: 'e3', owner_id: 'own-1', name: 'د. أحمد', role: 'owner', doctor_id: null, work_schedule: null, annual_leave_days: null };
const DB0 = { clinic_employees: [EMP_DOC, EMP_SEC, EMP_OWN], clinic_settings: [{ owner_id: 'own-1', booking_work_days: '0,1,2,3,4,6' }],
  clinic_doctors: [{ id: 'd9', owner_id: 'own-1', is_owner: true }], appointments: [{ id: 'a1', doctor_id: 'own-1', provider_id: 'd1', is_planned: false }] };
const FUT = '2099-03-0';   /* تواريخُ مستقبلية ثابتة: 2099-03-01 أحد */

async function suite(F) {
  /* ═══ (١) M222 ═══ */
  const M = F['migrations/222_staff_hours_leaves.sql'];
  ok(/CREATE OR REPLACE FUNCTION public\._work_schedule_ok\(p JSONB\)[\s\S]*?IMMUTABLE/.test(M) && /k !~ '\^\[0-6\]\$' OR jsonb_typeof\(v\) <> 'array' OR jsonb_array_length\(v\) <> 2/.test(M)
    && /\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$/.test(M) && /IF b <= a THEN RETURN false;/.test(M), 'M222: the schedule validator pins weekday keys, HH:MM pairs and end > start');
  ok(/ADD CONSTRAINT clinic_employees_work_schedule_ok CHECK \(public\._work_schedule_ok\(work_schedule\)\)/.test(M), 'M222: the column carries the validator as a CHECK (the booking functions cast safely)');
  ok(/annual_leave_days IS NULL OR annual_leave_days BETWEEN 0 AND 365/.test(M), 'M222: the allowance is bounded');
  ok(/REVOKE ALL ON FUNCTION public\._work_schedule_ok\(jsonb\) FROM PUBLIC, anon;\s+GRANT EXECUTE ON FUNCTION public\._work_schedule_ok\(jsonb\) TO authenticated, service_role;/.test(M),
    'M222: the validator is callable by the clinic session (the CHECK needs it), not by anon');
  ok(/owner_id\s+UUID NOT NULL REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE/.test(M) && /employee_id\s+UUID NOT NULL REFERENCES public\.clinic_employees\(id\) ON DELETE CASCADE/.test(M)
    && /block_id\s+UUID REFERENCES public\.schedule_blocks\(id\) ON DELETE SET NULL/.test(M), 'M222: staff_leaves references owner, employee and (softly) the calendar block');
  ok(/kind\s+TEXT NOT NULL CHECK \(kind IN \('paid', 'unpaid', 'sick', 'absence'\)\)/.test(M) && /CHECK \(date_to >= date_from AND \(date_to - date_from\) <= 366\)/.test(M)
    && /char_length\(note\) <= 200/.test(M), 'M222: kinds, range and note are constrained');
  ok(/ALTER TABLE public\.staff_leaves ENABLE ROW LEVEL SECURITY;/.test(M) && /USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/.test(M)
    && /WITH CHECK \(owner_id = \(SELECT auth\.uid\(\)\)\s+AND EXISTS \(SELECT 1 FROM public\.clinic_employees e WHERE e\.id = employee_id AND e\.owner_id = \(SELECT auth\.uid\(\)\)\)\)/.test(M),
    'M222: RLS owner-only and the employee must belong to the same clinic');
  ok(/SELECT public\._sub_guard_table\('public\.staff_leaves'\);/.test(M) && !/GRANT[^;]*\banon\b/i.test(M) && !/TO anon/i.test(M), 'M222: subscription gate on; nothing granted to anon');
  ok(!/^\s*(UPDATE|DELETE FROM|INSERT INTO)\s+public\.(payouts|ledger_sessions|payments|payment_splits)/mi.test(M) && !/payouts|payment_splits|ledger_sessions/.test(M.replace(/^--.*$/gm, '')),
    'M222: touches no payroll or ledger table');

  /* ═══ (٢) M223 ═══ */
  const B = F['migrations/223_booking_respects_doctor_hours.sql'];
  const off = fnBody(B, '_provider_off_slots'), blk = fnBody(B, 'booking_blocked_slots'), fre = fnBody(B, '_portal_free_slots');
  ok(/REVOKE ALL ON FUNCTION public\._provider_off_slots\(uuid, date, date\) FROM anon, authenticated, public;/.test(B) && !/GRANT[^;]*_provider_off_slots/.test(B), 'M223: the helper is internal — no anon/authenticated');
  ok(/STABLE SECURITY DEFINER SET search_path = public/.test(off) && /STABLE SECURITY DEFINER SET search_path = public/.test(blk), 'M223: STABLE definer functions with a pinned search_path');
  ok(/cd\.owner_id = p_clinic AND cd\.is_active IS NOT FALSE\s+AND COALESCE\(cd\.provider_type, 'doctor'\) = 'doctor'/.test(off)
    && /WHERE owner_id = p_clinic AND is_active IS NOT FALSE\s+AND COALESCE\(provider_type, 'doctor'\) = 'doctor'/.test(blk), 'M223: only active dentists of this clinic are counted, on both sides');
  ok(/e\.owner_id = p_clinic AND e\.work_schedule IS NOT NULL\s+AND \(e\.doctor_id = cd\.id OR \(cd\.is_owner AND e\.role = 'owner' AND e\.doctor_id IS NULL\)\)/.test(off), 'M223: a schedule is read inside the clinic; the owner-doctor falls back to the owner row');
  ok(/p\.sched IS NOT NULL AND NOT COALESCE\(\s+s\.t::interval >= \(\(p\.sched -> \(EXTRACT\(DOW FROM s\.d\)::int\)::text ->> 0\)::time\)::interval\s+AND s\.t::interval \+ make_interval\(mins => s\.dur\) <= \(\(p\.sched -> \(EXTRACT\(DOW FROM s\.d\)::int\)::text ->> 1\)::time\)::interval,\s+false\)/.test(off),
    'M223: a slot must sit wholly inside the doctor\'s hours; a weekday missing from the schedule = off');
  ok(/b\.doctor_id = p_clinic AND b\.blocks_scheduling\s+AND b\.provider_id IS NOT NULL AND b\.operatory_id IS NULL/.test(off) && /i\.pid = p\.id\s+AND i\.s::interval < s\.t::interval \+ make_interval\(mins => s\.dur\) AND s\.t::interval < i\.e/.test(off),
    'M223: a blocking block in the doctor\'s name closes his slots');
  ok(/WHERE EXISTS \(SELECT 1 FROM provs WHERE sched IS NOT NULL\) OR EXISTS \(SELECT 1 FROM inst\)/.test(off), 'M223: nothing to compute ⇒ the grid is never built');
  const cap = /WHERE p_from IS NOT NULL AND p_to IS NOT NULL AND p_to >= p_from AND \(p_to - p_from\) <= 366/;
  ok(cap.test(off) && cap.test(blk), 'M223: both anon-reachable grids are capped at 366 days');
  ok(/EXISTS \(SELECT 1 FROM inst i WHERE i\.d = s\.d AND i\.operatory_id IS NULL/.test(blk) && /OR \(nprov\.n > 0 AND COALESCE\(offc\.n, 0\) = nprov\.n\)/.test(blk)
    && /\(SELECT count\(\*\) FROM ops\) > 0 AND NOT EXISTS \(\s+SELECT 1 FROM ops o WHERE NOT EXISTS/.test(blk), 'M223: closed by a clinic-wide block, by EVERY dentist being off, or by every chair being blocked');
  ok(/count\(DISTINCT o\.provider_id\) AS n FROM public\._provider_off_slots\(p_clinic, p_from, p_to\) o GROUP BY 1, 2/.test(blk) && /b\.doctor_id = p_clinic AND b\.blocks_scheduling AND b\.provider_id IS NULL/.test(blk),
    'M223: the page counts off dentists per slot; doctor blocks are not double-read as clinic-wide');
  ok(/RETURNS TABLE\(d date, t time without time zone, dur integer\)/.test(blk) && /GRANT EXECUTE ON FUNCTION public\.booking_blocked_slots\(uuid, date, date\) TO anon, authenticated, service_role;/.test(B),
    'M223: booking_blocked_slots keeps its signature and grants (book.html untouched)');
  const m189 = fnBody(F['migrations/189_portal_slot_picker.sql'], '_portal_free_slots');
  const branch = "    UNION ALL   -- M223: the appointment's own doctor — outside his hours or on his leave\n    SELECT o.d, o.t, o.dur FROM public._provider_off_slots(p_owner, p_from, p_to) o\n     WHERE o.provider_id = (SELECT a.provider_id FROM public.appointments a WHERE a.id = p_appt AND a.doctor_id = p_owner)\n";
  ok(m189.length > 500 && fre.split(branch).length === 2 && fre.replace(branch, '') === m189, 'M223: the portal slot engine is Migration 189 byte-for-byte plus one branch for the appointment\'s own doctor');
  ok(/REVOKE ALL ON FUNCTION public\._portal_free_slots\(uuid, uuid, int, date, date\) FROM anon, authenticated, public;/.test(B), 'M223: the slot engine stays internal');
  ok(!/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i.test(B.replace(/^--.*$/gm, '')) && !/DROP /i.test(B.replace(/^--.*$/gm, '')), 'M223: read-only functions — no write, no drop');
  ok(F['book.html'] === base['book.html'] && !/_provider_off_slots|work_schedule/.test(F['book.html']), 'book.html is not touched');
  ok(/'migrations\/222_staff_hours_leaves\.sql'/.test(F['scripts/db-bootstrap.py']) && /'migrations\/223_booking_respects_doctor_hours\.sql'/.test(F['scripts/db-bootstrap.py']), 'both migrations are in the bootstrap plan');

  /* ═══ (٣) staff-leaves.js ═══ */
  const L = mkEnv(F, { noEmpTime: true }).w.SyStaffLeaves;
  ok(JSON.stringify(L.cleanSchedule({ 0: ['09:00', '17:00'], 7: ['09:00', '17:00'], 1: ['17:00', '09:00'], 2: ['9:00', '10:00'], 3: ['10:00'] })) === '{"0":["09:00","17:00"]}'
    && L.cleanSchedule({}) === null && L.cleanSchedule(null) === null && L.cleanSchedule([1]) === null, 'schedule: only valid days survive; nothing valid ⇒ null (follows the clinic)');
  ok(L.countDays('2026-11-01', '2026-11-30', null) === 30 && L.countDays('2026-11-01', '2026-11-30', [0, 1, 2, 3, 4, 6]) === 26 && L.countDays('2026-11-05', '2026-11-01', null) === 0
    && L.countDays('2026-02-30', '2026-03-02', null) === 0 && L.countDays('2026-10-25', '2026-11-05', null, '2026-11-01', '2026-11-30') === 5, 'countDays: weekdays, clipping, reversed and impossible dates');
  ok(L.countDays('2026-01-01', '2036-01-01', null) <= 800, 'countDays: a hostile range cannot loop for ever');
  ok(JSON.stringify(L.workDaysOf({ 2: ['09:00', '12:00'], 0: ['09:00', '12:00'] }, [6])) === '[0,2]' && JSON.stringify(L.workDaysOf(null, [6, 0])) === '[6,0]' && L.workDaysOf(null, []) === null,
    'workDaysOf: own schedule, else the clinic\'s days, else calendar days');
  const LV = [{ id: 'l1', kind: 'unpaid', date_from: '2026-11-03', date_to: '2026-11-05' }, { id: 'l2', kind: 'absence', date_from: '2026-11-30', date_to: '2026-12-01' },
    { id: 'l3', kind: 'paid', date_from: '2026-12-30', date_to: '2027-01-02' }, { id: 'l4', kind: 'sick', date_from: '2026-11-15', date_to: '2026-11-15' }];
  ok(L.paidTaken(LV, 2026, null) === 2 && L.paidTaken(LV, 2027, null) === 2 && L.paidTaken(LV, 2027, [0]) === 0, 'paidTaken: only paid leave, clipped to the year, on working days');
  ok(L.overlaps(LV, '2026-11-05', '2026-11-06') && !L.overlaps(LV, '2026-11-06', '2026-11-14') && !L.overlaps(LV, '2026-11-05', '2026-11-06', 'l1'), 'overlaps: inclusive edges; the row itself can be skipped');
  const sm = L.summary(LV, '2026-11-01', '2026-11-30', null);
  ok(sm.unpaid === 3 && sm.absence === 1 && sm.sick === 1 && sm.paid === 0 && sm.deductDays === 4, 'summary: per-kind days inside the period; only unpaid and absence are deductible');
  const d1 = L.deduction(3000000, LV, '2026-11-01', '2026-11-30', null), d2 = L.deduction(2600000, LV, '2026-11-01', '2026-11-30', [0, 1, 2, 3, 4, 6]);
  ok(d1.days === 4 && d1.baseDays === 30 && d1.amount === 400000 && d2.days === 4 && d2.baseDays === 26 && d2.amount === 400000, 'deduction: salary × absent working days ÷ working days of that month');
  const d3 = L.deduction(3100000, LV, '2026-11-01', '2026-12-31', null);
  ok(d3.days === 5 && d3.months === 2 && d3.baseDays === 0 && Math.abs(d3.amount - (3100000 * 4 / 30 + 3100000 * 1 / 31)) < 0.001, 'deduction: month by month when the period spans months');
  ok(L.deduction(1000, [{ kind: 'unpaid', date_from: '2026-01-01', date_to: '2026-12-31' }], '2026-11-01', '2026-11-30', null).amount === 1000
    && L.deduction(1000, [{ kind: 'paid', date_from: '2026-11-01', date_to: '2026-11-30' }, { kind: 'sick', date_from: '2026-11-01', date_to: '2026-11-30' }], '2026-11-01', '2026-11-30', null).amount === 0
    && L.deduction(0, LV, '2026-11-01', '2026-11-30', null).amount === 0 && L.deduction(1000, LV, '2026-11-30', '2026-11-01', null).days === 0
    && L.deduction(1000, [{ kind: 'unpaid', date_from: '2026-11-01', date_to: '2026-11-30' }, { kind: 'absence', date_from: '2026-11-10', date_to: '2026-11-20' }], '2026-11-01', '2026-11-30', null).amount === 1000,
    'deduction: never above the month\'s salary; paid and sick leave deduct nothing; no salary or a bad period ⇒ 0');
  ok(L.daysTxt(1) === '1 يوم' && L.daysTxt(3) === '3 أيام' && L.daysTxt(10) === '10 أيام' && L.daysTxt(11) === '11 يوم', 'daysTxt: Arabic plural for 3..10');
  {
    const E = mkEnv(F, { noEmpTime: true, db: { staff_leaves: [{ id: 'x', owner_id: 'own-1', employee_id: 'e1', kind: 'paid', date_from: '2026-01-01', date_to: '2026-01-01' }, { id: 'y', owner_id: 'other', employee_id: 'e9', kind: 'paid', date_from: '2026-01-01', date_to: '2026-01-01' }],
      clinic_employees: [EMP_DOC, { id: 'z', owner_id: 'other' }], clinic_settings: DB0.clinic_settings } });
    const r = await E.w.SyStaffLeaves.load('own-1', true);
    ok(r.ok && Object.keys(r.byEmp).join() === 'e1' && Object.keys(r.sched).join() === 'e1' && r.clinicDays.length === 6 && E.calls.every(c => c.op === 'select' && c.filters.owner_id === 'own-1'),
      'load: three owner-scoped reads, nothing written');
    const E2 = mkEnv(F, { noEmpTime: true, missing: true });
    ok((await E2.w.SyStaffLeaves.load('own-1', true)).ok === false, 'load: before the migration ⇒ {ok:false}, no throw');
  }

  /* ═══ (٤) sched-blocks.js ═══ */
  {
    const E = mkEnv(F, { noEmpTime: true, blocks: true, db: { clinic_employees: [Object.assign({}, EMP_DOC, { work_schedule: { 0: ['09:00', '14:00'], 1: ['09:00', '14:00'] } }),
      Object.assign({}, EMP_OWN, { work_schedule: { 0: ['16:00', '20:00'] } }), Object.assign({}, EMP_SEC, { work_schedule: { 0: ['08:00', '12:00'] } }), { id: 'zz', owner_id: 'other', doctor_id: 'dX', work_schedule: { 0: ['01:00', '02:00'] } }],
      clinic_doctors: DB0.clinic_doctors } });
    const K = E.w.SyDentBlocks;
    const map = await K.hoursMap('own-1');
    ok(Object.keys(map).sort().join() === 'd1,d9' && map.d9.name === 'د. أحمد', 'hoursMap: doctors of this clinic only; the owner row resolves to the owner-doctor; a secretary\'s hours never block appointments');
    ok(E.calls.filter(c => c.table === 'clinic_employees')[0].filters.owner_id === 'own-1' && E.calls.every(c => c.op === 'select'), 'hoursMap: owner-scoped read, nothing written');
    const inst = await K.offHours('own-1', '2026-11-22', '2026-11-24');   /* أحد · اثنين · ثلاثاء */
    const c = (date, time, prov) => K.blocking(inst, { date, time, duration: 30, provider_id: prov }).length;
    ok(c('2026-11-22', '10:00', 'd1') === 0 && c('2026-11-22', '13:45', 'd1') === 1 && c('2026-11-22', '08:30', 'd1') === 1 && c('2026-11-24', '10:00', 'd1') === 1,
      'offHours: inside = free; straddling the end, before the start and a day off = blocked');
    ok(c('2026-11-22', '16:00', 'd2') === 0 && K.blocking(inst, { date: '2026-11-24', time: '10:00', duration: 30 }).length === 0 && K.blocking(inst, { date: '2026-11-24', time: '10:00', duration: 30, operatory_id: 'K1' }).length === 0,
      'offHours: another doctor, no doctor, or a chair alone is never blocked by someone\'s hours');
    const one = K.blocking(inst, { date: '2026-11-22', time: '15:00', duration: 30, provider_id: 'd1' })[0];
    ok(one.offHours && one.blocks && /خارج دوام د\. سامر/.test(K.label(one)) && K.describeLine(one).indexOf('وقتٌ محجوز') < 0 && /يوم عطلة د\. سامر/.test(K.label(K.blocking(inst, { date: '2026-11-24', time: '10:00', duration: 30, provider_id: 'd1' })[0])),
      'offHours: the line names the doctor and his hours, or his day off');
    ok(K.scheduleOk({ 0: ['09:00', '14:00'] }) && !K.scheduleOk({ 0: ['14:00', '09:00'] }) && !K.scheduleOk({ 8: ['09:00', '14:00'] }) && !K.scheduleOk({}) && !K.scheduleOk(null) && K.offInstances({ d1: { name: 'x', sched: { 9: ['a', 'b'] } } }, '2026-11-22', '2026-11-22').length === 0,
      'offHours: a malformed map blocks nothing');
    const E3 = mkEnv(F, { noEmpTime: true, blocks: true, fail: () => true });
    const E4 = mkEnv(F, { noEmpTime: true, blocks: true }); E4.w.sb = { from() { throw new Error('offline'); } };
    let threw = false, got = null; try { got = await E4.w.SyDentBlocks.offHours('own-1', '2026-11-22', '2026-11-22'); } catch (e) { threw = true; }
    ok((await E3.w.SyDentBlocks.offHours('own-1', '2026-11-22', '2026-11-22')).length === 0 && !threw && got && got.length === 0, 'offHours: a failed or throwing read is fail-open (like the conflict guard)');
    const load = jsFn(F['sched-blocks.js'], 'load');
    ok(load && !/offHours|hoursMap|work_schedule/.test(load), 'load() is untouched — the calendar views never paint a doctor\'s hours over every chair');
  }
  ok(/var pOff = \(B && cand\.provider_id && B\.offHours\) \? B\.offHours\(doctorId, cand\.date, cand\.date\) : null;[\s\S]{0,500}?if \(pOff\) inst = inst\.concat\(got\[2\]\);\s+out\.blocks = B\.blocking\(inst, cand\);/.test(F['appt-conflict.js']),
    'conflict guard: off-hours join the blocks it already warns about');
  ok(/base\.provider_id && window\.SyDentBlocks\.offHours\) blocks = blocks\.concat\(await window\.SyDentBlocks\.offHours\(doctorId, sorted\[0\], sorted\[sorted\.length - 1\]\)\);/.test(F['appt-series.js'])
    && /base\.provider_id && window\.SyDentBlocks\.offHours\) blocks = blocks\.concat\(await window\.SyDentBlocks\.offHours\(doctorId, base\.date, base\.date\)\);/.test(F['appt-family.js']), 'series and family pre-checks read the same off-hours');
  ok(/confirmText: verb \+ ' رغم التعارض', cancelText: 'إلغاء', danger: true/.test(F['appt-conflict.js']) && /blocks\.every\(function \(i\) \{ return i\.offHours; \}\) \? 'هذا الوقتُ خارج دوام الطبيب:'/.test(F['appt-conflict.js']),
    'outside hours stays a warning with an explicit override — never a block');

  /* ═══ (٥) emp-time.js ═══ */
  const setHours = (E, on, days) => {
    E.el('stCustom').checked = on;
    [0, 1, 2, 3, 4, 5, 6].forEach(d => { const v = days && days[d]; E.el('stOn_' + d).checked = !!v; E.el('stFrom_' + d).value = v ? v[0] : '09:00'; E.el('stTo_' + d).value = v ? v[1] : '17:00'; });
  };
  {
    const E = mkEnv(F, { db: DB0 });
    await E.w.openStaffTime('e1');
    const r0 = E.calls[0];
    ok(E.el('staffTimeModal').classList.contains('show') && r0.table === 'clinic_employees' && r0.filters.id === 'e1' && r0.filters.owner_id === 'own-1' && E.calls.filter(c => c.table === 'staff_leaves')[0].filters.owner_id === 'own-1'
      && /سامر/.test(E.el('stTitle').textContent) && E.el('stCustom').checked === false, 'window: opens from owner-scoped reads; no own hours by default');
    setHours(E, true, { 0: ['10:00', '14:00'], 1: ['09:00', '17:00'] });
    await E.w.saveStaffHours();
    const u = writes(E)[0];
    ok(u && u.table === 'clinic_employees' && u.op === 'update' && u.filters.id === 'e1' && u.filters.owner_id === 'own-1' && JSON.stringify(u.payload) === '{"work_schedule":{"0":["10:00","14:00"],"1":["09:00","17:00"]}}'
      && E.audit.indexOf('employee.work_schedule') > -1, 'hours: one update of one column, scoped to owner and employee, audited');
    setHours(E, true, { 0: ['14:00', '10:00'] }); await E.w.saveStaffHours();
    setHours(E, true, { 0: ['10:00', '10:00'] }); await E.w.saveStaffHours();
    setHours(E, true, null); await E.w.saveStaffHours();
    ok(writes(E).length === 1 && E.el('stHoursErr').style.display === 'block', 'hours: end ≤ start and "no day at all" are refused before the network');
    setHours(E, false, null); await E.w.saveStaffHours();
    ok(writes(E).length === 2 && writes(E)[1].payload.work_schedule === null, 'hours: switching "own hours" off stores NULL (follows the clinic)');
  }
  {
    const E = mkEnv(F, { db: DB0 });
    await E.w.openStaffTime('e1');
    const put = (k, a, b, n) => { E.el('stLKind').value = k; E.el('stLFrom').value = a; E.el('stLTo').value = b; E.el('stLNote').value = n || ''; };
    put('paid', FUT + '1', FUT + '3', 'سفر'); await E.w.stAddLeave();
    const w = writes(E);
    ok(w.length === 2 && w[0].table === 'schedule_blocks' && w[0].payload.doctor_id === 'own-1' && w[0].payload.provider_id === 'd1' && w[0].payload.kind === 'leave' && w[0].payload.blocks_scheduling === true
      && w[0].payload.date_from === FUT + '1' && w[0].payload.date_to === FUT + '3' && w[0].payload.title.length <= 60 && !('operatory_id' in w[0].payload) && !('start_time' in w[0].payload),
      'doctor leave: an all-day closed block in his name, for exactly the leave\'s days');
    ok(w[1].table === 'staff_leaves' && w[1].payload.owner_id === 'own-1' && w[1].payload.employee_id === 'e1' && w[1].payload.kind === 'paid' && w[1].payload.block_id === E.db.schedule_blocks[0].id && w[1].payload.created_by === 'سكرتيرة'
      && E.audit.indexOf('employee.leave_add') > -1, 'doctor leave: the leave row links its block and records who entered it');
    ok(/1 موعد ضمنها/.test(E.toasts[E.toasts.length - 1]) && E.db.appointments.length === 1, 'doctor leave: appointments inside it are announced, never cancelled or moved');
    put('sick', FUT + '3', FUT + '4'); await E.w.stAddLeave();
    put('sick', FUT + '5', FUT + '4'); await E.w.stAddLeave();
    put('holiday', FUT + '6', FUT + '6'); await E.w.stAddLeave();
    put('sick', '2099-02-30', '2099-03-06'); await E.w.stAddLeave();
    ok(writes(E).length === 2 && E.el('stLeaveErr').style.display === 'block', 'leave: overlap, reversed range, unknown kind and impossible date are refused before the network');
    await E.w.stDeleteLeave(E.db.staff_leaves[0].id);
    const dl = writes(E).slice(2);
    ok(E.dialogs.length === 1 && E.dialogs[0].danger === true && dl.length === 2 && dl[0].table === 'staff_leaves' && dl[0].op === 'delete' && dl[0].filters.owner_id === 'own-1'
      && dl[1].table === 'schedule_blocks' && dl[1].filters.doctor_id === 'own-1' && E.db.staff_leaves.length === 0 && E.db.schedule_blocks.length === 0 && E.audit.indexOf('employee.leave_delete') > -1,
      'delete: confirmed, then the leave and its calendar block both go — each scoped to the owner');
  }
  {
    const E = mkEnv(F, { db: DB0, decline: true });
    E.db.staff_leaves.push({ id: 'k1', owner_id: 'own-1', employee_id: 'e1', kind: 'paid', date_from: FUT + '1', date_to: FUT + '1', block_id: null });
    await E.w.openStaffTime('e1'); await E.w.stDeleteLeave('k1');
    ok(writes(E).length === 0 && E.db.staff_leaves.length === 1, 'delete: declining the dialog deletes nothing');
  }
  {
    const E = mkEnv(F, { db: DB0, fail: st => st.table === 'staff_leaves' && st.op === 'insert' });
    await E.w.openStaffTime('e1');
    E.el('stLKind').value = 'unpaid'; E.el('stLFrom').value = FUT + '1'; E.el('stLTo').value = FUT + '2';
    await E.w.stAddLeave();
    ok(E.db.schedule_blocks.length === 0 && E.db.staff_leaves.length === 0 && E.el('stLeaveErr').style.display === 'block' && !/تم تسجيل/.test(E.toasts.join()), 'doctor leave: a failed leave removes the block it had just created — no orphan closes the calendar');
  }
  {
    const E = mkEnv(F, { db: DB0, fail: st => st.table === 'schedule_blocks' && st.op === 'insert' });
    await E.w.openStaffTime('e1');
    E.el('stLKind').value = 'unpaid'; E.el('stLFrom').value = FUT + '1'; E.el('stLTo').value = FUT + '2';
    await E.w.stAddLeave();
    ok(E.db.staff_leaves.length === 0 && E.el('stLeaveErr').style.display === 'block', 'doctor leave: no block ⇒ no leave is recorded as if the calendar were closed');
  }
  {
    const E = mkEnv(F, { db: DB0 });
    await E.w.openStaffTime('e2');
    E.el('stLKind').value = 'absence'; E.el('stLFrom').value = FUT + '1'; E.el('stLTo').value = FUT + '1';
    await E.w.stAddLeave();
    ok(writes(E).length === 1 && writes(E)[0].table === 'staff_leaves' && writes(E)[0].payload.block_id === null && E.el('stDocNote').style.display === 'none', 'non-doctor: a leave never touches the calendar');
    E.el('stAllow').value = '21'; await E.w.saveStaffAllowance();
    const a = writes(E)[1];
    ok(a && a.table === 'clinic_employees' && a.filters.id === 'e2' && a.filters.owner_id === 'own-1' && JSON.stringify(a.payload) === '{"annual_leave_days":21}', 'allowance: one column, owner-scoped');
    for (const bad of ['-1', '366', '3.5', 'abc']) { E.el('stAllow').value = bad; await E.w.saveStaffAllowance(); }
    ok(writes(E).length === 2, 'allowance: out-of-range and non-integers are refused');
  }
  {
    const E = mkEnv(F, { db: DB0 });
    await E.w.openStaffTime('e3');
    E.el('stLKind').value = 'paid'; E.el('stLFrom').value = FUT + '1'; E.el('stLTo').value = FUT + '1';
    await E.w.stAddLeave();
    ok(writes(E)[0].table === 'schedule_blocks' && writes(E)[0].payload.provider_id === 'd9' && E.calls.some(c => c.table === 'clinic_doctors' && c.filters.owner_id === 'own-1' && c.filters.is_owner === true),
      'owner without a doctor link: his leave closes the owner-doctor\'s calendar');
  }
  {
    const E = mkEnv(F, { db: DB0 });
    await E.w.openStaffTime('e1');
    E.el('stLKind').value = 'sick'; E.el('stLFrom').value = '2020-01-05'; E.el('stLTo').value = '2020-01-06';
    await E.w.stAddLeave();
    ok(writes(E).length === 1 && writes(E)[0].table === 'staff_leaves' && writes(E)[0].payload.block_id === null, 'doctor leave in the past: recorded for payroll, no calendar block');
  }
  {
    const E = mkEnv(F, { db: DB0, readOnly: true });
    await E.w.openStaffTime('e1');
    ok(E.calls.length === 0 && !E.el('staffTimeModal').classList.contains('show'), 'read-only account: the window never opens');
    const E2 = mkEnv(F, { db: DB0 }); await E2.w.openStaffTime('e1'); E2.w.SyDentSub.blockReadOnly = () => true;
    setHours(E2, true, { 0: ['10:00', '14:00'] }); await E2.w.saveStaffHours();
    E2.el('stLKind').value = 'paid'; E2.el('stLFrom').value = FUT + '1'; E2.el('stLTo').value = FUT + '1'; await E2.w.stAddLeave();
    E2.el('stAllow').value = '5'; await E2.w.saveStaffAllowance();
    ok(writes(E2).length === 0, 'read-only account: every write path is refused even with the window open');
    const E3 = mkEnv(F, { db: DB0, missing: true }); await E3.w.openStaffTime('e1');
    ok(!E3.el('staffTimeModal').classList.contains('show') && /غير متاحة بعد/.test(E3.toasts[0] || ''), 'before the migration: a clear message, no window, no throw');
    const E4 = mkEnv(F, { db: DB0 }); await E4.w.openStaffTime('nope');
    ok(!E4.el('staffTimeModal').classList.contains('show'), 'an employee of another clinic (or none) opens nothing');
  }
  ok(!/addEventListener\(/.test(F['emp-time.js'].replace(/\/\*[\s\S]*?\*\//g, '')) && !/addEventListener\(/.test(F['staff-leaves.js']) && !/\b(payouts|ledger_sessions|payments)\b/.test(F['emp-time.js'].replace(/\/\*[\s\S]*?\*\//g, '')),
    'the modules add no listeners and write to no payroll table');
  ok(/esc\(KINDS\[l\.kind\] \|\| l\.kind\)/.test(F['emp-time.js']) && /'<span class="st-leave-n">' \+ esc\(l\.note\) \+ '<\/span>'/.test(F['emp-time.js']) && /byId\('stTitle'\)\.textContent = /.test(F['emp-time.js']),
    'free text (note, name) is escaped or set as textContent');

  /* ═══ (٦) الرواتب ═══ */
  {
    const P = F['payouts.html'];
    const src = ['_fmtAmt', '_providerSalaryCur', 'leaveDeductionFor', 'updateLeaveHint', 'applyLeaveDeduction'].map(n => jsFn(P, n)).join('\n');
    const mk = (leaves) => {
      const E = mkEnv(F, { noEmpTime: true });
      const c = E.ctx;
      c.$ = E.el; c.showToast = m => E.toasts.push(m);
      c.SyDentCurBag = { lblOf: x => x === 'USD' ? '$' : 'ل.س' };
      c.window.SyDentPayroll = { roundCur: (v, x) => x === 'USD' ? Math.round(v * 100) / 100 : Math.round(v) };
      c.window.SyDentCurPick = { set: (id, x) => { c.__cur = x; } };
      c._payModalCur = () => c.__cur || 'SYP';
      c.onBreakdownChange = () => { E.el('fldAmount').value = String((Number(E.el('fldSalary').value) || 0) + (Number(E.el('fldShare').value) || 0)); };
      c.doctors = [{ id: 'd1', employeeId: 'e1', compensation_model: 'salary', monthly_salary: 2600000, salary_currency: 'SYP' },
        { id: 'd2', employeeId: 'e2', compensation_model: 'percentage', monthly_salary: null }, { id: 'd3', employeeId: null, compensation_model: 'salary', monthly_salary: 5 }];
      c.staffLeaves = leaves;
      vm.runInContext(src, c);
      E.set = (prov, a, b) => { E.el('fldProvider').value = prov; E.el('fldPeriodStart').value = a; E.el('fldPeriodEnd').value = b; c.updateLeaveHint(); };
      return E;
    };
    const DATA = { ok: true, clinicDays: [0, 1, 2, 3, 4, 6], sched: {}, byEmp: { e1: LV, e2: [{ kind: 'absence', date_from: '2026-11-08', date_to: '2026-11-08' }] } };
    const E = mk(DATA);
    E.el('hintSuggest').dataset.salary = '2600000'; E.el('hintSuggest').dataset.share = '0';
    E.set('d1', '2026-11-01', '2026-11-30');
    const t = E.el('hintLeave').textContent;
    ok(E.el('hintLeave').style.display === 'block' && /غياب 1/.test(t) && /إجازة غير مدفوعة 3/.test(t) && /إجازة مرضية 1/.test(t) && /خصم مقترح: 400,000 ل\.س \(4 من 26 يوم دوام بالشهر\)/.test(t) && E.el('hintLeave').dataset.amount === '400000',
      'payout: the line lists the days and suggests 4/26 of the salary');
    ok(E.el('fldAmount').value === '' && E.el('fldSalary').value === '' && E.el('fldNotes').value === '' && E.calls.length === 0, 'payout: showing the line changes no field and writes nothing');
    E.ctx.applyLeaveDeduction();
    ok(E.el('fldSalary').value === 2200000 && E.el('fldAmount').value === '2200000' && E.el('breakdownSection').classList.contains('open') && /^خصم غياب\/إجازة غير مدفوعة: 4 أيام \(−400,000 ل\.س\)$/.test(E.el('fldNotes').value),
      'payout: the click deducts from the salary line, opens the breakdown and writes the note');
    E.ctx.applyLeaveDeduction(); E.ctx.updateLeaveHint(); E.ctx.applyLeaveDeduction();
    ok(E.el('fldSalary').value === 2200000 && E.el('fldNotes').value.split('خصم غياب').length === 2, 'payout: never deducted twice — not even after the line refreshes');
    const U = mk(DATA); U.el('fldSalary').value = '1000000'; U.set('d1', '2026-11-01', '2026-11-30'); U.ctx.__cur = 'USD'; U.ctx.applyLeaveDeduction();
    ok(U.el('fldSalary').value === '1000000' && U.el('fldNotes').value === '', 'payout: a deduction in another currency is refused, not converted');
    const Z = mk(DATA); Z.set('d1', '2026-11-01', '2026-11-30'); Z.ctx.applyLeaveDeduction();
    ok(Z.el('fldSalary').value === '' && Z.el('fldNotes').value === '' && /راتب أساسي/.test(Z.toasts.join()), 'payout: nothing to deduct from ⇒ asks for the base salary, changes nothing');
    const S2 = mk(DATA); S2.el('fldSalary').value = '300000'; S2.set('d1', '2026-11-01', '2026-11-30'); S2.ctx.applyLeaveDeduction();
    ok(S2.el('fldSalary').value === '' && /−300,000/.test(S2.el('fldNotes').value), 'payout: the salary line never goes negative');
    E.el('fldNotes').value = ''; E.set('d2', '2026-11-01', '2026-11-30');
    ok(/غياب 1/.test(E.el('hintLeave').textContent) && !/خصم/.test(E.el('hintLeave').textContent) && E.el('hintLeave').dataset.amount === '0', 'payout: a percentage-only person sees the days, no deduction');
    E.set('d1', '2026-08-01', '2026-08-31'); const none1 = E.el('hintLeave').style.display;
    E.set('d3', '2026-11-01', '2026-11-30'); const none2 = E.el('hintLeave').style.display;
    const N = mk(null); N.set('d1', '2026-11-01', '2026-11-30');
    const N2 = mk({ ok: false, byEmp: {}, sched: {}, clinicDays: [] }); N2.set('d1', '2026-11-01', '2026-11-30');
    ok(none1 === 'none' && none2 === 'none' && N.el('hintLeave').style.display === 'none' && N2.el('hintLeave').style.display === 'none', 'payout: no leave in the period, no employee row, or no data ⇒ no line');
    ok(/function updateSuggestion\(\) \{\s+_updateSuggestionCore\(\);\s+updateLeaveHint\(\);\s+\}/.test(P) && !/leaveDeductionFor|staffLeaves|hintLeave/.test(jsFn(P, 'computeSuggestion') + jsFn(P, '_updateSuggestionCore') + jsFn(P, 'savePayout')),
      'payout: the suggestion, its amount and the save path never read leaves — the deduction exists only as the visible line');
    ok(/el\.textContent = txt;/.test(jsFn(P, 'updateLeaveHint')) && !/innerHTML/.test(jsFn(P, 'updateLeaveHint') + jsFn(P, 'applyLeaveDeduction')), 'payout: the line is plain text');
    ok(/loadSessions\(\),\s+loadLeaves\(\)/.test(P) && /catch \(e\) \{ staffLeaves = null; \}/.test(P) && /id="hintLeave" onclick="applyLeaveDeduction\(\)" style="display:none;"/.test(P), 'payout: leaves load with the page, failure-tolerant; the line starts hidden');
  }

  /* ═══ (٧) التوصيل ═══ */
  const H = F['employees.html'];
  const iL = H.indexOf('<script src="staff-leaves.js?v='), iE = H.indexOf('<script src="emp-time.js?v='), iS = H.indexOf('<script src="sy-modal.js?v=');
  ok(iS > -1 && iL > iS && iE > iL && H.split('emp-time.js?v=').length === 2 && H.split('staff-leaves.js?v=').length === 2, 'employees page: logic before the window module, each loaded once, after the dialog kit');
  const tok = (H.match(/<script src="sidebar\.js\?v=(\w+)"/) || [])[1];
  ok(tok && H.indexOf('staff-leaves.js?v=' + tok + '"') > -1 && H.indexOf('emp-time.js?v=' + tok + '"') > -1 && F['payouts.html'].indexOf('staff-leaves.js?v=' + (F['payouts.html'].match(/<script src="sidebar\.js\?v=(\w+)"/) || [])[1] + '"') > -1,
    'both modules carry the fleet cache token');
  ok(/emp-time\\\.js\|staff-leaves\\\.js\|/.test(F['scripts/cache-bust.sh']) && F['scripts/cache-bust.sh'].split('emp-time\\.js|').length === 3, 'cache-bust knows both modules (both regexes)');
  ok(/var timeBtn = '<button class="sy-act" onclick="openStaffTime\(\\'' \+ e\.id \+ '\\'\)">/.test(H) && /openOwnerPinModal\(\)">🔐 تغيير رقم سرّي<\/button>' \+ timeBtn;/.test(H) && /✏️ تعديل<\/button>' \+ timeBtn \+/.test(H),
    'every staff card — the owner\'s too — carries the button');
  ['staffTimeModal', 'stTab_hours', 'stTab_leaves', 'stPane_hours', 'stPane_leaves', 'stCustom', 'stDays', 'stHoursErr', 'stSaveHours', 'stAllow', 'stBalance', 'stCountNote', 'stLKind', 'stLFrom', 'stLTo', 'stLNote', 'stDocNote', 'stLeaveErr', 'stAddLeave', 'stLeaves', 'stTitle', 'stHoursHint']
    .forEach(id => ok(H.split('id="' + id + '"').length === 2, 'employees page: #' + id + ' exists once'));
  ok(/\[onclick\*="openStaffTime\("\]/.test(H) && /\[onclick\*="saveStaffHours\("\]/.test(H) && /\[onclick\*="stAddLeave\("\]/.test(H) && /\[onchange\*="saveStaffAllowance\("\]/.test(H), 'read-only mode hides every write control of the window');
  ok(/'employee\.work_schedule', 'employee\.leave_add', 'employee\.leave_delete'\]/.test(F['audit-log.html']) && /'patient\.consent_sign', 'patient\.consent_void'\]/.test(F['audit-log.html']) && /'settings\.consent_template'\]/.test(F['audit-log.html']),
    'the audit log filters list the new actions (and the consent ones)');
  /* الترجمة: كلُّ ما تبنيه الوحدات يمرّ بالمحرّك الحقيقي بلا حرفٍ عربي باقٍ (الأسماء والملاحظات نصُّ المستخدم) */
  {
    const t = engine(F);
    const fixed = ['🕘 الدوام والإجازات', 'حفظ الدوام', 'تم حفظ الدوام ✓', 'صار يتبع دوام العيادة ✓', 'تُعدّ أيام الدوام فقط.', 'تُعدّ الأيام التقويمية (لا دوام محدَّد).', 'لا إجازات ولا غيابات مسجَّلة.', '📅 مغلق على التقويم',
      'إجازة مدفوعة', 'إجازة غير مدفوعة', 'إجازة مرضية', 'غياب', 'اختر نوع الإجازة.', 'أدخل تاريخ البداية والنهاية.', 'تاريخ النهاية قبل البداية.', 'المدّة أطول من سنة.', 'لهذا الشخص إجازةٌ أو غيابٌ مسجَّل ضمن هذه الفترة.',
      'حذف الإجازة', 'تم حذف الإجازة ✓', '⚠️ الرصيد السنوي رقمٌ بين 0 و365', 'تم حفظ الرصيد السنوي ✓', 'الخصم مطبَّق على هذه الدفعة', '⚠️ أدخل «راتب أساسي» بالتفصيل أولاً ليُخصم منه', '⚠️ الخصم محسوب بعملة الراتب — عملة الدفعة مختلفة',
      'اختر يوم دوام واحداً على الأقل، أو أوقف «دوام خاص» ليتبع دوام العيادة.', '⚠️ الدوام والإجازات غير متاحة بعد على هذا الحساب', 'جارٍ الحفظ…', 'تسجيل',
      'المأخوذ هذه السنة: 3 أيام إجازة مدفوعة', 'المأخوذ هذه السنة: 12 · الباقي: -1 من 11', '03/11/2026 · 1 يوم', '03/11/2026 ← 05/11/2026 · 3 أيام', 'تم تسجيل إجازة مرضية ✓',
      '⚠️ سُجّلت الإجازة — للطبيب 2 موعد ضمنها: راجعها من صفحة المواعيد', 'سيُحذف سجلّ «غياب» (03/11/2026 ← 03/11/2026). متابعة؟', 'سيُحذف سجلّ «إجازة مدفوعة» (03/11/2026 ← 05/11/2026) ويُفتح تقويم الطبيب في هذه الفترة. متابعة؟',
      'أدخل وقت البداية والنهاية ليوم السبت', 'نهاية دوام الأحد يجب أن تكون بعد بدايته.', 'تم خصم 400,000 ل.س من الراتب — راجع المبلغ قبل الحفظ',
      '🏖 أيام ضمن الفترة: غياب 1 · إجازة غير مدفوعة 3 · إجازة مدفوعة 2 · إجازة مرضية 1\n💡 خصم مقترح: 400,000 ل.س (4 من 26 يوم دوام بالشهر) — اضغط لخصمه من الراتب',
      '🏖 أيام ضمن الفترة: غياب 5\n💡 خصم مقترح: 120.5 $ (5 أيام) — اضغط لخصمه من الراتب', '🏖 أيام ضمن الفترة: إجازة مدفوعة 12', 'خصم غياب/إجازة غير مدفوعة: 4 أيام (−400,000 ل.س)'];
    const left = fixed.filter(s => { const r = t(s); return !r || AR.test(r); });
    ok(left.length === 0, 'English engine: every built string translates with no Arabic left — ' + left.slice(0, 2).join(' | '));
    const nums = s => (s.match(/\d+(?:[.,]\d+)*/g) || []).join(' ');
    ok(fixed.every(s => nums(t(s) || '') === nums(s)), 'English engine: every number survives translation unchanged');
    ok(/Left: -1 of 11/.test(t('المأخوذ هذه السنة: 12 · الباقي: -1 من 11')) && /4 of 26 working days/.test(t(fixed[fixed.length - 4])) && t('🕘 الدوام والإجازات: د. سامر') === '🕘 Hours & leave: د. سامر', 'English engine: pinned wordings; a person\'s name is left as typed');
  }
}

const MUTANTS = [
  ['schedule accepts weekday 7', rep('migrations/222_staff_hours_leaves.sql', "IF k !~ '^[0-6]$' OR", "IF k !~ '^[0-7]$' OR")],
  ['schedule accepts end before start', rep('migrations/222_staff_hours_leaves.sql', '    IF b <= a THEN RETURN false; END IF;\n', '')],
  ['validator left open to anon', rep('migrations/222_staff_hours_leaves.sql', 'REVOKE ALL ON FUNCTION public._work_schedule_ok(jsonb) FROM PUBLIC, anon;', '')],
  ['clinic session cannot run the CHECK', rep('migrations/222_staff_hours_leaves.sql', 'GRANT EXECUTE ON FUNCTION public._work_schedule_ok(jsonb) TO authenticated, service_role;', 'GRANT EXECUTE ON FUNCTION public._work_schedule_ok(jsonb) TO service_role;')],
  ['schedule column unchecked', rep('migrations/222_staff_hours_leaves.sql', 'CHECK (public._work_schedule_ok(work_schedule))', 'CHECK (true)')],
  ['leave for another clinic\'s employee', rep('migrations/222_staff_hours_leaves.sql', "\n                  AND EXISTS (SELECT 1 FROM public.clinic_employees e WHERE e.id = employee_id AND e.owner_id = (SELECT auth.uid()))", '')],
  ['leaves without the subscription gate', rep('migrations/222_staff_hours_leaves.sql', "SELECT public._sub_guard_table('public.staff_leaves');", '')],
  ['leaves without RLS', rep('migrations/222_staff_hours_leaves.sql', 'ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;', '')],
  ['leaves readable by anon', rep('migrations/222_staff_hours_leaves.sql', 'COMMIT;', 'GRANT SELECT ON public.staff_leaves TO anon;\nCOMMIT;')],
  ['unknown leave kind stored', rep('migrations/222_staff_hours_leaves.sql', "CHECK (kind IN ('paid', 'unpaid', 'sick', 'absence'))", "CHECK (kind <> '')")],
  ['deleting the block deletes the leave', rep('migrations/222_staff_hours_leaves.sql', 'REFERENCES public.schedule_blocks(id) ON DELETE SET NULL', 'REFERENCES public.schedule_blocks(id) ON DELETE CASCADE')],
  ['helper callable by anon', rep('migrations/223_booking_respects_doctor_hours.sql', 'REVOKE ALL ON FUNCTION public._provider_off_slots(uuid, date, date) FROM anon, authenticated, public;', 'GRANT EXECUTE ON FUNCTION public._provider_off_slots(uuid, date, date) TO anon;')],
  ['chair assistant keeps the page open', rep('migrations/223_booking_respects_doctor_hours.sql', "\n               AND COALESCE(provider_type, 'doctor') = 'doctor'),", '),')],
  ['schedules read across clinics', rep('migrations/223_booking_respects_doctor_hours.sql', 'WHERE e.owner_id = p_clinic AND e.work_schedule IS NOT NULL', 'WHERE e.work_schedule IS NOT NULL')],
  ['day off treated as available', rep('migrations/223_booking_respects_doctor_hours.sql', "interval,\n          false))", "interval,\n          true))")],
  ['slot may overrun the doctor\'s end', rep('migrations/223_booking_respects_doctor_hours.sql', "AND s.t::interval + make_interval(mins => s.dur) <= ((p.sched", "AND s.t::interval <= ((p.sched")],
  ['one dentist off closes the page', rep('migrations/223_booking_respects_doctor_hours.sql', 'OR (nprov.n > 0 AND COALESCE(offc.n, 0) = nprov.n)', 'OR (nprov.n > 0 AND COALESCE(offc.n, 0) > 0)')],
  ['doctor leave ignored online', rep('migrations/223_booking_respects_doctor_hours.sql', "      OR EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.pid = p.id\n                   AND i.s::interval < s.t::interval + make_interval(mins => s.dur) AND s.t::interval < i.e);", ';')],
  ['unbounded anon grid', rep('migrations/223_booking_respects_doctor_hours.sql', ' AND (p_to - p_from) <= 366', '')],
  ['clinic-wide block no longer closes', rep('migrations/223_booking_respects_doctor_hours.sql', "     EXISTS (SELECT 1 FROM inst i WHERE i.d = s.d AND i.operatory_id IS NULL\n               AND i.s::interval < s.t::interval + make_interval(mins => s.dur) AND s.t::interval < i.e)\n     -- (b)", "     false\n     -- (b)")],
  ['portal engine loses a busy source', rep('migrations/223_booking_respects_doctor_hours.sql', "       AND r.appointment_id IS DISTINCT FROM p_appt\n", '')],
  ['portal engine ignores the appointment\'s doctor', rep('migrations/223_booking_respects_doctor_hours.sql', "     WHERE o.provider_id = (SELECT a.provider_id FROM public.appointments a WHERE a.id = p_appt AND a.doctor_id = p_owner)\n", '')],
  ['portal engine reads another clinic\'s appointment', rep('migrations/223_booking_respects_doctor_hours.sql', 'WHERE a.id = p_appt AND a.doctor_id = p_owner)', 'WHERE a.id = p_appt)')],
  ['slot engine opened to anon', rep('migrations/223_booking_respects_doctor_hours.sql', 'REVOKE ALL ON FUNCTION public._portal_free_slots(uuid, uuid, int, date, date) FROM anon, authenticated, public;', '')],
  ['migration writes data', rep('migrations/223_booking_respects_doctor_hours.sql', 'COMMIT;', "UPDATE public.clinic_settings SET booking_enabled = true;\nCOMMIT;")],
  ['migration not in the plan', rep('scripts/db-bootstrap.py', "    'migrations/223_booking_respects_doctor_hours.sql',", "    # 'migrations/223',")],
  ['countDays ignores weekdays', rep('staff-leaves.js', "if (!workDays || !workDays.length || workDays.indexOf(d.getDay()) !== -1) n++;", 'n++;')],
  ['countDays unbounded', rep('staff-leaves.js', 's <= b && guard < 800;', 's <= b;')],
  ['paid leave deducted', rep('staff-leaves.js', 'var DEDUCT = { unpaid: 1, absence: 1 };', 'var DEDUCT = { unpaid: 1, absence: 1, paid: 1 };')],
  ['deduction on 30 days regardless of the month', rep('staff-leaves.js', 'var base = countDays(ms, me, workDays);', 'var base = 30;')],
  ['deduction above the salary', rep('staff-leaves.js', '      if (abs > base) abs = base;\n', '')],
  ['balance counts every kind', rep('staff-leaves.js', "if (l.kind === 'paid') n += countDays(l.date_from, l.date_to, workDays, lo, hi);", 'n += countDays(l.date_from, l.date_to, workDays, lo, hi);')],
  ['leaves read without the owner scope', rep('staff-leaves.js', ".select('id, employee_id, kind, date_from, date_to').eq('owner_id', uid)", ".select('id, employee_id, kind, date_from, date_to')")],
  ['hours read without the owner scope', rep('sched-blocks.js', ".eq('owner_id', doctorId).not('work_schedule', 'is', null)", ".not('work_schedule', 'is', null)")],
  ['a secretary\'s hours block appointments', rep('sched-blocks.js', 'return scheduleOk(e.work_schedule) && (e.doctor_id || e.role === \'owner\'); });', 'return scheduleOk(e.work_schedule); });\n        rows.forEach(function (e) { if (!e.doctor_id && e.role !== \'owner\') e.doctor_id = \'d2\'; });')],
  ['off-hours block every doctor', rep('sched-blocks.js', "operatory_id: null, provider_id: pid, blocks: true, offHours: true });", "operatory_id: null, provider_id: null, blocks: true, offHours: true });")],
  ['day off treated as a working day', rep('sched-blocks.js', "if (!v) { mk(0, 1440, 'يوم عطلة' + who, true); continue; }", 'if (!v) continue;')],
  ['time after the end is free', rep('sched-blocks.js', '        if (b < 1440) mk(b, 1440, t, false);\n', '')],
  ['failed hours read throws', rep('sched-blocks.js', "} catch (e) { console.warn('SyDentBlocks.hoursMap:', e); return {}; }", '} catch (e) { throw e; }')],
  ['hours painted on every chair', rep('sched-blocks.js', "      return r.data || [];\n    } catch (e) { console.warn('SyDentBlocks.load:', e); return []; }", "      return (r.data || []).concat(await offHours(doctorId, from, to));\n    } catch (e) { console.warn('SyDentBlocks.load:', e); return []; }")],
  ['conflict guard ignores hours', rep('appt-conflict.js', "        if (pOff) inst = inst.concat(got[2]);\n", '')],
  ['series pre-check ignores hours', rep('appt-series.js', "blocks = blocks.concat(await window.SyDentBlocks.offHours(doctorId, sorted[0], sorted[sorted.length - 1]));", ';')],
  ['family pre-check ignores hours', rep('appt-family.js', "blocks = blocks.concat(await window.SyDentBlocks.offHours(doctorId, base.date, base.date));", ';')],
  ['hours update not scoped to the owner', rep('emp-time.js', ".update({ work_schedule: map }).eq('id', S.emp.id).eq('owner_id', u)", ".update({ work_schedule: map }).eq('id', S.emp.id)")],
  ['employee read not scoped to the owner', rep('emp-time.js', ".select('id, name, role, doctor_id, work_schedule, annual_leave_days').eq('id', empId).eq('owner_id', u)", ".select('id, name, role, doctor_id, work_schedule, annual_leave_days').eq('id', empId)")],
  ['reversed hours saved', rep('emp-time.js', "        if (b <= a) return failHours('نهاية دوام ' + DAYS[i][1] + ' يجب أن تكون بعد بدايته.');\n", '')],
  ['empty schedule saved as "works never"', rep('emp-time.js', "      if (!Object.keys(map).length) return failHours(", "      if (false) return failHours(")],
  ['overlapping leave accepted', rep('emp-time.js', "    if (overlaps(S.leaves, from, to)) return failLeave(", "    if (false) return failLeave(")],
  ['reversed leave sent', rep('emp-time.js', "    if (to < from) return failLeave('تاريخ النهاية قبل البداية.');\n", '')],
  ['doctor leave leaves the calendar open', rep('emp-time.js', 'if (S.providerId && to >= today) {', 'if (false) {')],
  ['leave block closes the whole clinic', rep('emp-time.js', "          provider_id: S.providerId, blocks_scheduling: true, notes: note })", "          blocks_scheduling: true, notes: note })")],
  ['orphan block after a failed leave', rep('emp-time.js', "        if (blockId) { try { await window.sb.from('schedule_blocks').delete().eq('id', blockId).eq('doctor_id', u); } catch (e3) {} }\n", '')],
  ['leave recorded although the block failed', rep('emp-time.js', "        if (b.error) throw b.error;\n        blockId = b.data.id;", "        blockId = b.data ? b.data.id : null;")],
  ['failed leave claims success', rep('emp-time.js', "      if (r.error) {\n        if (blockId)", "      if (false) {\n        if (blockId)")],
  ['past leave closes the calendar', rep('emp-time.js', 'if (S.providerId && to >= today) {', 'if (S.providerId) {')],
  ['leave delete not scoped to the owner', rep('emp-time.js', ".from('staff_leaves').delete().eq('id', id).eq('owner_id', u);", ".from('staff_leaves').delete().eq('id', id);")],
  ['leave deleted without asking', rep('emp-time.js', "if (!window.SyDialog || !await window.SyDialog.confirm({", "if (false && !await window.SyDialog.confirm({")],
  ['deleted leave keeps the calendar closed', rep('emp-time.js', "      if (l.block_id) {\n        var b = await", "      if (false) {\n        var b = await")],
  ['owner\'s leave closes nothing', rep('emp-time.js', "if (!S.providerId && S.emp.role === 'owner') {", 'if (false) {')],
  ['window opens in read-only mode', rep('emp-time.js', "  async function open(empId) {\n    if (readOnly()) return;", '  async function open(empId) {')],
  ['hours saved in read-only mode', rep('emp-time.js', 'if (S.busy || !S.emp || readOnly()) return;\n    var u = uid(); if (!u) return;\n    var map = null;', 'if (S.busy || !S.emp) return;\n    var u = uid(); if (!u) return;\n    var map = null;')],
  ['leave added in read-only mode', rep('emp-time.js', "if (S.busy || !S.emp || readOnly()) return;\n    var u = uid(); if (!u) return;\n    var kind", "if (S.busy || !S.emp) return;\n    var u = uid(); if (!u) return;\n    var kind")],
  ['allowance accepts 3.5 days', rep('emp-time.js', " || String(v) !== raw)) {", ")) {")],
  ['note rendered as HTML', rep('emp-time.js', "'<span class=\"st-leave-n\">' + esc(l.note) + '</span>'", "'<span class=\"st-leave-n\">' + l.note + '</span>'")],
  ['deduction applied silently', rep('payouts.html', "  el.textContent = txt;\n  el.style.display = 'block';\n}", "  el.textContent = txt;\n  el.style.display = 'block';\n  if (r.amount > 0) applyLeaveDeduction();\n}")],
  ['deduction hidden inside the suggestion', rep('payouts.html', "    salaryPart = Math.max(0, PR.roundCur(salaryDue - salaryPaid, sugCur));", "    salaryPart = Math.max(0, PR.roundCur(salaryDue - salaryPaid - ((leaveDeductionFor(provider, periodStart, periodEnd) || {}).amount || 0), sugCur));")],
  ['deduction applied twice', rep('payouts.html', "  if (el.dataset.applied === '1' || $('fldNotes').value.indexOf('خصم غياب/إجازة غير مدفوعة:') !== -1) { showToast('الخصم مطبَّق على هذه الدفعة'); return; }\n", '')],
  ['note overstates what was deducted', rep('payouts.html', "' (−' + _fmtAmt(Math.min(ded, base))", "' (−' + _fmtAmt(ded)")],
  ['deduction without a note', rep('payouts.html', "  if (cur.indexOf('خصم غياب/إجازة غير مدفوعة:') === -1) $('fldNotes').value = cur ? cur + '\\n' + note : note;\n", '')],
  ['percentage-only person gets a deduction', rep('payouts.html', "var salaried = (cm === 'salary' || cm === 'hybrid') && monthly > 0;", "var salaried = true; monthly = monthly || 1000000;")],
  ['deduction across currencies', rep('payouts.html', "    showToast('⚠️ الخصم محسوب بعملة الراتب — عملة الدفعة مختلفة', true); return;", "    showToast('x');")],
  ['line not refreshed with the period', rep('payouts.html', "  _updateSuggestionCore();\n  updateLeaveHint();", "  _updateSuggestionCore();")],
  ['a failed leave read breaks the page', rep('payouts.html', "  catch (e) { staffLeaves = null; }", "  catch (e) { throw e; }")],
  ['line rendered as HTML', rep('payouts.html', "  el.textContent = txt;\n  el.style.display = 'block';", "  el.innerHTML = txt;\n  el.style.display = 'block';")],
  ['window module before its logic', rep('employees.html', '<script src="staff-leaves.js?v=', '<script src="staff-leaves-x.js?v=')],
  ['module loaded twice', rep('employees.html', '<script src="emp-time.js?v=', '<script src="emp-time.js?v=1"></script>\n<script src="emp-time.js?v=')],
  ['owner card without the button', rep('employees.html', "🔐 تغيير رقم سرّي</button>' + timeBtn;", "🔐 تغيير رقم سرّي</button>';")],
  ['read-only mode leaves the save visible', rep('employees.html', ',[onclick*="saveStaffHours("]', '')],
  ['cache-bust misses a module', rep('scripts/cache-bust.sh', 'emp-time\\.js|staff-leaves\\.js|', 'emp-time\\.js|')],
  ['audit filter misses the leave actions', rep('audit-log.html', ", 'employee.work_schedule', 'employee.leave_add', 'employee.leave_delete'", '')],
  ['dictionary misses a string', rep('i18n-en.js', "'لا إجازات ولا غيابات مسجَّلة.': ", "'لا إجازات.': ")],
  ['pattern drops a number', rep('i18n-en.js', "'Taken this year: $1 · Left: $2 of $3'", "'Taken this year: $1 · Left: $2'")],
  ['payout line left Arabic', rep('i18n-en.js', "(?: من (\\d+) يوم دوام بالشهر| (?:يوم|أيام))", "(?: من (\\d+) يوم دوام| (?:يوم|أيام))")]
];

(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-staff-time: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-staff-time: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
