/* ═══════════════════════════════════════════════════════════════════════
   SyDent — admin-wa.js · حزام A3 من تفكيك admin.html (27 تموز 2026)
   قوالب الإشعارات (X3) + مساعدو واتساب + تصدير CSV — تعريفات صرفة فقط،
   صفر تنفيذ top-level. يُحمَّل قبل الكتلة الرئيسية في admin.html.
   المقاطع منقولة بايت-بايت؛ العلامات ADMIN-WA-SEG-n في admin.html تحدد
   المواضع الأصلية (برهان إعادة التركيب في scripts/proof سياق الجلسة).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── ADMIN-WA-SEG-1 · X3 — Notification Templates Editor · admin.html كان 3156–3767 ── */
// ============================================================================
// === Phase X3 — Notification Templates Editor ===============================
// ============================================================================
//
// Mirrors Phase X2 (Plans Editor) almost feature-for-feature: collapsible
// section, tabbed editor, dirty tracking, optimistic concurrency check,
// reset-to-default, audit log entry on save. The differences are:
//   - 4 templates instead of 3 plans (wa_welcome, wa_reminder, wa_suspended, wa_renewed)
//   - Live preview is a WhatsApp-style speech bubble rendered with mock data
//   - Variable insertion via clickable chips (inserts {var} at caret)
//   - "📤 تجريبي" button opens wa.me with the current (unsaved) body to a phone
//   - event_type is 'template_updated' (Migration 28.1)
//
// State shape:
//   tplEditorState = {
//     config:       { code -> row },     // populated by loadTplConfig
//     currentCode:  'wa_welcome',
//     original:     <deep-clone of row>, // snapshot at tab-open time
//     edited:       <deep-clone>,        // mutated by oninput
//     isDirty:      bool,
//     varDefs:      { code -> [{key,desc}] }   // built from FALLBACK_TEMPLATES + DB
//   }
//
// MOCK_VARS — values used by the preview pane. Realistic Arabic strings so
// admin can see what the rendered message looks like end-to-end.

var tplEditorState = {
  config: {},
  currentCode: 'wa_welcome',
  original: null,
  edited: null,
  isDirty: false,
  varDefs: {}
};

var TPL_MOCK_VARS = {
  // name: post-stripDoctorHonorific value — what the template actually
  // sees in the live render path. Showing 'د. محمد العلي' here would
  // make the preview render "مرحباً د. د. محمد العلي،" for wa_welcome,
  // misleading the admin into thinking the duplication still exists.
  name:          'محمد العلي',
  days_left:     5,
  trial_end:     '27 أيار 2026',
  plan_name:     'سنوي',
  login_url:     'www.sydent.app',
  email:         '0991234567@sydent.com',
  price:         '150,000 SYP',
  // Phase X3 محادثة 3: mock value for preview only. Live render uses
  // PLATFORM_SETTINGS_CACHE.support_phone; if empty, the live render DROPS
  // the line carrying the placeholder (see stripUnfilledSupport) so the
  // tenant never receives a raw {support_phone} in a WhatsApp message.
  support_phone: '0991234567',
  // support_email follows the exact same contract — live value comes from
  // PLATFORM_SETTINGS_CACHE.support_email (managed in Section H / إعدادات
  // المنصة → معلومات الدعم); empty drops its line the same way.
  support_email: 'support@sydent.app'
};

// Variable definitions per template — keeps the chip list inside the
// editor in sync with what each template actually supports. This is
// the same list as Migration 28.2's `variables` JSONB column, but kept
// in the client too so we don't depend on DB roundtrip to render chips.
var TPL_VAR_DEFS = {
  wa_welcome: [
    { key:'name',          desc:'اسم الطبيب' },
    { key:'login_url',     desc:'رابط الموقع' },
    { key:'email',         desc:'البريد المُسجَّل' },
    { key:'support_phone', desc:'رقم الدعم الفني لـ SyDent' },
    { key:'support_email', desc:'إيميل الدعم الفني لـ SyDent' }
  ],
  wa_reminder: [
    { key:'name',          desc:'اسم الطبيب (يحتوي اللقب)' },
    { key:'days_left',     desc:'الأيام المتبقّية' },
    { key:'trial_end',     desc:'تاريخ نهاية التجربة (عربي طويل)' },
    { key:'plan_name',     desc:'اسم الخطة المطبّقة على العميل' },
    { key:'support_phone', desc:'رقم الدعم الفني لـ SyDent' },
    { key:'support_email', desc:'إيميل الدعم الفني لـ SyDent' }
  ],
  wa_suspended: [
    { key:'name',          desc:'اسم الطبيب' },
    { key:'support_phone', desc:'رقم الدعم الفني لـ SyDent' },
    { key:'support_email', desc:'إيميل الدعم الفني لـ SyDent' }
  ],
  wa_renewed: [
    { key:'name',          desc:'اسم الطبيب' },
    { key:'plan_name',     desc:'اسم الخطة' },
    { key:'trial_end',     desc:'تاريخ نهاية الاشتراك' },
    { key:'price',         desc:'المبلغ المدفوع' },
    { key:'support_phone', desc:'رقم الدعم الفني لـ SyDent' },
    { key:'support_email', desc:'إيميل الدعم الفني لـ SyDent' }
  ]
};

// ── عزل ثنائي الاتجاه لقيم المتغيّرات اللاتينية/الرقمية ──────────────────────
//
// المُبلَّغ حيّاً (صورة معاينة قالب الترحيب): البريد المُخزَّن `0991234567@sydent.com`
// يظهر بجسم الرسالة `sydent.com@0991234567`. القيمة سليمة بالسلسلة — الخلل بصريّ
// بحت: خوارزمية Unicode BiDi تُقيّم مقطعاً يبدأ بأرقام (EN) داخل فقرة RTL فتضع
// `@` (محرف محايد بين EN و L) على مستوى الفقرة الفردي، فينقلب ترتيب المقطعين
// بالرسم مع بقاء كل مقطع سليماً داخلياً.
//
// الحل: لفّ القيمة بـU+200E (LRM) عند نقطة الاستبدال. LRM محرف L قويّ، فالقاعدة
// W7 تحوّل مقطع EN التالي له إلى L، ثم N1 تُلحق `@` بجواره ⇒ المقطع كله يُحسم LTR.
//
// مُثبَت بتطبيق UBA حقيقي (نفس النتيجة الحرفية للصورة قبل الإصلاح):
//   خام  : «البريد: 0991234567@sydent.com» ⇒ sydent.com@0991234567  ✗
//   ملفوف: نفس السطر                        ⇒ 0991234567@sydent.com  ✓
// و**no-op مُثبَت** للقيم السليمة أصلاً (`support@sydent.app` · `https://sydent.app`
// · `0934012433` — تبدأ بمحرف قويّ L أو رقم صرف فلا انقلاب لها بالحالتين)، وهذا ما
// يجعل اللفّ آمناً على المتغيّرات الأربعة كلها بلا استثناءات مشروطة.
//
// لماذا LRM (يونيكود 1.0) لا LRI/PDI (يونيكود 6.3): المحارف العازلة الحديثة غير
// مطبَّقة ببعض المصيِّرات القديمة (تحقّق عمليّ: مكتبة UBA شائعة ترمي عليها استثناءً)،
// وهي تُرسَم عندها محارفَ مجهولة أو تُهمَل. LRM مدعوم عالمياً ولا يُرسَم إطلاقاً.
//
// اللفّ يقع **وقت الاستبدال حصراً** — لا يُكتب بالـDB ولا بصندوق التحرير، فالإدارة
// لا تراه ولا تستطيع حذفه سهواً، ولا يدخل بعدّاد الأحرف (يقرأ الجسم الخام).
// ⚠️ النطاق ضيّق عمداً — البريد المُصنَّع وحده. الإصدار الأول لفّ أربعة متغيّرات
// «للاتساق»، فكسر ذلك **تحويل الرابط إلى رابط قابل للنقر بواتساب** (بلاغ حيّ
// بصورة): مُكتشِف الروابط يشترط أن يبدأ الرابط عند حدّ (مسافة أو بداية سطر)،
// ومحرفُ LRM الملاصق لـ`https` يكسر المطابقة فيصل النصّ عادياً بلا linkify.
// والثلاثة المنزوعة (`login_url` · `support_phone` · `support_email`) **مُثبَتٌ
// أنها لا تحتاج اللفّ أصلاً** — قِيست على تطبيق UBA وتُرسَم سليمة بلا عزل لأنها
// تبدأ بمحرف L قويّ أو برقمٍ صرف. القاعدة: يُلَفّ ما ثبت انقلابه لا ما «قد»
// ينقلب — فالعزل الزائد يكلّف سلوكاً حقيقياً (linkify الروابط والهواتف والبُرد).
var TPL_LTR_VARS = ['email'];
var TPL_LRM = '\u200E';
function tplLtrWrap(key, val) {
  if (!val) return val;
  if (TPL_LTR_VARS.indexOf(key) === -1) return val;
  return TPL_LRM + val + TPL_LRM;
}

// Translates a code to its Arabic label (used in confirm dialogs + tabs).
function tplCodeLabel(code) {
  return ({
    wa_welcome:   'رسالة الترحيب',
    wa_reminder:  'تذكير انتهاء التجربة',
    wa_suspended: 'إشعار إيقاف الحساب',
    wa_renewed:   'إشعار تجديد الاشتراك'
  })[code] || code;
}

// Load all 4 templates into tplEditorState.config + NOTIFICATION_TEMPLATES_CACHE.
// Called on page init + after every successful save. Errors degrade
// silently — the editor falls back to FALLBACK_TEMPLATES values so the
// admin can at least see the defaults and try saving again.
async function loadTplConfig() {
  try {
    if (!window.sb) return;
    var res = await window.sb.from('notification_templates')
      .select('*')
      .order('sort_order', { ascending: true });
    if (res.error) {
      console.warn('loadTplConfig: query error', res.error);
      return;
    }
    tplEditorState.config = {};
    // Rebuild the renderTemplate() cache from the same fetch (no double round trip).
    NOTIFICATION_TEMPLATES_CACHE = {};
    (res.data || []).forEach(function(t){
      tplEditorState.config[t.code] = t;
      if (t.is_active) NOTIFICATION_TEMPLATES_CACHE[t.code] = t.body;
    });
    // If the editor is already open on a tab, refresh fields from the
    // freshly-loaded config (unless dirty — don't trample user input).
    if (tplEditorState.currentCode && tplEditorState.config[tplEditorState.currentCode] && !tplEditorState.isDirty) {
      var fresh = tplEditorState.config[tplEditorState.currentCode];
      tplEditorState.original = JSON.parse(JSON.stringify(fresh));
      tplEditorState.edited   = JSON.parse(JSON.stringify(fresh));
      renderTplEditorFields(tplEditorState.edited);
      renderTplPreview();
    }
  } catch(e) {
    console.warn('loadTplConfig error:', e);
  }
}

function getTplConfig(code) {
  if (tplEditorState.config && tplEditorState.config[code]) {
    return tplEditorState.config[code];
  }
  // Fallback synthetic row built from FALLBACK_TEMPLATES — keeps the
  // editor usable even when the DB hasn't loaded yet.
  return {
    code: code,
    channel: 'whatsapp',
    title_ar: tplCodeLabel(code),
    description: '',
    body: FALLBACK_TEMPLATES[code] || '',
    variables: (TPL_VAR_DEFS[code] || []).map(function(v){ return { key:v.key, desc:v.desc }; }),
    is_active: true,
    sort_order: 100,
    updated_at: null,
    updated_by: null
  };
}

function toggleTplEditor() {
  var sec = document.getElementById('tplEditorSection');
  if (!sec) return;
  sec.classList.toggle('open');
  // On first open, populate the active tab.
  if (sec.classList.contains('open') && !tplEditorState.original) {
    selectTplTab(tplEditorState.currentCode || 'wa_welcome', null);
  }
}

async function selectTplTab(code, btnEl) {
  // Block tab switching if there are unsaved changes — same UX as Plans editor.
  if (tplEditorState.isDirty && code !== tplEditorState.currentCode) {
    if (!await SyDialog.confirm({ message: 'هناك تعديلات غير محفوظة على "' + tplCodeLabel(tplEditorState.currentCode) + '". الانتقال سيُلغيها.\n\nمتابعة؟' })) {
      return;
    }
  }
  var wrap = document.getElementById('tplTabsWrap');
  if (wrap) {
    var tabs = wrap.querySelectorAll('.tpl-tab');
    tabs.forEach(function(t){ t.classList.remove('active'); });
    if (btnEl) { btnEl.classList.add('active'); }
    else {
      tabs.forEach(function(t){ if (t.getAttribute('data-tpl-code') === code) t.classList.add('active'); });
    }
  }
  tplEditorState.currentCode = code;
  var src = getTplConfig(code);
  tplEditorState.original = JSON.parse(JSON.stringify(src));
  tplEditorState.edited   = JSON.parse(JSON.stringify(src));
  tplEditorState.isDirty  = false;
  renderTplEditorFields(tplEditorState.edited);
  renderTplVarsRow();
  renderTplPreview();
  updateTplDirtyUI();
}

function renderTplEditorFields(t) {
  if (!t) return;
  var fldTitle = document.getElementById('tplFldTitle');
  var fldDesc  = document.getElementById('tplFldDescription');
  var fldBody  = document.getElementById('tplFldBody');
  if (fldTitle) fldTitle.value = t.title_ar || '';
  if (fldDesc)  fldDesc.value  = t.description || '';
  if (fldBody)  fldBody.value  = t.body || '';
  var sw = document.getElementById('tplSwitchActive');
  if (sw) {
    sw.classList.toggle('on', !!t.is_active);
    sw.setAttribute('aria-checked', !!t.is_active);
  }
}

function renderTplVarsRow() {
  var row = document.getElementById('tplVarsRow');
  if (!row) return;
  // Drop existing chips (keep the label span).
  Array.prototype.slice.call(row.querySelectorAll('.tpl-var-chip')).forEach(function(c){ c.remove(); });
  var defs = TPL_VAR_DEFS[tplEditorState.currentCode] || [];
  defs.forEach(function(def){
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tpl-var-chip';
    chip.textContent = '{' + def.key + '}';
    chip.title = def.desc || def.key;
    chip.addEventListener('click', function(){ insertTplVar(def.key); });
    row.appendChild(chip);
  });
}

function insertTplVar(key) {
  var ta = document.getElementById('tplFldBody');
  if (!ta) return;
  var token = '{' + key + '}';
  var start = (typeof ta.selectionStart === 'number') ? ta.selectionStart : ta.value.length;
  var end   = (typeof ta.selectionEnd   === 'number') ? ta.selectionEnd   : ta.value.length;
  ta.value = ta.value.substring(0, start) + token + ta.value.substring(end);
  var caret = start + token.length;
  ta.focus();
  try { ta.setSelectionRange(caret, caret); } catch(_){}
  onTplFieldChange();
}

function onTplFieldChange() {
  if (!tplEditorState.edited) return;
  readTplEditorIntoState();
  computeTplDirty();
  renderTplPreview();
  updateTplDirtyUI();
}

function onTplToggleActive() {
  if (!tplEditorState.edited) return;
  tplEditorState.edited.is_active = !tplEditorState.edited.is_active;
  var sw = document.getElementById('tplSwitchActive');
  if (sw) {
    sw.classList.toggle('on', !!tplEditorState.edited.is_active);
    sw.setAttribute('aria-checked', !!tplEditorState.edited.is_active);
  }
  computeTplDirty();
  renderTplPreview();
  updateTplDirtyUI();
}

function readTplEditorIntoState() {
  if (!tplEditorState.edited) return;
  var fldTitle = document.getElementById('tplFldTitle');
  var fldDesc  = document.getElementById('tplFldDescription');
  var fldBody  = document.getElementById('tplFldBody');
  if (fldTitle) tplEditorState.edited.title_ar    = fldTitle.value;
  if (fldDesc)  tplEditorState.edited.description = fldDesc.value;
  if (fldBody)  tplEditorState.edited.body        = fldBody.value;
}

function computeTplDirty() {
  var o = tplEditorState.original, e = tplEditorState.edited;
  if (!o || !e) { tplEditorState.isDirty = false; return; }
  tplEditorState.isDirty = (
    (o.title_ar    || '') !== (e.title_ar    || '') ||
    (o.description || '') !== (e.description || '') ||
    (o.body        || '') !== (e.body        || '') ||
    !!o.is_active        !== !!e.is_active
  );
}

function updateTplDirtyUI() {
  var dot       = document.getElementById('tplDirtyIndicator');
  var saveBtn   = document.getElementById('btnSaveTpl');
  var revertBtn = document.getElementById('btnRevertTpl');
  if (dot) dot.style.display = tplEditorState.isDirty ? 'inline-block' : 'none';
  if (saveBtn) {
    saveBtn.disabled = !tplEditorState.isDirty;
    saveBtn.classList.toggle('dirty', !!tplEditorState.isDirty);
  }
  if (revertBtn) revertBtn.disabled = !tplEditorState.isDirty;
}

// Substitute mock vars into the current edited body and render into the
// preview bubble. Uses textContent (NOT innerHTML) — admin's body could
// contain anything, including angle brackets; we render it as plain text.
function renderTplPreview() {
  if (!tplEditorState.edited) return;
  var body = tplEditorState.edited.body || '';
  // Substitute ONLY the current template's supported vars (TPL_VAR_DEFS) so
  // the preview matches the live send path exactly — unsupported tokens
  // (e.g. {price} in wa_welcome) stay literal, same as production.
  var defKeys = (TPL_VAR_DEFS[tplEditorState.currentCode] || []).map(function(d){ return d.key; });
  defKeys.forEach(function(k){
    if (!(k in TPL_MOCK_VARS)) return;
    var needle = '{' + k + '}';
    // عزل BiDi مطابق لمسار الإرسال الحي — وإلا خالفت المعاينة الإنتاج (tplLtrWrap).
    var val = tplLtrWrap(k, String(TPL_MOCK_VARS[k]));
    // R6 audit fix: single-pass split/join (see renderTemplate for rationale).
    if (body.indexOf(needle) !== -1) body = body.split(needle).join(val);
  });
  var bubble = document.getElementById('tplPreviewBubble');
  if (bubble) bubble.textContent = body;
  // Counter — wa.me text param accepts ~5000 chars safely.
  var counter = document.getElementById('tplPreviewCounter');
  if (counter) {
    var len = (tplEditorState.edited.body || '').length;
    counter.textContent = len + ' / 5000';
    counter.className = 'tpl-preview-counter' +
      (len > 5000 ? ' over' : (len > 4000 ? ' warn' : ''));
  }
  // Detect undefined placeholders so admin notices typos like {nme}.
  var meta = document.getElementById('tplPreviewMeta');
  if (meta) {
    var unresolved = (body.match(/\{[a-z_]+\}/gi) || []).filter(function(t){
      return defKeys.indexOf(t.replace(/[{}]/g, '')) === -1;
    });
    meta.textContent = unresolved.length
      ? '⚠️ متغيّرات غير مدعومة بهذا القالب: ' + unresolved.join(', ')
      : 'ببيانات تجريبية — الإرسال الفعلي يستبدل القيم.';
  }
}

async function revertTplEdits() {
  if (!tplEditorState.isDirty) return;
  if (!await SyDialog.confirm({ message: 'إلغاء جميع التعديلات على "' + tplCodeLabel(tplEditorState.currentCode) + '"؟', danger: true })) return;
  if (!tplEditorState.original) return;
  tplEditorState.edited = JSON.parse(JSON.stringify(tplEditorState.original));
  tplEditorState.isDirty = false;
  renderTplEditorFields(tplEditorState.edited);
  renderTplPreview();
  updateTplDirtyUI();
}

// Reset the editor's body to the FALLBACK_TEMPLATES default — the
// hardcoded string that lives in this file (and that Migration 28.2
// seeded into DB at install time). Different from revertTplEdits:
//   revertTplEdits   → restore original = last DB snapshot loaded for this tab
//   resetTplToFallback → restore the always-available default body, ignoring
//                        any historical edits saved to DB
//
// Only the body is reset (not title/description/is_active) — those are
// admin's metadata around the template. Admin must still hit "💾 حفظ"
// to persist this reset to DB; until then it's just a local edit
// (isDirty flips on so the save button lights up).
//
// Discovered in live test محادثة 1: admin selected-all + deleted body,
// then realized there was no path to recover the seeded default.
// revertTplEdits would restore whatever was last saved (which could
// itself have been a mistake). This is the "factory reset" button.
async function resetTplToFallback() {
  if (!tplEditorState.edited) return;
  var code = tplEditorState.currentCode;
  var defaultBody = FALLBACK_TEMPLATES[code];
  if (!defaultBody) {
    SyDialog.alert('⚠️ لا يوجد نص افتراضي مُضمَّن لهذا القالب.');
    return;
  }
  if (tplEditorState.edited.body === defaultBody) {
    SyDialog.alert('ℹ️ النص الحالي مطابق للنص الافتراضي.');
    return;
  }
  if (!await SyDialog.confirm({ message: 'إعادة نص "' + tplCodeLabel(code) + '" إلى القيمة الافتراضية؟\n\n' +
               'سيُستبدَل كل المحتوى الحالي بالنص الأصلي المُضمَّن في الكود.\n\n' +
               'هذا تعديل محلّي — لن يُحفَظ في قاعدة البيانات حتى تضغط "💾 حفظ التغييرات".', danger: true })) {
    return;
  }
  tplEditorState.edited.body = defaultBody;
  // Update DOM so user sees the new body immediately.
  var fldBody = document.getElementById('tplFldBody');
  if (fldBody) fldBody.value = defaultBody;
  computeTplDirty();
  renderTplPreview();
  updateTplDirtyUI();
}

// Validate before save — minimal checks. Empty body is rejected; empty
// title_ar is rejected (admins need a label to identify templates). The
// body is otherwise free-form (could contain emoji, line breaks, etc).
function validateTplEdits(t) {
  if (!t) return { ok:false, error:'لا توجد بيانات للحفظ.' };
  if (!t.title_ar || !t.title_ar.trim()) return { ok:false, error:'العنوان مطلوب.' };
  if (!t.body || !t.body.trim()) return { ok:false, error:'نص الرسالة مطلوب.' };
  if (t.body.length > 5000) return { ok:false, error:'نص الرسالة طويل جداً (' + t.body.length + ' > 5000 محرف).' };
  return { ok:true };
}

function buildTplDiff(o, e) {
  var diff = {};
  if ((o.title_ar || '')    !== (e.title_ar || ''))    diff.title_ar    = { from:o.title_ar,    to:e.title_ar };
  if ((o.description || '') !== (e.description || '')) diff.description = { from:o.description, to:e.description };
  if ((o.body || '')        !== (e.body || ''))        diff.body        = {
    from_len:     (o.body || '').length,
    to_len:       (e.body || '').length,
    // First 120 chars of each — enough for the events viewer (Phase X4) to
    // show a meaningful preview of what changed without bloating the audit
    // log with full message bodies (templates can be 400+ chars). Admin who
    // needs the full text can fetch the current notification_templates row.
    from_preview: (o.body || '').slice(0, 120),
    to_preview:   (e.body || '').slice(0, 120)
  };
  if (!!o.is_active         !== !!e.is_active)         diff.is_active   = { from:!!o.is_active, to:!!e.is_active };
  return diff;
}

// "📤 تجريبي" — opens wa.me to the admin's typed phone with the *unsaved*
// body. Useful for previewing the rendered message on the phone before
// committing the edit. Builds the URL from the current edited body
// (not from the DB) so admin sees their pending changes immediately.
function sendTplTest() {
  if (!tplEditorState.edited) return;
  var phoneInput = document.getElementById('tplTestPhone');
  var phone = phoneInput ? (phoneInput.value || '').trim() : '';
  if (!phone) {
    SyDialog.alert('📱 الرجاء إدخال رقم الهاتف أولاً.');
    if (phoneInput) phoneInput.focus();
    return;
  }
  var num = normalizeWaPhone(phone);
  if (num.length < 8) {
    SyDialog.alert('⚠️ الرقم غير صالح.');
    return;
  }
  var body = tplEditorState.edited.body || '';
  // Same per-template scoping as renderTplPreview — the test message must
  // mirror what the live send path would actually produce.
  var defKeys = (TPL_VAR_DEFS[tplEditorState.currentCode] || []).map(function(d){ return d.key; });
  defKeys.forEach(function(k){
    if (!(k in TPL_MOCK_VARS)) return;
    var needle = '{' + k + '}';
    // عزل BiDi مطابق لمسار الإرسال الحي (tplLtrWrap) — رسالة الاختبار يجب أن
    // تصل الهاتف بنفس رسم الرسالة الحقيقية حرفياً.
    var val = tplLtrWrap(k, String(TPL_MOCK_VARS[k]));
    // R6 audit fix: single-pass split/join (see renderTemplate for rationale).
    if (body.indexOf(needle) !== -1) body = body.split(needle).join(val);
  });
  var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
  window.open(url, '_blank', 'noopener');
}

async function saveTplEdits() {
  if (!tplEditorState.isDirty || !tplEditorState.edited || !tplEditorState.original) return;
  if (!window.sb) { SyDialog.alert('Supabase غير متاح حالياً.'); return; }

  // Refresh edited state from inputs defensively (paste events in some browsers don't fire oninput).
  readTplEditorIntoState();
  computeTplDirty();
  if (!tplEditorState.isDirty) {
    SyDialog.alert('لا توجد تعديلات للحفظ.');
    updateTplDirtyUI();
    return;
  }

  var e = tplEditorState.edited;
  var o = tplEditorState.original;
  var v = validateTplEdits(e);
  if (!v.ok) { SyDialog.alert('⚠️ ' + v.error); return; }

  var diff = buildTplDiff(o, e);
  if (!diff || Object.keys(diff).length === 0) {
    SyDialog.alert('لا توجد تعديلات للحفظ.');
    return;
  }

  // Extra confirm for deactivation — sends will silently use FALLBACK_TEMPLATES.
  if (o.is_active === true && e.is_active === false) {
    if (!await SyDialog.confirm({ message: '⚠️ تعطيل قالب "' + tplCodeLabel(o.code) + '" سيجعل الرسائل تستخدم النص الافتراضي المُضمَّن في الكود (وليس النص المحرَّر).\n\nمتابعة؟', danger: true })) {
      return;
    }
  }

  var labelMap = {
    title_ar:    'العنوان',
    description: 'الوصف',
    body:        'النص',
    is_active:   'حالة التفعيل'
  };
  var changedKeys = Object.keys(diff);
  var changedArabic = changedKeys.map(function(k){ return labelMap[k] || k; });
  var summaryLine = changedArabic.length + ' حقل مُعدَّل: ' + changedArabic.join('، ');
  if (!await SyDialog.confirm({ message: 'حفظ التعديلات على "' + tplCodeLabel(o.code) + '"؟\n\n' + summaryLine })) return;

  var saveBtn = document.getElementById('btnSaveTpl');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...'; }

  try {
    var updatePayload = {
      title_ar:    e.title_ar,
      description: e.description || null,
      body:        e.body,
      is_active:   !!e.is_active
    };
    try {
      var sess = await window.sb.auth.getSession();
      if (sess && sess.data && sess.data.session && sess.data.session.user) {
        updatePayload.updated_by = sess.data.session.user.email || 'admin';
      }
    } catch(_){}

    // Optimistic concurrency check — rule #45.
    if (o.updated_at) {
      try {
        var check = await window.sb.from('notification_templates')
          .select('updated_at,updated_by')
          .eq('code', o.code)
          .maybeSingle();
        if (check && check.data && check.data.updated_at && check.data.updated_at !== o.updated_at) {
          var whoLine = check.data.updated_by ? ('\n\nآخر تعديل بواسطة: ' + check.data.updated_by) : '';
          SyDialog.alert('⚠️ تم تعديل هذا القالب من جلسة أخرى منذ فتحك للمحرّر.' + whoLine +
                '\n\nسيتم إعادة تحميل أحدث نسخة لتجنّب الكتابة فوق تعديلات الآخرين. راجع التغييرات ثم احفظ من جديد.');
          await loadTplConfig();
          var stale = getTplConfig(o.code);
          if (stale) {
            tplEditorState.original = JSON.parse(JSON.stringify(stale));
            tplEditorState.edited   = JSON.parse(JSON.stringify(stale));
            tplEditorState.isDirty  = false;
            renderTplEditorFields(tplEditorState.edited);
            renderTplPreview();
            updateTplDirtyUI();
          }
          return;
        }
      } catch(ex) {
        console.warn('saveTplEdits: optimistic check failed (proceeding):', ex);
      }
    }

    var upd = await window.sb.from('notification_templates')
      .update(updatePayload)
      .eq('code', o.code)
      .select()
      .maybeSingle();

    if (upd.error) {
      console.error('saveTplEdits: update error', upd.error);
      SyDialog.alert('❌ فشل الحفظ: ' + (upd.error.message || 'خطأ غير معروف'));
      return;
    }
    // R13 audit: maybeSingle() returns data:null when no row matches the
    // WHERE clause (PostgREST). This happens if seed Migration 28.2 didn't
    // run and the editor was working off a synthetic FALLBACK_TEMPLATES
    // row. RLS denial also looks identical here. Surface this so admin
    // doesn't see a fake "✅ تم حفظ" while nothing changed in DB.
    if (!upd.data) {
      SyDialog.alert('❌ لم يُحدَّث أي سطر — قد يكون قالب "' + tplCodeLabel(o.code) +
            '" غير موجود في DB (لم يُشغَّل seed)، أو الصلاحيات مرفوضة.\n\n' +
            'تحقّق من تشغيل Migration 28.2 وأن دورك "admin" في platform_admins.');
      return;
    }

    // Audit event — Stripe-style immutable log. trial_request_id + user_id
    // are null because this mutates the global template catalog, not a
    // specific tenant subscription. Notes JSON captures the diff for the
    // events viewer (Phase X4) to render later.
    var notesObj = { template_code:o.code, diff:diff };
    try {
      await logSubscriptionEvent({
        trial_request_id: null,
        user_id:          null,
        event_type:       'template_updated',
        // Reuse from_plan/to_plan as identifier slots (Phase X2 plan_updated
        // does the same — both code-snake-case strings). Phase X4 events
        // viewer can filter by from_plan to show "all template_updated for
        // wa_reminder" without parsing notes JSON.
        from_plan:        o.code,
        to_plan:          o.code,
        from_status:      null,
        to_status:        null,
        from_trial_end:   null,
        to_trial_end:     null,
        amount:           null,
        currency:         'SYP',
        notes:            JSON.stringify(notesObj)
      });
    } catch(ex2) {
      // DB write already succeeded — audit is best-effort, don't fail the save.
      console.warn('saveTplEdits: audit log write failed (non-fatal):', ex2);
    }

    // Invalidate caches so renderTemplate() picks up the new body on the
    // next call, and so the editor rebinds against the fresh row.
    NOTIFICATION_TEMPLATES_CACHE = null;
    await loadTplConfig();

    var fresh = getTplConfig(o.code) || upd.data || updatePayload;
    fresh.code = o.code;
    tplEditorState.original = JSON.parse(JSON.stringify(fresh));
    tplEditorState.edited   = JSON.parse(JSON.stringify(fresh));
    tplEditorState.isDirty  = false;
    renderTplEditorFields(tplEditorState.edited);
    renderTplPreview();
    updateTplDirtyUI();

    SyDialog.alert('✅ تم حفظ تعديلات قالب "' + tplCodeLabel(o.code) + '".');
  } catch(ex) {
    console.error('saveTplEdits exception:', ex);
    SyDialog.alert('❌ خطأ غير متوقع: ' + (ex && ex.message ? ex.message : String(ex)));
  } finally {
    if (saveBtn) { saveBtn.textContent = '💾 حفظ التغييرات'; updateTplDirtyUI(); }
  }
}

// ============================================================================
// === End Phase X3 ===========================================================
// ============================================================================
/* ── ADMIN-WA-SEG-2 · X3 — WhatsApp phone normalization · admin.html كان 4893–4914 ── */
// === Phase X3 — WhatsApp helpers (template-driven) ===
//
// Both waLink and waReminderLink were previously sync functions that
// concatenated hardcoded Arabic strings. They now read the message body
// from the notification_templates table (seeded in Migration 28.2),
// substitute {variables}, and return a wa.me URL. The strings in the
// FALLBACK_TEMPLATES below are byte-identical copies of the original
// hardcoded text, so behavior pre/post Phase X3 is the same when the DB
// is reachable AND when it isn't.
//
// Why fallbacks: a flaky network or a misconfigured RLS should not
// break the reminder/welcome flow — admin can still send the default
// message. The DB version is the source of truth when available; the
// fallback is the safety net.
//
// Phone normalization stays here (used by both helpers + sendTplTest).

function normalizeWaPhone(phone) {
  var num = (phone || '').replace(/\D/g, '');
  if (num.startsWith('0')) num = '963' + num.substring(1);
  return num;
}
/* ── ADMIN-WA-SEG-3 · X3 — WhatsApp template-driven links (incl. FALLBACK_TEMPLATES) · admin.html كان 6097–6406 ── */
// Fallbacks must match Migration 33.1 seed strings exactly so that a
// DB-down render produces the same wa.me URL as a DB-up render.
// (Updated from Migration 28.2 baseline to include {support_phone} —
// see Migration 33.1 for the upgrade rationale.)
var FALLBACK_TEMPLATES = {
  wa_welcome:
    'مرحباً د. {name}،\n' +
    'تم قبول طلبك في SyDent 🦷\n\n' +
    'يمكنك الآن تسجيل الدخول من:\n' +
    '🔗 {login_url}\n\n' +
    'سجّل الدخول برقم موبايلك أو بريدك الإلكتروني الذي سجّلت به، مع كلمة المرور التي اخترتها عند إنشاء الحساب.\n\n' +
    '🔑 نسيت كلمة المرور؟ اضغط "نسيت كلمة المرور؟" في صفحة الدخول.\n\n' +
    '📞 للدعم الفني: {support_phone}\n\n' +
    'شكراً لاختيارك SyDent!',
  wa_reminder:
    'مرحباً {name} 👋\n\n' +
    'هذه رسالة تذكير ودّية من SyDent 🦷\n\n' +
    '⏰ تجربتك المجانية تنتهي خلال {days_left} يوم بتاريخ {trial_end}.\n\n' +
    'للتمديد أو الاستفسار: {support_phone}\n\n' +
    'شكراً لاختيارك SyDent!',
  wa_suspended:
    'مرحباً {name} 👋\n\n' +
    'نودّ إعلامك بأن حسابك في SyDent مُعلَّق مؤقتاً.\n\n' +
    'للاستفسار أو إعادة التفعيل: {support_phone}\n\n' +
    'شكراً لتفهّمك.',
  wa_renewed:
    'مرحباً د. {name} 👋\n\n' +
    'تم تجديد اشتراكك في SyDent ✅\n\n' +
    '📋 الخطة: {plan_name}\n' +
    '📅 صالح حتى: {trial_end}\n' +
    '💰 المبلغ: {price}\n\n' +
    '📞 للدعم الفني: {support_phone}\n\n' +
    'شكراً لاختيارك SyDent!'
};

// stripDoctorHonorific(name) — strips a leading Arabic 'د' / 'د.' honorific
// (with whitespace) from a tenant name so templates like "مرحباً د. {name}"
// don't render as "مرحباً د. د شذ المار،". Live tenant data shows names
// already carry the honorific (verified: 'د شذ المار', 'د مجد شاكر').
//
// Regex /^د\s+|^د\.\s*/ requires:
//   • 'د' + whitespace      (matches "د شذ المار")
//   • 'د.' + optional space (matches "د. مجد شاكر" and "د.مجد")
// This avoids false-positives on names that simply START with the letter
// 'د' but are NOT honorifics: 'دلال', 'دانا', 'دعاء', 'دياب', etc.
//
// Empty / null / whitespace-only input → '' (callers decide fallback).
//
// Single source of truth — also used by c360AvatarInitial for the same
// honorific-stripping concern.
function stripDoctorHonorific(name) {
  if (!name) return '';
  return String(name).trim().replace(/^د\s+|^د\.\s*/, '');
}

// Cache populated by loadTplConfig() on init + invalidated after
// saveTplEdits(). Keys are template codes, values are the body string.
var NOTIFICATION_TEMPLATES_CACHE = null;

// renderTemplate(code, vars) — picks the active template body for `code`
// from cache (or fallback), then substitutes {var} placeholders. Missing
// variables stay as-is (per design — they alert admin during preview).
// Substitution uses a literal replace loop rather than RegExp to avoid
// regex-special chars in user input breaking the replacement.
async function renderTemplate(code, vars) {
  var body = FALLBACK_TEMPLATES[code] || '';
  try {
    if (!NOTIFICATION_TEMPLATES_CACHE && window.sb) {
      var res = await window.sb.from('notification_templates')
        .select('code, body, is_active');
      NOTIFICATION_TEMPLATES_CACHE = {};
      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach(function(t){
          if (t.is_active) NOTIFICATION_TEMPLATES_CACHE[t.code] = t.body;
        });
      }
    }
    if (NOTIFICATION_TEMPLATES_CACHE && NOTIFICATION_TEMPLATES_CACHE[code]) {
      body = NOTIFICATION_TEMPLATES_CACHE[code];
    }
  } catch (e) {
    // Network/RLS error — fall back to hardcoded body.
    console.warn('renderTemplate: using fallback for ' + code, e);
  }
  vars = vars || {};
  Object.keys(vars).forEach(function(k){
    var needle = '{' + k + '}';
    // عزل BiDi للقيم اللاتينية/الرقمية قبل الحقن — بريد مُصنَّع يبدأ برقم ينقلب
    // رسمُه داخل جسم عربي (المُبلَّغ حيّاً). التفاصيل عند tplLtrWrap.
    var val = tplLtrWrap(k, (vars[k] == null) ? '' : String(vars[k]));
    // R6 audit fix: split+join replaces ALL occurrences in a single pass.
    // The previous while(indexOf)+replace pattern looped forever if val
    // itself contained needle — e.g. a tenant who registered with name
    // '{name}!' would freeze the admin's browser when "💬 تذكير" was
    // clicked on their card (val gets re-inserted indefinitely). split/
    // join is safe because it doesn't re-scan the replacement region.
    if (body.indexOf(needle) !== -1) {
      body = body.split(needle).join(val);
    }
  });
  return stripUnfilledSupport(body);
}

// stripUnfilledSupport(body) — removes any line still carrying an unfilled
// {support_phone} / {support_email} placeholder.
//
// Historically an empty support value left the literal in the body as a
// "visible TODO" for the admin (see supportPhoneVars in admin-settings.js).
// That contract was written when empty meant "not configured yet". It now
// also means "the platform owner deliberately cleared this channel" — and
// either way this body is the message a paying tenant receives, where a raw
// {support_phone} reads as a broken product. So the whole line goes: every
// seeded template puts these placeholders on a line of their own (Migration
// 33.1), and the blank-line run left behind is collapsed back to one.
//
// Scope is deliberately narrow — the two support keys only. Every other
// unfilled variable keeps the literal-as-TODO behaviour untouched, because
// those are always supplied by the caller and a missing one is a real bug
// that should stay loud.
function stripUnfilledSupport(body) {
  if (body.indexOf('{support_phone}') === -1 &&
      body.indexOf('{support_email}') === -1) return body;
  var kept = String(body).split('\n').filter(function(line){
    return line.indexOf('{support_phone}') === -1 &&
           line.indexOf('{support_email}') === -1;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

// Welcome message sent on accept. Now async (template-driven).
//
// Observation: this function has no callers in the current code path —
// the accept flow no longer sends a welcome WhatsApp inline (replaced by
// the unified signup flow in Phase 7.6F). The function is preserved so
// that Phase X3 محادثة 2 can wire a manual "👋 إعادة إرسال الترحيب" button
// to it without redefinition, and so the wa_welcome template seeded in
// Migration 28.2 has a real render path. Email fallback (phone digits +
// '@sydent.com') matches what waLink used to produce.
async function waLink(phone, name, email) {
  var num = normalizeWaPhone(phone);
  var emailVal = email || (num + '@sydent.com');
  // Phase X3 محادثة 3: merge support_phone if non-empty (empty leaves
  // {support_phone} literal in body as a visible TODO — see supportPhoneVars).
  var vars = {
    name: stripDoctorHonorific(name),
    // بلا سكيم عمداً: واتساب يحوّل النطاقات المسبوقة بـwww إلى روابط قابلة
    // للنقر، والصيغة أقصر وأقرب لعادة السوق. النطاق مؤكَّد حيّاً (يفتح فعلاً).
    login_url: 'www.sydent.app',
    email: emailVal
  };
  var sp = supportPhoneVars();
  if (sp.support_phone) vars.support_phone = sp.support_phone;
  if (sp.support_email) vars.support_email = sp.support_email;
  var body = await renderTemplate('wa_welcome', vars);
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
}

// Trial-expiry reminder (Phase 7.6C-Step3 originally). Same async
// upgrade pattern — was sync, now async, signature unchanged.
//
// Name normalization: live data shows names carry the 'د'/'د.' honorific
// inline (e.g., 'د شذ المار'). The default template body uses '{name}'
// without an extra honorific prefix, but admins can edit the template to
// add one — so we strip defensively at substitution time. Single source
// of truth: stripDoctorHonorific().
async function waReminderLink(phone, name, daysLeft, trialEndIso, planName) {
  var num = normalizeWaPhone(phone);
  var dateStr;
  try {
    dateStr = SyDT.numDate(new Date(trialEndIso));   // v487: رسالةُ العيادة أرقاماً (قرار المالك)
  } catch (e) {
    dateStr = (trialEndIso || '').slice(0, 10);
  }
  // Phase X3 محادثة 3: support_phone merged conditionally — see waLink.
  var vars = {
    name: stripDoctorHonorific(name),
    days_left: daysLeft,
    trial_end: dateStr,
    plan_name: planName || ''  // real plan display name — passed by all call sites
  };
  var sp = supportPhoneVars();
  if (sp.support_phone) vars.support_phone = sp.support_phone;
  if (sp.support_email) vars.support_email = sp.support_email;
  var body = await renderTemplate('wa_reminder', vars);
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
}

// Adapter for renderList's inline links. The list is built synchronously
// (no await available in a string-concat loop) so we render an href="#"
// with onclick that builds the URL on demand and opens a new tab. The
// templates cache is warm by then (loaded on page init), so this is a
// single sync read in the common case.
function openWaReminder(phone, name, daysLeft, trialEndIso, planName, ev) {
  if (ev) { try { ev.preventDefault(); } catch(_){} }
  waReminderLink(phone, name, daysLeft, trialEndIso, planName).then(function(url){
    window.open(url, '_blank', 'noopener');
  }).catch(function(e){
    console.error('openWaReminder failed:', e);
    SyDialog.alert('❌ تعذّر بناء رسالة التذكير: ' + (e && e.message ? e.message : e));
  });
  return false;
}

// =============================================================================
// Phase X3 محادثة 2 — three additional WA action buttons.
//
// Industry pattern (Oracle Cloud / Adobe Admin Console / GitLab / Oracle
// Health / GoHighLevel): every accepted account exposes a "Resend Welcome"
// affordance on its row. SyDent applies the same pattern via click-to-chat:
// the admin clicks the button → wa.me opens with the current DB-template
// body pre-filled → admin reviews + hits Send in WhatsApp.
//
// All three follow the same shape as openWaReminder/waReminderLink:
//   <state-async helper>  → renderTemplate('wa_*', vars) → wa.me URL
//   <opener>(... ev)       → href="#" + onclick="return open*(...)"
//
// jsAttr() is the single-source escape used by renderList for all
// onclick-embedded string literals. Same XSS surface as the existing
// 💬 تذكير button, no new attack vector.
// =============================================================================

// 👋 Welcome (resend) — for any accepted account.
//
// Phase 7.6F moved welcome delivery into the unified signup flow, so the
// inline waLink() call in accept() was removed. This adapter is the manual
// replay path: account exists, user lost the email/changed phone/needs the
// credentials again. Email fallback mirrors what the original signup-time
// email would have been (digits + '@sydent.com').
async function waWelcomeLink(phone, name, email) {
  var num = normalizeWaPhone(phone);
  var emailVal = email || (num + '@sydent.com');
  // Phase X3 محادثة 3: support_phone merged conditionally — see waLink.
  var vars = {
    name: stripDoctorHonorific(name),
    // بلا سكيم عمداً: واتساب يحوّل النطاقات المسبوقة بـwww إلى روابط قابلة
    // للنقر، والصيغة أقصر وأقرب لعادة السوق. النطاق مؤكَّد حيّاً (يفتح فعلاً).
    login_url: 'www.sydent.app',
    email: emailVal
  };
  var sp = supportPhoneVars();
  if (sp.support_phone) vars.support_phone = sp.support_phone;
  if (sp.support_email) vars.support_email = sp.support_email;
  var body = await renderTemplate('wa_welcome', vars);
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
}

function openWaWelcome(phone, name, email, ev) {
  if (ev) { try { ev.preventDefault(); } catch(_){} }
  waWelcomeLink(phone, name, email).then(function(url){
    window.open(url, '_blank', 'noopener');
  }).catch(function(e){
    console.error('openWaWelcome failed:', e);
    SyDialog.alert('❌ تعذّر بناء رسالة الترحيب: ' + (e && e.message ? e.message : e));
  });
  return false;
}

// ⏸ Suspended notice — only shown for currently-suspended accounts.
//
// Single variable ({name}) because the message is intentionally generic —
// the admin contacts the tenant separately to discuss the reason; the WA
// nudge is just "we've paused your account, please reach out".
async function waSuspendedLink(phone, name) {
  var num = normalizeWaPhone(phone);
  // Phase X3 محادثة 3: support_phone merged conditionally — see waLink.
  var vars = { name: stripDoctorHonorific(name) };
  var sp = supportPhoneVars();
  if (sp.support_phone) vars.support_phone = sp.support_phone;
  if (sp.support_email) vars.support_email = sp.support_email;
  var body = await renderTemplate('wa_suspended', vars);
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
}

function openWaSuspended(phone, name, ev) {
  if (ev) { try { ev.preventDefault(); } catch(_){} }
  waSuspendedLink(phone, name).then(function(url){
    window.open(url, '_blank', 'noopener');
  }).catch(function(e){
    console.error('openWaSuspended failed:', e);
    SyDialog.alert('❌ تعذّر بناء رسالة الإيقاف: ' + (e && e.message ? e.message : e));
  });
  return false;
}

// ✅ Renewal notice — for paid (non-permanent) accounts.
//
// admin decides when to send (the button stays available for the entire
// paid lifecycle, not just immediately post-renewal — same as how Intercom
// keeps "Send message" available on every customer card regardless of
// recency). plan_name comes pre-formatted in Arabic by renderList so the
// helper doesn't need to translate it again. price is snapshot from
// trial_requests.price_paid; if null/0 the template renders '—' (em-dash)
// and admin can edit the body in the WA tab before sending.
async function waRenewedLink(phone, name, planName, trialEndIso, price, currency) {
  var num = normalizeWaPhone(phone);
  var dateStr;
  try {
    dateStr = SyDT.numDate(new Date(trialEndIso));   // v487: رسالةُ العيادة أرقاماً (قرار المالك)
  } catch (e) {
    dateStr = (trialEndIso || '').slice(0, 10);
  }
  var priceStr;
  var n = Number(price);
  if (price && isFinite(n) && n > 0) {
    // Migration 105: label follows the subscription's settlement currency.
    priceStr = n.toLocaleString('en-US') + (currency === 'USD' ? ' $' : ' ل.س');
  } else {
    priceStr = '—';
  }
  // Phase X3 محادثة 3: support_phone merged conditionally — see waLink.
  var vars = {
    name: stripDoctorHonorific(name),
    plan_name: planName || '',
    trial_end: dateStr,
    price: priceStr
  };
  var sp = supportPhoneVars();
  if (sp.support_phone) vars.support_phone = sp.support_phone;
  if (sp.support_email) vars.support_email = sp.support_email;
  var body = await renderTemplate('wa_renewed', vars);
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
}

function openWaRenewed(phone, name, planName, trialEndIso, price, ev, currency) {
  if (ev) { try { ev.preventDefault(); } catch(_){} }
  waRenewedLink(phone, name, planName, trialEndIso, price, currency).then(function(url){
    window.open(url, '_blank', 'noopener');
  }).catch(function(e){
    console.error('openWaRenewed failed:', e);
    SyDialog.alert('❌ تعذّر بناء رسالة التجديد: ' + (e && e.message ? e.message : e));
  });
  return false;
}

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var t = SyDT.time12(d);   // v485: المُنسّق الموحّد — «d/m/yyyy — hh:mm AM»
  return SyDT.numDate(d) + (t ? ' — ' + t : '');
}
/* ── ADMIN-WA-SEG-4 · 7.6C-Step2 — CSV Export · admin.html كان 6512–6719 ── */
// ===== Phase 7.6C-Step2: CSV Export =====
// Exports the CURRENTLY VISIBLE list (after tab filter + search filter +
// expiring filter are applied) to a UTF-8 CSV file the operator can open
// in Excel. Excel on Windows requires a UTF-8 BOM (U+FEFF) at the start
// of the file to detect the encoding; without it, Arabic renders as
// gibberish. We also use CRLF line endings (RFC 4180 + Excel-friendly).

// RFC 4180 cell escape: wrap in double quotes, double-up any internal
// double quotes. Newlines inside cells become literal CRLF; Excel
// preserves them as in-cell line breaks because the cell is quoted.
// TSV cell sanitizer. TSV (tab-separated values) does NOT use quotes
// for escaping — instead, any tab/CR/LF inside a value would break the
// row structure. We replace those whitespace chars with a single space
// to keep the file parseable everywhere. This is a deliberate, lossy
// transform — admin notes containing literal tabs/newlines lose them
// in the export, but the table layout stays intact in WPS / Excel /
// Google Sheets / LibreOffice with NO locale-specific hint required.
//
// Why TSV instead of CSV: WPS Office Free on non-US Windows locales
// درس هامبورغ (ويندوز ألماني + WPS): تلك اللغة تقسّم على «؛» لا على
// الفاصلة، وتتجاهل توجيه 'sep=,' بصمت. المخرج الأساسي صار xlsx حقيقياً
// فزال الالتباس أصلاً، والاحتياط النصّي بقي جدولةً — ومقرّه الآن
// window.SyDentXlsx بـsupabase-init.js، مصدراً واحداً لكل الأسطح.

function getFilteredRequestsForExport() {
  return allRequests.filter(function(r){
    var st = r.status || 'new';
    var passFilter = (currentFilter === 'all' || st === currentFilter);
    if (!passFilter || !matchesSearch(r)) return false;
    if (expiringFilterActive && !isExpiringSoon(r)) return false;
    return true;
  });
}

// Format trial_end for the spreadsheet:
//   - permanent account (trial_end IS NULL on an accepted row): "دائم"
//   - non-accepted / no trial_end: "" (empty cell)
//   - active or expired trial: ISO yyyy-mm-dd (Excel-sortable)
function fmtTrialEndForCsv(r) {
  if (r.status !== 'accepted') return '';
  if (!r.trial_end) return 'دائم';
  var d = new Date(r.trial_end);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Format created_at with date + time, local timezone, ISO-style for
// easy Excel parsing. Example: "2026-05-22 21:09"
function fmtCreatedAtForCsv(iso) {
  return window.SyDentXlsx.stamp(iso);
}

// Status enum → Arabic label
function fmtStatusForCsv(st) {
  st = st || 'new';
  if (st === 'new')      return 'جديد';
  if (st === 'accepted') return 'مقبول';
  if (st === 'rejected') return 'مرفوض';
  return st; // fallback for any future unknown value
}

// Days remaining for the CSV: number for active trials (1..N), 0/negative
// for expired trials (so admins can sort by "most overdue"), empty for
// permanent or non-accepted rows.
function fmtDaysLeftForCsv(r) {
  var dl = getDaysLeft(r);
  return dl === null ? '' : String(dl);
}

async function exportCSV(exportAll) {
  var btn = document.getElementById(exportAll ? 'exportAllCsvBtn' : 'exportCsvBtn');
  // exportAll = filter-independent FULL backup: every account in every state
  // (active / suspended / expired / rejected / permanent), ignoring the current
  // filter + search. Supabase free tier has no automated backups, so this is the
  // manual backup mechanism (mirrors Partner Center "Export all subscriptions").
  var rows = exportAll ? allRequests.slice() : getFilteredRequestsForExport();
  if (rows.length === 0) {
    SyDialog.alert(exportAll ? 'لا توجد حسابات للتصدير.' : 'لا توجد نتائج للتصدير. عدّل الفلتر أو البحث وحاول مرة أخرى.');
    return;
  }

  // Brief visual feedback while we build the file. The workbook build is
  // sync but the library may still be downloading on the first ever click,
  // so the spinner is doing real work here — not decoration.
  var label = exportAll ? 'تصدير الكل' : 'تصدير Excel';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>' + (exportAll ? 'جارٍ تصدير الكل...' : 'جارٍ التصدير...') + '</span>';
  }

  try {
    // Header row in Arabic — order MUST match the row builder below.
    // Name unification: the live clinic/business name (clinic_settings.clinic_name)
    // leads as the account identity; the signup/contact name follows as the
    // account contact — mirroring the customer card and 360° drawer.
    var headers = [
      'اسم العيادة',
      'جهة الاتصال',
      'الهاتف',
      'الإيميل',
      'فرع النقابة',
      'الرقم النقابي',
      'الملاحظات',
      'الحالة',
      'تاريخ الطلب',
      'تاريخ انتهاء التجربة',
      'الأيام المتبقية'
    ];
    var data = rows.map(function (r) {
      var _clinic  = (r.user_id && clinicNameByUid[r.user_id]) ? clinicNameByUid[r.user_id] : '';
      var _contact = (r.user_id && ownerNameByUid[r.user_id]) ? ownerNameByUid[r.user_id] : r.name;
      return [
        _clinic,
        _contact,
        r.phone,
        r.email,
        synBranchOf(r),
        synNoOf(r),
        r.notes,
        fmtStatusForCsv(r.status),
        fmtCreatedAtForCsv(r.created_at),
        fmtTrialEndForCsv(r),
        fmtDaysLeftForCsv(r)
      ];
    });

    // xlsx حقيقي عبر المصدر المشترك؛ ولو تعذّرت المكتبة سقط تلقائياً على
    // TSV (جدولة لا فاصلة — درس هامبورغ: ويندوز ألماني يقسّم على «؛»).
    await window.SyDentXlsx.save({
      filename:  'عملاء-سايدنت' + (exportAll ? '-الكل' : '') + '-' + window.SyDentXlsx.today(),
      sheetName: exportAll ? 'كل الحسابات' : 'العملاء',
      headers:   headers,
      rows:      data,
      cols:      [{wch:26},{wch:22},{wch:15},{wch:28},{wch:16},{wch:12},
                  {wch:34},{wch:10},{wch:18},{wch:20},{wch:12}]
    });
  } catch (e) {
    SyDialog.alert('فشل التصدير: ' + (e && e.message ? e.message : 'خطأ غير معروف'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>📥</span><span>' + label + '</span>';
    }
  }
}
