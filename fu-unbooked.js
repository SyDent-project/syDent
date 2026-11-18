/* fu-unbooked.js — ج3-ج (خطة ج1–ج3 المعتمدة 17/11/2026): «علاجٌ قيد الإنجاز بلا موعد قادم»
   ─────────────────────────────────────────────────────────────
   (Dentrix «Unscheduled Treatment» · Open Dental «Treatment Finder») — التعريفُ الواحد لسطحين:
   • تنبيهُ اللوحة («تنبيهات تحتاج انتباهك»): كلُّ مريضٍ له علاجٌ «قيد الإنجاز» (followup_state = 'open' — M210، على
     الجلسة الأساسية المنجزة وحدها بقيد القاعدة) وليس له أيُّ موعدٍ حيّ من اليوم فصاعداً.
   • رقاقةُ الهدل (huddle-flags.js): لمريضِ موعدِ اليوم (أو الغد) — بلا موعدٍ حيّ **بعد** يوم الهدل: زيارتُه هذه لا تكفي،
     فالعلاجُ ما زال مفتوحاً ويحتاج زيارتَه التالية قبل أن يغادر.
   الموعدُ «الحيّ» = بتاريخ، غيرُ مخطّطٍ بلا تاريخ، ولم يمت (SyDentApptDead: ملغى · لم يحضر · مكسور · مكتمل · خرج ·
   أو يومٌ مضى وقد وصل/جلس). أيُّ موعدٍ قادم يكفي — مربوطاً بالعلاج أو لا: المريضُ عائد.
   قراءةٌ محضة، صفرُ كتابة، صفرُ مال. فشلُ أي قراءة ⇒ null (لا تنبيهَ كاذب ولا رقاقة).
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyFuUnbooked) return;

  var QUAD = { UR: 'الربع العلوي الأيمن', UL: 'الربع العلوي الأيسر', LL: 'الربع السفلي الأيسر', LR: 'الربع السفلي الأيمن' };
  var ARCH = { U: 'الفك العلوي', L: 'الفك السفلي' };
  var CHUNK = 150;

  function where(s) {
    if (!s) return '';
    if (s.tooth_num) return 'سن ' + s.tooth_num;
    if (s.quadrant && QUAD[s.quadrant]) return QUAD[s.quadrant];
    if (s.arch && ARCH[s.arch]) return ARCH[s.arch];
    return '';
  }
  /* «اسم العلاج — موضعه» — مرآةُ appt-followup.js (الإنجليزيةُ بنمط fuW: الموضعُ يُترجم والاسمُ بيانات العيادة) */
  function label(s) { var w = where(s); return String((s && s.type) || 'علاج') + (w ? ' — ' + w : ''); }
  function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }

  function dead(a, day) {
    if (typeof window.SyDentApptDead === 'function') return window.SyDentApptDead(a, day);
    var st = a.status || '';
    return st === 'cancelled' || st === 'no_show' || st === 'broken' || st === 'completed' || !!a.dismissed_at;
  }
  /* موعدٌ قادم: strict ⇒ بعد day (الهدل)، وإلا من day فصاعداً (اللوحة: موعدُ اليوم الذي لم ينتهِ يكفي) */
  function upcoming(a, day, strict) {
    if (!a || !a.date || a.is_planned === true) return false;
    var d = String(a.date).slice(0, 10);
    if (strict ? d <= day : d < day) return false;
    return !dead(a, day);
  }

  /* دالةٌ محضة: bases = صفوفُ العلاجات المفتوحة · appts = مواعيدُ مرضاها ⇒ { patient_id: [bases…] } لمن لا موعد قادماً له،
     والعلاجاتُ بكل مريض الأقدمُ أولاً. */
  function compute(bases, appts, day, strict) {
    var booked = {}, out = {};
    (appts || []).forEach(function (a) { if (a && a.patient_id && upcoming(a, day, strict)) booked[a.patient_id] = true; });
    (bases || []).forEach(function (b) {
      if (!b || !b.id || !b.patient_id || b.parent_id || b.followup_state !== 'open' || booked[b.patient_id]) return;
      (out[b.patient_id] = out[b.patient_id] || []).push(b);
    });
    Object.keys(out).forEach(function (pid) {
      out[pid].sort(function (x, y) { return String(x.date || '').localeCompare(String(y.date || '')) || String(x.id).localeCompare(String(y.id)); });
    });
    return out;
  }

  async function _fetchAllFu(build) {
    if (typeof window.SyDentFetchAll === 'function') return window.SyDentFetchAll(build);
    return build();
  }

  /* opt = { day: 'YYYY-MM-DD', strict: bool, patientIds: [..] اختياري (الهدل: مرضى اليوم فقط) } ⇒ خريطةُ compute أو null */
  async function load(uid, opt) {
    opt = opt || {};
    var sb = window.sb, day = opt.day;
    if (!sb || !day) return null;
    try {
      var only = Array.isArray(opt.patientIds) ? opt.patientIds.filter(Boolean) : null;
      if (only && !only.length) return {};
      var bases = [];
      var chunks = only ? [] : [null];
      if (only) for (var i = 0; i < only.length; i += CHUNK) chunks.push(only.slice(i, i + CHUNK));
      for (var c = 0; c < chunks.length; c++) {
        var ids = chunks[c];
        var rb = await _fetchAllFu(function () {
          var q = sb.from('ledger_sessions').select('id, patient_id, type, tooth_num, quadrant, arch, date, parent_id, followup_state, patients(name)')
            .eq('followup_state', 'open').is('parent_id', null).eq('status', 'completed');
          if (uid) q = q.eq('doctor_id', uid);
          return ids ? q.in('patient_id', ids) : q;
        });
        if (!rb || rb.error) return null;
        bases = bases.concat(rb.data || []);
      }
      if (!bases.length) return {};
      var pids = [];
      bases.forEach(function (b) { if (b && b.patient_id && pids.indexOf(b.patient_id) < 0) pids.push(b.patient_id); });
      var appts = [];
      for (var j = 0; j < pids.length; j += CHUNK) {
        var part = pids.slice(j, j + CHUNK);
        var ra = await _fetchAllFu(function () {
          var q = sb.from('appointments').select('id, patient_id, date, status, is_planned, dismissed_at, arrived_at, seated_at')
            .in('patient_id', part).gte('date', day);
          return uid ? q.eq('doctor_id', uid) : q;
        });
        if (!ra || ra.error) return null;
        appts = appts.concat(ra.data || []);
      }
      return compute(bases, appts, day, !!opt.strict);
    } catch (e) { console.warn('SyFuUnbooked.load:', e); return null; }
  }

  window.SyFuUnbooked = { compute: compute, load: load, upcoming: upcoming, label: label, dmy: dmy };
})();
