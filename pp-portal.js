/* ═══════════════════════════════════════════════════════════════════════
   SyDent — pp-portal.js (M180 · v613): بوابةُ المريض الخفيفة من بطاقة المريض
   ───────────────────────────────────────────────────────────────────────
   الدورة: إرسالُ رابطٍ مرمَّز (portal.html?t=…) من مودال الرسالة الحرة (المرجع v408) أو نسخُه
   ← المريضُ يقرأ من هاتفه (مواعيده · خطته المعتمدة · رصيده إن سُمح · تعليماته وروشتاته
   · استمارته المعلّقة) ← العيادة تجدّد الصلاحية (30 يوماً) أو توقف الرابط من الصفّ نفسه.
   الحقيقة: صفٌّ حيٌّ واحد لكل مريض (revoked_at IS NULL) يُعاد استعماله؛ الإيقافُ يختمه
   ويُنشئ الإرسالُ التالي صفّاً جديداً بتوكنٍ جديد. القراءةُ عند المريض عبر portal_info وحدها.
   يُحمَّل بعد pp-intake.js. يعتمد على: patient · patientId · currentUser · showToast ·
   escapeHtml · fmtD · ppWaComposeOpen · ppMsgLog · logAudit · SyDialog · CLINIC_SETTINGS_WA ·
   PP_BOOKING_PLAN_OK. صفرُ مستمعات addEventListener (سجلّ وضع القراءة بـcheck-mirrors).
   ═══════════════════════════════════════════════════════════════════════ */
var PP_PORTAL_DAYS = 30;         /* صلاحيةُ الرابط — تطابق DEFAULT القاعدة (M180) */
var PP_PORTAL_ROWS = null;       /* null = لم تُحمَّل بعد */
var PP_PORTAL = null;            /* أحدثُ صفّ لهذا المريض (حيٌّ أو موقوف) */
var _ppPortalBusy = false;
var PP_PORTAL_SELECT = 'id, token, expires_at, revoked_at, created_at, created_by, renewed_at';

function ppPortalLink(token) {
  var base = (location.origin && /^https?:/.test(location.origin)) ? location.origin : 'https://sydent.app';
  return base + '/portal.html?t=' + token;
}
function ppPortalIsLive(row) { return !!(row && !row.revoked_at); }
function ppPortalIsExpired(row) {
  return !!(row && row.expires_at && new Date(row.expires_at).getTime() < Date.now());
}
function ppPortalWhen(iso) {
  if (!iso) return '';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  var d = (typeof fmtD === 'function') ? fmtD(iso) : String(iso).slice(0, 10);
  var hh = t.getHours(), mm = t.getMinutes();
  return d + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
/* ما تعرضه البوابة لهذا المريض (مفاتيح الإعدادات M180) — تلميحٌ للطبيب قبل الإرسال */
function ppPortalShowsText() {
  var cs = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : {};
  var on = [];
  if (cs.portal_show_appts !== false)   on.push('المواعيد');
  if (cs.portal_show_plan !== false)    on.push('خطة العلاج');
  if (cs.portal_show_balance === true)  on.push('الرصيد');
  if (cs.portal_show_notes !== false)   on.push('التعليمات والروشتات');
  if (cs.portal_show_history !== false) on.push('العلاجات السابقة');   /* M187 · v629 */
  if (cs.portal_show_xrays === true)    on.push('صور الأشعة المشارَكة');   /* M193 · v638 */
  var chg = cs.portal_allow_changes === true && cs.portal_show_appts !== false;
  return on.length ? 'يعرض للمريض: ' + on.join(' · ') + (chg ? ' — ويستطيع إلغاء موعده أو طلب تغييره' : '') + ' (يُضبط من الإعدادات)' : 'كل الأقسام مطفأة — فعّلها من الإعدادات';
}

/* ── التحميل والرسم ───────────────────────────────────────────────────── */
async function ppPortalLoad(force) {
  if (!currentUser || !patientId) return;
  if (Array.isArray(PP_PORTAL_ROWS) && !force) { ppPortalRender(); return; }
  try {
    var r = await window.sb.from('patient_portals')
      .select(PP_PORTAL_SELECT)
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(5);
    if (r.error) {
      if (!/42P01|PGRST205|does not exist/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) console.warn('patient_portals load:', r.error);
      PP_PORTAL_ROWS = [];
    } else PP_PORTAL_ROWS = r.data || [];
  } catch (e) { console.warn('patient_portals:', e); PP_PORTAL_ROWS = []; }
  PP_PORTAL = PP_PORTAL_ROWS[0] || null;
  ppPortalRender();
}
function ppPortalLiveRow() {
  return (PP_PORTAL_ROWS || []).find(function (x) { return ppPortalIsLive(x); }) || null;
}
function ppPortalRender() {
  var row = document.getElementById('portalRow'), el = document.getElementById('iPortal');
  if (!row || !el) return;
  var planOk = (typeof PP_BOOKING_PLAN_OK === 'undefined') ? true : PP_BOOKING_PLAN_OK;
  if (!planOk) { row.style.display = 'none'; return; }
  row.style.display = '';
  var live = ppPortalLiveRow(), last = PP_PORTAL, h = '';
  /* الأزرارُ بسماتٍ حرفية (لا تركيبٍ ديناميكي للاسم) — سجلُّ وضع القراءة بـcheck-mirrors يقرأ الاسمَ من المصدر */
  var B_SEND  = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppPortalSend()" title="' + escapeHtml(ppPortalShowsText()) + '">';
  var B_COPY  = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppPortalCopyLink()">نسخ الرابط</button>';
  var B_RENEW = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppPortalRenew()" title="تمديد الصلاحية ' + PP_PORTAL_DAYS + ' يوماً من الآن">🔁 تجديد</button>';
  var B_STOP  = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn pp-portal-stop" onclick="ppPortalRevoke()" title="إيقاف الرابط فوراً — لن يفتح عند المريض">⛔ إيقاف</button>';
  if (!live && !last) {
    h = '<span class="pp-intake-st">لم يُرسل بعد</span>' + B_SEND + '🔗 إرسال رابط البوابة</button>';
  } else if (!live) {   /* آخرُ رابط موقوف */
    h = '<span class="pp-intake-st pp-intake-exp">⛔ أُوقف الرابط ' + escapeHtml(ppPortalWhen(last.revoked_at)) + '</span>' + B_SEND + '🔗 رابط جديد</button>';
  } else if (ppPortalIsExpired(live)) {
    h = '<span class="pp-intake-st pp-intake-exp">⌛ انتهت صلاحية الرابط ' + escapeHtml(ppPortalWhen(live.expires_at)) + '</span>'
      + B_SEND + '🔁 تجديد وإرسال</button>' + B_STOP;
  } else {
    h = '<span class="pp-intake-st pp-intake-new">🟢 نشط حتى ' + escapeHtml(ppPortalWhen(live.expires_at)) + '</span>'
      + B_SEND + 'إعادة الإرسال</button>' + B_COPY + B_RENEW + B_STOP;
  }
  el.innerHTML = h;
}

/* ── الإرسال: صفٌّ حيٌّ واحد لكل مريض — يُعاد استعماله وتُمدَّد صلاحيته ───── */
async function ppPortalBy() {
  try {
    var emp = (window.SyDentLock && window.SyDentLock.getCurrentEmployee) ? await window.SyDentLock.getCurrentEmployee() : null;
    return emp && emp.name ? String(emp.name).slice(0, 80) : null;
  } catch (e1) { return null; }
}
function ppPortalAudit(what, extra) {
  if (typeof window.logAudit !== 'function') return;
  try {
    window.logAudit('patient.portal_link', { entityType: 'patient', entityId: patientId, patientId: patientId, patientName: patient && patient.name,
      description: what + ' رابط بوابة المريض', newValue: extra || null });
  } catch (e) {}
}
async function ppPortalEnsureLive() {
  var live = ppPortalLiveRow();
  var by = await ppPortalBy();
  var exp = new Date(Date.now() + PP_PORTAL_DAYS * 86400000).toISOString();
  if (live) {
    /* رابطٌ قائم: الإرسالُ يجدّد صلاحيته ولا يغيّر توكنه (الرسالةُ السابقة تبقى صالحة) */
    var u = await window.sb.from('patient_portals').update({ expires_at: exp, renewed_at: new Date().toISOString(), created_by: by || live.created_by || null })
      .eq('id', live.id).eq('owner_id', currentUser.id).is('revoked_at', null)
      .select(PP_PORTAL_SELECT).single();
    if (u.error) throw u.error;
    PP_PORTAL_ROWS = [u.data].concat((PP_PORTAL_ROWS || []).filter(function (x) { return x.id !== u.data.id; }));
    PP_PORTAL = PP_PORTAL_ROWS[0];
    return u.data;
  }
  var ins = await window.sb.from('patient_portals').insert({ owner_id: currentUser.id, patient_id: patientId, created_by: by, expires_at: exp })
    .select(PP_PORTAL_SELECT).single();
  if (ins.error) throw ins.error;
  PP_PORTAL_ROWS = [ins.data].concat(PP_PORTAL_ROWS || []);
  PP_PORTAL = ins.data;
  ppPortalAudit('إنشاء', { expires_at: exp });
  return ins.data;
}
/* M180: القالبُ من الإعدادات (whatsapp_portal_template) — NULL = الافتراضي (مرآة بايت-بايت: settings · pp-portal) */
var PP_DEFAULT_PORTAL_TPL =
'مرحباً {patient_first_name} 🌟\n' +
'هذا رابط صفحتك الخاصة لدى {clinic_name} — تجد فيه مواعيدك وخطة علاجك وتعليمات ما بعد العلاج:\n' +
'{portal_link}\n' +
'الرابط خاص بك فلا تشاركه مع أحد. شكراً 🦷';
function ppPortalFill(tpl, data) {
  var out = String(tpl || '');
  Object.keys(data).forEach(function (k) { out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), data[k] == null ? '' : String(data[k])); });
  return out;
}
function ppPortalMsgText(link) {
  var cs = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : {};
  var tpl = (cs.whatsapp_portal_template && String(cs.whatsapp_portal_template).trim()) || PP_DEFAULT_PORTAL_TPL;
  var name = String((patient && patient.name) || '').trim();
  return ppPortalFill(tpl, { patient_first_name: name.split(' ')[0], patient_name: name, clinic_name: cs.clinic_name || 'عيادتنا', clinic_phone: cs.clinic_phone || '', portal_link: link });
}
function ppPortalErr(e) {
  var m = (e && (e.message || e.code)) || '';
  if (/subscription_read_only|sub_gate|row-level security/i.test(m)) return '⚠️ حسابك بوضع القراءة — لا يمكن إنشاء رابط';
  if (/42P01|PGRST205|does not exist/i.test(m)) return '⚠️ يلزم تطبيق Migration 180 أولاً';
  return '❌ ' + (m || 'تعذّر إنشاء الرابط');
}
async function ppPortalSend() {
  if (_ppPortalBusy) return;
  if (!patient || !patientId) return;
  _ppPortalBusy = true;
  try {
    var row = await ppPortalEnsureLive();
    ppPortalRender();
    var link = ppPortalLink(row.token);
    ppWaComposeOpen('إرسال رابط بوابة المريض', ppPortalMsgText(link), false, null, '', 'portal');
  } catch (e) { console.warn('ppPortalSend:', e); showToast(ppPortalErr(e)); }
  _ppPortalBusy = false;
}
async function ppPortalCopyLink() {
  if (_ppPortalBusy) return;
  _ppPortalBusy = true;
  try {
    var row = await ppPortalEnsureLive();
    ppPortalRender();
    var link = ppPortalLink(row.token);
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); }
    else {
      var ta = document.createElement('textarea');
      ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    showToast('تم نسخ رابط البوابة ✓');
    if (typeof ppMsgLog === 'function') ppMsgLog('portal', 'رابط بوابة المريض: ' + link, null);   /* سجلّ المراسلات (M149) — غير حاجب */
  } catch (e) { console.warn('ppPortalCopyLink:', e); showToast(ppPortalErr(e)); }
  _ppPortalBusy = false;
}
/* ── التجديد: تمديدُ الصلاحية 30 يوماً من الآن بلا تغيير التوكن ──────────── */
async function ppPortalRenew() {
  if (_ppPortalBusy) return;
  var live = ppPortalLiveRow();
  if (!live) { showToast('⚠️ لا رابط قائم — أرسل رابطاً جديداً'); return; }
  _ppPortalBusy = true;
  try {
    var row = await ppPortalEnsureLive();
    ppPortalRender();
    ppPortalAudit('تجديد', { expires_at: row.expires_at });
    showToast('🔁 جُدّد الرابط حتى ' + ppPortalWhen(row.expires_at));
  } catch (e) { console.warn('ppPortalRenew:', e); showToast(ppPortalErr(e)); }
  _ppPortalBusy = false;
}
/* ── الإيقاف: ختمُ الصفّ الحيّ — الرابط لا يفتح عند المريض فوراً ───────────── */
async function ppPortalRevoke() {
  if (_ppPortalBusy) return;
  var live = ppPortalLiveRow();
  if (!live) return;
  if (!await SyDialog.confirm({ title: 'إيقاف رابط البوابة', message: 'سيتوقف الرابط فوراً ولن يفتح عند المريض. الإرسالُ التالي يُنشئ رابطاً جديداً. متابعة؟', danger: true })) return;
  _ppPortalBusy = true;
  try {
    var u = await window.sb.from('patient_portals').update({ revoked_at: new Date().toISOString() })
      .eq('id', live.id).eq('owner_id', currentUser.id).is('revoked_at', null)
      .select(PP_PORTAL_SELECT).single();
    if (u.error) throw u.error;
    PP_PORTAL_ROWS = [u.data].concat((PP_PORTAL_ROWS || []).filter(function (x) { return x.id !== u.data.id; }));
    PP_PORTAL = PP_PORTAL_ROWS[0];
    ppPortalRender();
    ppPortalAudit('إيقاف', null);
    showToast('⛔ أُوقف رابط البوابة');
  } catch (e) { console.warn('ppPortalRevoke:', e); showToast(ppPortalErr(e)); }
  _ppPortalBusy = false;
}
