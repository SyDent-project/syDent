/* staff-leaves.js — منطقُ الدوام والإجازات المشترك (M222): صفحةُ الموظفين (emp-time.js) وصفحةُ الرواتب.
   منطقٌ نقي + قراءةٌ واحدة بنطاق المالك. لا يكتب شيئاً ولا يلمس الرواتب:
   deduction() تحسب «خصماً مقترحاً» يُعرض سطراً ظاهراً فقط، والمالكُ يطبّقه بيده أو يتجاهله.
   الخصم = لكل شهرٍ: الراتب الشهري × (أيامُ الغياب/الإجازة غير المدفوعة فيه ÷ أيامُ الدوام فيه).
   «أيامُ الدوام» = دوامُ الشخص الخاص، وإلا أيامُ دوام العيادة، وإلا الأيامُ التقويمية. */
(function () {
  'use strict';
  if (window.SyStaffLeaves) return;

  var KINDS = { paid: 'إجازة مدفوعة', unpaid: 'إجازة غير مدفوعة', sick: 'إجازة مرضية', absence: 'غياب' };
  var DEDUCT = { unpaid: 1, absence: 1 };   /* ما يُقترح خصمُه — المدفوعةُ والمرضية لا */

  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function okYmd(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && ymd(parseYmd(s)) === s; }
  function okTime(t) { return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(t || '')); }

  /* خريطةُ دوامٍ صالحة أو null — نفس عقد _work_schedule_ok بالقاعدة. */
  function cleanSchedule(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    var out = {}, n = 0;
    Object.keys(map).forEach(function (k) {
      var v = map[k];
      if (!/^[0-6]$/.test(k) || !Array.isArray(v) || v.length !== 2) return;
      var a = String(v[0] || '').slice(0, 5), b = String(v[1] || '').slice(0, 5);
      if (!okTime(a) || !okTime(b) || b <= a) return;
      out[k] = [a, b]; n++;
    });
    return n ? out : null;
  }
  /* عددُ الأيام ضمن [from, to] ∩ [lo, hi] — workDays: أيامُ الأسبوع المعدودة (0 = الأحد) أو null/فارغ = كل الأيام. */
  function countDays(from, to, workDays, lo, hi) {
    var a = from, b = to;
    if (lo && a < lo) a = lo;
    if (hi && b > hi) b = hi;
    if (!okYmd(a) || !okYmd(b) || b < a) return 0;
    var n = 0, d = parseYmd(a), guard = 0;
    for (var s = ymd(d); s <= b && guard < 800; d.setDate(d.getDate() + 1), s = ymd(d), guard++) {
      if (!workDays || !workDays.length || workDays.indexOf(d.getDay()) !== -1) n++;
    }
    return n;
  }
  function workDaysOf(schedule, clinicDays) {
    var sc = cleanSchedule(schedule);
    if (sc) return Object.keys(sc).map(Number).sort();
    return (clinicDays && clinicDays.length) ? clinicDays.slice() : null;
  }
  function parseClinicDays(csv) {
    return String(csv || '').split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 0 && x <= 6; });
  }
  function paidTaken(leaves, year, workDays) {
    var lo = year + '-01-01', hi = year + '-12-31', n = 0;
    (leaves || []).forEach(function (l) { if (l.kind === 'paid') n += countDays(l.date_from, l.date_to, workDays, lo, hi); });
    return n;
  }
  function overlaps(leaves, from, to, skipId) {
    return (leaves || []).some(function (l) { return l.id !== skipId && l.date_from <= to && from <= l.date_to; });
  }
  /* أيامُ كل نوعٍ ضمن [from, to] ⇒ {paid, unpaid, sick, absence, deductDays} */
  function summary(leaves, from, to, workDays) {
    var out = { paid: 0, unpaid: 0, sick: 0, absence: 0, deductDays: 0 };
    (leaves || []).forEach(function (l) {
      if (!(l.kind in KINDS)) return;
      var n = countDays(l.date_from, l.date_to, workDays, from, to);
      out[l.kind] += n; if (DEDUCT[l.kind]) out.deductDays += n;
    });
    return out;
  }
  /* الخصمُ المقترح غيرُ المقرَّب ⇒ {days, baseDays, months, amount}. baseDays = أيامُ دوام الشهر (لشهرٍ واحد؛ وإلا 0). */
  function deduction(monthly, leaves, from, to, workDays) {
    var out = { days: 0, baseDays: 0, months: 0, amount: 0 }, m = Number(monthly) || 0;
    if (!okYmd(from) || !okYmd(to) || to < from) return out;
    var d = parseYmd(from); d.setDate(1);
    for (var guard = 0; guard < 36 && ymd(d) <= to; guard++, d.setMonth(d.getMonth() + 1)) {
      var ms = ymd(d), me = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      var lo = ms < from ? from : ms, hi = me > to ? to : me, abs = 0;
      (leaves || []).forEach(function (l) { if (DEDUCT[l.kind]) abs += countDays(l.date_from, l.date_to, workDays, lo, hi); });
      if (!abs) continue;
      var base = countDays(ms, me, workDays);
      if (base <= 0) continue;
      if (abs > base) abs = base;
      out.days += abs; out.months++; out.baseDays = base;
      if (m > 0) out.amount += m * abs / base;
    }
    if (out.months !== 1) out.baseDays = 0;
    return out;
  }

  /* قراءةٌ واحدة للعيادة: إجازاتُ كل الموظفين + دوامُهم + أيامُ دوام العيادة. قبل M222 ⇒ {ok:false}. */
  var _c = null;
  async function load(uid, force) {
    if (!uid || !window.sb) return { ok: false, byEmp: {}, sched: {}, clinicDays: [] };
    if (_c && _c.uid === uid && !force) return _c;
    var out = { uid: uid, ok: false, byEmp: {}, sched: {}, clinicDays: [] };
    try {
      var rs = await Promise.all([
        window.sb.from('staff_leaves').select('id, employee_id, kind, date_from, date_to').eq('owner_id', uid).order('date_from', { ascending: false }).limit(2000),
        window.sb.from('clinic_employees').select('id, work_schedule').eq('owner_id', uid).limit(500),
        window.sb.from('clinic_settings').select('booking_work_days').eq('owner_id', uid).maybeSingle()
      ]);
      if (rs[0].error || rs[1].error) return out;
      (rs[0].data || []).forEach(function (l) { (out.byEmp[l.employee_id] = out.byEmp[l.employee_id] || []).push(l); });
      (rs[1].data || []).forEach(function (e) { out.sched[e.id] = e.work_schedule || null; });
      out.clinicDays = parseClinicDays(rs[2].data && rs[2].data.booking_work_days);
      out.ok = true; _c = out;
    } catch (e) { console.warn('SyStaffLeaves.load:', e); }
    return out;
  }
  function reset() { _c = null; }
  /* «3 أيام» · «يوم/11 يوم» — المعدودُ بعد 3..10 جمع */
  function daysTxt(n) { n = Number(n) || 0; return n + ' ' + (n >= 3 && n <= 10 ? 'أيام' : 'يوم'); }

  window.SyStaffLeaves = { KINDS: KINDS, DEDUCT: DEDUCT, cleanSchedule: cleanSchedule, countDays: countDays, workDaysOf: workDaysOf, parseClinicDays: parseClinicDays,
    paidTaken: paidTaken, overlaps: overlaps, summary: summary, deduction: deduction, load: load, reset: reset, daysTxt: daysTxt, ymd: ymd, okYmd: okYmd, okTime: okTime };
})();
