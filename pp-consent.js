/* ═════════════════════════════════════════════════════════════════════
   SyDent — pp-consent.js (M219 · أ2): موافقاتُ العلاج من بطاقة المريض
   ─────────────────────────────────────────────────────────────────────
   الدورة: علاجٌ له نصُّ موافقة (صفحة العلاجات) يدخل الخطةَ المعتمدة ⇒ consent_sync تولّد للمريض موافقةً
   معلَّقة بنسخةٍ من النص ⇒ المريضُ يوقّعها من بوابته (أ3) ⇒ تظهر هنا موقَّعةً للعرض والطباعة.
   - المصدرُ القاعدة: consent_sync(patient) تُستدعى عند الفتح وعند تغيّر الجلسات المخطّطة (renderTimeline
     نقطةُ المرور) — idempotent، وتُعيد صفراً بوضع القراءة فلا كتابة.
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
  try {
    _ppConsentSig = ppConsentPlanSig();
    var sy = await window.sb.rpc('consent_sync', { p_patient: patientId });
    if (sy.error && !/42883|PGRST202|does not exist|schema cache/i.test((sy.error.message || '') + ' ' + (sy.error.code || ''))) console.warn('consent_sync:', sy.error);
    var r = await window.sb.from('patient_consents').select(PP_CONSENT_SELECT)
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(100);
    if (r.error) {
      if (!/42P01|PGRST205|does not exist|schema cache/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) console.warn('patient_consents load:', r.error);
      PP_CONSENTS = []; PP_CONSENT_OK = false;
    } else { PP_CONSENTS = r.data || []; PP_CONSENT_OK = true; ppConsentWarnDone(true); }   /* ما أُنجز قبل الفتح لا يُنبَّه عنه — الصفُّ يعرضه معلَّقاً */
  } catch (e) { console.warn('patient_consents:', e); PP_CONSENTS = []; PP_CONSENT_OK = false; }
  _ppConsentBusy = false;
  ppConsentRender();
  var m = document.getElementById('ppConsentModal');
  if (m && m.classList.contains('open')) ppConsentRenderList();
}
/* نقطةُ المرور (renderTimeline): الخطةُ تغيّرت ⇒ مزامنةٌ مؤجَّلة لحظةً (عدّةُ رسماتٍ متتالية = نداءٌ واحد) */
function ppConsentTouch() {
  if (!Array.isArray(PP_CONSENTS)) return;                 /* التحميلُ الأول لم ينتهِ بعد */
  ppConsentWarnDone();
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
    if (c.teeth) meta.push('السن: ' + c.teeth);
    meta.push('أُنشئت ' + ppConsentWhen(c.created_at));
    if (c.status === 'signed') meta.push('وقّعها ' + (c.signer_name || '') + (c.signer_relation ? ' (' + c.signer_relation + ')' : '') + ' — ' + ppConsentWhen(c.signed_at));
    if (c.status === 'void' && c.voided_at) meta.push('أُلغيت ' + ppConsentWhen(c.voided_at));
    var acts = '<button type="button" class="sy-act" onclick="ppConsentPrint(\'' + c.id + '\')">🖨️ طباعة</button>'
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
  if (!await SyDialog.confirm({ title: 'إلغاء الموافقة', message: 'ستُلغى الموافقة المعلَّقة «' + (c.title || '') + '» ولن تظهر للمريض. إن بقي العلاج في الخطة تُنشأ له موافقةٌ جديدة عند أول تغييرٍ للخطة. متابعة؟', danger: true, okText: 'إلغاء الموافقة', cancelText: 'تراجع' })) return;
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
          description: 'إلغاء موافقة معلَّقة: ' + (c.title || '') + (c.teeth ? ' — السن ' + c.teeth : '') });
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
    + (c.teeth ? '<tr><td>السن</td><td>' + E(c.teeth) + '</td></tr>' : '');
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
