/* tx-consent.js — موافقةُ المريض على العلاج (M219) — صفحةُ العلاجات.
   لكل علاجٍ نصُّ موافقةٍ اختياري (consent_templates · صفٌّ لكل treatment_key). وجودُ الصف = «هذا العلاج
   يحتاج موافقة المريض»: عند وضعه بخطة مريضٍ تُولَّد له موافقةٌ يوقّعها من بوابة المريض (consent_sync).
   - المكتبةُ الجاهزة (SY_CONSENT_LIB) تملأ النص عند أول تفعيل؛ العيادةُ تعدّله كما تشاء.
   - لا عمودَ على treatments ولا لمسَ لمسار حفظ العلاج: نافذةٌ مستقلة بنمط «🧰 المواد».
   - الجدولُ غائب (قبل الهجرة) ⇒ الزرُّ والشارةُ لا يظهران (عقد «انشر قبل الهجرة»).
   - النصُّ يُعرض للمريض بالعربية دائماً (مخرجاتُ المريض خارج الترجمة بالتصميم). */
(function () {
  'use strict';

  var TAIL = '\n\nأقرّ بأنّ الطبيب شرح لي ما سبق بلغةٍ فهمتُها، وأُتيحت لي فرصةُ طرح الأسئلة وتلقّيتُ عنها إجاباتٍ وافية، وبأنّني أبلغتُه بحالتي الصحية والأدوية التي أتناولها وما أعانيه من حساسية. وأعلم أنّ نتائج العلاج لا يمكن ضمانها ضماناً تاماً، وأنّ من حقّي سحب موافقتي قبل بدء الإجراء. وبناءً عليه أوافق على إجراء العلاج المذكور.';

  var LIB = {
    extraction: {
      title: 'الموافقة على قلع الأسنان',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو قلع السن أو الأسنان المحدّدة، وبيّن لي سبب القلع والبدائل الممكنة عنه (مثل المعالجة اللبية أو الترميم إن أمكن) وما يترتّب على ترك السن دون علاج.\n\nوأعلم أنّ القلع، كأيّ إجراءٍ جراحي، قد يرافقه:\n• ألمٌ وتورّمٌ ونزفٌ خفيف في الأيام الأولى.\n• التهابُ السنخ (السنخ الجاف) أو إنتانٌ يستدعي علاجاً إضافياً.\n• خدرٌ مؤقّت، ونادراً دائم، في الشفة أو اللسان أو الذقن عند قرب الجذور من العصب.\n• انفتاحٌ على الجيب الفكّي عند قلع الأسنان العلوية الخلفية.\n• كسرُ جزءٍ من الجذر أو تأذّي سنٍّ مجاورة أو ترميمها.\n• صعوبةٌ مؤقّتة في فتح الفم.\n\nوأتعهّد باتّباع التعليمات التي تُعطى لي بعد القلع، وبمراجعة العيادة عند حدوث نزفٍ مستمر أو ألمٍ شديد أو ارتفاعٍ في الحرارة.'
    },
    surgery: {
      title: 'الموافقة على الجراحة الفموية',
      body: 'شرح لي الطبيب طبيعة الإجراء الجراحي المقترح والغاية منه والبدائل الممكنة عنه وما يترتّب على عدم إجرائه.\n\nوأعلم أنّ الجراحة الفموية قد يرافقها:\n• ألمٌ وتورّمٌ وكدماتٌ ونزفٌ خفيف في الأيام الأولى.\n• إنتانٌ أو تأخّرٌ في الشفاء يستدعي علاجاً إضافياً.\n• خدرٌ مؤقّت، ونادراً دائم، في الشفة أو اللسان أو الذقن.\n• انفتاحٌ على الجيب الفكّي في جراحات الفكّ العلوي الخلفية.\n• تأذّي الأسنان أو الترميمات المجاورة.\n• صعوبةٌ مؤقّتة في فتح الفم.\n\nوأتعهّد باتّباع التعليمات التي تُعطى لي بعد الجراحة، وبمراجعة العيادة عند حدوث نزفٍ مستمر أو ألمٍ شديد أو ارتفاعٍ في الحرارة.'
    },
    endo: {
      title: 'الموافقة على المعالجة اللبية',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو معالجة لبّ السن (معالجة العصب): تنظيف القنوات الجذرية وتعقيمها وحشوها، وبيّن لي أنّ البديل هو قلع السن، وما يترتّب على تركه دون علاج.\n\nوأعلم أنّ المعالجة اللبية قد يرافقها:\n• ألمٌ أو حساسيةٌ عند العضّ لأيامٍ بعد الجلسة.\n• انكسارُ أداةٍ دقيقة داخل القناة أو انثقابُ الجذر، وقد يستدعي ذلك علاجاً إضافياً أو تحويلاً إلى مختصّ.\n• تعذّرُ الوصول إلى كامل القنوات عند تكلّسها أو انحنائها.\n• فشلُ المعالجة أو عودةُ الإنتان، وقد يستدعي ذلك إعادة المعالجة أو جراحةً حول الذروة أو قلع السن.\n• تغيّرُ لون السن مع الوقت.\n\nوأعلم أنّ السن المعالَج لبّياً يصبح أضعف وأكثر عرضةً للكسر، وأنّه يحتاج غالباً إلى ترميمٍ نهائي أو تاج بعد انتهاء المعالجة، وأنّ هذا الترميم إجراءٌ مستقلّ بتكلفته.'
    },
    implant: {
      title: 'الموافقة على زراعة الأسنان',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو وضع زرعةٍ سنّية في عظم الفكّ تُحمَّل لاحقاً بتعويضٍ ثابت أو متحرّك، وبيّن لي البدائل الممكنة (الجسر الثابت أو الجهاز المتحرّك أو ترك الفراغ) ومراحل العلاج ومدّته المتوقّعة.\n\nوأعلم أنّ زراعة الأسنان قد يرافقها:\n• ألمٌ وتورّمٌ وكدماتٌ ونزفٌ خفيف بعد الجراحة.\n• إنتانٌ حول الزرعة أو تأخّرٌ في الشفاء.\n• عدمُ اندماج الزرعة بالعظم، ما يستدعي إزالتها وقد تُعاد زراعتها بعد الشفاء.\n• خدرٌ مؤقّت، ونادراً دائم، في الشفة أو الذقن أو اللسان في زرعات الفكّ السفلي.\n• انفتاحٌ على الجيب الفكّي في زرعات الفكّ العلوي الخلفية.\n• الحاجةُ إلى تطعيمٍ عظمي أو رفعٍ للجيب إن لم يكن العظم كافياً، وهو إجراءٌ مستقلّ بتكلفته.\n\nوأعلم أنّ التدخين والسكّري غير المضبوط وضعف العناية الفموية تزيد احتمال فشل الزرعة، وأنّ نجاحها على المدى الطويل يتوقّف على عنايتي اليومية بنظافة الفم والتزامي بالمراجعات الدورية.'
    },
    fixed: {
      title: 'الموافقة على التعويضات الثابتة (التيجان والجسور)',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو تحضير السن أو الأسنان المحدّدة لتركيب تاجٍ أو جسرٍ ثابت، وبيّن لي البدائل الممكنة عنه ونوع المادّة المقترحة.\n\nوأعلم أنّ هذا العلاج:\n• يتطلّب برد جزءٍ من نسيج السن، وهو إجراءٌ غير قابلٍ للتراجع.\n• قد تتبعه حساسيةٌ مؤقّتة للحرارة أو البرودة.\n• قد يستدعي معالجةً لبّية للسن قبل التركيب أو بعده إن تأثّر العصب.\n• قد لا يطابق لونُ التعويض وشكلُه الأسنانَ الطبيعية مطابقةً تامّة.\n• قد ينفكّ التعويض أو ينكسر جزءٌ من الخزف مع الاستعمال، وقد يحدث نخرٌ تحته عند إهمال العناية.\n• في الجسر تُحضَّر الأسنانُ المجاورة للفراغ لتحمله.\n\nوأعلم أنّ التعويض المؤقّت يُستعمل بحذر ريثما يجهز التعويض النهائي، وأنّ عمر التعويض يتوقّف على عنايتي بنظافة الفم والتزامي بالمراجعات الدورية.'
    },
    removable: {
      title: 'الموافقة على التعويضات المتحرّكة',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو جهازٌ متحرّك (كامل أو جزئي) يعوّض الأسنان المفقودة، وبيّن لي البدائل الممكنة عنه (الزرعات أو الجسور الثابتة) ومراحل صنعه وعدد الجلسات المتوقّع.\n\nوأعلم أنّ الجهاز المتحرّك:\n• يحتاج إلى فترة تأقلمٍ قد تمتدّ أسابيع، يرافقها شعورٌ بجسمٍ غريب وزيادةٌ في اللعاب وصعوبةٌ مؤقّتة في النطق والمضغ.\n• قد يسبّب تقرّحاتٍ ضاغطة تستدعي جلسات تعديل.\n• لا يعطي قوّة المضغ نفسها التي تعطيها الأسنان الطبيعية، وثباتُ الجهاز السفلي الكامل أقلّ عادةً.\n• يحتاج مع الوقت إلى تبطينٍ أو تعديلٍ أو استبدال، لأنّ عظم الفكّ واللثة يتغيّران.\n• في الجهاز الجزئي قد تتأثّر الأسنانُ الحاملة للضمّات إن أُهملت نظافتها.\n\nوأتعهّد بتنظيف الجهاز يومياً ونزعه ليلاً ما لم يُشِر الطبيب بغير ذلك، وبمراجعة العيادة عند حدوث ألمٍ أو تقرّح.'
    },
    whitening: {
      title: 'الموافقة على تبييض الأسنان',
      body: 'شرح لي الطبيب أنّ العلاج المقترح هو تبييض الأسنان بموادّ مؤكسِدة، وبيّن لي أنّ درجة التفتيح تختلف من شخصٍ إلى آخر ولا يمكن ضمان درجةٍ محدّدة.\n\nوأعلم أنّ التبييض:\n• قد تتبعه حساسيةٌ سنّية مؤقّتة للبرودة والحرارة.\n• قد يسبّب تهيّجاً مؤقّتاً في اللثة.\n• لا يغيّر لون الحشوات والتيجان والوجوه التجميلية، فقد تحتاج إلى استبدالٍ بعده لتوافق اللون الجديد.\n• نتيجتُه غير دائمة، ويتراجع أثره مع الوقت بحسب الطعام والشراب والتدخين.\n\nوأعلم أنّ التبييض لا يُجرى للحامل والمرضع، وأنّ عليّ تجنّب المأكولات والمشروبات الملوِّنة والتدخين في الأيام الأولى بعد الجلسة.'
    },
    ortho: {
      title: 'الموافقة على المعالجة التقويمية',
      body: 'شرح لي الطبيب خطّة المعالجة التقويمية المقترحة والغاية منها ومدّتها التقديرية والبدائل الممكنة عنها، وبيّن لي أنّ المدّة قد تطول أو تقصر بحسب استجابة الأسنان ومدى التزامي بالتعليمات والمواعيد.\n\nوأعلم أنّ المعالجة التقويمية قد يرافقها:\n• ألمٌ وانزعاجٌ لأيامٍ بعد التركيب وبعد كل جلسة شدّ، وتقرّحاتٌ في الخدّ والشفة.\n• نخورٌ وبقعٌ بيضاء دائمة على الأسنان والتهابٌ في اللثة عند إهمال التنظيف.\n• قِصَرٌ في جذور بعض الأسنان (امتصاصٌ جذري)، وهو طفيفٌ في الغالب.\n• انزعاجٌ أو طقطقةٌ في مفصل الفكّ.\n• الحاجةُ أحياناً إلى قلع أسنانٍ أو إلى إجراءاتٍ مساعِدة لتأمين المسافة.\n• نكسٌ في وضع الأسنان بعد انتهاء المعالجة إن لم يُستعمل المثبّت كما يُوصَف.\n\nوأتعهّد بالعناية الدقيقة بنظافة الفم، وبتجنّب الأطعمة القاسية واللاصقة، وبالالتزام بالمواعيد وبوضع المثبّت بعد انتهاء المعالجة للمدّة التي يحدّدها الطبيب.'
    },
    perio: {
      title: 'الموافقة على معالجة اللثة',
      body: 'شرح لي الطبيب حالة اللثة والنسج الداعمة والعلاج المقترح لها (التقليح وتسوية الجذور أو الجراحة اللثوية)، وبيّن لي ما يترتّب على ترك الحالة دون علاج من تراجعٍ في العظم وحركةٍ في الأسنان وفقدانها.\n\nوأعلم أنّ معالجة اللثة قد يتبعها:\n• حساسيةٌ سنّية للبرودة والحرارة.\n• انحسارٌ في اللثة وظهورُ فراغاتٍ بين الأسنان بعد زوال التورّم.\n• ألمٌ ونزفٌ خفيف في الأيام الأولى.\n• زيادةٌ مؤقّتة في حركة الأسنان.\n\nوأعلم أنّ نجاح المعالجة يتوقّف على عنايتي اليومية بنظافة الفم والتزامي بجلسات المتابعة الدورية، وأنّ التدخين يُضعف نتيجتها.'
    },
    pedo: {
      title: 'موافقة وليّ الأمر على معالجة الطفل',
      body: 'بصفتي وليّ أمر الطفل، شرح لي الطبيب العلاج المقترح له والغاية منه والبدائل الممكنة وما يترتّب على ترك الحالة دون علاج.\n\nوأعلم أنّ:\n• التخدير الموضعي يُبقي الشفة والخدّ واللسان مخدَّرةً ساعاتٍ بعد الجلسة، وعليّ مراقبة الطفل كي لا يعضّها.\n• الطفل قد يحتاج إلى أكثر من جلسة بحسب تعاونه، وقد يُؤجَّل العلاج إن تعذّر إتمامه بأمان.\n• السنّ اللبني المعالَج قد يحتاج لاحقاً إلى علاجٍ إضافي أو قلع، وقد يُوضع حافظُ مسافة بعد القلع المبكر.\n\nوأتعهّد باتّباع التعليمات التي تُعطى لي بعد الجلسة، وبمراجعة العيادة عند حدوث ألمٍ شديد أو تورّم.'
    },
    general: {
      title: 'الموافقة على المعالجة السنّية',
      body: 'شرح لي الطبيب العلاج المقترح والغاية منه والبدائل الممكنة عنه وما يترتّب على عدم إجرائه، وبيّن لي خطواته ومدّته المتوقّعة وتكلفته التقديرية.\n\nوأعلم أنّ المعالجة السنّية قد يرافقها ألمٌ أو حساسيةٌ مؤقّتة، وأنّ التخدير الموضعي قد يسبّب خدراً يستمرّ ساعات، وأنّ الخطّة قد تتغيّر أثناء العلاج إن ظهر ما لم يكن ظاهراً عند الفحص، وعندها يُشرح لي التغيير قبل متابعته.'
    }
  };

  /* المفتاحُ الصريح أولاً، ثم التصنيف، ثم العامّ */
  var BY_KEY = { extracted: 'extraction', implant: 'implant', 'root-canal': 'endo', crown: 'fixed', bridge: 'fixed', whitening: 'whitening' };
  var BY_CAT = { surgical: 'surgery', endodontics: 'endo', implantology: 'implant', prosthodontics: 'fixed', prosth_cosmetic: 'fixed',
    prosth_removable: 'removable', orthodontics: 'ortho', periodontics: 'perio', pediatric: 'pedo', cosmetic: 'general' };

  function libFor(t) {
    var k = (t && BY_KEY[String(t.treatment_key || '')]) || (t && BY_CAT[String(t.category || '')]) || 'general';
    var e = LIB[k] || LIB.general;
    return { title: e.title, body: e.body + TAIL };
  }

  var S = { ok: false, map: {}, editing: null, saving: false };

  function byId(id) { return document.getElementById(id); }
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
  function ownerId() { return (typeof currentDoctor !== 'undefined' && currentDoctor && currentDoctor.id) || null; }
  function isMissing(err) {
    var m = ((err && err.message) || '') + ' ' + ((err && err.code) || '');
    return /42P01|PGRST205|does not exist|schema cache/i.test(m);
  }

  /* تحميلُ نصوص العيادة — يُستدعى من loadTreatments. الجدولُ غائب ⇒ الميزةُ مخفية بلا خطأ. */
  async function load() {
    S.ok = false; S.map = {};
    var uid = ownerId();
    if (!uid || !window.sb) return false;
    try {
      var r = await window.sb.from('consent_templates').select('id, treatment_key, title, body').eq('owner_id', uid);
      if (r.error) { if (!isMissing(r.error)) console.error('consent_templates load:', r.error); return false; }
      (r.data || []).forEach(function (x) { S.map[x.treatment_key] = x; });
      S.ok = true;
    } catch (e) { console.error('consent_templates load:', e); }
    return S.ok;
  }

  function available() { return S.ok; }
  function has(key) { return !!(S.ok && key && S.map[key]); }

  function findTreatment(id) {
    var list = (typeof treatments !== 'undefined' && Array.isArray(treatments)) ? treatments : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function syncFields() {
    var on = byId('cnsOn').checked;
    byId('cnsFields').style.display = on ? '' : 'none';
    countChars();
  }
  function countChars() {
    var b = byId('cnsBody'), c = byId('cnsCount');
    if (b && c) c.textContent = String(b.value.length) + ' / 6000';
  }

  function open(treatmentId) {
    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
    if (!S.ok) { toast('⚠️ الموافقات غير متاحة بعد — حدّث الصفحة وحاول ثانيةً'); return; }
    var t = findTreatment(treatmentId);
    if (!t) return;
    var key = t.treatment_key || t.dbKey || t.key;
    if (!key) { toast('⚠️ احفظ العلاج أولاً ثم أضف موافقته'); return; }
    S.editing = { id: treatmentId, key: key, t: t };
    var cur = S.map[key] || null, lib = libFor(t);
    byId('cnsModalTitle').textContent = '✍️ موافقة المريض: ' + (t.name || '');
    byId('cnsOn').checked = !!cur;
    byId('cnsTitle').value = cur ? cur.title : lib.title;
    byId('cnsBody').value = cur ? cur.body : lib.body;
    byId('cnsErr').style.display = 'none';
    var btn = byId('cnsSaveBtn'); btn.disabled = false; btn.textContent = 'حفظ';
    syncFields();
    byId('consentModal').classList.add('open');
  }

  function close() {
    var el = byId('consentModal');
    if (!el) return;
    el.classList.remove('open');
    S.editing = null;
  }

  /* «استعادة النص الجاهز»: يعيد نصَّ المكتبة إلى الحقلين (لا يحفظ) */
  function restoreLib() {
    if (!S.editing) return;
    var lib = libFor(S.editing.t);
    byId('cnsTitle').value = lib.title;
    byId('cnsBody').value = lib.body;
    countChars();
  }

  function fail(msg) { var e = byId('cnsErr'); e.textContent = msg; e.style.display = 'block'; }

  async function save() {
    if (S.saving || !S.editing) return;
    if (window.SyDentSub && window.SyDentSub.blockReadOnly && window.SyDentSub.blockReadOnly()) return;
    var uid = ownerId(); if (!uid) return;
    var on = byId('cnsOn').checked, key = S.editing.key, cur = S.map[key] || null;
    var title = byId('cnsTitle').value.trim(), body = byId('cnsBody').value.trim();
    byId('cnsErr').style.display = 'none';
    if (on) {
      if (!title) return fail('اكتب عنوان الموافقة.');
      if (title.length > 120) return fail('العنوان أطول من 120 حرفاً.');
      if (!body) return fail('اكتب نصّ الموافقة.');
      if (body.length > 6000) return fail('النص أطول من 6000 حرف.');
    }
    S.saving = true;
    var btn = byId('cnsSaveBtn'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      var r;
      if (on) {
        r = await window.sb.from('consent_templates')
          .upsert({ owner_id: uid, treatment_key: key, title: title, body: body }, { onConflict: 'owner_id,treatment_key' })
          .select('id, treatment_key, title, body').single();
        if (r.error) throw r.error;
        S.map[key] = r.data;
      } else if (cur) {
        r = await window.sb.from('consent_templates').delete().eq('id', cur.id).eq('owner_id', uid);
        if (r.error) throw r.error;
        delete S.map[key];
      }
      if (typeof window.logAudit === 'function' && (on || cur)) {
        try {
          window.logAudit('settings.consent_template', { entityType: 'treatment', entityId: S.editing.id,
            description: (on ? (cur ? 'تعديل نصّ موافقة المريض للعلاج: ' : 'تفعيل موافقة المريض للعلاج: ') : 'إلغاء موافقة المريض للعلاج: ') + (S.editing.t.name || '') });
        } catch (e) { /* السجلُّ لا يُسقط الحفظ */ }
      }
      close();
      toast(on ? 'تم حفظ نصّ الموافقة ✓' : (cur ? 'أُلغيت موافقة هذا العلاج ✓' : 'لا تغيير'));
      if (typeof window.render === 'function') window.render();
    } catch (e) {
      console.error('consent_templates save:', e);
      fail(isMissing(e) ? 'الموافقات غير متاحة بعد على هذا الحساب.' : 'تعذّر الحفظ — تحقّق من الاتصال وحاول ثانيةً.');
    } finally {
      S.saving = false;
      btn.disabled = false; btn.textContent = 'حفظ';
    }
  }

  window.SyConsentTx = { LIB: LIB, TAIL: TAIL, libFor: libFor, load: load, available: available, has: has };
  window.openConsentModal = open;
  window.closeConsentModal = close;
  window.saveConsentTpl = save;
  window.consentRestoreLib = restoreLib;
  window.consentSyncFields = syncFields;
  window.consentCountChars = countChars;
})();
