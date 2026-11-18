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
var FU_STEP_EN = { 'طبعة': 'Impression', 'تجربة': 'Try-in', 'تسليم': 'Fit', 'ضماد': 'Dressing', 'مراجعة': 'Review', 'تجربة الهيكل': 'Framework try-in' };   /* ج2-ج: «تجربة الهيكل» اسمُ مرحلة مخبر */
/* خطوةُ متابعةٍ مخزّنة تطابق كلمةً ملتبسة (أو اسمَ مرحلة مخبر) ⇒ إنجليزيتُها على العنصر نفسه (data-en) — القاموسُ المشترك لا يحملها */
function fuStepEnAttr(step) { var e = FU_STEP_EN[String(step == null ? '' : step).trim()]; return e ? ' data-en="' + fuEsc(e) + '"' : ''; }
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
/* M213: عددُ المتابعات بالشارة = الزياراتُ التي تمّت — المخطّطةُ لم تحدث بعد */
function fuDoneCount(baseId) {
  return fuChildren(baseId).filter(function (k) { return (k.status || 'completed') === 'completed'; }).length;
}
function fuStateBadge(s) {
  var st = fuState(s);
  if (!st) return '';
  var n = fuDoneCount(s.id);
  if (st === 'open' && !n && fuChildren(s.id).length)   /* M213: زيارةٌ مخطّطة فقط ⇒ «قيد الإنجاز» بلا عدد ولا زر — لا يُغلق علاجٌ قبل زيارةٍ تمّت، ولا تُلغى حاجتُه وله زيارة */
    return '<span class="sess-chip cbadge tone tone-orange fu-state" title="العلاج قيد الإنجاز — زيارتُه التالية مخطّطة">قيد الإنجاز</span>';
  if (st === 'open' && !fuChildren(s.id).length)   /* M211: «يحتاج جلسات متابعة» عند التسجيل — قيد الإنجاز قبل أول متابعة؛ الضغطُ يلغي الحاجة */
    return '<button type="button" class="sess-chip cbadge tone tone-orange fu-state" onclick="fuSetState(\'' + s.id + '\',\'none\')" title="العلاج يحتاج جلسات متابعة — اضغط إن لم يعد يحتاجها">قيد الإنجاز</button>';
  return st === 'open'
    ? '<button type="button" class="sess-chip cbadge tone tone-orange fu-state" onclick="fuSetState(\'' + s.id + '\',\'closed\')" title="العلاج قيد الإنجاز — اضغط عند اكتماله">قيد الإنجاز · ' + n + '</button>'
    : '<button type="button" class="sess-chip cbadge tone tone-green fu-state" onclick="fuSetState(\'' + s.id + '\',\'open\')" title="اكتمل العلاج — اضغط لإعادة فتحه">اكتمل · ' + n + '</button>';
}
/* القائمةُ المنسدلة تحت الأساسية (طلب المالك 17/11/2026): المتابعاتُ مطويّةٌ افتراضياً، وزرُّ «المتابعات (N)» بخانة العلاج
   يفتحها ويطويها بلا إعادة رسم. الحالةُ بالذاكرة للصفحة المفتوحة؛ حفظُ متابعةٍ يفتح مجموعتَها. عرضٌ فقط — يعمل بالقراءة فقط. */
var _fuExpanded = {};
function fuIsExpanded(baseId) { return !!_fuExpanded[baseId]; }
function fuToggleChip(s) {
  if (!s || fuIsChild(s)) return '';
  var n = fuChildren(s.id).length;
  if (!n) return '';
  var open = fuIsExpanded(s.id);
  return '<button type="button" class="fu-toggle" data-test="pp-fu-toggle" data-fu-toggle="' + fuEsc(s.id) + '" aria-expanded="' + open + '" onclick="fuToggle(\'' + s.id + '\')"'
    + ' title="' + (open ? 'إخفاء جلسات المتابعة' : 'عرض جلسات المتابعة') + '"><span class="fu-chev" aria-hidden="true"></span>المتابعات (' + n + ')</button>';
}
/* صفُّ المتابعة: مطويٌّ ما لم تُفتح مجموعةُ أساسيته */
function fuRowAttrs(s) {
  return ' class="fu-row' + (fuIsExpanded(s.parent_id) ? '' : ' fu-hidden') + '" data-fu-parent="' + fuEsc(s.parent_id) + '"';
}
function fuToggle(baseId) {
  if (!baseId) return;
  var open = !fuIsExpanded(baseId);
  _fuExpanded[baseId] = open;
  var id = String(baseId);   /* مطابقةُ القيمة نفسها — لا محدِّدٌ مبنيٌّ من المعرّف فلا هروب */
  document.querySelectorAll('tr[data-fu-parent]').forEach(function (tr) { if (tr.getAttribute('data-fu-parent') === id) tr.classList.toggle('fu-hidden', !open); });
  document.querySelectorAll('[data-fu-toggle]').forEach(function (b) {
    if (b.getAttribute('data-fu-toggle') !== id) return;
    b.setAttribute('aria-expanded', String(open));
    b.title = open ? 'إخفاء جلسات المتابعة' : 'عرض جلسات المتابعة';
  });
  if (typeof sessFitCheck === 'function') sessFitCheck();   /* الصفوفُ المفتوحة قد تغيّر عرضَ الجدول */
}
/* «＋ متابعة» بخانة العلاج — بجانب «المتابعات (N)»، لا بعمود الأزرار: الخانةُ الإضافية هناك وسّعت الجدول حتى خرج من بطاقته
   بعيادةٍ لها عمود «الطبيب» (صورة المالك 17/11/2026). يظهر للعلاج متعدّد الجلسات (قرار المالك ٣: اللبية · التيجان · الجسور ·
   الزرع · الأجهزة · التقويم) أو لما بدأ متابعاتٍ فعلاً؛ غيرُه (قلع · حشوة · خدمة جهاز…) يُتابَع من «جلسة جديدة» ← «جلسة متابعة». */
function fuAddChip(s) {
  if (!fuCanFollow(s)) return '';
  if (!fuMultiVisit(fuTreatmentOf(s)) && !fuState(s) && !fuChildren(s.id).length) return '';
  return '<button type="button" class="fu-add" data-test="pp-session-followup" data-en="＋ Follow-up" onclick="fuOpen(\'' + s.id + '\')" title="تسجيل جلسة متابعة لهذا العلاج — بلا تكلفة">＋ متابعة</button>';   /* data-en: «متابعة» وحدها بالقاموس = Continue */
}
/* ما يُلحق بخانة العلاج للجلسة الأساسية: «＋ متابعة» و«المتابعات (N)» بسطرٍ واحدٍ يلتفّ */
function fuCellChips(s) {
  if (!s || fuIsChild(s)) return '';
  var h = fuAddChip(s) + fuToggleChip(s);
  return h ? '<div class="fu-chips">' + h + '</div>' : '';
}

/* ── (٤) النوافذ ─────────────────────────────────────────────────────────── */
var _fuBaseId = null;
/* M213 (ج2-ب): نافذةُ المتابعة بوضعين — «✅ زيارة تمّت» (تسجيلُ ما حصل، حتى اليوم) · «📅 الزيارة التالية» (متابعةٌ مخطّطة
   من اليوم حتى سنتين، ثم نافذةُ الموعد بها مربوطةً). وضعُ العرض وحده — بلا كتابة. */
var _fuMode = 'done';
var FU_PLAN_DAYS = 730;
function fuAddDays(ymd, n) { var d = new Date(String(ymd).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function fuSetMode(mode) {
  _fuMode = mode === 'plan' ? 'plan' : 'done';
  var plan = _fuMode === 'plan';
  var base = fuList().filter(function (s) { return s && s.id === _fuBaseId; })[0];
  var bDate = base && base.date ? String(base.date).slice(0, 10) : '';
  document.querySelectorAll('#fuModal .fu-tab').forEach(function (b) {
    var on = b.getAttribute('data-mode') === _fuMode;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  var dEl = document.getElementById('fuDate'), today = toDay();
  if (plan) {
    var min = (bDate && bDate > today) ? bDate : today;
    dEl.min = min; dEl.max = fuAddDays(today, FU_PLAN_DAYS);
    dEl.value = (dEl.value && dEl.value > today && dEl.value <= dEl.max) ? dEl.value : fuAddDays(min, 7);
  } else {
    dEl.min = bDate; dEl.max = today;
    dEl.value = (dEl.value && dEl.value <= today && (!bDate || dEl.value >= bDate)) ? dEl.value : today;
  }
  var set = function (id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; };
  set('fuTitle', plan ? 'الزيارة التالية' : 'جلسة متابعة');
  set('fuDateLbl', plan ? 'تاريخ الزيارة' : 'التاريخ');
  set('fuStepLbl', plan ? 'ما سيتم في الزيارة التالية' : 'ما تمّ في هذه الجلسة');
  set('fuSaveBtn', plan ? '📅 حفظ واحجز الموعد' : 'حفظ جلسة المتابعة');
  set('fuHint', plan ? 'زيارةٌ مخطّطة بلا تكلفة، مربوطةٌ بالعلاج — تصير جلسةَ متابعة حين يُكمَل موعدُها.' : 'جلسة المتابعة بلا تكلفة — حساب العلاج على جلسته الأساسية.');
  var last = document.getElementById('fuLast');
  if (last) { last.checked = false; if (last.parentNode) last.parentNode.style.display = plan ? 'none' : ''; }
}

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
        + '<span class="fu-prev-t"' + fuStepEnAttr(k.description) + '>' + fuEsc(k.description || '—') + '</span>'
        + ((k.status || 'completed') === 'planned' ? '<span class="sess-chip tone tone-yellow">مخطّطة</span>' : '') + '</div>';   /* M213 */
    });
    h += '</div>';
  } else {
    h += '<div class="fu-prev fu-prev-none">أول جلسة متابعة لهذا العلاج</div>';
  }
  return h;
}

function fuOpen(baseId, mode) {
  if (fuLocked()) return;
  var base = fuList().filter(function (s) { return s && s.id === baseId; })[0];
  if (!base || !fuCanFollow(base)) { showToast('⚠️ هذه الجلسة لا تقبل متابعة'); return; }
  _fuBaseId = base.id;
  document.getElementById('fuBase').innerHTML = fuBaseSummaryHtml(base);
  document.getElementById('fuDate').value = '';   /* كلُّ فتحٍ يبدأ بتاريخ وضعه الافتراضي (اليوم · بعد أسبوع) */
  fuSetMode(mode === 'plan' ? 'plan' : 'done');
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
  if (_fuMode === 'plan') return fuPlanSave(base);
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
  _fuExpanded[base.id] = true;   /* القائمةُ تنفتح على ما سُجّل للتو */
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
  /* M213: العلاجُ لم يكتمل ولا زيارةَ تاليةً مخطّطة ⇒ اقتراحُ حجزها — بعد أن يُفلت حارسُ الحفظ زرَّه
     (وإلا أعاد نصَّ «زيارة تمّت» على زرٍّ صار بوضع «الزيارة التالية») */
  if (!last) setTimeout(function () { fuAskNext(base.id); }, 0);
}
async function fuAskNext(baseId) {
  var base = fuList().filter(function (s) { return s && s.id === baseId; })[0];
  if (!base || fuState(base) !== 'open' || fuNextPlanned(baseId)) return;
  if (await SyDialog.confirm({
    title: 'الزيارة التالية', message: 'تحجز الآن موعد الزيارة التالية لهذا العلاج؟', confirmText: '📅 احجزها', cancelText: 'لاحقاً', danger: false
  })) fuOpen(baseId, 'plan');
}
/* زيارةُ متابعةٍ مخطّطة تُربط بموعد ⇒ تاريخُها يومُ موعدها (لا تاريخان للزيارة نفسها — مراجعة ج2-ب). يومٌ قادم فقط:
   موعدٌ مخطّط بلا تاريخ أو بيومٍ مضى لا يغيّره (الإكمالُ يضبطه). يُعيد التاريخ أو null. */
function fuLinkDate(row, apptDate) {
  if (!row || !row.parent_id || (row.status || 'completed') !== 'planned') return null;
  var d = apptDate ? String(apptDate).slice(0, 10) : '';
  return (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= toDay() && d !== String(row.date || '').slice(0, 10)) ? d : null;
}
/* ج2-ب-2: جلسةُ متابعة سُجّلت من موعدٍ انتهى (appt-followup.js) ⇒ جدولُ هذا المريض يعرضها فوراً */
function fuOnAdded(ev) {
  var d = ev && ev.detail, k = d && d.session;
  if (!k || !k.id || typeof sessions === 'undefined' || !Array.isArray(sessions)) return;
  if (typeof patientId !== 'undefined' && k.patient_id !== patientId) return;
  if (!sessions.some(function (s) { return s && s.id === k.id; })) sessions.unshift(k);
  if (typeof sortByDateDesc === 'function') sortByDateDesc(sessions);
  var base = sessions.filter(function (s) { return s && s.id === d.baseId; })[0];
  if (base) base.followup_state = d.state || 'open';
  _fuExpanded[d.baseId] = true;
  fuRerender();
}
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('sy:followup-added', fuOnAdded);
/* الزيارةُ التالية المخطّطة لهذا العلاج (إن وُجدت) */
function fuNextPlanned(baseId) {
  return fuChildren(baseId).filter(function (k) { return (k.status || 'completed') === 'planned'; })[0] || null;
}
/* M213: حفظُ «الزيارة التالية» — متابعةٌ مخطّطة بالقاعدة، ثم نافذةُ الموعد وهي فيها مربوطة */
async function fuPlanSave(base) {
  var date = document.getElementById('fuDate').value;
  var step = fuCleanStep(document.getElementById('fuStep').value);
  var notes = String(document.getElementById('fuNotes').value || '').trim();
  var pEl = document.getElementById('fuProvider');
  var provider = (pEl && pEl.value) ? pEl.value : null;
  var today = toDay();
  if (!date) { showToast('⚠️ اختر التاريخ'); return; }
  if (date < today || (base.date && date < String(base.date).slice(0, 10))) { showToast('⚠️ تاريخ الزيارة التالية في الماضي'); return; }
  if (date > fuAddDays(today, FU_PLAN_DAYS)) { showToast('⚠️ تاريخ الزيارة التالية بعيد جداً — حتى سنتين'); return; }
  if (step.length > FU_STEP_MAX || notes.length > FU_NOTES_MAX) { showToast('⚠️ النص طويل — اختصره'); return; }
  var res = await window.sb.rpc('session_followup_plan', { p_parent: base.id, p_date: date, p_provider: provider, p_step: step || null, p_notes: notes || null });
  if (res.error || !res.data || !res.data.session) {
    console.warn('followup plan failed:', res.error);
    var msg = (res.error && res.error.message) || '';
    showToast(/followup_date_invalid/.test(msg) ? '⚠️ تاريخ الزيارة التالية غير صالح'
      : /followup_base_invalid/.test(msg) ? '⚠️ الجلسة الأساسية لم تعد تقبل متابعة — حدّث الصفحة'
      : /session_followup_plan|schema cache|PGRST202/.test(msg) ? '⚠️ الزيارة التالية تحتاج تحديث قاعدة البيانات — حدّث الصفحة وأعد المحاولة'
      : '⚠️ فشل حفظ الزيارة التالية');
    return;
  }
  var child = res.data.session;
  sessions.unshift(child);
  if (typeof sortByDateDesc === 'function') sortByDateDesc(sessions);
  base.followup_state = 'open';
  _fuExpanded[base.id] = true;
  if (window.logAudit) {
    window.logAudit('session.create', {
      entityId: child.id, patientId: patientId, patientName: (patient && patient.name) || '',
      description: 'زيارة متابعة مخطّطة: ' + fuBaseLabel(base) + (step ? ' — ' + step : '') + ' (' + date + ')',
      newValue: { type: child.type, date: child.date, parent_id: base.id, step: step || null, status: 'planned' }
    });
  }
  closeModal('fuModal');
  _fuBaseId = null;
  fuRerender();
  fuBookAppt(child, base);
}
/* نافذةُ الموعد ببطاقة المريض والزيارةُ فيها مربوطة — مرآةُ planNewVisit (pp-plan.js): المسارُ القائم يربطها عند «حفظ الموعد»
   (commitPendingAttachmentsPP)، والإلغاءُ يتركها مخطّطةً بلا موعد تُربط لاحقاً من «العلاجات المخطّطة» بأي موعد. */
function fuBookAppt(child, base) {
  var later = '📅 الزيارة التالية مخطّطة — احجز موعدها من «موعد جديد»';
  if (typeof openApptModal !== 'function') { showToast(later); return; }
  var ready = openApptModal();
  var mo = document.getElementById('apptModal');
  if (!mo || !mo.classList.contains('open') || (typeof editingApptId !== 'undefined' && editingApptId !== null)) { showToast(later); return; }   /* حُجب (قراءة فقط/اشتراك) */
  var d = document.getElementById('aDate'); if (d) d.value = String(child.date).slice(0, 10);
  var pr = document.getElementById('aProvider');
  if (pr && child.provider_id && Array.prototype.some.call(pr.options || [], function (o) { return o.value === child.provider_id; })) pr.value = child.provider_id;
  _pendingAttachmentsPP = [child];
  if (typeof renderApptProcedureListPP === 'function') renderApptProcedureListPP();
  /* نوعُ الموعد = علاجُ الأساسية (إن كان بالقائمة) بعد بناء الأنواع — لا «أول نوعٍ» عشوائي (مرآةُ planNewVisit) */
  var t = base ? fuTreatmentOf(base) : null;
  if (t && t.id) Promise.resolve(ready).then(function () {
    var sel = document.getElementById('aType');
    if (!sel || (typeof editingApptId !== 'undefined' && editingApptId !== null)) return;
    if (Array.prototype.some.call(sel.options || [], function (o) { return o.value === String(t.id); })) sel.value = String(t.id);
  }).catch(function () {});
  showToast('📅 الزيارة التالية مخطّطة — اختر الوقت واحفظ الموعد');
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
  if (!base || fuIsChild(base) || (state !== 'open' && state !== 'closed' && state !== 'none')) return;
  if (state === 'none') return fuClearNeed(base);
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

/* M211: «لا يحتاج متابعة» — أساسيةٌ بلا متابعات تعود جلسةً عادية (القاعدةُ ترفضها إن صارت لها متابعات) */
async function fuClearNeed(base) {
  if (fuChildren(base.id).length) return;
  if (!await SyDialog.confirm({
    title: 'لا يحتاج متابعة', message: 'إلغاء «قيد الإنجاز» عن هذا العلاج؟ يبقى مسجّلاً كجلسةٍ منجزة عادية، ويمكن إضافة متابعةٍ له لاحقاً.',
    confirmText: 'لا يحتاج متابعة', danger: false
  })) return;
  var res = await window.sb.rpc('session_followup_set_state', { p_session: base.id, p_state: null });
  if (res.error || !res.data) { console.warn('followup clear failed:', res.error); showToast('⚠️ تعذّر تغيير حالة العلاج'); return; }
  base.followup_state = null;
  if (window.logAudit) {
    window.logAudit('session.edit', {
      entityId: base.id, patientId: patientId, patientName: (patient && patient.name) || '',
      description: 'لا يحتاج متابعة: ' + fuBaseLabel(base), newValue: { followup_state: null }
    });
  }
  fuRerender();
  showToast('✅ العلاج لا يحتاج متابعة');
}

/* ── (٦) «يحتاج جلسات متابعة» بنافذة العلاج (ج2-أ · M211) ──────────────────
   المفتاحُ يظهر للعلاج المنجز بنافذة السن، وقيمتُه الأولى من العلاج نفسه (fuMultiVisit: قرارُ العيادة أو افتراضُ التصنيف).
   الحفظُ نفسُه لا يتغيّر (كلُّ فروعه كما هي): يُغلَّف من الخارج — لقطةٌ للجلسات قبله، وبعده تُعلَّم الجلساتُ المنجزةُ الجديدة
   «قيد الإنجاز». كلُّ جلسةٍ علاجٌ بذاته: الجسرُ جلسةٌ واحدة (unit_teeth)، والجهازُ جلسةٌ لكل فكّ، والدفعةُ جلسةٌ لكل سن.
   فشلُ التعليم لا يمسّ الجلسة المحفوظة. */
/* المفتاحُ بنافذتين: نافذةُ السن (افتراضي) · نافذةُ «جلسة جديدة» (scope 'S': العلاجُ من sType والحالةُ _sessStatus) */
function fuNeedEls(scope) {
  return scope === 'S'
    ? { box: document.getElementById('fuNeedSBox'), cb: document.getElementById('fuNeedS') }
    : { box: document.getElementById('fuNeedBox'), cb: document.getElementById('fuNeed') };
}
function fuNeedSync(reset, scope) {
  var e = fuNeedEls(scope), box = e.box, cb = e.cb;
  if (!box || !cb) return;
  var key, st, cond = false;
  if (scope === 'S') {
    var sel = document.getElementById('sType');
    key = sel && sel.value && sel.value !== '_other' ? sel.value : null;
    st = (typeof _sessStatus !== 'undefined') ? _sessStatus : 'completed';
  } else {
    key = (typeof pendingToothStatus !== 'undefined') ? pendingToothStatus : null;
    st = (typeof pendingTreatStatus !== 'undefined') ? pendingTreatStatus : '';
    cond = (typeof isConditionKey === 'function') && isConditionKey(key);
  }
  var t = (key && typeof getTreatment === 'function') ? getTreatment(key) : null;
  /* نافذةُ السن: علاجٌ من الكتالوج دائماً · «جلسة جديدة»: يظهر للمنجز ولو كان النوعُ «أخرى» (مطفأٌ افتراضياً) */
  box.style.display = ((scope === 'S' || t) && st === 'completed' && !cond) ? '' : 'none';
  if (reset || cb.getAttribute('data-key') !== String(key)) { cb.checked = fuMultiVisit(t); cb.setAttribute('data-key', String(key)); }
}
function fuNeedWanted(scope) {
  var e = fuNeedEls(scope);
  return !!(e.box && e.cb && e.box.style.display !== 'none' && e.cb.checked);
}
/* الجلساتُ المنجزةُ الجديدة منذ اللقطة (لا مخطّطة · لا متابعة · لا رسم · لا ما له حالةٌ أصلاً) */
function fuNewBases(before) {
  return fuList().filter(function (s) {
    return !!s && !!s.id && !before[s.id] && !fuIsChild(s) && !fuIsFee(s) && !fuState(s) && (s.status || 'completed') === 'completed';
  });
}
async function fuMarkNeed(before) {
  return fuMarkList(fuNewBases(before), true);
}
/* «إكمال» علاجٍ مخطّط (جدولُ الجلسات): المتعددُ الجلسات «قيد الإنجاز» بلا مفتاح — قرارُ العيادة/التصنيف (رسالةُ التأكيد تقوله) */
async function fuMarkCompleted(list) {
  return fuMarkList((list || []).filter(function (s) {
    return !!s && !fuIsChild(s) && !fuIsFee(s) && !fuState(s) && (s.status || 'completed') === 'completed' && fuMultiVisit(fuTreatmentOf(s));
  }), false);
}
async function fuMarkList(list, loud) {
  var ok = 0;
  for (var i = 0; i < list.length; i++) {
    var res = await window.sb.rpc('session_followup_set_state', { p_session: list[i].id, p_state: 'open' });
    if (res && !res.error && res.data) { list[i].followup_state = 'open'; ok++; }
    else console.warn('followup need failed:', res && res.error);
  }
  if (!list.length) return;
  fuRerender();
  if (loud || ok < list.length) showToast(ok === list.length ? '🔁 العلاج قيد الإنجاز — سجّل زياراته اللاحقة من «＋ متابعة»' : '⚠️ حُفظت الجلسة، وتعذّر تعليمها «قيد الإنجاز» — علّمها من «＋ متابعة»');
}
/* يُغلّف حفظ نافذة السن (saveToothTreatment · saveToothAndOpenLab) ونافذةِ «جلسة جديدة» (saveSession · scope 'S') */
async function fuNeedRun(inner, self, args, scope) {
  var want = fuNeedWanted(scope), before = {};
  if (want) fuList().forEach(function (s) { if (s && s.id) before[s.id] = 1; });
  var r = await inner.apply(self, args);
  if (want) { try { await fuMarkNeed(before); } catch (e) { console.warn('followup need failed:', e); } }
  return r;
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
    var st = fuState(s), n = fuDoneCount(s.id), w = fuWhereText(s);
    h += '<button type="button" class="fu-pick-row" onclick="fuPickBase(\'' + s.id + '\')">'
      + '<span class="fu-pick-main"><span class="fu-base-type">' + fuEsc(s.type || 'علاج') + '</span>'
      + (w ? '<span class="sess-chip tone tone-lime">' + fuEsc(w) + '</span>' : '') + '</span>'
      + '<span class="fu-pick-meta"><span>' + fuEsc(fuDate(s.date)) + '</span>'
      + (st === 'open' ? '<span class="sess-chip tone tone-orange">قيد الإنجاز' + (n ? ' · ' + n : '') + '</span>'
        : st === 'closed' ? '<span class="sess-chip tone tone-green">اكتمل · ' + n + '</span>' : '')
      + '</span></button>';
  });
  document.getElementById('fuPickList').innerHTML = h;
  closeModal('newSessionEntryModal');
  openModal('fuPickModal');
}
function fuPickBase(id) { fuOpen(id); }
