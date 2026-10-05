/* ═══════════════════════════════════════════════════════════════
   pp-appt.js — مودال الموعد من ملف المريض + الإجراءات المخططة
   (تفكيك patient-profile — الاستخراج ١٢: 834 سطراً بايت-بايت)

   تعريفات صرفة + حالتان بقيم حرفية (_pendingAttachmentsPP ·
   _appProcModePP، استخدامهما محصور بهذا الموديول) — صفر تنفيذ
   top-level (درس v50). يُحمَّل قبل الكتلة الرئيسية التي تملك بقية
   الحالة المشتركة (editingApptId · upcomingAppts · providers ·
   sessions · allAppointmentsForTl) — الوصول runtime حصراً.

   ⚠️ صفر وصول لجداول المال (payments/payment_splits/adjustments) —
   الكتابة على appointments/sessions فقط. صفر مرايا محروسة.
   ═══════════════════════════════════════════════════════════════ */

/* ── Save Appointment ──
   Gap 7-aware: handles three workflows:
     1. Create scheduled appt   (editingApptId=null,  isPlanned=false)
     2. Create planned appt     (editingApptId=null,  isPlanned=true) — no date/time
     3. Edit/schedule planned   (editingApptId!=null, isPlanned=false) — promotes
        existing planned row into a real scheduled appointment
   Pre-migration fallback: if is_planned column or nullable date/time isn't
   applied yet, falls back to legacy behavior (today's date, 12:00) with a
   warning toast, mirroring the appointments.html pattern. */
var saveAppt = ppGuarded('saveAppt', _saveAppt_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _saveAppt_inner() {
  // Phase 4.1: defense-in-depth — block if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن إضافة مواعيد جديدة');
    return;
  }
  var typeVal    = document.getElementById('aType').value;
  var _t         = getTreatment(typeVal);
  var type       = _t ? _t.name : (typeVal === '_other' ? 'أخرى' : typeVal);
  var apptColor  = _t ? _t.fill   : '#0d8577';
  var apptStroke = _t ? _t.stroke : '#1fba7e';

  // Gap 7: planned mode toggles whether date/time are required
  var chk = document.getElementById('aIsPlanned');
  var isPlannedNow = !!(chk && chk.checked);

  var date  = document.getElementById('aDate').value;
  var time  = document.getElementById('aTime').value;
  var dur   = document.getElementById('aDur').value;
  var notes = document.getElementById('aNotes').value.trim();
  var statusEl = document.getElementById('aStatus');
  /* v534: خيارٌ غير مطابق كان يُحفظ «مؤكد» صامتاً (يؤكّد موعداً لم يؤكَّد) — المرجعُ حالته الأصلية */
  var apptStatus = (statusEl && statusEl.value) ? statusEl.value : ((statusEl && statusEl.dataset.orig) || 'confirmed');
  var provEl = document.getElementById('aProvider');
  var provId = (provEl && provEl.value) ? provEl.value : getDefaultProviderId(CLINIC_DOCTORS);

  // Gap 7: compute final date/time/notes by mode
  var finalDate, finalTime, finalNotes;
  if (isPlannedNow) {
    finalDate = null;
    finalTime = null;
    // Reason field is the planned note. If the user typed in notes too, append.
    var reasonVal = (document.getElementById('aReason').value || '').trim();
    finalNotes = [reasonVal, notes].filter(function(s){ return !!s; }).join(' — ');
  } else {
    if (!date) { showToast('⚠️ اختر التاريخ'); return; }
    finalDate  = date;
    finalTime  = time || null;
    finalNotes = notes;
  }

  var apptData = {
    doctor_id:    currentUser.id,
    patient_id:   patientId,
    patient_name: patient.name,
    date:         finalDate,
    time:         finalTime,
    duration:     parseInt(dur) || 30,
    type:         type,
    treatment_id: (_t && _t.dbId) ? _t.dbId : null,
    status:       apptStatus,
    color:        apptColor,
    stroke:       apptStroke,
    notes:        finalNotes,
    provider_id:  provId,
    is_planned:   isPlannedNow
  };

  // Gap 7: detect "is_planned column missing / NOT NULL on date|time" errors
  // so we can transparently fall back to a legacy insert.
  // Phase 6 M (Obs E): delegates to the shared SyDentAppt namespace
  // (supabase-init.js). Local fallback definitions kept for robustness
  // in case supabase-init.js failed to load — same byte-for-byte logic.
  function isPlannedMigrationMissing(err) {
    if (window.SyDentAppt && window.SyDentAppt.isPlannedMigrationMissing) {
      return window.SyDentAppt.isPlannedMigrationMissing(err);
    }
    if (!err) return false;
    var emsg = (err.message || '').toLowerCase();
    var code = err.code || '';
    var isPlannedCol = emsg.indexOf('is_planned') !== -1;
    var notNullDate  = /violates not-null constraint.*"(date|time)"/i.test(err.message || '');
    var schedHasDate = emsg.indexOf('scheduled_has_date') !== -1;
    if (isPlannedCol && (code === '42703' || code === 'PGRST204' || emsg.indexOf('does not exist') !== -1 || emsg.indexOf('schema cache') !== -1)) return true;
    if (notNullDate || schedHasDate) return true;
    return false;
  }
  function buildLegacyRow(src) {
    if (window.SyDentAppt && window.SyDentAppt.buildLegacyRow) {
      return window.SyDentAppt.buildLegacyRow(src);
    }
    var row = Object.assign({}, src);
    delete row.is_planned;
    if (row.date === null) row.date = toDay();
    if (row.time === null) row.time = '12:00';
    return row;
  }

  /* v495: حارسُ التعارض عند الحفظ (SyDentConflict — appt-conflict.js): نفسُ الحارس بصفحة
     المواعيد؛ نافذةُ الملف لا تختار كرسياً فالموردُ المفحوص هو الطبيب وحده. */
  if (!isPlannedNow && window.SyDentConflict) {
    var _cfOk = await window.SyDentConflict.confirm(
      { id: editingApptId || null, date: finalDate, time: finalTime, duration: apptData.duration,
        provider_id: provId, operatory_id: null },
      { doctorId: currentUser.id, names: { provider: function (id) {
          var d = (CLINIC_DOCTORS || []).find(function (x) { return x.id === id; }); return d ? d.name : null; } } });
    if (!_cfOk) return;
  }

  var migrationMissing = false;
  var savedRow = null;

  if (editingApptId) {
    // v335: دفاعٌ بالعمق — موعدٌ يحمل أختامَ حضور (زيارةٌ صارت بيومها) لا يُعاد
    // جدولتُه ليومٍ آخر. مصدرُه الوحيد مودالُ المواعيد وقد قُفل هناك؛ هذا يمنع
    // أي صفٍّ قديم من أن يعبر من هنا.
    var _ppPrev = (plannedAppts || []).find(function(p){ return p.id === editingApptId; });
    if (_ppPrev && (_ppPrev.arrived_at || _ppPrev.seated_at || _ppPrev.dismissed_at)) {
      showToast('🔒 هذا الموعد سُجّل فيه حضور — احجز موعداً جديداً بدل إعادة جدولته');
      return;
    }
    // UPDATE path — used when editing/scheduling an existing planned appt.
    var upd = await window.sb.from('appointments').update(apptData)
      .eq('id', editingApptId).eq('doctor_id', currentUser.id)
      .select().single();
    if (upd.error && isPlannedMigrationMissing(upd.error)) {
      migrationMissing = true;
      console.warn('Gap 7: planned migration not applied — falling back. Migration SQL: ALTER TABLE appointments ADD COLUMN is_planned BOOLEAN NOT NULL DEFAULT FALSE; ALTER TABLE appointments ALTER COLUMN date DROP NOT NULL; ALTER TABLE appointments ALTER COLUMN time DROP NOT NULL;');
      upd = await window.sb.from('appointments').update(buildLegacyRow(apptData))
        .eq('id', editingApptId).eq('doctor_id', currentUser.id)
        .select().single();
    }
    if (upd.error) { showToast('❌ خطأ في حفظ الموعد: ' + upd.error.message); return; }
    savedRow = upd.data;
  } else {
    var ins = await window.sb.from('appointments').insert(apptData).select().single();
    if (ins.error && isPlannedMigrationMissing(ins.error)) {
      migrationMissing = true;
      console.warn('Gap 7: planned migration not applied (INSERT) — falling back.');
      ins = await window.sb.from('appointments').insert(buildLegacyRow(apptData)).select().single();
    }
    if (ins.error) { showToast('❌ خطأ في حفظ الموعد: ' + ins.error.message); return; }
    savedRow = ins.data;
  }

  // Update local lists so UI is consistent without a full reload.
  // - Planned row: append to plannedAppts
  // - Scheduled row (today or later): append to upcomingAppts
  // - Edit case: replace existing entry in whichever list it belonged to
  if (savedRow) {
    // Strip from both lists first (in case the row moved between lists)
    plannedAppts  = plannedAppts.filter(function(p){ return p.id !== savedRow.id; });
    upcomingAppts = upcomingAppts.filter(function(u){ return u.id !== savedRow.id; });

    if (savedRow.is_planned === true && !migrationMissing) {
      plannedAppts.unshift(savedRow);
    } else if (savedRow.date && savedRow.date >= toDay()) {
      upcomingAppts.push({
        id: savedRow.id, date: savedRow.date, time: savedRow.time,
        type: savedRow.type, status: savedRow.status
      });
      upcomingAppts.sort(function(a,b){
        return (a.date + (a.time||'')).localeCompare(b.date + (b.time||''));
      });
    }
  }

  closeModal('apptModal');
  document.getElementById('aNotes').value = '';
  document.getElementById('aReason').value = '';
  if (chk) chk.checked = false;
  // Capture intent BEFORE clearing editingApptId so the toast branch is correct.
  var wasEditing  = (editingApptId !== null);
  editingApptId = null;

  renderPlannedAppts();

  // Phase 2B-A: timeline reflects the new/edited appointment.
  // Reload from DB (cheaper than mirror-updating two arrays) and re-render.
  try { await loadAllAppointmentsForTimeline(); renderTimeline(); }
  catch(e) { console.warn('timeline refresh after saveAppt:', e); }

  // Workflow B: commit any pending procedure attachments now that the appt
  // row exists in DB. Only meaningful for brand-new saves (edit already
  // wrote each attach/unlink live to DB).
  // Build the toast based on three signals:
  //   • appointment save outcome
  //   • migrationMissing flag
  //   • attachment ok/failed counts (only relevant when we attempted commit)
  var attachResult = null;
  /* v410 (زيارات الخطة): الموعدُ المخطّط بلا تاريخ صار يحمل بنوده — «زيارة غير
     مجدولة». الربطُ عرضيٌّ/جدوليٌّ بحت (appointment_id، FK بـON DELETE SET NULL). */
  if (!wasEditing && savedRow && savedRow.id && typeof commitPendingAttachmentsPP === 'function') {
    attachResult = await commitPendingAttachmentsPP(savedRow.id);
    clearPendingPP();
  } else {
    // Even if we didn't commit, clear the pending buffer so the next
    // openApptModal starts clean. clearPendingPP is a no-op on an empty list.
    if (typeof clearPendingPP === 'function') clearPendingPP();
  }

  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}   /* v410: شريط الزيارات + شارة الزيارة */

  if (migrationMissing) {
    showToast('⚠️ تم الحفظ كموعد عادي — يلزم ترقية قاعدة البيانات لميزة "مخطّط"');
  } else if (isPlannedNow) {
    // wasEditing distinguishes "edited a planned" from "created a planned"
    if (!wasEditing && attachResult && attachResult.failed > 0) {
      showToast('⚠️ حُفظت الزيارة المخطّطة — رُبط ' + attachResult.ok + ' علاج، تعذّر ربط ' + attachResult.failed);
      console.warn('Workflow B attachment errors (planned):', attachResult.errors);
    } else if (!wasEditing && attachResult && attachResult.ok > 0) {
      showToast('✅ حُفظت زيارة غير مجدولة + ربط ' + attachResult.ok + ' علاج');
    } else {
      showToast(wasEditing ? '✅ تم حفظ التعديلات' : '✅ تم حفظ الموعد المخطّط');
    }
  } else if (wasEditing) {
    // Came in via quickSchedulePlannedFromProfile or editPlannedFromProfile,
    // then unchecked the planned flag → user just scheduled a planned appt.
    showToast('✅ تم جدولة الموعد المخطّط');
  } else if (attachResult && (attachResult.ok > 0 || attachResult.failed > 0)) {
    // Brand-new save WITH attachments — give an explicit success/failure summary.
    if (attachResult.failed === 0) {
      showToast('✅ تم حفظ الموعد + ربط ' + attachResult.ok + ' علاج');
    } else if (attachResult.ok === 0) {
      showToast('⚠️ تم حفظ الموعد لكن تعذّر ربط أي علاج (' + attachResult.failed + ' فشل) — راجع التحذيرات');
      console.warn('Workflow B attachment errors:', attachResult.errors);
    } else {
      showToast('⚠️ تم حفظ الموعد — رُبط ' + attachResult.ok + ' علاج، تعذّر ربط ' + attachResult.failed);
      console.warn('Workflow B partial attachment errors:', attachResult.errors);
    }
  } else {
    showToast('✅ تم حفظ الموعد في التقويم');
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Workflow B — "علاجات هذا الموعد" section inside the apptModal.

   Three modes managed by setApptProcSectionMode(mode):

     • 'create'  — Brand-new appointment, no DB row exists yet. The picker
                   adds planned sessions to a local _pendingAttachmentsPP[]
                   array. The list shows pending items with ✕ remove buttons.
                   No DB writes happen until the user clicks "حفظ الموعد".
                   saveAppt() then runs INSERT + a UPDATE for each pending
                   session. Best-effort atomicity: appointment is always
                   saved; per-session UPDATE failures are reported in the
                   toast and console, but do not block the save.

     • 'active'  — Appointment exists in DB (edit / quickSchedule paths).
                   Picker and "add" trigger live DB writes via
                   attachPlannedToApptPP / unlinkSessionFromApptPP. The list
                   reads from the page-scoped `sessions` array.

     • 'hidden'  — Legacy (pre-v410). Planned appointments now carry their
                   procedures too («زيارة غير مجدولة»), so no entry point
                   requests this mode anymore; kept as the safe initial state.

   This file deliberately uses minimal patient-scoped helpers instead of
   importing the appointments.html versions, because the data this page
   already needs (`sessions` array filtered to one patient) is enough.
   No new caches.
   ───────────────────────────────────────────────────────────────────────── */

// Local pending-attachments buffer for create mode. Cleared when the modal
// closes OR when openApptModal is called fresh. Each entry is the session
// row (id + display fields), captured at the moment of "add" so the picker
// can be re-rendered without losing pending items.
var _pendingAttachmentsPP = [];

// Current mode of the section. Read by the click handler to route correctly.
var _appProcModePP = 'hidden';

/* Switch the procedures section between modes. */
function setApptProcSectionMode(mode) {
  // mode: 'create' | 'active' | 'hidden'
  _appProcModePP = mode;
  var sec   = document.getElementById('appProcSectionPP');
  var hint  = document.getElementById('appProcModeHintPP');
  var stats = document.getElementById('appProcStatsPP');
  var btn   = document.getElementById('appAddPlannedBtnPP');
  if (!sec) return;
  if (mode === 'hidden') {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  if (hint) {
    if (mode === 'create') {
      hint.style.display = 'block';
      hint.textContent   = 'ⓘ اختر العلاجات المخطّطة لربطها بالموعد. الربط يحدث تلقائياً عند الضغط على "حفظ الموعد".';
    } else {
      hint.style.display = 'none';
    }
  }
  if (btn) btn.textContent = (mode === 'create') ? '➕ إضافة' : '➕ ربط بالموعد';
  // Re-render to reflect the current mode. In create mode this paints
  // pending items; in active mode it paints attached sessions.
  renderApptProcedureListPP();
}

/* Build the picker options. Filters planned sessions where appointment_id
   IS NULL AND the session id is not already in _pendingAttachmentsPP
   (create mode only — we don't want to offer the same session twice).
   In active mode the filter is just "appointment_id IS NULL" because
   the picker only ever offers unattached sessions to begin with. */
/* v412: بندٌ مخطّط موسومٌ بخيار خطةٍ لم يُعتمد بعد (plan_option 1..3). */
function ppSessIsAltOption(s) { return !!(s && s.plan_option >= 1 && s.plan_option <= 3); }
function populateAddPlannedSelectPP() {
  var selEl = document.getElementById('appAddPlannedSelectPP');
  var addBtn = document.getElementById('appAddPlannedBtnPP');
  if (!selEl) return;
  selEl.innerHTML = '';

  /* v415: «حرّ» = غير مربوط أو مربوط بموعدٍ لم يعد يحمله (planSessIsFree — pp-plan.js). */
  var unattached = (sessions || []).filter(function(s){
    return (typeof planSessIsFree === 'function') ? planSessIsFree(s) : (s.status === 'planned' && !s.appointment_id);
  }).filter(function(s){ return s.appointment_id !== editingApptId || !editingApptId; });
  /* v412: «لا يُجدوَل إلا المعتمد» — بنودُ الخيارات غير المعتمدة (M145) تخرج من المنتقي
     ويُشرح السبب بسطرٍ معطَّل (Dentrix: Accept ثم Schedule · Open Dental: المجدوَل
     دائماً بالخطة الفعّالة). */
  var _altN = unattached.filter(ppSessIsAltOption).length;
  unattached = unattached.filter(function(s){ return !ppSessIsAltOption(s); });
  var _altHint = function(){
    if (!_altN) return;
    var oA = document.createElement('option');
    oA.value = ''; oA.disabled = true;
    oA.textContent = '🔀 ' + _altN + ' بند بخيارات غير معتمدة — اعتمد الخيار من «خيارات الخطة» أولاً';
    selEl.appendChild(oA);
  };
  if (_appProcModePP === 'create') {
    // Drop sessions already in the pending list so the user can't double-add.
    var pendingIds = {};
    _pendingAttachmentsPP.forEach(function(p){ pendingIds[p.id] = true; });
    unattached = unattached.filter(function(s){ return !pendingIds[s.id]; });
  }
  if (!unattached.length) {
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— لا توجد علاجات مخطّطة متاحة للربط —';
    selEl.appendChild(opt0);
    _altHint();
    if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
    return;
  }
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— اختر علاجاً مخطّطاً —';
  selEl.appendChild(placeholder);
  unattached.forEach(function(s){
    var toothPart;
    if (s.tooth_num) {
      toothPart = ' (سن ' + s.tooth_num + ')';
    } else if (s.quadrant) {
      var QLBL2 = {'UR':'الربع العلوي الأيمن','UL':'الربع العلوي الأيسر','LL':'الربع السفلي الأيسر','LR':'الربع السفلي الأيمن'};
      toothPart = ' (' + (QLBL2[s.quadrant] || s.quadrant) + ')';
    } else if (s.arch) {
      var ALBL2 = {'U':'الفك العلوي','L':'الفك السفلي'};
      toothPart = ' (' + (ALBL2[s.arch] || s.arch) + ')';
    } else {
      toothPart = '';
    }
    var costStr2 = (typeof fmt === 'function') ? fmt(s.cost) : String(s.cost || 0);
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = (s.type || s.description || 'علاج') + toothPart + ' — ' + costStr2 + ' ' + curLblOf(s.currency);
    selEl.appendChild(opt);
  });
  _altHint();
  if (addBtn) { addBtn.disabled = false; addBtn.style.opacity = '1'; }
}

/* Render the list area. Routes by mode:
     create  → renders _pendingAttachmentsPP with ✕ remove (local-only).
     active  → renders attached sessions (s.appointment_id === editingApptId)
               with ✕ unlink (DB write).
   Stats summarize count and total cost in both modes. */
function renderApptProcedureListPP() {
  var listEl  = document.getElementById('appProcListPP');
  var statsEl = document.getElementById('appProcStatsPP');
  if (!listEl) return;

  if (_appProcModePP === 'create') {
    var items = _pendingAttachmentsPP;
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:8px;color:var(--text2);font-size:12px;text-align:center;opacity:0.7;">لم تُضف علاجات بعد — اختر من القائمة أدناه واضغط "إضافة"</div>';
      if (statsEl) statsEl.textContent = '';
    } else {
      var html = '';
      items.forEach(function(s){
        var toothPart = '';
        if (s.tooth_num) {
          toothPart = ' • السن ' + escapeHtml(String(s.tooth_num)) + (s.surface && s.surface !== 'WHOLE' ? '/' + escapeHtml(s.surface) : '');
        } else if (s.quadrant) {
          var QLBL = {'UR':'الربع العلوي الأيمن','UL':'الربع العلوي الأيسر','LL':'الربع السفلي الأيسر','LR':'الربع السفلي الأيمن'};
          toothPart = ' • ' + (QLBL[s.quadrant] || escapeHtml(s.quadrant));
        } else if (s.arch) {
          var ALBL = {'U':'الفك العلوي','L':'الفك السفلي'};
          toothPart = ' • ' + (ALBL[s.arch] || escapeHtml(s.arch));
        }
        var costStr = (typeof fmt === 'function') ? fmt(s.cost) : String(s.cost || 0);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(var(--green-rgb),0.05);border-radius:8px;border:1px solid rgba(var(--green-rgb),0.2);flex-wrap:wrap;">'
          + '<div style="flex:1;min-width:140px;font-size:13px;color:var(--text);">' + escapeHtml(s.type || s.description || 'علاج') + toothPart + '</div>'
          + '<div style="font-size:12px;color:var(--text2);">' + costStr + ' ' + curLblOf(s.currency) + '</div>'
          + '<span class="cbadge tone tone-orange" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">سيُربط</span>'
          + '<button type="button" onclick="removePendingPP(\'' + s.id + '\')" style="background:transparent;border:1px solid rgba(var(--red-rgb),0.4);color:var(--red);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px;" title="إزالة من القائمة">✕</button>'
          + '</div>';
      });
      listEl.innerHTML = html;
      var totalC = SyDentCurBag.make();
      items.forEach(function(x){ totalC[_rowCur(x)] += parseFloat(x.cost) || 0; });
      var _F = (typeof fmt === 'function') ? fmt : String;
      if (statsEl) statsEl.textContent = items.length + ' علاج سيُربط • ' + SyDentCurBag.text(totalC, _F);
    }
    populateAddPlannedSelectPP();
    return;
  }

  // 'active' mode — render attached sessions for editingApptId.
  if (!editingApptId) {
    listEl.innerHTML = '';
    if (statsEl) statsEl.textContent = '';
    populateAddPlannedSelectPP();
    return;
  }
  var attached = (sessions || []).filter(function(s){ return s.appointment_id === editingApptId; });
  if (attached.length) {
    var html2 = '';
    attached.forEach(function(s){
      var statusBadge;
      if (s.status === 'planned') {
        statusBadge = '<span class="cbadge tone tone-red" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">مخطّط</span>';
      } else if (s.status === 'completed') {
        statusBadge = '<span class="cbadge tone tone-blue" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">منجز</span>';
      } else {
        statusBadge = '<span style="background:rgba(255,255,255,0.06);color:var(--text2);padding:2px 8px;border-radius:10px;font-size:11px;">' + escapeHtml(s.status || '—') + '</span>';
      }
      var toothPart2 = '';
      if (s.tooth_num) {
        toothPart2 = ' • السن ' + escapeHtml(String(s.tooth_num)) + (s.surface && s.surface !== 'WHOLE' ? '/' + escapeHtml(s.surface) : '');
      } else if (s.quadrant) {
        var QLBL2 = {'UR':'الربع العلوي الأيمن','UL':'الربع العلوي الأيسر','LL':'الربع السفلي الأيسر','LR':'الربع السفلي الأيمن'};
        toothPart2 = ' • ' + (QLBL2[s.quadrant] || escapeHtml(s.quadrant));
      } else if (s.arch) {
        var ALBL2 = {'U':'الفك العلوي','L':'الفك السفلي'};
        toothPart2 = ' • ' + (ALBL2[s.arch] || escapeHtml(s.arch));
      }
      var costStr2 = (typeof fmt === 'function') ? fmt(s.cost) : String(s.cost || 0);
      html2 += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:140px;font-size:13px;color:var(--text);">' + escapeHtml(s.type || s.description || 'علاج') + toothPart2 + '</div>'
        + '<div style="font-size:12px;color:var(--text2);">' + costStr2 + ' ' + curLblOf(s.currency) + '</div>'
        + statusBadge
        + '<button type="button" onclick="unlinkSessionFromApptPP(\'' + s.id + '\')" style="background:transparent;border:1px solid rgba(var(--red-rgb),0.4);color:var(--red);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px;" title="فصل عن الموعد">✕</button>'
        + '</div>';
    });
    listEl.innerHTML = html2;
    var totalC2 = SyDentCurBag.make();
    attached.forEach(function(x){ totalC2[_rowCur(x)] += parseFloat(x.cost) || 0; });
    var plannedC   = attached.filter(function(x){ return x.status === 'planned'; }).length;
    var completedC = attached.filter(function(x){ return x.status === 'completed'; }).length;
    var _F2 = (typeof fmt === 'function') ? fmt : String;
    if (statsEl) statsEl.textContent = attached.length + ' علاج • ' + SyDentCurBag.text(totalC2, _F2) + ' • مخطّط ' + plannedC + ' / منجز ' + completedC;
  } else {
    listEl.innerHTML = '<div style="padding:8px;color:var(--text2);font-size:12px;text-align:center;">لا توجد علاجات مرتبطة بهذا الموعد بعد</div>';
    if (statsEl) statsEl.textContent = '';
  }
  populateAddPlannedSelectPP();
}

/* Unified add-button click handler. Routes by mode. */
function onAddPlannedClickPP() {
  if (_appProcModePP === 'create') {
    addToPendingPP();
  } else if (_appProcModePP === 'active') {
    attachPlannedToApptPP();
  }
  // 'hidden' shouldn't ever reach this handler; defensive no-op.
}

/* Create-mode add: capture the selected session into the pending buffer
   and re-render. No DB write. */
function addToPendingPP() {
  var sel = document.getElementById('appAddPlannedSelectPP');
  var sessId = sel ? sel.value : '';
  if (!sessId) { showToast('⚠️ اختر علاجاً'); return; }
  // Pull the full session row from the page-scoped `sessions` array so we
  // have everything we need to render the row without an extra fetch.
  var row = (sessions || []).find(function(x){ return x.id === sessId; });
  if (!row) { showToast('⚠️ العلاج غير موجود — أعد تحميل الصفحة'); return; }
  // Defensive: only allow planned + unattached. The picker already filters
  // these, but a stale picker could let an attached row through.
  if (!((typeof planSessIsFree === 'function') ? planSessIsFree(row) : (row.status === 'planned' && !row.appointment_id))) {
    showToast('⚠️ هذا العلاج غير متاح للربط');
    return;
  }
  if (ppSessIsAltOption(row)) { showToast('🔀 هذا البند من خيار غير معتمد — اعتمد الخيار أولاً'); return; }   /* v412 */
  // Dedupe — should be impossible via the picker (which excludes pending
  // ids) but defensive against double-click race.
  for (var i = 0; i < _pendingAttachmentsPP.length; i++) {
    if (_pendingAttachmentsPP[i].id === sessId) return;
  }
  _pendingAttachmentsPP.push(row);
  renderApptProcedureListPP();
}

/* Create-mode remove: drop from the local buffer. */
function removePendingPP(sessId) {
  _pendingAttachmentsPP = _pendingAttachmentsPP.filter(function(p){ return p.id !== sessId; });
  renderApptProcedureListPP();
}

/* Reset the create-mode buffer. Called when the modal closes or opens fresh. */
function clearPendingPP() {
  _pendingAttachmentsPP = [];
}

/* Commit pending attachments AFTER a successful INSERT in saveAppt.
   Returns { ok: number, failed: number, errors: [...] }.
   Best-effort: every session is attempted; failures don't abort the rest. */
async function commitPendingAttachmentsPP(apptId) {
  var result = { ok: 0, failed: 0, errors: [] };
  if (!apptId || !_pendingAttachmentsPP.length) return result;
  // Phase 4.1: defense-in-depth — block if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    result.failed = _pendingAttachmentsPP.length;
    result.errors.push('حسابك غير نشط — لم تُربط العلاجات');
    return result;
  }
  // Iterate sequentially. We could Promise.all this for speed, but
  // sequential keeps the error reporting clean and avoids hammering RLS
  // with N parallel UPDATEs when N is small (usually 1-3).
  for (var i = 0; i < _pendingAttachmentsPP.length; i++) {
    var p = _pendingAttachmentsPP[i];
    try {
      const { error } = await window.sb.from('ledger_sessions')
        .update({ appointment_id: apptId })
        .eq('id', p.id).eq('doctor_id', currentUser.id);
      if (error) {
        result.failed++;
        result.errors.push((p.type || 'علاج') + ': ' + error.message);
        console.warn('commitPendingAttachmentsPP: session', p.id, 'failed:', error);
      } else {
        result.ok++;
        // Mirror locally so the page's `sessions` array reflects the DB.
        var local = (sessions || []).find(function(x){ return x.id === p.id; });
        if (local) local.appointment_id = apptId;
        // Phase 5 audit trail — same shape as the live attach in active mode.
        if (window.logAudit) {
          try {
            window.logAudit('session.edit', {
              entityId: p.id,
              patientId: patientId,
              patientName: (patient && patient.name) || '',
              description: 'ربط علاج مخطّط بموعد جديد (Workflow B)',
              oldValue: { appointment_id: null },
              newValue: { appointment_id: apptId }
            });
          } catch (e) { console.warn('commitPendingAttachmentsPP: audit failed:', e); }
        }
      }
    } catch (e) {
      result.failed++;
      result.errors.push((p.type || 'علاج') + ': استثناء');
      console.warn('commitPendingAttachmentsPP: session', p.id, 'threw:', e);
    }
  }
  return result;
}

/* Active-mode attach (existing appointment, live DB write).
   Unchanged from the previous Workflow A implementation. */
var attachPlannedToApptPP = ppGuarded('attachPlannedToApptPP', _attachPlannedToApptPP_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _attachPlannedToApptPP_inner() {
  if (!editingApptId) { showToast('⚠️ احفظ الموعد أولاً'); return; }
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن ربط العلاجات');
    return;
  }
  var sel = document.getElementById('appAddPlannedSelectPP');
  var sessId = sel ? sel.value : '';
  if (!sessId) { showToast('⚠️ اختر علاجاً'); return; }
  var _rowAtt = (sessions || []).find(function(x){ return x.id === sessId; });
  if (ppSessIsAltOption(_rowAtt)) { showToast('🔀 هذا البند من خيار غير معتمد — اعتمد الخيار أولاً'); return; }   /* v412 */
  const { error } = await window.sb.from('ledger_sessions')
    .update({ appointment_id: editingApptId })
    .eq('id', sessId).eq('doctor_id', currentUser.id);
  if (error) { showToast('❌ خطأ في الربط: ' + error.message); return; }
  var local = (sessions || []).find(function(x){ return x.id === sessId; });
  if (local) local.appointment_id = editingApptId;
  showToast('✅ تم ربط العلاج بالموعد');
  renderApptProcedureListPP();
  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}   /* v410 */
  if (window.logAudit) {
    try {
      window.logAudit('session.edit', {
        entityId: sessId,
        patientId: patientId,
        patientName: (patient && patient.name) || '',
        description: 'ربط علاج مخطّط بموعد من ملف المريض',
        oldValue: { appointment_id: null },
        newValue: { appointment_id: editingApptId }
      });
    } catch (e) { console.warn('attachPlannedToApptPP: audit failed:', e); }
  }
}

/* Unlink (active mode). Same DB semantics as before. */
var unlinkSessionFromApptPP = ppGuarded('unlinkSessionFromApptPP', _unlinkSessionFromApptPP_inner, '⏳');   /* v284: قفل + انشغال */
async function _unlinkSessionFromApptPP_inner(sessId) {
  if (!sessId) return;
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن فصل العلاجات');
    return;
  }
  if (!await SyDialog.confirm({ message: 'فصل هذا العلاج عن الموعد؟ (لن يُحذف العلاج نفسه)', danger: true })) return;
  const { error } = await window.sb.from('ledger_sessions')
    .update({ appointment_id: null })
    .eq('id', sessId).eq('doctor_id', currentUser.id);
  if (error) { showToast('❌ خطأ في الفصل: ' + error.message); return; }
  var local = (sessions || []).find(function(x){ return x.id === sessId; });
  if (local) local.appointment_id = null;
  showToast('✅ تم فصل العلاج عن الموعد');
  if (editingApptId) renderApptProcedureListPP();
  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}   /* v410 */
  if (window.logAudit) {
    try {
      window.logAudit('session.edit', {
        entityId: sessId,
        patientId: patientId,
        patientName: (patient && patient.name) || '',
        description: 'فصل علاج عن موعد من ملف المريض',
        oldValue: { appointment_id: editingApptId },
        newValue: { appointment_id: null }
      });
    } catch (e) { console.warn('unlinkSessionFromApptPP: audit failed:', e); }
  }
}

/* ─── Gap 7: Planned-appointments UI in patient profile ───────────────────── */

/* Render the planned-appointments card. Hides the entire card when there are
   no planned rows so the file tab stays clean for typical patients. */
function renderPlannedAppts() {
  var card = document.getElementById('plannedApptsCard');
  var list = document.getElementById('plannedApptsList');
  var cnt  = document.getElementById('plannedApptsCount');
  if (!card || !list) return;
  var planned = (plannedAppts || []).filter(function(p){ return p.is_planned === true; });
  if (cnt) cnt.textContent = '(' + planned.length + ')';
  if (planned.length === 0) {
    card.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  card.style.display = '';
  var html = '';
  for (var i = 0; i < planned.length; i++) {
    var p = planned[i];
    var typeStr = p.type ? ('🦷 ' + escapeHtml(p.type)) : '';
    var noteStr = (p.notes || '').trim();
    var reasonLine = [typeStr, escapeHtml(noteStr)].filter(function(s){ return !!s; }).join(' — ');
    html += '<div class="planned-pp-row">'
      + '<div class="planned-pp-icon">📋</div>'
      + '<div class="planned-pp-info">'
      +   '<div class="planned-pp-title">موعد مخطّط</div>'
      +   '<div class="planned-pp-reason" title="' + reasonLine + '">' // reasonLine pre-escaped upstream (escapeHtml on type & notes) - dead manual replace removed per Rule #195, mirrors 838d1b7
      +     (reasonLine || '<span style="opacity:.5;">بدون تفاصيل</span>')
      +   '</div>'
      + '</div>'
      + '<div class="planned-pp-actions sy-acts">'
      +   '<button class="sy-act sy-act-primary" onclick="quickSchedulePlannedFromProfile(\'' + p.id + '\')">📅 جدولة الآن</button>'
      +   '<button class="sy-act" onclick="editPlannedFromProfile(\'' + p.id + '\')">✏️ تعديل</button>'
      +   '<button class="sy-act sy-act-danger" onclick="deletePlannedFromProfile(\'' + p.id + '\')">🗑️ حذف</button>'
      + '</div>'
      + '</div>';
  }
  list.innerHTML = html;
}

/* Open the appointment modal pre-filled to create a planned (no-date) appt. */
function openPlannedApptModal() {
  editingApptId = null;
  // Reset modal to fresh state for create-planned
  populateApptTypes();
  document.getElementById('aDate').value = toDay();   // dummy default; hidden
  document.getElementById('aTime').value = '09:00';
  document.getElementById('aStatus').value = 'confirmed';
  document.getElementById('aReason').value = '';
  document.getElementById('aNotes').value  = '';
  // Title + checkbox
  var t = document.getElementById('apptModalTitle');
  if (t) t.textContent = '📋 موعد مخطّط جديد';
  var saveBtn = document.getElementById('aSaveBtn');
  if (saveBtn) saveBtn.textContent = 'حفظ المخطّط';
  var chk = document.getElementById('aIsPlanned');
  if (chk) { chk.checked = true; }
  // Provider picker (reuse openApptModal's logic by inlining the same setup)
  setupApptProviderPicker(null);
  onApptPlannedToggle();   // sync field visibility
  if (typeof ppApptCtxNote === 'function') ppApptCtxNote();
  openModal('apptModal');
}

/* Edit an existing planned appointment — opens modal pre-filled. */
function editPlannedFromProfile(id) {
  var p = (plannedAppts || []).find(function(x){ return x.id === id; });
  if (!p) { showToast('⚠️ الموعد غير موجود'); return; }
  editingApptId = id;
  // Pre-fill type by name → option id (treatments dropdown uses treatment_key as value)
  var _foundT = null;
  for (var i = 0; i < TREATMENTS.length; i++) if (TREATMENTS[i].name === p.type) { _foundT = TREATMENTS[i]; break; }
  populateApptTypes(_foundT ? _foundT.id : null);   /* v336: يبقى الاختيار بعد البناء */
  if (_foundT) document.getElementById('aType').value = _foundT.id;
  if (typeof ppApptCtxNote === 'function') ppApptCtxNote(false);
  document.getElementById('aDur').value = String(p.duration || 60);
  document.getElementById('aDate').value = toDay();   // hidden while planned
  document.getElementById('aTime').value = '09:00';
  // Map legacy 'broken' to 'no_show' (Phase 2C reverted — dropdown no longer offers broken).
  var _statusForUi1 = (p.status === 'broken') ? 'no_show' : (p.status || 'confirmed');
  document.getElementById('aStatus').value = _statusForUi1;
  document.getElementById('aStatus').dataset.orig = _statusForUi1;
  document.getElementById('aReason').value = p.notes || '';
  document.getElementById('aNotes').value  = '';
  var t = document.getElementById('apptModalTitle');
  if (t) t.textContent = '📋 تعديل موعد مخطّط';
  var saveBtn = document.getElementById('aSaveBtn');
  if (saveBtn) saveBtn.textContent = 'حفظ التعديلات';
  var chk = document.getElementById('aIsPlanned');
  if (chk) { chk.checked = true; }
  setupApptProviderPicker(p.provider_id || null);
  onApptPlannedToggle();
  // v410 (زيارات الخطة): الموعد المخطّط = «زيارة غير مجدولة» تحمل بنودها —
  // القسم بوضع 'active' (ربط/فكّ حيّ) كما بمسار الجدولة. يُفرَّغ مخزن الإنشاء.
  if (typeof clearPendingPP === 'function') clearPendingPP();
  if (typeof setApptProcSectionMode === 'function') setApptProcSectionMode('active');
  openModal('apptModal');
}

/* Quick-schedule from the planned list: opens the modal in "scheduling" mode —
   the planned flag is off, date/time visible, ready for the user to set them. */
function quickSchedulePlannedFromProfile(id) {
  var p = (plannedAppts || []).find(function(x){ return x.id === id; });
  if (!p) { showToast('⚠️ الموعد غير موجود'); return; }
  editingApptId = id;
  var _foundT = null;
  for (var i = 0; i < TREATMENTS.length; i++) if (TREATMENTS[i].name === p.type) { _foundT = TREATMENTS[i]; break; }
  populateApptTypes(_foundT ? _foundT.id : null);   /* v336: يبقى الاختيار بعد البناء */
  if (_foundT) document.getElementById('aType').value = _foundT.id;
  if (typeof ppApptCtxNote === 'function') ppApptCtxNote(false);
  document.getElementById('aDur').value = String(p.duration || 60);
  document.getElementById('aDate').value = toDay();
  document.getElementById('aTime').value = '09:00';
  // Map legacy 'broken' to 'no_show' (Phase 2C reverted).
  var _statusForUi2 = (p.status === 'broken') ? 'no_show' : (p.status || 'confirmed');
  document.getElementById('aStatus').value = _statusForUi2;
  document.getElementById('aStatus').dataset.orig = _statusForUi2;
  document.getElementById('aReason').value = '';
  // Carry the planned reason forward into the regular notes field so it isn't lost.
  document.getElementById('aNotes').value = p.notes || '';
  var t = document.getElementById('apptModalTitle');
  if (t) t.textContent = '📅 جدولة موعد مخطّط';
  var saveBtn = document.getElementById('aSaveBtn');
  if (saveBtn) saveBtn.textContent = 'جدولة الموعد';
  var chk = document.getElementById('aIsPlanned');
  if (chk) { chk.checked = false; }
  setupApptProviderPicker(p.provider_id || null);
  onApptPlannedToggle();
  // Workflow B: this is the "schedule a planned appointment" flow — a real
  // appt row exists in DB (editingApptId set). The procedures section runs
  // in 'active' mode (live DB writes for attach/unlink). Clear any stale
  // pending buffer from a previous create flow.
  if (typeof clearPendingPP === 'function') clearPendingPP();
  if (typeof setApptProcSectionMode === 'function') setApptProcSectionMode('active');
  openModal('apptModal');
  showToast('✏️ أدخل التاريخ والوقت ثم اضغط "جدولة الموعد"');
}

/* Delete a planned appointment (with confirm). */
var deletePlannedFromProfile = ppGuarded('deletePlannedFromProfile', _deletePlannedFromProfile_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _deletePlannedFromProfile_inner(id) {
  // Phase 4.1: defense-in-depth — block destructive ops if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن حذف المواعيد المخطّطة');
    return;
  }
  /* v410: الزيارة غير المجدولة قد تحمل بنوداً — الحذفُ يحرّرها فقط (FK: ON DELETE SET NULL)، والبنودُ نفسها تبقى بالخطة. */
  var _linkedN = (sessions || []).filter(function(x){ return x && x.appointment_id === id; }).length;
  if (!await SyDialog.confirm({ message: 'حذف هذا الموعد المخطّط؟' + (_linkedN ? '\n\n' + _linkedN + ' بند مرتبط به سيعود «بلا زيارة» — البنود نفسها لا تُحذف.' : ''), danger: true })) return;
  var res = await window.sb.from('appointments').delete()
    .eq('id', id).eq('doctor_id', currentUser.id);
  if (res.error) { showToast('❌ خطأ في الحذف: ' + res.error.message); return; }
  plannedAppts = plannedAppts.filter(function(p){ return p.id !== id; });
  // Phase 2B-A: keep timeline in sync with the deleted appointment.
  allAppointmentsForTl = (allAppointmentsForTl || []).filter(function(a){ return a.id !== id; });
  // Phase 2B-B: lab_orders.appointment_id has ON DELETE SET NULL at the DB
  // level — the FK already nulled any references to this appointment on
  // the server. Mirror that in the local cache so any future timeline
  // pass that exposes the appt link (and the labs.html tab opened in
  // another window after a return-to-profile) sees consistent data.
  //
  // Note: the patient-profile labs tab itself doesn't currently render
  // appointment_id, so we don't re-call renderLabOrders() here — that
  // would be a no-op. Timeline re-render below handles the visible
  // surfaces that might consume the field in future.
  (labOrders || []).forEach(function(lo){
    if (lo.appointment_id === id) { lo.appointment_id = null; }
  });
  (sessions || []).forEach(function(x){ if (x && x.appointment_id === id) x.appointment_id = null; });   /* v410: مرآةُ SET NULL */
  renderPlannedAppts();
  renderTimeline();
  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}
  showToast('🗑️ تم حذف الموعد المخطّط');
}

/* Toggle handler for the planned-flag checkbox inside the appt modal.
   Shows/hides date+time row and the reason field. */
function onApptPlannedToggle() {
  var chk = document.getElementById('aIsPlanned');
  if (!chk) return;
  var planned   = !!chk.checked;
  var dateRow   = document.getElementById('aDateTimeRow');
  var reasonGrp = document.getElementById('aReasonGroup');
  var note      = document.getElementById('aPlannedNote');
  if (dateRow)   dateRow.style.display   = planned ? 'none' : '';
  if (reasonGrp) reasonGrp.style.display = planned ? 'block' : 'none';
  if (note)      note.style.display      = planned ? 'block' : 'none';
  // v410 (زيارات الخطة): بوضع الإنشاء يبقى القسم 'create' سواءٌ أكان الموعد
  // مخطّطاً أم مؤرَّخاً — الزيارة غير المجدولة تحمل بنودها. بوضع التعديل تُترك
  // حالةُ القسم لمدخله (editPlannedFromProfile / quickSchedulePlannedFromProfile).
  if (!editingApptId) {
    if (typeof setApptProcSectionMode === 'function') {
      setApptProcSectionMode('create');   /* v410: الزيارة غير المجدولة تحمل بنودها أيضاً */
    }
  }
}

/* Provider picker setup, extracted so openApptModal/openPlannedApptModal/
   editPlannedFromProfile/quickSchedulePlannedFromProfile can all share it.
   `preselect` = clinic_doctors.id to highlight, or null for the OpenDental
   3-tier default. */
function setupApptProviderPicker(preselect) {
  var pGroup = document.getElementById('apptProviderGroup');
  var pSel = document.getElementById('aProvider');
  if (!pGroup || !pSel) return;
  if (!CLINIC_DOCTORS || CLINIC_DOCTORS.length === 0) {
    pGroup.style.display = 'none';
    pSel.innerHTML = '';
    return;
  }
  var active = CLINIC_DOCTORS.filter(function(d){ return d.is_active !== false; });
  var listToShow = active.length > 0 ? active : CLINIC_DOCTORS;
  pGroup.style.display = 'block';
  pSel.innerHTML = listToShow.map(function(d){
    var prefix = '';
    if (d.user_id === (currentUser && currentUser.id)) prefix = '🔗 ';
    else if (d.is_owner) prefix = '⭐ ';
    var inactiveStr = d.is_active === false ? ' (معطل)' : '';
    return '<option value="' + d.id + '">' + prefix + escapeHtml(d.name) + inactiveStr + '</option>';
  }).join('');
  pSel.value = preselect || getDefaultProviderId(listToShow);
}

/* ── Populate selects ── */
async function populateSessionTypes() {
  await loadTreatmentsFromSupabase();
  var sel = document.getElementById('sType');
  if (!sel) return;
  sel.innerHTML = '<option value="">— اختر —</option>';
  TREATMENTS.forEach(function(t){
    var opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  });
  var other = document.createElement('option');
  other.value = '_other'; other.textContent = 'أخرى';
  sel.appendChild(other);
  // ربط التعبئة التلقائية للسعر — كانت الدالة معرّفة بلا مستدعٍ منذ إنشائها.
  sel.onchange = autofillSessionPrice;
}

function autofillSessionPrice() {
  var sel = document.getElementById('sType');
  // M125: «أخرى» أو بلا اختيار ⇒ سعرٌ يدوي ⇒ العملة اختيار حرّ للطبيب.
  if (!sel || !sel.value || sel.value === '_other') return;   // سعر يدوي: العملة بيد الطبيب
  var t = getTreatment(sel.value);
  if (!t) return;
  // سعر الطبيب المختار مع override إن وُجد — النمط القانوني نفسه بمودال السن (pp-dental).
  var provSel = document.getElementById('sProvider');
  var providerId = (provSel && provSel.value) ? provSel.value : null;
  document.getElementById('sCost').value = getPriceForDoctor(t, providerId);
  /* M125: السعر المُعبّأ بعملة العلاج — المبدّل يتبعها وإلا تُكتب الجلسة بعملة خاطئة */
  try { if (t && t.currency) window.SyDentCurPick.set('sCost', (t.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
  // M125: السعر يأتي من الكتالوج فتأتي عملته معه — تُضبط ولا تُقفَل، فيبقى
  // للطبيب أن يحاسب هذا المريض بعملةٍ أخرى؛ والتبديل اليدوي يُفرّغ الحقل
  // (mount بـopenSessionModal) فلا يُحفَظ سعرُ كتالوجٍ تحت وسمٍ كاذب.
  try { window.SyDentCurPick.set('sCost', (t.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
}

/* v336: keepVal — القيمةُ المختارة بعد إعادة البناء. البناءُ يجري بعد جلب
   الكتالوج (غير متزامن)، فأيُّ اختيارٍ كُتب قبله كان يُمسح إلى أول علاج:
   «📅 جدولة الآن» و«تعديل» المخطّط كانا يحفظان نوعاً غير نوع الموعد. */
async function populateApptTypes(keepVal) {
  await loadTreatmentsFromSupabase();
  var sel = document.getElementById('aType');
  if (!sel) return;
  sel.innerHTML = '';
  TREATMENTS.forEach(function(t){
    var opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  });
  var other = document.createElement('option');
  other.value = '_other'; other.textContent = 'أخرى';
  sel.appendChild(other);
  if (keepVal) {
    sel.value = keepVal;
    if (sel.value !== keepVal) sel.selectedIndex = 0;
  }
}

/* ═══════════════════════════════════════════════════════════════
   v336 — تبويب «المواعيد» ببطاقة المريض
   المصدر: allAppointmentsForTl (كل مواعيد المريض — pp-timeline.js) +
   sessions (العلاجات المربوطة) + lastReminderLogByAppt (التذكيرات).
   الكتابةُ الوحيدة هنا ختمُ الحضور (v338، آخر الملف)؛ النتيجةُ والتعديل بصفحة
   المواعيد (?editAppt=) حيث قفلُ v335 (#587) · المخطّطة بدوالها القائمة ·
   «إعادة حجز» موعدٌ جديد (#586).
   مراجعة المنافسين: Open Dental «Appointments for Patient» (مخطّط/مجدول/
   فائت/مكتمل + انتقالٌ للموعد + مراجعة السجل قبل الحجز) · Dentrix Ascend
   (عدّاد الفائت + هل أُعيد حجزه) · Dentrix (تنبيه تكرار عدم الحضور).
   ═══════════════════════════════════════════════════════════════ */
var PP_APPT_STATUS_AR = {
  scheduled: 'غير مؤكد', confirmed: 'مؤكد', pending: 'معلّق', completed: 'مكتمل',
  cancelled: 'ملغى', broken: 'عدم حضور', no_show: 'عدم حضور'
};
var PP_APPT_BUCKETS = {
  upcoming:   { chip: 'القادمة',   color: 'var(--blue)',   tone: 'blue'   },
  unresolved: { chip: 'بلا نتيجة', color: 'var(--orange)', tone: 'orange' },
  planned:    { chip: 'المخطّطة',  color: 'var(--yellow)', tone: 'yellow' },
  attended:   { chip: 'السابقة',   color: 'var(--green)',  tone: 'green'  },
  missed:     { chip: 'الفائتة',   color: 'var(--red)',    tone: 'red'    },
  cancelled:  { chip: 'الملغاة',   color: 'var(--text3)',  tone: 'gray'   }
};
var PP_APPT_HIST_PAGE = 25;
var _ppApptsFilter = 'all';
var _ppApptsHistShown = 25;

/* التصنيف — مصدرٌ واحد. معيارُ «منتهٍ» هو معيارُ قفل v335 حرفياً
   (حالةٌ منتهية أو ختمُ خروج)، فلا يتناقض التبويب مع صفحة المواعيد.
   ماضٍ بلا أختام وبلا حالة منتهية = «بلا نتيجة» — لا يُخمَّن حضوراً ولا غياباً. */
function ppApptBucket(a, today) {
  if (!a) return 'planned';
  if (a.is_planned === true || !a.date) return 'planned';
  var st = a.status || '';
  if (st === 'cancelled') return 'cancelled';
  if (st === 'no_show' || st === 'broken') return 'missed';
  if (st === 'completed' || a.dismissed_at) return 'attended';
  var d = String(a.date).slice(0, 10);
  if (d >= today) return 'upcoming';
  if (a.arrived_at || a.seated_at) return 'attended';
  return 'unresolved';
}

function ppApptSortKey(a) {
  return String((a && a.date) || '').slice(0, 10) + ' ' + String((a && a.time) || '').slice(0, 5);
}

function ppApptGroups(list, today) {
  var g = { upcoming: [], unresolved: [], planned: [], attended: [], missed: [], cancelled: [] };
  (list || []).forEach(function(a){
    if (a && a.id) g[ppApptBucket(a, today)].push(a);
  });
  g.upcoming.sort(function(x, y){ var a = ppApptSortKey(x), b = ppApptSortKey(y); return a < b ? -1 : (a > b ? 1 : 0); });
  ['unresolved', 'attended', 'missed', 'cancelled'].forEach(function(k){
    g[k].sort(function(x, y){ var a = ppApptSortKey(x), b = ppApptSortKey(y); return a < b ? 1 : (a > b ? -1 : 0); });
  });
  g.planned.sort(function(x, y){ return String(y.created_at || '').localeCompare(String(x.created_at || '')); });
  return g;
}

/* السجلّ المدموج (حضر + فائت + ملغى) من الأحدث للأقدم. */
function ppApptHistory(g) {
  var h = [].concat(g.attended, g.missed, g.cancelled);
  h.sort(function(x, y){ var a = ppApptSortKey(x), b = ppApptSortKey(y); return a < b ? 1 : (a > b ? -1 : 0); });
  return h;
}

/* Dentrix Ascend: لكل موعدٍ فائت/ملغى — هل أُعيد حجزه؟ بلا ربطٍ صريح بين
   الموعدين، «إعادة الحجز» = موعدٌ لاحق **من النوع نفسه** (العلاج أو الاسم):
   حشوةٌ فائتة لا تُعَدّ محجوزةً لأن للمريض معالجةً لبية قادمة. */
function ppApptSameKind(a, b) {
  if (a.treatment_id && b.treatment_id) return a.treatment_id === b.treatment_id;
  return !!a.type && b.type === a.type;
}
function ppApptRebookedBy(a, g) {
  var d = String((a && a.date) || '').slice(0, 10);
  if (!d) return null;
  var later = [].concat(g.upcoming, g.attended, g.unresolved).filter(function(b){
    return b.id !== a.id && String(b.date || '').slice(0, 10) > d && ppApptSameKind(a, b);
  });
  later.sort(function(x, y){ var p = ppApptSortKey(x), q = ppApptSortKey(y); return p < q ? -1 : (p > q ? 1 : 0); });
  if (later.length) {
    var b = later[0];
    return { appt: b, kind: g.upcoming.indexOf(b) !== -1 ? 'upcoming' : (g.attended.indexOf(b) !== -1 ? 'attended' : 'unresolved') };
  }
  if (g.planned.some(function(p){ return ppApptSameKind(a, p); })) return { planned: true };
  return null;
}

function ppApptDayDiff(d, today) {
  var p = String(d || '').slice(0, 10).split('-'), q = String(today || '').slice(0, 10).split('-');
  if (p.length !== 3 || q.length !== 3) return null;
  var x = Date.UTC(+p[0], +p[1] - 1, +p[2]), y = Date.UTC(+q[0], +q[1] - 1, +q[2]);
  if (isNaN(x) || isNaN(y)) return null;
  return Math.round((x - y) / 86400000);
}
function ppArUnit(n, one, two, few, many) {
  if (n <= 1) return one;
  if (n === 2) return two;
  if (n <= 10) return n + ' ' + few;
  return n + ' ' + many;
}
function ppApptRel(d, today) {
  var n = ppApptDayDiff(d, today);
  if (n === null) return '';
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === -1) return 'أمس';
  var ab = Math.abs(n), span;
  var mo = Math.round(ab / 30.44);
  if (ab < 30) span = ppArUnit(ab, 'يوم', 'يومين', 'أيام', 'يوماً');
  else if (mo < 12) span = ppArUnit(mo, 'شهر', 'شهرين', 'أشهر', 'شهراً');
  else span = ppArUnit(Math.max(1, Math.round(ab / 365.25)), 'سنة', 'سنتين', 'سنوات', 'سنة');
  return (n > 0 ? 'بعد ' : 'قبل ') + span;
}

function ppLtr(s) { return '\u2066' + s + '\u2069'; }
/* نصٌّ خام (للـtextContent) — مواضعُ HTML تمرّره بـescapeHtml. الوقتُ معزولٌ LTR. */
function ppApptTime(t) {
  if (!t) return '';
  var s = (typeof fmtTime12 === 'function') ? fmtTime12(String(t)) : String(t).slice(0, 5);
  return ppLtr(s);
}
function ppApptColor(c, fallback) {
  if (!c) return fallback;
  return (typeof _sanHex === 'function') ? _sanHex(c) : (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? String(c) : fallback);
}
function ppApptStampTime(iso) {
  if (!iso) return '';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  var hh = t.getHours(), mm = t.getMinutes();
  return ppApptTime((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm);
}
/* التاريخ الرقمي معزولٌ LTR — وإلا قفزت نقطةُ الجملة بجانبه بالسياق العربي. */
function ppApptDNum(d) {
  var s = (typeof fmtDNum === 'function') ? fmtDNum(d) : String(d || '—').slice(0, 10);
  return ppLtr(s);
}
function ppApptDateParts(d) {
  var dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
  if (isNaN(dt.getTime())) return null;
  var days = (typeof PP_DAYS_AR !== 'undefined') ? PP_DAYS_AR : null;
  var months = (typeof PP_MONTHS_AR !== 'undefined') ? PP_MONTHS_AR : null;
  return {
    dow: days ? days[dt.getDay()] : '',
    day: dt.getDate(),
    month: months ? months[dt.getMonth()] : String(dt.getMonth() + 1),
    year: dt.getFullYear()
  };
}
function ppApptLongDate(d) {
  var p = ppApptDateParts(d);
  if (!p) return ppApptDNum(d);
  return (p.dow ? p.dow + ' ' : '') + p.day + ' ' + p.month + ' ' + p.year;
}

function ppApptProvider(a) {
  if (!a || !a.provider_id || !Array.isArray(CLINIC_DOCTORS)) return null;
  return (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS).find(function(d){ return d.id === a.provider_id; }) || null;
}
function ppApptTreatment(a) {
  var list = Array.isArray(TREATMENTS) ? TREATMENTS : [];
  if (a && a.treatment_id) {
    var byId = list.find(function(t){ return t.dbId === a.treatment_id; });
    if (byId) return byId;
  }
  if (a && a.type) return list.find(function(t){ return t.name === a.type; }) || null;
  return null;
}
function ppApptFind(id) {
  return (Array.isArray(allAppointmentsForTl) ? allAppointmentsForTl : []).find(function(x){ return x.id === id; }) || null;
}

/* شارةُ الحالة: نصٌّ يصف ما حصل فعلاً لا الحقلَ الخام (#106: «مؤكد» بعد الخروج = حضر). */
function ppApptStatusBadge(a, bucket) {
  var label;
  if (bucket === 'attended') label = (a.status === 'completed') ? 'مكتمل' : 'حضر';
  else if (bucket === 'upcoming') {
    if (a.seated_at) label = 'على الكرسي';
    else if (a.arrived_at) label = 'في العيادة';
    else label = PP_APPT_STATUS_AR[a.status] || 'مؤكد';
  }
  else if (bucket === 'unresolved') label = 'بلا نتيجة';
  else if (bucket === 'planned') label = 'مخطّط';
  else label = PP_APPT_STATUS_AR[a.status] || a.status || '—';
  var live = (bucket === 'upcoming' && (a.arrived_at || a.seated_at));
  var color = live ? 'var(--green)' : PP_APPT_BUCKETS[bucket].color;
  var tone = live ? 'green' : (PP_APPT_BUCKETS[bucket].tone || 'gray');
  return '<span class="cbadge appt-status tone tone-' + tone + '" style="--bc:' + color + ';">' + escapeHtml(label) + '</span>';
}

function ppApptLinkedHtml(a) {
  var list = (Array.isArray(sessions) ? sessions : []).filter(function(s){ return s && s.appointment_id === a.id; });
  if (!list.length) return '';
  var shown = list.slice(0, 3).map(function(s){
    var tooth = s.tooth_num ? ' (س ' + escapeHtml(String(s.tooth_num)) + ')' : '';
    var mark = (s.status === 'planned') ? '<span class="appt-sess-planned">مخطّط</span>' : '<span class="appt-sess-done">✓</span>';
    return '<span class="appt-sess">' + mark + escapeHtml(s.type || 'علاج') + tooth + '</span>';
  }).join('');
  var more = list.length > 3 ? '<span class="appt-sess appt-sess-more">+' + (list.length - 3) + '</span>' : '';
  return '<div class="appt-line appt-sessions"><span class="appt-k">العلاجات</span>' + shown + more + '</div>';
}

function ppApptRowHtml(a, bucket, g, today) {
  var isPlanned = (bucket === 'planned');
  var t = ppApptTreatment(a);
  var prov = ppApptProvider(a);
  var parts = isPlanned ? null : ppApptDateParts(a.date);
  var stripe = PP_APPT_BUCKETS[bucket].color;

  var tile = '';
  if (isPlanned) {
    tile = '<div class="appt-tile appt-tile-planned" aria-hidden="true"><span class="appt-tile-day">📋</span><span class="appt-tile-mon">بلا تاريخ</span></div>';
  } else if (parts) {
    tile = '<div class="appt-tile" aria-hidden="true">'
      + '<span class="appt-tile-dow">' + escapeHtml(parts.dow) + '</span>'
      + '<span class="appt-tile-day">' + parts.day + '</span>'
      + '<span class="appt-tile-mon">' + escapeHtml(parts.month) + ' ' + parts.year + '</span>'
      + '</div>';
  }

  var typeColor = (t && t.fill) ? ppApptColor(t.fill, 'var(--blue)') : 'var(--blue)';
  var head = '<div class="appt-head">'
    + '<span class="cbadge appt-type" style="--bc:' + typeColor + ';">' + escapeHtml(a.type || 'موعد') + '</span>'
    + (a.time && !isPlanned ? '<span class="appt-time">' + escapeHtml(ppApptTime(a.time)) + '</span>' : '')
    + (!isPlanned ? '<span class="appt-rel">' + escapeHtml(ppApptRel(a.date, today)) + '</span>' : '')
    + ppApptStatusBadge(a, bucket)
    + '</div>';

  var meta = [];
  if (prov) meta.push('<span class="appt-prov"><span class="appt-dot" style="--bc:' + ppApptColor(prov.color, 'var(--green)') + ';"></span>' + escapeHtml(prov.name || '') + '</span>');
  if (a.duration) meta.push('<span>' + (parseInt(a.duration, 10) || 0) + ' دقيقة</span>');
  if (isPlanned && a.created_at) meta.push('<span>أُضيف ' + escapeHtml(ppApptDNum(String(a.created_at).slice(0, 10))) + '</span>');
  var lines = meta.length ? '<div class="appt-line appt-meta">' + meta.join('') + '</div>' : '';

  if (bucket === 'attended' || (bucket === 'upcoming' && (a.arrived_at || a.seated_at))) {
    var st = [];
    if (a.arrived_at)   st.push('<span class="appt-stamp">وصل ' + escapeHtml(ppApptStampTime(a.arrived_at)) + '</span>');
    if (a.seated_at)    st.push('<span class="appt-stamp">جلس ' + escapeHtml(ppApptStampTime(a.seated_at)) + '</span>');
    if (a.dismissed_at) st.push('<span class="appt-stamp">خرج ' + escapeHtml(ppApptStampTime(a.dismissed_at)) + '</span>');
    if (bucket === 'attended' && !a.dismissed_at && a.status !== 'completed') st.push('<span class="appt-muted">لم يُسجَّل خروجه</span>');
    if (st.length) lines += '<div class="appt-line"><span class="appt-k">الحضور</span>' + st.join('<span class="appt-sep"></span>') + '</div>';
  }

  if (!isPlanned) lines += ppApptLinkedHtml(a);

  if (bucket === 'upcoming') {
    var log = (typeof lastReminderLogByAppt !== 'undefined' && lastReminderLogByAppt) ? lastReminderLogByAppt[a.id] : null;
    if (log && log.sent_at) lines += '<div class="appt-line appt-ok">✓ أُرسل تذكير ' + escapeHtml(ppApptDNum(String(log.sent_at).slice(0, 10))) + '</div>';
  }

  if (bucket === 'missed' || bucket === 'cancelled') {
    var rb = ppApptRebookedBy(a, g);
    if (rb && rb.appt) {
      var rbLbl = (rb.kind === 'upcoming') ? 'أُعيد الحجز: ' : (rb.kind === 'attended' ? 'أُنجز بموعدٍ لاحق: ' : 'حُجز لاحقاً: ');
      lines += '<div class="appt-line appt-ok">↻ ' + rbLbl + escapeHtml(ppApptDNum(rb.appt.date)) + '</div>';
    } else if (rb && rb.planned) {
      lines += '<div class="appt-line appt-muted">📋 له موعدٌ مخطّط من النوع نفسه بانتظار الجدولة</div>';
    } else {
      lines += '<div class="appt-line appt-warn">لم يُعَد حجزه</div>';
    }
  }

  if (bucket === 'unresolved') {
    lines += '<div class="appt-line appt-warn">مضى يومه ولم يُسجَّل وصولٌ ولا عدم حضور</div>';
  }

  var notes = String(a.notes || '').trim();
  if (notes) lines += '<div class="appt-line appt-notes">' + escapeHtml(notes) + '</div>';

  var id = escapeHtml(a.id);
  var btns = '';
  if (isPlanned) {
    btns = '<button type="button" class="sy-act sy-act-primary" data-appt-act="schedule" data-id="' + id + '">📅 جدولة</button>'
      + '<button type="button" class="sy-act" data-appt-act="editplanned" data-id="' + id + '">✏️ تعديل</button>'
      + '<button type="button" class="sy-act sy-act-danger" data-appt-act="delplanned" data-id="' + id + '">🗑️ حذف</button>';
  } else if (bucket === 'upcoming') {
    btns += ppApptStageBtnHtml(a, today);   /* v338: موعدُ اليوم وحده */
    if (patient && patient.phone) btns += '<button type="button" class="sy-act" data-appt-act="remind" data-id="' + id + '">📱 تذكير</button>';
    btns += '<button type="button" class="sy-act" data-appt-act="open" data-id="' + id + '">🗓️ فتح بالتقويم</button>';
  } else if (bucket === 'unresolved') {
    btns = '<button type="button" class="sy-act sy-act-primary" data-appt-act="open" data-id="' + id + '">📝 حدّد النتيجة</button>';
  } else if (bucket === 'missed' || bucket === 'cancelled') {
    var rb2 = ppApptRebookedBy(a, g);
    if (!rb2) btns += '<button type="button" class="sy-act sy-act-primary" data-appt-act="rebook" data-id="' + id + '">📅 إعادة حجز</button>';
    btns += '<button type="button" class="sy-act" data-appt-act="open" data-id="' + id + '">📂 فتح</button>';
  } else {
    btns = '<button type="button" class="sy-act" data-appt-act="open" data-id="' + id + '">📂 فتح</button>';
  }

  var clickable = !isPlanned;
  var aria = isPlanned ? '' : ' role="button" tabindex="0" data-appt-open="' + id + '" title="فتح الموعد بصفحة المواعيد"';
  return '<div class="appt-row appt-b-' + bucket + (clickable ? ' appt-click' : '') + '" style="--bc:' + stripe + ';"' + aria + '>'
    + tile
    + '<div class="appt-body">' + head + lines + '</div>'
    + '<div class="appt-actions sy-acts">' + btns + '</div>'
    + '</div>';
}

function ppApptSectionHtml(title, hint, rows) {
  return '<div class="appt-sec">'
    + '<div class="appt-sec-head"><span class="appt-sec-title">' + escapeHtml(title) + '</span>'
    + (hint ? '<span class="appt-sec-hint">' + escapeHtml(hint) + '</span>' : '')
    + '</div>' + rows + '</div>';
}

function ppApptNextHtml(g, today) {
  var n = g.upcoming[0];
  if (!n) {
    var last = g.attended[0];
    var sub = last ? ('آخر زيارة بموعد: ' + ppApptLongDate(last.date) + ' (' + ppApptRel(last.date, today) + ')') : 'لم يُحجز له أي موعد بعد';
    return '<div class="appts-next appts-next-empty">'
      + '<div class="appts-next-body"><div class="appts-next-k">لا يوجد موعد قادم</div>'
      + '<div class="appts-next-sub">' + escapeHtml(sub) + '</div></div>'
      + '<div class="appts-next-actions sy-acts"><button type="button" class="sy-act sy-act-primary" data-appt-act="new">📅 حجز موعد</button></div>'
      + '</div>';
  }
  var prov = ppApptProvider(n);
  var bits = [escapeHtml(n.type || 'موعد')];
  if (n.time) bits.push(escapeHtml(ppApptTime(n.time)));
  if (prov) bits.push(escapeHtml(prov.name || ''));
  var more = g.upcoming.length > 1 ? '<div class="appts-next-sub">وبعده ' + ppArUnit(g.upcoming.length - 1, 'موعدٌ آخر', 'موعدان آخران', 'مواعيد أخرى', 'موعداً آخر') + '</div>' : '';
  var btns = ppApptStageBtnHtml(n, today);   /* v338 */
  if (patient && patient.phone) btns += '<button type="button" class="sy-act" data-appt-act="remind" data-id="' + escapeHtml(n.id) + '">📱 تذكير</button>';
  btns += '<button type="button" class="sy-act" data-appt-act="open" data-id="' + escapeHtml(n.id) + '">🗓️ فتح بالتقويم</button>';
  return '<div class="appts-next">'
    + '<div class="appts-next-body">'
    +   '<div class="appts-next-k">الموعد القادم · <b>' + escapeHtml(ppApptRel(n.date, today)) + '</b></div>'
    +   '<div class="appts-next-date">' + escapeHtml(ppApptLongDate(n.date)) + '</div>'
    +   '<div class="appts-next-sub">' + bits.join(' — ') + '</div>'
    +   more
    + '</div>'
    + '<div class="appts-next-actions sy-acts">' + btns + '</div>'
    + '</div>';
}

function ppApptAlertsHtml(g) {
  var out = '';
  if (g.missed.length >= 2) {
    out += '<div class="appts-alert appts-alert-red">⚠️ تكرّر عدم حضور المريض '
      + ppArUnit(g.missed.length, 'مرة', 'مرتين', 'مرات', 'مرة') + ' — آخرها '
      + escapeHtml(ppApptDNum(g.missed[0].date)) + '. يُفضَّل تأكيد موعده القادم قبل يومه.</div>';
  }
  if (g.unresolved.length) {
    out += '<div class="appts-alert appts-alert-orange">'
      + ppArUnit(g.unresolved.length, 'موعدٌ واحد مضى يومه', 'موعدان مضى يومهما', 'مواعيد مضى يومها', 'موعداً مضى يومه')
      + ' بلا نتيجة — حدّد هل حضر المريض أم لا ليبقى سجلّه دقيقاً.</div>';
  }
  return out;
}

function ppApptChipsHtml(g) {
  var total = g.upcoming.length + g.unresolved.length + g.planned.length + g.attended.length + g.missed.length + g.cancelled.length;
  var keys = ['upcoming', 'unresolved', 'planned', 'attended', 'missed', 'cancelled'];
  if (_ppApptsFilter !== 'all' && (!g[_ppApptsFilter] || g[_ppApptsFilter].length === 0)) _ppApptsFilter = 'all';
  var html = '<button type="button" class="tl-chip appts-chip' + (_ppApptsFilter === 'all' ? ' active' : '') + '" data-appts-filter="all" aria-pressed="' + (_ppApptsFilter === 'all') + '">الكل <b>' + total + '</b></button>';
  keys.forEach(function(k){
    if (!g[k].length) return;
    var on = (_ppApptsFilter === k);
    html += '<button type="button" class="tl-chip appts-chip' + (on ? ' active' : '') + '" data-appts-filter="' + k + '" aria-pressed="' + on + '">'
      + PP_APPT_BUCKETS[k].chip + ' <b>' + g[k].length + '</b></button>';
  });
  var resolved = g.attended.length + g.missed.length;
  if (resolved >= 3) {
    var pct = Math.round(g.attended.length * 100 / resolved);
    html += '<span class="appts-rate" title="الحضور ÷ (الحضور + عدم الحضور) — الملغاة لا تُحسب">نسبة الحضور <b>' + pct + '%</b> (' + g.attended.length + ' من ' + resolved + ')</span>';
  }
  return html;
}

function ppApptHistRows(list, g, today) {
  var shown = list.slice(0, _ppApptsHistShown);
  var rows = shown.map(function(a){ return ppApptRowHtml(a, ppApptBucket(a, today), g, today); }).join('');
  var rest = list.length - shown.length;
  if (rest > 0) rows += '<button type="button" class="appt-more" data-appt-act="more">عرض الأقدم (' + rest + ' متبقية)</button>';
  return rows;
}

function ppApptsBadge(g) {
  var b = document.getElementById('apptsBadge');
  if (b) {
    var n = g.upcoming.length;
    b.textContent = String(n);
    b.style.display = n > 0 ? '' : 'none';
  }
  var tb = document.getElementById('tabBtnAppts');
  if (tb) {
    var tip = [];
    if (g.upcoming.length) tip.push(g.upcoming.length + ' قادمة');
    if (g.unresolved.length) tip.push(g.unresolved.length + ' بلا نتيجة');
    tb.title = tip.join(' · ');
  }
}

function renderApptsTab() {
  var today = (typeof toDay === 'function') ? toDay() : '';
  var list = Array.isArray(allAppointmentsForTl) ? allAppointmentsForTl : [];
  var g = ppApptGroups(list, today);
  ppApptsBadge(g);
  var box = document.getElementById('apptsContent');
  if (!box) return;
  var sum = document.getElementById('apptsSummary');
  var chips = document.getElementById('apptsChips');
  var total = list.filter(function(a){ return a && a.id; }).length;

  if (sum) sum.innerHTML = ppApptNextHtml(g, today) + ppApptAlertsHtml(g);
  if (total === 0) {
    if (chips) chips.innerHTML = '';
    box.innerHTML = '<div class="tl-empty"><div class="tl-empty-icon">📅</div>'
      + '<div>لا توجد مواعيد لهذا المريض بعد</div>'
      + '<div class="appt-empty-hint">الجلسات المسجّلة بلا موعد تظهر بتبويب الجلسات.</div></div>';
  } else {
    if (chips) chips.innerHTML = ppApptChipsHtml(g);
    var f = _ppApptsFilter, html = '';
    var row = function(k){ return function(a){ return ppApptRowHtml(a, k, g, today); }; };
    if (f === 'all') {
      if (g.upcoming.length)   html += ppApptSectionHtml('القادمة', 'من الأقرب', g.upcoming.map(row('upcoming')).join(''));
      if (g.unresolved.length) html += ppApptSectionHtml('بحاجة لتحديد النتيجة', 'مضى يومها بلا وصول ولا عدم حضور', g.unresolved.map(row('unresolved')).join(''));
      if (g.planned.length)    html += ppApptSectionHtml('المخطّطة', 'بانتظار تحديد موعد', g.planned.map(row('planned')).join(''));
      var hist = ppApptHistory(g);
      if (hist.length)         html += ppApptSectionHtml('السجل', 'من الأحدث', ppApptHistRows(hist, g, today));
    } else if (f === 'upcoming' || f === 'unresolved' || f === 'planned') {
      html = g[f].map(row(f)).join('');
    } else {
      html = ppApptHistRows(g[f], g, today);
    }
    box.innerHTML = html;
  }
  ppApptsWire();
}

/* تفويضُ الأحداث — إسنادٌ (لا addEventListener) فتكرارُ الرسم لا يكرّر المعالجات. */
function ppApptsWire() {
  var panel = document.getElementById('tab-appts');
  if (!panel) return;
  panel.onclick = function(e){
    var t = e.target;
    var chip = t && t.closest ? t.closest('[data-appts-filter]') : null;
    if (chip) {
      _ppApptsFilter = chip.getAttribute('data-appts-filter') || 'all';
      _ppApptsHistShown = PP_APPT_HIST_PAGE;
      renderApptsTab();
      return;
    }
    var btn = t && t.closest ? t.closest('[data-appt-act]') : null;
    if (btn) { e.stopPropagation(); ppApptAct(btn.getAttribute('data-appt-act'), btn.getAttribute('data-id'), btn.getAttribute('data-stage')); return; }
    var r = t && t.closest ? t.closest('[data-appt-open]') : null;
    if (r) ppApptOpenInCalendar(r.getAttribute('data-appt-open'));
  };
  panel.onkeydown = function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-appt-open')) return;
    e.preventDefault();
    ppApptOpenInCalendar(t.getAttribute('data-appt-open'));
  };
}

function ppApptAct(act, id, stage) {
  if (act === 'more')        { _ppApptsHistShown += PP_APPT_HIST_PAGE; renderApptsTab(); return; }
  if (act === 'new')         { openApptModal(); return; }
  if (act === 'open')        { ppApptOpenInCalendar(id); return; }
  if (act === 'remind')      { ppApptRemind(id); return; }
  if (act === 'rebook')      { ppApptRebook(id); return; }
  if (act === 'stage')       { ppApptStamp(id, stage); return; }
  if (act === 'schedule')    { quickSchedulePlannedFromProfile(id); return; }
  if (act === 'editplanned') { editPlannedFromProfile(id); return; }
  if (act === 'delplanned')  { deletePlannedFromProfile(id); return; }
}

function ppApptOpenInCalendar(id) {
  if (!id) return;
  if (!ppApptFind(id)) { showToast('⚠️ الموعد غير موجود — ربما حُذف'); return; }
  window.location.href = 'appointments.html?editAppt=' + encodeURIComponent(id);
}

function ppApptRemind(id) {
  var a = ppApptFind(id);
  if (!a) { showToast('⚠️ الموعد غير موجود'); return; }
  if (typeof ppOpenWaModal !== 'function') { showToast('⚠️ تعذّر فتح نافذة التذكير — أعد تحميل الصفحة'); return; }
  /* ppSendWaReminder يبحث بـupcomingAppts (محدودة بـ20) — نضمن وجود الموعد فيها. */
  if (Array.isArray(upcomingAppts) && !upcomingAppts.some(function(u){ return u.id === a.id; })) {
    upcomingAppts.push({ id: a.id, date: a.date, time: a.time, duration: a.duration, type: a.type, status: a.status,
      provider_id: a.provider_id, arrived_at: a.arrived_at || null, seated_at: a.seated_at || null, dismissed_at: a.dismissed_at || null });
    upcomingAppts.sort(function(x, y){ return (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')); });
  }
  ppOpenWaModal(a);
}

/* «إعادة حجز» — موعدٌ جديد معبّأ بنوع الموعد الفائت ومدته وطبيبه (#586: القديم لا يُنقل).
   نمطُ rebookFromAppt بصفحة المواعيد. */
async function ppApptRebook(id) {
  var a = ppApptFind(id);
  if (!a) { showToast('⚠️ الموعد غير موجود'); return; }
  var ready = openApptModal();
  var title = document.getElementById('apptModalTitle');
  if (title) title.textContent = '📅 إعادة حجز موعد';
  try { await ready; } catch (e) { console.warn('rebook: types load', e); }
  var sel = document.getElementById('aType');
  var t = ppApptTreatment(a);
  if (sel) {
    var want = t ? t.id : (a.type ? '_other' : '');
    if (want) { sel.value = want; if (sel.value !== want) sel.selectedIndex = 0; }
  }
  var durSel = document.getElementById('aDur');
  if (durSel && a.duration) {
    var dv = String(parseInt(a.duration, 10) || 60);
    durSel.value = dv;
    if (durSel.value !== dv) {
      var opt = document.createElement('option');
      opt.value = dv; opt.textContent = dv + ' دقيقة';
      durSel.appendChild(opt);
      durSel.value = dv;
    }
  }
  if (a.provider_id) {
    setupApptProviderPicker(a.provider_id);
    var pSel = document.getElementById('aProvider');
    if (pSel && pSel.value !== a.provider_id) setupApptProviderPicker(null);   /* طبيبٌ معطَّل ⇒ الافتراضي */
  }
  showToast('📅 موعد جديد — اختر التاريخ والوقت ثم احفظ');
  var dEl = document.getElementById('aDate');
  if (dEl) { try { dEl.focus(); } catch (e) {} }
}

/* Open Dental: مراجعةُ مواعيد المريض لحظةَ حجز موعدٍ جديد (تمنع الحجز المكرّر
   وتنبّه لتكرار الغياب). show=false ⇒ إخفاء (مسارات التعديل/الجدولة). */
function ppApptCtxNote(show) {
  var el = document.getElementById('aPatApptsNote');
  if (!el) return;
  el.textContent = '';
  el.className = 'appt-ctx-note';
  if (show === false) { el.style.display = 'none'; return; }
  var today = (typeof toDay === 'function') ? toDay() : '';
  var g = ppApptGroups(Array.isArray(allAppointmentsForTl) ? allAppointmentsForTl : [], today);
  var lines = [];
  if (g.upcoming.length) {
    var n = g.upcoming[0];
    var s = 'للمريض موعدٌ قادم: ' + ppApptLongDate(n.date) + (n.time ? ' ' + ppApptTime(n.time) : '') + (n.type ? ' — ' + n.type : '');
    if (g.upcoming.length > 1) s += ' — وبعده ' + ppArUnit(g.upcoming.length - 1, 'موعدٌ آخر', 'موعدان آخران', 'مواعيد أخرى', 'موعداً آخر');
    lines.push(s);
  }
  if (g.planned.length) lines.push('مواعيد مخطّطة بانتظار الجدولة: ' + g.planned.length);
  if (g.missed.length) lines.push((g.missed.length >= 2 ? '⚠️ ' : '') + 'عدم حضور سابق: ' + g.missed.length);
  if (!lines.length) { el.style.display = 'none'; return; }
  if (g.missed.length >= 2) el.className = 'appt-ctx-note appt-ctx-red';
  lines.forEach(function(l){
    var d = document.createElement('div');
    d.textContent = l;
    el.appendChild(d);
  });
  el.style.display = '';
}

/* ═══════════════════════════════════════════════════════════════
   v338 — أزرارُ الحضور بتبويب المواعيد (🚪 وصل ← 🪑 جلس ← ✅ خرج)
   مرآةُ لوحة التحكم (بلا 📞 تأكيد) بدلالات صفحة المواعيد: مراحلُ الحضور
   **بيوم الموعد وحده** (بوابة اليوم — PRESENCE_STAGE_KEYS)، لا لمنتهٍ ولا
   لمخطّط. «خرج» على موعدٍ عليه علاجاتٌ مخطّطة أو طلباتُ مخبرٍ قيد التسليم
   يُحال إلى نافذة الإكمال الموحّدة بصفحة المواعيد (?dismiss=) — الإكمالُ
   يكتب بالمال (قلبُ الجلسات · الطبيب · المخابر · FIFO) وله بابٌ واحد (#561).
   الكتابةُ الوحيدة بالتبويب: ختمٌ واحد محصورٌ بالموعد والعيادة. تصحيحُ
   الختم الخاطئ بصفحة المواعيد (نقرتان على الختم) — لا بابَ تصحيحٍ ثانٍ.
   ═══════════════════════════════════════════════════════════════ */
var PP_APPT_STAGES = [
  { key: 'arrived_at',   label: '🚪 وصل', color: 'var(--yellow)', tone: 'yellow' },
  { key: 'seated_at',    label: '🪑 جلس', color: 'var(--orange)', tone: 'orange' },
  { key: 'dismissed_at', label: '✅ خرج', color: 'var(--green)',  tone: 'green'  }
];
var PP_APPT_LIVE_LAB = { sent: true, received: true, checked: true };   /* مرآةُ autoDeliverLinkedLabs */

function ppApptNextStage(a, today) {
  if (!a || a.is_planned === true || !a.date) return null;
  if (String(a.date).slice(0, 10) !== today) return null;          /* بوابة اليوم */
  var st = a.status || '';
  if (st === 'completed' || st === 'cancelled' || st === 'broken' || st === 'no_show') return null;
  if (a.dismissed_at) return null;
  for (var i = 0; i < PP_APPT_STAGES.length; i++) {
    if (!a[PP_APPT_STAGES[i].key]) return PP_APPT_STAGES[i];
  }
  return null;
}

function ppApptStageBtnHtml(a, today) {
  var stg = ppApptNextStage(a, today);
  if (!stg) return '';
  return '<button type="button" class="appt-btn appt-btn-stage tone tone-' + stg.tone + '" style="--bc:' + stg.color + ';" data-appt-act="stage" data-id="'
    + escapeHtml(a.id) + '" data-stage="' + stg.key + '">' + stg.label + '</button>';
}

/* ما يجعل «خرج» يمرّ بنافذة الإكمال: جلساتٌ مخطّطة مربوطة أو مخابرُ قيد التسليم. */
function ppApptDismissLoad(apptId) {
  var planned = (Array.isArray(sessions) ? sessions : []).filter(function(x){
    return x && x.appointment_id === apptId && x.status === 'planned';
  });
  var labs = (Array.isArray(labOrders) ? labOrders : []).filter(function(o){
    return o && o.appointment_id === apptId && PP_APPT_LIVE_LAB[o.status] === true;
  });
  return { planned: planned, labs: labs };
}

var ppApptStamp = ppGuarded('ppApptStamp', _ppApptStamp_inner, '⏳');
async function _ppApptStamp_inner(apptId, fieldKey) {
  var allowed = ['arrived_at', 'seated_at', 'dismissed_at'];
  if (allowed.indexOf(fieldKey) === -1) return false;
  var a = ppApptFind(apptId);
  if (!a) { showToast('⚠️ الموعد غير موجود — ربما حُذف'); return false; }
  var today = (typeof toDay === 'function') ? toDay() : '';
  var stg = ppApptNextStage(a, today);
  if (!stg || stg.key !== fieldKey) {           /* واجهةٌ متقادمة (تبويبٌ آخر · منتصف الليل) */
    showToast('⚠️ تغيّرت حالة الموعد — حُدّث التبويب');
    renderApptsTab();
    return false;
  }

  if (fieldKey === 'dismissed_at') {
    var load = ppApptDismissLoad(apptId);
    if (load.planned.length || load.labs.length) {
      var parts = [];
      if (load.planned.length) parts.push(load.planned.length === 1 ? 'علاجٌ مخطّط واحد' : (load.planned.length + ' علاجات مخطّطة'));
      if (load.labs.length) parts.push(load.labs.length === 1 ? 'طلبُ مخبرٍ قيد التسليم' : (load.labs.length + ' طلبات مخبر قيد التسليم'));
      var msg = 'لهذا الموعد ' + parts.join(' و') + '.\n\n'
        + 'موافق ← الانتقال لنافذة الإكمال بصفحة المواعيد (تحديد ما أُنجز، أو الخروج بلا إكمال)\n'
        + 'إلغاء ← عودة بلا تسجيل';
      if (!await SyDialog.confirm({ message: msg, danger: false })) return false;
      window.location.href = 'appointments.html?dismiss=' + encodeURIComponent(apptId);
      return true;
    }
  }

  var patch = {};
  patch[fieldKey] = new Date().toISOString();
  try {
    var res = await window.sb.from('appointments').update(patch)
      .eq('id', apptId).eq('doctor_id', currentUser.id).select('id');
    if (res && res.error) {
      console.warn('ppApptStamp:', res.error);
      showToast('❌ تعذّر تسجيل «' + stg.label + '» — تحقّق من الاتصال وأعد المحاولة', true);
      return false;
    }
    /* تحديثٌ بلا صفوف لا يُرجع خطأً (موعدٌ حُذف بتبويبٍ آخر) — درس v334 */
    if (!res || !Array.isArray(res.data) || res.data.length !== 1) {
      showToast('❌ لم يُسجَّل «' + stg.label + '» — الموعد لم يعد موجوداً، أعد تحميل الصفحة', true);
      return false;
    }
  } catch (e) {
    console.warn('ppApptStamp failed:', e);
    showToast('❌ تعذّر تسجيل «' + stg.label + '» — تحقّق من الاتصال وأعد المحاولة', true);
    return false;
  }

  a[fieldKey] = patch[fieldKey];
  /* قائمةُ الربط (v331 sessApptIsLive: موعدُ اليوم المختوم = الجلسةُ الحرّة منجزة) */
  (Array.isArray(upcomingAppts) ? upcomingAppts : []).forEach(function(u){ if (u.id === apptId) u[fieldKey] = patch[fieldKey]; });
  renderApptsTab();
  var offline = !!(window.navigator && window.navigator.onLine === false);
  var t = new Date(patch[fieldKey]);
  var hm = (t.getHours() < 10 ? '0' : '') + t.getHours() + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes();
  showToast(stg.label + ((patient && patient.name) ? ' — ' + patient.name : '') + ' · ' + ppApptTime(hm)
    + (offline ? ' (بلا اتصال — يُرفع عند العودة)' : ''));
  return true;
}
