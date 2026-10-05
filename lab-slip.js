/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-slip.js · ورقةُ طلب المخبر المطبوعة (v528 · جولة المخابر، البند 4)
   ────────────────────────────────────────────────────────────────────────
   Open Dental «Lab Slip» (تُولَّد من نافذة طلب المخبر وتُطبع مع الطبعة) · Dentrix «Lab Rx».
   مصدرٌ واحد للسطحين (صفحة المخابر + مودال البطاقة — #676؛ المعرّفاتُ الحقلية نفسها،
   ومعرّفاتُ الوحدة ببادئة lsl-). تُبنى من **حقول المودال الحالية** فتُطبع قبل الحفظ وبعده،
   ومن طلبٍ محفوظ تُضاف أسنانُ دفعته ودوراتُ إعادته (M160).
   المحتوى: ترويسةُ العيادة (الاسم · الطبيب المعالج · رقم الترخيص إن سُمح بالروشتة · الهاتف) ·
   رقمُ الطلب · المريض (الاسم فقط — لا هاتف ولا تاريخ طبي: خصوصية) · المخبر · نوعُ العمل ·
   الأسنانُ على مخطط FDI · اللون · تاريخ الإرسال · «مطلوب قبل» · التعليمات · الإعادة وسببها ·
   توقيعا الطبيب واستلام المخبر. **بلا تكلفة** (ورقةٌ تُسلَّم مع العمل).
   الطباعة: جذرٌ مخصّص + body.lsl-printing و window.print() **متزامنةً داخل النقرة** (iOS Safari
   يحجب print() بعد await) — لذا بياناتُ العيادة تُجلب مسبقاً عند فتح المودال.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabSlip) return;

  var clinic = null, loading = null;
  var UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  var LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  var UPPER_D = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
  var LOWER_D = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function numDate(v) {
    if (!v) return '';
    if (window.SyDT && window.SyDT.numDate) return window.SyDT.numDate(v) || '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? (+m[3] + '/' + +m[2] + '/' + m[1]) : '';
  }
  /* «22، 23 24» ⇒ [22,23,24] — أرقامُ FDI الصالحة فقط، بلا تكرار، مرتّبة */
  function parseTeeth(v) {
    var out = [];
    String(v == null ? '' : v).split(/[^0-9]+/).forEach(function (x) {
      var n = parseInt(x, 10);
      if (n >= 11 && n <= 85 && n % 10 >= 1 && n % 10 <= 8 && out.indexOf(n) === -1) out.push(n);
    });
    return out.sort(function (a, b) { return a - b; });
  }
  /* أسنانُ دفعة الطلب المحفوظ: صفوفُ الإدراج الواحد تتشارك المريض والمخبر والعمل ولحظةَ الإنشاء */
  function batchTeeth(orders, id) {
    var lo = (orders || []).find(function (o) { return o.id === id; });
    if (!lo) return [];
    return parseTeeth((orders || []).filter(function (o) {
      return o.patient_id === lo.patient_id && o.lab_id === lo.lab_id && o.created_at === lo.created_at &&
             (o.treatment_key || o.work_type) === (lo.treatment_key || lo.work_type);
    }).map(function (o) { return o.tooth_num; }).join(','));
  }

  function chart(teeth) {
    var kids = teeth.some(function (t) { return t >= 51; });
    var rows = kids ? [UPPER_D, LOWER_D] : [UPPER, LOWER];
    var cell = function (n, i, len) {
      var on = teeth.indexOf(n) !== -1, mid = i === len / 2 - 1;
      return '<td class="lsl-t' + (on ? ' on' : '') + (mid ? ' mid' : '') + '">' + n + '</td>';
    };
    return '<table class="lsl-chart" aria-label="الأسنان"><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (n, i) { return cell(n, i, r.length); }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  /* d: { clinic, providerName, orderNo, patientName, lab:{name,phone}, workType, teeth[], shade, sent, due, notes, redo:[] } */
  function build(d) {
    var c = d.clinic || {};
    var h = '<div class="lsl-page" dir="rtl">';
    h += '<div class="lsl-head"><div>';
    h += '<div class="lsl-clinic">' + esc(c.clinic_name || 'العيادة') + '</div>';
    if (d.providerName) h += '<div class="lsl-dr">' + esc(d.providerName) + '</div>';
    if (c.license_no) h += '<div class="lsl-muted">رقم الترخيص: ' + esc(c.license_no) + '</div>';
    h += '</div><div class="lsl-headside">';
    if (c.clinic_phone) h += '<div>📞 <span dir="ltr">' + esc(c.clinic_phone) + '</span></div>';
    h += '<div>' + esc(numDate(new Date())) + '</div></div></div>';
    h += '<div class="lsl-title">طلب مخبر' + (d.orderNo ? ' <span class="lsl-no">#' + esc(d.orderNo) + '</span>' : '') + '</div>';
    h += '<div class="lsl-boxes">';
    h += '<div class="lsl-box"><div class="lsl-k">المريض</div><div class="lsl-v">' + esc(d.patientName || '—') + '</div></div>';
    h += '<div class="lsl-box"><div class="lsl-k">المخبر</div><div class="lsl-v">' + esc((d.lab && d.lab.name) || '—') + '</div>'
      + ((d.lab && d.lab.phone) ? '<div class="lsl-muted" dir="ltr">' + esc(d.lab.phone) + '</div>' : '') + '</div>';
    h += '</div>';
    h += '<table class="lsl-grid"><tbody>';
    h += '<tr><th>نوع العمل</th><td colspan="3"><strong>' + esc(d.workType || '—') + '</strong></td></tr>';
    h += '<tr><th>الأسنان</th><td colspan="3">' + (d.teeth && d.teeth.length ? esc(d.teeth.join('، ')) : '—') + '</td></tr>';
    h += '<tr><th>اللون</th><td>' + esc(d.shade || '—') + '</td><th>تاريخ الإرسال</th><td>' + esc(numDate(d.sent) || '—') + '</td></tr>';
    h += '<tr><th>مطلوب قبل</th><td colspan="3"' + (d.due ? ' class="lsl-due"' : '') + '>' + esc(numDate(d.due) || '—') + '</td></tr>';
    h += '</tbody></table>';
    if (d.teeth && d.teeth.length) h += chart(d.teeth);
    if (d.notes) h += '<div class="lsl-notes"><div class="lsl-k">تعليمات للمخبر</div><div class="lsl-pre">' + esc(d.notes) + '</div></div>';
    if (d.redo && d.redo.length) {
      var last = d.redo[d.redo.length - 1];
      h += '<div class="lsl-redo"><strong>إعادة' + (d.redo.length > 1 ? ' (المرة ' + d.redo.length + ')' : '') + '</strong>'
        + (last.reason ? ': ' + esc(last.reason) : '') + '</div>';
    }
    h += '<div class="lsl-sign"><div>توقيع الطبيب: ____________________</div><div>استلام المخبر: ____________________</div></div>';
    h += '</div>';
    return h;
  }

  function prefetch(sb, uid) {
    if (clinic || loading || !sb || !uid) return loading;
    loading = (async function () {
      try {
        var r = await sb.from('clinic_settings').select('clinic_name, clinic_phone, license_no, license_no_on_rx').eq('owner_id', uid).maybeSingle();
        if (r && r.error) { console.warn('lab slip clinic:', r.error); return; }
        var s = (r && r.data) || {};
        /* رقمُ الترخيص يتبع إعداد الروشتة نفسه (M115): '=== false' وحدها تُخفيه */
        clinic = { clinic_name: s.clinic_name || '', clinic_phone: s.clinic_phone || '', license_no: (s.license_no_on_rx !== false) ? (s.license_no || '') : '' };
      } catch (e) { console.warn('lab slip clinic:', e); }
      finally { loading = null; }
    })();
    return loading;
  }

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function selText(id) {
    var el = document.getElementById(id);
    if (!el || !el.value || !el.options || el.selectedIndex < 0) return '';
    return String(el.options[el.selectedIndex].text || '').replace(/\s*\((?:معطل|غير نشط)\)\s*$/, '').trim();
  }

  /* من حقول المودال. p: { patientName, providerName, lab, teeth, orderId, orders, redo } — يُرجع رسالةَ خطأ أو '' */
  function fromForm(p) {
    p = p || {};
    var work = selText('labOrderWorkType');
    /* دفعةٌ محفوظة (أكثر من سن) ⇒ أسنانُها كلها؛ وإلا حقلُ السن الحالي (قد يكون عُدِّل قبل الطباعة) */
    var bt = (p.orderId && p.orders) ? batchTeeth(p.orders, p.orderId) : [];
    var teeth = bt.length > 1 ? bt : parseTeeth(p.teeth != null ? p.teeth : val('labOrderTooth'));
    return {
      clinic: clinic || {}, providerName: p.providerName || selText('labOrderProvider'),
      orderNo: p.orderId ? String(p.orderId).replace(/-/g, '').slice(0, 8).toUpperCase() : '',
      patientName: p.patientName || '', lab: p.lab || null, workType: work,
      teeth: teeth, shade: val('labOrderShade'), sent: val('labOrderDateSent'), due: val('labOrderDateDue'),
      notes: val('labOrderNotes'), redo: p.redo || []
    };
  }
  function check(d) {
    if (!d.patientName) return 'اختر المريض أولاً';
    if (!d.workType) return 'اختر نوع العمل أولاً';
    return '';
  }

  /* يُستدعى مباشرةً من النقرة — لا await قبل window.print() (iOS) */
  function print(d) {
    var err = check(d);
    if (err) { if (typeof showToast === 'function') showToast('⚠️ ' + err); return false; }
    var root = document.getElementById('lslPrintRoot');
    if (!root) { root = document.createElement('div'); root.id = 'lslPrintRoot'; document.body.appendChild(root); }
    root.innerHTML = build(d);
    document.body.classList.add('lsl-printing');
    var cleanup = function () { document.body.classList.remove('lsl-printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
    return true;
  }

  window.SyLabSlip = { build: build, parseTeeth: parseTeeth, batchTeeth: batchTeeth, prefetch: prefetch, fromForm: fromForm, check: check, print: print,
    _setClinic: function (c) { clinic = c; } };
})();
