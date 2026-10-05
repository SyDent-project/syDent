/* SYDENT_APPT_CONFLICT_START — حارسُ التعارض عند الحفظ (v495)
   ─────────────────────────────────────────────────────────────
   المصدرُ الواحد لسؤال «هل هذا الوقتُ مشغول؟» قبل أي كتابةٍ تُنشئ موعداً أو
   تنقله (نافذةُ المواعيد · السحبُ والإفلات بالكراسي والأسبوع · نافذةُ الموعد
   بملف المريض · موعدُ التركيب التلقائي من طلب المخبر).
   قبل هذه النسخة كان التعارضُ يُكشف **بصرياً فقط** بعرض الكراسي (appt-views.js)
   ولا يمنع الحفظَ بأي مسار.

   التعريف (Open Dental «Appointment Rules» — تعارضُ وقتِ الطبيب؛ ومعه الكرسي):
     موعدان يتعارضان إذا تقاطع وقتاهما [start, start+duration) بنفس اليوم
     **وكان لهما الطبيبُ نفسُه أو الكرسيُّ نفسُه**. مريضٌ بلا طبيب وبلا كرسي
     لا يتعارض مع شيء (لا يوجد موردٌ مشترك).
   ما لا يُحسب مشغولاً: ملغى · عدم حضور · broken (قديم) · موعدٌ مخطّط بلا تاريخ ·
     الموعدُ نفسُه عند التعديل. (المكتملُ يُحسب — شغل الكرسي فعلاً.)
   المدّة الغائبة = 30 دقيقة (نفس افتراض عرض الكراسي وفحص نقل الطبيب بملف المريض).

   القرار: تحذيرٌ لا منع — الحجزُ المزدوج مقصودٌ أحياناً (مساعدةٌ تعمل بالتوازي)،
   فالحوار يسمّي التعارضَ (من · متى · لماذا) ويطلب تأكيداً صريحاً؛ الإلغاءُ لا يكتب
   شيئاً. عند فشل الاستعلام يُتابَع الحفظ مع تحذيرٍ بالكونسول (fail-open — كالمسار
   نفسه بأختام الحضور) كي لا يُحجب السكرتير عن الحجز بسبب الشبكة.
   لا يلمس FIFO ولا computeFinancials — قراءةٌ محضة قبل الكتابة.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentConflict) return;

  var DEAD_STATUSES = { cancelled: 1, broken: 1, no_show: 1 };
  var DEFAULT_DURATION = 30;
  var SELECT_COLS = 'id, patient_name, patient_id, date, time, duration, status, provider_id, operatory_id, is_planned';

  function minOf(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t));
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : NaN;
  }
  function durOf(d) {
    var n = parseInt(d, 10);
    return (Number.isFinite(n) && n > 0) ? n : DEFAULT_DURATION;
  }
  function fmt12(min) {   /* مسافةٌ غير فاصلة قبل AM/PM كي لا ينكسر الوقت بين سطرين (لُوحظ حياً بالنقل) */
    var h = Math.floor(min / 60) % 24, m = min % 60;
    var ap = h < 12 ? 'AM' : 'PM', h12 = h % 12; if (h12 === 0) h12 = 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + '\u00A0' + ap;
  }

  /* دالةٌ محضة: المرشَّح {id?, date, time, duration, provider_id, operatory_id}
     مقابل صفوف — تُعيد [{appt, reasons:['provider'|'operatory'], startMin, endMin}] */
  function find(cand, rows) {
    if (!cand || !cand.date) return [];
    var s0 = minOf(cand.time);
    if (!Number.isFinite(s0)) return [];
    var e0 = s0 + durOf(cand.duration);
    var prov = cand.provider_id || null, op = cand.operatory_id || null;
    if (!prov && !op) return [];
    var out = [];
    (rows || []).forEach(function (x) {
      if (!x || (cand.id && x.id === cand.id)) return;
      if (x.is_planned || !x.date || x.date !== cand.date) return;
      if (DEAD_STATUSES[x.status]) return;
      var s1 = minOf(x.time);
      if (!Number.isFinite(s1)) return;
      var e1 = s1 + durOf(x.duration);
      if (!(s1 < e0 && s0 < e1)) return;
      var why = [];
      if (prov && x.provider_id === prov) why.push('provider');
      if (op && x.operatory_id === op) why.push('operatory');
      if (why.length) out.push({ appt: x, reasons: why, startMin: s1, endMin: e1 });
    });
    return out.sort(function (a, b) { return a.startMin - b.startMin; });
  }

  /* يجلب مواعيدَ اليوم نفسِه من القاعدة (نطاق الطبيب) ثم يطبّق find. */
  async function check(cand, doctorId) {
    var out = { conflicts: [], blocks: [], error: null };
    if (!window.sb || !doctorId || !cand || !cand.date || !cand.time) return out;
    try {
      if (cand.provider_id || cand.operatory_id) {
        var r = await window.sb.from('appointments').select(SELECT_COLS)
          .eq('doctor_id', doctorId).eq('date', cand.date);
        if (r.error) { out.error = r.error; return out; }
        out.conflicts = find(cand, r.data || []);
      }
      /* v498 (M154): الفتراتُ المغلقة المانعة بنفس اليوم — SyDentBlocks هو المصدر (sched-blocks.js) */
      if (window.SyDentBlocks) {
        var rows = await window.SyDentBlocks.load(doctorId, cand.date, cand.date);
        out.blocks = window.SyDentBlocks.blocking(window.SyDentBlocks.expand(rows, cand.date, cand.date), cand);
      }
      return out;
    } catch (e) { out.error = e; return out; }
  }

  /* نصُّ الحوار — سطرٌ لكل تعارض: المورد · الوقت · المريض. names: {provider(id), operatory(id)} */
  function describe(conflicts, names, verb, blocks) {
    names = names || {}; verb = verb || 'الحجز'; blocks = blocks || [];
    var pn = typeof names.provider === 'function' ? names.provider : function () { return null; };
    var on = typeof names.operatory === 'function' ? names.operatory : function () { return null; };
    var lines = conflicts.map(function (c) {
      var who = c.appt.patient_name ? ('«' + c.appt.patient_name + '»') : 'مريض';
      var when = '\u2066' + fmt12(c.startMin) + '\u2060–\u2060' + fmt12(c.endMin) + '\u2069';   /* عزلُ LTR + رابطا كلمة حول الشرطة: المدى كتلةٌ واحدة */
      var res = c.reasons.map(function (r) {
        if (r === 'provider') { var p = pn(c.appt.provider_id); return 'الطبيب' + (p ? ' ' + p : ''); }
        var o = on(c.appt.operatory_id); return 'الكرسي' + (o ? ' ' + o : '');
      }).join(' و');
      return '• ' + res + ' مشغول ' + when + ' مع ' + who;
    });
    blocks.forEach(function (i) { lines.push(window.SyDentBlocks.describeLine(i)); });
    var head = conflicts.length
      ? 'هذا الوقتُ يتداخل مع ' + (conflicts.length === 1 ? 'موعدٍ آخر' : (conflicts.length + ' مواعيدَ أخرى')) + (blocks.length ? ' ومع وقتٍ محجوز' : '') + ':'
      : 'هذا الوقتُ يقع ضمن فترةٍ محجوزة على التقويم:';
    return head + '\n' + lines.join('\n') + '\n\nهل تريد ' + verb + ' رغم التعارض؟';
  }

  /* الواجهة المستعملة بمسارات الحفظ. تُعيد true = تابع الكتابة (لا تعارض، أو أكّد
     المستخدم)، false = ألغى المستخدم. opts: {doctorId, names, confirmText} */
  async function confirmOrAbort(cand, opts) {
    opts = opts || {};
    var res = await check(cand, opts.doctorId || (window.currentUser && window.currentUser.id));
    if (res.error) { console.warn('SyDentConflict: check failed — proceeding without guard:', res.error); return true; }
    if (!res.conflicts.length && !res.blocks.length) return true;
    var verb = opts.verb || 'الحجز';   /* «الحجز» بالحفظ · «النقل» بالسحب — السؤالُ والزرّ بفعلٍ واحد */
    var msg = describe(res.conflicts, opts.names, verb, res.blocks);
    if (window.SyDialog && typeof window.SyDialog.confirm === 'function') {
      return !!(await window.SyDialog.confirm({
        title: '⚠️ تعارض بالموعد', message: msg,
        confirmText: verb + ' رغم التعارض', cancelText: 'إلغاء', danger: true
      }));
    }
    /* sy-modal.js يسبق هذه الوحدة بكل صفحةٍ مستهلِكة (يثبته المثبت) — غيابه خللُ تحميلٍ لا حالةَ عمل:
       لا نوافذَ متصفّحٍ أصلية بالمنصة، فنسجّل ونمرّر كالفشل الشبكي. */
    console.warn('SyDentConflict: SyDialog missing — proceeding without guard');
    return true;
  }

  window.SyDentConflict = { find: find, check: check, describe: describe, confirm: confirmOrAbort,
    DEAD_STATUSES: DEAD_STATUSES, DEFAULT_DURATION: DEFAULT_DURATION };
})();
/* SYDENT_APPT_CONFLICT_END */
