/* ============================================================================
   SyDent Theme System — theme.js v1 (27 May 2026)
   ----------------------------------------------------------------------------
   IMPORTANT: this script MUST run as early as possible in <head>, BEFORE any
   page-specific inline CSS or content renders, to prevent a flash of the wrong
   theme (FOUC). It applies `data-theme` to <html> synchronously.

   Persistence: localStorage key `sydent_theme` ∈ {'light','dark'}.
   Default: 'light' (per user requirement "خلي اللايت مود هو الاساسي").

   No DOM/library dependencies. Safe to load before Supabase CDN.
   ============================================================================ */
/* ── سياق Sentry الثابت (الإصدار + البيئة) ──────────────────────────────────
   يعيش هنا لأن theme.js وحده يُحمَّل على **الأربع والعشرين** صفحةً التي تحمل
   مُحمِّل Sentry (supabase-init.js يغطّي 23 — pending.html خارجها)، ولأنه
   يُحمَّل بعد وسم المُحمِّل مباشرةً فتكون Sentry.onLoad متاحة.

   التركيب من نوع Loader Script: لا Sentry.init بالكود إطلاقاً، فكل الإعدادات
   من لوحة Sentry. استدعاءُ init داخل onLoad هو النمط الموثّق لدمج خياراتٍ
   إضافية دون إلغاء إعدادات اللوحة.

   الإصدار يُشتقّ من توكن كسر الكاش الموجود أصلاً على وسم theme.js نفسه — فهو
   يتغيّر مع كل نشرةٍ تمسّ أصلاً مشتركاً، بلا أي مصدرٍ جديدٍ يجب مزامنته.
   والبيئة تُميّز الإنتاج من التجربة المحلية فلا تختلط أخطاء الاختبار بالحقيقية.

   ⚠️ صفر بيانات شخصية هنا. هوية المستأجر (المُعرّف فقط) تُضبَط من
   supabase-init.js حيث تُعرَف الجلسة — انظر التعليق هناك.
   كل شيء محروسٌ بـtry: حاجب إعلانات أو CSP يمنع Sentry يجب ألّا يكسر الثيم. */
(function(){
  try {
    if (typeof Sentry === 'undefined' || typeof Sentry.onLoad !== 'function') return;
    var rel = '';
    try {
      var tag = document.querySelector('script[src*="theme.js?v="]');
      if (tag) rel = (String(tag.getAttribute('src')).split('?v=')[1] || '').split('&')[0];
    } catch (e) {}
    var host = String(location.hostname || '');
    var prod = (host === 'sydent.app' || host === 'www.sydent.app');
    Sentry.onLoad(function(){
      try {
        var opts = { environment: prod ? 'production' : 'development' };
        if (rel) opts.release = 'sydent@' + rel;
        Sentry.init(opts);
      } catch (e) {}
    });
  } catch (e) {}
})();

(function(){
  'use strict';

  var STORAGE_KEY = 'sydent_theme';
  var VALID = { light: 1, dark: 1 };
  var DEFAULT_THEME = 'light';

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return (v && VALID[v]) ? v : null;
    } catch (e) { return null; }
  }

  function writeStored(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  function applyTheme(mode) {
    if (!VALID[mode]) mode = DEFAULT_THEME;
    var root = document.documentElement;
    if (root) root.setAttribute('data-theme', mode);
    // Update the iOS-style meta theme-color so the mobile status bar matches.
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', mode === 'dark' ? '#0a6b60' : '#0d8577');
      }
    } catch (e) {}
  }

  function getTheme() {
    var stored = readStored();
    if (stored) return stored;
    return DEFAULT_THEME; // never auto-follow system; explicit default
  }

  function setTheme(mode) {
    if (!VALID[mode]) mode = DEFAULT_THEME;
    writeStored(mode);
    applyTheme(mode);
    // Mark ready so .body transitions activate AFTER initial paint
    try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
    // Notify any listeners (e.g. charts that need to redraw with new palette)
    try {
      window.dispatchEvent(new CustomEvent('sydent:themechange', {
        detail: { theme: mode }
      }));
    } catch (e) {}
  }

  function toggleTheme() {
    var current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  // -------- Initial sync apply (anti-FOUC) -----------------------------------
  // Must run BEFORE first paint. The CSS default (:root) already targets light,
  // but explicit attribute guarantees [data-theme="..."] selectors work too.
  applyTheme(getTheme());

  // Mark theme-ready on next tick to enable smooth transitions WITHOUT
  // animating the initial paint.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
    }, { once: true });
  } else {
    try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
  }

  // -------- Toggle UI builders -----------------------------------------------
  // Two SVG icons (sun + moon), Heroicons-derived. inline SVG per rule #71.
  var SVG_SUN = '<svg class="stt-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var SVG_MOON = '<svg class="stt-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  /**
   * Build a standalone toggle button (just the switch). Useful for navbars.
   * @param {Object} [opts]
   * @param {string} [opts.title='تبديل الوضع']
   * @returns {HTMLButtonElement}
   */
  function buildToggle(opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sydent-theme-toggle';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', opts.title || 'تبديل الوضع');
    btn.title = opts.title || 'تبديل الوضع الفاتح/الداكن';
    btn.innerHTML = SVG_SUN + SVG_MOON + '<span class="stt-knob" aria-hidden="true"></span>';
    syncAria(btn);
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      toggleTheme();
      syncAria(btn);
    });
    // Keep aria in sync when theme changes from elsewhere (e.g. sidebar)
    window.addEventListener('sydent:themechange', function() { syncAria(btn); });
    return btn;
  }

  function syncAria(btn) {
    var isDark = getTheme() === 'dark';
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
  }

  /**
   * Build a sidebar row: "🌓 الوضع [toggle]"
   * @returns {HTMLDivElement}
   */
  function buildSidebarRow() {
    var row = document.createElement('div');
    row.className = 'sb-theme-row';
    var label = document.createElement('span');
    label.className = 'sb-theme-label';
    label.innerHTML = '<span style="font-size:15px">🌓</span><span>الوضع</span>';
    row.appendChild(label);
    row.appendChild(buildToggle({ title: 'تبديل الوضع الفاتح/الداكن' }));
    return row;
  }

  /**
   * Mount a toggle inside an element selected by CSS selector. No-op if missing.
   * @param {string} selector
   * @param {Object} [opts] passed to buildToggle
   * @returns {HTMLElement|null} the inserted toggle
   */
  function mount(selector, opts) {
    var host = document.querySelector(selector);
    if (!host) return null;
    var t = buildToggle(opts);
    host.appendChild(t);
    return t;
  }

  // -------- Public API -------------------------------------------------------
  window.SyDentTheme = {
    get: getTheme,
    set: setTheme,
    toggle: toggleTheme,
    buildToggle: buildToggle,
    buildSidebarRow: buildSidebarRow,
    mount: mount,
    DEFAULT: DEFAULT_THEME
  };
})();

/* ═══ SyDent PWA — تسجيل الـService Worker (Phase 0) ═══════════════════════
   يعمل على كل الصفحات التي تحمّل theme.js (كل الأسطول؛ book.html لا يحمّله
   بنيوياً فيبقى خارج التسجيل). التسجيل بعد load كي لا يزاحم تحميل الصفحة.
   فشل التسجيل صامت — لا يمس أي سلوك قائم. */
(function () {
  'use strict';
  try {
    if (!('serviceWorker' in navigator)) return;
    var h = location.hostname;
    if (location.protocol !== 'https:' && h !== 'localhost' && h !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  } catch (e) { /* صامت */ }
})();

/* ═══ SyDent PWA — تحديث + تثبيت + إنعاش الكاش (Phase 3) ══════════════════
   • توست «تم التحديث» عند تفعيل إصدار SW جديد (يتجاهل التفعيل الأول).
   • بعد التحميل بـ12ث وأونلاين: أرسل REFRESH_PAGES (الـSW يخنقه بنفسه 6س).
   • التقاط beforeinstallprompt → window.SyDentPWA (زر التثبيت بالإعدادات).
   محروس بالكامل — لا يمس أي سلوك قائم. */
(function () {
  'use strict';
  try {
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; } /* أول claim — صمت */
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('✨ تم تحديث SyDent للإصدار الأحدث', false);
        }
      } catch (e) {}
    });
    window.addEventListener('load', function () {
      setTimeout(function () {
        try {
          if (navigator.onLine !== false && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'REFRESH_PAGES' });
          }
        } catch (e) {}
      }, 12000);
    });
  } catch (e) {}
  try {
    window.SyDentPWA = window.SyDentPWA || { canInstall: false, promptInstall: null, alreadyInstalled: false };
    window.addEventListener('beforeinstallprompt', function (e) {
      try { e.preventDefault(); } catch (err) {}
      window.SyDentPWA.canInstall = true;
      window.SyDentPWA.promptInstall = function () { try { e.prompt(); } catch (err) {} };
      try { document.dispatchEvent(new CustomEvent('sydent-can-install')); } catch (err) {}
    });
    window.addEventListener('appinstalled', function () {
      window.SyDentPWA.canInstall = false;
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('✅ تم تثبيت SyDent كتطبيق', false);
        }
      } catch (e) {}
    });
  } catch (e) {}
  /* كشف «مثبّت مسبقاً» — getInstalledRelatedApps (كروم/Edge/Brave فقط).
     يعتمد related_applications بالمانيفست. بغير المتصفحات: no-op صامت.
     ملاحظة: beforeinstallprompt يتغلّب على هذا الكشف (وصوله = غير مثبّت قطعاً). */
  try {
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(function (apps) {
        if (apps && apps.length > 0) {
          window.SyDentPWA.alreadyInstalled = true;
          try { document.dispatchEvent(new CustomEvent('sydent-already-installed')); } catch (err) {}
        }
      }).catch(function () {});
    }
  } catch (e) {}
})();

/* ═══ SyDent PWA — دعوة التثبيت عند أول فتح (بطاقة عائمة) ═══════════════════
   الغرض: المستخدم الجديد على متصفح جديد لا يعرف أن SyDent قابل للتثبيت —
   بطاقة واحدة غير حاجزة تعرض «ثبّت الآن / لاحقاً» ثم لا تعود أبداً.

   قرارات مقفولة (مبرَّرة بالتصادمات الحيّة وقت الكتابة):
   • الموضع وسط-أسفل bottom:84px — الزاويتان السفليتان محجوزتان عند bottom:14px
     (#syMsgFab وsyPwaReload بجهة، وشارة المزامنة بالأخرى) وارتفاعها 46px.
   • z-index 9990 عمداً — تحت طبقة قفل الـPIN (.sd-lock-modal-overlay = 9999)
     وتحت كل المودالات، فأي طبقة أعلى تغطّيها كما يجب. رفعها فوق 9999 يعني
     زر تثبيت يطفو فوق شاشة القفل.
   • navigator.webdriver → صمت تام: بطاقة عائمة تظهر بعد ثوانٍ تعترض نقرات
     Playwright وتُسقط اختبارات E2E بأخطاء «covered» عمياء.
   • صفر سمة data-test — جرد الحارس مقفول على أربع عشرة سمة بالضبط.
   • رفض localStorage (تصفح خاص) = لا تعرض شيئاً — الافتراض الآمن صمت لا إلحاح.
   محروس بالكامل — لا يمس أي سلوك قائم ولا أي مسار مالي. */
(function () {
  'use strict';
  var KEY = 'sydent_install_prompt';   /* '1' = رُفضت نهائياً على هذا المتصفح */
  var ID  = 'syInstallCard';
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');

  function isStandalone() {
    try {
      if (window.navigator.standalone === true) return true;
      return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }
  /* نفس صياغة isPublicPage() بـsupabase-init.js موسَّعة بالصفحات غير التطبيقية */
  function isExcludedPage() {
    try {
      var p = (window.location.pathname || '').toLowerCase();
      if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
      return /^\/(auth|landing|pending|admin|reset-password|privacy|book|offline)(\.html)?$/.test(p);
    } catch (e) { return true; }
  }
  function lockOpen() {
    try {
      return !!(document.querySelector('.sd-lock-modal-overlay') ||
                document.getElementById('sydentCpOverlay'));
    } catch (e) { return false; }
  }
  function dismissed() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function close() {
    try {
      var c = document.getElementById(ID);
      if (c && c.parentNode) c.parentNode.removeChild(c);
    } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById(ID + 'Style')) return;
    var st = document.createElement('style');
    st.id = ID + 'Style';
    st.textContent =
      '#' + ID + '{position:fixed;bottom:84px;left:50%;transform:translateX(-50%) translateY(14px);' +
      'z-index:9990;width:min(400px,92vw);box-sizing:border-box;background:var(--bg2);' +
      'border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-modal);' +
      'padding:14px 16px;direction:rtl;font-family:inherit;text-align:right;' +
      'opacity:0;transition:opacity .25s ease,transform .25s ease;--syic-on-green:#fff}' +
      ':root[data-theme="dark"] #' + ID + '{--syic-on-green:#062018}' +
      '#' + ID + '.show{opacity:1;transform:translateX(-50%) translateY(0)}' +
      '#' + ID + ' .syic-head{display:flex;align-items:center;gap:9px;margin-bottom:6px}' +
      '#' + ID + ' .syic-title{font-size:14px;font-weight:800;color:var(--text)}' +
      '#' + ID + ' .syic-desc{font-size:12.5px;line-height:1.6;color:var(--text2);margin-bottom:12px}' +
      '#' + ID + ' .syic-actions{display:flex;flex-wrap:wrap;gap:8px}' +
      '#' + ID + ' .syic-btn{flex:1 1 auto;min-width:0;border-radius:9px;padding:9px 14px;' +
      'font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;line-height:1.2}' +
      '#' + ID + ' .syic-primary{background:var(--green);border:1px solid var(--green);color:var(--syic-on-green)}' +
      '#' + ID + ' .syic-ghost{background:transparent;border:1px solid var(--border2);color:var(--text2)}' +
      '#' + ID + ' .syic-note{margin-top:10px;font-size:11.5px;color:var(--text3);line-height:1.5}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* كل النصوص ثابتة حرفياً — صفر استيفاء وصفر إدخال مستخدم (قاعدة #195) */
  function render(iosMode) {
    if (document.getElementById(ID)) return;
    injectStyle();
    var box = document.createElement('div');
    box.id = ID;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'تثبيت SyDent كتطبيق');
    box.innerHTML =
      '<div class="syic-head"><span aria-hidden="true">📲</span>' +
      '<span class="syic-title">ثبّت SyDent كتطبيق</span></div>' +
      '<div class="syic-desc">' +
      (iosMode
        ? 'للتثبيت: زر المشاركة ⬆️ بشريط سفاري ثم «إضافة إلى الشاشة الرئيسية».'
        : 'يفتح بضغطة واحدة من شاشة جهازك، ويكمل شغلك حتى بلا إنترنت.') +
      '</div>' +
      '<div class="syic-actions">' +
      (iosMode
        ? '<button type="button" class="syic-btn syic-primary" id="syicLater">تم</button>'
        : '<button type="button" class="syic-btn syic-primary" id="syicGo">ثبّت الآن</button>' +
          '<button type="button" class="syic-btn syic-ghost" id="syicLater">لاحقاً</button>') +
      '</div>' +
      '<div class="syic-note">تقدر تثبّت البرنامج من الإعدادات بأي وقت.</div>';
    document.body.appendChild(box);

    var go = document.getElementById('syicGo');
    if (go) {
      go.addEventListener('click', function () {
        remember(); close();
        try {
          if (window.SyDentPWA && window.SyDentPWA.promptInstall) window.SyDentPWA.promptInstall();
        } catch (e) {}
      });
    }
    var later = document.getElementById('syicLater');
    if (later) later.addEventListener('click', function () { remember(); close(); });

    /* إطار كي تُلتقط حالة البداية قبل الانتقال */
    try { requestAnimationFrame(function () { box.classList.add('show'); }); }
    catch (e) { box.classList.add('show'); }
  }

  function maybeShow() {
    try {
      if (document.getElementById(ID)) return;
      if (navigator.webdriver) return;
      if (isExcludedPage() || isStandalone() || dismissed()) return;
      if (lockOpen()) return;
      if (!document.body) return;
      if (window.SyDentPWA && window.SyDentPWA.alreadyInstalled) return;
      if (window.SyDentPWA && window.SyDentPWA.canInstall) { render(false); return; }
      if (isIOS) render(true);
    } catch (e) {}
  }

  try {
    document.addEventListener('sydent-can-install', function () { setTimeout(maybeShow, 2500); });
    window.addEventListener('load', function () { setTimeout(maybeShow, 2500); });
    window.addEventListener('appinstalled', function () { remember(); close(); });
  } catch (e) {}
})();

/* SYDENT_FAB_DOCK_START */
/* ═══ SyDent — الحاوية العائمة القابلة للسحب (#syFabDock) ═══════════════════
   الغرض: الزرّان العائمان (الرسائل الداخلية من sidebar.js · التحديث من هذا
   الملف) كانا مثبَّتين بالزاوية السفلية فيغطّيان ما يقع تحتهما (أزرار الترقيم
   بقائمة المرضى — بلاغ المالك بصورة). بدل نقلهما لمكان ثابت آخر يتصادم مع
   محتوى آخر، صارا كتلةً واحدة يسحبها المستخدم حيث يريد — نمط Messenger
   chat heads / فقاعات Android: تُسحب، وتلزق بأقرب حافة جانبية عند الترك،
   ويُحفَظ مكانها.

   قرارات مقفولة:
   • حاوية واحدة لا زرّان مستقلّان: موضع محفوظ واحد فلا يتراكبان بالغلط،
     والزرّان يبقيان متجاورين كما كانا (فجوة 8px = 68 − 14 − 46 السابقة).
   • نقرة ≠ سحب بعتبة DRAG_PX: حركة أقل = نقرة عادية تصل زرّها (ومعها نقرة
     Playwright). ولا pointer capture قبل بدء السحب فعلاً — الالتقاط المبكر
     يعيد توجيه الـclick للحاوية فتموت نقرة الزر (مُثبَت بالمثبت).
   • الحفظ كجهة (يمين/يسار) ونسبة ارتفاع لا بكسل: يصمد مع تغيير حجم النافذة
     وقلب الموبايل، ويُحصر داخل الشاشة بهامش MARGIN عند كل تطبيق.
   • الافتراض (بلا حفظ) = CSS المتغيّرات --sy-fab-* — بالزاوية نفسها التي
     كان فيها الزرّان حرفياً، وadmin.css وحدها تعيد ضبطها (سابقة v74).
   • كبسة مطوّلة HOLD_MS بلا حركة = رجوع للافتراض ومسح الحفظ.
   • حدث window «sydent:fabdock» بعد كل تحريك كي تتبعه لوحة الرسائل.
   • localStorage محجوب = بلا حفظ، والسحب يعمل للجلسة الحالية فقط. */
(function () {
  'use strict';
  if (window.SyDentFabDock) return;
  var ID = 'syFabDock', KEY = 'sydent_fab_dock';
  var MARGIN = 14, DRAG_PX = 6, HOLD_MS = 2000, CLICK_SUPPRESS_MS = 400;
  var _dock = null, _styled = false, _resizeWired = false;
  /* مرآة الجلسة لآخر حفظ: localStorage محجوب (وضع خاص · سياسة) ⇒ السحب يصمد
     للجلسة الحالية على الأقل بدل أن يرتدّ الدوك للزاوية بعد كل ترك. */
  var _mem = null;

  function vw() { return window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0; }
  function vh() { return window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function readPos() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && (v.side === 'left' || v.side === 'right') &&
          typeof v.y === 'number' && isFinite(v.y) && v.y >= 0 && v.y <= 1) return v;
    } catch (e) { /* ignore */ }
    return _mem;
  }
  function writePos(p) {
    _mem = p || null;
    try {
      if (p) localStorage.setItem(KEY, JSON.stringify(p));
      else localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }
  function emit() {
    try { window.dispatchEvent(new CustomEvent('sydent:fabdock')); } catch (e) { /* ignore */ }
  }

  function place(d, left, top, animate) {
    if (animate) d.classList.add('snap'); else d.classList.remove('snap');
    d.style.left = left + 'px';
    d.style.top = top + 'px';
    d.style.right = 'auto';
    d.style.bottom = 'auto';
    emit();
  }
  function clearInline(d) {
    d.classList.remove('snap');
    d.style.left = ''; d.style.top = ''; d.style.right = ''; d.style.bottom = '';
    emit();
  }
  /* يطبّق الموضع المحفوظ (إن وُجد) محصوراً بالشاشة؛ بلا حفظ يعود للـCSS. */
  function applySaved(d, animate) {
    var p = readPos();
    if (!p) { clearInline(d); return; }
    var w = d.offsetWidth || 0, h = d.offsetHeight || 0;
    var maxTop = Math.max(MARGIN, vh() - h - MARGIN);
    var left = p.side === 'left' ? MARGIN : Math.max(MARGIN, vw() - w - MARGIN);
    var top = clamp(Math.round(p.y * Math.max(1, vh() - h)), MARGIN, maxTop);
    place(d, left, top, animate);
  }
  /* لزق بأقرب حافة جانبية انطلاقاً من موضع الترك، وحفظ. */
  function snapFrom(d, left, top) {
    var w = d.offsetWidth || 0, h = d.offsetHeight || 0;
    var side = (left + w / 2) < vw() / 2 ? 'left' : 'right';
    var y = clamp(top / Math.max(1, vh() - h), 0, 1);
    writePos({ side: side, y: y });
    applySaved(d, true);
  }

  function wireDrag(d) {
    var pid = null, sx = 0, sy = 0, ox = 0, oy = 0;
    var dragging = false, held = false, holdT = null, suppressUntil = 0;
    function clearHold() { if (holdT) { clearTimeout(holdT); holdT = null; } }
    d.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (pid !== null) return;
      pid = (e.pointerId == null) ? -1 : e.pointerId;
      sx = e.clientX; sy = e.clientY;
      var r = d.getBoundingClientRect(); ox = r.left; oy = r.top;
      dragging = false; held = false;
      clearHold();
      holdT = setTimeout(function () {
        holdT = null; held = true;
        writePos(null); clearInline(d);
      }, HOLD_MS);
    });
    d.addEventListener('pointermove', function (e) {
      if (pid === null || ((e.pointerId == null) ? -1 : e.pointerId) !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_PX && Math.abs(dy) < DRAG_PX) return;
        if (held) return;
        dragging = true; clearHold();
        try { if (d.setPointerCapture && pid !== -1) d.setPointerCapture(pid); } catch (x) { /* ignore */ }
      }
      var w = d.offsetWidth || 0, h = d.offsetHeight || 0;
      place(d, clamp(ox + dx, 0, Math.max(0, vw() - w)), clamp(oy + dy, 0, Math.max(0, vh() - h)), false);
      if (e.preventDefault) e.preventDefault();
    });
    function end(e) {
      if (pid === null || ((e.pointerId == null) ? -1 : e.pointerId) !== pid) return;
      clearHold();
      try { if (d.releasePointerCapture && pid !== -1) d.releasePointerCapture(pid); } catch (x) { /* ignore */ }
      pid = null;
      if (dragging && !held) {
        var r = d.getBoundingClientRect();
        snapFrom(d, r.left, r.top);
      }
      if (dragging || held) suppressUntil = Date.now() + CLICK_SUPPRESS_MS;
      dragging = false; held = false;
    }
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    /* نقرة تلي سحباً أو كبسةً مطوّلة لا تصل الزر. */
    d.addEventListener('click', function (e) {
      if (Date.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    d.addEventListener('contextmenu', function (e) {
      if (pid !== null || Date.now() < suppressUntil) e.preventDefault();
    });
  }

  /* DeepCode #17 (v550): يتنحّى أثناء التمرير لأسفل (أي حاويةٍ تمرّر — التقاطٌ على المستند)
     ويعود بالتمرير لأعلى، أو قرب أعلى الحاوية، أو حين يتغيّر شيءٌ داخله (شارةُ رسالةٍ جديدة). */
  var AWAY_PX = 6, AWAY_TOP = 80;
  function awayStep(prevY, y) {
    if (y <= AWAY_TOP) return false;
    if (y > prevY + AWAY_PX) return true;
    if (y < prevY - AWAY_PX) return false;
    return null;   /* حركةٌ صغيرة: بلا تغيير */
  }
  function wireAway(d) {
    var last = typeof WeakMap === 'function' ? new WeakMap() : null;
    document.addEventListener('scroll', function (e) {
      var t = (e.target === document || e.target === document.documentElement || e.target === document.body)
        ? (document.scrollingElement || document.documentElement) : e.target;
      if (!t || typeof t.scrollTop !== 'number' || !last) return;
      /* حاويةٌ لم تُرَ بعد تبدأ من أعلاها (0): أولُ حدث تمرير — وقد يكون الوحيد (قفزةُ عجلة/مفتاح) — يُحتسب. */
      var y = t.scrollTop, p = last.has(t) ? last.get(t) : 0;
      var r = awayStep(p, y);
      if (r === true) d.classList.add('sy-fab-away');
      else if (r === false) d.classList.remove('sy-fab-away');
      if (r !== null || !last.has(t)) last.set(t, y);
    }, { capture: true, passive: true });
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { d.classList.remove('sy-fab-away'); })
        .observe(d, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    }
  }

  function injectStyle() {
    if (_styled) return;
    _styled = true;
    var st = document.createElement('style');
    st.textContent =
      '#syFabDock{position:fixed;bottom:var(--sy-fab-bottom,14px);inset-inline-end:var(--sy-fab-end,14px);' +
      'z-index:var(--sy-fab-z,99988);display:flex;align-items:center;gap:8px;' +
      'touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
      '#syFabDock{transition:opacity .18s ease,transform .18s ease}' +
      '#syFabDock.snap{transition:left .2s ease,top .2s ease,opacity .18s ease,transform .18s ease}' +
      '#syFabDock:empty{display:none}' +
      '#syFabDock>button{position:relative;touch-action:none}' +
      /* DeepCode #17 (v550): (أ) مسافةٌ بآخر محتوى الصفحة بقدر الزر فآخرُ صفٍّ يصعد فوقه دائماً;
         (ب) يتنحّى أثناء التمرير لأسفل ويعود بالتمرير لأعلى أو بوصول رسالة (نمط Material). */
      'body:has(#syFabDock:not(:empty)) .sb-main-content::after{content:"";display:block;height:calc(var(--sy-fab-bottom,14px) + 62px)}' +
      '#syFabDock.sy-fab-away{opacity:0;pointer-events:none;transform:translateY(14px)}';
    document.head.appendChild(st);
  }

  function get() {
    if (_dock && _dock.isConnected !== false && document.getElementById(ID) === _dock) return _dock;
    var d = document.getElementById(ID);
    if (!d) {
      if (!document.body) return null;
      injectStyle();
      d = document.createElement('div');
      d.id = ID;
      d.setAttribute('role', 'group');
      d.setAttribute('aria-label', 'أزرار عائمة');
      document.body.appendChild(d);
      wireDrag(d);
      wireAway(d);
      if (!_resizeWired) {
        _resizeWired = true;
        window.addEventListener('resize', function () { if (_dock) applySaved(_dock, false); });
      }
    }
    _dock = d;
    return d;
  }
  /* يضمّ زراً للحاوية ويعيد تطبيق الموضع (عرضها تغيّر). null = لا body بعد. */
  function adopt(btn) {
    var d = get();
    if (!d) return null;
    d.appendChild(btn);
    applySaved(d, false);
    return d;
  }

  window.SyDentFabDock = { get: get, adopt: adopt, apply: function () { if (_dock) applySaved(_dock, false); }, _awayStep: awayStep };
})();
/* SYDENT_FAB_DOCK_END */

/* SYDENT_PWA_RELOAD_START */
/* زر تحديث عائم — يظهر فقط داخل التطبيق المثبّت (standalone) وعلى دسكتوب
   حصراً (hover:hover + pointer:fine). الموبايل مستثنى عمداً: عنده سحب-للتحديث.
   المتصفح العادي مستثنى: عنده زر التحديث الأصلي. reload() بيجيب أحدث HTML
   لأن الـService Worker network-first للصفحات.

   موضعه هنا لا بـsidebar.js: صفحات الأدمن وتسجيل الدخول واللاندينج لا تحمّل
   sidebar.js إطلاقاً، وكل صفحة تحمّله تحمّل theme.js أيضاً — فهذا الملف مجموعة
   شاملة تماماً، والنقل ربح ثلاث صفحات بلا خسارة أي صفحة وبلا مرآة تُحرَس.

   الزر يعيش داخل الحاوية العائمة القابلة للسحب (#syFabDock أعلاه) التي تقرأ
   المتغيّرات --sy-fab-bottom/--sy-fab-end/--sy-fab-z بقيمها الافتراضية = السلوك
   السابق حرفياً على كل صفحات التطبيق. صفحة الأدمن وحدها تعيد ضبطها
   (admin.css): أعلى z-index هناك هو 10000، فبـ99988 كان الزر يطفو فوق كل
   مودالات الأدمن — بخلاف صفحات التطبيق حيث المودالات بـ99999 فتغطّيه كما يجب. */
(function () {
  if (window.__sydentPwaReloadWire) return;
  window.__sydentPwaReloadWire = true;
  function isDesktopStandalone() {
    try {
      if (!window.matchMedia) return false;
      var standalone = window.matchMedia('(display-mode: standalone)').matches;
      var desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      return standalone && desktop;
    } catch (e) { return false; }
  }
  function wire() {
    if (!isDesktopStandalone()) return;
    if (document.getElementById('syPwaReload')) return;
    var st = document.createElement('style');
    st.textContent =
      '#syPwaReload{position:relative;order:1;width:46px;height:46px;' +
      'border-radius:50%;background:var(--bg2);border:1px solid var(--border);color:var(--green);' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-modal);padding:0;font-size:22px;line-height:1}' +
      '#syPwaReload.spin{animation:syPwaSpin .6s linear infinite}' +
      '@keyframes syPwaSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
    var btn = document.createElement('button');
    btn.id = 'syPwaReload';
    btn.type = 'button';
    btn.title = 'تحديث الصفحة';
    btn.setAttribute('aria-label', 'تحديث الصفحة');
    btn.textContent = '\u21BB';
    btn.addEventListener('click', function () {
      btn.classList.add('spin');
      try { window.location.reload(); } catch (e) { /* ignore */ }
    });
    /* ينضمّ للحاوية العائمة القابلة للسحب؛ بغيابها (typeof — درس v187) يعود
       للتثبيت بالزاوية كما كان حرفياً عبر المتغيّرات نفسها. */
    if (!(window.SyDentFabDock && window.SyDentFabDock.adopt && window.SyDentFabDock.adopt(btn))) {
      btn.style.position = 'fixed';
      btn.style.bottom = 'var(--sy-fab-bottom,14px)';
      btn.style.insetInlineEnd = 'calc(var(--sy-fab-end,14px) + 54px)';
      btn.style.zIndex = 'var(--sy-fab-z,99988)';
      document.body.appendChild(btn);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
/* SYDENT_PWA_RELOAD_END */

/* ═══ SyDent — حقلُ التاريخ الموحّد (DeepCode #19 · v560) ═══════════════════════
   حقلُ التاريخ الأصلي (type=date) يعرض ترتيبَه حسب لغة **الجهاز** لا الموقع — جهازٌ إنكليزي يكتب mm/dd/yyyy بينما المنصة تعرض
   يوم/شهر/سنة. نمط Dentally: حقلٌ واحد بصيغة **يوم/شهر/سنة** بكل جهاز، وزرّ 📅 يفتح منتقي الجهاز نفسه (عجلةُ الموبايل باقية).
   • العنصرُ نفسُه يبقى (المعرّف · الأصناف · المستمعون · onchange)؛ نوعُه يصير text و`value` يُعاد تعريفه على النسخة:
     **القراءة والكتابة بـYYYY-MM-DD كما كانت** — صفرُ تغيير على أي كود يقرأ التاريخ أو يكتبه.
   • الكتابةُ تُفسَّر قبل مستمعي الصفحة (التقاطٌ على المستند): ناقصةٌ/غير صالحة ⇒ '' (كالحقل الأصلي تماماً).
   • منتقٍ مرافق (type=date شفّاف فوق زر 📅) — نقرٌ حقيقي على حقل تاريخ ⇒ يعمل بكل متصفح؛ وshowPicker على الحاسوب.
   • يُطبَّق على كل حقل تاريخ موجود أو يُضاف لاحقاً (MutationObserver)؛ `data-native-date` يستثني حقلاً. */
(function () {
  if (window.SyDentDateField || typeof HTMLInputElement === 'undefined') return;
  var P = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function lat(s) { return String(s == null ? '' : s).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) & 15); }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function valid(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return y >= 1900 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
  /* نصٌّ ⇒ YYYY-MM-DD | '' (فارغ) | null (ناقص/غير صالح). يقبل ي/ش/سنة بـ/ أو - أو . · 8 أرقام متصلة · ISO كما هو · أرقاماً عربية. */
  function parse(txt) {
    var s = lat(txt).trim(); if (!s) return '';
    var m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/) || s.match(/^(\d{2})(\d{2})(\d{4})$/);
    var y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else { m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; y = +m[1]; mo = +m[2]; d = +m[3]; }
    return valid(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : null;
  }
  function fmt(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  /* الأرقام تُنسَّق تلقائياً (ي ي / ش ش / س س س س) ما دامت الشرطاتُ بمواضعها التلقائية فقط (بعد خانتين ثم بعد خمس)؛
     من يكتب فاصلةً بموضعٍ آخر (1/10/2026) يُترك كما كتب. */
  function mask(raw) {
    var s = lat(raw);
    if (!/^[\d\/]*$/.test(s)) return s;
    for (var k = 0; k < s.length; k++) if (s.charAt(k) === '/' && k !== 2 && k !== 5) return s;
    var d = s.replace(/\//g, '').slice(0, 8);
    return d.length <= 2 ? d : d.length <= 4 ? d.slice(0, 2) + '/' + d.slice(2) : d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
  }
  function enhance(el) {
    if (!el || el.__syDf || el.type !== 'date' || el.hasAttribute('data-native-date') || (el.classList && el.classList.contains('sy-df-pick'))) return;
    el.__syDf = true;
    var iso = parse(P.get.call(el)) || '';
    var cs = window.getComputedStyle(el), hiddenNow = !el.offsetParent && cs.display !== 'contents';
    var wrap = document.createElement('span');
    wrap.className = 'sy-df';
    var block = hiddenNow || /%$/.test(cs.width) || cs.display === 'block' || (el.parentElement && el.offsetWidth >= el.parentElement.clientWidth - 24);
    wrap.style.display = block ? 'block' : 'inline-block';
    if (cs.flexGrow !== '0' || cs.flexBasis !== 'auto') { wrap.style.flex = cs.flex; wrap.style.minWidth = '0'; }
    if (el.style.width && !/%$/.test(el.style.width)) wrap.style.width = el.style.width;
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    var pick = document.createElement('input');
    pick.type = 'date'; pick.className = 'sy-df-pick'; pick.tabIndex = -1; pick.setAttribute('aria-hidden', 'true');
    pick.__syDf = true;   /* المنتقي المرافق نفسُه لا يُعزَّز (وإلا حلقةٌ لا تنتهي مع المراقب) */
    ['min', 'max'].forEach(function (a) { if (el.hasAttribute(a)) pick.setAttribute(a, el.getAttribute(a)); });
    var ico = document.createElement('span'); ico.className = 'sy-df-ico'; ico.setAttribute('aria-hidden', 'true');
    wrap.appendChild(ico); wrap.appendChild(pick);
    el.type = 'text';
    el.classList.add('sy-df-in');
    el.setAttribute('inputmode', 'numeric'); el.setAttribute('autocomplete', 'off'); el.setAttribute('dir', 'ltr');
    if (!el.getAttribute('placeholder')) el.setAttribute('placeholder', 'يوم/شهر/سنة');
    if (!el.getAttribute('title')) el.setAttribute('title', 'يوم/شهر/سنة — أو اضغط 📅');
    function show(i) { iso = i; P.set.call(el, fmt(i)); P.set.call(pick, i || ''); el.classList.remove('sy-df-bad'); }
    Object.defineProperty(el, 'value', { configurable: true,
      get: function () { return iso; },
      set: function (v) { show(parse(v) || ''); } });
    el.__syDfTyped = function () {
      var raw = P.get.call(el), m = mask(raw);
      if (m !== raw) P.set.call(el, m);
      var r = parse(m);
      iso = r || '';
      P.set.call(pick, iso);
      el.classList.toggle('sy-df-bad', r === null && lat(m).replace(/\D/g, '').length >= 8);
    };
    el.addEventListener('blur', function () {
      if (parse(P.get.call(el)) === null && P.get.call(el).trim()) el.classList.add('sy-df-bad');
      else if (iso) P.set.call(el, fmt(iso));
    });
    pick.addEventListener('click', function () { try { if (pick.showPicker) pick.showPicker(); } catch (e) {} });
    pick.addEventListener('change', function () {
      show(P.get.call(pick) || '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.focus = (function (f) { return function () { return f.apply(el, arguments); }; })(el.focus);
    function mirror() {
      pick.disabled = el.disabled || el.readOnly;
      wrap.style.display = (el.hidden || el.style.display === 'none') ? 'none' : (block ? 'block' : 'inline-block');
      ['min', 'max'].forEach(function (a) { if (el.hasAttribute(a)) pick.setAttribute(a, el.getAttribute(a)); else pick.removeAttribute(a); });
    }
    mirror();
    if (typeof MutationObserver === 'function') new MutationObserver(mirror).observe(el, { attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'style', 'min', 'max'] });
    if (el.form) el.form.addEventListener('reset', function () { setTimeout(function () { show(parse(el.getAttribute('value')) || ''); }, 0); });
    show(iso);
  }
  /* الكتابةُ تُفسَّر قبل أي مستمعٍ للصفحة على الحقل (التقاطٌ على المستند يسبق مرحلة الهدف). */
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.__syDfTyped && e.isTrusted) t.__syDfTyped(); }, true);
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="date"]:not(.sy-df-pick)')) enhance(root);
    var list = root.querySelectorAll('input[type="date"]:not(.sy-df-pick)');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }
  function injectStyle() {
    if (document.getElementById('syDfStyle')) return;
    var st = document.createElement('style'); st.id = 'syDfStyle';
    st.textContent =
      '.sy-df{position:relative;max-width:100%;vertical-align:middle}' +
      '.sy-df>.sy-df-in{width:100%;box-sizing:border-box;padding-left:38px !important;text-align:right;font-variant-numeric:tabular-nums}'   /* الحقلُ LTR والصفحةُ RTL ⇒ مواضعُ فيزيائية: الأيقونة يساراً والنص يميناً */ +
      '.sy-df>.sy-df-in.sy-df-bad{border-color:var(--red) !important;box-shadow:0 0 0 2px var(--red-bg) !important}' +
      '.sy-df-ico{position:absolute;left:10px;top:50%;width:18px;height:18px;margin-top:-9px;pointer-events:none;opacity:.75;' +
        'background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27%3E%3Crect x=%273%27 y=%275%27 width=%2718%27 height=%2716%27 rx=%272%27/%3E%3Cpath d=%27M16 3v4M8 3v4M3 10h18%27/%3E%3C/svg%3E") center/contain no-repeat;' +
        'mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27%3E%3Crect x=%273%27 y=%275%27 width=%2718%27 height=%2716%27 rx=%272%27/%3E%3Cpath d=%27M16 3v4M8 3v4M3 10h18%27/%3E%3C/svg%3E") center/contain no-repeat;color:var(--text2)}' +
      /* قواعدُ الصفحات على input[type=date] (عرض 100%، حشو…) تنطبق على المنتقي المرافق أيضاً — !important يحصره بزرّ 📅 وحده */
      '.sy-df>.sy-df-pick{position:absolute !important;left:0 !important;right:auto !important;top:0 !important;bottom:0 !important;width:38px !important;min-width:0 !important;max-width:38px !important;' +
        'height:100% !important;min-height:0 !important;margin:0 !important;padding:0 !important;border:0 !important;opacity:0 !important;cursor:pointer;z-index:1;font-size:16px;flex:none !important}' +
      '.sy-df>.sy-df-pick:disabled{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  }
  function boot() {
    injectStyle(); scan(document);
    if (typeof MutationObserver === 'function') new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var n = ms[i].addedNodes[j]; if (n.nodeType === 1) scan(n); }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  window.SyDentDateField = { parse: parse, fmt: fmt, mask: mask, enhance: enhance };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ═══ SyDent — سقفُ الشارات (DeepCode #15 · v565) ═══════════════════════════════
   مصدرٌ واحد لطيّ الشارات الزائدة على بطاقات المواعيد (صفحةُ المواعيد ولوحةُ التحكم): تُعرض حتى `max` شارة والباقي
   خلف «+N» يفتح مكانه بلا فتح الموعد. **التحذيرُ الطبي والحساسية و«انتظار» لا تُطوى أبداً** (تُعرف بنصّها لا ببادئة ⚠️ —
   شاراتُ الالتزام والتذكير تبدأ بـ⚠️ أيضاً وليست سلامةً سريرية). كلُّ مجموعةٍ تُعالَج مرةً واحدة. */
(function () {
  if (window.SyDentBadgeCap) return;
  function isSafety(el) {
    var t = (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.indexOf('تحذير طبي') > -1 || t.indexOf('حساسية') > -1 || t.indexOf('⚡') === 0;
  }
  /* root: عنصرٌ يُعلَّم ab-open عند الفتح · badges: الشاراتُ بترتيب العرض · host: مكانُ زرّ «+N» */
  function apply(root, badges, host, max) {
    if (!root || root.__abCap) return; root.__abCap = true;
    max = max || 3;
    if (badges.length <= max) return;
    var shown = 0, hidden = [], i;
    for (i = 0; i < badges.length; i++) if (isSafety(badges[i])) shown++;
    for (i = 0; i < badges.length; i++) {
      if (isSafety(badges[i])) continue;
      if (shown < max) { shown++; continue; }
      badges[i].classList.add('ab-more'); hidden.push(badges[i]);
    }
    if (!hidden.length) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ab-plus'; b.textContent = '+' + hidden.length;
    b.title = 'عرض كل الشارات (' + hidden.length + ' إضافية)'; b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      var open = !root.classList.contains('ab-open');
      root.classList.toggle('ab-open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.textContent = open ? '−' : '+' + hidden.length;
    });
    b.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    (host || root).appendChild(b);
  }
  function injectStyle() {
    if (document.getElementById('syAbStyle')) return;
    var st = document.createElement('style'); st.id = 'syAbStyle';
    st.textContent = '.ab-more{display:none !important}.ab-open .ab-more{display:inline-flex !important}' +
      '.ab-plus{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;padding:0 6px;margin-inline-start:4px;border-radius:10px;' +
      'border:1px solid var(--border);background:var(--bg3);color:var(--text2);font:700 11px/1 inherit;cursor:pointer;vertical-align:middle}' +
      '.ab-plus:hover{color:var(--text);border-color:var(--border2)}';
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyle); else injectStyle();
  window.SyDentBadgeCap = { apply: apply, isSafety: isSafety };
})();
