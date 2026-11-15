/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-shade.js · دليلُ ألوان الأسنان بطلب المخبر
   ────────────────────────────────────────────────────────────────────────
   مصدرٌ واحد للسطحين (صفحة المخابر + تبويب المخابر ببطاقة المريض — #676).
   زرٌّ بجانب حقل «اللون» يفتح منتقياً بثلاثة أدلّة معروفة: VITA classical (16) · VITA 3D-MASTER (29 مع التبييض) ·
   Ivoclar Chromascop (20). النقرُ يكتب رمزَ اللون بالحقل — والحقلُ يبقى نصاً حرّاً (أدلّةٌ أخرى، لونان، ملاحظة).
     • القيمةُ المكتوبة: «A2» · «3M2» · «Chromascop 210» (رمزُ Chromascop رقمٌ مجرّد، فيُكتب اسمُ دليله معه ليقرأه المخبر).
     • ألوانُ العيّنات على الشاشة **تقريبية** للتمييز بين الرموز لا لمطابقة اللون — المرجعُ الدليلُ الفعلي بضوء النهار،
       والنافذةُ تقول ذلك. لا عمودَ جديد ولا كتابةَ للقاعدة: الحقلُ نفسه يُحفظ بمسار الطلب القائم.
   المعرّفات والأصناف ببادئة lsh-.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabShade) return;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hsl(h, s, l) { return 'hsl(' + h + ',' + Math.round(s) + '%,' + Math.round(l) + '%)'; }

  /* ── الأدلّة: صفوفٌ من {c: الرمز, v: القيمة المكتوبة, bg} — null خانةٌ فارغة تحفظ اصطفاف الأعمدة ── */
  var CLASSICAL = {
    A1: '#efe4ce', A2: '#e9d9b8', A3: '#e2cda3', 'A3.5': '#d9bf8c', A4: '#cdae78',
    B1: '#f0e8d2', B2: '#ebddb6', B3: '#e3cd98', B4: '#dcc184',
    C1: '#e3dbc6', C2: '#d9cdb0', C3: '#cfc1a2', C4: '#bfae8c',
    D2: '#e6dcc8', D3: '#ddd0b8', D4: '#d8c9a8'
  };
  function classicalRows() {
    var rows = [['A1', 'A2', 'A3', 'A3.5', 'A4'], ['B1', 'B2', 'B3', 'B4', null], ['C1', 'C2', 'C3', 'C4', null], [null, 'D2', 'D3', 'D4', null]];
    return rows.map(function (r) { return r.map(function (c) { return c ? { c: c, v: c, bg: CLASSICAL[c] } : null; }); });
  }
  /* 3D-MASTER: المجموعة (القيمة 0..5) · الصبغة L/M/R · التشبّع 1..3 — اللونُ التقريبي يُشتقّ من الرمز نفسه */
  function m3(code) {
    var m = /^(\d)([LMR])([\d.]+)$/.exec(code), v = +m[1], hue = m[2], ch = parseFloat(m[3]);
    var H = hue === 'L' ? 48 : (hue === 'R' ? 33 : 41);
    return { c: code, v: code, bg: hsl(H, v === 0 ? 8 + ch * 6 : 16 + ch * 14, 93 - v * 5.5 - ch * 1.5) };
  }
  function masterRows() {
    var cols = ['M1', 'L1.5', 'R1.5', 'M2', 'L2.5', 'R2.5', 'M3'], rows = [];
    rows.push(cols.map(function (c) { return c.charAt(0) === 'M' ? m3('0' + c) : null; }));
    rows.push(cols.map(function (c) { return (c === 'M1' || c === 'M2') ? m3('1' + c) : null; }));
    [2, 3, 4].forEach(function (g) { rows.push(cols.map(function (c) { return m3(g + c); })); });
    rows.push(cols.map(function (c) { return c.charAt(0) === 'M' ? m3('5' + c) : null; }));
    return rows;
  }
  /* Chromascop: خمسُ مجموعات (100 أبيض · 200 أصفر · 300 بنّي فاتح · 400 رمادي · 500 بنّي غامق) × أربعُ درجات */
  function chromaRows() {
    var G = { 1: [45, 10, 5, 0], 2: [48, 28, 9, 0], 3: [31, 30, 8, 2], 4: [40, 7, 3, 7], 5: [27, 28, 7, 11] };
    return [1, 2, 3, 4, 5].map(function (g) {
      return [1, 2, 3, 4].map(function (i) {
        var code = String(g * 100 + i * 10), p = G[g];
        return { c: code, v: 'Chromascop ' + code, bg: hsl(p[0], p[1] + i * p[2], 91 - i * 4 - p[3]) };
      });
    });
  }
  var GUIDES = [
    { id: 'classical', brand: 'VITA', name: 'classical', rows: classicalRows() },
    { id: 'master', brand: 'VITA', name: '3D-MASTER', rows: masterRows() },
    { id: 'chroma', brand: 'Ivoclar', name: 'Chromascop', rows: chromaRows() }
  ];
  function all(g) { var out = []; g.rows.forEach(function (r) { r.forEach(function (x) { if (x) out.push(x); }); }); return out; }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  /* أين تقع قيمةُ الحقل الحالية — { guide, item } أو null (نصٌّ حرّ) */
  function find(value) {
    var v = norm(value); if (!v) return null;
    for (var i = 0; i < GUIDES.length; i++) {
      var items = all(GUIDES[i]);
      for (var k = 0; k < items.length; k++) if (norm(items[k].v) === v) return { guide: GUIDES[i], item: items[k] };
    }
    return null;
  }

  function grid(g, cur) {
    return '<div class="lsh-grid" style="--lsh-cols:' + g.rows[0].length + '">' + g.rows.map(function (r) {
      return r.map(function (x) {
        if (!x) return '<span class="lsh-gap"></span>';
        return '<button type="button" class="lsh-sw' + (cur && cur.item.v === x.v ? ' lsh-on' : '') + '" data-lsh-v="' + esc(x.v) + '" title="' + esc(x.v) + '">'
          + '<span class="lsh-chip" style="background:' + x.bg + '"></span><span class="lsh-code">' + esc(x.c) + '</span></button>';
      }).join('');
    }).join('') + '</div>';
  }

  /* يفتح المنتقي لحقلٍ نصّي؛ الاختيارُ يكتب بالحقل ويطلق input (القوالبُ والمساعد يقرؤونه) */
  function open(input) {
    if (!input || document.querySelector('.lsh-dialog')) return;
    var cur = find(input.value), active = (cur ? cur.guide : GUIDES[0]).id;
    var ov = document.createElement('div');
    ov.className = 'modal-overlay sy-m sy-m-sm open sy-dialog lsh-dialog';
    ov.setAttribute('data-sy-kind', 'labshade');
    ov.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-head"><h3>دليل الألوان</h3><button type="button" class="modal-close" data-lsh-act="close" data-sy-close aria-label="إغلاق">✕</button></div>' +
        '<div class="modal-body">' +
          '<div class="lsh-tabs" role="tablist">' + GUIDES.map(function (g) {
            return '<button type="button" class="lsh-tab" role="tab" data-lsh-tab="' + g.id + '"><span class="lsh-brand">' + esc(g.brand) + '</span><span class="lsh-name">' + esc(g.name) + '</span></button>';
          }).join('') + '</div>' +
          '<div class="lsh-pane"></div>' +
          '<div class="lsh-note">ألوان الشاشة تقريبية — اعتمد دليل الألوان الفعلي تحت ضوء النهار.</div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn-sy-cancel" data-lsh-act="clear">بلا لون</button>' +
          '<button type="button" class="btn-sy-cancel" data-lsh-act="close" data-sy-close>إغلاق</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    if (window.SyModal) window.SyModal.scan();
    var pane = ov.querySelector('.lsh-pane');
    function show(id) {
      active = id;
      [].forEach.call(ov.querySelectorAll('.lsh-tab'), function (t) {
        var on = t.getAttribute('data-lsh-tab') === id; t.classList.toggle('lsh-tab-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var g = GUIDES.filter(function (x) { return x.id === id; })[0];
      pane.innerHTML = grid(g, cur);
    }
    function finish() {
      ov.remove();
      if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
      try { input.focus(); } catch (e) {}
    }
    function set(v) {
      input.value = v;
      try { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      finish();
    }
    ov.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var tab = t.closest('[data-lsh-tab]'); if (tab) { show(tab.getAttribute('data-lsh-tab')); return; }
      var sw = t.closest('[data-lsh-v]'); if (sw) { set(sw.getAttribute('data-lsh-v')); return; }
      var act = t.closest('[data-lsh-act]'); if (!act) return;                 /* النقرُ الخارجي لا يُغلق — كبقية النوافذ */
      if (act.getAttribute('data-lsh-act') === 'clear') set(''); else finish();
    });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); finish(); } });
    show(active);
  }

  /* يُلحق زرَّ الدليل بحقل اللون مرةً واحدة (الصفحةُ تنادي عند فتح النافذة) */
  function attach(input) {
    if (!input || input._lsh) return;
    input._lsh = 1;
    var wrap = document.createElement('div'); wrap.className = 'lsh-field';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'lsh-btn'; b.title = 'اختيار اللون من دليل الألوان';
    b.innerHTML = '<span aria-hidden="true">🎨</span> <span>دليل الألوان</span>';
    b.addEventListener('click', function () { open(input); });
    wrap.appendChild(b);
  }

  window.SyLabShade = { GUIDES: GUIDES, find: find, open: open, attach: attach };
})();
