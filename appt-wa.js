/* SyDent — appt-wa.js: موديول واتساب/التذكير + قائمة الانتظار — استخراج appointments ٣.
 * نُقل بايت-بايت من appointments.html. تعريفات + حالة فقط — صفر كود تنفيذي وقت التحليل.
 * يحمل مرآتين محروستين بـcheck-mirrors (retarget): normalizePhone (⇔ book/patients/pp)
 * وDEFAULT_WA_TEMPLATE (⇔ settings). يعتمد globals وقت التشغيل: currentUser · window.sb ·
 * escapeHtml · showToast · patientsCache · appointments · warnParts/allergyParts (جيب المرايا inline). */

const DEFAULT_WA_TEMPLATE =
'مرحباً {patient_name} 👋\n\n' +
'تذكير بموعدك في عيادة {clinic_name}:\n' +
'📅 التاريخ: {date} ({day_of_week})\n' +
'🕐 الساعة: {time}\n' +
'👨‍⚕️ الطبيب: {doctor_name}\n\n' +
'الرجاء تأكيد الحضور 🙏';

// Distinct names from MONTHS_AR/DAYS_AR above (which are scoped lower in the
// file and used by the existing calendar renderer). Keeping these separate
// avoids any temporal-dead-zone or naming-collision surprises.
const DAYS_AR_FULL   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

// Normalize Syrian phone numbers to wa.me digits-only format with country code.
// Accepts: 0944xxx, +963xxx, 00963xxx, 963xxx, 944xxx — and tolerates spaces/dashes.
function normalizePhone(raw) {
  // ── 4-COPY MIRROR ── identical logic lives in: appointments.html normalizePhone ·
  // book.html normalizePhone · patients.html prmNormalizePhone · patient-profile.html ppNormalizePhone.
  // Any semantic change MUST be applied to ALL FOUR copies (FIFO-mirror pattern).
  // Accepted: Syrian mobile 09XXXXXXXX (10) · Syrian landline 0XX… (9-10 digits) ·
  // 9-digit mobile without the leading 0 · any international form (+CC… / 00CC… / CC…).
  // 0-leading with 11+ digits = FOREIGN local format (TR 05…, EG 01…, EU 0…): we cannot
  // guess the country → return null; callers show the "add country code" hint instead
  // of silently messaging a wrong Syrian number.
  if (!raw) return null;
  var p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (p.indexOf('00') === 0) p = p.substring(2);
  if (p.indexOf('0') === 0) {
    if (p.length === 9 || p.length === 10) p = '963' + p.substring(1);
    else return null; // foreign local — needs country code
  } else if (p.indexOf('963') !== 0 && p.length === 9) {
    p = '963' + p;
  }
  if (p.length < 10 || p.length > 15) return null;
  return p;
}

function formatArabicDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return SyDT.numDate(String(dateStr).slice(0, 10)) || dateStr;   // v487: رسالةُ المريض أرقاماً «21/9/2026» (قرار المالك)
}

function applyWaPlaceholders(template, data) {
  let out = template || '';
  Object.keys(data || {}).forEach(function(k){
    const re = new RegExp('\\{' + k + '\\}', 'g');
    out = out.replace(re, data[k] == null ? '' : String(data[k]));
  });
  return out;
}

function buildWaPlaceholderData(appt) {
  const fullName = (appt.patient_name || '').trim();
  const firstName = fullName.split(' ')[0] || fullName || 'المريض';
  let doctorName = '';
  if (appt.provider_id) {
    const doc = (CLINIC_DOCTORS || []).find(function(d){ return d.id === appt.provider_id; });
    if (doc) doctorName = doc.name || '';
  }
  if (!doctorName) {
    const meta = (currentUser && currentUser.user_metadata) || {};
    doctorName = meta.full_name || meta.name || '';
  }
  const d = new Date((appt.date || '') + 'T12:00:00');
  const dow = isNaN(d.getTime()) ? '' : DAYS_AR_FULL[d.getDay()];

  return {
    patient_name: fullName || 'المريض',
    patient_first_name: firstName,
    date: formatArabicDate(appt.date),
    day_of_week: dow,
    time: '\u200E' + fmtTime12(appt.time) + '\u200E',   // v487: LRM — «10:30 AM» لا «AM 10:30» بسطرٍ عربي بواتساب
    doctor_name: doctorName || '—',
    clinic_name:  (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name)  || 'عيادتنا',
    clinic_phone: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_phone) || ''
  };
}

function buildWaMessage(appt) {
  const tpl = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_reminder_template) || DEFAULT_WA_TEMPLATE;
  return applyWaPlaceholders(tpl, buildWaPlaceholderData(appt));
}

async function loadClinicSettingsWa() {
  if (!currentUser) return;
  try {
    const { data, error } = await window.sb.from('clinic_settings')
      .select('*').eq('owner_id', currentUser.id).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      const msg = (error.message || '') + ' ' + (error.code || '');
      if (!/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        console.warn('clinic_settings load:', error);
      }
      return;
    }
    if (data) CLINIC_SETTINGS_WA = data;
  } catch(e) { console.warn('clinic_settings:', e); }
}

async function loadReminderLogs() {
  if (!currentUser) return;
  reminderLogsByAppt = {};
  try {
    const { data, error } = await window.SyDentFetchAll(function(){ return window.sb.from('reminder_logs')
      .select('appointment_id, sent_at, status, channel')
      .eq('owner_id', currentUser.id)
      .order('sent_at', { ascending: false }); });
    if (error) {
      const msg = (error.message || '') + ' ' + (error.code || '');
      if (!/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        console.warn('reminder_logs load:', error);
      }
      return;
    }
    (data || []).forEach(function(log){
      // Latest log per appointment (data is DESC-sorted, first hit wins)
      if (!reminderLogsByAppt[log.appointment_id]) {
        reminderLogsByAppt[log.appointment_id] = log;
      }
    });
  } catch(e) { console.warn('reminder_logs:', e); }
}

// Lightweight phone resolution cache — keyed by both id and name so the
// resolver works for legacy appointments where patient_id is null.
async function loadPatientPhones() {
  if (!currentUser) return;
  try {
    /* v417 (M148): flags — أعلام المريض الملوّنة على بطاقة الموعد. قبل M148 يُعاد الاستعلام
       الأصلي حرفياً فتبقى سلسلة التدهور (M92 ثم M87) كما كانت. الريجكس لا يطابق
       medical_flags(_other): يشترط ألّا يسبق «flags» حرفٌ أو شرطة سفلية. */
    let { data, error } = await window.SyDentFetchAll(function(){ return window.sb.from('patients')
      .select('id, name, phone, allergies, medical_flags, medical_flags_other, flags').eq('doctor_id', currentUser.id); });
    if (error && /(^|[^_a-z])flags\b/i.test(error.message || '') && !/medical_flags/.test(error.message || '')) {
      ({ data, error } = await window.SyDentFetchAll(function(){ return window.sb.from('patients')
        .select('id, name, phone, allergies, medical_flags, medical_flags_other').eq('doctor_id', currentUser.id); }));
    }
    if (error && /medical_flags_other/.test(error.message || '')) {
      /* pre-M92 graceful: عمود التحذير الحر غير موجود بعد — ارجع بلا M92 */
      ({ data, error } = await window.SyDentFetchAll(function(){ return window.sb.from('patients')
        .select('id, name, phone, allergies, medical_flags').eq('doctor_id', currentUser.id); }));
    }
    if (error && (error.code === '42703' || /medical_flags/.test(error.message || ''))) {
      /* pre-M87 graceful: العمود غير موجود بعد — ارجع للأعمدة الأساسية كي لا ينكسر التذكير */
      ({ data, error } = await window.SyDentFetchAll(function(){ return window.sb.from('patients')
        .select('id, name, phone, allergies').eq('doctor_id', currentUser.id); }));
    }
    if (error) { console.warn('patients phones load:', error); return; }
    patientsCache = {};
    (data || []).forEach(function(p){
      patientsCache[p.id] = { name: p.name, phone: p.phone, allergies: p.allergies, medical_flags: p.medical_flags, medical_flags_other: p.medical_flags_other, flags: p.flags };
      if (p.name) patientsCache['__name__' + p.name] = { id: p.id, name: p.name, phone: p.phone, allergies: p.allergies, medical_flags: p.medical_flags, medical_flags_other: p.medical_flags_other, flags: p.flags };
    });
    try { if (window.SyDentFlags) window.APPT_FLAG_DEFS = await window.SyDentFlags.load(currentUser.id); } catch (e2) {}   /* v417 */
  } catch(e) { console.warn('patients phones:', e); }
}

function resolvePatientPhoneForAppt(appt) {
  if (appt.patient_id && patientsCache[appt.patient_id]) return patientsCache[appt.patient_id].phone || null;
  if (appt.patient_name && patientsCache['__name__' + appt.patient_name]) {
    return patientsCache['__name__' + appt.patient_name].phone || null;
  }
  return null;
}

/* ═══ Backlog #5: قائمة الانتظار ASAP — عرض/تذكير فقط، صفر منطق جدولة تلقائي ═══ */
var WAITLIST_DONE_STATUSES = { cancelled:1, broken:1, no_show:1, completed:1 };
/* المرشّحون: أي موعد نشط بعلم asap — المخطّط (بلا تاريخ) أولاً ثم بالتاريخ تصاعدياً */
function waitlistCandidates() {
  return (appointments || []).filter(function(a){
    return a.asap && !WAITLIST_DONE_STATUSES[a.status];
  }).sort(function(x, y){
    var xp = isPlannedAppt(x) ? 1 : 0, yp = isPlannedAppt(y) ? 1 : 0;
    if (xp !== yp) return yp - xp;   // planned first
    return String(x.date || '').localeCompare(String(y.date || ''));
  });
}
/* توست الفجوة المتحرّرة: مخطّط أو تاريخه أبعد من الفجوة = قد يناسبه الموعد */
function waitlistNudge(freedDate) {
  var n = waitlistCandidates().filter(function(a){
    return isPlannedAppt(a) || !freedDate || String(a.date || '') > String(freedDate);
  }).length;
  if (n > 0) showToast('⚡ يوجد ' + n + ' بقائمة الانتظار قد يناسبهم هذا الموعد المتحرّر — افتحها من زر «⚡ الانتظار»');
}
function updateWaitlistBadge() {
  var b = document.getElementById('waitlistBadge');
  if (!b) return;
  var n = waitlistCandidates().length;
  if (n > 0) { b.textContent = n; b.style.display = ''; }
  else b.style.display = 'none';
}
function renderWaitlist() {
  var el = document.getElementById('waitlistBody');
  if (!el) return;
  var list = waitlistCandidates();
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:34px 16px;color:var(--text2);">'
      + '<div style="font-size:36px;">⚡</div>'
      + '<div style="margin-top:8px;font-size:14px;">القائمة فارغة. فعّل «⚡ يرغب بموعد أبكر» بمودال الموعد لإضافة مريض.</div></div>';
    return;
  }
  el.innerHTML = list.map(function(a){
    var when = isPlannedAppt(a)
      ? '<span style="color:var(--yellow);font-weight:700;">مخطّط — بلا تاريخ بعد</span>'
      : 'موعده الحالي: <b>' + escapeHtml(SyDT.numDate(a.date) || a.date || '') + ' \u200E' + escapeHtml(fmtTime12(a.time)) + '\u200E</b>';   // v487: كان تاريخاً خاماً «2026-09-21»
    var phone = resolvePatientPhoneForAppt(a);
    var waBtn = phone
      ? '<button class="sy-act" data-sub-write onclick="waitlistWa(\'' + a.id + '\')">📱 واتساب</button>'
      : '<span style="font-size:11.5px;color:var(--text2);">بلا رقم</span>';
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:160px;">'
      + '<div style="font-weight:700;">' + (escapeHtml(a.patient_name) || '—') + '</div>'
      + '<div style="font-size:12.5px;color:var(--text2);margin-top:3px;">' + when
      + (a.type ? ' · ' + escapeHtml(a.type) : '') + '</div>'
      + '</div>'
      + '<div class="sy-acts">' + waBtn   /* v487: قائمةُ الانتظار على طقم أزرار الصفوف */
      + '<button class="sy-act" onclick="closeWaitlistModal();editAppt(\'' + a.id + '\')">🗓️ فتح الموعد</button>'
      + '</div></div>';
  }).join('');
}
function waitlistWa(apptId) {
  var a = (appointments || []).find(function(x){ return x.id === apptId; });
  if (!a) return;
  var raw = resolvePatientPhoneForAppt(a);
  var n = normalizePhone(raw);
  if (!n) { showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)'); return; }
  var clinic = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا';
  var msg = 'مرحباً ' + (a.patient_name || '') + '،\n'
    + 'تحرّر لدينا موعد أبكر في ' + clinic + ' — هل يناسبك تقديم موعدك؟ 🦷\n'
    + 'يرجى الرد لتأكيد الحجز 🙏';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank');
}
function openWaitlistModal() {
  renderWaitlist();
  document.getElementById('waitlistModal').classList.add('open');
}
function closeWaitlistModal() {
  document.getElementById('waitlistModal').classList.remove('open');
}
/* ═══ end Backlog #5 ═══ */

// Resolve a patient id to a name via the local cache. Used by the audit log
// calls in submitAppt/deleteAppt to record a stable patient_name_snapshot
// in case the patient row is later renamed or deleted.
//
// Bug fix: this helper was referenced from Phase 5 audit code but never
// defined in appointments.html — only in labs.html. The missing reference
// threw ReferenceError mid-flow inside submitAppt/deleteAppt, which:
//   • aborts the function before btn.disabled = false runs at the end,
//     so the save button stays disabled with "جارٍ الحفظ…" text
//   • aborts before reaching subsequent audit blocks, so audit gaps appear
//   • leaves any UI side effects (toast/render) in an awkward half-state
// Combined effect: the user observes "the modal stays stuck, the page is
// frozen, nothing works until F5". Defining the helper resolves all three
// audit callsites + restores normal end-of-function cleanup.
function getPatientName(id) {
  if (!id) return '';
  var p = patientsCache[id];
  return (p && p.name) ? p.name : '';
}

// Returns { kind: 'sent'|'pending'|'urgent', label, title } for a future
// appointment that has a phone-equipped patient, or null when no badge applies.
function classifyReminderForAppt(appt) {
  if (!appt || !appt.id || !appt.date) return null;
  // No reminder for finished appointments (completed/cancelled/broken/no_show).
  // Uses the shared helper so Gap 1's status set stays the single source of truth.
  if (isFinishedStatus(appt.status)) return null;

  // Priority 1: if a reminder was already sent, show the "تم التذكير" badge
  // regardless of whether the appointment is past or future. The user wants
  // confirmation that the action was taken, especially for today's appts
  // whose time has just passed — losing the badge in that small window would
  // look like the reminder vanished.
  const log = reminderLogsByAppt[appt.id];
  if (log) {
    return { kind: 'sent', label: '✓ تم التذكير', title: 'آخر تذكير: ' + SyDT.numDate(log.sent_at) + ' ' + SyDT.time12(log.sent_at) };
  }

  // "✓ تم التذكير" above is a RECORD of a sent reminder and persists even after
  // the patient arrives — it's informational, not a nag. From here down we only
  // decide whether to show the "أرسل تذكير" PROMPT, and that prompt is pointless
  // once the patient is physically present. Suppress only the prompt the moment
  // arrived_at / seated_at / dismissed_at is set (arrival only stamps the
  // timestamp; it never changes `status`, so isFinishedStatus above can't catch
  // it). Confirmation (confirmed_at 📞) is deliberately NOT included.
  if (appt.arrived_at || appt.seated_at || appt.dismissed_at) return null;

  // H4 fix: compute against the appointment's actual moment (date + time), not
  // against midday. Previously we hard-coded 'T12:00:00', so a 10am appointment
  // on TODAY (already past at 2pm) would still classify as "urgent — موعد قريب"
  // because midday lay 12h ahead of today-midnight. We now use appt.time when
  // available; if it's missing (legacy / planned), fall back to midday so the
  // old behaviour holds for those.
  const now = new Date();
  const timeStr = (appt.time && /^\d{2}:\d{2}/.test(appt.time)) ? appt.time.slice(0,5) : '12:00';
  const d = new Date(appt.date + 'T' + timeStr + ':00');
  if (isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - now.getTime();
  // Past appointments (negative diff) with no reminder log get no badge —
  // the slot has come and gone, no point nagging about a missed window. The
  // log priority check above means "تم التذكير" still shows if a reminder
  // was actually sent before the appointment.
  if (diffMs < 0) return null;

  const diffH = diffMs / 36e5;
  const cfgHours = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_reminder_hours_before) || 24;
  if (diffH <= 24) {
    return { kind: 'urgent', label: '⚠️ موعد قريب — أرسل تذكير', title: 'الموعد خلال ' + Math.round(diffH) + ' ساعة بدون تذكير' };
  }
  if (diffH <= cfgHours + 24) {
    return { kind: 'pending', label: '📱 أرسل تذكير', title: 'حان وقت إرسال التذكير' };
  }
  return null;
}

function getReminderBadgeHtml(appt) {
  if (!CLINIC_SETTINGS_WA || !CLINIC_SETTINGS_WA.whatsapp_reminders_enabled) return '';
  const c = classifyReminderForAppt(appt);
  if (!c) return '';
  // M141-ب: «تم التذكير» سجلٌّ يبقى؛ دعوتا الإرسال (عاجل/حان) كتابةٌ تُخفى بالقراءة
  return '<span class="wa-badge ' + c.kind + '"' + (c.kind !== 'sent' ? ' data-sub-write' : '') + ' title="' + escapeHtml(c.title) + '" onclick="event.stopPropagation(); openWaReminderModal(\'' + escapeHtml(appt.id) + '\')">' + escapeHtml(c.label) + '</span>';
}

// ═══════════════════════════════════════════════════════════════
// WhatsApp Reminder Modal handlers
// ═══════════════════════════════════════════════════════════════
let _currentWaApptId = null;

function openWaReminderModal(apptId) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: ختمُ «تم التذكير» ورابط ?wa= */
  const appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) { showToast('❌ لم يُعثر على الموعد'); return; }
  _currentWaApptId = apptId;

  document.getElementById('waModalPatient').textContent = appt.patient_name || '—';
  const phone = resolvePatientPhoneForAppt(appt);
  document.getElementById('waModalPhone').textContent = phone || '⚠️ غير متوفر';
  const d = new Date((appt.date || '') + 'T12:00:00');
  const dStr = isNaN(d.getTime()) ? appt.date : (DAYS_AR_FULL[d.getDay()] + ' ' + formatArabicDate(appt.date));
  document.getElementById('waModalDateTime').textContent = dStr + ' — ' + fmtTime12(appt.time);

  const warn = document.getElementById('waModalWarn');
  let warnHtml = '';
  if (!phone) {
    warnHtml += '⚠️ لا يوجد رقم هاتف مسجَّل لهذا المريض. أضِف رقم الهاتف في ملف المريض أولاً.<br>';
  }
  const prevLog = reminderLogsByAppt[apptId];
  if (prevLog) {
    warnHtml += 'ℹ️ تم إرسال تذكير سابقاً في ' + SyDT.numDate(prevLog.sent_at) + ' ' + SyDT.time12(prevLog.sent_at) + '. هل تريد إرسال آخر؟';
  }
  if (warnHtml) { warn.innerHTML = warnHtml; warn.style.display = 'block'; }
  else { warn.style.display = 'none'; warn.innerHTML = ''; }

  document.getElementById('waModalMessage').value = buildWaMessage(appt);
  /* v443: عدّادُ الأحرف — نفسُ طقم المحرّر بباقي المنصة */
  (function(){
    var ta = document.getElementById('waModalMessage'), c = document.getElementById('waMsgCount');
    if (!ta || !c) return;
    if (!ta._waCountBound) { ta._waCountBound = true; ta.addEventListener('input', function(){ c.textContent = (ta.value || '').length + ' حرف'; }); }
    c.textContent = (ta.value || '').length + ' حرف';
  })();

  const sendBtn = document.getElementById('waSendBtn');
  sendBtn.disabled = !phone;

  document.getElementById('waReminderModal').classList.add('open');
}

function closeWaReminderModal() {
  document.getElementById('waReminderModal').classList.remove('open');
  _currentWaApptId = null;
}

async function sendWaReminder() {
  if (!_currentWaApptId) return;
  const appt = appointments.find(function(a){ return a.id === _currentWaApptId; });
  if (!appt) { showToast('❌ لم يُعثر على الموعد'); return; }
  const rawPhone = resolvePatientPhoneForAppt(appt);
  const phone = normalizePhone(rawPhone);
  if (!phone) { showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)'); return; }
  const message = document.getElementById('waModalMessage').value.trim();
  if (!message) { showToast('⚠️ الرسالة فارغة'); return; }

  const sendBtn = document.getElementById('waSendBtn');
  sendBtn.disabled = true;

  // wa.me universal link — works on WhatsApp Web, mobile app, and desktop app
  const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');

  // Audit log (best-effort) — patient_id is FK NOT NULL so we resolve it first.
  try {
    let pid = appt.patient_id;
    if (!pid && appt.patient_name && patientsCache['__name__' + appt.patient_name]) {
      pid = patientsCache['__name__' + appt.patient_name].id;
    }
    if (!pid) {
      showToast('✅ تم فتح WhatsApp (لم يُسجَّل لوغ — مريض غير مرتبط)');
      closeWaReminderModal();
      return;
    }
    const { error } = await window.sb.from('reminder_logs').insert({
      owner_id: currentUser.id,
      appointment_id: appt.id,
      patient_id: pid,
      channel: 'whatsapp_link',
      status: 'sent',
      message_text: message,
      recipient_phone: phone
    });
    if (error) {
      console.warn('reminder_logs insert:', error);
      showToast('✅ تم فتح WhatsApp (تعذّر حفظ السجل)');
    } else {
      showToast('✅ تم إرسال التذكير');
      await loadReminderLogs();
      render();
    }
  } catch(e) { console.warn('sendWaReminder:', e); }

  closeWaReminderModal();
}

