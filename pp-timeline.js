/* ═══════════════════════════════════════════════════════════════
   pp-timeline.js — الخط الزمني للمريض (Phase 2B-A)
   (تفكيك patient-profile — الاستخراج ١١: 575 سطراً بايت-بايت)

   تعريفات صرفة فقط — صفر تنفيذ top-level (درس v50). يُحمَّل قبل
   الكتلة الرئيسية التي تملك كل الحالة المشتركة (sessions · payments ·
   paymentSplits · labOrders · allAppointmentsForTl · timelineFilters ·
   timelineShownCount · TL_PAGE_SIZE · _tlSearchDebounce · currentUser ·
   patientId) — الوصول runtime حصراً.

   طبقة عرض بحتة: صفر كتابة مالية · صفر مرايا محروسة.
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   Phase 2B-A — Patient Timeline functions
   Aggregates events from sessions, payments, appointments, lab
   orders, unearned splits, and reminder logs into one sortable list.
   ═══════════════════════════════════════════════════════════════ */

/* Fetch ALL appointments (loadAll only fetches upcoming for linking).
   Failures are non-fatal — we just degrade to whatever's already loaded. */
async function loadAllAppointmentsForTimeline() {
  allAppointmentsForTl = [];
  if (!currentUser || !patientId) return;
  try {
    var res = await window.sb.from('appointments')
      .select('id, date, time, type, status, provider_id, notes, created_at, is_planned, duration, treatment_id, arrived_at, seated_at, dismissed_at')   /* v336: أختامُ الحضور لتبويب المواعيد */
      .eq('patient_id', patientId)
      .eq('doctor_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (res.error) {
      // Some legacy DBs may not have is_planned column — retry without it.
      var m = (res.error.message || '').toLowerCase();
      if (m.indexOf('is_planned') !== -1 || res.error.code === '42703') {
        var res2 = await window.sb.from('appointments')
          .select('id, date, time, type, status, provider_id, notes, created_at, duration')
          .eq('patient_id', patientId)
          .eq('doctor_id', currentUser.id)
          .order('created_at', { ascending: false });
        if (!res2.error) allAppointmentsForTl = res2.data || [];
        else console.warn('timeline appts load (retry):', res2.error);
      } else {
        console.warn('timeline appts load:', res.error);
      }
    } else {
      allAppointmentsForTl = res.data || [];
    }
  } catch(e) {
    console.warn('timeline appts fetch failed:', e);
  }
}

/* Parse any timestamp-ish value (ISO string, Date) → epoch ms.
   Falls back to 0 (oldest) so unknown timestamps sink to bottom. */
function tlTs(val) {
  if (!val) return 0;
  try {
    var t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  } catch(_) { return 0; }
}

/* For sessions/payments with both `date` (day) and `created_at` (datetime),
   prefer the datetime if same day, else use the date at noon (avoids TZ flips). */
function tlBestTs(dateStr, createdAt) {
  var dt = tlTs(createdAt);
  if (!dateStr) return dt;
  var dayPart = String(dateStr).slice(0, 10);
  var createdDay = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : null;
  if (createdDay && createdDay === dayPart) return dt;
  // Use noon UTC so the row sorts to mid-day, regardless of local TZ.
  return tlTs(dayPart + 'T12:00:00Z');
}

/* Build unified event list. Returns array sorted DESC by timestamp. */
function buildTimelineEvents() {
  var events = [];

  // ── 1. Sessions ──
  (sessions || []).forEach(function(s) {
    var prov = (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS || []).find(function(d){ return d.id === s.provider_id; });
    var typeMatch = (Array.isArray(TREATMENTS) ? TREATMENTS : [])
      .find(function(t){ return t.name === s.type; });
    var st = s.status || 'completed';
    events.push({
      type: 'session',
      icon: '🦷',
      ts: tlBestTs(s.date, s.created_at),
      data: s,
      providerName: prov ? prov.name : '',
      providerColor: prov ? (prov.color || '#0d8577') : null,
      typeFill: typeMatch ? typeMatch.fill : 'var(--blue)',
      statusKey: st,
      statusLabel: STATUS_LABELS[st] || st,
      statusColor: STATUS_COLORS[st] || 'var(--blue)',
      statusTone: (typeof STATUS_TONES !== 'undefined' && STATUS_TONES[st]) || 'blue',
      searchHay: [
        s.type, s.tooth_num, s.description, s.notes, s.surface,
        // Phase 3 Feature G: include regional metadata in search
        s.quadrant, s.arch,
        s.quadrant ? QUADRANT_LABELS[s.quadrant] : '',
        s.arch ? ARCH_LABELS[s.arch] : '',
        prov ? prov.name : '', STATUS_LABELS[st] || ''
      ].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // ── 2. Payments (with manual-allocation badge) ──
  (payments || []).forEach(function(p) {
    events.push({
      type: 'payment',
      icon: '💰',
      ts: tlBestTs(p.date, p.created_at),
      data: p,
      isManual: p.manual_allocation === true,
      searchHay: [p.method, p.notes, p.amount].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // ── 3. Appointments (all of them — past, future, planned, cancelled) ──
  // Inline status label map — patient-profile.html doesn't import the
  // APPT_STATUS_LABELS constant from appointments.html. Defined once outside
  // the forEach loop to avoid per-iteration allocation. Includes 'pending'
  // (legacy/transitional status used by appointments.html).
  var APPT_STATUS_AR = {
    scheduled: 'غير مؤكد', confirmed: 'مؤكّد', pending: 'معلّق',
    arrived: 'وصل المريض', in_chair: 'على الكرسي', completed: 'مكتمل',
    cancelled: 'ملغي', broken: 'عدم حضور', no_show: 'عدم حضور'
  };
  (allAppointmentsForTl || []).forEach(function(a) {
    var prov = (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS || []).find(function(d){ return d.id === a.provider_id; });
    // Use created_at (when the event was logged in the system) so the timeline
    // shows when the appointment was *recorded* in the system — not its
    // scheduled date/time. The scheduled date/time still appear inside the row
    // title via dateLabel. Fallback to the legacy date+time logic only if
    // created_at is missing (defensive — Postgres NOT NULL should prevent this).
    var ts = tlTs(a.created_at);
    if (!ts) {
      if (a.date && a.time) {
        // Some DBs return time as 'HH:MM:SS', others 'HH:MM' — normalize to 5 chars.
        var t = String(a.time).slice(0, 5);
        ts = tlTs(a.date + 'T' + t + ':00');
        if (!ts) ts = tlBestTs(a.date, a.created_at);
      } else if (a.date) {
        ts = tlBestTs(a.date, a.created_at);
      }
    }
    var statusLabel = APPT_STATUS_AR[a.status] || a.status || '—';
    events.push({
      type: 'appointment',
      icon: '📅',
      ts: ts,
      data: a,
      providerName: prov ? prov.name : '',
      providerColor: prov ? (prov.color || '#0d8577') : null,
      statusKey: a.status,
      statusLabel: statusLabel,
      isPlanned: a.is_planned === true,
      searchHay: [
        a.type, a.notes, statusLabel,
        prov ? prov.name : '', a.date, a.time
      ].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // ── 4. Lab orders ──
  (labOrders || []).forEach(function(lo) {
    var st = LAB_STATUSES[lo.status] || LAB_STATUSES['sent'];
    var labDisplay = lo.lab_name || '';
    if (lo.lab_id) {
      var lObj = (allLabs || []).find(function(x){ return x.id === lo.lab_id; });
      if (lObj) labDisplay = lObj.name;
    }
    events.push({
      type: 'lab',
      icon: '🥽',
      ts: tlBestTs(lo.date_sent, lo.created_at),
      data: lo,
      labName: labDisplay,
      statusLabel: st ? st.ar : (lo.status || ''),
      statusColor: st ? st.color : 'var(--text3)',
      statusTone: (st && st.tone) || 'gray',
      searchHay: [
        lo.work_type, lo.tooth_num, labDisplay, lo.shade, lo.notes,
        st ? st.ar : ''
      ].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // ── 5. Unearned credits (only the unearned splits — one event per split row) ──
  (paymentSplits || []).filter(function(sp){ return sp.is_unearned === true; }).forEach(function(sp) {
    // Pair to its payment for date display
    var pay = (payments || []).find(function(pp){ return pp.id === sp.payment_id; });
    var dateForTs = (pay && pay.date) || sp.payment_date || sp.created_at;
    events.push({
      type: 'unearned',
      icon: '💵',
      ts: tlBestTs(dateForTs, sp.created_at),
      data: sp,
      payment: pay || null,
      searchHay: ['رصيد مقدّم', 'unearned', sp.amount, sp.notes].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // ── 6. WhatsApp reminders (use lastReminderLogByAppt populated by ppLoadReminderLogs) ──
  Object.keys(lastReminderLogByAppt || {}).forEach(function(apptId) {
    var log = lastReminderLogByAppt[apptId];
    if (!log) return;
    var appt = (allAppointmentsForTl || []).find(function(a){ return a.id === apptId; });
    events.push({
      type: 'reminder',
      icon: '📱',
      ts: tlTs(log.sent_at || log.created_at),
      data: log,
      relatedAppt: appt || null,
      searchHay: ['تذكير', 'whatsapp', log.status, log.message_text, log.recipient_phone].filter(Boolean).join(' ').toLowerCase()
    });
  });

  // Sort newest first; stable tie-break by type then id so same-second events
  // don't reshuffle on re-render.
  events.sort(function(a, b) {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    var aid = (a.data && a.data.id) || '';
    var bid = (b.data && b.data.id) || '';
    return aid < bid ? -1 : (aid > bid ? 1 : 0);
  });

  return events;
}

/* Apply current filter state. Pure function — returns filtered array. */
function applyTimelineFilters(events) {
  var f = timelineFilters;
  // Compute date cutoff (epoch ms) once per call.
  var cutoffStart = null, cutoffEnd = null;
  var now = new Date();
  var todayY = now.getFullYear();
  if (f.dateRange === '7d') {
    cutoffStart = Date.now() - 7 * 86400000;
  } else if (f.dateRange === '30d') {
    cutoffStart = Date.now() - 30 * 86400000;
  } else if (f.dateRange === '90d') {
    cutoffStart = Date.now() - 90 * 86400000;
  } else if (f.dateRange === 'year') {
    cutoffStart = new Date(todayY, 0, 1).getTime();
  } else if (f.dateRange === 'lastyear') {
    cutoffStart = new Date(todayY - 1, 0, 1).getTime();
    cutoffEnd   = new Date(todayY, 0, 1).getTime();
  }
  var q = (f.search || '').trim().toLowerCase();

  return events.filter(function(e) {
    if (!f.types[e.type]) return false;
    if (cutoffStart !== null && e.ts < cutoffStart) return false;
    if (cutoffEnd   !== null && e.ts >= cutoffEnd) return false;
    if (q && (e.searchHay || '').indexOf(q) === -1) return false;
    return true;
  });
}

/* Format ts → "15/5/2026 — 02:30 PM" (v487: المُنسّق الموحّد SyDT). */
function tlFormatDateTime(ts) {
  if (!ts) return '—';
  try {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return SyDT.numDate(d) + ' — ' + SyDT.time12(d);   // v487: السجلُّ الكامل أرقاماً ووقتاً (كان «15 أيار 2026 — …»)
  } catch(_) { return '—'; }
}

/* Render one event row. Returns HTML string. All user-controlled text passes
   through escapeHtml(). */
function renderTimelineRow(e) {
  var cls = 'tl-row tl-' + (e.type === 'appointment' ? 'appt' : e.type);
  var timeStr = tlFormatDateTime(e.ts);
  var title = '', meta = '', notes = '';

  if (e.type === 'session') {
    var s = e.data;
    // Show surface only when it's a specific surface (not WHOLE = full tooth).
    // Translate raw surface codes (O, I, M, D, B, L, V, R1-R3) to Arabic
    // labels for end-user readability. Falls back to the raw code if unknown
    // (defensive: future surface keys would still display, just untranslated).
    var rawSurface = s.surface;
    var surfaceShown = (rawSurface && rawSurface !== 'WHOLE')
      ? surfLabelFor(rawSurface, s.tooth_num)
      : null;
    var toothPart;
    if (s.tooth_num) {
      toothPart = ' — السن ' + escapeHtml(String(s.tooth_num)) + (surfaceShown ? ' (' + escapeHtml(String(surfaceShown)) + ')' : '');
    } else if (s.quadrant && QUADRANT_LABELS[s.quadrant]) {
      // Phase 3 Feature G: regional session in timeline
      toothPart = ' — ' + escapeHtml(QUADRANT_LABELS[s.quadrant]);
    } else if (s.arch && ARCH_LABELS[s.arch]) {
      toothPart = ' — ' + escapeHtml(ARCH_LABELS[s.arch]);
    } else {
      toothPart = '';  // 'mouth' or legacy session — description carries the scope
    }
    title = escapeHtml(s.type || 'جلسة') + toothPart;
    var statusBadge = '<span class="tl-badge cbadge tone tone-' + e.statusTone + '">' + escapeHtml(e.statusLabel) + '</span>';
    var costPart = (parseFloat(s.cost) || 0) > 0
      ? '<span>التكلفة: <b>' + fmt(s.cost) + ' ' + curLblOf(s.currency) + '</b></span>'
      : '';
    var provPart = e.providerName
      ? '<span>👨‍⚕️ <b style="color:' + e.providerColor + ';">' + escapeHtml(e.providerName) + '</b></span>'
      : '';
    meta = statusBadge + costPart + provPart;
    if (s.description) notes += escapeHtml(s.description);
    if (s.notes) notes += (notes ? '\n' : '') + escapeHtml(s.notes);
  }
  else if (e.type === 'payment') {
    var p = e.data;
    title = 'دفعة: ' + fmt(p.amount) + ' ' + curLblOf(p.currency);
    var methodBadge = '<span class="tl-badge" style="background:rgba(var(--green-rgb),0.15);color:var(--green);border-color:rgba(var(--green-rgb),0.4);">' + escapeHtml(p.method || '—') + '</span>';
    var manualBadge = e.isManual
      ? '<span class="tl-badge tone tone-blue" title="موزّعة يدوياً">يدوي</span>'
      : '';
    meta = methodBadge + manualBadge;
    if (p.notes) notes = escapeHtml(p.notes);
  }
  else if (e.type === 'appointment') {
    var a = e.data;
    // Scheduled date/time go in the TITLE (this is the planned moment of the
    // appointment). The system-recorded timestamp (when the user added the
    // event in the DB) appears separately on the right via tl-row-time, sourced
    // from a.created_at — see buildTimelineEvents() above.
    var dateLabel = a.date
      ? ('📅 ' + escapeHtml(String(a.date)) + (a.time ? ' الساعة ' + escapeHtml(fmtTime12(String(a.time))) : ''))
      : '📋 موعد مخطّط (بلا تاريخ)';
    title = escapeHtml(a.type || 'موعد') + ' — ' + dateLabel;
    var stColor = 'var(--blue)';
    if (e.statusKey === 'completed') stColor = 'var(--green)';
    else if (e.statusKey === 'cancelled' || e.statusKey === 'no_show' || e.statusKey === 'broken') stColor = 'var(--text3)';
    var statBadge2 = '<span class="tl-badge cbadge" style="--bc:' + stColor + ';">' + escapeHtml(e.statusLabel || '—') + '</span>';
    var plannedBadge = e.isPlanned
      ? '<span class="tl-badge tone tone-yellow">مخطّط</span>'
      : '';
    var provPart2 = e.providerName
      ? '<span>👨‍⚕️ <b style="color:' + e.providerColor + ';">' + escapeHtml(e.providerName) + '</b></span>'
      : '';
    meta = statBadge2 + plannedBadge + provPart2;
    if (a.notes) notes = escapeHtml(a.notes);
  }
  else if (e.type === 'lab') {
    var lo = e.data;
    var toothPart2 = lo.tooth_num ? ' — السن ' + escapeHtml(String(lo.tooth_num)) : '';
    title = '🥽 ' + escapeHtml(lo.work_type || 'طلب مخبر') + toothPart2;
    var statBadge3 = '<span class="tl-badge cbadge tone tone-' + e.statusTone + '">' + escapeHtml(e.statusLabel) + '</span>';
    var labPart = e.labName
      ? '<span>المخبر: <b>' + escapeHtml(e.labName) + '</b></span>'
      : '';
    var shadePart = lo.shade ? '<span>اللون: <b>' + escapeHtml(lo.shade) + '</b></span>' : '';
    var costPart2 = (parseFloat(lo.cost) || 0) > 0
      ? '<span>التكلفة: <b>' + fmt(lo.cost) + ' ' + curLblOf(lo.currency) + '</b></span>'
      : '';
    meta = statBadge3 + labPart + shadePart + costPart2;
    if (lo.notes) notes = escapeHtml(lo.notes);
  }
  else if (e.type === 'unearned') {
    var sp = e.data;
    title = '💵 رصيد مقدّم: ' + fmt(sp.amount) + ' ' + curLblOf(sp.currency);
    var origPart = e.payment
      ? '<span>من دفعة بتاريخ <b>' + escapeHtml(String(e.payment.date || '—')) + '</b></span>'
      : '';
    meta = '<span class="tl-badge cbadge tone tone-cyan">غير موزّع</span>' + origPart;
    if (sp.notes) notes = escapeHtml(sp.notes);
  }
  else if (e.type === 'reminder') {
    var lg = e.data;
    title = '📱 تذكير WhatsApp';
    var stColor2 = 'var(--orange)';
    var stLabel = 'تم الإرسال';
    if (lg.status === 'failed')    { stColor2 = 'var(--red)'; stLabel = 'فشل الإرسال'; }
    else if (lg.status === 'pending') { stColor2 = 'var(--yellow)'; stLabel = 'قيد الإرسال'; }
    else if (lg.status === 'sent' || lg.status === 'delivered' || lg.status === 'read') {
      stColor2 = 'var(--green)'; stLabel = 'تم الإرسال';
    }
    var stBadge4 = '<span class="tl-badge cbadge" style="--bc:' + stColor2 + ';">' + escapeHtml(stLabel) + '</span>';
    var phonePart = lg.recipient_phone
      ? '<span>الهاتف: <b>' + escapeHtml(String(lg.recipient_phone)) + '</b></span>'
      : '';
    var apptLink = '';
    if (e.relatedAppt && e.relatedAppt.date) {
      apptLink = '<span>موعد <b>' + escapeHtml(String(e.relatedAppt.date)) + '</b></span>';
    }
    meta = stBadge4 + phonePart + apptLink;
    if (lg.message_text) notes = escapeHtml(lg.message_text);
  }

  return '<div class="' + cls + '">'
    + '<div class="tl-row-icon">' + e.icon + '</div>'
    + '<div class="tl-row-body">'
      + '<div class="tl-row-head">'
        + '<span class="tl-row-title">' + title + '</span>'
        + '<span class="tl-row-time">' + timeStr + '</span>'
      + '</div>'
      + (meta ? '<div class="tl-row-meta">' + meta + '</div>' : '')
      + (notes ? '<div class="tl-row-notes">' + notes + '</div>' : '')
    + '</div>'
  + '</div>';
}

/* Master render: builds events → filters → paginates → injects DOM. */
function renderTimeline() {
  /* v336: تبويبُ المواعيد يقرأ المصفوفةَ نفسها، وrenderTimeline نقطةُ المرور لكل
     تغيّر بيانات بالبطاقة — فيُحدَّث معها. محروس: فشلُه لا يمسّ السجل. */
  try { if (typeof renderApptsTab === 'function') renderApptsTab(); } catch (e) { console.warn('renderApptsTab:', e); }
  var container = document.getElementById('tlContent');
  var countEl = document.getElementById('tlCount');
  var pagEl = document.getElementById('tlPagination');
  if (!container) return;

  // Distinguish two empty states:
  //   (a) The patient genuinely has no events yet — show a friendly "get started" hint.
  //   (b) The patient has events, but the current filters hide all of them
  //       — show a reset hint so the user understands it's a filter issue.
  var allEvents = buildTimelineEvents();
  var events = applyTimelineFilters(allEvents);

  if (events.length === 0) {
    if (allEvents.length === 0) {
      // Case (a): brand-new patient with nothing logged
      container.innerHTML = '<div class="tl-empty">'
        + '<div class="tl-empty-icon">📭</div>'
        + 'لا توجد أحداث بعد لهذا المريض<br>'
        + '<span style="font-size:11px;color:var(--text2);" data-sub-write>ابدأ بتسجيل جلسة، موعد، أو دفعة من التبويبات الأخرى</span>'
        + '</div>';
    } else {
      // Case (b): events exist but filters hide them all. Tell the user
      // WHY — which type/date filter is currently active — and which
      // event types ARE available in the unfiltered data, so they can
      // see what's reachable with one click.
      var typeLabels = {
        session: '🦷 جلسات', payment: '💰 دفعات', appointment: '📅 مواعيد',
        lab: '🥽 مخابر', unearned: '💵 رصيد مقدّم', reminder: '📱 تذكيرات'
      };
      var activeTypeKeys = Object.keys(timelineFilters.types)
        .filter(function(k){ return timelineFilters.types[k]; });
      var dateRangeLabels = {
        '7d': 'آخر 7 أيام', '30d': 'آخر 30 يوم', '90d': 'آخر 90 يوم',
        'year': 'هذه السنة', 'lastyear': 'السنة الماضية'
      };
      // Which event types DO exist in the unfiltered set? Use to hint
      // the user toward filters that would actually return results.
      var availableTypes = {};
      allEvents.forEach(function(ev){ availableTypes[ev.type] = true; });

      var hintLines = [];
      if (activeTypeKeys.length < 6) {
        hintLines.push(
          'النوع المحدّد: <b>' +
          activeTypeKeys.map(function(k){ return typeLabels[k] || k; }).join('، ') +
          '</b>'
        );
      }
      if (timelineFilters.dateRange !== 'all' && dateRangeLabels[timelineFilters.dateRange]) {
        hintLines.push('النطاق الزمني: <b>' + dateRangeLabels[timelineFilters.dateRange] + '</b>');
      }
      if (timelineFilters.search) {
        hintLines.push('البحث: <b>"' + escapeHtml(timelineFilters.search) + '"</b>');
      }
      var availableHint = '';
      var availableKeys = Object.keys(availableTypes);
      if (availableKeys.length > 0 && availableKeys.length < 6) {
        availableHint = '<div style="font-size:11px;color:var(--text2);margin-top:8px;">'
          + 'المتاح لهذا المريض: '
          + availableKeys.map(function(k){ return typeLabels[k] || k; }).join('، ')
          + '</div>';
      }

      container.innerHTML = '<div class="tl-empty">'
        + '<div class="tl-empty-icon">🗓️</div>'
        + 'لا توجد أحداث تطابق الفلاتر المحدّدة'
        + (hintLines.length
            ? '<div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.7;">'
              + hintLines.join('<br>') + '</div>'
            : '')
        + availableHint
        + '<button class="tl-load-more" style="margin-top:14px;" onclick="resetTimelineFilters()">🔄 إعادة ضبط الفلاتر</button>'
        + '</div>';
    }
    if (countEl) countEl.textContent = '';
    if (pagEl) pagEl.style.display = 'none';
    return;
  }

  // Clamp shown count to total (in case filters reduced the set).
  if (timelineShownCount < TL_PAGE_SIZE) timelineShownCount = TL_PAGE_SIZE;
  var sliced = events.slice(0, timelineShownCount);
  container.innerHTML = sliced.map(renderTimelineRow).join('');

  if (countEl) {
    countEl.textContent = 'يعرض ' + sliced.length + ' من ' + events.length + ' حدث';
  }
  if (pagEl) {
    pagEl.style.display = (events.length > sliced.length) ? 'flex' : 'none';
  }
}

/* Reset all timeline filters to their initial state (called from empty-state CTA). */
function resetTimelineFilters() {
  Object.keys(timelineFilters.types).forEach(function(k){ timelineFilters.types[k] = true; });
  timelineFilters.dateRange = 'all';
  timelineFilters.search = '';
  // Sync UI controls
  document.querySelectorAll('.tl-chip[data-tl-type]').forEach(function(chip){
    chip.classList.add('active');
  });
  var dr = document.getElementById('tlDateRange');
  if (dr) dr.value = 'all';
  var sr = document.getElementById('tlSearch');
  if (sr) sr.value = '';
  timelineShownCount = TL_PAGE_SIZE;
  renderTimeline();
}

/* Type-chip behavior (Gmail-style filter chips):
 *   - "الكل"                 → enable every type
 *   - any other chip         → switch to "this type only" (single-select)
 *   - same chip clicked twice while it's the only active one → re-enable all
 *
 * Rationale: users expect filter chips to BEHAVE like filters
 * (i.e. "show me only X"), not toggles. The previous toggle behavior
 * made it easy to end up with surprising hidden subsets — and worst,
 * empty timelines that look like the data is gone. This single-select
 * mode matches how filter chips work in Gmail, Notion, Linear, etc.
 *
 * Compatibility: the underlying state (timelineFilters.types booleans)
 * is unchanged, so applyTimelineFilters() needs no edits.
 */
function onTlTypeChip(typeKey) {
  var types = timelineFilters.types;
  var allKeys = Object.keys(types);

  if (typeKey === 'all') {
    // Master "all" chip: always enables every type.
    allKeys.forEach(function(k){ types[k] = true; });
  } else {
    // Count how many types are currently active.
    var activeKeys = allKeys.filter(function(k){ return types[k]; });
    var isOnlyActive = activeKeys.length === 1 && activeKeys[0] === typeKey;

    if (isOnlyActive) {
      // Second click on the solo-active chip → expand back to all.
      allKeys.forEach(function(k){ types[k] = true; });
    } else {
      // Switch to "show only this type" — turn everything off, then on.
      allKeys.forEach(function(k){ types[k] = (k === typeKey); });
    }
  }

  // Refresh chip UI to mirror the new state.
  document.querySelectorAll('.tl-chip[data-tl-type]').forEach(function(chip){
    var key = chip.getAttribute('data-tl-type');
    if (key === 'all') {
      var allOn = allKeys.every(function(k){ return types[k]; });
      chip.classList.toggle('active', allOn);
    } else {
      chip.classList.toggle('active', !!types[key]);
    }
  });

  // Reset pagination so user sees freshly-filtered top items.
  timelineShownCount = TL_PAGE_SIZE;
  renderTimeline();
}

function onTlDateRangeChange(val) {
  timelineFilters.dateRange = val || 'all';
  timelineShownCount = TL_PAGE_SIZE;
  renderTimeline();
}

/* Debounced search to avoid re-render on every keystroke. */
function onTlSearchInput(val) {
  if (_tlSearchDebounce) clearTimeout(_tlSearchDebounce);
  _tlSearchDebounce = setTimeout(function(){
    timelineFilters.search = val || '';
    timelineShownCount = TL_PAGE_SIZE;
    renderTimeline();
  }, 220);
}

function onTlLoadMore() {
  timelineShownCount += TL_PAGE_SIZE;
  renderTimeline();
}
