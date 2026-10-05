/* ════════════════════════════════════════════════════════════════════════
   SyDent — lab-files.js · مرفقاتُ طلب المخبر (v535 · Migration 162 · جولة المخابر، البند 6)
   ────────────────────────────────────────────────────────────────────────
   صورةُ اللون والحالة والمسح (أو PDF) تُرفق بالطلب — CareStack «lab case attachments» · Dentrix «Lab Rx».
   بلا تخزينٍ ثانٍ: ملفاتُ المريض نفسُها (SyDentFiles: bucket patient-files · RLS المالك · الضغط ·
   حذفُ الكائن ثم الصف) مع رابط patient_documents.lab_order_id — فالمرفقُ يظهر بتبويب ملفات المريض أيضاً.
   مصدرٌ واحد لمودال الطلب بالسطحين (#676؛ معرّفاتُ الوحدة ببادئة lfs-):
     • طلبٌ محفوظ ⇒ الرفعُ فوريّ عند الاختيار، والعرضُ لكل أسنان دفعته (نفسُ لحظة الإنشاء).
     • طلبٌ جديد ⇒ تُحجز الملفاتُ وتُرفع بعد الحفظ على أول صفٍّ أُدرج (flush) — لا طلبَ بلا ملفاته.
   العرض: مصغّراتٌ بروابط موقّعة (ساعة)، والنقرُ يفتح الملف؛ «📎 N» بسطر الطلب بصفحة المخابر.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SyLabFiles) return;

  var MAX = 10, CHUNK = 150;
  var st = { orderIds: [], patientId: null, staged: [], docs: [], byOrder: {}, onChange: null };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isImg(m) { return /^image\//.test(m || ''); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function sb() { return window.sb; }

  /* أسنانُ الدفعة: صفوفُ الإدراج الواحد (المريض + المخبر + العمل + لحظة الإنشاء) */
  function siblings(orders, id) {
    var lo = (orders || []).find(function (o) { return o.id === id; });
    if (!lo) return id ? [id] : [];
    return (orders || []).filter(function (o) {
      return o.patient_id === lo.patient_id && o.lab_id === lo.lab_id && o.created_at === lo.created_at &&
             (o.treatment_key || o.work_type) === (lo.treatment_key || lo.work_type);
    }).map(function (o) { return o.id; });
  }

  function box() {
    var el = document.getElementById('lfsBox');
    if (el) return el;
    var notes = document.getElementById('labOrderNotes');
    var grp = notes && notes.closest ? notes.closest('.form-group') : null;
    if (!grp || !grp.parentNode) return null;
    el = document.createElement('div');
    el.id = 'lfsBox'; el.className = 'form-group lfs-box';
    grp.parentNode.insertBefore(el, grp.nextSibling);
    el.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'lfsInput') { pick(e.target.files); e.target.value = ''; }
    });
    el.addEventListener('click', function (e) {
      var d = e.target.closest ? e.target.closest('[data-lfs-del]') : null;
      if (d) { e.preventDefault(); del(d.getAttribute('data-lfs-del')); return; }
      var u = e.target.closest ? e.target.closest('[data-lfs-unstage]') : null;
      if (u) { e.preventDefault(); st.staged.splice(Number(u.getAttribute('data-lfs-unstage')), 1); render(); return; }
      var o = e.target.closest ? e.target.closest('[data-lfs-open]') : null;
      if (o) { e.preventDefault(); openDoc(o.getAttribute('data-lfs-open')); }
    });
    return el;
  }

  function render() {
    var el = box(); if (!el) return;
    var saved = st.orderIds.length > 0, n = st.docs.length + st.staged.length;
    var h = '<label>📎 مرفقات للمخبر <span class="lfs-opt">صورة اللون · الحالة · المسح — اختياري</span></label>';
    h += '<div class="lfs-list">';
    st.docs.forEach(function (d) {
      h += '<div class="lfs-item">'
        + (isImg(d.mime_type) && d._url
            ? '<a href="#" data-lfs-open="' + esc(d.id) + '" class="lfs-thumb" title="' + esc(d.file_name) + '"><img src="' + esc(d._url) + '" alt="' + esc(d.file_name) + '"></a>'
            : '<a href="#" data-lfs-open="' + esc(d.id) + '" class="lfs-thumb lfs-doc" title="' + esc(d.file_name) + '">📄<span>' + esc(d.file_name) + '</span></a>')
        + '<button type="button" class="lfs-x" data-sub-write data-lfs-del="' + esc(d.id) + '" aria-label="حذف المرفق">✕</button></div>';
    });
    st.staged.forEach(function (f, i) {
      h += '<div class="lfs-item lfs-staged">'
        + (f._preview ? '<span class="lfs-thumb"><img src="' + esc(f._preview) + '" alt=""></span>' : '<span class="lfs-thumb lfs-doc">📄<span>' + esc(f.name) + '</span></span>')
        + '<button type="button" class="lfs-x" data-lfs-unstage="' + i + '" aria-label="إزالة">✕</button></div>';
    });
    if (n < MAX) {
      h += '<label class="lfs-add" data-sub-write><input type="file" id="lfsInput" accept="image/*,application/pdf" multiple hidden>＋<span>إرفاق</span></label>';
    }
    h += '</div>';
    if (!saved && st.staged.length) h += '<div class="lfs-hint">تُرفع مع حفظ الطلب.</div>';
    el.innerHTML = h;
  }

  async function refresh() {
    st.docs = [];
    if (!st.orderIds.length || !sb()) { render(); return; }
    try {
      var r = await sb().from('patient_documents').select('*').in('lab_order_id', st.orderIds.slice(0, CHUNK)).order('created_at', { ascending: true });
      if (r.error) { console.warn('lab files:', r.error); render(); return; }
      st.docs = r.data || [];
      var imgs = st.docs.filter(function (d) { return isImg(d.mime_type); }).map(function (d) { return d.storage_path; });
      var urls = (imgs.length && window.SyDentFiles && SyDentFiles.signedUrls) ? await SyDentFiles.signedUrls(imgs, 3600) : {};
      st.docs.forEach(function (d) { d._url = urls[d.storage_path] || null; });
    } catch (e) { console.warn('lab files:', e); }
    render();
  }

  /* نقطةُ الدخول عند فتح المودال: { orderId, orders, patientId, onChange } */
  function open(o) {
    o = o || {};
    st.staged.forEach(function (f) { if (f._preview) try { URL.revokeObjectURL(f._preview); } catch (e) {} });
    st.staged = []; st.docs = [];
    st.orderIds = o.orderId ? siblings(o.orders, o.orderId) : [];
    st.patientId = o.patientId || null; st.onChange = o.onChange || null;
    render(); refresh();
  }

  async function uploadAll(files, orderId, patientId) {
    var ok = 0, bad = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var r = await SyDentFiles.upload(patientId, f, { labOrderId: orderId, category: isImg(f.type) ? 'clinical_photo' : 'document', note: 'مرفق طلب مخبر' });
        if (r && r.ok) ok++; else { bad++; console.warn('lab file upload:', r); }
      } catch (e) { bad++; console.warn('lab file upload:', e); }
    }
    if (ok) toast('📎 رُفع ' + (ok === 1 ? 'مرفقٌ واحد' : ok + ' مرفقات'));
    if (bad) toast('⚠️ تعذّر رفع ' + bad + ' من المرفقات');
    return ok;
  }

  async function pick(list) {
    var files = [].slice.call(list || []).filter(function (f) { return isImg(f.type) || f.type === 'application/pdf'; });
    var room = MAX - st.docs.length - st.staged.length;
    if (!files.length) return;
    if (files.length > room) { toast('⚠️ الحدّ ' + MAX + ' مرفقات للطلب'); files = files.slice(0, Math.max(0, room)); }
    if (!window.SyDentFiles) return;
    if (st.orderIds.length) {                      /* محفوظ ⇒ رفعٌ فوري على أول صفوف الدفعة */
      if (!st.patientId) { toast('⚠️ الطلب بلا مريض'); return; }
      await uploadAll(files, st.orderIds[0], st.patientId);
      await refresh(); bump(st.orderIds[0], 0);
    } else {                                       /* جديد ⇒ حجزٌ حتى الحفظ */
      files.forEach(function (f) { try { if (isImg(f.type)) f._preview = URL.createObjectURL(f); } catch (e) {} st.staged.push(f); });
      render();
    }
  }

  /* بعد إدراج الطلب الجديد — الصفّ الأول من الدفعة. لا ينتظره المودال (يُغلق فوراً) */
  async function flush(orderId, patientId) {
    var files = st.staged.slice(); st.staged = [];
    if (!files.length || !orderId || !patientId || !window.SyDentFiles) return 0;
    var n = await uploadAll(files, orderId, patientId);
    files.forEach(function (f) { if (f._preview) try { URL.revokeObjectURL(f._preview); } catch (e) {} });
    bump(orderId, n);
    return n;
  }
  function hasStaged() { return st.staged.length > 0; }

  async function del(id) {
    var d = st.docs.find(function (x) { return x.id === id; }); if (!d) return;
    if (window.SyDentSub && SyDentSub.blockReadOnly && SyDentSub.blockReadOnly()) return;
    var yes = window.SyDialog ? await SyDialog.confirm({ message: 'حذف هذا المرفق؟ يُحذف من ملفات المريض أيضاً.', danger: true }) : true;
    if (!yes) return;
    var r = await SyDentFiles.remove(d);
    if (!r || !r.ok) { toast('⚠️ تعذّر الحذف'); return; }
    await refresh(); bump(d.lab_order_id, 0);
  }
  async function openDoc(id) {
    var d = st.docs.find(function (x) { return x.id === id; }); if (!d) return;
    var w = window.open('', '_blank');   /* يُفتح داخل النقرة (حاجبُ النوافذ)، ثم يُوجَّه للرابط الموقّع */
    var url = d._url || (window.SyDentFiles ? await SyDentFiles.signedUrl(d.storage_path, 3600) : null);
    if (w && url) w.location.href = url; else if (w) w.close();
  }

  /* عدّادُ «📎 N» لسطر الطلب بصفحة المخابر */
  async function loadCounts(sbc, ids) {
    var m = {};
    ids = (ids || []).filter(Boolean);
    for (var i = 0; i < ids.length; i += CHUNK) {
      try {
        var r = await sbc.from('patient_documents').select('lab_order_id').in('lab_order_id', ids.slice(i, i + CHUNK));
        if (r.error) { console.warn('lab files count:', r.error); continue; }
        (r.data || []).forEach(function (d) { m[d.lab_order_id] = (m[d.lab_order_id] || 0) + 1; });
      } catch (e) { console.warn('lab files count:', e); }
    }
    st.byOrder = m; return m;
  }
  function bump(orderId, delta) {
    if (!orderId) return;
    if (delta) st.byOrder[orderId] = (st.byOrder[orderId] || 0) + delta;
    else if (st.orderIds.indexOf(orderId) !== -1) st.byOrder[orderId] = st.docs.filter(function (d) { return d.lab_order_id === orderId; }).length;
    if (typeof st.onChange === 'function') { try { st.onChange(); } catch (e) {} }
  }
  function count(orderId) { return st.byOrder[orderId] || 0; }
  function badge(orderId) { var n = count(orderId); return n ? '<span class="lfs-badge" title="مرفقات للمخبر">📎 ' + n + '</span>' : ''; }

  window.SyLabFiles = { open: open, flush: flush, hasStaged: hasStaged, loadCounts: loadCounts, count: count, badge: badge, siblings: siblings,
    _state: st, _pick: pick };
})();
