/* ═══════════════════════════════════════════════════════════════════════
   SyDent — admin-render.js · حزام A2 من تفكيك admin.html (27 تموز 2026)
   شريط التنبيهات + عارض أحداث الاشتراك X4 + ودجات الصحة X5 +
   renderAll/renderList + إشعارات التسجيل الجديد + درج Customer360 X6 +
   العمليات الجماعية والفلاتر X7 — تعريفات صرفة، صفر تنفيذ top-level
   (مستمع Esc لمودال evf بقي inline بموضعه الأصلي — سابقة الجذوع v39).
   يُحمَّل بعد admin-wa.js وقبل الكتلة الرئيسية في admin.html.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── ADMIN-RENDER-SEG-1 · 7.6C Alerts Banner + X4 Events Viewer (تعريفات؛ مستمع Esc بقي inline) · admin.html كان 5468–6036 ── */
// ===== Phase 7.6C: Alerts Banner helpers =====
// Single source of truth for "days remaining" — used by the banner, the
// expiring-filter predicate, the CSV export, and Step 3's reminder gate.
// Returns:
//   null  for permanent accounts (trial_end is null) OR non-accepted rows
//   N>=0  for an active or just-expired trial (positive = days remaining)
//   N<0   for trials whose end_date is already in the past
function getDaysLeft(r) {
  if (!r || r.status !== 'accepted') return null;
  if (!r.trial_end) return null;
  var end = new Date(r.trial_end);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end - new Date()) / 86400000);
}

// Predicate for "expiring within 7 days": active trial whose remaining
// days is 1..7 (inclusive). Already-expired (<=0) accounts are NOT
// included — those need different (re-engagement) treatment, not a
// pre-expiry warning.
function isExpiringSoon(r) {
  var dl = getDaysLeft(r);
  return dl !== null && dl > 0 && dl <= 7;
}

// Renders the banner above the search bar. Three visual states:
//   1. hidden     — no expiring tenants (count === 0)
//   2. warning    — yellow, 1-3 tenants expiring
//   3. critical   — red, 4+ tenants expiring
//   4. active     — green, filter currently applied (regardless of count)
function renderAlertsBanner() {
  var banner = document.getElementById('alertsBanner');
  if (!banner) return;
  var textWrap = document.getElementById('alertsBannerText');
  var iconEl   = textWrap ? textWrap.querySelector('.banner-icon') : null;
  var msgEl    = textWrap ? textWrap.querySelector('.banner-msg')  : null;
  var cta      = document.getElementById('alertsBannerCta');
  var closeBtn = document.getElementById('alertsBannerClose');
  if (!iconEl || !msgEl || !cta || !closeBtn) return;

  var count = allRequests.filter(isExpiringSoon).length;

  // Reset classes each render — avoids stale 'critical'/'active' lingering.
  banner.className = 'alerts-banner';

  if (count === 0 && !expiringFilterActive) {
    // Nothing to show, and filter not stuck on.
    return;
  }

  banner.classList.add('show');

  if (expiringFilterActive) {
    // Active state: filter is currently applied. Show ✕ to clear.
    banner.classList.add('active');
    iconEl.textContent = '🔍';
    msgEl.textContent  = 'عرض الحسابات المنتهية قريباً (' + count + ')';
    cta.style.display = 'none';
    closeBtn.style.display = 'inline-block';
  } else {
    // Warning / critical state. Count > 0 guaranteed (we returned above).
    if (count > 3) banner.classList.add('critical');
    iconEl.textContent = '⚠️';
    msgEl.textContent  = count + ' ' + (count === 1 ? 'حساب ينتهي' : 'حسابات تنتهي') + ' خلال 7 أيام';
    cta.style.display = 'inline-block';
    closeBtn.style.display = 'none';
  }
}

// Banner body click → toggle filter ON (only when not already active).
// We delegate from the whole banner so clicks on text OR cta both work.
// The ✕ button has its own handler (closeExpiringFilter) and calls
// stopPropagation so we don't re-toggle here.
function onBannerClick(e) {
  if (e && e.target && e.target.id === 'alertsBannerClose') return;
  if (expiringFilterActive) return; // active state: only ✕ clears it
  if (window.adminGo) adminGo('cu'); /* ح1 */
  expiringFilterActive = true;
  renderAlertsBanner();
  renderList();
}

// Keyboard activation for role="button" (Enter / Space). The browser
// gives focus + tabindex semantics but NOT keyboard click emulation —
// we wire that ourselves. Space is preventDefault'd because the default
// behavior on a focused tabindex element is to scroll the page.
function onBannerKeydown(e) {
  if (!e) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (expiringFilterActive) return;
    if (window.adminGo) adminGo('cu'); /* ح1 */
    expiringFilterActive = true;
    renderAlertsBanner();
    renderList();
  }
}

// ✕ button → clear the filter.
function closeExpiringFilter(e) {
  if (e) e.stopPropagation();
  if (!expiringFilterActive) return;
  expiringFilterActive = false;
  renderAlertsBanner();
  renderList();
}

// ── نُقل إلى admin-wa.js (ADMIN-WA-SEG-4 · 7.6C-Step2 — CSV Export) — تفكيك A3 ──

// ============================================================
// ===== Phase X4: Subscription Events Viewer (in-section) ====
// ============================================================
//
// Read-only audit log over subscription_events. Lives inside
// admin.html as a collapsible section (same pattern as Phase X2
// Plans Editor and Phase X3 Templates Editor) — NOT a separate
// page. The cross-page approach was abandoned after live testing
// revealed multiple failure modes (Brave/Safari cache, session
// race, redirect loops). In-page section eliminates all of them:
//
//   - allRequests already in memory → no duplicate fetch for
//     tenant name resolution (just a lookup map)
//   - admin session already verified at page entry → no auth
//     gate, no getSession() race condition
//   - No navigation → no GitHub Pages deploy lag, no cache miss,
//     no browser quirks intercepting clicks
//
// State:
//   evfAllEvents       - accumulated events from DB (paginated)
//   evfTenantMap       - tenant_id → {name,email,phone} from allRequests
//   evfSelectedTypes   - Set of selected event_type codes (empty = all)
//   evfHasMore         - whether DB has more rows beyond current page
//   evfLoadToken       - latest-wins guard for async filter changes
//   evfInitialized     - true after first open (triggers initial load)

var EVF_EVENT_TYPES = {
  // Lifecycle (Phase 7.6E + earlier)
  'accept':           { label_ar: 'قبول طلب',          category: 'lifecycle',   emoji: '✅' },
  'reject':           { label_ar: 'رفض طلب',           category: 'destructive', emoji: '🚫' },
  'convert_monthly':  { label_ar: 'تحويل لشهري',       category: 'lifecycle',   emoji: '💎' },
  'convert_yearly':   { label_ar: 'تحويل لسنوي',       category: 'lifecycle',   emoji: '💎' },
  'convert_plan':     { label_ar: 'تحويل لخطة',        category: 'lifecycle',   emoji: '💎' },
  'renew':            { label_ar: 'تجديد',             category: 'lifecycle',   emoji: '🔄' },
  'extend':           { label_ar: 'تمديد المدة',        category: 'lifecycle',   emoji: '➕' },
  'shorten':          { label_ar: 'تقصير المدة',        category: 'warning',     emoji: '➖' },
  'enter_grace':      { label_ar: 'فترة سماح',         category: 'warning',     emoji: '⏰' },
  'suspend':          { label_ar: 'إيقاف',             category: 'warning',     emoji: '⏸' },
  'reactivate':       { label_ar: 'إعادة تفعيل',       category: 'lifecycle',   emoji: '▶️' },
  'restart_trial':    { label_ar: 'إعادة تجربة',       category: 'lifecycle',   emoji: '🔁' },   // M143
  'delete':           { label_ar: 'حذف',               category: 'destructive', emoji: '🗑' },
  // Auth (Phase X1)
  'promote_to_admin': { label_ar: 'ترقية لمسؤول',      category: 'auth',        emoji: '👑' },
  'demote_from_admin':{ label_ar: 'تنزيل من مسؤول',    category: 'auth',        emoji: '👤' },
  // Config (Phase X2, X3)
  'plan_updated':     { label_ar: 'تعديل خطة',         category: 'config',      emoji: '⚙️' },
  'plan_created':     { label_ar: 'إنشاء خطة',         category: 'config',      emoji: '🆕' },
  'plan_deleted':     { label_ar: 'حذف خطة',           category: 'destructive', emoji: '🗑' },
  'template_updated': { label_ar: 'تعديل قالب رسالة',  category: 'config',      emoji: '💬' },
  // Tenant-side (M123) — كُتبا بتريغر DB لا بالأدمن: العميل غيّر اسمه بنفسه.
  'clinic_name_changed': { label_ar: 'تغيير اسم العيادة', category: 'config',   emoji: '🏥' },
  'owner_name_changed':  { label_ar: 'تغيير اسم الطبيب',  category: 'config',   emoji: '👤' }
};

var evfAllEvents = [];
var evfTenantMap = {};
var evfSelectedTypes = new Set();
var evfPageSize = 50;
var evfHasMore = false;
var evfSearchDebounce = null;
var evfLoadToken = 0;
var evfInitialized = false;

// Toggle the events section. On first open, render chips, build
// tenant map from allRequests, set default 30-day range, and load.
function toggleEventsSection() {
  if (window.adminGo) adminGo('st'); /* ح1: سجل الأحداث يسكن قسم الإعدادات */
  var sec = document.getElementById('eventsViewerSection');
  if (!sec) return;
  var willOpen = !sec.classList.contains('open');
  sec.classList.toggle('open');

  if (willOpen && !evfInitialized) {
    evfInitialized = true;
    // Build tenant map from allRequests (already loaded by loadAndRender).
    // No extra DB query needed — this is the key benefit of the in-page
    // architecture over a separate page.
    evfRebuildTenantMap();
    // Default date range = last 30 days (matches Stripe Events page).
    var today = new Date();
    var thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('evfDateFrom').value = evfToIsoDate(thirtyAgo);
    document.getElementById('evfDateTo').value = evfToIsoDate(today);
    evfRenderChips();
    evfLoadEvents(true);
    // Scroll into view smoothly so the user sees the section after toggle.
    setTimeout(function() {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else if (willOpen) {
    // Re-open: rebuild tenant map (allRequests may have changed) and
    // scroll into view, but don't re-fetch events (let the user press
    // 🔄 تحديث if they want a refresh).
    evfRebuildTenantMap();
    setTimeout(function() {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function evfRebuildTenantMap() {
  var map = {};
  (allRequests || []).forEach(function(r) {
    // Name unification: carry the live clinic/business name alongside the
    // signup/contact name so the event feed can lead with the clinic identity
    // (matching the customer card, 360° drawer, and CSV export).
    map[r.id] = {
      name: (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || ''),
      clinicName: (r.user_id && clinicNameByUid[r.user_id]) ? clinicNameByUid[r.user_id] : '',
      email: r.email || '',
      phone: r.phone || ''
    };
  });
  evfTenantMap = map;
}

function evfToIsoDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// XSS-safe HTML escaping (reuses existing escapeHtml from admin.html).
// Defined separately as a local alias so this section is self-contained
// in case escapeHtml is ever refactored.
function evfEscape(s) { return escapeHtml(s); }

// Render the multi-select chips for event type filtering
function evfRenderChips() {
  var wrap = document.getElementById('evfChipsWrap');
  if (!wrap) return;
  var html = '';
  Object.keys(EVF_EVENT_TYPES).forEach(function(code) {
    var t = EVF_EVENT_TYPES[code];
    var active = evfSelectedTypes.has(code) ? ' active' : '';
    html += '<span class="evf-chip' + active + '" data-code="' + evfEscape(code) + '" ' +
            'onclick="evfToggleChip(\'' + code + '\')">' +
            t.emoji + ' ' + evfEscape(t.label_ar) + '</span>';
  });
  wrap.innerHTML = html;
}

function evfToggleChip(code) {
  if (evfSelectedTypes.has(code)) evfSelectedTypes.delete(code);
  else                            evfSelectedTypes.add(code);
  evfRenderChips();
  evfApplyFilters();
}

function evfResetFilters() {
  var today = new Date();
  var thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  document.getElementById('evfDateFrom').value = evfToIsoDate(thirtyAgo);
  document.getElementById('evfDateTo').value = evfToIsoDate(today);
  document.getElementById('evfSearch').value = '';
  evfSelectedTypes.clear();
  evfRenderChips();
  evfLoadEvents(true);
}

function evfApplyFilters() {
  evfLoadEvents(true);
}

function evfOnSearchInput() {
  if (evfSearchDebounce) clearTimeout(evfSearchDebounce);
  evfSearchDebounce = setTimeout(function() {
    // Search is client-side filter over already-loaded rows — no DB hit.
    // Date and type filters DO hit the DB, but search alone is local.
    evfRenderList();
  }, 300);
}

// Load events from DB with current filters applied at SQL level
// for date and type, and client-side for tenant search. Pagination
// uses Supabase range() with pageSize+1 trick to detect hasMore.
async function evfLoadEvents(reset) {
  var myToken = ++evfLoadToken;  // D6 latest-wins guard
  if (reset) {
    evfAllEvents = [];
    // Phase X9: skeleton rows mirror the events-list row shape so the
    // layout doesn't shift when real data arrives.
    document.getElementById('evfList').innerHTML = (
      '<div class="sk-row tall"><div class="sk-row-inner"><span class="sk-base sk-dot"></span><span class="sk-base sk-line"></span></div></div>' +
      '<div class="sk-row tall"><div class="sk-row-inner"><span class="sk-base sk-dot"></span><span class="sk-base sk-line"></span></div></div>' +
      '<div class="sk-row tall"><div class="sk-row-inner"><span class="sk-base sk-dot"></span><span class="sk-base sk-line"></span></div></div>' +
      '<div class="sk-row tall"><div class="sk-row-inner"><span class="sk-base sk-dot"></span><span class="sk-base sk-line"></span></div></div>'
    );
    document.getElementById('evfList').setAttribute('aria-busy', 'true');
    document.getElementById('evfPaginationWrap').style.display = 'none';
  }

  var dateFrom = document.getElementById('evfDateFrom').value;
  var dateTo = document.getElementById('evfDateTo').value;
  var typesArr = Array.from(evfSelectedTypes);

  var q = window.sb.from('subscription_events').select('*').order('created_at', { ascending: false });

  if (dateFrom) {
    // Use LOCAL time boundaries (R15 fix from original X4 audit).
    // <input type="date"> stores local YYYY-MM-DD; without this fix
    // we'd miss events in the timezone offset window (Damascus UTC+3).
    var fromLocal = new Date(dateFrom + 'T00:00:00');
    if (!isNaN(fromLocal.getTime())) {
      q = q.gte('created_at', fromLocal.toISOString());
    }
  }
  if (dateTo) {
    var toLocal = new Date(dateTo + 'T23:59:59.999');
    if (!isNaN(toLocal.getTime())) {
      q = q.lte('created_at', toLocal.toISOString());
    }
  }
  if (typesArr.length > 0) {
    q = q.in('event_type', typesArr);
  }
  var offset = evfAllEvents.length;
  q = q.range(offset, offset + evfPageSize);

  var res;
  try {
    res = await q;
  } catch (e) {
    if (myToken !== evfLoadToken) return;  // stale
    document.getElementById('evfList').innerHTML =
      '<div class="evf-state"><span class="evf-state-icon">⚠️</span><div>خطأ: ' +
      evfEscape(e && e.message ? e.message : String(e)) + '</div></div>';
    return;
  }
  if (myToken !== evfLoadToken) return;  // newer load started — discard

  if (res.error) {
    document.getElementById('evfList').innerHTML =
      '<div class="evf-state"><span class="evf-state-icon">⚠️</span><div>خطأ: ' +
      evfEscape(res.error.message) + '</div></div>';
    return;
  }
  var rows = res.data || [];
  if (rows.length > evfPageSize) {
    evfHasMore = true;
    rows = rows.slice(0, evfPageSize);
  } else {
    evfHasMore = false;
  }
  evfAllEvents = evfAllEvents.concat(rows);
  evfRenderList();
}

function evfLoadMore() {
  var btn = document.getElementById('evfBtnLoadMore');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '⏳ جارٍ التحميل...';
  evfLoadEvents(false).finally(function() {
    btn.disabled = false;
    btn.textContent = '⬇ تحميل المزيد (50)';
  });
}

function evfRenderList() {
  var search = (document.getElementById('evfSearch').value || '').trim().toLowerCase();
  var filtered;
  if (search) {
    filtered = evfAllEvents.filter(function(ev) {
      var t = evfTenantMap[ev.trial_request_id];
      if (!t) return false;
      var hay = (t.name + ' ' + t.email + ' ' + t.phone).toLowerCase();
      return hay.indexOf(search) >= 0;
    });
  } else {
    filtered = evfAllEvents;
  }

  var listEl = document.getElementById('evfList');
  listEl.setAttribute('aria-busy', 'false');
  if (filtered.length === 0) {
    // Phase X9: action-oriented empty state with explicit hint.
    listEl.innerHTML = (
      '<div class="es-box" role="status">' +
        '<div class="es-icon" aria-hidden="true">🔍</div>' +
        '<div class="es-title">لا توجد أحداث تطابق الفلاتر</div>' +
        '<div class="es-msg">جرّب توسيع نطاق التاريخ أو إلغاء تحديد بعض أنواع الأحداث من الـ chips أعلاه.</div>' +
      '</div>'
    );
  } else {
    var html = '';
    filtered.forEach(function(ev) { html += evfRenderCard(ev); });
    listEl.innerHTML = html;
  }

  var counterEl = document.getElementById('evfCounterText');
  if (search) {
    counterEl.innerHTML = 'عرض <strong>' + filtered.length + '</strong> من <strong>' +
                         evfAllEvents.length + '</strong> حدث (بعد البحث)';
  } else {
    counterEl.innerHTML = 'عرض <strong>' + filtered.length + '</strong> حدث';
  }
  var aggEl = document.getElementById('evfCounterAgg');
  aggEl.textContent = evfHasMore ? 'يوجد المزيد — اضغط تحميل المزيد' : 'نهاية النتائج';
  document.getElementById('evfPaginationWrap').style.display =
    (evfHasMore && !search) ? 'flex' : 'none';
}

function evfRenderCard(ev) {
  var t = evfTenantMap[ev.trial_request_id] || { name: '—', email: '', phone: '' };
  var meta = EVF_EVENT_TYPES[ev.event_type] || { label_ar: ev.event_type, category: 'config', emoji: '•' };
  var when = evfFormatTimestamp(ev.created_at);
  var summary = evfBuildSummary(ev);
  var byShort = evfShortPerformedBy(ev.performed_by);
  // D8 fix: pass event ID (primary key), not array index — search
  // debounce can cause filtered.length to shift between render and click
  var idAttr = evfEscape(String(ev.id || ''));
  return '' +
    '<div class="evf-card" onclick="evfOpenModal(\'' + idAttr + '\')" role="button" tabindex="0" ' +
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();evfOpenModal(\'' + idAttr + '\');}">' +
      '<div class="evf-card-meta">' +
        '<span class="evf-badge ' + meta.category + '">' + meta.emoji + ' ' + evfEscape(meta.label_ar) + '</span>' +
        '<span class="evf-tenant">' + evfEscape(t.clinicName || t.name || '—') + '</span>' +
        ((t.clinicName && t.name) ? '<span class="evf-tenant-sub">👤 ' + evfEscape(t.name) + '</span>' : '') +
        (t.email ? '<span class="evf-tenant-email">' + evfEscape(t.email) + '</span>' : '') +
        '<span class="evf-time">' + evfEscape(when) + '</span>' +
      '</div>' +
      '<div class="evf-summary">' + summary + '</div>' +
      (byShort ? '<div class="evf-by">' + evfEscape(byShort) + '</div>' : '') +
    '</div>';
}

function evfBuildSummary(ev) {
  var parts = [];
  if (ev.event_type === 'plan_updated' || ev.event_type === 'template_updated') {
    if (ev.from_plan) parts.push('<strong>' + evfEscape(ev.from_plan) + '</strong>');
  }
  if (ev.from_plan && ev.to_plan && ev.from_plan !== ev.to_plan) {
    parts.push(evfEscape(ev.from_plan) + ' ← ' + evfEscape(ev.to_plan));
  }
  if (ev.from_status && ev.to_status && ev.from_status !== ev.to_status) {
    parts.push(evfEscape(ev.from_status) + ' ← ' + evfEscape(ev.to_status));
  }
  // M123: زوج القيمة العام (نمط previous_attributes) — يخدم أحداث تغيير الاسم
  // وأي حدث «تغيّرت قيمة» مستقبلي بلا عمود جديد.
  if (ev.from_value || ev.to_value) {
    parts.push(evfEscape(ev.from_value || '—') + ' ← ' + evfEscape(ev.to_value || '—'));
  }
  if (ev.amount && Number(ev.amount) > 0) {
    parts.push('<strong>' + Number(ev.amount).toLocaleString('en-US') + '</strong> ' + evfEscape(ev.currency || 'SYP'));
  }
  if (ev.notes) {
    var n = String(ev.notes);
    var preview = n.length > 80 ? n.substring(0, 80) + '…' : n;
    parts.push('<span style="color:var(--text2);">' + evfEscape(preview) + '</span>');
  }
  return parts.length > 0 ? parts.join(' · ') : '<span style="color:var(--text3);">—</span>';
}

function evfShortPerformedBy(pb) {
  if (!pb) return '';
  var s = String(pb);
  if (s.indexOf('admin:') === 0) return 'بواسطة: ' + s.substring(6);
  // M123: أحداث المستأجر يكتبها تريغر DB — يجب أن يميّزها الأدمن فوراً عن فعله.
  if (s.indexOf('tenant:') === 0) return 'بواسطة العميل: ' + s.substring(7);
  if (s.indexOf('other:') === 0) return 'بواسطة: ' + s.substring(6);
  return 'بواسطة: ' + s;
}

function evfFormatTimestamp(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    // v485: المُنسّقُ الموحّد SyDT — «21/9/2026 — 02:32 PM» (كان ar-EG «٢١‏/٠٩‏/٢٠٢٦، ٢:٣٢ م» بترتيبٍ مختلف)؛
    //       يومٌ بلا وقت (منتصف ليل UTC، كتاريخ انتهاء الاشتراك) يُعرض تاريخُه وحده.
    var t = SyDT.time12(d);
    return SyDT.numDate(d) + (t ? ' — ' + t : '');
  } catch (e) { return iso; }
}

// Drill-down modal — open by event ID (D8 fix: stable across renders)
function evfOpenModal(eventId) {
  if (!eventId) return;
  var ev = null;
  for (var i = 0; i < evfAllEvents.length; i++) {
    if (String(evfAllEvents[i].id) === String(eventId)) { ev = evfAllEvents[i]; break; }
  }
  if (!ev) return;

  var t = evfTenantMap[ev.trial_request_id] || { name: '—', email: '', phone: '' };
  var meta = EVF_EVENT_TYPES[ev.event_type] || { label_ar: ev.event_type, category: 'config', emoji: '•' };

  var rows = '';
  rows += evfDetailRow('🆔 ID', evfEscape(ev.id));
  rows += evfDetailRow('📅 الوقت', evfEscape(evfFormatTimestamp(ev.created_at)) + ' <code style="color:var(--text3);font-size:11px;">(' + evfEscape(ev.created_at || '') + ')</code>');
  rows += evfDetailRow('🏷 نوع الحدث',
    '<span class="evf-badge ' + meta.category + '">' + meta.emoji + ' ' + evfEscape(meta.label_ar) +
    '</span> <code style="color:var(--text3);font-size:11px;">(' + evfEscape(ev.event_type) + ')</code>');
  if (t.clinicName) {
    rows += evfDetailRow('🏥 العيادة', evfEscape(t.clinicName));
  }
  rows += evfDetailRow((t.clinicName ? '👤 جهة الاتصال' : '👤 العميل'), evfEscape(t.name || '—') +
    (t.email ? '<br><span style="color:var(--text3);font-size:11px;">' + evfEscape(t.email) + '</span>' : '') +
    (t.phone ? '<br><span style="color:var(--text3);font-size:11px;">' + evfEscape(t.phone) + '</span>' : ''));
  if (ev.from_plan || ev.to_plan) {
    rows += evfDetailRow('💎 الخطة',
      (ev.from_plan ? evfEscape(ev.from_plan) : '—') + ' ← ' +
      (ev.to_plan ? evfEscape(ev.to_plan) : '—'));
  }
  if (ev.from_status || ev.to_status) {
    rows += evfDetailRow('🏁 الحالة',
      (ev.from_status ? evfEscape(ev.from_status) : '—') + ' ← ' +
      (ev.to_status ? evfEscape(ev.to_status) : '—'));
  }
  if (ev.from_value || ev.to_value) {
    rows += evfDetailRow('✏️ القيمة',
      (ev.from_value ? evfEscape(ev.from_value) : '—') + ' ← ' +
      (ev.to_value ? evfEscape(ev.to_value) : '—'));
  }
  if (ev.from_trial_end || ev.to_trial_end) {
    rows += evfDetailRow('⏰ نهاية التجربة',
      (ev.from_trial_end ? evfEscape(ev.from_trial_end) : '—') + ' ← ' +
      (ev.to_trial_end ? evfEscape(ev.to_trial_end) : '—'));
  }
  if (ev.amount && Number(ev.amount) > 0) {
    rows += evfDetailRow('💰 المبلغ',
      '<strong>' + Number(ev.amount).toLocaleString('en-US') + '</strong> ' +
      evfEscape(ev.currency || 'SYP'));
  }
  if (ev.performed_by) {
    rows += evfDetailRow('👨‍💼 بواسطة', evfEscape(ev.performed_by));
  }
  if (ev.notes) {
    rows += evfDetailRow('📝 ملاحظات', evfRenderNotes(ev.notes));
  }
  rows += evfDetailRow('🧾 JSON الكامل',
    '<div class="evf-json-block">' + evfEscape(JSON.stringify(ev, null, 2)) + '</div>');

  document.getElementById('evfModalBody').innerHTML = rows;
  document.getElementById('evfModalOverlay').classList.add('open');
}

function evfDetailRow(label, valueHtml) {
  return '<div class="evf-detail-row"><div class="evf-detail-label">' + label +
         '</div><div class="evf-detail-value">' + valueHtml + '</div></div>';
}

function evfRenderNotes(notes) {
  try {
    var parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && parsed.diff && typeof parsed.diff === 'object') {
      var diffHtml = '';
      Object.keys(parsed.diff).forEach(function(k) {
        var d = parsed.diff[k];
        if (!d || typeof d !== 'object') return;
        var fromVal, toVal;
        if (d.from_preview !== undefined || d.to_preview !== undefined) {
          fromVal = (d.from_preview != null ? d.from_preview : '');
          toVal   = (d.to_preview   != null ? d.to_preview   : '');
        } else {
          fromVal = (d.from != null ? String(d.from) : '');
          toVal   = (d.to   != null ? String(d.to)   : '');
        }
        diffHtml += '<div class="evf-diff-row">' +
                    '<div class="evf-diff-label">' + evfEscape(k) + '</div>' +
                    '<div class="evf-diff-from">' + evfEscape(fromVal) + '</div>' +
                    '<div class="evf-diff-to">' + evfEscape(toVal) + '</div></div>';
      });
      var header = '';
      if (parsed.plan_code) header = '<div style="margin-bottom:8px;color:var(--text2);font-size:11px;">خطة: <strong>' + evfEscape(parsed.plan_code) + '</strong></div>';
      else if (parsed.template_code) header = '<div style="margin-bottom:8px;color:var(--text2);font-size:11px;">قالب: <strong>' + evfEscape(parsed.template_code) + '</strong></div>';
      return header + diffHtml + '<div class="evf-json-block">' + evfEscape(notes) + '</div>';
    }
  } catch (e) { /* not JSON — fall through */ }
  return '<div style="white-space:pre-wrap;">' + evfEscape(String(notes)) + '</div>';
}

function evfCloseModal() {
  document.getElementById('evfModalOverlay').classList.remove('open');
}

function evfCloseModalIfBackdrop(ev) {
  if (ev.target.id === 'evfModalOverlay') evfCloseModal();
}
/* ── ADMIN-RENDER-SEG-2 · X4 evf-CSV + X5 Health Widgets + renderAll/renderList + إشعارات التسجيل + X6 Customer360 + X7 Bulk/Filters · admin.html كان 6046–8080 ── */
// CSV export — exports ALL currently-loaded events (after tenant
// search filter, if any). UTF-8 BOM + CRLF for Excel Arabic compat.
async function evfExportCsv() {
  var search = (document.getElementById('evfSearch').value || '').trim().toLowerCase();
  var rows = search
    ? evfAllEvents.filter(function(ev) {
        var t = evfTenantMap[ev.trial_request_id];
        if (!t) return false;
        return (t.name + ' ' + t.email + ' ' + t.phone).toLowerCase().indexOf(search) >= 0;
      })
    : evfAllEvents.slice();

  if (rows.length === 0) {
    SyDialog.alert('لا توجد أحداث للتصدير. حاول توسيع الفلاتر أولاً.');
    return;
  }

  var headers = [
    'الوقت','نوع الحدث','العميل','الإيميل','الهاتف',
    'من خطة','إلى خطة','من حالة','إلى حالة',
    'من نهاية تجربة','إلى نهاية تجربة',
    'المبلغ','العملة','بواسطة','ملاحظات','ID'
  ];

  var data = rows.map(function(ev) {
    var t = evfTenantMap[ev.trial_request_id] || { name: '', email: '', phone: '' };
    var meta = EVF_EVENT_TYPES[ev.event_type] || { label_ar: ev.event_type };
    return [
      // عمداً SyDentXlsx.stamp لا المُنسّق العربي: ذاك يخدم سبعة مواضع عرض
      // على الشاشة ويبقى كما هو، لكن أرقامه الهندية بعمود إكسل نصٌّ لا ينفرز
      // ولا يُفلتر — والتصدير يحتاج النقيض تماماً.
      window.SyDentXlsx.stamp(ev.created_at),
      meta.label_ar + ' (' + ev.event_type + ')',
      t.name, t.email, t.phone,
      ev.from_plan || '', ev.to_plan || '',
      ev.from_status || '', ev.to_status || '',
      ev.from_trial_end || '', ev.to_trial_end || '',
      ev.amount == null ? '' : String(ev.amount),
      ev.currency || '',
      ev.performed_by || '',
      ev.notes || '',
      ev.id || ''
    ];
  });

  await window.SyDentXlsx.save({
    filename:  'أحداث-الاشتراكات-' + window.SyDentXlsx.today(),
    sheetName: 'أحداث الاشتراكات',
    headers:   headers,
    rows:      data,
    cols:      [{wch:18},{wch:28},{wch:22},{wch:26},{wch:15},{wch:12},{wch:12},
                {wch:12},{wch:12},{wch:14},{wch:14},{wch:12},{wch:8},{wch:22},
                {wch:30},{wch:38}]
  });
}

// ============================================================
// ===== Phase X5: Customer Health Widgets ====================
// ============================================================
//
// 4 KPIs computed client-side from allRequests on every render:
//
//   💰 MRR (Monthly Recurring Revenue)
//     Σ price_paid where plan='monthly' AND active-paid
//   + Σ (price_paid / 12) where plan='yearly' AND active-paid
//
//     "active-paid" excludes: permanent (no recurring price),
//     suspended, trial, grace-period-only, expired.
//
//   🟢 Active subscriptions
//     count of accounts where state === 'paid' AND !isPermanent
//
//   ⏰ Expiring soon (≤30 days)
//     count of accepted accounts with trial_end within 30 days.
//     Click → applies the existing 7-day expiringFilterActive
//     (we reuse the 7d filter, not a new 30d one, because the
//     alerts banner already targets 7d and we want a single
//     "expiring" axis. The widget surfaces the 30d horizon for
//     pipeline awareness; the click narrows to the urgent 7d.)
//
//   📈 Conversion rate (last 90 days)
//     paid_in_90d / (paid_in_90d + trial_in_90d) * 100
//     "in 90d" = created_at within 90 days.
//     trial_in_90d are still-active trials (haven't converted yet).
//
// Definitions documented in tooltip on each ⓘ icon.
// Rule: never block render on these — they're best-effort summaries
// computed from data already in memory. Zero DB queries added.
// ============================================================

function renderHealthWidgets(requests) {
  // requests is allRequests; guard against null/undefined on cold load.
  if (!requests || !Array.isArray(requests)) {
    requests = [];
  }

  // ---- 1. MRR ----
  // We iterate ALL accounts and accumulate MRR contribution.
  // Each account's contribution depends on its current computed
  // state — so we use the same computeAccountState the rest of
  // admin.html uses (single source of truth, rule #20).
  var mrrTotal = 0;
  var mrrByPlan = {}; // plan code -> count of contributing paid accounts (plan-agnostic)
  var mrrUsdUnset = 0; // Migration 105: USD subscribers we could NOT normalize (rate unset)
  requests.forEach(function(r) {
    var s = computeAccountState(r);
    // Only paid AND not permanent contributes to MRR
    if (s.state !== 'paid' || s.isPermanent) return;
    // Migration 105: normalize the paid amount to SYP FIRST (manual admin rate).
    // A USD amount with no rate set returns null → counted as "unset", never
    // silently added to a SYP total (mixing units would corrupt the metric).
    var amtSyp = toReportSyp(r.price_paid, r.currency);
    if (amtSyp == null) { mrrUsdUnset++; return; }
    var me = monthlyEquivPrice(r.plan, amtSyp, r.billing_cycle);
    if (me <= 0) return;
    mrrTotal += me;
    mrrByPlan[r.plan] = (mrrByPlan[r.plan] || 0) + 1;
    // ANY current/future plan code contributes via its own duration_days.
  });

  var mrrValueEl = document.getElementById('hcMrrValue');
  var mrrSubEl = document.getElementById('hcMrrSub');
  if (mrrValueEl && mrrSubEl) {
    if (mrrTotal > 0) {
      mrrValueEl.classList.remove('muted');
      // Round to nearest 1000 for readability; show as "1.2M" or "850K"
      mrrValueEl.innerHTML = formatCurrencyShort(mrrTotal) +
        ' <span class="health-unit">ل.س/شهر</span>';
    } else {
      mrrValueEl.classList.add('muted');
      mrrValueEl.innerHTML = '0 <span class="health-unit">ل.س</span>';
    }
    var parts = planBreakdownParts(mrrByPlan);
    var subTxt = parts.length > 0 ? parts.join(' · ') : 'لا يوجد اشتراك مدفوع نشط';
    // Migration 105: surface any USD subscribers excluded for a missing rate.
    if (mrrUsdUnset > 0) {
      subTxt += (parts.length ? ' · ' : '') + '⚠️ ' + mrrUsdUnset +
                ' بالدولار غير محتسب — اضبط «سعر صرف التقارير» في إعدادات المنصة';
    }
    mrrSubEl.textContent = subTxt;
  }

  // ---- 2. Active subscriptions ----
  var nActive = 0;
  var activeByPlan = {};
  requests.forEach(function(r) {
    var s = computeAccountState(r);
    if (s.state === 'paid' && !s.isPermanent) { nActive++; activeByPlan[r.plan] = (activeByPlan[r.plan] || 0) + 1; }
  });
  // Permanent accounts are tracked separately — they're "active"
  // but contribute nothing to MRR. We show them in the sub-text
  // so the admin understands the discrepancy with the active count.
  var nPermanent = 0;
  requests.forEach(function(r) {
    var s = computeAccountState(r);
    if (s.state === 'paid' && s.isPermanent) nPermanent++;
  });
  var actValueEl = document.getElementById('hcActiveValue');
  var actSubEl = document.getElementById('hcActiveSub');
  if (actValueEl && actSubEl) {
    actValueEl.classList.toggle('muted', nActive === 0);
    actValueEl.textContent = String(nActive);
    var actParts = planBreakdownParts(activeByPlan);
    if (nPermanent > 0) actParts.push(nPermanent + ' دائم');
    actSubEl.textContent = actParts.length > 0 ? actParts.join(' · ') : 'لا اشتراكات نشطة';
  }

  // ---- 3. Expiring soon (≤30 days) ----
  // Counts accepted accounts with trial_end within 30 days.
  // Permanent (trial_end === null) excluded by definition.
  var nowMs = Date.now();
  var thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  var nExpiring30 = 0;
  var nExpiring7 = 0;
  requests.forEach(function(r) {
    if (r.status !== 'accepted') return;
    if (!r.trial_end) return; // permanent or no end set
    var endMs = new Date(r.trial_end).getTime();
    if (!isFinite(endMs)) return;
    var diff = endMs - nowMs;
    if (diff < 0) return; // already expired
    if (diff <= thirtyDaysMs) nExpiring30++;
    if (diff <= 7 * 24 * 60 * 60 * 1000) nExpiring7++;
  });
  var expValueEl = document.getElementById('hcExpiringValue');
  var expSubEl = document.getElementById('hcExpiringSub');
  var expCardEl = document.getElementById('hcExpiring');
  if (expValueEl && expSubEl) {
    expValueEl.classList.toggle('muted', nExpiring30 === 0);
    expValueEl.textContent = String(nExpiring30);
    if (nExpiring30 === 0) {
      expSubEl.textContent = 'لا يوجد حسابات تنتهي خلال 30 يوم';
    } else {
      var subParts = ['خلال 30 يوم'];
      if (nExpiring7 > 0) subParts.push(nExpiring7 + ' خلال 7 أيام');
      subParts.push('اضغط للفلترة');
      expSubEl.textContent = subParts.join(' · ');
    }
  }
  // Reflect the existing expiring-filter state on the widget so
  // toggling stays consistent between the alerts banner and the widget.
  if (expCardEl) {
    expCardEl.classList.toggle('active', !!expiringFilterActive);
  }

  // ---- 4. Conversion rate (last 90 days) ----
  // Anti-pattern guard: division-by-zero. If there were no trial
  // requests in the last 90 days at all, we show "—" not "0%" or
  // "NaN%". The "—" tells the admin: "no signal yet, keep watching".
  var ninetyAgoMs = nowMs - 90 * 24 * 60 * 60 * 1000;
  var paid90 = 0;
  var trial90 = 0;
  requests.forEach(function(r) {
    if (!r.created_at) return;
    var createdMs = new Date(r.created_at).getTime();
    if (!isFinite(createdMs)) return;
    if (createdMs < ninetyAgoMs) return;
    // D9 (audit): exclude rejected/suspended accounts from the funnel
    // entirely (both numerator and denominator). A paid account that
    // got suspended later isn't a successful conversion — counting it
    // would inflate the rate. ChartMogul's standard "Net Conversion"
    // uses currently-active status only.
    if (r.status === 'rejected') return;
    // Count by current plan: a row that started as trial and
    // converted now has plan='monthly'/'yearly', so it counts as
    // "paid" in the funnel. A row still on trial counts as trial.
    if (r.plan && r.plan !== 'trial') {
      paid90++;
    } else {
      trial90++;
    }
  });
  var convValueEl = document.getElementById('hcConversionValue');
  var convSubEl = document.getElementById('hcConversionSub');
  if (convValueEl && convSubEl) {
    var total = paid90 + trial90;
    if (total === 0) {
      convValueEl.classList.add('muted');
      convValueEl.textContent = '—';
      convSubEl.textContent = 'لا يوجد طلبات في آخر 90 يوم';
    } else {
      var rate = (paid90 / total) * 100;
      convValueEl.classList.toggle('muted', rate === 0);
      // One decimal place, but show as integer when whole
      var rateStr = (rate % 1 === 0) ? rate.toFixed(0) : rate.toFixed(1);
      convValueEl.innerHTML = rateStr + ' <span class="health-unit">%</span>';
      convSubEl.textContent = paid90 + ' مدفوع من ' + total + ' (آخر 90 يوم)';
    }
  }
}

// Short currency formatter (1234567 → "1.2M", 850000 → "850K")
// Used only for MRR display where space is tight. For exact values,
// use toLocaleString('en-US'). Rule of thumb from ChartMogul: ARR/MRR
// dashboards use shortened units; tooltips show exact values.
function formatCurrencyShort(n) {
  if (!isFinite(n) || n <= 0) return '0';
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (n >= 10000) {
    return Math.round(n / 1000) + 'K';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return Math.round(n).toLocaleString('en-US');
}

// Click handler for the expiring widget — reuses the existing
// 7-day expiringFilterActive flag (same as the alerts banner).
// Toggle behavior matches: click again to deactivate.
function onExpiringWidgetClick() {
  if (window.adminGo) adminGo('cu'); /* ح1: نتيجة الفلترة تُعرض بقسم العملاء */
  expiringFilterActive = !expiringFilterActive;
  renderAlertsBanner();
  renderList();
  // Update widget's own active state immediately (renderAll would
  // refresh it, but we don't trigger a full reload here)
  var expCardEl = document.getElementById('hcExpiring');
  if (expCardEl) expCardEl.classList.toggle('active', expiringFilterActive);
}

function renderAll() {
  pruneActivityCaches();
  var nNew = allRequests.filter(function(r){ return !r.status || r.status === 'new'; }).length;
  var nAcc = allRequests.filter(function(r){ return r.status === 'accepted'; }).length;
  var nRej = allRequests.filter(function(r){ return r.status === 'rejected'; }).length;
  document.getElementById('countNew').textContent = nNew;
  document.getElementById('countAccepted').textContent = nAcc;
  document.getElementById('countRejected').textContent = nRej;

  // New-signup notifications (all driven by the nNew already computed above):
  //  1) count badge on the «جديد» filter tab (hidden at zero)
  //  2) browser-tab title badge so an admin on another tab still notices
  //  3) the top notification banner (respects this-session dismissal)
  var _newTabBadge = document.getElementById('newTabBadge');
  if (_newTabBadge) {
    _newTabBadge.textContent = nNew;
    _newTabBadge.style.display = nNew > 0 ? 'inline-block' : 'none';
  }
  // Nav pills + tab title — one renderer for both queues (new signups AND
  // pending upgrade/renew requests), so the two counters can never drift.
  renderAdminBadges();
  renderNewSignupsBanner(nNew);

  // Phase X5: refresh customer health widgets (MRR, active, expiring,
  // conversion). Computed from allRequests in memory — zero DB queries.
  // Placed BEFORE the expiringFilterActive auto-disengage so the widget
  // shows the up-to-date count even if the filter is about to be cleared.
  renderHealthWidgets(allRequests);

  // Phase 7.6C: if filter was active but the count just hit 0 (e.g. all
  // expiring trials got extended), auto-disengage to avoid showing an
  // empty list with the banner in active state.
  if (expiringFilterActive && allRequests.filter(isExpiringSoon).length === 0) {
    expiringFilterActive = false;
  }
  renderAlertsBanner();

  renderOvRevenue();   /* ح2 */
  renderOvAttention(); /* ح2 */

  renderList();
}

// === New-signup notifications =============================================
// Renders the top banner from the live nNew count. Hidden when there are no
// unreviewed signups OR the operator dismissed it this session. Dismissal is
// reset whenever a fresh signup arrives via realtime (subscribeNewSignups).
function renderNewSignupsBanner(nNew) {
  var b = document.getElementById('newSignupsBanner');
  if (!b) return;
  var msg = b.querySelector('.nsb-msg');
  if (nNew > 0 && !newBannerDismissed) {
    if (msg) {
      msg.textContent = 'لديك ' + nNew + ' ' +
        (nNew === 1 ? 'طلب تسجيل جديد' : 'طلبات تسجيل جديدة') + ' بانتظار المراجعة';
    }
    b.classList.add('show');
  } else {
    b.classList.remove('show');
  }
}

// Clicking the banner (anywhere except the ✕) switches to the «جديد» tab and
// scrolls the list into view. Reuses setFilter so there's one filter codepath.
function onNewSignupsBannerClick(e) {
  if (e && e.target && e.target.classList && e.target.classList.contains('ns-banner-close')) return;
  if (window.adminGo) adminGo('cu'); /* ح1: القائمة بقسم العملاء */
  var el = document.getElementById('tabNew');
  if (el) { setFilter('new', el); }
  else { currentFilter = 'new'; renderList(); }
  var lst = document.getElementById('reqList');
  if (lst && lst.scrollIntoView) lst.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onNewSignupsBannerKeydown(e) {
  if (!e) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    onNewSignupsBannerClick(e);
  }
}

// The ✕ hides the banner for this session without touching the filter.
// stopPropagation prevents the banner's own click handler from also firing.
function dismissNewSignupsBanner(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  newBannerDismissed = true;
  var b = document.getElementById('newSignupsBanner');
  if (b) b.classList.remove('show');
}

// Realtime: listen for new rows in trial_requests (a fresh self-signup).
// Requires Migration 69 (table added to the supabase_realtime publication);
// without it subscribe() still succeeds but no events arrive — graceful.
// RLS lets the platform admin receive every INSERT (is_platform_admin SELECT).
function subscribeNewSignups() {
  if (!window.sb || _newSignupChannel) return;
  try {
    _newSignupChannel = window.sb
      .channel('admin-new-signups')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'trial_requests' },
          function() {
            // Un-dismiss so the banner re-appears, then refresh the list +
            // counts. Debounced to coalesce a burst of inserts into one reload.
            newBannerDismissed = false;
            if (_newSignupRefreshTimer) clearTimeout(_newSignupRefreshTimer);
            _newSignupRefreshTimer = setTimeout(function() {
              _newSignupRefreshTimer = null;
              if (typeof loadAndRender === 'function') loadAndRender();
            }, 400);
          })
      .subscribe();
  } catch (e) { /* realtime is optional — the page works fully without it */ }
}

// === Unified attention badges (owner report 31 Aug 2026) ====================
// Stripe / Partner Center pattern: the count lives on the nav item where the
// action happens. «العملاء» carries unreviewed signups, «الطلبات» carries pending
// upgrade/renew requests, and the browser-tab title carries their sum so an
// admin parked on another tab still notices either. Reads both queues from
// memory (allRequests + SRQ_CACHE) — zero DB queries. Called from renderAll()
// and from renderSubRequests() so whichever loader finishes last still paints.
function renderAdminBadges() {
  var nNew = (allRequests || []).filter(function(r){ return !r.status || r.status === 'new'; }).length;
  var nSrq = (typeof SRQ_CACHE !== 'undefined' && SRQ_CACHE && SRQ_CACHE.length) ? SRQ_CACHE.length : 0;
  function pill(id, n) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'inline-block' : 'none';
  }
  pill('navBadgeCu', nNew);
  pill('navBadgeRq', nSrq);
  var total = nNew + nSrq;
  if (typeof ADMIN_BASE_TITLE !== 'undefined') {
    document.title = (total > 0 ? '(' + total + ') ' : '') + ADMIN_BASE_TITLE;
  }
}

// Realtime: listen for new rows in subscription_requests (a tenant asked to
// upgrade/renew from subscription.html). Requires Migration 133 (table added to
// the supabase_realtime publication); without it subscribe() still succeeds
// but no events arrive — graceful, exactly like subscribeNewSignups.
function subscribeSubRequests() {
  if (!window.sb || _srqChannel) return;
  try {
    _srqChannel = window.sb
      .channel('admin-sub-requests')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'subscription_requests' },
          function() {
            if (_srqRefreshTimer) clearTimeout(_srqRefreshTimer);
            _srqRefreshTimer = setTimeout(function() {
              _srqRefreshTimer = null;
              // loadSubRequests → renderSubRequests → badges + attention card.
              if (typeof loadSubRequests === 'function') loadSubRequests();
            }, 400);
          })
      .subscribe();
  } catch (e) { /* realtime is optional — the page works fully without it */ }
}

// Phase 7.6E-Part 2: renderList — state-aware rendering.
// Architecture:
//   1. computeAccountState(r) returns one of 6 states + metadata
//   2. The state determines: badge color/label, plan pill, daysLeft row,
//      WhatsApp reminder visibility, and which action buttons appear
//   3. Action buttons are context-sensitive (see table in comment below)
//
// Action button matrix:
// ┌──────────┬──────────────────────────────────────────────────────────┐
// │ state    │ buttons (left to right)                                   │
// ├──────────┼──────────────────────────────────────────────────────────┤
// │ new      │ [قبول التجربة] [رفض] [تعديل]                              │
// │ trial    │ [💎 ترقية] [⏸ إيقاف] [💬 تذكير?] [🗑 حذف] [تعديل] [نشاط] │
// │ paid     │ [🔄 تجديد] [💎 تغيير الخطة] [⏸ إيقاف] [💬 تذكير?]         │
// │          │ [🗑 حذف] [تعديل] [نشاط]                                   │
// │ grace    │ [💎 ترقية/تجديد] [⏸ إيقاف] [🗑 حذف] [تعديل] [نشاط]       │
// │ suspended│ [✅ إعادة تفعيل = استئناف كما كان] [🗑 حذف] [تعديل]         │
// │ expired  │ تجربة: [✅ إعادة تجربة] [⏰ سماح] [💎 ترقية إلى مدفوع] …   │
// │          │ مدفوع: [🔄 تجديد] [⏰ سماح] [💎 تغيير الخطة] … (M141)      │
// └──────────┴──────────────────────────────────────────────────────────┘
function renderList() {
  var list = document.getElementById('reqList');
  var filtered = allRequests.filter(function(r){
    var st = r.status || 'new';
    var passFilter = (currentFilter === 'all' || st === currentFilter);
    if (!passFilter || !matchesSearch(r)) return false;
    // Phase 7.6C: expiring-soon filter is layered on top of the tab filter
    // and search. When active, only rows that satisfy isExpiringSoon
    // survive. This is intentional: the banner activates a STRICTER view,
    // it doesn't replace the user's other filters.
    if (expiringFilterActive && !isExpiringSoon(r)) return false;
    // Phase X7: advanced filters are layered last (strictest), so they
    // intersect with all preceding filters (tab + search + expiring).
    if (!applyAdvancedFilters(r)) return false;
    return true;
  });

  // Phase X7: expose the filtered list to bulk operations so "select-all
  // visible" can iterate without re-running the filter chain.
  bulkState.lastFilteredIds = filtered.map(function(x){ return x.id; });
  // Drop any selections that are no longer in the visible list (the user
  // narrowed the filter — selected-but-hidden rows would be ambiguous to
  // bulk-act on, so we deselect them silently).
  bulkPruneHidden();
  // Toggle the select-all row visibility (hidden when the list is empty).
  var selAllRow = document.getElementById('bkSelectAllRow');
  if (selAllRow) selAllRow.style.display = filtered.length > 0 ? 'flex' : 'none';

  if (filtered.length === 0) {
    // Phase X9: contextual empty states with action-oriented copy. The icon,
    // title, message, and optional CTA depend on *why* the list is empty —
    // a no-results-from-search reads very differently from a brand-new
    // platform with zero signups (Stripe Stripe Apps empty-state guidance).
    var esIcon, esTitle, esMsg, esCtaHtml = '';
    if (expiringFilterActive) {
      esIcon  = '⏰';
      esTitle = 'لا توجد حسابات تنتهي قريباً';
      esMsg   = 'كل اشتراكاتك النشطة لديها أكثر من 7 أيام متبقية. الوضع آمن حالياً.';
      esCtaHtml = '<button type="button" class="es-cta" onclick="closeExpiringFilter(event)">إزالة فلتر الانتهاء القريب</button>';
    } else if (searchTerm) {
      esIcon  = '🔍';
      esTitle = 'لا توجد نتائج مطابقة';
      esMsg   = 'جرّب كلمات أقل أو افحص التهجئة. البحث يشمل الاسم، الهاتف، الإيميل، المدينة، والملاحظات.';
      esCtaHtml = '<button type="button" class="es-cta" onclick="clearSearch()">مسح البحث</button>';
    } else if (currentFilter === 'new') {
      esIcon  = '📭';
      esTitle = 'لا توجد طلبات جديدة';
      esMsg   = 'بمجرد أن يسجّل عميل جديد عبر صفحة الاشتراك، سيظهر طلبه هنا للمراجعة.';
    } else if (currentFilter === 'accepted') {
      esIcon  = '🟢';
      esTitle = 'لا توجد حسابات مقبولة';
      esMsg   = 'الحسابات التي تقبلها ستظهر هنا. يمكنك قبول طلبات من تبويب "الجديد".';
    } else if (currentFilter === 'rejected') {
      esIcon  = '🚫';
      esTitle = 'لا توجد حسابات مرفوضة';
      esMsg   = 'الحسابات التي ترفضها ستظهر هنا للأرشيف والمراجعة لاحقاً.';
    } else {
      esIcon  = '🌱';
      esTitle = 'لا توجد طلبات بعد';
      esMsg   = 'بمجرد أن يبدأ المستخدمون بالتسجيل عبر landing page، ستظهر طلباتهم هنا. شارك رابط منصّتك للبدء.';
    }
    list.innerHTML = (
      '<div class="es-box" role="status">' +
        '<div class="es-icon" aria-hidden="true">' + esIcon + '</div>' +
        '<div class="es-title">' + esTitle + '</div>' +
        '<div class="es-msg">' + esMsg + '</div>' +
        esCtaHtml +
      '</div>'
    );
    return;
  }
  list.innerHTML = filtered.map(function(r) {
    var id = r.id;
    var s = computeAccountState(r);

    // Phase X1: admin badge + promote/demote button visibility.
    // isAdmin: this tenant's user_id is in the admins Set.
    // isCurrentAdmin: this card is for the admin viewing the page (self).
    // canPromote: permanent paid account, not admin, not self, has user_id.
    // canDemote: is admin, not self, has user_id (count guard happens at
    //            action time — too expensive to re-query per card).
    var isAdmin = !!(adminUserIdsCache && r.user_id && adminUserIdsCache.has(r.user_id));
    var isCurrentAdmin = (r.user_id && r.user_id === currentAdminUserId);
    var canPromote = (s.state === 'paid' && s.isPermanent && !isAdmin && !isCurrentAdmin && !!r.user_id);
    var canDemote = (isAdmin && !isCurrentAdmin && !!r.user_id);
    var adminBadgeHtml = isAdmin ? '<span class="req-admin-badge">👑 Admin</span>' : '';

    // Trial badge row (the ⏰ daysLeft pill). Same color thresholds as
    // pre-Part 2 — red ≤5, yellow ≤10, green >10 — but now driven by
    // state rather than just status.
    var trialBadgeHtml = '';
    if (s.state === 'paid' && s.isPermanent) {
      trialBadgeHtml = '<div class="req-info-row" style="color:var(--green)">♾️ <span>حساب دائم</span></div>';
    } else if (s.state === 'trial' || s.state === 'paid') {
      var dl = s.daysLeft;
      if (dl !== null) {
        var color = dl <= 5 ? 'var(--red)' : dl <= 10 ? 'var(--orange)' : 'var(--green)';   // v378: tokens
        var txt = dl > 0 ? 'تنتهي خلال ' + dl + ' يوم' : 'انتهت';
        trialBadgeHtml = '<div class="req-info-row" style="color:' + color + '">⏰ <span>' + txt + '</span></div>';
      }
    } else if (s.state === 'grace') {
      trialBadgeHtml = '<div class="req-info-row" style="color:var(--orange)">🟠 <span>فترة سماح — متبقي ' + s.daysLeft + ' يوم</span></div>';
    } else if (s.state === 'expired') {
      trialBadgeHtml = '<div class="req-info-row" style="color:var(--text2)">⏰ <span>' + (((s.plan || 'trial') === 'trial') ? 'انتهت التجربة — الحساب محجوب' : 'انتهى الاشتراك — للقراءة فقط') + '</span></div>';
    } else if (s.state === 'suspended') {
      trialBadgeHtml = '<div class="req-info-row" style="color:var(--red)">⛔ <span>الحساب موقوف</span></div>';
    }

    // Migration 110 — AI override row. Rendered ONLY when an override is set
    // (true/false), so the default population of tenants (NULL = follow the
    // plan) sees no visual change at all. An exception should look like an
    // exception in the list.
    var aiOvRowHtml = '';
    if (r.ai_override === true) {
      aiOvRowHtml = '<div class="req-info-row" style="color:var(--green)">🤖 <span>الذكاء الاصطناعي: مفعّل بتجاوز إداري</span></div>';
    } else if (r.ai_override === false) {
      aiOvRowHtml = '<div class="req-info-row" style="color:var(--red)">🤖 <span>الذكاء الاصطناعي: مطفأ بتجاوز إداري</span></div>';
    }

    // State badge in card header. Plan pill shown for paid/grace states
    // so the operator can see at a glance which plan is in force.
    // M141: also for an expired or suspended PAID account — its plan is kept
    // (resume/renew restore it), so the card must say which one it is.
    var planPillHtml = '';
    var paidAtRest = (s.state === 'expired' || s.state === 'suspended') && (s.plan || 'trial') !== 'trial';
    if ((s.state === 'paid' || s.state === 'grace' || paidAtRest) && !s.isPermanent) {
      var planLabel = planDisplayName(s.plan);
      // Post-X13 a tier (Mini/Max) can be billed monthly OR yearly, so the tier
      // name alone no longer implies the cycle — surface billing_cycle here.
      var planCyc = cycleLabelArOrEmpty(r.billing_cycle);
      planPillHtml = '<span class="req-plan-pill">' + planLabel + (planCyc ? ' · ' + planCyc : '') + '</span>';
    }
    var stateBadge = '<div style="display:flex;align-items:center;">' + adminBadgeHtml + planPillHtml +
                     '<span class="req-state ' + s.state + '">' + s.label + '</span></div>';

    // Shared buttons (used in multiple states)
    // v485: أزرارُ البطاقة على طقم أزرار الصفوف — الأخضرُ للفعل المتقدِّم، البرتقاليُّ للإيقاف، الأحمرُ للحذف/الرفض.
    //       الترتيب: الأساسيّ ← بقيةُ دورة الحياة ← الواتساب ← تعديل · ملف العميل · النشاط ← إيقاف ← حذف.
    var editBtn = '<button class="sy-act" onclick="openEditModal(\'' + id + '\')">✏️ تعديل</button>';
    var c360Btn = '<button class="sy-act" onclick="openCustomer360(\'' + id + '\')">👤 ملف العميل</button>';
    var deleteBtn = '<button class="sy-act sy-act-danger" onclick="deleteAccount(\'' + id + '\', \'' + jsAttr(r.email||'') + '\')">🗑️ حذف</button>';
    var suspendBtn = '<button class="sy-act sy-act-warn" onclick="suspendAccount(\'' + id + '\', \'' + jsAttr(r.email||'') + '\')">⏸️ إيقاف</button>';
    var activityBtn = '<button class="sy-act" onclick="toggleActivity(\'' + id + '\')">' +
                      (activityExpanded[id] ? '📊 إخفاء النشاط' : '📊 عرض النشاط') + '</button>';

    // WhatsApp reminder — only meaningful for trial/paid with active expiry.
    // Permanent and grace accounts don't get one (different message contexts).
    //
    // Phase X3: waReminderLink is now async (reads template from DB), so the
    // <a href> can't be built inline in this sync loop. Instead the anchor
    // calls openWaReminder() which builds + opens on click. jsAttr() escapes
    // the name for safe embedding in the onclick string literal.
    // Resolve the operational WhatsApp number once: the clinic's settings phone
    // (clinic_settings.clinic_phone — doctor-controlled, dynamic) takes priority;
    // fall back to the registration phone for old leads with no clinic_settings
    // row. Used for BOTH the send target and the show/hide gates below, so a
    // doctor who set their WhatsApp number in settings always gets the buttons.
    var waPhoneRaw = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
    var waContactExtra = (r.user_id && clinicContactByUid[r.user_id]) ? clinicContactByUid[r.user_id] : '';
    // Same live-data-first pattern as the phone: the owner's current personal
    // name (clinic_employees, synced to auth) beats the frozen signup name —
    // a doctor who renamed themselves gets addressed correctly in WA messages.
    var waOwnerName = (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || '');

    var waReminderBtn = '';
    if ((s.state === 'trial' || s.state === 'paid') && !s.isPermanent && r.trial_end && s.daysLeft !== null && s.daysLeft > 0) {
      var safePhone = jsAttr(waPhoneRaw);
      var safeName  = jsAttr(waOwnerName);
      var safeEnd   = jsAttr(r.trial_end || '');
      waReminderBtn = '<a href="#" onclick="return openWaReminder(\'' + safePhone +
                      '\',\'' + safeName + '\',' + Number(s.daysLeft) +
                      ',\'' + safeEnd + '\',\'' + jsAttr(planDisplayName(s.plan)) + '\',event)" class="sy-act">💬 تذكير</a>';
    }

    // 👋 Welcome resend — Industry pattern (Oracle/Adobe/GitLab): every
    // accepted account exposes a "resend welcome" affordance. Excluded
    // states: 'new' (no user_id yet) and 'suspended' (sending login credits
    // to a paused account is contradictory — wa_suspended is the right
    // template for that case instead). Phone gate is mandatory.
    var waWelcomeBtn = '';
    if (s.state !== 'new' && s.state !== 'suspended' && waPhoneRaw) {
      var wlPhone = jsAttr(waPhoneRaw);
      var wlName  = jsAttr(waOwnerName);
      var wlEmail = jsAttr((r.user_id && ownerEmailByUid[r.user_id]) ? ownerEmailByUid[r.user_id] : (r.email || ''));
      waWelcomeBtn = '<a href="#" onclick="return openWaWelcome(\'' + wlPhone +
                     '\',\'' + wlName + '\',\'' + wlEmail +
                     '\',event)" class="sy-act">👋 ترحيب</a>';
    }

    // ⏸ Suspended notice — only meaningful for currently-suspended rows.
    // No daysLeft/trial_end variables to pre-fill; just {name}.
    var waSuspendedBtn = '';
    if (s.state === 'suspended' && waPhoneRaw) {
      var spPhone = jsAttr(waPhoneRaw);
      var spName  = jsAttr(waOwnerName);
      waSuspendedBtn = '<a href="#" onclick="return openWaSuspended(\'' + spPhone +
                       '\',\'' + spName + '\',event)" class="sy-act">⏸️ إشعار إيقاف</a>';
    }

    // ✅ Renewal notice — admin's discretion (decision: always available
    // for paid non-permanent accounts, not gated to a recent renew). Plan
    // label is the Arabic display string already used by planPillHtml so
    // the rendered WA body reads "📋 الخطة: سنوي" not "yearly".
    var waRenewedBtn = '';
    if (s.state === 'paid' && !s.isPermanent && waPhoneRaw && r.trial_end) {
      var rnPhone = jsAttr(waPhoneRaw);
      var rnName  = jsAttr(waOwnerName);
      var rnPlanLabel = planDisplayName(s.plan);
      var rnPlan  = jsAttr(rnPlanLabel);
      var rnEnd   = jsAttr(r.trial_end || '');
      var rnPrice = jsAttr(String(r.price_paid == null ? '' : r.price_paid));
      var rnCurr  = jsAttr(r.currency || 'SYP'); // Migration 105
      waRenewedBtn = '<a href="#" onclick="return openWaRenewed(\'' + rnPhone +
                     '\',\'' + rnName + '\',\'' + rnPlan +
                     '\',\'' + rnEnd + '\',\'' + rnPrice +
                     '\',event,\'' + rnCurr + '\')" class="sy-act">✅ إشعار تجديد</a>';
    }

    // Per-state action button assembly
    // v486 (المالك: «أول 3 أزرار الخطة والتجديد مع بعض، فاصل صغير، أزرار المراسلات، بعدين ملف ونشاط، بعدين إيقاف حذف»):
    //       أربعُ مجموعاتٍ بينها فاصلٌ صغير (.sy-acts-sep) — الخطة/التجديد · المراسلات · الملف والنشاط · الإيقاف والحذف.
    //       مجموعةٌ فارغة تُسقَط فلا فاصلان متتاليان.
    var planG = '', msgG = '', fileG = editBtn + c360Btn, endG = '';
    switch (s.state) {
      case 'new':
        planG = '<button class="sy-act sy-act-primary" data-id="' + id + '" onclick="accept(\'' + id + '\')">✅ قبول وتفعيل التجربة</button>';
        endG = '<button class="sy-act sy-act-danger" onclick="reject(\'' + id + '\')">❌ رفض</button>';
        break;
      case 'trial':
        planG = '<button class="sy-act sy-act-primary" onclick="openConvertPicker(\'' + id + '\')">💎 ترقية إلى مدفوع</button>';
        msgG = waReminderBtn + waWelcomeBtn;
        fileG += activityBtn;
        endG = suspendBtn + deleteBtn;
        break;
      case 'paid':
        if (s.isPermanent) {
          var promoteBtn = canPromote
            ? '<button class="sy-act" onclick="promoteToAdmin(\'' + id + '\')">👑 ترقية إلى Admin</button>'
            : '';
          var demoteBtn = canDemote
            ? '<button class="sy-act sy-act-warn" onclick="demoteFromAdmin(\'' + id + '\')">👤 إنزال من Admin</button>'
            : '';
          planG = '<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\')">💎 تغيير الخطة</button>';
          msgG = waWelcomeBtn;
          fileG += activityBtn + promoteBtn;
          endG = demoteBtn + suspendBtn + deleteBtn;
        } else {
          planG = '<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\')">🔄 تجديد</button>' +
                  '<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\')">💎 تغيير الخطة</button>';
          msgG = waReminderBtn + waWelcomeBtn + waRenewedBtn;
          fileG += activityBtn;
          endG = suspendBtn + deleteBtn;
        }
        break;
      case 'grace':
        planG = '<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\')">🔄 تجديد</button>' +
                '<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\')">💎 تغيير الخطة</button>';
        msgG = waWelcomeBtn;
        fileG += activityBtn;
        endG = suspendBtn + deleteBtn;
        break;
      case 'expired':
        var expTrial = (s.plan || 'trial') === 'trial';
        planG = (expTrial
                    ? '<button class="sy-act sy-act-primary" onclick="restartTrial(\'' + id + '\')">✅ إعادة تجربة 30 يوم</button>'
                    : '<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\')">🔄 تجديد</button>') +
                '<button class="sy-act" onclick="grantGrace(\'' + id + '\')">⏰ منح فترة سماح 14 يوم</button>' +
                '<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\')">' + (expTrial ? '💎 ترقية إلى مدفوع' : '💎 تغيير الخطة') + '</button>';
        msgG = waWelcomeBtn;
        fileG += activityBtn;
        endG = suspendBtn + deleteBtn;
        break;
      case 'suspended':
        planG = '<button class="sy-act sy-act-primary" onclick="reactivateAccount(\'' + id + '\')">✅ إعادة تفعيل</button>';
        msgG = waSuspendedBtn;
        endG = deleteBtn;
        break;
    }
    var actions = [planG, msgG, fileG, endG].filter(Boolean)
      .map(function (g) { return '<span class="sy-acts-grp">' + g + '</span>'; })   // المجموعةُ تلتفّ كتلةً واحدة لا زرّاً زرّاً
      .join('<span class="sy-acts-sep" aria-hidden="true"></span>');

    var cardStatusClass = r.status || 'new';

    // Extension widget appears for any row with a trial_end (i.e. not
    // a permanent account and not a brand-new request). This includes
    // trial, paid (non-permanent), grace, and expired states — operators
    // sometimes need to adjust an already-expired trial_end before
    // making other decisions.
    // NOTE: the trial-duration adjuster widget was RELOCATED out of the card
    // into the 360° drawer's "actions" tab — see c360BuildActions(). The card
    // no longer renders it (kept the cards compact / less noisy).

    // Activity panel: show for any accepted (active or expired) state.
    // Suspended rows have no meaningful "last active" data exposed.
    var showActivityPanel = (s.state !== 'new' && s.state !== 'suspended');

    // Phase X7: bulk selection support. Each card carries a checkbox in
    // the top-right corner. When the row's id is in bulkState.selected,
    // the card gets the bk-selected outline class (visual confirmation
    // without needing to scroll up to the bulk bar).
    var isBulkSelected = bulkState.selected.has(id);
    var bulkClass = isBulkSelected ? ' bk-selected' : '';
    var bulkCheckHtml = '<input type="checkbox" class="bk-card-check"' +
                       (isBulkSelected ? ' checked' : '') +
                       ' onclick="bkToggleSelect(\'' + id + '\', event)" ' +
                       'aria-label="تحديد للإجراء الجماعي">';

    var _clinicName = (r.user_id && clinicNameByUid[r.user_id]) ? clinicNameByUid[r.user_id] : '';
    var _contactName = (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || '');
    var _primaryName = _clinicName || _contactName || '—';
    var _subNameHtml = (_clinicName && _contactName)
      ? '<div class="req-name-sub">👤 ' + escapeHtml(_contactName) + '</div>'
      : '';

    return '<div class="req-card ' + cardStatusClass + bulkClass + '">' +
      bulkCheckHtml +
      '<div class="req-top">' +
        '<div><div class="req-name">' + escapeHtml(_primaryName) + '</div>' + _subNameHtml + '</div>' +
        stateBadge +
      '</div>' +
      '<div class="req-info">' +
        // القيم الثلاث لاتينية/رقمية ⇒ .ltr-val (البريد المُصنَّع يبدأ برقم فينقلب رسمه
        // داخل البطاقة العربية بلا عزل — مُبلَّغ حيّاً؛ التفاصيل بتعليق القاعدة بـadmin.css).
        '<div class="req-info-row">📱 <span class="ltr-val">' + (escapeHtml(waPhoneRaw) || '—') + '</span></div>' +
        (waContactExtra ? '<div class="req-info-row">📞 <span class="ltr-val">' + escapeHtml(waContactExtra) + '</span></div>' : '') +
        (r.email ? '<div class="req-info-row">📧 <span class="ltr-val">' + escapeHtml(r.email) + '</span></div>' : '') +
        // يظهر عند الافتراق فقط — رقم الدخول الفعلي (trial_requests.phone).
        (divergentLoginPhone(r.phone, waPhoneRaw)
          ? '<div class="req-info-row">🔑 <span class="ltr-val">' + escapeHtml(divergentLoginPhone(r.phone, waPhoneRaw)) + '</span> <span style="font-size:11px;color:var(--text2)">رقم الدخول</span></div>'
          : '') +
        (synBranchOf(r) ? '<div class="req-info-row">🏛️ <span>' + escapeHtml(synBranchOf(r)) + '</span></div>' : '') +
        (synNoOf(r)     ? '<div class="req-info-row">🆔 <span>' + escapeHtml(synNoOf(r))     + '</span></div>' : '') +
        (r.notes ? '<div class="req-info-row">📝 <span>' + escapeHtml(r.notes) + '</span></div>' : '') +
        '<div class="req-info-row">🕐 <span>' + formatDate(r.created_at) + '</span></div>' +
        trialBadgeHtml +
        aiOvRowHtml +
      '</div>' +
      '<div class="req-actions sy-acts">' + actions + '</div>' +
      (showActivityPanel ? renderActivityPanel(id) : '') +
    '</div>';
  }).join('');
}

// === Phase X6 — Customer 360° Drawer ========================================
//
// Side drawer offering a deeper, organised view of a single tenant:
//   - Overview tab   : KPIs, subscription summary, health score
//   - Timeline tab   : subscription_events for this customer (paginated)
//   - Risk tab       : derived churn signals (idle days, plan, sign-in age)
//   - Actions tab    : re-grouped versions of existing renderList actions
//   - Communications : Phase 8 placeholder
//
// The drawer is READ-MOSTLY. All mutating actions defer to the existing
// renderList action functions (accept/reject/extend/suspend/promote/…) so
// there's exactly one source of truth per mutation. This keeps the audit
// surface small and the diff focused on UI composition rather than new DB
// pathways.
//
// State model:
//   c360State.requestId    — the trial_requests.id currently shown
//   c360State.events       — cached events list (lazy-loaded on first tab visit)
//   c360State.eventsLoaded — flag so we don't re-fetch on every tab switch
//   c360State.activeTab    — 'overview' | 'timeline' | 'risk' | 'actions' | 'comm'
//   c360State.escHandler   — bound Esc handler (so we can removeEventListener on close)
//
// Re-entry: closing & reopening for the SAME customer keeps the events
// cache; switching to a DIFFERENT customer clears it. This mirrors the
// per-customer cache strategy used by the Phase 7.6B activity panel.
var c360State = {
  requestId: null,
  events: [],
  eventsLoaded: false,
  // Concurrency guard: true while c360LoadEvents is in flight. Prevents
  // c360RenderTab('timeline') from launching a second fetch when a first
  // one is still pending (which would cause the "جارٍ تحميل" stuck UI
  // observed in the v43 live test for د. مجدي بورج).
  eventsLoading: false,
  activeTab: 'overview',
  escHandler: null,
  // Token-based latest-wins guard (rule #55). Incremented on every events
  // fetch; the resolver checks myToken === loadEventsToken before applying
  // results. Protects against the user switching between customers while
  // an earlier fetch is still in flight.
  loadEventsToken: 0
};

// Open the drawer for a given trial_requests row id. Idempotent —
// calling twice in a row with the same id is a no-op apart from rebinding
// the body. Different ids clear the events cache.
function openCustomer360(reqId) {
  if (!reqId) return;
  var r = allRequests.find(function(x){ return x.id === reqId; });
  if (!r) {
    SyDialog.alert('لم يتم العثور على بيانات العميل.');
    return;
  }
  // Reset event cache only when switching customers.
  if (c360State.requestId !== reqId) {
    c360State.events = [];
    c360State.eventsLoaded = false;
    // Don't carry the in-flight flag across customers — a previous
    // customer's pending fetch is already invalidated by the token bump.
    c360State.eventsLoading = false;
  }
  c360State.requestId = reqId;
  c360State.activeTab = 'overview';
  // بند #9 — تصفير سرد الخطر مع كل فتح (قاعدة #394): الصندوق ناتجُ
  // عميلٍ بعينه، وبقاؤه عبر فتحتين خطرُ قراءة سردِ حسابٍ على آخر.
  c360AiReset();

  // Header. Prefer the live clinic name (clinic_settings.clinic_name) as the
  // prominent identity, mirroring the customer card; the signup/contact name is
  // surfaced in the Identity section below.
  var _c360Clinic = (r.user_id && clinicNameByUid[r.user_id]) ? clinicNameByUid[r.user_id] : '';
  var _c360Contact = (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || '');
  var nameEl    = document.getElementById('c360Name');
  var emailEl   = document.getElementById('c360Email');
  var avatarEl  = document.getElementById('c360Avatar');
  var badgesEl  = document.getElementById('c360Badges');
  var createdEl = document.getElementById('c360Created');
  var userIdEl  = document.getElementById('c360UserId');
  if (nameEl)   nameEl.textContent = _c360Clinic || _c360Contact || '—';
  var _c360Wa = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
  if (emailEl) {
    emailEl.textContent = r.email || (_c360Wa ? ('📞 ' + _c360Wa) : '—');
    // العزل عند البريد حصراً — سطر الاحتياط يبدأ برمز 📞 وقلبُ اتجاهه ينقل الرمز
    // للطرف الآخر بلا داعٍ؛ toggle كي يُنزَع عند إعادة فتح الدرج لعميل بلا بريد.
    emailEl.classList.toggle('ltr-val', !!r.email);
  }
  if (avatarEl) avatarEl.textContent = c360AvatarInitial(_c360Clinic || _c360Contact || r.email || '?');
  if (createdEl) createdEl.textContent = r.created_at ? ('انضم: ' + evfFormatTimestamp(r.created_at)) : '';
  if (userIdEl)  userIdEl.textContent = r.user_id ? ('uid: ' + String(r.user_id).slice(0, 8) + '…') : '';

  // Header badges — mirror the renderList badges so the drawer header
  // matches the card visually.
  //
  // NOTE on duplication: for paid yearly/monthly, computeAccountState
  // already returns label='سنوي'/'شهري'. The card layout uses BOTH a
  // plan-pill AND the state badge because the pill carries no text-
  // emphasis colour. In the drawer's tighter header, showing both
  // produces a literal "سنوي سنوي" repetition that looks like a bug,
  // so we skip the plan-pill here. The state badge alone carries the
  // plan name for paid rows.
  if (badgesEl) {
    var s = computeAccountState(r);
    var isAdmin = !!(adminUserIdsCache && r.user_id && adminUserIdsCache.has(r.user_id));
    var html = '';
    if (isAdmin) html += '<span class="req-admin-badge">👑 Admin</span>';
    // (plan-pill intentionally omitted — see comment above)
    html += '<span class="req-state ' + c360EscapeHtml(s.state) + '">' + c360EscapeHtml(s.label || '') + '</span>';
    badgesEl.innerHTML = html;
  }

  // Tabs: reset active state to overview
  var tabs = document.querySelectorAll('#c360Tabs .c360-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === 'overview');
  }

  // Render the overview tab body
  c360RenderTab('overview');

  // Open the drawer
  var ov = document.getElementById('c360Overlay');
  var dr = document.getElementById('c360Drawer');
  if (ov) ov.classList.add('open');
  if (dr) dr.classList.add('open');

  // Bind Esc-to-close. Store the reference so we can detach on close.
  if (!c360State.escHandler) {
    c360State.escHandler = function(e) {
      if (e.key === 'Escape') closeCustomer360();
    };
    document.addEventListener('keydown', c360State.escHandler);
  }

  // Lock body scroll while drawer is open (best-effort — won't break the
  // page if anything goes wrong).
  try { document.body.style.overflow = 'hidden'; } catch(e) {}

  // Bug-fix (v43 live test): auto-fetch activity stats if not cached.
  // Without this, opening the drawer for a customer whose "📊 عرض النشاط"
  // button hadn't been clicked yet shows "—" for patients/appointments/
  // employees/last-sign-in across Overview and Risk tabs. The Phase 7.6B
  // toggle still works as before for the inline panel; we just don't
  // require it as a precondition for the drawer.
  //
  // We do NOT call renderList() inside the loader's auto-renders to keep
  // the page stable while the drawer is open; instead we re-render only
  // the currently visible tab.
  if (r.user_id && (!activityCache[r.id] || (!activityCache[r.id].loaded && !activityCache[r.id].loading))) {
    var loadingReqId = reqId;
    fetchActivityFor(r.user_id, r.id).then(function(){
      // Re-render only if drawer is still open for the SAME customer
      // (rule #55 latest-wins). Other tabs read the same cache lazily.
      if (c360State.requestId === loadingReqId) {
        c360RenderTab(c360State.activeTab);
      }
    }).catch(function(err){
      console.warn('c360 auto-fetch activity failed:', err);
    });
  }
}

function closeCustomer360() {
  var ov = document.getElementById('c360Overlay');
  var dr = document.getElementById('c360Drawer');
  if (ov) ov.classList.remove('open');
  if (dr) dr.classList.remove('open');
  if (c360State.escHandler) {
    document.removeEventListener('keydown', c360State.escHandler);
    c360State.escHandler = null;
  }
  try { document.body.style.overflow = ''; } catch(e) {}
}

function c360SwitchTab(tab) {
  if (!tab) return;
  c360State.activeTab = tab;
  var tabs = document.querySelectorAll('#c360Tabs .c360-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tab);
  }
  c360RenderTab(tab);
}

function c360RenderTab(tab) {
  var body = document.getElementById('c360Body');
  if (!body) return;
  var r = allRequests.find(function(x){ return x.id === c360State.requestId; });
  if (!r) { body.innerHTML = '<div class="c360-empty">⚠️ لم يتم العثور على البيانات</div>'; return; }

  if (tab === 'overview') {
    body.innerHTML = c360BuildOverview(r);
  } else if (tab === 'timeline') {
    body.innerHTML = c360BuildTimeline(r);
    // Lazy-load events on first visit. We use two flags here:
    //   eventsLoaded — fetch has completed (success or failure)
    //   eventsLoading — fetch is in flight; another caller must NOT
    //                   restart it (would cause token races + the
    //                   "جارٍ تحميل" stuck symptom from v43 live test).
    if (!c360State.eventsLoaded && !c360State.eventsLoading) {
      var currentReqId = c360State.requestId;
      c360State.eventsLoading = true;
      c360LoadEvents(r).then(function(){
        c360State.eventsLoading = false;
        // Re-render only if user is still on the timeline tab AND still
        // looking at the same customer (rule #55).
        if (c360State.activeTab === 'timeline' && c360State.requestId === currentReqId) {
          var b = document.getElementById('c360Body');
          if (b) b.innerHTML = c360BuildTimeline(r);
        }
      }).catch(function(err){
        c360State.eventsLoading = false;
        console.warn('c360 timeline lazy-load failed:', err);
        // Surface failure in UI so the user isn't stuck on the spinner.
        c360State.eventsLoaded = true;
        c360State.events = [];
        if (c360State.activeTab === 'timeline' && c360State.requestId === currentReqId) {
          var b2 = document.getElementById('c360Body');
          if (b2) b2.innerHTML = c360BuildTimeline(r);
        }
      });
    }
  } else if (tab === 'risk') {
    body.innerHTML = c360BuildRisk(r);
    // النصّ يُدهَن بعد الـinnerHTML بـtextContent حصراً — صفر سطح XSS،
    // والسرد ينجو من التنقّل بين التبويبات بلا نداء AI ثانٍ.
    c360AiHydrate();
  } else if (tab === 'actions') {
    body.innerHTML = c360BuildActions(r);
  } else if (tab === 'comm') {
    body.innerHTML = c360BuildComm(r);
  } else if (tab === 'payments') {
    body.innerHTML = c360BuildPayments(r);
    // Lazy-load this tenant's payments on first visit / when cache is for
    // a different tenant. Re-render only if still on this tab + tenant (rule #55).
    if (r.user_id && (C360_PAYMENTS.userId !== r.user_id || (!C360_PAYMENTS.loaded && !C360_PAYMENTS.loading))) {
      var curPayId = c360State.requestId;
      loadTenantPayments(r.user_id).then(function(){
        if (c360State.activeTab === 'payments' && c360State.requestId === curPayId) {
          var b = document.getElementById('c360Body');
          if (b) b.innerHTML = c360BuildPayments(r);
        }
      }).catch(function(err){ console.warn('c360 payments lazy-load failed:', err); });
    }
  }
}

// ─── Tab builders ────────────────────────────────────────────────────────────

function c360BuildOverview(r) {
  // رقم واتساب العيادة — يُحسب محلياً. النسخة الأولى أشارت إلى `_c360Wa`
  // المُعرَّف داخل openCustomer360، وهو خارج نطاق هذه الدالة ⇒ ReferenceError
  // عند فتح ملف العميل (بلاغ حيّ). التعبير مطابق حرفياً لبقية المواضع.
  var _ovWa = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
  var s = computeAccountState(r);
  var health = c360ComputeHealth(r, s);
  var act = activityCache[r.id]; // re-use Phase 7.6B cache when available
  var mrr = c360ComputeMrrFor(r, s);

  // Format helpers
  var planLabel = s.isPermanent ? '♾️ دائم' : srqPlanLabel(s.plan);
  var statusWord = s.state === 'paid' ? 'نشط'
                 : s.state === 'trial' ? 'تجربة'
                 : s.state === 'grace' ? 'فترة سماح'
                 : s.state === 'expired' ? (s.label || 'منتهي')
                 : s.state === 'suspended' ? 'موقوف'
                 : s.state === 'new' ? 'قيد المراجعة' : (s.label || '—');
  var expiryText = !r.trial_end ? '—' : evfFormatTimestamp(r.trial_end);
  var daysLeftText = s.daysLeft === null ? '—' : (s.daysLeft > 0 ? (s.daysLeft + ' يوم') : 'منتهي');
  // Migration 105: the subscription's own currency, not a hardcoded ل.س.
  var priceText = (r.price_paid != null && Number(r.price_paid) > 0)
    ? Number(r.price_paid).toLocaleString('en-US') + ' ' + currencyLabelAr(r.currency)
    : '—';
  var lastSignInText = act && act.lastSignIn ? evfFormatTimestamp(act.lastSignIn) : '—';
  var lastActivityText = act && act.lastActivity ? evfFormatTimestamp(act.lastActivity) : '—';
  var onlineText = isOnlineNow(act) ? '🟢 متصل الآن' : '⚪ غير متصل';
  var patientsCount     = (act && typeof act.patients === 'number')     ? act.patients     : '—';
  var appointmentsCount = (act && typeof act.appointments === 'number') ? act.appointments : '—';
  var employeesCount    = (act && typeof act.employees === 'number')    ? act.employees    : '—';

  // Health score ring (CSS variable for the conic-gradient sweep)
  var healthPct = Math.max(0, Math.min(100, health.score));
  var healthColor = healthPct >= 70 ? 'var(--green)' : healthPct >= 40 ? 'var(--orange)' : 'var(--red)';

  return ''
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">💚 صحة الحساب</div>'
    +   '<div class="c360-health">'
    +     '<div class="c360-health-ring" style="background: conic-gradient(' + healthColor + ' ' + healthPct + '%, var(--bg3) ' + healthPct + '%);">'
    +       '<span class="c360-health-ring-text">' + healthPct + '</span>'
    +     '</div>'
    +     '<div class="c360-health-info">'
    +       '<div class="c360-health-label">' + c360EscapeHtml(health.tier) + '</div>'
    +       '<div class="c360-health-value">' + c360EscapeHtml(health.summary) + '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'

    + '<div class="c360-card">'
    +   '<div class="c360-card-title">📊 المؤشّرات</div>'
    +   '<div class="c360-kpi-grid">'
    +     c360Kpi('💰 الاشتراك الشهري', mrr.text, mrr.sub, mrr.color)
    +     c360Kpi('👨‍⚕️ المرضى', patientsCount === '—' ? '—' : Number(patientsCount).toLocaleString('en-US'), 'إجمالي', 'blue')
    +     c360Kpi('📅 المواعيد', appointmentsCount === '—' ? '—' : Number(appointmentsCount).toLocaleString('en-US'), 'إجمالي', 'blue')
    +     c360Kpi('👥 الموظفون', employeesCount === '—' ? '—' : String(employeesCount), 'النشطون', 'blue')
    +   '</div>'
    + '</div>'

    + '<div class="c360-card">'
    +   '<div class="c360-card-title">📋 الاشتراك</div>'
    +   c360Row('الخطة', planLabel)
    +   (cycleLabelArOrEmpty(r.billing_cycle) ? c360Row('الدورة', cycleLabelArOrEmpty(r.billing_cycle)) : '')
    +   c360Row('السعر المدفوع', priceText)
    +   c360Row('الحالة', c360EscapeHtml(statusWord))
    +   c360Row('ينتهي في', expiryText)
    +   c360Row('متبقّي', daysLeftText)
    + '</div>'

    + '<div class="c360-card">'
    +   '<div class="c360-card-title">📞 الهوية والاتصال</div>'
    +   (((r.user_id && clinicNameByUid[r.user_id]) ? clinicNameByUid[r.user_id] : '')
          ? c360Row('اسم العيادة', c360EscapeHtml(clinicNameByUid[r.user_id])) : '')
    +   c360Row(((r.user_id && clinicNameByUid[r.user_id]) ? 'جهة الاتصال' : 'الاسم'),
                 c360EscapeHtml(((r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || '—'))))
    +   c360SignupNameRow(r)
    +   c360Row('البريد', c360EscapeHtml(r.email || '—'), true)
    +   c360Row('رقم الواتساب', c360EscapeHtml(((r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '—'))), true)
    +   (((r.user_id && clinicContactByUid[r.user_id]))
          ? c360Row('رقم اتصال إضافي', c360EscapeHtml(clinicContactByUid[r.user_id]), true) : '')
    +   (divergentLoginPhone(r.phone, _ovWa)
          ? c360Row('رقم الدخول', c360EscapeHtml(divergentLoginPhone(r.phone, _ovWa)), true) : '')
    +   c360Row('فرع النقابة', c360EscapeHtml(synBranchOf(r) || '—'))
    +   c360Row('الرقم النقابي', c360EscapeHtml(synNoOf(r) || '—'))
    +   c360Row('الحالة', onlineText)
    +   c360Row('آخر نشاط', lastActivityText)
    +   c360Row('آخر تسجيل دخول', lastSignInText)
    + '</div>';
}

// M123: لقطة التسجيل (trial_requests.name) مجمّدة عمداً — سجل الاشتراك. حين
// يغيّر العميل اسمه الشخصي من إعداداته ينحرف الاسم الحيّ عنها، فيُعرض الأصل
// صراحةً كي يوفّق الأدمن بين الحساب وسجل التسجيل/الفوترة. لا يظهر الصف حين
// يتطابقان (غياب المعلومة معلومةٌ زائدة لا فائدة منها).
// نظير public.sydent_norm_name سلوكياً — للمقارنة فقط.
function c360NormName(s) {
  return String((s === null || s === undefined) ? '' : s)
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[ـ.،]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function c360SignupNameRow(r) {
  var sign = String((r && r.name) || '').trim();
  if (!sign) return '';
  var live = (r && r.user_id && ownerNameByUid[r.user_id]) ? String(ownerNameByUid[r.user_id]).trim() : '';
  if (!live) return '';
  if (c360NormName(live) === c360NormName(sign)) return '';
  return c360Row('الاسم عند التسجيل', c360EscapeHtml(sign));
}

function c360BuildTimeline(r) {
  if (!c360State.eventsLoaded) {
    return '<div class="c360-loading">⏳ جارٍ تحميل السجل…</div>';
  }
  if (!c360State.events.length) {
    return '<div class="c360-empty"><div class="c360-empty-icon">📜</div>لا يوجد سجل أحداث لهذا الحساب بعد.</div>';
  }
  // Reverse-chrono (events fetched ascending — display newest first)
  var items = c360State.events.slice().reverse();
  var html = '<div class="c360-timeline">';
  for (var i = 0; i < items.length; i++) {
    var ev = items[i];
    var typeClass = 'event-' + c360EscapeHtml(ev.event_type || '');
    // Use the canonical EVF_EVENT_TYPES map (same source the Events Viewer
    // uses) — the old call to evfEventTypeLabel() was a ReferenceError: no
    // such function exists, so the whole timeline render threw and the tab
    // fell back to its empty state even when events were present.
    var _evMeta = EVF_EVENT_TYPES[ev.event_type] || { label_ar: (ev.event_type || '—'), emoji: '' };
    var label = (_evMeta.emoji ? _evMeta.emoji + ' ' : '') + _evMeta.label_ar;
    var when = ev.created_at ? evfFormatTimestamp(ev.created_at) : '—';
    var desc = c360EventShortDesc(ev);
    html += '<div class="c360-tl-item ' + typeClass + '">'
         +    '<div class="c360-tl-time">' + c360EscapeHtml(when) + '</div>'
         +    '<div class="c360-tl-title">' + c360EscapeHtml(label) + '</div>'
         +    (desc ? '<div class="c360-tl-desc">' + c360EscapeHtml(desc) + '</div>' : '')
         + '</div>';
  }
  html += '</div>';
  return html;
}

function c360BuildRisk(r) {
  var s = computeAccountState(r);
  var risk = c360ComputeRisk(r, s);
  var badges = risk.signals.map(function(sig){
    var cls = sig.severity === 'high' ? 'c360-risk-high'
            : sig.severity === 'med'  ? 'c360-risk-med'
            : 'c360-risk-low';
    return '<span class="c360-risk-badge ' + cls + '">' + c360EscapeHtml(sig.label) + '</span>';
  }).join('');
  var tierColor = risk.tier === 'high' ? 'danger' : risk.tier === 'med' ? 'warn' : 'green';
  return ''
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">🎯 مستوى المخاطر</div>'
    +   '<div class="c360-kpi-grid">'
    +     c360Kpi('التقييم العام', c360EscapeHtml(risk.tierLabel), c360EscapeHtml(risk.summary), tierColor)
    +   '</div>'
    + '</div>'
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">🤖 قراءة تحليلية'
    +     '<button type="button" id="c360AiBtn" onclick="c360AiRun()" style="margin-inline-start:auto;font-size:12px;border:1px solid #7c6cf0;background:transparent;color:var(--text);border-radius:9px;padding:5px 10px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;text-transform:none;letter-spacing:0;">🤖 تحليل</button>'
    +   '</div>'
    +   '<div id="c360AiWarn" style="display:none;white-space:pre-wrap;line-height:1.8;font-size:12px;font-weight:700;color:var(--orange-ink);border:1px solid var(--orange-bd);background:rgba(var(--orange-rgb),0.10);border-radius:10px;padding:9px 12px;margin-bottom:8px;"></div>'
    +   '<div id="c360AiOut" style="display:none;white-space:pre-wrap;line-height:1.9;font-size:13px;color:var(--text);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;"></div>'
    +   '<div style="font-size:11px;color:var(--text2);line-height:1.7;">قراءة لنفس مؤشّرات هذا التبويب حرفياً — لا تُحتسب من جديد. تُرسَل أرقام الاشتراك المجمّعة فقط بلا اسم عيادة أو شخص أو وسيلة تواصل، والتحليل للعرض ولا يُحفَظ.</div>'
    + '</div>'
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">⚠️ الإشارات النشطة</div>'
    +   (badges
        ? '<div class="c360-risk">' + badges + '</div>'
        : '<div class="c360-empty" style="padding:12px 8px;">لا توجد إشارات سلبية حالياً — حساب صحّي ✓</div>')
    + '</div>'
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">📈 المؤشرات التفصيلية</div>'
    +   c360Row('أيام منذ التسجيل', risk.daysSinceSignup == null ? '—' : (risk.daysSinceSignup + ' يوم'))
    +   c360Row('أيام منذ آخر نشاط', risk.daysSinceActivity == null ? '—' : (risk.daysSinceActivity + ' يوم'))
    +   c360Row('أيام منذ آخر دخول', risk.daysSinceSignIn == null ? '—' : (risk.daysSinceSignIn + ' يوم'))
    +   c360Row('متبقّي على الاشتراك', s.daysLeft == null ? '—' : (s.daysLeft + ' يوم'))
    +   c360Row('في فترة سماح', s.state === 'grace' ? 'نعم ⚠️' : 'لا')
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════════
   سرد Churn-risk — الموجة 2 بند #9  (tenant_health_narrative)
   ═══════════════════════════════════════════════════════════════════════
   تبويب «المخاطر» بدرج العميل يعرض أرقاماً وشارات بلا سرد. هذه الوحدة
   تحوّلها إلى فقرة عربية مقروءة: حكمٌ واحد + الإشارات التي صنعته +
   إجراء احتفاظ واحد محدّد (درس المنافسين: الإجراء العام على كل حساب هو
   سبب فشل معظم حملات الاحتفاظ، والسرد بلا «لماذا» لوحةٌ لا يقرؤها أحد).

   عقود ملزمة:
   • **الـAI لا يحسب.** كل رقم يصل النموذجَ محسوبٌ سلفاً بدوال الدرج
     نفسها (computeAccountState · c360ComputeRisk · c360ComputeHealth ·
     c360ComputeMrrFor · activityCache) — فيستحيل أن يخالف السردُ الشاشة.
   • **صفر PII.** الحمولة مفتاح واحد `facts` نصّاً مجمَّعاً: حالة وخطة
     ومُدَد وأرقام وإشارات لا غير. لا اسم عيادة ولا اسم شخص ولا بريد ولا
     هاتف ولا معرّف صف ولا معرّف مستخدم.
   • **صفر حفظ.** السرد للعرض في الجلسة الجارية فقط — لا جدول ولا عمود.
   • **صفر مالية.** قراءة عرض بحتة؛ ولا تُلمس أي طبقة كتابة.
   • **صفر innerHTML** لنصّ النموذج: يُدهَن بـtextContent حصراً.
   ═══════════════════════════════════════════════════════════════════════ */

/* حالة الوحدة. reqId يربط النصّ بصاحبه فلا يُعرض سردُ عميلٍ على آخر،
   وtoken حارس latest-wins (قاعدة #55) حين يبدّل المالك العميل والنداء
   ما زال طائراً. */
var C360_AI = { reqId: null, text: '', loading: false, error: '', warn: '', facts: '', token: 0 };

/* تصفير كامل — يُستدعى مع كل فتح للدرج (قاعدة #394: كل صندوق ناتج
   يُصفَّر عند كل فتح بلا استثناء). رفعُ التوكن هنا يُبطل أي نداء طائر
   من فتحةٍ سابقة قبل أن يكتب شيئاً. */
function c360AiReset() {
  C360_AI.reqId = null;
  C360_AI.text = '';
  C360_AI.loading = false;
  C360_AI.error = '';
  C360_AI.warn = '';
  C360_AI.facts = '';
  C360_AI.token++;
}

/* تنظيف الرمز التعبيري من صدر التسمية: شارات الإشارات معروضة للبشر
   («😴 لا نشاط منذ ٤٥ يوم») والبرومبت يمنع الرموز التعبيرية بالمخرج،
   فيصل النموذجَ نصٌّ نظيف بدل الاعتماد على انضباطه في حذفها. حتمية
   بالكامل: يُقصّ ما قبل أول حرف عربي أو رقم لا غير. */
function c360AiStripIcon(s) {
  return String(s == null ? '' : s).replace(/^[^\u0600-\u06FF0-9]+/, '').trim();
}

/* بناء الحقائق — نصّ مجمَّع من مخرجات دوال الدرج حرفياً.
   ⚠️ كل سطر يُضاف هنا يجب أن يبقى بيانات اشتراك: أي حقل هوية (اسم ·
   بريد · هاتف · معرّف) خرقٌ لعقد صفر-PII ويمسكه المثبت. */
function c360AiFacts(r) {
  var s = computeAccountState(r);
  var risk = c360ComputeRisk(r, s);
  var health = c360ComputeHealth(r, s);
  var mrr = c360ComputeMrrFor(r, s);
  var act = activityCache[r.id];
  var L = [];

  L.push('حالة الحساب: ' + (s.label || 'غير محدّد'));
  L.push('الخطة: ' + (s.isPermanent ? 'حساب دائم بلا تاريخ انتهاء' : (srqPlanLabel(s.plan) || 'غير محدّدة')));
  L.push('المتبقّي على الاشتراك: ' + (s.daysLeft == null ? 'غير متاح' : (s.daysLeft + ' يوم')));
  L.push('درجة الخطر: ' + (c360AiStripIcon(risk.tierLabel) || 'غير محدّدة') +
         (risk.summary ? ' — ' + risk.summary : ''));
  L.push('مؤشّر الصحّة: ' + health.score + ' من 100 (' + health.tier + ')');

  var sig = (risk.signals || []).map(function (x) { return c360AiStripIcon(x && x.label); })
                                .filter(function (x) { return !!x; });
  L.push('الإشارات النشطة: ' + (sig.length ? sig.join(' · ') : 'لا توجد إشارات'));

  L.push('أيام منذ التسجيل: ' + (risk.daysSinceSignup == null ? 'غير متاح' : risk.daysSinceSignup));
  L.push('أيام منذ آخر نشاط: ' + (risk.daysSinceActivity == null ? 'غير متاح' : risk.daysSinceActivity));
  L.push('أيام منذ آخر دخول: ' + (risk.daysSinceSignIn == null ? 'غير متاح' : risk.daysSinceSignIn));
  L.push('المساهمة الشهرية: ' + (mrr.text === '—' ? 'غير متاحة' : mrr.text) +
         (mrr.sub ? ' (' + mrr.sub + ')' : ''));

  var pc = (act && typeof act.patients === 'number') ? act.patients : null;
  var ac = (act && typeof act.appointments === 'number') ? act.appointments : null;
  var ec = (act && typeof act.employees === 'number') ? act.employees : null;
  L.push('عدد المرضى المسجَّلين: ' + (pc == null ? 'غير متاح' : pc));
  L.push('عدد المواعيد المسجَّلة: ' + (ac == null ? 'غير متاح' : ac));
  L.push('عدد الموظفين النشطين: ' + (ec == null ? 'غير متاح' : ec));

  // عطل بنيةٍ عابر (503 على admin-ops) يُفرغ العدّادات، والصمت عن النقص
  // دعوةٌ لملء الفراغ باختلاق — كما حدث حيّاً. يُصرَّح بالنقص للنموذج.
  var actReady = !!(act && act.loaded && (pc != null || ac != null || ec != null));
  L.push('حالة مؤشّرات النشاط: ' + (actReady ? 'متاحة' : 'غير متاحة (تعذّر جلبها)'));

  return L.join('\n');
}

/* ── حارس الأرقام ─────────────────────────────────────────────────────
   المنطق انتقل إلى window.SyDentAiGuard بـsupabase-init.js ليخدم السطوح
   الثلاثة (سرد churn · ملخّص اليوم · ملخّص الفترة) من مصدرٍ واحد بلا
   مرايا تُحرَس. الغياب يعطّل التحذير ولا يكسر الميزة (تدهور صامت).
   ─────────────────────────────────────────────────────────────────── */
function c360AiCheckNums(outText, factsText) {
  try {
    return (window.SyDentAiGuard && window.SyDentAiGuard.check)
      ? window.SyDentAiGuard.check(outText, factsText) : '';
  } catch (_e) { return ''; }
}

/* دهن الصندوق من الحالة — يُستدعى بعد كل بناء لتبويب المخاطر، فالسرد
   ينجو من التنقّل بين التبويبات بلا نداء ثانٍ. textContent حصراً. */
function c360AiHydrate() {
  var out = document.getElementById('c360AiOut');
  var btn = document.getElementById('c360AiBtn');
  var wrn = document.getElementById('c360AiWarn');
  if (!out) return;
  var mine = (C360_AI.reqId && C360_AI.reqId === c360State.requestId);
  var body = !mine ? '' : (C360_AI.loading ? 'جارٍ التحليل…' : (C360_AI.error || C360_AI.text || ''));
  out.textContent = body;
  out.style.display = body ? 'block' : 'none';
  if (wrn) {
    // textContent حصراً — الرقم المُبلَّغ عنه يأتي من مخرج النموذج.
    var w = (mine && !C360_AI.loading) ? (C360_AI.warn || '') : '';
    wrn.textContent = w;
    wrn.style.display = w ? 'block' : 'none';
  }
  if (btn) {
    btn.disabled = !!(mine && C360_AI.loading);
    btn.textContent = (mine && C360_AI.loading) ? '⏳ جارٍ التحليل…' : '🤖 تحليل';
  }
}

/* مسار الزر. حارس انشغال + latest-wins + فشل غير قاتل. */
async function c360AiRun() {
  if (C360_AI.loading) return;
  var reqId = c360State.requestId;
  var r = allRequests.find(function (x) { return x.id === reqId; });
  if (!r) return;

  C360_AI.reqId = reqId;
  C360_AI.text = '';
  C360_AI.error = '';
  C360_AI.loading = true;
  var myToken = ++C360_AI.token;
  c360AiHydrate();

  var txt = '', err = '', warn = '', myFacts = '';
  try {
    var facts = c360AiFacts(r);
    myFacts = facts;
    var resp = await window.sb.functions.invoke('ai-assist', {
      body: { feature: 'tenant_health_narrative', input: { facts: facts } }
    });
    if (resp && !resp.error && resp.data && resp.data.text) {
      txt = String(resp.data.text).trim();
    }
    if (!txt) err = 'تعذّر توليد التحليل الآن — حاول بعد قليل.';
  } catch (e) {
    err = 'تعذّر الاتصال بالمساعد — تحقّق من الإنترنت.';
  }

  // حارس الأرقام: كل رقم بالسرد يجب أن يكون بالحمولة حرفياً.
  warn = c360AiCheckNums(txt, myFacts);

  // نتيجة متأخّرة لعميل غادره المالك (أو أُعيد فتح الدرج) تُهمَل كاملةً.
  if (myToken !== C360_AI.token) return;
  C360_AI.loading = false;
  C360_AI.text = txt;
  C360_AI.error = err;
  C360_AI.warn = warn;
  C360_AI.facts = myFacts;
  c360AiHydrate();
}

function c360BuildActions(r) {
  var id = r.id;
  var s = computeAccountState(r);
  var isAdmin = !!(adminUserIdsCache && r.user_id && adminUserIdsCache.has(r.user_id));
  var isCurrentAdmin = (r.user_id && r.user_id === currentAdminUserId);
  var canPromote = (s.state === 'paid' && s.isPermanent && !isAdmin && !isCurrentAdmin && !!r.user_id);
  var canDemote = (isAdmin && !isCurrentAdmin && !!r.user_id);

  // We build groups of related actions. Each button calls the SAME existing
  // function used by renderList — single source of truth (rule #11).
  var groups = [];

  // Lifecycle group
  var lifecycle = [];
  if (s.state === 'new') {
    lifecycle.push('<button class="sy-act sy-act-primary" onclick="accept(\'' + id + '\'); closeCustomer360();">✅ قبول</button>');
    lifecycle.push('<button class="sy-act sy-act-danger" onclick="reject(\'' + id + '\'); closeCustomer360();">❌ رفض</button>');
  }
  if (s.state === 'trial') {
    lifecycle.push('<button class="sy-act sy-act-primary" onclick="openConvertPicker(\'' + id + '\'); closeCustomer360();">💎 ترقية إلى مدفوع</button>');
  }
  // v485: الفعلُ الأساسيّ (تجديد) أولاً ثم «تغيير الخطة» — ترتيبُ الطقم
  if (s.state === 'paid' && !s.isPermanent) {
    lifecycle.push('<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\'); closeCustomer360();">🔄 تجديد</button>');
  }
  if (s.state === 'grace') {
    lifecycle.push('<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\'); closeCustomer360();">🔄 تجديد</button>');
  }
  if (s.state === 'paid' || s.state === 'grace') {
    lifecycle.push('<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\'); closeCustomer360();">💎 تغيير الخطة</button>');
  }
  if (s.state === 'expired') {
    // M141: نفس فصل القائمة — التجربة وحدها تُعاد تجربةً؛ المدفوع يُجدَّد بخطته.
    if ((s.plan || 'trial') === 'trial') {
      lifecycle.push('<button class="sy-act sy-act-primary" onclick="restartTrial(\'' + id + '\'); closeCustomer360();">✅ إعادة تجربة 30 يوم</button>');
      lifecycle.push('<button class="sy-act" onclick="grantGrace(\'' + id + '\'); closeCustomer360();">⏰ فترة سماح</button>');
      lifecycle.push('<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\'); closeCustomer360();">💎 ترقية إلى مدفوع</button>');
    } else {
      lifecycle.push('<button class="sy-act sy-act-primary" onclick="renewAccount(\'' + id + '\'); closeCustomer360();">🔄 تجديد</button>');
      lifecycle.push('<button class="sy-act" onclick="grantGrace(\'' + id + '\'); closeCustomer360();">⏰ فترة سماح</button>');
      lifecycle.push('<button class="sy-act" onclick="openUpgradePicker(\'' + id + '\'); closeCustomer360();">💎 تغيير الخطة</button>');
    }
  }
  if (s.state === 'suspended') {
    lifecycle.push('<button class="sy-act sy-act-primary" onclick="reactivateAccount(\'' + id + '\'); closeCustomer360();">✅ إعادة تفعيل</button>');
  }
  if (lifecycle.length) groups.push({ title: '⚙️ دورة حياة الاشتراك', buttons: lifecycle });

  // Trial-duration adjuster — RELOCATED here from the card list. Same widget,
  // same per-reqId state functions (setExtendMode/setExtendDays/applyAdjust).
  // Rendered as customHtml (it's a mini-form, not a button row). Shown only
  // when there's an adjustable trial/paid window — mirrors the old card
  // condition exactly (trial_end present + not new/suspended).
  var showExt = !!r.trial_end && s.state !== 'new' && s.state !== 'suspended';
  if (showExt) groups.push({ title: '⏰ تعديل مدة ' + periodWord(r, true), customHtml: renderExtensionWidget(id) });

  // Migration 110 — per-account AI override (third gate layer, admin-only).
  // Lives HERE and nowhere else: the edit modal is for signup data (name /
  // phone / email / city / notes), while every subscription-entitlement
  // action already lives in this tab. One control, one source of truth.
  // Rendered as customHtml (tri-state selector, not a button row).
  groups.push({ title: '🤖 مساعد الذكاء الاصطناعي', customHtml: renderAiOverrideWidget(id, r.ai_override) });

  // Admin role group (Phase X1)
  var adminBtns = [];
  if (canPromote) adminBtns.push('<button class="sy-act" onclick="promoteToAdmin(\'' + id + '\'); closeCustomer360();">👑 ترقية إلى Admin</button>');
  if (canDemote)  adminBtns.push('<button class="sy-act sy-act-warn" onclick="demoteFromAdmin(\'' + id + '\'); closeCustomer360();">👤 إنزال من Admin</button>');
  if (adminBtns.length) groups.push({ title: '🛡 صلاحيات Admin', buttons: adminBtns });

  // Suspension / deletion group
  var suspendDelete = [];
  if (s.state !== 'suspended' && s.state !== 'new') {
    suspendDelete.push('<button class="sy-act sy-act-warn" onclick="suspendAccount(\'' + id + '\', \'' + jsAttr(r.email||'') + '\'); closeCustomer360();">⏸️ إيقاف</button>');
  }
  suspendDelete.push('<button class="sy-act sy-act-danger" onclick="deleteAccount(\'' + id + '\', \'' + jsAttr(r.email||'') + '\'); closeCustomer360();">🗑️ حذف</button>');
  if (suspendDelete.length) groups.push({ title: '⏸ إيقاف وحذف', buttons: suspendDelete });

  // WhatsApp group
  var waBtns = [];
  // Same operational WhatsApp number resolution as the customer list: clinic
  // settings phone first (dynamic, doctor-controlled), registration phone as a
  // fallback. Drives all four message buttons below.
  var _waPhone = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
  var safePhone = jsAttr(_waPhone);
  // Live owner name first (same pattern as the phone above) — a renamed
  // doctor must be addressed by their current name, not the signup one.
  var safeName  = jsAttr((r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || ''));
  var safeEmail = jsAttr((r.user_id && ownerEmailByUid[r.user_id]) ? ownerEmailByUid[r.user_id] : (r.email || ''));
  if ((s.state === 'trial' || s.state === 'paid') && !s.isPermanent && r.trial_end && s.daysLeft !== null && s.daysLeft > 0) {
    var safeEnd = jsAttr(r.trial_end || '');
    waBtns.push('<a href="#" class="sy-act" onclick="return openWaReminder(\'' + safePhone + '\',\'' + safeName + '\',' + Number(s.daysLeft) + ',\'' + safeEnd + '\',\'' + jsAttr(planDisplayName(s.plan)) + '\',event)">💬 تذكير</a>');
  }
  if (s.state !== 'new') {
    waBtns.push('<a href="#" class="sy-act" onclick="return openWaWelcome(\'' + safePhone + '\',\'' + safeName + '\',\'' + safeEmail + '\',event)">👋 ترحيب</a>');
  }
  if (s.state === 'paid' && !s.isPermanent) {
    var planLabel = jsAttr(planDisplayName(s.plan));
    var safeEnd2 = jsAttr(r.trial_end || '');
    var pricePaid = (r.price_paid != null && Number(r.price_paid) > 0) ? Number(r.price_paid) : 'null';
    waBtns.push('<a href="#" class="sy-act" onclick="return openWaRenewed(\'' + safePhone + '\',\'' + safeName + '\',\'' + planLabel + '\',\'' + safeEnd2 + '\',' + pricePaid + ',event)">✅ تجديد</a>');
  }
  if (s.state === 'suspended') {
    waBtns.push('<a href="#" class="sy-act" onclick="return openWaSuspended(\'' + safePhone + '\',\'' + safeName + '\',event)">⏸ إيقاف</a>');
  }
  if (waBtns.length) groups.push({ title: '💬 رسائل واتساب', buttons: waBtns });

  // Payment recording (Phase A) — record a received subscription payment.
  groups.push({ title: '💵 المدفوعات', buttons: [
    '<button class="sy-act sy-act-primary" onclick="openPayModal(\'' + id + '\')">💵 تسجيل دفعة مستلمة</button>'
  ]});

  // Edit (always available)
  groups.push({ title: '✏️ تحرير', buttons: [
    '<button class="sy-act" onclick="openEditModal(\'' + id + '\'); closeCustomer360();">✏️ تعديل البيانات</button>'
  ]});

  // Render
  var html = '<div class="c360-actions">';
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    // A group is either a button row (grp.buttons) or a custom mini-form
    // (grp.customHtml, e.g. the trial-duration adjuster widget).
    var inner = grp.customHtml
      ? grp.customHtml
      : '<div class="c360-actions-row sy-acts">' + grp.buttons.join('') + '</div>';
    html += '<div class="c360-action-group">'
         +    '<div class="c360-action-group-title">' + c360EscapeHtml(grp.title) + '</div>'
         +    inner
         + '</div>';
  }
  html += '</div>';
  return html;
}

function c360BuildComm(r) {
  // كسابقتها: `_waPhone` يعيش في c360BuildActions لا هنا. لم ينفجر الخطأ لأن
  // هذا تبويبٌ آخر لم يُفتح بعد — عيبٌ صامتٌ من الصنف نفسه، لذلك يُحسب محلياً.
  var _commWa = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
  // Phase 8 will hook in WhatsApp Business API send/receive logs here.
  // Until then, we show a clear placeholder that's NOT mistaken for an
  // error state.
  return ''
    + '<div class="c360-comm-placeholder">'
    +   '<div class="c360-comm-placeholder-icon">💬</div>'
    +   '<div class="c360-comm-placeholder-title">سجل الاتصالات قادم في Phase 8</div>'
    +   '<div class="c360-comm-placeholder-sub">عند تفعيل WhatsApp Business API ستظهر هنا الرسائل المُرسلة والمستلمة مع timestamps وحالة التسليم.</div>'
    + '</div>'
    + '<div class="c360-card">'
    +   '<div class="c360-card-title">📞 معلومات الاتصال الحالية</div>'
    +   c360Row('رقم الواتساب', c360EscapeHtml(((r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '—'))), true)
    +   (((r.user_id && clinicContactByUid[r.user_id]))
          ? c360Row('رقم اتصال إضافي', c360EscapeHtml(clinicContactByUid[r.user_id]), true) : '')
    +   (divergentLoginPhone(r.phone, _commWa)
          ? c360Row('رقم الدخول', c360EscapeHtml(divergentLoginPhone(r.phone, _commWa)), true) : '')
    +   c360Row('البريد الإلكتروني', c360EscapeHtml(r.email || '—'), true)
    + '</div>';
}

// ─── Data loaders ───────────────────────────────────────────────────────────

// Load subscription_events for this customer. Filters by user_id when
// available, falling back to trial_request_id (in case the event was
// logged before user_id was attached). Caps at 200 rows to keep the
// drawer responsive on heavy customers.
//
// Token-based latest-wins guard (rule #55): if the user switches customers
// while a fetch is in flight, the resolver sees a stale token and discards
// the result, preventing customer-B fetch from overwriting customer-A
// state (or vice versa).
async function c360LoadEvents(r) {
  var myToken = ++c360State.loadEventsToken;
  try {
    // Strategy: run two simple eq() queries in parallel rather than one
    // .or() query. Two reasons:
    //   1. The .or() variant produced an unexplained stuck-spinner in
    //      the v43 live test for د. مجدي بورج; isolated eq queries are
    //      the boringly-reliable PostgREST path that every other table
    //      in this codebase uses successfully.
    //   2. We can dedup results client-side (some events have BOTH
    //      user_id and trial_request_id set; .or() returns them once,
    //      two queries return them twice, dedup by id is cheap).
    var queries = [
      window.sb.from('subscription_events')
        .select('*')
        .eq('trial_request_id', r.id)
        .order('created_at', { ascending: true })
        .limit(200)
    ];
    if (r.user_id) {
      queries.push(
        window.sb.from('subscription_events')
          .select('*')
          .eq('user_id', r.user_id)
          .order('created_at', { ascending: true })
          .limit(200)
      );
    }
    var results = await Promise.all(queries);
    // Stale check — user has switched customers since this fetch started.
    if (myToken !== c360State.loadEventsToken) return;

    // Aggregate + dedup by event id. Events that match both filters
    // appear twice across the two result sets but share the same primary
    // key, so a simple by-id map collapses them safely.
    var seen = {};
    var merged = [];
    var anyError = null;
    for (var qi = 0; qi < results.length; qi++) {
      var res = results[qi];
      if (res.error) {
        if (!anyError) anyError = res.error;
        continue;
      }
      var rows = res.data || [];
      for (var ri = 0; ri < rows.length; ri++) {
        var ev = rows[ri];
        if (!ev || !ev.id) continue;
        if (seen[ev.id]) continue;
        seen[ev.id] = true;
        merged.push(ev);
      }
    }
    // Sort merged result chronologically (ascending — c360BuildTimeline
    // reverses for display).
    merged.sort(function(a, b){
      var ad = String(a.created_at || ''), bd = String(b.created_at || '');
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });

    if (anyError && merged.length === 0) {
      // Both queries failed (e.g. RLS denial). Log enough detail to
      // diagnose without leaking PII.
      console.warn('c360LoadEvents: all queries failed', {
        code: anyError.code,
        message: anyError.message,
        details: anyError.details,
        hint: anyError.hint,
        user_id: r.user_id,
        request_id: r.id
      });
    } else if (anyError) {
      // Partial failure — we still have rows, log a softer warning.
      console.info('c360LoadEvents: one branch failed, returning partial results:', anyError.code, anyError.message);
    }
    c360State.events = merged;
    c360State.eventsLoaded = true;
  } catch (e) {
    if (myToken !== c360State.loadEventsToken) return;
    console.warn('c360LoadEvents threw:', e && (e.stack || e.message || e));
    c360State.events = [];
    c360State.eventsLoaded = true; // mark loaded so we don't retry indefinitely
  }
}

// ─── Derived metrics ────────────────────────────────────────────────────────

// Health score (0-100). A simple, defensible formula:
//   suspended       → 5     (dead)
//   expired         → 15    (lost, hopefully recoverable)
//   new             → 50    (uncertain, awaiting decision)
//   grace           → 35    (red flag)
//   trial   ≤5d     → 45    (urgent attention)
//   trial   >5d     → 70    (healthy onboarding)
//   paid permanent  → 100   (best)
//   paid yearly     → 90    (best repeating)
//   paid monthly    → 80    (good)
//   …adjusted -10 if last seen (lastActivity/lastSignIn max) is older than 30 days
function c360ComputeHealth(r, s) {
  var score, tier, summary, tierColor;
  if (s.state === 'suspended') { score = 5;  tier = 'موقوف';  summary = 'حساب معطّل'; }
  else if (s.state === 'expired') { score = 15; tier = s.label || 'منتهي'; summary = ((s.plan || 'trial') === 'trial') ? 'التجربة انتهت — الحساب محجوب' : 'الاشتراك انتهى — الحساب للقراءة فقط'; }
  else if (s.state === 'new')     { score = 50; tier = 'جديد'; summary = 'بانتظار القرار'; }
  else if (s.state === 'grace')   { score = 35; tier = 'فترة سماح'; summary = 'بحاجة للتجديد'; }
  else if (s.state === 'trial')   {
    if (s.daysLeft !== null && s.daysLeft <= 5) { score = 45; tier = 'تجربة على وشك الانتهاء'; summary = 'متبقّي ' + s.daysLeft + ' يوم'; }
    else                                          { score = 70; tier = 'تجربة نشطة'; summary = 'في فترة التقييم'; }
  } else if (s.state === 'paid' && s.isPermanent) { score = 100; tier = 'حساب دائم'; summary = 'العميل الأمثل ⭐'; }
  else if (s.state === 'paid') {
    var durH = 30;
    try { var cfgH = getPlanConfig(s.plan); if (cfgH && cfgH.duration_days) durH = Number(cfgH.duration_days) || 30; } catch(_) {}
    score = durH >= 180 ? 90 : 80; // longer commitment = healthier
    tier = 'مشترك مدفوع'; summary = planDisplayName(s.plan) + ' — اشتراك نشط';
  }
  else { score = 50; tier = 'غير محدّد'; summary = '—'; }

  // Idle penalty: -10 if no activity within 30 days (where data exists).
  // Uses lastSeenMs (max of lastActivity/lastSignIn) — lastSignIn alone is
  // stale under long-lived refresh-token sessions.
  var _seen = lastSeenMs(activityCache[r.id]);
  if (_seen !== null) {
    var ageDays = Math.floor((Date.now() - _seen) / 86400000);
    if (isFinite(ageDays) && ageDays > 30) score = Math.max(0, score - 10);
  }
  return { score: score, tier: tier, summary: summary };
}

// Risk signals → returns { tier, tierLabel, summary, signals[], daysSinceSignup, daysSinceSignIn, daysSinceActivity }
function c360ComputeRisk(r, s) {
  var signals = [];
  var daysSinceSignup = null, daysSinceSignIn = null, daysSinceActivity = null;
  var act = activityCache[r.id];

  if (r.created_at) {
    var dSU = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
    if (isFinite(dSU) && dSU >= 0) daysSinceSignup = dSU;
  }
  if (act && act.lastSignIn) {
    var dSI = Math.floor((Date.now() - new Date(act.lastSignIn).getTime()) / 86400000);
    if (isFinite(dSI) && dSI >= 0) daysSinceSignIn = dSI;
  }
  // Effective idle basis: newer of lastActivity/lastSignIn (lastSeenMs).
  var _seenR = lastSeenMs(act);
  if (_seenR !== null) {
    var dSA = Math.floor((Date.now() - _seenR) / 86400000);
    if (isFinite(dSA) && dSA >= 0) daysSinceActivity = dSA;
  }

  // Severity buckets per signal
  if (s.state === 'suspended') signals.push({ label: '⛔ موقوف', severity: 'high' });
  if (s.state === 'expired')   signals.push({ label: '⏰ منتهي', severity: 'high' });
  if (s.state === 'grace')     signals.push({ label: '🟠 في فترة سماح', severity: 'high' });
  if (s.state === 'trial' && s.daysLeft !== null && s.daysLeft <= 5)  signals.push({ label: '⏳ تجربة على وشك الانتهاء', severity: 'high' });
  if (s.state === 'trial' && s.daysLeft !== null && s.daysLeft > 5 && s.daysLeft <= 10) signals.push({ label: '⏳ تجربة تنتهي قريباً', severity: 'med' });
  if (s.state === 'paid' && !s.isPermanent && s.daysLeft !== null && s.daysLeft <= 7)  signals.push({ label: '💳 اشتراك ينتهي خلال أسبوع', severity: 'high' });
  if (s.state === 'paid' && !s.isPermanent && s.daysLeft !== null && s.daysLeft > 7 && s.daysLeft <= 30) signals.push({ label: '💳 اشتراك ينتهي خلال شهر', severity: 'med' });
  if (daysSinceActivity !== null && daysSinceActivity >= 30) signals.push({ label: '😴 لا نشاط منذ ' + daysSinceActivity + ' يوم', severity: 'med' });
  if (daysSinceActivity !== null && daysSinceActivity >= 90) signals.push({ label: '⚠️ خامل منذ ' + daysSinceActivity + ' يوم', severity: 'high' });
  // Healthy signals (only added when no negative signals exist)
  if (s.state === 'paid' && s.isPermanent) signals.push({ label: '⭐ حساب دائم', severity: 'low' });
  if (s.state === 'paid' && !s.isPermanent && s.daysLeft !== null && s.daysLeft > 30) signals.push({ label: '🌟 اشتراك مستقر', severity: 'low' });

  // Tier = max severity present
  var hasHigh = signals.some(function(x){ return x.severity === 'high'; });
  var hasMed  = signals.some(function(x){ return x.severity === 'med'; });
  var tier, tierLabel, summary;
  if (hasHigh)      { tier = 'high'; tierLabel = '🔴 مرتفع'; summary = 'يحتاج تدخل فوري'; }
  else if (hasMed)  { tier = 'med';  tierLabel = '🟠 متوسط'; summary = 'يحتاج متابعة'; }
  else              { tier = 'low';  tierLabel = '🟢 منخفض'; summary = 'الحساب صحّي'; }

  return {
    tier: tier, tierLabel: tierLabel, summary: summary,
    signals: signals,
    daysSinceSignup: daysSinceSignup,
    daysSinceSignIn: daysSinceSignIn,
    daysSinceActivity: daysSinceActivity
  };
}

// MRR contribution for this single customer. Mirrors the X5 widget logic
// for THIS row only.
function c360ComputeMrrFor(r, s) {
  if (s.state !== 'paid' || s.daysLeft === null || s.daysLeft <= 0) {
    return { text: '—', sub: 'غير مساهم في MRR', color: 'muted' };
  }
  if (s.isPermanent) {
    return { text: '—', sub: 'حساب دائم — لا يحسب في MRR', color: 'muted' };
  }
  var price = parseFloat(r.price_paid);
  if (!isFinite(price) || price <= 0) {
    return { text: '—', sub: 'لا توجد بيانات سعر', color: 'muted' };
  }
  // Migration 105: normalize to SYP via the manual report rate before the
  // monthly-equivalent math. USD with no rate → explicit "unset", never mixed.
  var priceSyp = toReportSyp(price, r.currency);
  if (priceSyp == null) {
    return { text: '—', sub: 'بالدولار — اضبط سعر صرف التقارير', color: 'muted' };
  }
  var monthly = monthlyEquivPrice(s.plan, priceSyp, r.billing_cycle);
  if (!(monthly > 0)) return { text: '—', sub: 'خطة بلا مساهمة شهرية', color: 'muted' };
  return {
    text: Math.round(monthly).toLocaleString('en-US') + ' ل.س',
    sub: 'مساهمة شهرية' + (normCurrency(r.currency) === 'USD' ? ' (محوّلة من $)' : ''),
    color: 'green'
  };
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function c360Kpi(label, value, sub, color) {
  var valClass = color === 'muted' ? 'muted'
               : color === 'warn'  ? 'warn'
               : color === 'danger'? 'danger'
               : color === 'blue'  ? 'blue'
               : '';
  return ''
    + '<div class="c360-kpi">'
    +   '<div class="c360-kpi-label">' + c360EscapeHtml(label) + '</div>'
    +   '<div class="c360-kpi-value ' + valClass + '">' + c360EscapeHtml(value) + '</div>'
    +   (sub ? '<div class="c360-kpi-sub">' + c360EscapeHtml(sub) + '</div>' : '')
    + '</div>';
}

// ── رقم الدخول مقابل رقم واتساب العيادة ────────────────────────────────────
// حقلان منفصلان يتباعدان فعلياً: البطاقة تعرض clinic_settings.clinic_phone
// (يضبطه الطبيب، وهو هدف زرّ الواتساب الصحيح)، بينما resolve_login_email
// يطابق trial_requests.phone حصراً. حين يفترقان لا يجد الأدمن رقم الدخول في
// أي سطح إلا بفتح نافذة التعديل — فيُعرَض صفٌّ إضافي، **وعند الافتراق فقط**
// كي تبقى البطاقات العادية نظيفة.
//
// ⚠️ مقارنة عرضٍ لا مسارُ مصادقة: تُقارَن آخر تسع خانات من الأرقام المجرّدة،
// فتتطابق `0934012433` و`963934012433` و`00963934012433` (كلها 934012433)
// ويُكشف `004917630171767` مختلفاً. لم تُستنسخ قواعد normalize_phone الخاصة
// بـSQL هنا عمداً: تكرارها بالجافاسكربت يخلق مرآةً تنحرف صامتةً عن مصدر
// المصادقة الوحيد بالـDB، والغرضُ هنا مجرّد تنبيهٍ بصريّ يحتمل خطأً حدّيّاً.
function loginPhoneTail(p) {
  var d = String(p || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : d;
}
function divergentLoginPhone(loginPhone, waPhone) {
  var a = loginPhoneTail(loginPhone), b = loginPhoneTail(waPhone);
  if (!a) return '';                    // لا رقم تسجيل ⇒ لا شيء يُعرَض
  if (!b) return '';                    // لا رقم عيادة ⇒ البطاقة تعرضه أصلاً
  return (a === b) ? '' : String(loginPhone).trim();
}

// ltr (اختياري): القيمة لاتينية/رقمية (بريد · هاتف) فتُعزل بـ.ltr-val كي لا ينقلب
// رسمها داخل الدرج العربي. الاستدعاءات بلا الوسيط تبقى بسلوكها الحرفي السابق.
function c360Row(label, value, ltr) {
  return ''
    + '<div class="c360-row">'
    +   '<span class="c360-row-label">' + c360EscapeHtml(label) + '</span>'
    +   '<span class="c360-row-value' + (ltr ? ' ltr-val' : '') + '">' + value + '</span>' // value is pre-escaped by caller
    + '</div>';
}

// Short description for timeline items — reuses evfFormatDiff-ish shape
// but condensed for the narrower drawer column.
function c360EventShortDesc(ev) {
  var parts = [];
  if (ev.from_plan && ev.to_plan && ev.from_plan !== ev.to_plan) parts.push('الخطة: ' + ev.from_plan + ' → ' + ev.to_plan);
  if (ev.from_status && ev.to_status && ev.from_status !== ev.to_status) parts.push('الحالة: ' + ev.from_status + ' → ' + ev.to_status);
  if (ev.amount != null && Number(ev.amount) > 0) parts.push('المبلغ: ' + Number(ev.amount).toLocaleString('en-US') + ' ' + (ev.currency || 'SYP'));
  if (ev.performed_by) parts.push('بواسطة: ' + ev.performed_by);
  return parts.join(' • ');
}

// XSS-safe escape (defensive — events viewer has its own, this one is
// drawer-local so we don't accidentally break if evf* is removed).
function c360EscapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// First character for the avatar circle — strips honorifics and grabs
// the first letter of the first word. Uses stripDoctorHonorific() so the
// regex stays in one place (avoids false-positives on 'دلال', 'دانا', etc.).
function c360AvatarInitial(name) {
  if (!name) return '?';
  var s = stripDoctorHonorific(name);
  if (!s) return '?';
  var first = s.split(/\s+/)[0] || s;
  return first.charAt(0).toUpperCase();
}
// === End Phase X6 ===========================================================

// === Phase X7 — Bulk Operations & Advanced Filters ==========================
//
// Two independent concerns share this section because they both layer on top
// of renderList:
//
//   1. Advanced Filters (flt-*): six new client-side filter dimensions
//      (plan / expiry bucket / MRR range / signup date range / admin-only
//      / permanent-only) that intersect with the existing tab + search +
//      expiring filters. The flt body collapses by default to keep the
//      header clean for users who don't need it.
//
//   2. Bulk Operations (bk-*): multi-select via per-card checkboxes plus a
//      sticky action bar with 4 actions (extend / WA reminder / WA welcome
//      / CSV export). Mutating actions iterate the existing single-row
//      handlers (rule #20: single source of truth) with a 200ms gap
//      between each to avoid hammering the DB, surfacing progress in a
//      modal so the user knows it's working.
//
// Both pieces share the renderList integration point: applyAdvancedFilters
// participates in the filter chain, and bulkState exposes the visible-id
// list so "select-all visible" works without re-filtering.

// — Advanced filters state ——————————————————————————————————————————————
var advFilters = {
  plan: '',         // '' | 'trial' | 'monthly' | 'yearly' | 'permanent'
  expiry: '',       // '' | 'lt7' | 'lt30' | 'expired' | 'active'
  mrrMin: null,     // number | null
  mrrMax: null,     // number | null
  signupFrom: '',   // 'YYYY-MM-DD' | ''
  signupTo: '',     // 'YYYY-MM-DD' | ''
  adminOnly: false,
  permanentOnly: false
};

// Open/close the filters section. Side-effect-free except for the class
// toggle on #fltSection.
function fltToggle() {
  var sec = document.getElementById('fltSection');
  if (sec) sec.classList.toggle('open');
}

// Read every filter input back into advFilters, then re-render. Called
// from every input/change handler on the filters panel.
function fltOnChange() {
  advFilters.plan          = (document.getElementById('fltPlan')          || {}).value || '';
  advFilters.expiry        = (document.getElementById('fltExpiry')        || {}).value || '';
  var mrrMinEl = document.getElementById('fltMrrMin');
  var mrrMaxEl = document.getElementById('fltMrrMax');
  advFilters.mrrMin = mrrMinEl && mrrMinEl.value !== '' ? Number(mrrMinEl.value) : null;
  advFilters.mrrMax = mrrMaxEl && mrrMaxEl.value !== '' ? Number(mrrMaxEl.value) : null;
  // NaN-guard — invalid input becomes null so we don't filter to zero rows.
  if (!isFinite(advFilters.mrrMin)) advFilters.mrrMin = null;
  if (!isFinite(advFilters.mrrMax)) advFilters.mrrMax = null;
  advFilters.signupFrom    = (document.getElementById('fltSignupFrom')    || {}).value || '';
  advFilters.signupTo      = (document.getElementById('fltSignupTo')      || {}).value || '';
  advFilters.adminOnly     = !!(document.getElementById('fltAdminOnly')   && document.getElementById('fltAdminOnly').checked);
  advFilters.permanentOnly = !!(document.getElementById('fltPermanentOnly') && document.getElementById('fltPermanentOnly').checked);
  fltUpdateHeader();
  renderList();
}

// Clear all filters back to defaults + re-render.
function fltReset() {
  var ids = ['fltPlan','fltExpiry','fltMrrMin','fltMrrMax','fltSignupFrom','fltSignupTo'];
  ids.forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
  var c1 = document.getElementById('fltAdminOnly');     if (c1) c1.checked = false;
  var c2 = document.getElementById('fltPermanentOnly'); if (c2) c2.checked = false;
  advFilters = { plan:'', expiry:'', mrrMin:null, mrrMax:null,
                 signupFrom:'', signupTo:'', adminOnly:false, permanentOnly:false };
  fltUpdateHeader();
  renderList();
}

// Show a compact "N فلتر نشط" hint in the section header. When no
// filters are active, show a muted "لا فلاتر نشطة" instead.
function fltUpdateHeader() {
  var n = fltActiveCount();
  var hdr = document.getElementById('fltHeaderState');
  var cnt = document.getElementById('fltActiveCount');
  if (hdr) hdr.textContent = n > 0 ? ('— ' + n + ' نشط') : '';
  if (cnt) {
    cnt.textContent = n > 0 ? (n + ' فلتر نشط') : 'لا فلاتر نشطة';
    cnt.classList.toggle('none', n === 0);
  }
}

function fltActiveCount() {
  var n = 0;
  if (advFilters.plan)          n++;
  if (advFilters.expiry)        n++;
  if (advFilters.mrrMin != null) n++;
  if (advFilters.mrrMax != null) n++;
  if (advFilters.signupFrom)    n++;
  if (advFilters.signupTo)      n++;
  if (advFilters.adminOnly)     n++;
  if (advFilters.permanentOnly) n++;
  return n;
}

// Pure predicate: returns true if the row survives every active filter.
// Designed to short-circuit on the first failed check.
function applyAdvancedFilters(r) {
  if (!r) return false;
  var s = computeAccountState(r);

  // Plan filter
  if (advFilters.plan) {
    if (advFilters.plan === 'permanent') {
      if (!s.isPermanent) return false;
    } else {
      // Match the request's plan value, not the state — a 'paid'/'yearly'
      // row should match plan='yearly' even though its state is 'paid'.
      var rPlan = (r.plan || 'trial');
      if (rPlan !== advFilters.plan) return false;
    }
  }

  // Expiry filter
  if (advFilters.expiry) {
    var dl = s.daysLeft;
    if (advFilters.expiry === 'lt7') {
      if (dl === null || dl <= 0 || dl > 7) return false;
    } else if (advFilters.expiry === 'lt30') {
      if (dl === null || dl <= 0 || dl > 30) return false;
    } else if (advFilters.expiry === 'expired') {
      if (dl === null || dl > 0) return false;
    } else if (advFilters.expiry === 'active') {
      if (dl !== null && dl <= 0) return false; // exclude expired
      // permanent (daysLeft=null) counts as active
    }
  }

  // MRR filter (per-row monthly contribution; matches Phase X5 formula)
  if (advFilters.mrrMin != null || advFilters.mrrMax != null) {
    var mrr = computeRowMrr(r, s);
    if (advFilters.mrrMin != null && mrr < advFilters.mrrMin) return false;
    if (advFilters.mrrMax != null && mrr > advFilters.mrrMax) return false;
  }

  // Signup date filter (YYYY-MM-DD string compare is lex-safe for ISO dates)
  if (advFilters.signupFrom || advFilters.signupTo) {
    var d = r.created_at ? String(r.created_at).slice(0, 10) : '';
    if (advFilters.signupFrom && (!d || d < advFilters.signupFrom)) return false;
    if (advFilters.signupTo   && (!d || d > advFilters.signupTo))   return false;
  }

  // Admin-only checkbox
  if (advFilters.adminOnly) {
    if (!adminUserIdsCache || !r.user_id || !adminUserIdsCache.has(r.user_id)) return false;
  }

  // Permanent-only checkbox
  if (advFilters.permanentOnly && !s.isPermanent) return false;

  return true;
}

// Per-row MRR contribution — single-row version of the Phase X5 widget
// formula. Permanent and non-paid rows contribute 0. Used by both the
// MRR filter and the CSV export.
// Monthly-equivalent revenue for ANY plan (plan-agnostic). Normalizes the paid
// price to a 30-day month using the plan's OWN duration_days, so a
// quarterly/biannual/custom plan contributes to MRR correctly — not just the
// legacy monthly/yearly codes. Falls back to 30/365 only if config isn't loaded.
function monthlyEquivPrice(planCode, price, cycle) {
  var pnum = Number(price);
  if (!isFinite(pnum) || pnum <= 0) return 0;
  var dur;
  if (cycle === 'monthly' || cycle === 'quarterly' || cycle === 'yearly') {
    // Phase X13 (+ Migration 104 quarterly): the subscriber's actual billing
    // cycle is authoritative — a tier can be billed on any cadence, so we can't
    // infer the period from the tier alone.
    dur = CYCLE_DAYS[cycle];
  } else {
    var cfg = null;
    try { cfg = getPlanConfig(planCode); } catch(_) {}
    dur = (cfg && cfg.duration_days != null && Number(cfg.duration_days) > 0)
      ? Number(cfg.duration_days)
      : (planCode === 'yearly' ? 365 : planCode === 'monthly' ? 30 : 0);
  }
  if (dur <= 0) return 0; // trial / zero-duration → no recurring revenue
  return pnum * 30 / dur;
}

// Build a "N PlanName · M PlanName" breakdown from a {code:count} map, highest
// tier first (by sort_order), using the configured display names (Max/Mini/…).
function planBreakdownParts(byPlan) {
  return Object.keys(byPlan)
    .sort(function(a, b){ return srqPlanSort(b) - srqPlanSort(a); })
    .map(function(code){ return byPlan[code] + ' ' + planDisplayName(code); });
}

function computeRowMrr(r, s) {
  if (!s) s = computeAccountState(r);
  if (s.state !== 'paid' || s.isPermanent) return 0;
  if (s.daysLeft !== null && s.daysLeft <= 0) return 0;
  // Migration 105: normalize to SYP first; un-normalizable USD contributes 0
  // (shown as unset elsewhere) rather than polluting SYP aggregates.
  var amtSyp = toReportSyp(r.price_paid, r.currency);
  if (amtSyp == null) return 0;
  return Math.round(monthlyEquivPrice(s.plan, amtSyp, r.billing_cycle));
}

// — Bulk selection state ———————————————————————————————————————————————
var bulkState = {
  selected: new Set(),     // Set<requestId>
  lastFilteredIds: [],     // string[] — IDs of currently visible cards
  inFlight: false          // single-bulk-at-a-time guard
};

// Toggle a single card's selection. Bound via inline onclick on the card
// checkbox. event.stopPropagation prevents the parent card from receiving
// the click (no card-wide click handler exists today, but defensive).
function bkToggleSelect(reqId, ev) {
  if (ev) ev.stopPropagation();
  if (!reqId) return;
  if (bulkState.selected.has(reqId)) bulkState.selected.delete(reqId);
  else bulkState.selected.add(reqId);
  bkUpdateBar();
  // Re-render only the affected card's outline by toggling the class
  // directly — full renderList would be wasteful here.
  var card = document.querySelector('.bk-card-check[onclick*="' + reqId + '"]');
  if (card && card.parentElement) {
    card.parentElement.classList.toggle('bk-selected', bulkState.selected.has(reqId));
  }
}

// Select every currently visible (filtered) row.
function bkSelectAllVisible() {
  bulkState.lastFilteredIds.forEach(function(id){ bulkState.selected.add(id); });
  bkUpdateBar();
  renderList();
}

// Clear all selections.
function bkClearSelection() {
  bulkState.selected.clear();
  bkUpdateBar();
  renderList();
}

// After a filter change, the selected set may contain rows no longer
// visible. Drop them silently so bulk actions only act on visible rows.
function bulkPruneHidden() {
  if (bulkState.selected.size === 0) return;
  var visibleSet = new Set(bulkState.lastFilteredIds);
  var toDrop = [];
  bulkState.selected.forEach(function(id){
    if (!visibleSet.has(id)) toDrop.push(id);
  });
  toDrop.forEach(function(id){ bulkState.selected.delete(id); });
}

// Sync the floating bulk bar visibility + count.
function bkUpdateBar() {
  var bar = document.getElementById('bkBar');
  var cnt = document.getElementById('bkBarCount');
  var n = bulkState.selected.size;
  if (bar) bar.classList.toggle('active', n > 0);
  if (cnt) cnt.textContent = n > 0 ? (n + ' محدّد') : '';
}

// Resolve the trial_requests rows behind the current selection. Returns
// an array of row objects (NOT ids) for the bulk handlers to operate on.
// Rows that no longer exist (deleted between selection and action) are
// silently skipped — they're not an error condition.
function bkSelectedRows() {
  var out = [];
  bulkState.selected.forEach(function(id){
    var r = allRequests.find(function(x){ return x.id === id; });
    if (r) out.push(r);
  });
  return out;
}

// — Bulk action: Extend trial ——————————————————————————————————————————
// Opens a small modal where the admin picks a day-count, then iterates
// every selected row through transitionAccount('extend', { days: N }).
// Permanent rows are silently skipped (no trial_end to extend).
function bkExtendOpen() {
  if (bulkState.selected.size === 0) {
    SyDialog.alert('لا توجد حسابات محدّدة.');
    return;
  }
  if (bulkState.inFlight) {
    SyDialog.alert('عملية جماعية أخرى قيد التنفيذ.');
    return;
  }
  var ov = document.getElementById('bkExtendOverlay');
  var inp = document.getElementById('bkExtendDays');
  var hint = document.getElementById('bkExtendHint');
  if (inp) inp.value = '30';
  if (hint) {
    var rows = bkSelectedRows();
    var permCount = rows.filter(function(x){ var st = computeAccountState(x); return st.isPermanent; }).length;
    var extendable = rows.length - permCount;
    hint.textContent = 'سيُمدَّد ' + extendable + ' حساب' +
      (permCount > 0 ? ' (' + permCount + ' حساب دائم سيُتجاوز)' : '') +
      ' بالعدد المُحدّد.';
  }
  if (ov) ov.classList.add('open');
}
function bkExtendClose() {
  var ov = document.getElementById('bkExtendOverlay');
  if (ov) ov.classList.remove('open');
}
async function bkExtendConfirm() {
  var inp = document.getElementById('bkExtendDays');
  var days = inp ? parseInt(inp.value, 10) : NaN;
  // transitionAccount('extend') itself caps at 365 days per call (see the
  // 'extend' case in its switch). Honour the same upper bound here so the
  // single-row writer never rejects what the modal accepted.
  if (!isFinite(days) || days <= 0 || days > 365) {
    SyDialog.alert('عدد الأيام يجب أن يكون بين 1 و 365.');
    return;
  }
  bkExtendClose();
  // Filter out permanent rows up-front (they have no trial_end).
  var targets = bkSelectedRows().filter(function(x){
    return !computeAccountState(x).isPermanent;
  });
  if (targets.length === 0) {
    SyDialog.alert('كل الحسابات المحدّدة دائمة — لا يوجد ما يُمدَّد.');
    return;
  }
  await bkRun('تمديد جماعي', targets, async function(r){
    // Reuse the existing transitionAccount writer so the audit trail,
    // ban-sync, and event logging all happen identically to single-row
    // extends. Signature: transitionAccount(eventType, row, params).
    // Returns: { ok, error, newRow }.
    if (typeof transitionAccount !== 'function') {
      throw new Error('transitionAccount غير متوفرة');
    }
    var result = await transitionAccount('extend', r, { days: days });
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : 'transition failed');
    }
  });
}

// — Bulk action: WhatsApp reminders (popup-blocker friendly) ——————————————
// Opens up to MAX_TABS wa.me URLs in new tabs. More than 5 reliably trips
// popup blockers on Safari/Chrome, so we cap it and tell the user.
function bkSendReminders() {
  bkOpenWaTabs('reminder');
}
function bkSendWelcomes() {
  bkOpenWaTabs('welcome');
}
async function bkOpenWaTabs(kind) {
  if (bulkState.selected.size === 0) { SyDialog.alert('لا توجد حسابات محدّدة.'); return; }
  var MAX_TABS = 5;
  var rows = bkSelectedRows();
  // For reminders we further restrict to rows where a reminder is
  // meaningful: trial or paid (non-permanent) with active days left.
  // Welcome is meaningful for any non-'new' row.
  rows = rows.filter(function(r){
    var waNum = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
    if (!waNum) return false;
    var s = computeAccountState(r);
    if (kind === 'reminder') {
      return (s.state === 'trial' || s.state === 'paid') && !s.isPermanent
             && r.trial_end && s.daysLeft !== null && s.daysLeft > 0;
    }
    // welcome
    return s.state !== 'new';
  });
  if (rows.length === 0) {
    SyDialog.alert(kind === 'reminder'
      ? 'لا توجد حسابات قابلة للتذكير ضمن المحدّد (نحتاج اشتراك ساري وهاتف).'
      : 'لا توجد حسابات قابلة للترحيب ضمن المحدّد (نحتاج هاتف).');
    return;
  }
  var willOpen = Math.min(rows.length, MAX_TABS);
  if (rows.length > MAX_TABS) {
    if (!await SyDialog.confirm({ message: 'سيتم فتح ' + willOpen + ' نوافذ واتساب من أصل ' +
                 rows.length + ' محدّد (حد أقصى ' + MAX_TABS +
                 ' لتجنّب حجب المتصفّح). تابع؟' })) return;
  }
  var batch = rows.slice(0, willOpen);
  for (var i = 0; i < batch.length; i++) {
    var r = batch[i];
    var waNum = (r.user_id && clinicWaByUid[r.user_id]) ? clinicWaByUid[r.user_id] : (r.phone || '');
    // Live owner name first — mirrors the single-send paths.
    var waName = (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : (r.name || '');
    var url;
    try {
      if (kind === 'reminder') {
        var st = computeAccountState(r);
        url = await waReminderLink(waNum, waName, st.daysLeft, r.trial_end, planDisplayName(st.plan));
      } else {
        url = await waWelcomeLink(waNum, waName,
          (r.user_id && ownerEmailByUid[r.user_id]) ? ownerEmailByUid[r.user_id] : r.email);
      }
    } catch(e) {
      console.warn('bulk WA link build failed for', r.id, e);
      continue;
    }
    if (url) window.open(url, '_blank', 'noopener');
    // Small gap so the browser registers each open as user-initiated
    // (we already are inside a click handler chain).
    await new Promise(function(res){ setTimeout(res, 150); });
  }
}

// — Bulk action: CSV export ——————————————————————————————————————————————
// RFC 4180 escaping. Same pattern as Phase X4 evfBuildCsvRow but with a
// customer-centric column set instead of an event-centric one.
async function bkExportCsv() {
  if (bulkState.selected.size === 0) { SyDialog.alert('لا توجد حسابات محدّدة.'); return; }
  var rows = bkSelectedRows();
  var headers = ['المعرّف','الاسم','الإيميل','الهاتف','فرع النقابة','الرقم النقابي',
                 'الخطة','الحالة','الأيام المتبقية','المبلغ المدفوع','العملة',
                 'MRR (ل.س)','تاريخ الإنشاء','نهاية التجربة','معرّف المستخدم'];
  var data = rows.map(function (r) {
    var s2 = computeAccountState(r);
    var mrr = computeRowMrr(r, s2);
    return [
      r.id, r.name || '', r.email || '', r.phone || '', synBranchOf(r), synNoOf(r),
      s2.isPermanent ? 'permanent' : (s2.plan || ''),
      s2.label || s2.state || '',
      (s2.daysLeft === null) ? '' : String(s2.daysLeft),
      r.price_paid == null ? '' : String(r.price_paid),
      r.currency || 'SYP',
      String(mrr),
      // كانت تُكتب ISO خاماً بحرف T وأجزاء الثانية — إكسل يعاملها نصّاً
      // لا تاريخاً، فيسقط الفرز والفلترة الزمنية عن أهمّ عمودين هنا.
      window.SyDentXlsx.stamp(r.created_at),
      window.SyDentXlsx.ymd(r.trial_end),
      r.user_id || ''
    ];
  });
  await window.SyDentXlsx.save({
    filename:  'حسابات-محدّدة-' + window.SyDentXlsx.today(),
    sheetName: 'الحسابات المحدّدة',
    headers:   headers,
    rows:      data,
    cols:      [{wch:38},{wch:22},{wch:26},{wch:15},{wch:16},{wch:12},{wch:12},
                {wch:12},{wch:12},{wch:14},{wch:8},{wch:14},{wch:18},{wch:14},{wch:38}]
  });
}
// — Bulk runner (progress + audit) —————————————————————————————————————
// Generic loop with progress display + per-row error capture. Each step
// waits 200ms before the next to keep the DB politely paced. Single-bulk
// guard via bulkState.inFlight prevents two parallel runs from racing
// over the same progress modal.
async function bkRun(title, rows, perRowAsyncFn) {
  if (bulkState.inFlight) { SyDialog.alert('عملية جماعية أخرى قيد التنفيذ.'); return; }
  bulkState.inFlight = true;
  var total = rows.length;
  var done = 0, errs = 0, errMessages = [];
  var ov = document.getElementById('bkProgressOverlay');
  var titleEl = document.getElementById('bkProgressTitle');
  var fillEl  = document.getElementById('bkProgressFill');
  var textEl  = document.getElementById('bkProgressText');
  var doneEl  = document.getElementById('bkProgressDone');
  var errsEl  = document.getElementById('bkProgressErrs');
  if (titleEl) titleEl.textContent = title + '…';
  if (fillEl)  fillEl.style.width = '0%';
  if (textEl)  textEl.textContent = '0 / ' + total;
  if (doneEl)  { doneEl.style.display = 'none'; doneEl.textContent = ''; }
  if (errsEl)  { errsEl.style.display = 'none'; errsEl.textContent = ''; }
  if (ov) ov.classList.add('open');
  try {
    for (var i = 0; i < rows.length; i++) {
      try {
        await perRowAsyncFn(rows[i]);
        done++;
      } catch(e) {
        errs++;
        errMessages.push((rows[i].name || rows[i].id) + ': ' + (e && (e.message || e)));
        console.warn('bulk per-row failure:', rows[i].id, e);
      }
      if (textEl) textEl.textContent = (i + 1) + ' / ' + total;
      if (fillEl) fillEl.style.width = (((i + 1) / total) * 100) + '%';
      // Politeness gap between rows.
      await new Promise(function(res){ setTimeout(res, 200); });
    }
  } finally {
    bulkState.inFlight = false;
  }
  if (doneEl) {
    doneEl.style.display = 'block';
    doneEl.textContent = '✅ نجح ' + done + ' من ' + total;
  }
  if (errs > 0 && errsEl) {
    errsEl.style.display = 'block';
    errsEl.textContent = '⚠️ فشل ' + errs + ' — انظر الـ console للتفاصيل';
  }
  // Refresh data + UI after a brief pause so the user reads the result.
  setTimeout(function(){
    if (ov) ov.classList.remove('open');
    bulkState.selected.clear();
    bkUpdateBar();
    if (typeof loadAndRender === 'function') loadAndRender();
    else renderList();
  }, errs > 0 ? 3500 : 1800);
}

// === End Phase X7 ===========================================================


/* ═══════════ ح2 (v2): النظرة العامة — MRR ثنائي العملة «دفترياً» ═══════════
   جذر المشكلة (مثبَت من الـDB الحي): زر «تسجيل دفعة مستلمة» لا يحدّث لقطة
   trial_requests بالتصميم، ومع مبدّل v102 صارت الدورة الواحدة تُدفع بعملتين
   (150,000 ل.س + 495$ لنفس السنة) — واللقطة أحادية العملة عاجزة بنيوياً عن
   تمثيلها. الحل بنمط Stripe: دفتر الدفعات هو الحقيقة — لكل حساب مدفوع نأخذ
   دورته الأحدث المغطية لليوم بكل دفعاتها غير الملغاة بعملتيها (÷أيام الدورة
   ×30)، وحساب بلا دفعات مغطية يسقط للقطة (توافقية مع ما قبل M47).
   قراءة صرفة: SELECT واحد غير قاتل، صفر كتابة DB. */
var OV_PAY = { loading: false, loaded: false, failed: false, rows: [] };

function ovLoadPayments(){
  if (OV_PAY.loading || OV_PAY.loaded || OV_PAY.failed) return;
  OV_PAY.loading = true;
  try {
    window.sb.from('subscription_payments')
      .select('tenant_user_id, amount, currency, covers_from, covers_to, voided_at')
      .limit(20000)
      .then(function(res){
        OV_PAY.loading = false;
        if (res && !res.error && Array.isArray(res.data)){
          OV_PAY.rows = res.data.filter(function(p){ return !p.voided_at; });
          OV_PAY.loaded = true;
        } else {
          OV_PAY.failed = true; /* غير قاتل — تبقى اللقطة */
        }
        renderOvRevenue();
      }, function(){ OV_PAY.loading = false; OV_PAY.failed = true; renderOvRevenue(); });
  } catch(_e){ OV_PAY.loading = false; OV_PAY.failed = true; }
}

function ovDayMs(d){ var t = new Date(d + 'T00:00:00Z').getTime(); return isFinite(t) ? t : null; }

/* مساهمة حساب واحد من الدفتر: {syp, usd, src:'ledger'} أو null إن لا دورة مغطية */
function ovLedgerContribution(uid, todayMs){
  var covering = [];
  for (var i = 0; i < OV_PAY.rows.length; i++){
    var p = OV_PAY.rows[i];
    if (p.tenant_user_id !== uid || !p.covers_from || !p.covers_to) continue;
    var f = ovDayMs(p.covers_from), t = ovDayMs(p.covers_to);
    if (f == null || t == null || t <= f) continue;
    if (f <= todayMs && todayMs < t) covering.push({ p: p, f: f, t: t });
  }
  if (!covering.length) return null;
  /* الدورة الأحدث تفوز (تجديد فوق تجديد متداخل ⇒ لا عدّ مضاعف) */
  var maxT = -Infinity;
  covering.forEach(function(c){ if (c.t > maxT) maxT = c.t; });
  var out = { syp: 0, usd: 0 };
  covering.forEach(function(c){
    if (c.t !== maxT) return;
    var days = Math.round((c.t - c.f) / 86400000);
    if (days <= 0) return;
    var amt = Number(c.p.amount);
    if (!isFinite(amt) || amt <= 0) return;
    var monthly = amt * 30 / days;
    if (String(c.p.currency || '').toUpperCase() === 'USD') out.usd += monthly;
    else out.syp += monthly;
  });
  return (out.syp > 0 || out.usd > 0) ? out : null;
}

/* المحرك: يمرّ على الحسابات المدفوعة غير الدائمة — دفترياً أولاً ثم اللقطة */
function ovComputeDual(){
  var todayMs = ovDayMs(new Date().toISOString().slice(0, 10));
  var syp = { mrr: 0, n: 0 }, usd = { mrr: 0, n: 0 };
  var usedLedger = 0, usedSnapshot = 0;
  (allRequests || []).forEach(function(r){
    var s = computeAccountState(r);
    if (s.state !== 'paid' || s.isPermanent) return;
    var c = (OV_PAY.loaded && r.user_id) ? ovLedgerContribution(r.user_id, todayMs) : null;
    if (c){
      usedLedger++;
      if (c.syp > 0){ syp.mrr += c.syp; syp.n++; }
      if (c.usd > 0){ usd.mrr += c.usd; usd.n++; }
      return;
    }
    /* fallback اللقطة — سلوك ما قبل الإصلاح حرفياً */
    var amt = Number(r.price_paid);
    if (!isFinite(amt) || amt <= 0) return;
    var me = monthlyEquivPrice(r.plan, amt, r.billing_cycle);
    if (me <= 0) return;
    usedSnapshot++;
    if (String(r.currency || '').toUpperCase() === 'USD'){ usd.mrr += me; usd.n++; }
    else { syp.mrr += me; syp.n++; }
  });
  var rate = 0;
  try {
    var rv = parseFloat((typeof PLATFORM_SETTINGS_CACHE !== 'undefined' && PLATFORM_SETTINGS_CACHE) ? PLATFORM_SETTINGS_CACHE.usd_report_rate : '');
    if (isFinite(rv) && rv > 0) rate = rv;
  } catch(_e){}
  return { syp: syp, usd: usd, rate: rate,
           unified: syp.mrr + (rate > 0 ? usd.mrr * rate : 0),
           usedLedger: usedLedger, usedSnapshot: usedSnapshot };
}

function ovFmt(n){ return Math.round(n).toLocaleString('en-US'); }
function ovUsdFmt(n){
  var r = Math.round(n * 100) / 100;
  return (r % 1 === 0) ? String(Math.round(r)) : r.toFixed(2);
}

/* ═══ مبدّل عملة عرض التوحيد (النظرة العامة) — v236 ═══
   عرضُ صرفٍ خالص: صفر كتابة DB، صفر مبلغ محوَّل يُكتب بالقاعدة.
   سعرٌ واحد باتجاهين (قاعدة #498): الموحَّد بالدولار = الموحَّد بالليرة ÷ سعر
   التقارير — لا سعر ثانٍ مستقل. الحالة عميلة الجانب وتعود «ل.س» كل تحميل.
   المبدّل لا يظهر إلا وسعرُ التقارير مضبوطاً (>0) — بلا سعرٍ لا قسمة.
   بطاقة «بالعملتين» وسطرُ السعر يبقيان ليريَّين عمداً: الأولى حقيقةُ كلِّ
   عملةٍ بطبيعتها، والثاني بيانٌ عن السعر لا عن الإجمالي (ثابت v214). */
var OV_DISP_CUR = 'SYP';
function ovDispCurEff(d){
  return (OV_DISP_CUR === 'USD' && d && d.rate > 0) ? 'USD' : 'SYP';
}
function ovUnifiedDisp(d){
  if (ovDispCurEff(d) === 'USD') return ovUsdFmt(d.unified / d.rate) + ' $/شهر';
  return ovFmt(d.unified) + ' ل.س/شهر';
}
function ovUnifySeg(d){
  if (!(d && d.rate > 0)) return '';
  var c = ovDispCurEff(d);
  return '<span class="ov2-unyseg" role="group" aria-label="عملة عرض التوحيد">' +
    '<button type="button" class="' + (c === 'SYP' ? 'on' : '') + '" onclick="setOvDispCur(\'SYP\')">ل.س</button>' +
    '<button type="button" class="' + (c === 'USD' ? 'on' : '') + '" onclick="setOvDispCur(\'USD\')">$</button>' +
  '</span>';
}
function setOvDispCur(c){
  OV_DISP_CUR = (c === 'USD') ? 'USD' : 'SYP';
  renderOvRevenue();
}

/* مصدرُ الرقم المعروض — الشارةُ كانت تقرأ OV_PAY.loaded (نجاحُ الجلب) لا
   usedLedger (مساهمةً فعلية)، فكانت تعلن «من دفتر الدفعات» وكلُّ الدفعات
   مُبطَلة والرقمُ كلُّه من اللقطة. المصدر الآن مشتقٌّ من المحرّك نفسه. */
function ovSourceWord(d){
  if (d.usedLedger > 0 && d.usedSnapshot > 0) return 'من دفتر الدفعات + لقطة الاشتراك';
  if (d.usedLedger > 0) return 'من دفتر الدفعات';
  if (d.usedSnapshot > 0) return 'من لقطة الاشتراك';
  return '';
}
function ovSourceTag(d){
  if (!OV_PAY.loaded && !OV_PAY.failed) return 'MRR';  /* الجلبُ لم يعُد بعد */
  var w = ovSourceWord(d);
  return w ? ('MRR · ' + w) : 'MRR';
}

function renderOvRevenue(){
  var host = document.getElementById('ovRevenue');
  if (!host) return;
  ovLoadPayments(); /* أول نداء يطلق الجلب؛ عند وصوله يعاد الرسم دفترياً */
  var d = ovComputeDual();
  var uCur = ovDispCurEff(d);
  var srcNote = '';
  if (OV_PAY.failed){
    srcNote = '<div class="ov2-warn">⚠️ تعذّر تحميل دفتر الدفعات — الأرقام من لقطة الاشتراك (قد لا تعكس الدفعات الحرة)</div>';
  }
  var usdNote = (d.usd.mrr > 0 && d.rate <= 0)
    ? '<div class="ov2-warn">⚠️ ' + ovUsdFmt(d.usd.mrr) + '$ غير محتسبة بالتوحيد — اضبط «سعر صرف التقارير» في إعدادات المنصة</div>'
    : '';
  host.innerHTML =
    '<div class="ov2-rev-head"><span>الإيراد الشهري بالعملتين</span><span class="ov2-tag">' +
      ovSourceTag(d) + '</span></div>' +
    '<div class="ov2-cols">' +
      '<div class="ov2-col">' +
        '<div class="ov2-cur ov2-cur-syp">الليرة السورية</div>' +
        '<div class="ov2-big">' + ovFmt(d.syp.mrr) + ' <small>ل.س/شهر</small></div>' +
        '<div class="ov2-rows">' +
          '<div><span>اشتراكات</span><b>' + d.syp.n + '</b></div>' +
          '<div><span>ARPU</span><b>' + (d.syp.n ? ovFmt(d.syp.mrr / d.syp.n) + ' ل.س' : '\u2014') + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="ov2-sep"></div>' +
      '<div class="ov2-col">' +
        '<div class="ov2-cur ov2-cur-usd">الدولار</div>' +
        '<div class="ov2-big">' + ovUsdFmt(d.usd.mrr) + ' <small>$/شهر</small></div>' +
        '<div class="ov2-rows">' +
          '<div><span>اشتراكات</span><b>' + d.usd.n + '</b></div>' +
          '<div><span>ARPU</span><b>' + (d.usd.n ? ovUsdFmt(d.usd.mrr / d.usd.n) + ' $' : '\u2014') + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ov2-unify"><span>التوحيد المحاسبي ' + (uCur === 'USD' ? 'بالدولار' : 'بالليرة') + '</span>' +
      '<b>' + ovUnifiedDisp(d) + '</b>' +
      ovUnifySeg(d) +
      (d.rate > 0 ? '<small>1$ = ' + ovFmt(d.rate) + ' ل.س (سعر التقارير)</small>' : '') +
    '</div>' + usdNote + srcNote;
  if (OV_PAY.loaded) ovApplyMrrWidget(d);
}

/* ودجة الـMRR العلوية كانت تقرأ اللقطة وحدها (نفس العيب) — بعد وصول الدفتر
   تُعاد كتابتها من المحرك نفسه فلا يعرض السطح الواحد رقمين متناقضين. */
function ovApplyMrrWidget(d){
  var v = document.getElementById('hcMrrValue');
  var sub = document.getElementById('hcMrrSub');
  if (!v || !sub) return;
  if (d.unified > 0){
    v.classList.remove('muted');
    v.innerHTML = (ovDispCurEff(d) === 'USD')
      ? ovUsdFmt(d.unified / d.rate) + ' <span class="health-unit">$/شهر</span>'
      : formatCurrencyShort(d.unified) + ' <span class="health-unit">ل.س/شهر</span>';
  }
  var parts = [];
  if (d.syp.mrr > 0) parts.push(ovFmt(d.syp.mrr) + ' ل.س');
  if (d.usd.mrr > 0){
    parts.push(ovUsdFmt(d.usd.mrr) + '$' + (d.rate > 0 ? '\u00D7' + ovFmt(d.rate) : ' (\u26A0\uFE0F بلا سعر)'));
  }
  var w = ovSourceWord(d);
  if (!w) return;   /* لا مساهم — نترك نصّ الودجة الأصلي (تفصيل الخطط) */
  sub.textContent = w + (parts.length ? ': ' + parts.join(' + ') : '');
}

function renderOvAttention(){
  var host = document.getElementById('ovAttention');
  if (!host) return;
  var rows = [];
  // Paid subscriptions: 14-day window. Trials: 7-day window — the same window
  // as the ⚠️ alerts banner, so the two surfaces on one screen agree (owner
  // report 31 Aug 2026: banner said «2 accounts expiring in 7 days» while this
  // card said «nothing urgent» because both were trials). A trial about to end
  // is a sales moment, not noise.
  var exp = (allRequests || []).filter(function(r){
    var dl = getDaysLeft(r);
    if (dl === null || dl <= 0) return false;
    var s = computeAccountState(r);
    if (s.isPermanent) return false;
    if (s.state === 'paid')  return dl <= 14;
    if (s.state === 'trial') return dl <= 7;
    return false;
  }).sort(function(a, b){ return getDaysLeft(a) - getDaysLeft(b); });
  exp.slice(0, 4).forEach(function(r){
    var isTrial = computeAccountState(r).state === 'trial';
    rows.push('<div class="ov2-att-row"><span class="ov2-ic">\u23F3</span><span class="ov2-tx">' +
      escapeHtml(r.name || '\u2014') + '<small>' + (isTrial ? 'تجربة تنتهي بعد ' : 'ينتهي بعد ') + getDaysLeft(r) + ' يوم</small></span>' +
      '<button type="button" class="ov2-go" onclick="adminGo(\'cu\')">فتح</button></div>');
  });
  if (exp.length > 4){
    rows.push('<div class="ov2-att-row"><span class="ov2-ic">\u23F3</span><span class="ov2-tx">و' +
      (exp.length - 4) + ' حسابات أخرى تنتهي قريباً</span>' +
      '<button type="button" class="ov2-go" onclick="adminGo(\'cu\')">القائمة</button></div>');
  }
  var nNew = (allRequests || []).filter(function(r){ return !r.status || r.status === 'new'; }).length;
  if (nNew > 0){
    rows.push('<div class="ov2-att-row"><span class="ov2-ic">\uD83C\uDD95</span><span class="ov2-tx">' + nNew +
      ' تسجيل جديد بانتظار القبول</span><button type="button" class="ov2-go" onclick="adminGo(\'cu\')">عرض</button></div>');
  }
  var nSrq = (typeof SRQ_CACHE !== 'undefined' && SRQ_CACHE && SRQ_CACHE.length) ? SRQ_CACHE.length : 0;
  if (nSrq > 0){
    rows.push('<div class="ov2-att-row"><span class="ov2-ic">\uD83D\uDCE5</span><span class="ov2-tx">' + nSrq +
      ' طلب ترقية/تجديد معلّق</span><button type="button" class="ov2-go" onclick="adminGo(\'rq\')">عرض</button></div>');
  }
  host.innerHTML = rows.length ? rows.join('')
    : '<div class="ov2-empty">\u2705 لا شيء عاجل \u2014 كل الاشتراكات بأمان</div>';
}


/* ═══════════ ح3: قسم المحاسبة — التبويبات + دفتر المقبوضات + المستحقات ═══════════
   rptSection قائم بلا مساس (تبويبه الافتراضي). الدفتر: SELECT واحد lazy غير قاتل
   ثم فلترة client-side كاملة؛ المستحقات من allRequests (جهة بيلينغ ⇒ الكتالوج
   بعملة الحساب عبر planPriceForCycle، لا الدفتر). قراءة صرفة — صفر كتابة DB. */
var AC_LED = { loading: false, loaded: false, failed: false, rows: [] };
var acLedF = { cur: 'all', method: 'all', period: '90', clinic: 'all', voided: false };
var _acSelsBuilt = false;
var AC_CYCLE_AR = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };

function acGo(sub){
  var subs = ['rpt', 'led', 'dues'];
  if (subs.indexOf(sub) === -1) sub = 'rpt';
  var rpt = document.getElementById('rptSection');
  if (rpt) rpt.style.display = (sub === 'rpt') ? '' : 'none';
  var led = document.getElementById('acLedger');
  if (led) led.classList.toggle('on', sub === 'led');
  var du = document.getElementById('acDues');
  if (du) du.classList.toggle('on', sub === 'dues');
  var btns = document.querySelectorAll('.ac-stb');
  for (var i = 0; i < btns.length; i++)
    btns[i].classList.toggle('on', btns[i].getAttribute('data-sub') === sub);
  if (sub === 'led'){
    if (!AC_LED.loaded && !AC_LED.loading && !AC_LED.failed) acLoadLedger();
    else acRenderLedger();
  }
  if (sub === 'dues') acRenderDues();
}

function acNameByUid(){
  var m = {};
  (allRequests || []).forEach(function(r){ if (r.user_id) m[r.user_id] = r.name || ''; });
  return m;
}
function acRate(){
  try {
    var v = parseFloat((typeof PLATFORM_SETTINGS_CACHE !== 'undefined' && PLATFORM_SETTINGS_CACHE) ? PLATFORM_SETTINGS_CACHE.usd_report_rate : '');
    return (isFinite(v) && v > 0) ? v : 0;
  } catch(_e){ return 0; }
}
function acMethodAr(m){
  try { if (typeof PAY_METHOD_AR !== 'undefined' && PAY_METHOD_AR[m]) return PAY_METHOD_AR[m]; } catch(_e){}
  return m || '\u2014';
}

function acLoadLedger(){
  AC_LED.loading = true;
  var rowsEl = document.getElementById('acLedRows');
  if (rowsEl) rowsEl.innerHTML = '<tr><td colspan="7" class="ac-empty">جارٍ تحميل الدفتر…</td></tr>';
  try {
    window.sb.from('subscription_payments')
      .select('tenant_user_id, amount, currency, method, reference, paid_at, plan_code, billing_cycle, covers_from, covers_to, note, voided_at, created_at')
      .limit(20000)
      .then(function(res){
        AC_LED.loading = false;
        if (res && !res.error && Array.isArray(res.data)){
          AC_LED.rows = res.data.slice().sort(function(a, b){
            /* درس v84: paid_at تاريخ فدفعات اليوم تتعادل — created_at كاسر تعادل */
            if (a.paid_at !== b.paid_at) return a.paid_at < b.paid_at ? 1 : -1;
            return (a.created_at || '') < (b.created_at || '') ? 1 : -1;
          });
          AC_LED.loaded = true;
        } else AC_LED.failed = true;
        acRenderLedger();
      }, function(){ AC_LED.loading = false; AC_LED.failed = true; acRenderLedger(); });
  } catch(_e){ AC_LED.loading = false; AC_LED.failed = true; acRenderLedger(); }
}

function acSetLed(key, val, btn){
  acLedF[key] = val;
  if (btn && btn.parentElement){
    var sibs = btn.parentElement.querySelectorAll('.ac-chip');
    for (var i = 0; i < sibs.length; i++) sibs[i].classList.toggle('on', sibs[i] === btn);
  }
  acRenderLedger();
}

function acBuildSelects(){
  if (_acSelsBuilt) return;
  var ms = document.getElementById('acMethodSel');
  if (ms){
    var seen = {};
    var opts = '<option value="all">كل الطرق</option>';
    AC_LED.rows.forEach(function(p){
      if (p.method && !seen[p.method]){ seen[p.method] = 1;
        opts += '<option value="' + escapeHtml(p.method) + '">' + escapeHtml(acMethodAr(p.method)) + '</option>'; }
    });
    ms.innerHTML = opts;
  }
  var cs = document.getElementById('acClinicSel');
  if (cs){
    var o = '<option value="all">كل العيادات</option>';
    (allRequests || []).forEach(function(r){
      if (r.user_id) o += '<option value="' + escapeHtml(r.user_id) + '">' + escapeHtml(r.name || r.user_id) + '</option>';
    });
    cs.innerHTML = o;
  }
  _acSelsBuilt = true;
}

function acFilteredRows(){
  var today = new Date();
  var ym = today.toISOString().slice(0, 7);
  var cut90 = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  return AC_LED.rows.filter(function(p){
    if (!acLedF.voided && p.voided_at) return false;
    if (acLedF.cur !== 'all' && String(p.currency || 'SYP').toUpperCase() !== acLedF.cur) return false;
    if (acLedF.method !== 'all' && p.method !== acLedF.method) return false;
    if (acLedF.clinic !== 'all' && p.tenant_user_id !== acLedF.clinic) return false;
    if (acLedF.period === 'month' && String(p.paid_at || '').slice(0, 7) !== ym) return false;
    if (acLedF.period === '90' && String(p.paid_at || '') < cut90) return false;
    return true;
  });
}

function acTotalsHtml(sumSyp, sumUsd, label){
  var rate = acRate();
  var uni = sumSyp + (rate > 0 ? sumUsd * rate : 0);
  var s = '<span>' + label + ':</span> <b class="ac-syp">' + ovFmt(sumSyp) + ' ل.س</b>';
  s += ' · <b class="ac-usd">' + ovUsdFmt(sumUsd) + ' $</b>';
  s += ' · موحّد <b class="ac-syp">' + ovFmt(uni) + ' ل.س</b>';
  if (rate > 0) s += ' <small>(1$ = ' + ovFmt(rate) + ')</small>';
  else if (sumUsd > 0) s += ' <small class="ac-warn">⚠️ الدولار غير محتسب — سعر التقارير فارغ</small>';
  return s;
}

function acRenderLedger(){
  var rowsEl = document.getElementById('acLedRows');
  var totEl = document.getElementById('acLedTotals');
  if (!rowsEl || !totEl) return;
  if (AC_LED.failed){
    rowsEl.innerHTML = '<tr><td colspan="7" class="ac-empty">⚠️ تعذّر تحميل دفتر الدفعات — أعد المحاولة لاحقاً</td></tr>';
    totEl.innerHTML = ''; return;
  }
  if (!AC_LED.loaded) return;
  acBuildSelects();
  var names = acNameByUid();
  var rows = acFilteredRows();
  var sumSyp = 0, sumUsd = 0, html = '';
  rows.forEach(function(p){
    var isUsd = String(p.currency || 'SYP').toUpperCase() === 'USD';
    var amt = Number(p.amount) || 0;
    if (!p.voided_at){ if (isUsd) sumUsd += amt; else sumSyp += amt; }
    var cov = p.billing_cycle ? (AC_CYCLE_AR[p.billing_cycle] || escapeHtml(p.billing_cycle)) : '\u2014';
    if (p.covers_from && p.covers_to)
      cov += '<small class="ac-cov">' + escapeHtml(p.covers_from) + ' \u2190 ' + escapeHtml(p.covers_to) + '</small>';
    html += '<tr class="' + (p.voided_at ? 'ac-voided' : '') + '">' +
      '<td class="ac-num">' + escapeHtml(p.paid_at || '') + '</td>' +
      '<td>' + escapeHtml(names[p.tenant_user_id] || '\u2014') + '</td>' +
      '<td class="ac-num ' + (isUsd ? 'ac-usd' : 'ac-syp') + '">' + (isUsd ? ovUsdFmt(amt) : ovFmt(amt)) + '</td>' +
      '<td><span class="ac-tag ' + (isUsd ? 'ac-tag-usd' : 'ac-tag-syp') + '">' + (isUsd ? '$' : 'ل.س') + '</span></td>' +
      '<td>' + escapeHtml(acMethodAr(p.method)) + '</td>' +
      '<td>' + cov + '</td>' +
      '<td>' + escapeHtml(p.note || (p.voided_at ? 'ملغاة' : '')) + '</td>' +
      '</tr>';
  });
  rowsEl.innerHTML = html || '<tr><td colspan="7" class="ac-empty">لا مقبوضات ضمن هذه الفلاتر</td></tr>';
  totEl.innerHTML = acTotalsHtml(sumSyp, sumUsd, 'إجمالي المعروض (' + rows.length + ' دفعة)');
}

async function acLedgerCsv(){
  if (!AC_LED.loaded) return;
  var names = acNameByUid();
  var rows  = acFilteredRows();
  var rate  = acRate();
  var headers = ['التاريخ','العيادة','المبلغ','العملة','الطريقة','الدورة',
                 'من','إلى','ملاحظة','ملغاة'];
  var sumSyp = 0, sumUsd = 0;
  var data = rows.map(function(p){
    var isUsd = String(p.currency || 'SYP').toUpperCase() === 'USD';
    if (!p.voided_at){ if (isUsd) sumUsd += Number(p.amount) || 0; else sumSyp += Number(p.amount) || 0; }
    return [
      window.SyDentXlsx.ymd(p.paid_at),
      names[p.tenant_user_id] || '',
      Number(p.amount) || 0,
      isUsd ? 'USD' : 'SYP',
      acMethodAr(p.method),
      p.billing_cycle || '',
      p.covers_from || '',
      p.covers_to || '',
      p.note || '',
      p.voided_at ? 'نعم' : ''
    ];
  });
  /* ذيل الإجماليات يبقى بنفس ترتيبه السابق حرفياً — الملغاة مستثناة من
     الجمع كما كانت، وسعر الصرف يُصرَّح به لأن الموحّد مشتقّ منه. */
  data.push([]);
  data.push(['الإجمالي ل.س', Math.round(sumSyp)]);
  data.push(['الإجمالي $',   sumUsd]);
  data.push(['سعر صرف التقارير', rate > 0 ? rate : 'غير مضبوط']);
  if (rate > 0) data.push(['الموحّد بالليرة', Math.round(sumSyp + sumUsd * rate)]);

  await window.SyDentXlsx.save({
    filename:  'مقبوضات-سايدنت-' + window.SyDentXlsx.today(),
    sheetName: 'دفتر المقبوضات',
    headers:   headers,
    rows:      data,
    cols:      [{wch:13},{wch:26},{wch:14},{wch:8},{wch:14},{wch:12},
                {wch:13},{wch:13},{wch:30},{wch:9}]
  });
}

function acRenderDues(){
  var rowsEl = document.getElementById('acDuesRows');
  var totEl = document.getElementById('acDuesTotals');
  if (!rowsEl || !totEl) return;
  var sumSyp = 0, sumUsd = 0, html = '';
  function renewVal(r){
    var cfg = null;
    try { cfg = getPlanConfig(r.plan); } catch(_e){}
    var v = null;
    try { v = planPriceForCycle(cfg, r.billing_cycle || 'monthly', r.currency); } catch(_e){}
    return (v != null && isFinite(Number(v)) && Number(v) > 0) ? Number(v) : null;
  }
  function waBtn(r, dl){
    if (!r.phone || !r.trial_end || typeof openWaReminder !== 'function') return '';
    var pn = '';
    try { pn = planDisplayName(r.plan); } catch(_e){ pn = r.plan || ''; }
    return '<a href="#" class="ov2-go" onclick="return openWaReminder(\'' + jsAttr(r.phone) + '\',\'' +
      jsAttr(r.name || '') + '\',' + Number(dl || 0) + ',\'' + jsAttr(r.trial_end) + '\',\'' +
      jsAttr(pn) + '\',event)">💬 تذكير</a>';
  }
  function row(r, dl, stateTag, stateCls){
    var isUsd = String(r.currency || 'SYP').toUpperCase() === 'USD';
    var v = renewVal(r);
    if (v != null){ if (isUsd) sumUsd += v; else sumSyp += v; }
    var pn = ''; try { pn = planDisplayName(r.plan); } catch(_e){ pn = r.plan || ''; }
    return '<tr>' +
      '<td>' + escapeHtml(r.name || '\u2014') + '</td>' +
      '<td>' + escapeHtml(pn) + (r.billing_cycle ? ' · ' + (AC_CYCLE_AR[r.billing_cycle] || '') : '') +
        ' · ' + (isUsd ? '$' : 'ل.س') + '</td>' +
      '<td class="ac-num">' + (dl != null ? (dl > 0 ? 'بعد ' + dl + ' يوم' : 'منذ ' + (-dl) + ' يوم') : '\u2014') + '</td>' +
      '<td class="ac-num ' + (isUsd ? 'ac-usd' : 'ac-syp') + '">' + (v != null ? (isUsd ? ovUsdFmt(v) : ovFmt(v)) : '\u2014') + '</td>' +
      '<td><span class="ac-tag ' + stateCls + '">' + stateTag + '</span></td>' +
      '<td>' + waBtn(r, dl) + '</td>' +
      '</tr>';
  }
  var upcoming = [], late = [];
  (allRequests || []).forEach(function(r){
    var s = computeAccountState(r);
    if (s.isPermanent) return;
    var dl = getDaysLeft(r);
    if (s.state === 'paid' && dl != null && dl > 0 && dl <= 30) upcoming.push({ r: r, dl: dl });
    else if (s.state === 'grace' || s.state === 'expired') late.push({ r: r, dl: dl });
  });
  upcoming.sort(function(a, b){ return a.dl - b.dl; });
  upcoming.forEach(function(x){
    html += row(x.r, x.dl, x.dl <= 7 ? 'مستحق قريباً' : 'ضمن الدورة', x.dl <= 7 ? 'ac-tag-usd' : 'ac-tag-mut');
  });
  late.forEach(function(x){ html += row(x.r, x.dl, 'متأخر', 'ac-tag-red'); });
  rowsEl.innerHTML = html || '<tr><td colspan="6" class="ac-empty">✅ لا تجديدات خلال 30 يوم ولا مستحقات متأخرة</td></tr>';
  totEl.innerHTML = (upcoming.length + late.length)
    ? acTotalsHtml(sumSyp, sumUsd, 'المستحقات المتوقعة (' + (upcoming.length + late.length) + ' حساب)')
    : '';
}


/* ═══════════ ح4: بطاقات الإعدادات — stOpen ═══════════
   تفتح القسم عبر دالة تبديله القائمة حصراً (فيبقى الـlazy-load وحارس
   «تعديلات غير محفوظة» بمحرر الخطط كما هما حرفياً)؛ المفتوح ⇒ سكرول فقط. */
function stOpen(secId, toggleFnName){
  var sec = document.getElementById(secId);
  if (!sec) return;
  if (!sec.classList.contains('open') && typeof window[toggleFnName] === 'function'){
    try { window[toggleFnName](); } catch(_e){}
  }
  setTimeout(function(){
    try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_e){}
  }, 80);
}
