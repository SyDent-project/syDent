/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-stages.js · مراحلُ طلب المخبر (ج3-أ · Migration 206)
   ────────────────────────────────────────────────────────────────────────
   مصدرٌ واحد للسطحين (صفحة المخابر + تبويب المخابر ببطاقة المريض — #676).
   المرحلةُ = الزيارةُ التي يلزمها العملُ العائد من المخبر (مراجعة: EXACT و Dentally — حالةُ المخبر على
   الموعد الذي يلزمه العمل · Open Dental — حالةٌ لكل موعد · ICE — خطواتٌ لكلٍّ منها حالةٌ وتاريخٌ وموعد).
   الطلبُ يولد عند زيارة الطبعة، ثم يعود من المخبر لكل زيارةٍ تالية حتى التسليم.
     • الطلبُ نفسه يحمل دائماً حالةَ المرحلة الحالية (status · date_due · appointment_id · تواريخ الدورة)،
       فكلُّ ما يقرأ الطلب اليوم (التأخير · قرب الموعد · جاهزيةُ الموعد) يعمل كما هو.
     • الكتابة: RPC lab_order_next_stage / lab_order_prev_stage — والثوابتُ بالقاعدة (تريغر M206):
       date_sent لا يتحرّك (مرساةُ كلفة المخبر — #196)، والمرحلةُ المغلقة تُختم بتواريخها، و«تم التركيب»
       للمرحلة الأخيرة وحدها. لا معادلة مالية هنا.
   المعرّفات والأصناف ببادئة lst-.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabStages) return;

  var MAX = 8, MIN = 2, NAME_MAX = 40;
  /* المفاتيحُ ثابتة (تُترجَم وتُطبع بها) · الأسماءُ تُحفظ مع الطلب كما عُرضت */
  var NAMES = { imp2: 'طبعة نهائية', bite: 'تسجيل العضة', frame: 'تجربة الهيكل', tryin: 'تجربة الأسنان', trial: 'تجربة', fit: 'تسليم' };
  var TEMPLATES = [
    { id: 'full',      name: 'جهاز كامل',           keys: ['imp2', 'bite', 'tryin', 'fit'] },
    { id: 'rpd_metal', name: 'جهاز جزئي معدني',     keys: ['frame', 'tryin', 'fit'] },
    { id: 'rpd_acr',   name: 'جهاز جزئي أكريل',     keys: ['bite', 'tryin', 'fit'] },
    { id: 'immediate', name: 'جهاز فوري',           keys: ['bite', 'fit'] },
    { id: 'fixed',     name: 'تاج / جسر مع تجربة',  keys: ['trial', 'fit'] }
  ];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function numDate(iso) {
    if (!iso) return '';
    if (window.SyDT && window.SyDT.numDate) return window.SyDT.numDate(iso) || '';
    var d = new Date(iso); return isNaN(d) ? '' : (d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear());
  }
  function dayMs(iso) { var d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return d.getTime(); }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
  /* الاسمُ المعروض: بالواجهة الإنجليزية تُعرض المرحلةُ المبنيّة باسمها الإنجليزي من مفتاحها — هنا لا بالقاموس العام،
     لأن «تجربة» و«تسليم» كلمتان لهما معانٍ أخرى بصفحاتٍ أخرى (خطةُ «تجربة»). اسمٌ عدّله الطبيب يبقى كما كتبه. */
  var EN = { imp2: 'Final impression', bite: 'Bite registration', frame: 'Framework try-in', tryin: 'Teeth try-in', trial: 'Try-in', fit: 'Fit' };
  function disp(st) {
    var n = cleanName(st && st.n);
    return (window.SyI18n && window.SyI18n.lang === 'en' && st && st.k && EN[st.k] && n === NAMES[st.k]) ? EN[st.k] : n;
  }

  function fromKeys(keys) { return keys.map(function (k) { return { k: k, n: NAMES[k] }; }); }
  function template(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i]; return null; }
  /* القالبُ المقترح من العلاج: الجهازُ المتحرك وحده يُقترح له قالب — غيرُه رحلةٌ واحدة ما لم يختر الطبيب */
  function suggest(tr, opts) {
    if (!tr) return '';
    if (tr.target_part === 'denture_full') return (opts && opts.immediate) ? 'immediate' : 'full';
    if (tr.target_part === 'denture_partial') return (opts && opts.immediate) ? 'immediate' : (/معدن|هيكل|كروم/.test(String(tr.name || '')) ? 'rpd_metal' : 'rpd_acr');
    return '';
  }

  /* ── قراءةُ الطلب ── */
  function list(lo) { return (lo && Array.isArray(lo.stages) && lo.stages.length >= MIN) ? lo.stages : null; }
  function has(lo) { return !!list(lo); }
  function idx(lo) { var L = list(lo); if (!L) return -1; var i = parseInt(lo.stage_idx, 10); return (i >= 0 && i < L.length) ? i : 0; }
  function cur(lo) { var L = list(lo); return L ? L[idx(lo)] : null; }
  function isFinal(lo) { var L = list(lo); return !L || idx(lo) >= L.length - 1; }
  function nextStage(lo) { var L = list(lo); return (L && idx(lo) < L.length - 1) ? L[idx(lo) + 1] : null; }
  function canAdvance(lo) { return !!nextStage(lo) && (lo.status === 'received' || lo.status === 'checked'); }
  function canUndo(lo) { return has(lo) && idx(lo) > 0 && lo.status === 'sent'; }
  /* زرُّ الخطوة للطلب ذي المراحل: بعد الاستلام يُرسل للمرحلة التالية — لا «تم الفحص/التركيب» قبل الأخيرة */
  function next(lo) {
    if (!canAdvance(lo)) return null;
    return { next: 'stage', label: '📤 للمخبر: ' + cleanName(nextStage(lo).n) };
  }
  function stateText(lo) {
    var s = lo.status;
    if (s === 'draft') return 'لم تُرسل';
    if (s === 'sent') return 'عند المخبر';
    if (s === 'redo') return 'إعادة';
    if (s === 'received' || s === 'checked') return 'جاهزة';
    if (s === 'delivered') return 'تم التركيب';
    if (s === 'rejected') return 'ملغى';   /* M207 */
    return '';
  }

  /* سطرٌ ظاهر تحت نوع العمل: المراحلُ بالترتيب — ما انتهى ✓ · الحاليةُ بحالتها · ما لم يبدأ */
  function line(lo, opts) {
    var L = list(lo); if (!L) return '';
    var i = idx(lo), done = lo.status === 'delivered', parts = [], tip = [];
    L.forEach(function (st, k) {
      var cls = (k < i || done) ? 'lst-done' : (k === i ? 'lst-cur' : 'lst-todo');
      var name = esc(disp(st));
      var inner = (cls === 'lst-done' ? '<span class="lst-ok">✓</span> ' : '') + '<span class="lst-n">' + name + '</span>'
        + ((cls === 'lst-cur' && stateText(lo)) ? ' <span class="lst-state">' + esc(stateText(lo)) + '</span>' : '');
      /* الشريحةُ وسهمُها مجموعةٌ واحدة: السطرُ يلتفّ بين المراحل فقط — لا شريحةَ تنكسر من داخلها ولا سهمَ يبدأ سطراً */
      parts.push('<span class="lst-g"><span class="lst-st ' + cls + '">' + inner + '</span>' + (k < L.length - 1 ? '<span class="lst-sep">›</span>' : '') + '</span>');
      var sent = k === 0 ? (st.sent || lo.date_sent) : st.sent, rec = k === i && !done ? lo.date_received : st.received;
      tip.push((k + 1) + ') ' + cleanName(st.n) + (sent ? ' — أُرسلت ' + numDate(sent) : '') + (rec ? ' · استُلمت ' + numDate(rec) : ''));
    });
    /* tail: زرُّ «تراجع عن المرحلة» تبنيه الصفحةُ نفسها (معالجُها وسجلُّ وضع القراءة عندها) — يُلحق كما هو */
    var tail = (opts && opts.tail && canUndo(lo)) ? ' ' + opts.tail : '';
    return '<div class="lst-line" title="' + esc(tip.join('\n')) + '">' + parts.join('') + tail + '</div>';
  }

  /* ── منتقي المراحل داخل نافذة الطلب ── */
  /* الحالة على العنصر نفسه: box._lst = { items:[{k,n,keep,fixed}], tpl, touched, lockedNone } — keep = كائنُ المرحلة كما هو بالطلب
     (المغلقةُ بتواريخها)، fixed = مغلقةٌ أو حالية فلا تُحذف */
  function mount(box, opts) {
    if (!box) return;
    opts = opts || {};
    var lo = opts.order || null, L = list(lo), st;
    if (L) {
      var i = idx(lo);
      st = { items: L.map(function (s, k) { return { k: s.k || '', n: cleanName(s.n), keep: s, fixed: k <= i }; }), tpl: 'custom', touched: true };
      st.lockedNone = i > 0;
    } else {
      var id = opts.suggest || '';
      st = { items: id && template(id) ? fromKeys(template(id).keys).map(function (s) { return { k: s.k, n: s.n, keep: null, fixed: false }; }) : [], tpl: id || '', touched: false, lockedNone: false };
    }
    box._lst = st;
    render(box);
    /* تغييرُ نوع العمل يعيد الاقتراح (ما لم يختر الطبيب) — المستمعُ هنا مرةً واحدة لكل قائمة */
    var ws = opts.workSelect;
    if (ws && !ws._lstWired && typeof opts.suggestFn === 'function') {
      ws._lstWired = true; ws._lstSuggest = opts.suggestFn;
      ws.addEventListener('change', function () { resuggest(box, ws._lstSuggest()); });
    }
  }
  function render(box) {
    var st = box._lst; if (!st) return;
    var on = st.items.length > 0;
    var h = '<label class="lst-lbl" for="lstTpl">مراحل العمل</label>'
      + '<select id="lstTpl" class="lst-tpl" data-lst-act="tpl">'
      + '<option value=""' + (st.lockedNone ? ' disabled' : '') + (on ? '' : ' selected') + '>بلا مراحل — رحلة واحدة للمخبر</option>'
      + TEMPLATES.map(function (t) { return '<option value="' + t.id + '"' + (st.tpl === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('')
      + '<option value="custom"' + (st.tpl === 'custom' ? ' selected' : '') + '>مخصّص</option>'
      + '</select>';
    if (on) {
      h += '<div class="lst-edit">' + st.items.map(function (s, k) {
        return '<span class="lst-chip' + (s.fixed ? ' lst-fixed' : '') + '">' + esc(disp(s))
          + (s.fixed ? '' : ' <button type="button" class="lst-x" data-lst-act="del" data-lst-i="' + k + '" aria-label="حذف المرحلة">×</button>') + '</span>';
      }).join('<span class="lst-sep">›</span>') + '</div>'
        + '<div class="lst-add"><input type="text" class="lst-new" maxlength="' + NAME_MAX + '" placeholder="مرحلة أخرى (مثلاً: تجربة ثانية)">'
        + '<button type="button" class="lst-addbtn" data-lst-act="add">إضافة</button></div>'
        + '<div class="lst-hint">كل مرحلة = زيارة يعود لها العمل من المخبر. الكلفة تُحسب مرة واحدة بتاريخ الإرسال الأول.</div>';
    }
    box.innerHTML = h;
    if (!box._lstWired) {
      box._lstWired = true;
      box.addEventListener('change', function (e) {
        var t = e.target; if (!t || t.getAttribute('data-lst-act') !== 'tpl') return;
        pickTemplate(box, t.value);
      });
      box.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-lst-act]') : null; if (!b) return;
        var act = b.getAttribute('data-lst-act'), s = box._lst;
        if (act === 'del') { s.items.splice(parseInt(b.getAttribute('data-lst-i'), 10), 1); s.tpl = 'custom'; s.touched = true; render(box); }
        else if (act === 'add') { addFromInput(box); }
      });
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('lst-new')) { e.preventDefault(); addFromInput(box); }
      });
    }
  }
  function addFromInput(box) {
    var s = box._lst, inp = box.querySelector('.lst-new'), n = cleanName(inp ? inp.value : '');
    if (!n || s.items.length >= MAX) return;
    s.items.push({ k: '', n: n, keep: null, fixed: false }); s.tpl = 'custom'; s.touched = true; render(box);
    var again = box.querySelector('.lst-new'); if (again) try { again.focus(); } catch (e) {}
  }
  function pickTemplate(box, id) {
    var s = box._lst; if (!s) return;
    var fixed = s.items.filter(function (x) { return x.fixed; });
    if (!id) { if (s.lockedNone) { render(box); return; } s.items = []; s.tpl = ''; }
    else if (id === 'custom') { s.tpl = 'custom'; if (!s.items.length) s.items = fromKeys(['trial', 'fit']).map(function (x) { return { k: x.k, n: x.n, keep: null, fixed: false }; }); }
    else {
      var t = template(id); if (!t) return;
      /* المراحلُ المغلقة والحالية تبقى؛ القالبُ يكمل ما بعدها بما لم يرد منها */
      var have = {}; fixed.forEach(function (x) { if (x.k) have[x.k] = 1; });
      s.items = fixed.concat(fromKeys(t.keys).filter(function (x) { return !have[x.k]; }).map(function (x) { return { k: x.k, n: x.n, keep: null, fixed: false }; })).slice(0, MAX);
      s.tpl = id;
    }
    s.touched = true; render(box);
  }
  /* اقتراحٌ من العلاج عند تغيير نوع العمل — لا يدوس اختياراً يدوياً ولا طلباً قائماً بمراحل */
  function resuggest(box, id) {
    var s = box && box._lst; if (!s || s.touched) return;
    s.tpl = id || ''; s.items = (id && template(id)) ? fromKeys(template(id).keys).map(function (x) { return { k: x.k, n: x.n, keep: null, fixed: false }; }) : [];
    render(box);
  }
  /* قيمةُ الحفظ: { stages: مصفوفة | null } أو { error } — المغلقةُ والحالية بكائنها الأصلي */
  function read(box) {
    var s = box && box._lst; if (!s) return { stages: undefined };
    if (!s.items.length) return s.lockedNone ? { error: 'لا تُحذف المراحل بعد إنجاز أولاها' } : { stages: null };
    if (s.items.length < MIN) return { error: 'العمل بمراحل يحتاج مرحلتين على الأقل — أو اختر «بلا مراحل»' };
    if (s.items.length > MAX) return { error: 'ثماني مراحل على الأكثر' };
    return { stages: s.items.map(function (x) { if (x.keep) return x.keep; var o = {}; if (x.k) o.k = x.k; o.n = x.n; return o; }) };
  }
  /* تُلحق المراحل بحمولة الحفظ: إنشاءٌ ⇒ دائماً (مصفوفة أو لا شيء) · تعديلٌ ⇒ فقط إن تغيّرت */
  function applyToPayload(box, payload, prev) {
    var r = read(box);
    if (r.error) return r.error;
    if (r.stages === undefined) return '';
    var before = prev && Array.isArray(prev.stages) ? prev.stages : null;
    if (JSON.stringify(before) === JSON.stringify(r.stages)) return '';
    if (r.stages === null && !prev) return '';
    payload.stages = r.stages;
    return '';
  }

  /* دوراتُ المخبر المنتهية لطلبٍ بمراحل: كلُّ مرحلةٍ رحلةٌ كاملة (إرسال ← استلام) بتواريخها هي — تواريخُ الطلب نفسها تحمل
     المرحلةَ الحالية وحدها و date_sent ثابتٌ على الإرسال الأول، فقياسُ مدّة المخبر منهما يخلط المراحل. [{sent, due, received}]
     أو null لطلبٍ بلا مراحل (يُقاس كما كان). */
  function cycles(lo) {
    var L = list(lo); if (!L) return null;
    var i = idx(lo), out = [];
    L.forEach(function (st, k) {
      var sent = k === 0 ? (st.sent || lo.date_sent) : st.sent;
      if (k < i) { if (sent && st.received) out.push({ sent: sent, due: st.due || null, received: st.received }); }
      else if (k === i && sent && lo.date_received) out.push({ sent: sent, due: lo.date_due || null, received: lo.date_received });
    });
    return out;
  }

  /* ج3-ب: المرحلةُ كما تُطبع بورقة المخبر — من المنتقي المفتوح (ما اختاره الطبيب الآن) وموضعُها من الطلب المحفوظ.
     الورقةُ للمخبر ⇒ الأسماءُ كما حُفظت (عربية) لا disp. بلا مراحل ⇒ null. */
  function forSlip(box, lo) {
    var r = read(box), L = (r && Array.isArray(r.stages)) ? r.stages : (r && r.stages === undefined ? list(lo) : null);
    if (!L || L.length < MIN) return null;
    var i = has(lo) ? Math.min(idx(lo), L.length - 1) : 0;
    return { name: cleanName(L[i].n), pos: i + 1, total: L.length, all: L.map(function (s) { return cleanName(s.n); }) };
  }

  /* اقتراحُ الاستحقاق للمرحلة التالية: مدّةُ المرحلة المنتهية (إرسالها ← استحقاقها/استلامها) — 1..60 يوماً */
  function suggestDue(lo, today) {
    var st = cur(lo); if (!st) return '';
    var start = (idx(lo) === 0 ? lo.date_sent : st.sent) || lo.date_sent, end = lo.date_due || lo.date_received;
    if (!start || !end) return '';
    var days = Math.round((dayMs(end) - dayMs(start)) / 86400000);
    if (!(days >= 1) || days > 60) return '';
    var t = today ? new Date(today + 'T00:00:00') : new Date();
    t.setDate(t.getDate() + days);
    return ymd(t);
  }

  /* الحوار — على عُدّة النوافذ نفسها (sy-m · sy-dialog). meta.appts: [{id, date, label}] مواعيدُ المريض القادمة */
  function open(lo, meta) {
    meta = meta || {};
    return new Promise(function (resolve) {
      var today = ymd(new Date()), nx = nextStage(lo), L = list(lo), appts = Array.isArray(meta.appts) ? meta.appts : [];
      var sub = [meta.workType || lo.work_type, meta.patientName, meta.labName].filter(Boolean).map(esc).join(' · ');
      var ov = document.createElement('div');
      ov.className = 'modal-overlay sy-m sy-m-sm open sy-dialog lst-dialog';
      ov.setAttribute('data-sy-kind', 'labstage');
      ov.innerHTML =
        '<div class="modal-box">' +
          '<div class="modal-head"><h3>إرسال المرحلة التالية للمخبر</h3></div>' +
          '<div class="modal-body">' +
            (sub ? '<div class="sy-dialog-msg">' + sub + '</div>' : '') +
            '<div class="lst-next"><span class="lst-next-lbl">المرحلة التالية</span> <b class="lst-next-n">' + esc(disp(nx)) + '</b> <span class="lst-next-of">' + (idx(lo) + 2) + ' / ' + L.length + '</span></div>' +
            (appts.length
              ? '<label class="lst-lbl" for="lstAppt">موعد المريض لهذه المرحلة</label>' +
                '<select id="lstAppt" class="sy-dialog-input lst-appt"><option value="">— بلا موعد بعد —</option>' +
                appts.map(function (a) { return '<option value="' + esc(a.id) + '" data-lst-date="' + esc(String(a.date || '').slice(0, 10)) + '">' + esc(a.label) + '</option>'; }).join('') + '</select>'
              : '') +
            '<label class="lst-lbl" for="lstDue">موعد الاستلام من المخبر</label>' +
            '<input type="date" id="lstDue" class="sy-dialog-input lst-due" min="' + today + '" value="' + esc(suggestDue(lo, today)) + '">' +
            '<div class="lst-hint">تبقى تكلفة الطلب محسوبة مرة واحدة بتاريخ إرساله الأول.</div>' +
            '<div class="lst-err" role="alert" hidden></div>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn-sy-cancel" data-lst-act="cancel" data-sy-close>إلغاء</button>' +
            '<button type="button" class="btn-sy-ok" data-lst-act="ok">إرسال للمخبر</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      if (window.SyModal) window.SyModal.scan();
      var done = false;
      function finish(v) {
        if (done) return; done = true;
        ov.remove();
        if (!document.querySelector('.modal-overlay.sy-m.open')) document.body.classList.remove('sy-modal-lock');
        resolve(v);
      }
      var err = ov.querySelector('.lst-err'), due = ov.querySelector('.lst-due'), sel = ov.querySelector('.lst-appt');
      function fail(m) { err.textContent = m; err.hidden = false; }
      function apptDate() { var o = sel && sel.options[sel.selectedIndex]; return (o && o.getAttribute('data-lst-date')) || ''; }
      if (sel) sel.addEventListener('change', function () {
        /* الموعدُ يحكم الاستحقاق (EXACT/Dentrix Ascend): آخرُ يوم دوامٍ قبله، ما لم يكن الطبيب كتب تاريخاً يسبقه */
        var d = apptDate(); err.hidden = true;
        if (!d) return;
        var cap = (window.SyLabDue && window.SyLabDue.prevWorkDay) ? window.SyLabDue.prevWorkDay(d) : d;
        if (cap < today) cap = today;
        if (!due.value || due.value > d) due.value = cap;
      });
      ov.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-lst-act]') : null;
        if (!b) return;                                   /* النقرُ الخارجي لا يُغلق: قرارٌ يُتَّخذ */
        if (b.getAttribute('data-lst-act') !== 'ok') { finish(null); return; }
        var v = due.value || '', ad = apptDate();
        if (v && v < today) { fail('موعد الاستلام لا يكون بتاريخٍ مضى.'); return; }
        if (v && ad && v > ad) { fail('موعد الاستلام من المخبر لا يكون بعد موعد المريض.'); return; }
        finish({ due: v, appt: (sel && sel.value) || '' });
      });
      setTimeout(function () { try { (sel || due).focus(); } catch (e) {} }, 30);
    });
  }

  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function errText(res, fallback) {
    var m = res && res.error ? String(res.error.message || '') : '';
    if (m.indexOf('lab_stage_bad_appt') !== -1) return '⚠️ الموعد المختار لا يعود لهذا المريض';
    if (m.indexOf('lab_stage_not_allowed') !== -1) return '⚠️ حالة الطلب تغيّرت — حدّث الصفحة وأعد المحاولة';
    return fallback;
  }

  /* الفعلُ الكامل: حوار ← RPC ← سجلُّ النشاطات. يُرجع صفَّ الطلب المحدَّث أو null. */
  async function run(sb, lo, meta) {
    if (!sb || !lo || !canAdvance(lo)) return null;
    var pick = await window.SyLabStages.open(lo, meta);   /* عبر الواجهة العامة — المثبتُ يستبدل الحوار */
    if (!pick) return null;
    var nx = nextStage(lo);
    var res = await sb.rpc('lab_order_next_stage', { p_order: lo.id, p_new_due: pick.due || null, p_appt: pick.appt || null });
    if (res.error || !res.data || !res.data.id) {
      toast(errText(res, '⚠️ فشل إرسال المرحلة التالية — حاول مجدداً'));
      if (res.error) console.warn('lab_order_next_stage:', res.error);
      return null;
    }
    if (window.logAudit) {
      window.logAudit('lab.stage', {
        entityId: lo.id,
        patientId: lo.patient_id,
        patientName: meta && meta.patientName,
        description: 'مرحلة مخبر: ' + ((meta && meta.workType) || lo.work_type || '') + ' — ' + cleanName(cur(lo).n) + ' ← ' + cleanName(nx.n),
        oldValue: { stage: cleanName(cur(lo).n), status: lo.status, date_due: lo.date_due || null },
        newValue: { stage: cleanName(nx.n), status: 'sent', date_due: res.data.date_due || null }
      });
    }
    return res.data;
  }
  /* تراجعٌ عن آخر انتقال (نقرةٌ خاطئة): من «عند المخبر» فقط — يعيد المرحلةَ السابقة بتواريخها */
  async function undo(sb, lo, meta) {
    if (!sb || !lo || !canUndo(lo)) return null;
    var L = list(lo), i = idx(lo);
    var okGo = window.SyDialog ? await window.SyDialog.confirm({
      title: 'تراجع عن المرحلة',
      message: 'التراجع عن إرسال مرحلة «' + cleanName(L[i].n) + '»؟\nيعود الطلب إلى مرحلة «' + cleanName(L[i - 1].n) + '» مستلَماً كما كان.',
      confirmText: 'تراجع', cancelText: 'إلغاء'
    }) : true;
    if (!okGo) return null;
    var res = await sb.rpc('lab_order_prev_stage', { p_order: lo.id });
    if (res.error || !res.data || !res.data.id) {
      toast(errText(res, '⚠️ فشل التراجع — حاول مجدداً'));
      if (res.error) console.warn('lab_order_prev_stage:', res.error);
      return null;
    }
    if (window.logAudit) {
      window.logAudit('lab.stage', {
        entityId: lo.id, patientId: lo.patient_id, patientName: meta && meta.patientName,
        description: 'تراجع عن مرحلة مخبر: ' + ((meta && meta.workType) || lo.work_type || '') + ' — ' + cleanName(L[i].n) + ' ← ' + cleanName(L[i - 1].n),
        oldValue: { stage: cleanName(L[i].n), status: lo.status },
        newValue: { stage: cleanName(L[i - 1].n), status: res.data.status }
      });
    }
    return res.data;
  }

  window.SyLabStages = {
    MAX: MAX, MIN: MIN, NAMES: NAMES, TEMPLATES: TEMPLATES, template: template, suggest: suggest,
    has: has, list: list, idx: idx, cur: cur, isFinal: isFinal, nextStage: nextStage, canAdvance: canAdvance, canUndo: canUndo, next: next,
    stateText: stateText, disp: disp, line: line, mount: mount, resuggest: resuggest, read: read, applyToPayload: applyToPayload,
    suggestDue: suggestDue, open: open, run: run, undo: undo, forSlip: forSlip, cycles: cycles
  };
})();
