/* mat-cost.js — جولة المخزون، البند 6: كلفةُ المواد المستهلكة — **دالّةٌ واحدة** للمحاسبة وتبويب «🧪 المواد» بالتقارير (#684).
   التعريفُ نفسُه الذي كانت المحاسبة تحسبه داخلها (P3-C1 · M125): Σ |حركات consume| ضمن الفترة المحلية × سعرُ الشراء
   **الحالي** للصنف، بعملة الصنف (لا جمعَ بين عملتين)، والصنفُ المجهول يُتجاوز. للعرض فقط — لا يدخل معادلة الربح.
     • cost(items, movements, from, to, inRange) ⇒ { bag, byItem, months, byMonth, byTreatment, byProvider, count }
       كلُّ تفصيلٍ يحفظ المجموع: Σ byItem = Σ byTreatment = Σ byProvider = bag (يثبتها المثبت).
       التصنيفُ بالعلاج من نوع الجلسة (session.type)، وبالطبيب من provider_id (M169) — وما بلا جلسة يُعلَن كذلك.
     • render(model, opts): HTML التبويب (مهرَّب · النسبُ والأرقامُ الموقَّعة معزولةٌ LTR — #704 · الغائبُ «—» — #703). */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function curOf(it) { return (it && it.currency === 'USD') ? 'USD' : 'SYP'; }
  function monthOf(ts) {
    var d = new Date(ts); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function bag() { return { SYP: 0, USD: 0 }; }

  function cost(items, movements, from, to, inRange) {
    var byId = {};
    (items || []).forEach(function (it) { byId[it.id] = it; });
    var out = { bag: bag(), count: 0, byItemMap: {}, monthsSet: {}, byMonth: {}, byTreatMap: {}, byProvMap: {} };
    (movements || []).forEach(function (m) {
      if (m.reason && m.reason !== 'consume') return;
      if (!inRange(m.created_at, from, to)) return;
      var it = byId[m.item_id];
      if (!it) return;                                     // صنفٌ مجهول — كما بالمحاسبة
      var qty = Math.abs(num(m.change)), cur = curOf(it), c = qty * num(it.purchase_price);
      out.bag[cur] += c;
      out.count++;
      var bi = out.byItemMap[m.item_id] || (out.byItemMap[m.item_id] = { item_id: m.item_id, name: it.name || '—', unit: it.unit || '', cur: cur, qty: 0, cost: 0 });
      bi.qty += qty; bi.cost += c;
      var mo = monthOf(m.created_at);
      out.monthsSet[mo] = true;
      var bm = out.byMonth[mo] || (out.byMonth[mo] = {});
      bm[m.item_id] = (bm[m.item_id] || 0) + qty;
      var tk = (m.session && m.session.type) ? String(m.session.type) : (m.session_id ? '—' : '');
      var bt = out.byTreatMap[tk] || (out.byTreatMap[tk] = { key: tk, bag: bag(), sessions: {} });
      bt.bag[cur] += c;
      if (m.session_id) bt.sessions[m.session_id] = true;
      var pk = m.provider_id || '';
      var bp = out.byProvMap[pk] || (out.byProvMap[pk] = { id: pk, bag: bag() });
      bp.bag[cur] += c;
    });
    function weight(b) { return num(b.SYP) + num(b.USD) * 1e9; }    // ترتيبٌ فقط (الدولارُ أولاً) — لا جمعَ معروض
    var byItem = Object.keys(out.byItemMap).map(function (k) { var x = out.byItemMap[k]; x.qty = r2(x.qty); x.cost = r2(x.cost); return x; })
      .sort(function (a, b) { return (a.cur === b.cur ? b.cost - a.cost : (a.cur === 'USD' ? -1 : 1)) || String(a.name).localeCompare(String(b.name), 'ar'); });
    var byTreatment = Object.keys(out.byTreatMap).map(function (k) { var x = out.byTreatMap[k]; return { key: x.key, bag: { SYP: r2(x.bag.SYP), USD: r2(x.bag.USD) }, sessions: Object.keys(x.sessions).length }; })
      .sort(function (a, b) { return (a.key === '') - (b.key === '') || weight(b.bag) - weight(a.bag); });
    var byProvider = Object.keys(out.byProvMap).map(function (k) { var x = out.byProvMap[k]; return { id: x.id, bag: { SYP: r2(x.bag.SYP), USD: r2(x.bag.USD) } }; })
      .sort(function (a, b) { return (a.id === '') - (b.id === '') || weight(b.bag) - weight(a.bag); });
    return { bag: { SYP: out.bag.SYP, USD: out.bag.USD }, count: out.count, byItem: byItem,
             months: Object.keys(out.monthsSet).filter(Boolean).sort(), byMonth: out.byMonth, byTreatment: byTreatment, byProvider: byProvider };
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return r2(n).toLocaleString('en-US'); }
  function bagText(b, money) {
    var p = [];
    if (num(b.SYP) > 0) p.push(money(r2(b.SYP), 'SYP'));
    if (num(b.USD) > 0) p.push(money(r2(b.USD), 'USD'));
    return p.length ? p.join(' + ') : '—';
  }
  function share(part, total) {
    if (!(num(total) > 0)) return '—';
    return '<bdi dir="ltr">' + Math.round(num(part) / num(total) * 100) + '%</bdi>';
  }
  /* v487 (قرار المالك: «التاريخ بس أرقام»): الشهرُ رقمياً 10/2026 — أسماءُ الأشهر محصورةٌ بعناوين التقويم */
  function monthLabel(mo) { var p = String(mo).split('-'); return p.length === 2 ? (p[1] + '/' + p[0]) : String(mo); }

  /* opts: { money(n, cur), docName(id), hasPrices } */
  function render(m, opts) {
    var money = opts.money;
    if (!m.count) {
      return '<div class="empty-state"><div class="ic">🧪</div><div class="ttl">لا يوجد استهلاك مواد في هذه الفترة</div>'
        + '<div style="margin-top:6px;">يُسجَّل الخصمُ عند تأكيد «خصم مواد من المخزون» بعد الجلسة، أو عند تسجيل استهلاكٍ يدوي من المخزون.</div></div>';
    }
    var h = '<div class="rt-note" style="margin:0 0 14px;">💰 كلفة المواد في هذه الفترة: <strong>' + esc(bagText(m.bag, money)) + '</strong> — '
      + esc(String(m.count)) + ' حركة استهلاك. بسعر الشراء الحالي لكل صنف، وهي نفسها رقم «كلفة المواد» بالمحاسبة (للعرض فقط، ولا تدخل في حساب الربح).</div>';
    // حسب الصنف
    h += '<h3 class="rt-h" style="margin-top:18px;">📦 حسب الصنف</h3><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>الكلفة</th><th>النصيب</th></tr></thead><tbody>'
      + m.byItem.map(function (x) {
        return '<tr><td><strong>' + esc(x.name) + '</strong></td><td style="white-space:nowrap;">' + esc(fmt(x.qty)) + (x.unit ? ' ' + esc(x.unit) : '') + '</td>'
          + '<td style="white-space:nowrap;">' + (x.cost > 0 ? esc(money(x.cost, x.cur)) : '<span style="color:var(--text2);">بلا سعر</span>') + '</td>'
          + '<td>' + share(x.cost, m.bag[x.cur]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    // شهرياً
    if (m.months.length > 1 && m.months.length <= 12) {
      h += '<h3 class="rt-h" style="margin-top:18px;">🗓️ الاستهلاك الشهري (الكمية)</h3><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الصنف</th>'
        + m.months.map(function (mo) { return '<th style="white-space:nowrap;">' + esc(monthLabel(mo)) + '</th>'; }).join('') + '</tr></thead><tbody>'
        + m.byItem.map(function (x) {
          return '<tr><td><strong>' + esc(x.name) + '</strong></td>' + m.months.map(function (mo) {
            var q = (m.byMonth[mo] || {})[x.item_id];
            return '<td>' + (q ? esc(fmt(q)) : '<span style="color:var(--text2);">—</span>') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    // حسب العلاج
    h += '<h3 class="rt-h" style="margin-top:18px;">🦷 حسب العلاج</h3><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>العلاج</th><th>الجلسات</th><th>كلفة المواد</th><th>للجلسة الواحدة</th></tr></thead><tbody>'
      + m.byTreatment.map(function (t) {
        var per = t.sessions ? { SYP: t.bag.SYP / t.sessions, USD: t.bag.USD / t.sessions } : null;
        return '<tr><td><strong>' + (t.key ? esc(t.key) : '<span style="color:var(--text2);">بلا جلسة (يدوي أو قبل 2/10/2026)</span>') + '</strong></td>'
          + '<td>' + (t.sessions ? esc(String(t.sessions)) : '—') + '</td><td style="white-space:nowrap;">' + esc(bagText(t.bag, money)) + '</td>'
          + '<td style="white-space:nowrap;">' + (per ? esc(bagText(per, money)) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    // حسب الطبيب
    h += '<h3 class="rt-h" style="margin-top:18px;">👨‍⚕️ حسب الطبيب</h3><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الطبيب</th><th>كلفة المواد</th></tr></thead><tbody>'
      + m.byProvider.map(function (p) {
        return '<tr><td><strong>' + (p.id ? esc(opts.docName(p.id)) : '<span style="color:var(--text2);">بلا طبيب محدّد</span>') + '</strong></td>'
          + '<td style="white-space:nowrap;">' + esc(bagText(p.bag, money)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  var XLSX_HEADERS = ['الصنف', 'الوحدة', 'الكمية', 'الكلفة', 'العملة'];
  function xlsxRows(m) {
    return m.byItem.map(function (x) { return [x.name, x.unit, x.qty, x.cost, x.cur]; });
  }

  window.SyDentMatCost = { cost: cost, render: render, XLSX_HEADERS: XLSX_HEADERS, xlsxRows: xlsxRows, monthLabel: monthLabel };
})();
