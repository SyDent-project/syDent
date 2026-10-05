/* ═══ pp-dental.js — SyDent decomposition extraction #9 ═══
 * محرّك مخطط الأسنان الكامل + المعالجة الإقليمية + سجل الزرعة.
 * نُقل بايت-بايت بست قصّات من patient-profile.html (commit 3de7072):
 * D1a 3327-3427 · D1b 3453-5606 · D1c 5678-6007 · D1d 6155-7057 · D2 7290-8526 · D3 12342-12576.
 * الجيوب المستبقاة inline عمداً: جذوع الربط DOM (dentition/tip/occ/status-filter IIFEs)،
 * جذعا exam/batch (سابقة الاستخراجين ٣/٤)، بلوك history كاملاً، وجيب flags/escapeHtml (مرايا G/F).
 * تعريفات صرفة + var حالة — صفر تنفيذ top-level. تُحمَّل بالـ<head> بعد pp-clinical.js. */
/* ── حالةُ وحدةِ الجسر/حافظ المسافة (تصريحٌ صريح) ──────────────────────────
   كان الاسمان يُنشآن كـ**عالميّين ضمنيّين** بالإسناد داخل persistSpecialTreatment
   (السطران 4081 و4147) ويُعاد تصفيرهما دفاعياً بـpp-modules.js. يعمل بالوضع
   غير الصارم لكنه ينكسر تحت 'use strict'، ولا يراه أي محلّلٍ ساكن — وهو الصنف
   نفسه الذي أوصل باغاً إلى المستخدم مرّتين بطبقة الأدمن (حارس النطاقات، 5 آب).

   ⚠️ التصريح **بلا قيمة ابتدائية** عمداً: `var x;` لا يدوس ربطاً قائماً، بينما
   `var x = null;` كان سيدوس تصفير pp-modules.js لو سبق تحميلَه. والأثر الدلالي
   صفر: القراءات كلها داخل persistSpecialTreatment بعد إسنادها مباشرةً، وsave
   ToothTreatment تحجبهما بمتغيّرين محليّين من _sp — فلا تتغيّر قيمةٌ ولا مسار.

   لم يُنقَلا إلى نطاق persistSpecialTreatment المحلي رغم أنه الأنظف: ذلك تغييرٌ
   دلاليّ حقيقيّ بطبقةٍ مالية، وهذا التصريح يحقّق الغرض (صرامة + قابلية تحليل)
   بمخاطرةٍ صفر. */
var bridgeUnitForLedger, spacerUnitForLedger;

/* ── TOOTH CHART ──
   Clinician-facing orientation: quadrants 1 (11-18) and 4 (41-48) render on the
   LEFT half, quadrants 2/3 on the RIGHT. The rows are laid out RTL, so the array
   order is reversed relative to the visual order (array[0] → rightmost). */
var UPPER_T = [28,27,26,25,24,23,22,21,11,12,13,14,15,16,17,18];
var LOWER_T = [38,37,36,35,34,33,32,31,41,42,43,44,45,46,47,48];

/* ═══════════════ Primary / mixed dentition (additive) ═══════════════
   FDI primary 51-85. Stored per-patient in patients.dentition_mode +
   patients.primary_teeth (Migration 56 — both nullable → graceful). The chart
   engine below reads activeUpper()/activeLower() instead of the raw permanent
   arches, so primary & mixed render with no other changes. */
var UPPER_P = [65,64,63,62,61, 51,52,53,54,55];
var LOWER_P = [75,74,73,72,71, 81,82,83,84,85];
function isPrimaryTooth(num){ var q = Math.floor(parseInt(num,10)/10); return q >= 5 && q <= 8; }
function normQuad(num){ var q = Math.floor(parseInt(num,10)/10); return (q >= 5 && q <= 8) ? q - 4 : q; }
function isFlippable(num){ var p = parseInt(num,10) % 10; return p >= 1 && p <= 5; }
function primaryOf(permNum){ return parseInt(permNum,10) + 40; }
function permOf(num){ num = parseInt(num,10); return num >= 51 ? num - 40 : num; }
function defaultMixedFlips(){ var f = {}; [13,14,15,23,24,25,33,34,35,43,44,45].forEach(function(p){ f[p] = 'primary'; }); return f; }
var flipState = {};                     // { permPosition: 'primary' } — mixed only
var dentitionMode = 'permanent';        // 'permanent' | 'primary' | 'mixed'
function mapMixed(permArch){ return permArch.map(function(pn){ return (isFlippable(pn) && flipState[pn] === 'primary') ? primaryOf(pn) : pn; }); }
function activeUpper(){ return dentitionMode === 'primary' ? UPPER_P : dentitionMode === 'mixed' ? mapMixed(UPPER_T) : UPPER_T; }
function activeLower(){ return dentitionMode === 'primary' ? LOWER_P : dentitionMode === 'mixed' ? mapMixed(LOWER_T) : LOWER_T; }
function archOf(num){
  num = parseInt(num,10);
  var au = activeUpper(), al = activeLower();
  if (au.indexOf(num) >= 0) return au;
  if (al.indexOf(num) >= 0) return al;
  if (UPPER_T.indexOf(num) >= 0) return UPPER_T;
  if (LOWER_T.indexOf(num) >= 0) return LOWER_T;
  if (UPPER_P.indexOf(num) >= 0) return UPPER_P;
  if (LOWER_P.indexOf(num) >= 0) return LOWER_P;
  var qn = normQuad(num); return (qn === 1 || qn === 2) ? au : al;
}
/* Click a tooth NUMBER in mixed mode → flip that position primary↔permanent. */
function toggleToothDentition(num){
  num = parseInt(num,10);
  if (!isFlippable(num)) { if (typeof showToast === 'function') showToast('السن ' + num + ' رحى دائمة — لا يوجد لها سن لبني مقابل'); return; }
  var pp = permOf(num);
  if (flipState[pp] === 'primary') delete flipState[pp]; else flipState[pp] = 'primary';
  renderTeeth(); saveDentitionState();
}
/* Persist dentition to the patient row (graceful if Migration 56 not applied yet). */
async function saveDentitionState(){
  if (!patient) return;
  // M141-ب: وضعُ القراءة — تبديلُ الإطباق عرضٌ محلّي بلا حفظ (ولا تنبيه: ليس فعلَ كتابةٍ مقصوداً)
  if (window.SyDentSub && window.SyDentSub.isReadOnly()) return;
  var pt = (dentitionMode === 'mixed')
    ? JSON.stringify(Object.keys(flipState).filter(function(k){ return flipState[k] === 'primary'; }).map(function(k){ return primaryOf(k); }))
    : null;
  patient.dentition_mode = dentitionMode; patient.primary_teeth = pt;
  try {
    await window.sb.from('patients').update({ dentition_mode: dentitionMode, primary_teeth: pt })
      .eq('id', patientId).eq('doctor_id', currentUser.id);
  } catch (e) { /* graceful: columns added by Migration 56 */ }
}
/* Load saved dentition, or derive a default from the patient's age. */
function loadDentitionState(){
  if (!patient) return;
  var m = patient.dentition_mode;
  if (m === 'permanent' || m === 'primary' || m === 'mixed') {
    dentitionMode = m; flipState = {};
    if (m === 'mixed') {
      var arr = []; try { arr = JSON.parse(patient.primary_teeth || '[]') || []; } catch (e) { arr = []; }
      if (arr.length) arr.forEach(function(n){ flipState[permOf(n)] = 'primary'; });
      else flipState = defaultMixedFlips();
    }
  } else {
    var age = (patient.dob && typeof calcAge === 'function') ? parseInt(calcAge(patient.dob),10) : NaN;
    if (!isNaN(age) && age <= 6) { dentitionMode = 'primary'; flipState = {}; }
    else if (!isNaN(age) && age <= 12) { dentitionMode = 'mixed'; flipState = defaultMixedFlips(); }
    else { dentitionMode = 'permanent'; flipState = {}; }
  }
  var jw = document.getElementById('jawWrap'); if (jw) jw.setAttribute('data-dent', dentitionMode);
  // Adults in permanent dentition don't need the primary/mixed toggle — hide it and offer a
  // small "show options" link instead (escape hatch for the rare retained-primary or
  // young-adult-ortho case, so nobody is ever locked out). Still shown outright for children,
  // unknown age, or anyone already in mixed/primary. No data change either way.
  var _dseg = document.getElementById('dentSeg');
  var _dshow = document.getElementById('dentSegShow');
  if (_dseg) {
    var _ADULT_DENT_AGE = 16;   // age ≥ this hides the toggle (adjustable)
    var _dage = (patient.dob && typeof calcAge === 'function') ? parseInt(calcAge(patient.dob), 10) : NaN;
    var _dhide = !isNaN(_dage) && _dage >= _ADULT_DENT_AGE && dentitionMode === 'permanent';
    _dseg.style.display = _dhide ? 'none' : '';
    if (_dshow) _dshow.style.display = _dhide ? 'block' : 'none';
  }
  syncDentSeg();
}
function syncDentSeg(){
  var seg = document.getElementById('dentSeg');
  if (seg) { var bs = seg.querySelectorAll('button'); for (var i=0;i<bs.length;i++) bs[i].classList.toggle('active', bs[i].getAttribute('data-dent') === dentitionMode); }
  var h = document.getElementById('mixHint'); if (h) h.style.display = (dentitionMode === 'mixed') ? 'block' : 'none';
}
/* Escape hatch: reveal the dentition toggle for an adult whose segment was auto-hidden
   (e.g. a retained primary tooth, or a young adult still in active ortho). Stays visible
   for the rest of the session; re-collapses on next load if mode is still permanent. */
function showDentSeg(){
  var s = document.getElementById('dentSeg'); if (s) s.style.display = '';
  var b = document.getElementById('dentSegShow'); if (b) b.style.display = 'none';
}

/* ─── D1b ─── */



/* ═══════════════ Orthodontics overlay (reads the live `sessions`) ═══════════════
   A regional ortho session = a ledger_sessions row with tooth_num null whose
   `type` (treatment name) matches a TREATMENTS entry of category 'orthodontics'.
   Scope: arch 'U'/'L', quadrant 'UR/UL/LR/LL', or mouth (both null = both arches).
   Brackets + archwire are drawn inside buildTooth (gated on orthoColorForArch) —
   defining these functions activates that previously-dormant code. */
function orthoTreatmentNames(){
  var m = {};
  if (typeof TREATMENTS !== 'undefined' && TREATMENTS) {
    for (var i=0;i<TREATMENTS.length;i++){
      var t = TREATMENTS[i];
      // Robust: an orthodontics treatment by category OR by name/key (so a clinic
      // that left the category as 'أخرى' on a "تقويم" treatment still renders it).
      var isOrtho = ((t.category || '') === 'orthodontics') || /تقويم|ortho/i.test((t.id || '') + ' ' + (t.name || ''));
      if (isOrtho) m[t.name] = t;
    }
  }
  return m;
}
/* Fixed appliance (default) → brackets + archwire. Removable → labial bow only,
   no brackets. Detected by name/key so custom names ("تقويم متحرك") also work. */
function orthoIsRemovable(tr){
  if (!tr) return false;
  return /متحرك|removable|removeable/i.test((tr.id || '') + ' ' + (tr.name || ''));
}
function orthoForArch(isUpper){
  // E: the historical view reconstructs teeth_status only — today's ortho
  // sessions must not overlay a past chart. One guard here hides wires AND banner.
  if (window.__historyMode) return null;
  if (typeof sessions === 'undefined' || !sessions || !sessions.length) return null;
  var names = orthoTreatmentNames(), side = isUpper ? 'U' : 'L';
  for (var i=0;i<sessions.length;i++){
    var s = sessions[i];
    if (s.tooth_num) continue;                                       // regional rows only
    if (s.status && s.status !== 'completed' && s.status !== 'planned') continue;
    var tr = names[s.type]; if (!tr) continue;                       // an orthodontics treatment
    var covers = (!s.quadrant && !s.arch) ? true                     // mouth → both arches
               : s.arch ? (s.arch === side)                          // arch 'U' / 'L'
               : s.quadrant ? (String(s.quadrant).charAt(0) === side) // quadrant 'U*' / 'L*'
               : false;
    if (covers) return tr;
  }
  return null;
}
function orthoColorForArch(isUpper){ var t = orthoForArch(isUpper); return t ? (t.fill || '#0d8577') : null; }
function orthoNameForArch(isUpper){ var t = orthoForArch(isUpper); return t ? t.name : null; }
/* Slim active-ortho banner above the chart. Called at the end of renderTeeth. */
function renderOrthoOverlay(){
  var bar = document.getElementById('orthoBanner'); if (!bar) return;
  var u = orthoNameForArch(true),  uc = orthoColorForArch(true),  um = orthoMonthsForArch(true);
  var l = orthoNameForArch(false), lc = orthoColorForArch(false), lm = orthoMonthsForArch(false);
  function esc(x){ return (typeof escapeHtml === 'function') ? escapeHtml(x) : x; }
  function chip(nm,col,area,mo){ return '<span class="ortho-chip" style="color:'+col+';background:'+col+'1a;border-color:'+col+'55;">'+esc(nm)+' · '+area+(mo?' · '+mo+' شهر':'')+'</span>'; }
  var items = [];
  if (u && l && u === l) items.push(chip(u, uc, 'الفكان', um||lm));
  else { if (u) items.push(chip(u, uc, 'الفك العلوي', um)); if (l) items.push(chip(l, lc, 'الفك السفلي', lm)); }
  bar.innerHTML = items.join('');
  bar.style.display = items.length ? 'flex' : 'none';
}
function rebuildToothMaps() {
  var fills = {'': '#e8d5b0'}, strokes = {'': '#b8956a'}, labels = {};
  /* v430: مكتبةُ الحالات تُحقن أولاً — صفُّ كتالوجٍ بنفس المفتاح يبقى الأقوى (يدهسها) */
  if (typeof COND_LIBRARY !== 'undefined') {
    for (var _ci=0; _ci<COND_LIBRARY.length; _ci++) {
      var _cd = COND_LIBRARY[_ci];
      fills[_cd.id] = _cd.fill; strokes[_cd.id] = _cd.stroke; labels[_cd.id] = _cd.label;
    }
  }
  for (var i=0; i<TREATMENTS.length; i++) {
    var t = TREATMENTS[i];
    fills[t.id]   = t.fill;
    strokes[t.id] = t.stroke;
    labels[t.id]  = t.label;
  }
  return { fill: fills, stroke: strokes, label: labels };
}
/* ⚠ الجذع المُستبقى: var _T = rebuildToothMaps() + T_FILL/T_STROKE/T_LABEL نُقلا عائدَين إلى patient-profile.html (موضع marker D1b) — تنفيذ top-level كان ينهار هنا قبل إعلان TREATMENTS فيُسقط الملف كاملاً */

/* Anterior teeth (incisors + canines) use Incisal Edge instead of Occlusal */
var ANTERIOR_TEETH = [11,12,13,21,22,23,31,32,33,41,42,43];
// Positional: positions 1-3 (central, lateral, canine) are anterior in EVERY
// quadrant — covers permanent (11-13…) AND primary (51-53…) with one rule.
function isAnterior(num){ var p = parseInt(num,10) % 10; return p >= 1 && p <= 3; }

/* Surface labels in Arabic */
var SURFACE_LABELS = {
  'O': 'إطباقي',
  'I': 'قاطع',
  'M': 'إنسي',
  'D': 'وحشي',
  'B': 'دهليزي',
  'L': 'لساني',
  'V': 'لثوي',
  'R1': 'جذر 1',
  'R2': 'جذر 2',
  'R3': 'جذر 3',
  'WHOLE': 'السن كاملاً',
  'CROWN_FULL': 'التاج كامل',
  'BRIDGE': 'جسر',
  'PONTIC': 'سن وهمي (جسر)',
  'SPACER': 'حافظ مسافة',
  'SOCKET': 'موقع القلع'
};

/* ── COMPOSITE SURFACE SUPPORT (multi-surface restorations, e.g. MOD) ──
 * A single restoration can span several crown surfaces (MO, OD, MOD, MODBL…),
 * exactly how dentists classify restorations clinically (a MOD composite is ONE
 * restoration, ONE fee, ONE ledger session). The composite is stored as a SINGLE
 * surface code (e.g. 'MOD') on teeth_status / ledger_sessions — `surface` stays a
 * pure clinical LABEL with zero financial effect (FIFO / splitIsEarned / identity
 * tests A–E never read it). Single-surface codes remain valid and unchanged.
 *
 * Canonical order (matches the DB CHECK regex ^M?[OI]?D?B?L?V?$): M → O/I → D → B → L → V.
 * O and I share the central slot (O = posterior occlusal, I = anterior incisal). */
var SURFACE_ORDER = { M:1, O:2, I:2, D:3, B:4, L:5, V:6 };
/* Multi-character codes that are NOT composite crown surfaces (whole-tooth / crown / roots). */
var SPECIAL_SURFACE_CODES = ['WHOLE','PONTIC','CROWN_FULL','BRIDGE','R1','R2','R3'];

/* True only for a multi-surface crown code (e.g. 'MOD'); false for single codes,
   roots (R1-R3) and the whole-tooth/crown special codes above. */
function isCompositeSurfaceCode(code){
  if (!code || code.length < 2) return false;
  if (SPECIAL_SURFACE_CODES.indexOf(code) !== -1) return false;
  return /^[MODBLIV]+$/.test(code);
}

/* Build a canonical-ordered composite code from a set of single surface letters.
   Dedupes + sorts by SURFACE_ORDER so MOD / DOM / OMD all normalize to 'MOD'. */
function buildCompositeCode(letters){
  var uniq = [];
  for (var i=0;i<(letters||[]).length;i++){ if (uniq.indexOf(letters[i])===-1) uniq.push(letters[i]); }
  uniq.sort(function(a,b){ return (SURFACE_ORDER[a]||99)-(SURFACE_ORDER[b]||99); });
  return uniq.join('');
}

/* ── COMPOSITE ROOT SUPPORT (multi-root endo, e.g. molar RCT on all canals) ──
 * Mirrors the composite crown-surface pattern (MOD) 1:1: a single root treatment
 * can span several roots and is stored as ONE composite code ('R1R2', 'R1R2R3')
 * on teeth_status / ledger_sessions — ONE row, ONE fee (a molar root canal is ONE
 * clinical procedure). `surface` remains a pure clinical LABEL with zero financial
 * effect. Single codes (R1/R2/R3) stay valid and unchanged (full back-compat).
 * DB CHECK widened by Migration 78 to accept R1R2 / R1R3 / R2R3 / R1R2R3. */

/* True for ANY root code — single ('R1') or composite ('R1R2R3'). */
function isRootCode(code){ return typeof code === 'string' && /^(R[123]){1,3}$/.test(code); }

/* True only for a MULTI-root composite code ('R1R2'…), false for single R codes. */
function isCompositeRootCode(code){ return isRootCode(code) && code.length > 2; }

/* Split a root code into its single-root parts: 'R1R2' → ['R1','R2']. */
function rootCodeParts(code){ return isRootCode(code) ? (code.match(/R[123]/g) || []) : []; }

/* Build a canonical-ordered composite root code from an array of single R codes.
   Dedupes + sorts (R1 < R2 < R3) so ['R2','R1'] and ['R1','R2'] both → 'R1R2'. */
function buildRootComposite(parts){
  var uniq = [];
  for (var i=0;i<(parts||[]).length;i++){ if (uniq.indexOf(parts[i])===-1) uniq.push(parts[i]); }
  uniq.sort();   // 'R1' < 'R2' < 'R3' lexicographically
  return uniq.join('');
}

/* ANATOMICAL root name for a SINGLE root key on a given tooth (FDI number).
   Mapping matches the SVG geometry comments exactly (R1=MB etc.):
   - 1-rooted teeth              → 'الجذر' (no numbering — the only root)
   - lower molars (perm+primary) → R1=الإنسي، R2=الوحشي
   - upper 1st premolar (14/24)  → R1=الدهليزي، R2=الحنكي
   - upper molars (perm+primary) → R1=الدهليزي الإنسي، R2=الدهليزي الوحشي، R3=الحنكي
   Falls back to the generic 'جذر N' for out-of-range keys (legacy defense). */
function rootLabelFor(rk, num){
  var generic = (typeof SURFACE_LABELS !== 'undefined' && SURFACE_LABELS[rk]) || rk;
  if (!isRootCode(rk) || rk.length !== 2) return generic;
  var n = parseInt(num, 10);
  if (!n || typeof rootsCount !== 'function') return generic;
  var count = rootsCount(n);
  if (parseInt(rk.charAt(1), 10) > count) return generic;   // legacy defense: R3 on a 2-root tooth
  if (count === 1) return 'الجذر';
  var quad = Math.floor(n / 10);
  var quadN = (quad >= 5 && quad <= 8) ? quad - 4 : quad;
  var isUpper = (quadN === 1 || quadN === 2);
  if (count === 2) {
    if (isUpper) return rk === 'R1' ? 'الجذر الدهليزي' : 'الجذر الحنكي';       // 14/24
    return rk === 'R1' ? 'الجذر الإنسي' : 'الجذر الوحشي';                      // lower molars
  }
  if (count === 3) {                                                            // upper molars
    if (rk === 'R1') return 'الجذر الدهليزي الإنسي';
    if (rk === 'R2') return 'الجذر الدهليزي الوحشي';
    return 'الجذر الحنكي';
  }
  return generic;
}

/* Area label for ANY root code (single or composite) — used by modal titles,
   toasts, removal confirms and ledger descriptions. 'R1R2' on 36 →
   'الجذر الإنسي + الجذر الوحشي'. */
function rootAreaLabelFor(code, num){
  var parts = rootCodeParts(code);
  if (!parts.length) return code;
  if (parts.length === 1) return rootLabelFor(parts[0], num);
  if (typeof rootsCount === 'function' && parseInt(num,10) && parts.length === rootsCount(parseInt(num,10)))
    return 'كل الجذور';
  var out = [];
  for (var i=0;i<parts.length;i++) out.push(rootLabelFor(parts[i], num));
  return out.join(' + ');
}

/* RENDER RESOLVER: which treatment_key should COLOR a single crown region on a
   tooth, accounting for composite codes. An explicit single-surface row wins;
   otherwise the first composite code that includes this region letter colors it.
   (After composite-save subsumption cleanup, real overlaps don't occur — this is
   the safety net.) Returns the treatment_key or null. */
function effectiveSurfaceTreatment(sm, regionKey){
  if (!sm) return null;
  if (sm[regionKey]) return sm[regionKey];
  for (var k in sm){
    if (k === '__status') continue;
    if (isCompositeSurfaceCode(k) && k.indexOf(regionKey) !== -1) return sm[k];
  }
  return null;
}

/* CHART STATUS FILTER (view-only). Returns a filtered copy of a tooth's surface
   map according to _chartStatusFilter. Value-only touch (rule #139 pattern):
   geometry/builders are untouched — they just receive fewer keys, so coloring
   AND both tooltips filter consistently. WHOLE + PONTIC are ALWAYS kept: they
   carry the anatomy/prosthetic layer (extraction/implant/pontic branch from the
   RAW teethMap before buildTooth anyway, so exempting them here keeps abutment
   rings consistent with pontics under any filter). Status badges + occlusal
   opacity intentionally read the RAW map — they hint that hidden content exists. */
function chartFilterSM(sm){
  if (_chartStatusFilter === 'all' || !sm) return sm;
  var st = sm.__status || {}, out = {}, outSt = {};
  for (var k in sm){
    if (k === '__status') continue;
    var keep;
    if (k === 'WHOLE' || k === 'PONTIC') keep = true;          // anatomy/prosthetic layer
    else {
      var s = st[k] || 'completed';
      if (_chartStatusFilter === 'planned')        keep = (s === 'planned');
      else if (_chartStatusFilter === 'completed') keep = (s === 'completed');
      else /* hide_existing */                     keep = (s !== 'existing_current' && s !== 'existing_other' && s !== 'existing');
    }
    if (keep){ out[k] = sm[k]; if (st[k]) outSt[k] = st[k]; }
  }
  out.__status = outSt;
  return out;
}

/* Returns the Arabic display name for a tooth surface. Special case: the inner
   surface of UPPER (maxillary) teeth is anatomically the PALATAL surface
   ("حنكي"), not lingual — the surface key stays 'L' (no data change), but the
   label shown to the clinician is "حنكي" for quadrants 1 & 2. Lower teeth keep
   "لساني". Pass the FDI tooth number so the quadrant can be determined; without
   a number it falls back to the plain SURFACE_LABELS value. */
function surfLabelFor(key, num){
  var L = (typeof SURFACE_LABELS !== 'undefined' && SURFACE_LABELS) || {};
  // Root codes (single R1/R2/R3 or composite R1R2…) → anatomical per-tooth names.
  if (typeof isRootCode === 'function' && isRootCode(key)) {
    var rParts = rootCodeParts(key);
    if (rParts.length === 1) return rootLabelFor(key, num);
    var rOut = [];
    for (var rpi=0; rpi<rParts.length; rpi++){ rOut.push(rootLabelFor(rParts[rpi], num)); }
    return rOut.join('·');
  }
  // Composite code (e.g. 'MOD') → join each component surface's label with '·'.
  if (typeof isCompositeSurfaceCode === 'function' && isCompositeSurfaceCode(key)) {
    var parts = key.split(''), out = [];
    for (var ci=0; ci<parts.length; ci++){ out.push(surfLabelFor(parts[ci], num)); }
    return out.join('·');
  }
  if (key === 'L' && num !== null && num !== undefined && num !== '') {
    var q = Math.floor(parseInt(num, 10) / 10);  // FDI quadrant: 1,2 = upper
    if (q === 1 || q === 2) return 'حنكي';
  }
  return L[key] || key;
}

/* Unified surface-fill opacity ("solidity") for treatment colors across BOTH
   the facial (buccal) and occlusal views. Higher = more solid / less see-through.
   Single source of truth so the two views always match. */
var SURFACE_FILL_OPACITY = 0.85;

/* Get the center surface key for a given tooth (O for posterior, I for anterior) */
function centerSurface(num){ return isAnterior(num) ? 'I' : 'O'; }

/* Get all valid surface keys for a tooth */
function surfacesFor(num){
  return isAnterior(num) ? ['I','M','D','B','V'] : ['O','M','D','B','V'];
}

/* ── TOOTH ANATOMY SYSTEM ──
 * Realistic tooth rendering based on standard dental anatomy proportions
 * (general scientific knowledge from dental anatomy textbooks).
 *
 * Each tooth has:
 *   - Crown outline (anatomically shaped silhouette)
 *   - 5 clickable overlay zones for surfaces (M/D/B/L + O/I)
 *   - 1-3 clickable root parts (R1/R2/R3)
 *   - Gum line (decorative)
 *
 * ViewBox: 100 × 160
 *   y = 0..70  → crown
 *   y = 65..75 → cervical/gum line
 *   y = 70..155 → root(s)
 *
 * Upper teeth are flipped vertically (roots point up toward palate).
 * Lower teeth stay normal (roots point down toward mandible).
 */

function toothType(num) {
  var n = parseInt(num, 10), pos = n % 10, quad = Math.floor(n / 10);
  var primary = (quad >= 5 && quad <= 8);
  if (pos === 1 || pos === 2) return 'incisor';
  if (pos === 3) return 'canine';
  // Primary positions 4 & 5 are PRIMARY MOLARS (not premolars — primary dentition has none).
  if (pos === 4 || pos === 5) return primary ? 'molar' : 'premolar';
  return 'molar';
}

function rootsCount(num) {
  var n = parseInt(num, 10);
  var pos = n % 10;
  var quad = Math.floor(n / 10);
  var primary = (quad >= 5 && quad <= 8);
  var quadN = primary ? quad - 4 : quad;
  var isUpper = (quadN === 1 || quadN === 2);
  if (primary) {
    // Primary incisors/canine single-rooted; primary molars (pos 4,5) multi-rooted:
    // maxillary 3 roots, mandibular 2 — same divergent pattern as permanent molars.
    if (pos <= 3) return 1;
    return isUpper ? 3 : 2;
  }
  if (pos <= 3) return 1;
  if (pos === 4) return isUpper ? 2 : 1;
  if (pos === 5) return 1;
  return isUpper ? 3 : 2;
}

/* Cell width in px — single source of truth for ALL facial builders (regular +
   implant + pontic + extracted) via anat.cellW, and for the occlusal view.
   Permanent = 60. Primary teeth are anatomically smaller, so they render at a
   reduced size (PRIMARY_TOOTH_SCALE) — a child's chart reads as primary, not just
   "permanent minus premolars". The whole tooth (crown + roots) scales uniformly
   because the SVG viewBox stays fixed; only the rendered px size shrinks. */
var PRIMARY_TOOTH_SCALE = 0.80;
function cellWidth(num) {
  return isPrimaryTooth(num) ? Math.round(60 * PRIMARY_TOOTH_SCALE) : 60;
}

/* Anatomically realistic tooth drawing.
 * Returns an object with all the SVG pieces needed to render the tooth.
 *
 * The crown is drawn as a smooth outline. Overlay rectangles on top of the
 * crown serve as clickable zones for each surface. When a surface has a
 * treatment, the overlay tints that area with the treatment color.
 */
function toothAnatomy(num) {
  var t = toothType(num);
  var nRoots = rootsCount(num);
  var n = parseInt(num, 10);
  var primary = isPrimaryTooth(num);   // deciduous tooth → distinct morphology below
  var quad = normQuad(n);  // primary quadrants 5-8 → permanent analog 1-4 for anatomy
  // Mesial direction: quadrants 1 (UR) and 4 (LR) → mesial is on screen-right (toward midline of mouth)
  // Quadrants 2 (UL) and 3 (LL) → mesial on screen-left
  // (Patient is facing us, so their right is our left)
  var mesialOnRight = (quad === 1 || quad === 4);

  var cx = 50;
  // Lower anteriors are anatomically smaller/narrower than upper
  var quad_n = normQuad(num);
  var pos = parseInt(num,10) % 10;
  var isLowerJaw = (quad_n === 3 || quad_n === 4);
  var isAntTooth = (t === 'incisor' || t === 'canine');
  var lowerAnt = isLowerJaw && isAntTooth;

  // Crown dimensions per tooth type
  var crownW, crownH, crownTopW;
  if (t === 'incisor') {
    if (lowerAnt && pos === 2) { crownW = 40; crownH = 64; crownTopW = 34; } // lower lateral -10%
    else if (lowerAnt)         { crownW = 44; crownH = 64; crownTopW = 38; }
    else if (pos === 2)        { crownW = 41; crownH = 70; crownTopW = 36; } // upper lateral +10%
    else                       { crownW = 60; crownH = 70; crownTopW = 54; }
  }
  else if (t === 'canine') {
    if (lowerAnt) { crownW = 50; crownH = 70; crownTopW = 32; }
    else          { crownW = 60; crownH = 74; crownTopW = 40; }
  }
  else if (t === 'premolar'){
    // Anatomical: BL≈8mm, MD≈7mm at crown widest, crown height≈8.5mm
    // In facial view we see MD (slightly narrower than BL) — ratio ~0.84-0.88
    if (pos === 4) { crownW = 60; crownH = 60; crownTopW = 54; } // first premolar slightly wider
    else           { crownW = 56; crownH = 58; crownTopW = 52; } // second premolar
  }
  else                      { crownW = 84; crownH = 56; crownTopW = 78; }

  // ── Deciduous (primary) morphology ──────────────────────────────────────
  // Primary crowns differ from permanent: noticeably SHORTER, and the anteriors
  // are squat (mesio-distally WIDE relative to height — a primary central incisor
  // is wider than it is tall). Primary molars are short with a slightly narrower
  // occlusal table and a bulbous body. We adjust the dimension variables only —
  // the outline-building math below is unchanged — and keep crownW within the
  // 0-100 viewBox so nothing clips. Combined with the smaller cell size and the
  // stronger cervical bulge, the chart reads unmistakably as primary.
  if (primary) {
    if (t === 'incisor') {
      // Wheeler's (mm): 51 crown 6.0h × 6.5w · 52 5.6h × 5.1w · 71 5.0h × 4.2w · 72 5.2h × 4.1w.
      // The primary central is the only incisor WIDER than it is tall; the laterals
      // and lowers are small and slender. Incisal edge nearly the full crown width
      // (squat, no mamelons), corners rounded.
      if (lowerAnt && pos === 2) { crownW = 44; crownH = 52; crownTopW = 38; }
      else if (lowerAnt)         { crownW = 44; crownH = 50; crownTopW = 38; }
      else if (pos === 2)        { crownW = 50; crownH = 55; crownTopW = 44; }
      else                       { crownW = 66; crownH = 58; crownTopW = 58; }
    }
    else if (t === 'canine')  { crownW = Math.round(crownW * 1.08); crownH = Math.round(crownH * 0.78); crownTopW = Math.round(crownTopW * 1.05); }
    else {
      // Primary molars at the SAME scale as the primary anteriors (≈9.5 units/mm,
      // Wheeler's): 54 5.1h × 7.3w · 55 5.7h × 8.2w · 74 6.0h × 7.7w · 75 5.5h × 9.9w.
      // The first primary molar is clearly narrower than the second; crowns are
      // short with an occlusal taper.
      if (isLowerJaw) { crownH = (pos === 4) ? 57 : 52; crownW = (pos === 4) ? 73 : 90; }
      else            { crownH = (pos === 4) ? 48 : 54; crownW = (pos === 4) ? 69 : 78; }
      crownTopW = Math.round(crownW * 0.87);
    }
  }

  var crownTop = 6;
  var crownBot = crownTop + crownH;       // gum line
  var crownL = cx - crownW/2;
  var crownR = cx + crownW/2;
  var bulge = primary ? 4.3 : 3.5;  // primary crowns have a more pronounced cervical/equatorial bulge

  // ── Cervical constriction & contact geometry (facial view) ──
  // Real crowns are widest at the contact areas (occlusal/middle third) and
  // narrow markedly toward the CEJ (Wheeler's: cervical MD width ≈ 70–80% of
  // the maximum). Roots emerge from that NARROWER cervical width — not from the
  // crown's widest line — which is what makes a facial-view drawing read as a
  // tooth instead of a block.
  var cejK, contactK;
  if (t === 'incisor')      { cejK = lowerAnt ? 0.70 : 0.78; contactK = lowerAnt ? 0.28 : 0.30; }
  else if (t === 'canine')  { cejK = 0.74; contactK = 0.40; }
  else if (t === 'premolar'){ cejK = 0.72; contactK = 0.36; }
  else                      { cejK = 0.78; contactK = 0.40; }
  if (primary) {
    if (t === 'incisor') { cejK = lowerAnt ? 0.71 : (pos === 2 ? 0.73 : 0.69); contactK = 0.38; }   // Wheeler's cervix/MD ratios; broad contacts, contour in the middle third
    else                 { cejK -= 0.06; contactK += 0.10; }                                          // other primary crowns: bulbous, marked cervical constriction, contour low
  }
  var cejW = crownW * cejK;
  var cejL = cx - cejW/2, cejR = cx + cejW/2;
  var contactY = crownTop + crownH * contactK;
  var distalRight = !mesialOnRight;

  // Both sides of the crown from the occlusal corners down to the CEJ:
  // occlusal corner → convex contact bulge (rounder and slightly more cervical
  // on the distal side) → taper to the cervical line.
  function crownSides(trX, trY, tlX, tlY) {
    var rBul = distalRight ? bulge*0.9 : bulge*0.5, lBul = distalRight ? bulge*0.5 : bulge*0.9;
    var rX = crownR + rBul, lX = crownL - lBul;
    var rCy = contactY + (distalRight ? crownH*0.06 : 0);
    var lCy = contactY + (distalRight ? 0 : crownH*0.06);
    return ' C ' + (trX + (rX-trX)*0.55) + ' ' + (trY + 1) + ' ' + rX + ' ' + (rCy - crownH*0.16) + ' ' + rX + ' ' + rCy
         + ' C ' + rX + ' ' + (rCy + (crownBot-rCy)*0.42) + ' ' + (cejR + (rX-cejR)*0.30) + ' ' + (crownBot - crownH*0.10) + ' ' + cejR + ' ' + crownBot
         + ' Q ' + cx + ' ' + (crownBot + 2.5) + ' ' + cejL + ' ' + crownBot
         + ' C ' + (cejL - (cejL-lX)*0.30) + ' ' + (crownBot - crownH*0.10) + ' ' + lX + ' ' + (lCy + (crownBot-lCy)*0.42) + ' ' + lX + ' ' + lCy
         + ' C ' + lX + ' ' + (lCy - crownH*0.16) + ' ' + (tlX + (lX-tlX)*0.55) + ' ' + (tlY + 1) + ' ' + tlX + ' ' + tlY + ' Z';
  }

  // ── Build crown outline path ──
  var outlineD;
  var facialGrooveD = '';     // buccal developmental groove(s) running down the facial surface (molars)
  var facialLobeD = '';       // faint labial developmental depressions (anteriors) — very low contrast
  var crownTL = cx - crownTopW/2;
  var crownTR = cx + crownTopW/2;
  if (t === 'incisor') {
    // Incisal edge: nearly straight; the mesio-incisal angle is sharp, the
    // disto-incisal angle rounder and more cervical (central); the lateral is
    // rounder overall; lower incisors are narrow fan-shaped with a flat edge.
    var mCornerY, dCornerY, edgeLift;
    if (primary)           { mCornerY = 3.5; dCornerY = 5; edgeLift = 0.8; }    // primary: flat edge, softly rounded corners
    else if (lowerAnt)     { mCornerY = 3; dCornerY = 3.5; edgeLift = 0.6; }
    else if (pos === 2)    { mCornerY = 4; dCornerY = 7;   edgeLift = 0;   }
    else                   { mCornerY = 2; dCornerY = 5;   edgeLift = -0.4; }
    var tlY = crownTop + (mesialOnRight ? dCornerY : mCornerY);
    var trY = crownTop + (mesialOnRight ? mCornerY : dCornerY);
    outlineD = 'M ' + crownTL + ' ' + tlY +
               ' Q ' + cx + ' ' + (crownTop + edgeLift) + ' ' + crownTR + ' ' + trY +
               crownSides(crownTR, trY, crownTL, tlY);
    if (!lowerAnt && !primary) {
      // two shallow labial depressions between the three developmental lobes
      var lobeX = crownW * 0.16;
      facialLobeD = 'M ' + (cx - lobeX) + ' ' + (crownTop + crownH*0.22) + ' Q ' + (cx - lobeX - 1) + ' ' + (crownTop + crownH*0.50) + ' ' + (cx - lobeX + 0.5) + ' ' + (crownTop + crownH*0.72) +
                    ' M ' + (cx + lobeX) + ' ' + (crownTop + crownH*0.22) + ' Q ' + (cx + lobeX + 1) + ' ' + (crownTop + crownH*0.50) + ' ' + (cx + lobeX - 0.5) + ' ' + (crownTop + crownH*0.72);
    }
  } else if (t === 'canine') {
    // Pointed cusp slightly mesial; the mesial cusp slope is shorter than the distal.
    var canineCuspX = cx + (mesialOnRight ? 2 : -2);
    var canineCuspY = crownTop - 1;
    var cMesY = crownTop + 7, cDisY = crownTop + 11;
    var ctlY = mesialOnRight ? cDisY : cMesY, ctrY = mesialOnRight ? cMesY : cDisY;
    outlineD = 'M ' + (crownTL - 1) + ' ' + ctlY +
               ' Q ' + (canineCuspX - 6) + ' ' + (crownTop + 1) + ' ' + canineCuspX + ' ' + canineCuspY +
               ' Q ' + (canineCuspX + 6) + ' ' + (crownTop + 1) + ' ' + (crownTR + 1) + ' ' + ctrY +
               crownSides(crownTR + 1, ctrY, crownTL - 1, ctlY);
  } else if (t === 'premolar') {
    // Buccal view: one buccal cusp. Upper FIRST premolar: cusp tip sits distal
    // to the crown centre (longer mesial slope — Wheeler's); all others mesial.
    var pShift = (pos === 4 && !isLowerJaw && !primary) ? -2 : 2;
    var pCuspX = cx + (mesialOnRight ? pShift : -pShift);
    var pCuspY = crownTop;
    var pCornerY = crownTop + 9;
    outlineD = 'M ' + (crownTL - 1) + ' ' + pCornerY +
               ' Q ' + (pCuspX - crownTopW*0.30) + ' ' + (crownTop + 2) + ' ' + pCuspX + ' ' + pCuspY +
               ' Q ' + (pCuspX + crownTopW*0.30) + ' ' + (crownTop + 2) + ' ' + (crownTR + 1) + ' ' + pCornerY +
               crownSides(crownTR + 1, pCornerY, crownTL - 1, pCornerY);
  } else {
    // Molars, facial view: the buccal cusps with the buccal groove(s) between
    // them. Upper molars & lower 2nd/3rd: two cusps (mesiobuccal larger and
    // higher). Lower FIRST molar: three (MB · DB · distal, the distal smallest
    // and lowest). The occlusal outline tilts slightly down distally.
    var threeCusps = (isLowerJaw && pos === 6 && !primary);
    var mesialLeft = !mesialOnRight;
    var cuspsM;   // cusps ordered mesial → distal: {dx (fraction of crownTopW from cx), dy}
    if (threeCusps) cuspsM = [{dx:-0.34, dy:1}, {dx:0.02, dy:2}, {dx:0.35, dy:4}];
    else            cuspsM = [{dx:-0.28, dy:1}, {dx:0.28, dy:2.5}];
    var cusps = cuspsM.map(function(c){ return { x: cx + (mesialLeft ? c.dx : -c.dx) * crownTopW, y: crownTop + c.dy }; });
    if (!mesialLeft) cusps.reverse();          // left → right on screen
    var mCorner = { x: crownTL - 1, y: crownTop + (mesialLeft ? 9 : 11) };
    var dCorner = { x: crownTR + 1, y: crownTop + (mesialLeft ? 11 : 9) };
    var edge = 'M ' + mCorner.x + ' ' + mCorner.y +
               ' Q ' + (mCorner.x + (cusps[0].x - mCorner.x)*0.6) + ' ' + (cusps[0].y + 0.3) + ' ' + cusps[0].x + ' ' + cusps[0].y;
    var dips = [];
    for (var ci = 1; ci < cusps.length; ci++) {
      var a = cusps[ci-1], b = cusps[ci];
      var dipX = (a.x + b.x)/2, dipY = crownTop + (cusps.length === 3 ? 6.5 : 8);
      var ctlY2 = dipY + (dipY - (a.y + b.y)/2)/3;
      edge += ' C ' + (a.x + (b.x-a.x)*0.35) + ' ' + ctlY2 + ' ' + (b.x - (b.x-a.x)*0.35) + ' ' + ctlY2 + ' ' + b.x + ' ' + b.y;
      dips.push({ x: dipX, y: dipY });
    }
    var last = cusps[cusps.length-1];
    edge += ' Q ' + (last.x + (dCorner.x - last.x)*0.4) + ' ' + (last.y + 0.3) + ' ' + dCorner.x + ' ' + dCorner.y;
    outlineD = edge + crownSides(dCorner.x, dCorner.y, mCorner.x, mCorner.y);
    // Buccal groove(s): from each dip down the facial surface (the mesial one
    // longer on a three-cusped lower first molar). Slight distal drift.
    var gDir = mesialOnRight ? -1 : 1;
    for (var di = 0; di < dips.length; di++) {
      var gLen = crownH * ((dips.length === 2 && di === 1) ? 0.30 : 0.42);
      facialGrooveD += 'M ' + dips[di].x + ' ' + (dips[di].y + 1.5) +
                       ' Q ' + (dips[di].x + gDir*0.6) + ' ' + (dips[di].y + gLen*0.55) +
                       ' '   + (dips[di].x + gDir*1.2) + ' ' + (dips[di].y + gLen) + ' ';
    }
  }

  // ── Surface overlay rectangles (clickable) ──
  // The crown is divided into a 3×3-ish grid:
  //   left strip = M (or D depending on quadrant)
  //   right strip = D (or M)
  //   top-middle = B (buccal/labial — outer face)
  //   bottom-middle = L (lingual/palatal)
  //   center = O (occlusal) or I (incisal) — small inset
  // These are simple rectangles overlaid on the crown silhouette.
  var sideStripW = crownW * 0.18;
  var stripL_x = crownL;
  var stripR_x = crownR - sideStripW;
  var stripY = crownTop + 4;
  var stripH = crownH - 8;

  var leftKey  = mesialOnRight ? 'D' : 'M';
  var rightKey = mesialOnRight ? 'M' : 'D';

  // Center column subdivision (top → bottom):
  //  O/I (occlusal/إطباقي for posteriors, incisal/قاطع for anteriors) — top 25%
  //  B (buccal/دهليزي) — large middle 50% (the main facial body of the tooth)
  //  L (lingual/لثوي) — bottom 25% (near the gum line)
  var midL = crownL + sideStripW;
  var midR = crownR - sideStripW;
  var midW = midR - midL;
  var oH = stripH * 0.25;  // occlusal/incisal — top 25%
  var bH = stripH * 0.50;  // buccal — middle 50%
  // lingual takes the remaining 25% at the bottom

  var oRect = { x: midL, y: stripY,            w: midW, h: oH,            key: (t === 'incisor' || t === 'canine') ? 'I' : 'O' };
  var bRect = { x: midL, y: stripY + oH,       w: midW, h: bH,            key: 'B' };
  var lRect = { x: midL, y: stripY + oH + bH,  w: midW, h: stripH-oH-bH,  key: 'V' };
  var leftRect  = { x: stripL_x, y: stripY, w: sideStripW, h: stripH, key: leftKey };
  var rightRect = { x: stripR_x, y: stripY, w: sideStripW, h: stripH, key: rightKey };

  // ── Roots (anatomically correct shapes) ──
  // Reference: standard dental anatomy — roots are tapered conical shapes that
  // diverge from the cervical area, with characteristic curvatures per tooth type.
  var rootTop = crownBot - 1;     // slight overlap to merge roots seamlessly with the crown

  // Anatomical root lengths per tooth type (FDI position)
  // Lateral incisor (pos 2) shortest, central (pos 1) longer, canine (pos 3) longest
  var pos = parseInt(num,10) % 10;
  var rootBot;
  if (nRoots === 1) {
    var isUpperAnt = (!isLowerJaw) && isAntTooth;
    if (primary && pos <= 2) {
      var pRatio = isUpperAnt ? (pos === 2 ? 2.0 : 1.65) : (pos === 2 ? 1.9 : 1.8);
      rootBot = Math.round(crownBot + crownH * pRatio);   // 51→~160 · 52→~171 · 71→~146 · 72→~157
    }
    else if (pos === 2) rootBot = isUpperAnt ? 165 : 162;  // lateral (lower lateral root is LONGER than lower central)
    else if (pos === 1) rootBot = isUpperAnt ? 178 : 158;  // central
    else if (pos === 3) rootBot = isUpperAnt ? 192 : 169;  // canine
    else                rootBot = 168;  // premolar (root ~14mm vs crown ~8.5mm — ratio ~1.6:1)
  } else {
    // Multi-rooted: premolar (upper 1st) shorter than molars
    if (t === 'premolar') rootBot = 168;
    else if (nRoots === 3) rootBot = 160;  // upper molar buccal roots (MB/DB ≈12–13mm)
    else rootBot = 156;                     // lower molar (15% shorter than upper)
    if (primary && t === 'molar') {
      // Primary molar roots (Wheeler's, mm → ×9.5): 54 10.0 · 55 11.7 · 74 9.8 · 75 11.3
      var pmRoot = isLowerJaw ? (pos === 4 ? 93 : 107) : (pos === 4 ? 95 : 111);
      rootBot = crownBot + pmRoot;
    }
  }
  var rootLen = rootBot - rootTop;
  var roots = [];

  if (nRoots === 1) {
    // Cone-shaped root: cervical width matches crown, tapers to a pointed apex
    var rTopW, rApexW;
    rTopW = cejW * 0.94;                                      // the root fills the cervical width
    rApexW = (pos === 3) ? crownW * 0.11 : (primary ? crownW * 0.075 : crownW * 0.10);   // primary incisor roots taper to a slender apex
    var rTopL = cx - rTopW/2;
    var rTopR = cx + rTopW/2;
    var _dd1 = mesialOnRight ? -1 : 1;   // distal direction on screen
    var apexShift = (t === 'canine') ? _dd1*3 : (t === 'premolar') ? _dd1*1.5 : (pos === 2 && !isLowerJaw && !primary) ? _dd1*2.5 : 0;
    var apexCx = cx + apexShift;
    var d = 'M ' + rTopR + ' ' + rootTop +
            ' C ' + (rTopR - 1) + ' ' + (rootTop + rootLen*0.40) +
            ' '   + (apexCx + rApexW*1.5) + ' ' + (rootTop + rootLen*0.82) +
            ' '   + (apexCx + rApexW) + ' ' + (rootBot - 2) +
            ' Q ' + apexCx + ' ' + (rootBot + 1) +              // pointed apex tip
            ' '   + (apexCx - rApexW) + ' ' + (rootBot - 2) +
            ' C ' + (apexCx - rApexW*1.5) + ' ' + (rootTop + rootLen*0.82) +
            ' '   + (rTopL + 1) + ' ' + (rootTop + rootLen*0.40) +
            ' '   + rTopL + ' ' + rootTop +
            ' Z';
    roots.push({ key:'R1', d:d, canalTopCx:cx, canalApexCx:apexCx, canalTop:rootTop, canalBot:rootBot, canalTopW:rTopW });
  } else if (nRoots === 2 && t === 'premolar') {
    // Upper first premolar (14/24): BUCCAL + PALATAL roots lie one BEHIND the
    // other in a buccal (facial) view. Anatomy: a single wide root trunk that
    // bifurcates in the apical ~40% (Wheeler's). Drawn as the buccal root in front
    // (full trunk silhouette) with the palatal root BEHIND it, sharing the trunk
    // exactly and forking mesially near the apex — so the chart shows one wide
    // root with a two-tipped (bifid) apex instead of two separate spikes.
    var _ddP = mesialOnRight ? -1 : 1;             // distal direction on screen
    var pTopW = cejW * 0.94;
    var pTopL = cx - pTopW/2, pTopR = cx + pTopW/2;
    var pBifY = rootTop + rootLen * 0.55;          // bifurcation depth
    var pMidL = cx - pTopW * 0.40, pMidR = cx + pTopW * 0.40;
    var pAw = crownW * 0.085;
    var bApexCx = cx + _ddP * 5;                   // buccal apex tips distally
    var pApexCx = cx - _ddP * 10;                  // palatal apex peeks mesially
    var pBot = rootBot - 4;                        // palatal slightly shorter
    function premolarRoot(apexCx, bot) {
      var len2 = bot - pBifY;
      return 'M ' + pTopR + ' ' + rootTop +
             ' C ' + (pTopR - 0.5) + ' ' + (rootTop + (pBifY-rootTop)*0.5) +
             ' '   + (pMidR + 0.5) + ' ' + (pBifY - 6) +
             ' '   + pMidR + ' ' + pBifY +
             ' C ' + (pMidR - 0.5) + ' ' + (pBifY + len2*0.45) +
             ' '   + (apexCx + pAw*1.5) + ' ' + (pBifY + len2*0.80) +
             ' '   + (apexCx + pAw) + ' ' + (bot - 2) +
             ' Q ' + apexCx + ' ' + (bot + 1) +
             ' '   + (apexCx - pAw) + ' ' + (bot - 2) +
             ' C ' + (apexCx - pAw*1.5) + ' ' + (pBifY + len2*0.80) +
             ' '   + (pMidL + 0.5) + ' ' + (pBifY + len2*0.45) +
             ' '   + pMidL + ' ' + pBifY +
             ' C ' + (pMidL - 0.5) + ' ' + (pBifY - 6) +
             ' '   + (pTopL + 0.5) + ' ' + (rootTop + (pBifY-rootTop)*0.5) +
             ' '   + pTopL + ' ' + rootTop + ' Z';
    }
    // Z-order: palatal FIRST (behind), buccal on top — same convention as upper molars.
    roots.push({ key:'R2', behind:true, d: premolarRoot(pApexCx, pBot),
                 canalTopCx:cx - _ddP*5, canalApexCx:pApexCx, canalTop:rootTop, canalBot:pBot, canalTopW:pTopW*0.42 });
    roots.push({ key:'R1', d: premolarRoot(bApexCx, rootBot),
                 canalTopCx:cx + _ddP*5, canalApexCx:bApexCx, canalTop:rootTop, canalBot:rootBot, canalTopW:pTopW*0.42 });
  } else if (nRoots === 2) {
    // Lower molars (Wheeler's; Hou & Tsai): mesial + distal roots joined by a
    // ROOT TRUNK (≈3–4 mm) before the furcation — both roots fill the cervical
    // width edge-to-edge (meeting at the midline) and separate only below the trunk.
    var lowerCervL = cejL + 1;
    var lowerCervR = cejR - 1;
    var lowerCervW = lowerCervR - lowerCervL;
    var rW = lowerCervW * 0.46;
    var rApex = rW * 0.12;
    var lowerDivMul = primary ? 1.55 : (pos === 6) ? 1.0 : (pos === 7) ? 0.72 : 0.42;  // primary molar roots flare WIDELY (straddle the developing premolar); 3rd molar roots near-fused
    var trunkRatio = primary ? 0.08 : (pos === 6) ? 0.16 : (pos === 7) ? 0.22 : 0.34;   // furcation closer to the crown (Curve/Wheeler's ≈3mm trunk)
    if (!primary && pos === 7) rootBot -= 4;
    if (!primary && pos === 8) rootBot -= 10;
    var _lowerRootBot = rootBot;
    var trunkY = rootTop + rootLen * trunkRatio;
    var leftTopCx  = cx - lowerCervW * 0.25;
    var rightTopCx = cx + lowerCervW * 0.25;
    var lowerDivOffset = lowerCervW * 0.18 * lowerDivMul;
    var leftApexCx  = leftTopCx - lowerDivOffset;
    var rightApexCx = rightTopCx + lowerDivOffset;
    // outer edge = cervical edge; inner edge = midline down to the trunk, then diverges.
    function makeRoot(isOnLeft, apexCx, widthMul, isMesial) {
      var aw = rApex * widthMul;
      var rootBot = _lowerRootBot + (primary ? 0 : (isMesial ? 3 : -4));   // mesial root longer, distal shorter (Wheeler's)
      var rootLen = rootBot - rootTop;
      var outerX = isOnLeft ? lowerCervL : lowerCervR;
      var distalDir = isOnLeft ? -1 : 1;
      // Permanent: apices converge — both tips hook gently INWARD toward each other (mesial a touch more).
      // Primary: unchanged (mesial hooks distally 2.5, distal flares outward 2.0) — owner's call, v392.
      var apexShift = primary
        ? (isMesial ? (-distalDir * 2.5) : (distalDir * 2.0))
        : (-distalDir * (isMesial ? 4.0 : 2.8));
      var bx = apexCx + apexShift;
      var midBow = isMesial ? (distalDir * 1.2) : 0;
      var innerW = (lowerCervW * 0.5) * widthMul * 0.34;   // inner half-width just below the furcation
      var belowLen = rootBot - trunkY;
      var leftX  = isOnLeft ? outerX : cx;
      var rightX = isOnLeft ? cx : outerX;
      // right edge (top → apex)
      var rightEdge = isOnLeft
        ? (' L ' + cx + ' ' + trunkY +
           ' C ' + (cx - 0.5) + ' ' + (trunkY + belowLen*0.35) +
           ' '   + (bx + aw*1.5) + ' ' + (trunkY + belowLen*0.78) +
           ' '   + (bx + aw) + ' ' + (rootBot - 2))
        : (' C ' + (rightX + midBow) + ' ' + (rootTop + rootLen*0.40) +
           ' '   + (bx + aw*1.5) + ' ' + (rootTop + rootLen*0.82) +
           ' '   + (bx + aw) + ' ' + (rootBot - 2));
      var leftEdge = isOnLeft
        ? (' C ' + (bx - aw*1.5) + ' ' + (rootTop + rootLen*0.82) +
           ' '   + (leftX + midBow) + ' ' + (rootTop + rootLen*0.40) +
           ' '   + leftX + ' ' + rootTop)
        : (' C ' + (bx - aw*1.5) + ' ' + (trunkY + belowLen*0.78) +
           ' '   + (cx + 0.5) + ' ' + (trunkY + belowLen*0.35) +
           ' '   + cx + ' ' + trunkY +
           ' L ' + cx + ' ' + rootTop);
      return 'M ' + rightX + ' ' + rootTop + rightEdge +
             ' Q ' + bx + ' ' + (rootBot + 1) + ' ' + (bx - aw) + ' ' + (rootBot - 2) +
             leftEdge + ' Z';
    }
    // R1 = mesial (slightly wider), R2 = distal
    var mesialIsLeft = mesialOnRight ? false : true;
    if (mesialIsLeft) {
      roots.push({ key:'R1', d: makeRoot(true,  leftApexCx, 1.1, true),
                   canalTopCx:leftTopCx, canalApexCx:leftApexCx, canalTop:rootTop, canalBot:rootBot + (primary?0:3), canalTopW:rW*1.1 });
      roots.push({ key:'R2', d: makeRoot(false, rightApexCx, 0.95, false),
                   canalTopCx:rightTopCx, canalApexCx:rightApexCx, canalTop:rootTop, canalBot:rootBot - (primary?0:4), canalTopW:rW*0.95 });
    } else {
      roots.push({ key:'R1', d: makeRoot(false, rightApexCx, 1.1, true),
                   canalTopCx:rightTopCx, canalApexCx:rightApexCx, canalTop:rootTop, canalBot:rootBot + (primary?0:3), canalTopW:rW*1.1 });
      roots.push({ key:'R2', d: makeRoot(true,  leftApexCx, 0.95, false),
                   canalTopCx:leftTopCx, canalApexCx:leftApexCx, canalTop:rootTop, canalBot:rootBot - (primary?0:4), canalTopW:rW*0.95 });
    }
  } else {
    // Three roots (upper molars): MB + DB side by side on a shared ROOT TRUNK,
    // palatal BEHIND them (drawn first), visible in the furcation and below.
    var cervL = cejL + 1;
    var cervR = cejR - 1;
    var cervW = cervR - cervL;
    var rW3 = cervW * 0.46;
    var rApex3 = rW3 * 0.12;
    var divMul = primary ? 1.55 : (pos === 6) ? 1.0 : (pos === 7) ? 0.66 : 0.38;
    var trunkRatio3 = primary ? 0.08 : (pos === 6) ? 0.16 : (pos === 7) ? 0.22 : 0.34;  // furcation closer to the crown
    if (!primary && pos === 7) rootBot -= 4;
    if (!primary && pos === 8) rootBot -= 10;
    var _upperRootBot = rootBot;
    var trunkY3 = rootTop + rootLen * trunkRatio3;
    var mbTopCx = cx - cervW * 0.25;
    var dbTopCx = cx + cervW * 0.25;
    var divOffset = cervW * 0.18 * divMul;
    var mbApexCx = mbTopCx - divOffset;
    var dbApexCx = dbTopCx + divOffset;
    var palTopCx = cx, palApexCx = cx;
    var palStartY = rootTop;                  // hidden under the trunk anyway
    var palBot = rootBot + (primary ? 8 : (pos === 8 ? 6 : 12));    // palatal is the longest root (primary: proportionally +8)
    var palMul = 1.10, mbMul = 1.00, dbMul = 0.85;
    var distalDir3 = mesialOnRight ? -1 : 1;
    function makeBuccalRoot(isOnLeft, apexCx, widthMul, isMB) {
      var aw = rApex3 * widthMul;
      var rootBot = _upperRootBot + (primary ? 0 : (isMB ? 0 : -6));    // DB root shorter than MB (Wheeler's)
      var rootLen = rootBot - rootTop;
      // Permanent: apices converge — MB and DB tips hook INWARD toward the furcation (MB a touch more);
      // body direction as before. Primary: unchanged (both tips distal, 2.2) — owner's call, v392.
      var inward = isOnLeft ? 1 : -1;
      var apicalBend = primary ? 2.2 : (isMB ? 3.4 : 2.6);
      var bx = primary ? (apexCx + distalDir3 * apicalBend) : (apexCx + inward * apicalBend);
      var midBend = primary ? (distalDir3 * apicalBend * 0.4) : (distalDir3 * (isMB ? 1.4 : 0.4));
      var belowLen = rootBot - trunkY3;
      var outerX = isOnLeft ? cervL : cervR;
      var rightX = isOnLeft ? cx : outerX;
      var leftX  = isOnLeft ? outerX : cx;
      var rightEdge = isOnLeft
        ? (' L ' + cx + ' ' + trunkY3 +
           ' C ' + (cx - 0.5 + midBend) + ' ' + (trunkY3 + belowLen*0.35) +
           ' '   + (bx + aw*1.6 + midBend) + ' ' + (trunkY3 + belowLen*0.75) +
           ' '   + (bx + aw) + ' ' + (rootBot - 2))
        : (' C ' + (rightX + midBend) + ' ' + (rootTop + rootLen*0.40) +
           ' '   + (bx + aw*1.6 + midBend) + ' ' + (rootTop + rootLen*0.78) +
           ' '   + (bx + aw) + ' ' + (rootBot - 2));
      var leftEdge = isOnLeft
        ? (' C ' + (bx - aw*1.6 + midBend) + ' ' + (rootTop + rootLen*0.78) +
           ' '   + (leftX + midBend) + ' ' + (rootTop + rootLen*0.40) +
           ' '   + leftX + ' ' + rootTop)
        : (' C ' + (bx - aw*1.6 + midBend) + ' ' + (trunkY3 + belowLen*0.75) +
           ' '   + (cx + 0.5 + midBend) + ' ' + (trunkY3 + belowLen*0.35) +
           ' '   + cx + ' ' + trunkY3 +
           ' L ' + cx + ' ' + rootTop);
      return 'M ' + rightX + ' ' + rootTop + rightEdge +
             ' Q ' + bx + ' ' + (rootBot + 1) + ' ' + (bx - aw) + ' ' + (rootBot - 2) +
             leftEdge + ' Z';
    }
    function makePalatalRoot() {
      var w = rW3 * palMul;
      var aw = rApex3 * palMul;
      var topL = palTopCx - w/2, topR = palTopCx + w/2;
      var thisLen = palBot - palStartY;
      return 'M ' + topR + ' ' + palStartY +
             ' C ' + (topR + 0.3) + ' ' + (palStartY + thisLen*0.40) +
             ' '   + (palApexCx + aw*1.6) + ' ' + (palStartY + thisLen*0.82) +
             ' '   + (palApexCx + aw) + ' ' + (palBot - 2) +
             ' Q ' + palApexCx + ' ' + (palBot + 1) +
             ' '   + (palApexCx - aw) + ' ' + (palBot - 2) +
             ' C ' + (palApexCx - aw*1.6) + ' ' + (palStartY + thisLen*0.82) +
             ' '   + (topL - 0.3) + ' ' + (palStartY + thisLen*0.40) +
             ' '   + topL + ' ' + palStartY + ' Z';
    }
    // R1 = MB, R2 = DB, R3 = Palatal
    var mbOnLeft = !mesialOnRight;
    var mbApexX = mesialOnRight ? dbApexCx : mbApexCx;
    var dbApexX = mesialOnRight ? mbApexCx : dbApexCx;
    roots.push({ key:'R3', behind:true, d: makePalatalRoot(),
                 canalTopCx:palTopCx, canalApexCx:palApexCx, canalTop:palStartY, canalBot:palBot, canalTopW:rW3*palMul });
    roots.push({ key:'R1', d: makeBuccalRoot(mbOnLeft, mbApexX, mbMul, true),
                 canalTopCx:(mbOnLeft ? mbTopCx : dbTopCx), canalApexCx:mbApexX, canalTop:rootTop, canalBot:rootBot, canalTopW:rW3*mbMul });
    roots.push({ key:'R2', d: makeBuccalRoot(!mbOnLeft, dbApexX, dbMul, false),
                 canalTopCx:(mbOnLeft ? dbTopCx : mbTopCx), canalApexCx:dbApexX, canalTop:rootTop, canalBot:rootBot - (primary?0:6), canalTopW:rW3*dbMul });
  }

  // ── Occlusal/Incisal Surface Detail (drawn INSIDE the crown, near the top) ──
  // No separate path — these are subtle shading + groove lines that integrate into
  // the existing crown outline to give a 2.5D semi-occlusal feel
  var occlusalDetailD = '';   // groove lines (mesial-distal central + transverse)
  var occlusalBandD = '';     // soft shadow band representing the occlusal "table" depth
  var occlBandH;              // height of the occlusal shaded zone within the crown
  if (t === 'incisor' || t === 'canine') occlBandH = 6;
  else if (t === 'premolar')              occlBandH = 9;
  else                                    occlBandH = 12;

  // Occlusal band: a soft horizontal zone at the top of the crown (from cusp tips down)
  // This gives the impression of looking slightly down at the occlusal table
  var bandTop = crownTop + 1;
  var bandBot = crownTop + occlBandH;
  // The band follows the crown's top contour — narrower than the crown body
  var bandL = crownTL + 1;
  var bandR = crownTR - 1;

  if (t === 'incisor' || t === 'canine') {
    // Incisal edge: thin highlight band along the cutting edge (translucent enamel)
    occlusalBandD =
      'M ' + bandL + ' ' + bandBot +
      ' Q ' + cx + ' ' + (bandBot - 2) +
      ' '   + bandR + ' ' + bandBot +
      ' Q ' + (cx + (t === 'canine' ? (mesialOnRight ? -2 : 2) : 0)) + ' ' + (bandTop - 1) +
      ' '   + bandL + ' ' + bandBot + ' Z';
  }
  else if (t === 'premolar') {
    // Two-cusp occlusal: shading dips between the cusps (central groove visible)
    var pCuspL = cx - crownTopW * 0.27;
    var pCuspR = cx + crownTopW * 0.27;
    occlusalBandD =
      'M ' + bandL + ' ' + (bandBot - 0.5) +
      // Left cusp slope down into the band
      ' Q ' + (pCuspL - 4) + ' ' + (bandTop + 1) +
      ' '   + pCuspL + ' ' + (bandTop + 0.5) +
      // Down into central groove
      ' Q ' + (cx - crownTopW*0.10) + ' ' + (bandTop + 3) +
      ' '   + cx + ' ' + (bandTop + 4) +
      // Up to right cusp
      ' Q ' + (cx + crownTopW*0.10) + ' ' + (bandTop + 3) +
      ' '   + pCuspR + ' ' + (bandTop + 0.5) +
      // Down to right edge
      ' Q ' + (pCuspR + 4) + ' ' + (bandTop + 1) +
      ' '   + bandR + ' ' + (bandBot - 0.5) +
      // Bottom edge of the band (the "shelf" line)
      ' Q ' + cx + ' ' + (bandBot + 1.5) +
      ' '   + bandL + ' ' + (bandBot - 0.5) + ' Z';
    // Central groove line
    occlusalDetailD =
      'M ' + (bandL + 4) + ' ' + (bandBot - 0.5) +
      ' Q ' + cx + ' ' + (bandTop + 4) +
      ' '   + (bandR - 4) + ' ' + (bandBot - 0.5);
  }
  else {
    // Molar four-cusp occlusal band (MB/ML/DB/DL visible from semi-occlusal angle)
    var mC1 = bandL + (bandR - bandL) * 0.18;
    var mC2 = cx - crownTopW * 0.10;
    var mC3 = cx + crownTopW * 0.10;
    var mC4 = bandR - (bandR - bandL) * 0.18;
    occlusalBandD =
      'M ' + bandL + ' ' + (bandBot - 0.5) +
      // Up to first outer cusp
      ' Q ' + (bandL + 1) + ' ' + (bandTop + 1.5) +
      ' '   + mC1 + ' ' + (bandTop + 0.8) +
      // Dip then second cusp
      ' Q ' + (mC1 + 3) + ' ' + (bandTop + 3) +
      ' '   + mC2 + ' ' + (bandTop + 1.5) +
      // Central groove (deeper)
      ' Q ' + cx + ' ' + (bandTop + 5) +
      ' '   + mC3 + ' ' + (bandTop + 1.5) +
      // Up to fourth cusp
      ' Q ' + (mC4 - 3) + ' ' + (bandTop + 3) +
      ' '   + mC4 + ' ' + (bandTop + 0.8) +
      // Down to right edge
      ' Q ' + (bandR - 1) + ' ' + (bandTop + 1.5) +
      ' '   + bandR + ' ' + (bandBot - 0.5) +
      // Bottom edge of the band
      ' Q ' + cx + ' ' + (bandBot + 2) +
      ' '   + bandL + ' ' + (bandBot - 0.5) + ' Z';
    // Detail lines: central + transverse grooves
    occlusalDetailD =
      'M ' + (bandL + 3) + ' ' + (bandBot - 0.5) +
      ' Q ' + cx + ' ' + (bandTop + 5) +
      ' '   + (bandR - 3) + ' ' + (bandBot - 0.5) +
      ' M ' + ((mC1 + mC2)/2) + ' ' + (bandTop + 3) +
      ' L ' + ((mC1 + mC2)/2 + 0.3) + ' ' + (bandBot - 1) +
      ' M ' + ((mC3 + mC4)/2) + ' ' + (bandTop + 3) +
      ' L ' + ((mC3 + mC4)/2 - 0.3) + ' ' + (bandBot - 1);
  }

  return {
    type: t,
    cellW: cellWidth(num),
    outlineD: outlineD,
    occlusalBandD: occlusalBandD,
    occlusalDetailD: occlusalDetailD,
    surfaces: { B: bRect, O: oRect, L: lRect, left: leftRect, right: rightRect },
    centerKey: oRect.key,
    leftKey: leftKey,
    rightKey: rightKey,
    roots: roots,
    cervicalY: crownBot,
    crownL: crownL, crownR: crownR,
    cejL: cejL, cejR: cejR,
    facialGrooveD: facialGrooveD,
    facialLobeD: facialLobeD,
    crownTop: crownTop, crownH: crownH,
    furcationY: (typeof trunkY !== 'undefined') ? trunkY : (typeof trunkY3 !== 'undefined') ? trunkY3 : null,
    rootBot: rootBot   /* v429: ذروةُ الجذر — تقرؤها ✕ القلع المخطّط فقط */
  };
}

/* ── Extraction / Bridge helpers ── */
function isExtracted(num) {
  var sm = teethMap[String(num)] || {};
  if (isExtractionKey(sm.WHOLE)) return true;
  // Legacy: any surface marked as extracted
  for (var k in sm) {
    if (isExtractionKey(sm[k])) return true;
  }
  return false;
}
/* ═══ v429: القلع المخطّط — فصلُ «الرسم» عن «الأهلية» ═══════════════════════════
   isExtracted() تبقى عمياءَ عن الحالة **عمداً**: هي مسندُ الأهلية الذي تقرؤه الجسور
   والزرع والبريو ومنتقي العلاجات (قلعٌ مخطّط يفتح الزراعة/الجسر للتخطيط فوراً —
   pp-modules.js isAllowed/batchAllowed/examAllowed)، وتغييرُها يكسر مخططاتٍ قائمة.
   الراسمُ وحده يسأل isExtractionDone(): مفتاحُ قلعٍ بحالةٍ ليست «مخطط/محوّل» ⇒ الشبحُ
   المنقّط؛ وإلا يُرسم السن قائماً بكل علاجاته و✕ بلون حالته فوقه — نمط Open Dental
   («X كبيرة عند التخطيط، ويُخفى السن عند الإنجاز/الموجود مسبقاً»). Referred = ما زال بالفم. */
function extractionSurfaceOf(num) {
  var sm = teethMap[String(num)] || {};
  if (isExtractionKey(sm.WHOLE)) return 'WHOLE';
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit') continue;
    if (isExtractionKey(sm[k])) return k;
  }
  return null;
}
function extractionStatusIsOpen(st) { return st === 'planned' || st === 'referred'; }
function isExtractionPlanned(num) {
  var sf = extractionSurfaceOf(num);
  return !!sf && extractionStatusIsOpen(getStatus(num, sf));
}
function isExtractionDone(num) {
  var sf = extractionSurfaceOf(num);
  return !!sf && !extractionStatusIsOpen(getStatus(num, sf));
}
/* ✕ القلع المخطّط (وجهي/إطباقي): خطّان بلون الحالة عبر السن كاملاً، بلا أحداث مؤشّر
   فتبقى أسطحُ السن قابلةً للنقر تحته. */
function plannedExtractionMarkColor(st) {
  return (typeof STATUS_COLORS !== 'undefined' && (STATUS_COLORS[st] || STATUS_COLORS.planned)) || 'currentColor';   /* لونُ الحالة من مصدره الواحد — لا لون محفور */
}

/* ═══ v430 (M152): مكتبةُ الحالاتِ السريرية — مدمجةٌ بالكود لا بذرُ كتالوج ═══════════
   سابقةُ POST_OP_LIBRARY: تصل كلَّ عيادةٍ فوراً، وتصحيحُ نصٍّ سريريٍّ يُشحن مرةً
   للجميع — بلا صفوفٍ بكتالوج كل طبيب وبلا ترحيلٍ للعيادات القائمة.
   البنيةُ نفسُها كصفِّ علاج (id/name/fill/stroke/target_part…) فتمرّ بكل مسارات
   المخطط القائمة بلا استثناء: `getTreatment` بـpp-core.js يرتدّ إليها كنقطةِ خنقٍ
   واحدة، والتوجيهُ والتلميحُ والألوان تعمل كما هي.
   المالُ صفرٌ بالتعريف: الحالة تُحفظ دائماً بـ`status='condition'` (مقفولة)، وصفوفُ
   `condition` لا تُنشئ سطراً بالسجل أبداً — ومعها حارسٌ صريحٌ بمسار الدفعة أيضاً.
   التخزين (M152): حالةُ السن كاملاً على سطحٍ محجوز `COND` — نفس سابقة SPACER/SOCKET
   فلا تزاحم WHOLE (قلع/زرع/أشعة) ولا CROWN_FULL؛ وحالاتُ السطح (بقعة · تماس مفتوح)
   تبقى على سطحها الحقيقي. */
var COND_SURFACE = 'COND';
/* v434 (بلاغ المالك بعد التجريب): نطاقُ كلِّ حالةٍ يتبع تشريحَها لا راحةَ التخزين —
   القلحُ والارتدادُ والحساسيةُ **مواضعُ سطحية** (تُسجَّل على السطح المنقور: لثوي/دهليزي/
   حنكي…)، والكسرُ قد يكون **تاجياً أو جذرياً** فيتبع ما نقره الطبيب حرفاً بحرف،
   والتماسُ المفتوح بين سنّين ⇒ إنسي/وحشي حصراً. وحدَها الحالاتُ التي لا موضعَ سطحيّاً
   لها (خراج · جذر متبقٍّ · انطمار) تبقى على السطح المحجوز COND.
   مطابقٌ لمفردات Dentrix Ascend: نخر/قلح/تآكل رموزُ **أسطح**، والخراجُ عند الذروة.
   scope: 'surface' = target_part 'crown' · 'both' = تاجٌ وجذر · 'tooth' = السن كاملاً.
   anchor: موضعُ الرمز حين يكون التخزينُ على COND فقط ('apex' = ذروة الجذر). */
var COND_DEFS = [
  { id:'cond-fracture',    name:'كسر',                fill:'#b91c1c', stroke:'#7f1d1d', scope:'both',    symbol:'fracture' },
  { id:'cond-sensitivity', name:'حساسية عاجية',       fill:'#0ea5e9', stroke:'#075985', scope:'surface', symbol:'waves'    },
  { id:'cond-calculus',    name:'قلح',                fill:'#a16207', stroke:'#713f12', scope:'surface', symbol:'hatch'    },
  { id:'cond-recession',   name:'انحسار لثوي',        fill:'#f472b6', stroke:'#9d174d', scope:'surface', symbol:'chevron', draw:'gum', anchor:'cej' },
  { id:'cond-abscess',     name:'خراج',               fill:'#dc2626', stroke:'#7f1d1d', scope:'tooth',   symbol:'abscess', anchor:'apex' },
  { id:'cond-retained',    name:'جذر متبقٍّ (بقايا جذر)', fill:'#78716c', stroke:'#44403c', scope:'tooth', symbol:'retained', draw:'no-crown' },
  { id:'cond-impacted',    name:'انطمار',             fill:'#7c3aed', stroke:'#4c1d95', scope:'tooth',   symbol:'impacted', draw:'impacted' },
  { id:'cond-white-spot',  name:'بقعة بيضاء (إزالة تمعدن)', fill:'#e5e7eb', stroke:'#6b7280', scope:'surface', symbol:'ring' },
  { id:'cond-open-contact',name:'تماس مفتوح (فراغ بين سنّين)', fill:'#0d9488', stroke:'#115e59', scope:'surface', symbol:'gap', only:['M','D'] },
  /* C3 (v489): «غير بازغ» — سنٌّ لم يطلع **بعد** وطريقُه سالك (نموٌّ طبيعي، أرحاءُ طفلٍ
     دائمة مثلاً) — يختلف عن «انطمار» (محبوسٌ يحتاج تدخّلاً): يُرسم **بمكانه باهتاً بحدٍّ
     منقّط** لا مُزاحاً. رمزُه «U» (اصطلاحُ Dentrix لكود Unerupted). ولا مواقعَ سبرٍ له
     ⇒ يُستثنى من البريو (perio:'skip'). التخزين على COND — M152 تكفي، بلا ترحيل. */
  { id:'cond-unerupted',   name:'غير بازغ',           fill:'#94a3b8', stroke:'#475569', scope:'tooth',   symbol:'unerupted', draw:'unerupted', perio:'skip' }
];
/* تُبنى مرةً بشكلِ صفِّ علاجٍ كامل: كلُّ قارئٍ للكتالوج يجدُ ما يتوقّعه. */
var COND_LIBRARY = COND_DEFS.map(function(c){
  return { id:c.id, name:c.name, label:c.name, fill:c.fill, stroke:c.stroke,
           price:0, currency:'SYP', price_overrides:{},
           target_part:(c.scope === 'surface') ? 'crown' : (c.scope === 'both' ? 'both' : 'whole'),
           category:'condition', is_active:true, is_favorite:false, needs_lab:false,
           post_extraction:false, dentition_scope:'all', accepts_units:false,
           is_bundle:false, builtin:true, default_note:'', completion_note:'', layman_name:'',
           is_condition:true, cond_scope:c.scope, symbol:c.symbol,
           cond_anchor:c.anchor || null, cond_only:c.only || null, cond_draw:c.draw || null,
           cond_perio:c.perio || null };
});
function getCondition(id){
  if (!id) return null;
  for (var i=0;i<COND_LIBRARY.length;i++) if (COND_LIBRARY[i].id === id) return COND_LIBRARY[i];
  return null;
}
function isConditionKey(key){ return !!getCondition(key); }
/* كلُّ صفوف السن حالاتُ مكتبة؟ (تُستدعى فقط حين تكون الحالةُ المسيطرة 'condition'،
   وعندها لا يوجد صفٌّ بحالةٍ أخرى أصلاً). تقرؤها طبقتا التعتيم: الوجهي والإطباقي. */
function condOnlyLibraryRows(num){
  var sm = teethMap[String(num)] || {}, any = false;
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || !sm[k]) continue;
    if (!isConditionKey(sm[k])) return false;
    any = true;
  }
  return any;
}
/* v435: حالاتٌ تغيّر **تشريحَ** الرسم لا ترمزَه فقط:
   «جذر متبقٍّ» ⇒ لا تاجَ أصلاً (draw='no-crown') · «انحسار لثوي» ⇒ خطُّ اللثة المرسوم
   ينزاح نحو الذروة فينكشف جزءٌ من الجذر (draw='gum'). المسندان يقرآن خريطةَ السن
   المفلترة نفسها التي يرسم منها buildTooth، فشريحةُ الفلترة تسري عليهما تلقائياً. */
function condDrawFlag(sm, flag){
  if (!sm) return false;
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || !sm[k]) continue;
    var d = getCondition(sm[k]);
    if (d && d.cond_draw === flag) return true;
  }
  return false;
}
/* مقدارُ الانزياح اللثوي بوحدات viewBox (التاجُ ~70 وحدة ≈ 10مم) ⇒ ~1.7مم: واضحٌ بلا مبالغة */
var COND_GUM_SHIFT = 12;
/* إزاحةُ السن المنطمر نحو الجذر (وحدات viewBox) — ~2مم: يُقرأ خارج مستوى الإطباق بلا خروجٍ عن الخلية */
var COND_IMPACT_SHIFT = 26;
/* تصغيرُ ظلّه بالمنظر الإطباقي — سنٌّ لم يبزغ لا يملك سطحاً إطباقياً بكامل حجمه */
var COND_IMPACT_OCC_SCALE = 0.5;
/* C3: شفافيةُ جسم السن غير البازغ بالمنظرين — يُقرأ «موجودٌ بمكانه ولم يظهر بعد»؛
   أخفُّ من «مخطّط» (0.55) كي لا يُقرأ كحالة علاج، والحدُّ المنقّط يميّزه نهائياً. */
var COND_UNERUPTED_OPACITY = 0.38;
/* C3: سنٌّ لا مواقعَ سبرٍ له (غير بازغ) — يقرؤه perioIsExtracted بـpp-modules.js */
function condPerioSkip(sm){
  if (!sm) return false;
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || !sm[k]) continue;
    var d = getCondition(sm[k]);
    if (d && d.cond_perio === 'skip') return true;
  }
  return false;
}
/* تعارضُ سطح: حالةُ سطحٍ لا تُكتب فوق علاجٍ مسجَّل على السطح نفسه أو على ترميبٍ مركّبٍ
   يشمله — المفتاحُ الأساسي صفٌّ واحدٌ لكل سطح، فالكتابةُ كانت ستمحو العلاج بصمت. */
function condSurfaceConflict(num, surf){
  var sm = teethMap[String(num)] || {}, target = String(surf || '');
  var isRootTarget = /^R[123]$/.test(target), letters = target.split('');
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || !sm[k]) continue;
    if (isConditionKey(sm[k])) continue;                 // حالةٌ أخرى تُستبدل بلا مانع
    if (isRootTarget) {                                  /* v434: الجذرُ المنقور محجوزٌ بعلاجٍ لبّي؟ */
      if (/^R[123]+$/.test(k) && k.indexOf(target) !== -1) return k;
      continue;
    }
    if (!/^[MODBLIV]+$/.test(k)) continue;               // أسطحُ التاج وحدها
    for (var i = 0; i < letters.length; i++) if (k.indexOf(letters[i]) !== -1) return k;
  }
  return null;
}
/* v434: حالةٌ محصورةٌ بأسطحٍ بعينها (التماسُ المفتوح بين سنّين ⇒ إنسي/وحشي).
   تُعيد رسالةَ الرفض أو null. */
function condSurfaceNotAllowed(def, surf){
  if (!def || !def.cond_only) return null;
  var s = String(surf || '');
  for (var i = 0; i < def.cond_only.length; i++) if (s === def.cond_only[i]) return null;
  return '🩺 «' + def.name + '» يُسجَّل على السطح الإنسي أو الوحشي (نقطة التماس مع السن المجاور)';
}
/* حالةُ سنٍّ على مستوى السن (سطح COND) — تقرؤها الرسومُ والتلميحُ وزرُّ الإزالة */
function toothConditionKey(num){
  var sm = teethMap[String(num)] || {};
  return isConditionKey(sm[COND_SURFACE]) ? sm[COND_SURFACE] : null;
}
/* رمزُ الحالة: أشكالٌ هندسية صرفة (لا محارف) بلون الحالة — نمطُ مفردات Dentrix
   Ascend للحالات. يُرسم داخل مجموعةِ السن، ويُعاد قلبُه حول مركزه بالفك العلوي
   (المجموعةُ مقلوبةٌ عمودياً) فيبقى معتدلاً. بلا أحداثِ مؤشّر: الأسطحُ تحته تُنقر. */
/* v434: أين يُرسم الرمز؟ حيث سُجِّل بالضبط — لا مركزَ التاج دائماً.
   جذر (R1/R2/R3) ⇒ منتصفُ القناة · سطحُ تاجٍ ⇒ مركزُ مستطيله · COND ⇒ الذروةُ للخراج
   ووسطُ التاج لغيره. */
function condAnchorFor(anat, key, def){
  var i;
  if (/^R[123]$/.test(key)) {
    for (i = 0; i < anat.roots.length; i++) {
      var r = anat.roots[i];
      if (r.key !== key) continue;
      return { x: (r.canalTopCx + r.canalApexCx) / 2,
               y: r.canalTop + (r.canalBot - r.canalTop) * 0.55, size: 22 };
    }
  }
  if (key === COND_SURFACE) {
    if (def && def.cond_anchor === 'apex' && anat.roots.length) {
      var deep = anat.roots[0];
      for (i = 1; i < anat.roots.length; i++) if (anat.roots[i].canalBot > deep.canalBot) deep = anat.roots[i];
      return { x: deep.canalApexCx, y: deep.canalBot - 7, size: 20 };
    }
    return { x: 50, y: anat.crownTop + anat.crownH * 0.5, size: 26 };
  }
  /* v437: حالةٌ مرساتُها «حدُّ التاج والجذر» (الانحسار) — تُرسم بمنتصف شريط الجذر
     المنكشف بين خطِّ الـCEJ الثابت وخطِّ اللثة المُزاح، لا بمركز مستطيل السطح. */
  if (def && def.cond_anchor === 'cej') {
    return { x: 50, y: anat.cervicalY + (typeof COND_GUM_SHIFT !== 'undefined' ? COND_GUM_SHIFT : 12) * 0.5, size: 24 };
  }
  var rects = [anat.surfaces.O, anat.surfaces.B, anat.surfaces.L, anat.surfaces.left, anat.surfaces.right];
  for (i = 0; i < rects.length; i++) {
    var rr = rects[i];
    if (rr && rr.key === key) {
      return { x: rr.x + rr.w / 2, y: rr.y + rr.h / 2, size: Math.min(rr.w, rr.h) * 0.9 + 6 };
    }
  }
  return { x: 50, y: anat.crownTop + anat.crownH * 0.5, size: 26 };   /* مركّبٌ أو لساني */
}
function conditionSymbolSvg(def, cx, cy, size, isUpper){
  if (!def || !def.symbol) return '';
  var k = def.symbol, c = def.stroke || '#444', f = def.fill || '#888', r = size/2, g = '';
  if (k === 'fracture') {
    g = '<path d="M ' + (cx-r*0.45) + ' ' + (cy-r) + ' L ' + (cx+r*0.35) + ' ' + (cy-r*0.25)
      + ' L ' + (cx-r*0.35) + ' ' + (cy+r*0.25) + ' L ' + (cx+r*0.45) + ' ' + (cy+r) + '" '
      + 'fill="none" stroke="' + c + '" stroke-width="' + (size*0.16) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (k === 'waves') {
    for (var w=-1; w<=1; w++) {
      var wy = cy + w*r*0.55;
      g += '<path d="M ' + (cx-r) + ' ' + wy + ' Q ' + (cx-r*0.5) + ' ' + (wy-r*0.35) + ' ' + cx + ' ' + wy
         + ' Q ' + (cx+r*0.5) + ' ' + (wy+r*0.35) + ' ' + (cx+r) + ' ' + wy + '" '
         + 'fill="none" stroke="' + c + '" stroke-width="' + (size*0.12) + '" stroke-linecap="round"/>';
    }
  } else if (k === 'hatch') {
    g = '<rect x="' + (cx-r) + '" y="' + (cy-r*0.6) + '" width="' + (2*r) + '" height="' + (1.2*r) + '" rx="' + (r*0.25) + '" fill="' + f + '" fill-opacity="0.35" stroke="' + c + '" stroke-width="' + (size*0.09) + '"/>';
    for (var h=-1; h<=1; h++) {
      g += '<line x1="' + (cx + h*r*0.55 - r*0.28) + '" y1="' + (cy+r*0.5) + '" x2="' + (cx + h*r*0.55 + r*0.28) + '" y2="' + (cy-r*0.5) + '" stroke="' + c + '" stroke-width="' + (size*0.1) + '" stroke-linecap="round"/>';
    }
  } else if (k === 'chevron') {
    /* v437: عودةُ شكل v430 حرفياً بطلب المالك (خطُّ الحافة + السهم تحته) — تغيّر موضعُه
       لا شكلُه: صار عند حدِّ التاج والجذر (anchor:'cej'). */
    g = '<path d="M ' + (cx-r) + ' ' + (cy-r*0.45) + ' L ' + cx + ' ' + (cy+r*0.5) + ' L ' + (cx+r) + ' ' + (cy-r*0.45) + '" '
      + 'fill="none" stroke="' + c + '" stroke-width="' + (size*0.15) + '" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<line x1="' + (cx-r) + '" y1="' + (cy-r*0.9) + '" x2="' + (cx+r) + '" y2="' + (cy-r*0.9) + '" stroke="' + c + '" stroke-width="' + (size*0.11) + '" stroke-linecap="round"/>';
  } else if (k === 'abscess') {
    g = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r*0.95) + '" fill="' + f + '" fill-opacity="0.22" stroke="none"/>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r*0.42) + '" fill="' + c + '"/>';
  } else if (k === 'retained') {
    g = '<path d="M ' + (cx-r*0.85) + ' ' + (cy-r*0.7) + ' L ' + (cx+r*0.85) + ' ' + (cy-r*0.7) + ' L ' + cx + ' ' + (cy+r) + ' Z" '
      + 'fill="' + f + '" fill-opacity="0.35" stroke="' + c + '" stroke-width="' + (size*0.11) + '" stroke-linejoin="round"/>';
  } else if (k === 'impacted') {
    g = '<path d="M ' + (cx-r*0.9) + ' ' + (cy+r*0.9) + ' L ' + (cx+r*0.9) + ' ' + (cy-r*0.9) + '" stroke="' + c + '" stroke-width="' + (size*0.15) + '" stroke-linecap="round"/>'
      + '<path d="M ' + (cx+r*0.15) + ' ' + (cy-r*0.9) + ' L ' + (cx+r*0.9) + ' ' + (cy-r*0.9) + ' L ' + (cx+r*0.9) + ' ' + (cy-r*0.15) + '" '
      + 'fill="none" stroke="' + c + '" stroke-width="' + (size*0.13) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (k === 'unerupted') {
    /* C3: حرفُ «U» هندسياً (اصطلاحُ Dentrix) — مفتوحُ الأعلى، بلا تعبئة */
    g = '<path d="M ' + (cx-r*0.62) + ' ' + (cy-r*0.85) + ' L ' + (cx-r*0.62) + ' ' + (cy+r*0.15)
      + ' Q ' + (cx-r*0.62) + ' ' + (cy+r*0.9) + ' ' + cx + ' ' + (cy+r*0.9)
      + ' Q ' + (cx+r*0.62) + ' ' + (cy+r*0.9) + ' ' + (cx+r*0.62) + ' ' + (cy+r*0.15)
      + ' L ' + (cx+r*0.62) + ' ' + (cy-r*0.85) + '" fill="none" stroke="' + c + '" stroke-width="' + (size*0.15) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (k === 'ring') {
    g = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r*0.8) + '" fill="none" stroke="' + c + '" stroke-width="' + (size*0.15) + '"/>';
  } else if (k === 'gap') {
    g = '<line x1="' + (cx-r*0.55) + '" y1="' + (cy-r*0.8) + '" x2="' + (cx-r*0.55) + '" y2="' + (cy+r*0.8) + '" stroke="' + c + '" stroke-width="' + (size*0.15) + '" stroke-linecap="round"/>'
      + '<line x1="' + (cx+r*0.55) + '" y1="' + (cy-r*0.8) + '" x2="' + (cx+r*0.55) + '" y2="' + (cy+r*0.8) + '" stroke="' + c + '" stroke-width="' + (size*0.15) + '" stroke-linecap="round"/>';
  } else return '';
  /* كلُّ الرموز تُقلب مضاداً حول مركزها بالفك العلوي فتبقى معتدلةً على الشاشة
     (v437: أُلغي استثناءُ v436 مع عودة شكل الانحسار القديم). */
  var open = isUpper
    ? '<g class="cond-sym" transform="translate(0,' + (2*cy) + ') scale(1,-1)" pointer-events="none">'
    : '<g class="cond-sym" pointer-events="none">';
  return open + g + '</g>';
}

/* ── Space maintainer (حافظ مسافة) helpers ──
   Detected by key/name (ortho precedent) so old clinics whose stored row still has
   target_part='arch' work without any data migration. All spacer behavior is gated
   on window.__m61 (Migration 61 applied) — pre-migration the UI is unchanged. */
/* M146: نوعُ الأسنان على مستوى العلاج (مكافئُ شرط Primary/Permanent بـAuto Codes عند
   Open Dental). مصدرٌ واحد تقرؤه المداخلُ الثلاثة التي تقرن علاجاً بسنّ: مودال السن
   (isAllowed) · التحديد المتعدد (batchAllowed) · الفحص الأولي (examAllowed).
   أيُّ قيمةٍ غير 'primary'/'permanent' = الكل ⇒ الكاشُ القديم وما قبل M146 بلا حجب. */
function txDentitionOk(t, n){
  var sc = t && t.dentition_scope;
  if (sc !== 'primary' && sc !== 'permanent') return true;
  return (sc === 'primary') === isPrimaryTooth(n);
}
function txDentitionMsg(t){
  return (t && t.dentition_scope === 'primary') ? 'علاجٌ للأسنان اللبنية فقط' : 'علاجٌ للأسنان الدائمة فقط';
}
function isSpacerTreatment(t){
  if (!t) return false;
  var key = t.id || t.treatment_key || '';
  if (key === 'pedo-spacer') return true;
  return /حافظ\s*مسافة|spacer/i.test(key + ' ' + (t.name || ''));
}
function isSpacerKey(key){ return key ? isSpacerTreatment(getTreatment(key)) : false; }
function toothHasSpacer(num){
  var sm = teethMap[String(num)];
  return !!(sm && sm.SPACER && isSpacerKey(sm.SPACER));
}
function spacerColorFor(num){
  var sm = teethMap[String(num)]; if (!sm || !sm.SPACER) return null;
  var tr = getTreatment(sm.SPACER); return (tr && tr.fill) || '#d946ef';
}
/* Post-extraction site treatment (M63): stored on surface='SOCKET' of an extracted tooth,
   a separate row from the extraction (WHOLE='extracted') so the ghost is kept and the
   treatment colour renders on top. surface is a pure clinical LABEL — zero financial effect. */
function toothHasSocket(num){
  var sm = teethMap[String(num)];
  return !!(sm && sm.SOCKET);
}
function socketColorFor(num){
  var sm = teethMap[String(num)]; if (!sm || !sm.SOCKET) return null;
  var tr = getTreatment(sm.SOCKET); return (tr && tr.fill) || '#f97316';
}
/* Band & loop anatomy: the BAND goes on the abutment DISTAL to the gap (farther
   from the midline); the loop only RESTS against the mesial tooth — nothing is
   charted or drawn on it. Falls back to the same-quadrant abutment when the gap
   touches the midline. */
function spacerBandToothOf(gapNum, abA, abB){
  function pos(n){ return parseInt(n,10) % 10; }
  var gq = normQuad(gapNum), aq = normQuad(abA), bq = normQuad(abB);
  var inA = (aq === gq), inB = (bq === gq);
  if (inA && inB) return pos(abA) > pos(abB) ? abA : abB;
  if (inA) return abA;
  if (inB) return abB;
  return abB;
}

/* Contiguous run of SPACER-marked teeth around num (abutments + gap). */
function spacerUnitOf(num){
  var arch = archOf(num), idx = arch.indexOf(parseInt(num,10));
  if (idx < 0) return [parseInt(num,10)];
  var s = idx, e = idx;
  while (s > 0 && toothHasSpacer(arch[s-1])) s--;
  while (e < arch.length - 1 && toothHasSpacer(arch[e+1])) e++;
  return arch.slice(s, e + 1);
}

/* Is this stored treatment_key a bridge treatment (built-in 'bridge' or any custom variant)? */
function isBridgeKey(key) {
  if (!key) return false;
  if (key === 'bridge') return true;
  var tr = getTreatment(key);
  return !!(tr && tr.target_part === 'bridge');
}

/* Is this stored treatment_key an extraction (built-in 'extracted' or any custom variant)? */
function isExtractionKey(key) {
  if (!key) return false;
  if (key === 'extracted') return true;
  var tr = getTreatment(key);
  return !!(tr && tr.target_part === 'extraction');
}

/* Get the treatment status for a surface of a tooth.
   Returns: 'planned' / 'completed' / 'existing_current' / 'existing_other' / 'existing' (legacy) / 'referred'
   Default 'completed' for legacy data without a stored status. */
function getStatus(num, surface) {
  var sm = teethMap[String(num)] || {};
  if (sm.__status && sm.__status[surface]) return sm.__status[surface];
  return 'completed';
}

/* Get the dominant status for a tooth (used for badge/indicator at tooth level).
   Priority: planned > completed > existing_current > existing_other > existing (legacy) > referred.
   EC outranks EO because it represents your own historical work (more clinically relevant).
   Legacy 'existing' falls between EO and referred so pre-migration data still surfaces. */
function getDominantStatus(num) {
  var sm = teethMap[String(num)] || {};
  if (!sm.__status) return 'completed';
  var statuses = [];
  for (var k in sm) {
    if (k === '__status') continue;
    var st = sm.__status[k] || 'completed';
    statuses.push(st);
  }
  if (statuses.indexOf('planned') >= 0) return 'planned';
  if (statuses.indexOf('completed') >= 0) return 'completed';
  if (statuses.indexOf('existing_current') >= 0) return 'existing_current';
  if (statuses.indexOf('existing_other') >= 0) return 'existing_other';
  if (statuses.indexOf('existing') >= 0) return 'existing';
  if (statuses.indexOf('referred') >= 0) return 'referred';
  if (statuses.indexOf('condition') >= 0) return 'condition';  // Phase 3 Feature F: weakest — actual treatments win
  return 'completed';
}

/* Is this stored treatment_key an implant (built-in 'implant' or any custom variant)? */
function isImplantKey(key) {
  if (!key) return false;
  if (key === 'implant') return true;
  var tr = getTreatment(key);
  return !!(tr && tr.target_part === 'implant');
}

function isBridgeTooth(num) {
  var sm = teethMap[String(num)] || {};
  // A tooth is a bridge member if it has any bridge treatment in any surface
  for (var k in sm) {
    if (isBridgeKey(sm[k])) return true;
  }
  return false;
}
/* Is this tooth an abutment (not a pontic)? Abutments have bridge at WHOLE; pontics have it at PONTIC */
function isBridgeAbut(num) {
  var sm = teethMap[String(num)] || {};
  return isBridgeKey(sm.WHOLE);
}

/* M85.2 — is this tooth a PONTIC of a bridge unit? Two storage shapes count: the
   canonical PONTIC row, and the legacy pair (WHOLE='extracted' + a bridge row on
   another surface). An ULTRA-legacy pontic written straight into WHOLE='bridge'
   is indistinguishable from a retainer and is deliberately NOT counted here. */
function isPonticTooth(num) {
  var sm = teethMap[String(num)] || {};
  if (isBridgeKey(sm.PONTIC)) return true;
  return isBridgeTooth(num) && isExtracted(num);
}
/* M85.2 — the contiguous run of bridge teeth containing `num`, in arch order.
   A neighbour whose unit id differs from `num`'s own id (including null vs uuid)
   belongs to another generation/unit and terminates the run: M85 units are exact,
   so they are never merged with legacy rows by adjacency. */
function bridgeRunOf(num) {
  var arch = (UPPER_T.indexOf(num) >= 0) ? UPPER_T : LOWER_T;
  var i0 = arch.indexOf(num);
  if (i0 < 0 || !isBridgeTooth(num)) return [];
  var own = toothUnitId(num);
  var s = i0, e = i0;
  while (s > 0 && isBridgeTooth(arch[s-1]) && toothUnitId(arch[s-1]) === own) s--;
  while (e < arch.length-1 && isBridgeTooth(arch[e+1]) && toothUnitId(arch[e+1]) === own) e++;
  return arch.slice(s, e+1);
}
/* M85.2 — the prosthetic unit that owns `num` inside a LEGACY (uuid-less) run.
   Legacy rows carry no unit id, so one contiguous run may hold several bridges.
   The single invariant legacy data still preserves is clinical: a bridge spans a
   gap, so every unit holds >=1 pontic. Therefore a retainer<->retainer contact is
   a REAL boundary between two units only when a pontic remains on BOTH sides of
   it; otherwise that touching retainer is a double/pier retainer of the SAME unit.
   (The previous rule split at every retainer<->retainer contact — that is what
   stranded the second retainer of a double-abutment bridge as a lone abutment,
   and it split asymmetrically depending on which tooth was clicked.) */
function legacyBridgeUnitOf(num) {
  var run = bridgeRunOf(num);
  if (!run.length) return [num];
  function anyPontic(list) {
    for (var i = 0; i < list.length; i++) { if (isPonticTooth(list[i])) return true; }
    return false;
  }
  var segs = [], cur = [run[0]];
  for (var k = 1; k < run.length; k++) {
    if (!isPonticTooth(run[k-1]) && !isPonticTooth(run[k])
        && anyPontic(cur) && anyPontic(run.slice(k))) {
      segs.push(cur); cur = [];
    }
    cur.push(run[k]);
  }
  segs.push(cur);
  for (var g = 0; g < segs.length; g++) {
    if (segs[g].indexOf(num) >= 0) return segs[g];
  }
  return [num];
}

/* Is this tooth an implant? */
function isImplant(num) {
  var sm = teethMap[String(num)] || {};
  if (isImplantKey(sm.WHOLE)) return true;
  // Legacy fallback: any surface marked as implant
  for (var k in sm) {
    if (isImplantKey(sm[k])) return true;
  }
  return false;
}

/* Find bridge abutments: search outward from this missing tooth in BOTH directions
   along the same arch (upper or lower). Returns { mesial: num|null, distal: num|null,
   gap: [nums], implantBlock: {mesial, distal} }.
   "gap" = the contiguous missing teeth that share this bridge.
   IMPLANTS BLOCK the walk (they used to be silently skipped): a conventional
   bridge can never span across an implant — the body would have to cross the
   fixture site, and a natural tooth beyond it is not a valid abutment for this
   gap. The blocked side reports null + implantBlock so the caller can show a
   specific clinical message. An implant BEYOND the natural abutment is never
   reached (the walk stops at the abutment first) and stays untouched. */
function findBridgeAbutments(num) {
  var arch = archOf(num);
  var idx = arch.indexOf(num);
  if (idx < 0) return { mesial:null, distal:null, gap:[num], implantBlock:{mesial:false, distal:false} };
  // Walk LEFT: cross extracted teeth (multi-tooth gap); stop at first natural tooth
  var leftAbut = null, gap = [num], leftImplant = false;
  for (var i = idx - 1; i >= 0; i--) {
    if (isExtracted(arch[i])) { gap.unshift(arch[i]); continue; }
    if (isImplant(arch[i])) { leftImplant = true; break; }  // implant blocks — no abutment this side
    leftAbut = arch[i];
    break;
  }
  // Walk RIGHT
  var rightAbut = null, rightImplant = false;
  for (var j = idx + 1; j < arch.length; j++) {
    if (isExtracted(arch[j])) { gap.push(arch[j]); continue; }
    if (isImplant(arch[j])) { rightImplant = true; break; }
    rightAbut = arch[j];
    break;
  }
  return { mesial: leftAbut, distal: rightAbut, gap: gap,
           implantBlock: { mesial: leftImplant, distal: rightImplant } };
}

/* Build a dashed "ghost" silhouette for an extracted tooth (crown + roots),
   mirroring the dashed outline used in the occlusal view. The whole shape is
   clickable and opens the same modal as before (openToothModal(num,'WHOLE')). */
function extractedTipRows(num, sm) {
  var rows = '';
  var stBadge = function(sk){
    var st = (sm.__status && sm.__status[sk]) || null;
    if (!st || st === 'completed') return '';
    var col = STATUS_COLORS[st] || '#888';
    return ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:' + col + '33;color:' + col
         + ';font-size:10px;font-weight:700;margin-right:4px;">' + (STATUS_LABELS[st] || st) + '</span>';
  };
  var row = function(sk, label){
    var k = sm[sk]; if (!k) return;
    var t = getTreatment(k);
    rows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(T_FILL[k] || '#888') + '"></span><b>' + label + ':</b> '
          + escapeHtml(t ? t.name : k) + stBadge(sk) + tipRowOptBadge(num, sk, k, sm) + '</div>';
  };
  row('WHOLE', 'السن كاملاً');
  row('SOCKET', 'موقع القلع');
  row('SPACER', 'حافظ مسافة');
  row('CROWN_FULL', 'التاج كامل');
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || k === 'WHOLE' || k === 'SOCKET' || k === 'SPACER' || k === 'CROWN_FULL' || k === 'PONTIC') continue;
    if (!sm[k]) continue;
    row(k, isRootCode(k) ? rootAreaLabelFor(k, num) : surfLabelFor(k, num));
  }
  return rows + sessionTipRows(num, sm);
}
function buildExtractedPlaceholder(num, isUpper) {
  var anat = toothAnatomy(num);
  var W = anat.cellW;
  var H = Math.round(W * 2.1);
  var transform = isUpper ? 'transform="translate(0,210) scale(1,-1)"' : '';
  var DASH = 'fill="none" stroke="#9aa3b0" stroke-width="2.6" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"';
  var ghost = '';
  // موقع القلع (M63): a post-extraction site treatment (طعم عظمي / ضماد سنخ / …) fills the
  // silhouette in the treatment colour UNDERNEATH the dashed extraction outline — the tooth
  // reads "extracted (dashed) + treated (colour)". The dashes stay on top so it's never
  // mistaken for a present tooth.
  if (typeof toothHasSocket === 'function' && toothHasSocket(num)) {
    var _skc = socketColorFor(num) || '#f97316';
    ghost += '<path d="' + anat.outlineD + '" fill="' + _skc + '" fill-opacity="0.32" stroke="none"/>';
    for (var rk = 0; rk < anat.roots.length; rk++) {
      ghost += '<path d="' + anat.roots[rk].d + '" fill="' + _skc + '" fill-opacity="0.32" stroke="none"/>';
    }
  }
  ghost += '<path d="' + anat.outlineD + '" ' + DASH + '/>'; // crown silhouette (dashed, on top)
  for (var ri = 0; ri < anat.roots.length; ri++) {                // roots
    ghost += '<path d="' + anat.roots[ri].d + '" ' + DASH + '/>';
  }
  // حافظ مسافة: thin wire across the gap + ridge loop. Toward a SPACER-marked
  // neighbor the wire bleeds into the seam (visual continuity with the band);
  // toward the UNMARKED mesial tooth it stops at the cell edge — zero ink on it.
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(num)) {
    var _spc = spacerColorFor(num) || '#d946ef';
    var _spY = isPrimaryTooth(num) ? 44 : 57;
    var _gArr = archOf(num), _gIx = _gArr.indexOf(parseInt(num,10));
    var _gL = _gIx > 0 && toothHasSpacer(_gArr[_gIx - 1]);
    var _gR = _gIx >= 0 && _gIx < _gArr.length - 1 && toothHasSpacer(_gArr[_gIx + 1]);
    var _gx1 = _gL ? -24 : 4, _gx2 = _gR ? 124 : 96;
    ghost += '<line x1="' + _gx1 + '" y1="' + _spY + '" x2="' + _gx2 + '" y2="' + _spY + '" stroke="' + _spc + '" stroke-width="2.5" opacity="0.95" stroke-linecap="round"/>'
          +  '<path d="M 22 ' + _spY + ' Q 50 ' + (_spY + 26) + ' 78 ' + _spY + '" fill="none" stroke="' + _spc + '" stroke-width="2.5" opacity="0.95" stroke-linecap="round"/>';
  }
  var svg = '<svg class="tooth-shape extract-ghost" data-tooth="' + num + '" '
    + 'viewBox="0 0 100 210" width="' + W + '" height="' + H + '" '
    + 'xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">'
    + '<g ' + transform + '>' + ghost + '</g></svg>';
  var slot = '<div class="extract-slot" data-tooth="' + num + '" '
    + 'style="display:flex;align-items:center;justify-content:center;'
    + 'width:' + W + 'px;height:' + H + 'px;cursor:pointer;position:relative;'
    + 'border:none;background:transparent;" '
    + 'onclick="openToothModal(' + num + ', &quot;WHOLE&quot;)" '
    + 'title="السن ' + num + ' — مقلوع (اضغط لإضافة علاج/جسر/زراعة)">'
    + svg
    + '</div>';
  /* M145-g: خليةُ السن المقلوع (وجهياً) كانت بلا .tooth-tip إطلاقاً. قلعٌ **مخطّط** يحوّل السن
     لهذه الخلية فوراً، فكل ما عليه (تيجان مخطّطة بخياراتها، جلسات السجل) كان يختفي من التلميح
     لحظة تخطيط القلع — مع أن بياناته سليمة. نفس بنية buildTooth: صفوف المخطط ثم سجل الجلسات. */
  var tip_html = '<div class="tooth-tip">' + extractedTipRows(num, teethMap[String(num)] || {}) + '</div>';
  var num_html = '<div class="tooth-num">' + num + '</div>';
  var inner = isUpper ? (tip_html + slot + num_html) : (num_html + slot + tip_html);
  return '<div class="tooth-cell extract-cell" data-tooth-cell="' + num + '">' + inner + '</div>';
}

/* Pontic: a crown-only tooth (no root) colored in bridge color.
   Drawn in place of an extracted tooth that's part of a bridge unit.
   The crown is rendered in the SAME viewBox position as a natural crown
   (so it lines up vertically with adjacent abutments). */
function buildPonticTooth(num, isUpper) {
  var anat = toothAnatomy(num);
  var W = anat.cellW;
  var H = Math.round(W * 2.1);
  // Use the actual stored bridge key (could be 'bridge' or a custom variant like 'custom_xyz')
  var sm = teethMap[String(num)] || {};
  var bridgeKey = isBridgeKey(sm.PONTIC) ? sm.PONTIC : (isBridgeKey(sm.WHOLE) ? sm.WHOLE : 'bridge');
  var bridgeColor = (T_FILL && T_FILL[bridgeKey]) || '#dc2626';
  var bridgeStroke = (T_STROKE && T_STROKE[bridgeKey]) || '#991b1b';
  var gid = 'p' + num;
  var crownTop = 6;
  var crownBot = anat.cervicalY || 80;
  var transform = isUpper ? 'transform="translate(0,210) scale(1,-1)"' : '';
  // SVG occupies the FULL tooth cell (same as a natural tooth) so it stays in
  // the row flow at the same height. The clipPath restricts drawing to the crown area only.
  var svg = '<svg class="tooth-shape pontic-shape" data-tooth="' + num + '" data-bridge="1" '
    + 'viewBox="0 0 100 210" width="' + W + '" height="' + H + '" '
    + 'xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" '
    + 'style="cursor:pointer;" '
    + 'onclick="openToothModal(' + num + ', &quot;WHOLE&quot;)">'
    + '<defs>'
    + '<linearGradient id="pg' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="' + bridgeColor + '"/>'
      + '<stop offset="70%" stop-color="' + bridgeColor + '"/>'
      + '<stop offset="100%" stop-color="' + bridgeStroke + '"/>'
    + '</linearGradient>'
    + '<clipPath id="pclip' + gid + '">'
      + '<rect x="0" y="' + crownTop + '" width="100" height="' + (crownBot - crownTop) + '"/>'
    + '</clipPath>'
    + '</defs>'
    + '<g ' + transform + '>'
    + '<path d="' + anat.outlineD + '" fill="url(#pg' + gid + ')" '
      + 'stroke="' + bridgeStroke + '" stroke-width="1.2" stroke-linejoin="round" '
      + 'clip-path="url(#pclip' + gid + ')"/>'
    + '</g>'
    + '<title>السن ' + num + ' — جسر (دعامة وهمية)</title>'
    + '</svg>';
  // Wrap in tooth-cell (same as buildTooth) so it occupies the proper row slot with its number
  var num_html = '<div class="tooth-num">' + num + '</div>';
  /* M145-e: خليةُ الوهمي كانت بلا .tooth-tip إطلاقاً ⇒ لا تلميحَ داكن عليها (عنوان المتصفح فقط)،
     فلا الجسر ولا بدائله ولا الزرعة البديلة تظهر عند المرور. نفس بنية buildTooth. */
  var _psm = teethMap[String(num)] || {};
  var _pk = _psm.PONTIC, _ptr = _pk ? getTreatment(_pk) : null;
  var _pst = (_psm.__status && _psm.__status.PONTIC) || 'completed';
  var _pbc = STATUS_COLORS[_pst] || '#888';
  var _pbadge = (_pst === 'completed') ? '' : ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:' + _pbc + '33;color:' + _pbc
              + ';font-size:10px;font-weight:700;margin-right:4px;">' + (STATUS_LABELS[_pst] || _pst) + '</span>';
  var _ptip = '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml((_pk && T_FILL[_pk]) || bridgeColor) + '"></span><b>سن وهمي (جسر):</b> '
            + escapeHtml(_ptr ? _ptr.name : 'جسر') + _pbadge + tipUnitOptBadge(num, _pk, _pst) + '</div>'
            + sessionTipRows(num, _psm);
  var tip_html = '<div class="tooth-tip">' + _ptip + '</div>';
  var inner = isUpper ? (tip_html + svg + num_html) : (num_html + svg + tip_html);
  return '<div class="tooth-cell pontic-cell" data-tooth-cell="' + num + '" title="السن ' + num + ' — جسر">' + inner + '</div>';
}

/* Implant: renders a metallic screw fixture instead of a natural root, with a crown on top.
   The crown takes the implant treatment's color. */
function buildImplantTooth(num, isUpper) {
  var anat = toothAnatomy(num);
  var W = anat.cellW;
  var H = Math.round(W * 2.1);
  // Use the actual stored implant key (could be 'implant' or a custom variant like 'زراعة سويسرية')
  var sm = teethMap[String(num)] || {};
  var implantKey = 'implant';
  for (var k in sm) {
    if (isImplantKey(sm[k])) { implantKey = sm[k]; break; }
  }
  var implantColor = (T_FILL && T_FILL[implantKey]) || '#a78bfa';
  var implantStroke = (T_STROKE && T_STROKE[implantKey]) || '#7c5cbf';
  var screwBody = '#7a7d82';
  var screwHi = '#c6c9cd';
  var screwLo = '#3e4146';
  var gid = 'im' + num;
  var crownTop = 6;
  var crownBot = anat.cervicalY || 80;
  var transform = isUpper ? 'transform="translate(0,210) scale(1,-1)"' : '';
  // Screw geometry: vertical fixture below the cervical line
  var screwTop = crownBot + 2;  // small gap between crown and screw collar
  // Length = 70% of the natural-root distance (shortened by 30% per design)
  var screwBot = screwTop + Math.round((195 - screwTop) * 0.70);
  var screwW = (anat.crownR - anat.crownL) * 0.55;  // narrower than crown
  var screwCx = (anat.crownL + anat.crownR) / 2;
  var screwL = screwCx - screwW/2;
  var screwR = screwCx + screwW/2;
  // Threads: horizontal stripes inside the fixture
  var threadStart = screwTop + 8;
  var threadEnd = screwBot - 6;
  var threadStep = 5;
  var threadsD = '';
  for (var ty = threadStart; ty < threadEnd; ty += threadStep) {
    // Each thread is a thin V-shape (looks like a screw thread from the side)
    threadsD += 'M ' + screwL + ' ' + ty
              + ' L ' + (screwL + screwW * 0.18) + ' ' + (ty + threadStep * 0.5)
              + ' L ' + screwR + ' ' + ty + ' ';
  }
  var svg = '<svg class="tooth-shape implant-shape" data-tooth="' + num + '" data-implant="1" '
    + 'viewBox="0 0 100 210" width="' + W + '" height="' + H + '" '
    + 'xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" '
    + 'style="cursor:pointer;" '
    + 'onclick="openToothModal(' + num + ', &quot;WHOLE&quot;)">'
    + '<defs>'
    + '<linearGradient id="cg' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="' + implantColor + '"/>'
      + '<stop offset="70%" stop-color="' + implantColor + '"/>'
      + '<stop offset="100%" stop-color="' + implantStroke + '"/>'
    + '</linearGradient>'
    + '<linearGradient id="sg' + gid + '" x1="0" y1="0" x2="1" y2="0">'
      + '<stop offset="0%" stop-color="' + screwLo + '"/>'
      + '<stop offset="30%" stop-color="' + screwBody + '"/>'
      + '<stop offset="55%" stop-color="' + screwHi + '"/>'
      + '<stop offset="80%" stop-color="' + screwBody + '"/>'
      + '<stop offset="100%" stop-color="' + screwLo + '"/>'
    + '</linearGradient>'
    + '<clipPath id="cclip' + gid + '">'
      + '<rect x="0" y="' + crownTop + '" width="100" height="' + (crownBot - crownTop) + '"/>'
    + '</clipPath>'
    + '</defs>'
    + '<g ' + transform + '>'
    // Crown (clipped to crown area)
    + '<path d="' + anat.outlineD + '" fill="url(#cg' + gid + ')" '
      + 'stroke="' + implantStroke + '" stroke-width="1.2" stroke-linejoin="round" '
      + 'clip-path="url(#cclip' + gid + ')"/>'
    // Screw body (rounded rectangle with pointed apex)
    + '<path d="M ' + screwL + ' ' + screwTop
      + ' L ' + screwR + ' ' + screwTop
      + ' L ' + screwR + ' ' + (screwBot - 6)
      + ' Q ' + screwCx + ' ' + (screwBot + 4) + ' '
            + screwL + ' ' + (screwBot - 6)
      + ' Z" '
      + 'fill="url(#sg' + gid + ')" stroke="' + screwLo + '" stroke-width="0.8"/>'
    // Screw collar (slight wider band at the top, just below crown)
    + '<rect x="' + (screwL - 1.5) + '" y="' + screwTop + '" '
      + 'width="' + (screwW + 3) + '" height="5" '
      + 'fill="' + screwBody + '" stroke="' + screwLo + '" stroke-width="0.7"/>'
    // Threads (zig-zag pattern across the fixture)
    + '<path d="' + threadsD + '" fill="none" '
      + 'stroke="' + screwLo + '" stroke-width="0.6" opacity="0.85"/>'
    + '</g>'
    + '<title>السن ' + num + ' — زراعة</title>'
    + '</svg>';
  var num_html = '<div class="tooth-num">' + num + '</div>';
  var inner = isUpper ? (svg + num_html) : (num_html + svg);
  return '<div class="tooth-cell implant-cell" data-tooth-cell="' + num + '" title="السن ' + num + ' — زراعة">' + inner + '</div>';
}

/* v260: صفوف التلميح المستمدّة من سجل الجلسات.
   المخطّطُ يحمل صفاً واحداً لكل سطح (PK: doctor,patient,tooth,surface)، فحين
   تتشارك جلستان السطحَ نفسه (إعادة معالجة منجزة + وتد مخطّط على R1R2) لا يرى
   الطبيب إلا واحدة. هنا نُلحق بالتلميح كلَّ جلسة منجزة/مخطّطة على هذا السن
   لا يمثّلها صفُّ سطحها (علاجٌ مختلف أو حالةٌ مختلفة) — قراءةٌ صرفة، صفر كتابة،
   وصفر أثر على الرسم/الألوان (صفُّ السطح يبقى مصدر اللون). مخفيّة بالعرض
   التاريخي (E) كسائر طبقات «الآن». */
function sessionTreatmentKey(sess) {
  if (!sess) return null;
  if (sess.treatment_key && getTreatment(sess.treatment_key)) return sess.treatment_key;
  var list = (typeof TREATMENTS !== 'undefined' && Array.isArray(TREATMENTS)) ? TREATMENTS : [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t && (t.name === sess.type || t.label === sess.type)) return t.id;
  }
  return null;
}
function isUnitLedgerSession(sess) {
  var tn = String((sess && sess.tooth_num) || '');
  if (!tn || tn.indexOf(',') !== -1) return true;
  var sf = (sess && sess.surface) || '';
  return sf === 'SPACER' || sf === 'BRIDGE' || sf === 'PONTIC';
}
/* M145-f: شارةُ «خيار أ/ب/ج» بتلميحات المخطط — لجلسةٍ بعينها، أو لصفّ مخططٍ تمثّله جلسةٌ موسومة. */
function tipOptBadge(x) {
  /* M145-h: الوسمُ معنىً للمخطَّط فقط — بندٌ أُنجز من مسارٍ لا يعتمد (المواعيد/اللوحة) قد يحمل وسمه */
  var o = (x && (x.status || 'completed') === 'planned' && typeof planOptOf === 'function') ? planOptOf(x) : null;
  return o ? ' <span style="display:inline-block;padding:0 5px;border-radius:6px;border:1px solid #6b8fe0;color:#9db7f5;font-size:10px;font-weight:700;margin-right:4px;">خيار '
           + PLAN_OPTION_LABELS[o] + '</span>' : '';
}
function tipRowOptBadge(num, sf, key, sm) {
  if (window.__historyMode || typeof sessions === 'undefined' || !sessions || !key) return '';
  var st = (sm && sm.__status && sm.__status[sf]) || 'completed';
  for (var i = 0; i < sessions.length; i++) {
    var x = sessions[i];
    if (!x || String(x.tooth_num || '') !== String(num) || (x.status || 'completed') !== st) continue;
    if ((x.surface || centerSurface(num)) !== sf || sessionTreatmentKey(x) !== key) continue;
    var b = tipOptBadge(x); if (b) return b;
  }
  return '';
}
/* M145-h: شارةُ خيار الجسر المرسوم على صفّ رأسه (دعامة/وهمي) — جلسةُ الوحدة المخطّطة التي تضمّ
   السنَّ وتحمل المفتاحَ المرسوم نفسه. بها لا يتكرّر الجسرُ نفسه بصفٍّ ثانٍ «الجسر المرسوم». */
function tipUnitOptBadge(num, key, st) {
  if (window.__historyMode || typeof sessions === 'undefined' || !sessions || !key || (st || 'completed') !== 'planned') return '';
  for (var i = 0; i < sessions.length; i++) {
    var x = sessions[i];
    if (!x || (x.status || 'completed') !== 'planned' || String(x.tooth_num || '').indexOf(',') === -1) continue;
    if (String(x.tooth_num).split(',').map(function(v){ return parseInt(v, 10); }).indexOf(parseInt(num, 10)) < 0) continue;
    if (sessionTreatmentKey(x) !== key) continue;
    var b = tipOptBadge(x); if (b) return b;
  }
  return '';
}
function sessionTipRows(num, sm) {
  if (window.__historyMode) return '';
  if (typeof sessions === 'undefined' || !sessions || !sessions.length) return '';
  var out = '', seen = {};
  sm = sm || {};
  var _optBadge = tipOptBadge;
  /* M145-e: جلساتُ الوحدة (جسور بديلة) لم تكن تظهر بتلميح أي سنٍّ من الوحدة — كان التلميح
     يعرض الجسر المرسوم وحده فيبدو البديل مفقوداً. تُعرض كلها بوسم خيارها؛ المرسوم بلا «سجل الجلسات». */
  for (var u = 0; u < sessions.length; u++) {
    var us = sessions[u];
    if (!us || String(us.tooth_num || '').indexOf(',') === -1) continue;
    var ust = us.status || 'completed';
    if (ust !== 'completed' && ust !== 'planned') continue;
    var uTeeth = String(us.tooth_num).split(',').map(function(v){ return parseInt(v, 10); });
    if (uTeeth.indexOf(parseInt(num, 10)) < 0) continue;
    var uKey = sessionTreatmentKey(us);
    if (!isBridgeKey(uKey)) continue;
    var drawnSf = isBridgeKey(sm.PONTIC) ? 'PONTIC' : (isBridgeKey(sm.WHOLE) ? 'WHOLE' : null);
    var drawn = drawnSf && sm[drawnSf] === uKey && (((sm.__status && sm.__status[drawnSf]) || 'completed') === ust);
    var ob = _optBadge(us);
    if (drawn) continue;                              // M145-h: المرسومُ معروضٌ بصفّ رأسه مع شارة خياره (tipUnitOptBadge)
    var udk = 'U|' + uKey + '|' + ust;
    if (seen[udk]) continue; seen[udk] = true;
    var utr = getTreatment(uKey);
    var ubc = STATUS_COLORS[ust] || '#888';
    out += '<div class="tip-row" style="opacity:0.85"><span class="tip-dot" style="background:' + escapeHtml((uKey && T_FILL[uKey]) || '#888') + '"></span><b>'
         + (drawn ? 'الجسر المرسوم' : 'جسر بديل') + ':</b> ' + escapeHtml(utr ? utr.name : (us.type || '—'))
         + ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:' + ubc + '33;color:' + ubc
         + ';font-size:10px;font-weight:700;margin-right:4px;">' + (STATUS_LABELS[ust] || ust) + '</span>' + ob + '</div>';
  }
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    if (!s || String(s.tooth_num || '') !== String(num)) continue;
    var st = s.status || 'completed';
    if (st !== 'completed' && st !== 'planned') continue;
    if (isUnitLedgerSession(s)) continue;
    var sf = s.surface || centerSurface(num);
    var key = sessionTreatmentKey(s);
    var rowKey = sm[sf] || null;
    var rowSt = (sm.__status && sm.__status[sf]) || (rowKey ? 'completed' : null);
    // الصفُّ يمثّل هذه الجلسة بالضبط ⇒ معروضة أصلاً
    if (key && rowKey === key && rowSt === st) continue;
    var dk = sf + '|' + (key || s.type || '') + '|' + st;
    if (seen[dk]) continue; seen[dk] = true;
    var tr = key ? getTreatment(key) : null;
    var name = tr ? tr.name : (s.type || '—');
    var col = (key && T_FILL[key]) || '#888';
    var areaLbl = (sf === 'WHOLE') ? 'السن كاملاً'
                : (sf === 'CROWN_FULL') ? 'التاج كامل'
                : (sf === 'SOCKET') ? 'موقع القلع'
                : isRootCode(sf) ? rootAreaLabelFor(sf, num)
                : surfLabelFor(sf, num);
    var bcol = STATUS_COLORS[st] || '#888';
    var badge = ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:' + bcol + '33;color:' + bcol
              + ';font-size:10px;font-weight:700;margin-right:4px;">' + (STATUS_LABELS[st] || st) + '</span>';
    out += '<div class="tip-row" style="opacity:0.85"><span class="tip-dot" style="background:' + escapeHtml(col) + '"></span><b>'
         + escapeHtml(areaLbl) + ':</b> ' + escapeHtml(name) + badge + _optBadge(s)
         + '<span style="font-size:10px;color:var(--text3);margin-right:4px;">(سجل الجلسات)</span></div>';
  }
  return out;
}

function buildTooth(num, surfaceMap, isUpper) {
  var sm = surfaceMap || {};
  var anat = toothAnatomy(num);

  // Color resolver: returns the fill color for a surface key
  function colorFor(sKey, baseColor) {
    var tk = sm[sKey];
    if (!tk) return baseColor;
    /* v434: الحالةُ السريرية **وسمٌ** لا علاج — رمزُها يكفي، وطلاءُ السطح بلونها
       كان يجعل «كسر» على الجذر يبدو علاجاً منجزاً يملأ الجذر. */
    if (isConditionKey(tk)) return baseColor;
    return T_FILL[tk] || baseColor;
  }

  // Whole-tooth treatment paints the entire tooth one color
  // Detect treatment classification by inspecting target_part of the treatment, not just surface key.
  // Backward-compat: legacy records (saved before DB constraint was widened) may have
  // surface='WHOLE' for crown_full / bridge treatments — render them correctly here.
  var wholeT = sm.WHOLE;
  var wholeTreatObj = wholeT ? getTreatment(wholeT) : null;
  var wholeTargetPart = wholeTreatObj ? (wholeTreatObj.target_part || 'whole') : null;
  var isBridgeAbutment = isBridgeKey(wholeT);
  // A WHOLE entry is genuinely 'whole' only if the treatment's target_part is 'whole' (e.g. extraction, implant)
  // If target_part is 'crown_full', render as crown_full instead.
  var isStoredCrownFull = (wholeTargetPart === 'crown_full');
  var hasWhole = !!wholeT && !isBridgeAbutment && !isStoredCrownFull;
  var wholeColor = hasWhole ? (T_FILL[wholeT] || '#f5e6c8') : null;

  // crown_full: from CROWN_FULL surface OR from WHOLE with crown_full target_part OR bridge abutment.
  // For bridge abutments use the actual stored key (so custom bridge variants render with their own color).
  /* M145-f: على دعامة الجسر يفوز مِثبَتُ الجسر بالرسم دائماً. كان صفُّ CROWN_FULL يسبقه، فتاجٌ
     مخطّط على الدعامة (بديلٌ بخيارٍ آخر مثلاً) كان يطلي الدعامة بلون التاج ويقطع شكل الجسر
     المرسوم، ويُسمّى بالتلميح «دعامة جسر: تاج زركون». التاج يبقى صفاً مستقلاً بالتلميح. */
  var crownFullT = isBridgeAbutment ? (wholeT || 'bridge')
    : (sm.CROWN_FULL || (isStoredCrownFull ? wholeT : null));
  var hasCrownFull = !!crownFullT;
  var crownFullColor = hasCrownFull ? (T_FILL[crownFullT] || '#fb923c') : null;

  // Base colors: ivory crown, slightly darker ivory roots
  var crownBase = '#f4e4c1';
  var rootBase  = '#e8d5b0';
  var crownStroke = '#b08d5b';
  var rootStroke  = '#967048';

  /* v436: «انطمار» — السنُّ لم يبلغ مستوى الإطباق، فيُرسم **مزاحاً نحو الجذر** عن
     مستوى جيرانه (طلب المالك). الإزاحةُ محليةٌ بـ+y = ذرويّةٌ بالفكين معاً: بالفك
     العلوي يقلبها انعكاسُ المجموعة فترتفع على الشاشة، وبالسفلي تنزل — وكلاهما
     «بعيداً عن خط الإطباق». كلُّ ما داخل المجموعة (التاج والجذور وخطُّ اللثة والرمز)
     يُزاح معاً فيُقرأ السنُّ مغروساً أعلى من الصف. */
  /* v437: الإزاحةُ تُقصّ بطول جذر السن نفسه (viewBox ارتفاعه 210) فلا تُقطع الذروةُ
     عند سنٍّ طويل الجذر (الناب العلوي rootBot≈192) — أثرُها المرئي يبقى أقصى ما يسمح به. */
  var _impMax = Math.max(0, 206 - (anat.rootBot || 190));
  var _impShift = condDrawFlag(sm, 'impacted') ? Math.min(COND_IMPACT_SHIFT, _impMax) : 0;
  var _impT = _impShift ? ' translate(0,' + _impShift + ')' : '';
  var transform = isUpper ? ('transform="translate(0,210) scale(1,-1)' + _impT + '"')
                          : (_impShift ? ('transform="translate(0,' + _impShift + ')"') : '');
  var W = anat.cellW;
  var H = Math.round(W * 2.1);
  // Unique gradient ID per tooth to avoid SVG collisions
  var gid = 'g' + num;

  var svg = '<svg class="tooth-shape" viewBox="0 0 100 210" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">'
    + '<defs>'
    // Crown gradient: A1 enamel shade (bright cream-white, slightly warm)
    // Vita A1: light cream with subtle ivory tones — preserve gradient depth
    + '<linearGradient id="cg' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#fdfaf2"/>'         // bright enamel tip (A1 light)
      + '<stop offset="25%" stop-color="#faf4e2"/>'         // upper enamel (A1 mid)
      + '<stop offset="60%" stop-color="#f5edd8"/>'         // mid-crown (A1 base)
      + '<stop offset="92%" stop-color="#ede1c4"/>'         // dentin warmth showing through near cervical
      + '<stop offset="100%" stop-color="#e3d3aa"/>'        // cervical (warm transition to root)
    + '</linearGradient>'
    // Root gradient: natural dentin color (warm yellowish-ivory) with depth
    + '<linearGradient id="rg' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#e8d2a0"/>'          // pale dentin at cervical
      + '<stop offset="55%" stop-color="#dcc28a"/>'         // mid-root dentin
      + '<stop offset="100%" stop-color="#c8aa6e"/>'        // apex — deeper dentin
    + '</linearGradient>'
    // Side shadow on roots (light from upper-left → right side darker)
    + '<linearGradient id="rs' + gid + '" x1="0" y1="0" x2="1" y2="0">'
      + '<stop offset="0%" stop-color="rgba(80,50,20,0.16)"/>'
      + '<stop offset="32%" stop-color="rgba(255,255,255,0.12)"/>'
      + '<stop offset="62%" stop-color="rgba(0,0,0,0)"/>'
      + '<stop offset="100%" stop-color="rgba(80,50,20,0.26)"/>'
    + '</linearGradient>'
    // Lateral crown shading (cylindrical body: both proximal edges recede)
    + '<linearGradient id="cs' + gid + '" x1="0" y1="0" x2="1" y2="0">'
      + '<stop offset="0%" stop-color="rgba(120,80,40,0.16)"/>'
      + '<stop offset="28%" stop-color="rgba(255,255,255,0.05)"/>'
      + '<stop offset="65%" stop-color="rgba(0,0,0,0)"/>'
      + '<stop offset="100%" stop-color="rgba(120,80,40,0.20)"/>'
    + '</linearGradient>'
    // Incisal/occlusal enamel translucency (cool grey-blue glow at the edge)
    + '<linearGradient id="it' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="rgba(190,205,215,0.45)"/>'
      + '<stop offset="100%" stop-color="rgba(190,205,215,0)"/>'
    + '</linearGradient>'
    // Soft inner shadow at the equator (3D bulge)
    + '<radialGradient id="sh' + gid + '" cx="50%" cy="48%" r="55%">'
      + '<stop offset="55%" stop-color="rgba(0,0,0,0)"/>'
      + '<stop offset="100%" stop-color="rgba(140,90,40,0.22)"/>'
    + '</radialGradient>'
    // Linear highlight band (enamel reflection — diagonal soft glow on upper-left)
    + '<linearGradient id="hi' + gid + '" x1="0.20" y1="0.10" x2="0.55" y2="0.65">'
      + '<stop offset="0%" stop-color="rgba(255,255,255,0.65)"/>'
      + '<stop offset="40%" stop-color="rgba(255,255,255,0.25)"/>'
      + '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>'
    + '</linearGradient>'
    // Subtle vertical perikymata pattern (growth lines on enamel)
    + '<pattern id="pk' + gid + '" x="0" y="0" width="100" height="3" patternUnits="userSpaceOnUse">'
      + '<line x1="0" y1="1.5" x2="100" y2="1.5" stroke="#a8825a" stroke-width="0.15" opacity="0.06"/>'
    + '</pattern>'
    // Occlusal surface gradient: A1 enamel (brighter at table, light reflects off cusps)
    + '<linearGradient id="og' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#fefcf6"/>'
      + '<stop offset="50%" stop-color="#faf4e2"/>'
      + '<stop offset="100%" stop-color="#f0e6cc"/>'
    + '</linearGradient>'
    // Occlusal highlight (top-down light reflection)
    + '<radialGradient id="oh' + gid + '" cx="50%" cy="20%" r="55%">'
      + '<stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>'
      + '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>'
    + '</radialGradient>'
    // Crown clip-path: surface overlays and internal shading clip to the crown silhouette
    + '<clipPath id="cc' + gid + '"><path d="' + anat.outlineD + '"/></clipPath>'
    // Furcation shadow gradient + a clip made of all root silhouettes
    + '<radialGradient id="fs' + gid + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(90,58,24,0.18)"/><stop offset="100%" stop-color="rgba(90,58,24,0)"/></radialGradient>'
    + '<clipPath id="rc' + gid + '">' + anat.roots.map(function(r){ return '<path d="' + r.d + '"/>'; }).join('') + '</clipPath>'
    + '</defs>'
    + '<g ' + transform + '>';
  /* C3: «غير بازغ» — جسمُ السن كلُّه داخل مجموعةٍ باهتة تُغلق قبل طبقة الرموز، فيبقى
     الرمزُ و✕ القلع المخطّط وسلكُ التقويم بكامل وضوحها فوقه. */
  var _unerupted = condDrawFlag(sm, 'unerupted');
  if (_unerupted) svg += '<g class="tooth-unerupted" opacity="' + COND_UNERUPTED_OPACITY + '">';

  // ── Roots (drawn first, behind crown) ──
  // Helper: detect if a treatment targets root (so we render a canal inside, not a full fill)
  function isRootCanalTreat(tkey) {
    if (!tkey) return false;
    var tr = getTreatment(tkey);
    return tr && tr.target_part === 'root';
  }
  var canalSvg = '';   // canals are painted AFTER all roots so a canal in a root drawn behind (palatal) stays visible
  for (var ri = 0; ri < anat.roots.length; ri++) {
    var r = anat.roots[ri];
    var rTreatKey = sm[r.key];
    // Composite root code (e.g. 'R1R2') colors every root it includes — explicit
    // single-root row wins (same precedence rule as effectiveSurfaceTreatment).
    if (!rTreatKey) {
      for (var rck in sm) {
        if (rck === '__status') continue;
        if (isCompositeRootCode(rck) && sm[rck] && rck.indexOf(r.key) !== -1) { rTreatKey = sm[rck]; break; }
      }
    }
    var isCanal = isRootCanalTreat(rTreatKey);
    var rFill;
    // whole-tooth is rendered as a colored OUTLINE (not a solid fill) so any
    // surface/root treatment beneath it stays visible. So the root keeps its
    // own treatment color (or the natural gradient) regardless of hasWhole.
    if (rTreatKey && !isCanal && !isConditionKey(rTreatKey) && T_FILL[rTreatKey]) rFill = T_FILL[rTreatKey];   /* v434: الحالةُ رمزٌ لا طلاء */
    else rFill = 'url(#rg' + gid + ')';
    svg += '<path class="root-part" data-tooth="' + num + '" data-surface="' + r.key + '" '
        +  'd="' + r.d + '" fill="' + rFill + '" stroke="' + rootStroke + '" stroke-width="0.6"></path>';
    // Side shadow overlay on each root (only if no full-fill treatment)
    if (!(rTreatKey && !isCanal && T_FILL[rTreatKey])) {
      svg += '<path d="' + r.d + '" fill="url(#rs' + gid + ')" pointer-events="none"></path>';
    }
    // Root canal: draw a thin vertical channel INSIDE the root, from CEJ down toward apex
    if (isCanal && r.canalTopCx !== undefined) {
      var canalColor = T_FILL[rTreatKey] || '#a78bfa';
      var canalTopW = (r.canalTopW || 8) * 0.22;  // canal opening ≈ 22% of root cervical width
      var canalApexW = canalTopW * 0.18;          // narrows toward apex
      var cTop = r.canalTop + 1;                   // start just inside the cervical
      var cBot = r.canalBot - 4;                   // stop short of the apex
      var cTopCx = r.canalTopCx;
      var cApexCx = r.canalApexCx;
      var cTopL = cTopCx - canalTopW/2;
      var cTopR = cTopCx + canalTopW/2;
      var cApexL = cApexCx - canalApexW/2;
      var cApexR = cApexCx + canalApexW/2;
      var cLen = cBot - cTop;
      // Build a tapered canal that follows the root curvature (S-curve via cubic beziers)
      var canalD = 'M ' + cTopR + ' ' + cTop +
                   ' C ' + cTopR + ' ' + (cTop + cLen*0.40) +
                   ' '   + cApexR + ' ' + (cTop + cLen*0.78) +
                   ' '   + cApexR + ' ' + cBot +
                   ' L ' + cApexL + ' ' + cBot +
                   ' C ' + cApexL + ' ' + (cTop + cLen*0.78) +
                   ' '   + cTopL + ' ' + (cTop + cLen*0.40) +
                   ' '   + cTopL + ' ' + cTop +
                   ' Z';
      canalSvg += '<path d="' + canalD + '" fill="' + canalColor + '" fill-opacity="0.85" '
          +  'stroke="' + canalColor + '" stroke-width="0.3" stroke-opacity="0.6" '
          +  'pointer-events="none"></path>';
    }
    // whole-tooth ring for a root drawn BEHIND: painted now so the roots in front
    // cover its hidden part (the ring shows only on the visible sliver).
    if (hasWhole && r.behind) {
      svg += '<path d="' + r.d + '" fill="none" stroke="' + wholeColor + '" '
          +  'stroke-width="2.4" stroke-linejoin="round" pointer-events="none"></path>';
    }
  }
  // Furcation depth: a soft shadow where the roots part, clipped to the roots
  // so nothing paints on the background between them.
  if (anat.roots.length >= 2 && anat.furcationY && anat.type === 'molar' && !isPrimaryTooth(num)) {
    var fcW = (anat.cejR - anat.cejL) * 0.24;
    svg += '<ellipse cx="50" cy="' + (anat.furcationY + 1) + '" rx="' + fcW + '" ry="5.5" fill="url(#fs' + gid + ')" '
        +  'clip-path="url(#rc' + gid + ')" pointer-events="none"></ellipse>';
  }
  svg += canalSvg;

  // ── Crown outline (gradient + perikymata + inner shadow + highlight) ──
  // Crown always uses the natural enamel gradient. whole-tooth treatments are
  // drawn as a colored OUTLINE later (after the surface fills) so treatments
  // beneath them remain visible — same for crown_full (transparent overlay).
  /* v435: «جذر متبقٍّ» — التاجُ ليس موجوداً أصلاً بالفم، فلا يُرسم: لا مينا ولا ظلال
     ولا شقوق ولا خطُّ CEJ. الجذورُ رُسمت قبل هذه الكتلة فتبقى وحدَها، ومناطقُ النقر
     (الشفافة) تُرسم بعدها فيبقى السنُّ قابلاً للنقر والتلميحِ والإزالة. */
  var _noCrown = condDrawFlag(sm, 'no-crown');
  if (!_noCrown) {
  var crownFillBase = 'url(#cg' + gid + ')';
  svg += '<path class="tooth-detail" d="' + anat.outlineD + '" fill="' + crownFillBase + '" '
      +  'stroke="' + crownStroke + '" stroke-width="0.75" stroke-linejoin="round"></path>';
  {
    // Perikymata (subtle horizontal growth-line texture)
    svg += '<path class="tooth-detail" d="' + anat.outlineD + '" fill="url(#pk' + gid + ')" pointer-events="none"></path>';
    // Inner shadow at edges for 3D bulge
    svg += '<path class="tooth-detail" d="' + anat.outlineD + '" fill="url(#sh' + gid + ')" pointer-events="none"></path>';
    // Lateral (mesio-distal) shading — proximal edges recede
    svg += '<path class="tooth-detail" d="' + anat.outlineD + '" fill="url(#cs' + gid + ')" pointer-events="none"></path>';
    // Enamel translucency along the incisal/occlusal edge
    if (anat.crownTop !== undefined) {
      var itH = anat.crownH * ((anat.type === 'incisor' || anat.type === 'canine') ? 0.30 : 0.18);
      svg += '<rect x="0" y="' + anat.crownTop + '" width="100" height="' + itH + '" fill="url(#it' + gid + ')" clip-path="url(#cc' + gid + ')" pointer-events="none"></rect>';
    }
    // Faint labial developmental depressions on anteriors
    if (anat.facialLobeD) {
      svg += '<path d="' + anat.facialLobeD + '" fill="none" stroke="rgba(120,80,40,0.12)" stroke-width="1.6" stroke-linecap="round" clip-path="url(#cc' + gid + ')" pointer-events="none"></path>';
    }
    // Linear highlight (enamel reflection band)
    svg += '<path class="tooth-detail" d="' + anat.outlineD + '" fill="url(#hi' + gid + ')" pointer-events="none"></path>';
    // CEJ shadow line (cementoenamel junction — subtle dark band where crown meets root)
    svg += '<path d="M ' + ((anat.cejL !== undefined ? anat.cejL : anat.crownL) + 1) + ' ' + anat.cervicalY
         + ' Q 50 ' + (anat.cervicalY + 2.5) + ' ' + ((anat.cejR !== undefined ? anat.cejR : anat.crownR) - 1) + ' ' + anat.cervicalY + '" '
         + 'fill="none" stroke="rgba(120,75,35,0.35)" stroke-width="0.8" pointer-events="none"/>';
  }

  // ── Occlusal/Incisal band (drawn INSIDE the crown — clipped by crown outline) ──
  // (crown_full + whole-tooth outline are drawn AFTER the surface overlays, below,
  //  so the treatments beneath them stay visible.)
  if (anat.occlusalBandD) {
    var clipId = 'cc' + gid;
    // Soft shadow band representing the occlusal table depth
    svg += '<path d="' + anat.occlusalBandD + '" fill="rgba(160,110,55,0.18)" '
        +  'clip-path="url(#' + clipId + ')" pointer-events="none"></path>';
    // Bright highlight on top of cusps (light catches the cusp tips)
    svg += '<path d="' + anat.occlusalBandD + '" fill="url(#oh' + gid + ')" '
        +  'clip-path="url(#' + clipId + ')" pointer-events="none"></path>';
    // Groove/fissure lines
    if (anat.occlusalDetailD) {
      svg += '<path d="' + anat.occlusalDetailD + '" fill="none" '
          +  'stroke="rgba(95,60,25,0.55)" stroke-width="0.45" stroke-linecap="round" '
          +  'clip-path="url(#' + clipId + ')" pointer-events="none"></path>';
    }
    // Buccal developmental groove(s) down the facial surface (molars)
    if (anat.facialGrooveD) {
      svg += '<path d="' + anat.facialGrooveD + '" fill="none" '
          +  'stroke="rgba(120,80,40,0.30)" stroke-width="0.9" stroke-linecap="round" '
          +  'clip-path="url(#' + clipId + ')" pointer-events="none"></path>';
      svg += '<path d="' + anat.facialGrooveD + '" fill="none" '
          +  'stroke="rgba(255,255,255,0.35)" stroke-width="0.5" stroke-linecap="round" transform="translate(0.8,0)" '
          +  'clip-path="url(#' + clipId + ')" pointer-events="none"></path>';
    }
  }
  }

  // ── Surface overlay rectangles (clickable) ──
  // Each overlay is transparent if no treatment, or filled with the treatment
  // color at SURFACE_FILL_OPACITY (unified "solidity" shared with the occlusal
  // view) if treated. The overlay is clipped to the crown outline.
  //
  // Crown silhouette fix (Phase 6 N follow-up):
  // For COLORED surfaces (has a treatment), expand the rect outward by OVERSHOOT
  // so the clip-path actually clips against the crown outline — otherwise small
  // inner rects sit entirely inside the silhouette and appear as floating
  // rectangles with sharp edges. The clipPath (cc${gid}) is built from
  // anat.outlineD, so any overshoot is trimmed exactly along the crown curve.
  //
  // The expansion is DIRECTIONAL per surface, and draw-order is M/D LAST so
  // that if both B and M (or D) carry colors, the M/D strip cleanly overlays
  // any lateral bleed-through.
  //
  // EXCEPTION (Dr. request): the B (facial) surface is NOT expanded to the
  // edges — it is a CENTERED patch covering the central 70% of the crown width
  // (inset 15% from both mesial and distal), so a facial filling reads as a
  // real restoration instead of an edge-to-edge band.
  //
  // Crown grid (recap):
  //   ┌──┬───────┬──┐
  //   │  │   O   │  │  ← top: O/I — overshoots UP toward incisal/occlusal edge
  //   │M │  [B]  │D │  ← middle: B — CENTERED 70% patch (no lateral overshoot)
  //   │  │   V   │  │  ← bottom: V — overshoots DOWN toward cervical
  //   └──┴───────┴──┘
  //   ↑              ↑
  //   M/D strips overshoot LATERALLY + slight vertical (drawn last → on top)
  //
  // Click zones (transparent rects) stay at their original geometry so that
  // hit-testing remains accurate and the inter-surface dividers below still
  // line up with the logical M/D/B/O/V boundaries.
  var OVERSHOOT = 12;
  function overlayRect(rect, isCenter) {
    var fillKey = rect.key;
    var tk = effectiveSurfaceTreatment(sm, fillKey);
    if (tk && isConditionKey(tk)) tk = null;   /* v434: الحالةُ السريرية رمزٌ لا طلاءُ سطح */
    var fill, opacity, useColor = false;
    // Surface treatments always paint at full solidity. whole-tooth (outline)
    // and crown_full (transparent overlay) are drawn separately AFTER these, so
    // the surface treatments beneath them remain visible.
    if (tk) { fill = T_FILL[tk] || crownBase; opacity = SURFACE_FILL_OPACITY; useColor = true; }
    else { fill = '#000'; opacity = 0; } // transparent click zone
    // Directional overshoot — only when actually painting a colored surface.
    var rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
    if (useColor) {
      var padT = 0, padB = 0, padL = 0, padR = 0;
      if (fillKey === 'M' || fillKey === 'D') {
        // Side strips: overshoot toward the lateral edge of the crown
        // (the bulge area). Direction depends on which side this strip sits on.
        if (rect.x <= anat.crownL + 0.1) { padL = OVERSHOOT; } else { padR = OVERSHOOT; }
        // Small vertical padding to cover the rounded crown corners
        padT = OVERSHOOT; padB = OVERSHOOT;
      } else if (fillKey === 'O' || fillKey === 'I') {
        // Incisal/occlusal: overshoot UP toward the edge, plus a small
        // lateral pad to hug the curving corners
        padT = OVERSHOOT;
        padL = OVERSHOOT; padR = OVERSHOOT;
      } else if (fillKey === 'V') {
        // Lingual: overshoot DOWN toward the cervical line ONLY. NO lateral
        // overshoot — the lingual fill stays confined to the central column
        // (between the M/D side strips) so it never covers the mesial/distal
        // zones, which are reserved for proximal treatments (Dr. red boundary).
        padB = OVERSHOOT;
      } else if (fillKey === 'B') {
        // Buccal/labial restoration: a CENTERED facial patch. Per Dr. request,
        // inset 15% from BOTH the mesial and distal edges → the color covers
        // the central 70% of the crown width instead of spanning edge-to-edge.
        // This reads as a real facial filling rather than a full lateral band,
        // and leaves the M/D surfaces visually free for their own colors.
        var crownW = anat.crownR - anat.crownL;
        rx = anat.crownL + crownW * 0.15;
        rw = crownW * 0.70;
      }
      rx -= padL; ry -= padT;
      rw += padL + padR; rh += padT + padB;
    }
    // rx/ry: rounded corners (2px) soften the rectangular look where the
    // surface fill sits inside the crown silhouette (clip-path can't help
    // there). Industry charting standards (Pabau, Quizlet) describe surface
    // fills as a "shaded patch" rather than a sharp rectangle, and rounded
    // edges read more naturally as a restoration rather than a UI element.
    return '<rect class="crown-surface" data-tooth="' + num + '" data-surface="' + fillKey + '" '
        + 'x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" rx="2" ry="2" '
        + 'fill="' + fill + '" fill-opacity="' + opacity + '" '
        + 'clip-path="url(#cc' + gid + ')"><title>' + surfLabelFor(fillKey, num) + '</title></rect>';
  }

  var s = anat.surfaces;
  // Draw order: middle column (O → B → L) FIRST, then side strips (M/D) LAST.
  // The M/D strips drawn last cleanly overlay any lateral overshoot from B/O/L,
  // preserving the anatomical meaning of each surface when multiple are colored.
  svg += overlayRect(s.O, true);
  svg += overlayRect(s.B, false);
  svg += overlayRect(s.L, false);
  svg += overlayRect(s.left, false);
  svg += overlayRect(s.right, false);

  // Faint internal dividers between surfaces (decorative, very subtle)
  svg += '<g class="tooth-detail" stroke="' + crownStroke + '" stroke-width="0.3" opacity="0.18" fill="none">';
  // Horizontal lines: between B and O, between O and L
  svg += '<line x1="' + (s.O.x + 2) + '" y1="' + s.O.y + '" x2="' + (s.O.x + s.O.w - 2) + '" y2="' + s.O.y + '"></line>';
  svg += '<line x1="' + (s.O.x + 2) + '" y1="' + (s.O.y + s.O.h) + '" x2="' + (s.O.x + s.O.w - 2) + '" y2="' + (s.O.y + s.O.h) + '"></line>';
  // Vertical lines: between left strip and middle, between middle and right strip
  svg += '<line x1="' + (s.left.x + s.left.w) + '" y1="' + (s.left.y + 4) + '" x2="' + (s.left.x + s.left.w) + '" y2="' + (s.left.y + s.left.h - 4) + '"></line>';
  svg += '<line x1="' + s.right.x + '" y1="' + (s.right.y + 4) + '" x2="' + s.right.x + '" y2="' + (s.right.y + s.right.h - 4) + '"></line>';
  svg += '</g>';

  // ── Gum line (decorative, soft pink/blue) ──
  /* v435: الانحسارُ اللثوي يُزيح **خطَّ اللثة المرسوم** نحو الذروة فينكشف جزءٌ من الجذر —
     وهو تعريفُ الحالة نفسه (انزياحُ حافة اللثة عن عنق السن). خطُّ الـCEJ التشريحي
     لا يتحرّك (فوق، داخل كتلة التاج) — الفرقُ بينهما هو الانحسارُ المرئي. */
  var gumY = anat.cervicalY + (condDrawFlag(sm, 'gum') ? COND_GUM_SHIFT : 0);
  svg += '<path class="gum-line" d="M ' + (anat.crownL - 4) + ' ' + (gumY + 1)
      +  ' Q ' + 50 + ' ' + (gumY + 6)
      +  ' '  + (anat.crownR + 4) + ' ' + (gumY + 1) + '" '
      +  'fill="none" stroke="rgba(232,138,160,0.55)" stroke-width="3" stroke-linecap="round"></path>';
  svg += '<path class="gum-line" d="M ' + (anat.crownL - 3) + ' ' + (gumY + 4)
      +  ' Q ' + 50 + ' ' + (gumY + 9)
      +  ' '  + (anat.crownR + 3) + ' ' + (gumY + 4) + '" '
      +  'fill="none" stroke="rgba(120,180,220,0.4)" stroke-width="2" stroke-linecap="round"></path>';

  // ── Full-coverage layers (drawn LAST so surface/root treatments stay visible) ──
  // crown_full: a SEMI-TRANSPARENT color wash over the whole crown — the
  // restoration reads as a cap while any treatment beneath shows through.
  // Bridge abutments stay near-solid (they represent a physical bridge crown).
  if (hasCrownFull) {
    var cfOpacity = isBridgeAbutment ? 0.92 : 0.38;
    svg += '<path d="' + anat.outlineD + '" fill="' + crownFullColor + '" fill-opacity="' + cfOpacity + '" '
        +  'stroke="none" pointer-events="none"></path>';
  }
  // whole-tooth: a colored OUTLINE (ring) around the crown + each root, so the
  // tooth reads as fully treated while leaving the interior (and its surface
  // treatments) clearly visible.
  if (hasWhole) {
    svg += '<path d="' + anat.outlineD + '" fill="none" stroke="' + wholeColor + '" '
        +  'stroke-width="3" stroke-linejoin="round" pointer-events="none"></path>';
    for (var wri = 0; wri < anat.roots.length; wri++) {
      if (anat.roots[wri].behind) continue;   // already ringed inside the roots loop
      svg += '<path d="' + anat.roots[wri].d + '" fill="none" stroke="' + wholeColor + '" '
          +  'stroke-width="2.4" stroke-linejoin="round" pointer-events="none"></path>';
    }
  }
  if (_unerupted) {
    svg += '</g>';   /* C3: نهايةُ الجسم الباهت */
    var _unD = getCondition(sm[COND_SURFACE]) || getCondition('cond-unerupted');
    svg += '<path class="unerupted-outline" d="' + anat.outlineD + '" fill="none" stroke="' + _unD.stroke + '" '
        +  'stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round" pointer-events="none"></path>';
  }
  /* v430: رموزُ الحالات السريرية — حالةُ السن (سطح COND) بمنتصف التاج، وحالةُ السطح
     بمركز مستطيلِ سطحها. تُرسم فوق الطبقات وتحت ✕ القلع، بلا أحداثِ مؤشّر. */
  {
    var _cAll = [];
    for (var _ck in sm) {
      if (_ck === '__status' || _ck === '__review' || _ck === '__unit') continue;
      var _cDef = getCondition(sm[_ck]); if (!_cDef) continue;
      _cAll.push({ k: _ck, d: _cDef });
    }
    for (var _cx = 0; _cx < _cAll.length; _cx++) {
      var _an = condAnchorFor(anat, _cAll[_cx].k, _cAll[_cx].d);   /* v434 */
      svg += conditionSymbolSvg(_cAll[_cx].d, _an.x, _an.y, _an.size, isUpper);
    }
  }
  /* v429: قلعٌ مخطّط/محوّل على سنٍّ قائم ⇒ ✕ بلون الحالة عبر التاج والجذر. قبل v429 لم يكن
     هذا الخريطُ يصل buildTooth أصلاً (كان يُرسم شبحاً) — فالفرعُ حارسٌ لا يمسّ بايتاً قديماً. */
  var _pxSt = (hasWhole && isExtractionKey(wholeT) && sm.__status) ? sm.__status.WHOLE : null;
  if (_pxSt && extractionStatusIsOpen(_pxSt)) {
    var _pxC = plannedExtractionMarkColor(_pxSt), _pxB = (anat.rootBot || (anat.cervicalY + 90)) + 4;
    svg += '<path class="planned-x" d="M ' + (anat.crownL - 3) + ' ' + (anat.crownTop - 3) + ' L ' + (anat.crownR + 3) + ' ' + _pxB
        +  ' M ' + (anat.crownR + 3) + ' ' + (anat.crownTop - 3) + ' L ' + (anat.crownL - 3) + ' ' + _pxB + '" '
        +  'fill="none" stroke="' + _pxC + '" stroke-width="5.5" stroke-linecap="round" stroke-opacity="0.92" pointer-events="none"></path>';
  }

  // ── Ortho: archwire (always) + bracket (fixed appliance only) ──
  // Drawn inside the transform <g> so the upper-arch flip places it mid-crown
  // automatically. pointer-events:none → surface clicks still pass through.
  var __orthoT = (typeof orthoForArch === 'function') ? orthoForArch(isUpper) : null;
  if (__orthoT) {
    var __orthoC   = __orthoT.fill || '#0d8577';
    var __orthoRem = (typeof orthoIsRemovable === 'function') && orthoIsRemovable(__orthoT);  // removable = labial bow only
    var bxM = (anat.crownL + anat.crownR) / 2;
    // ارتفاع ثابت لكل القوس (cellWidth ثابت = 60 دائم / 48 لبني) → سلك مستوٍ بلا
    // تقطّع. القيمة ضمن التاج لكل الأسنان (التاج من y=6 حتى العنق ≥62 دائم/≥46 لبني).
    var byM = isPrimaryTooth(num) ? 30 : 38;
    var bW = 21, bH = 15;                         // أكبر قليلاً + سلك ممتد ليتّصل
    svg += '<g pointer-events="none">'
        +  '<line x1="-24" y1="' + byM + '" x2="124" y2="' + byM + '" stroke="' + __orthoC + '" stroke-width="3.2" opacity="0.92" stroke-linecap="round"/>';
    if (!__orthoRem) {                            // الثابت فقط: براكت على كل سن
      svg += '<rect x="' + (bxM - bW/2) + '" y="' + (byM - bH/2) + '" width="' + bW + '" height="' + bH + '" rx="3" fill="' + __orthoC + '" stroke="#ffffff" stroke-width="1.6"/>'
          +  '<line x1="' + (bxM - bW/2 + 3) + '" y1="' + byM + '" x2="' + (bxM + bW/2 - 3) + '" y2="' + byM + '" stroke="rgba(255,255,255,0.92)" stroke-width="1.8"/>';
    }
    svg += '</g>';
  }

  // ── حافظ مسافة: cervical band on abutments + wire stub toward the gap side ──
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(num)) {
    var __spC = spacerColorFor(num) || '#d946ef';
    var __spY = isPrimaryTooth(num) ? 44 : 57;   // cervical third, below the ortho wire
    var __bx1 = anat.crownL - 2, __bx2 = anat.crownR + 2;
    // The wire leaves the band on the GAP side ONLY — anatomically the MIDLINE
    // side of the band tooth. Quadrant-based (not neighbor-row based), so stale
    // rows can never paint a distal-side stub. The stub runs 8 units UNDER the
    // band (drawn first, rect covers the joint) → seamless connection.
    var __spQ = normQuad(num);
    var __spGapLeft = (__spQ === 2 || __spQ === 3);   // arch arrays: midline sits at the LEFT of Q2/Q3 teeth
    svg += '<g pointer-events="none">';
    if (__spGapLeft) svg += '<line x1="-24" y1="' + __spY + '" x2="' + (__bx1 + 8) + '" y2="' + __spY + '" stroke="' + __spC + '" stroke-width="2.5" opacity="0.95" stroke-linecap="round"/>';
    else             svg += '<line x1="' + (__bx2 - 8) + '" y1="' + __spY + '" x2="124" y2="' + __spY + '" stroke="' + __spC + '" stroke-width="2.5" opacity="0.95" stroke-linecap="round"/>';
    svg += '<rect x="' + __bx1 + '" y="' + (__spY - 5.5) + '" width="' + (__bx2 - __bx1) + '" height="11" rx="4" fill="' + __spC + '" opacity="0.92" stroke="#ffffff" stroke-width="1.2"/>'
        +  '</g>';
  }

  svg += '</g></svg>';
  // Phase 3 Feature F follow-up: surface tooltip now shows the status badge
  // (مراقبة/مخطط/محوّل/...) inline after the treatment name. Previously the
  // tooltip showed "وحشي: حشوة املغم" with no indication that the wحشي surface
  // was actually marked as 'condition' or 'planned' etc. Without this, the
  // doctor couldn't tell at a glance which surfaces have a real treatment vs
  // a watch/plan/referral. (Bug surfaced by live testing of tooth 47 — the
  // 'وحشي' surface was 'مراقبة' but tooltip showed just "حشوة املغم".)
  function tipStatusBadge(sm, sk) {
    if (!sm || !sm.__status) return '';
    var st = sm.__status[sk];
    if (!st || st === 'completed') return '';  // 'completed' is the default — no badge
    var lbl = STATUS_LABELS[st] || st;
    var col = STATUS_COLORS[st] || '#888';
    return ' <span style="display:inline-block;padding:0 5px;border-radius:6px;'
         + 'background:' + col + '33;color:' + col + ';'
         + 'font-size:10px;font-weight:700;margin-right:4px;">' + lbl + '</span>';
  }
  var tipRows = '';
  if (hasCrownFull) {
    var cft = getTreatment(crownFullT);
    var cfLabel = isBridgeAbutment ? 'دعامة جسر' : 'التاج كامل';
    var _cfSf = (isBridgeAbutment || (!sm.CROWN_FULL && isStoredCrownFull)) ? 'WHOLE' : 'CROWN_FULL';
    var cfBadge = tipStatusBadge(sm, _cfSf) + (isBridgeAbutment ? tipUnitOptBadge(num, crownFullT, sm.__status && sm.__status.WHOLE) : tipRowOptBadge(num, _cfSf, crownFullT, sm));
    tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(crownFullColor) + '"></span><b>' + cfLabel + ':</b> ' + escapeHtml(cft ? cft.name : crownFullT) + cfBadge + '</div>';
    if (isBridgeAbutment && sm.CROWN_FULL) {
      var _xct = getTreatment(sm.CROWN_FULL);
      tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(T_FILL[sm.CROWN_FULL] || '#888') + '"></span><b>التاج كامل:</b> '
               + escapeHtml(_xct ? _xct.name : sm.CROWN_FULL) + tipStatusBadge(sm, 'CROWN_FULL') + tipRowOptBadge(num, 'CROWN_FULL', sm.CROWN_FULL, sm) + '</div>';
    }
  }
  if (sm[COND_SURFACE] && getCondition(sm[COND_SURFACE])) {   /* v430 */
    var _cdT = getCondition(sm[COND_SURFACE]);
    tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(_cdT.fill) + '"></span><b>حالة سريرية:</b> '
             + escapeHtml(_cdT.name) + tipStatusBadge(sm, COND_SURFACE) + '</div>';
  }
  if (hasWhole) {
    var wt = getTreatment(wholeT);
    var wBadge = tipStatusBadge(sm, 'WHOLE') + tipRowOptBadge(num, 'WHOLE', wholeT, sm);
    tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(wholeColor) + '"></span><b>السن كاملاً:</b> ' + escapeHtml(wt ? wt.name : wholeT) + wBadge + '</div>';
  }
  // ALWAYS list surface + lingual + root treatments — even under a whole/crown_full —
  // so the doctor sees every treatment on the tooth, not just the full-coverage one.
  {
    // Composite restorations (e.g. MOD) — ONE row. Composite ROOT treatments
    // (e.g. R1R2R3) — one row PER root, stacked like the old single-root rows,
    // each with its anatomical name (owner feedback: keep the stacked layout).
    for (var compK in sm) {
      if (compK === '__status') continue;
      if ((!isCompositeSurfaceCode(compK) && !isCompositeRootCode(compK)) || !sm[compK]) continue;
      var cTk = sm[compK];
      var cObj = getTreatment(cTk);
      if (isCompositeRootCode(compK)) {
        var _rps = rootCodeParts(compK);
        for (var _rpi = 0; _rpi < _rps.length; _rpi++) {
          tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(T_FILL[cTk] || '#888') + '"></span><b>' + rootLabelFor(_rps[_rpi], num) + ':</b> ' + escapeHtml(cObj ? cObj.name : cTk) + tipStatusBadge(sm, compK) + '</div>';
        }
        continue;
      }
      tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(T_FILL[cTk] || '#888') + '"></span><b>' + surfLabelFor(compK, num) + ':</b> ' + escapeHtml(cObj ? cObj.name : cTk) + tipStatusBadge(sm, compK) + '</div>';
    }
    var crownKeys = surfacesFor(num);
    for (var ki = 0; ki < crownKeys.length; ki++) {
      var sk = crownKeys[ki];
      var tk = sm[sk];
      if (tk) {
        var tobj = getTreatment(tk);
        var tname = tobj ? tobj.name : tk;
        var tcolor = T_FILL[tk] || '#888';
        var skBadge = tipStatusBadge(sm, sk) + tipRowOptBadge(num, sk, tk, sm);
        tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(tcolor) + '"></span><b>' + surfLabelFor(sk, num) + ':</b> ' + escapeHtml(tname) + skBadge + '</div>';
      }
    }
    // Lingual (L) is recorded only from the occlusal view; surfacesFor() (facial) omits it,
    // so list it explicitly here to keep the facial hover tooltip complete.
    if (sm['L']) {
      var ltobj = getTreatment(sm['L']);
      var ltname = ltobj ? ltobj.name : sm['L'];
      var ltcolor = T_FILL[sm['L']] || '#888';
      tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(ltcolor) + '"></span><b>' + surfLabelFor('L', num) + ':</b> ' + escapeHtml(ltname) + tipStatusBadge(sm, 'L') + '</div>';
    }
    for (var rj = 0; rj < anat.roots.length; rj++) {
      var rk = anat.roots[rj].key;
      var rtk = sm[rk];
      if (rtk) {
        var rtobj = getTreatment(rtk);
        var rtname = rtobj ? rtobj.name : rtk;
        var rtcolor = T_FILL[rtk] || '#888';
        var rkBadge = tipStatusBadge(sm, rk) + tipRowOptBadge(num, rk, rtk, sm);
        tipRows += '<div class="tip-row"><span class="tip-dot" style="background:' + escapeHtml(rtcolor) + '"></span><b>' + rootLabelFor(rk, num) + ':</b> ' + escapeHtml(rtname) + rkBadge + '</div>';
      }
    }
  }
  // v260: الجلسات (منجزة/مخطّطة) على هذا السن التي لا يحملها صفُّ السطح —
  // المخطّطُ صفٌّ واحد لكلّ سطح (PK) فإعادةُ معالجةٍ منجزة تحت وتدٍ مخطّط على
  // الجذور نفسها كانت تختفي كلياً من التلميح. تُقرأ من سجل الجلسات فقط.
  tipRows += sessionTipRows(num, sm);
  if (!tipRows) tipRows = '<div class="tip-row" style="color:var(--text3)">سليم — اضغط أي منطقة</div>';

  var num_html = '<div class="tooth-num">' + num + '</div>';
  var tip_html = '<div class="tooth-tip">' + tipRows + '</div>';

  var html = '<div class="tooth-cell" data-tooth-cell="' + num + '" title="السن ' + num + '">';
  if (isUpper) {
    html += tip_html + svg + num_html;
  } else {
    html += num_html + svg + tip_html;
  }
  html += '</div>';
  return html;
}

/* ── Print chart — reuses the prescriptions print mechanism (#printRoot + body.printing).
   Snapshots the chart EXACTLY as displayed (active dentition, view toggle, status
   filter — the filter is named in the header so paper readers know what they see).
   The live #jawWrap is cloned AS-IS: SVG gradients reference url(#id), so ids must
   NOT be stripped; duplicate ids are harmless (originals come first in the DOM and
   the clone is short-lived). Pure read — zero DB writes, zero re-render. */
function printChart(){
  var jw = document.getElementById('jawWrap');
  var root = document.getElementById('printRoot');
  if (!jw || !root) return;
  var c = (typeof rxClinicInfo === 'function') ? rxClinicInfo() : { clinic_name:'العيادة', clinic_phone:'', license_no:'' };
  var dateStr = SyDT.numDate(new Date());   // v487: المطبوعُ أرقاماً
  var pName = (patient && patient.name) ? patient.name : '';
  var pAge = (patient && patient.dob) ? calcAge(patient.dob) : '';
  var dentLbl = (dentitionMode === 'primary') ? 'لبنية' : (dentitionMode === 'mixed' ? 'مختلطة' : 'دائمة');
  var filtLbl = ({ planned:'المخطّط فقط', completed:'المنجز فقط', hide_existing:'بدون الموجود مسبقاً' })[_chartStatusFilter] || '';
  var legEl = document.getElementById('chartLegend');

  var h = '<div class="chart-print" style="direction:rtl;font-family:Cairo,Tahoma,sans-serif;color:#111;padding:10px 14px;">';
  // الرأس — نفس بنية الروشتات
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--green);padding-bottom:10px;margin-bottom:10px;">';
  h += '<div><div style="font-size:22px;font-weight:800;color:#111;">' + escapeHtml(c.clinic_name) + '</div>';
  if (c.license_no) h += '<div style="font-size:12px;color:#666;margin-top:2px;">رقم النقابة: ' + escapeHtml(c.license_no) + '</div>';
  h += '</div><div style="text-align:left;font-size:13px;color:#444;">';
  if (c.clinic_phone) h += '<div>📞 ' + escapeHtml(c.clinic_phone) + '</div>';
  h += '<div style="margin-top:4px;">' + escapeHtml(dateStr) + '</div></div></div>';
  // شريط المريض
  h += '<div style="background:#f6f6f6;border-radius:10px;padding:9px 14px;margin-bottom:10px;font-size:13px;color:#222;">';
  h += '<strong>المريض:</strong> ' + escapeHtml(pName);
  if (pAge !== '') h += ' &nbsp;•&nbsp; العمر: ' + escapeHtml(String(pAge));
  h += ' &nbsp;•&nbsp; الإطباق: ' + dentLbl;
  if (filtLbl) h += ' &nbsp;•&nbsp; <strong>عرض مفلتر:</strong> ' + filtLbl;
  h += '</div>';
  // Self-contained FLAT clone — two distinct print bugs are handled here:
  // (1) WebKit (iOS Safari) rasterizes SVG gradient fills as BLACK in print
  //     output even when the url(#) refs resolve correctly on screen. Fix:
  //     flatten EVERY gradient to a solid color taken from that gradient's
  //     OWN stops (middle non-transparent stop) — works for dynamic gradients
  //     too (pontic 'pg' / implant shading derive from the live treatment
  //     palette, so no hardcoded map could cover them). Transparent-FADING
  //     decorative overlays — rim/shadow rings (rs/sh), fossa pits (fo), cusp
  //     eminences/cores (cu/cc), sheens/highlights (oh/hi/pk) — become none:
  //     flattened to solid they read as dark caries-like dots / white blobs /
  //     a flat wash on paper. The stroked grooves carry the printed anatomy.
  //     Gradient defs are then REMOVED so no
  //     renderer can ever paint an unresolved server black.
  // (2) Duplicate ids vs the display:none original (clipPaths remain id-based):
  //     prefix every id + url(#)/href(#) so the clone resolves only against
  //     its own visible defs. Both quote styles covered (' and ").
  var tmp = jw.cloneNode(true);
  var gradMap = {};
  tmp.querySelectorAll('linearGradient,radialGradient').forEach(function(g){
    var gidv = g.getAttribute('id') || '';
    var pick = null;
    if (!/^(rs|sh|fo|cc|cu|oh|hi|pk)/.test(gidv)) {
      var stops = g.querySelectorAll('stop');
      for (var si = 0; si < stops.length; si++) {
        var sc = stops[si].getAttribute('stop-color') || '';
        var so = stops[si].getAttribute('stop-opacity');
        if (/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(sc.replace(/\s+/g,''))) continue;  // alpha-0 stop
        if (so !== null && parseFloat(so) === 0) continue;
        pick = sc;
        if (si >= Math.floor(stops.length / 2)) break;   // settle on a middle-ish tone
      }
    }
    gradMap[gidv] = pick;                                // null → decorative ring/shadow → 'none'
    if (g.parentNode) g.parentNode.removeChild(g);
  });
  var allEls = tmp.querySelectorAll('*');
  for (var ei = 0; ei < allEls.length; ei++) {
    var pel = allEls[ei];
    for (var ai = 0; ai < 2; ai++) {
      var att = ai ? 'stroke' : 'fill';
      var v = pel.getAttribute && pel.getAttribute(att);
      if (!v || v.indexOf('url(#') !== 0) continue;
      var rid = v.slice(5, -1);
      if (rid in gradMap) pel.setAttribute(att, gradMap[rid] || 'none');  // clipPath refs aren't in the map → untouched
    }
  }
  var jwHtml = tmp.outerHTML
    .replace(/id="/g,  'id="prn-')
    .replace(/id='/g,  "id='prn-")
    .replace(/url\(#/g, 'url(#prn-')
    .replace(/href="#/g, 'href="#prn-')
    .replace(/href='#/g, "href='#prn-");
  h += '<div class="cp-jaw">' + jwHtml + '</div>';
  if (legEl) h += '<div class="chart-legend cp-legend">' + legEl.innerHTML + '</div>';
  h += '</div>';

  root.innerHTML = h;
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture — iOS Safari blocks print() fired from setTimeout (transient user-activation is lost → 'blocked from automatically printing'). Content is inline SVG/CSS only; layout flushes before the print snapshot.
  setTimeout(cleanup, 60000);
}

function renderLegend() {
  var leg = document.getElementById('chartLegend');
  if (!leg) return;
  var html = '<div class="leg"><div class="leg-dot" style="background:#e8d5b0;border:1px solid #b8956a;"></div>سليم</div>';
  for (var i=0; i<TREATMENTS.length; i++) {
    var t = TREATMENTS[i];
    if (t.is_active === false) continue;
    html += '<div class="leg"><div class="leg-dot" style="background:' + escapeHtml(t.fill) + '"></div>' + escapeHtml(t.name) + '</div>'; // Rule #195
  }
  /* v430: الحالاتُ السريرية الموجودة على هذا المخطط وحدها — رمزُها ولونُها بنفس المصدر،
     فلا تتضخّم اللافتة بتسعِ حالاتٍ عند كل مريض. */
  var _legCond = {};
  Object.keys(teethMap || {}).forEach(function(n){
    var sm = teethMap[n]; if (!sm) return;
    Object.keys(sm).forEach(function(k){
      if (k === '__status' || k === '__review' || k === '__unit') return;
      var d = getCondition(sm[k]); if (d) _legCond[d.id] = d;
    });
  });
  var _legCondIds = Object.keys(_legCond);
  if (_legCondIds.length) {
    html += '<div class="leg-sep" style="width:1px;height:14px;background:var(--border);margin:0 6px;"></div>';
    for (var _lc = 0; _lc < _legCondIds.length; _lc++) {
      var _ld = _legCond[_legCondIds[_lc]];
      html += '<div class="leg" title="حالة سريرية — بلا تكلفة">'
            + '<svg width="16" height="16" viewBox="0 0 26 26" style="vertical-align:middle;margin-left:3px;">'
            + conditionSymbolSvg(_ld, 13, 13, 22, false) + '</svg>' + escapeHtml(_ld.name) + '</div>';
    }
  }
  // Status legend (small separator)
  html += '<div class="leg-sep" style="width:1px;height:14px;background:var(--border);margin:0 6px;"></div>';
  html += '<div class="leg" title="العلاج المخطط (لم يُنجز بعد)"><div class="leg-dot" style="background:#ef4444;border-radius:50%;"></div>مخطط</div>';
  html += '<div class="leg" title="العلاج الموجود مسبقاً"><div class="leg-dot" style="background:#9ca3af;border-radius:50%;"></div>موجود مسبقاً</div>';
  html += '<div class="leg" title="العلاج المحوّل لطبيب آخر"><div class="leg-dot" style="background:#f59e0b;border-radius:50%;"></div>محوّل</div>';
  html += '<div class="leg" title="حالة سريرية للمتابعة فقط — بدون تكلفة"><div class="leg-dot" style="background:#6b7280;border-radius:50%;"></div>مراقبة</div>';
  leg.innerHTML = html;
}

/* ===== OCCLUSAL (top) VIEW — second perspective of the same odontogram (shares teethMap). Lingual (L) only editable here; O/M/D/B synced. ===== */

/* ── OCCLUSAL (top-down) VIEW — SyDent enamel style, shares teethMap with facial ── */
function occSpline(pts){var n=pts.length,d='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);for(var i=0;i<n;i++){var p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];d+=' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+','+(p1[1]+(p2[1]-p0[1])/6).toFixed(1)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+','+(p2[1]-(p3[1]-p1[1])/6).toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);}return d+' Z';}
function occMirror(g){g.outline=g.outline.map(function(p){return [p[0],100-p[1]];});g.cusps=g.cusps.map(function(c){return [c[0],100-c[1],c[2]];});g.fossae=g.fossae.map(function(f){return [f[0],100-f[1],f[2]];});g.ridges=g.ridges.map(function(r){return [r[0],100-r[1],r[2],100-r[3]];});g.grooves=g.grooves.replace(/(-?[0-9]+(?:[.][0-9]+)?),(-?[0-9]+(?:[.][0-9]+)?)/g,function(m,a,b){return a+','+(100-parseFloat(b));});return g;}
function occGeom(num){
  var t=toothType(num),p=num%10,quad=normQuad(num),upper=(quad===1||quad===2),primary=isPrimaryTooth(num),gid='o'+num,g,bbox;
  if(t==='incisor'){
    var mand=(quad>=3), central=(p===1), w=mand?(central?32:33):(central?42:35), hw=w/2;
    function X(f){return 50+f*hw;}
    var O=[[X(-0.95),40],[50,33.5],[X(0.95),40],[X(0.86),52],[X(0.34),61.5],[X(-0.34),61.5],[X(-0.86),52]];
    var crestY=40, crestMidY=35, edgeY=40;
    var mam=[X(-0.42),X(0),X(0.42)], cing=[50,57], fossa=[50,48,3.6];
    var mRidge=[X(-0.8),45,X(-0.28),60], dRidge=[X(0.8),45,X(0.28),60];
    function fy(q){return [q[0],100-q[1]];}
    if(!upper){O=O.map(fy);cing=fy(cing);fossa=[fossa[0],100-fossa[1],fossa[2]];mRidge=[mRidge[0],100-mRidge[1],mRidge[2],100-mRidge[3]];dRidge=[dRidge[0],100-dRidge[1],dRidge[2],100-dRidge[3]];crestY=100-crestY;crestMidY=100-crestMidY;edgeY=100-edgeY;}
    var ioutline=occSpline(O), ianat='<g clip-path="url(#cl'+gid+')">';
    ianat+='<ellipse cx="50" cy="'+(crestMidY+(upper?4:-4))+'" rx="'+(hw*0.92)+'" ry="7.5" fill="url(#cu'+gid+')"/>';
    ianat+='<ellipse cx="'+cing[0]+'" cy="'+cing[1]+'" rx="'+(hw*0.55)+'" ry="7" fill="url(#cu'+gid+')"/>';
    ianat+='<circle cx="'+fossa[0]+'" cy="'+fossa[1]+'" r="'+(fossa[2]+4)+'" fill="url(#fo'+gid+')"/>';
    ianat+='<path d="M'+X(-0.86)+','+crestY+' Q50,'+(crestMidY+(upper?-1:1))+' '+X(0.86)+','+crestY+'" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.2" stroke-linecap="round"/>';
    mam.forEach(function(mx){ianat+='<line x1="'+mx+'" y1="'+edgeY+'" x2="'+mx+'" y2="'+(upper?edgeY+7:edgeY-7)+'" stroke="rgba(120,82,40,0.28)" stroke-width="1.1" stroke-linecap="round"/>';});
    [mRidge,dRidge].forEach(function(r){ianat+='<line x1="'+r[0]+'" y1="'+r[1]+'" x2="'+r[2]+'" y2="'+r[3]+'" stroke="rgba(255,255,255,0.24)" stroke-width="2.2" stroke-linecap="round"/>';});
    ianat+='<rect x="0" y="0" width="100" height="100" fill="url(#rs'+gid+')"/></g>';
    var ixs=O.map(function(q){return q[0];}),iys=O.map(function(q){return q[1];});
    return {t:t,upper:upper,outline:ioutline,anat:ianat,bbox:{x0:Math.min.apply(null,ixs),x1:Math.max.apply(null,ixs),y0:Math.min.apply(null,iys),y1:Math.max.apply(null,iys)}};
  }
  if(t==='canine'){
    var mesialLeft=!(quad===1||quad===4);
    var O=[[50,26],[37,31],[30,45],[37,62],[50,71],[63,62],[70,45],[63,31]];
    var cuspTip=[49,42], cing=[50,64];
    var ridges=[[cuspTip[0],cuspTip[1],49,30],[cuspTip[0],cuspTip[1],36,47],[cuspTip[0],cuspTip[1],64,49]];
    var lingR=[cuspTip[0],cuspTip[1],50,61], fossae=[[44,57,2],[56,57,2]];
    function fy(p){return [p[0],100-p[1]];} function fyl(l){return [l[0],100-l[1],l[2],100-l[3]];}
    if(!upper){O=O.map(fy);cuspTip=fy(cuspTip);cing=fy(cing);ridges=ridges.map(fyl);lingR=fyl(lingR);fossae=fossae.map(function(f){return[f[0],100-f[1],f[2]];});}
    if(!mesialLeft){var fx=function(p){return[100-p[0],p[1]];};var fxl=function(l){return[100-l[0],l[1],100-l[2],l[3]];};O=O.map(fx);cuspTip=fx(cuspTip);cing=fx(cing);ridges=ridges.map(fxl);lingR=fxl(lingR);fossae=fossae.map(function(f){return[100-f[0],f[1],f[2]];});}
    var cxs=O.map(function(p){return p[0];}),cys=O.map(function(p){return p[1];});
    var cbb={x0:Math.min.apply(null,cxs),x1:Math.max.apply(null,cxs),y0:Math.min.apply(null,cys),y1:Math.max.apply(null,cys)};
    var coutline=occSpline(O), canat='<g clip-path="url(#cl'+gid+')">';
    canat+='<ellipse cx="'+cuspTip[0]+'" cy="'+cuspTip[1]+'" rx="18" ry="18" fill="url(#cu'+gid+')"/>';
    canat+='<ellipse cx="'+cing[0]+'" cy="'+cing[1]+'" rx="12" ry="9" fill="url(#cu'+gid+')"/>';
    canat+='<ellipse cx="'+cuspTip[0]+'" cy="'+cuspTip[1]+'" rx="5.5" ry="6" fill="url(#cc'+gid+')"/>';
    ridges.forEach(function(r){canat+='<line x1="'+r[0]+'" y1="'+r[1]+'" x2="'+r[2]+'" y2="'+r[3]+'" stroke="rgba(255,255,255,0.42)" stroke-width="2.8" stroke-linecap="round"/>';});
    canat+='<line x1="'+lingR[0]+'" y1="'+lingR[1]+'" x2="'+lingR[2]+'" y2="'+lingR[3]+'" stroke="rgba(255,255,255,0.22)" stroke-width="2.2" stroke-linecap="round"/>';
    fossae.forEach(function(f){canat+='<circle cx="'+f[0]+'" cy="'+f[1]+'" r="'+(f[2]+2.5)+'" fill="url(#fo'+gid+')"/>';});
    canat+='<rect x="0" y="0" width="100" height="100" fill="url(#rs'+gid+')"/></g>';
    return {t:t,upper:upper,outline:coutline,anat:canat,bbox:cbb};
  }
  if(t==='molar'){
    // ── Primary molar occlusal morphology (anatomically distinct from permanent) ──
    // Defined in the same convention as the permanent presets below (lower ones are
    // Y-mirrored by occMirror at the end). Clinical facts modelled:
    //  • maxillary 2nd primary molar (55/65) ≈ permanent maxillary 1st molar (rhomboid,
    //    4 cusps + oblique ridge ML→DB).
    //  • maxillary 1st primary molar (54/64): small, triangular, dominant mesiopalatal cusp.
    //  • mandibular 2nd primary molar (75/85) ≈ permanent mandibular 1st molar (5 cusps).
    //  • mandibular 1st primary molar (74/84): elongated mesio-distally, primitive 4-cusp.
    if(primary && upper && p===5)      g={outline:[[28,26],[72,22],[78,52],[74,74],[30,70],[22,50]],cusps:[[34,34,'MB'],[68,34,'DB'],[35,64,'ML'],[70,62,'DL']],grooves:'M50,46 L36,30 M50,46 L50,24 M50,46 Q44,58 40,70 M62,60 Q70,66 76,66',ridges:[[35,64,68,34]],fossae:[[50,46,4.2],[64,58,3]]};
    else if(primary && upper && p===4) g={outline:[[31,28],[69,28],[73,55],[50,72],[27,55]],cusps:[[38,38,'MB'],[63,38,'DB'],[50,63,'ML']],grooves:'M50,50 L40,35 M50,50 L61,36 M50,50 L50,67',ridges:[],fossae:[[50,50,3.4]]};
    else if(primary && p===5)          g={outline:[[22,34],[50,26],[78,34],[74,70],[28,72]],cusps:[[32,40,'MB'],[54,36,'DB'],[72,46,'D'],[64,66,'DL'],[34,66,'ML']],grooves:'M28,50 L72,50 M44,50 L40,32 M58,50 L62,34 M50,50 L50,72',ridges:[],fossae:[[40,50,3.4],[60,50,3.4],[50,50,2.6]]};
    else if(primary && p===4)          g={outline:[[20,37],[80,37],[77,67],[23,67]],cusps:[[34,45,'MB'],[64,45,'DB'],[63,60,'DL'],[35,60,'ML']],grooves:'M27,52 L73,52 M44,52 L41,39 M60,52 L63,39',ridges:[],fossae:[[45,52,2.8],[62,52,2.8]],cuspRX:11};
    else if(upper&&p===6) g={outline:[[28,26],[72,22],[78,52],[74,74],[30,70],[22,50]],cusps:[[34,34,'MB'],[68,34,'DB'],[35,64,'ML'],[70,62,'DL']],grooves:'M50,46 L36,30 M50,46 L50,24 M50,46 Q44,58 40,70 M62,60 Q70,66 76,66',ridges:[[35,64,68,34]],fossae:[[50,46,4.2],[64,58,3]]};
    else if(upper) g={outline:[[28,26],[72,26],[70,64],[30,68]],cusps:[[35,35,'MB'],[66,35,'DB'],[35,60,'ML'],[64,58,'DL']],grooves:'M50,46 L50,26 M50,46 L30,46 M50,46 L66,52 M50,46 L46,66',ridges:[],fossae:[[50,46,4]]};
    else if(p===6) g={outline:[[22,34],[50,26],[78,34],[74,70],[28,72]],cusps:[[32,40,'MB'],[54,36,'DB'],[72,46,'D'],[64,66,'DL'],[34,66,'ML']],grooves:'M28,50 L72,50 M44,50 L40,32 M58,50 L62,34 M50,50 L50,72',ridges:[],fossae:[[40,50,3.4],[60,50,3.4],[50,50,2.6]]};
    else if(p===7) g={outline:[[26,32],[74,32],[74,72],[26,72]],cusps:[[33,40,'MB'],[67,40,'DB'],[67,64,'DL'],[33,64,'ML']],grooves:'M30,52 L70,52 M50,34 L50,70',ridges:[],fossae:[[50,52,3.2]],cuspRX:12,cuspPull:0}; // lower 2nd molar (37/47) — natural anatomy: 4 equal cusps toward the corners (slightly smaller) + the cruciform "+" groove pattern (central + buccal + lingual), the defining occlusal morphology of mandibular 2nd molars
    else g={outline:[[26,32],[74,32],[74,72],[26,72]],cusps:[[37,44,'MB'],[63,44,'DB'],[63,62,'DL'],[37,62,'ML']],grooves:'M30,52 L70,52 M50,34 L50,70',ridges:[],fossae:[[50,52,3.6]]};
    if(!upper) g=occMirror(g);
  } else if(t==='premolar'){
    g={outline:[[50,24],[64.3,37],[66.5,50],[64.3,63],[50,76],[35.7,63],[33.5,50],[35.7,37]],cusps:[[50,37,'B'],[50,64,'L']],grooves:'M35.7,50 Q50,49 64.3,50',ridges:[],fossae:[[40.1,50,2.6],[59.9,50,2.6]]};
    if(!upper) g=occMirror(g);
  }
  var xs=g.outline.map(function(p){return p[0];}), ys=g.outline.map(function(p){return p[1];});
  bbox={x0:Math.min.apply(null,xs),x1:Math.max.apply(null,xs),y0:Math.min.apply(null,ys),y1:Math.max.apply(null,ys)};
  var outline=occSpline(g.outline), anat='<g clip-path="url(#cl'+gid+')">';
  // cusp eminences + bright cores — built ONCE, kept in the base anatomy (under the
  // surface fills) AND returned separately (G.cusps) so the caller can re-stamp them
  // ON TOP of partial surface fills (Dr.: large central cusps vanish under fills).
  var cuspStamp='';
  if(t==='molar'||t==='premolar'){
    var bcx=(bbox.x0+bbox.x1)/2, bcy=(bbox.y0+bbox.y1)/2;
    anat+='<ellipse cx="'+bcx+'" cy="'+bcy+'" rx="'+((bbox.x1-bbox.x0)*0.36)+'" ry="'+((bbox.y1-bbox.y0)*0.34)+'" fill="url(#bas'+gid+')"/>';
  }
  var cPull=(g.cuspPull!=null?g.cuspPull:0.16); // center-pull (0 = sit at the edge positions, per-tooth override)
  g.cusps.forEach(function(c){var dx=(50-c[0])*cPull,dy=(50-c[1])*cPull,rr=(g.cuspRX!=null?g.cuspRX:((t==='premolar'&&c[2]==='B')?17:15));cuspStamp+='<ellipse cx="'+(c[0]+dx+2.2)+'" cy="'+(c[1]+dy+2.4)+'" rx="'+(rr*0.95)+'" ry="'+((rr-1)*0.95)+'" fill="url(#csh'+gid+')"/>';});
  g.cusps.forEach(function(c){var dx=(50-c[0])*cPull,dy=(50-c[1])*cPull,rr=(g.cuspRX!=null?g.cuspRX:((t==='premolar'&&c[2]==='B')?17:15));cuspStamp+='<ellipse cx="'+(c[0]+dx-0.8)+'" cy="'+(c[1]+dy-1)+'" rx="'+rr+'" ry="'+(rr-1)+'" fill="url(#cu'+gid+')"/>';});
  g.cusps.forEach(function(c){var dx=(50-c[0])*cPull,dy=(50-c[1])*cPull,cr=(g.cuspRX!=null?g.cuspRX*0.42:6);cuspStamp+='<ellipse cx="'+(c[0]+dx)+'" cy="'+(c[1]+dy)+'" rx="'+cr+'" ry="'+(cr-0.5)+'" fill="url(#cc'+gid+')"/>';});
  anat+=cuspStamp;
  var cuspsTop='<g clip-path="url(#cl'+gid+')" pointer-events="none">'+cuspStamp+'</g>';
  // triangular ridges (skipped when the geometry asks for no inter-cusp lines)
  if(!g.noTriRidges) g.cusps.forEach(function(c){anat+='<line x1="'+c[0]+'" y1="'+c[1]+'" x2="'+(c[0]+(50-c[0])*0.46)+'" y2="'+(c[1]+(50-c[1])*0.46)+'" stroke="rgba(255,255,255,0.18)" stroke-width="2.6" stroke-linecap="round"/>';});
  // marginal ridges (mesial/distal) for posterior teeth
  if(t==='molar'||t==='premolar'){
    anat+='<path d="M'+(bbox.x0+5)+','+(bbox.y0+9)+' Q'+(bbox.x0+2)+','+((bbox.y0+bbox.y1)/2)+' '+(bbox.x0+5)+','+(bbox.y1-9)+'" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2.6" stroke-linecap="round"/>';
    anat+='<path d="M'+(bbox.x1-5)+','+(bbox.y0+9)+' Q'+(bbox.x1-2)+','+((bbox.y0+bbox.y1)/2)+' '+(bbox.x1-5)+','+(bbox.y1-9)+'" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2.6" stroke-linecap="round"/>';
  }
  g.ridges.forEach(function(r){anat+='<line x1="'+r[0]+'" y1="'+r[1]+'" x2="'+r[2]+'" y2="'+r[3]+'" stroke="rgba(255,255,255,0.2)" stroke-width="3" stroke-linecap="round"/>';});
  g.fossae.forEach(function(f){anat+='<circle cx="'+f[0]+'" cy="'+f[1]+'" r="'+(f[2]+3.5)+'" fill="url(#fo'+gid+')"/>';});
  // grooves: soft under-shadow + crisp line (lightened — were too dark per Dr.)
  if(g.grooves){
    anat+='<path d="'+g.grooves+'" fill="none" stroke="rgba(112,78,40,0.18)" stroke-width="2.6" stroke-linecap="round"/>';
    anat+='<path d="'+g.grooves+'" fill="none" stroke="rgba(120,84,44,0.42)" stroke-width="1.1" stroke-linecap="round"/>';
    anat+='<path d="'+g.grooves+'" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.7" stroke-linecap="round" transform="translate(-0.7,-0.7)"/>';
  }
  // inner rim shadow for depth
  anat+='<rect x="0" y="0" width="100" height="100" fill="url(#rs'+gid+')"/></g>';
  return {t:t,upper:upper,outline:outline,anat:anat,cusps:cuspsTop,bbox:bbox};
}
/* Occlusal (top) view — anatomical (cusp eminences + real groove pattern + fossae).
   ALL surfaces are registrable here, exactly like the facial view: hover paints the
   green per-surface box (CSS .crown-surface:hover) and a click opens the modal for
   that surface. Posterior = O(center)/B/L/M/D; anterior = I(center)/L/M/D — the
   incisal (I) takes the buccal position and there is NO buccal (B) band on an
   anterior tooth. V (cervical/لثوي) is never shown/registrable here — it is not
   visible from a top-down view. */
function buildOcclusalTooth(num, sm, isUpper){
  sm=sm||{};
  var G=occGeom(num), t=G.t, up=G.upper, gid='o'+num, outline=G.outline, b=G.bbox;
  var quad=normQuad(num), mesialOnRight=(quad===1||quad===4);
  var whole=sm.WHOLE, crownFull=sm.CROWN_FULL||null;
  var _oxSt=(isExtractionKey(whole)&&sm.__status)?sm.__status.WHOLE:null;   /* v429 */
  var occPlannedX=!!(_oxSt&&extractionStatusIsOpen(_oxSt));
  var isExtract=isExtractionKey(whole)&&!occPlannedX, isImplant=isImplantKey(whole);
  // Classify the WHOLE entry exactly like the facial view: a legacy WHOLE record
  // may actually be a crown_full or bridge abutment. crown_full → transparent wash;
  // genuine whole (e.g. x-ray) → colored outline. Keeps both views consistent.
  var occWTreat=whole?getTreatment(whole):null;
  var occWTP=occWTreat?(occWTreat.target_part||'whole'):null;
  var occIsBridge=isBridgeKey(whole);
  var occCrownFullKey=occIsBridge?whole:(crownFull||((occWTP==='crown_full')?whole:null));   /* M145-f: مِثبَت الجسر يفوز — مرآة المنظر الوجهي */
  var occHasCrownFull=!!occCrownFullKey;
  var occCrownFullColor=occHasCrownFull?(T_FILL[occCrownFullKey]||'#fb923c'):null;
  var occHasWhole=!!whole && !isExtract && !isImplant && !occIsBridge && occWTP!=='crown_full';
  var occWholeColor=occHasWhole?(T_FILL[whole]||'#f5e6c8'):null;
  // Any PARTIAL surface treatment present (occlusal/buccal/lingual/mesial/distal/incisal)?
  // Used to decide whether to re-stamp the cusps on top so they stay visible.
  var occHasSurfaceFill=!!(effectiveSurfaceTreatment(sm,'O')||effectiveSurfaceTreatment(sm,'B')||effectiveSurfaceTreatment(sm,'L')||effectiveSurfaceTreatment(sm,'M')||effectiveSurfaceTreatment(sm,'D')||effectiveSurfaceTreatment(sm,'I'));
  var defs='<defs>'
    +'<radialGradient id="en'+gid+'" cx="46%" cy="40%" r="68%"><stop offset="0%" stop-color="#fcf7e9"/><stop offset="48%" stop-color="#f4ead3"/><stop offset="82%" stop-color="#e7d8b6"/><stop offset="100%" stop-color="#cfb98a"/></radialGradient>'
    +'<radialGradient id="bas'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(120,84,44,0.22)"/><stop offset="60%" stop-color="rgba(120,84,44,0.08)"/><stop offset="100%" stop-color="rgba(120,84,44,0)"/></radialGradient>'
    +'<radialGradient id="csh'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(110,72,32,0.26)"/><stop offset="70%" stop-color="rgba(110,72,32,0.08)"/><stop offset="100%" stop-color="rgba(110,72,32,0)"/></radialGradient>'
    +'<radialGradient id="cu'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,253,245,0.4)"/><stop offset="60%" stop-color="rgba(247,238,214,0.2)"/><stop offset="100%" stop-color="rgba(247,238,214,0)"/></radialGradient>'
    +'<radialGradient id="fo'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(120,82,40,0.6)"/><stop offset="100%" stop-color="rgba(120,82,40,0)"/></radialGradient>'
    +'<radialGradient id="cc'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,255,255,0.9)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient>'
    +'<radialGradient id="rs'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="70%" stop-color="rgba(120,85,45,0)"/><stop offset="100%" stop-color="rgba(120,85,45,0.32)"/></radialGradient>'
    +'<clipPath id="cl'+gid+'"><path d="'+outline+'"/></clipPath></defs>';
  var occSz=cellWidth(num);
  var svg='<svg class="tooth-shape" viewBox="16.67 16.67 66.67 66.67" width="'+occSz+'" height="'+occSz+'" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">'+defs;
  if(isExtract){
    // Pontic occlusal (adjacent to Fix #1): a bridged extraction shows the
    // occlusal silhouette FILLED in the bridge colour, matching the facial
    // pontic — instead of the empty dashed extraction placeholder.
    if (typeof chartPonticSet !== 'undefined' && chartPonticSet[num]) {
      var rawP = teethMap[String(num)] || {};
      var pKey = isBridgeKey(rawP.PONTIC) ? rawP.PONTIC : (isBridgeKey(rawP.WHOLE) ? rawP.WHOLE : 'bridge');
      var pFill = (T_FILL && T_FILL[pKey]) || '#dc2626';
      var pStroke = (T_STROKE && T_STROKE[pKey]) || '#991b1b';
      svg += '<path d="'+outline+'" fill="'+pFill+'" fill-opacity="0.92" stroke="'+pStroke+'" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      return svg;
    }
    // موقع القلع (M63): tint the occlusal silhouette in the treatment colour under the dashes
    if(typeof toothHasSocket==='function' && toothHasSocket(num)){ svg+='<path d="'+outline+'" fill="'+(socketColorFor(num)||'#f97316')+'" fill-opacity="0.32" stroke="none"/>'; }
    svg+='<path d="'+outline+'" fill="none" stroke="#9aa3b0" stroke-width="2" stroke-dasharray="4 3"/></svg>'; return svg;
  }
  /* v437 (إصلاح): الفرعانِ التاليانِ كانا بعد رسم المينا فلا يُلغيانه —
     مكانُهما الصحيح **قبل أول خطٍّ يُرسم**، مباشرةً بعد مخرج السن المقلوع. */
  /* «جذر متبقٍّ»: لا سطحَ إطباقياً أصلاً ⇒ ظلٌّ منقّطٌ بلون الحالة بدل المينا (بلا رمز — v437). */
  if (sm[COND_SURFACE] && getCondition(sm[COND_SURFACE]) && getCondition(sm[COND_SURFACE]).cond_draw === 'no-crown') {
    var _rcD = getCondition(sm[COND_SURFACE]);
    svg += '<path d="' + outline + '" fill="' + _rcD.fill + '" fill-opacity="0.16" stroke="' + _rcD.stroke + '" stroke-width="1.8" stroke-dasharray="4 3" stroke-linejoin="round"/></svg>';
    return svg;
  }
  /* «انطمار»: سنٌّ لم يبزغ ⇒ ظلٌّ أصغر حول المركز. المجموعةُ تُفتح هنا — بعد كلِّ
     المخارج المبكرة (قلع · وهمي · جذر متبقٍّ) — وتُغلق قبل وسم الإغلاق حصراً. */
  var _occImp = condDrawFlag(sm, 'impacted');
  if (_occImp) svg += '<g class="occ-impacted" transform="translate(50,50) scale(' + COND_IMPACT_OCC_SCALE + ') translate(-50,-50)">';
  /* C3: «غير بازغ» — لا سطحَ إطباقياً ظاهراً بعد ⇒ الجسمُ باهتٌ بالمجموعة نفسها موضعاً وإغلاقاً */
  var _occUn = !_occImp && condDrawFlag(sm, 'unerupted');
  if (_occUn) svg += '<g class="occ-unerupted" opacity="' + COND_UNERUPTED_OPACITY + '">';
  svg+='<path d="'+outline+'" fill="url(#en'+gid+')" stroke="#b08d5b" stroke-width="1.1"/>';
  // surface tints — clipped to the real outline, with directional OVERSHOOT so a
  // colored surface fills its full (curved) area instead of a floating rectangle
  // (Dr. note: M/D were showing as small rectangles). Draw order: middle bands
  // (O,B,L) first, then the M/D side strips LAST so they cleanly overlay the
  // lateral bleed from the middle bands — same unified logic as the facial view.
  var ant=isAnterior(num);
  var cap=(b.x1-b.x0)*0.20, third=(b.y1-b.y0)/3, midX=b.x0+cap, midW=(b.x1-b.x0)-2*cap;
  var bY=up?b.y0:(b.y1-third), lY=up?(b.y1-third):b.y0, oY=b.y0+third;
  // (Anterior incisal/lingual geometry is defined just below — full-width raised
  //  incisal edge + lingual fill — see the comment there.)
  // Anterior surfaces (Dr. request): the Incisal (I) band hugs the incisal EDGE,
  // RAISED toward it and spanning the FULL mesio-distal width — so an incisal
  // edge/corner filling reads across the whole edge. The M/D side strips (drawn
  // last) reclaim the true mesial/distal corners for proximal fillings. The
  // Lingual (L) then fills the REST toward the cingulum, covering the gap left by
  // raising I. iEdgeY/iHv = raised incisal band; lFillY/lHv = the remaining cingulum side.
  var bbH=(b.y1-b.y0);
  var iHv=bbH*0.45, lHv=bbH-iHv;
  var iEdgeY=up?b.y0:(b.y1-iHv);
  var lFillY=up?(b.y0+iHv):b.y0;
  var antX=b.x0, antW=(b.x1-b.x0);
  var leftKey=mesialOnRight?'D':'M', rightKey=mesialOnRight?'M':'D';
  var OS=16; // overshoot (occlusal units) — trimmed back to the crown by the clip-path
  function reg(key,rx,ry,rw,rh){var tk=effectiveSurfaceTreatment(sm,key),fill='#000',op=0;if(tk&&isConditionKey(tk))tk=null;/* v434 */if(tk&&T_FILL[tk]){fill=T_FILL[tk];op=SURFACE_FILL_OPACITY;}if(op===0)return '';return '<rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" fill="'+fill+'" fill-opacity="'+op+'" clip-path="url(#cl'+gid+')" pointer-events="none"></rect>';}
  // Anatomy (cusps / grooves / ridges / fossae) is drawn BEFORE the surface
  // tints so a colored surface (e.g. an occlusal filling) sits ON TOP of the
  // anatomy at full SURFACE_FILL_OPACITY — otherwise the pale cusp highlights
  // painted over it washed the filling out and made it look faint (Dr. note).
  svg+=G.anat;
  // Surface tints are ALWAYS drawn; the full-coverage layers (crown_full wash /
  // whole-tooth outline) are applied AFTER (below), so any treatment beneath a
  // crown/whole stays visible — matches the facial view.
  {
    var bTop=(bY<oY), lTop=(lY<oY); // which vertical end each band sits at
    if(ant){
      // ── ANTERIOR (incisor / canine) ──
      // Incisal (I) takes the buccal+central position (Dr.: "القاطع مكان الدهليزي")
      // and spans the 2/3 nearest the incisal edge. There is NO buccal (B) band on
      // the top-down view of an anterior tooth. L keeps its EXACT original third
      // (Dr.: lingual position is excellent, don't change it). M/D drawn last.
      svg+=reg('I', antX-OS, up?iEdgeY-OS:iEdgeY, antW+2*OS, iHv+OS);
      // Lingual (L): CONFINED to the central column (midX/midW) with vertical
      // overshoot only — never spreads laterally into the M/D crown edges, which
      // are reserved for proximal treatments (Dr. red boundary — same rule as O).
      svg+=reg('L', midX, up?lFillY:lFillY-OS, midW, lHv+OS);
    } else {
      // ── POSTERIOR (premolar / molar) ──
      // O (central occlusal surface): BOUNDED to the central column — no lateral
      // overshoot. It is hemmed in by M/D (sides) and B/L (top/bottom), so it stays
      // a central patch and must NOT spread to the crown edges (Dr. red boundary).
      svg+=reg('O', midX, oY, midW, third);
      // B (buccal): no lateral overshoot — confined to the central column so it
      // never covers the M/D crown edges (reserved for proximal treatments —
      // Dr. red boundary, same rule as O and L). Vertical overshoot kept toward
      // its own buccal edge. Applies to molars AND premolars (this posterior path).
      svg+=reg('B', midX, bTop?bY-OS:bY,     midW, third+OS);
      // Lingual (L): no lateral overshoot — confined to the central column so it
      // never covers the M/D crown edges (reserved for proximal treatments).
      svg+=reg('L', midX, lTop?lY-OS:lY,     midW, third+OS);
    }
    // side strips LAST: outward lateral + vertical to hug the rounded M/D lobes
    svg+=reg(leftKey,  b.x0-OS,  b.y0-OS, cap+OS, (b.y1-b.y0)+2*OS);
    svg+=reg(rightKey, b.x1-cap, b.y0-OS, cap+OS, (b.y1-b.y0)+2*OS);
  }
  svg+='<path d="'+outline+'" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.3" clip-path="url(#cl'+gid+')" pointer-events="none"/>';
  // Re-stamp the cusps ON TOP of partial surface fills so the large central cusps
  // stay visible (Dr.: cusps vanish when an all-surface treatment is applied).
  // Posteriors only (G.cusps); skipped under a full-coverage crown_full/whole
  // (a full crown has no exposed cusp anatomy — Dr.: that case needs no fix).
  if(G.cusps && occHasSurfaceFill && !occHasCrownFull && !occHasWhole){ svg+=G.cusps; }
  // ── Full-coverage layers (drawn last so surface treatments beneath stay visible) ──
  // crown_full: semi-transparent wash (bridge abutment near-solid); whole: colored ring.
  if(occHasCrownFull){ var occCfOp=occIsBridge?0.92:0.38; svg+='<path d="'+outline+'" fill="'+occCrownFullColor+'" fill-opacity="'+occCfOp+'" pointer-events="none"/>'; }
  if(occHasWhole){ svg+='<path d="'+outline+'" fill="none" stroke="'+occWholeColor+'" stroke-width="2.6" stroke-linejoin="round" pointer-events="none"/>'; }
  /* v437: **لا رموزَ حالاتٍ بالمنظر الإطباقي** (طلب المالك: تكرارٌ بلا فائدة — المنظرُ
     الوجهي يحملها بموضعها التشريحي الصحيح). يبقى بالإطباقي أثرُ الحالة على **التشريح**
     وحدَه (تصغيرُ المنطمر · ظلُّ الجذر المتبقّي المنقّط) وصفوفُ التلميح كما هي. */
  if(occPlannedX){ var _oxC=plannedExtractionMarkColor(_oxSt); svg+='<path class="planned-x" d="M '+(b.x0-1)+' '+(b.y0-1)+' L '+(b.x1+1)+' '+(b.y1+1)+' M '+(b.x1+1)+' '+(b.y0-1)+' L '+(b.x0-1)+' '+(b.y1+1)+'" fill="none" stroke="'+_oxC+'" stroke-width="3.2" stroke-linecap="round" stroke-opacity="0.92" pointer-events="none"/>'; }   /* v429 */
  if(isImplant){ svg+='<circle cx="50" cy="50" r="13" fill="#0ea5e9" fill-opacity="0.85" stroke="#0369a1" stroke-width="1" pointer-events="none"/>'; }
  else {
    // Per-surface transparent hit-zones at LOGICAL geometry (no overshoot) so they
    // tile the crown without overlap → accurate hit-testing. Each is a .crown-surface
    // with data-tooth/data-surface, so attachSurfaceClicks() wires it to the modal and
    // the .crown-surface:hover CSS paints the green box — identical to the facial view.
    // Drawn LAST (on top) so they receive the click over the fills/anatomy underneath.
    // V (cervical) is intentionally omitted (not visible from the top-down view).
    var hit=function(key,rx,ry,rw,rh){
      return '<rect class="crown-surface" data-tooth="'+num+'" data-surface="'+key+'" '
           + 'x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" rx="2" ry="2" '
           + 'fill="#000" fill-opacity="0" clip-path="url(#cl'+gid+')"><title>'+surfLabelFor(key, num)+'</title></rect>';
    };
    if(ant){
      svg+=hit('I', antX, iEdgeY, antW, iHv);
      svg+=hit('L', antX, lFillY, antW, lHv);
    } else {
      svg+=hit('O', midX, oY, midW, third);
      svg+=hit('B', midX, bY, midW, third);
      svg+=hit('L', midX, lY, midW, third);
    }
    svg+=hit(leftKey,  b.x0,     b.y0, cap, (b.y1-b.y0));
    svg+=hit(rightKey, b.x1-cap, b.y0, cap, (b.y1-b.y0));
  }
  if (_occImp) svg+='</g>';   /* v436 */
  if (_occUn) {
    svg+='</g>';   /* C3 */
    var _ouD = getCondition('cond-unerupted');
    svg+='<path class="unerupted-outline" d="'+outline+'" fill="none" stroke="'+_ouD.stroke+'" stroke-width="1.4" stroke-dasharray="4 3" stroke-linejoin="round" pointer-events="none"/>';
  }
  svg+='</svg>';
  return svg;
}

/* Tooltip rows for the OCCLUSAL view — lists every treatment visible from the
   top-down view: the full-coverage layer (التاج كامل / السن كاملاً / دعامة جسر)
   plus each registrable surface (anterior: I/L/M/D, posterior: O/B/L/M/D). V
   (cervical) and the roots are NOT shown — they aren't visible from above.
   Mirrors the facial tooltip content so both views agree (Rule #93). */
function occTipRows(num, sm){
  sm = sm || {};
  function badge(sk){
    var st = sm.__status ? sm.__status[sk] : null;
    if(!st || st==='completed') return '';
    var lbl=STATUS_LABELS[st]||st, col=STATUS_COLORS[st]||'#888';
    return ' <span style="display:inline-block;padding:0 5px;border-radius:6px;background:'+col+'33;color:'+col+';font-size:10px;font-weight:700;margin-right:4px;">'+lbl+'</span>';
  }
  function row(color,label,name,b){ return '<div class="tip-row"><span class="tip-dot" style="background:'+escapeHtml(color)+'"></span><b>'+label+':</b> '+escapeHtml(name)+b+'</div>'; } // Rule #195: name/fill are clinic-entered data
  var rows='', whole=sm.WHOLE, cf=sm.CROWN_FULL;
  var wt=whole?getTreatment(whole):null, wtp=wt?(wt.target_part||'whole'):null, isBr=isBridgeKey(whole);
  var cfKey=isBr?whole:(cf||((wtp==='crown_full')?whole:null));   /* M145-f */
  if(cfKey){ var cft=getTreatment(cfKey); var _ocSf=(isBr||!cf)?'WHOLE':'CROWN_FULL'; rows+=row(T_FILL[cfKey]||'#fb923c', isBr?'دعامة جسر':'التاج كامل', cft?cft.name:cfKey, badge(_ocSf)+(isBr?tipUnitOptBadge(num,cfKey,sm.__status&&sm.__status.WHOLE):tipRowOptBadge(num,_ocSf,cfKey,sm))); }
  if(isExtractionKey(whole)){ var _oet=getTreatment(whole); rows=row(T_FILL[whole]||'#888','السن كاملاً', _oet?_oet.name:whole, badge('WHOLE')+tipRowOptBadge(num,'WHOLE',whole,sm))+rows; }   /* M145-g */
  if(isBr && cf){ var _oxt=getTreatment(cf); rows+=row(T_FILL[cf]||'#888','التاج كامل', _oxt?_oxt.name:cf, badge('CROWN_FULL')+tipRowOptBadge(num,'CROWN_FULL',cf,sm)); }
  if(whole && !isExtractionKey(whole) && !isImplantKey(whole) && !isBr && wtp!=='crown_full'){ var wtt=getTreatment(whole); rows+=row(T_FILL[whole]||'#f5e6c8','السن كاملاً', wtt?wtt.name:whole, badge('WHOLE')); }
  if(sm[COND_SURFACE] && getCondition(sm[COND_SURFACE])){ var _ocd=getCondition(sm[COND_SURFACE]); rows+=row(_ocd.fill,'حالة سريرية', _ocd.name, badge(COND_SURFACE)); }   /* v430 */
  if(sm.SPACER && isSpacerKey(sm.SPACER)){ var spT=getTreatment(sm.SPACER); rows+=row(T_FILL[sm.SPACER]||'#d946ef','حافظ مسافة', spT?spT.name:sm.SPACER, badge('SPACER')); }
  if(sm.SOCKET){ var skT=getTreatment(sm.SOCKET); rows+=row(T_FILL[sm.SOCKET]||'#f97316','موقع القلع', skT?skT.name:sm.SOCKET, badge('SOCKET')); }
  // Composite restorations (e.g. MOD) — ONE row each, before single surfaces.
  // (Root rows — single or composite — are intentionally absent here: the occlusal
  // view has no root geometry; root info lives in the facial tooltip.)
  for(var compO in sm){ if(compO==='__status') continue; if(!isCompositeSurfaceCode(compO)||!sm[compO]) continue; var coTk=sm[compO], coObj=getTreatment(coTk); rows+=row(T_FILL[coTk]||'#888', surfLabelFor(compO, num), coObj?coObj.name:coTk, badge(compO)); }
  var keys = isAnterior(num) ? ['I','L','M','D'] : ['O','B','L','M','D'];
  for(var i=0;i<keys.length;i++){ var k=keys[i], tk=sm[k]; if(tk){ var to=getTreatment(tk); rows+=row(T_FILL[tk]||'#888', surfLabelFor(k, num), to?to.name:tk, badge(k)); } }
  rows += sessionTipRows(num, sm);   /* M145-g: بدائلُ الخطة وجلساتُ السجل كانت غائبة عن تلميح المنظر الإطباقي كلياً */
  return rows || '<div class="tip-row" style="color:var(--text3)">سليم — اضغط أي منطقة</div>';
}

var chartPonticSet = {};   // filled by renderTeeth's findPontics; read by buildOcclusalTooth
function renderOcclusal(){
  var rows=[['upperOcc',activeUpper(),true],['lowerOcc',activeLower(),false]];
  rows.forEach(function(R){
    var el=document.getElementById(R[0]); if(!el) return;
    var html='';
    var mid=R[1].length/2;
    for(var i=0;i<R[1].length;i++){
      if(i===mid) html+='<div class="midline"></div>';
      var num=R[1][i], sm=chartFilterSM(teethMap[String(num)]||{});
      var op=1, st=getDominantStatus(num);
      if(st==='planned') op=0.55; else if(st==='referred') op=0.5; else if(st==='condition') op=(condOnlyLibraryRows(num)?1:0.45);   /* v431 */
      else if(st==='existing_current') op=0.8; else if(st==='existing_other'||st==='existing') op=0.6;
      html+='<div class="occ-cell" data-occ-cell="'+num+'" title="السن '+num+'" style="opacity:'+op+'">'
          + '<div class="tooth-tip">'+occTipRows(num,sm)+'</div>'
          + buildOcclusalTooth(num, sm, R[2])
          + '<div class="tooth-num">'+num+'</div></div>';
    }
    el.innerHTML=html;
  });
}

/* ─── D1c ─── */


function renderTeeth() {
  _T = rebuildToothMaps();
  T_FILL = _T.fill; T_STROKE = _T.stroke; T_LABEL = _T.label;
  renderLegend();
  var upperEl = document.getElementById('upperJaw');
  var lowerEl = document.getElementById('lowerJaw');
  if (!upperEl || !lowerEl) return;
  var uHtml = '', lHtml = '';
  // Determine which extracted teeth are part of a bridge unit (between 2 bridge abutments)
  chartPonticSet = {};              // module-level (declared above renderOcclusal) so the
  var ponticSet = chartPonticSet;   // occlusal view can tell pontics from plain extractions
  function findPontics(arch) {
    // A tooth is a pontic when:
    //  (a) extracted AND flagged with PONTIC='bridge', OR
    //  (b) extracted AND between two bridge-marked teeth, OR
    //  (c) marked WHOLE='bridge' AND between two other bridge-marked teeth (legacy data)
    for (var i=0; i<arch.length; i++) {
      var sm = teethMap[String(arch[i])] || {};
      var isExt = isExtractionKey(sm.WHOLE);
      var isBr = isBridgeKey(sm.WHOLE);
      // M85: a PRESENT tooth whose WHOLE=bridge row carries a unit_id is an
      // EXPLICIT retainer (secondary/pier abutment) — never a pontic. The
      // adjacency inference below (cases b/c) exists only for legacy uuid-less
      // data, where pontics were stored at WHOLE; running case (c) on a uuid
      // row strips the middle retainer's root from the drawing.
      if (isBr && !isExt && sm.__unit && sm.__unit.WHOLE) continue;
      // Case (a)
      if (isExt && isBridgeKey(sm.PONTIC)) { ponticSet[arch[i]] = true; continue; }
      // Cases (b) and (c) — must be flanked by other bridge-marked teeth in the unit
      if (!isExt && !isBr) continue;
      var hasLeftBr = false, hasRightBr = false;
      for (var L=i-1; L>=0; L--) {
        var smL = teethMap[String(arch[L])] || {};
        if (isBridgeKey(smL.WHOLE)) { hasLeftBr = true; break; }
        if (!isExtractionKey(smL.WHOLE)) break;
        // Case (c) guard (adjacent-bridges fix): the candidate is a REAL
        // (non-extracted) bridge-marked tooth — a real tooth next to a gap is
        // that gap's ABUTMENT, so never scan across the gap looking for flanks.
        // Only case (b) (the candidate itself extracted) may cross extractions
        // (multi-tooth gaps under one bridge).
        if (!isExt) break;
      }
      for (var R=i+1; R<arch.length; R++) {
        var smR = teethMap[String(arch[R])] || {};
        if (isBridgeKey(smR.WHOLE)) { hasRightBr = true; break; }
        if (!isExtractionKey(smR.WHOLE)) break;
        if (!isExt) break; // case (c) guard — same as the distal scan above
      }
      // Only mark as pontic if it's in the MIDDLE of a bridge unit (flanked on both sides)
      if (hasLeftBr && hasRightBr) ponticSet[arch[i]] = true;
    }
  }
  var AU = activeUpper(), AL = activeLower();
  findPontics(AU);
  findPontics(AL);

  var uMid = AU.length/2, lMid = AL.length/2;
  for (var i=0; i<AU.length; i++) {
    if (i === uMid) uHtml += '<div class="midline"></div>';
    var un = AU[i];
    if (isImplant(un)) uHtml += buildImplantTooth(un, true);
    else if (ponticSet[un]) uHtml += buildPonticTooth(un, true);
    else if (isExtractionDone(un)) uHtml += buildExtractedPlaceholder(un, true);   /* v429: المخطّط يبقى قائماً */
    else uHtml += buildTooth(un, chartFilterSM(teethMap[String(un)]), true);
  }
  for (var j=0; j<AL.length; j++) {
    if (j === lMid) lHtml += '<div class="midline"></div>';
    var ln = AL[j];
    if (isImplant(ln)) lHtml += buildImplantTooth(ln, false);
    else if (ponticSet[ln]) lHtml += buildPonticTooth(ln, false);
    else if (isExtractionDone(ln)) lHtml += buildExtractedPlaceholder(ln, false);
    else lHtml += buildTooth(ln, chartFilterSM(teethMap[String(ln)]), false);
  }
  upperEl.innerHTML = uHtml;
  lowerEl.innerHTML = lHtml;
  // Draw bridge connectors after teeth are in DOM
  setTimeout(renderBridges, 0);
  renderOcclusal();
  attachSurfaceClicks();
  addStatusBadges();
  addPhotoBadges();   // P2 Phase B: photo-count badges, after status badges so both coexist
  addLabBadges();     // open lab-order badges (bottom-left) — status ↗, photos ↖, lab ↙
  if (typeof renderOrthoOverlay === 'function') renderOrthoOverlay();
  renderWatchBanner();   // A: surface due 'مراقبة' reviews above the chart
  // M86: chart re-render wipes the DOM → restore the batch selection rings so
  // the visual state never desyncs from batchSel (e.g. a session completed
  // from another tab mid-selection).
  if (window.__batchMode && typeof batchSyncUI === 'function' && typeof batchSel !== 'undefined' && batchSel.length) {
    batchSyncUI();   // يعيد إبراز الخلايا (WHOLE) والمواضع السطحية/الجذرية معاً بعد إعادة الرسم
  }
}

/* A: due-watch banner — lists 'condition' rows whose review_at has arrived.
   Data comes from teethMap.__review (loaded with the chart), so it stays in
   sync with every renderTeeth() (save / clear / treat all refresh it). */
function renderWatchBanner() {
  var el = document.getElementById('watchDueBanner');
  if (!el) return;
  if (window.__historyMode) { el.style.display = 'none'; el.innerHTML = ''; return; }
  var today = toDay();
  var due = [], soon = [];
  // A2: iterate __status (not __review) so 'condition' rows with NULL review_at
  // (legacy pre-M74 watches, or the explicit "بلا" chip) surface too.
  Object.keys(teethMap || {}).forEach(function(n){
    var st = teethMap[n].__status;
    if (!st) return;
    if (typeof isExtracted === 'function' && isExtracted(n)) return;  // extracted → watch moot
    var rev = teethMap[n].__review || {};
    Object.keys(st).forEach(function(s){
      if (st[s] !== 'condition') return;         // treated/overwritten → watch resolved
      if (s === COND_SURFACE || isConditionKey(teethMap[n][s])) return;   /* v430: حالةٌ سريرية = توثيقٌ دائم لا مراقبةٌ بموعد */
      var tr = getTreatment(teethMap[n][s]);
      var name = (tr && tr.name) || teethMap[n][s] || '';
      var r = rev[s] || null;
      if (r && String(r) <= today) {
        var days = Math.floor((new Date(today) - new Date(r)) / 86400000);
        due.push({ n: n, name: name, days: days });
      } else {
        soon.push({ n: n, name: name, when: r });  // r=null → undated
      }
    });
  });
  if (!due.length && !soon.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  var html = '';
  // A3: group rows by review date (or overdue-days) — the date anchors once per group,
  // teeth are deduped (teeth_status stores one row per surface), and the treatment
  // name appears once per (date,name) sub-group instead of repeating per tooth.
  function _watchGroupLines(list, keyOf, labelOf){
    var by = {}, keys = [];
    list.forEach(function(d){
      var k = keyOf(d);
      if (!by[k]) { by[k] = { label: labelOf(d), names: {}, nameKeys: [] }; keys.push(k); }
      var g = by[k];
      var nm = d.name || '';
      if (!g.names[nm]) { g.names[nm] = { seen: {}, teeth: [] }; g.nameKeys.push(nm); }
      var t = String(d.n);
      if (!g.names[nm].seen[t]) { g.names[nm].seen[t] = 1; g.names[nm].teeth.push(t); }
    });
    return keys.map(function(k){
      var g = by[k];
      var segs = g.nameKeys.map(function(nm){
        var teeth = g.names[nm].teeth.slice().sort(function(a, b){ return (+a) - (+b); });
        // ج: كل سن = chip قابل للنقر لإنهاء مراقبته (الوسيط أرقام فقط — تعقيم صارم للـonclick)
        return (teeth.length === 1 ? 'سن ' : 'الأسنان ') + teeth.map(function(t){
          var tn = String(t).replace(/[^0-9]/g, '');
          return '<span class="wend-chip" onclick="endToothWatch(\'' + tn + '\')" title="إنهاء مراقبة السن ' + tn + '">'
               + escapeHtml(t) + '<span class="wend-x">✕</span></span>';
        }).join('، ')
             + (nm ? ' (' + escapeHtml(nm) + ')' : '');
      });
      return '<b>' + escapeHtml(g.label) + '</b> — ' + segs.join('، ');
    });
  }
  if (due.length) {
    due.sort(function(a, b){ return b.days - a.days; });   // most overdue first
    var parts = _watchGroupLines(due,
      function(d){ return 'd' + d.days; },
      function(d){ return d.days === 0 ? 'اليوم' : ('منذ ' + d.days + (d.days === 1 ? ' يوم' : ' أيام')); });
    html += '<div><b>⏰ مراقبات مستحقّة للمراجعة:</b> ' + parts.join(' · ') + '</div>';
  }
  if (soon.length) {
    soon.sort(function(a, b){ return String(a.when || '9999-99') < String(b.when || '9999-99') ? -1 : 1; }); // nearest first, undated last
    var sp = _watchGroupLines(soon,
      function(d){ return d.when ? String(d.when) : ''; },
      function(d){ return d.when ? fmtDNum(d.when) : 'بلا موعد'; });
    html += '<div style="' + (due.length ? 'margin-top:4px;padding-top:4px;border-top:1px dashed rgba(107,114,128,.4);' : '') + 'font-size:12px;color:var(--text2);">🔎 <b>تحت المراقبة:</b> ' + sp.join(' · ') + '</div>';
  }
  el.innerHTML = html;
  el.style.display = '';
}

/* ج: إنهاء مراقبة سن — قرار سريري بأن لا حاجة لمراجعة إضافية.
   يحوّل كل أسطح السن ذات status='condition' إلى 'existing_other' (اللون يبقى على
   المخطط — المعلومة السريرية لا تُمسح) ويصفّر review_at. المنظومة كلها (البانر /
   قائمة المتابعة / الشارة / صف الـHub / ذيل الواتساب) تتعرف على المراقبة من شرط
   status==='condition' فتُحَلّ جميعها بكتابة واحدة. سجل التاريخ (M76) يلتقط
   التحديث تلقائياً عبر الـtrigger. */
async function endToothWatch(num) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: الشريحة تبقى (بيان المراقبة) و✕ مخفية */
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }
  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return; }
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  var tn = String(num).replace(/[^0-9]/g, '');
  var st = teethMap[tn] && teethMap[tn].__status;
  if (!st) return;
  var surfaces = Object.keys(st).filter(function(s){
    if (s === COND_SURFACE || isConditionKey(teethMap[tn][s])) return false;   /* v430: الحالةُ السريرية تُزال بزرّها لا بإنهاء المراقبة */
    return st[s] === 'condition';
  });
  if (!surfaces.length) return;
  if (!await SyDialog.confirm({ message: 'إنهاء مراقبة السن ' + tn + '؟\nتتحول الحالة إلى «موجود مسبقاً» (يبقى اللون على المخطط) ويُلغى موعد المراجعة.', danger: true })) return;
  if (window._endWatchInFlight) return;   // حارس الإرسال المزدوج (#66)
  window._endWatchInFlight = true;
  try {
    for (var i = 0; i < surfaces.length; i++) {
      var s = surfaces[i];
      var r = await _endWatchUpdate(tn, s);
      if (r && r.error) {
        console.error('endToothWatch:', r.error);
        showToast('⚠️ تعذّر إنهاء المراقبة — حاول مجدداً');
        return;
      }
      if (teethMap[tn] && teethMap[tn].__status) teethMap[tn].__status[s] = 'existing_other';
      if (teethMap[tn] && teethMap[tn].__review) delete teethMap[tn].__review[s];
    }
    renderTeeth();   // يعيد الرسم + يحدّث بانر المراقبة تلقائياً
    if (typeof renderStats === 'function') renderStats();
    showToast('✅ أُنهيت مراقبة السن ' + tn);
  } finally { window._endWatchInFlight = false; }
}

/* ج: UPDATE مقيّد بـstatus='condition' مع نفس تدهورَي upsertTeethStatusWithFallback:
   (1) قاعدة ما قبل M74 → إسقاط review_at؛ (2) قاعدة ما قبل EC/EO → 'existing' القديمة. */
async function _endWatchUpdate(tn, s) {
  function run(payload) {
    return window.sb.from('teeth_status').update(payload)
      .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
      .eq('tooth_num', tn).eq('surface', s).eq('status', 'condition');
  }
  function isNoReviewCol(err) {
    return !!err && (err.code === '42703' || String(err.message || '').indexOf('review_at') !== -1);
  }
  var r = await run({ status: 'existing_other', review_at: null });
  if (r.error && isNoReviewCol(r.error)) r = await run({ status: 'existing_other' });
  if (r.error && isStatusConstraintError(r.error)) {
    r = await run({ status: 'existing', review_at: null });
    if (r.error && isNoReviewCol(r.error)) r = await run({ status: 'existing' });
    if (!r.error) warnEcEoMigrationOnce();
  }
  return r;
}

/* Add a small color dot on each tooth indicating its dominant treatment status.
   Skips teeth with no treatments. */
function addStatusBadges() {
  // Clean slate: restore each cell's title to its base (saved on first run)
  // and clear any opacity left over from a previous status. Without this,
  // a tooth that lost its badge (e.g. status changed to 'completed' or
  // its treatment was removed) would still show its old hover tooltip and
  // faded shape from the prior render.
  document.querySelectorAll('.tooth-cell').forEach(function(c){
    // Save the original title on first encounter so we can restore it later.
    if (!c.hasAttribute('data-base-title')) {
      c.setAttribute('data-base-title', c.title || '');
    }
    // Reset to base each render — we'll append the status label below if needed.
    c.title = c.getAttribute('data-base-title') || '';
    var sh = c.querySelector('.tooth-shape');
    if (sh && sh.style.opacity) sh.style.opacity = '';
  });
  var allTeeth = activeUpper().concat(activeLower());
  for (var i=0; i<allTeeth.length; i++) {
    var num = allTeeth[i];
    var sm = teethMap[String(num)] || {};
    // Skip if no treatments stored
    var hasTreat = false;
    for (var k in sm) { if (k !== '__status') { hasTreat = true; break; } }
    if (!hasTreat) continue;
    var status = getDominantStatus(num);
    if (status === 'completed') continue;  // Don't badge completed (default state)
    /* v431: سنٌّ قائمٌ كلُّ ما عليه حالةُ مكتبةٍ (كسر/قلح…) لا يُعتَّم ولا يحمل شارة «مراقبة»:
       السنُّ موجودٌ وغيرُ معالَج، والرمزُ هو البيان — والتعتيمُ 0.45 كان يطمس الرمز نفسه. */
    if (status === 'condition' && condOnlyLibraryRows(num)) continue;
    var cell = document.querySelector('.tooth-cell[data-tooth-cell="' + num + '"]');
    if (!cell) continue;
    // Remove any old badge
    var old = cell.querySelector('.tooth-status-badge');
    if (old) old.remove();
    // Add new badge — pointer-events:none so the cell beneath receives the hover.
    // The browser tooltip is attached to the cell itself for a wider hover target.
    var badge = document.createElement('div');
    badge.className = 'tooth-status-badge status-' + status;
    cell.appendChild(badge);
    // Native browser tooltip on the cell — appears under the cursor automatically,
    // never gets clipped at screen edges (the browser handles positioning).
    // Combine the base title (e.g. "السن 13") with the status label so the user
    // sees both pieces of info on hover, e.g. "السن 13 — من عيادتنا".
    var statusLbl = STATUS_LABELS[status] || status;
    var baseTitle = cell.getAttribute('data-base-title') || '';
    cell.title = baseTitle ? (baseTitle + ' — ' + statusLbl) : statusLbl;
    // Apply visual treatment to the tooth shape
    var shape = cell.querySelector('.tooth-shape');
    if (shape) {
      if (status === 'planned') shape.style.opacity = '0.55';
      else if (status === 'existing_current') shape.style.opacity = '0.75';
      else if (status === 'existing_other') shape.style.opacity = '0.55';
      else if (status === 'existing') shape.style.opacity = '0.65';  // legacy
      else if (status === 'referred') shape.style.opacity = '0.50';
      else if (status === 'condition') shape.style.opacity = '0.45';  // grey watch — most faded (v431: حالاتُ المكتبة لا تصل هنا)
    }
  }
}

/* Compute the on-screen vertical position of the GINGIVAL THIRD of the crown
   (the embrasure contact area where a bridge connector sits in real dentistry).
   The SVG viewBox is 0..210. Crown spans y=6 to y=cervicalY.
   For upper teeth, the SVG is flipped via transform, so crown sits at the bottom of the cell. */
function getConnectorFrac(num, isUpper) {
  var anat = toothAnatomy(num);
  var crownTop = 6;
  var crownBot = anat.cervicalY || 80;
  // Gingival third of crown — where bridge connectors anatomically sit
  var connY = crownTop + (crownBot - crownTop) * 0.72;
  var actualY = isUpper ? (210 - connY) : connY;
  return actualY / 210;
}

/* Render bridge connectors between adjacent crowns of a bridge unit.
   Each connector is a solid block in the bridge color at the crown's vertical center,
   sitting in the contact zone between two consecutive teeth. */
function renderBridges() {
  // Bridge connectors removed by user request. Bridges are now visually represented
  // by the bridge color on abutments + pontics only, without horizontal connectors.
  ['upperJaw','lowerJaw'].forEach(function(jawId){
    var jaw = document.getElementById(jawId);
    if (!jaw) return;
    var olds = jaw.querySelectorAll('.bridge-link');
    for (var i=0; i<olds.length; i++) olds[i].remove();
  });
}

/* Attach click handlers to all crown surfaces and root parts */
function attachSurfaceClicks() {
  var clickables = document.querySelectorAll('.tooth-shape .crown-surface, .tooth-shape .root-part');
  for (var i = 0; i < clickables.length; i++) {
    clickables[i].addEventListener('click', function(e){
      e.stopPropagation();
      var tooth = this.getAttribute('data-tooth');
      var surf  = this.getAttribute('data-surface');
      openToothModal(parseInt(tooth, 10), surf);
    });
  }
}

/* ─── D1d ─── */

/* ── Tooth Modal ── */
var currentTooth = null;
var currentSurface = null;
/* Selected single crown-surface letters for a composite restoration (e.g. ['M','O','D']).
   Used only for crown-surface clicks; currentSurface is rebuilt from this as the canonical
   composite code. Single selection → currentSurface stays a single letter (backward-compatible). */
var currentSurfaces = [];
var currentRootParts = [];   // composite-root selection (mirror of currentSurfaces for roots)
var pendingToothStatus = null;
var pendingToothLabel  = null;
var pendingTreatStatus = 'completed';  // 'planned' / 'completed' / 'existing_current' / 'existing_other' / 'referred' / 'condition'
/* M85 (long-span bridges): extra secondary retainers requested via the unit
   chips in the modal. Counts of IMMEDIATE eligible neighbors beyond the derived
   mesial/distal abutments (double abutment = 1, capped at 2 per side). Reset on
   every modal open and on exam-mode stamping so no stale extension ever leaks
   into a later save. Read exclusively by persistSpecialTreatment (Rule #201). */
var pendingBridgeExtra = { mesial: 0, distal: 0 };
var BRIDGE_EXTRA_CAP = 2;
/* M85: unit id of the clicked tooth (any surface), or null for legacy rows. */
/* ═══ M145-b: «جسر بديل» — خيارٌ آخر بخطة العلاج لنفس وحدة الجسر ═══════════════
   المخطط يحمل جسراً واحداً لكل سن (صف WHOLE/PONTIC واحد + unit_id)، فجسرٌ ثانٍ على
   الأسنان نفسها كان يدهس صفوف الأول — ولهذا يحجب فلترُ المودال علاجاتِ الجسور عن
   الدعامة والوهمي. البديلُ هنا جلسةٌ مخطّطة بالسجل لنفس الوحدة **بلا أي كتابة على
   المخطط**: الجسر المرسوم يبقى كما هو، والجلستان تُوسَمان أ/ب (M145). عند حذف/اعتماد
   يُعاد مزامنة مفتاح المخطط مع الجسر الباقي (bridgeChartResync). متاح فقط لوحدةٍ
   كلُّ صفوفها «مخطّط» وتحمل unit_id — الجسر المنجز والقديم بلا معرّف يبقيان مقفولين. */
var _altBridge = null;   // { unit:[..], unitId, key } — يُصفَّر أولَ سطرٍ بكل فتحٍ للمودال
function altBridgeContext(num) {
  var uid = toothUnitId(num);
  if (!uid) return null;
  var unit = [], key = null;
  for (var tk in teethMap) {
    var uu = teethMap[tk].__unit || {};
    for (var us in uu) {
      if (uu[us] !== uid) continue;
      var k = teethMap[tk][us];
      if (!isBridgeKey(k)) continue;
      var st = (teethMap[tk].__status && teethMap[tk].__status[us]) || 'completed';
      if (st !== 'planned') return null;          // أي صفٍّ غير مخطّط ⇒ الوحدة مقفولة
      if (!key) key = k;
      if (unit.indexOf(parseInt(tk, 10)) < 0) unit.push(parseInt(tk, 10));
    }
  }
  if (unit.length < 2 || !key) return null;
  var arch = archOf(unit[0]);
  unit.sort(function(a, b){ return arch.indexOf(a) - arch.indexOf(b); });
  return { unit: unit, unitId: uid, key: key };
}
function _sameToothSet(toothNumStr, unit) {
  var a = String(toothNumStr || '').split(',').map(function(x){ return parseInt(x, 10); }).filter(function(x){ return !isNaN(x); });
  if (a.length !== unit.length) return false;
  for (var i = 0; i < unit.length; i++) { if (a.indexOf(unit[i]) < 0) return false; }
  return true;
}
/* جلساتُ الجسر المخطّطة لوحدةٍ بعينها (مطابقةُ مجموعة الأسنان لا ترتيبها). */
function plannedBridgeSessionsForUnit(unit) {
  return (sessions || []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'planned') return false;
    if (String(x.tooth_num || '').indexOf(',') === -1) return false;
    if (!_sameToothSet(x.tooth_num, unit)) return false;
    return isBridgeKey(sessionTreatmentKey(x));
  });
}
/* M145-e: زرعةٌ بديلة للجسر — جلساتُ زرعةٍ مخطّطة على أسنان الوحدة المقلوعة (الوهمية)
   ما دام المخطط يرسم الجسر عليها (WHOLE='extracted' لا مفتاح زرعة). جلسةُ سجلٍّ فقط. */
function plannedAltImplantsForUnit(unit) {
  return (sessions || []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'planned') return false;
    var tn = String(x.tooth_num || '');
    if (!tn || tn.indexOf(',') !== -1) return false;
    var t = parseInt(tn, 10);
    if (unit.indexOf(t) < 0 || !isExtracted(t) || isImplant(t)) return false;
    return isImplantKey(sessionTreatmentKey(x));
  });
}
/* M145-i: أُنجز البديلُ من صفحة المواعيد/اللوحة (لا منطق مخطط هناك) ثم اعتُمد خياره هنا ⇒ المخطط يتبع
   الجلسةَ المنجزة أيضاً، لا المخطّطة وحدها. */
function altImplantsForUnit(unit) {
  return (sessions || []).filter(function(x){
    var st = x && (x.status || 'completed');
    if (!x || (st !== 'planned' && st !== 'completed')) return false;
    /* M145-j: المنجزُ لا يأخذ المخطط إلا إن كان **علامةَ اعتمادٍ معلّق** (يحمل وسم خيار) — زرعةٌ منجزة قديمة
       بلا وسم على سنٍّ ما زال مقلوعاً (فشلت وأُزيلت مثلاً) لا يجوز أن تُرسم من جديد عند حذف جسرٍ مخطّط. */
    if (st === 'completed' && !(typeof planOptOf === 'function' && planOptOf(x))) return false;
    var tn = String(x.tooth_num || '');
    if (!tn || tn.indexOf(',') !== -1) return false;
    var t = parseInt(tn, 10);
    if (unit.indexOf(t) < 0 || !isExtracted(t) || isImplant(t)) return false;
    return isImplantKey(sessionTreatmentKey(x));
  });
}
function doneBridgeSessionsForUnit(unit) {
  return (sessions || []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'completed') return false;
    if (!(typeof planOptOf === 'function' && planOptOf(x))) return false;   /* M145-j: علامة اعتمادٍ معلّق فقط — لا جسرٌ منجز قديم على الأسنان نفسها */
    if (String(x.tooth_num || '').indexOf(',') === -1 || !_sameToothSet(x.tooth_num, unit)) return false;
    return isBridgeKey(sessionTreatmentKey(x));
  });
}
function openAltBridgePicker(n) {
  _altBridge = null;                       // لا يُفعَّل الوضع إلا بقائمةٍ فعلية أدناه
  var ctx = altBridgeContext(n);
  if (!ctx) { showToast('⚠️ البديل متاح لجسرٍ مخطّط فقط'); return; }
  var brs = plannedBridgeSessionsForUnit(ctx.unit), ims = plannedAltImplantsForUnit(ctx.unit);
  var slots = Math.max(brs.length, 1) + (ims.length ? 1 : 0);      // عدد البدائل القائمة (الجسر المرسوم يُحسب ولو بلا جلسة)
  var have = {};
  brs.forEach(function(x){ have[sessionTreatmentKey(x)] = 1; });
  have[ctx.key] = 1;
  var isPonticHere = isExtracted(n) && !isPrimaryTooth(n);
  var implantHere = ims.some(function(x){ return parseInt(x.tooth_num, 10) === parseInt(n, 10); });
  var bridges = [], implants = [];
  for (var i = 0; i < TREATMENTS.length; i++) {
    var t = TREATMENTS[i];
    if (t.is_active === false) continue;
    var tp = t.target_part || 'crown';
    if (tp === 'bridge' && !have[t.id] && slots < 3) bridges.push(t);
    /* الزرعة تُعرض على السن المقلوع حصراً، ومرةً واحدة لكل موقع؛ وزرعاتُ مواقع الوحدة تتشارك خياراً واحداً */
    if (tp === 'implant' && isPonticHere && !implantHere && (ims.length > 0 || slots < 3)) implants.push(t);
  }
  var c = document.getElementById('toothOptsContainer');
  var tabs = document.getElementById('txTabs');
  if (!c) return;
  if (tabs) tabs.innerHTML = '';
  var cur = getTreatment(ctx.key);
  var head = '<div style="grid-column:1/-1;width:100%;padding:8px 10px;margin-bottom:6px;border:1px dashed var(--blue);border-radius:10px;font-size:12.5px;color:var(--text2);line-height:1.7;">'
    + '🔀 <b style="color:var(--blue);">بديل للجسر</b> — الوحدة ' + escapeHtml(ctx.unit.join('، '))
    + ' · المرسوم حالياً: <b>' + escapeHtml(cur ? cur.name : 'جسر') + '</b>.<br>يُضاف كخيارٍ آخر بخطة العلاج (أ/ب/ج) بسعره، والمخطط لا يتغيّر حتى تعتمد أحد الخيارات.'
    + (isPonticHere ? '' : '<br>لإضافة <b>زرعة</b> بديلة: افتح السن المقلوع نفسه.') + '</div>';
  if (!bridges.length && !implants.length) {
    c.innerHTML = head + '<div style="padding:16px;text-align:center;color:var(--text2);font-size:13px;">'
      + (slots >= 3 ? 'اكتملت الخيارات الثلاثة (أ/ب/ج) لهذا الجسر.' : 'لا يوجد بديل آخر مفعَّل بقائمة العلاجات.') + '</div>';
    return;
  }
  _altBridge = ctx;
  currentTooth = n;
  var sub = function(txt){ return '<div style="grid-column:1/-1;width:100%;font-size:12px;font-weight:800;color:var(--text2);margin:6px 0 2px;">' + txt + '</div>'; };
  var html = '';
  if (implants.length) { html += sub('🔩 زرعة مكان السن ' + n); for (var k = 0; k < implants.length; k++) html += txButtonHtml(implants[k]); }
  if (bridges.length)  { html += sub('🌉 نوع جسر آخر'); for (var j = 0; j < bridges.length; j++) html += txButtonHtml(bridges[j]); }
  c.innerHTML = head + html;
}
/* الخطوة الثانية بوضع البديل: الحالةُ «مخطّط» قسراً، بلا شرائح وحدة ولا زر مخبر. */
function altBridgeStep2(label) {
  if (!_altBridge) return;
  pickStatus('planned');
  var sp = document.getElementById('toothStatusPicker'); if (sp) sp.style.display = 'none';
  var lb = document.getElementById('toothLabBtn'); if (lb) lb.style.display = 'none';
  var ch = document.getElementById('bridgeUnitRow'); if (ch) ch.style.display = 'none';
  var ti = document.getElementById('toothStep2Title');
  var _isImp = isImplantKey(pendingToothStatus);
  if (ti) ti.textContent = _isImp
    ? ('🔀 ' + label + ' — زرعة بديلة للجسر (مخطّط) مكان السن ' + currentTooth)
    : ('🔀 ' + label + ' — جسر بديل (مخطّط) للأسنان ' + _altBridge.unit.join('، '));
}
/* مزامنةُ مفتاح المخطط لوحدةٍ مخطّطة مع جلسات جسرها الباقية: لو المفتاحُ المرسوم لم
   يعد له جلسةٌ مخطّطة وبقي بديلٌ ⇒ تُبدَّل صفوف الوحدة لمفتاح الباقي (preferKey أولاً).
   صفوفٌ مخطّطة حصراً، ونفس unit_id حصراً. لا بديل باقٍ ⇒ صفر مساس (السلوك السابق). */
async function bridgeChartResync(toothNumStr, preferKey) {
  var first = parseInt(String(toothNumStr || '').split(',')[0], 10);
  if (isNaN(first)) return false;
  var ctx = null, parts = String(toothNumStr).split(',');
  for (var i = 0; i < parts.length && !ctx; i++) ctx = altBridgeContext(parseInt(parts[i], 10));
  if (!ctx || !_sameToothSet(toothNumStr, ctx.unit)) return false;
  var left = plannedBridgeSessionsForUnit(ctx.unit);
  if (!left.length) {
    var done = doneBridgeSessionsForUnit(ctx.unit);        // M145-i: جسرٌ بديلٌ أُنجز من صفحة المواعيد
    if (done.length) return await _altChartToDoneBridge(ctx, sessionTreatmentKey(done[0]), done[0]);
    var imps = altImplantsForUnit(ctx.unit);               // مخطّطة أو منجزة
    if (!imps.length) return false;                       // لا بديل باقٍ ⇒ صفر مساس (السلوك السابق)
    return await _altChartToImplants(ctx, imps);
  }
  var keys = left.map(function(x){ return sessionTreatmentKey(x); });
  var target = (preferKey && keys.indexOf(preferKey) >= 0) ? preferKey
             : (keys.indexOf(ctx.key) >= 0 ? ctx.key : keys[0]);
  if (!target || target === ctx.key) return false;
  var u = await window.sb.from('teeth_status').update({ treatment_key: target })
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('unit_id', ctx.unitId).eq('status', 'planned').eq('treatment_key', ctx.key);
  if (u.error) { console.warn('bridgeChartResync:', u.error); return false; }
  for (var tk in teethMap) {
    var uu = teethMap[tk].__unit || {};
    for (var us in uu) { if (uu[us] === ctx.unitId && teethMap[tk][us] === ctx.key) teethMap[tk][us] = target; }
  }
  renderTeeth();
  return true;
}

/* M145-e: لم يبقَ للوحدة جسرٌ مخطّط وبقيت زرعةٌ بديلة ⇒ المخطط يتبع: تُحذف صفوف الجسر المخطّطة
   (نفس unit_id حصراً — صفّ القلع WHOLE='extracted' لا يُمَسّ هنا)، ثم يُكتب صفّ الزرعة المخطّطة
   على كل موقع بمرآةٍ حرفية لحفظ الزرعة العادي: مسحُ صفوف السن ثم WHOLE=مفتاح الزرعة. */
/* M145-k: حذفُ جلسة جسرٍ مخطّط من جدول الجلسات **بلا أي بديل باقٍ** كان يترك رسمه مخطّطاً بلا جلسة
   (الإزالةُ كانت بزر «إزالة الجسر» وحده) — وكذلك اعتمادُ خيارٍ لا جسر فيه. الآن يُزال رسمُ الوحدة بمرآة
   ما يفعله الزر لوحدةٍ ذات معرّف: حذفُ صفوف الجسر وحدها، والأسنانُ المقلوعة تبقى مقلوعة. شروطٌ صارمة كلها:
   الجلسة مخطّطة ومفتاحها جسر · الوحدة المرسومة **هي** هذه الجلسة (معرّفٌ واحد، أسنانُها = أسنانُ الجلسة، مفتاحها،
   حالتها «مخطّط») · لا جلسة جسرٍ أخرى (مخطّطة أو منجزة) على الأسنان نفسها · وإلا صفر مساس كما كان. */
async function bridgeDrawingRemoveForDeletedSession(sess) {
  if (!sess || (sess.status || 'completed') !== 'planned' || String(sess.tooth_num || '').indexOf(',') === -1) return false;
  var key = sessionTreatmentKey(sess);
  if (!key || !isBridgeKey(key)) return false;
  var teeth = String(sess.tooth_num).split(',').map(function(v){ return parseInt(v, 10); }).filter(function(v){ return !isNaN(v); });
  var uid = null, seen = {};
  for (var i = 0; i < teeth.length; i++) {
    var sm = teethMap[String(teeth[i])] || {}, uu = sm.__unit || {};
    for (var sf in uu) {
      if (!isBridgeKey(sm[sf])) continue;
      if (sm[sf] !== key || ((sm.__status && sm.__status[sf]) || 'completed') !== 'planned') return false;
      if (uid && uu[sf] !== uid) return false;
      uid = uu[sf]; seen[teeth[i]] = true;
    }
  }
  if (!uid || !teeth.every(function(t){ return seen[t]; })) return false;
  for (var tk in teethMap) {
    var uu2 = teethMap[tk].__unit || {};
    for (var s2 in uu2) { if (uu2[s2] === uid && teeth.indexOf(parseInt(tk, 10)) < 0) return false; }
  }
  var other = (sessions || []).some(function(x){
    if (!x || x.id === sess.id) return false;
    var st = x.status || 'completed';
    if (st !== 'planned' && st !== 'completed') return false;
    return String(x.tooth_num || '').indexOf(',') !== -1 && _sameToothSet(x.tooth_num, teeth) && isBridgeKey(sessionTreatmentKey(x));
  });
  if (other) return false;
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('unit_id', uid).eq('status', 'planned').eq('treatment_key', key);
  if (d.error) { console.warn('bridgeDrawingRemoveForDeletedSession:', d.error); return false; }
  for (var tk2 in teethMap) {
    var sm2 = teethMap[tk2], uu3 = sm2.__unit || {};
    for (var s3 in uu3) {
      if (uu3[s3] !== uid) continue;
      delete sm2[s3];
      if (sm2.__status) delete sm2.__status[s3];
      if (sm2.__review) delete sm2.__review[s3];
      delete uu3[s3];
    }
    if (sm2.__unit && !Object.keys(sm2.__unit).length) delete sm2.__unit;
    if (sm2.__status && !Object.keys(sm2.__status).length) delete sm2.__status;
    if (!Object.keys(sm2).length) delete teethMap[tk2];
  }
  renderTeeth();
  return true;
}
async function _altChartToDoneBridge(ctx, key, sess) {
  var patch = { treatment_key: key, status: 'completed', review_at: null };
  if (sess && sess.provider_id) patch.provider_id = sess.provider_id;
  var u = await window.sb.from('teeth_status').update(patch)
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('unit_id', ctx.unitId).eq('status', 'planned');
  if (u.error) { console.warn('_altChartToDoneBridge:', u.error); return false; }
  for (var tk in teethMap) {
    var uu = teethMap[tk].__unit || {};
    for (var us in uu) {
      if (uu[us] !== ctx.unitId || ((teethMap[tk].__status && teethMap[tk].__status[us]) || 'completed') !== 'planned') continue;
      teethMap[tk][us] = key;
      teethMap[tk].__status[us] = 'completed';
      if (teethMap[tk].__review) delete teethMap[tk].__review[us];
    }
  }
  renderTeeth();
  return true;
}
async function _altChartToImplants(ctx, imps) {
  /* M145-m: بلا معرّف وحدة (زر «إزالة الجسر» أزال صفوف الجسر مسبقاً، أو جسرٌ قديم) ⇒ تُكتب الزرعات وحدها */
  if (ctx.unitId) {
  var d = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('unit_id', ctx.unitId).eq('status', 'planned');
  if (d.error) { console.warn('_altChartToImplants: bridge rows:', d.error); return false; }
  }
  if (ctx.unitId) for (var tk in teethMap) {
    var uu = teethMap[tk].__unit || {};
    for (var us in uu) {
      if (uu[us] !== ctx.unitId) continue;
      delete teethMap[tk][us];
      if (teethMap[tk].__status) delete teethMap[tk].__status[us];
      delete uu[us];
    }
    if (teethMap[tk].__unit && !Object.keys(teethMap[tk].__unit).length) delete teethMap[tk].__unit;
  }
  for (var i = 0; i < imps.length; i++) {
    var x = imps[i], tn = String(parseInt(x.tooth_num, 10)), key = sessionTreatmentKey(x);
    var w = await window.sb.from('teeth_status').delete()
      .eq('doctor_id', currentUser.id).eq('patient_id', patientId).eq('tooth_num', tn);
    if (w.error) { console.warn('_altChartToImplants: pre-wipe:', w.error); continue; }
    var r = await upsertTeethStatusWithFallback({
      doctor_id: currentUser.id, patient_id: patientId, tooth_num: tn, surface: 'WHOLE',
      treatment_key: key, status: (x.status === 'completed' ? 'completed' : 'planned'), provider_id: x.provider_id || null
    }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
    if (r.error) { console.warn('_altChartToImplants: implant row:', r.error); continue; }
    teethMap[tn] = { WHOLE: key, __status: { WHOLE: (x.status === 'completed' ? 'completed' : 'planned') } };   /* M145-i */
  }
  renderTeeth();
  return true;
}

function toothUnitId(num) {
  var u = (teethMap[String(num)] || {}).__unit;
  if (!u) return null;
  for (var s in u) { if (u[s]) return u[s]; }
  return null;
}
/* M85: can `num` serve as a bridge retainer? (present, natural, permanent) */
function isEligibleAbutment(num) {
  return num != null && !isExtracted(num) && !isImplant(num) && !isPrimaryTooth(num);
}
/* M85: single source of truth for the (possibly extended) bridge unit.
   Mirrors the arch math in persistSpecialTreatment (permanent arch — the
   primary-teeth guard rejects bridges before this ever matters). Walks
   OUTWARD from each derived abutment, granting one extra retainer per
   requested step ONLY while the immediate neighbor is eligible — a gap,
   an implant, a primary tooth or the arch end stops the chain (a retainer
   beyond a gap would be a second span, not an extension). Returns:
   { unit:[...], mesialExtra:[...], distalExtra:[...],
     canExtendMesial:bool, canExtendDistal:bool } — or null when the base
   abutments are missing (caller shows its own guard toast). */
function resolveBridgeUnit(gapTooth) {
  var abuts = findBridgeAbutments(gapTooth);
  if (!abuts.mesial || !abuts.distal) return null;
  var arch = (UPPER_T.indexOf(gapTooth) >= 0) ? UPPER_T : LOWER_T;
  var mIdx = arch.indexOf(abuts.mesial), dIdx = arch.indexOf(abuts.distal);
  if (mIdx < 0 || dIdx < 0) return null;   // primary numbers → guard handles messaging
  var lo = Math.min(mIdx, dIdx), hi = Math.max(mIdx, dIdx);
  function chain(startIdx, dir, want) {
    var got = [], i = startIdx;
    while (got.length < want) {
      var k = i + dir;
      if (k < 0 || k >= arch.length || !isEligibleAbutment(arch[k])) break;
      got.push(arch[k]); i = k;
    }
    return got;
  }
  var wantLo = (lo === mIdx) ? pendingBridgeExtra.mesial : pendingBridgeExtra.distal;
  var wantHi = (hi === mIdx) ? pendingBridgeExtra.mesial : pendingBridgeExtra.distal;
  var extLo = chain(lo, -1, wantLo);
  var extHi = chain(hi, +1, wantHi);
  var newLo = lo - extLo.length, newHi = hi + extHi.length;
  // Can one MORE retainer be added on each side? (drives the +/− chip buttons)
  var moreLo = (newLo - 1 >= 0) && isEligibleAbutment(arch[newLo - 1]);
  var moreHi = (newHi + 1 < arch.length) && isEligibleAbutment(arch[newHi + 1]);
  var loIsMesial = (lo === mIdx);
  return {
    unit: arch.slice(newLo, newHi + 1),
    mesialExtra: loIsMesial ? extLo : extHi,
    distalExtra: loIsMesial ? extHi : extLo,
    canExtendMesial: (loIsMesial ? moreLo : moreHi) && pendingBridgeExtra.mesial < BRIDGE_EXTRA_CAP,
    canExtendDistal: (loIsMesial ? moreHi : moreLo) && pendingBridgeExtra.distal < BRIDGE_EXTRA_CAP
  };
}
var pendingReviewMonths = 3;  // A: مراقبة → مراجعة بعد N أشهر (3|6|12|null). يُقرأ فقط عند status='condition'.
/* A: chip selection for the review interval (condition status only). */
function pickReviewMonths(m) {
  pendingReviewMonths = m;
  document.querySelectorAll('#condReviewPicker .status-opt').forEach(function(b){
    var v = b.getAttribute('data-rev');
    b.classList.toggle('selected', (m === null && v === '') || String(m) === v);
  });
}
/* A: resolve the review interval to a concrete date (yyyy-mm-dd) or null. */
function reviewDateFromMonths() {
  if (!pendingReviewMonths) return null;
  var d = new Date(); d.setMonth(d.getMonth() + pendingReviewMonths);
  return ppYmdLocal(d);
}
/* A: value for teeth_status.review_at on every user-status save — a real date only
   for 'condition'; explicit null otherwise so treating a tooth clears a stale watch. */
function _reviewAtVal() {
  /* v432: حالةُ المكتبة السريرية توثيقٌ دائم لا موعدُ مراجعة — شرائحُ المراجعة مخفيةٌ عنها
     (v430)، فكان يُكتب لها تاريخٌ لا يعرضه شيءٌ ولا يقرؤه البانر. الآن null صراحةً. */
  if (typeof isConditionKey === 'function' && isConditionKey(pendingToothStatus)) return null;
  return pendingTreatStatus === 'condition' ? reviewDateFromMonths() : null;
}
/* A: mirror the just-saved review_at into the in-memory teethMap so the banner
   stays accurate without a reload (e.g. re-saving a due watch as 'بلا'). */
function _syncReviewCache(n, s) {
  var v = _reviewAtVal(); n = String(n);
  if (!teethMap[n]) teethMap[n] = {};
  if (v) { if (!teethMap[n].__review) teethMap[n].__review = {}; teethMap[n].__review[s] = v; }
  else if (teethMap[n].__review) { delete teethMap[n].__review[s]; }
}
var pendingProviderId = null;  // Selected clinic doctor for this treatment
var pendingLabSessionId = null; // M79: ledger session the lab-order modal should link to (null = standalone order)
// M86-lab: when the lab-order modal is opened from a BATCH save, this holds one
// {session_id, tooth_num} entry per tooth → the save creates one lab order per
// tooth (OpenDental parity: the batch button repeats the logic per tooth).
// null / single entry ⇒ the classic single-order path runs byte-identically.
var pendingLabBatchUnits = null;
var CLINIC_DOCTORS = [];
var BUNDLE_ITEMS = [];

var STATUS_LABELS = {
  planned:          'مخطط',
  completed:        'منجز',
  existing_current: 'من عيادتنا',
  existing_other:   'من عيادة أخرى',
  existing:         'موجود مسبقاً',           // legacy: pre-migration rows
  referred:         'محوّل',
  condition:        'مراقبة'                  // Phase 3 Feature F: clinical watch only, no charge
};
var STATUS_COLORS = {
  planned:          '#ef4444',
  completed:        '#3b82f6',
  existing_current: '#10b981',                 // green-teal: our practice's historical work
  existing_other:   '#9ca3af',                 // grey: external clinic's work
  existing:         '#9ca3af',                 // legacy: pre-migration rows
  referred:         '#f59e0b',
  condition:        '#6b7280'                  // Phase 3 Feature F: darker grey to differentiate from existing_other
};
/* v352: the same statuses as unified badge tones (timeline/list badges). STATUS_COLORS stays the
   chart palette — the chart keeps its own colours in both themes. */
var STATUS_TONES = {
  planned: 'red', completed: 'blue', existing_current: 'green', existing_other: 'gray',
  existing: 'gray', referred: 'yellow', condition: 'gray'
};

/* Detect "check constraint" errors on teeth_status.status / ledger_sessions.status
   so we can gracefully fall back to legacy 'existing' when the EC/EO migration
   hasn't been applied to the DB yet. Same pattern used for appointments_status_check
   in appointments.html (Gaps 1+5). */
function isStatusConstraintError(err) {
  if (!err) return false;
  var msg = (err.message || '') + ' ' + (err.code || '');
  return /check constraint|23514|teeth_status_status_check|ledger_sessions_status_check/i.test(msg);
}

/* Map new EC/EO statuses to legacy 'existing' for pre-migration DBs.
   Anything else passes through unchanged. */
function downgradeStatusForLegacy(s) {
  if (s === 'existing_current' || s === 'existing_other') return 'existing';
  return s;
}

/* Tracks whether we've already warned the user about the missing EC/EO migration,
   so the toast fires only once per page session. */
var ecEoMigrationWarned = false;
/* M85 mirror of the same pattern: the unit_id fallback used to be console-only,
   so a missing Migration 85 saved bridges without unit membership silently —
   later removal then split at touching retainers (orphaned secondary abutments).
   One visible toast per page session closes that gap. */
var unitIdMigrationWarned = false;
function warnUnitIdMigrationOnce() {
  if (unitIdMigrationWarned) return;
  unitIdMigrationWarned = true;
  showToast('⚠️ يلزم تطبيق Migration 85 — حُفظ الجسر بدون معرّف الوحدة (إزالة الوحدات الطويلة قد لا تكتمل)');
  console.warn('Migration 85 (teeth_status.unit_id) not applied yet — saving bridge rows without unit id.\nRun migrations/85_bridge_unit_id.sql in the SQL Editor.');
}
function warnEcEoMigrationOnce() {
  if (ecEoMigrationWarned) return;
  ecEoMigrationWarned = true;
  showToast('⚠️ تم الحفظ كـ "موجود مسبقاً" — يلزم ترقية قاعدة البيانات لتمييز EC/EO');
  console.warn(
    "Status 'existing_current'/'existing_other' rejected by DB constraint — falling back to legacy 'existing'. " +
    "Run migration:\n" +
    "ALTER TABLE teeth_status DROP CONSTRAINT IF EXISTS teeth_status_status_check;\n" +
    "ALTER TABLE teeth_status ADD CONSTRAINT teeth_status_status_check\n" +
    "  CHECK (status IN ('planned','completed','existing_current','existing_other','referred','condition'));\n" +
    "ALTER TABLE ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_status_check;\n" +
    "ALTER TABLE ledger_sessions ADD CONSTRAINT ledger_sessions_status_check\n" +
    "  CHECK (status IN ('planned','completed','existing_current','existing_other','referred','condition'));\n" +
    "UPDATE teeth_status SET status='existing_other' WHERE status='existing';\n" +
    "UPDATE ledger_sessions SET status='existing_other' WHERE status='existing';"
  );
}

/* Upsert a teeth_status row with automatic legacy fallback.
   If the DB rejects 'existing_current'/'existing_other' because the migration
   isn't applied yet, retry once with 'existing'. Returns the supabase result.
   Note: ledger_sessions inserts don't need a similar wrapper because their callers
   already guard with `if (pendingTreatStatus === 'completed' || 'planned')`, so
   existing_* statuses never reach the ledger insert path. */
async function upsertTeethStatusWithFallback(row, opts) {
  var first = await window.sb.from('teeth_status').upsert(row, opts);
  if (first.error && isStatusConstraintError(first.error)
      && (row.status === 'existing_current' || row.status === 'existing_other')) {
    var legacyRow = Object.assign({}, row, { status: 'existing' });
    var retry = await window.sb.from('teeth_status').upsert(legacyRow, opts);
    if (!retry.error) warnEcEoMigrationOnce();
    return retry;
  }
  // Phase 3 Feature F: if 'condition' is rejected (DB pre-dates Gap 4 migration),
  // surface a clear migration warning to the user. We don't auto-rewrite to another
  // status because 'condition' has distinct clinical semantics — silently downgrading
  // to 'existing' would misrepresent the data.
  if (first.error && isStatusConstraintError(first.error) && row.status === 'condition') {
    showToast('⚠️ حالة "مراقبة" غير مدعومة بعد — يلزم تشغيل migration الـ EC/EO أولاً');
    console.warn(
      "Status 'condition' rejected by DB constraint. " +
      "Run migration:\n" +
      "ALTER TABLE teeth_status DROP CONSTRAINT IF EXISTS teeth_status_status_check;\n" +
      "ALTER TABLE teeth_status ADD CONSTRAINT teeth_status_status_check\n" +
      "  CHECK (status IN ('planned','completed','existing_current','existing_other','referred','condition'));"
    );
  }
  // M85: if the DB pre-dates the unit_id column, retry WITHOUT it (recursively, so
  // the review_at fallback below still gets its chance). Only unit precision is
  // lost — the bridge itself saves fine and deletion falls back to adjacency.
  // Message-based match (42703 / PGRST204 both name the column) so this branch
  // never steals a different column's error.
  if (first.error && Object.prototype.hasOwnProperty.call(row, 'unit_id')
      && String(first.error.message || '').indexOf('unit_id') !== -1) {
    warnUnitIdMigrationOnce();   // user-visible once — a silent console.warn let this slip live
    var noUnitRow = Object.assign({}, row); delete noUnitRow.unit_id;
    return await upsertTeethStatusWithFallback(noUnitRow, opts);
  }
  // A (M74): if the DB pre-dates the review_at column, retry once without it so the
  // clinical save itself never fails — only the scheduled-review metadata is dropped.
  if (first.error && Object.prototype.hasOwnProperty.call(row, 'review_at')
      && (first.error.code === '42703' || String(first.error.message || '').indexOf('review_at') !== -1)) {
    console.warn("Migration 74 (teeth_status.review_at) not applied yet — saving without review date.");
    var noReviewRow = Object.assign({}, row); delete noReviewRow.review_at;
    return await window.sb.from('teeth_status').upsert(noReviewRow, opts);
  }
  return first;
}

/* v430: قفلُ منتقي الحالة على «مراقبة» حين يكون المختارُ حالةً سريرية — والعكسُ يفكّه.
   الشرطُ الحاسم عند الكتابة لا بالواجهة (condNormalizePending)، وهذا للوضوح البصري. */
function condLockStatusPicker(on) {
  var picker = document.getElementById('toothStatusPicker');
  if (picker) picker.setAttribute('data-cond-lock', on ? '1' : '0');
  document.querySelectorAll('#toothStatusPicker .status-opt').forEach(function(b){
    var isCond = b.getAttribute('data-status') === 'condition';
    b.style.display = (on && !isCond) ? 'none' : '';
  });
  if (on) pickStatus('condition');
}
/* حارسُ الكتابة: مفتاحُ حالةٍ ⇒ status='condition' دائماً وتكلفةٌ صفرية — مهما فعلت الواجهة */
function condNormalizePending() {
  if (!isConditionKey(pendingToothStatus)) return false;
  pendingTreatStatus = 'condition';
  var ce = document.getElementById('toothCost');
  if (ce) ce.value = '0';
  return true;
}
function pickStatus(s) {
  /* v430: لا تُسجَّل حالةٌ سريرية كمنجزٍ/مخطّط — ولا سطرَ مالياً لها بأي مسار */
  if (isConditionKey(pendingToothStatus) && s !== 'condition') {
    showToast('🩺 حالة سريرية — تُسجَّل للتوثيق فقط (بلا تكلفة)');
    s = 'condition';
  }
  pendingTreatStatus = s;
  // Update visual selection
  document.querySelectorAll('#toothStatusPicker .status-opt').forEach(function(b){
    if (b.getAttribute('data-status') === s) b.classList.add('selected');
    else b.classList.remove('selected');
  });
  // Cost field is always visible — doctor can leave it 0 if not billable.
  // Phase 3 Feature F: for 'condition' (clinical watch), force cost to 0 and lock the field
  // so the doctor can't accidentally type a charge for something we don't bill for.
  // Restore editability when switching back to any other status.
  var costEl = document.getElementById('toothCost');
  // A: review-date chips are meaningful only for a tooth-based 'condition' save
  // (regional condition is a no-op by design — keep the box hidden there).
  var _crb = document.getElementById('condReviewBox');
  if (_crb) {
    var _showRev = (s === 'condition') && !pendingRegionalType && !isConditionKey(pendingToothStatus);   /* v430: الحالةُ السريرية توثيقٌ دائم لا موعدُ مراجعة */
    _crb.style.display = _showRev ? '' : 'none';
    if (_showRev) pickReviewMonths(3);   // fresh default each time مراقبة is picked
  }
  if (costEl) {
    if (s === 'condition') {
      costEl.value = '0';
      costEl.readOnly = true;
      costEl.style.opacity = '0.55';
      costEl.style.cursor = 'not-allowed';
      costEl.title = 'حالة "مراقبة" — لا تكلفة';
    } else {
      costEl.readOnly = false;
      costEl.style.opacity = '';
      costEl.style.cursor = '';
      costEl.title = '';
    }
  }
  // Auto-fill the notes textarea from the treatment's default/completion note
  var tr = getTreatment(pendingToothStatus);
  if (tr) {
    var notesEl = document.getElementById('toothNotes');
    var existingNote = (notesEl.value || '').trim();
    var defNote = (tr.default_note || '').trim();
    var compNote = (tr.completion_note || '').trim();
    // If the user hasn't typed anything custom, fill from the appropriate note
    if (!existingNote || existingNote === defNote || existingNote === compNote) {
      if (s === 'planned' && defNote) notesEl.value = defNote;
      else if (s === 'completed' && compNote) notesEl.value = compNote;
      else if (s === 'completed' && defNote) notesEl.value = defNote;  // fallback
    }
  }
}

/* ── Composite surface chips (multi-select) ──────────────────────────────────
 * Shown only for crown-surface clicks (not roots / whole / crown_full / regional).
 * Lets the dentist mark a single restoration spanning multiple surfaces (MOD…). */
function crownSurfacesForChips(num){
  // surfacesFor() gives the facial set (I|O, M, D, B, V); add L (recordable from occlusal).
  var set = surfacesFor(num).concat(['L']);
  // unique + canonical display order
  var uniq = [];
  for (var i=0;i<set.length;i++){ if (uniq.indexOf(set[i])===-1) uniq.push(set[i]); }
  uniq.sort(function(a,b){ return (SURFACE_ORDER[a]||99)-(SURFACE_ORDER[b]||99); });
  return uniq;
}

function renderSurfaceChips(){
  var wrap = document.getElementById('toothSurfaceChips');
  var rowEl = document.getElementById('toothSurfaceChipsRow');
  if (!wrap || !rowEl) return;
  if (!currentTooth || !currentSurfaces.length){ wrap.style.display = 'none'; rowEl.innerHTML = ''; return; }
  var _lbl = document.getElementById('toothSurfaceChipsLabel');
  if (_lbl) _lbl.innerHTML = 'الأسطح المشمولة بالترميم <span style="opacity:0.7;">(اضغط لإضافة/إزالة سطح)</span>:';
  var chips = crownSurfacesForChips(currentTooth);
  var html = '';
  for (var i=0;i<chips.length;i++){
    var sk = chips[i];
    var on = currentSurfaces.indexOf(sk) !== -1;
    html += '<button type="button" onclick="toggleSurfaceChip(\'' + sk + '\')" '
         + 'style="padding:5px 12px;border-radius:16px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid '
         + (on ? 'var(--green);background:rgba(var(--green-rgb),0.18);color:var(--green);' : 'var(--border);background:transparent;color:var(--text2);')
         + '">' + (on ? '✓ ' : '') + surfLabelFor(sk, currentTooth) + '</button>';
  }
  rowEl.innerHTML = html;
  wrap.style.display = 'block';
}

function toggleSurfaceChip(surf){
  var idx = currentSurfaces.indexOf(surf);
  if (idx === -1) currentSurfaces.push(surf);
  else {
    if (currentSurfaces.length <= 1) return;   // keep at least one surface selected
    currentSurfaces.splice(idx, 1);
  }
  currentSurface = buildCompositeCode(currentSurfaces);   // single letter if only one
  renderSurfaceChips();
  updateToothModalAreaTitle();
}

/* ── ROOT CHIPS (mirror of the crown-surface chip pair above) ──
   Shown on a root click of a MULTI-root tooth: one chip per anatomical root
   (labels via rootLabelFor) + a «كل الجذور» shortcut. Multi-select builds a
   composite root code (R1R2 / R1R2R3) → ONE row, ONE fee, like MOD. */
function renderRootChips(){
  var wrap = document.getElementById('toothSurfaceChips');
  var rowEl = document.getElementById('toothSurfaceChipsRow');
  if (!wrap || !rowEl) return;
  if (!currentTooth || !currentRootParts.length){ wrap.style.display = 'none'; rowEl.innerHTML = ''; return; }
  var _lbl = document.getElementById('toothSurfaceChipsLabel');
  if (_lbl) _lbl.innerHTML = 'الجذور المشمولة بالعلاج <span style="opacity:0.7;">(اضغط لإضافة/إزالة جذر)</span>:';
  var nR = rootsCount(currentTooth);
  var html = '';
  for (var i=1; i<=nR; i++){
    var rk = 'R' + i;
    var on = currentRootParts.indexOf(rk) !== -1;
    html += '<button type="button" onclick="toggleRootChip(\'' + rk + '\')" '
         + 'style="padding:5px 12px;border-radius:16px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid '
         + (on ? 'var(--green);background:rgba(var(--green-rgb),0.18);color:var(--green);' : 'var(--border);background:transparent;color:var(--text2);')
         + '">' + (on ? '✓ ' : '') + rootLabelFor(rk, currentTooth) + '</button>';
  }
  // «كل الجذور» shortcut — selects every root in one tap (molar RCT common case)
  var allOn = currentRootParts.length === nR;
  html += '<button type="button" onclick="selectAllRootChips()" '
       + 'style="padding:5px 12px;border-radius:16px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer;border:1.5px dashed '
       + (allOn ? 'var(--green);background:rgba(var(--green-rgb),0.10);color:var(--green);' : 'var(--border);background:transparent;color:var(--text2);')
       + '">كل الجذور</button>';
  rowEl.innerHTML = html;
  wrap.style.display = 'block';
}
function toggleRootChip(rk){
  var idx = currentRootParts.indexOf(rk);
  if (idx === -1) currentRootParts.push(rk);
  else {
    if (currentRootParts.length <= 1) return;   // keep at least one root selected
    currentRootParts.splice(idx, 1);
  }
  currentSurface = buildRootComposite(currentRootParts);   // single code if only one
  renderRootChips();
  updateToothModalAreaTitle();
}
function selectAllRootChips(){
  if (!currentTooth) return;
  var nR = rootsCount(currentTooth), all = [];
  for (var i=1; i<=nR; i++) all.push('R' + i);
  currentRootParts = all;
  currentSurface = buildRootComposite(currentRootParts);
  renderRootChips();
  updateToothModalAreaTitle();
}

/* Refresh the modal title's area label from the current (possibly composite) surface. */
function updateToothModalAreaTitle(){
  var el = document.getElementById('toothModalTitle');
  if (!el || !currentTooth) return;
  var areaLbl;
  if (currentSurface === 'WHOLE') areaLbl = 'السن كاملاً';
  else if (currentSurface === 'CROWN_FULL') areaLbl = 'التاج كامل';
  else if (isRootCode(currentSurface)) areaLbl = rootAreaLabelFor(currentSurface, currentTooth);
  else areaLbl = 'السطح ' + surfLabelFor(currentSurface, currentTooth);
  el.textContent = 'السن ' + currentTooth + ' — ' + areaLbl;
  // v333: بالمدخل الجديد الشرائحُ تعيش بالخطوة الثانية — عنوانُها يتبع التبديل
  var s2 = document.getElementById('toothStep2');
  var t2 = document.getElementById('toothStep2Title');
  if (toothEntryMode && s2 && t2 && s2.style.display !== 'none' && pendingToothLabel) {
    t2.textContent = '🦷 ' + pendingToothLabel + ' — السن ' + currentTooth + ' (' + areaLbl + ')';
  }
}


/* ═══════════════ Tooth-modal palette: category tabs + favorites ═══════════════
   The palette grid (#toothOptsContainer) is unchanged; a tab bar (#txTabs, above
   it) filters by category. Two pinned tabs lead: '⭐ المفضلة' (explicit, persisted
   in DB via treatments.is_favorite, starred from the treatments manager) and
   '🔥 شائعة' (usage-ranked via localStorage, falling back to ALL allowed treatments
   until usage exists). Default view is المفضلة when any favorite exists, else شائعة.
   The context action button (remove implant/bridge, undo extraction, mark sound)
   appears in every tab. */
var _txAllowed = [], _txSpecialHtml = '', _txTab = 'starred';
var TX_CAT_META = { condition:'🩺 حالات سريرية', diagnostic:'🔍 تشخيصي', preventive:'🛡️ وقائي', restorative:'🦷 ترميمي', endodontics:'🌱 معالجة لبية', surgical:'🔪 جراحي', prosthodontics:'🔗 تعويضي', implantology:'🔩 زراعة', cosmetic:'✨ تجميلي', prosth_cosmetic:'💎 تعويض تجميلي', orthodontics:'⚓ تقويم', periodontics:'🌿 معالجة لثوية', pediatric:'🧒 أطفال', other:'📋 أخرى' };
var TX_CAT_ORDER = ['condition','diagnostic','preventive','restorative','endodontics','surgical','prosthodontics','implantology','cosmetic','prosth_cosmetic','orthodontics','periodontics','pediatric','other'];
function txUsage(){ try { return JSON.parse(localStorage.getItem('sydent_tx_usage') || '{}'); } catch(e){ return {}; } }
function bumpTxUsage(key){ try { var u = txUsage(); u[key] = (u[key]||0) + 1; localStorage.setItem('sydent_tx_usage', JSON.stringify(u)); } catch(e){} }
function txFavorites(){
  /* v430: الحالاتُ السريرية لا تختلط بالمفضلة/الشائعة — شريحتُها وحدها (درس مكتبة التعليمات v419) */
  var _pool = _txAllowed.filter(function(t){ return !t.is_condition; });
  var u = txUsage(), scored = _pool.filter(function(t){ return (u[t.id]||0) > 0; });
  if (!scored.length) return _pool.slice();   // no usage yet → show all (familiar default)
  scored.sort(function(a,b){ return (u[b.id]||0) - (u[a.id]||0); });
  return scored.slice(0, 8);
}
// Explicit favorites (starred in the treatments manager, persisted in DB via is_favorite).
// Distinct from txFavorites() which is ephemeral usage-based ranking.
function txStarred(){ return _txAllowed.filter(function(t){ return t.is_favorite && !t.is_condition; }); }
function txButtonHtml(t){
  var laymanLine = (t.layman_name && String(t.layman_name).trim())
    ? '<div style="font-size:11px;color:var(--cyan);margin-top:2px;font-weight:500;">👤 ' + escapeHtml(t.layman_name.trim()) + '</div>' : '';
  return '<button class="topt" style="border-color:' + t.fill + ';background:' + t.fill + '22;" '
       + 'onclick="pickToothTreatment(\'' + t.id + '\', \'' + escapeHtml(String(t.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")) /* JS-string escape (\\ then ') + escapeHtml: onclick attr needs BOTH layers - Rule #195 */ + '\')">'
       + '<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:' + t.fill + ';border:1px solid ' + t.stroke + ';margin-left:6px;vertical-align:middle;"></span>'
       + '<span>' + escapeHtml(t.name) + '</span>' + laymanLine + '</button>';
}
function txFirstPresentCat(present){ for (var c=0;c<TX_CAT_ORDER.length;c++){ var _c0 = TX_CAT_ORDER[c]; if (_c0 === 'condition') continue; /* v430: لا تُفتح شريحةُ الحالات افتراضياً */ if (present[_c0]) return _c0; } return 'other'; }
function txTabBtn(cat, label){ return '<button type="button" class="tx-tab' + (_txTab===cat?' tx-tab-active':'') + '" data-txtab="' + cat + '" onclick="switchTxTab(\'' + cat + '\')">' + label + '</button>'; }
function renderTxPalette(){
  var c = document.getElementById('toothOptsContainer'); if (!c) return;
  var list = (_txTab === 'starred') ? txStarred()
           : (_txTab === 'fav')     ? txFavorites()
           : _txAllowed.filter(function(t){ return (t.category||'other') === _txTab; });
  var html = '';
  if (_txTab === 'condition') html += '<div class="tx-cond-hint">حالةٌ سريرية للتوثيق فقط — بلا تكلفة ولا سطرٍ بالحساب.<br>تُسجَّل <b>حيث نقرت</b>: القلحُ والحساسيةُ والارتدادُ والبقعةُ على السطح المنقور (لثوي/دهليزي/حنكي…)، والكسرُ على التاج أو على الجذر المنقور، و«التماس المفتوح» على الإنسي أو الوحشي (نقطة التماس مع السن المجاور). أما الخراجُ والجذرُ المتبقّي والانطمارُ فللسن كاملاً.</div>';
  for (var i=0;i<list.length;i++) html += txButtonHtml(list[i]);
  /* v491: إجراءاتُ السن (الإزالات · «سليم» · الجسر البديل) بصفٍّ مستقلٍّ تحت الشبكة بعنوانه —
     كانت تُسرد بين خيارات العلاج فيقع «🩺 إزالة…» بجانب «قلع» (بلاغ المالك: ليكن بسيطاً ومفهوماً). */
  c.innerHTML = html + (_txSpecialHtml ? '<div class="tx-special-row"><div class="tx-special-lbl">إجراءات على هذا السن:</div>' + _txSpecialHtml + '</div>' : '');
}
function switchTxTab(cat){
  _txTab = cat;
  var tabs = document.querySelectorAll('#txTabs .tx-tab');
  for (var i=0;i<tabs.length;i++) tabs[i].classList.toggle('tx-tab-active', tabs[i].getAttribute('data-txtab') === cat);
  renderTxPalette();
}
function renderTxTabs(){
  var tabsEl = document.getElementById('txTabs'); if (!tabsEl) return;
  var present = {}; for (var i=0;i<_txAllowed.length;i++) present[_txAllowed[i].category||'other'] = 1;
  var starred = txStarred();   // explicit favorites (DB is_favorite)
  var common  = txFavorites(); // ephemeral usage-based
  // Validate active tab; prefer المفضلة → شائعة → first present category
  var valid = {};
  if (starred.length) valid.starred = 1;
  if (common.length)  valid.fav = 1;
  for (var k in present) valid[k] = 1;
  if (!valid[_txTab]) _txTab = starred.length ? 'starred' : (common.length ? 'fav' : txFirstPresentCat(present));
  var html = '';
  if (starred.length) html += txTabBtn('starred', '⭐ المفضلة');
  if (common.length)  html += txTabBtn('fav', '🔥 شائعة');
  // M146: على السن اللبني تتقدّم شريحة «أطفال» مباشرةً بعد المفضلة/الشائعة (بدل آخر الصف)
  var _pedoFirst = present.pediatric && typeof currentTooth !== 'undefined' && currentTooth && isPrimaryTooth(currentTooth);
  if (_pedoFirst) html += txTabBtn('pediatric', TX_CAT_META.pediatric);
  for (var c=0;c<TX_CAT_ORDER.length;c++){ var cat = TX_CAT_ORDER[c]; if (cat === 'condition') continue; if (_pedoFirst && cat === 'pediatric') continue; if (present[cat]) html += txTabBtn(cat, TX_CAT_META[cat] || TX_CAT_META.other); }
  /* v433: المكتبةُ السريرية بسطرٍ مستقلٍّ أسفل تصنيفات العيادة — لا تختلط بها ولا تُلتمس
     وسط اثنتي عشرة شريحة (طلب المالك: «حطها لحالها حتى تكون مميزة»). */
  if (present.condition) {
    html += '<span class="tx-tabs-break"></span>'
          + '<span class="tx-cond-lead">🩺 وسمٌ سريري:</span>'
          + txTabBtn('condition', 'حالات سريرية (بلا تكلفة)').replace('class="tx-tab', 'class="tx-tab tx-tab-cond');
  }
  tabsEl.innerHTML = html;
  renderTxPalette();
}
/* ── v333: وضعُ مدخل «جلسة جديدة» ──────────────────────────────────────────
   _toothEntryNext: طلبٌ لمرّة واحدة يضعه nsePick ويستهلكه openToothModal أولَ سطر.
   toothEntryMode: حالةُ الفتحة الحالية (كل فتحٍ يعيد ضبطها) — يقرؤها الفلتر
   والتوجيه. نقرُ المخطط لا يضعها فيبقى مفلتراً بالمنطقة المنقورة كما كان. */
var _toothEntryNext = false;
var toothEntryMode = false;
function toothChipsPlace(inStep2) {
  var chips = document.getElementById('toothSurfaceChips');
  var dest = document.getElementById(inStep2 ? 'toothStep2AreaSlot' : 'toothChipsHome');
  if (chips && dest && chips.parentNode !== dest) dest.appendChild(chips);
}
/* المنطقةُ بعد اختيار العلاج (مدخل الجلسة الجديدة فقط):
   سطح ⇒ شرائحُ الأسطح (مبذورةٌ من ترميمٍ مركّبٍ قائم يشمل الوسط، وإلا الوسط) ·
   جذر ⇒ كلُّ الجذور افتراضياً (معالجةُ الرحى تشمل الأقنية كلها) وشرائحُها للمتعدّد ·
   غيرهما ⇒ بلا شرائح (التوجيهُ حدّد المنطقة). */
function toothEntryArea(tp) {
  var n = currentTooth;
  currentSurfaces = []; currentRootParts = [];
  /* مرآةُ نقر المخطط: السنُّ المقلوع/المزروع/دعامةُ الجسر بلا شرائح */
  var chipsOk = !isExtracted(n) && !isImplant(n) && !isBridgeAbut(n);
  if (tp === 'crown') {
    var ctr = centerSurface(n), sm = teethMap[String(n)] || {}, comp = null;
    for (var k in sm) {
      if (k === '__status') continue;
      if (isCompositeSurfaceCode(k) && sm[k] && k.indexOf(ctr) !== -1) { comp = k; break; }
    }
    currentSurfaces = comp ? comp.split('') : [ctr];
    currentSurface = buildCompositeCode(currentSurfaces);
    if (chipsOk) renderSurfaceChips();
    else { currentSurfaces = []; var w0 = document.getElementById('toothSurfaceChips'); if (w0) w0.style.display = 'none'; }
  } else if (tp === 'root') {
    var nR = rootsCount(n), parts = [], sm2 = teethMap[String(n)] || {};
    /* جذرٌ مركّبٌ قائم ⇒ يُحرَّر هو (مرآةُ بذر الشرائح بنقر الجذر)، وإلا كلُّ الجذور */
    for (var rk in sm2) {
      if (rk === '__status') continue;
      if (isCompositeRootCode(rk) && sm2[rk]) { parts = rootCodeParts(rk); break; }
    }
    if (!parts.length) for (var i = 1; i <= nR; i++) parts.push('R' + i);
    currentSurface = buildRootComposite(parts);
    if (nR > 1 && chipsOk) { currentRootParts = parts; renderRootChips(); }
    else { var w = document.getElementById('toothSurfaceChips'); if (w) w.style.display = 'none'; }
  } else {
    var w2 = document.getElementById('toothSurfaceChips'); if (w2) w2.style.display = 'none';
  }
}

async function openToothModal(n, surface) {
  var _entryReq = (_toothEntryNext === true); _toothEntryNext = false;   /* v333: يُستهلك أولاً — أيُّ خروجٍ مبكر لا يورّثه */
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: نقرُ السن بالمخطط — المخطط يبقى للعرض */
  _altBridge = null;   /* M145-b: وضعُ الجسر البديل لا يُورَّث لأي فتحٍ أو ختمِ فحص — قبل كل اعتراضات الأوضاع */
  var _spk = document.getElementById('toothStatusPicker'); if (_spk) _spk.style.display = '';
  if (typeof condLockStatusPicker === 'function') condLockStatusPicker(false);   /* v431: قفلُ الحالة السريرية لا يتسرّب لفتحةٍ تالية (المسارُ الإقليمي يفتح الخطوة الثانية بلا pickToothTreatment) */
  toothEntryMode = false;
  // ✏️ v342: المسودة طبقة شرح لا تعديل — القمع الوحيد يرفض ما دامت مفتوحة.
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  // E: historical view is strictly read-only — same single funnel as exam mode.
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }
  // B: exam stamp mode intercepts every tooth/surface click (all entry paths
  // funnel here: buc/occ surfaces, roots, WHOLE areas, extracted ghosts).
  if (window.__examMode && n !== null && n !== undefined) { examStamp(n, surface); return; }
  // M86: batch multi-select intercepts every tooth/surface click (same single funnel).
  if (window.__batchMode && n !== null && n !== undefined) { batchToggleAt(n, surface); return; }
  pendingBridgeExtra = { mesial: 0, distal: 0 };   // M85: fresh unit chips per modal open
  var _ilb = document.getElementById('implantLogBanner'); if (_ilb) _ilb.style.display = 'none';   // M91: default-hidden every open (regional path returns early)
  await loadTreatmentsFromSupabase();
  var _ttClear = document.getElementById('txTabs'); if (_ttClear) _ttClear.innerHTML = '';   // reset tabs (regional path leaves it empty → collapses)
  // Phase 3 Feature G: 'regional mode' — opened via "+ علاج جماعي" button. No specific tooth.
  // In this mode we filter the treatment list to ONLY regional treatments.
  // Authoritative signal is `n === null` (the call-site contract). The window flag is
  // a belt-and-suspenders companion in case some legacy path passes 0/undefined.
  var isRegionalMode = (n === null || n === undefined) && (window.__regionalPickerMode === true);
  if (isRegionalMode) {
    currentTooth = null;
    currentSurface = null;
    currentSurfaces = [];
    currentRootParts = [];
    var _crw = document.getElementById('toothSurfaceChips'); if (_crw) _crw.style.display = 'none';
    document.getElementById('toothModalTitle').textContent = 'علاج جماعي (ربع / فك / فم)';
    var containerR = document.getElementById('toothOptsContainer');
    var htmlR = '';
    var matchedR = 0;
    for (var iR = 0; iR < TREATMENTS.length; iR++) {
      var tR = TREATMENTS[iR];
      if (tR.is_active === false) continue;
      var tpR = tR.target_part || 'crown';
      if (tpR !== 'quadrant' && tpR !== 'arch' && tpR !== 'mouth') continue;
      matchedR++;
      // Phase 3 Feature D: same patient-facing subtitle pattern for regional
      // treatments (denture, full-mouth exam, quadrant cleaning, etc.).
      var laymanLineR = (tR.layman_name && String(tR.layman_name).trim())
        ? '<div style="font-size:11px;color:var(--cyan);margin-top:2px;font-weight:500;">👤 ' + escapeHtml(tR.layman_name.trim()) + '</div>'
        : '';
      htmlR += '<button class="topt" style="border-color:' + tR.fill + ';background:' + tR.fill + '22;" '
            + 'onclick="pickToothTreatment(\'' + tR.id + '\',\'' + escapeHtml(tR.name) + '\')">'   /* in-memory TREATMENTS: key lives on .id */
            + '<span class="topt-label" style="display:inline-block;width:20px;height:20px;border-radius:4px;background:' + tR.fill + ';border:1px solid ' + tR.stroke + ';margin-left:6px;vertical-align:middle;"></span>'
            + '<span>' + escapeHtml(tR.name) + '</span>'
            + laymanLineR
            + '</button>';
    }
    if (matchedR === 0) {
      htmlR = '<div style="text-align:center;color:var(--text2);padding:24px 12px;">'
            + 'لا توجد علاجات جماعية مفعّلة. اذهب إلى صفحة العلاجات وأضف علاجاً بنطاق "ربع/فك/فم".'
            + '</div>';
    }
    containerR.innerHTML = htmlR;
    document.getElementById('toothStep1').style.display = 'block';
    document.getElementById('toothStep2').style.display = 'none';
    document.getElementById('toothFoot').style.display  = 'none';
    document.getElementById('toothModal').classList.add('open');
    return;
  }
  toothChipsPlace(false);   /* v333: الشرائحُ تعود لبيتها بكل فتح */
  toothEntryMode = _entryReq && !surface;
  currentTooth = n;
  currentSurface = surface || centerSurface(n);
  var sm = teethMap[String(n)] || {};
  var st = sm[currentSurface];
  var surfLabel = surfLabelFor(currentSurface, n);

  // Determine which treatments to show based on the clicked region
  // currentSurface is one of: O,M,D,B,L,I (crown surfaces) or R1,R2,R3 (roots) or WHOLE
  var isRootClick = /^R[123]$/.test(currentSurface);
  var isWholeClick = currentSurface === 'WHOLE';

  // Root clicked while its treatment is stored under a COMPOSITE root code (e.g.
  // clicked R1 on a tooth holding 'R1R2'): route to the composite so the modal
  // edits/removes the stored row instead of a phantom single root — exact mirror
  // of the crown-composite seeding below.
  if (isRootClick) {
    for (var _rk in sm) {
      if (_rk === '__status') continue;
      if (isCompositeRootCode(_rk) && sm[_rk] && _rk.indexOf(currentSurface) !== -1) {
        currentSurface = _rk; st = sm[_rk]; break;
      }
    }
  }

  // Title
  var clickedAreaLabel;
  if (isWholeClick) clickedAreaLabel = 'السن كاملاً';
  else if (isRootClick) clickedAreaLabel = rootAreaLabelFor(currentSurface, n);
  else clickedAreaLabel = 'السطح ' + surfLabel;

  document.getElementById('toothModalTitle').textContent = toothEntryMode
    ? 'السن ' + n + ' — اختر العلاج'   /* v333: المنطقةُ تُحدَّد بعد العلاج */
    : 'السن ' + n + ' — ' + clickedAreaLabel + (st ? ' — ' + (getTreatment(st) ? getTreatment(st).name : st) : ' (سليم)');

  // M91 (Backlog #8): implant documentation entry point — implant teeth only.
  // Covers both the canonical WHOLE marking and the legacy any-surface fallback (isImplant).
  if (_ilb && isImplant(n)) _ilb.style.display = 'block';

  // Composite surface chips: show only for crown-surface clicks (single letter like
  // O/I/B/L/M/D/V). Roots, WHOLE, CROWN_FULL keep single-surface behavior (no chips).
  // Seed the selection with the clicked surface; the dentist can add more for a MOD-style
  // restoration. If the clicked surface already holds a composite code, pre-select its letters.
  if (!toothEntryMode && !isRootClick && !isWholeClick && currentSurface !== 'CROWN_FULL'
      && /^[MODBLIV]+$/.test(currentSurface)
      && !isExtracted(n) && !isImplant(n) && !isBridgeAbut(n)) {
    // If the clicked region is already part of a stored composite (e.g. clicked M on a
    // tooth holding 'MOD'), seed the chips from that composite so the dentist edits it
    // as one restoration instead of starting over on a single surface.
    var _existComp = null, _smSeed = teethMap[String(n)] || {};
    for (var _ek in _smSeed) {
      if (_ek === '__status') continue;
      if (isCompositeSurfaceCode(_ek) && _smSeed[_ek] && _ek.indexOf(currentSurface) !== -1) { _existComp = _ek; break; }
    }
    if (_existComp) { currentSurface = _existComp; currentSurfaces = _existComp.split(''); }
    else { currentSurfaces = isCompositeSurfaceCode(currentSurface) ? currentSurface.split('') : [currentSurface]; }
    renderSurfaceChips();
    updateToothModalAreaTitle();
  } else if (!toothEntryMode && isRootClick && rootsCount(n) > 1 && !isExtracted(n) && !isImplant(n) && !isBridgeAbut(n)) {
    // ROOT CHIPS (mirror of crown chips): multi-root tooth → let the dentist pick
    // one root, several, or all (e.g. a molar RCT spans every canal). Seeded from
    // the clicked root — or the stored composite's parts (seeding above already
    // routed currentSurface to it).
    currentRootParts = rootCodeParts(currentSurface);
    renderRootChips();
    updateToothModalAreaTitle();
  } else {
    currentSurfaces = []; currentRootParts = [];
    var _chipWrap = document.getElementById('toothSurfaceChips');
    if (_chipWrap){ _chipWrap.style.display = 'none'; var _r=document.getElementById('toothSurfaceChipsRow'); if(_r) _r.innerHTML=''; }
  }

  // Phase 8B: detect if there's a planned ledger_session on this exact tooth+surface,
  // and if so show the "أكمل العلاج المخطّط" shortcut banner at the top of Step 1.
  // Match logic: same tooth_num + (same surface OR session.surface is null/empty
  // when the user clicked the center/default surface). Pick the most recent.
  // Hidden by default — only the planned-row banner needs surfacing.
  var _b = document.getElementById('toothPlannedBanner');
  var _bInfo = document.getElementById('toothPlannedInfo');
  if (_b && _bInfo) {
    _b.style.display = 'none';
    _bInfo.textContent = '';
    window.__toothPlannedSession = null;
    var _oldSel = document.getElementById('toothPlannedPick');   // v260: قائمة الاختيار من فتحة سابقة
    if (_oldSel) _oldSel.remove();
    try {
      var _ctr = (typeof centerSurface === 'function') ? centerSurface(n) : 'O';
      var _candidates = (sessions || []).filter(function(x){
        if (!x || x.status !== 'planned') return false;
        if (String(x.tooth_num || '') !== String(n)) return false;
        if (toothEntryMode) return true;   /* v333: المدخلُ بلا منطقة ⇒ كلُّ مخطّطات السن (تاج وجذر) */
        var xSurf = x.surface || _ctr;
        return xSurf === currentSurface;
      });
      if (_candidates.length) {
        // Most recent by created_at (DESC) — matches typical UI expectation
        _candidates.sort(function(a, b){
          var ac = String(a.created_at || '');
          var bc = String(b.created_at || '');
          return bc.localeCompare(ac);
        });
        var _picked = _candidates[0];
        window.__toothPlannedSession = _picked;
        var _surfLbl = (_picked.surface && _picked.surface !== 'WHOLE')
          ? ' / ' + surfLabelFor(_picked.surface, _picked.tooth_num)
          : '';
        _bInfo.textContent = (_picked.type || _picked.description || '—')
          + ' — السن ' + _picked.tooth_num + _surfLbl
          + ' • ' + fmt(_picked.cost) + ' ' + curLblOf(_picked.currency);
        // v260: أكثر من جلسة مخطّطة على السطح نفسه (إعادة معالجة + وتد) — كان
        // البانر يلتقط الأحدث فقط فتُخفى الأخرى. قائمةُ اختيار تُبنى بالـDOM
        // (textContent حصراً — صفر innerHTML)؛ الاختيارُ يحدّث __toothPlannedSession.
        if (_candidates.length > 1) {
          _bInfo.textContent = _candidates.length + ' علاجات مخطّطة على هذا السطح — اختر ما أُنجز:';
          var _sel = document.createElement('select');
          _sel.id = 'toothPlannedPick';
          _sel.style.cssText = 'width:100%;margin:6px 0 8px;padding:6px 8px;border-radius:6px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font-size:13px;';
          _candidates.forEach(function(c){
            var o = document.createElement('option');
            o.value = c.id;
            var cs = (c.surface && c.surface !== 'WHOLE') ? ' / ' + surfLabelFor(c.surface, c.tooth_num) : '';
            o.textContent = (c.type || c.description || '—') + cs + ' • ' + fmt(c.cost) + ' ' + curLblOf(c.currency);
            _sel.appendChild(o);
          });
          _sel.addEventListener('change', function(){
            var pick = _candidates.find(function(c){ return c.id === _sel.value; });
            if (pick) window.__toothPlannedSession = pick;
          });
          _bInfo.insertAdjacentElement('afterend', _sel);
        }
        _b.style.display = 'block';
      }
    } catch (e) { console.warn('toothPlannedBanner detect error:', e); }
  }

  // Detect tooth states for the picker
  var isAlreadyExtracted = isExtracted(n);
  var isAlreadyBridgeAbut = isBridgeAbut(n);   // bridge abutment (not pontic)
  var smN = teethMap[String(n)] || {};
  var isAlreadyPontic = isAlreadyExtracted && isBridgeKey(smN.PONTIC);
  var isPartOfBridge = isAlreadyBridgeAbut || isAlreadyPontic;
  var isAlreadyImplant = isImplant(n);

  // UNIFIED LIST: Show ALL treatments regardless of where the user clicked.
  // The smart routing happens at save time based on each treatment's target_part.
  // State-based exceptions:
  //   - Implant: no treatments allowed (only remove button)
  //   - Pontic: no treatments allowed (only remove bridge)
  //   - Bridge abutment: all treatments allowed except those that would overwrite the bridge (implant, bridge) and "extracted"
  //   - Plain extracted: only bridge + implant (those that can replace a missing tooth)
  function isAllowed(t) {
    // Inactive treatments don't appear in the picker (but their rendering still works for legacy data)
    if (t.is_active === false) return false;
    // M146: علاجٌ «لبنية فقط» لا يُعرض على سنٍّ دائم والعكس — بكل حالات السن
    if (!txDentitionOk(t, n)) return false;
    // ── Owner matrix (OpenDental treatment-area model) — applies to STANDING teeth
    //    only. The implant/pontic/extracted state branches below keep their own
    //    rules verbatim: a ghost (even a PLANNED extraction — isExtracted is
    //    status-blind) already offers bridge/implant/socket work exclusively.
    if (!isAlreadyImplant && !isAlreadyPontic && !isAlreadyExtracted) {
      var tpS = t.target_part || 'crown';
      // Implant needs a MISSING site: charting one on a standing tooth would draw
      // the implant with no extraction row in the clinical record. A PLANNED
      // extraction ghosts the tooth immediately, so the correct sequence stays
      // one tap away. (Exam mode intentionally still stamps implants anywhere —
      // it records EXISTING state, not new work.)
      if (tpS === 'implant') return false;
      // Socket-site treatments (طعم عظمي/ضماد سنخ) and space maintainers anchor
      // at an extraction site — meaningless on a standing tooth. Hiding them here
      // makes the old pick-time spacer toast unreachable by construction.
      if (t.post_extraction === true) return false;
      if (typeof isSpacerTreatment === 'function' && isSpacerTreatment(t)) return false;
      if (toothEntryMode) {
        // v333: مدخلُ «جلسة جديدة» — لا منطقةَ منقورة: علاجاتُ التاج والجذر معاً،
        // والمنطقةُ تُحدَّد بعد الاختيار (toothEntryArea).
      } else if (isRootCode(currentSurface)) {
        // ROOT click: root-anchored work + everything tooth-wide-or-wider
        // (whole/extraction — covers بقايا الجذور — bridge, regional). Crown-only
        // work never applies to a root — that was the original wrong scenario.
        if (tpS === 'crown' || tpS === 'crown_full') return false;
      } else {
        // CROWN-side click (surface / WHOLE / CROWN_FULL): everything except
        // root-anchored work — RCT is a Tooth-area code in OpenDental terms;
        // surface selection never applies to it. Root work is charted by
        // clicking the root itself (default «الكل» view always draws roots).
        // 'both' (تاج وجذر legacy) stays visible on both sides.
        if (tpS === 'root') return false;
      }
    }
    if (isAlreadyImplant) return false;
    if (isAlreadyPontic) return false;
    if (isAlreadyBridgeAbut) {
      // Can still add any treatment (e.g. root canal) except those that would overwrite the bridge itself
      var tpA = t.target_part || 'crown';
      return tpA !== 'implant' && tpA !== 'extraction' && tpA !== 'bridge';
    }
    if (isAlreadyExtracted) {
      var tp = t.target_part || 'crown';
      // M61: doctor-flagged post-extraction treatments (ضماد، طعم…) + حافظ مسافة
      if (window.__m61 === true && (t.post_extraction === true || isSpacerTreatment(t))) return true;
      // Primary (deciduous) site: conventional bridges/implants are clinically
      // invalid — hide them here (mirrors the explicit save-time guards).
      if (isPrimaryTooth(n)) return false;
      // Match by target_part (so custom bridge variants like "جسر زركون" also work)
      return tp === 'bridge' || tp === 'implant';
    }
    // Normal tooth — every treatment is allowed; smart routing handles the surface
    return true;
  }

  var container = document.getElementById('toothOptsContainer');

  // Build the allowed treatment list (smart routing handles the surface at save time)
  var _allowed = [];
  for (var i=0; i<TREATMENTS.length; i++) { if (isAllowed(TREATMENTS[i])) _allowed.push(TREATMENTS[i]); }
  /* v430: مكتبةُ الحالات السريرية تمرّ بنفس بوابة isAllowed (فلا تظهر على مقلوعٍ أو مزروع أو دعامة)،
     وخارج وضعَي العلاج الجماعي والجسر البديل — كلاهما مسارُ جلسةٍ مالية لا توثيقِ حالة. */
  if (!window.__regionalPickerMode && !_altBridge) {
    for (var _cl=0; _cl<COND_LIBRARY.length; _cl++) { if (isAllowed(COND_LIBRARY[_cl])) _allowed.push(COND_LIBRARY[_cl]); }
  }

  // Context special action (shown below the palette, in every tab)
  var _special;
  if (isAlreadyImplant)        _special = '<button class="topt tone tone-purple" style="font-weight:700;" onclick="removeImplant(' + n + ')">🔩 إزالة الزراعة</button>';
  else if (isPartOfBridge)     _special = (altBridgeContext(n) ? '<button class="topt" style="border-color:var(--blue);color:var(--blue);font-weight:700;" onclick="openAltBridgePicker(' + n + ')" title="إضافة نوع جسر آخر كخيارٍ بديل بخطة العلاج — المخطط لا يتغيّر">' + (isAlreadyPontic ? '🔀 بديل للجسر (جسر آخر / زرعة)' : '🔀 جسر بديل (خيار آخر بالخطة)') + '</button>' : '')
                                        + '<button class="topt" style="border-color:#dc2626;color:#dc2626;font-weight:700;" onclick="undoExtraction(' + n + ')">🔗 إزالة الجسر</button>';
  else if (isAlreadyExtracted) _special = '<button class="topt" style="border-color:var(--red);color:var(--red);font-weight:700;" onclick="undoExtraction(' + n + ')">↩️ إلغاء القلع (إعادة السن)</button>';
  else                         _special = '<button class="topt" style="border-color:var(--text2)" title="يزيل ما على السطح المنقور (علاجاً كان أو حالة)؛ وعلى سطحٍ فارغ يعيد السنَّ كاملاً سليماً" onclick="clearToothStatus()">⬜ سليم (إلغاء)</button>';

  // حافظ مسافة: removal action stacks on top of whatever context applies
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(n)) {
    _special = '<button class="topt" style="border-color:#d946ef;color:#d946ef;font-weight:700;" onclick="removeSpacerUnit(' + n + ')">🧷 إزالة حافظ المسافة</button>' + _special;
  }
  /* v491: زرُّ إزالةٍ **لكلِّ حالةٍ سريرية** على السن (أيّاً كان موضعها)، باسمها وموضعها —
     وحالةُ السطح المنقور أولاً. «⬜ سليم (إلغاء)» يبقى لإعادة السطح/السن سليماً. */
  if (typeof conditionRowsOf === 'function') {
    var _cRows = conditionRowsOf(n);
    _cRows.sort(function(a, b){ return (a.surface === surface ? 0 : 1) - (b.surface === surface ? 0 : 1); });
    var _cBtns = '';
    for (var _ci2 = 0; _ci2 < _cRows.length; _ci2++) {
      var _cr = _cRows[_ci2];
      _cBtns += '<button class="topt tx-cond-remove" style="border-color:' + _cr.def.stroke + ';color:' + _cr.def.stroke + ';font-weight:700;" '
             +  'title="يزيل هذه الحالة وحدَها — لا يمسّ العلاجات ولا الحالات الأخرى" '
             +  'onclick="removeCondition(' + n + ',\'' + _cr.surface + '\')">🩺 إزالة «' + escapeHtml(_cr.def.name) + '» — ' + escapeHtml(conditionSiteLabel(n, _cr.surface, true)) + '</button>';
    }
    _special = _cBtns + _special;
  }
  // موقع القلع: removal of a post-extraction site treatment stacks on top too
  if (typeof toothHasSocket === 'function' && toothHasSocket(n)) {
    _special = '<button class="topt tone tone-orange" style="font-weight:700;" onclick="removeSocket(' + n + ')">🦴 إزالة علاج موقع القلع</button>' + _special;
  }

  if (_allowed.length === 0) {
    // Phase 4: only show "add treatment" link to Owner (others would hit blocked page)
    var addLink = '';
    if (!window.SyDentLock || window.SyDentLock.isOwner()) {
      addLink = '<br><a href="treatments.html" style="color:var(--green);text-decoration:none;font-weight:700;">⚙️ أضف علاجاً جديداً</a>';
    }
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px;">لا توجد علاجات متاحة لهذه المنطقة.' + addLink + '</div>' + _special;
  } else {
    // Categorized palette: tab bar (⭐شائعة + present categories) sits above the grid.
    _txAllowed = _allowed; _txSpecialHtml = _special; _txTab = 'starred';
    renderTxTabs();
  }
  document.getElementById('toothStep1').style.display = 'block';
  document.getElementById('toothStep2').style.display = 'none';
  document.getElementById('toothFoot').style.display  = 'none';
  snTplRefresh();   /* M95: quick-note picker in the tooth modal too — non-blocking */
  mountToothCostPicker();
  ppDockToothModal(n);   /* DeepCode #20 (v562) — قبل الفتح: التمريرُ ممكنٌ قبل قفل الصفحة تحت النافذة */
  openModal('toothModal');
}

/* DeepCode #20 (v562): نافذةُ العلاج كانت بمنتصف الشاشة فوق المخطط فتغطّي السنَّ المختار نفسه.
   الحاسوب: النافذةُ لوحةٌ بالنصف **المقابل** لموضع السن، بغشاءٍ أخفّ يُبقي المخطط مقروءاً.
   الهاتف (ورقةٌ سفلية أصلاً): السنُّ يُمرَّر لأعلى الشاشة والورقةُ أقصر فيبقى ظاهراً فوقها.
   السنُّ المختار مُبرَز طوال فتح النافذة، ويُزال كلُّ ذلك عند إغلاقها (أيّاً كان مسارُ الإغلاق). */
function ppDockToothModal(n) {
  var m = document.getElementById('toothModal');
  if (!m || n === null || n === undefined) return;
  var prev = document.querySelectorAll('.pp-tooth-sel');
  for (var i = 0; i < prev.length; i++) prev[i].classList.remove('pp-tooth-sel');
  /* السنُّ الظاهر (قد يتكرّر data-tooth بمخططٍ آخر مخفيّ — اللثة) */
  var cand = document.querySelectorAll('[data-tooth="' + String(n).replace(/[^0-9]/g, '') + '"]'), t = null;
  /* عدّةُ عناصر تحمل رقمَ السن نفسه (الأسطح، الجذور، الرقم) — المختارُ أكبرُها الظاهر = السنُّ كاملاً */
  var vis = [];
  for (var k = 0, best = 0; k < cand.length; k++) { var cr = cand[k].getBoundingClientRect(), ar = cr.width * cr.height; if (ar > 0) vis.push(cand[k]); if (ar > best) { best = ar; t = cand[k]; } }
  m.classList.remove('pp-dock-left', 'pp-dock-right');
  if (!t) return;
  for (var v = 0; v < vis.length; v++) vis[v].classList.add('pp-tooth-sel');   /* التاجُ والجذورُ والأسطحُ معاً */
  m.classList.add('pp-dock');
  var narrow = window.matchMedia && window.matchMedia('(max-width: 560px)').matches;
  if (narrow) {
    /* المخططُ قرب آخر الصفحة فلا يتّسع التمريرُ لرفع الفكّ السفلي فوق الورقة — مساحةٌ مؤقتة أسفل الصفحة تُزال عند الإغلاق */
    document.documentElement.classList.add('pp-dock-room');
    try { t.scrollIntoView({ block: 'start', inline: 'center' }); window.scrollBy(0, -72); } catch (e) {}
  } else {
    var r = t.getBoundingClientRect();
    m.classList.add((r.left + r.width / 2) > window.innerWidth / 2 ? 'pp-dock-left' : 'pp-dock-right');
  }
  if (!m.__ppDockWatch && typeof MutationObserver === 'function') {
    m.__ppDockWatch = true;
    new MutationObserver(function () {
      /* لا تُعدّل الصنفَ إلا إن وُجد ما يُزال — classList.remove يكتب السمةَ ولو بلا تغيير فيُعيد إطلاقَ المراقب (حلقة) */
      if (m.classList.contains('open') || !m.classList.contains('pp-dock')) return;
      m.classList.remove('pp-dock', 'pp-dock-left', 'pp-dock-right');
      document.documentElement.classList.remove('pp-dock-room');
      var s = document.querySelectorAll('.pp-tooth-sel');
      for (var j = 0; j < s.length; j++) s[j].classList.remove('pp-tooth-sel');
    }).observe(m, { attributes: true, attributeFilter: ['class'] });
  }
}

/* M125: مبدّل عملة سعر العلاج على #toothCost.
   كان مدفوناً بذيل openToothModal بتعليق يدّعي أنه «يخدم المسارات
   الثلاثة» — وهو صحيح للإقليمي (يمرّ من هنا) وكاذب للدفعة: وضع
   التحديد المتعدد يفتح المودال بنفسه ولا ينادي openToothModal إطلاقاً،
   فلم يكن المبدّل يُركّب له قطّ. ولأن الصفّ يبقى بالـDOM بعد تركيبه، كان
   يظهر بالدفعة متى سبقتها فتحة سن مفرد بنفس تحميل الصفحة ويغيب إن دخلها
   الطبيب باردة — ظهورٌ بالصدفة أسوأ من غيابٍ دائم لأنه لا يُعرف متى يُعتمد
   عليه. صار دالة واحدة يناديها كل مسار يفتح المودال — مصدر واحد بلا مرآة
   تنحرف، ومحروسة ستاتيكياً (المجموعة S بحارس المرايا).
   متكررة بأمان: الوحدة ترتدّ لـreset عند وجود الصفّ فلا يُحقن ثانٍ. */
function mountToothCostPicker() {
  try {
    // التفريغ عند التبديل اليدوي صار عقداً مركزياً بالوحدة المشتركة يغطّي
    // كل حقول المال بالمنصة، فسقط التفريغ المشروط المحلي (كان يشترط علاجاً
    // مختاراً من الكتالوج ولا يفرّغ عند العودة لعملته) — القاعدة صارت مطلقة.
    window.SyDentCurPick.mount('toothCost');
  } catch (e) {}
}

/* Switch the modal to "whole tooth" mode without closing */
function switchToWholeTooth() {
  currentSurface = 'WHOLE';
  openToothModal(currentTooth, 'WHOLE');
}

/* Remove a space-maintainer unit: deletes ONLY the SPACER rows of the contiguous
   unit (abutments + gap). Extraction markers are untouched — the gap stays a gap. */
async function removeSpacerUnit(num) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  var unit = spacerUnitOf(num);
  var _sp = spacerSessionsForUnit(unit);   /* v488: جلساتُ الحافظ — تُلتقط قبل حذف الصفوف */
  if (!await SyDialog.confirm({ message: 'إزالة حافظ المسافة (الأسنان ' + unit.join('، ') + ')؟\nلن يتغير شيء آخر — السن المقلوع يبقى مقلوعاً.'
      + removalSessionsNote(_sp.planned.length, _sp.done.length), danger: true })) return;
  var _spErr = await clearSpacerRows(unit);
  closeModal('toothModal');
  renderTeeth(); renderStats();
  /* v488: كان التوست ✅ حتى مع فشل الحذف (الخطأ بـconsole فقط — #651) */
  if (_spErr) { showToast('⚠️ تمّ جزئياً — بعض الخطوات لم تُحفظ، تحقّق من الاتصال وأعد المحاولة'); return; }
  var _fu = await followUpRemovedSessions(_sp.planned, _sp.done, 'أُزيل حافظ المسافة. هل تريد حذف '
    + (_sp.planned.length === 1 ? 'جلسته المخطّطة' : 'جلساته المخطّطة (' + _sp.planned.length + ')') + ' من السجل أيضاً؟');
  showToast(removalToast('✅', 'تمت إزالة حافظ المسافة', _fu));
}
/* v488: جلساتُ حافظ المسافة لوحدةٍ بعينها — المخطّطة كلها، والمنجزة إن كان صفُّ الحافظ منجزاً. */
function spacerSessionsForUnit(unit) {
  var doneRow = (unit || []).some(function(t){
    var sm = teethMap[String(t)] || {};
    return sm.SPACER && ((sm.__status && sm.__status.SPACER) || 'completed') === 'completed';
  });
  var ok = function(k){ return !!k && isSpacerKey(k); };
  return { planned: unitSessionsFor(unit, 'planned', ok), done: doneRow ? unitSessionsFor(unit, 'completed', ok) : [] };
}
/* يعيد true إن فشل حذفُ أيّ صف (v488: كان يبتلع الخطأ). */
async function clearSpacerRows(unit) {
  var err = false;
  for (var i = 0; i < unit.length; i++) {
    var tn = String(unit[i]);
    if (!(teethMap[tn] && teethMap[tn].SPACER)) continue;
    var dr = await window.sb.from('teeth_status').delete()
      .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
      .eq('tooth_num', tn).eq('surface', 'SPACER');
    if (dr.error) { console.error('delete spacer entry error:', dr.error); err = true; continue; }
    delete teethMap[tn].SPACER;
    if (teethMap[tn].__status) delete teethMap[tn].__status.SPACER;
    var _restK = Object.keys(teethMap[tn]).filter(function(k){ return k !== '__status'; });
    if (_restK.length === 0) delete teethMap[tn];
  }
  return err;
}

/* Remove a post-extraction site treatment: deletes ONLY the SOCKET row of this tooth.
   The extraction (WHOLE='extracted') is untouched — the tooth stays missing. */
var removeSocket = ppGuarded('removeSocket', _removeSocket_inner, '⏳');   /* v284: قفل + انشغال */

/* v491: إزالةُ الحالة السريرية — **لكلِّ حالةٍ زرُّها**، على أيِّ سطحٍ سُجِّلت (COND · سطحٌ تاجي ·
   مركّب · جذر). منذ v434 صارت سبعٌ من العشر سطحيةً أو تاجيةً-جذرية فلم يكن لها زرُّ إزالة
   (الزرُّ القديم يقرأ COND وحده) ولم يبقَ إلا «سليم (إلغاء)».
   نمطُ المنافسين: Dentrix Ascend وOpen Dental يحذفان **كلَّ عنصرٍ مسجَّلٍ وحدَه** (من ملاحظات السير
   أو من الفحص السريع وقتَ الفحص) — لا زرَّ «إعادة السن» يمسح كلَّ شيء.
   أمانٌ: يُحذف الصفُّ فقط إن كان مفتاحُه **حالةً من المكتبة** — لا يحذف علاجاً أبداً مهما مُرِّر له.
   القاعدة #664 (سؤالُ الجلسات) لا تنطبق: صفُّ الحالة لا جلسةَ له بالبناء (ثلاثُ طبقاتٍ تمنع
   دخولَها السجل — v430/v431)، وهو ما قرّرته كتلة 283 (ج) أيضاً. */
function conditionRowsOf(num){
  var sm = teethMap[String(num)] || {}, out = [];
  for (var k in sm) {
    if (k === '__status' || k === '__review' || k === '__unit' || !sm[k]) continue;
    var d = getCondition(sm[k]);
    if (d) out.push({ surface: k, key: sm[k], def: d });
  }
  return out;
}
function conditionSiteLabel(num, surface, short){
  if (surface === COND_SURFACE) return 'السن كاملاً';
  if (typeof isRootCode === 'function' && isRootCode(surface)) return rootAreaLabelFor(surface, num);
  return (short ? '' : 'السطح ') + surfLabelFor(surface, num);
}
var removeCondition = ppGuarded('removeCondition', _removeCondition_inner, '⏳');
async function _removeCondition_inner(num, surface) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  var tn = String(num);
  var sf = surface || COND_SURFACE;
  var key = (teethMap[tn] || {})[sf];
  if (!key || !isConditionKey(key)) { showToast('⚠️ لا توجد حالةٌ سريرية على هذا الموضع'); return; }
  var def = getCondition(key), site = conditionSiteLabel(num, sf);
  if (!await SyDialog.confirm({ message: 'إزالة الحالة السريرية «' + def.name + '» (' + site + ') عن السن ' + num + '؟\nبقيةُ ما على السن من علاجاتٍ وحالاتٍ لا يتأثر.', danger: true })) return;
  var dr = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('tooth_num', tn).eq('surface', sf)
    .eq('treatment_key', key);   /* قيدٌ ثانٍ: لا يُحذف إلا صفُّ هذه الحالة بعينها */
  if (dr.error) { console.error('delete condition row error:', dr.error); showToast('⚠️ ' + dr.error.message); return; }
  delete teethMap[tn][sf];
  if (teethMap[tn].__status) delete teethMap[tn].__status[sf];
  if (teethMap[tn].__review) delete teethMap[tn].__review[sf];
  var _restC = Object.keys(teethMap[tn]).filter(function(k){ return k !== '__status' && k !== '__review' && k !== '__unit'; });
  if (_restC.length === 0) delete teethMap[tn];
  closeModal('toothModal');
  renderTeeth(); renderStats();
  showToast('✅ أُزيلت «' + def.name + '» (' + site + ') عن السن ' + num);
}
async function _removeSocket_inner(num) {
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  var tn = String(num);
  if (!(teethMap[tn] && teethMap[tn].SOCKET)) return;
  /* v488: جلساتُ موقع القلع — تُلتقط قبل حذف الصف */
  var _skPl = plannedToothSessions(num, ['SOCKET']);
  var _skDone = completedToothSessionsForRows(num, removedRowsOf(teethMap[tn], ['SOCKET']));
  if (!await SyDialog.confirm({ message: 'إزالة علاج موقع القلع عن السن ' + num + '؟\nلن يتغير شيء آخر — السن المقلوع يبقى مقلوعاً.'
      + removalSessionsNote(_skPl.length, _skDone.length), danger: true })) return;
  var dr = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('tooth_num', tn).eq('surface', 'SOCKET');
  if (dr.error) { console.error('delete socket entry error:', dr.error); showToast('⚠️ ' + dr.error.message); return; }
  delete teethMap[tn].SOCKET;
  if (teethMap[tn].__status) delete teethMap[tn].__status.SOCKET;
  var _restK = Object.keys(teethMap[tn]).filter(function(k){ return k !== '__status'; });
  if (_restK.length === 0) delete teethMap[tn];
  closeModal('toothModal');
  renderTeeth(); renderStats();
  var _fu = await followUpRemovedSessions(_skPl, _skDone, 'أُزيل علاج موقع القلع. هل تريد حذف '
    + (_skPl.length === 1 ? 'جلسته المخطّطة' : 'جلساته المخطّطة (' + _skPl.length + ')') + ' من السجل أيضاً؟');
  showToast(removalToast('✅', 'تمت إزالة علاج موقع القلع', _fu));
}

/* M85.2 safety net — after a unit is cleared, a neighbouring retainer can still be
   left behind by data the scope math cannot see: rows of an older, wider unit that
   a re-save shrank, or a legacy row sitting beside uuid rows. Such a leftover is
   provably not a bridge — it holds no pontic — so it is swept here instead of
   making the doctor remove each stranded abutment by hand.
   Deliberately conservative: only runs of <=2 teeth are swept, because an
   ULTRA-legacy unit may store its pontics as WHOLE='bridge' (indistinguishable
   from retainers) and such a unit is always >=3 teeth wide. */
async function sweepOrphanRetainers(clearedUnit) {
  if (!clearedUnit || !clearedUnit.length) return false;
  var arch = (UPPER_T.indexOf(clearedUnit[0]) >= 0) ? UPPER_T : LOWER_T;
  var seen = {}, swept = false;
  for (var i = 0; i < clearedUnit.length; i++) {
    var ci = arch.indexOf(clearedUnit[i]);
    if (ci < 0) continue;
    var cand = [arch[ci-1], arch[ci+1]];
    for (var c = 0; c < cand.length; c++) {
      var t = cand[c];
      if (t == null || seen[t] || !isBridgeTooth(t)) continue;
      var run = bridgeRunOf(t);
      for (var r = 0; r < run.length; r++) seen[run[r]] = 1;
      if (!run.length || run.length > 2) continue;
      var hasPontic = false;
      for (var p = 0; p < run.length; p++) { if (isPonticTooth(run[p])) { hasPontic = true; break; } }
      if (hasPontic) continue;
      for (var m = 0; m < run.length; m++) {
        var mt = String(run[m]);
        var msm = teethMap[mt] || {};
        for (var sk in msm) {
          if (!isBridgeKey(msm[sk])) continue;
          var dr = await window.sb.from('teeth_status').delete()
            .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
            .eq('tooth_num', mt).eq('surface', sk);
          if (dr.error) { console.error('orphan retainer sweep error:', dr.error); continue; }
          delete teethMap[mt][sk];
          if (teethMap[mt].__status) delete teethMap[mt].__status[sk];
          if (teethMap[mt].__unit) delete teethMap[mt].__unit[sk];
          swept = true;
        }
        if (teethMap[mt] && teethMap[mt].__unit && !Object.keys(teethMap[mt].__unit).length) delete teethMap[mt].__unit;
        if (teethMap[mt] && teethMap[mt].__status && !Object.keys(teethMap[mt].__status).length) delete teethMap[mt].__status;
        if (teethMap[mt] && !Object.keys(teethMap[mt]).length) delete teethMap[mt];
      }
    }
  }
  return swept;
}

/* Undo extraction: delete all teeth_status rows for this tooth, redraw */
var undoExtraction = ppGuarded('undoExtraction', _undoExtraction_inner, '⏳');   /* v284: قفل + انشغال */
async function _undoExtraction_inner(num) {
  var _wErr = false;   /* v285: كانت تُظهر توست نجاح حتى مع فشل كتابة (console فقط) */
  // Phase 4.1: defense-in-depth — block destructive ops if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  // Determine the scope: just this tooth, or the whole bridge unit?
  var isPartOfBridge = isBridgeTooth(num);
  /* v488: إلغاءُ قلعٍ عادي يزيل صفَّ القلع + موقع القلع (+ حافظ المسافة إن وُجد) ⇒ نفس السؤالين عن جلساتها.
     تُلتقط قبل الحذف. الجسرُ مساره أدناه (M145-l + المنجز). */
  var _uxPl = [], _uxDone = [];
  if (!isPartOfBridge) {
    var _uxSm = teethMap[String(num)] || {};
    var _uxSurf = Object.keys(_uxSm).filter(function(k){ return k.charAt(0) !== '_' && isExtractionKey(_uxSm[k]); });
    if (_uxSm.SOCKET) _uxSurf.push('SOCKET');
    _uxPl = plannedToothSessions(num, _uxSurf);
    _uxDone = completedToothSessionsForRows(num, removedRowsOf(_uxSm, _uxSurf));
    if (typeof toothHasSpacer === 'function' && toothHasSpacer(num)) {
      var _uxSp = spacerSessionsForUnit(spacerUnitOf(num));
      _uxPl = _uxPl.concat(_uxSp.planned); _uxDone = _uxDone.concat(_uxSp.done);
    }
  }
  var confirmMsg = isPartOfBridge
    ? 'إزالة الجسر فقط؟ (الأسنان المقلوعة ستبقى مقلوعة)'
    : 'إلغاء القلع وإعادة السن ' + num + '؟' + removalSessionsNote(_uxPl.length, _uxDone.length);
  if (!await SyDialog.confirm({ message: confirmMsg, danger: false })) return;

  // If this tooth carries a space maintainer, the appliance is no longer valid
  // once the tooth returns — clear the WHOLE spacer unit first (no orphan wires).
  if (typeof toothHasSpacer === 'function' && toothHasSpacer(num)) {
    if (await clearSpacerRows(spacerUnitOf(num))) _wErr = true;   /* v488: الفشل لم يكن يُحتسب */
  }
  var unitToClear = [num];
  // M85 exact path: rows written since Migration 85 share a unit_id uuid — the
  // unit is simply "every tooth carrying that uuid". No walking, no heuristics,
  // and double/pier abutments (two touching PRESENT retainers inside ONE unit,
  // which the pre-M85.2 adjacency boundary mis-split) delete correctly.
  var clearUnitId = isPartOfBridge ? toothUnitId(num) : null;
  if (isPartOfBridge && clearUnitId) {
    unitToClear = [];
    for (var tk in teethMap) {
      var uu = teethMap[tk].__unit || {};
      for (var us in uu) { if (uu[us] === clearUnitId) { unitToClear.push(parseInt(tk, 10)); break; } }
    }
    if (!unitToClear.length) unitToClear = [num];   // defensive — never zero scope
  } else if (isPartOfBridge) {
    // M85.2: legacy (uuid-less) rows — the unit is parsed from the contiguous
    // bridge run through the "every unit holds >=1 pontic" invariant instead of
    // splitting at every touching retainer (which stranded double/pier retainers).
    unitToClear = legacyBridgeUnitOf(num);
    if (!unitToClear.length) unitToClear = [num];   // defensive — never zero scope
  }

  // M85.2: does this unit store its pontics at the PONTIC surface? If it does,
  // an interior WHOLE='bridge' row is a REAL secondary/pier retainer and must be
  // DELETED, not rewritten to 'extracted' (that would erase a present tooth).
  // Only an ULTRA-legacy unit — zero PONTIC rows — earns the interior heuristic.
  var _unitHasPonticRow = false;
  for (var _phi = 0; _phi < unitToClear.length; _phi++) {
    var _phm = teethMap[String(unitToClear[_phi])] || {};
    if (isBridgeKey(_phm.PONTIC)) { _unitHasPonticRow = true; break; }
  }
  for (var i=0; i<unitToClear.length; i++) {
    var tn = String(unitToClear[i]);
    var sm = teethMap[tn] || {};
    if (isPartOfBridge) {
      // Removing a bridge: delete ONLY bridge entries; keep 'extracted' so previously-extracted teeth stay extracted.
      for (var sk in sm) {
        if (isBridgeKey(sm[sk])) {
          // If the bridge was stored at WHOLE for a tooth that was originally extracted (legacy data),
          // we need to restore the 'extracted' marker so the tooth shows as missing again.
          // Heuristic: if this WHOLE='bridge' tooth is in the middle of the unit (not first/last), it was a pontic.
          // M85: LEGACY units only — a uuid unit stores pontics at PONTIC always, so an
          // interior WHOLE=bridge row there is a REAL secondary/pier retainer; running the
          // heuristic on it would rewrite a present tooth to 'extracted' (data corruption).
          var isInteriorTooth = !clearUnitId && !_unitHasPonticRow && (tn !== String(unitToClear[0]) && tn !== String(unitToClear[unitToClear.length-1]));
          if (sk === 'WHOLE' && isInteriorTooth) {
            // Convert WHOLE='bridge' (legacy pontic) back to WHOLE='extracted'
            var ur = await window.sb.from('teeth_status').upsert({
              doctor_id: currentUser.id, patient_id: patientId,
              tooth_num: tn, surface: 'WHOLE', treatment_key: 'extracted'
            }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
            if (ur.error) { console.error('restore extracted error:', ur.error); _wErr = true; }
            teethMap[tn][sk] = 'extracted';
          } else {
            var dr = await window.sb.from('teeth_status').delete()
              .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
              .eq('tooth_num', tn).eq('surface', sk);
            if (dr.error) { console.error('delete bridge entry error:', dr.error); _wErr = true; }
            delete teethMap[tn][sk];
          }
          if (teethMap[tn] && teethMap[tn].__unit) delete teethMap[tn].__unit[sk];   // M85 mirror cleanup
        }
      }
      if (teethMap[tn] && teethMap[tn].__unit && Object.keys(teethMap[tn].__unit).length === 0) delete teethMap[tn].__unit;
    } else {
      // Undoing a plain extraction: delete the 'extracted' marker only
      for (var sk2 in sm) {
        if (isExtractionKey(sm[sk2])) {
          var dr2 = await window.sb.from('teeth_status').delete()
            .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
            .eq('tooth_num', tn).eq('surface', sk2);
          if (dr2.error) { console.error('delete extracted error:', dr2.error); _wErr = true; }
          delete teethMap[tn][sk2];
        }
      }
      // A post-extraction site treatment (SOCKET) is no longer valid once the tooth returns —
      // delete its row too so no orphan SOCKET lingers on a now-present tooth.
      if (sm.SOCKET) {
        var drSk = await window.sb.from('teeth_status').delete()
          .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
          .eq('tooth_num', tn).eq('surface', 'SOCKET');
        if (drSk.error) { console.error('delete socket entry error:', drSk.error); _wErr = true; }
        delete teethMap[tn].SOCKET;
        if (teethMap[tn].__status) delete teethMap[tn].__status.SOCKET;
      }
    }
    if (Object.keys(teethMap[tn] || {}).length === 0) delete teethMap[tn];
  }
  // M85.2: sweep any lone retainer the cleared unit left behind (see function docs).
  var _sweptOrphan = isPartOfBridge ? await sweepOrphanRetainers(unitToClear) : false;
  closeModal('toothModal');
  renderTeeth(); renderStats();
  if (_wErr) { showToast('⚠️ تمّ جزئياً — بعض الخطوات لم تُحفظ، تحقّق من الاتصال وأعد المحاولة'); return; }
  /* M145-l: مرآةُ M145-k — الزرُّ كان يُزيل الرسم ويترك جلسةَ الجسر المخطّطة بالسجل (خطةٌ وتكلفةٌ بلا رسم).
     الآن يسأل صراحةً عن جلسات الجسر **المخطّطة** على أسنان الوحدة نفسها (المنجزة لا تُعرض — حذفُها قرارٌ
     ماليٌّ لا مكانه هنا)؛ الرفضُ = السلوك السابق حرفياً. الحذفُ عبر delSession القائم (إعادة التوزيع والتدقيق). */
  var _brSess = isPartOfBridge ? bridgeSessionsForRemovedUnit(unitToClear) : [];
  var _delCount = 0, _wantDel = false, _impDrawn = false;
  if (_brSess.length) {
    var _q = 'أُزيل رسمُ الجسر. هل تريد حذف ' + (_brSess.length === 1 ? 'جلسته المخطّطة' : 'جلساته المخطّطة (' + _brSess.length + ')') + ' من السجل أيضاً؟\n\n'
      + _brSess.map(function(x){ return '   – ' + (x.type || 'جسر') + ' — ' + fmt(x.cost || 0) + ' ' + curLblOf(_rowCur(x))
          + ((typeof planOptOf === 'function' && planOptOf(x)) ? ' [خيار ' + PLAN_OPTION_LABELS[planOptOf(x)] + ']' : ''); }).join('\n')
      + (_brSess.some(function(x){ return !!x.appointment_id; }) ? '\n\n⚠️ منها ما هو مربوط بموعد — الموعد يبقى بالتقويم بلا هذا البند.' : '')
      + '\n\nإن اخترت «أبقِها» تبقى الجلسة بالسجل بلا رسمٍ على المخطط.';
    if (await SyDialog.confirm({ title: 'جلسة الجسر', message: _q, confirmText: 'احذفها', cancelText: 'أبقِها', danger: true })) {
      _wantDel = true;
      for (var _bi = 0; _bi < _brSess.length; _bi++) {
        var _before = sessions.length;
        await delSession(_brSess[_bi].id, { skipConfirm: true });
        if (sessions.length < _before) _delCount++;
      }
    }
  }
  /* v488: المنجزُ كذلك (قرار المالك بعد v482) — جلساتُ الجسر المنجزة على أسنان الوحدة نفسها، المالكُ وحده،
     بعد نافذة المخطّط. لا يمسّ M145-m (يفحص المخطّطة فقط) ولا bridgeChartResync (للمخطّط وحده). */
  var _brDoneFu = { parts: [], warn: false };
  if (isPartOfBridge) {
    var _brDone = unitSessionsFor(unitToClear, 'completed', function(k){ return !!k && isBridgeKey(k); });
    if (_brDone.length) _brDoneFu = await followUpRemovedSessions([], _brDone, '');
  }
  /* M145-m: لم يبقَ للوحدة أيُّ خطة جسر (حُذفت جلساتها أو لم تكن) وبقيت زرعةٌ بديلة مكان سنٍّ مقلوع ⇒
     الزرعةُ تأخذ المخطط — المسارُ نفسه الذي يسلكه حذفُ الجسور من جدول الجلسات (bridgeChartResync). */
  if (isPartOfBridge && !_wErr && !bridgeSessionsForRemovedUnit(unitToClear).length && typeof altImplantsForUnit === 'function') {
    var _imps = altImplantsForUnit(unitToClear);
    if (_imps.length) { try { _impDrawn = await _altChartToImplants({ unitId: null }, _imps); } catch (e) { console.warn('undoExtraction: implant follow-up:', e); } }
  }
  showToast(isPartOfBridge
    ? (((_wantDel && _delCount < _brSess.length) || _brDoneFu.warn ? '⚠️ ' : '✅ ') + 'تمت إزالة الجسر' + (_sweptOrphan ? ' (مع دعامة معلّقة)' : '')
        + (_delCount ? ' وحذف ' + (_delCount === 1 ? 'جلسته المخطّطة' : _delCount + ' من جلساته المخطّطة') : '')
        + (_wantDel && _delCount < _brSess.length ? (_delCount ? ' — وتعذّر حذف الباقي' : ' — لكن تعذّر حذف الجلسة') : '')
        + (_impDrawn ? ' · الزرعةُ البديلة رُسمت مكانه' : '')
        + (_brDoneFu.parts.length ? ' — ' + _brDoneFu.parts.join(' · ') : ''))
    : removalToast('✅', 'تمت إعادة السن ' + num, await followUpRemovedSessions(_uxPl, _uxDone, 'أُعيد السن ' + num + '. هل تريد حذف '
        + (_uxPl.length === 1 ? 'العلاج المخطّط' : 'العلاجات المخطّطة (' + _uxPl.length + ')') + ' من السجل أيضاً؟')));
}
/* جلساتُ الجسر المخطّطة على أسنان وحدةٍ أُزيل رسمُها (مطابقةُ المجموعة لا الترتيب). */
function bridgeSessionsForRemovedUnit(unit) {
  if (!unit || unit.length < 2) return [];
  return (sessions || []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'planned') return false;
    if (String(x.tooth_num || '').indexOf(',') === -1 || !_sameToothSet(x.tooth_num, unit)) return false;
    return isBridgeKey(sessionTreatmentKey(x));
  });
}

/* Remove an implant: delete only the implant entry; tooth becomes extracted again (since implants are typically placed in missing tooth slots) */
var removeImplant = ppGuarded('removeImplant', _removeImplant_inner, '⏳');   /* v284: قفل + انشغال */
async function _removeImplant_inner(num) {
  var _wErr = false;   /* v285: كانت تُظهر توست نجاح حتى مع فشل كتابة (console فقط) */
  // Phase 4.1: defense-in-depth — block destructive ops if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تعديل حالة الأسنان');
    return;
  }
  /* v488: تُمسح كلُّ صفوف السن ثم يُرسم «مقلوع» ⇒ جلساتُ ما أُزيل (عدا القلع الذي يبقى مرسوماً) تُعرض بالسؤالين.
     تُلتقط قبل الحذف. */
  var _imSm = teethMap[String(num)] || {};
  var _imSurf = Object.keys(_imSm).filter(function(k){ return k.charAt(0) !== '_' && _imSm[k]; });
  var _imPl = plannedToothSessions(num, _imSurf, isExtractionKey);
  var _imDone = completedToothSessionsForRows(num, removedRowsOf(_imSm, _imSurf).filter(function(r){ return !isExtractionKey(r.key); }));
  var choice = await SyDialog.confirm({ message: 'إزالة الزراعة من السن ' + num + '؟\n\nاضغط موافق لإزالة الزراعة (السن سيعود مقلوعاً)\nاضغط إلغاء للخروج بدون تغيير'
    + removalSessionsNote(_imPl.length, _imDone.length), danger: true });
  if (!choice) return;
  var tn = String(num);
  // First: wipe ALL surfaces (clears any legacy implant entries on R1/R2/etc.)
  var dAll = await window.sb.from('teeth_status').delete()
    .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
    .eq('tooth_num', tn);
  if (dAll.error) { console.error('clear surfaces error:', dAll.error); _wErr = true; }
  delete teethMap[tn];
  // Then: replace with extracted at WHOLE — typically an implant replaces a missing tooth
  var rU = await window.sb.from('teeth_status').upsert({
    doctor_id: currentUser.id, patient_id: patientId,
    tooth_num: tn, surface: 'WHOLE', treatment_key: 'extracted'
  }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
  if (rU.error) { console.error('restore extracted after implant removal error:', rU.error); _wErr = true; }
  teethMap[tn] = { WHOLE: 'extracted' };
  closeModal('toothModal');
  renderTeeth(); renderStats();
  if (_wErr) { showToast('⚠️ تمّ جزئياً — بعض الخطوات لم تُحفظ، تحقّق من الاتصال وأعد المحاولة'); return; }
  var _fu = await followUpRemovedSessions(_imPl, _imDone, 'أُزيلت الزراعة. هل تريد حذف '
    + (_imPl.length === 1 ? 'جلستها المخطّطة' : 'جلساتها المخطّطة (' + _imPl.length + ')') + ' من السجل أيضاً؟');
  showToast(removalToast('✅', 'تمت إزالة الزراعة — السن ' + num + ' مقلوع', _fu));
}

/* ─── D2 ─── */

// ============================================================
// Phase 3 Feature G — Regional Treatment Area Helpers
// ============================================================
// FDI numbering scheme: tens digit is the quadrant (1=UR, 2=UL, 3=LL, 4=LR for permanent;
// 5=UR, 6=UL, 7=LL, 8=LR for primary teeth). Units digit (1-8) is the tooth number.
// Examples: 11-18 = UR, 21-28 = UL, 31-38 = LL, 41-48 = LR.
function quadrantForTooth(toothNum) {
  if (!toothNum) return null;
  var n = parseInt(toothNum, 10);
  if (isNaN(n)) return null;
  var quadrantDigit = Math.floor(n / 10);
  switch (quadrantDigit) {
    case 1: case 5: return 'UR';  // upper right (incl. primary)
    case 2: case 6: return 'UL';  // upper left
    case 3: case 7: return 'LL';  // lower left
    case 4: case 8: return 'LR';  // lower right
    default: return null;
  }
}
function archForTooth(toothNum) {
  var q = quadrantForTooth(toothNum);
  if (!q) return null;
  return (q === 'UR' || q === 'UL') ? 'U' : 'L';
}

// Display labels for regional areas (Arabic) — single source of truth.
var QUADRANT_LABELS = {
  'UR': 'الربع العلوي الأيمن',
  'UL': 'الربع العلوي الأيسر',
  'LL': 'الربع السفلي الأيسر',
  'LR': 'الربع السفلي الأيمن'
};
var ARCH_LABELS = {
  'U': 'الفك العلوي',
  'L': 'الفك السفلي'
};

// Pending state for regional treatment (parallel to currentSurface for tooth-based flow).
var pendingRegionalType = null;     // 'quadrant' / 'arch' / 'mouth'
var pendingRegionalQuadrant = null; // 'UR' / 'UL' / 'LR' / 'LL' — first of the selection (title/compat)
var pendingRegionalQuadrants = [];  // M85.2 multi-quadrant: full selection; save loops it (one session per quadrant)
var pendingRegionalArch = null;     // 'U' / 'L' — first of the selection (title/compat)
var pendingRegionalArches = [];     // M85.2 multi-arch: full selection; save loops it (one session per arch)

// Open the regional area picker modal. For 'mouth' there's nothing to choose, so we
// skip straight to the cost/notes step. For 'quadrant'/'arch' we show a dropdown
// pre-selected to the auto-detected value (if the user clicked a tooth first).
function openRegionalAreaPicker(status, label, treatPart, autoQuadrant, autoArch) {
  pendingRegionalType = treatPart;
  pendingRegionalQuadrant = null;
  pendingRegionalQuadrants = [];
  pendingRegionalArch = null;
  pendingRegionalArches = [];   // M85.2

  // 'mouth' → no picker needed, jump straight to Step 2 with WHOLE-mouth marker
  if (treatPart === 'mouth') {
    closeModal('toothModal');  // close treatment-list modal if it was open
    proceedToRegionalStep2(status, label);
    return;
  }

  // Populate dropdown based on type
  var sel = document.getElementById('regionalAreaSelect');
  var chipsEl = document.getElementById('regionalQuadChips');
  var titleEl = document.getElementById('regionalAreaTitle');
  var hintEl = document.getElementById('regionalAreaHint');
  if (!sel) return;
  sel.innerHTML = '';
  if (treatPart === 'quadrant') {
    // M85.2: multi-quadrant chips (OpenDental parity — one click charts all
    // selected quadrants). The single-value select is hidden; save creates one
    // session PER selected quadrant at the entered price.
    titleEl.textContent = 'اختر الأرباع — ' + label;
    hintEl.textContent = (autoQuadrant
      ? 'تم اقتراح الربع تلقائياً من السن الذي اخترته. '
      : '') + 'يمكن اختيار أكثر من ربع — تُسجَّل جلسة لكل ربع بالسعر المدخل.';
    pendingRegionalQuadrants = autoQuadrant ? [autoQuadrant] : [];
    sel.style.display = 'none';
    if (chipsEl) { chipsEl.style.display = 'flex'; renderRegQuadChips(); }
  } else if (treatPart === 'arch') {
    // M85.2: multi-arch chips — same pattern as quadrant (e.g. whitening both
    // jaws = one save, one session per arch at the entered price).
    titleEl.textContent = 'اختر الفك — ' + label;
    hintEl.textContent = (autoArch
      ? 'تم اقتراح الفك تلقائياً من السن الذي اخترته. '
      : '') + 'يمكن اختيار الفكين معاً — تُسجَّل جلسة لكل فك بالسعر المدخل.';
    pendingRegionalArches = autoArch ? [autoArch] : [];
    sel.style.display = 'none';
    if (chipsEl) { chipsEl.style.display = 'flex'; renderRegArchChips(); }
  }

  // Close the treatment-list modal so it doesn't sit behind the area picker
  closeModal('toothModal');
  document.getElementById('regionalAreaModal').classList.add('open');
}

/* M85.2: multi-quadrant chips — toggle buttons for UR/UL/LL/LR + «الكل». All
   values are internal constants (no user data → no escaping surface). */
function renderRegQuadChips(){
  var el = document.getElementById('regionalQuadChips'); if (!el) return;
  var html = '';
  ['UR','UL','LL','LR'].forEach(function(q){
    var on = pendingRegionalQuadrants.indexOf(q) !== -1;
    var st = on
      ? 'border:1.5px solid var(--green);color:var(--on-accent,#fff);background:var(--green);font-weight:700;'
      : 'border:1.5px solid var(--border2);color:var(--text2);background:var(--bg2);';
    html += '<button type="button" onclick="regQuadToggle(\'' + q + '\')" style="padding:8px 12px;border-radius:var(--r-md,10px);font-size:13.5px;font-family:inherit;cursor:pointer;' + st + '">'
          + QUADRANT_LABELS[q] + '</button>';
  });
  var all = pendingRegionalQuadrants.length === 4;
  html += '<button type="button" onclick="regQuadAll()" style="padding:8px 12px;border-radius:var(--r-md,10px);font-size:13.5px;font-family:inherit;cursor:pointer;border:1.5px dashed var(--border2);color:var(--text2);background:transparent;">'
        + (all ? 'إلغاء الكل' : 'الفم كامل (4 أرباع)') + '</button>';
  el.innerHTML = html;
}
function regQuadToggle(q){
  var i = pendingRegionalQuadrants.indexOf(q);
  if (i === -1) pendingRegionalQuadrants.push(q); else pendingRegionalQuadrants.splice(i, 1);
  renderRegQuadChips();
}
function regQuadAll(){
  pendingRegionalQuadrants = (pendingRegionalQuadrants.length === 4) ? [] : ['UR','UL','LL','LR'];
  renderRegQuadChips();
}
/* M85.2: multi-arch chips — U/L toggles + «الفكان معاً». Internal constants only. */
function renderRegArchChips(){
  var el = document.getElementById('regionalQuadChips'); if (!el) return;
  var html = '';
  ['U','L'].forEach(function(a){
    var on = pendingRegionalArches.indexOf(a) !== -1;
    var st = on
      ? 'border:1.5px solid var(--green);color:var(--on-accent,#fff);background:var(--green);font-weight:700;'
      : 'border:1.5px solid var(--border2);color:var(--text2);background:var(--bg2);';
    html += '<button type="button" onclick="regArchToggle(\'' + a + '\')" style="padding:8px 12px;border-radius:var(--r-md,10px);font-size:13.5px;font-family:inherit;cursor:pointer;' + st + '">'
          + ARCH_LABELS[a] + '</button>';
  });
  var both = pendingRegionalArches.length === 2;
  html += '<button type="button" onclick="regArchAll()" style="padding:8px 12px;border-radius:var(--r-md,10px);font-size:13.5px;font-family:inherit;cursor:pointer;border:1.5px dashed var(--border2);color:var(--text2);background:transparent;">'
        + (both ? 'إلغاء الكل' : 'الفكان معاً') + '</button>';
  el.innerHTML = html;
}
function regArchToggle(a){
  var i = pendingRegionalArches.indexOf(a);
  if (i === -1) pendingRegionalArches.push(a); else pendingRegionalArches.splice(i, 1);
  renderRegArchChips();
}
function regArchAll(){
  pendingRegionalArches = (pendingRegionalArches.length === 2) ? [] : ['U','L'];
  renderRegArchChips();
}

// User confirmed the area selection — proceed to Step 2 with the selected value.

/* ═══════════════ Orthodontics session fields (start date + duration months) ═══════════════ */
function syncOrthoField(){
  var box = document.getElementById('toothOrthoBox'); if (!box) return;
  var tr = (typeof getTreatment === 'function') ? getTreatment(pendingToothStatus) : null;
  var isOrtho = !!(tr && (tr.category || '') === 'orthodontics');
  box.style.display = isOrtho ? 'block' : 'none';
  if (!isOrtho) { var mi = document.getElementById('toothOrthoMonths'); if (mi) mi.value = ''; }
}
/* ── M85: bridge unit chips (long-span / secondary retainers) ──────────────
   Shown in step 2 ONLY for a bridge-type treatment (built-in 'bridge' OR any
   custom treatment with target_part='bridge' — same predicate as
   persistSpecialTreatment, so custom bridges from the treatments list get the
   identical interaction) picked from an EXTRACTED tooth. Displays the derived
   unit and lets the doctor extend it with up to BRIDGE_EXTRA_CAP extra
   retainers per side. State lives in pendingBridgeExtra; the save path
   re-resolves through the same resolveBridgeUnit(), so chips and persistence
   can never diverge. Hidden (and thus inert) in every other flow. */
function renderBridgeUnitChips(){
  var row = document.getElementById('bridgeUnitRow'); if (!row) return;
  var tr = (typeof getTreatment === 'function') ? getTreatment(pendingToothStatus) : null;
  var isBridgeCtx = !!((tr && tr.target_part === 'bridge') || pendingToothStatus === 'bridge');
  if (!isBridgeCtx || currentTooth == null || !isExtracted(currentTooth)) {
    row.style.display = 'none'; row.innerHTML = ''; return;
  }
  var res = resolveBridgeUnit(currentTooth);
  if (!res) {
    // M85.1: if the base derivation was blocked by an ADJACENT IMPLANT, tell the
    // doctor here (before save) instead of hiding silently — the save guard
    // repeats the same message as defense in depth.
    var _ab = findBridgeAbutments(currentTooth);
    if (_ab && _ab.implantBlock && ((!_ab.mesial && _ab.implantBlock.mesial) || (!_ab.distal && _ab.implantBlock.distal))) {
      row.innerHTML = '<div style="font-size:12.5px;color:var(--yellow);border:1.5px solid var(--yellow);border-radius:var(--r-md,10px);padding:7px 10px;background:rgba(var(--yellow-rgb),.08);">الجسر التقليدي لا يعبر الزرعة الملاصقة للفجوة — هذا الموقع يُخطَّط له بحل زرعي</div>';
      row.style.display = 'block';
      return;
    }
    row.style.display = 'none'; row.innerHTML = ''; return;   // no base abutments → save guard messages
  }
  var extraSet = {};
  res.mesialExtra.concat(res.distalExtra).forEach(function(t){ extraSet[t] = true; });
  var chips = '';
  for (var i = 0; i < res.unit.length; i++) {
    var t = res.unit[i], isPon = isExtracted(t);
    var st = isPon
      ? 'border:1.5px dashed var(--border2);color:var(--text3);'
      : (extraSet[t]
          ? 'border:1.5px solid var(--yellow-bd);color:var(--yellow-ink);font-weight:700;background:var(--yellow-bg);'
          : 'border:1.5px solid var(--green);color:var(--green);font-weight:700;');
    chips += '<span style="display:inline-block;padding:3px 9px;border-radius:var(--r-full,999px);font-size:12.5px;' + st + '">' + t + '</span>';
  }
  function extBtn(side, can){
    var nextT = null;
    var arch = (UPPER_T.indexOf(currentTooth) >= 0) ? UPPER_T : LOWER_T;
    var first = res.unit[0], last = res.unit[res.unit.length - 1];
    // The tooth this button would add: one step outward from the matching end.
    var abuts = findBridgeAbutments(currentTooth);
    var loIsMesial = arch.indexOf(abuts.mesial) < arch.indexOf(abuts.distal);
    var atStart = (side === 'mesial') === loIsMesial;
    var endIdx = arch.indexOf(atStart ? first : last) + (atStart ? -1 : 1);
    if (endIdx >= 0 && endIdx < arch.length) nextT = arch[endIdx];
    var minus = pendingBridgeExtra[side] > 0
      ? '<button type="button" class="topt" style="padding:2px 8px;font-size:12px;" onclick="bridgeExtraAdj(\'' + side + '\',-1)">−</button>' : '';
    var plus = can
      ? '<button type="button" class="topt" style="padding:2px 8px;font-size:12px;border-color:var(--yellow-bd);color:var(--yellow-ink);" onclick="bridgeExtraAdj(\'' + side + '\',1)">+ دعامة ' + (nextT || '') + '</button>' : '';
    return '<span style="display:inline-flex;gap:4px;">' + minus + plus + '</span>';
  }
  row.innerHTML =
    '<div style="font-size:12px;color:var(--text3);margin-bottom:5px;">وحدة الجسر (الدعامات بالأخضر — دعامة إضافية بالكهرماني):</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">' +
      extBtn('mesial', res.canExtendMesial) + chips + extBtn('distal', res.canExtendDistal) +
    '</div>';
  row.style.display = 'block';
}
function bridgeExtraAdj(side, delta){
  var v = (pendingBridgeExtra[side] || 0) + delta;
  pendingBridgeExtra[side] = Math.max(0, Math.min(BRIDGE_EXTRA_CAP, v));
  renderBridgeUnitChips();
}
/* Expected-duration (months) of the active ortho session for an arch — shown in the banner. */
function orthoMonthsForArch(isUpper){
  if (typeof sessions === 'undefined' || !sessions || !sessions.length) return null;
  var names = orthoTreatmentNames(), side = isUpper ? 'U' : 'L';
  for (var i=0;i<sessions.length;i++){
    var s = sessions[i];
    if (s.tooth_num) continue;
    if (s.status && s.status !== 'completed' && s.status !== 'planned') continue;
    if (!names[s.type]) continue;
    var covers = (!s.quadrant && !s.arch) ? true : s.arch ? (s.arch===side) : s.quadrant ? (String(s.quadrant).charAt(0)===side) : false;
    if (covers) return s.ortho_months || null;
  }
  return null;
}
function confirmRegionalAreaPick() {
  if (pendingRegionalType === 'quadrant') {
    // M85.2: chips selection (multi). At least one quadrant required.
    if (!pendingRegionalQuadrants.length) { showToast('⚠️ اختر ربعاً واحداً على الأقل'); return; }
    pendingRegionalQuadrant = pendingRegionalQuadrants[0];   // title/compat
  } else if (pendingRegionalType === 'arch') {
    // M85.2: arch chips (multi). At least one arch required.
    if (!pendingRegionalArches.length) { showToast('⚠️ اختر فكاً واحداً على الأقل'); return; }
    pendingRegionalArch = pendingRegionalArches[0];   // title/compat
  }
  closeModal('regionalAreaModal');
  proceedToRegionalStep2(pendingToothStatus, pendingToothLabel);
}

// Open the cost/notes step for a regional treatment. Reuses the toothModal Step 2
// structure but with currentTooth/currentSurface unset, and an area label that
// describes the region instead of a specific surface.
function proceedToRegionalStep2(status, label) {
  // Reset tooth-specific state — this is a regional treatment, no tooth
  currentTooth = null;
  currentSurface = null;
  currentSurfaces = [];
  currentRootParts = [];
  var _prw = document.getElementById('toothSurfaceChips'); if (_prw) _prw.style.display = 'none';

  // Show the toothModal in Step 2 mode (skip Step 1 treatment list)
  document.getElementById('toothStep1').style.display = 'none';
  document.getElementById('toothStep2').style.display = 'block';
  document.getElementById('toothFoot').style.display  = 'flex';
  syncOrthoField();   // ortho regional treatments → reveal the duration field
  renderBridgeUnitChips();   // M85: regional flow is never a bridge → self-hides (clears stale row)

  // Title reflects the regional scope
  var areaText;
  if (pendingRegionalType === 'mouth') areaText = 'الفم كامل';
  else if (pendingRegionalType === 'quadrant') {
    // M85.2: list every selected quadrant; multi-selection notes per-quadrant pricing.
    var _qList = (pendingRegionalQuadrants.length ? pendingRegionalQuadrants : [pendingRegionalQuadrant])
      .map(function(q){ return QUADRANT_LABELS[q] || q; }).join(' · ');
    areaText = _qList + (pendingRegionalQuadrants.length > 1 ? ' — جلسة لكل ربع بالسعر المدخل' : '');
  }
  else if (pendingRegionalType === 'arch') {
    // M85.2: list every selected arch; both-jaws selection notes per-arch pricing.
    var _aList = (pendingRegionalArches.length ? pendingRegionalArches : [pendingRegionalArch])
      .map(function(a){ return ARCH_LABELS[a] || a; }).join(' · ');
    areaText = _aList + (pendingRegionalArches.length > 1 ? ' — جلسة لكل فك بالسعر المدخل' : '');
  }
  else areaText = '';
  document.getElementById('toothStep2Title').textContent = '🦷 ' + label + ' — ' + areaText;
  document.getElementById('toothModalTitle').textContent = label;

  // Reset notes, date, status picker (same as the tooth flow)
  document.getElementById('toothNotes').value = '';
  document.getElementById('toothDate').value  = toDay();
  pendingTreatStatus = 'completed';
  document.querySelectorAll('#toothStatusPicker .status-opt').forEach(function(b){
    if (b.getAttribute('data-status') === 'completed') b.classList.add('selected');
    else b.classList.remove('selected');
  });
  // Defensive cost field reset (mirrors Feature F's modal init logic)
  var costEl = document.getElementById('toothCost');
  if (costEl) {
    costEl.readOnly = false;
    costEl.style.opacity = '';
    costEl.style.cursor = '';
    costEl.title = '';
  }
  // Phase 3 Feature G: hide the tooth-anchored "🥽 حفظ + إرسال لمخبر" button for
  // regional sessions — saveToothAndOpenLab() writes teeth_status via
  // currentTooth/currentSurface, both null here.
  var labBtn = document.getElementById('toothLabBtn');
  if (labBtn) labBtn.style.display = 'none';
  // M79: regional lab flow — its OWN button routes through saveRegionalAndOpenLab()
  // (session-anchored, no teeth_status write). Shown for orthodontics (fixed ortho
  // defaults needs_lab:false yet still lab-relevant) or any regional treatment
  // flagged needs_lab (e.g. arch denture).
  var regLabBtn = document.getElementById('regionalLabBtn');
  if (regLabBtn) {
    var _regTr = getTreatment(status);
    var _regShowLab = !!(_regTr && ((_regTr.category || '') === 'orthodontics' || _regTr.needs_lab === true)) && labsPlanOk();
    regLabBtn.style.display = _regShowLab ? 'inline-block' : 'none';
  }
  // M86-lab: the batch lab button belongs to the batch flow only — always hidden here
  var _blbHideR = document.getElementById('batchLabBtn');
  if (_blbHideR) _blbHideR.style.display = 'none';
  populateProviderPicker();
  var tr = getTreatment(status);
  var basePrice = tr ? Number(tr.price || 0) : 0;
  document.getElementById('toothCost').value = basePrice;
  toothUnitsSetup(tr, basePrice);   /* v425 (M150) */

  // Reuse the toothModal to show Step 2 (since it has all the cost/notes/status UI)
  document.getElementById('toothModal').classList.add('open');
}

/* ── v266: مدخل «جلسة جديدة» (chart-first) ────────────────────────────
   المودالُ الموازي (sessionModal) كان يحفظ بلا سن/سطح/treatment_key/teeth_status
   وبلا زرّ مخبر — فبقي للجلسات الحرّة فقط. هنا صفر منطق حفظ: نسأل «أين؟» ثم
   نسلّم للمسار القائم حرفياً (openToothModal يتكفّل بحالة السن: مقلوع ⇒ جسر/زرع،
   مزروع ⇒ إزالة، سليم ⇒ كل العلاجات؛ والسطحُ الافتراضي centerSurface). */
function openNewSessionEntry() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  if (window.__historyMode) { showToast('🕰️ عرض تاريخي للقراءة فقط — أنهِ العرض للتعديل'); return; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }
  if (window.__batchMode) { showToast('☑️ أنهِ وضع التحديد المتعدد أولاً'); return; }
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل جلسات جديدة');
    return;
  }
  nseRender();
  openModal('newSessionEntryModal');
}
/* أول علاجٍ مخطَّطٍ على السن (من teethMap) — لتلوين الزر بلونه كالمخطط.
   القلعُ والزرعُ لهما وسمُهما الخاص فيُستثنيان هنا. */
function nseToothTx(n) {
  var sm = teethMap[String(n)] || {};
  for (var k in sm) {
    if (k === '__status' || !sm[k]) continue;
    if (isExtractionKey(sm[k]) || isImplantKey(sm[k])) continue;
    var t = getTreatment(sm[k]);
    if (t) return t;
  }
  return null;
}
function nseRender() {
  var grid = document.getElementById('nseGrid');
  if (!grid) return;
  var rows = [activeUpper(), activeLower()];
  var html = '';
  for (var r = 0; r < rows.length; r++) {
    var arch = rows[r];
    html += '<div class="nse-row' + (arch.length <= 10 ? ' nse-primary' : '') + '">';
    for (var i = 0; i < arch.length; i++) {
      /* الخطُّ الناصف بين الربعين (11|21 · 41|31) — عمودٌ خاص بالشبكة */
      if (i === arch.length / 2) html += '<span class="nse-mid"></span>';
      var n = arch[i];
      var cls = 'nse-t', ttl = '', sty = '';
      if (isImplant(n)) { cls += ' nse-i'; ttl = 'مزروع'; }
      else if (isExtracted(n)) { cls += ' nse-x'; ttl = 'مقلوع — جسر / زرع / موقع القلع'; }
      else {
        var tx = nseToothTx(n);
        if (tx) {
          /* لونُ العلاج من الكتالوج (hex أو var(--*) حصراً — قاعدة #195) */
          var c = /^#[0-9a-fA-F]{3,8}$|^var\(--[a-z0-9-]+\)$/.test(String(tx.fill || '')) ? tx.fill : 'var(--green)';
          var planned = getDominantStatus(n) === 'planned';
          cls += planned ? ' nse-p' : ' nse-tx';
          sty = ' style="border-color:' + c + ';box-shadow:inset 0 -3px 0 ' + c + ';"';
          ttl = (planned ? 'مخطّط: ' : 'عليه علاج: ') + escapeHtml(tx.name || '');
        }
      }
      html += '<button type="button" class="' + cls + '" title="' + ttl + '"' + sty + ' onclick="nsePick(' + n + ')">' + n + '</button>';
    }
    html += '</div>';
  }
  grid.innerHTML = html;   /* أرقامٌ من الثوابت + اسمُ علاجٍ مهرَّب — لا نصّ مستخدم حرّ */
}
function nsePick(n) {
  closeModal('newSessionEntryModal');
  /* v333: مدخلُ «جلسة جديدة» = السن ← العلاج ← المنطقة (نمط Open Dental/Dentrix:
     الإجراءُ أولاً ثم منطقتُه). لا منطقةَ منقورة هنا، فالقائمةُ تعرض علاجاتِ التاج
     والجذر معاً والشرائحُ تظهر بالخطوة الثانية بحسب نوع العلاج. */
  _toothEntryNext = true;
  openToothModal(n);
}
function nseRegional() {
  closeModal('newSessionEntryModal');
  openRegionalTreatmentPicker();
}
function nseFree() {
  closeModal('newSessionEntryModal');
  openSessionModal();
}

// Entry point: user clicks the "+ علاج جماعي" button. Opens Step 1 of toothModal
// filtered to show only regional treatments (target_part in quadrant/arch/mouth).
function openRegionalTreatmentPicker() {
  if (window.__draftMode) { showToast('✏️ أغلق المسودة أولاً'); return; }
  if (window.__examMode) { showToast('🩺 أنهِ وضع الفحص الأولي أولاً'); return; }
  if (window.__batchMode) { showToast('☑️ العلاج الجماعي (ربع/فك/فم) له مساره — أنهِ وضع التحديد المتعدد أولاً'); return; }
  // Reset tooth context — user picked "regional" mode, no specific tooth in mind
  currentTooth = null;
  currentSurface = null;
  // Reuse openToothModal's behavior, then flag it as regional-only via a global
  window.__regionalPickerMode = true;
  // Trigger the same modal open path as normal flow
  openToothModal(null, null);  // tooth=null signals "regional mode"
}

function pickToothTreatment(status, label) {
  pendingToothStatus = status;
  pendingToothLabel  = label;
  if (typeof bumpTxUsage === 'function') bumpTxUsage(status);   // usage ranking for the ⭐شائعة tab
  // Smart routing: pick the right surface based on the treatment's target_part,
  // not where the user clicked. This way the list can stay unified.
  var tr = getTreatment(status);
  var tp = tr ? (tr.target_part || 'crown') : 'crown';
  // ── حافظ مسافة: gap-unit flow (NOT regional) — gated on M61 ──
  var spacerFlow = window.__m61 === true && isSpacerTreatment(tr);
  if (spacerFlow) {
    window.__regionalPickerMode = false;
    if (!currentTooth) { showToast('🧷 انقر السن المفقود على المخطط لتطبيق حافظ المسافة'); closeModal('toothModal'); return; }
    if (!isExtracted(currentTooth)) { showToast('🧷 حافظ المسافة يُطبَّق بالنقر على السن المفقود (المقلوع)'); return; }
  }
  // ── Post-extraction site treatment (ضماد/طعم…): session on the socket only ──
  var socketCtx = !spacerFlow && window.__m61 === true && currentTooth && isExtracted(currentTooth)
                && tr && tr.post_extraction === true && tp !== 'bridge' && tp !== 'implant';
  // Phase 3 Feature G: regional treatments (quadrant/arch/mouth) don't use a specific
  // tooth/surface — they route to a dedicated area picker instead.
  if (!spacerFlow && (tp === 'quadrant' || tp === 'arch' || tp === 'mouth')) {
    // currentTooth may be set (user clicked a tooth then picked a regional treatment)
    // OR null (user opened from "+ علاج جماعي" button). Both paths converge here.
    // Auto-detect the quadrant/arch from the clicked tooth (FDI numbering) if available.
    var autoQuadrant = null, autoArch = null;
    if (currentTooth) {
      autoQuadrant = quadrantForTooth(currentTooth);
      autoArch = archForTooth(currentTooth);
    }
    // Done with the regional-picker entry flag — area picker is the next step
    window.__regionalPickerMode = false;
    openRegionalAreaPicker(status, label, tp, autoQuadrant, autoArch);
    return;
  }
  // Defensive: if user entered via "regional mode" but the treatment list is empty
  // for regional and they somehow picked a tooth-based treatment, fall back gracefully
  // (this branch shouldn't be reachable from the UI because openToothModal filters
  // the list to regional-only when __regionalPickerMode is true).
  if (window.__regionalPickerMode === true) {
    window.__regionalPickerMode = false;
    showToast('⚠️ هذا العلاج يحتاج اختيار سن — استخدم المخطط مباشرة');
    closeModal('toothModal');
    return;
  }
  // Phase 3 Feature G — defensive: clear any stale regional state from a previous
  // workflow that the user abandoned. Without this, a closed-then-reopened modal
  // could carry pendingRegionalType='quadrant' into a tooth-based save and the
  // saveToothTreatment's regional branch would incorrectly fire.
  pendingRegionalType = null;
  pendingRegionalQuadrant = null;
  pendingRegionalQuadrants = [];   // M85.2
  pendingRegionalArch = null;
  pendingRegionalArches = [];   // M85.2
  // Special treatments override:
  /* v430 (M152): حالةُ السن كاملاً تُرسى على سطحٍ محجوز — لا تزاحم WHOLE ولا CROWN_FULL.
     v434: والحالاتُ السطحية/التاجية-الجذرية تبقى **على ما نقره الطبيب حرفاً بحرف**
     (قلحٌ على اللثوي يُسجَّل لثوياً، وكسرٌ على الجذر يُسجَّل على ذلك الجذر)؛ ونقرةُ
     «السن كاملاً» أو «التاج كامل» تُحوَّل إلى COND فلا يُدهس قلعٌ أو زرعٌ أو تاج. */
  if (isConditionKey(status)) {
    if (tr && tr.cond_scope === 'tooth') currentSurface = COND_SURFACE;
    else if (currentSurface === 'WHOLE' || currentSurface === 'CROWN_FULL' || !currentSurface) currentSurface = COND_SURFACE;
  } else if (spacerFlow || socketCtx) {
    currentSurface = 'WHOLE';            // unit/site flows anchor at WHOLE
  } else if (tp === 'implant' || tp === 'bridge') {
    currentSurface = 'WHOLE';
  } else if (tp === 'extraction') {
    currentSurface = 'WHOLE';
  } else if (tp === 'root') {
    // Root treatment: keep the root(s) already selected (single OR composite from
    // the root chips); default to R1 only when a non-root area was clicked
    if (!isRootCode(currentSurface)) currentSurface = 'R1';
  } else if (tp === 'crown_full') {
    currentSurface = 'CROWN_FULL';
  } else if (tp === 'whole' || tp === 'bridge') {
    currentSurface = 'WHOLE';
  } else if (tp === 'crown') {
    // Crown surface treatment: keep the clicked surface, or default to O (occlusal)
    if (isRootCode(currentSurface) || currentSurface === 'WHOLE' || currentSurface === 'CROWN_FULL') {
      currentSurface = 'O';
    }
  }
  // v333: مدخلُ الجلسة الجديدة — المنطقةُ تُبنى من نوع العلاج وتُعرض شرائحُها بالخطوة الثانية
  if (toothEntryMode && !spacerFlow && !socketCtx && currentTooth) {
    toothChipsPlace(true);
    toothEntryArea(tp);
  }
  document.getElementById('toothStep1').style.display = 'none';
  document.getElementById('toothStep2').style.display = 'block';
  document.getElementById('toothFoot').style.display  = 'flex';
  syncOrthoField();   // tooth treatments aren't ortho → keep the field hidden (resets stale state)
  renderBridgeUnitChips();   // M85: unit chips for bridge-type treatments; hides itself otherwise
  // Build a label that reflects the area type (surface / root / whole)
  var areaLabel;
  if (spacerFlow) areaLabel = 'حافظ مسافة — الفجوة + الجارَين';
  else if (socketCtx) areaLabel = 'موقع القلع';
  else if (tr && tr.target_part === 'bridge') areaLabel = 'جسر — الوحدة موضّحة أدناه';
  else if (currentSurface === COND_SURFACE) areaLabel = 'حالة سريرية — السن كاملاً';   /* v430 */
  else if (currentSurface === 'WHOLE') areaLabel = 'السن كاملاً';
  else if (currentSurface === 'CROWN_FULL') areaLabel = 'التاج كامل';
  else if (isRootCode(currentSurface)) areaLabel = rootAreaLabelFor(currentSurface, currentTooth);
  else areaLabel = 'السطح ' + surfLabelFor(currentSurface, currentTooth);
  document.getElementById('toothStep2Title').textContent = '🦷 ' + label + ' — السن ' + currentTooth + ' (' + areaLabel + ')';
  var t = getTreatment(status);
  document.getElementById('toothNotes').value = '';
  document.getElementById('toothDate').value  = toDay();
  // Default status = completed; reset visual selection then call pickStatus to pre-fill note
  pendingTreatStatus = 'completed';
  document.querySelectorAll('#toothStatusPicker .status-opt').forEach(function(b){
    if (b.getAttribute('data-status') === 'completed') b.classList.add('selected');
    else b.classList.remove('selected');
  });
  // Phase 3 Feature F: defensively reset cost field's readonly state in case the
  // previous modal session set it to readonly (e.g. user picked 'مراقبة' last time).
  // A: also hide the review-date box + reset its default (status resets to 'completed').
  var _crbR = document.getElementById('condReviewBox');
  if (_crbR) _crbR.style.display = 'none';
  pendingReviewMonths = 3;
  var costEl2 = document.getElementById('toothCost');
  if (costEl2) {
    costEl2.readOnly = false;
    costEl2.style.opacity = '';
    costEl2.style.cursor = '';
    costEl2.title = '';
  }
  // Populate provider picker if there are multiple clinic doctors
  populateProviderPicker();
  // Set price based on selected provider (uses override if available)
  document.getElementById('toothCost').value = t ? getPriceForDoctor(t, pendingProviderId) : '';
  toothUnitsSetup(t, t ? getPriceForDoctor(t, pendingProviderId) : 0);   /* v425 (M150) */
  /* M125: المبدّل يتبع عملة العلاج المختار */
  try { if (t && t.currency) window.SyDentCurPick.set('toothCost', (t.currency === 'USD') ? 'USD' : 'SYP'); } catch (e) {}
  // M125: عملة السعر تأتي من العلاج نفسه — تُضبط ولا تُقفَل. القفل كان يسلب
  // الطبيب حقاً مشروعاً (محاسبة هذا المريض بالدولار على علاجٍ مسعَّر بالليرة)،
  // وبمودال السن يوجد علاجٌ مختار دائماً فكان المبدّل يُولَد مقفولاً ولا يُفتح.
  // الأمان يبقى قائماً بمكان آخر: التبديل اليدوي يُفرّغ الحقل (انظر mount أدناه)
  // فلا يُحفَظ رقم كتالوجٍ بعملةٍ أخرى تحت وسمٍ كاذب.
  try {
    if (t) window.SyDentCurPick.set('toothCost', (t.currency === 'USD') ? 'USD' : 'SYP');
  } catch (e) {}
  // Pre-fill notes for completed (uses completion_note if available, else default_note)
  if (t) {
    var defaultNote = (t.completion_note || t.default_note || '').trim();
    if (defaultNote) document.getElementById('toothNotes').value = defaultNote;
  }
  // Show lab button only for treatments that need a lab
  // بوابة الخطة: الزر سطح إنشاء (يفتح مودال طلب مخبر بعد الحفظ).
  document.getElementById('toothLabBtn').style.display = (needsLab(status) && labsPlanOk()) ? 'inline-block' : 'none';
  // M79: the regional lab button belongs to the regional flow only — always hidden here
  var _rlbHide = document.getElementById('regionalLabBtn');
  if (_rlbHide) _rlbHide.style.display = 'none';
  // M86-lab: the batch lab button belongs to the batch flow only — always hidden here
  var _blbHide = document.getElementById('batchLabBtn');
  if (_blbHide) _blbHide.style.display = 'none';
  if (_altBridge) altBridgeStep2(label);   /* M145-b */
  condLockStatusPicker(isConditionKey(status));   /* v430: الحالةُ السريرية لا تُسجَّل بأي حالةٍ أخرى */
  if (isConditionKey(status)) return;             /* حقلُ التكلفة مقفولٌ بصفر — لا تركيزَ عليه */
  setTimeout(function(){ document.getElementById('toothCost').focus(); document.getElementById('toothCost').select(); }, 100);
}

function backToStep1() {
  document.getElementById('toothStep1').style.display = 'block';
  document.getElementById('toothStep2').style.display = 'none';
  document.getElementById('toothFoot').style.display  = 'none';
}

/* ── Shared special-treatment persistence (Rule #197 write-path parity) ──
   BRIDGE / SPACE-MAINTAINER / IMPLANT need multi-row or pre-wipe writes. This
   single helper is called by BOTH save paths (saveToothTreatment and
   saveToothAndOpenLab) so the unit logic can never diverge again — the lab
   path previously wrote one plain row, which for a bridge overwrote
   WHOLE='extracted' on the missing tooth and skipped the abutments entirely.
   Reads the same module-level pending* / currentTooth state as the callers.
   Returns:
     { blocked:true }                        → clinical guard rejected; caller returns
     { handled:true, bridgeUnit|spacerUnit } → unit fully persisted; caller skips
                                               its plain single-row write
     { handled:false, implantWiped? }        → caller proceeds with its normal write */
async function persistSpecialTreatment() {
  var pendingTr = getTreatment(pendingToothStatus);
  var pendingTp = pendingTr ? (pendingTr.target_part || 'crown') : 'crown';
  var isBridgeTreatment = (pendingTp === 'bridge') || (pendingToothStatus === 'bridge');
  // ── Clinical guard (primary teeth) ──
  // Implants are never charted on a deciduous tooth number: fixtures are placed
  // after growth completion, at which point the site belongs to the permanent
  // tooth. Explicit message instead of charting a clinically-invalid record.
  if (pendingTp === 'implant' && isPrimaryTooth(currentTooth)) {
    showToast('🦷 الزراعة لا تُسجَّل على سن لبني — حوّل الموضع للسن الدائم ثم خطّطها');
    return { blocked: true };
  }
  if (pendingTp === 'implant' && _altBridge) {
    /* M145-e: زرعةٌ بديلة للجسر = جلسةُ سجلٍّ فقط على السن المقلوع — صفر كتابة على المخطط،
       وقبل أي مسحٍ مسبق (مسحُ الزرعة العادي كان سيحذف صفّ القلع وصفّ الوهمي معاً). */
    if (pendingTreatStatus !== 'planned' || _altBridge.unit.indexOf(parseInt(currentTooth, 10)) < 0
        || !isExtracted(currentTooth) || isPrimaryTooth(currentTooth) || !altBridgeContext(currentTooth)) {
      showToast('⚠️ الزرعة البديلة تُضاف كعلاجٍ مخطّط على السن المقلوع من جسرٍ مخطّط');
      return { blocked: true };
    }
    currentSurface = 'WHOLE';
    return { handled: true, altImplant: true, altUnit: _altBridge.unit.slice() };
  }
  if (isBridgeTreatment && _altBridge) {
    /* M145-b: جسرٌ بديل = جلسةُ سجلٍّ فقط لنفس الوحدة — صفر كتابة على المخطط. */
    if (pendingTreatStatus !== 'planned' || _altBridge.unit.indexOf(parseInt(currentTooth, 10)) < 0 || !altBridgeContext(currentTooth)) {
      showToast('⚠️ الجسر البديل يُضاف كعلاجٍ مخطّط لجسرٍ مخطّط فقط');
      return { blocked: true };
    }
    return { handled: true, bridgeUnit: _altBridge.unit.slice(), altBridge: true };
  }
  if (isBridgeTreatment) {
    // ── Clinical guard (audit fix #4) ──
    // A bridge is charted by clicking the MISSING tooth (the gap); abutments are
    // derived automatically. Applying it from a PRESENT tooth would silently turn
    // that healthy tooth into a DB pontic with no extraction record (inconsistent
    // ghost after reload). Same pattern as the space-maintainer guard.
    if (!isExtracted(currentTooth)) {
      showToast('🌉 الجسر يُطبَّق بالنقر على السن المفقود (المقلوع) — الدعامات تُحدَّد تلقائياً');
      return { blocked: true };
    }
    var abuts = findBridgeAbutments(currentTooth);
    // ── Clinical guard (primary teeth) ──
    // Conventional bridges are never made on deciduous teeth: their roots resorb &
    // exfoliate, and a fixed prosthesis would block the permanent successor's
    // eruption (standard of care: a space maintainer). This also fixes a silent
    // no-op: the unit math below maps abutments against the PERMANENT arch
    // (UPPER_T/LOWER_T), so primary numbers returned indexOf=-1 → empty unit →
    // nothing was saved, with no error and no message.
    var _brProbe = [currentTooth, abuts.mesial, abuts.distal].concat(abuts.gap || []);
    for (var _bp = 0; _bp < _brProbe.length; _bp++) {
      if (_brProbe[_bp] != null && isPrimaryTooth(_brProbe[_bp])) {
        showToast('🦷 الجسر التقليدي لا يُطبَّق على الأسنان اللبنية — البديل السريري: «حافظ مسافة»');
        return { blocked: true };
      }
    }
    // ── Clinical guard (M85.1): implant adjacent to the gap ──
    // findBridgeAbutments now STOPS at implants; a blocked side means the bridge
    // body would have to cross a fixture site — clinically invalid for a
    // conventional bridge. Specific message instead of the generic one.
    if ((!abuts.mesial && abuts.implantBlock && abuts.implantBlock.mesial)
     || (!abuts.distal && abuts.implantBlock && abuts.implantBlock.distal)) {
      showToast('🦷 الجسر التقليدي لا يعبر الزرعة — الموقع الملاصق لزرعة يُخطَّط له بحل زرعي');
      return { blocked: true };
    }
    if (!abuts.mesial || !abuts.distal) {
      showToast('⚠️ يحتاج الجسر سن سليم على كلا الجانبين');
      return { blocked: true };
    }
    // M85: unit through the shared resolver — includes any secondary retainers the
    // doctor added via the modal chips (pendingBridgeExtra), re-validated here so a
    // stale/impossible extension silently clamps to what the arch actually allows.
    var resU = resolveBridgeUnit(currentTooth);
    if (!resU) {
      showToast('⚠️ يحتاج الجسر سن سليم على كلا الجانبين');
      return { blocked: true };
    }
    var unit = resU.unit;
    // Defense in depth (M85.1): with implants blocking the walk a unit can never
    // contain one — but if any path ever produces it, refuse rather than
    // overwrite the implant's WHOLE row (that would erase the fixture record).
    for (var _iu = 0; _iu < unit.length; _iu++) {
      if (isImplant(unit[_iu])) {
        showToast('🦷 الجسر التقليدي لا يعبر الزرعة — الموقع الملاصق لزرعة يُخطَّط له بحل زرعي');
        return { blocked: true };
      }
    }
    bridgeUnitForLedger = unit;
    // ── M85.2: rows stranded by a RE-SAVE ─────────────────────────────────────
    // Every save mints a NEW unit id. If an earlier save of this same bridge was
    // wider (a secondary retainer added through the +/- chips — which reset on
    // every modal open), the teeth left outside the new unit keep the OLD id and
    // survive forever as a lone abutment. Those rows are deleted here, but ONLY
    // when what remains of that old unit holds no pontic: a remainder that still
    // has a pontic is a genuinely different bridge sharing an abutment, and
    // deleting it would erase a real prosthesis. Rows with NO unit id are never
    // touched (a legacy neighbour may be another bridge — removal handles those).
    var _oldIds = {};
    for (var _oi = 0; _oi < unit.length; _oi++) {
      var _om = (teethMap[String(unit[_oi])] || {}).__unit || {};
      for (var _os in _om) { if (_om[_os]) _oldIds[_om[_os]] = 1; }
    }
    var _willWrite = {};
    for (var _wi = 0; _wi < unit.length; _wi++) {
      _willWrite[String(unit[_wi]) + '|' + (isExtracted(unit[_wi]) ? 'PONTIC' : 'WHOLE')] = 1;
    }
    for (var _oid in _oldIds) {
      var _left = [];
      for (var _tk in teethMap) {
        var _tu = teethMap[_tk].__unit || {};
        for (var _ts in _tu) {
          if (_tu[_ts] !== _oid) continue;
          if (_willWrite[_tk + '|' + _ts]) continue;
          if (!isBridgeKey(teethMap[_tk][_ts])) continue;
          _left.push([_tk, _ts]);
        }
      }
      var _leftPontic = false;
      for (var _li = 0; _li < _left.length; _li++) { if (_left[_li][1] === 'PONTIC') { _leftPontic = true; break; } }
      if (_leftPontic) continue;
      for (var _di = 0; _di < _left.length; _di++) {
        var _dt = _left[_di][0], _ds = _left[_di][1];
        var _dsr = await window.sb.from('teeth_status').delete()
          .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
          .eq('tooth_num', _dt).eq('surface', _ds);
        if (_dsr.error) { console.error('stranded bridge row cleanup error:', _dsr.error); continue; }
        delete teethMap[_dt][_ds];
        if (teethMap[_dt].__status) delete teethMap[_dt].__status[_ds];
        if (teethMap[_dt].__unit) delete teethMap[_dt].__unit[_ds];
      }
    }
    // M85: one uuid shared by every row of this unit → deletion/grouping become
    // exact (no adjacency inference). Tiny v4 fallback for pre-randomUUID engines.
    var unitId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
          var r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16);
        });
    var bridgeKey = pendingToothStatus;  // Could be 'bridge' or a custom key like 'custom_xxx'
    for (var u=0; u<unit.length; u++) {
      var un = String(unit[u]);
      // M85 generalized rule: every PRESENT tooth in the unit is a retainer
      // (covers double abutments AND pier abutments); every extracted tooth is
      // a pontic. Replaces the old "endpoints only" comparison.
      var isAbut = !isExtracted(unit[u]);
      if (isAbut) {
        var rA = await upsertTeethStatusWithFallback({
          doctor_id: currentUser.id, patient_id: patientId,
          tooth_num: un, surface: 'WHOLE', treatment_key: bridgeKey, status: pendingTreatStatus, provider_id: pendingProviderId,
          unit_id: unitId
        }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
        if (rA.error) {
          console.error('bridge abutment save error:', rA.error);
          showToast('⚠️ خطأ حفظ السن ' + un + ': ' + rA.error.message);
        }
        if (!teethMap[un]) teethMap[un] = {};
        teethMap[un]['WHOLE'] = bridgeKey;
        if (!teethMap[un].__status) teethMap[un].__status = {};
        teethMap[un].__status.WHOLE = pendingTreatStatus;
        if (!teethMap[un].__unit) teethMap[un].__unit = {};
        teethMap[un].__unit.WHOLE = unitId;
      } else {
        // Pontic: save at PONTIC surface (DB constraint accepts it)
        var rP = await upsertTeethStatusWithFallback({
          doctor_id: currentUser.id, patient_id: patientId,
          tooth_num: un, surface: 'PONTIC', treatment_key: bridgeKey, status: pendingTreatStatus, provider_id: pendingProviderId,
          unit_id: unitId
        }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
        if (rP.error) {
          console.error('bridge pontic save error:', rP.error);
          showToast('⚠️ خطأ حفظ السن ' + un + ': ' + rP.error.message);
        } else {
          if (!teethMap[un]) teethMap[un] = {};
          teethMap[un]['PONTIC'] = bridgeKey;
          if (!teethMap[un].__status) teethMap[un].__status = {};
          teethMap[un].__status.PONTIC = pendingTreatStatus;
          if (!isExtractionKey(teethMap[un]['WHOLE'])) teethMap[un]['WHOLE'] = 'extracted';
          if (!teethMap[un].__unit) teethMap[un].__unit = {};
          teethMap[un].__unit.PONTIC = unitId;
        }
      }
    }
    return { handled: true, bridgeUnit: unit };
  }
  if (window.__m61 === true && isSpacerTreatment(pendingTr) && isExtracted(currentTooth)) {
    // ── حافظ مسافة: unit save (mirror of the bridge unit) ──
    // findBridgeAbutments walks the ACTIVE arch (dentition-aware), so this works
    // on primary/mixed charts — where space maintainers actually live.
    var sAb = findBridgeAbutments(currentTooth);
    if (!sAb.mesial || !sAb.distal) {
      showToast('⚠️ حافظ المسافة يحتاج سنّين موجودَين على جانبي الفجوة');
      return { blocked: true };
    }
    // Band & loop: rows ONLY on the gap teeth + the DISTAL (band) abutment.
    // The mesial tooth gets NOTHING — the loop merely rests against it.
    var sArch = archOf(currentTooth);
    var sBand = spacerBandToothOf(currentTooth, sAb.mesial, sAb.distal);
    spacerUnitForLedger = (sAb.gap || [currentTooth]).slice();
    if (spacerUnitForLedger.indexOf(sBand) < 0) spacerUnitForLedger.push(sBand);
    spacerUnitForLedger.sort(function(a, b){ return sArch.indexOf(a) - sArch.indexOf(b); });
    for (var su = 0; su < spacerUnitForLedger.length; su++) {
      var sun = String(spacerUnitForLedger[su]);
      var rS = await upsertTeethStatusWithFallback({
        doctor_id: currentUser.id, patient_id: patientId,
        tooth_num: sun, surface: 'SPACER', treatment_key: pendingToothStatus, status: pendingTreatStatus, provider_id: pendingProviderId
      }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
      if (rS.error) {
        console.error('spacer save error:', rS.error);
        showToast('⚠️ خطأ حفظ السن ' + sun + ': ' + rS.error.message);
      } else {
        if (!teethMap[sun]) teethMap[sun] = {};
        teethMap[sun]['SPACER'] = pendingToothStatus;
        if (!teethMap[sun].__status) teethMap[sun].__status = {};
        teethMap[sun].__status.SPACER = pendingTreatStatus;
      }
    }
    return { handled: true, spacerUnit: spacerUnitForLedger };
  }
  // For IMPLANT (built-in or any custom variant like 'زراعة سويسرية'):
  // wipe ALL existing surfaces for this tooth first
  // (so old root canals, fillings, etc. don't survive — an implant replaces the natural tooth completely)
  if (pendingTp === 'implant') {
      var dAll = await window.sb.from('teeth_status').delete()
        .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
        .eq('tooth_num', String(currentTooth));
      if (dAll.error) console.error('clear surfaces before implant error:', dAll.error);
      teethMap[String(currentTooth)] = {};
      return { handled: false, implantWiped: true };
    }
  return { handled: false };
}

// M79: regional (ortho) "حفظ + إرسال لمخبر" — mirrors saveToothAndOpenLab's intent
// WITHOUT duplicating the regional save branch. Sets a consume-once flag, then
// runs the canonical saveToothTreatment; inside its regional branch, a successful
// session insert opens the lab-order modal prefilled with session_id + provider.
// finally-reset guarantees the flag never leaks into a later plain save.
var _regOpenLabAfterSave = false;
async function saveRegionalAndOpenLab() {
  if (typeof labsPlanOk === 'function' && !labsPlanOk()) { labsBlockedToast(); return; }
  _regOpenLabAfterSave = true;
  try { await saveToothTreatment(); }
  finally { _regOpenLabAfterSave = false; }
}

// M86-lab: batch "حفظ + إرسال لمخبر" — exact mirror of the M79 wrapper above.
// Consume-once flag + finally-reset, so it can never leak into a later plain
// save even if saveToothTreatment throws or returns early.
var _batchOpenLabAfterSave = false;
async function saveBatchAndOpenLab() {
  if (typeof labsPlanOk === 'function' && !labsPlanOk()) { labsBlockedToast(); return; }
  _batchOpenLabAfterSave = true;
  try { await saveToothTreatment(); }
  finally { _batchOpenLabAfterSave = false; }
}

var saveToothTreatment = ppGuarded('saveToothTreatment', _saveToothTreatment_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _saveToothTreatment_inner() {
  // Phase 4.1: defense-in-depth — block if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل علاجات جديدة');
    return;
  }
  var costRaw = parseFloat(document.getElementById('toothCost').value);
  var units = toothUnitsValue();   /* v425 (M150): عرضيٌّ — cost يبقى الإجمالي */
  var date  = document.getElementById('toothDate').value;
  var notes = document.getElementById('toothNotes').value.trim();
  // Cost is OPTIONAL for all statuses. Default to 0 if empty/invalid.
  // The doctor can edit it later if needed (e.g. set a price on a planned treatment).
  var cost = (costRaw && costRaw > 0) ? costRaw : 0;
  if (condNormalizePending()) cost = 0;   /* v430: حالةٌ سريرية ⇒ مراقبة + صفر تكلفة، مهما وصل من الحقل */
  if (!date) { showToast('⚠️ اختر التاريخ'); return; }

  // ============================================================
  // Phase 3 Feature G: Regional treatments (quadrant/arch/mouth)
  // ============================================================
  // These don't write to teeth_status (no specific tooth). They create a single
  // ledger_sessions row with quadrant/arch columns set, and tooth_num/surface = null.
  // Following OpenDental's rule, regional procedures don't display on the tooth chart;
  // they appear only in the sessions list and timeline.
  if (pendingRegionalType === 'quadrant' || pendingRegionalType === 'arch' || pendingRegionalType === 'mouth') {
    // Build description that describes the region (no tooth number)
    var regAreaText, regDescription;
    // M85.2: multi-region — loop the selection, one session per region at the
    // entered price (OpenDental parity: one click charts all selected regions).
    // Quadrant loops the quadrant set, arch loops the arch set (U/L), mouth
    // iterates once with a null marker → its behavior is byte-identical.
    var _regQuads;
    if (pendingRegionalType === 'quadrant') {
      _regQuads = pendingRegionalQuadrants.length ? pendingRegionalQuadrants.slice() : [pendingRegionalQuadrant];
    } else if (pendingRegionalType === 'arch') {
      _regQuads = pendingRegionalArches.length ? pendingRegionalArches.slice() : [pendingRegionalArch];
    } else {
      _regQuads = [null];
    }
    if (pendingRegionalType === 'mouth') {
      regAreaText = 'الفم كامل';
    } else if (pendingRegionalType === 'quadrant') {
      regAreaText = _regQuads.map(function(q){ return QUADRANT_LABELS[q] || q; }).join(' · ');
    } else {
      regAreaText = _regQuads.map(function(a){ return ARCH_LABELS[a] || a; }).join(' · ');
    }

    var regNewSess = null, _regCreated = 0;
    if (pendingTreatStatus === 'completed' || pendingTreatStatus === 'planned') {
      for (var _rq = 0; _rq < _regQuads.length; _rq++) {
        var _q = _regQuads[_rq];
        regDescription = (pendingRegionalType === 'quadrant')
          ? (QUADRANT_LABELS[_q] || _q)
          : (pendingRegionalType === 'arch')
            ? (ARCH_LABELS[_q] || _q)
            : regAreaText;
        // Build the insert payload. Set quadrant/arch where applicable; everything else null.
        var regPayload = {
          doctor_id: currentUser.id, patient_id: patientId,
          type: pendingToothLabel, description: regDescription,
          cost: cost, date: date, notes: notes,
          tooth_num: null, surface: null,
          status: pendingTreatStatus,
          provider_id: pendingProviderId,
          treatment_key: getTreatment(pendingToothStatus) ? pendingToothStatus : null,   // v260
          currency: window.SyDentCurPick.read('toothCost')   // M125
        };
        if (units > 1) regPayload.units = units;   /* v425 (M150): يُكتب عند التعدّد فقط — NULL = وحدة */
        if (pendingRegionalType === 'quadrant') regPayload.quadrant = _q;
        else if (pendingRegionalType === 'arch') regPayload.arch = _q;
        // For 'mouth' both quadrant and arch stay null — the type itself signals scope.
        // Orthodontics: persist start date (= the session date) + expected duration (months).
        var _trOrtho = getTreatment(pendingToothStatus);
        if (_trOrtho && (_trOrtho.category || '') === 'orthodontics') {
          regPayload.ortho_start = date;
          var _omEl = document.getElementById('toothOrthoMonths');
          var _om = _omEl ? parseInt(_omEl.value, 10) : NaN;
          if (_om > 0) regPayload.ortho_months = _om;
        }

        var rReg = await window.sb.from('ledger_sessions').insert(regPayload).select().single();
        if (rReg.error && regPayload.units && /\bunits\b/.test((rReg.error.message || '') + ' ' + (rReg.error.code || ''))) {
          delete regPayload.units;   /* قبل M150 */
          rReg = await window.sb.from('ledger_sessions').insert(regPayload).select().single();
        }
        if (rReg.error) {
          // Graceful fallback if Migration 7.3 hasn't been applied yet
          if (rReg.error.code === '42703' || (rReg.error.message || '').indexOf('quadrant') >= 0 || (rReg.error.message || '').indexOf('arch') >= 0) {
            showToast('⚠️ يلزم تشغيل Migration 7.3 لإضافة أعمدة quadrant/arch');
          } else {
            showToast('⚠️ تسجيل الجلسة فشل: ' + rReg.error.message);
          }
          console.error('regional ledger insert error:', rReg.error);
          break;   // M85.2: stop the loop on the first failure (no partial-silent spam)
        } else if (rReg.data) {
          if (!regNewSess) regNewSess = rReg.data;   // first session anchors realloc guard + lab hook
          _regCreated++;
          sessions.unshift(rReg.data); sortByDateDesc(sessions);
          // Phase 5: audit log (regional treatment — quadrant/arch/mouth)
          if (window.logAudit) {
            window.logAudit('session.create', {
              entityId: rReg.data.id,
              patientId: patientId,
              patientName: (patient && patient.name) || '',
              description: 'إضافة جلسة (' + regDescription + '): ' + pendingToothLabel + ' — ' + cost + ' ' + _rowLbl(rReg.data),
              newValue: { type: pendingToothLabel, cost: cost, date: date, status: pendingTreatStatus, provider_id: pendingProviderId, scope: pendingRegionalType }
            });
          }
        }
      }
    }

    // Reallocate funds if a session was created (handles unearned-credit flow)
    if (regNewSess) await reallocatePatientFunds();

    // Update patient last_visit + status (same as tooth flow)
    var regUpdates = {};
    if (!patient.last_visit || date > patient.last_visit) regUpdates.last_visit = date;
    if (patient.status === 'جديد') regUpdates.status = 'تحت العلاج';
    if (Object.keys(regUpdates).length) {
      await window.sb.from('patients').update(regUpdates).eq('id', patientId).eq('doctor_id', currentUser.id);
      Object.assign(patient, regUpdates);
    }

    renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();
    closeModal('toothModal');
    // Phase 3 Feature G: distinct toast for the two outcomes:
    //   - billable status (completed/planned): session created → confirm save
    //   - non-billable status (condition/existing_*/referred): no session created → tell the user
    //     why (regional clinical notes don't make much sense — we save nothing, so the
    //     user shouldn't think a record exists). This is consistent with the tooth-based
    //     flow where these statuses write only to teeth_status; for regional we have no
    //     teeth_status either, so the operation is effectively a no-op.
    if (regNewSess) {
      // M79: "حفظ + إرسال لمخبر" (regional) — the session saved fine, so hand off
      // to the lab-order modal prefilled with the fresh session link. tooth_num
      // stays empty (regional scope); provider follows the session's provider.
      if (_regOpenLabAfterSave) {
           /* M127: نفسُ قاعدة زرّ 🥽 بصفّ الجلسة — علاجٌ لم يُنجَز يعني أن الطبعة لم
          تُؤخذ، فالطلبُ يُفتح مسودّةً. وبدونها كان البابان يعطيان نتيجتين مختلفتين
          للحالة السريرية الواحدة: هذا الزرّ يُرسل و🥽 يُسوِّد — وهو فرقٌ لا يقدر
          الطبيبُ أن يتوقّعه. والمودالُ نموذجُ طلبٍ لا فعلَ إرسال؛ الإرسالُ هو التاريخ. */
        openLabOrderModal({
          session_id: regNewSess.id,
          treatment_key: pendingToothStatus,
          notes: notes,
          provider_id: pendingProviderId || null,
          draft: pendingTreatStatus !== 'completed'
        });
        showToast('✅ تم تسجيل ' + pendingToothLabel + ' لـ ' + regAreaText + ' — أكمل بيانات المخبر');
      } else if (_regCreated > 1) {
        // M85.2: multi-region — make the per-region session count explicit
        showToast(pendingRegionalType === 'arch'
          ? '✅ تم تسجيل ' + pendingToothLabel + ' للفكين (جلسة لكل فك)'
          : '✅ تم تسجيل ' + pendingToothLabel + ' لـ' + _regCreated + ' أرباع (جلسة لكل ربع)');
      } else {
        showToast('✅ تم تسجيل ' + pendingToothLabel + ' لـ ' + regAreaText);
      }
    } else if (pendingTreatStatus === 'condition' || pendingTreatStatus === 'existing_current'
            || pendingTreatStatus === 'existing_other' || pendingTreatStatus === 'referred') {
      showToast('ℹ️ حالة "' + (STATUS_LABELS[pendingTreatStatus] || pendingTreatStatus) + '" لا تُسجَّل لعلاج جماعي');
    }
    // Reset regional state for next save
    pendingRegionalType = null;
    pendingRegionalQuadrant = null;
    pendingRegionalQuadrants = [];   // M85.2
    pendingRegionalArch = null;
    pendingRegionalArches = [];   // M85.2
    return;
  }
  // ============================================================
  // End Feature G regional path — normal tooth-based flow below
  // ============================================================

  // ============================================================
  // M86: batch multi-select — one session per tooth (M85.2 loop pattern;
  // OpenDental parity: "loops through each tooth and repeats the logic").
  // Consume-once via __batchApplySel; double-keyed on __batchMode so a stale
  // value can never leak into a later plain save.
  // ============================================================
  if (window.__batchMode === true && window.__batchApplySel && window.__batchApplySel.length) {
    var _bSel = window.__batchApplySel.slice().sort(function(a, b){ return (a.n - b.n) || String(a.s).localeCompare(String(b.s)); });
    window.__batchApplySel = null;
    var _bTr = getTreatment(pendingToothStatus);
    var _bTp = _bTr ? (_bTr.target_part || 'crown') : 'whole';
    var bNewSess = null, _bCreated = 0, _bFailed = false;
    // M86-lab: one lab order per TOOTH (not per unit) — a 'both' treatment can
    // yield two units on the same tooth (crown composite + root composite) and
    // two lab orders for one crown would be wrong. First session of each tooth
    // anchors that tooth's order.
    var _bLabUnits = [], _bLabSeen = {};
    var _bSessIds = [];   /* M169: كلُّ جلسةٍ أُنشئت بالدفعة — خصمُ المواد يتوزّع عليها */
    for (var _bi = 0; _bi < _bSel.length; _bi++) {
      var _bn = _bSel[_bi].n;
      var _bSurface = _bSel[_bi].s;   // محلول لحظة النقر عبر examRouteSurface — لا إعادة حساب
      var _bAreaLbl = _batchAreaLbl(_bn, _bSurface);
      // Re-validate right before writing (chart state may have shifted mid-modal).
      var _bv = batchAllowed(_bn, _bTr || {}, _bSurface);
      if (!_bv.ok) {
        showToast('⚠️ السن ' + _bn + ' لم يعد مؤهلاً (' + _bv.msg + ') — توقفت الدفعة');
        _bFailed = true; break;
      }
      // Implant replaces the natural tooth completely: wipe ALL existing surfaces
      // first (exact mirror of persistSpecialTreatment's implant pre-wipe).
      if (_bTp === 'implant') {
        var _bd = await window.sb.from('teeth_status').delete()
          .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
          .eq('tooth_num', String(_bn));
        if (_bd.error) {
          console.error('batch implant pre-wipe error:', _bd.error);
          showToast('⚠️ خطأ بالسن ' + _bn + ': ' + _bd.error.message);
          _bFailed = true; break;
        }
        teethMap[String(_bn)] = {};
      }
      var _br = await upsertTeethStatusWithFallback({
        doctor_id: currentUser.id, patient_id: patientId,
        tooth_num: String(_bn), surface: _bSurface, treatment_key: pendingToothStatus,
        status: pendingTreatStatus, provider_id: pendingProviderId,
        review_at: null
      }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
      if (_br.error) {
        console.error('batch teeth_status save error:', _br.error);
        showToast('⚠️ خطأ حفظ السن ' + _bn + ': ' + _br.error.message);
        _bFailed = true; break;   // M85.2: stop on the first failure (no partial-silent spam)
      }
      if (!teethMap[String(_bn)]) teethMap[String(_bn)] = {};
      teethMap[String(_bn)][_bSurface] = pendingToothStatus;
      if (!teethMap[String(_bn)].__status) teethMap[String(_bn)].__status = {};
      teethMap[String(_bn)].__status[_bSurface] = pendingTreatStatus;
      _syncReviewCache(_bn, _bSurface);
      /* v430: حالةٌ سريرية بالدفعة ⇒ صفُّ مخططٍ فقط، بلا أي سطرٍ بالسجل (مسارُ الدفعة كان
         يُدرج بلا بوابة حالة). */
      if (isConditionKey(pendingToothStatus)) { _bCreated++; continue; }
      // Ledger session per tooth — byte-identical fields to the single-tooth path.
      var _bDesc = 'السن رقم ' + _bn + ' — ' + _bAreaLbl;
      var _bl = await window.sb.from('ledger_sessions').insert({
        doctor_id: currentUser.id, patient_id: patientId,
        type: pendingToothLabel, description: _bDesc,
        cost: cost, date: date, notes: notes, tooth_num: String(_bn), surface: _bSurface,
        status: pendingTreatStatus,
        provider_id: pendingProviderId,
        treatment_key: getTreatment(pendingToothStatus) ? pendingToothStatus : null,   // v260
        currency: window.SyDentCurPick.read('toothCost')     // M125
      }).select().single();
      if (_bl.error) {
        console.error('batch ledger insert error:', _bl.error);
        showToast('⚠️ تسجيل جلسة السن ' + _bn + ' فشل: ' + _bl.error.message);
        _bFailed = true; break;
      }
      if (_bl.data) {
        if (!bNewSess) bNewSess = _bl.data;   // first session anchors the realloc guard
        _bCreated++;
        _bSessIds.push(_bl.data.id);
        if (!_bLabSeen[String(_bn)]) {
          _bLabSeen[String(_bn)] = true;
          _bLabUnits.push({ session_id: _bl.data.id, tooth_num: _bn });
        }
        sessions.unshift(_bl.data);
        // Phase 5: audit log (batch — one entry per session, logAudit pattern)
        if (window.logAudit) {
          window.logAudit('session.create', {
            entityId: _bl.data.id,
            patientId: patientId,
            patientName: (patient && patient.name) || '',
            description: 'إضافة جلسة (' + _bDesc + '): ' + pendingToothLabel + ' — ' + cost + ' ' + _rowLbl(_bl.data),
            newValue: { type: pendingToothLabel, cost: cost, date: date, status: pendingTreatStatus, provider_id: pendingProviderId, tooth_num: String(_bn), surface: _bSurface, batch: true }
          });
        }
      }
    }
    sortByDateDesc(sessions);
    // Reallocate funds ONCE after all inserts (FIFO rebuild covers every session).
    if (bNewSess) await reallocatePatientFunds();
    var _bUpd = {};
    if (!patient.last_visit || date > patient.last_visit) _bUpd.last_visit = date;
    if (patient.status === 'جديد') _bUpd.status = 'تحت العلاج';
    if (Object.keys(_bUpd).length) {
      await window.sb.from('patients').update(_bUpd).eq('id', patientId).eq('doctor_id', currentUser.id);
      Object.assign(patient, _bUpd);
    }
    renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();
    closeModal('toothModal');
    batchClearSelection();   // stay in batch mode, ready for the next round
    // M86-lab: "حفظ + إرسال لمخبر" (batch) — the sessions saved fine, so hand off
    // to the lab-order modal carrying every tooth + its own fresh session link.
    // One lab order per tooth is created on save (same shape as the single path).
    if (_batchOpenLabAfterSave && _bLabUnits.length) {
      /* M127: نفسُ قاعدة زرّ 🥽 بصفّ الجلسة — علاجٌ لم يُنجَز يعني أن الطبعة لم
        تُؤخذ، فالطلبُ يُفتح مسودّةً. وبدونها كان البابان يعطيان نتيجتين مختلفتين
        للحالة السريرية الواحدة: هذا الزرّ يُرسل و🥽 يُسوِّد — وهو فرقٌ لا يقدر
        الطبيبُ أن يتوقّعه. والمودالُ نموذجُ طلبٍ لا فعلَ إرسال؛ الإرسالُ هو التاريخ. */
      await openLabOrderModal({
        tooth_num: _bLabUnits[0].tooth_num,
        session_id: _bLabUnits[0].session_id,
        treatment_key: pendingToothStatus,
        notes: notes,
        provider_id: pendingProviderId || null,
        draft: pendingTreatStatus !== 'completed',
        batch_units: _bLabUnits
      });
      // showToast REPLACES the visible message (single #syToast node) — so this
      // toast must carry the failure state itself, otherwise it would silently
      // wipe the per-tooth error raised inside the loop.
      showToast(_bFailed
        ? ('⚠️ توقفت الدفعة — سُجلت ' + _bCreated + ' من ' + _bSel.length + ' جلسات — أكمل بيانات المخبر للمسجَّل')
        : ('✅ تم تسجيل ' + pendingToothLabel + ' لـ' + _bCreated + ' أسنان — أكمل بيانات المخبر'));
    } else if (_bCreated) {
      showToast(_bFailed
        ? ('⚠️ توقفت الدفعة — سُجلت ' + _bCreated + ' من ' + _bSel.length + ' جلسات')
        : ('✅ تم تسجيل ' + pendingToothLabel + ' لـ' + _bCreated + ' أسنان (جلسة لكل سن)'));
    }
    // P3-B: material deduction — ONE prompt for the whole batch, default
    // quantities ×N (editable in the modal). completed only, same gate as single.
    try {
      if (!_bFailed && _bCreated && pendingTreatStatus === 'completed' && getTreatment(pendingToothStatus)) {
        if (_batchOpenLabAfterSave && _bLabUnits.length) {
          // مؤجَّل: مودال المخبر فُتح للتو بهذا الفرع — فتح الخصم فوقه تراكب
          // مشوّش. نقطة الخنق closeModal('labOrderModal') تُطلقه بعد الإغلاق.
          window._pendingMatDeduct = { k: pendingToothStatus, l: pendingToothLabel, m: _bCreated, s: _bSessIds };
        } else {
          await maybePromptMaterialDeduction(pendingToothStatus, pendingToothLabel, _bCreated, _bSessIds);
        }
      }
    } catch (e) { console.warn('material deduction skipped (batch):', e); }
    return;
  }
  // ============================================================
  // End M86 batch path — single-tooth flow below
  // ============================================================

  /* v431: حارسا الحالة السريرية قبل أي كتابة —
     (أ) حالةُ سطحٍ فوق علاجٍ على السطح نفسه (أو داخل ترميمٍ مركّبٍ يشمله) ⇒ رفضٌ صريح،
         لأن المفتاح الأساسي صفٌّ واحدٌ لكل سطح فالكتابةُ كانت ستمحو العلاج بصمت
         (حارسُ «استبدال المخطط» القائم لا يشمل الحالات: شرطُه completed/planned).
     (ب) استبدالُ حالةِ سنٍّ قائمةٍ بأخرى ⇒ تأكيدٌ باسمَيهما، لا محوٌ صامت. */
  if (isConditionKey(pendingToothStatus) && currentTooth) {
    var _cdDef = getCondition(pendingToothStatus);
    var _onlyMsg = condSurfaceNotAllowed(_cdDef, currentSurface);   /* v434 */
    if (_onlyMsg) { showToast(_onlyMsg); return; }
    if (currentSurface !== COND_SURFACE) {
      var _cfK = condSurfaceConflict(currentTooth, currentSurface);
      if (_cfK) {
        var _cfT = getTreatment((teethMap[String(currentTooth)] || {})[_cfK]);
        showToast('🩺 السطح يحمل علاجاً (' + (_cfT ? _cfT.name : _cfK) + ') — سجّل الحالة على سطحٍ آخر أو أزل العلاج أولاً');
        return;
      }
    }
    /* v494 (تحقّقُ المحادثة): استبدالُ حالةٍ بأخرى يمرّ بتأكيدٍ يسمّيهما **على أيِّ موضع** —
       كان التأكيدُ لحالة السن (COND) وحدها، وحالةُ السطح تُستبدل بصمت (قلحٌ على اللثوي
       يمحو حساسيةً مسجَّلةً عليه بلا سؤال). */
    var _prevC = (teethMap[String(currentTooth)] || {})[currentSurface];
    if (_prevC && isConditionKey(_prevC) && _prevC !== pendingToothStatus) {
      var _pcD = getCondition(_prevC);
      if (!await SyDialog.confirm({ message: 'السن ' + currentTooth + ' يحمل حالة «' + (_pcD ? _pcD.name : _prevC) + '» (' + conditionSiteLabel(currentTooth, currentSurface) + ').\nاستبدالها بـ«' + pendingToothLabel + '»؟', danger: false })) return;
    }
  }
  // Special handling (bridge / spacer / implant) is shared with saveToothAndOpenLab
  // via persistSpecialTreatment() — Rule #197 write-path parity (audit fix #1).
  var pendingTr = getTreatment(pendingToothStatus);
  var pendingTp = pendingTr ? (pendingTr.target_part || 'crown') : 'crown';
  var _sp = await persistSpecialTreatment();
  if (_sp.blocked) return;
  var bridgeUnitForLedger = _sp.bridgeUnit || null;
  var spacerUnitForLedger = _sp.spacerUnit || null;
  if (!_sp.handled) {
    // v260: السطحُ يحمل صفاً واحداً — لو عليه علاجٌ مخطّط آخر فالحفظُ سيستبدله
    // على المخطّط بصمت (الجلستان تبقيان بالسجل). كان هذا يحدث بلا أي تنبيه
    // (وتدٌ مخطّط داس إعادةَ معالجةٍ مخطّطة على R1R2). تأكيدٌ صريح قبل أي كتابة.
    if (pendingTreatStatus === 'completed' || pendingTreatStatus === 'planned') {
      var _smG = teethMap[String(currentTooth)] || {};
      var _gKey = _smG[currentSurface] || null;
      var _gSt  = (_smG.__status && _smG.__status[currentSurface]) || (_gKey ? 'completed' : null);
      if (_gKey && _gSt === 'planned' && _gKey !== pendingToothStatus) {
        var _gTr = getTreatment(_gKey);
        var _gMsg = 'هذا السطح عليه علاجٌ مخطّط آخر: ' + (_gTr ? _gTr.name : _gKey)
                  + '\n\nالمخطّط يعرض علاجاً واحداً لكل سطح — سيُعرض «' + pendingToothLabel + '» مكانه، '
                  + 'وتبقى الجلستان معاً بسجل الجلسات (ويظهران بتلميح السن).\n\nمتابعة؟';
        if (!await SyDialog.confirm({ message: _gMsg, danger: false })) return;
      }
    }
    // Composite restoration (e.g. MOD): it physically occupies all its component
    // surfaces. Clear any existing crown-surface rows on this tooth whose letters are
    // a SUBSET of the new composite (single 'M' / 'MO' subsumed by 'MOD'), so they
    // don't linger underneath. Scoped to composite saves ONLY → single-surface save
    // behavior is unchanged. (Renders precedence is the safety net for rare overlaps.)
    if (isCompositeSurfaceCode(currentSurface)) {
      var _newSet = currentSurface.split('');
      var _smC = teethMap[String(currentTooth)] || {};
      var _toDel = [];
      for (var _ck in _smC) {
        if (_ck === '__status' || _ck === currentSurface || !_smC[_ck]) continue;
        if (!/^[MODBLIV]+$/.test(_ck)) continue;  // crown single/composite codes only
        var _isSub = _ck.split('').every(function(l){ return _newSet.indexOf(l) !== -1; });
        if (_isSub) _toDel.push(_ck);
      }
      for (var _di=0; _di<_toDel.length; _di++) {
        var _dk = _toDel[_di];
        var _drc = await window.sb.from('teeth_status').delete()
          .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
          .eq('tooth_num', String(currentTooth)).eq('surface', _dk);
        if (_drc.error) console.error('composite overlap clear error (' + _dk + '):', _drc.error);
        if (teethMap[String(currentTooth)]) {
          delete teethMap[String(currentTooth)][_dk];
          if (teethMap[String(currentTooth)].__status) delete teethMap[String(currentTooth)].__status[_dk];
        }
      }
    }
    // Composite ROOT treatment (e.g. R1R2R3): it covers all its component roots.
    // Clear any existing root rows on this tooth whose parts are a SUBSET of the
    // new composite (single 'R1' / 'R1R2' subsumed by 'R1R2R3') — exact mirror of
    // the crown-composite subsumption above. Scoped to composite-root saves ONLY.
    if (isCompositeRootCode(currentSurface)) {
      var _newRSet = rootCodeParts(currentSurface);
      var _smR = teethMap[String(currentTooth)] || {};
      var _toDelR = [];
      for (var _rkc in _smR) {
        if (_rkc === '__status' || _rkc === currentSurface || !_smR[_rkc]) continue;
        if (!isRootCode(_rkc)) continue;  // root single/composite codes only
        var _isSubR = rootCodeParts(_rkc).every(function(rp){ return _newRSet.indexOf(rp) !== -1; });
        if (_isSubR) _toDelR.push(_rkc);
      }
      for (var _dri=0; _dri<_toDelR.length; _dri++) {
        var _dkr = _toDelR[_dri];
        var _drr = await window.sb.from('teeth_status').delete()
          .eq('doctor_id', currentUser.id).eq('patient_id', patientId)
          .eq('tooth_num', String(currentTooth)).eq('surface', _dkr);
        if (_drr.error) console.error('root composite overlap clear error (' + _dkr + '):', _drr.error);
        if (teethMap[String(currentTooth)]) {
          delete teethMap[String(currentTooth)][_dkr];
          if (teethMap[String(currentTooth)].__status) delete teethMap[String(currentTooth)].__status[_dkr];
        }
      }
    }
    // ── Post-extraction site treatment (M61/M63): store on surface='SOCKET' — a SEPARATE
    //    row from the extraction (WHOLE='extracted'), so the ghost is kept AND the treatment
    //    colour renders on top. surface is a pure clinical LABEL → zero financial effect. ──
    var _socketSave = window.__m61 === true && pendingTr && pendingTr.post_extraction === true
                   && pendingTp !== 'bridge' && pendingTp !== 'implant'
                   && !isSpacerTreatment(pendingTr) && isExtracted(currentTooth);
    if (_socketSave) {
      // dedicated SOCKET surface (mirrors SPACER). The fallback wrapper only ever rewrites
      // `status` (never `surface`), so the WHOLE='extracted' row can never be clobbered.
      var rSk = await upsertTeethStatusWithFallback({
        doctor_id: currentUser.id, patient_id: patientId,
        tooth_num: String(currentTooth), surface: 'SOCKET', treatment_key: pendingToothStatus, status: pendingTreatStatus, provider_id: pendingProviderId,
        review_at: _reviewAtVal()
      }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
      if (rSk.error) {
        console.error('socket save error:', rSk.error);
        showToast('⚠️ خطأ حفظ الحالة: ' + rSk.error.message);
      } else {
        if (!teethMap[String(currentTooth)]) teethMap[String(currentTooth)] = {};
        teethMap[String(currentTooth)].SOCKET = pendingToothStatus;
        if (!teethMap[String(currentTooth)].__status) teethMap[String(currentTooth)].__status = {};
        teethMap[String(currentTooth)].__status.SOCKET = pendingTreatStatus;
        _syncReviewCache(currentTooth, 'SOCKET');   // A
      }
    } else {
    // Normal save — DB constraint now accepts all valid surface values
    var rN = await upsertTeethStatusWithFallback({
      doctor_id: currentUser.id, patient_id: patientId,
      tooth_num: String(currentTooth), surface: currentSurface, treatment_key: pendingToothStatus, status: pendingTreatStatus, provider_id: pendingProviderId,
      review_at: _reviewAtVal()
    }, { onConflict: 'doctor_id,patient_id,tooth_num,surface' });
    if (rN.error) {
      console.error('teeth_status save error:', rN.error);
      showToast('⚠️ خطأ حفظ الحالة: ' + rN.error.message);
    } else {
      if (!teethMap[String(currentTooth)]) teethMap[String(currentTooth)] = {};
      teethMap[String(currentTooth)][currentSurface] = pendingToothStatus;
      if (!teethMap[String(currentTooth)].__status) teethMap[String(currentTooth)].__status = {};
      teethMap[String(currentTooth)].__status[currentSurface] = pendingTreatStatus;
      _syncReviewCache(currentTooth, currentSurface);   // A
    }
    }
  }

  // Build description for the ledger entry
  var areaForDesc, ledgerToothNum = String(currentTooth), ledgerDescription;
  if (spacerUnitForLedger) {
    areaForDesc = 'حافظ مسافة يشمل الأسنان ' + spacerUnitForLedger.join('، ');
    ledgerToothNum = spacerUnitForLedger.join(',');
    ledgerDescription = areaForDesc;
  } else if (bridgeUnitForLedger) {
    areaForDesc = 'جسر يشمل الأسنان ' + bridgeUnitForLedger.join('، ');
    ledgerToothNum = bridgeUnitForLedger.join(',');
    ledgerDescription = areaForDesc;
  } else {
    if (_socketSave) areaForDesc = 'موقع القلع';
    else if (currentSurface === 'WHOLE') areaForDesc = 'السن كاملاً';
    else if (currentSurface === 'CROWN_FULL') areaForDesc = 'التاج كامل';
    else if (isRootCode(currentSurface)) areaForDesc = rootAreaLabelFor(currentSurface, currentTooth);
    else areaForDesc = 'السطح ' + surfLabelFor(currentSurface, currentTooth);
    ledgerDescription = 'السن رقم ' + currentTooth + ' — ' + areaForDesc;
  }

  // 2. Save session in the ledger.
  // DB constraint now accepts the full set of surface keys (O/I/B/L/M/D/V/WHOLE/PONTIC/CROWN_FULL/BRIDGE/R1/R2/R3)
  // so we save the true surface key for accurate per-surface reporting.
  var dbSurface = currentSurface;
  if (spacerUnitForLedger) dbSurface = 'SPACER';
  if (_socketSave) dbSurface = 'SOCKET';
  // Only create a ledger entry for completed and planned treatments (financial records).
  // 'existing_current'/'existing_other' (pre-existing work, whether ours or external) and
  // 'referred' (sent away) are clinical notes only — they don't represent current chargeable production.
  var newSess = null;
  if (pendingTreatStatus === 'completed' || pendingTreatStatus === 'planned') {
    var _toothPayload = {
      doctor_id: currentUser.id, patient_id: patientId,
      type: pendingToothLabel, description: ledgerDescription,
      cost: cost, date: date, notes: notes, tooth_num: ledgerToothNum, surface: dbSurface,
      status: pendingTreatStatus,
      provider_id: pendingProviderId,
      treatment_key: getTreatment(pendingToothStatus) ? pendingToothStatus : null,   // v260
      currency: window.SyDentCurPick.read('toothCost')       // M125
    };
    if (units > 1) _toothPayload.units = units;   /* v425 (M150) */
    var rL = await window.sb.from('ledger_sessions').insert(_toothPayload).select().single();
    /* قبل M150: العمود غائب ⇒ يُعاد الحفظ بلا units بدل أن يضيع العلاج (نمط #250). */
    if (rL.error && _toothPayload.units && /\bunits\b/.test((rL.error.message || '') + ' ' + (rL.error.code || ''))) {
      delete _toothPayload.units;
      rL = await window.sb.from('ledger_sessions').insert(_toothPayload).select().single();
    }
    if (rL.error) {
      console.error('ledger insert error:', rL.error);
      showToast('⚠️ تسجيل الجلسة فشل: ' + rL.error.message);
    }
    newSess = rL.data;
    if (newSess) {
      sessions.unshift(newSess); sortByDateDesc(sessions);
      /* M145-b: وسمُ خياري الخطة تلقائياً (الأصلي أ، البديل التالي) — عرضيٌّ بحت. */
      if ((_sp.altBridge || _sp.altImplant) && typeof planTagAltBridge === 'function') {
        try {
          var _au = _sp.altBridge ? bridgeUnitForLedger : _sp.altUnit;
          var _sib = _sp.altImplant ? plannedAltImplantsForUnit(_au).filter(function(x){ return x.id !== newSess.id; }) : [];
          await planTagAltBridge(newSess, plannedBridgeSessionsForUnit(_au), _sib);
        } catch (e) { console.warn('planTagAltBridge:', e); }
      }
      // Phase 5: audit log (per-tooth treatment)
      if (window.logAudit) {
        window.logAudit('session.create', {
          entityId: newSess.id,
          patientId: patientId,
          patientName: (patient && patient.name) || '',
          description: 'إضافة جلسة (' + ledgerDescription + '): ' + pendingToothLabel + ' — ' + cost + ' ' + _rowLbl(newSess),
          newValue: { type: pendingToothLabel, cost: cost, date: date, status: pendingTreatStatus, provider_id: pendingProviderId, tooth_num: ledgerToothNum, surface: dbSurface }
        });
      }
    }
  }

  // Reallocate funds: if there was unearned credit, it auto-flows to this session.
  // Safe even when no session was created (early return inside the function).
  if (newSess) await reallocatePatientFunds();

  // 3. Update last_visit + status
  var updates = {};
  if (!patient.last_visit || date > patient.last_visit) updates.last_visit = date;
  if (patient.status === 'جديد') updates.status = 'تحت العلاج';
  if (Object.keys(updates).length) {
    await window.sb.from('patients').update(updates).eq('id', patientId).eq('doctor_id', currentUser.id);
    Object.assign(patient, updates);
  }

  renderTeeth(); renderStats(); renderInfo(); renderSessions(); renderRecentSessions(); renderPayments(); renderTimeline();
  closeModal('toothModal');
  // Build area label that reflects the type
  var areaLabelToast;
  if (currentSurface === COND_SURFACE) areaLabelToast = 'حالة سريرية';   /* v432: لا يُسرَّب رمزُ السطح الداخلي للطبيب */
  else if (currentSurface === 'WHOLE') areaLabelToast = 'السن كاملاً';
  else if (currentSurface === 'CROWN_FULL') areaLabelToast = 'التاج كامل';
  else if (isRootCode(currentSurface)) areaLabelToast = rootAreaLabelFor(currentSurface, currentTooth);
  else areaLabelToast = 'السطح ' + surfLabelFor(currentSurface, currentTooth);
  var _altTagged = (_sp.altBridge || _sp.altImplant) && newSess && typeof planOptOf === 'function' && planOptOf(newSess);
  if (_altTagged) showToast('🔀 أُضيف «' + pendingToothLabel + '» كـ«الخيار ' + PLAN_OPTION_LABELS[_altTagged] + '» — '
      + (_sp.altBridge ? 'بديلٌ للجسر ' + (bridgeUnitForLedger || []).join('، ') : 'زرعةٌ بديلة للجسر مكان السن ' + currentTooth));   /* M145-h */
  else showToast('✅ تمت إضافة ' + pendingToothLabel + ' للسن ' + currentTooth + ' (' + areaLabelToast + ')');
  // P3-B: الخصم التلقائي للمواد (مسار مخطّط الأسنان) — معزول داخل try/catch.
  // pendingToothStatus يحمل treatment.id (getTreatment يجده). يُتجاهل لو لا مادة.
  // بوّابة الحالة: المواد تُستهلك عند الإنجاز لا عند التخطيط — الجلسة المخطّطة
  // تطلب الخصم لاحقاً لحظة قلبها completed (completeSessionFromProfile /
  // الإكمال الجماعي بالمواعيد)، لا هنا. completed فقط يمرّ.
  try {
    if (pendingTreatStatus === 'completed' && pendingToothStatus && getTreatment(pendingToothStatus)) {
      await maybePromptMaterialDeduction(pendingToothStatus, pendingToothLabel, 1, newSess ? [newSess.id] : []);   /* M169 */
    }
  } catch (e) { console.warn('material deduction skipped (tooth):', e); }
}

var clearToothStatus = ppGuarded('clearToothStatus', _clearToothStatus_inner, '⏳');   /* v284: قفل + انشغال */
async function _clearToothStatus_inner() {
  var _wErr = false;   /* v285: كانت تُظهر توست نجاح حتى مع فشل كتابة (console فقط) */
  // Determine what surfaces to clear.
  // Logic:
  //   1. If the clicked surface has its own treatment_key → clear just that surface (+ crown_full overlay)
  //   2. If the clicked surface is empty but WHOLE/CROWN_FULL covers the tooth → clear that
  //   3. If the clicked surface is empty and nothing covers the whole tooth → clear ALL surfaces
  //      (this is the user trying to make the tooth healthy by clicking anywhere on it)
  var sm = teethMap[String(currentTooth)] || {};
  var surfacesToClear = [];

  // Collect all surfaces that have a treatment_key (skip __status meta)
  var allTreatedSurfaces = [];
  for (var k in sm) {
    if (k === '__status') continue;
    if (sm[k]) allTreatedSurfaces.push(k);
  }

  if (allTreatedSurfaces.length === 0) {
    /* v478: لا رسمَ على السن لكن قد تبقى علاجاتٌ مخطّطة بالسجل (تظهر بالتلميح «سجل الجلسات») —
       كانت الرسالة «سليم بالفعل» طريقاً مسدوداً. الآن نعرض حذفها؛ وإلا السلوك السابق حرفياً. */
    var _orph = plannedToothSessions(currentTooth, null);
    closeModal('toothModal');
    if (!_orph.length) { showToast('السن ' + currentTooth + ' سليم بالفعل'); return; }
    var _orphTooth = currentTooth;
    var _or = await askDeletePlannedToothSessions(_orph, 'لا يوجد رسمٌ على السن ' + _orphTooth + '، لكن '
      + (_orph.length === 1 ? 'عليه علاجٌ مخطّط بالسجل:' : 'عليه ' + _orph.length + ' علاجات مخطّطة بالسجل:'), 'هل تحذفها من السجل؟');
    if (!_or.want) { showToast('السن ' + _orphTooth + ' بلا رسم — بقيت العلاجات المخطّطة بالسجل'); return; }
    showToast(_or.deleted === _orph.length
      ? '✅ حُذف ' + (_or.deleted === 1 ? 'العلاج المخطّط' : _or.deleted + ' علاجات مخطّطة') + ' عن السن ' + _orphTooth
      : '⚠️ ' + (_or.deleted ? 'حُذف ' + _or.deleted + ' وتعذّر حذف الباقي' : 'تعذّر حذف العلاج المخطّط') + ' — تحقّق من الاتصال وأعد المحاولة');
    return;
  }

  // Bridge-aware routing (audit fix #5): clearing a bridge key per-tooth would
  // orphan the rest of the unit (the other abutment + the pontics). Hand off to
  // the unit-aware remover, which deletes ONLY the bridge rows across the whole
  // unit and keeps extractions and any other treatments intact.
  for (var _bk in sm) {
    if (_bk !== '__status' && isBridgeKey(sm[_bk])) {
      closeModal('toothModal');
      undoExtraction(currentTooth);
      return;
    }
  }

  // If the clicked surface itself has a treatment, prefer clearing that (+ WHOLE/CROWN_FULL if they cover the area)
  if (sm[currentSurface]) {
    surfacesToClear.push(currentSurface);
    /* v490: حالةٌ سريرية على السطح المنقور ⇒ يُزال **ذلك السطح وحده**. قاعدةُ «أزل غطاءَ
       التاج معه» صُمّمت لترميمٍ تحت تاج؛ الوسمُ السريريّ ليس جزءاً من التاج — كان «سليم»
       على قلحٍ دهليزيٍّ يحذف تاجَ السن معه (مراجعةُ الحالات السريرية بعد v489). */
    var _clrCond = (typeof isConditionKey === 'function') && isConditionKey(sm[currentSurface]);
    // Also clear WHOLE/CROWN_FULL if they represent a full-tooth/full-crown overlay
    if (!_clrCond && currentSurface !== 'WHOLE' && currentSurface !== 'CROWN_FULL' && !isRootCode(currentSurface)) {
      if (sm.WHOLE && surfacesToClear.indexOf('WHOLE') < 0) {
        var wt = getTreatment(sm.WHOLE);
        var wtp = wt ? (wt.target_part || 'whole') : null;
        if (wtp === 'crown_full' || wtp === 'whole') surfacesToClear.push('WHOLE');
      }
      if (sm.CROWN_FULL && surfacesToClear.indexOf('CROWN_FULL') < 0) surfacesToClear.push('CROWN_FULL');
    }
  } else {
    // Clicked surface is empty — clear EVERYTHING on this tooth
    surfacesToClear = allTreatedSurfaces;
  }

  // Build a friendly label for the confirmation
  var areaLabel;
  if (surfacesToClear.length === allTreatedSurfaces.length && allTreatedSurfaces.length > 1) {
    areaLabel = 'جميع علاجات السن';
  } else if (surfacesToClear.indexOf('WHOLE') >= 0 || surfacesToClear.indexOf('CROWN_FULL') >= 0) {
    areaLabel = 'تغطية التاج';
  } else if (surfacesToClear[0] === 'WHOLE') areaLabel = 'السن كاملاً';
  else if (surfacesToClear[0] === 'CROWN_FULL') areaLabel = 'التاج كامل';
  else if (isRootCode(surfacesToClear[0])) areaLabel = rootAreaLabelFor(surfacesToClear[0], currentTooth);
  else areaLabel = 'السطح ' + surfLabelFor(surfacesToClear[0], currentTooth);

  /* v478: العلاجات المخطّطة على المنطقة المُزالة — الرسمُ وحده كان يُحذف وتبقى خطتُها بالسجل بلا رسم
     (M145-l عالج الجسر فقط). إزالةٌ كاملة للسن ⇒ كلُّ مخطّطات السن (ومنها يتيمةٌ بلا صف)؛ وإلا مخطّطاتُ الأسطح المُزالة. */
  var _fullClear = (surfacesToClear.length === allTreatedSurfaces.length);
  var _plSess = plannedToothSessions(currentTooth, _fullClear ? null : surfacesToClear);
  /* v482: والمنجزة كذلك — لكن بدقّةٍ أعلى: فقط الجلسات التي يمثّلها صفٌّ منجز يُزال الآن (السطح + العلاج نفسه)،
     لا تاريخُ السن كلّه (منجزٌ أُبقي سابقاً بلا رسم لا يُعاد السؤال عنه). حذفُها قرارٌ ماليّ ⇒ للمالك وحده
     (نظير صلاحية حذف الإجراء المنجز بـOpenDental)؛ غيره: الرسمُ يُزال والجلسة تبقى. */
  var _doneSess = completedToothSessionsForRows(currentTooth, surfacesToClear.map(function(sk){
    return { sf: sk, key: sm[sk], st: (sm.__status && sm.__status[sk]) || 'completed' };
  }));
  var _clrNote = removalSessionsNote(_plSess.length, _doneSess.length);
  if (!await SyDialog.confirm({ message: 'هل تريد إزالة العلاج من ' + areaLabel + ' للسن ' + currentTooth + '؟' + _clrNote, danger: true })) return;

  // Delete each surface from DB + memory
  for (var s=0; s<surfacesToClear.length; s++) {
    var sk = surfacesToClear[s];
    var dr = await window.sb.from('teeth_status').delete()
      .eq('patient_id', patientId)
      .eq('tooth_num', String(currentTooth))
      .eq('surface', sk);
    if (dr.error) { console.error('clear surface ' + sk + ' error:', dr.error); _wErr = true; }
    if (teethMap[String(currentTooth)]) {
      delete teethMap[String(currentTooth)][sk];
      // Also clear the status meta for this surface
      if (teethMap[String(currentTooth)].__status) {
        delete teethMap[String(currentTooth)].__status[sk];
      }
    }
  }
  // Clean up if tooth is now fully empty (only __status meta left, or nothing)
  if (teethMap[String(currentTooth)]) {
    var remaining = [];
    for (var rk in teethMap[String(currentTooth)]) {
      if (rk !== '__status' && teethMap[String(currentTooth)][rk]) remaining.push(rk);
    }
    if (remaining.length === 0) delete teethMap[String(currentTooth)];
  }
  renderTeeth();
  closeModal('toothModal');
  if (_wErr) { showToast('⚠️ تمّ جزئياً — بعض الخطوات لم تُحفظ، تحقّق من الاتصال وأعد المحاولة'); return; }
  var _clrTooth = currentTooth;
  var _fu = await followUpRemovedSessions(_plSess, _doneSess, 'أُزيل الرسم. هل تريد حذف '
    + (_plSess.length === 1 ? 'العلاج المخطّط' : 'العلاجات المخطّطة (' + _plSess.length + ')') + ' من السجل أيضاً؟');
  if (_fu.warn) { showToast(removalToast('', 'أُزيل الرسم', _fu)); return; }
  showToast(_fu.parts.length
    ? '✅ ' + areaLabel + ' للسن ' + _clrTooth + ' أصبح سليماً — ' + _fu.parts.join(' · ')
    : '🔄 ' + areaLabel + ' للسن ' + _clrTooth + ' أصبح سليماً');
}

/* v478: العلاجاتُ المخطّطة على سنٍّ واحد (لا جلسات الوحدات: جسر/حافظ/وهمي — لها مسارها M145-l).
   surfaces = null ⇒ كلُّ مخطّطات السن؛ وإلا المطابِقة لأسطحها (سطحُ الجلسة الفارغ = السطح الأوسط). */
function plannedToothSessions(num, surfaces, skipKey) {
  var tn = String(num);
  return (typeof sessions !== 'undefined' && sessions ? sessions : []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'planned') return false;
    if (String(x.tooth_num || '') !== tn || isUnitLedgerSession(x)) return false;
    if (skipKey && skipKey(sessionTreatmentKey(x))) return false;   /* v488: مفتاحٌ يبقى مرسوماً بعد الإزالة */
    return !surfaces || surfaces.indexOf(x.surface || centerSurface(num)) >= 0;
  });
}
/* v488: مساراتُ الإزالة كلها (سليم · إلغاء القلع · إزالة الزراعة · موقع القلع · حافظ المسافة · الجسر) تتشارك
   هذه الأدوات: السؤالُ عن المخطّطة ثم عن المنجزة (المالك وحده)، والنصّ والتوست بصيغةٍ واحدة. */
function canDeleteCompletedSessions() {
  return !window.SyDentLock || typeof window.SyDentLock.isOwner !== 'function' || window.SyDentLock.isOwner();
}
/* صفوفُ المخطط التي ستُزال: {sf, key, st} — تُلتقط **قبل** الحذف. */
function removedRowsOf(sm, surfaces) {
  return (surfaces || []).filter(function(k){ return sm && sm[k]; }).map(function(k){
    return { sf: k, key: sm[k], st: (sm.__status && sm.__status[k]) || 'completed' };
  });
}
/* جلساتُ وحدةٍ (حافظ/جسر) على مجموعة الأسنان نفسها — status + مُرشِّح المفتاح. */
function unitSessionsFor(unit, status, keyOk) {
  if (!unit || unit.length < 2) return [];
  return (typeof sessions !== 'undefined' && sessions ? sessions : []).filter(function(x){
    if (!x || (x.status || 'completed') !== status) return false;
    if (String(x.tooth_num || '').indexOf(',') === -1 || !_sameToothSet(x.tooth_num, unit)) return false;
    return keyOk(sessionTreatmentKey(x));
  });
}
/* سطرُ التأكيد الأول: يسمّي ما سيُسأل عنه بعد الإزالة. */
function removalSessionsNote(plN, doneN) {
  var askDone = doneN && canDeleteCompletedSessions();
  return (plN && askDone) ? '\n(بعد الإزالة نسألك عن حذف العلاجات المخطّطة ثم الجلسات المنجزة من السجل)'
    : plN ? '\n(بعد الإزالة نسألك عن حذف العلاجات المخطّطة من السجل — المنجزة تبقى في كشف الحساب)'
    : askDone ? '\n(بعد الإزالة نسألك إن كنت تريد حذف الجلسة المنجزة من السجل أيضاً)'
    : '\n(لن تُحذف الجلسة المسجلة في كشف الحساب)';
}
/* بعد نجاح الإزالة: المخطّط أولاً ثم المنجز — كلٌّ بنافذته فلا يختلط قرارُ تخطيطٍ بقرارٍ ماليّ.
   يعيد {parts, warn} ليصوغ كلُّ مسارٍ توسته بنفسه. */
async function followUpRemovedSessions(pl, done, plLead) {
  var parts = [], warn = false;
  if (pl && pl.length) {
    var r = await askDeletePlannedToothSessions(pl, plLead, null);
    if (r.want) {
      if (r.deleted === pl.length) parts.push('حُذف ' + (r.deleted === 1 ? 'العلاج المخطّط' : r.deleted + ' علاجات مخطّطة'));
      else { warn = true; parts.push(r.deleted ? 'حُذف ' + r.deleted + ' مخطّط وتعذّر حذف الباقي' : 'تعذّر حذف العلاج المخطّط'); }
    }
  }
  if (done && done.length) {
    if (!canDeleteCompletedSessions()) parts.push('بقيت الجلسة المنجزة بالسجل — حذفها يحتاج صلاحية المالك');
    else {
      var d = await askDeleteCompletedToothSessions(done);
      if (d.want) {
        if (d.deleted === done.length) parts.push('حُذف ' + (d.deleted === 1 ? 'العلاج المنجز' : d.deleted + ' علاجات منجزة') + ' من السجل');
        else { warn = true; parts.push(d.deleted ? 'حُذف ' + d.deleted + ' منجز وتعذّر حذف الباقي' : 'تعذّر حذف العلاج المنجز'); }
      }
    }
  }
  return { parts: parts, warn: warn };
}
/* توستُ الختام الموحّد: فشلُ حذفٍ ⇒ ⚠️ مكان أيقونة النجاح (#651)؛ وإلا الأيقونة + نصُّ المسار + ما حُذف. */
function removalToast(okIcon, base, fu) {
  if (fu.warn) return '⚠️ ' + base + ' — ' + fu.parts.join(' · ') + ' — تحقّق من الاتصال وأعد المحاولة';
  return okIcon + ' ' + base + (fu.parts.length ? ' — ' + fu.parts.join(' · ') : '');
}
/* موضعُ الجلسة بسطر القائمة: وحدةٌ ⇒ أسنانها؛ وإلا السطح (ما عدا السن كاملاً). */
function _removalSessWhere(x) {
  if (isUnitLedgerSession(x)) return ' / الأسنان ' + String(x.tooth_num || '').split(',').join('، ');
  return (x.surface && x.surface !== 'WHOLE') ? ' / ' + surfLabelFor(x.surface, x.tooth_num) : '';
}
/* v482: الجلساتُ المنجزة التي تمثّلها صفوفُ المخطط المُزالة — الصفُّ منجز (status completed) والجلسةُ منجزة على
   السن نفسه والسطح نفسه وبالعلاج نفسه (sessionTreatmentKey). جلسةٌ بلا مفتاحٍ معروف لا تُعرض (تحفّظ). */
function completedToothSessionsForRows(num, rows) {
  var tn = String(num);
  var done = (rows || []).filter(function(r){ return r && r.key && r.st === 'completed'; });
  if (!done.length) return [];
  return (typeof sessions !== 'undefined' && sessions ? sessions : []).filter(function(x){
    if (!x || (x.status || 'completed') !== 'completed') return false;
    if (String(x.tooth_num || '') !== tn || isUnitLedgerSession(x)) return false;
    var xs = x.surface || centerSurface(num), xk = sessionTreatmentKey(x);
    return !!xk && done.some(function(r){ return r.sf === xs && r.key === xk; });
  });
}
/* نافذةُ «الجلسات المنجزة»: التاريخ والتكلفة والمدفوع عليها؛ «أبقِها» هو الزرّ المُركَّز افتراضياً (danger). */
async function askDeleteCompletedToothSessions(list) {
  var lines = list.map(function(x){
    var sf = _removalSessWhere(x);
    var dt = x.date ? ' — ' + ((window.SyDT && window.SyDT.numDate(x.date)) || String(x.date).slice(0, 10)) : '';
    var paid = (typeof computeSessionPaid === 'function') ? computeSessionPaid(x.id) : 0;
    return '   – ' + (x.type || x.description || 'علاج') + sf + dt + ' — ' + fmt(x.cost || 0) + ' ' + curLblOf(_rowCur(x))
      + (paid > 0 ? ' (مدفوع عليها ' + fmt(paid) + ')' : '');
  }).join('\n');
  var anyPaid = list.some(function(x){ return typeof computeSessionPaid === 'function' && computeSessionPaid(x.id) > 0; });
  var msg = 'هل تريد حذف ' + (list.length === 1 ? 'العلاج المنجز' : 'العلاجات المنجزة (' + list.length + ')') + ' من السجل أيضاً؟\n\n' + lines
    + (list.some(function(x){ return !!x.appointment_id; }) ? '\n\n⚠️ منها ما هو مربوط بموعد — الموعد يبقى بالتقويم بلا هذا البند.' : '')
    + '\n\nهذا قرارٌ ماليّ: تُحذف القيمة من كشف الحساب والإنتاج'
    + (anyPaid ? '، وما دُفع عليها لا يضيع — يُعاد توزيعه على جلسات المريض الأخرى أو يصير رصيداً مقدّماً له.' : '.')
    + '\n\nإن اخترت «أبقِها» يبقى العلاج المنجز بالسجل بلا رسمٍ على المخطط.';
  if (!await SyDialog.confirm({ title: 'الجلسات المنجزة', message: msg, confirmText: 'احذفها', cancelText: 'أبقِها', danger: true })) {
    return { want: false, deleted: 0 };
  }
  return { want: true, deleted: await deleteToothSessions(list) };
}
/* الحذفُ عبر delSession القائم (إعادة التوزيع + التدقيق + مزامنة المخطط)؛ العدُّ من طول sessions (#651). */
async function deleteToothSessions(list) {
  var deleted = 0;
  for (var i = 0; i < list.length; i++) {
    var before = sessions.length;
    await delSession(list[i].id, { skipConfirm: true });
    if (sessions.length < before) deleted++;
  }
  return deleted;
}
/* نافذةُ «احذفها/أبقِها» بنمط M145-l حرفياً؛ الحذفُ عبر delSession القائم (إعادة التوزيع + التدقيق +
   مزامنة المخطط). يعيد {want, deleted} — العدُّ من طول sessions لا من نجاح مفترض (قاعدة #651). */
async function askDeletePlannedToothSessions(list, lead, tail) {
  var lines = list.map(function(x){
    var sf = _removalSessWhere(x);
    var opt = (typeof planOptOf === 'function' && planOptOf(x)) ? ' [خيار ' + PLAN_OPTION_LABELS[planOptOf(x)] + ']' : '';
    return '   – ' + (x.type || x.description || 'علاج') + sf + ' — ' + fmt(x.cost || 0) + ' ' + curLblOf(_rowCur(x)) + opt;
  }).join('\n');
  var msg = lead + '\n\n' + lines
    + (list.some(function(x){ return !!x.appointment_id; }) ? '\n\n⚠️ منها ما هو مربوط بموعد — الموعد يبقى بالتقويم بلا هذا البند.' : '')
    + (tail ? '\n\n' + tail : '\n\nإن اخترت «أبقِها» تبقى الجلسة بالسجل بلا رسمٍ على المخطط.');
  if (!await SyDialog.confirm({ title: 'العلاجات المخطّطة', message: msg, confirmText: 'احذفها', cancelText: 'أبقِها', danger: true })) {
    return { want: false, deleted: 0 };
  }
  return { want: true, deleted: await deleteToothSessions(list) };
}

/* ─── D3 ─── */

/* ══════════ Backlog #8 (M91): سجل الزرعة — Implant Log ══════════
   CareStack Implant Tracker parity. Documentation layer ONLY:
   zero financial writes, zero chart geometry changes. Lazy fetch +
   per-patient cache; graceful pre-M91 (42P01/PGRST205 → toast). */
var implantLogCache = null;          // all rows for this patient (newest first) — null = not fetched yet
var implantLogTooth = null;          // FDI tooth (string) the modal is open for

/* قوالب سجل الزرعات (نظير POST_OP_TEMPLATES) — قوالب المالك المشتركة عبر كل المرضى */
var IMPLANT_TEMPLATES = [];
var _implantEditingTemplateId = null;
var _saveImplantTplInFlight = false;

function _isImplantTplTableMissing(err) {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  return String(err.message || '').toLowerCase().indexOf('implant_templates') !== -1;
}

function _isImplantLogTableMissing(err) {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true; // undefined_table / not in schema cache
  var m = (err.message || '').toLowerCase();
  return m.indexOf('implant_log') !== -1
      && (m.indexOf('does not exist') !== -1
       || m.indexOf('not found') !== -1
       || m.indexOf('schema cache') !== -1
       || m.indexOf('relation') !== -1);
}

async function _fetchImplantLog() {
  if (implantLogCache !== null) return implantLogCache;
  var res = await window.sb.from('implant_log')
    .select('*')
    .eq('owner_id', currentUser.id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (res.error) throw res.error;
  implantLogCache = res.data || [];
  return implantLogCache;
}

/* Compact spec line: "Straumann BLT — ⌀4.1×10 مم — Ref: X — Lot: Y" (escaped, empty parts skipped) */
function _implantSpecLine(r) {
  var parts = [];
  if (r.brand) parts.push(escapeHtml(r.brand));
  var dim = '';
  if (r.diameter !== null && r.diameter !== undefined && r.diameter !== '') dim += '⌀' + escapeHtml(String(r.diameter));
  if (r.length !== null && r.length !== undefined && r.length !== '') dim += (dim ? '×' : '') + escapeHtml(String(r.length));
  if (dim) parts.push(dim + ' مم');
  if (r.ref_no) parts.push('Ref: ' + escapeHtml(r.ref_no));
  if (r.lot_no) parts.push('Lot: ' + escapeHtml(r.lot_no));
  // bidi isolate: سلسلة تقنية لاتينية-الطابع (Ref/Lot/⌀/أرقام + «مم») داخل بطاقة RTL
  // كانت تُعاد ترتيب مقاطعها بصرياً. dir=ltr + isolate = قراءة منطقية ثابتة. البيانات لا تتغيّر.
  return parts.length ? '<span dir="ltr" style="unicode-bidi:isolate;">' + parts.join(' — ') + '</span>' : '';
}

function renderImplantLog() {
  var box = document.getElementById('implantLogList');
  var rows = (implantLogCache || []).filter(function(r){ return String(r.tooth_num) === String(implantLogTooth); });
  if (!rows.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:12.5px;padding:8px 0;">لا سجلات محفوظة لهذا السن بعد.</div>';
    return;
  }
  var html = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">السجلات المحفوظة (' + rows.length + ')</div>';
  rows.forEach(function(r){
    var dates = [];
    if (r.placed_at) dates.push('زرع: ' + escapeHtml(fmtD(r.placed_at)));
    if (r.loaded_at) dates.push('تحميل: ' + escapeHtml(fmtD(r.loaded_at)));
    html += '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg2);">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">'   /* v487: الزرُّ سطرٌ كامل بالهاتف */
          + '<div style="font-size:13px;font-weight:700;color:var(--text);">' + (_implantSpecLine(r) || '—') + '</div>'
          + '<div class="sy-acts"><button type="button" class="sy-act sy-act-danger" onclick="deleteImplantLog(\'' + r.id + '\')" title="حذف السجل">🗑️ حذف</button></div>'   /* v487 */
          + '</div>'
          + (dates.length ? '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + dates.join(' · ') + '</div>' : '')
          + (r.notes ? '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + escapeHtml(r.notes) + '</div>' : '')
          + '</div>';
  });
  box.innerHTML = html;
}

/* ═══ Backlog #6 (M94): family linking — نُقلت الوحدة كاملة إلى pp-modules.js ضمن مشروع تفكيك الملف (26 تموز 2026) ═══ */

/* Patient-wide implants card (الملف tab) — CareStack Implant Tracker grid parity.
   Hidden when the patient has no records; each row opens the per-tooth modal. */
function renderImplantCard() {
  var card = document.getElementById('implantsCard');
  var list = document.getElementById('implantsCardList');
  if (!card || !list) return;
  var rows = implantLogCache || [];
  if (!rows.length) { card.style.display = 'none'; list.innerHTML = ''; return; }
  var cnt = document.getElementById('implantsCardCount');
  if (cnt) cnt.textContent = '(' + rows.length + ')';
  var html = '';
  rows.forEach(function(r){
    var dates = [];
    if (r.placed_at) dates.push('زرع: ' + escapeHtml(fmtD(r.placed_at)));
    if (r.loaded_at) dates.push('تحميل: ' + escapeHtml(fmtD(r.loaded_at)));
    html += '<div onclick="openImplantLog(\'' + escapeHtml(String(r.tooth_num)) + '\')" '
          + 'style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg2);cursor:pointer;" '
          + 'title="فتح سجل الزرعة للسن ' + escapeHtml(String(r.tooth_num)) + '">'
          + '<div style="font-size:13px;font-weight:700;color:var(--text);">'
          + '<span class="tone tone-purple" style="display:inline-block;border-width:1px;border-style:solid;font-size:11px;font-weight:800;padding:0 7px;border-radius:5px;margin-left:6px;">السن ' + escapeHtml(String(r.tooth_num)) + '</span>'
          + (_implantSpecLine(r) || '—')
          + '</div>'
          + (dates.length ? '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + dates.join(' · ') + '</div>' : '')
          + (r.notes ? '<div style="font-size:12px;color:var(--text2);margin-top:3px;">' + escapeHtml(r.notes) + '</div>' : '')
          + '</div>';
  });
  list.innerHTML = html;
  card.style.display = 'block';
}

/* آخر جلسة زراعة مكتملة لسنٍّ محدد → YYYY-MM-DD أو null (توثيق فقط، صفر كتابة) */
function _implantAutoPlacedDate(tooth) {
  if (typeof sessions === 'undefined' || !sessions || !sessions.length) return null;
  var best = null;
  sessions.forEach(function(s){
    if (String(s.tooth_num) !== String(tooth)) return;
    if ((s.status || 'completed') !== 'completed') return;
    var isImp = (typeof isImplantKey === 'function' && isImplantKey(s.treatment_key))
             || String(s.type || '').indexOf('زراعة') !== -1;
    if (!isImp || !s.date) return;
    if (!best || String(s.date) > best) best = String(s.date);
  });
  return best;
}

async function openImplantLog(toothArg) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: سجلُّ الزرعة نموذجُ كتابة */
  // toothArg: optional — passed by the patient-wide implants card rows.
  // Without it (tooth-modal banner path) we read the modal's currentTooth.
  var _t = (toothArg !== undefined && toothArg !== null && toothArg !== '') ? toothArg : currentTooth;
  if (_t === null || _t === undefined) return;
  implantLogTooth = String(_t);
  document.getElementById('implantModalTitle').textContent = '🦴 سجل الزرعة — السن ' + implantLogTooth;
  // fresh form
  ['ilBrand','ilRef','ilLot','ilDiameter','ilLength','ilPlaced','ilLoaded','ilNotes'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  /* تعبئة تلقائية لتاريخ الزرع من آخر جلسة زراعة مكتملة لنفس السن —
     اقتراح قابل للتعديل فقط؛ الحفظ لا يتغيّر. المطابقة عبر isImplantKey
     + fallback على النص (الجلسات القديمة treatment_key = null). */
  var _autoPlaced = _implantAutoPlacedDate(implantLogTooth);
  if (_autoPlaced) { var _ilp = document.getElementById('ilPlaced'); if (_ilp) _ilp.value = _autoPlaced; }
  closeModal('toothModal');   // same modal-transition pattern as the lab flow
  try {
    await _fetchImplantLog();
  } catch (e) {
    if (_isImplantLogTableMissing(e)) { showToast('⚠️ يلزم Migration 91 لتفعيل سجل الزرعة'); return; }
    console.error('openImplantLog:', e);
    showToast('⚠️ تعذّر تحميل سجل الزرعة');
    return;
  }
  renderImplantLog();
  // قوالب الزرعات: تحميل كسول + تعبئة البيكر + تصفير خانة الحفظ-كقالب (نظير postop)
  if (!IMPLANT_TEMPLATES.length) { try { await loadImplantTemplates(); } catch (e) {} }
  var _isaOpen = document.getElementById('implantSaveAsTemplate'); if (_isaOpen) _isaOpen.checked = false;
  var _itngOpen = document.getElementById('implantTemplateNameGroup'); if (_itngOpen) _itngOpen.style.display = 'none';
  implantPopulateTemplatePicker();
  openModal('implantModal');
}

var saveImplantLog = ppGuarded('saveImplantLog', _saveImplantLog_inner, 'جارٍ الحفظ…');   /* v284: قفل + انشغال */
async function _saveImplantLog_inner() {
  // Phase 4.1 pattern: defense-in-depth — block if locked doctor is inactive
  if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) {
    showToast('🔒 حسابك غير نشط — لا يمكن تسجيل سجلات جديدة');
    return;
  }
  if (!implantLogTooth) return;
  var brand   = document.getElementById('ilBrand').value.trim();
  var refNo   = document.getElementById('ilRef').value.trim();
  var lotNo   = document.getElementById('ilLot').value.trim();
  var diaRaw  = parseFloat(document.getElementById('ilDiameter').value);
  var lenRaw  = parseFloat(document.getElementById('ilLength').value);
  var placed  = document.getElementById('ilPlaced').value;
  var loaded  = document.getElementById('ilLoaded').value;
  var notes   = document.getElementById('ilNotes').value.trim();
  if (!brand && !refNo && !lotNo && !placed && !loaded && !notes && !(diaRaw > 0) && !(lenRaw > 0)) {
    showToast('أدخل تفصيلاً واحداً على الأقل'); return;
  }
  try {
    var ins = await window.sb.from('implant_log').insert({
      owner_id: currentUser.id,
      patient_id: patientId,
      tooth_num: implantLogTooth,
      brand: brand || null,
      ref_no: refNo || null,
      lot_no: lotNo || null,
      diameter: (diaRaw > 0) ? diaRaw : null,
      length: (lenRaw > 0) ? lenRaw : null,
      placed_at: placed || null,
      loaded_at: loaded || null,
      notes: notes || null
    }).select().single();
    if (ins.error) throw ins.error;
    implantLogCache = null;   // invalidate → next open refetches (covers other-device edits too)
    await _fetchImplantLog();
    try { if (typeof logAudit === 'function') await logAudit('implant_log.create', { entityType: 'implant_log', entityId: ins.data && ins.data.id, patientId: patientId, patientName: (patient && patient.name) || null, description: 'السن ' + implantLogTooth + (brand ? ' — ' + brand : '') }); } catch(e){}
    // قوالب الزرعات: خانة «احفظ كقالب» مفعّلة → أنشئ قالباً من نفس المواصفة.
    // try/catch منفصل + toast موحّد: فشل القالب لا يمسّ نجاح حفظ السجل الأساسي (السجل محفوظ فعلاً).
    var _isaSave = document.getElementById('implantSaveAsTemplate');
    var _tplMsg = '';
    if (_isaSave && _isaSave.checked) {
      var _tplName = (document.getElementById('implantTemplateName').value || '').trim();
      if (!_tplName) {
        _tplMsg = '⚠️ حُفظ السجل — اكتب اسم القالب لحفظه';
      } else {
        try {
          var _tplIns = await window.sb.from('implant_templates').insert({
            owner_id: currentUser.id, name: _tplName,
            brand: brand || null, ref_no: refNo || null,
            diameter: (diaRaw > 0) ? diaRaw : null, length: (lenRaw > 0) ? lenRaw : null,
            notes: notes || null
          });
          if (_tplIns.error) throw _tplIns.error;
          await loadImplantTemplates();
          implantPopulateTemplatePicker();
          _tplMsg = '✅ حُفظ السجل والقالب';
        } catch (te) {
          if (_isImplantTplTableMissing(te)) _tplMsg = '⚠️ حُفظ السجل — لكن يلزم Migration 99 لحفظ القالب';
          else { console.error('save implant template:', te); _tplMsg = '⚠️ حُفظ السجل — تعذّر حفظ القالب'; }
        }
      }
    }
    ['ilBrand','ilRef','ilLot','ilDiameter','ilLength','ilPlaced','ilLoaded','ilNotes'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.value = '';
    });
    if (_isaSave) _isaSave.checked = false;
    var _itngSave = document.getElementById('implantTemplateNameGroup'); if (_itngSave) _itngSave.style.display = 'none';
    var _itpSave = document.getElementById('implantTemplatePick'); if (_itpSave) _itpSave.value = '';
    renderImplantLog();
    renderImplantCard();
    showToast(_tplMsg || '✅ حُفظ سجل الزرعة');
  } catch (e) {
    if (_isImplantLogTableMissing(e)) { showToast('⚠️ يلزم Migration 91 لتفعيل سجل الزرعة'); return; }
    console.error('saveImplantLog:', e);
    showToast('⚠️ تعذّر حفظ السجل');
  }
}

var deleteImplantLog = ppGuarded('deleteImplantLog', _deleteImplantLog_inner, 'جارٍ الحذف…');   /* v284: قفل + انشغال */
async function _deleteImplantLog_inner(id) {
  if (!await SyDialog.confirm({ message: 'حذف هذا السجل نهائياً؟', danger: true })) return;
  try {
    // Resolve tooth/brand from cache BEFORE delete for a meaningful audit description.
    var _delRow = (implantLogCache || []).filter(function(r){ return r.id === id; })[0] || null;
    var _delDesc = _delRow ? ('السن ' + _delRow.tooth_num + (_delRow.brand ? ' — ' + _delRow.brand : '')) : null;
    var del = await window.sb.from('implant_log').delete().eq('id', id).eq('owner_id', currentUser.id);
    if (del.error) throw del.error;
    try { if (typeof logAudit === 'function') await logAudit('implant_log.delete', { entityType: 'implant_log', entityId: id, patientId: patientId, patientName: (patient && patient.name) || null, description: _delDesc }); } catch(e){}
    implantLogCache = null;
    await _fetchImplantLog();
    renderImplantLog();
    renderImplantCard();
    showToast('تم الحذف');
  } catch (e) { console.error('deleteImplantLog:', e); showToast('⚠️ تعذّر الحذف'); }
}


/* ═══════════════ عدد الوحدات (M150 · v425) ═══════════════
   «أشعة ×4» و«جلسة تبييض ×3» كانت تُدمج بالسعر فيضيع العدد. الآن حقلٌ اختياري
   بمودال العلاج يضرب سعر الوحدة لحظة الإدخال، ويُخزَّن العددُ **عرضياً** بينما يبقى
   `cost` **الإجمالي** كما كان — فلا يدخل units أيَّ حساب (قاعدة المالك #5).
   يظهر للعلاجات القابلة للتعدّد فقط: لا لسنٍّ بعينه (تاج/حشوة = وحدة واحدة بحكم
   السن) ولا للجسر (وحداته مشتقّة من tooth_num) ولا للتقويم (مدّته بالأشهر). */
/* v428 (M151): المفتاح صريحٌ بتعريف العلاج (`accepts_units`) لا مستنتَجٌ من التصنيف —
   نمطُ Open Dental («Unit Quantity» على مستوى الإجراء) وDenticon/Dentrix Ascend (سلوكُ
   الإدخال يُضبط للإجراء نفسه). الربطُ بالتصنيف (v425–v427) كان يحمّل التصنيفَ — وهو
   للتقارير والألوان — مسؤوليةَ سلوكِ الإدخال، ويحجب الحقلَ عن علاجاتٍ تحتاجه فعلاً
   (تقليحٌ بأربعة أرباع · معالجةٌ لبية متعددة الجذور). التصنيفاتُ الأربعة السابقة
   شُغّلت لها الراية بالهجرة فلا يتغيّر شيءٌ بالعيادات القائمة.
   احتياطٌ للعيادات قبل M151 (الرايةُ غائبةٌ من كل الصفوف ⇒ الحقل يختفي كلياً): يُرجَع
   إلى التصنيفات الأربعة حتى تُطبَّق الهجرة. */
var TU_CATS = { diagnostic: 1, preventive: 1, cosmetic: 1, other: 1 };
function tuHasFlagColumn() {
  var list = (typeof TREATMENTS !== 'undefined' && TREATMENTS) ? TREATMENTS : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && Object.prototype.hasOwnProperty.call(list[i], 'accepts_units')) return true;
  }
  return false;
}
function tuAccepts(tr) {
  if (!tr) return false;
  if (isExtractionKey(tr.id) || isImplantKey(tr.id)) return false;
  if (tuHasFlagColumn()) return tr.accepts_units === true;
  return Object.prototype.hasOwnProperty.call(TU_CATS, String(tr.category || 'other'));
}
var _tuBase = 0, _tuOn = false;
function toothUnitsSetup(tr, basePrice) {
  var g = document.getElementById('toothUnitsGroup'), inp = document.getElementById('toothUnits');
  _tuBase = Number(basePrice || 0);
  _tuOn = tuAccepts(tr);
  if (inp) inp.value = '1';
  if (g) g.style.display = _tuOn ? '' : 'none';
  toothUnitsHint();
}
/* سعرُ الوحدة تغيّر (تبديلُ الطبيب) — يُعاد الضرب بالعدد القائم بلا لمس العدد. */
function toothUnitsRebase(basePrice) {
  _tuBase = Number(basePrice || 0);
  if (_tuOn) toothUnitsChanged(); else toothUnitsHint();
}
function toothUnitsValue() {
  if (!_tuOn) return 1;
  var inp = document.getElementById('toothUnits');
  var n = inp ? parseInt(inp.value, 10) : 1;
  return (n >= 1 && n <= 99) ? n : 1;
}
function toothUnitsChanged() {
  if (!_tuOn) return;
  var n = toothUnitsValue(), costEl = document.getElementById('toothCost');
  if (costEl && _tuBase > 0) costEl.value = String(_tuBase * n);
  toothUnitsHint();
}
function toothUnitsHint() {
  var h = document.getElementById('toothUnitsHint');
  if (!h) return;
  var n = toothUnitsValue();
  if (!_tuOn || n <= 1 || !(_tuBase > 0)) { h.style.display = 'none'; h.textContent = ''; return; }
  h.style.display = '';
  h.textContent = n + ' × ' + fmt(_tuBase) + ' = ' + fmt(_tuBase * n) + ' ' + (typeof curLblOf === 'function' ? curLblOf(window.SyDentCurPick.read('toothCost')) : '');
}
/* العدد المعروض لبندٍ ما: المخزَّن، أو وحدات الجسر المشتقّة من أسنانه. */
function sessUnitsOf(s) {
  if (!s) return 1;
  var u = parseInt(s.units, 10);
  if (u >= 2 && u <= 99) return u;
  var t = String(s.tooth_num || '');
  if (t.indexOf(',') > -1) {
    var n = t.split(',').filter(function (x) { return String(x).trim(); }).length;
    if (n >= 2) return n;
  }
  return 1;
}
