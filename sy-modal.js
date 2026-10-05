/* ════════════════════════════════════════════════════════════════════════
   SyDent — sy-modal.js · عُدّةُ النوافذ + الحوارُ الموحّد (مصدرٌ واحد)
   ────────────────────────────────────────────────────────────────────────
   فُصل من sidebar.js بـv462 كي تحمّله لوحةُ الأدمن أيضاً: sidebar.js يحمل
   آثاراً جانبية لا تخصّ الأدمن (ويدجت الرسائل باستطلاعه · showToast الخاصّ
   بالعيادة)، فتحميلُه هناك خطأ، ونسخُ الكتلتين تفريعٌ يصدأ. الملفُّ بلا أيّ
   اعتماد: يُحمَّل قبل sidebar.js بكل صفحةٍ، وقبل ملفات الأدمن بلوحة الأدمن.
     • SYDENT_MODAL_KIT — window.SyModal (Escape · a11y · قفلُ التمرير · التكديس)
     • SYDENT_DIALOG    — window.SyDialog (confirm/prompt/alert بوعود)
   ════════════════════════════════════════════════════════════════════════ */
/* SYDENT_MODAL_KIT_START — سلوك النوافذ الموحّد (v409)
   اختياري: يعمل فقط على .modal-overlay.sy-m (الصفحة المُرحَّلة). لا يلمس دوال
   الفتح/الإغلاق بأي صفحة: يراقب فئة open/show فقط، والإغلاق بـEscape = نقرٌ على
   زر ✕ نفسه فيمرّ بمنطق الصفحة وتنظيفها حرفياً.
   • Escape يغلق الأعلى فقط، ويُهمَل إن استهلكه عنصرٌ داخلي (preventDefault/stopPropagation)
   • قفل تمرير الخلفية · role=dialog + aria-modal + aria-label · حصر Tab · إعادة التركيز للمُطلِق
   • لا تركيز تلقائي لحقل (يفتح لوحة مفاتيح الموبايل وقوائم الاقتراح) — التركيز على الصندوق فقط */
(function () {
  'use strict';
  if (window.SyModal) return;
  var BOX = '.modal-box, .modal, .modal-card';
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var _watched = [], _prevFocus = [];

  function isOpen(ov) { return ov.classList.contains('open') || ov.classList.contains('show'); }
  function openList() {
    var all = document.querySelectorAll('.modal-overlay.sy-m'), out = [];
    for (var i = 0; i < all.length; i++) if (isOpen(all[i])) out.push(all[i]);
    return out;                       /* ترتيب الـDOM = ترتيب الرسم ⇒ الأخير هو الأعلى */
  }
  function top() { var l = openList(); return l.length ? l[l.length - 1] : null; }
  function boxOf(ov) {
    for (var c = ov.firstElementChild; c; c = c.nextElementSibling) if (c.matches(BOX)) return c;
    return ov.querySelector(BOX);
  }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function onOpened(ov) {
    var box = boxOf(ov);
    if (box) {
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
      var h = ov.querySelector('.modal-head h2, .modal-head h3, .modal-header h2, .modal-header h3, .modal-title');
      var label = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (label) box.setAttribute('aria-label', label);
    }
    _prevFocus.push({ ov: ov, el: document.activeElement });
    if (box && !ov.contains(document.activeElement)) { try { box.focus({ preventScroll: true }); } catch (e) {} }
    document.body.classList.add('sy-modal-lock');
  }
  function onClosed(ov) {
    var rec = null;
    for (var i = _prevFocus.length - 1; i >= 0; i--) if (_prevFocus[i].ov === ov) { rec = _prevFocus.splice(i, 1)[0]; break; }
    if (!openList().length) document.body.classList.remove('sy-modal-lock');
    var a = document.activeElement;
    if (rec && rec.el && rec.el !== document.body && document.body.contains(rec.el) &&
        (!a || a === document.body || ov.contains(a))) {
      try { rec.el.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function watch(ov) {
    if (_watched.indexOf(ov) > -1) return;
    _watched.push(ov);
    var was = isOpen(ov);
    if (was) onOpened(ov);
    new MutationObserver(function () {
      var now = isOpen(ov);
      if (now === was) return;
      was = now;
      if (now) onOpened(ov); else onClosed(ov);
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }
  function scan() {
    var all = document.querySelectorAll('.modal-overlay.sy-m');
    for (var i = 0; i < all.length; i++) watch(all[i]);
  }
  function close(ov) {
    ov = ov || top();
    if (!ov) return false;
    var btn = ov.querySelector('[data-sy-close], .modal-close');
    if (btn) { btn.click(); return true; }
    ov.classList.remove('open'); ov.classList.remove('show');
    return true;
  }

  document.addEventListener('keydown', function (e) {
    var t = top();
    if (!t) return;
    if (e.key === 'Escape' || e.keyCode === 27) {
      if (e.defaultPrevented) return;               /* عنصرٌ داخلي (قائمة/منتقٍ) استهلكه */
      if (t.hasAttribute('data-sy-no-esc')) return; /* نافذة إلزامية */
      e.preventDefault();
      close(t);
      return;
    }
    if (e.key !== 'Tab' && e.keyCode !== 9) return;
    var nodes = t.querySelectorAll(FOCUSABLE), list = [];
    for (var i = 0; i < nodes.length; i++) if (visible(nodes[i])) list.push(nodes[i]);
    if (!list.length) { e.preventDefault(); return; }
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (!t.contains(a) || a === boxOf(t)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  window.SyModal = { scan: scan, close: close, top: top, isOpen: isOpen };
})();
/* SYDENT_MODAL_KIT_END */

/* SYDENT_DIALOG_START — حوارُ التأكيد/الإدخال/الإعلام الموحّد (v456)
   يستبدل confirm/prompt/alert الأصلية: تلك نوافذُ متصفّحٍ بلا لغة المنصة ولا
   ثيمها، تظهر بالإنجليزية بأعلى الشاشة وتحمل اسمَ النطاق، ولا تفرّق بين حذفٍ
   خطيرٍ وسؤالٍ عادي. هذه على عُدّة النوافذ نفسِها (sy-m) فتَرِث الشكلَ والسلوك.
     SyDialog.confirm({ title, message, confirmText, cancelText, danger })  → Promise<bool>
     SyDialog.prompt({ title, message, value, placeholder, confirmText })   → Promise<string|null>
     SyDialog.alert({ title, message })                                     → Promise<void>
   ثوابت: لا إغلاقَ بنقرةٍ خارجية (قرارٌ يُتَّخذ لا نافذةُ عرض) · Escape = إلغاء ·
   التركيزُ على زرِّ الإلغاء بالحوار الخطير وعلى الحقل بالإدخال · وعدٌ واحدٌ يُحسم
   مرةً واحدة مهما تكرّر الضغط. */
(function () {
  'use strict';
  if (window.SyDialog) return;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* نصُّ الرسالة يحفظ أسطرَه: \n صار <br> بعد التهريب (لا HTML من المُستدعي) */
  function body(t) { return esc(t).replace(/\n/g, '<br>'); }

  function build(kind, o) {
    o = o || {};
    var ov = document.createElement('div');
    ov.className = 'modal-overlay sy-m sy-m-sm open sy-dialog';
    ov.setAttribute('data-sy-kind', kind);
    var isPrompt = kind === 'prompt';
    var isAlert  = kind === 'alert';
    var title = o.title || (kind === 'confirm' ? 'تأكيد' : (isPrompt ? 'إدخال' : 'تنبيه'));
    var okTxt = o.confirmText || (isAlert ? 'حسناً' : (kind === 'confirm' ? 'تأكيد' : 'حفظ'));
    ov.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
          (isAlert ? '<button type="button" class="modal-close" data-sy-act="cancel" data-sy-close aria-label="إغلاق">✕</button>' : '') +
        '</div>' +
        '<div class="modal-body">' +
          (o.message ? '<div class="sy-dialog-msg">' + body(o.message) + '</div>' : '') +
          (isPrompt
            ? '<input type="text" class="sy-dialog-input" value="' + esc(o.value || '') +
              '" placeholder="' + esc(o.placeholder || '') + '">'
            : '') +
        '</div>' +
        '<div class="modal-foot">' +
          /* data-sy-close: عُدّةُ النوافذ تنقر هذا الزرَّ عند Escape، فيُحسم الوعدُ
             إلغاءً بدل أن تُخفى النافذةُ ويبقى المُستدعي منتظراً إلى الأبد. */
          (isAlert ? '' : '<button type="button" class="btn-sy-cancel" data-sy-act="cancel" data-sy-close>' + esc(o.cancelText || 'إلغاء') + '</button>') +
          '<button type="button" class="btn-sy-ok' + (o.danger ? ' danger' : '') + '" data-sy-act="ok">' + esc(okTxt) + '</button>' +
        '</div>' +
      '</div>';
    return ov;
  }

  function open(kind, o) {
    return new Promise(function (resolve) {
      var ov = build(kind, o);
      document.body.appendChild(ov);
      if (window.SyModal) window.SyModal.scan();
      var input = ov.querySelector('.sy-dialog-input');
      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        ov.remove();
        if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
        resolve(val);
      }
      ov.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-sy-act]') : null;
        if (!b) return;                       /* النقرُ الخارجي لا يُغلق: قرارٌ يُتَّخذ */
        if (b.getAttribute('data-sy-act') === 'ok') {
          finish(kind === 'prompt' ? (input ? input.value : '') : true);
        } else {
          finish(kind === 'prompt' ? null : (kind === 'alert' ? undefined : false));
        }
      });
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
        });
        setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 30);
      } else {
        var first = ov.querySelector(o && o.danger ? '.btn-sy-cancel' : '.btn-sy-ok');
        setTimeout(function () { try { if (first) first.focus(); } catch (e) {} }, 30);
      }
    });
  }

  window.SyDialog = {
    confirm: function (o) { return open('confirm', typeof o === 'string' ? { message: o } : o); },
    prompt:  function (o) { return open('prompt',  typeof o === 'string' ? { message: o } : o); },
    alert:   function (o) { return open('alert',   typeof o === 'string' ? { message: o } : o); }
  };
})();
/* SYDENT_DIALOG_END */
