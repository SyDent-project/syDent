/* SYDENT_GAPS_START — فجواتُ اليوم ويوم العمل القادم ومن يملؤها (v519 · البند 4 من جولة اللوحة)
   ─────────────────────────────────────────────────────────────
   (Dental Intelligence «Holes in the schedule» · Dentrix «ASAP List» · Open Dental «ASAP / Unscheduled List»)
   العقد:
   • **الفجوة** = فراغٌ داخل ساعات العمل (clinic_settings.booking_work_start/end/days) لا يشغله موعدٌ حيّ
     ولا وقتٌ محجوز، وطولُه ≥ مدة الخانة (booking_slot_minutes، 30 افتراضاً). المشغول:
       – المواعيدُ غيرُ الملغاة/الغائبة (cancelled · no_show · broken) وغيرُ «المخطّطة بلا تاريخ»، بمدتها (30 افتراضاً)؛
       – الأوقاتُ المحجوزة (SyDentBlocks) العامةُ والخاصةُ بطبيب — المانعةُ و«المحجوزةُ لنوع» معاً (لا تُعرض
         فراغاً للتعبئة العامة)؛ حجزُ كرسيٍّ بعينه لا يُعدّ (الطبيبُ متاحٌ على كرسيٍّ آخر).
     اليوم: من الآن مقرَّباً لأعلى على شبكة الخانات. يومُ العمل القادم: أولُ يوم عملٍ بعد اليوم (≤ 7 أيام).
     عيادةٌ واحدة/طبيبٌ واحد (السوق السوري) ⇒ الفجوةُ على مستوى العيادة لا الكرسي.
   • **من يملؤها** (بالترتيب): ⚡ قائمةُ الانتظار (مواعيدُ حيّة بعلم asap بتاريخٍ لاحق) — «قدّمه» يفتح الموعد
     بالوقت الجديد معبّأً؛ ثم 🦷 مرضى لهم علاجٌ معتمد بلا موعد (نفسُ تعريف رقاقة الهدل v514: بندٌ مخطّط بلا
     موعد أو بموعدٍ مات) **وليس لهم أيُّ موعدٍ قادم** — «احجز» يفتح موعداً جديداً بالوقت والمريض معبّأين.
     لكلِّ مرشّح أولُ فجوةٍ تتّسع لمدته. لا حجزَ تلقائي — القرارُ للسكرتيرة/الطبيب.
   • قراءةٌ محضة، صفرُ كتابة، نصوصٌ مُهرَّبة، ألوانُ theme.css.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentGaps) return;

  var DEAD = { cancelled: 1, no_show: 1, broken: 1 };
  var WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MAX_CANDS = 5, CHUNK = 150;
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function ymdLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dmy(s) { var p = String(s || '').split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) : String(s || ''); }
  function minOf(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t)); return m ? (+m[1] * 60 + +m[2]) : NaN; }
  function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function fmt12(min) {
    if (window.SyDentBlocks && window.SyDentBlocks.fmt12) return window.SyDentBlocks.fmt12(min);
    var h = Math.floor(min / 60) % 24, m = min % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + '\u00A0' + ap;
  }
  function durOf(a) { var n = parseInt(a && a.duration, 10); return (Number.isFinite(n) && n > 0) ? n : 30; }

  /* ساعاتُ العمل ⇒ {days:[], startMin, endMin, slot} أو null */
  function hoursOf(cs) {
    if (!cs) return null;
    var s = minOf(cs.booking_work_start), e = minOf(cs.booking_work_end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    var days = String(cs.booking_work_days == null ? '' : cs.booking_work_days).split(',').map(function (x) { return parseInt(String(x).trim(), 10); }).filter(function (x) { return x >= 0 && x <= 6; });
    var slot = parseInt(cs.booking_slot_minutes, 10); if (!(slot >= 5 && slot <= 240)) slot = 30;
    return { days: days, startMin: s, endMin: e, slot: slot };
  }
  function isWorkDay(h, ymd) { return !h.days.length || h.days.indexOf(parseYmd(ymd).getDay()) !== -1; }
  /* أولُ يوم عملٍ بعد today (≤ 7 أيام) */
  function nextWorkDay(h, today) {
    var d = parseYmd(today);
    for (var k = 1; k <= 7; k++) {
      var c = ymdLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k));
      if (isWorkDay(h, c)) return { day: c, k: k };
    }
    return null;
  }

  /* فجواتُ يومٍ واحد (دالةٌ محضة). fromMin = بدايةُ البحث (اليوم: الآن). */
  function gapsForDay(h, day, appts, blockInst, fromMin) {
    if (!h || !isWorkDay(h, day)) return [];
    var start = h.startMin;
    if (Number.isFinite(fromMin) && fromMin > start) start = h.startMin + Math.ceil((fromMin - h.startMin) / h.slot) * h.slot;
    if (start >= h.endMin) return [];
    var busy = [];
    (appts || []).forEach(function (a) {
      if (!a || String(a.date).slice(0, 10) !== day || DEAD[a.status] || a.is_planned === true) return;
      var s = minOf(a.time); if (!Number.isFinite(s)) return;
      busy.push([s, s + durOf(a)]);
    });
    (blockInst || []).forEach(function (i) {
      if (!i || i.date !== day || i.operatory_id) return;   /* حجزُ كرسيٍّ بعينه لا يمنع الطبيب */
      busy.push([i.startMin, i.endMin]);
    });
    busy.sort(function (x, y) { return x[0] - y[0]; });
    var out = [], cur = start;
    busy.forEach(function (b) {
      if (b[1] <= cur) return;
      if (b[0] > cur) { var e = Math.min(b[0], h.endMin); if (e - cur >= h.slot) out.push({ startMin: cur, endMin: e, len: e - cur }); }
      cur = Math.max(cur, b[1]);
    });
    if (h.endMin - cur >= h.slot) out.push({ startMin: cur, endMin: h.endMin, len: h.endMin - cur });
    return out;
  }

  /* أولُ فجوةٍ تتّسع لمدة need عبر الأيام بالترتيب ⇒ {day, startMin} أو null */
  function firstFit(days, need) {
    for (var i = 0; i < days.length; i++) {
      for (var j = 0; j < days[i].gaps.length; j++) {
        if (days[i].gaps[j].len >= need) return { day: days[i].day, startMin: days[i].gaps[j].startMin };
      }
    }
    return null;
  }

  /* دالةٌ محضة.
     ctx = { today, nowMin, cs: clinic_settings, appts: مواعيدُ اليوم ويوم العمل القادم, blocks: حالاتُ SyDentBlocks الموسَّعة,
             asap: مواعيدُ asap (id, patient_id, patient_name, date, time, duration, status, dismissed_at),
             planned: بنودٌ مخطّطة (patient_id, appointment_id, plan_option, status), linkedAppts: {id → صف} لبنودٍ مربوطة,
             upcoming: {patient_id → true} لمن له موعدٌ حيٌّ قادم, patients: [{id, name}] } */
  function compute(ctx) {
    ctx = ctx || {};
    var today = ctx.today || ymdLocal(new Date());
    var h = hoursOf(ctx.cs);
    if (!h) return { noHours: true, days: [], asap: [], unscheduled: [] };
    var days = [];
    if (isWorkDay(h, today)) days.push({ day: today, isToday: true, label: 'اليوم — بقية الدوام', gaps: gapsForDay(h, today, ctx.appts, ctx.blocks, ctx.nowMin) });
    var nx = nextWorkDay(h, today);
    if (nx) days.push({ day: nx.day, isToday: false, label: (nx.k === 1 ? 'غداً' : 'يوم العمل القادم') + ' — ' + WD[parseYmd(nx.day).getDay()] + ' ' + dmy(nx.day),
                        gaps: gapsForDay(h, nx.day, ctx.appts, ctx.blocks, NaN) });
    var lastDay = days.length ? days[days.length - 1].day : today;
    /* ⚡ قائمةُ الانتظار: موعدٌ حيّ بعلم asap، بعد آخر يومٍ معروض (وإلا فهو قادمٌ أصلاً ضمن النافذة) */
    var asap = [];
    (ctx.asap || []).forEach(function (a) {
      if (!a || !a.id || a.asap === false) return;
      if (DEAD[a.status] || a.status === 'completed' || a.dismissed_at || a.is_planned === true) return;
      var d = String(a.date || '').slice(0, 10); if (!d || d <= lastDay) return;
      var fit = firstFit(days, durOf(a));
      asap.push({ id: a.id, patient_id: a.patient_id || null, name: String(a.patient_name || ''), date: d, time: String(a.time || '').slice(0, 5), duration: durOf(a), fit: fit });
    });
    asap.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.time < y.time ? -1 : 1); });
    /* 🦷 علاجٌ معتمد بلا موعد — ومن ليس له موعدٌ قادم */
    var dead = (typeof window.SyDentApptDead === 'function') ? window.SyDentApptDead : null;
    var linked = ctx.linkedAppts || {}, cnt = {};
    (ctx.planned || []).forEach(function (s) {
      if (!s || !s.patient_id || (s.status || 'planned') !== 'planned') return;
      if (s.plan_option >= 1 && s.plan_option <= 3) return;
      var free = !s.appointment_id;
      if (!free) { var la = linked[s.appointment_id]; free = !!la && !!dead && dead(la, today); }
      if (free) cnt[s.patient_id] = (cnt[s.patient_id] || 0) + 1;
    });
    var names = {}; (ctx.patients || []).forEach(function (p) { if (p && p.id) names[p.id] = String(p.name || ''); });
    var asapPids = {}; asap.forEach(function (x) { if (x.patient_id) asapPids[x.patient_id] = 1; });
    var up = ctx.upcoming || {};
    var fit30 = firstFit(days, h.slot);
    var unscheduled = Object.keys(cnt).filter(function (pid) { return !up[pid] && !asapPids[pid] && names[pid]; })
      .map(function (pid) { return { patient_id: pid, name: names[pid], items: cnt[pid], fit: fit30 }; })
      .sort(function (x, y) { return y.items - x.items || x.name.localeCompare(y.name, 'ar'); });
    return { noHours: false, hours: h, days: days, asap: asap.slice(0, MAX_CANDS), asapTotal: asap.length,
             unscheduled: unscheduled.slice(0, MAX_CANDS), unscheduledTotal: unscheduled.length };
  }

  function slotHref(day, min, pid) { return 'appointments.html?slot=' + encodeURIComponent(day + 'T' + hhmm(min)) + (pid ? '&pid=' + encodeURIComponent(pid) : ''); }
  function moveHref(id, day, min) { return 'appointments.html?editAppt=' + encodeURIComponent(id) + '&moveTo=' + encodeURIComponent(day + 'T' + hhmm(min)); }
  function fitLabel(res, fit) {
    var d = null; res.days.forEach(function (x) { if (x.day === fit.day) d = x; });
    return (d && d.isToday ? 'اليوم' : dmy(fit.day)) + ' ' + ltr(fmt12(fit.startMin));
  }

  /* HTML جسم البطاقة. opts.owner ⇒ رابطُ إعدادات الساعات حين غيابها. */
  function render(res, opts) {
    opts = opts || {};
    if (!res) return '';
    if (res.noHours) return '<div class="gp-empty">حدّد ساعات العمل بالإعدادات (قسم الحجز) لحساب الفجوات' + (opts.owner ? ' — <a class="card-action" href="settings.html">الإعدادات ←</a>' : '') + '</div>';
    var h = '';
    res.days.forEach(function (d) {
      h += '<div class="gp-day"><div class="gp-dlabel">' + esc(d.label) + '</div>';
      if (!d.gaps.length) h += '<div class="gp-full">✅ ' + (d.isToday ? 'لا فجوات ببقية اليوم' : 'اليوم ممتلئ') + '</div>';
      else h += '<div class="gp-gaps">' + d.gaps.map(function (g) {
        return '<a class="pt-flag cbadge tone tone-cyan pt-flag-sm gp-chip" href="' + esc(slotHref(d.day, g.startMin)) + '" title="احجز موعداً جديداً بهذا الوقت">⏱ '
          + ltr(fmt12(g.startMin) + '\u2060–\u2060' + fmt12(g.endMin)) + ' · ' + ltr(String(g.len)) + ' د</a>';
      }).join('') + '</div>';
      h += '</div>';
    });
    var anyGap = res.days.some(function (d) { return d.gaps.length; });
    if (res.asap.length) {
      h += '<div class="gp-sec">⚡ ينتظرون موعداً أبكر <span class="gp-n">' + ltr(String(res.asapTotal)) + '</span></div>';
      res.asap.forEach(function (x) {
        h += '<div class="gp-row"><span class="gp-name">' + esc(x.name || '—') + ' <span class="gp-meta">موعده ' + ltr(dmy(x.date) + (x.time ? ' ' + fmt12(minOf(x.time)) : '')) + '</span></span>'
          + (x.fit ? '<a class="gp-act" href="' + esc(moveHref(x.id, x.fit.day, x.fit.startMin)) + '">قدّمه لـ' + fitLabel(res, x.fit) + '</a>' : '<span class="gp-meta">لا فجوة تتّسع لـ' + ltr(String(x.duration)) + ' د</span>') + '</div>';
      });
    }
    if (res.unscheduled.length) {
      h += '<div class="gp-sec">🦷 علاج معتمد بلا موعد <span class="gp-n">' + ltr(String(res.unscheduledTotal)) + '</span></div>';
      res.unscheduled.forEach(function (x) {
        h += '<div class="gp-row"><span class="gp-name">' + esc(x.name) + ' <span class="gp-meta">' + ltr(String(x.items)) + ' بند</span></span>'
          + (x.fit ? '<a class="gp-act" href="' + esc(slotHref(x.fit.day, x.fit.startMin, x.patient_id)) + '">احجز ' + fitLabel(res, x.fit) + '</a>' : '') + '</div>';
      });
    }
    if (anyGap && !res.asap.length && !res.unscheduled.length) h += '<div class="gp-meta gp-none">لا أحد بقائمة الانتظار ولا علاجاتٍ معتمدة بلا موعد</div>';
    return h;
  }

  /* التحميل: مواعيدُ النافذة · الأوقاتُ المحجوزة · قائمةُ الانتظار · البنودُ المخطّطة (+ مواعيدُها المربوطة) · المواعيدُ القادمة للمرشّحين. */
  async function load(sb, uid, ctx) {
    ctx = ctx || {};
    var today = ctx.today || ymdLocal(new Date());
    var h = hoursOf(ctx.cs);
    var nx = h ? nextWorkDay(h, today) : null;
    var to = nx ? nx.day : today;
    var appts = [], blocks = [], asap = [], planned = [], linkedAppts = {}, upcoming = {};
    if (h) {
      try {
        var rs = await Promise.all([
          window.SyDentFetchAll(function(){ return sb.from('appointments').select('id, date, time, duration, status, is_planned').eq('doctor_id', uid).gte('date', today).lte('date', to); }),
          window.SyDentFetchAll(function(){ return sb.from('appointments').select('id, patient_id, patient_name, date, time, duration, status, dismissed_at, is_planned, asap').eq('doctor_id', uid).eq('asap', true).gt('date', to); }),
          window.SyDentFetchAll(function(){ return sb.from('ledger_sessions').select('patient_id, appointment_id, plan_option, status').eq('doctor_id', uid).eq('status', 'planned'); }),
          (window.SyDentBlocks ? window.SyDentBlocks.load(uid, today, to) : Promise.resolve([]))
        ]);
        if (rs[0].error) console.warn('SyDentGaps appts:', rs[0].error); else appts = rs[0].data || [];
        if (rs[1].error) console.warn('SyDentGaps asap:', rs[1].error); else asap = rs[1].data || [];
        if (rs[2].error) console.warn('SyDentGaps planned:', rs[2].error); else planned = rs[2].data || [];
        blocks = window.SyDentBlocks ? window.SyDentBlocks.expand(rs[3] || [], today, to) : [];
        var lids = planned.map(function (s) { return s.appointment_id; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        var pids = planned.map(function (s) { return s.patient_id; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        /* مقاطعُ 150 (طولُ رابط PostgREST — نمطُ loadTrend) */
        var chunks = function (arr) { var o = []; for (var c = 0; c < arr.length; c += CHUNK) o.push(arr.slice(c, c + CHUNK)); return o; };
        var qL = chunks(lids).map(function (ids) { return sb.from('appointments').select('id, date, status, is_planned, dismissed_at, arrived_at, seated_at').eq('doctor_id', uid).in('id', ids); });
        var qU = chunks(pids).map(function (ids) { return sb.from('appointments').select('patient_id, status, is_planned, dismissed_at').eq('doctor_id', uid).in('patient_id', ids).gte('date', today); });
        var rL = await Promise.all(qL), rU = await Promise.all(qU);
        rL.forEach(function (r) { if (r.error) console.warn('SyDentGaps linked:', r.error); else (r.data || []).forEach(function (a) { linkedAppts[a.id] = a; }); });
        var upErr = false;
        rU.forEach(function (r) {
          if (r.error) { upErr = true; console.warn('SyDentGaps upcoming:', r.error); return; }
          (r.data || []).forEach(function (a) { if (!DEAD[a.status] && a.status !== 'completed' && !a.dismissed_at && a.is_planned !== true) upcoming[a.patient_id] = true; });
        });
        if (upErr) planned = [];   /* لا نعرف من له موعدٌ قادم ⇒ لا نقترح أحداً (لا اقتراحَ خاطئ) */
      } catch (e) { console.warn('SyDentGaps.load:', e); }
    }
    return compute({ today: today, nowMin: ctx.nowMin, cs: ctx.cs, appts: appts, blocks: blocks, asap: asap, planned: planned,
                     linkedAppts: linkedAppts, upcoming: upcoming, patients: ctx.patients });
  }

  window.SyDentGaps = { hoursOf: hoursOf, nextWorkDay: nextWorkDay, gapsForDay: gapsForDay, firstFit: firstFit, compute: compute, render: render, load: load };
})();
/* SYDENT_GAPS_END */
