/* SYDENT_PAYMETHODS_START — طرقُ الدفع: مصدرٌ واحد للمنصة (v508)
   ─────────────────────────────────────────────────────────────
   لماذا: كانت الطرقُ مبعثرةً بثلاث صيغ — دفعاتُ المرضى نصٌّ عربي («نقداً» ·
   «تحويل بنكي» · «أونلاين»)، والمصروفاتُ والرواتبُ رموزٌ (`cash`/`bank`/`check`/`other`)،
   وكلُّ صفحةٍ تحمل قائمتَها وتسمياتِها. كشفُ اليوم يحتاج تجميعاً موحَّداً حسب الطريقة،
   والسوقُ السوري يدفع بالمحافظ الإلكترونية (شام كاش · سيريتل كاش · MTN كاش) ولم تكن
   خياراً أصلاً.

   العقد:
   • `LIST` هي القائمةُ الوحيدة (المفتاحُ الثابت + التسميةُ العربية + هل هي نقدٌ ماديّ).
   • `norm(raw)` تُعيد المفتاحَ لأيِّ قيمةٍ مخزَّنة (رمزٌ أو تسميةٌ عربية، قديمة أو جديدة)؛
     المجهولُ والفارغ ⇒ `other` (لا يُسقَط رقمٌ أبداً).
   • دفعاتُ المرضى تُخزَّن **بالتسمية العربية** كما كانت (ledger_payments.method نصٌّ حرّ،
     والصفوفُ القائمة كلُّها تسميات) — لا ترحيل. المصروفاتُ والرواتب تبقى رموزاً.
   • صفرُ كتابة، صفرُ DOM: تعريفاتٌ محضة.

   مصدرُ النقد (M165 — v548): «نقداً» يصف شكلَ المال لا الحسابَ الذي خرج منه. المدفوعاتُ
   الخارجة النقدية (مصروف · راتب/دفعة طبيب · دفعة مخبر) تحمل `cash_source`:
   • `drawer`  = من درج العيادة ⇒ تُخصم من «صافي الدرج نقداً» وإقفال الصندوق.
   • `outside` = من خارج الدرج (خزنة · جيب الطبيب) ⇒ مصروفٌ بالحسابات، لا تمسّ الدرج.
   • فارغٌ/مجهول ⇒ `drawer` (الصفوفُ القائمة قبل M165 تُقرأ كما كانت حرفياً).
   • `sourceForStore(method, src)`: غيرُ النقدي ⇒ null دائماً (يطابق قيد القاعدة M165).
   • لا يدخل أيَّ معادلةٍ غير الدرج: الربحُ والذممُ والتقاريرُ لا ترى العمود. ───────────── */
(function () {
  'use strict';
  if (window.SyDentPayMethods) return;

  var LIST = [
    { key: 'cash',     label: 'نقداً',       cash: true  },
    { key: 'shamcash', label: 'شام كاش',     cash: false },
    { key: 'syriatel', label: 'سيريتل كاش', cash: false },
    { key: 'mtn',      label: 'MTN كاش',     cash: false },
    { key: 'bank',     label: 'تحويل بنكي',  cash: false },
    { key: 'online',   label: 'أونلاين',     cash: false },
    { key: 'check',    label: 'شيك',         cash: false },
    { key: 'other',    label: 'أخرى',        cash: false }
  ];
  /* مرادفاتٌ مخزَّنة فعلاً أو محتملة (صفحاتٌ قديمة · إدخالٌ يدويّ) — صغيرةُ الحروف بلا فراغاتٍ زائدة */
  var ALIASES = {
    'نقداً': 'cash', 'نقدا': 'cash', 'نقد': 'cash', 'كاش': 'cash', 'cash': 'cash',
    'تحويل بنكي': 'bank', 'بنك': 'bank', 'بنكي': 'bank', 'حوالة': 'bank', 'bank': 'bank',
    'شيك': 'check', 'check': 'check',
    'أونلاين': 'online', 'اونلاين': 'online', 'online': 'online', 'بطاقة': 'online', 'card': 'online',
    'شام كاش': 'shamcash', 'شام‌كاش': 'shamcash', 'shamcash': 'shamcash', 'sham cash': 'shamcash',
    'سيريتل كاش': 'syriatel', 'سيرتل كاش': 'syriatel', 'syriatel': 'syriatel', 'syriatel cash': 'syriatel',
    'mtn كاش': 'mtn', 'ام تي ان كاش': 'mtn', 'mtn': 'mtn', 'mtn cash': 'mtn',
    'أخرى': 'other', 'اخرى': 'other', 'آخر': 'other', 'اخر': 'other', 'other': 'other'
  };
  var BY_KEY = {};
  LIST.forEach(function (m) { BY_KEY[m.key] = m; });

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/\s+/g, ' ').replace(/ً/g, '');
    if (!s) return 'other';
    if (BY_KEY[s]) return s;
    /* التنوينُ نُزع أعلاه فتُقارَن «نقداً» و«نقدا» معاً */
    var keys = Object.keys(ALIASES);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].replace(/ً/g, '').toLowerCase() === s) return ALIASES[keys[i]];
    }
    return 'other';
  }
  function label(key) { var m = BY_KEY[norm(key)]; return m ? m.label : BY_KEY.other.label; }
  function isCash(raw) { return norm(raw) === 'cash'; }
  /* خياراتُ <select> لدفعات المرضى — القيمةُ هي التسميةُ (عقدُ التخزين أعلاه) */
  function optionsHtml(selectedRaw) {
    var sel = selectedRaw == null ? 'cash' : norm(selectedRaw);
    return LIST.map(function (m) {
      return '<option value="' + esc(m.label) + '"' + (m.key === sel ? ' selected' : '') + '>' + esc(m.label) + '</option>';
    }).join('');
  }

  /* ── مصدرُ النقد (M165) ── */
  var SOURCES = [
    { key: 'drawer',  label: 'من درج العيادة', short: 'من الدرج' },
    { key: 'outside', label: 'من خارج الدرج (خزنة · جيب الطبيب)', short: 'من خارج الدرج' }
  ];
  function normSource(raw) { return String(raw == null ? '' : raw).trim().toLowerCase() === 'outside' ? 'outside' : 'drawer'; }
  /* هل تُخصم هذه الدفعةُ الخارجة من الدرج؟ نقدٌ + مصدرُه الدرج */
  function fromDrawer(method, source) { return isCash(method) && normSource(source) === 'drawer'; }
  /* ما يُكتب بالعمود: غيرُ النقدي ⇒ null (قيدُ القاعدة) */
  function sourceForStore(method, source) { return isCash(method) ? normSource(source) : null; }
  function sourceLabel(source) { return normSource(source) === 'outside' ? SOURCES[1].short : SOURCES[0].short; }
  function sourceOptionsHtml(selected) {
    var sel = normSource(selected);
    return SOURCES.map(function (s) {
      return '<option value="' + s.key + '"' + (s.key === sel ? ' selected' : '') + '>' + esc(s.label) + '</option>';
    }).join('');
  }

  window.SyDentPayMethods = { LIST: LIST, norm: norm, label: label, isCash: isCash, optionsHtml: optionsHtml,
    SOURCES: SOURCES, normSource: normSource, fromDrawer: fromDrawer, sourceForStore: sourceForStore,
    sourceLabel: sourceLabel, sourceOptionsHtml: sourceOptionsHtml };
})();
/* SYDENT_PAYMETHODS_END */
