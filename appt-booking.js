/* SyDent — appt-booking.js: موديول طلبات الحجز الإلكتروني (P5) — استخراج appointments ١.
 * نُقل بايت-بايت من appointments.html (كان الأسطر ~7309–7754). تعريفات + 3 متغيرات حالة
 * فقط — صفر كود تنفيذي وقت التحليل. يعتمد على globals وقت التشغيل حصراً:
 * currentUser · window.sb · escapeHtml · showToast · normalizePhone · appointments ·
 * openModal · closeModal · submitAppt · view — كلها معرَّفة بالكتلة الرئيسية inline.
 * نقاط الاستدعاء الخارجية بقيت بالـHTML: setView/render/editAppt/closeModal/submitAppt/init. */

// ═══════════════════════════════════════════════════════════════
// P5 — Online Booking Requests (بوابة الحجز الإلكتروني) — reception side.
// Patients submit via the public book.html portal (anon RPCs, Migration 59).
// Pending requests land here; ✅ opens the normal appointment modal
// prefilled, the save goes through submitAppt (the one battle-tested path),
// and the post-insert hook links the request via bookingMarkConfirmed.
// Table may not exist yet (Migration 59 not applied) → graceful notice.
// ═══════════════════════════════════════════════════════════════
var bookingRequests = [];
var _bookingTableMissing = false;
window._bookingConfirmCtx = null;

async function loadBookingRequests() {
  if (!currentUser) return;
  try {
    const { data, error } = await window.sb
      .from('booking_requests')
      .select('*')
      .eq('clinic_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      const em = (error.message || '') + ' ' + (error.code || '');
      _bookingTableMissing = /relation .* does not exist|42P01|PGRST205/i.test(em);
      if (!_bookingTableMissing) console.warn('P5 booking load:', error);
      bookingRequests = [];
    } else {
      _bookingTableMissing = false;
      bookingRequests = data || [];
    }
  } catch (e) {
    console.warn('P5 booking load:', e);
    bookingRequests = [];
  }
  updateBookingBadge();
  if (view === 'booking') renderBookingRequests();
}

function updateBookingBadge() {
  var b = document.getElementById('bookingBadge');
  if (!b) return;
  var n = 0;
  for (var i = 0; i < bookingRequests.length; i++) {
    if (bookingRequests[i].status === 'pending') n++;
  }
  b.textContent = n;
  b.style.display = n > 0 ? 'inline-block' : 'none';
}

function bookingFmtDate(ds) {
  if (!ds) return '—';
  var d = new Date(ds + 'T00:00:00');
  if (isNaN(d.getTime())) return ds;
  return DAYS_AR[d.getDay()] + ' ' + (SyDT.numDate(String(ds).slice(0, 10)) || ds);   // v487: طلبُ الحجز «الأحد 21/9/2026»
}

function bookingIsPast(req) {
  var t = (req.requested_time && /^\d{2}:\d{2}/.test(req.requested_time)) ? req.requested_time.slice(0,5) : '23:59';
  var d = new Date(req.requested_date + 'T' + t + ':00');
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

function bookingAgo(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return '';
  var m = Math.floor(diff / 60000);
  if (m < 60) return 'قبل ' + (m <= 1 ? 'دقيقة' : m + ' دقيقة');
  var h = Math.floor(m / 60);
  if (h < 24) return 'قبل ' + (h === 1 ? 'ساعة' : h + ' ساعات');
  var dd = Math.floor(h / 24);
  return 'قبل ' + (dd === 1 ? 'يوم' : dd + ' أيام');
}

function bookingCard(req, isPending) {
  var phoneIntl = (typeof normalizePhone === 'function') ? normalizePhone(req.phone) : null;
  // P5++: for confirmed requests, build the WA message from the LINKED
  // appointment's final date/time (the doctor may have moved the slot).
  // Fallback to the originally requested slot if the appt isn't in cache.
  var waDate = req.requested_date, waTime = req.requested_time, isFinal = false;
  if (req.status === 'confirmed' && req.appointment_id) {
    for (var ai = 0; ai < appointments.length; ai++) {
      if (appointments[ai].id === req.appointment_id) {
        if (appointments[ai].date && appointments[ai].time) {
          waDate = appointments[ai].date; waTime = appointments[ai].time; isFinal = true;
        }
        break;
      }
    }
  }
  var waMsg = isFinal
    ? ('مرحباً ' + (req.patient_name || '') + ' 🌟 تذكير: موعدكم المؤكّد يوم '
       + bookingFmtDate(waDate) + ' الساعة ' + fmtTime12(waTime) + '. نتطلع لرؤيتكم 🦷')
    : ('مرحباً ' + (req.patient_name || '') + ' 🌟 بخصوص طلب حجزكم يوم '
       + bookingFmtDate(waDate) + ' الساعة ' + fmtTime12(waTime) + ' — ');
  var waBtn = phoneIntl
    ? '<a class="sy-act sy-act-ico" title="مراسلة واتساب" aria-label="مراسلة واتساب" href="https://wa.me/' + phoneIntl
      + '?text=' + encodeURIComponent(waMsg) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">📱</a>'
    : '';
  var pastChip = (isPending && bookingIsPast(req))
    ? ' <span class="list-badge" style="background:rgba(var(--red-rgb),0.14);color:var(--red);">⏰ فات وقته</span>' : '';
  var statusChip = '';
  if (req.status === 'confirmed') statusChip = ' <span class="list-badge status-confirmed">✅ مؤكّد</span>';
  if (req.status === 'rejected')  statusChip = ' <span class="list-badge" style="opacity:0.7;">✖ مرفوض</span>';
  var actions = isPending
    ? '<button class="sy-act sy-act-primary" title="تأكيد كموعد" onclick="event.stopPropagation(); confirmBookingRequest(\'' + req.id + '\')">✅ تأكيد</button>'
      + '<button class="sy-act" title="تعديل الوقت ثم التأكيد" onclick="event.stopPropagation(); confirmBookingRequest(\'' + req.id + '\', true)">✏️ تعديل</button>'
      + '<button class="sy-act sy-act-danger" title="رفض الطلب" onclick="event.stopPropagation(); rejectBookingRequest(\'' + req.id + '\')">✖ رفض</button>'
      + waBtn
    : waBtn;
  return '<div class="list-item booking-item show-acts" style="border-right:3px solid var(--green);' + (isPending ? '' : 'opacity:0.62;') + '">'
    + '<div class="list-time">' + fmtTime12(req.requested_time) + '</div>'
    + '<div class="list-avatar" style="background:' + avatarColor(req.patient_name || '؟') + '22;color:' + avatarColor(req.patient_name || '؟') + '">' + escapeHtml(initials(req.patient_name || '؟')) + '</div>'
    + '<div class="list-info">'
    +   '<div class="list-name">' + (escapeHtml(req.patient_name) || '—') + pastChip + statusChip + '</div>'
    +   '<div class="list-type">📅 ' + bookingFmtDate(req.requested_date)
    +     ' · 📞 ' + (escapeHtml(req.phone) || '—')
    +     (req.note ? ' · 📝 ' + escapeHtml(req.note) : '')
    +     ' <span style="opacity:0.6;">· ' + bookingAgo(req.created_at) + '</span></div>'
    + '</div>'
    + (actions ? '<div class="list-actions sy-acts" data-sub-write onclick="event.stopPropagation()">' + actions + '</div>' : '')
    + '</div>';
}

function renderBookingRequests() {
  var el = document.getElementById('bookingContent');
  if (!el) return;
  if (_bookingTableMissing) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text2)">'
      + '<div style="font-size:48px;margin-bottom:12px">🌐</div>'
      + '<div style="font-size:16px;color:var(--text)">ميزة الحجز الإلكتروني تتطلب تطبيق Migration 59 على قاعدة البيانات</div>'
      + '</div>';
    return;
  }
  var pending = [], archive = [];
  bookingRequests.forEach(function(r){
    if (r.status === 'pending') pending.push(r); else archive.push(r);
  });
  // soonest requested slot first for pending; newest first for archive (load order)
  pending.sort(function(a,b){
    return (a.requested_date + (a.requested_time||'')).localeCompare(b.requested_date + (b.requested_time||''));
  });

  var html =
    '<div style="padding:10px 14px;margin-bottom:10px;background:var(--bg4,rgba(255,255,255,0.04));border-radius:10px;font-size:13px;color:var(--text2);">'
    + '🌐 طلبات الحجز الإلكتروني — ' + (pending.length > 0
        ? ('<b style="color:var(--text)">' + pending.length + '</b> طلب بانتظار التأكيد')
        : 'لا طلبات بانتظار التأكيد ✅')
    + '</div>';

  if (pending.length === 0 && archive.length === 0) {
    html += '<div style="text-align:center;padding:50px 20px;color:var(--text2)">'
      + '<div style="font-size:48px;margin-bottom:12px">🌐</div>'
      + '<div style="font-size:16px;color:var(--text)">لا طلبات حجز بعد — شارك رابط البوابة من الإعدادات</div>'
      + '</div>';
  } else {
    if (pending.length > 0) {
      html += '<div class="list-group"><div class="list-date-header">قيد الانتظار <span class="date-badge">' + pending.length + '</span></div>';
      pending.forEach(function(r){ html += bookingCard(r, true); });
      html += '</div>';
    }
    if (archive.length > 0) {
      html += '<div class="list-group"><div class="list-date-header" style="opacity:0.75;">السجلّ الأخير</div>';
      archive.slice(0, 20).forEach(function(r){ html += bookingCard(r, false); });
      html += '</div>';
    }
  }
  el.innerHTML = html;
}

async function confirmBookingRequest(id, editMode) {
  var req = null;
  for (var i = 0; i < bookingRequests.length; i++) {
    if (bookingRequests[i].id === id) { req = bookingRequests[i]; break; }
  }
  if (!req) return;
  // requestedDate/Time snapshot: consumed post-save to detect a doctor-side
  // time change → the WhatsApp confirmation message calls it out explicitly.
  window._bookingConfirmCtx = {
    id: req.id, phone: req.phone || '', name: req.patient_name || '', patientId: null,
    requestedDate: req.requested_date || '', requestedTime: (req.requested_time || '').slice(0,5)
  };
  await openModal(req.requested_date);
  document.getElementById('fPatient').value = req.patient_name || '';
  document.getElementById('fTime').value = req.requested_time || '';
  // fDuration is a <select>: if the request's duration has no matching
  // <option>, assignment silently fails → inject one (Δ2 defensive).
  var durSel = document.getElementById('fDuration');
  var durVal = String(req.duration || 30);
  durSel.value = durVal;
  if (durSel.value !== durVal) {
    var opt = document.createElement('option');
    opt.value = durVal; opt.textContent = durVal + ' دقيقة';
    durSel.appendChild(opt);
    durSel.value = durVal;
  }
  var noteParts = ['📞 ' + (req.phone || '') + ' — حجز إلكتروني'];
  if (req.note) noteParts.push(req.note);
  document.getElementById('fNotes').value = noteParts.join('\n');
  if (editMode) {
    showToast('✏️ عدّل الوقت أو التاريخ ثم احفظ — سيصل المريض التوقيت الجديد برسالة التأكيد');
    var tEl = document.getElementById('fTime');
    if (tEl) { try { tEl.focus(); } catch (e) {} }
  } else {
    showToast('أكمل تفاصيل الموعد ثم احفظ لتأكيد الطلب');
  }
  // P5+: show the patient-resolution box (match existing OR create new) so the
  // confirmed appointment ends up linked to a real patient card (phone → reminders).
  bookingResolvePatient(req);
}

// ─── P5+: Booking-confirm patient resolution (match-or-create) ──────────────
// When confirming an online booking request, let the user link the appointment
// to an existing patient card (duplicate detection by phone, then exact name)
// or create a new card from the request's name+phone. The resolved patient id
// is stored on window._bookingConfirmCtx.patientId and consumed by submitAppt
// (preferred over name lookup → robust against duplicate names). Falls back to
// the legacy "no card" behaviour via "متابعة بدون بطاقة".
function brBtnStyle()   { return 'display:block;width:100%;text-align:right;padding:8px 10px;margin-top:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-family:inherit;font-size:13px;'; }
function brBtnPrimary() { return 'display:block;width:100%;text-align:center;padding:9px 10px;margin-top:6px;border:none;border-radius:8px;background:var(--green);color:#fff;cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;'; }

async function bookingResolvePatient(req) {
  var box = document.getElementById('bookingResolveBox');
  if (!box) return;
  // Load patient list once (used for both match-detection and the search field).
  var pats = [];
  try {
    const { data } = await window.SyDentFetchAll(function(){ return window.sb.from('patients')
      .select('id, name, phone, local_id').eq('doctor_id', currentUser.id); });
    pats = data || [];
  } catch (e) { console.warn('[booking] patients load for resolve:', e); }
  window._brPatients = pats;

  // Duplicate detection: phone first (strongest), then exact name.
  var reqPhoneNorm = (typeof normalizePhone === 'function') ? normalizePhone(req.phone) : null;
  var matches = [];
  if (reqPhoneNorm) {
    matches = pats.filter(function (p) { return p.phone && normalizePhone(p.phone) === reqPhoneNorm; });
  }
  if (matches.length === 0 && req.patient_name) {
    var nm = String(req.patient_name).trim();
    matches = pats.filter(function (p) { return (p.name || '').trim() === nm; });
  }
  bookingRenderResolveBox(matches);
  box.style.display = '';
}

function bookingRenderResolveBox(matches) {
  var box = document.getElementById('bookingResolveBox');
  if (!box) return;
  var html = '<div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;">';
  html += '<div style="font-weight:600;margin-bottom:4px;">🔗 ربط المريض ببطاقة</div>';
  if (matches && matches.length > 0) {
    html += '<div style="font-size:12px;color:var(--green-dim);margin-bottom:2px;">وجدنا بطاقة مطابقة (نفس الرقم/الاسم):</div>';
    matches.slice(0, 5).forEach(function (p) {
      html += '<button type="button" style="' + brBtnStyle() + '" onclick="bookingLinkExisting(\'' + p.id + '\')">🔗 اربط بـ ' + escapeHtml(p.name || '') + (p.local_id ? ' (' + escapeHtml(p.local_id) + ')' : '') + '</button>';
    });
  }
  html += '<button type="button" style="' + brBtnPrimary() + '" onclick="bookingCreatePatientFromReq()">➕ إنشاء بطاقة مريض جديدة</button>';
  html += '<div style="font-size:12px;color:var(--green-dim);margin-top:8px;">أو ابحث عن بطاقة موجودة:</div>';
  html += '<input type="text" id="brSearchInput" placeholder="ابحث بالاسم أو الهاتف…" oninput="bookingSearchExisting()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();}" style="width:100%;padding:8px 10px;margin-top:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-family:inherit;font-size:13px;">';
  html += '<div id="brSearchResults"></div>';
  html += '<button type="button" style="' + brBtnStyle() + 'opacity:0.85;" onclick="bookingResolveSkip()">↪️ متابعة بدون بطاقة (يمكن الربط لاحقاً)</button>';
  html += '</div>';
  box.innerHTML = html;
}

function bookingSearchExisting() {
  var inp = document.getElementById('brSearchInput');
  var out = document.getElementById('brSearchResults');
  if (!inp || !out) return;
  var q = (inp.value || '').trim().toLowerCase();
  if (!q) { out.innerHTML = ''; return; }
  var pats = window._brPatients || [];
  var res = pats.filter(function (p) {
    return (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.phone || '').indexOf(q) >= 0;
  }).slice(0, 8);
  if (res.length === 0) { out.innerHTML = '<div style="font-size:12px;color:var(--green-dim);margin-top:6px;">لا نتائج مطابقة</div>'; return; }
  out.innerHTML = res.map(function (p) {
    return '<button type="button" style="' + brBtnStyle() + '" onclick="bookingLinkExisting(\'' + p.id + '\')">' + escapeHtml(p.name || '') + ' · ' + escapeHtml(p.phone || '—') + '</button>';
  }).join('');
}

function bookingLinkExisting(id) {
  var pats = window._brPatients || [];
  var p = null;
  for (var i = 0; i < pats.length; i++) { if (pats[i].id === id) { p = pats[i]; break; } }
  if (!p) { showToast('⚠️ تعذّر الربط — أعد المحاولة'); return; }
  if (window._bookingConfirmCtx) window._bookingConfirmCtx.patientId = p.id;
  var pf = document.getElementById('fPatient'); if (pf) pf.value = p.name || '';
  bookingResolveConfirmedUI('🔗 سيُربط الموعد بالبطاقة: ' + (p.name || '') + (p.local_id ? ' (' + p.local_id + ')' : ''));
}

async function bookingCreatePatientFromReq() {
  var ctx = window._bookingConfirmCtx;
  if (!ctx) { showToast('⚠️ انتهت الجلسة — أعد فتح الطلب'); return; }
  var name  = (ctx.name  || '').trim();
  var phone = (ctx.phone || '').trim();
  if (!name) { showToast('⚠️ لا يوجد اسم في الطلب'); return; }
  // local_id generation — Migration 86: atomic per-tenant seq; fallback = legacy max-seq scan.
  var maxSeq = 0;
  try {
    const { data: seqEnd, error: seqErr } = await window.sb.rpc('next_patient_seq', { n: 1 });
    if (seqErr || !seqEnd) throw (seqErr || new Error('no seq'));
    maxSeq = seqEnd - 1;
  } catch (seqEx) {
    console.warn('[booking] next_patient_seq fallback:', seqEx);
    try {
      const { data } = await window.SyDentFetchAll(function(){ return window.sb.from('patients').select('local_id').eq('doctor_id', currentUser.id); });
      (data || []).forEach(function (p) {
        var n = parseInt((p.local_id || 'P000').slice(1));
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      });
    } catch (e) { console.warn('[booking] local_id seq:', e); }
  }
  var local_id = 'P' + String(maxSeq + 1).padStart(3, '0');
  // Local date (patients.html uses prmYmdLocal) — toISOString() is UTC and gave
  // yesterday between 00:00 and 03:00 Syria time (v79 bug class).
  var today = dateStr(new Date());
  // INSERT shape mirrors patients.html exactly (safe against NOT NULL columns).
  const { data: newPat, error } = await window.sb.from('patients').insert({
    doctor_id: currentUser.id,
    local_id: local_id, name: name, phone: phone,
    dob: null, gender: '', payment: 'متبقي', status: 'جديد',
    allergies: '', notes: '', last_visit: today
  }).select().single();
  if (error || !newPat) { showToast('❌ تعذّر إنشاء البطاقة'); console.warn('[booking] create patient:', error); return; }
  if (window.logAudit) {
    window.logAudit('patient.create', {
      entityId: newPat.id, patientId: newPat.id, patientName: name,
      description: 'إضافة مريض جديد من طلب حجز: ' + name + ' (' + local_id + ')',
      newValue: { name: name, local_id: local_id, phone: phone }
    });
  }
  // Keep the in-memory phone cache consistent so the WhatsApp reminder resolves
  // immediately after save (belt-and-suspenders with submitAppt's refresh flag).
  try {
    patientsCache[newPat.id] = { name: name, phone: phone };
    if (name) patientsCache['__name__' + name] = { id: newPat.id, name: name, phone: phone };
  } catch (e) { /* ignore */ }
  if (window._bookingConfirmCtx) window._bookingConfirmCtx.patientId = newPat.id;
  var pf = document.getElementById('fPatient'); if (pf) pf.value = name;
  bookingResolveConfirmedUI('✅ تم إنشاء البطاقة: ' + name + ' (' + local_id + ')');
}

function bookingResolveSkip() {
  if (window._bookingConfirmCtx) window._bookingConfirmCtx.patientId = null;
  bookingResolveConfirmedUI('↪️ سيُحفظ الموعد بدون بطاقة مريض (يمكنك الربط لاحقاً من بطاقة المريض).');
}

function bookingResolveConfirmedUI(msg) {
  var box = document.getElementById('bookingResolveBox');
  if (!box) return;
  box.innerHTML = '<div style="border:1px solid var(--green);border-radius:var(--radius);padding:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    + '<span style="font-size:13px;flex:1;min-width:0;">' + escapeHtml(msg) + '</span>'
    + '<button type="button" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-family:inherit;font-size:12px;" onclick="bookingResolveReopen()">تغيير</button>'
    + '</div>';
}

function bookingResolveReopen() {
  var ctx = window._bookingConfirmCtx;
  if (!ctx) return;
  ctx.patientId = null;
  bookingResolvePatient({ patient_name: ctx.name, phone: ctx.phone });
}

// Called synchronously from submitAppt's success path (before closeModal
// clears the ctx). Reads + clears the ctx, then links asynchronously so the
// save flow is never delayed; the appointment is already saved regardless.
function bookingMarkConfirmed(apptId, savedAppt) {
  var ctx = window._bookingConfirmCtx;
  window._bookingConfirmCtx = null;
  if (!ctx || !ctx.id || !apptId) return;
  (async function(){
    try {
      const { error } = await window.sb.from('booking_requests')
        .update({ status: 'confirmed', appointment_id: apptId, reviewed_at: new Date().toISOString() })
        .eq('id', ctx.id)
        .eq('clinic_id', currentUser.id);
      if (error) { console.warn('P5 confirm link:', error); showToast('⚠️ الموعد حُفظ لكن تعذّر ربط طلب الحجز'); return; }
      showToast('🌐 تم تأكيد طلب الحجز وربطه بالموعد');
      showBookingWaConfirm(ctx, savedAppt);
      await loadBookingRequests();
    } catch (e) { console.warn('P5 confirm link:', e); }
  })();
}

// ─── P5++: post-confirm WhatsApp prompt ─────────────────────────────────────
// Floating card offering to send the patient a confirmation message built from
// the FINAL saved date/time (not the requested one). If the doctor changed the
// slot, the message explicitly says so. Opened via a user click → wa.me is
// never popup-blocked. Fixed message text by design (no 4th settings template).
function bookingBuildConfirmMsg(ctx, finalDate, finalTime) {
  var clinic = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا';
  var when = 'يوم ' + bookingFmtDate(finalDate) + ' الساعة ' + fmtTime12(finalTime);
  var changed = (ctx.requestedDate && ctx.requestedTime)
    && (ctx.requestedDate !== finalDate || ctx.requestedTime !== String(finalTime || '').slice(0,5));
  return 'مرحباً ' + (ctx.name || '') + ' 🌟 '
    + (changed
        ? ('تم تأكيد حجزكم في ' + clinic + ' مع تعديل الموعد إلى ' + when + '. نرجو ملاحظة التوقيت الجديد 🙏')
        : ('تم تأكيد حجزكم في ' + clinic + ' ' + when + '.'))
    + ' نتطلع لرؤيتكم 🦷';
}

function showBookingWaConfirm(ctx, savedAppt) {
  if (!savedAppt || !savedAppt.date || !savedAppt.time) return;
  var phoneIntl = (typeof normalizePhone === 'function') ? normalizePhone(ctx.phone) : null;
  if (!phoneIntl) return;  // لا هاتف صالح → التوست الاعتيادي يكفي
  var msg = bookingBuildConfirmMsg(ctx, savedAppt.date, savedAppt.time);
  var old = document.getElementById('bkWaConfirmCard');
  if (old) old.remove();
  var card = document.createElement('div');
  card.id = 'bkWaConfirmCard';
  card.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:99987;'
    + 'background:var(--bg-card,#1c2733);border:1px solid var(--green);border-radius:14px;'
    + 'padding:14px 18px;box-shadow:0 8px 30px rgba(0,0,0,0.35);max-width:92vw;width:420px;'
    + 'font-family:inherit;text-align:center;';
  card.innerHTML =
    '<div style="font-size:13.5px;color:var(--text);font-weight:700;margin-bottom:4px;">✅ تم تأكيد حجز '
    + escapeHtml(ctx.name || '') + '</div>'
    + '<div style="font-size:12.5px;color:var(--text2);margin-bottom:10px;">'
    + escapeHtml('يوم ' + bookingFmtDate(savedAppt.date) + ' الساعة ' + fmtTime12(savedAppt.time)) + '</div>'
    + '<a href="https://wa.me/' + phoneIntl + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener"'
    + ' style="display:inline-block;padding:9px 16px;background:var(--wa);color:#fff;border-radius:9px;'
    + 'text-decoration:none;font-weight:700;font-size:13px;"'
    + ' onclick="var c=document.getElementById(\'bkWaConfirmCard\');if(c)c.remove();">📱 إرسال تأكيد واتساب للمريض</a>'
    + '<button onclick="document.getElementById(\'bkWaConfirmCard\').remove()"'
    + ' style="display:inline-block;margin-inline-start:8px;padding:9px 14px;background:transparent;'
    + 'border:1px solid var(--border);border-radius:9px;color:var(--text2);cursor:pointer;'
    + 'font-family:inherit;font-size:13px;">إغلاق</button>';
  document.body.appendChild(card);
  setTimeout(function(){ var c = document.getElementById('bkWaConfirmCard'); if (c) c.remove(); }, 45000);
}

async function rejectBookingRequest(id) {
  if (!await SyDialog.confirm({ message: 'رفض طلب الحجز هذا؟ سيعود الوقت متاحاً على بوابة الحجز.', danger: true })) return;
  try {
    const { error } = await window.sb.from('booking_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', currentUser.id);
    if (error) { showToast('❌ تعذّر رفض الطلب'); return; }
    showToast('تم رفض الطلب');
    await loadBookingRequests();
  } catch (e) { showToast('❌ تعذّر رفض الطلب'); }
}

