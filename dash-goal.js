/* SYDENT_GOAL_START — الإنتاجُ المجدول مقابل الهدف (v518 · البند 3 من جولة اللوحة · M159)
   ─────────────────────────────────────────────────────────────
   (Dentrix Daily Huddle «scheduled production vs goal» · Dentrix Ascend «gross scheduled production»
    · Open Dental «Production Goal» · Dental Intelligence «Today»)
   العقد:
   • **المجدولُ اليوم** = مجموعُ بنود الخطة «المخطّطة» المربوطة بمواعيد اليوم غير الملغاة (دقيق)،
     وللموعد بلا بنودٍ مربوطة تقديرٌ من سعر علاجه بالكتالوج (treatment_id ثم مطابقةُ نوع الموعد
     باسم العلاج)، معلَّمٌ «تقديري» وبعدده. الموعدُ بلا أيٍّ منهما «بلا تسعير» ويُقال ذلك بصراحة —
     رقمٌ جزئيٌّ صادق أفضل من رقمٍ كاملٍ مضلِّل.
   • **الشهرُ حتى اليوم** = مجموعُ إنتاج كلِّ يومٍ من أول الشهر حتى اليوم كما يحسبه
     `SyDentDaySheet.compute` نفسُه (لا معادلةَ ثانية #684) — المثبتُ يقارن.
   • **الهدف** (M159): شهري لكل عملة بالإعدادات؛ اليوميُّ = الشهري ÷ عددِ أيام العمل بالشهر
     (`booking_work_days`، وإلا كلُّ الأيام)، ووتيرةُ الشهر = الشهري × (أيامُ العمل الماضية ÷ الكل).
   • كيسٌ لكل عملة (#481): لا جمعَ عابر. طبقةُ عملة العيادة تُعرض إن كان لها هدفٌ أو مجدولٌ أو إنتاج؛
     العملةُ الأخرى فقط إن كان لها هدفٌ أو مجدولٌ، أو إنتاجٌ مع تعدد العملات مفعَّلاً (جلسةٌ شاردة لا تفتح طبقة).
   • v533 (سؤال المالك «شلون المجدول بالدولار مسدد ومافي حدا دفع؟»): المجدولُ **قيمةٌ متوقَّعة لا مقبوض**
     (Dentrix Daily Huddle يفصل Scheduled Production عن Collections): الوسم «قيمة مواعيد اليوم (متوقّع)» ·
     عددُ المواعيد لكل عملة من كيسها لا الإجمالي · الشريطُ مقلَّمٌ حين يكون نصفُ القيمة أو أكثر تقديرياً ·
     سطرٌ ختامي «المقبوض اليوم» من دفعات اليوم (استعلامُ بطاقة «إيراد اليوم» نفسه) مع الإجمالي و«بلا تسعير» مرةً واحدة.
   • قراءةٌ محضة، صفرُ كتابة، نصوصٌ مُهرَّبة، ألوانُ theme.css.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentGoal) return;

  var CURS = ['SYP', 'USD'];
  function rc(r) { return (r && r.currency === 'USD') ? 'USD' : 'SYP'; }
  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function ymdLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function lblOf(c) { try { return window.SyDentCurrency.labelOf(c); } catch (e) { return c === 'USD' ? '$' : 'ل.س'; } }
  function fmtAmt(n, cur) {
    n = Number(n) || 0;
    var s = (cur === 'USD') ? r2(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-US');
    return ltr(s + ' ' + lblOf(cur));
  }
  function normName(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  var DEAD = { cancelled: 1, no_show: 1, broken: 1 };

  /* أيامُ العمل بالشهر: {total, passed} — passed يشمل اليوم. */
  function workDayStats(today, workDays) {
    var raw = Array.isArray(workDays) ? workDays : String(workDays == null ? '' : workDays).split(',');
    var nums = raw.map(function (x) { return parseInt(String(x).trim(), 10); }).filter(function (n) { return n >= 0 && n <= 6; });
    var set = null; if (nums.length) { set = {}; nums.forEach(function (n) { set[n] = 1; }); }
    var p = String(today).split('-').map(Number), y = p[0], m = p[1] - 1, d = p[2];
    var last = new Date(y, m + 1, 0).getDate(), total = 0, passed = 0;
    for (var i = 1; i <= last; i++) {
      var wd = new Date(y, m, i).getDay();
      if (set && !set[wd]) continue;
      total++; if (i <= d) passed++;
    }
    return { total: total, passed: passed };
  }

  /* دالةٌ محضة.
     ctx = { today, appts: مواعيدُ اليوم (id, status, treatment_id, type), planned: بنودٌ مخطّطة مربوطة (appointment_id, cost, currency, status),
             treatments: (id, name, price, currency), goals: {SYP, USD}, workDays, sheetData: بياناتُ SyDentDaySheet لأيام الشهر,
             baseCur: عملةُ العيادة ('SYP' افتراضاً), multi: تعددُ العملات مفعَّل }
     ⇒ { layers: [{cur, exact, estimated, scheduled, apptsTotal, apptsExact, apptsEstimated, apptsUnpriced, monthlyGoal, dailyGoal, mtd,
                   paceGoal, workDays:{total,passed}}] } */
  function compute(ctx) {
    ctx = ctx || {};
    var today = ctx.today || ymdLocal(new Date());
    var wds = workDayStats(today, ctx.workDays);
    var byId = {}, byName = {};
    (ctx.treatments || []).forEach(function (t) { if (!t) return; if (t.id) byId[t.id] = t; var k = normName(t.name); if (k && !byName[k]) byName[k] = t; });
    var linked = {};
    (ctx.planned || []).forEach(function (s) {
      if (!s || !s.appointment_id || (s.status || 'planned') !== 'planned') return;
      var c = Number(s.cost || 0); if (!(c > 0)) return;
      var b = linked[s.appointment_id] = linked[s.appointment_id] || { SYP: 0, USD: 0 };
      b[rc(s)] += c;
    });
    var bags = {};
    CURS.forEach(function (c) { bags[c] = { exact: 0, estimated: 0, apptsExact: 0, apptsEstimated: 0 }; });
    var apptsTotal = 0, apptsUnpriced = 0;
    (ctx.appts || []).forEach(function (a) {
      if (!a || !a.id || DEAD[a.status]) return;
      apptsTotal++;
      var lb = linked[a.id];
      if (lb && (lb.SYP > 0 || lb.USD > 0)) {
        CURS.forEach(function (c) { if (lb[c] > 0) { bags[c].exact += lb[c]; bags[c].apptsExact++; } });
        return;
      }
      var t = (a.treatment_id && byId[a.treatment_id]) || byName[normName(a.type)] || null;
      var price = t ? Number(t.price || 0) : 0;
      if (t && price > 0) { var c2 = rc(t); bags[c2].estimated += price; bags[c2].apptsEstimated++; }
      else apptsUnpriced++;
    });
    /* الشهرُ حتى اليوم عبر كشف اليوم يوماً بيوم */
    var mtd = { SYP: 0, USD: 0 };
    var ds = (typeof window !== 'undefined') ? window.SyDentDaySheet : null;
    if (ds && ctx.sheetData) {
      var p = today.split('-').map(Number);
      for (var i = 1; i <= p[2]; i++) {
        var day = ymdLocal(new Date(p[0], p[1] - 1, i));
        var sh = ds.compute(ctx.sheetData, day);
        CURS.forEach(function (c) { if (sh[c] && sh[c].production) mtd[c] += Number(sh[c].production.total || 0); });
      }
    }
    /* المقبوضُ اليوم — مجموعُ دفعات اليوم لكل عملة (نفسُ استعلام «إيراد اليوم») */
    var collected = null;
    if (ctx.payments) {
      collected = { SYP: 0, USD: 0 };
      ctx.payments.forEach(function (p) { if (p) collected[rc(p)] += Number(p.amount || 0); });
      CURS.forEach(function (c) { collected[c] = r2(collected[c]); });
    }
    var goals = ctx.goals || {};
    var base = (ctx.baseCur === 'USD') ? 'USD' : 'SYP';
    var layers = [];
    CURS.forEach(function (c) {
      var g = Number(goals[c]); if (!(g > 0)) g = null;
      var b = bags[c];
      var scheduled = r2(b.exact + b.estimated);
      var mtdCounts = mtd[c] > 0 && (c === base || !!ctx.multi);
      if (!g && !scheduled && !mtdCounts) return;
      layers.push({
        cur: c, exact: r2(b.exact), estimated: r2(b.estimated), scheduled: scheduled,
        apptsTotal: apptsTotal, apptsExact: b.apptsExact, apptsEstimated: b.apptsEstimated, apptsUnpriced: apptsUnpriced,
        monthlyGoal: g, dailyGoal: g && wds.total ? r2(g / wds.total) : null,
        mtd: r2(mtd[c]), paceGoal: g && wds.total ? r2(g * wds.passed / wds.total) : null,
        workDays: wds
      });
    });
    return { today: today, layers: layers, apptsTotal: apptsTotal, apptsUnpriced: apptsUnpriced, collected: collected };
  }

  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : null; }
  function bar(value, goal, tone, est) {
    var p = pct(value, goal); if (p == null) return '';
    var w = Math.max(0, Math.min(100, p));
    return '<div class="gl-bar"' + (est ? ' title="قيمة متوقّعة — تقديرية من أسعار العلاجات، ليست مقبوضاً"' : '') + '><div class="gl-fill gl-' + tone + (est ? ' gl-est' : '') + '" style="width:' + w + '%"></div></div>';
  }
  /* عددُ المواعيد بالعربية: موعد واحد · موعدان · 3–10 مواعيد · 11+ موعداً */
  function apptWord(n) {
    if (n === 1) return 'موعد واحد';
    if (n === 2) return 'موعدان';
    return ltr(String(n)) + (n >= 3 && n <= 10 ? ' مواعيد' : ' موعداً');
  }
  function toneOf(p) { return p == null ? 'gray' : (p >= 100 ? 'green' : (p >= 70 ? 'orange' : 'red')); }

  /* HTML جسم البطاقة. opts.owner ⇒ رابطُ الإعدادات حين لا هدف. */
  function render(res, opts) {
    opts = opts || {};
    if (!res || !res.layers.length) {
      return '<div class="gl-empty">لا مواعيدَ مسعَّرة اليوم ولا إنتاجَ بالشهر بعد' + (opts.owner ? ' — <a class="card-action" href="settings.html#productionGoalSection">حدّد هدفاً شهرياً ←</a>' : '') + '</div>';
    }
    var h = '';
    res.layers.forEach(function (L) {
      var multi = res.layers.length > 1;
      var curTag = multi ? ' <span class="gl-cur">' + esc(lblOf(L.cur)) + '</span>' : '';
      /* اليوم — قيمةٌ متوقَّعة: عددُ المواعيد من كيس هذه العملة وحده */
      var pd = L.dailyGoal ? pct(L.scheduled, L.dailyGoal) : null;
      var nCur = L.apptsExact + L.apptsEstimated;
      var est = L.scheduled > 0 && L.estimated * 2 >= L.scheduled;
      var how = '';
      if (L.apptsExact && L.apptsEstimated) how = ' (' + ltr(String(L.apptsExact)) + ' بخطة · ' + ltr(String(L.apptsEstimated)) + ' تقديري من سعر العلاج)';
      else if (L.apptsEstimated) how = ' · تقديري من سعر العلاج';
      else if (L.apptsExact) how = ' · من بنود الخطة';
      h += '<div class="gl-block">'
        + '<div class="gl-row"><span class="gl-k">📅 قيمة مواعيد اليوم (متوقّع)' + curTag + '</span><span class="gl-v">' + fmtAmt(L.scheduled, L.cur)
        + (L.dailyGoal ? ' <span class="gl-goal">/ ' + fmtAmt(L.dailyGoal, L.cur) + '</span>' : '') + '</span></div>'
        + (L.dailyGoal ? bar(L.scheduled, L.dailyGoal, toneOf(pd), est) : '')
        + '<div class="gl-sub">' + (pd != null ? '<b class="gl-pct gl-t-' + toneOf(pd) + '">' + ltr(pd + '%') + ' من هدف اليوم</b> · ' : '')
        + (nCur ? apptWord(nCur) + how : 'لا مواعيد مسعَّرة بهذه العملة') + '</div>'
        + '</div>';
      /* الشهر */
      var pm = L.monthlyGoal ? pct(L.mtd, L.monthlyGoal) : null;
      var onPace = (L.paceGoal != null) ? (L.mtd >= L.paceGoal) : null;
      h += '<div class="gl-block">'
        + '<div class="gl-row"><span class="gl-k">📈 الشهر حتى اليوم' + curTag + '</span><span class="gl-v">' + fmtAmt(L.mtd, L.cur)
        + (L.monthlyGoal ? ' <span class="gl-goal">/ ' + fmtAmt(L.monthlyGoal, L.cur) + '</span>' : '') + '</span></div>'
        + (L.monthlyGoal ? bar(L.mtd, L.monthlyGoal, onPace ? 'green' : (pm != null && pm >= 100 ? 'green' : 'orange')) : '')
        + '<div class="gl-sub">' + (pm != null ? '<b class="gl-pct gl-t-' + (onPace ? 'green' : 'orange') + '">' + ltr(pm + '%') + ' من هدف الشهر</b> · ' : '')
        + (L.paceGoal != null ? (onPace ? '✅ على الوتيرة' : '⚠️ دون الوتيرة') + ' (المتوقّع حتى اليوم ' + fmtAmt(L.paceGoal, L.cur) + ')' : 'يوم عمل ' + ltr(L.workDays.passed + '/' + L.workDays.total))
        + '</div>'
        + '</div>';
      if (!L.monthlyGoal && opts.owner) h += '<a class="card-action gl-link" href="settings.html#productionGoalSection">حدّد هدفاً شهرياً' + (multi ? ' ' + esc(lblOf(L.cur)) : '') + ' ←</a>';
    });
    /* الختام: المقبوضُ اليوم (فعليّ) بجانب المتوقَّع — ولكل عملةٍ معروضة أو مقبوضة */
    if (res.collected) {
      var curs = CURS.filter(function (c) { return res.layers.some(function (L) { return L.cur === c; }) || res.collected[c] > 0; });
      var foot = [];
      if (res.apptsTotal != null) foot.push(apptWord(res.apptsTotal) + ' اليوم' + (res.apptsUnpriced ? ' · ' + ltr(String(res.apptsUnpriced)) + ' بلا تسعير' : ''));
      h += '<div class="gl-foot"><span class="gl-k">💵 المقبوض اليوم</span><span class="gl-v">'
        + curs.map(function (c) { return fmtAmt(res.collected[c], c); }).join(' · ') + '</span></div>'
        + (foot.length ? '<div class="gl-sub gl-foot-sub">' + foot.join('') + '</div>' : '');
    }
    return h;
  }

  /* التحميل: بنودُ مواعيد اليوم · كتالوجُ العلاجات · جلساتُ الشهر المكتملة (بصيغة SyDentDaySheet). */
  async function load(sb, uid, ctx) {
    ctx = ctx || {};
    var today = ctx.today || ymdLocal(new Date());
    var planned = [], treatments = [], sheetData = null, payments = null;
    try {
      var ids = (ctx.appts || []).filter(function (a) { return a && a.id && !DEAD[a.status]; }).map(function (a) { return a.id; });
      var qs = [];
      qs.push(ids.length ? sb.from('ledger_sessions').select('appointment_id, cost, currency, status').eq('doctor_id', uid).eq('status', 'planned').in('appointment_id', ids) : Promise.resolve({ data: [], error: null }));
      qs.push(sb.from('treatments').select('id, name, price, currency').eq('doctor_id', uid));
      var m0 = today.slice(0, 8) + '01';
      qs.push(window.SyDentFetchAll(function(){ return sb.from('ledger_sessions').select('id,cost,status,currency,date').eq('doctor_id', uid).eq('status', 'completed').gte('date', m0).lte('date', today); }));
      qs.push(sb.from('ledger_payments').select('amount,date,currency').eq('doctor_id', uid).eq('date', today));   /* v533: استعلامُ «إيراد اليوم» حرفياً */
      var rs = await Promise.all(qs);
      if (rs[0].error) console.warn('SyDentGoal planned:', rs[0].error); else planned = rs[0].data || [];
      if (rs[1].error) console.warn('SyDentGoal treatments:', rs[1].error); else treatments = rs[1].data || [];
      if (rs[2].error) console.warn('SyDentGoal month sessions:', rs[2].error); else sheetData = { sessions: rs[2].data || [] };
      if (rs[3] && !rs[3].error) payments = rs[3].data || []; else if (rs[3]) console.warn('SyDentGoal payments:', rs[3].error);
    } catch (e) { console.warn('SyDentGoal.load:', e); }
    return compute({ today: today, appts: ctx.appts, planned: planned, treatments: treatments, goals: ctx.goals, workDays: ctx.workDays, sheetData: sheetData, payments: payments, baseCur: ctx.baseCur, multi: ctx.multi });
  }

  window.SyDentGoal = { compute: compute, render: render, load: load, workDayStats: workDayStats, fmtAmt: fmtAmt };
})();
/* SYDENT_GOAL_END */
