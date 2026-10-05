/* SyDent — appt-views.js: محرك العرض (شهري/يومي/كراسي K3/أسبوعي/قائمة/اتصالات) — استخراج appointments ٥.
 * نُقل بايت-بايت. صفر كود تنفيذي وقت التحليل. يحمل سمات data-test الثلاث (appt-row/status/delete)
 * — حارس الجرد retarget إلى هذا الملف. globals وقت التشغيل: appointments · patientsCache · view ·
 * currentDate · selectedDate · escapeHtml · getApptColor · getReminderBadgeHtml (appt-wa) ·
 * renderTimeStrip/renderTimeActionBtn (appt-time) · editAppt/deleteAppt/submitAppt (inline). */

// ─── Render ──────────────────────────────────────────
// Nav semantics: month/day/week navigate a period, so ‹ › اليوم and the
// month label mean something. list/calls/booking are ROLLING views (upcoming
// from today / reminder window / request queue) — they ignore currentDate by
// design, so the arrows must not exist there (they used to step currentDate
// day-by-day and drift the label while the content stayed put).
var NAV_ROLLING_LABELS = { list: 'المواعيد القادمة', calls: 'قائمة الاتصالات', booking: 'طلبات الحجز' };
function applyNavMode() {
  var label = NAV_ROLLING_LABELS[view];
  var rolling = !!label;
  document.querySelectorAll('.cal-header .cal-nav-btn, .cal-header .today-btn').forEach(function(b){
    b.style.display = rolling ? 'none' : '';
  });
  if (rolling) { var m = document.getElementById('calMonth'); if (m) m.textContent = label; }
}

function render() {
  updateWaitlistBadge();   /* Backlog #5 */
  applyNavMode();
  if (view==='month') renderMonth();
  else if (view==='day') {
    renderDay();
    // Phase 6 K3: refresh toggle visibility (operatories may have changed)
    // and apply the persisted view mode. _applyK3ViewMode handles both
    // showing the right element and triggering renderDayByChair when needed.
    _refreshK3ToggleVisibility();
    _applyK3ViewMode(getDayViewMode());
  }
  else if (view==='week') renderWeek();
  else if (view==='calls') renderCalls();
  else if (view==='booking') renderBookingRequests();
  else renderList();
  _syncTodayBtn();
}

// ─── «اليوم» feedback ──────────────────────────────────────────────────────
// goToday() is a period jump (Google/Outlook semantics: keep the view, move to
// the period that contains today). When the visible period ALREADY contains
// today the jump is a no-op with zero feedback — the owner read that as a dead
// button in week view (14 أيلول: the current week was on screen, tap → nothing).
// Two things make it legible without changing the jump itself:
//   (1) .today-btn.at-today — state class synced on every render: "you are on
//       today's period" (month = same y/m · week = same Saturday-first week ·
//       day = today). Rolling views never match (button hidden anyway).
//   (2) pulseToday() — after the jump, flash today's element and scroll it
//       into view (week column can be off-screen behind the horizontal scroll
//       on mobile). Falls back to the range title when the week is empty (no
//       day columns are rendered then) so the tap always answers.
function _periodHasToday() {
  var t = new Date();
  if (view === 'month') return currentDate.getFullYear() === t.getFullYear() && currentDate.getMonth() === t.getMonth();
  if (view === 'week')  return _wkWeekStart(selectedDate || currentDate || t).getTime() === _wkWeekStart(t).getTime();
  if (view === 'day')   return dateStr(selectedDate) === dateStr(t);
  return false;
}
function _syncTodayBtn() {
  var btn = document.querySelector('.cal-header .today-btn');
  if (!btn) return;
  var at = _periodHasToday();
  btn.classList.toggle('at-today', at);
  btn.title = at ? 'أنت على اليوم الحالي' : 'الانتقال إلى اليوم';
}
function _todayTarget() {
  var ds = dateStr(new Date());
  if (view === 'month') return document.querySelector('#calBody .cal-cell.today');
  if (view === 'week')  return document.querySelector('#weekGrid .wk-day-col[data-date="' + ds + '"]') || document.getElementById('weekTitle');
  if (view === 'day')   return document.querySelector('#dayView .day-header') || document.getElementById('dayTitle');
  return null;
}
function pulseToday() {
  var el = _todayTarget();
  if (!el) return;
  try { el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_) {}
  el.classList.remove('today-pulse');
  void el.offsetWidth;   // restart the animation on rapid re-taps
  el.classList.add('today-pulse');
  setTimeout(function(){ el.classList.remove('today-pulse'); }, 1000);
}

function renderMonth() {
  const y=currentDate.getFullYear(), mo=currentDate.getMonth();
  document.getElementById('calMonth').textContent = MONTHS_AR[mo]+' '+y;

  const first = new Date(y,mo,1).getDay();
  const days  = new Date(y,mo+1,0).getDate();
  const today = dateStr(new Date());
  const body  = document.getElementById('calBody');
  let html = '';

  for (let i=0; i<first; i++) {
    const d = new Date(y,mo,1-first+i);
    const ds= dateStr(d);
    const ev= apptsByDate(ds);
    html += cellHTML(d.getDate(), ds, true, today, ev);
  }
  for (let d=1; d<=days; d++) {
    const ds= dateStr(new Date(y,mo,d));
    const ev= apptsByDate(ds);
    html += cellHTML(d, ds, false, today, ev);
  }
  const remain = 42 - first - days;
  for (let i=1; i<=remain; i++) {
    const d = new Date(y,mo+1,i);
    const ds= dateStr(d);
    const ev= apptsByDate(ds);
    html += cellHTML(i, ds, true, today, ev);
  }
  body.innerHTML = html;
}

function cellHTML(day, ds, other, today, evts) {
  const isToday    = ds===today;
  const isSelected = ds===dateStr(selectedDate);
  let cls = '';
  if (other)      cls += ' other-month';
  if (isToday)    cls += ' today';
  if (isSelected) cls += ' selected';

  const MAX_SHOW = window.innerWidth < 820 ? 0 : 2;
  let evHTML = '';
  /* v498: شريحةُ يومٍ كامل محجوز (إجازة/انقطاع) بخلية الشهر — عامّة العيادة فقط */
  var _dayAll = blocksForDay(ds).filter(function(i){ return i.allDay && i.blocks && !i.operatory_id && !i.provider_id; });
  if (_dayAll.length) evHTML += '<div class="cal-block" title="' + escapeHtml(window.SyDentBlocks.label(_dayAll[0])) + '">' + escapeHtml(window.SyDentBlocks.label(_dayAll[0])) + '</div>';
  evts.slice(0, MAX_SHOW).forEach(e => {
    var _ec = getApptColor(e);
    var lb = getApptLabBadge(e);
    var lbHtml = lb ? `<span style="margin-left:3px;" title="${lb.title/* xss-ok: getApptLabBadge عناوين ثابتة */}">${lb.icon}</span>` : '';
    evHTML += `<div class="cal-event" style="--bc:${_ec.fill};border-right:3px solid;" onclick="event.stopPropagation();editAppt('${e.id}')">${lbHtml}${fmtTime12(e.time)} ${escapeHtml((e.patient_name||'').split(' ')[0])}</div>`;
  });
  // Mobile dots
  let dotHTML = '<div class="cal-dot-row">';
  evts.slice(0,4).forEach(e => {
    dotHTML += `<span class="cal-dot" style="background:${getApptColor(e).fill}"></span>`;
  });
  dotHTML += '</div>';
  if (evts.length > MAX_SHOW && window.innerWidth >= 820) {
    evHTML += `<div class="cal-more">+${evts.length-MAX_SHOW} أكثر</div>`;
  }

  return `<div class="cal-cell${cls}" onclick="selectDay('${ds}')">
    <div class="cal-date">${day}</div>
    ${evHTML}
    ${dotHTML}
  </div>`;
}

function selectDay(ds) {
  // 'T00:00:00' → local midnight (a bare 'YYYY-MM-DD' parses as UTC and lands
  // on the previous day west of Greenwich).
  selectedDate = new Date(ds + 'T00:00:00');
  currentDate  = new Date(ds + 'T00:00:00');
  setView('day');
}

function renderDay() {
  const ds = dateStr(selectedDate);
  document.getElementById('calMonth').textContent = DAYS_AR[selectedDate.getDay()]+' '+selectedDate.getDate()+' '+MONTHS_AR[selectedDate.getMonth()]+' '+selectedDate.getFullYear();
  document.getElementById('dayTitle').textContent = DAYS_AR[selectedDate.getDay()]+' '+selectedDate.getDate()+' '+MONTHS_AR[selectedDate.getMonth()];
  const dayEvts = apptsByDate(ds);
  var dayBlocks = blocksForDay(ds);   /* v498 */
  document.getElementById('daySubtitle').textContent = dayEvts.length ? dayEvts.length+' موعد' : 'لا توجد مواعيد';

  // Sort appts by time
  var sorted = dayEvts.slice().sort(function(a,b){ return (a.time||'').localeCompare(b.time||''); });
  let html = '';
  if (sorted.length === 0) {
    // Phase 7.6G: improved empty state with CTA. The "+ موعد جديد"
    // button below already exists in the header, but inline CTA on
    // the empty state itself is the recommended pattern (Notion,
    // Slack, Stripe — show one obvious next action).
    html = '<div style="text-align:center;padding:50px 20px;color:var(--text2);">'
         + '<div style="font-size:48px;margin-bottom:12px;">📅</div>'
         + '<div style="font-size:15px;color:var(--text);margin-bottom:6px;font-weight:700;">لا توجد مواعيد لهذا اليوم</div>'
         + '<div style="font-size:13px;margin-bottom:18px;" data-sub-write>احجز موعداً جديداً بنقرة واحدة على أي وقت فارغ في الجدول.</div>'
         + '<button type="button" class="btn btn-primary" onclick="openModal()" data-doctor-inactive-block data-sub-write style="font-size:13px;padding:9px 18px;">'
         + '＋ موعد جديد'
         + '</button>'
         + '</div>';
  } else {
    sorted.forEach(function(e){
      var _bc = getApptColor(e);
      var lb = getApptLabBadge(e);
      // v280: tint from the rgb companion — `${color}22` only worked for hex and
      // silently produced no background for the var(--green) "ready" badge.
      var lbHtml = lb
        ? `<span class="tone tone-${lb.tone/* xss-ok: ثابت */}" style="display:inline-block;border-width:1px;border-style:solid;padding:1px 7px;border-radius:12px;font-size:11px;font-weight:700;margin-right:6px;" title="${lb.title/* xss-ok: getApptLabBadge عناوين ثابتة */}">${lb.icon} ${lb.title.split(':')[0] || 'مخبر'/* xss-ok: عنوان ثابت */}</span>`
        : '';
      var ps = getApptProceduresSummary(e.id);
      var psHtml = ps
        ? `<span class="cbadge" style="display:inline-block;--bc:var(--green);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-right:6px;" title="${ps.count} علاج — ${ps.costText}">🦷 ${ps.count} • ${ps.costShort}</span>`
        : '';
      var waHtml = getReminderBadgeHtml(e);
      var opHtml = getApptOperatoryBadge(e);
      html += `
        <div class="time-slot">
          <div class="slot-time">${fmtTime12(e.time)}</div>
          <div class="slot-content">
            <div class="appt-block" style="--bc:${_bc.fill};" onclick="editAppt('${e.id}')" onkeydown="if(event.key==='Enter'&&event.target===this)editAppt('${e.id}')" tabindex="0" role="button">
              <div class="appt-name">${escapeHtml(e.patient_name)||'—'} ${lbHtml}${psHtml}${waHtml}${opHtml}${getApptMedBadge(e)}${getApptReliabBadge(e)/* xss-ok: SyDentReliability.badgeHtml أرقامٌ وعنوانٌ مهرَّب */}${getApptSeriesBadge(e)/* xss-ok: أرقامٌ فقط */}${getApptPtFlags(e)}${getApptAsapBadge(e)}</div>
              <div class="appt-type">${escapeHtml(e.type)||'—'} (${e.duration} د)</div>
              ${renderTimeStrip(e)}
              <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
                <span class="appt-status ${statusClass(e.status)}">${statusLabel(e.status)}</span>
                <span onclick="event.stopPropagation()">${renderTimeActionBtn(e)}</span>
              </div>
            </div>
          </div>
        </div>`;
    });
  }
  document.getElementById('timeline').innerHTML = _dayBlocksStrip(dayBlocks) + html;   /* v498: شريطُ الفترات المحجوزة فوق القائمة */
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6 K3: Day view by Chair (Operatory columns)
// ───────────────────────────────────────────────────────────────────────────
// The chair view is an alternate Day rendering: time on Y, operatories on X.
// Users toggle between '📋 قائمة' (the original list-style timeline) and
// '🪑 حسب الكرسي' (this chair grid) via the buttons in the day header.
//
// The mode persists in localStorage (per device) — common UX for view-mode
// preferences. Defaults to 'list' on first use. The toggle hides itself when
// the chair view wouldn't add value (no operatories, only one operatory,
// mobile viewport).
//
// Drag-and-drop: HTML5 drag API. Each appointment block is draggable; each
// 30-min slot cell is a drop target. On drop, we update operatory_id and/or
// time in the appointments table and reload.
// ═══════════════════════════════════════════════════════════════════════════

/* ── v498 (M154): الحجوزاتُ المغلقة على العروض — المصدر SyDentBlocks (sched-blocks.js) ──
   BLOCK_ROWS: صفوفُ الجدول لنافذةٍ واسعة (60 يوماً للخلف · 400 للأمام)، تُحمَّل مرةً بالـinit
   وبعد كل حفظ/حذف من نافذة الإدارة؛ تُوسَّع لكل يومٍ عند الرسم. */
var BLOCK_ROWS = [];
async function loadBlocks() {
  if (!window.SyDentBlocks || !currentUser) { BLOCK_ROWS = []; return; }
  var t = new Date(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 60), b = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 400);
  BLOCK_ROWS = await window.SyDentBlocks.load(currentUser.id, dateStr(a), dateStr(b));
}
function blocksForDay(ds) {
  if (!window.SyDentBlocks) return [];
  return window.SyDentBlocks.forDay(window.SyDentBlocks.expand(BLOCK_ROWS, ds, ds), ds);
}
function _blockPseudoEvts(dayBlocks) {   /* للمدى الزمني فقط: الفتراتُ الموقّتة تمدّد الشبكة كالمواعيد */
  return dayBlocks.filter(function(i){ return !i.allDay; }).map(function(i){ return { time: _k3FormatTime(i.startMin), duration: i.endMin - i.startMin }; });
}
function _workHours() { return window.SyDentBlocks ? window.SyDentBlocks.workHours(typeof CLINIC_SETTINGS_WA !== 'undefined' ? CLINIC_SETTINGS_WA : null) : null; }
function _slotClosedCls(wh, ds, slotMin) { return (wh && window.SyDentBlocks.isClosed(wh, ds, slotMin)) ? ' k3-closed' : ''; }
/* رسمُ حالات الفترات داخل عمودٍ (كرسي أو يوم) بنفس هندسة المواعيد */
function _paintBlocks(colEl, list, range) {
  list.forEach(function(i){
    var sm = i.allDay ? range.startMin : Math.max(i.startMin, range.startMin);
    var em = i.allDay ? range.endMin : Math.min(i.endMin, range.endMin);
    if (em <= sm) return;
    var el = document.createElement('div');
    el.className = 'k3-block' + (i.blocks ? '' : ' k3-block-soft');
    el.style.top = (((sm - range.startMin) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX + 44) + 'px';
    el.style.height = Math.max(22, ((em - sm) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX - 4) + 'px';
    el.title = window.SyDentBlocks.label(i) + ' — ' + window.SyDentBlocks.timeLabel(i).replace(/[\u2060\u2066\u2069]/g, '');
    el.textContent = window.SyDentBlocks.label(i);
    el.dataset.blockId = i.block.id;
    el.addEventListener('click', function(ev){ ev.stopPropagation(); if (typeof openBlockModal === 'function') openBlockModal(i.block.id); });
    colEl.appendChild(el);
  });
}
/* شريطُ «أوقاتٌ محجوزة اليوم» لعرض القائمة اليومي */
function _dayBlocksStrip(dayBlocks) {
  if (!dayBlocks.length) return '';
  return '<div class="day-blocks-strip">' + dayBlocks.map(function(i){
    return '<button type="button" class="day-block-chip' + (i.blocks ? '' : ' day-block-soft') + '" onclick="openBlockModal(\'' + escapeHtml(i.block.id) + '\')">'
      + escapeHtml(window.SyDentBlocks.label(i)) + ' <span>' + window.SyDentBlocks.timeLabel(i) + '</span></button>';
  }).join('') + '</div>';
}

var K3_VIEW_MODE_KEY = 'sydent_day_view_mode';   // 'list' | 'chair'
var K3_ROW_MINUTES = 30;                          // each row = 30 min
var K3_ROW_HEIGHT_PX = 60;                        // matches --k3-row-height
var K3_DEFAULT_START_HOUR = 8;                    // 8 am
var K3_DEFAULT_END_HOUR = 20;                     // 8 pm

function getDayViewMode() {
  try {
    var m = localStorage.getItem(K3_VIEW_MODE_KEY);
    return (m === 'chair') ? 'chair' : 'list';
  } catch (e) { return 'list'; }
}

function setDayViewMode(mode) {
  var safe = (mode === 'chair') ? 'chair' : 'list';
  try { localStorage.setItem(K3_VIEW_MODE_KEY, safe); } catch (e) {}
  _applyK3ViewMode(safe);
}

// Wires the visible state of the timeline / chair grid + toggle buttons to
// match the requested mode. Called from setDayViewMode and from renderDay
// (whenever the day is re-rendered).
function _applyK3ViewMode(mode) {
  var listBtn  = document.getElementById('k3BtnList');
  var chairBtn = document.getElementById('k3BtnChair');
  var timelineEl = document.getElementById('timeline');
  var chairEl   = document.getElementById('k3ChairGrid');
  // Mobile guard: chair view is hidden by CSS @media under 700px. If we let
  // the timeline hide while the chair grid is also CSS-hidden, the user
  // sees a blank Day view. Force list mode on small viewports — the user's
  // saved preference is preserved in localStorage so it returns on desktop.
  if (window.innerWidth && window.innerWidth < 700) mode = 'list';
  if (listBtn)  listBtn.classList.toggle('active', mode === 'list');
  if (chairBtn) chairBtn.classList.toggle('active', mode === 'chair');
  if (mode === 'chair') {
    if (timelineEl) timelineEl.style.display = 'none';
    if (chairEl)    chairEl.style.display = '';
    renderDayByChair();
  } else {
    if (timelineEl) timelineEl.style.display = '';
    if (chairEl)    chairEl.style.display = 'none';
    // renderDay() has already painted #timeline; nothing else to do.
  }
}

// Decides whether the toggle button block should be visible. Rules:
//   • Hidden if operatories table is missing (pre-migration).
//   • Hidden if there are <2 active operatories (chair view = list view).
//   • Always hidden on mobile (CSS handles that via @media).
function _refreshK3ToggleVisibility() {
  var toggleEl = document.getElementById('k3ViewToggle');
  if (!toggleEl) return;
  var nOps = (OPERATORIES && OPERATORIES.length) ? OPERATORIES.length : 0;
  var show = !_operatoriesMissingFlag && nOps >= 2;
  toggleEl.style.display = show ? '' : 'none';
  if (!show) {
    // Force list mode if chair view is no longer available — prevents the
    // chair grid from rendering as an orphan on the next day switch.
    var mode = getDayViewMode();
    if (mode === 'chair') _applyK3ViewMode('list');
  }
}

// Parse "HH:MM" → minutes since midnight. Robust to undefined/null.
function _k3ParseTime(t) {
  if (!t || typeof t !== 'string') return NaN;
  var parts = t.split(':');
  if (parts.length < 2) return NaN;
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

// minutes → "HH:MM" zero-padded.
function _k3FormatTime(mins) {
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
}

// Compute the [startMin, endMin] range to show on screen. Expand the default
// 8 am-8 pm window if any appointment falls outside. Always snap to whole hours.
function _k3ComputeRange(dayEvts) {
  var startMin = K3_DEFAULT_START_HOUR * 60;
  var endMin   = K3_DEFAULT_END_HOUR * 60;
  dayEvts.forEach(function(e){
    var t = _k3ParseTime(e.time);
    if (!Number.isFinite(t)) return;
    var dur = parseInt(e.duration, 10);
    if (!Number.isFinite(dur) || dur <= 0) dur = 30;
    var apptEnd = t + dur;
    if (t < startMin) startMin = Math.floor(t / 60) * 60;
    if (apptEnd > endMin) endMin = Math.ceil(apptEnd / 60) * 60;
  });
  return { startMin: startMin, endMin: endMin };
}

// Main chair-view renderer. Called whenever the chair grid needs a repaint
// (day change, appointment edit/move, mode switch into chair).
function renderDayByChair() {
  var gridEl = document.getElementById('k3ChairGrid');
  if (!gridEl) return;
  var ds = dateStr(selectedDate);
  var dayEvts = apptsByDate(ds);
  var dayBlocks = blocksForDay(ds);   /* v498 */
  var wh = _workHours();

  // Empty-day state.
  if (!dayEvts.length && !dayBlocks.length) {
    gridEl.innerHTML = '<div class="k3-empty-state"><div style="font-size:48px;margin-bottom:12px;">📅</div><div>لا توجد مواعيد لهذا اليوم</div></div>';
    return;
  }

  // Build the list of columns: active operatories (sorted) + "بدون تخصيص"
  // (always shown, per Ayham's K3 decision). Defensive: if OPERATORIES is
  // unavailable, fall back to just the unassigned column so the day is still
  // visible — better than an empty grid.
  var cols = [];
  (OPERATORIES || []).forEach(function(op){
    cols.push({
      type: 'operatory',
      id: op.id,
      name: op.name || '[غرفة]',
      color: (op.color && /^#[0-9A-Fa-f]{6}$/.test(op.color)) ? op.color : 'var(--text3)'
    });
  });
  cols.push({
    type: 'unassigned',
    id: null,
    name: 'بدون تخصيص',
    color: 'var(--text3)'
  });

  // Compute visible time range.
  var range = _k3ComputeRange(dayEvts.concat(_blockPseudoEvts(dayBlocks)));   /* v498: الفتراتُ الموقّتة تمدّد المدى */
  var totalMins = range.endMin - range.startMin;
  var rowCount = Math.ceil(totalMins / K3_ROW_MINUTES);

  // ── Build HTML ─────────────────────────────────────────────────────────
  var html = '<div class="k3-chair-grid-inner">';

  // Time column (leading edge — uses position:sticky in RTL).
  html += '<div class="k3-time-col">';
  html += '<div class="k3-col-header" style="justify-content:center;color:var(--text2);">⏰</div>';
  for (var r = 0; r < rowCount; r++) {
    var slotMin = range.startMin + r * K3_ROW_MINUTES;
    html += '<div class="k3-time-cell">' + escapeHtml(_k3FormatTime(slotMin)) + '</div>';
  }
  html += '</div>';

  // Chair columns.
  cols.forEach(function(col, colIdx){
    var unassignedCls = (col.type === 'unassigned') ? ' k3-col-unassigned' : '';
    var headerLabel = escapeHtml(col.name);
    var swatchHtml = (col.type === 'operatory')
      ? '<span class="k3-col-header-swatch" style="background:' + escapeHtml(col.color) + ';"></span>'
      : '<span style="font-size:13px;">⚪</span>';
    html += '<div class="k3-chair-col" data-col-idx="' + colIdx + '"';
    if (col.type === 'operatory') html += ' data-operatory-id="' + escapeHtml(col.id) + '"';
    html += '>';
    html += '<div class="k3-col-header' + unassignedCls + '">' + swatchHtml + headerLabel + '</div>';
    // Empty slot cells (drop targets) — one per 30-min row.
    for (var r2 = 0; r2 < rowCount; r2++) {
      var slotMin2 = range.startMin + r2 * K3_ROW_MINUTES;
      html += '<div class="k3-slot-cell' + _slotClosedCls(wh, ds, slotMin2) + '" data-slot-min="' + slotMin2 + '"'
            + ' ondragover="onK3SlotDragOver(event, this)"'
            + ' ondragleave="onK3SlotDragLeave(event, this)"'
            + ' ondrop="onK3SlotDrop(event, this)"></div>';
    }
    html += '</div>';
  });

  html += '</div>';
  gridEl.innerHTML = html;

  /* v498: الفتراتُ المغلقة تحت المواعيد — العامّةُ بكل الأعمدة، والخاصّةُ بكرسيٍّ بعموده وحده */
  cols.forEach(function(col, colIdx){
    var colEl0 = gridEl.querySelector('.k3-chair-col[data-col-idx="' + colIdx + '"]');
    if (colEl0) _paintBlocks(colEl0, dayBlocks.filter(function(i){ return window.SyDentBlocks.appliesToColumn(i, col.id); }), range);
  });

  // ── Place appointments absolutely inside their columns ─────────────────
  // Per-column conflict detection: track all appointments in each column,
  // sorted by start time, then flag any pair that overlaps.
  var apptsByCol = {};  // colIdx → [{appt, startMin, endMin}]
  cols.forEach(function(_, idx){ apptsByCol[idx] = []; });

  dayEvts.forEach(function(e){
    var startMin = _k3ParseTime(e.time);
    if (!Number.isFinite(startMin)) {
      // Appointment with no time — skip (shouldn't reach here for a scheduled
      // appt, but defensive). Could go into unassigned column with a sentinel.
      return;
    }
    var dur = parseInt(e.duration, 10);
    if (!Number.isFinite(dur) || dur <= 0) dur = 30;
    var endMin = startMin + dur;

    // Pick column: operatory match by id, else "unassigned".
    var targetIdx = cols.length - 1;  // default = unassigned (last column)
    if (e.operatory_id) {
      for (var ci = 0; ci < cols.length; ci++) {
        if (cols[ci].type === 'operatory' && cols[ci].id === e.operatory_id) {
          targetIdx = ci;
          break;
        }
      }
      // If operatory_id was set but no match (deleted operatory), fall through
      // to unassigned. Visually identical to a no-operatory appt.
    }
    apptsByCol[targetIdx].push({ appt: e, startMin: startMin, endMin: endMin });
  });

  // Detect conflicts inside each column.
  var conflictIds = {};
  Object.keys(apptsByCol).forEach(function(idxKey){
    var arr = apptsByCol[idxKey].slice().sort(function(a,b){ return a.startMin - b.startMin; });
    for (var i = 0; i < arr.length; i++) {
      for (var j = i + 1; j < arr.length; j++) {
        if (arr[j].startMin < arr[i].endMin) {
          // overlap
          conflictIds[arr[i].appt.id] = true;
          conflictIds[arr[j].appt.id] = true;
        } else {
          break;  // sorted by start → no later one can overlap arr[i]
        }
      }
    }
  });

  // Append the appointment blocks. We do this in JS (not in the initial
  // innerHTML) because we set inline top/height per-appt and attach drag
  // listeners that need real DOM refs.
  Object.keys(apptsByCol).forEach(function(idxKey){
    var colIdx = parseInt(idxKey, 10);
    var colEl = gridEl.querySelector('.k3-chair-col[data-col-idx="' + colIdx + '"]');
    if (!colEl) return;
    apptsByCol[idxKey].forEach(function(item){
      var e = item.appt;
      var topPx = ((item.startMin - range.startMin) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX
                + 44;  // 44 = header height
      var heightPx = Math.max(
        24,  // minimum readable
        ((item.endMin - item.startMin) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX - 4
      );
      var bc = getApptColor(e);
      var block = document.createElement('div');
      block.className = 'k3-appt' + (conflictIds[e.id] ? ' k3-appt-conflict' : '');
      block.draggable = true;
      block.dataset.apptId = e.id;
      block.style.top = topPx + 'px';
      block.style.height = heightPx + 'px';
      block.style.setProperty('--bc', bc.fill);   // v281: CSS derives tint/edge per theme
      var conflictBadge = conflictIds[e.id]
        ? '<span class="k3-conflict-badge">⚠️ تعارض</span>'
        : '';
      var safeName = escapeHtml(e.patient_name || '—');
      var safeType = escapeHtml(e.type || '—');
      var timeStr = fmtTime12(e.time);
      var dur = parseInt(e.duration, 10) || 30;
      block.innerHTML = ''
        + '<div class="k3-appt-name">' + conflictBadge + safeName + getApptReliabBadge(e, true) + getApptSeriesBadge(e) + '</div>'
        + '<div class="k3-appt-meta">' + escapeHtml(timeStr) + ' • ' + dur + 'د • ' + safeType + '</div>';
      // Click → open edit modal. Drag is separate (HTML5 drag never fires
      // a click after drag, so the two don't conflict).
      block.addEventListener('click', function(){ editAppt(e.id); });
      // Drag events.
      block.addEventListener('dragstart', onK3ApptDragStart);
      block.addEventListener('dragend',   onK3ApptDragEnd);
      colEl.appendChild(block);
    });
  });
}

// Drag state. We use a module-scope var instead of dataTransfer payload only,
// so we have synchronous access to the dragged appointment in dragover (which
// needs to decide whether to highlight the target — but more importantly, so
// we can read the duration when computing the drop's new end time).
var _k3DragApptId = null;

function onK3ApptDragStart(ev) {
  // M141-ب: وضعُ القراءة — لا سحبَ أصلاً (يُلغى قبل أن يتحرّك الموعد بصرياً)
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) { try { ev.preventDefault(); } catch (e) {} return; }
  var el = ev.currentTarget || ev.target;
  if (!el || !el.dataset || !el.dataset.apptId) return;
  _k3DragApptId = el.dataset.apptId;
  el.classList.add('k3-dragging');
  // Setting dataTransfer is required for Firefox to actually fire the drop.
  try {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', _k3DragApptId);
  } catch (e) { /* some browsers throw on setData — non-fatal */ }
}

function onK3ApptDragEnd(ev) {
  var el = ev.currentTarget || ev.target;
  if (el && el.classList) el.classList.remove('k3-dragging');
  // Clear any stuck drag-over highlights (some browsers skip dragleave on drop).
  var stuck = document.querySelectorAll('.k3-drag-over');
  for (var i = 0; i < stuck.length; i++) stuck[i].classList.remove('k3-drag-over');
  _k3DragApptId = null;
}

function onK3SlotDragOver(ev, cellEl) {
  if (!_k3DragApptId) return;  // not our drag
  ev.preventDefault();          // required to allow drop
  try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
  if (cellEl && cellEl.classList) cellEl.classList.add('k3-drag-over');
}

function onK3SlotDragLeave(ev, cellEl) {
  if (cellEl && cellEl.classList) cellEl.classList.remove('k3-drag-over');
}

async function onK3SlotDrop(ev, cellEl) {
  ev.preventDefault();
  if (cellEl && cellEl.classList) cellEl.classList.remove('k3-drag-over');
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  var apptId = _k3DragApptId;
  if (!apptId) return;

  // Read target operatory + target start time from the cell's parent column.
  var colEl = cellEl.closest('.k3-chair-col');
  if (!colEl) return;
  var newOperatoryId = colEl.dataset.operatoryId || null;  // null = unassigned column
  var newSlotMin = parseInt(cellEl.dataset.slotMin, 10);
  if (!Number.isFinite(newSlotMin)) return;
  var newTime = _k3FormatTime(newSlotMin);  // "HH:MM"

  // Defensive: refuse to move inactive-doctor's appointments per the global
  // pattern used elsewhere on this page.
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن نقل المواعيد');
    return;
  }

  // Find the dragged appointment in our local state.
  var appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) {
    showToast('⚠️ الموعد غير موجود — أعد التحميل');
    return;
  }

  // Full lock: a FINISHED appointment cannot be moved at all (neither chair,
  // day, nor time). Finished = one of:
  //   • isFinishedStatus(status): completed (set when planned sessions are
  //     completed) / no_show / cancelled / broken, OR
  //   • dismissed_at set: the patient was dismissed via "🚪 خرج". The attendance
  //     stamp sets dismissed_at but NEVER changes status (see recordApptTime),
  //     so an appointment WITHOUT planned sessions gets dismissed with status
  //     unchanged — isFinishedStatus alone would miss it.
  // Criterion is the appointment's own status/attendance, NOT a linked session.
  // Semantic mirror of the same guard in onWkSlotDrop.
  if (isFinishedStatus(appt.status) || appt.dismissed_at) {
    showToast('🔒 موعد منتهٍ — لا يمكن تحريكه');
    return;
  }

  // Decide if anything actually changed. Both operatory_id and time can
  // change independently; if both are identical to current state, treat as
  // a no-op (user just dropped onto the same slot — common when releasing).
  var oldOp = appt.operatory_id || null;
  var oldTime = (appt.time || '').slice(0, 5);
  var sameOp = (oldOp === newOperatoryId);
  var sameTime = (oldTime === newTime);
  if (sameOp && sameTime) return;

  // Build the update payload — only what changed, to keep audit clean.
  var patch = {};
  if (!sameOp)   patch.operatory_id = newOperatoryId;
  if (!sameTime) patch.time = newTime + ':00';   // DB stores HH:MM:SS

  /* v495: حارسُ التعارض قبل النقل — نفسُ المصدر الواحد الذي تسأله نافذةُ الحفظ */
  if (window.SyDentConflict) {
    var _cfOk = await window.SyDentConflict.confirm(
      { id: appt.id, date: appt.date, time: newTime, duration: appt.duration,
        provider_id: appt.provider_id, operatory_id: newOperatoryId },
      { doctorId: currentUser.id, names: (typeof _cfNames === 'function') ? _cfNames() : null, verb: 'النقل' });
    if (!_cfOk) return;
  }

  try {
    var res = await window.sb.from('appointments')
      .update(patch)
      .eq('id', apptId)
      .eq('doctor_id', currentUser.id);  // RLS belt-and-braces
    if (res.error) {
      console.warn('K3 drop update:', res.error);
      showToast('❌ فشل نقل الموعد: ' + (res.error.message || ''));
      return;
    }
  } catch (e) {
    console.warn('K3 drop exception:', e);
    showToast('❌ فشل نقل الموعد');
    return;
  }

  // Audit log — best-effort, never blocks the user.
  if (window.logAudit) {
    var oldOpName = '';
    var newOpName = '';
    (OPERATORIES_ALL || []).forEach(function(o){
      if (o.id === oldOp) oldOpName = o.name || '';
      if (o.id === newOperatoryId) newOpName = o.name || '';
    });
    window.logAudit('appointment.edit', {
      entityId: apptId,
      patientId: appt.patient_id || null,
      patientName: appt.patient_name || null,
      description: 'نقل عبر سحب وإفلات في عرض الكراسي',
      oldValue: {
        operatory_id: oldOp,
        operatory_name: oldOpName,
        time: appt.time || null
      },
      newValue: {
        operatory_id: newOperatoryId,
        operatory_name: newOpName,
        time: patch.time || appt.time || null
      }
    });
  }

  showToast('✅ تم نقل الموعد');
  // Reload + repaint. Cheaper than mutating local state because there's only
  // one DB row in flight; the full reload also catches any concurrent edits
  // from another tab.
  await loadAppointments();
  render();
}


// ═══════════════════════════════════════════════════════════════════════════
// WEEK VIEW (additive) — columns are the 7 days of the week (Saturday-first),
// rows are time. Dragging an appointment to another day changes only its date
// (and time); the operatory is preserved (OpenDental/Dentrix model: the Day
// grid is split by rooms, the Week grid by days). This mirrors the chair grid
// structurally and REUSES its helpers, CSS (.k3-*) and drag handlers
// (_k3DragApptId / onK3ApptDragStart / onK3ApptDragEnd / onK3SlotDragOver /
// onK3SlotDragLeave). Only the DROP differs → onWkSlotDrop. The day view and
// its chair grid are provably untouched (they call onK3SlotDrop, not this).
//
// NOTE: onWkSlotDrop is a SEMANTIC MIRROR of onK3SlotDrop — any change to the
// drag/write logic of one must be reviewed against the other.
// ═══════════════════════════════════════════════════════════════════════════
function _wkWeekStart(d) {
  // Saturday-first week containing d. getDay(): Sun=0 … Sat=6.
  var base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var offsetToSat = (base.getDay() + 1) % 7;   // Sat→0, Sun→1, … Fri→6
  base.setDate(base.getDate() - offsetToSat);
  return base;
}

function renderWeek() {
  var gridEl = document.getElementById('weekGrid');
  if (!gridEl) return;
  var anchor = selectedDate || currentDate || new Date();
  var weekStart = _wkWeekStart(anchor);

  // Build the 7 day descriptors (Sat … Fri).
  var days = [];
  for (var i = 0; i < 7; i++) {
    var dObj = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    days.push({ dateObj: dObj, ds: dateStr(dObj), evts: apptsByDate(dateStr(dObj)) });
  }
  var todayDs = dateStr(new Date());

  // Header range title.
  var titleEl = document.getElementById('weekTitle');
  if (titleEl) {
    var a0 = days[0].dateObj, a6 = days[6].dateObj;
    titleEl.textContent = DAYS_AR[a0.getDay()] + ' ' + a0.getDate() + ' ' + MONTHS_AR[a0.getMonth()]
      + ' — ' + DAYS_AR[a6.getDay()] + ' ' + a6.getDate() + ' ' + MONTHS_AR[a6.getMonth()];
  }
  // Top nav label follows the week (was never written here → showed whatever
  // the previous view left behind). A week straddling two months names both.
  var monthEl = document.getElementById('calMonth');
  if (monthEl) {
    var w0 = days[0].dateObj, w6 = days[6].dateObj;
    // A week straddling two years names both (كانون الأول 2026 – كانون الثاني 2027).
    monthEl.textContent = (w0.getMonth() === w6.getMonth())
      ? MONTHS_AR[w0.getMonth()] + ' ' + w0.getFullYear()
      : (w0.getFullYear() === w6.getFullYear())
        ? MONTHS_AR[w0.getMonth()] + ' – ' + MONTHS_AR[w6.getMonth()] + ' ' + w6.getFullYear()
        : MONTHS_AR[w0.getMonth()] + ' ' + w0.getFullYear() + ' – ' + MONTHS_AR[w6.getMonth()] + ' ' + w6.getFullYear();
  }

  var weekEvts = [];
  days.forEach(function(day){ day.blocks = blocksForDay(day.ds); weekEvts = weekEvts.concat(day.evts); });   /* v498 */
  var weekBlocks = days.reduce(function(acc, day){ return acc.concat(day.blocks); }, []);
  var wh = _workHours();

  if (!weekEvts.length && !weekBlocks.length) {
    gridEl.innerHTML = '<div class="k3-empty-state"><div style="font-size:48px;margin-bottom:12px;">📅</div><div>لا توجد مواعيد في هذا الأسبوع</div></div>';
    return;
  }

  // Vertical time range across the whole week (reuse chair helper).
  var range = _k3ComputeRange(weekEvts.concat(_blockPseudoEvts(weekBlocks)));   /* v498 */
  var totalMins = range.endMin - range.startMin;
  var rowCount = Math.ceil(totalMins / K3_ROW_MINUTES);

  // ── Build grid skeleton ────────────────────────────────────────────────
  var html = '<div class="k3-chair-grid-inner">';

  html += '<div class="k3-time-col">';
  html += '<div class="k3-col-header" style="justify-content:center;color:var(--text2);">⏰</div>';
  for (var r = 0; r < rowCount; r++) {
    var slotMin = range.startMin + r * K3_ROW_MINUTES;
    html += '<div class="k3-time-cell">' + escapeHtml(_k3FormatTime(slotMin)) + '</div>';
  }
  html += '</div>';

  days.forEach(function(day, colIdx){
    var isToday = (day.ds === todayDs);
    var hdrCls = 'k3-col-header' + (isToday ? ' wk-col-header-today' : '');
    var hdrLabel = escapeHtml(DAYS_AR[day.dateObj.getDay()] + ' ' + day.dateObj.getDate());
    // Today's whole column is tinted (not just its header) — the header alone
    // was easy to miss on a busy week; also the pulse target for «اليوم».
    html += '<div class="wk-day-col' + (isToday ? ' wk-col-today' : '') + '" data-col-idx="' + colIdx + '" data-date="' + escapeHtml(day.ds) + '">';
    html += '<div class="' + hdrCls + '" style="justify-content:center;">' + hdrLabel + '</div>';
    for (var r2 = 0; r2 < rowCount; r2++) {
      var slotMin2 = range.startMin + r2 * K3_ROW_MINUTES;
      html += '<div class="k3-slot-cell' + _slotClosedCls(wh, day.ds, slotMin2) + '" data-slot-min="' + slotMin2 + '"'
            + ' ondragover="onK3SlotDragOver(event, this)"'
            + ' ondragleave="onK3SlotDragLeave(event, this)"'
            + ' ondrop="onWkSlotDrop(event, this)"></div>';
    }
    html += '</div>';
  });

  html += '</div>';
  gridEl.innerHTML = html;

  /* v498: الفتراتُ المغلقة بعمود يومها (كلُّ النطاقات — العرضُ الأسبوعي لا يفرّق كراسي) */
  days.forEach(function(day, colIdx){
    var colEl0 = gridEl.querySelector('.wk-day-col[data-col-idx="' + colIdx + '"]');
    if (colEl0) _paintBlocks(colEl0, day.blocks, range);
  });

  // ── Place appointment blocks + per-day conflict detection ──────────────
  days.forEach(function(day, colIdx){
    var colEl = gridEl.querySelector('.wk-day-col[data-col-idx="' + colIdx + '"]');
    if (!colEl) return;

    var items = [];
    day.evts.forEach(function(e){
      var startMin = _k3ParseTime(e.time);
      if (!Number.isFinite(startMin)) return;
      var dur = parseInt(e.duration, 10);
      if (!Number.isFinite(dur) || dur <= 0) dur = 30;
      items.push({ appt: e, startMin: startMin, endMin: startMin + dur });
    });
    items.sort(function(a,b){ return a.startMin - b.startMin; });

    var conflictIds = {};
    for (var x = 0; x < items.length; x++) {
      for (var y = x + 1; y < items.length; y++) {
        if (items[y].startMin < items[x].endMin) {
          conflictIds[items[x].appt.id] = true;
          conflictIds[items[y].appt.id] = true;
        } else break;
      }
    }

    items.forEach(function(item){
      var e = item.appt;
      var topPx = ((item.startMin - range.startMin) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX + 44;
      var heightPx = Math.max(24, ((item.endMin - item.startMin) / K3_ROW_MINUTES) * K3_ROW_HEIGHT_PX - 4);
      var bc = getApptColor(e);
      var block = document.createElement('div');
      block.className = 'k3-appt' + (conflictIds[e.id] ? ' k3-appt-conflict' : '');
      block.draggable = true;
      block.dataset.apptId = e.id;
      block.style.top = topPx + 'px';
      block.style.height = heightPx + 'px';
      block.style.setProperty('--bc', bc.fill);   // v281: CSS derives tint/edge per theme
      var conflictBadge = conflictIds[e.id] ? '<span class="k3-conflict-badge">⚠️ تعارض</span>' : '';
      var safeName = escapeHtml(e.patient_name || '—');
      var safeType = escapeHtml(e.type || '—');
      var durMin = parseInt(e.duration, 10) || 30;
      block.innerHTML = ''
        + '<div class="k3-appt-name">' + conflictBadge + safeName + getApptReliabBadge(e, true) + getApptSeriesBadge(e) + '</div>'
        + '<div class="k3-appt-meta">' + escapeHtml(fmtTime12(e.time)) + ' • ' + durMin + 'د • ' + safeType + '</div>';
      block.addEventListener('click', function(){ editAppt(e.id); });   // tap-to-edit (mobile alternative to drag)
      block.addEventListener('dragstart', onK3ApptDragStart);
      block.addEventListener('dragend',   onK3ApptDragEnd);
      colEl.appendChild(block);
    });
  });
}

// Drop handler for the week grid. Semantic mirror of onK3SlotDrop, but the
// target column carries a DATE (not an operatory), so it patches date + time
// and PRESERVES operatory_id. Same write path + RLS guard + audit as chair.
async function onWkSlotDrop(ev, cellEl) {
  ev.preventDefault();
  if (cellEl && cellEl.classList) cellEl.classList.remove('k3-drag-over');
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  var apptId = _k3DragApptId;
  if (!apptId) return;

  var colEl = cellEl.closest('.wk-day-col');
  if (!colEl) return;
  var newDate = colEl.dataset.date || null;
  if (!newDate) return;
  var newSlotMin = parseInt(cellEl.dataset.slotMin, 10);
  if (!Number.isFinite(newSlotMin)) return;
  var newTime = _k3FormatTime(newSlotMin);   // "HH:MM"

  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن نقل المواعيد');
    return;
  }

  var appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) {
    showToast('⚠️ الموعد غير موجود — أعد التحميل');
    return;
  }

  // Full lock: a FINISHED appointment cannot be moved at all. Finished =
  // isFinishedStatus(status) (completed via sessions / no_show / cancelled /
  // broken) OR dismissed_at set (patient dismissed via "🚪 خرج"; the stamp does
  // not change status, so a session-less dismissed appt would slip past a
  // status-only check). Semantic mirror of the guard in onK3SlotDrop.
  if (isFinishedStatus(appt.status) || appt.dismissed_at) {
    showToast('🔒 موعد منتهٍ — لا يمكن تحريكه');
    return;
  }

  var oldDate = appt.date || null;
  var oldTime = (appt.time || '').slice(0, 5);
  var sameDate = (oldDate === newDate);
  var sameTime = (oldTime === newTime);

  if (sameDate && sameTime) return;  // no-op

  // v335: حاضرٌ (وصل/جلس) بلا خروج — الوقتُ حرّ بنفس اليوم، والتاريخُ مقفول:
  // أختامُ الحضور تخصّ يومها، ونقلُها ليومٍ آخر يجعل الموعد «منتهياً» هناك.
  // المصدرُ الواحد apptMoveBlocked (appt-time.js) — نفسه بحارس المودال.
  var _mvMsg = apptMoveBlocked(appt, newDate, newTime, false);
  if (_mvMsg) { showToast(_mvMsg); return; }

  var patch = {};
  if (!sameDate) patch.date = newDate;
  if (!sameTime) patch.time = newTime + ':00';   // DB stores HH:MM:SS

  /* v495: حارسُ التعارض قبل النقل — نفسُ المصدر الواحد الذي تسأله نافذةُ الحفظ */
  if (window.SyDentConflict) {
    var _cfOk = await window.SyDentConflict.confirm(
      { id: appt.id, date: newDate, time: newTime, duration: appt.duration,
        provider_id: appt.provider_id, operatory_id: appt.operatory_id },
      { doctorId: currentUser.id, names: (typeof _cfNames === 'function') ? _cfNames() : null, verb: 'النقل' });
    if (!_cfOk) return;
  }
  // operatory_id intentionally NOT included → preserved across the day move.

  try {
    var res = await window.sb.from('appointments')
      .update(patch)
      .eq('id', apptId)
      .eq('doctor_id', currentUser.id);   // RLS belt-and-braces (same as chair)
    if (res.error) {
      console.warn('Week drop update:', res.error);
      showToast('❌ فشل نقل الموعد: ' + (res.error.message || ''));
      return;
    }
  } catch (e) {
    console.warn('Week drop exception:', e);
    showToast('❌ فشل نقل الموعد');
    return;
  }

  if (window.logAudit) {
    window.logAudit('appointment.edit', {
      entityId: apptId,
      patientId: appt.patient_id || null,
      patientName: appt.patient_name || null,
      description: 'نقل عبر سحب وإفلات في العرض الأسبوعي',
      oldValue: { date: oldDate, time: appt.time || null },
      newValue: { date: patch.date || oldDate, time: patch.time || appt.time || null }
    });
  }

  showToast('✅ تم نقل الموعد');
  await loadAppointments();
  render();
}


function renderList() {
  // Rolling view: header label + hidden nav are set by applyNavMode().
  // group by date, upcoming from today — Gap 1: exclude finished statuses
  // (completed/cancelled/broken/no_show) since they're not "upcoming" anymore.
  // Gap 7: also exclude planned appointments (they live in their own tab).
  // Dates are 'YYYY-MM-DD' strings → compare as strings (timezone-proof).
  const todayDs = dateStr(new Date());
  const groups = {};
  appointments
    .filter(a => !isPlannedAppt(a) && a.date && a.date >= todayDs && !isFinishedStatus(a.status))
    .sort((a,b) => (a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))
    .forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });

  if (Object.keys(groups).length === 0) {
    document.getElementById('listContent').innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text2)">
        <div style="font-size:48px;margin-bottom:12px">📅</div>
        <div style="font-size:16px;color:var(--text)">لا توجد مواعيد قادمة</div>
      </div>`;
    return;
  }

  let html = '';
  Object.entries(groups).forEach(([ds, evts]) => {
    const d  = new Date(ds + 'T00:00:00');
    const dn = DAYS_AR[d.getDay()]+' '+d.getDate()+' '+MONTHS_AR[d.getMonth()];
    const isToday = ds === dateStr(new Date());
    html += `<div class="list-group">
      <div class="list-date-header">
        ${dn}
        ${isToday ? '<span class="date-badge">اليوم</span>' : ''}
      </div>`;
    evts.forEach(e => {
      var lb = getApptLabBadge(e);
      var lbHtml = lb
        ? `<span class="tone tone-${lb.tone/* xss-ok: ثابت */}" style="display:inline-block;border-width:1px;border-style:solid;padding:1px 7px;border-radius:12px;font-size:11px;font-weight:700;margin-right:6px;" title="${lb.title/* xss-ok: getApptLabBadge عناوين ثابتة */}">${lb.icon}</span>`
        : '';
      var ps = getApptProceduresSummary(e.id);
      var psHtml = ps
        ? `<span class="cbadge" style="display:inline-block;--bc:var(--green);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-right:6px;" title="${ps.count} علاج — ${ps.costText}">🦷 ${ps.count}</span>`
        : '';
      var waHtml = getReminderBadgeHtml(e);
      var opHtml = getApptOperatoryBadge(e);
      html += `
        <div class="list-item" style="--bc:${getApptColor(e).fill};" onclick="editAppt('${e.id}')" onkeydown="if(event.key==='Enter'&&event.target===this)editAppt('${e.id}')" tabindex="0" role="button" data-test="appt-row" data-appt-id="${e.id}">
          <div class="list-time">${fmtTime12(e.time)}</div>
          <div class="list-avatar" style="--bc:${avatarColor(e.patient_name||'؟')/* xss-ok: الناتج لون لا نص */}">${escapeHtml(initials(e.patient_name||'؟'))}</div>
          <div class="list-info">
            <div class="list-name">${escapeHtml(e.patient_name)||'—'} ${lbHtml}${psHtml}${waHtml}${opHtml}${getApptMedBadge(e)}${getApptReliabBadge(e)/* xss-ok: SyDentReliability.badgeHtml أرقامٌ وعنوانٌ مهرَّب */}${getApptSeriesBadge(e)/* xss-ok: أرقامٌ فقط */}${getApptPtFlags(e)}${getApptAsapBadge(e)}</div>
            <div class="list-type">${escapeHtml(e.type)||'—'} — ${e.duration} دقيقة</div>
            ${renderTimeStrip(e)}
          </div>
          <span class="list-badge ${statusClass(e.status)}" data-test="appt-status">${statusLabel(e.status)}</span>
          <div class="list-actions sy-acts sy-slots" style="--sy-slots:__SY_SLOTS__" data-sub-write onclick="event.stopPropagation()">
            ${renderTimeActionBtn(e)}
            <button class="sy-act" data-slot="2" onclick="editAppt('${e.id}')">✏️ تعديل</button>
            <button class="sy-act sy-act-danger" data-slot="3" onclick="deleteAppt('${e.id}')" data-test="appt-delete">🗑️ حذف</button>
          </div>
        </div>`;
    });
    html += '</div>';
  });
  document.getElementById('listContent').innerHTML = SySlots.finalize(html, { 1: '84px', 2: '82px', 3: '80px' });   // v484: زرُّ المرحلة يُطوى حيث لا مرحلة
}

// ═══════════════════════════════════════════════════════════════
// P4 — تبويب "📞 الاتصالات": قائمة عمل مجمّعة للاستقبال.
// إضافي بالكامل: يعيد استخدام بنية التذكير/التأكيد الموجودة دون أي تعديل عليها.
//   • النافذة: مواعيد اليوم + الغد، غير المخطّطة وغير المنتهية.
//   • كل صف: تذكير واتساب (openWaReminderModal الموجود) + نسخ الرسالة (جديد،
//     للاتصال الهاتفي) + تأكيد (recordApptTime الموجود — يحدّث ويعيد الرسم تلقائياً).
//   • لا migration، لا جدول/صفحة جديدة، صفر لمس للمالية.
// ═══════════════════════════════════════════════════════════════
function isApptConfirmed(a) {
  return !!(a && (a.confirmation_status === 'confirmed' || a.confirmed_at));
}

function renderCalls() {
  // Rolling view: header label + hidden nav are set by applyNavMode().
  // نافذة الاتصالات مرتبطة بإعداد التذكير: نطابق سقف الـbadge بالضبط
  // (whatsapp_reminder_hours_before + 24) — فكل موعد عليه badge "أرسل تذكير"
  // يظهر هنا أيضاً، صفر تناقض. المواعيد القادمة فقط. افتراضي 24 لو الإعداد غائب.
  var cfgHours = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_reminder_hours_before) || 24;
  var windowH = cfgHours + 24;
  var nowMs = Date.now();
  function _apptDiffH(a) {
    var timeStr = (a.time && /^\d{2}:\d{2}/.test(a.time)) ? a.time.slice(0,5) : '12:00';
    var d = new Date(a.date + 'T' + timeStr + ':00');
    if (isNaN(d.getTime())) return null;
    return (d.getTime() - nowMs) / 36e5;
  }

  var rows = appointments
    .filter(function(a){
      if (!a || !a.date || isPlannedAppt(a) || isFinishedStatus(a.status)) return false;
      var diff = _apptDiffH(a);
      return diff !== null && diff >= 0 && diff <= windowH;
    })
    .sort(function(a,b){ return (a.date+(a.time||'')).localeCompare(b.date+(b.time||'')); });

  if (rows.length === 0) {
    document.getElementById('callsContent').innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:var(--text2)">'
      + '<div style="font-size:48px;margin-bottom:12px">📞</div>'
      + '<div style="font-size:16px;color:var(--text)">لا مواعيد ضمن نافذة التذكير بحاجة لاتصال</div>'
      + '</div>';
    return;
  }

  var needCount = rows.filter(function(a){ return !isApptConfirmed(a); }).length;
  var html =
    '<div style="padding:10px 14px;margin-bottom:10px;background:var(--bg4,rgba(255,255,255,0.04));border-radius:10px;font-size:13px;color:var(--text2);">'
    + '📞 قائمة الاتصالات — ' + (needCount > 0
        ? ('<b style="color:var(--text)">' + needCount + '</b> موعد بحاجة تأكيد')
        : 'كل المواعيد مؤكّدة ✅')
    + ' <span style="opacity:0.7;">· خلال ' + Math.round(windowH) + ' ساعة</span>'
    + '</div>';

  // تجميع ديناميكي حسب اليوم — اليوم/غداً/بعد غد ثم التاريخ لباقي الأيام.
  var todayMid = new Date(); todayMid.setHours(0,0,0,0);
  var byDate = {};
  rows.forEach(function(a){ (byDate[a.date] = byDate[a.date] || []).push(a); });

  Object.keys(byDate).sort().forEach(function(ds){
    var evts = byDate[ds];
    var d = new Date(ds + 'T00:00:00');
    var dn = DAYS_AR[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_AR[d.getMonth()];
    var diffDays = Math.round((d.getTime() - todayMid.getTime()) / 86400000);
    var lbl = (diffDays === 0) ? 'اليوم' : (diffDays === 1) ? 'غداً' : (diffDays === 2) ? 'بعد غد' : '';
    html += '<div class="list-group"><div class="list-date-header">' + dn
      + (lbl ? ' <span class="date-badge">' + lbl + '</span>' : '') + '</div>';
    evts.forEach(function(e){
      var confirmed = isApptConfirmed(e);
      var phone = (typeof resolvePatientPhoneForAppt === 'function') ? resolvePatientPhoneForAppt(e) : null;
      var waHtml = getReminderBadgeHtml(e);
      var confChip = confirmed ? '<span class="list-badge status-confirmed">📞 مؤكّد</span>' : '';
      var waBtn = phone
        ? '<button class="sy-act" data-slot="1" data-sub-write title="تذكير واتساب" onclick="event.stopPropagation(); openWaReminderModal(\'' + e.id + '\')">📱 واتساب</button>'
        : '<button class="sy-act" data-slot="1" data-sub-write title="لا رقم هاتف مسجّل" disabled>📱 واتساب</button>';
      var copyBtn = '<button class="sy-act" data-slot="2" title="نسخ رسالة التذكير" onclick="event.stopPropagation(); copyApptMessage(\'' + e.id + '\', this)">📋 نسخ</button>';
      var confBtn = confirmed ? ''
        : '<button class="sy-act sy-act-primary" data-slot="3" data-sub-write title="تم التأكيد" onclick="event.stopPropagation(); recordApptTime(\'' + e.id + '\', \'confirmed_at\', this)">✅ تم التأكيد</button>';
      html +=
        '<div class="list-item show-acts" style="border-right:3px solid ' + getApptColor(e).fill + ';' + (confirmed ? 'opacity:0.6;' : '') + '" onclick="editAppt(\'' + e.id + '\')">'
        + '<div class="list-time">' + fmtTime12(e.time) + '</div>'
        + '<div class="list-avatar" style="--bc:' + avatarColor(e.patient_name||'؟') + '">'   /* v283: was hex+alpha on a var() → no background */ + escapeHtml(initials(e.patient_name||'؟')) + '</div>'
        + '<div class="list-info">'
        +   '<div class="list-name">' + (escapeHtml(e.patient_name)||'—') + ' ' + waHtml + ' ' + confChip + getApptMedBadge(e) + getApptReliabBadge(e) + getApptSeriesBadge(e) + getApptPtFlags(e) + getApptAsapBadge(e) + '</div>'
        +   '<div class="list-type">' + (phone ? ('📞 ' + escapeHtml(phone)) : 'لا رقم هاتف') + ' — ' + (escapeHtml(e.type)||'—') + '</div>'
        + '</div>'
        + '<div class="list-actions sy-acts sy-slots" style="--sy-slots:__SY_SLOTS__" onclick="event.stopPropagation()">' + waBtn + copyBtn + confBtn + '</div>'   /* v482: واتساب · نسخ · تم التأكيد بأعمدةٍ ثابتة */
        + '</div>';
    });
    html += '</div>';
  });

  document.getElementById('callsContent').innerHTML = SySlots.finalize(html, { 1: '92px', 2: '76px', 3: '102px' });   // v484
}

// نسخ رسالة التذكير للحافظة (للاتصال الهاتفي / المرضى بلا واتساب) — يعيد استخدام buildWaMessage.
async function copyApptMessage(apptId, btnEl) {
  var appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) return;
  var msg = (typeof buildWaMessage === 'function') ? buildWaMessage(appt) : '';
  if (!msg) { showToast('تعذّر بناء الرسالة'); return; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(msg);
    } else {
      var ta = document.createElement('textarea');
      ta.value = msg; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    showToast('📋 تم نسخ الرسالة');
  } catch (e) {
    console.warn('copyApptMessage failed:', e);
    showToast('تعذّر النسخ — انسخ يدوياً');
  }
}

