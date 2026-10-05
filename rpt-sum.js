/* SYDENT_RPT_SUM_START — تبويبُ «📄 ملخّص الفترة» بصفحة التقارير (v545)
   ─────────────────────────────────────────────────────────────
   صفحةٌ واحدة تُطبع أو تُرسل: الفترة مقابل الفترة السابقة ومقابل نفس الفترة من السنة الماضية
   (Dentrix «Practice Advisor Report»: الشهر · السابق · منذ بداية السنة · نفسه العام الماضي — بلا «معايير الصناعة»
   الأمريكية لأنها لا تنطبق على السوق السوري؛ المقارنةُ بتاريخ العيادة نفسها).

   العقد (لا يُخالَف):
   • **هذه الوحدةُ لا تحسب شيئاً** — ترسم وتنسّق فقط. كلُّ رقمٍ يصلها محسوباً بمحرّكات التبويبات نفسها
     (clinicTotals · SyRptTreat.aggregate · computeProviderStats · SyRptNew.pickNew · SyRptRet.activeAt · SyRptAtt.compute)
     داخل withCurrencyLayer/withCtx — لا معادلةَ ثانية (#684).
   • القيمُ المالية أكياسٌ لكل عملة (#481)؛ النسبُ تُقارن بالنقاط المئوية؛ الغائبُ «—» لا صفر (#689).
   • صفرُ كتابة · كلُّ نصٍّ من البيانات مهرَّب.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRptSum) return;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isBag(v) { return !!v && typeof v === 'object' && ('SYP' in v || 'USD' in v); }
  function total(v) { return isBag(v) ? (Number(v.SYP) || 0) + (Number(v.USD) || 0) : Number(v); }
  function has(v) { return v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v)); }

  /* الفرقُ عن مرجع: نسبةٌ مئوية للأعداد والمبالغ (كلُّ عملةٍ على حدة إن اختلطتا)، ونقاطٌ للنسب. */
  function change(row, cur, ref) {
    if (!has(cur) || !has(ref)) return null;
    if (row.kind === 'pct') return { pts: Math.round((cur - ref) * 100) };
    if (isBag(cur)) {
      /* عملةٌ واحدة بالطرفين ⇒ تُقارن بها (دولارٌ ظهر حديثاً لا يعطّل مقارنة الليرة)؛ عملتان بالطرفين ⇒ «بعملتين». */
      var any = ['SYP', 'USD'].filter(function (c) { return (Number(cur[c]) || 0) || (Number(ref[c]) || 0); });
      if (!any.length) return { same: true };
      var both = any.filter(function (c) { return (Number(cur[c]) || 0) && (Number(ref[c]) || 0); });
      var use = any.length === 1 ? any[0] : (both.length === 1 ? both[0] : null);
      if (!use) return both.length ? { mixed: true } : ((Number(cur.SYP) || 0) + (Number(cur.USD) || 0) ? { fresh: true } : { same: true });
      cur = Number(cur[use]) || 0; ref = Number(ref[use]) || 0;
    }
    if (!(ref > 0)) return cur > 0 ? { fresh: true } : { same: true };
    return { pct: Math.round((cur - ref) / ref * 100) };
  }
  function changeHtml(row, ch) {
    if (!ch) return '<span class="rs-ch flat">—</span>';
    if (ch.mixed) return '<span class="rs-ch flat">بعملتين</span>';
    if (ch.same) return '<span class="rs-ch flat">=</span>';
    if (ch.fresh) return row.higherBad ? '<span class="rs-ch down">▲ من صفر</span>' : '<span class="rs-ch new">جديد</span>';
    var d = ch.pts !== undefined ? ch.pts : ch.pct;
    if (!d) return '<span class="rs-ch flat">=</span>';
    var bad = row.higherBad ? d > 0 : d < 0;
    return '<span class="rs-ch ' + (bad ? 'down' : 'up') + '"><bdi dir="ltr">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + (ch.pts !== undefined ? '' : '%') + '</bdi>'
      + (ch.pts !== undefined ? (Math.abs(d) >= 3 && Math.abs(d) <= 10 ? ' نقاط' : ' نقطة') : '') + '</span>';
  }
  function changeText(row, ch) {
    if (!ch || ch.mixed || ch.same) return '';
    if (ch.fresh) return row.higherBad ? '▲ من صفر' : 'جديد';
    var d = ch.pts !== undefined ? ch.pts : ch.pct;
    if (!d) return '';
    return (d > 0 ? '▲' : '▼') + Math.abs(d) + (ch.pts !== undefined ? ' نقطة' : '%');
  }

  /* snap: { title, sub, cols:{cur,prev,ly}(نصوص الفترات), sections:[{title, rows:[{label, kind, cur, prev, ly, higherBad, note}]}],
             top:[{name, n, bag}], notes:[...] } · o: { val(row, v)→نص } */
  function render(snap, o) {
    o = o || {};
    var val = o.val || function (r, v) { return has(v) ? String(v) : '—'; };
    var html = '<div class="rs-head"><div><div class="rs-title">' + esc(snap.title) + '</div><div class="rs-sub">' + esc(snap.sub) + '</div></div>'
      + '<div class="rs-actions no-print"><button type="button" class="btn btn-outline btn-sm" data-rs="print">🖨️ طباعة / PDF</button>'
      + '<button type="button" class="btn btn-outline btn-sm" data-rs="copy">📋 نصٌّ للواتساب</button></div></div>';
    if (snap.notes && snap.notes.length) html += '<div class="rt-note" style="margin:0 0 12px;">' + snap.notes.map(esc).join('<br>') + '</div>';
    snap.sections.forEach(function (sec) {
      html += '<section class="rt-card rs-sec"><h3 class="rt-h">' + esc(sec.title) + '</h3><div class="rs-table" role="table">'
        + '<div class="rs-tr rs-th" role="row"><span role="columnheader"></span><span role="columnheader">' + esc(snap.cols.cur) + '</span>'
        + '<span role="columnheader">' + esc(snap.cols.prev) + '</span><span role="columnheader">' + esc(snap.cols.ly) + '</span></div>';
      sec.rows.forEach(function (r) {
        html += '<div class="rs-tr" role="row"><span class="rs-lbl" role="rowheader">' + esc(r.label) + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</span>'
          + '<span class="rs-v rs-cur" data-l="' + esc(snap.cols.cur) + '"><b>' + val(r, r.cur) + '</b></span>'
          + '<span class="rs-v" data-l="' + esc(snap.cols.prev) + '">' + val(r, r.prev) + ' ' + changeHtml(r, change(r, r.cur, r.prev)) + '</span>'
          + '<span class="rs-v" data-l="' + esc(snap.cols.ly) + '">' + val(r, r.ly) + ' ' + changeHtml(r, change(r, r.cur, r.ly)) + '</span></div>';
      });
      html += '</div></section>';
    });
    if (snap.top && snap.top.length) {
      html += '<section class="rt-card rs-sec"><h3 class="rt-h">أكثر العلاجات إجراءً بالفترة</h3><ol class="rs-top">';
      snap.top.forEach(function (t) { html += '<li><b>' + esc(t.name) + '</b> <span>' + t.n + ' · ' + (o.bag ? o.bag(t.bag) : '') + '</span></li>'; });
      html += '</ol></section>';
    }
    html += '<div class="rs-foot">أُنشئ من SyDent — ' + esc(snap.stamp || '') + '</div>';
    return html;
  }

  /* نصٌّ عادي قصير للواتساب: الفترة الحالية مع الفرق عن السابقة (والسنة الماضية إن وُجدت). */
  function text(snap, o) {
    o = o || {};
    var plain = o.plain || function (r, v) { return has(v) ? String(v) : '—'; };
    var out = ['📊 ' + snap.title, snap.sub, ''];
    snap.sections.forEach(function (sec) {
      out.push('▪️ ' + sec.title);
      sec.rows.forEach(function (r) {
        if (!has(r.cur)) return;
        var a = changeText(r, change(r, r.cur, r.prev)), b = changeText(r, change(r, r.cur, r.ly));
        var tail = [a ? a + ' عن السابقة' : '', b ? b + ' عن السنة الماضية' : ''].filter(Boolean).join(' · ');
        out.push('• ' + r.label + ': ' + plain(r, r.cur) + (tail ? ' (' + tail + ')' : ''));
      });
      out.push('');
    });
    if (snap.top && snap.top.length) out.push('🦷 الأكثر إجراءً: ' + snap.top.slice(0, 3).map(function (t) { return t.name + ' (' + t.n + ')'; }).join('، '));
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  window.SyRptSum = { change: change, render: render, text: text, total: total };
})();
/* SYDENT_RPT_SUM_END */
