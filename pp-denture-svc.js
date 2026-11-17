/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — pp-denture-svc.js (M208 · ج4-أ): خدماتُ ما بعد تسليم الجهاز المتحرك
   ───────────────────────────────────────────────────────────────────────────
   تبطين · إصلاح · تبديل سن مكسور · إضافة سن · ضمّة · تعديل — على جهازٍ قائم بالمخطط (ولو «موجود مسبقاً»).
   المراجعة: CDT D5410–D5761 (ترميزُ كتالوجات Open Dental / Dentrix / Sensei) — الخدماتُ بنودٌ مستقلة على الفك.

   النموذج:
   • الكتالوج: الخدمةُ «علاجُ فكّ» (target_part = 'arch') موسومٌ بـdenture_svc = 'service' أو 'add'. لا نوعَ تطبيقٍ جديد:
     كلُّ شاشةٍ لا تعرف الوسم تعامل الجلسة جلسةَ فكٍّ عادية (المواعيد · البوابة · الخطة · المحاسبة) — بلا تعديل ولا خطأ.
   • السجل: جلسةُ فكٍّ واحدة تحمل denture_unit (معرّفُ وحدة الجهاز = teeth_status.unit_id) ⇒ سجلُّ خدمات الجهاز.
   • «إضافة سن»: الجلسةُ تحمل denture_add (الأسنانُ المضافة) — عمودٌ مستقل عن unit_teeth عمداً (unit_teeth = «هذه الجلسةُ
     جهازٌ»، ومرآةُ إنجاز الموعد ترسم منه جهازاً جديداً). المنجزةُ تُدرج صفوفَ DENTURE للأسنان بمعرّف الوحدة نفسه ومفتاحها
     وحالتها؛ المخطّطةُ لا ترسم شيئاً حتى تُنجَز (هنا وبصفحة المواعيد). حذفُ المنجزة يعيد الرسم كما كان.
   • المال: صفر مسار جديد — الجلسةُ بالتكلفة المدخلة ثم reallocatePatientFunds كأي جلسة فك.
   المداخل: شريحةُ الجهاز بشريط الأجهزة · زرٌّ بنافذة سنٍّ يعوّضه جهاز · اختيارُ الخدمة من «علاج جماعي».
   يعتمد على pp-denture.js (يُحمَّل بعده). المعرّفات والأصناف ببادئة dsv-.
   ═══════════════════════════════════════════════════════════════════════════ */

var pendingDentSvc = null;   // { key, label, kind, unit:{id}, teeth:[], picking } — يُستهلك عند الحفظ

function dsvKind(t) { return (t && t.target_part === 'arch' && (t.denture_svc === 'service' || t.denture_svc === 'add')) ? t.denture_svc : ''; }
function dsvIsTreatment(t) { return !!dsvKind(t); }
function dsvTreatments() {
  return (typeof TREATMENTS !== 'undefined' && TREATMENTS ? TREATMENTS : []).filter(function (t) { return t && t.is_active !== false && dsvIsTreatment(t); });
}
function dsvUnit(id) {
  if (!id) return null;
  var us = dentUnits();
  for (var i = 0; i < us.length; i++) { if (us[i].id && us[i].id === id) return us[i]; }
  return null;
}
/* لماذا لا تُسجَّل خدمةٌ على هذا الجهاز — فارغٌ إن قُبلت */
function dsvUnitWhy(u, kind, key) {
  if (!u || !u.id) return 'الجهاز لم يعد على المخطط';
  if (u.st === 'planned') return 'الجهاز ما زال مخطّطاً — أنجزه أولاً';
  if (kind === 'add' && dentIsFullSet(u.teeth, u.arch)) return 'الجهاز الكامل يعوّض كل أسنان الفك — إضافة السن للجهاز الجزئي';
  /* v745 (المالك 17/11/2026: «الجهاز الكامل ماله ضمات فغلط يطلع»): خدمةُ الضمّة للجهاز الجزئي وحده */
  if (key === DENT_CLASP_SVC_KEY && !dsvClaspUnit(u)) return 'الجهاز الكامل بلا ضمّات — الضمّة للجهاز الجزئي';
  return '';
}
function dsvIsSession(s) { return !!s && !s.tooth_num && !!s.denture_unit; }
function dsvTeeth(s) {
  if (!s || !s.denture_add) return [];
  return String(s.denture_add).split(',').map(function (t) { return parseInt(t, 10); }).filter(function (t) { return t >= 11 && t <= 48; });
}
/* خدماتُ هذا الجهاز — الأحدثُ أولاً */
function dsvSessions(u) {
  if (!u || !u.id || typeof sessions === 'undefined' || !sessions) return [];
  return sessions.filter(function (s) { return dsvIsSession(s) && s.denture_unit === u.id; })
    .sort(function (a, b) {
      var x = String(a.date || '') + '|' + String(a.created_at || ''), y = String(b.date || '') + '|' + String(b.created_at || '');
      return x < y ? 1 : (x > y ? -1 : 0);
    });
}
/* سنٌّ أمام «إضافة سن»: المفقودُ يُضاف، والذي قلعُه مخطّط يُضاف مخطّطاً (إضافةٌ فورية) — غيرُهما مرفوضٌ بسببه */
function dsvToothState(u, t) {
  t = parseInt(t, 10);
  if (u.teeth.indexOf(t) !== -1) return { ok: false, own: true, why: 'ضمن الجهاز' };
  if (dentHas(t)) return { ok: false, why: 'يعوّضه جهاز آخر' };
  var s = dentBareState(t);
  if (s.missing) return { ok: true, why: 'مفقود' };
  if (s.imm) return { ok: true, imm: true, why: 'قلعه مخطّط — يُضاف مخطّطاً' };
  if (s.alt) return { ok: false, why: 'عليه زرعة أو جسر مخطّط' };
  return { ok: false, why: s.why || 'لا يقبل الإضافة' };
}
/* بوّاباتُ التسجيل = بوّاباتُ «جلسة جديدة» و«علاج جماعي» حرفياً (openNewSessionEntry). v733: الفحصُ الأولي والتحديدُ المتعدد
   يعطّلان حارسَ الحفظ (dsvSaveReady) فكانت الخدمةُ المبدوءة من الشريحة تُحفظ جلسةَ فكٍّ بلا ربط — المدخلُ يرفض قبل أن يبدأ. */
function dsvLocked() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return true;   /* وضعُ القراءة: لا تسجيل */
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return true; }
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return true; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return true; }
  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return true; }
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل جلسات جديدة'); return true;
  }
  return false;
}
function dsvClearPending() { pendingDentSvc = null; }
function dsvDate(d) { return (window.SyDT && window.SyDT.numDate && window.SyDT.numDate(d)) || String(d || '').slice(0, 10); }
function dsvUnitLine(u) {
  var st = (u.st && u.st !== 'completed') ? ' · ' + ((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[u.st]) || u.st) : '';
  return dentUnitName(u) + ' — ' + dentAreaText(u.arch, u.teeth) + st;
}

/* ═════════════════════ نافذةُ الجهاز: سجلُّه + خدمةٌ جديدة + منتقي السن المضاف ═════════════════════ */
function dsvDialog() { return document.querySelector('.dsv-dialog'); }
function dsvClose() {
  var ov = dsvDialog(); if (!ov) return;
  ov.remove();
  if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
}
/* v739 (M209): الضمّات بنافذة الجهاز الجزئي — مقترحةٌ تلقائياً، ونقرةُ السن تضيف ضمّةً أو تلغيها (تُحفظ فوراً) */
function dsvClaspUnit(u) { return !!(u && typeof dentIsPartialUnit === 'function' && dentIsPartialUnit(u)); }
function dsvClaspHtml(u) {
  if (!dsvClaspUnit(u)) return '';
  var row = dentArchRow(u.arch), on = dentClasps(u), h = '<div class="dsv-h">الضمّات</div><div class="nse-row dent-row dsv-clasp-grid">';
  for (var i = 0; i < row.length; i++) {
    if (i === row.length / 2) h += '<span class="nse-mid"></span>';
    var t = row[i], own = u.teeth.indexOf(t) !== -1, ok = !own && dentClaspOk(t), has = on.indexOf(t) !== -1;
    h += '<button type="button" class="nse-t dent-t' + (own ? ' dsv-own' : (ok ? (has ? ' dsv-clasp-on' : ' dent-miss') : ' dent-off')) + '" data-dsv-clasp="' + t + '"'
      + (ok ? ' aria-pressed="' + (has ? 'true' : 'false') + '"' : ' aria-disabled="true"') + '>' + t + '</button>';
  }
  h += '</div><div class="dsv-note">' + (dentClaspIsAuto(u) ? 'مقترحة تلقائياً على السن الإنسي لكل فراغ' : 'قائمة الطبيب') + ' — انقر السن لإضافة ضمّة أو إلغائها.</div>';
  if (!dentClaspIsAuto(u)) h += '<button type="button" class="dsv-clasp-auto" data-dsv-act="clasp-auto">↺ الاقتراح التلقائي</button>';
  return h;
}
/* النقرة: كتابةٌ واحدة ثم إعادةُ رسم النافذة من الحالة المحفوظة. قفلٌ يمنع نقرتين متراكبتين */
async function dsvClaspClick(ov, n, auto) {
  var st = ov._dsv, u = dsvUnit(st.unitId); if (!u) { dsvClose(); return; }
  if (dsvLocked() || st.busy) return;
  if (!auto) {
    if (u.teeth.indexOf(n) !== -1) { showToast('🦷 السن ' + n + ': ضمن الجهاز'); return; }
    if (!dentClaspOk(n)) { showToast('🦷 السن ' + n + ': لا يحمل ضمّة (مفقود أو مزروع أو قلعه مخطّط)'); return; }
  }
  st.busy = true;
  try { if (auto) await dentClaspSave(u, null); else await dentClaspToggle(u, n); }
  finally { st.busy = false; }
  if (dsvDialog() === ov && ov._dsv && ov._dsv.view === 'home') dsvRender(ov);
}
/* v741 — خدمةُ «إضافة أو إصلاح ضمة» على جهازٍ جزئي تمرّ بمنتقي السن (المالك 17/11/2026). السنُّ الجديد تُضاف ضمّتُه لرسم الجهاز عند
   حفظ الجلسة منجزةً، والسنُّ الذي عليه ضمّة = إصلاحٌ لا يغيّر الرسم. الخدمةُ على جهازٍ كامل (أو بلا سنٍّ قائمٍ بالفك) تبقى كما كانت. */
function dsvClaspTeethOk(u) { return dentArchRow(u.arch).filter(function (t) { return u.teeth.indexOf(t) === -1 && dentClaspOk(t); }); }
function dsvClaspPick(u, key) { return key === DENT_CLASP_SVC_KEY && dsvClaspUnit(u) && dsvClaspTeethOk(u).length > 0; }
/* لماذا لا يحمل السنُّ ضمّة — فارغٌ إن قُبل */
function dsvClaspWhy(u, n) {
  if (u.teeth.indexOf(n) !== -1) return 'ضمن الجهاز';
  return dentClaspOk(n) ? '' : 'لا يحمل ضمّة (مفقود أو مزروع أو قلعه مخطّط)';
}
/* view: 'home' (سجلّ + خدمات) · 'add' (منتقي السن) · 'clasp' (سنُّ الضمّة) · 'units' (أيُّ جهاز؟) */
function dsvRender(ov) {
  var st = ov._dsv, body = ov.querySelector('.dsv-body'), foot = ov.querySelector('.dsv-foot'), h = '';
  /* شبكةُ الأسنان تحتاج عرضاً (سابقةُ منتقي الجهاز: sm ← md) — وتعود النافذةُ كما كانت خارجها */
  /* v739: صفُّ الضمّات بالواجهة الرئيسية لجهازٍ جزئي شبكةُ أسنانٍ أيضاً */
  var wide = st.view === 'add' || st.view === 'clasp' || (st.view === 'home' && dsvClaspUnit(dsvUnit(st.unitId)));
  ov.classList.toggle('sy-m-md', !!wide); ov.classList.toggle('sy-m-sm', !wide);
  if (st.view === 'units') {
    h += '<div class="dsv-hint">اختر الجهاز الذي تخصّه «' + escapeHtml(st.label) + '»:</div><div class="dsv-list">';
    st.units.forEach(function (u) { h += '<button type="button" class="dsv-tx" data-dsv-unit="' + escapeHtml(String(u.id)) + '">' + escapeHtml(dsvUnitLine(u)) + '</button>'; });
    h += '</div>';
    foot.innerHTML = '<button type="button" class="btn-sy-cancel" data-dsv-act="close" data-sy-close>إغلاق</button>';
    body.innerHTML = h; return;
  }
  var u = dsvUnit(st.unitId);
  if (!u) { dsvClose(); return; }
  h += '<div class="dsv-unit">' + escapeHtml(dsvUnitLine(u)) + '</div>';
  if (st.view === 'add') {
    var row = dentArchRow(u.arch);
    h += '<div class="dsv-hint">«' + escapeHtml(st.label) + '»: اختر السن الذي يُضاف للجهاز — المفقود وحده يقبل الإضافة.</div><div class="nse-row dent-row dsv-grid">';
    for (var i = 0; i < row.length; i++) {
      if (i === row.length / 2) h += '<span class="nse-mid"></span>';
      var t = row[i], s = dsvToothState(u, t), on = st.teeth.indexOf(t) !== -1;
      h += '<button type="button" class="nse-t dent-t' + (s.own ? ' dsv-own' : (s.ok ? (on ? ' dent-on' : ' dent-miss' + (s.imm ? ' dent-alt' : '')) : ' dent-off')) + '" data-dsv-tooth="' + t + '" title="' + escapeHtml(s.why || '') + '"'
        + (s.ok ? '' : ' aria-disabled="true"') + '>' + t + '</button>';
    }
    h += '</div>';
    var can = row.filter(function (t) { return dsvToothState(u, t).ok; });
    h += can.length
      ? '<div class="dsv-note">المحدَّد: <b>' + (st.teeth.length ? dentTeethWord(st.teeth.length) : 'لا شيء') + '</b> — الملوَّن ضمن الجهاز، والباهت لا يقبل الإضافة (انقره لمعرفة السبب).</div>'
      : '<div class="dsv-note dsv-warn">لا أسنان مفقودة بهذا الفك تُضاف للجهاز — سجّل القلع على المخطط أولاً.</div>';
    foot.innerHTML = '<button type="button" class="btn-sy-cancel" data-dsv-act="back">رجوع</button>'
      + '<button type="button" class="btn-sy-ok" data-dsv-act="next"' + (st.teeth.length ? '' : ' disabled') + '>متابعة</button>';
    body.innerHTML = h; return;
  }
  if (st.view === 'clasp') {
    var crow = dentArchRow(u.arch), con = dentClasps(u);
    h += '<div class="dsv-hint">«' + escapeHtml(st.label) + '»: اختر السن الذي تُركَّب عليه الضمّة أو تُصلَّح.</div><div class="nse-row dent-row dsv-grid">';
    for (var ci = 0; ci < crow.length; ci++) {
      if (ci === crow.length / 2) h += '<span class="nse-mid"></span>';
      var ct = crow[ci], cw = dsvClaspWhy(u, ct), csel = st.teeth.indexOf(ct) !== -1, chas = con.indexOf(ct) !== -1;
      h += '<button type="button" class="nse-t dent-t' + (u.teeth.indexOf(ct) !== -1 ? ' dsv-own' : (!cw ? (csel ? ' dent-on' : (chas ? ' dsv-clasp-on' : ' dent-miss')) : ' dent-off')) + '" data-dsv-ctooth="' + ct + '"'
        + (cw ? ' aria-disabled="true" title="' + escapeHtml(cw) + '"' : ' aria-pressed="' + (csel ? 'true' : 'false') + '"') + '>' + ct + '</button>';
    }
    /* v745: كلُّ سنٍّ محدَّد يُسمّى بعمله — «ضمّة جديدة» (تُرسم مع الجلسة المنجزة) أو «إصلاح» (الرسمُ كما هو) — ومفتاحُ الألوان بالكلمات */
    var cNew = dentSortTeeth(st.teeth.filter(function (t) { return con.indexOf(t) === -1; }), u.arch);
    var cRep = dentSortTeeth(st.teeth.filter(function (t) { return con.indexOf(t) !== -1; }), u.arch);
    h += '</div><div class="dsv-legend"><span class="dsv-lg"><i class="dsv-lg-sw dsv-lg-on" aria-hidden="true"></i>عليه ضمّة</span>'
      + '<span class="dsv-lg"><i class="dsv-lg-sw dsv-lg-sel" aria-hidden="true"></i>محدَّد</span></div><div class="dsv-note dsv-clasp-sel">'
      + (st.teeth.length
        ? (cNew.length ? '<span>ضمّة جديدة:</span> <b>' + escapeHtml(dentTeethPhrase(cNew)) + '</b>' : '')
          + (cNew.length && cRep.length ? ' · ' : '')
          + (cRep.length ? '<span>إصلاح:</span> <b>' + escapeHtml(dentTeethPhrase(cRep)) + '</b>' : '')
        : 'المحدَّد: <b>لا شيء</b>')
      + '</div><button type="button" class="dsv-clasp-auto dsv-clasp-edit" data-dsv-act="clasp-edit">إلغاء أو إضافة ضمّة على الرسم (بلا جلسة)</button>';
    foot.innerHTML = '<button type="button" class="btn-sy-cancel" data-dsv-act="back">رجوع</button>'
      + '<button type="button" class="btn-sy-ok" data-dsv-act="next"' + (st.teeth.length ? '' : ' disabled') + '>متابعة</button>';
    body.innerHTML = h; return;
  }
  var txs = dsvTreatments(), hist = dsvSessions(u), why = dsvUnitWhy(u, '');
  h += dsvClaspHtml(u);
  h += '<div class="dsv-h">خدمة جديدة</div>';
  if (why) h += '<div class="dsv-note dsv-warn">' + escapeHtml(why) + '</div>';
  else if (!txs.length) h += '<div class="dsv-note">لا خدمات جهاز بقائمة علاجاتك — أضفها من صفحة العلاجات بزر «الافتراضي»، أو أنشئ علاجاً واختر له «خدمة جهاز».</div>';
  else {
    h += '<div class="dsv-list">';
    txs.forEach(function (t) {
      var bad = dsvUnitWhy(u, dsvKind(t), t.id);
      h += '<button type="button" class="dsv-tx' + (bad ? ' dsv-tx-off' : '') + '" data-dsv-tx="' + escapeHtml(String(t.id)) + '"' + (bad ? ' aria-disabled="true" title="' + escapeHtml(bad) + '"' : '') + '>'
        + escapeHtml(t.name) + (t.needs_lab ? ' <span class="dsv-lab" aria-hidden="true">🥽</span>' : '') + '</button>';
    });
    h += '</div>';
  }
  h += '<div class="dsv-h">سجل الخدمات</div>';
  if (!hist.length) h += '<div class="dsv-note">لا خدمات مسجّلة لهذا الجهاز بعد.</div>';
  else {
    h += '<div class="dsv-hist">';
    hist.forEach(function (s) {
      var add = dsvTeeth(s), planned = (s.status || 'completed') === 'planned';
      if (!add.length) add = dentSessClasp(s);   /* v741: خدمةُ الضمّة تسمّي سنَّها */
      h += '<div class="dsv-row"><span class="dsv-date">' + escapeHtml(dsvDate(s.date)) + '</span><span class="dsv-what">' + escapeHtml(s.type || 'خدمة جهاز')
        + (add.length ? ' <span class="dsv-add">' + escapeHtml(dentTeethPhrase(add)) + '</span>' : '') + '</span>'
        + (planned ? '<span class="dsv-st">' + escapeHtml((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS.planned) || 'مخطط') + '</span>' : '') + '</div>';
    });
    h += '</div>';
  }
  /* ج4-ب: تعليماتُ المريض لهذا الجهاز — تفتح نافذةَ التعليمات على قالب المكتبة المناسب (الفوري أو العناية العامة) */
  foot.innerHTML = ((typeof openPostOpModal === 'function') ? '<button type="button" class="btn-sy-cancel" data-dsv-act="instr">📋 تعليمات للمريض</button>' : '')
    + '<button type="button" class="btn-sy-cancel" data-dsv-act="close" data-sy-close>إغلاق</button>';
  body.innerHTML = h;
}
/* قالبُ المكتبة المناسب للجهاز: فوريٌّ (تحته قلعٌ مخطّط) ⇒ lib21، وإلا العنايةُ بالجهاز المتحرك lib13. الطبيبُ يبدّله أو يعدّل نصَّه قبل الحفظ */
function dsvInstrTemplate(u) { return (u && dentOpenExtractions(u.teeth).length) ? 'lib21' : 'lib13'; }
async function dsvInstructions(unitId) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* إنشاءُ تعليماتٍ كتابة */
  if (typeof openPostOpModal !== 'function') return;
  var lid = dsvInstrTemplate(dsvUnit(unitId));
  dsvClose();
  await openPostOpModal();
  var pick = document.getElementById('postOpLibraryPick');
  if (pick && typeof postOpLibraryGet === 'function' && postOpLibraryGet(lid) && typeof postOpApplyLibrary === 'function') { pick.value = lid; postOpApplyLibrary(lid); }
}
function dsvOpenDialog(state) {
  if (dsvDialog()) dsvClose();
  var ov = document.createElement('div');
  ov.className = 'modal-overlay sy-m sy-m-sm open sy-dialog dsv-dialog';
  ov.setAttribute('data-sy-kind', 'dentsvc');
  ov.innerHTML = '<div class="modal-box">'
    + '<div class="modal-head"><h3>🛠 خدمات الجهاز</h3><button type="button" class="modal-close" data-dsv-act="close" data-sy-close aria-label="إغلاق">✕</button></div>'
    + '<div class="modal-body dsv-body"></div><div class="modal-foot dsv-foot"></div></div>';
  ov._dsv = state;
  document.body.appendChild(ov);
  if (window.SyModal) window.SyModal.scan();
  ov.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var st = ov._dsv;
    var pu = t.closest('[data-dsv-unit]');
    if (pu) { dsvPickUnit(ov, pu.getAttribute('data-dsv-unit')); return; }
    var tx = t.closest('[data-dsv-tx]');
    if (tx) {
      if (tx.getAttribute('aria-disabled') === 'true') { showToast('🛠 ' + (tx.getAttribute('title') || 'غير متاح لهذا الجهاز')); return; }
      dsvPickTx(ov, tx.getAttribute('data-dsv-tx')); return;
    }
    var cl = t.closest('[data-dsv-clasp]');
    if (cl) { dsvClaspClick(ov, parseInt(cl.getAttribute('data-dsv-clasp'), 10), false); return; }
    var cth = t.closest('[data-dsv-ctooth]');
    if (cth) {
      var cu = dsvUnit(st.unitId), cn = parseInt(cth.getAttribute('data-dsv-ctooth'), 10); if (!cu) { dsvClose(); return; }
      var cwhy = dsvClaspWhy(cu, cn);
      if (cwhy) { showToast('🦷 السن ' + cn + ': ' + cwhy); return; }
      var cj = st.teeth.indexOf(cn); if (cj === -1) st.teeth.push(cn); else st.teeth.splice(cj, 1);
      dsvRender(ov); return;
    }
    var th = t.closest('[data-dsv-tooth]');
    if (th) {
      var u = dsvUnit(st.unitId), n = parseInt(th.getAttribute('data-dsv-tooth'), 10); if (!u) { dsvClose(); return; }
      var s = dsvToothState(u, n);
      if (!s.ok) { showToast('🦷 السن ' + n + ': ' + s.why); return; }
      var i = st.teeth.indexOf(n); if (i === -1) st.teeth.push(n); else st.teeth.splice(i, 1);
      dsvRender(ov); return;
    }
    var act = t.closest('[data-dsv-act]'); if (!act) return;                   /* النقرُ الخارجي لا يُغلق — كبقية النوافذ */
    var a = act.getAttribute('data-dsv-act');
    if (a === 'instr') { dsvInstructions(st.unitId); return; }
    if (a === 'clasp-auto') { dsvClaspClick(ov, 0, true); return; }
    if (a === 'clasp-edit') { st.view = 'home'; st.key = null; st.teeth = []; dsvRender(ov); return; }
    if (a === 'back') { st.view = 'home'; st.key = null; st.teeth = []; dsvRender(ov); }
    else if (a === 'next') { if (st.view === 'clasp') dsvConfirmClasp(ov); else dsvConfirmAdd(ov); }
    else dsvClose();
  });
  ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); dsvClose(); } });
  dsvRender(ov);
  return ov;
}
/* المدخل من شريحة الجهاز أو من نافذة سنٍّ يعوّضه */
function dsvOpen(unitId) {
  var u = dsvUnit(unitId);
  if (!u) { showToast('🦷 الجهاز لم يعد على المخطط'); return; }
  var ov = dsvOpenDialog({ view: 'home', unitId: u.id, key: null, label: '', teeth: [] });
  /* قائمةُ العلاجات قد تكون تغيّرت بصفحة العلاجات والبطاقةُ مفتوحة (خدمةٌ أُضيفت للتوّ) — تُحدَّث كما يفعل مودالُ السن عند كل فتح */
  if (typeof loadTreatmentsFromSupabase === 'function') {
    Promise.resolve().then(loadTreatmentsFromSupabase).then(function () {
      if (dsvDialog() === ov && ov._dsv && ov._dsv.view === 'home') dsvRender(ov);
    }).catch(function (e) { console.warn('denture services: treatments refresh skipped:', e); });
  }
}
function dsvOpenFromTooth(n) {
  var u = dentUnitOf(n);
  if (!u || !u.id) { showToast('🦷 الجهاز لم يعد على المخطط'); return; }
  if (typeof closeModal === 'function') closeModal('toothModal');
  dsvOpen(u.id);
}
/* المدخل من قائمة العلاجات («علاج جماعي» أو نافذة سن): الخدمةُ معلومة والجهازُ يُحدَّد */
function dsvStart(key, label, ctx) {
  var tr = getTreatment(key), kind = dsvKind(tr);
  if (!kind) return false;
  if (dsvLocked()) return true;
  label = label || tr.name;
  var fromTooth = (ctx && ctx.tooth && dentHas(ctx.tooth)) ? dentUnitOf(ctx.tooth) : null;
  var cand = fromTooth ? [fromTooth] : dentUnits();
  /* v745: الضمّةُ من نافذة سنٍّ قائم ⇒ أجهزةُ فكّه الجزئية وحدها، والسنُّ نفسُه محدَّدٌ بمنتقي الضمّة */
  var pre = null;
  if (key === DENT_CLASP_SVC_KEY && ctx && ctx.tooth && !fromTooth) {
    var ar = dentArchOf(ctx.tooth);
    cand = cand.filter(function (u) { return u.arch === ar; });
    if (!cand.some(function (u) { return !!u.id && dsvClaspUnit(u); })) { showToast('🛠 لا جهاز جزئي ب' + dentArchLabel(ar) + ' — الضمّة للجهاز الجزئي'); return true; }
    pre = parseInt(ctx.tooth, 10);
  }
  var ok = cand.filter(function (u) { return !dsvUnitWhy(u, kind, key); });
  if (!ok.length) {
    var first = cand.filter(function (u) { return !!u.id; })[0];
    showToast('🛠 ' + (first ? dsvUnitWhy(first, kind, key) : 'لا جهاز متحرك على المخطط — سجّل الجهاز أولاً (ولو «موجود مسبقاً»)'));
    return true;
  }
  if (ok.length === 1) { dsvBegin(ok[0], key, label, kind, null, pre); return true; }
  dsvOpenDialog({ view: 'units', units: ok, unitId: null, key: key, label: label, teeth: [], pre: pre });
  return true;
}
function dsvPickUnit(ov, unitId) {
  if (dsvLocked()) return;
  var st = ov._dsv, u = dsvUnit(unitId), tr = getTreatment(st.key), kind = dsvKind(tr);
  var why = kind ? dsvUnitWhy(u, kind, st.key) : 'الخدمة لم تعد بقائمة العلاجات';
  if (why) { showToast('🛠 ' + why); return; }
  dsvBegin(u, st.key, st.label, kind, ov, st.pre);
}
function dsvPickTx(ov, key) {
  if (dsvLocked()) return;
  var st = ov._dsv, u = dsvUnit(st.unitId), tr = getTreatment(key), kind = dsvKind(tr);
  var why = kind ? dsvUnitWhy(u, kind, key) : 'الخدمة لم تعد بقائمة العلاجات';
  if (why) { showToast('🛠 ' + why); return; }
  if (typeof bumpTxUsage === 'function') bumpTxUsage(key);
  dsvBegin(u, key, tr.name, kind, ov);
}
/* بعد معرفة الخدمة والجهاز: «إضافة سن» تمرّ بمنتقي السن، وغيرُها يذهب لخطوة التكلفة */
function dsvBegin(u, key, label, kind, ov, pre) {
  if (kind === 'add') {
    var state = { view: 'add', unitId: u.id, key: key, label: label, teeth: [] };
    if (ov) { ov._dsv = state; dsvRender(ov); } else dsvOpenDialog(state);
    return;
  }
  if (dsvClaspPick(u, key)) {   /* v741: خدمةُ الضمّة تمرّ بسنّها */
    var cst = { view: 'clasp', unitId: u.id, key: key, label: label, teeth: (pre && dentArchOf(pre) === u.arch && !dsvClaspWhy(u, pre)) ? [pre] : [] };
    if (ov) { ov._dsv = cst; dsvRender(ov); } else dsvOpenDialog(cst);
    return;
  }
  if (ov) dsvClose();
  pendingDentSvc = { key: key, label: label, kind: kind, unit: { id: u.id }, teeth: [], clasp: [], picking: false };
  dsvStep2();
}
function dsvConfirmClasp(ov) {
  if (dsvLocked()) return;
  var st = ov._dsv, u = dsvUnit(st.unitId);
  if (!u) { dsvClose(); return; }
  var teeth = st.teeth.filter(function (t) { return !dsvClaspWhy(u, t); });
  if (!teeth.length) { showToast('⚠️ اختر سناً واحداً على الأقل'); return; }
  dsvClose();
  pendingDentSvc = { key: st.key, label: st.label, kind: 'service', unit: { id: u.id }, teeth: [], clasp: dentSortTeeth(teeth, u.arch), picking: false };
  dsvStep2();
}
function dsvConfirmAdd(ov) {
  if (dsvLocked()) return;
  var st = ov._dsv, u = dsvUnit(st.unitId);
  if (!u) { dsvClose(); return; }
  var teeth = st.teeth.filter(function (t) { return dsvToothState(u, t).ok; });
  if (!teeth.length) { showToast('⚠️ اختر سناً واحداً على الأقل'); return; }
  dsvClose();
  pendingDentSvc = { key: st.key, label: st.label, kind: 'add', unit: { id: u.id }, teeth: dentSortTeeth(teeth, u.arch), clasp: [], picking: false };
  dsvStep2();
}
/* الخطوةُ الثانية = خطوةُ «علاج الفك» القائمة حرفياً (التكلفة · الحالة · الطبيب · التاريخ · زر المخبر)، بعنوانٍ يسمّي الجهاز */
function dsvStep2() {
  var p = pendingDentSvc; if (!p) return;
  if (dsvLocked()) { pendingDentSvc = null; return; }   /* وضعٌ بدأ بين النافذة والخطوة — لا خطوةَ بلا حارس حفظها */
  var u = dsvUnit(p.unit.id); if (!u) { pendingDentSvc = null; return; }
  if (window.SyDenture) window.SyDenture.clearPending();   /* سياقُ جهازٍ متروك لا يخطف الحفظ */
  pendingToothStatus = p.key; pendingToothLabel = p.label;
  pendingRegionalType = 'arch';
  pendingRegionalArches = [u.arch]; pendingRegionalArch = u.arch;
  pendingRegionalQuadrant = null; pendingRegionalQuadrants = [];
  proceedToRegionalStep2(p.key, p.label);
  var ti = document.getElementById('toothStep2Title');
  if (ti) ti.textContent = '🛠 ' + p.label + ' — ' + dentUnitName(u) + ' (' + dentAreaText(u.arch, u.teeth) + ')'
    + (p.kind === 'add' ? ' — إضافة ' + dentTeethPhrase(p.teeth) : '')
    + ((p.clasp && p.clasp.length) ? ' — ' + dentClaspPhrase(p.clasp) : '');
  /* إضافةٌ على سنٍّ قلعُه مخطّط لا تُسجَّل إلا مخطّطة ⇒ الخطوةُ تُفتح على «مخطّط» (درس v724) */
  if (p.kind === 'add' && typeof pickStatus === 'function' && p.teeth.some(function (t) { return !!dsvToothState(u, t).imm; })) pickStatus('planned');
}

/* ═════════════════════ الحفظ ═════════════════════ */
/* حارسُ المسار: السياقُ صالحٌ فقط إن كانت الخطوةُ الثانية هي خطوةُ هذه الخدمة نفسها — سياقٌ متروك لا يُطلق حفظاً */
function dsvSaveReady() {
  var p = pendingDentSvc;
  return !!(p && !p.picking && p.unit && p.unit.id
    && pendingRegionalType === 'arch' && pendingToothStatus === p.key && !currentTooth && !window.__batchMode && !window.__examMode);
}
/* صفوفُ الأسنان المضافة: بمعرّف الوحدة ومفتاحها وحالتها — إدراجٌ لا دمج (صفٌّ قائم على السن يُسقط العملية). يعيد '' أو الخطأ */
async function dsvWriteAdd(u, teeth, providerId, pid) {
  var rows = teeth.map(function (t) {
    return { doctor_id: currentUser.id, patient_id: pid || patientId, tooth_num: String(t), surface: DENT_SURFACE,
             treatment_key: u.key, status: u.st, provider_id: providerId || null, unit_id: u.id, review_at: null };
  });
  var r = await window.sb.from('teeth_status').insert(rows);
  if (r && r.error) return r.error.message || 'تعذّر حفظ صفوف الجهاز';
  teeth.forEach(function (t) { dentureMap[String(t)] = { key: u.key, st: u.st, unit: u.id, prov: providerId || null }; });
  return '';
}
async function dsvSave(cost, units, date, notes) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var p = pendingDentSvc; if (!p) return;
  var status = pendingTreatStatus, key = p.key, label = p.label;
  if (status !== 'completed' && status !== 'planned') { showToast('🛠 خدمة الجهاز تُسجَّل «منجز» أو «مخطّط» فقط'); return; }
  /* إعادةُ التحقّق لحظةَ الحفظ: المخططُ قد يتغيّر بين النافذة والحفظ */
  var u = dsvUnit(p.unit.id), why = dsvUnitWhy(u, p.kind, p.key);
  if (why) { showToast('⚠️ تغيّر المخطط — ' + why); return; }
  var add = [];
  if (p.kind === 'add') {
    add = p.teeth.slice();
    if (!add.length) { showToast('⚠️ اختر سناً واحداً على الأقل'); return; }
    for (var i = 0; i < add.length; i++) {
      var ts = dsvToothState(u, add[i]);
      if (!ts.ok) { showToast('⚠️ تغيّر المخطط — السن ' + add[i] + ': ' + ts.why); return; }
    }
    var imm = add.filter(function (t) { return !!dsvToothState(u, t).imm; });
    if (imm.length && status !== 'planned') {
      showToast('🦷 ' + (imm.length === 1 ? 'السن ' + imm[0] + ' قلعه' : 'الأسنان ' + imm.join('، ') + ' قلعها') + ' مخطّط — سجّل الإضافة «مخطّط»، أو أنجز القلع أولاً');
      return;
    }
  }
  /* v741: سنُّ الضمّة يُعاد فحصُه لحظةَ الحفظ — سنٌّ قُلع أو دخل الجهاز بين النافذة والحفظ يوقف الحفظ بسببه */
  var clasp = (p.clasp || []).slice();
  for (var ck = 0; ck < clasp.length; ck++) {
    var cwhy = dsvClaspWhy(u, clasp[ck]);
    if (cwhy) { showToast('⚠️ تغيّر المخطط — السن ' + clasp[ck] + ': ' + cwhy); return; }
  }
  var area = clasp.length ? dentArchLabel(u.arch) + ' — ' + dentClaspPhrase(clasp) : dentAreaText(u.arch, add.length ? add : u.teeth);
  var payload = {
    doctor_id: currentUser.id, patient_id: patientId,
    type: label, description: area,
    cost: cost, date: date, notes: notes,
    tooth_num: null, surface: null, arch: u.arch,
    status: status, provider_id: pendingProviderId,
    treatment_key: getTreatment(key) ? key : null,
    currency: window.SyDentCurPick.read('toothCost'),
    denture_unit: u.id                                   /* M208 */
  };
  if (units > 1) payload.units = units;
  if (add.length) payload.denture_add = dentTeethCsv(add);
  var rS = await window.sb.from('ledger_sessions').insert(payload).select().single();
  if (rS.error || !rS.data) {
    console.error('denture service ledger insert error:', rS.error);
    var em = (rS.error && (rS.error.message || '')) || '';
    showToast(/denture_unit|denture_add/.test(em) ? '⚠️ خدمات الجهاز تحتاج تحديث قاعدة البيانات — حدّث الصفحة وأعد المحاولة' : '⚠️ تسجيل الجلسة فشل' + (em ? ': ' + em : ''));
    return;   /* الخطوةُ وسياقُها يبقيان (إعادةُ المحاولة أو الإلغاء) */
  }
  var sess = rS.data, drew = false;
  if (add.length && status === 'completed') {
    var wErr = await dsvWriteAdd(u, add, pendingProviderId);
    if (wErr) {
      /* الجلسةُ بلا رسمها نصفُ حفظ ⇒ تُسحب، والفشلُ يُعلَن */
      var rb = await window.sb.from('ledger_sessions').delete().eq('id', sess.id).eq('doctor_id', currentUser.id);
      if (rb && rb.error) console.error('denture service rollback error:', rb.error);
      showToast('⚠️ تعذّر إضافة السن لرسم الجهاز (' + wErr + ') — لم تُحفظ الجلسة');
      return;
    }
    drew = true;
  }
  /* v741: ضمّةُ سنٍّ جديد تدخل رسمَ الجهاز مع الجلسة المنجزة (قائمةُ الطبيب = المرسومُ الآن + الجديد). عرضيٌّ بحت: تعذّرُ الرسم لا
     يسحب الجلسة — يُعلَن والطبيبُ يضيفها من قسم «الضمّات». المخطّطةُ لا ترسم. */
  var claspNew = [], claspDrew = false;
  if (clasp.length) {
    var claspCur = dentClasps(u);
    claspNew = clasp.filter(function (t) { return claspCur.indexOf(t) === -1; });
    if (claspNew.length && status === 'completed') claspDrew = await dentClaspSave(u, claspCur.concat(claspNew));
  }
  sessions.unshift(sess); sortByDateDesc(sessions);
  if (window.logAudit) {
    window.logAudit('session.create', {
      entityId: sess.id, patientId: patientId, patientName: (patient && patient.name) || '',
      description: 'إضافة جلسة (' + area + '): ' + label + ' — ' + cost + ' ' + _rowLbl(sess),
      newValue: { type: label, cost: cost, date: date, status: status, provider_id: pendingProviderId, scope: 'denture_service', unit: u.id, add: add.join(','), clasp: clasp.join(',') }
    });
  }
  await reallocatePatientFunds();
  var upd = {};
  if (!patient.last_visit || date > patient.last_visit) upd.last_visit = date;
  if (patient.status === 'جديد') upd.status = 'تحت العلاج';
  if (Object.keys(upd).length) {
    await window.sb.from('patients').update(upd).eq('id', patientId).eq('doctor_id', currentUser.id);
    Object.assign(patient, upd);
  }
  renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();
  var openLab = (typeof _regOpenLabAfterSave !== 'undefined') && _regOpenLabAfterSave === true;
  pendingDentSvc = null;
  pendingRegionalType = null; pendingRegionalQuadrant = null; pendingRegionalQuadrants = []; pendingRegionalArch = null; pendingRegionalArches = [];
  closeModal('toothModal');
  var unitName = dentUnitName(u);
  if (openLab) {
    openLabOrderModal({
      session_id: sess.id, treatment_key: key,
      notes: unitName + ' — ' + dentAreaText(u.arch, u.teeth) + (add.length ? ' — إضافة ' + dentTeethPhrase(add) : '') + (clasp.length ? ' — ' + dentClaspPhrase(clasp) : '') + (notes ? ' — ' + notes : ''),
      provider_id: pendingProviderId || null,
      draft: status !== 'completed'
    });
    showToast('✅ تم تسجيل ' + label + ' — ' + area + ' — أكمل بيانات المخبر');
  } else if (add.length) {
    showToast(drew ? '✅ تم تسجيل ' + label + ' — أُضيف ' + dentTeethPhrase(add) + ' لرسم الجهاز'
      : '✅ تم تسجيل ' + label + ' مخطّطاً — ' + dentTeethPhrase(add) + ' يُضاف لرسم الجهاز عند الإنجاز');
  } else if (clasp.length) {
    var cph = dentClaspPhrase(clasp);
    if (status !== 'completed') showToast('✅ تم تسجيل ' + label + ' مخطّطاً — ' + cph + (claspNew.length ? ' — أضفها لرسم الجهاز من قسم «الضمّات» عند الإنجاز' : ''));
    else if (!claspNew.length) showToast('✅ تم تسجيل ' + label + ' — ' + cph);
    else if (claspDrew) showToast('✅ تم تسجيل ' + label + ' — ' + cph + ' — أُضيفت لرسم الجهاز');
    else showToast('⚠️ تم تسجيل ' + label + ' — ' + cph + ' — تعذّر تحديث رسم الجهاز، أضفها من قسم «الضمّات»');
  } else {
    showToast('✅ تم تسجيل ' + label + ' — ' + unitName + ' (' + dentArchLabel(u.arch) + ')');
  }
  if (status === 'completed' && typeof maybePromptMaterialDeduction === 'function') {
    /* v733: نموذجُ المخبر فُتح للتوّ ⇒ سؤالُ الخصم يُؤجَّل لإغلاقه (closeModal('labOrderModal')) — لا نافذتان فوق بعض (نمطُ مسار السن) */
    if (openLab) window._pendingMatDeduct = { k: key, l: label, m: 1, s: [sess.id] };
    else {
      try { await maybePromptMaterialDeduction(key, label, 1, [sess.id]); }
      catch (e) { console.warn('denture service material deduction skipped:', e); }
    }
  }
}

/* ═════════════════════ خطّافاتُ الجلسة: الإنجاز والحذف ═════════════════════ */
/* إنجازُ «إضافة سن» مخطّطة يُدرج أسنانَها بالجهاز — مرآتُه بصفحة المواعيد (_apptDentureAddOnComplete). خدمةٌ بلا أسنان = صفر مساس */
async function dsvOnSessionComplete(sess) {
  if (!dsvIsSession(sess)) return false;
  var add = dsvTeeth(sess); if (!add.length) return false;
  var u = dsvUnit(sess.denture_unit);
  if (!u || u.st === 'planned') return false;
  var ok = add.filter(function (t) { return dsvToothState(u, t).ok; });
  if (!ok.length) return false;
  var err = await dsvWriteAdd(u, ok, sess.provider_id || null, sess.patient_id);
  if (err) { console.warn('dsvOnSessionComplete warn:', err); if (window.SyDenture && window.SyDenture.markDrawFail) window.SyDenture.markDrawFail(sess.id); return false; }   /* v737: خطأُ كتابة ⇒ الجلسةُ تعود مخطّطة */
  return true;
}
/* نصٌّ يُلحق برسالة الإنجاز: سنٌّ لم يدخل الرسم (الجهازُ أُزيل أو السنُّ تغيّر) أو دخله وقلعُه ما زال مخطّطاً — فارغٌ لغير ذلك */
function dsvCompleteNote(sess) {
  if (!dsvIsSession(sess)) return '';
  var add = dsvTeeth(sess); if (!add.length) return '';
  var u = dsvUnit(sess.denture_unit);
  var out = add.filter(function (t) { return !u || u.teeth.indexOf(t) === -1; });
  if (out.length) return '⚠️ ' + dentTeethPhrase(out) + ' لم يُضف لرسم الجهاز — ' + (u ? 'السن لا يقبل الإضافة الآن' : 'الجهاز لم يعد على المخطط');
  var open = dentOpenExtractions(add);
  return open.length ? '⚠️ قلع ' + dentTeethPhrase(open) + ' ما زال مخطّطاً — أنجزه ليظهر سنُّ الجهاز' : '';
}
/* حذفُ «إضافة سن» منجزة يعيد رسمَ الجهاز كما كان قبلها (لا زرَّ إزالةٍ لسنٍّ مفرد)؛ المخطّطةُ لم ترسم شيئاً */
async function dsvOnSessionDeleted(sess) {
  if (!dsvIsSession(sess) || (sess.status || 'completed') !== 'completed') return false;
  var add = dsvTeeth(sess).filter(function (t) { var d = dentureMap[String(t)]; return !!d && d.unit === sess.denture_unit; });
  if (!add.length) return false;
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', sess.patient_id || patientId)
    .eq('unit_id', sess.denture_unit).eq('surface', DENT_SURFACE).in('tooth_num', add.map(String));
  if (d && d.error) { console.warn('dsvOnSessionDeleted warn:', d.error); return false; }
  add.forEach(function (t) { delete dentureMap[String(t)]; });
  return true;
}

/* ═════════════════════ الشريط ونافذةُ السن ═════════════════════ */
/* شرائحُ الأجهزة المرسومة تصير أزراراً تفتح نافذةَ الجهاز (الشرائحُ المعلّقة لا). تُستدعى بعد رسم الشريط — بلا جهاز صفرُ أثر */
function dsvDecorate(bar, units) {
  if (!bar || !units || !units.length || window.__historyMode) return;
  var chips = bar.querySelectorAll('.dent-chip:not(.dent-chip-pend)');
  for (var i = 0; i < chips.length && i < units.length; i++) {
    var u = units[i], chip = chips[i];
    if (!u.id) continue;
    var n = dsvSessions(u).length;
    chip.classList.add('dsv-chip');
    chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0');
    chip.setAttribute('data-dsv-open', String(u.id));
    chip.setAttribute('title', 'خدمات الجهاز: تبطين · إصلاح · إضافة سن');
    if (dsvClaspUnit(u)) chip.setAttribute('title', 'الضمّات وخدمات الجهاز: تبطين · إصلاح · إضافة سن');
    chip.insertAdjacentHTML('beforeend', '<span class="dsv-badge">🛠' + (n ? ' ' + n : '') + '</span>');
  }
  if (bar._dsvBound) return;
  bar._dsvBound = 1;
  var go = function (e) {
    var c = e.target && e.target.closest ? e.target.closest('[data-dsv-open]') : null; if (!c) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    dsvOpen(c.getAttribute('data-dsv-open'));
  };
  bar.addEventListener('click', go); bar.addEventListener('keydown', go);
}
/* v745 (المالك 17/11/2026: «ما في إلغاء ضمّة»): نافذةُ السن القائم بفكٍّ عليه جهازٌ جزئي — «✕ إلغاء الضمّة» على سنٍّ مرسومةٍ
   عليه ضمّة، و«＋ ضمّة على الرسم» على سنٍّ يحملها بلا ضمّة. رسمٌ فقط بلا جلسة، كقسم «الضمّات» بنافذة الجهاز. */
function dsvClaspToothUnit(n) {
  n = parseInt(n, 10);
  var us = dentUnits().filter(function (u) { return !!u.id && u.arch === dentArchOf(n) && dsvClaspUnit(u) && u.teeth.indexOf(n) === -1; });
  if (us.length === 1) return us[0];
  return us.filter(function (u) { return dentClasps(u).indexOf(n) !== -1; })[0] || null;   /* جهازان جزئيان بالفك: الإلغاءُ وحده */
}
function dsvClaspBtnHtml(n) {
  if (window.__regionalPickerMode || window.__examMode || window.__batchMode || window.__historyMode || window.__draftMode) return '';
  n = parseInt(n, 10);
  if (!(n >= 11 && n <= 48) || dentHas(n) || !dentClaspOk(n)) return '';
  var u = dsvClaspToothUnit(n); if (!u) return '';
  var has = dentClasps(u).indexOf(n) !== -1;
  return '<button class="topt dsv-clasp-tbtn" title="' + (has ? 'يزيل ضمّة هذا السن عن رسم الجهاز — بلا جلسة' : 'يرسم ضمّةً للجهاز على هذا السن — بلا جلسة') + '" onclick="dsvClaspFromTooth(' + n + ')">'
    + (has ? '✕ إلغاء الضمّة' : '＋ ضمّة على الرسم') + '</button>';
}
async function dsvClaspFromTooth(n) {
  n = parseInt(n, 10);
  if (dsvLocked()) return;
  var u = dsvClaspToothUnit(n);
  if (!u || !dentClaspOk(n)) { showToast('🦷 الجهاز لم يعد على المخطط'); return; }
  var had = dentClasps(u).indexOf(n) !== -1;
  if (typeof closeModal === 'function') closeModal('toothModal');
  if (await dentClaspToggle(u, n)) showToast(had ? '✓ أُلغيت ضمّة السن ' + n : '✓ رُسمت ضمّة على السن ' + n);
}
function dsvBtnHtml(n) {
  var u = dentUnitOf(n); if (!u || !u.id) return '';
  return '<button class="topt dsv-open" style="font-weight:700;" title="تبطين · إصلاح · إضافة سن — وسجلُّ خدمات الجهاز" onclick="dsvOpenFromTooth(' + parseInt(n, 10) + ')">🛠 خدمات الجهاز</button>';
}

/* الواجهةُ التي تقرؤها باقي ملفات الصفحة — كلُّ نداءٍ لها محروسٌ بوجودها (window.SyDentSvc &&) */
window.SyDentSvc = {
  kind: dsvKind, isTreatment: dsvIsTreatment, isSession: dsvIsSession, teeth: dsvTeeth, sessions: dsvSessions,
  start: dsvStart, open: dsvOpen, clearPending: dsvClearPending,
  saveReady: dsvSaveReady, save: dsvSave,
  onSessionComplete: dsvOnSessionComplete, completeNote: dsvCompleteNote, onSessionDeleted: dsvOnSessionDeleted,
  decorate: dsvDecorate, btnHtml: dsvBtnHtml, claspBtnHtml: dsvClaspBtnHtml
};
