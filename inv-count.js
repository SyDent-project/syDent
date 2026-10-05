/* inv-count.js — M171 (جولة المخزون، البند 3): الجردُ الدوري بالفروق — مصدرٌ واحد للحساب والعرض.
   الاعتمادُ نفسُه بالقاعدة (RPC inventory_apply_count): خطوةٌ واحدة، والفرقُ = المعدود − ما رآه العادّ،
   والكميةُ الجديدة = الحالية + الفرق (حركةٌ جرت أثناء العدّ لا تُمحى)؛ النقصُ من الدفعات بـFEFO.
     • parse(v): خانةُ العدّ ⇒ رقمٌ ≥ 0 أو null (فارغ = لم يُعدّ ⇒ لا يُلمس — العدُّ الجزئي مسموح).
     • lines(rows): الصفوفُ المعدودة ⇒ [{item_id, seen, counted}] للقاعدة.
     • report(lines, items): سطورُ التقرير + مجاميعُ القيمة لكل عملةٍ على حدة (نقص · زيادة · صافٍ) — لا جمعَ بين عملتين،
       والقيمةُ بسعر الشراء لحظةَ الجرد (unit_price بالسطر) لا بالسعر الحالي.
     • blankSheet(model) ورقةُ عدٍّ «عمياء» (بلا كمية النظام — الممارسةُ المعتمدة كي لا يُنسخ الرقم) ·
       reportSheet(model) تقريرُ الفروق للطباعة · reportRows للإكسل. */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function fmt(n) { return r2(n).toLocaleString('en-US'); }
  function sfmt(n) { n = r2(n); return (n > 0 ? '+' : '') + n.toLocaleString('en-US'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(d) {
    d = d ? new Date(d) : new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function parse(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '') return null;
    var n = Number(s);
    return (isFinite(n) && n >= 0) ? r2(n) : null;
  }

  /* rows: [{ item_id, seen, counted (نص/رقم/فارغ) }] */
  function lines(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var c = parse(r && r.counted);
      if (!r || !r.item_id || c === null) return;
      out.push({ item_id: r.item_id, seen: r2(Math.max(num(r.seen), 0)), counted: c });
    });
    return out;
  }

  function variance(seen, counted) { return r2(num(counted) - num(seen)); }

  /* lines: سطورُ inventory_count_lines (expected, counted, variance, unit_price, currency, item_id) ·
     names: { item_id: {name, unit} } */
  function report(lns, names) {
    var rows = [], tot = {}, diffs = 0;
    (lns || []).forEach(function (l) {
      var v = r2(l.variance), price = (l.unit_price == null || l.unit_price === '') ? null : num(l.unit_price);
      var value = (price != null && price > 0) ? r2(v * price) : null;
      var cur = l.currency || 'SYP';
      if (v !== 0) diffs++;
      if (value != null && v !== 0) {
        var t = tot[cur] || (tot[cur] = { short: 0, over: 0, net: 0 });
        if (value < 0) t.short = r2(t.short + value); else t.over = r2(t.over + value);
        t.net = r2(t.net + value);
      }
      var nm = (names && names[l.item_id]) || {};
      rows.push({ item_id: l.item_id, name: nm.name || '—', unit: nm.unit || '', expected: r2(l.expected), counted: r2(l.counted),
                  variance: v, value: value, currency: cur, unpriced: v !== 0 && value == null });
    });
    rows.sort(function (a, b) { return (Math.abs(b.value || 0) - Math.abs(a.value || 0)) || (Math.abs(b.variance) - Math.abs(a.variance)) || String(a.name).localeCompare(String(b.name), 'ar'); });
    return { rows: rows, totals: tot, counted: rows.length, diffs: diffs, unpriced: rows.filter(function (r) { return r.unpriced; }).length };
  }

  function head(model, title) {
    return '<div class="ivo-head"><div class="ivo-clinic">' + esc(model.clinic || 'العيادة') + '</div>'
      + '<div class="ivo-muted">' + esc(dmy(model.date)) + '</div></div>'
      + '<div class="ivo-title">' + esc(title) + '</div>';
  }

  /* model: { clinic, date, items:[{name, unit}] } */
  function blankSheet(model) {
    var h = '<div class="ivo-page" dir="rtl">' + head(model, 'ورقة جرد');
    h += '<table class="ivo-grid"><thead><tr><th>#</th><th>الصنف</th><th>الوحدة</th><th>المعدود</th><th>ملاحظة</th></tr></thead><tbody>';
    (model.items || []).forEach(function (it, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + esc(it.name) + '</td><td>' + esc(it.unit || '—') + '</td><td class="ivo-blank"></td><td class="ivo-blank"></td></tr>';
    });
    h += '</tbody></table><div class="ivo-sign"><div>العادّ: ____________________</div><div>التاريخ: ____________</div></div></div>';
    return h;
  }

  /* model: { clinic, date, note, rep (report()), money(n, cur) ⇒ نص } */
  function reportSheet(model) {
    var rep = model.rep, money = model.money || function (n, c) { return fmt(n) + ' ' + c; };
    var h = '<div class="ivo-page" dir="rtl">' + head(model, 'تقرير الجرد — الفروق');
    h += '<div class="ivo-muted" style="margin-bottom:8px;">عُدّ ' + rep.counted + ' صنف · فروق ' + rep.diffs + '</div>';
    h += '<table class="ivo-grid"><thead><tr><th>الصنف</th><th>بالنظام</th><th>المعدود</th><th>الفرق</th><th>القيمة</th></tr></thead><tbody>';
    rep.rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td>' + esc(fmt(r.expected)) + '</td><td>' + esc(fmt(r.counted)) + '</td>'
        + '<td class="ivo-q"><bdi dir="ltr">' + esc(sfmt(r.variance)) + '</bdi></td>'
        + '<td>' + (r.value == null ? (r.unpriced ? 'بلا سعر' : '—') : '<bdi dir="ltr">' + esc((r.value > 0 ? '+' : '') + money(r.value, r.currency)) + '</bdi>') + '</td></tr>';
    });
    h += '</tbody></table>';
    Object.keys(rep.totals).forEach(function (c) {
      var t = rep.totals[c];
      h += '<div class="ivo-note">' + esc(c === 'USD' ? 'بالدولار' : 'بالليرة') + ': نقص ' + esc(money(Math.abs(t.short), c))
        + ' · زيادة ' + esc(money(t.over, c)) + ' · الصافي <bdi dir="ltr">' + esc((t.net > 0 ? '+' : '') + money(t.net, c)) + '</bdi></div>';
    });
    if (model.note) h += '<div class="ivo-note">' + esc(model.note) + '</div>';
    h += '</div>';
    return h;
  }

  var REPORT_HEADERS = ['الصنف', 'الوحدة', 'بالنظام', 'المعدود', 'الفرق', 'القيمة', 'العملة'];
  function reportRows(rep) {
    return rep.rows.map(function (r) {
      return [r.name, r.unit, r.expected, r.counted, r.variance, r.value == null ? '' : r.value, r.value == null ? '' : r.currency];
    });
  }

  function printHtml(html) {
    var root = document.getElementById('ivoPrintRoot');
    if (!root) { root = document.createElement('div'); root.id = 'ivoPrintRoot'; document.body.appendChild(root); }
    root.innerHTML = html;
    document.body.classList.add('ivo-printing');
    var cleanup = function () { document.body.classList.remove('ivo-printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
  }

  window.SyDentInvCount = { parse: parse, lines: lines, variance: variance, report: report, blankSheet: blankSheet,
    reportSheet: reportSheet, REPORT_HEADERS: REPORT_HEADERS, reportRows: reportRows, printHtml: printHtml, sfmt: sfmt, dmy: dmy };
})();
