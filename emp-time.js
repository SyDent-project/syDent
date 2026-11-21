/* emp-time.js — دوامُ الشخص وإجازاتُه (M222) — صفحةُ الموظفين.
   نافذةٌ واحدة لكل موظف/طبيب بتبويبين:
   (١) الدوام: «دوام خاص» مطفأ = يتبع دوام العيادة (work_schedule NULL)؛ مفعَّل = أيامٌ وساعاتٌ لكل يوم
       ({"0".."6": ["HH:MM","HH:MM"]} · 0 = الأحد). دوامُ الطبيب يُنبَّه عليه عند الحجز خارجَه (SyDentBlocks.offHours
       بحارس التعارض — تنبيهٌ بلا منع) ويحترمه الحجزُ الإلكتروني من جهة الخادم (M223).
   (٢) الإجازات والغياب: مدفوعة · غير مدفوعة · مرضية · غياب. إجازةُ الطبيب تُنشئ معها حجزاً مغلقاً باسمه
       (schedule_blocks · kind leave · provider_id) يُحذف بحذفها. الرصيدُ السنوي = المسموح − أيامُ الإجازة المدفوعة
       بهذه السنة (تُعدّ أيامُ دوامه فقط إن كان له دوامٌ خاص، وإلا أيامُ دوام العيادة، وإلا الأيامُ التقويمية).
   لا يكتب بالرواتب: صفحةُ الرواتب تقرأ الإجازات لتقترح سطرَ خصمٍ ظاهراً فقط.
   المنطقُ النقي بـstaff-leaves.js (يُحمَّل قبل هذه الوحدة). لا مساسَ بمسار حفظ الموظف: قراءةٌ وكتابةٌ مستقلتان بنطاق المالك. صفرُ مستمعات addEventListener. */
(function () {
  'use strict';

  var DAYS = [[6, 'السبت'], [0, 'الأحد'], [1, 'الاثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']];
  var KINDS = window.SyStaffLeaves.KINDS;
  var S = { emp: null, leaves: [], ok: false, busy: false, clinicDays: null };

  function byId(id) { return document.getElementById(id); }
  function toast(m, err) { if (typeof window.showToast === 'function') window.showToast(m, !!err); }
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function uid() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null; }
  function readOnly() { return !!(window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()); }
  function isMissing(e) { return /42P01|42703|PGRST204|PGRST205|does not exist|schema cache/i.test(((e && e.message) || '') + ' ' + ((e && e.code) || '')); }
  function ymd(d) { return window.SyStaffLeaves.ymd(d); }
  function dmy(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s || ''); }
  function okTime(t) { return window.SyStaffLeaves.okTime(t); }

  /* المنطقُ النقي (الخريطة · عدّ الأيام · الرصيد · التداخل) بمصدره الواحد staff-leaves.js */
  var L = window.SyStaffLeaves;
  var cleanSchedule = L.cleanSchedule, countDays = L.countDays, workDaysOf = L.workDaysOf, paidTaken = L.paidTaken, overlaps = L.overlaps;

  /* ── التحميل ── */
  async function loadClinicDays() {
    if (S.clinicDays !== null) return;
    S.clinicDays = [];
    try {
      var cs = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : null;
      if (!cs) { var r = await window.sb.from('clinic_settings').select('booking_work_days').eq('owner_id', uid()).maybeSingle(); cs = r.data || null; }
      S.clinicDays = L.parseClinicDays(cs && cs.booking_work_days);
    } catch (e) { S.clinicDays = []; }
  }
  async function open(empId) {
    if (readOnly()) return;
    var u = uid(); if (!u || !empId || !window.sb) return;
    S.emp = null; S.leaves = []; S.ok = false; S.providerId = null;
    try {
      var r = await window.sb.from('clinic_employees').select('id, name, role, doctor_id, work_schedule, annual_leave_days').eq('id', empId).eq('owner_id', u).single();
      if (r.error) throw r.error;
      S.emp = r.data;
      var l = await window.sb.from('staff_leaves').select('id, kind, date_from, date_to, note, block_id, created_at').eq('owner_id', u).eq('employee_id', empId).order('date_from', { ascending: false }).limit(200);
      if (l.error) throw l.error;
      S.leaves = l.data || [];
      /* الطبيبُ الذي يُغلَق تقويمُه بإجازة هذا الشخص: ربطُه الصريح، وللمالك بلا ربط = طبيبُ المالك بقائمة الأطباء */
      S.providerId = S.emp.doctor_id || null;
      if (!S.providerId && S.emp.role === 'owner') {
        var od = await window.sb.from('clinic_doctors').select('id').eq('owner_id', u).eq('is_owner', true).limit(1);
        S.providerId = (!od.error && od.data && od.data[0]) ? od.data[0].id : null;
      }
      S.ok = true;
      await loadClinicDays();
    } catch (e) {
      console.warn('emp-time open:', e);
      toast(isMissing(e) ? '⚠️ الدوام والإجازات غير متاحة بعد على هذا الحساب' : '⚠️ تعذّر التحميل — تحقّق من الاتصال وحاول ثانيةً', true);
      return;
    }
    byId('stTitle').textContent = '🕘 الدوام والإجازات: ' + (S.emp.name || '');
    renderHours(); renderLeaves(); switchTab('hours');
    byId('staffTimeModal').classList.add('show');
  }
  function close() { var m = byId('staffTimeModal'); if (m) m.classList.remove('show'); S.emp = null; }
  function switchTab(t) {
    ['hours', 'leaves'].forEach(function (k) {
      var b = byId('stTab_' + k), p = byId('stPane_' + k);
      if (b) { b.classList.toggle('on', k === t); b.setAttribute('aria-selected', k === t ? 'true' : 'false'); }
      if (p) p.style.display = k === t ? '' : 'none';
    });
  }

  /* ── الدوام ── */
  function renderHours() {
    var sc = cleanSchedule(S.emp && S.emp.work_schedule);
    byId('stCustom').checked = !!sc;
    var h = '';
    DAYS.forEach(function (d) {
      var v = sc && sc[String(d[0])];
      h += '<div class="st-day" id="stDay_' + d[0] + '">'
        + '<label class="st-day-n"><input type="checkbox" id="stOn_' + d[0] + '"' + (v ? ' checked' : '') + ' onchange="stDayToggle(' + d[0] + ')"> <span>' + d[1] + '</span></label>'
        + '<span class="st-day-t"><input type="time" id="stFrom_' + d[0] + '" step="300" value="' + (v ? v[0] : '09:00') + '" aria-label="من"' + (v ? '' : ' disabled') + '>'
        + '<span class="st-sep">إلى</span>'
        + '<input type="time" id="stTo_' + d[0] + '" step="300" value="' + (v ? v[1] : '17:00') + '" aria-label="إلى"' + (v ? '' : ' disabled') + '></span>'
        + '</div>';
    });
    byId('stDays').innerHTML = h;
    byId('stHoursErr').style.display = 'none';
    toggleCustom();
  }
  function toggleCustom() {
    var on = byId('stCustom').checked;
    byId('stDays').style.display = on ? '' : 'none';
    byId('stHoursHint').style.display = on ? 'none' : '';
  }
  function dayToggle(d) {
    var on = byId('stOn_' + d).checked;
    byId('stFrom_' + d).disabled = !on; byId('stTo_' + d).disabled = !on;
  }
  function failHours(m) { var e = byId('stHoursErr'); e.textContent = m; e.style.display = 'block'; }
  async function saveHours() {
    if (S.busy || !S.emp || readOnly()) return;
    var u = uid(); if (!u) return;
    var map = null;
    byId('stHoursErr').style.display = 'none';
    if (byId('stCustom').checked) {
      map = {};
      for (var i = 0; i < DAYS.length; i++) {
        var d = DAYS[i][0];
        if (!byId('stOn_' + d).checked) continue;
        var a = String(byId('stFrom_' + d).value || '').slice(0, 5), b = String(byId('stTo_' + d).value || '').slice(0, 5);
        if (!okTime(a) || !okTime(b)) return failHours('أدخل وقت البداية والنهاية ليوم ' + DAYS[i][1]);
        if (b <= a) return failHours('نهاية دوام ' + DAYS[i][1] + ' يجب أن تكون بعد بدايته.');
        map[String(d)] = [a, b];
      }
      if (!Object.keys(map).length) return failHours('اختر يوم دوام واحداً على الأقل، أو أوقف «دوام خاص» ليتبع دوام العيادة.');
    }
    S.busy = true;
    var btn = byId('stSaveHours'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      var r = await window.sb.from('clinic_employees').update({ work_schedule: map }).eq('id', S.emp.id).eq('owner_id', u).select('id, work_schedule').single();
      if (r.error) throw r.error;
      S.emp.work_schedule = r.data.work_schedule;
      if (window.SyDentBlocks && window.SyDentBlocks.hoursReset) window.SyDentBlocks.hoursReset();
      toast(map ? 'تم حفظ الدوام ✓' : 'صار يتبع دوام العيادة ✓');
      if (typeof window.logAudit === 'function') {
        try { window.logAudit('employee.work_schedule', { entityType: 'employee', entityId: S.emp.id, description: (map ? 'تعديل دوام ' : 'إلغاء الدوام الخاص لـ') + (S.emp.name || ''), newValue: map }); } catch (e2) {}
      }
      renderLeaves();
    } catch (e) {
      console.warn('emp-time saveHours:', e);
      failHours(isMissing(e) ? 'الدوام غير متاح بعد على هذا الحساب.' : 'تعذّر الحفظ — تحقّق من الاتصال وحاول ثانيةً.');
    }
    S.busy = false; btn.disabled = false; btn.textContent = 'حفظ الدوام';
  }

  /* ── الإجازات ── */
  function myWorkDays() { return workDaysOf(S.emp && S.emp.work_schedule, S.clinicDays); }
  function renderLeaves() {
    if (!S.emp) return;
    var wd = myWorkDays(), year = new Date().getFullYear();
    var allow = S.emp.annual_leave_days, taken = paidTaken(S.leaves, year, wd);
    byId('stAllow').value = (allow === null || allow === undefined) ? '' : String(allow);
    byId('stBalance').textContent = (allow === null || allow === undefined)
      ? 'المأخوذ هذه السنة: ' + L.daysTxt(taken) + ' إجازة مدفوعة'
      : 'المأخوذ هذه السنة: ' + taken + ' · الباقي: ' + (allow - taken) + ' من ' + allow;
    byId('stBalance').classList.toggle('st-over', allow !== null && allow !== undefined && taken > allow);
    byId('stCountNote').textContent = wd ? 'تُعدّ أيام الدوام فقط.' : 'تُعدّ الأيام التقويمية (لا دوام محدَّد).';
    var box = byId('stLeaves');
    if (!S.leaves.length) { box.innerHTML = '<div class="st-none">لا إجازات ولا غيابات مسجَّلة.</div>'; }
    else {
      box.innerHTML = S.leaves.map(function (l) {
        var n = countDays(l.date_from, l.date_to, wd);
        return '<div class="st-leave"><div class="st-leave-m"><span class="tone ' + (l.kind === 'paid' ? 'tone-blue' : l.kind === 'sick' ? 'tone-purple' : l.kind === 'unpaid' ? 'tone-orange' : 'tone-red') + ' st-kind">' + esc(KINDS[l.kind] || l.kind) + '</span>'
          + '<span class="st-leave-d">' + esc(l.date_from === l.date_to ? dmy(l.date_from) : dmy(l.date_from) + ' ← ' + dmy(l.date_to)) + ' · ' + L.daysTxt(n) + '</span>'
          + (l.block_id ? '<span class="st-leave-b" title="حجزٌ مغلق باسم الطبيب على التقويم">📅 مغلق على التقويم</span>' : '')
          + (l.note ? '<span class="st-leave-n">' + esc(l.note) + '</span>' : '') + '</div>'
          + '<div class="sy-acts"><button type="button" class="sy-act sy-act-danger" onclick="stDeleteLeave(\'' + l.id + '\')">🗑️ حذف</button></div></div>';
      }).join('');
    }
    var t = ymd(new Date());
    if (!byId('stLFrom').value) byId('stLFrom').value = t;
    if (!byId('stLTo').value) byId('stLTo').value = t;
    byId('stLeaveErr').style.display = 'none';
    byId('stDocNote').style.display = S.providerId ? '' : 'none';
  }
  function failLeave(m) { var e = byId('stLeaveErr'); e.textContent = m; e.style.display = 'block'; }
  async function by() {
    try { var emp = (window.SyDentLock && window.SyDentLock.getCurrentEmployee) ? await window.SyDentLock.getCurrentEmployee() : null; return emp && emp.name ? String(emp.name).slice(0, 80) : null; } catch (e) { return null; }
  }
  async function addLeave() {
    if (S.busy || !S.emp || readOnly()) return;
    var u = uid(); if (!u) return;
    var kind = byId('stLKind').value, from = byId('stLFrom').value, to = byId('stLTo').value || from, note = String(byId('stLNote').value || '').trim().slice(0, 200) || null;
    byId('stLeaveErr').style.display = 'none';
    if (!KINDS[kind]) return failLeave('اختر نوع الإجازة.');
    if (!L.okYmd(from) || !L.okYmd(to)) return failLeave('أدخل تاريخ البداية والنهاية.');
    if (to < from) return failLeave('تاريخ النهاية قبل البداية.');
    if (countDays(from, to, null) > 366) return failLeave('المدّة أطول من سنة.');
    if (overlaps(S.leaves, from, to)) return failLeave('لهذا الشخص إجازةٌ أو غيابٌ مسجَّل ضمن هذه الفترة.');
    S.busy = true;
    var btn = byId('stAddLeave'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    var blockId = null, today = ymd(new Date());
    try {
      /* إجازةُ طبيبٍ لم تنتهِ ⇒ حجزٌ مغلق باسمه أولاً (فشلُ الإجازة بعده يحذفه — لا حجزَ يتيم) */
      if (S.providerId && to >= today) {
        var b = await window.sb.from('schedule_blocks').insert({ doctor_id: u, title: (KINDS[kind] + ' — ' + (S.emp.name || '')).slice(0, 60), kind: 'leave', date_from: from, date_to: to,
          provider_id: S.providerId, blocks_scheduling: true, notes: note }).select('id').single();
        if (b.error) throw b.error;
        blockId = b.data.id;
      }
      var r = await window.sb.from('staff_leaves').insert({ owner_id: u, employee_id: S.emp.id, kind: kind, date_from: from, date_to: to, note: note, block_id: blockId, created_by: await by() })
        .select('id, kind, date_from, date_to, note, block_id, created_at').single();
      if (r.error) {
        if (blockId) { try { await window.sb.from('schedule_blocks').delete().eq('id', blockId).eq('doctor_id', u); } catch (e3) {} }
        throw r.error;
      }
      L.reset();
      S.leaves = [r.data].concat(S.leaves).sort(function (x, y) { return x.date_from < y.date_from ? 1 : -1; });
      byId('stLNote').value = '';
      renderLeaves();
      var msg = 'تم تسجيل ' + KINDS[kind] + ' ✓';
      if (blockId) {
        /* تنبيه: مواعيدُ الطبيب الواقعة ضمن الإجازة (لا تُلغى ولا تُنقل — القرارُ للعيادة) */
        try {
          var a = await window.sb.from('appointments').select('id', { count: 'exact', head: true }).eq('doctor_id', u).eq('provider_id', S.providerId)
            .gte('date', from).lte('date', to).not('is_planned', 'is', true).not('status', 'in', '(cancelled,broken,no_show,completed)');
          if (!a.error && a.count > 0) msg = '⚠️ سُجّلت الإجازة — للطبيب ' + a.count + ' موعد ضمنها: راجعها من صفحة المواعيد';
        } catch (e4) {}
      }
      toast(msg);
      if (typeof window.logAudit === 'function') {
        try { window.logAudit('employee.leave_add', { entityType: 'employee', entityId: S.emp.id, description: 'تسجيل ' + KINDS[kind] + ' لـ' + (S.emp.name || '') + ' من ' + dmy(from) + ' إلى ' + dmy(to) }); } catch (e5) {}
      }
    } catch (e) {
      console.warn('emp-time addLeave:', e);
      failLeave(isMissing(e) ? 'الإجازات غير متاحة بعد على هذا الحساب.' : 'تعذّر الحفظ — تحقّق من الاتصال وحاول ثانيةً.');
    }
    S.busy = false; btn.disabled = false; btn.textContent = 'تسجيل';
  }
  async function deleteLeave(id) {
    if (S.busy || !S.emp || readOnly()) return;
    var u = uid(), l = S.leaves.filter(function (x) { return x.id === id; })[0];
    if (!u || !l) return;
    if (!window.SyDialog || !await window.SyDialog.confirm({ title: 'حذف الإجازة', message: 'سيُحذف سجلّ «' + (KINDS[l.kind] || '') + '» (' + dmy(l.date_from) + ' ← ' + dmy(l.date_to) + ')' + (l.block_id ? ' ويُفتح تقويم الطبيب في هذه الفترة.' : '.') + ' متابعة؟', danger: true, confirmText: 'حذف', cancelText: 'تراجع' })) return;
    S.busy = true;
    try {
      var r = await window.sb.from('staff_leaves').delete().eq('id', id).eq('owner_id', u);
      if (r.error) throw r.error;
      if (l.block_id) {
        var b = await window.sb.from('schedule_blocks').delete().eq('id', l.block_id).eq('doctor_id', u);
        if (b.error) toast('⚠️ حُذفت الإجازة لكن الحجز المغلق بقي على التقويم — احذفه من صفحة المواعيد', true);
      }
      L.reset();
      S.leaves = S.leaves.filter(function (x) { return x.id !== id; });
      renderLeaves();
      toast('تم حذف الإجازة ✓');
      if (typeof window.logAudit === 'function') {
        try { window.logAudit('employee.leave_delete', { entityType: 'employee', entityId: S.emp.id, description: 'حذف ' + (KINDS[l.kind] || '') + ' لـ' + (S.emp.name || '') + ' (' + dmy(l.date_from) + ' ← ' + dmy(l.date_to) + ')' }); } catch (e2) {}
      }
    } catch (e) { console.warn('emp-time deleteLeave:', e); toast('⚠️ تعذّر الحذف — تحقّق من الاتصال وحاول ثانيةً', true); }
    S.busy = false;
  }
  async function saveAllowance() {
    if (S.busy || !S.emp || readOnly()) return;
    var u = uid(), raw = String(byId('stAllow').value || '').trim(), v = raw === '' ? null : parseInt(raw, 10);
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 365 || String(v) !== raw)) { toast('⚠️ الرصيد السنوي رقمٌ بين 0 و365', true); return; }
    if (v === (S.emp.annual_leave_days === undefined ? null : S.emp.annual_leave_days)) return;
    S.busy = true;
    try {
      var r = await window.sb.from('clinic_employees').update({ annual_leave_days: v }).eq('id', S.emp.id).eq('owner_id', u).select('id, annual_leave_days').single();
      if (r.error) throw r.error;
      S.emp.annual_leave_days = r.data.annual_leave_days;
      renderLeaves(); toast('تم حفظ الرصيد السنوي ✓');
    } catch (e) { console.warn('emp-time saveAllowance:', e); toast('⚠️ تعذّر حفظ الرصيد — حاول ثانيةً', true); }
    S.busy = false;
  }

  window.SyEmpTime = { DAYS: DAYS };
  window.openStaffTime = open;
  window.closeStaffTime = close;
  window.stSwitchTab = switchTab;
  window.stToggleCustom = toggleCustom;
  window.stDayToggle = dayToggle;
  window.saveStaffHours = saveHours;
  window.stAddLeave = addLeave;
  window.stDeleteLeave = deleteLeave;
  window.saveStaffAllowance = saveAllowance;
})();
