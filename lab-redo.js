/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-redo.js · دورةُ إعادة العمل للمخبر (v523 · Migration 160)
   ────────────────────────────────────────────────────────────────────────
   مصدرٌ واحد للسطحين (صفحة المخابر + تبويب المخابر ببطاقة المريض — #676):
     • حوارُ الإعادة: السببُ شرائحُ صريحة + تفاصيل + موعدُ الاستلام الجديد مقترَحاً
       من مدّة الدورة السابقة. السببُ إلزامي (هو ما يجعل تقييمَ المخبر ممكناً).
     • الكتابة: RPC lab_order_redo الذرّي — والثوابتُ بالقاعدة (تريغر M160):
       date_sent لا يتحرّك عند إعادة الإرسال ⇒ كلفةُ الطلب تبقى بشهر إرساله الأول
       بالمحاسبة وتقارير الأطباء (#196)، وتُسجَّل كلُّ دورةٍ بصفٍّ في lab_order_redos.
     • العرض: سطرُ «🔄 أُعيد …» ظاهرٌ نصّاً (لا تلميحاً يُقَصّ على الجوال — v481).
   المعرّفات والأصناف ببادئة lrd- (مثبَتٌ تفرّدُها ضد الصفحتين). لا معادلة مالية هنا.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabRedo) return;

  var REASONS = [
    'اللون غير مطابق',
    'عدم انطباق / لا يجلس',
    'حواف غير محكمة',
    'نقطة التماس',
    'إطباق عالٍ',
    'الشكل / التشريح',
    'كسر أو عيب تصنيع'
  ];
  var CHUNK = 150;          /* #691 */
  var byOrder = {};         /* lab_order_id → [صفوف الدورات مرتّبة زمنياً] */

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

  /* مدّةُ الدورة السابقة بالأيام: من الإرسال إلى الاستحقاق (وإلا إلى الاستلام) — 1..60، وإلا لا اقتراح. */
  function suggestDue(lo, today) {
    if (!lo || !lo.date_sent) return '';
    var end = lo.date_due || lo.date_received;
    if (!end) return '';
    var days = Math.round((dayMs(end) - dayMs(lo.date_sent)) / 86400000);
    if (!(days >= 1) || days > 60) return '';
    var t = today ? new Date(today + 'T00:00:00') : new Date();
    t.setDate(t.getDate() + days);
    return ymd(t);
  }

  function reasonText(picked, note) {
    var parts = (picked || []).filter(function (x) { return REASONS.indexOf(x) !== -1; });
    var n = String(note || '').replace(/\s+/g, ' ').trim();
    var s = parts.join(' · ');
    if (n) s = s ? (s + ' — ' + n) : n;
    return s.slice(0, 300);
  }

  function countAr(n) {
    if (n === 1) return 'مرة';
    if (n === 2) return 'مرتين';
    if (n <= 10) return n + ' مرات';
    return n + ' مرة';
  }
  function list(id) { return byOrder[id] || []; }
  function count(id) { return list(id).length; }

  /* سطرٌ ظاهر تحت نوع العمل — آخرُ سبب وإعادةُ الإرسال؛ والتاريخُ الكامل بالعنوان للديسكتوب. */
  function line(id) {
    var L = list(id);
    if (!L.length) return '';
    var last = L[L.length - 1];
    var parts = ['🔄 أُعيد ' + countAr(L.length)];
    if (last.reason) parts.push(esc(last.reason));
    if (last.resent_at) parts.push('أُعيد إرساله ' + esc(numDate(last.resent_at)));
    var title = L.map(function (r, i) {
      return (i + 1) + ') ' + numDate(r.redo_at) + (r.reason ? ' — ' + r.reason : '') +
        (r.resent_at ? ' · أُعيد إرساله ' + numDate(r.resent_at) : '');
    }).join('\n');
    return '<div class="lrd-line" title="' + esc(title) + '">' + parts.join(' · ') + '</div>';
  }

  async function load(sb, ids) {
    byOrder = {};
    ids = (ids || []).filter(Boolean);
    if (!sb || !ids.length) return byOrder;
    for (var i = 0; i < ids.length; i += CHUNK) {
      try {
        var res = await sb.from('lab_order_redos').select('*')
          .in('lab_order_id', ids.slice(i, i + CHUNK)).order('redo_at', { ascending: true });
        if (res.error) { console.warn('lab_order_redos:', res.error); continue; }   /* #240: لا بلعٌ صامت */
        (res.data || []).forEach(function (r) { (byOrder[r.lab_order_id] = byOrder[r.lab_order_id] || []).push(r); });
      } catch (e) { console.warn('lab_order_redos:', e); }
    }
    return byOrder;
  }

  function markResent(id, iso) {
    var L = list(id);
    for (var i = L.length - 1; i >= 0; i--) if (!L[i].resent_at) { L[i].resent_at = iso; break; }
  }

  /* الحوار — على عُدّة النوافذ نفسها (sy-m · sy-dialog) فيرث الشكل والسلوك. */
  function open(lo, meta) {
    meta = meta || {};
    return new Promise(function (resolve) {
      var today = ymd(new Date());
      var sub = [meta.workType || lo.work_type, lo.tooth_num ? ('سن ' + lo.tooth_num) : '', meta.labName].filter(Boolean).map(esc).join(' · ');
      var ov = document.createElement('div');
      ov.className = 'modal-overlay sy-m sy-m-sm open sy-dialog lrd-dialog';
      ov.setAttribute('data-sy-kind', 'labredo');
      ov.innerHTML =
        '<div class="modal-box">' +
          '<div class="modal-head"><h3>إعادة العمل للمخبر</h3></div>' +
          '<div class="modal-body">' +
            (sub ? '<div class="sy-dialog-msg">' + sub + '</div>' : '') +
            '<div class="lrd-lbl">سبب الإعادة</div>' +
            '<div class="lrd-chips">' + REASONS.map(function (r) {
              return '<button type="button" class="lrd-chip" aria-pressed="false" data-lrd-r="' + esc(r) + '">' + esc(r) + '</button>';
            }).join('') + '</div>' +
            '<textarea class="sy-dialog-input lrd-note" rows="2" maxlength="200" placeholder="تفاصيل للمخبر (اختياري)"></textarea>' +
            '<label class="lrd-lbl" for="lrdDue">موعد الاستلام الجديد من المخبر</label>' +
            '<input type="date" id="lrdDue" class="sy-dialog-input lrd-due" min="' + today + '" value="' + esc(suggestDue(lo, today)) + '">' +
            '<div class="lrd-hint">تبقى تكلفة الطلب محسوبة بتاريخ إرساله الأول.</div>' +
            '<div class="lrd-err" role="alert" hidden></div>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn-sy-cancel" data-lrd-act="cancel" data-sy-close>إلغاء</button>' +
            '<button type="button" class="btn-sy-ok" data-lrd-act="ok">تأكيد الإعادة</button>' +
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
      var err = ov.querySelector('.lrd-err');
      function fail(m) { err.textContent = m; err.hidden = false; }
      ov.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-lrd-r]') : null;
        if (chip) {
          var on = chip.getAttribute('aria-pressed') !== 'true';
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          chip.classList.toggle('on', on);
          err.hidden = true;
          return;
        }
        var b = e.target.closest ? e.target.closest('[data-lrd-act]') : null;
        if (!b) return;                                   /* النقرُ الخارجي لا يُغلق: قرارٌ يُتَّخذ */
        if (b.getAttribute('data-lrd-act') !== 'ok') { finish(null); return; }
        var picked = [].map.call(ov.querySelectorAll('.lrd-chip[aria-pressed="true"]'), function (c) { return c.getAttribute('data-lrd-r'); });
        var reason = reasonText(picked, ov.querySelector('.lrd-note').value);
        if (!reason) { fail('اختر سبب الإعادة أو اكتبه — هو ما يُبنى عليه تقييم المخبر.'); return; }
        var due = ov.querySelector('.lrd-due').value || '';
        if (due && due < today) { fail('موعد الاستلام الجديد لا يكون بتاريخٍ مضى.'); return; }
        finish({ reason: reason, due: due });
      });
      setTimeout(function () { try { var f = ov.querySelector('.lrd-chip'); if (f) f.focus(); } catch (e) {} }, 30);
    });
  }

  /* الفعلُ الكامل: حوار ← RPC ← تسجيلُ الدورة محلياً ← سجلُّ النشاطات. يُرجع صفَّ الطلب المحدَّث أو null. */
  async function run(sb, lo, meta) {
    if (!sb || !lo) return null;
    var pick = await window.SyLabRedo.open(lo, meta);   /* عبر الواجهة العامة — المثبتُ يستبدل الحوار */
    if (!pick) return null;
    var res = await sb.rpc('lab_order_redo', { p_order: lo.id, p_reason: pick.reason, p_new_due: pick.due || null });
    if (res.error || !res.data || !res.data.order) {
      var m = res.error && String(res.error.message || '');
      if (typeof showToast === 'function') {
        showToast(m && m.indexOf('lab_redo_not_allowed') !== -1
          ? '⚠️ لا تُعاد إلا الأعمال المستلَمة من المخبر'
          : '⚠️ فشلت الإعادة — حاول مجدداً');
      }
      if (res.error) console.warn('lab_order_redo:', res.error);
      return null;
    }
    if (res.data.redo) (byOrder[lo.id] = byOrder[lo.id] || []).push(res.data.redo);
    if (window.logAudit) {
      window.logAudit('lab.redo', {
        entityId: lo.id,
        patientId: lo.patient_id,
        patientName: meta && meta.patientName,
        description: 'إعادة عمل للمخبر: ' + ((meta && meta.workType) || lo.work_type || '') + ' — ' + pick.reason,
        oldValue: { status: lo.status, date_due: lo.date_due || null },
        newValue: { status: 'redo', date_due: res.data.order.date_due || null, reason: pick.reason }
      });
    }
    return res.data.order;
  }

  window.SyLabRedo = {
    REASONS: REASONS, suggestDue: suggestDue, reasonText: reasonText, countAr: countAr,
    load: load, list: list, count: count, line: line, markResent: markResent, open: open, run: run,
    _reset: function () { byOrder = {}; }
  };
})();
