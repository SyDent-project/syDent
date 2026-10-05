/* SYDENT_FAMILY_START — حجزُ الأسرة المتتابع — v506
   ─────────────────────────────────────────────────────────────
   Curve/Dentrix «family scheduling»: أفرادُ أسرةٍ واحدة (patients.family_id — المجموعةُ
   الحرّة نفسُها التي يديرها ملفُ المريض) يُحجزون متتابعين بنفس اليوم والطبيب والكرسي:
   المريضُ الأساس بوقته، ثم كلُّ فردٍ مختار بعده بمقدار المدّة. الأساسُ يُحفظ بالمسار
   المعتاد (بحارس التعارض)؛ الأفرادُ هنا بعد فحصٍ مسبق واحد (مواعيدُ اليوم نفسِه + الفتراتُ
   المغلقة عبر المصدرين المشتركين) ثم إدخالٍ دفعةً واحدة كصفوفٍ مستقلة (status=scheduled).
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyDentFamily) return;

  function minOf(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t)); return m ? (+m[1] * 60 + +m[2]) : NaN; }
  function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }

  /* أفرادُ أسرة المريض (غيرُه) بنطاق الطبيب — استعلامان صغيران عند اختيار المريض؛ [] بلا أسرة أو قبل هجرة family_id */
  async function members(doctorId, patientId) {
    if (!window.sb || !doctorId || !patientId) return [];
    try {
      var me = await window.sb.from('patients').select('id, family_id').eq('doctor_id', doctorId).eq('id', patientId).maybeSingle();
      if (me.error || !me.data || !me.data.family_id) return [];
      var r = await window.sb.from('patients').select('id, name, family_id').eq('doctor_id', doctorId).eq('family_id', me.data.family_id).order('created_at', { ascending: true });
      if (r.error) return [];
      return (r.data || []).filter(function (p) { return p.id !== patientId; });
    } catch (e) { return []; }
  }

  /* الأوقاتُ المتتابعة بعد الأساس: [{patient, time}] — تُرفض إن تجاوزت منتصف الليل */
  function slots(baseTime, duration, picked) {
    var s = minOf(baseTime); var d = parseInt(duration, 10); if (!Number.isFinite(d) || d <= 0) d = 30;
    if (!Number.isFinite(s)) return [];
    var out = [];
    for (var i = 0; i < picked.length; i++) {
      var t = s + d * (i + 1);
      if (t + d > 1440) break;
      out.push({ patient: picked[i], time: hhmm(t) });
    }
    return out;
  }

  /* فحصٌ مسبق واحد: مواعيدُ اليوم للطبيب + الفتراتُ المغلقة ⇒ لكل فرد تعارضاتُه؛ التتابعُ نفسُه يُحسب أيضاً
     (الأفرادُ لا يتعارضون مع بعضهم لأن الأوقاتَ متتالية بلا تداخل). */
  async function precheck(base, plan, doctorId) {
    var out = { byPatient: {}, conflicting: [], error: null };
    if (!plan.length || !window.sb || !doctorId) return out;
    try {
      var rows = [], blocks = [];
      if (base.provider_id || base.operatory_id) {
        var r = await window.sb.from('appointments').select('id, patient_name, patient_id, date, time, duration, status, provider_id, operatory_id, is_planned')
          .eq('doctor_id', doctorId).eq('date', base.date);
        if (r.error) { out.error = r.error; return out; }
        rows = r.data || [];
      }
      if (window.SyDentBlocks) blocks = window.SyDentBlocks.expand(await window.SyDentBlocks.load(doctorId, base.date, base.date), base.date, base.date);
      plan.forEach(function (s) {
        var cand = { id: null, date: base.date, time: s.time, duration: base.duration, provider_id: base.provider_id || null, operatory_id: base.operatory_id || null };
        var c = window.SyDentConflict ? window.SyDentConflict.find(cand, rows) : [];
        var b = window.SyDentBlocks ? window.SyDentBlocks.blocking(blocks, cand) : [];
        out.byPatient[s.patient.id] = { conflicts: c, blocks: b, time: s.time };
        if (c.length || b.length) out.conflicting.push(s.patient.id);
      });
      return out;
    } catch (e) { out.error = e; return out; }
  }

  /* صفوفُ الأفراد من الصفّ الأساس المحفوظ — الحقولُ الجدولية فقط */
  function rows(saved, plan) {
    return plan.map(function (s) {
      return {
        doctor_id: saved.doctor_id, patient_id: s.patient.id, patient_name: s.patient.name || '',
        date: saved.date, time: s.time, duration: saved.duration || 30, type: saved.type || null,
        status: 'scheduled', notes: null, color: saved.color || null, stroke: saved.stroke || null,
        provider_id: saved.provider_id || null, operatory_id: saved.operatory_id || null,
        appointment_type_id: saved.appointment_type_id || null, is_planned: false
      };
    });
  }

  window.SyDentFamily = { members: members, slots: slots, precheck: precheck, rows: rows, hhmm: hhmm };
})();
/* SYDENT_FAMILY_END */
