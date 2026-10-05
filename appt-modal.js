/* SyDent — appt-modal.js: منتقيات مودال الموعد + قسم العلاجات + fp-suggest — استخراج appointments ٦.
 * نُقل بايت-بايت. صفر كود تنفيذي وقت التحليل. globals وقت التشغيل: clinicDoctors ·
 * operatoriesCache · patientsCache · appointments · escapeHtml · medFlagLabels/allergyFlagLabels
 * (جيب المرايا inline) · editingId · openModal/editAppt/submitAppt/commitPendingAttachmentsA (inline). */

/* Build the provider <select>. Visible only if >= 1 clinic doctor exists. */
async function populateApptProviderPicker(preselectId) {
  await loadClinicDoctors();
  var group = document.getElementById('fProviderGroup');
  var sel = document.getElementById('fProvider');
  if (!sel || !group) return;
  // Phase 6 X: Filter the appointment picker to clinical providers only.
  // Secretary + 'other' employees have clinic_doctors rows for payroll, but
  // they don't take patient appointments — so they shouldn't appear in this
  // dropdown. Includes: doctor, hygienist, assistant (chair-side assistant
  // does sometimes get assigned to an appointment as the helping provider).
  // Legacy rows (no provider_type) default to 'doctor' so they remain visible.
  var clinicalOnly = CLINIC_DOCTORS.filter(function(d){
    var pt = d.provider_type || 'doctor';
    return pt === 'doctor' || pt === 'hygienist' || pt === 'assistant';
  });
  if (!clinicalOnly.length) {
    group.style.display = 'none';
    sel.innerHTML = '';
    return;
  }
  group.style.display = 'block';
  sel.innerHTML = '';
  // Active first, then inactive
  var active = clinicalOnly.filter(function(d){ return d.is_active !== false; });
  var inactive = clinicalOnly.filter(function(d){ return d.is_active === false; });
  var ordered = active.concat(inactive);
  ordered.forEach(function(d){
    var opt = document.createElement('option');
    opt.value = d.id;
    var prefix = '';
    if (d.user_id === (currentUser && currentUser.id)) prefix = '🔗 ';
    else if (d.is_owner) prefix = '⭐ ';
    // Phase 6 R/X: provider_type visual indicator. Layered AFTER the existing
    // prefix so the user-linked + owner badges still take precedence on the
    // owner's own row. For hygienist/assistant rows the linked/owner prefixes
    // are usually absent, so the type emoji sits at the start and the
    // dropdown reads cleanly.
    var typeIcon = '';
    if (d.provider_type === 'hygienist') typeIcon = '🩺 ';
    else if (d.provider_type === 'assistant') typeIcon = '🤝 ';
    opt.textContent = prefix + typeIcon + d.name + (d.is_active === false ? ' (غير نشط)' : '');
    sel.appendChild(opt);
  });
  // Preselect: explicit id if provided, else default
  var pick = preselectId || getDefaultProviderId(CLINIC_DOCTORS);
  if (pick) sel.value = pick;
}

/* Phase 6 K (Migration 12): Build the operatory <select>. Soft mode — the
   group is hidden entirely when no active operatories exist (Single-chair
   clinics). When editing an appointment already linked to an INACTIVE
   operatory, we inject a ghost option and force-show the group so the user
   can clear or change the stale link without silently dropping it. */
function populateOperatoryPicker(preselectId) {
  var group = document.getElementById('fOperatoryGroup');
  var sel = document.getElementById('fOperatory');
  if (!sel || !group) return;
  sel.innerHTML = '<option value="">— بدون تخصيص —</option>';

  // Build the active list first
  for (var i = 0; i < OPERATORIES.length; i++) {
    var op = OPERATORIES[i];
    var opt = document.createElement('option');
    opt.value = op.id;
    opt.textContent = op.name;
    sel.appendChild(opt);
  }

  // If preselectId points to an inactive operatory, inject a ghost option
  // so we can keep the link visible (and the user can clear it intentionally).
  var preselectInActive = false;
  if (preselectId) {
    for (var j = 0; j < sel.options.length; j++) {
      if (sel.options[j].value === preselectId) { preselectInActive = true; break; }
    }
    if (!preselectInActive) {
      // Look up the full record to display the name; fall back to a generic
      // placeholder if even OPERATORIES_ALL doesn't have it (deleted FK).
      var ghost = document.createElement('option');
      ghost.value = preselectId;
      var found = null;
      for (var k = 0; k < OPERATORIES_ALL.length; k++) {
        if (OPERATORIES_ALL[k].id === preselectId) { found = OPERATORIES_ALL[k]; break; }
      }
      ghost.textContent = found
        ? ((found.name || '[غرفة]') + (found.is_active ? '' : ' (غير نشطة)'))
        : '[غرفة محذوفة]';
      sel.appendChild(ghost);
    }
  }

  // Visibility: show the picker if there are active operatories OR a
  // preselect that we just had to ghost-restore. Otherwise hide entirely.
  var shouldShow = (OPERATORIES.length > 0) || !!preselectId;
  group.style.display = shouldShow ? 'block' : 'none';

  sel.value = preselectId || '';
}

// Phase 6 K bug-fix: when the user picks an operatory from the dropdown,
// auto-sync the provider picker to the operatory's default_provider_id.
// Behavior choice (Option B — always replace): the user picked the chair
// deliberately, so the chair's default doctor wins over whatever was in
// the provider picker before. This mirrors how applyTemplate handles the
// template > operatory provider chain.
//
// Safety guards:
//   • Empty operatory ("— بدون تخصيص —") → leave provider untouched
//     (user is clearing the chair, not declaring a doctor preference)
//   • Operatory has no default_provider_id → leave provider untouched
//   • Provider option not in dropdown (deactivated/missing) → no-op
//     (the picker shouldn't suddenly point to a doctor it can't render)
function onOperatoryChange() {
  var opSel = document.getElementById('fOperatory');
  var provSel = document.getElementById('fProvider');
  if (!opSel || !provSel) return;
  var opId = opSel.value;
  if (!opId) return;  // cleared — keep current provider
  // Look up the chosen operatory in the full list (active or ghost).
  var op = null;
  for (var i = 0; i < OPERATORIES_ALL.length; i++) {
    if (OPERATORIES_ALL[i].id === opId) { op = OPERATORIES_ALL[i]; break; }
  }
  if (!op || !op.default_provider_id) return;  // no default doctor
  // Verify the target provider exists as an <option> before assignment.
  var hasOpt = false;
  for (var j = 0; j < provSel.options.length; j++) {
    if (provSel.options[j].value === op.default_provider_id) { hasOpt = true; break; }
  }
  if (hasOpt) provSel.value = op.default_provider_id;
}

// Chair↔Doctor sync (reverse direction): doctor changed → auto-fill the
// operatory ONLY when the doctor maps to exactly one ACTIVE operatory via
// operatories.default_provider_id (ambiguous 0/2+ matches → no-op, we never
// guess). Soft default: the user can re-pick the operatory afterwards.
// Programmatic .value assignments don't fire onchange, so this cannot
// ping-pong with onOperatoryChange.
function onApptProviderChange() {
  var opSel = document.getElementById('fOperatory');
  var provSel = document.getElementById('fProvider');
  if (!opSel || !provSel) return;
  var provId = provSel.value;
  if (!provId) return;  // cleared — keep current operatory
  var matches = [];
  for (var i = 0; i < OPERATORIES_ALL.length; i++) {
    if (OPERATORIES_ALL[i].is_active
        && OPERATORIES_ALL[i].default_provider_id === provId) {
      matches.push(OPERATORIES_ALL[i]);
    }
  }
  if (matches.length !== 1) return;
  // Verify the target operatory exists as an <option> before assignment.
  var hasOpOpt = false;
  for (var j = 0; j < opSel.options.length; j++) {
    if (opSel.options[j].value === matches[0].id) { hasOpOpt = true; break; }
  }
  if (hasOpOpt) opSel.value = matches[0].id;
}

/* Render attached procedures + the dropdown of planned procedures available to attach. */
function renderApptProcedures(appt) {
  // Workflow B: in 'create' mode this function is bypassed — the pending
  // buffer drives the list. Calling renderApptProcedures from editAppt is
  // explicit and only runs in 'active' mode. Guard defensively in case
  // some external caller forgets to switch mode first.
  if (_appProcModeA === 'create') {
    renderPendingPP_A();
    return;
  }
  var listEl = document.getElementById('apptProcList');
  var statsEl = document.getElementById('apptProcStats');
  var selEl = document.getElementById('addPlannedSelect');
  var completeBtn = document.getElementById('completeApptBtn');
  var addBtn = document.getElementById('addPlannedBtn');
  if (!listEl || !selEl) return;

  var attached = sessionsByAppt[appt.id] || [];
  if (attached.length) {
    var html = '';
    attached.forEach(function(s){
      var statusBadge = '';
      if (s.status === 'planned') statusBadge = '<span class="cbadge tone tone-red" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">مخطّط</span>';
      else if (s.status === 'completed') statusBadge = '<span class="cbadge tone tone-blue" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">منجز</span>';
      else statusBadge = '<span style="background:rgba(255,255,255,0.06);color:var(--text2);padding:2px 8px;border-radius:10px;font-size:11px;">' + (s.status||'—') + '</span>';
      var toothPart = s.tooth_num ? ' • السن ' + s.tooth_num + (s.surface && s.surface !== 'WHOLE' ? '/' + s.surface : '') : '';
      // Phase 3 Feature G: show regional area inline (matches the description field)
      if (!s.tooth_num) {
        var QLBL = {'UR':'الربع العلوي الأيمن','UL':'الربع العلوي الأيسر','LL':'الربع السفلي الأيسر','LR':'الربع السفلي الأيمن'};
        var ALBL = {'U':'الفك العلوي','L':'الفك السفلي'};
        if (s.quadrant && QLBL[s.quadrant]) toothPart = ' • ' + QLBL[s.quadrant];
        else if (s.arch && ALBL[s.arch]) toothPart = ' • ' + ALBL[s.arch];
      }
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:140px;font-size:13px;color:var(--text);">' + escapeHtml(s.type || s.description || 'علاج') + toothPart + '</div>'
        + '<div style="font-size:12px;color:var(--text2);">' + fmtCost(s.cost) + ' ' + _apptCurLblOf(s.currency) + '</div>'
        + statusBadge
        + '<button type="button" data-sub-write onclick="unlinkSessionFromAppt(\'' + s.id + '\')" style="background:transparent;border:1px solid var(--red-bd);color:var(--red);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px;" title="فصل عن الموعد">✕</button>'
        + '</div>';
    });
    listEl.innerHTML = html;
    var totalC = SyDentCurBag.make();
    attached.forEach(function(x){ totalC[_rowCur(x)] += parseFloat(x.cost) || 0; });
    var plannedC = attached.filter(function(x){ return x.status === 'planned'; }).length;
    var completedC = attached.filter(function(x){ return x.status === 'completed'; }).length;
    statsEl.textContent = attached.length + ' علاج • ' + SyDentCurBag.text(totalC, fmtCost) + ' • مخطّط ' + plannedC + ' / منجز ' + completedC;
    completeBtn.style.display = (plannedC > 0 && !(appt && appt.is_planned === true)) ? 'block' : 'none';   /* v410: لا إنجاز لزيارةٍ بلا تاريخ */
  } else {
    listEl.innerHTML = '<div style="padding:8px;color:var(--text2);font-size:12px;text-align:center;">لا توجد علاجات مرتبطة بهذا الموعد بعد</div>';
    statsEl.textContent = '';
    completeBtn.style.display = 'none';
  }

  // Planned sessions dropdown (unattached, same patient)
  // Phase 6 L bugfix: legacy appointments saved before patient_id became
  // standard have patient_id=null but a valid patient_name. Backfill from
  // the in-memory cache so the planned-procedure picker works on them too.
  // No DB write here — just the in-memory resolution. The next save of this
  // appointment will persist patient_id (the main save flow already resolves
  // by name when patient_id is null).
  var pid = appt.patient_id;
  if (!pid && appt.patient_name) {
    var cached = patientsCache['__name__' + appt.patient_name];
    if (cached && cached.id) pid = cached.id;
  }
  var planned = pid ? (plannedSessionsByPatient[pid] || []) : [];
  selEl.innerHTML = '';
  if (!pid) {
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— لم يتم العثور على مريض مرتبط بهذا الموعد —';
    selEl.appendChild(opt);
    addBtn.disabled = true;
    addBtn.style.opacity = '0.4';
    return;
  }
  if (!planned.length) {
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— لا توجد علاجات مخطّطة غير مرتبطة لهذا المريض —';
    selEl.appendChild(opt0);
    apptAltHintOption(selEl, pid);
    addBtn.disabled = true;
    addBtn.style.opacity = '0.4';
    return;
  }
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— اختر علاجاً مخطّطاً —';
  selEl.appendChild(placeholder);
  planned.forEach(function(s){
    // Phase 3 Feature G: dropdown for attaching planned procedures to an appointment
    // — show region info instead of tooth number for regional sessions
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
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = (s.type || s.description || 'علاج') + toothPart + ' — ' + fmtCost(s.cost) + ' ' + _apptCurLblOf(s.currency);
    selEl.appendChild(opt);
  });
  apptAltHintOption(selEl, pid);
  addBtn.disabled = false;
  addBtn.style.opacity = '1';
}

/* Render lab orders linked to the currently-edited appointment (read-only). */
function renderApptLabOrders(appt) {
  var section = document.getElementById('apptLabSection');
  var listEl  = document.getElementById('apptLabList');
  if (!section || !listEl) return;
  var orders = (appt && appt.id) ? (labOrdersByAppt[appt.id] || []) : [];
  if (!orders.length) {
    section.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }
  section.style.display = 'block';
  var apptDate = appt.date ? String(appt.date).slice(0,10) : '';
  var html = '';
  orders.forEach(function(o){
    var statusAr  = '—';
    var statusBg  = 'rgba(255,255,255,0.06)';
    var statusCol = 'var(--text2)';
    if (o.status === 'sent')     { statusAr = 'تم التسليم للمخبر';    statusBg = 'rgba(var(--blue-rgb),0.15)';  statusCol = 'var(--blue)'; }
    else if (o.status === 'received')  { statusAr = 'تم الاستلام من المخبر'; statusBg = 'rgba(var(--yellow-rgb),0.15)';  statusCol = 'var(--yellow)'; }
    else if (o.status === 'checked')   { statusAr = 'تم الفحص';              statusBg = 'rgba(var(--green-rgb),0.15)';  statusCol = 'var(--green)'; }
    else if (o.status === 'redo')      { statusAr = 'إعادة';                 statusBg = 'rgba(var(--orange-rgb),0.15)';  statusCol = 'var(--orange)'; }

    // Late tag only applies when work hasn't physically arrived yet (status='sent').
    // Once received/checked, the lab work is at the clinic — no point warning "late".
    // Direct-linked orders without an explicit date_due become late once the
    // appointment day has arrived (the user tied this work to that visit).
    // Use local-time dateStr so the "today" boundary matches the user's clock.
    var atRisk = (o.status === 'sent');
    var todayStr = dateStr(new Date());
    var late;
    if (!atRisk) {
      late = false;
    } else if (o.date_due) {
      late = (apptDate && o.date_due.slice(0,10) <= apptDate);
    } else {
      // Direct-linked (this list is always direct) without explicit due → late once appt day arrives.
      late = (apptDate && apptDate <= todayStr);
    }
    var lateTag = late ? '<span style="background:rgba(var(--red-rgb),0.15);color:var(--red);border:1px solid rgba(var(--red-rgb),0.4);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">⚠️ متأخر</span>' : '';

    var toothPart = o.tooth_num ? ' • السن ' + o.tooth_num : '';
    var dueDate   = o.date_due ? (SyDT.numDate(o.date_due) || '—') : '—';   // v487
    var labLabel  = o.lab_name || '—';

    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:160px;font-size:13px;color:var(--text);">' + escapeHtml(o.work_type || 'طلب مخبر') + toothPart + '</div>'
      + '<div style="font-size:11px;color:var(--text2);">المخبر: ' + escapeHtml(labLabel) + '</div>'
      + '<div style="font-size:11px;color:var(--text2);">استحقاق: ' + dueDate + '</div>'
      + lateTag
      + '<span style="background:' + statusBg + ';color:' + statusCol + ';padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">' + statusAr + '</span>'
      + '</div>';
  });
  listEl.innerHTML = html;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Workflow B — "علاجات هذا الموعد" section. Same three-mode model as
   patient-profile.html, but routed through this file's caches:
     • create  → uses local _pendingAttachmentsA buffer (no DB writes)
     • active  → live DB writes via attachPlannedToAppt (existing function)
     • hidden  → planned appointments

   Naming convention: the patient-profile copy suffixes everything with PP;
   this file uses A (appointments). The two are never loaded together so
   the suffix is more cosmetic than necessary, but it keeps grep clean.
   ───────────────────────────────────────────────────────────────────────── */

// Pending buffer for create mode. Each entry is a full session row.
var _pendingAttachmentsA = [];
var _appProcModeA = 'hidden';
// R7 fix: track the patient_id that the current pending buffer was built
// for. When fPatient changes to a different resolved id, the pending list
// belongs to the previous patient and MUST be cleared — otherwise we'd
// link one patient's sessions to another patient's appointment, corrupting
// data integrity. null = no patient yet OR buffer is empty.
var _pendingPatientIdA = null;

/* Mode switcher. Toggles section visibility + adjusts the add-button label
   + mode hint. The actual list paint happens in renderPendingPP_A (create)
   or renderApptProcedures (active). */
function setApptProcSectionModeA(mode) {
  _appProcModeA = mode;
  var sec  = document.getElementById('apptProcSection');
  var hint = document.getElementById('apptProcModeHint');
  var btn  = document.getElementById('addPlannedBtn');
  var complBtn = document.getElementById('completeApptBtn');
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
  // In create mode, hide the "Set Complete" button — there's no DB row yet.
  if (complBtn && mode === 'create') complBtn.style.display = 'none';
  if (mode === 'create') {
    renderPendingPP_A();
  }
  // 'active' is painted by renderApptProcedures when editAppt calls it.
}

/* Resolve the patient_id from the fPatient input, using the same lookup
   logic that submitAppt eventually applies. Used by the picker to decide
   which planned sessions to offer. Returns null if no match. */
function resolveCurrentPatientIdA() {
  var input = document.getElementById('fPatient');
  if (!input) return null;
  var name = (input.value || '').trim();
  if (!name) return null;
  var cached = patientsCache['__name__' + name];
  if (cached && cached.id) return cached.id;
  // Fallback: scan loaded patients list for exact name match.
  for (var key in patientsCache) {
    var p = patientsCache[key];
    if (p && p.name === name && p.id) return p.id;
  }
  return null;
}

/* Populate the picker. Filters by resolveCurrentPatientIdA + plannedSessionsByPatient,
   minus any session ids already in _pendingAttachmentsA (create mode). */
/* v412: سطرُ توضيحٍ معطَّل بذيل المنتقي حين للمريض بنودٌ بخيارات خطةٍ غير معتمدة —
   القاعدة «لا يُجدوَل إلا المعتمد»، والاعتمادُ من بطاقة المريض (تبويب الجلسات). */
function apptAltHintOption(selEl, pid) {
  var n = (typeof altPlannedCountByPatient !== 'undefined' && pid) ? (altPlannedCountByPatient[pid] || 0) : 0;
  if (!n || !selEl) return;
  var o = document.createElement('option');
  o.value = ''; o.disabled = true;
  o.textContent = '🔀 ' + n + ' بند بخيارات غير معتمدة — اعتمد الخيار من بطاقة المريض أولاً';
  selEl.appendChild(o);
}
function populateAddPlannedSelectA() {
  var selEl = document.getElementById('addPlannedSelect');
  var addBtn = document.getElementById('addPlannedBtn');
  if (!selEl) return;
  selEl.innerHTML = '';

  var pid = resolveCurrentPatientIdA();
  if (!pid) {
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— اكتب اسم المريض أولاً —';
    selEl.appendChild(opt);
    if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
    return;
  }
  var planned = (plannedSessionsByPatient[pid] || []).slice();
  if (_appProcModeA === 'create') {
    var pendingIds = {};
    _pendingAttachmentsA.forEach(function(p){ pendingIds[p.id] = true; });
    planned = planned.filter(function(s){ return !pendingIds[s.id]; });
  }
  if (!planned.length) {
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— لا توجد علاجات مخطّطة متاحة لهذا المريض —';
    selEl.appendChild(opt0);
    apptAltHintOption(selEl, pid);
    if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
    return;
  }
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— اختر علاجاً مخطّطاً —';
  selEl.appendChild(placeholder);
  planned.forEach(function(s){
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
    var opt2 = document.createElement('option');
    opt2.value = s.id;
    opt2.textContent = (s.type || s.description || 'علاج') + toothPart + ' — ' + fmtCost(s.cost) + ' ' + _apptCurLblOf(s.currency);
    selEl.appendChild(opt2);
  });
  apptAltHintOption(selEl, pid);
  if (addBtn) { addBtn.disabled = false; addBtn.style.opacity = '1'; }
}

/* Paint the pending list (create mode). Same row structure as
   renderApptProcedures' attached list but with a "سيُربط" badge and a
   ✕ button that removes from _pendingAttachmentsA only (no DB). */
function renderPendingPP_A() {
  var listEl  = document.getElementById('apptProcList');
  var statsEl = document.getElementById('apptProcStats');
  if (!listEl) return;
  var items = _pendingAttachmentsA;
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
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(var(--green-rgb),0.05);border-radius:8px;border:1px solid rgba(var(--green-rgb),0.2);flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:140px;font-size:13px;color:var(--text);">' + escapeHtml(s.type || s.description || 'علاج') + toothPart + '</div>'
        + '<div style="font-size:12px;color:var(--text2);">' + fmtCost(s.cost) + ' ' + _apptCurLblOf(s.currency) + '</div>'
        + '<span class="cbadge tone tone-orange" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">سيُربط</span>'
        + '<button type="button" onclick="removePendingA(\'' + s.id + '\')" style="background:transparent;border:1px solid var(--red-bd);color:var(--red);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px;" title="إزالة من القائمة">✕</button>'
        + '</div>';
    });
    listEl.innerHTML = html;
    var totalC = SyDentCurBag.make();
    items.forEach(function(x){ totalC[_rowCur(x)] += parseFloat(x.cost) || 0; });
    if (statsEl) statsEl.textContent = items.length + ' علاج سيُربط • ' + SyDentCurBag.text(totalC, fmtCost);
  }
  populateAddPlannedSelectA();
}

/* Unified add-button click handler. */
function onAddPlannedClickA() {
  if (_appProcModeA === 'create') {
    addToPendingA();
  } else if (_appProcModeA === 'active') {
    attachPlannedToAppt();
  }
}

function addToPendingA() {
  var sel = document.getElementById('addPlannedSelect');
  var sessId = sel ? sel.value : '';
  if (!sessId) { showToast('⚠️ اختر علاجاً'); return; }
  var pid = resolveCurrentPatientIdA();
  if (!pid) { showToast('⚠️ اكتب اسم المريض أولاً'); return; }
  var pool = plannedSessionsByPatient[pid] || [];
  var row = pool.find(function(x){ return x.id === sessId; });
  if (!row) { showToast('⚠️ العلاج غير موجود — أعد فتح المودال'); return; }
  for (var i = 0; i < _pendingAttachmentsA.length; i++) {
    if (_pendingAttachmentsA[i].id === sessId) return;
  }
  _pendingAttachmentsA.push(row);
  _pendingPatientIdA = pid;  // mark this buffer as belonging to this patient
  renderPendingPP_A();
}

function removePendingA(sessId) {
  _pendingAttachmentsA = _pendingAttachmentsA.filter(function(p){ return p.id !== sessId; });
  renderPendingPP_A();
}

function clearPendingA() {
  _pendingAttachmentsA = [];
  _pendingPatientIdA = null;
}

/* Called by fPatient oninput/onchange. Refreshes the picker so it reflects
   the newly-typed patient. Only meaningful in create mode (the picker is
   tied to the patient name there); active mode uses an already-known appt.

   R7 fix: when the user switches to a DIFFERENT resolved patient mid-flow,
   the pending buffer (which holds sessions for the previous patient) must
   be cleared. Otherwise we'd link one patient's sessions to another
   patient's appointment, corrupting data integrity. The check uses the
   resolved patient_id — partial typing (e.g. "أحمد" while completing the
   surname) doesn't trigger a clear because resolveCurrentPatientIdA
   returns null for unmatched names. */
/* ── اقتراحات اسم المريض المخصصة (بديل datalist لأجل iOS) ─────────────────
   تطبيع عربي خفيف للبحث فقط: أ/إ/آ→ا · ة→ه · ى→ي · حذف التطويل وضغط
   المسافات — فـ"احمد" تجد "أحمد". الاختيار يكتب الاسم المسجّل حرفياً،
   فيبقى ربط patient_id (مطابقة الاسم الحرفية عند الحفظ) بلا أي تغيير. */
let _fpNames = [];
let _fpActive = -1;
function fpFold(s) {
  return String(s || '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ـ/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function fpMatches() {
  var raw = document.getElementById('fPatient').value;
  var q = fpFold(raw);
  /* حقل فارغ + تركيز = القائمة كاملة (سلوك datalist السابق) — قابلة
     للتمرير؛ سقف أمان 400 صف ضد DOM مرضي فقط */
  if (!q) return _fpNames.slice(0, 400);
  var out = [];
  for (var i = 0; i < _fpNames.length; i++) {
    var n = _fpNames[i];
    if (n && fpFold(n).indexOf(q) !== -1) {
      out.push(n);
      if (out.length >= 400) break;
    }
  }
  /* مطابقة حرفية وحيدة = الاسم مكتمل، لا داعي لاقتراح يطابق المكتوب */
  if (out.length === 1 && out[0] === raw.trim()) return [];
  return out;
}
function fpSuggestRender() {
  var box = document.getElementById('fpSuggest');
  if (!box) return;
  var list = fpMatches();
  _fpActive = -1;
  if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.innerHTML = list.map(function (n, i) {
    return '<div class="fp-item" role="option" data-i="' + i + '" ' +
           'onpointerdown="event.preventDefault();fpSuggestPick(this.textContent)">' +
           escapeHtml(n) + '</div>';
  }).join('');
  box.style.display = 'block';
}
/* M87: تحذير طبي تحت حقل المريض — الحلّ بالـpatient_id أولاً (تعديل موعد قائم:
   الاسم قد يخالف المسجَّل حرفياً) ثم fallback الاسم المسجَّل (كتابة/اقتراح).
   textContent حصراً + التسميات ثوابت + الحساسية موسومة منفصلة = صفر سطح XSS. */
/* M87: شارة تحذير طبي على بطاقة الموعد بالجدول — الحلّ بالـpatient_id ثم الاسم.
   التسميات ثوابت + escapeHtml على النص الحر = صفر سطح XSS. */
/* Backlog #5: شارة ⚡ قائمة الانتظار — ثوابت فقط، صفر XSS */
function getApptAsapBadge(e) {
  if (!e || !e.asap) return '';
  if (WAITLIST_DONE_STATUSES[e.status]) return '';
  return '<span class="tone tone-orange" style="display:inline-block;border-width:1px;border-style:solid;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;margin-right:6px;" title="يرغب بموعد أبكر — بقائمة الانتظار">⚡ انتظار</span>';
}
/* v417 (M148): أعلام المريض الإدارية الملوّنة على بطاقة الموعد — نفس حلّ السجل (id ثم الاسم)
   المستعمل بشارة التحذير. الرسم والهروب بـSyDentFlags.chipsHtml (مصدر واحد). */
function getApptPtFlags(e) {
  if (!window.SyDentFlags || !window.APPT_FLAG_DEFS) return '';
  var rec = (e && e.patient_id && patientsCache[e.patient_id]) ? patientsCache[e.patient_id] : null;
  if (!rec && e && e.patient_name) rec = patientsCache['__name__' + e.patient_name] || null;
  if (!rec || !rec.flags) return '';
  return window.SyDentFlags.chipsHtml(rec.flags, window.APPT_FLAG_DEFS, 'pt-flag-sm');
}
/* v497: مؤشّرُ التزام المريض — يُحسب مرةً من مصفوفة `appointments` المحمّلة (يُعاد عند كل loadAppointments
   لأنها مصفوفةٌ جديدة) عبر المصدر الواحد SyDentReliability (pt-reliability.js). صفر استعلام إضافي. */
var _reliabCache = { src: null, map: {} };
function getApptReliabStats(pid) {
  if (!window.SyDentReliability || !pid) return null;
  if (_reliabCache.src !== appointments) { _reliabCache.src = appointments; _reliabCache.map = window.SyDentReliability.compute(appointments); }
  return _reliabCache.map[pid] || null;
}
function _apptReliabPid(e) {
  if (!e) return null;
  if (e.patient_id) return e.patient_id;
  var rec = e.patient_name ? patientsCache['__name__' + e.patient_name] : null;
  return rec && rec.id ? rec.id : null;
}
function getApptReliabBadge(e, small) {
  var s = getApptReliabStats(_apptReliabPid(e));
  return s ? window.SyDentReliability.badgeHtml(s, !!small) : '';
}
/* ── v505 (M157): التكرار بنافذة الموعد — عرضٌ فقط؛ الإنشاءُ بـsubmitAppt عبر SyDentSeries ── */
function apptRepeatReset(isNew, a) {
  var g = document.getElementById('fRepeatGroup'), sg = document.getElementById('fSeriesGroup');
  var sel = document.getElementById('fRepeat'), cnt = document.getElementById('fRepeatCount');
  if (sel) sel.value = 'none';
  if (cnt) cnt.value = '6';
  if (g) g.style.display = (isNew && window.SyDentSeries) ? '' : 'none';
  apptRepeatHint();
  if (sg) {
    var has = !!(a && a.series_id && a.series_index);
    sg.style.display = has ? '' : 'none';
    if (has) {
      document.getElementById('fSeriesInfo').textContent = '🔁 موعدٌ ' + a.series_index + ' من سلسلة ' + (a.series_total || '?');
      var btn = document.getElementById('fSeriesCancelBtn');
      if (btn) btn.style.display = (a.series_total && a.series_index < a.series_total) ? '' : 'none';
    }
  }
}
function apptRepeatHint() {
  var sel = document.getElementById('fRepeat'), cnt = document.getElementById('fRepeatCount'), h = document.getElementById('fRepeatHint');
  if (!sel || !cnt || !h) return;
  var freq = sel.value, n = parseInt(cnt.value, 10);
  if (freq === 'none' || !window.SyDentSeries) { h.style.display = 'none'; cnt.disabled = true; return; }
  cnt.disabled = false;
  if (!Number.isFinite(n) || n < window.SyDentSeries.MIN_COUNT || n > window.SyDentSeries.MAX_COUNT) { h.textContent = 'العدد بين ' + window.SyDentSeries.MIN_COUNT + ' و' + window.SyDentSeries.MAX_COUNT + '.'; h.style.display = ''; return; }
  var ds = document.getElementById('fDate').value;
  var dates = window.SyDentSeries.plan(ds, freq, n);
  h.textContent = dates.length
    ? ('سيُنشأ ' + n + ' مواعيد ' + window.SyDentSeries.FREQS[freq] + ' بنفس الوقت، آخرها ' + SyDT.numDate(dates[dates.length - 1]) + ' — كلُّ موعدٍ يُعدَّل وحده.')
    : 'حدّد التاريخ أولاً.';
  h.style.display = '';
}
/* ── v506: أفرادُ الأسرة بنافذة الموعد — الشرائحُ عرضٌ؛ الإنشاءُ بـsubmitAppt عبر SyDentFamily ── */
var _famMembers = [];
async function apptFamilyLoad(pid) {
  var g = document.getElementById('fFamilyGroup'), c = document.getElementById('fFamilyChips');
  if (!g || !c) return;
  _famMembers = [];
  c.innerHTML = '';
  if (!pid || editingId || !window.SyDentFamily) { g.style.display = 'none'; return; }
  var planned = document.getElementById('fIsPlanned');
  if (planned && planned.checked) { g.style.display = 'none'; return; }
  var list = await window.SyDentFamily.members(currentUser.id, pid);
  var cur = document.getElementById('fPatient').value;   /* تغيّر المريضُ أثناء التحميل؟ */
  var rec = patientsCache['__name__' + cur];
  if (!list.length || !rec || rec.id !== pid) { g.style.display = 'none'; return; }
  _famMembers = list;
  list.forEach(function (p) {
    var lab = document.createElement('label');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = p.id; cb.className = 'fam-pick'; cb.setAttribute('onchange', 'apptFamilyHint()');
    lab.appendChild(cb); lab.appendChild(document.createTextNode(p.name || '')); c.appendChild(lab);
  });
  g.style.display = '';
  apptFamilyHint();
}
function apptFamilyPicked() {
  var ids = Array.prototype.filter.call(document.querySelectorAll('.fam-pick'), function (x) { return x.checked; }).map(function (x) { return x.value; });
  return _famMembers.filter(function (p) { return ids.indexOf(p.id) !== -1; });
}
function apptFamilyHint() {
  var h = document.getElementById('fFamilyHint'); if (!h) return;
  var picked = apptFamilyPicked();
  if (!picked.length || !window.SyDentFamily) { h.style.display = 'none'; return; }
  var t = document.getElementById('fTime').value, d = parseInt(document.getElementById('fDuration').value, 10);
  var plan = window.SyDentFamily.slots(t, d, picked);
  h.textContent = plan.length
    ? plan.map(function (s) { return s.patient.name + ' ' + fmtTime12(s.time); }).join(' · ') + (plan.length < picked.length ? ' — الباقي يتجاوز نهاية اليوم' : '')
    : 'حدّد الوقت أولاً.';
  h.style.display = '';
}
function getApptSeriesBadge(e) { return (window.SyDentSeries && e) ? window.SyDentSeries.badgeHtml(e) : ''; }
async function apptCancelSeriesRest() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var a = editingId ? appointments.find(function (x) { return x.id === editingId; }) : null;
  if (!a || !a.series_id) return;
  var okGo = await SyDialog.confirm({ title: 'إلغاء بقية السلسلة', message: 'إلغاء المواعيد التالية لهذا الموعد في السلسلة (من ' + (a.series_index + 1) + ' إلى ' + a.series_total + ')؟ المواعيدُ المكتملة لا تُمسّ، وهذا الموعدُ يبقى.', confirmText: 'إلغاء البقية', cancelText: 'تراجع', danger: true });
  if (!okGo) return;
  var r = await window.SyDentSeries.cancelRest(currentUser.id, a.series_id, a.series_index);
  if (r.error) { showToast('❌ تعذّر إلغاء السلسلة'); return; }
  showToast('🔁 أُلغي ' + r.count + ' موعداً من السلسلة');
  await loadAppointments(); render();
  var btn = document.getElementById('fSeriesCancelBtn'); if (btn) btn.style.display = 'none';
}
function getApptMedBadge(e) {
  var rec = (e && e.patient_id && patientsCache[e.patient_id]) ? patientsCache[e.patient_id] : null;
  if (!rec && e && e.patient_name) rec = patientsCache['__name__' + e.patient_name] || null;
  /* شارتان منفصلتان منسجمتان مع بطاقة المريض: تحذير (أحمر) + حساسية (برتقالي) */
  var html = '';
  var wp = warnParts(rec);   /* M87+M92 */
  if (wp.length)
    html += '<span class="tone tone-red" style="display:inline-block;border-width:1px;border-style:solid;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;margin-right:6px;" title="' + escapeHtml(wp.join('، ')) + '">⚠️ تحذير طبي</span>';
  var agB = allergyParts(rec);
  if (agB.length)
    html += '<span class="tone tone-yellow" style="display:inline-block;border-width:1px;border-style:solid;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;margin-right:6px;" title="' + escapeHtml(agB.join('، ')) + '">⚠️ حساسية</span>';
  return html;
}
function updatePatientMedHint(pid) {
  var el = document.getElementById('fPatientMedHint');
  if (!el) return;
  var rec = (pid && patientsCache[pid]) ? patientsCache[pid] : null;
  if (!rec) {
    var name = (document.getElementById('fPatient').value || '').trim();
    rec = name ? patientsCache['__name__' + name] : null;
  }
  var parts = warnParts(rec);   /* M87+M92 */
  var agN = allergyParts(rec);
  if (agN.length) parts = parts.concat(['حساسية: ' + agN.join('، ')]);
  if (parts.length) {
    el.textContent = '⚠️ تحذير طبي: ' + parts.join('، ');
    el.style.display = 'block';
  } else { el.style.display = 'none'; el.textContent = ''; }
  /* v506: أفرادُ الأسرة — يُحمَّلون عند اختيار المريض (لا انتظار: الشرائحُ تظهر حين تصل) */
  if (typeof apptFamilyLoad === 'function') apptFamilyLoad(rec && rec.id ? rec.id : null);
  /* v497: سطرُ التزام المريض تحت التحذيرات الطبية — textContent (لا HTML) · مخفيٌّ عند الدرجة 0 */
  var rel = document.getElementById('fPatientRelHint');
  if (rel) {
    var st = (rec && rec.id) ? getApptReliabStats(rec.id) : null;
    var txt = st && window.SyDentReliability ? window.SyDentReliability.hintText(st) : '';
    rel.textContent = txt;
    rel.classList.toggle('rel-red', !!(st && st.level === 2));
    rel.style.display = txt ? 'block' : 'none';
  }
}
function fpSuggestPick(name) {
  var input = document.getElementById('fPatient');
  input.value = name;
  fpSuggestHide();
  onFPatientInput();          /* نفس مسار onchange القائم — تحديث المعلّقات/المخطط */
  updatePatientMedHint();     /* M87 */
  try { input.blur(); } catch (e) {}
}
function fpSuggestHide() {
  var box = document.getElementById('fpSuggest');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  _fpActive = -1;
}
function fpSuggestBlur() { setTimeout(fpSuggestHide, 200); }
function fpSuggestKey(ev) {
  var box = document.getElementById('fpSuggest');
  if (!box || box.style.display === 'none') return;
  var items = box.querySelectorAll('.fp-item');
  if (!items.length) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    _fpActive += (ev.key === 'ArrowDown' ? 1 : -1);
    if (_fpActive < 0) _fpActive = items.length - 1;
    if (_fpActive >= items.length) _fpActive = 0;
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', i === _fpActive);
    try { items[_fpActive].scrollIntoView({ block: 'nearest' }); } catch (e) {}
  } else if (ev.key === 'Enter') {
    if (_fpActive >= 0 && items[_fpActive]) {
      ev.preventDefault();
      fpSuggestPick(items[_fpActive].textContent);
    }
  } else if (ev.key === 'Escape') {
    /* v438: قائمة الاقتراح مفتوحة ⇒ Escape يغلقها هي فقط — preventDefault يمنع
       عُدّة النوافذ (SyModal) من إغلاق مودال الموعد وضياع ما كُتب. */
    ev.preventDefault();
    fpSuggestHide();
  }
}
function onFPatientTyped() {
  fpSuggestRender();
  onFPatientInput();
  updatePatientMedHint();     /* M87 */
}

function onFPatientInput() {
  if (_appProcModeA !== 'create') return;
  var currentPid = resolveCurrentPatientIdA();
  // Detect patient switch:
  //   • _pendingPatientIdA is set (buffer belongs to a specific patient)
  //   • currentPid is non-null AND different
  // We DO clear when currentPid becomes null too — the user just typed a
  // garbage name and we want to invalidate the buffer until they pick a
  // valid patient again. But ONLY if the buffer is non-empty (no point
  // showing a "cleared" toast for an already-empty list).
  if (_pendingPatientIdA && _pendingAttachmentsA.length > 0) {
    if (!currentPid || currentPid !== _pendingPatientIdA) {
      _pendingAttachmentsA = [];
      _pendingPatientIdA = null;
      showToast('ⓘ تم مسح قائمة العلاجات المعلّقة (تغيّر المريض)');
      renderPendingPP_A();
      return;
    }
  }
  // No mismatch — just refresh the picker to reflect the new patient's
  // unattached planned sessions.
  populateAddPlannedSelectA();
}

