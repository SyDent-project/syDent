/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-due.js · الاستحقاقُ التلقائي لطلب المخبر وربطُه بموعد التركيب (v524)
   ────────────────────────────────────────────────────────────────────────
   مصدرٌ واحد لمودال طلب المخبر بالسطحين (صفحة المخابر + بطاقة المريض — #676؛
   المعرّفاتُ الحقلية نفسها بالسطحين، ومعرّفاتُ الوحدة ببادئة ldu-).
   القاعدة (Open Dental «Turnaround Times» · Dentrix Ascend «Due ≤ appointment»):
     المدّة  = مهلةُ القالب إن طُبّق، وإلا «مدّة المخبر المعتادة» للعلاج من صفحة العلاجات
               (treatments.lab_days — M161)، وإلا وسيطُ ما استغرقه هذا المخبرُ لهذا العمل
               بطلبات العيادة المستلمة (≥ طلبين) — بأيام الدوام (booking_work_days).
               وبلا أيٍّ منها: سطرٌ يدلّ على صفحة العلاجات برابطٍ يفتح العلاج نفسه.
     السقف  = آخرُ يوم دوامٍ قبل موعد التركيب المربوط.
     الاستحقاق = الأبكرُ منهما؛ وإن كانت المدّةُ تتجاوز السقف يُنبَّه الطبيب صراحةً.
   لا يُداس تاريخٌ كتبه الطبيب: الحساب يملأ حقلاً فارغاً أو ما ملأه هو نفسه، إلا إذا
   صار الاستحقاق بعد موعد التركيب (حالةٌ غير صالحة يرفضها الحفظ أصلاً).
   صفرُ كتابةٍ للقاعدة وصفرُ لمسٍ مالي — قراءتان فقط (ساعاتُ الدوام · تاريخُ الاستلام).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabDue) return;

  var DEFAULT_DAYS = [0, 1, 2, 3, 4, 6];   /* الجمعة عطلة — افتراضُ المنصة (dash-gaps) */
  var MIN_SAMPLES = 2, MAX_DAYS = 60;
  var st = { workDays: DEFAULT_DAYS.slice(), hist: null, trtDays: {}, loading: null, apptDate: null };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dm(ymd) { var d = parse(ymd); return d ? (d.getDate() + '/' + (d.getMonth() + 1)) : ''; }
  function parseWorkDays(v) {
    var out = String(v == null ? '' : v).split(',').map(function (x) { return parseInt(x, 10); })
      .filter(function (x) { return x >= 0 && x <= 6; });
    return out.length ? out : DEFAULT_DAYS.slice();
  }
  function isWork(d, wd) { return wd.indexOf(d.getDay()) !== -1; }
  /* n يومَ دوامٍ بعد ymd (اليومُ نفسه لا يُعدّ) */
  function addWorkDays(ymd, n, wd) {
    var d = parse(ymd); if (!d || !(n >= 1)) return '';
    wd = wd || st.workDays; var left = n, guard = 0;
    while (left > 0 && guard++ < 400) { d.setDate(d.getDate() + 1); if (isWork(d, wd)) left--; }
    return fmt(d);
  }
  /* آخرُ يوم دوامٍ قبل ymd */
  function prevWorkDay(ymd, wd) {
    var d = parse(ymd); if (!d) return '';
    wd = wd || st.workDays; var guard = 0;
    do { d.setDate(d.getDate() - 1); } while (!isWork(d, wd) && guard++ < 14);
    return fmt(d);
  }
  /* عددُ أيام الدوام من بعد a حتى b شاملاً */
  function workDaysBetween(a, b, wd) {
    var d = parse(a), e = parse(b); if (!d || !e || e <= d) return 0;
    wd = wd || st.workDays; var n = 0, guard = 0;
    while (d < e && guard++ < 400) { d.setDate(d.getDate() + 1); if (isWork(d, wd)) n++; }
    return n;
  }
  function median(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; }), k = s.length;
    if (!k) return null;
    return k % 2 ? s[(k - 1) / 2] : Math.round((s[k / 2 - 1] + s[k / 2]) / 2);
  }
  /* وسيطُ مدّة المخبر لهذا العمل من الطلبات المستلمة */
  function histDays(rows, labId, workKey, wd) {
    if (!labId || !workKey) return null;
    var xs = [];
    (rows || []).forEach(function (r) {
      if (r.lab_id !== labId || r.treatment_key !== workKey || !r.date_sent || !r.date_received) return;
      var n = workDaysBetween(String(r.date_sent).slice(0, 10), String(r.date_received).slice(0, 10), wd);
      if (n >= 1 && n <= MAX_DAYS) xs.push(n);
    });
    return xs.length >= MIN_SAMPLES ? { days: median(xs), n: xs.length } : null;
  }
  function daysAr(n) { return n === 1 ? 'يوم عمل' : n === 2 ? 'يوما عمل' : (n <= 10 ? n + ' أيام عمل' : n + ' يوم عمل'); }

  /* الحساب الصافي — { due, hint, warn } */
  function compute(o) {
    var wd = o.workDays || st.workDays;
    var base = (o.sent && o.days >= 1) ? addWorkDays(o.sent, o.days, wd) : '';
    var cap = o.apptDate ? prevWorkDay(o.apptDate, wd) : '';
    if (cap && o.sent && cap < o.sent) cap = o.sent;          /* موعدٌ ملاصقٌ للإرسال: لا استحقاق قبل الإرسال */
    var due = base && cap ? (base < cap ? base : cap) : (base || cap);
    var src = o.src === 'tpl' ? ('محسوب من القالب: ' + daysAr(o.days) + ' بعد الإرسال')
            : o.src === 'trt' ? ('مدّة المخبر المعتادة لهذا العلاج: ' + daysAr(o.days) + ' (صفحة العلاجات)')
            : o.src === 'hist' ? ('مدّة هذا المخبر لهذا العمل عادةً ' + daysAr(o.days) + ' (من ' + o.samples + ' طلبات سابقة)') : '';
    var hint = '', warn = '';
    if (due && cap && due === cap && (!base || base > cap)) hint = 'قبل موعد التركيب (' + dm(o.apptDate) + ') بيوم عمل';
    else if (due) hint = src;
    if (base && cap && base > cap) warn = '⚠️ ' + src.replace(/^محسوب من القالب: /, 'مهلة القالب ') + ' — قد لا يجهز العمل قبل موعد التركيب (' + dm(o.apptDate) + ')';
    return { due: due, hint: hint, warn: warn, base: base, cap: cap };
  }

  /* تحقّقُ الحفظ — Dentrix Ascend: الاستحقاقُ لا يكون بعد موعد التركيب */
  function check(due, apptDate) {
    due = String(due || '').slice(0, 10); apptDate = String(apptDate || '').slice(0, 10);
    if (due && apptDate && due > apptDate) return 'تاريخ الاستحقاق (' + dm(due) + ') بعد موعد التركيب المربوط (' + dm(apptDate) + ') — قدّمه أو غيّر الموعد.';
    return '';
  }

  /* ── ربطُ المودال ── */
  function $(id) { return document.getElementById(id); }
  function hintEl() {
    var el = $('lduHint'), due = $('labOrderDateDue');
    if (!el && due && due.parentNode) {
      el = document.createElement('div'); el.id = 'lduHint'; el.className = 'ldu-hint'; el.setAttribute('aria-live', 'polite');
      due.parentNode.appendChild(el);
    }
    return el;
  }
  function show(hint, warn, setupKey) {
    var el = hintEl(); if (!el) return;
    el.innerHTML = '';
    if (hint) { var a = document.createElement('div'); a.textContent = hint; el.appendChild(a); }
    if (warn) { var b = document.createElement('div'); b.className = 'ldu-warn'; b.textContent = warn; el.appendChild(b); }
    if (setupKey) {   /* لا مصدرَ لمدّة هذا العمل: دلالةٌ مباشرة على الإعداد الناقص (رابطٌ عميق يعبّي ولا يحفظ — #690) */
      var c = document.createElement('div'); c.className = 'ldu-setup';
      c.appendChild(document.createTextNode('لا مدّة محدّدة لهذا العمل — '));
      var l = document.createElement('a'); l.href = 'treatments.html?edit=' + encodeURIComponent(setupKey) + '&focus=lab_days';
      l.textContent = 'حدّدها من صفحة العلاجات'; c.appendChild(l);
      c.appendChild(document.createTextNode(' ليُحسب الاستحقاق تلقائياً.'));
      el.appendChild(c);
    }
  }
  function val(id) { var el = $(id); return el ? String(el.value || '') : ''; }

  var tplDays = null;       /* مهلةُ القالب المطبَّق بهذا الفتح */
  function recompute() {
    var due = $('labOrderDateDue'); if (!due) return;
    var sent = val('labOrderDateSent').slice(0, 10);
    var apptDate = st.apptDate ? String(st.apptDate() || '').slice(0, 10) : '';
    var days = null, src = '', samples = 0, work = val('labOrderWorkType');
    if (tplDays >= 1) { days = tplDays; src = 'tpl'; }
    else if (st.trtDays[work] >= 1) { days = st.trtDays[work]; src = 'trt'; }
    else {
      var h = histDays(st.hist, val('labOrderLabSelect'), work, st.workDays);
      if (h) { days = h.days; src = 'hist'; samples = h.n; }
    }
    /* عملٌ من كتالوج العلاجات بلا أيّ مصدر ⇒ رابطُ الإعداد («أخرى» ليس بالكتالوج فلا رابط) */
    var setupKey = (!days && work && Object.prototype.hasOwnProperty.call(st.trtDays, work)) ? work : '';
    var r = compute({ sent: sent, apptDate: apptDate, days: days, src: src, samples: samples });
    var cur = String(due.value || '');
    var mine = !cur || cur === due.getAttribute('data-ldu-auto');
    var bad = cur && r.cap && apptDate && cur > apptDate;
    if (r.due && (mine || bad)) {
      due.value = r.due; due.setAttribute('data-ldu-auto', r.due);
      show(bad && !mine ? 'عُدّل ليسبق موعد التركيب (' + dm(apptDate) + ')' : r.hint, r.warn, setupKey);
    } else {
      /* القيمةُ التلقائية السابقة صارت بلا مصدر (تغيّر العمل/المخبر/الإرسال) ⇒ تُفرَّغ؛ ما كتبه الطبيب يبقى */
      if (cur && cur === due.getAttribute('data-ldu-auto')) { due.value = ''; due.removeAttribute('data-ldu-auto'); }
      show('', r.warn, setupKey);
    }
  }
  function applyTemplateDays(n) {
    n = Number(n);
    tplDays = n >= 1 ? n : null;
    var due = $('labOrderDateDue');
    if (due && tplDays) due.setAttribute('data-ldu-auto', due.value || '');   /* القالبُ اختيارٌ صريح: يحقّ له ملءُ الحقل */
    recompute();
  }
  function reset() {
    tplDays = null;
    var due = $('labOrderDateDue'); if (due) due.removeAttribute('data-ldu-auto');
    show('', '');
  }
  /* v533: استحقاقٌ قبل تاريخ الإرسال خطأُ إدخال (وُجد بالبيانات الحيّة) — يُرفض قبل قاعدة الموعد */
  function checkForm() {
    var due = val('labOrderDateDue').slice(0, 10), sent = val('labOrderDateSent').slice(0, 10);
    if (due && sent && due < sent) return 'تاريخ الاستحقاق (' + dm(due) + ') قبل تاريخ الإرسال (' + dm(sent) + ').';
    return check(due, st.apptDate ? st.apptDate() : '');
  }

  var wired = false;
  function attach(opts) {
    opts = opts || {};
    st.apptDate = opts.apptDate || st.apptDate;
    if (wired) return;
    wired = true;
    ['labOrderDateSent', 'labOrderAppointment', 'labOrderWorkType', 'labOrderLabSelect', 'labNewApptDate'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('change', function () { try { recompute(); } catch (e) { console.warn('lab due:', e); } });
    });
    var due = $('labOrderDateDue');
    if (due) due.addEventListener('input', function () { due.removeAttribute('data-ldu-auto'); show('', ''); });
  }
  /* قراءتان خفيفتان مرةً للجلسة: ساعاتُ الدوام · تاريخُ الاستلام لآخر 300 طلبٍ مستلم */
  function load(sb, uid) {
    if (st.loading) return st.loading;
    st.loading = (async function () {
      if (!sb || !uid) return;
      try {
        var cs = await sb.from('clinic_settings').select('booking_work_days').eq('owner_id', uid).maybeSingle();
        if (cs && cs.error) console.warn('lab due work days:', cs.error);
        else if (cs && cs.data && cs.data.booking_work_days != null) st.workDays = parseWorkDays(cs.data.booking_work_days);
      } catch (e) { console.warn('lab due work days:', e); }
      try {
        var h = await sb.from('lab_orders').select('lab_id, treatment_key, date_sent, date_received')
          .eq('doctor_id', uid).not('date_received', 'is', null).order('date_received', { ascending: false }).limit(300);
        if (h.error) console.warn('lab due history:', h.error); else st.hist = h.data || [];
      } catch (e) { console.warn('lab due history:', e); }
    })();
    return st.loading;
  }

  /* M161: مدّةُ المخبر لكل علاج — تُقرأ مع **كل فتحٍ للمودال** فتتبع صفحة العلاجات فوراً (استعلامٌ واحد صغير) */
  async function loadTrt(sb, uid) {
    if (!sb || !uid) return;
    try {
      var tr = await sb.from('treatments').select('treatment_key, lab_days').eq('doctor_id', uid);
      if (tr.error) { console.warn('lab due treatments:', tr.error); return; }
      var m = {};
      (tr.data || []).forEach(function (t) { m[t.treatment_key] = (t.lab_days >= 1 && t.lab_days <= MAX_DAYS) ? Number(t.lab_days) : null; });
      st.trtDays = m;
    } catch (e) { console.warn('lab due treatments:', e); }
  }
  /* نقطةُ الدخول الوحيدة من السطحين عند فتح المودال: ربطٌ مرة · تصفيرُ الفتح · مدّةُ العلاجات كل فتح ·
     ساعاتُ الدوام وتاريخُ المخبر مرةً للجلسة. الطلبُ الجديد يُحسب بعد وصول القراءات؛ والقائمُ لا يُمسّ إلا بتغيير حقل. */
  function open(sb, uid, opts) {
    opts = opts || {};
    attach(opts); reset();
    Promise.all([load(sb, uid), loadTrt(sb, uid)]).then(function () {
      if (opts.isNew) { try { recompute(); } catch (e) { console.warn('lab due:', e); } }
    });
  }

  window.SyLabDue = {
    addWorkDays: addWorkDays, prevWorkDay: prevWorkDay, workDaysBetween: workDaysBetween, parseWorkDays: parseWorkDays,
    median: median, histDays: histDays, compute: compute, check: check, daysAr: daysAr,
    attach: attach, open: open, load: load, loadTrt: loadTrt, reset: reset, recompute: recompute, applyTemplateDays: applyTemplateDays, checkForm: checkForm,
    _state: st
  };
})();
