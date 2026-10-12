/* inv-po.js — M176 (task C3, part 1): suppliers, purchase orders and partial receiving — one source.
   Writes go through the RPCs (inventory_create_order / inventory_receive); this file only shapes data:
     • STATUS: label and tone for each order status.
     • progress(lines): ordered / received / remaining counts for the order card.
     • receiveLines(rows): the receive form ⇒ [{line_id, qty, expiry?, price?}] for the RPC (blank qty = not received now).
     • overLines(rows): rows that would take a line above what was ordered (needs a confirmation).
     • receiptTotals(lines): delivery value per currency, never mixed, and how many lines have no price.
     • expensePrefill(receipt, lines, cur): what the expenses form is filled with for one currency of a delivery.
     • order(...): adapts a saved order to SyDentInvOrder (WhatsApp / print — no prices to the supplier). */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function dmy(d) {
    d = d ? new Date(d) : new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  var STATUS = {
    open:     { label: 'بانتظار الاستلام', tone: 'wait' },
    partial:  { label: 'وصل جزء منها',     tone: 'alert' },
    received: { label: 'اكتملت',           tone: 'done' },
    closed:   { label: 'مغلقة',            tone: 'muted' }
  };
  function status(s) { return STATUS[s] || STATUS.open; }
  function isOpen(s) { return s === 'open' || s === 'partial'; }

  function remaining(l) { return Math.max(r2(num(l.qty_ordered) - num(l.qty_received)), 0); }

  function progress(lines) {
    var p = { lines: 0, done: 0, ordered: 0, received: 0 };
    (lines || []).forEach(function (l) {
      p.lines++;
      p.ordered += num(l.qty_ordered);
      p.received += Math.min(num(l.qty_received), num(l.qty_ordered));
      if (remaining(l) <= 0) p.done++;
    });
    p.ordered = r2(p.ordered); p.received = r2(p.received);
    return p;
  }

  function parseQty(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '') return null;
    var n = Number(s);
    return (isFinite(n) && n > 0) ? r2(n) : null;
  }
  function parsePrice(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '') return null;
    var n = Number(s);
    return (isFinite(n) && n >= 0) ? r2(n) : null;
  }

  /* rows: [{ line, qty (text), expiry ('YYYY-MM-DD' | ''), price (text) }] */
  function receiveLines(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var q = parseQty(r && r.qty);
      if (q == null || !r.line) return;
      var x = { line_id: r.line.id, qty: q };
      if (r.expiry) x.expiry = String(r.expiry);
      var pr = parsePrice(r.price);
      if (pr != null) x.price = pr;
      out.push(x);
    });
    return out;
  }

  function overLines(rows) {
    return (rows || []).filter(function (r) {
      var q = parseQty(r && r.qty);
      return q != null && r.line && q > remaining(r.line);
    });
  }

  /* lines: receipt lines [{ qty, unit_price, currency }] */
  function receiptTotals(lines) {
    var bag = {}, unpriced = 0;
    (lines || []).forEach(function (l) {
      if (l.unit_price == null || l.unit_price === '') { unpriced++; return; }
      var c = l.currency || 'SYP';
      bag[c] = r2((bag[c] || 0) + num(l.qty) * num(l.unit_price));
    });
    return { bag: bag, unpriced: unpriced };
  }

  /* receipt: { id, received_at, supplier_name } · lines: its receipt lines · cur: 'SYP' | 'USD' */
  function expensePrefill(receipt, lines, cur) {
    var mine = (lines || []).filter(function (l) { return (l.currency || 'SYP') === cur; });
    var t = receiptTotals(mine);
    return {
      currency: cur,
      amount: t.bag[cur] || 0,
      vendor: (receipt && receipt.supplier_name) || '',
      description: 'مواد — استلام طلبية ' + dmy(receipt && receipt.received_at),
      date: receipt && receipt.received_at ? String(receipt.received_at).slice(0, 10) : '',
      unpriced: t.unpriced
    };
  }

  /* SyDentInvOrder shape for WhatsApp / print of a saved order: what is still awaited */
  function order(o, lines, items, clinic) {
    return {
      clinic: (clinic && clinic.name) || '', phone: (clinic && clinic.phone) || '',
      supplier: (o && o.supplier_name) || '', note: (o && o.note) || '', date: o && o.created_at ? new Date(o.created_at) : new Date(),
      lines: (lines || []).map(function (l) {
        var it = (items && items[l.item_id]) || {};
        return { name: it.name || '—', unit: it.unit || '', qty: isOpen(o && o.status) ? remaining(l) : num(l.qty_ordered),
                 current: it.quantity, level: it.reorder_level };
      })
    };
  }

  window.SyDentInvPO = { STATUS: STATUS, status: status, isOpen: isOpen, remaining: remaining, progress: progress,
    parseQty: parseQty, parsePrice: parsePrice, receiveLines: receiveLines, overLines: overLines,
    receiptTotals: receiptTotals, expensePrefill: expensePrefill, order: order, dmy: dmy };
})();
