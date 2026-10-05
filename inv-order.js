/* inv-order.js — M170 (جولة المخزون، البند 2): «جهّز الطلبية» من النواقص — مصدرٌ واحد.
   • isLow(it): تعريفٌ واحد لـ«يحتاج إعادة طلب» عبر الشاشات (#702) — نافدٌ (≤ 0) أو عند حدّ التنبيه وتحته.
     (كانت صفحةُ المخزون تستثني النافدَ بلا حدّ، واللوحةُ تعدّه — والتعليق يقول «نفس الشرط حرفياً».)
   • suggest(it): Open Dental «Order Qty» — أصغرُ مضاعفٍ لكمية الطلب يرفع المتوفّر فوق الحدّ
     (حدٌّ 20 · متوفّر 5 · كمية طلب 10 ⇒ 20). بلا كمية طلب ⇒ null: يُكتب باليد، والنافذةُ تدلّ على الإعداد (#696).
   • text(order) نصُّ واتساب · sheet(order) ورقةُ طباعة (بلا أسعار — تُرسل للمورّد) · rows(order) لإكسل ·
     costs(order) كلفةٌ تقديرية لكل عملة على حدة (لا جمعَ بين عملتين) — تُعرض للطبيب بالنافذة فقط. */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function isLow(it) {
    if (!it || it.is_active === false) return false;
    var q = num(it.quantity), r = num(it.reorder_level);
    return q <= 0 || (r > 0 && q <= r);
  }

  function suggest(it) {
    var Q = num(it && it.reorder_qty);
    if (!(Q > 0)) return null;
    var q = Math.max(num(it.quantity), 0), r = Math.max(num(it.reorder_level), 0);
    var k = Math.max(1, Math.floor((r - q) / Q) + 1);
    return Math.round(k * Q * 100) / 100;
  }

  /* order: { clinic, supplier, note, date, lines:[{ name, unit, qty, current, level, price, currency }] } — الأسطرُ المضمَّنة بكمية > 0 فقط */
  function clean(order) {
    return ((order && order.lines) || []).filter(function (l) { return l && num(l.qty) > 0; });
  }

  function text(order) {
    var L = clean(order);
    var out = ['🧾 طلبية مواد' + (order.clinic ? ' — ' + order.clinic : '')];
    if (order.supplier) out.push('إلى: ' + order.supplier);
    out.push('التاريخ: ' + dmy(order.date));
    out.push('');
    L.forEach(function (l, i) {
      out.push((i + 1) + ') ' + l.name + ' — ' + fmt(l.qty) + (l.unit ? ' ' + l.unit : ''));
    });
    if (order.note) { out.push(''); out.push(order.note); }
    return out.join('\n');
  }

  function sheet(order) {
    var L = clean(order);
    var h = '<div class="ivo-page" dir="rtl">';
    h += '<div class="ivo-head"><div class="ivo-clinic">' + esc(order.clinic || 'العيادة') + '</div>'
      + (order.phone ? '<div class="ivo-muted">📞 <span dir="ltr">' + esc(order.phone) + '</span></div>' : '')
      + '<div class="ivo-muted">' + esc(dmy(order.date)) + '</div></div>';
    h += '<div class="ivo-title">طلبية مواد' + (order.supplier ? ' — إلى: ' + esc(order.supplier) : '') + '</div>';
    h += '<table class="ivo-grid"><thead><tr><th>#</th><th>الصنف</th><th>الكمية المطلوبة</th><th>الوحدة</th></tr></thead><tbody>';
    L.forEach(function (l, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + esc(l.name) + '</td><td class="ivo-q">' + esc(fmt(l.qty)) + '</td><td>' + esc(l.unit || '—') + '</td></tr>';
    });
    h += '</tbody></table>';
    if (order.note) h += '<div class="ivo-note">' + esc(order.note) + '</div>';
    h += '<div class="ivo-sign"><div>التوقيع: ____________________</div><div>الاستلام: ____________________</div></div></div>';
    return h;
  }

  function rows(order) {
    return clean(order).map(function (l, i) {
      return [i + 1, l.name, Math.round(num(l.qty) * 100) / 100, l.unit || '', Math.round(num(l.current) * 100) / 100,
              num(l.level) > 0 ? num(l.level) : ''];
    });
  }
  var HEADERS = ['#', 'الصنف', 'الكمية المطلوبة', 'الوحدة', 'المتوفّر', 'حدّ التنبيه'];

  function costs(order) {
    var bag = {}, missing = 0;
    clean(order).forEach(function (l) {
      if (l.price == null || l.price === '' || !(num(l.price) > 0)) { missing++; return; }
      var c = l.currency || 'SYP';
      bag[c] = (bag[c] || 0) + num(l.qty) * num(l.price);
    });
    return { bag: bag, missing: missing };
  }

  /* الطباعة متزامنةٌ داخل النقرة — لا await قبل window.print() (iOS) — نمطُ lab-slip */
  function print(order) {
    if (!clean(order).length) return false;
    var root = document.getElementById('ivoPrintRoot');
    if (!root) { root = document.createElement('div'); root.id = 'ivoPrintRoot'; document.body.appendChild(root); }
    root.innerHTML = sheet(order);
    document.body.classList.add('ivo-printing');
    var cleanup = function () { document.body.classList.remove('ivo-printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
    return true;
  }

  function waUrl(order) { return 'https://wa.me/?text=' + encodeURIComponent(text(order)); }

  window.SyDentInvOrder = { isLow: isLow, suggest: suggest, text: text, sheet: sheet, rows: rows, HEADERS: HEADERS,
    costs: costs, print: print, waUrl: waUrl, clean: clean, dmy: dmy };
})();
