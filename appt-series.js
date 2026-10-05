/* SYDENT_SERIES_START — المواعيدُ المتكرّرة (سلسلة) — v505 · M157
   ─────────────────────────────────────────────────────────────
   Curve/Dentrix Ascend: التكرارُ يُنشئ مواعيدَ فعليةً منفصلة تجمعها series_id؛ كلُّ موعدٍ
   يُعدَّل ويُنقل ويُلغى وحدَه (لا «قاعدةً» حيّة تُعاد قراءتها). الأولُ يُحفظ بمسار الحفظ
   المعتاد (بحارس التعارض)، ثم تُنشأ الأخوةُ هنا بعد فحصٍ مسبق **واحد** لكل التواريخ:
   مواعيدُ الطبيب/الكرسي في تلك الأيام (استعلامٌ واحد) + الفتراتُ المغلقة (استعلامٌ واحد).
   التواريخُ المتعارضة تُعرض للمستخدم فيختار: تخطّيها أو الحجز رغمها.
   الشهري: نفسُ يوم الشهر مع قصّ نهاية الشهر (31 ← 30/28) — نفسُ منطق الأقساط (prmPlanAddPeriod).
   المخطّطُ (بلا تاريخ) لا يتكرّر — قاعدةُ «المعتمدُ وحده يُجدول» لا تُمسّ.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentSeries) return;

  var FREQS = { weekly: 'أسبوعياً', biweekly: 'كل أسبوعين', monthly: 'شهرياً' };
  var MAX_COUNT = 24, MIN_COUNT = 2;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymdUTC(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  /* إضافةُ k فترة إلى تاريخ (UTC كي لا يزحف التوقيتُ الصيفي) */
  function addPeriod(startYmd, freq, k) {
    var p = String(startYmd).slice(0, 10).split('-'); var y = +p[0], m = +p[1], d = +p[2];
    if (freq === 'weekly' || freq === 'biweekly') return ymdUTC(new Date(Date.UTC(y, m - 1, d + (freq === 'weekly' ? 7 : 14) * k)));
    var mm = (m - 1) + k, yy = y + Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12;
    var last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return ymdUTC(new Date(Date.UTC(yy, mm, Math.min(d, last))));
  }
  /* تواريخُ الأخوة (من الثاني حتى count) */
  function plan(startYmd, freq, count) {
    count = parseInt(count, 10);
    if (!FREQS[freq] || !Number.isFinite(count) || count < MIN_COUNT || count > MAX_COUNT || !/^\d{4}-\d{2}-\d{2}$/.test(String(startYmd || ''))) return [];
    var out = [];
    for (var k = 1; k < count; k++) out.push(addPeriod(startYmd, freq, k));
    return out;
  }

  /* الفحصُ المسبق: لكل تاريخ، التعارضاتُ (أطباء/كراسٍ) والفتراتُ المانعة — استعلامان فقط */
  async function precheck(base, dates, doctorId) {
    var out = { byDate: {}, conflicting: [], error: null };
    if (!dates.length || !window.sb || !doctorId) return out;
    try {
      var rows = [], blocks = [];
      if (base.provider_id || base.operatory_id) {
        var r = await window.sb.from('appointments').select('id, patient_name, patient_id, date, time, duration, status, provider_id, operatory_id, is_planned')
          .eq('doctor_id', doctorId).in('date', dates);
        if (r.error) { out.error = r.error; return out; }
        rows = r.data || [];
      }
      if (window.SyDentBlocks) {
        var sorted = dates.slice().sort();
        blocks = window.SyDentBlocks.expand(await window.SyDentBlocks.load(doctorId, sorted[0], sorted[sorted.length - 1]), sorted[0], sorted[sorted.length - 1]);
      }
      dates.forEach(function (ds) {
        var cand = { id: null, date: ds, time: base.time, duration: base.duration, provider_id: base.provider_id || null, operatory_id: base.operatory_id || null };
        var c = window.SyDentConflict ? window.SyDentConflict.find(cand, rows) : [];
        var b = window.SyDentBlocks ? window.SyDentBlocks.blocking(blocks, cand) : [];
        out.byDate[ds] = { conflicts: c, blocks: b };
        if (c.length || b.length) out.conflicting.push(ds);
      });
      return out;
    } catch (e) { out.error = e; return out; }
  }

  /* صفوفُ الأخوة من الصفّ الأساس المحفوظ (الحقولُ الجدولية فقط — لا أختامَ ولا asap ولا ربطَ طلب حجز) */
  function siblingRows(saved, dates, seriesId, total) {
    return dates.map(function (ds, i) {
      return {
        doctor_id: saved.doctor_id, patient_id: saved.patient_id || null, patient_name: saved.patient_name || '',
        date: ds, time: saved.time, duration: saved.duration || 30, type: saved.type || null,
        status: 'scheduled',   /* الأخوةُ غيرُ مؤكَّدة بعد — التأكيدُ فعلٌ لكل موعدٍ عند اقترابه */
        notes: saved.notes || null, color: saved.color || null, stroke: saved.stroke || null,
        provider_id: saved.provider_id || null, operatory_id: saved.operatory_id || null,
        appointment_type_id: saved.appointment_type_id || null, is_planned: false,
        series_id: seriesId, series_index: i + 2, series_total: total
      };
    });
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  function badgeHtml(a) {
    if (!a || !a.series_id || !a.series_index) return '';
    return '<span class="tone tone-blue series-badge" title="موعدٌ ' + a.series_index + ' من سلسلة ' + (a.series_total || '?') + '" style="display:inline-block;border:1px solid var(--tone-bd);padding:1px 6px;border-radius:12px;font-size:10px;font-weight:800;margin-right:6px;white-space:nowrap;">🔁 \u2066' + a.series_index + '/' + (a.series_total || '?') + '\u2069</span>';
  }

  /* إلغاءُ ما لم يبدأ من السلسلة بعد هذا الموعد (status ⇒ cancelled؛ لا حذف) */
  async function cancelRest(doctorId, seriesId, fromIndex) {
    if (!window.sb || !doctorId || !seriesId) return { count: 0, error: null };
    var r = await window.sb.from('appointments').update({ status: 'cancelled' })
      .eq('doctor_id', doctorId).eq('series_id', seriesId).gt('series_index', fromIndex)
      .not('status', 'in', '(completed,cancelled,no_show,broken)').select('id');
    return { count: (r.data || []).length, error: r.error || null };
  }

  window.SyDentSeries = { FREQS: FREQS, MIN_COUNT: MIN_COUNT, MAX_COUNT: MAX_COUNT, addPeriod: addPeriod, plan: plan, precheck: precheck, siblingRows: siblingRows, newId: newId, badgeHtml: badgeHtml, cancelRest: cancelRest };
})();
/* SYDENT_SERIES_END */
