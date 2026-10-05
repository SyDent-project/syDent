/* SYDENT_REF_PICK_START — «مين حوّل المريض؟» (M164 · v544) — مصدرٌ واحد لنموذجي إضافة المريض وتعديله
   ─────────────────────────────────────────────────────────────
   تحت «كيف سمع عنّا؟» يظهر حقلٌ حسب المصدر:
     • «صديق / قريب»  ⇒ «مين عرّفه علينا؟» — بحثٌ بمرضى العيادة (اختيارٌ ⇒ referred_by_patient_id)،
                          أو اسمٌ حرّ إن لم يكن مريضاً (⇒ referrer_name).
     • «طبيب محوِّل»   ⇒ «اسم الطبيب المحوِّل» (⇒ referrer_name).
     • غيرهما          ⇒ لا حقل، والقيمتان تُمسحان عند الحفظ (لا بقايا من مصدرٍ سابق).
   الملكيةُ تُفرض بالقاعدة (trg_patients_referrer_guard — #694)، والبحثُ مقيّدٌ بالمالك ويستثني المريضَ نفسَه.
   الاسمُ ≤120 حرفاً (قيد M164). كلُّ نصٍّ يُكتب بـtextContent — صفرُ سطح XSS. صفرُ منطقٍ مالي.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SyRefPick) return;
  var MAX = 120, FRIEND = 'friend', DOCTOR = 'doctor_referral';

  function css() {
    if (document.getElementById('syRefPickCss')) return;
    var st = document.createElement('style');
    st.id = 'syRefPickCss';
    st.textContent = '.rp-box{margin-top:8px;}'
      + '.rp-lbl{display:block;font-size:12px;color:var(--text2);margin-bottom:4px;}'
      + '.rp-wrap{position:relative;}'
      + '.rp-sug{position:absolute;inset-inline:0;top:calc(100% + 4px);z-index:60;background:var(--bg2);border:1px solid var(--border);'
      + 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:240px;overflow:auto;}'
      + '.rp-opt{display:flex;justify-content:space-between;gap:8px;width:100%;background:transparent;border:0;border-bottom:1px solid var(--border);'
      + 'padding:9px 12px;font-family:inherit;font-size:13px;color:var(--text);text-align:right;cursor:pointer;}'
      + '.rp-opt:last-child{border-bottom:0;}.rp-opt:hover,.rp-opt:focus{background:rgba(var(--green-rgb),.08);outline:none;}'
      + '.rp-opt small{color:var(--text2);font-size:11px;}'
      + '.rp-hint{font-size:11px;color:var(--text2);margin-top:4px;}'
      + '.rp-picked{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--green);}'
      + '.rp-picked button{background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text2);cursor:pointer;padding:1px 8px;font-family:inherit;}';
    document.head.appendChild(st);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  /* ‎%‎ و‎_‎ و‎\‎ حرفيّة داخل ilike */
  function likeEsc(q) { return String(q).replace(/[\\%_]/g, function (c) { return '\\' + c; }); }
  function clean(t) { var s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return s ? s.slice(0, MAX) : null; }

  var nameCache = {};
  function nameOf(pid) {
    if (!pid) return Promise.resolve('');
    if (!nameCache[pid]) {
      nameCache[pid] = Promise.resolve(window.sb.from('patients').select('id,name').eq('id', pid).maybeSingle())
        .then(function (r) { return (r && r.data && r.data.name) || ''; }, function () { delete nameCache[pid]; return ''; });
    }
    return nameCache[pid];
  }

  /* opts: { ownerId()→uuid, selfId()→uuid|null } */
  function mount(selectId, opts) {
    var sel = document.getElementById(selectId);
    if (!sel) return null;
    css();
    opts = opts || {};
    var st = { pid: null, pname: '', seq: 0, t: null };
    var box = el('div', 'rp-box'); box.hidden = true; box.setAttribute('data-rp-for', selectId);
    var lbl = el('label', 'rp-lbl');
    var wrap = el('div', 'rp-wrap');
    var inp = el('input'); inp.type = 'text'; inp.maxLength = MAX; inp.autocomplete = 'off'; inp.id = selectId + 'Ref';
    lbl.htmlFor = inp.id;
    var sug = el('div', 'rp-sug'); sug.hidden = true; sug.setAttribute('role', 'listbox');
    var picked = el('div', 'rp-picked'); picked.hidden = true;
    var pickedTxt = el('span'), unpick = el('button', null, '✕'); unpick.type = 'button'; unpick.setAttribute('aria-label', 'إلغاء الاختيار');
    picked.appendChild(pickedTxt); picked.appendChild(unpick);
    var hint = el('div', 'rp-hint');
    wrap.appendChild(inp); wrap.appendChild(sug);
    box.appendChild(lbl); box.appendChild(wrap); box.appendChild(picked); box.appendChild(hint);
    sel.parentNode.appendChild(box);

    function showPicked() {
      picked.hidden = !st.pid;
      pickedTxt.textContent = st.pid ? '✓ مريضٌ بالعيادة: ' + (st.pname || '—') : '';
    }
    function sync() {
      var v = sel.value;
      box.hidden = !(v === FRIEND || v === DOCTOR);
      sug.hidden = true;
      if (v === FRIEND) {
        lbl.textContent = 'مين عرّفه علينا؟ (اختياري)';
        inp.placeholder = 'اكتب اسم مريضٍ من مرضاك أو أي اسم';
        hint.textContent = 'اختيارُ مريضٍ من القائمة يربطه به في تقرير المرضى الجدد.';
      } else if (v === DOCTOR) {
        lbl.textContent = 'اسم الطبيب المحوِّل (اختياري)';
        inp.placeholder = 'د. …';
        hint.textContent = '';
        if (st.pid) { st.pid = null; st.pname = ''; showPicked(); }
      }
    }
    function pick(id, name) {
      st.pid = id; st.pname = name || '';
      inp.value = st.pname;
      sug.hidden = true;
      showPicked();
    }
    async function search() {
      var q = inp.value.replace(/\s+/g, ' ').trim(), my = ++st.seq;
      if (sel.value !== FRIEND || q.length < 2 || !window.sb) { sug.hidden = true; return; }
      var r;
      try {
        r = await window.sb.from('patients').select('id,name,local_id')
          .eq('doctor_id', opts.ownerId()).ilike('name', '%' + likeEsc(q) + '%').order('name').limit(8);
      } catch (e) { r = { error: e }; }
      if (my !== st.seq) return;
      var self = opts.selfId ? opts.selfId() : null;
      var rows = ((r && r.data) || []).filter(function (p) { return p.id !== self; });
      sug.textContent = '';
      rows.forEach(function (p) {
        var b = el('button', 'rp-opt'); b.type = 'button'; b.setAttribute('role', 'option');
        b.appendChild(el('span', null, p.name || '—'));
        if (p.local_id) b.appendChild(el('small', null, p.local_id));
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { pick(p.id, p.name); });
        sug.appendChild(b);
      });
      sug.hidden = !rows.length;
      /* داخل نافذةٍ تتمرّر على الهاتف: القائمةُ تُجلب للرؤية كي لا تختبئ تحت أزرار الحفظ */
      if (rows.length && sug.scrollIntoView) { try { sug.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    }
    sel.addEventListener('change', sync);
    inp.addEventListener('input', function () {
      if (st.pid && inp.value !== st.pname) { st.pid = null; st.pname = ''; showPicked(); }
      clearTimeout(st.t); st.t = setTimeout(search, 250);
    });
    inp.addEventListener('blur', function () { setTimeout(function () { sug.hidden = true; }, 150); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sug.hidden) { e.stopPropagation(); sug.hidden = true; } });
    unpick.addEventListener('click', function () { st.pid = null; st.pname = ''; inp.value = ''; showPicked(); inp.focus(); });

    var ctl = {
      /* القيمتان للحفظ حسب المصدر الحالي — المصدرُ غيرُهما يمسحهما */
      value: function () {
        var v = sel.value;
        if (v === FRIEND) return st.pid ? { referred_by_patient_id: st.pid, referrer_name: null } : { referred_by_patient_id: null, referrer_name: clean(inp.value) };
        if (v === DOCTOR) return { referred_by_patient_id: null, referrer_name: clean(inp.value) };
        return { referred_by_patient_id: null, referrer_name: null };
      },
      /* تعبئةُ نموذج التعديل من صفّ المريض */
      set: function (row) {
        row = row || {};
        st.seq++; st.pid = null; st.pname = ''; inp.value = row.referrer_name || '';
        sync(); showPicked();
        if (row.referred_by_patient_id) {
          st.pid = row.referred_by_patient_id;
          var id = st.pid;
          nameOf(id).then(function (n) { if (st.pid === id) { st.pname = n; inp.value = n; showPicked(); } });
        }
      },
      reset: function () { ctl.set({}); }
    };
    sync();
    return ctl;
  }

  window.SyRefPick = { mount: mount, nameOf: nameOf, clean: clean, likeEsc: likeEsc, MAX: MAX };
})();
/* SYDENT_REF_PICK_END */
