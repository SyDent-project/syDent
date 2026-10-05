/* SyDent — appt-time.js: تتبع الوقت + الإكمال عند الخروج + أنواع المواعيد — استخراج appointments ٤.
 * نُقل بايت-بايت. صفر كود تنفيذي وقت التحليل. الطبقة المالية لم تُمسّ (بقيت inline).
 * globals وقت التشغيل: currentUser · sb · escapeHtml · showToast · appointments · patientsCache ·
 * loadAppointments · render · completeApptWithProcedures (inline) · apptPromptMaterialDeductionBulk (inline). */

// ─── Gap 6: Time Tracking helpers ────────────────────────────────────────────
// Tracks the patient journey:
//   confirmed_at  (📞 تم التأكيد)
//   arrived_at    (🚪 وصل العيادة)        ← appears in Waiting Room widget
//   seated_at     (🪑 جلس على الكرسي)     ← removed from Waiting Room widget
//   dismissed_at  (✅ خرج من العيادة)
//
// Workflow mirrors OpenDental: ONE button visible at a time (the next step).
// Once a timestamp is set, a colored badge appears under the patient name and
// the next button takes its place.

// Stage definitions — single source of truth for labels, colors, order.
var TIME_STAGES = [
  { key: 'confirmed_at', label: '📞 تأكيد', icon: '📞', color: 'var(--blue)',   tone: 'blue' },
  { key: 'arrived_at',   label: '🚪 وصل',   icon: '🚪', color: 'var(--yellow)', tone: 'yellow' },
  { key: 'seated_at',    label: '🪑 جلس',   icon: '🪑', color: 'var(--orange)', tone: 'orange' },
  { key: 'dismissed_at', label: '✅ خرج',   icon: '✅', color: 'var(--green)',  tone: 'green' }
];

// مراحل الحضور الفيزيائي بالعيادة — لا تُعرض إلا بيوم الموعد نفسه.
// موظفةُ الاستقبال لا تقدر تختم «وصل» لموعد الخميس القادم، والختمُ يكتب
// طابعاً زمنياً بلحظة النقر فيصير سجلُّ الحضور كاذباً على موعدٍ لم يحن.
// أمّا التأكيد (📞) فيبقى متاحاً لأي تاريخ لأن مكالمة التأكيد تسبق الموعد
// بيوم أو أكثر — وتبويب «الاتصالات» مبنيٌّ على ذلك (نافذته اليوم + الغد).
var PRESENCE_STAGE_KEYS = ['arrived_at', 'seated_at', 'dismissed_at'];

// هل الموعد بتاريخ اليوم المحلي؟ الموعدُ المخطَّط (date = null) والتاريخُ
// الفارغ يسقطان بالمقارنة نفسها فلا يحتاجان فرعاً — وفرعٌ لا يميّزه متجه
// كودٌ ميت يَعِد بحمايةٍ لا يقدّمها (قاعدة #499).
// dateStr عالميّ من appointments.html — نفس المُشتقّ الذي تُبنى به كل العروض،
// فيستحيل أن ينحرف حكمُ الزرّ عن اليوم المرسوم بالشاشة.
function isApptToday(appt) {
  return !!appt && appt.date === dateStr(new Date());
}

// ── v335: قفلُ نقل الموعد — مصدرٌ واحد للمودال والسحب الأسبوعي ─────────────
// أختامُ الحضور لا تُسجَّل إلا بيوم الموعد (isApptToday)، فهي تخصّ ذلك اليوم:
//   • منتهٍ (حالةٌ منتهية أو ختمُ خروج — المعيارُ نفسه بحارسَي السحب #227)
//     ⇒ التاريخُ والوقت مقفولان؛ الزيارةُ الجديدة = موعدٌ جديد (نمطُ OpenDental).
//   • حاضرٌ (وصل/جلس) بلا خروج ⇒ التاريخُ مقفول والوقتُ حرّ (الزيارةُ جارية).
// نقلُ موعدٍ مختومٍ ليومٍ آخر يترك أختاماً غريبة عن يومه الجديد: يُعرض «منتهياً»،
// ويختفي زرُّ «وصل»، ويُعدّ منجزاً بنبض اليوم، ويُسقط التذكير، وتُحفظ جلستُه
// المربوطة منجزةً بدل مخطّطة. الموعدُ المخطَّط (بلا تاريخ) خارج القفل.
function apptMoveLock(appt) {
  var none = { date: false, time: false, reason: null };
  if (!appt || appt.is_planned === true || !appt.date) return none;
  if (isFinishedStatus(appt.status) || appt.dismissed_at) return { date: true, time: true, reason: 'finished' };
  if (appt.arrived_at || appt.seated_at) return { date: true, time: false, reason: 'present' };
  return none;
}

// يرجع رسالةَ المنع أو null. prev = الصفّ المخزَّن؛ القيمُ الجديدة كما بالنموذج
// (الوقت يُقارَن بأول 5 محارف لأن القاعدة تخزّن HH:MM:SS).
function apptMoveBlocked(prev, newDate, newTime, toPlanned) {
  var lock = apptMoveLock(prev);
  if (!lock.date && !lock.time) return null;
  var dateChanged = !!toPlanned || (newDate || null) !== (prev.date || null);
  var timeChanged = !toPlanned && String(newTime || '').slice(0, 5) !== String(prev.time || '').slice(0, 5);
  if (lock.reason === 'finished' && (dateChanged || timeChanged)) {
    return '🔒 موعد منتهٍ — لا يمكن تغيير تاريخه أو وقته. احجز موعداً جديداً للزيارة القادمة';
  }
  if (lock.reason === 'present' && dateChanged) {
    return '🔒 سُجّل حضور المريض بيوم هذا الموعد — لا يمكن نقله ليوم آخر';
  }
  return null;
}

// Returns the next action button for an appointment, or null if no action is
// applicable (e.g. appointment is cancelled/broken, already dismissed, or the
// next step is a presence stage on an appointment that is not today's).
function getNextTimeAction(appt) {
  if (!appt) return null;
  if (isFinishedStatus(appt.status) && appt.status !== 'completed') return null;
  var today = isApptToday(appt);
  for (var i = 0; i < TIME_STAGES.length; i++) {
    var st = TIME_STAGES[i];
    if (appt[st.key]) continue;
    if (!today && PRESENCE_STAGE_KEYS.indexOf(st.key) !== -1) return null;
    return st;
  }
  return null; // all 4 stamps recorded
}

// Formats an ISO timestamp as 12h "hh:mm AM/PM", browser-local time. Returns ''
// on nullish input so callers can use it directly inside template strings.
function fmtApptTime(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) { return ''; }
}

// Display a stored 24h "HH:mm" appointment time as 12h "hh:mm AM/PM" (matches
// the picker field + the journey stamps). Returns the input unchanged on bad
// data so it never throws on legacy/empty values.
function fmtTime12(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || '';
  var hp = t.split(':'), h = parseInt(hp[0], 10), m = (hp[1] || '').slice(0, 2);
  if (isNaN(h)) return t;
  var ap = h < 12 ? 'AM' : 'PM', h12 = h % 12; if (h12 === 0) h12 = 12;
  return (h12 < 10 ? '0' : '') + h12 + ':' + m + ' ' + ap;
}

// Builds the inline "stamp strip" shown under the patient name listing each
// recorded stage in chronological order. Renders nothing if no stamps exist.
function renderTimeStrip(appt) {
  if (!appt) return '';
  var parts = [];
  TIME_STAGES.forEach(function(st) {
    if (appt[st.key]) {
      var t = fmtApptTime(appt[st.key]);
      parts.push(
        '<span class="time-track-stamp tone tone-' + st.tone + '" style="--bc:' + st.color +
        '" title="انقر مرتين لتعديل وقت ' + st.label.replace(/^[^\s]+\s/, '') + '" ' +
        'ondblclick="event.stopPropagation();overrideApptTime(\'' + appt.id + '\',\'' + st.key + '\')">' +
        st.icon + ' ' + t + '</span>'
      );
    }
  });
  if (!parts.length) return '';
  return '<div class="time-track-strip">' + parts.join('') + '</div>';
}

// Builds the inline action button HTML for a given appointment. Returns '' if
// no next action is available (so callers can splice into template strings).
function renderTimeActionBtn(appt) {
  var act = getNextTimeAction(appt);
  if (!act) return '';
  return '<button data-sub-write data-slot="1" class="time-track-btn cbadge tone tone-' + act.tone + '" ' +   /* v482: خانتُه الأولى بصفوف القائمة (.sy-slots) */
         'style="--bc:' + act.color + '" ' +
         'onclick="event.stopPropagation();recordApptTime(\'' + appt.id + '\',\'' + act.key + '\',this)">' +
         act.label + '</button>';
}

// Detects PostgreSQL CHECK-constraint violations for confirmation_status —
// fires when Gap 6 migration has not been applied yet. We then retry the
// update without the status field so the timestamp still gets saved.
function isConfirmationConstraintError(err) {
  if (!err) return false;
  var msg = (err.message || '') + ' ' + (err.code || '');
  return /check constraint|23514|confirmation_valid/i.test(msg);
}

// One-shot user warning for missing Gap 6 migration. Logged details give the
// admin everything needed to fix it without spamming the UI on every click.
var _gap6WarnedOnce = false;
function warnTimeTrackingMigrationOnce() {
  if (_gap6WarnedOnce) return;
  _gap6WarnedOnce = true;
  console.warn(
    'Gap 6 migration needed. Run in Supabase SQL editor:\n' +
    'ALTER TABLE appointments\n' +
    "  ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'pending',\n" +
    '  ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ,\n' +
    '  ADD COLUMN IF NOT EXISTS arrived_at    TIMESTAMPTZ,\n' +
    '  ADD COLUMN IF NOT EXISTS seated_at     TIMESTAMPTZ,\n' +
    '  ADD COLUMN IF NOT EXISTS dismissed_at  TIMESTAMPTZ;'
  );
  try {
    if (typeof showToast === 'function') {
      showToast('يلزم ترقية قاعدة البيانات لميزة تتبع الوقت — راجع console', 'warning');
    } else {
      if (window.SyDialog) SyDialog.alert({ title: 'ترقية مطلوبة', message: 'يلزم ترقية قاعدة البيانات لتفعيل تتبع الوقت بالكامل.' });
    }
  } catch (e) {}
}

// Detects "column does not exist" (42703) — fires when none of the timestamp
// columns are present at all. In that case we can't proceed; just warn.
function isMissingTimeColumnError(err) {
  if (!err) return false;
  var msg = (err.message || '') + ' ' + (err.code || '');
  return /42703|column .* does not exist|confirmed_at|arrived_at|seated_at|dismissed_at/i.test(msg);
}

// Records a single timestamp on an appointment. Auto-sets confirmation_status
// when stamping confirmed_at. Falls back gracefully if the migration is
// missing. Returns true on success, false otherwise.
async function recordApptTime(apptId, fieldKey, btnEl) {
  if (!apptId || !fieldKey) return false;
  // Validate fieldKey against whitelist to prevent injection via crafted DOM
  var allowedKeys = ['confirmed_at','arrived_at','seated_at','dismissed_at'];
  if (allowedKeys.indexOf(fieldKey) === -1) {
    console.error('recordApptTime: invalid field key', fieldKey);
    return false;
  }

  // Phase 8C: when the user clicks "🚪 خرج" (dismissed) and this appointment still has
  // planned attached sessions, intercept the flow and show the completion modal first.
  // The modal handlers then call back into recordApptTime via the special internal
  // marker '__fromDismissedModal' so we don't loop. If no planned sessions exist,
  // skip the modal entirely and stamp as before.
  if (fieldKey === 'dismissed_at' && btnEl !== '__fromDismissedModal') {
    var _apptForCheck = appointments.find(function(a){ return a.id === apptId; });
    if (_apptForCheck && _apptForCheck.dismissed_at) {
      // Already dismissed → nothing to intercept. Let the original flow be a no-op
      // (the original code below also handles this defensively).
    } else if (_apptForCheck) {
      var _attached = sessionsByAppt[apptId] || [];
      var _hasPlanned = _attached.some(function(s){ return s.status === 'planned'; });
      var _linkedLabsCheck = (labOrdersByAppt[apptId] || []).filter(function(o){
        return o.status === 'sent' || o.status === 'received' || o.status === 'checked';
      });
      if (_hasPlanned || _linkedLabsCheck.length) {
        // Open the picker modal instead of stamping immediately. btnEl is captured
        // so the modal handlers can re-enable it on cancel.
        if (btnEl && typeof btnEl === 'object') btnEl.disabled = false;
        openDismissedCompleteModal(apptId, btnEl);
        return true;  // intercepted — modal handlers will continue the workflow
      }
    }
  }

  // Disable the button while the update is in flight to prevent double-clicks.
  // Phase 8C: btnEl is a DOM node in the normal flow; the dismissed-modal callback
  // passes the sentinel string '__fromDismissedModal' instead, which we should skip.
  // v280: ⏳ while in flight; a failed stamp used to re-enable the button with
  // console-only logging (the user saw a button that "did nothing"); success
  // gets a toast naming the stage + patient + time (mirrors the dashboard v275).
  var _isBtn = !!(btnEl && typeof btnEl === 'object');
  var _origLbl = _isBtn ? btnEl.textContent : '';
  var _stage = null;
  for (var _si = 0; _si < TIME_STAGES.length; _si++) if (TIME_STAGES[_si].key === fieldKey) _stage = TIME_STAGES[_si];
  function _stampRestore() { if (_isBtn) { btnEl.disabled = false; btnEl.textContent = _origLbl; } }
  function _stampFail(msg) { _stampRestore(); if (typeof showToast === 'function') showToast(msg || 'تعذّر تسجيل الوقت — تحقّق من الاتصال وأعد المحاولة'); }
  if (_isBtn) { btnEl.disabled = true; btnEl.textContent = '⏳'; }

  var patch = {};
  patch[fieldKey] = new Date().toISOString();
  if (fieldKey === 'confirmed_at') patch.confirmation_status = 'confirmed';

  try {
    var res = await window.sb.from('appointments').update(patch).eq('id', apptId);
    if (res.error) {
      // Pre-migration: confirmation_valid constraint may not exist OR the
      // column itself may be absent. Retry without confirmation_status.
      if (isConfirmationConstraintError(res.error) && fieldKey === 'confirmed_at') {
        var retryPatch = {}; retryPatch[fieldKey] = patch[fieldKey];
        var retry = await window.sb.from('appointments').update(retryPatch).eq('id', apptId);
        if (retry.error) {
          if (isMissingTimeColumnError(retry.error)) { warnTimeTrackingMigrationOnce(); _stampRestore(); }
          else { console.error('recordApptTime retry failed:', retry.error); _stampFail(); }
          return false;
        }
        warnTimeTrackingMigrationOnce();
      } else if (isMissingTimeColumnError(res.error)) {
        warnTimeTrackingMigrationOnce();   // its own toast
        _stampRestore();
        return false;
      } else {
        console.error('recordApptTime failed:', res.error);
        _stampFail();
        return false;
      }
    }
    // Reflect locally so we don't wait a full network round-trip to re-render.
    var local = appointments.find(function(a){ return a.id === apptId; });
    if (local) {
      local[fieldKey] = patch[fieldKey];
      if (fieldKey === 'confirmed_at') local.confirmation_status = 'confirmed';
    }
    render();
    if (_stage && typeof showToast === 'function') {
      var _pn = local ? (typeof getPatientName === 'function' ? getPatientName(local.patient_id) : '') || local.patient_name || '' : '';
      showToast(_stage.label + (_pn ? ' — ' + _pn : '') + ' · ' + fmtTime12(new Date(patch[fieldKey]).toTimeString().slice(0,5)));
    }
    return true;
  } catch (e) {
    console.error('recordApptTime exception:', e);
    _stampFail();
    return false;
  }
}

// ─── Phase 8C: Dismissed-Trigger Completion Modal Handlers ───────────────────
// When the user clicks "🚪 خرج" on an appointment with planned sessions/labs,
// recordApptTime() intercepts and routes here. This module owns:
//   • state: which appt is being dismissed + the source button to re-enable
//   • UI: builds the checkbox list of planned sessions + lab orders
//   • flow: confirm → completeApptWithProcedures(subset) → stamp dismissed_at
// State is kept module-level (not on window) to prevent cross-tab contamination.

// Snapshot captured when the modal opens — needed by the OK/skip handlers.
var _phase8cState = null;     // { apptId, btnEl }
var _phase8cInFlight = false; // double-click guard across the whole flow

// Phase 8C C7-fix: auto-deliver any lab orders linked to the appointment.
// Extracted from completeApptWithProcedures (line 5213 region) so the same
// behavior fires from the three dismissal entry points:
//   1) completeApptWithProcedures (full-set path) — original caller
//   2) dismissedConfirmComplete (subset/zero with linkedLabs)
//   3) dismissedSkipComplete (no completion at all but linkedLabs exist)
// Returns { updated, failed } so callers can include the count in their toast.
// Silent — caller decides whether to surface the count to the user.
// Only advances 'sent' | 'received' | 'checked' → 'delivered'. Anything else
// (already delivered, rejected, etc.) is left untouched. Doctor-scoped UPDATE.
async function autoDeliverLinkedLabs(apptId) {
  var result = { updated: 0, failed: 0 };
  if (!apptId) return result;
  var linkedLabs = labOrdersByAppt[apptId] || [];
  for (var k = 0; k < linkedLabs.length; k++) {
    var lo = linkedLabs[k];
    if (lo.status === 'sent' || lo.status === 'received' || lo.status === 'checked') {
      try {
        var labRes = await window.sb.from('lab_orders')
          .update({ status: 'delivered', date_delivered: new Date().toISOString() })
          .eq('id', lo.id).eq('doctor_id', currentUser.id);
        if (labRes.error) {
          result.failed++;
          console.warn('autoDeliverLinkedLabs err:', labRes.error);
        } else {
          result.updated++;
        }
      } catch (e) {
        result.failed++;
        console.warn('autoDeliverLinkedLabs exception:', e);
      }
    }
  }
  return result;
}

function openDismissedCompleteModal(apptId, btnEl) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: رابط ?dismiss= لا يفتح الإكمال بوضع القراءة */
  if (_phase8cInFlight) return;  // already running — ignore extra clicks
  // Phase 8C audit R21: defense-in-depth — block if locked doctor is inactive.
  // recordApptTime (the original timestamp path) doesn't enforce this, but the
  // dismissed-trigger flow goes much further (completes sessions → ledger writes →
  // FIFO reallocation → audit log). Inactive accounts shouldn't trigger any of that.
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن إنهاء المواعيد');
    if (btnEl && typeof btnEl === 'object') btnEl.disabled = false;
    return;
  }
  var appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) { showToast('⚠️ الموعد غير موجود'); return; }

  _phase8cState = { apptId: apptId, btnEl: btnEl || null };

  // Build planned-session checkboxes. Pre-checked by default (the common case is
  // "yes, complete everything"). User unchecks anything that didn't actually happen.
  var attached = sessionsByAppt[apptId] || [];
  var planned = attached.filter(function(s){ return s.status === 'planned'; });
  var listEl = document.getElementById('dcmPlannedList');
  var sectionEl = document.getElementById('dcmPlannedSection');
  var emptyHintEl = document.getElementById('dcmEmptyHint');
  var confirmBtn = document.getElementById('dcmConfirmBtn');

  if (planned.length) {
    var QLBL = {'UR':'الربع العلوي الأيمن','UL':'الربع العلوي الأيسر','LL':'الربع السفلي الأيسر','LR':'الربع السفلي الأيمن'};
    var ALBL = {'U':'الفك العلوي','L':'الفك السفلي'};
    var rows = '';
    planned.forEach(function(s, idx){
      var area = '';
      if (s.tooth_num) {
        area = ' • السن ' + s.tooth_num + (s.surface && s.surface !== 'WHOLE' ? '/' + s.surface : '');
      } else if (s.quadrant && QLBL[s.quadrant]) {
        area = ' • ' + QLBL[s.quadrant];
      } else if (s.arch && ALBL[s.arch]) {
        area = ' • ' + ALBL[s.arch];
      }
      // Resolve provider name for clarity (uses CLINIC_DOCTORS already loaded in this page)
      var provName = '';
      if (s.provider_id && Array.isArray(CLINIC_DOCTORS)) {
        var pr = CLINIC_DOCTORS.find(function(d){ return d.id === s.provider_id; });
        if (pr) provName = pr.name;
      }
      rows += '<div class="dcm-row" data-idx="' + idx + '" data-session-id="' + escapeHtml(s.id) + '" data-checked="1" onclick="dcmToggleRow(this, event)" style="display:flex;align-items:center;gap:8px;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;user-select:none;">'
            +   '<span class="dcm-chk dcm-chk-checked" style="flex-shrink:0;"></span>'
            +   '<div style="flex:1;min-width:0;pointer-events:none;">'
            +     '<div style="font-size:13px;color:var(--text);font-weight:600;">' + escapeHtml(s.type || s.description || 'علاج') + escapeHtml(area) + '</div>'
            +     '<div style="font-size:11px;color:var(--text2);margin-top:2px;">' + fmtCost(s.cost) + ' ' + _apptCurLblOf(s.currency) + (provName ? ' • ' + escapeHtml(provName) : '') + ((s.plan_option >= 1 && s.plan_option <= 3) ? ' • 🔀 خيار ' + ['أ', 'ب', 'ج'][s.plan_option - 1] : '') + '</div>'
            +   '</div>'
            + '</div>';
    });
    /* M145-i: بنودُ خيارات الخطة البديلة — الاعتمادُ (إزالة البدائل وتحديث المخطط) يجري من ملف المريض */
    if (planned.some(function(s){ return s.plan_option >= 1 && s.plan_option <= 3; })) {
      rows += '<div style="margin-top:8px;padding:8px 10px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--text2);line-height:1.7;">'
            + '🔀 بعض هذه البنود من خيارات خطة بديلة — بعد الإكمال افتح ملف المريض واعتمد الخيار لإزالة البدائل وتحديث المخطط.</div>';
    }
    listEl.innerHTML = rows;
    sectionEl.style.display = 'block';
  } else {
    listEl.innerHTML = '';
    sectionEl.style.display = 'none';
  }

  // Linked labs: show as informational (no checkboxes — completeApptWithProcedures
  // updates labs as a side-effect of completing the appointment, only when subset
  // covers ALL planned sessions). For the dismissed-trigger flow, this matches
  // the original "Set Complete" semantics from the in-modal button.
  var linkedLabs = (labOrdersByAppt[apptId] || []).filter(function(o){
    return o.status === 'sent' || o.status === 'received' || o.status === 'checked';
  });
  var labsListEl = document.getElementById('dcmLabsList');
  var labsSectionEl = document.getElementById('dcmLabsSection');
  if (linkedLabs.length) {
    var labRows = linkedLabs.map(function(o){
      var statusLbl = (o.status === 'received') ? 'تم الاستلام' : (o.status === 'checked' ? 'مراجَع' : 'مُرسل');
      var toothPart = o.tooth_num ? ' — السن ' + o.tooth_num : '';
      return '• ' + escapeHtml(o.work_type || 'طلب مخبر') + toothPart + ' (' + statusLbl + ')';
    }).join('<br>');
    labsListEl.innerHTML = labRows;
    labsSectionEl.style.display = 'block';
  } else {
    labsListEl.innerHTML = '';
    labsSectionEl.style.display = 'none';
  }

  // Empty hint shown when neither planned sessions nor pending labs are present.
  // (recordApptTime won't open the modal in that case — but defense-in-depth.)
  if (!planned.length && !linkedLabs.length) {
    emptyHintEl.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = 'none';
  } else {
    emptyHintEl.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = '';
  }

  // Patient name in header
  var pname = '—';
  try {
    if (appt.patient_id && patientsCache && patientsCache[appt.patient_id]) {
      pname = patientsCache[appt.patient_id].name || appt.patient_name || '—';
    } else if (appt.patient_name) {
      pname = appt.patient_name;
    }
  } catch (e) {}
  document.getElementById('dcmPatient').textContent = pname;

  // Phase 8C C8-fix: set initial labs-header text based on the default state
  // (all planned rows are pre-checked when the modal first opens, so the
  // header reads "ستُسجَّل" until the user unchecks something).
  dcmUpdateLabsHeader();

  document.getElementById('dismissedCompleteModal').classList.add('open');
}

function closeDismissedCompleteModal() {
  document.getElementById('dismissedCompleteModal').classList.remove('open');
  // Re-enable the source button (the "🚪 خرج" button in the list/day view) so
  // the user can retry. If the modal completed successfully, the list will be
  // re-rendered anyway and the button will be replaced by the next stage badge.
  if (_phase8cState && _phase8cState.btnEl && typeof _phase8cState.btnEl === 'object') {
    _phase8cState.btnEl.disabled = false;
  }
  _phase8cState = null;
}

// Phase 8C: toggle a fake-checkbox row in the dismissed-completion modal.
// We use a custom div+span UI instead of native <input type=checkbox> because
// the global `input { appearance:none; width:100% }` reset on this page makes
// native checkboxes unreliable (zero hit-area, missing glyph). Each .dcm-row
// owns its own data-checked attribute ("0" or "1"); the visual ✓ comes from
// the .dcm-chk-checked class on the inner span.
function dcmToggleRow(rowEl, ev) {
  if (!rowEl) return;
  // Stop propagation so clicking inside doesn't bubble to .modal-overlay
  // (which would close the modal when event.target === overlay — guarded but
  // belt-and-suspenders).
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var current = rowEl.getAttribute('data-checked');
  var next = (current === '1') ? '0' : '1';
  rowEl.setAttribute('data-checked', next);
  var chk = rowEl.querySelector('.dcm-chk');
  if (chk) {
    if (next === '1') chk.classList.add('dcm-chk-checked');
    else chk.classList.remove('dcm-chk-checked');
  }
  // Phase 8C C8-fix: header text for the labs section depends on whether ALL
  // planned sessions are checked (lab auto-delivers) or only some (lab stays
  // as-is). Recompute on every toggle so the user sees the consequence of
  // their choice in real time before pressing OK.
  dcmUpdateLabsHeader();
}

// Phase 8C C8-fix: keep the labs-section header in sync with checkbox state.
// Three states:
//   • All planned checked (or zero planned) → green "ستُسجَّل كـ تم التركيب ✓"
//   • Some unchecked (subset)              → yellow warning that labs WON'T deliver
//   • No labs section visible              → nothing to do (defensive guard)
// Called from: openDismissedCompleteModal (initial render) and dcmToggleRow.
function dcmUpdateLabsHeader() {
  var headerEl = document.getElementById('dcmLabsHeader');
  var labsSection = document.getElementById('dcmLabsSection');
  if (!headerEl || !labsSection || labsSection.style.display === 'none') return;
  var rows = document.querySelectorAll('#dcmPlannedList .dcm-row');
  var totalPlanned = rows.length;
  var checkedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('data-checked') === '1') checkedCount++;
  }
  // Full-set OR no planned sessions at all (lab-only dismissal) → lab WILL deliver.
  // Subset (some unchecked) → lab stays.
  var willDeliver = (totalPlanned === 0) || (checkedCount === totalPlanned);
  if (willDeliver) {
    headerEl.innerHTML = '🔬 طلبات مخبر مرتبطة (<span style="color:var(--green);">ستُسجَّل كـ "تم التركيب" ✓</span>):';
  } else {
    headerEl.innerHTML = '🔬 طلبات مخبر مرتبطة (<span style="color:var(--yellow);">⚠️ لن تُسجَّل — يلزم تحديد جميع الجلسات أولاً</span>):';
  }
}

// User chose "⏸️ فقط تسجيل الخروج" — stamp dismissed_at but do not complete sessions.
async function dismissedSkipComplete() {
  if (!_phase8cState || !_phase8cState.apptId) { closeDismissedCompleteModal(); return; }
  if (_phase8cInFlight) return;
  _phase8cInFlight = true;
  var apptId = _phase8cState.apptId;
  // Close the modal first to avoid double-clicks on its buttons during the await.
  document.getElementById('dismissedCompleteModal').classList.remove('open');
  try {
    // OpenDental-pattern: when the user dismisses without completing ANY of
    // the planned procedures, detach all of them from this appointment so
    // they're available for a follow-up appointment. Without this, the
    // planned sessions stay welded to the old (now-dismissed) appointment
    // and don't appear in "علاجات مخططة متاحة للربط" when the patient is
    // rescheduled. Silent — any error logs to console but doesn't block the stamp.
    try {
      var attached = sessionsByAppt[apptId] || [];
      var plannedIds = attached
        .filter(function(s){ return s.status === 'planned'; })
        .map(function(s){ return s.id; });
      if (plannedIds.length > 0) {
        var detachRes = await window.sb.from('ledger_sessions')
          .update({ appointment_id: null })
          .in('id', plannedIds)
          .eq('doctor_id', currentUser.id)
          .eq('status', 'planned');
        if (detachRes.error) {
          console.warn('Phase 8C skip-detach planned sessions warn:', detachRes.error);
        }
      }
    } catch (de) { console.warn('Phase 8C skip-detach exception:', de); }
    // C7-fix: auto-deliver linked labs even on skip flow. The patient is leaving
    // the chair — if labs were "received" they should advance to "delivered" as
    // OpenDental does. Skip flow means "no planned procedures done", but a lab
    // delivery appointment legitimately has zero planned procedures and still
    // needs the lab marked delivered.
    var labAutoResult = await autoDeliverLinkedLabs(apptId);
    // Use the sentinel so recordApptTime skips the interception logic and just stamps.
    await recordApptTime(apptId, 'dismissed_at', '__fromDismissedModal');
    if (labAutoResult.updated > 0) {
      showToast('✅ تم تسليم ' + labAutoResult.updated + ' طلب مخبر');
    } else if (labAutoResult.failed > 0) {
      showToast('⚠️ تعذّر تحديث ' + labAutoResult.failed + ' طلب مخبر');
    }
  } catch (e) { console.error('dismissedSkipComplete error:', e); }
  _phase8cInFlight = false;
  _phase8cState = null;
}

// User chose "✅ خرج + إكمال المحدد" — complete the checked sessions, then stamp dismissed_at.
async function dismissedConfirmComplete() {
  if (!_phase8cState || !_phase8cState.apptId) { closeDismissedCompleteModal(); return; }
  if (_phase8cInFlight) return;
  // Collect selected session IDs from the modal DOM (snapshot now — modal will close).
  // Phase 8C: we use a fake-checkbox UI (div with data-checked, not <input>)
  // because native checkboxes break under the global input reset on this page.
  // Each .dcm-row owns its own data-checked + data-session-id.
  var rows = document.querySelectorAll('#dcmPlannedList .dcm-row');
  var selectedIds = [];
  var allRowIds = [];
  for (var i = 0; i < rows.length; i++) {
    var rowSid = rows[i].getAttribute('data-session-id');
    if (rowSid) allRowIds.push(rowSid);
    if (rows[i].getAttribute('data-checked') === '1') {
      if (rowSid) selectedIds.push(rowSid);
    }
  }
  // Sessions the user unchecked = planned procedures they did NOT do today.
  // OpenDental-pattern: detach these from the dismissed appointment so they
  // appear again in "علاجات مخططة متاحة للربط" when a follow-up appointment
  // is booked. Without this, the planned sessions stay welded to the old
  // (now-dismissed) appointment and the user thinks they've vanished.
  var unselectedIds = allRowIds.filter(function(id){ return selectedIds.indexOf(id) === -1; });
  _phase8cInFlight = true;
  var apptId = _phase8cState.apptId;
  // Close modal immediately so the user sees responsive feedback.
  document.getElementById('dismissedCompleteModal').classList.remove('open');
  try {
    var completionSucceeded = true;
    var labAutoResult = null;  // { updated, failed } — set when we deliver labs without going through completeApptWithProcedures
    if (selectedIds.length > 0) {
      // Reuse the unified completion flow. Provider-mismatch and lab-sync prompts
      // inside completeApptWithProcedures will fire as usual.
      // Phase 8C audit #15: function returns false when user cancels a mid-flow
      // prompt (e.g. provider mismatch second prompt). In that case, do NOT stamp
      // dismissed_at — leave the appointment exactly where it was.
      var ret = await completeApptWithProcedures(apptId, selectedIds);
      completionSucceeded = (ret !== false);
    } else {
      // C7-fix: zero sessions selected, but the modal still opened — meaning there
      // were either planned sessions (user unchecked all) OR linked labs (or both).
      // completeApptWithProcedures auto-delivers labs only in the full-set path; we
      // never reach it here. Deliver labs directly so a lab-only dismissal still
      // moves the work to 'delivered' as OpenDental does.
      labAutoResult = await autoDeliverLinkedLabs(apptId);
    }
    // Only stamp dismissed_at when the completion attempt wasn't cancelled.
    // Note: completeApptWithProcedures may have already set appointment.status='completed'
    // in the full-set case, which auto-stamps dismissed_at via submitAppt's logic. But
    // we use the same-path stamp here for symmetry with the skip-flow and for the case
    // where appointment.status was NOT updated (partial subset).
    if (completionSucceeded) {
      // Detach unfinished planned sessions BEFORE stamping dismissed_at so a
      // failure here doesn't leave the appointment in an inconsistent state
      // (stamped dismissed but procedures still linked). Silent operation —
      // any error logs to console but doesn't block the dismiss flow.
      if (unselectedIds.length > 0) {
        try {
          var detachRes = await window.sb.from('ledger_sessions')
            .update({ appointment_id: null })
            .in('id', unselectedIds)
            .eq('doctor_id', currentUser.id)
            .eq('status', 'planned');
          if (detachRes.error) {
            console.warn('Phase 8C detach unfinished planned sessions warn:', detachRes.error);
          }
        } catch (de) { console.warn('Phase 8C detach exception:', de); }
      }
      await recordApptTime(apptId, 'dismissed_at', '__fromDismissedModal');
      // Surface lab auto-delivery count to the user when it was the only DB write
      // (completeApptWithProcedures shows its own toast when it runs, so we skip
      // adding a second toast in that path).
      if (labAutoResult && labAutoResult.updated > 0) {
        showToast('✅ تم تسليم ' + labAutoResult.updated + ' طلب مخبر');
      } else if (labAutoResult && labAutoResult.failed > 0) {
        showToast('⚠️ تعذّر تحديث ' + labAutoResult.failed + ' طلب مخبر');
      }
    }
  } catch (e) {
    console.error('dismissedConfirmComplete error:', e);
    showToast('⚠️ تعذّر إكمال الموعد بالكامل — راجع console');
  }
  _phase8cInFlight = false;
  _phase8cState = null;
}

// Manual override of a timestamp via double-click on its stamp. Accepts
// HH:MM input (24h). Empty input clears the timestamp (allows undo).
// Date portion is preserved from the existing value or defaults to appt.date.
async function overrideApptTime(apptId, fieldKey) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: النقر المزدوج على الختم */
  var allowedKeys = ['confirmed_at','arrived_at','seated_at','dismissed_at'];
  if (allowedKeys.indexOf(fieldKey) === -1) return;
  var appt = appointments.find(function(a){ return a.id === apptId; });
  if (!appt) return;

  var stage = TIME_STAGES.find(function(s){ return s.key === fieldKey; });
  var stageName = stage ? stage.label.replace(/^[^\s]+\s/, '') : 'الوقت';
  // v335: القيمةُ المقترحة بصيغة 24 ساعة كما يطلب السؤال — كانت تُعرض
  // «01:15 PM» (fmtApptTime) فيرفضها التحقّق نفسه عند الضغط على موافق بلا تعديل.
  var currentDisplay = '';
  if (appt[fieldKey]) {
    var _cd = new Date(appt[fieldKey]);
    if (!isNaN(_cd.getTime())) {
      currentDisplay = (_cd.getHours() < 10 ? '0' : '') + _cd.getHours() + ':' +
                       (_cd.getMinutes() < 10 ? '0' : '') + _cd.getMinutes();
    }
  }
  var input = await SyDialog.prompt({ title: 'تعديل وقت «' + stageName + '»',
    message: 'اكتب الوقت بصيغة HH:MM (24 ساعة) — اتركه فارغاً للحذف.', value: currentDisplay, placeholder: '14:30' });
  if (input === null) return; // user cancelled

  var newIso = null;
  if (input.trim() !== '') {
    // يقبل 24 ساعة، ويقبل AM/PM (أو ص/م) لمن ينسخ الختمَ كما يظهر.
    var m = /^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/i.exec(input.trim());
    if (!m) { SyDialog.alert({ title: 'صيغة غير صحيحة', message: 'استخدم HH:MM — مثال: 14:30' }); return; }
    var hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (m[3]) {
      if (hh < 1 || hh > 12) { SyDialog.alert({ title: 'وقت غير صالح', message: 'الساعة خارج النطاق المسموح' }); return; }
      var _pm = /^(pm|م)$/i.test(m[3]);
      hh = (hh % 12) + (_pm ? 12 : 0);
    }
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      SyDialog.alert({ title: 'وقت غير صالح', message: 'الساعة خارج النطاق المسموح' }); return;
    }
    // Anchor to existing date portion if any, else the appointment's own date.
    var baseDate = appt[fieldKey]
      ? new Date(appt[fieldKey])
      : (appt.date ? new Date(appt.date + 'T00:00:00') : new Date());
    if (isNaN(baseDate.getTime())) baseDate = new Date();
    baseDate.setHours(hh, mm, 0, 0);
    newIso = baseDate.toISOString();
  }

  var patch = {}; patch[fieldKey] = newIso;
  var res = await window.sb.from('appointments').update(patch).eq('id', apptId);
  if (res.error) {
    if (isMissingTimeColumnError(res.error)) warnTimeTrackingMigrationOnce();
    else { console.error('overrideApptTime failed:', res.error); showToast('⚠️ تعذّر تعديل الوقت — أعد المحاولة'); }
    return;
  }
  appt[fieldKey] = newIso;
  render();
  showToast(newIso ? '✅ عُدّل وقت «' + stageName + '»' : '✅ حُذف ختم «' + stageName + '»');
}

// ─── Gap 8: Appointment Type templates (loader + picker handler) ─────────────
// Loaded once at page init, cached per page session. The picker is shown only
// when creating a new appointment (hidden in edit mode — see openModal /
// editAppt). Selecting a template pre-fills duration + treatment type;
// color stays derived from the treatment (single source of truth).
//
// Fault-tolerant: if the appointment_types table is missing (pre-migration),
// the picker simply stays empty and hidden — no crash, no toast spam.

var _appointmentTypes = [];   // cached templates for this session
var _gap8TableMissing = false;

function _gap8IsTableMissing(err) {
  if (!err) return false;
  var msg = (err.message || '') + ' ' + (err.code || '');
  return /42P01|PGRST205|relation .* does not exist|appointment_types/i.test(msg);
}

async function loadAppointmentTypes() {
  if (!currentUser) return;
  try {
    // Gap 8.2 / Migration 11 / Migration 12: select default_provider_id +
    // default_notes + default_operatory_id alongside the original fields. If
    // any of those columns don't exist yet (42703), retry with the legacy
    // projection so the picker still works on older installs.
    var fullCols = 'id, name, default_duration_min, default_treatment_id, default_provider_id, default_notes, default_operatory_id, is_active, sort_order';
    var legacyCols = 'id, name, default_duration_min, default_treatment_id, is_active, sort_order';
    var res = await window.sb.from('appointment_types')
      .select(fullCols)
      .eq('doctor_id', currentUser.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (res.error) {
      if (_gap8IsTableMissing(res.error)) {
        _gap8TableMissing = true;
        console.warn('Gap 8: appointment_types table missing — template picker disabled.');
        return;
      }
      // Gap 8.2 / Migration 11 fallback: retry with legacy projection
      var msg = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/42703|default_provider_id|default_lab_id|default_notes|default_operatory_id/i.test(msg)) {
        console.warn('Gap 8.2 / Migration 11: optional columns missing on SELECT — falling back to legacy columns.');
        res = await window.sb.from('appointment_types')
          .select(legacyCols)
          .eq('doctor_id', currentUser.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (res.error) { console.warn('Gap 8 retry failed:', res.error); return; }
      } else {
        console.warn('Gap 8 load error:', res.error);
        return;
      }
    }
    _appointmentTypes = res.data || [];
  } catch (e) {
    console.warn('Gap 8 load exception:', e);
  }
}

// Populates the <select> inside the modal. Idempotent — safe to call every
// Populates the picker. Phase 6 L: when the practice has ≤ 6 templates, we
// render colorful chips for one-tap selection (much friendlier on mobile +
// secretaries). For > 6 templates we fall back to the standard <select> to
// avoid an unbounded horizontal scroll. Idempotent — safe to call on every
// modal open.
function populateApptTypePicker() {
  var sel = document.getElementById('fApptTypePicker');
  if (!sel) return;
  // Always keep the <select> populated as the canonical source of truth —
  // chips dispatch into it via the existing onchange to reuse onApptTypePicked.
  var html = '<option value="">— بدون قالب —</option>';
  for (var i = 0; i < _appointmentTypes.length; i++) {
    var t = _appointmentTypes[i];
    html += '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name || '') + '</option>';
  }
  sel.innerHTML = html;
  sel.value = '';

  // Phase 6 L: chips mode for small template sets (≤ 6).
  var chipsEl = document.getElementById('fApptTypeChips');
  if (!chipsEl) return;
  var CHIPS_THRESHOLD = 6;
  if (_appointmentTypes.length === 0 || _appointmentTypes.length > CHIPS_THRESHOLD) {
    chipsEl.style.display = 'none';
    chipsEl.innerHTML = '';
    sel.style.display = '';
    return;
  }
  // Build chips. Each chip carries the template id; click sets the <select>
  // value (which fires onchange → onApptTypePicked) AND visually toggles the
  // active state. Color comes from the linked treatment if present.
  var chipsHtml = '';
  // "No template" reset chip — neutral styling.
  chipsHtml += '<button type="button" class="appt-type-chip" data-tid="" '
    + 'onclick="onApptTypeChipClick(this, \'\')" '
    + 'style="padding:7px 14px;border-radius:18px;border:1.5px solid var(--border);'
    + 'background:transparent;color:var(--text2);cursor:pointer;font-size:13px;'
    + 'font-family:inherit;transition:all 0.15s;">— بدون قالب —</button>';
  for (var j = 0; j < _appointmentTypes.length; j++) {
    var ct = _appointmentTypes[j];
    // Color: prefer the template-linked treatment's color, fall back to neutral.
    var chipColor = 'var(--blue)';   // v354: feeds --bc only (token fallback)
    if (ct.default_treatment_id && typeof TREATMENTS !== 'undefined') {
      for (var k = 0; k < TREATMENTS.length; k++) {
        if (TREATMENTS[k].dbId === ct.default_treatment_id) {
          chipColor = TREATMENTS[k].fill || TREATMENTS[k].color || chipColor;
          break;
        }
      }
    }
    var safeId = escapeHtml(ct.id);
    var safeName = escapeHtml(ct.name || '');
    var safeColor = escapeHtml(chipColor);
    chipsHtml += '<button type="button" class="appt-type-chip cbadge" data-tid="' + safeId + '" '
      + 'onclick="onApptTypeChipClick(this, \'' + safeId + '\')" '
      + 'style="--bc:' + safeColor + ';padding:7px 14px;border-radius:18px;border-width:1.5px;border-style:solid;'
      + 'cursor:pointer;font-size:13px;'
      + 'font-family:inherit;transition:all 0.15s;">' + safeName + '</button>';
  }
  chipsEl.innerHTML = chipsHtml;
  chipsEl.style.display = 'flex';
  // Hide the underlying <select> when chips are shown — chips are the UX,
  // <select> stays as the model. The user can still see the picked label
  // via the chip's active state.
  sel.style.display = 'none';
}

// Phase 6 L: chip click → set <select>.value programmatically + dispatch
// onchange so the existing onApptTypePicked pipeline runs unchanged. Also
// updates active styling so the user sees what they picked.
function onApptTypeChipClick(btn, tid) {
  var sel = document.getElementById('fApptTypePicker');
  if (!sel) return;
  sel.value = tid || '';
  // Reset all chips to inactive styling.
  var chipsEl = document.getElementById('fApptTypeChips');
  if (chipsEl) {
    var all = chipsEl.querySelectorAll('.appt-type-chip');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
  }
  // v354: the active fill comes from CSS (.appt-type-chip.is-active — the chip's own
  // --bc, or the neutral gray for "no template") instead of inline hex+alpha.
  if (btn) btn.classList.add('is-active');
  // Fire the existing pipeline.
  onApptTypePicked();
}

// Called from the picker's onchange. Pre-fills duration + treatment.
// We do NOT touch the color directly — it's driven by the treatment, and
// updateColorPreview() (called below) recomputes it from the selected
// treatment's own color. Single source of truth preserved.
function onApptTypePicked() {
  var sel = document.getElementById('fApptTypePicker');
  if (!sel) return;
  var id = sel.value;
  if (!id) {
    // User picked "— بدون قالب —". We don't touch the form fields
    // (duration/treatment/notes) — those keep user edits per the
    // "don't clobber" philosophy elsewhere in this function.
    return;
  }
  var t = _appointmentTypes.find(function(x){ return x.id === id; });
  if (!t) return;

  // Duration: only pre-fill if it matches one of the existing <option> values
  // in #fDuration. If the template specifies e.g. 45 and the select has
  // 30/45/60/90/120, pick 45. Otherwise leave the current value alone.
  if (t.default_duration_min) {
    var durSel = document.getElementById('fDuration');
    if (durSel) {
      var target = String(t.default_duration_min);
      var found = false;
      for (var i = 0; i < durSel.options.length; i++) {
        if (durSel.options[i].value === target) { found = true; break; }
      }
      if (found) {
        durSel.value = target;
      } else {
        // Add a one-off option so the template's exact duration is honored.
        var opt = document.createElement('option');
        opt.value = target;
        opt.textContent = target + ' دقيقة';
        durSel.appendChild(opt);
        durSel.value = target;
      }
    }
  }

  // Treatment: the template stores treatments.id (UUID), but TREATMENTS[].id
  // in this page is treatment_key for backward-compat. Match via dbId (the
  // UUID is exposed as 'dbId' in loadTreatmentsFromSupabase). If the linked
  // treatment was deleted after the template was created, the FK has been
  // NULLed, so we silently skip — duration alone still pre-fills.
  if (t.default_treatment_id) {
    var typeSel = document.getElementById('fType');
    if (typeSel) {
      var match = null;
      for (var j = 0; j < TREATMENTS.length; j++) {
        if (TREATMENTS[j].dbId === t.default_treatment_id) { match = TREATMENTS[j]; break; }
      }
      if (match) {
        typeSel.value = match.id;
        // Trigger the existing color preview update so color tracks the treatment.
        if (typeof updateColorPreview === 'function') updateColorPreview();
      }
    }
  }

  // Gap 8.2: Pre-fill the provider picker from the template's default_provider_id.
  // The picker is the existing #fProvider, populated by populateApptProviderPicker
  // (which uses the OpenDental 3-tier default). We set its value to the template's
  // provider — if that doctor was deleted, the picker silently keeps its current
  // default (no crash). The doctor can always change it after.
  // Phase 6 K: Track whether the template explicitly set a provider — if it
  // didn't, we let the operatory's default_provider_id fill in as a fallback
  // (priority decision: TEMPLATE provider > OPERATORY provider > 3-tier default).
  var templateSetProvider = false;
  if (t.default_provider_id) {
    var provPicker = document.getElementById('fProvider');
    if (provPicker) {
      // Verify the option exists before setting (deleted doctor → no option)
      var optExists = false;
      for (var k = 0; k < provPicker.options.length; k++) {
        if (provPicker.options[k].value === t.default_provider_id) { optExists = true; break; }
      }
      if (optExists) {
        provPicker.value = t.default_provider_id;
        templateSetProvider = true;
      }
    }
  }

  // Phase 6 K (Migration 12): Pre-fill the operatory picker from the
  // template's default_operatory_id. Same robustness pattern as provider:
  // verify the option exists; if it's there (active or ghost-restored
  // because we're in edit mode), set it.
  if (t.default_operatory_id) {
    var opPicker = document.getElementById('fOperatory');
    var opGroup = document.getElementById('fOperatoryGroup');
    if (opPicker && opGroup) {
      // The operatory picker might be hidden in Soft mode (no active
      // operatories) — but if the template explicitly links one, we should
      // surface it. Force the wrapper visible and ghost-restore if needed.
      var opExists = false;
      for (var kk = 0; kk < opPicker.options.length; kk++) {
        if (opPicker.options[kk].value === t.default_operatory_id) { opExists = true; break; }
      }
      // Always resolve the full record (active OR inactive) so the provider
      // fallback below works regardless of whether the option was already
      // in the picker. Critical bug fix: previously 'found' was only set
      // inside the !opExists branch, so active operatories silently skipped
      // the provider fallback.
      var found = null;
      for (var ll = 0; ll < OPERATORIES_ALL.length; ll++) {
        if (OPERATORIES_ALL[ll].id === t.default_operatory_id) { found = OPERATORIES_ALL[ll]; break; }
      }
      if (!opExists) {
        // Inject a ghost option so the value sticks and the user sees the name.
        // If missing entirely (deleted operatory), still inject a placeholder
        // so saving doesn't silently null out the FK.
        var ghost = document.createElement('option');
        ghost.value = t.default_operatory_id;
        ghost.textContent = found
          ? ((found.name || '[غرفة]') + (found.is_active ? '' : ' (غير نشطة)'))
          : '[غرفة محذوفة]';
        opPicker.appendChild(ghost);
      }
      opPicker.value = t.default_operatory_id;
      opGroup.style.display = 'block';

      // Provider fallback: if the template didn't set a provider, try the
      // operatory's default_provider_id (option A — template > operatory).
      if (!templateSetProvider && found && found.default_provider_id) {
        var prov2 = document.getElementById('fProvider');
        if (prov2) {
          var hasOpt = false;
          for (var mm = 0; mm < prov2.options.length; mm++) {
            if (prov2.options[mm].value === found.default_provider_id) { hasOpt = true; break; }
          }
          if (hasOpt) prov2.value = found.default_provider_id;
        }
      }
    }
  }

  // Migration 11 (Phase 6 L): pre-fill the appointment notes field from the
  // template's default_notes, BUT only if the user hasn't typed anything yet.
  // This honors the user's edits while still providing a smart default — the
  // same philosophy as duration/treatment above (don't clobber user input).
  // If default_notes is null/empty, we leave the existing value alone.
  if (t.default_notes) {
    var notesEl = document.getElementById('fNotes');
    if (notesEl && !notesEl.value.trim()) {
      notesEl.value = t.default_notes;
    }
  }
}

