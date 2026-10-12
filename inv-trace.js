/* inv-trace.js — M177 (task C3, part 2): batch number (LOT) tracing — one source for both screens.
   No new table: consume movements already carry patient_id · session_id · batch_id (M169).
     • patientMaterials(sb, ownerId, patientId): what this patient received — item · quantity · LOT · date
       (the patient card «🧪 المواد ورقم الدفعة»).
     • searchLot(sb, ownerId, q): batches whose LOT matches (open or finished — a recall names old batches too)
       with every patient who received from each (inventory «🧪 تتبّع دفعة»).
     • patientHtml(rows) · lotHtml(groups): escaped views; numbers isolated LTR.
     • lotRows(groups) + LOT_HEADERS: one Excel row per patient per batch (the recall list).
   Quantities are summed per patient and batch; a return (positive change) is not consumption and is skipped. */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function fmt(n) { return r2(n).toLocaleString('en-US'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(v) {
    var s = String(v || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function ltr(t) { return '<bdi dir="ltr">' + esc(t) + '</bdi>'; }

  async function patientMaterials(sb, ownerId, patientId) {
    var r = await sb.from('inventory_movements')
      .select('change, created_at, batch_id, inventory_items(name, unit), inventory_batches(lot, expiry_date)')
      .eq('owner_id', ownerId).eq('patient_id', patientId).eq('reason', 'consume')
      .order('created_at', { ascending: false }).limit(500);
    if (r.error) throw r.error;
    return (r.data || []).filter(function (m) { return num(m.change) < 0; }).map(function (m) {
      var it = m.inventory_items || {}, b = m.inventory_batches || {};
      return { date: m.created_at, name: it.name || '—', unit: it.unit || '', qty: r2(-num(m.change)),
               lot: b.lot || '', expiry: b.expiry_date || '' };
    });
  }

  function cleanQuery(q) { return String(q || '').trim().replace(/[%_,()\\]/g, '').slice(0, 60); }

  async function searchLot(sb, ownerId, q) {
    var k = cleanQuery(q);
    if (k.length < 2) return [];
    var rb = await sb.from('inventory_batches')
      .select('id, item_id, lot, expiry_date, received_qty, quantity, is_finished, created_at, inventory_items(name, unit)')
      .eq('owner_id', ownerId).ilike('lot', '%' + k + '%').order('created_at', { ascending: false }).limit(50);
    if (rb.error) throw rb.error;
    var batches = rb.data || [];
    if (!batches.length) return [];
    var ids = batches.map(function (b) { return b.id; });
    var mv = [];
    for (var i = 0; i < ids.length; i += 150) {
      var rm = await sb.from('inventory_movements')
        .select('batch_id, change, created_at, patient_id, patients(name, phone, patient_number)')
        .eq('owner_id', ownerId).eq('reason', 'consume').in('batch_id', ids.slice(i, i + 150)).limit(5000);
      if (rm.error) throw rm.error;
      mv = mv.concat(rm.data || []);
    }
    return batches.map(function (b) {
      var by = {}, order = [], loose = 0;
      mv.forEach(function (m) {
        if (m.batch_id !== b.id || !(num(m.change) < 0)) return;
        if (!m.patient_id) { loose += -num(m.change); return; }
        var p = by[m.patient_id];
        if (!p) {
          var pt = m.patients || {};
          p = by[m.patient_id] = { id: m.patient_id, name: pt.name || '—', phone: pt.phone || '', number: pt.patient_number || '', qty: 0, last: m.created_at };
          order.push(m.patient_id);
        }
        p.qty += -num(m.change);
        if (String(m.created_at) > String(p.last)) p.last = m.created_at;
      });
      var it = b.inventory_items || {};
      return { batch: b, name: it.name || '—', unit: it.unit || '', loose: r2(loose),
               patients: order.map(function (k2) { var p = by[k2]; p.qty = r2(p.qty); return p; })
                 .sort(function (a, c) { return String(c.last).localeCompare(String(a.last)); }) };
    });
  }

  function patientHtml(rows) {
    if (!rows || !rows.length) return '<div class="empty"><div class="empty-icon">🧪</div><div style="margin-top:8px;">لم يُسجَّل لهذا المريض استهلاكُ موادٍّ من المخزون بعد.</div></div>';
    var h = '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>الدفعة (LOT)</th><th>الصلاحية</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + ltr(dmy(r.date)) + '</td><td><strong>' + esc(r.name) + '</strong></td>'
        + '<td>' + ltr(fmt(r.qty)) + (r.unit ? ' ' + esc(r.unit) : '') + '</td>'
        + '<td>' + (r.lot ? ltr(r.lot) : '—') + '</td><td>' + (r.expiry ? ltr(dmy(r.expiry)) : '—') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function lotHtml(groups) {
    if (!groups || !groups.length) return '<div class="empty"><div class="empty-icon">🔎</div><div style="margin-top:8px;">لا توجد دفعة بهذا الرقم.</div></div>';
    return groups.map(function (g) {
      var b = g.batch;
      var h = '<div class="po-rc"><strong>' + esc(g.name) + ' · ' + ltr(b.lot) + '</strong>'
        + '<small>' + (b.expiry_date ? 'الصلاحية ' + ltr(dmy(b.expiry_date)) + ' · ' : '')
        + 'المستلَم ' + ltr(fmt(b.received_qty != null ? b.received_qty : b.quantity)) + (g.unit ? ' ' + esc(g.unit) : '')
        + ' · ' + (b.is_finished ? 'انتهت' : 'المتبقّي ' + ltr(fmt(b.quantity))) + ' · مرضى: ' + g.patients.length + '</small>';
      if (g.patients.length) {
        h += '<div style="overflow-x:auto;margin-top:8px;"><table class="data-table"><thead><tr><th>المريض</th><th>الهاتف</th><th>آخر استعمال</th><th>الكمية</th></tr></thead><tbody>';
        g.patients.forEach(function (p) {
          h += '<tr><td><a href="patient-profile.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name) + '</a></td>'
            + '<td>' + (p.phone ? ltr(p.phone) : '—') + '</td><td>' + ltr(dmy(p.last)) + '</td><td>' + ltr(fmt(p.qty)) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      if (g.loose > 0) h += '<small>استُهلك منها ' + ltr(fmt(g.loose)) + ' دون ربطٍ بمريض (استهلاك يدوي).</small>';
      return h + '</div>';
    }).join('');
  }

  var LOT_HEADERS = ['الدفعة (LOT)', 'الصنف', 'الصلاحية', 'المريض', 'رقم المريض', 'الهاتف', 'آخر استعمال', 'الكمية'];
  function lotRows(groups) {
    var out = [];
    (groups || []).forEach(function (g) {
      g.patients.forEach(function (p) {
        out.push([g.batch.lot, g.name, g.batch.expiry_date ? dmy(g.batch.expiry_date) : '', p.name, p.number || '', p.phone || '', dmy(p.last), p.qty]);
      });
    });
    return out;
  }

  window.SyDentInvTrace = { patientMaterials: patientMaterials, searchLot: searchLot, cleanQuery: cleanQuery,
    patientHtml: patientHtml, lotHtml: lotHtml, lotRows: lotRows, LOT_HEADERS: LOT_HEADERS, dmy: dmy };
})();
