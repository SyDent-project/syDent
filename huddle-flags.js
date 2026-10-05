/* SYDENT_HUDDLE_START — أعلامُ الهدل الصباحي على صفّ كلِّ موعدٍ اليوم (v514 · 1ب v516)
   ─────────────────────────────────────────────────────────────
   (Dentrix «Daily Huddle» · Curve «Snapshot» · Dental Intelligence «Morning Huddle»)
   المصدرُ الواحد لحساب ورسم «ما الذي يجب أن يعرفه الطبيب/السكرتيرة عن هذا المريض
   قبل أن يجلس على الكرسي»، من صفوفٍ محمّلةٍ أصلاً باللوحة — **صفر معادلةٍ مالية**:
   الرصيدُ يُقرأ من ناتج computeDashFinancials (trueBalance بكل عملة) كما هو (#684).

   الأعلامُ (بترتيب الأهمية للطبيب السوري):
   • 💰 رصيدٌ مستحق      — trueBalance > EPS بأيِّ عملة (لا جمعَ بين العملتين).
   • 🦷 علاجٌ مخطّط غير مجدول — بنودٌ «مخطّطة» من الخطة المعتمدة (plan_option NULL) بلا موعدٍ
                              أو بموعدٍ «مات» (SyDentApptDead) — أي مرتبطة بموعد ملغى/فائت/
                              مكتمل. البنودُ المربوطة بموعدٍ حيّ (منه موعدُ اليوم) ليست ناقصة.
                              إن كانت كلُّ بنوده بخياراتٍ بديلة (أ/ب/ج) لم تُعتمد ⇒ علَمٌ مغاير.
   • ⚠️ تحذيرٌ طبي / حساسية — من medical_flags + النصّ الحرّ، بنفس شارتَي صفحة المواعيد.
   • أعلامُ المريض الملوّنة — SyDentFlags (تعريفُ العيادة).
   • 🆕 مريضٌ جديد        — لا جلسةَ مسجّلة إطلاقاً ولا موعدٌ منتهٍ بآخر 12 شهراً (SyDentReliability).
   • 🎂 عيدُ ميلاده اليوم  — dob يوم/شهر = اليوم.
   • 👪 الأسرة            — فردٌ آخر بنفس family_id عليه رصيدٌ أو له علاجٌ مخطّط غير مجدول.
   • 🔁 فحصٌ دوري مستحق  — (v516 · 1ب) آخرُ جلسةٍ مكتملة (بلا صفوف «رسم عدم الحضور» — تعريفُ lastVisitMap
                              بصفحة المرضى حرفياً) أقدمُ من فترة الاستدعاء (clinic_settings.recall_interval_months، 6 افتراضاً).
                              قائمةُ الاستدعاء تستثني صاحبَ الموعد القادم — وهنا العكس: هو أمامك اليوم فافحصه.
   • 👁 مراقبةٌ مستحقة    — (v516 · 1ب) صفوفُ teeth_status بحالة condition (المراقبات) لمرضى اليوم، بلا أسنانٍ
                              قُلعت (مرآةُ prmFilterExtractedWatches): مستحقة = review_at ≤ اليوم (حمراء)، وإلا معلوماتية (رمادية).

   لا شيءَ يُحفظ بالقاعدة ولا يؤثّر على الحجز — عرضٌ محض.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentHuddle) return;

  var EPS = 0.5;

  /* ── M87: التحذيرات الطبية — النسخة الرابعة من المرآة (patients.html ↔ patient-profile.html
     ↔ appointments.html ↔ huddle-flags.js) محروسة بايت-بايت وسلوكياً بـscripts/check-mirrors.js. ── */
  var MEDICAL_FLAGS_DEFS = [
    { key:'diabetes',           label:'سكري' },
    { key:'hypertension',       label:'ضغط دم' },
    { key:'cardiac',            label:'أمراض قلب' },
    { key:'anticoagulants',     label:'مميعات دم' },
    { key:'pregnancy',          label:'حمل / إرضاع' },
    { key:'asthma',             label:'ربو' }
  ];
  var ALLERGY_FLAGS_DEFS = [
    { key:'penicillin_allergy', label:'بنسلين' },
    { key:'latex_allergy',      label:'لاتكس' },
    { key:'anesthetic_allergy', label:'مخدر موضعي' },
    { key:'nsaid_allergy',      label:'أسبرين / مسكنات' }
  ];
  function medFlagLabels(flags) {
    if (!Array.isArray(flags)) return [];
    return MEDICAL_FLAGS_DEFS.filter(function(d){ return flags.indexOf(d.key) >= 0; })
                             .map(function(d){ return d.label; });
  }
  function allergyFlagLabels(flags) {
    if (!Array.isArray(flags)) return [];
    return ALLERGY_FLAGS_DEFS.filter(function(d){ return flags.indexOf(d.key) >= 0; })
                             .map(function(d){ return d.label; });
  }
  function warnParts(rec) {
    var out = medFlagLabels(rec && rec.medical_flags);
    var t = (rec && rec.medical_flags_other) ? String(rec.medical_flags_other).trim() : '';
    if (t) out.push(t);
    return out;
  }
  function allergyParts(rec) {
    var out = allergyFlagLabels(rec && rec.medical_flags);
    var t = (rec && rec.allergies && rec.allergies !== 'لا يوجد') ? String(rec.allergies).trim() : '';
    if (t && out.indexOf(t) < 0) out.push(t);
    return out;
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ymdLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  /* عرضٌ مختصر لرقمٍ محسوبٍ سلفاً (لا حساب): الليرة تُختصر K/M فوق 10,000 · الدولار كاملٌ بسنتيه. */
  function fmtAmount(n, cur) {
    n = Number(n) || 0;
    if (cur === 'USD') return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' $';
    var s = (n >= 1000000) ? (n / 1000000).toFixed(1) + 'M' : (n >= 10000) ? Math.round(n / 1000) + 'K' : Math.round(n).toLocaleString('en-US');
    return s + ' ل.س';
  }
  function dmy(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? (parseInt(p[2], 10) + '/' + parseInt(p[1], 10) + '/' + p[0]) : String(ymd || ''); }
  function planOptOf(s) { return (s && s.plan_option >= 1 && s.plan_option <= 3) ? s.plan_option : null; }

  /* دالةٌ محضة.
     ctx = { today: 'YYYY-MM-DD', appts: مواعيدُ اليوم, patients: كلُّ مرضى العيادة (صفوفٌ كاملة),
             fin: خريطةُ computeDashFinancials (id → {bags:{SYP,USD}}) أو null,
             reliab: خريطةُ SyDentReliability (id → {finished}) أو {},
             planned: جلساتٌ مخطّطة (id, patient_id, appointment_id, plan_option) لمرضى اليوم وأسرهم,
             apptsById: مواعيدُ البنود المربوطة (id → صف),
             recallMonths: فترةُ الاستدعاء بالأشهر (6 افتراضاً), lastVisit: {pid → 'YYYY-MM-DD'} آخرُ جلسةٍ مكتملة,
             watches: صفوفُ teeth_status لمرضى اليوم (patient_id, tooth_num, surface, treatment_key, review_at, status),
             extractionKeys: مفاتيحُ علاجات القلع (extracted دائماً) }
     ⇒ { patient_id: { balance:[{cur,amount}], planned:n, altOnly:bool, warn:[], allergy:[], flags:[],
                       isNew, birthday, family:[{name, balance:[..], planned:n}] } }  لمرضى اليوم فقط. */
  function compute(ctx) {
    ctx = ctx || {};
    var today = ctx.today || ymdLocal(new Date());
    var fin = ctx.fin || null, reliab = ctx.reliab || {};
    var byId = {}, families = {};
    (ctx.patients || []).forEach(function (p) {
      if (!p || !p.id) return;
      byId[p.id] = p;
      if (p.family_id) (families[p.family_id] = families[p.family_id] || []).push(p);
    });
    var apptsById = ctx.apptsById || {};
    var dead = (typeof window !== 'undefined' && typeof window.SyDentApptDead === 'function') ? window.SyDentApptDead : null;
    /* بنودٌ مخطّطة حرّة لكل مريض (المعتمدة فقط) + هل عنده بدائلُ غيرُ معتمدة فقط */
    var freeByPt = {}, altByPt = {};
    (ctx.planned || []).forEach(function (s) {
      if (!s || !s.patient_id || (s.status || 'planned') !== 'planned') return;
      if (planOptOf(s) !== null) { altByPt[s.patient_id] = (altByPt[s.patient_id] || 0) + 1; return; }
      var free = !s.appointment_id;
      if (!free) {
        var a = apptsById[s.appointment_id];
        free = !!a && !!dead && dead(a, today);   /* موعدٌ مجهول = نعتبره حيّاً (لا إنذارَ كاذب) */
      }
      if (free) freeByPt[s.patient_id] = (freeByPt[s.patient_id] || 0) + 1;
    });
    function balanceOf(pid) {
      var b = fin && fin[pid]; if (!b || !b.bags) return [];
      var out = [];
      ['SYP', 'USD'].forEach(function (c) {
        var tb = (b.bags[c] && b.bags[c].trueBalance) || 0;
        if (tb > EPS) out.push({ cur: c, amount: tb });
      });
      return out;
    }
    /* 1ب: عتبةُ الاستدعاء + مراقباتُ الأسنان (بلا المقلوعة) */
    var months = parseInt(ctx.recallMonths, 10); if (!(months > 0)) months = 6;
    var tp = today.split('-').map(Number), thD = new Date(tp[0], tp[1] - 1, tp[2]); thD.setMonth(thD.getMonth() - months);
    var threshold = ymdLocal(thD);
    var exKeys = { extracted: 1 }; (ctx.extractionKeys || []).forEach(function (k) { if (k) exKeys[k] = 1; });
    var extracted = {}, watchByPt = {};
    (ctx.watches || []).forEach(function (r) {
      if (!r || !r.patient_id) return;
      if (r.treatment_key && exKeys[r.treatment_key]) (extracted[r.patient_id] = extracted[r.patient_id] || {})[String(r.tooth_num)] = 1;
    });
    (ctx.watches || []).forEach(function (r) {
      if (!r || !r.patient_id || r.status !== 'condition') return;
      if (extracted[r.patient_id] && extracted[r.patient_id][String(r.tooth_num)]) return;
      (watchByPt[r.patient_id] = watchByPt[r.patient_id] || []).push({ tooth_num: r.tooth_num, surface: r.surface || '', review_at: r.review_at ? String(r.review_at).slice(0, 10) : '',
        due: !!(r.review_at && String(r.review_at).slice(0, 10) <= today) });
    });
    var out = {}, seen = {};
    (ctx.appts || []).forEach(function (a) {
      var pid = a && a.patient_id; if (!pid || seen[pid]) return;
      seen[pid] = true;
      var p = byId[pid] || {};
      var e = { balance: balanceOf(pid), planned: freeByPt[pid] || 0, altOnly: !(freeByPt[pid] || 0) && !!altByPt[pid],
                warn: warnParts(p), allergy: allergyParts(p), flags: Array.isArray(p.flags) ? p.flags.slice() : [],
                isNew: false, birthday: false, family: [], recallDue: null, watches: [] };
      var lv = ctx.lastVisit && ctx.lastVisit[pid] ? String(ctx.lastVisit[pid]).slice(0, 10) : '';
      if (lv && lv <= threshold) e.recallDue = { lastVisit: lv, months: months };
      e.watches = (watchByPt[pid] || []).slice().sort(function (x, y) { return (y.due - x.due) || String(x.review_at || '9999').localeCompare(String(y.review_at || '9999')); });
      var fb = fin && fin[pid];
      var finishedAppts = reliab[pid] && reliab[pid].finished ? reliab[pid].finished : 0;
      e.isNew = !!(fin && fb && !(fb.sessCount > 0) && !finishedAppts);
      var dob = String(p.dob || '').slice(0, 10);
      e.birthday = /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob.slice(5) === today.slice(5);
      if (p.family_id && families[p.family_id]) {
        families[p.family_id].forEach(function (m) {
          if (!m || m.id === pid) return;
          var mb = balanceOf(m.id), mp = freeByPt[m.id] || 0;
          if (mb.length || mp) e.family.push({ id: m.id, name: String(m.name || ''), balance: mb, planned: mp });
        });
      }
      out[pid] = e;
    });
    return out;
  }

  function chip(tone, text, title, href) {
    var cls = 'pt-flag cbadge tone tone-' + tone + ' pt-flag-sm hud-chip';
    var t = title ? ' title="' + esc(title) + '"' : '';
    if (href) return '<a class="' + cls + '" href="' + esc(href) + '"' + t + '>' + text + '</a>';
    return '<span class="' + cls + '"' + t + '>' + text + '</span>';
  }
  function balanceText(list) { return list.map(function (x) { return ltr(fmtAmount(x.amount, x.cur)); }).join(' + '); }
  function plannedWord(n) { return n === 1 ? 'بند مخطّط' : (n === 2 ? 'بندان مخطّطان' : (n <= 10 ? 'بنود مخطّطة' : 'بنداً مخطّطاً')); }

  /* صفُّ رقائقٍ لمريضٍ واحد. defs = تعريفُ أعلام العيادة (SyDentFlags.load). '' حين لا شيء. */
  function chipsHtml(e, pid, defs) {
    if (!e) return '';
    var out = [];
    var prof = pid ? 'patient-profile.html?id=' + encodeURIComponent(pid) : '';
    if (e.balance.length)
      out.push(chip('red', '💰 متبقي ' + esc(balanceText(e.balance)), 'رصيدٌ مستحق على المريض — حصّله قبل أن يجلس على الكرسي', prof));
    if (e.planned)
      out.push(chip('orange', '🦷 غير مجدول ' + ltr(e.planned), ltr(String(e.planned)) + ' ' + plannedWord(e.planned) + ' من خطته المعتمدة بلا موعد — اعرض عليه حجزها اليوم', prof));
    else if (e.altOnly)
      out.push(chip('orange', '🦷 خيارات لم تُعتمد', 'خطةُ العلاج بخياراتٍ بديلة (أ/ب/ج) لم يُعتمد منها شيء بعد', prof));
    if (e.warn.length)
      out.push(chip('red', '⚠️ تحذير طبي', e.warn.join('، ')));
    if (e.allergy.length)
      out.push(chip('yellow', '⚠️ حساسية', e.allergy.join('، ')));
    if (e.flags.length && window.SyDentFlags && defs)
      out.push(window.SyDentFlags.chipsHtml(e.flags, defs, 'pt-flag-sm hud-chip'));
    if (e.isNew)
      out.push(chip('cyan', '🆕 مريض جديد', 'أول زيارة: لا جلساتَ مسجّلة ولا مواعيدَ منتهية بآخر 12 شهراً'));
    if (e.birthday)
      out.push(chip('purple', '🎂 عيد ميلاده اليوم', 'هنّئه — عيدُ ميلاد المريض اليوم'));
    if (e.recallDue)
      out.push(chip('lime', '🔁 فحص دوري مستحق', 'آخر جلسة مكتملة ' + ltr(dmy(e.recallDue.lastVisit)) + ' — أقدم من فترة الاستدعاء (' + ltr(String(e.recallDue.months)) + ' أشهر): اغتنم زيارته للفحص الدوري', prof));
    if (e.watches.length) {
      var dueN = e.watches.filter(function (w) { return w.due; }).length;
      var wt = e.watches.slice(0, 8).map(function (w) { return 'السن ' + ltr(String(w.tooth_num)) + (w.surface && w.surface !== 'WHOLE' ? '/' + w.surface : '') + (w.review_at ? ' (مراجعة ' + ltr(dmy(w.review_at)) + (w.due ? ' — مستحقة' : '') + ')' : ' (بلا موعد مراجعة)'); });
      if (e.watches.length > 8) wt.push('و' + ltr(String(e.watches.length - 8)) + ' غيرها');
      out.push(chip(dueN ? 'red' : 'gray', '👁 ' + (dueN ? 'مراقبة مستحقة ' + ltr(String(dueN)) : 'مراقبة ' + ltr(String(e.watches.length))), 'أسنان تحت المراقبة — أعد فحصها اليوم: ' + wt.join(' · '), prof));
    }
    if (e.family.length) {
      var parts = e.family.map(function (m) {
        var d = [];
        if (m.balance.length) d.push('رصيد ' + balanceText(m.balance));
        if (m.planned) d.push(ltr(String(m.planned)) + ' ' + plannedWord(m.planned) + ' بلا موعد');
        return m.name + ': ' + d.join(' · ');
      });
      out.push(chip('blue', '👪 الأسرة ' + ltr(e.family.length), 'أفرادُ أسرته: ' + parts.join(' | ')));
    }
    return out.join('');
  }

  /* الاستعلامان الوحيدان (بعد تحميل اللوحة): بنودٌ مخطّطة لمرضى اليوم وأسرهم، ثم مواعيدُ البنود المربوطة.
     كلُّ فشلٍ ⇒ {} للجزء المخطّط فقط (بقيةُ الأعلام من الصفوف المحمّلة). */
  async function load(uid, ctx) {
    ctx = ctx || {};
    var planned = [], apptsById = {}, lastVisit = {}, watches = [], extractionKeys = [];
    try {
      if (window.sb && uid) {
        var ids = {}, fam = {};
        (ctx.patients || []).forEach(function (p) { if (p && p.family_id) (fam[p.family_id] = fam[p.family_id] || []).push(p.id); });
        var byId = {}; (ctx.patients || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
        (ctx.appts || []).forEach(function (a) {
          if (!a || !a.patient_id) return;
          ids[a.patient_id] = true;
          var p = byId[a.patient_id];
          if (p && p.family_id) (fam[p.family_id] || []).forEach(function (x) { ids[x] = true; });
        });
        var list = Object.keys(ids);
        var todayIds = []; (ctx.appts || []).forEach(function (a) { if (a && a.patient_id && todayIds.indexOf(a.patient_id) < 0) todayIds.push(a.patient_id); });
        if (todayIds.length) {
          /* 1ب: آخرُ جلسةٍ مكتملة (تعريفُ lastVisitMap حرفياً) + صفوفُ الأسنان لمرضى اليوم فقط */
          var rl = await window.sb.from('ledger_sessions').select('patient_id, date, status, description')
            .eq('doctor_id', uid).eq('status', 'completed').in('patient_id', todayIds);
          if (rl.error) console.warn('SyDentHuddle.load lastVisit:', rl.error);
          else (rl.data || []).forEach(function (s) {
            if (!s.date || s.description === 'رسم عدم الحضور') return;
            var cur = lastVisit[s.patient_id];
            if (!cur || String(s.date) > String(cur)) lastVisit[s.patient_id] = String(s.date);
          });
          var rw = await window.sb.from('teeth_status').select('patient_id, tooth_num, surface, treatment_key, review_at, status')
            .eq('doctor_id', uid).in('patient_id', todayIds);
          if (rw.error) console.warn('SyDentHuddle.load watches:', rw.error);
          else {
            watches = rw.data || [];
            if (watches.some(function (r) { return r.status === 'condition'; })) {
              var rx = await window.sb.from('treatments').select('treatment_key').eq('doctor_id', uid).eq('target_part', 'extraction');
              if (rx.error) console.warn('SyDentHuddle.load extraction keys:', rx.error);
              else extractionKeys = (rx.data || []).map(function (t) { return t.treatment_key; }).filter(Boolean);
            }
          }
        }
        if (list.length) {
          var r = await window.sb.from('ledger_sessions').select('id, patient_id, appointment_id, plan_option, status')
            .eq('doctor_id', uid).eq('status', 'planned').in('patient_id', list);
          if (r.error) { console.warn('SyDentHuddle.load sessions:', r.error); }
          else {
            planned = r.data || [];
            var aids = planned.map(function (s) { return s.appointment_id; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
            if (aids.length) {
              var ra = await window.sb.from('appointments').select('id, date, status, is_planned, dismissed_at, arrived_at, seated_at')
                .eq('doctor_id', uid).in('id', aids);
              if (ra.error) console.warn('SyDentHuddle.load appts:', ra.error);
              else (ra.data || []).forEach(function (a) { apptsById[a.id] = a; });
            }
          }
        }
      }
    } catch (e) { console.warn('SyDentHuddle.load:', e); planned = []; apptsById = {}; }
    return compute({ today: ctx.today, appts: ctx.appts, patients: ctx.patients, fin: ctx.fin, reliab: ctx.reliab, planned: planned, apptsById: apptsById,
      recallMonths: ctx.recallMonths, lastVisit: lastVisit, watches: watches, extractionKeys: extractionKeys });
  }

  window.SyDentHuddle = { compute: compute, chipsHtml: chipsHtml, load: load, fmtAmount: fmtAmount, EPS: EPS,
    warnParts: warnParts, allergyParts: allergyParts };
})();
/* SYDENT_HUDDLE_END */
