/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-status.js · حالةُ طلب المخبر من نافذته (Migration 207)
   ────────────────────────────────────────────────────────────────────────
   مصدرٌ واحد للسطحين (صفحة المخابر + تبويب المخابر ببطاقة المريض — #676).
   قائمةٌ منسدلة بنافذة **تعديل** الطلب: تصحيحُ خطوة (نقرةٌ خاطئة على «تم الاستلام») · إلغاءُ الطلب · استعادتُه.
   (مراجعة: Dentally — حالةُ المخبر قائمةٌ تُغيَّر بحرّية · Open Dental — تُصحَّح بتعديل تاريخ التتبّع.)
     • الكتابة: RPC lab_order_set_status وحده — الدالةُ تضبط التواريخ (الرجوعُ يفرّغ ما بعده، والتقدّمُ يختم ما ينقص)،
       و date_sent لا يُمسّ (مرساةُ كلفة المخبر — #196). الحمولةُ العادية للحفظ لا تحمل الحالة (درس M127).
     • «ملغى» = الحالةُ 'rejected' القائمة: مستثناةٌ أصلاً من كلفة المخابر وذمّتها وأدائها بكل موضع — صفر لمسٍ مالي.
     • خارج القائمة عمداً: المسودّةُ (يحكمها تاريخُ الإرسال — M127) و«إعادة» (لها حوارُها: سببٌ واستحقاق — M160).
   المعرّفات والأصناف ببادئة lsx-.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabStatus) return;

  var REASON_MAX = 300, CANCEL = 'rejected';
  var LADDER = ['sent', 'received', 'checked', 'delivered'];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function numDate(iso) {
    if (!iso) return '';
    if (window.SyDT && window.SyDT.numDate) return window.SyDT.numDate(iso) || '';
    var d = new Date(iso); return isNaN(d) ? '' : (d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear());
  }
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
  function prevOf(lo) { return (lo && lo.cancel_prev_status) || 'sent'; }

  /* الحالاتُ المتاحة لهذا الطلب (الأولى ليست بالضرورة الحالية) — مرآةُ قواعد الدالة بالقاعدة؛ null = لا قائمة */
  function choices(lo, isFinal) {
    if (!lo || !lo.id || !lo.status) return null;                        /* المسودّةُ ليست بالسلّم أدناه ⇒ null */
    if (lo.status === CANCEL) return [CANCEL, prevOf(lo)];
    if (lo.status === 'redo') return ['redo', CANCEL];
    if (LADDER.indexOf(lo.status) === -1) return null;
    var out = LADDER.filter(function (s) { return s !== 'delivered' || isFinal !== false || lo.status === 'delivered'; });
    if (lo.status !== 'delivered') out.push(CANCEL);
    return out;
  }

  function hintFor(lo, to) {
    if (!lo || to === lo.status) {
      if (lo && lo.status === CANCEL) {
        return 'أُلغي' + (lo.date_cancelled ? ' ' + numDate(lo.date_cancelled) : '') + (lo.cancel_reason ? ' — ' + lo.cancel_reason : '') + '. لا تُحتسب كلفته على العيادة.';
      }
      return '';
    }
    if (to === CANCEL) return 'الطلب الملغى يبقى بسجله ولا تُحتسب كلفته على العيادة ولا يدخل ذمة المخبر. إن كان المخبر سيحاسبك عليه فلا تُلغِه.';
    if (lo.status === CANCEL) return 'يعود الطلب كما كان قبل الإلغاء، وتعود كلفته للحساب.';
    var a = LADDER.indexOf(lo.status), b = LADDER.indexOf(to);
    if (a !== -1 && b !== -1 && b < a) return 'رجوع عن خطوة: يُمسح تاريخ ما بعدها.';
    if (a !== -1 && b !== -1 && b > a) return 'يُسجَّل تاريخ اليوم للخطوات التي لم تُسجَّل.';
    return '';
  }

  /* opts: { order, labels: LAB_STATUSES, isFinal } — طلبٌ جديد أو مسودّة ⇒ الصندوقُ مخفي */
  function mount(box, opts) {
    if (!box) return;
    opts = opts || {};
    var lo = opts.order || null, ch = choices(lo, opts.isFinal), labels = opts.labels || {};
    box._lsx = { lo: lo, ch: ch };
    if (!ch) { box.innerHTML = ''; box.style.display = 'none'; return; }
    var lbl = function (s) { return s === CANCEL ? 'ملغى' : ((labels[s] && labels[s].ar) || s); };
    box.style.display = '';
    box.innerHTML =
      '<label for="lsxSel">حالة الطلب</label>' +
      '<select id="lsxSel" class="lsx-sel">' + ch.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === lo.status ? ' selected' : '') + '>' + esc(lbl(s)) + '</option>';
      }).join('') + '</select>' +
      '<input type="text" class="lsx-reason" maxlength="' + REASON_MAX + '" placeholder="سبب الإلغاء (اختياري)" hidden>' +
      '<div class="lsx-hint"></div>';
    var sel = box.querySelector('.lsx-sel'), rs = box.querySelector('.lsx-reason'), hint = box.querySelector('.lsx-hint');
    function sync() {
      var to = sel.value, cancel = to === CANCEL && lo.status !== CANCEL;
      rs.hidden = !cancel;
      if (!cancel) rs.value = '';
      hint.textContent = hintFor(lo, to);
      hint.classList.toggle('lsx-warn', cancel);
    }
    sel.addEventListener('change', sync);
    sync();
  }

  /* ما اختاره الطبيب إن غيّر الحالة — { status, reason } أو null */
  function pending(box) {
    var st = box && box._lsx; if (!st || !st.ch || !st.lo) return null;
    var sel = box.querySelector('.lsx-sel'); if (!sel || sel.value === st.lo.status || st.ch.indexOf(sel.value) === -1) return null;
    var rs = box.querySelector('.lsx-reason');
    return { status: sel.value, reason: (sel.value === CANCEL && rs) ? String(rs.value || '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX) : '' };
  }

  function errText(res, fallback) {
    var m = String((res && res.error && res.error.message) || '');
    if (m.indexOf('lab_stage_not_final') !== -1) return '⚠️ «تم التركيب» للمرحلة الأخيرة فقط';
    if (m.indexOf('lab_status_not_allowed') !== -1) return '⚠️ حالة الطلب تغيّرت — حدّث الصفحة وأعد المحاولة';
    return fallback;
  }

  /* يطبّق الاختيار على الطلب **كما هو بعد الحفظ** (row). يُرجع الصفَّ الجديد، أو null إن لم يُطبَّق (مع رسالة).
     meta: { labels, workType, patientName } */
  async function apply(sb, row, pick, meta) {
    if (!sb || !row || !row.id || !pick || !pick.status || pick.status === row.status) return null;
    meta = meta || {};
    /* الحفظُ نفسه قد يكون نقل الطلب مسودّةً (تفريغُ تاريخ الإرسال) — المسودّةُ يحكمها التاريخ لا القائمة */
    if (row.status === 'draft') { toast('⚠️ الطلب صار مسودة — حالته يحددها تاريخ الإرسال'); return null; }
    var res = await sb.rpc('lab_order_set_status', { p_order: row.id, p_status: pick.status, p_reason: pick.reason || null });
    if (res.error || !res.data || !res.data.id) {
      toast(errText(res, '⚠️ فشل تغيير حالة الطلب — حاول مجدداً'));
      if (res.error) console.warn('lab_order_set_status:', res.error);
      return null;
    }
    var labels = meta.labels || {}, lbl = function (s) { return s === CANCEL ? 'ملغى' : ((labels[s] && labels[s].ar) || s); };
    if (window.logAudit) {
      window.logAudit('lab.status', {
        entityId: row.id,
        patientId: row.patient_id,
        patientName: meta.patientName,
        description: (pick.status === CANCEL ? 'إلغاء طلب مخبر: ' : (row.status === CANCEL ? 'استعادة طلب مخبر ملغى: ' : 'تصحيح حالة طلب مخبر: '))
          + (meta.workType || row.work_type || '') + ' — ' + lbl(row.status) + ' ← ' + lbl(pick.status) + (pick.reason ? ' — ' + pick.reason : ''),
        oldValue: { status: row.status },
        newValue: { status: pick.status, reason: pick.reason || null }
      });
    }
    return res.data;
  }

  /* سطرُ الصف لطلبٍ ملغى: متى أُلغي ولماذا (مُهرَّب) — فارغٌ لغيره */
  function note(lo) {
    if (!lo || lo.status !== CANCEL) return '';
    return '<div class="lsx-note">🚫 أُلغي' + (lo.date_cancelled ? ' ' + esc(numDate(lo.date_cancelled)) : '')
      + (lo.cancel_reason ? ' — ' + esc(lo.cancel_reason) : '') + '</div>';
  }

  window.SyLabStatus = { CANCEL: CANCEL, choices: choices, mount: mount, pending: pending, apply: apply, note: note };
})();
