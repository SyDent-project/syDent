/* SYDENT_BLOCKS_START — الحجوزاتُ المغلقة على التقويم (v498 · M154)
   ─────────────────────────────────────────────────────────────
   المصدرُ الواحد لقراءة جدول `schedule_blocks` وتوسيعِ الفترات المتكرّرة إلى
   «حالاتٍ يومية» تستهلكها العروض (كراسٍ · أسبوع · يوم · شهر) وحارسُ التعارض
   ونافذةُ الإدارة. الجدول: مدى تواريخ + أيامُ أسبوعٍ اختيارية (0=الأحد … 6=السبت،
   اصطلاح JS getDay) + وقتُ بداية/نهاية أو يومٌ كامل + نطاق (كل العيادة · كرسي · طبيب)
   + blocks_scheduling (false = «محجوز لنوع» — بصريٌّ لا يمنع).
   ساعاتُ العمل: تُقرأ من clinic_settings (booking_work_days/start/end) للتظليل
   البصري فقط — لا تحذيرَ عليها (ساعاتُ الحجز الإلكتروني قد تكون أضيقَ من دوام العيادة عمداً).
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentBlocks) return;

  var KINDS = {
    break:    { label: 'استراحة',        icon: '☕' },
    leave:    { label: 'إجازة',          icon: '🏖' },
    meeting:  { label: 'اجتماع',         icon: '👥' },
    power:    { label: 'انقطاع كهرباء',  icon: '⚡' },
    reserved: { label: 'محجوز لنوع',     icon: '📌' },
    other:    { label: 'أخرى',           icon: '⛔' }
  };
  var COLS = 'id, title, kind, date_from, date_to, weekdays, start_time, end_time, operatory_id, provider_id, blocks_scheduling, notes';

  function minOf(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t)); return m ? (+m[1] * 60 + +m[2]) : NaN; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dowOf(s) { return parseYmd(s).getDay(); }
  function fmt12(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12; if (h12 === 0) h12 = 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + '\u00A0' + ap;
  }

  /* هل ينطبق الصفُّ على هذا اليوم؟ (مدى + أيام الأسبوع) */
  function appliesOn(b, dateYmd) {   /* M155: date_to NULL = بلا نهاية */
    if (!b || !dateYmd || dateYmd < b.date_from || (b.date_to && dateYmd > b.date_to)) return false;
    if (Array.isArray(b.weekdays) && b.weekdays.length) return b.weekdays.indexOf(dowOf(dateYmd)) !== -1;
    return true;
  }

  /* توسيعُ الصفوف إلى حالاتٍ يومية داخل [from, to] (مضمّنين). كل حالة:
     {block, date, allDay, startMin, endMin, operatory_id, provider_id, blocks} — اليومُ الكامل 0..1440. */
  function expand(rows, from, to) {
    var out = [];
    (rows || []).forEach(function (b) {
      if (!b || !b.date_from) return;
      var d = parseYmd(b.date_from > from ? b.date_from : from);
      var end = (b.date_to && b.date_to < to) ? b.date_to : to;
      for (var s = ymd(d); s <= end; d.setDate(d.getDate() + 1), s = ymd(d)) {
        if (!appliesOn(b, s)) continue;
        var allDay = !b.start_time || !b.end_time;
        var sm = allDay ? 0 : minOf(b.start_time), em = allDay ? 1440 : minOf(b.end_time);
        if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) continue;
        out.push({ block: b, date: s, allDay: allDay, startMin: sm, endMin: em,
          operatory_id: b.operatory_id || null, provider_id: b.provider_id || null, blocks: b.blocks_scheduling !== false });
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin; });
  }

  function forDay(instances, dateYmd) { return (instances || []).filter(function (i) { return i.date === dateYmd; }); }

  /* هل تخصّ الحالةُ هذا العمود/المورد؟ null بالحالة = الكل. للعمود «بلا كرسي» (null) تُعرض
     الحالاتُ العامة فقط (بلا كرسي محدّد). */
  function appliesToColumn(i, operatoryId) {
    if (!i.operatory_id) return true;
    return !!operatoryId && i.operatory_id === operatoryId;
  }

  /* حالاتٌ **مانعة** تتقاطع مع مرشَّح موعد {date, time, duration, provider_id, operatory_id}:
     العامّة (بلا كرسي ولا طبيب) تمنع الجميع؛ الخاصّةُ بكرسي تمنع مواعيدَ ذلك الكرسي؛
     الخاصّةُ بطبيب تمنع مواعيدَ ذلك الطبيب. reserved (blocks=false) لا تُعاد هنا. */
  function blocking(instances, cand) {
    if (!cand || !cand.date) return [];
    var s0 = minOf(cand.time); if (!Number.isFinite(s0)) return [];
    var n = parseInt(cand.duration, 10); var e0 = s0 + ((Number.isFinite(n) && n > 0) ? n : 30);
    return forDay(instances, cand.date).filter(function (i) {
      if (!i.blocks) return false;
      if (!(i.startMin < e0 && s0 < i.endMin)) return false;
      if (i.operatory_id && i.operatory_id !== (cand.operatory_id || null)) return false;
      if (i.provider_id && i.provider_id !== (cand.provider_id || null)) return false;
      return true;
    });
  }

  function label(i) {
    var k = KINDS[i.block.kind] || KINDS.other;
    return k.icon + ' ' + (i.block.title || k.label);
  }
  function timeLabel(i) { return i.allDay ? 'يومٌ كامل' : '\u2066' + fmt12(i.startMin) + '\u2060–\u2060' + fmt12(i.endMin) + '\u2069'; }

  /* سطرٌ لحوار التعارض */
  function describeLine(i) { return '• وقتٌ محجوز: ' + label(i) + ' ' + timeLabel(i); }

  /* ساعاتُ العمل من clinic_settings ⇒ {days:[..], startMin, endMin} أو null */
  function workHours(cs) {
    if (!cs || !cs.booking_work_start || !cs.booking_work_end) return null;
    var s = minOf(cs.booking_work_start), e = minOf(cs.booking_work_end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    var days = String(cs.booking_work_days || '').split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 0 && x <= 6; });
    return { days: days, startMin: s, endMin: e };
  }
  /* هل هذا الوقتُ خارج الدوام؟ (للتظليل) */
  function isClosed(wh, dateYmd, min) {
    if (!wh) return false;
    if (wh.days.length && wh.days.indexOf(dowOf(dateYmd)) === -1) return true;
    return min < wh.startMin || min >= wh.endMin;
  }

  /* جلبُ الصفوف المتقاطعة مع [from, to] لطبيبٍ */
  async function load(doctorId, from, to) {
    if (!window.sb || !doctorId) return [];
    try {
      var r = await window.sb.from('schedule_blocks').select(COLS)
        .eq('doctor_id', doctorId).lte('date_from', to).or('date_to.is.null,date_to.gte.' + from).order('date_from');
      if (r.error) {
        if (r.error.code === '42P01' || /schedule_blocks/.test(String(r.error.message || ''))) return [];   /* قبل M154 */
        console.warn('SyDentBlocks.load:', r.error); return [];
      }
      return r.data || [];
    } catch (e) { console.warn('SyDentBlocks.load:', e); return []; }
  }

  window.SyDentBlocks = { KINDS: KINDS, COLS: COLS, appliesOn: appliesOn, expand: expand, forDay: forDay, appliesToColumn: appliesToColumn,
    blocking: blocking, label: label, timeLabel: timeLabel, describeLine: describeLine, workHours: workHours, isClosed: isClosed, load: load, fmt12: fmt12 };
})();
/* SYDENT_BLOCKS_END */
