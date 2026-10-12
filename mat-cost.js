/* mat-cost.js — C3c: one materials-cost function for the accounting card and the reports «🧪 المواد» tab (#684, #722).
   The cost of a consume movement = |change| × the item's purchase price, in the item's own currency — exactly the
   accounting formula (P3-C1, M125). Estimated, display only: it never enters expenses or net profit (purchases enter
   profit when they are recorded as an expense).
     • bag(movs, prices, keep): {SYP, USD} — what accounting shows.
     • breakdown(movs, prices, keep, keyOf, labelOf): one row per key (item · month · treatment · doctor), each with
       its quantity and its cost per currency. Every breakdown keeps the totals of bag() per currency.
     • Rows are never sorted by amount (two currencies cannot be ranked against each other): items, treatments and
       doctors by name, months by date. A currency without cost in a row shows «—».
     • monthKey(ts): local month as «MM/YYYY» (#724 — months are numeric).
     • render(model, opts) escaped table · rows(model, mode) for Excel. */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ltr(t) { return '<bdi dir="ltr">' + esc(t) + '</bdi>'; }

  /* items: [{id, purchase_price, currency, name?, unit?}] · curOf(item) ⇒ 'SYP' | 'USD' (the page's own reader) */
  function prices(items, curOf) {
    var m = {};
    (items || []).forEach(function (it) {
      m[it.id] = { p: Number(it.purchase_price) || 0, cur: curOf(it), name: it.name || '', unit: it.unit || '', priced: num(it.purchase_price) > 0 };
    });
    return m;
  }

  function each(movs, prices, keep, fn) {
    (movs || []).forEach(function (m) {
      if (m.reason && m.reason !== 'consume') return;
      if (keep && !keep(m)) return;
      var it = prices[m.item_id];
      if (!it) return;
      var qty = Math.abs(Number(m.change) || 0);
      fn(m, it, qty, qty * it.p);
    });
  }

  function bag(movs, prices, keep) {
    var b = { SYP: 0, USD: 0 };
    each(movs, prices, keep, function (m, it, qty, v) { b[it.cur] += v; });
    return b;
  }

  function breakdown(movs, prices, keep, keyOf, labelOf) {
    var map = {}, order = [], total = { SYP: 0, USD: 0 }, unpriced = {};
    each(movs, prices, keep, function (m, it, qty, v) {
      var k = keyOf(m, it);
      if (k == null || k === '') k = '_none';
      var r = map[k];
      if (!r) { r = map[k] = { key: k, label: labelOf(k, m, it), qty: 0, unit: it.unit, bag: { SYP: 0, USD: 0 }, n: 0 }; order.push(k); }
      if (r.unit !== it.unit) r.unit = '';
      r.qty += qty; r.n++;
      r.bag[it.cur] += v; total[it.cur] += v;
      if (!it.priced) unpriced[m.item_id] = true;
    });
    var rows = order.map(function (k) { var r = map[k]; r.qty = r2(r.qty); return r; });
    return { rows: rows, total: total, unpriced: Object.keys(unpriced).length };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function monthKey(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function monthLabel(k) { var m = /^(\d{4})-(\d{2})$/.exec(k); return m ? m[2] + '/' + m[1] : '—'; }

  function sortRows(model, mode) {
    var none = function (r) { return r.key === '_none' ? 1 : 0; };
    model.rows.sort(function (a, b) {
      if (none(a) !== none(b)) return none(a) - none(b);
      if (mode === 'month') return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      return String(a.label).localeCompare(String(b.label), 'ar');
    });
    return model;
  }

  /* opts: { money(n, cur) ⇒ text, mode: 'item'|'month'|'treat'|'doc' } — the reports page's rt-list grid */
  function render(model, opts) {
    var money = opts.money, mode = opts.mode;
    if (!model.rows.length) return '<div class="empty-state"><div class="ic">🧪</div><div class="ttl">لا يوجد استهلاكُ موادٍّ من المخزون في هذه الفترة</div></div>';
    var cell = function (v, cur) { return v > 0 ? ltr(money(r2(v), cur)) : '—'; };
    var g = ' style="grid-template-columns:minmax(0,2.4fr) repeat(3,minmax(0,1fr));"';
    var h = '<div class="rt-list"><div class="rt-row rt-th"' + g + '><span>' + esc(HEADERS[mode] || '') + '</span>'
      + '<span class="n">' + (mode === 'item' ? 'الكمية' : 'عدد الحركات') + '</span><span class="n">الكلفة (ل.س)</span><span class="n">الكلفة ($)</span></div>';
    model.rows.forEach(function (r) {
      h += '<div class="rt-row"' + g + '><span class="rt-name"><b>' + esc(r.label) + '</b></span>'
        + '<span class="n">' + (mode === 'item' ? ltr(r.qty.toLocaleString('en-US')) + (r.unit ? ' ' + esc(r.unit) : '') : ltr(String(r.n))) + '</span>'
        + '<span class="n">' + cell(r.bag.SYP, 'SYP') + '</span><span class="n">' + cell(r.bag.USD, 'USD') + '</span></div>';
    });
    h += '<div class="rt-row rt-tf"' + g + '><span>المجموع</span><span class="n"></span><span class="n">' + cell(model.total.SYP, 'SYP') + '</span><span class="n">' + cell(model.total.USD, 'USD') + '</span></div></div>';
    if (model.unpriced) h += '<div class="rt-note">⚠️ ' + model.unpriced + ' مادة بلا سعر شراء — كلفتُها لا تظهر هنا. حدّد سعرها من <a href="inventory.html">صفحة المخزون</a>.</div>';
    return h;
  }

  var HEADERS = { item: 'المادة', month: 'الشهر', treat: 'العلاج', doc: 'الطبيب' };
  function rows(model, mode) {
    var out = [[HEADERS[mode] || '', mode === 'item' ? 'الكمية' : 'عدد الحركات', 'الوحدة', 'الكلفة (ل.س)', 'الكلفة ($)']];
    model.rows.forEach(function (r) {
      out.push([r.label, mode === 'item' ? r.qty : r.n, mode === 'item' ? (r.unit || '') : '', r.bag.SYP ? r2(r.bag.SYP) : '', r.bag.USD ? r2(r.bag.USD) : '']);
    });
    out.push(['المجموع', '', '', model.total.SYP ? r2(model.total.SYP) : '', model.total.USD ? r2(model.total.USD) : '']);
    return out;
  }

  window.SyDentMatCost = { prices: prices, bag: bag, breakdown: breakdown, sortRows: sortRows, monthKey: monthKey,
    monthLabel: monthLabel, render: render, rows: rows };
})();
