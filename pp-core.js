/* ═══════════════════════════════════════════════════════════════
   pp-core.js — الطباعة + الأدوات + كتالوج العلاجات
   (تفكيك patient-profile — الاستخراج ١٣: قصّتان، 393 سطراً بايت-بايت)

   القسم أ: سجل المريض للطباعة بنسختيه (بلا أسعار / بالأسعار) —
   قراءة مالية فقط، صفر كتابة على جداول المال.
   القسم ب: ثوابت المخابر · أدوات التنسيق · كتالوج العلاجات.

   جذع تنفيذي وحيد ومقصود: var TREATMENTS = JSON.parse(localStorage…)
   — مكتفٍ ذاتياً (localStorage + _sanHex المعرّفة أعلاه بنفس الملف)،
   تنفيذه الأبكر مكافئ تماماً. عدا ذلك تعريفات صرفة (درس v50).
   الحالة المشتركة (sessions · payments · paymentSplits · patient …)
   تبقى بالكتلة الرئيسية — الوصول runtime حصراً.

   ⚠️ مرآة محروسة بـscripts/check-mirrors.js:
   • fmtDNum + ppYmdLocal ↔ prmFmtNum/… (retargeted من patient-profile.html)
   ═══════════════════════════════════════════════════════════════ */


/* ============================================================
   Phase 9.1 — Patient Record Printout / Save as PDF
   Pure client-side: builds a print-optimized RTL document from
   in-memory data and uses the browser print dialog (→ Save as PDF).
   No library → flawless Arabic rendering. Fee-toggle: patient copy
   (no money) vs internal archive (with costs + payments).
   ============================================================ */
async function openPrintChoice(){
  if (!patient) { showToast('لم يكتمل تحميل بيانات المريض بعد'); return; }
  if (!CLINIC_SETTINGS_WA) { try { await ppLoadClinicSettings(); } catch(e){} }
  // M91: prefetch implant log so the (sync) buildPrintHtml can include it.
  // Any failure (incl. pre-M91 missing table) → section is simply skipped.
  try { await _fetchImplantLog(); } catch(e){}
  openModal('printChoiceModal');
}

function _ppSessionStatusAr(s){
  return ({ planned:'مخطّط', completed:'مكتمل', existing:'موجود', referred:'محوّل' })[s] || (s || '—');
}
function _ppGenderAr(g){
  return ({ male:'ذكر', female:'أنثى' })[g] || (g || '—');
}
function _ppRow(label, value){
  if (value === null || value === undefined || value === '') return '';
  return '<tr><td style="padding:5px 10px;color:#555;width:140px;border:1px solid #ddd;background:#f7f7f7;">' +
         escapeHtml(label) + '</td><td style="padding:5px 10px;border:1px solid #ddd;">' + escapeHtml(String(value)) + '</td></tr>';
}

function buildPrintHtml(withPrices){
  var clinic = (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.clinic_name) || 'عيادتنا';
  var today  = SyDT.numDate(new Date());   // v487: أرقاماً
  var docMap = {}; (window.CLINIC_DOCTORS_ALL || CLINIC_DOCTORS || []).forEach(function(d){ docMap[d.id] = d.name; });

  /* قاعدة #481: هذا كشفُ حسابٍ يُطبع ويُسلَّم للمريض. جمعُ جلسة الدولار مع
   * جلسة الليرة برقمٍ واحد ثم طبعُه تحت وسم العيادة يعطيه مستنداً يطالبه
   * برصيدٍ لا وجود له. كيسٌ لكل عملة، والرصيد يُطرح داخل طبقته. */
  var billedBag = SyDentCurBag.make(), plannedBag = SyDentCurBag.make(), paidBag = SyDentCurBag.make();
  (sessions || []).forEach(function(s){
    var c = _rowCur(s);
    if ((s.status || 'completed') === 'planned') plannedBag[c] += Number(s.cost || 0);
    else                                          billedBag[c] += Number(s.cost || 0);
  });
  (payments || []).forEach(function(p){ paidBag[_rowCur(p)] += Number(p.amount || 0); });
  var balanceBag = SyDentCurBag.make();
  ['SYP', 'USD'].forEach(function(c){ balanceBag[c] = billedBag[c] - paidBag[c]; });
  /* الرصيد الدائن يُعرض بقيمته المطلقة، والعنوان يتبع الطبقة الغالبة: دينٌ
   * بطبقةٍ ورصيدٌ دائن بأخرى حالةٌ مشروعة، فيُعلَن الطرفان بلا دمج. */
  var owes = SyDentCurBag.active(balanceBag).some(function(c){ return balanceBag[c] > 0; });
  var absBalance = SyDentCurBag.make();
  ['SYP', 'USD'].forEach(function(c){ absBalance[c] = Math.abs(balanceBag[c]); });


  var th = 'padding:6px 9px;border:1px solid #ccc;background:#eee;text-align:right;font-size:12px;';
  var td = 'padding:6px 9px;border:1px solid #ddd;font-size:12px;';

  // ── Header ──
  var html = '<div style="font-family:Cairo,Tahoma,sans-serif;direction:rtl;color:#111;background:#fff;padding:4px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px;">' +
            '<div><div style="font-size:20px;font-weight:800;">' + escapeHtml(clinic) + '</div>' +
            '<div style="font-size:13px;color:#444;">ملف المريض</div></div>' +
            '<div style="font-size:12px;color:#444;">تاريخ الطباعة: ' + escapeHtml(today) + '</div></div>';

  // ── Patient info ──
  html += '<h3 style="font-size:14px;margin:0 0 6px;">معلومات المريض</h3><table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
  html += _ppRow('الاسم', patient.name);
  html += _ppRow('رقم المريض', patient.local_id);
  html += _ppRow('الهاتف', patient.phone);
  if (patient.dob) html += _ppRow('العمر', calcAge(patient.dob));
  html += _ppRow('الجنس', _ppGenderAr(patient.gender));
  html += _ppRow('آخر زيارة', patient.last_visit);
  html += '</table>';

  // ── Medical ──
  var _mfPrint = warnParts(patient).join('، ');   /* M87+M92: أعلام + نص حر — الحساسية صف منفصل */
  var _agPrint = allergyParts(patient).join('، ');   /* chips الحساسية + النص الحر */
  if (_mfPrint || _agPrint || patient.notes) {
    html += '<h3 style="font-size:14px;margin:0 0 6px;">معلومات طبية</h3><table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
    html += _ppRow('تحذيرات طبية', _mfPrint);
    html += _ppRow('الحساسيات', _agPrint);
    html += _ppRow('ملاحظات', patient.notes);
    html += '</table>';
  }

  // ── Treatments / sessions ──
  // ── M91: Implant log (documentation) — rendered only if records exist ──
  var _ilRows = implantLogCache || [];
  if (_ilRows.length) {
    html += '<h3 style="font-size:14px;margin:0 0 6px;">🦴 سجل الزرعات</h3>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
    html += '<tr><th style="' + th + '">السن</th><th style="' + th + '">الماركة/النظام</th><th style="' + th + '">القياس (مم)</th><th style="' + th + '">Ref#</th><th style="' + th + '">Lot#</th><th style="' + th + '">تاريخ الزرع</th><th style="' + th + '">تاريخ التحميل</th></tr>';
    _ilRows.forEach(function(r){
      var _dim = '';
      if (r.diameter !== null && r.diameter !== undefined && r.diameter !== '') _dim += '⌀' + escapeHtml(String(r.diameter));
      if (r.length !== null && r.length !== undefined && r.length !== '') _dim += (_dim ? '×' : '') + escapeHtml(String(r.length));
      html += '<tr>'
            + '<td style="' + td + '">' + escapeHtml(String(r.tooth_num || '')) + '</td>'
            + '<td style="' + td + '">' + escapeHtml(r.brand || '—') + '</td>'
            + '<td style="' + td + '">' + (_dim || '—') + '</td>'
            + '<td style="' + td + '">' + escapeHtml(r.ref_no || '—') + '</td>'
            + '<td style="' + td + '">' + escapeHtml(r.lot_no || '—') + '</td>'
            + '<td style="' + td + '">' + (r.placed_at ? escapeHtml(fmtD(r.placed_at)) : '—') + '</td>'
            + '<td style="' + td + '">' + (r.loaded_at ? escapeHtml(fmtD(r.loaded_at)) : '—') + '</td>'
            + '</tr>';
      if (r.notes) html += '<tr><td colspan="7" style="' + td + 'color:#555;">📝 ' + escapeHtml(r.notes) + '</td></tr>';
    });
    html += '</table>';
  }

  html += '<h3 style="font-size:14px;margin:0 0 6px;">العلاجات والجلسات</h3>';
  if ((sessions || []).length) {
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><thead><tr>' +
            '<th style="' + th + '">التاريخ</th><th style="' + th + '">السن</th><th style="' + th + '">العلاج</th>' +
            '<th style="' + th + '">الحالة</th><th style="' + th + '">الطبيب</th>' +
            (withPrices ? '<th style="' + th + '">التكلفة</th>' : '') + '</tr></thead><tbody>';
    (sessions || []).slice().sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); }).forEach(function(s){
      html += '<tr>' +
        '<td style="' + td + '">' + escapeHtml(s.date || '') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(s.tooth_num != null ? String(s.tooth_num) : '—') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(s.type || s.description || '—') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(_ppSessionStatusAr(s.status)) + '</td>' +
        '<td style="' + td + '">' + escapeHtml(docMap[s.provider_id] || '—') + '</td>' +
        (withPrices ? '<td style="' + td + '">' + fmt(s.cost) + ' ' + curLblOf(s.currency) + '</td>' : '') +   // v261: عملة الصف
      '</tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div style="font-size:12px;color:#777;margin-bottom:16px;">لا توجد جلسات مسجّلة.</div>';
  }

  // ── Money (internal archive only) ──
  if (withPrices) {
    if ((payments || []).length) {
      html += '<h3 style="font-size:14px;margin:0 0 6px;">المدفوعات</h3>';
      html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><thead><tr>' +
              '<th style="' + th + '">التاريخ</th><th style="' + th + '">المبلغ</th><th style="' + th + '">الطريقة</th><th style="' + th + '">ملاحظات</th></tr></thead><tbody>';
      (payments || []).slice().sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); }).forEach(function(p){
        html += '<tr>' +
          '<td style="' + td + '">' + escapeHtml(p.date || '') + '</td>' +
          '<td style="' + td + '">' + fmt(p.amount) + ' ' + curLblOf(p.currency) + '</td>' +   // v261: عملة الصف
          '<td style="' + td + '">' + escapeHtml(p.method || '—') + '</td>' +
          '<td style="' + td + '">' + escapeHtml(p.notes || '') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '<table style="width:auto;border-collapse:collapse;margin-bottom:16px;font-size:13px;">' +
      '<tr><td style="' + td + 'font-weight:700;">إجمالي العلاج المنجز</td><td style="' + td + '">' + SyDentCurBag.text(billedBag, fmt) + '</td></tr>' +
      (SyDentCurBag.active(plannedBag).length ? '<tr><td style="' + td + 'color:#666;">علاج مخطّط (تقديري)</td><td style="' + td + 'color:#666;">' + SyDentCurBag.text(plannedBag, fmt) + '</td></tr>' : '') +
      '<tr><td style="' + td + 'font-weight:700;">إجمالي المدفوع</td><td style="' + td + '">' + SyDentCurBag.text(paidBag, fmt) + '</td></tr>' +
      '<tr><td style="' + td + 'font-weight:800;">' + (owes ? 'الرصيد المتبقّي' : 'رصيد دائن (للمريض)') + '</td><td style="' + td + 'font-weight:800;color:' + (owes?'#b00':'#080') + ';">' + SyDentCurBag.text(absBalance, fmt) + '</td></tr>' +
      '</table>';
  }

  // ── Lab orders ──
  if ((labOrders || []).length) {
    html += '<h3 style="font-size:14px;margin:0 0 6px;">طلبات المخابر</h3>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><thead><tr>' +
            '<th style="' + th + '">السن</th><th style="' + th + '">نوع العمل</th><th style="' + th + '">المخبر</th><th style="' + th + '">الحالة</th></tr></thead><tbody>';
    (labOrders || []).forEach(function(lo){
      html += '<tr>' +
        '<td style="' + td + '">' + escapeHtml(lo.tooth_num != null ? String(lo.tooth_num) : '—') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(lo.work_type || '—') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(lo.lab_name || '—') + '</td>' +
        '<td style="' + td + '">' + escapeHtml(lo.status || '—') + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  }

  // ── Footer ──
  html += '<div style="margin-top:30px;display:flex;justify-content:space-between;font-size:12px;color:#444;">' +
          '<div>التوقيع: ____________________</div><div>' + escapeHtml(clinic) + '</div></div>';
  html += '</div>';
  return html;
}

function doPrintRecord(withPrices){
  closeModal('printChoiceModal');
  var root = document.getElementById('printRoot');
  if (!root) return;
  root.innerHTML = buildPrintHtml(!!withPrices);
  document.body.classList.add('printing');
  var cleanup = function(){
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();   // sync inside the click gesture — iOS Safari blocks print() fired from setTimeout (transient user-activation is lost → 'blocked from automatically printing'). Content is inline SVG/CSS only; layout flushes before the print snapshot.
  // Safety net in case afterprint never fires (some mobile browsers)
  setTimeout(cleanup, 60000);
}

/* ════════ القسم ب: الأدوات + كتالوج العلاجات ════════ */

/* ── Lab Orders Constants ── */
// Fallback list — used only if treatment doesn't have needs_lab set in DB
var LAB_REQUIRED_KEYS = ['crown', 'bridge', 'denture', 'denture_full', 'denture_partial', 'veneer', 'ortho_plate'];
var LAB_OPTIONAL_KEYS = ['implant', 'ortho_fixed'];

function needsLab(treatmentKey) {
  if (!treatmentKey) return false;
  // First check DB-driven needs_lab from TREATMENTS (loaded from Supabase)
  if (typeof TREATMENTS !== 'undefined' && TREATMENTS && TREATMENTS.length) {
    var t = null;
    for (var i = 0; i < TREATMENTS.length; i++) {
      if (TREATMENTS[i].id === treatmentKey) { t = TREATMENTS[i]; break; }
    }
    if (t && typeof t.needs_lab === 'boolean') return t.needs_lab;
  }
  // Fallback: hardcoded list
  return LAB_REQUIRED_KEYS.indexOf(treatmentKey) !== -1
      || LAB_OPTIONAL_KEYS.indexOf(treatmentKey) !== -1;
}

var LAB_STATUSES = {
  /* M127: أُنشئ ولم يُرسَل بعد — لا شيء عند المخبر فعلياً فلا ذمّة ولا عدّ. */
  'draft':     { ar: 'مسودة — لم تُرسل',      tone: 'gray',   color: 'var(--text3)', bg: 'color-mix(in srgb, var(--text3) 15%, transparent)' },
  'sent':      { ar: 'تم التسليم للمخبر',    tone: 'blue',   color: 'var(--blue)', bg: 'rgba(var(--blue-rgb),0.15)' },
  'received':  { ar: 'تم الاستلام من المخبر', tone: 'yellow', color: 'var(--yellow)', bg: 'rgba(var(--yellow-rgb),0.15)' },
  'checked':   { ar: 'تم الفحص',              tone: 'green',  color: 'var(--green)', bg: 'rgba(var(--green-rgb),0.15)' },
  'delivered': { ar: 'تم التركيب',            tone: 'gray',   color: 'var(--text3)', bg: 'color-mix(in srgb, var(--text3) 15%, transparent)' },
  'redo':      { ar: 'إعادة',                  tone: 'orange', color: 'var(--orange)', bg: 'rgba(var(--orange-rgb),0.15)' },
  'rejected':  { ar: 'مرفوض',                  tone: 'red',    color: 'var(--red)', bg: 'rgba(var(--red-rgb),0.15)' }
};

/* M127 — المُحدِّد الوحيد للمسودّة. دالةٌ لا شرطٌ مبعثر: ستّة مواضع ذمّة
   عبر ثلاثة ملفات تسأل السؤال نفسه، ونسخُ الشرط نصّاً يعني أن يُنسى موضعٌ
   واحد فتُحسب ذمّةٌ على طلبٍ لم يُرسَل. محروسةٌ بايت-بايت بالمجموعة T. */
function _labIsDraft(o) {
  return !!(o && o.status === 'draft');
}

var LAB_NEXT_STATUS = {
  /* الإرسال فعلٌ صريح بيد الطبيب لا قلبٌ تلقائي من فعلٍ سريري — تكافؤ
     Carestream («Lab Not Ready» تُعدَّل يدوياً) وOpenDental (تاريخ الإرسال
     حقلٌ يُملأ). والمعالج القائم يختم date_sent عند الانتقال إلى 'sent'
     أصلاً (مسار redo) ⇒ صفر كود إرسالٍ جديد بالسطحين. */
  'draft':    { next: 'sent',      label: '📤 إرسال للمخبر' },
  'sent':     { next: 'received',  label: '📦 تم الاستلام من المخبر' },
  'received': { next: 'checked',   label: '✓ تم الفحص' },
  'checked':  { next: 'delivered', label: '🤝 تم التركيب' },
  'redo':     { next: 'sent',      label: '📤 تم التسليم للمخبر' }
};

/* ── Utils ── */
/* قاعدة #481 — وسمُ العملة يتبع عملة الرقم لا عملة العيادة. المصدر الكانوني
 * هو SyDentCurrency.labelOf؛ الارتداد للحالات التي لا يُحمَّل فيها الأصل
 * المشترك (المثبتات بسياق vm) بنفس الدلالة حرفياً. */
function curLblOf(c) { return SyDentCurBag.lblOf(c); }
function fmt(n)  { return Number(n||0).toLocaleString('en-US'); }
function fmtD(ds) {
  if (!ds) return '—';
  return (window.SyDT && SyDT.numDate(ds)) || String(ds).slice(0, 10);   // v478: أرقاماً d/m/yyyy — المُنسّق الموحّد
}
/* A3: review-date numeric form d/m/yyyy — built straight from the ISO string (no Date/tz). */
function fmtDNum(ds){
  if (!ds) return '—';
  var p = String(ds).slice(0, 10).split('-');
  if (p.length !== 3) return String(ds);
  return (+p[2]) + '/' + (+p[1]) + '/' + p[0];
}
/* Format a full timestamp (e.g. created_at) as "15 أيار 2026 — 02:45 م".
   Used as hover tooltip on date cells so the precise creation time is
   accessible without cluttering the table. Matches Dentrix Ascend's
   optional "Show timestamp" pattern. */
// ── MIRROR PAIR ── ppYmdLocal (هنا) ↔ prmYmdLocal (patients.html) — جسمان متطابقان بايت-بايت
function ppYmdLocal(d){
  // v99: تاريخ محلي yyyy-mm-dd — لا toISOString (انزياح يوم كامل بين 00:00–03:00 بتوقيت دمشق)
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function toDay() { return ppYmdLocal(); }

/* Sort an array of records in display order: newest first by date, then by
   created_at (so two items entered the same day appear in the order they
   were actually created, with the most recent at the top). Mutates the
   array in place. Used after insert so the newly-added row settles into
   its correct slot regardless of dating. */
function sortByDateDesc(arr) {
  if (!Array.isArray(arr)) return;
  arr.sort(function(a, b){
    var ad = String(a.date || '0000-01-01');
    var bd = String(b.date || '0000-01-01');
    if (ad > bd) return -1;
    if (ad < bd) return 1;
    // Same date → newer created_at first
    var ac = String(a.created_at || '');
    var bc = String(b.created_at || '');
    if (ac > bc) return -1;
    if (ac < bc) return 1;
    return 0;
  });
}

function calcAge(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now()-new Date(dob))/(365.25*864e5)) + ' سنة';
}
function safe(fn, label) {
  try { fn(); } catch(e) { console.error('Error in ' + label + ':', e); }
}

/* ── Treatment catalog ── */
// Rule #195 — strict hex allowlist for DB-stored colors before they reach
// style attributes (exam palette, tooth modal, regional buttons all inject
// fill/stroke raw into style=""). Prefers the canonical sanitizeHex exposed by
// the color picker; a local mirror covers the case where it hasn't loaded yet.
function _sanHex(h) {
  if (window.SyDentColorPicker && typeof window.SyDentColorPicker.sanitizeHex === 'function') {
    return window.SyDentColorPicker.sanitizeHex(h);
  }
  if (typeof h !== 'string' || !h) return '#0d8577';
  var s = h.trim();
  if (s.charAt(0) !== '#') s = '#' + s;
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) s = '#' + s[1]+s[1] + s[2]+s[2] + s[3]+s[3];
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '#0d8577';
}
var TREATMENTS = (JSON.parse(localStorage.getItem('sydent_treatments') || '[]') || []).map(function(t){
  // Sanitize cached colors too — an older cache may predate the choke-point fix.
  if (t) { t.fill = _sanHex(t.fill); t.stroke = _sanHex(t.stroke); }
  return t;
});

/**
 * Returns the appropriate display name for a treatment.
 * - forPatient=true: returns layman_name if set, else falls back to technical name.
 * - forPatient=false (default): returns technical name (clinician-facing).
 * Used for printable treatment plans, receipts, and future WhatsApp templates.
 * Internal UI (legends, tooltips, dropdowns) keeps technical names for the practitioner.
 */
function getDisplayName(treatment, forPatient) {
  if (!treatment) return '';
  if (forPatient && treatment.layman_name && String(treatment.layman_name).trim()) {
    return String(treatment.layman_name).trim();
  }
  return treatment.name || '';
}

async function loadTreatmentsFromSupabase() {
  if (!window.sb) return;
  try {
    const { data, error } = await window.sb
      .from('treatments').select('*').order('sort_order', { ascending: true });
    if (error) { console.error(error); return; }
    window.__m61 = !!(data && data.length && Object.prototype.hasOwnProperty.call(data[0], 'post_extraction'));
    TREATMENTS = (data || []).map(function(t){
      return { id:t.treatment_key, dbId:t.id, name:t.name, label:t.label,
               fill:_sanHex(t.fill), stroke:_sanHex(t.stroke), price:t.price, builtin:t.builtin, is_favorite:!!t.is_favorite,
               needs_lab: !!t.needs_lab,
               target_part: t.target_part || 'crown',
               is_active: t.is_active !== false,
               category: t.category || 'other',
               default_note: t.default_note || '',
               completion_note: t.completion_note || '',
               layman_name: t.layman_name || '',
               currency: (t.currency === 'USD') ? 'USD' : 'SYP',   /* M125: عملة الصف — لا تُسقط */
               price_overrides: t.price_overrides || {},
               post_extraction: !!t.post_extraction,
               dentition_scope: (t.dentition_scope === 'primary' || t.dentition_scope === 'permanent') ? t.dentition_scope : 'all',   /* M146 */
               accepts_units: !!t.accepts_units,   /* M151: يقبل عدد وحدات — مفتاحٌ صريح لا استنتاجٌ من التصنيف */
               is_bundle: !!t.is_bundle };
    });
    localStorage.setItem('sydent_treatments', JSON.stringify(TREATMENTS));
  } catch(e){ console.error(e); }
  // Load clinic doctors
  try {
    var dRes = await window.sb.from('clinic_doctors')
      .select('id, name, color, is_owner, is_active, user_id')
      .eq('owner_id', currentUser.id)
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true });
    if (!dRes.error && dRes.data) {
      /* M147: القوائمُ (منتقيات الاختيار) = الفعّالون فقط؛ أمّا حلُّ الاسم من المعرّف بالسجلّ
         التاريخي فيقرأ الكلّ — وإلا فقدت جلساتُ الطبيب المعطّل اسمَه بالخط الزمني. */
      window.CLINIC_DOCTORS_ALL = dRes.data;
      CLINIC_DOCTORS = dRes.data.filter(function(d){ return d.is_active !== false; });
    }
  } catch(e) { CLINIC_DOCTORS = []; }
  // Load bundle items
  try {
    var bRes = await window.sb.from('treatment_bundles')
      .select('*')
      .eq('owner_id', currentUser.id);
    if (!bRes.error && bRes.data) {
      BUNDLE_ITEMS = bRes.data;
    }
  } catch(e) { BUNDLE_ITEMS = []; }
}

/* Get the right price for a treatment, considering the selected provider's override */
function getPriceForDoctor(treatment, doctorId) {
  if (!treatment) return 0;
  if (doctorId && treatment.price_overrides && treatment.price_overrides[doctorId] !== undefined && treatment.price_overrides[doctorId] !== null) {
    return treatment.price_overrides[doctorId];
  }
  return treatment.price || 0;
}

/* Get bundle child items for a parent treatment (by treatment_key, returns child treatment objects) */
function getBundleChildren(parentTreatmentKey) {
  var parent = getTreatment(parentTreatmentKey);
  if (!parent || !parent.dbId) return [];
  var items = BUNDLE_ITEMS.filter(function(bi){ return bi.parent_id === parent.dbId; })
    .sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); });
  return items.map(function(bi){
    var child = TREATMENTS.find(function(t){ return t.dbId === bi.child_id; });
    return child ? { treatment: child, quantity: bi.quantity || 1 } : null;
  }).filter(function(x){ return x; });
}
function getTreatment(id) {
  for (var i=0; i<TREATMENTS.length; i++) if (TREATMENTS[i].id === id) return TREATMENTS[i];
  /* v430 (M152): مكتبةُ الحالات السريرية مدمجةٌ بالكود لا بكتالوج العيادة (COND_LIBRARY
     بـpp-dental.js). نقطةُ الخنق هنا: كلُّ قارئٍ لمفتاحٍ مخزَّن (الرسم · التلميح ·
     التوجيه · المنتقي) يجدُ تعريفَ الحالة كما يجد أيَّ علاج — بلا تعديلِ ثلاثين موضعاً.
     صفُّ الكتالوج يفوز دائماً (الحلقةُ أعلاه) فلا تحجب المكتبةُ علاجَ عيادةٍ بنفس المفتاح. */
  return (typeof getCondition === 'function') ? getCondition(id) : null;
}
