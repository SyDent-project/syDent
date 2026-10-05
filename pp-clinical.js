/* ═══ pp-clinical.js — SyDent decomposition extraction #8 ═══
 * الوحدات السريرية غير المالية لملف المريض: المخابر + الروشتات + تعليمات ما بعد العلاج.
 * نُقلت بايت-بايت بأربع قصّات من patient-profile.html (commit 2ad56b1):
 * LAB 10696-11484 · RX 12454-13045 · POSTOP-A 13718-13855 · POSTOP-B 14095-14330.
 * تعريفات صرفة + var حالة — صفر تنفيذ top-level. تُحمَّل بالـ<head> بعد pp-wa.js. */
/* ── LAB ORDERS ── */

/* ═══ بوابة خطة موديول المخابر — نقطة قرار واحدة ═══
   المحجوب: الإنشاء وحده (طلب جديد · إضافة مخبر · إعادة طلب — والإعادة إنشاءٌ
   متخفٍّ لأنها تُحيي حالة منتهية بلا صف جديد). المتاح: العرض والشارات وتقدّم
   الحالة والتعديل والحذف — فتخفيض الخطة لا يبتلع بيانات سريرية قائمة ولا يترك
   حالة قيد التنفيذ بلا مخرج، وتبقى تكاليفها بالمحاسبة قابلة للتفسير.
   fail-open بالتصميم (يحاكي SyDentPlan.can): الافتراضي متاح، ويبقى متاحاً لو
   تعذّر حسم الخطة أو لم يُحمَّل pp-wa.js. صفر لمس للطبقة المالية. */
function labsPlanOk() {
  return (typeof PP_LABS_PLAN_OK === 'undefined') ? true : (PP_LABS_PLAN_OK !== false);
}
function labsBlockedToast() {
  showToast('🔒 موديول المخابر غير متاح في خطتك — يمكنك متابعة الطلبات القائمة');
}

/* ══════════════════════════════════════════════════════════════════════
   M79-b — طلبُ مخبرٍ من صفّ الجلسة بدفتر المريض.
   ──────────────────────────────────────────────────────────────────────
   الفجوة المُبلَّغ عنها: زرّ «حفظ + إرسال لمخبر» يعيش بمودال السن حصراً، أي
   بلحظة تطبيق العلاج وحدها. فمتى حُفظت الجلسة — مخطّطةً كانت أو منجزة —
   انغلق البابُ نهائياً: لا مودالَ تعديلٍ للجلسة أصلاً، وصفُّ الدفتر يحمل
   زرَّي الإكمال والحذف لا غير. فيضطرّ الطبيب لـ«＋ طلب جديد» ويعيد كتابة كل
   شيء — والأخطر أن ذلك المسار يفتح بلا سياق فيُحفظ الطلبُ **بلا ربطٍ بجلسته**،
   أي أن عمود M79 نفسه هو ما يُفقَد (قياسٌ حيّ: 40% من الطلبات القائمة بلا ربط).

   والمنافسون كلُّهم يجعلون الربط حقلاً قابلاً للتعديل لا لحظةً تُفوَّت:
   OpenDental تسمح بطلبٍ «غير مرتبط» وتُفرد له فلتراً وزرَّ Detach، وCareStack
   تتيح فكَّ الموعد المربوط واختيار غيره، وArchy تشدّ الطلب على الإجراء نفسه.
   فالبابُ يُفتح من الجلسة، والمودالُ والحفظُ القائمان لا يُلمسان بحرف.

   🔴 الربطُ بالاسم لا بالمفتاح — وهذا ليس اختصاراً: `ledger_sessions.treatment_key`
   موجودٌ بالمخطَّط لكنه **فارغٌ على كل صفّ** (قياسٌ حيّ: 227/227 · نفس ما أثبتته
   v162 بلوحة التحكم)، فقراءتُه تعني زرّاً لا يظهر أبداً. المطابقةُ بالاسم هي
   المسار الحيّ الوحيد وهي سابقةٌ قائمة بمسار خصم المواد عند الإنجاز حرفياً.
   والجلسةُ الحرّة (أخرى/رصيد سابق) لا تطابق شيئاً ⇒ لا زرّ، وهو الصواب.
   ══════════════════════════════════════════════════════════════════════ */

// علاجُ الجلسة من الكتالوج — مرآةُ دلالةِ مُطابِق خصم المواد حرفياً.
function _ppSessLabTr(sess) {
  if (!sess || !sess.type) return null;
  var list = (typeof TREATMENTS !== 'undefined' && Array.isArray(TREATMENTS)) ? TREATMENTS : [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t && (t.name === sess.type || t.label === sess.type)) return t;
  }
  return null;
}

// حالةُ الجلسة تجاه المخبر: 'has' لها طلبٌ مربوط · 'can' تستحقّ زرّاً · 'none'.
// الحالة السريرية (مخطّط/منجز) **لا تدخل الحكم عمداً**: التاجُ يُرسَل للمخبر
// بعد الطبعة أي بعد الإنجاز عادةً، وقصرُ الزرّ على المخطّط كان سيقلب الواقع.
function _ppSessLabState(sess) {
  if (!sess || !sess.id) return 'none';
  var orders = (typeof labOrders !== 'undefined' && Array.isArray(labOrders)) ? labOrders : [];
  for (var i = 0; i < orders.length; i++) {
    if (orders[i] && orders[i].session_id === sess.id) return 'has';
  }
  if (!labsPlanOk()) return 'none';          // بوابة الخطة: الزرّ سطحُ إنشاء
  var tr = _ppSessLabTr(sess);
  if (!tr) return 'none';
  return needsLab(tr.id) ? 'can' : 'none';
}

// M127: هل طلبُ هذه الجلسة ما زال مسودّةً؟ يُقرأ بعد أن يقول _ppSessLabState
// إن لها طلباً — فصلٌ متعمّد: «هل لها طلب» و«ما حالته» سؤالان مختلفان.
function _ppSessLabIsDraft(sess) {
  if (!sess || !sess.id) return false;
  var orders = (typeof labOrders !== 'undefined' && Array.isArray(labOrders)) ? labOrders : [];
  for (var i = 0; i < orders.length; i++) {
    if (orders[i] && orders[i].session_id === sess.id) return _labIsDraft(orders[i]);
  }
  return false;
}

// فتحُ مودال الطلب معبّأً من الجلسة. صفر كتابة هنا — الحفظ يبقى بمسار
// saveLabOrder القائم بلا لمس، وpendingLabSessionId يحمل الربط كما بمسار M79.
async function ppSessionOpenLab(sessionId) {
  var list = (typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : [];
  var sess = null;
  for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === sessionId) { sess = list[i]; break; } }
  if (!sess) { showToast('⚠️ الجلسة غير موجودة'); return; }
  var st = _ppSessLabState(sess);
  if (st === 'has') { showToast('🥽 لهذه الجلسة طلب مخبر مسجّل — عدّله من تبويب المخابر'); return; }
  if (st !== 'can') { if (!labsPlanOk()) labsBlockedToast(); return; }
  var tr = _ppSessLabTr(sess);
  // 🔴 موعدُ الجلسة لا يُمرَّر عمداً: موعدُ الطلب هو موعدُ **التركيب** بالعرف
  // المهني (OpenDental: يُربَط بموعد التسليم/التلبيس)، وموعدُ الجلسة هو موعدُ
  // التحضير — فتمريره يربط الحالة بالموعد الخطأ، والافتراضُ الموثَّق «بلا ربط»
  // يبقى سيّداً ويختار الطبيب بنفسه. والملاحظاتُ كذلك: ملاحظةُ الجلسة سريريةٌ
  // بدفتر المريض لا تعليماتٌ للمخبر، ونسخُها يُلبِسها معنى ليس لها.
  await openLabOrderModal({
    session_id:    sess.id,
    draft:         sess.status !== 'completed',   // M127
    tooth_num:     sess.tooth_num || '',
    treatment_key: tr ? tr.id : '',
    provider_id:   sess.provider_id || ''
  });
}
/* إخفاء أسطح الإنشاء الساكنة. تُستدعى من renderLabOrders حصراً: تعمل ضمن init()
   بعد أن يحسم loadAll الخطة (ppLoadClinicSettings مُنتظَرة قبل init) وتتكرّر بعد
   كل تغيير. عمداً بلا نداء عابر للملفات من pp-wa.js — patients.html تحمّل
   pp-wa.js بلا pp-clinical.js، فنداءٌ هناك كان سيرمي ReferenceError. */
function labsSyncCreateUI() {
  var ok = labsPlanOk();
  var b = document.getElementById('labNewOrderBtn');
  if (b) b.style.display = ok ? '' : 'none';
}

function getLabPendingCount() {
  return labOrders.filter(function(lo){
    return lo.status === 'sent' || lo.status === 'received';
  }).length;
}

function updateLabsBadge() {
  var n = getLabPendingCount();
  var b = document.getElementById('labsBadge');
  if (!b) return;
  if (n > 0) {
    b.textContent = n;
    b.style.display = 'inline-block';
  } else {
    b.style.display = 'none';
  }
}

function renderLabOrders() {
  if (typeof addLabBadges === 'function') addLabBadges();   // keep chart badges in sync — save/advance/delete all funnel through this render
  labsSyncCreateUI();   // بوابة الخطة: أسطح الإنشاء الساكنة
  var el = document.getElementById('labOrdersContent');
  if (!el) return;
  if (!labOrders.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🥽</div>لا توجد طلبات مخابر مسجّلة بعد'
      + (labsPlanOk() ? '<br><br><button class="btn btn-primary btn-sm" onclick="openLabOrderModal()">＋ إضافة أول طلب</button>' : '')
      + '</div>';
    updateLabsBadge();
    return;
  }
  var rows = '';
  labOrders.forEach(function(lo){
    var st = LAB_STATUSES[lo.status] || LAB_STATUSES['sent'];
    var pill = '<span class="lab-pill tone tone-' + (st.tone || 'gray') + '">' + st.ar + '</span>';
    // v482: خاناتٌ ثابتة (.sy-slots) — الخطوة · الإعادة · التعديل · الحذف، كلٌّ بعموده عبر الصفوف؛
    //       الخطوةُ تمتدّ فوق خانة الإعادة حين تغيب (طلب المالك).
    var actions = '';
    var nx = LAB_NEXT_STATUS[lo.status];
    var canRedo = (lo.status === 'received' || lo.status === 'checked') && labsPlanOk();
    if (nx) {
      actions += '<button class="sy-act sy-act-primary" data-slot="1"' + (canRedo ? '' : ' data-span-if="2"') + ' onclick="advanceLabOrder(\'' + lo.id + '\')">' + nx.label + '</button>';
    }
    if (canRedo) {
      actions += '<button class="sy-act sy-act-warn" data-slot="2" onclick="redoLabOrder(\'' + lo.id + '\')">🔄 إعادة</button>';
    }
    actions += '<button class="sy-act" data-slot="3" onclick="editLabOrder(\'' + lo.id + '\')">✏️ تعديل</button>';
    actions += '<button class="sy-act sy-act-danger" data-slot="4" onclick="delLabOrder(\'' + lo.id + '\')">🗑️ حذف</button>';
    var labDisplay = lo.lab_name || '—';
    if (lo.lab_id) {
      var lObj = allLabs.find(function(x){ return x.id === lo.lab_id; });
      if (lObj) labDisplay = lObj.name;
    }
    // v328: شارةُ السن بلا انكسار («سن» فوق «35» — صورة المالك).
    var toothChip = lo.tooth_num ? '<span class="tone tone-lime" style="border-width:1px;border-style:solid;padding:0 5px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap;">سن ' + lo.tooth_num + '</span>' : '';
    // v328: سطرُ الموبايل — التاريخ · المخبر · اللون داخل خلية نوع العمل (m-cards بـpatient-profile.css).
    // الأعمدةُ نفسُها تبقى للديسكتوب وتُخفى تحت 600px (mc-hide)، فلا يتكرّر صفٌّ ولا زرّ.
    var mMeta = [toothChip, lo.date_sent ? escapeHtml(fmtD(lo.date_sent)) : 'غير مُرسَل', escapeHtml(String(labDisplay))];
    if (lo.shade) mMeta.push('لون ' + escapeHtml(String(lo.shade)));
    rows += '<tr>'
      + '<td class="mc-hide">' + (lo.date_sent ? SyDT.cellRec(lo.date_sent, lo.created_at) : '—') + '</td>'   /* v481: تاريخُ الإرسال ووقتُه ظاهرين (كان تلميحاً يُقَصّ ويغطّي الصفّ التالي) */
      + '<td class="mc-hide">' + (toothChip || '—') + '</td>'
      + '<td class="mc-title">' + escapeHtml(lo.work_type || '—') + (window.SyLabFiles ? ' ' + SyLabFiles.badge(lo.id) : '')   /* v535 */
      +   (window.SyLabRedo ? SyLabRedo.line(lo.id) : '')   /* M160: سطرُ دورات الإعادة (مُهرَّب) */
      +   '<div class="mc-only mc-meta">' + mMeta.filter(Boolean).map(function(x){ return '<span style="white-space:nowrap;">' + x + '</span>'; }).join(' · ') + '</div></td>'
      + '<td class="mc-hide" style="color:var(--text2)">' + escapeHtml(String(labDisplay)) + '</td>'
      + '<td class="mc-hide" style="color:var(--text2)">' + escapeHtml(String(lo.shade || '—')) + '</td>'
      + '<td class="mc-side2" style="text-align:left;color:var(--text2)">' + fmt(lo.cost) + ' ' + curLblOf(lo && lo.currency) + '</td>'   // M125 · v261: بالاتجاهين
      + '<td class="mc-side">' + pill + '</td>'
      + '<td class="mc-actions" style="white-space:nowrap;"><div class="sy-acts sy-slots" style="--sy-slots:__SY_SLOTS__">' + actions + '</div></td>'
      + '</tr>';
  });
  rows = SySlots.finalize(rows, { 1: '160px', 2: '78px', 3: '82px', 4: '80px' });   // v484: تُطوى الخاناتُ غير المستعملة
  el.innerHTML = '<div style="overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;" class="no-scrollbar"><table class="data-table m-cards">'
    + '<thead><tr><th>تاريخ الإرسال</th><th>السن</th><th>نوع العمل</th><th>المخبر</th><th>اللون</th><th style="text-align:left;">التكلفة</th><th>الحالة</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
  updateLabsBadge();
}

function getLabTreatments() {
  return TREATMENTS.filter(function(t){ return needsLab(t.id); });
}

function populateLabWorkTypes(selectedKey) {
  var sel = document.getElementById('labOrderWorkType');
  if (!sel) return;
  sel.innerHTML = '';
  var labTreatments = getLabTreatments();
  if (labTreatments.length === 0) {
    // Fallback: all treatments
    TREATMENTS.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      sel.appendChild(opt);
    });
  } else {
    labTreatments.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }
  // Add "other" option
  var other = document.createElement('option');
  other.value = '_other'; other.textContent = 'أخرى';
  sel.appendChild(other);
  if (selectedKey) sel.value = selectedKey;
}

function populateLabSelect(selectedLabId) {
  var sel = document.getElementById('labOrderLabSelect');
  var hint = document.getElementById('labOrderEmptyHint');
  var saveBtn = document.getElementById('labOrderSaveBtn');
  // بوابة الخطة: زر «＋» لإضافة مخبر إنشاءٌ كذلك. هنا لا بمكان آخر، لأن هذه
  // الدالة يناديها مسارا الفتح والتعديل معاً — والتعديل يبقى متاحاً وهو محجوب.
  var labsOk = labsPlanOk();
  var addBtn = document.getElementById('ppAddLabBtn');
  if (addBtn) addBtn.style.display = labsOk ? '' : 'none';
  if (!sel) return;
  sel.innerHTML = '';
  if (!allLabs.length) {
    var opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— لا توجد مخابر —';
    sel.appendChild(opt);
    // بلا هذا السطر يبقى التلميح يقول «اضغط على ＋» وزرّ الـ＋ مخفيّ = نصّ كاذب.
    if (hint) hint.textContent = labsOk
      ? 'لم تُسجَّل أي مخابر بعد. اضغط على ＋ لإضافة أول مخبر.'
      : 'لم تُسجَّل أي مخابر بعد، وموديول المخابر غير متاح في خطتك.';
    if (hint) hint.style.display = 'block';
    if (saveBtn) saveBtn.disabled = true;
    return;
  }
  if (hint) hint.style.display = 'none';
  if (saveBtn) saveBtn.disabled = false;
  var ph = document.createElement('option');
  ph.value = ''; ph.textContent = '— اختر مخبراً —';
  sel.appendChild(ph);
  allLabs.forEach(function(l){
    var opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name + (l.phone ? ' — ' + l.phone : '');
    sel.appendChild(opt);
  });
  if (selectedLabId) sel.value = selectedLabId;
}

/* Format an appointment for display in the lab-order link dropdown. */
function fmtLabApptOption(appt) {
  var d  = appt.date || '';
  var t  = fmtTime12(appt.time);
  var tp = appt.type || '';
  var parts = [d];
  if (t)  parts.push(t);
  if (tp) parts.push(tp);
  return parts.join(' — ');
}

/* Populate the appointment-link dropdown in the lab order modal.
   Order:
     1. ''         → not linked (DEFAULT — safest)
     2. '__auto__' → auto-link to next active appointment (optional)
     3. '__new__'  → create a new appointment inline (optional)
     4. (any existing upcoming appointments for this patient)
   Patient is always the current patient (this is a patient-profile page). */
function populateLabAppointmentSelect(selectedApptId) {
  var sel = document.getElementById('labOrderAppointment');
  if (!sel) return;
  sel.innerHTML = '';
  var list = Array.isArray(upcomingAppts) ? upcomingAppts.slice() : [];

  // Option 1: not linked (the safe default)
  var noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— غير مربوط بموعد —';
  sel.appendChild(noneOpt);

  // Option 2: auto-link to the next ACTIVE upcoming appointment.
  // We filter the same way __auto__ resolution does at save time, so the
  // label in the dropdown matches exactly what will be linked on Save.
  var todayStrUI = toDay();
  var INACTIVE_UI = ['cancelled', 'broken', 'no_show', 'completed'];
  var nextActiveUI = null;
  for (var li = 0; li < list.length; li++) {
    var lap = list[li];
    if (!lap || !lap.date) continue;
    if (lap.date < todayStrUI) continue;
    if (lap.status && INACTIVE_UI.indexOf(lap.status) !== -1) continue;
    nextActiveUI = lap;
    break;
  }
  var autoOpt = document.createElement('option');
  autoOpt.value = '__auto__';
  if (nextActiveUI) {
    autoOpt.textContent = '🔄 الموعد القادم تلقائياً — (' + fmtLabApptOption(nextActiveUI) + ')';
  } else {
    autoOpt.textContent = '🔄 الموعد القادم تلقائياً — (لا يوجد موعد قادم)';
  }
  sel.appendChild(autoOpt);

  // Option 3: create a new appointment inline. Selecting this reveals date+time fields.
  var newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '📅 تحديد موعد التركيب الآن…';
  sel.appendChild(newOpt);

  // Options 4+: existing upcoming appointments for this patient
  list.forEach(function(a){
    var opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = fmtLabApptOption(a);
    sel.appendChild(opt);
  });

  // Restore previous selection if any
  if (selectedApptId === '__auto__' || selectedApptId === '__new__') {
    sel.value = selectedApptId;
  } else if (selectedApptId && list.some(function(a){ return a.id === selectedApptId; })) {
    sel.value = selectedApptId;
  } else if (selectedApptId) {
    // The linked appointment isn't in the cache (older than today, or was deleted).
    // Inject a placeholder so we don't silently lose the link on save.
    var opt2 = document.createElement('option');
    opt2.value = selectedApptId;
    opt2.textContent = '⚠️ موعد مرتبط (غير متاح حالياً)';
    sel.appendChild(opt2);
    sel.value = selectedApptId;
  } else {
    sel.value = '';
  }

  // Sync the inline new-appointment panel visibility with the current selection.
  onLabApptChange();
}

/* Show/hide the inline "new appointment" date+time fields based on the dropdown choice. */
// Populate the treating-provider dropdown from CLINIC_DOCTORS. Hides inactive
// doctors unless one is the currently-selected provider (so editing an old order
// keeps its provider).
function populateLabProviderSelect(selectedId) {
  var sel = document.getElementById('labOrderProvider');
  if (!sel) return;
  var html = '<option value="">— غير مُحدّد —</option>';
  (CLINIC_DOCTORS || []).forEach(function(d){
    if (d.is_active === false && d.id !== selectedId) return;
    html += '<option value="' + d.id + '">' +
      escapeHtml(d.name) + (d.is_owner ? ' ⭐' : '') +
      (d.is_active === false ? ' (معطل)' : '') + '</option>';
  });
  sel.innerHTML = html;
  sel.value = selectedId || '';
}

function onLabApptChange() {
  var sel = document.getElementById('labOrderAppointment');
  var box = document.getElementById('labNewApptBox');
  // Default the treating provider from the chosen appointment (override allowed).
  if (sel && sel.value && sel.value !== '__new__' && sel.value !== '__auto__') {
    var appt = (upcomingAppts || []).find(function(a){ return a.id === sel.value; });
    var provSel = document.getElementById('labOrderProvider');
    if (appt && appt.provider_id && provSel) {
      if (!Array.prototype.some.call(provSel.options, function(o){ return o.value === appt.provider_id; })) {
        populateLabProviderSelect(appt.provider_id);
      }
      provSel.value = appt.provider_id;
    }
  }
  if (!sel || !box) return;
  if (sel.value === '__new__') {
    box.style.display = 'block';
    // Pre-fill date with today if empty, to reduce friction
    var dateIn = document.getElementById('labNewApptDate');
    if (dateIn && !dateIn.value) dateIn.value = toDay();
  } else {
    box.style.display = 'none';
  }
}

/* ═══ Migration 112: قوالب طلب المخبر ═══
   نظير حرفي لقوالب الملاحظات (M95) بواجهتها (منتقٍ + 💾 + 🗑، بلا مودال إدارة)
   وبحمولة متعددة الحقول كقوالب الزرعات (M99).
   الحمولة = القابل لإعادة الاستخدام: نوع العمل · المخبر · اللون · التكلفة ·
   مهلة التنفيذ · الملاحظات. المستثنى عمداً (خاص بكل حالة): رقم السن · ربط
   الموعد · الطبيب المعالج · تاريخ الإرسال.
   🔒 العزل المالي: هذا الجدول لا يُقرأ من أي طبقة محاسبية؛ التكلفة قيمة
   افتراضية تُعبَّأ بحقل مرئي قابل للتعديل، والكتابة تبقى حصراً عبر
   _saveLabOrderInner بلا أي تغيير. */
var LAB_TEMPLATES = null;   // null = لم تُجلب بعد؛ [] = جُلبت (وقد تكون فارغة)

/* بوابة الخطة إن وُجدت. بـlabs.html الدالة غائبة عمداً — الصفحة كلها محجوبة
   أصلاً بـPAGE_MODULE — فتُقرأ «مسموح». هكذا تبقى هذه الكتلة متطابقة
   بايت-بايت بين السطحين ويحرسها check-mirrors (المجموعة K). */
function labTplGateOk(){ return (typeof labsPlanOk !== 'function') || labsPlanOk(); }

function _labTplIsMissingTableErr(e){
  return !!(e && (e.code === '42P01' || e.code === 'PGRST205' ||
    String(e.message || '').indexOf('lab_order_templates') !== -1));
}
/* الكاتب الوحيد لظهور الصف — كي لا يتسابق مع أي سطح آخر */
async function labTplRefresh(){
  try {
    if (LAB_TEMPLATES === null) {
      var res = await window.sb.from('lab_order_templates')
        .select('id, name, treatment_key, lab_id, shade, cost, currency, due_days, notes, ai_order_text, created_at')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (res.error) return;   /* قبل M112: الصف يبقى مخفياً بصمت (قاعدة #264) */
      LAB_TEMPLATES = res.data || [];
    }
    var row = document.getElementById('labTplRow');
    /* الجدول متاح ⇒ أظهر حتى مع صفر قوالب (اكتشاف الـ💾)، إلا إذا حجبت الخطة */
    if (row) row.style.display = labTplGateOk() ? '' : 'none';
    labTplPopulate();
    labTplGlowSync();
  } catch (e) { /* graceful */ }
}
function labTplGlowSync(){
  /* 💾 يضيء لحظة يصير بالمودال ما يستحق الحفظ — نظير snTplGlowSync */
  var btn = document.getElementById('labTplSaveBtn');
  if (!btn) return;
  var v = function(id){ var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
  btn.classList.toggle('lit', !!(v('labOrderLabSelect') || v('labOrderShade') ||
                                 v('labOrderCost') || v('labOrderNotes')));
}
function labTplPopulate(){
  var opts = '<option value="">— بلا قالب —</option>';
  (LAB_TEMPLATES || []).forEach(function(t){
    opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
  });
  var sel = document.getElementById('labTplPick');
  if (sel) { sel.innerHTML = opts; sel.value = ''; }
}
function labTplApply(tid){
  if (!tid) return;
  var tpl = (LAB_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!tpl) return;
  /* نوع العمل: populateLabWorkTypes تُسقط أي مفتاح غير موجود بصمت فيصير
     الحفظ «أخرى» — نتحقق صراحةً ونرجع للسابق ونبلّغ بدل الانحدار الصامت. */
  if (tpl.treatment_key) {
    var ws = document.getElementById('labOrderWorkType');
    if (ws) {
      var before = ws.value;
      ws.value = tpl.treatment_key;
      if (ws.value !== tpl.treatment_key) {
        ws.value = before;
        showToast('⚠️ نوع العمل بالقالب لم يعد بقائمة العلاجات — اختره يدوياً');
      } else {
        var hk = document.getElementById('labOrderTreatmentKey');
        if (hk) hk.value = tpl.treatment_key;
      }
    }
  }
  /* المخبر: نقبله فقط إن كان لا يزال ضمن مخابر العيادة (حُذف ⇒ SET NULL) */
  if (tpl.lab_id) {
    var exists = (allLabs || []).some(function(l){ return l.id === tpl.lab_id; });
    var ls = document.getElementById('labOrderLabSelect');
    if (exists && ls) ls.value = tpl.lab_id;
    else if (!exists) showToast('⚠️ مخبر القالب لم يعد موجوداً — اختر مخبراً');
  }
  var sh = document.getElementById('labOrderShade');
  if (sh && tpl.shade) sh.value = tpl.shade;
  var co = document.getElementById('labOrderCost');
  if (co && tpl.cost !== null && tpl.cost !== undefined && tpl.cost !== '') {
    co.value = tpl.cost;
    /* M130: التكلفة تأتي ومعها وحدتها. الضبط بـset لا بنقرة: set لا يُفرّغ
       الحقل (عقد v207 — التفريغ محصور بالتبديل اليدوي) ولا يُطلق onChange،
       والفرق بين «النظام ضبط مع سعرٍ مطابق» و«الطبيب بدّل» جوهريّ.
       والقالب الأقدم من M130 بلا عملة: لا يُلمس المبدّل — سلوك ما قبل
       الهجرة حرفياً — بل يُعلَن النقص، فرقمٌ صحيح تحت وحدةٍ خاطئة خطأٌ كامل
       وصمتٌ عنه أسوأ من إعلانه. والعيادة أحادية العملة بلا لبسٍ فبلا تنبيه. */
    var _tplCur = (tpl.currency === 'USD' || tpl.currency === 'SYP') ? tpl.currency : null;
    if (_tplCur) { try { window.SyDentCurPick.set('labOrderCost', _tplCur); } catch (e) {} }
    else {
      var _multi = false;
      try { _multi = window.SyDentCurPick.enabled() === true; } catch (e) {}
      if (_multi) showToast('⚠️ قالب قديم بلا عملة محفوظة — تأكّد من عملة التكلفة');
    }
  }
  /* M121: النص المولَّد المحفوظ يُحلّ نائباه لمريض الحالة الحالي وتاريخ
     اليوم ثم ينزل بصندوق الأمر — بلا أي نداء AI (جوهر طلب المالك). */
  var aiBox = document.getElementById('labAiResult');
  if (aiBox && tpl.ai_order_text) {
    var atxt = String(tpl.ai_order_text);
    var pn2 = (typeof labAiPatientName === 'function') ? labAiPatientName() : '';
    if (pn2) atxt = atxt.split('{الاسم}').join(pn2);
    var d2 = new Date();
    var ds2 = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
    atxt = atxt.split('{التاريخ}').join(ds2);
    /* حقن سطر السن من الحالة الحالية (labAiTeeth يغطي دفعة التحديد
       المتعدد) بعد سطر نوع العمل إن وُجد — القالب خُزّن بلا سطر سن. */
    var curTeeth = (typeof labAiTeeth === 'function') ? labAiTeeth() : '';
    if (curTeeth) {
      var lines2 = atxt.split('\n');
      var wtIdx = -1;
      for (var li = 0; li < lines2.length; li++) {
        if (/^\s*نوع العمل\s*:/.test(lines2[li])) { wtIdx = li; break; }
      }
      if (wtIdx > -1) {
        lines2.splice(wtIdx + 1, 0, 'السن/الأسنان: ' + curTeeth);
        atxt = lines2.join('\n');
      }
    }
    aiBox.value = atxt;
  }
  /* v524: الاستحقاق = الإرسال + مهلة القالب **بأيام الدوام**، ولا يتجاوز آخر يوم دوامٍ قبل
     موعد التركيب المربوط — مصدرٌ واحد للسطحين (lab-due.js) فتبقى الكتلة مرآةً بايت-بايت. */
  if (tpl.due_days !== null && tpl.due_days !== undefined && tpl.due_days !== '' && window.SyLabDue) {
    SyLabDue.applyTemplateDays(tpl.due_days);
  }
  /* الملاحظات: إلحاق آمن — لا نمسح ما كتبه الطبيب (نمط M95) */
  if (tpl.notes) {
    var na = document.getElementById('labOrderNotes');
    if (na) { var cur = na.value.trim(); na.value = cur ? (cur + '\n' + tpl.notes) : tpl.notes; }
  }
  labTplGlowSync();   /* إسناد .value لا يُطلق oninput */
}
async function labTplSaveCurrent(){
  /* حفظ قالب = إنشاء أثر بموديول المخابر ⇒ يتبع بوابة الخطة (دفاع عميق؛
     الصف مخفيّ أصلاً عند الحجب). */
  if (!labTplGateOk()) { showToast('🔒 موديول المخابر غير متاح في خطتك — يمكنك متابعة الطلبات القائمة'); return; }
  var g = function(id){ var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
  var labId = g('labOrderLabSelect'), workKey = g('labOrderWorkType');
  var shade = g('labOrderShade'), costRaw = g('labOrderCost'), notes = g('labOrderNotes');
  /* M121 (طلب المالك): النص المولَّد يُحفظ مع القالب فيقل استخدام الـAI
     مستقبلاً — يُخزَّن بالعنصرين النائبين غير محلولين (نمط #372 معكوساً):
     اسم مريض الحالة وتاريخ اليوم يعودان {الاسم}/{التاريخ} فلا يتسربان
     لقالب يُعاد استخدامه. يلتقط تعديلات الطبيب لأنه يقرأ الصندوق. */
  var aiTxt = g('labAiResult');
  if (aiTxt) {
    var pn = (typeof labAiPatientName === 'function') ? labAiPatientName() : '';
    if (pn) aiTxt = aiTxt.split(pn).join('{الاسم}');
    var d0 = new Date();
    var ds0 = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
    aiTxt = aiTxt.split(ds0).join('{التاريخ}');
    /* السن خاص بكل حالة (فلسفة M112) — سطره الحتمي يُشطب من نص القالب
       ويُعاد حقنه بسن الحالة الحالية عند التطبيق. */
    aiTxt = aiTxt.split('\n').filter(function (l) {
      return !/^\s*السن\/الأسنان\s*:/.test(l);
    }).join('\n');
  }
  if (!labId && !workKey && !shade && !costRaw && !notes && !aiTxt) {
    showToast('⚠️ عبّي حقول الطلب أولاً ثم احفظها كقالب'); return;
  }
  /* مهلة التنفيذ تُشتق من الفرق بين التاريخين — صفر حقل جديد بالواجهة.
     Date.UTC على الطرفين: الفرق ثابت مهما كان التوقيت المحلي. */
  var dueDays = null;
  var ms = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g('labOrderDateSent'));
  var md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g('labOrderDateDue'));
  if (ms && md) {
    var diff = Math.round((Date.UTC(+md[1], +md[2]-1, +md[3]) -
                           Date.UTC(+ms[1], +ms[2]-1, +ms[3])) / 86400000);
    if (diff >= 0 && diff <= 365) dueDays = diff;
  }
  var name = await SyDialog.prompt({ title: 'اسم القالب', message: 'اكتب اسماً للقالب' });
  if (name === null) return;
  name = name.trim();
  if (!name) { showToast('⚠️ الاسم مطلوب'); return; }
  var cost = parseFloat(costRaw);
  var costOk = isFinite(cost) && cost > 0;
  /* M130: العملة تُحفظ مع التكلفة لا بمعزل عنها — قالبٌ بلا تكلفة لا يثبّت
     وحدةً بلا رقم. وغيابُ المكوّن أو تعطّله ⇒ null أي سلوك ما قبل M130. */
  var costCur = null;
  if (costOk) { try { costCur = window.SyDentCurPick.read('labOrderCost'); } catch (e) { costCur = null; } }
  if (costCur !== 'USD' && costCur !== 'SYP') costCur = null;
  var res = await window.sb.from('lab_order_templates').insert({
    owner_id: currentUser.id,
    name: name,
    treatment_key: (workKey && workKey !== '_other') ? workKey : null,
    lab_id: labId || null,
    shade: shade || null,
    cost: costOk ? cost : null,
    currency: costCur,
    due_days: dueDays,
    notes: notes || null,
    ai_order_text: aiTxt || null
  }).select().single();
  if (res.error) {
    if (_labTplIsMissingTableErr(res.error)) showToast('⚠️ يلزم تطبيق Migration 112 لتفعيل قوالب طلبات المخبر');
    else showToast('⚠️ ' + res.error.message);
    return;
  }
  LAB_TEMPLATES = [res.data].concat(LAB_TEMPLATES || []);   /* الأحدث أولاً — يطابق order() */
  labTplPopulate();
  var sel = document.getElementById('labTplPick');
  if (sel) sel.value = res.data.id;
  showToast('✅ حُفظ القالب «' + name + '»');
}
labTplSaveCurrent = ppGuarded('labTplSaveCurrent', labTplSaveCurrent, 'جارٍ الحفظ…');   /* v284: قفل + انشغال — التصريحُ فوقه مرآةٌ بايت-بايت مع labs.html فيبقى كما هو */
async function labTplDeleteSelected(){
  var sel = document.getElementById('labTplPick');
  var tid = sel && sel.value;
  if (!tid) { showToast('⚠️ اختر قالباً من القائمة أولاً'); return; }
  var tpl = (LAB_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + ((tpl && tpl.name) || '') + '»؟ (لا يؤثر على أي طلب مخبر محفوظ سابقاً)', danger: true })) return;
  var res = await window.sb.from('lab_order_templates')
    .delete().eq('id', tid).eq('owner_id', currentUser.id);
  if (res.error) { showToast('⚠️ ' + res.error.message); return; }
  LAB_TEMPLATES = (LAB_TEMPLATES || []).filter(function(t){ return t.id !== tid; });
  labTplPopulate();
  showToast('🗑 حُذف القالب');
}
labTplDeleteSelected = ppGuarded('labTplDeleteSelected', labTplDeleteSelected, 'جارٍ الحذف…');   /* v284: قفل + انشغال — التصريحُ فوقه مرآةٌ بايت-بايت مع labs.html فيبقى كما هو */
/* ═══ end lab order templates ═══ */

/* v524: موعدُ التركيب المربوط بالمودال — نفسُ حلّ __auto__ عند الحفظ (أولُ موعدٍ نشطٍ قادم)،
   و__new__ يقرأ تاريخ الموعد الجديد المضمَّن؛ الموعدُ غير النشط لا يُعدّ. */
function labDueApptDate() {
  var sel = document.getElementById('labOrderAppointment');
  var v = sel ? sel.value : '';
  if (!v) return '';
  if (v === '__new__') { var nd = document.getElementById('labNewApptDate'); return (nd && nd.value) ? nd.value : ''; }
  var list = Array.isArray(upcomingAppts) ? upcomingAppts : [];
  var INACT = ['cancelled', 'broken', 'no_show', 'completed'], today = toDay();
  var live = function (a) { return a && a.date && INACT.indexOf(a.status) === -1; };
  var a = null;
  if (v === '__auto__') { for (var i = 0; i < list.length; i++) if (live(list[i]) && String(list[i].date).slice(0, 10) >= today) { a = list[i]; break; } }
  else a = list.find(function (x) { return x && x.id === v; });
  return live(a) ? String(a.date).slice(0, 10) : '';
}
function labDueOpen(isNew) {
  if (window.SyLabDue && currentUser) SyLabDue.open(window.sb, currentUser.id, { isNew: isNew, apptDate: labDueApptDate });
  if (window.SyLabSlip && currentUser) SyLabSlip.prefetch(window.sb, currentUser.id);   /* v528: ترويسةُ الورقة مسبقاً (print متزامن — iOS) */
  if (window.SyLabFiles) {   /* v535: مرفقاتُ الطلب — المحفوظُ يرفع فوراً، والجديدُ يُحجز حتى الحفظ */
    SyLabFiles.open({ orderId: isNew ? '' : document.getElementById('labOrderId').value, orders: labOrders,
      patientId: (typeof patientId !== 'undefined') ? patientId : null, onChange: function () { renderLabOrders(); } });
  }
}
/* v528: ورقةُ طلب المخبر — من حقول المودال؛ الطلبُ المحفوظ يضيف أسنانَ دفعته ودوراتِ إعادته */
function labSlipPrint() {
  if (!window.SyLabSlip) return;
  var labId = document.getElementById('labOrderLabSelect').value;
  var id = document.getElementById('labOrderId').value;
  SyLabSlip.print(SyLabSlip.fromForm({
    patientName: (typeof patient !== 'undefined' && patient) ? patient.name : '',
    lab: allLabs.find(function (x) { return x.id === labId; }) || null,
    teeth: (typeof labAiTeeth === 'function') ? labAiTeeth() : null,
    orderId: id || '', orders: labOrders,
    redo: (id && window.SyLabRedo) ? SyLabRedo.list(id) : []
  }));
}

async function openLabOrderModal(prefill) {
  // بوابة الخطة: مودال الإنشاء وحده — editLabOrder مسار منفصل ويبقى متاحاً.
  if (!labsPlanOk()) { labsBlockedToast(); return; }
  await loadTreatmentsFromSupabase();
  prefill = prefill || {};
  document.getElementById('labOrderTitle').textContent = '🥽 طلب مخبر جديد';
  document.getElementById('labOrderId').value = '';
  document.getElementById('labOrderTreatmentKey').value = prefill.treatment_key || '';
  populateLabWorkTypes(prefill.treatment_key);
  populateLabSelect();
  // Default link: NOT linked (the safest default per д.أيهم's request).
  // The user can opt in to auto-link, create-new, or pick a specific appointment.
  var apptDefault = prefill.appointment_id;
  if (apptDefault === undefined || apptDefault === null) apptDefault = '';
  populateLabAppointmentSelect(apptDefault);
  // Reset inline new-appointment fields so a previous open doesn't leak values
  var nDate = document.getElementById('labNewApptDate');
  var nTime = document.getElementById('labNewApptTime');
  if (nDate) nDate.value = '';
  if (nTime) nTime.value = '';
  document.getElementById('labOrderTooth').value = prefill.tooth_num || '';
  document.getElementById('labOrderShade').value = '';
  document.getElementById('labOrderCost').value = '';
  /* M127: الافتراضُ يتبع الواقع السريري — علاجٌ ما زال مخطّطاً يعني أن الطبعة
     لم تُؤخذ ولا شيء عند المخبر، فيُفتح بتاريخ إرسالٍ فارغ (= مسودّة)؛ وعلاجٌ
     منجزٌ أو طلبٌ مستقلّ يُفتح باليوم كما كان حرفياً. والطبيب يتجاوز الافتراضين
     بالحقل نفسه بلا أي واجهةٍ إضافية. */
  document.getElementById('labOrderDateSent').value = prefill.draft ? '' : toDay();
  document.getElementById('labOrderDateDue').value = '';
  document.getElementById('labOrderNotes').value = prefill.notes || '';
  // Treating provider: prefer the value passed in from the treatment screen
  // (pendingProviderId), else default empty; user can override.
  populateLabProviderSelect(prefill.provider_id || '');
  // M79: session link — set when opened from a save-flow (tooth+lab or regional
  // ortho); null for standalone "+ طلب جديد" orders.
  pendingLabSessionId = prefill.session_id || null;
  // M86-lab: batch context — one order per tooth. The tooth field is locked (the
  // real tooth is written per row from the units) and the teeth are listed below
  // it, together with the per-tooth cost semantics. Always reset first so a
  // previous batch open can never leak into a plain "+ طلب جديد".
  pendingLabBatchUnits = (Array.isArray(prefill.batch_units) && prefill.batch_units.length)
    ? prefill.batch_units.slice() : null;
  _labBatchHintSync();
  labTplRefresh();   /* M112: قوالب طلب المخبر — غير حاجز */
  labAiReset();      /* بند #6 ج4: تصفير صندوق الأمر المولَّد — وإلا علِقت آخر صياغة */
  try { window.SyDentCurPick.mount('labOrderCost'); } catch (e) {}   // M125
  labDueOpen(true);  /* v524: الاستحقاق التلقائي وسقفُ موعد التركيب (lab-due.js) */
  openModal('labOrderModal');
}

/* M86-lab: single owner of the batch hint + tooth-field lock, so open/edit can
   never drift apart. Called by BOTH openLabOrderModal and editLabOrder. */
function _labBatchHintSync() {
  var hint = document.getElementById('labOrderBatchHint');
  var toothEl = document.getElementById('labOrderTooth');
  var multi = !!(pendingLabBatchUnits && pendingLabBatchUnits.length > 1);
  if (toothEl) toothEl.readOnly = multi;
  if (!hint) return;
  if (!multi) { hint.style.display = 'none'; hint.textContent = ''; return; }
  var nums = pendingLabBatchUnits.map(function(u){ return u.tooth_num; }).join('، ');
  hint.textContent = '🦷 سيُنشأ طلب مخبر لكل سن: ' + nums
    + ' (' + pendingLabBatchUnits.length + ' طلبات) — التكلفة المُدخلة تُسجَّل لكل سن.';
  hint.style.display = 'block';
}

async function editLabOrder(id) {
  await loadTreatmentsFromSupabase();
  var lo = labOrders.find(function(x){ return x.id === id; });
  if (!lo) return;

  // If this order is linked to an appointment that's outside our upcoming-cache
  // (e.g. an old appointment, or the user is viewing an archived order), fetch
  // it on demand so the link isn't silently lost when saving.
  if (lo.appointment_id) {
    var inCache = Array.isArray(upcomingAppts) && upcomingAppts.some(function(a){ return a.id === lo.appointment_id; });
    if (!inCache) {
      try {
        const { data: ext, error: extErr } = await window.sb.from('appointments')
          .select('id, date, time, type, status, provider_id')
          .eq('id', lo.appointment_id)
          .eq('doctor_id', currentUser.id)
          .eq('patient_id', patientId)
          .maybeSingle();
        if (!extErr && ext) upcomingAppts.push(ext);
      } catch(e) { console.warn('fetch linked appt:', e); }
    }
  }

  document.getElementById('labOrderTitle').textContent = '🥽 تعديل طلب المخبر';
  document.getElementById('labOrderId').value = lo.id;
  document.getElementById('labOrderTreatmentKey').value = lo.treatment_key || '';
  populateLabWorkTypes(lo.treatment_key);
  populateLabSelect(lo.lab_id);
  populateLabAppointmentSelect(lo.appointment_id || '');
  // Reset inline new-appointment fields (edit mode never creates a new appointment)
  var nDate2 = document.getElementById('labNewApptDate');
  var nTime2 = document.getElementById('labNewApptTime');
  if (nDate2) nDate2.value = '';
  if (nTime2) nTime2.value = '';
  document.getElementById('labOrderTooth').value = lo.tooth_num || '';
  document.getElementById('labOrderShade').value = lo.shade || '';
  document.getElementById('labOrderCost').value = lo.cost || '';
  // M125: التعديل يبدأ بعملة الطلب المحفوظة لا بعملة العيادة —
  // وإلا قُرِئ سعر الدولار ليرةً وأُعيد حفظه بوسمٍ كاذب.
  try { window.SyDentCurPick.pin('labOrderCost', (lo.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
  /* 🔴 M127-fix2: الارتدادُ إلى اليوم كُتب يوم كان تاريخُ الإرسال ممتلئاً دائماً.
     ومع M127 صار الفراغُ **معنى** لا نقصاً: مسودّةٌ تُفتح للتعديل كانت تُعبّأ
     باليوم، فأيُّ حفظٍ بعده — ولو لتصحيح الشيد وحده — يقرأ التاريخ ممتلئاً
     فيُرسل الطلب. أي أن المسودّة كانت **غير قابلة للتعديل دون إرسالها**.
     والقيدُ بالقاعدة يجعل الفراغ مكافئاً للمسودّة حصراً، فلا صفَّ قديمٌ يتأثّر. */
  document.getElementById('labOrderDateSent').value = lo.date_sent ? lo.date_sent.slice(0,10) : '';
  document.getElementById('labOrderDateDue').value = lo.date_due ? lo.date_due.slice(0,10) : '';
  document.getElementById('labOrderNotes').value = lo.notes || '';
  // Treating provider: prefer the stored value; if absent but the order is linked
  // to an appointment, default from that appointment's provider (override allowed).
  if (lo.provider_id) {
    populateLabProviderSelect(lo.provider_id);
  } else if (lo.appointment_id) {
    var laProv = (upcomingAppts || []).find(function(a){ return a.id === lo.appointment_id; });
    populateLabProviderSelect((laProv && laProv.provider_id) ? laProv.provider_id : '');
  } else {
    populateLabProviderSelect('');
  }
  // M79: carry the stored session link so the edit-save writes it back unchanged
  pendingLabSessionId = lo.session_id || null;
  // M86-lab: editing is ALWAYS a single existing order — clear any batch state
  // (and unlock the tooth field) so it can never fan out on an update.
  pendingLabBatchUnits = null;
  _labBatchHintSync();
  labTplRefresh();   /* M112: قوالب طلب المخبر — غير حاجز */
  labAiReset();      /* بند #6 ج4: تصفير صندوق الأمر المولَّد — وإلا علِقت آخر صياغة */
  try { window.SyDentCurPick.mount('labOrderCost'); } catch (e) {}   // M125
  labDueOpen(false);
  openModal('labOrderModal');
}


/* ══════════════════════════════════════════════════════════════════════
   M127-fix — الحالةُ تتغيّر عند عبور حدّ المسودّة وحده.
   ──────────────────────────────────────────────────────────────────────
   عيبٌ أدخلتُه بـM127: الحمولةُ مشتركةٌ بين الإنشاء والتعديل، وإضافةُ مفتاح
   status إليها جعلت **كلَّ تعديل يدوس الحالة**. طلبٌ على «تم الاستلام من
   المخبر» يُفتح لتصحيح اللون فيعود «تم التسليم للمخبر» — تتبّعٌ يضيع بصمت
   بلا رسالة ولا أثر. وقبل M127 لم يكن للحمولة مفتاحُ status إطلاقاً بمسار
   التحديث (الإسناد كان بفرع الإدراج وحده) فكانت الحالة تُصان بالبناء.

   القاعدة الصحيحة: تاريخُ الإرسال يحكم **حدّ المسودّة فقط**، لا سلّم التقدّم.
     · مسودّة ← امتلأ التاريخ  ⇒ 'sent'  (إرسالٌ بالتعديل — مكافئ زرّ الإرسال)
     · مُرسَلة ← فُرِّغ التاريخ ⇒ 'draft' (تراجعٌ صريح عن الإرسال)
     · وإلّا ⇒ لا يُكتب المفتاح أصلاً، فتبقى received/checked/delivered/redo
       /rejected كما هي. عدمُ الكتابة أأمن من كتابة القيمة نفسها: مفتاحٌ غائبٌ
       من الحمولة لا يمكن أن يدوس شيئاً مهما تغيّرت المسارات لاحقاً.
   ══════════════════════════════════════════════════════════════════════ */

/* M127-fix: تفريغُ التاريخ بنقرة. حقلُ التاريخ الأصلي لا يعرض زرّ مسحٍ بكل
   المتصفّحات، والقيمةُ الفارغة هي ما يجعل الطلب مسودّةً — فأداةٌ لا تُبلِغ عن
   قدرتها تساوي غيابها. DOM صرف: صفر كتابةٍ للقاعدة، والحفظُ يبقى بيد الطبيب. */
function labClearDateSent() {
  var el = document.getElementById('labOrderDateSent');
  if (!el) return;
  el.value = '';
  try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
}

function _labResolveStatus(prev, isDraft) {
  var was = prev && prev.status ? prev.status : null;
  if (!was) return isDraft ? 'draft' : 'sent';          // إنشاء
  if (was === 'draft' && !isDraft) return 'sent';       // أُرسل بالتعديل
  if (was !== 'draft' && isDraft)  return 'draft';      // تُرووجِع عن الإرسال
  return null;                                          // لا تلمس الحالة
}

async function saveLabOrder() {
  // Phase 4.1: defense-in-depth — block creating new lab orders if inactive.
  // Editing existing orders is still allowed.
  var labOrderIdField = document.getElementById('labOrderId');
  var isNew = !labOrderIdField || !labOrderIdField.value;
  // بوابة الخطة بنفس تمييز Phase 4.1: الإنشاء محجوب، التعديل مسموح.
  if (isNew && !labsPlanOk()) { labsBlockedToast(); return; }
  if (isNew && window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن إنشاء طلبات مخبر جديدة');
    return;
  }
  /* v524: الاستحقاقُ لا يكون بعد موعد التركيب المربوط (Dentrix Ascend) */
  var _dueErr = window.SyLabDue ? SyLabDue.checkForm() : '';
  if (_dueErr) { showToast('⚠️ ' + _dueErr); return; }
  // Disable the save button immediately to prevent double-submit (especially
  // important when __new__ creates an appointment — a double-click would create two).
  // Respect the button's prior state so we don't accidentally re-enable a button
  // that populateLabSelect intentionally left disabled (e.g. when no labs exist).
  var saveBtn = document.getElementById('labOrderSaveBtn');
  var wasDisabled = saveBtn ? saveBtn.disabled : false;
  var origText = saveBtn ? saveBtn.textContent : 'حفظ';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'جارٍ الحفظ…'; }
  try {
    await _saveLabOrderInner();
  } catch (err) {
    // Catch any unexpected runtime error (e.g. a typo, an unhandled null deref).
    // Without this, the user would see no toast and the modal would stay open
    // looking like everything worked.
    console.error('saveLabOrder failed:', err);
    showToast('⚠️ خطأ غير متوقع: ' + (err && err.message ? err.message : 'حاول مجدداً'));
  } finally {
    if (saveBtn) { saveBtn.disabled = wasDisabled; saveBtn.textContent = origText; }
  }
}

async function _saveLabOrderInner() {
  var id = document.getElementById('labOrderId').value;
  var toothRaw = document.getElementById('labOrderTooth').value.trim();
  var workSel = document.getElementById('labOrderWorkType');
  var workKey = workSel.value;
  var workName;
  if (workKey === '_other' || !workKey) {
    workName = 'أخرى';
    workKey = null;
  } else {
    var t = getTreatment(workKey);
    workName = t ? t.name : workKey;
  }
  var labId   = document.getElementById('labOrderLabSelect').value;
  var labObj  = allLabs.find(function(x){ return x.id === labId; });
  var labName = labObj ? labObj.name : null;
  var shade   = document.getElementById('labOrderShade').value.trim();
  var cost    = parseFloat(document.getElementById('labOrderCost').value) || 0;
  var dateSent = document.getElementById('labOrderDateSent').value;
  var dateDue = document.getElementById('labOrderDateDue').value;
  var notes = document.getElementById('labOrderNotes').value.trim();

  if (!labId || !labName) { showToast('⚠️ اختر المخبر'); return; }
  if (!workName || workName === '—') { showToast('⚠️ اختر نوع العمل'); return; }
  /* M127 — تاريخُ الإرسال هو المفتاح، لا حقلٌ ثانٍ ينحرف عنه: فارغٌ يعني
     «أُنشئ ولم يُرسَل» (مسودّة)، ومملوءٌ يعني مُرسَلاً. حالةٌ واحدة تُشتقّ من
     حقلٍ واحد فيستحيل التناقض، والقاعدة تفرض الثابت نفسه بقيدٍ صريح (M127)
     فحتى كتابةٌ خارج هذا المسار لا تستطيع خرقه. والتعديلُ يمرّ من هنا كذلك:
     مسحُ التاريخ يعيد الطلب مسودّةً، وكتابتُه يرسله — وهو المسار اليدوي
     الثاني جوار زرّ «📤 إرسال». */
  var isDraft = !dateSent;

  var apptSel = document.getElementById('labOrderAppointment');
  var apptId  = apptSel ? (apptSel.value || null) : null;

  // Resolve the special "auto-link" sentinel to the patient's next active appointment.
  // upcomingAppts is pre-sorted ascending (oldest-first), but it may contain
  // older/inactive appointments injected on-the-fly by editLabOrder when an archived
  // lab order references one. We defensively filter to "today or later" + active
  // status so __auto__ never lands on a stale appointment.
  if (apptId === '__auto__') {
    var todayStr2 = toDay();
    var INACTIVE = ['cancelled', 'broken', 'no_show', 'completed'];
    var nextActive = null;
    if (Array.isArray(upcomingAppts)) {
      for (var ai = 0; ai < upcomingAppts.length; ai++) {
        var ap = upcomingAppts[ai];
        if (!ap || !ap.date) continue;
        if (ap.date < todayStr2) continue;
        if (ap.status && INACTIVE.indexOf(ap.status) !== -1) continue;
        nextActive = ap;
        break;
      }
    }
    if (nextActive) {
      apptId = nextActive.id;
    } else {
      apptId = null;
      showToast('ℹ️ لا يوجد موعد قادم — تم الحفظ بدون ربط');
    }
  }

  // Resolve "create new appointment now" sentinel: insert a new appointment row first,
  // then link the lab order to its id. Fixed duration = 30 minutes (per design choice).
  // Type = workName (e.g. "تاج زركون"). Behavior matches saveAppt() exactly so the
  // new appointment shows up correctly in the calendar (color/stroke/provider/etc.).
  if (apptId === '__new__') {
    var nDate = document.getElementById('labNewApptDate').value;
    var nTime = document.getElementById('labNewApptTime').value;
    if (!nDate) { showToast('⚠️ اختر تاريخ موعد التركيب'); return; }
    if (!nTime) { showToast('⚠️ اختر ساعة موعد التركيب'); return; }
    // Match the lab work-type treatment to inherit colors/treatment_id when possible.
    var trObj = workKey ? getTreatment(workKey) : null;
    var apptColor  = trObj ? trObj.fill   : '#0d8577';
    var apptStroke = trObj ? trObj.stroke : '#1fba7e';
    // Provider: prefer the most-recent provider used on this patient's sessions
    // (so the new appointment isn't orphaned), else fall back to the clinic default.
    var bestProvider = null;
    for (var si = 0; si < sessions.length; si++) {
      if (sessions[si].provider_id) { bestProvider = sessions[si].provider_id; break; }
    }
    if (!bestProvider && typeof getDefaultProviderId === 'function' && Array.isArray(CLINIC_DOCTORS)) {
      bestProvider = getDefaultProviderId(CLINIC_DOCTORS);
    }
    var apptIns = {
      doctor_id: currentUser.id,
      patient_id: patientId,
      patient_name: (patient && patient.name) ? patient.name : null,
      date: nDate,
      time: nTime,
      duration: 30,
      type: workName,
      treatment_id: (trObj && trObj.dbId) ? trObj.dbId : null,
      // Match the system's existing appointment-status convention (pending/confirmed/cancelled).
      // 'confirmed' is the same default saveAppt() and the calendar UI use — new appointments
      // start as confirmed; the doctor can manually change to pending/cancelled if needed.
      status: 'confirmed',
      color: apptColor,
      stroke: apptStroke,
      notes: 'موعد تركيب — أُنشئ تلقائياً من طلب المخبر',
      provider_id: bestProvider
    };
    /* v495: حارسُ التعارض — موعدُ التركيب التلقائي يمرّ بنفس الحارس (الطبيب وحده؛ لا كرسي هنا) */
    if (window.SyDentConflict) {
      var _cfOk = await window.SyDentConflict.confirm(
        { id: null, date: nDate, time: nTime, duration: 30, provider_id: bestProvider, operatory_id: null },
        { doctorId: currentUser.id, names: { provider: function (id) {
            var d = (CLINIC_DOCTORS || []).find(function (x) { return x.id === id; }); return d ? d.name : null; } } });
      if (!_cfOk) return;
    }
    var apptRes = await window.sb.from('appointments').insert(apptIns).select().single();
    if (apptRes.error || !apptRes.data) {
      showToast('⚠️ فشل إنشاء الموعد: ' + (apptRes.error && apptRes.error.message ? apptRes.error.message : 'سبب غير معروف'));
      return;
    }
    apptId = apptRes.data.id;
    // Keep the in-memory cache in sync so the patient profile (and the next time
    // the lab modal is opened) immediately sees the new appointment.
    if (nDate >= toDay()) {
      upcomingAppts.push({
        id: apptRes.data.id,
        date: apptRes.data.date,
        time: apptRes.data.time,
        type: apptRes.data.type,
        status: apptRes.data.status
      });
      upcomingAppts.sort(function(a, b){
        return (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
      });
    }
    // Phase 2B-A: keep timeline cache in sync as well, so the new appointment
    // shows up in the unified timeline without requiring a page reload.
    if (Array.isArray(allAppointmentsForTl)) {
      allAppointmentsForTl.unshift(apptRes.data);
    }
    showToast('📅 تم إنشاء موعد التركيب');
  }

  // Treating provider (Migration 73): the explicit dropdown choice wins; if empty
  // but the order is linked to an appointment, fall back to that appointment's
  // provider. This populates lab_orders.provider_id so reports attribute the lab's
  // cost to the right doctor regardless of the filter window.
  var providerId = document.getElementById('labOrderProvider').value || null;
  if (!providerId && apptId) {
    var apptForProv = (upcomingAppts || []).find(function(a){ return a.id === apptId; });
    if (apptForProv && apptForProv.provider_id) providerId = apptForProv.provider_id;
  }

  var payload = {
    doctor_id: currentUser.id,
    patient_id: patientId,
    appointment_id: apptId,
    provider_id: providerId,
    session_id: pendingLabSessionId || null,
    tooth_num: toothRaw ? parseInt(toothRaw, 10) : null,
    treatment_key: workKey,
    lab_id: labId,
    lab_name: labName,
    work_type: workName,
    shade: shade || null,
    cost: cost,
    currency: window.SyDentCurPick.read('labOrderCost'),   // M125
    notes: notes || null,
    date_sent: isDraft ? null : dateSent,
    date_due: dateDue || null
  };

  // Detect "column doesn't exist" so the page keeps working before the SQL
  // migrations are run (appointment_id from Migration 4, provider_id from
  // Migration 73, session_id from Migration 79).
  function isMissingApptColumn(err) {
    if (!err) return false;
    var msg = (err.message || '').toLowerCase();
    var pointsAtOptional = msg.indexOf('appointment_id') !== -1 || msg.indexOf('provider_id') !== -1 || msg.indexOf('session_id') !== -1;
    if (err.code === '42703' || err.code === 'PGRST204') {
      return pointsAtOptional;
    }
    if (!pointsAtOptional) return false;
    return msg.indexOf('column') !== -1
        || msg.indexOf('schema cache') !== -1
        || msg.indexOf('does not exist') !== -1
        || msg.indexOf('not found') !== -1;
  }

  /* M127-fix: الحالة تُحسم بعد بناء الحمولة ولا تُكتب إلا عند عبور الحدّ. */
  var _prevLo = id ? (labOrders || []).find(function(x){ return x.id === id; }) : null;
  var _newSt  = _labResolveStatus(_prevLo, isDraft);
  if (_newSt) payload.status = _newSt;

  if (id) {
    var res = await window.sb.from('lab_orders')
      .update(payload).eq('id', id).eq('doctor_id', currentUser.id).select().single();
    if (res.error && isMissingApptColumn(res.error)) {
      console.warn('lab_orders optional column missing (appointment_id/provider_id) — saving without them. Run Migrations 4 + 73 to enable.');
      var legacyPayload = Object.assign({}, payload);
      delete legacyPayload.appointment_id;
      delete legacyPayload.provider_id;
      delete legacyPayload.session_id;
      res = await window.sb.from('lab_orders')
        .update(legacyPayload).eq('id', id).eq('doctor_id', currentUser.id).select().single();
    }
    if (res.error) { showToast('⚠️ فشل الحفظ: ' + res.error.message); return; }
    if (res.data) {
      var idx = labOrders.findIndex(function(x){ return x.id === id; });
      if (idx !== -1) labOrders[idx] = res.data;
    }
    showToast('✅ تم تحديث الطلب');
  } else {
    /* M127: الحالة صارت مشتقّةً من تاريخ الإرسال بالحمولة نفسها (isDraft)،
       والإسنادُ الثابت 'sent' الذي كان هنا كان سيدوسها فيُحفَظ كلُّ طلبٍ
       مُرسَلاً مهما فُرِّغ التاريخ — أي أن الميزة تُلغى بسطرٍ واحد بصمت. */
    if (pendingLabBatchUnits && pendingLabBatchUnits.length > 1) {
      // M86-lab: batch context — fan out to one row per tooth. Each row carries its
      // OWN tooth_num + session_id; EVERY other field (lab, work type, shade, cost,
      // dates, appointment, provider, notes) is identical to the single path, so
      // accounting (Σ cost by date_sent) and provider attribution (M73) stay exact.
      // NOTE: .select() on a multi-row insert returns an ARRAY — .single() must not
      // be used here. A single unit falls through to the classic path untouched.
      var batchRows = pendingLabBatchUnits.map(function(u){
        return Object.assign({}, payload, {
          tooth_num: (u.tooth_num === 0 || u.tooth_num) ? parseInt(u.tooth_num, 10) : null,
          session_id: u.session_id || null
        });
      });
      var resB = await window.sb.from('lab_orders').insert(batchRows).select();
      if (resB.error && isMissingApptColumn(resB.error)) {
        console.warn('lab_orders optional column missing (appointment_id/provider_id/session_id) — saving without them. Run Migrations 4 + 73 + 79 to enable.');
        var legacyRows = batchRows.map(function(r){
          var c = Object.assign({}, r);
          delete c.appointment_id;
          delete c.provider_id;
          delete c.session_id;
          return c;
        });
        resB = await window.sb.from('lab_orders').insert(legacyRows).select();
      }
      if (resB.error) { showToast('⚠️ فشل الحفظ: ' + resB.error.message); return; }
      if (Array.isArray(resB.data)) {
        for (var _bri = resB.data.length - 1; _bri >= 0; _bri--) labOrders.unshift(resB.data[_bri]);
        /* v535: مرفقاتُ الدفعة على صفّها الأول (العرضُ يجمع أسنان الدفعة) — لا يُنتظر */
        if (resB.data[0] && window.SyLabFiles && SyLabFiles.hasStaged()) SyLabFiles.flush(resB.data[0].id, resB.data[0].patient_id);
      }
      pendingLabBatchUnits = null;   // consume-once: a retry/re-open re-seeds it
      showToast('✅ تم إرسال ' + batchRows.length + ' طلبات للمخبر (طلب لكل سن)');
    } else {
      var res2 = await window.sb.from('lab_orders')
        .insert(payload).select().single();
      if (res2.error && isMissingApptColumn(res2.error)) {
        console.warn('lab_orders optional column missing (appointment_id/provider_id) — saving without them. Run Migrations 4 + 73 to enable.');
        var legacyPayload2 = Object.assign({}, payload);
        delete legacyPayload2.appointment_id;
        delete legacyPayload2.provider_id;
        delete legacyPayload2.session_id;
        res2 = await window.sb.from('lab_orders')
          .insert(legacyPayload2).select().single();
      }
      if (res2.error) { showToast('⚠️ فشل الحفظ: ' + res2.error.message); return; }
      if (res2.data) labOrders.unshift(res2.data);
      if (res2.data && window.SyLabFiles && SyLabFiles.hasStaged()) SyLabFiles.flush(res2.data.id, res2.data.patient_id);   /* v535: لا يُنتظر */
      showToast(isDraft ? '📝 حُفظت المسودّة — اضغط «إرسال للمخبر» عند التسليم' : '✅ تم إرسال الطلب للمخبر');
    }
  }

  renderLabOrders();
  renderTimeline();
  // M79-b: صفُّ الدفتر يقرأ الربط (زرّ ⇄ شارة)، فبلا إعادة رسمه يبقى الزرّ
  // ظاهراً بعد الحفظ فيُنشأ طلبٌ ثانٍ لنفس الجلسة. محروسٌ بـtypeof لأن
  // labs.html تحمل نسخةً موازية من مسار الحفظ بلا دفتر جلسات.
  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}
  closeModal('labOrderModal');
}

/* Quick-add lab from within order modal */
function ppOpenLabModal() {
  document.getElementById('ppLabName').value = '';
  document.getElementById('ppLabPhone').value = '';
  document.getElementById('ppLabNotes').value = '';
  openModal('ppLabModal');
  setTimeout(function(){ document.getElementById('ppLabName').focus(); }, 100);
}

var ppSaveLab = ppGuarded('ppSaveLab', _ppSaveLab_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _ppSaveLab_inner() {
  if (!labsPlanOk()) { labsBlockedToast(); return; }
  var name  = document.getElementById('ppLabName').value.trim();
  var phone = window.SyDentPhone ? window.SyDentPhone.tidy(document.getElementById('ppLabPhone').value) : document.getElementById('ppLabPhone').value.trim();   /* v559 (#13) */
  var notes = document.getElementById('ppLabNotes').value.trim();
  if (!name) { showToast('⚠️ أدخل اسم المخبر'); return; }

  const { data, error } = await window.sb.from('labs').insert({
    doctor_id: currentUser.id,
    name: name,
    phone: phone || null,
    notes: notes || null,
    is_active: true
  }).select().single();

  if (error) { showToast('⚠️ فشل الحفظ: ' + error.message); return; }
  if (data) {
    allLabs.push(data);
    allLabs.sort(function(a,b){ return a.name.localeCompare(b.name, 'ar'); });
    populateLabSelect(data.id);
  }
  closeModal('ppLabModal');
  showToast('✅ تمت إضافة المخبر');
}

var advanceLabOrder = ppGuarded('advanceLabOrder', _advanceLabOrder_inner, '⏳');   /* v284: قفل + انشغال */
async function _advanceLabOrder_inner(id) {
  var lo = labOrders.find(function(x){ return x.id === id; });
  if (!lo) return;
  var nx = LAB_NEXT_STATUS[lo.status];
  if (!nx) return;
  var nowIso = new Date().toISOString();
  var update = { status: nx.next };
  if (nx.next === 'received')  update.date_received  = nowIso;
  if (nx.next === 'checked')   update.date_checked   = nowIso;
  if (nx.next === 'delivered') update.date_delivered = nowIso;
  /* M160: إعادةُ الإرسال بعد «إعادة» لا تختم date_sent — هو مرساةُ الكلفة بالمحاسبة (#196)،
     والتريغر يفرض الثابت نفسه بالقاعدة ويفرّغ تواريخ الدورة ويختم resent_at. */
  var wasRedo = lo.status === 'redo';
  if (nx.next === 'sent' && !wasRedo) update.date_sent = nowIso;
  const { data, error } = await window.sb.from('lab_orders')
    .update(update).eq('id', id).eq('doctor_id', currentUser.id).select().single();
  if (error) { showToast('⚠️ فشل التحديث'); return; }
  if (wasRedo && window.SyLabRedo) SyLabRedo.markResent(id, nowIso);
  if (data) {
    var idx = labOrders.findIndex(function(x){ return x.id === id; });
    if (idx !== -1) labOrders[idx] = data;
  }
  renderLabOrders();
  renderTimeline();
  showToast('✅ تم تحديث الحالة إلى: ' + LAB_STATUSES[nx.next].ar);
}

var redoLabOrder = ppGuarded('redoLabOrder', _redoLabOrder_inner, '⏳');   /* v284: قفل + انشغال */
async function _redoLabOrder_inner(id) {
  // الإعادة تُحيي حالة منتهية = إنشاء متخفٍّ، فتُعامَل كإنشاء.
  if (!labsPlanOk()) { labsBlockedToast(); return; }
  var lo = labOrders.find(function(x){ return x.id === id; });
  if (!lo || !window.SyLabRedo) return;
  var labNm = lo.lab_name || '';
  if (lo.lab_id) { var lObj = allLabs.find(function(x){ return x.id === lo.lab_id; }); if (lObj) labNm = lObj.name; }
  /* M160: دورةٌ موثّقة — سبب + موعد استلامٍ جديد، بفعلٍ ذرّي (lab-redo.js · RPC lab_order_redo). */
  var data = await SyLabRedo.run(window.sb, lo, {
    workType: lo.work_type, labName: labNm, patientName: (typeof patient !== 'undefined' && patient) ? patient.name : ''
  });
  if (!data) return;
  var idx = labOrders.findIndex(function(x){ return x.id === id; });
  if (idx !== -1) labOrders[idx] = data;
  renderLabOrders();
  renderTimeline();
  showToast('🔄 أُعيد العمل للمخبر — سُجّل السبب');
}

var delLabOrder = ppGuarded('delLabOrder', _delLabOrder_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _delLabOrder_inner(id) {
  if (!await SyDialog.confirm({ message: 'هل تريد حذف هذا الطلب نهائياً؟', danger: true })) return;
  const { error } = await window.sb.from('lab_orders')
    .delete().eq('id', id).eq('doctor_id', currentUser.id);
  if (error) { showToast('⚠️ فشل الحذف'); return; }
  labOrders = labOrders.filter(function(x){ return x.id !== id; });
  renderLabOrders();
  renderTimeline();
  // M79-b: الحذف يعيد الجلسة قابلةً للطلب — الشارة تسقط والزرّ يعود.
  try { if (typeof renderSessions === 'function') renderSessions(); } catch (e) {}
  showToast('🗑 تم حذف الطلب');
}

var saveToothAndOpenLab = ppGuarded('saveToothAndOpenLab', _saveToothAndOpenLab_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _saveToothAndOpenLab_inner() {
  // بوابة الخطة قبل أي كتابة: لو حرسنا فتح المودال وحده لانحفظ العلاج ثم لم
  // يُفتح مودال المخبر بصمت — نصف عملية محيّرة.
  if (!labsPlanOk()) { labsBlockedToast(); return; }
  // Phase 4.1: defense-in-depth — block if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل علاجات جديدة');
    return;
  }
  // First save the tooth treatment as session — same fields/logic as saveToothTreatment,
  // so status (planned/completed/existing/referred) and provider_id are preserved.
  // Cost is OPTIONAL for all statuses (consistent with saveToothTreatment).
  var costRaw = parseFloat(document.getElementById('toothCost').value);
  var cost = (costRaw && costRaw > 0) ? costRaw : 0;
  var date  = document.getElementById('toothDate').value;
  var notes = document.getElementById('toothNotes').value.trim();
  if (!date) { showToast('⚠️ اختر التاريخ'); return; }

  // Rule #197 write-path parity (audit fix #1): bridge / spacer / implant persist
  // their UNIT/special rows through the SAME helper as saveToothTreatment.
  // Previously this path wrote one plain row — for a bridge that overwrote
  // WHOLE='extracted' on the missing tooth and skipped the abutments entirely.
  /* v431 (تكافؤ مسارَي الكتابة — القاعدة #197): زرُّ المخبر محجوبٌ عن الحالات السريرية
     (needs_lab=false)، ومع ذلك يُطبَّع المفتاحُ هنا أيضاً فلا يوجد مسارُ كتابةٍ واحدٌ
     يستطيع تسجيل حالةٍ سريرية بحالةٍ مالية. */
  if (typeof condNormalizePending === 'function') condNormalizePending();
  /* M145-h: البديلُ جلسةُ سجلٍّ تُوسَم بخيار — مسارُ المخبر لا يوسم؛ زرُّه محجوبٌ بوضع البديل وهذا حارسُه */
  if (typeof _altBridge !== 'undefined' && _altBridge) { showToast('🔀 البدائل تُحفظ بزر «حفظ» — أرسل للمخبر بعد اعتماد الخيار'); return; }
  var _sp = await persistSpecialTreatment();
  if (_sp.blocked) return;

  if (!_sp.handled) {
  // 1. Save tooth status (surface + treatment_key + clinical status + treating provider)
  var rTs = await upsertTeethStatusWithFallback({
    doctor_id: currentUser.id, patient_id: patientId,
    tooth_num: String(currentTooth), surface: currentSurface,
    treatment_key: pendingToothStatus,
    status: pendingTreatStatus,
    provider_id: pendingProviderId,
    review_at: _reviewAtVal()
  }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
  if (rTs.error) {
    console.error('tooth+lab teeth_status save error:', rTs.error);
    showToast('⚠️ خطأ حفظ حالة السن: ' + rTs.error.message);
    return;
  }
  if (!teethMap[String(currentTooth)]) teethMap[String(currentTooth)] = {};
  teethMap[String(currentTooth)][currentSurface] = pendingToothStatus;
  if (!teethMap[String(currentTooth)].__status) teethMap[String(currentTooth)].__status = {};
  teethMap[String(currentTooth)].__status[currentSurface] = pendingTreatStatus;
  _syncReviewCache(currentTooth, currentSurface);   // A
  }

  // Build description that reflects the area type
  var areaForLabDesc;
  if (_sp.bridgeUnit) areaForLabDesc = 'جسر يشمل الأسنان ' + _sp.bridgeUnit.join('، ');
  else if (_sp.spacerUnit) areaForLabDesc = 'حافظ مسافة يشمل الأسنان ' + _sp.spacerUnit.join('، ');
  else if (currentSurface === 'WHOLE') areaForLabDesc = 'السن كاملاً';
  else if (currentSurface === 'CROWN_FULL') areaForLabDesc = 'التاج كامل';
  else if (isRootCode(currentSurface)) areaForLabDesc = rootAreaLabelFor(currentSurface, currentTooth);
  else areaForLabDesc = 'السطح ' + surfLabelFor(currentSurface, currentTooth);

  // 2. Insert ledger session — only for planned/completed.
  // existing_current/existing_other/referred are clinical notes, not billable.
  // CRITICAL: pass status + provider_id so the user's choices are preserved.
  // Without these, DB defaults (status='completed', provider_id=NULL) silently overwrite them.
  var newSess = null;
  if (pendingTreatStatus === 'completed' || pendingTreatStatus === 'planned') {
    var sessRes2 = await window.sb.from('ledger_sessions').insert({
      doctor_id: currentUser.id, patient_id: patientId,
      type: pendingToothLabel, description: 'السن رقم ' + currentTooth + ' — ' + areaForLabDesc,
      cost: cost, date: date, notes: notes,
      tooth_num: String(currentTooth), surface: currentSurface,
      status: pendingTreatStatus,
      provider_id: pendingProviderId,
      treatment_key: getTreatment(pendingToothStatus) ? pendingToothStatus : null,   // v260
      currency: window.SyDentCurPick.read('toothCost')   // M125: نفس مصدر السعر
    }).select().single();
    if (sessRes2.error) {
      console.warn('tooth+lab session insert failed:', sessRes2.error);
      showToast('⚠️ فشل حفظ الجلسة: ' + (sessRes2.error.message || 'سبب غير معروف'));
      return;
    }
    newSess = sessRes2.data;
    if (newSess) {
      sessions.unshift(newSess); sortByDateDesc(sessions);
      // Phase 5: audit log (tooth + lab combined flow — typically prostheses)
      if (window.logAudit) {
        window.logAudit('session.create', {
          entityId: newSess.id,
          patientId: patientId,
          patientName: (patient && patient.name) || '',
          description: 'إضافة جلسة (' + 'السن ' + currentTooth + ' — ' + areaForLabDesc + ') + طلب مخبر: ' + pendingToothLabel + ' — ' + cost + ' ' + _rowLbl(newSess),
          newValue: { type: pendingToothLabel, cost: cost, date: date, status: pendingTreatStatus, provider_id: pendingProviderId, tooth_num: String(currentTooth), surface: currentSurface, with_lab: true }
        });
      }
      // Reallocate funds: if there was unearned credit, it auto-flows to this session.
      await reallocatePatientFunds();
    }
  }

  var updates = {};
  if (!patient.last_visit || date > patient.last_visit) updates.last_visit = date;
  if (patient.status === 'جديد') updates.status = 'تحت العلاج';
  if (Object.keys(updates).length) {
    await window.sb.from('patients').update(updates).eq('id', patientId).eq('doctor_id', currentUser.id);
    Object.assign(patient, updates);
  }
  await syncPaymentStatus();
  renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();

  // Now close tooth modal and open lab modal with prefilled data
  var toothNum = currentTooth;
  var treatmentKey = pendingToothStatus;
  var sessionNotes = notes;
  closeModal('toothModal');

  // appointment_id is left undefined so openLabOrderModal defaults to '__auto__'
  // (auto-link to next upcoming appointment).
    /* M127: نفسُ قاعدة زرّ 🥽 بصفّ الجلسة — علاجٌ لم يُنجَز يعني أن الطبعة لم
       تُؤخذ، فالطلبُ يُفتح مسودّةً. وبدونها كان البابان يعطيان نتيجتين مختلفتين
       للحالة السريرية الواحدة: هذا الزرّ يُرسل و🥽 يُسوِّد — وهو فرقٌ لا يقدر
       الطبيبُ أن يتوقّعه. والمودالُ نموذجُ طلبٍ لا فعلَ إرسال؛ الإرسالُ هو التاريخ. */
  openLabOrderModal({
    tooth_num: toothNum,
    treatment_key: treatmentKey,
    notes: sessionNotes,
    provider_id: pendingProviderId || null,
    draft: pendingTreatStatus !== 'completed',
    session_id: newSess ? newSess.id : null   // M79: link the order to the fresh session
  });

  showToast('✅ تم حفظ الجلسة — أكمل بيانات المخبر');
  // P3-B: الخصم التلقائي للمواد (مسار السن + مخبر) — معزول داخل try/catch.
  // بوّابة الحالة (مطابقة لـ saveToothTreatment): completed فقط؛ المخطّط يُخصم
  // لاحقاً لحظة الإكمال.
  try {
    if (pendingTreatStatus === 'completed' && pendingToothStatus && getTreatment(pendingToothStatus)) {
      // مؤجَّل: مودال المخبر مفتوح للتو — فتح الخصم فوقه = تراكب مشوّش.
      // نقطة الخنق closeModal('labOrderModal') تُطلقه بعد الإغلاق بأي مسار.
      window._pendingMatDeduct = { k: pendingToothStatus, l: pendingToothLabel, m: 1, s: newSess ? [newSess.id] : [] };   /* M169 */
    }
  } catch (e) { console.warn('material deduction skipped (tooth+lab):', e); }
}

/* ─── RX ─── */

/* ===== الروشتات (P1) ===== */
/* ============================================================
   Prescriptions (الروشتات) — P1
   patient-profile.html. يعتمد على helpers موجودة:
   currentUser, patientId, patient, CLINIC_DOCTORS, upcomingAppts,
   getDefaultProviderId, escapeHtml, calcAge, openModal, closeModal,
   toast, CLINIC_SETTINGS_WA (إن وُجد). آلية الطباعة: #printRoot + body.printing.
   ============================================================ */

var PRESCRIPTIONS = [];        // روشتات المريض الحالي
var RX_TEMPLATES  = [];        // قوالب المالك
var _savePrescriptionInFlight = false;

/* ---------- تحميل + عرض القائمة ---------- */
async function loadPrescriptions() {
  if (!currentUser || !patientId) return;
  var el = document.getElementById('rxList');
  try {
    var res = await window.sb.from('prescriptions')
      .select('id, provider_id, appointment_id, notes, created_at')
      .eq('owner_id', currentUser.id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (res.error) {
      // graceful: جدول غير موجود (قبل Migration 51)
      var msg = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px;">ميزة الروشتات غير مُفعّلة بعد.</div>';
        return;
      }
      console.warn('loadPrescriptions:', res.error);
      PRESCRIPTIONS = [];
    } else {
      PRESCRIPTIONS = res.data || [];
    }
  } catch (e) { console.warn('loadPrescriptions catch:', e); PRESCRIPTIONS = []; }

  // عدّ الأدوية لكل روشتة (لعرض ملخّص)
  var ids = PRESCRIPTIONS.map(function(p){ return p.id; });
  var itemsByRx = {};
  if (ids.length) {
    try {
      var ir = await window.sb.from('prescription_items')
        .select('prescription_id, drug_name, dosage, frequency, duration, instructions, sort_order')
        .in('prescription_id', ids)
        .order('sort_order', { ascending: true });
      if (!ir.error && ir.data) {
        ir.data.forEach(function(it){
          (itemsByRx[it.prescription_id] = itemsByRx[it.prescription_id] || []).push(it);
        });
      }
    } catch (e) { /* graceful */ }
  }
  window._rxItemsByRx = itemsByRx;

  // بادج
  var badge = document.getElementById('rxBadge');
  if (badge) {
    if (PRESCRIPTIONS.length) { badge.textContent = PRESCRIPTIONS.length; badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  renderPrescriptions();
}

function rxProviderName(pid) {
  if (!pid) return '';
  var _all = window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS || [];   /* M147: الاسم يُحلّ من الكلّ (وصفةُ طبيبٍ عُطّل لاحقاً) */
  for (var i=0;i<_all.length;i++) if (_all[i].id === pid) return _all[i].name;
  return '';
}

function renderPrescriptions() {
  var el = document.getElementById('rxList');
  if (!el) return;
  if (!PRESCRIPTIONS.length) {
    el.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text2);">'
      + '<div style="font-size:34px;">💊</div>'
      + '<div style="margin-top:8px;font-size:13px;">لا توجد روشتات بعد — أنشئ أول روشتة لهذا المريض.</div></div>';
    return;
  }
  var itemsByRx = window._rxItemsByRx || {};
  var rows = PRESCRIPTIONS.map(function(p){
    var items = itemsByRx[p.id] || [];
    var drugs = items.map(function(it){ return escapeHtml(it.drug_name); }).join('، ');
    if (drugs.length > 90) drugs = drugs.slice(0,90) + '…';
    var dr = rxProviderName(p.provider_id);
    var dateStr = p.created_at ? (SyDT.numDate(p.created_at) + (SyDT.time12(p.created_at) ? ' ' + SyDT.time12(p.created_at) : '')) : '';   // v478: سطرُ الموبايل أرقاماً ووقتاً
    return '<tr>'
      + '<td class="mc-hide" style="white-space:nowrap;">' + (p.created_at ? SyDT.cell(p.created_at) : '—') + '</td>'   /* v478: تاريخاً ووقتاً */
      + '<td class="mc-title mc-wide">' + (drugs || '<span style="color:var(--text2);">—</span>')
      +   '<div class="mc-only mc-meta">' + escapeHtml(dateStr) + (dr ? ' · ' + escapeHtml(dr) : '') + '</div></td>'   // v328: سطرُ الموبايل
      + '<td class="mc-hide" style="white-space:nowrap;">' + (dr ? escapeHtml(dr) : '<span style="color:var(--text2);">—</span>') + '</td>'
      + '<td class="mc-actions" style="text-align:left;white-space:nowrap;"><div class="sy-acts">'
        + '<button class="sy-act" onclick="printPrescription(\'' + p.id + '\')">🖨️ طباعة</button>'
        + '<button class="sy-act" onclick="copyPrescription(\'' + p.id + '\')">📋 نسخ</button>'
        + '<button class="sy-act sy-act-danger" onclick="deletePrescription(\'' + p.id + '\')">🗑️ حذف</button>'
      + '</div></td></tr>';
  }).join('');
  el.innerHTML = '<div style="overflow-x:auto;" class="no-scrollbar"><table class="data-table m-cards">'
    + '<thead><tr><th>التاريخ</th><th>الأدوية</th><th>الطبيب</th><th style="text-align:left;"></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
}

/* ---------- فتح المودال ---------- */
function rxItemRowHtml(it) {
  it = it || {};
  return '<div class="rx-item-row" style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--bg2);">'
    + '<div style="display:flex;gap:8px;align-items:flex-start;">'
      + '<input type="text" class="rx-drug" placeholder="اسم الدواء *" value="' + escapeHtml(it.drug_name||'') + '" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:14px;">'
      + '<button class="btn" onclick="this.closest(\'.rx-item-row\').remove()" style="padding:8px 12px;font-size:13px;color:var(--danger,#e5484d);" title="حذف">✕</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">'
      + '<input type="text" class="rx-dosage" placeholder="الجرعة (مثال: 500mg)" value="' + escapeHtml(it.dosage||'') + '" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:13px;">'
      + '<input type="text" class="rx-freq" placeholder="التكرار (مثال: 3 مرات/يوم)" value="' + escapeHtml(it.frequency||'') + '" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:13px;">'
      + '<input type="text" class="rx-dur" placeholder="المدة (مثال: 5 أيام)" value="' + escapeHtml(it.duration||'') + '" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:13px;">'
    + '</div>'
    + '<input type="text" class="rx-instr" placeholder="تعليمات (مثال: بعد الأكل)" value="' + escapeHtml(it.instructions||'') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:13px;margin-top:8px;">'
  + '</div>';
}

function rxAddItemRow(it) {
  var wrap = document.getElementById('rxItemsWrap');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', rxItemRowHtml(it));
}

async function openRxModal() {
  // تحميل القوالب أول مرة (lazy)
  if (!RX_TEMPLATES.length) { try { await loadRxTemplates(); } catch(e){} }
  // إعادة ضبط
  var saveBtn = document.getElementById('rxSaveBtn');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'حفظ الروشتة'; }
  document.getElementById('rxNotes').value = '';
  document.getElementById('rxSaveAsTemplate').checked = false;
  document.getElementById('rxTemplateNameGroup').style.display = 'none';
  document.getElementById('rxTemplateName').value = '';
  document.getElementById('rxItemsWrap').innerHTML = '';
  _rxEditingTemplateId = null;
  /* M130.1: مودالٌ واحد بوضعين — إصدارُ روشتة وتعديلُ قالب. كلُّ أثرٍ لوضع
     التعديل يُمسح هنا كي لا يفتح المودال بحالةٍ بائتة من فتحةٍ سابقة. */
  var _rxTplBn = document.getElementById('rxTplEditBanner');
  if (_rxTplBn) _rxTplBn.style.display = 'none';
  var _rxTplRow = document.getElementById('rxSaveAsTemplateRow');
  if (_rxTplRow) _rxTplRow.style.display = 'flex';
  rxAddItemRow(); // سطر فارغ أول

  // M87: تنبيه طبي قبل الوصف (الأعلام + الحساسية موسومة منفصلة) — textContent حصراً = صفر XSS
  var mh = document.getElementById('rxMedHint');
  if (mh) {
    var mhl = warnParts(patient);   /* M87+M92 */
    var agH = allergyParts(patient);
    if (agH.length) mhl = mhl.concat(['حساسية: ' + agH.join('، ')]);
    if (mhl.length) {
      mh.textContent = '⚠️ تنبيه طبي قبل الوصف: ' + mhl.join('، ');
      mh.style.display = 'block';
    } else { mh.style.display = 'none'; mh.textContent = ''; }
  }

  // قائمة الأطباء
  var group = document.getElementById('rxProviderGroup');
  var select = document.getElementById('rxProvider');
  if (group && select) {
    if (!CLINIC_DOCTORS || CLINIC_DOCTORS.length === 0) {
      group.style.display = 'none';
    } else {
      var active = CLINIC_DOCTORS.filter(function(d){ return d.is_active !== false; });
      var list = active.length ? active : CLINIC_DOCTORS;
      group.style.display = 'block';
      select.innerHTML = list.map(function(d){
        var own = d.is_owner ? ' ⭐' : '';
        return '<option value="' + d.id + '">' + escapeHtml(d.name) + own + '</option>';
      }).join('');
      select.value = getDefaultProviderId(list);
    }
  }

  // ربط بموعد
  var aGroup = document.getElementById('rxApptGroup');
  var aSelect = document.getElementById('rxAppt');
  if (aGroup && aSelect) {
    if (!upcomingAppts || upcomingAppts.length === 0) {
      aGroup.style.display = 'none';
      aSelect.innerHTML = '';
    } else {
      aGroup.style.display = 'block';
      var opts = '<option value="">— لا تربط بموعد —</option>';
      upcomingAppts.forEach(function(u){
        var d = u.date ? SyDT.numDate(u.date) : '';   // v478: أرقاماً
        opts += '<option value="' + u.id + '">' + escapeHtml(d) + (u.time ? (' — ' + escapeHtml(u.time)) : '') + '</option>';
      });
      aSelect.innerHTML = opts;
    }
  }

  // القوالب
  rxPopulateTemplatePicker();

  openModal('rxModal');
}

/* ---------- القوالب ---------- */
async function loadRxTemplates() {
  if (!currentUser) return;
  try {
    var res = await window.sb.from('prescription_templates')
      .select('id, name, items, created_at')
      .eq('owner_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (!res.error && res.data) RX_TEMPLATES = res.data;
  } catch (e) { /* graceful */ RX_TEMPLATES = []; }
}

function rxPopulateTemplatePicker() {
  var sel = document.getElementById('rxTemplatePick');
  if (!sel) return;
  var opts = '<option value="">— بلا قالب —</option>';
  RX_TEMPLATES.forEach(function(t){
    opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
  });
  sel.innerHTML = opts;
  sel.value = '';
}

function rxApplyTemplate(tid) {
  if (!tid) return;
  var tpl = null;
  for (var i=0;i<RX_TEMPLATES.length;i++) if (RX_TEMPLATES[i].id === tid) { tpl = RX_TEMPLATES[i]; break; }
  if (!tpl) return;
  var items = Array.isArray(tpl.items) ? tpl.items : [];
  var wrap = document.getElementById('rxItemsWrap');
  wrap.innerHTML = '';
  if (!items.length) { rxAddItemRow(); return; }
  items.forEach(function(it){ rxAddItemRow(it); });
}

/* ---------- إدارة القوالب (عرض/تعديل/حذف) ---------- */
async function openRxTemplatesModal() {
  if (!RX_TEMPLATES.length) { try { await loadRxTemplates(); } catch(e){} }
  renderRxTemplatesList();
  openModal('rxTemplatesModal');
}

function renderRxTemplatesList() {
  var el = document.getElementById('rxTemplatesList');
  if (!el) return;
  if (!RX_TEMPLATES.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);">'
      + '<div style="font-size:30px;">📋</div>'
      + '<div style="margin-top:8px;font-size:13px;">لا توجد قوالب بعد.<br>أنشئ روشتة وفعّل «حفظ كقالب» لإضافة قالب.</div></div>';
    return;
  }
  el.innerHTML = RX_TEMPLATES.map(function(t){
    var items = Array.isArray(t.items) ? t.items : [];
    var drugs = items.map(function(it){ return escapeHtml(it.drug_name||''); }).join('، ');
    if (drugs.length > 80) drugs = drugs.slice(0,80) + '…';
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;color:var(--text);">' + escapeHtml(t.name) + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + (drugs || '<span style="opacity:.6;">— بلا أدوية —</span>') + '</div>'
      + '</div>'
      + '<div class="sy-acts">'
        + '<button class="sy-act" onclick="rxEditTemplate(\'' + t.id + '\')">✏️ تعديل</button>'
        + '<button class="sy-act sy-act-danger" onclick="deleteRxTemplate(\'' + t.id + '\')">🗑️ حذف</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

var deleteRxTemplate = ppGuarded('deleteRxTemplate', _deleteRxTemplate_inner, 'جارٍ الحذف…');   /* v285: قفل + انشغال */
async function _deleteRxTemplate_inner(tid) {
  var tpl = null;
  for (var i=0;i<RX_TEMPLATES.length;i++) if (RX_TEMPLATES[i].id === tid) { tpl = RX_TEMPLATES[i]; break; }
  var nm = tpl ? tpl.name : 'هذا القالب';
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + nm + '» نهائياً؟', danger: true })) return;
  try {
    var del = await window.sb.from('prescription_templates')
      .delete().eq('id', tid).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    await loadRxTemplates();
    renderRxTemplatesList();      // حدّث قائمة المودال
    rxPopulateTemplatePicker();   // حدّث الـ dropdown بمودال الروشتة
    showToast('تم حذف القالب');
  } catch (e) { console.error('deleteRxTemplate:', e); showToast('⚠️ تعذّر حذف القالب'); }
}

/* M130.1 — تعديلُ قالبٍ يُحدّث صفَّ القالب بمكانه ولا يُصدر روشتة.
   العقدُ السابق كان: «عدّل الأدوية ثم احفظ الروشتة فيُحدَّث القالب» — أي أن
   إعادةَ تسميةِ قالبٍ كانت تكتب **مستنداً سريرياً بسجل المريض المفتوح**
   (صفّ prescriptions + بنوده)، ثم تُنشئ نسخةً وتحذف الأصل. والروشتةُ ليست
   أثراً جانبياً مقبولاً لعملية تحرير. النمطُ الصحيح قائمٌ بالمشروع مرتين
   (قوالب التعليمات والزرعات: مودالُ تحريرٍ يُحدّث بمكانه)، وهذا يعتمده بلا
   مودالٍ ثالث: نفسُ محرّر الأدوية بوضعٍ مُعلَن، والحفظُ يتفرّع عند المدخل. */
function rxEditTemplate(tid) {
  var tpl = null;
  for (var i=0;i<RX_TEMPLATES.length;i++) if (RX_TEMPLATES[i].id === tid) { tpl = RX_TEMPLATES[i]; break; }
  if (!tpl) return;
  closeModal('rxTemplatesModal');
  // افتح مودال الروشتة (يعيد الضبط) ثم حوّله إلى وضع تعديل القالب
  openRxModal().then(function(){
    var items = Array.isArray(tpl.items) ? tpl.items : [];
    var wrap = document.getElementById('rxItemsWrap');
    wrap.innerHTML = '';
    if (!items.length) { rxAddItemRow(); } else { items.forEach(function(it){ rxAddItemRow(it); }); }
    /* «حفظ كقالب» لا معنى له داخل تعديل قالب — يُخفى ويُطفأ كي لا يُنشئ نسخة. */
    var chk = document.getElementById('rxSaveAsTemplate');
    if (chk) chk.checked = false;
    var row = document.getElementById('rxSaveAsTemplateRow');
    if (row) row.style.display = 'none';
    document.getElementById('rxTemplateNameGroup').style.display = 'block';
    document.getElementById('rxTemplateName').value = tpl.name;
    /* الوضعُ مُعلَن بالشاشة لا بالنيّة: الطبيبُ يجب أن يرى أن لا روشتة ستصدر.
       textContent حصراً — اسمُ القالب مدخَلُ مستخدم (#195). */
    var bn = document.getElementById('rxTplEditBanner');
    if (bn) {
      bn.textContent = '✏️ وضع تعديل القالب «' + tpl.name + '» — لن تُصدَر روشتة ولن يُكتب شيء بسجل المريض.';
      bn.style.display = 'block';
    }
    var sb = document.getElementById('rxSaveBtn');
    if (sb) sb.textContent = 'تحديث القالب';
    _rxEditingTemplateId = tpl.id;
    showToast('عدّل الأدوية والاسم ثم اضغط «تحديث القالب»');
  });
}
/* M130.1 — حفظُ وضع التعديل: update بمكانه. لا إنشاءَ نسخةٍ ولا حذفَ أصل،
   فلا نافذةَ يضيع فيها القالب لو فشل الإنشاء (وهي التي كانت مفتوحة سابقاً:
   الإدراجُ غيرُ مفحوص ثم الأصلُ يُحذف على أي حال). */
async function rxSaveTemplateOnly() {
  if (!_rxEditingTemplateId) return;
  if (_savePrescriptionInFlight) return;
  var items = rxCollectItems();
  if (!items.length) { showToast('⚠️ أضف دواءً واحداً على الأقل'); return; }
  var name = (document.getElementById('rxTemplateName').value || '').trim();
  if (!name) { showToast('⚠️ اسم القالب مطلوب'); return; }
  _savePrescriptionInFlight = true;
  var btn = document.getElementById('rxSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
  try {
    var tplItems = items.map(function(it){
      return { drug_name: it.drug_name, dosage: it.dosage, frequency: it.frequency, duration: it.duration, instructions: it.instructions };
    });
    var upd = await window.sb.from('prescription_templates')
      .update({ name: name, items: tplItems })
      .eq('id', _rxEditingTemplateId).eq('owner_id', currentUser.id);
    if (upd.error) throw upd.error;
    _rxEditingTemplateId = null;
    closeModal('rxModal');
    await loadRxTemplates();
    rxPopulateTemplatePicker();
    renderRxTemplatesList();
    showToast('تم تحديث القالب ✓');
  } catch (e) {
    console.error('rxSaveTemplateOnly:', e);
    showToast('⚠️ تعذّر تحديث القالب');
  } finally {
    _savePrescriptionInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'تحديث القالب'; }
  }
}
var _rxEditingTemplateId = null;

function rxCollectItems() {
  var rows = document.querySelectorAll('#rxItemsWrap .rx-item-row');
  var items = [];
  for (var i=0;i<rows.length;i++) {
    var r = rows[i];
    var drug = (r.querySelector('.rx-drug').value || '').trim();
    if (!drug) continue; // تجاهل الأسطر الفارغة
    items.push({
      drug_name:    drug,
      dosage:       (r.querySelector('.rx-dosage').value || '').trim(),
      frequency:    (r.querySelector('.rx-freq').value || '').trim(),
      duration:     (r.querySelector('.rx-dur').value || '').trim(),
      instructions: (r.querySelector('.rx-instr').value || '').trim()
    });
  }
  return items;
}

/* ---------- حفظ ---------- */
async function savePrescription() {
  if (_savePrescriptionInFlight) return;
  /* M130.1: وضعُ تعديل القالب يُحوَّل عند **المدخل** لا بالمخرج — فلا يُنشأ صفُّ
     روشتةٍ ثم يُتراجَع عنه، ولا يبقى للتحرير أثرٌ بسجل المريض إطلاقاً. */
  if (_rxEditingTemplateId) { await rxSaveTemplateOnly(); return; }
  var items = rxCollectItems();
  if (!items.length) { showToast('⚠️ أضف دواءً واحداً على الأقل'); return; }

  _savePrescriptionInFlight = true;
  var _rxTplMsg = '';   /* M130.1: مصيرُ القالب يُعلَن مع نتيجة الروشتة لا بصمت */
  var btn = document.getElementById('rxSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

  try {
    var providerId = null;
    var pg = document.getElementById('rxProviderGroup');
    if (pg && pg.style.display !== 'none') {
      var pv = document.getElementById('rxProvider').value;
      providerId = pv || null;
    }
    var apptId = null;
    var ag = document.getElementById('rxApptGroup');
    if (ag && ag.style.display !== 'none') {
      var av = document.getElementById('rxAppt').value;
      apptId = av || null;
    }
    var notes = (document.getElementById('rxNotes').value || '').trim() || null;

    // 1) رأس الروشتة
    var insRx = await window.sb.from('prescriptions').insert({
      owner_id: currentUser.id,
      patient_id: patientId,
      provider_id: providerId,
      appointment_id: apptId,
      notes: notes
    }).select('id').single();
    if (insRx.error) throw insRx.error;
    var rxId = insRx.data.id;

    // 2) الأدوية
    var itemRows = items.map(function(it, idx){
      return {
        owner_id: currentUser.id,
        prescription_id: rxId,
        drug_name: it.drug_name,
        dosage: it.dosage || null,
        frequency: it.frequency || null,
        duration: it.duration || null,
        instructions: it.instructions || null,
        sort_order: idx
      };
    });
    var insItems = await window.sb.from('prescription_items').insert(itemRows);
    if (insItems.error) throw insItems.error;

    // 3) حفظ كقالب (اختياري)
    if (document.getElementById('rxSaveAsTemplate').checked) {
      var tname = (document.getElementById('rxTemplateName').value || '').trim();
      if (tname) {
        var tplItems = items.map(function(it){
          return { drug_name: it.drug_name, dosage: it.dosage, frequency: it.frequency, duration: it.duration, instructions: it.instructions };
        });
        /* M130.1: عميلُ Supabase **لا يرمي** عند خطأ القاعدة بل يرجّعه بـ.error،
           فـtry/catch وحده كان يبتلع الفشل بصمت والطبيبُ يظنّ القالب محفوظاً.
           والفشلُ هنا لا يمسّ نجاح الروشتة (محفوظةٌ فعلاً) فيُعلَن برسالته
           المستقلّة — نمطُ قوالب الزرعات حرفياً. وفرعُ «احذف القديم» أُزيل: التعديل
           ما عاد يمرّ من هنا فهو كودٌ ميّت (#499). */
        try {
          var tplIns = await window.sb.from('prescription_templates').insert({
            owner_id: currentUser.id, name: tname, items: tplItems
          });
          if (tplIns.error) throw tplIns.error;
          await loadRxTemplates();
          rxPopulateTemplatePicker();
        } catch (e) {
          console.error('save rx template:', e);
          _rxTplMsg = '⚠️ حُفظت الروشتة — تعذّر حفظ القالب';
        }
      }
    }
    _rxEditingTemplateId = null;

    // audit (graceful — نفس نمط الصفحة)
    try {
      if (typeof logAudit === 'function') {
        await logAudit('prescription.create', { entityType: 'prescription', entityId: rxId, patientId: patientId, patientName: (patient && patient.name) || null, newValue: { items: items.length } });
      }
    } catch (e) { /* graceful */ }

    closeModal('rxModal');
    showToast(_rxTplMsg || 'تم حفظ الروشتة ✓');
    await loadPrescriptions();
  } catch (e) {
    console.error('savePrescription:', e);
    showToast('⚠️ تعذّر حفظ الروشتة');
  } finally {
    _savePrescriptionInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'حفظ الروشتة'; }
  }
}

/* ---------- حذف ---------- */
var deletePrescription = ppGuarded('deletePrescription', _deletePrescription_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _deletePrescription_inner(rxId) {
  if (!await SyDialog.confirm({ message: 'حذف هذه الروشتة نهائياً؟', danger: true })) return;
  try {
    // الأدوية تُحذف تلقائياً (ON DELETE CASCADE) لكن نحذفها صراحةً للأمان
    await window.sb.from('prescription_items').delete().eq('prescription_id', rxId).eq('owner_id', currentUser.id);
    var del = await window.sb.from('prescriptions').delete().eq('id', rxId).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    try { if (typeof logAudit === 'function') await logAudit('prescription.delete', { entityType: 'prescription', entityId: rxId, patientId: patientId, patientName: (patient && patient.name) || null }); } catch(e){}
    showToast('تم الحذف');
    await loadPrescriptions();
  } catch (e) { console.error('deletePrescription:', e); showToast('⚠️ تعذّر الحذف'); }
}

/* ---------- جلب روشتة كاملة (للطباعة/النسخ) ---------- */
async function rxFetchFull(rxId) {
  var head = null, items = [];
  for (var i=0;i<PRESCRIPTIONS.length;i++) if (PRESCRIPTIONS[i].id === rxId) { head = PRESCRIPTIONS[i]; break; }
  try {
    var ir = await window.sb.from('prescription_items')
      .select('drug_name, dosage, frequency, duration, instructions, sort_order')
      .eq('prescription_id', rxId)
      .order('sort_order', { ascending: true });
    if (!ir.error && ir.data) items = ir.data;
  } catch (e) { /* graceful */ }
  return { head: head, items: items };
}

/* ---------- بيانات العيادة للرأس ---------- */
function rxClinicInfo() {
  var s = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : {};
  // Migration 115: إظهار رقم النقابة على المطبوعات قرار الطبيب. البوابة هنا
  // عند المنبع الوحيد: كل أسطح الطباعة الخمسة (روشتة · تعليمات ما بعد العلاج
  // · مخطط الأسنان · خطة العلاج · كشف الحساب) تقرأ منه حصراً — فلا حاجة للمس
  // أيٍّ منها، ويستحيل أن ينحرف سطح عن الباقي.
  // '=== false' وليس '!s.…' عمداً: الغياب (حساب قبل الهجرة · فشل تحميل
  // الإعدادات · كائن احتياطي) يعني الإظهار، أي سلوك ما قبل M115 حرفياً.
  var rxOn = (s.license_no_on_rx !== false);
  return {
    clinic_name: s.clinic_name || 'العيادة',
    clinic_phone: s.clinic_phone || '',
    license_no: rxOn ? (s.license_no || '') : ''
  };
}

/* ---------- بناء HTML الطباعة ---------- */
function buildPrescriptionHtml(rx) {
  var c = rxClinicInfo();
  var head = rx.head || {};
  var dr = rxProviderName(head.provider_id);
  var dateStr = SyDT.numDate(head.created_at ? new Date(head.created_at) : new Date());   // v487: المطبوعُ أرقاماً (قرار المالك)
  var pName = (patient && patient.name) ? patient.name : '';
  var pAge = (patient && patient.dob) ? calcAge(patient.dob) : '';
  var pGender = (patient && patient.gender) ? patient.gender : '';

  var h = '<div style="direction:rtl;font-family:Cairo,Tahoma,sans-serif;color:#111;max-width:780px;margin:0 auto;padding:24px;">';

  // الرأس
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--green);padding-bottom:14px;margin-bottom:6px;">';
  h += '<div>';
  h += '<div style="font-size:24px;font-weight:800;color:#111;">' + escapeHtml(c.clinic_name) + '</div>';
  if (dr) h += '<div style="font-size:15px;color:#333;margin-top:4px;">' + escapeHtml(dr) + '</div>';
  if (c.license_no) h += '<div style="font-size:12px;color:#666;margin-top:2px;">رقم النقابة: ' + escapeHtml(c.license_no) + '</div>';
  h += '</div>';
  h += '<div style="text-align:left;font-size:13px;color:#444;">';
  if (c.clinic_phone) h += '<div>📞 ' + escapeHtml(c.clinic_phone) + '</div>';
  h += '<div style="margin-top:4px;">' + escapeHtml(dateStr) + '</div>';
  h += '</div>';
  h += '</div>';

  // رمز الروشتة الطبي ℞
  h += '<div style="font-size:38px;font-weight:800;color:var(--green);line-height:1;margin:8px 0;">℞</div>';

  // بيانات المريض
  h += '<div style="background:#f6f6f6;border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:14px;color:#222;">';
  h += '<strong>المريض:</strong> ' + escapeHtml(pName);
  if (pGender) h += ' &nbsp;•&nbsp; ' + escapeHtml(pGender);
  if (pAge !== '') h += ' &nbsp;•&nbsp; ' + escapeHtml(String(pAge));
  h += '</div>';

  // M87: التحذير الطبي على الروشتة المطبوعة (الأعلام + الحساسية موسومة منفصلة)
  var mfParts = warnParts(patient);   /* M87+M92 */
  var agP = allergyParts(patient);
  if (agP.length) mfParts = mfParts.concat(['حساسية: ' + agP.join('، ')]);
  if (mfParts.length)
    h += '<div style="border:1.5px solid #c62828;background:#fdecea;color:#b71c1c;border-radius:10px;padding:10px 16px;margin-bottom:18px;font-size:13.5px;font-weight:700;">⚠️ تحذير طبي: ' + escapeHtml(mfParts.join('، ')) + '</div>';

  // جدول الأدوية
  if (rx.items && rx.items.length) {
    h += '<table style="width:100%;border-collapse:collapse;font-size:14px;">';
    h += '<thead><tr style="background:var(--green);color:#06371f;">'
      + '<th style="padding:10px 12px;text-align:right;border:1px solid #d0d0d0;width:34px;">#</th>'
      + '<th style="padding:10px 12px;text-align:right;border:1px solid #d0d0d0;">الدواء</th>'
      + '<th style="padding:10px 12px;text-align:right;border:1px solid #d0d0d0;">الجرعة</th>'
      + '<th style="padding:10px 12px;text-align:right;border:1px solid #d0d0d0;">التكرار</th>'
      + '<th style="padding:10px 12px;text-align:right;border:1px solid #d0d0d0;">المدة</th>'
      + '</tr></thead><tbody>';
    rx.items.forEach(function(it, idx){
      h += '<tr>'
        + '<td style="padding:9px 12px;border:1px solid #d0d0d0;color:#666;">' + (idx+1) + '</td>'
        + '<td style="padding:9px 12px;border:1px solid #d0d0d0;font-weight:700;">' + escapeHtml(it.drug_name||'') + '</td>'
        + '<td style="padding:9px 12px;border:1px solid #d0d0d0;">' + escapeHtml(it.dosage||'—') + '</td>'
        + '<td style="padding:9px 12px;border:1px solid #d0d0d0;">' + escapeHtml(it.frequency||'—') + '</td>'
        + '<td style="padding:9px 12px;border:1px solid #d0d0d0;">' + escapeHtml(it.duration||'—') + '</td>'
        + '</tr>';
      if (it.instructions) {
        h += '<tr><td style="border:1px solid #d0d0d0;"></td>'
          + '<td colspan="4" style="padding:6px 12px;border:1px solid #d0d0d0;font-size:12px;color:#555;background:#fafafa;">📌 ' + escapeHtml(it.instructions) + '</td></tr>';
      }
    });
    h += '</tbody></table>';
  }

  // ملاحظات
  if (head.notes) {
    h += '<div style="margin-top:16px;font-size:13px;color:#333;border-right:3px solid var(--green);padding-right:12px;"><strong>ملاحظات:</strong> ' + escapeHtml(head.notes) + '</div>';
  }

  // التذييل
  h += '<div style="margin-top:46px;display:flex;justify-content:space-between;font-size:13px;color:#444;">';
  h += '<div>التوقيع: ____________________</div>';
  h += '<div>' + escapeHtml(c.clinic_name) + '</div>';
  h += '</div>';

  h += '</div>';
  return h;
}

/* ---------- طباعة (نفس آلية doPrintRecord) ---------- */
async function printPrescription(rxId) {
  var rx = await rxFetchFull(rxId);
  var root = document.getElementById('printRoot');
  if (!root) return;
  root.innerHTML = buildPrescriptionHtml(rx);
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture — iOS Safari blocks print() fired from setTimeout (transient user-activation is lost → 'blocked from automatically printing'). Content is inline SVG/CSS only; layout flushes before the print snapshot.
  setTimeout(cleanup, 60000);
}

/* ---------- نسخ نص (للواتساب اليدوي) ---------- */
async function copyPrescription(rxId) {
  var rx = await rxFetchFull(rxId);
  var c = rxClinicInfo();
  var dr = rxProviderName((rx.head||{}).provider_id);
  var pName = (patient && patient.name) ? patient.name : '';
  var lines = [];
  lines.push('💊 روشتة طبية — ' + c.clinic_name);
  if (dr) lines.push('الطبيب: ' + dr);
  lines.push('المريض: ' + pName);
  var mfCp = warnParts(patient);   /* M87+M92 */
  var agC = allergyParts(patient);
  if (agC.length) mfCp = mfCp.concat(['حساسية: ' + agC.join('، ')]);
  if (mfCp.length) lines.push('⚠️ تحذير طبي: ' + mfCp.join('، '));
  lines.push('────────────');
  (rx.items||[]).forEach(function(it, idx){
    var parts = [(idx+1) + '. ' + it.drug_name];
    var sub = [];
    if (it.dosage) sub.push(it.dosage);
    if (it.frequency) sub.push(it.frequency);
    if (it.duration) sub.push(it.duration);
    if (sub.length) parts.push('   ' + sub.join(' • '));
    if (it.instructions) parts.push('   📌 ' + it.instructions);
    lines.push(parts.join('\n'));
  });
  if ((rx.head||{}).notes) { lines.push('────────────'); lines.push('ملاحظات: ' + rx.head.notes); }
  var text = lines.join('\n');

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ الروشتة ✓');
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('تم نسخ الروشتة ✓');
    }
  } catch (e) { console.warn('copy:', e); showToast('⚠️ تعذّر النسخ'); }
}

/* ─── POSTOP سجلّات ─── */

/* ============================================================
   Post-op instructions — P6 PRM. يطابق بنية الروشتات (P1):
   - post_op_notes: سجلّات لكل مريض (نظير prescriptions).
   - post_op_templates: قوالب مشتركة قابلة لإعادة الاستخدام (نظير prescription_templates).
   يعتمد helpers موجودة: currentUser, patientId, patient, escapeHtml, rxClinicInfo,
   TREATMENTS, getTreatment, openModal/closeModal, showToast, calcAge، logAudit،
   آلية الطباعة #printRoot + body.printing. معزول تماماً عن المالية.
   ============================================================ */
var POST_OP_NOTES = [];        // تعليمات المريض الحالي (نظير PRESCRIPTIONS)
var POST_OP_TEMPLATES = [];    // قوالب المالك المشتركة (نظير RX_TEMPLATES)
var _postOpEditingTemplateId = null;
var _savePostOpNoteInFlight = false;
var _savePostOpTplInFlight = false;

/* ---------- تعليمات المريض (سجلّات) ---------- */
async function loadPostOpNotes() {
  if (!currentUser || !patientId) return;
  var el = document.getElementById('postopList');
  try {
    var res = await window.sb.from('post_op_notes')
      .select('id, body, treatment_key, created_at')
      .eq('owner_id', currentUser.id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (res.error) {
      var msg = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/relation .* does not exist|42P01|PGRST205/i.test(msg)) {
        if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px;">ميزة التعليمات غير مُفعّلة بعد.</div>';
        return;
      }
      console.warn('loadPostOpNotes:', res.error);
      POST_OP_NOTES = [];
    } else {
      POST_OP_NOTES = res.data || [];
    }
  } catch (e) { console.warn('loadPostOpNotes catch:', e); POST_OP_NOTES = []; }

  var badge = document.getElementById('postopBadge');
  if (badge) {
    if (POST_OP_NOTES.length) { badge.textContent = POST_OP_NOTES.length; badge.style.display = ''; }
    else badge.style.display = 'none';
  }
  renderPostOpNotes();
}

function renderPostOpNotes() {
  var el = document.getElementById('postopList');
  if (!el) return;
  if (!POST_OP_NOTES.length) {
    el.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text2);">'
      + '<div style="font-size:34px;">📋</div>'
      + '<div style="margin-top:8px;font-size:13px;">لا تعليمات لهذا المريض بعد — أنشئ أول تعليمات.</div></div>';
    return;
  }
  var rows = POST_OP_NOTES.map(function(n){
    var tl = postOpTreatmentLabel(n.treatment_key);
    var preview = (n.body || '').replace(/\s+/g,' ').trim();
    if (preview.length > 100) preview = preview.slice(0,100) + '…';
    var dateStr = n.created_at ? (SyDT.numDate(n.created_at) + (SyDT.time12(n.created_at) ? ' ' + SyDT.time12(n.created_at) : '')) : '';   // v478
    return '<tr>'
      + '<td class="mc-hide" style="white-space:nowrap;vertical-align:top;">' + (n.created_at ? SyDT.cell(n.created_at) : '—') + '</td>'   /* v478 */
      + '<td class="mc-title mc-wide">' + (preview ? escapeHtml(preview) : '<span style="color:var(--text2);">—</span>')
        + (tl ? ' <span style="font-size:11px;font-weight:600;color:var(--text2);background:var(--bg3);padding:2px 8px;border-radius:8px;white-space:nowrap;">🦷 ' + escapeHtml(tl) + '</span>' : '')
        + '<div class="mc-only mc-meta">' + escapeHtml(dateStr) + '</div></td>'   // v328: سطرُ الموبايل
      + '<td class="mc-actions" style="text-align:left;white-space:nowrap;vertical-align:top;"><div class="sy-acts">'
        + '<button class="sy-act" onclick="printPostOp(\'' + n.id + '\')">🖨️ طباعة</button>'
        + '<button class="sy-act" onclick="copyPostOp(\'' + n.id + '\')">📋 نسخ</button>'
        + '<button class="sy-act sy-act-danger" onclick="deletePostOpNote(\'' + n.id + '\')">🗑️ حذف</button>'
      + '</div></td></tr>';
  }).join('');
  el.innerHTML = '<div style="overflow-x:auto;" class="no-scrollbar"><table class="data-table m-cards">'
    + '<thead><tr><th>التاريخ</th><th>التعليمات</th><th style="text-align:left;"></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
}

/* ---------- مودال الإصدار (لهذا المريض) ---------- */
async function openPostOpModal() {
  if (!POST_OP_TEMPLATES.length) { try { await loadPostOpTemplates(); } catch(e){} }
  var btn = document.getElementById('postOpSaveBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'حفظ التعليمات'; }
  document.getElementById('postOpBody').value = '';
  document.getElementById('postOpSaveAsTemplate').checked = false;
  document.getElementById('postOpTemplateNameGroup').style.display = 'none';
  document.getElementById('postOpTemplateName').value = '';
  postOpPopulateTreatmentSelect('postOpTreatment', '');
  postOpPopulateTemplatePicker();
  /* بند #4/#119: تلميح الذكاء الاصطناعي ومنتقي قبل/بعد يعودان لافتراضهما
     عند كل فتح — كانا يعلقان من التعليمات السابقة (صنف علوق الحقول). */
  var poH = document.getElementById('postOpAiHint'); if (poH) poH.value = '';
  var poP = document.getElementById('postOpAiPhase'); if (poP) poP.value = 'post';
  if (typeof ppMsgCountSync === 'function') ppMsgCountSync('postOpBody', 'postOpMsgCount');   /* v444 */
  openModal('postOpModal');
}

async function savePostOpNote() {
  if (_savePostOpNoteInFlight) return;
  var body = (document.getElementById('postOpBody').value || '').trim();
  if (!body) { showToast('⚠️ اكتب نص التعليمات'); return; }
  var tkey = document.getElementById('postOpTreatment').value || null;

  _savePostOpNoteInFlight = true;
  var _poTplMsg = '';   /* M130.1: مصيرُ القالب يُعلَن مع نتيجة التعليمات لا بصمت */
  var btn = document.getElementById('postOpSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
  try {
    var ins = await window.sb.from('post_op_notes').insert({
      owner_id: currentUser.id, patient_id: patientId, body: body, treatment_key: tkey
    });
    if (ins.error) throw ins.error;

    // حفظ كقالب لإعادة الاستخدام مع مرضى آخرين (اختياري)
    if (document.getElementById('postOpSaveAsTemplate').checked) {
      var tname = (document.getElementById('postOpTemplateName').value || '').trim();
      if (tname) {
        /* M130.1: نفسُ صنف الروشتة — .error يُفحص، والفشلُ يُعلَن برسالةٍ مستقلّة
           لأن التعليمات نفسها محفوظةٌ فعلاً (نمط قوالب الزرعات). */
        try {
          var poIns = await window.sb.from('post_op_templates').insert({
            owner_id: currentUser.id, name: tname, body: body, treatment_key: tkey
          });
          if (poIns.error) throw poIns.error;
          await loadPostOpTemplates();
          postOpPopulateTemplatePicker();
        } catch (e) {
          console.error('save postop template:', e);
          _poTplMsg = '⚠️ حُفظت التعليمات — تعذّر حفظ القالب';
        }
      }
    }
    try { if (typeof logAudit === 'function') await logAudit('postop_note.create', { entityType: 'post_op_note', patientId: patientId, patientName: (patient && patient.name) || null, newValue: { len: body.length } }); } catch(e){}
    closeModal('postOpModal');
    showToast(_poTplMsg || 'تم حفظ التعليمات ✓');
    await loadPostOpNotes();
  } catch (e) {
    console.error('savePostOpNote:', e);
    showToast('⚠️ تعذّر حفظ التعليمات');
  } finally {
    _savePostOpNoteInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'حفظ التعليمات'; }
  }
}

var deletePostOpNote = ppGuarded('deletePostOpNote', _deletePostOpNote_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _deletePostOpNote_inner(id) {
  if (!await SyDialog.confirm({ message: 'حذف هذه التعليمات نهائياً؟', danger: true })) return;
  try {
    var del = await window.sb.from('post_op_notes').delete().eq('id', id).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    try { if (typeof logAudit === 'function') await logAudit('postop_note.delete', { entityType: 'post_op_note', entityId: id, patientId: patientId, patientName: (patient && patient.name) || null }); } catch(e){}
    showToast('تم الحذف');
    await loadPostOpNotes();
  } catch (e) { console.error('deletePostOpNote:', e); showToast('⚠️ تعذّر الحذف'); }
}

/* ─── POSTOP قوالب ─── */

/* ---------- القوالب (طبقة مشتركة لإعادة الاستخدام) ---------- */
async function loadPostOpTemplates() {
  if (!currentUser) return;
  try {
    var res = await window.sb.from('post_op_templates')
      .select('id, name, body, treatment_key, created_at')
      .eq('owner_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (!res.error && res.data) POST_OP_TEMPLATES = res.data;
  } catch (e) { /* graceful */ POST_OP_TEMPLATES = []; }
}

/* ═══════════════ مكتبة SyDent الجاهزة لتعليمات المريض (v418) ═══════════════
   قوالبُ مدمجة بالكود (لا بذرَ قاعدة): تصل كلَّ عيادةٍ جديدةٍ وقائمةٍ فوراً، وتصحيحُ نصٍّ
   طبيّ يُشحن مرةً واحدة للجميع بلا ترحيل بيانات. للقراءة فقط — تظهر بالمنتقي تحت
   «مكتبة SyDent» بجانب «قوالبي»؛ لتخصيص أحدها: اختره ← عدّل النص ← فعّل «حفظ هذه التعليمات كقالب».
   المحتوى راجعه المالك (طبيب أسنان) سريرياً 20/9/2026 وقوبل بمراجع NHS
   (Oxford Health · Kent · Guy's & St Thomas') وUniv. of Michigan OMFS: شاش 45–60 د ·
   لا مضمضة/بصق/مصّاصة وطعام طريّ فاتر 3 أيام، وبلا مضمضة ماء وملح بقالبَي القلع (قرار
   المالك السريري — v420) · إسعاف السن المخلوع وفق IADT 2020 (حليب/محلول ملحي/لعاب لا ماء،
   واللبني لا يُعاد) · بلا أسماء أدوية ولا جرعات. معرّفات lib## ثابتة لا يُعاد استعمالها. */
var POST_OP_LIBRARY = [
 {
  "id": "lib01",
  "name": "بعد قلع السن",
  "treatment_key": "extracted",
  "body": "بعد قلع السن، اتّباع هذه التعليمات يساعد على التئام سريع وسليم:\n\nاليوم الأول:\n• عضّ على قطعة الشاش بضغط ثابت 45–60 دقيقة ثم أزلها برفق. إن استمرّ النزف ضع شاشاً نظيفاً وعضّ عليه 30 دقيقة أخرى.\n• ضع كمّادة باردة على الخد من الخارج 10–15 دقيقة ثم أرِح المنطقة مثلها، خلال الساعات الأولى.\n• لا تأكل قبل زوال التخدير تماماً كي لا تعضّ شفتك أو خدّك.\n• ارفع رأسك بوسادة إضافية عند النوم.\n\nأول 3 أيام:\n• لا تتمضمض ولا تبصق بقوة ولا تشرب بالمصّاصة (الشلمونة) — فهذا يُزيح الخثرة الدموية التي تحمي مكان القلع.\n• طعامك وشرابك طريّ وفاتر أو بارد، وامضغ على الجهة الأخرى. تجنّب الساخن والقاسي والحبوب الصغيرة.\n• نظّف بقية أسنانك بالفرشاة كالمعتاد وتجنّب مكان القلع مباشرةً.\n• لا تدخين ولا أركيلة — هما السبب الأول لالتهاب السنخ الجاف.\n\nتجنّب أيضاً:\n• الأسبرين كمسكّن لأنه يزيد النزف (إلا إذا كنت تتناوله بانتظام بوصفة طبية فلا توقفه دون استشارة).\n• الجهد البدني الشديد في اليوم الأول.\n\nتناول المسكّن والأدوية كما وصفها الطبيب.\n\nاتصل بالعيادة إذا:\n• لم يتوقف النزف بعد ضغطتين متتاليتين بالشاش.\n• بدأ ألم شديد بعد اليوم الثاني أو الثالث يمتدّ نحو الأذن مع طعم أو رائحة كريهة.\n• ظهر تورّم يزداد بعد اليوم الثالث، أو حرارة، أو صعوبة في البلع."
 },
 {
  "id": "lib02",
  "name": "بعد القلع الجراحي / ضرس العقل",
  "treatment_key": "extracted",
  "body": "القلع الجراحي يحتاج عناية أكثر قليلاً. ما يلي طبيعي ومتوقّع: تورّم يبلغ ذروته في اليوم الثاني أو الثالث، وصعوبة بسيطة في فتح الفم، وكدمة خفيفة على الخد.\n\nاليوم الأول:\n• عضّ على الشاش 45–60 دقيقة، وكرّر بشاش نظيف إذا لزم. العضّ على الشاش لليوم الأول فقط.\n• كمّادات باردة على الخد: 15 دقيقة ثم راحة 15 دقيقة، أطول ما تستطيع خلال اليوم الأول.\n• لا تأكل قبل زوال التخدير تماماً.\n• نَم ورأسك مرفوع.\n\nأول 3 أيام:\n• لا مضمضة ولا بصق بقوة ولا شرب بالمصّاصة.\n• طعام وشراب طريّ، بارد أو فاتر (شوربة فاترة، بطاطا مهروسة، موز)، وأكثِر من السوائل.\n• تناول المسكّن بانتظام في اليومين الأولين لا عند اشتداد الألم فقط.\n\nمن اليوم الثالث:\n• استبدل الكمّادات الباردة بدافئة إذا بقي تورّم أو تيبّس.\n• افتح فمك وأغلقه بلطف عدة مرات يومياً ليعود الفتح لطبيعته.\n\nالغرز: تُفكّ بعد 7–10 أيام.\n\nتجنّب التدخين والأركيلة 5 أيام على الأقل، والجهد البدني 3 أيام.\n\nأكمل المضاد الحيوي حتى آخره إذا وُصف لك.\n\nاتصل بالعيادة إذا:\n• استمرّ الخدر في الشفة أو الذقن أو اللسان إلى اليوم التالي.\n• زاد التورّم أو الألم بعد اليوم الثالث بدل أن يتحسّن.\n• ظهرت حرارة، أو صديد، أو صعوبة في البلع أو التنفس، أو نزف لا يتوقف."
 },
 {
  "id": "lib03",
  "name": "بعد زراعة السن",
  "treatment_key": "implant",
  "body": "نجاح الزرعة يعتمد كثيراً على عنايتك في الأسابيع الأولى.\n\nاليوم الأول:\n• عضّ على الشاش 30–60 دقيقة. نزف خفيف أو لعاب ورديّ اللون طبيعي خلال اليوم الأول.\n• كمّادات باردة على الخد 15 دقيقة وراحة 15 دقيقة.\n• لا مضمضة ولا بصق ولا مصّاصة 24 ساعة.\n• لا تلمس مكان الزرعة بلسانك أو إصبعك ولا تشدّ شفتك لتراه.\n\nالأسبوعان الأولان:\n• طعام طريّ، وامضغ على الجهة الأخرى. تجنّب القاسي والمقرمش والحبوب الصغيرة (سمسم، بزر).\n• من اليوم الثاني: الغسول المطهّر كما وُصف لك، بلطف ودون خضّ قوي.\n• نظّف بقية أسنانك كالمعتاد، ونظّف منطقة الزرعة بفرشاة ناعمة جداً عندما يسمح الطبيب.\n• لا تضع الجهاز المتحرك (إن وُجد) فوق مكان الزرعة إلا بإذن الطبيب.\n\nمهم جداً:\n• التدخين والأركيلة يرفعان احتمال فشل الزرعة بشكل واضح — امتنع أسبوعين على الأقل، والأفضل طوال فترة الالتئام.\n• أكمل المضاد الحيوي حتى آخره إذا وُصف.\n• تجنّب الرياضة والجهد الشديد 3 أيام.\n\nإذا أُجري لك رفع للجيب الفكي: لا تنفخ أنفك بقوة أسبوعين، واعطس وفمك مفتوح، وتجنّب السباحة والسفر بالطائرة حتى يأذن الطبيب.\n\nاتصل بالعيادة إذا:\n• شعرت بحركة في الزرعة أو في غطاء الالتئام، أو سقط الغطاء.\n• زاد الألم أو التورّم بعد اليوم الثالث، أو ظهر صديد أو حرارة.\n• استمرّ خدر الشفة أو الذقن إلى اليوم التالي."
 },
 {
  "id": "lib04",
  "name": "بعد الطعم العظمي / حفظ السنخ",
  "treatment_key": "socket-graft",
  "body": "وُضعت مادة طعم عظمي في مكان العمل وغُطّيت بغشاء و/أو غرز لحمايتها.\n\n• قد تلاحظ حُبيبات صغيرة تشبه الرمل في فمك خلال الأيام الأولى — هذا طبيعي ولا يعني فشل الطعم.\n• لا تلمس المنطقة بلسانك أو إصبعك، ولا تشدّ شفتك لتراها.\n• لا مضمضة ولا بصق ولا مصّاصة 24 ساعة، ثم مضمضة لطيفة جداً بالغسول الموصوف.\n• طعام طريّ وعلى الجهة الأخرى لمدة أسبوعين.\n• لا تفرّش المنطقة مباشرةً حتى يأذن الطبيب.\n• امتنع عن التدخين والأركيلة أسبوعين على الأقل — فهما أكبر خطر على الطعم.\n• أكمل المضاد الحيوي حتى آخره.\n\nاتصل بالعيادة إذا: انكشف الغشاء أو انفكّت الغرز مبكراً، أو خرجت كمية كبيرة من الحُبيبات، أو ظهر صديد أو تورّم متزايد أو حرارة."
 },
 {
  "id": "lib05",
  "name": "بعد المعالجة اللبية (سحب العصب)",
  "treatment_key": "root-canal",
  "body": "• لا تأكل قبل زوال التخدير تماماً.\n• من الطبيعي أن تشعر بألم خفيف أو حساسية عند العضّ على السن لبضعة أيام — يخفّ تدريجياً، وتناول المسكّن كما وُصف.\n• تجنّب المضغ القاسي على السن المعالَج حتى توضع الحشوة النهائية أو التاج.\n• الحشوة المؤقتة قد تتآكل قليلاً وهذا طبيعي؛ أمّا إذا سقطت كلها أو جزء كبير منها فاتصل بنا.\n• نظّف السن بالفرشاة والخيط كالمعتاد.\n\nمهم: السن المعالَج لبّياً يصبح أكثر هشاشة مع الوقت. الالتزام بموعد الحشوة النهائية أو التاج يحميه من الكسر — لا تؤجّله.\n\nاتصل بالعيادة إذا:\n• ظهر تورّم في اللثة أو الوجه.\n• اشتدّ الألم بدل أن يخفّ، أو لم يستجب للمسكّن.\n• شعرت أن السن «أعلى» من بقية الأسنان عند الإطباق."
 },
 {
  "id": "lib06",
  "name": "بعد الحشوة",
  "treatment_key": "custom_1781292854422",
  "body": "• لا تأكل قبل زوال التخدير تماماً كي لا تعضّ شفتك أو خدّك أو لسانك.\n• الحشوة التجميلية (البيضاء) تتصلّب فوراً ويمكنك المضغ عليها بعد زوال التخدير.\n• الحشوة المعدنية (الأملغم) تحتاج 24 ساعة لتبلغ قساوتها الكاملة — تجنّب المضغ القاسي عليها في اليوم الأول.\n• حساسية خفيفة للبارد أو الساخن أو عند العضّ طبيعية وقد تستمر من أيام إلى أسابيع قليلة ثم تزول.\n• نظّف أسنانك بالفرشاة والخيط كالمعتاد.\n\nاتصل بالعيادة إذا:\n• شعرت أن الحشوة «عالية» أو أن إطباقك غير مريح — التعديل بسيط وسريع، ولا تنتظر أن «تتعوّد» عليها.\n• استمرّت الحساسية أكثر من أسابيع أو صارت ألماً تلقائياً أو ليلياً.\n• انكسرت الحشوة أو شعرت بحافة حادّة."
 },
 {
  "id": "lib07",
  "name": "بعد تحضير التاج / الجسر (التاج المؤقت)",
  "treatment_key": "custom_1784742823602",
  "body": "وُضع لك تاج مؤقت يحمي السن حتى يجهز التاج النهائي.\n\n• تجنّب الأطعمة اللاصقة (علكة، كراميل، راحة) والقاسية (مكسرات، قضامة)، وامضغ على الجهة الأخرى قدر الإمكان.\n• نظّف بالفرشاة بلطف. عند استخدام الخيط اسحبه من الجانب ولا ترفعه للأعلى كي لا يُخرج التاج المؤقت.\n• حساسية خفيفة للبارد والساخن وانزعاج بسيط في اللثة طبيعيان لعدة أيام.\n\nإذا سقط التاج المؤقت: احتفظ به واتصل بنا لإعادة تثبيته في أقرب وقت. لا تترك السن مكشوفاً أياماً — فقد تتحرّك الأسنان المجاورة ولا يعود التاج النهائي مناسباً.\n\nالتزم بموعد التركيب النهائي.\n\nاتصل بالعيادة إذا: سقط التاج المؤقت أو انكسر، أو شعرت بألم شديد أو نابض، أو كان الإطباق عالياً."
 },
 {
  "id": "lib08",
  "name": "بعد تركيب التاج / الجسر النهائي",
  "treatment_key": "crown",
  "body": "• تجنّب الأطعمة القاسية واللاصقة خلال أول 24 ساعة حتى يكتمل تصلّب الإسمنت.\n• قد تشعر بحساسية خفيفة أو انزعاج في اللثة لأيام قليلة، وقد تحتاج أياماً لتتعوّد على الشكل الجديد.\n• التاج لا يتسوّس، لكن السن تحته والحافّة عند اللثة يمكن أن يتسوّسا — نظّف بالفرشاة مرتين يومياً ومرّر الخيط يومياً.\n• للجسر: نظّف تحت السن المعلَّق يومياً بخيط الجسور أو الفرشاة بين السنّية أو جهاز الماء — هذا أهم ما يطيل عمر الجسر.\n• تجنّب فتح الأشياء أو كسر المكسرات القاسية والثلج بأسنانك.\n• إذا كنت تصرّ على أسنانك ليلاً فاسأل عن الواقي الليلي.\n\nراجعنا دورياً كل 6 أشهر للفحص والتنظيف.\n\nاتصل بالعيادة إذا: شعرت أن الإطباق عالٍ أو غير مريح، أو تحرّك التاج أو الجسر أو سقط، أو استمرّ الألم، أو صارت اللثة حوله تنزف باستمرار."
 },
 {
  "id": "lib09",
  "name": "بعد التقليح وتنظيف اللثة",
  "treatment_key": "perio-scaling",
  "body": "• حساسية للبارد ونزف خفيف من اللثة عند التفريش طبيعيان لمدة يوم إلى ثلاثة أيام.\n• قد تشعر بفراغات بين الأسنان كانت مملوءة بالقلح — اللثة تتحسّن وتشدّ خلال أسبوع إلى أسبوعين.\n• استمرّ بالتفريش بفرشاة ناعمة مرتين يومياً حتى لو نزفت اللثة قليلاً — التوقف عن التفريش يعيد الالتهاب.\n• استخدم الخيط أو الفرشاة بين السنّية يومياً.\n• مضمضة بماء فاتر وملح تريح اللثة في اليومين الأولين. وإذا وُصف لك غسول مطهّر فاستخدمه للمدة المحدّدة فقط ولا تتجاوزها (الاستخدام الطويل يصبغ الأسنان).\n• تجنّب التدخين، والمشروبات والأطعمة شديدة التلوين (قهوة، شاي، متّة، صلصات حمراء) في يوم التنظيف.\n• معجون الأسنان الخاص بالحساسية يساعد إن أزعجتك الحساسية.\n\nالقلح يعود إن لم تتغيّر العناية اليومية — موعد التنظيف الدوري كل 6 أشهر (أو كما يحدّد الطبيب).\n\nاتصل بالعيادة إذا: استمرّ النزف أو الألم أكثر من أسبوع، أو ظهر تورّم أو صديد في اللثة."
 },
 {
  "id": "lib10",
  "name": "بعد تبييض الأسنان",
  "treatment_key": "whitening",
  "body": "أول 48 ساعة هي الأهم: الأسنان تكون أكثر قابلية لامتصاص الألوان.\n\nتجنّب خلال 48 ساعة:\n• القهوة والشاي والمتّة والمشروبات الغازية الداكنة والعصائر الملوّنة.\n• الصلصات الحمراء، الكاري والكركم، الشمندر، التوت، الشوكولا الداكنة.\n• التدخين والأركيلة.\n• القاعدة البسيطة: ما يصبغ قميصاً أبيض يصبغ أسنانك.\n\nمسموح: الماء، الحليب، اللبن، الأرز، الدجاج، السمك، البطاطا، الموز، الجبنة البيضاء.\n\nالحساسية:\n• حساسية للبارد والساخن أو وخزات قصيرة في الأسنان طبيعية خلال 24–48 ساعة ثم تزول.\n• استخدم معجون أسنان للحساسية، وتجنّب شديد البرودة والسخونة.\n• تناول المسكّن إن وُصف لك عند الحاجة.\n\nاللون يستقرّ بعد أيام قليلة. لإطالة النتيجة: تفريش جيد، وتقليل المشروبات الملوِّنة أو شربها بالمصّاصة، وتنظيف دوري.\n\nاتصل بالعيادة إذا: استمرّت الحساسية الشديدة أكثر من 3 أيام، أو ظهرت بقع بيضاء أو تقرّح مؤلم في اللثة لا يتحسّن خلال يومين."
 },
 {
  "id": "lib11",
  "name": "العناية بالتقويم الثابت",
  "treatment_key": "ortho-fixed",
  "body": "بعد التركيب أو الشدّ:\n• ألم وضغط في الأسنان لمدة 3–5 أيام طبيعي. تناول طعاماً طرياً والمسكّن عند الحاجة.\n• إذا جرحت الحاصرات خدّك أو شفتك: جفّف الحاصرة وضع عليها قطعة من شمع التقويم.\n\nالطعام:\n• ممنوع: المكسرات القاسية، البزر، القضامة، الثلج، العلكة، الكراميل والراحة، وقضم الأشياء القاسية بالأسنان الأمامية.\n• قطّع التفاح والجزر والخبز القاسي قطعاً صغيرة وامضغها بالأسنان الخلفية.\n• قلّل السكريات والمشروبات الغازية — فهي تترك بقعاً بيضاء دائمة حول الحاصرات.\n\nالتنظيف (أهم ما في العلاج):\n• فرّش بعد كل وجبة، فوق الحاصرات وتحتها، بفرشاة ناعمة أو فرشاة التقويم.\n• استخدم الفرشاة بين السنّية تحت السلك يومياً.\n• غسول الفلورايد مرة يومياً قبل النوم.\n\nالتزم بمواعيد المراجعة، وارتدِ المطاط كما طُلب منك تماماً — إهماله يطيل مدة العلاج.\n\nاتصل بالعيادة إذا: انفكّت حاصرة أو حلقة، أو خرج السلك من مكانه أو صار يجرح (غطِّ طرفه بالشمع حتى موعدك)، أو فقدت المطاط."
 },
 {
  "id": "lib12",
  "name": "التقويم المتحرك / مثبّت التقويم",
  "treatment_key": "ortho-removable",
  "body": "• ارتدِ الجهاز عدد الساعات الذي حدّده الطبيب بالضبط — الجهاز الذي لا يُلبَس لا يعمل، والأسنان تعود للتحرّك بسرعة.\n• انزعه عند الأكل وعند شرب الساخن والمشروبات الملوّنة أو المحلّاة. الماء مسموح وهو في الفم.\n• الكلام قد يتأثر في الأيام الأولى ثم يعود لطبيعته — اقرأ بصوت عالٍ لتتعوّد أسرع.\n\nالتنظيف والحفظ:\n• نظّفه يومياً بفرشاة ناعمة وماء بارد أو فاتر وصابون سائل. لا ماء ساخن إطلاقاً (يشوّهه) ولا معجون أسنان خشن (يخدشه).\n• عندما لا يكون في فمك فمكانه علبته فقط. لا تلفّه بمنديل (يُرمى بالخطأ) ولا تضعه في الجيب، وأبعده عن الحيوانات الأليفة.\n• نظّف أسنانك قبل إعادة لبسه.\n\nالمثبّت: الالتزام به هو ما يحفظ نتيجة التقويم. الأسنان تميل للعودة لمكانها القديم طوال العمر.\n\nاتصل بالعيادة إذا: انكسر الجهاز أو تشقّق، أو لم يعد ينطبق بعد انقطاع عن لبسه (لا تضغطه بالقوة)، أو سبّب جرحاً لا يتحسّن، أو انفكّ المثبّت السلكي الثابت خلف الأسنان."
 },
 {
  "id": "lib13",
  "name": "العناية بالجهاز المتحرك (البدلة الكاملة أو الجزئية)",
  "treatment_key": null,
  "body": "الأيام الأولى:\n• شعور بالامتلاء وزيادة اللعاب وتغيّر بسيط في الكلام أمور طبيعية تزول خلال أسبوع إلى أسبوعين. اقرأ بصوت عالٍ لتتعوّد أسرع.\n• ابدأ بطعام طريّ مقطّع قطعاً صغيرة، وامضغ على الجهتين معاً ليبقى الجهاز ثابتاً. تجنّب القضم بالأسنان الأمامية.\n• نقاط ضغط مؤلمة قد تظهر في الأيام الأولى — هذا متوقّع ويُحلّ بتعديل بسيط في العيادة. لا تبرد الجهاز أو تعدّله بنفسك.\n\nالعناية اليومية:\n• انزع الجهاز عند النوم لترتاح اللثة، واحفظه في كوب ماء كي لا يجفّ ويتشوّه.\n• نظّفه بعد الوجبات بفرشاة ناعمة وصابون سائل فوق حوض فيه ماء أو منشفة (كي لا ينكسر إن سقط). لا معجون أسنان خشن ولا ماء ساخن ولا مبيّضات.\n• نظّف لثتك ولسانك وسقف فمك بفرشاة ناعمة يومياً، ونظّف أسنانك المتبقية جيداً وخاصة التي تحمل المشابك.\n\nراجعنا سنوياً: اللثة والعظم يتغيّران مع الوقت وقد يحتاج الجهاز إلى تبطين.\n\nاتصل بالعيادة إذا: ظهر جرح أو تقرّح لا يتحسّن خلال أيام، أو صار الجهاز رخواً أو انكسر أو انكسر أحد مشابكه (لا تلصقه بنفسك)."
 },
 {
  "id": "lib14",
  "name": "بعد علاج أسنان الأطفال",
  "treatment_key": "pedo-pulpotomy",
  "body": "إلى الأهل الكرام:\n\nالتخدير (أهم نقطة):\n• يستمرّ خدر الشفة والخد واللسان ساعتين إلى ثلاث. راقبوا الطفل جيداً كي لا يعضّ أو يمصّ أو يخدش شفته أو خدّه — هذه أكثر مشكلة نراها بعد علاج الأطفال، وتظهر كتورّم وجرح أبيض في اليوم التالي.\n• لا طعام يحتاج مضغاً قبل زوال الخدر. السوائل واللبن والمهلبية مسموحة.\n\nبعد زوال الخدر:\n• طعام طريّ في اليوم الأول.\n• انزعاج خفيف أو احمرار في اللثة حول السن المعالَج طبيعي ليوم أو يومين. يُعطى المسكّن المناسب لعمر الطفل ووزنه كما وصفه الطبيب فقط.\n• التفريش مستمرّ كالمعتاد بفرشاة ناعمة، بلطف حول السن المعالَج.\n\nإذا رُكّب تاج معدني (ستانلس ستيل):\n• لونه الفضّي طبيعي، وسيسقط مع السن اللبني في وقته الطبيعي.\n• تجنّبوا السكاكر اللاصقة والعلكة — فقد تنزع التاج.\n• قد يشعر الطفل أن إطباقه مختلف ليومين أو ثلاثة ثم يتعوّد.\n\nاتصلوا بالعيادة إذا: ظهر تورّم في اللثة أو الوجه، أو حرارة، أو ألم يوقظ الطفل ليلاً ولا يهدأ بالمسكّن، أو سقط التاج أو الحشوة."
 },
 {
  "id": "lib15",
  "name": "بعد تطبيق الفلورايد / سادّ الشقوق",
  "treatment_key": "fluoride",
  "body": "بعد الفلورايد:\n• لا طعام ولا شراب لمدة 30 دقيقة.\n• لبقية اليوم: تجنّب الطعام القاسي والمقرمش والمشروبات الساخنة، ولا تفرّش الأسنان حتى المساء (أو صباح اليوم التالي إن كان التطبيق مسائياً) ليبقى الفلورايد أطول مدة ممكنة.\n• قد تبدو الأسنان مصفرّة أو عليها طبقة خفيفة مؤقتاً — تزول مع أول تفريش.\n\nبعد سادّ الشقوق:\n• يمكن الأكل مباشرةً.\n• قد يشعر الطفل أن إطباقه مختلف قليلاً ليوم أو يومين ثم يعود طبيعياً.\n• تجنّب مضغ الثلج والسكاكر القاسية جداً — فقد تكسر المادة السادّة.\n\nكلاهما وقاية وليس بديلاً عن التفريش مرتين يومياً بمعجون يحتوي الفلورايد وتقليل السكريات بين الوجبات.\n\nنفحص المادة السادّة في كل زيارة دورية ونجدّدها عند الحاجة."
 },
 {
  "id": "lib16",
  "name": "قبل الجراحة الفموية / الزراعة",
  "treatment_key": "implant",
  "body": "تحضيرك الجيد قبل الموعد يجعل الإجراء أسهل والتعافي أسرع.\n\nقبل الموعد بأيام:\n• أخبر الطبيب مسبقاً بكل أمراضك وأدويتك، وخاصة: مميّعات الدم، أدوية السكري والضغط والقلب، أدوية هشاشة العظام، وأي حساسية دوائية، والحمل إن وُجد.\n• لا توقف أي دواء من تلقاء نفسك — حتى المميّعات. الطبيب هو من يقرّر بالتنسيق مع طبيبك المعالج.\n• إذا وُصف لك مضاد حيوي أو غسول قبل الموعد فالتزم بالتوقيت تماماً.\n• جهّز في البيت: طعاماً طرياً، كمّادات باردة، والأدوية الموصوفة.\n\nقبل الموعد بيوم:\n• امتنع عن التدخين والأركيلة 24 ساعة على الأقل قبل الموعد (وكلما طالت المدة كان الالتئام أفضل).\n• نَم جيداً.\n\nيوم الموعد:\n• تناول وجبة خفيفة قبل الموعد بساعة إلى ساعتين — الإجراء تحت التخدير الموضعي لا يحتاج صياماً (إلا إذا أبلغك الطبيب بغير ذلك).\n• خذ أدويتك المعتادة في مواعيدها ما لم يُطلب منك خلاف ذلك.\n• نظّف أسنانك جيداً بالفرشاة والخيط.\n• البس ثياباً مريحة، وتجنّب أحمر الشفاه والمكياج الثقيل حول الفم.\n• أحضر صور الأشعة والتحاليل إن طُلبت منك.\n• يُفضَّل أن يرافقك أحد إن كنت قلقاً أو كان الإجراء طويلاً، ولا تخطّط لعمل مجهد بعد الموعد.\n\nاتصل بالعيادة قبل الموعد إذا: أصبت بزكام شديد أو حرارة أو التهاب، أو ظهرت بثور (هربس) حول الفم، أو تغيّر شيء في أدويتك أو حالتك الصحية."
 },
 {
  "id": "lib17",
  "name": "العناية بالواقي الليلي",
  "treatment_key": null,
  "body": "الواقي الليلي يحمي أسنانك وحشواتك وتيجانك من الصرير والشدّ أثناء النوم ويريح عضلات الفك.\n\nالاستخدام:\n• البسه كل ليلة. الانقطاع عنه يعيد الأعراض.\n• شعور بالضيق أو زيادة اللعاب في الليالي الأولى طبيعي ويزول خلال أسبوع إلى أسبوعين.\n• أدخله وأخرجه بأصابعك من الجهتين معاً، لا بالعضّ عليه.\n\nالتنظيف والحفظ:\n• اشطفه بماء بارد فور نزعه صباحاً، ونظّفه بفرشاة ناعمة وصابون سائل. لا معجون أسنان (يخدشه) ولا ماء ساخن (يشوّهه).\n• جفّفه واحفظه في علبته المهوّاة، بعيداً عن الحرارة والشمس والحيوانات الأليفة.\n• نظّف أسنانك قبل لبسه.\n• أحضره معك في كل زيارة دورية لنفحصه ونعدّله.\n\nاتصل بالعيادة إذا: تشقّق أو انثقب، أو لم يعد ينطبق جيداً (خاصة بعد حشوة أو تاج جديد)، أو شعرت صباحاً أن إطباقك تغيّر ولم يعد لطبيعته خلال ساعة، أو زاد ألم الفك بدل أن يتحسّن."
 },
 {
  "id": "lib18",
  "name": "بعد القشور التجميلية (الفينير)",
  "treatment_key": null,
  "body": "في فترة القشور المؤقتة (إن وُجدت):\n• هي أضعف من النهائية وملصوقة بشكل مؤقت: تجنّب القضم بالأسنان الأمامية والأطعمة القاسية واللاصقة.\n• نظّف بفرشاة ناعمة بلطف، ولا تمرّر الخيط بينها إن كانت متّصلة ببعضها.\n• إذا انفكّت إحداها فاحتفظ بها واتصل بنا.\n\nبعد تثبيت القشور النهائية:\n• تجنّب الأطعمة القاسية واللاصقة خلال أول 24 ساعة.\n• حساسية خفيفة للبارد والساخن وانزعاج بسيط في اللثة طبيعيان لأيام قليلة.\n• قد يحتاج لسانك ونطقك أياماً ليتعوّدا على الشكل الجديد.\n\nللمحافظة عليها سنوات طويلة:\n• لا تستخدم أسنانك الأمامية أداةً: لا قضم أظافر ولا أقلام، ولا فتح أغطية، ولا كسر مكسرات أو بزر أو ثلج أو عظم.\n• اقطع الأطعمة القاسية (تفاح، جزر، خبز قاسٍ) بالسكين وامضغها بالأسنان الخلفية.\n• فرشاة ناعمة ومعجون غير خشن مرتين يومياً، وخيط يومياً — الخزف لا يتسوّس لكن حافّة السن عند اللثة تتسوّس.\n• الخزف نفسه لا يتصبّغ، لكن حوافّه قد تتلوّن مع التدخين والقهوة والشاي والمتّة الكثيرة.\n• إذا كنت تصرّ على أسنانك ليلاً فالواقي الليلي ضروري لحمايتها.\n• تنظيف وفحص دوري كل 6 أشهر.\n\nاتصل بالعيادة إذا: انكسرت قشرة أو تشظّت أو انفكّت (احتفظ بها)، أو شعرت بحافّة خشنة أو أن الإطباق عالٍ، أو استمرّت الحساسية أكثر من أسبوعين."
 },
 {
  "id": "lib19",
  "name": "بعد جراحة اللثة",
  "treatment_key": null,
  "body": "ما يلي طبيعي: نزف خفيف أو لعاب ورديّ في اليوم الأول، وتورّم بسيط يبلغ ذروته في اليوم الثاني أو الثالث.\n\nاليوم الأول:\n• إذا حدث نزف فاضغط على المكان بشاش مبلّل نظيف 20–30 دقيقة دون أن ترفعه لتنظر.\n• كمّادات باردة على الخد من الخارج: 15 دقيقة ثم راحة 15 دقيقة.\n• لا تأكل قبل زوال التخدير تماماً.\n• نَم ورأسك مرفوع.\n\nأول 3 أيام:\n• لا مضمضة ولا بصق بقوة ولا شرب بالمصّاصة.\n• طعام وشراب طريّ، بارد أو فاتر، وامضغ على الجهة الأخرى. تجنّب الحارّ والحامض والمقرمش والحبوب الصغيرة.\n\nطوال فترة الالتئام:\n• لا تشدّ شفتك أو خدّك لترى مكان الجراحة — الشدّ يفتح الغرز.\n• لا تفرّش منطقة الجراحة ولا تمرّر فيها الخيط حتى يأذن الطبيب. نظّف بقية أسنانك كالمعتاد.\n• استخدم الغسول المطهّر إن وُصف لك، في موعده وبالطريقة التي شرحها الطبيب، وللمدة المحدّدة فقط.\n• إن وُضع ضماد لثوي (معجون واقٍ) فوق المكان: قد تسقط منه قطع صغيرة أو يسقط كله بعد أيام — هذا طبيعي ما لم يترافق مع ألم أو نزف.\n• امتنع عن التدخين والأركيلة أسبوعين على الأقل.\n• تجنّب الجهد البدني الشديد 3 أيام.\n\nالغرز: تُفكّ بعد 7–14 يوماً.\n\nتناول المسكّن والأدوية كما وصفها الطبيب، وأكمل المضاد الحيوي حتى آخره إذا وُصف.\n\nاتصل بالعيادة إذا: استمرّ نزف لا يتوقف بالضغط، أو زاد الألم أو التورّم بعد اليوم الثالث، أو ظهرت حرارة أو صديد، أو انفكّت الغرز مبكراً وانكشف المكان."
 },
 {
  "id": "lib20",
  "name": "طوارئ: سقوط سن دائم بالكامل (إسعاف أولي)",
  "treatment_key": null,
  "body": "خروج سن دائم كاملاً من مكانه إثر ضربة حالة طارئة حقيقية، والدقائق الأولى تحدّد مصير السن. الأفضل إعادته خلال 15 دقيقة، وتقلّ فرص نجاحه كثيراً بعد ساعة.\n\nأولاً: تأكّد أنه سن دائم. السن اللبني (عند الأطفال الصغار) لا يُعاد إلى مكانه أبداً — راجع العيادة فقط.\n\nماذا تفعل فوراً:\n• ابقَ هادئاً وهدّئ المصاب. ابحث عن السن.\n• أمسكه من التاج (الجزء الأبيض الذي يظهر في الفم). لا تلمس الجذر إطلاقاً.\n• إذا كان متّسخاً: اشطفه بلطف لثوانٍ بالحليب أو بالمحلول الملحي (السيروم) أو بلعاب المصاب. لا تفركه ولا تنظّفه بصابون أو معقّم ولا تجفّفه.\n• الأفضل: أعِد السن إلى مكانه فوراً بالاتجاه الصحيح واضغطه بلطف، ثم يعضّ المصاب على منديل نظيف أو شاش ليثبّته.\n\nإذا لم تستطع إعادته:\n• ضعه فوراً في كوب حليب بارد، أو في محلول ملحي، أو في لعاب المصاب (يبصق في كوب ويوضع السن فيه).\n• لا تضعه في الماء، ولا تلفّه بمنديل، ولا تتركه يجفّ.\n• لا تضعه في فم طفل صغير كي لا يبتلعه.\n\nثم: توجّه إلى العيادة أو أقرب طبيب أسنان فوراً ومعك السن — لا تنتظر الموعد.\n\nتوجّه إلى الإسعاف أولاً إذا رافق الإصابة: فقدان وعي، إقياء، صداع شديد أو تشوّش، أو نزف غزير، أو اشتباه بكسر في الفك.\n\nإذا انكسر جزء من السن فقط: احتفظ بالقطعة في حليب أو لعاب وأحضرها معك — فقد يمكن إعادة لصقها."
 }
];
function postOpLibraryGet(id) {
  for (var i = 0; i < POST_OP_LIBRARY.length; i++) if (POST_OP_LIBRARY[i].id === id) return POST_OP_LIBRARY[i];
  return null;
}

function postOpPopulateTemplatePicker() {
  var sel = document.getElementById('postOpTemplatePick');
  if (!sel) return;
  var opts = '<option value="">' + (POST_OP_TEMPLATES.length ? '— بلا قالب —' : '— لا قوالب خاصة بعد —') + '</option>';
  POST_OP_TEMPLATES.forEach(function(t){
    opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
  });
  sel.innerHTML = opts;
  /* v419: المكتبة الجاهزة بمنتقٍ مستقلّ ظاهر فوق «قوالبي الخاصة». */
  var lib = document.getElementById('postOpLibraryPick');
  if (lib) {
    var lo = '<option value="">— اختر تعليمات جاهزة —</option>';
    POST_OP_LIBRARY.forEach(function(t){ lo += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>'; });
    lib.innerHTML = lo; lib.value = '';
    var cnt = document.getElementById('postOpLibraryCount');
    if (cnt) cnt.textContent = '(' + POST_OP_LIBRARY.length + ' قالباً)';
  }
  sel.value = '';
}

/* v419: منتقي المكتبة المستقلّ — نفس مسار التعبئة؛ المنتقيان متنافيان بصرياً (اختيارُ أحدهما يصفّر الآخر). */
function postOpApplyLibrary(lid) {
  if (!lid || !postOpLibraryGet(lid)) return;
  var mine = document.getElementById('postOpTemplatePick'); if (mine) mine.value = '';
  postOpApplyTemplate(lid);
}
function postOpApplyTemplate(tid) {
  if (!tid) return;
  var tpl = null;
  for (var i=0;i<POST_OP_TEMPLATES.length;i++) if (POST_OP_TEMPLATES[i].id === tid) { tpl = POST_OP_TEMPLATES[i]; break; }
  var _fromLib = false;
  if (!tpl) { tpl = postOpLibraryGet(tid); _fromLib = !!tpl; }   /* v418: مكتبة SyDent الجاهزة */
  if (!tpl) return;
  if (!_fromLib) { var _lp = document.getElementById('postOpLibraryPick'); if (_lp) _lp.value = ''; }
  document.getElementById('postOpBody').value = tpl.body || '';
  if (typeof ppMsgCountSync === 'function') ppMsgCountSync('postOpBody', 'postOpMsgCount');   /* v444 */
  var sel = document.getElementById('postOpTreatment');
  /* M130.1: إسنادٌ أعمى لمفتاحٍ حُذف من الكتالوج يتركُ القائمة على قيمةٍ أخرى
     بصمت، فتُحفظ التعليماتُ تحت علاجٍ غير الذي قُصد. يُتحقّق من وجود الخيار
     أولاً — نفسُ حارس قوالب المخبر — ويُعلَن الغياب بدل ابتلاعه. */
  if (sel && tpl.treatment_key) {
    var _hasKey = false;
    for (var _oi = 0; _oi < sel.options.length; _oi++) {
      if (sel.options[_oi].value === tpl.treatment_key) { _hasKey = true; break; }
    }
    if (_hasKey) sel.value = tpl.treatment_key;
    else if (!_fromLib) showToast('⚠️ نوع العلاج بالقالب لم يعد بقائمة العلاجات — اختره يدوياً');   /* قالب المكتبة: عيادةٌ بلا هذا العلاج أمرٌ عادي لا تحذير له */
  }
}

async function openPostOpTemplatesModal() {
  if (!POST_OP_TEMPLATES.length) { try { await loadPostOpTemplates(); } catch(e){} }
  renderPostOpTemplatesList();
  openModal('postOpTemplatesModal');
}

function renderPostOpTemplatesList() {
  var el = document.getElementById('postOpTemplatesList');
  if (!el) return;
  if (!POST_OP_TEMPLATES.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);">'
      + '<div style="font-size:30px;">📋</div>'
      + '<div style="margin-top:8px;font-size:13px;">لا قوالب خاصة بعد. مكتبة SyDent الجاهزة (' + POST_OP_LIBRARY.length + ' قالباً) متاحة بأعلى نافذة «تعليمات جديدة» — ولتخصيص أحدها: اختره، عدّل النص، وفعّل «حفظ هذه التعليمات كقالب».</div></div>';
    return;
  }
  el.innerHTML = POST_OP_TEMPLATES.map(function(t){
    var tl = postOpTreatmentLabel(t.treatment_key);
    var preview = (t.body || '').replace(/\s+/g,' ').trim();
    if (preview.length > 80) preview = preview.slice(0,80) + '…';
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;color:var(--text);">' + escapeHtml(t.name)
          + (tl ? ' <span style="font-size:11px;font-weight:600;color:var(--text2);background:var(--bg3);padding:2px 8px;border-radius:8px;">🦷 ' + escapeHtml(tl) + '</span>' : '') + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + (preview ? escapeHtml(preview) : '<span style="opacity:.6;">— بلا نص —</span>') + '</div>'
      + '</div>'
      + '<div class="sy-acts">'
        + '<button class="sy-act" onclick="openPostOpTemplateEdit(\'' + t.id + '\')">✏️ تعديل</button>'
        + '<button class="sy-act sy-act-danger" onclick="deletePostOpTemplate(\'' + t.id + '\')">🗑️ حذف</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

function openPostOpTemplateEdit(id) {
  _postOpEditingTemplateId = id || null;
  var tpl = null;
  if (id) { for (var i=0;i<POST_OP_TEMPLATES.length;i++) if (POST_OP_TEMPLATES[i].id === id) { tpl = POST_OP_TEMPLATES[i]; break; } }
  document.getElementById('postOpTplTitle').textContent = tpl ? '✏️ تعديل قالب' : '📋 قالب تعليمات جديد';
  document.getElementById('postOpTplName').value = tpl ? (tpl.name || '') : '';
  document.getElementById('postOpTplBody').value = tpl ? (tpl.body || '') : '';
  if (typeof ppMsgCountSync === 'function') ppMsgCountSync('postOpTplBody', 'postOpTplMsgCount');   /* v445 */
  postOpPopulateTreatmentSelect('postOpTplTreatment', tpl ? tpl.treatment_key : '');
  var btn = document.getElementById('postOpTplSaveBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'حفظ القالب'; }
  /* نفس التصفير بمودال القالب — التلميح خاص بكل توليد لا بالقالب. */
  var tplH = document.getElementById('postOpTplAiHint'); if (tplH) tplH.value = '';
  var tplP = document.getElementById('postOpTplAiPhase'); if (tplP) tplP.value = 'post';
  openModal('postOpTemplateEditModal');
}

async function savePostOpTemplate() {
  if (_savePostOpTplInFlight) return;
  var name = (document.getElementById('postOpTplName').value || '').trim();
  var body = (document.getElementById('postOpTplBody').value || '').trim();
  if (!name) { showToast('⚠️ اكتب اسم القالب'); return; }
  if (!body) { showToast('⚠️ اكتب نص التعليمات'); return; }
  var tkey = document.getElementById('postOpTplTreatment').value || null;

  _savePostOpTplInFlight = true;
  var btn = document.getElementById('postOpTplSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
  try {
    if (_postOpEditingTemplateId) {
      var upd = await window.sb.from('post_op_templates')
        .update({ name: name, body: body, treatment_key: tkey })
        .eq('id', _postOpEditingTemplateId).eq('owner_id', currentUser.id);
      if (upd.error) throw upd.error;
    } else {
      var ins = await window.sb.from('post_op_templates')
        .insert({ owner_id: currentUser.id, name: name, body: body, treatment_key: tkey });
      if (ins.error) throw ins.error;
    }
    _postOpEditingTemplateId = null;
    closeModal('postOpTemplateEditModal');
    await loadPostOpTemplates();
    renderPostOpTemplatesList();      // حدّث قائمة المودال إن كان مفتوحاً
    postOpPopulateTemplatePicker();   // حدّث الـ dropdown بمودال الإصدار
    showToast('تم حفظ القالب ✓');
  } catch (e) {
    console.error('savePostOpTemplate:', e);
    showToast('⚠️ تعذّر حفظ القالب');
  } finally {
    _savePostOpTplInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'حفظ القالب'; }
  }
}

var deletePostOpTemplate = ppGuarded('deletePostOpTemplate', _deletePostOpTemplate_inner, 'جارٍ الحذف…');   /* v285: قفل + انشغال */
async function _deletePostOpTemplate_inner(id) {
  var tpl = null;
  for (var i=0;i<POST_OP_TEMPLATES.length;i++) if (POST_OP_TEMPLATES[i].id === id) { tpl = POST_OP_TEMPLATES[i]; break; }
  var nm = tpl ? tpl.name : 'هذا القالب';
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + nm + '» نهائياً؟', danger: true })) return;
  try {
    var del = await window.sb.from('post_op_templates').delete().eq('id', id).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    await loadPostOpTemplates();
    renderPostOpTemplatesList();
    postOpPopulateTemplatePicker();
    showToast('تم حذف القالب');
  } catch (e) { console.error('deletePostOpTemplate:', e); showToast('⚠️ تعذّر حذف القالب'); }
}

/* ---------- مشترك ---------- */
function postOpTreatmentLabel(key) {
  if (!key) return '';
  var t = (typeof getTreatment === 'function') ? getTreatment(key) : null;
  if (t) return t.name || t.label || '';
  for (var i=0;i<(TREATMENTS||[]).length;i++) if (TREATMENTS[i].id === key) return TREATMENTS[i].name || TREATMENTS[i].label || '';
  return '';
}

function postOpPopulateTreatmentSelect(selectId, selected) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var opts = '<option value="">— عام (بلا ربط) —</option>';
  var seen = {};
  (TREATMENTS || []).forEach(function(t){
    if (!t || !t.id || seen[t.id]) return;
    seen[t.id] = 1;
    opts += '<option value="' + escapeHtml(String(t.id)) + '">' + escapeHtml(t.name || t.label || String(t.id)) + '</option>';
  });
  sel.innerHTML = opts;
  sel.value = selected || '';
}

function postOpNoteGet(id) {
  for (var i=0;i<POST_OP_NOTES.length;i++) if (POST_OP_NOTES[i].id === id) return POST_OP_NOTES[i];
  return null;
}

/* ---------- طباعة/نسخ (للمريض الحالي) ---------- */
function buildPostOpHtml(note) {
  var c = (typeof rxClinicInfo === 'function') ? rxClinicInfo() : { clinic_name:'العيادة', clinic_phone:'', license_no:'' };
  var dateStr = SyDT.numDate(note.created_at ? new Date(note.created_at) : new Date());   // v487: المطبوعُ أرقاماً (قرار المالك)
  var pName = (patient && patient.name) ? patient.name : '';
  var pAge = (patient && patient.dob) ? calcAge(patient.dob) : '';
  var pGender = (patient && patient.gender) ? patient.gender : '';
  var tl = postOpTreatmentLabel(note.treatment_key);
  var bodyHtml = escapeHtml(note.body || '').replace(/\n/g, '<br>');

  var h = '<div style="direction:rtl;font-family:Cairo,Tahoma,sans-serif;color:#111;max-width:780px;margin:0 auto;padding:24px;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--green);padding-bottom:14px;margin-bottom:6px;">';
  h += '<div>';
  h += '<div style="font-size:24px;font-weight:800;color:#111;">' + escapeHtml(c.clinic_name) + '</div>';
  if (c.license_no) h += '<div style="font-size:12px;color:#666;margin-top:2px;">رقم النقابة: ' + escapeHtml(c.license_no) + '</div>';
  h += '</div>';
  h += '<div style="text-align:left;font-size:13px;color:#444;">';
  if (c.clinic_phone) h += '<div>📞 ' + escapeHtml(c.clinic_phone) + '</div>';
  h += '<div style="margin-top:4px;">' + escapeHtml(dateStr) + '</div>';
  h += '</div>';
  h += '</div>';
  h += '<div style="font-size:20px;font-weight:800;color:#06371f;margin:12px 0 4px;">📋 تعليمات بعد الجلسة' + (tl ? (' — ' + escapeHtml(tl)) : '') + '</div>';
  h += '<div style="background:#f6f6f6;border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:14px;color:#222;">';
  h += '<strong>المريض:</strong> ' + escapeHtml(pName);
  if (pGender) h += ' &nbsp;•&nbsp; ' + escapeHtml(pGender);
  if (pAge !== '') h += ' &nbsp;•&nbsp; ' + escapeHtml(String(pAge));
  h += '</div>';
  h += '<div style="font-size:15px;line-height:2;color:#222;">' + bodyHtml + '</div>';
  h += '<div style="margin-top:46px;display:flex;justify-content:space-between;font-size:13px;color:#444;">';
  h += '<div>التوقيع: ____________________</div>';
  h += '<div>' + escapeHtml(c.clinic_name) + '</div>';
  h += '</div>';
  h += '</div>';
  return h;
}

function printPostOp(id) {
  var note = postOpNoteGet(id);
  if (!note) return;
  var root = document.getElementById('printRoot');
  if (!root) return;
  root.innerHTML = buildPostOpHtml(note);
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture — iOS Safari blocks print() fired from setTimeout (transient user-activation is lost → 'blocked from automatically printing'). Content is inline SVG/CSS only; layout flushes before the print snapshot.
  setTimeout(cleanup, 60000);
}

async function copyPostOp(id) {
  var note = postOpNoteGet(id);
  if (!note) return;
  var c = (typeof rxClinicInfo === 'function') ? rxClinicInfo() : { clinic_name:'العيادة' };
  var pName = (patient && patient.name) ? patient.name : '';
  var tl = postOpTreatmentLabel(note.treatment_key);
  var lines = [];
  lines.push('📋 تعليمات بعد الجلسة — ' + c.clinic_name + (tl ? (' (' + tl + ')') : ''));
  if (pName) lines.push('المريض: ' + pName);
  lines.push('────────────');
  lines.push(note.body || '');
  var text = lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ التعليمات ✓');
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('تم نسخ التعليمات ✓');
    }
  } catch (e) { console.warn('copy postop:', e); showToast('⚠️ تعذّر النسخ'); }
}

/* ═══ الموجة 2 بند #6 (ج2): صياغة أمر مخبر (ai-assist · lab_order_draft) ═══
   ── MIRROR (المجموعة N بـcheck-mirrors) ── الدوال الست التالية تعيش
   بايت-بايت في labs.html و pp-clinical.js (نفس عقد المجموعة K: المودالان
   متطابقا المعرّفات فالكتلة الواحدة تخدم السطحين). مكتفية ذاتياً عمداً:
   مُحلّل اسم المريض يتحسس السطح (منتقي labOrderPatient بصفحة المخابر ·
   المتغيّر patient ببطاقة المريض)، والمخبر من allLabs المتوفر بالسطحين.
   البوابة مرآة dashAiInit (opt-in + خطة، الفرض النهائي سيرفر-سايد).
   🔒 صفر كتابة بأي جدول — الحفظ حصراً بمسار saveLabOrder القائم بلا لمس،
   والتكلفة لا تدخل الحمولة. صفر PII للـAI: {الاسم}/{التاريخ} يُحلّان
   client-side (نمط #372) والإرسال للمخبر واتساباً بضغطة الطبيب حصراً. */
var _labAiOn = false;
var _labAiBusy = false;
var _labAiClinicName = '';
async function labAiInit() {
  try {
    if (!window.sb) return;
    var u = await window.sb.auth.getUser();
    var uid = (u && u.data && u.data.user) ? u.data.user.id : null;
    if (!uid) return;
    var cs = await window.sb.from('clinic_settings').select('ai_features_enabled, clinic_name').eq('owner_id', uid).maybeSingle();
    _labAiOn = !!(cs && cs.data && cs.data.ai_features_enabled);
    _labAiClinicName = (cs && cs.data && cs.data.clinic_name) ? String(cs.data.clinic_name) : '';
    if (_labAiOn && window.SyDentPlan) {
      await window.SyDentPlan.load();
      if (window.SyDentPlan.can('ai_features') === false) _labAiOn = false;
    }
  } catch (e) { /* graceful — يبقى الصف مخفياً */ }
  var row = document.getElementById('labAiRow');
  if (row && _labAiOn) row.style.display = '';
  var ssBtn = document.getElementById('labAiSaveSendBtn');
  if (ssBtn && _labAiOn) ssBtn.style.display = '';
}
function labAiNormPhone(raw) {
  /* نسخة سلوكية من عائلة مطبّعات الهاتف (المجموعة A بـcheck-mirrors —
     صارت 6 نسخ بانضمام نسختي هذه المرآة). أي تغيير دلالي يطبَّق على الكل. */
  if (!raw) return null;
  var p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (p.indexOf('00') === 0) p = p.substring(2);
  if (p.indexOf('0') === 0) {
    if (p.length === 9 || p.length === 10) p = '963' + p.substring(1);
    else return null; /* صيغة محلية أجنبية — تحتاج رمز الدولة */
  } else if (p.indexOf('963') !== 0 && p.length === 9) {
    p = '963' + p;
  }
  if (p.length < 10 || p.length > 15) return null;
  return p;
}
function labAiPatientName() {
  var pEl = document.getElementById('labOrderPatient');
  if (pEl && pEl.value && typeof getPatientName === 'function') {
    var n = getPatientName(pEl.value);
    return (n && n !== '—') ? n : '';
  }
  if (typeof patient !== 'undefined' && patient && patient.name) return String(patient.name);
  return '';
}
async function labAiDraftOrder() {
  if (_labAiBusy) return;
  var wtSel = document.getElementById('labOrderWorkType');
  var wtOpt = wtSel && wtSel.selectedIndex >= 0 ? wtSel.options[wtSel.selectedIndex] : null;
  var wtName = wtOpt ? String(wtOpt.textContent || '').trim() : '';
  var tooth = labAiTeeth();
  var shade = document.getElementById('labOrderShade').value.trim();
  var rawNotes = document.getElementById('labOrderNotes').value.trim();
  var dueDate = document.getElementById('labOrderDateDue').value.trim();
  /* «أخرى» بلا كلمات من الطبيب = لا يوجد ما يُصاغ منه أصلاً. */
  if (!wtName || (wtSel.value === '_other' && !rawNotes)) {
    showToast('⚠️ اختر نوع العمل أو اكتب كلماتك بالملاحظات أولاً');
    return;
  }
  var btn = document.getElementById('labAiBtn');
  var oldLabel = btn.textContent;
  _labAiBusy = true;
  btn.disabled = true;
  btn.textContent = '🤖 جارٍ الصياغة…';
  try {
    /* صفر-PII: نوع العمل + السن + اللون + كلمات الطبيب + اسم العيادة
       + تاريخ التسليم فقط — لا اسم مريض ولا مخبر ولا تكلفة. */
    var payload = { work_type: wtName };
    if (tooth) payload.tooth = tooth;
    if (shade) payload.shade = shade;
    if (rawNotes) payload.notes = rawNotes;
    if (dueDate) payload.due_date = dueDate;
    if (_labAiClinicName) payload.clinic_name = _labAiClinicName;
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'lab_order_draft', input: payload }
    });
    if (resp.error) throw resp.error;
    var text = (resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('⚠️ لم يصل ناتج — حاول مجدداً'); return; }
    /* حلّ العناصر النائبة client-side (نمط #372) — الاسم لا يغادر
       المتصفح باتجاه الـAI أبداً. */
    var pname = labAiPatientName();
    if (pname) text = text.split('{الاسم}').join(pname);
    var d = new Date();
    var today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    text = text.split('{التاريخ}').join(today);
    var out = document.getElementById('labAiResult');
    out.value = text;
    out.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('🤖 صيغ الأمر — راجعه وعدّله ثم انسخه أو احفظه وأرسله');
  } catch (e) {
    console.warn('labAiDraftOrder:', e);
    showToast('⚠️ تعذّرت الصياغة — حاول مجدداً');
  } finally {
    _labAiBusy = false;
    btn.disabled = false;
    btn.textContent = oldLabel;
  }
}
function labAiCopy() {
  var el = document.getElementById('labAiResult');
  var txt = el ? String(el.value || '').trim() : '';
  if (!txt) { showToast('⚠️ لا يوجد أمر — ولّده أولاً'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      function () { showToast('📋 تم نسخ الأمر'); },
      function () { showToast('تعذّر النسخ'); }
    );
  } else {
    showToast('النسخ غير مدعوم بهذا المتصفح');
  }
}
async function labAiSaveAndSend() {
  /* حفظ + إرسال بضغطة واحدة (ملاحظة live test): الإرسال وحده كان يترك
     الطلب بلا حفظ فيضيع. الترتيب: تحقّق الإرسال أولاً (كي لا نحفظ ثم
     نفشل)، ثم نافذة تُفتح ضمن نقرة المستخدم قبل أي await (وإلا حجبها
     مانع النوافذ)، ثم الحفظ بمسار saveLabOrder القائم حرفياً، والتوجيه
     لواتساب بعد نجاحه فقط — نجاحُه يُقرأ من انغلاق المودال (closeModal
     يزيل صنف open) بلا أي لمس لمسار الحفظ. فشل التحقق أو الحفظ يغلق
     النافذة الفارغة ولا يُرسل شيء بلا حفظ. */
  var el = document.getElementById('labAiResult');
  var txt = el ? String(el.value || '').trim() : '';
  if (!txt) { showToast('⚠️ ولّد الأمر أولاً ثم احفظ وأرسل'); return; }
  var labId = document.getElementById('labOrderLabSelect').value;
  var labObj = (typeof allLabs !== 'undefined' && allLabs) ? allLabs.find(function (x) { return x.id === labId; }) : null;
  if (!labObj) { showToast('⚠️ اختر المخبر أولاً'); return; }
  var phone = labAiNormPhone(labObj.phone);
  if (!phone) {
    showToast('⚠️ رقم المخبر غير صالح أو مفقود — أضفه من بطاقة المخبر');
    return;
  }
  var w = window.open('', '_blank');
  await saveLabOrder();
  var modal = document.getElementById('labOrderModal');
  var saved = !(modal && modal.classList && modal.classList.contains('open'));
  if (saved) {
    var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(txt);
    if (w) { w.location.href = url; }
    else { window.open(url, '_blank'); }
  } else {
    if (w) w.close();
  }
}
function labAiTeeth() {
  /* دفعة التحديد المتعدد (M86-lab): pendingLabBatchUnits تحمل كل الأسنان
     بينما حقل السن يعرض أولها فقط (الحفظ ينشئ طلباً لكل سن) — فالأمر
     المولَّد يجب أن يعدّدها كلها. الحالة موجودة ببطاقة المريض فقط؛
     بصفحة المخابر typeof يسقطنا على الحقل. */
  if (typeof pendingLabBatchUnits !== 'undefined' && pendingLabBatchUnits && pendingLabBatchUnits.length > 1) {
    return pendingLabBatchUnits.map(function (u) { return u.tooth_num; }).join('\u060c ');
  }
  return document.getElementById('labOrderTooth').value.trim();
}
function labAiReset() {
  /* يُستدعى بمساري فتح وتعديل الطلب بالسطحين (نمط labTplRefresh) —
     وإلا بقيت آخر صياغة عالقة بالصندوق عند فتح أي طلب جديد. */
  var el = document.getElementById('labAiResult');
  if (el) el.value = '';
}
