/* SYDENT_RPT_TREAT_START — تبويبُ «العلاجات» بصفحة التقارير (v539)
   ─────────────────────────────────────────────────────────────
   يجيب: «شو العلاجات اللي بتعملها العيادة (أو الطبيب)، كم مرّة، وقدّيش بتجيب من الإنتاج؟»
   (Open Dental «Procedures / Production by procedure» · Dentrix «Practice Analysis by procedure» ·
   Curve «Production Summary — provider + procedure breakdown»).

   العقد (لا يُخالَف):
   • **لا معادلةَ ماليةً ثانية (#684):** الجلساتُ المُدخلة هي نفسُها التي يحسب منها المحرّكُ
     القائم (`computeProviderStats(..).sessions` أو كلُّ جلسات الفترة) — هذه الوحدة **تقسّمها**
     فقط، ومجموعُ الصفوف = الإنتاجُ المعروض بتبويب الأطباء حرفياً (المثبتُ يقارن).
   • **الإنتاجُ وحده:** لا تحصيلَ حسب العلاج (شريحةٌ ماليةٌ جديدة خارج النطاق).
   • `plan_option` · `phase` · `units` لا تُقرأ هنا إطلاقاً (عرضيّون بحت).
   • **هويةُ العلاج** مرآةُ `sessionTreatmentKey` (pp-dental.js) و`_apptSessionTreatmentKey`:
     `treatment_key` إن كان بالكتالوج، وإلا أولُ علاجٍ بالكتالوج اسمُه أو وسمُه = `type`؛
     وإلا يُجمَّع بالاسم المسجَّل ويُعلَّم «غير مرتبط بصفحة العلاجات» برابطٍ لها (#696).
   • **التصنيفاتُ** مرآةُ `CAT_ORDER`/`CAT_MAP` بصفحة العلاجات (المثبتُ يقارنها بالمصدر — #11).
   • صفوفٌ ليست علاجاً لكنها ضمن الإنتاج (رسمُ عدم الحضور · الرصيدُ السابق قبل SyDent) تبقى
     ضمن المجموع بتصنيفٍ صريح — إسقاطُها يكسر التطابق مع تبويب الأطباء.
   • صفرُ كتابة · كلُّ نصٍّ من البيانات مهرَّب.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRptTreat) return;

  var CAT_ORDER = ['diagnostic','preventive','restorative','endodontics','surgical','prosthodontics',
                   'implantology','cosmetic','prosth_cosmetic','orthodontics','periodontics','pediatric','other'];
  var CAT_MAP = {
    'diagnostic':      '🔍 تشخيصي',
    'preventive':      '🛡️ وقائي',
    'restorative':     '🦷 ترميمي',
    'endodontics':     '🌱 معالجة لبية',
    'surgical':        '🔪 جراحي',
    'prosthodontics':  '🔗 تعويضي',
    'implantology':    '🔩 زراعة',
    'cosmetic':        '✨ تجميلي',
    'prosth_cosmetic': '💎 تعويض تجميلي',
    'orthodontics':    '⚓ تقويم',
    'periodontics':    '🌿 معالجة لثوية',
    'pediatric':       '🧒 أطفال',
    'other':           '📋 أخرى'
  };
  var CAT_UNLINKED = '_unlinked', CAT_FEES = '_fees';
  var EXTRA_CATS = {};
  EXTRA_CATS[CAT_UNLINKED] = '❔ غير مرتبط بصفحة العلاجات';
  EXTRA_CATS[CAT_FEES]     = '💳 رسوم وأرصدة سابقة';
  var OB_TYPE = 'رصيد سابق (قبل SyDent)';      /* patient-profile.html OB_SESSION_TYPE · patients.html */
  var NOSHOW_DESC = 'رسم عدم الحضور';           /* appointments.html — وصفُ صفّ الرسم */
  var UNNAMED = 'غير مسمّى';

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { return Number(v) || 0; }
  function catLabel(c) { return CAT_MAP[c] || EXTRA_CATS[c] || CAT_MAP.other; }
  function catRank(c) {
    var i = CAT_ORDER.indexOf(c);
    if (i !== -1) return i;
    return c === CAT_UNLINKED ? CAT_ORDER.length : CAT_ORDER.length + 1;
  }

  /* الكتالوج بترتيب الصفحة (sort_order) — المطابقةُ بالاسم تأخذ الأول كما يفعل المصدر. */
  function catalogOf(list) {
    var arr = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.treatment_key; });
    var byKey = {};
    arr.forEach(function (t) { if (!byKey[t.treatment_key]) byKey[t.treatment_key] = t; });
    return { list: arr, byKey: byKey };
  }

  function identify(s, cat) {
    var type = String((s && s.type) || '').trim();
    if (type === OB_TYPE) return { key: 'fee:ob', name: OB_TYPE, cat: CAT_FEES };
    if (s && s.description === NOSHOW_DESC) return { key: 'fee:noshow', name: type || NOSHOW_DESC, cat: CAT_FEES };
    var t = (s && s.treatment_key && cat.byKey[s.treatment_key]) || null;
    if (!t) {
      for (var i = 0; i < cat.list.length; i++) {
        var c = cat.list[i];
        if (c.name === s.type || c.label === s.type) { t = c; break; }
      }
    }
    if (t) {
      return { key: 'k:' + t.treatment_key, name: String(t.name || type || UNNAMED),
               cat: CAT_MAP[t.category] ? t.category : 'other' };
    }
    return { key: 'n:' + (type || UNNAMED), name: type || UNNAMED, cat: CAT_UNLINKED };
  }

  /* v540: يستعملهما تبويبُ المرضى الجدد — الزيارةُ علاجٌ لا رسمٌ ولا رصيدٌ مُرحَّل من قبل SyDent */
  function isOpening(s) { return String((s && s.type) || '').trim() === OB_TYPE; }
  function isFee(s) { return isOpening(s) || !!(s && s.description === NOSHOW_DESC); }

  /* التقسيم: صفٌّ لكل علاج + لكل تصنيف + المجموع. الإنتاجُ = Σ cost بالتعريف القائم نفسه. */
  function aggregate(sessions, catalog) {
    var cat = (catalog && catalog.byKey) ? catalog : catalogOf(catalog);
    var rows = {}, cats = {}, total = { n: 0, prod: 0 };
    (sessions || []).forEach(function (s) {
      var id = identify(s, cat), c = num(s.cost);
      var r = rows[id.key] || (rows[id.key] = { key: id.key, name: id.name, cat: id.cat, n: 0, prod: 0, sessions: [] });
      r.n++; r.prod += c; r.sessions.push(s);
      var g = cats[id.cat] || (cats[id.cat] = { cat: id.cat, label: catLabel(id.cat), n: 0, prod: 0, kinds: 0 });
      g.n++; g.prod += c;
      total.n++; total.prod += c;
    });
    var rowList = Object.keys(rows).map(function (k) { return rows[k]; });
    rowList.forEach(function (r) { cats[r.cat].kinds++; });
    var catList = Object.keys(cats).map(function (k) { return cats[k]; })
      .sort(function (a, b) { return (b.prod - a.prod) || (catRank(a.cat) - catRank(b.cat)); });
    return { rows: rowList, cats: catList, total: total };
  }

  /* المقارنة بالفترة السابقة: نفسُ التقسيم على جلسات تلك الفترة، مربوطاً بالمفتاح. */
  function compare(cur, prev) {
    if (!prev) return cur;
    var pr = {}, pc = {};
    prev.rows.forEach(function (r) { pr[r.key] = r; });
    prev.cats.forEach(function (c) { pc[c.cat] = c; });
    cur.rows.forEach(function (r) { var p = pr[r.key]; r.prevN = p ? p.n : 0; r.prevProd = p ? p.prod : 0; });
    cur.cats.forEach(function (c) { var p = pc[c.cat]; c.prevN = p ? p.n : 0; c.prevProd = p ? p.prod : 0; });
    cur.prevTotal = { n: prev.total.n, prod: prev.total.prod };
    /* ما كان بالسابقة وغاب الآن — يُذكر كي لا يختفي الهبوطُ بصمت */
    cur.gone = prev.rows.filter(function (r) { return !cur.rows.some(function (x) { return x.key === r.key; }); })
      .sort(function (a, b) { return b.prod - a.prod; });
    cur.hasPrev = true;
    return cur;
  }

  function sortRows(rows, by) {
    return rows.slice().sort(function (a, b) {
      if (by === 'count') return (b.n - a.n) || (b.prod - a.prod) || (a.name < b.name ? -1 : 1);
      return (b.prod - a.prod) || (b.n - a.n) || (a.name < b.name ? -1 : 1);
    });
  }

  function share(part, whole) { return whole > 0 ? Math.round(part / whole * 1000) / 10 : 0; }
  function pctTxt(p) { return (p % 1 === 0 ? String(p) : p.toFixed(1)) + '%'; }
  function sessWord(n) {
    if (n === 1) return 'جلسة واحدة';
    if (n === 2) return 'جلستان';
    if (n >= 3 && n <= 10) return n + ' جلسات';
    return n + ' جلسة';
  }

  /* السهمُ مقابل السابقة: نسبةٌ للإنتاج، وفرقٌ صريح للعدد حين لا إنتاج سابق. */
  function deltaHtml(cur, prv, hasPrev) {
    if (!hasPrev) return '';
    if (!(prv > 0)) return cur > 0 ? '<span class="rt-d new">جديد</span>' : '<span class="rt-d flat">—</span>';
    var p = (cur - prv) / prv * 100;
    if (Math.abs(p) < 0.5) return '<span class="rt-d flat">= 0%</span>';
    return '<span class="rt-d ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%</span>';
  }

  /* الرسم. o: { fmt(n)→نص بالعملة, sort, scopeLabel, cur, onRow(fnName), treatLink } */
  function render(m, o) {
    o = o || {};
    var fmt = o.fmt || function (n) { return String(n); };
    var hp = !!m.hasPrev;
    if (!m.total.n) {
      return '<div class="empty-state"><div class="ic">🦷</div><div class="ttl">لا جلسات بهذه الفترة</div>'
        + '<div style="margin-top:6px;">غيّر الفترة أو الطبيب من الفلاتر أعلاه.</div></div>';
    }
    var avg = m.total.prod / m.total.n;
    var pAvg = (hp && m.prevTotal.n) ? m.prevTotal.prod / m.prevTotal.n : 0;
    var kinds = m.rows.length;
    var html = '<div class="summary-row rt-summary">'
      + '<div class="stat-card"><div class="lbl">عدد الجلسات</div><div class="val">' + m.total.n + '</div>'
      +   '<div class="sub">' + esc(o.scopeLabel || '') + '</div>' + (hp ? '<div class="rt-dl">' + deltaHtml(m.total.n, m.prevTotal.n, hp) + ' <span>مقابل الفترة السابقة</span></div>' : '') + '</div>'
      + '<div class="stat-card green"><div class="lbl">الإنتاج</div><div class="val">' + fmt(m.total.prod) + '</div>'
      +   '<div class="sub">مجموعُ أسعار الجلسات</div>' + (hp ? '<div class="rt-dl">' + deltaHtml(m.total.prod, m.prevTotal.prod, hp) + ' <span>مقابل الفترة السابقة</span></div>' : '') + '</div>'
      + '<div class="stat-card blue"><div class="lbl">متوسط الجلسة</div><div class="val">' + fmt(avg) + '</div>'
      +   '<div class="sub">الإنتاج ÷ عدد الجلسات</div>' + (hp && pAvg ? '<div class="rt-dl">' + deltaHtml(avg, pAvg, hp) + ' <span>مقابل الفترة السابقة</span></div>' : '') + '</div>'
      + '<div class="stat-card"><div class="lbl">أنواع العلاج</div><div class="val">' + kinds + '</div>'
      +   '<div class="sub">بـ' + m.cats.length + (m.cats.length === 1 ? ' تصنيف' : ' تصنيفات') + '</div></div>'
      + '</div>';

    /* التصنيفات — شريطٌ نسبيٌّ لكلٍّ منها */
    html += '<section class="rt-card"><h3 class="rt-h">حسب التصنيف</h3><div class="rt-cats">';
    m.cats.forEach(function (c) {
      var sh = share(c.prod, m.total.prod);
      html += '<div class="rt-cat" data-cat="' + esc(c.cat) + '">'
        + '<div class="rt-cat-top"><span class="rt-cat-name">' + esc(c.label) + '</span>'
        + '<span class="rt-cat-val">' + fmt(c.prod) + ' <b>' + pctTxt(sh) + '</b></span></div>'
        + '<div class="rt-bar"><i style="width:' + Math.max(sh, c.prod > 0 ? 1 : 0) + '%"></i></div>'
        + '<div class="rt-cat-sub">' + sessWord(c.n) + ' · ' + c.kinds + (c.kinds === 1 ? ' نوع' : ' أنواع')
        + (hp ? ' · ' + deltaHtml(c.prod, c.prevProd, hp) : '') + '</div></div>';
    });
    html += '</div>';
    var unl = m.cats.filter(function (c) { return c.cat === CAT_UNLINKED; })[0];
    if (unl) {
      html += '<div class="rt-note">❔ ' + sessWord(unl.n) + ' بأسماءٍ غير موجودة بصفحة العلاجات فلا يُعرف تصنيفها — '
        + '<a href="' + esc(o.treatLink || 'treatments.html') + '">راجع صفحة العلاجات</a>.</div>';
    }
    html += '</section>';

    /* الجدول — العلاجُ صفّاً، والنقرُ يفتح جلساته */
    var rows = sortRows(m.rows, o.sort);
    html += '<section class="rt-card"><div class="rt-head"><h3 class="rt-h">حسب العلاج</h3>'
      + '<div class="rt-sort" role="tablist" aria-label="ترتيب العلاجات">'
      + '<button type="button" role="tab" class="rt-sort-btn' + (o.sort !== 'count' ? ' on' : '') + '" aria-selected="' + (o.sort !== 'count') + '" data-rt-sort="prod">حسب الإنتاج</button>'
      + '<button type="button" role="tab" class="rt-sort-btn' + (o.sort === 'count' ? ' on' : '') + '" aria-selected="' + (o.sort === 'count') + '" data-rt-sort="count">حسب العدد</button>'
      + '</div></div>'
      + '<div class="rt-list' + (hp ? ' hp' : '') + '"><div class="rt-row rt-th"><span>العلاج</span><span class="n">العدد</span><span class="n">الإنتاج</span>'
      + '<span class="n">النسبة</span><span class="n">المتوسط</span>' + (hp ? '<span class="n">مقابل السابقة</span>' : '') + '</div>';
    rows.forEach(function (r) {
      var sh = share(r.prod, m.total.prod);
      html += '<button type="button" class="rt-row" data-rt-key="' + esc(r.key) + '"' + (o.cur ? ' data-rt-cur="' + esc(o.cur) + '"' : '') + '>'
        + '<span class="rt-name"><b>' + esc(r.name) + '</b><small>' + esc(catLabel(r.cat)) + '</small></span>'
        + '<span class="n" data-l="العدد">' + r.n + '</span>'
        + '<span class="n" data-l="الإنتاج">' + fmt(r.prod) + '</span>'
        + '<span class="n" data-l="النسبة">' + pctTxt(sh) + '</span>'
        + '<span class="n" data-l="المتوسط">' + fmt(r.prod / r.n) + '</span>'
        + (hp ? '<span class="n" data-l="مقابل السابقة">' + deltaHtml(r.prod, r.prevProd, hp)
              + '<small class="rt-pn">' + (r.prevN ? 'سابقاً ' + r.prevN : 'لم يكن') + '</small></span>' : '')
        + '</button>';
    });
    html += '<div class="rt-row rt-tf"><span>المجموع</span><span class="n" data-l="العدد">' + m.total.n + '</span>'
      + '<span class="n" data-l="الإنتاج">' + fmt(m.total.prod) + '</span><span class="n" data-l="النسبة">100%</span>'
      + '<span class="n" data-l="المتوسط">' + fmt(avg) + '</span>' + (hp ? '<span class="n" data-l="مقابل السابقة">' + deltaHtml(m.total.prod, m.prevTotal.prod, hp) + '</span>' : '') + '</div>';
    html += '</div>';
    if (hp && m.gone && m.gone.length) {
      html += '<div class="rt-note">لم يُجرَ بهذه الفترة وكان بالسابقة: '
        + m.gone.slice(0, 6).map(function (g) { return '<b>' + esc(g.name) + '</b> (' + g.n + ')'; }).join(' · ')
        + (m.gone.length > 6 ? ' · و' + (m.gone.length - 6) + ' غيرها' : '') + '</div>';
    }
    html += '</section>';
    return html;
  }

  window.SyRptTreat = {
    CAT_ORDER: CAT_ORDER, CAT_MAP: CAT_MAP, CAT_UNLINKED: CAT_UNLINKED, CAT_FEES: CAT_FEES,
    catalogOf: catalogOf, identify: identify, isFee: isFee, isOpening: isOpening, aggregate: aggregate, compare: compare,
    sortRows: sortRows, share: share, sessWord: sessWord, catLabel: catLabel, render: render
  };
})();
/* SYDENT_RPT_TREAT_END */
