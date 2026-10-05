/* v544 — مثبتُ «مين حوّل المريض؟» (M164 + ref-pick.js + النموذجان + تقرير المرضى الجدد) — مستقل، على الملفات الحيّة.
   (١) الهجرة: العمودان · FK بـSET NULL · قيدُ 120 · حارسُ الملكية والنفس على الأحداث الصحيحة (#694);
   (٢) المنتقي (بـDOM مصطنع): القيمتان حسب المصدر · اختيارُ مريضٍ ⇒ معرّفه · الكتابةُ بعده تفكّه · «طبيب محوِّل» اسمٌ فقط ·
       غيرُهما يمسحهما · البحثُ للمالك ويستثني المريضَ نفسَه · تهريبُ ilike · القصُّ 120 · التعبئةُ من الصف;
   (٣) الربطُ بالنموذجين وعرضُ البطاقة (textContent لا innerHTML) · (٤) التقرير: مَن عرّفهم وتجميعُهم وتهريبُهم وتصديرُهم.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }

/* DOM مصطنعٌ صغير يكفي المنتقي */
function makeDom() {
  const byId = {};
  class E {
    constructor(tag) { this.tagName = tag; this.children = []; this.hidden = false; this.textContent = ''; this.value = ''; this.h = {}; this.attrs = {}; this.style = {}; this.className = ''; this._id = ''; }
    set id(v) { this._id = v; byId[v] = this; } get id() { return this._id; }
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); }
    fire(t, ev) { (this.h[t] || []).forEach(f => f(ev || { preventDefault() {}, stopPropagation() {}, key: '' })); }
    focus() {}
  }
  Object.defineProperty(E.prototype, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); if (v === '') this.children = []; }, configurable: true });
  const document = { getElementById: id => byId[id] || null, createElement: t => new E(t), head: new E('head') };
  return { document, E, byId };
}
function makeSb(rows, log) {
  function Q(t) { this.t = t; this.f = []; this.like = null; this.one = false; }
  Q.prototype.select = function () { return this; };
  Q.prototype.eq = function (k, v) { this.f.push([k, v]); return this; };
  Q.prototype.ilike = function (k, v) { this.like = v; return this; };
  Q.prototype.order = function () { return this; };
  Q.prototype.limit = function () { return this; };
  Q.prototype.maybeSingle = function () { this.one = true; return this; };
  Q.prototype.then = function (res) {
    log.push({ t: this.t, f: this.f, like: this.like });
    let out = rows.filter(r => this.f.every(([k, v]) => r[k] === v));
    if (this.like) { const needle = this.like.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1'); out = out.filter(r => r.name.indexOf(needle) > -1); }
    return Promise.resolve(this.one ? { data: out[0] || null } : { data: out }).then(res);
  };
  return { from: t => new Q(t) };
}
const tick = () => new Promise(r => setTimeout(r, 0));

async function suite(F) {
  /* (١) الهجرة */
  const M = F['migrations/164_patient_referrer.sql'];
  ok(/ADD COLUMN IF NOT EXISTS referred_by_patient_id uuid\s+REFERENCES public\.patients\(id\) ON DELETE SET NULL;/.test(M) && /ADD COLUMN IF NOT EXISTS referrer_name text;/.test(M), 'migration: both columns, the link nulls on delete');
  ok(/CHECK \(referrer_name IS NULL OR char_length\(referrer_name\) <= 120\)/.test(M), 'migration: name ≤ 120');
  ok(/IF NEW\.referred_by_patient_id = NEW\.id THEN\s+RAISE EXCEPTION 'referrer_self'/.test(M)
     && /WHERE p\.id = NEW\.referred_by_patient_id AND p\.doctor_id = NEW\.doctor_id\) THEN\s+RAISE EXCEPTION 'referrer_not_owned' USING ERRCODE = '42501'/.test(M), 'migration: guard refuses self and another owner\'s patient (#694)');
  ok(/BEFORE INSERT OR UPDATE OF referred_by_patient_id, doctor_id ON public\.patients/.test(M) && !/SECURITY DEFINER/.test(M), 'migration: guard on insert and on both columns, invoker rights (RLS-invisible = absent)');

  /* (٢) المنتقي */
  const D = makeDom(), log = [];
  const rows = [{ id: 'me', name: 'سامر خليل', local_id: 'P001', doctor_id: 'own' }, { id: 'x1', name: 'سامر_100%', local_id: 'P002', doctor_id: 'own' },
    { id: 'x2', name: 'سامر آخر', local_id: 'P003', doctor_id: 'other' }, { id: 'x3', name: 'ريم', local_id: 'P004', doctor_id: 'own' }];
  const ctx = { document: D.document, console: { warn() {} }, setTimeout: (f) => { f(); return 1; }, clearTimeout() {}, Promise, String };
  ctx.window = ctx; ctx.sb = makeSb(rows, log);
  vm.createContext(ctx);
  try { vm.runInContext(F['ref-pick.js'], ctx); } catch (e) { ok(false, 'ref-pick throws: ' + e.message); return; }
  const RP = ctx.SyRefPick;
  const holder = new D.E('div'), sel = new D.E('select'); sel.id = 'fSource'; holder.appendChild(sel);
  const ctl = RP.mount('fSource', { ownerId: () => 'own', selfId: () => 'me' });
  const inp = D.byId['fSourceRef'], box = holder.children[1];
  ok(ctl && inp && box && box.hidden === true, 'mount: a detail field after the source, hidden for no source');
  sel.value = 'friend'; sel.fire('change');
  ok(box.hidden === false && /مين عرّفه/.test(box.children[0].textContent), 'friend ⇒ «مين عرّفه علينا؟»');
  inp.value = '  أبو   علي  '; inp.fire('input');
  await tick(); await tick();
  ok(JSON.stringify(ctl.value()) === JSON.stringify({ referred_by_patient_id: null, referrer_name: 'أبو علي' }), 'friend + typed name ⇒ free name, spaces collapsed');
  inp.value = 'سامر'; inp.fire('input'); await tick(); await tick();
  const q = log[log.length - 1], sug = box.children[1].children[1];
  ok(q && q.t === 'patients' && q.f.some(([k, v]) => k === 'doctor_id' && v === 'own') && q.like === '%سامر%', 'search: patients of this owner only, contains-match');
  const opts = sug.children.map(b => b.children[0].textContent);
  ok(opts.indexOf('سامر خليل') === -1 && opts.indexOf('سامر آخر') === -1 && opts.indexOf('سامر_100%') > -1 && sug.hidden === false, 'suggestions: self excluded, another owner\'s patient never offered');
  sug.children[0].fire('click');
  ok(JSON.stringify(ctl.value()) === JSON.stringify({ referred_by_patient_id: 'x1', referrer_name: null }) && box.children[2].hidden === false, 'picking a patient ⇒ its id, badge shown');
  inp.value = 'سامر_100% '; inp.fire('input'); await tick();
  ok(ctl.value().referred_by_patient_id === null && ctl.value().referrer_name === 'سامر_100%', 'typing after a pick unlinks it (becomes a free name)');
  ok(RP.likeEsc('a%b_c\\d') === 'a\\%b\\_c\\\\d', 'ilike: % _ \\ are literal');
  sug.children.length = 0; inp.value = 'سامر_1'; inp.fire('input'); await tick(); await tick();
  ok(log[log.length - 1].like === '%سامر\\_1%', 'search escapes the typed text');
  sel.value = 'doctor_referral'; sel.fire('change');
  inp.value = 'د. نبيل'; inp.fire('input'); await tick();
  ok(JSON.stringify(ctl.value()) === JSON.stringify({ referred_by_patient_id: null, referrer_name: 'د. نبيل' }) && /الطبيب المحوِّل/.test(box.children[0].textContent), 'doctor referral ⇒ a name only');
  sel.value = 'social'; sel.fire('change');
  ok(box.hidden === true && JSON.stringify(ctl.value()) === JSON.stringify({ referred_by_patient_id: null, referrer_name: null }), 'any other source clears both on save');
  ok(RP.clean('x'.repeat(130)).length === 120 && RP.clean('   ') === null, 'names cut at 120, empty ⇒ null');
  sel.value = 'friend';
  ctl.set({ referral_source: 'friend', referred_by_patient_id: 'x3', referrer_name: null });
  await tick(); await tick();
  ok(ctl.value().referred_by_patient_id === 'x3' && inp.value === 'ريم' && /ريم/.test(box.children[2].children[0].textContent), 'edit form filled from the row (linked patient named from the database)');
  ctl.reset();
  ok(inp.value === '' && ctl.value().referred_by_patient_id === null, 'reset clears');
  sel.value = 'doctor_referral';
  ctl.set({ referral_source: 'doctor_referral', referred_by_patient_id: 'x3', referrer_name: 'د. سمير' });
  await tick(); await tick();
  ok(ctl.value().referred_by_patient_id === null, 'a doctor referral never saves a linked patient, even from an inconsistent row');

  /* (٣) الربط */
  const P = F['patients.html'], PP = F['patient-profile.html'];
  [['patients.html', P], ['patient-profile.html', PP]].forEach(([f, S]) => {
    const iS = S.indexOf('<script src="sidebar.js?v='), iR = S.indexOf('<script src="ref-pick.js?v=');
    ok(iR > iS && (S.match(/ref-pick\.js\?v=/g) || []).length === 1, f + ': ref-pick.js loaded once');
  });
  ok(/_refPickAdd = window\.SyRefPick\.mount\('fSource', \{ ownerId: function\(\)\{ return currentUser\.id; \}, selfId: function\(\)\{ return null; \} \}\);/.test(P) && /if \(_refPickAdd\) _refPickAdd\.reset\(\);/.test(P), 'add form: mounted once, reset on every open');
  ok(/if \(_refPickAdd\) Object\.assign\(insPayload, _refPickAdd\.value\(\)\);/.test(P), 'add form: the two values go into the insert');
  ok(/selfId: function\(\)\{ return patientId; \} \}\);\n  if \(_refPickEdit\) _refPickEdit\.set\(patient\);/.test(PP) && /if \(_refPickEdit\) Object\.assign\(updates, _refPickEdit\.value\(\)\);/.test(PP), 'edit form: excludes the patient itself, filled from the row, saved with the update');
  ok((P.match(/referrer_not_owned\|referrer_self/g) || []).length === 1 && (PP.match(/referrer_not_owned\|referrer_self/g) || []).length === 1, 'the guard\'s refusal becomes a clear message in both forms');
  const rsi = fnSrc(PP, 'function renderSourceInfo() {');
  ok(/a\.textContent = n \|\| 'مريض';/.test(rsi) && !/innerHTML/.test(rsi) && /encodeURIComponent\(rid\)/.test(rsi) && /patient\.referred_by_patient_id !== rid/.test(rsi), 'profile shows «المصدر — المُعرِّف» by textContent, links the referrer, ignores a stale answer');
  ok((F['scripts/cache-bust.sh'].match(/ref-pick/g) || []).length === 3, 'cache-bust: ref-pick.js in the fleet allow-list');

  /* (٤) التقرير */
  const rc = { console: { warn() {} }, encodeURIComponent };
  vm.createContext(rc); vm.runInContext('var window = this;', rc);
  vm.runInContext(F['rpt-treat.js'] + '\n' + F['rpt-newpt.js'], rc);
  const N = rc.SyRptNew;
  const S = (id, pid, date, extra) => Object.assign({ id, patient_id: pid, date, status: 'completed', cost: 100, currency: 'SYP', provider_id: 'd1', type: 'حشوة' }, extra);
  const period = [S('1', 'a', '2026-09-02'), S('2', 'b', '2026-09-03', { cost: 50 }), S('3', 'c', '2026-09-04'), S('4', 'd', '2026-09-05'), S('5', 'e', '2026-09-06')];
  const PT = { a: { name: 'أ', referral_source: 'friend', referred_by_patient_id: 'old' }, b: { name: 'ب', referral_source: 'friend', referred_by_patient_id: 'old' },
    c: { name: 'ج', referral_source: 'doctor_referral', referrer_name: ' د.   نبيل ' }, d: { name: 'د', referral_source: 'doctor_referral', referrer_name: 'د. نبيل' },
    e: { name: 'ه', referral_source: 'friend', referrer_name: '<img src=x>' }, old: { name: 'قديم <b>x</b>' } };
  const m = N.compute({ from: '2026-09-01', to: '2026-09-30', prior: [], period, scoped: period, patients: PT, clinicScope: true });
  const pr = m.referrers.find(r => r.kind === 'patient'), dr = m.referrers.find(r => r.kind === 'doctor'), nr = m.referrers.find(r => r.kind === 'name');
  ok(pr && pr.id === 'old' && pr.n === 2 && pr.bag.SYP === 150 && pr.name === 'قديم <b>x</b>', 'referrers: a patient who referred two, with their production');
  ok(dr && dr.n === 2 && dr.name === 'د. نبيل' && nr && nr.n === 1, 'referrers: doctor names grouped after trimming; other free names apart');
  ok(m.list.find(r => r.id === 'c').ref.kind === 'doctor' && m.list.find(r => r.id === 'a').ref.kind === 'patient', 'each new patient carries its referrer');
  const html = N.render(m, { bag: b => String(b.SYP), doc: () => '' });
  ok(/مين عرّفهم علينا؟/.test(html) && /href="patient-profile\.html\?id=old"><b>قديم &lt;b&gt;x&lt;\/b&gt;<\/b><small>عرّف مريضان · إنتاجهم 150/.test(html), 'render: referring patient links to the profile, escaped');
  ok(html.indexOf('<img src=x>') === -1 && /&lt;img src=x&gt;/.test(html), 'render: free names escaped');
  const PR = F['provider-reports.html'];
  ok(/select\('id,name,referral_source,created_at,referred_by_patient_id,referrer_name'\)/.test(fnSrc(PR, 'async function _newFetchPatients(ids) {')), 'report loads the two columns');
  ok(/var refIds = Object\.keys\(d\.patients\)/.test(fnSrc(PR, 'async function loadNewData(key) {')) && /_newFetchPatients\(refIds\)/.test(PR), 'referring patients are named even when they are not new');
  ok(/'المُعرِّف'\]\];/.test(fnSrc(PR, 'function buildNewRows() {')) && /m\.referrers\.forEach/.test(fnSrc(PR, 'function buildNewRows() {')), 'Excel carries the referrer and the referrers table');
}

const FILES = ['migrations/164_patient_referrer.sql', 'ref-pick.js', 'patients.html', 'patient-profile.html', 'rpt-treat.js', 'rpt-newpt.js', 'provider-reports.html', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['guard without the self check', rep('migrations/164_patient_referrer.sql', "RAISE EXCEPTION 'referrer_self'", "RAISE NOTICE 'referrer_self'")],
  ['doctor referral keeps a linked patient', rep('ref-pick.js', "if (v === DOCTOR) return { referred_by_patient_id: null, referrer_name: clean(inp.value) };", "if (v === DOCTOR) return { referred_by_patient_id: st.pid, referrer_name: clean(inp.value) };")],
  ['other sources keep a stale name', rep('ref-pick.js', "        return { referred_by_patient_id: null, referrer_name: null };\n      },", "        return { referred_by_patient_id: null, referrer_name: clean(inp.value) };\n      },")],
  ['self offered as referrer', rep('ref-pick.js', "var rows = ((r && r.data) || []).filter(function (p) { return p.id !== self; });", "var rows = ((r && r.data) || []);")],
  ['search not scoped to the owner', rep('ref-pick.js', ".eq('doctor_id', opts.ownerId()).ilike(", ".ilike(")],
  ['ilike not escaped', rep('ref-pick.js', "ilike('name', '%' + likeEsc(q) + '%')", "ilike('name', '%' + q + '%')")],
  ['typing keeps the link', rep('ref-pick.js', "if (st.pid && inp.value !== st.pname) { st.pid = null; st.pname = ''; showPicked(); }", '')],
  ['no length cut', rep('ref-pick.js', 'return s ? s.slice(0, MAX) : null;', 'return s ? s : null;')],
  ['edit form not saved', rep('patient-profile.html', "  if (_refPickEdit) Object.assign(updates, _refPickEdit.value());   /* M164: مين حوّله */\n", '')],
  ['profile renders the name as HTML', rep('patient-profile.html', "a.textContent = n || 'مريض';", "a.innerHTML = n || 'مريض';")],
  ['every free name counted as a doctor', rep('rpt-newpt.js', "return { kind: srcKey(p.referral_source) === 'doctor_referral' ? 'doctor' : 'name', id: null, name: nm };", "return { kind: 'doctor', id: null, name: nm };")],
  ['referrer name unescaped in the report', rep('rpt-newpt.js', "var inner = '<b>' + esc(r.name) + '</b>", "var inner = '<b>' + r.name + '</b>")]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0;
      const log = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = log;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-rpt-ref: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-rpt-ref: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
