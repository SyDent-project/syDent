/* SYDENT_RPT_NEWPT_START — تبويبُ «المرضى الجدد» بصفحة التقارير (v540)
   ─────────────────────────────────────────────────────────────
   يجيب: «كم مريض جديد إجا، منين سمعوا فينا، مين عالجهم، وقدّيش جابوا؟ وكم واحد سجّل وما بلّش؟»
   (Open Dental «New Patients» + «Referral Analysis» · Dentrix Practice Advisor «New Patient Analysis»
   بمصدر الإحالة · Curve «New Patients / Production by Referral Source»).

   العقد (لا يُخالَف):
   • **المريضُ الجديد = أوّلُ جلسةٍ منجزة له بالفترة** (تعريف Open Dental: أوّلُ إجراءٍ مكتمل، لا تاريخُ التسجيل).
     الجلسةُ هنا **علاج**: رسمُ عدم الحضور والرصيدُ السابق (قبل SyDent) ليسا زيارة (`SyRptTreat.isFee`)،
     ومن له رصيدٌ سابق مُرحَّل قبل أول زيارةٍ له مريضٌ قديم لا جديد.
   • «الأول» يُحسب من **كل التاريخ قبل الفترة** (سياقُ الرصيد المرحَّل `priorCtx` نفسُه) + جلسات الفترة؛
     بلا ذلك السياق لا حكم (يُعلَن — #689).
   • **المنسوبُ للطبيب:** طبيبُ أول زيارة؛ فلترُ الطبيب/النوع ووضعُ الطبيب يقصرون العدَّ على مَن زارهم أولاً.
   • **الإنتاجُ:** مجموعُ جلساتهم **من نفس جلسات تبويب الأطباء** بنفس النطاق (#684) — كيسٌ لكل عملة (#481).
   • **المصادرُ** مرآةُ `REFERRAL_SOURCE_DEFS` (patients.html ↔ patient-profile.html) — المثبتُ يقارن (#11).
   • **سُجّلوا ولم يبدؤوا:** تاريخُ التسجيل بالفترة ولا جلسةَ علاجٍ منجزة لهم أبداً — للعيادة كلها فقط
     (لا طبيبَ لمن لم يُعالَج).
   • صفرُ كتابة · كلُّ نصٍّ من البيانات مهرَّب.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRptNew) return;

  var SOURCES = [
    { key:'friend',          label:'صديق / قريب' },
    { key:'search',          label:'غوغل / بحث' },
    { key:'social',          label:'فيسبوك / إنستغرام' },
    { key:'walk_in',         label:'مرور بالشارع' },
    { key:'doctor_referral', label:'طبيب محوِّل' },
    { key:'booking',         label:'بوابة الحجز' },
    { key:'other',           label:'أخرى' }
  ];
  var NONE = '_none', NONE_LABEL = 'غير محدد';
  var LIST_MAX = 50;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function srcKey(v) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].key === v) return v;
    return NONE;
  }
  function srcLabel(k) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].key === k) return SOURCES[i].label;
    return NONE_LABEL;
  }
  function T() { return window.SyRptTreat; }
  function isVisit(s) { return !!s && (s.status || 'completed') === 'completed' && !T().isFee(s); }
  function inWin(d, w) { return !!(w && d && d >= w.from && d <= w.to); }
  function cur(s) { return (s && s.currency === 'USD') ? 'USD' : 'SYP'; }
  function ptWord(n) {
    if (!n) return 'لا أحد';
    if (n === 1) return 'مريض واحد';
    if (n === 2) return 'مريضان';
    if (n >= 3 && n <= 10) return n + ' مرضى';
    return n + ' مريضاً';
  }

  /* M164: المُعرِّف من صفّ المريض — المريضُ المُعرِّف يُسمّى من خريطة المرضى المحمّلة (أو «مريض» إن لم تصل). */
  function normName(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function refOf(p, P) {
    if (p.referred_by_patient_id) {
      var rp = P[p.referred_by_patient_id] || {};
      return { kind: 'patient', id: p.referred_by_patient_id, name: rp.name || 'مريض' };
    }
    var nm = normName(p.referrer_name);
    if (!nm) return null;
    return { kind: srcKey(p.referral_source) === 'doctor_referral' ? 'doctor' : 'name', id: null, name: nm };
  }

  /* أوّلُ زيارةٍ لكل مريض: الأبكر تاريخاً، والتعادلُ بالمعرّف (حتمي). */
  function firstVisits(all) {
    var f = {};
    (all || []).forEach(function (s) {
      if (!s || !s.patient_id || !s.date || !isVisit(s)) return;
      var c = f[s.patient_id];
      if (!c || s.date < c.date || (s.date === c.date && String(s.id) < String(c.id))) {
        f[s.patient_id] = { date: s.date, provider_id: s.provider_id || null, id: s.id };
      }
    });
    return f;
  }
  /* رصيدٌ سابق مُرحَّل بتاريخٍ لا يتجاوز أول زيارة ⇒ مريضٌ قديم (كان يُعالَج قبل SyDent). */
  function openingBefore(all, first) {
    var o = {};
    (all || []).forEach(function (s) {
      if (!s || !s.patient_id || !T().isOpening(s)) return;
      var fv = first[s.patient_id];
      if (fv && s.date && s.date <= fv.date) o[s.patient_id] = true;
    });
    return o;
  }

  /* v542: مَن هم الجدد بنافذة — مصدرٌ واحد يستعمله تبويبُ الاحتفاظ أيضاً (صافي النمو = جدد − مفقودين). */
  function pickNew(all, w, inScope) {
    var first = firstVisits(all), ob = openingBefore(all, first);
    inScope = inScope || function () { return true; };
    return Object.keys(first).filter(function (pid) {
      var fv = first[pid];
      return inWin(fv.date, w) && !ob[pid] && inScope(fv.provider_id);
    });
  }

  /* o: { from, to, prev:{from,to}|null, prior:[...], period:[...], scoped:[...], inScope(providerId)→bool,
         patients:{id:{name,referral_source}}, clinicScope:bool } */
  function compute(o) {
    var all = (o.prior || []).concat(o.period || []);
    var first = firstVisits(all);
    var win = { from: o.from, to: o.to };
    var ids = pickNew(all, win, o.inScope), prevIds = o.prev ? pickNew(all, o.prev, o.inScope) : null;
    var isNew = {}; ids.forEach(function (pid) { isNew[pid] = true; });

    var bagOf = {};
    (o.scoped || []).forEach(function (s) {
      if (!isNew[s.patient_id]) return;
      var b = bagOf[s.patient_id] || (bagOf[s.patient_id] = { SYP: 0, USD: 0 });
      b[cur(s)] += Number(s.cost) || 0;
    });
    var P = o.patients || {};
    var list = ids.map(function (pid) {
      var p = P[pid] || {}, fv = first[pid];
      return { id: pid, name: p.name || '', src: srcKey(p.referral_source), first: fv.date, provider_id: fv.provider_id,
               bag: bagOf[pid] || { SYP: 0, USD: 0 }, ref: refOf(p, P) };
    }).sort(function (a, b) { return a.first < b.first ? 1 : (a.first > b.first ? -1 : (a.name < b.name ? -1 : 1)); });

    var total = { SYP: 0, USD: 0 };
    list.forEach(function (r) { total.SYP += r.bag.SYP; total.USD += r.bag.USD; });

    var bySrc = {};
    var srcRow = function (k) { return bySrc[k] || (bySrc[k] = { key: k, label: srcLabel(k), n: 0, prevN: 0, bag: { SYP: 0, USD: 0 } }); };
    list.forEach(function (r) { var g = srcRow(r.src); g.n++; g.bag.SYP += r.bag.SYP; g.bag.USD += r.bag.USD; });
    if (prevIds) prevIds.forEach(function (pid) { srcRow(srcKey((P[pid] || {}).referral_source)).prevN++; });
    var order = SOURCES.map(function (x) { return x.key; }).concat([NONE]);
    var sources = Object.keys(bySrc).map(function (k) { return bySrc[k]; })
      .sort(function (a, b) { return (b.n - a.n) || (order.indexOf(a.key) - order.indexOf(b.key)); });

    /* M164: مين عرّفهم — مريضٌ بالعيادة (رابط) · طبيبٌ محوِّل · اسمٌ حرّ آخر. التجميعُ بالمعرّف أو بالاسم المنظَّف. */
    var refs = {};
    list.forEach(function (r) {
      if (!r.ref) return;
      var k = r.ref.kind + ':' + (r.ref.id || r.ref.name);
      var g = refs[k] || (refs[k] = { kind: r.ref.kind, id: r.ref.id || null, name: r.ref.name, n: 0, bag: { SYP: 0, USD: 0 } });
      g.n++; g.bag.SYP += r.bag.SYP; g.bag.USD += r.bag.USD;
    });
    var referrers = Object.keys(refs).map(function (k) { return refs[k]; })
      .sort(function (a, b) { return (b.n - a.n) || ((b.bag.SYP + b.bag.USD) - (a.bag.SYP + a.bag.USD)) || (a.name < b.name ? -1 : 1); });

    var byDoc = {};
    list.forEach(function (r) { var k = r.provider_id || '_'; (byDoc[k] = byDoc[k] || { provider_id: r.provider_id, n: 0 }).n++; });
    var doctors = Object.keys(byDoc).map(function (k) { return byDoc[k]; }).sort(function (a, b) { return b.n - a.n; });

    var byMonth = {};
    list.forEach(function (r) { var m = r.first.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; });
    var months = [];
    if (o.from && o.to && o.from.slice(0, 7) !== o.to.slice(0, 7)) {
      var y = +o.from.slice(0, 4), mo = +o.from.slice(5, 7), end = o.to.slice(0, 7);
      for (var g = 0; g < 60; g++) {
        var key = y + '-' + (mo < 10 ? '0' : '') + mo;
        months.push({ key: key, label: mo + '/' + y, n: byMonth[key] || 0 });
        if (key >= end) break;
        mo++; if (mo > 12) { mo = 1; y++; }
      }
    }
    return { n: list.length, prevN: prevIds ? prevIds.length : null, list: list, total: total,
             sources: sources, doctors: doctors, months: months, referrers: referrers, clinicScope: !!o.clinicScope };
  }

  /* مَن سُجّل بالفترة: بدأ العلاج (أيّ جلسة علاجٍ منجزة بأي تاريخ) أم لا. */
  function registered(rows, treatedIds) {
    var t = treatedIds || {};
    var out = { n: 0, started: 0, waiting: [] };
    (rows || []).forEach(function (p) {
      out.n++;
      if (t[p.id]) out.started++;
      else out.waiting.push({ id: p.id, name: p.name || '', src: srcKey(p.referral_source), created: p.created_day || '' });
    });
    out.waiting.sort(function (a, b) { return a.created < b.created ? 1 : (a.created > b.created ? -1 : 0); });
    return out;
  }

  function deltaHtml(n, p) {
    if (p === null || p === undefined) return '';
    if (!(p > 0)) return n > 0 ? '<span class="rt-d new">جديد</span>' : '<span class="rt-d flat">—</span>';
    var d = (n - p) / p * 100;
    if (Math.abs(d) < 0.5) return '<span class="rt-d flat">= 0%</span>';
    return '<span class="rt-d ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(0) + '%</span>';
  }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function pctB(a, b) { return '<bdi dir="ltr">' + pct(a, b) + '%</bdi>'; }   /* «(71%)» لا «(%71)» بسياقٍ عربي */

  /* o: { bag(bag)→نص, doc(providerId)→اسم, prof(id)→رابط, reg:{n,started,waiting}|null, regFailed, priorFailed, setupLink } */
  function render(m, o) {
    o = o || {};
    var bag = o.bag || function (b) { return String(b.SYP + b.USD); };
    var doc = o.doc || function () { return ''; };
    var prof = o.prof || function (id) { return 'patient-profile.html?id=' + encodeURIComponent(id); };
    if (o.priorFailed) {
      return '<div class="empty-state"><div class="ic">⚠️</div><div class="ttl">تعذّر تحميل تاريخ المرضى قبل الفترة</div>'
        + '<div style="margin-top:6px;">بلا هذا التاريخ لا يُعرف مَن هو الجديد فعلاً — حدّث الصفحة.</div></div>';
    }
    var hp = m.prevN !== null && m.prevN !== undefined;
    var reg = o.reg;
    /* «أكثر مصدر» لا يُعلن فائزاً عند التعادل — يقول إنه تعادل */
    var named = m.sources.filter(function (s) { return s.key !== NONE && s.n > 0; });
    var top = named[0] || null, tie = !!(top && named[1] && named[1].n === top.n);
    var html = '<div class="summary-row rt-summary">'
      + '<div class="stat-card green"><div class="lbl">مرضى جدد</div><div class="val">' + m.n + '</div>'
      +   '<div class="sub">أوّلُ علاجٍ منجز لهم بهذه الفترة</div>' + (hp ? '<div class="rt-dl">' + deltaHtml(m.n, m.prevN) + ' <span>مقابل الفترة السابقة (' + m.prevN + ')</span></div>' : '') + '</div>'
      + '<div class="stat-card"><div class="lbl">إنتاجهم بالفترة</div><div class="val rt-val-sm">' + bag(m.total) + '</div>'
      +   '<div class="sub">' + (m.n ? 'بالمتوسط ' + bag({ SYP: m.total.SYP / m.n, USD: m.total.USD / m.n }) + ' للمريض' : '—') + '</div></div>';
    if (reg) {
      html += '<div class="stat-card blue"><div class="lbl">سُجّلوا بالفترة</div><div class="val">' + reg.n + '</div>'
        + '<div class="sub">' + (reg.n ? 'بدأ العلاج منهم ' + reg.started + ' (' + pctB(reg.started, reg.n) + ')' : 'لا تسجيلات') + '</div></div>';
    }
    html += '<div class="stat-card"><div class="lbl">أكثر مصدر</div><div class="val rt-val-sm">' + (top && !tie ? esc(top.label) : '—') + '</div>'
      + '<div class="sub">' + (!top ? 'لا مصدرَ محدداً' : tie
          ? 'تعادل بين ' + named.filter(function (s) { return s.n === top.n; }).length + ' مصادر'
          : ptWord(top.n) + ' · ' + pctB(top.n, m.n)) + '</div></div>'
      + '</div>';
    if (o.regFailed) html += '<div class="rt-note" style="margin:0 0 14px;">⚠️ تعذّر تحميل المسجَّلين بالفترة — أرقامُ المرضى الجدد كاملة، وخانةُ «سُجّلوا بالفترة» غيرُ متاحة الآن.</div>';

    if (!m.n && !(reg && reg.waiting.length)) {
      return html + '<div class="empty-state"><div class="ic">🆕</div><div class="ttl">لا مرضى جدد بهذه الفترة</div>'
        + '<div style="margin-top:6px;">المريضُ الجديد يُعدّ عند أول علاجٍ منجز له — غيّر الفترة من الفلاتر أعلاه.</div></div>';
    }

    if (m.n || hp) {
      html += '<section class="rt-card"><h3 class="rt-h">منين إجوا؟ <small class="rt-hs">«كيف سمع عنّا؟» بملف المريض</small></h3><div class="rt-cats">';
      m.sources.forEach(function (s) {
        var sh = pct(s.n, m.n);
        html += '<div class="rt-cat" data-src="' + esc(s.key) + '">'
          + '<div class="rt-cat-top"><span class="rt-cat-name">' + esc(s.label) + '</span>'
          + '<span class="rt-cat-val">' + ptWord(s.n) + ' <b>' + sh + '%</b></span></div>'
          + '<div class="rt-bar"><i style="width:' + Math.max(sh, s.n ? 1 : 0) + '%"></i></div>'
          + '<div class="rt-cat-sub">' + (s.n ? 'إنتاجهم ' + bag(s.bag) : 'لا أحد بهذه الفترة') + (hp ? ' · ' + deltaHtml(s.n, s.prevN) : '') + '</div></div>';
      });
      html += '</div>';
      var none = m.sources.filter(function (s) { return s.key === NONE && s.n; })[0];
      if (none) {
        html += '<div class="rt-note">❔ ' + ptWord(none.n) + ' بلا مصدر — يُحدَّد من «كيف سمع عنّا؟» بملف المريض أو عند إضافته من '
          + '<a href="' + esc(o.setupLink || 'patients.html') + '">صفحة المرضى</a>.</div>';
      }
      html += '</section>';
    }

    if (m.referrers && m.referrers.length) {
      var kinds = [['patient', '👥 مرضى عرّفوا غيرهم'], ['doctor', '🩺 أطباء حوّلوا'], ['name', '✍️ أسماء أخرى']];
      html += '<section class="rt-card"><h3 class="rt-h">مين عرّفهم علينا؟ <small class="rt-hs">من «كيف سمع عنّا؟» بملف المريض</small></h3>';
      kinds.forEach(function (k) {
        var list = m.referrers.filter(function (r) { return r.kind === k[0]; });
        if (!list.length) return;
        html += '<div class="rt-sub">' + k[1] + '</div><div class="rt-chips">';
        list.forEach(function (r) {
          var inner = '<b>' + esc(r.name) + '</b><small>' + (r.n === 1 ? 'عرّف مريضاً واحداً' : 'عرّف ' + ptWord(r.n)) + ' · إنتاجهم ' + bag(r.bag) + '</small>';
          html += r.id ? '<a class="rt-chip" href="' + esc(prof(r.id)) + '">' + inner + '</a>' : '<span class="rt-chip">' + inner + '</span>';
        });
        html += '</div>';
      });
      html += '</section>';
    }

    if (m.doctors.length > 1 || m.months.length > 1) {
      html += '<div class="rt-2col">';
      if (m.doctors.length > 1) {
        html += '<section class="rt-card"><h3 class="rt-h">مين استقبلهم أولاً؟</h3><div class="rt-mini">';
        m.doctors.forEach(function (d) {
          html += '<div class="rt-mini-row"><span>' + esc(doc(d.provider_id)) + '</span><b>' + d.n + '</b>'
            + '<i class="rt-bar"><i style="width:' + pct(d.n, m.n) + '%"></i></i></div>';
        });
        html += '</div></section>';
      }
      if (m.months.length > 1) {
        var mx = Math.max.apply(null, m.months.map(function (x) { return x.n; }).concat([1]));
        html += '<section class="rt-card"><h3 class="rt-h">حسب الشهر</h3><div class="rt-mini">';
        m.months.forEach(function (x) {
          html += '<div class="rt-mini-row"><span>' + esc(x.label) + '</span><b>' + x.n + '</b>'
            + '<i class="rt-bar"><i style="width:' + pct(x.n, mx) + '%"></i></i></div>';
        });
        html += '</div></section>';
      }
      html += '</div>';
    }

    if (m.n) {
      html += '<section class="rt-card"><h3 class="rt-h">المرضى الجدد <small class="rt-hs">' + ptWord(m.n) + '</small></h3>'
        + '<div class="rt-list np"><div class="rt-row rt-th"><span>المريض</span><span>المصدر</span><span class="n">أول علاج</span><span>الطبيب</span><span class="n">إنتاجه بالفترة</span></div>';
      m.list.slice(0, LIST_MAX).forEach(function (r) {
        html += '<a class="rt-row" href="' + esc(prof(r.id)) + '">'
          + '<span class="rt-name"><b>' + esc(r.name || '—') + '</b></span>'
          + '<span data-l="المصدر">' + esc(srcLabel(r.src)) + (r.ref ? ' <small class="rt-pn">— ' + esc(r.ref.name) + '</small>' : '') + '</span>'
          + '<span class="n" data-l="أول علاج">' + esc(window.SyDT ? window.SyDT.numDate(r.first) : r.first) + '</span>'
          + '<span data-l="الطبيب">' + esc(doc(r.provider_id)) + '</span>'
          + '<span class="n" data-l="إنتاجه بالفترة">' + bag(r.bag) + '</span></a>';
      });
      html += '</div>' + (m.list.length > LIST_MAX ? '<div class="rt-note">… و' + ptWord(m.list.length - LIST_MAX) + ' غيرهم — القائمةُ كاملةً بملف Excel.</div>' : '') + '</section>';
    }

    if (reg && reg.waiting.length) {
      html += '<section class="rt-card"><h3 class="rt-h">سجّلوا وما بلّشوا <small class="rt-hs">' + ptWord(reg.waiting.length) + ' بلا أي علاجٍ منجز لليوم</small></h3>'
        + '<div class="rt-chips">';
      reg.waiting.slice(0, LIST_MAX).forEach(function (w) {
        html += '<a class="rt-chip" href="' + esc(prof(w.id)) + '"><b>' + esc(w.name || '—') + '</b><small>'
          + esc(window.SyDT ? window.SyDT.numDate(w.created) : w.created) + ' · ' + esc(srcLabel(w.src)) + '</small></a>';
      });
      html += '</div>' + (reg.waiting.length > LIST_MAX ? '<div class="rt-note">… و' + ptWord(reg.waiting.length - LIST_MAX) + ' غيرهم.</div>' : '') + '</section>';
    }
    return html;
  }

  window.SyRptNew = { SOURCES: SOURCES, NONE: NONE, srcKey: srcKey, srcLabel: srcLabel, isVisit: isVisit, refOf: refOf,
    firstVisits: firstVisits, pickNew: pickNew, compute: compute, registered: registered, render: render, ptWord: ptWord, LIST_MAX: LIST_MAX };
})();
/* SYDENT_RPT_NEWPT_END */
