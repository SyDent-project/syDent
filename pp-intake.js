/* ═══════════════════════════════════════════════════════════════════════
   SyDent — pp-intake.js (M177 · v595): استمارةُ المريض الرقمية من بطاقة المريض
   ───────────────────────────────────────────────────────────────────────
   الدورة: إرسالُ رابطٍ مرمَّز (intake.html?t=…) من مودال الرسالة الحرة (المرجع v408) أو نسخُه
   ← المريضُ يعبّي من هاتفه ← صفُّ «استمارة المريض» ببطاقة المريض يصير «وصلت» ← مودالُ
   المراجعة يعرض الإجابات مقابل الملف الحالي مع خانةٍ لكل بند دمج ← «اعتماد ودمج»
   يكتب على patients (الأعلام · الحساسية · النص الحر · الميلاد) ويختم الاستمارة.
   الحقيقة: الاستمارةُ وثيقةٌ تبقى بسجلّها (الإجاباتُ كاملةً + التوقيع إن وُجد) — الدمجُ
   يُغذّي أعلامَ السلامة القائمة فقط ولا يحذف شيئاً من الملف أبداً.
   يُحمَّل بعد pp-extras.js. يعتمد على: patient · patientId · currentUser · openModal ·
   closeModal · showToast · escapeHtml · fmtD · ppWaComposeOpen · ppMsgLog · logAudit ·
   MEDICAL_FLAGS_DEFS · ALLERGY_FLAGS_DEFS · renderHeader · renderInfo · PP_BOOKING_PLAN_OK.
   صفرُ مستمعات addEventListener (سجلّ وضع القراءة بـcheck-mirrors).
   ═══════════════════════════════════════════════════════════════════════ */
/* مرآةُ intake.html حرفياً (prove-intake.js) — الحالاتُ الإضافية ذات الأثر السريري تُدمج نصاً
   في medical_flags_other لأنها ليست من مفاتيح M87 الستة (لا هجرةَ أعلامٍ جديدة). */
var INTAKE_EXTRA_DEFS = [
  { key:'bisphosphonates', label:'أدوية هشاشة العظام (بيسفوسفونات)' },
  { key:'bleeding',        label:'نزيف يصعب إيقافه' },
  { key:'infectious',      label:'مرض معدٍ (التهاب كبد وغيره)' },
  { key:'epilepsy',        label:'صرع' },
  { key:'thyroid',         label:'غدة درقية' },
  { key:'kidney_liver',    label:'أمراض كلى / كبد' },
  { key:'smoker',          label:'مدخّن' }
];
var PP_INTAKE_DAYS = 14;         /* صلاحيةُ الرابط — تطابق DEFAULT القاعدة (M177) */
var PP_INTAKE_FRESH_DAYS = 365;  /* استمارةٌ مُعتمَدة أحدثُ من سنة = لا حاجة لإعادة الإرسال من رسالة التأكيد */
var PP_INTAKE_ROWS = null;       /* null = لم تُحمَّل بعد */
var PP_INTAKE = null;            /* أحدثُ صفّ لهذا المريض */
var _ppIntakeBusy = false;

function ppIntakeLabel(defs, key) {
  for (var i = 0; i < defs.length; i++) if (defs[i].key === key) return defs[i].label;
  return null;
}
/* تسمياتُ الإجابات — المفاتيحُ المجهولة تُهمَل بنيوياً (التسمياتُ ثوابت = صفر سطح XSS) */
function ppIntakeLabels(answers) {
  answers = answers || {};
  var pick = function (defs, arr) {
    return (Array.isArray(arr) ? arr : []).map(function (k) { return ppIntakeLabel(defs, k); }).filter(Boolean);
  };
  return {
    med:   pick(MEDICAL_FLAGS_DEFS, answers.med),
    alg:   pick(ALLERGY_FLAGS_DEFS, answers.alg),
    extra: pick(INTAKE_EXTRA_DEFS, answers.extra)
  };
}
function ppIntakeLink(token) {
  var base = (location.origin && /^https?:/.test(location.origin)) ? location.origin : 'https://sydent.app';
  return base + '/intake.html?t=' + token;
}
function ppIntakeIsExpired(row) {
  return !!(row && row.status === 'pending' && row.expires_at && new Date(row.expires_at).getTime() < Date.now());
}
function ppIntakeIsFresh(row) {
  if (!row || row.status !== 'reviewed' && row.status !== 'submitted') return false;
  var t = new Date(row.submitted_at || row.created_at || 0).getTime();
  return (Date.now() - t) < PP_INTAKE_FRESH_DAYS * 86400000;
}

/* ── خطةُ الدمج: ما تُضيفه الاستمارةُ إلى الملف الحالي (لا يحذف شيئاً) ─────────
   تُعاد كبنودٍ كلٌّ بخانته — المسوّغُ أن الطبيب يقرّر، لا الاستمارة.
   • flags   : مفاتيحُ M87 الجديدة (طبية + حساسية + الحالاتُ السبع الإضافية — v621) ⇒ medical_flags ∪
   • other   : «حالات أخرى» + «أدوية: …» التي لا يحويها medical_flags_other
   • allergy : «حساسية أخرى» إن لم تكن ضمن allergies
   • dob     : تاريخُ الميلاد عند غيابه بالملف فقط */
function ppIntakeMergePlan(pt, answers) {
  pt = pt || {}; answers = answers || {};
  var items = [];
  var have = Array.isArray(pt.medical_flags) ? pt.medical_flags : [];
  var known = MEDICAL_FLAGS_DEFS.concat(ALLERGY_FLAGS_DEFS).map(function (d) { return d.key; });
  /* v621: the intake's seven extra conditions are M87 flags too (MEDICAL_FLAGS_DEFS) — ticked chips on the card, not text */
  var want = (Array.isArray(answers.med) ? answers.med : []).concat(Array.isArray(answers.alg) ? answers.alg : [], Array.isArray(answers.extra) ? answers.extra : [])
    .filter(function (k, i, a) { return known.indexOf(k) > -1 && have.indexOf(k) < 0 && a.indexOf(k) === i; });
  if (want.length) {
    items.push({ key: 'flags', label: 'التحذيرات والحساسيات: ' + want.map(function (k) { return ppIntakeLabel(MEDICAL_FLAGS_DEFS, k) || ppIntakeLabel(ALLERGY_FLAGS_DEFS, k); }).join('، '),
      apply: function (u) { u.medical_flags = have.concat(want); } });
  }
  var otherNow = String(pt.medical_flags_other || '').trim();
  /* an extra key the card does not know (none today) still lands as text — nothing is dropped */
  var parts = INTAKE_EXTRA_DEFS.filter(function (d) { return (answers.extra || []).indexOf(d.key) > -1 && known.indexOf(d.key) < 0; }).map(function (d) { return d.label; });
  if (answers.med_other) parts.push(String(answers.med_other).trim());
  if (answers.meds) parts.push('أدوية: ' + String(answers.meds).trim());
  parts = parts.filter(function (p, i, a) { return p && otherNow.indexOf(p) < 0 && a.indexOf(p) === i; });
  if (parts.length) {
    items.push({ key: 'other', label: 'حالات أخرى: ' + parts.join('، '),
      apply: function (u) { u.medical_flags_other = (otherNow ? otherNow + '، ' : '') + parts.join('، '); } });
  }
  var algNow = String(pt.allergies || '').trim(); if (algNow === 'لا يوجد') algNow = '';
  var algNew = answers.alg_other ? String(answers.alg_other).trim() : '';
  if (algNew && algNow.indexOf(algNew) < 0) {
    items.push({ key: 'allergy', label: 'حساسية أخرى: ' + algNew,
      apply: function (u) { u.allergies = algNow ? algNow + '، ' + algNew : algNew; } });
  }
  if (!pt.dob && answers.dob && /^\d{4}-\d{2}-\d{2}$/.test(String(answers.dob))) {
    items.push({ key: 'dob', label: 'تاريخ الميلاد: ' + String(answers.dob).split('-').reverse().join('/'),
      apply: function (u) { u.dob = String(answers.dob); } });
  }
  return items;
}

/* ── التحميل والرسم ───────────────────────────────────────────────────── */
async function ppIntakeLoad(force) {
  if (!currentUser || !patientId) return;
  if (Array.isArray(PP_INTAKE_ROWS) && !force) { ppIntakeRender(); return; }
  try {
    var r = await window.sb.from('patient_intakes')
      .select('id, status, token, expires_at, created_at, created_by, submitted_at, answers, signature, reviewed_at, reviewed_by')
      .eq('owner_id', currentUser.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(5);
    if (r.error) {
      if (!/42P01|PGRST205|does not exist/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) console.warn('patient_intakes load:', r.error);
      PP_INTAKE_ROWS = [];
    } else PP_INTAKE_ROWS = r.data || [];
  } catch (e) { console.warn('patient_intakes:', e); PP_INTAKE_ROWS = []; }
  PP_INTAKE = PP_INTAKE_ROWS[0] || null;
  ppIntakeRender();
}
function ppIntakeWhen(iso) {
  if (!iso) return '';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  var d = (typeof fmtD === 'function') ? fmtD(iso) : String(iso).slice(0, 10);
  var hh = t.getHours(), mm = t.getMinutes();
  return d + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
function ppIntakeRender() {
  var row = document.getElementById('intakeRow'), el = document.getElementById('iIntake');
  if (!row || !el) return;
  var planOk = (typeof PP_BOOKING_PLAN_OK === 'undefined') ? true : PP_BOOKING_PLAN_OK;
  if (!planOk) { row.style.display = 'none'; return; }
  row.style.display = '';
  var r = PP_INTAKE, h = '';
  /* الأزرارُ بسماتٍ حرفية (لا تركيبٍ ديناميكي للاسم) — سجلُّ وضع القراءة بـcheck-mirrors يقرأ الاسمَ من المصدر */
  var B_SEND   = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppIntakeSend()">';
  var B_COPY   = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppIntakeCopyLink()">نسخ الرابط</button>';
  var B_REVIEW = '<button type="button" class="btn btn-primary btn-sm pp-intake-btn pp-intake-primary" onclick="ppIntakeOpenReview()">🔎 مراجعة واعتماد</button>';
  var B_VIEW   = '<button type="button" class="btn btn-outline btn-sm pp-intake-btn" onclick="ppIntakeOpenReview()">عرض</button>';
  if (!r) {
    h = '<span class="pp-intake-st">لم تُرسل بعد</span>' + B_SEND + '📝 إرسال الاستمارة</button>';
  } else if (r.status === 'pending' && !ppIntakeIsExpired(r)) {
    var prev = (PP_INTAKE_ROWS || []).find(function (x) { return x.status === 'reviewed' || x.status === 'dismissed'; });
    h = '<span class="pp-intake-st">⏳ بانتظار المريض — أُرسل الرابط ' + escapeHtml(ppIntakeWhen(r.created_at))
      + (prev ? ' <small>(آخر استمارة مُعتمدة ' + escapeHtml(ppIntakeWhen(prev.reviewed_at || prev.submitted_at)) + ')</small>' : '') + '</span>'
      + B_SEND + 'إعادة الإرسال</button>' + B_COPY;
  } else if (r.status === 'pending') {
    h = '<span class="pp-intake-st pp-intake-exp">⌛ انتهت صلاحية الرابط</span>' + B_SEND + '📝 إرسال رابط جديد</button>';
  } else if (r.status === 'submitted') {
    h = '<span class="pp-intake-st pp-intake-new">✅ وصلت ' + escapeHtml(ppIntakeWhen(r.submitted_at)) + '</span>' + B_REVIEW;
  } else {   /* reviewed · dismissed */
    h = '<span class="pp-intake-st">✔ ' + (r.status === 'reviewed' ? 'مُعتمدة' : 'رُوجعت بلا دمج') + ' ' + escapeHtml(ppIntakeWhen(r.reviewed_at))
      + (r.reviewed_by ? ' · ' + escapeHtml(r.reviewed_by) : '') + '</span>'
      + B_VIEW + B_SEND + 'استمارة جديدة</button>';
  }
  el.innerHTML = h;
}

/* ── الإرسال: صفٌّ معلّقٌ واحد لكل مريض — يُعاد استعماله وتُمدَّد صلاحيته ───── */
async function ppIntakeEnsurePending() {
  var pend = (PP_INTAKE_ROWS || []).find(function (x) { return x.status === 'pending'; });
  var by = null;
  try {
    var emp = (window.SyDentLock && window.SyDentLock.getCurrentEmployee) ? await window.SyDentLock.getCurrentEmployee() : null;
    by = emp && emp.name ? String(emp.name).slice(0, 80) : null;
  } catch (e1) {}
  var exp = new Date(Date.now() + PP_INTAKE_DAYS * 86400000).toISOString();
  if (pend) {
    var u = await window.sb.from('patient_intakes').update({ expires_at: exp, created_by: by || pend.created_by || null })
      .eq('id', pend.id).eq('owner_id', currentUser.id).eq('status', 'pending')
      .select('id, status, token, expires_at, created_at, created_by, submitted_at, answers, signature, reviewed_at, reviewed_by').single();
    if (u.error) throw u.error;
    PP_INTAKE_ROWS = [u.data].concat((PP_INTAKE_ROWS || []).filter(function (x) { return x.id !== u.data.id; }));
    PP_INTAKE = PP_INTAKE_ROWS[0];
    return u.data;
  }
  var ins = await window.sb.from('patient_intakes').insert({ owner_id: currentUser.id, patient_id: patientId, created_by: by, expires_at: exp })
    .select('id, status, token, expires_at, created_at, created_by, submitted_at, answers, signature, reviewed_at, reviewed_by').single();
  if (ins.error) throw ins.error;
  PP_INTAKE_ROWS = [ins.data].concat(PP_INTAKE_ROWS || []);
  PP_INTAKE = ins.data;
  return ins.data;
}
/* M178: القالبُ من الإعدادات (whatsapp_intake_template) — NULL = الافتراضي (مرآة بايت-بايت: settings · pp-intake · appt-booking) */
var PP_DEFAULT_INTAKE_TPL =
'مرحباً {patient_first_name} 🌟\n' +
'قبل زيارتك إلى {clinic_name}، نرجو تعبئة استمارة المريض (تأخذ دقيقتين) عبر هذا الرابط:\n' +
'{intake_link}\n' +
'المعلومات تساعد الطبيب على علاجك بأمان. شكراً 🦷';
function ppIntakeFill(tpl, data) {
  var out = String(tpl || '');
  Object.keys(data).forEach(function (k) { out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), data[k] == null ? '' : String(data[k])); });
  return out;
}
function ppIntakeMsgText(link) {
  var cs = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA) ? CLINIC_SETTINGS_WA : {};
  var tpl = (cs.whatsapp_intake_template && String(cs.whatsapp_intake_template).trim()) || PP_DEFAULT_INTAKE_TPL;
  var name = String((patient && patient.name) || '').trim();
  return ppIntakeFill(tpl, { patient_first_name: name.split(' ')[0], patient_name: name, clinic_name: cs.clinic_name || 'عيادتنا', clinic_phone: cs.clinic_phone || '', intake_link: link });
}
function ppIntakeErr(e) {
  var m = (e && (e.message || e.code)) || '';
  if (/subscription_read_only|sub_gate|row-level security/i.test(m)) return '⚠️ حسابك بوضع القراءة — لا يمكن إنشاء رابط';
  if (/42P01|PGRST205|does not exist/i.test(m)) return '⚠️ يلزم تطبيق Migration 177 أولاً';
  return '❌ ' + (m || 'تعذّر إنشاء الرابط');
}
async function ppIntakeSend() {
  if (_ppIntakeBusy) return;
  if (!patient || !patientId) return;
  _ppIntakeBusy = true;
  try {
    var row = await ppIntakeEnsurePending();
    ppIntakeRender();
    var link = ppIntakeLink(row.token);
    ppWaComposeOpen('إرسال استمارة المريض', ppIntakeMsgText(link), false, null, '', 'intake');
  } catch (e) { console.warn('ppIntakeSend:', e); showToast(ppIntakeErr(e)); }
  _ppIntakeBusy = false;
}
async function ppIntakeCopyLink() {
  if (_ppIntakeBusy) return;
  _ppIntakeBusy = true;
  try {
    var row = await ppIntakeEnsurePending();
    ppIntakeRender();
    var link = ppIntakeLink(row.token);
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); }
    else {
      var ta = document.createElement('textarea');
      ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    showToast('تم نسخ رابط الاستمارة ✓');
    if (typeof ppMsgLog === 'function') ppMsgLog('intake', 'رابط الاستمارة: ' + link, null);   /* سجلّ المراسلات (M149) — غير حاجب */
  } catch (e) { console.warn('ppIntakeCopyLink:', e); showToast(ppIntakeErr(e)); }
  _ppIntakeBusy = false;
}

/* ── المراجعة ─────────────────────────────────────────────────────────── */
function ppIntakeOpenReview() {
  var r = PP_INTAKE;
  if (!r || !r.answers) { showToast('⚠️ لا استمارة مستلمة لهذا المريض'); return; }
  var a = r.answers || {}, L = ppIntakeLabels(a);
  var sec = function (title, body) { return '<div class="pp-intake-sec"><div class="pp-intake-sec-t">' + title + '</div>' + body + '</div>'; };
  var chips = function (arr, tone) { return arr.length ? '<div class="pp-intake-chips">' + arr.map(function (t) { return '<span class="pp-intake-chip ' + tone + '">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' : '<span class="pp-intake-none">— لا شيء</span>'; };
  var txt = function (t) { return t ? '<div class="pp-intake-txt">' + escapeHtml(String(t)) + '</div>' : '<span class="pp-intake-none">— لا شيء</span>'; };
  var meta = document.getElementById('ppIntakeMeta');
  if (meta) meta.textContent = (r.status === 'submitted' ? 'وصلت ' : (r.status === 'reviewed' ? 'مُعتمدة · وصلت ' : 'رُوجعت بلا دمج · وصلت ')) + ppIntakeWhen(r.submitted_at)
    + (r.reviewed_by ? ' · راجعها ' + r.reviewed_by : '') + (r.created_by ? ' · أرسلها ' + r.created_by : '');
  var h = sec('الحالات الصحية', chips(L.med.concat(L.extra), 'warn') + (a.med_other ? txt(a.med_other) : ''))
    + sec('الحساسية', chips(L.alg, 'alg') + (a.alg_other ? txt(a.alg_other) : ''))
    + sec('الأدوية الحالية', txt(a.meds))
    + sec('سبب الزيارة', txt(a.complaint))
    + (a.dob ? sec('تاريخ الميلاد', '<div class="pp-intake-txt" dir="ltr" style="text-align:right;">' + escapeHtml(String(a.dob).split('-').reverse().join('/')) + '</div>') : '')
    + (r.signature && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.signature) ? sec('التوقيع', '<img class="pp-intake-sig" src="' + r.signature + '" alt="توقيع المريض">') : '');
  var body = document.getElementById('ppIntakeBody');
  if (body) body.innerHTML = h;
  var mergeBox = document.getElementById('ppIntakeMerge'), mergeList = document.getElementById('ppIntakeMergeList');
  var items = (r.status === 'submitted') ? ppIntakeMergePlan(patient, a) : [];
  if (mergeBox && mergeList) {
    if (r.status === 'submitted') {
      mergeBox.style.display = '';
      mergeList.innerHTML = items.length
        ? items.map(function (it, i) {
            return '<label class="pp-intake-merge-it"><input type="checkbox" class="pp-intake-ck" data-k="' + escapeHtml(it.key) + '" checked> <span>' + escapeHtml(it.label) + '</span></label>';
          }).join('')
        : '<div class="pp-intake-none">لا جديد — كل ما بالاستمارة موجود بالملف أصلاً. الاعتماد يختم الاستمارة فقط.</div>';
    } else mergeBox.style.display = 'none';
  }
  document.querySelectorAll('#ppIntakeModal .pp-intake-wbtn').forEach(function (b) { b.style.display = (r.status === 'submitted') ? '' : 'none'; });
  openModal('ppIntakeModal');
}
async function ppIntakeFinish(merge) {
  if (_ppIntakeBusy) return;
  var r = PP_INTAKE;
  if (!r || r.status !== 'submitted') { closeModal('ppIntakeModal'); return; }
  _ppIntakeBusy = true;
  var btns = document.querySelectorAll('#ppIntakeModal .pp-intake-wbtn');
  btns.forEach(function (b) { b.disabled = true; });
  try {
    var updates = {}, applied = [];
    if (merge) {
      var items = ppIntakeMergePlan(patient, r.answers || {});
      var checked = {};
      document.querySelectorAll('#ppIntakeMergeList .pp-intake-ck').forEach(function (ck) { if (ck.checked) checked[ck.getAttribute('data-k')] = true; });
      items.forEach(function (it) { if (checked[it.key]) { it.apply(updates); applied.push(it.label); } });
      if (Object.keys(updates).length) {
        var up = await window.sb.from('patients').update(updates).eq('id', patientId).eq('doctor_id', currentUser.id);
        if (up.error) throw up.error;
        Object.assign(patient, updates);
        if (typeof renderHeader === 'function') renderHeader();
        if (typeof renderInfo === 'function') renderInfo();
      }
    }
    var by = null;
    try {
      var emp = (window.SyDentLock && window.SyDentLock.getCurrentEmployee) ? await window.SyDentLock.getCurrentEmployee() : null;
      by = emp && emp.name ? String(emp.name).slice(0, 80) : null;
    } catch (e1) {}
    var st = (merge && applied.length) ? 'reviewed' : (merge ? 'reviewed' : 'dismissed');
    var fin = await window.sb.from('patient_intakes').update({ status: st, reviewed_at: new Date().toISOString(), reviewed_by: by })
      .eq('id', r.id).eq('owner_id', currentUser.id).eq('status', 'submitted')
      .select('id, status, token, expires_at, created_at, created_by, submitted_at, answers, signature, reviewed_at, reviewed_by').single();
    if (fin.error) throw fin.error;
    PP_INTAKE_ROWS = [fin.data].concat((PP_INTAKE_ROWS || []).filter(function (x) { return x.id !== fin.data.id; }));
    PP_INTAKE = fin.data;
    ppIntakeRender();
    closeModal('ppIntakeModal');
    showToast(applied.length ? '✅ اعتُمدت الاستمارة ودُمج ' + applied.length + ' بند بالملف' : '✅ اعتُمدت الاستمارة');
    if (typeof window.logAudit === 'function') {
      window.logAudit('patient.intake_review', { entityType: 'patient', entityId: patientId, patientId: patientId, patientName: patient && patient.name,
        description: (applied.length ? 'اعتماد استمارة المريض ودمج: ' + applied.join(' · ') : (merge ? 'اعتماد استمارة المريض (لا جديد)' : 'مراجعة استمارة المريض بلا دمج')),
        newValue: Object.keys(updates).length ? updates : null });
    }
  } catch (e) { console.warn('ppIntakeFinish:', e); showToast(ppIntakeErr(e)); }
  btns.forEach(function (b) { b.disabled = false; });
  _ppIntakeBusy = false;
}
function ppIntakeApprove() { return ppIntakeFinish(true); }
function ppIntakeDismiss() { return ppIntakeFinish(false); }
function ppIntakePrint() {
  var r = PP_INTAKE;
  if (!r || !r.answers) return;
  var body = document.getElementById('ppIntakeBody');
  var w = window.open('', '_blank');
  if (!w) { showToast('اسمح بالنوافذ المنبثقة للطباعة', true); return; }
  var clinic = (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || '';
  var E = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>استمارة المريض</title>'
    + '<style>body{font-family:system-ui,Arial,sans-serif;line-height:1.8;padding:28px;font-size:14px;color:#111}h2{margin:0 0 4px}.m{color:#555;font-size:12px;margin-bottom:18px}'
    + '.pp-intake-sec{margin:0 0 14px;border-bottom:1px solid #ddd;padding-bottom:8px}.pp-intake-sec-t{font-weight:700;margin-bottom:4px}.pp-intake-chip{display:inline-block;border:1px solid #999;border-radius:12px;padding:1px 10px;margin:2px}.pp-intake-none{color:#777}.pp-intake-sig{max-width:320px;border:1px solid #ccc;border-radius:6px}</style></head><body>'
    + '<h2>استمارة المريض — ' + E(patient && patient.name) + '</h2><div class="m">' + E(clinic) + ' · ' + E(ppIntakeWhen(r.submitted_at)) + '</div>'
    + (body ? body.innerHTML : '') + '</body></html>');
  w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (_e) {} }, 300);
}
/* M178: وصولُ استمارةٍ لحظياً — sidebar.js يبثّ لكل صفحة؛ بطاقةُ المريض تُحدّث صفّها إن كانت الاستمارة لمريضها */
window.onSyDentIntake = function (row) {
  try {
    if (!row || row.patient_id !== patientId) return;
    ppIntakeLoad(true);
    if (typeof showToast === 'function') showToast('📝 وصلت استمارة ' + ((patient && patient.name) || 'المريض') + ' — راجعها واعتمدها');
  } catch (e) {}
};
