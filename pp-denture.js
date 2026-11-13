/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — pp-denture.js (M202): التعويضات المتحركة — الإصدار ج1
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

   قيودُ ج1 (تُرفع بـج2 مع البدائل أ/ب/ج والجهاز الفوري وفوق الزرعات):
   • السنُّ الذي يحمل جهازاً لا يقبل زرعةً ولا جسراً، ولا يُلغى قلعُه قبل إزالة الجهاز.
   • الجهازُ الجزئي على أسنانٍ مقلوعة فعلاً (لا قلعٍ مخطّط)، والكاملُ على فكٍّ بلا زرعاتٍ ولا جسور.
   ═══════════════════════════════════════════════════════════════════════════ */

var DENT_SURFACE = 'DENTURE';
/* أسنانُ الجهاز الكامل: من الرحى الثانية إلى الرحى الثانية (أرحاءُ العقل لا تُعوَّض) */
var DENT_FULL_TEETH = {
  U: [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27],
  L: [47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37]
};
/* مستوى قاعدة الجهاز بإحداثيات خلية السن (viewBox 0 0 100 210، قبل قلب الفك العلوي):
   أعمقُ حدٍّ مينائي-ملاطي بالتشريح = 80 ⇒ الرابطُ على 90 لا يمسّ سطوحَ تاج سنٍّ قائم. */
var DENT_BASE_BOTTOM = 97;
var DENT_CONN_Y = 90;
/* امتدادُ القاعدة نحو الجار = نصفُ الفراغ بين الخليتين بالضبط (+ε) — القاعدتان تتلاقيان بلا تراكب (التراكبُ يُغمّق اللونَ
   الشفّاف عند كل وصلة). القيمُ مرآةُ patient-profile.css (.jaw-row gap · .midline) ويحرسها prove-denture. */
var DENT_ROW_GAP_PX = { permanent: 4, mixed: 7, primary: 11 };
var DENT_MIDLINE_PX = 14;   // عرضُ الخط الناصف (2) + هامشاه (6 + 6)
var DENT_BLEED_EPS = 0.15;

var dentureMap = {};        // سن → { key, st, unit, prov } — الحيّ
var _dentLiveRef = null;    // الخريطةُ الحيّة أثناء العرض التاريخي
var pendingDenture = null;  // سياقُ المنتقي/الخطوة الثانية (يُستهلك عند الحفظ)

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
    unit: row.unit_id || null, prov: row.provider_id || null
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
    if (!groups[gid]) { groups[gid] = { id: d.unit || null, key: d.key, st: d.st, arch: arch, teeth: [] }; order.push(gid); }
    groups[gid].teeth.push(parseInt(tn, 10));
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

/* ── حالةُ السن أمام الجهاز: هل يقبل أن يُعوَّض؟ ── */
function dentToothState(n) {
  var sm = teethMap[String(n)] || {};
  if (dentHas(n)) return { ok: false, block: true, why: 'عليه جهاز متحرك مسجّل' };
  if (typeof isImplant === 'function' && isImplant(n)) return { ok: false, block: true, why: 'مزروع' };
  if (isBridgeKey(sm.PONTIC) || isBridgeKey(sm.WHOLE)) return { ok: false, block: true, why: 'ضمن جسر' };
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(n)) return { ok: false, block: true, why: 'عليه حافظ مسافة' };
  if (typeof isExtractionPlanned === 'function' && isExtractionPlanned(n)) return { ok: false, block: true, why: 'قلعه مخطّط — أنجز القلع أولاً' };
  if (typeof isExtractionDone === 'function' && isExtractionDone(n)) return { ok: true, missing: true, why: 'مفقود' };
  return { ok: false, standing: true, why: 'سن قائم — سجّل قلعه أولاً' };
}
/* فحصُ فكٍّ للجهاز الكامل: موانعُ (زرعة/جسر/جهاز/قلعٌ مخطّط…) + الأسنانُ القائمة التي تُعلَّم مفقودة */
function dentFullCheck(arch) {
  var blockers = [], standing = [];
  DENT_FULL_TEETH[arch].forEach(function (t) {
    var s = dentToothState(t);
    if (s.block) blockers.push({ t: t, why: s.why });
    else if (s.standing) standing.push(t);
  });
  return { blockers: blockers, standing: standing };
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
  if (kind === 'partial') {
    /* الفكُّ الافتراضي: الذي فيه مفقودٌ يقبل التعويض (العلوي أولاً)؛ والمفقودُ محدَّدٌ مسبقاً عدا أرحاء العقل */
    var pick = null;
    ['U', 'L'].forEach(function (a) { if (!pick && dentSelectable(a).length) pick = a; });
    pendingDenture.arch = pick || 'U';
    pendingDenture.teeth = dentDefaultTeeth(pendingDenture.arch);
  }
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
function dentDefaultTeeth(arch) {
  return dentSelectable(arch).filter(function (t) { return (t % 10) !== 8; });
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
      var sel = pd.kind === 'full' ? pd.arches.indexOf(a) !== -1 : pd.arch === a;
      h += '<button type="button" data-dent-arch="' + a + '" onclick="dentArchToggle(\'' + a + '\')" style="' + base + (sel ? on : off) + '">' + dentArchLabel(a) + '</button>';
    });
    if (pd.kind === 'full') {
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
        g += '<button type="button" class="nse-t dent-t' + (s.ok ? (isOn ? ' dent-on' : ' dent-miss') : ' dent-off') + '" data-dent-tooth="' + t + '" title="' + escapeHtml(s.why || '') + '"'
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
      else lines.push('<div>المحدَّد: <b>' + pd.teeth.length + '</b> ' + (pd.teeth.length === 1 ? 'سن' : 'أسنان') + ' — انقر السن لإضافته أو استبعاده. الباهتُ لا يقبل التعويض (انقره لمعرفة السبب).</div>');
    } else {
      if (!pd.arches.length) lines.push('<div>اختر فكاً واحداً على الأقل.</div>');
      pd.arches.forEach(function (a) {
        var c = dentFullCheck(a);
        if (c.blockers.length) {
          lines.push('<div class="dent-note-warn"><b>' + dentArchLabel(a) + ':</b> لا يقبل جهازاً كاملاً — '
            + c.blockers.map(function (b) { return b.t + ' (' + escapeHtml(b.why) + ')'; }).join('، ') + '. سجّله جهازاً جزئياً على الأسنان المفقودة.</div>');
        } else if (c.standing.length) {
          lines.push('<div><b>' + dentArchLabel(a) + ':</b> ' + c.standing.length + ' ' + (c.standing.length === 1 ? 'سن قائم' : 'أسنان قائمة') + ' بالمخطط ('
            + c.standing.join('، ') + ') — يُسأل عن تعليمها «مفقودة مسبقاً» عند المتابعة.</div>');
        } else lines.push('<div><b>' + dentArchLabel(a) + ':</b> كلُّ أسنانه مفقودة ✓</div>');
      });
    }
    note.innerHTML = lines.join('');
  }
}
function dentArchToggle(a) {
  var pd = pendingDenture; if (!pd) return;
  if (pd.kind === 'full') {
    var i = pd.arches.indexOf(a);
    if (i === -1) pd.arches.push(a); else pd.arches.splice(i, 1);
    pd.arches.sort(function (x, y) { return x === 'U' ? -1 : (y === 'U' ? 1 : 0); });
  } else if (pd.arch !== a) {
    pd.arch = a; pd.teeth = dentDefaultTeeth(a);
  }
  dentPickerRender();
}
function dentArchBoth() {
  var pd = pendingDenture; if (!pd || pd.kind !== 'full') return;
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

/* «متابعة» بالمنتقي: يبني الوحدات ويتحقّق، ثم الخطوةُ الثانية (أو الحفظُ المباشر بالفحص الأولي) */
async function dentConfirmPick() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var pd = pendingDenture; if (!pd) return;
  var units = [];
  if (pd.kind === 'partial') {
    var teeth = pd.teeth.filter(function (t) { return dentToothState(t).ok; });
    if (!teeth.length) { showToast('⚠️ اختر سناً مفقوداً واحداً على الأقل'); return; }
    units.push({ arch: pd.arch, teeth: dentSortTeeth(teeth, pd.arch), mark: [] });
  } else {
    if (!pd.arches.length) { showToast('⚠️ اختر فكاً واحداً على الأقل'); return; }
    var toMark = [];
    for (var i = 0; i < pd.arches.length; i++) {
      var a = pd.arches[i], c = dentFullCheck(a);
      if (c.blockers.length) {
        showToast('⚠️ ' + dentArchLabel(a) + ' لا يقبل جهازاً كاملاً (السن ' + c.blockers[0].t + ': ' + c.blockers[0].why + ') — سجّله جهازاً جزئياً');
        return;
      }
      units.push({ arch: a, teeth: DENT_FULL_TEETH[a].slice(), mark: c.standing.slice() });
      toMark = toMark.concat(c.standing);
    }
    if (toMark.length) {
      var ok = await SyDialog.confirm({
        title: 'أسنان قائمة بالمخطط',
        message: 'الجهاز الكامل يُسجَّل على فكٍّ بلا أسنان، وعلى المخطط ' + toMark.length + ' ' + (toMark.length === 1 ? 'سن قائم' : 'أسنان قائمة') + ':\n'
          + toMark.join('، ') + '\n\nإن كانت مفقودةً فعلاً تُعلَّم «مفقودة مسبقاً» عند الحفظ (بلا جلسة ولا تكلفة).\nوإن كانت ستُقلع فارجع وسجّل قلعها أولاً.',
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
      if (s.block) return 'السن ' + t + ': ' + s.why;
      if (s.standing && u.mark.indexOf(t) === -1) return 'السن ' + t + ' قائم — أعد اختيار الأسنان';
    }
  }
  return '';
}
/* تعليمُ سنٍّ قائم «مفقوداً مسبقاً»: مسارُ القلع القائم نفسه (محوُ صفوف السن وحملُ حالاتها dx على صفّ القلع — v608) */
async function dentMarkMissing(teeth, providerId) {
  for (var i = 0; i < teeth.length; i++) {
    var tn = String(teeth[i]);
    var row = { doctor_id: currentUser.id, patient_id: patientId, tooth_num: tn, surface: 'WHOLE', treatment_key: 'extracted',
                status: 'existing_other', provider_id: providerId || null, review_at: null };
    var dx = await wipeToothAfterExtraction(tn, patientId);
    if (dx) row.dx_key = dx;
    var r = await upsertTeethStatusWithFallback(row, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
    if (r && r.error) { console.error('dentMarkMissing:', r.error); return 'السن ' + tn + ': ' + r.error.message; }
    if (!teethMap[tn]) teethMap[tn] = {};
    teethMap[tn].WHOLE = 'extracted';
    if (!teethMap[tn].__status) teethMap[tn].__status = {};
    teethMap[tn].__status.WHOLE = 'existing_other';
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
async function dentSave(cost, units, date, notes) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var pd = pendingDenture; if (!pd) return;
  var status = pendingTreatStatus, key = pd.key, label = pd.label;
  if (status === 'condition') { showToast('🩺 «مراقبة» لا تُسجَّل لجهازٍ متحرك — اختر منجز أو مخطّط أو موجود مسبقاً'); return; }
  var bad = dentRevalidate(pd);
  if (bad) { showToast('⚠️ تغيّر المخطط — ' + bad); return; }
  var billable = (status === 'completed' || status === 'planned');
  var made = [], firstSess = null, failMsg = '';
  for (var i = 0; i < pd.units.length; i++) {
    var u = pd.units[i], area = dentAreaText(u.arch, u.teeth);
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
        currency: window.SyDentCurPick.read('toothCost')
      };
      var rS = await window.sb.from('ledger_sessions').insert(payload).select().single();
      if (rS.error || !rS.data) { console.error('denture ledger insert error:', rS.error); failMsg = 'تسجيل الجلسة فشل' + (rS.error ? ': ' + rS.error.message : ''); break; }
      sess = rS.data; unitId = sess.id;
    } else unitId = dentUuid();
    var wErr = await dentWriteRows(u, key, status, unitId, pendingProviderId);
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
  } else {
    showToast('✅ تم تسجيل ' + label + ' — ' + areaAll + (made.length > 1 ? ' (جلسة لكل فك)' : ''));
  }
  if (status === 'completed' && firstSess && typeof maybePromptMaterialDeduction === 'function') {
    try { await maybePromptMaterialDeduction(key, label, made.length, made.map(function (m) { return m.sess ? m.sess.id : null; })); }
    catch (e) { console.warn('denture material deduction skipped:', e); }
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
    if (markNow.length) {
      var mErr = await dentMarkMissing(markNow, pendingProviderId);
      if (mErr) { showToast('⚠️ تعذّر تعليم الأسنان مفقودة (' + mErr + ')'); break; }
    }
    var wErr = await dentWriteRows(u, pd.key, status, dentUuid(), pendingProviderId);
    if (wErr) { showToast('⚠️ تعذّر حفظ الجهاز على المخطط (' + wErr + ')'); break; }
    done.push(dentAreaText(u.arch, u.teeth));
  }
  if (done.length && typeof examCount !== 'undefined') examCount += done.length;
  renderTeeth(); renderStats();
  if (typeof examSyncCount === 'function') examSyncCount();
  if (done.length) showToast('✓ ' + pd.label + ' — ' + done.join(' · ') + ' — للتراجع عنه أزله من الوضع العادي');
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
  if (!await SyDialog.confirm({ message: 'إزالة «' + name + '» (' + area + ')؟\nلن يتغيّر شيء آخر — الأسنان تبقى مفقودة كما هي.'
      + removalSessionsNote(pl.length, done.length), danger: true })) return;
  var teeth = u.teeth.map(String);
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('surface', DENT_SURFACE).in('tooth_num', teeth);
  var err = !!(d && d.error);
  if (err) console.error('remove denture rows error:', d.error);
  else teeth.forEach(function (tn) { delete dentureMap[tn]; });
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
    + 'title="يزيل الجهاز عن كل أسنانه — الأسنان تبقى مفقودة" onclick="dentRemoveUnit(' + parseInt(n, 10) + ')">🦷 إزالة «' + escapeHtml(dentUnitName(u)) + '»</button>';
}

/* ═════════════════════ خطّافاتُ الجلسة: الإنجاز والحذف ═════════════════════ */
/* إنجازُ جلسة الجهاز المخطّطة يقلب صفوفَ وحدتها (unit_id = معرّف الجلسة) — مرآتُه الدلالية بصفحة المواعيد */
async function dentOnSessionComplete(sess) {
  if (!sess || !sess.id) return false;
  var hit = Object.keys(dentureMap).filter(function (tn) { return dentureMap[tn].unit === sess.id && dentureMap[tn].st === 'planned'; });
  if (!hit.length) return false;
  var u = await window.sb.from('teeth_status').update({ status: 'completed', review_at: null })
    .eq('doctor_id', currentUser.id).eq('patient_id', sess.patient_id || patientId)
    .eq('unit_id', sess.id).eq('surface', DENT_SURFACE).eq('status', 'planned');
  if (u && u.error) { console.warn('dentOnSessionComplete warn:', u.error); return false; }
  hit.forEach(function (tn) { dentureMap[tn].st = 'completed'; });
  return true;
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
function dentTipRow(u) {
  var c = dentColors(u.key);
  return '<div class="tip-row dent-tip"><span class="tip-dot" style="background:' + escapeHtml(c.fill) + '"></span><b>جهاز متحرك:</b> '
    + escapeHtml(dentUnitName(u)) + dentStatusBadge(u.st) + '</div>';
}
/* خليةُ السن وجهياً: القاعدةُ (بلون إطار العلاج) + السنُّ الصناعي (بلون العلاج) على السن المعوَّض؛
   وعلى سنٍّ بين طرفَي الجهاز خطٌّ رابط فقط. الحالةُ بالشكل (txPaint/txPathAttrs — v595). */
/* امتدادٌ بوحدات الخلية (100 = عرضُها) نحو جارٍ يبعد فراغاً واحداً، أو فراغين وخطاً ناصفاً إن كان عبر المنتصف */
function dentBleed(n, acrossMidline) {
  var mode = (typeof dentitionMode !== 'undefined' && DENT_ROW_GAP_PX[dentitionMode]) ? dentitionMode : 'permanent';
  var gap = DENT_ROW_GAP_PX[mode], px = acrossMidline ? (DENT_MIDLINE_PX + 2 * gap) / 2 : gap / 2;
  var w = (typeof cellWidth === 'function' ? cellWidth(n) : 60) || 60;
  return Math.round((px * 100 / w + DENT_BLEED_EPS) * 100) / 100;
}
function dentFacialLayer(n, u, inUnit, bleedRight, bleedLeft, midRight, midLeft) {
  var c = dentColors(u.key), st = u.st, inner = '';
  var x1 = bleedLeft ? -dentBleed(n, midLeft) : 6, x2 = bleedRight ? 100 + dentBleed(n, midRight) : 94;
  if (inUnit) {
    var anat = toothAnatomy(n);
    var y = anat.cervicalY - 3;
    inner += txRectSvg(x1, y, x2 - x1, DENT_BASE_BOTTOM - y, txPaint(st, c.stroke, c.stroke, 'dnb' + n), null, 'class="dent-base"');
    var a = txPathAttrs(st, c.fill, c.stroke, 'dn' + n, 0.92);
    inner += a.defs + '<path class="dent-tooth" d="' + anat.outlineD + '" ' + a.attrs
      + (/stroke=/.test(a.attrs) ? '' : ' stroke="' + c.stroke + '" stroke-width="1.2"') + ' stroke-linejoin="round"/>';
  } else {
    inner += '<line class="dent-conn" x1="' + x1 + '" y1="' + DENT_CONN_Y + '" x2="' + x2 + '" y2="' + DENT_CONN_Y
      + '" stroke="' + c.stroke + '" stroke-width="3.2" stroke-linecap="butt"' + txRingDash(st) + '/>';
  }
  return '<g class="dent-layer" data-dent-unit="' + escapeHtml(u.id || u.key) + '" data-dent-key="' + escapeHtml(u.key) + '" data-dent-status="' + escapeHtml(st) + '" pointer-events="none"'
    + (u.arch === 'U' ? ' transform="translate(0,210) scale(1,-1)"' : '') + '>' + inner + '</g>';
}
function dentOccLayer(n, u) {
  var c = dentColors(u.key), G = occGeom(n);
  var a = txPathAttrs(u.st, c.fill, c.stroke, 'dno' + n, 0.92);
  return '<g class="dent-layer" data-dent-unit="' + escapeHtml(u.id || u.key) + '" data-dent-key="' + escapeHtml(u.key) + '" data-dent-status="' + escapeHtml(u.st) + '" pointer-events="none">' + a.defs
    + '<path class="dent-tooth" d="' + G.outline + '" ' + a.attrs + (/stroke=/.test(a.attrs) ? '' : ' stroke="' + c.stroke + '" stroke-width="1.2"') + ' stroke-linejoin="round"/></g>';
}
function dentBannerHtml(units) {
  return units.map(function (u) {
    var c = dentColors(u.key), hex = /^#[0-9a-fA-F]{6}$/.test(c.fill);
    var full = dentIsFullSet(u.teeth, u.arch);
    var st = (u.st && u.st !== 'completed') ? ' · ' + escapeHtml((typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[u.st]) || u.st) : '';
    return '<span class="ortho-chip dent-chip" style="color:' + c.fill + ';' + (hex ? 'background:' + c.fill + '1a;border-color:' + c.fill + '55;' : '') + '">'
      + escapeHtml(dentUnitName(u)) + ' · ' + dentArchLabel(u.arch) + ' · ' + (full ? 'كامل' : (u.teeth.length + ' ' + (u.teeth.length === 1 ? 'سن' : 'أسنان'))) + st + '</span>';
  }).join('');
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
  var bar = document.getElementById('dentureBanner');
  if (bar) { bar.innerHTML = units.length ? dentBannerHtml(units) : ''; bar.style.display = units.length ? 'flex' : 'none'; }
  if (!units.length) return;
  units.forEach(function (u) {
    var row = dentArchRow(u.arch);
    var idx = u.teeth.map(function (t) { return row.indexOf(t); }).filter(function (i) { return i >= 0; });
    if (!idx.length) return;
    var lo = Math.min.apply(null, idx), hi = Math.max.apply(null, idx), mid = row.length / 2;
    for (var i = lo; i <= hi; i++) {
      var n = row[i], inUnit = u.teeth.indexOf(n) !== -1;
      /* الصفُّ يُرسم من اليمين إلى اليسار: الجارُ السابق بالمصفوفة على اليمين، واللاحقُ على اليسار */
      var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + n + '"]');
      var svg = cell ? cell.querySelector('svg.tooth-shape') : null;
      if (svg && !dentLayerOf(svg, u)) svg.insertAdjacentHTML('beforeend', dentFacialLayer(n, u, inUnit, i > lo, i < hi, i === mid, i === mid - 1));
      if (!inUnit) continue;
      var tip = cell ? cell.querySelector('.tooth-tip') : null;
      if (tip && !tip.querySelector('.dent-tip')) tip.insertAdjacentHTML('afterbegin', dentTipRow(u));
      var oc = document.querySelector('.occ-cell[data-occ-cell="' + n + '"]');
      var osvg = oc ? oc.querySelector('svg.tooth-shape') : null;
      if (osvg && !dentLayerOf(osvg, u)) osvg.insertAdjacentHTML('beforeend', dentOccLayer(n, u));
      var otip = oc ? oc.querySelector('.tooth-tip') : null;
      if (otip && !otip.querySelector('.dent-tip')) otip.insertAdjacentHTML('afterbegin', dentTipRow(u));
    }
  });
}

/* الواجهةُ التي تقرؤها باقي ملفات الصفحة — كلُّ نداءٍ لها محروسٌ بوجودها (window.SyDenture &&) */
window.SyDenture = {
  SURFACE: DENT_SURFACE,
  isTp: dentIsTp, isTreatment: dentIsTreatment, isKey: dentIsKey,
  reset: dentReset, take: dentTake, histBegin: dentHistBegin, histEnd: dentHistEnd,
  has: dentHas, unitOf: dentUnitOf, units: dentUnits, areaText: dentAreaText,
  openPicker: dentOpenPicker, pickerActive: dentPickerActive, pickerReset: dentPickerReset, confirmPick: dentConfirmPick, clearPending: dentClearPending,
  saveReady: dentSaveReady, save: dentSave,
  removeBtnHtml: dentRemoveBtnHtml,
  onSessionComplete: dentOnSessionComplete, onSessionDeleted: dentOnSessionDeleted,
  paint: dentPaint,
  map: function () { return dentureMap; }
};
