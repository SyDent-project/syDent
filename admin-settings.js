/* ═══════════════════════════════════════════════════════════════
   admin-settings.js — الحزام A4: ودجات القائمة + إعدادات المنصة + عرض SRQ
   (تفكيك admin — الاستخراج ١٥: خمس قصّات، ~1230 سطراً بايت-بايت)

   أ)  ودجات النشاط والتمديد وAI-override (عرض + setAiOverride)
   ب١+ب٢) إعدادات المنصة كاملة: الدعم · تعليمات الدفع · سعر الدولار ·
       معلومات المنصة · بريد/كلمة سر الأدمن · سجل تدقيق الإعدادات
   د١+د٢) طلبات الاشتراك: الحالة + التبديل + العرض القرائي فقط
   (قوالب العرض تُشير لـsrqApprove/applyAdjust بـonclick — استدعاءات
   runtime لتعريفات باقية inline، ليست تسرباً)

   يبقى inline عمداً (العزل المالي — سابقة A1): applyAdjust · آلة الحالة
   transitionAccount · دفتر المدفوعات كاملاً (PAY_METHOD_AR الـinline
   يعتمد على SRQ_METHOD_AR المنقول هنا — هذا الملف يُحمَّل قبل الكتلة
   فالاتجاه آمن) · srqApprove/srqReject · accept/reject/suspend…

   الحالة المشتركة العابرة (extendDaysByReq/extendModeByReq يقرؤها
   applyAdjust الـinline · PLATFORM_SETTINGS_CACHE وsupportPhoneVars
   يقرؤهما admin-wa.js وadmin-plans.js) — كلها runtime حصراً.
   صفر تنفيذ top-level (فحص عمود الصفر) وصفر مرايا.
   ═══════════════════════════════════════════════════════════════ */

// Relative time helper — Arabic short form, no future-time handling (we
// never expect future timestamps from auth.users.last_sign_in_at).
function timeSince(iso) {
  if (!iso) return 'لم يدخل بعد';
  var then = new Date(iso);
  if (isNaN(then.getTime())) return '—';
  var sec = (new Date() - then) / 1000;
  if (sec < 60)         return 'الآن';
  var min = sec / 60;
  if (min < 60)         return 'قبل ' + Math.floor(min) + ' دقيقة';
  var hr  = min / 60;
  if (hr < 24)          return 'قبل ' + Math.floor(hr)  + ' ساعة';
  var day = hr / 24;
  if (day < 30)         return 'قبل ' + Math.floor(day) + ' يوم';
  if (day < 365)        return 'قبل ' + Math.floor(day/30)  + ' شهر';
  return                       'قبل ' + Math.floor(day/365) + ' سنة';
}

// Effective "last seen" for a tenant = the NEWER of lastActivity (newest
// audit_log row — real work) and lastSignIn (fresh password sign-in — a
// login with zero actions yet still counts as presence). Returns epoch ms
// or null when neither exists. Single source of truth for every idle
// computation (health penalty + risk signals) so they can never disagree.
function lastSeenMs(act) {
  if (!act) return null;
  var tA = act.lastActivity ? new Date(act.lastActivity).getTime() : NaN;
  var tS = act.lastSignIn   ? new Date(act.lastSignIn).getTime()   : NaN;
  var tH = act.lastSeenAt   ? new Date(act.lastSeenAt).getTime()   : NaN;
  var best = Math.max(isFinite(tA) ? tA : -Infinity,
                      isFinite(tS) ? tS : -Infinity,
                      isFinite(tH) ? tH : -Infinity);
  return (best > 0 && isFinite(best)) ? best : null;
}

// Online = any signal (heartbeat / activity / sign-in) within the last
// 15 minutes. The heartbeat writes at most every 10 min, so 15 gives one
// full cycle of slack — a clinic with a page open can never flap offline.
var ONLINE_WINDOW_MS = 15 * 60 * 1000;
function isOnlineNow(act) {
  var seen = lastSeenMs(act);
  return seen !== null && (Date.now() - seen) < ONLINE_WINDOW_MS;
}

// Format a metric value: number, '—' for error, 'جارٍ التحميل...' while loading
function fmtMetric(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

// Lazy-fetch metrics for a tenant. Caches on success AND on partial error
// (graceful degradation: per-metric fetch failures become null → '—').
async function fetchActivityFor(userId, reqId) {
  if (!userId) {
    activityCache[reqId] = { loading: false, loaded: true, error: 'no_user_id',
                              patients: null, appointments: null, employees: null,
                              lastSignIn: null, lastActivity: null, lastSeenAt: null };
    return;
  }
  activityCache[reqId] = { loading: true, loaded: false, error: null,
                            patients: null, appointments: null, employees: null,
                            lastSignIn: null, lastActivity: null, lastSeenAt: null };
  renderList(); // show loader immediately

  // Phase E1: counts + last_sign_in now come from the admin-ops Edge Function
  // in ONE round-trip (was four separate service-key fetches). The function
  // performs the RLS-bypassing reads server-side; each field fails soft to
  // null exactly like before, so the UI degrades gracefully on any error.
  var _act = await callAdminFn('tenant_activity', { userId: userId });
  var _ad = (_act && _act.ok && _act.data && typeof _act.data === 'object') ? _act.data : {};

  activityCache[reqId] = {
    loading: false, loaded: true, error: null,
    patients:     (typeof _ad.patients     === 'number' ? _ad.patients     : null),
    appointments: (typeof _ad.appointments === 'number' ? _ad.appointments : null),
    employees:    (typeof _ad.employees    === 'number' ? _ad.employees    : null),
    lastSignIn:   (_ad.lastSignIn || null),
    // Newest audit_log row for the tenant (server-side). More truthful than
    // lastSignIn because refresh-token sessions keep last_sign_in_at frozen
    // for weeks while the clinic is actively working. null when the tenant
    // has no audit rows yet or an older edge-fn version is deployed.
    lastActivity: (_ad.lastActivity || null),
    // Presence heartbeat (Migration 82) — stamped ~every 10 min by
    // supabase-init.js while any tenant page is open. Covers pure
    // browsing that neither lastSignIn nor audit_log can see.
    lastSeenAt:   (_ad.lastSeenAt || null)
  };
  renderList();
}

function toggleActivity(reqId) {
  var r = allRequests.find(function(x){ return x.id === reqId; });
  if (!r) return;
  if (activityExpanded[reqId]) {
    // Collapse — keep cache for next expansion
    activityExpanded[reqId] = false;
    renderList();
    return;
  }
  activityExpanded[reqId] = true;
  if (!activityCache[reqId] || (!activityCache[reqId].loaded && !activityCache[reqId].loading)) {
    // No cache yet → fetch (handles the post-error retry too)
    fetchActivityFor(r.user_id, reqId);
  } else {
    renderList();
  }
}

// Render the activity panel HTML for a given request. Returns '' if collapsed.
function renderActivityPanel(reqId) {
  if (!activityExpanded[reqId]) return '';
  var c = activityCache[reqId];
  if (!c || c.loading) {
    return '<div class="activity-panel"><div class="activity-loading">⏳ جارٍ التحميل...</div></div>';
  }
  if (c.error === 'no_user_id') {
    return '<div class="activity-panel"><div class="activity-loading" style="color:var(--red);">⚠️ لا يوجد user_id مرتبط بهذا الحساب</div></div>';
  }
  // If ALL counts failed AND last_sign_in also failed → likely auth/network issue
  // Show a retry button instead of four dashes.
  var allFailed = (c.patients === null && c.appointments === null &&
                   c.employees === null && c.lastSignIn === null);
  if (allFailed) {
    return '<div class="activity-panel">' +
             '<div class="activity-loading" style="color:var(--red);">' +
               '⚠️ فشل جلب البيانات' +
             '</div>' +
             '<button class="btn-activity" style="margin-top:8px;" ' +
               'onclick="retryActivity(\'' + reqId + '\')">🔄 إعادة المحاولة</button>' +
           '</div>';
  }
  return (
    '<div class="activity-panel">' +
      '<div class="activity-row"><span>👥 المرضى:</span>     <b>' + fmtMetric(c.patients)     + '</b></div>' +
      '<div class="activity-row"><span>📅 المواعيد:</span>   <b>' + fmtMetric(c.appointments) + '</b></div>' +
      '<div class="activity-row"><span>👨‍⚕️ الموظفين النشطين:</span> <b>' + fmtMetric(c.employees) + '</b></div>' +
      (function(){
        var on = isOnlineNow(c);
        var seen = lastSeenMs(c);
        var txt = on ? '🟢 متصل الآن'
                     : (seen !== null ? '⚪ غير متصل · آخر ظهور ' + timeSince(new Date(seen).toISOString())
                                       : '⚪ غير متصل');
        return '<div class="activity-row"><span>📡 الحالة:</span>     <b style="color:' + (on ? 'var(--green, #22c55e)' : 'inherit') + ';">' + escapeHtml(txt) + '</b></div>';
      })() +
      '<div class="activity-row"><span>⚡ آخر نشاط:</span>   <b>' + escapeHtml(c.lastActivity ? timeSince(c.lastActivity) : 'لا نشاط مسجّل') + '</b></div>' +
      '<div class="activity-row"><span>🕐 آخر تسجيل دخول:</span>   <b>' + escapeHtml(timeSince(c.lastSignIn)) + '</b></div>' +
    '</div>'
  );
}

// Retry button — clears the cache entry and re-fetches.
// Guard against double-click: if already loading, do nothing.
function retryActivity(reqId) {
  var r = allRequests.find(function(x){ return x.id === reqId; });
  if (!r) return;
  var existing = activityCache[reqId];
  if (existing && existing.loading) return; // already retrying — ignore
  delete activityCache[reqId];
  fetchActivityFor(r.user_id, reqId);
}

// Clean up activityCache + activityExpanded + extendDaysByReq entries for
// requests that no longer exist in allRequests (e.g. after delete). Called
// from renderAll.
function pruneActivityCaches() {
  var liveIds = {};
  for (var i = 0; i < allRequests.length; i++) liveIds[allRequests[i].id] = true;
  for (var k in activityCache)    { if (!liveIds[k]) delete activityCache[k]; }
  for (var k2 in activityExpanded) { if (!liveIds[k2]) delete activityExpanded[k2]; }
  for (var k3 in extendDaysByReq) { if (!liveIds[k3]) delete extendDaysByReq[k3]; }
  for (var k4 in extendModeByReq) { if (!liveIds[k4]) delete extendModeByReq[k4]; }
}

// ===== Trial extension (custom-days counter + 30/60/90 presets) =====
// Per-tenant state for the in-card extension widget. Defaults to 30 days
// the first time the card is rendered. Persists in memory only — reload
// resets to 30.
var extendDaysByReq = {};

// ===== Phase 7.6C-S1.1: Trial Adjust (extend / shorten mode) =====
// Per-tenant mode state for the trial-adjust widget. 'extend' is the
// default (matches Phase 7.6B behavior so existing workflows are
// unchanged). 'shorten' is the new direction. Persists in memory only;
// reload resets to 'extend'. The mode and the day counter are kept in
// SEPARATE maps so switching mode preserves whatever number the user
// already typed — matching what most date-pickers do.
var extendModeByReq = {};

function getExtendMode(reqId) {
  if (!extendModeByReq[reqId]) extendModeByReq[reqId] = 'extend';
  return extendModeByReq[reqId];
}

// Switching mode only updates state + re-renders the widget. The day
// counter (extendDaysByReq) is intentionally preserved so an operator
// can type "5", then realize they meant to shorten, click "تقصير" and
// keep typing — they don't lose their input.
//
// IMPORTANT: same defensive sync as applyAdjust does. If the user typed
// a new number but didn't blur the input yet (so onExtendChange hasn't
// fired), the raw DOM value is the truth, not extendDaysByReq. We commit
// it to the state map FIRST, then re-render — otherwise the re-render
// would pull the stale state map value and the user's typed number
// would silently disappear.
function setExtendMode(reqId, mode) {
  if (mode !== 'extend' && mode !== 'shorten') return;
  if (extendModeByReq[reqId] === mode) return; // no-op for same mode
  var inp = document.getElementById('extDays-' + reqId);
  if (inp) {
    var raw = parseInt(inp.value, 10);
    if (!isNaN(raw)) extendDaysByReq[reqId] = raw;
  }
  extendModeByReq[reqId] = mode;
  // The widget now lives in the 360° drawer's "actions" tab (not the card
  // list), so re-render THAT to reflect the new mode (presets/labels/colors).
  // Falls back to a no-op if the drawer isn't showing this customer's actions.
  if (typeof c360State !== 'undefined' && c360State.requestId === reqId
      && c360State.activeTab === 'actions') {
    c360RenderTab('actions');
  }
}

function getExtendDays(reqId) {
  if (extendDaysByReq[reqId] == null) extendDaysByReq[reqId] = 30;
  return extendDaysByReq[reqId];
}

// Called by the number input's oninput on every keystroke. Stores the
// pending value but does NOT reflect it back into the input — that would
// prevent the user from clearing the field to type a new number. We only
// commit the parsed value to state; clamping happens on blur (onchange).
function onExtendInput(reqId, raw) {
  if (raw === '' || raw == null) return; // user mid-edit, do nothing
  var v = parseInt(raw, 10);
  if (isNaN(v)) return;
  // Update internal state but don't write back into the DOM mid-keystroke
  extendDaysByReq[reqId] = v;
}

// Called by the number input's onchange (i.e. on blur / commit). This is
// where we clamp out-of-range values and reflect the clamped result back
// into the input so the user sees what will actually be applied.
function onExtendChange(reqId, raw) {
  var v = parseInt(raw, 10);
  if (isNaN(v))  v = 30;
  if (v < 1)     v = 1;
  if (v > 365)   v = 365;
  extendDaysByReq[reqId] = v;
  var inp = document.getElementById('extDays-' + reqId);
  if (inp && String(v) !== inp.value) inp.value = String(v);
}

// Preset buttons (+30 / +60 / +90) just fill the input — they DON'T apply.
// User still presses the apply button to commit. This mirrors Stripe's
// trial-extension flow.
function setExtendDays(reqId, days) {
  extendDaysByReq[reqId] = days;
  var inp = document.getElementById('extDays-' + reqId);
  if (inp) inp.value = String(days);
}

// Render the per-card adjust widget. Only called when r.trial_end is set.
// Phase 7.6C-S1.1: now supports both 'extend' (default) and 'shorten' modes.
// The mode switcher sits at the top; presets and apply-button label/color
// reflect the current direction. The counter input is shared between modes
// — switching mode preserves the typed number.
// Phase X14 — wording accuracy: this widget edits `trial_end`, which is the
// universal expiry column for EVERY account, not just trials (renew and extend
// both write it, and showExt gates on `!!r.trial_end` alone). Labelling it
// "تجربة" on a paid Max subscription misleads the operator into thinking the
// control does not apply to paid accounts — it does. The subject word now
// follows the account's own plan, using the canonical trial test already used
// throughout this file: (r.plan || 'trial') === 'trial'.
function periodWord(r, withAl) {
  var isTrial = ((r && r.plan) || 'trial') === 'trial';
  if (isTrial) return withAl ? 'التجربة' : 'تجربة';
  return withAl ? 'الاشتراك' : 'اشتراك';
}

function periodWordById(reqId) {
  var r = allRequests.find(function(x){ return x.id === reqId; });
  return periodWord(r, true);
}

function renderExtensionWidget(reqId) {
  var days = getExtendDays(reqId);
  var mode = getExtendMode(reqId);
  var isShorten = (mode === 'shorten');

  // Mode-dependent labels and visual classes
  var widgetLabel = '⏰ تعديل ' + periodWordById(reqId) + ':';
  var applyLabel  = isShorten ? '💾 تقصير' : '💾 تمديد';
  var applyClass  = 'ext-apply' + (isShorten ? ' shorten' : '');
  var presetClass = 'ext-preset' + (isShorten ? ' shorten' : '');
  var presets     = isShorten ? [1, 7, 30] : [30, 60, 90];
  var presetSign  = isShorten ? '-' : '+';

  var extendBtnClass  = 'ext-mode-btn' + (!isShorten ? ' active extend'  : '');
  var shortenBtnClass = 'ext-mode-btn' + (isShorten  ? ' active shorten' : '');

  return (
    '<div class="extension-widget">' +
      '<div class="ext-mode-row">' +
        '<button type="button" class="' + extendBtnClass  + '" onclick="setExtendMode(\'' + reqId + '\', \'extend\')">➕ تمديد</button>' +
        '<button type="button" class="' + shortenBtnClass + '" onclick="setExtendMode(\'' + reqId + '\', \'shorten\')">➖ تقصير</button>' +
      '</div>' +
      '<div class="ext-row">' +
        '<span class="ext-label">' + widgetLabel + '</span>' +
        '<input type="number" id="extDays-' + reqId + '" class="ext-input" ' +
          'min="1" max="365" value="' + days + '" ' +
          'oninput="onExtendInput(\'' + reqId + '\', this.value)" ' +
          'onchange="onExtendChange(\'' + reqId + '\', this.value)">' +
        '<span class="ext-unit">يوم</span>' +
      '</div>' +
      '<div class="ext-row">' +
        '<button type="button" class="' + presetClass + '" onclick="setExtendDays(\'' + reqId + '\', ' + presets[0] + ')">' + presetSign + presets[0] + '</button>' +
        '<button type="button" class="' + presetClass + '" onclick="setExtendDays(\'' + reqId + '\', ' + presets[1] + ')">' + presetSign + presets[1] + '</button>' +
        '<button type="button" class="' + presetClass + '" onclick="setExtendDays(\'' + reqId + '\', ' + presets[2] + ')">' + presetSign + presets[2] + '</button>' +
        '<button type="button" class="' + applyClass + '" onclick="applyAdjust(\'' + reqId + '\')">' + applyLabel + '</button>' +
      '</div>' +
    '</div>'
  );
}

// ===== Migration 110 — per-account AI override (third gate layer) =====
// Gate layers, in order of evaluation:
//   (1) plan       — subscription_plans.entitlements.ai_features
//   (2) clinic     — clinic_settings.ai_features_enabled  ← NEVER overridable
//   (3) this one   — trial_requests.ai_override (admin, per account)
// Tri-state: null = follow the plan · true = force ON · false = force OFF.
// The write goes straight to trial_requests through the existing "Admin all
// access" RLS policy (is_platform_admin) — no admin-ops action, no extra
// deploy. Enforcement is server-side in the ai-assist Edge Function; this UI
// only records the operator's decision.
function aiOverrideLabel(v) {
  if (v === true)  return 'مفعّل دائماً';
  if (v === false) return 'مطفأ دائماً';
  return 'يتبع الخطة';
}

function renderAiOverrideWidget(reqId, cur) {
  var v = (cur === true) ? true : (cur === false ? false : null);
  function btn(val, cls, label) {
    var isActive = (v === val);
    var klass = 'aiov-btn' + (isActive ? ' active ' + cls : '');
    // The active option is inert — clicking the current state is a no-op.
    var onClick = isActive ? '' : ' onclick="setAiOverride(\'' + reqId + '\', ' + JSON.stringify(val) + ')"';
    return '<button type="button" class="' + klass + '"' + onClick + '>' + label + '</button>';
  }
  return (
    '<div class="aiov-widget">' +
      '<div class="aiov-row">' +
        btn(null,  'plan', '📋 يتبع الخطة') +
        btn(true,  'on',   '✅ مفعّل دائماً') +
        btn(false, 'off',  '⛔ مطفأ دائماً') +
      '</div>' +
      '<div class="aiov-hint">«مفعّل» يمنح الميزة حتى لو كانت خارج خطة الحساب، و«مطفأ» يسحبها حتى لو كانت ضمنها. ' +
      'في كل الحالات تبقى العيادة مضطرّة لتفعيل الموافقة من إعداداتها — الخصوصية غير قابلة للتجاوز.</div>' +
    '</div>'
  );
}

async function setAiOverride(reqId, val) {
  if (!reqId) return;
  var r = allRequests.find(function(x){ return x.id === reqId; });
  if (!r) { SyDialog.alert('لم يتم العثور على بيانات العميل.'); return; }

  var from = (r.ai_override === true) ? true : (r.ai_override === false ? false : null);
  var to   = (val === true) ? true : (val === false ? false : null);
  if (from === to) return;

  var who = (r.name || r.email || 'هذا الحساب');
  if (!await SyDialog.confirm({ message: 'تغيير حالة مساعد الذكاء الاصطناعي لـ«' + who + '»:\n' +
               aiOverrideLabel(from) + ' ← ' + aiOverrideLabel(to) + '\n\nمتابعة؟' })) return;

  var upd = await window.sb.from('trial_requests')
    .update({ ai_override: to }).eq('id', reqId);
  if (upd && upd.error) {
    SyDialog.alert('فشل الحفظ: ' + upd.error.message);
    return;
  }

  // Local state first so both the list and the drawer reflect the new value
  // without a full reload (same optimistic pattern as the lifecycle actions).
  r.ai_override = to;

  // Append-only audit — best-effort, never fatal (the state write succeeded).
  await logSubscriptionEvent({
    trial_request_id: reqId,
    user_id: r.user_id || null,
    event_type: 'ai_override_set',
    from_plan: r.plan || null,
    to_plan:   r.plan || null,
    notes: 'تجاوز الذكاء الاصطناعي: ' + aiOverrideLabel(from) + ' ← ' + aiOverrideLabel(to)
  });

  renderList();
  if (typeof c360State !== 'undefined' && c360State.requestId === reqId && c360State.activeTab === 'actions') {
    c360RenderTab('actions');
  }
}

/* ════════ ب١: إعدادات المنصة — التحميل والدعم والتدقيق ════════ */

var PLATFORM_SETTINGS_CACHE = { support_phone: '', support_email: '' };
var _saveSupportPhoneInFlight = false;

async function loadPlatformSettings() {
  try {
    if (!window.sb) return;
    var res = await window.sb.from('platform_settings').select('key, value');
    if (res.error) { console.warn('loadPlatformSettings: query error', res.error); return; }
    (res.data || []).forEach(function(r){
      PLATFORM_SETTINGS_CACHE[r.key] = (r.value == null) ? '' : String(r.value);
    });
    // Sync UI input if the editor section is already rendered.
    var inp = document.getElementById('fSupportPhone');
    if (inp && document.activeElement !== inp) {
      inp.value = PLATFORM_SETTINGS_CACHE.support_phone || '';
      // After (re)load, the input matches DB → save button disabled.
      var btn = document.getElementById('btnSaveSupport');
      if (btn) btn.disabled = true;
    }
    // Phase X11: rehydrate the new Section H inputs from the same cache.
    // Defined later in the file — call defensively in case ordering shifts.
    if (typeof hydratePsUI === 'function') hydratePsUI();
  } catch(e) { console.warn('loadPlatformSettings error:', e); }
}

// Dirty-detector: enables save button only when the typed value differs
// from the cached (saved) value. Mirrors the dirty-tracking pattern used
// by the template editor (computeTplDirty / updateTplDirtyUI).
function onSupportPhoneInput() {
  var inp = document.getElementById('fSupportPhone');
  var btn = document.getElementById('btnSaveSupport');
  if (!inp || !btn) return;
  var current = (PLATFORM_SETTINGS_CACHE.support_phone || '').trim();
  var typed   = (inp.value || '').trim();
  btn.disabled = (typed === current);
}

async function saveSupportPhone() {
  if (_saveSupportPhoneInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }
  var inp = document.getElementById('fSupportPhone');
  var btn = document.getElementById('btnSaveSupport');
  if (!inp) return;
  var val = (inp.value || '').trim();
  _saveSupportPhoneInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
  try {
    var payload = { key: 'support_phone', value: val };
    try {
      var sess = await window.sb.auth.getSession();
      if (sess && sess.data && sess.data.session && sess.data.session.user) {
        payload.updated_by = sess.data.session.user.email || 'admin';
      }
    } catch(_){}
    var res = await window.sb.from('platform_settings')
      .upsert(payload, { onConflict: 'key' })
      .select()
      .maybeSingle();
    if (res.error) {
      console.error('saveSupportPhone error:', res.error);
      SyDialog.alert('❌ فشل الحفظ: ' + (res.error.message || 'خطأ غير معروف'));
      return;
    }
    if (!res.data) {
      // RLS denial or missing seed — same maybeSingle() null pattern as saveTplEdits.
      SyDialog.alert('❌ لم يُحفَظ السطر — قد تكون الصلاحيات مرفوضة.\n\n' +
            'تحقّق من تشغيل Migration 33 وأن دورك "admin" في platform_admins.');
      return;
    }
    PLATFORM_SETTINGS_CACHE.support_phone = val;
    SyDialog.alert('✅ تم حفظ رقم الدعم الفني.');
  } catch(ex) {
    console.error('saveSupportPhone exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _saveSupportPhoneInFlight = false;
    if (btn) { btn.textContent = '💾 حفظ'; btn.disabled = true; }
  }
}

// supportPhoneVars() — returns a partial vars object to merge into the
// vars passed to renderTemplate. Empty support_phone → key omitted, and
// renderTemplate then DROPS the line carrying {support_phone} entirely
// (stripUnfilledSupport in admin-wa.js) so a tenant never receives a raw
// placeholder. Non-empty → { support_phone: '<value>' } so it substitutes
// normally. Single source of truth — every wa*Link helper calls this.
// Extended: support_email follows the identical contract (value managed
// in Section H → معلومات الدعم; empty → its line is dropped the same way).
function supportPhoneVars() {
  var out = {};
  var v = (PLATFORM_SETTINGS_CACHE.support_phone || '').trim();
  if (v) out.support_phone = v;
  var e = (PLATFORM_SETTINGS_CACHE.support_email || '').trim();
  if (e) out.support_email = e;
  return out;
}

// ============================================================================
// === Phase X11 — Platform Settings UI (Section H) ===========================
// ============================================================================
//
// Extends Phase X3 محادثة 3 (support_phone in PLATFORM_SETTINGS_CACHE) with:
//   - Additional config keys (support_email, platform_name, renewal_message)
//   - Self-service admin profile editor (email + password via Supabase Auth)
//   - Dedicated Section H in admin.html (vs. the legacy fSupportPhone input
//     embedded inside the templates editor — which remains functional)
//
// Architecture:
//   - Reuses loadPlatformSettings() (SELECT * already lands all keys).
//   - Each card has its own _saveInFlight flag (Golden Rule #66).
//   - Auth ops use window.sb.auth.updateUser() — NEVER SERVICE_KEY.
//     The admin updates their OWN credentials (Supabase allows this with
//     a regular authenticated session — same pattern as Microsoft's
//     "reset my password" self-service flow).
//   - Bulk upsert: when both support_phone and support_email are dirty,
//     a single round-trip writes both rows (atomic at the network layer;
//     not transactional in DB, but acceptable for non-critical settings).
//   - Cross-UI sync: when admin saves support_phone here, the legacy
//     fSupportPhone input in tpl-editor is rehydrated from the cache
//     (one-way push — no live two-way binding needed).
//
// Backward compat: the existing fSupportPhone input + saveSupportPhone()
// remain functional. Both UIs share PLATFORM_SETTINGS_CACHE as the cache,
// so saves from one location are observable in the other after a page
// reload (cross-input live-sync is intentionally NOT implemented to avoid
// focus-stealing during typing).
//
// Audit log NOT extended: would require event_type CHECK constraint
// expansion (Migration 33's commit explicitly deferred this). Settings
// changes are still observable via updated_at + updated_by columns.

// Per-field dirty tracking for the new UI section
var _psFieldDirty = {
  support_phone:    false,
  support_email:    false,
  platform_name:    false,
  renewal_message:  false,
  usd_report_rate:  false  // Migration 105
};
var _psSaveUsdRateInFlight = false; // Migration 105
var _psEmailDirty            = false;
var _psPasswordDirty         = false;
var _psSaveSupportInFlight   = false;
var _psSavePlatformInFlight  = false;
var _psSaveEmailInFlight     = false;
var _psSavePasswordInFlight  = false;

function psToggle() {
  var sec = document.getElementById('psSection');
  if (!sec) return;
  sec.classList.toggle('open');
  if (sec.classList.contains('open')) loadSettingsAudit();   // refresh the settings change-log on open
}

// ════════════════════════════════════════════════════════════════════════════
// === Settings audit (Migration 48) — append-only platform_settings change log ===
// Records who changed which platform_settings key, old→new value, when. Graceful
// if the table is missing (logs to console, never blocks the save). Does NOT log
// admin email/password (those go through Supabase Auth, not platform_settings).
// ════════════════════════════════════════════════════════════════════════════
var _isSettingsAuditTableMissing = false;
var _settingsAuditLoading = false;
var SETTINGS_KEY_AR = {
  payment_instructions_ar: 'تعليمات الدفع',
  usd_report_rate: 'سعر صرف التقارير (دولار)',
  support_phone: 'هاتف الدعم',
  support_email: 'إيميل الدعم',
  platform_name: 'اسم المنصّة',
  renewal_message: 'رسالة التجديد'
};

// Insert audit rows for CHANGED keys. rows = [{ key, value }]. Old value read from
// PLATFORM_SETTINGS_CACHE (call BEFORE updating the cache). Best-effort.
async function logSettingChanges(rows) {
  if (!window.sb || !Array.isArray(rows) || !rows.length || _isSettingsAuditTableMissing) return;
  var by = 'admin';
  try {
    var s = await window.sb.auth.getSession();
    if (s && s.data && s.data.session && s.data.session.user) by = s.data.session.user.email || 'admin';
  } catch (_) {}
  var audit = [];
  rows.forEach(function(r) {
    var oldVal = (PLATFORM_SETTINGS_CACHE && PLATFORM_SETTINGS_CACHE[r.key] != null) ? String(PLATFORM_SETTINGS_CACHE[r.key]) : '';
    var newVal = (r.value == null) ? '' : String(r.value);
    if (oldVal === newVal) return;   // unchanged → skip
    audit.push({ setting_key: r.key, old_value: oldVal, new_value: newVal, changed_by: by });
  });
  if (!audit.length) return;
  try {
    var res = await window.sb.from('platform_settings_audit').insert(audit);
    if (res.error) {
      if (/relation .* does not exist|platform_settings_audit/i.test(res.error.message || '')) _isSettingsAuditTableMissing = true;
      console.warn('logSettingChanges:', res.error);
    }
  } catch (e) { console.warn('logSettingChanges exception:', e); }
}

async function loadSettingsAudit() {
  var listEl = document.getElementById('psAuditList');
  if (!listEl || !window.sb || _settingsAuditLoading) return;
  if (_isSettingsAuditTableMissing) { listEl.innerHTML = '<div class="ps-audit-empty">⚠️ سجل التغييرات غير مفعّل (شغّل Migration 48).</div>'; return; }
  _settingsAuditLoading = true;
  listEl.innerHTML = '<div class="ps-audit-empty">⏳ جارٍ التحميل…</div>';
  try {
    var res = await window.sb.from('platform_settings_audit')
      .select('setting_key, old_value, new_value, changed_by, changed_at')
      .order('changed_at', { ascending: false }).limit(50);
    if (res.error) {
      if (/relation .* does not exist|platform_settings_audit/i.test(res.error.message || '')) _isSettingsAuditTableMissing = true;
      listEl.innerHTML = '<div class="ps-audit-empty">⚠️ تعذّر تحميل السجل' + (_isSettingsAuditTableMissing ? ' (شغّل Migration 48)' : '') + '.</div>';
      return;
    }
    renderSettingsAudit(res.data || []);
  } catch (e) {
    listEl.innerHTML = '<div class="ps-audit-empty">⚠️ تعذّر تحميل السجل.</div>';
  } finally { _settingsAuditLoading = false; }
}

function renderSettingsAudit(rows) {
  var listEl = document.getElementById('psAuditList');
  if (!listEl) return;
  if (!rows.length) { listEl.innerHTML = '<div class="ps-audit-empty">لا تغييرات مسجّلة بعد.</div>'; return; }
  listEl.innerHTML = rows.map(function(r) {
    var label = SETTINGS_KEY_AR[r.setting_key] || r.setting_key;
    var when = '';
    try { when = SyDT.numDate(r.changed_at) + ' ' + SyDT.time12(r.changed_at); } catch (_) { when = r.changed_at || ''; }   // v487
    var oldT = (r.old_value && String(r.old_value).length) ? escapeHtml(_truncAudit(r.old_value)) : '<span class="ps-audit-empty-val">(فارغ)</span>';
    var newT = (r.new_value && String(r.new_value).length) ? escapeHtml(_truncAudit(r.new_value)) : '<span class="ps-audit-empty-val">(فارغ)</span>';
    return '<div class="ps-audit-row">'
      +   '<div class="ps-audit-key">' + escapeHtml(label) + '</div>'
      +   '<div class="ps-audit-change">' + oldT + ' <span class="ps-audit-arrow">←</span> ' + newT + '</div>'
      +   '<div class="ps-audit-meta">' + escapeHtml(r.changed_by || '—') + ' · ' + escapeHtml(when) + '</div>'
      + '</div>';
  }).join('');
}
function _truncAudit(s) { s = String(s); return s.length > 80 ? s.slice(0, 80) + '…' : s; }

/* ════════ د١: طلبات الاشتراك — الحالة والتبديل ════════ */

// ===== Phase X12 — Subscription upgrade/renew requests queue =====
// Tenants submit requests from subscription.html (Migration 42). This queue
// shows PENDING requests; approving reuses the EXISTING transitionAccount
// machinery (same as the plan-picker modal) so the financial event lands in
// subscription_events exactly as a manual admin upgrade would.
var SRQ_CACHE = [];      // pending subscription_requests rows
var SRQ_TR_MAP = {};     // user_id -> trial_requests row (for transitionAccount)
var SRQ_TR_BY_ID = {};   // trial_requests.id -> row (fallback when user_id is null on legacy rows)
var _srqInFlight = false;
var SRQ_METHOD_AR = { sham_cash:'شام كاش', transfer:'حوالة داخلية', bank_card:'كرت بنك', cash:'كاش' };

function srqToggle() {
  var sec = document.getElementById('srqSection');
  if (sec) sec.classList.toggle('open');
}

/* ════════ د٢: طلبات الاشتراك — العرض القرائي ════════ */

function srqEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function srqPlanLabel(code) {
  return planDisplayName(code);
}

// Derive the real relationship by comparing plan prices (request_kind in the
// DB only distinguishes renew vs change; the precise up/down direction is
// computed here from the two stored plan codes so the label is always right).
// Phase X13: rank tiers by sort_order (the SAME canonical ordering the tenant
// subscription page uses), NOT by legacy `price`. A tier now carries two cycle
// prices, so price is no longer a single reliable cross-tier rank — and the
// admin/tenant relation labels must agree. Lower sort_order = lower tier.
function srqPlanSort(code) {
  try { var c = getPlanConfig(code); if (c && c.sort_order != null) return Number(c.sort_order) || 0; } catch(_) {}
  return 999;
}
function srqRelation(curCode, reqCode) {
  if (curCode === reqCode) return { label: 'تجديد', cls: 'renew' };
  var pc = srqPlanSort(curCode), pr = srqPlanSort(reqCode);
  if (pr > pc) return { label: 'ترقية', cls: '' };
  if (pr < pc) return { label: 'تنزيل', cls: 'down' };
  return { label: 'تغيير', cls: '' };
}

async function loadSubRequests() {
  var listEl = document.getElementById('srqList');
  if (!window.sb) return;
  try {
    var res = await window.sb.from('subscription_requests')
      .select('*').eq('status', 'pending').order('created_at', { ascending: true });
    if (res.error) throw res.error;
    SRQ_CACHE = res.data || [];
    SRQ_TR_MAP = {};
    SRQ_TR_BY_ID = {};
    var ids = SRQ_CACHE.map(function(r){ return r.user_id; }).filter(Boolean);
    if (ids.length) {
      var tr = await window.sb.from('trial_requests')
        .select('id, user_id, name, email, plan, status, trial_end, billing_cycle').in('user_id', ids);
      (tr.data || []).forEach(function(row){
        if (row.user_id) SRQ_TR_MAP[row.user_id] = row;
        if (row.id) SRQ_TR_BY_ID[row.id] = row;
      });
    }
    // Fallback: any request whose user_id didn't resolve (e.g. legacy row with
    // NULL trial_requests.user_id) — resolve by the stored trial_request_id.
    var missTrIds = SRQ_CACHE
      .filter(function(r){ return !SRQ_TR_MAP[r.user_id] && r.trial_request_id; })
      .map(function(r){ return r.trial_request_id; });
    if (missTrIds.length) {
      var tr2 = await window.sb.from('trial_requests')
        .select('id, user_id, name, email, plan, status, trial_end, billing_cycle').in('id', missTrIds);
      (tr2.data || []).forEach(function(row){ if (row.id) SRQ_TR_BY_ID[row.id] = row; });
    }
    renderSubRequests();
  } catch (e) {
    console.warn('loadSubRequests error:', e);
    if (listEl) listEl.innerHTML = '<div class="srq-empty">تعذّر تحميل الطلبات.</div>';
  }
}

function renderSubRequests() {
  var listEl = document.getElementById('srqList');
  var badge = document.getElementById('srqBadge');
  if (!listEl) return;
  var n = SRQ_CACHE.length;
  if (badge) {
    if (n > 0) { badge.textContent = n; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  }
  // Repaint the surfaces that read SRQ_CACHE but live in admin-render.js:
  // nav pill + tab title, and the overview «يحتاج انتباهك» card. Closes two
  // gaps (owner report 31 Aug 2026): (1) loadSubRequests() is not awaited
  // before loadAndRender(), so a late-arriving queue was missing from the
  // attention card until the next full render; (2) srqReject() never
  // re-rendered the overview, leaving a stale «معلّق» row after a rejection.
  if (typeof renderAdminBadges === 'function') renderAdminBadges();
  if (typeof renderOvAttention === 'function') renderOvAttention();
  if (!n) { listEl.innerHTML = '<div class="srq-empty">لا توجد طلبات قيد المراجعة.</div>'; return; }
  var html = '';
  SRQ_CACHE.forEach(function(req){
    var tr = SRQ_TR_MAP[req.user_id] || SRQ_TR_BY_ID[req.trial_request_id] || {};
    var who = tr.name || tr.email || '(مستأجر غير معروف)';
    var curCode = req.current_plan || (tr.plan || '');
    var rel = srqRelation(curCode, req.requested_plan);
    var reqCyc = cycleLabelArOrEmpty(req.billing_cycle);
    // كان `reqCur` يُستعمل أدناه بلا تصريح ⇒ ReferenceError يكسر رسمَ لوحة
    // الطلبات كاملةً عند أول طلبٍ معلَّق (لم ينفجر لأن كل الطلبات محسومة).
    // العمود الحيّ اسمه currency، وcurrencyLabelAr هي المُسمِّية المعتمدة.
    var reqCur = currencyLabelAr(req.currency);
    var when = req.created_at ? SyDT.numDate(req.created_at) + ' ' + SyDT.time12(req.created_at) : '';   // v487
    html += '<div class="srq-row">' +
      '<div class="srq-row-top">' +
        '<span class="srq-name">' + srqEsc(who) + '</span>' +
        '<span class="srq-kind' + (rel.cls ? ' ' + rel.cls : '') + '">' + srqEsc(rel.label) + '</span>' +
      '</div>' +
      '<div class="srq-meta">' +
        'الخطة الحالية: <b>' + srqEsc(srqPlanLabel(curCode)) + '</b><br>' +
        'الخطة المطلوبة: <b>' + srqEsc(srqPlanLabel(req.requested_plan)) + '</b><br>' +
        (reqCyc ? 'الدورة المطلوبة: <b>' + reqCyc + '</b><br>' : '') +
        'العملة المطلوبة: <b>' + srqEsc(reqCur) + '</b><br>' +
        'طريقة الدفع: <b>' + srqEsc(SRQ_METHOD_AR[req.payment_method] || req.payment_method) + '</b><br>' +
        (req.payment_ref ? 'رقم العملية: <b dir="ltr">' + srqEsc(req.payment_ref) + '</b><br>' : '') +   /* v566 (M167) */
        'التاريخ: ' + srqEsc(when) +
      '</div>' +
      (req.receipt_path ? '<div class="srq-receipt"><button class="srq-btn" onclick="srqViewReceipt(\'' + srqEsc(req.id) + '\')">🧾 عرض الإيصال</button></div>' : '') +
      (req.note ? '<div class="srq-note">📝 ' + srqEsc(req.note) + '</div>' : '') +
      '<div class="srq-actions">' +
        '<button class="srq-btn ok" onclick="srqApprove(\'' + srqEsc(req.id) + '\')">✅ موافقة وتفعيل</button>' +
        '<button class="srq-btn no" onclick="srqReject(\'' + srqEsc(req.id) + '\')">✖ رفض</button>' +
      '</div>' +
    '</div>';
  });
  listEl.innerHTML = html;
}

/* DeepCode #8 (v566 · M167): عرضُ إيصال شام كاش — الحاويةُ خاصة؛ رابطٌ موقَّع صالحٌ دقيقتين يُفتح بنافذةٍ جديدة
   (سياسةُ القراءة للمشرف بالقاعدة). يُفتح التبويبُ قبل الانتظار كي لا يحجبه المتصفح. */
async function srqViewReceipt(reqId) {
  var req = (SRQ_CACHE || []).find(function (r) { return r.id === reqId; });
  if (!req || !req.receipt_path || !window.sb) return;
  var win = window.open('', '_blank');
  try {
    var r = await window.sb.storage.from('payment-receipts').createSignedUrl(req.receipt_path, 120);
    if (r.error || !r.data || !r.data.signedUrl) throw (r.error || new Error('no url'));
    if (win) win.location.href = r.data.signedUrl; else window.open(r.data.signedUrl, '_blank', 'noopener');
  } catch (e) {
    if (win) win.close();
    SyDialog.alert('❌ تعذّر فتح الإيصال: ' + (e && e.message ? e.message : String(e)));
  }
}

/* ════════ ب٢: إعدادات المنصة — مسارات الحفظ ════════ */

// Phase X12 — save tenant-visible payment instructions (platform_settings).
// Self-contained (no dirty-tracking framework) — save button always enabled.
var _savePaymentInFlight = false;
async function savePsPaymentInstructions() {
  if (_savePaymentInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }
  var ta = document.getElementById('psPaymentInstructions');
  var btn = document.getElementById('btnPsSavePayment');
  if (!ta) return;
  var val = ta.value || '';
  _savePaymentInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
  try {
    var payload = { key:'payment_instructions_ar', value: val };
    /* v566 (M167): رقمُ حساب شام كاش يُحفظ مع تعليمات الدفع (البطاقة نفسها) */
    var _accEl = document.getElementById('psShamcashAccount');
    var _acc = _accEl ? String(_accEl.value || '').trim().slice(0, 64) : null;
    try {
      var s = await window.sb.auth.getSession();
      if (s && s.data && s.data.session && s.data.session.user) payload.updated_by = s.data.session.user.email || 'admin';
    } catch(_) {}
    var res = await window.sb.from('platform_settings').upsert(payload, { onConflict:'key' }).select().maybeSingle();
    if (res.error) { console.error('savePsPaymentInstructions:', res.error); SyDialog.alert('❌ فشل الحفظ: ' + (res.error.message || '')); return; }
    if (!res.data) { SyDialog.alert('❌ لم يُحفَظ — قد تكون الصلاحيات مرفوضة.\nتأكّد من تشغيل Migration 42 وأن دورك admin.'); return; }
    var _logs = [{ key: 'payment_instructions_ar', value: val }];
    if (_acc !== null && _acc !== String(PLATFORM_SETTINGS_CACHE.shamcash_account || '')) {
      var _accPayload = { key: 'shamcash_account', value: _acc };
      if (payload.updated_by) _accPayload.updated_by = payload.updated_by;
      var r2 = await window.sb.from('platform_settings').upsert(_accPayload, { onConflict: 'key' }).select().maybeSingle();
      if (r2.error || !r2.data) { SyDialog.alert('❌ حُفظت التعليمات ولم يُحفظ رقم شام كاش: ' + ((r2.error && r2.error.message) || 'الصلاحيات')); return; }
      PLATFORM_SETTINGS_CACHE.shamcash_account = _acc; _logs.push({ key: 'shamcash_account', value: _acc });
    }
    await logSettingChanges(_logs);
    PLATFORM_SETTINGS_CACHE.payment_instructions_ar = val;
    SyDialog.alert('✅ تم حفظ تعليمات الدفع.');
  } catch (ex) {
    console.error('savePsPaymentInstructions exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _savePaymentInFlight = false;
    if (btn) { btn.textContent = '💾 حفظ تعليمات الدفع'; btn.disabled = false; }
  }
}

// Hydrate the new Section H UI from PLATFORM_SETTINGS_CACHE.
// Called from initAdmin AFTER loadPlatformSettings() resolves the cache.
// Safe to re-call (idempotent — overwrites inputs with cached values,
// but skips fields the user is currently typing into to avoid focus loss).
function hydratePsUI() {
  var c = PLATFORM_SETTINGS_CACHE || {};
  var set = function(id, val) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = val || '';
  };
  set('psSupportPhone',   c.support_phone);
  set('psSupportEmail',   c.support_email);
  set('psPlatformName',   c.platform_name);
  set('psRenewalMessage', c.renewal_message);
  set('psPaymentInstructions', c.payment_instructions_ar);
  set('psShamcashAccount', c.shamcash_account);   // v566 (M167)
  set('psUsdReportRate', c.usd_report_rate); // Migration 105

  // Sync current admin email display
  try {
    if (window.sb) {
      window.sb.auth.getSession().then(function(s){
        if (s && s.data && s.data.session && s.data.session.user) {
          var el = document.getElementById('psCurrentEmail');
          if (el) el.textContent = s.data.session.user.email || '—';
        }
      }).catch(function(){});
    }
  } catch(_){}

  // Reset all dirty flags + disable save buttons
  Object.keys(_psFieldDirty).forEach(function(k){ _psFieldDirty[k] = false; });
  _updatePsSaveButtons();
}

function _updatePsSaveButtons() {
  var supportDirty  = _psFieldDirty.support_phone || _psFieldDirty.support_email;
  var platformDirty = _psFieldDirty.platform_name || _psFieldDirty.renewal_message;
  var b1 = document.getElementById('btnPsSaveSupport');
  var b2 = document.getElementById('btnPsSavePlatform');
  if (b1) b1.disabled = !supportDirty || _psSaveSupportInFlight;
  if (b2) b2.disabled = !platformDirty || _psSavePlatformInFlight;
  var b3 = document.getElementById('btnPsSaveUsdRate'); // Migration 105
  if (b3) b3.disabled = !_psFieldDirty.usd_report_rate || _psSaveUsdRateInFlight;
}

function onPsFieldInput(key) {
  var idMap = {
    support_phone:    'psSupportPhone',
    support_email:    'psSupportEmail',
    platform_name:    'psPlatformName',
    renewal_message:  'psRenewalMessage',
    usd_report_rate:  'psUsdReportRate'  // Migration 105
  };
  var el = document.getElementById(idMap[key]);
  if (!el) return;
  var current = String(PLATFORM_SETTINGS_CACHE[key] || '').trim();
  var typed   = String(el.value || '').trim();
  _psFieldDirty[key] = (typed !== current);
  _updatePsSaveButtons();
}

// Migration 105: save the reports-only USD→SYP rate. Pattern-identical to
// savePsPaymentInstructions (single-key upsert + audit + cache sync).
async function savePsUsdRate() {
  if (_psSaveUsdRateInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }
  var inp = document.getElementById('psUsdReportRate');
  var btn = document.getElementById('btnPsSaveUsdRate');
  if (!inp) return;
  var val = String(inp.value || '').trim();
  if (val !== '') {
    var n = Number(val);
    if (!isFinite(n) || n <= 0) { SyDialog.alert('❌ سعر الصرف يجب أن يكون رقماً أكبر من صفر، أو اتركه فارغاً.'); return; }
  }
  _psSaveUsdRateInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
  try {
    var payload = { key:'usd_report_rate', value: val };
    try {
      var s2 = await window.sb.auth.getSession();
      if (s2 && s2.data && s2.data.session && s2.data.session.user) payload.updated_by = s2.data.session.user.email || 'admin';
    } catch(_) {}
    var res = await window.sb.from('platform_settings').upsert(payload, { onConflict:'key' }).select().maybeSingle();
    if (res.error) { console.error('savePsUsdRate:', res.error); SyDialog.alert('❌ فشل الحفظ: ' + (res.error.message || '')); return; }
    if (!res.data) { SyDialog.alert('❌ لم يُحفَظ — قد تكون الصلاحيات مرفوضة.\nتأكّد من تشغيل Migration 105 وأن دورك admin.'); return; }
    await logSettingChanges([{ key: 'usd_report_rate', value: val }]);
    PLATFORM_SETTINGS_CACHE.usd_report_rate = val;
    _psFieldDirty.usd_report_rate = false;
    _updatePsSaveButtons();
    loadAndRender(); // refresh MRR widgets with the new rate
    /* ولوحةُ التقارير لا تمرّ من renderAll فتبقى على السعر القديم. */
    if (typeof rptInvalidateRate === 'function') rptInvalidateRate();
    SyDialog.alert('✅ تم حفظ سعر صرف التقارير.');
  } catch (ex) {
    console.error('savePsUsdRate exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _psSaveUsdRateInFlight = false;
    if (btn) { btn.textContent = 'حفظ سعر الصرف'; }
    _updatePsSaveButtons();
  }
}

// Validation helpers — defensive, in addition to server-side (RLS) checks.
function _psValidPhone(v) {
  if (!v) return true; // empty allowed (admin can clear)
  return /^\d{8,15}$/.test(v);
}
function _psValidEmail(v) {
  if (!v) return true; // empty allowed
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// --- Save support info (bulk: phone + email together) ---
async function savePsSupportInfo() {
  if (_psSaveSupportInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح.'); return; }

  var phoneEl = document.getElementById('psSupportPhone');
  var emailEl = document.getElementById('psSupportEmail');
  var btn     = document.getElementById('btnPsSaveSupport');
  if (!phoneEl || !emailEl) return;

  var phone = String(phoneEl.value || '').trim();
  var email = String(emailEl.value || '').trim();

  if (!_psValidPhone(phone)) {
    SyDialog.alert('❌ رقم الدعم يجب يكون أرقام فقط (8-15 رقم، صيغة دولية بدون + أو 00).\n\nمثال صحيح: 963934012433');
    return;
  }
  if (!_psValidEmail(email)) {
    SyDialog.alert('❌ صيغة الإيميل غير صحيحة.');
    return;
  }

  _psSaveSupportInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

  try {
    var rows = [];
    if (_psFieldDirty.support_phone) rows.push({ key:'support_phone', value: phone });
    if (_psFieldDirty.support_email) rows.push({ key:'support_email', value: email });
    if (rows.length === 0) { return; } // nothing to save (defensive)

    // Stamp updated_by where possible
    try {
      var sess = await window.sb.auth.getSession();
      if (sess && sess.data && sess.data.session && sess.data.session.user) {
        var by = sess.data.session.user.email || 'admin';
        rows.forEach(function(r){ r.updated_by = by; });
      }
    } catch(_){}

    var res = await window.sb.from('platform_settings')
      .upsert(rows, { onConflict: 'key' })
      .select();

    if (res.error) {
      console.error('savePsSupportInfo error:', res.error);
      SyDialog.alert('❌ فشل الحفظ: ' + (res.error.message || 'خطأ غير معروف'));
      return;
    }
    if (!res.data || res.data.length === 0) {
      SyDialog.alert('❌ لم تُحفَظ التغييرات.\n\nقد تكون الصلاحيات مرفوضة (تحقّق من تشغيل Migration 33+34+34.1).');
      return;
    }

    // Snapshot which keys actually went to DB, BEFORE we clear the dirty
    // flags below. Used for cross-UI rehydration of the legacy
    // fSupportPhone input. (Reading _psFieldDirty.support_phone after the
    // forEach would always be false — bug caught in R7.)
    var phoneSaved = rows.some(function(r){ return r.key === 'support_phone'; });

    // Sync cache + clear dirty flags for keys that were saved
    await logSettingChanges(rows);
    rows.forEach(function(r){
      PLATFORM_SETTINGS_CACHE[r.key] = r.value;
      _psFieldDirty[r.key] = false;
    });

    // One-way sync: rehydrate the legacy fSupportPhone input in tpl-editor
    // (if it's mounted and not currently focused — same convention as the
    // legacy loadPlatformSettings() rehydration).
    if (phoneSaved) {
      var legacyInp = document.getElementById('fSupportPhone');
      if (legacyInp && document.activeElement !== legacyInp) {
        legacyInp.value = PLATFORM_SETTINGS_CACHE.support_phone || '';
        var legacyBtn = document.getElementById('btnSaveSupport');
        if (legacyBtn) legacyBtn.disabled = true;
      }
    }

    SyDialog.alert('✅ تم حفظ معلومات الدعم.');
  } catch(ex) {
    console.error('savePsSupportInfo exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _psSaveSupportInFlight = false;
    if (btn) { btn.textContent = '💾 حفظ معلومات الدعم'; }
    _updatePsSaveButtons();
  }
}

// --- Save platform info (name + renewal_message) ---
async function savePsPlatformInfo() {
  if (_psSavePlatformInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح.'); return; }

  var nameEl = document.getElementById('psPlatformName');
  var msgEl  = document.getElementById('psRenewalMessage');
  var btn    = document.getElementById('btnPsSavePlatform');
  if (!nameEl || !msgEl) return;

  var name = String(nameEl.value || '').trim();
  var msg  = String(msgEl.value || '').trim();

  // Soft validation: length only — these are free-text user-facing strings
  if (name.length > 100) { SyDialog.alert('❌ اسم المنصة طويل جداً (أقصى 100 حرف).'); return; }
  if (msg.length > 500)  { SyDialog.alert('❌ رسالة التجديد طويلة جداً (أقصى 500 حرف).'); return; }

  _psSavePlatformInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

  try {
    var rows = [];
    if (_psFieldDirty.platform_name)   rows.push({ key:'platform_name',   value: name });
    if (_psFieldDirty.renewal_message) rows.push({ key:'renewal_message', value: msg });
    if (rows.length === 0) return;

    try {
      var sess = await window.sb.auth.getSession();
      if (sess && sess.data && sess.data.session && sess.data.session.user) {
        var by = sess.data.session.user.email || 'admin';
        rows.forEach(function(r){ r.updated_by = by; });
      }
    } catch(_){}

    var res = await window.sb.from('platform_settings')
      .upsert(rows, { onConflict: 'key' })
      .select();

    if (res.error) {
      SyDialog.alert('❌ فشل الحفظ: ' + (res.error.message || 'خطأ غير معروف'));
      return;
    }
    if (!res.data || res.data.length === 0) {
      SyDialog.alert('❌ لم تُحفَظ التغييرات.\n\nالصلاحيات قد تكون مرفوضة.');
      return;
    }

    await logSettingChanges(rows);
    rows.forEach(function(r){
      PLATFORM_SETTINGS_CACHE[r.key] = r.value;
      _psFieldDirty[r.key] = false;
    });

    SyDialog.alert('✅ تم حفظ معلومات المنصة.');
  } catch(ex) {
    console.error('savePsPlatformInfo exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _psSavePlatformInFlight = false;
    if (btn) { btn.textContent = '💾 حفظ معلومات المنصة'; }
    _updatePsSaveButtons();
  }
}

// --- Admin email change (via Supabase Auth) ---
function onPsEmailInput() {
  var el  = document.getElementById('psNewEmail');
  var btn = document.getElementById('btnPsSaveEmail');
  if (!el || !btn) return;
  var typed = String(el.value || '').trim();
  _psEmailDirty = typed.length > 0 && _psValidEmail(typed);
  btn.disabled = !_psEmailDirty || _psSaveEmailInFlight;
}

async function savePsAdminEmail() {
  if (_psSaveEmailInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح.'); return; }

  var el  = document.getElementById('psNewEmail');
  var btn = document.getElementById('btnPsSaveEmail');
  if (!el) return;
  var newEmail = String(el.value || '').trim();

  if (!_psValidEmail(newEmail) || newEmail.length === 0) {
    SyDialog.alert('❌ صيغة الإيميل غير صحيحة.');
    return;
  }

  // Defensive: prevent changing to @sydent.com (Golden Rule #62 — phone-based
  // auth uses @sydent.com suffix; admins should use real emails).
  if (newEmail.toLowerCase().endsWith('@sydent.com')) {
    SyDialog.alert('❌ لا يمكن استخدام إيميل بنطاق @sydent.com (محجوز لحسابات الهاتف).');
    return;
  }

  if (!await SyDialog.confirm({ message: 'سيُرسَل إيميل تأكيد إلى:\n' +
    newEmail + '\n\n' +
    'لن يفعَّل التغيير حتى تضغط على رابط التأكيد في الإيميل.\n\n' +
    'متابعة؟' })) return;

  _psSaveEmailInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }

  try {
    // auth.updateUser() with `email` triggers Supabase to send a
    // confirmation email to the NEW address. The change is NOT applied
    // until the user clicks the confirmation link. Supabase also notifies
    // the OLD address by default (security best practice — Microsoft Entra
    // pattern, same as Stripe Dashboard email change flow).
    var res = await window.sb.auth.updateUser({ email: newEmail });
    if (res.error) {
      SyDialog.alert('❌ فشل: ' + (res.error.message || 'خطأ غير معروف'));
      return;
    }
    SyDialog.alert('✅ تم إرسال إيميل التأكيد إلى:\n' + newEmail + '\n\n' +
      'افتح الإيميل واضغط على الرابط لإكمال تغيير الإيميل.\n' +
      'ستُسجَّل خروج من الجلسة الحالية تلقائياً بعد التأكيد.');
    el.value = '';
    _psEmailDirty = false;
  } catch(ex) {
    console.error('savePsAdminEmail exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    _psSaveEmailInFlight = false;
    if (btn) {
      btn.textContent = '📧 تحديث الإيميل';
      // Re-evaluate disabled state — input may still be dirty if save errored
      // and user wants to retry. On success path the input was cleared above
      // (el.value=''), so _psEmailDirty is false and button stays disabled.
      btn.disabled = !_psEmailDirty;
    }
  }
}

// --- Admin password change (via Supabase Auth) ---
function onPsPasswordInput() {
  var p1  = document.getElementById('psNewPassword');
  var p2  = document.getElementById('psConfirmPassword');
  var btn = document.getElementById('btnPsSavePassword');
  if (!p1 || !p2 || !btn) return;
  var v1 = String(p1.value || '');
  var v2 = String(p2.value || '');
  _psPasswordDirty = (v1.length >= 8 && /[A-Za-z]/.test(v1) && /[0-9]/.test(v1) && v1 === v2);
  btn.disabled = !_psPasswordDirty || _psSavePasswordInFlight;
}

async function savePsAdminPassword() {
  if (_psSavePasswordInFlight) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح.'); return; }

  var p1  = document.getElementById('psNewPassword');
  var p2  = document.getElementById('psConfirmPassword');
  var btn = document.getElementById('btnPsSavePassword');
  if (!p1 || !p2) return;
  var v1 = String(p1.value || '');
  var v2 = String(p2.value || '');

  if (v1.length < 8)   { SyDialog.alert('❌ كلمة السرّ يجب أن تكون 8 أحرف على الأقل.'); return; }
  if (!/[A-Za-z]/.test(v1) || !/[0-9]/.test(v1)) { SyDialog.alert('❌ كلمة السرّ يجب أن تتضمن حرفاً إنكليزياً ورقماً على الأقل.'); return; }
  if (v1 !== v2)       { SyDialog.alert('❌ كلمتا السرّ غير متطابقتين.'); return; }

  if (!await SyDialog.confirm({ message: 'سيتم تحديث كلمة السرّ وتسجيل خروجك من جميع الجلسات.\n\n' +
    'ستحتاج تسجيل الدخول مجدداً بكلمة السرّ الجديدة.\n\n' +
    'متابعة؟' })) return;

  _psSavePasswordInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث...'; }

  try {
    var res = await window.sb.auth.updateUser({ password: v1 });
    if (res.error) {
      SyDialog.alert('❌ فشل: ' + (res.error.message || 'خطأ غير معروف'));
      // Reset flag + button so user can retry (no finally{} on success path
      // because we navigate away — so error paths must reset inline).
      _psSavePasswordInFlight = false;
      if (btn) { btn.textContent = '🔑 تحديث كلمة السرّ'; btn.disabled = !_psPasswordDirty; }
      return;
    }

    // Clear the inputs IMMEDIATELY (defensive — no plaintext lingering in DOM)
    p1.value = '';
    p2.value = '';
    _psPasswordDirty = false;

    await SyDialog.alert('✅ تم تحديث كلمة السرّ.\n\nسيتم تسجيل خروجك الآن.');

    // Global sign-out (revokes all refresh tokens; Supabase ALSO auto-revokes
    // on password change since v2 — this is defense-in-depth).
    try { await window.sb.auth.signOut({ scope: 'global' }); } catch(_){}
    window.location.href = 'auth.html?password_changed=1';
  } catch(ex) {
    console.error('savePsAdminPassword exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
    _psSavePasswordInFlight = false;
    if (btn) { btn.textContent = '🔑 تحديث كلمة السرّ'; btn.disabled = true; }
  }
  // No finally{} on the success path — we're navigating away. Each error
  // exit point above resets the in-flight state inline.
}
