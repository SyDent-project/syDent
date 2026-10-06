/* ═══ pp-plan.js — SyDent decomposition extraction #10 ═══
 * خطة العلاج المرحلية (M75) + كشف الحساب (عرض فقط) + خطط الدفع (Backlog #3، طبقة جدولة عرضية).
 * نُقل بايت-بايت بقصّة واحدة من patient-profile.html (commit 9250fff): سطور 6950-7618.
 * صفر كتابة مالية: phase عرضي، الكشف والخطط عرض/جدولة فقط — FIFO والأرصدة لم تُلمَس.
 * تعريفات صرفة + var حالة — صفر تنفيذ top-level. تُحمَّل بالـ<head> بعد pp-dental.js. */
/* ═══════════════ C: خطة العلاج المرحلية ═══════════════
   phase (M75) is a presentation-only smallint on ledger_sessions — it never
   touches FIFO / splitIsEarned / balances. The plan document uses
   getDisplayName(t, true) — the layman helper finally serving its purpose. */
var setSessionPhase = ppGuarded('setSessionPhase', _setSessionPhase_inner, '⏳');   /* v284: قفل + انشغال */
async function _setSessionPhase_inner(sid, phase) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل الجلسات'); return;
  }
  var s = null;
  for (var i = 0; i < sessions.length; i++) { if (sessions[i].id === sid) { s = sessions[i]; break; } }
  if (!s) return;
  var prev = (s.phase >= 1 && s.phase <= 3) ? s.phase : null;
  if (prev === phase) return;
  var u = await window.sb.from('ledger_sessions').update({ phase: phase })
    .eq('id', sid).eq('doctor_id', currentUser.id);
  if (u.error) {
    if (u.error.code === '42703' || String(u.error.message || '').indexOf('phase') !== -1) {
      showToast('⚠️ يلزم تطبيق Migration 75 (عمود phase)');
    } else {
      showToast('⚠️ ' + u.error.message);
    }
    return;
  }
  s.phase = phase;
  if (window.logAudit) {
    window.logAudit('session.update', {
      entityId: sid,
      patientId: patientId,
      patientName: (patient && patient.name) || '',
      description: 'مرحلة خطة العلاج: ' + (phase ? 'المرحلة ' + phase : 'بلا') + ' — ' + (s.type || ''),
      oldValue: { phase: prev },
      newValue: { phase: phase }
    });
  }
  renderSessions();
}

/* ═══════════════ C2: خيارات الخطة البديلة (M145) ═══════════════
   plan_option (1..3 = أ/ب/ج) عرضيٌّ بحت مثل phase: لا يدخل FIFO ولا
   splitIsEarned ولا أي رصيد. NULL = بندٌ مشترك بين كل الخيارات — وهو حال
   كل الصفوف ما دامت الميزة غير مستعملة، فمخرجاتُ الطباعة/النسخ حينها
   بايت-مطابقة لما قبل M145. */
var PLAN_OPTION_LABELS = { 1: 'أ', 2: 'ب', 3: 'ج' };
function planOptOf(s) { return (s && s.plan_option >= 1 && s.plan_option <= 3) ? s.plan_option : null; }
function planOptionsUsed() {
  var seen = {};
  planPlannedSessions().forEach(function(s){ var o = planOptOf(s); if (o) seen[o] = true; });
  return [1, 2, 3].filter(function(o){ return seen[o]; });
}
/* بنودُ خيارٍ = المشترك + بنوده؛ opt=null ⇒ كل المخطّط (السلوك السابق). */
function planSessionsForOption(opt) {
  var all = planPlannedSessions();
  if (!opt) return all;
  return all.filter(function(s){ var o = planOptOf(s); return o === null || o === opt; });
}
function planOptionTotalBag(opt) {
  var bag = _planBag();
  planSessionsForOption(opt).forEach(function(s){ bag[_rowCur(s)] += Number(s.cost || 0); });
  return bag;
}
var setSessionOption = ppGuarded('setSessionOption', _setSessionOption_inner, '⏳');
async function _setSessionOption_inner(sid, opt) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل الجلسات'); return;
  }
  var s = null;
  for (var i = 0; i < sessions.length; i++) { if (sessions[i].id === sid) { s = sessions[i]; break; } }
  if (!s) return;
  var prev = planOptOf(s);
  if (prev === opt) return;
  /* v415: «لا يُجدوَل إلا المعتمد» بالاتجاهين — بندٌ محجوزٌ بزيارةٍ حيّة لا يُحوَّل إلى بديلٍ
     معلَّق (كان ينتج زيارةً تحمل بنداً غير معتمد). الرجوع إلى «مشترك» مسموح دائماً. */
  if (opt !== null && s.appointment_id && (s.status || '') === 'planned' && !planSessIsStale(s)) {
    showToast('🗓️ هذا البند مجدول بزيارة — فكّه من الموعد أولاً ثم اجعله خياراً بديلاً');
    return;
  }
  var u = await window.sb.from('ledger_sessions').update({ plan_option: opt })
    .eq('id', sid).eq('doctor_id', currentUser.id);
  if (u.error) {
    if (u.error.code === '42703' || u.error.code === 'PGRST204' || String(u.error.message || '').indexOf('plan_option') !== -1) {
      showToast('⚠️ يلزم تطبيق Migration 145 (عمود plan_option)');
    } else {
      showToast('⚠️ ' + u.error.message);
    }
    return;
  }
  s.plan_option = opt;
  if (window.logAudit) {
    window.logAudit('session.update', {
      entityId: sid,
      patientId: patientId,
      patientName: (patient && patient.name) || '',
      description: 'خيار خطة العلاج: ' + (opt ? 'الخيار ' + PLAN_OPTION_LABELS[opt] : 'مشترك') + ' — ' + (s.type || ''),
      oldValue: { plan_option: prev },
      newValue: { plan_option: opt }
    });
  }
  renderSessions();
  try { if (typeof renderPayments === 'function') renderPayments(); } catch (e) {}
}
/* شرائح الخيار بصفّ الجلسة المخطّطة — جنب شرائح المرحلة وبنمطها. */
function planOptionChipsHtml(s) {
  var cur = planOptOf(s);
  var _OP = [[1, 'أ'], [2, 'ب'], [3, 'ج'], [null, '—']];
  return '<span class="sess-phase sess-option" title="خيار خطة العلاج (بديل) — «—» = بند مشترك بكل الخيارات">'
    + _OP.map(function(op){
        var _sel = cur === op[0];
        return '<button type="button" onclick="setSessionOption(\'' + s.id + '\',' + (op[0] === null ? 'null' : op[0]) + ')" '
          + 'style="min-width:20px;height:20px;padding:0 4px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;font-family:Cairo,sans-serif;line-height:1;'
          + 'border:1.5px solid ' + (_sel ? 'var(--blue)' : 'var(--border)') + ';'
          + 'color:' + (_sel ? 'var(--blue)' : 'var(--text2)') + ';background:transparent;">' + op[1] + '</button>';
      }).join('')
    + '</span>';
}
/* شريط المقارنة فوق جدول الجلسات — يظهر فقط عند وجود خيارات. */
/* M145-i: إنجازٌ من صفحة المواعيد/اللوحة لا يعتمد الخيار (لا منطق مخطط هناك) — يُترك وسمُ البند المنجز
   علامةً، وهنا يُعرض «اعتمادٌ معلّق» بزرٍّ يشغّل الاعتماد الحقيقي بكل مزامنته. */
function planPendingAdoption() {
  var used = planOptionsUsed(), done = {};
  (sessions || []).forEach(function(s){ if ((s.status || 'completed') === 'completed' && planOptOf(s)) done[planOptOf(s)] = true; });
  return [1, 2, 3].filter(function(o){ return done[o] && used.some(function(u){ return u !== o; }); });
}
function planOptionsBarHtml() {
  var used = planOptionsUsed();
  if (!used.length) return '';
  var pend = planPendingAdoption();
  var h = '<div class="plan-opt-bar" data-plan-opt-bar="1" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg3);">'
        + '<span style="font-weight:800;font-size:13px;">🔀 خيارات الخطة:</span>';
  used.forEach(function(o){
    h += '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1.5px solid var(--blue);border-radius:8px;font-size:12.5px;">'
       + '<b style="color:var(--blue);">' + PLAN_OPTION_LABELS[o] + '</b>'
       + '<span style="white-space:nowrap;">' + escapeHtml(_planBagText(planOptionTotalBag(o))) + '</span>'
       + '<button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11.5px;" onclick="adoptPlanOption(' + o + ')" title="اعتماد هذا الخيار وحذف بنود الخيارات الأخرى المخطّطة">اعتماد</button>'
       + '</span>';
  });
  h += '<span style="font-size:11px;color:var(--text2);">الإجمالي = البنود المشتركة + بنود الخيار</span>';
  if (pend.length) {
    h += '<div data-plan-pending="1" style="flex-basis:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--orange-bd);background:var(--orange-bg);color:var(--text);font-size:12.5px;line-height:1.7;">⚠️ '
       + (pend.length === 1
          ? 'أُنجز بندٌ من «الخيار ' + PLAN_OPTION_LABELS[pend[0]] + '» من صفحة المواعيد والبدائل ما زالت مخطّطة — اعتمد الخيار لإزالتها وتحديث المخطط. '
            + '<button type="button" class="btn btn-sm" style="padding:2px 10px;font-size:11.5px;margin-inline-start:6px;" onclick="adoptPlanOption(' + pend[0] + ')">اعتماد ' + PLAN_OPTION_LABELS[pend[0]] + '</button>'
          : 'أُنجزت بنودٌ من خيارين مختلفين (' + pend.map(function(o){ return PLAN_OPTION_LABELS[o]; }).join(' و') + ') — راجع الخطة واعتمد الخيار الصحيح.')
       + '</div>';
  }
  h += '</div>';
  return h;
}
/* اعتماد خيار: حذف مخطّطات الخيارات الأخرى عبر delSession القائم (نفس مسار
   إعادة التوزيع ومزامنة المخطط — صفر مسار حذف جديد)، ثم تفريغ وسم المعتمد. */
var adoptPlanOption = ppGuarded('adoptPlanOption', _adoptPlanOption_inner, '⏳');
async function _adoptPlanOption_inner(opt, opts) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل الجلسات'); return;
  }
  if (!(opt >= 1 && opt <= 3)) return;
  var planned = planPlannedSessions();
  var drop = planned.filter(function(s){ var o = planOptOf(s); return o !== null && o !== opt; });
  var keep = planned.filter(function(s){ return planOptOf(s) === opt; });
  var msg = 'اعتماد الخيار ' + PLAN_OPTION_LABELS[opt] + '؟\n\n'
    + (drop.length ? '• سيُحذف ' + drop.length + ' بند مخطّط من الخيارات الأخرى:\n'
        + drop.map(function(s){ return '   – ' + (s.type || '') + (s.tooth_num ? ' (سن ' + s.tooth_num + ')' : '') + ' [' + PLAN_OPTION_LABELS[planOptOf(s)] + ']'; }).join('\n') + '\n'
      : '• لا بنود بخيارات أخرى للحذف.\n')
    + (keep.length
        ? '• بنود الخيار ' + PLAN_OPTION_LABELS[opt] + ' (' + keep.length + ') تصير جزءاً ثابتاً من الخطة.'
        : '• ما أُنجز من الخيار ' + PLAN_OPTION_LABELS[opt] + ' يبقى كما هو، ولا بنود مخطّطة باقية منه.')   /* M145-j */
    + (drop.some(function(s){ return !!s.appointment_id; })
        ? '\n\n⚠️ من البنود المحذوفة ما هو مربوط بموعد — الموعد نفسه يبقى بالتقويم بلا هذا البند.' : '');
  /* M145-f: الإنجازُ من خيارٍ = اعتمادُه؛ مسارُ الإنجاز يؤكّد مرةً واحدة برسالةٍ جامعة ثم يمرّر skipConfirm. */
  if (!(opts && opts.skipConfirm === true) && !await SyDialog.confirm({ message: msg, danger: drop.length > 0 })) return;   /* M145-h: يحذف بنوداً ⇒ نمط الخطر */
  for (var i = 0; i < drop.length; i++) {
    await delSession(drop[i].id, { skipConfirm: true });
  }
  /* M145-b: الجسرُ المعتمد يأخذ رسمَ الوحدة على المخطط (لو كان المرسوم هو المحذوف). */
  if (typeof bridgeChartResync === 'function') {
    for (var k = 0; k < keep.length; k++) {
      if (String(keep[k].tooth_num || '').indexOf(',') === -1) continue;
      try { await bridgeChartResync(keep[k].tooth_num, (typeof sessionTreatmentKey === 'function') ? sessionTreatmentKey(keep[k]) : null); } catch (e) { console.warn('adopt resync:', e); }
    }
  }
  /* M145-i: بنودٌ أُنجزت من صفحة المواعيد تحمل وسمها علامةَ «اعتمادٍ معلّق» — الاعتمادُ يُنهيها كلها. */
  var ids = keep.map(function(s){ return s.id; });
  (sessions || []).forEach(function(s){ if ((s.status || 'completed') === 'completed' && planOptOf(s) && ids.indexOf(s.id) < 0) { ids.push(s.id); keep.push(s); } });
  if (ids.length) {
    var u = await window.sb.from('ledger_sessions').update({ plan_option: null })
      .in('id', ids).eq('doctor_id', currentUser.id);
    if (u.error) { showToast('⚠️ ' + u.error.message); }
    else { keep.forEach(function(s){ s.plan_option = null; }); }
  }
  if (window.logAudit) {
    window.logAudit('session.update', {
      patientId: patientId,
      patientName: (patient && patient.name) || '',
      description: 'اعتماد الخيار ' + PLAN_OPTION_LABELS[opt] + ' بخطة العلاج — حُذف ' + drop.length + ' بند بديل',
      newValue: { adopted_option: opt, removed: drop.length, kept: keep.length }
    });
  }
  renderSessions();
  try { if (typeof renderPayments === 'function') renderPayments(); } catch (e) {}
  if (!(opts && opts.quiet === true)) showToast('✓ اعتُمد الخيار ' + PLAN_OPTION_LABELS[opt]);
}
/* بنودُ الخيارات الأخرى التي يُسقطها اعتمادُ خيار هذه الجلسة — فارغة ⇒ لا بدائل منافسة. */
function planRivalsOf(sess) {
  var o = planOptOf(sess);
  if (!o) return [];
  return planPlannedSessions().filter(function(x){ var xo = planOptOf(x); return xo !== null && xo !== o; });
}
/* M145-b: وسمٌ تلقائي لجلسات الجسر البديلة لنفس الوحدة. الموسومةُ تحتفظ بوسمها؛
   غيرُ الموسومة تأخذ أصغرَ خيارٍ حرّ بترتيب الإنشاء (الأصلي أ ثم البديل ب…).
   عرضيٌّ بحت — تحديثُ plan_option وحده، صفر مساس بأي حقلٍ مالي. */
async function planTagAltBridge(newSess, unitSessions, siblings) {
  var list = (unitSessions || []).slice();
  /* M145-e: زرعاتُ مواقع الوحدة الواحدة خيارٌ واحد — الجديدة ترث خيار أختها إن وُجد. */
  var sibOpt = null;
  (siblings || []).forEach(function(x){ var o = planOptOf(x); if (o && !sibOpt) sibOpt = o; list.push(x); });
  if (newSess && sibOpt && !planOptOf(newSess)) {
    var us = await window.sb.from('ledger_sessions').update({ plan_option: sibOpt })
      .eq('id', newSess.id).eq('doctor_id', currentUser.id);
    if (!us.error) newSess.plan_option = sibOpt;
  }
  if (newSess && list.indexOf(newSess) < 0) list.push(newSess);
  if (list.length < 2) return;
  list.sort(function(a, b){ return String(a.created_at || '').localeCompare(String(b.created_at || '')); });
  var used = {};
  list.forEach(function(x){ var o = planOptOf(x); if (o) used[o] = true; });
  for (var i = 0; i < list.length; i++) {
    var x = list[i];
    if (planOptOf(x)) continue;
    var free = [1, 2, 3].filter(function(o){ return !used[o]; })[0];
    if (!free) break;
    var u = await window.sb.from('ledger_sessions').update({ plan_option: free })
      .eq('id', x.id).eq('doctor_id', currentUser.id);
    if (u.error) { console.warn('planTagAltBridge:', u.error); continue; }
    x.plan_option = free; used[free] = true;
  }
}
/* بطاقة «مخطط (لم يُنجز)»: computeFinancials مقفلة بالحُرّاس ولا تُمَسّ — الرقم يبقى
   مجموع كل المخطّط، وهذا التلميح العرضي يوضّح أنه يضمّ بدائل ويعرض إجمالي كل خيار
   بعملة الطبقة نفسها. */
function planOptionHintForLbl(lbl) {
  var used = planOptionsUsed();
  if (!used.length) return '';
  var inLayer = planPlannedSessions().some(function(s){ return planOptOf(s) && _rowLbl(s) === lbl; });
  if (!inLayer) return '';
  var parts = used.map(function(o){
    var t = 0;
    planSessionsForOption(o).forEach(function(s){ if (_rowLbl(s) === lbl) t += Number(s.cost || 0); });   /* cur-ok: مرشَّح بوسم عملة الطبقة بالسطر نفسه */
    return PLAN_OPTION_LABELS[o] + ': ' + fmt(t);
  });
  return '<div style="font-size:10px;color:var(--blue);margin-top:2px;" title="الرقم أعلاه يجمع كل البدائل؛ الفعلي = إجمالي الخيار المعتمد">🔀 يضمّ بدائل — '
    + escapeHtml(parts.join(' · ')) + '</div>';
}
/* ═══════════════ end C2 ═══════════════ */

/* ═══════════════ C3: زيارات الخطة (v410) ═══════════════
   «زيارة» = موعدٌ قائم (مخطّط بلا تاريخ · قادم · فات ولم يُحسم) رُبطت به بنودٌ
   مخطّطة عبر ledger_sessions.appointment_id — العمودُ والربطُ قائمان منذ
   Workflow B؛ الجديدُ هنا عرضُ الخطة مجمّعةً بزياراتها + جدولةُ مرحلةٍ كاملة
   بنقرة. صفر migration · صفر كتابة مالية: الإجماليات عرضٌ بحت بدلو العملة،
   ولا يقرأ هذا القسمَ FIFO ولا computeFinancials. الترقيم عرضيٌّ يُحسب لحظة
   الرسم: المؤرَّخة بتاريخها ثم غيرُ المجدولة بأدنى مرحلةٍ فيها فبتاريخ الإنشاء.
   planVisitsCompute نقيّة (بلا DOM ولا عالميّات) كي تُبرهَن بـnode. */
function planVisitsCompute(sessList, apptList, today, bucketOf) {
  var byAppt = {};
  (sessList || []).forEach(function(s){
    if (!s || (s.status || 'completed') !== 'planned' || !s.appointment_id) return;
    (byAppt[s.appointment_id] = byAppt[s.appointment_id] || []).push(s);
  });
  var visits = [];
  (apptList || []).forEach(function(a){
    if (!a || !byAppt[a.id]) return;
    var b = bucketOf(a, today);
    if (b !== 'planned' && b !== 'upcoming' && b !== 'unresolved') return;
    var items = byAppt[a.id];
    var minPh = 9;
    items.forEach(function(s){ if (s.phase >= 1 && s.phase <= 3 && s.phase < minPh) minPh = s.phase; });
    visits.push({ appt: a, bucket: b, items: items, minPhase: minPh, n: 0 });
  });
  visits.sort(function(x, y){
    var xd = x.bucket !== 'planned', yd = y.bucket !== 'planned';
    if (xd !== yd) return xd ? -1 : 1;
    if (xd) {
      return (String(x.appt.date).slice(0, 10) + String(x.appt.time || ''))
        .localeCompare(String(y.appt.date).slice(0, 10) + String(y.appt.time || ''));
    }
    if (x.minPhase !== y.minPhase) return x.minPhase - y.minPhase;
    return String(x.appt.created_at || '').localeCompare(String(y.appt.created_at || ''));
  });
  visits.forEach(function(v, i){ v.n = i + 1; });
  return visits;
}
function planVisits() {
  if (typeof ppApptBucket !== 'function') return [];
  return planVisitsCompute(sessions, (typeof allAppointmentsForTl !== 'undefined') ? allAppointmentsForTl : [], toDay(), ppApptBucket);
}
function planVisitOfSession(s, visits) {
  if (!s || !s.appointment_id) return null;
  var list = visits || planVisits();
  for (var i = 0; i < list.length; i++) if (list[i].appt.id === s.appointment_id) return list[i];
  return null;
}
/* نصٌّ خام — مواضعُ HTML تمرّره بـescapeHtml. */
function planVisitWhen(v) {
  if (v.bucket === 'planned') return 'غير مجدولة';
  var d = (typeof ppApptLongDate === 'function') ? ppApptLongDate(v.appt.date) : String(v.appt.date).slice(0, 10);
  var t = (typeof ppApptTime === 'function') ? ppApptTime(v.appt.time) : '';
  return d + (t ? ' · ' + t : '');
}
/* v415: بندٌ «حرّ للجدولة» = مخطّط غير مربوط، أو مربوط بموعدٍ لم يعد يحمله (ملغى/فائت/
   مكتمل/خرج مريضه — SyDentApptDead). موعدٌ غير موجود بالقائمة المحمّلة ⇒ ليس حرّاً
   (تحفّظ: فشلُ تحميل المواعيد لا يحرّر كل شيء). */
function planApptById(id) {
  var list = (typeof allAppointmentsForTl !== 'undefined' && Array.isArray(allAppointmentsForTl)) ? allAppointmentsForTl : [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function planSessIsStale(s) {
  if (!s || !s.appointment_id || typeof window.SyDentApptDead !== 'function') return false;
  var a = planApptById(s.appointment_id);
  return !!a && window.SyDentApptDead(a, toDay());
}
function planSessIsFree(s) {
  return !!s && (s.status || 'completed') === 'planned' && (!s.appointment_id || planSessIsStale(s));
}
/* البنودُ المخطّطة بلا زيارة، مجمّعةً بالمرحلة. بنودُ الخيارات البديلة غير المعتمدة
   خارج الجدولة (قاعدة v412). stale = ما عاد «بلا زيارة» لأن موعده انتهى/أُلغي. */
function planUnvisitedGroups() {
  var g = { 1: [], 2: [], 3: [], 0: [] }, alt = 0, stale = 0;
  planPlannedSessions().forEach(function(s){
    if (!planSessIsFree(s)) return;
    if (planOptOf(s) !== null) { alt++; return; }
    if (s.appointment_id) stale++;
    g[(s.phase >= 1 && s.phase <= 3) ? s.phase : 0].push(s);
  });
  return { g: g, alt: alt, stale: stale };
}
function planItemName(s) {
  var u = (typeof sessUnitsOf === 'function') ? sessUnitsOf(s) : 1;   /* v425 (M150) */
  var mult = u > 1 ? ' ×' + u : '';
  var where = s.tooth_num ? ' (' + s.tooth_num + ')'
    : (s.quadrant && typeof QUADRANT_LABELS !== 'undefined' && QUADRANT_LABELS[s.quadrant]) ? ' (' + QUADRANT_LABELS[s.quadrant] + ')'
    : (s.arch && typeof ARCH_LABELS !== 'undefined' && ARCH_LABELS[s.arch]) ? ' (' + ARCH_LABELS[s.arch] + ')' : '';
  return (s.type || 'علاج') + where + mult;
}
function _planVisitBag(items) {
  var bag = _planBag();
  items.forEach(function(s){ bag[_rowCur(s)] += Number(s.cost || 0); });
  return _planBagText(bag);
}
function planVisitsBarHtml() {
  if (!planPlannedSessions().length) return '';
  var visits = planVisits();
  var un = planUnvisitedGroups();
  var unCount = un.g[1].length + un.g[2].length + un.g[3].length + un.g[0].length;
  /* v411: «الكل بدائل غير معتمدة» يُبقي الشريط بسطر توضيحه — إخفاؤه كلّه كان يوهم بغياب الميزة. */
  if (!visits.length && !unCount && !un.alt) return '';
  var linkable = planLinkableAppts();
  var h = '<div class="plan-visits" data-plan-visits="1"><div class="pv-head">🗓️ زيارات الخطة</div><div class="pv-list">';
  visits.forEach(function(v){
    var late = v.bucket === 'unresolved';
    var tone = v.bucket === 'planned' ? 'pv-unsched' : (late ? 'pv-late' : 'pv-sched');
    var names = v.items.map(planItemName).join(' · ');
    /* v412: زيارةٌ رُبط بها (قبل قاعدة «لا يُجدوَل إلا المعتمد») بندٌ من خيارٍ لم يُعتمد. */
    var altIn = v.items.filter(function(s){ return planOptOf(s) !== null; });
    h += '<div class="pv-card ' + tone + '">'
       +   '<div class="pv-title"><b>زيارة ' + v.n + '</b><span class="pv-when">' + escapeHtml(planVisitWhen(v)) + (late ? ' — فات موعدها' : '') + '</span></div>'
       +   '<div class="pv-items" title="' + escapeHtml(names) + '">' + escapeHtml(names) + '</div>'
       +   (altIn.length ? '<div class="pv-warn">⚠️ ' + altIn.length + ' بند من خيار غير معتمد ('
             + altIn.map(function(s){ return PLAN_OPTION_LABELS[planOptOf(s)]; }).filter(function(x, i, a){ return a.indexOf(x) === i; }).join('، ')
             + ') — اعتمد الخيار أو فكّ البند من الموعد.</div>' : '')
       +   '<div class="pv-foot"><span class="pv-total">' + v.items.length + ' بند · ' + escapeHtml(_planVisitBag(v.items)) + '</span>'
       +   '<span class="sy-acts">' + (v.bucket === 'planned'
            ? '<button type="button" class="sy-act sy-act-primary" onclick="quickSchedulePlannedFromProfile(\'' + v.appt.id + '\')">📅 جدوِل</button>'
              + '<button type="button" class="sy-act" onclick="editPlannedFromProfile(\'' + v.appt.id + '\')" title="تعديل بنود الزيارة">✏️ تعديل</button>'
            : '<button type="button" class="sy-act" onclick="ppApptOpenInCalendar(\'' + v.appt.id + '\')">🗓️ فتح الموعد</button>')
       +   '</span></div></div>';
  });
  h += '</div>';
  var optsPending = planOptionsUsed().length > 0;
  if (unCount) {
    var hasPh = un.g[1].length || un.g[2].length || un.g[3].length;
    h += '<div class="pv-un-head">بلا زيارة بعد'
       + (optsPending ? ' <span class="pv-tag">بنود مشتركة بكل الخيارات — تُنفَّذ أيّاً كان الخيار المعتمد</span>' : '') + '</div>'
       + '<div class="pv-list">';
    [1, 2, 3, 0].forEach(function(ph){
      var items = un.g[ph];
      if (!items.length) return;
      var lbl = ph ? PLAN_PHASE_LABELS[ph] : (hasPh ? 'بلا مرحلة' : 'بنود الخطة');
      var nm = items.map(planItemName).join(' · ');
      h += '<div class="pv-card pv-free">'
         +   '<div class="pv-title"><b>' + lbl + '</b></div>'
         +   '<div class="pv-items" title="' + escapeHtml(nm) + '">' + escapeHtml(nm) + '</div>'
         +   '<div class="pv-foot"><span class="pv-total">' + items.length + ' بند · ' + escapeHtml(_planVisitBag(items)) + '</span>'
         +   '<span class="sy-acts"><button type="button" class="sy-act sy-act-primary" onclick="planNewVisit(' + ph + ')">➕ زيارة</button>'
         +   (linkable.length ? '<button type="button" class="sy-act" aria-pressed="' + (_planLinkOpenPh === ph) + '" onclick="planLinkVisitPick(' + ph + ')" title="ربط بنود هذه المجموعة بموعدٍ قائم للمريض">🔗 موعد قائم</button>' : '')
         +   '</span></div></div>';
    });
    h += '</div>';
    /* v413: منتقي «موعد قائم» — يظهر تحت المجموعة المفتوحة فقط. */
    if (_planLinkOpenPh !== null && linkable.length && (un.g[_planLinkOpenPh] || []).length) {
      h += '<div class="pv-link"><span class="pv-un-lbl">اربط ' + un.g[_planLinkOpenPh].length + ' بند بـ:</span>';
      linkable.forEach(function(a){
        h += '<button type="button" class="btn btn-outline btn-sm" onclick="planLinkVisit(' + _planLinkOpenPh + ',\'' + a.id + '\')">'
           + escapeHtml(planApptLabel(a)) + '</button>';
      });
      h += '</div>';
    }
    if (un.stale) {
      h += '<div class="pv-note">↩︎ ' + un.stale + ' بند كان مربوطاً بموعدٍ أُلغي أو فات أو انتهى دون إنجازه — عاد «بلا زيارة» ليُجدوَل من جديد.</div>';
    }
  }
  if (un.alt) {
    h += '<div class="pv-note">🔀 ' + un.alt + ' بند ضمن خيارات بديلة لم يُعتمد أيٌّ منها بعد — لا يُجدوَل إلا المعتمد: اضغط «اعتماد» على الخيار الذي وافق عليه المريض أعلاه فتنتقل بنوده إلى هنا.</div>';
  }
  return h + '</div>';
}
/* v413: ربطُ مجموعةٍ بموعدٍ قائم (طلب المالك: «للمريض موعدٌ مسجَّل أصلاً — لماذا موعدٌ جديد؟»).
   المواعيد المؤهَّلة = قادم أو مخطّط بلا تاريخ (ppApptBucket القائم) — لا ماضٍ ولا منتهٍ.
   الكتابة = نفس حقل Workflow B (appointment_id) بتحديثٍ واحد مقيَّد بـplanned + غير مربوط،
   والمرآةُ المحلية تتبع الصفوفَ التي أعادها الخادم فقط. صفر مال. */
var _planLinkOpenPh = null;
function planLinkableAppts() {
  if (typeof ppApptBucket !== 'function' || typeof allAppointmentsForTl === 'undefined') return [];
  var today = toDay();
  return (allAppointmentsForTl || []).filter(function(a){
    var b = ppApptBucket(a, today);
    return b === 'upcoming' || b === 'planned';
  }).sort(function(x, y){
    var xd = !!(x.date && x.is_planned !== true), yd = !!(y.date && y.is_planned !== true);
    if (xd !== yd) return xd ? -1 : 1;
    return (String(x.date || '') + String(x.time || '') + String(x.created_at || ''))
      .localeCompare(String(y.date || '') + String(y.time || '') + String(y.created_at || ''));
  });
}
function planApptLabel(a) {
  var planned = (a.is_planned === true || !a.date);
  var when = planned ? 'غير مجدول'
    : ((typeof ppApptLongDate === 'function') ? ppApptLongDate(a.date) : String(a.date).slice(0, 10))
      + (a.time && typeof ppApptTime === 'function' ? ' · ' + ppApptTime(a.time) : '');
  return '📅 ' + when + (a.type ? ' — ' + a.type : '');
}
function planLinkVisitPick(ph) {
  _planLinkOpenPh = (_planLinkOpenPh === ph) ? null : ph;
  renderSessions();
}
var planLinkVisit = ppGuarded('planLinkVisit', _planLinkVisit_inner, '⏳');
async function _planLinkVisit_inner(ph, apptId) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن ربط العلاجات'); return;
  }
  var appt = planLinkableAppts().filter(function(a){ return a.id === apptId; })[0];
  if (!appt) { showToast('⚠️ الموعد لم يعد متاحاً للربط'); _planLinkOpenPh = null; renderSessions(); return; }
  var items = planUnvisitedGroups().g[ph] || [];
  if (!items.length) { _planLinkOpenPh = null; renderSessions(); return; }
  var ids = items.map(function(s){ return s.id; });
  /* v415: البند الحرّ إمّا غير مربوط أو مربوط بموعدٍ ميت — القيدُ يسمّي تلك المواعيد تحديداً
     (معرّفات UUID من الذاكرة، مُتحقَّقة الشكل) فلا يُنتزَع بندٌ من موعدٍ حيّ بسباق. */
  var deadIds = {};
  items.forEach(function(s){ if (s.appointment_id && /^[0-9a-f-]{36}$/i.test(String(s.appointment_id))) deadIds[s.appointment_id] = true; });
  var deadList = Object.keys(deadIds);
  var qy = window.sb.from('ledger_sessions').update({ appointment_id: apptId })
    .in('id', ids).eq('doctor_id', currentUser.id).eq('status', 'planned');
  qy = deadList.length ? qy.or('appointment_id.is.null,appointment_id.in.(' + deadList.join(',') + ')') : qy.is('appointment_id', null);
  var u = await qy.select('id');
  if (u.error) { showToast('❌ تعذّر الربط: ' + u.error.message); return; }
  var done = {}; (u.data || []).forEach(function(r){ done[r.id] = true; });
  var n = 0;
  (sessions || []).forEach(function(s){ if (done[s.id]) { s.appointment_id = apptId; n++; } });
  if (window.logAudit && n) {
    try {
      window.logAudit('session.edit', {
        patientId: patientId, patientName: (patient && patient.name) || '',
        description: 'ربط ' + n + ' علاج مخطّط بموعدٍ قائم من شريط زيارات الخطة',
        newValue: { appointment_id: apptId, sessions: Object.keys(done) }
      });
    } catch (e) { console.warn('planLinkVisit audit:', e); }
  }
  _planLinkOpenPh = null;
  renderSessions();
  try { if (typeof renderApptsTab === 'function') renderApptsTab(); } catch (e) {}
  showToast(n === ids.length ? '✅ رُبط ' + n + ' علاج بالموعد' : '⚠️ رُبط ' + n + ' من ' + ids.length + ' — أعد تحميل الصفحة');
}
/* زيارة جديدة لمرحلة: يفتح مودال الموعد القائم بوضع الإنشاء وبنودُ المرحلة
   محمّلةٌ سلفاً بمخزن «سيُربط» — الربطُ الفعلي يبقى بمسار saveAppt/
   commitPendingAttachmentsPP القائم (صفر مسار كتابة جديد). */
function planNewVisit(ph) {
  var items = planUnvisitedGroups().g[ph] || [];
  if (!items.length) { showToast('⚠️ لا بنود بلا زيارة بهذه المرحلة'); return; }
  if (typeof openApptModal !== 'function') return;
  var ready = openApptModal();
  if (typeof editingApptId !== 'undefined' && editingApptId !== null) return;
  var mo = document.getElementById('apptModal');
  if (!mo || !mo.classList.contains('open')) return;   // حُجب (قراءة فقط/اشتراك)
  _pendingAttachmentsPP = items.slice();
  renderApptProcedureListPP();
  var t = document.getElementById('apptModalTitle');
  if (t) t.textContent = '🗓️ زيارة جديدة — ' + (ph ? PLAN_PHASE_LABELS[ph] : 'بنود الخطة');
  /* نوعُ الموعد يُعبّأ فقط إن اتّفقت البنود على علاجٍ واحد — وإلا يبقى قرارَ الطبيب. */
  var keys = {}; items.forEach(function(s){ var tr = planTreatmentFor(s); keys[tr ? tr.id : ''] = true; });
  var only = Object.keys(keys);
  if (only.length === 1 && only[0]) {
    Promise.resolve(ready).then(function(){
      var sel = document.getElementById('aType');
      if (!sel || editingApptId !== null) return;
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === only[0]) { sel.value = only[0]; break; }
    }).catch(function(){});
  }
}
/* v417: الزيارات بالخطة المطبوعة/المنسوخة (موجَّهة للمريض). قسمٌ **ملحَق** بعد الإجماليات:
   بلا زيارات ⇒ سلسلة فارغة ⇒ المخرجات بايت-مطابقة لما قبله. المراحل والمجاميع لا تُمسّ
   (الزيارة جدولةٌ لا محاسبة ⇒ لا أسعار هنا). الأسماء بالاسم المبسّط للمريض كبقية الخطة،
   وبنودُ خيارٍ غير معتمد رُبطت قبل قاعدة v412 لا تُطبع. */
function planVisitsForPatient() {
  return planVisits().map(function(v){
    var items = v.items.filter(function(s){ return planOptOf(s) === null; });
    if (!items.length) return null;
    var names = items.map(function(s){
      var t = planTreatmentFor(s);
      var disp = t ? getDisplayName(t, true) : (s.type || '—');
      var u = (typeof sessUnitsOf === 'function') ? sessUnitsOf(s) : 1;   /* v425 (M150) */
      return disp + (s.tooth_num ? ' (سن ' + s.tooth_num + ')' : '') + (u > 1 ? ' ×' + u : '');
    });
    var when = (v.bucket === 'planned') ? 'يُحدَّد موعدها لاحقاً' : planVisitWhen(v);
    return { n: v.n, when: when, names: names };
  }).filter(Boolean);
}
function planVisitsPrintHtml(td, th) {
  var list = planVisitsForPatient();
  if (!list.length) return '';
  var h = '<div style="font-size:15px;font-weight:800;color:#111;margin:22px 0 6px;">🗓️ جدول الزيارات</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:13.5px;">'
        + '<tr><th style="' + th + 'width:16%;">الزيارة</th><th style="' + th + 'width:34%;">الموعد</th><th style="' + th + '">العلاجات</th></tr>';
  list.forEach(function(v, i){
    h += '<tr><td style="' + td + 'font-weight:700;white-space:nowrap;">زيارة ' + (i + 1) + '</td>'
       + '<td style="' + td + '">' + escapeHtml(v.when) + '</td>'
       + '<td style="' + td + '">' + escapeHtml(v.names.join(' · ')) + '</td></tr>';
  });
  return h + '</table>';
}
function planVisitsTextLines() {
  var list = planVisitsForPatient();
  if (!list.length) return [];
  var out = ['', '🗓️ جدول الزيارات:'];
  list.forEach(function(v, i){ out.push('زيارة ' + (i + 1) + ' — ' + v.when + ': ' + v.names.join(' · ')); });
  return out;
}
/* ═══════════════ end C3 ═══════════════ */

function planPlannedSessions() {
  var list = (sessions || []).filter(function(s){ return (s.status || 'completed') === 'planned'; });
  list.sort(function(a, b){
    var d = String(a.date || '').localeCompare(String(b.date || ''));
    return d !== 0 ? d : String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  return list;
}
function planTreatmentFor(s) {
  return (Array.isArray(TREATMENTS) ? TREATMENTS : []).find(function(t){ return t.name === s.type; }) || null;
}
function planGroups(list) {
  var g = { 1: [], 2: [], 3: [], 0: [] };
  (list || planPlannedSessions()).forEach(function(s){
    g[(s.phase >= 1 && s.phase <= 3) ? s.phase : 0].push(s);
  });
  return g;
}
var PLAN_PHASE_LABELS = { 1: 'المرحلة الأولى', 2: 'المرحلة الثانية', 3: 'المرحلة الثالثة', 0: 'غير مصنّفة' };

/* ── قاعدة #481: خطة العلاج مستندٌ يُطبع ويُنسخ للمريض، وبنودها قد تكون
 * بعملتين (زرعة بالدولار وحشوة بالليرة). جمعُها برقمٍ واحد تحت وسم العيادة
 * يعطي إجمالياً تقديرياً بلا معنى بأهم مستندٍ يقرؤه المريض. كيسٌ لكل عملة،
 * والعيادة الأحادية تُخرج نصّاً بايت-مطابقاً للسابق. */
function _planBag() { return SyDentCurBag.make(); }
function _planBagAddTo(dst, src) { dst.SYP += src.SYP; dst.USD += src.USD; }
function _planBagText(bag) { return SyDentCurBag.text(bag, fmt); }

function buildPlanHtml() {
  var c = rxClinicInfo();
  var _opts = planOptionsUsed();   /* M145: فارغة ⇒ مسار واحد بايت-مطابق للسابق */
  var dateStr = SyDT.numDate(new Date());   // v487: المطبوعُ أرقاماً
  var pName = (patient && patient.name) ? patient.name : '';
  var pAge = (patient && patient.dob) ? calcAge(patient.dob) : '';
  var pGender = (patient && patient.gender) ? patient.gender : '';

  var h = '<div dir="rtl" style="font-family:Cairo,\'Noto Kufi Arabic\',Tahoma,sans-serif;color:#111;background:#fff;max-width:820px;margin:0 auto;padding:6px 4px;">';
  // Header — mirrors the prescription header
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--green);padding-bottom:14px;margin-bottom:10px;">';
  h += '<div><div style="font-size:24px;font-weight:800;color:#111;">' + escapeHtml(c.clinic_name) + '</div>';
  if (c.license_no) h += '<div style="font-size:12px;color:#666;margin-top:2px;">رقم النقابة: ' + escapeHtml(c.license_no) + '</div>';
  h += '</div>';
  h += '<div style="text-align:left;font-size:13px;color:#444;">';
  if (c.clinic_phone) h += '<div>📞 ' + escapeHtml(c.clinic_phone) + '</div>';
  h += '<div style="margin-top:4px;">' + escapeHtml(dateStr) + '</div>';
  h += '</div></div>';

  h += '<div style="font-size:20px;font-weight:800;color:var(--green);margin:6px 0 10px;">🦷 خطة العلاج المقترحة</div>';

  h += '<div style="background:#f6f6f6;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#222;">';
  h += '<strong>المريض:</strong> ' + escapeHtml(pName);
  if (pGender) h += ' &nbsp;•&nbsp; ' + escapeHtml(pGender);
  if (pAge) h += ' &nbsp;•&nbsp; العمر: ' + escapeHtml(String(pAge));
  h += '</div>';

  var th = 'padding:7px 10px;border:1px solid #ccc;background:#eee;text-align:right;font-size:12.5px;';
  var td = 'padding:7px 10px;border:1px solid #ddd;font-size:13px;vertical-align:top;';
  var _section = function(g, totalLabel){
  var hasPhases = g[1].length > 0 || g[2].length > 0 || g[3].length > 0;
  var grand = _planBag();

  [1, 2, 3, 0].forEach(function(ph){
    var items = g[ph];
    if (!items.length) return;
    if (hasPhases) {
      h += '<div style="font-size:15px;font-weight:800;color:#111;margin:14px 0 6px;">📌 ' + PLAN_PHASE_LABELS[ph] + '</div>';
    }
    h += '<table style="width:100%;border-collapse:collapse;margin-bottom:4px;">';
    h += '<tr><th style="' + th + 'width:40%;">العلاج</th><th style="' + th + '">الموضع</th><th style="' + th + 'width:120px;">التكلفة</th></tr>';
    var sub = _planBag();
    items.forEach(function(s){
      var t = planTreatmentFor(s);
      var disp = t ? getDisplayName(t, true) : (s.type || '—');
      var cell = '<div style="font-weight:700;">' + escapeHtml(disp) + '</div>';
      if (t && disp !== t.name) cell += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escapeHtml(t.name) + '</div>';
      var cost = Number(s.cost || 0); var sCur = _rowCur(s); sub[sCur] += cost;
      h += '<tr><td style="' + td + '">' + cell + '</td>'
         + '<td style="' + td + 'color:#444;">' + escapeHtml(s.description || '—') + '</td>'
         + '<td style="' + td + 'font-weight:700;white-space:nowrap;">' + fmt(cost) + ' ' + curLblOf(sCur) + '</td></tr>';
    });
    _planBagAddTo(grand, sub);
    if (hasPhases) {
      h += '<tr><td colspan="2" style="' + td + 'background:#f6f6f6;font-weight:700;text-align:left;">مجموع ' + PLAN_PHASE_LABELS[ph] + '</td>'
         + '<td style="' + td + 'background:#f6f6f6;font-weight:800;white-space:nowrap;">' + _planBagText(sub) + '</td></tr>';
    }
    h += '</table>';
  });

  h += '<div style="display:flex;justify-content:flex-start;margin-top:12px;">'
     + '<div style="border-top:3px solid var(--green);padding:10px 4px 0;font-size:16px;font-weight:800;">'
     + '💰 ' + totalLabel + ': ' + _planBagText(grand) + '</div></div>';
  return grand;
  };
  if (!_opts.length) {
    _section(planGroups(), 'الإجمالي التقديري');
  } else {
    var _cmp = [];
    _opts.forEach(function(o, i){
      h += '<div style="font-size:17px;font-weight:800;color:#111;margin:' + (i ? '26px' : '6px') + ' 0 4px;padding:6px 10px;background:#eef3ff;border-right:4px solid #3b6fd4;border-radius:6px;">🔀 الخيار ' + PLAN_OPTION_LABELS[o] + '</div>';
      var tb = _section(planGroups(planSessionsForOption(o)), 'إجمالي الخيار ' + PLAN_OPTION_LABELS[o]);
      _cmp.push('الخيار ' + PLAN_OPTION_LABELS[o] + ': ' + _planBagText(tb));
    });
    h += '<div style="margin-top:20px;padding:10px 14px;border:2px solid var(--green);border-radius:10px;font-size:14.5px;font-weight:800;">'
       + '⚖️ مقارنة الخيارات — ' + escapeHtml(_cmp.join('  ·  ')) + '</div>';
    h += '<div style="font-size:11.5px;color:#777;margin-top:6px;">كل خيار يشمل البنود المشتركة مع بنوده الخاصة؛ يُعتمد خيار واحد فقط.</div>';
  }
  h += planVisitsPrintHtml(td, th);   /* v417: ملحَق — فارغ بلا زيارات */
  h += '<div style="font-size:11.5px;color:#777;margin-top:14px;">الأسعار تقديرية وقد تتغيّر وفق المعاينة السريرية. نرحّب باستفساراتكم.</div>';
  h += '</div>';
  return h;
}

function printTreatmentPlan() {
  if (!planPlannedSessions().length) { showToast('لا توجد علاجات مخطّطة بعد'); return; }
  closeModal('printChoiceModal');
  var root = document.getElementById('printRoot');
  if (!root) return;
  root.innerHTML = buildPlanHtml();
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture (iOS Safari) — same as printPrescription
  setTimeout(cleanup, 60000);
}

async function copyTreatmentPlan() {
  var list = planPlannedSessions();
  if (!list.length) { showToast('لا توجد علاجات مخطّطة بعد'); return; }
  closeModal('printChoiceModal');
  var c = rxClinicInfo();
  var _opts = planOptionsUsed();   /* M145: فارغة ⇒ نصٌّ بايت-مطابق للسابق */
  var lines = [];
  lines.push('🦷 خطة العلاج — ' + c.clinic_name);
  lines.push('المريض: ' + ((patient && patient.name) || ''));
  lines.push('────────────');
  var _section = function(g, totalLabel){
  var hasPhases = g[1].length > 0 || g[2].length > 0 || g[3].length > 0;
  var grand = _planBag(), idx = 0;
  [1, 2, 3, 0].forEach(function(ph){
    var items = g[ph];
    if (!items.length) return;
    if (hasPhases) lines.push('📌 ' + PLAN_PHASE_LABELS[ph] + ':');
    var sub = _planBag();
    items.forEach(function(s){
      idx++;
      var t = planTreatmentFor(s);
      var disp = t ? getDisplayName(t, true) : (s.type || '—');
      var cost = Number(s.cost || 0); var sCur = _rowCur(s); sub[sCur] += cost;
      lines.push(idx + '. ' + disp + ' — ' + (s.description || '') + ' — ' + fmt(cost) + ' ' + curLblOf(sCur));
    });
    _planBagAddTo(grand, sub);
    if (hasPhases) lines.push('   مجموع المرحلة: ' + _planBagText(sub));
  });
  lines.push('────────────');
  lines.push('💰 ' + totalLabel + ': ' + _planBagText(grand));
  return grand;
  };
  if (!_opts.length) {
    _section(planGroups(), 'الإجمالي التقديري');
  } else {
    var _cmp = [];
    _opts.forEach(function(o){
      lines.push('🔀 الخيار ' + PLAN_OPTION_LABELS[o]);
      var tb = _section(planGroups(planSessionsForOption(o)), 'إجمالي الخيار ' + PLAN_OPTION_LABELS[o]);
      _cmp.push(PLAN_OPTION_LABELS[o] + ': ' + _planBagText(tb));
      lines.push('');
    });
    lines.push('⚖️ مقارنة الخيارات — ' + _cmp.join(' · '));
    lines.push('كل خيار يشمل البنود المشتركة مع بنوده؛ يُعتمد خيار واحد فقط.');
  }
  planVisitsTextLines().forEach(function(l){ lines.push(l); });   /* v417: ملحَق — فارغ بلا زيارات */
  if (c.clinic_phone) lines.push('📞 ' + c.clinic_phone);
  var text = lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ خطة العلاج ✓');
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('تم نسخ خطة العلاج ✓');
    }
  } catch (e) { console.warn('copy plan:', e); showToast('⚠️ تعذّر النسخ'); }
}
/* ═══════════════ end C ═══════════════ */

/* ============================================================
   Backlog #2 — Patient Account Statement (كشف حساب) 🧾
   OpenDental Statements / CareStack Electronic Statements parity:
   date-range picker (presets + custom), balance-forward, chronological
   unified ledger (completed sessions + payments + adjustments) with a
   running balance, closing balance, and a summary box that mirrors the
   patient card LITERALLY (computeFinancials on the FULL account).
   DISPLAY-ONLY: reads in-memory sessions/payments/adjustments — zero
   queries, zero financial writes, zero migration. Print via #printRoot
   + body.printing + sync window.print() (iOS rule). All free text
   escaped (#195).
   ============================================================ */
var _stmtPreset = 'all';

async function openStatementModal() {
  if (!patient) { showToast('لم يكتمل تحميل بيانات المريض بعد'); return; }
  closeModal('printChoiceModal');
  if (!CLINIC_SETTINGS_WA) { try { await ppLoadClinicSettings(); } catch(e){} }
  openModal('stmtModal');
}

function stmtSetPreset(p) {
  _stmtPreset = p;
  ['all','30','90','custom'].forEach(function(k){
    var el = document.getElementById('stmtChip_' + k);
    if (el) el.classList.toggle('active', k === p);
  });
  var cr = document.getElementById('stmtCustomRange');
  if (cr) cr.style.display = (p === 'custom') ? 'flex' : 'none';
}

/* {from,to} كسلاسل YYYY-MM-DD أو null (كامل السجل) */
function stmtRange() {
  if (_stmtPreset === '30' || _stmtPreset === '90') {
    var d = new Date();
    d.setDate(d.getDate() - (_stmtPreset === '30' ? 30 : 90));
    return { from: ppYmdLocal(d), to: null };
  }
  if (_stmtPreset === 'custom') {
    var f = (document.getElementById('stmtFrom') || {}).value || null;
    var t = (document.getElementById('stmtTo')   || {}).value || null;
    return { from: f, to: t };
  }
  return { from: null, to: null };
}

/* v261: الكشف مقسومٌ بالعملة (قاعدة #481). كان يجمع جلسات الليرة والدولار
   برصيدٍ متحرّك واحد للمريض ثنائي العملة (700 ل.س + 100 $ = «800») ويوسم
   الملخّص بعملة العيادة — على مستندٍ يُطبع ويُرسل للمريض. الآن: صفٌّ يحمل
   عملته، وجدولٌ ورصيدٌ متحرّك لكلّ طبقةٍ نشطة، وملخّصٌ من دلو طبقته.
   المريض الأحادي (أي عملة) = كتلةٌ واحدة بمخرج النسخة السابقة والوسم يتبع
   طبقته لا عملة العيادة. */
function stmtRowCur(r) { return (r && r.currency === 'USD') ? 'USD' : 'SYP'; }
function stmtCurLbl(cur) {
  try { return window.SyDentCurrency.labelOf(cur); } catch (e) { return (cur === 'USD') ? '$' : 'ل.س'; }
}
/* الطبقات النشطة بترتيب عملة العيادة (سابقة v200) — «نشطة» = حركة فعلية بدلو
   computeFinancials لا رصيدٌ غير صفر، فالمسدَّد بالكامل يبقى كشفاً يُعرض بصفره. */
function stmtActiveCurs(f) {
  var isAct = function(b){
    return !!(b && (b.total || b.paid || b.plannedTotal || b.completedTotal ||
              b.allocatedToProduction || b.unearnedCredit ||
              b.chargeReductions || b.refundsTotal || b._hasSplits));
  };
  var pres = { SYP: isAct(f.bags && f.bags.SYP) ? 1 : 0, USD: isAct(f.bags && f.bags.USD) ? 1 : 0 };
  var act;
  try { act = window.SyDentCurBag.active(pres); }
  catch (e) { act = ['SYP','USD'].filter(function(c){ return pres[c]; }); }
  return act.length ? act : [f.cur || 'SYP'];
}

/* صف واحد لكل حركة: مدين (على المريض) / دائن (لصالحه) — نفس دلالات computeFinancials */
function stmtAllRows() {
  var rows = [];
  (sessions || []).forEach(function(s){
    if ((s.status || 'completed') === 'planned') return;   // المخطّط تقدير — ليس مستحقاً
    var label = s.type || s.description || 'جلسة علاج';
    if (s.tooth_num != null) label += ' (سن ' + s.tooth_num + ')';
    rows.push({ date: s.date || String(s.created_at||'').slice(0,10), ca: s.created_at || '',
                label: label, note: (s.type && s.description) ? s.description : '',
                debit: Number(s.cost||0), credit: 0, currency: s.currency });
  });
  (payments || []).forEach(function(p){
    rows.push({ date: p.date || String(p.created_at||'').slice(0,10), ca: p.created_at || '',
                label: 'دفعة' + (p.method ? ' — ' + p.method : ''), note: p.notes || '',
                debit: 0, credit: Number(p.amount||0), currency: p.currency });
  });
  (Array.isArray(adjustments) ? adjustments : []).forEach(function(a){
    var amt = parseFloat(a.amount) || 0;
    if (amt <= 0) return;
    var isRefund = a.kind === 'refund';
    rows.push({ date: a.date || String(a.created_at||'').slice(0,10), ca: a.created_at || '',
                label: adjKindLabel(a.kind), note: a.notes || '',
                debit: isRefund ? amt : 0, credit: isRefund ? 0 : amt, currency: a.currency });
  });
  rows.sort(function(x,y){
    var c = String(x.date).localeCompare(String(y.date));
    return c !== 0 ? c : String(x.ca).localeCompare(String(y.ca));
  });
  return rows;
}

/* يقسم الحركات: قبل الفترة (رصيد سابق) / ضمنها — الرصيد موجب = على المريض.
   cur: طبقة العملة — الحارس داخل نفس نطاق التكرار (بند ١-ب) فلا يُجمع رقمان
   من عملتين أبداً. */
function stmtBuildData(from, to, cur) {
  var all = stmtAllRows();
  var opening = 0, inRange = [];
  all.forEach(function(r){
    if (stmtRowCur(r) !== cur) return;
    if (from && String(r.date) < from) { opening += r.debit - r.credit; return; }
    if (to && String(r.date) > to) return;
    inRange.push(r);
  });
  var run = opening;
  inRange.forEach(function(r){ if (stmtRowCur(r) !== cur) return; run += r.debit - r.credit; r.bal = run; });
  return { opening: opening, rows: inRange, closing: run };
}

function stmtBalWord(v, cur) {
  var lbl = stmtCurLbl(cur), eps = (cur === 'USD') ? 0.005 : 0.5;
  if (v > eps)  return fmt(v) + ' ' + lbl + ' (على المريض)';
  if (v < -eps) return fmt(Math.abs(v)) + ' ' + lbl + ' (رصيد للمريض)';
  return 'مسدّد';
}

/* كتلة طبقةٍ واحدة: الجدول + الرصيد الختامي + ملخّص الحساب من دلو الطبقة */
function stmtLayerHtml(cur, from, to, L, partial, td, th) {
  var d = stmtBuildData(from, to, cur);
  var lbl = stmtCurLbl(cur), eps = (cur === 'USD') ? 0.005 : 0.5;
  var h = '';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13.5px;">';
  h += '<thead><tr style="background:var(--green);color:#06371f;">'
    + '<th style="' + th + 'width:92px;">التاريخ</th>'
    + '<th style="' + th + '">البيان</th>'
    + '<th style="' + th + 'width:96px;">مدين</th>'
    + '<th style="' + th + 'width:96px;">دائن</th>'
    + '<th style="' + th + 'width:110px;">الرصيد</th>'
    + '</tr></thead><tbody>';
  if (from) {
    h += '<tr style="background:#fafafa;"><td style="' + td + '">—</td>'
      + '<td style="' + td + 'font-weight:700;">رصيد سابق (قبل الفترة)</td>'
      + '<td style="' + td + '"></td><td style="' + td + '"></td>'
      + '<td style="' + td + 'font-weight:700;">' + fmt(d.opening) + '</td></tr>';
  }
  if (!d.rows.length) {
    h += '<tr><td colspan="5" style="' + td + 'color:#777;text-align:center;">لا توجد حركات ضمن الفترة المحددة.</td></tr>';
  }
  d.rows.forEach(function(r){
    h += '<tr>'
      + '<td style="' + td + 'white-space:nowrap;">' + escapeHtml(fmtDNum(r.date)) + '</td>'
      + '<td style="' + td + '"><span style="font-weight:700;">' + escapeHtml(r.label) + '</span>'
      + (r.note ? '<div style="font-size:11px;color:#666;">' + escapeHtml(r.note) + '</div>' : '')
      + '</td>'
      + '<td style="' + td + '">' + (r.debit  ? fmt(r.debit)  : '') + '</td>'
      + '<td style="' + td + '">' + (r.credit ? fmt(r.credit) : '') + '</td>'
      + '<td style="' + td + '">' + fmt(r.bal) + '</td>'
      + '</tr>';
  });
  h += '</tbody></table>';

  // الرصيد الختامي
  h += '<div style="margin-top:10px;font-size:14.5px;font-weight:800;">'
    + 'الرصيد الختامي' + (partial ? ' (حتى نهاية الفترة)' : '') + ': '
    + '<span style="color:' + (d.closing > eps ? '#b00' : '#080') + ';">' + escapeHtml(stmtBalWord(d.closing, cur)) + '</span></div>';

  // ملخّص كامل الحساب — يطابق بطاقة المريض حرفياً (أولويات renderStats نفسها) داخل الطبقة
  h += '<div style="border:1px solid #d0d0d0;border-radius:10px;padding:12px 16px;margin-top:16px;font-size:13.5px;">';
  h += '<div style="font-weight:800;margin-bottom:6px;">ملخّص الحساب' + (partial ? ' <span style="font-weight:400;font-size:11.5px;color:#666;">(محسوب على كامل الحساب لا الفترة)</span>' : '') + '</div>';
  h += '<div>إجمالي العلاج المنجز (صافي): <strong>' + fmt(L.netCompleted) + ' ' + lbl + '</strong></div>';
  h += '<div>إجمالي المدفوع: <strong>' + fmt(L.paid) + ' ' + lbl + '</strong></div>';
  if (L.trueBalance > eps) {
    h += '<div style="color:#b00;font-weight:800;">⚠️ على المريض: ' + fmt(L.trueBalance) + ' ' + lbl
      + (L.unearnedCredit > eps ? ' <span style="font-weight:400;">(مع رصيد مقدّم ' + fmt(L.unearnedCredit) + ' ' + lbl + ')</span>' : '') + '</div>';
  } else if (L.unearnedCredit > eps) {
    h += '<div style="color:#1565c0;font-weight:800;">💳 رصيد مقدّم: ' + fmt(L.unearnedCredit) + ' ' + lbl + '</div>';
  } else if (L.trueBalance < -eps) {
    h += '<div style="color:#a07800;font-weight:800;">💸 يستحقّه المريض: ' + fmt(Math.abs(L.trueBalance)) + ' ' + lbl + '</div>';
  } else if (L.completedTotal > eps) {
    h += '<div style="color:#080;font-weight:800;">✓ الحساب مكتمل</div>';
  }
  if (L.plannedTotal > eps) {
    h += '<div style="font-size:11.5px;color:#666;margin-top:4px;">علاج مخطّط (تقديري — غير مستحق): ' + fmt(L.plannedTotal) + ' ' + lbl + '</div>';
  }
  h += '</div>';
  return h;
}

function buildStatementHtml(from, to) {
  var c = rxClinicInfo();
  var f = computeFinancials();
  var curs = stmtActiveCurs(f);
  var partial = !!(from || to);
  var todayStr = SyDT.numDate(new Date());   // v487: كشفُ الحساب المطبوع أرقاماً
  var periodStr = !partial ? 'كامل السجل'
    : 'من ' + (from ? fmtDNum(from) : 'البداية') + ' إلى ' + (to ? fmtDNum(to) : 'اليوم');
  var td = 'padding:8px 10px;border:1px solid #d0d0d0;';
  var th = 'padding:9px 10px;border:1px solid #d0d0d0;text-align:right;';

  var h = '<div style="direction:rtl;font-family:Cairo,Tahoma,sans-serif;color:#111;max-width:780px;margin:0 auto;padding:24px;">';

  // الرأس — نفس بنية الروشتة
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--green);padding-bottom:14px;margin-bottom:10px;">';
  h += '<div><div style="font-size:24px;font-weight:800;color:#111;">' + escapeHtml(c.clinic_name) + '</div>';
  if (c.license_no) h += '<div style="font-size:12px;color:#666;margin-top:2px;">رقم النقابة: ' + escapeHtml(c.license_no) + '</div>';
  h += '</div>';
  h += '<div style="text-align:left;font-size:13px;color:#444;">';
  if (c.clinic_phone) h += '<div>📞 ' + escapeHtml(c.clinic_phone) + '</div>';
  h += '<div style="margin-top:4px;">' + escapeHtml(todayStr) + '</div>';
  h += '</div></div>';

  h += '<div style="font-size:19px;font-weight:800;margin:6px 0 10px;">🧾 كشف حساب</div>';

  // بيانات المريض + الفترة
  h += '<div style="background:#f6f6f6;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#222;">';
  h += '<strong>المريض:</strong> ' + escapeHtml(patient.name || '');
  if (patient.phone) h += ' &nbsp;•&nbsp; 📞 ' + escapeHtml(patient.phone);
  h += '<div style="margin-top:4px;font-size:13px;color:#555;"><strong>الفترة:</strong> ' + escapeHtml(periodStr) + '</div>';
  if (curs.length > 1) h += '<div style="margin-top:4px;font-size:12px;color:#8a6d00;">⚠️ لهذا المريض حسابان بعملتين منفصلتين — كلُّ كشفٍ أدناه بعملته ولا يُجمعان.</div>';
  h += '</div>';

  // كتلةٌ لكل طبقة نشطة — عنوانُ الطبقة يظهر فقط حين تتعدّد
  curs.forEach(function(cur, i){
    if (curs.length > 1) {
      h += '<div style="font-size:15px;font-weight:800;margin:' + (i ? '22px' : '4px') + ' 0 8px;padding:6px 10px;background:#f0f0f0;border-radius:8px;">'
        + (cur === 'USD' ? '💵 حساب الدولار' : '💴 حساب الليرة') + ' <span style="font-weight:400;font-size:12px;color:#666;">(بالـ' + escapeHtml(stmtCurLbl(cur)) + ')</span></div>';
    }
    h += stmtLayerHtml(cur, from, to, f.bags[cur], partial, td, th);
  });

  // التذييل
  h += '<div style="margin-top:40px;display:flex;justify-content:space-between;font-size:13px;color:#444;">';
  h += '<div>التوقيع: ____________________</div>';
  h += '<div>' + escapeHtml(c.clinic_name) + '</div>';
  h += '</div>';

  h += '</div>';
  return h;
}

function printStatement() {
  if (!patient) { showToast('لم يكتمل تحميل بيانات المريض بعد'); return; }
  var r = stmtRange();
  closeModal('stmtModal');
  var root = document.getElementById('printRoot');
  if (!root) return;
  root.innerHTML = buildStatementHtml(r.from, r.to);
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture — iOS Safari blocks print() fired from setTimeout (transient user-activation is lost → 'blocked from automatically printing'). Content is inline SVG/CSS only; layout flushes before the print snapshot.
  setTimeout(cleanup, 60000);
}

/* النسخة النصية لطبقةٍ واحدة (واتساب) */
function stmtLayerLines(cur, from, to, L, lines) {
  var d = stmtBuildData(from, to, cur);
  var lbl = stmtCurLbl(cur), eps = (cur === 'USD') ? 0.005 : 0.5;
  if (from) lines.push('رصيد سابق: ' + fmt(d.opening) + ' ' + lbl);
  if (!d.rows.length) lines.push('لا توجد حركات ضمن الفترة.');
  d.rows.forEach(function(row){
    var amt = row.debit ? ('+' + fmt(row.debit)) : ('−' + fmt(row.credit));
    lines.push(fmtDNum(row.date) + ' — ' + row.label + ' — ' + amt + ' ' + lbl + ' — الرصيد: ' + fmt(row.bal));
  });
  lines.push('────────────');
  lines.push('الرصيد الختامي: ' + stmtBalWord(d.closing, cur));
  if (L.trueBalance > eps)            lines.push('⚠️ المستحق على كامل الحساب: ' + fmt(L.trueBalance) + ' ' + lbl);
  else if (L.unearnedCredit > eps)    lines.push('💳 رصيد مقدّم: ' + fmt(L.unearnedCredit) + ' ' + lbl);
  else if (L.trueBalance < -eps)      lines.push('💸 يستحقّه المريض: ' + fmt(Math.abs(L.trueBalance)) + ' ' + lbl);
}

async function copyStatement() {
  if (!patient) { showToast('لم يكتمل تحميل بيانات المريض بعد'); return; }
  var r = stmtRange();
  closeModal('stmtModal');
  var c = rxClinicInfo();
  var f = computeFinancials();
  var curs = stmtActiveCurs(f);
  var partial = !!(r.from || r.to);
  var lines = [];
  lines.push('🧾 كشف حساب — ' + c.clinic_name);
  lines.push('المريض: ' + (patient.name || ''));
  lines.push('الفترة: ' + (!partial ? 'كامل السجل'
    : 'من ' + (r.from ? fmtDNum(r.from) : 'البداية') + ' إلى ' + (r.to ? fmtDNum(r.to) : 'اليوم')));
  lines.push('────────────');
  curs.forEach(function(cur, i){
    if (curs.length > 1) {
      if (i) lines.push('────────────');
      lines.push(cur === 'USD' ? '💵 حساب الدولار:' : '💴 حساب الليرة:');
    }
    stmtLayerLines(cur, r.from, r.to, f.bags[cur], lines);
  });
  if (c.clinic_phone) lines.push('📞 ' + c.clinic_phone);
  var text = lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ كشف الحساب ✓');
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('تم نسخ كشف الحساب ✓');
    }
  } catch (e) { console.warn('copy statement:', e); showToast('⚠️ تعذّر النسخ'); }
}
/* ═══════════════ end Backlog #2 (statement) ═══════════════ */

/* ============================================================
   Backlog #3 — Payment Plans (خطط الأقساط) 💰
   Dentrix Ascend / CareStack parity minus Auto-Debit (manual-payment
   market → WhatsApp reminder). FULLY-DERIVED scheduling layer:
   covered = SUM(payments since start_date, capped at total)
   k = FLOOR(covered / installment) → next due = start + k×period.
   Recording a payment through the EXISTING path moves the due date
   automatically — ZERO financial writes here, offline-proof,
   self-healing. Reads in-memory `payments` + `patientPlans`.
   MIRRORS: ppPlanAddPeriod/ppPlanCalc ↔ patients.html
   prmPlanAddPeriod/prmPlanCalc (behavioral, check-mirrors.js) ·
   PP_DEFAULT_INST_TPL ↔ patients DEFAULT_INST_TPL ↔ settings
   DEFAULT_INSTALLMENT_TEMPLATE (byte-parity).
   ============================================================ */
var PP_DEFAULT_INST_TPL = 'مرحباً {patient_first_name}،\nنذكّرك بأن قسطك البالغ {installment_amount} {currency} مستحق بتاريخ {due_date} في {clinic_name}. 💰\nشكراً لالتزامك 🙏';
var _planEditingId = null;
var _planSaveInFlight = false;

var PLAN_FREQ_AR = { weekly:'أسبوعي', biweekly:'كل أسبوعين', monthly:'شهري' };

/* وسمُ عملة الخطة — الخطةُ كتلةٌ بعملةٍ واحدة (v180) ويقسم بها ppPlanCalc، فالوسمُ
   يتبعها لا عملةَ العيادة: رقمٌ صحيح تحت وحدةٍ كاذبة خطأٌ كامل (صنف v181/v208).
   NULL (ما قبل M125) = SYP بمرآة ppPlanCalc حرفياً. labelOf هو المصدر الواحد. */
function ppPlanCurLbl(pl) {
  var c = (pl && pl.currency === 'USD') ? 'USD' : 'SYP';
  try { return window.SyDentCurrency.labelOf(c); } catch (e) { return (c === 'USD') ? '$' : 'ل.س'; }
}

// ── MIRROR PAIR ── ppPlanAddPeriod (هنا) ↔ prmPlanAddPeriod (patients.html) — سلوكياً عبر check-mirrors.js
function ppPlanAddPeriod(startYmd, freq, k){
  var p = String(startYmd).slice(0,10).split('-');
  var y = +p[0], m = +p[1], d = +p[2];
  if (freq === 'weekly' || freq === 'biweekly') {
    var dt = new Date(Date.UTC(y, m - 1, d + (freq === 'weekly' ? 7 : 14) * k));
    return dt.toISOString().slice(0,10);
  }
  // monthly — end-of-month clamp (31 كانون الثاني + شهر → 28/29 شباط)
  var mm = (m - 1) + k;
  var yy = y + Math.floor(mm / 12);
  mm = ((mm % 12) + 12) % 12;
  var last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yy, mm, Math.min(d, last))).toISOString().slice(0,10);
}

// ── MIRROR PAIR ── ppPlanCalc (هنا) ↔ prmPlanCalc (patients.html) — سلوكياً عبر check-mirrors.js
function ppPlanCalc(plan, pays, todayYmd){
  var total = Number(plan.total || 0);
  var inst  = Number(plan.installment_amount || 0);
  /* قاعدة #481: الخطة كتلةٌ واحدة بعملةٍ واحدة (M125)، فدفعةٌ بعملةٍ أخرى
   * لا تغطّي منها شيئاً — جمعُها كان يقفز بالاستحقاق ويعلن الخطة مغطّاة زوراً.
   * الطيّ مكرَّرٌ حرفياً بالنسختين عمداً: المرآة تبقى مكتفيةً ذاتياً. */
  var planCur = (plan && plan.currency === 'USD') ? 'USD' : 'SYP';
  var covered = 0;
  (pays || []).forEach(function(p){
    if (((p && p.currency === 'USD') ? 'USD' : 'SYP') !== planCur) return;
    var d = String(p.date || String(p.created_at || '').slice(0,10)).slice(0,10);
    if (plan.start_date && d < String(plan.start_date).slice(0,10)) return;
    covered += Number(p.amount || 0);
  });
  if (covered > total) covered = total;
  var k = inst > 0 ? Math.floor(covered / inst) : 0;
  var count = inst > 0 ? Math.ceil(total / inst) : 0;
  var done = covered >= total - 0.5;
  var nextDue = done ? null : ppPlanAddPeriod(String(plan.start_date || todayYmd), plan.frequency || 'monthly', k);
  var overdueDays = 0;
  if (nextDue && todayYmd && nextDue < todayYmd) {
    var a = String(nextDue).split('-'), b = String(todayYmd).split('-');
    overdueDays = Math.round((Date.UTC(+b[0], +b[1]-1, +b[2]) - Date.UTC(+a[0], +a[1]-1, +a[2])) / 86400000);
  }
  return { covered: covered, k: k, count: count, done: done, nextDue: nextDue,
           overdueDays: overdueDays, remaining: Math.max(0, total - covered) };
}

function renderPaymentPlan(){
  var el = document.getElementById('paymentPlanContent');
  if (!el) return;
  var actives = (patientPlans || []).filter(function(pl){ return pl.status === 'active'; });
  if (!actives.length) {
    var lastPl = (patientPlans || [])[0];
    el.innerHTML = '<div class="empty" style="padding:14px;"><div class="empty-icon">💰</div>لا توجد خطة أقساط نشطة'
      + (lastPl ? '<div style="font-size:11.5px;color:var(--text2);margin-top:4px;">آخر خطة: ' + (lastPl.status === 'completed' ? 'مكتملة ✓' : 'ملغاة') + '</div>' : '')
      + '</div>';
    return;
  }
  var today = ppYmdLocal();
  var html = '';
  actives.forEach(function(pl){
    var c = ppPlanCalc(pl, payments, today);
    var pct = Number(pl.total) > 0 ? Math.min(100, Math.round(c.covered * 100 / Number(pl.total))) : 0;
    var dueLine;
    if (c.done) {
      dueLine = '<span style="color:var(--green);font-weight:700;">✓ مغطّاة بالكامل<span data-sub-write> — اضغط «إكمال» لإغلاقها</span></span>';
    } else if (c.overdueDays > 0) {
      dueLine = '<span style="color:var(--red);font-weight:700;">⚠️ قسط متأخر ' + c.overdueDays + ' يوم — استحقّ بتاريخ ' + fmtDNum(c.nextDue) + '</span>';
    } else {
      dueLine = 'القسط القادم: <strong>' + fmtDNum(c.nextDue) + '</strong>';
    }
    html += '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">'
      + '<div style="font-weight:800;">' + escapeHtml(pl.title || 'خطة أقساط') + ' <span style="font-weight:400;font-size:12px;color:var(--text2);">(' + (PLAN_FREQ_AR[pl.frequency] || pl.frequency) + ' — ' + fmt(pl.installment_amount) + ' ' + ppPlanCurLbl(pl) + ')</span></div>'
      + '<div style="font-size:12.5px;color:var(--text2);">' + fmt(c.covered) + ' / ' + fmt(pl.total) + ' ' + ppPlanCurLbl(pl) + ' · ' + c.k + '/' + c.count + ' قسط</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border-radius:6px;height:8px;margin:8px 0;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:var(--green);"></div></div>'
      + '<div style="font-size:13px;">' + dueLine + '</div>'
      + (pl.notes ? '<div style="font-size:11.5px;color:var(--text2);margin-top:4px;">' + escapeHtml(pl.notes) + '</div>' : '')
      + '<div class="sy-acts" style="margin-top:10px;">'
      + '<button class="sy-act" onclick="planWa(\'' + pl.id + '\')">📱 تذكير واتساب</button>'
      + '<button class="sy-act" onclick="openPlanModal(\'' + pl.id + '\')">✏️ تعديل</button>'
      + (c.done ? '<button class="sy-act sy-act-primary" onclick="planSetStatus(\'' + pl.id + '\',\'completed\')">✅ إكمال</button>' : '')
      + '<button class="sy-act sy-act-danger" onclick="planSetStatus(\'' + pl.id + '\',\'cancelled\')">✖ إلغاء الخطة</button>'
      + '</div></div>';
  });
  el.innerHTML = html;
}

function openPlanModal(planId){
  if (!patient) { showToast('لم يكتمل تحميل بيانات المريض بعد'); return; }
  _planEditingId = planId || null;
  var pl = planId ? (patientPlans || []).find(function(x){ return x.id === planId; }) : null;
  document.getElementById('planModalTitle').textContent = pl ? '💰 تعديل خطة الأقساط' : '💰 خطة أقساط جديدة';
  document.getElementById('planTitle').value = pl ? (pl.title || '') : '';
  document.getElementById('planTotal').value = pl ? pl.total : '';
  document.getElementById('planInst').value  = pl ? pl.installment_amount : '';
  document.getElementById('planFreq').value  = pl ? pl.frequency : 'monthly';
  document.getElementById('planStart').value = pl ? String(pl.start_date).slice(0,10) : ppYmdLocal();
  document.getElementById('planNotes').value = pl ? (pl.notes || '') : '';
  planRecalc('inst');
  // M125: مبدّل عملة الخطة — الخطة كتلةٌ واحدة، والقسط يرث عملة إجماليها.
  // والتعديل يفتح بعملة الخطة المحفوظة لا بعملة العيادة (صنف v181)، وتبديلُ
  // العملة يُفرّغ الإجمالي والقسط معاً — خطةٌ نصفها بعملةٍ ونصفها بأخرى عبث.
  try { if (pl) window.SyDentCurPick.pin('planTotal', (pl.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
  try {
    window.SyDentCurPick.mount('planTotal', { clearAlso: ['planInst'], onChange: function (c) {
      var _pi = document.getElementById('planInst');
      if (_pi) {
        _pi.step = (c === 'USD') ? '0.01' : '1';
        _pi.setAttribute('inputmode', (c === 'USD') ? 'decimal' : 'numeric');
      }
      var _pl = document.getElementById('planInstLbl');
      if (_pl) _pl.textContent = (c === 'USD') ? '$' : 'ل.س';
    } });
  } catch (e) {}
  openModal('planModal');
}

/* Dentrix-style bi-directional calc: total ↔ installment ↔ count */
function planRecalc(src){
  var t = parseFloat(document.getElementById('planTotal').value) || 0;
  var i = parseFloat(document.getElementById('planInst').value)  || 0;
  var n = parseInt(document.getElementById('planCount').value, 10) || 0;
  // v261: عملة الخطة من مبدّل المودال لا عملة العيادة — التلميح كان يوسم قسطاً
  // دولارياً «ل.س»، وMath.ceil كان يبتر سنتات الدولار (10.50 ÷ 1 ⇒ 11 > الإجمالي).
  var _pc = 'SYP';
  try { _pc = (window.SyDentCurPick.read('planTotal') === 'USD') ? 'USD' : 'SYP'; } catch (e) {}
  var _lbl = (_pc === 'USD') ? '$' : 'ل.س';
  try { _lbl = window.SyDentCurrency.labelOf(_pc); } catch (e) {}
  var _ceil = function(v){ return (_pc === 'USD') ? Math.ceil(v * 100 - 1e-9) / 100 : Math.ceil(v); };
  if (src === 'count' && t > 0 && n > 0) {
    i = _ceil(t / n);
    document.getElementById('planInst').value = i;
  } else if (t > 0 && i > 0) {
    n = Math.ceil(t / i - 1e-9);
    document.getElementById('planCount').value = n;
  }
  var _last = Math.round((t - (n - 1) * i) * 100) / 100;
  var hint = document.getElementById('planHint');
  if (hint) hint.textContent = (t > 0 && i > 0)
    ? n + ' قسط × ' + fmt(i) + ' ' + _lbl + (Math.abs(n * i - t) > 1e-9 ? ' (الأخير ' + fmt(_last) + ' ' + _lbl + ')' : '')
    : '';
}

var savePaymentPlan = ppGuarded('savePaymentPlan', _savePaymentPlan_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _savePaymentPlan_inner() {
  if (_planSaveInFlight) return;
  var total = parseFloat(document.getElementById('planTotal').value) || 0;
  var inst  = parseFloat(document.getElementById('planInst').value)  || 0;
  var freq  = document.getElementById('planFreq').value || 'monthly';
  var start = document.getElementById('planStart').value;
  if (total <= 0 || inst <= 0) { showToast('⚠️ أدخل الإجمالي وقيمة القسط'); return; }
  if (inst > total)            { showToast('⚠️ قيمة القسط أكبر من الإجمالي'); return; }
  if (!start)                  { showToast('⚠️ حدّد تاريخ أول قسط'); return; }
  _planSaveInFlight = true;
  var btn = document.getElementById('planSaveBtn'); if (btn) btn.disabled = true;
  try {
    var payload = {
      title: (document.getElementById('planTitle').value || '').trim() || null,
      // M125: الخطة كتلةٌ واحدة بعملةٍ واحدة (خلط عملتين بخطة أقساط لا معنى له)،
      // والتقريب أُزيل كي لا تُدمَّر سنتات الدولار.
      total: Math.round(total * 100) / 100,
      installment_amount: Math.round(inst * 100) / 100,
      currency: window.SyDentCurPick.read('planTotal'),
      frequency: freq,
      start_date: start,
      notes: (document.getElementById('planNotes').value || '').trim() || null
    };
    var res;
    if (_planEditingId) {
      res = await window.sb.from('payment_plans').update(payload)
        .eq('id', _planEditingId).eq('doctor_id', currentUser.id).select().single();
    } else {
      payload.doctor_id = currentUser.id;
      payload.patient_id = patientId;
      payload.status = 'active';
      res = await window.sb.from('payment_plans').insert(payload).select().single();
    }
    if (res.error) {
      var em = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/payment_plans|42P01|PGRST205/i.test(em)) { showToast('⚠️ يلزم تطبيق Migration 88 أولاً'); return; }
      throw res.error;
    }
    if (_planEditingId) {
      patientPlans = patientPlans.map(function(x){ return x.id === _planEditingId ? res.data : x; });
    } else {
      patientPlans.unshift(res.data);
    }
    if (window.logAudit) window.logAudit(_planEditingId ? 'payment_plan.update' : 'payment_plan.create', {
      patient_id: patientId,
      description: (_planEditingId ? 'تعديل' : 'إنشاء') + ' خطة أقساط: ' + fmt(payload.total) + ' ' + ppPlanCurLbl(payload) + ' — ' + fmt(payload.installment_amount) + ' ' + ppPlanCurLbl(payload) + ' ' + (PLAN_FREQ_AR[freq] || freq)
    });
    closeModal('planModal');
    renderPaymentPlan();
    showToast('تم حفظ خطة الأقساط ✓');
  } catch (e) {
    console.warn('savePaymentPlan:', e);
    showToast('⚠️ تعذّر حفظ الخطة');
  } finally {
    _planSaveInFlight = false;
    if (btn) btn.disabled = false;
  }
}

var planSetStatus = ppGuarded('planSetStatus', _planSetStatus_inner, '⏳');   /* v284: قفل + انشغال */
async function _planSetStatus_inner(planId, status) {
  var label = status === 'completed' ? 'إكمال' : 'إلغاء';
  if (status === 'cancelled' && !await SyDialog.confirm({ message: 'إلغاء خطة الأقساط؟ (لا يمسّ أي دفعة مسجّلة)', danger: true })) return;
  try {
    var res = await window.sb.from('payment_plans').update({ status: status })
      .eq('id', planId).eq('doctor_id', currentUser.id).select().single();
    if (res.error) throw res.error;
    patientPlans = patientPlans.map(function(x){ return x.id === planId ? res.data : x; });
    if (window.logAudit) window.logAudit('payment_plan.' + status, {
      patient_id: patientId, description: label + ' خطة أقساط'
    });
    renderPaymentPlan();
    showToast('تم ' + label + ' الخطة ✓');
  } catch (e) { console.warn('planSetStatus:', e); showToast('⚠️ تعذّر تحديث الخطة'); }
}

function planWa(planId){
  var pl = (patientPlans || []).find(function(x){ return x.id === planId; });
  if (!pl) return;
  var n = ppNormalizePhone(patient && patient.phone);
  if (!n) { showToast('⚠️ رقم غير صالح — للأرقام غير السورية أضف رمز الدولة (مثال +90…)'); return; }
  var c = rxClinicInfo();
  var calc = ppPlanCalc(pl, payments, ppYmdLocal());
  var tplRaw = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.whatsapp_installment_template) || '';
  var tpl = tplRaw.trim() ? tplRaw : PP_DEFAULT_INST_TPL;
  /* القيم الخاصة بالقسط — تُمرَّر لمودال الكتابة كخريطة عناصر نائبة فتبقى
     متاحة للقوالب المحفوظة وللصياغة الذكية بعد فتح المودال. */
  var instVars = {
    clinic_name: c.clinic_name || 'عيادتنا',
    clinic_phone: c.clinic_phone || '',
    installment_amount: fmt(pl.installment_amount),
    currency: ppPlanCurLbl(pl),   /* {currency} — وحدةُ الخطة لا العيادة */
    due_date: calc.nextDue ? fmtDNum(calc.nextDue) : fmtDNum(ppYmdLocal()),
    remaining_total: fmt(calc.remaining)
  };
  /* قالبٌ مخصص يحمل عملةً محفورة لا تطابق عملة الخطة وبلا {currency}: لا يُعاد
     كتابته (v186 — نصّ الطبيب ملكُه) بل يُعلَن قبل الإرسال، فلا تخرج وحدةٌ كاذبة بصمت. */
  var _plLbl = instVars.currency;
  if (tpl.indexOf('{currency}') === -1
      && ((_plLbl !== 'ل.س' && tpl.indexOf('ل.س') !== -1) || (_plLbl !== '$' && tpl.indexOf('$') !== -1))) {
    showToast('⚠️ قالب تذكير القسط يحمل عملة ثابتة لا تطابق عملة الخطة — أضف {currency} للقالب من الإعدادات');
  }
  var msg = ppApplyPlaceholders(tpl, ppWaVarData(instVars));
  /* كان يفتح wa.me مباشرةً بلا معاينة — صار يمرّ بمودال الكتابة المشترك
     (معاينة + تعديل + قوالب + صياغة ذكية)، والإرسال بمسار ppWaComposeSend
     القائم حرفياً. 🔒 عرض/تذكير فقط — صفر كتابة مالية (#260). */
  ppWaComposeOpen('💰 تذكير بالقسط', msg, true, instVars, 'installment_due', 'installment');
}
/* ═══════════════ end Backlog #3 (payment plans) ═══════════════ */
