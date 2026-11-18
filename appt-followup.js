/* appt-followup.js — ج2-ب-2 (طلب المالك، خطة ج1–ج3 المعتمدة 17/11/2026)
   زيارةٌ انتهت («خرج» أو «مكتمل») بلا أي علاجٍ مربوطٍ بموعدها، ومريضُها له علاجٌ «قيد الإنجاز» ⇒ سؤالٌ واحد:
   هل كانت هذه الزيارة متابعةً له؟ «نعم» = جلسةُ متابعة منجزة بيوم الموعد وطبيبه (session_followup_add — M210، بلا مال)،
   مربوطةٌ بالموعد نفسه (فلا يُسأل عنه مرةً ثانية). «لا» = لا شيء.
   مستقلٌّ عن الصفحة: يأخذ معرّفَ الموعد ويقرأ ما يحتاجه بنفسه، فالخطّافُ بكل صفحة سطرٌ واحد بعد نجاح الختم/الحفظ:
     صفحةُ المواعيد («خرج» · حفظُ «مكتمل») · لوحةُ التحكم («خرج») · بطاقةُ المريض («خرج» · حفظُ «مكتمل»).
   لا يسأل أبداً: قراءةٌ فقط (اشتراك) · حسابٌ غير نشط · موعدٌ مخطّط بلا تاريخ أو بيومٍ لم يأتِ · موعدٌ له أيُّ جلسةٍ مربوطة ·
   علاجٌ سُجّلت له متابعةٌ بيوم الموعد نفسه · سؤالٌ طُرح لهذا الموعد بهذه الصفحة. فشلُ أي قراءةٍ ⇒ صمت (لا يعيق الختم).
   ينشر 'sy:followup-added' ({ session, baseId, apptId }) لتحدّث بطاقةُ المريض جدولها. */
(function () {
  'use strict';
  if (window.SyApptFu) return;

  var asked = {};
  var QUAD = { UR: 'الربع العلوي الأيمن', UL: 'الربع العلوي الأيسر', LL: 'الربع السفلي الأيسر', LR: 'الربع السفلي الأيمن' };
  var ARCH = { U: 'الفك العلوي', L: 'الفك السفلي' };

  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function today() { return (typeof window.toDay === 'function') ? window.toDay() : ymd(new Date()); }
  function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function where(s) {
    if (!s) return '';
    if (s.tooth_num) return 'سن ' + s.tooth_num;
    if (s.quadrant && QUAD[s.quadrant]) return QUAD[s.quadrant];
    if (s.arch && ARCH[s.arch]) return ARCH[s.arch];
    return '';
  }
  function label(s) { var w = where(s); return String(s.type || 'علاج') + (w ? ' — ' + w : ''); }
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
  function blocked() {
    if (window.SyDentSub && typeof window.SyDentSub.isReadOnly === 'function' && window.SyDentSub.isReadOnly()) return true;
    if (window.SyDentLock && window.SyDentLock.isDoctorAccountInactive && window.SyDentLock.isDoctorAccountInactive()) return true;
    return false;
  }

  /* العلاجاتُ التي يمكن أن تكون هذه الزيارةُ متابعتَها — أو null إن لم يكن هناك ما يُسأل عنه */
  async function candidates(apptId) {
    var sb = window.sb;
    if (!sb || !apptId) return null;
    var ra = await sb.from('appointments').select('id, doctor_id, patient_id, date, provider_id, is_planned').eq('id', apptId).maybeSingle();
    var a = ra && !ra.error ? ra.data : null;
    if (!a || !a.patient_id || a.is_planned === true || !a.date) return null;
    var day = String(a.date).slice(0, 10);
    if (day > today()) return null;
    var rl = await sb.from('ledger_sessions').select('id').eq('doctor_id', a.doctor_id).eq('appointment_id', apptId).limit(1);
    if (!rl || rl.error || (rl.data || []).length) return null;
    var rb = await sb.from('ledger_sessions').select('id, type, tooth_num, quadrant, arch, date, provider_id, status, parent_id, followup_state')
      .eq('doctor_id', a.doctor_id).eq('patient_id', a.patient_id).eq('followup_state', 'open').is('parent_id', null).eq('status', 'completed');
    if (!rb || rb.error) return null;
    var bases = (rb.data || []).filter(function (b) { return b && b.id && !b.parent_id && b.followup_state === 'open' && (!b.date || String(b.date).slice(0, 10) <= day); });
    if (!bases.length) return null;
    var rk = await sb.from('ledger_sessions').select('parent_id').eq('doctor_id', a.doctor_id).eq('patient_id', a.patient_id).eq('date', day)
      .in('parent_id', bases.map(function (b) { return b.id; }));
    if (!rk || rk.error) return null;
    var done = {}; (rk.data || []).forEach(function (k) { if (k && k.parent_id) done[k.parent_id] = 1; });
    bases = bases.filter(function (b) { return !done[b.id]; });
    if (!bases.length) return null;
    bases.sort(function (x, y) { return String(y.date || '').localeCompare(String(x.date || '')); });
    return { appt: a, day: day, bases: bases };
  }

  async function ask(c) {
    if (c.bases.length === 1) {
      var ok = await window.SyDialog.confirm({
        title: 'زيارة متابعة؟',
        message: 'للمريض علاجٌ قيد الإنجاز: «' + label(c.bases[0]) + '».\nهل كانت هذه الزيارة متابعةً له؟ تُسجَّل جلسةَ متابعة بلا تكلفة.',
        confirmText: '🔁 سجّلها متابعة', cancelText: 'لا', danger: false
      });
      return ok ? c.bases[0] : null;
    }
    if (typeof window.SyDialog.choose !== 'function') return null;
    var i = await window.SyDialog.choose({
      title: 'زيارة متابعة؟',
      message: 'للمريض أكثر من علاجٍ قيد الإنجاز — هل كانت هذه الزيارة متابعةً لأحدها؟ تُسجَّل جلسةَ متابعة بلا تكلفة.',
      choices: c.bases.map(function (b) { return { label: String(b.type || 'علاج'), sub: [where(b), b.date ? 'منذ ' + dmy(b.date) : ''].filter(Boolean).join(' · ') }; }),
      cancelText: 'ليست متابعة'
    });
    return (typeof i === 'number' && c.bases[i]) ? c.bases[i] : null;
  }

  async function record(c, base) {
    var sb = window.sb;
    var res = await sb.rpc('session_followup_add', { p_parent: base.id, p_date: c.day, p_provider: c.appt.provider_id || null, p_step: null, p_notes: null, p_close: false });
    if (res && res.error && /followup_provider_invalid/.test(res.error.message || '')) {   /* طبيبُ موعدٍ لم يعد من أطباء العيادة ⇒ طبيبُ العلاج */
      res = await sb.rpc('session_followup_add', { p_parent: base.id, p_date: c.day, p_provider: null, p_step: null, p_notes: null, p_close: false });
    }
    if (!res || res.error || !res.data || !res.data.session) {
      console.warn('appt follow-up failed:', res && res.error);
      toast('⚠️ تعذّر تسجيل جلسة المتابعة — سجّلها من ملف المريض («＋ متابعة»)');
      return null;
    }
    var kid = res.data.session;
    var rl = await sb.from('ledger_sessions').update({ appointment_id: c.appt.id }).eq('id', kid.id).eq('doctor_id', c.appt.doctor_id);
    if (rl && !rl.error) kid.appointment_id = c.appt.id; else console.warn('appt follow-up link failed:', rl && rl.error);
    if (window.logAudit) {
      try {
        window.logAudit('session.create', {
          entityId: kid.id, patientId: c.appt.patient_id, patientName: '',
          description: 'جلسة متابعة من موعد: ' + label(base) + ' (' + c.day + ')',
          newValue: { type: kid.type, date: kid.date, parent_id: base.id, appointment_id: c.appt.id }
        });
      } catch (e) { console.warn('appt follow-up audit:', e); }
    }
    toast('✅ سُجّلت جلسة متابعة لـ «' + label(base) + '»');
    try { window.dispatchEvent(new CustomEvent('sy:followup-added', { detail: { session: kid, baseId: base.id, apptId: c.appt.id, state: res.data.state || 'open' } })); } catch (e) {}
    return { session: kid, base: base };
  }

  /* الواجهة: SyApptFu.offer(apptId) → Promise<{session, base} | null> — لا يرمي أبداً */
  async function offer(apptId) {
    try {
      if (!apptId || asked[apptId] || blocked() || !window.SyDialog) return null;
      asked[apptId] = 1;
      var c = await candidates(apptId);
      if (!c) return null;
      var base = await ask(c);
      if (!base) return null;
      return await record(c, base);
    } catch (e) {
      console.warn('SyApptFu.offer:', e);
      return null;
    }
  }

  window.SyApptFu = { offer: offer, _label: label, _where: where };
})();
