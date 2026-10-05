/* ═══════════════════════════════════════════════════════════════════════
   SyDent — pp-modules.js: الوحدات المستخرَجة من patient-profile.html
   (مشروع تفكيك الملفات الوحشية — بدأ 26 تموز 2026)
   ─────────────────────────────────────────────────────────────────────
   عقد الملف (ملزم لكل استخراج — راجع وثيقة التسليم):
   • سكربت كلاسيكي بالنطاق العام: نفس دلالات الكتلة المضمّنة حرفياً
     (غير strict — دوال ومتغيرات top-level تصير globals كما كانت).
   • تعريفات صِرفة فقط: صفر تنفيذ top-level (لا نداءات ولا لمس DOM ولا
     مستمعات خارج أجسام الدوال). يُحمَّل بالـhead قبل الكتلة الرئيسية،
     فتكون كل التعريفات المستخرَجة قائمة قبل أي init أو onclick.
   • كل نقل يُبرهَن بإعادة تركيب بايتية: (الملف بعد القص + الكتلة
     المنقولة) = الملف قبل القص حرفياً، ويُثبَت أن الكتلة تعريفات صرفة
     وأن كل معرّف فيها كان مُعلَناً مرة واحدة بالضبط قبل النقل.
   • الطبقة المالية (توزيع الدفعات وإعادة توزيعها ودوالها الكانونية
     ومراياها) لا تُنقل إلى هنا إطلاقاً — تبقى بمواضعها التي يقرؤها
     حارسا critical-logic وmirrors بالاسم.
   • التسجيل: قائمة أصول cache-bust.sh (3 مواضع) · حارس الترتيب في
     check-cdn-order.sh · الكاش SWR وقت التشغيل بالمفتاح الكامل شامل
     ?v= — تكافؤ حرفي مع supabase-init.js، ولا مكان له بقوائم تسخين
     sw.js (تلك للأصول ذات الأسماء المرقّمة الثابتة حصراً).
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══ v284 — قفلُ الأزرار الكاتبة (ppBusy) ══════════════════════════════════
   بطاقةُ المريض: من 71 دالةً تكتب بالقاعدة كانت واحدةٌ فقط (savePayment) تقفل
   زرَّها؛ نقرةٌ مزدوجة على «حفظ الجلسة» = جلستان = ذمّةٌ مكرَّرة. الغلافُ يُطبَّق
   على المعالجات المربوطة بأزرار: قفلٌ بالمفتاح (الاسم + أول وسيط) + تعطيلُ الزر
   الذي أطلق الحدث + نصُّ انشغال، والاستعادةُ بـfinally مهما كانت النتيجة. */
var _ppInFlight = {};
function ppBusyStart(key, label) {
  if (_ppInFlight[key]) return null;
  var btn = null;
  try {
    var ev = window.event;
    var t = ev && (ev.currentTarget || ev.target);
    if (t && t.closest) btn = t.closest('button');
  } catch (_) {}
  if (!btn && document.activeElement && document.activeElement.tagName === 'BUTTON') btn = document.activeElement;
  _ppInFlight[key] = true;
  var old = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    if (label) btn.textContent = (old.trim().length <= 3 || /^[^\w\u0600-\u06FF]*$/.test(old.trim())) ? '⏳' : label;
  }
  return function () { delete _ppInFlight[key]; if (btn) { btn.disabled = false; btn.textContent = old; } };
}
function ppGuarded(name, inner, label) {
  return async function () {
    var k = name + ((arguments.length && (typeof arguments[0] === 'string' || typeof arguments[0] === 'number')) ? ':' + arguments[0] : '');
    var done = ppBusyStart(k, label);
    if (!done) return;
    try { return await inner.apply(this, arguments); }
    finally { done(); }
  };
}


/* ─────────────────────────────────────────────────────────────────────
   [استخراج ١ — 26 تموز 2026] وحدة ربط العائلة، منقولة حرفياً (بايت-بايت)
   من patient-profile.html — البرهان بإعادة التركيب داخل كومِت النقل.
   ───────────────────────────────────────────────────────────────────── */
/* ═══ Backlog #6 (M94): family/household linking — navigation only ═══
   patients.family_id = free-grouping uuid (nullable). Finances stay 100%
   individual; the financial guarantor concept is deliberately deferred
   (it touches FIFO). Link algorithm is merge-safe across 5 cases. */
var familyCache = null;    // members of the current family — null = not fetched
var famCandidates = [];    // link-modal candidate list

function _famIsMissingColErr(e){
  return !!(e && (e.code === '42703' || e.code === 'PGRST204') &&
    String(e.message || '').indexOf('family_id') !== -1);
}
function _famSeqOf(id){
  var i = (patients || []).findIndex(function(p){ return p.id === id; });
  return i === -1 ? '' : '#' + (i + 1);
}
function _famNorm(s){
  return String(s || '').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
    .replace(/ـ/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function _famUnlinkedHint(bar, unBtn, cnt){
  bar.innerHTML = '<span style="font-size:12.5px;color:var(--text2);">غير مرتبط بعائلة — اربط الأخوة/الأهل للتنقّل السريع بينهم.</span>';
  if (unBtn) unBtn.style.display = 'none';
  if (cnt) cnt.textContent = '';
}
async function renderFamily(){
  var card = document.getElementById('familyCard');
  var bar  = document.getElementById('familyBar');
  var unBtn = document.getElementById('famUnlinkBtn');
  var cnt  = document.getElementById('familyCount');
  if (!card || !bar) return;
  var fid = patient && patient.family_id;
  if (!fid) { familyCache = []; _famUnlinkedHint(bar, unBtn, cnt); return; }
  var r = await window.sb.from('patients').select('id,name,family_id')
    .eq('doctor_id', currentUser.id).eq('family_id', fid).order('created_at', { ascending: true });
  if (r.error) { _famUnlinkedHint(bar, unBtn, cnt); return; }
  var members = r.data || [];
  familyCache = members;
  if (members.length <= 1) { _famUnlinkedHint(bar, unBtn, cnt); return; }   /* defensive: orphan family of one */
  if (cnt) cnt.textContent = '(' + members.length + ')';
  if (unBtn) unBtn.style.display = '';
  var html = '';
  members.forEach(function(m){
    if (m.id === patientId) {
      html += '<span class="fam-chip me"><span class="fam-seq">' + escapeHtml(_famSeqOf(m.id)) + '</span>' + escapeHtml(m.name || '—') + '</span>';
    } else {
      html += '<a class="fam-chip" href="patient-profile.html?id=' + encodeURIComponent(m.id) + '" title="فتح ملف ' + escapeHtml(m.name || '') + '">'
            + '<span class="fam-seq">' + escapeHtml(_famSeqOf(m.id)) + '</span>' + escapeHtml(m.name || '—') + '</a>';
    }
  });
  bar.innerHTML = html;
}
async function openFamilyLinkModal(){
  var r = await window.SyDentFetchAll(function(){ return window.sb.from('patients').select('id,name,phone,family_id')
    .eq('doctor_id', currentUser.id).order('name', { ascending: true }); });
  if (r.error) {
    if (_famIsMissingColErr(r.error)) showToast('⚠️ يلزم تطبيق Migration 94 لتفعيل ربط العائلة');
    else showToast('⚠️ ' + r.error.message);
    return;
  }
  var myFid = patient && patient.family_id;
  famCandidates = (r.data || []).filter(function(p){
    if (p.id === patientId) return false;                    /* never self */
    if (myFid && p.family_id === myFid) return false;        /* already family */
    return true;
  });
  document.getElementById('famSearch').value = '';
  famRenderCands(famCandidates);
  document.getElementById('famLinkModal').style.display = 'flex';
}
function famRenderCands(list){
  var box = document.getElementById('famCandList');
  if (!list.length) { box.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:12.5px;padding:18px 0;">لا نتائج</div>'; return; }
  var html = '';
  list.slice(0, 60).forEach(function(p){
    html += '<div onclick="linkToFamily(\'' + escapeHtml(p.id) + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;background:var(--bg3);">'
          + '<span class="fam-seq">' + escapeHtml(_famSeqOf(p.id)) + '</span>'
          + '<span style="font-weight:700;font-size:13px;color:var(--text);">' + escapeHtml(p.name || '—') + '</span>'
          + (p.phone ? '<span style="font-size:11.5px;color:var(--text2);margin-inline-start:auto;">' + escapeHtml(p.phone) + '</span>' : '')
          + (p.family_id ? '<span style="font-size:10.5px;color:var(--purple);font-weight:800;">ضمن عائلة</span>' : '')
          + '</div>';
  });
  if (list.length > 60) html += '<div style="text-align:center;color:var(--text2);font-size:11.5px;">أُظهرت أول 60 نتيجة — ضيّق البحث</div>';
  box.innerHTML = html;
}
function famFilter(){
  var q = _famNorm(document.getElementById('famSearch').value);
  if (!q) { famRenderCands(famCandidates); return; }
  famRenderCands(famCandidates.filter(function(p){
    return _famNorm(p.name).indexOf(q) !== -1 || String(p.phone || '').indexOf(q) !== -1;
  }));
}
var linkToFamily = ppGuarded('linkToFamily', _linkToFamily_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _linkToFamily_inner(otherId) {
  var other = famCandidates.find(function(p){ return p.id === otherId; });
  if (!other) return;
  var myFid = (patient && patient.family_id) || null;
  var otherFid = other.family_id || null;
  var err = null;
  if (myFid && otherFid && myFid === otherFid) { /* already linked (filtered, but defensive) */ }
  else if (myFid && otherFid) {
    /* merge: adopt the other's ENTIRE family into mine — families never split */
    var rA = await window.sb.from('patients').update({ family_id: myFid })
      .eq('doctor_id', currentUser.id).eq('family_id', otherFid);
    err = rA.error;
  } else if (myFid && !otherFid) {
    var rB = await window.sb.from('patients').update({ family_id: myFid })
      .eq('doctor_id', currentUser.id).eq('id', otherId);
    err = rB.error;
  } else if (!myFid && otherFid) {
    var rC = await window.sb.from('patients').update({ family_id: otherFid })
      .eq('doctor_id', currentUser.id).eq('id', patientId);
    if (!rC.error) patient.family_id = otherFid;
    err = rC.error;
  } else {
    var newFid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
          var rr = Math.random()*16|0; return (c === 'x' ? rr : (rr&0x3|0x8)).toString(16);
        });
    var rD = await window.sb.from('patients').update({ family_id: newFid })
      .eq('doctor_id', currentUser.id).in('id', [patientId, otherId]);
    if (!rD.error) patient.family_id = newFid;
    err = rD.error;
  }
  if (err) {
    if (_famIsMissingColErr(err)) showToast('⚠️ يلزم تطبيق Migration 94 لتفعيل ربط العائلة');
    else showToast('⚠️ ' + err.message);
    return;
  }
  if (window.logAudit) window.logAudit('family.link', {
    patientId: patientId, patientName: (patient && patient.name) || '',
    description: 'ربط بعائلة مع: ' + (other.name || '')
  });
  document.getElementById('famLinkModal').style.display = 'none';
  showToast('✅ تم الربط بالعائلة');
  renderFamily();
}
var unlinkFromFamily = ppGuarded('unlinkFromFamily', _unlinkFromFamily_inner, '⏳');   /* v284: قفل + انشغال */
async function _unlinkFromFamily_inner() {
  var fid = patient && patient.family_id;
  if (!fid) return;
  if (!await SyDialog.confirm({ message: 'فكّ ربط هذا المريض عن العائلة؟ (لا يؤثر على أي بيانات مالية أو سريرية)', danger: false })) return;
  var r = await window.sb.from('patients').update({ family_id: null })
    .eq('doctor_id', currentUser.id).eq('id', patientId);
  if (r.error) { showToast('⚠️ ' + r.error.message); return; }
  patient.family_id = null;
  /* orphan collapse: a family of one is meaningless — clear the last remaining member too */
  var rest = await window.sb.from('patients').select('id')
    .eq('doctor_id', currentUser.id).eq('family_id', fid);
  if (!rest.error && rest.data && rest.data.length === 1) {
    await window.sb.from('patients').update({ family_id: null })
      .eq('doctor_id', currentUser.id).eq('id', rest.data[0].id);
  }
  if (window.logAudit) window.logAudit('family.unlink', {
    patientId: patientId, patientName: (patient && patient.name) || ''
  });
  showToast('↩️ فُكّ الربط عن العائلة');
  renderFamily();
}
/* ═══ end family linking ═══ */

/* ─────────────────────────────────────────────────────────────────────
   [استخراج ٢ — 26 تموز 2026] قوالب سجل الزرعات (M99) + القوالب السريرية
   (Backlog #9 / M95) — وحدتان متجاورتان نُقلتا كقصّة واحدة حرفياً
   (بايت-بايت) من patient-profile.html — البرهان بإعادة التركيب.
   ───────────────────────────────────────────────────────────────────── */
/* ═══ قوالب سجل الزرعات (Migration 99) — نظير post_op_templates حرفياً ═══
   قوالب المالك المشتركة عبر كل المرضى. طبقة توثيق فقط: صفر كتابة مالية.
   الحمولة = المواصفة القابلة لإعادة الاستخدام (ماركة/Ref/قطر/طول/ملاحظات)؛
   Lot # والتواريخ مستثناة (خاصة بكل سجل). CRUD غير مُدقّق (نظير postop). */
async function loadImplantTemplates() {
  if (!currentUser) return;
  try {
    var res = await window.sb.from('implant_templates')
      .select('id, name, brand, ref_no, diameter, length, notes, created_at')
      .eq('owner_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (!res.error && res.data) IMPLANT_TEMPLATES = res.data;
  } catch (e) { /* graceful (pre-M99) */ IMPLANT_TEMPLATES = []; }
}

function implantPopulateTemplatePicker() {
  var sel = document.getElementById('implantTemplatePick');
  if (!sel) return;
  var opts = '<option value="">— بلا قالب —</option>';
  IMPLANT_TEMPLATES.forEach(function(t){
    opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
  });
  sel.innerHTML = opts;
  sel.value = '';
}

function implantApplyTemplate(tid) {
  if (!tid) return;
  var tpl = null;
  for (var i=0;i<IMPLANT_TEMPLATES.length;i++) if (IMPLANT_TEMPLATES[i].id === tid) { tpl = IMPLANT_TEMPLATES[i]; break; }
  if (!tpl) return;
  // نملأ المواصفة فقط — Lot # والتواريخ تبقى فارغة (خاصة بكل زرعة فيزيائية).
  var _sb = document.getElementById('ilBrand');    if (_sb) _sb.value = tpl.brand || '';
  var _sr = document.getElementById('ilRef');      if (_sr) _sr.value = tpl.ref_no || '';
  var _sd = document.getElementById('ilDiameter'); if (_sd) _sd.value = (tpl.diameter !== null && tpl.diameter !== undefined) ? tpl.diameter : '';
  var _sl = document.getElementById('ilLength');   if (_sl) _sl.value = (tpl.length !== null && tpl.length !== undefined) ? tpl.length : '';
  var _sn = document.getElementById('ilNotes');    if (_sn && tpl.notes) _sn.value = tpl.notes;
}

async function openImplantTemplatesModal() {
  if (!IMPLANT_TEMPLATES.length) { try { await loadImplantTemplates(); } catch(e){} }
  renderImplantTemplatesList();
  openModal('implantTemplatesModal');
}

function renderImplantTemplatesList() {
  var el = document.getElementById('implantTemplatesList');
  if (!el) return;
  if (!IMPLANT_TEMPLATES.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2);">'
      + '<div style="font-size:30px;">🦴</div>'
      + '<div style="margin-top:8px;font-size:13px;">لا قوالب بعد. أنشئ قالباً لإعادة استخدامه مع أي مريض.</div></div>';
    return;
  }
  el.innerHTML = IMPLANT_TEMPLATES.map(function(t){
    var spec = [];
    if (t.brand) spec.push(escapeHtml(t.brand));
    var dim = '';
    if (t.diameter !== null && t.diameter !== undefined && t.diameter !== '') dim += '⌀' + escapeHtml(String(t.diameter));
    if (t.length !== null && t.length !== undefined && t.length !== '') dim += (dim ? '×' : '') + escapeHtml(String(t.length));
    if (dim) spec.push(dim + ' مم');
    if (t.ref_no) spec.push('Ref: ' + escapeHtml(t.ref_no));
    var specLine = spec.length ? '<span dir="ltr" style="unicode-bidi:isolate;">' + spec.join(' — ') + '</span>' : '';
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;color:var(--text);">' + escapeHtml(t.name) + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + (specLine ? specLine : '<span style="opacity:.6;">— بلا مواصفة —</span>') + '</div>'
      + '</div>'
      + '<div class="sy-acts">'
        + '<button class="sy-act" onclick="openImplantTemplateEdit(\'' + t.id + '\')">✏️ تعديل</button>'
        + '<button class="sy-act sy-act-danger" onclick="deleteImplantTemplate(\'' + t.id + '\')">🗑️ حذف</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

function openImplantTemplateEdit(id) {
  _implantEditingTemplateId = id || null;
  var tpl = null;
  if (id) { for (var i=0;i<IMPLANT_TEMPLATES.length;i++) if (IMPLANT_TEMPLATES[i].id === id) { tpl = IMPLANT_TEMPLATES[i]; break; } }
  document.getElementById('implantTplTitle').textContent = tpl ? '✏️ تعديل قالب' : '🦴 قالب زرعة جديد';
  document.getElementById('implantTplName').value     = tpl ? (tpl.name || '') : '';
  document.getElementById('implantTplBrand').value    = tpl ? (tpl.brand || '') : '';
  document.getElementById('implantTplRef').value      = tpl ? (tpl.ref_no || '') : '';
  document.getElementById('implantTplDiameter').value = (tpl && tpl.diameter !== null && tpl.diameter !== undefined) ? tpl.diameter : '';
  document.getElementById('implantTplLength').value   = (tpl && tpl.length !== null && tpl.length !== undefined) ? tpl.length : '';
  document.getElementById('implantTplNotes').value    = tpl ? (tpl.notes || '') : '';
  var btn = document.getElementById('implantTplSaveBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'حفظ القالب'; }
  openModal('implantTemplateEditModal');
}

async function saveImplantTemplate() {
  if (_saveImplantTplInFlight) return;
  var name  = (document.getElementById('implantTplName').value || '').trim();
  if (!name) { showToast('⚠️ اكتب اسم القالب'); return; }
  var brand  = (document.getElementById('implantTplBrand').value || '').trim();
  var refNo  = (document.getElementById('implantTplRef').value || '').trim();
  var diaRaw = parseFloat(document.getElementById('implantTplDiameter').value);
  var lenRaw = parseFloat(document.getElementById('implantTplLength').value);
  var notes  = (document.getElementById('implantTplNotes').value || '').trim();
  var payload = {
    name: name,
    brand: brand || null, ref_no: refNo || null,
    diameter: (diaRaw > 0) ? diaRaw : null, length: (lenRaw > 0) ? lenRaw : null,
    notes: notes || null
  };

  _saveImplantTplInFlight = true;
  var btn = document.getElementById('implantTplSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
  try {
    if (_implantEditingTemplateId) {
      var upd = await window.sb.from('implant_templates')
        .update(payload)
        .eq('id', _implantEditingTemplateId).eq('owner_id', currentUser.id);
      if (upd.error) throw upd.error;
    } else {
      payload.owner_id = currentUser.id;
      var insr = await window.sb.from('implant_templates').insert(payload);
      if (insr.error) throw insr.error;
    }
    _implantEditingTemplateId = null;
    closeModal('implantTemplateEditModal');
    await loadImplantTemplates();
    renderImplantTemplatesList();      // حدّث قائمة المودال إن كان مفتوحاً
    implantPopulateTemplatePicker();   // حدّث الـ dropdown بمودال الزرعة
    showToast('تم حفظ القالب ✓');
  } catch (e) {
    if (_isImplantTplTableMissing(e)) showToast('⚠️ يلزم Migration 99 لتفعيل قوالب الزرعات');
    else { console.error('saveImplantTemplate:', e); showToast('⚠️ تعذّر حفظ القالب'); }
  } finally {
    _saveImplantTplInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'حفظ القالب'; }
  }
}

var deleteImplantTemplate = ppGuarded('deleteImplantTemplate', _deleteImplantTemplate_inner, 'جارٍ الحذف…');   /* v285: قفل + انشغال */
async function _deleteImplantTemplate_inner(id) {
  var tpl = null;
  for (var i=0;i<IMPLANT_TEMPLATES.length;i++) if (IMPLANT_TEMPLATES[i].id === id) { tpl = IMPLANT_TEMPLATES[i]; break; }
  var nm = tpl ? tpl.name : 'هذا القالب';
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + nm + '» نهائياً؟', danger: true })) return;
  try {
    var del = await window.sb.from('implant_templates').delete().eq('id', id).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    await loadImplantTemplates();
    renderImplantTemplatesList();
    implantPopulateTemplatePicker();
    showToast('تم حذف القالب');
  } catch (e) {
    if (_isImplantTplTableMissing(e)) showToast('⚠️ يلزم Migration 99 لتفعيل قوالب الزرعات');
    else { console.error('deleteImplantTemplate:', e); showToast('⚠️ تعذّر حذف القالب'); }
  }
}

/* ═══ Backlog #9 (M95): clinical note templates — OpenDental Quick Notes parity ═══
   Reusable templates for the session notes field. Literal clone of the proven
   post_op_templates layer, minus treatment_key. CRUD not audited (parity with
   post-op templates); the note itself stays covered by session.create. */
var SN_TEMPLATES = null;   // null = not fetched yet; [] = fetched (possibly empty)

function _snTplIsMissingTableErr(e){
  return !!(e && (e.code === '42P01' || e.code === 'PGRST205' ||
    String(e.message || '').indexOf('clinical_note_templates') !== -1));
}
async function snTplRefresh(){
  try {
    if (SN_TEMPLATES === null) {
      var res = await window.sb.from('clinical_note_templates')
        .select('id, name, body, created_at')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (res.error) return;            /* pre-M95: row stays hidden silently (#264) */
      SN_TEMPLATES = res.data || [];
    }
    ['snTplRow','snTplRow2'].forEach(function(id){
      var row = document.getElementById(id);
      if (row) row.style.display = '';  /* table reachable → show even with 0 templates (discoverability of 💾) */
    });
    snTplPopulate();
    snTplGlowSync();   /* covers programmatic default notes set before modal open */
  } catch (e) { /* graceful */ }
}
function snTplGlowSync(){
  /* UX (owner feedback): the save button lights up the moment the notes box
     has text, making the button↔textarea relationship obvious. */
  [['sNotes','snTplSaveBtn'],['toothNotes','snTplSaveBtn2']].forEach(function(pair){
    var ta = document.getElementById(pair[0]);
    var btn = document.getElementById(pair[1]);
    if (ta && btn) btn.classList.toggle('lit', ta.value.trim() !== '');
  });
}
function snTplPopulate(){
  var opts = '<option value="">— بلا قالب —</option>';
  (SN_TEMPLATES || []).forEach(function(t){
    opts += '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
  });
  ['snTplPick','snTplPick2'].forEach(function(id){
    var sel = document.getElementById(id);
    if (sel) { sel.innerHTML = opts; sel.value = ''; }
  });
}
function snTplApply(tid, taId){
  if (!tid) return;
  var tpl = (SN_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!tpl) return;
  var ta = document.getElementById(taId || 'sNotes');
  var cur = ta.value.trim();
  /* append-safe (OpenDental Quick Notes): never overwrite what the doctor typed */
  ta.value = cur ? (cur + '\n' + (tpl.body || '')) : (tpl.body || '');
  snTplGlowSync();   /* .value assignment doesn't fire oninput */
}
var snTplSaveCurrent = ppGuarded('snTplSaveCurrent', _snTplSaveCurrent_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _snTplSaveCurrent_inner(taId, selId) {
  var body = document.getElementById(taId || 'sNotes').value.trim();
  if (!body) { showToast('⚠️ اكتب نص الملاحظة أولاً ثم احفظه كقالب'); return; }
  var name = await SyDialog.prompt({ title: 'اسم القالب', message: 'اكتب اسماً للقالب' });
  if (name === null) return;
  name = name.trim();
  if (!name) { showToast('⚠️ الاسم مطلوب'); return; }
  var res = await window.sb.from('clinical_note_templates')
    .insert({ owner_id: currentUser.id, name: name, body: body })
    .select().single();
  if (res.error) {
    if (_snTplIsMissingTableErr(res.error)) showToast('⚠️ يلزم تطبيق Migration 95 لتفعيل قوالب الملاحظات');
    else showToast('⚠️ ' + res.error.message);
    return;
  }
  SN_TEMPLATES = [res.data].concat(SN_TEMPLATES || []);   /* newest first — matches order() */
  snTplPopulate();
  var _sel = document.getElementById(selId || 'snTplPick');
  if (_sel) _sel.value = res.data.id;
  showToast('✅ حُفظ القالب «' + name + '»');
}
var snTplDeleteSelected = ppGuarded('snTplDeleteSelected', _snTplDeleteSelected_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _snTplDeleteSelected_inner(selId) {
  var sel = document.getElementById(selId || 'snTplPick');
  var tid = sel && sel.value;
  if (!tid) { showToast('⚠️ اختر قالباً من القائمة أولاً'); return; }
  var tpl = (SN_TEMPLATES || []).find(function(t){ return t.id === tid; });
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + ((tpl && tpl.name) || '') + '»؟ (لا يؤثر على أي ملاحظات محفوظة سابقاً)', danger: true })) return;
  var res = await window.sb.from('clinical_note_templates')
    .delete().eq('id', tid).eq('owner_id', currentUser.id);
  if (res.error) { showToast('⚠️ ' + res.error.message); return; }
  SN_TEMPLATES = (SN_TEMPLATES || []).filter(function(t){ return t.id !== tid; });
  snTplPopulate();
  showToast('🗑 حُذف القالب');
}
/* ═══ end clinical note templates ═══ */

/* ─────────────────────────────────────────────────────────────────────
   [استخراج ٣ — 26 تموز 2026] وضع التحديد المتعدد (M86) — نمط الجذع
   المُستبقى: التعريفات هنا، والتنفيذان top-level (علم الوضع + مستمع ESC)
   بقيا بالكتلة الرئيسية حرفياً بموضعيهما — العلامتان أدناه تحددان مكانيهما
   الأصليين، والبرهان بإعادة التركيب العكوس داخل كومِت النقل.
   ───────────────────────────────────────────────────────────────────── */
/* ═══════════════ M86: multi-select batch mode ═══════════════
   OpenDental parity: "select multiple teeth before clicking a procedure button —
   the program loops through each tooth and repeats the logic". One ledger session
   per tooth in a single save (M85.2 loop pattern). Financial statuses only
   (completed/planned) — non-billable multi-stamping already lives in exam mode.
   Palette restricted to whole-tooth treatments (whole/extraction/implant/
   crown_full); surface/root/bridge/spacer/socket/regional keep their dedicated
   flows (matches OpenDental: tooth-range units are excluded from the loop). */
/* [الجذع المُستبقى بالكتلة الرئيسية: تهيئة علم الوضع window.__batchMode] */
var batchSel = [];                      // مواضع محددة {n, s} — السطح محلول لحظة النقر عبر examRouteSurface
var batchSelectedKey = null;            // العلاج المختار من اللوحة (العلاج أولاً — تكافؤ الفحص الأولي)
var batchDefaultStatus = 'completed';   // chips الشريط (منجز/مخطط) — المودال يبقى الكلمة الأخيرة

function renderBatchStatusChips() {
  var sc = document.getElementById('batchStatusChips');
  if (!sc) return;
  var opts = [['completed', 'منجز'], ['planned', 'مخطط']];
  sc.innerHTML = opts.map(function(o){
    return '<button type="button" class="exam-chip' + (batchDefaultStatus === o[0] ? ' selected' : '') + '" '
         + 'onclick="batchSetStatus(\'' + o[0] + '\')">' + o[1] + '</button>';
  }).join('');
}
function batchSetStatus(s) { batchDefaultStatus = s; renderBatchStatusChips(); }

/* دمج مواضع السن الواحد بوحدات مركّبة — حشوة متعددة الأسطح = جلسة واحدة
   بكود مركّب (MOD…)، وجذور السن الواحد = جلسة واحدة (R1R2…) — بنفس أكواد
   المسار الفردي حرفياً (buildCompositeCode / buildRootComposite) فيبقى
   المخطط والدفتر متطابقين مع الإدخال الفردي. WHOLE/CROWN_FULL تمرّ كما هي. */
function _batchMergedUnits() {
  var byTooth = {}, order = [];
  for (var i = 0; i < batchSel.length; i++) {
    var e = batchSel[i];
    if (!byTooth[e.n]) { byTooth[e.n] = { letters: [], roots: [], specials: [] }; order.push(e.n); }
    var g = byTooth[e.n];
    if (e.s === 'WHOLE' || e.s === 'CROWN_FULL') g.specials.push(e.s);
    else if (isRootCode(e.s)) g.roots.push(e.s);
    else g.letters.push(e.s);
  }
  order.sort(function(a, b){ return a - b; });
  var units = [];
  for (var j = 0; j < order.length; j++) {
    var n = order[j], g2 = byTooth[n];
    if (g2.letters.length) units.push({ n: n, s: buildCompositeCode(g2.letters) });
    if (g2.roots.length)   units.push({ n: n, s: buildRootComposite(g2.roots) });
    for (var k = 0; k < g2.specials.length; k++) units.push({ n: n, s: g2.specials[k] });
  }
  return units;
}
/* التسميات تُشتق من كود السطح الفعلي (لا من target_part) — صادقة دائماً،
   بما فيها علاجات «تاج وجذر» (both) التي لا يغطيها تفريع target_part. */
function _batchPosLbl(n, surface) {
  if (surface === 'CROWN_FULL') return 'تاج';
  if (surface === 'WHOLE') return 'كامل';
  if (isRootCode(surface)) return rootAreaLabelFor(surface, n);
  return surfLabelFor(surface, n);
}
function _batchAreaLbl(n, surface) {
  if (surface === 'CROWN_FULL') return 'التاج كامل';
  if (surface === 'WHOLE') return 'السن كاملاً';
  if (isRootCode(surface)) return rootAreaLabelFor(surface, n);
  return 'السطح ' + surfLabelFor(surface, n);
}

function toggleBatchMode() {
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  if (window.__historyMode) { showToast('🕰️ أنهِ العرض التاريخي أولاً'); return; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }
  if (!window.__batchMode) {
    if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
      showToast('🔒 حسابك غير نشط — لا يمكن تسجيل علاجات'); return;
    }
    loadTreatmentsFromSupabase().then(function(){ renderBatchPalette(); });
    window.__batchMode = true;
    batchSel = [];
    batchSelectedKey = null;
    batchDefaultStatus = 'completed';
    renderBatchStatusChips();
    // Provider: same OpenDental-style default resolver as the modal (silent).
    var _pool = (CLINIC_DOCTORS || []).filter(function(d){ return d.is_active !== false; });
    if (!_pool.length) _pool = CLINIC_DOCTORS || [];
    pendingProviderId = _pool.length ? getDefaultProviderId(_pool) : null;
    document.body.classList.add('batch-on');
    var tb = document.getElementById('batchToggleBtn'); if (tb) tb.style.display = 'none';
    var ce = document.getElementById('batchCountEl'); if (ce) ce.textContent = '0';
    showToast('☑️ وضع التحديد المتعدد — اختر علاجاً ثم انقر المواضع على المخطط');
  } else {
    batchClearSelection();
    batchSelectedKey = null;
    window.__batchApplySel = null;
    window.__batchMode = false;
    document.body.classList.remove('batch-on');
    var tb2 = document.getElementById('batchToggleBtn'); if (tb2) tb2.style.display = 'block';
  }
}

function batchClearSelection() {
  batchSel = [];
  batchSyncUI();
}

/* مزامنة الواجهة من batchSel: إبراز خلايا الأسنان + العدّاد + سطر الملخّص */
function batchSyncUI() {
  var sel = document.querySelectorAll('.tooth-cell.batch-sel');
  for (var i = 0; i < sel.length; i++) sel[i].classList.remove('batch-sel');
  var pos = document.querySelectorAll('.batch-pos-sel');
  for (var i2 = 0; i2 < pos.length; i2++) pos[i2].classList.remove('batch-pos-sel');
  var seen = {};
  for (var j = 0; j < batchSel.length; j++) {
    var nn = batchSel[j].n, ss = batchSel[j].s;
    if (ss === 'WHOLE' || ss === 'CROWN_FULL') {
      // موضع «سن كامل / تاج كامل» → إبراز الخلية كاملة (المعنى مطابق للبصر)
      if (!seen[nn]) {
        seen[nn] = true;
        var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + nn + '"]');
        if (cell) cell.classList.add('batch-sel');
      }
    } else {
      // موضع سطحي/جذري → تلوين العنصر المنقور نفسه (بالمنظرين الوجهي والإطباقي)
      var els = document.querySelectorAll(
        '.crown-surface[data-tooth="' + nn + '"][data-surface="' + ss + '"], ' +
        '.root-part[data-tooth="' + nn + '"][data-surface="' + ss + '"]');
      for (var k = 0; k < els.length; k++) els[k].classList.add('batch-pos-sel');
    }
  }
  var units = _batchMergedUnits();
  var ce = document.getElementById('batchCountEl'); if (ce) ce.textContent = units.length;
  var sm = document.getElementById('batchSelSummary');
  if (sm) {
    if (!units.length) { sm.style.display = 'none'; sm.textContent = ''; }
    else {
      var parts = units.map(function(e){ return e.n + ' ' + _batchPosLbl(e.n, e.s); });
      sm.textContent = 'الجلسات: ' + parts.join(' · ');
      sm.style.display = 'block';
    }
  }
}

/* نقرة المخطط بوضع الدفعة — العلاج أولاً، والسطح يُوجَّه بنفس مسار الفحص الأولي
   حرفياً (examRouteSurface): حشوة = السطح المنقور · جذري = الجذر المنقور ·
   كامل/قلع/زراعة/تاج = السن كاملاً. نقرة ثانية على الموضع نفسه = إلغاء. */
function batchToggleAt(n, clickedSurface) {
  if (!batchSelectedKey) { showToast('👆 اختر علاجاً من شريط التحديد أولاً'); return; }
  var t = getTreatment(batchSelectedKey);
  if (!t) { showToast('⚠️ العلاج المختار غير موجود'); return; }
  var tp = t.target_part || 'crown';
  var s = examRouteSurface(n, clickedSurface, tp);
  var idx = -1;
  for (var i = 0; i < batchSel.length; i++) {
    if (batchSel[i].n === n && batchSel[i].s === s) { idx = i; break; }
  }
  if (idx >= 0) {
    batchSel.splice(idx, 1);
  } else {
    var v = batchAllowed(n, t, s);
    if (!v.ok) { showToast('⚠️ السن ' + n + ': ' + v.msg); return; }
    batchSel.push({ n: n, s: s });
  }
  batchSyncUI();
}

function renderBatchPalette() {
  var pal = document.getElementById('batchPalette');
  if (!pal) return;
  var list = [];
  for (var i = 0; i < TREATMENTS.length; i++) {
    var t = TREATMENTS[i];
    if (t.is_active === false) continue;
    var tp = t.target_part || 'crown';
    if (tp === 'quadrant' || tp === 'arch' || tp === 'mouth') continue;            // regional → مساره الخاص
    if (tp === 'bridge') continue;                                                 // جسر = وحدة متعددة الأسنان → المسار الفردي
    if (t.post_extraction === true) continue;                                      // socket flow → normal
    if (typeof isSpacerTreatment === 'function' && isSpacerTreatment(t)) continue; // gap-unit flow → normal
    list.push(t);
  }
  list.sort(function(a, b){ return (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0); });
  pal.innerHTML = list.length ? list.map(function(t){
    // NB: in-memory TREATMENTS use .id (= treatment_key string) — same as examPick.
    return '<button type="button" class="exam-tx' + (batchSelectedKey === t.id ? ' selected' : '') + '" '
         + 'style="border-color:' + t.fill + ';" '
         + 'onclick="batchPickTx(\'' + t.id + '\')">'
         + '<span class="lbl" style="background:' + t.fill + ';border:1px solid ' + t.stroke + ';"></span>'
         + '<span>' + escapeHtml(t.name) + '</span></button>';
  }).join('') : '<div style="font-size:12px;color:var(--text2);padding:6px;">لا توجد علاجات سنّية مفعّلة</div>';
}

/* Per-tooth eligibility — mirror of the modal isAllowed + the save-time clinical
   guards, restricted to the four batch target_parts. */
function batchAllowed(n, t, s) {
  var tp = t.target_part || 'crown';
  if (typeof txDentitionOk === 'function' && !txDentitionOk(t, n)) return { ok: false, msg: txDentitionMsg(t) };   /* M146 */
  if (isImplant(n)) return { ok: false, msg: 'مزروع' };
  var smN = teethMap[String(n)] || {};
  if (isExtracted(n) && isBridgeKey(smN.PONTIC)) return { ok: false, msg: 'فجوة جسر' };
  if (isBridgeAbut(n)) {
    if (tp === 'implant' || tp === 'extraction') return { ok: false, msg: 'دعامة جسر' };
    // حشوة سطحية تحت تاج دعامة — غير منطقي؛ العمل الجذري عبر التاج مسموح.
    // مع «تاج وجذر» (both) يُحكم بالموضع الفعلي: سطح تاجي = رفض، جذر = سماح.
    var _sTaj = (s !== undefined && s !== null && s !== '') ? !isRootCode(s) && s !== 'WHOLE' && s !== 'CROWN_FULL' : (tp === 'crown');
    if (tp === 'crown' || (tp === 'both' && _sTaj)) return { ok: false, msg: 'دعامة جسر' };
    return { ok: true };
  }
  if (isExtracted(n)) {
    if (tp !== 'implant') return { ok: false, msg: 'مقلوع' };
    if (isPrimaryTooth(n)) return { ok: false, msg: 'لبني مقلوع' };
    return { ok: true };
  }
  if (tp === 'implant') return { ok: false, msg: 'سن قائم — الزراعة تُخطَّط على موقع مقلوع (سجّل القلع أولاً ولو مخططاً)' };
  if (tp === 'extraction' && typeof toothHasSpacer === 'function' && toothHasSpacer(n)) return { ok: false, msg: 'عليه حافظ مسافة' };
  return { ok: true };
}

/* اختيار العلاج من اللوحة — تغيير العلاج مع وجود مواضع محددة يصفّرها
   (توجيه السطح يتبع العلاج، فخلط توجيهين = مواضع مبهمة). */
function batchPickTx(key) {
  if (batchSelectedKey === key) return;
  if (batchSel.length) {
    batchSel = [];
    showToast('☑️ تغيّر العلاج — أُلغي التحديد السابق');
  }
  batchSelectedKey = key;
  renderBatchPalette();
  batchSyncUI();
}

/* زر «تطبيق» بالشريط — إعادة تحقق شاملة ثم فتح مودال التكلفة. */
function batchApply() {
  if (!batchSelectedKey) { showToast('👆 اختر علاجاً من الشريط أولاً'); return; }
  if (!batchSel.length) { showToast('👆 انقر موضعاً واحداً على الأقل من المخطط'); return; }
  var t = getTreatment(batchSelectedKey);
  if (!t) { showToast('⚠️ العلاج المختار غير موجود'); return; }
  // Validate EVERY selected position up front — abort listing the bad ones
  // (deterministic: no partial-surprise sessions).
  var units = _batchMergedUnits();
  var bad = [];
  for (var i = 0; i < units.length; i++) {
    var v = batchAllowed(units[i].n, t, units[i].s);
    if (!v.ok) bad.push(units[i].n + ' (' + v.msg + ')');
  }
  if (bad.length) { showToast('⚠️ أسنان غير مؤهلة لهذا العلاج: ' + bad.join('، ')); return; }
  batchOpenApplyModal(t, units);
}

/* Open the existing toothModal Step-2 in batch context: same cost/date/notes/
   provider fields. Statuses are scoped to completed/planned by the body.batch-on
   CSS rule (zero cleanup needed on cancel). Lab button hidden — a lab order
   links to ONE session. */
function batchOpenApplyModal(t, units) {
  units = units || _batchMergedUnits();
  pendingToothStatus = t.id;
  pendingToothLabel  = t.name;
  if (typeof bumpTxUsage === 'function') bumpTxUsage(t.id);
  // Defensive: clear any stale regional/bridge state (same as pickToothTreatment).
  pendingRegionalType = null; pendingRegionalQuadrant = null;
  pendingRegionalQuadrants = []; pendingRegionalArch = null;
  pendingBridgeExtra = { mesial: 0, distal: 0 };
  window.__batchApplySel = units.slice();   // وحدات مدموجة: جلسة لكل وحدة
  var tp = t.target_part || 'crown';
  currentSurface = units.length ? units[0].s : 'WHOLE';
  currentTooth = units.length ? units[0].n : null;   // price/provider helpers expect a tooth; the save loop iterates per unit
  document.getElementById('toothStep1').style.display = 'none';
  document.getElementById('toothStep2').style.display = 'block';
  document.getElementById('toothFoot').style.display  = 'flex';
  syncOrthoField();          // batch treatments aren't ortho → keeps the field hidden
  renderBridgeUnitChips();   // hides itself (not a bridge treatment — palette excludes bridges)
  var posList = units.map(function(e){ return e.n + ' ' + _batchPosLbl(e.n, e.s); });
  document.getElementById('toothStep2Title').textContent =
    '🦷 ' + t.name + ' — ' + units.length + ' ' + (units.length === 1 ? 'جلسة' : 'جلسات') + ' (' + posList.join('، ') + ')';
  /* عنوان المودال بمسار الدفعة: كان لا يُكتب إطلاقاً فيبقى عالقاً على آخر
     فتحة مودال سن مفرد بسنّها وعلاجها — السطر الأخضر تحته صحيح دائماً
     والمحفوظ سليم (حلقة الحفظ تقرأ الوحدات المحدّدة لا العنوان، والعنوان
     لا يُقرأ من أي كود) — لكن قراءةً مضلّلة بمستوى «قلع على سن آخر»
     لا تُترك على مستند سريري. مرآة سلوك المسار الإقليمي حرفياً. */
  document.getElementById('toothModalTitle').textContent =
    '☑️ تحديد متعدد — ' + units.length + (units.length === 1 ? ' موضع' : ' مواضع');
  document.getElementById('toothNotes').value = '';
  document.getElementById('toothDate').value  = toDay();
  pendingTreatStatus = batchDefaultStatus || 'completed';
  document.querySelectorAll('#toothStatusPicker .status-opt').forEach(function(b){
    if (b.getAttribute('data-status') === pendingTreatStatus) b.classList.add('selected');
    else b.classList.remove('selected');
  });
  var _crbB = document.getElementById('condReviewBox');
  if (_crbB) _crbB.style.display = 'none';
  pendingReviewMonths = 3;
  var costElB = document.getElementById('toothCost');
  if (costElB) { costElB.readOnly = false; costElB.style.opacity = ''; costElB.style.cursor = ''; costElB.title = ''; }
  populateProviderPicker();
  document.getElementById('toothCost').value = getPriceForDoctor(t, pendingProviderId);
  if (typeof toothUnitsSetup === 'function') toothUnitsSetup(null, 0);   /* v425: الدفعة = وحدة لكل سن ⇒ الحقل مخفيّ */
  /* تركيب مبدّل العملة: مسار الدفعة يفتح المودال بنفسه ولا يمرّ من
     openToothModal، فكان المبدّل لا يُركّب له قطّ — وما كان يُرى أحياناً بقايا
     فتحة سن مفرد سابقة لا تهيئةً لهذا المسار. التركيب يسبق set عمداً بنفس
     ترتيب مسار السن المفرد المُجرّب: mount تردّ لعملة العيادة ثم set تطبّق
     عملة العلاج — والنداءان متجاوران هنا فلا يتوقّف الصواب على بُعدٍ بينهما. */
  if (typeof mountToothCostPicker === 'function') mountToothCostPicker();
  /* M125: المبدّل يتبع عملة العلاج المختار */
  try { if (t && t.currency) window.SyDentCurPick.set('toothCost', (t.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
  var defaultNoteB = (t.completion_note || t.default_note || '').trim();
  if (defaultNoteB) document.getElementById('toothNotes').value = defaultNoteB;
  document.getElementById('toothLabBtn').style.display = 'none';
  var _rlbB = document.getElementById('regionalLabBtn'); if (_rlbB) _rlbB.style.display = 'none';
  // M86-lab: the batch flow gets its OWN button (saveBatchAndOpenLab) — the two
  // buttons above are hard-wired to tooth/regional savers that write through
  // currentTooth/currentSurface, which the batch loop does not use. Shown only
  // for lab-flagged treatments; one lab order will be created per tooth.
  var _blbB = document.getElementById('batchLabBtn');
  // بوابة الخطة: زر الدفعة سطح إنشاء (طلب مخبر لكل سن).
  var _blbOk = (typeof labsPlanOk !== 'function') || labsPlanOk();
  if (_blbB) _blbB.style.display = ((typeof needsLab === 'function' && needsLab(t.id)) && _blbOk) ? 'inline-block' : 'none';
  snTplRefresh();   /* M95: quick-note picker in the tooth modal too — non-blocking */
  openModal('toothModal');
  setTimeout(function(){ var c = document.getElementById('toothCost'); if (c) { c.focus(); c.select(); } }, 100);
}

/* [الجذع المُستبقى بالكتلة الرئيسية: مستمع ESC للخروج من الوضع — حفاظاً على ترتيب التسجيل] */
/* ═══════════════ end batch mode ═══════════════ */

/* ─────────────────────────────────────────────────────────────────────
   [استخراج ٤ — 26 تموز 2026] وضع الفحص الأولي (B) — نمط الجذع المُستبقى:
   التعريفات هنا، والتنفيذان top-level (علم الوضع + مستمع ESC) بقيا
   بالكتلة الرئيسية حرفياً بموضعيهما — العلامتان أدناه بمكانيهما الأصليين.
   ───────────────────────────────────────────────────────────────────── */
/* ═══════════════ B: Initial-exam stamp mode ═══════════════
   One-tap charting for a new patient's pre-existing history. Statuses are
   restricted to the NON-BILLABLE set (existing_other / existing_current /
   condition) — completed/planned create ledger sessions and MUST go through
   the normal modal (financial red line). Writes go through
   upsertTeethStatusWithFallback (inherits the M74 review_at fallback).
   Bridge/implant stamps reuse persistSpecialTreatment (Rule #18 — one unit
   logic). No ledger rows are ever created from this mode. */
/* [الجذع المُستبقى بالكتلة الرئيسية: تهيئة علم الوضع window.__examMode] */
var examStatus = 'existing_other';
var examReviewMonths = 3;
var examSelectedKey = null;
var examCount = 0;
var examUndoStack = [];
var EXAM_STATUSES = [
  { v: 'existing_other',   l: 'موجود — من عيادة أخرى' },
  { v: 'existing_current', l: 'موجود — من عيادتنا' },
  { v: 'condition',        l: 'مراقبة' }
];

async function toggleExamMode() {
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  if (window.__historyMode) { showToast('🕰️ أنهِ العرض التاريخي أولاً'); return; }
  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return; }
  if (!window.__examMode) {
    if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
      showToast('🔒 حسابك غير نشط — لا يمكن تسجيل حالات'); return;
    }
    await loadTreatmentsFromSupabase();
    window.__examMode = true;
    examStatus = 'existing_other';
    examReviewMonths = 3;
    examSelectedKey = null;
    examCount = 0;
    examUndoStack = [];
    // Provider: same OpenDental-style default resolver as the modal (silent).
    var _pool = (CLINIC_DOCTORS || []).filter(function(d){ return d.is_active !== false; });
    if (!_pool.length) _pool = CLINIC_DOCTORS || [];
    pendingProviderId = _pool.length ? getDefaultProviderId(_pool) : null;
    document.body.classList.add('exam-on');
    var tb = document.getElementById('examToggleBtn'); if (tb) tb.style.display = 'none';
    renderExamBar();
    showToast('🩺 وضع الفحص الأولي — اختر علاجاً ثم انقر الأسنان');
  } else {
    window.__examMode = false;
    document.body.classList.remove('exam-on');
    var tb2 = document.getElementById('examToggleBtn'); if (tb2) tb2.style.display = 'block';
    showToast('✅ انتهى الفحص الأولي — وُسم ' + examCount + ' موضعاً');
  }
}

function renderExamBar() {
  /* v433: حالةٌ سريرية مختارة ⇒ لا معنى لشرائح «موجود/مراقبة» ولا لموعد المراجعة —
     الحالةُ تُكتب دائماً بـstatus='condition' (examStamp يفرضها). تُخفى الشرائحُ ويظهر سطرُ تعريف. */
  var _examCond = (typeof isConditionKey === 'function') && isConditionKey(examSelectedKey);
  var _ecn = document.getElementById('examCondNote');
  if (_ecn) _ecn.style.display = _examCond ? '' : 'none';
  // Status chips
  var sc = document.getElementById('examStatusChips');
  if (sc) sc.style.display = _examCond ? 'none' : 'flex';
  if (sc) {
    sc.innerHTML = EXAM_STATUSES.map(function(s){
      return '<button type="button" class="exam-chip' + (examStatus === s.v ? ' selected' : '') + '" '
           + 'onclick="examSetStatus(\'' + s.v + '\')">' + s.l + '</button>';
    }).join('');
  }
  // Review-months chips (condition only) — same semantics as Feature A
  var mr = document.getElementById('examMonthsRow');
  if (mr) {
    if (examStatus === 'condition' && !_examCond) {
      var opts = [[3, '3 أشهر'], [6, '6 أشهر'], [12, 'سنة'], [null, 'بلا']];
      mr.innerHTML = '<span style="font-size:12px;color:var(--text2);align-self:center;">⏰ المراجعة:</span>'
        + opts.map(function(o){
            var sel = (examReviewMonths === o[0]);
            return '<button type="button" class="exam-chip' + (sel ? ' selected' : '') + '" '
                 + 'onclick="examSetMonths(' + (o[0] === null ? 'null' : o[0]) + ')">' + o[1] + '</button>';
          }).join('');
      mr.style.display = 'flex';
    } else {
      mr.style.display = 'none'; mr.innerHTML = '';
    }
  }
  // Treatment palette: favorites first, then the rest; tooth-based only.
  var pal = document.getElementById('examPalette');
  if (pal) {
    var list = [];
    for (var i = 0; i < TREATMENTS.length; i++) {
      var t = TREATMENTS[i];
      if (t.is_active === false) continue;
      var tp = t.target_part || 'crown';
      if (tp === 'quadrant' || tp === 'arch' || tp === 'mouth') continue;   // regional → normal flow
      if (typeof isSpacerTreatment === 'function' && isSpacerTreatment(t)) continue; // gap-unit flow → normal
      list.push(t);
    }
    list.sort(function(a, b){ return (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0); });
    pal.innerHTML = list.map(function(t){
      // NB: in-memory TREATMENTS use .id (= treatment_key string) — same identifier
      // txButtonHtml passes to pickToothTreatment. There is NO .treatment_key prop here.
      return '<button type="button" class="exam-tx' + (examSelectedKey === t.id ? ' selected' : '') + '" '
           + 'style="border-color:' + t.fill + ';" '
           + 'onclick="examPick(\'' + t.id + '\')">'
           + '<span class="lbl" style="background:' + t.fill + ';border:1px solid ' + t.stroke + ';"></span>'
           + '<span>' + escapeHtml(t.name) + '</span></button>';
    }).join('');
  }
  /* v433: صفُّ المكتبة السريرية — مستقلٌّ عن علاجات العيادة بنفس منطق الاختيار (examPick) */
  var cpal = document.getElementById('examCondPalette');
  var crow = document.getElementById('examCondRow');
  if (cpal && typeof COND_LIBRARY !== 'undefined') {
    cpal.innerHTML = COND_LIBRARY.map(function(t){
      return '<button type="button" class="exam-tx exam-tx-cond' + (examSelectedKey === t.id ? ' selected' : '') + '" '
           + 'style="border-color:' + t.stroke + ';" '
           + 'onclick="examPick(\'' + t.id + '\')">'
           + '<span class="lbl" style="background:' + t.fill + ';border:1px solid ' + t.stroke + ';"></span>'
           + '<span>' + escapeHtml(t.name) + '</span></button>';
    }).join('');
    if (crow) crow.style.display = '';
  } else if (crow) { crow.style.display = 'none'; }
  var ce = document.getElementById('examCountEl'); if (ce) ce.textContent = examCount;
}
function examSetStatus(s) { examStatus = s; renderExamBar(); }
function examSetMonths(m) { examReviewMonths = m; renderExamBar(); }
function examPick(key) { examSelectedKey = key; renderExamBar(); }
function examReviewAt() {
  if (examStatus !== 'condition' || !examReviewMonths) return null;
  var d = new Date(); d.setMonth(d.getMonth() + examReviewMonths);
  return ppYmdLocal(d);
}
/* Mirror of the modal's isAllowed state rules (minus M61 socket/spacer, which
   stay in the normal flow). */
function examAllowed(n, t) {
  var tp = t.target_part || 'crown';
  if (typeof txDentitionOk === 'function' && !txDentitionOk(t, n)) return { ok: false, msg: '🦷 ' + txDentitionMsg(t) };   /* M146 */
  if (isImplant(n)) return { ok: false, msg: '🔩 سن مزروع — أزل الزراعة من الوضع العادي' };
  var smN = teethMap[String(n)] || {};
  if (isExtracted(n) && isBridgeKey(smN.PONTIC)) return { ok: false, msg: '🔗 دعامة جسر (فجوة) — أزل الجسر من الوضع العادي' };
  if (isBridgeAbut(n)) {
    if (tp === 'implant' || tp === 'extraction' || tp === 'bridge')
      return { ok: false, msg: '🔗 السن دعامة جسر — أزل الجسر أولاً من الوضع العادي' };
    return { ok: true };
  }
  if (isExtracted(n)) {
    if (isPrimaryTooth(n)) return { ok: false, msg: '🦷 سن لبني مقلوع — لا جسر/زراعة عليه' };
    if (tp === 'bridge' || tp === 'implant') return { ok: true };
    return { ok: false, msg: '🕳️ سن مقلوع — يقبل جسراً أو زراعة فقط هنا' };
  }
  return { ok: true };
}
function examRouteSurface(n, clicked, tp) {
  if (tp === 'implant' || tp === 'extraction' || tp === 'whole' || tp === 'bridge') return 'WHOLE';
  if (tp === 'crown_full') return 'CROWN_FULL';
  if (tp === 'root') return /^R[123]$/.test(clicked) ? clicked : 'R1';
  // both (تاج وجذر): نقرة الجذر تبقى على الجذر المنقور — لا تُعاد لمركز التاج
  if (tp === 'both' && /^R[123]$/.test(clicked)) return clicked;
  // crown / both-على-التاج / default
  if (/^R[123]$/.test(clicked) || clicked === 'WHOLE' || clicked === 'CROWN_FULL' || !clicked)
    return centerSurface(n);
  return clicked;
}

var examStamp = ppGuarded('examStamp', _examStamp_inner, '');   /* v284: قفل + انشغال */
async function _examStamp_inner(n, clickedSurface) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل حالات'); return;
  }
  if (!examSelectedKey) { showToast('👆 اختر علاجاً من شريط الفحص أولاً'); return; }
  var t = getTreatment(examSelectedKey);
  if (!t) { showToast('⚠️ العلاج المختار غير موجود'); return; }
  var tp = t.target_part || 'crown';
  /* v433: الحالةُ السريرية بالفحص الأولي — نفس عقد الوضع العادي حرفياً:
     حالةُ السن تُرسى على السطح المحجوز COND، وحالةُ السطح على سطحها المنقور. */
  var _isCond = (typeof isConditionKey === 'function') && isConditionKey(examSelectedKey);
  var s = examRouteSurface(n, clickedSurface, tp);
  if (_isCond && typeof COND_SURFACE !== 'undefined') {
    /* v490 (تكافؤٌ مع الوضع العادي — مراجعةُ الحالات بعد v489): القرارُ يُبنى على **ما نُقر
       فعلاً** لا على ناتج examRouteSurface، لأنها تنقل نقرةَ الجذر و«السن كاملاً» إلى مركز
       التاج (O/I) — فكان قلحٌ يُنقر على الجذر يُسجَّل إطباقياً بصمت، ومنطقُ v434 لـWHOLE ميتاً.
       السنّيةُ ⇒ COND · نقرةُ السن كاملاً/التاج كامل/بلا سطح ⇒ COND (كالمودال) · نقرةُ جذر:
       الكسرُ على ذلك الجذر، والسطحيةُ **تُرفض** (المودالُ لا يعرضها على الجذر أصلاً) ·
       وإلا السطحُ المنقور حرفياً. */
    var _clk = clickedSurface || '';
    if (t.cond_scope === 'tooth' || !_clk || _clk === 'WHOLE' || _clk === 'CROWN_FULL') s = COND_SURFACE;
    else if (/^R[123]$/.test(_clk)) {
      if (t.cond_scope === 'both') s = _clk;
      else { showToast('🩺 «' + t.name + '» حالةٌ سطحية — انقر السطحَ التاجيَّ المطلوب لا الجذر'); return; }
    } else s = _clk;
  }
  var tn = String(n);
  var sm = teethMap[tn] || {};

  // ── Toggle-off: same treatment already on the routed surface → remove it ──
  // Excluded: bridges (multi-row unit — normal-mode remove button handles the
  // whole unit) and extractions carrying a spacer (orphan-wire hazard).
  if (sm[s] === examSelectedKey && !isBridgeKey(examSelectedKey) && tp !== 'bridge') {
    if (tp === 'extraction' && typeof toothHasSpacer === 'function' && toothHasSpacer(n)) {
      showToast('🧷 على السن حافظ مسافة — ألغِ القلع من الوضع العادي'); return;
    }
    var prevStX = (sm.__status || {})[s] || null;
    var prevRvX = (sm.__review || {})[s] || null;
    var dr = await window.sb.from('teeth_status').delete()
      .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
      .eq('tooth_num', tn).eq('surface', s);
    if (dr.error) { showToast('⚠️ ' + dr.error.message); return; }
    delete teethMap[tn][s];
    if (teethMap[tn].__status) delete teethMap[tn].__status[s];
    if (teethMap[tn].__review) delete teethMap[tn].__review[s];
    var _rk = Object.keys(teethMap[tn]).filter(function(k){ return k !== '__status' && k !== '__review'; });
    if (_rk.length === 0) delete teethMap[tn];
    examUndoStack.push({ type: 'unstamp', n: tn, s: s, key: examSelectedKey, st: prevStX, rv: prevRvX });
    examCount = Math.max(0, examCount - 1);
    renderTeeth(); renderStats();
    var ce1 = document.getElementById('examCountEl'); if (ce1) ce1.textContent = examCount;
    return;
  }

  // ── State guards (mirror of modal isAllowed) ──
  var ok = examAllowed(n, t);
  if (!ok.ok) { showToast(ok.msg); return; }
  /* v434: حالةٌ محصورةٌ بأسطحٍ بعينها (تماسٌ مفتوح ⇒ إنسي/وحشي) */
  if (_isCond && typeof condSurfaceNotAllowed === 'function') {
    var _onlyM = condSurfaceNotAllowed(t, s);
    if (_onlyM) { showToast(_onlyM); return; }
  }
  /* v433: حالةُ سطحٍ لا تُكتب فوق علاجٍ مسجَّل — مرآةُ حارس الوضع العادي (v431) */
  if (_isCond && s !== COND_SURFACE && typeof condSurfaceConflict === 'function') {
    var _ecf = condSurfaceConflict(n, s);
    if (_ecf) {
      var _ecfT = getTreatment((teethMap[tn] || {})[_ecf]);
      showToast('🩺 السطح يحمل علاجاً (' + (_ecfT ? _ecfT.name : _ecf) + ') — سجّل الحالة على سطحٍ آخر');
      return;
    }
  }

  // ── Specials: bridge / implant via the shared unit helper (Rule #18) ──
  var implantWiped = false;
  if (tp === 'bridge' || tp === 'implant') {
    currentTooth = n; currentSurface = 'WHOLE';
    pendingToothStatus = examSelectedKey; pendingToothLabel = t.name;
    pendingTreatStatus = examStatus; pendingReviewMonths = examReviewMonths;
    pendingBridgeExtra = { mesial: 0, distal: 0 };   // M85: exam stamps always use the base unit — never inherit modal chips
    if (typeof _altBridge !== 'undefined') _altBridge = null;   /* M145-h: وضعُ «بديل الجسر» لا يُورَّث لختم الفحص */
    var sp = await persistSpecialTreatment();
    bridgeUnitForLedger = null; spacerUnitForLedger = null;   // defensive: never leak into a later normal save
    if (sp.blocked) return;
    if (sp.handled) {   // bridge unit fully written (no ledger — status is non-billable)
      examCount++;
      renderTeeth(); renderStats();
      var ce2 = document.getElementById('examCountEl'); if (ce2) ce2.textContent = examCount;
      showToast('✓ جسر — للتراجع عنه استخدم الوضع العادي');
      return;
    }
    implantWiped = !!sp.implantWiped;   // implant falls through to the plain write
  }

  // ── Plain write ──
  var prevKey = (teethMap[tn] || {})[s] || null;
  var prevSt  = ((teethMap[tn] || {}).__status || {})[s] || null;
  var prevRv  = ((teethMap[tn] || {}).__review || {})[s] || null;
  /* v433: مفتاحُ حالةٍ ⇒ status='condition' دائماً وبلا موعد مراجعة — مهما كانت شريحةُ الفحص */
  var _stW = _isCond ? 'condition' : examStatus;
  var rW = await upsertTeethStatusWithFallback({
    doctor_id: currentUser.id, patient_id: patientId,
    tooth_num: tn, surface: s, treatment_key: examSelectedKey,
    status: _stW, provider_id: pendingProviderId,
    review_at: _isCond ? null : examReviewAt()
  }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
  if (rW.error) { showToast('⚠️ خطأ الحفظ: ' + rW.error.message); return; }
  if (!teethMap[tn]) teethMap[tn] = {};
  teethMap[tn][s] = examSelectedKey;
  if (!teethMap[tn].__status) teethMap[tn].__status = {};
  teethMap[tn].__status[s] = _stW;
  var _rv = _isCond ? null : examReviewAt();
  if (_rv) { if (!teethMap[tn].__review) teethMap[tn].__review = {}; teethMap[tn].__review[s] = _rv; }
  else if (teethMap[tn].__review) delete teethMap[tn].__review[s];
  if (!implantWiped) examUndoStack.push({ type: 'stamp', n: tn, s: s, prevKey: prevKey, prevSt: prevSt, prevRv: prevRv });
  else showToast('✓ زراعة — للتراجع عنها استخدم الوضع العادي');
  examCount++;
  renderTeeth(); renderStats();
  var ce3 = document.getElementById('examCountEl'); if (ce3) ce3.textContent = examCount;
}

var examUndo = ppGuarded('examUndo', _examUndo_inner, '⏳');   /* v284: قفل + انشغال */
async function _examUndo_inner() {
  var a = examUndoStack.pop();
  if (!a) { showToast('لا شيء للتراجع عنه'); return; }
  if (a.type === 'stamp') {
    if (a.prevKey) {   // restore the overwritten row
      var rR = await upsertTeethStatusWithFallback({
        doctor_id: currentUser.id, patient_id: patientId,
        tooth_num: a.n, surface: a.s, treatment_key: a.prevKey,
        status: a.prevSt || 'completed', provider_id: pendingProviderId,
        review_at: a.prevRv || null
      }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
      if (rR.error) { showToast('⚠️ ' + rR.error.message); examUndoStack.push(a); return; }
      teethMap[a.n] = teethMap[a.n] || {};
      teethMap[a.n][a.s] = a.prevKey;
      teethMap[a.n].__status = teethMap[a.n].__status || {};
      teethMap[a.n].__status[a.s] = a.prevSt || 'completed';
      if (a.prevRv) { teethMap[a.n].__review = teethMap[a.n].__review || {}; teethMap[a.n].__review[a.s] = a.prevRv; }
      else if (teethMap[a.n].__review) delete teethMap[a.n].__review[a.s];
    } else {           // the surface was clean before → delete the stamp
      var dU = await window.sb.from('teeth_status').delete()
        .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
        .eq('tooth_num', a.n).eq('surface', a.s);
      if (dU.error) { showToast('⚠️ ' + dU.error.message); examUndoStack.push(a); return; }
      if (teethMap[a.n]) {
        delete teethMap[a.n][a.s];
        if (teethMap[a.n].__status) delete teethMap[a.n].__status[a.s];
        if (teethMap[a.n].__review) delete teethMap[a.n].__review[a.s];
        var _k2 = Object.keys(teethMap[a.n]).filter(function(k){ return k !== '__status' && k !== '__review'; });
        if (_k2.length === 0) delete teethMap[a.n];
      }
    }
    examCount = Math.max(0, examCount - 1);
  } else {             // 'unstamp' → put the removed row back
    var rB = await upsertTeethStatusWithFallback({
      doctor_id: currentUser.id, patient_id: patientId,
      tooth_num: a.n, surface: a.s, treatment_key: a.key,
      status: a.st || examStatus, provider_id: pendingProviderId,
      review_at: a.rv || null
    }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
    if (rB.error) { showToast('⚠️ ' + rB.error.message); examUndoStack.push(a); return; }
    teethMap[a.n] = teethMap[a.n] || {};
    teethMap[a.n][a.s] = a.key;
    teethMap[a.n].__status = teethMap[a.n].__status || {};
    teethMap[a.n].__status[a.s] = a.st || examStatus;
    if (a.rv) { teethMap[a.n].__review = teethMap[a.n].__review || {}; teethMap[a.n].__review[a.s] = a.rv; }
    examCount++;
  }
  renderTeeth(); renderStats();
  var ce = document.getElementById('examCountEl'); if (ce) ce.textContent = examCount;
}
/* [الجذع المُستبقى بالكتلة الرئيسية: مستمع ESC للخروج من الوضع — حفاظاً على ترتيب التسجيل] */
/* ═══════════════ end exam mode ═══════════════ */

/* ─────────────────────────────────────────────────────────────────────
   [استخراج ٥ — 26 تموز 2026] لوحة اللثة الكاملة (D: periodontal charting
   + Perio v2/M93) — منقولة حرفياً (بايت-بايت)، 47 معرّفاً (منها 8 بإعلانات
   مسلسلة بفواصل التقطها البرهان الدلالي vm). perioCalcCal/perioCalPaint
   يقرؤهما حارس المنطق الحرج (اختبارات CAL الـ14) من هذا الملف الآن —
   أعيد توجيه مسار القراءة بنفس كومِت النقل، والعضّ مُثبَت 0→1→0.
   ───────────────────────────────────────────────────────────────────── */
/* ═══════════════ D: periodontal charting ═══════════════
   Dated full-mouth snapshots (M77): 6-site probing depths, 6-site BOP,
   mobility. Presentation/clinical layer only — zero contact with the
   financial system. Extraction state is read from the LIVE chart even if
   the user happens to be inside the historical view. */
var perioInited = false, perioExams = [], perioCurrent = null;
var perioRows = {}, perioLoadedTeeth = {}, perioDirty = false;
var perioCompare = false, perioMaxSeq = 0, perioCmpLocked = [], perioCmpPrev = null;
var PERIO_B = ['mb','b','db'], PERIO_L = ['ml','l','dl'];

function perioIsExtracted(n){
  /* C3 (v489): «غير بازغ» لا مواقعَ سبرٍ له ⇒ يُعامَل بالبريو كغائب (خلاياه معطّلة،
     لا يُعدّ بالأسنان، «×» بالطباعة) — بالمسند نفسه الذي يقرؤه كلُّ البريو، ومن الخريطة
     **الحيّة** كالقلع تماماً. الاسمُ باقٍ كي لا تتغيّر ثمانيةُ مواضع نداء. */
  var _skip = function(){ return isExtracted(n) || (typeof condPerioSkip === 'function' && condPerioSkip(teethMap[String(n)])); };
  if (!window.__historyMode) return _skip();
  var saved = teethMap;                       // history mode swaps the global map;
  teethMap = liveTeethMapRef || teethMap;     // extraction must follow the LIVE chart
  var r = _skip();
  teethMap = saved;
  return r;
}
function perioDocName(id){
  var d = (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS || []).find(function(x){ return x.id === id; });
  return d ? d.name : '';
}
function initPerioTab(){
  if (perioInited) return;
  perioInited = true;
  loadPerioExams(null);
}

async function loadPerioExams(selectId){
  var r = await window.sb.from('perio_exams')
    .select('id, provider_id, exam_date, notes, created_at')
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .order('exam_date', { ascending: false }).order('created_at', { ascending: false });
  if (r.error) {
    if (r.error.code === '42P01' || String(r.error.message || '').indexOf('perio_exams') !== -1) {
      showToast('⚠️ يلزم تطبيق Migration 77 (مخطط اللثة)');
    } else showToast('⚠️ ' + r.error.message);
    return;
  }
  perioExams = r.data || [];
  var sel = document.getElementById('perioExamSel');
  sel.innerHTML = perioExams.map(function(e){
    var nm = perioDocName(e.provider_id);
    return '<option value="' + e.id + '">' + fmtD(e.exam_date) + (nm ? ' — ' + escapeHtml(nm) : '') + '</option>';
  }).join('');
  var has = perioExams.length > 0;
  document.getElementById('perioEmpty').style.display = has ? 'none' : 'block';
  document.getElementById('perioBody').style.display  = has ? 'block' : 'none';
  ['perioCompareBtn','perioPrintBtn','perioDelBtn','perioSaveBtn'].forEach(function(id){
    var b = document.getElementById(id); if (b) b.disabled = !has;
  });
  sel.style.display = has ? '' : 'none';
  if (!has) { perioCurrent = null; return; }
  var pick = selectId && perioExams.some(function(e){ return e.id === selectId; }) ? selectId : perioExams[0].id;
  sel.value = pick;
  await perioLoadExamData(pick);
}

async function perioLoadExamData(id){
  var r = await window.sb.from('perio_measurements').select('*')
    .eq('doctor_id', currentUser.id).eq('exam_id', id);
  if (r.error) { showToast('⚠️ ' + r.error.message); return; }
  perioRows = {}; perioLoadedTeeth = {};
  (r.data || []).forEach(function(row){ perioRows[row.tooth_num] = row; perioLoadedTeeth[row.tooth_num] = 1; });
  perioCurrent = perioExams.find(function(e){ return e.id === id; }) || null;
  perioExitCompareState();
  perioDirty = false;
  renderPerioGrid();
}

async function perioPickExam(id){   /* v461: async — مستدعاها onchange فقط */
  if (!id || (perioCurrent && id === perioCurrent.id)) return;
  if (perioDirty && !await SyDialog.confirm({ title: 'تعديلات غير محفوظة', danger: true,
        message: 'لديك تعديلات غير محفوظة — تجاهلها والانتقال؟', confirmText: 'تجاهل وانتقال' })) {
    document.getElementById('perioExamSel').value = perioCurrent ? perioCurrent.id : '';
    return;
  }
  perioLoadExamData(id);
}

/* ── grid ── */
function perioCellInputs(t, sites, dis){
  var out = '';
  for (var i = 0; i < sites.length; i++) {
    var f = 'pd_' + sites[i];
    var row = perioRows[t] || {};
    var v = (row[f] === 0 || row[f]) ? row[f] : '';
    out += '<input type="text" inputmode="numeric" maxlength="2" class="pd-in" data-t="' + t + '" data-f="' + f + '"'
        + (dis ? ' disabled' : '') + ' value="' + v + '"'
        + ' oninput="perioPdInput(this)" onkeydown="perioPdKey(event,this)">';
  }
  return out;
}
/* ── Perio v2 (M93): recession + derived CAL + molar furcation ── */
function perioIsMolar(t){ return (t % 10) >= 6; }
function perioCellRec(t, sites, dis){
  var out = '';
  for (var i = 0; i < sites.length; i++) {
    var f = 'rec_' + sites[i];
    var row = perioRows[t] || {};
    var v = (row[f] === 0 || row[f]) ? row[f] : '';
    out += '<input type="text" inputmode="numeric" maxlength="2" class="pd-in rec" data-t="' + t + '" data-f="' + f + '"'
        + (dis ? ' disabled' : '') + ' value="' + v + '"'
        + ' oninput="perioRecInput(this)" onkeydown="perioPdKey(event,this)">';
  }
  return out;
}
function perioCellCal(t, sites){
  var out = '';
  for (var i = 0; i < sites.length; i++) {
    out += '<span class="cal-cell" data-t="' + t + '" data-s="' + sites[i] + '">–</span>';
  }
  return out;
}
function perioFurcCell(t, dis){
  if (!perioIsMolar(t)) return '<span class="furc-na">—</span>';
  var row = perioRows[t] || {};
  var v = (row.furcation === 0 || row.furcation) ? row.furcation : '';
  return '<input type="text" inputmode="numeric" maxlength="1" class="pd-in mob furc" data-t="' + t + '" data-f="furcation"'
      + (dis ? ' disabled' : '') + ' value="' + v + '" oninput="perioMobInput(this)" onkeydown="perioPdKey(event,this)">';
}
/* CAL = PD + Recession (empty recession counts as 0; no PD → no CAL). Derived only — never stored. */
function perioCalcCal(t, s){
  var panel = document.getElementById('tab-perio');
  var pe = panel && panel.querySelector('input[data-t="' + t + '"][data-f="pd_' + s + '"]');
  var re = panel && panel.querySelector('input[data-t="' + t + '"][data-f="rec_' + s + '"]');
  var pd = pe && pe.value !== '' ? parseInt(pe.value, 10) : null;
  var rec = re && re.value !== '' ? parseInt(re.value, 10) : 0;
  return pd === null ? null : pd + rec;
}
function perioCalPaint(t, s){
  var panel = document.getElementById('tab-perio');
  var c = panel && panel.querySelector('.cal-cell[data-t="' + t + '"][data-s="' + s + '"]');
  if (!c) return;
  var v = perioCalcCal(t, s);
  c.textContent = v === null ? '–' : v;
  c.classList.remove('cal-warn','cal-danger');
  if (v !== null) { if (v >= 5) c.classList.add('cal-danger'); else if (v >= 3) c.classList.add('cal-warn'); }
}
function perioCalPaintAll(){
  UPPER_T.concat(LOWER_T).forEach(function(t){
    PERIO_B.concat(PERIO_L).forEach(function(s){ perioCalPaint(t, s); });
  });
}
function perioRecInput(el){
  var v = el.value.replace(/\D/g, '').slice(0, 2);
  if (v !== '' && parseInt(v, 10) > 19) v = '19';
  el.value = v;
  perioCalPaint(el.dataset.t, el.dataset.f.slice(4));
  perioDirty = true;
  updatePerioStats();
  if (v.length === 2 || (v.length === 1 && v !== '1')) perioFocusSeq(parseInt(el.dataset.seq, 10) + 1, 1);
}
/* Pre-M93 detector (#250): 42703/PGRST204 naming a v2 column → strip and retry. */
function perioIsV2ColErr(e){
  return !!(e && (e.code === '42703' || e.code === 'PGRST204') &&
    (String(e.message || '').indexOf('rec_') !== -1 || String(e.message || '').indexOf('furcation') !== -1));
}
/* ── end perio v2 helpers ── */
function perioCellDots(t, sites, dis){
  var out = '';
  for (var i = 0; i < sites.length; i++) {
    var f = 'bop_' + sites[i];
    var on = perioRows[t] && perioRows[t][f];
    out += '<button type="button" class="bop-dot' + (on ? ' on' : '') + (dis ? ' dis' : '') + '" data-t="' + t + '" data-f="' + f + '" onclick="perioBop(this)"></button>';
  }
  return out;
}
function perioArchHtml(arr, lingLabel){
  var head = '<tr><th class="perio-lbl"></th>';
  var pdB = '<tr><td class="perio-lbl">عمق — دهليزي</td>';
  var boB = '<tr><td class="perio-lbl">نزف — دهليزي</td>';
  var pdL = '<tr class="pg-sep"><td class="perio-lbl">عمق — ' + lingLabel + '</td>';
  var boL = '<tr><td class="perio-lbl">نزف — ' + lingLabel + '</td>';
  var mob = '<tr class="pg-sep"><td class="perio-lbl">الحركة (0-3)</td>';
  var recB = '<tr><td class="perio-lbl lbl-rec">انحسار — دهليزي</td>';
  var calB = '<tr class="row-cal"><td class="perio-lbl lbl-cal">CAL — دهليزي</td>';
  var recL = '<tr><td class="perio-lbl lbl-rec">انحسار — ' + lingLabel + '</td>';
  var calL = '<tr class="row-cal"><td class="perio-lbl lbl-cal">CAL — ' + lingLabel + '</td>';
  var furc = '<tr><td class="perio-lbl">تشعب (1-3) — أرحاء</td>';
  for (var i = 0; i < arr.length; i++) {
    var t = arr[i], dis = perioIsExtracted(t);
    var cls = (dis ? 'pg-ex' : '') + (i === 8 ? (dis ? ' ' : '') + 'pg-mid' : '');
    var ex = cls ? ' class="' + cls + '"' : '';
    head += '<th' + ex + '>' + t + '</th>';
    pdB += '<td' + ex + '>' + perioCellInputs(t, PERIO_B, dis) + '</td>';
    boB += '<td' + ex + '>' + perioCellDots(t, PERIO_B, dis) + '</td>';
    pdL += '<td' + ex + '>' + perioCellInputs(t, PERIO_L, dis) + '</td>';
    boL += '<td' + ex + '>' + perioCellDots(t, PERIO_L, dis) + '</td>';
    recB += '<td' + ex + '>' + perioCellRec(t, PERIO_B, dis) + '</td>';
    calB += '<td' + ex + '>' + perioCellCal(t, PERIO_B) + '</td>';
    recL += '<td' + ex + '>' + perioCellRec(t, PERIO_L, dis) + '</td>';
    calL += '<td' + ex + '>' + perioCellCal(t, PERIO_L) + '</td>';
    furc += '<td' + ex + '>' + perioFurcCell(t, dis) + '</td>';
    var mrow = perioRows[t] || {};
    var mv = (mrow.mobility === 0 || mrow.mobility) ? mrow.mobility : '';
    mob += '<td' + ex + '><input type="text" inputmode="numeric" maxlength="1" class="pd-in mob" data-t="' + t + '" data-f="mobility"'
        + (dis ? ' disabled' : '') + ' value="' + mv + '" oninput="perioMobInput(this)" onkeydown="perioPdKey(event,this)"></td>';
  }
  return head + '</tr>' + pdB + '</tr>' + recB + '</tr>' + calB + '</tr>' + boB + '</tr>'
       + pdL + '</tr>' + recL + '</tr>' + calL + '</tr>' + boL + '</tr>'
       + mob + '</tr>' + furc + '</tr>';
}
function renderPerioGrid(){
  document.getElementById('perioUpper').innerHTML = perioArchHtml(UPPER_T, 'حنكي');
  document.getElementById('perioLower').innerHTML = perioArchHtml(LOWER_T, 'لساني');
  var panel = document.getElementById('tab-perio'), seq = 0;
  panel.querySelectorAll('input.pd-in:not(.mob)').forEach(function(el){ el.dataset.seq = ++seq; });
  panel.querySelectorAll('input.pd-in.mob').forEach(function(el){ el.dataset.seq = ++seq; });
  perioMaxSeq = seq;
  panel.querySelectorAll('input.pd-in:not(.mob):not(.rec)').forEach(perioPaint);
  perioCalPaintAll();
  updatePerioStats();
  // M141-ب: وضعُ القراءة — القياساتُ تُعرض ولا تُكتب
  if (window.SyDentSub && window.SyDentSub.isReadOnly()) {
    panel.querySelectorAll('input.pd-in').forEach(function(el){ el.readOnly = true; });
  }
}

/* ── input behaviour ── */
function perioPaint(el){
  el.classList.remove('pd-warn','pd-danger');
  var n = parseInt(el.value, 10);
  if (!isNaN(n)) { if (n >= 6) el.classList.add('pd-danger'); else if (n >= 4) el.classList.add('pd-warn'); }
}
function perioFocusSeq(s, dir){
  var panel = document.getElementById('tab-perio');
  while (s >= 1 && s <= perioMaxSeq) {
    var el = panel.querySelector('.pd-in[data-seq="' + s + '"]');
    if (el && !el.disabled) { el.focus(); el.select(); return; }
    s += dir;
  }
}
function perioPdInput(el){
  var v = el.value.replace(/\D/g, '').slice(0, 2);
  if (v !== '' && parseInt(v, 10) > 19) v = '19';
  el.value = v;
  perioPaint(el);
  perioCalPaint(el.dataset.t, el.dataset.f.slice(3));
  perioDirty = true;
  updatePerioStats();
  if (v.length === 2 || (v.length === 1 && v !== '1')) perioFocusSeq(parseInt(el.dataset.seq, 10) + 1, 1);
}
function perioMobInput(el){
  var v = el.value.replace(/\D/g, '').slice(0, 1);
  if (v !== '' && parseInt(v, 10) > 3) v = '3';
  el.value = v;
  perioDirty = true;
  if (v !== '') perioFocusSeq(parseInt(el.dataset.seq, 10) + 1, 1);
}
function perioPdKey(e, el){
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); perioFocusSeq(parseInt(el.dataset.seq, 10) + 1, 1); }
  else if (e.key === 'Backspace' && el.value === '') { e.preventDefault(); perioFocusSeq(parseInt(el.dataset.seq, 10) - 1, -1); }
}
function perioBop(el){
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  if (perioCompare) return;
  el.classList.toggle('on');
  perioDirty = true;
  updatePerioStats();
}

/* ── indicators ── */
function updatePerioStats(){
  var panel = document.getElementById('tab-perio');
  var w4 = 0, w6 = 0, bopOn = 0, bopAll = 0, teeth = 0;
  UPPER_T.concat(LOWER_T).forEach(function(t){ if (!perioIsExtracted(t)) teeth++; });
  panel.querySelectorAll('input.pd-in:not(.mob):not(.rec):not(:disabled)').forEach(function(el){
    var n = parseInt(el.value, 10);
    if (!isNaN(n)) { if (n >= 6) w6++; else if (n >= 4) w4++; }
  });
  panel.querySelectorAll('.bop-dot:not(.dis)').forEach(function(d){ bopAll++; if (d.classList.contains('on')) bopOn++; });
  var cal5 = 0;
  UPPER_T.concat(LOWER_T).forEach(function(t){
    if (perioIsExtracted(t)) return;
    PERIO_B.concat(PERIO_L).forEach(function(s){
      var cv = perioCalcCal(t, s);
      if (cv !== null && cv >= 5) cal5++;
    });
  });
  var pct = bopAll ? Math.round(bopOn * 100 / bopAll) : 0;
  var cp = (perioCompare && perioCmpPrev) ? perioCmpPrev : null;
  document.getElementById('perioStats').innerHTML =
    '<span>أسنان مفحوصة: ' + teeth + '</span>' +
    '<span style="border-color:var(--red);">نزف BOP: ' + pct + '٪' + (cp ? ' (كان ' + cp.pct + '٪)' : '') + '</span>' +
    '<span style="border-color:var(--yellow);">مواقع ≥4مم: ' + w4 + (cp ? ' (كان ' + cp.w4 + ')' : '') + '</span>' +
    '<span style="border-color:var(--red);">مواقع ≥6مم: ' + w6 + (cp ? ' (كان ' + cp.w6 + ')' : '') + '</span>' +
    '<span style="border-color:var(--purple);">CAL ≥5مم: ' + cal5 + (cp && cp.cal5 !== undefined ? ' (كان ' + cp.cal5 + ')' : '') + '</span>';
}

/* ── save ── */
var perioSave = ppGuarded('perioSave', _perioSave_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _perioSave_inner() {
  if (!perioCurrent || perioCompare) return;
  var panel = document.getElementById('tab-perio');
  var rows = [], cleared = [];
  UPPER_T.concat(LOWER_T).forEach(function(t){
    if (perioIsExtracted(t)) return;
    var row = { doctor_id: currentUser.id, exam_id: perioCurrent.id, tooth_num: t }, any = false;
    PERIO_B.concat(PERIO_L).forEach(function(s){
      var f = 'pd_' + s, el = panel.querySelector('input[data-t="' + t + '"][data-f="' + f + '"]');
      var v = el && el.value !== '' ? parseInt(el.value, 10) : null;
      row[f] = v; if (v !== null) any = true;
      var bf = 'bop_' + s, d = panel.querySelector('.bop-dot[data-t="' + t + '"][data-f="' + bf + '"]');
      var on = !!(d && d.classList.contains('on'));
      row[bf] = on; if (on) any = true;
    });
    var mEl = panel.querySelector('input[data-t="' + t + '"][data-f="mobility"]');
    row.mobility = mEl && mEl.value !== '' ? parseInt(mEl.value, 10) : null;
    if (row.mobility !== null) any = true;
    PERIO_B.concat(PERIO_L).forEach(function(s){
      var rf = 'rec_' + s, rEl = panel.querySelector('input[data-t="' + t + '"][data-f="' + rf + '"]');
      var rv = rEl && rEl.value !== '' ? parseInt(rEl.value, 10) : null;
      row[rf] = rv; if (rv !== null) any = true;
    });
    var fEl = panel.querySelector('input[data-t="' + t + '"][data-f="furcation"]');
    row.furcation = fEl && fEl.value !== '' ? parseInt(fEl.value, 10) : null;
    if (row.furcation !== null) any = true;
    if (any) rows.push(row);
    else if (perioLoadedTeeth[t]) cleared.push(t);
  });
  if (rows.length) {
    var r1 = await window.sb.from('perio_measurements').upsert(rows, { onConflict: 'exam_id,tooth_num' });
    if (r1.error && perioIsV2ColErr(r1.error)) {
      var slim = rows.map(function(r0){
        var c = Object.assign({}, r0);
        PERIO_B.concat(PERIO_L).forEach(function(s){ delete c['rec_' + s]; });
        delete c.furcation;
        return c;
      });
      r1 = await window.sb.from('perio_measurements').upsert(slim, { onConflict: 'exam_id,tooth_num' });
      if (!r1.error) showToast('⚠️ حُفظ الجسّ فقط — يلزم تطبيق Migration 93 لحفظ الانحسار والتشعب');
    }
    if (r1.error) { showToast('⚠️ ' + r1.error.message); return; }
  }
  if (cleared.length) {
    var r2 = await window.sb.from('perio_measurements').delete()
      .eq('doctor_id', currentUser.id).eq('exam_id', perioCurrent.id).in('tooth_num', cleared);
    if (r2.error) { showToast('⚠️ ' + r2.error.message); return; }
  }
  perioLoadedTeeth = {};
  rows.forEach(function(r){ perioLoadedTeeth[r.tooth_num] = 1; });
  perioDirty = false;
  if (window.logAudit) window.logAudit('perio.update', {
    examId: perioCurrent.id, examDate: perioCurrent.exam_date,
    patientId: patientId, patientName: (patient && patient.name) || '', teeth: rows.length
  });
  showToast('💾 حُفظ فحص اللثة (' + rows.length + ' سناً)');
}

/* ── new / delete ── */
async function perioNewExam(){   /* v461: async — مستدعاها onclick فقط */
  if (perioDirty && !await SyDialog.confirm({ title: 'تعديلات غير محفوظة', danger: true,
        message: 'لديك تعديلات غير محفوظة — المتابعة بدونها؟', confirmText: 'متابعة بدونها' })) return;
  document.getElementById('perioNewDate').value = _fmtYmd(new Date());
  document.getElementById('perioNewNotes').value = '';
  var def = '';
  try { def = getDefaultProviderId() || ''; } catch(_e) {}
  if (!def && CLINIC_DOCTORS && CLINIC_DOCTORS.length) def = CLINIC_DOCTORS[0].id;
  document.getElementById('perioNewProv').innerHTML =
    '<option value="">—</option>' + (CLINIC_DOCTORS || []).map(function(d){
      return '<option value="' + d.id + '"' + (d.id === def ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>';
    }).join('');
  document.getElementById('perioCopyWrap').style.display = perioExams.length ? 'flex' : 'none';
  document.getElementById('perioNewCopy').checked = perioExams.length > 0;
  document.getElementById('perioNewModal').style.display = 'flex';
}
var perioCreateExam = ppGuarded('perioCreateExam', _perioCreateExam_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _perioCreateExam_inner() {
  var d = document.getElementById('perioNewDate').value;
  if (!d) { showToast('⚠️ حدّد تاريخ الفحص'); return; }
  var prov = document.getElementById('perioNewProv').value || null;
  var notes = document.getElementById('perioNewNotes').value.trim() || null;
  var ins = await window.sb.from('perio_exams').insert({
    doctor_id: currentUser.id, patient_id: patientId, provider_id: prov, exam_date: d, notes: notes
  }).select().single();
  if (ins.error) { showToast('⚠️ ' + ins.error.message); return; }
  if (document.getElementById('perioNewCopy').checked && perioExams.length) {
    var prev = await window.sb.from('perio_measurements').select('*')
      .eq('doctor_id', currentUser.id).eq('exam_id', perioExams[0].id);
    if (!prev.error && prev.data && prev.data.length) {
      var copies = prev.data.map(function(m){
        var c = Object.assign({}, m);
        delete c.id; c.exam_id = ins.data.id;
        return c;
      });
      var cr = await window.sb.from('perio_measurements').insert(copies);
      if (cr.error) showToast('⚠️ تعذّر نسخ القيم: ' + cr.error.message);
    }
  }
  if (window.logAudit) window.logAudit('perio.create', {
    examId: ins.data.id, examDate: d, patientId: patientId, patientName: (patient && patient.name) || ''
  });
  document.getElementById('perioNewModal').style.display = 'none';
  perioDirty = false;
  showToast('✅ أُنشئ فحص اللثة');
  await loadPerioExams(ins.data.id);
}
var perioDeleteExam = ppGuarded('perioDeleteExam', _perioDeleteExam_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _perioDeleteExam_inner() {
  if (!perioCurrent) return;
  if (!await SyDialog.confirm({ message: 'حذف فحص ' + fmtD(perioCurrent.exam_date) + ' نهائياً مع كل قياساته؟', danger: true })) return;
  var r = await window.sb.from('perio_exams').delete()
    .eq('doctor_id', currentUser.id).eq('id', perioCurrent.id);
  if (r.error) { showToast('⚠️ ' + r.error.message); return; }
  if (window.logAudit) window.logAudit('perio.delete', {
    examId: perioCurrent.id, examDate: perioCurrent.exam_date,
    patientId: patientId, patientName: (patient && patient.name) || ''
  });
  showToast('🗑 حُذف الفحص');
  perioDirty = false;
  await loadPerioExams(null);
}

/* ── compare with previous exam ── */
function perioExitCompareState(){
  var panel = document.getElementById('tab-perio');
  panel.querySelectorAll('.pd-in').forEach(function(el){
    el.classList.remove('cmp-worse','cmp-better'); el.readOnly = false; el.title = '';
  });
  panel.querySelectorAll('.bop-dot').forEach(function(d){
    d.classList.remove('cmp-worse','cmp-better'); d.title = '';
  });
  perioCmpLocked.forEach(function(d){ d.style.pointerEvents = ''; });
  perioCmpLocked = [];
  perioCmpPrev = null;
  perioCompare = false;
  var b = document.getElementById('perioCompareBtn');
  if (b) b.textContent = '🔍 مقارنة بالسابق';
  var sv = document.getElementById('perioSaveBtn');
  if (sv && perioExams.length) sv.disabled = false;
  updatePerioStats();
}
async function perioToggleCompare(){
  if (perioCompare) { perioExitCompareState(); return; }
  if (!perioCurrent) return;
  var idx = perioExams.findIndex(function(e){ return e.id === perioCurrent.id; });
  var prev = idx >= 0 ? perioExams[idx + 1] : null;
  if (!prev) { showToast('لا يوجد فحص أسبق للمقارنة'); return; }
  var r = await window.sb.from('perio_measurements').select('*')
    .eq('doctor_id', currentUser.id).eq('exam_id', prev.id);
  if (r.error) { showToast('⚠️ ' + r.error.message); return; }
  var pm = {}; (r.data || []).forEach(function(row){ pm[row.tooth_num] = row; });
  var panel = document.getElementById('tab-perio');
  panel.querySelectorAll('input.pd-in:not(:disabled)').forEach(function(el){
    el.readOnly = true;
    var t = el.dataset.t, f = el.dataset.f;
    var cur = el.value === '' ? null : parseInt(el.value, 10);
    var pv = pm[t] && (pm[t][f] === 0 || pm[t][f]) ? pm[t][f] : null;
    if (cur === null && pv === null) return;
    if (cur !== null && pv !== null) {
      if (cur > pv) el.classList.add('cmp-worse');
      else if (cur < pv) el.classList.add('cmp-better');
      el.title = 'كان: ' + pv;
    } else if (pv !== null) { el.title = 'كان: ' + pv + ' — الآن فارغ'; }
    else { el.title = 'جديد (لم يُقَس سابقاً)'; }
  });
  panel.querySelectorAll('.bop-dot:not(.dis)').forEach(function(d){
    d.style.pointerEvents = 'none'; perioCmpLocked.push(d);
    var now = d.classList.contains('on');
    var was = !!(pm[d.dataset.t] && pm[d.dataset.t][d.dataset.f]);
    if (now && !was) { d.classList.add('cmp-worse'); d.title = 'نزف جديد (لم يكن ينزف)'; }
    else if (!now && was) { d.classList.add('cmp-better'); d.title = 'توقف النزف (كان ينزف)'; }
  });
  /* previous-exam summary for the stats chips */
  var pOn = 0, pAll = 0, p4 = 0, p6 = 0, pCal5 = 0;
  UPPER_T.concat(LOWER_T).forEach(function(t){
    if (perioIsExtracted(t)) return;
    var row = pm[t] || {};
    PERIO_B.concat(PERIO_L).forEach(function(s){
      pAll++;
      if (row['bop_' + s]) pOn++;
      var v = row['pd_' + s];
      if (v === 0 || v) {
        if (v >= 6) p6++; else if (v >= 4) p4++;
        if (v + (row['rec_' + s] || 0) >= 5) pCal5++;
      }
    });
  });
  perioCmpPrev = { pct: pAll ? Math.round(pOn * 100 / pAll) : 0, w4: p4, w6: p6, cal5: pCal5 };
  perioCompare = true;
  updatePerioStats();
  document.getElementById('perioCompareBtn').textContent = '✕ إنهاء المقارنة (مقابل ' + fmtD(prev.exam_date) + ')';
  document.getElementById('perioSaveBtn').disabled = true;
  showToast('🔍 مقارنة بفحص ' + fmtD(prev.exam_date));
}

/* ── print ── */
/* Snapshot live perio values straight from the DOM inputs/dots so print matches
   exactly what's on screen — regardless of dirty/saved state. perioRows is only
   the load-time baseline and is never updated on type or save. */
function perioSnapshotFromDom(){
  var panel = document.getElementById('tab-perio');
  var snap = {};
  UPPER_T.concat(LOWER_T).forEach(function(t){
    var row = {};
    PERIO_B.concat(PERIO_L).forEach(function(s){
      var el = panel && panel.querySelector('input[data-t="' + t + '"][data-f="pd_' + s + '"]');
      row['pd_' + s] = (el && el.value !== '') ? parseInt(el.value, 10) : null;
      var d = panel && panel.querySelector('.bop-dot[data-t="' + t + '"][data-f="bop_' + s + '"]');
      row['bop_' + s] = !!(d && d.classList.contains('on'));
    });
    var mEl = panel && panel.querySelector('input[data-t="' + t + '"][data-f="mobility"]');
    row.mobility = (mEl && mEl.value !== '') ? parseInt(mEl.value, 10) : null;
    PERIO_B.concat(PERIO_L).forEach(function(s){
      var re = panel && panel.querySelector('input[data-t="' + t + '"][data-f="rec_' + s + '"]');
      row['rec_' + s] = (re && re.value !== '') ? parseInt(re.value, 10) : null;
    });
    var fe = panel && panel.querySelector('input[data-t="' + t + '"][data-f="furcation"]');
    row.furcation = (fe && fe.value !== '') ? parseInt(fe.value, 10) : null;
    snap[t] = row;
  });
  return snap;
}
function perioPrintArch(arr, lingLabel, src){
  src = src || perioRows;
  var td = 'border:1px solid #999;padding:3px 4px;text-align:center;font-size:11px;';
  var lb = td + 'font-weight:700;background:#f0f0f0;white-space:nowrap;';
  var MID = 'border-right:3px double #555;';
  function pdCells(sites){
    var s = '';
    arr.forEach(function(t, i){
      var row = src[t] || {}, parts = [];
      sites.forEach(function(x){ var v = row['pd_' + x]; parts.push((v === 0 || v) ? v : '–'); });
      s += '<td style="' + td + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : parts.join(' · ')) + '</td>';
    });
    return s;
  }
  function bopCells(sites){
    var s = '';
    arr.forEach(function(t, i){
      var row = src[t] || {}, parts = [];
      sites.forEach(function(x){ parts.push(row['bop_' + x] ? '●' : '·'); });
      s += '<td style="' + td + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : parts.join(' ')) + '</td>';
    });
    return s;
  }
  function recCells(sites){
    var s = '';
    arr.forEach(function(t, i){
      var row = src[t] || {}, parts = [];
      sites.forEach(function(x){ var v = row['rec_' + x]; parts.push((v === 0 || v) ? v : '–'); });
      s += '<td style="' + td + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : parts.join(' · ')) + '</td>';
    });
    return s;
  }
  function calCells(sites){
    var s = '';
    arr.forEach(function(t, i){
      var row = src[t] || {}, parts = [], worst = 0;
      sites.forEach(function(x){
        var pd = row['pd_' + x];
        if (pd === 0 || pd) {
          var cv = pd + (row['rec_' + x] || 0);
          if (cv > worst) worst = cv;
          parts.push(cv);
        } else parts.push('–');
      });
      var bg = worst >= 5 ? 'background:#fbd5d5;' : (worst >= 3 ? 'background:#fdecc8;' : '');
      s += '<td style="' + td + 'font-weight:700;' + bg + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : parts.join(' · ')) + '</td>';
    });
    return s;
  }
  var head = '', mob = '', furc = '';
  arr.forEach(function(t, i){
    head += '<th style="' + lb + (i === 8 ? MID : '') + '">' + t + '</th>';
    var row = src[t] || {};
    var mv = (row.mobility === 0 || row.mobility) ? row.mobility : '–';
    mob += '<td style="' + td + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : mv) + '</td>';
    var fv = perioIsMolar(t) ? ((row.furcation === 0 || row.furcation) ? row.furcation : '–') : '—';
    furc += '<td style="' + td + (i === 8 ? MID : '') + '">' + (perioIsExtracted(t) ? '×' : fv) + '</td>';
  });
  return '<table style="border-collapse:collapse;width:100%;margin:8px 0;">'
    + '<tr><th style="' + lb + '"></th>' + head + '</tr>'
    + '<tr><td style="' + lb + '">عمق — دهليزي</td>' + pdCells(PERIO_B) + '</tr>'
    + '<tr><td style="' + lb + '">انحسار — دهليزي</td>' + recCells(PERIO_B) + '</tr>'
    + '<tr><td style="' + lb + '">CAL — دهليزي</td>' + calCells(PERIO_B) + '</tr>'
    + '<tr><td style="' + lb + '">نزف — دهليزي</td>' + bopCells(PERIO_B) + '</tr>'
    + '<tr><td style="' + lb + '">عمق — ' + lingLabel + '</td>' + pdCells(PERIO_L) + '</tr>'
    + '<tr><td style="' + lb + '">انحسار — ' + lingLabel + '</td>' + recCells(PERIO_L) + '</tr>'
    + '<tr><td style="' + lb + '">CAL — ' + lingLabel + '</td>' + calCells(PERIO_L) + '</tr>'
    + '<tr><td style="' + lb + '">نزف — ' + lingLabel + '</td>' + bopCells(PERIO_L) + '</tr>'
    + '<tr><td style="' + lb + '">الحركة</td>' + mob + '</tr>'
    + '<tr><td style="' + lb + '">التشعب</td>' + furc + '</tr>'
    + '</table>';
}
function perioPrint(){
  if (!perioCurrent) return;
  var perioSrc = perioSnapshotFromDom();
  var nm = perioDocName(perioCurrent.provider_id);
  var statsTxt = Array.prototype.map.call(
    document.querySelectorAll('#perioStats span'),
    function(s){ return s.textContent; }
  ).join(' · ');
  var html = '<div style="font-family:\'Cairo\',sans-serif;direction:rtl;color:#111;">'
    + '<h2 style="margin:0 0 4px;">🦷 مخطط اللثة</h2>'
    + '<div style="font-size:13px;margin-bottom:2px;"><b>' + escapeHtml((patient && patient.name) || '') + '</b>'
    + ' — ' + fmtD(perioCurrent.exam_date) + (nm ? ' — ' + escapeHtml(nm) : '') + '</div>'
    + (perioCurrent.notes ? '<div style="font-size:12px;color:#444;margin-bottom:4px;">' + escapeHtml(perioCurrent.notes) + '</div>' : '')
    + '<div style="font-size:12px;margin:4px 0 8px;">' + statsTxt + '</div>'
    + '<div style="font-weight:800;font-size:12.5px;">الفك العلوي</div>' + perioPrintArch(UPPER_T, 'حنكي', perioSrc)
    + '<div style="font-weight:800;font-size:12.5px;">الفك السفلي</div>' + perioPrintArch(LOWER_T, 'لساني', perioSrc)
    + '<div style="font-size:10.5px;color:#555;margin-top:6px;">● نزف عند السبر · × سن مقلوع · القيم بالملم (أنسي · وسط · وحشي) · CAL = العمق + الانحسار (الانحسار الفارغ = 0) · التشعب على الأرحاء: 1=I · 2=II · 3=III · — لا ينطبق</div>'
    + '</div>';
  var pr = document.getElementById('printRoot');
  pr.innerHTML = html;
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
/* ═══════════════ end periodontal charting ═══════════════ */

/* ═══════════════ ✏️ مسودة الشرح (v342) ═══════════════
   طبقة رسم مؤقتة فوق مخطط الأسنان يشرح بها الطبيب للمريض: ٧ ألوان · قلم
   رفيع/عريض · ممحاة بحجم متغيّر · تراجع · مسح الكل. الرسم يعيش بالذاكرة فقط
   (صفر DB · صفر localStorage — جهاز العيادة مشترك) ويُمسح عند الإغلاق بأي
   مسار (✕ · Escape · تبديل التبويب · مغادرة الصفحة). الاستثناء الوحيد طلبٌ
   صريح: «حفظ بملفات المريض» يرسم المخطط + الرسم صورةً JPEG ويرفعها عبر
   SyDentFiles.upload (نفس مسار تبويب الملفات حرفياً).
   الهندسة: المخطط يُصغَّر ليتّسع لعرض البطاقة (CSS zoom عبر --draft-z على
   body — لا على #jawWrap كي لا تحمله نسخة الطباعة) ويُقفل تمريره الأفقي،
   والنقاط تُخزَّن بـ«وحدات المخطط» (px غير مصغَّرة) نسبةً لخط المنتصف السنّي
   وأعلى #jawWrap ⇒ تبقى على الأسنان نفسها عند تدوير الجهاز أو تغيير العرض.
   متنافٍ مع الفحص الأولي/التحديد المتعدد/العرض التاريخي؛ ومداخل التعديل
   الأربعة (openToothModal · endToothWatch · openNewSessionEntry ·
   openRegionalTreatmentPicker) ترفض برسالة ما دامت المسودة مفتوحة. */
window.__draftMode = false;
var DRAFT_COLORS = [
  { k: 'ink',    l: 'حبر',     c: null },        // أسود بالفاتح · أبيض بالداكن (يُحسب لحظة الرسم)
  { k: 'red',    l: 'أحمر',    c: '#ef4444' },
  { k: 'blue',   l: 'أزرق',    c: '#3b82f6' },
  { k: 'green',  l: 'أخضر',    c: '#16a34a' },
  { k: 'orange', l: 'برتقالي', c: '#f97316' },
  { k: 'purple', l: 'بنفسجي',  c: '#a855f7' },
  { k: 'pink',   l: 'وردي',    c: '#ec4899' }
];
var DRAFT_WIDTHS = { thin: 3, thick: 8 };      // بوحدات المخطط
var DRAFT_ERASER_DEFAULT = 28;
var _draft = null;                              // null = المسودة مغلقة

function draftInk() {
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark ? '#f1f5f9' : '#111827';
}
function draftColorOf(k) {
  for (var i = 0; i < DRAFT_COLORS.length; i++) {
    if (DRAFT_COLORS[i].k === k) return DRAFT_COLORS[i].c || draftInk();
  }
  return draftInk();
}

function toggleDraftMode() {
  if (window.__draftMode) { draftClose(); return; }
  if (window.__historyMode) { showToast('🕰️ أنهِ العرض التاريخي أولاً'); return; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }
  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return; }
  draftOpen();
}

function draftBuildTools() {
  var box = document.getElementById('draftSwatches');
  if (!box || box.childNodes.length) return;
  DRAFT_COLORS.forEach(function (dc) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'draft-sw';
    b.setAttribute('data-dk', dc.k);
    b.setAttribute('title', dc.l);
    b.setAttribute('aria-label', 'لون ' + dc.l);
    if (dc.c) b.style.background = dc.c;
    else b.classList.add('draft-sw-ink');
    b.addEventListener('click', function () { draftSetColor(dc.k); });
    box.appendChild(b);
  });
}

function draftOpen() {
  var cv = document.getElementById('draftCanvas');
  var jw = document.getElementById('jawWrap');
  if (!cv || !jw || !cv.getContext) { showToast('⚠️ المسودة غير مدعومة على هذا المتصفح', true); return; }
  draftBuildTools();
  _draft = {
    strokes: [], hist: [], cur: null, pid: null, sawPen: false,
    tool: 'pen', color: 'red', width: 'thin', eraser: DRAFT_ERASER_DEFAULT,
    cv: cv, ctx: cv.getContext('2d'), z: 1, ox: 0, oy: 0, dpr: 1, raf: 0, ro: null, mo: null, h: {}
  };
  window.__draftMode = true;
  document.body.classList.add('draft-on');
  var tb = document.getElementById('draftToggleBtn'); if (tb) tb.style.display = 'none';
  var tip = document.querySelector('.chart-tip'); if (tip) tip.style.display = 'none';
  var sz = document.getElementById('draftEraserSize'); if (sz) sz.value = String(DRAFT_ERASER_DEFAULT);
  var H = _draft.h;
  H.down = draftPointerDown; H.move = draftPointerMove; H.up = draftPointerUp;
  H.leave = function () { draftCursorHide(); };
  H.resize = function () { draftScheduleLayout(); };
  H.key = draftKeyDown;
  cv.addEventListener('pointerdown', H.down);
  cv.addEventListener('pointermove', H.move);
  cv.addEventListener('pointerup', H.up);
  cv.addEventListener('pointercancel', H.up);
  cv.addEventListener('pointerleave', H.leave);
  cv.addEventListener('contextmenu', draftPrevent);
  window.addEventListener('resize', H.resize);
  window.addEventListener('orientationchange', H.resize);
  document.addEventListener('keydown', H.key);
  if (window.ResizeObserver) {
    _draft.ro = new ResizeObserver(function () { draftScheduleLayout(); });
    var card = cv.parentElement; if (card) _draft.ro.observe(card);
    _draft.ro.observe(jw);
  }
  if (window.MutationObserver) {
    _draft.mo = new MutationObserver(function () { draftScheduleRedraw(); });
    _draft.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  draftSyncUI();
  draftLayout();
  draftRevealChart();
  showToast('✏️ المسودة مفتوحة — ارسم للشرح، وكل شيء يُمسح عند الإغلاق');
}

function draftPrevent(e) { e.preventDefault(); }

function draftClose() {
  var d = _draft;
  _draft = null;
  window.__draftMode = false;
  document.body.classList.remove('draft-on');
  document.body.style.removeProperty('--draft-z');
  var tb = document.getElementById('draftToggleBtn'); if (tb) tb.style.display = '';
  draftCursorHide();
  if (!d) return;
  var cv = d.cv, H = d.h;
  cv.removeEventListener('pointerdown', H.down);
  cv.removeEventListener('pointermove', H.move);
  cv.removeEventListener('pointerup', H.up);
  cv.removeEventListener('pointercancel', H.up);
  cv.removeEventListener('pointerleave', H.leave);
  cv.removeEventListener('contextmenu', draftPrevent);
  window.removeEventListener('resize', H.resize);
  window.removeEventListener('orientationchange', H.resize);
  document.removeEventListener('keydown', H.key);
  if (d.ro) d.ro.disconnect();
  if (d.mo) d.mo.disconnect();
  if (d.raf) cancelAnimationFrame(d.raf);
  if (d.lraf) cancelAnimationFrame(d.lraf);
  try { if (d.pid !== null && cv.releasePointerCapture) cv.releasePointerCapture(d.pid); } catch (e) {}
  // مسحٌ فعلي للبكسلات والذاكرة — لا يبقى أثرٌ للرسم بعد الإغلاق
  try { d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.clearRect(0, 0, cv.width, cv.height); } catch (e) {}
  cv.width = 0; cv.height = 0;
  d.strokes.length = 0; d.hist.length = 0;
}

/* ── التخطيط: تصغير المخطط ليتّسع + تموضع اللوحة فوقه ── */
function draftScheduleLayout() {
  if (!_draft || _draft.lraf) return;
  _draft.lraf = requestAnimationFrame(function () { if (_draft) { _draft.lraf = 0; draftLayout(); } });
}
/* التصغير = الأصغر بين «يتّسع بالعرض» و«يتّسع تحت الشريط الثابت بالارتفاع»
   (الأخير يهمّ الجوال بالوضع العرضي: الشريط اللاصق كان يغطّي الفك العلوي). */
function draftFitZoom(jw) {
  var css = window.CSS;
  if (!(css && css.supports && css.supports('zoom', '0.5'))) return 1;
  var W = jw.clientWidth, need = 0;
  var rows = jw.querySelectorAll('.jaw-row');
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].getClientRects().length) continue;
    need = Math.max(need, rows[i].scrollWidth);
  }
  var z = 1;
  if (W && need && need > W) z = (W - 2) / need;
  var bar = document.getElementById('draftBar');
  var barH = bar ? bar.getBoundingClientRect().height : 0;
  var natH = jw.getBoundingClientRect().height;
  var availH = (window.innerHeight || 0) - barH - 24;
  if (natH > 0 && availH > 0) {
    var zh = availH / natH;
    if (zh < z && zh >= 0.25) z = zh;
  }
  if (z >= 1) return 1;
  return Math.max(0.2, Math.floor(z * 1000) / 1000);
}
/* عند الفتح: إن لم يظهر المخطط كاملاً تحت الشريط، يُمرَّر الشريط لأعلى الشاشة
   فيستقرّ المخطط تحته مباشرة. */
function draftRevealChart() {
  var bar = document.getElementById('draftBar'), jw = document.getElementById('jawWrap');
  if (!bar || !jw) return;
  var br = bar.getBoundingClientRect(), jr = jw.getBoundingClientRect();
  if (br.top < 0 || jr.bottom > window.innerHeight || jr.top < br.bottom) {
    try { bar.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { bar.scrollIntoView(true); }
  }
}
function draftLayout() {
  var d = _draft; if (!d) return;
  var jw = document.getElementById('jawWrap');
  var cv = d.cv, card = cv.parentElement;
  if (!jw || !card) return;
  document.body.style.setProperty('--draft-z', '1');
  var z = draftFitZoom(jw);
  document.body.style.setProperty('--draft-z', String(z));
  d.z = z;
  var jr = jw.getBoundingClientRect();
  var cr = card.getBoundingClientRect();
  var w = Math.max(1, Math.round(jr.width)), h = Math.max(1, Math.round(jr.height));
  cv.style.left = (jr.left - cr.left - card.clientLeft) + 'px';
  cv.style.top = (jr.top - cr.top - card.clientTop) + 'px';
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  var dpr = Math.min(3, window.devicePixelRatio || 1);
  d.dpr = dpr;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  var mid = jw.querySelector('#upperJaw .midline') || jw.querySelector('.midline');
  var mr = mid ? mid.getBoundingClientRect() : null;
  d.ox = mr && mr.width + mr.height ? (mr.left + mr.width / 2 - jr.left) : (jr.width / 2);
  d.oy = 0;
  draftSyncSizeDot();
  draftRedraw();
}

/* ── الرسم ── */
function draftScheduleRedraw() {
  if (!_draft || _draft.raf) return;
  _draft.raf = requestAnimationFrame(function () { if (_draft) { _draft.raf = 0; draftRedraw(); } });
}
function draftPaintStroke(ctx, s, ink) {
  var p = s.p;
  if (!p || p.length < 2) return;
  ctx.save();
  if (s.t === 'e') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    var col = s.c === 'ink' ? ink : draftColorOf(s.c);
    ctx.strokeStyle = col; ctx.fillStyle = col;
  }
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (p.length === 2) {
    ctx.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  ctx.restore();
}
function draftRedraw() {
  var d = _draft; if (!d) return;
  var ctx = d.ctx, cv = d.cv;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(d.dpr * d.z, 0, 0, d.dpr * d.z, d.dpr * d.ox, d.dpr * d.oy);
  var ink = draftInk();
  for (var i = 0; i < d.strokes.length; i++) draftPaintStroke(ctx, d.strokes[i], ink);
}

/* ── المؤشّر: نقاط الحدث → وحدات المخطط ── */
function draftUnits(e) {
  var d = _draft, r = d.cv.getBoundingClientRect();
  return [(e.clientX - r.left - d.ox) / d.z, (e.clientY - r.top - d.oy) / d.z];
}
function draftPointerDown(e) {
  var d = _draft; if (!d) return;
  if (e.pointerType === 'pen') d.sawPen = true;
  if (e.pointerType === 'touch' && d.sawPen) return;       // رفض راحة الكف بعد ظهور القلم الإلكتروني
  if (d.cur) return;                                        // إصبعٌ ثانٍ أثناء خط — يُتجاهل
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  try { d.cv.setPointerCapture(e.pointerId); } catch (err) {}
  var pt = draftUnits(e);
  // الطرف الماسح للقلم الإلكتروني (buttons & 32) يمسح لهذا الخط وحده
  var er = d.tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32) === 32);
  d.cur = { t: er ? 'e' : 'p', c: d.color, w: er ? d.eraser : DRAFT_WIDTHS[d.width], p: [pt[0], pt[1]] };
  d.pid = e.pointerId;
  d.strokes.push(d.cur);
  d.hist.push({ a: 'add' });
  draftCursorMove(e, true);
  draftSyncUI();
  draftScheduleRedraw();
}
function draftPointerMove(e) {
  var d = _draft; if (!d) return;
  draftCursorMove(e, !!d.cur);
  if (!d.cur || e.pointerId !== d.pid) return;
  e.preventDefault();
  var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
  if (!evs.length) evs = [e];
  var p = d.cur.p;
  for (var i = 0; i < evs.length; i++) {
    var pt = draftUnits(evs[i]);
    var lx = p[p.length - 2], ly = p[p.length - 1];
    if (Math.abs(pt[0] - lx) + Math.abs(pt[1] - ly) < 0.8) continue;
    p.push(pt[0], pt[1]);
  }
  draftScheduleRedraw();
}
function draftPointerUp(e) {
  var d = _draft; if (!d || e.pointerId !== d.pid) return;
  try { d.cv.releasePointerCapture(e.pointerId); } catch (err) {}
  d.cur = null; d.pid = null;
  if (e.pointerType === 'touch') draftCursorHide();
  draftScheduleRedraw();
}
function draftCursorMove(e, pressing) {
  var d = _draft, cur = document.getElementById('draftCursor');
  if (!d || !cur) return;
  if (d.tool !== 'eraser' || (e.pointerType === 'touch' && !pressing)) { cur.style.display = 'none'; return; }
  var card = d.cv.parentElement, cr = card.getBoundingClientRect();
  var dia = Math.max(6, d.eraser * d.z);
  cur.style.width = dia + 'px';
  cur.style.height = dia + 'px';
  cur.style.left = (e.clientX - cr.left - card.clientLeft) + 'px';
  cur.style.top = (e.clientY - cr.top - card.clientTop) + 'px';
  cur.style.display = 'block';
}
function draftCursorHide() {
  var cur = document.getElementById('draftCursor');
  if (cur) cur.style.display = 'none';
}
function draftKeyDown(e) {
  if (!_draft) return;
  if (typeof ppAnyModalOpen === 'function' && ppAnyModalOpen()) return;   // ESC/تراجع يخصّان الطبقة العليا
  if (e.key === 'Escape') { draftClose(); return; }
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || String(e.key).toLowerCase() !== 'z') return;
  var t = e.target && e.target.tagName;
  if (t === 'INPUT' && e.target.type !== 'range') return;
  if (t === 'TEXTAREA' || t === 'SELECT') return;
  e.preventDefault();
  draftUndo();
}

/* ── الأدوات ── */
function draftSetColor(k) { if (!_draft) return; _draft.color = k; _draft.tool = 'pen'; draftSyncUI(); }
function draftSetWidth(w) { if (!_draft || !DRAFT_WIDTHS[w]) return; _draft.width = w; _draft.tool = 'pen'; draftSyncUI(); }
function draftSetEraser() { if (!_draft) return; _draft.tool = 'eraser'; draftSyncUI(); }
function draftSetEraserSize(v) {
  if (!_draft) return;
  var n = parseInt(v, 10);
  if (!(n > 0)) return;
  _draft.eraser = Math.max(10, Math.min(80, n));
  _draft.tool = 'eraser';
  draftSyncUI();
}
function draftUndo() {
  var d = _draft; if (!d || d.cur || !d.hist.length) return;
  var h = d.hist.pop();
  if (h.a === 'add') d.strokes.pop();
  else if (h.a === 'clear') d.strokes = h.prev;
  draftSyncUI();
  draftScheduleRedraw();
}
function draftClearAll() {
  var d = _draft; if (!d || d.cur || !d.strokes.length) return;
  d.hist.push({ a: 'clear', prev: d.strokes });
  d.strokes = [];
  draftSyncUI();
  draftScheduleRedraw();
}
function draftSyncSizeDot() {
  var d = _draft, dot = document.getElementById('draftSizeDot');
  if (!d || !dot) return;
  var dia = Math.max(6, Math.min(40, d.eraser * d.z));
  dot.style.width = dia + 'px';
  dot.style.height = dia + 'px';
}
function draftSyncUI() {
  var d = _draft; if (!d) return;
  var er = d.tool === 'eraser';
  var sws = document.querySelectorAll('#draftSwatches .draft-sw');
  for (var i = 0; i < sws.length; i++) {
    var on = !er && sws[i].getAttribute('data-dk') === d.color;
    sws[i].classList.toggle('selected', on);
    sws[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  var tools = document.querySelectorAll('#draftBar .draft-tool');
  for (var j = 0; j < tools.length; j++) {
    var k = tools[j].getAttribute('data-dtool');
    var sel = er ? (k === 'eraser') : (k === d.width);
    tools[j].classList.toggle('selected', sel);
    tools[j].setAttribute('aria-pressed', sel ? 'true' : 'false');
  }
  var bar = document.getElementById('draftBar'); if (bar) bar.classList.toggle('eraser-on', er);
  d.cv.classList.toggle('eraser', er);
  if (!er) draftCursorHide();
  var ub = document.getElementById('draftUndoBtn'); if (ub) ub.disabled = !d.hist.length;
  var cb = document.getElementById('draftClearBtn'); if (cb) cb.disabled = !d.strokes.length;
  draftSyncSizeDot();
}

/* ── الحفظ كصورة بملفات المريض ── */
function draftCssColorAlpha(c) {
  if (!c || c === 'transparent') return 0;
  var m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return 1;
  var parts = m[1].split(/[\s,\/]+/).filter(Boolean);
  return parts.length >= 4 ? parseFloat(parts[3]) : 1;
}
function draftRadius(v, w, h) {
  var s = String(v || '0');
  var r = parseFloat(s) || 0;
  if (s.indexOf('%') !== -1) r = Math.min(w, h) * r / 100;
  return Math.max(0, Math.min(r, w / 2, h / 2));
}
function draftRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r <= 0) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* تدرّجٌ خطّي بسيط (to bottom / to right) — يكفي خطّ المنتصف؛ غيره ⇒ أول لونٍ مرئي. */
function draftGradientFill(ctx, bgImg, x, y, w, h) {
  var m = /linear-gradient\((.*)\)\s*$/.exec(bgImg || '');
  if (!m) return false;
  var parts = [], depth = 0, cur = '';
  for (var i = 0; i < m[1].length; i++) {
    var ch = m[1][i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  var dir = 'bottom';
  if (/^to /.test(parts[0])) { dir = parts.shift().slice(3).trim(); }
  var g = (dir === 'right' || dir === 'left')
    ? ctx.createLinearGradient(dir === 'right' ? x : x + w, y, dir === 'right' ? x + w : x, y)
    : ctx.createLinearGradient(x, dir === 'top' ? y + h : y, x, dir === 'top' ? y : y + h);
  var n = parts.length;
  for (var k = 0; k < n; k++) {
    var pm = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(parts[k]);
    var col = (pm[1] || '').trim();
    var pos = pm[2] !== undefined ? parseFloat(pm[2]) / 100 : (n > 1 ? k / (n - 1) : 0);
    try { g.addColorStop(Math.max(0, Math.min(1, pos)), col === 'transparent' ? 'rgba(0,0,0,0)' : col); } catch (e) { return false; }
  }
  ctx.fillStyle = g;
  return true;
}
var DRAFT_SVG_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'visibility', 'clip-rule', 'paint-order', 'stop-color', 'stop-opacity'];
function draftSvgImage(svg, rect) {
  var vb = svg.viewBox && svg.viewBox.baseVal;
  var vx = 0, vy = 0, vw = rect.width, vh = rect.height;
  if (vb && vb.width && vb.height) { vx = vb.x; vy = vb.y; vw = vb.width; vh = vb.height; }
  var ux = vx, uy = vy, ux2 = vx + vw, uy2 = vy + vh;
  try {   // المحتوى الفائض عن viewBox (overflow:visible — سلك التقويم/حافظ المسافة) يُحفظ
    var bb = svg.getBBox();
    if (bb && (bb.width || bb.height)) {
      ux = Math.min(ux, bb.x - 6); uy = Math.min(uy, bb.y - 6);
      ux2 = Math.max(ux2, bb.x + bb.width + 6); uy2 = Math.max(uy2, bb.y + bb.height + 6);
    }
  } catch (e) {}
  var s = Math.min(rect.width / vw, rect.height / vh);
  var tx = rect.left + (rect.width - vw * s) / 2 - vx * s;
  var ty = rect.top + (rect.height - vh * s) / 2 - vy * s;
  var clone = svg.cloneNode(true);
  var src = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll('*')));
  var dst = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
  for (var i = 0; i < src.length && i < dst.length; i++) {
    var cs = getComputedStyle(src[i]);
    var st = '';
    for (var k = 0; k < DRAFT_SVG_PROPS.length; k++) {
      var pn = DRAFT_SVG_PROPS[k], v = cs.getPropertyValue(pn);
      if (!v) continue;
      if (v.indexOf('url(') !== -1) {
        var um = /url\(\s*["']?[^#"')]*(#[^"')]+)["']?\s*\)/.exec(v);
        if (!um) continue;
        v = 'url(' + um[1] + ')';
      }
      st += pn + ':' + v + ';';
    }
    if (cs.display === 'none') st += 'display:none;';
    dst[i].setAttribute('style', st);
  }
  clone.removeAttribute('class');
  clone.setAttribute('viewBox', ux + ' ' + uy + ' ' + (ux2 - ux) + ' ' + (uy2 - uy));
  clone.setAttribute('width', String((ux2 - ux) * s));
  clone.setAttribute('height', String((uy2 - uy) * s));
  clone.setAttribute('preserveAspectRatio', 'none');
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  var xml = new window.XMLSerializer().serializeToString(clone);
  return {
    kind: 'svg', url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml),
    x: tx + ux * s, y: ty + uy * s, w: (ux2 - ux) * s, h: (uy2 - uy) * s
  };
}
function draftShadowOf(filter) {
  var m = /drop-shadow\(\s*(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)?\s*([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?\s*(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)?/i.exec(filter || '');
  if (!m) return null;
  return { c: m[1] || m[5] || 'rgba(0,0,0,.2)', x: parseFloat(m[2]) || 0, y: parseFloat(m[3]) || 0, b: parseFloat(m[4]) || 0 };
}
function draftCollectChart(jw) {
  var items = [], opCache = new Map();
  function opacityOf(el) {
    if (opCache.has(el)) return opCache.get(el);
    var o = parseFloat(getComputedStyle(el).opacity);
    if (isNaN(o)) o = 1;
    var p = el.parentElement;
    if (p && p !== jw && jw.contains(p)) o *= opacityOf(p);
    opCache.set(el, o);
    return o;
  }
  var all = jw.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var tag = el.tagName.toLowerCase();
    if (el.closest('.tooth-tip')) continue;
    if (tag !== 'svg' && el.closest('svg')) continue;          // أبناء svg تُرسم مع جذرها
    if (!el.getClientRects().length) continue;                 // display:none (وذريّته)
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var alpha = opacityOf(el);
    if (alpha <= 0.01) continue;
    if (tag === 'svg') {
      var it = draftSvgImage(el, r);
      it.alpha = alpha;
      it.shadow = draftShadowOf(cs.filter);
      items.push(it);
      continue;
    }
    var box = { kind: 'box', x: r.left, y: r.top, w: r.width, h: r.height, alpha: alpha,
      bg: draftCssColorAlpha(cs.backgroundColor) > 0 ? cs.backgroundColor : null,
      bgImg: /gradient/.test(cs.backgroundImage) ? cs.backgroundImage : null,
      rad: draftRadius(cs.borderTopLeftRadius, r.width, r.height), borders: [] };
    ['top', 'right', 'bottom', 'left'].forEach(function (sd) {
      var bw = parseFloat(cs.getPropertyValue('border-' + sd + '-width')) || 0;
      var bs = cs.getPropertyValue('border-' + sd + '-style');
      var bc = cs.getPropertyValue('border-' + sd + '-color');
      if (bw > 0 && bs !== 'none' && bs !== 'hidden' && draftCssColorAlpha(bc) > 0) box.borders.push({ sd: sd, w: bw, s: bs, c: bc });
    });
    var txt = '';
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) txt += c.nodeValue;
    txt = txt.replace(/\s+/g, ' ').trim();
    if (txt) {
      box.text = txt;
      box.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      box.color = cs.color;
    }
    if (box.bg || box.bgImg || box.borders.length || box.text) items.push(box);
  }
  return items;
}
function draftLoadImage(url) {
  return new Promise(function (res) {
    var img = new Image();
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; res(null); } }, 8000);
    img.onload = function () { if (!done) { done = true; clearTimeout(t); res(img); } };
    img.onerror = function () { if (!done) { done = true; clearTimeout(t); res(null); } };
    img.src = url;
  });
}
function draftPaintBox(ctx, b) {
  ctx.save();
  ctx.globalAlpha = b.alpha;
  if (b.bgImg && draftGradientFill(ctx, b.bgImg, b.x, b.y, b.w, b.h)) {
    draftRoundRectPath(ctx, b.x, b.y, b.w, b.h, b.rad); ctx.fill();
  } else if (b.bg) {
    ctx.fillStyle = b.bg;
    draftRoundRectPath(ctx, b.x, b.y, b.w, b.h, b.rad); ctx.fill();
  }
  var bs = b.borders;
  var uniform = bs.length === 4 && bs.every(function (q) { return q.w === bs[0].w && q.c === bs[0].c && q.s === bs[0].s; });
  function dash(sty, w) { ctx.setLineDash(sty === 'dashed' ? [w * 3, w * 2] : (sty === 'dotted' ? [w, w * 1.5] : [])); }
  if (uniform) {
    ctx.strokeStyle = bs[0].c; ctx.lineWidth = bs[0].w; dash(bs[0].s, bs[0].w);
    var hw = bs[0].w / 2;
    draftRoundRectPath(ctx, b.x + hw, b.y + hw, b.w - bs[0].w, b.h - bs[0].w, Math.max(0, b.rad - hw));
    ctx.stroke();
  } else {
    bs.forEach(function (q) {
      ctx.strokeStyle = q.c; ctx.lineWidth = q.w; dash(q.s, q.w);
      var o = q.w / 2;
      ctx.beginPath();
      if (q.sd === 'top') { ctx.moveTo(b.x, b.y + o); ctx.lineTo(b.x + b.w, b.y + o); }
      if (q.sd === 'bottom') { ctx.moveTo(b.x, b.y + b.h - o); ctx.lineTo(b.x + b.w, b.y + b.h - o); }
      if (q.sd === 'left') { ctx.moveTo(b.x + o, b.y); ctx.lineTo(b.x + o, b.y + b.h); }
      if (q.sd === 'right') { ctx.moveTo(b.x + b.w - o, b.y); ctx.lineTo(b.x + b.w - o, b.y + b.h); }
      ctx.stroke();
    });
  }
  ctx.setLineDash([]);
  if (b.text) {
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, b.x + b.w / 2, b.y + b.h / 2);
  }
  ctx.restore();
}
function draftStrokeBounds(strokes) {
  var bx = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  strokes.forEach(function (s) {
    if (s.t === 'e') return;
    for (var i = 0; i < s.p.length; i += 2) {
      var h = s.w / 2;
      bx.l = Math.min(bx.l, s.p[i] - h); bx.r = Math.max(bx.r, s.p[i] + h);
      bx.t = Math.min(bx.t, s.p[i + 1] - h); bx.b = Math.max(bx.b, s.p[i + 1] + h);
    }
  });
  return bx;
}
async function draftSnapshotBlob() {
  var d = _draft;
  var jw = document.getElementById('jawWrap');
  if (!d || !jw) return null;
  var root = document.documentElement, rs = getComputedStyle(root);
  var card = d.cv.parentElement;
  var bg = getComputedStyle(card).backgroundColor;
  if (!draftCssColorAlpha(bg)) bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
  var textCol = rs.getPropertyValue('--text').trim() || '#111827';
  var text2Col = rs.getPropertyValue('--text2').trim() || '#6b7280';
  var borderCol = rs.getPropertyValue('--border').trim() || '#e5e7eb';
  var font = getComputedStyle(document.body).fontFamily;
  // القياس بالحجم الطبيعي (zoom=1) ثم الإرجاع فوراً — كله متزامن فلا يُرسم إطارٌ بينهما
  var prevZ = document.body.style.getPropertyValue('--draft-z');
  var items, jr, midX, L = Infinity, R = -Infinity;
  document.body.style.setProperty('--draft-z', '1');
  try {
    jr = jw.getBoundingClientRect();
    var mid = jw.querySelector('#upperJaw .midline') || jw.querySelector('.midline');
    var mr = mid ? mid.getBoundingClientRect() : null;
    midX = mr && mr.width + mr.height ? mr.left + mr.width / 2 : jr.left + jr.width / 2;
    var kids = jw.querySelectorAll('.jaw-row > *');
    for (var i = 0; i < kids.length; i++) {
      var kr = kids[i].getBoundingClientRect();
      if (!kr.width || !kr.height) continue;
      L = Math.min(L, kr.left); R = Math.max(R, kr.right);
    }
    items = draftCollectChart(jw);
  } finally {
    document.body.style.setProperty('--draft-z', prevZ || '1');
  }
  if (!(L < R)) { L = jr.left; R = jr.right; }
  var sb = draftStrokeBounds(d.strokes);
  var PAD = 20, HEAD = 58;
  var left = Math.min(L, isFinite(sb.l) ? midX + sb.l : L) - PAD;
  var right = Math.max(R, isFinite(sb.r) ? midX + sb.r : R) + PAD;
  var top = Math.min(jr.top, isFinite(sb.t) ? jr.top + sb.t : jr.top) - 4;
  var bottom = Math.max(jr.bottom, isFinite(sb.b) ? jr.top + sb.b : jr.bottom) + 8;
  var W = right - left, H = bottom - top;
  var S = Math.max(0.5, Math.min(2, 1800 / W));
  var out = document.createElement('canvas');
  out.width = Math.round(W * S);
  out.height = Math.round((H + HEAD) * S);
  var ctx = out.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H + HEAD);
  // الترويسة: المريض + التاريخ (يميناً) · العيادة (يساراً)
  var pName = (typeof patient !== 'undefined' && patient && patient.name) ? String(patient.name) : '';
  var clinic = '';
  try { if (typeof rxClinicInfo === 'function') clinic = String((rxClinicInfo() || {}).clinic_name || ''); } catch (e) {}
  var when = SyDT.numDate(new Date()) + ' — ' + SyDT.time12(new Date());   // v487: أرقاماً ووقتاً
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = textCol;
  ctx.font = '700 16px ' + font;
  ctx.fillText('مسودة شرح على مخطط الأسنان' + (pName ? ' — ' + pName : ''), W - PAD, 26);
  ctx.fillStyle = text2Col;
  ctx.font = '500 12px ' + font;
  ctx.fillText(when, W - PAD, 46);
  if (clinic) { ctx.textAlign = 'left'; ctx.font = '600 13px ' + font; ctx.fillText(clinic, PAD, 26); }
  ctx.fillStyle = borderCol;
  ctx.fillRect(PAD, HEAD - 6, W - PAD * 2, 1);
  ctx.restore();
  // المخطط
  var imgs = await Promise.all(items.map(function (it) { return it.kind === 'svg' ? draftLoadImage(it.url) : null; }));
  ctx.save();
  ctx.translate(-left, HEAD - top);
  for (var n = 0; n < items.length; n++) {
    var it = items[n];
    if (it.kind === 'box') { draftPaintBox(ctx, it); continue; }
    if (!imgs[n]) continue;
    ctx.save();
    ctx.globalAlpha = it.alpha;
    if (it.shadow) {
      ctx.shadowColor = it.shadow.c;
      ctx.shadowOffsetX = it.shadow.x * S; ctx.shadowOffsetY = it.shadow.y * S;
      ctx.shadowBlur = it.shadow.b * S;
    }
    ctx.drawImage(imgs[n], it.x, it.y, it.w, it.h);
    ctx.restore();
  }
  ctx.restore();
  // طبقة الرسم منفصلة — الممحاة تمحو الرسم وحده لا المخطط
  var layer = document.createElement('canvas');
  layer.width = out.width; layer.height = out.height;
  var lc = layer.getContext('2d');
  lc.setTransform(S, 0, 0, S, S * (midX - left), S * (HEAD + jr.top - top));
  var ink = draftInk();
  d.strokes.forEach(function (s) { draftPaintStroke(lc, s, ink); });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  return await new Promise(function (res) {
    try { out.toBlob(function (b) { res(b); }, 'image/jpeg', 0.9); } catch (e) { res(null); }
  });
}
function draftFileName() {
  var t = new Date();
  function p2(n) { return ('0' + n).slice(-2); }
  return 'مسودة-المخطط-' + t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()) + '_' + p2(t.getHours()) + '-' + p2(t.getMinutes()) + '.jpg';
}
var draftSave = ppGuarded('draftSave', _draftSave_inner, 'جارٍ الحفظ…');
async function _draftSave_inner() {
  var d = _draft; if (!d) return;
  if (!d.strokes.some(function (s) { return s.t === 'p'; })) { showToast('✏️ ارسم على المخطط أولاً ثم احفظ'); return; }
  if (navigator.onLine === false) { showToast('📴 حفظ الصورة يحتاج اتصالاً بالإنترنت', true); return; }
  if (!window.SyDentFiles || !patientId) { showToast('⚠️ ملفات المريض غير متاحة', true); return; }
  var blob = null;
  try { blob = await draftSnapshotBlob(); } catch (e) { console.warn('[draft] snapshot failed', e); }
  if (!blob) { showToast('⚠️ تعذّر تجهيز الصورة', true); return; }
  var name = draftFileName(), file;
  try { file = new File([blob], name, { type: 'image/jpeg' }); }
  catch (e) { file = blob; try { file.name = name; } catch (e2) {} }
  var r = await window.SyDentFiles.upload(patientId, file, { category: 'document', note: 'مسودة شرح على مخطط الأسنان' });
  if (!r || !r.ok) {
    console.warn('[draft] upload failed', r);
    var msg = (r && r.error && r.error.message) ? String(r.error.message) : '';
    showToast('⚠️ تعذّر حفظ الصورة' + (msg ? ' — ' + msg : ''), true);
    return;
  }
  if (window.logAudit) {
    try { window.logAudit('patient.file_upload', { patientId: patientId, patientName: (patient && patient.name) || null, description: 'حفظ مسودة المخطط كصورة: ' + name }); } catch (e) {}
  }
  showToast('✅ حُفظت المسودة كصورة بتبويب «الملفات»');
  try { if (typeof loadPatientFiles === 'function') await loadPatientFiles(); } catch (e) {}
}
/* ═══════════════ end ✏️ مسودة الشرح ═══════════════ */
