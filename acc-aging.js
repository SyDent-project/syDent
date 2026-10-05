/* SYDENT_AGING_START — تقادمُ ذمم المرضى (v507)
   ─────────────────────────────────────────────────────────────
   قسمٌ قرائيٌّ بصفحة المحاسبة يجيب «مين علينا مصاري، وقدّيش، ومن وقتيش؟»
   (Open Dental «Aging of A/R» · Dentrix «Aging Report / Collections Manager» ·
   Curve «Aging Summary» — بنفس الفئات الأربع: 0–30 · 31–60 · 61–90 · +90 يوماً).

   العقد (لا يُخالَف):
   • **صفر كتابة** — قراءةٌ محضة من الدفتر؛ لا يمسّ FIFO ولا computeFinancials.
   • **رصيدُ كلِّ مريض = رصيدُ اللوحة حرفياً**: دالةُ `balances` مرآةُ
     `computeDashFinancials` (index.html) بند‑ببند (الجلساتُ غيرُ المخطّطة · التوزيعاتُ
     المكتسبة على جلسةٍ مكتملة · بلا توزيعات ⇒ المخصَّص = المدفوع · شلالُ الاسترداد ·
     الخصمُ والإعدام). المثبتُ يقارن الاثنتين على بياناتٍ واحدة.
   • **التعميرُ بالرصيد المرحَّل (balance‑forward):** ما حُصِّل أو حُسم يُطفئ أقدمَ الجلسات
     أولاً، والمتبقّي من كلِّ جلسةٍ يُعمَّر بتاريخها — فمجموعُ الفئات = رصيدُ المريض
     بالبناء (حفظُ الذمم). وهو ما تفعله Dentrix/Open Dental افتراضياً.
   • **كيسٌ لكلِّ عملة** (#481): لا جمعَ عابر — طبقةٌ للّيرة وطبقةٌ للدولار.
   • **الأرصدةُ الدائنة لا تدخل الفئات** (كما Open Dental) — قائمةٌ منفصلة.
   • **الأقساطُ المتأخّرة**: اشتقاقُ الخطة مرآةٌ ثالثة لـprmPlanCalc/ppPlanCalc
     (check-mirrors.js) — علَمٌ على صفِّ المريض، لا رقمٌ يُضاف.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentAging) return;

  var EPS = 0.5;                                   /* عتبةُ اللوحة نفسها */
  var BUCKETS = [
    { key: 'b0', label: '0–30 يوماً',  max: 30 },
    { key: 'b1', label: '31–60 يوماً', max: 60 },
    { key: 'b2', label: '61–90 يوماً', max: 90 },
    { key: 'b3', label: 'أكثر من 90',  max: Infinity }
  ];
  var PAGE = 1000;

  function rc(r) { return (r && r.currency === 'USD') ? 'USD' : 'SYP'; }
  function ymdLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(fromYmd, toYmd) {
    var a = String(fromYmd).slice(0, 10).split('-'), b = String(toYmd).slice(0, 10).split('-');
    if (a.length < 3 || b.length < 3) return 0;
    return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  }
  function bucketIndex(days) {
    if (days <= 30) return 0;
    if (days <= 60) return 1;
    if (days <= 90) return 2;
    return 3;
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }

  /* ── MIRROR (3rd copy) ── agPlanAddPeriod ↔ prmPlanAddPeriod (patients.html) ↔ ppPlanAddPeriod (pp-plan.js) */
  function agPlanAddPeriod(startYmd, freq, k){
    var p = String(startYmd).slice(0,10).split('-');
    var y = +p[0], m = +p[1], d = +p[2];
    if (freq === 'weekly' || freq === 'biweekly') {
      var dt = new Date(Date.UTC(y, m - 1, d + (freq === 'weekly' ? 7 : 14) * k));
      return dt.toISOString().slice(0,10);
    }
    var mm = (m - 1) + k;
    var yy = y + Math.floor(mm / 12);
    mm = ((mm % 12) + 12) % 12;
    var last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm, Math.min(d, last))).toISOString().slice(0,10);
  }
  /* ── MIRROR (3rd copy) ── agPlanCalc ↔ prmPlanCalc ↔ ppPlanCalc */
  function agPlanCalc(plan, pays, todayYmd){
    var total = Number(plan.total || 0);
    var inst  = Number(plan.installment_amount || 0);
    var planCur = (plan && plan.currency === 'USD') ? 'USD' : 'SYP';
    var covered = 0;
    (pays || []).forEach(function(p){
      if (((p && p.currency === 'USD') ? 'USD' : 'SYP') !== planCur) return;
      var d = String(p.date || String(p.created_at || '').slice(0,10)).slice(0,10);
      if (plan.start_date && d < String(plan.start_date).slice(0,10)) return;
      covered += Number(p.amount || 0);
    });
    if (covered > total) covered = total;
    var k = inst > 0 ? Math.floor(covered / inst) : 0;
    var count = inst > 0 ? Math.ceil(total / inst) : 0;
    var done = covered >= total - 0.5;
    var nextDue = done ? null : agPlanAddPeriod(String(plan.start_date || todayYmd), plan.frequency || 'monthly', k);
    var overdueDays = 0;
    if (nextDue && todayYmd && nextDue < todayYmd) {
      var a = String(nextDue).split('-'), b = String(todayYmd).split('-');
      overdueDays = Math.round((Date.UTC(+b[0], +b[1]-1, +b[2]) - Date.UTC(+a[0], +a[1]-1, +a[2])) / 86400000);
    }
    return { covered: covered, k: k, count: count, done: done, nextDue: nextDue,
             overdueDays: overdueDays, remaining: Math.max(0, total - covered) };
  }

  /* ── مرآةُ computeDashFinancials (index.html) — الأرصدةُ لكلِّ مريض بكيسين ──
     المدخل صفوفٌ خام؛ المخرج map[patient_id].bags[cur] بالحقول نفسها. */
  function balances(data) {
    var mk = function () { return { completedTotal:0, paid:0, allocated:0, unearned:0, hasSplits:false, chargeReductions:0, refunds:0, sessCount:0 }; };
    var map = {};
    var get = function (pid) {
      if (!pid) return null;
      if (!map[pid]) map[pid] = { bags: { SYP: mk(), USD: mk() } };
      return map[pid];
    };
    var sessStatus = {};
    (data.sessions || []).forEach(function (s) {
      var st = s.status || 'completed'; sessStatus[s.id] = st;
      var b0 = get(s.patient_id); if (!b0) return;
      var b = b0.bags[rc(s)];
      b.sessCount++;
      if (st !== 'planned') b.completedTotal += Number(s.cost || 0);
    });
    (data.payments || []).forEach(function (p) { var b0 = get(p.patient_id); if (b0) b0.bags[rc(p)].paid += Number(p.amount || 0); });
    (data.splits || []).forEach(function (sp) {
      var b0 = get(sp.patient_id); if (!b0) return;
      var b = b0.bags[rc(sp)];
      b.hasSplits = true;
      var a = parseFloat(sp.amount) || 0;
      var onCompleted = sp.session_id && sessStatus[sp.session_id] === 'completed';
      if (sp.is_unearned || !onCompleted) b.unearned += a; else b.allocated += a;
    });
    (data.adjustments || []).forEach(function (a) {
      var b0 = get(a.patient_id); if (!b0) return;
      var b = b0.bags[rc(a)];
      var amt = parseFloat(a.amount) || 0; if (amt <= 0) return;
      if (a.kind === 'refund') b.refunds += amt;
      else if (a.kind === 'discount' || a.kind === 'write_off') b.chargeReductions += amt;
    });
    Object.keys(map).forEach(function (pid) {
      ['SYP', 'USD'].forEach(function (c) {
        var b = map[pid].bags[c];
        if (!b.hasSplits) b.allocated = b.paid;
        var rfu = Math.min(b.refunds, b.unearned);
        var rfe = b.refunds - rfu;
        b.unearned = b.unearned - rfu;
        b.trueBalance = (b.completedTotal - b.chargeReductions) - b.allocated + rfe;
      });
    });
    return map;
  }

  /* الجلساتُ المحمَّلة على الذمّة، الأقدمُ أولاً (تاريخ · إنشاء · معرّف) */
  function chargesOf(sessions, pid, cur) {
    return (sessions || []).filter(function (s) {
      return s.patient_id === pid && rc(s) === cur && (s.status || 'completed') !== 'planned' && Number(s.cost || 0) > 0;
    }).map(function (s) {
      var d = String(s.date || String(s.created_at || '').slice(0, 10)).slice(0, 10);
      return { id: s.id, date: d, created_at: String(s.created_at || ''), cost: Number(s.cost || 0) };
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
  }

  /* دالةٌ محضة: { sessions, payments, splits, adjustments, plans, patients } ⇒ { SYP, USD }
     كلُّ طبقة: { active, due:{ total, buckets[4], rows[] }, credit:{ total, rows[] } } */
  function compute(data, today) {
    today = today || ymdLocal(new Date());
    var map = balances(data);
    var ptInfo = {};
    (data.patients || []).forEach(function (p) { if (p && p.id) ptInfo[p.id] = p; });
    var paysByPt = {};
    (data.payments || []).forEach(function (p) { (paysByPt[p.patient_id] = paysByPt[p.patient_id] || []).push(p); });
    var plansByPt = {};
    (data.plans || []).forEach(function (pl) {
      if (!pl || pl.status !== 'active') return;
      (plansByPt[pl.patient_id] = plansByPt[pl.patient_id] || []).push(pl);
    });

    var out = {};
    ['SYP', 'USD'].forEach(function (cur) {
      var due = { total: 0, buckets: [0, 0, 0, 0], rows: [] };
      var credit = { total: 0, rows: [] };
      Object.keys(map).forEach(function (pid) {
        var b = map[pid].bags[cur];
        var tb = b.trueBalance || 0;
        var info = ptInfo[pid] || {};
        var name = info.name || '—';
        if (tb > EPS) {
          /* الرصيدُ المرحَّل: ما أُطفئ = المنجز − الرصيد؛ يُستهلك من الأقدم */
          var pool = b.completedTotal - tb;
          if (pool < 0) pool = 0;
          var bk = [0, 0, 0, 0], oldest = 0, oldestDate = null;
          chargesOf(data.sessions, pid, cur).forEach(function (ch) {
            var used = Math.min(ch.cost, pool);
            pool -= used;
            var rem = ch.cost - used;
            if (rem <= 0.005) return;
            var days = ch.date ? Math.max(0, daysBetween(ch.date, today)) : 0;
            bk[bucketIndex(days)] += rem;
            if (days >= oldest) { oldest = days; oldestDate = ch.date || null; }
          });
          /* حفظُ الذمم: فرقُ التقريب العائم (إن وُجد) يُصحَّح بأحدث فئةٍ حاملة */
          var sum = bk[0] + bk[1] + bk[2] + bk[3];
          var drift = tb - sum;
          if (Math.abs(drift) > 1e-9) {
            var i = 0; while (i < 3 && bk[i] <= 0) i++;
            bk[i] += drift;
          }
          var plan = null;
          (plansByPt[pid] || []).forEach(function (pl) {
            if (rc(pl) !== cur) return;
            var c = agPlanCalc(pl, paysByPt[pid], today);
            if (c.done || !c.nextDue || c.nextDue > today) return;
            if (!plan || c.overdueDays > plan.overdueDays) plan = { overdueDays: c.overdueDays, nextDue: c.nextDue, remaining: c.remaining, installment: Number(pl.installment_amount || 0) };
          });
          due.rows.push({ patient_id: pid, name: name, phone: info.phone || '', total: r2(tb), b: bk.map(r2), oldest: oldest, oldestDate: oldestDate, plan: plan });
          due.total += tb;
          for (var j = 0; j < 4; j++) due.buckets[j] += bk[j];
        } else if ((b.unearned || 0) > EPS || tb < -EPS) {
          var amt = Math.max(0, b.unearned || 0) + Math.max(0, -tb);
          credit.rows.push({ patient_id: pid, name: name, phone: info.phone || '', amount: r2(amt) });
          credit.total += amt;
        }
      });
      /* الأكثرُ تأخّراً أولاً، ثم الأكبرُ رصيداً */
      due.rows.sort(function (a, b) { return (b.oldest - a.oldest) || (b.total - a.total) || String(a.name).localeCompare(String(b.name), 'ar'); });
      credit.rows.sort(function (a, b) { return (b.amount - a.amount) || String(a.name).localeCompare(String(b.name), 'ar'); });
      due.total = r2(due.total); due.buckets = due.buckets.map(r2); credit.total = r2(credit.total);
      out[cur] = { active: !!(due.rows.length || credit.rows.length), due: due, credit: credit };
    });
    return out;
  }

  /* ── التحميل: كلُّ الذمّة بلا نافذةٍ زمنية ⇒ صفحاتٌ بألف مع فلترٍ خادميّ ── */
  async function pageAll(sb, table, cols, uid, ownerCol, extra) {
    var all = [], off = 0;
    for (;;) {
      var q = sb.from(table).select(cols).eq(ownerCol, uid);
      if (extra) q = extra(q);
      var res = await q.order('id').range(off, off + PAGE - 1);
      if (res.error) return { error: res.error };
      var rows = res.data || [];
      all = all.concat(rows);
      if (rows.length < PAGE) break;
      off += PAGE;
    }
    return { data: all };
  }
  function migrationMissing(err) {
    var msg = ((err && err.message) || '') + ' ' + ((err && err.code) || '');
    return /relation .* does not exist|42P01|PGRST205|42703|23514/i.test(msg);
  }
  /* ⇒ { ok, data } — فشلُ الجداول الأساسية (المرضى · الجلسات · الدفعات) = ok:false؛
     التوزيعاتُ والتسوياتُ والخطط تُتسامَح (جدولٌ غائب = مصفوفةٌ فارغة، كاللوحة). */
  async function load(sb, uid) {
    var data = { patients: [], sessions: [], payments: [], splits: [], adjustments: [], plans: [] };
    try {
      var rs = await Promise.all([
        pageAll(sb, 'patients', 'id,name,phone', uid, 'doctor_id'),
        pageAll(sb, 'ledger_sessions', 'id,patient_id,cost,status,currency,date,created_at', uid, 'doctor_id'),
        pageAll(sb, 'ledger_payments', 'id,patient_id,amount,currency,date,created_at', uid, 'doctor_id'),
        pageAll(sb, 'payment_splits', 'id,patient_id,session_id,amount,is_unearned,currency', uid, 'doctor_id'),
        pageAll(sb, 'account_adjustments', 'id,patient_id,kind,amount,currency', uid, 'doctor_id'),
        pageAll(sb, 'payment_plans', 'id,patient_id,total,installment_amount,frequency,start_date,status,currency', uid, 'doctor_id', function (q) { return q.eq('status', 'active'); })
      ]);
      if (rs[0].error || rs[1].error || rs[2].error) { console.warn('aging core load failed'); return { ok: false, data: data }; }
      data.patients = rs[0].data; data.sessions = rs[1].data; data.payments = rs[2].data;
      var soft = ['splits', 'adjustments', 'plans'];
      for (var i = 0; i < 3; i++) {
        var r = rs[3 + i];
        if (r.error) { if (!migrationMissing(r.error)) { console.warn('aging load failed: ' + soft[i]); return { ok: false, data: data }; } }
        else data[soft[i]] = r.data;
      }
      return { ok: true, data: data };
    } catch (e) { console.warn('aging load exception', e); return { ok: false, data: data }; }
  }

  /* ── العرض: طبقةٌ واحدة (cur) ⇒ HTML؛ '' حين لا ذمّةَ ولا رصيدَ دائن ──
     fmt = دالةُ الصفحة (fmtSY بعملة الطبقة قيد الرسم). */
  function renderSection(layer, cur, fmt) {
    if (!layer || !layer.active) return '';
    fmt = fmt || function (n) { return String(n); };
    var due = layer.due, cr = layer.credit;
    var html = '<div class="section ag-section" data-ag-cur="' + esc(cur) + '">' +
      '<h2>📊 تقادم ذمم المرضى <span class="count">حتى اليوم</span></h2>';
    if (due.rows.length) {
      var hasPlans = due.rows.some(function (r) { return !!r.plan; });
      html += '<div class="ag-buckets">' +
        '<div class="ag-bucket ag-total"><div class="ag-lbl">المستحق على المرضى</div><div class="ag-val">' + fmt(due.total) + '</div><div class="ag-sub">' + due.rows.length + ' مريض</div></div>';
      BUCKETS.forEach(function (bk, i) {
        var v = due.buckets[i], pct = due.total > 0 ? Math.round(v / due.total * 100) : 0;
        html += '<div class="ag-bucket ag-b' + i + '"><div class="ag-lbl">' + bk.label + '</div><div class="ag-val">' + fmt(v) + '</div><div class="ag-sub">' + pct + '%</div></div>';
      });
      html += '</div>';
      /* رقائقُ تصفية أحادية الاختيار (#10) */
      html += '<div class="ag-chips">' +
        chip(cur, 'all', 'الكل', due.rows.length, true) +
        chip(cur, 'b3', 'أكثر من 90 يوماً', due.rows.filter(function (r) { return r.b[3] > 0; }).length, false) +
        chip(cur, 'b2', '61–90', due.rows.filter(function (r) { return r.b[2] > 0; }).length, false) +
        (hasPlans ? chip(cur, 'plan', 'قسط متأخر', due.rows.filter(function (r) { return !!r.plan; }).length, false) : '') +
      '</div>';
      html += '<div class="tbl-wrap"><table class="providers ag-table">' +
        '<thead><tr><th>المريض</th><th class="num">المستحق</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">+90</th><th class="num">أقدم دين</th>' + (hasPlans ? '<th>الأقساط</th>' : '') + '</tr></thead><tbody>';
      due.rows.forEach(function (r) {
        var tags = 'all' + (r.b[3] > 0 ? ' b3' : '') + (r.b[2] > 0 ? ' b2' : '') + (r.plan ? ' plan' : '');
        html += '<tr data-ag-tags="' + tags + '">' +
          '<td><a class="ag-link" href="patient-profile.html?id=' + encodeURIComponent(r.patient_id) + '" title="كشف الحساب">📒 ' + esc(r.name) + '</a></td>' +
          '<td class="num ag-strong">' + fmt(r.total) + '</td>' +
          cell(r.b[0], fmt, 0) + cell(r.b[1], fmt, 1) + cell(r.b[2], fmt, 2) + cell(r.b[3], fmt, 3) +
          '<td class="num">' + (r.oldest > 0 ? '<bdi>' + r.oldest + '</bdi> يوماً' : 'اليوم') + '</td>' +
          (hasPlans ? '<td>' + (r.plan ? '<span class="ag-plan">متأخر <bdi>' + r.plan.overdueDays + '</bdi> يوماً · قسط ' + fmt(r.plan.installment) + '</span>' : '—') + '</td>' : '') +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    if (cr.rows.length) {
      html += '<details class="ag-credits"><summary>💳 أرصدة دائنة لصالح المرضى: ' + fmt(cr.total) + ' <span class="count">' + cr.rows.length + ' مريض</span></summary>' +
        '<div class="tbl-wrap"><table class="providers ag-table"><thead><tr><th>المريض</th><th class="num">الرصيد المقدَّم</th></tr></thead><tbody>';
      cr.rows.forEach(function (r) {
        html += '<tr><td><a class="ag-link" href="patient-profile.html?id=' + encodeURIComponent(r.patient_id) + '" title="كشف الحساب">📒 ' + esc(r.name) + '</a></td><td class="num ag-strong">' + fmt(r.amount) + '</td></tr>';
      });
      html += '</tbody></table></div></details>';
    }
    html += '<div class="ag-note">التعمير بتاريخ الجلسة المنجزة: ما دُفع أو حُسم يُطفئ الأقدم أولاً، والمتبقّي يُعمَّر بتاريخ جلسته — فمجموع الفئات يساوي المستحق تماماً. الأرصدة الدائنة لا تدخل الفئات ولا تُقاصّ بذمم مرضى آخرين. رقم ميزانية لا يدخل صافي الربح.</div>';
    html += '</div>';
    return html;
  }
  function chip(cur, key, label, n, active) {
    return '<button type="button" class="ag-chip' + (active ? ' active' : '') + '" data-ag-key="' + key + '" onclick="window.SyDentAging.setFilter(this)">' + label + ' <bdi>' + n + '</bdi></button>';
  }
  function cell(v, fmt, i) {
    return '<td class="num' + (v > 0 ? ' ag-has ag-c' + i : ' ag-zero') + '">' + (v > 0 ? fmt(v) : '—') + '</td>';
  }
  /* تصفيةٌ أحادية داخل قسم الطبقة نفسه — الصفوفُ تُخفى بـhidden، لا تُعاد قراءةُ شيء */
  function setFilter(btn) {
    var sec = btn && btn.closest ? btn.closest('.ag-section') : null;
    if (!sec) return;
    var key = btn.getAttribute('data-ag-key') || 'all';
    var chips = sec.querySelectorAll('.ag-chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i] === btn);
    var rows = sec.querySelectorAll('tr[data-ag-tags]');
    for (var j = 0; j < rows.length; j++) {
      var tags = (rows[j].getAttribute('data-ag-tags') || '').split(' ');
      rows[j].hidden = tags.indexOf(key) === -1;
    }
  }

  window.SyDentAging = {
    EPS: EPS, BUCKETS: BUCKETS,
    balances: balances, compute: compute, load: load, renderSection: renderSection, setFilter: setFilter,
    bucketIndex: bucketIndex, daysBetween: daysBetween,
    agPlanAddPeriod: agPlanAddPeriod, agPlanCalc: agPlanCalc
  };
})();
/* SYDENT_AGING_END */
