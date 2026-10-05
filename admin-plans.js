/* ═══════════════════════════════════════════════════════════════════════
   SyDent — admin-plans.js · حزام A1 من تفكيك admin.html (27 تموز 2026)
   طبقة الخطط والاشتراكات: كاش الخطط + loadPlanConfig/getPlan +
   مساعدو دورات الفوترة X13 (شهري/ربعي/سنوي × ل.س/دولار) +
   planEditorState + PLAN_ENTITLEMENT_DEFS (سطح Rule #223) +
   محرّر الخطط X2 كاملاً (الأسعار · الميزات features/features_all ·
   الاستحقاقات · حماية خطة التجربة).

   تعريفات صرفة — صفر تنفيذ top-level (فحص #330 أخضر).
   آلة الحالة (computeAccountState + transitionAccount) ودفتر مدفوعات
   الاشتراكات بقيا inline بـadmin.html عمداً — قرار العزل المالي.

   ⚠️ يحوي ثلاثية المرايا planFeatureItems/planVisibleFeatures
   (admin-plans.js ↔ subscription.html ↔ landing.html، مجموعة H
   بـcheck-mirrors.js) — أي تعديل يجب أن يبقى بايت-بايت عبر الثلاثة.

   يُحمَّل بعد admin-render.js وقبل الكتلة الرئيسية في admin.html.
   ═══════════════════════════════════════════════════════════════════════ */
/* ── ADMIN-PLANS-SEG-1 · admin.html كان 2144–3567 ── */
// === Plan config cache (loaded from subscription_plans on page boot) ===
// Why a cache: every render reads plan prices/durations to size the
// extend-on-renew preview and to render the plan picker. One DB read at
// boot is dramatically cheaper than per-render queries.
var planConfigCache = {};
var planConfigLoaded = false;

async function loadPlanConfig() {
  if (!window.sb) return false;
  try {
    var res = await window.sb.from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (res.error) {
      console.warn('loadPlanConfig: query error', res.error);
      // Fallback to hardcoded defaults so the page doesn't break if the
      // table is missing (e.g. Migration 23 wasn't run on this DB yet).
      // These mirror the Migration 23 seed exactly. All editable fields are
      // populated (features / is_active / sort_order / limits) so the
      // Phase X2 plan editor renders correctly even in this degraded state.
      planConfigCache = {
        trial:   { code:'trial',   display_name:'تجربة',     duration_days:30,  price:0,       price_monthly:0,      price_quarterly:0,    price_yearly:0,       price_monthly_usd:0, price_quarterly_usd:0, price_yearly_usd:0, currency:'SYP',
                   features:['كل الميزات','حتى 5 موظفين','حتى 50 مريض','بدون التزام'],
                   max_employees:5, max_patients:50, is_active:true, sort_order:1,
                   icon:'🆓', subtitle:'جرّب كل الميزات بدون التزام أو بطاقة ائتمان.', price_period_label:'لمدة 30 يوم',
                   is_featured:false, featured_label:'الأكثر شعبية' },
        monthly: { code:'monthly', display_name:'شهري',      duration_days:30,  price:200000,  price_monthly:200000, price_quarterly:null, price_yearly:null,    price_monthly_usd:null, price_quarterly_usd:null, price_yearly_usd:null, currency:'SYP',
                   features:['كل الميزات','موظفين بلا حدود','مرضى بلا حدود','دعم فني','نسخ احتياطي يومي'],
                   max_employees:null, max_patients:null, is_active:true, sort_order:2,
                   icon:'💵', subtitle:'دفعة شهرية مرنة. أوقف متى شئت.', price_period_label:'شهرياً',
                   is_featured:false, featured_label:'الأكثر شعبية' },
        yearly:  { code:'yearly',  display_name:'سنوي',      duration_days:365, price:2000000, price_monthly:null,   price_quarterly:null, price_yearly:2000000, price_monthly_usd:null, price_quarterly_usd:null, price_yearly_usd:null, currency:'SYP',
                   features:['كل ميزات الشهري','خصم ~16%','أولوية الدعم','ميزات حصرية قادمة'],
                   max_employees:null, max_patients:null, is_active:true, sort_order:3,
                   icon:'💎', subtitle:'الأنسب للعيادات المستقرة — وفّر أكثر بدفعة سنوية.', price_period_label:'سنوياً',
                   is_featured:true, featured_label:'الأكثر شعبية' }
      };
      planConfigLoaded = true;
      refreshPlanTabLabels(); // Phase A
      return false;
    }
    planConfigCache = {};
    (res.data || []).forEach(function(p){ planConfigCache[p.code] = p; });
    planConfigLoaded = true;
    refreshPlanTabLabels(); // Phase A: tab labels follow display_name
    return true;
  } catch(e) {
    console.warn('loadPlanConfig error:', e);
    return false;
  }
}

function getPlanConfig(code) {
  return planConfigCache[code] || null;
}

// ============================================================================
// === Phase X13: billing-cycle helpers =======================================
// ============================================================================
// A tier (subscription_plans row) now carries a price PER CYCLE (price_monthly /
// price_quarterly / price_yearly). The billing CYCLE lives on the subscription
// itself (trial_requests.billing_cycle). Tier codes stay opaque stable ids
// ('monthly'/'yearly' are legacy ids predating the cycle split).
// Cycle periods are standard; trial is single-cycle (its own duration_days).
// Migration 104 added the quarterly (90-day) cadence as a third option.
var CYCLE_DAYS = { monthly: 30, quarterly: 90, yearly: 365 };

function normCycle(c) {
  return (c === 'yearly') ? 'yearly' : (c === 'quarterly') ? 'quarterly' : 'monthly';
}
function cycleLabelAr(cycle) {
  var n = normCycle(cycle);
  return n === 'yearly' ? 'سنوي' : n === 'quarterly' ? 'ربع سنوي' : 'شهري';
}
// Null-safe cycle label for DISPLAY. Returns a label only for a SET cycle;
// '' for none. Trial and permanent accounts have billing_cycle = NULL and must
// NOT default to 'شهري' (that is what cycleLabelAr/normCycle would wrongly do).
// DB CHECK (Migration 104) restricts billing_cycle to
// 'monthly'|'quarterly'|'yearly'|NULL.
function cycleLabelArOrEmpty(cycle) {
  return cycle === 'yearly' ? 'سنوي'
       : cycle === 'quarterly' ? 'ربع سنوي'
       : cycle === 'monthly' ? 'شهري' : '';
}
// Months covered by one billing period of a cycle — the divisor used to show a
// per-month equivalent next to a multi-month price (12 for yearly, 3 for
// quarterly, 1 for monthly).
function cycleMonths(cycle) {
  var n = normCycle(cycle);
  return n === 'yearly' ? 12 : n === 'quarterly' ? 3 : 1;
}

// ── Migration 105: currency dimension ──────────────────────────────────────
// A currency is a second price-point axis on the catalog (Stripe/Chargebee
// model): SYP columns are the legacy trio, USD lives in the *_usd trio. Prices
// per currency are HAND-SET — never derived from each other by a rate.
var CYCLE_ORDER = ['monthly', 'quarterly', 'yearly'];
var CURRENCY_ORDER = ['SYP', 'USD'];
function normCurrency(c) { return (c === 'USD') ? 'USD' : 'SYP'; }
function currencyLabelAr(c) { return normCurrency(c) === 'USD' ? '$' : 'ل.س'; }
// Reports-only normalization: convert a paid amount to SYP using the manual
// admin rate (platform_settings.usd_report_rate). Returns null when a USD
// amount can't be normalized (rate unset/invalid) — callers must NOT mix.
function toReportSyp(amount, currency) {
  var n = Number(amount);
  if (!isFinite(n)) return null;
  if (normCurrency(currency) !== 'USD') return n;
  var rate = Number((typeof PLATFORM_SETTINGS_CACHE === 'object' && PLATFORM_SETTINGS_CACHE)
                    ? PLATFORM_SETTINGS_CACHE.usd_report_rate : NaN);
  if (!isFinite(rate) || rate <= 0) return null;
  return n * rate;
}

// Price for a tier + cycle. Falls back to the legacy single `price` ONLY when
// the requested cycle's dedicated price is absent AND the tier's native period
// matches that cycle (keeps pre-Migration-46 rows readable). Returns null when
// the cycle is not offered for the tier.
function planPriceForCycle(plan, cycle, curr) {
  if (!plan) return null;
  cycle = normCycle(cycle);
  curr = normCurrency(curr);
  var dedicated;
  if (curr === 'USD') {
    dedicated = (cycle === 'yearly')    ? plan.price_yearly_usd
              : (cycle === 'quarterly') ? plan.price_quarterly_usd
              :                           plan.price_monthly_usd;
  } else {
    dedicated = (cycle === 'yearly')    ? plan.price_yearly
              : (cycle === 'quarterly') ? plan.price_quarterly
              :                           plan.price_monthly;
  }
  var val = null;
  if (dedicated != null && !isNaN(Number(dedicated))) {
    val = Number(dedicated);
  } else if (curr === 'SYP' && plan.price != null && !isNaN(Number(plan.price))) {
    // Legacy fallback is SYP + monthly/yearly ONLY: the pre-split single `price`
    // was always SYP, and no pre-Migration-104 tier ever had a native quarterly
    // period. A USD or quarterly ask never borrows it.
    var dur = Number(plan.duration_days);
    var nativeCycle = (isFinite(dur) && dur >= 182) ? 'yearly' : 'monthly';
    if (nativeCycle === cycle) val = Number(plan.price);
  }
  // ── Migration 105-fix: ZERO IS NOT AN OFFER ────────────────────────────────
  // The whole dynamic chain (currency toggle → cycle toggle → cards → buttons
  // → modal guards → transitions) hangs off this single predicate. NULL always
  // meant "this (cycle × currency) point is not offered"; 0 must mean exactly
  // the same, otherwise one stale zero keeps a whole currency alive and renders
  // "0 ل.س / شهر". Three sources produce that zero: a dedicated column left at
  // 0, the invisible legacy `price` column (auto-synced to 0 when all SYP
  // prices are cleared), and a plan created with price:0. One guard at the
  // single return point neutralizes all three.
  // The trial tier is unaffected: every caller either renders it through its
  // own "مجاناً" branch, excludes it, or coerces null→0.
  return (val != null && isFinite(val) && val > 0) ? val : null;
}

// Days a given cycle adds. trial uses its own duration_days (single-cycle).
function planDurationForCycle(plan, cycle) {
  if (plan && plan.code === 'trial') {
    var d = Number(plan.duration_days);
    return (isFinite(d) && d > 0) ? d : 30;
  }
  return CYCLE_DAYS[normCycle(cycle)];
}

// Savings % of a tier's multi-month cycle price vs paying month-by-month
// (N× its monthly price, N = cycleMonths). Returns an integer 1..99, or 0 when
// not applicable (monthly cycle, missing/zero prices, or no actual discount).
function planCycleSavingsPct(plan, cycle, curr) {
  if (!plan) return 0;
  var n = cycleMonths(cycle);
  if (n <= 1) return 0;                       // monthly is the baseline itself
  curr = normCurrency(curr);
  // Savings compare STRICTLY within one currency — dividing a USD period price
  // by a SYP monthly baseline would be unit nonsense.
  var pm = Number(planPriceForCycle(plan, 'monthly', curr));
  var pc = Number(planPriceForCycle(plan, cycle, curr));
  if (!isFinite(pm) || !isFinite(pc) || pm <= 0 || pc <= 0) return 0;
  var full = pm * n;
  if (pc >= full) return 0;
  var pct = Math.round((1 - pc / full) * 100);
  return (pct > 0 && pct < 100) ? pct : 0;
}
// Back-compat wrapper — the yearly case of planCycleSavingsPct.
function planAnnualSavingsPct(plan) { return planCycleSavingsPct(plan, 'yearly'); }

// Format price for display (Arabic locale with Western digits)
function formatPrice(amount, currency) {
  if (amount == null) return '—';
  // Migration 105: render the two platform currencies with their Arabic-friendly
  // labels (ل.س / $); any other historical code passes through verbatim.
  var lbl = (currency === 'USD') ? '$' : (currency === 'SYP' || !currency) ? 'ل.س' : currency;
  try {
    return Number(amount).toLocaleString('en-US') + ' ' + lbl;
  } catch(e) {
    return String(amount) + ' ' + lbl;
  }
}

// ============================================================================
// === Phase X2: Plans & Pricing Editor =======================================
// ============================================================================
// admin edits subscription_plans rows (display_name / duration_days / price /
// features / max_employees / max_patients / sort_order / is_active) directly
// from the UI. Pattern follows Stripe Product Catalog + ChargeBee plan editor:
//
//   1. select tab (trial / monthly / yearly)
//   2. tweak fields — live preview on the right reflects every keystroke
//   3. save → confirm() → UPDATE + logSubscriptionEvent('plan_updated') +
//      reload planConfigCache (so subsequent admin transitions see new prices)
//
// price_paid snapshots in trial_requests are NOT touched (Rule #40) — existing
// subscribers keep the price they paid; the new price only affects future
// purchases. This matches Stripe and ChargeBee behavior.
//
// Audit notes field captures a JSON diff of changed fields only (Stripe events
// pattern) so the subscription_events viewer can render a clean change log.
// ============================================================================

var planEditorState = {
  selectedCode: 'trial',
  original: null,    // canonical copy from DB (deep-cloned on tab select)
  edited:   null,    // working copy being mutated by inputs
  isDirty:  false
};

// Phase B: gateable modules (ids match sidebar.js nav + the autoGate
// PAGE_MODULE map + Migration 35 seed). Each toggle, when OFF, hides the
// module from the sidebar AND blocks its page for tenants on this plan.
var PLAN_ENTITLEMENT_DEFS = [
  { key:'treatments',       label:'قائمة العلاجات' },
  { key:'doctors',          label:'أطباء العيادة' },
  { key:'employees',        label:'الموظفون' },
  { key:'payouts',          label:'الرواتب والدفعات' },
  { key:'expenses',         label:'المصاريف' },
  { key:'inventory',        label:'المخزون' },
  { key:'labs',             label:'المخابر' },
  { key:'accounting',       label:'المحاسبة' },
  { key:'provider-reports', label:'التقارير' },
  { key:'audit-log',        label:'سجل النشاطات' },
  { key:'learn',            label:'مركز التعلّم' },
  // Migration 83: NOT a sidebar page — enforced server-side inside the
  // booking_clinic_info RPC (public portal) + settings.html section gate
  // + {booking_link} suppression in patients/patient-profile.
  { key:'booking',          label:'بوابة الحجز الإلكتروني' },
  // AI features: NOT a sidebar page — enforced server-side in the ai-assist
  // Edge Function (plan + opt-in gates) + client feature gate
  // (SyDentPlan.can('ai_features')) + settings.html opt-in section.
  { key:'ai_features',      label:'مساعد الذكاء الاصطناعي 🤖' }
];

function renderPlanEntitlements(p) {
  var grid = document.getElementById('planEntitlementsGrid');
  if (!grid) return;
  var ent = (p && p.entitlements && typeof p.entitlements === 'object') ? p.entitlements : {};
  var html = '';
  for (var i = 0; i < PLAN_ENTITLEMENT_DEFS.length; i++) {
    var d = PLAN_ENTITLEMENT_DEFS[i];
    var on = (ent[d.key] === false) ? false : true; // default ON (grandfather)
    html +=
      '<div class="plan-ent-row">' +
        '<span class="plan-ent-label">' + escapeHtml(d.label) + '</span>' +
        '<div class="plan-switch plan-ent-switch' + (on ? ' on' : '') + '" role="switch" ' +
             'aria-checked="' + (on ? 'true' : 'false') + '" tabindex="0" ' +
             'data-ent-key="' + escapeHtml(d.key) + '" ' +
             'onclick="onPlanEntitlementToggle(\'' + d.key + '\')" ' +
             'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();onPlanEntitlementToggle(\'' + d.key + '\');}">' +
          '<span class="plan-switch-knob"></span>' +
        '</div>' +
      '</div>';
  }
  grid.innerHTML = html;
}

function onPlanEntitlementToggle(key) {
  if (!planEditorState.edited) return;
  if (!planEditorState.edited.entitlements || typeof planEditorState.edited.entitlements !== 'object') {
    planEditorState.edited.entitlements = {};
  }
  var cur = (planEditorState.edited.entitlements[key] === false) ? false : true;
  planEditorState.edited.entitlements[key] = !cur; // flip (true → false → true)
  var sw = document.querySelector('#planEntitlementsGrid .plan-ent-switch[data-ent-key="' + key + '"]');
  if (sw) {
    var nowOn = planEditorState.edited.entitlements[key] !== false;
    sw.classList.toggle('on', nowOn);
    sw.setAttribute('aria-checked', nowOn ? 'true' : 'false');
  }
  computePlanDirty();
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
}

async function togglePlanEditor() {
  var sec = document.getElementById('planEditorSection');
  if (!sec) return;
  var willOpen = !sec.classList.contains('open');
  if (!willOpen && planEditorState.isDirty) {
    if (!await SyDialog.confirm({ message: 'لديك تعديلات غير محفوظة على خطة "' + (planEditorState.edited && planEditorState.edited.display_name || planEditorState.selectedCode) + '". الإغلاق سيُلغي هذه التعديلات. متابعة؟' })) {
      return;
    }
    revertPlanEdits(true); // silent revert
  }
  sec.classList.toggle('open', willOpen);
  if (willOpen) {
    // Re-load fresh from cache every time the section opens so the editor
    // reflects any external changes (e.g. another admin tab made an edit).
    selectPlanTab(planEditorState.selectedCode, null);
  }
}

// Phase A: tab labels mirror display_name (not the fixed plan code) so that
// renaming a plan to e.g. "Mini" is reflected in the tab strip at the top of
// the editor — not just the preview card. The leading icon span is preserved.
function refreshPlanTabLabels() {
  var wrap = document.getElementById('planTabsWrap');
  if (!wrap) return;
  // Phase X11 part 2: rebuild the tab strip from the live plan cache so ADDED
  // plans appear and DELETED plans disappear. If the cache isn't loaded yet,
  // keep the static placeholder tabs already in the HTML.
  var codes = Object.keys(planConfigCache);
  if (!codes.length) return;
  var plans = codes.map(function(k){ return planConfigCache[k]; })
    .sort(function(a,b){ return (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999); });
  var sel = planEditorState.selectedCode;
  var DEF_ICONS = { trial:'🆓', monthly:'💵', yearly:'💎' };
  var html = '';
  plans.forEach(function(p){
    var active = (p.code === sel) ? ' active' : '';
    var inactive = (p.is_active === false) ? ' plan-tab-off' : '';
    var ico = (p.icon !== undefined && p.icon !== null) ? p.icon : (DEF_ICONS[p.code] || '📦');
    html += '<button type="button" class="plan-tab' + active + inactive + '" data-plan-code="' + escapeHtml(p.code) + '" onclick="selectPlanTab(\'' + jsAttr(p.code) + '\',this)">' +
              '<span class="plan-tab-icon">' + escapeHtml(ico) + '</span> ' +
              '<span class="plan-tab-label">' + escapeHtml(p.display_name || p.code) + '</span>' +
            '</button>';
  });
  html += '<button type="button" class="plan-tab plan-tab-add" onclick="addPlanTab()" title="إضافة خطة جديدة"><span class="plan-tab-icon">➕</span> <span class="plan-tab-label">إضافة خطة</span></button>';
  wrap.innerHTML = html;
}

async function addPlanTab() {
  if (planEditorState.isDirty) {
    if (!await SyDialog.confirm({ message: 'لديك تعديلات غير محفوظة ستُفقد. متابعة لإضافة خطة جديدة؟' })) return;
  }
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }
  var code = await SyDialog.prompt({ message: 'كود الخطة الجديدة (إنجليزي صغير/أرقام/شرطة سفلية فقط، مثل: pro):' });
  if (code == null) return;
  code = String(code).trim().toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z0-9_]{2,40}$/.test(code)) { SyDialog.alert('الكود غير صالح. استخدم أحرفاً إنجليزية صغيرة/أرقاماً/شرطة سفلية (2–40 محرفاً).'); return; }
  if (getPlanConfig(code)) { SyDialog.alert('يوجد خطة بهذا الكود مسبقاً.'); return; }
  var name = await SyDialog.prompt({ message: 'اسم العرض للخطة الجديدة:', value: code });
  if (name == null) return;
  name = String(name).trim() || code;
  var maxSort = 0;
  Object.keys(planConfigCache).forEach(function(k){ var s = Number(planConfigCache[k].sort_order) || 0; if (s > maxSort) maxSort = s; });
  // Minimal column set guaranteed by Migration 23. New rows start INACTIVE
  // (draft) so they never hit the public pricing page until the admin reviews
  // price/features and activates them. Display + entitlement columns take their
  // DB defaults (entitlements '{}' = all modules allowed = grandfather).
  var newRow = {
    code: code, display_name: name, duration_days: 30, price: 0, currency: 'SYP',
    features: ['كل الميزات'], max_employees: null, max_patients: null,
    is_active: false, sort_order: maxSort + 1
  };
  try {
    var ins = await window.sb.from('subscription_plans').insert(newRow).select().maybeSingle();
    if (ins.error) { SyDialog.alert('❌ فشل إنشاء الخطة: ' + (ins.error.message || 'خطأ غير معروف')); return; }
    if (!ins.data) { SyDialog.alert('❌ لم تُنشأ الخطة (0 صفوف). غالباً صلاحيات المسؤول — سجّل خروج/دخول وأعد المحاولة.'); return; }
    await logSubscriptionEvent({
      trial_request_id: null, user_id: null, event_type: 'plan_created',
      from_plan: code, to_plan: code, from_status: null, to_status: null,
      from_trial_end: null, to_trial_end: null, amount: null, currency: 'SYP',
      notes: JSON.stringify({ plan_code: code, display_name: name })
    });
    await loadPlanConfig();
    selectPlanTab(code, null);
    SyDialog.alert('✅ تم إنشاء خطة "' + name + '" (غير نشطة). اضبط السعر/المدة/الميزات ثم فعّلها من مفتاح «الخطة نشطة».');
  } catch(e) {
    SyDialog.alert('❌ خطأ غير متوقع: ' + (e && e.message ? e.message : String(e)));
  }
}

async function archivePlan(code, name) {
  try {
    var upd = await window.sb.from('subscription_plans').update({ is_active: false }).eq('code', code).select().maybeSingle();
    if (upd.error) { SyDialog.alert('❌ فشل الأرشفة: ' + (upd.error.message || 'خطأ غير معروف')); return; }
    if (!upd.data) { SyDialog.alert('❌ لم تتم الأرشفة (0 صفوف). غالباً صلاحيات المسؤول — سجّل خروج/دخول وأعد المحاولة.'); return; }
    await logSubscriptionEvent({
      trial_request_id: null, user_id: null, event_type: 'plan_updated',
      from_plan: code, to_plan: code, from_status: null, to_status: null,
      from_trial_end: null, to_trial_end: null, amount: null, currency: 'SYP',
      notes: JSON.stringify({ plan_code: code, diff: { is_active: { from: true, to: false } }, archived: true })
    });
    await loadPlanConfig();
    selectPlanTab(code, null);
    SyDialog.alert('📦 تمت أرشفة خطة "' + name + '". اختفت من صفحة الأسعار، والحسابات الحالية عليها تبقى تعمل. يمكنك إعادة تفعيلها لاحقاً.');
  } catch(e) {
    SyDialog.alert('❌ خطأ غير متوقع: ' + (e && e.message ? e.message : String(e)));
  }
}

async function deleteCurrentPlan() {
  var code = planEditorState.selectedCode;
  if (!code) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }
  if (code === 'trial') { SyDialog.alert('لا يمكن حذف خطة التجربة — هي خطة أساسية في النظام (مسار قبول الطلبات يعتمد عليها).'); return; }
  if (planEditorState.isDirty) { SyDialog.alert('احفظ التعديلات أو ألغِها قبل الحذف.'); return; }
  var cfg = getPlanConfig(code);
  var name = (cfg && cfg.display_name) ? cfg.display_name : code;
  // How many accounts are currently on this plan? Deleting the catalog row for
  // a plan that tenants reference would break their entitlement/limit lookup,
  // so in that case we archive instead of delete (Stripe pattern).
  var refCount = null;
  try {
    var rc = await window.sb.from('trial_requests').select('id', { count: 'exact', head: true }).eq('plan', code);
    refCount = (rc && typeof rc.count === 'number') ? rc.count : null;
  } catch(e) { refCount = null; }
  if (refCount === null) {
    if (!await SyDialog.confirm({ message: 'تعذّر التحقق من وجود حسابات على هذه الخطة. للأمان سيتم أرشفتها بدل الحذف النهائي. متابعة؟', danger: true })) return;
    return archivePlan(code, name);
  }
  if (refCount > 0) {
    SyDialog.alert('🔒 يوجد ' + refCount + ' حساب على خطة "' + name + '" — لا يمكن حذفها نهائياً (سيكسر اشتراكاتهم).\n\nسيتم أرشفتها: تختفي من صفحة الأسعار، والحسابات الحالية تبقى كما هي.');
    return archivePlan(code, name);
  }
  if (!await SyDialog.confirm({ message: 'حذف خطة "' + name + '" نهائياً؟\n\nلا يوجد أي حساب عليها. هذا الإجراء لا يمكن التراجع عنه.', danger: true })) return;
  try {
    var del = await window.sb.from('subscription_plans').delete().eq('code', code);
    if (del.error) { SyDialog.alert('❌ فشل الحذف: ' + (del.error.message || 'خطأ غير معروف')); return; }
    await logSubscriptionEvent({
      trial_request_id: null, user_id: null, event_type: 'plan_deleted',
      from_plan: code, to_plan: code, from_status: null, to_status: null,
      from_trial_end: null, to_trial_end: null, amount: null, currency: 'SYP',
      notes: JSON.stringify({ plan_code: code, display_name: name })
    });
    await loadPlanConfig();
    var remaining = Object.keys(planConfigCache).sort(function(a,b){
      return (Number(planConfigCache[a].sort_order) || 999) - (Number(planConfigCache[b].sort_order) || 999);
    });
    if (remaining.length) selectPlanTab(remaining[0], null); else refreshPlanTabLabels();
    SyDialog.alert('🗑 تم حذف خطة "' + name + '" نهائياً.');
  } catch(e) {
    SyDialog.alert('❌ خطأ غير متوقع: ' + (e && e.message ? e.message : String(e)));
  }
}

async function selectPlanTab(code, btnEl) {
  if (planEditorState.isDirty && code !== planEditorState.selectedCode) {
    if (!await SyDialog.confirm({ message: 'لديك تعديلات غير محفوظة. التبديل سيُلغي هذه التعديلات. متابعة؟' })) {
      return;
    }
  }
  planEditorState.selectedCode = code;
  // Update tab active state — find the matching tab regardless of which
  // element triggered this (programmatic calls pass null).
  var wrap = document.getElementById('planTabsWrap');
  if (wrap) {
    var tabs = wrap.querySelectorAll('.plan-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-plan-code') === code);
    }
  }
  var src = getPlanConfig(code);
  if (!src) {
    SyDialog.alert('لم يتم تحميل بيانات الخطة "' + code + '" بعد. جرّب إعادة تحميل الصفحة.');
    return;
  }
  // Deep clone via JSON round-trip — features is a JSONB array, this is safe.
  planEditorState.original = JSON.parse(JSON.stringify(src));
  planEditorState.edited   = JSON.parse(JSON.stringify(src));
  seedPlanEditorFeatures(); // Migration 106: work on the full list, diff-neutral
  planEditorState.isDirty  = false;
  renderPlanEditorFields(planEditorState.edited);
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
  refreshPlanTabLabels(); // Phase A: keep all tab labels in sync on switch
}

function renderPlanEditorFields(p) {
  document.getElementById('planFldDisplayName').value = p.display_name || '';
  // Duration field only relevant for trial plan — hide for paid plans
  var durWrap = document.getElementById('planFldDurationWrap');
  if (durWrap) durWrap.style.display = (p.code === 'trial') ? '' : 'none';
  // The trial tier is structural: the intake/accept path, the free "مجاناً"
  // rendering and handle_new_doctor all key off code='trial', and it cannot be
  // recreated from the editor. deleteCurrentPlan already refuses it — hide the
  // button too so the operator is never offered an action that will be denied.
  // Same inline-display pattern as durWrap above (no hidden-attribute, so the
  // author-origin display rule stays authoritative).
  var _isTrialTier = (p.code === 'trial');
  // price_period_label is consumed at exactly two render sites (landing.html
  // card + the preview below) and BOTH are gated on code==='trial'. On a billed
  // tier the period text comes from the selected cycle, so the input would be
  // inert — hide it (and collapse its row to one column) instead of offering an
  // edit with no visible effect. Condition is code-based, so every future plan
  // gets the same treatment with no list to maintain.
  var perWrap = document.getElementById('planFldPeriodLabelWrap');
  var perRow  = document.getElementById('planPeriodFeaturedRow');
  if (perWrap) perWrap.style.display = _isTrialTier ? '' : 'none';
  if (perRow) {
    if (_isTrialTier) perRow.classList.remove('plan-field-row-solo');
    else              perRow.classList.add('plan-field-row-solo');
  }
  var delBtn  = document.getElementById('btnDeletePlan');
  var delNote = document.getElementById('planDeleteLockNote');
  if (delBtn)  delBtn.style.display  = _isTrialTier ? 'none' : '';
  if (delNote) delNote.style.display = _isTrialTier ? '' : 'none';
  document.getElementById('planFldDuration').value    = (p.duration_days == null ? '' : String(p.duration_days));
  document.getElementById('planFldPriceMonthly').value = (p.price_monthly == null ? '' : String(p.price_monthly));
  document.getElementById('planFldPriceQuarterly').value = (p.price_quarterly == null ? '' : String(p.price_quarterly)); // Migration 104
  document.getElementById('planFldPriceYearly').value  = (p.price_yearly == null ? '' : String(p.price_yearly));
  document.getElementById('planFldPriceMonthlyUsd').value   = (p.price_monthly_usd   == null ? '' : String(p.price_monthly_usd));   // Migration 105
  document.getElementById('planFldPriceQuarterlyUsd').value = (p.price_quarterly_usd == null ? '' : String(p.price_quarterly_usd)); // Migration 105
  document.getElementById('planFldPriceYearlyUsd').value    = (p.price_yearly_usd    == null ? '' : String(p.price_yearly_usd));    // Migration 105
  document.getElementById('planFldSort').value        = (p.sort_order == null ? '' : String(p.sort_order));
  document.getElementById('planFldMaxEmp').value      = (p.max_employees == null ? '' : String(p.max_employees));
  document.getElementById('planFldMaxPat').value      = (p.max_patients == null ? '' : String(p.max_patients));
  renderFeatureRows(p.features);
  // Phase X11: display-layer fields
  document.getElementById('planFldIcon').value          = p.icon || '';
  document.getElementById('planFldSubtitle').value      = p.subtitle || '';
  document.getElementById('planFldSubtitleQuarterly').value = p.subtitle_quarterly || ''; // Migration 104
  document.getElementById('planFldSubtitleYearly').value = p.subtitle_yearly || ''; // Migration 83
  document.getElementById('planFldPeriodLabel').value   = p.price_period_label || '';
  document.getElementById('planFldFeaturedLabel').value = p.featured_label || '';
  renderPlanEntitlements(p); // Phase B
  // Migration 132: AI monthly call cap lives INSIDE entitlements (jsonb) so
  // ai-assist reads plan gate + cap from the one column it already fetches.
  var _aiCapEl = document.getElementById('planFldAiCap');
  if (_aiCapEl) {
    var _entCap = (p.entitlements && typeof p.entitlements === 'object') ? p.entitlements.ai_monthly_calls : null;
    _aiCapEl.value = (typeof _entCap === 'number' && isFinite(_entCap)) ? String(_entCap) : '';
  }
  var sw = document.getElementById('planSwitchActive');
  if (sw) {
    sw.classList.toggle('on', !!p.is_active);
    sw.setAttribute('aria-checked', p.is_active ? 'true' : 'false');
  }
  var swF = document.getElementById('planSwitchFeatured');
  if (swF) {
    swF.classList.toggle('on', !!p.is_featured);
    swF.setAttribute('aria-checked', p.is_featured ? 'true' : 'false');
  }
}

function parseFeatures(text) {
  if (!text) return [];
  var lines = String(text).split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var s = lines[i].trim();
    if (s) out.push(s);
  }
  return out;
}

function stringifyFeatures(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.join('\n');
}

// Phase X11: row-based features editor (replaces the textarea). The array in
// ── Feature list model (JSONB, no migration) ──────────────────────────────
// An item is EITHER a plain string (visible — the legacy shape every existing
// row uses) OR { t: 'text', h: true } for a feature the operator has hidden
// without deleting it. Order in the array is the display order. Both readers
// below are a byte-identical MIRROR across admin.html / subscription.html /
// landing.html and are enforced by scripts/check-mirrors.js (Rule #211) — any
// semantic change must be applied to all three copies.
function planFeatureItems(raw) {
  var arr = Array.isArray(raw) ? raw : [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var f = arr[i];
    if (f && typeof f === 'object' && !Array.isArray(f)) {
      out.push({ text: String(f.t == null ? '' : f.t), hidden: (f.h === true) });
    } else {
      out.push({ text: String(f == null ? '' : f), hidden: false });
    }
  }
  return out;
}

function planVisibleFeatures(raw) {
  var items = planFeatureItems(raw);
  var out = [];
  for (var i = 0; i < items.length; i++) {
    if (!items[i].hidden && items[i].text.trim() !== '') out.push(items[i].text);
  }
  return out;
}

// planEditorState.edited.features is the source of truth; typing updates it in
// place (no re-render, so the caret is kept), add/remove re-render the rows.
function renderFeatureRows(arr) {
  var box = document.getElementById('planFeaturesList');
  if (!box) return;
  var items = planFeatureItems(arr);
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var last = (i === items.length - 1);
    html += '<div class="feature-row' + (it.hidden ? ' feature-row-hidden' : '') + '">' +
      '<div class="feature-row-move">' +
        '<button type="button" class="feature-row-btn" onclick="moveFeatureRow(' + i + ',-1)"' +
          (i === 0 ? ' disabled' : '') + ' title="تحريك للأعلى" aria-label="تحريك للأعلى">▲</button>' +
        '<button type="button" class="feature-row-btn" onclick="moveFeatureRow(' + i + ',1)"' +
          (last ? ' disabled' : '') + ' title="تحريك للأسفل" aria-label="تحريك للأسفل">▼</button>' +
      '</div>' +
      '<input type="text" class="feature-row-input" value="' + escapeHtml(it.text) + '" oninput="onFeatureRowInput(' + i + ', this.value)" autocomplete="off" placeholder="نص الميزة">' +
      '<button type="button" class="feature-row-btn feature-row-eye" onclick="toggleFeatureRow(' + i + ')" title="' +
        (it.hidden ? 'إظهار في بطاقة الأسعار' : 'إخفاء من بطاقة الأسعار (بدون حذف)') + '" aria-label="' +
        (it.hidden ? 'إظهار الميزة' : 'إخفاء الميزة') + '">' + (it.hidden ? '🚫' : '👁') + '</button>' +
      '<button type="button" class="feature-row-del" onclick="removeFeatureRow(' + i + ')" title="حذف الميزة" aria-label="حذف الميزة">✖</button>' +
    '</div>';
  }
  if (items.length === 0) {
    html = '<div class="feature-row-empty">— لا ميزات بعد. اضغط «➕ إضافة ميزة». —</div>';
  }
  box.innerHTML = html;
}

// Rewrites ed.features from a normalized {text,hidden} list, keeping the DB
// tidy: a visible feature goes back to a plain string, only a hidden one takes
// the object shape. Un-hiding therefore restores the legacy representation.
function writeFeatureItems(ed, items) {
  ed.features = items.map(function(it){
    return it.hidden ? { t: it.text, h: true } : it.text;
  });
}

// ── Migration 106: two columns, one for readers and one for the operator ────
// `features`     — VISIBLE rows only, plain strings, in order. Every client
//                  reads this one, including any browser still running an old
//                  cached bundle, so it must never contain anything but text.
// `features_all` — the operator's FULL ordered list (hidden rows included),
//                  read by this editor alone.
// Loading prefers features_all and falls back to features on a pre-migration
// DB. A literal '[object Object]' left behind by the stringify bug is dropped
// on sight so a corrupted row heals itself the next time it is opened.
function planEditorFeatureSource(row) {
  var raw = (row && Array.isArray(row.features_all)) ? row.features_all
          : ((row && Array.isArray(row.features)) ? row.features : []);
  var items = planFeatureItems(raw);
  var out = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].text === '[object Object]') continue; // corrupted row — heal
    out.push(items[i].hidden ? { t: items[i].text, h: true } : items[i].text);
  }
  return out;
}

// Seeds BOTH clones from the same working list so the dirty-diff starts
// neutral even when the DB row carries a visible-only `features` plus a fuller
// `features_all`. Called at every point the editor binds to a row.
function seedPlanEditorFeatures() {
  var work = planEditorFeatureSource(planEditorState.original);
  planEditorState.original.features = JSON.parse(JSON.stringify(work));
  planEditorState.edited.features   = JSON.parse(JSON.stringify(work));
}

// Visible projection written to the legacy `features` column.
function visibleFeaturesForSave(raw) {
  return planVisibleFeatures(raw).map(function(t){ return t.trim(); })
    .filter(function(t){ return t !== '' && t !== '[object Object]'; });
}

// Save-time tidy: trim every row, drop rows left completely empty (they would
// render as a blank bullet), and keep the compact representation — plain string
// for a visible feature, { t, h:true } only for a hidden one.
function cleanFeaturesForSave(raw) {
  var items = planFeatureItems(raw);
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var t = items[i].text.trim();
    if (t === '' || t === '[object Object]') continue;
    out.push(items[i].hidden ? { t: t, h: true } : t);
  }
  return out;
}

// Reorder by one step. Order in the array IS the display order on the pricing
// card, so this is the only control needed (no drag lib — works on touch).
function moveFeatureRow(i, dir) {
  var ed = planEditorState.edited;
  if (!ed) return;
  var items = planFeatureItems(ed.features);
  var j = i + dir;
  if (i < 0 || i >= items.length || j < 0 || j >= items.length) return;
  var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
  writeFeatureItems(ed, items);
  renderFeatureRows(ed.features);
  computePlanDirty();
  renderPlanPreview(ed);
  updatePlanDirtyUI();
}

// Hide/show a feature WITHOUT deleting it: the row stays in the editor, the
// public card stops rendering it. subscription.html shows the first six
// VISIBLE features, so hiding is also how the operator chooses which six.
function toggleFeatureRow(i) {
  var ed = planEditorState.edited;
  if (!ed) return;
  var items = planFeatureItems(ed.features);
  if (i < 0 || i >= items.length) return;
  items[i].hidden = !items[i].hidden;
  writeFeatureItems(ed, items);
  renderFeatureRows(ed.features);
  computePlanDirty();
  renderPlanPreview(ed);
  updatePlanDirtyUI();
}

function onFeatureRowInput(i, val) {
  var ed = planEditorState.edited;
  if (!ed || !Array.isArray(ed.features)) return;
  // In-place edit (no re-render → caret is preserved). The row's hidden flag
  // must survive typing, so we rewrite it in the same shape it already had.
  var cur = planFeatureItems(ed.features)[i];
  ed.features[i] = (cur && cur.hidden) ? { t: val, h: true } : val;
  computePlanDirty();
  renderPlanPreview(ed);
  updatePlanDirtyUI();
}

function addFeatureRow() {
  var ed = planEditorState.edited;
  if (!ed) return;
  if (!Array.isArray(ed.features)) ed.features = [];
  ed.features.push('');
  renderFeatureRows(ed.features);
  computePlanDirty();
  renderPlanPreview(ed);
  updatePlanDirtyUI();
  var box = document.getElementById('planFeaturesList');
  if (box) {
    var inputs = box.querySelectorAll('.feature-row-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }
}

function removeFeatureRow(i) {
  var ed = planEditorState.edited;
  if (!ed || !Array.isArray(ed.features)) return;
  ed.features.splice(i, 1);
  renderFeatureRows(ed.features);
  computePlanDirty();
  renderPlanPreview(ed);
  updatePlanDirtyUI();
}

function readEditorIntoState() {
  // Pull all field values into planEditorState.edited. Numeric fields are
  // parsed defensively: blank → null (unlimited for limits, falls into
  // validation for required ones); non-numeric → NaN → caught by validate.
  var ed = planEditorState.edited;
  if (!ed) return;
  ed.display_name  = (document.getElementById('planFldDisplayName').value || '').trim();
  var dur = document.getElementById('planFldDuration').value;
  ed.duration_days = dur === '' ? null : Number(dur);
  var prM = document.getElementById('planFldPriceMonthly').value;
  ed.price_monthly = prM === '' ? null : Number(prM);
  var prQ = document.getElementById('planFldPriceQuarterly').value; // Migration 104
  ed.price_quarterly = prQ === '' ? null : Number(prQ);
  var prY = document.getElementById('planFldPriceYearly').value;
  ed.price_yearly = prY === '' ? null : Number(prY);
  var prMU = document.getElementById('planFldPriceMonthlyUsd').value;   // Migration 105
  ed.price_monthly_usd = prMU === '' ? null : Number(prMU);
  var prQU = document.getElementById('planFldPriceQuarterlyUsd').value;
  ed.price_quarterly_usd = prQU === '' ? null : Number(prQU);
  var prYU = document.getElementById('planFldPriceYearlyUsd').value;
  ed.price_yearly_usd = prYU === '' ? null : Number(prYU);
  // Migration 105-fix: for a PAID tier, 0 is not a price — it means "this
  // (cycle × currency) point is not offered", exactly like NULL. Normalizing
  // here (not at save time) keeps the editor, the live preview, the audit diff
  // and the DB all telling the same story, and stops phantom zeros from being
  // written back. The trial tier legitimately carries 0 on all six points.
  if (ed.code !== 'trial') {
    ['price_monthly','price_quarterly','price_yearly',
     'price_monthly_usd','price_quarterly_usd','price_yearly_usd'].forEach(function(k){
      if (ed[k] != null && !isNaN(Number(ed[k])) && Number(ed[k]) === 0) ed[k] = null;
    });
  }
  // Keep the legacy single `price` synced to the monthly price (then quarterly,
  // then yearly) so any reader still on `price` degrades sensibly.
  ed.price = (ed.price_monthly != null) ? ed.price_monthly
           : (ed.price_quarterly != null) ? ed.price_quarterly
           : (ed.price_yearly != null) ? ed.price_yearly : 0;
  var srt = document.getElementById('planFldSort').value;
  ed.sort_order = srt === '' ? null : Number(srt);
  var me = document.getElementById('planFldMaxEmp').value;
  ed.max_employees = me === '' ? null : Number(me);
  var mp = document.getElementById('planFldMaxPat').value;
  ed.max_patients = mp === '' ? null : Number(mp);
  // Migration 132: blank ⇒ DELETE the key (server falls back to its default
  // cap) — never write null/NaN into the jsonb. Numeric parse is defensive;
  // validatePlanEdits rejects non-integers and values < 1.
  var _aic = document.getElementById('planFldAiCap');
  if (_aic) {
    if (!ed.entitlements || typeof ed.entitlements !== 'object') ed.entitlements = {};
    if (_aic.value === '') { delete ed.entitlements.ai_monthly_calls; }
    else { ed.entitlements.ai_monthly_calls = Number(_aic.value); }
  }
  // Phase X11: features are managed live in ed.features by the row handlers
  // (renderFeatureRows / onFeatureRowInput / add / removeFeatureRow), so there
  // is no textarea to read here. Empty rows are trimmed at save time.
  // Phase X11: display-layer fields (blank → null so the column stores NULL).
  ed.icon               = (document.getElementById('planFldIcon').value || '').trim() || null;
  ed.subtitle           = (document.getElementById('planFldSubtitle').value || '').trim() || null;
  ed.subtitle_quarterly = (document.getElementById('planFldSubtitleQuarterly').value || '').trim() || null; // Migration 104
  ed.subtitle_yearly    = (document.getElementById('planFldSubtitleYearly').value || '').trim() || null; // Migration 83
  ed.price_period_label = (document.getElementById('planFldPeriodLabel').value || '').trim() || null;
  ed.featured_label     = (document.getElementById('planFldFeaturedLabel').value || '').trim() || null;
  // is_active is mutated separately via onPlanToggleActive() — no read needed.
  // is_featured is mutated separately via onPlanToggleFeatured() — no read needed.
}

function onPlanFieldChange() {
  readEditorIntoState();
  computePlanDirty();
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
  // Phase A: live-reflect the typed name in the active tab label.
  var activeLbl = document.querySelector('#planTabsWrap .plan-tab.active .plan-tab-label');
  if (activeLbl && planEditorState.edited) {
    activeLbl.textContent = planEditorState.edited.display_name || planEditorState.selectedCode;
  }
  // Phase X11: live-reflect the typed icon in the active tab.
  var activeIco = document.querySelector('#planTabsWrap .plan-tab.active .plan-tab-icon');
  if (activeIco && planEditorState.edited && planEditorState.edited.icon !== undefined) {
    activeIco.textContent = planEditorState.edited.icon || '';
  }
}

function onPlanToggleActive() {
  if (!planEditorState.edited) return;
  planEditorState.edited.is_active = !planEditorState.edited.is_active;
  var sw = document.getElementById('planSwitchActive');
  if (sw) {
    sw.classList.toggle('on', !!planEditorState.edited.is_active);
    sw.setAttribute('aria-checked', planEditorState.edited.is_active ? 'true' : 'false');
  }
  computePlanDirty();
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
}

function onPlanToggleFeatured() {
  if (!planEditorState.edited) return;
  planEditorState.edited.is_featured = !planEditorState.edited.is_featured;
  var sw = document.getElementById('planSwitchFeatured');
  if (sw) {
    sw.classList.toggle('on', !!planEditorState.edited.is_featured);
    sw.setAttribute('aria-checked', planEditorState.edited.is_featured ? 'true' : 'false');
  }
  computePlanDirty();
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
}

function computePlanDirty() {
  var o = planEditorState.original;
  var e = planEditorState.edited;
  if (!o || !e) { planEditorState.isDirty = false; return; }
  // Compare each editable field. JSON.stringify on features handles arrays.
  var keys = ['display_name','duration_days','price','price_monthly','price_quarterly','price_yearly',
              'price_monthly_usd','price_quarterly_usd','price_yearly_usd','sort_order','max_employees','max_patients','is_active',
              'icon','subtitle','subtitle_quarterly','subtitle_yearly','price_period_label','is_featured','featured_label'];
  for (var i = 0; i < keys.length; i++) {
    var a = o[keys[i]]; var b = e[keys[i]];
    // Normalize null/undefined to null for comparison.
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (a !== b) { planEditorState.isDirty = true; return; }
  }
  if (JSON.stringify(o.features || []) !== JSON.stringify(e.features || [])) {
    planEditorState.isDirty = true; return;
  }
  if (JSON.stringify(o.entitlements || {}) !== JSON.stringify(e.entitlements || {})) {
    planEditorState.isDirty = true; return;
  }
  planEditorState.isDirty = false;
}

function updatePlanDirtyUI() {
  var saveBtn   = document.getElementById('btnSavePlan');
  var revertBtn = document.getElementById('btnRevertPlan');
  var dot       = document.getElementById('planDirtyIndicator');
  if (saveBtn)   saveBtn.disabled   = !planEditorState.isDirty;
  if (revertBtn) revertBtn.disabled = !planEditorState.isDirty;
  if (dot)       dot.style.display  = planEditorState.isDirty ? 'inline-block' : 'none';
}

function renderPlanPreview(p) {
  var box = document.getElementById('planPreviewCard');
  if (!box || !p) return;
  var inactive = !p.is_active
    ? '<div class="preview-inactive-badge">⏸️ موقوفة</div>'
    : '';
  var name = escapeHtml(p.display_name || '—');
  var iconStr = (p.icon && String(p.icon).trim()) ? (escapeHtml(p.icon) + ' ') : '';
  var priceNum = (p.price == null || isNaN(Number(p.price))) ? 0 : Number(p.price);
  var priceStr = priceNum.toLocaleString('en-US');
  var dur = (p.duration_days == null || isNaN(Number(p.duration_days))) ? '—' : String(p.duration_days);
  var curr = escapeHtml(p.currency || 'SYP');
  // Phase X13 + Migration 104: tri-cycle price preview (monthly + quarterly +
  // yearly, each with its own savings badge vs paying month-by-month).
  var _pmRaw = (p.price_monthly   == null || isNaN(Number(p.price_monthly)))   ? null : Number(p.price_monthly);
  var _pqRaw = (p.price_quarterly == null || isNaN(Number(p.price_quarterly))) ? null : Number(p.price_quarterly);
  var _pyRaw = (p.price_yearly    == null || isNaN(Number(p.price_yearly)))    ? null : Number(p.price_yearly);
  // Migration 105: USD points for the preview (each with its in-currency saving)
  var _pmU = (p.price_monthly_usd   == null || isNaN(Number(p.price_monthly_usd)))   ? null : Number(p.price_monthly_usd);
  var _pqU = (p.price_quarterly_usd == null || isNaN(Number(p.price_quarterly_usd))) ? null : Number(p.price_quarterly_usd);
  var _pyU = (p.price_yearly_usd    == null || isNaN(Number(p.price_yearly_usd)))    ? null : Number(p.price_yearly_usd);
  var priceHtml;
  if (p.code === 'trial') {
    priceHtml = '<div class="preview-card-price">مجاناً</div>';
  } else {
    var _pp = [];
    if (_pmRaw != null && _pmRaw > 0) {
      _pp.push('<div class="preview-card-price">' + _pmRaw.toLocaleString('en-US') +
               ' <span class="preview-card-currency">' + curr + ' / شهر</span></div>');
    }
    if (_pqRaw != null && _pqRaw > 0) {
      var _savQ = planCycleSavingsPct(p, 'quarterly');
      var _savQBadge = _savQ > 0 ? ' <span class="plan-savings">وفّر ~' + _savQ + '%</span>' : '';
      _pp.push('<div class="preview-card-price">' + _pqRaw.toLocaleString('en-US') +
               ' <span class="preview-card-currency">' + curr + ' / 3 أشهر</span>' + _savQBadge + '</div>');
    }
    if (_pyRaw != null && _pyRaw > 0) {
      var _sav = planAnnualSavingsPct(p);
      var _savBadge = _sav > 0 ? ' <span class="plan-savings">وفّر ~' + _sav + '%</span>' : '';
      _pp.push('<div class="preview-card-price">' + _pyRaw.toLocaleString('en-US') +
               ' <span class="preview-card-currency">' + curr + ' / سنة</span>' + _savBadge + '</div>');
    }
    if (_pmU != null && _pmU > 0) {
      _pp.push('<div class="preview-card-price">' + _pmU.toLocaleString('en-US') +
               ' <span class="preview-card-currency">$ / شهر</span></div>');
    }
    if (_pqU != null && _pqU > 0) {
      var _svQU = planCycleSavingsPct(p, 'quarterly', 'USD');
      _pp.push('<div class="preview-card-price">' + _pqU.toLocaleString('en-US') +
               ' <span class="preview-card-currency">$ / 3 أشهر</span>' +
               (_svQU > 0 ? ' <span class="plan-savings">وفّر ~' + _svQU + '%</span>' : '') + '</div>');
    }
    if (_pyU != null && _pyU > 0) {
      var _svYU = planCycleSavingsPct(p, 'yearly', 'USD');
      _pp.push('<div class="preview-card-price">' + _pyU.toLocaleString('en-US') +
               ' <span class="preview-card-currency">$ / سنة</span>' +
               (_svYU > 0 ? ' <span class="plan-savings">وفّر ~' + _svYU + '%</span>' : '') + '</div>');
    }
    if (!_pp.length) _pp.push('<div class="preview-card-price">—</div>');
    priceHtml = _pp.join('');
  }
  // Phase X11: display-layer overrides.
  var subtitleHtml = (p.subtitle && String(p.subtitle).trim())
    ? '<div class="preview-card-subtitle">' + escapeHtml(p.subtitle) + '</div>' : '';
  var periodLbl = (p.price_period_label && String(p.price_period_label).trim())
    ? escapeHtml(p.price_period_label) : ('لمدة ' + dur + ' يوم');
  var featuredHtml = p.is_featured
    ? '<div class="preview-card-featured">⭐ ' + escapeHtml(p.featured_label || 'الأكثر شعبية') + '</div>' : '';
  var limits = '';
  if (p.max_employees != null && !isNaN(Number(p.max_employees))) {
    limits += '<span class="preview-card-limit">👥 ' + (Number(p.max_employees) === 0 ? 'بلا موظفين إضافيين' : 'حتى ' + Number(p.max_employees) + ' موظف') + '</span>';
  } else {
    limits += '<span class="preview-card-limit">👥 موظفون بلا حدود</span>';
  }
  if (p.max_patients != null && !isNaN(Number(p.max_patients))) {
    limits += '<span class="preview-card-limit">🦷 حتى ' + Number(p.max_patients) + ' مريض</span>';
  } else {
    limits += '<span class="preview-card-limit">🦷 مرضى بلا حدود</span>';
  }
  // The preview must show exactly what the public card will render: VISIBLE
  // features only, in array order. Hidden rows stay in the editor, not here.
  var featsArr = planVisibleFeatures(p.features);
  var featsHtml = '';
  if (featsArr.length === 0) {
    featsHtml = '<li class="preview-features-empty">— لا ميزات مُعرّفة —</li>';
  } else {
    for (var i = 0; i < featsArr.length; i++) {
      featsHtml += '<li class="preview-feature">' + escapeHtml(String(featsArr[i])) + '</li>';
    }
  }
  // Phase B: summarize modules switched OFF on this plan.
  var entP = (p.entitlements && typeof p.entitlements === 'object') ? p.entitlements : {};
  var disabledNames = [];
  for (var dj = 0; dj < PLAN_ENTITLEMENT_DEFS.length; dj++) {
    if (entP[PLAN_ENTITLEMENT_DEFS[dj].key] === false) disabledNames.push(PLAN_ENTITLEMENT_DEFS[dj].label);
  }
  var disabledHtml = disabledNames.length
    ? '<div class="preview-card-disabled">🔒 محجوب على هذه الخطة: ' + disabledNames.map(escapeHtml).join('، ') + '</div>'
    : '';
  box.innerHTML =
    inactive + featuredHtml +
    '<div class="preview-card-name">' + iconStr + name + '</div>' +
    subtitleHtml +
    priceHtml +
    (p.code === 'trial' ? '<div class="preview-card-duration">' + periodLbl + '</div>' : '') +
    '<div class="preview-card-limits">' + limits + '</div>' +
    '<ul class="preview-features">' + featsHtml + '</ul>' +
    disabledHtml;
}

function validatePlanEdits(p) {
  // Rule #34 / enterprise mindset: thorough client-side validation. SQL
  // CHECK constraints from Migration 23 will catch some issues server-side
  // but the UX is much nicer when caught here with clear Arabic messages.
  if (!p) return { ok:false, error:'لا توجد بيانات لحفظها.' };
  if (!p.display_name || p.display_name.length < 1) {
    return { ok:false, error:'اسم العرض مطلوب.' };
  }
  if (p.display_name.length > 80) {
    return { ok:false, error:'اسم العرض طويل جداً (الحد الأقصى 80 حرف).' };
  }
  if (p.duration_days == null || isNaN(Number(p.duration_days)) || Number(p.duration_days) < 0) {
    return { ok:false, error:'المدة (يوم) يجب أن تكون رقماً ≥ 0.' };
  }
  if (Number(p.duration_days) > 3650) {
    return { ok:false, error:'المدة (يوم) كبيرة بشكل غير معقول (الحد الأقصى 3650 يوم = 10 سنوات).' };
  }
  if (p.price_monthly != null && (isNaN(Number(p.price_monthly)) || Number(p.price_monthly) < 0)) {
    return { ok:false, error:'السعر الشهري يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  if (p.price_quarterly != null && (isNaN(Number(p.price_quarterly)) || Number(p.price_quarterly) < 0)) {
    return { ok:false, error:'السعر الربعي يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  if (p.price_yearly != null && (isNaN(Number(p.price_yearly)) || Number(p.price_yearly) < 0)) {
    return { ok:false, error:'السعر السنوي يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  if (p.price_monthly_usd != null && (isNaN(Number(p.price_monthly_usd)) || Number(p.price_monthly_usd) < 0)) {
    return { ok:false, error:'الشهري بالدولار يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  if (p.price_quarterly_usd != null && (isNaN(Number(p.price_quarterly_usd)) || Number(p.price_quarterly_usd) < 0)) {
    return { ok:false, error:'الربعي بالدولار يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  if (p.price_yearly_usd != null && (isNaN(Number(p.price_yearly_usd)) || Number(p.price_yearly_usd) < 0)) {
    return { ok:false, error:'السنوي بالدولار يجب أن يكون رقماً ≥ 0 أو فارغاً.' };
  }
  // Migration 132: AI monthly cap — if present, must be a whole number ≥ 1.
  var _vEnt = (p.entitlements && typeof p.entitlements === 'object') ? p.entitlements : {};
  if (_vEnt.ai_monthly_calls !== undefined) {
    var _vCap = _vEnt.ai_monthly_calls;
    if (typeof _vCap !== 'number' || isNaN(_vCap) || _vCap < 1 || Math.floor(_vCap) !== _vCap) {
      return { ok:false, error:'سقف نداءات الذكاء الاصطناعي يجب أن يكون عدداً صحيحاً ≥ 1، أو اتركه فارغاً للافتراضي.' };
    }
  }
  // A paid tier must offer at least ONE (cycle × currency) point priced > 0
  // (trial is free on all). Migration 105: a USD-only tier is valid.
  if (p.code !== 'trial') {
    var _hasAny = ['price_monthly','price_quarterly','price_yearly',
                   'price_monthly_usd','price_quarterly_usd','price_yearly_usd']
      .some(function(k){ return p[k] != null && Number(p[k]) > 0; });
    if (!_hasAny) {
      return { ok:false, error:'يجب تحديد سعر واحد على الأقل (بأي دورة وبأي عملة) أكبر من صفر لهذه الخطة.' };
    }
  }
  if (p.sort_order == null || isNaN(Number(p.sort_order)) || Number(p.sort_order) < 1) {
    return { ok:false, error:'الترتيب يجب أن يكون رقماً ≥ 1.' };
  }
  if (p.max_employees != null && (isNaN(Number(p.max_employees)) || Number(p.max_employees) < 0)) {
    return { ok:false, error:'حد الموظفين يجب أن يكون رقماً ≥ 0 أو فارغاً (بلا حد).' };
  }
  if (p.max_patients != null && (isNaN(Number(p.max_patients)) || Number(p.max_patients) < 1)) {
    return { ok:false, error:'حد المرضى يجب أن يكون رقماً ≥ 1 أو فارغاً (بلا حد).' };
  }
  if (!Array.isArray(p.features) || p.features.length === 0) {
    return { ok:false, error:'يجب إضافة ميزة واحدة على الأقل.' };
  }
  // Items may be a plain string (visible) or { t, h:true } (hidden) — validate
  // the TEXT of either shape, and require at least one non-empty row.
  var _fItems = planFeatureItems(p.features);
  var _fNonEmpty = 0;
  for (var i = 0; i < _fItems.length; i++) {
    if (_fItems[i].text.length > 200) {
      return { ok:false, error:'كل ميزة يجب أن تكون نصاً طوله ≤ 200 حرف.' };
    }
    if (_fItems[i].text.trim() !== '') _fNonEmpty++;
  }
  if (_fNonEmpty === 0) {
    return { ok:false, error:'يجب إضافة ميزة واحدة غير فارغة على الأقل.' };
  }
  // Phase X11: display-layer fields (all optional; only cap length).
  if (p.icon != null && String(p.icon).length > 8) {
    return { ok:false, error:'الأيقونة طويلة جداً (إيموجي واحد يكفي — الحد الأقصى 8 محارف).' };
  }
  if (p.subtitle != null && String(p.subtitle).length > 200) {
    return { ok:false, error:'العبارة التعريفية طويلة جداً (الحد الأقصى 200 حرف).' };
  }
  if (p.price_period_label != null && String(p.price_period_label).length > 40) {
    return { ok:false, error:'تسمية الفترة طويلة جداً (الحد الأقصى 40 حرف).' };
  }
  if (p.featured_label != null && String(p.featured_label).length > 40) {
    return { ok:false, error:'تسمية شارة الإبراز طويلة جداً (الحد الأقصى 40 حرف).' };
  }
  return { ok:true, error:null };
}

function buildPlanDiff(orig, edited) {
  // Compact JSON diff of changed scalar fields + features-changed flag.
  // Used in the audit log notes so the events viewer can render a clean
  // "Price: 200000 → 250000" delta without parsing two full rows.
  if (!orig || !edited) return {};
  var diff = {};
  var keys = ['display_name','duration_days','price','price_monthly','price_quarterly','price_yearly',
              'price_monthly_usd','price_quarterly_usd','price_yearly_usd','sort_order','max_employees','max_patients','is_active',
              'icon','subtitle','subtitle_quarterly','subtitle_yearly','price_period_label','is_featured','featured_label'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var a = orig[k]; var b = edited[k];
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (a !== b) diff[k] = { from:a, to:b };
  }
  var oFeat = Array.isArray(orig.features)   ? orig.features   : [];
  var eFeat = Array.isArray(edited.features) ? edited.features : [];
  if (JSON.stringify(oFeat) !== JSON.stringify(eFeat)) {
    // Count hidden rows on both sides so the log distinguishes a delete from a
    // hide, and a reorder (same counts, changed:true) from either.
    var _oHid = planFeatureItems(oFeat).filter(function(x){ return x.hidden; }).length;
    var _eHid = planFeatureItems(eFeat).filter(function(x){ return x.hidden; }).length;
    diff.features = { from_count:oFeat.length, to_count:eFeat.length,
                      from_hidden:_oHid, to_hidden:_eHid, changed:true };
  }
  var oEnt = (orig.entitlements && typeof orig.entitlements === 'object') ? orig.entitlements : {};
  var eEnt = (edited.entitlements && typeof edited.entitlements === 'object') ? edited.entitlements : {};
  if (JSON.stringify(oEnt) !== JSON.stringify(eEnt)) {
    // Record which modules were turned on/off (clean change log, Stripe events style).
    var turnedOff = [], turnedOn = [];
    for (var ek = 0; ek < PLAN_ENTITLEMENT_DEFS.length; ek++) {
      var k = PLAN_ENTITLEMENT_DEFS[ek].key;
      var was = (oEnt[k] === false) ? false : true;
      var now = (eEnt[k] === false) ? false : true;
      if (was && !now) turnedOff.push(k);
      else if (!was && now) turnedOn.push(k);
    }
    diff.entitlements = { enabled:turnedOn, disabled:turnedOff };
    // Migration 132: surface the AI cap delta in the audit trail.
    var _oCap = (typeof oEnt.ai_monthly_calls === 'number') ? oEnt.ai_monthly_calls : null;
    var _eCap = (typeof eEnt.ai_monthly_calls === 'number') ? eEnt.ai_monthly_calls : null;
    if (_oCap !== _eCap) diff.entitlements.ai_cap = { from:_oCap, to:_eCap };
  }
  return diff;
}

async function revertPlanEdits(silent) {
  if (!planEditorState.original) return;
  if (!silent) {
    if (!planEditorState.isDirty) return;
    if (!await SyDialog.confirm({ message: 'إلغاء كل التعديلات على خطة "' + (planEditorState.edited && planEditorState.edited.display_name || planEditorState.selectedCode) + '"؟', danger: true })) return;
  }
  planEditorState.edited  = JSON.parse(JSON.stringify(planEditorState.original));
  planEditorState.isDirty = false;
  renderPlanEditorFields(planEditorState.edited);
  renderPlanPreview(planEditorState.edited);
  updatePlanDirtyUI();
  refreshPlanTabLabels(); // Phase A: restore label after revert
}

async function savePlanEdits() {
  if (!planEditorState.isDirty || !planEditorState.edited || !planEditorState.original) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }

  // Pull fresh values one more time defensively (in case a paste event
  // didn't fire the oninput handler in some browser).
  readEditorIntoState();
  computePlanDirty();
  if (!planEditorState.isDirty) {
    SyDialog.alert('لا توجد تعديلات للحفظ.');
    updatePlanDirtyUI();
    return;
  }

  var p = planEditorState.edited;
  var o = planEditorState.original;
  // Phase X11: drop blank/whitespace feature rows before validation + save.
  // MUST go through the normalizer: a blanket String(s) on a hidden item
  // ({t,h:true}) stringifies it to the literal '[object Object]', which then
  // saves and renders as a real feature line. That is exactly what happened
  // once — never re-introduce a raw String() over this array.
  if (Array.isArray(p.features)) {
    p.features = cleanFeaturesForSave(p.features);
    renderFeatureRows(p.features);
  }
  var v = validatePlanEdits(p);
  if (!v.ok) { SyDialog.alert('⚠️ ' + v.error); return; }

  var diff = buildPlanDiff(o, p);
  if (!diff || Object.keys(diff).length === 0) {
    // Defensive — shouldn't happen since isDirty was true, but guard anyway.
    SyDialog.alert('لا توجد تعديلات للحفظ.');
    return;
  }

  // Extra confirm for deactivation (destructive-ish — affects new signups).
  if (o.is_active === true && p.is_active === false) {
    if (!await SyDialog.confirm({ message: '⚠️ تعطيل خطة "' + p.display_name + '" سيمنع المشتركين الجدد من اختيارها. الاشتراكات الحالية على هذه الخطة لن تتأثر.\n\nمتابعة؟', danger: true })) {
      return;
    }
  }
  // Standard save confirm. Translate field codes to Arabic labels for UX.
  var labelMap = {
    display_name:'الاسم',
    duration_days:'المدة',
    price:'السعر',
    price_monthly:'السعر الشهري',
    price_quarterly:'السعر الربعي',
    price_yearly:'السعر السنوي',
    price_monthly_usd:'الشهري بالدولار',
    price_quarterly_usd:'الربعي بالدولار',
    price_yearly_usd:'السنوي بالدولار',
    sort_order:'الترتيب',
    max_employees:'حد الموظفين',
    max_patients:'حد المرضى',
    is_active:'حالة التفعيل',
    features:'الميزات',
    entitlements:'الموديولات',
    icon:'الأيقونة',
    subtitle:'العبارة التعريفية',
    subtitle_quarterly:'العبارة التعريفية (ربع سنوي)',
    subtitle_yearly:'العبارة التعريفية (سنوي)',
    price_period_label:'تسمية الفترة',
    is_featured:'الأكثر شعبية',
    featured_label:'تسمية الإبراز'
  };
  var changedKeys = Object.keys(diff);
  var changedArabic = changedKeys.map(function(k){ return labelMap[k] || k; });
  var summaryLine = changedArabic.length + ' حقل مُعدّل: ' + changedArabic.join('، ');
  if (!await SyDialog.confirm({ message: 'حفظ التعديلات على خطة "' + p.display_name + '"؟\n\n' + summaryLine })) {
    return;
  }

  var saveBtn = document.getElementById('btnSavePlan');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...'; }

  try {
    // UPDATE: send only the editable fields, never the primary key or
    // server-managed timestamps. updated_at is touched by a trigger.
    var updatePayload = {
      display_name:  p.display_name,
      duration_days: Number(p.duration_days),
      price:         Number(p.price),
      sort_order:    Number(p.sort_order),
      max_employees: (p.max_employees == null ? null : Number(p.max_employees)),
      max_patients:  (p.max_patients == null ? null : Number(p.max_patients)),
      // Migration 106: the legacy column carries the VISIBLE rows only, as plain
      // strings — so a browser on an older cached bundle still renders it
      // correctly and can never print '[object Object]'.
      features:      visibleFeaturesForSave(p.features),
      is_active:     !!p.is_active
    };
    // Phase X13: per-cycle prices. Guard with the price_monthly sentinel — post-
    // Migration 46 the columns exist; pre-migration o.price_monthly is undefined
    // → omit them so the legacy `price` edit still saves cleanly on an un-migrated DB.
    if (o.price_monthly !== undefined) {
      updatePayload.price_monthly = (p.price_monthly == null || isNaN(Number(p.price_monthly))) ? null : Number(p.price_monthly);
      updatePayload.price_yearly  = (p.price_yearly  == null || isNaN(Number(p.price_yearly)))  ? null : Number(p.price_yearly);
    } else if (diff.price_monthly || diff.price_yearly) {
      SyDialog.alert('⚠️ السعر الشهري/السنوي لن يُحفظ — أعمدته غير موجودة بعد في قاعدة البيانات.\n\nشغّل Migration 46 في Supabase ثم أعد المحاولة.\n\n(الاسم وبقية الحقول الأساسية ستُحفظ الآن.)');
    }
    // Resilience: only send entitlements if the loaded row actually had the
    // column (i.e. Migration 35 ran). Pre-migration, o.entitlements is
    // undefined → we omit it so name/price/etc. edits still save cleanly.
    if (o.entitlements !== undefined) {
      updatePayload.entitlements = (p.entitlements && typeof p.entitlements === 'object') ? p.entitlements : {};
    }
    // Phase X11: display-layer columns. Guard with the is_featured sentinel —
    // post-Migration 37 the column is always present (NOT NULL default false),
    // pre-migration o.is_featured is undefined → omit ALL display fields so
    // name/price/etc. edits still save cleanly on an un-migrated DB.
    if (o.is_featured !== undefined) {
      updatePayload.subtitle           = (p.subtitle == null || p.subtitle === '') ? null : String(p.subtitle);
      updatePayload.price_period_label = (p.price_period_label == null || p.price_period_label === '') ? null : String(p.price_period_label);
      updatePayload.is_featured        = !!p.is_featured;
      updatePayload.featured_label     = (p.featured_label == null || p.featured_label === '') ? null : String(p.featured_label);
    } else if (diff.subtitle || diff.price_period_label || diff.is_featured || diff.featured_label) {
      // Migration 37 not applied yet → those columns don't exist, so the block
      // above is skipped. Surface this instead of silently dropping the edit
      // (the owner hit exactly this: "saved" but the subtitle reverts).
      SyDialog.alert('⚠️ حقول العرض (العبارة التعريفية / تسمية الفترة / الأكثر شعبية / تسمية الإبراز) لن تُحفظ — أعمدتها غير موجودة بعد في قاعدة البيانات.\n\nشغّل Migration 37 في Supabase ثم أعد المحاولة.\n\n(الحقول الأساسية كالاسم والسعر ستُحفظ الآن عادةً.)');
    }
    // icon ships from Migration 38 (separate from the 37 batch) — guard with
    // its own sentinel so name/price edits still save if 38 hasn't run yet.
    if (o.icon !== undefined) {
      updatePayload.icon = (p.icon == null || p.icon === '') ? null : String(p.icon);
    }
    // subtitle_yearly ships from Migration 83 — own sentinel, same pattern.
    if (o.subtitle_yearly !== undefined) {
      updatePayload.subtitle_yearly = (p.subtitle_yearly == null || p.subtitle_yearly === '') ? null : String(p.subtitle_yearly);
    } else if (diff.subtitle_yearly) {
      SyDialog.alert('⚠️ «العبارة التعريفية (سنوي)» لن تُحفظ — عمودها غير موجود بعد في قاعدة البيانات.\n\nشغّل Migration 83 في Supabase ثم أعد المحاولة.\n\n(بقية الحقول ستُحفظ الآن عادةً.)');
    }
    // price_quarterly ships from Migration 104 — own sentinel (NOT folded into
    // the Migration 46 price_monthly guard: a DB with 46 applied but not 104
    // has price_monthly defined and price_quarterly undefined, so sharing the
    // guard would send a non-existent column and fail the whole UPDATE).
    if (o.price_quarterly !== undefined) {
      updatePayload.price_quarterly = (p.price_quarterly == null || isNaN(Number(p.price_quarterly))) ? null : Number(p.price_quarterly);
    } else if (diff.price_quarterly) {
      SyDialog.alert('⚠️ «السعر الربعي» لن يُحفظ — عموده غير موجود بعد في قاعدة البيانات.\n\nشغّل Migration 104 في Supabase ثم أعد المحاولة.\n\n(بقية الحقول ستُحفظ الآن عادةً.)');
    }
    // features_all ships from Migration 106 — own sentinel. Pre-migration the
    // column is undefined on the loaded row: we then save the visible list only
    // and warn, because a hidden row has nowhere to persist.
    if (o.features_all !== undefined) {
      updatePayload.features_all = cleanFeaturesForSave(p.features);
    } else if (planFeatureItems(p.features).some(function(x){ return x.hidden; })) {
      SyDialog.alert('⚠️ الميزات المخفية لن تُحفظ — عمودها غير موجود بعد في قاعدة البيانات.\n\nشغّل Migration 106 في Supabase ثم أعد المحاولة.\n\n(الميزات الظاهرة وبقية الحقول ستُحفظ الآن عادةً.)');
    }
    // USD price trio ships from Migration 105 — one shared sentinel for the
    // three columns (they land together), independent from the 46/104 guards.
    if (o.price_monthly_usd !== undefined) {
      updatePayload.price_monthly_usd   = (p.price_monthly_usd   == null || isNaN(Number(p.price_monthly_usd)))   ? null : Number(p.price_monthly_usd);
      updatePayload.price_quarterly_usd = (p.price_quarterly_usd == null || isNaN(Number(p.price_quarterly_usd))) ? null : Number(p.price_quarterly_usd);
      updatePayload.price_yearly_usd    = (p.price_yearly_usd    == null || isNaN(Number(p.price_yearly_usd)))    ? null : Number(p.price_yearly_usd);
    } else if (diff.price_monthly_usd || diff.price_quarterly_usd || diff.price_yearly_usd) {
      SyDialog.alert('⚠️ أسعار الدولار لن تُحفظ — أعمدتها غير موجودة بعد في قاعدة البيانات.\n\nشغّل Migration 105 في Supabase ثم أعد المحاولة.\n\n(بقية الحقول ستُحفظ الآن عادةً.)');
    }
    // subtitle_quarterly ships from Migration 104 — own sentinel, same pattern.
    if (o.subtitle_quarterly !== undefined) {
      updatePayload.subtitle_quarterly = (p.subtitle_quarterly == null || p.subtitle_quarterly === '') ? null : String(p.subtitle_quarterly);
    } else if (diff.subtitle_quarterly) {
      SyDialog.alert('⚠️ «العبارة التعريفية (ربع سنوي)» لن تُحفظ — عمودها غير موجود بعد في قاعدة البيانات.\n\nشغّل Migration 104 في Supabase ثم أعد المحاولة.\n\n(بقية الحقول ستُحفظ الآن عادةً.)');
    }
    // updated_by — write the admin's email if available, falling back to a
    // generic marker. Matches the performed_by convention in subscription_events.
    try {
      var sess = await window.sb.auth.getSession();
      if (sess && sess.data && sess.data.session && sess.data.session.user) {
        updatePayload.updated_by = sess.data.session.user.email || 'admin';
      }
    } catch(e) { /* best-effort; column has a default or is nullable */ }

    // Optimistic concurrency check (Rule #34 — enterprise mindset):
    // Re-fetch the row's updated_at and verify it matches what we loaded
    // into planEditorState.original. If another admin (or this admin in
    // another tab) wrote to the row between our open and our save, we
    // abort with a clear message rather than silently overwriting.
    if (o.updated_at) {
      try {
        var check = await window.sb.from('subscription_plans')
          .select('updated_at,updated_by')
          .eq('code', o.code)
          .maybeSingle();
        if (check && check.data && check.data.updated_at && check.data.updated_at !== o.updated_at) {
          var whoLine = check.data.updated_by ? ('\n\nآخر تعديل بواسطة: ' + check.data.updated_by) : '';
          SyDialog.alert('⚠️ تم تعديل هذه الخطة من جلسة أخرى منذ فتحك للمحرّر.' + whoLine +
                '\n\nسيتم إعادة تحميل أحدث نسخة لتجنّب الكتابة فوق تعديلات الآخرين. راجع التغييرات ثم احفظ من جديد.');
          await loadPlanConfig();
          var stale = getPlanConfig(o.code);
          if (stale) {
            planEditorState.original = JSON.parse(JSON.stringify(stale));
            planEditorState.edited   = JSON.parse(JSON.stringify(stale));
            seedPlanEditorFeatures(); // Migration 106
            planEditorState.isDirty  = false;
            renderPlanEditorFields(planEditorState.edited);
            renderPlanPreview(planEditorState.edited);
            updatePlanDirtyUI();
          }
          return;
        }
      } catch(e) {
        console.warn('savePlanEdits: optimistic check failed (proceeding):', e);
        // Non-fatal — we'd rather risk a rare overwrite than block all saves
        // when the network is flaky. The audit log preserves history either way.
      }
    }

    var upd = await window.sb.from('subscription_plans')
      .update(updatePayload)
      .eq('code', o.code)
      .select()
      .maybeSingle();

    if (upd.error) {
      console.error('savePlanEdits: update error', upd.error);
      SyDialog.alert('❌ فشل الحفظ: ' + (upd.error.message || 'خطأ غير معروف'));
      return;
    }
    // Silent-failure guard (Rule from Phase X3): update().maybeSingle() returns
    // data:null with NO error when the UPDATE matched 0 rows — almost always an
    // RLS write denial (the session isn't recognized as a platform admin).
    // Without this check the code would falsely report "✅ تم الحفظ".
    if (!upd.data) {
      console.warn('savePlanEdits: update affected 0 rows (RLS write denial?)', { code:o.code, upd:upd });
      SyDialog.alert('❌ لم يُحفظ أي تعديل (0 صفوف تأثّرت).\n\nالسبب الأرجح: صلاحيات الكتابة (RLS) — جلستك غير معترَف بها كمسؤول منصّة للكتابة.\n\nجرّب: تسجيل خروج ثم دخول من جديد. إذا استمرّت المشكلة أبلغني لأتحقق من جدول platform_admins.');
      return;
    }

    // Phase X11: single-featured invariant. If this plan was just set as the
    // highlighted ("الأكثر شعبية") one, clear the flag on every OTHER plan so
    // exactly one card is ever highlighted on the public pricing page.
    // Best-effort: the primary save already succeeded; a failure here only
    // means a second card stays highlighted until the next save (cosmetic).
    if (o.is_featured !== undefined && p.is_featured === true) {
      try {
        await window.sb.from('subscription_plans')
          .update({ is_featured: false })
          .neq('code', o.code)
          .eq('is_featured', true);
      } catch(e) {
        console.warn('savePlanEdits: clear-other-featured failed (non-fatal):', e);
      }
    }

    // Audit event (best-effort — DB write already succeeded).
    // trial_request_id + user_id are null because this event mutates the
    // plan catalog, not a specific tenant subscription.
    var notesObj = { plan_code:o.code, diff:diff };
    await logSubscriptionEvent({
      trial_request_id: null,
      user_id:          null,
      event_type:       'plan_updated',
      from_plan:        o.code,
      to_plan:          o.code,
      from_status:      null,
      to_status:        null,
      from_trial_end:   null,
      to_trial_end:     null,
      amount:           null,
      currency:         p.currency || o.currency || 'SYP',
      notes:            JSON.stringify(notesObj)
    });

    // Refresh the in-memory cache so subsequent admin operations (transitions,
    // pricing modals, etc.) immediately see the new values without a page
    // reload. This is the same cache loadAndRender / transitionAccount read.
    await loadPlanConfig();

    // Rebind editor state to the freshly-saved row (now the new "original").
    var fresh = getPlanConfig(o.code) || upd.data || updatePayload;
    fresh.code = o.code;
    fresh.currency = fresh.currency || o.currency || 'SYP';
    planEditorState.original = JSON.parse(JSON.stringify(fresh));
    planEditorState.edited   = JSON.parse(JSON.stringify(fresh));
    seedPlanEditorFeatures(); // Migration 106
    planEditorState.isDirty  = false;
    renderPlanEditorFields(planEditorState.edited);
    renderPlanPreview(planEditorState.edited);
    updatePlanDirtyUI();
    refreshPlanTabLabels(); // Phase A: tab strip reflects the saved name

    SyDialog.alert('✅ تم حفظ تعديلات خطة "' + p.display_name + '".');
  } catch(e) {
    console.error('savePlanEdits exception:', e);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (e && e.message ? e.message : String(e)));
  } finally {
    if (saveBtn) { saveBtn.textContent = '💾 حفظ التغييرات'; updatePlanDirtyUI(); }
  }
}

// ============================================================================
// === End Phase X2 ===========================================================
// ============================================================================
