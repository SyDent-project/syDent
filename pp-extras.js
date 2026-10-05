/* ═══════════════════════════════════════════════════════════════
   pp-extras.js — المساعد الذكي + ملفات المريض + سجل النشاطات
   (تفكيك patient-profile — الاستخراج ١٤: ثلاث قصص، 761 سطراً بايت-بايت)

   القصة أ: المساعد الذكي كاملاً (اقتراح الملاحظات · ملخص المريض ·
   شرح الخطة + نسخ/طباعة) — صفر PII بالتصميم، الأمان بالـEdge Function.
   القصة ب: تبويب ملفات المريض (رفع/عرض/حذف + ربط الأسنان M55) —
   IIFE توصيل السحب والإفلات بقي inline (جذع تنفيذي top-level — السابقة).
   القصة ج: سجل نشاطات المريض (Phase 5F، owner-only).

   تعريفات صرفة + حالات بقيم حرفية (_pfFiles/_pfUrls/_pfLoadInFlight/
   _pfToothFilter/_toothPhotoCounts/_patientAuditLoaded/_patientAuditInFlight)
   — صفر تنفيذ top-level (درس v50؛ الـIIFEs المتداخلة داخل أجسام الدوال
   لا تُنفَّذ وقت التحميل). صفر كتابة مالية وصفر مرايا.
   ═══════════════════════════════════════════════════════════════ */

// ── مساعد الذكاء الاصطناعي: اقتراح ملاحظة الجلسة (Backlog AI #1) ──
// الزر يظهر فقط إذا: الخطة تسمح (PP_AI_PLAN_OK) + العيادة فعّلت opt-in
// (clinic_settings.ai_features_enabled). الأمان الحقيقي بالـEdge Function
// (بوابتا الخطة + opt-in سيرفر-سايد)؛ هذا UX فقط. صفر PII: يُرسَل نوع
// العلاج + التفاصيل + كلمات الطبيب الخام فقط (لا اسم/رقم/معرّف مريض).
function aiAssistAvailable() {
  return !!(PP_AI_PLAN_OK && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.ai_features_enabled === true);
}
function aiAssistSyncUI() {
  // Single global switch — a body class shows the 🤖 buttons wherever they live
  // (session modal + tooth-modal step 2), regardless of which path opened the
  // modal. Set once on init (ppLoadClinicSettings).
  if (document.body) document.body.classList.toggle('ai-on', aiAssistAvailable());
}
async function _aiErrText(resp) {
  var code = '';
  try {
    if (resp && resp.error && resp.error.context && typeof resp.error.context.json === 'function') {
      var j = await resp.error.context.json();
      code = (j && j.error) ? String(j.error) : '';
    }
  } catch (_e) {}
  var map = {
    ai_not_enabled: 'فعّل مساعد الذكاء الاصطناعي من الإعدادات أولاً',
    ai_plan_not_included: 'مساعد الذكاء الاصطناعي غير متاح في خطتك الحالية',
    ai_override_off: 'مساعد الذكاء الاصطناعي موقوف لهذا الحساب من إدارة المنصة',
    account_not_active: 'الحساب غير مفعّل حالياً — تواصل مع إدارة المنصة',
    subscription_inactive: 'انتهى اشتراك العيادة — جدّد الاشتراك لاستخدام مساعد الذكاء الاصطناعي',
    not_platform_admin: 'هذه الميزة مخصّصة لإدارة المنصة فقط',
    quota_exceeded: 'بلغت الحد الشهري لمساعد الذكاء الاصطناعي — يتجدّد مطلع الشهر',
    rate_limited: 'طلبات متتالية سريعة — انتظر دقيقة ثم حاول مجدداً',
    ai_key_missing: 'المساعد غير مهيّأ بعد (مفتاح الخدمة مفقود)',
    ai_upstream_error: 'تعذّر إنشاء الاقتراح — تحقّق من رصيد خدمة الذكاء الاصطناعي',
    ai_empty_response: 'لم يصل اقتراح — حاول مجدداً',
    empty_input: 'اختر نوع العلاج أو اكتب كلمات مفتاحية أولاً'
  };
  return map[code] || 'تعذّر إنشاء الاقتراح — حاول مجدداً';
}
async function _aiSuggestInto(btnId, taId, treatment) {
  var btn = document.getElementById(btnId);
  var ta = document.getElementById(taId);
  if (!ta) return;
  treatment = (treatment || '').trim();
  var rough = (ta.value || '').trim();
  if (!treatment && !rough) { showToast('اختر العلاج أو اكتب كلمات مفتاحية أولاً', true); return; }
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ الاقتراح…'; }
  try {
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'session_note', input: { treatment: treatment, notes: rough } }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم يصل اقتراح — حاول مجدداً', true); return; }
    ta.value = text;
    if (typeof snTplGlowSync === 'function') snTplGlowSync();
    showToast('🤖 تم — راجع المسودّة وعدّلها قبل الحفظ');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 اقترح ملاحظة بالذكاء الاصطناعي'; }
  }
}
/* ═══ بند #7: توليد تعليمات ما بعد العلاج (ai-assist · postop_instructions) ═══
   سياق صفر-PII بالكامل: اسم نوع العلاج فقط — لا مريض ولا هوية (النص وثيقة
   عامة تُحفَظ كتعليمات/قالب). سطحان بدرس فجوة الأسطح #9: مودال التعليمات
   الجديدة + مودال تحرير القالب. النتيجة قابلة للتعديل والحفظ بالمسار القائم. */
async function ppPostOpAiSuggest(btnId, taId, selId, phaseSelId, hintInpId) {
  var btn = document.getElementById(btnId);
  var ta = document.getElementById(taId);
  var sel = document.getElementById(selId);
  if (!ta) return;
  /* الموجة 2 بند #4 — الوسيط الرابع اختياري: منتقي «بعد | قبل». غيابه أو
     غياب عنصره = postop (السلوك القديم حرفياً — صفر تأثير على أي مستدعٍ).
     والوسيط الخامس اختياري كذلك: حقل تلميح حرّ من الطبيب يُمرَّر hints،
     وقواعد البرومبت (منع الأدوية/الجرعات) سيّدة عليه سيرفر-سايد. */
  var phaseSel = phaseSelId ? document.getElementById(phaseSelId) : null;
  var pre = !!(phaseSel && phaseSel.value === 'pre');
  var hintInp = hintInpId ? document.getElementById(hintInpId) : null;
  var hints = hintInp ? String(hintInp.value || '').trim().slice(0, 300) : '';
  var label = '';
  if (sel && sel.value) {
    var o = sel.options[sel.selectedIndex];
    label = (o && o.text) ? String(o.text).trim() : '';
  }
  if (!label) label = pre ? 'عام — تعليمات تحضير عامة قبل علاج سنّي' : 'عام — تعليمات عامة بعد علاج سنّي';
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ الاقتراح…'; }
  try {
    var reqInput = { treatment: label };
    if (hints) reqInput.hints = hints;
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: pre ? 'preop_instructions' : 'postop_instructions', input: reqInput }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم يصل اقتراح — حاول مجدداً', true); return; }
    ta.value = text;
    /* v445: العدّادُ يتبع أيَّ سطحِ تعليماتٍ (المودال أو محرّر القالب) */
    if (typeof ppMsgCountSync === 'function' && (taId === 'postOpBody' || taId === 'postOpTplBody')) {
      ppMsgCountSync(taId, taId === 'postOpBody' ? 'postOpMsgCount' : 'postOpTplMsgCount');
    }
    showToast('🤖 تم — راجع التعليمات وعدّلها قبل الحفظ');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 اقترح تعليمات بالذكاء الاصطناعي'; }
  }
}
function aiSuggestSessionNote() {
  var typeVal = (document.getElementById('sType') || {}).value || '';
  var descVal = (document.getElementById('sDesc') || {}).value || '';
  return _aiSuggestInto('aiSuggestBtn', 'sNotes', typeVal + (descVal ? ' — ' + descVal : ''));
}
function aiSuggestToothNote() {
  var t = (document.getElementById('toothStep2Title') || {}).textContent || '';
  return _aiSuggestInto('aiSuggestBtn2', 'toothNotes', t);
}
// ── AI #2: ملخّص ملف المريض — حمولة مجرّدة الهوية (لا اسم/رقم/هاتف، محتوى سريري فقط) ──
async function aiPatientSummary() {
  if (typeof patient === 'undefined' || !patient) return;
  var btn = document.getElementById('aiSummaryBtn');
  var alerts = (typeof warnParts === 'function' ? warnParts(patient).join('، ') : '');
  var allergies = (typeof allergyParts === 'function' ? allergyParts(patient).join('، ') : '');
  var recLines = [];
  if (typeof sessions !== 'undefined' && sessions && sessions.length) {
    sessions.slice(0, 20).forEach(function(s){
      var parts = [];
      if (s.date) parts.push(s.date);
      if (s.type) parts.push(s.type);
      if (s.tooth_num !== null && s.tooth_num !== undefined && s.tooth_num !== '') parts.push('سن ' + s.tooth_num);
      if (s.status && s.status !== 'completed') parts.push('[' + s.status + ']');
      var line = '- ' + parts.join(' · ');
      if (s.notes) line += ' — ' + String(s.notes).slice(0, 200);
      recLines.push(line);
    });
  }
  var record = recLines.join('\n');
  var financials = '';
  try { if (typeof computeFinancials === 'function') financials = _aiFinText(computeFinancials()); } catch (_e) {}
  if (!alerts && !allergies && !record) { showToast('لا توجد بيانات كافية للتلخيص', true); return; }
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ التلخيص…'; }
  try {
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'patient_summary', input: { alerts: alerts, allergies: allergies, record: record, financials: financials } }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم يصل ملخّص — حاول مجدداً', true); return; }
    var tel = document.getElementById('aiSummaryText');
    if (tel) tel.textContent = text;   // textContent = صفر XSS
    openModal('aiSummaryModal');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 ملخّص ذكي'; }
  }
}
// ── AI #3: شرح خطة العلاج للمريض — العلاجات المخطّطة فقط (قراءة من sessions، صفر كتابة مالية) ──
// حمولة مجرّدة الهوية: سن · نوع علاج · تكلفة (بلا اسم/رقم/هاتف). الإجمالي «تقديري»، ليس رصيداً مالياً.
// ── FDI → اسم عربي مفهوم للمريض (دائم 11-48 + لبني 51-85) — deterministic بالعميل، لا يُترك للموديل ──
function _toothNameAr(num){
  var n = parseInt(num, 10);
  if (!n || n < 11) return '';
  var q = Math.floor(n / 10), p = n % 10;
  var perm = { 1:'القاطع', 2:'الرباعية', 3:'الناب', 4:'الضاحك الأول', 5:'الضاحك الثاني', 6:'الرحى الأولى', 7:'الرحى الثانية', 8:'الرحى الثالثة' };
  var dec  = { 1:'القاطع', 2:'الرباعية', 3:'الناب', 4:'الرحى الأولى', 5:'الرحى الثانية' };
  var isDec = (q >= 5 && q <= 8);
  if (!isDec && (q < 1 || q > 4)) return '';
  var base = isDec ? dec[p] : perm[p];
  if (!base) return '';
  var upper = isDec ? (q === 5 || q === 6) : (q === 1 || q === 2);
  var right = isDec ? (q === 5 || q === 8) : (q === 1 || q === 4);
  var fem = (base.indexOf('الرحى') === 0 || base === 'الرباعية');   // «رحى» و«رباعية» مؤنث — البقية مذكّر
  var name = base + ' ' +
    (upper ? (fem ? 'العلوية' : 'العلوي') : (fem ? 'السفلية' : 'السفلي')) + ' ' +
    (right ? (fem ? 'اليمنى'  : 'الأيمن') : (fem ? 'اليسرى'  : 'الأيسر'));
  if (isDec) name += (fem ? ' اللبنية' : ' اللبني');
  return name;
}
// ── تجميع بنود الخطة deterministic: نفس العلاج على عدة أسنان = بند واحد (بلا تكرار) ──
/* رتبة التسلسل السريري لعلاج داخل السن الواحد — عرضٌ فقط (صفر أثر على البيانات).
   الاسم يُطبَّع بـ_famNorm القائمة فتُطابَق «اعادة معالجة» بلا همزة و«معالجة» بالتاء
   المربوطة سواءً. الفحوص الأخصّ تُسبق الأعمّ (إعادة المعالجة قبل المعالجة، والعصب
   قبل الحشوة). target_part رتبةٌ ثانية، وترتيب الإدخال فاصلٌ أخير (فرز مستقر). */
function _aiTxSeqRank(name, targetPart){
  var N = (typeof _famNorm === 'function') ? _famNorm(name) : String(name || '').toLowerCase();
  var has = function(kw){ return N.indexOf((typeof _famNorm === 'function') ? _famNorm(kw) : kw) !== -1; };
  /* التسلسل السريري القياسي على السن الواحد:
     وقائي ← معالجة العصب ← الوتد ← الترميم/البناء ← التحضير ← التاج ← جسر ← زراعة ← قلع. */
  var primary;
  if (has('قلع') || has('خلع')) primary = 90;
  else if (has('زراعة')) primary = 80;
  else if (has('جسر')) primary = 70;
  else if (has('تاج') || has('تلبيس') || has('خزف') || has('زركون')) primary = 60;
  else if (has('تحضير')) primary = 50;
  else if (has('حشوة عصب')) primary = 20;                       // بتر لبّي — عملٌ لبّي لا ترميم
  else if (has('حشوة') || has('ترميم')) primary = 40;
  else if (has('وتد') || has('بناء')) primary = 30;
  else if (has('اعادة معالجة') || has('إعادة معالجة')) primary = 25;
  else if (has('عصب') || has('لبية') || has('لبي')) primary = 20;
  else if (has('تنظيف') || has('تقليح') || has('تبييض') || has('اشعة') || has('أشعة') || has('استشارة') || has('وقاية')) primary = 10;
  else primary = 45;                                            // مجهول: بين الترميم والتحضير
  var TP = { root: 1, both: 2, crown: 3, crown_full: 4, bridge: 5, implant: 6, extraction: 7 };
  return { primary: primary, secondary: (TP[targetPart] || 3) };
}

/* target_part لجلسة مخطّطة — مطابقةً بالاسم مع TREATMENTS، وهو النمط الحيّ نفسه
   المستخدم لتلوين شارات الجلسات (الجلسات القديمة قد لا تحمل treatment_key). */
function _aiSessTargetPart(s){
  var k = s && s.treatment_key;
  var list = Array.isArray(TREATMENTS) ? TREATMENTS : [];
  var m = null;
  if (k) { for (var i = 0; i < list.length; i++) { if (list[i].id === k) { m = list[i]; break; } } }
  if (!m) { for (var j = 0; j < list.length; j++) { if (list[j].name === (s && s.type)) { m = list[j]; break; } } }
  return m ? (m.target_part || 'crown') : 'crown';
}

/* تجميع هجين لبنود الخطة (عرضٌ فقط، deterministic بالعميل لا بالموديل):
   • سنٌّ عليه علاجان أو أكثر ⇒ بلوك خاص بالسن: خطواتٌ مرقّمة بالتسلسل السريري
     + مجموع السن ⇒ يُشرح للمريض كخطة واحدة متّصلة (لبية ← وتد ← تاج).
   • سنٌّ بعلاج واحد + العلاجات الجماعية (قوس) ⇒ تجميع حسب العلاج كما كان بالحرف.
   الثابت المحفوظ: total = مجموع كل التكاليف مهما تغيّر التجميع. */
/* M145-d: ترتيبُ الطبيب يحكم. إن وسم الطبيب بنوداً بمراحل (phase 1..3 — M75) تُبنى
   الحمولة مرحلةً مرحلة بترتيبه وتحت عناوين صريحة، والتجميع الذكي (سن بعدة علاجات /
   علاج على عدة أسنان) يعمل **داخل** كل مرحلة فقط فلا ينقل بنداً عبر حدّ رسمه الطبيب.
   بلا أي مرحلة ⇒ النواة كما هي (حمولة بايت-مطابقة للسابق). */
var _AI_PHASE_HEAD = { 1: 'المرحلة الأولى (بترتيب الطبيب):', 2: 'المرحلة الثانية (بترتيب الطبيب):',
                       3: 'المرحلة الثالثة (بترتيب الطبيب):', 0: 'بنود لم يحدّد الطبيب مرحلتها:' };
function _aiPlanLines(planned){
  var list = planned || [];
  var phOf = function(s){ return (s && s.phase >= 1 && s.phase <= 3) ? s.phase : 0; };
  if (!list.some(function(s){ return phOf(s) > 0; })) return _aiPlanLinesCore(list);
  var lines = [], total = _planBag();
  [1, 2, 3, 0].forEach(function(ph){
    var sub = list.filter(function(s){ return phOf(s) === ph; });
    if (!sub.length) return;
    var g = _aiPlanLinesCore(sub);
    lines.push(_AI_PHASE_HEAD[ph]);
    lines = lines.concat(g.lines);
    _planBagAddTo(total, g.total);
  });
  return { lines: lines, total: total };
}
function _aiPlanLinesCore(planned){
  var F = function(v){ return (typeof fmt === 'function') ? fmt(v) : String(v); };
  /* قاعدة #481: بنود الخطة قد تكون بعملتين (زرعة بالدولار وحشوة بالليرة).
   * جمعُها برقمٍ واحد ثم إرسالُه للنموذج تحت وسمٍ واحد يجعل الشرح يَعِد
   * المريض بإجماليٍّ لا وجود له. كل بند يحمل عملته، والمجاميع أكياس. */
  var entries = [], total = _planBag();
  (planned || []).forEach(function(s, idx){
    var name = s.type || s.description || 'علاج';
    var isTooth = (s.tooth_num !== null && s.tooth_num !== undefined && s.tooth_num !== '');
    /* M145-c: جلسةُ الوحدة (جسر/حافظ مسافة) تحمل tooth_num مثل «45,44,43» — كان parseInt
     * يقرؤها سنّاً واحداً فيُسمّى الجسر باسم دعامته الأولى («الناب السفلي الأيمن (43)»)
     * ويُدمَج مع علاجات ذلك السن كخطة مراحل. الوحدة موضعٌ مستقل يُذكر بأسنانه كلها. */
    var isUnit = isTooth && String(s.tooth_num).indexOf(',') !== -1;
    var loc = '', area = '';
    if (isUnit) {
      var _un = String(s.tooth_num).split(',').map(function(x){ return String(x).trim(); }).filter(Boolean);
      loc = 'يشمل الأسنان ' + _un.join('، ') + ' (' + _un.length + ' وحدات)';
      isTooth = false;
    } else if (isTooth) {
      var nm = _toothNameAr(s.tooth_num);
      loc = nm ? (nm + ' (سن ' + s.tooth_num + ')') : ('السن ' + s.tooth_num);
      area = (s.surface && s.surface !== 'WHOLE' && typeof surfLabelFor === 'function')
        ? surfLabelFor(s.surface, s.tooth_num) : '';
      if (area) loc += ' / ' + area;
    } else if (s.arch) {
      loc = _aiPlanArchLbl(s.arch);
    }
    var c = Number(s.cost || 0);
    var eCur = _rowCur(s);
    total[eCur] += c;
    var r = _aiTxSeqRank(name, _aiSessTargetPart(s));
    entries.push({ name: name, tooth: isTooth ? parseInt(s.tooth_num, 10) : null,
                   loc: loc, area: area, cost: c, cur: eCur, isTooth: isTooth,
                   rank: r.primary, rank2: r.secondary, idx: idx });
  });

  // أي أسنان تحمل علاجين أو أكثر؟ (هذه وحدها تُعرض كخطة سن متسلسلة)
  var cnt = {};
  entries.forEach(function(e){ if (e.tooth !== null) cnt[e.tooth] = (cnt[e.tooth] || 0) + 1; });

  var seqTeeth = [], seqByTooth = {}, rest = [];
  entries.forEach(function(e){
    if (e.tooth !== null && cnt[e.tooth] >= 2) {
      if (!seqByTooth[e.tooth]) { seqByTooth[e.tooth] = []; seqTeeth.push(e.tooth); }
      seqByTooth[e.tooth].push(e);
    } else rest.push(e);
  });
  seqTeeth.sort(function(a, b){ return a - b; });

  var lines = [];
  if (seqTeeth.length) {
    lines.push('أسنان عليها عدة علاجات متسلسلة (كل سن = بند واحد يُشرح كخطة متّصلة):');
    seqTeeth.forEach(function(n){
      var g = seqByTooth[n].slice().sort(function(a, b){
        return (a.rank - b.rank) || (a.rank2 - b.rank2) || (a.idx - b.idx);
      });
      var nm = _toothNameAr(n);
      var head = nm ? (nm + ' (سن ' + n + ')') : ('السن ' + n);
      lines.push('- ' + head + ':');
      var sum = _planBag();
      g.forEach(function(e, k){
        sum[e.cur] += e.cost;
        lines.push('  ' + (k + 1) + ') ' + e.name + (e.area ? ' / ' + e.area : '') +
                   ' — التكلفة: ' + F(e.cost) + ' ' + curLblOf(e.cur));
      });
      lines.push('  مجموع هذا السن: ' + _planBagText(sum));
    });
  }

  if (rest.length) {
    if (seqTeeth.length) lines.push('علاجات على أسنان أخرى (كل علاج بند واحد):');
    var groups = {}, order = [];
    rest.forEach(function(e){
      if (!groups[e.name]) { groups[e.name] = []; order.push(e.name); }
      groups[e.name].push(e);
    });
    order.forEach(function(name){
      var g = groups[name];
      if (g.length === 1) {
        lines.push('- ' + name + (g[0].loc ? ' — ' + g[0].loc : '') + ' — التكلفة: ' + F(g[0].cost) + ' ' + curLblOf(g[0].cur));
        return;
      }
      var sum = _planBag(), uniform = true, allTeeth = true;
      /* التكلفة الموحّدة تشترط تطابق العملة كذلك: مئةُ ليرة ومئةُ دولار
       * ليستا سعراً واحداً، وإعلانهما «التكلفة لكل سن» كذبٌ صريح. */
      g.forEach(function(e){ sum[e.cur] += e.cost; if (e.cost !== g[0].cost || e.cur !== g[0].cur) uniform = false; if (!e.isTooth) allTeeth = false; });
      var lbl = allTeeth ? 'الأسنان' : 'المواضع';
      var locs;
      if (uniform) {
        locs = g.map(function(e){ return e.loc || 'موضع غير محدد'; }).join('، ');
        lines.push('- ' + name + ' — ' + lbl + ': ' + locs +
                   ' — التكلفة لكل سن: ' + F(g[0].cost) + ' ' + curLblOf(g[0].cur) + ' — مجموع البند: ' + _planBagText(sum));
      } else {
        locs = g.map(function(e){ return (e.loc || 'موضع غير محدد') + ' بتكلفة ' + F(e.cost) + ' ' + curLblOf(e.cur); }).join('، ');
        lines.push('- ' + name + ' — ' + lbl + ': ' + locs + ' — مجموع البند: ' + _planBagText(sum));
      }
    });
  }
  return { lines: lines, total: total };
}
// ── الوضع المالي للملخّص الذكي — قراءة فقط من computeFinancials (صفر كتابة مالية) ──
function _aiFinText(fin){
  if (!fin) return '';
  var F = function(v){ return (typeof fmt === 'function') ? fmt(v) : String(v); };
  /* قاعدة #481: الأرقام العلوية مرادفُ طبقةٍ واحدة (fin.cur)، فالوسم يتبعها
   * لا عملةَ العيادة. والمريض ثنائي الطبقة تُذكر طبقته الأخرى صراحةً — النقص
   * معلومة تُذكر لا فراغٌ يُملأ، وإخفاؤها يجعل النموذج يصف حساباً ناقصاً. */
  var L = curLblOf(fin.cur);
  var t = 'المتبقي على المريض: ' + F(fin.trueBalance) + ' ' + L + '\n' +
          'إجمالي المدفوع: ' + F(fin.paid) + ' ' + L + '\n' +
          'إجمالي العلاجات المنجزة (بعد الحسومات): ' + F(fin.netCompleted) + ' ' + L;
  if (Number(fin.unearnedCredit) > 0) t += '\nرصيد مدفوع مقدّماً (غير مكتسب): ' + F(fin.unearnedCredit) + ' ' + L;
  if (Number(fin.plannedTotal) > 0) t += '\nتكلفة العلاجات المخطّطة (تقديرية، غير مستحقّة بعد): ' + F(fin.plannedTotal) + ' ' + L;
  /* v337: مخطَّطٌ بالعملة الأخرى تقديرٌ يُذكر بوسمه ولا يصنع «حساباً ثانياً». */
  var _oc = (fin.cur === 'USD') ? 'SYP' : 'USD';
  var _ob = fin.bags && fin.bags[_oc];
  if (_ob && Number(_ob.plannedTotal) > 0) t += '\nتكلفة علاجات مخطّطة بعملة أخرى (تقديرية، غير مستحقّة بعد): ' + F(_ob.plannedTotal) + ' ' + curLblOf(_oc) + ' — لا تُجمع مع الأرقام أعلاه.';
  if (fin.dual) t += '\nتنبيه: لهذا المريض حسابان بعملتين منفصلتين؛ الأرقام أعلاه تخصّ ' + L +
                     ' وحدها — يُمنع جمعها أو مقارنتها بأرقام العملة الأخرى.';
  return t;
}
/* ═══ M145-c: المساعد الذكي يفهم خيارات الخطة البديلة ═══════════════════════════
   قبل هذا كان الشرح/التسلسل يأخذان كل المخطّط، فيصف النموذجُ البديلين كمرحلتين
   («تاج خزف ثم نستبدله بتاج زركون») ويَعِد المريض بإجماليٍّ هو مجموع البدائل.
   sel: null = بلا خيارات (حمولة بايت-مطابقة للسابق) · 1..3 = خيارٌ واحد (المشترك +
   بنوده — حمولة خطة عادية) · 'cmp' = مقارنة للمريض (مشترك ثم كل خيار بإجماليه). */
function _aiPlannedAll(){
  return (typeof sessions !== 'undefined' && sessions)
    ? sessions.filter(function(s){ return (s.status || 'completed') === 'planned'; }) : [];
}
function _aiPlanPayload(sel, withTotal){
  var all = _aiPlannedAll();
  var optOf = (typeof planOptOf === 'function') ? planOptOf : function(){ return null; };
  if (sel === 'cmp') {
    var used = planOptionsUsed(), out = [];
    out.push('الخطة تتضمن خيارات بديلة — يختار المريض خياراً واحداً فقط:');
    var shared = all.filter(function(s){ return optOf(s) === null; });
    var gs = null;
    if (shared.length) {
      gs = _aiPlanLines(shared);
      out.push('بنود مشتركة (مطلوبة مع أي خيار):');
      out = out.concat(gs.lines);
      out.push('مجموع البنود المشتركة: ' + _planBagText(gs.total));
    }
    used.forEach(function(o){
      var own = all.filter(function(s){ return optOf(s) === o; });
      var g = _aiPlanLines(own);
      var tot = _planBag(); _planBagAddTo(tot, g.total); if (gs) _planBagAddTo(tot, gs.total);
      out.push('الخيار ' + PLAN_OPTION_LABELS[o] + ':');
      out = out.concat(g.lines);
      out.push('إجمالي الخيار ' + PLAN_OPTION_LABELS[o] + (gs ? ' (شاملاً البنود المشتركة)' : '') + ': ' + _planBagText(tot));
    });
    return { plan: out.join('\n'), count: all.length };
  }
  var list = (sel >= 1 && sel <= 3)
    ? all.filter(function(s){ var o = optOf(s); return o === null || o === sel; })
    : all;
  var grouped = _aiPlanLines(list);
  return { plan: grouped.lines.join('\n') + (withTotal ? '\nالإجمالي التقديري: ' + _planBagText(grouped.total) : ''),
           count: list.length };
}
/* منتقي الخيار قبل النداء — يظهر فقط عند وجود خيارات. kind: 'explain' | 'seq'. */
var _aiPlanOptCb = null;
function aiPlanAskOption(kind, cb){
  var used = (typeof planOptionsUsed === 'function') ? planOptionsUsed() : [];
  if (!used.length) { cb(null); return; }
  var box = document.getElementById('aiPlanOptList');
  var ttl = document.getElementById('aiPlanOptTitle');
  if (!box) { cb(null); return; }
  if (ttl) ttl.textContent = (kind === 'seq') ? '🦷 أي خيار تريد ترتيبه؟' : '💬 أي خيار تشرحه للمريض؟';
  var item = function(val, icon, title, sub){
    return '<button type="button" class="wa-hub-item" onclick="aiPlanOptPick(' + val + ')"><span style="font-size:20px;">' + icon + '</span>'
      + '<span style="min-width:0;"><strong style="display:block;">' + escapeHtml(title) + '</strong>'
      + '<span style="font-size:12px;color:var(--text2);">' + escapeHtml(sub) + '</span></span></button>';
  };
  var h = '';
  if (kind !== 'seq') h += item("'cmp'", '⚖️', 'مقارنة الخيارات', 'رسالة واحدة تعرض البدائل على المريض بإجمالي كل خيار ليختار');
  used.forEach(function(o){
    h += item(o, '🔀', 'الخيار ' + PLAN_OPTION_LABELS[o] + ' — ' + _planBagText(planOptionTotalBag(o)),
              (kind === 'seq') ? 'ترتيب بنود هذا الخيار مع البنود المشتركة' : 'شرح هذا الخيار وحده كخطة نهائية');
  });
  box.innerHTML = h;
  _aiPlanOptCb = cb;
  openModal('aiPlanOptModal');
}
function aiPlanOptPick(v){
  var cb = _aiPlanOptCb; _aiPlanOptCb = null;
  closeModal('aiPlanOptModal');
  if (cb) cb(v);
}
function _aiPlanArchLbl(a){ return ({ 'U':'الفك العلوي', 'L':'الفك السفلي' })[a] || a || ''; }
function aiExplainPlan() {
  if (!_aiPlannedAll().length) { showToast('لا توجد علاجات مخطّطة لهذا المريض', true); return; }
  aiPlanAskOption('explain', function(sel){ _aiExplainPlanRun(sel); });   /* M145-c */
}
async function _aiExplainPlanRun(sel) {
  var btn = document.getElementById('aiPlanBtn');
  var plan = _aiPlanPayload(sel, true).plan;
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ التحضير…'; }
  try {
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'treatment_plan_explanation', input: { plan: plan } }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم يصل شرح — حاول مجدداً', true); return; }
    var tel = document.getElementById('aiPlanText');
    if (tel) tel.textContent = text;   // textContent = صفر XSS
    openModal('aiPlanModal');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 اشرح الخطة للمريض'; }
  }
}
function aiPlanCopy() {
  var el = document.getElementById('aiPlanText');
  var txt = el ? (el.textContent || '') : '';
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      function(){ showToast('📋 تم نسخ الشرح'); },
      function(){ showToast('تعذّر النسخ', true); }
    );
  } else {
    showToast('النسخ غير مدعوم بهذا المتصفح', true);
  }
}
function aiPlanPrint() {
  var el = document.getElementById('aiPlanText');
  var txt = el ? (el.textContent || '') : '';
  if (!txt) return;
  var w = window.open('', '_blank');
  if (!w) { showToast('اسمح بالنوافذ المنبثقة للطباعة', true); return; }
  var safe = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(
    '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>خطة العلاج</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;line-height:1.9;padding:28px;white-space:pre-wrap;font-size:15px;color:#111}h2{margin:0 0 16px}</style>' +
    '</head><body><h2>خطة العلاج المقترحة</h2>' + safe + '</body></html>'
  );
  w.document.close();
  w.focus();
  setTimeout(function(){ try { w.print(); } catch (_e) {} }, 300);
}
function aiPlanWaSend() {
  /* إرسال الشرح للمريض واتساباً (طلب المالك بعد live test بند #6):
     النص المعروض نفسه — الاسم حُلّ client-side سلفاً فلا شيء يغادر
     المتصفح باتجاه الـAI. الرقم عبر ppNormalizePhone القانونية (pp-wa.js
     محمَّل قبل هذا الملف على الصفحة). */
  var el = document.getElementById('aiPlanText');
  var txt = el ? String(el.textContent || '').trim() : '';
  if (!txt) { showToast('⚠️ لا يوجد شرح — ولّده أولاً'); return; }
  var phone = (typeof ppNormalizePhone === 'function' && typeof patient !== 'undefined' && patient)
    ? ppNormalizePhone(patient.phone) : null;
  if (!phone) {
    showToast('⚠️ لا يوجد رقم هاتف صالح. أضِف رقماً في معلومات المريض أولاً.');
    return;
  }
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(txt), '_blank');
  if (typeof ppMsgLog === 'function') ppMsgLog('plan', txt, phone);   /* v421 (M149): سجلّ المراسلات — غير حاجب */
}

/* ═══ الموجة 2 بند #1: تقرير طبي / كتاب إحالة (ai-assist · referral_report) ═══
   حمولة مجرّدة الهوية بمسار aiPatientSummary حرفياً (بنود sessions + أصناف
   التنبيهات) — لا اسم/هاتف/رقم ملف. {الاسم} و{التاريخ} يُستبدلان client-side
   بعد التوليد فلا يغادر اسم المريض المتصفح. المسودّة قابلة للتعديل، غير
   محفوظة، والاعتماد بيد الطبيب (نسخ/طباعة). 🔒 صفر كتابة بأي جدول. */
var AI_REF_TITLES = {
  specialist_referral: 'كتاب إحالة',
  medical_report: 'تقرير طبي',
  insurance_report: 'تقرير طبي'
};
function aiReferralOpen() {
  /* تصفير كامل عند كل فتح (ملاحظة live test): كل الحقول كانت تعلق بقيم
     الكتاب السابق — والكتاب وثيقة لحالة بعينها فبقاؤها خطر خلط حالات.
     القيم تعود لافتراضيات الماركب حرفياً. */
  var g = function (id) { return document.getElementById(id); };
  if (g('aiRefDocType')) g('aiRefDocType').value = 'specialist_referral';
  if (g('aiRefTeeth')) g('aiRefTeeth').value = '';
  if (g('aiRefRecipient')) g('aiRefRecipient').value = '';
  if (g('aiRefRecipientSpec')) g('aiRefRecipientSpec').value = '';
  if (g('aiRefExpect')) g('aiRefExpect').value = 'opinion';
  if (g('aiRefUrgency')) g('aiRefUrgency').value = 'routine';
  if (g('aiRefReason')) g('aiRefReason').value = '';
  if (g('aiRefIncTx')) g('aiRefIncTx').checked = true;
  if (g('aiRefIncAlerts')) g('aiRefIncAlerts').checked = true;
  if (g('aiRefTplPick')) g('aiRefTplPick').value = '';
  var ta = document.getElementById('aiRefText');
  if (ta) ta.value = '';   // الصندوق دائم الظهور (v124) — يُفرَّغ عند كل فتح
  /* قوالب سبب الكتاب (M120) — تحميل lazy عند أول فتح، ثم إعادة تعبئة فقط */
  if (typeof REF_TEMPLATES !== 'undefined' && REF_TEMPLATES === null) refTplLoad();
  else if (typeof refTplPopulate === 'function') refTplPopulate();
  openModal('aiReferralModal');
}
function _aiRefTreatmentLines() {
  /* تحسين بند #1 (ملاحظة live test): فصل صريح بين المنجز والمخطط بعنوانين —
     كان الوسم [status] وحده فخلط الموديل المخطط بموضوع الإحالة. الملغى
     والغياب يُستبعدان: لا مكان لهما بخلفية كتاب طبي. */
  var done = [], plan = [];
  if (typeof sessions !== 'undefined' && sessions && sessions.length) {
    sessions.slice(0, 20).forEach(function(s){
      var parts = [];
      if (s.date) parts.push(s.date);
      if (s.type) parts.push(s.type);
      if (s.tooth_num !== null && s.tooth_num !== undefined && s.tooth_num !== '') parts.push('سن ' + s.tooth_num);
      var line = '- ' + parts.join(' · ');
      if (s.notes) line += ' — ' + String(s.notes).slice(0, 150);
      var st = s.status || 'completed';
      if (st === 'planned') plan.push(line);
      else if (st === 'completed') done.push(line);
    });
  }
  var out = [];
  if (done.length) { out.push('علاجات منجزة:'); out = out.concat(done); }
  if (plan.length) { out.push('علاجات مخطّطة (لم تُنفَّذ بعد):'); out = out.concat(plan); }
  return out.join('\n');
}
async function aiReferralGenerate() {
  if (typeof patient === 'undefined' || !patient) return;
  var btn = document.getElementById('aiRefGenBtn');
  var docType = (document.getElementById('aiRefDocType') || {}).value || '';
  var reason = ((document.getElementById('aiRefReason') || {}).value || '').trim().slice(0, 600);
  var teeth = ((document.getElementById('aiRefTeeth') || {}).value || '').trim().slice(0, 100);
  var recipient = ((document.getElementById('aiRefRecipient') || {}).value || '').trim().slice(0, 120);
  var recipientSpec = ((document.getElementById('aiRefRecipientSpec') || {}).value || '').trim().slice(0, 120);
  var expectation = (document.getElementById('aiRefExpect') || {}).value || 'opinion';
  var urgency = (document.getElementById('aiRefUrgency') || {}).value || 'routine';
  var incTx = !!((document.getElementById('aiRefIncTx') || {}).checked);
  var incAlerts = !!((document.getElementById('aiRefIncAlerts') || {}).checked);
  var treatments = incTx ? _aiRefTreatmentLines() : '';
  var alerts = '';
  if (incAlerts) {
    var wp = (typeof warnParts === 'function' ? warnParts(patient).join('، ') : '');
    var ap = (typeof allergyParts === 'function' ? allergyParts(patient).join('، ') : '');
    alerts = [wp, ap].filter(Boolean).join('، ');
  }
  if (!reason && !treatments) { showToast('اكتب سبب الكتاب أو ضمّن موجز العلاجات أولاً', true); return; }
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ التوليد…'; }
  try {
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'referral_report', input: {
        doc_type: docType, reason: reason, teeth: teeth,
        recipient: recipient, recipient_specialty: recipientSpec,
        expectation: expectation, urgency: urgency,
        treatments: treatments, alerts: alerts,
        clinic_name: (typeof CLINIC_SETTINGS_WA !== 'undefined' && CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا'
      } }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم تصل مسودّة — حاول مجدداً', true); return; }
    // استبدال العنصرين النائبين client-side — اسم المريض لا يغادر المتصفح
    var today = new Date();
    var dateStr = String(today.getDate()).padStart(2,'0') + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + today.getFullYear();
    text = text.split('{الاسم}').join(patient.name || '—').split('{التاريخ}').join(dateStr);
    var ta = document.getElementById('aiRefText');
    if (ta) {
      ta.value = text;
      /* السكرولبار مخفي بالتصميم — بلا هذا السطر تُولَد المسودّة تحت خط
         الرؤية ولا يعرف الطبيب أنها جاهزة (ملاحظة live test v124). */
      try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) {}
    }
    showToast('🤖 تم — راجع المستند وعدّله قبل اعتماده');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 توليد المسودّة'; }
  }
}
function aiReferralCopy() {
  var ta = document.getElementById('aiRefText');
  var txt = ta ? (ta.value || '') : '';
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      function(){ showToast('📋 تم نسخ المستند'); },
      function(){ showToast('تعذّر النسخ', true); }
    );
  } else {
    showToast('النسخ غير مدعوم بهذا المتصفح', true);
  }
}
function aiReferralPrint() {
  var ta = document.getElementById('aiRefText');
  var txt = ta ? (ta.value || '') : '';
  if (!txt) return;
  var docType = (document.getElementById('aiRefDocType') || {}).value || '';
  var title = Object.prototype.hasOwnProperty.call(AI_REF_TITLES, docType) ? AI_REF_TITLES[docType] : 'مستند طبي';
  var w = window.open('', '_blank');
  if (!w) { showToast('اسمح بالنوافذ المنبثقة للطباعة', true); return; }
  var safe = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(
    '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + safeTitle + '</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;line-height:1.9;padding:28px;white-space:pre-wrap;font-size:15px;color:#111}</style>' +
    '</head><body>' + safe + '</body></html>'
  );
  w.document.close();
  w.focus();
  setTimeout(function(){ try { w.print(); } catch (_e) {} }, 300);
}

/* ═══ قوالب سبب الكتاب (M120 · kind='referral') — نمط waTpl* حرفياً ═══
   القالب يحفظ نص السبب فقط: الأسنان خاصة بكل حالة (فلسفة M112 — القابل
   لإعادة الاستخدام حصراً). تحميل lazy عند أول فتح للمودال. */
var REF_TEMPLATES = null;
async function refTplLoad(){
  try {
    var uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
    if (!uid || !window.sb) { REF_TEMPLATES = []; refTplPopulate(); return; }
    var res = await window.sb.from('wa_message_templates')
      .select('id, name, body, created_at')
      .eq('owner_id', uid)
      .eq('kind', 'referral')
      .order('created_at', { ascending: false });
    REF_TEMPLATES = (res && !res.error && res.data) ? res.data : [];
  } catch (e) { REF_TEMPLATES = []; }
  refTplPopulate();
}
function refTplPopulate(){
  var sel = document.getElementById('aiRefTplPick');
  if (!sel) return;
  var cur = sel.value;
  var esc = (typeof escapeHtml === 'function') ? escapeHtml : function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var html = '<option value="">— اختر قالباً —</option>';
  (REF_TEMPLATES || []).forEach(function(t){
    html += '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
  });
  sel.innerHTML = html;
  if (cur) sel.value = cur;
}
function refTplApply(){
  var sel = document.getElementById('aiRefTplPick');
  if (!sel || !sel.value) return;
  var t = (REF_TEMPLATES || []).filter(function(x){ return x.id === sel.value; })[0];
  if (!t) return;
  var g = function(id){ return document.getElementById(id); };
  /* شكلان بعمود body (طلب المالك — القالب يعيد الحالة كاملة + النص المولَّد
     فيقل استخدام الـAI): الجديد JSON مُصنَّف v:2 بكل الحقول، والقديم نصٌّ
     خالص يبقى سبباً فقط — توافق رجعي مطلق. */
  var pl = null;
  try {
    var o = JSON.parse(t.body || '');
    if (o && typeof o === 'object' && o.v === 2) pl = o;
  } catch (_e) { /* قالب قديم نصي */ }
  if (!pl) {
    if (g('aiRefReason')) g('aiRefReason').value = t.body || '';
    return;
  }
  if (g('aiRefDocType') && pl.doc_type) {
    g('aiRefDocType').value = pl.doc_type;
    if (g('aiRefDocType').value !== pl.doc_type) g('aiRefDocType').value = 'specialist_referral';
  }
  if (g('aiRefRecipient')) g('aiRefRecipient').value = pl.recipient || '';
  if (g('aiRefRecipientSpec')) g('aiRefRecipientSpec').value = pl.recipient_specialty || '';
  if (g('aiRefExpect') && pl.expectation) g('aiRefExpect').value = pl.expectation;
  if (g('aiRefUrgency') && pl.urgency) g('aiRefUrgency').value = pl.urgency;
  if (g('aiRefReason')) g('aiRefReason').value = pl.reason || '';
  if (g('aiRefText')) {
    var txt = pl.text || '';
    if (txt) {
      /* حلّ العناصر النائبة لمريض الحالة الحالي وتاريخ اليوم (نمط #372) */
      var pname = (typeof patient !== 'undefined' && patient && patient.name) ? String(patient.name) : '';
      if (pname) txt = txt.split('{الاسم}').join(pname);
      var d = new Date();
      var dateStr = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
      txt = txt.split('{التاريخ}').join(dateStr);
      /* {السن} يُحلّ لأسنان الحالة الحالية؛ وبحقل فارغ يبقى النائب ظاهراً
         عمداً مع تنبيه — رقمٌ ناقص أوضح من رقم حالةٍ أخرى خاطئ. */
      if (txt.indexOf('{السن}') !== -1) {
        var curTeeth = g('aiRefTeeth') ? g('aiRefTeeth').value.trim() : '';
        if (curTeeth) txt = txt.split('{السن}').join(curTeeth);
        else showToast('⚠️ القالب يتضمن موضع سن — عبّي حقل «السن/الأسنان» ثم أعد تطبيقه', true);
      }
    }
    g('aiRefText').value = txt;
  }
}
var refTplSaveCurrent = ppGuarded('refTplSaveCurrent', _refTplSaveCurrent_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _refTplSaveCurrent_inner() {
  var g = function(id){ var e = document.getElementById(id); return e ? String(e.value || '') : ''; };
  var reason = g('aiRefReason').trim();
  var genTxt = g('aiRefText').trim();
  if (!reason && !genTxt) { showToast('اكتب سبب الكتاب أو ولّد المسودّة أولاً ثم احفظ', true); return; }
  /* النص المولَّد يُخزَّن بالعنصرين النائبين غير محلولين — نعيد اسم مريض
     الحالة وتاريخ اليوم إلى {الاسم}/{التاريخ} كي لا يتسرب اسمٌ أو تاريخُ
     حالةٍ قديمة إلى قالب يُعاد استخدامه (نمط #372 معكوساً). يلتقط تعديلات
     الطبيب اليدوية أيضاً لأنه يقرأ الصندوق لا النص الخام. */
  if (genTxt) {
    var pname = (typeof patient !== 'undefined' && patient && patient.name) ? String(patient.name) : '';
    if (pname) genTxt = genTxt.split(pname).join('{الاسم}');
    var d0 = new Date();
    var ds0 = String(d0.getDate()).padStart(2,'0') + '/' + String(d0.getMonth()+1).padStart(2,'0') + '/' + d0.getFullYear();
    genTxt = genTxt.split(ds0).join('{التاريخ}');
    /* أرقام الأسنان خاصة بكل حالة (ملاحظة المالك: كل شيء قد يثبت إلا
       رقم السن). الأسنان هنا منسوجة بالنثر لا بسطر حتمي كأمر المخبر —
       فنستبدل ما نعرفه يقيناً: القيمة الكاملة لحقل الأسنان ثم كل رقم
       فيها على حدة، بالعنصر النائب {السن} الذي يُحلّ لأسنان الحالة عند
       التطبيق. */
    var teethRaw = g('aiRefTeeth').trim();
    if (teethRaw) {
      genTxt = genTxt.split(teethRaw).join('{السن}');
      (teethRaw.match(/\d{1,2}/g) || []).forEach(function(tk){
        genTxt = genTxt.replace(new RegExp('(^|[^0-9{])' + tk + '(?![0-9}])', 'g'), '$1{السن}');
      });
    }
    /* شبكة أمان: بقي رقم سن صريح بالنص (حقل الأسنان كان فارغاً مثلاً) ⇒
       تنبيه صريح قبل التخزين بدل تسريب سن حالة قديمة بصمت. */
    if (/(?:السن|الأسنان)\s*:?\s*\d{1,2}/.test(genTxt)) {
      if (!await SyDialog.confirm({ message: '⚠️ النص المولَّد يتضمن رقم سن صريح سيُحفظ كما هو داخل القالب.\n\nالأفضل تعبئة حقل «السن/الأسنان» قبل الحفظ ليصير رقماً متغيّراً.\n\nمتابعة الحفظ رغم ذلك؟', danger: false })) return;
    }
  }
  var body = JSON.stringify({
    v: 2,
    doc_type: g('aiRefDocType') || 'specialist_referral',
    recipient: g('aiRefRecipient').trim().slice(0, 120),
    recipient_specialty: g('aiRefRecipientSpec').trim().slice(0, 120),
    expectation: g('aiRefExpect') || 'opinion',
    urgency: g('aiRefUrgency') || 'routine',
    reason: reason,
    text: genTxt
  });
  var name = await SyDialog.prompt({ title: 'اسم القالب', message: 'اكتب اسماً للقالب' });
  if (name === null) return;
  name = (name || '').trim();
  if (!name) { showToast('الاسم مطلوب', true); return; }
  var uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  if (!uid) { showToast('تعذّر الحفظ — أعد تحميل الصفحة', true); return; }
  var res = await window.sb.from('wa_message_templates')
    .insert({ owner_id: uid, name: name, body: body, kind: 'referral' })
    .select().single();
  if (res.error) { showToast('تعذّر الحفظ: ' + (res.error.message || ''), true); return; }
  REF_TEMPLATES = [res.data].concat(REF_TEMPLATES || []);   /* الأحدث أولاً — يطابق order() */
  refTplPopulate();
  var sel = document.getElementById('aiRefTplPick');
  if (sel) sel.value = res.data.id;
  showToast('✅ حُفظ القالب «' + name + '»');
}
var refTplDeleteSelected = ppGuarded('refTplDeleteSelected', _refTplDeleteSelected_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _refTplDeleteSelected_inner() {
  var sel = document.getElementById('aiRefTplPick');
  if (!sel || !sel.value) { showToast('اختر قالباً أولاً', true); return; }
  var t = (REF_TEMPLATES || []).filter(function(x){ return x.id === sel.value; })[0];
  if (!await SyDialog.confirm({ message: 'حذف القالب «' + ((t && t.name) || '') + '»؟', danger: true })) return;
  /* M130.1: الملكية تُشترط بالاستعلام لا بالـRLS وحدها — دفاعٌ بعمق، ونفسُ
     نمط بقيّة عائلات القوالب. غيابُ الهوية لا يوسّع النطاق بل يبقيه كما كان. */
  var _uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  var _q = window.sb.from('wa_message_templates').delete().eq('id', sel.value).eq('kind', 'referral');
  if (_uid) _q = _q.eq('owner_id', _uid);
  var res = await _q;
  if (res.error) { showToast('تعذّر الحذف', true); return; }
  REF_TEMPLATES = (REF_TEMPLATES || []).filter(function(x){ return x.id !== sel.value; });
  refTplPopulate();
  showToast('🗑 حُذف القالب');
}

/* ═══ الموجة 2 بند #7: اقتراح تسلسل الخطة (ai-assist · treatment_sequencing) ═══
   يعيد استخدام بنّاء حمولة شرح الخطة القائم (_aiPlanLines + فلتر planned)
   كقراءة صرفة — نفس الحمولة المجرّدة حرفياً، صفر PII وصفر لمس للميزة
   القائمة. الجمهور الطبيب: عرض عابر غير محفوظ، والإنسان في الحلقة مطلق —
   البرومبت ممنوع من إضافة/حذف/تشخيص. 🔒 صفر كتابة بأي جدول. */
function aiSeqSuggest() {
  if (!_aiPlannedAll().length) { showToast('لا توجد علاجات مخطّطة لهذا المريض', true); return; }
  aiPlanAskOption('seq', function(sel){ _aiSeqSuggestRun(sel); });   /* M145-c */
}
async function _aiSeqSuggestRun(sel) {
  var btn = document.getElementById('aiSeqBtn');
  var _pl = _aiPlanPayload(sel, false);
  if (_pl.count < 2 ) {
    // بند وحيد بالخطة — ترتيبٌ بلا معنى، ونداءٌ بلا قيمة يُحتسب من السقف
    showToast('بند واحد فقط بالخطة — لا حاجة لاقتراح ترتيب', true); return;
  }
  var plan = _pl.plan;
  var oldLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 جارٍ الترتيب…'; }
  try {
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'treatment_sequencing', input: { plan: plan } }
    });
    if (resp && resp.error) { showToast(await _aiErrText(resp), true); return; }
    var text = (resp && resp.data && resp.data.text) ? String(resp.data.text).trim() : '';
    if (!text) { showToast('لم يصل اقتراح — حاول مجدداً', true); return; }
    var tel = document.getElementById('aiSeqText');
    if (tel) tel.textContent = text;   // textContent = صفر XSS
    openModal('aiSeqModal');
  } catch (e) {
    showToast('تعذّر الاتصال بالمساعد — تحقّق من الإنترنت', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel || '🤖 تسلسل الخطة'; }
  }
}
function aiSeqCopy() {
  var el = document.getElementById('aiSeqText');
  var txt = el ? (el.textContent || '') : '';
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      function(){ showToast('📋 تم نسخ الاقتراح'); },
      function(){ showToast('تعذّر النسخ', true); }
    );
  } else {
    showToast('النسخ غير مدعوم بهذا المتصفح', true);
  }
}

/* ════════ القصة ب: تبويب ملفات المريض ════════ */

/* ============================================================
   Phase 9 — Patient Documents & Imaging  (files tab)
   Uses the shared window.SyDentFiles helper (supabase-init.js).
   ============================================================ */
var _pfFiles = [];          // current patient's document rows
var _pfUrls  = {};          // storage_path -> short-lived signed URL
var _pfLoadInFlight = false;
var _pfToothFilter = '';    // P2: active tooth filter in the gallery ('' = all)
var _toothPhotoCounts = {}; // P2 Phase B: { tooth_num: photo_count } for chart badges

// ── P2: tooth linkage for files (Migration 55) ──────────────
// Build FDI tooth <option>s: permanent (18-11/21-28/48-41/31-38) + primary
// (55-51/61-65/85-81/71-75). tooth_num is stored as TEXT (matches teeth_status).
function pfBuildToothOptions(){
  function span(a, b){ var out=[], step = a < b ? 1 : -1; for (var n=a; n !== b+step; n+=step) out.push(n); return out; }
  function opts(nums){ return nums.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join(''); }
  var SEP = '<option disabled style="color:var(--border);">﹘﹘﹘﹘﹘﹘</option>';
  function optsSep(right, left){ return opts(right) + SEP + opts(left); }
  return '<option value="">— عام (بلا سن) —</option>' +
    '<optgroup label="دائمة — الفك العلوي">' + optsSep(span(18,11), span(21,28)) + '</optgroup>' +
    '<optgroup label="دائمة — الفك السفلي">' + optsSep(span(48,41), span(31,38)) + '</optgroup>' +
    '<optgroup label="لبنية — الفك العلوي">' + optsSep(span(55,51), span(61,65)) + '</optgroup>' +
    '<optgroup label="لبنية — الفك السفلي">' + optsSep(span(85,81), span(71,75)) + '</optgroup>';
}
function pfPopulateToothSelect(){
  var sel = document.getElementById('pfUploadTooth');
  if (sel && sel.options.length <= 1) sel.innerHTML = pfBuildToothOptions();
}
function pfApplyToothFilter(v){
  _pfToothFilter = v || '';
  renderPatientFiles();
}

// P2 Phase B: small clickable photo-count badge on teeth that have linked images.
// Positioned top-left (status badge sits top-right) so the two never collide.
// Clicking it opens the Files tab filtered to that tooth.
function addPhotoBadges(){
  // Clear existing photo badges first (counts may have changed, or no re-render happened).
  document.querySelectorAll('.tooth-photo-badge').forEach(function(b){ b.remove(); });
  if (window.__historyMode) return;   // E: "now" layer — hidden over a past chart
  if (!_toothPhotoCounts) return;
  Object.keys(_toothPhotoCounts).forEach(function(num){
    var n = _toothPhotoCounts[num];
    if (!n) return;
    var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + num + '"]');
    if (!cell) return;
    var badge = document.createElement('div');
    badge.className = 'tooth-photo-badge';
    badge.textContent = '📷' + n;
    badge.title = '📷 ' + n + ' صورة — اضغط للعرض';
    badge.addEventListener('click', function(ev){
      ev.stopPropagation();   // don't open the tooth treatment modal
      _pfToothFilter = String(num);
      switchTabByName('files');
    });
    cell.appendChild(badge);
  });
}

/* Small clickable badge on teeth that have OPEN lab orders (status !== 'delivered';
   sent/received/checked/redo are all open). Bottom-LEFT so it never collides with
   the status badge (top-right) or the photo badge (top-left). Pure read from the
   already-loaded labOrders array — zero extra queries, zero DB writes. Clicking
   opens the labs tab. Re-synced from renderTeeth + every renderLabOrders. */
function addLabBadges(){
  document.querySelectorAll('.tooth-lab-badge').forEach(function(b){ b.remove(); });
  if (window.__historyMode) return;   // E: "now" layer — hidden over a past chart
  var counts = {};
  (labOrders || []).forEach(function(lo){
    if (!lo || lo.status === 'delivered') return;   // delivered = closed/installed
    String(lo.tooth_num || '').split(/[\s,،]+/).forEach(function(tn){
      tn = (tn || '').trim();
      if (tn) counts[tn] = (counts[tn] || 0) + 1;
    });
  });
  Object.keys(counts).forEach(function(num){
    var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + num + '"]');
    if (!cell) return;
    var b = document.createElement('div');
    b.className = 'tooth-lab-badge';
    b.textContent = '🔬' + counts[num];
    b.title = '🔬 ' + counts[num] + ' طلب مخبر مفتوح — اضغط للعرض';
    b.addEventListener('click', function(ev){
      ev.stopPropagation();   // don't open the tooth treatment modal
      switchTabByName('labs');
    });
    cell.appendChild(b);
  });
}

async function loadPatientFiles(){
  if (!window.SyDentFiles || !patientId) return;
  pfPopulateToothSelect();
  var grid = document.getElementById('pfFilesGrid');
  if (grid && !_pfFiles.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:24px;">جارٍ التحميل…</div>';
  }
  if (_pfLoadInFlight) return;
  _pfLoadInFlight = true;
  try {
    _pfFiles = await window.SyDentFiles.list(patientId);
    // Phase B: keep the chart's per-tooth photo counts in sync after upload/delete
    // (both paths call loadPatientFiles), then re-badge the chart live.
    _toothPhotoCounts = {};
    _pfFiles.forEach(function(f){
      var tn = (f.tooth_num != null && f.tooth_num !== '') ? String(f.tooth_num) : '';
      if (tn) _toothPhotoCounts[tn] = (_toothPhotoCounts[tn] || 0) + 1;
    });
    if (typeof addPhotoBadges === 'function') addPhotoBadges();
    var imgPaths = _pfFiles.filter(function(f){ return window.SyDentFiles.isImage(f.mime_type); })
                           .map(function(f){ return f.storage_path; });
    _pfUrls = imgPaths.length ? await window.SyDentFiles.signedUrls(imgPaths, 3600) : {};
    renderPatientFiles();
  } catch(e){
    console.error('loadPatientFiles', e);
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:24px;">تعذّر تحميل الملفات</div>';
  } finally {
    _pfLoadInFlight = false;
  }
}

function pfUpdateBadge(){
  var b = document.getElementById('filesBadge');
  if (!b) return;
  if (_pfFiles.length > 0) { b.textContent = _pfFiles.length; b.style.display = 'inline-block'; }
  else b.style.display = 'none';
}

function renderPatientFiles(){
  var grid = document.getElementById('pfFilesGrid');
  if (!grid) return;
  pfUpdateBadge();

  // Populate the tooth filter from teeth that actually have linked files.
  var teeth = [];
  _pfFiles.forEach(function(f){
    var t = f.tooth_num != null ? String(f.tooth_num) : '';
    if (t && teeth.indexOf(t) < 0) teeth.push(t);
  });
  teeth.sort(function(a,b){ return (parseInt(a,10)||0) - (parseInt(b,10)||0); });
  var fbar = document.getElementById('pfFilterBar');
  var fsel = document.getElementById('pfToothFilter');
  if (fbar && fsel) {
    if (teeth.length) {
      // If the active filter's tooth no longer has any files, reset to "all".
      if (_pfToothFilter && teeth.indexOf(_pfToothFilter) < 0) _pfToothFilter = '';
      fbar.style.display = 'flex';
      fsel.innerHTML = '<option value="">الكل</option>' + teeth.map(function(t){
        return '<option value="' + t + '"' + (t === _pfToothFilter ? ' selected' : '') + '>السن ' + t + '</option>';
      }).join('');
    } else {
      fbar.style.display = 'none';
      _pfToothFilter = '';
    }
  }

  if (!_pfFiles.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:24px;">لا توجد ملفات بعد — ارفع أول صورة أشعة أو مستند.</div>';
    return;
  }

  var list = _pfToothFilter
    ? _pfFiles.filter(function(f){ return String(f.tooth_num) === String(_pfToothFilter); })
    : _pfFiles;

  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:24px;">لا توجد ملفات مرتبطة بالسن ' + escapeHtml(_pfToothFilter) + '.</div>';
    return;
  }

  grid.innerHTML = list.map(function(f){
    var isImg = window.SyDentFiles.isImage(f.mime_type);
    var url   = _pfUrls[f.storage_path] || '';
    var cat   = window.SyDentFiles.CAT_LABELS[f.category] || window.SyDentFiles.CAT_LABELS.other;
    var thumb = (isImg && url)
      ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" style="width:100%;height:110px;object-fit:cover;display:block;">'
      : '<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:40px;background:var(--bg3);">📄</div>';
    var d = f.created_at ? (SyDT.numDate(f.created_at) + (SyDT.time12(f.created_at) ? ' ' + SyDT.time12(f.created_at) : '')) : '';   // v478: أرقاماً ووقتُ الرفع
    var toothBadge = (f.tooth_num != null && f.tooth_num !== '')
      ? '<div style="font-size:10px;color:var(--green);font-weight:700;">🦷 السن ' + escapeHtml(String(f.tooth_num)) + '</div>'
      : '';
    return '<div style="border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--bg2);display:flex;flex-direction:column;">' +
      '<div style="cursor:pointer;" onclick="pfOpenFile(\'' + f.id + '\')">' + thumb + '</div>' +
      '<div style="padding:8px 9px;flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<div style="font-size:11px;color:var(--text2);">' + cat + '</div>' +
        toothBadge +
        '<div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(f.file_name) + '">' + escapeHtml(f.file_name) + '</div>' +
        '<div style="font-size:10px;color:var(--text2);">' + escapeHtml(d) + ' · ' + escapeHtml(window.SyDentFiles.humanSize(f.size_bytes)) + '</div>' +
        '<div class="sy-acts" style="flex-wrap:wrap;margin-top:4px;">' +
          '<button class="sy-act" onclick="pfOpenFile(\'' + f.id + '\')" title="عرض / تنزيل">👁️ عرض</button>' +
          '<button class="sy-act sy-act-danger" onclick="pfDeleteFile(\'' + f.id + '\')" title="حذف">🗑️ حذف</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function pfOpenFile(id){
  var f = _pfFiles.find(function(x){ return x.id === id; });
  if (!f) return;
  var url = window.SyDentFiles.isImage(f.mime_type) ? _pfUrls[f.storage_path] : null;
  if (!url) url = await window.SyDentFiles.signedUrl(f.storage_path, 3600);
  if (!url) { showToast('تعذّر فتح الملف'); return; }
  if (window.SyDentFiles.isImage(f.mime_type)) {
    document.getElementById('pfLightboxName').textContent = f.file_name || 'معاينة';
    var img = document.getElementById('pfLightboxImg');
    img.src = url; img.style.display = 'block';
    var dl = document.getElementById('pfLightboxDownload');
    dl.href = url; dl.setAttribute('download', f.file_name || 'file');
    openModal('pfLightbox');
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

async function pfOnFilesPicked(fileList){
  if (!fileList || !fileList.length) return;
  if (!window.SyDentFiles) { showToast('الميزة غير متاحة'); return; }
  var cat = (document.getElementById('pfUploadCategory') || {}).value || 'other';
  var tooth = (document.getElementById('pfUploadTooth') || {}).value || '';
  var status = document.getElementById('pfUploadStatus');
  var files = Array.prototype.slice.call(fileList);
  var done = 0, failed = 0;
  if (status){ status.style.display = 'block'; }
  for (var i = 0; i < files.length; i++) {
    if (status) status.textContent = 'جارٍ الرفع… (' + (i+1) + '/' + files.length + ')';
    var r = await window.SyDentFiles.upload(patientId, files[i], { category: cat, toothNum: tooth || null });
    if (r.ok) {
      done++;
      if (window.logAudit) {
        try { window.logAudit('patient.file_upload', { patientId: patientId, patientName: (patient && patient.name) || null, description: 'رفع ملف: ' + (files[i].name || '') + ' (' + cat + (tooth ? ' · السن ' + tooth : '') + ')' }); } catch(e){}
      }
    } else {
      failed++;
      console.error('upload failed', r);
    }
  }
  if (status) {
    status.textContent = (failed ? ('تم رفع ' + done + ' — فشل ' + failed) : ('تم رفع ' + done + ' ملف ✓'));
    setTimeout(function(){ status.style.display = 'none'; }, 2600);
  }
  await loadPatientFiles();
}

async function pfDeleteFile(id){
  var f = _pfFiles.find(function(x){ return x.id === id; });
  if (!f) return;
  if (!await SyDialog.confirm({ message: 'حذف هذا الملف نهائياً؟\n' + (f.file_name || ''), danger: true })) return;
  var r = await window.SyDentFiles.remove(f);
  if (r.ok) {
    if (window.logAudit) { try { window.logAudit('patient.file_delete', { patientId: patientId, patientName: (patient && patient.name) || null, description: 'حذف ملف: ' + (f.file_name || '') }); } catch(e){} }
    showToast('تم الحذف');
    await loadPatientFiles();
  } else {
    showToast('تعذّر الحذف');
    console.error('delete failed', r);
  }
}

/* ════════ القصة ج: سجل نشاطات المريض ════════ */

/* ── Phase 5F: Patient audit log ──
   Shows the audit_log rows for this specific patient, scoped by RLS owner_id.
   Lazy-loaded on first tab click. Owner-only (UI gated; RLS gates the data).
   Graceful fallback if Migration 9.1 not applied yet. */
var _patientAuditLoaded = false;
var _patientAuditInFlight = false;

async function loadPatientAuditLog() {
  if (_patientAuditInFlight) return;
  if (_patientAuditLoaded) return; // already loaded once per session
  _patientAuditInFlight = true;
  var box = document.getElementById('patientAuditContent');
  box.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">جارٍ التحميل…</div>';

  try {
    var res = await window.sb.from('audit_log')
      .select('id, employee_name_snapshot, employee_role_snapshot, action_type, description, is_alert, alert_reason, created_at')
      .eq('owner_id', currentUser.id)
      .eq('is_archived', false)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (res.error) {
      var m = (res.error.message || '') + ' ' + (res.error.code || '');
      if (/audit_log|42P01|PGRST205/i.test(m)) {
        box.innerHTML =
          '<div style="text-align:center;padding:40px;color:var(--text2);">' +
            '<div style="font-size:36px;margin-bottom:10px;opacity:0.6;">🛠️</div>' +
            '<div style="font-weight:800;margin-bottom:6px;">السجل غير مفعّل بعد</div>' +
            '<div style="font-size:12px;">يبدو أن Migration 9.1 لم يُشغَّل بعد.</div>' +
          '</div>';
        _patientAuditLoaded = true;
        return;
      }
      console.warn('loadPatientAuditLog:', res.error);
      box.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">⚠ فشل التحميل</div>';
      return;
    }

    var rows = res.data || [];
    if (rows.length === 0) {
      box.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--text2);">' +
          '<div style="font-size:36px;margin-bottom:10px;opacity:0.6;">📭</div>' +
          '<div>لا توجد عمليات مسجَّلة على هذا المريض بعد</div>' +
        '</div>';
      _patientAuditLoaded = true;
      return;
    }

    var actionLabels = {
      'patient.create': '➕ إضافة',
      'patient.edit': '✏️ تعديل',
      'patient.delete': '🗑️ حذف',
      'appointment.create': '📅 موعد جديد',
      'appointment.edit': '✏️ تعديل موعد',
      'appointment.status_change': '🔄 تغيير حالة',
      'appointment.bulk_complete': '✅ إكمال موعد جماعي',
      'appointment.delete': '🗑️ حذف موعد',
      'session.create': '🦷 جلسة جديدة',
      'session.delete': '🗑️ حذف جلسة',
      'payment_plan.create': '💰 خطة أقساط جديدة',
      'payment_plan.update': '✏️ تعديل خطة أقساط',
      'payment_plan.completed': '✅ إكمال خطة أقساط',
      'payment_plan.cancelled': '🚫 إلغاء خطة أقساط',
      'payment.create': '💰 دفعة',
      'payment.edit_splits': '🔀 تعديل توزيع دفعة',
      'payment.delete': '🗑️ حذف دفعة',
      'lab.create': '🥽 طلب مخبر',
      'lab.edit': '✏️ تعديل مخبر',
      'lab.redo': '🔄 إعادة عمل للمخبر',
      'lab.delete': '🗑️ حذف مخبر',
      // Phase 6 K: operatory entries are clinic-wide (no patient_id) so they
      // won't normally appear in this patient-scoped tab. Defensive entry
      // kept for label consistency if the audit query ever surfaces them.
      'operatory.create': '🏥 إضافة غرفة',
      'operatory.edit': '🏥 تعديل غرفة',
      'operatory.delete': '🏥 حذف غرفة',
      // Phase 6 L-B: appointment-type templates are also clinic-wide.
      // Defensive labels for consistency.
      'appointment_type.create': '🎨 إضافة قالب موعد',
      'appointment_type.edit': '🎨 تعديل قالب موعد',
      'appointment_type.delete': '🎨 حذف قالب موعد',
      // Phase 7.1: expenses are clinic-wide (no patient_id). Defensive
      // labels kept for consistency with the central audit-log page.
      'expense.create': '💰 إضافة مصروف',
      'expense.edit': '💰 تعديل مصروف',
      'expense.delete': '💰 حذف مصروف',
      'expense_category.create': '🏷️ إضافة تصنيف مصاريف',
      'expense_category.edit': '🏷️ تعديل تصنيف مصاريف',
      'expense_category.delete': '🏷️ حذف تصنيف مصاريف',
      // Phase 7.2: payouts are clinic-wide (no patient_id). Defensive
      // labels kept for consistency with the central audit-log page.
      'payout.create': '💳 إضافة دفعة موظف',
      'payout.edit': '💳 تعديل دفعة موظف',
      'payout.delete': '💳 حذف دفعة موظف',
      // Backlog #8 (M91): implant documentation records.
      'implant_log.create': '🦴 سجل زرعة',
      'implant_log.delete': '🗑️ حذف سجل زرعة',
      // Backfill (pre-existing gap): clinical keys logged since P1/P6 but never labeled.
      'prescription.create': '💊 روشتة جديدة',
      'prescription.delete': '🗑️ حذف روشتة',
      'postop_note.create': '📋 تعليمات بعد الجلسة',
      'postop_note.delete': '🗑️ حذف تعليمات'
    };
    var roleLabels = { owner: 'المالك', doctor: 'طبيب', secretary: 'سكرتيرة' };

    var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
    rows.forEach(function(r){
      var d = r.created_at ? new Date(r.created_at) : null;
      var dateStr = d ? (SyDT.numDate(d) + ' • ' + SyDT.time12(d)) : '—';   // v487: سجلُّ نشاط المريض أرقاماً ووقتاً
      var actLabel = actionLabels[r.action_type] || r.action_type;
      var roleLabel = roleLabels[r.employee_role_snapshot] || (r.employee_role_snapshot || '');
      var alertBadge = r.is_alert
        ? '<span class="tone tone-red" style="display:inline-block;border-width:1px;border-style:solid;font-size:10px;font-weight:800;padding:1px 6px;border-radius:5px;margin-right:6px;" title="' + escapeHtml(r.alert_reason || '') + '">⚠ تنبيه</span>'
        : '';
      var bg = r.is_alert ? 'var(--red-soft)' : 'var(--bg2)';
      var bd = r.is_alert ? 'var(--red-bd)' : 'var(--border)';

      html +=
        '<div class="pp-audit-row" style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:10px;padding:10px 13px;display:flex;gap:10px;align-items:start;">' +
          '<div class="pp-audit-date" style="font-size:11px;color:var(--text2);min-width:110px;text-align:left;">' + escapeHtml(dateStr) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:13px;color:var(--text);margin-bottom:3px;">' +
              alertBadge +
              '<span style="font-weight:700;color:var(--green);">' + escapeHtml(actLabel) + '</span> · ' +
              '<span>' + escapeHtml(r.description || '—') + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text2);">' +
              '👤 ' + escapeHtml(r.employee_name_snapshot || '—') + ' (' + escapeHtml(roleLabel) + ')' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
    _patientAuditLoaded = true;
  } finally {
    _patientAuditInFlight = false;
  }
}

/* ═══════════════ 🚩 أعلام المريض الملوّنة (M148 · v414) ═══════════════
   عرضٌ بهيدر البطاقة + تحريرٌ سطريّ بكتابةٍ فورية (نمط شرائح المرحلة): لا نافذة
   ولا لمس لمودال تعديل المريض ومراياه. التعريف/التعقيم/الرسم من SyDentFlags
   (supabase-init.js) — مصدرٌ واحد. إداريةٌ بحتة: صفر مال، ولا تختلط بـmedical_flags. */
var _ppFlagDefs = null;        // تعريفات العيادة الفعّالة (بعد التحميل)
var _ppFlagsEditing = false;
async function ppFlagsInit() {
  if (!window.SyDentFlags || !currentUser) return;
  _ppFlagDefs = await window.SyDentFlags.load(currentUser.id);
  ppFlagsRender();
}
function ppFlagsRender() {
  var el = document.getElementById('pFlags');
  if (!el || !window.SyDentFlags || !_ppFlagDefs || !patient) return;
  var F = window.SyDentFlags;
  var sel = F.sanitizeFlags(patient.flags, _ppFlagDefs);
  if (!_ppFlagsEditing) {
    el.innerHTML = F.chipsHtml(sel, _ppFlagDefs)
      + '<button type="button" class="pt-flag-btn" onclick="ppFlagsToggleEdit()" title="أعلام المريض — وسمٌ إداري يظهر بالبطاقة وقائمة المرضى">'
      + (sel.length ? 'تعديل' : '🚩 أعلام') + '</button>';
    return;
  }
  el.innerHTML = _ppFlagDefs.map(function (d) {
    var on = sel.indexOf(d.k) >= 0;
    return '<button type="button" class="pt-flag pt-flag-pick cbadge tone tone-' + d.tone + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false')
      + '" onclick="ppFlagToggle(\'' + d.k + '\')">' + (on ? '✓ ' : '') + F.esc(d.label) + '</button>';
  }).join('')
    + '<button type="button" class="pt-flag-btn" onclick="ppFlagsToggleEdit()">تم</button>'
    + '<a class="pt-flag-link" href="settings.html#patientFlags" title="تسمية الأعلام وألوانها من الإعدادات">تخصيص الأعلام</a>';
}
function ppFlagsToggleEdit() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
  _ppFlagsEditing = !_ppFlagsEditing;
  ppFlagsRender();
}
var ppFlagToggle = ppGuarded('ppFlagToggle', _ppFlagToggle_inner, '⏳');
async function _ppFlagToggle_inner(k) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل بيانات المريض'); return;
  }
  var F = window.SyDentFlags;
  if (!F || !_ppFlagDefs || !_ppFlagDefs.some(function (d) { return d.k === k; })) return;
  var prev = F.sanitizeFlags(patient.flags, _ppFlagDefs);
  var next = prev.indexOf(k) >= 0 ? prev.filter(function (x) { return x !== k; }) : prev.concat([k]);
  var u = await window.sb.from('patients').update({ flags: next.length ? next : null })
    .eq('id', patientId).eq('doctor_id', currentUser.id);
  if (u.error) {
    var em = (u.error.message || '') + ' ' + (u.error.code || '');
    showToast(/\b42703\b|PGRST204/i.test(em) ? '⚠️ يلزم تطبيق Migration 148 (أعلام المريض)' : '❌ تعذّر الحفظ: ' + u.error.message);
    return;
  }
  patient.flags = next.length ? next : null;
  if (window.logAudit) {
    try {
      window.logAudit('patient.edit', { entityType: 'patient', entityId: patientId, patientId: patientId, patientName: (patient && patient.name) || '',
        description: 'تعديل أعلام المريض', oldValue: { flags: prev }, newValue: { flags: next } });
    } catch (e) { console.warn('ppFlagToggle audit:', e); }
  }
  ppFlagsRender();
}
