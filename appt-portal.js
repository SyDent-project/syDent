/* SyDent — appt-portal.js (M187 · v628): طلباتُ بوابة المريض — صندوقُ العيادة بصفحة المواعيد.
 * ما يرسله المريض من بوابته (إلغاءٌ نفّذه الخادم فوراً · طلبُ إلغاء · طلبُ تغيير) يظهر أعلى عرض «طلبات الحجز»
 * ويُحسب بشارته. «فتح الموعد» = نافذةُ الموعد نفسُها (editAppt) — نقلُ الموعد أو إلغاؤه يُغلق الطلب تلقائياً
 * بمشغّل الخادم (M187)؛ «تمّ» / «تجاهل» يدويّان. تعريفاتٌ فقط — صفرُ كود تنفيذي وقت التحليل.
 * يعتمد وقت التشغيل على: currentUser · window.sb · appointments · view · escapeHtml · showToast · editAppt ·
 * bookingFmtDate · bookingAgo · fmtTime12 · avatarColor · initials · updateBookingBadge · renderBookingRequests. */

/* M189: the WhatsApp text after approving the slot the patient asked for.
   MIRROR (byte-parity via prove-portal): settings.html DEFAULT_PORTAL_MOVED_TPL. Clinic override: clinic_settings.portal_msg_moved. */
var PORTAL_MOVED_TPL = 'مرحباً {patient_first_name} 🌟 تم نقل موعدك في {clinic_name} إلى يوم {date} الساعة {time} كما طلبت ✓ — نتطلع لرؤيتك 🦷';
/* M190: the WhatsApp text after approving a cancel request. MIRROR (prove-portal): settings.html DEFAULT_PORTAL_CANCEL_OK_TPL.
   Clinic override: clinic_settings.portal_msg_cancel_ok. */
var PORTAL_CANCEL_OK_TPL = 'مرحباً {patient_first_name} — تم إلغاء موعدك في {clinic_name} يوم {date} الساعة {time} بناءً على طلبك ✓. لحجز موعدٍ جديد تواصل معنا متى شئت 🦷';

var portalRequests = [];
var _portalReqMissing = false;

async function loadPortalRequests() {
  if (!currentUser) return;
  try {
    var res = await window.sb.from('portal_requests')
      .select('id, patient_id, appointment_id, kind, applied, status, reason, preference, note, appt_date, appt_time, requested_date, requested_time, patient_name_snapshot, handled_at, created_at')
      .eq('owner_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) {
      var em = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/portal_requests|42P01|PGRST205/i.test(em)) { _portalReqMissing = true; portalRequests = []; }
      else console.warn('portal requests:', res.error);   /* فشلٌ عابر ⇒ يبقى المعروض */
    } else {
      _portalReqMissing = false;
      portalRequests = res.data || [];
    }
  } catch (e) { console.warn('portal requests:', e); }
  if (typeof updateBookingBadge === 'function') updateBookingBadge();
  if (typeof view !== 'undefined' && view === 'booking' && typeof renderBookingRequests === 'function') renderBookingRequests();
}

function portalReqNew() {
  return portalRequests.filter(function (r) { return r.status === 'new'; });
}
function portalReqNewCount() { return portalReqNew().length; }
/* الشارة عددٌ — فتلميحُها يسمّي المرضى (كل تنبيهٍ يقول لأي مريض) */
function portalReqNamesTitle() {
  var names = portalReqNew().map(function (r) { return r.patient_name_snapshot || '—'; });
  return names.length ? ('من بوابة المريض: ' + names.slice(0, 6).join('، ') + (names.length > 6 ? '…' : '')) : '';
}

function portalReqWhat(r) {
  if (r.kind === 'cancel' && r.applied) return { t: 'ألغى موعده من البوابة', ic: '✕', c: 'var(--red)' };
  if (r.kind === 'cancel') return { t: 'يطلب إلغاء موعده', ic: '✕', c: 'var(--red)' };
  return { t: 'يطلب تغيير موعده', ic: '🔁', c: 'var(--yellow, #b45309)' };
}
var PORTAL_PREF_AR = { any: 'أي وقت', morning: 'صباحاً', evening: 'مساءً' };

function portalReqCard(r) {
  var w = portalReqWhat(r), isNew = r.status === 'new';
  var name = r.patient_name_snapshot || '—';
  var bits = [];
  if (r.appt_date) bits.push('📅 ' + bookingFmtDate(r.appt_date) + (r.appt_time ? ' · ' + fmtTime12(String(r.appt_time).slice(0, 5)) : ''));
  if (r.requested_date && r.requested_time) bits.push('<b>➜ يطلب: ' + bookingFmtDate(r.requested_date) + ' · ' + fmtTime12(String(r.requested_time).slice(0, 5)) + '</b>');
  if (r.preference) bits.push('⏰ يفضّل: ' + (PORTAL_PREF_AR[r.preference] || r.preference));
  if (r.reason) bits.push('السبب: ' + escapeHtml(r.reason));
  if (r.note) bits.push('📝 ' + escapeHtml(r.note));
  var chip = isNew ? '' : (r.status === 'handled'
    ? ' <span class="list-badge status-confirmed">' + (r.kind === 'cancel' && !r.applied ? '✓ أُلغي' : '✓ تمّ') + '</span>'
    : ' <span class="list-badge" style="opacity:0.7;">' + (r.kind === 'cancel' && !r.applied ? 'رُفض' : 'تجاهل') + '</span>');
  var acts = '';
  var hasSlot = !!(r.requested_date && r.requested_time);
  if (isNew && r.appointment_id && r.kind === 'change' && hasSlot) acts += '<button class="sy-act sy-act-primary" title="يفتح نافذة الموعد معبّأةً بالوقت المطلوب — راجع واحفظ" onclick="event.stopPropagation(); portalReqApprove(\'' + r.id + '\')">✅ اعتماد الوقت المطلوب</button>';
  if (r.appointment_id && r.kind !== 'cancel' && !(isNew && hasSlot)) acts += '<button class="sy-act sy-act-primary" title="فتح الموعد لإعادة جدولته" onclick="event.stopPropagation(); portalReqOpenAppt(\'' + r.id + '\')">📅 فتح الموعد</button>';
  /* M190 · v632: a cancel REQUEST is a decision — «اعتماد الإلغاء» cancels the appointment, «رفض الطلب» keeps it.
     The old single «✓ تمّ» only closed the request and left the appointment standing (owner's live test). */
  var cancelReq = r.kind === 'cancel' && !r.applied;
  if (isNew && cancelReq && r.appointment_id) acts += '<button class="sy-act sy-act-primary" title="يلغي الموعد ويغلق الطلب" onclick="event.stopPropagation(); portalReqCancelApprove(\'' + r.id + '\')">✅ اعتماد الإلغاء</button>';
  if (isNew && cancelReq) acts += '<button class="sy-act sy-act-danger" title="يبقى الموعد قائماً ويُغلق الطلب" onclick="event.stopPropagation(); portalReqSet(\'' + r.id + '\', \'dismissed\')">✖ رفض الطلب</button>';
  if (isNew && !cancelReq) acts += '<button class="sy-act" title="' + (r.applied ? 'اطّلعتُ عليه' : 'عولج الطلب') + '" onclick="event.stopPropagation(); portalReqSet(\'' + r.id + '\', \'handled\')">✓ تمّ</button>';
  if (isNew && !r.applied && !cancelReq) acts += '<button class="sy-act sy-act-danger" title="تجاهل الطلب" onclick="event.stopPropagation(); portalReqSet(\'' + r.id + '\', \'dismissed\')">✖ تجاهل</button>';
  acts += '<a class="sy-act" title="بطاقة المريض" href="patient-profile.html?id=' + encodeURIComponent(r.patient_id) + '" onclick="event.stopPropagation()">👤 البطاقة</a>';
  return '<div class="list-item booking-item show-acts" style="border-right:3px solid ' + w.c + ';' + (isNew ? '' : 'opacity:0.62;') + '">'
    + '<div class="list-time">' + (r.appt_time ? fmtTime12(String(r.appt_time).slice(0, 5)) : '—') + '</div>'
    + '<div class="list-avatar" style="background:' + avatarColor(name) + '22;color:' + avatarColor(name) + '">' + escapeHtml(initials(name)) + '</div>'
    + '<div class="list-info">'
    +   '<div class="list-name">' + escapeHtml(name) + ' <span style="font-weight:700;color:' + w.c + ';">' + w.ic + ' ' + w.t + '</span>' + chip + '</div>'
    +   '<div class="list-type">' + bits.join(' · ') + ' <span style="opacity:0.6;">· ' + bookingAgo(r.created_at) + '</span></div>'
    + '</div>'
    + '<div class="list-actions sy-acts" data-sub-write onclick="event.stopPropagation()">' + acts + '</div>'
    + '</div>';
}

/* كتلةُ أعلى عرض «طلبات الحجز» — فارغةٌ تماماً قبل M187 أو حين لا شيء */
function portalReqBlock() {
  if (_portalReqMissing || !portalRequests.length) return '';
  var fresh = portalReqNew(), old = portalRequests.filter(function (r) { return r.status !== 'new'; });
  var h = '<div class="list-group"><div class="list-date-header">📨 من بوابة المريض <span class="date-badge">' + fresh.length + '</span></div>';
  if (fresh.length) fresh.forEach(function (r) { h += portalReqCard(r); });
  else h += '<div style="padding:10px 14px;font-size:13px;color:var(--text2);">لا طلبات جديدة من البوابة ✅</div>';
  h += '</div>';
  if (old.length) {
    h += '<details class="list-group" style="margin-bottom:10px;"><summary class="list-date-header" style="cursor:pointer;opacity:0.75;">سجلّ طلبات البوابة (' + Math.min(old.length, 20) + ')</summary>';
    old.slice(0, 20).forEach(function (r) { h += portalReqCard(r); });
    h += '</details>';
  }
  return h;
}

var _portalReqBusy = false;
async function portalReqSet(id, status) {
  if (_portalReqBusy || !currentUser) return;
  _portalReqBusy = true;
  try {
    var res = await window.sb.from('portal_requests')
      .update({ status: status, handled_at: new Date().toISOString() })
      .eq('id', id).eq('owner_id', currentUser.id).eq('status', 'new');
    if (res.error) {
      var em = (res.error.message || '') + ' ' + (res.error.code || '');
      showToast(/subscription_read_only|sub_gate|row-level security/i.test(em) ? '🔒 الحساب للقراءة فقط' : '❌ تعذّر تحديث الطلب', true);
    } else {
      var r = portalRequests.find(function (x) { return x.id === id; });
      if (r) { r.status = status; r.handled_at = new Date().toISOString(); }
      showToast(status === 'handled' ? '✅ تمّ — ' + ((r && r.patient_name_snapshot) || '') : 'تم تجاهل طلب ' + ((r && r.patient_name_snapshot) || ''));
      if (typeof updateBookingBadge === 'function') updateBookingBadge();
      if (typeof renderBookingRequests === 'function' && view === 'booking') renderBookingRequests();
    }
  } catch (e) { showToast('❌ تعذّر الاتصال', true); }
  _portalReqBusy = false;
}

/* M189: «✅ اعتماد الوقت المطلوب» — the appointment modal (editAppt, the one battle-tested save path with its
   conflict checks) opens filled with the slot the patient asked for; the doctor reviews and saves. Saving moves the
   appointment ⇒ the server trigger closes the request ⇒ portalApproveSaved offers the WhatsApp confirmation. */
async function portalReqApprove(id) {
  var r = portalRequests.find(function (x) { return x.id === id; });
  if (!r || !r.appointment_id || !r.requested_date || !r.requested_time) return;
  var a = (typeof appointments !== 'undefined' && appointments) ? appointments.find(function (x) { return x.id === r.appointment_id; }) : null;
  if (!a) { showToast('⚠️ الموعد غير موجود — ربما حُذف'); return; }
  await editAppt(r.appointment_id);
  window._portalApproveCtx = { reqId: r.id, apptId: r.appointment_id, patientId: r.patient_id, name: r.patient_name_snapshot || '',
                               date: r.requested_date, time: String(r.requested_time).slice(0, 5),
                               origDate: a.date, origTime: String(a.time || '').slice(0, 5) };   /* captured BEFORE the save */
  var fd = document.getElementById('fDate'), ft = document.getElementById('fTime');
  if (fd) { fd.value = r.requested_date; fd.dispatchEvent(new Event('input', { bubbles: true })); fd.dispatchEvent(new Event('change', { bubbles: true })); }
  if (ft) { ft.value = String(r.requested_time).slice(0, 5); ft.dispatchEvent(new Event('input', { bubbles: true })); ft.dispatchEvent(new Event('change', { bubbles: true })); }
  showToast('🔁 ' + (r.patient_name_snapshot || '') + ' طلب ' + bookingFmtDate(r.requested_date) + ' الساعة ' + fmtTime12(String(r.requested_time).slice(0, 5)) + ' — راجع ثم احفظ', false, 8000);
}
function portalMovedMsg(ctx, date, time) { return portalTplMsg('moved', { name: ctx.name, date: date, time: time }); }
/* called by submitAppt (edit path) right before closeModal — only when the save actually moved the appointment */
async function portalApproveSaved(ctx, saved) {
  if (!ctx || !saved || !saved.date || !saved.time) return;
  if (ctx.origDate === saved.date && ctx.origTime === String(saved.time).slice(0, 5)) return;   /* not moved ⇒ the request stays open (no trigger) */
  portalWaCard({ title: '✅ نُقل موعد ' + (ctx.name || ''), sub: bookingFmtDate(saved.date) + ' الساعة ' + fmtTime12(String(saved.time).slice(0, 5)),
                 patientId: ctx.patientId, name: ctx.name || '', msg: portalMovedMsg(ctx, saved.date, saved.time) });
}
function portalMovedClose() { var c = document.getElementById('ptMovedCard'); if (c) c.remove(); }

/* M190: «✅ اعتماد الإلغاء» — one server call (SECURITY INVOKER: this clinic's RLS + subscription gate) cancels the
   appointment with the clinic's own status pair, tags its note and closes the request; then the activity log and
   a WhatsApp confirmation to the patient (editable template). */
var _portalCancelBusy = false;
async function portalReqCancelApprove(id) {
  var r = portalRequests.find(function (x) { return x.id === id; });
  if (!r || _portalCancelBusy) return;
  var when = r.appt_date ? (bookingFmtDate(r.appt_date) + (r.appt_time ? ' الساعة ' + fmtTime12(String(r.appt_time).slice(0, 5)) : '')) : '';
  if (!await SyDialog.confirm({ message: 'إلغاء موعد ' + (r.patient_name_snapshot || 'المريض') + (when ? ' يوم ' + when : '') + ' بناءً على طلبه؟', danger: true })) return;
  _portalCancelBusy = true;
  try {
    var res = await window.sb.rpc('portal_request_cancel_approve', { p_req: id });
    var out = (res && res.data) || {};
    if (res.error) {
      var em = (res.error.message || '') + ' ' + (res.error.code || '');
      showToast(/subscription_read_only|sub_gate|row-level security|permission/i.test(em) ? '🔒 الحساب للقراءة فقط' : '❌ تعذّر الإلغاء — حاول مجدداً', true);
    } else if (!out.ok) {
      showToast(out.reason === 'already_closed' ? 'هذا الطلب أُغلق مسبقاً'
        : out.reason === 'appointment_not_live' ? 'الموعد لم يعد قائماً (' + (out.status || '') + ') — أُغلق الطلب'
        : out.reason === 'appointment_gone' ? '⚠️ الموعد غير موجود — ربما حُذف' : '❌ تعذّر الإلغاء', true);
      await loadPortalRequests();
    } else {
      if (window.logAudit) {
        window.logAudit('appointment.status_change', {
          entityId: out.appointment_id, patientId: out.patient_id, patientName: out.patient_name || '',
          description: 'اعتماد طلب إلغاء من بوابة المريض — ' + (out.patient_name || '') + (out.reason ? ' — السبب: ' + out.reason : ''),
          oldValue: { status: out.prev_status }, newValue: { status: 'cancelled', confirmation_status: 'cancelled_by_pt', source: 'portal_request' }
        });
      }
      await loadPortalRequests();
      if (typeof apptLiveRefresh === 'function') { try { await apptLiveRefresh(); } catch (e) {} }
      portalWaCard({ title: '✅ أُلغي موعد ' + (out.patient_name || ''), sub: bookingFmtDate(out.date) + (out.time ? ' الساعة ' + fmtTime12(out.time) : ''),
                     patientId: out.patient_id, name: out.patient_name || '', msg: portalTplMsg('cancel_ok', { name: out.patient_name, date: out.date, time: out.time }) });
    }
  } catch (e) { showToast('❌ تعذّر الاتصال', true); }
  _portalCancelBusy = false;
}
/* one filler for both WhatsApp templates (moved · cancel_ok) */
function portalTplMsg(kind, v) {
  var cs = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : {};
  var custom = kind === 'cancel_ok' ? cs.portal_msg_cancel_ok : cs.portal_msg_moved;
  var tpl = (custom && String(custom).trim()) ? String(custom) : (kind === 'cancel_ok' ? PORTAL_CANCEL_OK_TPL : PORTAL_MOVED_TPL);
  var name = String(v.name || '').trim();
  var vals = { patient_first_name: name.split(' ')[0] || '', patient_name: name, clinic_name: cs.clinic_name || 'العيادة',
               clinic_phone: cs.clinic_phone || '', date: bookingFmtDate(v.date), time: fmtTime12(String(v.time || '').slice(0, 5)) };
  return tpl.replace(/\{(patient_first_name|patient_name|clinic_name|clinic_phone|date|time)\}/g, function (_, k) { return String(vals[k]); });
}
/* the same card both flows use: WhatsApp link to the patient's own phone (this clinic's card), logged when sent */
async function portalWaCard(o) {
  var phone = null;
  try {
    var pr = await window.sb.from('patients').select('phone').eq('id', o.patientId).eq('doctor_id', currentUser.id).maybeSingle();
    phone = (pr && !pr.error && pr.data) ? pr.data.phone : null;
  } catch (e) {}
  var intl = (phone && typeof normalizePhone === 'function') ? normalizePhone(phone) : null;
  portalMovedClose();
  var card = document.createElement('div');
  card.id = 'ptMovedCard';
  card.className = 'pt-moved-card';
  card.innerHTML = '<div class="pt-moved-t">' + escapeHtml(o.title) + '</div>'
    + '<div class="pt-moved-s">' + escapeHtml(o.sub || '') + '</div>'
    + (intl ? '<a class="pt-moved-wa" href="https://wa.me/' + intl + '?text=' + encodeURIComponent(o.msg) + '" target="_blank" rel="noopener" onclick="portalMovedSent()">📱 إرسال رسالة واتساب للمريض</a>'
            : '<div class="pt-moved-s">لا رقم هاتف صالح ببطاقة المريض — أبلغه مباشرة.</div>')
    + '<button type="button" class="pt-moved-x" onclick="portalMovedClose()">إغلاق</button>';
  document.body.appendChild(card);
  window._portalMovedLog = { patientId: o.patientId, body: o.msg, phone: phone };
  setTimeout(portalMovedClose, 45000);
}
/* المراسلات: the confirmation the clinic sent is logged like any WhatsApp message (non-blocking) */
async function portalMovedSent() {
  var L = window._portalMovedLog; portalMovedClose();
  if (!L || !currentUser) return;
  window._portalMovedLog = null;
  try {
    await window.sb.from('patient_messages').insert({ owner_id: currentUser.id, patient_id: L.patientId, kind: 'portal', channel: 'whatsapp_link',
      body: L.body, recipient_phone: L.phone || null, sent_by: (window.SyDentLock && window.SyDentLock.getCurrentEmployee && (window.SyDentLock.getCurrentEmployee() || {}).name) || null });
  } catch (e) { console.warn('moved msg log:', e); }
}

function portalReqOpenAppt(id) {
  var r = portalRequests.find(function (x) { return x.id === id; });
  if (!r || !r.appointment_id) return;
  var a = (typeof appointments !== 'undefined' && appointments) ? appointments.find(function (x) { return x.id === r.appointment_id; }) : null;
  if (!a) { showToast('⚠️ الموعد غير موجود — ربما حُذف'); return; }
  editAppt(r.appointment_id);
  var hint = r.kind === 'change'
    ? ('🔁 ' + (r.patient_name_snapshot || '') + ' يطلب تغيير الموعد' + (r.preference ? ' — يفضّل ' + (PORTAL_PREF_AR[r.preference] || '') : '') + (r.note ? ' — ' + r.note : ''))
    : ('✕ ' + (r.patient_name_snapshot || '') + ' يطلب إلغاء الموعد' + (r.reason ? ' — ' + r.reason : ''));
  showToast(hint, false, 8000);
}
