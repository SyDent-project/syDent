/* ═══ pp-wa.js — SyDent decomposition extraction #7 ═══
 * وحدة واتساب لملف المريض: نُقلت بايت-بايت من patient-profile.html
 * (chunk1: سطور 1471-1589 · chunk2: سطور 1770-2290 على commit 671ddbe).
 * تعريفات صرفة + var/const حالة — صفر تنفيذ top-level يلمس DOM أو حالة الكتلة الرئيسية.
 * تُحمَّل بالـ<head> قبل الكتلة الرئيسية (نفس عقد pp-modules.js). */
// ═══════════════════════════════════════════════════════════════
// Phase 2A — WhatsApp Reminders (patient-profile quick action)
// All helpers prefixed with pp* to avoid global collisions with the
// appointments.html copies. The button targets the *nearest upcoming*
// appointment for this patient — multi-appointment patients still get
// per-appointment buttons via the appointments page.
// ═══════════════════════════════════════════════════════════════
var CLINIC_SETTINGS_WA = null;
var PP_BOOKING_PLAN_OK = true; // Migration 83: plan entitlement gate for {booking_link} (default-allow)
var PP_AI_PLAN_OK = true;      // AI features plan entitlement gate (default-allow / grandfather)
var PP_LABS_PLAN_OK = true;    // labs module plan entitlement gate (default-allow / grandfather)
var lastReminderLogByAppt = {}; // { appointment_id: last_log } for THIS patient only
var _currentPpWaApptId = null;

const PP_DEFAULT_WA_TEMPLATE =
'مرحباً {patient_name} 👋\n\n' +
'تذكير بموعدك في عيادة {clinic_name}:\n' +
'📅 التاريخ: {date} ({day_of_week})\n' +
'🕐 الساعة: {time}\n' +
'👨‍⚕️ الطبيب: {doctor_name}\n\n' +
'الرجاء تأكيد الحضور 🙏';

const PP_DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const PP_MONTHS_AR = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];

function ppNormalizePhone(raw) {
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

function ppFormatArabicDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return SyDT.numDate(String(dateStr).slice(0, 10)) || dateStr;   // v487: رسالةُ المريض أرقاماً (قرار المالك)
}

function ppApplyPlaceholders(template, data) {
  var out = template || '';
  Object.keys(data || {}).forEach(function(k){
    var re = new RegExp('\\{' + k + '\\}', 'g');
    out = out.replace(re, data[k] == null ? '' : String(data[k]));
  });
  return out;
}

function ppBuildPlaceholderData(appt) {
  var fullName = (patient && patient.name) ? patient.name.trim() : (appt.patient_name || '');
  var firstName = fullName.split(' ')[0] || fullName || 'المريض';
  var doctorName = '';
  if (appt && appt.provider_id && Array.isArray(CLINIC_DOCTORS)) {
    var doc = (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS).find(function(d){ return d.id === appt.provider_id; });
    if (doc) doctorName = doc.name || '';
  }
  if (!doctorName) {
    var meta = (currentUser && currentUser.user_metadata) || {};
    doctorName = meta.full_name || meta.name || '';
  }
  var d = new Date(((appt && appt.date) || '') + 'T12:00:00');
  var dow = isNaN(d.getTime()) ? '' : PP_DAYS_AR[d.getDay()];

  return {
    patient_name: fullName || 'المريض',
    patient_first_name: firstName,
    date: ppFormatArabicDate(appt && appt.date),
    day_of_week: dow,
    time: (appt && appt.time) ? '\u200E' + fmtTime12(appt.time) + '\u200E' : '',   // v487: LRM لاتجاه الوقت بواتساب
    doctor_name: doctorName || '—',
    clinic_name:  (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name)  || 'عيادتنا',
    clinic_phone: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_phone) || ''
  };
}

function ppBuildWaMessage(appt) {
  var tpl = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_reminder_template) || PP_DEFAULT_WA_TEMPLATE;
  return ppApplyPlaceholders(tpl, ppBuildPlaceholderData(appt));
}

async function ppLoadClinicSettings() {
  if (!currentUser) return;
  try {
    var res = await window.sb.from('clinic_settings')
      .select('*').eq('owner_id', currentUser.id).maybeSingle();
    if (res.error && res.error.code !== 'PGRST116') {
      var msg = (res.error.message || '') + ' ' + (res.error.code || '');
      if (!/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        console.warn('clinic_settings load:', res.error);
      }
      return;
    }
    if (res.data) CLINIC_SETTINGS_WA = res.data;
  } catch(e) { console.warn('clinic_settings:', e); }
  // Migration 83: plan gate for {booking_link} — mirrors patients.html.
  try {
    if (window.SyDentPlan) {
      await window.SyDentPlan.load();
      PP_BOOKING_PLAN_OK = window.SyDentPlan.can('booking');
      PP_AI_PLAN_OK = window.SyDentPlan.can('ai_features');
      // بوابة موديول المخابر — سطح مستهلِك خامس داخل بطاقة المريض (السطوح
      // الأربعة للقاعدة #223 سليمة أصلاً لـlabs: محرّر الخطط + PAGE_MODULE +
      // GATEABLE + عنصر التنقّل). القراءة هنا كي تبقى نقطة تحميل الخطة واحدة.
      PP_LABS_PLAN_OK = window.SyDentPlan.can('labs');
    }
  } catch(e) { /* fail-open */ }
  aiAssistSyncUI();   /* AI #1: flip body.ai-on once plan + opt-in are known */
}

/* ─── (كتلة الطباعة Phase 9.1 بقيت inline بموضعها الأصلي بين القصّتين) ─── */

async function ppLoadReminderLogs() {
  if (!currentUser || !patientId) return;
  lastReminderLogByAppt = {};
  try {
    // Phase 2B-A: include message_text, recipient_phone, id, created_at — the
    // timeline render and searchHay both rely on these fields. Without them
    // a reminder row would still appear, but its detail pane would be empty
    // and free-text search across reminder content wouldn't match anything.
    var res = await window.sb.from('reminder_logs')
      .select('id, appointment_id, sent_at, created_at, status, channel, message_text, recipient_phone')
      .eq('owner_id', currentUser.id)
      .eq('patient_id', patientId)
      .order('sent_at', { ascending: false });
    if (res.error) {
      var msg = (res.error.message || '') + ' ' + (res.error.code || '');
      if (!/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        console.warn('reminder_logs load:', res.error);
      }
      return;
    }
    (res.data || []).forEach(function(log){
      // Keep only the newest log per appointment (already sorted DESC).
      if (!lastReminderLogByAppt[log.appointment_id]) {
        lastReminderLogByAppt[log.appointment_id] = log;
      }
    });
  } catch(e) { console.warn('reminder_logs:', e); }
}

// Show/hide the topbar WhatsApp button based on:
//   - feature enabled in clinic_settings
//   - patient has at least one upcoming appointment
//   - patient has a valid phone number
// Also flips the button label to '✓ تم' when the nearest upcoming appt
// already has a reminder log, mirroring the badge semantics on the
// appointments page.
// Display a stored 24h "HH:mm" appointment time as 12h "hh:mm AM/PM" (matches
// the picker field). Returns the input unchanged on bad data.
function fmtTime12(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || '';
  var hp = t.split(':'), h = parseInt(hp[0], 10), m = (hp[1] || '').slice(0, 2);
  if (isNaN(h)) return t;
  var ap = h < 12 ? 'AM' : 'PM', h12 = h % 12; if (h12 === 0) h12 = 12;
  return (h12 < 10 ? '0' : '') + h12 + ':' + m + ' ' + ap;
}

function ppUpdateWaButtonVisibility() {
  var btn = document.getElementById('ppWaBtn');
  if (!btn) return;
  // Hub button: visible whenever the patient has a valid (sendable) phone.
  // WhatsApp is now the channel for reminders, prescriptions, instructions
  // and free messages, so the button is no longer tied to an upcoming appt.
  var _canNorm = (typeof ppNormalizePhone === 'function');
  var hasPhone = patient && patient.phone && _canNorm && ppNormalizePhone(patient.phone);
  btn.innerHTML = '📱 واتساب';
  btn.style.opacity = '';
  if (hasPhone) {
    btn.style.display = '';
    var nearest = (Array.isArray(upcomingAppts) && upcomingAppts.length) ? upcomingAppts[0] : null;
    var hasLog = nearest && lastReminderLogByAppt[nearest.id];
    btn.title = hasLog ? 'آخر تذكير: ' + SyDT.numDate(lastReminderLogByAppt[nearest.id].sent_at) + ' ' + SyDT.time12(lastReminderLogByAppt[nearest.id].sent_at) : 'مراسلة المريض عبر WhatsApp';
  } else if (patient && patient.phone && _canNorm) {
    /* رقم موجود لكنه غير قابل للإرسال (خانات خاطئة أو صيغة أجنبية بلا رمز دولة).
       الإخفاء الصامت كان يترك الطبيب بلا تفسير — الزر يبقى ظاهراً بحالة تنبيه،
       والنقرة تصل حارس openWaHub القائم فيشرح التوست السبب وطريقة الإصلاح. */
    btn.style.display = '';
    btn.style.opacity = '0.55';
    btn.innerHTML = '📱 واتساب ⚠️';
    btn.title = 'الرقم غير صحيح — للأرقام غير السورية أضف رمز الدولة';
  } else {
    /* لا رقم إطلاقاً (أو وحدة التطبيع غائبة): حالة مقصودة لا خطأ — يبقى مخفياً. */
    btn.style.display = 'none';
  }
}

function openWaReminderFromProfile() {
  if (!Array.isArray(upcomingAppts) || upcomingAppts.length === 0) {
    showToast('⚠️ لا يوجد موعد قادم لهذا المريض');
    return;
  }
  ppOpenWaModal(upcomingAppts[0]);
}

function ppOpenWaModal(appt) {
  if (!appt) return;
  _currentPpWaApptId = appt.id;
  document.getElementById('ppWaPatient').textContent = (patient && patient.name) || appt.patient_name || '—';
  var phone = patient ? patient.phone : null;
  document.getElementById('ppWaPhone').textContent = phone || '⚠️ غير متوفر';
  var d = new Date((appt.date || '') + 'T12:00:00');
  var dStr = isNaN(d.getTime()) ? appt.date : (PP_DAYS_AR[d.getDay()] + ' ' + ppFormatArabicDate(appt.date));
  document.getElementById('ppWaDateTime').textContent = dStr + ' — ' + fmtTime12(appt.time);

  var warn = document.getElementById('ppWaWarn');
  var warnHtml = '';
  if (!phone || !ppNormalizePhone(phone)) {
    warnHtml += '⚠️ لا يوجد رقم هاتف صالح. أضِف رقماً في معلومات المريض أولاً.<br>';
  }
  var prevLog = lastReminderLogByAppt[appt.id];
  if (prevLog) {
    warnHtml += 'ℹ️ تم إرسال تذكير سابقاً في ' + SyDT.numDate(prevLog.sent_at) + ' ' + SyDT.time12(prevLog.sent_at) + '. هل تريد إرسال آخر؟';
  }
  if (warnHtml) { warn.innerHTML = warnHtml; warn.style.display = 'block'; }
  else { warn.style.display = 'none'; warn.innerHTML = ''; }

  document.getElementById('ppWaMessage').value = ppBuildWaMessage(appt);

  var sendBtn = document.getElementById('ppWaSendBtn');
  sendBtn.disabled = !(phone && ppNormalizePhone(phone));

  ppWaReminderCountSync();   /* v443 */
  openModal('ppWaModal');
}

async function ppSendWaReminder() {
  if (!_currentPpWaApptId) return;
  var appt = upcomingAppts.find(function(a){ return a.id === _currentPpWaApptId; });
  if (!appt) { showToast('❌ لم يُعثر على الموعد'); return; }
  var phone = ppNormalizePhone(patient && patient.phone);
  if (!phone) { showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)'); return; }
  var msg = document.getElementById('ppWaMessage').value.trim();
  if (!msg) { showToast('⚠️ الرسالة فارغة'); return; }

  var sendBtn = document.getElementById('ppWaSendBtn');
  sendBtn.disabled = true;

  var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');

  try {
    var ins = await window.sb.from('reminder_logs').insert({
      owner_id: currentUser.id,
      appointment_id: appt.id,
      patient_id: patientId,
      channel: 'whatsapp_link',
      status: 'sent',
      message_text: msg,
      recipient_phone: phone
    }).select().single();
    if (ins.error) {
      console.warn('reminder_logs insert:', ins.error);
      showToast('⚠️ تم فتح WhatsApp (تعذّر حفظ السجل)');
    } else {
      showToast('✅ تم إرسال التذكير');
      // Phase 2B-A: merge the freshly-saved row into the in-memory map
      // immediately, then also re-fetch for safety. This ensures the
      // timeline + button checkmark update without waiting on a stale
      // schema cache.
      if (ins.data) {
        lastReminderLogByAppt[ins.data.appointment_id] = ins.data;
      }
      await ppLoadReminderLogs();
      ppUpdateWaButtonVisibility();
      // Phase 2B-A: the new reminder log appears in the timeline immediately.
      try { renderTimeline(); } catch(_) {}
    }
  } catch(e) { console.warn('ppSendWaReminder:', e); }

  closeModal('ppWaModal');
}

/* ============================================================
   WhatsApp Hub (مراسلة) — patient profile
   One header button (📱 واتساب) opens a hub:
     ⏰ تذكير  → reuses the existing reminder modal + reminder_logs
                 (only when reminders are enabled AND an upcoming appt
                 exists) — that flow is NOT modified here.
     💊 روشتة / 📋 تعليمات / ✍️ رسالة حرة → compose-only via wa.me
                 click-to-chat. These are NOT logged (reminder_logs
                 requires an appointment_id), matching the Syria-only
                 click-to-chat model used across the app.
   Reuses ppNormalizePhone + escapeHtml. Prescriptions/instructions are
   tab-lazy-loaded, so openWaHub() loads them before rendering.
   ============================================================ */
var _ppWaHubBusy = false;

// Plain WhatsApp text for one prescription ({head, items} from rxFetchFull).
function rxShareText(rx) {
  var c = rxClinicInfo();
  var dr = rxProviderName((rx.head || {}).provider_id);
  var pName = (patient && patient.name) ? patient.name : '';
  var lines = [];
  lines.push('💊 روشتة طبية — ' + c.clinic_name);
  if (dr) lines.push('الطبيب: ' + dr);
  lines.push('المريض: ' + pName);
  var mfSh = warnParts(patient);   /* M87+M92 */
  var agSh = allergyParts(patient);
  if (agSh.length) mfSh = mfSh.concat(['حساسية: ' + agSh.join('، ')]);
  if (mfSh.length) lines.push('⚠️ تحذير طبي: ' + mfSh.join('، '));
  lines.push('────────────');
  (rx.items || []).forEach(function(it, idx){
    var parts = [(idx + 1) + '. ' + it.drug_name];
    var sub = [];
    if (it.dosage)    sub.push(it.dosage);
    if (it.frequency) sub.push(it.frequency);
    if (it.duration)  sub.push(it.duration);
    if (sub.length)        parts.push('   ' + sub.join(' • '));
    if (it.instructions)   parts.push('   📌 ' + it.instructions);
    lines.push(parts.join('\n'));
  });
  if ((rx.head || {}).notes) { lines.push('────────────'); lines.push('ملاحظات: ' + rx.head.notes); }
  return lines.join('\n');
}

// Plain WhatsApp text for one post-op note.
function postOpShareText(note) {
  var c = (typeof rxClinicInfo === 'function') ? rxClinicInfo() : { clinic_name:'العيادة' };
  var pName = (patient && patient.name) ? patient.name : '';
  var tl = postOpTreatmentLabel(note.treatment_key);
  var lines = [];
  lines.push('📋 تعليمات بعد الجلسة — ' + c.clinic_name + (tl ? (' (' + tl + ')') : ''));
  if (pName) lines.push('المريض: ' + pName);
  lines.push('────────────');
  lines.push(note.body || '');
  return lines.join('\n');
}

/* 🔔 Recall via the hub — mirrors patients.html (prmRecallMsg placeholders + watch tail)
   and settings.html DEFAULT_RECALL_TEMPLATE. Mirror set (byte-parity):
   settings DEFAULT_RECALL_TEMPLATE · patients DEFAULT_RECALL_TPL · PP_DEFAULT_RECALL_TPL here. */
var PP_DEFAULT_RECALL_TPL = 'مرحباً {patient_first_name}،\nنذكّرك بموعد المراجعة الدورية في {clinic_name} للاطمئنان على صحة أسنانك. يسعدنا تحديد موعد مناسب لك في أقرب وقت. 🦷\n\n📅 احجز موعدك مباشرة من هنا: {booking_link}';
// mirror of prmWatchTeeth (patients.html) — dedupe per-surface rows, ascending, سن/الأسنان label
function ppWatchTeeth(ws){
  var seen = {}, teeth = [];
  (ws || []).forEach(function(w){
    var t = String(w.tooth_num);
    if (!seen[t]) { seen[t] = 1; teeth.push(t); }
  });
  teeth.sort(function(a, b){ return (+a) - (+b); });
  if (!teeth.length) return '';
  return (teeth.length === 1 ? 'سن ' : 'الأسنان ') + teeth.join('، ');
}
// mirror of prmWatchByDate (patients.html) — group by review_at, nearest first, undated last
function ppWatchByDate(ws){
  var by = {}, keys = [];
  (ws || []).forEach(function(w){
    var k = w.review_at ? String(w.review_at) : '';
    if (!by[k]) { by[k] = []; keys.push(k); }
    by[k].push(w);
  });
  keys.sort(function(a, b){ return (a || '9999-99-99') < (b || '9999-99-99') ? -1 : 1; });
  return keys.map(function(k){ return { date: k || null, teethTxt: ppWatchTeeth(by[k]) }; });
}
// Collect this patient's condition-watch rows from the LIVE chart map.
// perioIsExtracted-style swap-restore: inside history view, isExtracted() must read the live map.
function ppCollectWatches(){
  var swapped = false, saved = null;
  if (window.__historyMode && liveTeethMapRef) { saved = teethMap; teethMap = liveTeethMapRef; swapped = true; }
  try {
    var today = toDay();
    var due = [], soon = [];
    Object.keys(teethMap || {}).forEach(function(n){
      var st = teethMap[n] && teethMap[n].__status;
      if (!st) return;
      if (typeof isExtracted === 'function' && isExtracted(n)) return;
      var rev = teethMap[n].__review || {};
      Object.keys(st).forEach(function(s){
        if (st[s] !== 'condition') return;
        /* v431: حالةُ المكتبة السريرية (كسر/قلح…) توثيقٌ دائم لا «مراقبةٌ بموعد» — لا تُرسل
           للمريض ضمن قائمة المتابعة. مرآةُ استثناء البانر بـpp-dental.js. */
        if ((typeof COND_SURFACE !== 'undefined' && s === COND_SURFACE)
            || (typeof isConditionKey === 'function' && isConditionKey(teethMap[n][s]))) return;
        var r = rev[s] || null;
        if (r && String(r) <= today) due.push({ tooth_num: n, review_at: r });
        else soon.push({ tooth_num: n, review_at: r });
      });
    });
    return { due: due, soon: soon };
  } finally {
    if (swapped) teethMap = saved;
  }
}
function ppBookingLink(){
  if (!(CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.booking_enabled) || !PP_BOOKING_PLAN_OK || !currentUser) return '';
  var base = (location.origin && /^https?:/.test(location.origin)) ? location.origin : 'https://sydent.app';
  return base + '/book.html?c=' + currentUser.id;
}
// mirror of prmStripBookingIfDisabled (patients.html)
function ppStripBookingIfDisabled(tpl){
  if (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.booking_enabled && PP_BOOKING_PLAN_OK) return tpl || '';
  return (tpl || '').split('\n').filter(function(l){ return l.indexOf('{booking_link}') === -1; })
                    .join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}
function ppRecallShareText(){
  var tpl = (CLINIC_SETTINGS_WA && (CLINIC_SETTINGS_WA.whatsapp_recall_template || '').trim()) ? CLINIC_SETTINGS_WA.whatsapp_recall_template : PP_DEFAULT_RECALL_TPL;
  var full = ((patient && patient.name) || '').trim();
  var msg = ppApplyPlaceholders(ppStripBookingIfDisabled(tpl), {
    patient_name: full || 'المريض',
    patient_first_name: (full.split(' ')[0]) || full || 'حضرتك',
    clinic_name: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا',
    clinic_phone: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_phone) || '',
    booking_link: ppBookingLink()
  });
  var w = ppCollectWatches();
  var extra = [];
  var _dueTxt = ppWatchTeeth(w.due);
  if (_dueTxt) extra.push('⏰ مراجعة مستحقّة: ' + _dueTxt);
  ppWatchByDate(w.soon).forEach(function(g){
    extra.push('🗓️ مراجعة قادمة: ' + g.teethTxt + (g.date ? ' — بتاريخ ' + fmtDNum(g.date) : ''));
  });
  if (extra.length) msg += '\n' + extra.join('\n');
  return msg;
}
function ppWaHubRecall(){
  closeModal('ppWaHubModal');
  ppWaComposeOpen('🔔 استدعاء للمراجعة', ppRecallShareText(), undefined, undefined, undefined, 'recall');
}
async function openWaHub() {
  if (_ppWaHubBusy) return;
  if (!patient || !ppNormalizePhone(patient.phone)) {
    showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)');
    return;
  }
  _ppWaHubBusy = true;
  try {
    if (!CLINIC_SETTINGS_WA) { try { await ppLoadClinicSettings(); } catch(e){} }
    // Prescriptions/instructions are tab-lazy-loaded → ensure fresh before render.
    try { await loadPrescriptions(); } catch(e){}
    try { await loadPostOpNotes(); }  catch(e){}
  } finally { _ppWaHubBusy = false; }
  ppWaHubRender();
  openModal('ppWaHubModal');
}

function ppWaHubRow(icon, title, sub, onclick, hot) {
  return '<button type="button" class="wa-hub-item' + (hot ? ' wa-hub-hot' : '') + '" onclick="' + onclick + '">'
    + '<span class="wa-hub-ic">' + icon + '</span>'
    + '<span class="wa-hub-txt"><span class="wa-hub-title">' + escapeHtml(title) + '</span>'
    + (sub ? '<span class="wa-hub-sub">' + escapeHtml(sub) + '</span>' : '')
    + '</span><span class="wa-hub-arrow">‹</span></button>';
}

function ppWaHubPickerRow(icon, title, selectId, optionsHtml, onclick) {
  return '<div class="wa-hub-item wa-hub-pick">'
    + '<span class="wa-hub-ic">' + icon + '</span>'
    + '<span class="wa-hub-txt"><span class="wa-hub-title">' + escapeHtml(title) + '</span>'
    + '<select id="' + selectId + '" class="wa-hub-select">' + optionsHtml + '</select></span>'
    + '<button type="button" class="wa-send-btn wa-hub-send" onclick="' + onclick + '">إرسال</button></div>';
}

function ppWaHubRender() {
  var pInfo = document.getElementById('ppWaHubPatient');
  if (pInfo) pInfo.textContent = (patient && patient.name) || '—';
  var phInfo = document.getElementById('ppWaHubPhone');
  if (phInfo) phInfo.textContent = (patient && patient.phone) || '⚠️ غير متوفر';

  var body = document.getElementById('ppWaHubBody');
  if (!body) return;
  var rows = [];

  // ⏰ Reminder — only when the reminder feature is enabled AND an upcoming appt exists.
  var enabled = CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_reminders_enabled;
  if (enabled && Array.isArray(upcomingAppts) && upcomingAppts.length > 0) {
    var ap = upcomingAppts[0];
    var d = new Date((ap.date || '') + 'T12:00:00');
    var dStr = isNaN(d.getTime()) ? (ap.date || '') : (PP_DAYS_AR[d.getDay()] + ' ' + ppFormatArabicDate(ap.date));
    var sub = dStr + ' — ' + fmtTime12(ap.time) + (lastReminderLogByAppt[ap.id] ? ' • أُرسل ✓' : '');
    rows.push(ppWaHubRow('⏰', 'تذكير بالموعد القادم', sub, 'openWaHubReminder()', true));
  }

  // 🔔 Recall — when the patient has condition-watch teeth (due or upcoming).
  //    Compose-only (like Rx/post-op); the متابعة list with its «تم» cooldown stays canonical.
  var _w = ppCollectWatches();
  if (_w.due.length || _w.soon.length) {
    var _wp = [];
    if (_w.due.length)  _wp.push('مستحقّة: ' + ppWatchTeeth(_w.due));
    if (_w.soon.length) _wp.push('قادمة: ' + ppWatchTeeth(_w.soon));
    rows.push(ppWaHubRow('🔔', 'استدعاء للمراجعة الدورية', _wp.join(' · '), 'ppWaHubRecall()', _w.due.length > 0));
  }

  // 💊 Prescriptions
  if (Array.isArray(PRESCRIPTIONS) && PRESCRIPTIONS.length) {
    var itemsByRx = window._rxItemsByRx || {};
    var rxOpts = PRESCRIPTIONS.map(function(p){
      var items = itemsByRx[p.id] || [];
      var dt = p.created_at ? SyDT.numDate(p.created_at) : '';   // v478
      var drugs = items.map(function(it){ return it.drug_name; }).join('، ');
      if (drugs.length > 40) drugs = drugs.slice(0, 40) + '…';
      var lbl = dt + (drugs ? ' — ' + drugs : '');
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(lbl) + '</option>';
    }).join('');
    rows.push(ppWaHubPickerRow('💊', 'إرسال روشتة', 'ppWaHubRxPick', rxOpts,
      "ppWaHubRx(document.getElementById('ppWaHubRxPick').value)"));
  }

  // 📋 Post-op instructions
  if (Array.isArray(POST_OP_NOTES) && POST_OP_NOTES.length) {
    var poOpts = POST_OP_NOTES.map(function(n){
      var dt = n.created_at ? SyDT.numDate(n.created_at) : '';   // v478
      var tl = postOpTreatmentLabel(n.treatment_key);
      var lbl = dt + (tl ? ' — ' + tl : '');
      return '<option value="' + escapeHtml(n.id) + '">' + escapeHtml(lbl) + '</option>';
    }).join('');
    rows.push(ppWaHubPickerRow('📋', 'إرسال تعليمات', 'ppWaHubPoPick', poOpts,
      "ppWaHubPostOp(document.getElementById('ppWaHubPoPick').value)"));
  }

  // 🌟 Google review request — only when the owner has set a review link (the
  // configured link IS the gate; no separate enable flag). Syria model: manual
  // click-to-chat, doctor decides when to ask; not logged (no appointment_id).
  var _gRev = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.google_review_url) ? CLINIC_SETTINGS_WA.google_review_url : '';
  if (_gRev) {
    rows.push(ppWaHubRow('🌟', 'طلب تقييم', 'أرسل رابط تقييم غوغل للمريض', 'ppWaHubReview()', false));
  }

  // ✍️ Free message
  rows.push(ppWaHubRow('✍️', 'رسالة حرة', 'اكتب رسالة مخصّصة للمريض', 'ppWaHubFree()', false));

  body.innerHTML = rows.join('');
}

// Reminder → hand off to the existing (unmodified, logged) reminder flow.
function openWaHubReminder() {
  closeModal('ppWaHubModal');
  openWaReminderFromProfile();
}

async function ppWaHubRx(rxId) {
  if (!rxId) return;
  var rx = await rxFetchFull(rxId);
  closeModal('ppWaHubModal');
  ppWaComposeOpen('💊 إرسال روشتة', rxShareText(rx), undefined, undefined, undefined, 'prescription');
}

function ppWaHubPostOp(id) {
  if (!id) return;
  var note = postOpNoteGet(id);
  if (!note) { showToast('❌ لم يُعثر على التعليمات'); return; }
  closeModal('ppWaHubModal');
  ppWaComposeOpen('📋 إرسال تعليمات', postOpShareText(note), undefined, undefined, undefined, 'instructions');
}

function ppWaHubFree() {
  var pName = (patient && patient.name) ? patient.name : '';
  closeModal('ppWaHubModal');
  ppWaComposeOpen('✍️ رسالة حرة', 'مرحباً ' + pName + ' 👋\n\n', true, undefined, undefined, 'free');
}

// 🌟 Google review request — editable template (M97). Mirror set (byte-parity, Rule #211):
// settings DEFAULT_REVIEW_TEMPLATE · patient-profile PP_DEFAULT_REVIEW_TPL.
var PP_DEFAULT_REVIEW_TPL =
'مرحباً {patient_first_name} 👋\n' +
'شكراً لزيارتك {clinic_name}. يسعدنا أن رأيك يهمّنا! 🌟\n' +
'إذا كانت تجربتك طيّبة، نتشرّف بتقييمك على غوغل — لا يستغرق سوى دقيقة ويساعد غيرك في الوصول إلينا:\n' +
'{review_link}';
function ppReviewShareText() {
  var tpl = (CLINIC_SETTINGS_WA && (CLINIC_SETTINGS_WA.whatsapp_review_template || '').trim()) ? CLINIC_SETTINGS_WA.whatsapp_review_template : PP_DEFAULT_REVIEW_TPL;
  var full = ((patient && patient.name) || '').trim();
  return ppApplyPlaceholders(tpl, {
    patient_name: full || 'المريض',
    patient_first_name: (full.split(' ')[0]) || full || 'حضرتك',
    clinic_name: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا',
    review_link: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.google_review_url) || ''
  });
}
function ppWaHubReview() {
  closeModal('ppWaHubModal');
  ppWaComposeOpen('🌟 طلب تقييم', ppReviewShareText(), undefined, undefined, undefined, 'review');
}

/* ═══ بند #6: مسودّة واتساب ذكية (ai-assist · whatsapp_draft) ═══
   حمولة صفر-PII: قصد الطبيب نصاً + اسم العيادة فقط — {الاسم} يُدمج client-side
   (نمط #4-أ المثبَت). النتيجة تنزل بحقل الرسالة قابلة للتعديل، والإرسال
   بمسار ppWaComposeSend القائم حصراً. صفر state جديد مشترك (درس #4-أ). */
async function ppWaAiDraft() {
  var inp = document.getElementById('ppWaAiIntent');
  var ta = document.getElementById('ppWaComposeMsg');
  var btn = document.getElementById('ppWaAiBtn');
  if (!inp || !ta) return;
  var intent = (inp.value || '').trim();
  /* الموجة 2 بند #5 — حقل سؤال المريض الاختياري: نصٌّ يلصقه الطبيب
     بمسؤوليته (سابقة intent حرفياً). سؤال موجود ⇒ الميزة patient_reply_draft
     والقصد يصير توجيهاً اختيارياً؛ فارغ ⇒ السلوك القائم حرفياً بلا مساس. */
  var qEl = document.getElementById('ppWaAiQuestion');
  var question = qEl ? String(qEl.value || '').trim().slice(0, 800) : '';
  if (!question && !intent) { showToast('اكتب قصدك بكلمات مختصرة أولاً', true); return; }
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ الصياغة…'; }
  try {
    /* القائمة البيضاء = **أسماء الحقول المتاحة لهذا السطح فقط**، صفر قيم.
       الأسماء ليست بيانات مريض (patient_first_name اسم حقل لا اسم إنسان)،
       فحمولة صفر-PII باقية كما هي، والقيم كلها تُحلّ تحت بأسفل. */
    var _vars = _ppWaVars || ppWaVarData();
    var allow = ppWaAllowList(_vars);
    var _body;
    if (question) {
      _body = { feature: 'patient_reply_draft',
                input: { question: question,
                         intent: intent.slice(0, 300),
                         clinic_name: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || '',
                         placeholders: allow } };
    } else {
      _body = { feature: 'whatsapp_draft',
                input: { intent: intent,
                         clinic_name: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || '',
                         context: _ppWaAiContext || '',
                         placeholders: allow } };
    }
    var resp = await window.sb.functions.invoke('ai-assist', { body: _body });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم تصل رسالة — حاول مجدداً', true); return; }
    /* {الاسم} أولاً (عقد بند #6 الحرفي)، ثم بقية العناصر النائبة بخريطة
       هذه الرسالة. أي عنصر اخترعه النموذج خارج القائمة يبقى حرفياً —
       مرئي للطبيب قبل الإرسال (نمط #242) لا يُبتلع بصمت. */
    ta.value = ppWaResolve(text.split('{الاسم}').join((patient && patient.name) || ''));
    ppWaCountSync();
    var _left = ta.value.match(/\{[a-z_\u0600-\u06FF]{2,40}\}/g);
    showToast(_left ? ('🤖 تم — ⚠️ عناصر غير مدعومة بقيت كما هي: ' + _left.join(' '))
                    : '🤖 تم — راجع الرسالة وعدّلها قبل الإرسال');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 صِغ الرسالة بالذكاء الاصطناعي'; }
  }
}

/* ═══ طبقة العناصر النائبة المشتركة لمركز الواتساب ═══
   خريطة واحدة تخدم: تطبيق القوالب المحفوظة + حلّ مخرَج الـAI. القيم كلها
   تُبنى وتُحلّ **client-side حصراً** — لا اسم ولا هاتف يغادر المتصفح
   (تعميم نمط {الاسم} المثبَت ببند #6). */
var _ppWaVars = null;   // خريطة الرسالة المفتوحة حالياً (تُضبط بكل ppWaComposeOpen)
var _ppWaAiContext = '';   // مفتاح سياق السطح المُمرَّر للنموذج (enum مغلق بالخادم)

/* لا توجد قائمة عناصر ثابتة عمداً: القائمة البيضاء المُرسَلة للـAI تُشتق
   بالتنفيذ من مفاتيح _ppWaVars نفسها (انظر ppWaAiDraft) ⇒ مصدر حقيقة واحد،
   ويستحيل أن تنحرف عن الخريطة الفعلية أو تتحول لثابت «معرَّف بلا استهلاك». */

function ppWaVarData(extra){
  var full = ((patient && patient.name) || '').trim();
  var d = {
    patient_name: full || 'المريض',
    patient_first_name: (full.split(' ')[0]) || full || 'حضرتك',
    clinic_name: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا',
    clinic_phone: (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_phone) || '',
    booking_link: ppBookingLink()
  };
  Object.keys(extra || {}).forEach(function(k){ d[k] = extra[k]; });
  return d;
}
/* يحلّ نصاً يحوي عناصر نائبة بخريطة الرسالة الحالية. سطر {booking_link}
   يُشطب كاملاً إذا الحجز مطفأ أو خارج الخطة (ppStripBookingIfDisabled). */
function ppWaResolve(text){
  return ppApplyPlaceholders(ppStripBookingIfDisabled(text || ''), _ppWaVars || ppWaVarData());
}

/* القائمة البيضاء المُرسَلة للنموذج — **دالة نقيّة**: خريطة داخلة، أسماء
   حقول خارجة (صفر قيم، صفر globals) كي تكون قابلة للحراسة بـcheck-mirrors.
   مرآة سلوكية لـprmWaAllowList (patients.html) — القسم J.
   حقلا اسم المريض مستثنيان: عقد التحية هو {الاسم} حصراً، وإدراجهما يناقض
   بند «لا تذكر أي اسم أو معرّف شخصي آخر». و**أي عنصر قيمته فارغة يُسقَط** (رقم عيادة
   غير مُعبَّأ · حجز مطفأ) فلا يُقترَح على النموذج ما لا وجود له فيُنتج سطراً
   مبتوراً بعد الحلّ — وهذا هو سبب تعميم الشرط بدل قصره على booking_link. */
function ppWaAllowList(d){
  var NAME_KEYS = { patient_name: 1, patient_first_name: 1 };
  return Object.keys(d || {})
    .filter(function(k){ return !NAME_KEYS[k]; })
    .filter(function(k){ return d[k] !== '' && d[k] != null; })
    .map(function(k){ return '{' + k + '}'; });
}

/* M130.4 — تجريدُ اسم مريض الحالة من متن القالب قبل تخزينه، وردُّه إلى العنصر
   النائب {الاسم} الذي يُحلّ لمريض الحالة لحظةَ التطبيق (نمط #372 معكوساً، وهو
   الثابت الذي طبّقته v133 على قوالب الإحالة والمخبر وأعفت منه الرسالةَ الحرة
   بحكمٍ تبيّن خطؤه: مخرجُ النموذج ينزل بالحقل **محلولاً**، فحفظُه خام يخبز اسم
   المريض داخل قالبٍ يُعاد استعماله — فيصل مريضاً آخر تحيةٌ باسم غيره).
   **دالة نقيّة**: متنٌ واسمٌ داخلان، متنٌ خارج — صفر globals وصفر DOM، فهي
   مرآةٌ بايت-بايت بين pp-wa.js و patients.html محروسة بـcheck-mirrors (القسم J).
   الاسمُ الفارغ يُرجع المتنَ كما هو بايتياً فلا يستبدل شيئاً بلا سبب. */
function waTplAbstractName(body, patientName) {
  var b = String(body == null ? '' : body);
  var n = String(patientName == null ? '' : patientName).trim();
  if (!n) return b;
  return b.split(n).join('{الاسم}');
}

/* بناء خيارات قائمة القوالب — دالة نقيّة (قائمة + هارب داخلان، HTML خارج)
   مرآة **بايت-بايت** بين pp-wa.js و patients.html، محروسة بـcheck-mirrors
   (القسم J). الهارب يُمرَّر كبارامتر لأن كل صفحة تسمّي هاربها بشكل مختلف
   (escapeHtml ↔ prmEsc) — وهذا ما يبقي الجسم متطابقاً حرفياً. */
function waTplOptionsHtml(list, esc){
  var opts = '<option value="">— اختر قالباً —</option>';
  (list || []).forEach(function(t){
    opts += '<option value="' + t.id + '">' + esc(t.name) + '</option>';
  });
  return opts;
}

/* ═══ M109: مكتبة قوالب الرسائل الحرة ═══
   استنساخ نمط clinical_note_templates (M95). القالب يُحفظ بنصّه **الخام**
   (بعناصره النائبة كما هي) ويُحلّ لحظة التطبيق ⇒ نفس القالب يخدم كل المرضى.
   CRUD غير مُدقَّق (parity مع قوالب التعليمات والملاحظات). */
var WA_TEMPLATES = null;   // null = لم تُجلب بعد؛ [] = جُلبت (وقد تكون فارغة)

function _waTplIsMissingTableErr(e){
  return !!(e && (e.code === '42P01' || e.code === 'PGRST205' ||
    String(e.message || '').indexOf('wa_message_templates') !== -1));
}
async function waTplRefresh(){
  try {
    if (WA_TEMPLATES === null) {
      var res = await window.sb.from('wa_message_templates')
        .select('id, name, body, created_at')
        .eq('owner_id', currentUser.id)
        .eq('kind', 'wa_free')   /* M120: نطاق الرسالة الحرة حصراً — قوالب الإحالة لها نطاقها */
        .order('created_at', { ascending: false });
      if (res.error) return;          /* pre-M109: الصف يبقى مخفياً بصمت (#264) */
      WA_TEMPLATES = res.data || [];
    }
    var row = document.getElementById('ppWaTplRow');
    if (row) row.style.display = '';  /* الجدول متاح → أظهر حتى بصفر قوالب (اكتشافية 💾) */
    waTplPopulate();
  } catch (e) { /* graceful */ }
}
function waTplPopulate(){
  var sel = document.getElementById('ppWaTplPick');
  if (sel) { sel.innerHTML = waTplOptionsHtml(WA_TEMPLATES, escapeHtml); sel.value = ''; }
}
function waTplApply(tid){
  if (!tid) return;
  var tpl = (WA_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!tpl) return;
  var ta = document.getElementById('ppWaComposeMsg');
  if (!ta) return;
  /* استبدال كامل — القالب هنا رسالة كاملة لا مقطع (بخلاف Quick Notes).
     M130.4: {الاسم} يُحلّ هنا لمريض الحالة — ppWaResolve لا تعرفه (خريطتها
     تستثني حقلَي اسم المريض عمداً بعقد القائمة البيضاء)، فبلا هذا السطر كان
     تجريدُ الحفظ يُخرج «مرحباً {الاسم}» إلى صندوق رسالةٍ تُرسَل للمريض.
     نفسُ صياغة السطر 622 حرفياً حيث يُحلّ مخرجُ النموذج. */
  ta.value = ppWaResolve((tpl.body || '').split('{الاسم}').join((patient && patient.name) || ''));
  ppWaCountSync();
  showToast('✅ طُبّق القالب — راجعه قبل الإرسال');
}
var waTplSaveCurrent = ppGuarded('waTplSaveCurrent', _waTplSaveCurrent_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _waTplSaveCurrent_inner() {
  var ta = document.getElementById('ppWaComposeMsg');
  var body = ta ? (ta.value || '').trim() : '';
  if (!body) { showToast('⚠️ اكتب نص الرسالة أولاً ثم احفظها كقالب'); return; }
  /* شبكة أمان (نمط v134): رقمُ سنٍّ صريح لا عنصرَ نائبَ له بهذا السطح، فيبقى
     حرفياً داخل القالب — يُعلَن قبل التخزين بدل تسريب سنّ حالةٍ أخرى بصمت. */
  if (/(?:السن|الأسنان)\s*:?\s*\d{1,2}/.test(body)) {
    if (!await SyDialog.confirm({ message: '⚠️ النص يتضمن رقم سن صريح سيُحفظ كما هو داخل القالب.\n\nاسم المريض يُستبدل تلقائياً، أما رقم السن فيبقى حرفياً.\n\nمتابعة الحفظ رغم ذلك؟', danger: false })) return;
  }
  var name = await SyDialog.prompt({ title: 'اسم القالب', message: 'اكتب اسماً للقالب' });
  if (name === null) return;
  name = (name || '').trim();
  if (!name) { showToast('⚠️ الاسم مطلوب'); return; }
  body = waTplAbstractName(body, (typeof patient !== 'undefined' && patient) ? patient.name : '');
  var res = await window.sb.from('wa_message_templates')
    /* M130.1: النطاق يُسمّى صراحةً لا يُترك لـDEFAULT القاعدة — الافتراضُ
       تفصيلٌ بالمخطّط قد يتغيّر، والنيّةُ تُكتب بالكود. */
    .insert({ owner_id: currentUser.id, name: name, body: body, kind: 'wa_free' })
    .select().single();
  if (res.error) {
    if (_waTplIsMissingTableErr(res.error)) showToast('⚠️ يلزم تطبيق Migration 109 لتفعيل قوالب الرسائل');
    else showToast('⚠️ ' + res.error.message);
    return;
  }
  WA_TEMPLATES = [res.data].concat(WA_TEMPLATES || []);   /* الأحدث أولاً — يطابق order() */
  waTplPopulate();
  var sel = document.getElementById('ppWaTplPick');
  if (sel) sel.value = res.data.id;
  showToast('✅ حُفظ القالب «' + name + '»');
}
var waTplDeleteSelected = ppGuarded('waTplDeleteSelected', _waTplDeleteSelected_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _waTplDeleteSelected_inner() {
  var sel = document.getElementById('ppWaTplPick');
  var tid = sel && sel.value;
  if (!tid) { showToast('⚠️ اختر قالباً من القائمة أولاً'); return; }
  var tpl = (WA_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + ((tpl && tpl.name) || '') + '»؟ (لا يؤثر على أي رسالة أُرسلت سابقاً)', danger: true })) return;
  var res = await window.sb.from('wa_message_templates')
    .delete().eq('id', tid).eq('owner_id', currentUser.id).eq('kind', 'wa_free');
  if (res.error) { showToast('⚠️ ' + res.error.message); return; }
  WA_TEMPLATES = (WA_TEMPLATES || []).filter(function(t){ return t.id !== tid; });
  waTplPopulate();
  showToast('🗑 حُذف القالب');
}
/* ═══ end WA message templates ═══ */

/* v408: عدّاد أحرف نص الرسالة — مستمعٌ واحد يُربط عند أول فتح (بلا معالج inline)،
   ويُستدعى يدوياً بعد كل تعبئة برمجية (قالب/ذكاء/فتح) لأن .value لا تُطلق input. */
function ppMsgCountSync(taId, cntId) {
  var ta = document.getElementById(taId);
  var c = document.getElementById(cntId);
  if (!ta || !c) return;
  if (!ta._ppCountBound) {
    ta._ppCountBound = true;
    ta.addEventListener('input', function(){ ppMsgCountSync(taId, cntId); });
  }
  c.textContent = (ta.value || '').length + ' حرف';
}
function ppWaCountSync() { ppMsgCountSync('ppWaComposeMsg', 'ppWaMsgCount'); }
/* v443: التذكير يتبع الطقم نفسه (عنوانٌ + عدّاد + تلميحُ مراجعة) */
function ppWaReminderCountSync() { ppMsgCountSync('ppWaMessage', 'ppWaMsgCount2'); }

// Compose modal (prescription / instructions / free) — click-to-chat, not logged.
/* v421 (M149): نوعُ الرسالة المفتوحة بمودال الكتابة — يقرؤه ppWaComposeSend لتسجيلها بسجلّ
   المراسلات. يُضبط عند كل فتح (وسيطٌ سادس؛ غيابه ⇒ 'other') فلا يتسرّب نوعٌ من فتحٍ سابق. */
var _ppWaComposeKind = 'other';
function ppWaComposeOpen(title, text, aiOn, vars, aiContext, kind) {
  _ppWaComposeKind = ppMsgKindOk(kind) ? kind : 'other';
  var t = document.getElementById('ppWaComposeTitle');
  if (t) t.textContent = title;
  var pn = document.getElementById('ppWaComposePatient');
  if (pn) pn.textContent = (patient && patient.name) || '—';
  var ph = document.getElementById('ppWaComposePhone');
  if (ph) ph.textContent = (patient && patient.phone) || '⚠️ غير متوفر';
  var ta = document.getElementById('ppWaComposeMsg');
  if (ta) ta.value = text || '';
  /* بند #6: صف الصياغة الذكية — للرسالة الحرة فقط (aiOn) + بوابة AI القائمة.
     النداءات الأخرى (روشتة/تعليمات/تقييم) لا تمرّر aiOn → يبقى مخفياً
     فلا يُغري باستبدال رسائلها المهيكلة. */
  var aiRow = document.getElementById('ppWaAiRow');
  if (aiRow) aiRow.style.display = (aiOn && typeof aiAssistAvailable === 'function' && aiAssistAvailable()) ? '' : 'none';
  var aiIn = document.getElementById('ppWaAiIntent');
  if (aiIn) aiIn.value = '';
  /* بند #5: سؤال المريض الملصوق يُصفَّر كذلك — علوق سؤال مريضٍ سابق
     كان يوجّه صياغة الرد الجديد بصمت (نفس صنف علوق حقول الإحالة). */
  var aiQ = document.getElementById('ppWaAiQuestion');
  if (aiQ) aiQ.value = '';
  var aiQW = document.getElementById('ppWaAiQWrap');
  if (aiQW) aiQW.open = false;   /* v408: حقل السؤال مطوي افتراضياً */
  /* خريطة العناصر النائبة لهذه الرسالة — الأساس + أي قيم خاصة بالسطح
     (مثال: مبلغ القسط وتاريخ استحقاقه). تُستهلك بالقوالب وبمخرَج الـAI. */
  _ppWaVars = ppWaVarData(vars);
  _ppWaAiContext = aiContext || '';
  /* صف القوالب — إخفاء افتراضي إلزامي (#264)، ويُظهره waTplRefresh
     فقط إذا الجدول متاح فعلاً (graceful pre-M109).
     ⚠️ مفصول عن بوابة الـAI عمداً: القوالب ميزة مستقلة، وعيادة بلا اشتراك
     AI يجب أن تبقى قادرة على حفظ قوالبها واستعمالها. */
  var tplRow = document.getElementById('ppWaTplRow');
  if (tplRow) tplRow.style.display = 'none';
  var tplSel = document.getElementById('ppWaTplPick');
  if (tplSel) tplSel.value = '';
  if (aiOn) waTplRefresh();
  ppWaCountSync();
  openModal('ppWaComposeModal');
}

function ppWaComposeSend() {
  var phone = ppNormalizePhone(patient && patient.phone);
  if (!phone) { showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)'); return; }
  var msg = (document.getElementById('ppWaComposeMsg').value || '').trim();
  if (!msg) { showToast('⚠️ الرسالة فارغة'); return; }
  var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
  ppMsgLog(_ppWaComposeKind, msg, phone);   /* v421: بعد الفتح وغير حاجب — التسجيل لا يعطّل الإرسال أبداً */
  showToast('✅ تم فتح WhatsApp');
  closeModal('ppWaComposeModal');
}

async function ppWaComposeCopy() {
  var text = (document.getElementById('ppWaComposeMsg').value || '');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ النص ✓');
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('تم نسخ النص ✓');
    }
  } catch (e) { console.warn('wa compose copy:', e); showToast('⚠️ تعذّر النسخ'); }
}


/* ═══════════════ سجلّ المراسلات الموحّد (M149 · v421) ═══════════════
   خيطٌ واحد لكل ما أُرسل للمريض من بطاقته: patient_messages (روشتة · تعليمات · خطة · قسط ·
   استدعاء · تقييم · رسالة حرة) + reminder_logs القائم (تذكيرات المواعيد) — يُجمَعان عرضاً
   بلا ترحيل ولا تسجيل مزدوج. الإرسال click-to-chat ⇒ السطر وسمُ قناةٍ محايد («واتساب»)
   وشرحُه بالتلميح — لا «أُرسلت» ولا «سُلِّمت»: النظام لا يعلم إلا أن المحادثة فُتحت بهذا النص.
   التسجيل best-effort: بعد فتح واتساب، بلا await عند المنادي، وأي فشل (قبل M149 · وضع
   القراءة · شبكة) يُكتب بالكونسول فقط — لا توست ولا تعطيل للإرسال. صفر مال. */
var PP_MSG_KINDS = {
  prescription: { l: 'روشتة',         i: '💊', tone: 'purple' },
  instructions: { l: 'تعليمات',        i: '📋', tone: 'blue'   },
  plan:         { l: 'خطة العلاج',     i: '🦷', tone: 'green'  },
  installment:  { l: 'تذكير بقسط',     i: '💰', tone: 'orange' },
  recall:       { l: 'استدعاء مراجعة', i: '🔔', tone: 'cyan'   },
  birthday:     { l: 'تهنئة',          i: '🎂', tone: 'yellow' },
  review:       { l: 'طلب تقييم',      i: '🌟', tone: 'yellow' },
  referral:     { l: 'إحالة',          i: '↗️', tone: 'gray'   },
  free:         { l: 'رسالة حرة',      i: '✍️', tone: 'gray'   },
  other:        { l: 'رسالة',          i: '💬', tone: 'gray'   },
  reminder:     { l: 'تذكير بموعد',    i: '⏰', tone: 'lime'   }   /* من reminder_logs — لا يُكتب بـpatient_messages */
};
/* مفاتيح prototype (__proto__ · constructor) truthy على أي كائن — الفحص بـhasOwnProperty حصراً (درس #9400). */
function ppMsgKindOk(k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(PP_MSG_KINDS, k); }
var PATIENT_MESSAGES = null;   // null = لم يُحمَّل بعد
async function ppMsgLog(kind, body, phone) {
  try {
    if (!currentUser || !patientId || !body) return;
    if (!ppMsgKindOk(kind) || kind === 'reminder') kind = 'other';
    var by = null;
    try {
      var emp = (window.SyDentLock && window.SyDentLock.getCurrentEmployee) ? await window.SyDentLock.getCurrentEmployee() : null;
      by = emp && emp.name ? String(emp.name).slice(0, 80) : null;
    } catch (e1) {}
    var row = { owner_id: currentUser.id, patient_id: patientId, kind: kind, channel: 'whatsapp_link',
                body: String(body).slice(0, 6000), recipient_phone: phone ? String(phone).slice(0, 32) : null, sent_by: by };
    var ins = await window.sb.from('patient_messages').insert(row).select('id, kind, channel, body, recipient_phone, sent_by, created_at').single();
    if (ins.error) { console.warn('patient_messages insert:', ins.error); return; }
    if (Array.isArray(PATIENT_MESSAGES) && ins.data) { PATIENT_MESSAGES.unshift(ppMsgNorm(ins.data)); ppMsgRender(); }
  } catch (e) { console.warn('ppMsgLog:', e); }
}
function ppMsgNorm(r) {
  return { id: r.id, kind: r.kind, body: r.body || '', phone: r.recipient_phone || '', by: r.sent_by || '', at: r.created_at };
}
async function loadPatientMessages(force) {
  if (!currentUser || !patientId) return;
  if (Array.isArray(PATIENT_MESSAGES) && !force) { ppMsgRender(); return; }
  var out = [];
  try {
    var a = await window.sb.from('patient_messages')
      .select('id, kind, channel, body, recipient_phone, sent_by, created_at')
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(300);
    if (!a.error) (a.data || []).forEach(function (r) { out.push(ppMsgNorm(r)); });
    else if (!/42P01|PGRST205|does not exist/i.test((a.error.message || '') + ' ' + (a.error.code || ''))) console.warn('patient_messages load:', a.error);
  } catch (e) { console.warn('patient_messages:', e); }
  try {
    var b = await window.sb.from('reminder_logs')
      .select('id, sent_at, created_at, message_text, recipient_phone')
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('sent_at', { ascending: false }).limit(300);
    if (!b.error) (b.data || []).forEach(function (r) {
      out.push({ id: 'r:' + r.id, kind: 'reminder', body: r.message_text || '', phone: r.recipient_phone || '', by: '', at: r.sent_at || r.created_at });
    });
  } catch (e2) { console.warn('reminder_logs (messages tab):', e2); }
  out.sort(function (x, y) { return String(y.at || '').localeCompare(String(x.at || '')); });
  PATIENT_MESSAGES = out;
  ppMsgRender();
}
var _ppMsgFilter = '';
var _ppMsgOpen = {};   /* v422: الرسائل المفرودة — الافتراضي مطويّ بثلاثة أسطر */
function ppMsgSetFilter(k) { _ppMsgFilter = ppMsgKindOk(k) ? k : ''; ppMsgRender(); }
function ppMsgToggle(id) {
  if (Object.prototype.hasOwnProperty.call(_ppMsgOpen, id)) delete _ppMsgOpen[id];
  else _ppMsgOpen[id] = 1;
  ppMsgRender();
}
/* سطرٌ واحد يلخّص الرسالة بالقائمة المطوية: أول سطرٍ ذي معنى (بلا تحية أو رموز). */
function ppMsgSummary(body) {
  var lines = String(body || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].replace(/[\u200f\u200e]/g, '').trim();
    if (!t) continue;
    if (i < 2 && /^(مرحبا|مرحباً|أهلا|أهلاً|السلام)/.test(t)) continue;
    return t.length > 110 ? t.slice(0, 110) + '…' : t;
  }
  return '—';
}
function ppMsgWhen(iso) {
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  var d = (typeof fmtD === 'function') ? fmtD(iso) : String(iso).slice(0, 10);
  var hh = t.getHours(), mm = t.getMinutes();
  var tm = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  return d + ' · ' + ((typeof ppApptTime === 'function') ? ppApptTime(tm) : tm);
}
function ppMsgRender() {
  var el = document.getElementById('msgsList'), chips = document.getElementById('msgsChips'), badge = document.getElementById('msgsBadge');
  if (!el) return;
  var all = Array.isArray(PATIENT_MESSAGES) ? PATIENT_MESSAGES : [];
  if (badge) { badge.textContent = String(all.length); badge.style.display = all.length ? '' : 'none'; }
  if (!all.length) {
    if (chips) chips.innerHTML = '';
    el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div>لا مراسلات بعد — كل ما تُرسله لهذا المريض من زر «واتساب» (روشتة · تعليمات · خطة · تذكير…) يُسجَّل هنا بتاريخه ونصّه.</div></div>';
    return;
  }
  var counts = {}; all.forEach(function (m) { counts[m.kind] = (counts[m.kind] || 0) + 1; });
  if (chips) {
    chips.innerHTML = '<button type="button" class="msg-chip' + (_ppMsgFilter ? '' : ' on') + '" onclick="ppMsgSetFilter(\'\')">الكل ' + all.length + '</button>'
      + Object.keys(PP_MSG_KINDS).filter(function (k) { return counts[k]; }).map(function (k) {
          return '<button type="button" class="msg-chip' + (_ppMsgFilter === k ? ' on' : '') + '" onclick="ppMsgSetFilter(\'' + k + '\')">'
            + PP_MSG_KINDS[k].i + ' ' + PP_MSG_KINDS[k].l + ' ' + counts[k] + '</button>';
        }).join('');
  }
  var list = _ppMsgFilter ? all.filter(function (m) { return m.kind === _ppMsgFilter; }) : all;
  /* v422: بطاقةٌ مضغوطة — سطرُ عنوانٍ واحد + ملخّصٌ سطري، والنصُّ الكامل بالفرد فقط.
     كان كلُّ نصٍّ يُعرض كاملاً بصندوقٍ رماديٍّ عالٍ فتحوّلت القائمة إلى جدارٍ من الرمادي. */
  el.innerHTML = list.map(function (m) {
    var K = ppMsgKindOk(m.kind) ? PP_MSG_KINDS[m.kind] : PP_MSG_KINDS.other;
    var open = Object.prototype.hasOwnProperty.call(_ppMsgOpen, m.id);
    var meta = [m.by, m.phone].filter(Boolean);
    return '<div class="msg-card' + (open ? ' open' : '') + '">'
      + '<button type="button" class="msg-top" onclick="ppMsgToggle(\'' + escapeHtml(String(m.id)) + '\')" aria-expanded="' + (open ? 'true' : 'false') + '">'
      +   '<span class="msg-ico tone tone-' + K.tone + '" aria-hidden="true">' + K.i + '</span>'
      +   '<span class="msg-main">'
      +     '<span class="msg-line1"><b>' + K.l + '</b><span class="msg-when">' + escapeHtml(ppMsgWhen(m.at)) + '</span></span>'
      +     '<span class="msg-line2">' + escapeHtml(ppMsgSummary(m.body)) + '</span>'
      +   '</span>'
      +   '<span class="msg-caret" aria-hidden="true">' + (open ? '▴' : '▾') + '</span>'
      + '</button>'
      + (open
          ? '<div class="msg-full"><div class="msg-body">' + escapeHtml(m.body) + '</div>'
            + '<div class="msg-meta">'
            +   '<span class="msg-ch" title="وسمُ القناة: فُتحت محادثة واتساب بهذا النص من النظام. الإرسال يتمّ بيدك داخل واتساب، فالتسليم والقراءة خارج علم النظام.">واتساب</span>'
            +   (meta.length ? '<span class="msg-dot">·</span>' + meta.map(function (x, i) {
                  return '<span class="msg-m"' + (i && m.phone ? ' dir="ltr"' : '') + '>' + escapeHtml(x) + '</span>';
                }).join('<span class="msg-dot">·</span>') : '')
            + '</div></div>'
          : '')
      + '</div>';
  }).join('');
}
