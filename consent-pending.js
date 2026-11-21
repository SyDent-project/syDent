/* consent-pending.js — «موافقة بانتظار التوقيع» (M219 · أ4): مصدرٌ واحد لسؤال «أيُّ هؤلاء المرضى له موافقةٌ معلَّقة؟».
   يستهلكه: أعلامُ الهدل باللوحة (huddle-flags.js) وسطرُ التنبيه بنافذة الموعد (appt-modal.js).
   تنبيهٌ فقط — لا يمنع حجزاً ولا جلسة (قرار المالك 20/11/2026). قراءةٌ واحدة بنطاق المالك؛ الفشلُ أو الجدولُ
   الغائب ⇒ لا رقاقة ولا سطر، بلا خطأ ظاهر. لا كتابة، لا مستمعات. */
(function () {
  'use strict';
  if (window.SyConsentPending) return;

  /* { patient_id: عددُ الموافقات المعلَّقة } لقائمة مرضى (≤ 200 معرّفاً بالنداء). */
  async function forPatients(uid, ids) {
    var out = {};
    ids = (ids || []).filter(Boolean);
    if (!uid || !ids.length || !window.sb) return out;
    try {
      var r = await window.sb.from('patient_consents').select('patient_id')
        .eq('owner_id', uid).eq('status', 'pending').in('patient_id', ids.slice(0, 200));
      if (r.error) return out;
      (r.data || []).forEach(function (x) { out[x.patient_id] = (out[x.patient_id] || 0) + 1; });
    } catch (e) {}
    return out;
  }

  function text(n) {
    return n === 1 ? '✍️ للمريض موافقة علاج بانتظار توقيعه — أرسل له رابط البوابة أو افتحها له على جهاز العيادة'
                   : '✍️ للمريض ' + n + ' موافقات علاج بانتظار توقيعه — أرسل له رابط البوابة أو افتحها له على جهاز العيادة';
  }

  /* سطرُ نافذة الموعد: آخرُ مريضٍ طُلب هو الذي يُعرض (اختيارٌ سريع متتالٍ لا يترك سطرَ مريضٍ سابق). textContent فقط. */
  var _seq = 0;
  async function hint(uid, pid, elId) {
    var el = document.getElementById(elId || 'fPatientConsentHint');
    if (!el) return;
    var my = ++_seq;
    el.style.display = 'none'; el.textContent = '';
    if (!uid || !pid) return;
    var m = await forPatients(uid, [pid]);
    if (my !== _seq) return;
    var n = m[pid] || 0;
    if (!n) return;
    el.textContent = text(n);
    el.style.display = 'block';
  }

  window.SyConsentPending = { forPatients: forPatients, hint: hint, text: text };
})();
