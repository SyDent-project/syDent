/* ═════════════════════════════════════════════════════════════════════
   SyDent — pp-consent.js (M219 · أ2): موافقاتُ العلاج من بطاقة المريض
   ─────────────────────────────────────────────────────────────────────
   الدورة: علاجٌ له نصُّ موافقة (صفحة العلاجات) يدخل الخطةَ المعتمدة «مخطّطاً» ⇒ consent_sync تولّد للمريض موافقةً
   معلَّقة بنسخةٍ من النص ⇒ المريضُ يوقّعها من بوابته (أ3) ⇒ تظهر هنا موقَّعةً للعرض والطباعة.
   - المصدرُ القاعدة: consent_sync(patient) تُستدعى عند الفتح وعند تغيّر الجلسات المخطّطة (renderTimeline
     نقطةُ المرور) — idempotent، وتُعيد صفراً بوضع القراءة فلا كتابة.
   - الموافقةُ تُوقَّع قبل التنفيذ: المخطّطُ وحده يولّد موافقة (M225 — تصحيحُ المالك). علاجٌ يُسجَّل «منجزاً» مباشرةً
     وله نصُّ موافقة لا يأخذ موافقةً لاحقة؛ يُنبَّه عنه مرةً (تنبيهٌ بلا منع).
   - لحظةَ تولّد موافقةٍ جديدة بعد تغيير الخطة يظهر حوارٌ حيث يعمل الطبيب (المخطط السنّي بعيدٌ عن صفّ الموافقات):
     «التوقيع الآن على هذا الجهاز» (تُفتح بوابةُ المريض على الموافقة نفسها) · «إرسال الرابط» · «لاحقاً».
   - الصفُّ مخفيٌّ ما دام المريضُ بلا موافقات (عيادةٌ لا تستعمل الميزة لا ترى شيئاً).
   - الكتابةُ الوحيدة هنا «إلغاء» موافقةٍ معلَّقة (status = void). الموقَّعة لا تُعدَّل ولا تُحذف (زنادُ القاعدة).
   - التوقيعُ صورةٌ تُجلب عند العرض/الطباعة فقط (لا تُحمَّل مع القائمة).
   يُحمَّل بعد pp-portal.js. يعتمد على: patient · patientId · currentUser · sessions · showToast · escapeHtml ·
   fmtD · openModal · closeModal · logAudit · SyDialog · ppPortalSend. صفرُ مستمعات addEventListener.
   ═════════════════════════════════════════════════════════════════════ */
var PP_CONSENTS = null;          /* null = لم تُحمَّل بعد */
var PP_CONSENT_OK = false;       /* الجدولُ موجود (بعد الهجرة) */
var _ppConsentBusy = false;
var _ppConsentSig = null;        /* بصمةُ الجلسات المخطّطة عند آخر مزامنة */
var _ppConsentTimer = null;
var PP_CONSENT_SELECT = 'id, treatment_key, treatment_name, title, body, teeth, status, auto, session_ids, created_at, signed_at, signer_name, signer_relation, voided_at';
var _ppConsentWarned = {};       /* موافقاتٌ نُبّه لإنجاز علاجها بلا توقيع (مرةً لكل موافقة) */
var _ppConsentAsked = {};        /* موافقاتٌ عُرض حوارُها (مرةً لكل موافقة بهذه الصفحة) */
var _ppConsentAsking = false;
var PP_CONSENT_KEYS = null;      /* مفاتيحُ العلاجات التي لها نصُّ موافقة بهذه العيادة ({key: true}) — null = لم تُحمَّل */
var _ppConsentBase = null;       /* جلساتٌ كانت موجودةً عند فتح البطاقة — لا يُنبَّه عن قديمها */
var _ppConsentBare = {};         /* جلساتٌ نُبّه لتسجيلها منجزةً بلا موافقة */

function ppConsentWhen(iso) {
  if (!iso) return '';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  var d = (typeof fmtD === 'function') ? fmtD(iso) : String(iso).slice(0, 10);
  var hh = t.getHours(), mm = t.getMinutes();
  return d + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
/* بصمةُ ما يهمّ التوليد: الجلساتُ المخطّطة (المعرّف · مفتاح العلاج · البديل) — تغيّرُها وحده يستدعي المزامنة */
function ppConsentPlanSig() {
  var list = (typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : [];
  return list.filter(function (s) { return s && (s.status || 'completed') === 'planned' && !s.parent_id; })
    .map(function (s) { return s.id + ':' + (s.treatment_key || '') + ':' + (s.plan_option == null ? '' : s.plan_option); })
    .sort().join('|');
}
function ppConsentCounts() {
  var p = 0, s = 0;
  (PP_CONSENTS || []).forEach(function (c) { if (c.status === 'pending') p++; else if (c.status === 'signed') s++; });
  return { pending: p, signed: s };
}

/* ── التحميل: مزامنةٌ ثم قراءة ─────────────────────────────────────────── */
async function ppConsentLoad(force) {
  if (!currentUser || !patientId) return;
  if (Array.isArray(PP_CONSENTS) && !force) { ppConsentRender(); return; }
  if (_ppConsentBusy) return;
  _ppConsentBusy = true;
  var first = !Array.isArray(PP_CONSENTS);   /* الفتحُ الأول خطُّ أساسٍ صامت؛ ما يتولّد بعده (علاجٌ خُطّط للتوّ) يُعرض حوارُه مرةً */
  var known = {}; (PP_CONSENTS || []).forEach(function (c) { known[c.id] = true; });
  var fresh = [];
  try {
    _ppConsentSig = ppConsentPlanSig();
    if (first) {
      _ppConsentBase = {};
      ((typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : []).forEach(function (s) { if (s && s.id) _ppConsentBase[s.id] = true; });
      ppConsentLoadKeys();   /* غيرُ حاجب — يخدم تنبيهَ «منجزٌ بلا موافقة» وحده */
    }
    var sy = await window.sb.rpc('consent_sync', { p_patient: patientId });
    if (sy.error && !/42883|PGRST202|does not exist|schema cache/i.test((sy.error.message || '') + ' ' + (sy.error.code || ''))) console.warn('consent_sync:', sy.error);
    var r = await window.sb.from('patient_consents').select(PP_CONSENT_SELECT)
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(100);
    if (r.error) {
      if (!/42P01|PGRST205|does not exist|schema cache/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) console.warn('patient_consents load:', r.error);
      PP_CONSENTS = []; PP_CONSENT_OK = false;
    } else {
      PP_CONSENTS = r.data || []; PP_CONSENT_OK = true; ppConsentWarnDone(first);   /* ما أُنجز قبل الفتح لا يُنبَّه عنه — الصفُّ يعرضه معلَّقاً */
      if (first) PP_CONSENTS.forEach(function (c) { _ppConsentAsked[c.id] = true; });   /* ما وُجد عند الفتح يعرضه الصفُّ بلا حوار */
      else fresh = PP_CONSENTS.filter(function (c) { return c.status === 'pending' && !known[c.id] && !_ppConsentAsked[c.id]; });
    }
  } catch (e) { console.warn('patient_consents:', e); PP_CONSENTS = []; PP_CONSENT_OK = false; }
  _ppConsentBusy = false;
  ppConsentRender();
  var m = document.getElementById('ppConsentModal');
  if (m && m.classList.contains('open')) ppConsentRenderList();
  if (fresh.length) ppConsentAsk(fresh);
}
/* مفاتيحُ العلاجات ذات نصّ الموافقة — قراءةٌ واحدة بنطاق المالك؛ الفشلُ أو غيابُ الجدول ⇒ لا تنبيه */
async function ppConsentLoadKeys() {
  try {
    var r = await window.sb.from('consent_templates').select('treatment_key').eq('owner_id', currentUser.id).limit(500);
    if (r.error) return;
    var k = {}; (r.data || []).forEach(function (t) { if (t && t.treatment_key) k[t.treatment_key] = true; });
    PP_CONSENT_KEYS = k;
  } catch (e) {}
}
/* حوارُ الموافقة الجديدة — يظهر حيث يعمل الطبيب لحظةَ تخطيط العلاج. مرةً لكل موافقة؛ «لاحقاً» تُبقيها معلَّقةً بالصف. */
function ppConsentAskText(list) {
  var nm = function (c) { return '«' + (c.treatment_name || c.title || '') + '»' + (c.teeth ? ' (السن ' + ((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.list(c.teeth) : c.teeth) + ')' : ''); };
  if (list.length === 1) return 'علاج ' + nm(list[0]) + ' يحتاج موافقة المريض قبل التنفيذ.';
  return list.length + ' علاجات تحتاج موافقة المريض قبل التنفيذ: ' + list.map(nm).join('، ') + '.';
}
async function ppConsentAsk(list) {
  list = (list || []).filter(function (c) { return c && c.status === 'pending' && !_ppConsentAsked[c.id]; });
  if (!list.length || _ppConsentAsking) return;
  list.forEach(function (c) { _ppConsentAsked[c.id] = true; });
  var txt = ppConsentAskText(list);
  if (!window.SyDialog || typeof window.SyDialog.choose !== 'function') { showToast('✍️ ' + txt); return; }
  _ppConsentAsking = true;
  var pick = null;
  try {
    /* إشعارُ «تمت الإضافة» ما زال ظاهراً أسفل الشاشة — على الهاتف يقع فوق زر «لاحقاً»؛ يُطوى ليبقى الحوارُ مقروءاً كلَّه */
    var tst = document.getElementById('syToast'); if (tst) tst.classList.remove('show');
    pick = await window.SyDialog.choose({ title: '✍️ موافقة المريض مطلوبة', message: txt, cancelText: 'لاحقاً', choices: [
      { label: '✍️ التوقيع الآن على هذا الجهاز', sub: 'تُفتح الموافقة ليقرأها المريض ويوقّعها هنا' },
      { label: '📱 إرسال رابط البوابة للمريض', sub: 'يوقّعها من هاتفه' }] });
  } catch (e) { pick = null; }
  _ppConsentAsking = false;
  if (pick === 0) ppConsentSignHere(list[0].id);
  else if (pick === 1) ppConsentSend();
}
/* التوقيعُ على جهاز العيادة: بوابةُ المريض نفسُها بتبويبٍ جديد، مفتوحةً على هذه الموافقة (c=). النافذةُ تُفتح فوراً
   ضمن نقرة المستخدم ثم تُوجَّه بعد ضمان الرابط — وإلا حجبها المتصفحُ كنافذةٍ منبثقة. */
async function ppConsentSignHere(id) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (!patient || !patientId) return;
  if (typeof ppPortalEnsureLive !== 'function' || typeof ppPortalLink !== 'function') { showToast('⚠️ بوابة المريض غير متاحة على هذا الحساب'); return; }
  var w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  try {
    var row = await ppPortalEnsureLive();
    if (typeof ppPortalRender === 'function') ppPortalRender();
    var link = ppPortalLink(row.token) + (/^[0-9a-f-]{36}$/i.test(String(id || '')) ? '&c=' + id : '');
    if (w) { try { w.opener = null; } catch (e2) {} w.location.href = link; }
    else showToast('⚠️ المتصفح منع فتح النافذة — اسمح بالنوافذ المنبثقة لهذا الموقع، أو أرسل الرابط للمريض', true);
  } catch (e) {
    if (w) { try { w.close(); } catch (e3) {} }
    console.warn('ppConsentSignHere:', e);
    showToast(typeof ppPortalErr === 'function' ? ppPortalErr(e) : '❌ تعذّر فتح بوابة المريض', true);
  }
}
/* نقطةُ المرور (renderTimeline): الخطةُ تغيّرت ⇒ مزامنةٌ مؤجَّلة لحظةً (عدّةُ رسماتٍ متتالية = نداءٌ واحد) */
function ppConsentTouch() {
  if (!Array.isArray(PP_CONSENTS)) return;                 /* التحميلُ الأول لم ينتهِ بعد */
  ppConsentWarnDone();
  ppConsentWarnBare();
  if (ppConsentPlanSig() === _ppConsentSig) return;
  if (_ppConsentTimer) clearTimeout(_ppConsentTimer);
  _ppConsentTimer = setTimeout(function () { _ppConsentTimer = null; ppConsentLoad(true); }, 600);
}

/* أ4: علاجٌ أُنجز وموافقتُه ما زالت معلَّقة ⇒ تنبيهٌ واحد لحظةَ الإنجاز (بلا منع — قرار المالك). الموافقةُ تبقى معلَّقةً حتى تُوقَّع
   أو تُلغى (M221). silent: خطُّ الأساس عند التحميل — ما أُنجز قبل فتح البطاقة يعرضه الصفُّ ولا يُنبَّه عنه كلَّ مرة. */
function ppConsentWarnDone(silent) {
  var list = (typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : [];
  var done = {};
  list.forEach(function (s) { if (s && s.id && (s.status || 'completed') === 'completed') done[s.id] = true; });
  (PP_CONSENTS || []).forEach(function (c) {
    if (c.status !== 'pending' || _ppConsentWarned[c.id]) return;
    if (!(c.session_ids || []).some(function (id) { return done[id]; })) return;
    _ppConsentWarned[c.id] = true;
    if (!silent) showToast('⚠️ أُنجز العلاج وموافقته «' + (c.title || '') + '» لم تُوقَّع بعد', true);
  });
}

/* علاجٌ له نصُّ موافقة سُجّل «منجزاً» مباشرةً (لم يمرّ بالخطة، فلا موافقةَ له ولا تتولّد بعد التنفيذ) ⇒ تنبيهٌ واحد يدلّ
   على المسار الصحيح. جلساتُ ما قبل فتح البطاقة لا يُنبَّه عنها، ولا ما غطّته موافقة (معلَّقة · موقَّعة · ملغاة). */
function ppConsentWarnBare() {
  if (!PP_CONSENT_KEYS || !_ppConsentBase) return;
  var covered = {};
  (PP_CONSENTS || []).forEach(function (c) { (c.session_ids || []).forEach(function (id) { covered[id] = true; }); });
  ((typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : []).forEach(function (s) {
    if (!s || !s.id || s.parent_id || (s.status || 'completed') !== 'completed') return;
    if (_ppConsentBase[s.id] || _ppConsentBare[s.id] || covered[s.id] || !PP_CONSENT_KEYS[s.treatment_key]) return;
    _ppConsentBare[s.id] = true;
    showToast('⚠️ سُجّل العلاج منجزاً بلا موافقة موقَّعة — الموافقة تُوقَّع قبل التنفيذ: سجّله «مخطط» أولاً', true);
  });
}

function ppConsentRender() {
  var row = document.getElementById('consentRow'), el = document.getElementById('iConsent');
  if (!row || !el) return;
  var n = ppConsentCounts();
  if (!PP_CONSENT_OK || (!n.pending && !n.signed)) { row.style.display = 'none'; return; }
  row.style.display = '';
  /* الأزرارُ بسماتٍ حرفية — سجلُّ وضع القراءة بـcheck-mirrors يقرأ الاسمَ من المصدر */
  var h = '';
  if (n.pending) h += '<span class="pp-intake-st pp-intake-exp">✍️ بانتظار التوقيع: ' + n.pending + '</span>';
  if (n.signed)  h += '<span class="pp-intake-st pp-intake-new">✅ موقَّعة: ' + n.signed + '</span>';
  h += '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppConsentOpen()">عرض الموافقات</button>';
  if (n.pending) h += '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppConsentSignHere()" title="تُفتح بوابة المريض على هذا الجهاز ليوقّع">✍️ توقيع على هذا الجهاز</button>';
  if (n.pending) h += '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppConsentSend()" title="يوقّع المريض موافقاته المعلَّقة من بوابته">🔗 إرسال البوابة للتوقيع</button>';
  el.innerHTML = h;
}

/* ── القائمة ──────────────────────────────────────────────────────────── */
function ppConsentRenderList() {
  var box = document.getElementById('ppConsentList');
  if (!box) return;
  var list = (PP_CONSENTS || []).slice().sort(function (a, b) {
    var o = { pending: 0, signed: 1, void: 2 };
    return (o[a.status] - o[b.status]) || String(b.created_at).localeCompare(String(a.created_at));
  });
  if (!list.length) { box.innerHTML = '<div class="pp-intake-none">لا موافقات لهذا المريض.</div>'; return; }
  box.innerHTML = list.map(function (c) {
    var st = c.status === 'signed'
      ? '<span class="tone tone-green ppc-st">✅ موقَّعة</span>'
      : (c.status === 'void' ? '<span class="tone tone-gray ppc-st">ملغاة</span>' : '<span class="tone tone-yellow ppc-st">✍️ بانتظار التوقيع</span>');
    var meta = [];
    if (c.treatment_name) meta.push('العلاج: ' + c.treatment_name);
    if (c.teeth) meta.push('السن: ' + ((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.list(c.teeth) : c.teeth));
    meta.push('أُنشئت ' + ppConsentWhen(c.created_at));
    if (c.status === 'signed') meta.push('وقّعها ' + (c.signer_name || '') + (c.signer_relation ? ' (' + c.signer_relation + ')' : '') + ' — ' + ppConsentWhen(c.signed_at));
    if (c.status === 'void' && c.voided_at) meta.push('أُلغيت ' + ppConsentWhen(c.voided_at));
    var acts = (c.status === 'pending' ? '<button type="button" class="sy-act sy-act-primary" onclick="ppConsentSignHere(\'' + c.id + '\')" title="تُفتح بوابة المريض على هذا الجهاز ليوقّع">✍️ توقيع على هذا الجهاز</button>' : '')
      + '<button type="button" class="sy-act" onclick="ppConsentPrint(\'' + c.id + '\')">🖨️ طباعة</button>'
      + (c.status === 'pending' ? '<button type="button" class="sy-act sy-act-danger" onclick="ppConsentVoid(\'' + c.id + '\')" title="إلغاء هذه الموافقة المعلَّقة — لن تظهر للمريض">إلغاء</button>' : '');
    return '<div class="ppc-item' + (c.status === 'void' ? ' ppc-void' : '') + '">'
      + '<div class="ppc-head"><span class="ppc-title">' + escapeHtml(c.title || '') + '</span>' + st + '</div>'
      + '<div class="ppc-meta">' + escapeHtml(meta.join(' · ')) + '</div>'
      + '<details class="ppc-text"><summary>نصّ الموافقة</summary><div class="pp-intake-txt">' + escapeHtml(c.body || '') + '</div></details>'
      + '<div class="ppc-acts sy-acts">' + acts + '</div>'
      + '</div>';
  }).join('');
}
function ppConsentOpen() {
  if (!Array.isArray(PP_CONSENTS)) return;
  ppConsentRenderList();
  openModal('ppConsentModal');
}
function ppConsentById(id) {
  return (PP_CONSENTS || []).find(function (c) { return c.id === id; }) || null;
}

/* ── الإرسال: التوقيعُ من بوابة المريض — نفسُ رابطها ومودالِ رسالتها ─────── */
function ppConsentSend() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (typeof ppPortalSend !== 'function') { showToast('⚠️ بوابة المريض غير متاحة على هذا الحساب'); return; }
  try { closeModal('ppConsentModal'); } catch (e) {}
  ppPortalSend();
}

/* ── إلغاءُ موافقةٍ معلَّقة ────────────────────────────────────────────── */
async function ppConsentVoid(id) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var c = ppConsentById(id);
  if (!c || c.status !== 'pending' || _ppConsentBusy) return;
  if (!await SyDialog.confirm({ title: 'إلغاء الموافقة', message: 'ستُلغى الموافقة المعلَّقة «' + (c.title || '') + '» ولن تظهر للمريض، ولا تُنشأ من جديد لهذا العلاج. متابعة؟', danger: true, confirmText: 'إلغاء الموافقة', cancelText: 'تراجع' })) return;
  _ppConsentBusy = true;
  try {
    var u = await window.sb.from('patient_consents').update({ status: 'void' })
      .eq('id', id).eq('owner_id', currentUser.id).eq('status', 'pending')
      .select(PP_CONSENT_SELECT).single();
    if (u.error) throw u.error;
    PP_CONSENTS = (PP_CONSENTS || []).map(function (x) { return x.id === id ? u.data : x; });
    ppConsentRender(); ppConsentRenderList();
    showToast('أُلغيت الموافقة ✓');
    if (typeof window.logAudit === 'function') {
      try {
        window.logAudit('patient.consent_void', { entityType: 'patient', entityId: patientId, patientId: patientId, patientName: patient && patient.name,
          description: 'إلغاء موافقة معلَّقة: ' + (c.title || '') + (c.teeth ? ' — السن ' + ((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.list(c.teeth) : c.teeth) : '') });
      } catch (e2) {}
    }
  } catch (e) {
    console.warn('ppConsentVoid:', e);
    showToast(/subscription_read_only|sub_gate|row-level security/i.test((e && e.message) || '') ? '⚠️ حسابك بوضع القراءة — لا يمكن الإلغاء' : '⚠️ تعذّر الإلغاء — تحقّق من الاتصال وحاول ثانيةً', true);
  }
  _ppConsentBusy = false;
}

/* ── الطباعة: النصُّ كما هو محفوظ + التوقيعُ إن وُجد (يُجلب الآن فقط) ────── */
async function ppConsentPrint(id) {
  var c = ppConsentById(id);
  if (!c) return;
  var w = window.open('', '_blank');
  if (!w) { showToast('اسمح بالنوافذ المنبثقة للطباعة', true); return; }
  var sig = null;
  if (c.status === 'signed') {
    try {
      var r = await window.sb.from('patient_consents').select('signature').eq('id', id).eq('owner_id', currentUser.id).single();
      if (!r.error && r.data && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.data.signature || '')) sig = r.data.signature;
    } catch (e) {}
  }
  var clinic = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || '';
  var E = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var rows = '<tr><td>المريض</td><td>' + E(patient && patient.name) + '</td></tr>'
    + (c.treatment_name ? '<tr><td>العلاج</td><td>' + E(c.treatment_name) + '</td></tr>' : '')
    + (c.teeth ? '<tr><td>السن</td><td>' + E(((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.list(c.teeth) : c.teeth)) + '</td></tr>' : '');
  var foot = c.status === 'signed'
    ? '<div class="sg"><div class="sl">توقيع ' + E(c.signer_name) + (c.signer_relation ? ' (' + E(c.signer_relation) + ')' : '') + '</div>'
      + (sig ? '<img src="' + sig + '" alt="التوقيع">' : '<div class="ln"></div>')
      + '<div class="dt">وُقّعت إلكترونياً من بوابة المريض — ' + E(ppConsentWhen(c.signed_at)) + '</div></div>'
    : '<div class="sg"><div class="sl">اسم الموقّع وتوقيعه</div><div class="ln"></div><div class="dt">التاريخ: ____ / ____ / ________</div></div>';
  w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + E(c.title) + '</title>'
    + '<style>body{font-family:system-ui,Arial,sans-serif;line-height:1.9;padding:32px;font-size:14px;color:#111;max-width:760px;margin:0 auto}h2{margin:0 0 2px;font-size:19px}'
    + '.m{color:#555;font-size:12px;margin-bottom:16px}table{border-collapse:collapse;margin:0 0 16px;font-size:13px}td{padding:3px 0 3px 18px;vertical-align:top}td:first-child{color:#555;white-space:nowrap}'
    + '.b{white-space:pre-wrap;text-align:justify}.sg{margin-top:28px;page-break-inside:avoid}.sl{font-weight:700;margin-bottom:6px}.sg img{display:block;max-width:320px;max-height:120px;border-bottom:1px solid #999}'
    + '.ln{height:70px;width:320px;border-bottom:1px solid #999}.dt{color:#555;font-size:12px;margin-top:6px}@media print{body{padding:0}}</style></head><body>'
    + '<h2>' + E(c.title) + '</h2><div class="m">' + E(clinic) + '</div><table>' + rows + '</table>'
    + '<div class="b">' + E(c.body) + '</div>' + foot + '</body></html>');
  w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (_e) {} }, 300);
}
/* M220: وصولُ توقيعٍ لحظياً — sidebar.js يبثّ لكل صفحة؛ بطاقةُ المريض تُحدّث صفّها إن كان التوقيعُ لمريضها */
window.onSyDentConsent = function (row) {
  try { if (row && row.patient_id === patientId) ppConsentLoad(true); } catch (e) {}
};
