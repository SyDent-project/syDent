/* SYDENT_DAYSHEET_START — كشفُ اليوم (Day Sheet) — v508
   ─────────────────────────────────────────────────────────────
   قسمٌ قرائيٌّ بصفحة المحاسبة يجيب بآخر النهار «شو دخل الصندوق اليوم، بأيِّ طريقة،
   وشو خرج، وقدّيش لازم يكون بالدرج نقداً؟» (Dentrix Ascend «Day Sheet» + «Deposit Slip
   by payment type» · Open Dental «Daily Payments» · TOPS «close the day»).

   العقد (لا يُخالَف):
   • **صفر كتابة**، خارج كلِّ المعادلات: لا يمسّ FIFO ولا computeFinancials ولا صافي الربح.
   • **يومٌ واحد** يختاره المستخدم (افتراضياً اليوم)، مستقلٌّ عن فترة التقرير.
   • **إنتاجُ اليوم** = مجموعُ الجلسات المنجزة بتاريخ اليوم — نفسُ تعريف صفحة المحاسبة
     (`loadSessions`: status=completed · date) حرفياً؛ المثبتُ يقارن.
   • **المقبوضات** = دفعاتُ المرضى الخام بتاريخ اليوم (ما دخل الصندوق فعلاً — لا الإيرادُ
     المكتسب؛ المقدَّمُ منها يبقى مقبوضاً)، مجمَّعةً حسب الطريقة عبر `SyDentPayMethods.norm`.
   • **الخارج** = المصروفات (date) · دفعاتُ المخابر (pay_date) · الرواتبُ ودفعاتُ الأطباء
     (paid_at بيومه المحلي — مرآةُ `inLocalRange`) · الاستردادات (account_adjustments.date).
   • **كيسٌ لكلِّ عملة** (#481): لا جمعَ عابر.
   • **الدرجُ نقداً**: الداخلُ بطريقة «نقداً» − الخارجُ بطريقة «نقداً» **من الدرج**؛ ما لا طريقةَ له
     (الاستردادات · دفعاتُ المخابر) يُعدّ نقداً **صراحةً** ويُقال ذلك بالكشف.
   • **مصدرُ النقد (M165 — v548):** المدفوعُ نقداً «من خارج الدرج» (خزنة · جيب الطبيب —
     `cash_source='outside'`) يبقى خارجاً بالكشف والحسابات لكنه **لا يُخصم من الدرج**، ويُعرض
     سطراً مستقلاً؛ الفارغُ = من الدرج (الصفوفُ القائمة كما كانت). المتوقَّعُ السالب يُنبَّه عليه ويُؤكَّد.
   • **إقفالُ الصندوق (M158 — الكتابةُ الوحيدة بالوحدة):** صفٌّ واحد لكلِّ (مالك · يوم · عملة) بـ
     `day_closings`: المتوقّع = صافي الدرج نقداً لحظةَ الإقفال (لقطةٌ للمساءلة)، المعدود، الفرقُ مولَّد
     بالقاعدة. upsert بنطاق المالك، محروسٌ بوضع القراءة، ولا يمسّ أيَّ رقمٍ بالكشف نفسه.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentDaySheet) return;

  var CURS = ['SYP', 'USD'];
  function rc(r) { return (r && r.currency === 'USD') ? 'USD' : 'SYP'; }
  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ymdLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayYmd() { return ymdLocal(new Date()); }
  function shiftYmd(ymd, k) {
    var p = String(ymd).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + k);
    return ymdLocal(d);
  }
  /* مرآةُ inLocalRange (accounting.html): يومُ الطابع الزمني بالتوقيت المحلي */
  function localDayOf(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return ymdLocal(d);
  }
  /* مرآةُ widenStartUtc/widenEndUtc: نافذةٌ موسَّعة ±يوم ثم قصٌّ محلي */
  function widenStart(ymd) { var d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString(); }
  function widenEnd(ymd)   { var d = new Date(ymd + 'T23:59:59.999Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); }
  function PM() { return window.SyDentPayMethods; }
  function mKey(raw) { var pm = PM(); return pm ? pm.norm(raw) : 'other'; }
  function mLabel(key) { var pm = PM(); return pm ? pm.label(key) : String(key); }
  function mIsCash(key) { return key === 'cash'; }
  /* M165: هل خرج هذا النقدُ من خارج الدرج؟ (الفارغُ/المجهول ⇒ من الدرج — سلوكُ ما قبل M165) */
  function srcOutside(raw) { var pm = PM(); return pm && pm.normSource ? pm.normSource(raw) === 'outside' : String(raw || '') === 'outside'; }
  var OUT_KEY = 'cash_outside', OUT_LABEL = 'نقداً — من خارج الدرج';

  /* ── دالةٌ محضة: صفوفُ اليوم ⇒ { SYP, USD } ──
     كلُّ طبقة: { active, production:{count,total}, collected:{count,total,byMethod[]},
                 adjustments:{reductions:{count,total}, refunds:{count,total}},
                 outflow:{expenses:{count,total,byMethod[]}, labs:{count,total}, payouts:{count,total,byMethod[]}, total},
                 net:{ all, cashIn, cashOut, cash } } */
  function compute(data, day) {
    var out = {};
    var closings = {};
    (data.closings || []).forEach(function (c) { if (c && String(c.day || '').slice(0, 10) === day) closings[rc(c)] = c; });
    CURS.forEach(function (cur) {
      var by = function () { return {}; };
      var prod = { count: 0, total: 0 };
      var col = { count: 0, total: 0, byMethod: by() };
      var red = { count: 0, total: 0 }, ref = { count: 0, total: 0 };
      var exp = { count: 0, total: 0, byMethod: by() };
      var lab = { count: 0, total: 0, outside: 0 };
      var pay = { count: 0, total: 0, byMethod: by() };
      var cashIn = 0, cashOut = 0, cashOutside = 0;
      var add = function (bucket, key, amt) { bucket[key] = (bucket[key] || 0) + amt; };

      (data.sessions || []).forEach(function (s) {
        if (rc(s) !== cur) return;
        if ((s.status || 'completed') !== 'completed') return;
        if (String(s.date || '').slice(0, 10) !== day) return;
        prod.count++; prod.total += Number(s.cost || 0);
      });
      (data.payments || []).forEach(function (p) {
        if (rc(p) !== cur || String(p.date || '').slice(0, 10) !== day) return;
        var a = Number(p.amount || 0); if (!(a > 0)) return;
        var k = mKey(p.method);
        col.count++; col.total += a; add(col.byMethod, k, a);
        if (mIsCash(k)) cashIn += a;
      });
      (data.adjustments || []).forEach(function (x) {
        if (rc(x) !== cur || String(x.date || '').slice(0, 10) !== day) return;
        var a = Number(x.amount || 0); if (!(a > 0)) return;
        if (x.kind === 'refund') { ref.count++; ref.total += a; cashOut += a; }          /* بلا طريقة ⇒ نقداً صراحةً */
        else if (x.kind === 'discount' || x.kind === 'write_off') { red.count++; red.total += a; }
      });
      (data.expenses || []).forEach(function (e) {
        if (rc(e) !== cur || String(e.date || '').slice(0, 10) !== day) return;
        var a = Number(e.amount || 0); if (!(a > 0)) return;
        var k = mKey(e.payment_method);
        if (mIsCash(k) && srcOutside(e.cash_source)) { exp.count++; exp.total += a; add(exp.byMethod, OUT_KEY, a); cashOutside += a; return; }
        exp.count++; exp.total += a; add(exp.byMethod, k, a);
        if (mIsCash(k)) cashOut += a;
      });
      (data.labPayments || []).forEach(function (l) {
        if (rc(l) !== cur || String(l.pay_date || '').slice(0, 10) !== day) return;
        var a = Number(l.amount || 0); if (!(a > 0)) return;
        lab.count++; lab.total += a;                                                      /* بلا طريقة ⇒ نقداً صراحةً */
        if (srcOutside(l.cash_source)) { lab.outside += a; cashOutside += a; } else cashOut += a;
      });
      (data.payouts || []).forEach(function (po) {
        if (rc(po) !== cur || localDayOf(po.paid_at) !== day) return;
        var a = Number(po.amount || 0); if (!(a > 0)) return;
        var k = mKey(po.payment_method);
        if (mIsCash(k) && srcOutside(po.cash_source)) { pay.count++; pay.total += a; add(pay.byMethod, OUT_KEY, a); cashOutside += a; return; }
        pay.count++; pay.total += a; add(pay.byMethod, k, a);
        if (mIsCash(k)) cashOut += a;
      });

      var toList = function (bucket) {
        return Object.keys(bucket).map(function (k) { return { key: k, label: k === OUT_KEY ? OUT_LABEL : mLabel(k), total: r2(bucket[k]) }; })
          .sort(function (a, b) { return b.total - a.total || String(a.label).localeCompare(String(b.label), 'ar'); });
      };
      var outTotal = exp.total + lab.total + pay.total + ref.total;
      var layer = {
        production: { count: prod.count, total: r2(prod.total) },
        collected: { count: col.count, total: r2(col.total), byMethod: toList(col.byMethod) },
        adjustments: { reductions: { count: red.count, total: r2(red.total) }, refunds: { count: ref.count, total: r2(ref.total) } },
        outflow: { expenses: { count: exp.count, total: r2(exp.total), byMethod: toList(exp.byMethod) },
                   labs: { count: lab.count, total: r2(lab.total), outside: r2(lab.outside) },
                   payouts: { count: pay.count, total: r2(pay.total), byMethod: toList(pay.byMethod) },
                   total: r2(outTotal) },
        net: { all: r2(col.total - outTotal), cashIn: r2(cashIn), cashOut: r2(cashOut), cash: r2(cashIn - cashOut), cashOutside: r2(cashOutside) }
      };
      var cl = closings[cur] || null;
      layer.closing = cl ? { id: cl.id, expected: r2(cl.expected), counted: r2(cl.counted), variance: r2(Number(cl.counted || 0) - Number(cl.expected || 0)), note: cl.note || '', closed_at: cl.closed_at || null } : null;
      layer.active = !!(prod.count || col.count || red.count || ref.count || exp.count || lab.count || pay.count || cl);
      out[cur] = layer;
    });
    return out;
  }

  /* ── التحميل: يومٌ واحد، كلُّ استعلامٍ بنطاق المالك؛ الجداولُ الغائبة (هجرةٌ لم تُطبَّق)
     تُتسامَح مصفوفةً فارغة، وأيُّ خطأٍ آخر ⇒ ok:false (كشفٌ ناقص أسوأ من لا كشف). ── */
  function migrationMissing(err) {
    var msg = ((err && err.message) || '') + ' ' + ((err && err.code) || '');
    return /relation .* does not exist|42P01|PGRST205|42703/i.test(msg);
  }
  async function load(sb, uid, day) {
    var data = { sessions: [], payments: [], adjustments: [], expenses: [], labPayments: [], payouts: [], closings: [] };
    var lo = widenStart(day), hi = widenEnd(day);
    try {
      var rs = await Promise.all([
        sb.from('ledger_sessions').select('id,cost,status,currency,date').eq('doctor_id', uid).eq('status', 'completed').eq('date', day),
        sb.from('ledger_payments').select('id,amount,method,currency,date').eq('doctor_id', uid).eq('date', day),
        sb.from('account_adjustments').select('id,kind,amount,currency,date').eq('doctor_id', uid).eq('date', day),
        sb.from('expenses').select('id,amount,payment_method,cash_source,currency,date').eq('owner_id', uid).eq('date', day),
        sb.from('lab_payments').select('id,amount,cash_source,currency,pay_date').eq('doctor_id', uid).eq('pay_date', day),
        sb.from('provider_payouts').select('id,amount,payment_method,cash_source,currency,paid_at').eq('owner_id', uid).gte('paid_at', lo).lte('paid_at', hi),
        sb.from('day_closings').select('id,day,currency,expected,counted,note,closed_at').eq('owner_id', uid).eq('day', day)
      ]);
      var keys = ['sessions', 'payments', 'adjustments', 'expenses', 'labPayments', 'payouts', 'closings'];
      var core = { sessions: true, payments: true };
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        if (r.error) {
          if (core[keys[i]] || !migrationMissing(r.error)) { console.warn('daysheet load failed: ' + keys[i], r.error); return { ok: false, data: data }; }
          continue;
        }
        data[keys[i]] = r.data || [];
      }
      data.payouts = data.payouts.filter(function (po) { return localDayOf(po.paid_at) === day; });   /* قصٌّ محليٌّ صارم */
      return { ok: true, data: data };
    } catch (e) { console.warn('daysheet load exception', e); return { ok: false, data: data }; }
  }

  /* ── العرض ── fmt(n, cur) دالةُ الصفحة بعملة الطبقة */
  function fmtDay(ymd) {
    var p = String(ymd).split('-');
    return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : ymd;
  }
  function curName(cur) { return cur === 'USD' ? 'بالدولار' : 'بالليرة'; }
  function row(label, amt, cur, fmt, cls, sub) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + (sub ? ' <span class="ds-sub">' + sub + '</span>' : '') + '</td><td class="num">' + fmt(amt, cur) + '</td></tr>';
  }
  function methodRows(list, cur, fmt) {
    return list.map(function (m) { return row('&nbsp;&nbsp;↳ ' + esc(m.label), m.total, cur, fmt, 'ds-m'); }).join('');
  }
  function renderLayer(L, cur, fmt) {
    var h = '<div class="ds-layer" data-ds-cur="' + cur + '">';
    h += '<div class="ds-cards">' +
      card('💎 إنتاج اليوم', fmt(L.production.total, cur), L.production.count + ' جلسة منجزة', 'blue') +
      card('💰 المقبوضات', fmt(L.collected.total, cur), L.collected.count + ' دفعة', 'green') +
      card('📤 الخارج', fmt(L.outflow.total, cur), 'مصروفات · مخابر · رواتب · استردادات', 'red') +
      card('💵 صافي الدرج نقداً', fmt(L.net.cash, cur), 'داخلٌ نقداً ' + fmt(L.net.cashIn, cur) + ' − خارجٌ من الدرج ' + fmt(L.net.cashOut, cur), L.net.cash >= 0 ? 'yellow' : 'red') +
    '</div>';
    h += '<div class="tbl-wrap"><table class="providers ds-table"><tbody>';
    h += row('<b>المقبوضات حسب الطريقة</b>', L.collected.total, cur, fmt, 'ds-head', L.collected.count + ' دفعة');
    h += L.collected.byMethod.length ? methodRows(L.collected.byMethod, cur, fmt) : '<tr class="ds-m"><td colspan="2" class="ds-empty">لا دفعات</td></tr>';
    if (L.adjustments.reductions.count) {
      h += row('<b>خصم / إعدام</b>', L.adjustments.reductions.total, cur, fmt, 'ds-head', L.adjustments.reductions.count + ' — تسويةُ ذمّة، لا تمسّ الصندوق');
    }
    h += row('<b>الخارج</b>', L.outflow.total, cur, fmt, 'ds-head');
    if (L.outflow.expenses.count) { h += row('&nbsp;&nbsp;↳ مصروفات', L.outflow.expenses.total, cur, fmt, 'ds-m', L.outflow.expenses.count + ''); h += L.outflow.expenses.byMethod.map(function (m) { return row('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;· ' + esc(m.label), m.total, cur, fmt, 'ds-m2'); }).join(''); }
    if (L.outflow.labs.count) {
      h += row('&nbsp;&nbsp;↳ دفعات مخابر', L.outflow.labs.total, cur, fmt, 'ds-m', L.outflow.labs.count + ' — تُحتسب نقداً');
      if (L.outflow.labs.outside > 0) {   /* M165: جزءٌ منها من خارج الدرج */
        var labIn = r2(L.outflow.labs.total - L.outflow.labs.outside);
        if (labIn > 0) h += row('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;· نقداً — من الدرج', labIn, cur, fmt, 'ds-m2');
        h += row('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;· ' + OUT_LABEL, L.outflow.labs.outside, cur, fmt, 'ds-m2');
      }
    }
    if (L.outflow.payouts.count)  { h += row('&nbsp;&nbsp;↳ رواتب ودفعات أطباء', L.outflow.payouts.total, cur, fmt, 'ds-m', L.outflow.payouts.count + ''); h += L.outflow.payouts.byMethod.map(function (m) { return row('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;· ' + esc(m.label), m.total, cur, fmt, 'ds-m2'); }).join(''); }
    if (L.adjustments.refunds.count) h += row('&nbsp;&nbsp;↳ استرداد للمريض', L.adjustments.refunds.total, cur, fmt, 'ds-m', L.adjustments.refunds.count + ' — تُحتسب نقداً');
    if (!L.outflow.expenses.count && !L.outflow.labs.count && !L.outflow.payouts.count && !L.adjustments.refunds.count) h += '<tr class="ds-m"><td colspan="2" class="ds-empty">لا مدفوعات خارجة</td></tr>';
    h += row('<b>صافي حركة اليوم (كل الطرق)</b>', L.net.all, cur, fmt, 'ds-total');
    h += row('<b>صافي الدرج نقداً</b>', L.net.cash, cur, fmt, 'ds-total ds-cash');
    if (L.net.cashOutside > 0) h += row('نقداً من خارج الدرج', L.net.cashOutside, cur, fmt, 'ds-m2', 'خزنة · جيب الطبيب — مصروفٌ بالحسابات، لا يُخصم من الدرج');
    h += '</tbody></table></div>';
    h += renderClosing(L, cur, fmt);
    h += '</div>';
    return h;
  }
  /* إقفالُ الصندوق (M158): مُقفلٌ ⇒ اللقطةُ والفرق (+ «تعديل» للمالك)؛ مفتوحٌ ⇒ نموذجُ العدّ */
  function renderClosing(L, cur, fmt) {
    var c = L.closing;
    var h = '<div class="ds-close" data-ds-close="' + cur + '">';
    if (c) {
      var tone = Math.abs(c.variance) < 0.005 ? 'ok' : (c.variance > 0 ? 'over' : 'short');
      var vLbl = tone === 'ok' ? 'مطابق' : (tone === 'over' ? 'زيادة ' + fmt(c.variance, cur) : 'عجز ' + fmt(-c.variance, cur));
      h += '<div class="ds-close-head">🔒 الصندوق مُقفل <span class="ds-sub">' + esc(fmtStamp(c.closed_at)) + '</span></div>' +
        '<div class="ds-close-grid">' +
          '<div><div class="ds-lbl">المتوقّع وقت الإقفال</div><div class="ds-val-s">' + fmt(c.expected, cur) + '</div></div>' +
          '<div><div class="ds-lbl">المعدود</div><div class="ds-val-s">' + fmt(c.counted, cur) + '</div></div>' +
          '<div><div class="ds-lbl">الفرق</div><div class="ds-val-s ds-var-' + tone + '">' + vLbl + '</div></div>' +
        '</div>' +
        (c.note ? '<div class="ds-close-note">📝 ' + esc(c.note) + '</div>' : '') +
        (Math.abs(c.expected - L.net.cash) > 0.005 ? '<div class="ds-close-warn">⚠️ الكشفُ اليوم يحسب ' + fmt(L.net.cash, cur) + ' — تغيّر الدفترُ بعد الإقفال؛ أعد الإقفال إن لزم.</div>' : '') +
        '<div class="ds-noprint"><button type="button" class="ds-qb" data-sub-write onclick="window.SyDentDaySheet.reopen(\'' + cur + '\')">✏️ تعديل الإقفال</button></div>';
    } else {
      h += '<div class="ds-noprint ds-close-form">' +
        '<div class="ds-close-head">🔒 إقفال الصندوق نقداً <span class="ds-sub">المتوقّع من الكشف: ' + fmt(L.net.cash, cur) + '</span></div>' +
        (L.net.cash < 0 ? '<div class="ds-close-warn">⚠️ المتوقّع بالسالب: خرج من الدرج نقداً أكثر مما دخله اليوم. إذا دُفع شيءٌ من خارج الدرج (خزنة · جيب الطبيب) فعدّل «مصدر النقد» بالدفعة نفسها؛ وإذا كان بالدرج رصيدٌ من أيامٍ سابقة فاكتب المعدود واذكر ذلك بالملاحظة.</div>' : '') +
        '<div class="ds-close-row">' +
          '<label>المعدود فعلاً<input type="number" inputmode="decimal" min="0" step="any" id="dsCounted_' + cur + '" placeholder="0"></label>' +
          '<label>ملاحظة<input type="text" maxlength="300" id="dsNote_' + cur + '" placeholder="اختياري"></label>' +
          '<button type="button" class="ds-qb ds-close-btn" data-sub-write onclick="window.SyDentDaySheet.close(\'' + cur + '\')">إقفال اليوم</button>' +
        '</div></div>';
    }
    h += '</div>';
    return h;
  }
  function fmtStamp(ts) {
    if (!ts) return '';
    var d = new Date(ts); if (isNaN(d.getTime())) return '';
    var hh = d.getHours(), ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
    return fmtDay(ymdLocal(d)) + ' — ' + String(hh).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }
  function card(lbl, val, sub, tone) {
    return '<div class="ds-card ds-' + tone + '"><div class="ds-lbl">' + lbl + '</div><div class="ds-val">' + val + '</div><div class="ds-note">' + sub + '</div></div>';
  }
  function renderBody(res, day, fmt) {
    if (!res) return '<div class="ds-empty">تعذّر تحميل كشف اليوم — أعد المحاولة.</div>';
    var act = CURS.filter(function (c) { return res[c] && res[c].active; });
    if (!act.length) return '<div class="ds-empty">📭 لا حركة مالية بتاريخ ' + esc(fmtDay(day)) + '.</div>';
    var h = '';
    act.forEach(function (cur) {
      if (act.length > 1) h += '<div class="ds-curhead">' + curName(cur) + '</div>';
      h += renderLayer(res[cur], cur, fmt);
    });
    h += '<div class="ds-note-foot">الإنتاج = الجلسات المنجزة بتاريخ اليوم. المقبوضات = ما دخل الصندوق فعلاً بتاريخ اليوم بكل الطرق (المقدَّم منها يبقى مقبوضاً). ' +
         'صافي الدرج نقداً = الداخل بطريقة «نقداً» − الخارج بطريقة «نقداً» من الدرج؛ الاستردادات ودفعات المخابر بلا طريقةٍ مسجَّلة فتُحتسب نقداً. المدفوع نقداً «من خارج الدرج» (خزنة · جيب الطبيب) مصروفٌ بالحسابات ولا يُخصم من الدرج. رقم تشغيلي لا يدخل صافي الربح.</div>';
    return h;
  }
  function renderSection(day, bodyHtml) {
    return '<div class="section ds-section" id="daySheetSection">' +
      '<div class="ds-head-row">' +
        '<h2>🧾 كشف اليوم <span class="count">' + esc(fmtDay(day)) + '</span></h2>' +
        '<div class="ds-ctl">' +
          '<input type="date" id="dsDate" value="' + esc(day) + '" aria-label="تاريخ الكشف" onchange="window.SyDentDaySheet.pick(this.value)">' +
          '<button type="button" class="ds-qb" onclick="window.SyDentDaySheet.pick(\'today\')">اليوم</button>' +
          '<button type="button" class="ds-qb" onclick="window.SyDentDaySheet.pick(\'yesterday\')">أمس</button>' +
          '<button type="button" class="ds-qb" onclick="window.SyDentDaySheet.print()">🖨️ طباعة</button>' +
        '</div>' +
      '</div>' +
      '<div id="dsBody">' + bodyHtml + '</div>' +
    '</div>';
  }

  /* ── التركيب على الصفحة ── */
  var _st = { host: null, sb: null, uid: null, fmt: null, day: null, res: null, inFlight: false, seq: 0 };
  async function mount(host, sb, uid, fmt) {
    _st.host = host; _st.sb = sb; _st.uid = uid; _st.fmt = fmt;
    await pick(todayYmd());
  }
  async function pick(v) {
    if (!_st.host) return;
    var day = v === 'today' ? todayYmd() : (v === 'yesterday' ? shiftYmd(todayYmd(), -1) : String(v || '').slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    _st.day = day;
    var seq = ++_st.seq;
    _st.host.innerHTML = renderSection(day, '<div class="ds-empty">⏳ جارٍ التحميل…</div>');
    var r = await load(_st.sb, _st.uid, day);
    if (seq !== _st.seq) return;                                   /* حارسُ التزامن: آخرُ اختيارٍ يفوز */
    _st.res = r.ok ? compute(r.data, day) : null;
    var body = document.getElementById('dsBody');
    if (body) body.innerHTML = renderBody(_st.res, day, _st.fmt);
  }
  function print() {
    var sec = document.getElementById('daySheetSection');
    if (!sec || !_st.day) return;
    var body = document.getElementById('dsBody');
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { if (window.showToast) window.showToast('⚠️ افتح صلاحيات النوافذ المنبثقة'); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
      '<title>كشف اليوم ' + esc(fmtDay(_st.day)) + '</title>' +
      '<link href="/fonts/noto-kufi-arabic.css" rel="stylesheet">' +
      '<style>body{margin:0;padding:24px;font-family:"Noto Kufi Arabic",sans-serif;color:#111;font-size:13px;}h1{font-size:18px;margin:0 0 4px;}' +
      '.ds-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0;}.ds-card{border:1px solid #bbb;border-radius:8px;padding:8px;}.ds-lbl{font-size:11px;color:#555;}.ds-val{font-size:15px;font-weight:800;}.ds-note{font-size:10px;color:#666;}' +
      'table{width:100%;border-collapse:collapse;margin-top:6px;}td{padding:5px 8px;border-bottom:1px solid #ddd;}td.num{text-align:left;direction:ltr;white-space:nowrap;}tr.ds-head td{background:#f3f3f3;}tr.ds-total td{font-weight:800;border-top:2px solid #333;}tr.ds-m2 td{color:#555;}' +
      '.ds-noprint{display:none;}.ds-close{margin-top:10px;border:1px solid #bbb;border-radius:8px;padding:8px;}.ds-close-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.ds-val-s{font-weight:800;}.ds-sub{font-size:10px;color:#666;}.ds-curhead{font-weight:800;margin:14px 0 4px;font-size:14px;}.ds-note-foot{font-size:10px;color:#555;margin-top:12px;line-height:1.6;}.ds-empty{padding:12px;color:#555;}</style>' +
      '</head><body><h1>🧾 كشف اليوم — ' + esc(fmtDay(_st.day)) + '</h1>' +
      '<div style="font-size:11px;color:#666;">طُبع: ' + esc(fmtDay(todayYmd())) + '</div>' +
      (body ? body.innerHTML : '') + '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 600);
  }

  /* الكتابةُ الوحيدة: upsert صفِّ الإقفال (المالك · اليوم · العملة) — محروسةٌ بوضع القراءة */
  var _closeBusy = false;
  async function close(cur) {
    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
    if (_closeBusy || !_st.res || !_st.res[cur] || !_st.day) return;
    var L = _st.res[cur];
    var inp = document.getElementById('dsCounted_' + cur), noteEl = document.getElementById('dsNote_' + cur);
    var counted = inp ? parseFloat(inp.value) : NaN;
    if (!isFinite(counted) || counted < 0) { if (window.showToast) window.showToast('⚠️ أدخل المبلغ المعدود'); return; }
    var note = noteEl ? String(noteEl.value || '').trim().slice(0, 300) : '';
    _closeBusy = true;
    try {
      /* M165: متوقَّعٌ سالب = دفعةٌ نقدية مسجّلة «من الدرج» أكبر من داخله — غالباً مصدرُها خطأ.
         لا منع (قد يكون بالدرج رصيدٌ سابق)، لكن تأكيدٌ صريح قبل حفظ «زيادة» محسوبة على سالب. */
      if (L.net.cash < 0) {
        var dlg = window.SyDialog;
        var go = dlg && dlg.confirm ? await dlg.confirm({ message: '⚠️ المتوقّع بالدرج سالب (' + _st.fmt(L.net.cash, cur) + ').\n\nغالباً دفعةٌ نقدية (راتب · مصروف · مخبر) دُفعت من خارج الدرج ومسجّلة «من الدرج». عدّل «مصدر النقد» بالدفعة ثم أقفل.\n\nهل تريد الإقفال رغم ذلك (رصيدٌ سابق بالدرج)؟' }) : false;
        if (!go) return;
      }
      var res = await _st.sb.from('day_closings')
        .upsert({ owner_id: _st.uid, day: _st.day, currency: cur, expected: L.net.cash, counted: counted, note: note || null, closed_at: new Date().toISOString() }, { onConflict: 'owner_id,day,currency' })
        .select().single();
      if (res.error) { if (window.showToast) window.showToast('⚠️ فشل الإقفال: ' + (res.error.message || '')); return; }
      if (window.showToast) window.showToast('✅ أُقفل الصندوق');
      await pick(_st.day);
    } catch (e) { if (window.showToast) window.showToast('⚠️ فشل الإقفال'); }
    finally { _closeBusy = false; }
  }
  /* «تعديل» = فتحُ النموذج مسبقاً بالقيم المحفوظة؛ الحفظُ يمرّ بـclose (upsert على الصف نفسه) */
  function reopen(cur) {
    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
    if (!_st.res || !_st.res[cur]) return;
    var L = _st.res[cur], prev = L.closing;
    var box = document.querySelector('.ds-close[data-ds-close="' + cur + '"]');
    if (!box) return;
    L.closing = null;
    box.outerHTML = renderClosing(L, cur, _st.fmt);
    L.closing = prev;
    var inp = document.getElementById('dsCounted_' + cur), noteEl = document.getElementById('dsNote_' + cur);
    if (inp && prev) inp.value = prev.counted;
    if (noteEl && prev) noteEl.value = prev.note || '';
  }

  window.SyDentDaySheet = {
    compute: compute, load: load, renderBody: renderBody, renderSection: renderSection, renderClosing: renderClosing,
    mount: mount, pick: pick, print: print, close: close, reopen: reopen,
    localDayOf: localDayOf, shiftYmd: shiftYmd, todayYmd: todayYmd
  };
})();
/* SYDENT_DAYSHEET_END */
