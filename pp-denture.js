/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — pp-denture.js (M202): التعويضات المتحركة — ج1 + ج2-أ
   ───────────────────────────────────────────────────────────────────────────
   البلاغ (المالك، 12 تشرين الثاني 2026): «كأنو ما عنا تعويضات متحركة». الجهازُ الكامل أو الجزئي
   كان يُسجَّل «علاجاً جماعياً على الفك» فقط: جلسةٌ بلا رسمٍ ولا أسنانٍ معوَّضة، والجهازُ الموجود
   مسبقاً لا يُسجَّل إطلاقاً.
   المراجعة: Open Dental (Paint Type «Denture» · Arch/Tooth Range) · Sensei Cloud (المنطقة ← كامل/جزئي
   ← تأكيد الأسنان المفقودة) · Denticon (تحديد الأسنان ثم Denture).

   النموذج:
   • نوعا تطبيق بالكتالوج: denture_full (فكٌّ كامل: 14 سناً من 7 إلى 7) · denture_partial (أسنانٌ مفقودة بعينها).
   • المخطط: صفُّ teeth_status بسطحٍ محجوز 'DENTURE' لكل سنٍّ يعوّضه الجهاز، وصفوفُ الجهاز الواحد
     تتشارك unit_id (سابقةُ الجسر M85). السطحُ المحجوز لا يزاحم WHOLE (صفَّ القلع) ولا PONTIC.
   • السجل: جلسةُ فكٍّ واحدة لكل جهاز (tooth_num NULL · arch U/L) ⇒ كلُّ القوائم والمواعيد والخطة
     تسمّيها «الفك العلوي/السفلي» بلا تعديل؛ والوصفُ يحمل الأسنان. الربط = unit_id يساوي معرّفَ الجلسة.
     الحالاتُ غير المالية (موجود مسبقاً · محوّل) تكتب صفوفَ المخطط وحدها — بلا جلسة، كأي علاجِ سن.
   • الذاكرة: dentureMap منفصلةٌ عن teethMap عمداً (سابقةُ window.teethDx — v605): حلقاتُ teethMap كثيرةٌ
     وتقرأ كلَّ مفتاحٍ سطحاً. والرسمُ طبقةٌ تُضاف بعد renderTeeth ⇒ مخططٌ بلا جهاز لا يتغيّر فيه بايت.
   • المال: صفر مسار جديد — جلسةٌ بالتكلفة المدخلة ثم reallocatePatientFunds كأي جلسة فك.

   ج1-ب (v710 · M203 — بلاغُ المالك بعد التجربة الحيّة 13/11/2026): العلاجاتُ لم تُعثَر عليها بتبويب «تعويضي» بنافذة السن،
   والفكُّ الأدرد بلا مدخل. ⇒ علاجاتُ الجهاز تظهر بنافذة أي سنٍّ دائم (فئةُ «تعويضات متحركة») ونقرتُها تفتح المنتقي على فكّ
   ذلك السن · «فك أدرد» بشريط الفحص الأولي يعلّم أسنانَ الفك القائمة مفقودةً بكبسة.

   ج2-أ (v717): الجهازُ يتعايش مع الزرعة والجسر على السن نفسه — صفُّه بسطحه المحجوز لا يزاحم صفَّيهما:
   • الكاملُ فوق زرعاتٍ منجزة = «جهاز فوق الزرعات» (الزرعةُ ليست مانعاً؛ v719: برغيُّها يبقى ظاهراً وسنُّ الجهاز فوقه بلا تاجٍ للزرعة).
   • الزرعةُ المخطّطة ودميةُ الجسر المخطّط تقبلان الجهازَ بديلاً (بالكامل تلقائياً، وبالجزئي بنقرة السن).
   • والعكس: السنُّ الذي يعوّضه جهازٌ يقبل زرعةً أو جسراً (خطةٌ بديلة أو زرعةٌ تحت الجهاز)؛ إزالتُهما تعيده مفقوداً.
   ج2-ب (v720 · M204): بدائلُ الجهاز وتبديلُه. صفٌّ واحد لكل سنٍّ على المخطط ⇒ جهازٌ ثانٍ على أسنانٍ يعوّضها جهازٌ مرسوم
   لا صفوفَ له: جلستُه تحمل أسنانَه (ledger_sessions.unit_teeth) وتبقى «معلّقة» حتى تخلو أسنانُها.
   • مخطّطٌ فوق مخطّط = بديل: الجلستان تُوسَمان خيارين بالخطة (أ/ب)، واعتمادُ أحدهما يحذف الآخر والمرسومُ يتبع المعتمد.
   • مخطّطٌ فوق قائم/منجز = تبديل: القديمُ يبقى مرسوماً حتى يُنجَز الجديد، فيأخذ الجديدُ الرسم (جلسةُ القديم تبقى بالسجل).
   • منجزٌ فوق قائم/منجز = تبديلٌ فوري بعد تأكيد. «موجود مسبقاً» لا يُسجَّل فوق جهازٍ آخر.
   • جهازٌ مخطّط على سنٍّ عليه زرعةٌ/جسرٌ مخطّط (وبالعكس) ⇒ وسمٌ تلقائي أ/ب بآلية plan_option القائمة (عرضيٌّ بحت).
   القيودُ الباقية (ج2-ج): لا يُلغى قلعُ سنٍّ والجهازُ عليه · الجزئي على قلعٍ منجز لا مخطّط ·
   الكاملُ لا يُسجَّل على فكٍّ فيه جسرٌ منجز، والزرعةُ المنجزة لا يعوّضها جهازٌ جزئي.
   ═══════════════════════════════════════════════════════════════════════════ */

var DENT_SURFACE = 'DENTURE';
/* أسنانُ الجهاز الكامل: من الرحى الثانية إلى الرحى الثانية (أرحاءُ العقل لا تُعوَّض) */
var DENT_FULL_TEETH = {
  U: [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27],
  L: [47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37]
};
/* مستوى قاعدة الجهاز بإحداثيات خلية السن (viewBox 0 0 100 210، قبل قلب الفك العلوي):
   أعمقُ حدٍّ مينائي-ملاطي بالتشريح = 80 ⇒ الرابطُ على 90 لا يمسّ سطوحَ تاج سنٍّ قائم. */
var DENT_BASE_BOTTOM = 104;   // طرفُ جناح القاعدة
var DENT_GUM_TOP = 44;        // أعلى حليمةٍ ممكنة (بدايةُ تدرّج اللثة — ثابتٌ لكل الخلايا كي لا يختلف اللونُ عند الوصلة)
var DENT_PAPILLA = 15;        // ارتفاعُ الحليمة اللثوية فوق عنق السن
/* v739: الواصلُ الرئيسي صفيحةٌ بعرض 14 وحدة تمرّ خلف الأسنان (كان خطاً 3.2 أمامها على y=90) */
var DENT_CONN_T = 69, DENT_CONN_B = 83;
/* المنظر الإطباقي: حدودُ خلية السن بـviewBox، وحدُّ الصفيحة اللساني/الحنكي، وبدايةُ تدرّجها */
var DENT_OCC_X0 = 16.67, DENT_OCC_X1 = 83.33, DENT_OCC_SPAN = 66.67, DENT_OCC_PLATE = 92, DENT_OCC_GRAD_T = 14;
var DENT_STEEL = '#55637a', DENT_STEEL_HI = '#cfd7e2';
/* v739 (M209): الضمّاتُ المقترحة تلقائياً — رباعيٌّ بحدٍّ أقصى 4 (قرارُ المالك 17/11/2026 بعد مراجعة McCracken/Davenport) */
var DENT_CLASP_MAX = 4;
/* امتدادُ القاعدة نحو الجار = نصفُ الفراغ بين الخليتين + تراكبٌ صغير. v739: تحت كل قطعةٍ خلفيةٌ مصمتة بلون المخطط، فالتراكبُ
   لا يغمّق اللونَ الشفّاف عند الوصلة (كان ε = 0.15 لتفاديه ويترك خطاً شعرياً). القيمُ مرآةُ patient-profile.css
   (.jaw-row gap · .midline) ويحرسها prove-denture. */
var DENT_ROW_GAP_PX = { permanent: 4, mixed: 7, primary: 11 };
var DENT_MIDLINE_PX = 14;   // عرضُ الخط الناصف (2) + هامشاه (6 + 6)
var DENT_BLEED_EPS = 0.9, DENT_BLEED_EPS_OCC = 0.7;
/* عبر المنتصف الخطُّ الناصف (2px) يُرسم بين الخليتين — التراكبُ هناك أكبر كي تغطّيه الخليةُ اللاحقة كلَّه */
var DENT_BLEED_EPS_MID = 3, DENT_BLEED_EPS_MID_OCC = 2;

var dentureMap = {};        // سن → { key, st, unit, prov } — الحيّ
var _dentLiveRef = null;    // الخريطةُ الحيّة أثناء العرض التاريخي
var pendingDenture = null;  // سياقُ المنتقي/الخطوة الثانية (يُستهلك عند الحفظ)
/* v737: جلسةٌ أُنجزت وتعذّر رسمُ جهازها (أو سنِّها المضاف) — خطأُ كتابة لا رفضُ قاعدة. تقرؤها صفحةُ المريض بعد خطّاف الإنجاز
   فتعيد الجلسةَ «مخطّطة»: لا إنجازَ بلا رسمه (كان يبقى «منجزاً» بلا رسمٍ وبلا تنبيه، ولا طريقَ لرسمه بعدها). */
var _dentDrawFail = {};
function dentMarkDrawFail(id) { if (id) _dentDrawFail[String(id)] = true; }
function dentDrawFailed(sess) { return !!(sess && sess.id && _dentDrawFail[String(sess.id)]); }
function dentClearDrawFail(sess) { if (sess && sess.id) delete _dentDrawFail[String(sess.id)]; }

/* ── مساندُ النوع ── */
function dentIsTp(tp) { return tp === 'denture_full' || tp === 'denture_partial'; }
function dentIsTreatment(t) { return !!t && dentIsTp(t.target_part); }
function dentIsKey(key) { return !!key && typeof getTreatment === 'function' && dentIsTreatment(getTreatment(key)); }
function dentHas(n) { return !!dentureMap[String(n)]; }
function dentArchOf(n) { var q = Math.floor(parseInt(n, 10) / 10); return (q === 1 || q === 2) ? 'U' : 'L'; }
/* ترتيبُ العرض = ترتيبُ المخطط (المصفوفةُ تُرسم من اليمين إلى اليسار) */
function dentArchRow(arch) { return arch === 'U' ? UPPER_T : LOWER_T; }
function dentArchLabel(arch) { return (typeof ARCH_LABELS !== 'undefined' && ARCH_LABELS[arch]) || (arch === 'U' ? 'الفك العلوي' : 'الفك السفلي'); }
function dentSortTeeth(teeth, arch) {
  var row = dentArchRow(arch);
  return teeth.slice().sort(function (a, b) { return row.indexOf(parseInt(a, 10)) - row.indexOf(parseInt(b, 10)); });
}
function dentIsFullSet(teeth, arch) {
  var full = DENT_FULL_TEETH[arch];
  return full.every(function (t) { return teeth.indexOf(t) !== -1; });
}
/* «الفك العلوي — كامل» أو «الفك العلوي — الأسنان 14، 15، 16» — نصُّ الوصف بالجلسة والعناوين */
function dentAreaText(arch, teeth) {
  var nums = teeth.map(function (t) { return parseInt(t, 10); });
  if (dentIsFullSet(nums, arch)) return dentArchLabel(arch) + ' — كامل';
  var sorted = nums.slice().sort(function (a, b) { return a - b; });   /* ترقيمٌ تصاعدي — كما يُكتب بالسجل وورقة المخبر */
  return dentArchLabel(arch) + ' — ' + (sorted.length === 1 ? 'السن ' : 'الأسنان ') + sorted.join('، ');
}
/* المعدود بالعربية: سن واحد · سنّان · 3–10 أسنان · 11 فأكثر سناً */
function dentTeethWord(n) {
  n = parseInt(n, 10) || 0;
  if (n === 1) return 'سن واحد';
  if (n === 2) return 'سنّان';
  return n + (n >= 3 && n <= 10 ? ' أسنان' : ' سناً');
}
function dentUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ── تحميلُ الصفوف: المحمّلُ يمرّر كلَّ صف؛ صفُّ الجهاز يُؤخذ هنا ولا يدخل teethMap ── */
function dentReset() { dentureMap = {}; }
function dentTake(row) {
  if (!row || row.surface !== DENT_SURFACE) return false;
  dentureMap[String(row.tooth_num)] = {
    key: row.treatment_key, st: row.status || 'completed',
    unit: row.unit_id || null, prov: row.provider_id || null,
    clasps: (row.denture_clasps === null || row.denture_clasps === undefined) ? null : String(row.denture_clasps)   /* M209: null = اقتراحٌ تلقائي */
  };
  return true;
}
/* العرضُ التاريخي: الخريطةُ الحيّة تُحفظ مرةً وتُستعاد عند الخروج — لا كتابةَ عليها أثناءه */
function dentHistBegin() {
  if (_dentLiveRef === null) _dentLiveRef = dentureMap;
  dentureMap = {};
}
function dentHistEnd() {
  if (_dentLiveRef !== null) { dentureMap = _dentLiveRef; _dentLiveRef = null; }
}

/* ── الوحدات: كلُّ جهازٍ = مجموعةُ صفوفه بمعرّف الوحدة (أو بالمفتاح والفك والحالة لصفٍّ بلا معرّف — التاريخي) ── */
function dentUnits() {
  var groups = {}, order = [];
  Object.keys(dentureMap).forEach(function (tn) {
    var d = dentureMap[tn]; if (!d) return;
    var arch = dentArchOf(tn);
    var gid = d.unit ? ('u:' + d.unit) : ('k:' + d.key + '|' + arch + '|' + d.st);
    if (!groups[gid]) { groups[gid] = { id: d.unit || null, key: d.key, st: d.st, arch: arch, teeth: [], clasps: null }; order.push(gid); }
    groups[gid].teeth.push(parseInt(tn, 10));
    /* M209: قائمةُ الضمّات الصريحة تُكتب على كل صفوف الوحدة؛ أولُ صفٍّ يحملها يكفي (سنٌّ أُضيف لاحقاً صفُّه بلا قائمة) */
    if (groups[gid].clasps === null && d.clasps !== null && d.clasps !== undefined) groups[gid].clasps = String(d.clasps);
  });
  return order.map(function (g) { groups[g].teeth = dentSortTeeth(groups[g].teeth, groups[g].arch); return groups[g]; });
}
function dentUnitOf(n) {
  var d = dentureMap[String(n)]; if (!d) return null;
  var us = dentUnits();
  for (var i = 0; i < us.length; i++) { if (us[i].teeth.indexOf(parseInt(n, 10)) !== -1) return us[i]; }
  return null;
}
function dentUnitName(u) {
  var t = (typeof getTreatment === 'function') ? getTreatment(u.key) : null;
  return t ? t.name : 'جهاز متحرك';
}
/* جلسةُ الوحدة: الربطُ بالمعرّف نفسه (unit_id = معرّف الجلسة) */
function dentSessionOfUnit(u) {
  if (!u || !u.id || typeof sessions === 'undefined' || !sessions) return null;
  for (var i = 0; i < sessions.length; i++) { if (sessions[i] && sessions[i].id === u.id) return sessions[i]; }
  return null;
}

/* ═════════════════════ الضمّات (v739 · M209) ═════════════════════
   المالك (16–17/11/2026): «الجهاز المتحرك ما له ضمّات… المفروض الطبيب يحدّد مكان الضمّات» ⇒ «خلي الضمّات اقتراح تلقائي وإذا أراد
   الدكتور بيضيف أو بيلغي ضمّة — بدي شي احترافي ومبسّط وسهل التعامل» ⇒ «توصياتك».
   المراجع: التصميمُ الرباعي (ضمّةٌ على كل طرفٍ من الفراغ المحصور — مدرسةُ McCracken) · Davenport وزملاؤه BDJ 2001 (السرجُ الحرّ
   ضمّتُه على السن المجاور له؛ المحصورُ ضمّةٌ على طرفٍ واحد على الأقل) · «ضمّةٌ على كل دعامة» خطأٌ شائع ⇒ حدٌّ أقصى 4.
   النموذج: teeth_status.denture_clasps على صفوف الجهاز — NULL = الاقتراحُ التلقائي (يتبع المخطط الحيّ: كلُّ جهازٍ قائمٍ يأخذه بلا
   ترحيل بيانات)، ونصٌّ (ولو فارغاً) = قائمةُ الطبيب الصريحة. لا صفَّ على السن الداعم نفسه ⇒ لا تزاحمَ مع محوِ صفوفه. */
function dentIsPartialUnit(u) {
  var t = (u && typeof getTreatment === 'function') ? getTreatment(u.key) : null;
  return t ? t.target_part === 'denture_partial' : (!!u && !dentIsFullSet(u.teeth, u.arch));
}
/* سنٌّ يحمل ضمّة: قائمٌ بتاجه بالفم (طبيعيٌّ أو دعامةُ جسر) — لا مفقود ولا مزروع ولا دمية ولا قلعُه مخطّط ولا يعوّضه جهاز */
function dentClaspOk(n) {
  n = parseInt(n, 10);
  if (!(n >= 11 && n <= 48) || dentHas(n)) return false;
  var s = dentBareState(n);
  if (s.standing) return true;
  var sm = teethMap[String(n)] || {};
  return !s.ok && !s.implant && !isBridgeKey(sm.PONTIC) && isBridgeKey(sm.WHOLE)
    && !(typeof chartPonticSet !== 'undefined' && chartPonticSet && chartPonticSet[n]);
}
function dentClaspParse(v) {
  var out = [];
  String(v === null || v === undefined ? '' : v).split(',').forEach(function (x) { var t = parseInt(x, 10); if (t >= 11 && t <= 48 && out.indexOf(t) === -1) out.push(t); });
  return out;
}
/* الاقتراحُ: كلُّ سنٍّ قائم ملاصقٍ لسرج (الحرُّ ⇒ الإنسيُّ وحده؛ المحصورُ ⇒ الطرفان)، وبكل جهةٍ من الفك الأبعدُ خلفاً والأبعدُ أماماً
   فقط ⇒ أربعٌ على الأكثر (رباعي). */
function dentClaspAuto(u) {
  if (!u || !dentIsPartialUnit(u)) return [];
  var row = dentArchRow(u.arch), cand = [], out = [], half = row.length / 2;
  u.teeth.forEach(function (t) {
    var i = row.indexOf(t); if (i < 0) return;
    [row[i - 1], row[i + 1]].forEach(function (nb) {
      if (nb !== undefined && u.teeth.indexOf(nb) === -1 && cand.indexOf(nb) === -1 && dentClaspOk(nb)) cand.push(nb);
    });
  });
  [true, false].forEach(function (first) {
    var c = cand.filter(function (t) { return (row.indexOf(t) < half) === first; }).sort(function (a, b) { return row.indexOf(a) - row.indexOf(b); });
    if (c.length > DENT_CLASP_MAX / 2) c = [c[0], c[c.length - 1]];
    out = out.concat(c);
  });
  return dentSortTeeth(out, u.arch);
}
/* ضمّاتُ الوحدة المرسومة: قائمةُ الطبيب إن وُجدت وإلا الاقتراح — ودائماً ما زال سنُّها يحمل ضمّة (سنٌّ قُلع لاحقاً يسقط من الرسم) */
function dentClasps(u) {
  if (!u || !dentIsPartialUnit(u)) return [];
  var list = (u.clasps !== null && u.clasps !== undefined) ? dentClaspParse(u.clasps) : dentClaspAuto(u);
  return dentSortTeeth(list.filter(function (t) { return dentArchOf(t) === u.arch && u.teeth.indexOf(t) === -1 && dentClaspOk(t); }), u.arch);
}
function dentClaspIsAuto(u) { return !u || u.clasps === null || u.clasps === undefined; }
/* حفظُ قائمة الطبيب (مصفوفة) أو العودةُ للاقتراح (null): تحديثٌ واحد لكل صفوف الوحدة. يعيد true عند النجاح */
async function dentClaspSave(u, list) {
  if (!u || !u.teeth || !u.teeth.length) return false;
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return false;   /* وضعُ القراءة: لا كتابة */
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return false; }
  var val = (list === null) ? null : dentTeethCsv(list.filter(function (t) { return dentArchOf(t) === u.arch && u.teeth.indexOf(parseInt(t, 10)) === -1; }));
  var r = await window.sb.from('teeth_status').update({ denture_clasps: val })
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId).eq('surface', DENT_SURFACE)
    .in('tooth_num', u.teeth.map(String));
  if (r && r.error) { console.error('dentClaspSave:', r.error); showToast('❌ تعذّر حفظ الضمّات: ' + (r.error.message || 'خطأ بالاتصال')); return false; }
  u.teeth.forEach(function (t) { if (dentureMap[String(t)]) dentureMap[String(t)].clasps = val; });
  if (typeof renderTeeth === 'function') renderTeeth();
  return true;
}
/* نقرةُ سنٍّ بنافذة الجهاز: تضيف ضمّةً أو تلغيها — من القائمة المرسومة الآن (اقتراحاً كانت أو قائمةَ الطبيب) */
async function dentClaspToggle(u, n) {
  n = parseInt(n, 10);
  if (!u || !dentIsPartialUnit(u)) return false;
  var cur = dentClasps(u), i = cur.indexOf(n);
  if (i === -1) { if (!dentClaspOk(n) || dentArchOf(n) !== u.arch) return false; cur.push(n); } else cur.splice(i, 1);
  return await dentClaspSave(u, cur);
}

/* v741 — خدمةُ «إضافة أو إصلاح ضمة» تسمّي سنَّها (المالك 17/11/2026: «ضفت ضمّة بس ما قدرت حدّد على أي سن»). بلا عمودٍ جديد: السنُّ
   يُكتب بوصف الجلسة بصيغةٍ واحدة مغلقة، ويُقرأ منها بمطابقةٍ صارمة (مفتاحُ الخدمة + ربطُ الجهاز + اسمُ الفك نفسه) — وصفٌ عُدّل باليد
   لا يطابق فتعود الجلسةُ جلسةَ فكٍّ عادية. */
var DENT_CLASP_SVC_KEY = 'denture-clasp';
function dentClaspPhrase(teeth) {
  var nums = teeth.map(function (t) { return parseInt(t, 10); }).sort(function (x, y) { return x - y; });
  return (nums.length === 1 ? 'ضمّة على السن ' : 'ضمّات على الأسنان ') + nums.join('، ');
}
function dentSessClasp(s) {
  if (!s || s.tooth_num || !s.denture_unit || s.treatment_key !== DENT_CLASP_SVC_KEY || (s.arch !== 'U' && s.arch !== 'L')) return [];
  var m = String(s.description || '').match(/^(.+) — (?:ضمّة على السن (\d\d)|ضمّات على الأسنان (\d\d(?:، \d\d)+))$/);
  if (!m || m[1] !== dentArchLabel(s.arch)) return [];
  var teeth = String(m[2] || m[3]).split('، ').map(function (t) { return parseInt(t, 10); });
  return teeth.every(function (t) { return t >= 11 && t <= 48 && dentArchOf(t) === s.arch; }) ? teeth : [];
}

/* ── ج2-ب: جلسةُ الجهاز وأسنانُها (unit_teeth — M204) ── */
function dentTeethCsv(teeth) {
  return teeth.map(function (t) { return parseInt(t, 10); }).sort(function (a, b) { return a - b; }).join(',');
}
function dentSessTeeth(s) {
  if (!s || !s.unit_teeth) return [];
  return String(s.unit_teeth).split(',').map(function (t) { return parseInt(t, 10); }).filter(function (t) { return t >= 11 && t <= 48; });
}
/* ج2-ج: موضعُ جلسة الجهاز كما يُقرأ بكل قائمة («الفك العلوي — الأسنان 14، 15» · «الفك السفلي — كامل») — من أسنانها (M204)، لا من
   وصفها الحرّ. فارغٌ لأي جلسةٍ ليست جلسةَ جهاز، فيبقى نصُّ المستدعي كما كان (جلسةُ فكٍّ عادية = اسمُ الفك وحده). */
function dentSessWhere(s) {
  /* ج4-أ (M208): «إضافة سن» لجهازٍ قائم — موضعُها أسنانُها المضافة (denture_add)، بالصيغة نفسها */
  if (s && !s.tooth_num && s.denture_add && (s.arch === 'U' || s.arch === 'L')) {
    var at = String(s.denture_add).split(',').map(function (t) { return parseInt(t, 10); }).filter(function (t) { return t >= 11 && t <= 48; });
    if (at.length) return dentAreaText(s.arch, at);
  }
  /* v741: خدمةُ الضمّة — موضعُها سنُّ الضمّة («الفك العلوي — ضمّة على السن 13») */
  var ct = dentSessClasp(s);
  if (ct.length) return dentArchLabel(s.arch) + ' — ' + dentClaspPhrase(ct);
  if (!s || s.tooth_num || !s.unit_teeth || (s.arch !== 'U' && s.arch !== 'L')) return '';
  var teeth = dentSessTeeth(s);
  return teeth.length ? dentAreaText(s.arch, teeth) : '';
}
/* سطرُ الأجهزة بطباعة المخطط (الشريطُ فوق المخطط لا يُطبع) — نصٌّ مهرَّب جاهز، أو فارغ */
function dentPrintLine() {
  return dentUnits().map(function (u) {
    var st = (u.st && u.st !== 'completed') ? ' (' + ((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[u.st]) || u.st) + ')' : '';
    return escapeHtml(dentUnitName(u) + ' — ' + dentAreaText(u.arch, u.teeth) + st + (dentOpenExtractions(u.teeth).length ? ' · فوري' : '') + dentOptBadgeText(dentSessionOfUnit(u)));
  }).join(' &nbsp;•&nbsp; ');
}
function dentSessKey(s) { return (typeof sessionTreatmentKey === 'function') ? sessionTreatmentKey(s) : (s ? s.treatment_key : null); }
function dentIsSession(s) { return !!s && !s.tooth_num && !!s.unit_teeth && dentIsKey(dentSessKey(s)); }
function dentSessDrawn(s) {
  for (var tn in dentureMap) { if (dentureMap[tn] && dentureMap[tn].unit === s.id) return true; }
  return false;
}
/* جلساتُ أجهزةٍ مخطّطة بلا صفوفٍ على المخطط (أسنانُها يعوّضها جهازٌ آخر) — بترتيب الإنشاء */
function dentPendingSessions() {
  if (typeof sessions === 'undefined' || !sessions) return [];
  return sessions.filter(function (s) { return s && (s.status || 'completed') === 'planned' && dentIsSession(s) && !dentSessDrawn(s); })
    .sort(function (a, b) { var x = String(a.created_at || '\uffff'), y = String(b.created_at || '\uffff'); return x < y ? -1 : (x > y ? 1 : 0); });
}
/* الوحداتُ المرسومة التي تعوّض شيئاً من هذه الأسنان */
function dentOverlapUnits(teeth) {
  var set = {}; teeth.forEach(function (t) { set[parseInt(t, 10)] = 1; });
  return dentUnits().filter(function (u) { return u.teeth.some(function (t) { return set[t]; }); });
}
/* «بديل» إن كان المرسومُ فوق أسنانها مخطّطاً، و«تبديل» إن كان قائماً/منجزاً */
function dentPendingKind(s) {
  var ov = dentOverlapUnits(dentSessTeeth(s));
  return ov.some(function (u) { return u.st === 'planned'; }) ? 'alt' : 'replace';
}
function dentOptBadgeText(s) {
  var o = (typeof planOptOf === 'function') ? planOptOf(s) : null;
  return o ? ' [خيار ' + PLAN_OPTION_LABELS[o] + ']' : '';
}

/* ── حالةُ السن أمام الجهاز: هل يقبل أن يُعوَّض؟ ── */
/* ج2-ب: سنٌّ يعوّضه جهازٌ مسجّل يقبل جهازاً ثانياً (بديلاً أو تبديلاً) — حالتُه تُحسب كما لو لم يكن الجهازُ عليه وتُوسَم over.
   الفحصُ الأولي يسجّل القائمَ وحده ⇒ يبقى فيه مانعاً. */
function dentToothState(n) {
  var over = dentHas(n);
  if (over && pendingDenture && pendingDenture.exam) return { ok: false, block: true, why: 'عليه جهاز متحرك مسجّل' };
  var s = dentBareState(n);
  /* ج2-ج: الفحصُ الأولي و«فك أدرد» يسجّلان واقعاً — سنٌّ قلعُه مخطّط ما زال بالفم، فلا يدخل جهازاً قائماً ولا يُعلَّم مفقوداً */
  if (s.imm && pendingDenture && pendingDenture.exam) return { ok: false, block: true, why: 'قلعه مخطّط — أنجز القلع أولاً' };
  if (over) { s.over = true; if (s.ok) s.why = 'عليه جهاز مسجّل — الجديد بديل أو تبديل'; }
  return s;
}
function dentBareState(n) {
  var sm = teethMap[String(n)] || {};
  /* ج2-أ: الزرعةُ المخطّطة خطةٌ لا واقع ⇒ الجهازُ يُسجَّل بديلاً عنها؛ والمنجزةُ تحمل الكاملَ فوقها (dentFullCheck) ولا يعوّضها الجزئي */
  if (typeof isImplant === 'function' && isImplant(n)) {
    var plannedImp = (typeof implantRowsAllPlanned === 'function') ? implantRowsAllPlanned(n) : (((sm.__status || {}).WHOLE) === 'planned');
    return plannedImp ? { ok: true, alt: true, implant: true, why: 'زرعة مخطّطة — الجهاز فوقها أو بديل عنها' } : { ok: false, block: true, implant: true, why: 'مزروع' };
  }
  if (isBridgeKey(sm.PONTIC)) {
    return (((sm.__status || {}).PONTIC) === 'planned') ? { ok: true, alt: true, why: 'دمية جسر مخطّط — الجهاز بديل' } : { ok: false, block: true, why: 'ضمن جسر' };
  }
  if (isBridgeKey(sm.WHOLE)) return { ok: false, block: true, why: 'ضمن جسر' };
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(n)) return { ok: false, block: true, why: 'عليه حافظ مسافة' };
  /* ج2-ج: الجهازُ الفوري يُخطَّط مع القلع ويُسلَّم يومَه ⇒ السنُّ الذي قلعُه مخطّط يقبل جهازاً **مخطّطاً** (dentSave يرفض غيرَه) */
  if (typeof isExtractionPlanned === 'function' && isExtractionPlanned(n)) return { ok: true, imm: true, why: 'قلعه مخطّط — جهاز فوري (يُسجَّل مخطّطاً)' };
  if (typeof isExtractionDone === 'function' && isExtractionDone(n)) return { ok: true, missing: true, why: 'مفقود' };
  return { ok: false, standing: true, why: 'سن قائم — سجّل قلعه أولاً' };
}
/* فحصُ فكٍّ للجهاز الكامل: موانعُ (جسر/جهاز/قلعٌ مخطّط…) + الأسنانُ القائمة التي تُعلَّم مفقودة.
   ج2-أ: الزرعةُ المنجزة ليست مانعاً (جهازٌ فوق الزرعات) · والمخطّطُ (زرعة/دمية جسر) يُسجَّل الجهازُ بديلاً عنه */
function dentFullCheck(arch) {
  var blockers = [], standing = [], implants = [], alts = [], overs = [], imms = [];
  DENT_FULL_TEETH[arch].forEach(function (t) {
    var s = dentToothState(t);
    if (s.over) overs.push(t);
    if (s.block && s.implant) implants.push(t);
    else if (s.block) blockers.push({ t: t, why: s.why });
    else if (s.standing) standing.push(t);
    else if (s.alt) alts.push(t);
    else if (s.imm) imms.push(t);
  });
  return { blockers: blockers, standing: standing, implants: implants, alts: alts, overs: overs, imms: imms };
}
/* «جهاز متحرك كامل» أو «جهاز أ وجهاز ب» — أسماءُ الأجهزة المرسومة فوق هذه الأسنان */
function dentOverNames(teeth) {
  return dentOverlapUnits(teeth).map(function (u) { return '«' + dentUnitName(u) + '»'; }).join(' و');
}

/* ═════════════════════ المنتقي (داخل نافذة «اختر المنطقة» القائمة) ═════════════════════ */
function dentPickerActive() { return !!(pendingDenture && pendingDenture.picking); }
function dentClearPending() { pendingDenture = null; }
/* تُستدعى من openRegionalAreaPicker: مسارُ المنطقة العادي يستعيد نافذتَه نظيفة */
function dentPickerReset() {
  pendingDenture = null;
  dentPickerUi(false);
}
/* النافذةُ مشتركة مع «اختر المنطقة»: المنتقي يوسّعها لشبكة الأسنان (sm ← md) ويعيدها كما كانت */
function dentPickerUi(on) {
  var box = document.getElementById('dentPickBox'); if (box) box.style.display = on ? '' : 'none';
  var ov = document.getElementById('regionalAreaModal');
  if (ov) {
    ov.classList.toggle('dent-pick', !!on);
    ov.classList.toggle('sy-m-md', !!on);
    ov.classList.toggle('sy-m-sm', !on);
  }
}
function dentOpenPicker(key, label, ctx) {
  var tr = getTreatment(key);
  if (!dentIsTreatment(tr)) return false;
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return true;   /* وضعُ القراءة: لا تسجيل */
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return true; }
  var kind = tr.target_part === 'denture_full' ? 'full' : 'partial';
  pendingDenture = { key: key, label: label || tr.name, kind: kind, exam: !!(ctx && ctx.exam), picking: true, arches: [], arch: null, teeth: [], units: [] };
  var fromArch = (ctx && (ctx.arch === 'U' || ctx.arch === 'L')) ? ctx.arch : null;   /* المدخلُ من نافذة سن: فكُّ ذلك السن */
  if (kind === 'partial') {
    /* الفكُّ الافتراضي: فكُّ السن المنقور، وإلا الذي فيه مفقودٌ يقبل التعويض (العلوي أولاً)؛ والمفقودُ محدَّدٌ مسبقاً عدا أرحاء العقل */
    var pick = fromArch;
    ['U', 'L'].forEach(function (a) { if (!pick && dentSelectable(a).length) pick = a; });
    pendingDenture.arch = pick || 'U';
    pendingDenture.teeth = dentDefaultTeeth(pendingDenture.arch);
  } else if (fromArch) pendingDenture.arches = [fromArch];
  var sel = document.getElementById('regionalAreaSelect'); if (sel) sel.style.display = 'none';
  var chips = document.getElementById('regionalQuadChips'); if (chips) chips.style.display = 'flex';
  dentPickerUi(true);
  var ov = document.getElementById('regionalAreaModal');
  var ti = document.getElementById('regionalAreaTitle'); if (ti) ti.textContent = pendingDenture.label;
  var hi = document.getElementById('regionalAreaHint');
  if (hi) hi.textContent = kind === 'full'
    ? 'اختر الفك — الجهاز الكامل يعوّض أسنان الفك من 7 إلى 7'
    : 'اختر الفك ثم الأسنان التي يعوّضها الجهاز — المفقود محدَّد مسبقاً';
  dentPickerRender();
  if (ov) ov.classList.add('open');
  return true;
}
function dentSelectable(arch) {
  return dentArchRow(arch).filter(function (t) { return dentToothState(t).ok; });
}
/* ج2-أ: السنُّ الذي عليه زرعةٌ أو دميةُ جسرٍ مخطّطة يقبل الجهاز ولا يُحدَّد مسبقاً — إضافتُه قرارٌ صريح (الجهازُ بديلٌ عن الخطة) */
function dentDefaultTeeth(arch) {
  return dentSelectable(arch).filter(function (t) { var s = dentToothState(t); return (t % 10) !== 8 && !s.alt && !s.over && !s.imm; });
}
/* ج2-ج: أسنانٌ قلعُها مخطّط — تدخل الجهاز بنقرةٍ صريحة (الجهازُ يصير فورياً) */
function dentImmTeeth(arch) {
  return dentSelectable(arch).filter(function (t) { var s = dentToothState(t); return !!s.imm && !s.over; });
}
function dentImmPhrase(teeth) {
  var s = teeth.slice().sort(function (a, b) { return a - b; });
  return (s.length === 1 ? 'السن ' + s[0] + ' قلعه' : 'الأسنان ' + s.join('، ') + ' قلعها') + ' مخطّط';
}
/* أسنانُ هذه القائمة التي قلعُها ما زال مخطّطاً (الحالةُ الحيّة، لا لقطةُ المنتقي) */
function dentOpenExtractions(teeth) {
  return (teeth || []).filter(function (t) { return typeof isExtractionPlanned === 'function' && isExtractionPlanned(t); })
    .map(function (t) { return parseInt(t, 10); }).sort(function (a, b) { return a - b; });
}
function dentTeethPhrase(teeth) { return teeth.length === 1 ? 'السن ' + teeth[0] : 'الأسنان ' + teeth.join('، '); }
function dentAltTeeth(arch) {
  return dentSelectable(arch).filter(function (t) { var s = dentToothState(t); return !!s.alt && !s.over; });
}
function dentOverTeeth(arch) {
  return dentSelectable(arch).filter(function (t) { return !!dentToothState(t).over; });
}
/* «السن 36 عليه…» · «الأسنان 33، 36 عليها…» — ترقيمٌ تصاعدي كنصّ الموضع */
function dentAltPhrase(teeth) {
  var s = teeth.slice().sort(function (a, b) { return a - b; });
  return (s.length === 1 ? 'السن ' + s[0] + ' عليه' : 'الأسنان ' + s.join('، ') + ' عليها') + ' زرعة أو جسر مخطّط';
}
function dentOverPhrase(teeth) {
  var s = teeth.slice().sort(function (a, b) { return a - b; });
  return (s.length === 1 ? 'السن ' + s[0] + ' عليه' : 'الأسنان ' + s.join('، ') + ' عليها') + ' جهاز مسجّل';
}
function dentPickerRender() {
  var pd = pendingDenture; if (!pd) return;
  var chips = document.getElementById('regionalQuadChips');
  var on = 'border:1.5px solid var(--green);color:var(--on-accent,#fff);background:var(--green);font-weight:700;';
  var off = 'border:1.5px solid var(--border2);color:var(--text2);background:var(--bg2);';
  var base = 'padding:8px 12px;border-radius:var(--r-md,10px);font-size:13.5px;font-family:inherit;cursor:pointer;';
  if (chips) {
    var h = '';
    ['U', 'L'].forEach(function (a) {
      var sel = pd.kind === 'partial' ? pd.arch === a : pd.arches.indexOf(a) !== -1;
      h += '<button type="button" data-dent-arch="' + a + '" onclick="dentArchToggle(\'' + a + '\')" style="' + base + (sel ? on : off) + '">' + dentArchLabel(a) + '</button>';
    });
    if (pd.kind !== 'partial') {
      h += '<button type="button" data-dent-arch="both" onclick="dentArchBoth()" style="' + base + 'border:1.5px dashed var(--border2);color:var(--text2);background:transparent;">'
        + (pd.arches.length === 2 ? 'إلغاء الكل' : 'الفكان معاً') + '</button>';
    }
    chips.innerHTML = h;   /* ثوابتُ داخلية فقط */
  }
  var grid = document.getElementById('dentTeethGrid'), note = document.getElementById('dentPickNote');
  if (grid) {
    if (pd.kind === 'partial') {
      var row = dentArchRow(pd.arch), g = '<div class="nse-row dent-row">';
      for (var i = 0; i < row.length; i++) {
        if (i === row.length / 2) g += '<span class="nse-mid"></span>';
        var t = row[i], s = dentToothState(t), isOn = pd.teeth.indexOf(t) !== -1;
        g += '<button type="button" class="nse-t dent-t' + (s.ok ? (isOn ? ' dent-on' : ' dent-miss' + ((s.alt || s.over || s.imm) ? ' dent-alt' : '')) : ' dent-off') + '" data-dent-tooth="' + t + '" title="' + escapeHtml(s.why || '') + '"'
          + (s.ok ? ' onclick="dentToothToggle(' + t + ')"' : ' aria-disabled="true" onclick="dentToothWhy(' + t + ')"') + '>' + t + '</button>';
      }
      grid.innerHTML = g + '</div>';
      grid.style.display = '';
    } else { grid.innerHTML = ''; grid.style.display = 'none'; }
  }
  if (note) {
    var lines = [];
    if (pd.kind === 'partial') {
      if (!dentSelectable(pd.arch).length) lines.push('<div class="dent-note-warn">لا أسنان مفقودة بهذا الفك تقبل التعويض — سجّل القلع على المخطط أولاً.</div>');
      else lines.push('<div>المحدَّد: <b>' + (pd.teeth.length ? dentTeethWord(pd.teeth.length) : 'لا شيء') + '</b> — انقر السن لإضافته أو استبعاده. الباهتُ لا يقبل التعويض (انقره لمعرفة السبب).</div>');
      var altT = dentAltTeeth(pd.arch);
      if (altT.length) lines.push('<div class="dent-note-alt">' + dentAltPhrase(altT) + ' — ' + (altT.length === 1 ? 'انقره ليدخل' : 'انقرها لتدخل') + ' بالجهاز.</div>');
      var imT = dentImmTeeth(pd.arch);
      if (imT.length) lines.push('<div class="dent-note-alt">' + dentImmPhrase(imT) + ' — ' + (imT.length === 1 ? 'انقره ليدخل' : 'انقرها لتدخل') + ' بالجهاز (جهاز فوري: يُسجَّل مخطّطاً ويُرسم سنُّه بعد القلع).</div>');
      var ovT = dentOverTeeth(pd.arch);
      if (ovT.length) lines.push('<div class="dent-note-alt">' + dentOverPhrase(ovT) + ' — ' + (ovT.length === 1 ? 'انقره' : 'انقرها') + ' ليُسجَّل الجديد بديلاً عنه (مخطّط) أو تبديلاً له.</div>');
    } else if (pd.kind === 'edent') {
      if (!pd.arches.length) lines.push('<div>اختر فكاً واحداً على الأقل.</div>');
      pd.arches.forEach(function (a) {
        var e = dentEdentCheck(a);
        var keep = e.skip.length ? ' يبقى كما هو: ' + e.skip.map(function (b) { return b.t + ' (' + escapeHtml(b.why) + ')'; }).join('، ') + '.' : '';
        if (e.mark.length) lines.push('<div><b>' + dentArchLabel(a) + ':</b> الأسنان القائمة (' + e.mark.length + ') تُعلَّم مفقودة: ' + e.mark.join('، ') + '.' + keep + '</div>');
        else lines.push('<div><b>' + dentArchLabel(a) + ':</b> لا أسنان قائمة تُعلَّم' + (e.skip.length ? ' —' + keep : ' — كلُّ أسنانه مفقودة ✓') + '</div>');
      });
    } else {
      if (!pd.arches.length) lines.push('<div>اختر فكاً واحداً على الأقل.</div>');
      pd.arches.forEach(function (a) {
        var c = dentFullCheck(a);
        if (c.blockers.length) {
          lines.push('<div class="dent-note-warn"><b>' + dentArchLabel(a) + ':</b> لا يقبل جهازاً كاملاً — '
            + c.blockers.map(function (b) { return b.t + ' (' + escapeHtml(b.why) + ')'; }).join('، ') + '. سجّله جهازاً جزئياً على الأسنان المفقودة.</div>');
        } else {
          if (c.standing.length) {
            lines.push('<div><b>' + dentArchLabel(a) + ':</b> أسنان قائمة بالمخطط (' + c.standing.length + '): '
              + c.standing.join('، ') + ' — يُسأل عن تعليمها «مفقودة مسبقاً» عند المتابعة.</div>');
          } else if (!c.implants.length && !c.alts.length && !c.overs.length && !c.imms.length) lines.push('<div><b>' + dentArchLabel(a) + ':</b> كلُّ أسنانه مفقودة ✓</div>');
          if (c.implants.length) lines.push('<div class="dent-note-alt"><b>' + dentArchLabel(a) + ':</b> جهاز فوق الزرعات — ' + (c.implants.length === 1 ? 'الزرعة ' : 'الزرعات ') + c.implants.join('، ') + ' تبقى كما هي تحت الجهاز.</div>');
          if (c.alts.length) lines.push('<div class="dent-note-alt"><b>' + dentArchLabel(a) + ':</b> ' + dentAltPhrase(c.alts) + ' — تدخل بالجهاز وخطتها تبقى.</div>');
          if (c.imms.length) lines.push('<div class="dent-note-alt"><b>' + dentArchLabel(a) + ':</b> ' + dentImmPhrase(c.imms) + ' — جهاز فوري: يُسجَّل مخطّطاً ويُرسم سنُّه بعد القلع.</div>');
          if (c.overs.length) lines.push('<div class="dent-note-alt"><b>' + dentArchLabel(a) + ':</b> عليه ' + escapeHtml(dentOverNames(c.overs)) + ' — الجديد يُسجَّل بديلاً عنه (مخطّط) أو تبديلاً له.</div>');
        }
      });
    }
    note.innerHTML = lines.join('');
  }
}
function dentArchToggle(a) {
  var pd = pendingDenture; if (!pd) return;
  if (pd.kind !== 'partial') {
    var i = pd.arches.indexOf(a);
    if (i === -1) pd.arches.push(a); else pd.arches.splice(i, 1);
    pd.arches.sort(function (x, y) { return x === 'U' ? -1 : (y === 'U' ? 1 : 0); });
  } else if (pd.arch !== a) {
    pd.arch = a; pd.teeth = dentDefaultTeeth(a);
  }
  dentPickerRender();
}
function dentArchBoth() {
  var pd = pendingDenture; if (!pd || pd.kind === 'partial') return;
  pd.arches = (pd.arches.length === 2) ? [] : ['U', 'L'];
  dentPickerRender();
}
function dentToothToggle(t) {
  var pd = pendingDenture; if (!pd || pd.kind !== 'partial') return;
  if (!dentToothState(t).ok) return;
  var i = pd.teeth.indexOf(t);
  if (i === -1) pd.teeth.push(t); else pd.teeth.splice(i, 1);
  dentPickerRender();
}
function dentToothWhy(t) { var s = dentToothState(t); showToast('🦷 السن ' + t + ': ' + (s.why || 'لا يقبل التعويض')); }

/* ── «تراجع» بالفحص الأولي (v711): لقطةُ الأسنان قبل تعليمها مفقودة ثم استعادتُها كما كانت ── */
/* صفوفُ teeth_status الكاملة لهذه الأسنان (عدا صفَّ الجهاز) — null عند فشل القراءة */
async function dentSnapshotTeeth(teeth) {
  if (!teeth.length) return [];
  var r = await window.sb.from('teeth_status').select('*')
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .in('tooth_num', teeth.map(String)).neq('surface', DENT_SURFACE);
  if (!r || r.error) { console.warn('dentSnapshotTeeth:', r && r.error); return null; }
  return r.data || [];
}
/* الأسنانُ تعود بصفوفها الملتقطة: ما عليها الآن يُمحى (عدا صفَّ الجهاز) ثم تُدرَج اللقطة — والذاكرةُ من المصدر الواحد ppIngestToothRow */
async function dentRestoreTeeth(teeth, rows) {
  if (!teeth.length) return '';
  var tns = teeth.map(String);
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .in('tooth_num', tns).neq('surface', 'DENTURE');
  if (d && d.error) return d.error.message || 'تعذّر المحو';
  if (rows && rows.length) {
    var i = await window.sb.from('teeth_status').insert(rows);
    if (i && i.error) return i.error.message || 'تعذّرت الاستعادة';
  }
  tns.forEach(function (tn) { delete teethMap[tn]; if (window.teethDx) delete window.teethDx[tn]; });
  (rows || []).forEach(function (t) {
    if (typeof ppIngestToothRow === 'function') { ppIngestToothRow(t); return; }
    var n = String(t.tooth_num), s = t.surface || 'O';   /* احتياط: الصفحةُ بلا المحمّل المشترك */
    if (!teethMap[n]) teethMap[n] = {};
    teethMap[n][s] = t.treatment_key;
    if (!teethMap[n].__status) teethMap[n].__status = {};
    teethMap[n].__status[s] = t.status || 'completed';
  });
  return '';
}
/* مدخلُ examUndo: {type:'denture', unit, marked, rows} أو {type:'edent', marked, rows} ⇒ '' أو رسالةُ الخطأ */
async function dentExamUndo(a) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return 'وضع القراءة';
  if (a.type === 'denture' && a.unit) {
    var d = await window.sb.from('teeth_status').delete()
      .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
      .eq('unit_id', a.unit).eq('surface', DENT_SURFACE);
    if (d && d.error) return d.error.message || 'تعذّر حذف صفوف الجهاز';
    Object.keys(dentureMap).forEach(function (tn) { if (dentureMap[tn].unit === a.unit) delete dentureMap[tn]; });
  }
  var rErr = await dentRestoreTeeth(a.marked || [], a.rows || []);
  if (!rErr && a.type === 'denture') { try { await dentSettlePending(); } catch (eS) { console.warn('settle after undo skipped:', eS); } }
  return rErr;
}

/* ── «فك أدرد» (شريط الفحص الأولي): أسنانُ الفك القائمة تُعلَّم مفقودةً بكبسة — بلا جهاز، بلا جلسة ── */
/* أسنانُ الفك الستة عشر: القائمُ يُعلَّم · المفقودُ أصلاً لا يُمسّ · الزرعةُ والجسرُ والقلعُ المخطّط تبقى كما هي وتُذكر */
function dentEdentCheck(arch) {
  var mark = [], skip = [];
  dentArchRow(arch).forEach(function (t) {
    if (typeof isExtractionDone === 'function' && isExtractionDone(t)) return;
    var s = dentToothState(t);
    if (s.standing) mark.push(t); else if (s.block) skip.push({ t: t, why: s.why });
  });
  return { mark: mark, skip: skip };
}
/* تعليمُ السن مفقوداً يمحو علاجاتِه المرسومة (v608) — يُقال صراحةً حين يوجد منها شيء */
function dentChartedNote(teeth) {
  var n = teeth.filter(function (t) {
    var sm = teethMap[String(t)] || {};
    return Object.keys(sm).some(function (k) { return k.indexOf('__') !== 0; });
  });
  return n.length ? '\n\n⚠️ على ' + (n.length === 1 ? 'السن ' : 'الأسنان ') + n.join('، ') + ' علاجاتٌ مرسومة تُزال عن المخطط (جلساتُها تبقى بالسجل).' : '';
}
function dentOpenEdentulous() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }
  pendingDenture = { key: null, label: 'فك أدرد', kind: 'edent', exam: true, picking: true, arches: [], arch: null, teeth: [], units: [] };
  var sel = document.getElementById('regionalAreaSelect'); if (sel) sel.style.display = 'none';
  var chips = document.getElementById('regionalQuadChips'); if (chips) chips.style.display = 'flex';
  dentPickerUi(true);
  var ti = document.getElementById('regionalAreaTitle'); if (ti) ti.textContent = '🦷 فك أدرد';
  var hi = document.getElementById('regionalAreaHint');
  if (hi) hi.textContent = 'اختر الفك — أسنانه القائمة تُعلَّم «مفقودة» بكبسة واحدة (بلا جلسة ولا تكلفة)';
  dentPickerRender();
  var ov = document.getElementById('regionalAreaModal'); if (ov) ov.classList.add('open');
}
async function dentConfirmEdent(pd) {
  if (!pd.arches.length) { showToast('⚠️ اختر فكاً واحداً على الأقل'); return; }
  var mark = [];
  pd.arches.forEach(function (a) { mark = mark.concat(dentEdentCheck(a).mark); });
  if (!mark.length) { showToast('🦷 لا أسنان قائمة تُعلَّم بالفك المختار'); return; }
  var names = pd.arches.map(dentArchLabel).join(' و');
  var charted = dentChartedNote(mark);
  if (!await SyDialog.confirm({
    title: 'فك أدرد',
    message: names + ' — الأسنان القائمة (' + mark.length + ') تُعلَّم مفقودة:\n' + mark.join('، ')
      + '\n\nبلا جلسة ولا تكلفة. زرُّ «تراجع» بشريط الفحص يعيدها كما كانت.' + charted,
    confirmText: 'علّمها مفقودة', cancelText: 'رجوع', danger: !!charted
  })) return;
  var st = (typeof examStatus !== 'undefined' && examStatus === 'existing_current') ? 'existing_current' : 'existing_other';
  /* اللقطةُ قبل أي محو: بلا لقطةٍ لا تراجع ⇒ لا تعليم */
  var snap = await dentSnapshotTeeth(mark);
  if (!snap) { showToast('⚠️ تعذّر قراءة حالة الأسنان — لم يتغيّر شيء، أعد المحاولة'); return; }
  var err = await dentMarkMissing(mark, pendingProviderId, st);
  pendingDenture = null;
  closeModal('regionalAreaModal'); dentPickerUi(false);
  if (typeof examUndoStack !== 'undefined') examUndoStack.push({ type: 'edent', marked: mark.map(String), rows: snap, count: mark.length });   /* فشلٌ جزئي يُتراجع عنه أيضاً */
  if (!err && typeof examCount !== 'undefined') examCount += mark.length;
  renderTeeth(); renderStats();
  if (typeof examSyncCount === 'function') examSyncCount();
  if (err) { showToast('⚠️ تعذّر تعليم الأسنان مفقودة (' + err + ') — «تراجع» يعيد ما تغيّر'); return; }
  showToast('✓ ' + names + ': عُلّمت الأسنان القائمة مفقودة (' + mark.length + ') — «تراجع» يعيدها');
}

/* «متابعة» بالمنتقي: يبني الوحدات ويتحقّق، ثم الخطوةُ الثانية (أو الحفظُ المباشر بالفحص الأولي) */
async function dentConfirmPick() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var pd = pendingDenture; if (!pd) return;
  if (pd.kind === 'edent') { await dentConfirmEdent(pd); return; }
  var units = [];
  if (pd.kind === 'partial') {
    var teeth = pd.teeth.filter(function (t) { return dentToothState(t).ok; });
    if (!teeth.length) { showToast('⚠️ اختر سناً واحداً على الأقل'); return; }
    units.push({ arch: pd.arch, teeth: dentSortTeeth(teeth, pd.arch), mark: [], over: teeth.filter(dentHas) });
  } else {
    if (!pd.arches.length) { showToast('⚠️ اختر فكاً واحداً على الأقل'); return; }
    var toMark = [];
    for (var i = 0; i < pd.arches.length; i++) {
      var a = pd.arches[i], c = dentFullCheck(a);
      if (c.blockers.length) {
        showToast('⚠️ ' + dentArchLabel(a) + ' لا يقبل جهازاً كاملاً (السن ' + c.blockers[0].t + ': ' + c.blockers[0].why + ') — سجّله جهازاً جزئياً');
        return;
      }
      units.push({ arch: a, teeth: DENT_FULL_TEETH[a].slice(), mark: c.standing.slice(), over: c.overs.slice() });
      toMark = toMark.concat(c.standing);
    }
    if (toMark.length) {
      var ok = await SyDialog.confirm({
        title: 'أسنان قائمة بالمخطط',
        message: 'الجهاز الكامل يُسجَّل على فكٍّ بلا أسنان، وعلى المخطط أسنان قائمة (' + toMark.length + '):\n'
          + toMark.join('، ') + '\n\nإن كانت مفقودةً فعلاً تُعلَّم «مفقودة مسبقاً» عند الحفظ (بلا جلسة ولا تكلفة).\nوإن كانت ستُقلع فارجع وسجّل قلعها أولاً — ولو مخطّطاً (جهاز فوري).'
          + dentChartedNote(toMark),
        confirmText: 'علّمها مفقودة وتابع', cancelText: 'رجوع'
      });
      if (!ok) return;
    }
  }
  pd.units = units; pd.picking = false;
  closeModal('regionalAreaModal');
  dentPickerUi(false);
  if (pd.exam) { await dentSaveExam(); return; }
  dentStep2();
}
/* الخطوةُ الثانية = خطوةُ «علاج الفك» القائمة حرفياً (التكلفة · الحالة · الطبيب · التاريخ · زر المخبر)، بعنوانٍ يسمّي الأسنان */
function dentStep2() {
  var pd = pendingDenture; if (!pd) return;
  pendingToothStatus = pd.key; pendingToothLabel = pd.label;
  pendingRegionalType = 'arch';
  pendingRegionalArches = pd.units.map(function (u) { return u.arch; });
  pendingRegionalArch = pendingRegionalArches[0];
  pendingRegionalQuadrant = null; pendingRegionalQuadrants = [];
  proceedToRegionalStep2(pd.key, pd.label);
  var ti = document.getElementById('toothStep2Title');
  if (ti) ti.textContent = '🦷 ' + pd.label + ' — ' + pd.units.map(function (u) { return dentAreaText(u.arch, u.teeth); }).join(' · ')
    + (pd.units.length > 1 ? ' — جلسة لكل فك بالسعر المدخل' : '');
  /* v724: الجهازُ الفوري لا يُسجَّل إلا مخطّطاً ⇒ الخطوةُ تُفتح على «مخطّط» (كانت تُفتح على «منجز» فيُرفض الحفظُ الأول) */
  if (typeof pickStatus === 'function' && pd.units.some(function (u) { return dentOpenExtractions(u.teeth).length > 0; })) pickStatus('planned');
}

/* ═════════════════════ الحفظ ═════════════════════ */
/* حارسُ المسار: السياقُ صالحٌ فقط إن كانت الخطوةُ الثانية هي خطوةُ هذا الجهاز نفسه — سياقٌ متروك لا يُطلق حفظاً */
function dentSaveReady() {
  var pd = pendingDenture;
  return !!(pd && !pd.picking && !pd.exam && pd.units && pd.units.length
    && pendingRegionalType === 'arch' && pendingToothStatus === pd.key && !currentTooth && !window.__batchMode && !window.__examMode);
}
/* إعادةُ التحقّق لحظةَ الحفظ: المخططُ قد يتغيّر (جهازٌ آخر، جلسةٌ حيّة) بين المنتقي والحفظ */
function dentRevalidate(pd) {
  for (var i = 0; i < pd.units.length; i++) {
    var u = pd.units[i];
    for (var j = 0; j < u.teeth.length; j++) {
      var t = u.teeth[j], s = dentToothState(t);
      if (dentHas(t) && (u.over || []).indexOf(t) === -1) return 'السن ' + t + ': عليه جهاز متحرك مسجّل';   /* ج2-ب: جهازٌ ظهر بعد المنتقي */
      if (s.block && !(pd.kind === 'full' && s.implant)) return 'السن ' + t + ': ' + s.why;   /* ج2-أ: الكاملُ فوق زرعةٍ منجزة ليس مانعاً */
      if (s.standing && u.mark.indexOf(t) === -1) return 'السن ' + t + ' قائم — أعد اختيار الأسنان';
    }
  }
  return '';
}
/* تعليمُ سنٍّ قائم «مفقوداً مسبقاً»: مسارُ القلع القائم نفسه (محوُ صفوف السن وحملُ حالاتها dx على صفّ القلع — v608) */
async function dentMarkMissing(teeth, providerId, status) {
  var st = (status === 'existing_current') ? 'existing_current' : 'existing_other';
  for (var i = 0; i < teeth.length; i++) {
    var tn = String(teeth[i]);
    var row = { doctor_id: currentUser.id, patient_id: patientId, tooth_num: tn, surface: 'WHOLE', treatment_key: 'extracted',
                status: st, provider_id: providerId || null, review_at: null };
    var dx = await wipeToothAfterExtraction(tn, patientId);
    if (dx) row.dx_key = dx;
    var r = await upsertTeethStatusWithFallback(row, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
    if (r && r.error) { console.error('dentMarkMissing:', r.error); return 'السن ' + tn + ': ' + r.error.message; }
    if (!teethMap[tn]) teethMap[tn] = {};
    teethMap[tn].WHOLE = 'extracted';
    if (!teethMap[tn].__status) teethMap[tn].__status = {};
    teethMap[tn].__status.WHOLE = st;
    if (teethMap[tn].__review) delete teethMap[tn].__review.WHOLE;
  }
  return '';
}
/* صفوفُ الجهاز: إدراجٌ لا upsert — صفٌّ قائم على السن (جهازٌ آخر) يُسقط العملية بدل أن يُدهس */
async function dentWriteRows(u, key, status, unitId, providerId) {
  var rows = u.teeth.map(function (t) {
    return { doctor_id: currentUser.id, patient_id: patientId, tooth_num: String(t), surface: DENT_SURFACE,
             treatment_key: key, status: status, provider_id: providerId || null, unit_id: unitId, review_at: null };
  });
  var r = await window.sb.from('teeth_status').insert(rows);
  if (r && r.error) return r.error.message || 'تعذّر حفظ صفوف الجهاز';
  u.teeth.forEach(function (t) { dentureMap[String(t)] = { key: key, st: status, unit: unitId, prov: providerId || null }; });
  return '';
}
/* ج2-ب: تبديلُ الرسم — صفوفُ الوحدات المرسومة فوق هذه الأسنان تُزال ثم تُكتب صفوفُ الجهاز الجديد (الجلساتُ لا تُمسّ).
   v721: لقطةُ الصفوف القديمة تُؤخذ قبل الإزالة؛ فشلُ كتابة الجديد يعيدها كما كانت (كان القديمُ يضيع رسمُه بانقطاع الاتصال بين الخطوتين).
   بلا لقطةٍ لا إزالة. يعيد '' أو رسالةَ الخطأ. */
async function dentSwapRows(unitsToClear, u, key, status, unitId, providerId) {
  var teeth = [];
  (unitsToClear || []).forEach(function (o) { o.teeth.forEach(function (t) { if (teeth.indexOf(String(t)) === -1) teeth.push(String(t)); }); });
  if (!teeth.length) return await dentWriteRows(u, key, status, unitId, providerId);
  var snap = await window.sb.from('teeth_status').select('*')
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('surface', DENT_SURFACE).in('tooth_num', teeth);
  if (!snap || snap.error) return (snap && snap.error && snap.error.message) || 'تعذّرت قراءة رسم الجهاز القديم';
  var oldRows = snap.data || [], oldMap = {};
  teeth.forEach(function (tn) { if (dentureMap[tn]) oldMap[tn] = dentureMap[tn]; });
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('surface', DENT_SURFACE).in('tooth_num', teeth);
  if (d && d.error) return d.error.message || 'تعذّرت إزالة رسم الجهاز القديم';
  teeth.forEach(function (tn) { delete dentureMap[tn]; });
  var wErr = await dentWriteRows(u, key, status, unitId, providerId);
  if (!wErr) return '';
  if (oldRows.length) {
    var back = await window.sb.from('teeth_status').insert(oldRows);
    if (back && back.error) { console.error('denture swap restore failed:', back.error); return wErr + ' — وتعذّرت استعادة رسم الجهاز القديم'; }
  }
  Object.keys(oldMap).forEach(function (tn) { dentureMap[tn] = oldMap[tn]; });
  return wErr;
}
/* «بديل عنها» = true (خياران بالخطة) · «يركب عليها» أو الإغلاق = false (خطةٌ واحدة بلا وسم) */
async function dentAskImplantRival(label, teeth) {
  var s = teeth.slice().sort(function (a, b) { return a - b; });
  return !!(await SyDialog.confirm({
    title: 'الجهاز والزرعة المخطّطة',
    message: (s.length === 1 ? 'على السن ' + s[0] + ' زرعة مخطّطة.' : 'على الأسنان ' + s.join('، ') + ' زرعات مخطّطة.')
      + '\n\n• «يركب عليها»: «' + label + '» والزرعة خطة واحدة (جهاز فوق الزرعات).'
      + '\n• «بديل عنها»: يُسجَّلان خيارين بخطة العلاج (أ/ب)، واعتماد أحدهما يحذف الآخر.',
    confirmText: 'بديل عنها', cancelText: 'يركب عليها'
  }));
}
/* وسمُ الخيارات: كلُّ مجموعةٍ خيارٌ واحد. الموسومُ يحتفظ بوسمه؛ غيرُ الموسوم يأخذ أصغرَ خيارٍ حرّ بترتيب الإنشاء (آليةُ M145-b نفسها) */
async function dentAssignOptions(groups) {
  groups = groups.filter(function (g) { return g && g.length; });
  if (groups.length < 2 || typeof planOptOf !== 'function') return false;
  /* الأقدمُ أولاً بمقارنةٍ حرفية (لا localeCompare: ترتيبُها للرموز يختلف)؛ جلسةٌ بلا created_at = الأحدث */
  var first = function (g) { var m = null; g.forEach(function (x) { var c = x.created_at ? String(x.created_at) : '\uffff'; if (m === null || c < m) m = c; }); return m; };
  groups.sort(function (a, b) { var x = first(a), y = first(b); return x < y ? -1 : (x > y ? 1 : 0); });
  var used = {};
  groups.forEach(function (g) { g.forEach(function (x) { var o = planOptOf(x); if (o) used[o] = true; }); });
  var changed = false;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i], opt = null;
    g.forEach(function (x) { if (!opt) opt = planOptOf(x); });
    if (!opt) { opt = [1, 2, 3].filter(function (o) { return !used[o]; })[0]; if (!opt) continue; used[opt] = true; }
    var todo = g.filter(function (x) { return !planOptOf(x); });
    if (!todo.length) continue;
    var u = await window.sb.from('ledger_sessions').update({ plan_option: opt })
      .in('id', todo.map(function (x) { return x.id; })).eq('doctor_id', currentUser.id);
    if (u && u.error) { console.warn('dentAssignOptions:', u.error); continue; }
    todo.forEach(function (x) { x.plan_option = opt; });
    changed = true;
  }
  return changed;
}
function dentPlannedOf(x) { return !!x && (x.status || 'completed') === 'planned'; }
function dentSessionTouches(x, set) {
  return !!x.tooth_num && String(x.tooth_num).split(',').some(function (t) { return set[parseInt(t, 10)]; });
}
function dentIsImplantSess(x) { var k = dentSessKey(x); return !!k && typeof isImplantKey === 'function' && isImplantKey(k); }
/* جلسةُ زرعةٍ مخطّطة على هذا السن — مرسومةً كانت أو جلسةً وحدها */
function dentHasPlannedImplantSession(t) {
  var tn = String(t);
  return (typeof sessions !== 'undefined' && sessions ? sessions : []).some(function (x) { return dentPlannedOf(x) && String(x.tooth_num || '') === tn && dentIsImplantSess(x); });
}
function dentIsFixedAlt(x) {
  var k = dentSessKey(x);
  return !!k && ((typeof isImplantKey === 'function' && isImplantKey(k)) || isBridgeKey(k));
}
/* جهازٌ مخطّط سُجّل الآن: منافسوه = جلساتُ الزرعة/الجسر المخطّطة على أسنانه (خيارٌ واحد) + كلُّ جهازٍ مخطّط آخر يشاركه سناً */
/* impRival=false ⇒ الزرعاتُ المخطّطة تحت الجهاز ليست منافسةً له (v721)؛ الجسرُ منافسٌ دائماً — الجهازُ لا يركب على دمية */
async function dentTagOptions(dSess, impRival) {
  if (!dentPlannedOf(dSess) || typeof sessions === 'undefined') return false;
  var set = {}; dentSessTeeth(dSess).forEach(function (t) { set[t] = 1; });
  var fixed = sessions.filter(function (x) { return x.id !== dSess.id && dentPlannedOf(x) && dentIsFixedAlt(x) && dentSessionTouches(x, set)
    && (impRival || !dentIsImplantSess(x)); });
  var dents = sessions.filter(function (x) { return x.id !== dSess.id && dentPlannedOf(x) && dentIsSession(x) && dentSessTeeth(x).some(function (t) { return set[t]; }); });
  return await dentAssignOptions([fixed].concat(dents.map(function (d) { return [d]; })).concat([[dSess]]));
}
/* العكس: زرعةٌ/جسرٌ مخطّط سُجّل الآن على أسنانٍ عليها جهازٌ مخطّط ⇒ الجهازُ خيار، والثوابتُ على أسنانه خيارٌ آخر */
async function dentOnFixedSessionSaved(fSess) {
  if (!dentPlannedOf(fSess) || !fSess.tooth_num || !dentIsFixedAlt(fSess) || typeof sessions === 'undefined') return false;
  var mine = {}; String(fSess.tooth_num).split(',').forEach(function (t) { mine[parseInt(t, 10)] = 1; });
  var dents = sessions.filter(function (x) { return dentPlannedOf(x) && dentIsSession(x) && dentSessTeeth(x).some(function (t) { return mine[t]; }); });
  if (!dents.length) return false;
  /* v721: الزرعةُ تحت جهازٍ مخطّط — يُسأل؛ «يركب عليها» ⇒ لا وسم. الجسرُ بديلٌ دائماً */
  if (dentIsImplantSess(fSess) && !(await dentAskImplantRival(dents[0].type || 'الجهاز المتحرك', Object.keys(mine).map(Number)))) return false;
  var all = {}; dents.forEach(function (d) { dentSessTeeth(d).forEach(function (t) { all[t] = 1; }); });
  var fixed = sessions.filter(function (x) { return dentPlannedOf(x) && dentIsFixedAlt(x) && dentSessionTouches(x, all); });
  if (fixed.indexOf(fSess) === -1) fixed.push(fSess);
  return await dentAssignOptions(dents.map(function (d) { return [d]; }).concat([fixed]));
}
/* جلسةٌ معلّقة خلت أسنانُها من أي جهاز (حُذف البديل · أُزيل القديم · اعتُمد خيارُها) ⇒ تُرسم مخطّطة — الأقدمُ أولاً */
async function dentSettlePending() {
  var pend = dentPendingSessions(), drew = false;
  for (var i = 0; i < pend.length; i++) {
    var s = pend[i], teeth = dentSessTeeth(s);
    if (!teeth.length || teeth.some(dentHas)) continue;
    var okAll = teeth.every(function (t) { var st = dentBareState(t); return st.ok || (st.block && st.implant); });
    if (!okAll) continue;
    var err = await dentWriteRows({ teeth: teeth }, dentSessKey(s), 'planned', s.id, s.provider_id || null);
    if (err) { console.warn('dentSettlePending:', err); continue; }
    drew = true;
  }
  return drew;
}
/* إنجازُ جلسةٍ معلّقة: رسمُ المرسوم فوق أسنانها يُزال ويُرسم جهازُها منجزاً (مرآتُه بصفحة المواعيد) */
async function dentDrawCompleted(sess) {
  var teeth = dentSessTeeth(sess); if (!teeth.length) return false;
  var wErr = await dentSwapRows(dentOverlapUnits(teeth), { teeth: teeth }, dentSessKey(sess), 'completed', sess.id, sess.provider_id || null);
  if (wErr) { console.warn('dentDrawCompleted:', wErr); dentMarkDrawFail(sess.id); return false; }   /* v737 */
  return true;
}
async function dentSave(cost, units, date, notes) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var pd = pendingDenture; if (!pd) return;
  var status = pendingTreatStatus, key = pd.key, label = pd.label;
  if (status === 'condition') { showToast('🩺 «مراقبة» لا تُسجَّل لجهازٍ متحرك — اختر منجز أو مخطّط أو موجود مسبقاً'); return; }
  var bad = dentRevalidate(pd);
  if (bad) { showToast('⚠️ تغيّر المخطط — ' + bad); return; }
  var billable = (status === 'completed' || status === 'planned');
  /* ج2-ج: جهازٌ على سنٍّ قلعُه مخطّط = جهازٌ فوري — خطةٌ فقط؛ «منجز/موجود/محوّل» يعني جهازاً بالفم والسنُّ ما زال فيه */
  var immAll = [];
  pd.units.forEach(function (x) { immAll = immAll.concat(dentOpenExtractions(x.teeth)); });
  if (immAll.length && status !== 'planned') {
    showToast('🦷 ' + (immAll.length === 1 ? 'السن ' + immAll[0] + ' قلعه' : 'الأسنان ' + immAll.join('، ') + ' قلعها') + ' مخطّط — الجهاز الفوري يُسجَّل «مخطّط»؛ أنجز القلع أولاً لتسجيله بحالةٍ أخرى');
    return;
  }
  /* ج2-ب: أسنانٌ يعوّضها جهازٌ مرسوم — مخطّط ⇒ جلسةٌ معلّقة (بديل/تبديل) · منجز ⇒ تبديلٌ فوري بتأكيد · غيرُهما مرفوض */
  var ovAll = [];
  pd.units.forEach(function (x) { dentOverlapUnits(x.teeth).forEach(function (o) { if (ovAll.indexOf(o) === -1) ovAll.push(o); }); });
  if (ovAll.length && !billable) { showToast('🦷 على الأسنان ' + dentOverNames(ovAll[0].teeth) + ' — «موجود مسبقاً» و«محوّل» لا يُسجَّلان فوق جهازٍ آخر؛ أزل القديم أولاً'); return; }
  if (ovAll.length && status === 'completed') {
    var plOld = ovAll.filter(function (o) { return o.st === 'planned'; })[0];
    if (plOld) { showToast('🦷 على الأسنان جهاز مخطّط «' + dentUnitName(plOld) + '» — أنجزه أو أزله أولاً، أو سجّل الجديد «مخطّط» ليكون بديلاً'); return; }
    if (!await SyDialog.confirm({
      title: 'تبديل الجهاز',
      message: 'على الأسنان جهاز مسجّل:\n' + ovAll.map(function (o) { return '• «' + dentUnitName(o) + '» (' + dentAreaText(o.arch, o.teeth) + ')'; }).join('\n')
        + '\n\nيُزال رسمه ويُرسم «' + label + '» مكانه. جلسة الجهاز القديم تبقى بالسجل.',
      confirmText: 'بدّل الجهاز', cancelText: 'رجوع', danger: true
    })) return;
  }
  /* v721: زرعةٌ مخطّطة تحت جهازٍ مخطّط — خطةٌ واحدة (الجهازُ يركب عليها) أم بديلان؟ الوسمُ التلقائي كان يفترض البديل دائماً،
     فيوسم «جهاز فوق الزرعات» خيارين ويعرض حذفَ الجهاز عند إنجاز الزرعة. يُسأل مرةً؛ والإغلاقُ/Escape = «يركب عليها» (لا وسم). */
  var impRival = false;
  if (status === 'planned') {
    var impT = [];
    /* v724: والزرعةُ المخطّطة التي لم تُرسم بعد (جلسةٌ وحدها — قلعُ سنّها ما زال مخطّطاً، فالجهازُ فوري) تُسأل عنها كالمرسومة؛
       كان الاتجاهُ المعاكس (زرعةٌ بعد الجهاز) وحده يسأل */
    pd.units.forEach(function (x) { x.teeth.forEach(function (t) { var b = dentBareState(t); if ((b.alt && b.implant) || dentHasPlannedImplantSession(t)) impT.push(t); }); });
    if (impT.length) impRival = await dentAskImplantRival(label, impT);
  }
  var made = [], firstSess = null, failMsg = '', pendingMade = [];
  for (var i = 0; i < pd.units.length; i++) {
    var u = pd.units[i], area = dentAreaText(u.arch, u.teeth);
    var ov = dentOverlapUnits(u.teeth), asPending = (status === 'planned' && ov.length > 0);
    var markNow = u.mark.filter(function (t) { return !!dentToothState(t).standing; });   /* محاولةٌ ثانية بعد فشل: ما عُلِّم لا يُعاد */
    if (markNow.length) {
      var mErr = await dentMarkMissing(markNow, pendingProviderId);
      if (mErr) { failMsg = 'تعذّر تعليم الأسنان مفقودة (' + mErr + ')'; break; }
    }
    var sess = null, unitId;
    if (billable) {
      var payload = {
        doctor_id: currentUser.id, patient_id: patientId,
        type: label, description: area,
        cost: cost, date: date, notes: notes,
        tooth_num: null, surface: null, arch: u.arch,
        status: status, provider_id: pendingProviderId,
        treatment_key: getTreatment(key) ? key : null,
        currency: window.SyDentCurPick.read('toothCost'),
        unit_teeth: dentTeethCsv(u.teeth)   /* M204 */
      };
      var rS = await window.sb.from('ledger_sessions').insert(payload).select().single();
      if (rS.error || !rS.data) { console.error('denture ledger insert error:', rS.error); failMsg = 'تسجيل الجلسة فشل' + (rS.error ? ': ' + rS.error.message : ''); break; }
      sess = rS.data; unitId = sess.id;
    } else unitId = dentUuid();
    var wErr = '';
    if (asPending) pendingMade.push({ sess: sess, kind: ov.some(function (o) { return o.st === 'planned'; }) ? 'alt' : 'replace' });   /* لا صفوف: الأسنانُ يعوّضها المرسوم */
    else wErr = await dentSwapRows(ov, u, key, status, unitId, pendingProviderId);   /* بلا مرسومٍ فوقها = كتابةٌ عادية · وإلا تبديلٌ فوري (منجز فوق قائم) */
    if (wErr) {
      /* الجلسةُ بلا رسمها نصفُ حفظ ⇒ تُسحب، والفشلُ يُعلَن */
      if (sess) {
        var rb = await window.sb.from('ledger_sessions').delete().eq('id', sess.id).eq('doctor_id', currentUser.id);
        if (rb && rb.error) console.error('denture rollback error:', rb.error);
      }
      failMsg = 'تعذّر حفظ الجهاز على المخطط (' + wErr + ')'; break;
    }
    if (sess) {
      if (!firstSess) firstSess = sess;
      sessions.unshift(sess); sortByDateDesc(sessions);
      if (window.logAudit) {
        window.logAudit('session.create', {
          entityId: sess.id, patientId: patientId, patientName: (patient && patient.name) || '',
          description: 'إضافة جلسة (' + area + '): ' + label + ' — ' + cost + ' ' + _rowLbl(sess),
          newValue: { type: label, cost: cost, date: date, status: status, provider_id: pendingProviderId, scope: 'denture', teeth: u.teeth.join(',') }
        });
      }
    }
    made.push({ unit: u, sess: sess, area: area });
    /* ج2-ب: وسمُ البدائل بالخطة — الجهازُ المخطّط مقابل زرعةٍ/جسرٍ/جهازٍ مخطّط على أسنانه (عرضيٌّ بحت) */
    if (sess && status === 'planned') { try { await dentTagOptions(sess, impRival); } catch (eT) { console.warn('denture option tagging skipped:', eT); } }
  }
  if (firstSess) await reallocatePatientFunds();
  if (firstSess) {
    var upd = {};
    if (!patient.last_visit || date > patient.last_visit) upd.last_visit = date;
    if (patient.status === 'جديد') upd.status = 'تحت العلاج';
    if (Object.keys(upd).length) {
      await window.sb.from('patients').update(upd).eq('id', patientId).eq('doctor_id', currentUser.id);
      Object.assign(patient, upd);
    }
  }
  renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();
  var openLab = (typeof _regOpenLabAfterSave !== 'undefined') && _regOpenLabAfterSave === true;
  /* لم يُحفظ شيء ⇒ الخطوةُ وسياقُها يبقيان (إعادةُ المحاولة أو الإلغاء) — الخطوةُ بلا سياقها كانت ستُكمل كحفظ سنّ */
  if (!made.length) { showToast('⚠️ ' + (failMsg || 'لم يُحفظ الجهاز')); return; }
  pendingDenture = null;
  pendingRegionalType = null; pendingRegionalQuadrant = null; pendingRegionalQuadrants = []; pendingRegionalArch = null; pendingRegionalArches = [];
  closeModal('toothModal');
  var areaAll = made.map(function (m) { return m.area; }).join(' · ');
  if (failMsg) { showToast('⚠️ حُفظ ' + areaAll + ' فقط — ' + failMsg); return; }
  if (firstSess && openLab) {
    openLabOrderModal({
      session_id: firstSess.id, treatment_key: key,
      notes: made[0].area + (notes ? ' — ' + notes : ''),
      provider_id: pendingProviderId || null,
      draft: status !== 'completed'
    });
    showToast('✅ تم تسجيل ' + label + ' — ' + areaAll + ' — أكمل بيانات المخبر');
  } else if (!billable) {
    showToast('✅ سُجّل ' + label + ' (' + ((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[status]) || status) + ') — ' + areaAll);
  } else if (pendingMade.length) {
    var pm = pendingMade[0], pmOpt = dentOptBadgeText(pm.sess);
    showToast(pm.kind === 'alt'
      ? '🔀 أُضيف «' + label + '» بديلاً بالخطة' + pmOpt + ' — ' + areaAll + ' (المرسوم يبقى حتى اعتماد أحد الخيارين)'
      : '🔁 أُضيف «' + label + '» مخطّطاً — ' + areaAll + ' (يأخذ مكان الجهاز الحالي على المخطط عند إنجازه)');
  } else {
    showToast('✅ تم تسجيل ' + label + ' — ' + areaAll + (made.length > 1 ? ' (جلسة لكل فك)' : '')
      + (immAll.length ? ' — جهاز فوري: سنُّه يُرسم بعد إنجاز القلع' : ''));
  }
  if (status === 'completed' && firstSess && typeof maybePromptMaterialDeduction === 'function') {
    var matIds = made.map(function (m) { return m.sess ? m.sess.id : null; });
    /* v733: نموذجُ المخبر فُتح للتوّ ⇒ سؤالُ الخصم يُؤجَّل لإغلاقه (closeModal('labOrderModal')) — لا نافذتان فوق بعض (نمطُ مسار السن) */
    if (openLab) window._pendingMatDeduct = { k: key, l: label, m: made.length, s: matIds };
    else {
      try { await maybePromptMaterialDeduction(key, label, made.length, matIds); }
      catch (e) { console.warn('denture material deduction skipped:', e); }
    }
  }
}
/* الفحصُ الأولي: جهازٌ قائم يُسجَّل بحالة الشريط (موجود/عيادتنا · موجود/عيادة أخرى) — صفوفُ مخططٍ بلا جلسة */
async function dentSaveExam() {
  var pd = pendingDenture; if (!pd) return;
  pendingDenture = null;
  var status = (typeof examStatus !== 'undefined') ? examStatus : 'existing_other';
  if (status !== 'existing_other' && status !== 'existing_current') {
    showToast('🩺 اختر «موجود» من شريط الفحص لتسجيل جهازٍ قائم'); return;
  }
  var bad = dentRevalidate(pd);
  if (bad) { showToast('⚠️ تغيّر المخطط — ' + bad); return; }
  var done = [];
  for (var i = 0; i < pd.units.length; i++) {
    var u = pd.units[i];
    var markNow = u.mark.filter(function (t) { return !!dentToothState(t).standing; });
    var snap = await dentSnapshotTeeth(markNow);   /* v711: قبل أي محو — «تراجع» يعيد الأسنان كما كانت */
    if (!snap) { showToast('⚠️ تعذّر قراءة حالة الأسنان — لم يتغيّر شيء، أعد المحاولة'); break; }
    var uid = dentUuid();
    var undo = { type: 'denture', unit: uid, marked: markNow.map(String), rows: snap, count: 1 };
    if (markNow.length) {
      var mErr = await dentMarkMissing(markNow, pendingProviderId);
      if (mErr) { if (typeof examUndoStack !== 'undefined') examUndoStack.push(undo); showToast('⚠️ تعذّر تعليم الأسنان مفقودة (' + mErr + ') — «تراجع» يعيد ما تغيّر'); break; }
    }
    var wErr = await dentWriteRows(u, pd.key, status, uid, pendingProviderId);
    if (wErr) { if (markNow.length && typeof examUndoStack !== 'undefined') examUndoStack.push(undo); showToast('⚠️ تعذّر حفظ الجهاز على المخطط (' + wErr + ')' + (markNow.length ? ' — «تراجع» يعيد الأسنان' : '')); break; }
    if (typeof examUndoStack !== 'undefined') examUndoStack.push(undo);
    done.push(dentAreaText(u.arch, u.teeth));
  }
  if (done.length && typeof examCount !== 'undefined') examCount += done.length;
  renderTeeth(); renderStats();
  if (typeof examSyncCount === 'function') examSyncCount();
  if (done.length) showToast('✓ ' + pd.label + ' — ' + done.join(' · ') + ' — «تراجع» يلغيه');
}

/* ═════════════════════ الإزالة ═════════════════════ */
var dentRemoveUnit = (typeof ppGuarded === 'function') ? ppGuarded('dentRemoveUnit', _dentRemoveUnit_inner, '⏳') : _dentRemoveUnit_inner;
async function _dentRemoveUnit_inner(num) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان'); return;
  }
  var u = dentUnitOf(num); if (!u) return;
  var name = dentUnitName(u), area = dentAreaText(u.arch, u.teeth);
  /* جلسةُ الجهاز تُلتقط قبل الحذف (#664): المخطّطة تُسأل عنها، والمنجزةُ للمالك وحده */
  var s = dentSessionOfUnit(u), pl = [], done = [];
  if (s) { if ((s.status || 'completed') === 'planned') pl.push(s); else if ((s.status || 'completed') === 'completed') done.push(s); }
  /* v724: تحت الجهاز الفوري سنٌّ قائم قلعُه مخطّط — لا يُقال عنه «مفقود» */
  if (!await SyDialog.confirm({ message: 'إزالة «' + name + '» (' + area + ')؟\n' + (dentOpenExtractions(u.teeth).length
        ? 'لن يتغيّر شيء آخر — الأسنان وقلعُها المخطّط تبقى كما هي.' : 'لن يتغيّر شيء آخر — الأسنان تبقى مفقودة كما هي.')
      + removalSessionsNote(pl.length, done.length), danger: true })) return;
  var teeth = u.teeth.map(String);
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('surface', DENT_SURFACE).in('tooth_num', teeth);
  var err = !!(d && d.error);
  if (err) console.error('remove denture rows error:', d.error);
  else teeth.forEach(function (tn) { delete dentureMap[tn]; });
  if (!err) { try { await dentSettlePending(); } catch (eS) { console.warn('settle after removal skipped:', eS); } }   /* ج2-ب: المعلّقُ يأخذ الرسم */
  closeModal('toothModal');
  renderTeeth(); renderStats();
  if (err) { showToast('⚠️ لم تُحفظ الإزالة — تحقّق من الاتصال وأعد المحاولة'); return; }
  var fu = await followUpRemovedSessions(pl, done, 'أُزيل الجهاز. هل تريد حذف جلسته المخطّطة من السجل أيضاً؟');
  showToast(removalToast('✅', 'تمت إزالة ' + name, fu));
}
function dentRemoveBtnHtml(n) {
  var u = dentUnitOf(n); if (!u) return '';
  var col = dentColors(u.key).stroke;
  return '<button class="topt dent-remove" style="border-color:' + escapeHtml(col) + ';color:' + escapeHtml(col) + ';font-weight:700;" '
    + 'title="' + (dentOpenExtractions(u.teeth).length ? 'يزيل الجهاز عن كل أسنانه — الأسنان وقلعُها المخطّط تبقى كما هي' : 'يزيل الجهاز عن كل أسنانه — الأسنان تبقى مفقودة') + '" onclick="dentRemoveUnit(' + parseInt(n, 10) + ')">🦷 إزالة «' + escapeHtml(dentUnitName(u)) + '»</button>';
}

/* ═════════════════════ خطّافاتُ الجلسة: الإنجاز والحذف ═════════════════════ */
/* إنجازُ جلسة الجهاز المخطّطة يقلب صفوفَ وحدتها (unit_id = معرّف الجلسة) — مرآتُه الدلالية بصفحة المواعيد */
async function dentOnSessionComplete(sess) {
  if (!sess || !sess.id) return false;
  var hit = Object.keys(dentureMap).filter(function (tn) { return dentureMap[tn].unit === sess.id && dentureMap[tn].st === 'planned'; });
  /* ج2-ب: جلسةٌ معلّقة (لا صفوفَ لها) أُنجزت ⇒ جهازُها يأخذ الرسم مكان القديم */
  if (!hit.length) return (dentIsSession(sess) && !dentSessDrawn(sess)) ? await dentDrawCompleted(sess) : false;
  var u = await window.sb.from('teeth_status').update({ status: 'completed', review_at: null })
    .eq('doctor_id', currentUser.id).eq('patient_id', sess.patient_id || patientId)
    .eq('unit_id', sess.id).eq('surface', DENT_SURFACE).eq('status', 'planned');
  if (u && u.error) { console.warn('dentOnSessionComplete warn:', u.error); dentMarkDrawFail(sess.id); return false; }   /* v737 */
  hit.forEach(function (tn) { dentureMap[tn].st = 'completed'; });
  return true;
}
/* ج2-ج (قرارُ المالك 14/11/2026 — الخيار أ): إنجازُ الجهاز الفوري والقلعُ ما زال مخطّطاً لا يُرفض (كي لا يعلق «إكمال الموعد»)،
   لكنه يُقال: نصٌّ يُلحق برسالة الإنجاز. فارغٌ إن لم يبقَ قلعٌ مخطّط تحت الجهاز. */
function dentCompleteNote(sess) {
  if (!sess || sess.tooth_num || !sess.unit_teeth) return '';
  var open = dentOpenExtractions(dentSessTeeth(sess));
  return open.length ? '⚠️ قلع ' + dentTeethPhrase(open) + ' ما زال مخطّطاً — أنجزه ليظهر سنُّ الجهاز' : '';
}
/* حذفُ جلسة جهازٍ مخطّطة يزيل رسمَه (سابقةُ الجسر M145-k)؛ المنجزةُ يبقى رسمُها — الجهازُ بفم المريض */
async function dentOnSessionDeleted(sess) {
  if (!sess || !sess.id || (sess.status || 'completed') !== 'planned') return false;
  var hit = Object.keys(dentureMap).filter(function (tn) { return dentureMap[tn].unit === sess.id && dentureMap[tn].st === 'planned'; });
  if (!hit.length) return false;
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', sess.patient_id || patientId)
    .eq('unit_id', sess.id).eq('surface', DENT_SURFACE).eq('status', 'planned');
  if (d && d.error) { console.warn('dentOnSessionDeleted warn:', d.error); return false; }
  hit.forEach(function (tn) { delete dentureMap[tn]; });
  /* ج2-ب: حُذف المرسوم وله بديلٌ معلّق ⇒ البديلُ يأخذ الرسم (سابقةُ الجسر M145-b) */
  try { await dentSettlePending(); } catch (eS) { console.warn('settle after delete skipped:', eS); }
  return true;
}

/* ج2-أ: زرعةٌ أُزيل صفُّها عن سنٍّ يعوّضه جهاز (حذفُ جلستها · إلغاءُ ختمها بالفحص) ⇒ السنُّ كان مفقوداً قبلها فيعود مفقوداً —
   لا قائماً تحت الجهاز. حالةُ القلع من المصدر الواحد extractionStatusUnderImplant (مرآةُ removeImplant). */
async function dentRestoreMissing(num) {
  var tn = String(num);
  if (!dentHas(tn)) return false;
  var sm = teethMap[tn] || {};
  if (sm.WHOLE || (typeof isExtracted === 'function' && isExtracted(tn)) || (typeof isImplant === 'function' && isImplant(tn))) return false;
  var st = (typeof extractionStatusUnderImplant === 'function') ? extractionStatusUnderImplant(num) : 'completed';
  var r = await upsertTeethStatusWithFallback({
    doctor_id: currentUser.id, patient_id: patientId, tooth_num: tn, surface: 'WHOLE', treatment_key: 'extracted', status: st
  }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
  if (r && r.error) { console.warn('dentRestoreMissing:', r.error); return false; }
  if (!teethMap[tn]) teethMap[tn] = {};
  teethMap[tn].WHOLE = 'extracted';
  if (!teethMap[tn].__status) teethMap[tn].__status = {};
  teethMap[tn].__status.WHOLE = st;
  return true;
}

/* ═════════════════════ الرسم (طبقةٌ فوق المخطط بعد renderTeeth) ═════════════════════ */
function dentColors(key) {
  var t = (typeof getTreatment === 'function') ? getTreatment(key) : null;
  var ok = function (c) { return /^#[0-9a-fA-F]{3,8}$|^var\(--[a-z0-9-]+\)$/.test(String(c || '')); };   /* لونٌ من الكتالوج: hex أو توكن حصراً (#195) */
  var fill = (t && ok(t.fill)) ? t.fill : '#e11d74';
  var stroke = (t && ok(t.stroke)) ? t.stroke : fill;
  return { fill: fill, stroke: stroke };
}
function dentStatusBadge(st) {
  if (!st || st === 'completed') return '';
  var col = (typeof STATUS_COLORS !== 'undefined' && STATUS_COLORS[st]) || '#888';
  var lbl = (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[st]) || st;
  return ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:' + col + '33;color:' + col
    + ';font-size:10px;font-weight:700;margin-right:4px;">' + escapeHtml(lbl) + '</span>';
}
/* n (ج2-ج): السنُّ نفسه قلعُه مخطّط ⇒ الجهازُ عليه فوري (قاعدتُه وحدها مرسومة حتى القلع) */
function dentTipRow(u, n) {
  var c = dentColors(u.key);
  return '<div class="tip-row dent-tip"><span class="tip-dot" style="background:' + escapeHtml(c.fill) + '"></span><b>جهاز متحرك:</b> '
    + escapeHtml(dentUnitName(u)) + dentStatusBadge(u.st) + escapeHtml(dentOptBadgeText(dentSessionOfUnit(u)))
    + ((n && dentOpenExtractions([n]).length) ? ' <span class="dent-imm">فوري — بعد القلع</span>' : '') + '</div>';
}
/* ═════════════════════ الرسم الجديد (v739 — قرارُ المالك 16–17/11/2026 بعد ثلاث نسخ بروتوتايب) ═════════════════════
   • اللثة (المنظر الوجهي، كاملاً وجزئياً): حافّةٌ منحنية حول عنق كل سن وحليمةٌ بين السنّين وأطرافٌ مدوّرة — قطعةٌ لكل خلية
     تلتقي مع جارتها على ارتفاعٍ واحد؛ تحتها خلفيةٌ مصمتة بلون المخطط ⇒ التراكبُ عند الوصلة لا يغمّق أي حالة.
   • الواصل الرئيسي (الجزئي): صفيحةٌ عريضة تمرّ **خلف** الأسنان القائمة (تُدرج قبل رسم السن)، وبالمنظر الإطباقي قاعدةُ السرج
     + صفيحةٌ على الجهة الحنكية/اللسانية. الجهازُ الكامل إطباقياً: الأسنانُ وحدها كما كان.
   • الضمّة: ذراعٌ واحد بسيط يخرج من جسم الجهاز (طرف السرج الملاصق، وإلا الواصل) ويلتفّ على السن.
   • خلايا امتداد الجهاز بلا فلتر CSS (ظلُّ خليةٍ على جارتها = خطٌّ عند كل وصلة)؛ ظلُّ السن القائم يبقى بفلتر SVG على مجموعته. */
function dentBleed(n, acrossMidline) {
  var mode = (typeof dentitionMode !== 'undefined' && DENT_ROW_GAP_PX[dentitionMode]) ? dentitionMode : 'permanent';
  var gap = DENT_ROW_GAP_PX[mode], px = acrossMidline ? (DENT_MIDLINE_PX + 2 * gap) / 2 : gap / 2;
  var w = (typeof cellWidth === 'function' ? cellWidth(n) : 60) || 60;
  return Math.round((px * 100 / w + (acrossMidline ? DENT_BLEED_EPS_MID : DENT_BLEED_EPS)) * 100) / 100;
}
/* المنظر الإطباقي: viewBox الخلية 66.67 وحدة لعرضها */
function dentBleedOcc(n, acrossMidline) {
  var mode = (typeof dentitionMode !== 'undefined' && DENT_ROW_GAP_PX[dentitionMode]) ? dentitionMode : 'permanent';
  var gap = DENT_ROW_GAP_PX[mode], px = acrossMidline ? (DENT_MIDLINE_PX + 2 * gap) / 2 : gap / 2;
  var w = (typeof cellWidth === 'function' ? cellWidth(n) : 60) || 60;
  return Math.round((px * DENT_OCC_SPAN / w + (acrossMidline ? DENT_BLEED_EPS_MID_OCC : DENT_BLEED_EPS_OCC)) * 100) / 100;
}
function dentR(v) { return Math.round(v * 100) / 100; }
function dentHex(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')); }
/* مزجُ لونين (hex حصراً — توكنُ الثيم يبقى كما هو بلا تدرّج) */
function dentMix(a, b, t) {
  if (!dentHex(a) || !dentHex(b)) return a;
  var out = '#';
  for (var i = 0; i < 3; i++) {
    var x = parseInt(a.substr(1 + i * 2, 2), 16), y = parseInt(b.substr(1 + i * 2, 2), 16), v = Math.round(x + (y - x) * t);
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}
/* بنّاءُ مسار: f = الشكلُ المغلق (التعبئة) · s = حدودُه الظاهرة فقط (الوصلةُ مع الجار بلا خط) */
function DentPath(x, y) { this.f = 'M' + dentR(x) + ',' + dentR(y); this.s = this.f; }
DentPath.prototype.seg = function (d, ex, ey, stroke) { this.f += ' ' + d; this.s += (stroke === false) ? ' M' + dentR(ex) + ',' + dentR(ey) : ' ' + d; return this; };
DentPath.prototype.L = function (x, y, stroke) { return this.seg('L' + dentR(x) + ',' + dentR(y), x, y, stroke); };
DentPath.prototype.Q = function (cx, cy, x, y) { return this.seg('Q' + dentR(cx) + ',' + dentR(cy) + ' ' + dentR(x) + ',' + dentR(y), x, y); };
DentPath.prototype.C = function (a, b, c, d, x, y) { return this.seg('C' + dentR(a) + ',' + dentR(b) + ' ' + dentR(c) + ',' + dentR(d) + ' ' + dentR(x) + ',' + dentR(y), x, y); };
/* جسمُ الجهاز (لثة · واصل · قاعدة): تعبئةٌ **مصمتة** بكل حالة — المنجزُ بتدرّجٍ خفيف، والمخطّطُ تهشيرٌ خلفيتُه بلون أرضية المخطط،
   والباقي لونُه ممزوجٌ بلون الأرضية بنسبة شفافية الحالة (v595) ⇒ تراكبُ قطعتين عند وصلة الخلايا لا يغمّق ولا يترك خطاً. ثم الحدّ. */
function dentBody(cls, pb, st, c, y1, y2, pid, attrs, extra) {
  var d = pb.f + ' Z', out = '', a = attrs ? ' ' + attrs : '', back = 'var(--dent-back,var(--bg2))';
  if (!st || st === 'completed') {
    var top = dentMix(c.stroke, c.fill, cls === 'dent-conn' ? 0.35 : 0.5), edge = dentMix(c.stroke, '#000000', 0.28);
    out += '<defs><linearGradient id="' + pid + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + dentR(y1) + '" x2="0" y2="' + dentR(y2) + '"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + c.stroke + '"/></linearGradient></defs>'
      + '<path class="' + cls + '" d="' + d + '" fill="url(#' + pid + ')"' + a + '/>' + (extra || '')
      + '<path class="dent-edge" d="' + pb.s + '" fill="none" stroke="' + edge + '" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>';
  } else {
    var p = txPaint(st, c.stroke, c.stroke, pid);
    if (st === 'planned') {
      out += '<defs><pattern id="' + pid + '" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:' + back + '"/><rect width="2.2" height="5" fill="' + c.stroke + '"/></pattern></defs>'
        + '<path class="' + cls + '" d="' + d + '" fill="url(#' + pid + ')"' + a + '/>';
    } else {
      out += '<path class="' + cls + '" d="' + d + '" fill="' + c.stroke + '" fill-opacity="' + p.fo + '" style="fill:color-mix(in srgb, ' + c.stroke + ' ' + Math.round(p.fo * 100) + '%, ' + back + ');fill-opacity:1"' + a + '/>';
    }
    if (p.stroke) out += '<path class="dent-edge" d="' + pb.s + '" fill="none" stroke="' + p.stroke + '" stroke-width="' + p.sw + '"' + (p.dash ? ' stroke-dasharray="' + p.dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>';
  }
  return out;
}
/* السنُّ الصناعي: خلفيتُه تغطّي خطَّ شبح السن المقلوع تحته، ثم شكلُ الحالة كما كان (txPathAttrs) */
function dentToothSvg(d, st, c, pid) {
  var a = txPathAttrs(st, c.fill, c.stroke, pid, 0.92);
  return '<path class="dent-back dent-back-t" d="' + d + '"/>' + a.defs + '<path class="dent-tooth" d="' + d + '" ' + a.attrs
    + (/stroke=/.test(a.attrs) ? '' : ' stroke="' + c.stroke + '" stroke-width="1.2"') + ' stroke-linejoin="round"/>';
}
function dentWire(d, st, w) {
  var s = '<path class="dent-wire" d="' + d + '" fill="none" stroke="' + DENT_STEEL + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + txRingDash(st) + '/>';
  if (!st || st === 'completed') s += '<path d="' + d + '" fill="none" stroke="' + DENT_STEEL_HI + '" stroke-width="' + dentR(w * 0.28) + '" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>';
  return s;
}
/* سياقُ وحدةٍ على صفّها: الجاران على الشاشة (الصفُّ يُرسم من اليمين إلى اليسار: السابقُ بالمصفوفة على اليمين) */
function dentCtx(u, clasps) {
  var row = dentArchRow(u.arch), set = {}, idx = [];
  u.teeth.forEach(function (t) { set[t] = 1; var i = row.indexOf(t); if (i >= 0) idx.push(i); });
  /* الامتداد: أسنانُ الجهاز + كلُّ ضمّةٍ ليست ملاصقةً لسرج (الواصلُ يصل إليها)؛ الملاصقةُ تخرج من السرج نفسه */
  var all = idx.slice();
  (clasps || []).forEach(function (t) {
    var i = row.indexOf(t); if (i < 0 || set[row[i - 1]] || set[row[i + 1]]) return;
    all.push(i);
  });
  var mid = row.length / 2;
  return {
    u: u, row: row, set: set, partial: dentIsPartialUnit(u),
    lo: all.length ? Math.min.apply(null, all) : -1, hi: all.length ? Math.max.apply(null, all) : -1,
    has: function (t) { return t != null && !!set[t]; },
    inSpan: function (t) { var i = row.indexOf(t); return i >= 0 && i >= this.lo && i <= this.hi; },
    left: function (n) { return row[row.indexOf(n) + 1]; }, right: function (n) { return row[row.indexOf(n) - 1]; },
    midLeft: function (n) { return row.indexOf(n) === mid - 1; }, midRight: function (n) { return row.indexOf(n) === mid; },
    /* طرفُ الامتداد على سنٍّ قائم (ضمّةٌ بعيدة): الواصلُ ينتهي خلف السن لا عند حدّ خليته */
    endLeft: function (n) { return row.indexOf(n) === this.hi; }, endRight: function (n) { return row.indexOf(n) === this.lo; }
  };
}
/* ── المنظر الوجهي (إحداثيات الخلية 0..100 × 0..210، التاجُ أعلى؛ الفكُّ العلوي يُقلب بالمجموعة) ── */
function dentGumFacial(n, cx, c, st) {
  var a = toothAnatomy(n), nl = cx.left(n), nr = cx.right(n), Lf = cx.has(nl), Rf = cx.has(nr);
  var xL = Lf ? -dentBleed(n, cx.midLeft(n)) : 5, xR = Rf ? 100 + dentBleed(n, cx.midRight(n)) : 95;
  var Z = a.cervicalY - 1.5, w = (a.cejR - a.cejL) / 2, B = DENT_BASE_BOTTOM;
  /* الحليمة: قمّةٌ مدوّرة على الحدّ المشترك — ارتفاعٌ واحد للجارين ⇒ اتصالٌ بلا درجة */
  var pL = Lf ? Math.min(a.cervicalY, toothAnatomy(nl).cervicalY) - DENT_PAPILLA : a.cervicalY - DENT_PAPILLA + 4;
  var pR = Rf ? Math.min(a.cervicalY, toothAnatomy(nr).cervicalY) - DENT_PAPILLA : a.cervicalY - DENT_PAPILLA + 4;
  var sx = Lf ? xL : xL + 6, ex = Rf ? xR : xR - 6;
  var pb = new DentPath(sx, pL);
  pb.C(sx + (50 - sx) * 0.3, pL, 50 - w * 0.9, Z, 50, Z).C(50 + w * 0.9, Z, ex - (ex - 50) * 0.3, pR, ex, pR);
  if (Rf) pb.L(xR, B, false); else pb.Q(xR, pR, xR, pR + 6).L(xR, B - 10).Q(xR, B, xR - 10, B);
  pb.L(Lf ? xL : xL + 10, B);
  if (Lf) pb.L(xL, pL, false); else pb.Q(xL, B, xL, B - 10).L(xL, pL + 6).Q(xL, pL, sx, pL);
  /* بروزُ الجذر: إضاءةٌ ناعمة تحت كل سن (للمنجز فقط — داخل dentBody). معرّفُها يبدأ بـ«hi»: مسطِّحُ الطباعة (printChart) يعدّ
     تدرّجاتِ hi زينةً شفافة فيحذفها — بغيرها تُطبع الإضاءةُ بقعةً بيضاء مصمتة */
  var hi = '<defs><radialGradient id="hidn' + n + '"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
    + '<ellipse cx="50" cy="' + dentR((Z + B) / 2 + 2) + '" rx="' + dentR(w * 0.95) + '" ry="' + dentR((B - Z) * 0.5) + '" fill="url(#hidn' + n + ')"/>';
  return dentBody('dent-base', pb, st, c, DENT_GUM_TOP, B, 'dnb' + n, 'data-x1="' + dentR(xL) + '" data-x2="' + dentR(xR) + '" data-pl="' + dentR(pL) + '" data-pr="' + dentR(pR) + '"', hi);
}
function dentConnFacial(n, c, st, x1, x2, pid) {
  var pb = new DentPath(x1, DENT_CONN_T);
  pb.L(x2, DENT_CONN_T).L(x2, DENT_CONN_B, false).L(x1, DENT_CONN_B).L(x1, DENT_CONN_T, false);
  return dentBody('dent-conn', pb, st, c, DENT_CONN_T, DENT_CONN_B, pid, 'data-x1="' + dentR(x1) + '" data-x2="' + dentR(x2) + '"');
}
/* near: 'L' أو 'R' = جهةُ الجهاز على الشاشة · adj: السنُّ ملاصقٌ لسرج (الضمّة تخرج من داخل قاعدته) وإلا فمن الواصل خلفه */
function dentClaspFacial(n, cx, near, adj, st) {
  var a = toothAnatomy(n), w = (a.cejR - a.cejL) / 2, cv = a.cervicalY, s = near === 'L' ? 1 : -1;
  var edge = near === 'L' ? a.cejL - 2 : a.cejR + 2;
  var gap = 2 * (dentBleed(n, near === 'L' ? cx.midLeft(n) : cx.midRight(n)) - DENT_BLEED_EPS);
  var x0 = adj ? (near === 'L' ? -(gap + 6.5) : 100 + gap + 6.5) : (near === 'L' ? -2 : 102), y0 = (DENT_CONN_T + DENT_CONN_B) / 2;   /* 6.5 = داخل طرف القاعدة (5) بوحدةٍ ونصف */
  var d = 'M' + dentR(x0) + ',' + y0 + ' C' + dentR(edge - s * 9) + ',' + y0 + ' ' + dentR(edge - s * 7) + ',' + dentR(cv - 18) + ' ' + dentR(edge + s * 3) + ',' + dentR(cv - 18)
    + ' C' + dentR(50 - s * w * 0.15) + ',' + dentR(cv - 20) + ' ' + dentR(50 + s * w * 0.4) + ',' + dentR(cv - 17) + ' ' + dentR(50 + s * w * 0.72) + ',' + dentR(cv - 9);
  return '<g class="dent-clasp-arm" data-x0="' + dentR(x0) + '">' + dentWire(d, st, 5.8) + '</g>';
}
/* ── المنظر الإطباقي (viewBox 16.67..83.33). الأشكالُ العامة بالإحداثيات «العلوية» (الدهليزي أعلى، اللساني/الحنكي أسفل)
      وتُقلب للفك السفلي بمجموعتها؛ السنُّ الصناعي والضمّة بإحداثيات السن الحقيقية. ── */
function dentBuccE(n) { var g = occGeom(n).bbox; return dentArchOf(n) === 'U' ? g.y0 : 100 - g.y1; }
function dentLingE(n) { var g = occGeom(n).bbox; return dentArchOf(n) === 'U' ? g.y1 : 100 - g.y0; }
function dentBaseOcc(n, cx, c, st) {
  var nl = cx.left(n), nr = cx.right(n), yl = DENT_OCC_PLATE;
  function side(nb) { return cx.has(nb) ? 'join' : (cx.inSpan(nb) ? 'conn' : 'end'); }
  var sL = side(nl), sR = side(nr);
  /* الجناحُ الدهليزي يتبع انتفاخَ كل سن (أعرض عند الأرحاء، أنحف عند القواطع) */
  function yb(m) { return dentBuccE(m) - 6; }
  var ybC = yb(n), ybL = sL === 'join' ? (ybC + yb(nl)) / 2 : ybC, ybR = sR === 'join' ? (ybC + yb(nr)) / 2 : ybC;
  var bL = DENT_OCC_X0 - dentBleedOcc(n, cx.midLeft(n)), bR = DENT_OCC_X1 + dentBleedOcc(n, cx.midRight(n)), cL = 21, cR = 79, r = 10;
  var x0 = sL === 'join' ? bL : cL + r, x1 = sR === 'join' ? bR : cR - r;
  var pb = new DentPath(x0, ybL);
  pb.C(x0 + (50 - x0) * 0.5, ybL, 38, ybC, 50, ybC).C(62, ybC, x1 - (x1 - 50) * 0.5, ybR, x1, ybR);
  if (sR === 'join') pb.L(bR, yl, false);
  else if (sR === 'end') pb.Q(cR, ybR, cR, ybR + r).L(cR, yl - r).Q(cR, yl, cR - r, yl);
  else { var ycR = dentLingE(nr) - 4; pb.Q(cR, ybR, cR, ybR + r).L(cR, ycR - 7).Q(cR, ycR, cR + 6, ycR).L(bR, ycR).L(bR, yl, false); }
  pb.L(sL === 'end' ? cL + r : bL, yl);
  if (sL === 'join') pb.L(bL, ybL, false);
  else if (sL === 'end') pb.Q(cL, yl, cL, yl - r).L(cL, ybL + r).Q(cL, ybL, cL + r, ybL);
  else { var ycL = dentLingE(nl) - 4; pb.L(bL, ycL, false).L(cL - 6, ycL).Q(cL, ycL, cL, ycL - 7).L(cL, ybL + r).Q(cL, ybL, cL + r, ybL); }
  return dentBody('dent-plate', pb, st, c, DENT_OCC_GRAD_T, yl, 'dnp' + n, 'data-side="' + sL + ',' + sR + '"');
}
/* سنٌّ قائم ضمن امتداد الجهاز: الصفيحةُ تندسّ قليلاً تحت حافّته اللسانية */
function dentConnOcc(n, cx, c, st) {
  var nl = cx.left(n), nr = cx.right(n), T = dentLingE(n) - 4, yl = DENT_OCC_PLATE;
  var bL = DENT_OCC_X0 - dentBleedOcc(n, cx.midLeft(n)), bR = DENT_OCC_X1 + dentBleedOcc(n, cx.midRight(n));
  var tL = cx.has(nl) ? T : (T + dentLingE(nl) - 4) / 2, tR = cx.has(nr) ? T : (T + dentLingE(nr) - 4) / 2;
  var eL = cx.endLeft(n), eR = cx.endRight(n), pb;
  if (eL || eR) {
    /* طرفُ الصفيحة تحت السن: نصفُ الخلية من جهة الجهاز، بطرفٍ مدوّر */
    var xa = eL ? 50 : bL, xb = eR ? 50 : bR, ta = eL ? T : tL, tb = eR ? T : tR;
    pb = new DentPath(xa, ta);
    pb.L(xb, tb);
    if (eR) pb.Q(xb + 8, tb, xb + 8, tb + 8).L(xb + 8, yl - 8).Q(xb + 8, yl, xb, yl); else pb.L(xb, yl, false);
    pb.L(xa, yl);
    if (eL) pb.Q(xa - 8, yl, xa - 8, yl - 8).L(xa - 8, ta + 8).Q(xa - 8, ta, xa, ta); else pb.L(xa, ta, false);
  } else {
    pb = new DentPath(bL, tL);
    pb.C(bL + (50 - bL) * 0.5, tL, 38, T, 50, T).C(62, T, bR - (bR - 50) * 0.5, tR, bR, tR).L(bR, yl, false).L(bL, yl).L(bL, tL, false);
  }
  return dentBody('dent-plate', pb, st, c, DENT_OCC_GRAD_T, yl, 'dnp' + n, 'data-side="conn,conn"');
}
/* نقاطُ محيط السن الإطباقي من مساره (M + منحنياتُ C) — حسابٌ صرف بلا DOM */
var _dentOccPts = {};
function dentOccPoints(n) {
  if (_dentOccPts[n]) return _dentOccPts[n];
  var nums = String(occGeom(n).outline).match(/-?\d+(?:\.\d+)?/g) || [], v = nums.map(parseFloat), pts = [];
  if (v.length < 8) return (_dentOccPts[n] = []);
  var px = v[0], py = v[1];
  for (var i = 2; i + 5 < v.length; i += 6) {
    for (var k = 0; k < 8; k++) {
      var t = k / 8, m = 1 - t;
      pts.push([m * m * m * px + 3 * m * m * t * v[i] + 3 * m * t * t * v[i + 2] + t * t * t * v[i + 4],
                m * m * m * py + 3 * m * m * t * v[i + 1] + 3 * m * t * t * v[i + 3] + t * t * t * v[i + 5]]);
    }
    px = v[i + 4]; py = v[i + 5];
  }
  return (_dentOccPts[n] = pts);
}
function dentClaspOcc(n, cx, near, adj, st) {
  var pts = dentOccPoints(n), N = pts.length; if (N < 8) return '';
  var upper = dentArchOf(n) === 'U', i, iN = 0, iF = 0, ox = 0, oy = 0;
  for (i = 0; i < N; i++) {
    ox += pts[i][0] / N; oy += pts[i][1] / N;
    if (near === 'L' ? pts[i][0] < pts[iN][0] : pts[i][0] > pts[iN][0]) iN = i;
    if (near === 'L' ? pts[i][0] > pts[iF][0] : pts[i][0] < pts[iF][0]) iF = i;
  }
  function route(dir) { var a = [], k = iN, guard = 0; while (guard++ <= N) { a.push(pts[k]); if (k === iF) break; k = (k + dir + N) % N; } return a; }
  var r1 = route(1), r2 = route(-1);
  var m1 = r1[Math.floor(r1.length / 2)][1], m2 = r2[Math.floor(r2.length / 2)][1];
  var bucc = (upper ? m1 < m2 : m1 > m2) ? r1 : r2, ling = bucc === r1 ? r2 : r1;
  function off(p) { var vx = p[0] - ox, vy = p[1] - oy, l = Math.sqrt(vx * vx + vy * vy) || 1; return [p[0] + vx / l * 1.6, p[1] + vy / l * 1.6]; }
  var chain = [], j, x0;
  if (adj) {
    var gap = 2 * (dentBleedOcc(n, near === 'L' ? cx.midLeft(n) : cx.midRight(n)) - DENT_BLEED_EPS_OCC);
    x0 = near === 'L' ? (DENT_OCC_X0 - gap - (DENT_OCC_X1 - 79)) - 1 : (DENT_OCC_X1 + gap + (21 - DENT_OCC_X0)) + 1;   /* طرفُ قاعدة السرج المجاور */
    chain.push([x0, pts[iN][1]]);
  } else {
    var kL = 0;
    for (j = 0; j < ling.length; j++) if (upper ? ling[j][1] > ling[kL][1] : ling[j][1] < ling[kL][1]) kL = j;
    x0 = ling[kL][0];
    chain.push([x0, ling[kL][1] + (upper ? 6 : -6)]);                                    /* داخل الصفيحة من الجهة اللسانية */
    for (j = kL; j > 0; j--) chain.push(off(ling[j]));
  }
  var m = Math.floor(bucc.length * 0.74);
  for (j = 0; j <= m; j++) chain.push(off(bucc[j]));
  var d = '';
  chain.forEach(function (p, k) { d += (k ? ' L' : 'M') + dentR(p[0]) + ',' + dentR(p[1]); });
  return '<g class="dent-clasp-arm" data-x0="' + dentR(x0) + '">' + dentWire(d, st, 4.2) + '</g>';
}
function dentLayerHtml(u, cls, inner, flip) {
  return '<g class="' + cls + '" data-dent-unit="' + escapeHtml(u.id || u.key) + '" data-dent-key="' + escapeHtml(u.key) + '" data-dent-status="' + escapeHtml(u.st) + '" pointer-events="none"'
    + (flip ? ' transform="' + flip + '"' : '') + '>' + inner + '</g>';
}
/* خليةُ السن وجهياً. داخل الجهاز: الواصلُ (إن جاورها سنٌّ قائم ضمن الامتداد) ثم السنُّ الصناعي ثم اللثة فوق عنقه.
   bandOnly: دميةُ جسرٍ/زرعةٌ بديلة/سنٌّ قلعُه مخطّط ⇒ اللثةُ وحدها. خارج الجهاز وضمن امتداده: الواصلُ وحده (يُدرج خلف السن). */
function dentFacialLayer(n, cx, inUnit, bandOnly) {
  var u = cx.u, c = dentColors(u.key), st = u.st, inner = '';
  var bl = dentBleed(n, cx.midLeft(n)), br = dentBleed(n, cx.midRight(n));
  if (inUnit) {
    if (!cx.has(cx.left(n)) && cx.inSpan(cx.left(n))) inner += dentConnFacial(n, c, st, -bl, 14, 'dncl' + n);
    if (!cx.has(cx.right(n)) && cx.inSpan(cx.right(n))) inner += dentConnFacial(n, c, st, 86, 100 + br, 'dncr' + n);
    if (!bandOnly) inner += dentToothSvg(toothAnatomy(n).outlineD, st, c, 'dn' + n);
    inner += dentGumFacial(n, cx, c, st);
  } else {
    inner += dentConnFacial(n, c, st, cx.endLeft(n) ? 50 : -bl, cx.endRight(n) ? 50 : 100 + br, 'dnc' + n);
  }
  return dentLayerHtml(u, 'dent-layer', inner, u.arch === 'U' ? 'translate(0,210) scale(1,-1)' : '');
}
/* المنظر الإطباقي. الجزئي: قاعدةُ السرج (أو الصفيحةُ خلف سنٍّ قائم) + السنُّ الصناعي. الكامل: السنُّ الصناعي وحده. */
function dentOccLayer(n, cx, inUnit, toothToo) {
  var u = cx.u, c = dentColors(u.key), st = u.st, inner = '';
  if (cx.partial) inner += '<g' + (u.arch === 'L' ? ' transform="translate(0,100) scale(1,-1)"' : '') + '>' + (inUnit ? dentBaseOcc(n, cx, c, st) : dentConnOcc(n, cx, c, st)) + '</g>';
  if (inUnit && toothToo) inner += dentToothSvg(occGeom(n).outline, st, c, 'dno' + n);
  return inner ? dentLayerHtml(u, 'dent-layer', inner, '') : '';
}
/* خليةٌ ضمن امتداد جهاز: فلترُ CSS يُرفع عن الـsvg (صنف dent-flat — ظلُّ خليةٍ على جارتها يرسم خطاً عند كل وصلة) وظلُّ ما فيه
   يبقى بفلتر SVG على مجموعةٍ تضمّ محتواه الأصلي. تعريفُ الفلتر **داخل الـsvg نفسه** (لا بمخزنٍ مشترك): نسخةُ الطباعة ولقطةُ
   المسودة تنسخان الـsvg وحده فتبقى إشارتُه صالحة. لونُ الظل من CSS (‎.dent-fxc) والسماتُ احتياطٌ للنسخة المستقلّة. */
function dentFlatten(svg, occ, n) {
  if (!svg || svg.classList.contains('dent-flat')) return;
  svg.classList.add('dent-flat');
  var kids = [], i, ch;
  for (i = 0; i < svg.children.length; i++) {
    ch = svg.children[i];
    var tag = (ch.tagName || '').toLowerCase();
    if (tag === 'defs' || tag === 'title' || (ch.classList && (ch.classList.contains('dent-layer') || ch.classList.contains('dent-clasp')))) continue;
    kids.push(ch);
  }
  if (!kids.length) return;
  var fid = (occ ? 'dfxo' : 'dfxf') + parseInt(n, 10);
  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'dent-fx'); g.setAttribute('filter', 'url(#' + fid + ')');
  svg.insertBefore(g, kids[0]);
  for (i = 0; i < kids.length; i++) g.appendChild(kids[i]);
  svg.insertAdjacentHTML('afterbegin', '<defs class="dent-fxd"><filter id="' + fid + '" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
    + '<feGaussianBlur in="SourceAlpha" stdDeviation="' + (occ ? 1.3 : 1.9) + '"/><feOffset dy="' + (occ ? 1.6 : 2.4) + '" result="b"/>'
    + '<feFlood class="dent-fxc" flood-color="#000" flood-opacity=".15"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>');
}
function dentBannerHtml(units) {
  return units.map(function (u) {
    var c = dentColors(u.key), hex = /^#[0-9a-fA-F]{6}$/.test(c.fill);
    var full = dentIsFullSet(u.teeth, u.arch);
    var st = (u.st && u.st !== 'completed') ? ' · ' + escapeHtml((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[u.st]) || u.st) : '';
    return '<span class="ortho-chip dent-chip" style="color:' + c.fill + ';' + (hex ? 'background:' + c.fill + '1a;border-color:' + c.fill + '55;' : '') + '">'
      + escapeHtml(dentUnitName(u)) + ' · ' + dentArchLabel(u.arch) + ' · ' + (full ? 'كامل' : dentTeethWord(u.teeth.length)) + st
      + (dentOpenExtractions(u.teeth).length ? ' · فوري' : '') + escapeHtml(dentOptBadgeText(dentSessionOfUnit(u))) + dentClaspChip(u) + '</span>';
  }).join('');
}
/* v739: أسنانُ الضمّات بشريحة الجهاز — عقدةُ نصٍّ مستقلة (الفاصلُ من CSS) كي يبقى نصُّ الشريحة الأصلي كما يعرفه القاموس */
function dentClaspChip(u) {
  var cl = dentClasps(u);
  return cl.length ? '<span class="dent-clasps">' + (cl.length === 1 ? 'ضمّة: ' : 'ضمّات: ') + cl.slice().sort(function (a, b) { return a - b; }).join('، ') + '</span>' : '';
}
function dentClaspTipRow(u) {
  return '<div class="tip-row dent-tip-clasp"><span class="tip-dot" style="background:' + DENT_STEEL + '"></span><b>ضمّة:</b> ' + escapeHtml(dentUnitName(u)) + '</div>';
}
/* الزرعةُ المخطّطة على هذا السن وسمُها بالخطة يخالف وسمَ جلسة هذا الجهاز ⇒ هما بديلان لا تركيبٌ واحد */
function dentImplantIsRival(n, u) {
  if (typeof planOptOf !== 'function' || typeof sessions === 'undefined' || !sessions) return false;
  var o = planOptOf(dentSessionOfUnit(u));
  if (!o) return false;
  var tn = String(n);
  return sessions.some(function (x) {
    if (!dentPlannedOf(x) || String(x.tooth_num || '') !== tn || !dentIsImplantSess(x)) return false;
    var xo = planOptOf(x); return !!xo && xo !== o;
  });
}
/* v719: زرعةٌ يركب عليها جهاز — تاجُها (المسارُ المقصوص بمنطقة التاج) يُخفى والبرغي يبقى؛ وبالمنظر الإطباقي يُخفى رسمُ الزرعة كلُّه
   فيظهر سنُّ الجهاز وحده. الإخفاءُ على DOM المرسوم فقط: renderTeeth يعيد بناء الخلية، فإزالةُ الجهاز تعيد التاج بلا أي كتابة. */
function dentHideImplantCrown(svg) {
  var ps = svg.querySelectorAll('path[clip-path^="url(#cclip"]');
  for (var i = 0; i < ps.length; i++) { ps[i].setAttribute('display', 'none'); ps[i].setAttribute('data-dent-hidden', '1'); }
}
function dentHideOccImplant(osvg) {
  for (var i = 0; i < osvg.children.length; i++) {
    var c = osvg.children[i], tag = (c.tagName || '').toLowerCase();
    if (tag === 'defs' || tag === 'title' || (c.classList && c.classList.contains('dent-layer'))) continue;
    c.setAttribute('display', 'none'); c.setAttribute('data-dent-hidden', '1');
  }
}
/* ج2-ب: الجهازُ المعلّق (بديل/تبديل) لا رسمَ له — يُسمّى بشريط الأجهزة (إطارٌ متقطّع) وبتلميح كل سنٍّ من أسنانه */
function dentPendingLabel(s) { return dentPendingKind(s) === 'alt' ? 'بديل' : 'تبديل عند الإنجاز'; }
function dentPendingBannerHtml(pend) {
  return pend.map(function (s) {
    var c = dentColors(dentSessKey(s)), teeth = dentSessTeeth(s), arch = (s.arch === 'U' || s.arch === 'L') ? s.arch : dentArchOf(teeth[0]);
    return '<span class="ortho-chip dent-chip dent-chip-pend" data-dent-pending="' + escapeHtml(String(s.id)) + '" style="color:' + c.fill + ';border-style:dashed;border-color:' + c.fill + ';">'
      + escapeHtml(s.type || 'جهاز متحرك') + ' · ' + dentArchLabel(arch) + ' · ' + (dentIsFullSet(teeth, arch) ? 'كامل' : dentTeethWord(teeth.length))
      + ' · مخطط — ' + dentPendingLabel(s) + escapeHtml(dentOptBadgeText(s)) + '</span>';
  }).join('');
}
function dentPendingTipRow(s) {
  var c = dentColors(dentSessKey(s));
  return '<div class="tip-row dent-tip-pend" data-dent-pending="' + escapeHtml(String(s.id)) + '"><span class="tip-dot" style="background:' + escapeHtml(c.fill) + '"></span><b>جهاز مخطّط ('
    + dentPendingLabel(s) + '):</b> ' + escapeHtml(s.type || 'جهاز متحرك') + escapeHtml(dentOptBadgeText(s)) + '</div>';
}
function dentPaintPendingTips(pend) {
  pend.forEach(function (s) {
    dentSessTeeth(s).forEach(function (n) {
      ['.tooth-cell[data-tooth-cell="' + n + '"]', '.occ-cell[data-occ-cell="' + n + '"]'].forEach(function (sel) {
        var cell = document.querySelector(sel), tip = cell ? cell.querySelector('.tooth-tip') : null;
        if (!tip) return;
        var had = tip.querySelectorAll('.dent-tip-pend');
        for (var i = 0; i < had.length; i++) { if (had[i].getAttribute('data-dent-pending') === String(s.id)) return; }
        tip.insertAdjacentHTML('beforeend', dentPendingTipRow(s));
      });
    });
  });
}
/* طبقةُ هذه الوحدة على هذه الخلية إن رُسمت (الرسمُ لا يتكرّر لو استُدعي مرتين بلا إعادة بناء) */
function dentLayerOf(svg, u) {
  var id = String(u.id || u.key), gs = svg.querySelectorAll('g.dent-layer');
  for (var i = 0; i < gs.length; i++) { if (gs[i].getAttribute('data-dent-unit') === id) return gs[i]; }
  return null;
}
/* تُستدعى آخرَ renderTeeth. بلا أي جهاز ⇒ لا تُضيف ولا تُزيل شيئاً (صفر أثر على مخططٍ بلا جهاز). */
function dentPaint() {
  var units = dentUnits();
  var pend = units.length ? dentPendingSessions() : [];   /* المعلّقُ لا يوجد إلا فوق جهازٍ مرسوم — بلا جهاز: صفر أثر */
  var bar = document.getElementById('dentureBanner');
  if (bar) { bar.innerHTML = units.length ? dentBannerHtml(units) + dentPendingBannerHtml(pend) : ''; bar.style.display = units.length ? 'flex' : 'none'; }
  if (!units.length) return;
  if (bar && window.SyDentSvc) window.SyDentSvc.decorate(bar, units);   /* ج4-أ: الشريحةُ تفتح خدماتِ جهازها */
  dentPaintPendingTips(pend);
  units.forEach(function (u) {
    var clasps = dentClasps(u), cx = dentCtx(u, clasps), row = cx.row, uid = String(u.id || u.key);
    if (cx.lo < 0) return;
    for (var i = cx.lo; i <= cx.hi; i++) {
      var n = row[i], inUnit = cx.has(n);
      var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + n + '"]');
      var svg = cell ? cell.querySelector('svg.tooth-shape') : null;
      /* ج2-أ: السنُّ الصناعي يُرسم على شبح السن المقلوع؛ فوق دمية جسر (بديلٌ بالخطة) تُرسم القاعدةُ فقط.
         v719 (بلاغُ المالك 14/11/2026): الجهازُ يركب على الزرعة نفسها — لا تاجَ للزرعة تحته ⇒ يُخفى تاجُها ويُرسم سنُّ الجهاز فوق برغيها */
      var ghost = !!(cell && cell.classList.contains('extract-cell'));
      /* v721: زرعةٌ هي **بديلُ** الجهاز بالخطة (وسمان مختلفان) تبقى بتاجها والقاعدةُ وحدها فوقها — كدمية الجسر */
      var onImplant = !!(cell && cell.classList.contains('implant-cell')) && !dentImplantIsRival(n, u);
      if (svg && !dentLayerOf(svg, u)) {
        cell.classList.add('dent-in');
        dentFlatten(svg, false, n);
        /* v739: داخل الجهاز الطبقةُ فوق الرسم؛ وعلى سنٍّ قائم ضمن الامتداد الواصلُ **خلف** السن (يُدرج قبل رسمه) */
        svg.insertAdjacentHTML(inUnit ? 'beforeend' : 'afterbegin', dentFacialLayer(n, cx, inUnit, !(ghost || onImplant)));
      }
      var oc = document.querySelector('.occ-cell[data-occ-cell="' + n + '"]');
      var osvg = oc ? oc.querySelector('svg.tooth-shape') : null;
      var toothToo = inUnit && (ghost || onImplant);
      /* v739: الجزئي يرسم قاعدتَه وصفيحتَه إطباقياً بكل خلايا امتداده؛ الكامل سنُّه الصناعي وحده كما كان (قرارُ المالك) */
      if (osvg && (cx.partial || toothToo) && !dentLayerOf(osvg, u)) {
        if (cx.partial) { oc.classList.add('dent-in'); dentFlatten(osvg, true, n); }
        if (inUnit && onImplant) dentHideOccImplant(osvg);
        var oh = dentOccLayer(n, cx, inUnit, toothToo);
        if (oh) osvg.insertAdjacentHTML(toothToo ? 'beforeend' : 'afterbegin', oh);
      }
      if (!inUnit) continue;
      if (onImplant && svg) dentHideImplantCrown(svg);
      /* v711 (قرارُ المالك 13/11/2026): السنُّ الذي يعوّضه الجهاز لا يحمل نقطةَ «موجود مسبقاً» الرمادية — 14 نقطةً فوق جهازٍ كامل
         زحمةٌ بلا معلومة (الجهازُ نفسه يقول إن الفك أدرد). نقاطُ المخطّط/المحوّل/المراقبة تبقى. */
      var dot = cell ? cell.querySelector('.tooth-status-badge.status-existing_other, .tooth-status-badge.status-existing_current, .tooth-status-badge.status-existing') : null;
      if (dot) dot.remove();
      var tip = cell ? cell.querySelector('.tooth-tip') : null;
      if (tip) { if (!tip.querySelector('.dent-tip')) tip.insertAdjacentHTML('afterbegin', dentTipRow(u, n)); }
      else if (cell && !cell.hasAttribute('data-dent-title')) {
        /* خليةُ الزرعة بلا تلميحٍ داكن (عنوانُ المتصفح وحده) ⇒ الجهازُ يُسمّى بالعنوان نفسه */
        cell.setAttribute('title', (cell.getAttribute('title') || ('السن ' + n)) + ' · جهاز متحرك: ' + dentUnitName(u));
        cell.setAttribute('data-dent-title', '1');
      }
      var otip = oc ? oc.querySelector('.tooth-tip') : null;
      if (otip && !otip.querySelector('.dent-tip')) otip.insertAdjacentHTML('afterbegin', dentTipRow(u, n));
    }
    /* v739: الضمّات — فوق السن الداعم بالمنظرين، وسطرٌ بتلميحه */
    clasps.forEach(function (t) {
      var ti = row.indexOf(t), best = null, bd = 99;
      u.teeth.forEach(function (x) { var d = Math.abs(row.indexOf(x) - ti); if (d < bd) { bd = d; best = x; } });
      var near = row.indexOf(best) > ti ? 'L' : 'R', adj = cx.has(cx.left(t)) || cx.has(cx.right(t));
      var has = function (sv) { var gs = sv.querySelectorAll('g.dent-clasp'); for (var k = 0; k < gs.length; k++) { if (gs[k].getAttribute('data-dent-unit') === uid) return true; } return false; };
      var fc = document.querySelector('.tooth-cell[data-tooth-cell="' + t + '"]'), fs = fc ? fc.querySelector('svg.tooth-shape') : null;
      if (fs && !has(fs)) fs.insertAdjacentHTML('beforeend', dentLayerHtml(u, 'dent-clasp', dentClaspFacial(t, cx, near, adj, u.st), u.arch === 'U' ? 'translate(0,210) scale(1,-1)' : ''));
      var occ = document.querySelector('.occ-cell[data-occ-cell="' + t + '"]'), os = occ ? occ.querySelector('svg.tooth-shape') : null;
      if (os && !has(os)) os.insertAdjacentHTML('beforeend', dentLayerHtml(u, 'dent-clasp', dentClaspOcc(t, cx, near, adj, u.st), ''));
      [fc, occ].forEach(function (cl) {
        var tp = cl ? cl.querySelector('.tooth-tip') : null;
        if (tp && !tp.querySelector('.dent-tip-clasp')) tp.insertAdjacentHTML('beforeend', dentClaspTipRow(u));
      });
    });
  });
}

/* الواجهةُ التي تقرؤها باقي ملفات الصفحة — كلُّ نداءٍ لها محروسٌ بوجودها (window.SyDenture &&) */
window.SyDenture = {
  SURFACE: DENT_SURFACE,
  isTp: dentIsTp, isTreatment: dentIsTreatment, isKey: dentIsKey,
  reset: dentReset, take: dentTake, histBegin: dentHistBegin, histEnd: dentHistEnd,
  has: dentHas, unitOf: dentUnitOf, units: dentUnits, areaText: dentAreaText,
  openPicker: dentOpenPicker, openEdentulous: dentOpenEdentulous, pickerActive: dentPickerActive, pickerReset: dentPickerReset, confirmPick: dentConfirmPick, clearPending: dentClearPending,
  saveReady: dentSaveReady, save: dentSave,
  removeBtnHtml: dentRemoveBtnHtml,
  onSessionComplete: dentOnSessionComplete, onSessionDeleted: dentOnSessionDeleted, examUndo: dentExamUndo,
  completeNote: dentCompleteNote, sessWhere: dentSessWhere, sessClasp: dentSessClasp, claspPhrase: dentClaspPhrase, printLine: dentPrintLine,
  markDrawFail: dentMarkDrawFail, drawFailed: dentDrawFailed, clearDrawFail: dentClearDrawFail,   /* v737 */
  isImmediate: function (s) { return dentOpenExtractions(dentSessTeeth(s)).length > 0; },   /* ج3-أ: قالبُ مراحل المخبر للجهاز الفوري */
  restoreMissing: dentRestoreMissing,
  onFixedSessionSaved: dentOnFixedSessionSaved, settlePending: dentSettlePending, pendingSessions: dentPendingSessions,
  paint: dentPaint,
  /* v739 (M209): الضمّات */
  isPartialUnit: dentIsPartialUnit, clasps: dentClasps, claspAuto: dentClaspAuto, claspOk: dentClaspOk, claspIsAuto: dentClaspIsAuto, claspSave: dentClaspSave, claspToggle: dentClaspToggle,
  map: function () { return dentureMap; }
};
