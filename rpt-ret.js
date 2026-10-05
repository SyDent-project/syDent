/* SYDENT_RPT_RET_START — تبويبُ «الاحتفاظ» بصفحة التقارير (v542)
   ─────────────────────────────────────────────────────────────
   يجيب: «كم مريض نشط عندي، عم يكبر العدد ولا يصغر؟ مين فقدنا، ومين زارنا وطلع بلا موعد جاي؟»
   (Dentrix Practice Advisor «Active patient base» + «Continuing Care: patients seen and appointed» ·
   Dentrix Magazine «active patients in the past 12 months» · Curve «Recare» dashboards · Open Dental «Active Patients»).

   العقد (لا يُخالَف):
   • **الزيارة** = جلسةُ علاجٍ منجزة (`SyRptNew.isVisit`: لا مخطّط · لا رسم غياب · لا رصيدَ سابق).
   • **النشط بتاريخٍ ما** = له زيارةٌ خلال الأشهر الـ12 السابقة حتى ذلك التاريخ (ضمناً).
     المرجعُ = نهايةُ الفترة (ولا يتجاوز اليوم)، والمقارنةُ باليوم السابق لبدايتها.
   • **فقدناهم بالفترة** = كانوا نشطين قبل بدايتها بيوم وما عادوا نشطين بنهايتها.
   • **الجدد** = تعريفُ تبويب المرضى الجدد حرفياً (`SyRptNew.pickNew`) ⇒ **صافي النمو = جدد − مفقودون**.
   • **حجزوا الخطوة الجاية** = مَن زار بالفترة وله بالعيادة موعدٌ بعد آخر زيارةٍ له (غيرُ ملغى · لا غياب · غيرُ مخطّط)
     — سواءٌ حضره أم ما زال قادماً. النسبةُ من 3 زيارات فأكثر.
   • **النطاق:** زياراتُ الأطباء الظاهرين (نفسُ قاعدة التبويبات الأخرى)؛ «كل العيادة» تشمل غيرَ المسنَد.
   • صفرُ كتابة · لا رقمَ مالي · كلُّ نصٍّ من البيانات مهرَّب.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRptRet) return;

  var ACTIVE_MONTHS = 12, TREND_MONTHS = 12, MIN_RATE = 3, LIST_MAX = 30;
  var NOT_NEXT = { cancelled: 1, no_show: 1, broken: 1 };

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + p2(m) + '-' + p2(d); }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  /* YYYY-MM-DD ناقص n شهراً، واليومُ يُقصّ على طول الشهر (31/3 − 1 ⇒ 28 أو 29/2). */
  function minusMonths(s, n) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7) - n, d = +s.slice(8, 10);
    while (m < 1) { m += 12; y--; }
    return ymd(y, m, Math.min(d, lastDay(y, m)));
  }
  function dayBefore(s) {
    var d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) - 1);
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function N() { return window.SyRptNew; }

  /* تواريخُ زيارات كل مريض (مرتّبة) — من الزيارات المُمرَّرة كما هي (مفلترةً بالنطاق مسبقاً). */
  function byPatient(visits) {
    var m = {};
    (visits || []).forEach(function (s) {
      if (!s || !s.patient_id || !s.date || !N().isVisit(s)) return;
      (m[s.patient_id] = m[s.patient_id] || []).push(s.date);
    });
    Object.keys(m).forEach(function (k) { m[k].sort(); });
    return m;
  }
  /* النشطون بتاريخ ref: زيارةٌ ضمن (ref − 12 شهراً، ref]. */
  function activeAt(bp, ref) {
    var lo = minusMonths(ref, ACTIVE_MONTHS), out = {};
    Object.keys(bp).forEach(function (pid) {
      var d = bp[pid];
      for (var i = d.length - 1; i >= 0; i--) {
        if (d[i] > ref) continue;
        if (d[i] > lo) out[pid] = d[i];
        break;
      }
    });
    return out;   // pid → آخرُ زيارة حتى ref
  }
  function count(o) { return Object.keys(o).length; }

  /* o: { from, to, today, visits:[زيارات النطاق من كل التاريخ], all:[كل الزيارات بلا نطاق — للجدد], inScope, appts:[...] } */
  function compute(o) {
    var ref = o.to < o.today ? o.to : o.today;
    var bp = byPatient(o.visits);
    var aEnd = activeAt(bp, ref), aStart = activeAt(bp, dayBefore(o.from));
    var lost = Object.keys(aStart).filter(function (pid) { return !aEnd[pid]; })
      .map(function (pid) { return { id: pid, last: aStart[pid] }; })
      .sort(function (a, b) { return a.last < b.last ? 1 : (a.last > b.last ? -1 : 0); });
    var newIds = N().pickNew(o.all || [], { from: o.from, to: ref }, o.inScope);
    var isNew = {}; newIds.forEach(function (pid) { isNew[pid] = true; });

    /* زاروا بالفترة وآخرُ زيارةٍ لكلٍّ منهم */
    var lastIn = {};
    Object.keys(bp).forEach(function (pid) {
      bp[pid].forEach(function (d) { if (d >= o.from && d <= ref && (!lastIn[pid] || d > lastIn[pid])) lastIn[pid] = d; });
    });
    var nextBy = {};
    (o.appts || []).forEach(function (a) {
      if (!a || !a.patient_id || !a.date || a.is_planned === true || NOT_NEXT[a.status]) return;
      var l = lastIn[a.patient_id];
      if (l && a.date > l && (!nextBy[a.patient_id] || a.date < nextBy[a.patient_id])) nextBy[a.patient_id] = a.date;
    });
    var visited = Object.keys(lastIn);
    var booked = visited.filter(function (pid) { return !!nextBy[pid]; }).length;
    var noNext = visited.filter(function (pid) { return !nextBy[pid]; })
      .map(function (pid) { return { id: pid, last: lastIn[pid], isNew: !!isNew[pid] }; })
      .sort(function (a, b) { return a.last < b.last ? 1 : (a.last > b.last ? -1 : 0); });

    /* الاتجاه: نهايةُ كل شهر لآخر 12 شهراً حتى المرجع (الشهرُ الأخير ينتهي بالمرجع نفسه). */
    var trend = [], y = +ref.slice(0, 4), m = +ref.slice(5, 7);
    for (var k = TREND_MONTHS - 1; k >= 0; k--) {
      var yy = y, mm = m - k;
      while (mm < 1) { mm += 12; yy--; }
      var start = ymd(yy, mm, 1), end = (k === 0) ? ref : ymd(yy, mm, lastDay(yy, mm));
      var a1 = activeAt(bp, end), a0 = activeAt(bp, dayBefore(start));
      trend.push({ key: start.slice(0, 7), label: mm + '/' + yy, active: count(a1),
        lost: Object.keys(a0).filter(function (pid) { return !a1[pid]; }).length,
        fresh: N().pickNew(o.all || [], { from: start, to: end }, o.inScope).length });
    }
    return { ref: ref, activeEnd: count(aEnd), activeStart: count(aStart), lost: lost, newN: newIds.length,
      visited: visited.length, returning: visited.filter(function (pid) { return !isNew[pid]; }).length,
      booked: booked, noNext: noNext, trend: trend };
  }

  function pctB(a, b) { return '<bdi dir="ltr">' + Math.round(a / b * 100) + '%</bdi>'; }
  function signed(n) { return '<bdi dir="ltr">' + (n > 0 ? '+' + n : String(n)) + '</bdi>'; }
  function ptWord(n) { return N().ptWord(n); }

  /* o: { name(id)→نص, prof(id), recallLink, numDate(ymd) } */
  function render(m, o) {
    o = o || {};
    var nm = o.name || function () { return ''; };
    var prof = o.prof || function (id) { return 'patient-profile.html?id=' + encodeURIComponent(id); };
    var nd = o.numDate || function (d) { return d; };
    if (!m.activeEnd && !m.activeStart && !m.visited) {
      return '<div class="empty-state"><div class="ic">🔁</div><div class="ttl">لا زيارات بآخر 12 شهراً لهذا النطاق</div>'
        + '<div style="margin-top:6px;">المريضُ النشط مَن له علاجٌ منجز خلال آخر 12 شهراً.</div></div>';
    }
    var diff = m.activeEnd - m.activeStart, net = m.newN - m.lost.length;
    var html = '<div class="summary-row rt-summary">'
      + '<div class="stat-card green"><div class="lbl">المرضى النشطون</div><div class="val">' + m.activeEnd + '</div>'
      +   '<div class="sub">لهم علاجٌ منجز خلال آخر 12 شهراً حتى ' + esc(nd(m.ref)) + '</div>'
      +   '<div class="rt-dl"><span class="rt-d rt-pts ' + (diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')) + '">' + signed(diff) + '</span> <span>منذ بداية الفترة (' + m.activeStart + ')</span></div></div>'
      + '<div class="stat-card"><div class="lbl">زاروا بالفترة</div><div class="val">' + m.visited + '</div>'
      +   '<div class="sub">جدد ' + m.newN + ' · راجعون ' + m.returning + '</div></div>'
      + '<div class="stat-card ' + (net < 0 ? 'orange' : 'blue') + '"><div class="lbl">صافي النمو</div><div class="val">' + signed(net) + '</div>'
      +   '<div class="sub">جدد ' + m.newN + ' − فقدناهم ' + m.lost.length + '</div></div>'
      + '<div class="stat-card"><div class="lbl">حجزوا الخطوة الجاية</div><div class="val">' + (m.visited >= MIN_RATE ? pctB(m.booked, m.visited) : '—') + '</div>'
      +   '<div class="sub">' + (m.visited ? m.booked + ' من ' + ptWord(m.visited) + ' لهم موعدٌ بعد آخر زيارة' : 'لا زيارات بالفترة') + '</div></div>'
      + '</div>';

    var mx = Math.max.apply(null, m.trend.map(function (t) { return t.active; }).concat([1]));
    html += '<section class="rt-card"><h3 class="rt-h">قاعدةُ المرضى النشطين <small class="rt-hs">بنهاية كل شهر</small></h3><div class="rt-mini rt-grid2">';
    m.trend.forEach(function (t) {
      html += '<div class="rt-mini-row"><span>' + esc(t.label) + ' <small class="rt-pn">جدد ' + t.fresh + ' · فقدنا ' + t.lost + '</small></span>'
        + '<b>' + t.active + '</b><i class="rt-bar"><i style="width:' + Math.round(t.active / mx * 100) + '%"></i></i></div>';
    });
    html += '</div></section>';

    var chips = function (list, sub) {
      var h = '<div class="rt-chips">';
      list.slice(0, LIST_MAX).forEach(function (r) {
        h += '<a class="rt-chip" href="' + esc(prof(r.id)) + '"><b>' + esc(nm(r.id) || '—') + '</b><small>' + sub(r) + '</small></a>';
      });
      return h + '</div>' + (list.length > LIST_MAX ? '<div class="rt-note">… و' + ptWord(list.length - LIST_MAX) + ' غيرهم — القائمةُ كاملةً بملف Excel.</div>' : '');
    };
    if (m.noNext.length) {
      html += '<section class="rt-card"><h3 class="rt-h">زاروا وطلعوا بلا موعد جاي <small class="rt-hs">' + ptWord(m.noNext.length) + ' — الأسهلُ استرجاعاً</small></h3>'
        + chips(m.noNext, function (r) { return 'آخر زيارة ' + esc(nd(r.last)) + (r.isNew ? ' · جديد' : ''); }) + '</section>';
    }
    if (m.lost.length) {
      html += '<section class="rt-card"><h3 class="rt-h">فقدناهم بهذه الفترة <small class="rt-hs">مرّ على آخر علاجٍ لهم 12 شهراً</small></h3>'
        + chips(m.lost, function (r) { return 'آخر علاج ' + esc(nd(r.last)); })
        + '<div class="rt-note">↩️ رسائلُ الاسترجاع جاهزةٌ من <a href="' + esc(o.recallLink || 'patients.html?open=recall') + '">قائمة الاستدعاء</a> بصفحة المرضى.</div></section>';
    }
    return html;
  }

  window.SyRptRet = { ACTIVE_MONTHS: ACTIVE_MONTHS, MIN_RATE: MIN_RATE, minusMonths: minusMonths, dayBefore: dayBefore,
    byPatient: byPatient, activeAt: activeAt, compute: compute, render: render };
})();
/* SYDENT_RPT_RET_END */
