/* SYDENT_YESTERDAY_START — ملخّصُ أمس على لوحة التحكم (v517 · البند 2 من جولة اللوحة)
   ─────────────────────────────────────────────────────────────
   (Dentrix Daily Huddle «Yesterday snapshot» · Dental Intelligence «Yesterday» tab)
   العقد:
   • **صفر معادلةٍ مالية جديدة** (#684): الأرقامُ من `SyDentDaySheet.load/compute` نفسِهما اللذين
     يرسمان كشفَ اليوم بالمحاسبة — بتبديل اليوم فقط. المثبتُ يقارن رقماً برقم.
   • **اليومُ المعروض = آخرُ يوم عمل** قبل اليوم بحسب `clinic_settings.booking_work_days` (JS getDay
     0=الأحد): إن كان أمسُ يومَ عمل فهو «أمس»، وإلا يُرجَع حتى 7 أيام (عيادةٌ تغلق الجمعة ترى الخميس
     صباحَ السبت). إعدادٌ غائب ⇒ أمس.
   • **المواعيد**: منتهٍ = dismissed_at أو completed (كما في _dashDailyFacts) · غياب = no_show والقديم broken
     (كما في قائمة «غابوا» v504) · ملغى = cancelled؛ الباقي «لم تُختم».
   • **المرضى الجدد** = من أُنشئ ملفُّهم ذلك اليومَ بتوقيت المتصفح المحلي (لا UTC) — من قائمة المرضى
     المحمّلة أصلاً، صفرُ استعلام.
   • **إقفالُ الصندوق** (M158): يُنبَّه فقط حين دخل مالٌ أو خرج نقدٌ بعملةٍ ولم تُقفَل — يومٌ بلا حركة
     لا يحتاج إقفالاً. المُقفَل يُعرض بفرقه. الرابطُ يفتح كشفَ ذلك اليوم بالمحاسبة (`?ds=`).
   • قراءةٌ محضة، صفرُ كتابة، كلُّ نصٍّ حرّ مُهرَّب، والألوانُ نغماتُ theme.css.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentYesterday) return;

  var CURS = ['SYP', 'USD'];
  var WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ymdLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dmy(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : String(ymd || ''); }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function lblOf(c) { try { return window.SyDentCurrency.labelOf(c); } catch (e) { return c === 'USD' ? '$' : 'ل.س'; } }
  function fmtAmt(n, cur) {
    n = Number(n) || 0;
    var s = (cur === 'USD') ? (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-US');
    return ltr(s + ' ' + lblOf(cur));
  }

  /* آخرُ يوم عمل قبل today. workDays: "0,1,2,3,4,6" (getDay) أو مصفوفة؛ غيابُه ⇒ أمس. */
  function lastWorkDay(today, workDays) {
    var set = null;
    var raw = Array.isArray(workDays) ? workDays : String(workDays == null ? '' : workDays).split(',');
    var nums = raw.map(function (x) { return parseInt(String(x).trim(), 10); }).filter(function (n) { return n >= 0 && n <= 6; });
    if (nums.length) { set = {}; nums.forEach(function (n) { set[n] = 1; }); }
    var d = parseYmd(today);
    for (var k = 1; k <= 7; k++) {
      var c = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k);
      if (!set || set[c.getDay()]) {
        var ymd = ymdLocal(c);
        return { day: ymd, isYesterday: k === 1, label: (k === 1 ? 'أمس — ' : 'آخر يوم عمل — ') + WD[c.getDay()] + ' ' + dmy(ymd) };
      }
    }
    var y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    return { day: ymdLocal(y), isYesterday: true, label: 'أمس — ' + WD[y.getDay()] + ' ' + dmy(ymdLocal(y)) };
  }

  /* دالةٌ محضة. sheet = ناتجُ SyDentDaySheet.compute(data, day) (طبقةٌ لكل عملة).
     appts = مواعيدُ ذلك اليوم (status, dismissed_at, patient_name). patients = كلُّ المرضى (created_at). */
  function compute(ctx) {
    ctx = ctx || {};
    var day = ctx.day, sheet = ctx.sheet || {};
    var layers = [];
    CURS.forEach(function (cur) {
      var L = sheet[cur]; if (!L || !L.active) return;
      var moved = !!((L.collected && L.collected.count) || (L.net && L.net.cashOut > 0));
      layers.push({
        cur: cur,
        production: (L.production && L.production.total) || 0, sessions: (L.production && L.production.count) || 0,
        collected: (L.collected && L.collected.total) || 0, payments: (L.collected && L.collected.count) || 0,
        byMethod: ((L.collected && L.collected.byMethod) || []).map(function (m) { return { key: m.key, label: m.label, total: m.total }; }),
        outflow: (L.outflow && L.outflow.total) || 0,
        cash: (L.net && L.net.cash) || 0,
        moved: moved,
        closing: L.closing ? { variance: L.closing.variance, counted: L.closing.counted, expected: L.closing.expected } : null,
        needsClosing: moved && !L.closing
      });
    });
    var ap = { total: 0, done: 0, missed: 0, cancelled: 0, open: 0, missedNames: [] };
    (ctx.appts || []).forEach(function (a) {
      if (!a) return;
      var st = a.status;
      ap.total++;
      if (st === 'cancelled') ap.cancelled++;
      else if (st === 'no_show' || st === 'broken') { ap.missed++; if (a.patient_name) ap.missedNames.push(String(a.patient_name)); }
      else if (a.dismissed_at || st === 'completed') ap.done++;
      else ap.open++;
    });
    var newPts = 0;
    (ctx.patients || []).forEach(function (p) {
      if (!p || !p.created_at) return;
      var d = new Date(p.created_at); if (isNaN(d.getTime())) return;
      if (ymdLocal(d) === day) newPts++;
    });
    return { day: day, label: ctx.label || '', layers: layers, appts: ap, newPatients: newPts,
             empty: !layers.length && !ap.total && !newPts };
  }

  function chip(tone, text, title, href) {
    var cls = 'pt-flag cbadge tone tone-' + tone + ' pt-flag-sm yd-chip';
    var t = title ? ' title="' + esc(title) + '"' : '';
    return href ? '<a class="' + cls + '" href="' + esc(href) + '"' + t + '>' + text + '</a>' : '<span class="' + cls + '"' + t + '>' + text + '</span>';
  }
  function rowHtml(k, v, title) { return '<div class="yd-row"' + (title ? ' title="' + esc(title) + '"' : '') + '><span class="yd-k">' + k + '</span><span class="yd-v">' + v + '</span></div>'; }

  /* HTML جسمِ البطاقة. opts.owner ⇒ روابطُ المحاسبة (الصفحةُ محجوبة عن غير المالك). */
  function render(sum, opts) {
    opts = opts || {};
    if (!sum) return '';
    var dsHref = 'accounting.html?ds=' + encodeURIComponent(sum.day);
    if (sum.empty) return '<div class="yd-empty">لا نشاط مسجّل — لا جلسات ولا دفعات ولا مواعيد</div>';
    var h = '';
    sum.layers.forEach(function (L) {
      var curTag = (sum.layers.length > 1) ? ' <span class="yd-cur">' + esc(lblOf(L.cur)) + '</span>' : '';
      h += rowHtml('💎 الإنتاج' + curTag, fmtAmt(L.production, L.cur), ltr(String(L.sessions)) + ' جلسة منجزة');
      h += rowHtml('💰 المقبوضات' + curTag, fmtAmt(L.collected, L.cur), ltr(String(L.payments)) + ' دفعة');
      if (L.byMethod.length) {
        h += '<div class="yd-methods">' + L.byMethod.map(function (m) { return chip('gray', esc(m.label) + ' ' + fmtAmt(m.total, L.cur)); }).join('') + '</div>';
      }
      if (L.outflow > 0) h += rowHtml('📤 الخارج' + curTag, fmtAmt(L.outflow, L.cur), 'مصروفات · مخابر · رواتب · استردادات');
      if (L.needsClosing) {
        h += '<div class="yd-alert">' + chip('red', '⚠️ الصندوق ' + (sum.label.indexOf('أمس') === 0 ? 'أمس' : 'ذلك اليوم') + ' غير مُقفَل' + (opts.owner ? ' — أقفله' : ''), 'دخل مالٌ ' + (sum.layers.length > 1 ? esc(lblOf(L.cur)) + ' ' : '') + 'ولم يُسجَّل إقفالُ الدرج (المتوقّع نقداً ' + fmtAmt(L.cash, L.cur) + ')', opts.owner ? dsHref : null) + '</div>';
      } else if (L.closing) {
        var v = Number(L.closing.variance) || 0;
        h += '<div class="yd-alert">' + chip(Math.abs(v) < 0.5 ? 'green' : 'orange', (Math.abs(v) < 0.5 ? '✅ الصندوق مُقفَل — مطابق' : '⚠️ الصندوق مُقفَل — فرق ' + fmtAmt(v, L.cur)), 'المعدود ' + fmtAmt(L.closing.counted, L.cur) + ' · المتوقّع ' + fmtAmt(L.closing.expected, L.cur), opts.owner ? dsHref : null) + '</div>';
      }
    });
    if (!sum.layers.length) h += rowHtml('💎 الإنتاج', '—', 'لا جلسات منجزة ولا دفعات');
    var ap = sum.appts;
    if (ap.total) {
      var parts = [];
      if (ap.done) parts.push('أُنجز ' + ltr(String(ap.done)));
      if (ap.missed) parts.push(chip('red', '🚫 غاب ' + ltr(String(ap.missed)), ap.missedNames.join('، ')));
      if (ap.cancelled) parts.push('أُلغي ' + ltr(String(ap.cancelled)));
      if (ap.open) parts.push(chip('yellow', 'لم تُختم ' + ltr(String(ap.open)), 'مواعيدُ لم يُسجَّل لها حضورٌ ولا خروج ولا غياب'));
      h += rowHtml('📅 المواعيد', ltr(String(ap.total)) + (parts.length ? ' · ' + parts.join(' · ') : ''));
    } else {
      h += rowHtml('📅 المواعيد', 'لا مواعيد');
    }
    h += rowHtml('🆕 مرضى جدد', ltr(String(sum.newPatients)));
    if (opts.owner) h += '<a class="card-action yd-link" href="' + esc(dsHref) + '">كشف ذلك اليوم كاملاً ←</a>';
    return h;
  }

  /* استعلامان فقط فوق كشف اليوم: SyDentDaySheet.load (7 جداول بيومٍ واحد) + مواعيدُ ذلك اليوم. */
  async function load(sb, uid, ctx) {
    ctx = ctx || {};
    var wd = lastWorkDay(ctx.today || ymdLocal(new Date()), ctx.workDays);
    var sheet = {}, appts = [];
    try {
      if (window.SyDentDaySheet) {
        var r = await window.SyDentDaySheet.load(sb, uid, wd.day);
        sheet = window.SyDentDaySheet.compute(r.data, wd.day);
        if (!r.ok) { console.warn('SyDentYesterday: daysheet load incomplete'); sheet = {}; }
      }
      var ra = await sb.from('appointments').select('id, patient_name, status, dismissed_at').eq('doctor_id', uid).eq('date', wd.day);
      if (ra.error) console.warn('SyDentYesterday appts:', ra.error); else appts = ra.data || [];
    } catch (e) { console.warn('SyDentYesterday.load:', e); }
    return compute({ day: wd.day, label: wd.label, sheet: sheet, appts: appts, patients: ctx.patients });
  }

  window.SyDentYesterday = { lastWorkDay: lastWorkDay, compute: compute, render: render, load: load, fmtAmt: fmtAmt };
})();
/* SYDENT_YESTERDAY_END */
