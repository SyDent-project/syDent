/* ════════════════════════════════════════════════════════════════════
   pp-xray.js — الأشعة داخل المنصة (ج1 · M192 · v635)
   فوق تبويب «الملفات» نفسه (SyDentFiles · حاوية patient-files · المسار {owner}/{patient}/…) — لا حاويةَ ولا عزلَ جديد.
   • ورقةُ الرفع: الصورُ المختارة (سحب · لصق · اختيار متعدد · كاميرا) + نوعُ الصورة + أسنانُها من مخططٍ مصغّر
     + تاريخُ الالتقاط + المصدر (العيادة / مركز أشعة) + رابطُ CBCT اختياري — وسمٌ واحد للدفعة، والتعديلُ لكل صورة لاحقاً.
   • الرفعُ متتابع بحصّةٍ مشتركة (سؤالُ الخادم مرةً للدفعة) · امتلاءٌ ⇒ يتوقّف الباقي برسالةٍ واضحة · الفاشلُ يبقى
     بالورقة لإعادة المحاولة · الناجحُ يُسجَّل بسجل النشاط.
   • عدّادُ التخزين بالتبويب + تنظيفُ الملفات اليتيمة (للمالك).
   القاعدة: لا كتابةَ بوضع القراءة (blockReadOnly أولَ سطر بكل مدخل كتابة) · لا نوافذَ أصلية · النصوصُ مهرَّبة.
   ════════════════════════════════════════════════════════════════════ */
var XR_TYPE_ORDER = ['periapical', 'bitewing', 'panoramic', 'cephalometric', 'other'];
var XR_PERM = { ur: [18, 17, 16, 15, 14, 13, 12, 11], ul: [21, 22, 23, 24, 25, 26, 27, 28],
                lr: [48, 47, 46, 45, 44, 43, 42, 41], ll: [31, 32, 33, 34, 35, 36, 37, 38] };
var XR_PRIM = { ur: [55, 54, 53, 52, 51], ul: [61, 62, 63, 64, 65], lr: [85, 84, 83, 82, 81], ll: [71, 72, 73, 74, 75] };
var _xrUp = { files: [], urls: [], type: 'periapical', teeth: [], primary: false, editRow: null, busy: false, results: {} };

function xrDamToday() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
function xrTypeLabel(t) { return (window.SyDentFiles && SyDentFiles.XRAY_TYPES[t]) || ''; }
function xrSortTeeth(arr) { return arr.slice().sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); }); }

/* ── المخططُ المصغّر لاختيار الأسنان (FDI · منظرُ الطبيب: يمينُ المريض يسارَ الشاشة ⇒ LTR) ── */
function xrChartHtml() {
  var Q = _xrUp.primary ? XR_PRIM : XR_PERM, sel = _xrUp.teeth;
  function btn(n) {
    var on = sel.indexOf(String(n)) > -1;
    return '<button type="button" class="xr-t' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="xrToggleTooth(\'' + n + '\')">' + n + '</button>';
  }
  function row(a, b) { return '<div class="xr-row">' + a.map(btn).join('') + '<span class="xr-mid"></span>' + b.map(btn).join('') + '</div>'; }
  return '<div class="xr-chart" dir="ltr">' + row(Q.ur, Q.ul) + '<div class="xr-occ"></div>' + row(Q.lr, Q.ll) + '</div>';
}
function xrPaintTeeth() {
  var box = document.getElementById('xrUpTeeth');
  if (box) box.innerHTML = xrChartHtml();
  var sum = document.getElementById('xrUpTeethSum');
  if (sum) sum.textContent = _xrUp.teeth.length ? ('الأسنان: ' + xrSortTeeth(_xrUp.teeth).join('، ')) : 'بلا أسنان محدّدة (اختياري للبانوراما والسيفالومترية)';
  var pr = document.getElementById('xrUpPrimary');
  if (pr) { pr.classList.toggle('on', _xrUp.primary); pr.setAttribute('aria-pressed', _xrUp.primary ? 'true' : 'false'); }
}
function xrToggleTooth(n) {
  n = String(n);
  var i = _xrUp.teeth.indexOf(n);
  if (i > -1) _xrUp.teeth.splice(i, 1); else _xrUp.teeth.push(n);
  xrPaintTeeth();
}
function xrTeethQuick(which) {
  var Q = _xrUp.primary ? XR_PRIM : XR_PERM, add = [];
  if (which === 'upper') add = Q.ur.concat(Q.ul);
  else if (which === 'lower') add = Q.lr.concat(Q.ll);
  if (which === 'clear') _xrUp.teeth = [];
  else add.forEach(function (n) { if (_xrUp.teeth.indexOf(String(n)) < 0) _xrUp.teeth.push(String(n)); });
  xrPaintTeeth();
}
function xrTogglePrimary() { _xrUp.primary = !_xrUp.primary; xrPaintTeeth(); }

function xrPaintTypes() {
  var box = document.getElementById('xrUpTypes');
  if (!box) return;
  box.innerHTML = XR_TYPE_ORDER.map(function (t) {
    var on = _xrUp.type === t;
    return '<button type="button" class="xr-pill' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="xrSetType(\'' + t + '\')">' + escapeHtml(xrTypeLabel(t)) + '</button>';
  }).join('');
}
function xrSetType(t) { if (XR_TYPE_ORDER.indexOf(t) > -1) { _xrUp.type = t; xrPaintTypes(); } }

function xrSetSource(src) {
  ['clinic', 'center'].forEach(function (s) {
    var b = document.getElementById('xrUpSrc_' + s);
    if (b) { b.classList.toggle('on', s === src); b.setAttribute('aria-pressed', s === src ? 'true' : 'false'); }
  });
  var w = document.getElementById('xrUpSrcNameWrap');
  if (w) w.style.display = src === 'center' ? '' : 'none';
  _xrUp.source = src;
}

/* ── قائمةُ الملفات بالورقة (مصغّراتٌ محلية · الحالةُ لكل ملف) ── */
function xrPaintFiles() {
  var box = document.getElementById('xrUpFiles');
  if (!box) return;
  if (_xrUp.editRow) {
    var r = _xrUp.editRow;
    box.innerHTML = '<div class="xr-file"><div class="xr-thumb">' + (r._url ? '<img src="' + escapeHtml(r._url) + '" alt="">' : '🩻') + '</div>' +
      '<div class="xr-fname" title="' + escapeHtml(r.file_name || '') + '">' + escapeHtml(r.file_name || '') + '</div></div>';
    return;
  }
  var addTile = _xrUp.busy ? '' : '<button type="button" class="xr-file xr-add" onclick="document.getElementById(\'xrUpPick\').click()">' +
    '<span class="xr-add-i">➕</span><span>' + (_xrUp.files.length ? 'أضف صوراً' : 'اختر صور الأشعة') + '</span></button>';
  box.innerHTML = _xrUp.files.map(function (f, i) {
    var res = _xrUp.results[i], url = _xrUp.urls[i];
    var dicom = window.SyDentFiles && SyDentFiles.isDicomName(f.name);
    var thumb = url ? '<img src="' + escapeHtml(url) + '" alt="">' : (dicom ? '<span class="xr-dcm">DICOM</span>' : '📄');
    var st = !res ? '' : res.ok ? '<div class="xr-st ok">✓ رُفعت</div>'
           : res.wait ? '<div class="xr-st">⏳ جارٍ الرفع…</div>'
           : '<div class="xr-st bad">✗ ' + escapeHtml(res.reason === 'quota' ? 'امتلأت مساحة التخزين' : SyDentFiles.message(res)) + '</div>';   /* الرسالةُ الكاملة بالتوست */
    var rm = (_xrUp.busy || (res && res.ok)) ? '' : '<button type="button" class="xr-rm" title="إزالة من الدفعة" onclick="xrUpRemoveFile(' + i + ')">✕</button>';
    return '<div class="xr-file' + (res && res.ok ? ' done' : '') + '"><div class="xr-thumb">' + thumb + '</div>' + rm +
      '<div class="xr-fname" title="' + escapeHtml(f.name || '') + '">' + escapeHtml(f.name || '') + '</div>' +
      '<div class="xr-fsize">' + escapeHtml(SyDentFiles.humanBytes(f.size)) + '</div>' + st + '</div>';
  }).join('') + addTile;
  var go = document.getElementById('xrUpGo');
  var left = _xrUp.files.filter(function (f, i) { return !(_xrUp.results[i] && _xrUp.results[i].ok); }).length;
  if (go) { go.textContent = _xrUp.busy ? 'جارٍ الرفع…' : ('⬆️ رفع ' + left + (left === 1 ? ' صورة' : ' صور')); go.disabled = _xrUp.busy || !left; }
}
function xrUpRemoveFile(i) {
  if (_xrUp.busy) return;
  try { if (_xrUp.urls[i]) URL.revokeObjectURL(_xrUp.urls[i]); } catch (e) {}
  _xrUp.files.splice(i, 1); _xrUp.urls.splice(i, 1);
  var res = {}; Object.keys(_xrUp.results).forEach(function (k) { k = +k; if (k < i) res[k] = _xrUp.results[k]; else if (k > i) res[k - 1] = _xrUp.results[k]; });
  _xrUp.results = res;
  xrPaintFiles();
}
function xrRevokeUrls() { _xrUp.urls.forEach(function (u) { try { if (u) URL.revokeObjectURL(u); } catch (e) {} }); _xrUp.urls = []; }

/* بانوراما ⇐ نسبةُ العرض للارتفاع ≥ 1.8 (تخمينٌ لطيف يغيّره الطبيب بنقرة) */
function xrGuessType(file, url) {
  return new Promise(function (res) {
    if (!url) return res(null);
    var im = new Image();
    im.onload = function () { res(im.naturalHeight && im.naturalWidth / im.naturalHeight >= 1.8 ? 'panoramic' : null); };
    im.onerror = function () { res(null); };
    im.src = url;
  });
}

/* ── فتحُ الورقة: رفعُ دفعة (files) أو تعديلُ وسم صورة (row) ── */
async function xrOpenUpload(fileList, row, preset) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (!window.SyDentFiles) { showToast('الميزة غير متاحة', true); return; }
  if (_xrUp.busy) return;
  xrRevokeUrls();
  _xrUp.results = {}; _xrUp.editRow = row || null; _xrUp.primary = false;
  _xrUp.sessionId = (preset && preset.sessionId) || null;   // v637: صورةُ جلسة «أشعة» تُربط بها
  _xrUp.category = row ? (row.category === 'clinical_photo' ? 'clinical_photo' : 'xray') : ((preset && preset.category === 'clinical_photo') ? 'clinical_photo' : 'xray');   // v642
  if (row) {
    _xrUp.files = [];
    _xrUp.type = row.xray_type || 'periapical';
    _xrUp.teeth = (row.teeth || []).map(String);
    _xrUp.primary = _xrUp.teeth.some(function (t) { return /^[5-8]/.test(t); });
    _xrUp.editRow._url = (typeof _pfUrls !== 'undefined' && _pfUrls[row.storage_path]) || '';
  } else {
    var all = Array.prototype.slice.call(fileList || []), ok = [], rejected = [];
    for (var i = 0; i < all.length; i++) {
      var c = await SyDentFiles.check(all[i], (preset && preset.category) || 'xray');
      if (c.ok) ok.push(all[i]); else rejected.push(SyDentFiles.message(c) + ': ' + (all[i].name || ''));
    }
    if (rejected.length) showToast('⚠️ ' + rejected[0] + (rejected.length > 1 ? ' (+' + (rejected.length - 1) + ')' : ''), true);
    if (!ok.length && !preset) return;
    _xrUp.files = ok;
    _xrUp.urls = ok.map(function (f) { return /^image\//.test(f.type) ? URL.createObjectURL(f) : ''; });
    var tooth = (preset && preset.teeth) ? '' : ((document.getElementById('pfUploadTooth') || {}).value || '');
    _xrUp.teeth = (preset && preset.teeth) ? preset.teeth.map(String) : (tooth ? [tooth] : []);
    _xrUp.primary = _xrUp.teeth.some(function (t) { return /^[5-8]/.test(t); });
    _xrUp.type = (ok.length && await xrGuessType(ok[0], _xrUp.urls[0])) || 'periapical';
  }
  var photo = _xrUp.category === 'clinical_photo';
  document.getElementById('xrUpTitle').textContent = photo ? (row ? '✏️ وسم الصورة السريرية' : '📷 صور سريرية') : (row ? '✏️ وسم صورة الأشعة' : '🩻 رفع أشعة');
  document.getElementById('xrUpTypeGroup').style.display = photo ? 'none' : '';
  document.getElementById('xrUpSrcGroup').style.display = photo ? 'none' : '';
  document.getElementById('xrUpCbctWrap').style.display = photo ? 'none' : '';
  var d = document.getElementById('xrUpDate');
  d.max = xrDamToday();
  d.value = row ? (row.taken_at || String(row.created_at || '').slice(0, 10)) : xrDamToday();
  try { d.dispatchEvent(new Event('change')); } catch (e) {}
  document.getElementById('xrUpSrcName').value = row ? (row.source_name || '') : '';
  document.getElementById('xrUpCbct').value = row ? (row.cbct_url || '') : '';
  document.getElementById('xrUpCbctWrap').open = !!(row && row.cbct_url);
  xrSetSource(row ? (row.source || 'clinic') : 'clinic');
  var go = document.getElementById('xrUpGo');
  go.disabled = false;
  if (row) go.textContent = '💾 حفظ الوسم';
  xrPaintTypes(); xrPaintTeeth(); xrPaintFiles();
  openModal('xrUpModal');
}
function xrUpClose() {
  if (_xrUp.busy) return;
  closeModal('xrUpModal');
  xrRevokeUrls(); _xrUp.files = []; _xrUp.results = {}; _xrUp.editRow = null; _xrUp.sessionId = null;
}
/* v637: إضافةُ صورٍ من داخل الورقة (منتقٍ بنقرةٍ حقيقية ⇒ يعمل بسفاري الآيفون بعد حوار التأكيد) */
async function xrUpAddFiles(list) {
  if (_xrUp.busy || _xrUp.editRow) return;
  var all = Array.prototype.slice.call(list || []), rejected = [];
  for (var i = 0; i < all.length; i++) {
    var c = await SyDentFiles.check(all[i], 'xray');
    if (!c.ok) { rejected.push(SyDentFiles.message(c) + ': ' + (all[i].name || '')); continue; }
    _xrUp.files.push(all[i]); _xrUp.urls.push(/^image\//.test(all[i].type) ? URL.createObjectURL(all[i]) : '');
  }
  if (rejected.length) showToast('⚠️ ' + rejected[0] + (rejected.length > 1 ? ' (+' + (rejected.length - 1) + ')' : ''), true);
  if (_xrUp.files.length === all.length - rejected.length && _xrUp.files.length) {
    var g = await xrGuessType(_xrUp.files[0], _xrUp.urls[0]); if (g) { _xrUp.type = g; xrPaintTypes(); }
  }
  xrPaintFiles();
}

/* ── v637: معرضُ السن (شارةُ المخطط) أو كلِّ الأشعة — مرتّبٌ بتاريخ الالتقاط، وانتقاءُ صورتين للمقارنة ── */
var _xrGal = { tooth: null, all: false, list: [], pick: [] };
async function xrOpenGallery(o) {
  o = o || {};
  if (!_pfLoaded) await loadPatientFiles();
  _xrGal.tooth = o.tooth ? String(o.tooth) : null; _xrGal.all = !!o.all; _xrGal.pick = [];
  document.getElementById('xrGalTitle').textContent = _xrGal.tooth ? ('🦷 صور السن ' + _xrGal.tooth) : '⚖️ اختر صورتين للمقارنة';
  xrGalPaint();
  openModal('xrGalModal');
}
function xrGalList() {
  var day = function (f) { return f.taken_at || String(f.created_at || '').slice(0, 10); };
  return (_pfFiles || []).filter(function (f) {
    if (!pfViewable(f)) return false;
    if (_xrGal.tooth) return pfHasTooth(f, _xrGal.tooth);
    return f.category === 'xray';
  }).sort(function (a, b) { var da = day(a), db = day(b); return da < db ? 1 : da > db ? -1 : String(b.created_at || '').localeCompare(String(a.created_at || '')); });
}
function xrGalPaint() {
  _xrGal.list = xrGalList();
  _xrGal.pick = _xrGal.pick.filter(function (id) { return _xrGal.list.some(function (f) { return f.id === id; }); });
  var box = document.getElementById('xrGalGrid');
  if (!_xrGal.list.length) {
    box.innerHTML = '<div class="xr-gal-empty">لا صور ' + (_xrGal.tooth ? 'لهذا السن بعد.' : 'أشعة بعد.') + '</div>';
  } else {
    box.innerHTML = _xrGal.list.map(function (f) {
      var url = _pfUrls[f.storage_path] || '', on = _xrGal.pick.indexOf(f.id) > -1;
      var thumb = (SyDentFiles.isImage(f.mime_type) && url) ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy">' : '<span class="xr-dcm">' + (f.mime_type === 'application/dicom' ? 'DICOM' : '📄') + '</span>';
      var d = f.taken_at || String(f.created_at || '').slice(0, 10);
      return '<div class="xr-gal-card' + (on ? ' on' : '') + '">' +
        '<button type="button" class="xr-gal-thumb" onclick="xrGalView(\'' + f.id + '\')" title="عرض">' + thumb + '</button>' +
        '<div class="xr-gal-meta"><b>' + escapeHtml(SyDT.numDate(d)) + '</b>' + (f.xray_type ? ' · ' + escapeHtml(SyDentFiles.XRAY_TYPES[f.xray_type] || '') : '') + '</div>' +
        '<label class="xr-gal-pick"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="xrGalPick(\'' + f.id + '\', this.checked)"> للمقارنة</label>' +
        '</div>';
    }).join('');
  }
  var n = _xrGal.pick.length, cmp = document.getElementById('xrGalCmp');
  cmp.disabled = n !== 2;
  cmp.textContent = n === 2 ? '⚖️ قارن الصورتين' : ('⚖️ مقارنة (' + n + '/2)');
  document.getElementById('xrGalHint').textContent = _xrGal.list.length < 2 ? '' : 'اختر صورتين (قبل وبعد) ثم «قارن» — أو انقر صورةً لعرضها.';
  document.getElementById('xrGalAdd').style.display = _xrGal.tooth ? '' : 'none';
}
function xrGalPick(id, on) {
  var i = _xrGal.pick.indexOf(id);
  if (on && i < 0) { _xrGal.pick.push(id); if (_xrGal.pick.length > 2) _xrGal.pick.shift(); }   // الثالثةُ تُزيح الأقدمَ اختياراً
  if (!on && i > -1) _xrGal.pick.splice(i, 1);
  xrGalPaint();
}
function xrGalReopen() { if (_xrGal.list.length || _xrGal.tooth) { xrGalPaint(); openModal('xrGalModal'); } }
function xrGalView(id) {
  var idx = _xrGal.list.findIndex(function (f) { return f.id === id; });
  if (idx < 0 || !window.SyXrayViewer) return;
  closeModal('xrGalModal');   // العارضُ تحت النوافذ (995 < 1000) ⇒ يُغلق المعرضُ ويعود عند إغلاق العارض
  window.SyXrayViewer.open({ docs: _xrGal.list.slice(), index: idx, urlFor: pfUrlFor, onSaved: pfOnViewerSaved, onClose: xrGalReopen });
}
function xrGalCompare() {
  if (_xrGal.pick.length !== 2 || !window.SyXrayViewer) return;
  var docs = _xrGal.pick.map(function (id) { return _xrGal.list.find(function (f) { return f.id === id; }); }).filter(Boolean);
  if (docs.length !== 2) return;
  closeModal('xrGalModal');
  window.SyXrayViewer.compare({ docs: docs, urlFor: pfUrlFor, onClose: xrGalReopen });
}
function xrGalAttach() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (!_xrGal.tooth) return;
  closeModal('xrGalModal');
  xrOpenUpload(null, null, { teeth: [_xrGal.tooth] });
}
function xrGalCam() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var tooth = _xrGal.tooth;
  closeModal('xrGalModal');
  xrCamOpen({ teeth: tooth ? [tooth] : [] });
}
function xrGalToFiles() {
  closeModal('xrGalModal');
  _pfToothFilter = _xrGal.tooth || ''; _pfSeg = _xrGal.tooth ? 'all' : 'xray';
  _xrGal.list = []; _xrGal.tooth = null;
  switchTabByName('files');
}
function xrGalClose() { closeModal('xrGalModal'); _xrGal.list = []; _xrGal.tooth = null; _xrGal.pick = []; }
/* v637: بعد جلسة «أشعة» منجزةٍ على سن — عرضُ إرفاق صورتها (مربوطةً بالسن وبالجلسة). حوارٌ لا إلزام. */
async function xrAttachForSession(tooth, sessionId) {
  if (!tooth || !sessionId || (window.SyDentSub && window.SyDentSub.isReadOnly && window.SyDentSub.isReadOnly())) return;
  var yes = await SyDialog.confirm({ title: '🩻 إرفاق صورة الأشعة', message: 'سُجّلت جلسة أشعة للسن ' + tooth + '.\nأترفق صورتها الآن؟ تُربط بالسن وبالجلسة.', confirmText: '📎 إرفاق الآن', cancelText: 'لاحقاً' });
  if (yes) xrOpenUpload(null, null, { teeth: [String(tooth)], sessionId: sessionId });
}

function xrReadMeta() {
  var date = (document.getElementById('xrUpDate') || {}).value || '';
  var cbct = ((document.getElementById('xrUpCbct') || {}).value || '').trim();
  var name = ((document.getElementById('xrUpSrcName') || {}).value || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { err: 'تاريخ الالتقاط غير صالح' };
  if (date && date > xrDamToday()) return { err: 'تاريخ الالتقاط في المستقبل' };
  if (cbct && !/^https:\/\/[^\s<>"]+$/.test(cbct)) return { err: 'رابط CBCT يجب أن يبدأ بـ https://' };
  if (cbct.length > 2000) return { err: 'رابط CBCT طويل جداً' };
  if (_xrUp.category === 'clinical_photo') return { type: null, teeth: xrSortTeeth(_xrUp.teeth), takenAt: date || null, source: null, sourceName: '', cbctUrl: null };
  return { type: _xrUp.type, teeth: xrSortTeeth(_xrUp.teeth), takenAt: date || null, source: _xrUp.source || 'clinic',
           sourceName: _xrUp.source === 'center' ? name.slice(0, 120) : '', cbctUrl: cbct || null };
}

async function xrUpSubmit() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (_xrUp.busy) return;
  var m = xrReadMeta();
  if (m.err) { showToast('⚠️ ' + m.err, true); return; }
  if (_xrUp.editRow) {   // تعديلُ وسم صورةٍ موجودة
    _xrUp.busy = true;
    var r0 = await SyDentFiles.updateMeta(_xrUp.editRow.id, _xrUp.category === 'clinical_photo'
      ? { teeth: m.teeth, taken_at: m.takenAt }
      : { xray_type: m.type, teeth: m.teeth, taken_at: m.takenAt, source: m.source, source_name: m.sourceName || null, cbct_url: m.cbctUrl });
    _xrUp.busy = false;
    if (!r0.ok) { showToast('❌ ' + (r0.reason === 'db' ? 'تعذّر حفظ الوسم' : SyDentFiles.message(r0)), true); return; }
    if (window.logAudit) { try { window.logAudit('patient.file_upload', { patientId: patientId, patientName: (patient && patient.name) || null,
      description: 'تعديل وسم أشعة: ' + (_xrUp.editRow.file_name || '') + ' (' + xrTypeLabel(m.type) + (m.teeth.length ? ' · ' + m.teeth.join('،') : '') + ')' }); } catch (e) {} }
    xrUpClose(); showToast('✓ حُفظ الوسم');
    await loadPatientFiles();
    return;
  }
  if (!_xrUp.files.length) { showToast('اختر صورة واحدة على الأقل', true); return; }
  _xrUp.busy = true; xrPaintFiles();
  var usage = await SyDentFiles.usage();   // مرةً للدفعة — upload يحدّثها بعد كل ملف
  var done = 0, failed = 0, stopped = null;
  for (var i = 0; i < _xrUp.files.length; i++) {
    if (_xrUp.results[i] && _xrUp.results[i].ok) continue;
    if (stopped) { _xrUp.results[i] = stopped; failed++; continue; }
    _xrUp.results[i] = { wait: true }; xrPaintFiles();
    var f = _xrUp.files[i], r;
    try {
      r = await SyDentFiles.upload(patientId, f, { category: _xrUp.category || 'xray', usage: usage, teeth: m.teeth, xrayType: m.type, takenAt: m.takenAt,
        source: m.source, sourceName: m.sourceName, cbctUrl: m.cbctUrl, sessionId: _xrUp.sessionId || null });
    } catch (e) { r = { ok: false, reason: 'storage', error: e }; }
    _xrUp.results[i] = r.ok ? { ok: true } : r;
    if (r.ok) {
      done++;
      if (window.logAudit) { try { window.logAudit('patient.file_upload', { patientId: patientId, patientName: (patient && patient.name) || null,
        description: 'رفع أشعة: ' + (f.name || '') + ' (' + xrTypeLabel(m.type) + (m.teeth.length ? ' · السن ' + m.teeth.join('،') : '') + ')' }); } catch (e) {} }
    } else {
      failed++;
      console.error('xray upload failed', r);
      if (r.reason === 'quota' || r.reason === 'offline' || r.reason === 'read') stopped = { ok: false, reason: r.reason, usage: r.usage };   // الباقي لن ينجح
    }
    xrPaintFiles();
  }
  _xrUp.busy = false;
  if (!failed) {
    xrUpClose();
    showToast('✓ رُفعت ' + (done === 1 ? 'صورةٌ واحدة' : done + ' صور'));
  } else {
    xrPaintFiles();
    var first = null; Object.keys(_xrUp.results).forEach(function (k) { var x = _xrUp.results[k]; if (!first && x && !x.ok && !x.wait) first = x; });
    showToast((done ? '✓ رُفعت ' + done + ' — ' : '') + '✗ تعذّر ' + failed + ': ' + SyDentFiles.message(first), true);
  }
  if (done) await loadPatientFiles();   /* يحدّث العدّادَ والشارات معاً */
}

/* ── عدّادُ التخزين بالتبويب (+ تنظيفُ الملفات اليتيمة للمالك) ── */
async function xrUsageRefresh() {
  var el = document.getElementById('pfUsage');
  if (!el || !window.SyDentFiles) return;
  var u = await SyDentFiles.usage();
  if (!u) { el.style.display = 'none'; return; }
  var owner = !window.SyDentLock || !window.SyDentLock.isOwner || window.SyDentLock.isOwner();
  el.innerHTML = SyDentFiles.usageHtml(u) +
    (u.orphans && owner ? '<button type="button" class="sy-act" onclick="pfCleanOrphans()" title="ملفاتٌ بالتخزين لا يشير إليها أي سجل (من مرضى محذوفين سابقاً)">🧹 تنظيف ' + u.orphans + (u.orphans === 1 ? ' ملفٍ يتيم' : ' ملفاتٍ يتيمة') + '</button>' : '');
  el.style.display = '';
}
async function pfCleanOrphans() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (!await SyDialog.confirm({ message: 'حذف الملفات اليتيمة من التخزين؟\nهي ملفاتٌ لا يشير إليها أي سجل (بقيت من مرضى حُذفوا قبل هذا الإصدار) ولا تظهر بأي مكان.', danger: true })) return;
  var r = await SyDentFiles.cleanOrphans();
  showToast(r.ok ? ('🧹 حُذف ' + r.removed + ' ملفاً يتيماً') : ('❌ تعذّر التنظيف' + (r.removed ? ' (حُذف ' + r.removed + ')' : '')), !r.ok);
  if (r.ok && window.logAudit) { try { window.logAudit('patient.file_delete', { description: 'تنظيف ' + r.removed + ' ملفاً يتيماً من التخزين' }); } catch (e) {} }
  xrUsageRefresh();
}

/* ── مداخلُ الرفع: الكاميرا · اللصق ── */
function pfCamPick() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var inp = document.getElementById('pfCamInput');
  if (inp) inp.click();
}
function pfEditXray(id) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var f = (_pfFiles || []).find(function (x) { return x.id === id; });
  if (f) xrOpenUpload(null, f);
}
/* اللصقُ (Ctrl+V من برنامج الحسّاس أو لقطة شاشة) يعمل حين يكون تبويبُ الملفات ظاهراً ولا نافذةَ مفتوحة. مستمعٌ واحد (#752). */
(function () {
  if (window.__xrPasteWired) return;
  window.__xrPasteWired = true;
  document.addEventListener('paste', function (e) {
    var tab = document.getElementById('tab-files');
    if (!tab || !tab.classList.contains('active')) return;
    if (document.querySelector('.modal-overlay.open, .modal-overlay.show')) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    var files = [];
    var items = (e.clipboardData && e.clipboardData.files) || [];
    for (var i = 0; i < items.length; i++) files.push(items[i]);
    if (!files.length) return;
    e.preventDefault();
    if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
    var named = files.map(function (f, k) {
      if (f.name && f.name !== 'image.png') return f;
      try { return new File([f], 'لصق-' + xrDamToday() + '-' + (k + 1) + '.png', { type: f.type || 'image/png' }); } catch (x) { return f; }
    });
    pfOnFilesPicked(named);
  });
})();

/* ── v642: كاميرا الفم (UVC) بالمتصفح — getUserMedia · معاينةٌ حيّة · التقاطٌ بالزر أو Space/Enter · اللقطاتُ ⇒ ورقةُ الوسم كصور سريرية ──
   لا مكتبة. الكاميراتُ المتعدّدة بقائمة، والمختارةُ تُذكر على هذا الجهاز. الصورةُ بكامل دقّة البثّ (JPEG 0.92).
   الأخطاءُ بأسمائها: رفضُ السماح · لا كاميرا · مشغولةٌ ببرنامج آخر. البثُّ يُوقف عند الإغلاق أو الإنهاء. */
var _xrCam = { stream: null, shots: [], urls: [], preset: null, mirror: false, busy: false, open: false };
var XR_CAM_KEY = 'sydent.cam.device';
function xrCamSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaStream); }
function xrCamMsgShow(t) { var m = document.getElementById('xrCamMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } }
function xrCamErrText(e) {
  var n = (e && e.name) || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'السماح للكاميرا مرفوض — اضغط أيقونة القفل/الكاميرا بشريط العنوان واسمح لـ sydent.app بالكاميرا ثم أعد المحاولة';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'لا كاميرا موصولة — صِل كاميرا الفم بالـUSB وأعد المحاولة';
  if (n === 'NotReadableError' || n === 'AbortError') return 'الكاميرا مستعملة من برنامج آخر — أغلقه ثم أعد المحاولة';
  return 'تعذّر تشغيل الكاميرا' + (e && e.message ? ' (' + e.message + ')' : '');
}
// الكاميرا المفضّلة: المذكورةُ على هذا الجهاز، وإلا أولُ كاميرا ليست مدمجة/أمامية (كاميرا الفم USB)
function xrCamPickDevice(list, remembered) {
  list = list || [];
  if (remembered && list.some(function (d) { return d.deviceId === remembered; })) return remembered;
  var ext = list.find(function (d) { return !/integrated|built-?in|facetime|front|internal|مدمج/i.test(d.label || ''); });
  return (ext || list[0] || {}).deviceId || '';
}
async function xrCamOpen(preset) {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  if (!xrCamSupported()) { showToast('المتصفح لا يدعم الكاميرا المباشرة — استعمل «تصوير بالكاميرا» أو الرفع', true); return; }
  if (_xrUp.busy) return;
  xrCamRevoke(); _xrCam.shots = []; _xrCam.preset = preset || {}; _xrCam.open = true;
  xrCamPaintShots(); xrCamMsgShow('جارٍ تشغيل الكاميرا…');
  openModal('xrCamModal');
  await xrCamStart(null);
}
async function xrCamStart(deviceId) {
  if (!_xrCam.open) return;
  xrCamStop();
  var remembered = deviceId || (function () { try { return localStorage.getItem(XR_CAM_KEY) || ''; } catch (e) { return ''; } })();
  var video = document.getElementById('xrCamVideo');
  var cons = { audio: false, video: Object.assign({ width: { ideal: 1920 }, height: { ideal: 1080 } }, remembered ? { deviceId: { exact: remembered } } : {}) };
  var stream;
  try { stream = await navigator.mediaDevices.getUserMedia(cons); }
  catch (e) {
    if (remembered && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {   // الكاميرا المذكورة لم تعد موصولة
      try { localStorage.removeItem(XR_CAM_KEY); } catch (x) {}
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }); } catch (e2) { e = e2; }
    }
    if (!stream) { xrCamMsgShow(xrCamErrText(e)); return; }
  }
  if (!_xrCam.open) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
  _xrCam.stream = stream; video.srcObject = stream; xrCamMsgShow('');
  try { await video.play(); } catch (e) {}
  // بعد السماح تظهر أسماءُ الكاميرات ⇒ القائمة
  try {
    var devs = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'videoinput'; });
    var cur = (stream.getVideoTracks()[0] || {}).getSettings ? stream.getVideoTracks()[0].getSettings().deviceId : '';
    var sel = document.getElementById('xrCamDevice');
    sel.innerHTML = devs.map(function (d, i) { return '<option value="' + escapeHtml(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + escapeHtml(d.label || ('كاميرا ' + (i + 1))) + '</option>'; }).join('');
    sel.style.display = devs.length > 1 ? '' : 'none';
    if (cur) { try { localStorage.setItem(XR_CAM_KEY, cur); } catch (e) {} }
    if (!deviceId && !remembered && devs.length > 1) {   // أولُ مرة: فضّل كاميرا الفم الخارجية على المدمجة
      var pref = xrCamPickDevice(devs, '');
      if (pref && pref !== cur) { xrCamStart(pref); return; }
    }
  } catch (e) {}
}
function xrCamStop() {
  if (_xrCam.stream) { _xrCam.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); _xrCam.stream = null; }
  var v = document.getElementById('xrCamVideo'); if (v) v.srcObject = null;
}
function xrCamMirror() {
  _xrCam.mirror = !_xrCam.mirror;
  var v = document.getElementById('xrCamVideo'); if (v) v.classList.toggle('mirror', _xrCam.mirror);
  var b = document.getElementById('xrCamMirror'); if (b) { b.classList.toggle('on', _xrCam.mirror); b.setAttribute('aria-pressed', _xrCam.mirror ? 'true' : 'false'); }
}
function xrCamShot() {
  if (!_xrCam.stream || _xrCam.busy) return;
  var v = document.getElementById('xrCamVideo');
  if (!v || !v.videoWidth) { showToast('الكاميرا لم تبدأ بعد', true); return; }
  if (_xrCam.shots.length >= 30) { showToast('30 لقطة كحدّ للدفعة — أنهِ ثم صوّر دفعةً جديدة', true); return; }
  _xrCam.busy = true;
  var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  var ctx = c.getContext('2d');
  if (_xrCam.mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }   // ما يراه الطبيب هو ما يُحفظ
  ctx.drawImage(v, 0, 0, c.width, c.height);
  var fl = document.getElementById('xrCamFlash'); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
  c.toBlob(function (blob) {
    _xrCam.busy = false;
    if (!blob) { showToast('تعذّر حفظ اللقطة', true); return; }
    var n = _xrCam.shots.length + 1, stamp = xrDamToday() + '-' + new Date().toTimeString().slice(0, 5).replace(':', '');
    var f; try { f = new File([blob], 'كاميرا-' + stamp + '-' + n + '.jpg', { type: 'image/jpeg' }); } catch (e) { f = blob; f.name = 'كاميرا-' + stamp + '-' + n + '.jpg'; }
    _xrCam.shots.push(f); _xrCam.urls.push(URL.createObjectURL(blob));
    xrCamPaintShots();
  }, 'image/jpeg', 0.92);
}
function xrCamPaintShots() {
  var box = document.getElementById('xrCamShots'), done = document.getElementById('xrCamDone');
  if (box) box.innerHTML = _xrCam.shots.map(function (f, i) {
    return '<div class="xr-file"><div class="xr-thumb"><img src="' + escapeHtml(_xrCam.urls[i]) + '" alt=""></div>' +
      '<button type="button" class="xr-rm" title="حذف اللقطة" onclick="xrCamRemove(' + i + ')">✕</button>' +
      '<div class="xr-fname">لقطة ' + (i + 1) + '</div><div class="xr-fsize">' + escapeHtml(SyDentFiles.humanBytes(f.size)) + '</div></div>';
  }).join('');
  if (done) { done.disabled = !_xrCam.shots.length; done.textContent = _xrCam.shots.length ? '✓ إنهاء ووسم ' + _xrCam.shots.length + (_xrCam.shots.length === 1 ? ' لقطة' : ' لقطات') : '✓ إنهاء ووسم اللقطات'; }
}
function xrCamRemove(i) {
  try { URL.revokeObjectURL(_xrCam.urls[i]); } catch (e) {}
  _xrCam.shots.splice(i, 1); _xrCam.urls.splice(i, 1); xrCamPaintShots();
}
function xrCamRevoke() { _xrCam.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); _xrCam.urls = []; }
function xrCamClose() {
  _xrCam.open = false; xrCamStop();
  closeModal('xrCamModal');
  xrCamRevoke(); _xrCam.shots = [];
}
function xrCamDone() {
  if (!_xrCam.shots.length) return;
  var shots = _xrCam.shots.slice(), preset = _xrCam.preset || {};
  _xrCam.open = false; xrCamStop(); closeModal('xrCamModal'); xrCamRevoke(); _xrCam.shots = [];
  xrOpenUpload(shots, null, { category: 'clinical_photo', teeth: preset.teeth || [] });
}
/* Space/Enter تلتقط حين تكون الكاميرا مفتوحة (زرُّ مقبض الكاميرا يُحاكي أحدَهما غالباً) — مستمعٌ واحد (#752) */
(function () {
  if (window.__xrCamKeyWired) return;
  window.__xrCamKeyWired = true;
  document.addEventListener('keydown', function (e) {
    if (!_xrCam.open) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); xrCamShot(); }
  });
})();
function pfLiveCam() {
  if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;
  var tooth = (document.getElementById('pfUploadTooth') || {}).value || '';
  xrCamOpen({ teeth: tooth ? [tooth] : [] });
}
