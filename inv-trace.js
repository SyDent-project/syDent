/* inv-trace.js — M173 (جولة المخزون، البند 5): تتبّعُ الدفعة (LOT) — مصدرٌ واحد لبطاقة المريض وشاشة المخزون.
   حركاتُ الاستهلاك تحمل المريضَ والدفعة منذ M169، فالتتبّعُ قراءةٌ لا كتابة:
     • patientMaterials(sb, owner, patientId): ما استُعمل للمريض ومن أي دفعة (الأحدثُ أولاً، المرقّمُ مميَّز).
     • batchPatients(sb, owner, batchId): مَن استلم من هذه الدفعة (استدعاءُ الشركة المصنّعة) — مجمَّعٌ لكل مريض.
     • html/rows للعرض والإكسل. القراءاتُ مصفّحة (#706) والفشلُ مُعلَن (#699). */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? (m[3] + '/' + m[2] + '/' + m[1]) : ''; }
  function localDay(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function lotText(b) {
    if (!b) return '';
    var p = [];
    if (b.lot_no) p.push('LOT ' + b.lot_no);
    if (b.expiry_date) p.push('صلاحية ' + dmy(b.expiry_date));
    return p.join(' · ');
  }

  async function patientMaterials(sb, owner, patientId) {
    var r = await window.SyDentFetchAll(function () {   /* #706: مصفّحة */
      return sb.from('inventory_movements')
        .select('id, change, created_at, session_id, item:inventory_items(name, unit), batch:inventory_batches(lot_no, expiry_date)')
        .eq('owner_id', owner).eq('patient_id', patientId).eq('reason', 'consume');
    });
    if (r.error) return { ok: false, error: r.error };
    var rows = (r.data || []).map(function (m) {
      return { id: m.id, at: m.created_at, name: (m.item && m.item.name) || 'صنف محذوف', unit: (m.item && m.item.unit) || '',
               qty: Math.abs(num(m.change)), lot: (m.batch && m.batch.lot_no) || '', lotText: lotText(m.batch) };
    }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    return { ok: true, rows: rows };
  }

  function patientHtml(rows) {
    if (!rows.length) return '';
    return '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>الدفعة</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><td style="white-space:nowrap;">' + esc(localDay(r.at)) + '</td><td><strong>' + esc(r.name) + '</strong></td>'
          + '<td style="white-space:nowrap;">' + esc(fmt(r.qty)) + (r.unit ? ' ' + esc(r.unit) : '') + '</td>'
          + '<td>' + (r.lot ? '<span class="cbadge tone tone-cyan" dir="ltr">' + esc('LOT ' + r.lot) + '</span>' + (r.lotText.indexOf('صلاحية') > -1 ? ' <span style="font-size:11px;color:var(--text2);">' + esc(r.lotText.split(' · ').slice(1).join(' · ')) + '</span>' : '')
                         : (r.lotText ? '<span style="font-size:12px;color:var(--text2);">' + esc(r.lotText) + '</span>' : '<span style="color:var(--text2);">—</span>')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  async function batchPatients(sb, owner, batchId) {
    var r = await window.SyDentFetchAll(function () {   /* #706: مصفّحة */
      return sb.from('inventory_movements')
        .select('id, change, created_at, patient_id, patient:patients(name, phone)')
        .eq('owner_id', owner).eq('batch_id', batchId).eq('reason', 'consume');
    });
    if (r.error) return { ok: false, error: r.error };
    var by = {}, order = [], unlinked = 0;
    (r.data || []).forEach(function (m) {
      if (!m.patient_id) { unlinked += Math.abs(num(m.change)); return; }
      var k = m.patient_id;
      if (!by[k]) { by[k] = { patient_id: k, name: (m.patient && m.patient.name) || '—', phone: (m.patient && m.patient.phone) || '', qty: 0, first: m.created_at, last: m.created_at }; order.push(k); }
      by[k].qty += Math.abs(num(m.change));
      if (String(m.created_at) < String(by[k].first)) by[k].first = m.created_at;
      if (String(m.created_at) > String(by[k].last)) by[k].last = m.created_at;
    });
    var rows = order.map(function (k) { return by[k]; }).sort(function (a, b) { return String(b.last).localeCompare(String(a.last)); });
    return { ok: true, rows: rows, unlinked: Math.round(unlinked * 100) / 100 };
  }

  var BATCH_HEADERS = ['المريض', 'الهاتف', 'الكمية', 'أول استعمال', 'آخر استعمال'];
  function batchRows(rows) {
    return rows.map(function (r) { return [r.name, r.phone || '', Math.round(r.qty * 100) / 100, localDay(r.first), localDay(r.last)]; });
  }

  window.SyDentInvTrace = { lotText: lotText, patientMaterials: patientMaterials, patientHtml: patientHtml,
    batchPatients: batchPatients, BATCH_HEADERS: BATCH_HEADERS, batchRows: batchRows, localDay: localDay };
})();
