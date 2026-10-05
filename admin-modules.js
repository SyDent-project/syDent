/* ═══════════════════════════════════════════════════════════════════════
   SyDent — admin-modules.js: الوحدات المستخرَجة من admin.html
   (مشروع تفكيك الملفات الوحشية — 26 تموز 2026)
   نفس عقد pp-modules.js حرفياً: سكربت كلاسيكي بالنطاق العام، تعريفات
   صِرفة فقط، يُحمَّل قبل الكتلة الرئيسية، كل نقل ببرهان إعادة تركيب
   بايتية + برهان vm دلالي، والطبقة المالية لا تُنقل إلى هنا إطلاقاً.
   ═══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────
   [استخراج admin-١ — 26 تموز 2026] Phase X8: لوحة التقارير (تحليلات
   للقراءة فقط فوق trial_requests/subscription_events/subscription_plans،
   Chart.js نداء وقت-تشغيل) — منقولة حرفياً (بايت-بايت)، 29 معرّفاً.
   ───────────────────────────────────────────────────────────────────── */
// === Phase X8: Reports Dashboard ============================================
//
// Read-only analytics over trial_requests + subscription_events + subscription_plans.
// Lives in admin.html as an in-section collapsible (rule #58). No DB writes,
// no migration. Uses Chart.js 4.4.0 (loaded via CDN with `defer` in <head>).
//
// Architecture decisions:
//   • Lazy compute — runs on first open of section + on range/refresh
//   • All math client-side from already-fetched data; nothing new from server
//   • Range options: 3 / 6 / 12 months (Stripe Billing default = 6)
//   • Chart.js for line + stacked bar + donut; bespoke HTML for funnel
//   • Token guard (rule #55) prevents stale renders on rapid range switches
//   • CSS scoped under rpt-* (disjoint from evf-, tpl-, c360-, plan-, flt-, bk-)
//   • Phone normalization NOT relevant here (no WA actions in reports)
//   • CSV export uses RFC 4180 (cell escape from Phase X4 evfCsvCell pattern)
//
// MRR formula (matches Phase X5 widget + Phase X6 customer per-row MRR):
//   monthly plan: full price
//   yearly  plan: price / 12  (ChartMogul standard normalization)
//   permanent   : 0           (no recurring revenue)
//   trial       : 0           (free tier)
//
// Movement semantics (ChartMogul SaaS metrics cheat sheet):
//   New MRR          = first conversion to a paid plan (monthly/yearly)
//   Reactivation MRR = paid plan after a previous suspend/reject
//   Churned MRR      = previously paid plan, now suspended/rejected/deleted
//   Net Movement     = New + Reactivation - Churned

var rptState = {
  range: 6,              // months
  loaded: false,         // first compute done?
  loading: false,        // in-flight guard
  loadToken: 0,          // latest-wins (rule #55)
  charts: {},            // { mrr: Chart, movement: Chart, plans: Chart }
  data: null             // { months, mrrSeries, movementSeries, planDist, funnel }
};

// ───── Toggle the section ────────────────────────────────────────────────────
function rptToggle() {
  var sec = document.getElementById('rptSection');
  if (!sec) return;
  var willOpen = !sec.classList.contains('open');
  sec.classList.toggle('open');
  if (willOpen && !rptState.loaded && !rptState.loading) {
    rptLoad();
  }
}

// ───── Set the active range button ───────────────────────────────────────────
function rptSetRange(months) {
  var allowed = [3, 6, 12];
  if (allowed.indexOf(months) === -1) return;
  if (rptState.range === months && rptState.loaded) return;
  rptState.range = months;
  var group = document.getElementById('rptRangeGroup');
  if (group) {
    var btns = group.querySelectorAll('.rpt-range-btn');
    for (var i = 0; i < btns.length; i++) {
      var r = parseInt(btns[i].getAttribute('data-range'), 10);
      btns[i].classList.toggle('active', r === months);
    }
  }
  rptLoad();
}

// ───── Manual refresh ────────────────────────────────────────────────────────
/* إبطالُ كاش لوحة التقارير عند تغيّر سعر الصرف — السعرُ يُثبّت بلحظة
   التحميل عمداً (كي تُحسب كلُّ الأشهر بسعرٍ واحد فلا تختلط سلسلةٌ
   بسعرين)، وrptState.loaded يمنع إعادة التحميل — فتغييرُ السعر بالإعدادات
   كان يترك اللوحة على سعرٍ لم يعد قائماً، ويُخبَز بمخرج التصدير
   (usdRate). وإبطالُ العلم وحده لا يكفي: adminGo لا ينادي rptToggle إلا
   والقسمُ مُغلَق، والقسمُ يُفتح أوّل زيارة ويبقى مفتوحاً. */
function rptInvalidateRate() {
  try {
    rptState.loaded = false;
    var sec = document.getElementById('rptSection');
    if (sec && sec.classList.contains('open') && !rptState.loading) rptLoad();
  } catch (_e) {}
}

function rptRefresh() {
  if (rptState.loading) return;
  rptLoad();
}

// ───── Build the months array for the range (ascending) ──────────────────────
// Returns array of objects: { key: 'YYYY-MM', label: 'مم/yy', start: Date, end: Date }
function rptBuildMonths(months) {
  var arr = [];
  var now = new Date();
  // Anchor on first day of current month for stable boundaries.
  var anchor = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  for (var i = months - 1; i >= 0; i--) {
    var ms = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1, 0, 0, 0, 0);
    var me = new Date(anchor.getFullYear(), anchor.getMonth() - i + 1, 1, 0, 0, 0, 0);
    var key = ms.getFullYear() + '-' + String(ms.getMonth() + 1).padStart(2, '0');
    var label = String(ms.getMonth() + 1).padStart(2, '0') + '/' + String(ms.getFullYear()).slice(-2);
    arr.push({ key: key, label: label, start: ms, end: me });
  }
  return arr;
}

// ───── Normalize a plan price into monthly recurring SYP ────────────────────
// سعر صرف التقارير (دولار→ليرة) — يُثبَّت مرة واحدة لكل دورة حساب.
var _rptUsdRate = 0;
function rptUsdRate() {
  try {
    var v = parseFloat((typeof PLATFORM_SETTINGS_CACHE !== 'undefined' && PLATFORM_SETTINGS_CACHE) ? PLATFORM_SETTINGS_CACHE.usd_report_rate : '');
    return (isFinite(v) && v > 0) ? v : 0;
  } catch (e) { return 0; }
}
// السعر الشهري التمثيلي بعملتيه — نفس تطبيع ÷3/÷12 لعائلتي الأعمدة.
function rptPlanMrrParts(plan) {
  var out = { syp: 0, usd: 0 };
  if (!plan) return out;
  var code = String(plan.code || '').toLowerCase();
  if (code === 'permanent' || code === 'trial') return out;
  var pm = Number(plan.price_monthly), pq = Number(plan.price_quarterly), py = Number(plan.price_yearly);
  if      (isFinite(pm) && pm > 0) out.syp = Math.round(pm);
  else if (isFinite(pq) && pq > 0) out.syp = Math.round(pq / 3);
  else if (isFinite(py) && py > 0) out.syp = Math.round(py / 12);
  else {
    var price = Number(plan.price || 0); // legacy pre-M46
    if (isFinite(price) && price > 0) out.syp = (code === 'yearly') ? Math.round(price / 12) : Math.round(price);
  }
  var um = Number(plan.price_monthly_usd), uq = Number(plan.price_quarterly_usd), uy = Number(plan.price_yearly_usd);
  if      (isFinite(um) && um > 0) out.usd = um;
  else if (isFinite(uq) && uq > 0) out.usd = uq / 3;
  else if (isFinite(uy) && uy > 0) out.usd = uy / 12;
  return out;
}
// المساهمة الشهرية الموحّدة بالليرة لحساب على هذه الخطة بعملته:
// USD ⇒ الدولاري×السعر (وإلا الليري احتياطاً) · SYP ⇒ الليري (وإلا الدولاري×السعر —
// يُصلح اختفاء حساب ليرة على خطة دولارية-السعر من التقارير؛ تقارير فقط، لا بيلينغ).
// سعر صرف فارغ ⇒ الحصة الدولارية 0 هنا وتُكشف بشارة «غير محتسب» لا بصمت.
function rptPlanMrr(plan, curr) {
  var p = rptPlanMrrParts(plan);
  var usdSyp = Math.round(p.usd * _rptUsdRate);
  if (String(curr || '').toUpperCase() === 'USD') return (p.usd > 0 ? usdSyp : p.syp);
  return (p.syp > 0 ? p.syp : usdSyp);
}
// ───── Compute current state from a trial_request row ────────────────────────
// Mirrors the public-facing logic of computeAccountState used elsewhere.
// We keep this local to avoid coupling to internal field rename surprises.
// Returns one of: 'trial' | 'monthly' | 'yearly' | 'permanent' | 'suspended' | 'rejected'
function rptCurrentState(r) {
  if (!r) return 'rejected';
  var status = String(r.status || '').toLowerCase();
  if (status === 'rejected') return 'rejected';
  var planCode = String(r.plan || '').toLowerCase();
  if (planCode === 'permanent' || (status === 'accepted' && !r.trial_end && planCode !== 'monthly' && planCode !== 'yearly')) return 'permanent';
  // Any non-trial plan code (monthly / yearly / custom) — plan-agnostic.
  if (planCode && planCode !== 'trial') {
    if (r.trial_end) {
      var endsPaid = new Date(r.trial_end);
      if (isFinite(endsPaid.getTime()) && endsPaid.getTime() < Date.now()) return 'suspended';
    }
    return planCode;
  }
  // Trial logic
  if (r.trial_end) {
    var ends = new Date(r.trial_end);
    if (isFinite(ends.getTime()) && ends.getTime() < Date.now()) return 'suspended';
  }
  return 'trial';
}

// ───── Map a plan code (case-insensitive) to a normalized bucket ─────────────
// Values in DB columns (trial_requests.plan, subscription_events.to_plan,
// subscription_plans.code) are 'trial' | 'permanent' | any paid tier code
// ('monthly'/'yearly' are legacy ids; custom tiers like 'pro' are possible) | NULL.
//
// Phase X13: PLAN-AGNOSTIC. Returns:
//   • null         → trial / empty / unknown (no recurring revenue bucket)
//   • 'permanent'  → lifetime admin override (no recurring revenue)
//   • <code>       → ANY paid tier code (monthly, yearly, OR a custom tier)
// Callers resolve the code against planMap and compute MRR via rptPlanMrr, so a
// custom tier now contributes to MRR/movement just like monthly/yearly. The
// only buckets excluded from recurring revenue are null and 'permanent'.
function rptPlanBucket(planCode) {
  var p = String(planCode || '').toLowerCase().trim();
  if (!p || p === 'trial') return null;
  if (p === 'permanent')   return 'permanent';
  return p; // any paid tier code (monthly / yearly / custom)
}
// True when a bucket represents a paying subscriber (excludes null, trial, permanent).
function rptIsPaidBucket(b) { return !!b && b !== 'permanent'; }

// Resolve the normalized bucket for a subscription_event row (single source of
// truth for the MRR replay, so the rule can't drift across loops — Rule #66):
//   1) bucket from to_plan (plan-agnostic);
//   2) legacy fallback — derive the cycle from convert_monthly/convert_yearly
//      when to_plan is absent on an old row;
//   3) H7 permanent override — a paid-plan event whose to_trial_end is NULL is a
//      lifetime admin override (make_permanent records as convert_yearly with a
//      NULL trial_end). It carries NO recurring revenue, so bucket it as
//      'permanent' instead of the paid tier (otherwise it inflates MRR).
function rptEventBucket(ev) {
  var type = String((ev && ev.event_type) || '').toLowerCase();
  var b = rptPlanBucket(ev && ev.to_plan);
  if (!b) {
    if (type === 'convert_monthly') b = 'monthly';
    else if (type === 'convert_yearly') b = 'yearly';
  }
  if (b && b !== 'permanent' && (ev && ev.to_trial_end == null)) b = 'permanent';
  return b;
}

// ───── Main loader ───────────────────────────────────────────────────────────
async function rptLoad() {
  if (rptState.loading) return;
  rptState.loading = true;
  var myToken = ++rptState.loadToken;
  rptShowLoading();

  try {
    // Pull all data we need in parallel.
    // We pull the full trial_requests + subscription_events; both tables are
    // small (admin platform layer) and the alternative — per-month server-side
    // queries — would be much chattier without saving meaningful bandwidth.
    var months = rptBuildMonths(rptState.range);
    var rangeStart = months[0].start;
    _rptUsdRate = rptUsdRate(); // ثبات السعر طوال الدورة

    var promises = [
      window.sb.from('trial_requests').select('id, user_id, status, plan, trial_end, created_at, price_paid, billing_cycle, currency').limit(5000),
      // Note: no gte filter on created_at — we need full history so that
      // the "New vs Reactivation" classification at the start of the range
      // has correct prior-paid context (D8 fix).
      window.sb.from('subscription_events').select('user_id, event_type, from_plan, to_plan, to_trial_end, created_at, notes').order('created_at', { ascending: true }).limit(20000),
      // Migration 104: '*' instead of an explicit column list. A hardcoded list
      // breaks the WHOLE query the moment it names a column the DB doesn't have
      // yet (deploy can land before the migration is applied), and this table is
      // tiny (limit 50) so the wider payload costs nothing. Also means the next
      // catalog column needs no edit here.
      window.sb.from('subscription_plans').select('*').limit(50),
      // بطاقة «المقبوضات الشهرية»: الدفتر الفعلي — فشلها غير قاتل (تُترك فارغة).
      window.sb.from('subscription_payments').select('amount, currency, paid_at, voided_at').limit(20000)
    ];

    var results = await Promise.all(promises);
    if (myToken !== rptState.loadToken) return; // stale — newer load started

    var reqErr = results[0].error;
    var evErr  = results[1].error;
    var plErr  = results[2].error;
    if (reqErr || evErr || plErr) {
      throw new Error((reqErr || evErr || plErr).message || 'fetch failed');
    }

    var requests = results[0].data || [];
    var events   = results[1].data || [];
    var plans    = results[2].data || [];
    var payments = (results[3] && !results[3].error) ? (results[3].data || []) : [];

    // عملة كل حساب — تُمرَّر لكل حسابات المساهمة (السلسلة + الحركة + الفاقد).
    var curByUid = {};
    requests.forEach(function(r){ if (r.user_id) curByUid[r.user_id] = r.currency; });

    // Build plan lookup map.
    var planMap = {};
    plans.forEach(function(p) { planMap[String(p.code || '').toLowerCase()] = p; });

    // ─── Series 1: MRR over time ─────────────────────────────────────────────
    // For each month, MRR = Σ MRR of every tenant whose paid plan was active at month end.
    // "Active at month end" = trial_requests row exists with created_at <= month end,
    // status='accepted', and (trial_end IS NULL OR trial_end > month end OR plan is permanent).
    //
    // For historical accuracy we replay subscription_events up to month_end to
    // determine each user's plan at that moment. If no events, fall back to the
    // current row state.
    var mrrSeriesObj = months.map(function(m) {
      // Walk through events to build a "current plan code" per user_id at m.end
      var planAtEnd = {}; // user_id -> plan bucket ('monthly'/'yearly'/'permanent'/'trial') | null (suspended) | undefined (never seen)
      events.forEach(function(ev) {
        var t = new Date(ev.created_at);
        if (!isFinite(t.getTime()) || t.getTime() >= m.end.getTime()) return;
        var uid = ev.user_id;
        if (!uid) return;
        var type = String(ev.event_type || '').toLowerCase();
        if (type === 'suspend' || type === 'reject' || type === 'delete') {
          planAtEnd[uid] = null;
        } else if (type === 'accept' || type === 'reactivate' || type === 'restart_trial' || type === 'convert_plan' || type === 'convert_monthly' || type === 'convert_yearly' || type === 'renew' || type === 'extend') {
          // Phase X13: 'convert_plan' is now the PRIMARY conversion event (any
          // tier + cycle); convert_monthly/convert_yearly are legacy and only
          // appear on historical rows. Use the event's to_plan; else derive the
          // cycle from the legacy event type. The bucket is the paid tier code.
          var bucket = rptEventBucket(ev);
          if (bucket) planAtEnd[uid] = bucket;
          else if (type === 'accept' && !planAtEnd[uid]) planAtEnd[uid] = 'trial';
        } else if (type === 'shorten' || type === 'enter_grace') {
          // No plan change; keep current.
        }
      });
      // Fall back to current state for users with no events in range.
      requests.forEach(function(r) {
        if (!r.user_id || planAtEnd[r.user_id] !== undefined) return;
        var created = new Date(r.created_at);
        if (!isFinite(created.getTime()) || created.getTime() >= m.end.getTime()) return;
        var st = rptCurrentState(r);
        // Plan-agnostic: rptCurrentState returns the paid tier code itself for
        // any paid account (monthly / yearly / custom), plus 'permanent' / 'trial'.
        if (st === 'suspended' || st === 'rejected') planAtEnd[r.user_id] = null;
        else planAtEnd[r.user_id] = st; // paid code | 'permanent' | 'trial'
      });
      var total = 0, activeCount = 0;
      Object.keys(planAtEnd).forEach(function(uid) {
        var p = planAtEnd[uid];
        if (!p || p === 'trial' || p === 'permanent') return;
        var planRow = planMap[p] || null;
        if (!planRow) return;
        total += rptPlanMrr(planRow, curByUid[uid]);
        activeCount++;   // count MRR-contributing (paid recurring) tenants — denominator for ARPU
      });
      return { mrr: Math.round(total), active: activeCount };
    });
    // KPIs (ARPU + churn): keep mrrSeries a number[] (zero downstream ripple);
    // derive activeSeries in parallel (count of paid recurring tenants per month).
    var mrrSeries    = mrrSeriesObj.map(function(x) { return x.mrr; });
    var activeSeries = mrrSeriesObj.map(function(x) { return x.active; });

    // ─── Series 2: MRR movement per month ────────────────────────────────────
    // For each month: New (first time becoming paid in this month),
    // Reactivation (paid again after suspend/reject), Churned (lost paid status).
    var movementSeries = months.map(function(m) {
      var newMrr = 0, reactMrr = 0, churnMrr = 0;
      // Track "was-ever-paid" status as we walk events from the beginning of all events.
      // For each month, derive what changes happened within [m.start, m.end).
      // Build paid-history per user up to m.start so we know context.
      var paidHistory = {}; // user_id -> { wasPaid: bool, currentlyPaid: bool, currentPlan: code }
      events.forEach(function(ev) {
        var t = new Date(ev.created_at);
        if (!isFinite(t.getTime())) return;
        if (t.getTime() >= m.start.getTime()) return; // history only up to m.start
        var uid = ev.user_id;
        if (!uid) return;
        if (!paidHistory[uid]) paidHistory[uid] = { wasPaid: false, currentlyPaid: false, currentPlan: null };
        var type = String(ev.event_type || '').toLowerCase();
        var bucket = rptEventBucket(ev);
        if (type === 'suspend' || type === 'reject' || type === 'delete') {
          paidHistory[uid].currentlyPaid = false; paidHistory[uid].currentPlan = null;
        } else if (rptIsPaidBucket(bucket)) { // any paid tier (plan-agnostic)
          paidHistory[uid].wasPaid = true;
          paidHistory[uid].currentlyPaid = true;
          paidHistory[uid].currentPlan = bucket;
        }
      });
      // Now process events within the month.
      events.forEach(function(ev) {
        var t = new Date(ev.created_at);
        if (!isFinite(t.getTime())) return;
        if (t.getTime() < m.start.getTime() || t.getTime() >= m.end.getTime()) return;
        var uid = ev.user_id;
        if (!uid) return;
        if (!paidHistory[uid]) paidHistory[uid] = { wasPaid: false, currentlyPaid: false, currentPlan: null };
        var type = String(ev.event_type || '').toLowerCase();
        var bucket = rptEventBucket(ev);
        if (type === 'suspend' || type === 'reject' || type === 'delete') {
          if (paidHistory[uid].currentlyPaid && paidHistory[uid].currentPlan) {
            var planRow = planMap[paidHistory[uid].currentPlan] || null;
            if (planRow) churnMrr += rptPlanMrr(planRow, curByUid[uid]);
          }
          paidHistory[uid].currentlyPaid = false;
          paidHistory[uid].currentPlan = null;
        } else if (rptIsPaidBucket(bucket)) { // any paid tier (plan-agnostic)
          if (!paidHistory[uid].currentlyPaid) {
            var planRow2 = planMap[bucket] || null;
            if (planRow2) {
              var amt = rptPlanMrr(planRow2, curByUid[uid]);
              if (paidHistory[uid].wasPaid) reactMrr += amt;
              else                          newMrr   += amt;
            }
            paidHistory[uid].wasPaid = true;
            paidHistory[uid].currentlyPaid = true;
            paidHistory[uid].currentPlan = bucket;
          }
        }
      });
      return { newMrr: Math.round(newMrr), reactMrr: Math.round(reactMrr), churnMrr: Math.round(churnMrr) };
    });

    // ─── Series 3: Plan distribution (current snapshot) ──────────────────────
    var planDist = {}; // plan-agnostic: stateKey -> count (trial, permanent, any paid code)
    requests.forEach(function(r) {
      var st = rptCurrentState(r);
      if (st === 'rejected' || st === 'suspended') return; // excluded from current distribution
      planDist[st] = (planDist[st] || 0) + 1;
    });

    // ─── Funnel: signups → accepted → converted (within range) ──────────────
    var signupsInRange = 0, acceptedInRange = 0, convertedInRange = 0;
    requests.forEach(function(r) {
      var created = new Date(r.created_at);
      if (!isFinite(created.getTime())) return;
      if (created.getTime() < rangeStart.getTime()) return;
      signupsInRange++;
      // Was this tenant ever accepted in range? Easiest: current status accepted OR
      // any 'accept' event for this user in range.
      var st = String(r.status || '').toLowerCase();
      if (st === 'accepted') acceptedInRange++;
      var cur = rptCurrentState(r);
      if (cur !== 'trial' && cur !== 'suspended' && cur !== 'rejected') convertedInRange++;
    });

    // ─── KPIs: ARPU (current) + revenue churn rate (latest month + avg over range) ──
    // ARPU = current MRR / current active paid count (last month of the replay).
    var _lastIdx   = mrrSeries.length - 1;
    var _curMrr    = _lastIdx >= 0 ? mrrSeries[_lastIdx] : 0;
    var _curActive = (_lastIdx >= 0 && activeSeries[_lastIdx]) ? activeSeries[_lastIdx] : 0;
    var _arpu = _curActive > 0 ? Math.round(_curMrr / _curActive) : null;
    // Revenue churn rate per month = churned MRR / MRR at start of month (= MRR[m-1]).
    var _churnRates = [];
    for (var _ci = 1; _ci < mrrSeries.length; _ci++) {
      var _base = mrrSeries[_ci - 1];
      if (_base > 0) _churnRates.push((movementSeries[_ci].churnMrr / _base) * 100);
    }
    var _churnLatest = null;
    if (mrrSeries.length >= 2 && mrrSeries[mrrSeries.length - 2] > 0) {
      _churnLatest = (movementSeries[mrrSeries.length - 1].churnMrr / mrrSeries[mrrSeries.length - 2]) * 100;
    }
    var _churnAvg = _churnRates.length
      ? (_churnRates.reduce(function(a, b) { return a + b; }, 0) / _churnRates.length)
      : null;

    // تفصيل عملتَي الـMRR الحالي (للسطر التوضيحي وشارة «غير محتسب»).
    var mrrParts = { syp: 0, usd: 0 };
    requests.forEach(function(r) {
      if (!r.user_id) return;
      var st = rptCurrentState(r);
      if (!st || st === 'trial' || st === 'permanent' || st === 'suspended' || st === 'rejected') return;
      var pr = planMap[st]; if (!pr) return;
      var parts = rptPlanMrrParts(pr);
      if (String(r.currency || '').toUpperCase() === 'USD') {
        if (parts.usd > 0) mrrParts.usd += parts.usd; else mrrParts.syp += parts.syp;
      } else {
        if (parts.syp > 0) mrrParts.syp += parts.syp; else mrrParts.usd += parts.usd;
      }
    });

    // المقبوضات الشهرية من الدفتر الفعلي (غير الملغاة، ضمن المدى).
    var cashSeries = months.map(function(mo) {
      var syp = 0, usd = 0;
      payments.forEach(function(p) {
        if (p.voided_at) return;
        var t = new Date(p.paid_at);
        if (!isFinite(t.getTime()) || t.getTime() < mo.start.getTime() || t.getTime() >= mo.end.getTime()) return;
        var amt = Number(p.amount); if (!isFinite(amt) || amt <= 0) return;
        if (String(p.currency || 'SYP').toUpperCase() === 'USD') usd += amt; else syp += amt;
      });
      return { syp: Math.round(syp), usd: Math.round(usd * 100) / 100 };
    });

    rptState.data = {
      months: months,
      usdRate: _rptUsdRate,
      mrrParts: mrrParts,
      cashSeries: cashSeries,
      mrrSeries: mrrSeries,
      activeSeries: activeSeries,
      movementSeries: movementSeries,
      planDist: planDist,
      funnel: { signups: signupsInRange, accepted: acceptedInRange, converted: convertedInRange },
      kpi: { arpu: _arpu, churnLatest: _churnLatest, churnAvg: _churnAvg }
    };

    if (myToken !== rptState.loadToken) return;
    rptState.loaded = true;
    rptState.loading = false;
    rptRender();
  } catch (err) {
    if (myToken !== rptState.loadToken) return;
    rptState.loading = false;
    console.warn('[rpt] load failed', err);
    rptShowError((err && err.message) || 'فشل تحميل البيانات');
  }
}

// ───── Show loading state ────────────────────────────────────────────────────
function rptShowLoading() {
  var l = document.getElementById('rptLoading');
  var g = document.getElementById('rptGrid');
  var e = document.getElementById('rptError');
  var em = document.getElementById('rptEmpty');
  if (l) l.style.display = 'block';
  if (g) g.style.display = 'none';
  if (e) e.style.display = 'none';
  if (em) em.style.display = 'none';
  var btn = document.getElementById('rptBtnRefresh');
  if (btn) btn.disabled = true;
}

// ───── Show error state ──────────────────────────────────────────────────────
function rptShowError(msg) {
  var l = document.getElementById('rptLoading');
  var g = document.getElementById('rptGrid');
  var e = document.getElementById('rptError');
  var em = document.getElementById('rptEmpty');
  if (l) l.style.display = 'none';
  if (g) g.style.display = 'none';
  if (em) em.style.display = 'none';
  if (e) { e.style.display = 'block'; e.textContent = '⚠️ ' + (msg || 'حدث خطأ'); }
  var btn = document.getElementById('rptBtnRefresh');
  if (btn) btn.disabled = false;
}

// ───── Render all charts ─────────────────────────────────────────────────────
function rptRender() {
  var d = rptState.data;
  if (!d) return;

  var l = document.getElementById('rptLoading');
  var g = document.getElementById('rptGrid');
  var e = document.getElementById('rptError');
  var em = document.getElementById('rptEmpty');
  if (l) l.style.display = 'none';
  if (e) e.style.display = 'none';

  // If everything is zero, show empty state.
  var hasMrr = d.mrrSeries.some(function(v) { return v > 0; });
  var hasMov = d.movementSeries.some(function(o) { return o.newMrr + o.reactMrr + o.churnMrr > 0; });
  var hasPlans = Object.keys(d.planDist || {}).some(function(k){ return d.planDist[k] > 0; });
  var hasFunnel = d.funnel.signups > 0;
  if (!hasMrr && !hasMov && !hasPlans && !hasFunnel) {
    if (g) g.style.display = 'none';
    if (em) em.style.display = 'block';
    var btn1 = document.getElementById('rptBtnRefresh');
    if (btn1) btn1.disabled = false;
    return;
  }
  if (em) em.style.display = 'none';
  if (g) g.style.display = 'grid';

  // Verify Chart.js available (defer-loaded; should be ready by user interaction)
  if (typeof Chart === 'undefined') {
    rptShowError('مكتبة الرسوم البيانية لم تُحمَّل بعد — حاول التحديث.');
    return;
  }

  rptRenderMrrChart(d);
  rptRenderMovementChart(d);
  rptRenderCashChart(d);
  rptRenderPlansChart(d);
  rptRenderFunnel(d);
  rptRenderMrrSummary(d);
  rptRenderKpis(d);

  var btn = document.getElementById('rptBtnRefresh');
  if (btn) btn.disabled = false;
}

// ───── Chart 1: MRR line ─────────────────────────────────────────────────────
function rptRenderMrrChart(d) {
  var canvas = document.getElementById('rptChartMrr');
  if (!canvas) return;
  if (rptState.charts.mrr) { rptState.charts.mrr.destroy(); rptState.charts.mrr = null; }
  var ctx = canvas.getContext('2d');
  var labels = d.months.map(function(m) { return m.label; });
  rptState.charts.mrr = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'MRR (ل.س)',
        data: d.mrrSeries,
        borderColor: 'rgba(56,189,248,1)',
        backgroundColor: 'rgba(56,189,248,0.12)',
        fill: true, tension: 0.32, pointRadius: 3.5, pointHoverRadius: 6, borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return rptFmtSyp(ctx.parsed.y) + ' ل.س'; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { family: 'Cairo' } }, grid: { color: 'rgba(156,163,175,0.08)' } },
        y: { beginAtZero: true, ticks: { color: '#9ca3af', font: { family: 'Cairo' }, callback: function(v){ return rptFmtSypShort(v); } }, grid: { color: 'rgba(156,163,175,0.08)' } }
      }
    }
  });
  var sub = document.getElementById('rptMrrSubtitle');
  if (sub) sub.textContent = 'آخر ' + d.months.length + ' أشهر';
}

// ───── Chart 2: Movement stacked bar ─────────────────────────────────────────
function rptRenderMovementChart(d) {
  var canvas = document.getElementById('rptChartMovement');
  if (!canvas) return;
  if (rptState.charts.movement) { rptState.charts.movement.destroy(); rptState.charts.movement = null; }
  var ctx = canvas.getContext('2d');
  var labels = d.months.map(function(m) { return m.label; });
  var newArr   = d.movementSeries.map(function(o) { return o.newMrr; });
  var reactArr = d.movementSeries.map(function(o) { return o.reactMrr; });
  var churnArr = d.movementSeries.map(function(o) { return -Math.abs(o.churnMrr); }); // negative
  rptState.charts.movement = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'جديد',        data: newArr,   backgroundColor: 'rgba(13,133,119,0.78)', stack: 'mov' },
        { label: 'إعادة تفعيل', data: reactArr, backgroundColor: 'rgba(56,189,248,0.78)', stack: 'mov' },
        { label: 'مفقود',       data: churnArr, backgroundColor: 'rgba(239,68,68,0.78)',  stack: 'mov' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { family: 'Cairo', size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: function(c){ return c.dataset.label + ': ' + rptFmtSyp(Math.abs(c.parsed.y)) + ' ل.س'; } } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#9ca3af', font: { family: 'Cairo' } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#9ca3af', font: { family: 'Cairo' }, callback: function(v){ return rptFmtSypShort(v); } }, grid: { color: 'rgba(156,163,175,0.08)' } }
      }
    }
  });
}

// ───── بطاقة المقبوضات الشهرية (الكاش الفعلي من دفتر الدفعات) ────────────────
function rptRenderCashChart(d) {
  var canvas = document.getElementById('rptChartCash');
  if (!canvas) return;
  if (rptState.charts.cash) { rptState.charts.cash.destroy(); rptState.charts.cash = null; }
  var ctx = canvas.getContext('2d');
  var labels = d.months.map(function(mo) { return mo.label; });
  var cs = d.cashSeries || [];
  var rate = Number(d.usdRate || 0);
  var sypArr = cs.map(function(o) { return o ? o.syp : 0; });
  var usdConv = cs.map(function(o) { return (o && rate > 0) ? Math.round(o.usd * rate) : 0; });
  var usdRaw  = cs.map(function(o) { return o ? o.usd : 0; });
  var datasets = [{ label: 'ل.س مباشرة', data: sypArr, backgroundColor: 'rgba(13,133,119,0.78)', stack: 'cash' }];
  if (rate > 0) datasets.push({ label: '$ محوّلة (×' + rate + ')', data: usdConv, backgroundColor: 'rgba(250,204,21,0.78)', stack: 'cash' });
  var sub = document.getElementById('rptCashSubtitle');
  if (sub) {
    var totUsd = usdRaw.reduce(function(a,b){ return a+b; }, 0);
    sub.textContent = (rate <= 0 && totUsd > 0)
      ? ('⚠️ ' + totUsd.toFixed(0) + '$ مقبوضة غير محتسبة بالأعمدة — حدّد سعر صرف التقارير')
      : 'دفعات الاشتراك الفعلية غير الملغاة، شهراً بشهر';
    sub.style.color = (rate <= 0 && usdRaw.some(function(v){return v>0;})) ? 'var(--yellow-ink)' : '';
  }
  rptState.charts.cash = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { family: 'Cairo', size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: function(c){
          var i = c.dataIndex;
          if (c.datasetIndex === 1) return c.dataset.label + ': ' + rptFmtSyp(c.parsed.y) + ' ل.س (' + (cs[i] ? cs[i].usd : 0) + '$)';
          return c.dataset.label + ': ' + rptFmtSyp(c.parsed.y) + ' ل.س';
        } } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#9ca3af', font: { family: 'Cairo' } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#9ca3af', font: { family: 'Cairo' }, callback: function(v){ return rptFmtSypShort(v); } }, grid: { color: 'rgba(156,163,175,0.08)' } }
      }
    }
  });
}

// Distribution helpers (plan-agnostic): order trial → paid plans by sort_order → permanent.
var RPT_DIST_PALETTE = ['rgba(56,189,248,0.85)','rgba(13,133,119,0.85)','rgba(244,114,182,0.85)','rgba(250,204,21,0.85)','rgba(129,140,248,0.85)','rgba(248,113,113,0.85)'];
function rptDistOrder(dist) {
  return Object.keys(dist || {}).sort(function(a, b){
    var rank = function(k){ return k === 'trial' ? -1 : k === 'permanent' ? 1e15 : srqPlanSort(k); };
    return rank(a) - rank(b);
  });
}
function rptDistLabel(k) {
  if (k === 'trial') return 'تجربة';
  if (k === 'permanent') return 'دائم';
  return planDisplayName(k);
}
function rptDistColor(k, i) {
  if (k === 'trial') return 'rgba(245,158,11,0.85)';
  if (k === 'permanent') return 'rgba(168,85,247,0.85)';
  return RPT_DIST_PALETTE[i % RPT_DIST_PALETTE.length];
}

// ───── Chart 3: Plans donut ──────────────────────────────────────────────────
function rptRenderPlansChart(d) {
  var canvas = document.getElementById('rptChartPlans');
  if (!canvas) return;
  if (rptState.charts.plans) { rptState.charts.plans.destroy(); rptState.charts.plans = null; }
  var ctx = canvas.getContext('2d');
  var dist = d.planDist || {};
  var keys = rptDistOrder(dist);
  var labels = keys.map(rptDistLabel);
  var values = keys.map(function(k){ return dist[k]; });
  var distBg = keys.map(function(k, i){ return rptDistColor(k, i); });
  var total = values.reduce(function(a,b){return a+b;}, 0);
  rptState.charts.plans = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: distBg,
        borderColor: 'rgba(15,23,42,0.9)', borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { family: 'Cairo', size: 11 }, boxWidth: 12, padding: 6 } },
        tooltip: { callbacks: { label: function(c){
          var pct = total > 0 ? Math.round((c.parsed / total) * 100) : 0;
          return c.label + ': ' + c.parsed + ' (' + pct + '%)';
        } } }
      },
      cutout: '62%'
    }
  });
  var sub = document.getElementById('rptPlanSubtitle');
  if (sub) sub.textContent = 'الإجمالي: ' + total;
}

// ───── Chart 4: Funnel (custom HTML — clearer than chart.js for 3-stage) ────
function rptRenderFunnel(d) {
  var wrap = document.getElementById('rptFunnel');
  if (!wrap) return;
  var f = d.funnel;
  var pctAccepted  = f.signups   > 0 ? Math.round((f.accepted   / f.signups)   * 100) : 0;
  var pctConverted = f.accepted  > 0 ? Math.round((f.converted  / f.accepted)  * 100) : 0;
  var overall      = f.signups   > 0 ? Math.round((f.converted  / f.signups)   * 100) : 0;
  var html = ''
    + '<div class="rpt-funnel-stage" data-tier="signups">'
    + '  <div class="rpt-funnel-emoji">📝</div>'
    + '  <div class="rpt-funnel-body">'
    + '    <div class="rpt-funnel-label">تسجيلات جديدة</div>'
    + '    <div class="rpt-funnel-value">' + f.signups + '</div>'
    + '  </div>'
    + '  <div class="rpt-funnel-pct">100%</div>'
    + '</div>'
    + '<div class="rpt-funnel-stage" data-tier="accepted">'
    + '  <div class="rpt-funnel-emoji">✅</div>'
    + '  <div class="rpt-funnel-body">'
    + '    <div class="rpt-funnel-label">قُبلت</div>'
    + '    <div class="rpt-funnel-value">' + f.accepted + '</div>'
    + '  </div>'
    + '  <div class="rpt-funnel-pct ' + (pctAccepted >= 50 ? 'up' : '') + '">' + pctAccepted + '%</div>'
    + '</div>'
    + '<div class="rpt-funnel-stage" data-tier="converted">'
    + '  <div class="rpt-funnel-emoji">💎</div>'
    + '  <div class="rpt-funnel-body">'
    + '    <div class="rpt-funnel-label">تحوّلت إلى مدفوعة</div>'
    + '    <div class="rpt-funnel-value">' + f.converted + '</div>'
    + '  </div>'
    + '  <div class="rpt-funnel-pct ' + (pctConverted >= 30 ? 'up' : '') + '">' + pctConverted + '%</div>'
    + '</div>';
  wrap.innerHTML = html;
  var sub = document.getElementById('rptFunnelSubtitle');
  if (sub) sub.textContent = 'الإجمالي: ' + overall + '% من التسجيلات تحوّلت';
}

// ───── MRR summary cells ─────────────────────────────────────────────────────
function rptRenderMrrSummary(d) {
  var current = d.mrrSeries.length ? d.mrrSeries[d.mrrSeries.length - 1] : 0;
  var first   = d.mrrSeries.length ? d.mrrSeries[0] : 0;
  var sum     = d.mrrSeries.reduce(function(a,b){return a+b;}, 0);
  var avg     = d.mrrSeries.length ? Math.round(sum / d.mrrSeries.length) : 0;
  var peak    = d.mrrSeries.length ? d.mrrSeries.reduce(function(a,b){return Math.max(a,b);}, 0) : 0;
  var deltaPct = first > 0 ? Math.round(((current - first) / first) * 100) : (current > 0 ? 100 : 0);
  var setText = function(id, txt) { var n = document.getElementById(id); if (n) n.textContent = txt; };
  setText('rptSumMrrCurrent', rptFmtSypShort(current) + ' ل.س');
  // سطر تفصيل العملتين + شارة الدولار غير المحتسب — لا صفر صامت أبداً.
  (function(){
    var el = document.getElementById('rptMrrBreakdown');
    if (!el) return;
    var parts = d.mrrParts || { syp: 0, usd: 0 };
    var rate  = Number(d.usdRate || 0);
    var bits = [];
    if (parts.usd > 0 && rate > 0) bits.push('منها ' + parts.usd.toFixed(0) + '$/شهر × ' + rptFmtSyp(rate) + ' = ' + rptFmtSypShort(Math.round(parts.usd * rate)) + ' ل.س');
    if (parts.syp > 0 && parts.usd > 0) bits.push('و' + rptFmtSypShort(parts.syp) + ' ل.س مباشرة');
    if (parts.usd > 0 && rate <= 0) bits.push('⚠️ ' + parts.usd.toFixed(0) + '$/شهر غير محتسبة — حدّد «سعر صرف التقارير» بإعدادات المنصة');
    el.textContent = bits.join(' · ');
    el.style.display = bits.length ? '' : 'none';
    el.style.color = (parts.usd > 0 && rate <= 0) ? 'var(--yellow-ink)' : '';
  })();
  setText('rptSumMrrAvg',     rptFmtSypShort(avg)     + ' ل.س');
  setText('rptSumMrrPeak',    rptFmtSypShort(peak)    + ' ل.س');
  var delta = (deltaPct >= 0 ? '+' : '') + deltaPct + '%';
  setText('rptSumMrrDelta', delta);
}

// ───── KPIs: ARPU + revenue churn rate ───────────────────────────────────────
function rptRenderKpis(d) {
  var k = (d && d.kpi) || {};
  var set = function(id, txt, muted) {
    var n = document.getElementById(id);
    if (!n) return;
    n.textContent = txt;
    n.classList.toggle('muted', !!muted);
  };
  // ARPU (current MRR ÷ current active paid count)
  if (k.arpu != null && isFinite(k.arpu)) set('kpiArpu', rptFmtSypShort(k.arpu) + ' ل.س', false);
  else set('kpiArpu', '—', true);
  // Revenue churn rate — latest month
  if (k.churnLatest != null && isFinite(k.churnLatest)) set('kpiChurnLatest', rptFmtPct(k.churnLatest), false);
  else set('kpiChurnLatest', '—', true);
  // Revenue churn rate — average over range
  if (k.churnAvg != null && isFinite(k.churnAvg)) set('kpiChurnAvg', rptFmtPct(k.churnAvg), false);
  else set('kpiChurnAvg', '—', true);
}

function rptFmtPct(n) {
  var v = Math.round(n * 10) / 10;   // one decimal place
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%';
}

// ───── CSV export ────────────────────────────────────────────────────────────
async function rptExportCsv() {
  if (!rptState.data) return;
  var d = rptState.data;
  var headers = ['الشهر', 'MRR موحّد (ل.س)', 'جديد (ل.س)', 'إعادة تفعيل (ل.س)',
                 'مفقود (ل.س)', 'مقبوض (ل.س)', 'مقبوض ($)'];
  var rows = [];
  if (d.usdRate > 0) rows.push(['سعر صرف التقارير: 1$ = ' + d.usdRate + ' ل.س']);
  for (var i = 0; i < d.months.length; i++) {
    rows.push([
      d.months[i].label,
      d.mrrSeries[i] || 0,
      d.movementSeries[i] ? d.movementSeries[i].newMrr   : 0,
      d.movementSeries[i] ? d.movementSeries[i].reactMrr : 0,
      d.movementSeries[i] ? d.movementSeries[i].churnMrr : 0,
      (d.cashSeries && d.cashSeries[i]) ? d.cashSeries[i].syp : 0,
      (d.cashSeries && d.cashSeries[i]) ? d.cashSeries[i].usd : 0
    ]);
  }
  /* الكتل الثلاث تبقى بورقة واحدة بنفس ترتيبها السابق حرفياً — التقسيم
     لأوراق مستقلة تحسينٌ مؤجَّل عمداً، لا مفاجأة بهذه الدفعة. */
  rows.push([]);
  rows.push(['التوزيع الحالي للخطط']);
  rptDistOrder(d.planDist || {}).forEach(function(k){
    rows.push([rptDistLabel(k), d.planDist[k]]);
  });
  rows.push([]);
  rows.push(['قمع التحويل']);
  rows.push(['تسجيلات', d.funnel.signups]);
  rows.push(['قُبلت',    d.funnel.accepted]);
  rows.push(['تحوّلت',   d.funnel.converted]);

  await window.SyDentXlsx.save({
    filename:  'تقارير-سايدنت-' + d.range + 'م-' + window.SyDentXlsx.today(),
    sheetName: 'تقارير ' + d.range + ' أشهر',
    headers:   headers,
    rows:      rows,
    cols:      [{wch:26},{wch:18},{wch:16},{wch:18},{wch:16},{wch:16},{wch:14}]
  });
}

// ───── Number formatters ─────────────────────────────────────────────────────
function rptFmtSyp(n) {
  if (!isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}
function rptFmtSypShort(n) {
  if (!isFinite(n) || n === 0) return '0';
  var abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + 'M';
  if (abs >= 1000)    return (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'K';
  return String(Math.round(n));
}

// === End Phase X8 ===========================================================
