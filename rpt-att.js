/* SYDENT_RPT_ATT_START — تبويبُ «الحضور والغياب» بصفحة التقارير (v541)
   ─────────────────────────────────────────────────────────────
   يجيب: «كم موعد راح علينا بالغياب والإلغاء، عند مين، بأي يوم وساعة، ومين المكرّرين؟»
   (Open Dental «Broken Appointments» · Dentrix «Broken Appointment / No-Show» + Practice Advisor
   «Schedule management» · Dentrix Ascend «Appointment Status» · Curve «missed appointments»).

   العقد (لا يُخالَف):
   • **تصنيفُ كل موعد** (بالترتيب — الحالةُ المُعلنة تغلب الأختام):
       مخطّط (is_planned) ⇒ خارج التقرير · بعد اليوم ⇒ «قادم» ·
       no_show/broken ⇒ **غاب** · cancelled ⇒ **ألغى**، إلا إن كان للمريض موعدٌ آخر غيرُ ملغى بنفس اليوم ⇒ **أُعيد جدولته** ·
       completed أو أيُّ ختم وصول/جلوس/انصراف ⇒ **حضر** · اليوم بلا نتيجة ⇒ «اليوم» · ما مضى بلا نتيجة ⇒ **بلا نتيجة مسجّلة**.
     مرآةُ `SyDentReliability` (pt-reliability.js): نفسُ «المنتهي» ونفسُ «الغياب» ونفسُ «الإلغاء لإعادة الجدولة ليس فشلاً»
     — المثبتُ يطابق أعدادَ كل مريض بالوحدة الحقيقية.
   • **النسب** من المنتهي فعلاً = حضر + غاب + ألغى (أُعيد جدولته ليس فتحةً ضائعة، و«بلا نتيجة» يُعلن خارج النسب — #689).
   • **النسبةُ تُعرض من 3 مواعيد منتهية فأكثر** بكل تقسيم؛ دونها العددُ وحده.
   • **ساعاتُ الكرسي الضائعة** = مجموعُ مدّة الغياب والإلغاء (المدّةُ المفقودة تُعدّ ويُقال ذلك).
   • **النطاق:** طبيبُ الموعد (`provider_id`) — فلترُ الطبيب/النوع ووضعُ الطبيب؛ «كل العيادة» تشمل غيرَ المسنَد.
   • صفرُ كتابة · كلُّ نصٍّ من البيانات مهرَّب · لا رقمَ مالي (رسومُ الغياب تُقرأ من جلسات تبويب الأطباء نفسها).
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRptAtt) return;

  var MISSED = { no_show: 1, broken: 1 };
  var MIN_RATE = 3;
  var DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var LIST_MAX = 30;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function came(a) { return a.status === 'completed' || !!a.dismissed_at || !!a.arrived_at || !!a.seated_at; }

  /* تصنيفُ صفٍّ واحد. sameDayOk(a) = للمريض موعدٌ آخر غيرُ ملغى بنفس اليوم. */
  function classify(a, today, sameDayOk) {
    if (!a || a.is_planned === true || !a.date) return null;
    if (a.date > today) return 'upcoming';
    if (MISSED[a.status]) return 'missed';
    if (a.status === 'cancelled') return sameDayOk(a) ? 'rescheduled' : 'cancelled';
    if (came(a)) return 'attended';
    return a.date === today ? 'today' : 'unresolved';
  }
  function sameDayIndex(rows) {
    var idx = {};
    (rows || []).forEach(function (a) {
      if (!a || !a.patient_id || !a.date || a.is_planned === true || a.status === 'cancelled') return;
      var k = a.patient_id + '|' + a.date;
      (idx[k] = idx[k] || []).push(a.id);
    });
    return function (a) { var l = idx[a.patient_id + '|' + a.date]; return !!(l && l.some(function (id) { return id !== a.id; })); };
  }

  function bucket() { return { attended: 0, missed: 0, cancelled: 0, rescheduled: 0, unresolved: 0, today: 0, upcoming: 0, lostMin: 0, noDur: 0 }; }
  function add(b, cls, a) {
    b[cls]++;
    if (cls === 'missed' || cls === 'cancelled') {
      var d = Number(a.duration) || 0;
      if (d > 0) b.lostMin += d; else b.noDur++;
    }
  }
  function finished(b) { return b.attended + b.missed + b.cancelled; }
  function rates(b) {
    var f = finished(b);
    return { f: f, att: f ? b.attended / f : null, miss: f ? b.missed / f : null, canc: f ? b.cancelled / f : null,
             fail: f ? (b.missed + b.cancelled) / f : null };
  }

  /* o: { from, to, today, rows (مواعيد الفترة والسابقة معاً), prev:{from,to}|null, inScope(providerId)→bool,
         typeName(a)→نص, docName(pid)→نص } */
  function compute(o) {
    var today = o.today, inScope = o.inScope || function () { return true; };
    var rows = (o.rows || []).filter(function (a) { return a && inScope(a.provider_id || null); });
    var sameDay = sameDayIndex(o.rows || []);
    var cur = bucket(), prev = o.prev ? bucket() : null;
    var byDoc = {}, byDay = {}, byHour = {}, byType = {}, byMonth = {}, byPt = {};
    rows.forEach(function (a) {
      var inCur = a.date >= o.from && a.date <= o.to, inPrev = o.prev && a.date >= o.prev.from && a.date <= o.prev.to;
      if (!inCur && !inPrev) return;
      var cls = classify(a, today, sameDay);
      if (!cls) return;
      if (inPrev && prev) add(prev, cls, a);
      if (!inCur) return;
      add(cur, cls, a);
      if (cls !== 'attended' && cls !== 'missed' && cls !== 'cancelled') return;
      var dk = a.provider_id || '_';
      add(byDoc[dk] = byDoc[dk] || Object.assign(bucket(), { key: dk, provider_id: a.provider_id || null }), cls, a);
      var p = a.date.split('-'), wd = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
      add(byDay[wd] = byDay[wd] || Object.assign(bucket(), { key: wd, label: DAYS[wd] }), cls, a);
      var h = a.time ? parseInt(String(a.time).slice(0, 2), 10) : null;
      if (h !== null && !isNaN(h)) add(byHour[h] = byHour[h] || Object.assign(bucket(), { key: h, label: (h < 10 ? '0' : '') + h + ':00' }), cls, a);
      var tn = (o.typeName ? o.typeName(a) : '') || 'بلا نوع';
      add(byType[tn] = byType[tn] || Object.assign(bucket(), { key: tn, label: tn }), cls, a);
      var mk = a.date.slice(0, 7);
      add(byMonth[mk] = byMonth[mk] || Object.assign(bucket(), { key: mk }), cls, a);
      if ((cls === 'missed' || cls === 'cancelled') && a.patient_id) {
        var r = byPt[a.patient_id] || (byPt[a.patient_id] = { id: a.patient_id, name: a.patient_name || '', missed: 0, cancelled: 0, last: '' });
        r[cls]++;
        if (a.date > r.last) r.last = a.date;
        if (!r.name && a.patient_name) r.name = a.patient_name;
      }
    });
    var vals = function (m) { return Object.keys(m).map(function (k) { return m[k]; }); };
    var byFail = function (a, b) { return ((b.missed + b.cancelled) - (a.missed + a.cancelled)) || (finished(b) - finished(a)); };
    var months = [];
    if (o.from.slice(0, 7) !== o.to.slice(0, 7)) {
      var y = +o.from.slice(0, 4), mo = +o.from.slice(5, 7), end = o.to.slice(0, 7);
      for (var g = 0; g < 60; g++) {
        var key = y + '-' + (mo < 10 ? '0' : '') + mo;
        months.push(Object.assign(byMonth[key] || bucket(), { key: key, label: mo + '/' + y }));
        if (key >= end) break;
        mo++; if (mo > 12) { mo = 1; y++; }
      }
    }
    return {
      cur: cur, prev: prev,
      doctors: vals(byDoc).sort(byFail),
      days: vals(byDay).sort(function (a, b) { return a.key - b.key; }),
      hours: vals(byHour).sort(function (a, b) { return a.key - b.key; }),
      types: vals(byType).sort(byFail),
      months: months,
      repeat: vals(byPt).filter(function (r) { return r.missed + r.cancelled >= 2; })
        .sort(function (a, b) { return ((b.missed + b.cancelled) - (a.missed + a.cancelled)) || (a.last < b.last ? 1 : -1); })
    };
  }

  function pctN(x) { return Math.round(x * 100); }
  function pctB(x) { return '<bdi dir="ltr">' + pctN(x) + '%</bdi>'; }
  function hours(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (!h) return m + ' دقيقة';
    var hw = h === 1 ? 'ساعة' : (h === 2 ? 'ساعتان' : (h <= 10 ? h + ' ساعات' : h + ' ساعة'));
    return hw + (m ? ' و' + m + ' د' : '');
  }
  function apptWord(n) {
    if (!n) return 'لا مواعيد';
    if (n === 1) return 'موعد واحد';
    if (n === 2) return 'موعدان';
    if (n <= 10) return n + ' مواعيد';
    return n + ' موعداً';
  }
  /* الفرقُ بنقاطٍ مئوية (لا نسبةٌ من نسبة): الغيابُ الأعلى سيّئ. */
  function deltaPts(c, p, higherBad) {
    if (c === null || p === null || p === undefined) return '';
    var d = Math.round((c - p) * 100);
    if (!d) return '<span class="rt-d rt-pts flat">= كالسابقة</span>';
    var bad = higherBad ? d > 0 : d < 0;
    return '<span class="rt-d rt-pts ' + (bad ? 'down' : 'up') + '"><bdi dir="ltr">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '</bdi> ' + (Math.abs(d) <= 10 && Math.abs(d) >= 3 ? 'نقاط' : 'نقطة') + '</span>';
  }
  function rowsCard(title, list, labelOf) {
    if (!list.length) return '';
    var h = '<section class="rt-card"><h3 class="rt-h">' + title + '</h3><div class="rt-mini">';
    list.forEach(function (b) {
      var r = rates(b), show = r.f >= MIN_RATE;
      h += '<div class="rt-mini-row"><span>' + esc(labelOf(b)) + ' <small class="rt-pn">' + apptWord(r.f) + '</small></span>'
        + '<b>' + (show ? pctB(r.fail) + ' <small class="rt-pn">غياب/إلغاء</small>' : '<small class="rt-pn">عيّنة صغيرة</small>') + '</b>'
        + '<i class="rt-bar rt-bar-bad"><i style="width:' + (show ? pctN(r.fail) : 0) + '%"></i></i></div>';
    });
    return h + '</div></section>';
  }

  /* o: { docName(pid), prof(id), fees:{n, text}|null, apptLink } */
  function render(m, o) {
    o = o || {};
    var c = m.cur, R = rates(c), P = m.prev ? rates(m.prev) : null;
    var doc = o.docName || function () { return ''; };
    var prof = o.prof || function (id) { return 'patient-profile.html?id=' + encodeURIComponent(id); };
    if (!R.f && !c.unresolved && !c.today && !c.upcoming && !c.rescheduled) {
      return '<div class="empty-state"><div class="ic">📅</div><div class="ttl">لا مواعيد بهذه الفترة</div>'
        + '<div style="margin-top:6px;">غيّر الفترة أو الطبيب من الفلاتر أعلاه.</div></div>';
    }
    var html = '<div class="summary-row rt-summary">'
      + '<div class="stat-card green"><div class="lbl">نسبة الحضور</div><div class="val">' + (R.f ? pctB(R.att) : '—') + '</div>'
      +   '<div class="sub">حضر ' + c.attended + ' من ' + apptWord(R.f) + ' منتهية</div>'
      +   (P && P.f ? '<div class="rt-dl">' + deltaPts(R.att, P.att, false) + ' <span>مقابل الفترة السابقة</span></div>' : '') + '</div>'
      + '<div class="stat-card"><div class="lbl">غاب</div><div class="val">' + c.missed + '</div>'
      +   '<div class="sub">' + (R.f ? pctB(R.miss) + ' من المنتهية' : '—') + '</div>'
      +   (P && P.f ? '<div class="rt-dl">' + deltaPts(R.miss, P.miss, true) + '</div>' : '') + '</div>'
      + '<div class="stat-card"><div class="lbl">ألغى</div><div class="val">' + c.cancelled + '</div>'
      +   '<div class="sub">' + (R.f ? pctB(R.canc) + ' من المنتهية' : '—') + (c.rescheduled ? ' · وأُعيد جدولةُ ' + c.rescheduled + ' بنفس اليوم' : '') + '</div>'
      +   (P && P.f ? '<div class="rt-dl">' + deltaPts(R.canc, P.canc, true) + '</div>' : '') + '</div>'
      + '<div class="stat-card orange"><div class="lbl">وقت كرسي ضائع</div><div class="val rt-val-sm">' + (c.lostMin ? hours(c.lostMin) : '—') + '</div>'
      +   '<div class="sub">مدّةُ مواعيد الغياب والإلغاء' + (c.noDur ? ' · ' + apptWord(c.noDur) + ' بلا مدّة' : '') + '</div></div>'
      + '</div>';
    var notes = [];
    if (c.unresolved) notes.push('⚠️ ' + apptWord(c.unresolved) + ' مضى بلا نتيجة مسجّلة (لا حضور ولا غياب) — خارج النسب. سجّلها من <a href="' + esc(o.apptLink || 'appointments.html') + '">المواعيد</a> لتصير الأرقام أدق.');
    if (c.today || c.upcoming) notes.push('📆 ' + (c.today ? apptWord(c.today) + ' اليوم بلا نتيجة بعد' : '') + (c.today && c.upcoming ? ' · ' : '') + (c.upcoming ? apptWord(c.upcoming) + ' قادم' : '') + ' — لا تدخل النسب.');
    if (o.fees && o.fees.n) notes.push('💳 رُسّم عدمُ الحضور ' + o.fees.n + ' مرة بهذه الفترة: ' + o.fees.text + '.');
    if (notes.length) html += '<div class="rt-note" style="margin:0 0 14px;">' + notes.join('<br>') + '</div>';
    if (!R.f) return html;

    html += '<div class="rt-2col">'
      + (m.doctors.length > 1 ? rowsCard('حسب الطبيب', m.doctors, function (b) { return doc(b.provider_id); }) : '')
      + rowsCard('حسب يوم الأسبوع', m.days, function (b) { return b.label; })
      + rowsCard('حسب ساعة الموعد', m.hours, function (b) { return b.label; })
      + (m.types.length > 1 ? rowsCard('حسب نوع الموعد', m.types, function (b) { return b.label; }) : '')
      + (m.months.length > 1 ? rowsCard('حسب الشهر', m.months, function (b) { return b.label; }) : '')
      + '</div>';

    if (m.repeat.length) {
      html += '<section class="rt-card"><h3 class="rt-h">غابوا أو ألغوا أكثر من مرّة <small class="rt-hs">بهذه الفترة — يُستحسن تأكيدٌ مسبق أو عربون</small></h3><div class="rt-chips">';
      m.repeat.slice(0, LIST_MAX).forEach(function (r) {
        var parts = [];
        if (r.missed) parts.push('غاب ' + r.missed);
        if (r.cancelled) parts.push('ألغى ' + r.cancelled);
        html += '<a class="rt-chip" href="' + esc(prof(r.id)) + '"><b>' + esc(r.name || '—') + '</b><small>' + parts.join(' · ')
          + ' · آخرها ' + esc(window.SyDT ? window.SyDT.numDate(r.last) : r.last) + '</small></a>';
      });
      html += '</div>' + (m.repeat.length > LIST_MAX ? '<div class="rt-note">… و' + (m.repeat.length - LIST_MAX) + ' غيرهم — القائمةُ كاملةً بملف Excel.</div>' : '') + '</section>';
    }
    return html;
  }

  window.SyRptAtt = { MISSED: MISSED, MIN_RATE: MIN_RATE, DAYS: DAYS, classify: classify, sameDayIndex: sameDayIndex,
    compute: compute, rates: rates, finished: finished, render: render, apptWord: apptWord, hours: hours };
})();
/* SYDENT_RPT_ATT_END */
