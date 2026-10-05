/* SYDENT_RELIABILITY_START — مؤشّرُ التزام المريض (v497)
   ─────────────────────────────────────────────────────────────
   المصدرُ الواحد لحساب «كم مرة غاب هذا المريض أو ألغى؟» وعرضِه شارةً صغيرة
   بجانب اسمه: بطاقاتُ المواعيد (يوم · كراسٍ · أسبوع · قائمة) · نافذةُ الموعد عند
   اختيار المريض · طابورُ اليوم باللوحة · جدولُ المرضى.
   (Dentrix «Broken/No-Show list» · Curve «missed appointments» على بطاقة المريض
   — بنفس الروح: معلومةٌ للسكرتيرة كي تطلب تأكيداً مسبقاً أو عربوناً، لا حكمٌ على المريض.)

   التعريف (ثوابتُه أدناه):
   • النافذة: آخر 12 شهراً حتى اليوم (بتاريخ الموعد `date`).
   • المنتهي: completed · no_show · broken · cancelled، أو موعدٌ مُهر بـdismissed_at.
   • الفشل: no_show/broken دائماً، وcancelled **إلا إذا** كان للمريض موعدٌ آخر غيرُ ملغى
     بنفس اليوم (إلغاءٌ لإعادة الجدولة ليس غياباً).
   • لا حكمَ قبل موعدين منتهيين (مريضٌ جديد = بلا شارة).
   • الدرجة: 0 بلا فشل · 2 إن كان الفشل ≥2 أو نسبتُه ≥30% · وإلا 1.
   لا شيءَ يُحفظ بالقاعدة ولا يؤثّر على الحجز — عرضٌ محض من صفوفٍ محمّلة.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentReliability) return;

  var WINDOW_DAYS = 365, MIN_FINISHED = 2, RED_COUNT = 2, RED_RATE = 0.3;
  var FINISHED = { completed: 1, no_show: 1, broken: 1, cancelled: 1 };
  var MISSED   = { no_show: 1, broken: 1 };

  function ymdLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function windowStart(todayYmd) {
    var p = todayYmd.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() - WINDOW_DAYS);
    return ymdLocal(d);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* دالةٌ محضة: صفوفُ مواعيد ⇒ { patient_id: {missed, cancelled, failures, finished, rate, level} }.
     today بصيغة YYYY-MM-DD محلية (افتراضياً اليوم). */
  function compute(rows, today) {
    today = today || ymdLocal(new Date());
    var from = windowStart(today);
    var byPt = {};
    (rows || []).forEach(function (a) {
      if (!a || !a.patient_id || !a.date || a.is_planned) return;
      if (a.date < from || a.date > today) return;
      var finished = !!FINISHED[a.status] || !!a.dismissed_at;
      if (!finished) return;
      (byPt[a.patient_id] = byPt[a.patient_id] || []).push(a);
    });
    var out = {};
    Object.keys(byPt).forEach(function (pid) {
      var list = byPt[pid], missed = 0, cancelled = 0;
      list.forEach(function (a) {
        if (MISSED[a.status]) { missed++; return; }
        if (a.status === 'cancelled') {
          var rebooked = list.some(function (b) { return b !== a && b.date === a.date && b.status !== 'cancelled'; });
          if (!rebooked) cancelled++;
        }
      });
      var finished = list.length, failures = missed + cancelled;
      var rate = finished ? failures / finished : 0;
      var level = 0;
      if (finished >= MIN_FINISHED && failures > 0) level = (failures >= RED_COUNT || rate >= RED_RATE) ? 2 : 1;
      out[pid] = { missed: missed, cancelled: cancelled, failures: failures, finished: finished, rate: rate, level: level };
    });
    return out;
  }

  function title(s) {
    var parts = [];
    if (s.missed) parts.push('عدم حضور ' + s.missed);
    if (s.cancelled) parts.push('إلغاء بلا بديل ' + s.cancelled);
    return parts.join(' · ') + ' — من \u2066' + s.finished + '\u2069 مواعيد منتهية بآخر 12 شهراً';
  }

  /* شارةٌ inline بأسلوب شارات الموعد (tone-yellow / tone-red). '' عند الدرجة 0. */
  function badgeHtml(s, small) {
    if (!s || !s.level) return '';
    var tone = s.level === 2 ? 'tone-red' : 'tone-yellow';
    var fs = small ? '10px' : '11px';
    return '<span class="tone ' + tone + ' pt-reliab" style="display:inline-block;border-width:1px;border-style:solid;padding:' + (small ? '1px 6px' : '2px 8px') + ';border-radius:12px;font-size:' + fs + ';font-weight:800;margin-right:6px;white-space:nowrap;" title="' + esc(title(s)) + '">⚠ \u2066' + s.failures + '/' + s.finished + '\u2069</span>';
  }

  /* سطرُ تلميحٍ نصّي لنافذة الموعد (يوضع بعنصرٍ textContent — لا HTML). */
  function hintText(s) {
    if (!s || !s.level) return '';
    return '⚠ التزام المريض: ' + title(s) + (s.level === 2 ? ' — يُستحسن تأكيدٌ مسبق أو عربون.' : '');
  }

  /* الاستعلامُ الموحّد للصفحات التي لا تحمّل السجلَّ كاملاً (اللوحة · المرضى):
     مواعيدُ النافذة للطبيب، اختيارياً محصورةً بمرضى محدّدين. */
  async function load(doctorId, patientIds, today) {
    today = today || ymdLocal(new Date());
    if (!window.sb || !doctorId) return {};
    if (Array.isArray(patientIds) && !patientIds.length) return {};
    try {
      /* v548: 12 شهراً من مواعيد العيادة تتجاوز 1000 صفّ ⇒ مصفّحة (#699)، وقائمةُ المرضى بمقاطع 150 (#691). */
      var fetchAll = window.SyDentFetchAll || function (b) { return b(); };
      var build = function (ids) {
        return function () {
          var q = window.sb.from('appointments').select('patient_id, date, status, dismissed_at, is_planned')
            .eq('doctor_id', doctorId).gte('date', windowStart(today)).lte('date', today);
          return ids ? q.in('patient_id', ids) : q;
        };
      };
      var chunks = Array.isArray(patientIds) ? [] : [null];
      if (Array.isArray(patientIds)) for (var c = 0; c < patientIds.length; c += 150) chunks.push(patientIds.slice(c, c + 150));
      var rows = [];
      for (var k = 0; k < chunks.length; k++) {
        var r = await fetchAll(build(chunks[k]));
        if (r.error) { console.warn('SyDentReliability.load:', r.error); return {}; }
        rows = rows.concat(r.data || []);
      }
      return compute(rows, today);
    } catch (e) { console.warn('SyDentReliability.load:', e); return {}; }
  }

  window.SyDentReliability = { compute: compute, badgeHtml: badgeHtml, hintText: hintText, load: load,
    windowStart: windowStart, WINDOW_DAYS: WINDOW_DAYS, MIN_FINISHED: MIN_FINISHED, RED_COUNT: RED_COUNT, RED_RATE: RED_RATE };
})();
/* SYDENT_RELIABILITY_END */
