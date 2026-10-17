/* ════════════════════════════════════════════════════════════════════
   xray-viewer.js — عارضُ الأشعة (ج2 · v636) — SyXrayViewer
   بلا مكتبة: الصورةُ <img> والتعليقاتُ <svg> فوقها داخل «عالمٍ» واحدٍ يُحرَّك بـCSS transform
   (translate + scale) — فلاترُ CSS (سطوع · تباين · عكس) تعمل على كل متصفح بما فيه سفاري آيفون
   (بخلاف فلتر الكانفس)، والإحداثياتُ كلُّها بكسلاتُ الصورة الأصلية فلا تنزاح بالتكبير.
   • التكبير/التحريك: سحب · عجلة · قرص بإصبعين · نقرٌ مزدوج · أزرار · لوحة المفاتيح.
   • القياس بالمليمتر بعد معايرةٍ يدوية (خطٌّ فوق طولٍ معروف ⇒ مم/بكسل يُحفظ للصورة calib_mm_per_px).
   • تعليقاتٌ مرسومة (سهم · دائرة · نص · مسطرة) تُحفظ بـannotations (jsonb على الصف) — الأصلُ لا يُمسّ.
     حفظٌ تلقائي مؤجَّل، فشلُه يُعلَن ويُعاد عند عودة الاتصال، والإغلاقُ يُفرغ المعلّق أولاً.
   • القراءة فقط: عرضٌ وتعديلُ عرضٍ وقياسٌ مؤقت — لا حفظ ولا أدوات رسم.
   • ما يُقرأ من الصف يُنقّى (أنواعٌ معروفة · أرقامٌ محدودة · نصٌّ ≤ 120) ويُرسم بـtextContent — صفرُ innerHTML لنصّ مستخدم.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyXrayViewer) return;

  var COLORS = { r: 'var(--red)', y: 'var(--yellow)', g: 'var(--green)', b: 'var(--blue)' };
  var KINDS = ['arrow', 'circle', 'text', 'ruler'];
  var MAX_ANN = 200, MAX_TXT = 120, MIN_S = 0.02, MAX_S = 40;
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ── دوالٌّ صافية (يختبرها prove-xray-viewer) ── */
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  // تنقيةُ ما يأتي من القاعدة: أنواعٌ معروفة · إحداثياتٌ عددية داخل حدٍّ معقول · نصٌّ مقصوص · لونٌ من اللوحة.
  function sanitize(list, w, h) {
    if (!Array.isArray(list)) return [];
    var lim = Math.max(w || 0, h || 0, 1) * 4, out = [];
    function okc(v) { return num(v) && Math.abs(v) <= lim; }
    for (var i = 0; i < list.length && out.length < MAX_ANN; i++) {
      var a = list[i];
      if (!a || typeof a !== 'object' || KINDS.indexOf(a.t) < 0) continue;
      var c = Object.prototype.hasOwnProperty.call(COLORS, a.c) ? a.c : 'r';
      if (a.t === 'arrow' || a.t === 'ruler') {
        if (!okc(a.x1) || !okc(a.y1) || !okc(a.x2) || !okc(a.y2)) continue;
        out.push({ t: a.t, x1: round1(a.x1), y1: round1(a.y1), x2: round1(a.x2), y2: round1(a.y2), c: c });
      } else if (a.t === 'circle') {
        if (!okc(a.cx) || !okc(a.cy) || !num(a.r) || a.r <= 0 || a.r > lim) continue;
        out.push({ t: 'circle', cx: round1(a.cx), cy: round1(a.cy), r: round1(a.r), c: c });
      } else if (a.t === 'text') {
        var s = typeof a.s === 'string' ? a.s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_TXT) : '';
        if (!s || !okc(a.x) || !okc(a.y)) continue;
        out.push({ t: 'text', x: round1(a.x), y: round1(a.y), s: s, c: c });
      }
    }
    return out;
  }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  // طولُ خطٍّ بالمليمتر إن عويرت الصورة، وإلا بالبكسل — النصُّ المعروض.
  function lenLabel(px, calib) {
    if (num(calib) && calib > 0) { var mm = px * calib; return (mm >= 100 ? Math.round(mm) : mm.toFixed(1)) + ' مم'; }
    return Math.round(px) + ' بكسل';
  }
  // المعايرة: طولٌ معروف (مم) على خطٍّ (بكسل) ⇒ مم/بكسل، أو null إن لم يصلح.
  function calibFrom(mm, px) {
    mm = Number(String(mm == null ? '' : mm).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[٫,]/, '.'));
    if (!num(mm) || mm < 0.1 || mm > 500 || !num(px) || px < 5) return null;
    var c = mm / px;
    return (c > 0 && c < 10) ? Math.round(c * 1e6) / 1e6 : null;
  }
  // تكبيرٌ حول نقطة (cx,cy) بإحداثيات الشاشة: النقطةُ تحت الإصبع/المؤشر تبقى مكانها.
  function zoomAt(v, f, cx, cy) {
    var s2 = clampN(v.s * f, MIN_S, MAX_S), k = s2 / v.s;
    return { s: s2, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
  }
  function fitView(iw, ih, vw, vh) {
    if (!(iw > 0 && ih > 0 && vw > 0 && vh > 0)) return { s: 1, tx: 0, ty: 0 };
    var s = Math.min(vw / iw, vh / ih) * 0.94;
    return { s: s, tx: (vw - iw * s) / 2, ty: (vh - ih * s) / 2 };
  }
  function toImage(v, sx, sy) { return { x: (sx - v.tx) / v.s, y: (sy - v.ty) / v.s }; }

  /* ── الحالة ── */
  var S = {
    open: false, docs: [], idx: 0, doc: null, iw: 0, ih: 0, v: { s: 1, tx: 0, ty: 0 },
    tool: 'pan', color: 'r', ann: [], calib: null, ro: false,
    bright: 100, contrast: 100, invert: false,
    dirty: false, saving: null, saveTimer: null, failed: '',
    ptrs: {}, drag: null, pinch: null, temp: null, opts: null, loadSeq: 0, blobUrl: null, dicomCalib: null, note: ''
  };
  var E = {};   // عناصرُ الواجهة

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(cls, label, title, fn) {
    var b = el('button', 'xrv-b ' + (cls || ''), label); b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', fn); return b;
  }

  function build() {
    if (E.root) return;
    var root = el('div', 'xrv'); root.id = 'xrViewer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.hidden = true;
    var top = el('div', 'xrv-top');
    E.close = btn('xrv-x', '✕', 'إغلاق (Esc)', function () { close(); });
    E.title = el('div', 'xrv-title');
    E.name = el('div', 'xrv-name'); E.meta = el('div', 'xrv-meta');
    E.title.appendChild(E.name); E.title.appendChild(E.meta);
    E.prev = btn('', '→', 'الصورة السابقة', function () { go(-1); });
    E.count = el('span', 'xrv-count');
    E.next = btn('', '←', 'الصورة التالية', function () { go(1); });
    E.fs = btn('', '⛶', 'ملء الشاشة', toggleFs);
    E.dl = el('a', 'xrv-b', '⬇'); E.dl.title = 'تنزيل الأصل'; E.dl.setAttribute('aria-label', 'تنزيل الأصل'); E.dl.rel = 'noopener';
    [E.close, E.title, E.prev, E.count, E.next, E.fs, E.dl].forEach(function (x) { top.appendChild(x); });

    E.stage = el('div', 'xrv-stage'); E.stage.tabIndex = -1;
    E.world = el('div', 'xrv-world');
    E.img = el('img', 'xrv-img'); E.img.alt = ''; E.img.draggable = false;
    E.svg = document.createElementNS(SVGNS, 'svg'); E.svg.setAttribute('class', 'xrv-svg');
    E.world.appendChild(E.img); E.world.appendChild(E.svg); E.stage.appendChild(E.world);
    E.msg = el('div', 'xrv-msg'); E.stage.appendChild(E.msg);

    var bar = el('div', 'xrv-bar');
    var tools = el('div', 'xrv-grp xrv-tools');
    E.tools = {};
    [['pan', '✋', 'تحريك'], ['ruler', '📐', 'قياس'], ['calib', '📏', 'معايرة'], ['arrow', '↗', 'سهم'], ['circle', '◯', 'دائرة'], ['text', 'نص', 'نص'], ['erase', '🧽', 'مسح تعليق']].forEach(function (t) {
      var b = btn('xrv-tool', t[1], t[2], function () { setTool(t[0]); }); b.setAttribute('data-tool', t[0]); E.tools[t[0]] = b; tools.appendChild(b);
    });
    E.undo = btn('xrv-ed', '↶', 'تراجع عن آخر تعليق', undo); tools.appendChild(E.undo);
    var cols = el('div', 'xrv-grp xrv-cols'); E.cols = {};
    Object.keys(COLORS).forEach(function (k) {
      var b = btn('xrv-col', '', 'اللون', function () { S.color = k; paintBar(); }); b.style.setProperty('--xrv-c', COLORS[k]); b.setAttribute('data-c', k); E.cols[k] = b; cols.appendChild(b);
    });
    var adj = el('div', 'xrv-grp xrv-adj');
    E.bright = range('☀', 'السطوع', function (v) { S.bright = v; applyFilter(); });
    E.contrast = range('◐', 'التباين', function (v) { S.contrast = v; applyFilter(); });
    adj.appendChild(E.bright.wrap); adj.appendChild(E.contrast.wrap);
    E.inv = btn('', '⇄', 'عكس الألوان', function () { S.invert = !S.invert; applyFilter(); paintBar(); }); adj.appendChild(E.inv);
    adj.appendChild(btn('', '⟲', 'إعادة الضبط', resetAdjust));
    var zm = el('div', 'xrv-grp');
    zm.appendChild(btn('', '−', 'تصغير', function () { zoomCenter(1 / 1.25); }));
    zm.appendChild(btn('', '⤢', 'ملاءمة الشاشة', fit));
    zm.appendChild(btn('', '+', 'تكبير', function () { zoomCenter(1.25); }));
    E.zoomLbl = el('span', 'xrv-zl'); zm.appendChild(E.zoomLbl);
    E.status = el('div', 'xrv-status');
    [tools, cols, adj, zm].forEach(function (g) { bar.appendChild(g); });
    root.appendChild(top); root.appendChild(E.stage); root.appendChild(bar); root.appendChild(E.status);
    document.body.appendChild(root);
    E.root = root;

    E.stage.addEventListener('pointerdown', onDown);
    E.stage.addEventListener('pointermove', onMove);
    E.stage.addEventListener('pointerup', onUp);
    E.stage.addEventListener('pointercancel', onUp);
    E.stage.addEventListener('wheel', onWheel, { passive: false });
    E.stage.addEventListener('dblclick', function (e) { if (S.tool !== 'pan') return; var r = E.stage.getBoundingClientRect(); S.v = S.v.s > fitView(S.iw, S.ih, r.width, r.height).s * 1.5 ? fitView(S.iw, S.ih, r.width, r.height) : zoomAt(S.v, 2.5, e.clientX - r.left, e.clientY - r.top); applyView(); });
    E.img.addEventListener('load', onImgLoad);
    E.img.addEventListener('error', function () { showMsg('تعذّر تحميل الصورة — تحقّق من الاتصال'); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () { if (S.open && S.iw) applyView(); });
    window.addEventListener('online', function () { if (S.open && S.dirty) scheduleSave(0); });
    document.addEventListener('fullscreenchange', function () { if (S.open) setTimeout(fit, 60); });
  }
  function range(icon, title, fn) {
    var wrap = el('label', 'xrv-rng'); wrap.title = title;
    var ic = el('span', '', icon); var r = el('input'); r.type = 'range'; r.min = '40'; r.max = '220'; r.step = '5'; r.value = '100'; r.setAttribute('aria-label', title);
    r.addEventListener('input', function () { fn(Number(r.value)); });
    wrap.appendChild(ic); wrap.appendChild(r); return { wrap: wrap, input: r };
  }

  /* ── فتح · تنقّل · إغلاق ── */
  // opts: { docs:[صفوف صور], index, urlFor: async(row)→رابط, onSaved(row), onClose() }
  function open(opts) {
    build();
    S.opts = opts || {};
    S.docs = (S.opts.docs || []).slice(); S.idx = clampN(S.opts.index || 0, 0, Math.max(0, S.docs.length - 1));
    S.ro = !!(window.SyDentSub && window.SyDentSub.isReadOnly && window.SyDentSub.isReadOnly());
    S.open = true; E.root.hidden = false; document.documentElement.classList.add('xrv-open');
    E.root.classList.toggle('xrv-ro', S.ro);
    E.fs.hidden = !(document.fullscreenEnabled && E.root.requestFullscreen);
    load();
  }
  async function load() {
    var d = S.docs[S.idx]; if (!d) { close(true); return; }
    var seq = ++S.loadSeq;
    S.doc = d; S.iw = 0; S.ih = 0; S.temp = null; S.dirty = false; S.failed = ''; S._logged = null;
    S.calib = (num(Number(d.calib_mm_per_px)) && Number(d.calib_mm_per_px) > 0) ? Number(d.calib_mm_per_px) : null;
    S.ann = sanitize(d.annotations, 1e6, 1e6);
    E.name.textContent = d.file_name || 'صورة';
    var meta = [];
    if (d.xray_type && window.SyDentFiles) meta.push(window.SyDentFiles.XRAY_TYPES[d.xray_type] || '');
    var ts = (d.teeth && d.teeth.length) ? d.teeth : (d.tooth_num ? [d.tooth_num] : []);
    if (ts.length) meta.push('🦷 ' + ts.join('، '));
    if (d.taken_at && window.SyDT) meta.push(window.SyDT.numDate(d.taken_at));
    E.meta.textContent = meta.filter(Boolean).join(' · ');
    E.count.textContent = S.docs.length > 1 ? (S.idx + 1) + '/' + S.docs.length : '';
    E.prev.hidden = E.next.hidden = S.docs.length < 2;
    E.svg.innerHTML = ''; E.img.removeAttribute('src'); showMsg('جارٍ التحميل…');
    revokeBlob(); S.dicomCalib = null; S.note = '';
    var url = null;
    try { url = S.opts.urlFor ? await S.opts.urlFor(d) : null; } catch (e) { url = null; }
    if (seq !== S.loadSeq || !S.open) return;
    if (!url) { showMsg('تعذّر فتح الصورة — تحقّق من الاتصال'); return; }
    E.dl.href = url; E.dl.setAttribute('download', d.file_name || 'xray');
    var r = await srcFor(d, url);
    if (seq !== S.loadSeq || !S.open) { if (r.blob) URL.revokeObjectURL(r.src); return; }
    if (r.error) { showMsg(r.error); status(''); return; }
    if (r.blob) S.blobUrl = r.src;
    S.dicomCalib = r.calib || null; S.note = r.note || '';
    if (r.invert) { S.invert = true; applyFilter(); }
    E.img.src = r.src;
    paintBar(); status('');
  }
  function revokeBlob() { if (S.blobUrl) { try { URL.revokeObjectURL(S.blobUrl); } catch (e) {} S.blobUrl = null; } }
  function onImgLoad() {
    S.iw = E.img.naturalWidth; S.ih = E.img.naturalHeight;
    E.img.style.width = S.iw + 'px'; E.img.style.height = S.ih + 'px';
    E.svg.setAttribute('width', S.iw); E.svg.setAttribute('height', S.ih); E.svg.setAttribute('viewBox', '0 0 ' + S.iw + ' ' + S.ih);
    S.ann = sanitize(S.doc.annotations, S.iw, S.ih);
    showMsg(''); fit(); applyFilter(); paintBar();
  }
  async function go(step) {
    if (S.docs.length < 2) return;
    if (!(await settle())) return;
    S.idx = (S.idx + step + S.docs.length) % S.docs.length; load();
  }
  // يُفرغ الحفظ المعلّق؛ إن بقي فشلٌ يسأل قبل المغادرة. true ⇒ يجوز المغادرة.
  async function settle() {
    if (S.saveTimer) { clearTimeout(S.saveTimer); S.saveTimer = null; }
    if (S.dirty && !S.ro) await save();
    if (S.dirty && !S.ro) {
      return await window.SyDialog.confirm({ title: 'لم تُحفظ التعديلات', message: 'تعذّر حفظ التعليقات (' + (S.failed || 'خطأ') + ').\nالمغادرة تتجاهلها.', confirmText: 'مغادرة بلا حفظ', danger: true });
    }
    return true;
  }
  async function close(force) {
    if (!S.open) return;
    if (!force && !(await settle())) return;
    S.open = false; S.loadSeq++;
    if (document.fullscreenElement === E.root) { try { await document.exitFullscreen(); } catch (e) {} }
    E.root.hidden = true; if (!C.open) document.documentElement.classList.remove('xrv-open');
    E.img.removeAttribute('src'); E.svg.innerHTML = ''; revokeBlob();
    var cb = S.opts && S.opts.onClose; S.opts = null; S.doc = null;
    if (cb) { try { cb(); } catch (e) {} }
  }
  // التبويبُ أُعيد تحميله (رفعٌ/حذفٌ/تحديثٌ لحظي): صورةٌ حُذفت ⇒ يُغلق؛ وإلا تُحدَّث القائمةُ والصفُّ إن لم يكن تعديلٌ محلي.
  function sync(rows) {
    if (!S.open || !S.doc) return;
    var cur = (rows || []).find(function (r) { return r.id === S.doc.id; });
    if (!cur) {
      S.dirty = false; if (S.saveTimer) { clearTimeout(S.saveTimer); S.saveTimer = null; }
      close(true);
      if (typeof window.showToast === 'function') window.showToast('حُذفت هذه الصورة', true);
      return;
    }
    S.docs = S.docs.map(function (d) { var n = (rows || []).find(function (r) { return r.id === d.id; }); return n || d; })
                   .filter(function (d) { return (rows || []).some(function (r) { return r.id === d.id; }); });
    S.idx = Math.max(0, S.docs.findIndex(function (d) { return d.id === cur.id; }));
    E.count.textContent = S.docs.length > 1 ? (S.idx + 1) + '/' + S.docs.length : '';
    E.prev.hidden = E.next.hidden = S.docs.length < 2;
    if (!S.dirty && !S.saving && !S.temp) {
      S.doc = cur;
      S.ann = sanitize(cur.annotations, S.iw || 1e6, S.ih || 1e6);
      S.calib = (num(Number(cur.calib_mm_per_px)) && Number(cur.calib_mm_per_px) > 0) ? Number(cur.calib_mm_per_px) : null;
      render(); paintBar();
    }
  }

  /* ── العرض ── */
  function applyView() {
    E.world.style.transform = 'translate(' + S.v.tx + 'px,' + S.v.ty + 'px) scale(' + S.v.s + ')';
    E.zoomLbl.textContent = Math.round(S.v.s * 100) + '%';
    render();
  }
  function fit() { if (!S.iw) return; var r = E.stage.getBoundingClientRect(); S.v = fitView(S.iw, S.ih, r.width, r.height); applyView(); }
  function zoomCenter(f) { var r = E.stage.getBoundingClientRect(); S.v = zoomAt(S.v, f, r.width / 2, r.height / 2); applyView(); }
  function applyFilter() {
    E.img.style.filter = 'brightness(' + S.bright + '%) contrast(' + S.contrast + '%)' + (S.invert ? ' invert(1)' : '');
    E.bright.input.value = String(S.bright); E.contrast.input.value = String(S.contrast);
  }
  function resetAdjust() { S.bright = 100; S.contrast = 100; S.invert = false; applyFilter(); paintBar(); fit(); }
  function showMsg(t) { E.msg.textContent = t; E.msg.hidden = !t; }
  function status(t, bad) { E.status.textContent = t; E.status.classList.toggle('bad', !!bad); E.status.hidden = !t; }
  function paintBar() {
    Object.keys(E.tools).forEach(function (k) { E.tools[k].classList.toggle('on', S.tool === k); E.tools[k].setAttribute('aria-pressed', S.tool === k ? 'true' : 'false'); });
    Object.keys(E.cols).forEach(function (k) { E.cols[k].classList.toggle('on', S.color === k); });
    E.inv.classList.toggle('on', S.invert);
    E.undo.disabled = S.ro || !S.ann.length;
    E.stage.setAttribute('data-tool', S.tool);
    var cal = S.calib ? '📏 معايَرة (' + S.calib.toFixed(4) + ' مم/بكسل)'
            : S.dicomCalib ? '📏 معايرةٌ من DICOM (' + S.dicomCalib.toFixed(4) + ' مم/بكسل) — أعد المعايرة إن لزم'
            : '📏 غير معايَرة — القياسُ بالبكسل';
    if (S.note) cal = S.note + ' · ' + cal;
    E.tools.calib.title = S.calib ? 'معايرة جديدة — ' + cal : 'معايرة: ارسم خطاً فوق طولٍ معروف ثم أدخل طوله بالمليمتر';
    if (!E.status.classList.contains('bad') && (!E.status.textContent || /معايَر/.test(E.status.textContent))) status(S.iw ? cal + (S.ro ? ' · قراءة فقط — لا يُحفظ شيء' : '') : '');
  }
  function setTool(t) {
    if (S.ro && t !== 'pan' && t !== 'ruler') { if (window.SyDentSub) window.SyDentSub.blockReadOnly(); return; }
    S.tool = t; S.temp = null; paintBar(); render();
  }

  // رسمُ التعليقات: SVG بإحداثيات الصورة · خطوطٌ بعرضٍ ثابتٍ على الشاشة · نصٌّ بـtextContent فقط.
  // مشترك بين العارض والمقارنة (v637).
  function drawAnn(svg, list, scale, calib, temp) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var k = 1 / scale, all = list.slice();
    if (temp) all.push(temp);
    all.forEach(function (a, i) {
      var g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'xrv-a' + (a === temp ? ' tmp' : ''));
      if (a !== temp) g.setAttribute('data-i', String(i));
      g.style.setProperty('--xrv-c', a.t === 'calib' ? 'var(--cyan)' : (COLORS[a.c] || COLORS.r));
      if (a.t === 'arrow' || a.t === 'ruler' || a.t === 'calib') {
        g.appendChild(line(a.x1, a.y1, a.x2, a.y2));
        if (a.t === 'arrow') {
          var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), hl = 16 * k;
          [0.5, -0.5].forEach(function (d) { g.appendChild(line(a.x2, a.y2, a.x2 - hl * Math.cos(ang + d), a.y2 - hl * Math.sin(ang + d))); });
        } else {
          var tick = 7 * k, pa = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) + Math.PI / 2;
          [[a.x1, a.y1], [a.x2, a.y2]].forEach(function (p) { g.appendChild(line(p[0] - tick * Math.cos(pa), p[1] - tick * Math.sin(pa), p[0] + tick * Math.cos(pa), p[1] + tick * Math.sin(pa))); });
          var px = dist(a.x1, a.y1, a.x2, a.y2);
          g.appendChild(text((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2 - 9 * k, a.t === 'calib' ? Math.round(px) + ' بكسل' : lenLabel(px, calib), 14 * k));
        }
      } else if (a.t === 'circle') {
        var c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', a.cx); c.setAttribute('cy', a.cy); c.setAttribute('r', Math.max(a.r, 0.5));
        c.setAttribute('vector-effect', 'non-scaling-stroke'); g.appendChild(c);
      } else if (a.t === 'text') {
        g.appendChild(text(a.x, a.y, a.s, 16 * k));
      }
      svg.appendChild(g);
    });
    function line(x1, y1, x2, y2) {
      var l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('vector-effect', 'non-scaling-stroke'); return l;
    }
    function text(x, y, str, size) {
      var t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('font-size', size); t.setAttribute('text-anchor', 'middle');
      t.textContent = str; return t;
    }
  }
  function calibNow() { return S.calib || S.dicomCalib || null; }
  function render() {
    if (!E.svg) return;
    drawAnn(E.svg, S.ann, S.v.s, calibNow(), S.temp);
    if (E.undo) E.undo.disabled = S.ro || !S.ann.length;
  }

  /* ── المؤشر واللمس ── */
  function local(e) { var r = E.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onDown(e) {
    if (!S.iw) return;
    try { if (E.stage.setPointerCapture) E.stage.setPointerCapture(e.pointerId); } catch (x) {}
    S.ptrs[e.pointerId] = local(e);
    var ids = Object.keys(S.ptrs);
    if (ids.length === 2) {      // قرصٌ بإصبعين في أي أداة: يلغي الرسم الجاري
      S.temp = null; S.drag = null;
      var a = S.ptrs[ids[0]], b = S.ptrs[ids[1]];
      S.pinch = { d: dist(a.x, a.y, b.x, b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { s: S.v.s, tx: S.v.tx, ty: S.v.ty } };
      render(); return;
    }
    if (ids.length > 2) return;
    var p = S.ptrs[e.pointerId], ip = toImage(S.v, p.x, p.y);
    if (S.tool === 'pan') { S.drag = { x: p.x, y: p.y, tx: S.v.tx, ty: S.v.ty }; return; }
    if (S.tool === 'erase') { eraseAt(e); return; }
    if (S.tool === 'text') return;   // يُضاف عند الرفع (نقرة)
    if (S.tool === 'circle') S.temp = { t: 'circle', cx: ip.x, cy: ip.y, r: 0.5, c: S.color };
    else S.temp = { t: S.tool === 'calib' ? 'calib' : S.tool, x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y, c: S.color };
    render();
  }
  function onMove(e) {
    if (!S.ptrs[e.pointerId]) return;
    S.ptrs[e.pointerId] = local(e);
    var ids = Object.keys(S.ptrs);
    if (S.pinch && ids.length >= 2) {
      var a = S.ptrs[ids[0]], b = S.ptrs[ids[1]], d = dist(a.x, a.y, b.x, b.y);
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, P = S.pinch;
      var v = zoomAt(P.v, P.d > 0 ? d / P.d : 1, P.mx, P.my);
      S.v = { s: v.s, tx: v.tx + (mx - P.mx), ty: v.ty + (my - P.my) }; applyView(); return;
    }
    var p = S.ptrs[e.pointerId];
    if (S.drag) { S.v = { s: S.v.s, tx: S.drag.tx + (p.x - S.drag.x), ty: S.drag.ty + (p.y - S.drag.y) }; applyView(); return; }
    if (S.temp) {
      var ip = toImage(S.v, p.x, p.y);
      if (S.temp.t === 'circle') S.temp.r = dist(S.temp.cx, S.temp.cy, ip.x, ip.y);
      else { S.temp.x2 = ip.x; S.temp.y2 = ip.y; }
      render();
    }
  }
  async function onUp(e) {
    var was = S.ptrs[e.pointerId]; delete S.ptrs[e.pointerId];
    if (S.pinch) { if (Object.keys(S.ptrs).length < 2) S.pinch = null; return; }
    if (S.drag) { S.drag = null; return; }
    if (!was) return;
    if (S.tool === 'text' && !S.ro) {
      var ip = toImage(S.v, was.x, was.y);
      var s = await window.SyDialog.prompt({ title: 'نص على الصورة', message: 'يُحفظ فوق الصورة منفصلاً عنها — الأصلُ لا يتغيّر.', placeholder: 'مثلاً: آفة ذروية؟', confirmText: 'إضافة' });
      s = (s || '').trim().slice(0, MAX_TXT);
      if (s) addAnn({ t: 'text', x: ip.x, y: ip.y, s: s, c: S.color });
      return;
    }
    var t = S.temp; S.temp = null;
    if (!t) return;
    var minPx = 6 / S.v.s;
    if (t.t === 'circle') { if (t.r < minPx) { render(); return; } addAnn(t); return; }
    var len = dist(t.x1, t.y1, t.x2, t.y2);
    if (len < minPx) { render(); return; }
    if (t.t === 'calib') { await calibrate(len); render(); return; }
    if (t.t === 'ruler' && S.ro) { S.temp = t; render(); status('📐 ' + lenLabel(len, calibNow()) + ' · قراءة فقط — لا يُحفظ'); return; }
    addAnn(t);
  }
  function onWheel(e) {
    if (!S.iw) return; e.preventDefault();
    var p = local(e); S.v = zoomAt(S.v, Math.pow(1.0015, -e.deltaY), p.x, p.y); applyView();
  }
  function onKey(e) {
    if (!S.open) return;
    if (document.querySelector('.modal-overlay.open, .modal-overlay.show')) return;   // حوارٌ فوق العارض يملك المفاتيح
    var tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) { if (e.key === 'Escape') tg.blur(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === '+' || e.key === '=') zoomCenter(1.25);
    else if (e.key === '-') zoomCenter(1 / 1.25);
    else if (e.key === '0') fit();
    else if (e.key === 'i' || e.key === 'I') { S.invert = !S.invert; applyFilter(); paintBar(); }
    else if (e.key === 'ArrowLeft') go(1);
    else if (e.key === 'ArrowRight') go(-1);
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  }
  async function toggleFs() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await E.root.requestFullscreen(); } catch (e) {}
  }

  /* ── التعديل والحفظ ── */
  function addAnn(a) {
    if (S.ro) return;
    if (S.ann.length >= MAX_ANN) { status('بلغت الحدّ (' + MAX_ANN + ' تعليقاً) لهذه الصورة', true); render(); return; }
    var clean = sanitize([a], S.iw, S.ih);
    if (!clean.length) { render(); return; }
    S.ann.push(clean[0]); render(); paintBar(); scheduleSave();
  }
  function undo() {
    if (S.ro || !S.ann.length) return;
    S.ann.pop(); render(); paintBar(); scheduleSave();
  }
  function eraseAt(e) {
    if (S.ro) return;
    var g = e.target && e.target.closest ? e.target.closest('g[data-i]') : null;
    if (!g) return;
    var i = Number(g.getAttribute('data-i'));
    if (i >= 0 && i < S.ann.length) { S.ann.splice(i, 1); render(); paintBar(); scheduleSave(); }
  }
  async function calibrate(px) {
    if (S.ro) return;
    var v = await window.SyDialog.prompt({ title: '📏 معايرة القياس', message: 'طولُ الخط المرسوم = ' + Math.round(px) + ' بكسل.\nأدخل طوله الحقيقي بالمليمتر (طولُ زرعةٍ معروف، مسطرةُ الصورة، أو عرضُ تاج).', placeholder: 'مثلاً 10', value: '', confirmText: 'حفظ المعايرة' });
    if (v == null || String(v).trim() === '') return;
    var c = calibFrom(v, px);
    if (!c) { status('قيمة غير صالحة — أدخل طولاً بين 0.1 و500 مم على خطٍّ أطول', true); return; }
    if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
    var prev = S.calib; S.calib = c; render(); status('جارٍ حفظ المعايرة…');
    var r = await window.SyDentFiles.updateMeta(S.doc.id, { calib_mm_per_px: c });
    if (!r.ok) { S.calib = prev; render(); status('⚠️ لم تُحفظ المعايرة — ' + window.SyDentFiles.message(r), true); return; }
    S.doc.calib_mm_per_px = c; touchRow(r.row); status(''); paintBar();
    S.tool = 'ruler'; paintBar();
    if (window.logAudit) { try { window.logAudit('patient.file_upload', { patientId: S.doc.patient_id, description: 'معايرة صورة أشعة: ' + (S.doc.file_name || '') + ' (' + c + ' مم/بكسل)' }); } catch (x) {} }
  }
  function scheduleSave(ms) {
    if (S.ro) return;
    S.dirty = true; status('… سيُحفظ');
    if (S.saveTimer) clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function () { S.saveTimer = null; save(); }, ms == null ? 900 : ms);
  }
  async function save() {
    if (S.ro || !S.doc || !S.dirty) return;
    if (S.saving) { await S.saving; if (!S.dirty) return; }
    if (window.SyDentSub && window.SyDentSub.isReadOnly && window.SyDentSub.isReadOnly()) { S.ro = true; status('قراءة فقط — لم يُحفظ', true); return; }
    var doc = S.doc, snapshot = S.ann.slice();
    status('جارٍ الحفظ…');
    S.saving = window.SyDentFiles.updateMeta(doc.id, { annotations: snapshot });
    var r; try { r = await S.saving; } catch (e) { r = { ok: false, reason: 'db' }; }
    S.saving = null;
    if (doc !== S.doc) return;
    if (r.ok) {
      if (JSON.stringify(snapshot) === JSON.stringify(S.ann)) S.dirty = false;
      S.failed = ''; doc.annotations = snapshot; touchRow(r.row);
      status(S.dirty ? '… سيُحفظ' : '✓ حُفظت التعليقات');
      if (!S._logged) { S._logged = doc.id; if (window.logAudit) { try { window.logAudit('patient.file_upload', { patientId: doc.patient_id, description: 'تعليقات على صورة أشعة: ' + (doc.file_name || '') }); } catch (x) {} } }
    } else {
      S.failed = r.reason === 'offline' ? 'لا اتصال' : r.reason === 'read' ? 'قراءة فقط' : 'خطأ بالحفظ';
      status('⚠️ لم تُحفظ التعليقات (' + S.failed + ') — تُعاد المحاولة' + (r.reason === 'offline' ? ' عند عودة الاتصال' : ' مع التعديل التالي'), true);
    }
  }
  function touchRow(row) { if (row && S.opts && typeof S.opts.onSaved === 'function') { try { S.opts.onSaved(row); } catch (e) {} } }

  /* ══ DICOM مفرد (.dcm) — v637 ══════════════════════════════════════
     dicom-parser (MIT · vendor/ مستضافة ذاتياً) يُحمَّل كسولاً عند أول ملف. يُفكّ هنا: غيرُ المضغوط
     (ضمني/صريح · صغير/كبير الطرف · 8/16 بت · أحادي اللون 1/2 أو RGB) بتحويل Rescale ثم نافذة/مستوى الملف
     (أو المدى عند غيابها)، وJPEG Baseline يفكّه المتصفح. غيرُ ذلك (JPEG 2000 · Lossless · JPEG-LS · RLE ·
     Deflate · YBR/Palette) يُعلَن باسمه وينزَّل الأصل. تباعدُ البكسل (0028,0030 أو 0018,1164) معايرةٌ تلقائية. */
  var TS_NAMES = {
    '1.2.840.10008.1.2.4.51': 'JPEG Extended', '1.2.840.10008.1.2.4.57': 'JPEG Lossless', '1.2.840.10008.1.2.4.70': 'JPEG Lossless',
    '1.2.840.10008.1.2.4.80': 'JPEG-LS', '1.2.840.10008.1.2.4.81': 'JPEG-LS', '1.2.840.10008.1.2.4.90': 'JPEG 2000', '1.2.840.10008.1.2.4.91': 'JPEG 2000',
    '1.2.840.10008.1.2.5': 'RLE', '1.2.840.10008.1.2.1.99': 'Deflate'
  };
  var TS_RAW = ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'];
  var TS_JPEG = '1.2.840.10008.1.2.4.50';
  function dSpacing(ds) {
    var raw = ds.string('x00280030') || ds.string('x00181164');
    if (!raw) return null;
    var p = String(raw).split('\\').map(Number).filter(function (v) { return num(v) && v > 0; });
    if (!p.length) return null;
    var c = p.length > 1 ? (p[0] + p[1]) / 2 : p[0];
    return (c > 0 && c < 10) ? Math.round(c * 1e6) / 1e6 : null;
  }
  function dicomDecode(bytes, dp) {
    var ds;
    try { ds = dp.parseDicom(bytes); } catch (e) { return { ok: false, reason: 'invalid' }; }
    var ts = String(ds.string('x00020010') || '1.2.840.10008.1.2').replace(/\0/g, '').trim();
    var pe = ds.elements.x7fe00010;
    if (!pe) return { ok: false, reason: 'nopixels' };
    var w = ds.uint16('x00280011'), h = ds.uint16('x00280010');
    if (!(w > 0 && h > 0) || w * h > 40e6) return { ok: false, reason: 'invalid' };
    var spp = ds.uint16('x00280002') || 1, bits = ds.uint16('x00280100') || 8, stored = ds.uint16('x00280101') || bits;
    var signed = ds.uint16('x00280103') === 1;
    var photo = String(ds.string('x00280004') || 'MONOCHROME2').trim().toUpperCase();
    var frames = parseInt(ds.string('x00280008') || '1', 10) || 1;
    var calib = dSpacing(ds), note = frames > 1 ? 'ملفٌّ متعدّد الإطارات (' + frames + ') — يُعرض الأول' : '';
    var mono = (photo === 'MONOCHROME1' || photo === 'MONOCHROME2');
    if (ts === TS_JPEG) {
      if (bits !== 8 || !pe.encapsulatedPixelData) return { ok: false, reason: 'compressed', ts: 'JPEG' };
      var frame;
      try {
        var bot = (pe.basicOffsetTable && pe.basicOffsetTable.length) ? undefined : dp.createJPEGBasicOffsetTable(ds, pe);
        frame = dp.readEncapsulatedImageFrame(ds, pe, 0, bot);
      } catch (e) { return { ok: false, reason: 'invalid' }; }
      return { ok: true, w: w, h: h, jpeg: frame, calib: calib, note: note, invert: photo === 'MONOCHROME1' };
    }
    if (TS_RAW.indexOf(ts) < 0) return { ok: false, reason: 'compressed', ts: TS_NAMES[ts] || ts };
    if (pe.encapsulatedPixelData) return { ok: false, reason: 'invalid' };
    if (!(mono && spp === 1 && (bits === 8 || bits === 16)) && !(photo === 'RGB' && spp === 3 && bits === 8)) return { ok: false, reason: 'color', photo: photo + ' · ' + bits + ' بت' };
    var bpp = bits / 8, n = w * h, off = pe.dataOffset;
    if (off + n * spp * bpp > bytes.length) return { ok: false, reason: 'invalid' };
    var out = new Uint8ClampedArray(n * 4), i;
    if (photo === 'RGB') {
      var planar = ds.uint16('x00280006') === 1;
      for (i = 0; i < n; i++) {
        out[i * 4] = planar ? bytes[off + i] : bytes[off + i * 3];
        out[i * 4 + 1] = planar ? bytes[off + n + i] : bytes[off + i * 3 + 1];
        out[i * 4 + 2] = planar ? bytes[off + 2 * n + i] : bytes[off + i * 3 + 2];
        out[i * 4 + 3] = 255;
      }
      return { ok: true, w: w, h: h, rgba: out, calib: calib, note: note };
    }
    var be = ts === '1.2.840.10008.1.2.2';
    var dv = new DataView(bytes.buffer, bytes.byteOffset + off, n * bpp);
    var slope = ds.floatString('x00281053'), icpt = ds.floatString('x00281052');
    if (!num(slope) || slope === 0) slope = 1; if (!num(icpt)) icpt = 0;
    var vals = new Float32Array(n), lo = Infinity, hi = -Infinity, mask = stored < 32 ? Math.pow(2, stored) - 1 : 0xffffffff, sign = Math.pow(2, stored - 1);
    for (i = 0; i < n; i++) {
      var raw = bits === 8 ? dv.getUint8(i) : dv.getUint16(i * 2, !be);
      raw = raw & mask;
      if (signed && raw >= sign) raw -= 2 * sign;
      var mv = raw * slope + icpt; vals[i] = mv;
      if (mv < lo) lo = mv; if (mv > hi) hi = mv;
    }
    var wc = ds.floatString('x00281050', 0), ww = ds.floatString('x00281051', 0);
    if (!num(wc) || !num(ww) || ww < 1) { wc = (lo + hi) / 2; ww = Math.max(1, hi - lo); }
    var inv = photo === 'MONOCHROME1';
    for (i = 0; i < n; i++) {
      var y = ((vals[i] - (wc - 0.5)) / Math.max(ww - 1, 1) + 0.5) * 255;
      y = y < 0 ? 0 : y > 255 ? 255 : y;
      if (inv) y = 255 - y;
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = y; out[i * 4 + 3] = 255;
    }
    return { ok: true, w: w, h: h, rgba: out, calib: calib, note: note };
  }
  function dicomMsg(d) {
    if (d.reason === 'compressed') return 'ضغطُ الملف (' + (d.ts || '?') + ') لا يعرضه المتصفح — نزّل الملف (⬇) وافتحه ببرنامج الأشعة';
    if (d.reason === 'color') return 'نوعُ بيانات الصورة (' + (d.photo || '?') + ') غير مدعوم بالعارض — نزّل الملف (⬇)';
    if (d.reason === 'nopixels') return 'ملف DICOM بلا صورة (تقرير أو بيانات فقط)';
    return 'تعذّرت قراءة ملف DICOM — قد يكون تالفاً أو ناقصاً';
  }
  var _dpP = null;
  function loadDicomLib() {
    if (window.dicomParser && window.dicomParser.parseDicom) return Promise.resolve(window.dicomParser);
    if (_dpP) return _dpP;
    _dpP = new Promise(function (res) {
      var sc = document.createElement('script');
      sc.src = '/vendor/dicom-parser-1.8.21.min.js'; sc.async = true;
      sc.onload = function () { res((window.dicomParser && window.dicomParser.parseDicom) ? window.dicomParser : null); };
      sc.onerror = function () { _dpP = null; res(null); };
      document.head.appendChild(sc);
    });
    return _dpP;
  }
  // مصدرُ الصورة: الرابطُ نفسه للصور، وصورةٌ مفكوكة (blob) لملفات DICOM.
  async function srcFor(doc, url) {
    if (!doc || doc.mime_type !== 'application/dicom') return { src: url };
    var dp = await loadDicomLib();
    if (!dp) return { error: 'تعذّر تحميل قارئ DICOM — تحقّق من الاتصال' };
    var bytes;
    try { var resp = await fetch(url); if (!resp.ok) throw new Error(resp.status); bytes = new Uint8Array(await resp.arrayBuffer()); }
    catch (e) { return { error: 'تعذّر تنزيل ملف DICOM — تحقّق من الاتصال' }; }
    var d = dicomDecode(bytes, dp);
    if (!d.ok) return { error: dicomMsg(d) };
    var blob;
    if (d.jpeg) blob = new Blob([d.jpeg], { type: 'image/jpeg' });
    else {
      var cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
      cv.getContext('2d').putImageData(new ImageData(d.rgba, d.w, d.h), 0, 0);
      blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
      if (!blob) return { error: 'تعذّر رسم ملف DICOM بهذا المتصفح' };
    }
    return { src: URL.createObjectURL(blob), blob: true, calib: d.calib, note: d.note, invert: !!d.invert };
  }

  /* ══ المقارنة جنباً إلى جنب (قبل/بعد) — v637 ════════════════════════
     لوحتان مستقلّتان (سحب · عجلة · قرص · نقرٌ مزدوج) بتكبيرٍ متزامن اختياري (🔗): يُنقل التكبيرُ نسبةً إلى ملاءمة
     كل صورة والمركزُ بإحداثياتٍ نسبية — صورتان بمقاسين مختلفين تبقيان على المنطقة نفسها. ضبطٌ مشترك (سطوع · تباين ·
     عكس). التعليقاتُ تُعرض للقراءة فقط — التعديلُ بالعارض. الأقدمُ يميناً (قبل) والأحدثُ يساراً (بعد). */
  var C = { open: false, panes: [], sync: true, bright: 100, contrast: 100, invert: false, opts: null };
  var CE = {};
  function cBuild() {
    if (CE.root) return;
    var root = el('div', 'xrv xrc'); root.id = 'xrCompare'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.hidden = true;
    var top = el('div', 'xrv-top');
    top.appendChild(btn('xrv-x', '✕', 'إغلاق (Esc)', cClose));
    var tt = el('div', 'xrv-title'); tt.appendChild(el('div', 'xrv-name', '⚖️ مقارنة قبل / بعد')); CE.sub = el('div', 'xrv-meta'); tt.appendChild(CE.sub); top.appendChild(tt);
    CE.sync = btn('on', '🔗', 'مزامنة التكبير والتحريك', function () { C.sync = !C.sync; CE.sync.classList.toggle('on', C.sync); if (C.sync) cMirror(0); });
    top.appendChild(CE.sync);
    top.appendChild(btn('', '🔀', 'تبديل الجهتين', function () { C.panes.reverse(); var b = CE.body; b.appendChild(C.panes[1].el); b.insertBefore(C.panes[0].el, C.panes[1].el); cFitAll(); }));
    top.appendChild(btn('', '⤢', 'ملاءمة الصورتين', cFitAll));
    CE.body = el('div', 'xrc-body');
    var bar = el('div', 'xrv-bar');
    var adj = el('div', 'xrv-grp xrv-adj');
    CE.bright = range('☀', 'السطوع', function (v) { C.bright = v; cFilter(); });
    CE.contrast = range('◐', 'التباين', function (v) { C.contrast = v; cFilter(); });
    adj.appendChild(CE.bright.wrap); adj.appendChild(CE.contrast.wrap);
    CE.inv = btn('', '⇄', 'عكس الألوان', function () { C.invert = !C.invert; cFilter(); });
    adj.appendChild(CE.inv);
    adj.appendChild(btn('', '⟲', 'إعادة الضبط', function () { C.bright = 100; C.contrast = 100; C.invert = false; cFilter(); cFitAll(); }));
    bar.appendChild(adj);
    root.appendChild(top); root.appendChild(CE.body); root.appendChild(bar);
    document.body.appendChild(root); CE.root = root;
    document.addEventListener('keydown', function (e) {
      if (!C.open || document.querySelector('.modal-overlay.open, .modal-overlay.show')) return;
      if (e.key === 'Escape') { e.preventDefault(); cClose(); }
      else if (e.key === '0') cFitAll();
    });
    window.addEventListener('resize', function () { if (C.open) cFitAll(); });
  }
  function cPane(doc) {
    var P = { doc: doc, iw: 0, ih: 0, v: { s: 1, tx: 0, ty: 0 }, ann: sanitize(doc.annotations, 1e6, 1e6),
              calib: (num(Number(doc.calib_mm_per_px)) && Number(doc.calib_mm_per_px) > 0) ? Number(doc.calib_mm_per_px) : null, dicomCalib: null,
              ptrs: {}, drag: null, pinch: null, blob: null };
    P.el = el('div', 'xrc-pane');
    var lab = el('div', 'xrc-lab');
    var meta = [];
    meta.push((doc.taken_at && window.SyDT) ? window.SyDT.numDate(doc.taken_at) : (window.SyDT && doc.created_at ? window.SyDT.numDate(doc.created_at) : ''));
    if (doc.xray_type && window.SyDentFiles) meta.push(window.SyDentFiles.XRAY_TYPES[doc.xray_type] || '');
    var ts = (doc.teeth && doc.teeth.length) ? doc.teeth : (doc.tooth_num ? [doc.tooth_num] : []);
    if (ts.length) meta.push('🦷 ' + ts.join('، '));
    lab.textContent = meta.filter(Boolean).join(' · ') || (doc.file_name || '');
    lab.title = doc.file_name || '';
    P.stage = el('div', 'xrv-stage'); P.stage.setAttribute('data-tool', 'pan');
    P.world = el('div', 'xrv-world');
    P.img = el('img', 'xrv-img'); P.img.alt = ''; P.img.draggable = false;
    P.svg = document.createElementNS(SVGNS, 'svg'); P.svg.setAttribute('class', 'xrv-svg');
    P.msg = el('div', 'xrv-msg', 'جارٍ التحميل…');
    P.world.appendChild(P.img); P.world.appendChild(P.svg); P.stage.appendChild(P.world); P.stage.appendChild(P.msg);
    P.el.appendChild(lab); P.el.appendChild(P.stage);
    P.img.addEventListener('load', function () {
      P.iw = P.img.naturalWidth; P.ih = P.img.naturalHeight;
      P.img.style.width = P.iw + 'px'; P.img.style.height = P.ih + 'px';
      P.svg.setAttribute('width', P.iw); P.svg.setAttribute('height', P.ih); P.svg.setAttribute('viewBox', '0 0 ' + P.iw + ' ' + P.ih);
      P.ann = sanitize(P.doc.annotations, P.iw, P.ih);
      P.msg.hidden = true; cFit(P); cFilter();
    });
    P.img.addEventListener('error', function () { P.msg.textContent = 'تعذّر تحميل الصورة'; P.msg.hidden = false; });
    function idx() { return C.panes.indexOf(P); }
    P.stage.addEventListener('pointerdown', function (e) {
      if (!P.iw) return;
      try { P.stage.setPointerCapture(e.pointerId); } catch (x) {}
      P.ptrs[e.pointerId] = cLocal(P, e);
      var ids = Object.keys(P.ptrs);
      if (ids.length === 2) { var a = P.ptrs[ids[0]], b = P.ptrs[ids[1]]; P.drag = null; P.pinch = { d: dist(a.x, a.y, b.x, b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { s: P.v.s, tx: P.v.tx, ty: P.v.ty } }; }
      else if (ids.length === 1) { var p = P.ptrs[e.pointerId]; P.drag = { x: p.x, y: p.y, tx: P.v.tx, ty: P.v.ty }; }
    });
    P.stage.addEventListener('pointermove', function (e) {
      if (!P.ptrs[e.pointerId]) return;
      P.ptrs[e.pointerId] = cLocal(P, e);
      var ids = Object.keys(P.ptrs);
      if (P.pinch && ids.length >= 2) {
        var a = P.ptrs[ids[0]], b = P.ptrs[ids[1]], d = dist(a.x, a.y, b.x, b.y), Q = P.pinch;
        var v = zoomAt(Q.v, Q.d > 0 ? d / Q.d : 1, Q.mx, Q.my);
        P.v = { s: v.s, tx: v.tx + ((a.x + b.x) / 2 - Q.mx), ty: v.ty + ((a.y + b.y) / 2 - Q.my) };
      } else if (P.drag) {
        var p = P.ptrs[e.pointerId]; P.v = { s: P.v.s, tx: P.drag.tx + (p.x - P.drag.x), ty: P.drag.ty + (p.y - P.drag.y) };
      } else return;
      cApply(P); cMirror(idx());
    });
    function up(e) { delete P.ptrs[e.pointerId]; if (Object.keys(P.ptrs).length < 2) P.pinch = null; if (!Object.keys(P.ptrs).length) P.drag = null; }
    P.stage.addEventListener('pointerup', up); P.stage.addEventListener('pointercancel', up);
    P.stage.addEventListener('wheel', function (e) { if (!P.iw) return; e.preventDefault(); var p = cLocal(P, e); P.v = zoomAt(P.v, Math.pow(1.0015, -e.deltaY), p.x, p.y); cApply(P); cMirror(idx()); }, { passive: false });
    P.stage.addEventListener('dblclick', function () { cFitAll(); });
    return P;
  }
  function cLocal(P, e) { var r = P.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function cFitOf(P) { var r = P.stage.getBoundingClientRect(); return fitView(P.iw, P.ih, r.width, r.height); }
  function cFit(P) { if (!P.iw) return; P.v = cFitOf(P); cApply(P); }
  function cFitAll() { C.panes.forEach(cFit); }
  function cApply(P) {
    P.world.style.transform = 'translate(' + P.v.tx + 'px,' + P.v.ty + 'px) scale(' + P.v.s + ')';
    drawAnn(P.svg, P.ann, P.v.s, P.calib || P.dicomCalib, null);
  }
  // المزامنة: نسبةُ التكبير إلى ملاءمة كل صورة + مركزُ الشاشة بإحداثياتٍ نسبية (0..1) من الصورة.
  function cMirror(i) {
    if (!C.sync || i < 0) return;
    var A = C.panes[i], B = C.panes[1 - i];
    if (!A || !B || !A.iw || !B.iw) return;
    var v = mirrorView(A.v, cFitOf(A), A.iw, A.ih, A.stage.getBoundingClientRect(), cFitOf(B), B.iw, B.ih, B.stage.getBoundingClientRect());
    B.v = v; cApply(B);
  }
  function mirrorView(va, fa, aw, ah, ra, fb, bw, bh, rb) {
    var rel = va.s / fa.s;
    var nx = ((ra.width / 2 - va.tx) / va.s) / aw, ny = ((ra.height / 2 - va.ty) / va.s) / ah;
    var s = clampN(rel * fb.s, MIN_S, MAX_S);
    return { s: s, tx: rb.width / 2 - nx * bw * s, ty: rb.height / 2 - ny * bh * s };
  }
  function cFilter() {
    var f = 'brightness(' + C.bright + '%) contrast(' + C.contrast + '%)' + (C.invert ? ' invert(1)' : '');
    C.panes.forEach(function (P) { P.img.style.filter = f; });
    if (CE.bright) { CE.bright.input.value = String(C.bright); CE.contrast.input.value = String(C.contrast); CE.inv.classList.toggle('on', C.invert); }
  }
  // opts: { docs:[أ, ب], urlFor, onClose } — الأقدمُ أولاً (قبل).
  async function cOpen(opts) {
    cBuild();
    var docs = (opts && opts.docs || []).slice(0, 2);
    if (docs.length !== 2) return;
    var day = function (d) { return d.taken_at || String(d.created_at || '').slice(0, 10); };
    docs.sort(function (a, b) { return day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : 0; });
    C.opts = opts; C.open = true; C.bright = 100; C.contrast = 100; C.invert = false; C.sync = true; CE.sync.classList.add('on');
    while (CE.body.firstChild) CE.body.removeChild(CE.body.firstChild);
    C.panes = docs.map(cPane);
    C.panes.forEach(function (P) { CE.body.appendChild(P.el); });
    CE.sub.textContent = docs.map(function (d) { return d.file_name || ''; }).join('  ⟷  ');
    CE.root.hidden = false; document.documentElement.classList.add('xrv-open');
    var seq = C.seq = (C.seq || 0) + 1;
    for (var i = 0; i < C.panes.length; i++) {
      var P = C.panes[i], url = null;
      try { url = opts.urlFor ? await opts.urlFor(P.doc) : null; } catch (e) { url = null; }
      if (seq !== C.seq || !C.open) return;
      if (!url) { P.msg.textContent = 'تعذّر فتح الصورة — تحقّق من الاتصال'; continue; }
      var r = await srcFor(P.doc, url);
      if (seq !== C.seq || !C.open) { if (r.blob) URL.revokeObjectURL(r.src); return; }
      if (r.error) { P.msg.textContent = r.error; continue; }
      if (r.blob) P.blob = r.src;
      P.dicomCalib = r.calib || null;
      P.img.src = r.src;
    }
  }
  function cClose() {
    if (!C.open) return;
    C.open = false; C.seq = (C.seq || 0) + 1;
    C.panes.forEach(function (P) { if (P.blob) { try { URL.revokeObjectURL(P.blob); } catch (e) {} } P.img.removeAttribute('src'); });
    C.panes = []; CE.root.hidden = true;
    if (!S.open) document.documentElement.classList.remove('xrv-open');
    var cb = C.opts && C.opts.onClose; C.opts = null;
    if (cb) { try { cb(); } catch (e) {} }
  }
  // صورةٌ حُذفت والمقارنةُ مفتوحة ⇒ تُغلق.
  function cSync(rows) {
    if (!C.open) return;
    var gone = C.panes.some(function (P) { return !(rows || []).some(function (r) { return r.id === P.doc.id; }); });
    if (gone) { cClose(); if (typeof window.showToast === 'function') window.showToast('حُذفت إحدى صورتي المقارنة', true); }
  }

  window.SyXrayViewer = {
    open: open, close: function () { return close(); }, sync: function (rows) { sync(rows); cSync(rows); }, isOpen: function () { return S.open || C.open; },
    compare: cOpen, closeCompare: cClose, isComparing: function () { return C.open; },
    _pure: { sanitize: sanitize, lenLabel: lenLabel, calibFrom: calibFrom, zoomAt: zoomAt, fitView: fitView, toImage: toImage, dist: dist, MAX_ANN: MAX_ANN,
             dicomDecode: dicomDecode, dicomMsg: dicomMsg, mirrorView: mirrorView }
  };
})();
