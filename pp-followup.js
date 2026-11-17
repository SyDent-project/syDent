/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — pp-followup.js (M210 · ج1): جلساتُ المتابعة
   ───────────────────────────────────────────────────────────────────────────
   علاجٌ يمتدّ على زيارات (غسلُ أقنيةٍ لخرّاج · تحضيرٌ ثم تركيب · تجاربُ جهاز) تُسجَّل زياراتُه اللاحقة مربوطةً بجلسته
   الأساسية، بلا فاتورةٍ جديدة. المراجعة: Open Dental («Group for Multiple Visits» — Complete (In Process)) · axiUm
   (In Process وكلُّ زيارةٍ تُوثَّق) · Dentolize · CareStack Clinical Cases · البرنامجُ الذي عرضه المالك.

   النموذج (migrations/210_followup_sessions.sql):
   • المتابعةُ صفٌّ بـledger_sessions يحمل parent_id (أساسيتَه) — مستوى واحد، cost = 0 دائماً، وبلا سنّ ولا سطح ولا مفتاح
     علاج: موضعُها يُقرأ من أساسيتها هنا. محرّكُ المخطط يطابق الجلسات بالسن والسطح والمفتاح فلا يرى المتابعةَ أبداً،
     ومسارُ المواد لا يراها (لا مفتاح)، والتوزيعُ المالي لا يراها (cost = 0 — محرّرُ التوزيع يشترط cost > 0).
   • الأساسيةُ تحمل followup_state: 'open' («قيد الإنجاز») · 'closed' («اكتمل») · NULL (بلا متابعات). الإغلاقُ قرارُ الطبيب.
   • الكتابةُ بدالّتين ذرّيتين (session_followup_add · session_followup_set_state)؛ الحذفُ بـdelSession القائم
     (القاعدةُ تحذف متابعاتِ الأساسية معها، وتعيد الأساسية عاديةً بعد آخر متابعة).
   المداخل: زرُّ «متابعة» بصفّ الجلسة المنجزة · «جلسة متابعة» بنافذة «جلسة جديدة» · شارةُ الحالة بالأساسية.
   القسمُ الأول دوالٌّ نقيّة (بلا DOM) يُبرهَن بـnode؛ المعرّفات والأصناف ببادئة fu-.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── (١) النقيّ ─────────────────────────────────────────────────────────── */
var FU_OB_TYPE = 'رصيد سابق (قبل SyDent)';        /* patient-profile.html OB_SESSION_TYPE */
var FU_NOSHOW_TYPE = 'رسم موعد لم يحضر';          /* appointments.html NO_SHOW_FEE_TYPE_LABEL */
var FU_NOSHOW_DESC = 'رسم عدم الحضور';
/* العلاجُ متعدّدُ الجلسات افتراضياً حسب تصنيفه (قرار المالك 17/11/2026: لبية · تيجان وجسور · زرع · أجهزة · تقويم) —
   treatments.multi_visit (true/false) قرارُ العيادة ويغلب؛ NULL = هذا الافتراضي. خدماتُ الجهاز (denture_svc) زيارةٌ واحدة. */
var FU_MULTI_CATS = { endodontics: 1, prosthodontics: 1, prosth_cosmetic: 1, prosth_removable: 1, implantology: 1, orthodontics: 1 };
var FU_STEPS = {
  endodontics: ['غسل أقنية', 'ضماد دوائي', 'تحضير أقنية', 'حشو أقنية', 'ترميم نهائي'],
  prosthodontics: ['طبعة', 'تجربة', 'تعديل الإطباق', 'إلصاق نهائي'],
  prosth_cosmetic: ['طبعة', 'تجربة', 'تعديل الإطباق', 'إلصاق نهائي'],
  prosth_removable: ['طبعة نهائية', 'تسجيل العضة', 'تجربة الأسنان', 'تسليم', 'تعديل بعد التسليم'],
  implantology: ['فك القطب', 'كشف الزرعة', 'طبعة', 'تجربة', 'تركيب التاج'],
  orthodontics: ['تبديل السلك', 'تفعيل الجهاز', 'إعادة إلصاق حاصرة', 'مراجعة دورية'],
  surgical: ['فك القطب', 'مراجعة الشفاء', 'ضماد'],
  periodontics: ['جلسة تالية', 'إعادة تقييم'],
  _default: ['مراجعة', 'استكمال العلاج', 'فك القطب']
};
/* كلماتٌ مفردة ملتبسة خارج القاموس الإنجليزي المشترك («تجربة» اسمُ خطة اشتراكٍ أيضاً) — شريحتُها تحمل نصَّها الإنجليزي صريحاً (data-en) */
var FU_STEP_EN = { 'طبعة': 'Impression', 'تجربة': 'Try-in', 'تسليم': 'Fit', 'ضماد': 'Dressing', 'مراجعة': 'Review' };
var FU_STEP_MAX = 80, FU_NOTES_MAX = 2000;

function fuList(list) { return list || ((typeof sessions !== 'undefined' && sessions) ? sessions : []); }
function fuIsChild(s) { return !!(s && s.parent_id); }
function fuBaseOf(s, list) {
  if (!fuIsChild(s)) return null;
  var L = fuList(list);
  for (var i = 0; i < L.length; i++) { if (L[i] && L[i].id === s.parent_id) return L[i]; }
  return null;
}
function fuSortKids(arr) {
  return arr.slice().sort(function (a, b) {
    var x = String(a.date || '') + '|' + String(a.created_at || ''), y = String(b.date || '') + '|' + String(b.created_at || '');
    return x < y ? -1 : (x > y ? 1 : 0);
  });
}
/* متابعاتُ الأساسية — الأقدمُ أولاً (متابعة 1 ثم 2…) */
function fuChildren(baseId, list) {
  if (!baseId) return [];
  return fuSortKids(fuList(list).filter(function (s) { return s && s.parent_id === baseId; }));
}
function fuIndex(s, list) {
  if (!fuIsChild(s)) return 0;
  var k = fuChildren(s.parent_id, list);
  for (var i = 0; i < k.length; i++) { if (k[i].id === s.id) return i + 1; }
  return 0;
}
function fuState(s) {
  return (s && !s.parent_id && (s.followup_state === 'open' || s.followup_state === 'closed')) ? s.followup_state : '';
}
/* صفُّ رسمٍ أو رصيدٍ مُرحَّل — ليس علاجاً يُتابَع */
function fuIsFee(s) {
  if (!s) return false;
  var t = String(s.type || '').trim();
  return t === FU_OB_TYPE || t === FU_NOSHOW_TYPE || s.description === FU_NOSHOW_DESC;
}
/* هل تقبل هذه الجلسةُ متابعة: منجزة، ليست متابعة، وليست رسماً */
function fuCanFollow(s) {
  return !!s && !!s.id && !s.parent_id && (s.status || 'completed') === 'completed' && !fuIsFee(s);
}
/* ترتيبُ الجدول: كلُّ متابعةٍ تحت أساسيتها مباشرةً بترتيبها الزمني؛ ترتيبُ الأساسيات كما وصل. متابعةٌ أساسيتُها خارج القائمة تبقى بمكانها. */
function fuOrder(rows) {
  var arr = rows || [], ids = {}, kids = {}, out = [];
  arr.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
  arr.forEach(function (r) { if (r && fuIsChild(r) && ids[r.parent_id]) (kids[r.parent_id] = kids[r.parent_id] || []).push(r); });
  arr.forEach(function (r) {
    if (!r) return;
    if (fuIsChild(r) && ids[r.parent_id]) return;
    out.push(r);
    if (kids[r.id]) fuSortKids(kids[r.id]).forEach(function (k) { out.push(k); });
  });
  return out;
}
/* ما لا يُعدّ إجراءً: المتابعةُ زيارةٌ توثّق علاجاً قائماً — تُستثنى من عدّ الإجراءات ومتوسّطها، وتبقى زيارة. */
function fuProcedures(list) { return (list || []).filter(function (s) { return !fuIsChild(s); }); }
function fuMultiVisitDefault(t) {
  return !!t && !t.denture_svc && FU_MULTI_CATS[String(t.category || '')] === 1;
}
function fuMultiVisit(t) {
  if (!t) return false;
  if (t.multi_visit === true || t.multi_visit === false) return t.multi_visit;
  return fuMultiVisitDefault(t);
}
/* سطرُ التنبيه قبل حذف أساسيةٍ لها متابعات — صيغةٌ واحدة بنافذتَي الحذف (الجدول · إزالةُ العلاج من المخطط) */
function fuDeleteNote(n) { return n > 0 ? 'جلسات المتابعة المرتبطة بها (' + n + ') تُحذف معها' : ''; }
function fuStepsFor(category) { return (FU_STEPS[String(category || '')] || FU_STEPS._default).slice(); }
function fuCleanStep(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

/* ── (٢) القراءةُ من سياق الصفحة ───────────────────────────────────────── */
function fuTreatmentOf(base) {
  if (!base) return null;
  var key = (typeof sessionTreatmentKey === 'function') ? sessionTreatmentKey(base) : base.treatment_key;
  var t = (key && typeof getTreatment === 'function') ? getTreatment(key) : null;
  if (t) return t;
  var all = (typeof TREATMENTS !== 'undefined' && Array.isArray(TREATMENTS)) ? TREATMENTS : [];
  for (var i = 0; i < all.length; i++) { if (all[i] && all[i].name === base.type) return all[i]; }
  return null;
}
function fuSteps(base) { var t = fuTreatmentOf(base); return fuStepsFor(t ? t.category : ''); }
/* موضعُ الأساسية كما يعرضه جدولُ الجلسات — نصٌّ خام (يُهرَّب عند الرسم) */
function fuWhereText(base) {
  if (!base) return '';
  if (base.tooth_num) return (typeof sessionToothChipText === 'function') ? sessionToothChipText(String(base.tooth_num), base.surface) : ('سن ' + base.tooth_num);
  if (base.quadrant && typeof QUADRANT_LABELS !== 'undefined' && QUADRANT_LABELS[base.quadrant]) return QUADRANT_LABELS[base.quadrant];
  if (base.arch) {
    var dw = (window.SyDenture && window.SyDenture.sessWhere) ? window.SyDenture.sessWhere(base) : '';
    return dw || ((typeof ARCH_LABELS !== 'undefined' && ARCH_LABELS[base.arch]) ? ARCH_LABELS[base.arch] : '');
  }
  return '';
}
function fuBaseLabel(base) {
  if (!base) return '';
  var w = fuWhereText(base);
  return String(base.type || 'علاج') + (w ? ' — ' + w : '');
}
/* سطرُ المتابعة للمساعد الذكي (ملخّص المريض · كتاب الإحالة): موضعُ أساسيتها وما تمّ فيها — نصٌّ خام يُضاف لأجزاء السطر */
function fuAiParts(s) {
  if (!fuIsChild(s)) return [];
  var out = [], w = fuWhereText(fuBaseOf(s));
  if (w) out.push(w);
  if (s.description) out.push(String(s.description).slice(0, 80));
  return out;
}
function fuEsc(v) { return (typeof escapeHtml === 'function') ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function fuDate(d) { return (typeof fmtD === 'function') ? fmtD(d) : String(d || '').slice(0, 10); }

/* ── (٣) ما يرسمه جدولُ الجلسات ─────────────────────────────────────────── */
/* خانتا «العلاج» و«السن» لصفّ المتابعة: الترقيمُ من ترتيبها بين أخواتها، والموضعُ من أساسيتها */
function fuChildView(s) {
  var base = fuBaseOf(s), n = fuIndex(s), w = base ? fuWhereText(base) : '';
  return {
    base: base,
    type: '<span class="fu-tag" title="' + fuEsc(base ? 'جلسة متابعة لـ ' + fuBaseLabel(base) : 'جلسة متابعة') + '"><span class="fu-arrow" aria-hidden="true"></span>متابعة' + (n ? ' ' + n : '') + '</span>',   /* الزاويةُ مرسومةٌ بالـCSS: تتبع اتجاه الصفحة ولا تتعلّق بخطّ الجهاز */
    where: w ? '<span class="sess-chip tone tone-gray">' + fuEsc(w) + '</span>' : ''
  };
}
/* شارةُ حالة العلاج على الأساسية — زرٌّ يُغلق العلاج أو يعيد فتحه */
function fuStateBadge(s) {
  var st = fuState(s);
  if (!st) return '';
  var n = fuChildren(s.id).length;
  return st === 'open'
    ? '<button type="button" class="sess-chip cbadge tone tone-orange fu-state" onclick="fuSetState(\'' + s.id + '\',\'closed\')" title="العلاج قيد الإنجاز — اضغط عند اكتماله">قيد الإنجاز · ' + n + '</button>'
    : '<button type="button" class="sess-chip cbadge tone tone-green fu-state" onclick="fuSetState(\'' + s.id + '\',\'open\')" title="اكتمل العلاج — اضغط لإعادة فتحه">اكتمل · ' + n + '</button>';
}
/* زرُّ «متابعة» بخانة الخطوة التالية (خانةُ «إكمال» للمخطّط — لا يجتمعان بصفٍّ واحد) */
function fuRowButton(s, spanIf2) {
  if (!fuCanFollow(s)) return '';
  return '<button class="sy-act" data-slot="1"' + (spanIf2 ? ' data-span-if="2"' : '') + ' data-test="pp-session-followup" data-en="＋ Follow-up" onclick="fuOpen(\'' + s.id + '\')" title="تسجيل جلسة متابعة لهذا العلاج — بلا تكلفة">＋ متابعة</button>';   /* «＋» بلا اتجاه (سهمٌ لليمين يُقرأ «رجوع» بالعربية) · data-en: «متابعة» وحدها بالقاموس = Continue */
}

/* ── (٤) النوافذ ─────────────────────────────────────────────────────────── */
var _fuBaseId = null;

function fuLocked() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return true;   /* M141-ب */
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return true; }
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل جلسات جديدة');
    return true;
  }
  return false;
}

function fuBaseSummaryHtml(base) {
  var kids = fuChildren(base.id), w = fuWhereText(base);
  var h = '<div class="fu-base-head"><span class="fu-base-type">' + fuEsc(base.type || 'علاج') + '</span>'
    + (w ? '<span class="sess-chip tone tone-lime">' + fuEsc(w) + '</span>' : '')
    + '<span class="fu-base-date">' + fuEsc(fuDate(base.date)) + '</span></div>';
  if (kids.length) {
    h += '<div class="fu-prev">';
    kids.forEach(function (k, i) {
      h += '<div class="fu-prev-row"><span class="fu-prev-n">متابعة ' + (i + 1) + '</span><span class="fu-prev-d">' + fuEsc(fuDate(k.date)) + '</span>'
        + '<span class="fu-prev-t">' + fuEsc(k.description || '—') + '</span></div>';
    });
    h += '</div>';
  } else {
    h += '<div class="fu-prev fu-prev-none">أول جلسة متابعة لهذا العلاج</div>';
  }
  return h;
}

function fuOpen(baseId) {
  if (fuLocked()) return;
  var base = fuList().filter(function (s) { return s && s.id === baseId; })[0];
  if (!base || !fuCanFollow(base)) { showToast('⚠️ هذه الجلسة لا تقبل متابعة'); return; }
  _fuBaseId = base.id;
  document.getElementById('fuBase').innerHTML = fuBaseSummaryHtml(base);
  var dEl = document.getElementById('fuDate');
  dEl.value = toDay();
  dEl.min = base.date ? String(base.date).slice(0, 10) : '';
  dEl.max = toDay();
  document.getElementById('fuStep').value = '';
  document.getElementById('fuNotes').value = '';
  document.getElementById('fuLast').checked = false;
  /* الطبيبُ المعالج: طبيبُ الأساسية إن كان نشطاً، وإلا الافتراضيُّ القائم */
  var group = document.getElementById('fuProviderGroup'), select = document.getElementById('fuProvider');
  var docs = (typeof CLINIC_DOCTORS !== 'undefined' && CLINIC_DOCTORS) ? CLINIC_DOCTORS : [];
  if (!docs.length) { group.style.display = 'none'; select.innerHTML = ''; }
  else {
    var active = docs.filter(function (d) { return d.is_active !== false; });
    var show = active.length ? active : docs;
    select.innerHTML = show.map(function (d) {
      return '<option value="' + fuEsc(d.id) + '">' + fuEsc(d.name) + (d.is_owner ? ' ⭐' : '') + (d.is_active === false ? ' (معطل)' : '') + '</option>';
    }).join('');
    var keep = show.some(function (d) { return d.id === base.provider_id; });
    select.value = keep ? base.provider_id : ((typeof getDefaultProviderId === 'function') ? getDefaultProviderId(show) : show[0].id);
    group.style.display = 'block';
  }
  document.getElementById('fuSteps').innerHTML = fuSteps(base).map(function (st, i) {
    return '<button type="button" class="fu-step" data-step="' + fuEsc(st) + '"' + (FU_STEP_EN[st] ? ' data-en="' + fuEsc(FU_STEP_EN[st]) + '"' : '') + ' onclick="fuStepPick(this)">' + fuEsc(st) + '</button>';   /* data-step: النصُّ الأصلي — الظاهرُ قد يكون مترجَماً */
  }).join('');
  closeModal('fuPickModal');
  openModal('fuModal');
}

/* شريحةُ الخطوة تُضاف للنص (بفاصلٍ إن كان فيه شيء) — الطبيبُ يعدّل النصَّ بحرّية */
function fuStepPick(btn) {
  var inp = document.getElementById('fuStep'), v = fuCleanStep(inp.value), add = fuCleanStep(btn && btn.getAttribute && btn.getAttribute('data-step'));
  if (!add) return;
  if (v.split(' · ').indexOf(add) >= 0) return;
  var next = v ? v + ' · ' + add : add;
  if (next.length > FU_STEP_MAX) { showToast('⚠️ وصف الجلسة طويل — اختصره'); return; }
  inp.value = next;
}

var fuSave = (typeof ppGuarded === 'function') ? ppGuarded('fuSave', _fuSave_inner, 'جارٍ الحفظ…') : _fuSave_inner;
async function _fuSave_inner() {
  if (fuLocked()) return;
  var base = fuList().filter(function (s) { return s && s.id === _fuBaseId; })[0];
  if (!base || !fuCanFollow(base)) { showToast('⚠️ الجلسة الأساسية لم تعد متاحة — أغلق النافذة وأعد المحاولة'); return; }
  var date = document.getElementById('fuDate').value;
  var step = fuCleanStep(document.getElementById('fuStep').value);
  var notes = String(document.getElementById('fuNotes').value || '').trim();
  var last = !!document.getElementById('fuLast').checked;
  var pEl = document.getElementById('fuProvider');
  var provider = (pEl && pEl.value) ? pEl.value : null;
  if (!date) { showToast('⚠️ اختر التاريخ'); return; }
  if (base.date && date < String(base.date).slice(0, 10)) { showToast('⚠️ تاريخ المتابعة قبل تاريخ الجلسة الأساسية'); return; }
  if (date > toDay()) { showToast('⚠️ تاريخ المتابعة في المستقبل — سجّلها يوم إجرائها'); return; }
  if (!step && !notes) { showToast('⚠️ اكتب ما تمّ في هذه الجلسة'); return; }
  if (step.length > FU_STEP_MAX || notes.length > FU_NOTES_MAX) { showToast('⚠️ النص طويل — اختصره'); return; }

  var res = await window.sb.rpc('session_followup_add', {
    p_parent: base.id, p_date: date, p_provider: provider, p_step: step || null, p_notes: notes || null, p_close: last
  });
  if (res.error || !res.data || !res.data.session) {
    console.warn('followup save failed:', res.error);
    var msg = (res.error && res.error.message) || '';
    showToast(/followup_date_invalid/.test(msg) ? '⚠️ تاريخ المتابعة غير صالح'
      : /followup_base_invalid/.test(msg) ? '⚠️ الجلسة الأساسية لم تعد تقبل متابعة — حدّث الصفحة'
      : /session_followup_add|schema cache|PGRST202/.test(msg) ? '⚠️ جلسات المتابعة تحتاج تحديث قاعدة البيانات — حدّث الصفحة وأعد المحاولة'
      : '⚠️ فشل حفظ جلسة المتابعة');
    return;
  }
  var child = res.data.session;
  sessions.unshift(child);
  if (typeof sortByDateDesc === 'function') sortByDateDesc(sessions);
  base.followup_state = res.data.state || (last ? 'closed' : 'open');
  /* «آخر زيارة»: المتابعةُ زيارةٌ حصلت — كلُّ مسارات تسجيل الجلسة تحرّكها (saveSession · مودال السن · العلاج الجماعي · الجهاز).
     فشلُها لا يمسّ الجلسة المحفوظة: يُسجَّل بالكونسول والقيمةُ المحلية تبقى كما بالقاعدة. */
  if (typeof patient !== 'undefined' && patient && (!patient.last_visit || date > patient.last_visit)) {
    var lv = await window.sb.from('patients').update({ last_visit: date }).eq('id', patientId).eq('doctor_id', currentUser.id);
    if (lv && lv.error) console.warn('followup last_visit failed:', lv.error);
    else patient.last_visit = date;
  }
  if (window.logAudit) {
    window.logAudit('session.create', {
      entityId: child.id, patientId: patientId, patientName: (patient && patient.name) || '',
      description: 'جلسة متابعة: ' + fuBaseLabel(base) + (step ? ' — ' + step : '') + (last ? ' (اكتمل العلاج)' : ''),
      newValue: { type: child.type, date: child.date, parent_id: base.id, step: step || null, closed: last }
    });
  }
  closeModal('fuModal');
  _fuBaseId = null;
  fuRerender();
  showToast(last ? '✅ سُجّلت جلسة المتابعة واكتمل العلاج' : '✅ سُجّلت جلسة المتابعة');
}

/* الشارةُ بيانٌ يبقى ظاهراً بوضع القراءة (حالةُ العلاج) — الحارسُ أولُ سطر، والكتابةُ خلف قفل الانشغال */
async function fuSetState(baseId, state) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  if (fuLocked()) return;
  return _fuSetStateRun(baseId, state);
}
var _fuSetStateRun = (typeof ppGuarded === 'function') ? ppGuarded('fuSetState', _fuSetState_inner, 'جارٍ الحفظ…') : _fuSetState_inner;
async function _fuSetState_inner(baseId, state) {
  var base = fuList().filter(function (s) { return s && s.id === baseId; })[0];
  if (!base || fuIsChild(base) || (state !== 'open' && state !== 'closed')) return;
  var closing = state === 'closed';
  if (!await SyDialog.confirm({
    title: closing ? 'اكتمال العلاج' : 'إعادة فتح العلاج',
    message: closing ? 'تأكيد اكتمال هذا العلاج؟ يمكن إعادة فتحه لاحقاً وتسجيل متابعة جديدة.' : 'إعادة هذا العلاج إلى «قيد الإنجاز»؟',
    confirmText: closing ? 'اكتمل العلاج' : 'إعادة فتح', danger: false
  })) return;
  var res = await window.sb.rpc('session_followup_set_state', { p_session: base.id, p_state: state });
  if (res.error || !res.data) { console.warn('followup state failed:', res.error); showToast('⚠️ تعذّر تغيير حالة العلاج'); return; }
  base.followup_state = res.data.state || state;
  if (window.logAudit) {
    window.logAudit('session.edit', {
      entityId: base.id, patientId: patientId, patientName: (patient && patient.name) || '',
      description: (closing ? 'اكتمال العلاج: ' : 'إعادة فتح العلاج: ') + fuBaseLabel(base),
      newValue: { followup_state: base.followup_state }
    });
  }
  fuRerender();
  showToast(closing ? '✅ اكتمل العلاج' : '✅ أُعيد فتح العلاج');
}

function fuRerender() {
  if (typeof renderInfo === 'function') renderInfo();   /* «آخر زيارة» ببطاقة المعلومات */
  if (typeof renderSessions === 'function') renderSessions();
  if (typeof renderRecentSessions === 'function') renderRecentSessions();
  if (typeof renderTimeline === 'function') renderTimeline();
}

/* ── (٥) المدخل من «جلسة جديدة»: أيُّ علاجٍ تكمله هذه الجلسة؟ ───────────── */
/* قيد الإنجاز أولاً، ثم متعدّدُ الجلسات، ثم الباقي — وكلٌّ منها الأحدثُ أولاً */
function fuPickRows(list) {
  var L = fuList(list).filter(fuCanFollow);
  var rank = function (s) { return fuState(s) === 'open' ? 0 : (fuMultiVisit(fuTreatmentOf(s)) && fuState(s) !== 'closed' ? 1 : 2); };
  return L.map(function (s, i) { return { s: s, i: i, r: rank(s) }; }).sort(function (a, b) {
    if (a.r !== b.r) return a.r - b.r;
    var x = String(a.s.date || ''), y = String(b.s.date || '');
    if (x !== y) return x < y ? 1 : -1;
    return a.i - b.i;
  }).map(function (x) { return x.s; });
}
function fuOpenPicker() {
  if (fuLocked()) return;
  var rows = fuPickRows();
  if (!rows.length) { showToast('⚠️ لا علاج منجز لهذا المريض بعد — سجّل الجلسة الأساسية أولاً'); return; }
  var h = '';
  rows.forEach(function (s) {
    var st = fuState(s), n = fuChildren(s.id).length, w = fuWhereText(s);
    h += '<button type="button" class="fu-pick-row" onclick="fuPickBase(\'' + s.id + '\')">'
      + '<span class="fu-pick-main"><span class="fu-base-type">' + fuEsc(s.type || 'علاج') + '</span>'
      + (w ? '<span class="sess-chip tone tone-lime">' + fuEsc(w) + '</span>' : '') + '</span>'
      + '<span class="fu-pick-meta"><span>' + fuEsc(fuDate(s.date)) + '</span>'
      + (st === 'open' ? '<span class="sess-chip tone tone-orange">قيد الإنجاز · ' + n + '</span>'
        : st === 'closed' ? '<span class="sess-chip tone tone-green">اكتمل · ' + n + '</span>' : '')
      + '</span></button>';
  });
  document.getElementById('fuPickList').innerHTML = h;
  closeModal('newSessionEntryModal');
  openModal('fuPickModal');
}
function fuPickBase(id) { fuOpen(id); }
