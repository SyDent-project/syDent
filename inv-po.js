/* inv-po.js — M172 (جولة المخزون، البند 4): الموردون وطلبياتُ الشراء والاستلامُ الجزئي — مصدرٌ واحد للواجهة.
   الكتابةُ كلُّها بالقاعدة (inventory_create_order · inventory_receive)، وهذا الملف يحسب ويعرض فقط:
     • status(order, lines): الحالةُ المعروضة تُشتقّ من الأسطر — ملغاة · مستلمة · مستلمة جزئياً · مُرسلة.
     • remaining(line): المتبقّي للاستلام (لا سالب).
     • receiveLines(rows): صفوفُ نافذة الاستلام ⇒ [{line_id, qty, expiry?, lot?, unit_price?}] (الفارغُ لا يُرسل).
     • overLines(rows, lines): الأسطرُ التي تتجاوز المطلوب ⇒ تأكيدٌ صريح قبل allow_over.
     • receiptAmounts(r): مجموعُ الاستلام لكل عملة على حدة (لا جمعَ بين عملتين) + هل بقيت عملةٌ بلا مصروف.
     • expenseUrl(receiptId, cur): الرابطُ العميق لشاشة المصاريف — تُعبّأ ولا تحفظ (#690)، والحفظُ من مسارها القائم.
     • waNumber(phone): رقمُ المورّد لـwa.me (السوري 09… ⇒ 9639…). */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }

  var STATUS = {
    cancelled: { key: 'cancelled', label: 'ملغاة', tone: 'red' },
    received:  { key: 'received',  label: 'مستلمة', tone: 'green' },
    partial:   { key: 'partial',   label: 'مستلمة جزئياً', tone: 'orange' },
    placed:    { key: 'placed',    label: 'مُرسلة', tone: 'blue' }
  };

  function status(order, lines) {
    if (order && order.status === 'cancelled') return STATUS.cancelled;
    var L = lines || [];
    if (L.length && L.every(function (l) { return num(l.qty_received) >= num(l.qty_ordered); })) return STATUS.received;
    if (L.some(function (l) { return num(l.qty_received) > 0; })) return STATUS.partial;
    return STATUS.placed;
  }

  function remaining(line) { return r2(Math.max(num(line && line.qty_ordered) - num(line && line.qty_received), 0)); }

  /* rows: [{ line_id, qty (نص), expiry (YYYY-MM-DD أو فارغ), price (نص أو فارغ) }] */
  function receiveLines(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.line_id) return;
      var q = String(r.qty == null ? '' : r.qty).trim();
      if (q === '' || !(Number(q) > 0)) return;
      var o = { line_id: r.line_id, qty: r2(q) };
      if (r.expiry && /^\d{4}-\d{2}-\d{2}$/.test(String(r.expiry))) o.expiry = String(r.expiry);
      var lot = String(r.lot == null ? '' : r.lot).trim();   // M173: رقمُ الدفعة
      if (lot) o.lot = lot.slice(0, 60);
      var p = String(r.price == null ? '' : r.price).trim();
      if (p !== '' && Number(p) >= 0 && isFinite(Number(p))) o.unit_price = r2(p);
      out.push(o);
    });
    return out;
  }

  function overLines(payload, lines) {
    var by = {};
    (lines || []).forEach(function (l) { by[l.id] = l; });
    return (payload || []).filter(function (p) { var l = by[p.line_id]; return l && num(l.qty_received) + num(p.qty) > num(l.qty_ordered) + 1e-9; });
  }

  function receiptAmounts(r) {
    var out = [];
    if (num(r && r.amount_syp) > 0) out.push({ cur: 'SYP', amount: r2(r.amount_syp), expense_id: (r && r.expense_syp_id) || null });
    if (num(r && r.amount_usd) > 0) out.push({ cur: 'USD', amount: r2(r.amount_usd), expense_id: (r && r.expense_usd_id) || null });
    return { list: out, pending: out.filter(function (x) { return !x.expense_id; }).length };
  }

  function expenseUrl(receiptId, cur) {
    return 'expenses.html?inv_receipt=' + encodeURIComponent(receiptId) + '&cur=' + (cur === 'USD' ? 'USD' : 'SYP');
  }

  function waNumber(phone) {
    var t = (window.SyDentPhone && window.SyDentPhone.tidy) ? window.SyDentPhone.tidy(phone) : String(phone || '');
    var d = String(t || '').replace(/\D/g, '');
    if (!d) return '';
    if (/^0\d{9}$/.test(d)) return '963' + d.slice(1);
    if (String(t).charAt(0) === '+') return d;
    return d.length >= 11 ? d : '';
  }

  window.SyDentInvPO = { STATUS: STATUS, status: status, remaining: remaining, receiveLines: receiveLines, overLines: overLines,
    receiptAmounts: receiptAmounts, expenseUrl: expenseUrl, waNumber: waNumber };
})();
