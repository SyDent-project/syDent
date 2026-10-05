/* SYDENT_APPT_BLOCKS_START — نافذةُ الحجوزات المغلقة (v498 · M154/M155) — مصدرٌ واحد لصفحتي المواعيد والإعدادات (v501)
   ─────────────────────────────────────────────────────────────
   محمولٌ بين الصفحات: يحقن مودالَه بنفسه عند أول فتح (لا نسخَ HTML بالصفحات ⇒ لا مرايا)، ويعتمد
   على ما هو حاضر: بالمواعيد يستعمل OPERATORIES/CLINIC_DOCTORS/BLOCK_ROWS/loadBlocks/render، وبغيابها
   (الإعدادات) يجلب الكراسي والأطباء والصفوف بنفسه من القاعدة بنطاق الطبيب.
   معرّفاتُه كلُّها ببادئة sbk (صفحةُ الإعدادات تملك bkStart/bkEnd/bkNote لساعات الحجز الإلكتروني).
   الحذفُ بحوار SyDialog · الأزرار على طقم .sy-acts · حرّاسُ وضع القراءة · كلُّ كتابةٍ بنطاق doctor_id.
   ───────────────────────────────────────────────────────────── */
var _sbkEditingId = null;
var _sbkRows = [];            /* الصفوف حين لا توجد BLOCK_ROWS بالصفحة */
var _sbkOps = null, _sbkProvs = null;   /* كاشُ الكراسي/الأطباء حين لا توجد كاشاتُ الصفحة */
var SBK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];   /* 0..6 = JS getDay */

function _sbkEl(id) { return document.getElementById(id); }
function _sbkOk() { return !!(window.SyDentBlocks && window.sb && currentUser); }
function _sbkYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _sbkEsc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function _sbkToast(m) { if (typeof showToast === 'function') showToast(m); }
function _sbkDaysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
function _sbkRowsNow() { return (typeof BLOCK_ROWS !== 'undefined' && Array.isArray(BLOCK_ROWS)) ? BLOCK_ROWS : _sbkRows; }

/* المودال يُحقن مرةً واحدة — المصدرُ الوحيد لمعالم النموذج */
function _sbkEnsureModal() {
  if (_sbkEl('schedBlockModal')) return;
  var wrap = document.createElement('div');
  wrap.innerHTML = ''
    + '<div class="modal-overlay sy-m sy-m-md" id="schedBlockModal">'
    +   '<div class="modal">'
    +     '<div class="modal-header">'
    +       '<div class="modal-title" id="sbkHeading">حجز وقت على التقويم</div>'
    +       '<button class="modal-close" type="button" onclick="closeBlockModal()">×</button>'
    +     '</div>'
    +     '<div class="modal-body">'
    +       '<div class="sbk-grid">'
    +         '<div class="form-group"><label>العنوان</label><input type="text" id="sbkTitle" maxlength="60" placeholder="استراحة الغداء"></div>'
    +         '<div class="form-group"><label>النوع</label><select id="sbkKind"></select></div>'
    +       '</div>'
    +       '<div class="sbk-grid">'
    +         '<div class="form-group"><label>من تاريخ <span class="sbk-hint">(فارغ = من اليوم)</span></label><input type="date" id="sbkFrom"></div>'
    +         '<div class="form-group"><label>إلى تاريخ <span class="sbk-hint">(فارغ = دائم)</span></label><input type="date" id="sbkTo"></div>'
    +       '</div>'
    +       '<div class="form-group"><label>أيام التكرار <span class="sbk-hint">(اتركها فارغة = كل يوم بالمدى)</span></label><div id="sbkWeekdays" class="sbk-weekdays"></div></div>'
    +       '<div class="form-group"><label class="sbk-check"><input type="checkbox" id="sbkAllDay" onchange="sbkToggleAllDay()"><span>يومٌ كامل</span></label></div>'
    +       '<div class="sbk-grid" id="sbkTimesWrap">'
    +         '<div class="form-group"><label>من</label><input type="time" id="sbkStart" step="300"></div>'
    +         '<div class="form-group"><label>إلى</label><input type="time" id="sbkEnd" step="300"></div>'
    +       '</div>'
    +       '<div class="sbk-grid">'
    +         '<div class="form-group"><label>الكرسي</label><select id="sbkOperatory"><option value="">كل الكراسي</option></select></div>'
    +         '<div class="form-group"><label>الطبيب</label><select id="sbkProvider"><option value="">كل الأطباء</option></select></div>'
    +       '</div>'
    +       '<div class="form-group"><label class="sbk-check"><input type="checkbox" id="sbkBlocks" checked><span>يمنع الحجز <small class="sbk-hint">(ألغِ التحديد لـ«محجوز لنوع» — بصريٌّ فقط)</small></span></label></div>'
    +       '<div class="form-group"><label>ملاحظة</label><input type="text" id="sbkNotes" maxlength="200"></div>'
    +       '<div id="sbkErr" class="sbk-err" style="display:none;"></div>'
    +       '<div class="sbk-list-hd">الحجوزات القادمة</div>'
    +       '<div id="sbkList"></div>'
    +     '</div>'
    +     '<div class="modal-footer">'
    +       '<button type="button" class="btn-cancel" onclick="closeBlockModal()">إغلاق</button>'
    +       '<button type="button" class="btn btn-primary" id="sbkSaveBtn" onclick="saveBlock()" data-sub-write>حفظ</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(wrap.firstChild);
  var k = _sbkEl('sbkKind');
  Object.keys(window.SyDentBlocks.KINDS).forEach(function (key) {
    var o = document.createElement('option'); o.value = key;
    o.textContent = window.SyDentBlocks.KINDS[key].icon + ' ' + window.SyDentBlocks.KINDS[key].label; k.appendChild(o);
  });
  var w = _sbkEl('sbkWeekdays');
  [6, 0, 1, 2, 3, 4, 5].forEach(function (d) {   /* السبت أولاً (أسبوعُ العيادة) */
    var lab = document.createElement('label');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(d); cb.className = 'sbk-wd';
    lab.appendChild(cb); lab.appendChild(document.createTextNode(SBK_DAYS[d])); w.appendChild(lab);
  });
}

/* الكراسي والأطباء: من كاشات الصفحة إن وُجدت، وإلا استعلامٌ واحد بنطاق الطبيب */
async function _sbkLoadPickers() {
  var ops = (typeof OPERATORIES !== 'undefined' && Array.isArray(OPERATORIES)) ? OPERATORIES : null;
  var provs = (typeof CLINIC_DOCTORS !== 'undefined' && Array.isArray(CLINIC_DOCTORS)) ? CLINIC_DOCTORS : null;
  if (!ops) {
    if (!_sbkOps) {
      try { var r1 = await window.sb.from('operatories').select('id, name, is_active, sort_order').eq('doctor_id', currentUser.id).order('sort_order', { ascending: true });
        _sbkOps = (r1.data || []).filter(function (o) { return o.is_active !== false; }); } catch (e) { _sbkOps = []; }
    }
    ops = _sbkOps;
  }
  if (!provs) {
    if (!_sbkProvs) {
      try { var r2 = await window.sb.from('clinic_doctors').select('id, name, is_active').eq('owner_id', currentUser.id).order('is_active', { ascending: false });
        _sbkProvs = r2.data || []; } catch (e) { _sbkProvs = []; }
    }
    provs = _sbkProvs;
  }
  var op = _sbkEl('sbkOperatory'); while (op.options.length > 1) op.remove(1);
  ops.forEach(function (o) { var e = document.createElement('option'); e.value = o.id; e.textContent = o.name || ''; op.appendChild(e); });
  var pv = _sbkEl('sbkProvider'); while (pv.options.length > 1) pv.remove(1);
  provs.filter(function (d) { return d.is_active !== false; }).forEach(function (d) { var e = document.createElement('option'); e.value = d.id; e.textContent = d.name || ''; pv.appendChild(e); });
}

/* الصفوف: بالمواعيد عبر loadBlocks()/BLOCK_ROWS (فيُعاد رسمُ العروض)، وإلا جلبٌ محلّي */
async function _sbkReload() {
  if (typeof loadBlocks === 'function') { await loadBlocks(); }
  else {
    var t = new Date(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 60), b = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 400);
    _sbkRows = await window.SyDentBlocks.load(currentUser.id, _sbkYmd(a), _sbkYmd(b));
  }
  if (typeof render === 'function') render();
}

function sbkToggleAllDay() {
  var all = _sbkEl('sbkAllDay').checked;
  _sbkEl('sbkTimesWrap').style.opacity = all ? '.45' : '1';
  _sbkEl('sbkStart').disabled = all; _sbkEl('sbkEnd').disabled = all;
}

function _sbkReset(dateYmd) {
  _sbkEditingId = null;
  _sbkEl('sbkHeading').textContent = 'حجز وقت على التقويم';
  _sbkEl('sbkSaveBtn').textContent = 'حفظ';
  _sbkEl('sbkTitle').value = ''; _sbkEl('sbkKind').value = 'break'; _sbkEl('sbkNotes').value = '';
  /* الافتراضي فارغ (قرار المالك): «من» فارغ = من اليوم · «إلى» فارغ = بلا نهاية — فالاستراحة اليومية
     تُحفظ بلا تواريخ وتنطبق تلقائياً على الأيام المحدّدة. dateYmd يُملأ فقط عند الفتح من يومٍ بعينه. */
  _sbkEl('sbkFrom').value = dateYmd || ''; _sbkEl('sbkTo').value = dateYmd || '';
  Array.prototype.forEach.call(document.querySelectorAll('.sbk-wd'), function (c) { c.checked = false; });
  _sbkEl('sbkAllDay').checked = false; _sbkEl('sbkStart').value = '13:00'; _sbkEl('sbkEnd').value = '14:00';
  _sbkEl('sbkOperatory').value = ''; _sbkEl('sbkProvider').value = ''; _sbkEl('sbkBlocks').checked = true;
  _sbkEl('sbkErr').style.display = 'none';
  sbkToggleAllDay();
}

function _sbkFill(b) {
  _sbkReset();
  _sbkEditingId = b.id;
  _sbkEl('sbkHeading').textContent = 'تعديل الحجز';
  _sbkEl('sbkSaveBtn').textContent = 'حفظ التعديلات';
  _sbkEl('sbkTitle').value = b.title || ''; _sbkEl('sbkKind').value = b.kind || 'other'; _sbkEl('sbkNotes').value = b.notes || '';
  _sbkEl('sbkFrom').value = b.date_from || ''; _sbkEl('sbkTo').value = b.date_to || '';
  Array.prototype.forEach.call(document.querySelectorAll('.sbk-wd'), function (c) { c.checked = Array.isArray(b.weekdays) && b.weekdays.indexOf(parseInt(c.value, 10)) !== -1; });
  var allDay = !b.start_time || !b.end_time;
  _sbkEl('sbkAllDay').checked = allDay;
  if (!allDay) { _sbkEl('sbkStart').value = String(b.start_time).slice(0, 5); _sbkEl('sbkEnd').value = String(b.end_time).slice(0, 5); }
  _sbkEl('sbkOperatory').value = b.operatory_id || ''; _sbkEl('sbkProvider').value = b.provider_id || '';
  _sbkEl('sbkBlocks').checked = b.blocks_scheduling !== false;
  sbkToggleAllDay();
}

/* فتحٌ عام (زرّ الرأس بالمواعيد · زرّ بطاقة الحجز الإلكتروني بالإعدادات) أو للتعديل (نقرةٌ على فترةٍ بالعرض) */
async function openBlockModal(blockId) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب: وضعُ القراءة */
  if (!_sbkOk()) return;
  _sbkEnsureModal();
  await _sbkLoadPickers();
  if (typeof loadBlocks !== 'function' && !_sbkRows.length) await _sbkReload();
  var row = blockId ? _sbkRowsNow().find(function (b) { return b.id === blockId; }) : null;
  if (row) _sbkFill(row); else _sbkReset();
  renderBlockList();
  _sbkEl('schedBlockModal').classList.add('open');   /* عُدّةُ النوافذ تفتح بـopen (كـwaitlistModal) */
  setTimeout(function () { try { _sbkEl('sbkTitle').focus(); } catch (e) {} }, 60);
}
function closeBlockModal() { var m = _sbkEl('schedBlockModal'); if (m) m.classList.remove('open'); }

/* يجمع النموذج ⇒ صفٌّ للإدخال، أو {error} */
function _sbkCollect() {
  var title = (_sbkEl('sbkTitle').value || '').trim();
  var from = _sbkEl('sbkFrom').value, to = _sbkEl('sbkTo').value;
  var allDay = _sbkEl('sbkAllDay').checked;
  var st = _sbkEl('sbkStart').value, en = _sbkEl('sbkEnd').value;
  var wd = Array.prototype.filter.call(document.querySelectorAll('.sbk-wd'), function (c) { return c.checked; }).map(function (c) { return parseInt(c.value, 10); });
  if (!title) return { error: 'اكتب عنواناً للحجز.' };
  if (!from) {   /* «من» فارغ = من اليوم عند الإنشاء؛ وعند التعديل يبقى تاريخُ البداية الأصلي (لا يُزاح حجزٌ مستقبلي إلى اليوم بصمت) */
    var _orig = _sbkEditingId ? _sbkRowsNow().find(function (x) { return x.id === _sbkEditingId; }) : null;
    from = (_orig && _orig.date_from) || _sbkYmd(new Date());
  }
  if (to && to < from) return { error: 'تاريخُ النهاية قبل البداية.' };
  if (to && _sbkDaysBetween(from, to) > 366) return { error: 'المدى الأقصى سنة — اترك «إلى» فارغاً للحجز الدائم.' };
  if (!allDay) {
    if (!st || !en) return { error: 'حدّد وقت البداية والنهاية أو اختر «يومٌ كامل».' };
    if (en <= st) return { error: 'وقتُ النهاية يجب أن يكون بعد البداية.' };
  }
  return {
    row: {
      doctor_id: currentUser.id, title: title, kind: _sbkEl('sbkKind').value || 'other',
      date_from: from, date_to: to || null, weekdays: wd.length ? wd : null,   /* M155: NULL = بلا نهاية */
      start_time: allDay ? null : st, end_time: allDay ? null : en,
      operatory_id: _sbkEl('sbkOperatory').value || null, provider_id: _sbkEl('sbkProvider').value || null,
      blocks_scheduling: _sbkEl('sbkBlocks').checked, notes: (_sbkEl('sbkNotes').value || '').trim() || null
    }
  };
}

async function saveBlock() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  if (!_sbkOk()) return;
  var c = _sbkCollect();
  var err = _sbkEl('sbkErr');
  if (c.error) { err.textContent = c.error; err.style.display = 'block'; return; }
  err.style.display = 'none';
  var btn = _sbkEl('sbkSaveBtn'); btn.disabled = true;
  try {
    var q = _sbkEditingId
      ? window.sb.from('schedule_blocks').update(c.row).eq('id', _sbkEditingId).eq('doctor_id', currentUser.id)
      : window.sb.from('schedule_blocks').insert(c.row);
    var r = await q;
    if (r.error) { err.textContent = 'تعذّر الحفظ: ' + (r.error.message || ''); err.style.display = 'block'; return; }
    _sbkToast(_sbkEditingId ? '✅ عُدّل الحجز' : '✅ حُجز الوقت');
    await _sbkReload();
    _sbkReset(); renderBlockList();
  } catch (e) { err.textContent = 'تعذّر الحفظ.'; err.style.display = 'block'; }
  finally { btn.disabled = false; }
}

async function deleteBlock(id) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;   /* M141-ب */
  if (!_sbkOk()) return;
  var b = _sbkRowsNow().find(function (x) { return x.id === id; });
  var okGo = await window.SyDialog.confirm({ title: 'حذف الحجز', message: 'حذف «' + ((b && b.title) || '') + '»؟ ستعود أوقاتُه متاحةً للحجز.', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!okGo) return;
  var r = await window.sb.from('schedule_blocks').delete().eq('id', id).eq('doctor_id', currentUser.id);
  if (r.error) { _sbkToast('❌ تعذّر الحذف'); return; }
  _sbkToast('🗑 حُذف الحجز');
  if (_sbkEditingId === id) _sbkReset();
  await _sbkReload(); renderBlockList();
}

function _sbkScopeText(b) {
  var parts = [];
  var ops = (typeof OPERATORIES_ALL !== 'undefined' && Array.isArray(OPERATORIES_ALL)) ? OPERATORIES_ALL : (_sbkOps || []);
  var provs = (typeof CLINIC_DOCTORS !== 'undefined' && Array.isArray(CLINIC_DOCTORS)) ? CLINIC_DOCTORS : (_sbkProvs || []);
  if (b.operatory_id) { var o = ops.find(function (x) { return x.id === b.operatory_id; }); parts.push('الكرسي ' + ((o && o.name) || '')); }
  if (b.provider_id) { var d = provs.find(function (x) { return x.id === b.provider_id; }); parts.push('الطبيب ' + ((d && d.name) || '')); }
  return parts.length ? parts.join(' · ') : 'كل العيادة';
}
function _sbkMin(t) { return parseInt(t, 10) * 60 + parseInt(String(t).slice(3, 5), 10); }
function _sbkWhenText(b) {
  var K = window.SyDentBlocks, nd = function (d) { return (window.SyDT && SyDT.numDate(d)) || d; };
  var dates = !b.date_to ? ('من ' + nd(b.date_from) + ' — دائم') : (b.date_from === b.date_to ? nd(b.date_from) : (nd(b.date_from) + ' ← ' + nd(b.date_to)));
  var days = Array.isArray(b.weekdays) && b.weekdays.length ? ' (' + b.weekdays.slice().sort().map(function (d) { return SBK_DAYS[d]; }).join('، ') + ')' : '';
  var time = (!b.start_time || !b.end_time) ? 'يومٌ كامل' : ('\u2066' + K.fmt12(_sbkMin(b.start_time)) + '\u2060–\u2060' + K.fmt12(_sbkMin(b.end_time)) + '\u2069');
  return dates + days + ' · ' + time;
}

/* قائمةُ الحجوزات التي لم تنتهِ بعد (date_to ≥ اليوم أو دائم) */
function renderBlockList() {
  var el = _sbkEl('sbkList'); if (!el) return;
  var today = _sbkYmd(new Date());
  var list = _sbkRowsNow().filter(function (b) { return !b.date_to || b.date_to >= today; });
  if (!list.length) { el.innerHTML = '<div class="sbk-empty">لا حجوزاتٍ قادمة</div>'; return; }
  var K = window.SyDentBlocks;
  el.innerHTML = list.map(function (b) {
    var kind = K.KINDS[b.kind] || K.KINDS.other;
    return '<div class="sbk-row' + (_sbkEditingId === b.id ? ' sbk-row-editing' : '') + '">'
      + '<div class="sbk-row-main">'
      + '<div class="sbk-row-title">' + _sbkEsc(kind.icon + ' ' + (b.title || '')) + (b.blocks_scheduling === false ? ' <span class="sbk-soft-tag">(لا يمنع)</span>' : '') + '</div>'
      + '<div class="sbk-row-meta">' + _sbkEsc(_sbkWhenText(b)) + ' · ' + _sbkEsc(_sbkScopeText(b)) + '</div>'
      + '</div>'
      + '<div class="sy-acts">'
      + '<button type="button" class="sy-act" data-sub-write onclick="openBlockModal(\'' + _sbkEsc(b.id) + '\')">تعديل</button>'
      + '<button type="button" class="sy-act sy-act-danger" data-sub-write onclick="deleteBlock(\'' + _sbkEsc(b.id) + '\')">حذف</button>'
      + '</div></div>';
  }).join('');
}
/* SYDENT_APPT_BLOCKS_END */
